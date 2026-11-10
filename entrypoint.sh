#!/usr/bin/env bash
# 容器入口：校验并规范化 PUBLIC_HOST -> 装 extras ->（可选）装插件 -> 起 gateway -> 守护 dsh web
set -uo pipefail

PROFILE="${DSH_PROFILE_NAME:-web}"
export PROFILE
export PROFILE_DIR="${DSH_HOME}/profiles/${PROFILE}"
mkdir -p "${DSH_HOME}" "${DSH_WORKSPACE}" /run/dsh

PORT="${DSH_PORT:-8899}"
PLACEHOLDER='192.168.1.1'

hint_ips() {
  echo "  提示：PUBLIC_HOST 必须是宿主机上、浏览器能访问到的地址（host[:port]）。"
  local gw
  gw="$(ip route 2>/dev/null | awk '/^default/{print $3; exit}')"
  [ -n "${gw}" ] && echo "    - 容器默认网关（宿主机在 docker 网桥上的地址，仅作参考）: http://${gw}:${PORT}/"
  echo "    - 宿主机局域网 IP：在宿主机执行 ip addr / ifconfig 查，再填 http://<IP>:${PORT}/"
  echo "    - 走反代/域名时填域名（可带 scheme）：app.example.com 或 https://app.example.com"
  echo "    - 本机自测：PUBLIC_HOST=127.0.0.1:${PORT} DSH_ALLOW_LOOPBACK=1 make up"
}

fail() {
  echo "[entrypoint] ✗ PUBLIC_HOST 未正确设置：$1" >&2
  echo "[entrypoint]   PUBLIC_HOST 必须等于浏览器实际访问的 host[:port]，例如 192.168.1.10:${PORT} 或 app.example.com" >&2
  hint_ips >&2
  exit 64
}

# 规范化：允许 https://host:port/ 这种完整 URL，拆成 scheme + host[:port]
RAW_HOST="${PUBLIC_HOST:-}"
SCHEME='http'
case "${RAW_HOST}" in
  https://*) SCHEME='https'; RAW_HOST="${RAW_HOST#https://}" ;;
  http://*)  SCHEME='http';  RAW_HOST="${RAW_HOST#http://}" ;;
esac
RAW_HOST="${RAW_HOST%%/*}"
PUBLIC_HOST="${RAW_HOST}"

case "${PUBLIC_HOST}" in
  '') fail "为空（required）" ;;
  ${PLACEHOLDER}|${PLACEHOLDER}:*) fail "还是占位默认值 ${PUBLIC_HOST}，请改成真实地址" ;;
  127.*|localhost|localhost:*|0.0.0.0|0.0.0.0:*|'[::1]'|'[::1]':*)
    if [ "${DSH_ALLOW_LOOPBACK:-0}" = "1" ]; then
      echo "[entrypoint] ⚠ PUBLIC_HOST=${PUBLIC_HOST} 是回环地址（DSH_ALLOW_LOOPBACK=1 已放行，仅本机可用）"
    else
      fail "是回环地址 ${PUBLIC_HOST}，其它机器访问不到"
    fi
    ;;
esac

PUBLIC_URL="${SCHEME}://${PUBLIC_HOST}/"
INTERNAL_AUTHORITY="${DSH_INTERNAL_AUTHORITY:-${PUBLIC_HOST}}"
export INTERNAL_AUTHORITY

echo "[entrypoint] dsh $(dsh --version 2>/dev/null | head -1) | home=${DSH_HOME} | profile=${PROFILE} | 访问地址=${PUBLIC_URL}"

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

# 连续快速崩溃时退避，避免日志洪泛与 CPU 打满
BACKOFF=3
while true; do
  STARTED_AT=$(date +%s)
  echo "[entrypoint] starting: dsh --profile ${PROFILE} --host 127.0.0.1 --port ${DSH_WEB_PORT} --public-url ${PUBLIC_URL} --trusted-host ${INTERNAL_AUTHORITY}"
  dsh --profile "${PROFILE}" \
      --host 127.0.0.1 \
      --port "${DSH_WEB_PORT:-3080}" \
      --no-open \
      --public-url "${PUBLIC_URL}" \
      --trusted-host "${INTERNAL_AUTHORITY}" "${INTERNAL_AUTHORITY%%:*}" 127.0.0.1 "127.0.0.1:${DSH_WEB_PORT:-3080}" \
      2>&1 | node /opt/dsh/capture.mjs
  code=$?
  RAN_FOR=$(( $(date +%s) - STARTED_AT ))
  if [ "${RAN_FOR}" -ge 60 ]; then BACKOFF=3; fi
  echo "[entrypoint] dsh exited (code=${code}, ran ${RAN_FOR}s); restarting in ${BACKOFF}s"
  rm -f /run/dsh/launch-token
  sleep "${BACKOFF}"
  BACKOFF=$(( BACKOFF * 2 > 60 ? 60 : BACKOFF * 2 ))
done
