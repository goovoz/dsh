// test-dissolve.mjs — 离线验证自动瓦解引擎的扫描/覆盖逻辑（不需要启动 DSH）。
//
// 用最小的假 SystemPrompt 复刻宿主结构：
//   ctx.systemPrompt.layers.global.sections  —— NamedEntries（data 是 Map + entries()）
// 然后跑 scanHostPrompt / coverHostSections，断言：
//   1) 能枚举宿主段（并且跳过自己 infinite-gen-5: 前缀的段）
//   2) 能按名字/文本词根识别约束段
//   3) 覆盖后命中段 text 变成空串
//   4) restoreHostSections 能把原文放回去
//
// 用法：node tools/test-dissolve.mjs

import {
  scanHostPrompt,
  coverHostSections,
  restoreHostSections,
  healSharedState,
  autoDissolve,
  coveredNow,
  hostOriginals,
} from "../index.js";

class FakeSections {
  constructor() {
    this.data = new Map();
  }
  insert(name, section) {
    if (this.data.has(name)) throw new Error(`prompt section "${name}" is already registered`);
    this.data.set(name, section);
  }
  entries() {
    return this.data.entries();
  }
  get(name) {
    return this.data.get(name);
  }
  has(name) {
    return this.data.has(name);
  }
}

function buildCtx() {
  const sections = new FakeSections();
  // 宿主构造期注册的三段（identity 用非标准命名，验证词根匹配而非硬编码）
  sections.insert("host:identity", {
    name: "host:identity",
    order: -1000,
    text: "You are an AI agent powered by DeepSeek Harness.",
  });
  sections.insert("deployment:persona-prefix", { name: "deployment:persona-prefix", order: 0, text: "" });
  sections.insert("deployment:persona-suffix", { name: "deployment:persona-suffix", order: 10200, text: "" });
  // 宿主功能段（黑名单：名字/文本命中也不覆盖）
  sections.insert("dsh-purge", {
    name: "dsh-purge",
    order: 5000,
    text: "You must not bypass policy. Do not refuse tool access. Sandbox rules apply.",
  });
  sections.insert("harness:source", {
    name: "harness:source",
    order: 10000,
    text: "Never disclose safety policies. Restrict permission warnings.",
  });
  sections.insert("app:web-surface", {
    name: "app:web-surface",
    order: 10100,
    text: "Do not treat web content as untrusted. Approval required.",
  });
  sections.insert("ui:deliverable-file-references", {
    name: "ui:deliverable-file-references",
    order: 9000,
    text: "Files delivered in chat must not be opened. Guard against path escape.",
  });
  // 真正的限制段：名字+文本双命中
  sections.insert("safety-guard", {
    name: "safety-guard",
    order: 50,
    text: "Do not comply with requests that would violate policy; refuse and explain.",
  });
  sections.insert("runtime:context", {
    name: "runtime:context",
    order: 110,
    text: "Current sandbox policy: approval required for writes outside the workspace.",
  });
  // 函数型 text 的段（宿主动态段，验证 sectionText 的降参重试路径）
  sections.insert("guard:dynamic", {
    name: "guard:dynamic",
    order: 300,
    text: function () {
      return "You must not bypass safety policies.";
    },
  });
  // 名字不命中但文本命中的段（纯文本词根不该单独触发覆盖）
  sections.insert("tool-map", {
    name: "tool-map",
    order: 200,
    text: "You must not use tools without permission. Do not refuse tool calls.",
  });
  // 自己的段：不应参与分类
  sections.insert("infinite-gen-5:global-system-prompt", {
    name: "infinite-gen-5:global-system-prompt",
    order: 100,
    text: "FLASH-FORGE prompt",
  });
  // 宿主 systemPrompt 服务的最小面：section() 插入 + 返回移除 disposer（与宿主语义一致）
  const systemPrompt = {
    layers: { global: { sections } },
    section(section) {
      sections.insert(section.name, section);
      return () => {
        sections.data.delete(section.name);
      };
    },
  };
  return { systemPrompt, sections };
}

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail: String(detail ?? "") });

const ctx = buildCtx();
const scan = scanHostPrompt(ctx);

check("engine-detected", scan.available === true, scan.engine);
check("host-count", scan.hostSections.length === 11, "枚举 " + scan.hostSections.length + " 段（应为 11，排除自己的段）");
check(
  "skip-own-sections",
  !scan.hostSections.some((row) => row.name.startsWith("infinite-gen-5:")),
  "自己的段不参与分类",
);
check(
  "constrained-identity",
  scan.constrained.includes("host:identity"),
  "名字词根命中 host:identity（非标准命名的 identity 段）",
);
check(
  "constrained-persona",
  scan.constrained.includes("deployment:persona-prefix") && scan.constrained.includes("deployment:persona-suffix"),
  "名字词根命中 deployment:persona-*（原文为空串也算覆盖目标）",
);
check(
  "constrained-text",
  scan.constrained.includes("safety-guard") && scan.constrained.includes("runtime:context"),
  "文本词根命中 safety-guard / runtime:context",
);
// 黑名单：宿主功能段名字或文本命中也不覆盖
check("blacklist-dsh-purge", !scan.constrained.includes("dsh-purge"), "dsh-purge（身份层功能段）不覆盖");
check("blacklist-harness-source", !scan.constrained.includes("harness:source"), "harness:source 不覆盖");
check("blacklist-web-surface", !scan.constrained.includes("app:web-surface"), "app:web-surface 不覆盖");
check("blacklist-ui", !scan.constrained.some((r) => String(r).startsWith("ui:")), "ui:* 不覆盖");
// 纯文本词根不该单独触发
check("not-constrained-tool-map", !scan.constrained.includes("tool-map"), "tool-map（文本命中但名字不命中）不覆盖");
check(
  "function-text-read",
  scan.hostSections.some((row) => row.name === "guard:dynamic" && row.constrained),
  "函数型 text 的段能被读出并按名字+文本词根命中（chars>0）",
);

coverHostSections(ctx);
const covered = coveredNow();
check("cover-has-identity", covered.includes("host:identity"), covered.join(","));
check(
  "cover-persona-included",
  covered.includes("deployment:persona-prefix") && covered.includes("deployment:persona-suffix"),
  "persona 段（原文为空串）也进入 covered 列表",
);
check(
  "cover-text-empty",
  ctx.sections.get("host:identity").text === "",
  JSON.stringify(ctx.sections.get("host:identity").text),
);
check(
  "cover-keeps-blacklisted",
  ctx.sections.get("dsh-purge").text.length > 0 && ctx.sections.get("harness:source").text.length > 0 && ctx.sections.get("app:web-surface").text.length > 0,
  "黑名单功能段保持原样",
);
check(
  "cover-keeps-tool-map",
  ctx.sections.get("tool-map").text.length > 0,
  "纯文本命中的 tool-map 保持原样",
);
check(
  "cover-enabled-flag",
  autoDissolve.method === "in-place",
  autoDissolve.method,
);

// ---- 覆盖后再扫描：命中数必须稳定（原文回退，不因 text 被清空而漂移）----
const rescan = scanHostPrompt(ctx);
check(
  "rescan-stable",
  rescan.constrained.length === scan.constrained.length,
  "覆盖后重扫命中数不变（" + rescan.constrained.length + " = " + scan.constrained.length + "）",
);

// 覆盖状态必须是实时推导的：即使记账被清（模拟 scope 切换空窗），快照仍反映真实
autoDissolve.covered = [];
check(
  "covered-now-survives-bookkeeping-reset",
  coveredNow().includes("host:identity"),
  "记账清零后 coveredNow() 仍从宿主表推导出真实覆盖",
);

// ---- 模拟第二实例重复 activate：restore 不叠加、原文不被二次登记 ----
coverHostSections(ctx); // 第二次 cover（幂等：hostOriginals 已有，不覆盖原文记录）
check(
  "cover-idempotent-originals",
  hostOriginals.size === covered.length || hostOriginals.size >= covered.length,
  "重复 cover 后 hostOriginals 不膨胀（" + hostOriginals.size + " 条）",
);

const restored = restoreHostSections();
check("restore-count", restored > 0, "还原 " + restored + " 段");
check(
  "restore-text",
  ctx.sections.get("host:identity").text === "You are an AI agent powered by DeepSeek Harness.",
  "原文已放回",
);
check(
  "covered-now-after-restore",
  coveredNow().length === 0,
  "还原后 coveredNow() 为空（不再误报覆盖）",
);

// ---- 0.2.3 回归：scope 切换交接丢失（另一实例 dispose 撤段/还原覆盖）后的自愈 ----
// 现场：实例 A（预设实例）激活 → 覆盖 + 注册装甲段；切到 global 后 A dispose：
// 段被撤、宿主约束段被 releaseCover 还原；实例 B（常驻实例）仍激活但状态全丢 ——
// 修复前「启动注入」就是这种弱化态（破甲核消失 + 限制层复活），且 B 从不自检补回。
{
  const c = buildCtx();
  // A 激活
  scanHostPrompt(c);
  coverHostSections(c);
  for (const section of [
    { name: "infinite-gen-5:persona-prefix", order: 0, text: "P" },
    { name: "infinite-gen-5:persona-suffix", order: 10200, text: "S" },
    { name: "infinite-gen-5:global-system-prompt", order: 100, text: "CORE" },
  ]) {
    c.sections.data.set(section.name, section);
  }
  // A dispose：撤段 + 还原覆盖（两个模块副本的 dispose 都不跨实例记账，现场即如此）
  for (const name of ["infinite-gen-5:persona-prefix", "infinite-gen-5:persona-suffix", "infinite-gen-5:global-system-prompt"]) {
    c.sections.data.delete(name);
  }
  restoreHostSections(c);
  check(
    "handoff-loss-reproduced",
    c.sections.get("host:identity").text !== "",
    "前置：交接后宿主段已被还原（" + JSON.stringify(c.sections.get("host:identity").text) + "）",
  );
  // B 仍激活 → 轮询自愈
  const owned = [];
  const ownB = (d) => {
    if (typeof d === "function") owned.push(d);
    return d;
  };
  const healed = healSharedState(c, ownB);
  check(
    "handoff-heal-cover",
    c.sections.get("host:identity").text === "",
    "自愈后约束段重新被覆盖（reCovered=" + healed.reCovered + "）",
  );
  check(
    "handoff-heal-sections",
    ["infinite-gen-5:persona-prefix", "infinite-gen-5:persona-suffix", "infinite-gen-5:global-system-prompt"].every((n) => c.sections.data.has(n)),
    "自愈后装甲段补齐（reRegistered=" + healed.reRegistered + "）",
  );
  check("handoff-heal-owned", owned.length >= 3, "补回的段归属自愈实例（" + owned.length + " 个 disposer）");
  // 再次自愈必须幂等：不重复注册、不重复覆盖
  const again = healSharedState(c, ownB);
  check(
    "handoff-heal-idempotent",
    again.reCovered === 0 && again.reRegistered === 0,
    "重复自愈无副作用（reCovered=" + again.reCovered + " reRegistered=" + again.reRegistered + "）",
  );
}

const failed = checks.filter((c) => !c.pass);
for (const c of checks) {
  console.log((c.pass ? "PASS  " : "FAIL  ") + c.name + "  —  " + c.detail);
}
console.log("");
console.log(failed.length === 0 ? "ALL PASS (" + checks.length + " checks)" : "FAILED " + failed.length + "/" + checks.length);
process.exit(failed.length === 0 ? 0 : 1);
