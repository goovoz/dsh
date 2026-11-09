#!/usr/bin/env node
// extras 版本解析：精确同版本 -> 同 major.minor 最高 -> latest
// 用法: node resolve-extras.mjs <pkg> [dshVersion]
// 输出: <version> <tier>   tier: exact | same-minor | latest
// 说明: npm view 的 <pkg>@<range> 不支持语义化范围（会 404），所以拉全量 versions 自己比。
import { execFileSync } from 'node:child_process'

const [pkg, dshVersion] = process.argv.slice(2)
if (!pkg) {
  console.error('usage: resolve-extras.mjs <pkg> [dshVersion]')
  process.exit(2)
}

const npmView = args => {
  try {
    return execFileSync('npm', ['view', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000,
    }).trim()
  } catch {
    return ''
  }
}

const parse = value => {
  const [core, pre] = String(value).split('-')
  const nums = core.split('.').map(n => Number.parseInt(n, 10) || 0)
  while (nums.length < 3) nums.push(0)
  return { nums, pre: pre ? pre.split('.') : null }
}

const cmpPre = (x, y) => {
  if (!x && !y) return 0
  if (!x) return 1
  if (!y) return -1
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i], q = y[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q)
    if (pn && qn) { if (Number(p) !== Number(q)) return Number(p) - Number(q) }
    else if (pn) return -1
    else if (qn) return 1
    else if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

const cmp = (a, b) => {
  const A = parse(a), B = parse(b)
  for (let i = 0; i < 3; i++) if (A.nums[i] !== B.nums[i]) return A.nums[i] - B.nums[i]
  return cmpPre(A.pre, B.pre)
}

const listVersions = () => {
  const raw = npmView([pkg, 'versions', '--json'])
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value : [String(value)]
  } catch {
    return []
  }
}

let version = ''
let tier = ''
const all = listVersions()

if (dshVersion && all.includes(dshVersion)) {
  version = dshVersion
  tier = 'exact'
}

if (!version && dshVersion) {
  const m = String(dshVersion).match(/^(\d+)\.(\d+)\./)
  if (m) {
    const prefix = m[1] + '.' + m[2] + '.'
    const same = all.filter(v => v.startsWith(prefix))
    if (same.length) {
      version = same.reduce((best, v) => (cmp(v, best) > 0 ? v : best))
      tier = 'same-minor'
    }
  }
}

if (!version) {
  const latest = npmView([pkg, 'version'])
  if (latest) { version = latest; tier = 'latest' }
}

if (!version) {
  console.error('[resolve] ' + pkg + ': 没有可用版本')
  process.exit(1)
}

console.log(version + ' ' + tier)
