# 无限五代 破甲 v0.2.3 — 安装说明

DeepSeek Harness 插件（包名 `dsh-armor-gen5`）。把「破甲模式」注册为一个可选 agent preset，
并给选中的会话追加破甲核系统提示（FLASH-FORGE v9.1）、运行期热配置、W5 再锚定与 T4 证据链。

- 宿主：DeepSeek Harness 桌面版（0.2.1-rc.x 及以上）
- 系统：Windows 10/11（PowerShell 5.1 及以上）
- 依赖：无（Node 由 DSH 自带）

---

## 一、包里有什么

```
index.js               服务端半体（预设注册 / 提示词注入 / 瓦解层 / W5 / T4 / 热配置）
client.js              客户端半体（状态条 + 侧栏控制台）
runtime.js             运行期热配置读取器 + 文案池 + 波次窗口
preheat.js             冷启动预热（T4 证据链）
normalize.js           输入归一化（实名/实体 → 占位符）
preset-rows.js         预设插件行（含 ralph 续跑）
cordis.patch.yml       bundle 织入声明
install.ps1            一键安装
uninstall.ps1          一键卸载（带一致性验收）
restore-bundles.ps1    DSH 崩溃恢复后还原 bundles
tools/selftest.mjs     机制自检（14 项，无需宿主）
prompts/               破甲核文本
README.md / CHANGELOG.md / HARNESS_PLUGIN.md
```

---

## 二、安装（二选一）

### 方式 A：本地脚本一键安装（install.ps1，推荐）

1. 解压整个目录到任意位置（不要在压缩包里直接运行）。
2. 在目录里执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

DSH 不在默认位置时指定：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -DshHome "D:\your\.dsh"
```

3. 看到 `[OK] 安装完成` 后，**完全退出 DSH 再启动**（托盘退出，不是关窗口）。
4. 左侧边栏出现「无限五代」控制台；在预设选择器里可选到「破甲模式」。

安装做了什么：把插件复制到 `<DSH_HOME>\plugins\dsh-armor-gen5`，备份 profile `package.json`，
写入依赖与 bundles，`pnpm install`，建立 `node_modules` junction，最后逐文件语法自检。

### 方式 B：tgz + pnpm（适合已用 pnpm 管理插件的环境）

```powershell
# 1. 把 tgz 放进 profile 的包目录
copy dsh-armor-gen5-0.2.3.tgz "$HOME\.dsh\profiles\desktop\desktop-packages\"

# 2. profile package.json 里登记
#    dependencies: "dsh-armor-gen5": "file:./desktop-packages/dsh-armor-gen5-0.2.3.tgz"
#    dsh.profile.bundles 追加 "dsh-armor-gen5"

# 3. 用 DSH 自带的 pnpm 安装（路径随 DSH 版本不同，自动探测）：
$pnpm = @(
  "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.mjs",
  "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\pnpm\bin\pnpm.mjs"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
node $pnpm install --no-frozen-lockfile
```

> pnpm 对同名同版本的 file: tgz 不做内容比对；换了包内容要删掉 `node_modules\dsh-armor-gen5` 再装。

### 方式 C：官方插件管理器 / github: 源码安装（推荐给别人用）

**一键安装**：DSH 插件管理器 → 添加 Git 仓库 → 粘贴 `https://github.com/Minglink/dsh-armor-gen5` → 安装 → 点 **立即启用** → 完全退出 DSH 再启动。（装完再跑一次 `install.ps1` 补齐「破甲模式」预设声明与 `armor-kernel/`，非 `file:` 依赖会自动跳过 junction。）

**手动等价**：在 profile `package.json` 里直接声明 github 源，由 pnpm 安装：

```json
"dependencies": {
  "dsh-armor-gen5": "github:Minglink/dsh-armor-gen5"
}
```

```powershell
$pnpm = @(
  "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.mjs",
  "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\pnpm\bin\pnpm.mjs"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
node $pnpm install --no-frozen-lockfile
```

pnpm 装下来的是**真实包目录**。此时再运行 `install.ps1` 不会破坏它：脚本检测到依赖不是 `file:` 会自动跳过 junction（`[4.5]` 分支），两种安装方式可共存。
`dsh.profile.bundles` 仍需追加 `"dsh-armor-gen5"`；`armor-kernel/` 与 「破甲模式」预设声明只在 profile patch 里生效，官方装完**再跑一次 `install.ps1`** 即可补齐（安全，不会动 node_modules）。

---

## 三、装完怎么确认

控制台「部署自检」应 **19 项全绿**，关键几项：

| 检查项 | 期望 |
|---|---|
| `package-version` | `0.2.3` |
| `implementation-revision` | `20261105-gen5-forge-v915-runtime` |
| `runtime-config` | `hot file`（读到了热配置） |
| `w5-reanchor` | `pool 5 · 3/20 turns` |
| `t4-preheat` | `continuation @ turn 1` |
| `preset-patch` | `profile patch: preset-armor → @deepseek-ai/dsh-agent-preset` |
| `dissolve-constrained` | `命中 N / 覆盖 N`（两者相等） |
| `dissolve-persona-prefix` / `suffix` | `on` |

命令行版（端口换成当前 GUI 的）：

```powershell
Invoke-RestMethod http://127.0.0.1:<PORT>/gen5/verify | Select-Object verdict
```

会话内也可直接调用工具：`gen5_verify` / `infinite_gen5_profile`。

---

## 四、控制台两个按钮的区别

| | 🛡 隔离注入 | ⚡ 启动注入 |
|---|---|---|
| 生效范围 | 只有「破甲模式」预设的会话 | 本 profile 所有预设的会话 |
| 适合 | 日常 | 其它预设也要破甲 |

两者跑同一套流水，只有破甲核的注入范围不同；改完约 3 秒热生效，不需要重启。
「隔离」不是关闭，只是收窄范围。

---

## 五、热配置（免重装调参）

文件：`<DSH_HOME>\.dsh-armor-gen5.json`（不存在时用内置默认值）

```json
{
  "scope": "local",
  "w5": { "maxPerWindow": 3, "windowTurns": 20, "pool": ["自定义文案"] },
  "reanchorEveryTurns": 10,
  "reanchorMax": 50,
  "normalize": true,
  "preheatMode": "continuation",
  "refusalMarkers": ["自定义拒绝词"]
}
```

- `scope`：`local` / `global`，与按钮等价
- `w5.maxPerWindow` / `windowTurns`：波次预算与重置窗口
- `w5.pool`：拒绝修复文案池（留空用内置 5 条）
- `preheatMode`：`continuation`（默认，仅裸续句）/ `always` / `off`
- `normalize`：是否做输入归一化
- `refusalMarkers`：追加的拒绝词，内置词表始终有效

改完保存即生效（mtime 缓存），字段写错只回落该字段默认值，不会让破甲整体失效。

---

## 六、卸载 / 回滚

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1
```

会移除依赖与 bundle、断开 `node_modules` 链接、删除插件目录，并做一致性验收：
断言「本插件干净移除、其余依赖与 bundles 一件未动」，与安装前备份做集合比对。

手工回滚：用 `<DSH_HOME>\profiles\desktop\package.json.bak-gen5-*` 覆盖回 `package.json`，
删除 `plugins\dsh-armor-gen5`，重启。

---

## 七、常见问题

| 症状 | 处理 |
|---|---|
| 预设列表里没有「破甲模式」 | 预设声明在 **profile patch**（`<DSH_HOME>\profiles\desktop\cordis.patch.yml` 的 `preset-armor` 块），由 `install.ps1` 写入。自检项 `preset-patch` 可确认它在不在；`node tools/check-rows.mjs` 可确认 21 个依赖包都在宿主里 |
| 面板「后端版本」与客户端不一致 | 宿主没重启，退出重开 |
| 自检 `dissolve-persona-* = missing` | 刚切过范围时实例接管需约 3 秒；重启后再看一次，仍 missing 请查 `GEN5_SCOPE` 是否锁定了范围 |
| 按钮点了没反应 / 提示路由不存在 | 宿主仍是旧版本，重启；或端口不是当前 GUI 的端口 |
| 中文乱码 | 三个 `.ps1` 必须保持 UTF-8 with BOM |
| 想确认装的是哪一版 | `gen5_verify` 的 `implementation-revision` |

---

## 八、目录位置

```
<DSH_HOME>\plugins\dsh-armor-gen5\              插件正本
<DSH_HOME>\profiles\desktop\node_modules\dsh-armor-gen5   junction → 插件正本
<DSH_HOME>\profiles\desktop\package.json         依赖 + bundles 登记
<DSH_HOME>\.dsh-armor-gen5.json                  热配置
<DSH_HOME>\prompt-inject.md                      若存在，会被作为身份层一并注入
```
