#!/usr/bin/env bash
# 把第三方插件（submodule）更新到作者最新，并提示重建
# 用法: make plugin-update NAME=<dir>
set -euo pipefail
ROOT=$(cd $(dirname ${BASH_SOURCE[0]})/.. && pwd)
cd ${ROOT}
NAME=${NAME:-}
if [ -z ${NAME} ]; then
  echo "用法: make plugin-update NAME=<dir>" >&2
  echo "现有插件：" >&2
  sed 's/^/  /' plugins/enabled.txt >&2
  exit 2
fi
path="plugins/${NAME}"
if [ ! -d ${path} ]; then echo "没有 ${path}" >&2; exit 1; fi
if [ -z "$(git submodule status "${path}" 2>/dev/null || true)" ]; then
  echo "${path} 不是 submodule（vendored 目录），无法自动跟随作者更新。" >&2
  echo "要改成可跟踪：git rm -r --cached ${path} && rm -rf ${path} && git submodule add <git-url> ${path}" >&2
  exit 1
fi
old=$(git submodule status "${path}" | awk '{print $1}' | tr -d '+-')
git submodule update --remote --init "${path}"
new=$(git submodule status "${path}" | awk '{print $1}' | tr -d '+-')
if [ "${old}" = "${new}" ]; then
  echo "${NAME} 已是最新（${new}）"
else
  echo "${NAME}: ${old:0:8} -> ${new:0:8}"
  git -C "${path}" log --oneline -5 | sed 's/^/    /'
  git add "${path}"
  echo "（变更已 git add；确认无误后 commit）"
fi
echo
echo "下一步：make build PLUGINS=1 && PUBLIC_HOST=<host:port> make up"
if [ -x "${path}/dsh-install.sh" ]; then echo "提示：该插件带 dsh-install.sh，容器启动时会自动执行"; fi
