#!/usr/bin/env node
// 容器启动时把破甲补丁应用到「真正在跑的 dsh」：
//  - web/Linux 下，dsh 进程用的是镜像里的全局安装 /usr/local/lib/node_modules/@deepseek-ai/dsh，
//    而插件默认只扫 profile 的 node_modules —— 结果 48 条补丁一直是 pending。
//  - 这里在 profile 之外补上全局 base，并在每次启动前幂等应用；镜像层里的改写不会跨容器保留，
//    但启动时自动重放，效果等同于持久（桌面端不走这个脚本，行为不变）。
import fs from 'node:fs'

const PLUGIN = '/opt/plugins/dsh-infinite-gen-n'
const core = await import(PLUGIN + '/lib/host-patch/core.js')

const bases = new Set()
for (const b of core.enumeratePatchAiBases({ discover: true })) bases.add(b)
bases.add('/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai')

const count = (st) => {
  const c = {}
  for (const v of Object.values(st)) c[v] = (c[v] || 0) + 1
  return c
}

let touched = 0
for (const base of bases) {
  if (!base || !fs.existsSync(base)) continue
  let before
  try { before = count(await core.patchStatus(base)) } catch (e) { console.log('[armor] 跳过 ' + base + '（状态读取失败: ' + e.message + '）'); continue }
  const pending = before.pending || 0
  if (pending === 0 && (before.applied || 0) > 0) {
    console.log('[armor] ' + base + ' 已是最新（applied=' + before.applied + ' na=' + (before.na || 0) + '）')
    continue
  }
  try {
    await core.applyPatches(base)
    touched += 1
    const after = count(await core.patchStatus(base))
    console.log('[armor] ' + base + ' 已应用：applied ' + (after.applied || 0) + '（pending ' + pending + ' → ' + (after.pending || 0) + '，na ' + (after.na || 0) + '，skipped ' + (after.skipped || 0) + '）')
  } catch (e) {
    console.log('[armor] ' + base + ' 应用失败：' + (e && e.message ? e.message : e))
  }
}
console.log('[armor] 本次处理 ' + touched + ' 个 base')
