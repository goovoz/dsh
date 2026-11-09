// tools/test-packs.mjs — 破甲词库离线单测（不依赖宿主）
//
// 覆盖：默认内置 / 导入 / 切换 / 热更新 / 坏文件回落 / 路径穿越 / 大小上限 / 删除与恢复。
// 运行：node tools/test-packs.mjs

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPromptPack } from "../prompt-pack.js";

const root = mkdtempSync(join(tmpdir(), "gen5-packs-"));
const builtin = join(root, "builtin");
const home = join(root, "home");
mkdirSync(builtin, { recursive: true });

const BUILTIN = {
  core: "CORE-BUILTIN-0123456789",
  persona: "PERSONA-BUILTIN",
  seal: "SEAL-BUILTIN",
};
writeFileSync(join(builtin, "infinite-gen-5.md"), BUILTIN.core + "\n", "utf8");
writeFileSync(join(builtin, "armor-persona-prefix.md"), BUILTIN.persona + "\n", "utf8");
writeFileSync(join(builtin, "armor-seal.md"), BUILTIN.seal + "\n", "utf8");

const pack = createPromptPack({
  home,
  builtinDir: builtin,
  fallbacks: { core: "CORE-FALLBACK", persona: "PERSONA-FALLBACK", seal: "SEAL-FALLBACK" },
});

let passed = 0;
function ok(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("✓ " + name);
  } catch (error) {
    console.error("✗ " + name + "\n  " + String((error && error.stack) || error));
    process.exitCode = 1;
  }
}

ok("默认使用内置三槽", () => {
  assert.equal(pack.text("core"), BUILTIN.core);
  assert.equal(pack.text("persona"), BUILTIN.persona);
  assert.equal(pack.text("seal"), BUILTIN.seal);
  const summary = pack.summary();
  for (const slot of ["core", "persona", "seal"]) {
    assert.equal(summary[slot].active, "builtin");
    assert.equal(summary[slot].source, "builtin");
    assert.equal(summary[slot].ok, true);
  }
});

ok("导入即应用，text 立刻切换", () => {
  const result = pack.importText("core", "我的词库", "USER-CORE-V1");
  assert.equal(result.id, "我的词库");
  assert.equal(pack.text("core"), "USER-CORE-V1");
  assert.equal(pack.summary().core.active, "我的词库");
  assert.match(pack.summary().core.hash, /^[0-9a-f]{12}$/);
});

ok("文件被外部改写后按 mtime 热更新", () => {
  const file = join(home, "packs", "我的词库.md");
  writeFileSync(file, "USER-CORE-V2\n", "utf8");
  const now = new Date(Date.now() + 5000);
  utimesSync(file, now, now);
  assert.equal(pack.text("core"), "USER-CORE-V2");
});

ok("切换到内置 / 切回用户词库", () => {
  pack.select("core", "builtin");
  assert.equal(pack.text("core"), BUILTIN.core);
  pack.select("core", "我的词库");
  assert.equal(pack.text("core"), "USER-CORE-V2");
});

ok("非法 id / 路径穿越被拒绝", () => {
  assert.throws(() => pack.select("core", "../evil"), /非法词库 id/);
  assert.throws(() => pack.select("core", "a/b"), /非法词库 id/);
  assert.throws(() => pack.select("nope", "builtin"), /未知词库槽位/);
});

ok("导入名里的路径片段被收敛成安全 id", () => {
  const result = pack.importText("seal", "../../etc/passwd.md", "X");
  assert.equal(result.id, "etc-passwd");
  assert.equal(pack.text("seal"), "X");
});

ok("选中文件被写坏时回落内置并标记 ok=false", () => {
  const file = join(home, "packs", "我的词库.md");
  writeFileSync(file, "   \n", "utf8");
  const now = new Date(Date.now() + 6000);
  utimesSync(file, now, now);
  assert.equal(pack.text("core"), BUILTIN.core);
  assert.equal(pack.slotInfo("core").ok, false);
});

ok("空正文 / NUL / 超限被拒绝", () => {
  assert.throws(() => pack.importText("core", "empty", ""), /正文为空/);
  assert.throws(() => pack.importText("core", "nul", "a\u0000b"), /正文为空或含 NUL/);
  assert.throws(() => pack.importText("core", "huge", "a".repeat(200 * 1024)), /KB 上限/);
});

ok("删除当前词库会回落到内置并留下备份", () => {
  const result = pack.remove("我的词库");
  assert.equal(pack.text("core"), BUILTIN.core);
  assert.equal(pack.summary().core.active, "builtin");
  assert.ok(existsSync(result.backup), "备份应存在");
  assert.ok(readFileSync(result.backup, "utf8").length > 0);
});

ok("describe 暴露槽位与用户词库列表", () => {
  const info = pack.describe();
  assert.ok(info.packsDir.endsWith("packs"));
  assert.equal(info.slots.core.active, "builtin");
  assert.ok(info.slots.core.builtinFile.endsWith(".md"));
  assert.ok(Array.isArray(info.packs));
  assert.ok(info.packs.some((item) => item.id === "etc-passwd"));
});

try {
  rmSync(root, { recursive: true, force: true });
} catch {
  // Windows 上偶发句柄未释放，忽略清理失败
}

console.log("\nRESULT: " + (process.exitCode ? "FAIL" : "OK") + " (" + passed + " passed)");
