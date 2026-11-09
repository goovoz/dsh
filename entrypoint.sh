#!/usr/bin/env bash
# 容器入口：装 extras ->（可选）装插件 -> 起 gateway -> 守护 dsh web
set -uo pipefail

PROFILE="${DSH_PROFILE_NAME:-web}"
export PROFILE
export PROFILE_DIR="${DSH_HOME}/profiles/${PROFILE}"
mkdir -p "${DSH_HOME}" "${DSH_WORKSPACE}" /run/dsh

# 访问地址不再必填：PUBLIC_HOST 只作为「显式覆盖 + 展示用」，
# DSH 实际使用的内部 authority 由 INTERNAL_AUTHORITY 固定，网关负责改写上游 Host。
PUBLIC_HOST="${PUBLIC_HOST:-}"
INTERNAL_AUTHORITY="${DSH_INTERNAL_AUTHORITY:-${PUBLIC_HOST:-dsh.internal}}"
export INTERNAL_AUTHORITY
DISPLAY_HOST="${PUBLIC_HOST:-127.0.0.1:${DSH_PORT:-8899}}"

echo "[entrypoint] dsh $(dsh --version 2>/dev/null | head -1) | home=${DSH_HOME} | profile=${PROFILE}"
if [ -n "${PUBLIC_HOST}" ]; then
  echo "[entrypoint] authority=${INTERNAL_AUTHORITY}（来自 PUBLIC_HOST）"
else
  echo "[entrypoint] authority=${INTERNAL_AUTHORITY}（自动：浏览器用 http://<本机IP>:<端口>/ 访问即可）"
fi

if [ "${DSH_EXTRAS:-1}" = "1" ]; then
  /opt/dsh/scripts/install-extras.sh || echo "[entrypoint] extras 安装失败（继续启动）"
fi

if [ "${DSH_PLUGINS:-0}" = "1" ]; then
  /opt/dsh/scripts/install-plugins.sh || echo "[entrypoint] 插件安装失败（继续启动）"
else
  echo "[entrypoint] 第三方插件未启用（DSH_PLUGINS=0）"
fi

node /opt/dsh/gateway.mjs &
GATEWAY_PID=$!
trap 'kill -TERM "${GATEWAY_PID}" 2>/dev/null' EXIT

while true; do
  echo "[entrypoint] starting: dsh --profile ${PROFILE} --host 127.0.0.1 --port ${DSH_WEB_PORT} --trusted-host ${INTERNAL_AUTHORITY}"
  dsh --profile "${PROFILE}" \
      --host 127.0.0.1 \
      --port "${DSH_WEB_PORT:-3080}" \
      --no-open \
      --public-url "http://${DISPLAY_HOST}/" \
      --trusted-host "${INTERNAL_AUTHORITY}" "${INTERNAL_AUTHORITY%%:*}" 127.0.0.1 "127.0.0.1:${DSH_WEB_PORT:-3080}" \
      2>&1 | node /opt/dsh/capture.mjs
  code=$?
  echo "[entrypoint] dsh exited (code=${code}); restarting in 3s"
  rm -f /run/dsh/launch-token
  sleep 3
done
