// check-rows.mjs — 校验 preset-rows.js 里每个插件行在宿主 app.asar 里真实存在。
//
// 为什么：preset 现在由 bundle patch 声明，`@deepseek-ai/dsh-agent-preset` 会逐行挂载
// `config.plugins`。任何一行包名不存在，整个 preset 激活失败 → 「破甲模式」不出现，
// 而其它插件的自检全绿（它们看不到 preset 的加载结果）。
//
// 用法：node tools/check-rows.mjs [app.asar 路径]

import { readFileSync } from "node:fs";

const archive =
  process.argv[2] ||
  "C:\\Users\\Administrator\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar";

const buf = readFileSync(archive);
const jsonStart = buf.indexOf(0x7b, 8);
let depth = 0;
let inStr = false;
let esc = false;
let jsonEnd = -1;
for (let i = jsonStart; i < buf.length; i++) {
  const c = buf[i];
  if (inStr) {
    if (esc) esc = false;
    else if (c === 0x5c) esc = true;
    else if (c === 0x22) inStr = false;
    continue;
  }
  if (c === 0x22) inStr = true;
  else if (c === 0x7b) depth++;
  else if (c === 0x7d) {
    depth--;
    if (depth === 0) {
      jsonEnd = i + 1;
      break;
    }
  }
}
const header = JSON.parse(buf.slice(jsonStart, jsonEnd).toString("utf8"));

const paths = new Set();
(function walk(node, prefix) {
  for (const [key, value] of Object.entries(node.files || {})) {
    const next = prefix ? prefix + "/" + key : key;
    if (value.files) walk(value, next);
    else paths.add(next);
  }
})(header, "");

const { ROWS } = await import(new URL("../preset-rows.js", import.meta.url));

const packageOf = (name) => {
  // 支持 "@scope/pkg/sub/path"、"pkg/sub" 与相对路径三种写法
  if (name.startsWith(".") || name.startsWith("/") || name.includes("\\")) return name;
  const parts = name.split("/");
  return name.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};

const seen = new Map();
const checkName = (name) => {
  const pkg = packageOf(name);
  if (pkg.startsWith("cordis:")) return;
  if (pkg === "dsh-armor-gen5" || pkg.includes("dsh-armor-gen5")) return; // 本包，自己就在磁盘上
  if (seen.has(pkg)) return;
  const manifest = "dsh/node_modules/" + pkg + "/package.json";
  seen.set(pkg, paths.has(manifest));
};
const walkRow = (row) => {
  if (!row || typeof row !== "object") return;
  if (typeof row.name === "string") checkName(row.name);
  // group 行的 config 是子行数组：必须一起校验，否则 preset 里最里层的包漏检
  if (Array.isArray(row.config)) for (const child of row.config) walkRow(child);
};
for (const row of ROWS) walkRow(row);

const missing = [...seen.entries()].filter(([, ok]) => !ok).map(([pkg]) => pkg);
const total = seen.size;
for (const [pkg, ok] of seen) console.log((ok ? "OK    " : "MISS  ") + pkg);
console.log("");
console.log("packages: " + total + ", missing: " + missing.length);
if (missing.length > 0) {
  console.log("MISSING: " + missing.join(", "));
  process.exit(1);
}
