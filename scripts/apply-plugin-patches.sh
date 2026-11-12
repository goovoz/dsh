#!/usr/bin/env bash
# 把 patches/*.patch 依次打到插件库上（构建期执行，已打过则跳过）
set -uo pipefail
PLUGINS=${1:-/opt/plugins}
PATCHES=${2:-/opt/patches}
shopt -s nullglob
found=0
for p in "$PATCHES"/*.patch; do
  found=1
  name=$(basename "$p")
  # 只装了部分插件时，补丁对应的目标文件可能不在镜像里 —— 跳过而不是报冲突
  targets=$(grep -E '^\+\+\+ ' "$p" | awk '{print $2}' | sed 's|^[ab]/||' | sort -u)
  present=0
  for t in $targets; do [ -e "$PLUGINS/$t" ] && present=1; done
  if [ "$present" = 0 ]; then
    echo "[patch] skip $name（目标插件未包含在本镜像）"
    continue
  fi
  if patch -p1 -d "$PLUGINS" -N --forward --dry-run < "$p" >/dev/null 2>&1; then
    patch -p1 -d "$PLUGINS" -N --forward < "$p" >/dev/null
    echo "[patch] applied $name"
  elif patch -p1 -d "$PLUGINS" -R --dry-run < "$p" >/dev/null 2>&1; then
    echo "[patch] already applied $name"
  else
    echo "[patch] CONFLICT $name（插件版本变了？按 plugins/README 重新生成）" >&2
    exit 1
  fi
done
[ "$found" = 1 ] || echo "[patch] 没有补丁"
