// gen-bundle-patch.mjs — 从 preset-rows.js 生成补丁内容。
//
// 两种产物：
//   node tools/gen-bundle-patch.mjs                    → cordis.patch.yml（插件本体行）
//   node tools/gen-bundle-patch.mjs --print-preset      → 打印 preset 声明块（供 profile patch 使用）
//
// 为什么预设要写进 profile patch，而不是插件的 bundle patch：
//   agent-preset-registry 位于 web-app bundle 的 entry-local realm，插件自己的 bundle patch
//   先于 profile patch 合并，落点看不到那个 realm（dsh-web-app patch 注释：
//   "invisible to every sibling row outside that realm"）。用同一个 id 在 bundle patch 里声明
//   实测不会出现在预设列表；profile patch 是叠加到 root 的最后一份。
//
// 用法：
//   node tools/gen-bundle-patch.mjs --check

import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const { ROWS } = await import(new URL("../preset-rows.js", import.meta.url));
const { name: pkgName, version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const PRESET = {
  id: "armor",
  name: "破甲模式",
  order: 5,
  description:
    "无限五代破甲：首字门 + 回归测试语境 + 思考槽封口 + 反制路由 + W5 自我锚定 + T4 证据链预热（" +
    pkgName +
    " " +
    version +
    "）",
};

const q = (value) => JSON.stringify(value);

// persona.prefix 用「身份层声明」原文（与 index.js 注入的 ARMOR_PERSONA_PREFIX 同源）。
// 不要往这里塞破甲核：preset 的 persona 段会遮蔽常驻实例注入的同名段，
// 塞半截破甲核会把身份声明挤掉，实测表现为「破甲能力明显变弱」。
const ARMOR_PREFIX = readFileSync(new URL("../prompts/armor-persona-prefix.md", import.meta.url), "utf8").trim();
const ARMOR_CORE = ARMOR_PREFIX;
// 与官方 standard.patch.yml 逐行对齐：多挂 root 里已启用的插件（list-agents / ralph）
// 会在 preset 的新 scope 里撞工具名 → tree.root.update() 抛错 → 整个 preset 激活失败。
const DROP_ROWS = new Set(["armor-gen5", "tool-subagent-list-agents", "tool-ralph", "tool-bash"]);
const PRESET_ROWS = ROWS.filter((row) => !DROP_ROWS.has(row.id)).map((row) => {
  if (row.id !== "persona" || !row.config) return row;
  return { ...row, config: { ...row.config, prefix: ARMOR_CORE + "\n\n" + String(row.config.prefix || "") } };
});
// 深拷贝后剔除 delegation group 内的 list-agents / ralph 子行
for (const row of PRESET_ROWS) {
  if (Array.isArray(row.config)) {
    row.config = [...row.config].filter((child) => !DROP_ROWS.has(child.id));
  }
}

function presetBlock(indent) {
  const pad = " ".repeat(indent);
  const lines = [
    pad + "- id: preset-armor",
    pad + "  name: '@deepseek-ai/dsh-agent-preset'",
    pad + "  config:",
    pad + "    id: " + q(PRESET.id),
    pad + "    name: " + q(PRESET.name),
    pad + "    order: " + PRESET.order,
    pad + "    description: " + q(PRESET.description),
    pad + "    plugins:",
  ];
  for (const row of PRESET_ROWS) lines.push(pad + "      - " + JSON.stringify(row));
  // 自家插件必须挂进 preset：只有 preset 内的实例负责 local 模式的完整核 + W5 + T4。
  // 包名与相对路径都解析不到（preset realm 的 baseUrl 在 asar 内），
  // 改用官方支持的表达式 tag：app-boot 把 !!js 解析成 { __jsExpr }，dshHomePath
  // 由 root 层 ctx.provide 提供、preset scope 继承。
  lines.push(pad + "      - id: armor-gen5");
  lines.push(pad + "        name: './armor-kernel/index.js'");
  lines.push(pad + "        config:");
  lines.push(pad + "          mode: armor");
  lines.push(pad + "          via: preset");
  return lines.join("\n");
}

if (process.argv.includes("--print-preset")) {
  console.log("- insert:");
  console.log(presetBlock(4));
  process.exit(0);
}

const lines = [
  "# dsh-armor-gen5 bundle patch",
  "#",
  "# 只挂插件本体（server + client 半体）。",
  "# 「破甲模式」预设由 profile patch 声明（node tools/gen-bundle-patch.mjs --print-preset 输出）：",
  "# agent-preset-registry 在 web-app 的 entry-local realm 内，bundle 层的 sibling 行看不到它。",
  "#",
  "# 本文件由 tools/gen-bundle-patch.mjs 生成，勿手改。",
  "- insert:",
  "    - id: dsh-armor-gen5",
  "      name: dsh-armor-gen5",
];

const text = lines.join("\n") + "\n";
const target = new URL("../cordis.patch.yml", import.meta.url);

if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
  const same = current === text;
  console.log(same ? "cordis.patch.yml 已是最新（仅插件本体行）" : "cordis.patch.yml 需重新生成");
  process.exit(same ? 0 : 1);
}

writeFileSync(target, text);
console.log("wrote cordis.patch.yml — plugin-only row (" + text.length + " bytes)");
