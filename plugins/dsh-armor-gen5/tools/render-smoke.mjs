// tools/render-smoke.mjs — 客户端面板离线渲染冒烟（不启动宿主）
//
// 目的：在 CI 里抓「客户端半体运行时 ReferenceError / 渲染树断裂」这类
// node --check 抓不到的问题（例如删掉变量后残留引用、组件返回 undefined）。
// 运行：node tools/render-smoke.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../client.js", import.meta.url), "utf8");

let factory = null;
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  JSON,
  Math,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Promise,
  Error,
  RegExp,
  window: {
    __ModuleLoader__: {
      load(definition) {
        factory = definition.factory;
      },
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "client.js" });

assert.equal(typeof factory, "function", "client.js 未调用 __ModuleLoader__.load");

// ---- 极简 React 桩：只实现本面板用到的 hook ----
let slotValues = [];
let slotIndex = 0;

function makeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat(Infinity).filter((item) => item !== undefined) };
    },
    useState(initial) {
      const value = slotIndex < slotValues.length ? slotValues[slotIndex] : initial;
      slotIndex += 1;
      return [value, () => {}];
    },
    useEffect(effect) {
      try {
        const dispose = effect();
        if (typeof dispose === "function") dispose();
      } catch {
        // 冒烟不执行副作用失败
      }
    },
    useRef(initial) {
      return { current: initial };
    },
    useMemo(fn) {
      return fn();
    },
  };
}

const react = makeReact();
const mod = factory((name) => {
  if (name === "react") return react;
  throw new Error("unexpected require: " + name);
});

const captured = {};
const ctx = {
  effect() {},
  locale: { register() {}, bind() { return (key) => key; } },
  slots: {
    inject(_name, callback) {
      try {
        callback();
      } catch {
        // ignore
      }
    },
    register(definition, component) {
      captured[definition.name + (definition.key ? ":" + definition.key : definition.id ? ":" + definition.id : "")] = component;
      return () => {};
    },
  },
};

assert.equal(typeof mod.apply, "function");
mod.apply(ctx);

const consolePage =
  captured["main:armor-gen5"] ||
  Object.entries(captured).find(([key]) => key.startsWith("main"))?.[1];
const dock = Object.entries(captured).find(([key]) => key.includes("conversation.input.dock"))?.[1];
assert.equal(typeof consolePage, "function", "未捕获到控制台页组件");
assert.equal(typeof dock, "function", "未捕获到输入框徽标组件");

function render(node) {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (Array.isArray(node)) return node.map(render).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node.type === "function") {
    return render(node.type({ ...node.props, children: node.children }));
  }
  return (node.children || []).map(render).join("");
}

const slot = (extra) => ({
  slot: extra.slot,
  active: "builtin",
  file: "infinite-gen-5.md",
  builtinFile: "infinite-gen-5.md",
  source: "builtin",
  ok: true,
  error: "",
  bytes: 1024,
  hash: "a".repeat(64),
  mtimeMs: 1,
});

slotValues = [
  { loading: false, result: null },
  {
    ok: true,
    scope: "global",
    version: "0.3.0",
    armed: true,
    sections: { total: 4, core: true, persona: true, seal: true },
    engagedAt: "2026-11-07T04:00:00.000Z",
    engagedOk: true,
    engagedScope: "global",
    envOverride: null,
  },
  "",
  false,
  "",
  { available: true, hostSections: [{}], constrained: [], covered: [] },
  "0.3.0",
  { phase: "idle", steps: [], verdict: null, scope: null, ms: 0 },
  false,
  {
    dir: "C:\\packs",
    packsDir: "C:\\packs\\packs",
    slots: {
      core: { ...slot({ slot: "core" }), active: "mine", source: "user", file: "C:\\packs\\packs\\mine.md" },
      persona: slot({ slot: "persona" }),
      seal: slot({ slot: "seal" }),
    },
    packs: [{ id: "mine", bytes: 10, hash: "b".repeat(64), mtimeMs: 2 }],
  },
  false,
  "",
  "core",
];
slotIndex = 0;
const pageHtml = render(consolePage({}));

assert.match(pageHtml, /无限五代 破甲/);
assert.match(pageHtml, /已注入/, "面板应显示已注入而不是待运行");
assert.match(pageHtml, /破甲词库/);
assert.match(pageHtml, /破甲核/);
assert.match(pageHtml, /身份层注入/, "面板应显示身份层开关");
assert.match(pageHtml, /关闭/, "身份层开启时应提供关闭按钮");
assert.match(pageHtml, /mine/, "用户词库应出现在下拉框");
assert.doesNotMatch(pageHtml, /待运行/, "修复后 root 面板不应再出现「待运行」");

slotIndex = 0;
slotValues = [];
const dockHtml = render(
  dock({
    useProjection(key) {
      if (key === "agentPreset") return "armor";
      if (key === "armor") return { verdict: "pass", words: [], running: false, w5Count: 2 };
      return undefined;
    },
  })
);
assert.match(dockHtml, /无限五代 破甲/);

console.log("✓ 控制台页渲染");
console.log("✓ 注入状态徽标 = 已注入");
console.log("✓ 破甲词库区块与用户词库下拉");
console.log("✓ 输入框徽标渲染");
console.log("\nRESULT: OK");
