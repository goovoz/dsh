#!/usr/bin/env node
// asar-read.cjs — 从 Electron 的 app.asar 里按路径取出单个文件（不需要安装依赖）。
//
// 用途：本插件要对接宿主 UI，必须能读到宿主源码（如
//   @deepseek-ai/dsh-client-ui-sidebar/lib/client.js 里 sidebar.panellist 的
//   label 解析逻辑）。DSH 的前端代码全部打包在 resources/app.asar 内，
//   普通 grep 无法搜索，npx @electron/asar extract-file 在这台机器上只输出空文件，
//   所以直接用二进制解析 pickle 头 + JSON 索引。
//
// 用法：
//   node tools/asar-read.cjs "<app.asar 绝对路径>" "<包内路径>" "<输出目录>"
// 例：
//   node tools/asar-read.cjs "C:\Users\<user>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar" `
//     "dsh/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js" "$env:TEMP\asar-probe"
//
// asar 头结构（Electron / Chromium base::Pickle）：
//   [0..3]  uint32 = 4                     —— 头部长度字段自身的长度
//   [4..7]  uint32 = header pickle payload 长度
//   [8..11] uint32 = JSON 长度
//   [12..]  padding（实测 4 字节）+ JSON
// 由于不同版本 padding 位置不一致，这里用「从第一个 '{' 起做括号计数」的方式
// 定位 JSON 结束位置，再把该位置当作文件数据区起点（entry.offset 相对此处）。

const fs = require("fs");
const path = require("path");

const [archive, target, outDir] = process.argv.slice(2);
if (!archive || !target || !outDir) {
  console.error("usage: node asar-read.cjs <app.asar> <in-archive-path> <out-dir>");
  process.exit(2);
}

const buf = fs.readFileSync(archive);

// --- locate header JSON ---
const jsonStart = buf.indexOf(0x7b, 8); // '{'
if (jsonStart < 0) throw new Error("header JSON not found");
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
if (jsonEnd < 0) throw new Error("header JSON not closed");

const header = JSON.parse(buf.slice(jsonStart, jsonEnd).toString("utf8"));

// --- walk the index tree ---
const parts = target.split("/").filter(Boolean);
let node = header;
for (let i = 0; i < parts.length; i++) {
  const key = parts[i];
  const files = node.files || node;
  const entry = files[key];
  if (!entry) throw new Error("not found: " + parts.slice(0, i + 1).join("/"));
  if (i === parts.length - 1) {
    if (entry.files) throw new Error("target is a directory: " + target);
    const out = path.join(outDir, path.basename(key));
    if (entry.unpacked) {
      fs.copyFileSync(path.join(archive + ".unpacked", target), out);
    } else {
      const start = jsonEnd + Number(entry.offset);
      fs.writeFileSync(out, buf.slice(start, start + Number(entry.size)));
    }
    console.log("wrote " + out + " (" + entry.size + " bytes)");
    process.exit(0);
  }
  node = entry;
}
