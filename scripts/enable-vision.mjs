#!/usr/bin/env node
// 给 llm-pi-ai 的模型补上图片输入能力：input: [ text, image ]
// 背景：模型能力没声明 input 时，DSH 认为该模型只收文本，发图会被拒（“大模型不支持图片”）。
// 用法: node enable-vision.mjs <cordis.patch.yml>
// 排除: DSH_VISION_EXCLUDE="id1,id2"
import fs from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: enable-vision.mjs <patch.yml>'); process.exit(2) }

let src
try { src = fs.readFileSync(file, 'utf8') } catch { console.log('[vision] 没有 ' + file + '，跳过'); process.exit(0) }

const lines = src.split('\n')
const exclude = new Set((process.env.DSH_VISION_EXCLUDE ?? '').split(/[,\s]+/).filter(Boolean))
const indentOf = line => (line.match(/^\s*/)?.[0].length ?? 0)
const isModelStart = line => /^\s*-\s+id:\s*\S+\s*$/.test(line)
const modelId = line => line.match(/^\s*-\s+id:\s*(\S+)\s*$/)?.[1]

const out = []
let i = 0
let changed = 0
let inModels = false
let modelsIndent = -1

while (i < lines.length) {
  const line = lines[i]

  if (/^\s*models:\s*$/.test(line)) {
    inModels = true
    modelsIndent = indentOf(line)
    out.push(line)
    i++
    continue
  }

  if (inModels && line.trim() !== '' && indentOf(line) <= modelsIndent) inModels = false

  if (inModels && isModelStart(line)) {
    const id = modelId(line)
    const itemIndent = indentOf(line)
    const block = []
    let j = i
    while (j < lines.length) {
      const cur = lines[j]
      if (j > i) {
        if (cur.trim() === '') { block.push(cur); j++; continue }
        const ind = indentOf(cur)
        if (isModelStart(cur) && ind === itemIndent) break
        if (ind <= modelsIndent) break
      }
      block.push(cur)
      j++
    }

    if (exclude.has(id)) {
      out.push(...block)
      i = j
      continue
    }

    const keyIndent = ' '.repeat(itemIndent + 2)
    const inputIdx = block.findIndex(l => /^\s*input:\s*/.test(l))
    if (inputIdx >= 0) {
      if (!/\bimage\b/.test(block[inputIdx])) {
        block[inputIdx] = keyIndent + 'input: [ text, image ]'
        changed++
      }
    } else {
      let at = block.length
      while (at > 0 && block[at - 1].trim() === '') at--
      block.splice(at, 0, keyIndent + 'input: [ text, image ]')
      changed++
    }
    out.push(...block)
    i = j
    continue
  }

  out.push(line)
  i++
}

if (changed > 0) {
  fs.writeFileSync(file, out.join('\n'))
  console.log('[vision] 为 ' + changed + ' 个模型补充 input: [ text, image ] → ' + file)
} else {
  console.log('[vision] 模型图片能力已就绪（无需改动）')
}
