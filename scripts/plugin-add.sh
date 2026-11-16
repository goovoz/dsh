#!/usr/bin/env bash
# 把第三方插件作为 git submodule 加进 plugins/ 并启用，同时在 plugins/upstreams.tsv 登记。
# 用法: make plugin-add URL=https://github.com/<owner>/<plugin>.git [NAME=<dir>]
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${ROOT}"

URL=${URL:-}
NAME=${NAME:-}
if [ -z "${URL}" ]; then
  echo "用法: make plugin-add URL=<git-url> [NAME=<dir>]" >&2
  exit 2
fi
if [ -z "${NAME}" ]; then NAME=$(basename "${URL}" .git); fi

if [ -e "plugins/${NAME}" ]; then
  echo "plugins/${NAME} 已存在（先用 git submodule status 确认）" >&2
  exit 1
fi

git submodule add "$URL" "plugins/${NAME}"
if ! grep -qxF "${NAME}" plugins/enabled.txt 2>/dev/null; then
  printf '%s\n' "${NAME}" >> plugins/enabled.txt
fi

# 登记到 upstreams.tsv（mode=submodule：只记录来源，同步脚本不接管）
if [ -f plugins/upstreams.tsv ] && ! grep -qF "${NAME}"$'\t' plugins/upstreams.tsv; then
  ref=$(git -C "plugins/${NAME}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
  printf '%s\t%s\t%s\tsubmodule\t%s\n' "${NAME}" "${URL}" "${ref}" "make plugin-add 加入" >> plugins/upstreams.tsv
  echo "已在 plugins/upstreams.tsv 登记（mode=submodule）"
fi

echo
echo "已加入 plugins/${NAME}："
echo "  1) git submodule status                    # 确认固定到某个提交"
echo "  2) make build PLUGINS=all && PUBLIC_HOST=<host:port> make up"
echo "  3) 插件若需要额外动作，写在 plugins/${NAME}/dsh-install.sh（参考 plugins/dsh-infinite-gen-n）"
