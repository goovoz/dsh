#!/usr/bin/env bash
# 按 plugins/upstreams.tsv 同步 vendored 插件。
# 上游不可用（404 / 网络失败 / 解包失败）时保留当前快照并以 0 退出，绝不删代码。
# 环境变量：SYNC_DRY_RUN=1 只报告不落盘
set -uo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
LIST=plugins/upstreams.tsv
DRY=${SYNC_DRY_RUN:-0}
[ -f "$LIST" ] || { echo "[sync] 没有 $LIST"; exit 0; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
changed=0
unavailable=0
version_of() { python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$1/package.json" 2>/dev/null || echo '?'; }
while IFS=$'\t' read -r name url ref mode note; do
  case "${name:-}" in ''|'#'*) continue ;; esac
  if [ "${mode:-}" != "vendor" ]; then
    echo "[sync] ${name}: mode=${mode:-offline}，跳过（保留本地快照）"
    continue
  fi
  dest="plugins/${name}"
  tar_url="$(printf '%s' "$url" | sed 's|https://github.com/|https://codeload.github.com/|')/tar.gz/refs/heads/${ref}"
  tgz="$tmp/${name}.tar.gz"
  code=$(curl -sSL --max-time 120 -o "$tgz" -w '%{http_code}' "$tar_url" 2>/dev/null || echo 000)
  if [ "$code" != "200" ]; then
    echo "[sync] ${name}: 上游不可用（HTTP ${code}）→ 保留本地版本 $(version_of "$dest")，不删代码"
    unavailable=$((unavailable+1))
    continue
  fi
  rm -rf "$tmp/${name}" && mkdir -p "$tmp/${name}"
  if ! tar -xzf "$tgz" -C "$tmp/${name}" --strip-components=1 2>/dev/null; then
    echo "[sync] ${name}: 解包失败 → 保留本地版本"
    unavailable=$((unavailable+1))
    continue
  fi
  # 安全闸：上游把仓库改成落地页/清空代码时，避免用空壳覆盖本地可用快照
  if [ ! -f "$tmp/${name}/package.json" ] || [ ! -f "$tmp/${name}/index.js" ]; then
    echo "[sync] ${name}: 上游缺 package.json/index.js（看起来代码被移除）→ 保留本地版本 $(version_of "$dest")，不覆盖"
    unavailable=$((unavailable+1))
    continue
  fi
  # 仓库自维护的 dsh-install.sh 不在上游里，同步时保留
  if [ -f "$dest/dsh-install.sh" ]; then cp -a "$dest/dsh-install.sh" "$tmp/${name}/dsh-install.sh"; fi
  if diff -qr "$dest" "$tmp/${name}" >/dev/null 2>&1; then
    echo "[sync] ${name}: 已是最新（$(version_of "$dest")）"
    continue
  fi
  if [ "$DRY" = "1" ]; then
    echo "[sync] ${name}: 有新版本（dry-run，不落盘）→ $(version_of "$tmp/${name}")"
    diff -qr "$dest" "$tmp/${name}" 2>/dev/null | head -8
    changed=$((changed+1))
    continue
  fi
  rm -rf "$dest" && mkdir -p "$dest" && tar -C "$tmp/${name}" -cf - . | tar -C "$dest" -xf -
  echo "[sync] ${name}: 已更新 → $(version_of "$dest")"
  changed=$((changed+1))
done < <(sed 's/\r$//' "$LIST")
echo "[sync] 有更新 ${changed} 个；上游不可用 ${unavailable} 个（均保留本地快照）"
exit 0
