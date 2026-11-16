# 插件库

本目录是**构建进镜像的插件来源**。每个子目录一个插件包（含 `package.json`），
构建时按 `enabled.txt` 拷进镜像 `/opt/plugins`，容器启动时按同一份清单装进 profile。

## 默认清单（`enabled.txt`）

```
dsh-infinite-gen-n     # 破甲插件（无限N代），替代已退役的 dsh-armor-gen5
qinglong-cli           # 青龙面板客户端
```

`WITH_PLUGINS` 语义（构建参数）；CI 手动触发时换成每个插件一个勾选框，全勾=`enabled.txt`，全不勾=不带插件：

| 取值 | 行为 |
|---|---|
| `all`（默认） | 只构建/安装 `enabled.txt` 里的插件 |
| `none` | 不带任何插件 |
| `a,b` | 只构建/安装点名的插件（未列出的目录不会进入镜像） |

> 新增插件时记得在 `build.yml` 里加一个同名 boolean 勾选框（插件多起来后可以写成循环，但 GitHub 只接受静态 inputs）。

## 已退役：`dsh-armor-gen5`

- **源码保留**在 `plugins/dsh-armor-gen5/`，但不在 `enabled.txt` 里 → 默认镜像不含它；
- 与 `dsh-infinite-gen-n` 同属破甲类，默认只构建后者，避免两个破甲预设打架（预设 id 都是 `armor`，同时启用会 `Duplicate agent preset`）；
- 需要回退时显式点名：`make build PLUGINS=dsh-armor-gen5`（产物 tag 带 `-plugins-dsh-armor-gen5`）。

## 上游同步（vendored）

插件以**源码快照**形式入库（不是 submodule），来源与策略写在 `plugins/upstreams.tsv`：

```
# name	upstream	ref	mode	note
dsh-infinite-gen-n	https://github.com/Minglink/dsh-infinite-gen-n	main	vendor	…
dsh-armor-gen5	…	master	offline	上游不可达且已被 gen-n 取代
```

| mode | 行为 |
|---|---|
| `vendor` | 每周一 05:00 UTC（或手动）由 `scripts/sync-vendored-plugins.sh` 拉上游 tar 包比对，有变化就覆盖并提交，然后自动派发一次构建 |
| `offline` | 永不自动同步，只保留本地快照 |

**上游删库/不可达时**：脚本以 HTTP 非 200 或解包失败判定，**保留当前快照、不删任何文件**，只打印
`上游不可用（HTTP 404）→ 保留本地版本 x.y.z，不删代码` 并以 0 退出。仓库里永远留有最后可用版本。

手动触发：`SYNC_DRY_RUN=1 bash scripts/sync-vendored-plugins.sh`（只看差异），或跑 workflow `sync-plugins`。

## 插件的安装钩子 `dsh-install.sh`

`dsh plugin add` 之后，若插件目录里有可执行的 `dsh-install.sh`，容器启动时会执行它（环境变量 `PROFILE_DIR` / `PLUGIN_DIR`）。
`dsh-infinite-gen-n` 的钩子做三件事（都是幂等的）：

1. **补全安装副本**：上游 `package.json#files` 漏了 `lib/`，而 `index.js` 需要 `lib/host-patch/core.js`，pnpm 的 `file:` 安装会按 `files` 过滤 → 钩子把完整源码再覆盖一次；
2. **补 preset 依赖**：`preset-rows.js` 引用的 `@deepseek-ai/*` 若在 profile 解析不到，会用 `resolve-extras.mjs` 按 dsh 版本补装；
3. **过滤不可用 preset 行**：补装后仍解析不到的行（例如 `dsh-tool-office` 只有 `0.2.2-rc.2/rc.3`，宿主是 `rc.1`）会被删掉——否则注册 preset 时报 `BROKEN … never started`，整个破甲预设不可选。

钩子文件由本仓库维护，`sync-vendored-plugins.sh` 同步上游时会**保留**它（上游没有这个文件）。

## 新增插件

```bash
# 方式 A：submodule（跟随作者，适合长期维护的第三方）
make plugin-add URL=https://github.com/<owner>/<plugin>.git

# 方式 B：vendored 快照（上游随时可能消失时首选）
#   1) 把源码放进 plugins/<name>/
#   2) echo <name> >> plugins/upstreams.tsv（mode=vendor）
#   3) echo <name> >> plugins/enabled.txt
```

## 需要改插件源码时

不要直接改插件目录（同步会覆盖），把补丁放 `patches/`（构建期 `patch -p1 -d /opt/plugins` 施加），
或写成 `dsh-install.sh` 里的运行时修补（gen-n 就是这么做的）。

## 不在本仓库范围

原生引擎运行时包（Ghidra / JDK / JPype 这类按平台分发的大体积预编译依赖）不属于这里，请独立仓库维护。
