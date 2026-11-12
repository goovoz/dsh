#!/usr/bin/env bash
# dsh-qinglong-cli 后置安装：
#   1) 把插件（含 vendor/ql.js）复制到 profile 下，供相对路径加载
#   2) 往 profile 的 cordis.patch.yml 追加一条 insert（幂等）
# 可用环境变量：PROFILE_DIR（profile 目录）、PLUGIN_DIR（插件在镜像里的路径）
set -euo pipefail
PROFILE_DIR=${PROFILE_DIR:?需要 PROFILE_DIR}
PLUGIN_DIR=${PLUGIN_DIR:-/opt/plugins/dsh-qinglong-cli}
KERNEL="$PROFILE_DIR/qinglong-cli-kernel"
PATCH="$PROFILE_DIR/cordis.patch.yml"

# 1) 内核副本（含 vendor/ql.js）
rm -rf "$KERNEL"
cp -a "$PLUGIN_DIR" "$KERNEL"
node --check "$KERNEL/index.js"
echo "[qinglong-cli] 已就位: $KERNEL"

# 2) profile patch 行
touch "$PATCH"
python3 - "$PATCH" <<'PY'
import sys, pathlib

p = pathlib.Path(sys.argv[1])
BEGIN = '# >>> qinglong cli (dsh-qinglong-cli) begin'
END = '# <<< qinglong cli (dsh-qinglong-cli) end'
block = f"""{BEGIN}
- insert:
    - id: qinglong-cli
      name: './qinglong-cli-kernel/index.js'
      config: {{}}
{END}
"""

text = p.read_text(encoding='utf-8') if p.exists() else ''
# 模板里的空数组字面量必须先去掉，否则追加后变成两份 YAML 文档
text = '\n'.join(line for line in text.splitlines() if line.strip() != '[]')
if BEGIN in text:
    head, rest = text.split(BEGIN, 1)
    tail = rest.split(END, 1)[1] if END in rest else ''
    text = head + tail.lstrip('\n')
if text and not text.endswith('\n'):
    text += '\n'
p.write_text(text + block, encoding='utf-8')
print('[qinglong-cli] profile patch 已写入', p)
PY

echo "[qinglong-cli] 配置提示：QL_URL / QL_CLIENT_ID / QL_CLIENT_SECRET（或 \$DSH_HOME/ql-cli.json）"
