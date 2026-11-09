#!/usr/bin/env node
// a 是否比 b 新：node semver-gt.mjs <a> <b>；exit 0 = a>b，1 = 否则
const [a, b] = process.argv.slice(2)

const parse = value => {
  const [core, pre] = String(value).split('-')
  const nums = core.split('.').map(n => Number.parseInt(n, 10) || 0)
  while (nums.length < 3) nums.push(0)
  return { nums, pre: pre ? pre.split('.') : null }
}

const cmpPre = (x, y) => {
  if (!x && !y) return 0
  if (!x) return 1      // 有 prerelease 的更旧
  if (!y) return -1
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i]; const q = y[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    const pn = /^\d+$/.test(p); const qn = /^\d+$/.test(q)
    if (pn && qn) { if (Number(p) !== Number(q)) return Number(p) - Number(q) }
    else if (pn) return -1
    else if (qn) return 1
    else if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

const A = parse(a)
const B = parse(b)
let order = 0
for (let i = 0; i < 3; i++) {
  if (A.nums[i] !== B.nums[i]) { order = A.nums[i] - B.nums[i]; break }
}
if (order === 0) order = cmpPre(A.pre, B.pre)
process.exit(order > 0 ? 0 : 1)
