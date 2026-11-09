#!/usr/bin/env bash
# 按 plugins/enabled.txt 把插件装进 profile，并执行插件自带的后置脚本
set -uo pipefail
PROFILE=${PROFILE:-web}
PROFILE_DIR=${PROFILE_DIR:-${DSH_HOME:-/data/dsh}/profiles/$PROFILE}
ROOT=${PLUGINS_DIR:-/opt/plugins}
LIST="$ROOT/enabled.txt"

[ -f "$LIST" ] || { echo "[plugins] 没有 enabled.txt，跳过"; exit 0; }
mkdir -p "$PROFILE_DIR"

while IFS= read -r name; do
  case "$name" in ''|'#'*) continue ;; esac
  dir="$ROOT/$name"
  if [ ! -d "$dir" ]; then echo "[plugins] 缺目录 $dir" >&2; continue; fi
  stamp=$(cd "$dir" && stat -c '%Y-%s' package.json 2>/dev/null || echo 0)
  marker="$PROFILE_DIR/.plugin-$name"
  if [ -f "$marker" ] && [ "$(cat "$marker")" = "$stamp" ]; then
    echo "[plugins] $name 已就绪"; continue
  fi
  echo "[plugins] 安装 $name"
  if ! dsh plugin --profile "$PROFILE" add "file:$dir" >/dev/null 2>&1; then
    echo "[plugins] dsh plugin add 失败：$name" >&2
  fi
  if [ -x "$dir/dsh-install.sh" ]; then
    if ! PROFILE_DIR="$PROFILE_DIR" PLUGIN_DIR="$dir" bash "$dir/dsh-install.sh"; then
      echo "[plugins] $name 后置脚本失败" >&2
    fi
  fi
  printf '%s' "$stamp" > "$marker"
done < <(grep -vE '^[[:space:]]*#' "$LIST" | sed '/^[[:space:]]*$/d')
