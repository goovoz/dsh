# install.ps1 — 无限五代 破甲 v$pluginVer 一键安装（dsh-armor-gen5）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
# 前提：目标机器已安装 DeepSeek Harness 并至少成功启动过一次（存在 ~/.dsh）。
#
# 本脚本做五件事：
#   1. 定位 DSH home（%USERPROFILE%\.dsh，或 $env:DSH_HOME）
#   2. 复制插件到 ~/.dsh/plugins/dsh-armor-gen5
#   3. 向 desktop profile 的 package.json 写入依赖 + bundles
#   4. pnpm install 同步
#   5. 语法自检 + 输出验证报告

[CmdletBinding()]
param(
    [string]$DshHome = '',
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$pluginName = "dsh-armor-gen5"
$pluginDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkgMeta    = Get-Content (Join-Path $pluginDir 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$pluginVer  = $pkgMeta.version

Write-Host "=============================================="
Write-Host " 无限五代 破甲 v$pluginVer — 安装（$pluginName）"
Write-Host "=============================================="

# ---- 1. DSH home ----
$dshHome = if (-not [string]::IsNullOrWhiteSpace($DshHome)) { $DshHome }
           elseif (-not [string]::IsNullOrWhiteSpace($env:DSH_HOME)) { $env:DSH_HOME }
           else { Join-Path $HOME ".dsh" }
if (-not (Test-Path $dshHome)) {
    Write-Error "未找到 DSH home：$dshHome 。请先安装并启动一次 DeepSeek Harness。"
    exit 1
}
Write-Host "[1] DSH home: $dshHome"
$packHome = Join-Path $dshHome 'armor-gen5\packs'
New-Item -ItemType Directory -Path $packHome -Force | Out-Null
Write-Host "[1.1] 破甲词库目录: $packHome（升级/卸载均保留）"

# ---- 2. 复制插件（先移开旧安装：重复安装时 Copy-Item -Recurse 会把 tools/ 套成 tools/tools/）----
$pluginsDir = Join-Path $dshHome "plugins"
$destDir = Join-Path $pluginsDir $pluginName
if (Test-Path $destDir) {
    if ($Force) {
        Remove-Item $destDir -Recurse -Force
    } else {
        $prev = "$destDir.prev-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
        Move-Item $destDir $prev
        Write-Host "[2.0] 旧安装已移开: $(Split-Path -Leaf $prev)"
    }
}
New-Item -ItemType Directory -Path $destDir -Force | Out-Null
Get-ChildItem $pluginDir | Where-Object { $_.Name -notin @('install.ps1', 'uninstall.ps1') } | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $destDir $_.Name) -Recurse -Force
}
Write-Host "[2] 插件已复制到: $destDir"

# ---- 3. profile package.json ----
$profileDir = Join-Path $dshHome "profiles\desktop"
$pkgPath = Join-Path $profileDir "package.json"
if (-not (Test-Path $pkgPath)) {
    Write-Error "未找到 desktop profile：$pkgPath 。请先启动一次 DeepSeek Harness。"
    exit 1
}
# 安装前备份：uninstall.ps1 用它做"卸载后其余依赖未被改动"的断言。
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$pkgBak = "$pkgPath.bak-gen5-$stamp"
Copy-Item -LiteralPath $pkgPath -Destination $pkgBak -Force
Write-Host "[3.0] profile 已备份: $(Split-Path -Leaf $pkgBak)"
$pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $pkg.dependencies.PSObject.Properties[$pluginName]) {
    $pkg.dependencies | Add-Member -NotePropertyName $pluginName -NotePropertyValue "file:../../plugins/$pluginName"
}
if (-not ($pkg.dsh.profile.bundles -contains $pluginName)) {
    $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles) + $pluginName
}
$pkgJson = $pkg | ConvertTo-Json -Depth 10
# 无 BOM UTF-8 写回：Set-Content -Encoding UTF8 会带 BOM，导致 pnpm/Node 报 Invalid package.json
[IO.File]::WriteAllText($pkgPath, $pkgJson + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "[3] profile 已登记依赖 + bundles"

# ---- 3.2 声明「破甲模式」预设（写进 profile patch）----
# 预设必须声明在 profile patch 里：agent-preset-registry 位于 web-app 的 entry-local realm，
# 插件自己的 bundle patch 是 sibling 行，看不到那个 realm（dsh-web-app patch 注释原文：
# "invisible to every sibling row outside that realm"）。运行时 ctx.get('agentPresets') 同样拿不到。
$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$presetBegin = '# >>> armor preset (dsh-armor-gen5) begin'
$presetEnd = '# <<< armor preset (dsh-armor-gen5) end'
if (Test-Path $patchPath) {
    Copy-Item -LiteralPath $patchPath -Destination "$patchPath.bak-gen5-$stamp" -Force
    $raw = [IO.File]::ReadAllText($patchPath, [Text.Encoding]::UTF8)
    $s = $raw.IndexOf($presetBegin, [StringComparison]::Ordinal)
    if ($s -ge 0) {
        $e = $raw.IndexOf($presetEnd, [StringComparison]::Ordinal)
        if ($e -gt $s) {
            $e2 = $raw.IndexOf("`n", $e)
            if ($e2 -lt 0) { $e2 = $raw.Length }
            $raw = $raw.Remove($s, $e2 - $s)
        }
    }
    $block = & node (Join-Path $destDir 'tools\gen-bundle-patch.mjs') --print-preset
    if ($LASTEXITCODE -ne 0 -or -not $block) {
        Write-Host "[3.2] preset 生成失败，跳过（预设不会出现在列表）" -ForegroundColor Yellow
    } else {
        $out = $raw.TrimEnd([char[]]"`r`n") + "`n`n" + $presetBegin + "`n" + (($block -join "`n").TrimEnd()) + "`n" + $presetEnd + "`n"
        [IO.File]::WriteAllText($patchPath, $out, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "[3.2] preset 已写入 profile patch（重启后出现在预设列表）"
    }
}

# ---- 3.3 复制内核副本到 profile（preset 内挂载用）----
# preset 里的插件行写的是相对 profile 的路径（'./armor-kernel/index.js'）：
# preset realm 的 baseUrl 在 asar 内，包名和 '../..' 相对路径都解析不到它，
# 只有 profile 目录内的相对路径可用。
$kernelDir = Join-Path $profileDir 'armor-kernel'
if (Test-Path $kernelDir) { Remove-Item $kernelDir -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $kernelDir 'prompts') -Force | Out-Null
foreach ($f in @('index.js', 'runtime.js', 'preheat.js', 'normalize.js', 'prompt-pack.js', 'preset-rows.js', 'package.json')) {
    $from = Join-Path $destDir $f
    if (Test-Path $from) { Copy-Item $from (Join-Path $kernelDir $f) -Force }
}
foreach ($f in @('infinite-gen-5.md', 'armor-persona-prefix.md', 'armor-seal.md')) {
    $from = Join-Path $destDir "prompts\$f"
    if (Test-Path $from) { Copy-Item $from (Join-Path $kernelDir "prompts\$f") -Force }
}
Write-Host "[3.3] preset 内核已复制到: $kernelDir"

# ---- 4. pnpm install ----
Write-Host "[4] pnpm install ..."
Push-Location $profileDir
# 经 cmd 合并 stderr 为纯文本：EAP=Stop 下 2>&1 会把 stderr 噪声（如 peer 警告）当终止错误
try {
    cmd /c "pnpm install --no-frozen-lockfile 2>&1" | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) { Write-Host "    pnpm install 退出码: $LASTEXITCODE" -ForegroundColor Yellow }
} finally { Pop-Location }

# ---- 4.5 node_modules junction（防 pnpm 复制不完整导致 failed to import）----
# 只对 file: 依赖做 junction。github:/npm 等官方安装方式下 pnpm 装的是真实包目录，
# 强行换成 junction 会让 realpath 指向 plugins 副本，副本缺失即报告"包元信息错误: ENOENT"，
# 同时 DSH 报 profile is no longer self-contained。非 file: 依赖一律保留原状。
$spec = "$($pkg.dependencies.PSObject.Properties[$pluginName].Value)"
$nmLink = Join-Path $profileDir "node_modules\$pluginName"
if ($spec -notlike "file:*") {
    Write-Host "[4.5] 依赖是 $spec（非 file:），保留官方安装的 node_modules 目录，跳过 junction"
} elseif (Test-Path $nmLink) {
    $linkItem = Get-Item $nmLink -Force
    if ($linkItem.LinkType -ne "Junction") {
        Remove-Item $nmLink -Recurse -Force
        cmd /c mklink /j "$nmLink" "$destDir" | Out-Null
        Write-Host "[4.5] node_modules 链接已重建为 junction -> $destDir"
    } else {
        Write-Host "[4.5] node_modules junction 已存在"
    }
} else {
    cmd /c mklink /j "$nmLink" "$destDir" | Out-Null
    Write-Host "[4.5] node_modules junction 已创建 -> $destDir"
}

# ---- 5. 自检 ----
Write-Host "[5] 语法自检:"
$ok = $true
foreach ($f in @("index.js", "client.js", "preheat.js", "normalize.js", "prompt-pack.js", "preset-rows.js")) {
    $p = Join-Path $destDir $f
    & node --check $p 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Host "    FAIL: $f" -ForegroundColor Red; $ok = $false }
}
$linked = Test-Path (Join-Path $profileDir "node_modules\$pluginName\package.json")
Write-Host ("    node_modules 链接: " + $linked)

Write-Host ""
if ($ok -and $linked) {
    Write-Host "[OK] 安装完成。重启 DeepSeek Harness 后：" -ForegroundColor Green
    Write-Host "     - 新会话选择「破甲模式」预设 → 输入框下方出现带绿点的徽标"
    Write-Host "       ● 无限五代 破甲 v$pluginVer"
    Write-Host "     - 左侧边栏出现 ⚡无限五代 控制台面板"
    Write-Host "     - 会话内可用工具: gen5_verify / infinite_gen5_profile"
} else {
    Write-Host "[!] 存在失败项，请检查上方输出。" -ForegroundColor Yellow
}
Write-Host ""
pause
