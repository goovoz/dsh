# restore-bundles.ps1 — 一键恢复 desktop profile 的 bundles 列表
#
# 场景:DSH 崩溃恢复会调用 disableAllPlugins(),把 profile 的 bundles
# 清成 stock(@deepseek-ai/dsh-base + dsh-web-app + dsh-community),
# 导致所有第三方插件消失。本脚本把 bundles 恢复为原装清单(不含 dsh-armor-gen5)。
#
# 用法:powershell -NoProfile -ExecutionPolicy Bypass -File .\restore-bundles.ps1
# 前提:DeepSeek Harness 未运行(先退出应用再跑)。

$ErrorActionPreference = "Stop"
$pkgPath = Join-Path $HOME ".dsh\profiles\desktop\package.json"
if (-not (Test-Path $pkgPath)) { Write-Error "未找到 profile: $pkgPath"; exit 1 }

$pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$pkg.dsh.profile.bundles = @(
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "dsh-pocket",
    "dsh-learning-bridge",
    "dsh-pentest-learning-bridge",
    "dsh-modwatch-bridge",
    "dsh-context",
    "dsh-community",
    "dsh-whale-meter",
    "dsh-wanxiang-knowledge",
    "dsh-wanxiang-injection-probe",
    "dsh-infinite-gen-5"
)
$pkgJson = $pkg | ConvertTo-Json -Depth 10
[IO.File]::WriteAllText($pkgPath, $pkgJson + "`n", [Text.UTF8Encoding]::new($false))
Write-Host "[OK] bundles 已恢复为原装清单(不含 dsh-armor-gen5)。重启 DeepSeek Harness 生效。"
