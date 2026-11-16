#!/usr/bin/env node
// gen-manifest.mjs — 重新生成 MANIFEST-SHA256.txt（按 package.json version）
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const fp = join(dir, name);
    const st = statSync(fp);
    if (st.isDirectory()) out.push(...walk(fp));
    else out.push(fp);
  }
  return out;
}

// 分发范围：顶层声明文件 + prompts/ + tools/ + lib/（排除 tools/ab-results、tools/baselines）
const top = [
  "index.js", "client.js", "preheat.js", "normalize.js", "dump.js", "armor-rules.js",
  "preset-rows.js", "cordis.patch.yml", "install.ps1", "install.sh",
  "uninstall.ps1", "uninstall.sh", "LICENSE", "README.md", "RELEASE_NOTES.md",
  "SECURITY.md", "PLAN.md",
];
const dirs = ["prompts", join("tools"), "lib"];
const files = [];
for (const f of top) files.push(join(ROOT, f));
for (const d of dirs) {
  try { files.push(...walk(join(ROOT, d))); } catch { /* 目录不存在则跳过 */ }
}
const EXCLUDE = /ab-results|baselines|\.DS_Store/;
const lines = [
  `# dsh-infinite-gen-n v${pkg.version} - per-file SHA256 manifest`,
  "# format: <sha256>  <size-bytes>  <relative-path>",
];
const seen = new Set();
for (const fp of files.sort()) {
  if (EXCLUDE.test(fp)) continue;
  const rel = relative(ROOT, fp).replace(/\\/g, "/");
  if (rel === "MANIFEST-SHA256.txt" || seen.has(rel)) continue;
  seen.add(rel);
  const buf = readFileSync(fp);
  const h = createHash("sha256").update(buf).digest("hex");
  lines.push(`${h}  ${buf.length}  ${rel}`);
}
writeFileSync(join(ROOT, "MANIFEST-SHA256.txt"), lines.join("\n") + "\n", "utf8");
console.log(`manifest v${pkg.version}: ${lines.length - 2} files`);
