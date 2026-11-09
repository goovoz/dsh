#!/usr/bin/env bash
# 把第三方插件作为 git submodule 加进 plugins/ 并启用。
# 用法: make plugin-add URL=https://github.com/<owner>/<plugin>.git [NAME=<dir>]
set -euo pipefail
ROOT=$(cd $(dirname ${BASH_SOURCE[0]})/.. && pwd)
cd ${ROOT}

URL=${URL:-}
NAME=${NAME:-}
if [ -z ${URL} ]; then
  echo "用法: make plugin-add URL=<git-url> [NAME=<dir>]" >&2
  exit 2
fi
[ -z ${NAME} ] && NAME=$(basename ${URL} .git)

if [ -e "plugins/${NAME}" ]; then
  echo "plugins/${NAME} 已存在（先用 git submodule status 确认）" >&2
  exit 1
fi
if [ -f plugins/${NAME}/package.json ]; then
  echo "plugins/${NAME} 已作为普通目录存在" >&2
  exit 1
fi

git submodule add "$URL" "plugins/$NAME"
if ! grep -qx "$NAME" plugins/enabled.txt; then
  printf '%s\n' "$NAME" >> plugins/enabled.txt
fi

echo
echo "已加入 plugins/$NAME："
echo "  1) git submodule status                    # 确认固定到某个提交"
echo "  2) make build PLUGINS=1 && PUBLIC_HOST=<host:port> make up"
echo "  3) 插件若需要额外动作，在 plugins/$NAME/dsh-install.sh 里写（参考 plugins/dsh-armor-gen5）"
