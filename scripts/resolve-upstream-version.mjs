#!/usr/bin/env node
// 解析上游可跟进的最新 dsh 版本。
// 背景：上游把 0.2.2-rc.2 / rc.3 发在 dist-tag `next` 下，`latest` 仍停在 rc.1，
//       只读 `npm view @deepseek-ai/dsh version` 会永远认为“已是最新”。
// 策略（DSH_CHANNEL）：
//   auto（默认）取 latest/next/beta 等所有非 alpha 版本里最大的；
//   latest     只认 dist-tag latest；
//   next       只认 dist-tag next（没有则退回 latest）。
import { execFileSync } from 'node:child_process'

function npmJson(args) {
  return JSON.parse(execFileSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
}

function parse(v) {
  const [main, pre] = v.split('-', 2)
  return { nums: main.split('.').map(Number), pre: pre ? pre.split('.') : [] }
}

function cmp(a, b) {
  const A = parse(a), B = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (A.nums[i] ?? 0) - (B.nums[i] ?? 0)
    if (d) return d
  }
  if (!A.pre.length && !B.pre.length) return 0
  if (!A.pre.length) return 1
  if (!B.pre.length) return -1
  const n = Math.max(A.pre.length, B.pre.length)
  for (let i = 0; i < n; i++) {
    const x = A.pre[i], y = B.pre[i]
    if (x === y) continue
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y)
    if (nx && ny) return Number(x) - Number(y)
    if (nx) return -1
    if (ny) return 1
    return x < y ? -1 : 1
  }
  return 0
}

const channel = (process.env.DSH_CHANNEL ?? 'auto').toLowerCase()
let tags = {}
try { tags = npmJson(['view', '@deepseek-ai/dsh', 'dist-tags', '--json']) } catch { tags = {} }

let candidates = []
if (channel === 'latest') candidates = [tags.latest].filter(Boolean)
else if (channel === 'next') candidates = [tags.next ?? tags.latest].filter(Boolean)
else {
  const versions = npmJson(['view', '@deepseek-ai/dsh', 'versions', '--json'])
  candidates = versions.filter(v => !/-alpha/i.test(v))
}

if (!candidates.length) { console.error('[upstream] 没找到可用版本'); process.exit(1) }
const best = candidates.sort(cmp).at(-1)
console.log(best)
