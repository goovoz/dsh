#!/usr/bin/env bash
# 容器入口：装 extras ->（可选）装插件 -> 起 gateway -> 守护 dsh web
set -uo pipefail

PROFILE="${DSH_PROFILE_NAME:-web}"
export PROFILE
export PROFILE_DIR="${DSH_HOME}/profiles/${PROFILE}"
mkdir -p "${DSH_HOME}" "${DSH_WORKSPACE}" /run/dsh
export PUBLIC_HOST="${PUBLIC_HOST:-127.0.0.1:8899}"

echo "[entrypoint] dsh $(dsh --version 2>/dev/null | head -1) | home=${DSH_HOME} | profile=${PROFILE} | public=${PUBLIC_HOST}"
case "${PUBLIC_HOST}" in
  127.*|localhost:*|0.0.0.0:*)
    echo "[entrypoint] 提示：PUBLIC_HOST=${PUBLIC_HOST} 是回环地址；从其它机器请用 http://<宿主机IP>:<端口>/ 访问"
    echo "[entrypoint]       （网关会把上游 Host 规整为 ${PUBLIC_HOST}，功能不受影响；只是日志里的链接只对本机有效）"
    ;;
esac

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
  echo "[entrypoint] starting: dsh --profile ${PROFILE} --host 127.0.0.1 --port ${DSH_WEB_PORT} --public-url http://${PUBLIC_HOST}/ --trusted-host ${PUBLIC_HOST} ${PUBLIC_HOST%%:*}"
  dsh --profile "${PROFILE}" \
      --host 127.0.0.1 \
      --port "${DSH_WEB_PORT:-3080}" \
      --no-open \
      --public-url "http://${PUBLIC_HOST}/" \
      --trusted-host "${PUBLIC_HOST}" "${PUBLIC_HOST%%:*}" \
      2>&1 | node /opt/dsh/capture.mjs
  code=$?
  echo "[entrypoint] dsh exited (code=${code}); restarting in 3s"
  rm -f /run/dsh/launch-token
  sleep 3
done
