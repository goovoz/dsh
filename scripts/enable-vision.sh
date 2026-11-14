#!/usr/bin/env bash
# 给 profile 里 llm-pi-ai 的模型补上 input: [ text, image ]（幂等）
set -uo pipefail
PROFILE="${PROFILE:-${DSH_PROFILE_NAME:-web}}"
PROFILE_DIR="${PROFILE_DIR:-${DSH_HOME:-/data/dsh}/profiles/${PROFILE}}"
PATCH="${PROFILE_DIR}/cordis.patch.yml"

if [ "${DSH_ENABLE_VISION:-1}" != "1" ]; then
  echo "[vision] 已禁用（DSH_ENABLE_VISION=0）"
  exit 0
fi

if [ ! -f "${PATCH}" ]; then
  echo "[vision] 还没有 ${PATCH}（profile 尚未初始化），跳过"
  exit 0
fi

DSH_VISION_EXCLUDE="${DSH_VISION_EXCLUDE:-}" node /opt/dsh/scripts/enable-vision.mjs "${PATCH}"
