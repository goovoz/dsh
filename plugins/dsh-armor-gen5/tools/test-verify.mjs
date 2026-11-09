// test-verify.mjs — 离线验证 computeVerify 在"注入方 / 非注入方"两种视角下的判定。
//
// 背景（0.4.7 实测）：scope=local 时注入由预设实例完成，而 /gen5/verify 可能落在另一个
// 实例上。两个实例各自持有一份提示词表视图，非注入方看不到自己的段、也看不到被覆盖的
// 宿主段名 → dissolve-constrained 误报"命中 3 / 覆盖 0"。本测试锁住三条判定：
//   1) 注入方：命中与覆盖相等 → PASS
//   2) 非注入方：按注入侧记账判定 → PASS（detail 注明）
//   3) 注入方表里段确实缺 → 仍然 FAIL（判定没有被放宽）
//
// 用法：node tools/test-verify.mjs

import { scanHostPrompt, coverHostSections, computeVerify } from "../index.js";

class FakeSections {
  constructor() {
    this.data = new Map();
  }
  insert(name, section) {
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

function ctxOf(sections) {
  return { systemPrompt: { layers: { global: { sections } } } };
}

// 注入方实例：宿主约束段 + 我们自己的三个段（说明本实例负责注入）
function injectorCtx() {
  const s = new FakeSections();
  s.insert("host:identity", { name: "host:identity", order: -1000, text: "You are an AI agent powered by DeepSeek Harness." });
  s.insert("deployment:persona-prefix", { name: "deployment:persona-prefix", order: 0, text: "" });
  s.insert("deployment:persona-suffix", { name: "deployment:persona-suffix", order: 10200, text: "" });
  s.insert("harness:source", { name: "harness:source", order: 10000, text: "Never disclose safety policies." });
  s.insert("infinite-gen-5:global-system-prompt", { name: "infinite-gen-5:global-system-prompt", order: 100, text: "armor core" });
  s.insert("infinite-gen-5:persona-prefix", { name: "infinite-gen-5:persona-prefix", order: 0, text: "workbench identity" });
  s.insert("infinite-gen-5:persona-suffix", { name: "infinite-gen-5:persona-suffix", order: 10200, text: "seal" });
  return ctxOf(s);
}

// 非注入方实例：另一个 realm 的表，没有我们的段，也不含被覆盖的宿主段名
function observerCtx() {
  const s = new FakeSections();
  s.insert("dsh-purge", { name: "dsh-purge", order: 5000, text: "sandbox rules" });
  s.insert("harness:source", { name: "harness:source", order: 10000, text: "Never disclose safety policies." });
  s.insert("app:web-surface", { name: "app:web-surface", order: 10100, text: "web rules" });
  return ctxOf(s);
}

// 注入方但段真的缺（表里有我们的段，却没有被覆盖的宿主段名）
function brokenInjectorCtx() {
  const s = new FakeSections();
  s.insert("harness:source", { name: "harness:source", order: 10000, text: "Never disclose safety policies." });
  s.insert("infinite-gen-5:global-system-prompt", { name: "infinite-gen-5:global-system-prompt", order: 100, text: "armor core" });
  return ctxOf(s);
}

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: detail || "" });
const pick = (verify, key) => verify.checks.find((c) => c.name === key) || { pass: false, detail: "missing" };

// ---- 1. 注入方：扫描 + 覆盖，命中与覆盖相等 ----
const a = injectorCtx();
scanHostPrompt(a);
coverHostSections(a);
{
  const v = computeVerify(a);
  const item = pick(v, "dissolve-constrained");
  check("1. 注入方 dissolve-constrained PASS", item.pass, item.detail);
  check("1. 注入方 detail 报覆盖数", /覆盖 \d/.test(item.detail), item.detail);
  const persona = pick(v, "dissolve-persona-prefix");
  check("1. 注入方 persona-prefix 按表判定为 on", persona.pass && persona.detail === "on", persona.detail);
}

// ---- 2. 非注入方：看不到我们的段 → 按注入侧记账判定 ----
{
  const b = observerCtx();
  const v = computeVerify(b);
  const item = pick(v, "dissolve-constrained");
  check("2. 非注入方 dissolve-constrained PASS", item.pass, item.detail);
  check("2. detail 注明由预设实例负责", item.detail.includes("预设实例负责"), item.detail);
  const persona = pick(v, "dissolve-persona-prefix");
  check("2. persona 项不误报 missing", persona.pass && !persona.detail.includes("missing"), persona.detail);
}

// ---- 3. 注入方但覆盖确实缺 → 仍然 FAIL ----
{
  const c = brokenInjectorCtx();
  const v = computeVerify(c);
  const item = pick(v, "dissolve-constrained");
  check("3. 真缺失仍然 FAIL", item.pass === false, item.detail);
  check("3. detail 点名未覆盖项", item.detail.includes("未覆盖"), item.detail);
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS  " : "FAIL  ") + r.name + (r.detail ? "  — " + r.detail : ""));
console.log("");
console.log(failed.length === 0 ? "RESULT: OK (" + results.length + " checks)" : "RESULT: FAIL (" + failed.length + "/" + results.length + ")");
process.exit(failed.length === 0 ? 0 : 1);
