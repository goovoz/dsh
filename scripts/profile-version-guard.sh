#!/usr/bin/env bash
# profile 版本自愈：镜像升级（如 rc.3 → rc.5）后，旧 profile 的 @deepseek-ai/* 仍是旧版本，
# dsh 会把它们逐条判为 incompatible 并禁用（含 web-app），表现为后端不起、页面 502 backend unavailable。
# 检测到版本不一致就把旧 profile 挪到 $DSH_HOME/_backups（必须在 profiles/ 之外：dsh 会把 profiles/* 都当 profile 加载）。
set -uo pipefail
PROFILE_DIR=${PROFILE_DIR:?需要 PROFILE_DIR}
DSH_HOME=${DSH_HOME:?需要 DSH_HOME}
PROFILE=${PROFILE:-web}
[ -f "$PROFILE_DIR/package.json" ] || exit 0
want=$(dsh --version 2>/dev/null | tail -1 | sed 's/^v//' | awk '{print $1}')
have=$(grep -o '"@deepseek-ai/[^"]*": *"[^"]*"' "$PROFILE_DIR/package.json" 2>/dev/null | sed 's/.*: *"//; s/"$//' | sort -u | tr '\n' ',' | sed 's/,$//')
[ -n "$want" ] || exit 0
[ -n "$have" ] || exit 0
if [ "$have" != "$want" ]; then
  mkdir -p "$DSH_HOME/_backups"
  dest="$DSH_HOME/_backups/$PROFILE.bak-$(date +%m%d-%H%M%S)"
  mv "$PROFILE_DIR" "$dest"
  echo "[entrypoint] profile 版本 $have 与运行时 $want 不一致，已备份到 $dest 并重建 profile"
fi
