#!/usr/bin/env bash
# 把 PLUGINS 规格归一化，供 Makefile / Dockerfile / CI 共用
#
#   PLUGINS=all | 1 | 空      -> 全部插件（plugins/enabled.txt 里的每一项）
#   PLUGINS=none | 0          -> 不带任何插件
#   PLUGINS=a,b,c             -> 只带这几个（也接受空格分隔）
#
# 用法：
#   bash scripts/resolve-plugins.sh spec   <PLUGINS>   # 输出逗号分隔列表，可为空
#   bash scripts/resolve-plugins.sh suffix <PLUGINS>   # 输出镜像 tag 后缀
#   bash scripts/resolve-plugins.sh check  <PLUGINS>   # 校验插件目录都存在
set -uo pipefail
ROOT=${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
ENABLED="$ROOT/plugins/enabled.txt"

all_list() {
  grep -vE '^[[:space:]]*#' "$ENABLED" 2>/dev/null \
    | sed 's/[[:space:]]*$//' \
    | sed '/^[[:space:]]*$/d' \
    | tr '\n' ',' | sed 's/,$//'
}

normalize() {
  local raw="$1"
  raw=$(printf '%s' "$raw" | tr ' ' ',' | sed 's/,,*/,/g; s/^,//; s/,$//')
  printf '%s' "$raw"
}

mode=${1:-spec}
raw=${2:-all}
ALL=$(all_list)

case "$(printf '%s' "$raw" | tr 'A-Z' 'a-z')" in
  ''|0|none|no)      SPEC="" ;;
  1|all|yes)         SPEC="$ALL" ;;
  *)                 SPEC=$(normalize "$raw") ;;
esac

case "$mode" in
  spec)
    printf '%s\n' "$SPEC"
    ;;
  suffix)
    if [ -z "$SPEC" ]; then
      printf '\n'
    elif [ "$SPEC" = "$ALL" ]; then
      printf -- '-plugins\n'
    else
      n=$(printf '%s' "$SPEC" | tr ',' '\n' | grep -c .)
      if [ "$n" = "1" ]; then
        printf -- '-plugins-%s\n' "$SPEC"
      else
        printf -- '-plugins-multi-%s\n' "$(printf '%s' "$SPEC" | sha1sum | cut -c1-6)"
      fi
    fi
    ;;
  check)
    rc=0
    IFS=',' read -r -a items <<< "$SPEC"
    for name in "${items[@]}"; do
      [ -z "$name" ] && continue
      if [ ! -d "$ROOT/plugins/$name" ]; then
        echo "[plugins] 未知插件: $name（可选：$(printf '%s' "$ALL" | tr ',' ' ')）" >&2
        rc=1
      fi
    done
    exit $rc
    ;;
  *)
    echo "usage: resolve-plugins.sh {spec|suffix|check} <PLUGINS>" >&2
    exit 2
    ;;
esac