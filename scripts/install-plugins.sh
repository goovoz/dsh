#!/usr/bin/env bash
# 按 plugins/enabled.txt 把插件装进 profile，并执行插件自带的后置脚本
# stamp 里带 dsh 版本：升级核心后自动重装；失败时打印真实报错并留在下次重试
set -uo pipefail
PROFILE="${PROFILE:-web}"
PROFILE_DIR="${PROFILE_DIR:-${DSH_HOME:-/data/dsh}/profiles/${PROFILE}}"
ROOT="${PLUGINS_DIR:-/opt/plugins}"
LIST="${ROOT}/enabled.txt"

[ -f "${LIST}" ] || { echo "[plugins] 没有 enabled.txt，跳过"; exit 0; }
mkdir -p "${PROFILE_DIR}"
dsh_v="$(dsh --version 2>/dev/null | tail -1)"
names="$(sed 's/\r$//' "${LIST}" | grep -vE '^[[:space:]]*#' | sed '/^[[:space:]]*$/d')"

failed=0
while IFS= read -r name; do
  [ -z "${name}" ] && continue
  dir="${ROOT}/${name}"
  if [ ! -d "${dir}" ]; then echo "[plugins] 缺目录 ${dir}" >&2; failed=1; continue; fi
  # 插件若本身是 git 仓库（submodule），用提交号做指纹；否则退回 package.json 的 mtime+size
  if git -C "${dir}" rev-parse --verify HEAD >/dev/null 2>&1; then
    stamp="git:$(git -C "${dir}" rev-parse HEAD)"
  else
    stamp="stat:$(cd "${dir}" && stat -c '%Y-%s' package.json 2>/dev/null || echo 0)"
  fi
  stamp="dsh=${dsh_v};${stamp}"
  marker="${PROFILE_DIR}/.plugin-${name}"
  if [ -f "${marker}" ] && [ "$(cat "${marker}")" = "${stamp}" ]; then
    echo "[plugins] ${name} 已就绪"; continue
  fi
  echo "[plugins] 安装 ${name}"
  ok=1
  if ! out=$(dsh plugin --profile "${PROFILE}" add "file:${dir}" 2>&1); then
    echo "[plugins] dsh plugin add 失败：${name}" >&2
    printf '%s\n' "${out}" | tail -15 >&2
    ok=0
  fi
  if [ "${ok}" = 1 ] && [ -x "${dir}/dsh-install.sh" ]; then
    if ! PROFILE_DIR="${PROFILE_DIR}" PLUGIN_DIR="${dir}" bash "${dir}/dsh-install.sh"; then
      echo "[plugins] ${name} 后置脚本失败" >&2
      ok=0
    fi
  fi
  if [ "${ok}" = 1 ]; then
    printf '%s' "${stamp}" > "${marker}"
  else
    failed=1
    echo "[plugins] ${name} 未完成，未写 marker（下次启动会重试）" >&2
  fi
done <<< "${names}"

[ "${failed}" = 0 ] || exit 1
