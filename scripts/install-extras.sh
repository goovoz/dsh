#!/usr/bin/env bash
# 把 extras.txt 里的插件装进 profile；版本优先跟随已装 dsh，缺失回退 latest
set -uo pipefail
PROFILE=${PROFILE:-web}
PROFILE_DIR=${PROFILE_DIR:-${DSH_HOME:-/data/dsh}/profiles/${PROFILE}}
LIST=/opt/dsh/extras.txt
MARKER=${PROFILE_DIR}/.dsh-web-extras

[ -f ${LIST} ] || { echo "[extras] 没有 extras.txt"; exit 0; }
desired=$(grep -vE '^[[:space:]]*#' ${LIST} | sed '/^[[:space:]]*$/d' | tr '\n' ',')
current=$(cat ${MARKER} 2>/dev/null || true)
if [ ${desired} = ${current} ]; then echo "[extras] 已与 extras.txt 一致"; exit 0; fi

dsh_v=$(dsh --version 2>/dev/null | tail -1)
echo "[extras] dsh=${dsh_v}"
while IFS= read -r pkg; do
  [ -z ${pkg} ] && continue
  # 三级回退：精确同版本 -> 同 major.minor 最高 -> latest（见 scripts/resolve-extras.mjs）
  resolved=$(node /opt/dsh/scripts/resolve-extras.mjs "${pkg}" "${dsh_v}" 2>/dev/null || true)
  ver=${resolved%% *}
  tier=${resolved##* }
  if [ -z "${ver}" ]; then echo "[extras] 跳过 ${pkg}（无可用版本）"; continue; fi
  echo "[extras] ${pkg} 解析 ${ver}（${tier}）"
  if dsh plugin --profile ${PROFILE} add ${pkg}@${ver} >/dev/null 2>&1; then
    echo "[extras] ${pkg}@${ver} ok"
  else
    echo "[extras] ${pkg}@${ver} 失败" >&2
  fi
done < <(grep -vE '^[[:space:]]*#' ${LIST} | sed '/^[[:space:]]*$/d')
printf '%s' ${desired} > ${MARKER}
