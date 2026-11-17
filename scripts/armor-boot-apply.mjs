#!/usr/bin/env node
// 容器启动时把破甲补丁应用到「真正在跑的 dsh」：
//   web/Linux 下 dsh 进程用的是镜像里的全局安装 /usr/local/lib/node_modules/@deepseek-ai/dsh，
//   而插件默认只扫 profile 的 node_modules —— 结果几十条补丁一直是 pending。
// rc.3 的 pattern 适配已经写在插件本体（core.js 末尾的 RC3_* 兼容层），这里只负责「选对 base + 幂等应用」。
import fs from 'node:fs'
import path from 'node:path'

const PLUGIN = process.env.ARMOR_PLUGIN_DIR || '/opt/plugins/dsh-infinite-gen-n'
const core = await import(path.join(PLUGIN, 'lib/host-patch/core.js'))

const bases = new Set(core.enumeratePatchAiBases({ discover: true }))
bases.add('/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai')

const count = (st) => { const c = {}; for (const v of Object.values(st)) c[v] = (c[v] || 0) + 1; return c }
let touched = 0
for (const base of bases) {
  if (!base || !fs.existsSync(base)) continue
  let before
  try { before = count(await core.patchStatus(base)) } catch (e) { console.log('[armor] 跳过 ' + base + '（' + e.message + '）'); continue }
  if ((before.pending || 0) === 0 && (before.applied || 0) > 0) {
    console.log('[armor] ' + base + ' 已是最新（applied=' + before.applied + '）')
    continue
  }
  try {
    await core.applyPatches(base)
    touched += 1
    const after = count(await core.patchStatus(base))
    console.log('[armor] ' + base + ' 已应用：applied ' + (after.applied || 0) + '（pending ' + (before.pending || 0) + ' → ' + (after.pending || 0) + '，na ' + (after.na || 0) + '，skipped ' + (after.skipped || 0) + '）')
  } catch (e) {
    console.log('[armor] ' + base + ' 应用失败：' + (e && e.message ? e.message : e))
  }
}
console.log('[armor] 本次处理 ' + touched + ' 个 base')
