# uninstall.ps1 — dsh-armor-gen5 卸载
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1 [-DshHome "D:\your\.dsh"]

[CmdletBinding()]
param(
    [string]$DshHome = ''
)

$ErrorActionPreference = "Stop"
$pluginName = "dsh-armor-gen5"

$dshHome = if (-not [string]::IsNullOrWhiteSpace($DshHome)) { $DshHome }
           elseif (-not [string]::IsNullOrWhiteSpace($env:DSH_HOME)) { $env:DSH_HOME }
           else { Join-Path $HOME ".dsh" }

# 0. 记录卸载前的"其余"条目（排除本插件），供末尾一致性断言使用。
$pkgPath = Join-Path $dshHome "profiles\desktop\package.json"
$beforeDeps = @()
$beforeBundles = @()
if (Test-Path $pkgPath) {
    $before = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $beforeDeps = @($before.dependencies.PSObject.Properties.Name | Where-Object { $_ -ne $pluginName })
    $beforeBundles = @($before.dsh.profile.bundles | Where-Object { $_ -ne $pluginName })
    Write-Host "[0] 卸载前记录：$($beforeDeps.Count) 个依赖 / $($beforeBundles.Count) 个 bundles"
}

# 1. 从 profile package.json 移除
if (Test-Path $pkgPath) {
    $pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($pkg.dependencies.PSObject.Properties[$pluginName]) {
        $pkg.dependencies.PSObject.Properties.Remove($pluginName)
    }
    $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles | Where-Object { $_ -ne $pluginName })
    $pkgJson = $pkg | ConvertTo-Json -Depth 10
    # 无 BOM UTF-8 写回：Set-Content -Encoding UTF8 会带 BOM，导致 pnpm/Node 报 Invalid package.json
    [IO.File]::WriteAllText($pkgPath, $pkgJson + "`n", [System.Text.UTF8Encoding]::new($false))
    Write-Host "[1] 已从 profile 移除 $pluginName"
}

# 1.5 先断开 node_modules 链接，再让 pnpm 清理。
# 顺序很重要：pnpm install 清理 node_modules 时若把 junction 当真实目录跟随，
# 会递归删掉它指向的插件正本（数据丢失）。所以必须先把链接摘掉。
$nmLink = Join-Path $dshHome "profiles\desktop\node_modules\$pluginName"
if (Test-Path $nmLink) {
    $linkItem = Get-Item $nmLink -Force
    if ($linkItem.LinkType -eq "Junction" -or $linkItem.LinkType -eq "SymbolicLink") {
        cmd /c rmdir "$nmLink" | Out-Null
        Write-Host "[1.5] 已断开 node_modules 链接（插件正本未被改动）"
    } else {
        Remove-Item $nmLink -Recurse -Force
        Write-Host "[1.5] 已移除 node_modules 副本"
    }
}

# 1.6 pnpm 同步（此时链接已断开）
Push-Location (Join-Path $dshHome "profiles\desktop")
# 经 cmd 合并 stderr 为纯文本：EAP=Stop 下 2>&1 会把 stderr 噪声当终止错误
try { cmd /c "pnpm install --no-frozen-lockfile 2>&1" | Select-Object -Last 2 } finally { Pop-Location }

# 2. 删除插件目录
$destDir = Join-Path $dshHome "plugins\$pluginName"
if (Test-Path $destDir) {
    Remove-Item $destDir -Recurse -Force
    Write-Host "[2] 已删除: $destDir"
}

# 2.5 从 profile patch 移除 preset 声明块（install.ps1 写的标记块）
$patchPath = Join-Path $dshHome "profiles\desktop\cordis.patch.yml"
if (Test-Path $patchPath) {
    $presetBegin = '# >>> armor preset (dsh-armor-gen5) begin'
    $presetEnd = '# <<< armor preset (dsh-armor-gen5) end'
    $raw = [IO.File]::ReadAllText($patchPath, [Text.Encoding]::UTF8)
    $s = $raw.IndexOf($presetBegin, [StringComparison]::Ordinal)
    if ($s -ge 0) {
        $e = $raw.IndexOf($presetEnd, [StringComparison]::Ordinal)
        if ($e -gt $s) {
            $e2 = $raw.IndexOf("`n", $e)
            if ($e2 -lt 0) { $e2 = $raw.Length }
            $raw = $raw.Remove($s, $e2 - $s)
            [IO.File]::WriteAllText($patchPath, $raw.TrimEnd([char[]]"`r`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "[2.5] 已从 profile patch 移除 preset 声明块"
        }
    }
}

# 2.6 删除 preset 内核副本（install.ps1 的 [3.3] 写的）
$kernelDir = Join-Path $dshHome "profiles\desktop\armor-kernel"
if (Test-Path $kernelDir) {
    Remove-Item $kernelDir -Recurse -Force
    Write-Host "[2.6] 已删除 preset 内核: $kernelDir"
}

# 3. 一致性断言：本插件干净移除，其余依赖与 bundles 一件未动。
#    把"卸载后与安装前一致"当交付标准，不靠肉眼确认。
$fail = @()
if (Test-Path $pkgPath) {
    $after = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $afterDeps = @($after.dependencies.PSObject.Properties.Name)
    $afterBundles = @($after.dsh.profile.bundles)
    if ($afterDeps -contains $pluginName) { $fail += "dependencies 里仍存在 $pluginName" }
    if ($afterBundles -contains $pluginName) { $fail += "bundles 里仍存在 $pluginName" }
    $depDiff = @(Compare-Object -ReferenceObject @($beforeDeps | Where-Object { $_ }) -DifferenceObject @($afterDeps | Where-Object { $_ }))
    if ($depDiff.Count -gt 0) {
        $fail += ("其余依赖发生变化: " + (($depDiff | ForEach-Object { "$($_.SideIndicator)$($_.InputObject)" }) -join ", "))
    }
    $bundleDiff = @(Compare-Object -ReferenceObject @($beforeBundles | Where-Object { $_ }) -DifferenceObject @($afterBundles | Where-Object { $_ }))
    if ($bundleDiff.Count -gt 0) {
        $fail += ("其余 bundles 发生变化: " + (($bundleDiff | ForEach-Object { "$($_.SideIndicator)$($_.InputObject)" }) -join ", "))
    }
}
if (Test-Path $destDir) { $fail += "插件目录仍存在: $destDir" }
if (Test-Path $nmLink) { $fail += "node_modules 链接仍存在: $nmLink" }

# 3.5 与安装前备份做集合比对（备份存在时）
$latestBak = Get-ChildItem -Path (Join-Path $dshHome "profiles\desktop") -Filter "package.json.bak-gen5-*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestBak -and (Test-Path $pkgPath)) {
    $bak = Get-Content $latestBak.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $bakDeps = @($bak.dependencies.PSObject.Properties.Name | Where-Object { $_ -ne $pluginName } | Sort-Object)
    $nowDeps = @((Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json).dependencies.PSObject.Properties.Name | Sort-Object)
    $bakDiff = @(Compare-Object -ReferenceObject @($bakDeps | Where-Object { $_ }) -DifferenceObject @($nowDeps | Where-Object { $_ }))
    if ($bakDiff.Count -eq 0) {
        Write-Host "[3.5] 依赖集与安装前备份一致（$($bakDeps.Count) 项）"
    } else {
        $fail += ("依赖集与安装前备份不一致: " + (($bakDiff | ForEach-Object { "$($_.SideIndicator)$($_.InputObject)" }) -join ", "))
    }
}

Write-Host ""
if ($fail.Count -eq 0) {
    Write-Host "[OK] 卸载完成，验收通过（其余依赖/bundles 未被改动）。重启 DeepSeek Harness 生效。" -ForegroundColor Green
} else {
    Write-Host "[!] 卸载完成但验收未通过：" -ForegroundColor Yellow
    $fail | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
    if ($latestBak) { Write-Host "    备份可用于手工回滚: $($latestBak.FullName)" -ForegroundColor Yellow }
}
pause
