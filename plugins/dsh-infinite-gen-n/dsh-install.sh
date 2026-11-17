#!/usr/bin/env bash
# dsh-infinite-gen-n 安装后置：
#  1) 补回被上游 package.json#files 过滤掉的文件（index.js 需要 lib/host-patch/core.js）；
#  2) 补齐 preset-rows.js 引用、但当前 profile 解析不到的 @deepseek-ai/* 包；
#  3) 过滤掉本宿主仍然加载不到的 preset 行（例如 dsh-tool-office 只有 rc.2/rc.3，
#     而宿主是 rc.1），否则注册 preset 时会 BROKEN 并整条不可选。
set -uo pipefail
PROFILE_DIR=${PROFILE_DIR:?需要 PROFILE_DIR}
PROFILE=${PROFILE:-web}
PLUGIN_DIR=${PLUGIN_DIR:-/opt/plugins/dsh-infinite-gen-n}
name=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['name'])" "$PLUGIN_DIR/package.json" 2>/dev/null || basename "$PLUGIN_DIR")
target="$PROFILE_DIR/node_modules/$name"
if [ ! -d "$target" ]; then echo "[gen-n] 找不到安装副本 $target" >&2; exit 1; fi

# ---- 1) 完整源码覆盖（补 lib/ 等被 files 过滤掉的文件）
cp -a "$PLUGIN_DIR/." "$target/"
echo "[gen-n] 已补全安装副本：$target"

# ---- 2) 预设行依赖补齐
names=$(grep -o '"@deepseek-ai/[A-Za-z0-9./_-]*"' "$PLUGIN_DIR/preset-rows.js" | tr -d '"' | sed 's|@deepseek-ai/||' | cut -d/ -f1 | sort -u)

# 2a) 先软链镜像里已有的全局包（版本与核心一致）：比 pnpm 联网安装快两个数量级（首启 4-5 分钟 → 10 秒级）。
#     代价：破甲补丁会顺着软链写进镜像层，容器重建后需要重点一次「一键破甲」。
GLOBAL_NM=/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules
DEST_NM="$PROFILE_DIR/node_modules"
if [ -d "$GLOBAL_NM/@deepseek-ai" ]; then
  mkdir -p "$DEST_NM/@deepseek-ai"
  linked=0
  for base in $names; do
    pkg="@deepseek-ai/$base"
    src="$GLOBAL_NM/@deepseek-ai/$base"
    dst="$DEST_NM/@deepseek-ai/$base"
    [ -d "$src" ] || continue
    # 已经能 import 就跳过；否则重建软链（pnpm 安装会把不在 package.json 里的目录剪掉，或留下坏副本）
    if (cd "$target" && node --input-type=module -e "import('$pkg').then(()=>process.exit(0),()=>process.exit(1))" >/dev/null 2>&1); then
      continue
    fi
    rm -rf "$dst" 2>/dev/null
    ln -s "$src" "$dst" 2>/dev/null && linked=$((linked+1))
  done
  [ "$linked" = 0 ] || echo "[gen-n] 已软链 $linked 个预设依赖（来自镜像内置包，无需联网安装）"
fi
missing=""
for base in $names; do
  pkg="@deepseek-ai/$base"
  if (cd "$target" && node --input-type=module -e "import('$pkg').then(()=>process.exit(0),()=>process.exit(1))" >/dev/null 2>&1); then
    continue
  fi
  missing="$missing $pkg"
done
if [ -n "$missing" ]; then
  dsh_v=$(dsh --version 2>/dev/null | tail -1)
  installed=0; failed=0
  for pkg in $missing; do
    resolved=$(node /opt/dsh/scripts/resolve-extras.mjs "$pkg" "$dsh_v" 2>/dev/null || true)
    ver=${resolved%% *}
    if [ -z "$ver" ]; then echo "[gen-n] 跳过 $pkg（无可用版本）"; continue; fi
    if dsh plugin --profile "$PROFILE" add "$pkg@$ver" >/dev/null 2>&1; then
      echo "[gen-n] 补装预设依赖 $pkg@$ver"; installed=$((installed+1))
    else
      echo "[gen-n] 补装失败 $pkg@$ver"; failed=$((failed+1))
    fi
  done
  echo "[gen-n] 预设依赖：补装 ${installed} 个，失败 ${failed} 个"
else
  echo "[gen-n] 预设依赖已齐"
fi

# ---- 3) 过滤加载不到的 preset 行（幂等；只有真的丢行时才改写文件）
cat > /tmp/gen-n-filter.mjs <<'JS'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const file = process.argv[2]
const requireFrom = createRequire(file)
const mod = await import(new URL('file://' + file).href + '?v=' + Date.now())
const rows = Array.isArray(mod.ROWS) ? mod.ROWS : []
const SELF = 'dsh-infinite-gen-n'
const keep = []; const dropped = []
for (const row of rows) {
  const rowName = row && row.name
  if (!rowName || String(rowName).startsWith('cordis:')) { keep.push(row); continue }
  if (rowName === SELF) { keep.push(row); continue }
  try { requireFrom.resolve(rowName); keep.push(row) } catch { dropped.push(rowName) }
}
if (dropped.length) {
  fs.writeFileSync(file, 'export const ROWS = ' + JSON.stringify(keep, null, 2) + '\n')
}
console.log(JSON.stringify({ kept: keep.length, dropped }))
JS
# createRequire 以 preset-rows.js 为基准解析，与 cwd 无关
filtered=$(cd "$target" && node /tmp/gen-n-filter.mjs "$target/preset-rows.js" 2>/dev/null || true)
echo "[gen-n] preset 行过滤：${filtered:-skipped}"
exit 0
