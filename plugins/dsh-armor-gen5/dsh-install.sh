#!/usr/bin/env bash
# dsh-armor-gen5 后置安装：预设内核副本 + profile patch 里的 preset-armor 行
# （自检里 profiles/desktop 的硬编码由 patches/0001-* 在构建期修正）
set -euo pipefail
PROFILE_DIR=${PROFILE_DIR:?需要 PROFILE_DIR}
PLUGIN_DIR=${PLUGIN_DIR:-/opt/plugins/dsh-armor-gen5}
PATCH="$PROFILE_DIR/cordis.patch.yml"

# 1) 预设用的内核副本：preset 行以 ./armor-kernel/index.js 挂载
rm -rf "$PROFILE_DIR/armor-kernel"
cp -a "$PLUGIN_DIR" "$PROFILE_DIR/armor-kernel"
echo "[armor] armor-kernel 已就位"

# 2) 生成 preset 块，并把 pwsh 工具行换成本地 bash（Linux 容器没有 pwsh）
node "$PLUGIN_DIR/tools/gen-bundle-patch.mjs" --print-preset > /tmp/armor-preset.yml
python3 - "$PATCH" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
raw = pathlib.Path('/tmp/armor-preset.yml').read_text(encoding='utf-8')
raw = raw.replace('"id":"tool-pwsh","name":"@deepseek-ai/dsh-tool-pwsh"',
                  '"id":"tool-bash","name":"@deepseek-ai/dsh-tool-bash"')
if 'tool-bash' not in raw:
    raise SystemExit('预设块里没有 pwsh 行，插件版本可能变了')
BEGIN = '# >>> armor preset (dsh-armor-gen5) begin'
END = '# <<< armor preset (dsh-armor-gen5) end'
text = p.read_text(encoding='utf-8') if p.exists() else ''
# 模板里的空数组字面量 [] 必须先去掉，否则追加后是两份 YAML 文档
text = '\n'.join(line for line in text.splitlines() if line.strip() != '[]')
if BEGIN in text:
    head, rest = text.split(BEGIN, 1)
    tail = rest.split(END, 1)[1] if END in rest else ''
    text = head + tail.lstrip('\n')
if not text.endswith('\n'):
    text += '\n'
text += '\n' + BEGIN + '\n' + raw.rstrip('\n') + '\n' + END + '\n'
p.write_text(text, encoding='utf-8')
print('[armor] preset-armor 已写入', p)
PY
echo "[armor] 完成"
