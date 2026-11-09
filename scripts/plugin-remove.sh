#!/usr/bin/env bash
# 从插件库摘除第三方插件（submodule 或普通目录），并从 enabled.txt 移除
# 用法: make plugin-remove NAME=<dir>
set -euo pipefail
ROOT=$(cd $(dirname ${BASH_SOURCE[0]})/.. && pwd)
cd ${ROOT}
NAME=${NAME:-}
if [ -z ${NAME} ]; then
  echo "用法: make plugin-remove NAME=<dir>" >&2
  echo "现有插件：" >&2
  sed 's/^/  /' plugins/enabled.txt >&2
  exit 2
fi
path="plugins/${NAME}"
listed=0
grep -qx "${NAME}" plugins/enabled.txt 2>/dev/null && listed=1
if [ ! -d ${path} ] && [ "${listed}" = 0 ]; then
  echo "没有 ${NAME}（目录与 enabled.txt 都不存在）" >&2
  exit 1
fi
is_sub=$(git submodule status "${path}" 2>/dev/null || true)
if [ -d ${path} ] && [ -n "${is_sub}" ]; then
  git submodule deinit -f "${path}"
  git rm -f "${path}"
  rm -rf ".git/modules/${path}"
  echo "已摘除 submodule ${path}"
elif [ -d ${path} ]; then
  git rm -r -f --cached "${path}" >/dev/null 2>&1 || true
  rm -rf "${path}"
  echo "已删除普通目录 ${path}"
fi
if [ "${listed}" = 1 ]; then
  tmp=$(mktemp)
  grep -vx "${NAME}" plugins/enabled.txt > "${tmp}" || true
  mv "${tmp}" plugins/enabled.txt
  echo "已从 enabled.txt 移除 ${NAME}"
fi
# submodule 全部摘完后，空的 .gitmodules 一并清掉
if [ -f .gitmodules ] && [ ! -s .gitmodules ]; then
  git rm -f --cached .gitmodules >/dev/null 2>&1 || true
  rm -f .gitmodules
  echo "已清理空的 .gitmodules"
fi

echo "注意：从这里移除 ≠ 已运行实例的 profile 里也卸掉。"
echo "旧容器的 profile（./data/dsh/profiles/web）仍装着它，需要："
echo "  docker exec -it dsh-web dsh plugin --profile web remove <npm 包名>"
echo "  或者换一个全新的 data 卷重建"
echo
echo "下一步：make build PLUGINS=1 && PUBLIC_HOST=<host:port> make up"
