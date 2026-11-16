#!/usr/bin/env bash
# 清理已退役插件写在 profile 里的行（目前只有 dsh-armor-gen5 的 preset-armor）。
# 退役原因：gen-n 在代码里注册同名预设（id=armor），保留 preset-armor 会 Duplicate agent preset。
# 幂等：只在发现残留时改写文件；清空到没有条目时恢复 []（避免两份 YAML 文档）。
set -uo pipefail
PROFILE_DIR=${PROFILE_DIR:-${DSH_HOME:-/data/dsh}/profiles/${DSH_PROFILE_NAME:-web}}
PATCH="${PROFILE_DIR}/cordis.patch.yml"
PLUGINS_DIR=${PLUGINS_DIR:-/opt/plugins}

# armor 仍被选中（/opt/plugins 里有它）时不动
if [ -d "${PLUGINS_DIR}/dsh-armor-gen5" ]; then exit 0; fi
[ -f "${PATCH}" ] || exit 0
if ! grep -q 'preset-armor\|armor preset (dsh-armor-gen5)' "${PATCH}" 2>/dev/null; then exit 0; fi

python3 - "${PATCH}" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
BEGIN = '# >>> armor preset (dsh-armor-gen5) begin'
END = '# <<< armor preset (dsh-armor-gen5) end'
if BEGIN in text:
    head, rest = text.split(BEGIN, 1)
    tail = rest.split(END, 1)[1] if END in rest else ''
    text = head.rstrip('\n') + '\n' + tail.lstrip('\n')
lines = text.splitlines()
out = []
i = 0
while i < len(lines):
    if re.match(r'^-\s+id:\s*preset-armor\s*$', lines[i]):
        i += 1
        while i < len(lines) and not re.match(r'^-\s', lines[i]):
            i += 1
        continue
    out.append(lines[i])
    i += 1
text = '\n'.join(out).rstrip('\n') + '\n'
if not re.search(r'^-\s+\S', text, re.M):
    text = text.rstrip('\n') + '\n[]\n'
p.write_text(text, encoding='utf-8')
print('[prune] 已移除 preset-armor（dsh-armor-gen5 已退役）')
PY
if [ -d "${PROFILE_DIR}/armor-kernel" ]; then rm -rf "${PROFILE_DIR}/armor-kernel"; echo '[prune] 已删除 armor-kernel 副本'; fi
rm -f "${PROFILE_DIR}/.plugin-dsh-armor-gen5" 2>/dev/null || true
