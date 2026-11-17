#!/usr/bin/env node
// 校验插件 package.json 的 files 白名单是否覆盖「运行期真正会被 import 的文件」。
//
// 为什么需要：插件既可能被整目录复制安装，也可能被 "pnpm/npm file:" 依赖物化——后者严格按
// files 白名单复制。历史上 dsh-infinite-gen-n 的 files 漏了 lib/，pnpm 安装出来的副本缺
// lib/host-patch/core.js，index.js 顶层 import 直接抛错 → 插件不 activate → 侧边栏面板消失。
// 这个脚本把「入口 import 闭包 ⊆ files 白名单」变成 CI 可判定的条件。
//
// 用法: node scripts/check-plugin-files.mjs plugins/dsh-infinite-gen-n
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("用法: node scripts/check-plugin-files.mjs <plugin-dir>");
  process.exit(2);
}
const root = path.resolve(dir);
const pkgPath = path.join(root, "package.json");
if (!fs.existsSync(pkgPath)) {
  console.error(dir + ": 缺少 package.json");
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const whitelist = Array.isArray(pkg.files) ? pkg.files : null;

const toPosix = (p) => p.split(path.sep).join("/");
const covered = (rel) => {
  if (!whitelist) return true; // 没有 files 字段 = 全量发布
  return whitelist.some((entry) => {
    const e = entry.replace(/\/+$/, "");
    return rel === e || rel.startsWith(e + "/") || rel === e + ".js" || rel === e + ".mjs";
  });
};

const entries = new Set();
const addEntry = (v) => {
  if (typeof v !== "string" || !/\.(mjs|cjs|js)$/.test(v)) return;
  const rel = toPosix(path.normalize(v.replace(/^\.\//, "")));
  if (fs.existsSync(path.join(root, rel))) entries.add(rel);
};
addEntry(pkg.main || "index.js");
for (const v of Object.values(pkg.exports || {})) addEntry(v);
addEntry("client.js");

if (entries.size === 0) {
  console.log("SKIP " + dir + ": 没有可解析的入口文件");
  process.exit(0);
}

const visited = new Set();
const unshipped = [];
const dangling = [];
const queue = [...entries];
while (queue.length) {
  const rel = queue.shift();
  if (visited.has(rel)) continue;
  visited.add(rel);
  if (!covered(rel)) unshipped.push(rel);
  let text;
  try {
    text = fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    continue;
  }
  for (const m of text.matchAll(/(?:from\s+|import\(\s*|require\(\s*)["'](\.[^"']+)["']/g)) {
    const spec = m[1];
    const abs = path.resolve(root, path.dirname(rel), spec);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      dangling.push(rel + " -> " + spec);
      continue;
    }
    queue.push(toPosix(path.relative(root, abs)));
  }
}

const label = dir.replace(/\/+$/, "");
if (unshipped.length === 0 && dangling.length === 0) {
  console.log("OK " + label + ": " + visited.size + " 个运行期文件全部在 files 白名单内");
  process.exit(0);
}
if (unshipped.length) {
  console.error("FAIL " + label + ": 以下运行期文件不在 package.json 的 files 白名单里（pnpm/npm 安装会丢）");
  for (const f of unshipped) console.error("  - " + f);
}
if (dangling.length) {
  console.error("FAIL " + label + ": 以下相对 import 目标在磁盘上不存在");
  for (const f of dangling) console.error("  - " + f);
}
process.exit(1);
