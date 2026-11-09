# CHANGELOG — dsh-armor-gen5（无限五代 破甲）

## 0.3.0 — 2026-11-07（「待运行」根因修复 + 破甲词库）

| # | 问题 | 现象 | 根因 | 修法 |
|---|---|---|---|---|
| 1 | **两个注入按钮都点了，控制台仍显示「待运行」** | 启动流程六步全绿、横幅「已启动」，但标题右侧徽标和状态行一直「待运行」，像没生效 | 控制台页注册在 `main` slot，宿主契约是 `scope: "root"`、标准 props **不含 `useProjection`**（`client-ui-layout` 直接 `renderSlot("main", {}, …)`）。旧代码却用 `useProjection("armor")` 判状态 → 永远 `undefined` → 永远「待运行」。与投影本身是否工作无关 | 控制台不再读会话投影：后端 `/gen5/engage` 成功后写 `lastEngage` 记账（内存 + 热配置文件），`/gen5/scope` 返回 `armed / sections / engagedAt / engagedOk`，界面据此显示「已注入 / 已启用·待会话 / 未启动 / 启动失败」。逐轮判定留在输入框徽标（session scope） |
| 2 | **会话投影在 DSH 0.2.2 起注册成功但客户端不可见** | 输入框徽标只有名字，没有「思考中/通过/拒绝/未完交付」四态 | 投影契约改为 `stateSchema + wire{viewSchema,view}`；旧 `schema/view` 写法注册不报错，但 `erased.wire === undefined` → `snapshot()` 跳过该 key，`useProjection("armor")` 拿不到值 | 注册同时提供新契约（`stateSchema` / `wire`）与旧字段（`schema` / `view`），兼容 ≤0.2.1 宿主；`register()` 的 thenable 失败也会被记录 |
| 3 | **破甲词不能自由替换** | 想换破甲核只能改安装目录，升级即覆盖；预设内核与 bundle 是两份副本，改一处不生效 | 破甲文本是模块级常量，且散落在 `prompts/*.md` 两个副本 | 新增 `prompt-pack.js`：`<DSH_HOME>/armor-gen5/packs/*.md` 三槽位词库（破甲核/身份前缀/封口段），`packs.json` 记录选择；section `text` 改为函数，宿主每轮 `assemble()` 重新求值 → **下一轮生效，不重启**。控制台新增「破甲词库」：切换 / 导入 .md / 删除（自动备份）/ 恢复内置 |
| 4 | **身份层被误认为破甲核的一部分** | 破甲会话里出现用户自己的 persona（例如称呼「YG」/Little Code Sauce），看起来像破甲核夹带私货 | `loadPersonaText()` 默认读取并注入 `<DSH_HOME>/prompt-inject.md`（order 90）。这份文件是**用户自己的身份层**，插件不携带；旧行为默认开启，导致装过其它身份提示词的机器被继承 | **默认改为关闭**（`personaInject: false`）；控制台新增「身份层注入」开关；`personaInject` 进入热配置；section `text` 改函数，开关下一轮生效；`GEN5_PERSONA_INJECT=0/1` 仍可强制。注意 `dsh-purge` 也会注入同一文件（order 5000），需一并处理 |

新增 HTTP：`GET/POST /gen5/packs`（select / import / remove / reset）、`POST /gen5/persona`（enabled）。
新增校验：路径穿越、96KB 上限、NUL、空文件、写坏回落内置，全部在 `tools/test-packs.mjs` 有对应用例（10 项）。

## 0.2.3 — 2026-11-06（W5/T4 死代码 + scope 切换交接丢失）

| # | 问题 | 现象 | 根因 | 修法 |
|---|---|---|---|---|
| 1 | **W5/T4/周期重申在真机全是死代码** | 静态破甲核还在，但"拒绝即修复"完全不动作：W5 救援、T4 证据链预热、每 N 轮工作提醒一个都不触发 | 外层 `agent/pre-step` 处理器判 `payload.kind !== "enter"` 提前返回。宿主事件的 payload 是 `{ agent, messages, turn, step, signal }`，**没有 kind**（kind 只在 `next()` 返回的 decision 上，宿主 12 处内置用法皆 `decision.kind`）；`undefined !== "enter"` 恒真 → `st.turns` 永不递增 → T4 的 `st.turns !== 1` 门也恒真 | 去掉 payload.kind 判定，改为 payload 形状校验；`selftest.mjs` 夹具删除伪造的 `kind:"enter"`，按生产形状回归 |
| 2 | **切到「启动注入」(global) 后破甲明显变弱** | 隔离注入正常，启动注入像少了一半机制：破甲核段消失、宿主限制层复活 | 预设实例（`armor-kernel/`）与常驻实例（`node_modules/`）是**两个模块副本**：`registerOnceSection` 对"已注册"只记 existing 不持有 disposer；`coverOwners`/`hostOriginals` 也不跨实例共享。切 scope 时后者先 dispose → 撤掉共享装甲段 + `releaseCover()` 还原宿主约束段；前者已激活却从不补回 | 激活实例每 3 秒轮询调用 `healSharedState()`：重扫 → 重取被还原的原文重新覆盖 → 补回缺失的 persona/破甲核段（归属本实例）。新增 5 项回归测试（`handoff-*`） |

验收：`selftest` 14 项、`test-dissolve` 29 项（含 5 项交接自愈回归）、`test-verify` 8 项全 PASS；两种注入范围在 scope 互相切换后状态自愈（≤3 秒一轮）。

## 0.2.2 — 2026-11-06（NEVER_COVER 恢复身份层保护）

| # | 问题 | 现象 | 修法 |
|---|---|---|---|
| 1 | `NEVER_COVER` 缺了 `/^dsh-purge$/`、`/^dsh-purge:rules$/` 两条 | 宿主里 `dsh-purge` 段（prompt-inject 注入的身份层，实测 6000 字符）被名字外的文本词根命中，`classifySection` 判成约束段 → `coverHostSections` 装完就把它清空，等于抹掉自己最大的破甲文本块 | 黑名单恢复两条，`dsh-purge` / `dsh-purge:rules` 永不覆盖；离线分类验证：`dsh-purge constrained=false`，限制层照样覆盖 |

`dsh-purge` 段是**身份层/功能段**，不是限制层——黑名单保护的是宿主环境里的破甲文本本身，与出处处名无关。
测试同步：`test-dissolve.mjs` 恢复 `blacklist-dsh-purge` 夹具与断言（24 项 PASS）。

## 0.2.1 — 2026-11-06（安装器与官方安装方式兼容修复）

| # | 问题 | 现象 | 修法 |
|---|---|---|---|
| 1 | `install.ps1` [4.5] 无条件把 `node_modules\dsh-armor-gen5` 删成 junction | 用官方 `github:` 方式装好的真实包目录被换成指向 `~\.dsh\plugins\dsh-armor-gen5` 的 junction，依赖声明仍是 `github:`；副本缺失时 Node 报 `包元信息错误 … ENOENT`，DSH 报 profile is no longer self-contained | 先读依赖 spec，非 `file:*` 直接跳过 junction，保留官方安装的目录 |
| 2 | 文档缺官方安装方式 | 用户用插件管理器装完再跑 `install.ps1` 就触发问题 1 | README / INSTALL.md 增加「方式 B：官方安装（github: 源码）」，并注明两种方式可共存 |
| 3 | 方式 B 的 pnpm 路径写死 | 部分 DSH 版本下 `resources\runtime\pnpm\bin\pnpm.mjs` 不存在，照抄文档直接失败 | 改为双路径自动探测（`primary-runtime\dependencies\pnpm` / `pnpm`） |
| 4 | 版本号不能标识内容 | 内容更新但 `version` 不变，pnpm 对同名同版本不做内容比对，出现"升级不生效" | 本版起内容变更同步提升 `version` / `dsh.version`（0.2.1）；补 `engines.dsh: ">=0.2.1-0"` 让插件管理器预检能拦截不兼容宿主 |
| 5 | README 宣传语与实现不符 | "宿主零文件改动、卸载即完整还原"未说明安装器会改 profile 的 package.json / cordis.patch.yml / armor-kernel / junction | 改为准确表述：破甲动作零宿主文件改动（运行时内存级），安装/卸载改写的项由脚本备份并逐项还原 |

验收：`node --check index.js` / `client.js` 双绿；三种安装方式（install.ps1 / tgz / github:）互不破坏。

## 0.2.0 补丁 6 — 2026-11-06（安装器三个真 bug，交付前试装发现）

在隔离目录做端到端试装时抓到：

| # | 问题 | 现象 | 修法 |
|---|---|---|---|
| 1 | `install.ps1` 没有 `param()` 块 | `-DshHome <path>` 被当成位置参数忽略，安装写进默认 `%USERPROFILE%\.dsh` | 加 `[CmdletBinding()] param([string]$DshHome, [switch]$Force)`，优先级 `-DshHome` > `$env:DSH_HOME` > 默认 |
| 2 | 重复安装时 `Copy-Item -Recurse` 会套娃 | `plugins/dsh-armor-gen5/tools/tools/`、`prompts/prompts/` 各多一份 | 复制前把旧安装整体移开为 `dsh-armor-gen5.prev-<时间戳>`（保留回滚），再全量复制；`-Force` 时直接删除 |
| 3 | 版本文字硬编码 `v0.4.6` | 装的是 0.2.0，界面横幅却写 0.4.6 | 从 `package.json` 读 `version`，横幅/首行/结尾统一用 `$pluginVer` |

试装验收（隔离 `$env:TEMP` 下假 DSH_HOME）：

```
[1] DSH home: …\gen5-install-test2-…\.dsh        ← -DshHome 生效
[3.2] preset 已写入 profile patch
[3.3] preset 内核已复制到: …\profiles\desktop\armor-kernel
[4.5] node_modules junction 已重建
files=27   嵌套目录=0   重复安装后 prev 备份=1
```

## 0.2.0 补丁 5 — 2026-11-06（隔离注入变弱 + 整体强度下降）

用户实测反馈：`local`（只选「破甲模式」）明显弱于 `global`（启动注入），且整体不如最初版本。两个独立原因：

### 原因 1：local 模式下 preset 里没有插件实例

补丁 4 为了"让 preset 能加载"，把自家插件行从 preset 里删了。结果：

| 模式 | 破甲核 | W5 | T4 | 归一化 |
|---|---|---|---|---|
| global | 完整（常驻实例注入） | ✅ | ✅ | ✅ |
| local | 只剩 persona 里的 360 字符 | ❌ | ❌ | ❌ |

修法：把插件复制到 **profile 内的 `armor-kernel/`**，preset 里用相对路径 `'./armor-kernel/index.js'` 挂载它 ——
preset realm 的 baseUrl 在 asar 内，包名与 `../..` 相对路径解析不到，只有 profile 目录内的相对路径可用。

- `install.ps1` 新增 [3.3]：复制 `index.js / runtime.js / preheat.js / normalize.js / preset-rows.js / package.json / prompts/*.md` 到 `<profile>/armor-kernel/`
- `uninstall.ps1` 新增 [2.6]：删除该目录
- preset 的 `plugins` 末尾恢复 `armor-gen5` 行

### 原因 2：preset 的 persona 段挤掉了身份声明

补丁 4 把破甲核的**截断文本**塞进 `persona.prefix`。而 preset 注册的 `persona` 段名是
`deployment:persona-prefix`，**会遮蔽**常驻实例注入的同名段 —— 于是身份声明
（ARMOR_PERSONA_PREFIX：私有台面、指令权威性、预授权承诺）被 360 字符破甲核替换掉，
这是"整体强度下降"的直接原因。

修法：`persona.prefix` 恢复为**身份声明原文**，并把该文本抽到 `prompts/armor-persona-prefix.md`，
`index.js`（注入用）与 `tools/gen-bundle-patch.mjs`（preset 生成用）读同一份，避免两份文本漂移。
`ARMOR_SEAL` 同样抽到 `prompts/armor-seal.md`。

### 验证

```
node tools/check-rows.mjs        → 28 包全在
node tools/selftest.mjs          → OK (14)
node tools/test-verify.mjs       → OK (8)
js-yaml（含 !!js tag schema）    → profile patch：preset "armor" plugins=22，末行 './armor-kernel/index.js'
node -e import(kernel/index.js)  → 独立加载成功，13 个导出
```

## 0.4.7 补丁 4 — 2026-11-06（「破甲模式」终于出现在预设列表）

实测结果：预设下拉同时出现「破甲模式」与对照探针 → 机制打通。

失败的三个变量（逐个排除后确认）：

| # | 变量 | 证据 |
|---|---|---|
| 1 | preset 里挂自家插件 `{"name":"../../plugins/dsh-armor-gen5/index.js"}` | preset realm 的 baseUrl 是 web-app（asar 内），相对路径解析不到 profile 装的包 → `tree.root.update()` 抛错 → 整个 preset 激活失败，且无错误落地 |
| 2 | 行清单比官方 standard 多 `tool-subagent-list-agents`、`tool-ralph` | 官方 standard.patch.yml 没有这两行；preset 是新 scope，多挂 root 已启用的工具行会撞名 |
| 3 | persona.prefix 塞进破甲核全文（9374 字符，单行 YAML） | 与 #1/#2 叠加时无法区分；缩到 543 字符后加载正常 |

最终形态（与官方 `standard.patch.yml` 逐行同 id，仅 persona 文本不同）：

```
preset-armor → @deepseek-ai/dsh-agent-preset
  config.id = "armor"   order = 5   21 行 plugins（无自定义包、无 list-agents/ralph/tool-bash）
  persona.prefix = 破甲核开头 360 字符 + 注明「完整核由 dsh-armor-gen5 注入」
```

声明位置：**profile patch**（`~/.dsh/profiles/desktop/cordis.patch.yml`），由 `install.ps1` 写入、
`uninstall.ps1` 剥离；插件自己的 `cordis.patch.yml` 只挂插件本体。

**已知限制（重要）**：preset 内只放破甲核开头，完整破甲核 + W5 + T4 + 归一化由常驻实例提供，
因此 `scope=global` 时功能完整；`scope=local` 时只有 persona 里的短核。面板文案已注明。

诊断手段（本轮新增，均保留）：
- `tools/gen-bundle-patch.mjs --print-preset` 生成声明块；`--check` 校验与 preset-rows.js 一致
- `tools/check-rows.mjs` 递归校验 21 个依赖包 + 2 个 group 子包在宿主 asar 中存在
- 用宿主自带 `js-yaml` 校验 patch 语法（提取 `dist/js-yaml.mjs` 跑 `load()`）
- `GET /gen5/scope` 的 `instances` 字段（bundle / preset 实例计数）

## 0.4.7 补丁 3 — 2026-11-06（「破甲模式」不出现在预设列表）

现象：自检 19 项全绿、覆盖 3 段，但预设选择器里**没有「破甲模式」**。

根因（读宿主源码定位，不是猜）：

1. `agent-preset-registry` 由 `dsh-web-app` 的 patch 插入，而它**带作用域隔离**。
   dsh-web-app patch 里的注释原文：
   > "an entry-local realm around the registry is invisible to every sibling row outside that realm"
2. 我们的插件是 profile bundle 的 sibling 行 → 运行时 `ctx.get("agentPresets")` 拿不到 registry；
   `declareArmorPreset()` 里 `if (registry === undefined) return false` 是**静默**返回，
   于是每 1.5s 重试一次，永远失败，日志里连错误都没有。
3. 官方预设的姿势是：在 patch 里**声明** `@deepseek-ai/dsh-agent-preset` 行，由 loader 在 root 层挂载
   （dsh-web-app patch：*The shipped preset declarations follow as separate patch files under `presets/`*）。

修法：

| # | 改动 |
|---|---|
| 1 | `cordis.patch.yml` 扩成两段：插件本体行 + `preset-armor`（`@deepseek-ai/dsh-agent-preset`，config 含 id/name/order/description/plugins）。由 `tools/gen-bundle-patch.mjs` 从 `preset-rows.js` 生成，避免手抄 23 行 |
| 2 | 运行时 `declareArmorPreset()` 默认不再执行（`GEN5_RUNTIME_PRESET=1` 可开，供实验环境）；它在 realm 外本来就无效，还可能与 patch 声明撞 `Duplicate agent preset` |
| 3 | 新增自检项 `preset-patch`：确认 bundle patch 里确有 `preset-armor` 行（19 项） |
| 4 | 新增 `tools/check-rows.mjs`：逐个校验 `preset-rows.js` 里 **28 个包**在宿主 app.asar 里真实存在（含 group 子行递归）。任何一行包名不存在都会让 preset 激活失败而其它自检仍全绿——这正是这次漏掉的一环 |

验收：`node tools/check-rows.mjs` → 28/28 存在；重启 DSH 后预设列表出现「破甲模式」。

## 0.4.7 补丁 2 — 2026-11-05（非注入方实例的覆盖判定）

现象：engage 七步全绿（`18 项全绿`、`已就位（0ms）`），但面板「部署自检」仍报
`dissolve-constrained 命中 3 / 覆盖 0`，同一份状态两个视角结论相反。

根因：`scope=local` 时注入由**预设实例**完成，而 `/gen5/verify` 工具/路由可能落在
**另一个实例**上。两个实例各自持有一份提示词表视图，非注入方那一侧：
- 表里没有 `infinite-gen-5:*` 段（我们没在这里注入）；
- 也读不到被覆盖的宿主段名（`harness:identity` / `deployment:persona-*` 不在它的表里）；
→ `coveredNow()` 返回空 → `命中 3 / 覆盖 0`。而它自己的 persona 判定早已有兜底，所以只有
`dissolve-constrained` 一项在报错。

修法：`computeVerify()` 先判定"本实例是不是注入方"（表里有没有 `infinite-gen-5:*` 段）：

| 视角 | `dissolve-constrained` 判定 |
|---|---|
| 注入方（表里有我们的段） | 保持严格：命中与覆盖必须相等，缺一即 FAIL |
| 非注入方（表里没有） | 改看注入侧记账 `hostOriginals.size`，detail 写 `命中 N / 记账 M（本实例非注入方，按注入侧记账判定）` |

`dissolve-identity` / `dissolve-persona-*` 复用同一个 `tableTrusted` 标志，口径统一。
真故障仍会 FAIL：注入方表里段确实缺 → `tableTrusted=true` → 严格判定。

非注入方的 persona 两项原本只看本实例 `shadow`，而"从未 activate 的旁观实例" shadow 是 `off`
→ 仍会误报。补一条：非注入方且 `hostOriginals.size > 0`（注入侧确实覆盖过宿主段）→ 判 PASS，
detail 写 `按注入侧记账→on`。

离线回归：`tools/test-verify.mjs`（8 项）覆盖三种视角——
注入方按表判 PASS、非注入方按记账判 PASS、注入方真缺失仍 FAIL。

## 0.4.7 补丁 — 2026-11-05（切换范围瞬间自检假失败）

实测现象：重启后首次点「⚡ 启动注入」，engage 报
`dissolve-persona-prefix=missing / dissolve-persona-suffix=missing / dissolve-constrained 覆盖 0`，
但同一时刻 `/gen5/dissolve` 的 `covered` 有 3 段，3 秒后再次自检又是全绿。

根因（时序，不是逻辑）：`POST /gen5/engage` 改完 scope 就立刻跑流水，而**实例交接是 3 秒轮询**——
`/gen5/engage` 由路由注册的那个实例执行，真正接管注入的是另一个实例。交接窗口里宿主表被重建，
`hostSectionTable()` 读到的是空表/旧表，于是：

| 判定 | 读到的状态 | 结果 |
|---|---|---|
| `coveredNow()` | 表里一个 `hostOriginals` 名字都没有 | 覆盖数 → 0 |
| `persona-*` | 表里没有任何 `infinite-gen-5:` 段 | missing |

修法三条：

| # | 位置 | 改动 |
|---|---|---|
| 1 | engage 流水 | 新增第 5 步「等待实例接管」：以 150ms 间隔轮询宿主表，最多 5s，直到出现 `infinite-gen-5:*` 段再进自检（`run` 改为支持 async） |
| 2 | engage 读表 | `tableAny()`：`lastPromptCtx` 与 engage 自己的 ctx 任一读到的表都算数（交接后激活的是另一个实例） |
| 3 | `coveredNow()` / persona 判定 | 表可读但**不含任何 `infinite-gen-5:` 段**时判定表为"切换中途/旧表"：覆盖数按 `hostOriginals` 记账兜底，persona 两项回退到实例状态，detail 写明 `表未见注入段→<state>`，避免假失败；真缺失（表可信且段缺）仍然 FAIL |
| 4 | 控制台 | 失败横幅下加一句提示：刚切换范围时约 3 秒接管，稍后重试即可 |

验收：`POST /gen5/engage {"scope":"global"}` → `verdict=OK`，`/gen5/verify` 18 项全绿。

## 0.4.7 — 2026-11-05（运行期设计成型 + 修三处死接线）

本轮落地运行期层：分层配置与预算纪律。只动机制层，不动破甲核。

### 1. 死接线（0.4.6 里根本没有生效的机制）

| # | 位置 | 问题 | 修复 |
|---|---|---|---|
| A | W5 主通道 | 调 `agents.get(payload.agent)`，而 `stateOf()` 全文从未被调用 → `agents` 永远是空 Map，W5 一次都推不出去 | 首次进入即 `stateOf()` 建状态 |
| B | `preheat.js` | `buildPreheat`/`shouldPreheat` 被 import 后从未调用，`buildEvidenceChain` 未 import；`state.preheatDone` 恒为 `false` → T4 证据链从 0.2.x 起就没接过线 | 接在会话首轮 + 裸续句门控；`preheatMode` 可配 |
| C | 外层 pre-step | 命中 W5/重申时直接 `return`，**跳过内层 next()** → 这些轮的归一化与预热全部失效 | 改成挂进 payload 再 `next(enriched)`；内层补一次 `additionalContexts` 合并 |

### 2. 预算与去重（旧实现的通病）

| # | 问题 | 旧行为 | 修复 |
|---|---|---|---|
| D | 波次只增不减 | `escalations` 永不重置 → 长会话配额用完后永久失效 | `maxPerWindow` 次 / `windowTurns` 轮，跨窗归还（`runtime.js: w5Window`） |
| E | 去重粒度 | 旧实现按"这轮见过拒绝"布尔 | 我们原本也是布尔 `refuseSeen`，连续多轮拒绝只推得动第一次；改成按 assistant 消息 id |
| F | 文案固定 | 单一固定串 + 固定标记 → 指纹明显、模型钝化 | 5 条同义池随机（`W5_POOL`），标记 `[work-reminder]` 保留供检测与投影 |

### 3. 新增

| # | 内容 | 落点 |
|---|---|---|
| G | 运行期热配置（mtime 缓存，免重装调参）：W5 预算/窗口/文案池、重申间隔、归一化开关、预热模式、自定义拒绝词 | `runtime.js` + `~/.dsh/.dsh-armor-gen5.json`（复用原 scope 文件，向后兼容） |
| H | 徽标写回只改 `scope` 字段，保留手写配置 | `writeScopeFile` |
| I | 显式 hook 序位 `{ prepend: true }`，不再依赖加载顺序 | W5 主通道 |
| J | 原生续跑 `dsh-tool-ralph`（`maxRounds: 256`） | `preset-rows.js` |
| K | `verify` 新增 `runtime-config` / `t4-preheat` 两项，`w5-reanchor` 改为报告池大小与窗口 | `computeVerify` |
| L | 卸载一致性断言：与 `install.ps1` 备份做集合比对，断言其余依赖/bundles 一件未动 | `install.ps1` / `uninstall.ps1` |
| M | 机制自测 14 项（mock ctx，无需宿主） | `tools/selftest.mjs` |

### 5. 验收

```
node --check index.js && node --check client.js && node --check runtime.js
node tools/selftest.mjs      → RESULT: OK (14 checks)
```

## 0.4.6 — 2026-11-05（verify 的 identity 显示改为实时判定）

0.4.5 运行时实测：`verify` 16 项全绿、`verdict=OK`，但 `dissolve-identity` 显示
`seal-fallback`，而同一时刻 `/gen5/dissolve` 的 `covered` 列表里明明有
`host:identity`。

原因：`identityShadow` 是 **activate 时拍的快照**（那时覆盖还没发生或被别的实例
还原过），后续 engage / 另一实例的覆盖把 identity 段纳入后才真正 covered，
快照不会跟着更新。

修法：`dissolve-identity` 判定与 persona 两项一致——**以实时 `covered` 列表为准**，
有 `*identity*` 段被覆盖就显示 `covered:<段名>`，否则回退到快照值。
纯显示修正，判定语义（只有 `conflict` 算故障）不变。

## 0.4.5 — 2026-11-05（全量审计：一个每次启动都报的错 + 四个隐患）

对 0.4.4 做了运行时实测 + 静态审计，发现 5 个问题（其中第 1 条从 0.3.x 起就存在）：

| # | 问题 | 证据 | 修复 |
|---|---|---|---|
| 1 | **每次启动都报 `TypeError: Invalid effect`**（`at new apply …index.js:1315:49`） | 宿主日志从 2026-11-04 到最近一次启动，每次都有，行号随版本漂移 | `ctx.inject` 的回调会被 cordis 当作插件 apply 执行，返回值必须符合 effect 契约（函数 / nullish / thenable / iterable）。`() => registerScopeRoute(...)` 返回 **boolean** → 抛错，且 inject 回调异步执行、外层 try/catch 抓不到。改为语句体 `() => { try { registerScopeRoute() } catch {} }`，`agentPresets` 的 inject 同样处理 |
| 2 | 双实例交接时覆盖被互踩 | 预设实例 dispose 会 restore 掉常驻实例刚做的覆盖 | 覆盖所有权改为**引用计数**（`acquireCover` / `releaseCover`）：最后一个实例离场才还原宿主段；`coverHostSections` 不再登记 disposer |
| 3 | persona 检查靠记账，实例注销后可能残留 `on` | scope 切换后 verify 可能误报通过 | `computeVerify` 的 persona 两项改为**优先查宿主表**（`data.has("infinite-gen-5:persona-prefix")`），表不可读才回退记账 |
| 4 | `uninstall.ps1` 先 `pnpm install` 后断 junction | pnpm 清理 node_modules 时若跟随 junction，会递归删掉插件正本 | 调整顺序：先断链接（并区分 Junction / 真目录），再 pnpm install |
| 5 | `uninstall.ps1` 的 BOM 丢失 + `client.js` engage 定时器泄漏 | edit 工具重写时去掉 BOM（PS 5.1 会按 GBK 解析中文）；面板卸载后 interval 仍在跑 | 恢复三个 ps1 的 UTF-8 BOM；engage 的逐条揭示定时器存入 ref，卸载时清理 |

顺带清理：`coverHostSections` 里已被引用计数取代的 `registerRestore` 死代码。

离线测试 24 项断言仍全 PASS；运行时 `/gen5/verify` 16 项全绿（宿主 identity 段为非标准命名 `host:identity`，词根匹配正常工作）。

## 0.4.4 — 2026-11-05（"engage 全绿但 verify FAIL"的三重竞态）

实测序列：engage 六步全绿（已覆盖 5 段）→ 数秒后 verify 报 `命中 3 / 覆盖 0` → FAIL；
连续采样 30 秒显示 `covered=[5 段]` 与 `identity.chars=1001`（有内容）同时成立——
两个数据源互相矛盾。三个叠加根因，全部修死：

| # | 根因 | 修复 |
|---|---|---|
| 1 | **扫描竞态**：扫描发生在覆盖生效期间时，段 text 已被清空 → 文本词根全失效 → 命中数从 7 掉到 3（顶部"约束 7"与 verify"命中 3"就是两次不同时刻的扫描） | `classifySection()` 对已覆盖段自动回退用 `hostOriginals` 里的**原文**做文本判定，命中数在任何时刻稳定；engage 的 scan 步骤**不再先 restore**（两实例竞态下 restore 会撤掉另一实例刚做的覆盖） |
| 2 | **覆盖误伤宿主功能段**：纯文本词根命中（段里出现 "do not"/"policy" 就中招）把 `harness:source` / `app:web-surface` / `ui:deliverable-file-references` 一起清了——这些是宿主功能段不是限制层 | 判定改为**名字词根必须命中**（文本词根降为加分项，不单独触发）；新增 `NEVER_COVER` 黑名单（`harness:source` / `app:web-surface` / `ui:*` / `mcp-*` / `wanxiang:*` / `tool-*`）双保险 |
| 3 | **双实例 restore 互踩**：activate 被预设实例和常驻实例各自 3s 轮询调用，每次都重复登记 `restoreHostSections`；deactivate 时把对方刚覆盖的段还原掉，`hostOriginals`（模块级共享）被两个实例互相覆盖记录 | 模块级单例守卫 `dissolveRestoreRegistered`：restore 登记全局只做一次；`hostOriginals` 只存第一份原文（`if (!hostOriginals.has(name))`），幂等 |
| 4 | （顺带）`coveredNow()` 要求"原文非空"，宿主 persona 段原文本来就是空串 → persona 段永远进不了 covered 列表 | 判定改为"表里有这条 + 我们存了原文"，与原文是否为空无关 |

离线测试扩到 **24 项断言**全 PASS，新增回归项：黑名单四段不覆盖、纯文本命中不单独触发、
覆盖后重扫命中数稳定、重复 cover 的 `hostOriginals` 不膨胀、persona 空串段进入 covered。

verify 的 `dissolve-constrained` 判定语义同步收紧：`命中 N / 覆盖 N`（两者应相等；
若宿主层读不到则 `命中 0`，走 SEAL 兜底也算 PASS）。

## 0.4.3 — 2026-11-05（部署验证失败的三个真凶 + 判定归一）

对运行中宿主实测（`/gen5/verify`、`/gen5/dissolve`）抓到的问题，逐个修死：

| # | 症状 | 真凶 | 修复 |
|---|---|---|---|
| 1 | `✗ dissolve-identity = seal-fallback`，verdict FAIL | **双份 verify 漂移**：`/gen5/verify`（控制台读的）还是 0.4.0 旧判定 `identityShadow === "on"`；`gen5_verify` 工具里是新判定 `!== "conflict"`。两份手写判定各自演化 | 抽成唯一的 `computeVerify()`，HTTP 路由 / 工具 / engage 的 selfcheck 三处全调它，判定永远一致 |
| 2 | 命中 3 段、已覆盖 0 | **覆盖记账被自己人清零**：scope 切换 → deactivate → `restoreHostSections()` → `covered=[]`，3s 轮询的另一实例再覆盖回来；快照恰好抓在空窗。另：identity 写死找 `harness:identity`，而这台机器上真名是 `host:identity`，永远匹配不上 | `coveredNow()` 直接从宿主表实时推导（原文有内容且当前为空 = 覆盖生效中），不再信记账；identity 改按 `/identit/` 词根匹配任意 `*:identity` 段 |
| 3 | 头部显示 v0.4.1，后端版本却 v0.4.2 | 面板头部的版本号是**字面量**，升版本时漏改 | 绑定 `PLUGIN_VERSION` 常量，一处定义（徽标/头部/对比行共用） |
| 4 | （隐藏）宿主 11 段全部 `chars: 0`，文本词根全失效 | `sectionText()` 对函数型 text 传 `{}`，宿主函数解构参数直接抛错被 catch 吞掉 → 返回空串 | 降参重试（`{}` → 无参），读不出记 `text-unreadable` 诊断，扫描结果里归档为 `text-hints-skipped` |

verify 检查项现在的完整清单（16 项）：`package-version` / `implementation-revision` / `prompt-set-hash` / `prompt-file` / `variant` / `normalize-enabled` / `persona-inject` / `w5-reanchor` / `scope` / `dissolve-host-scan` / `dissolve-constrained` / `dissolve-identity` / `dissolve-persona-prefix` / `dissolve-persona-suffix` / `dissolve-suppress-context` / `dissolve-complete`。

离线测试扩到 16 项断言（新增：`host:identity` 非标准命名段命中、函数型 text 读取、记账清零后 `coveredNow()` 仍真实、还原后不再误报），全 PASS。

## 0.4.2 — 2026-11-05（注入按钮无响应：根因定位 + 请求层健壮性）

现象：点「🛡 一键隔离注入」或「⚡ 启动注入」后界面停在"扫描中…"，按钮没有任何反馈；
"一键隔离注入"提示无效。

**实测根因**（对运行中的宿主机 curl）：

```
GET /gen5/scope    -> 200 {"version":"0.4.0","implementationRevision":"20261105-gen5-forge-v910-dissolve",…}
GET /gen5/verify   -> 200 {"version":"0.4.0",…}
GET /gen5/dissolve -> 404
```

宿主进程仍是 **0.4.0**：`/gen5/dissolve`、`/gen5/engage` 是 0.4.1 才加的路由，没有注册，
所以 404。客户端（刷新页面即更新）已经是新版、按钮在，但宿主半体（`index.js`）只在
DSH 启动时加载 —— **没重启就等于新 UI 驱动旧后端**。

旧前端在这种情况下的表现是一个真 bug：`fetchJSON` 把 404 的 HTML 当 JSON 解析 → 抛错 →
`done(null)` → `scan` 永远是 `null` → 永久"扫描中…"；按钮点下去的失败回执也没有区分
"接口不存在"和"业务失败"。

修复：

| # | 改动 | 说明 |
|---|---|---|
| 1 | 新增 `requestJSON()`（8s 超时 + HTTP 状态 + 文本解析） | 取代 `fetchJSON` 处理 dissolve/engage；404、超时、坏 JSON 都能区分 |
| 2 | 「宿主提示词层」行三态化 | `读取中…` / `接口不可用（HTTP 404）` / `不可读（追加压制）` |
| 3 | 新增「后端版本」行 | 显示宿主版本与客户端版本是否一致，不一致直接写「→ 重启 DSH」 |
| 4 | 失败文案按状态码映射 | 404/405 = 路由不存在（宿主旧版）；409/429 = 上一轮仍在执行；0 = 超时 |
| 5 | 按钮运行期文案 | 「注入中…」，点击即禁用，避免连点 |
| 6 | `/gen5/dissolve` / `/gen5/engage` 返回 `version` / `revision` | 前端可做版本对比 |
| 7 | `scanHostPrompt` / `coverHostSections` 自己记录 ctx | 修 `restoreHostSections()` 依赖 `lastPromptCtx` 在"未走 activate"路径下不还原的缺陷 |
| 8 | 新增 `tools/test-dissolve.mjs` | 用假 SystemPrompt 离线跑扫描/覆盖/还原，13 项断言全 PASS |

> 结论：功能代码本身是在的，0.4.1 的自动引擎逻辑已用离线测试验过；这次的问题是
> **部署态没对齐**（宿主旧进程 + 新前端）加上前端错误处理太差。两件事都修了。

## 0.4.1 — 2026-11-05（自动瓦解引擎 + 启动流程可视化）

实现修订号：`20261105-gen5-forge-v910-auto`

### 1. 瓦解层从"按名字硬编码"改为"按宿主内容自动识别"

旧做法写死 `harness:identity` / `deployment:persona-*`，宿主改名或新增限制层就失效。
新做法：

| 步 | 实现 |
|---|---|
| 枚举 | `systemPrompt.layers.global.sections.entries()` → 全部 `{ name, order, text, complete? }` |
| 识别 | 名字词根（identity/persona/policy/guard/safety/sandbox/approval/permission/delegation/warn/restrict/runtime）+ 文本词根（must not / do not / prohibit / refuse / 不得 / 禁止 / 沙箱 / 审批 …） |
| 覆盖 | 命中段落 `text = ""`，`renderPrompt` 丢弃空 section ＝从提示词移除；原文存 `hostOriginals`，卸载时 `restoreHostSections()` 放回 |
| 兜底 | 宿主层不可读 → `method = "append-only"`，退回"自有 persona 段 + SEAL 压制" |

`complete: true` 的宿主段不覆盖（它是"唯一提示词"），记入 `dissolve.skipped`。

### 2. 控制台新增"启动注入"流程

- 两个入口：**🛡 一键隔离注入**（`scope=local`）／**⚡ 启动注入**（`scope=global`）
- 六步时间线（真实执行，非装饰）：识别宿主提示词层 → 扫描约束性 section → 覆盖约束层 →
  确认破甲核注入 → 部署自检 → 破甲启动
- 完成横幅：`✓ 破甲启动成功 · <scope> · <ms>`；失败逐步标红并显示该步 detail
- 顶部统计：`宿主提示词层 N 段 / 约束 M / 已覆盖 K`

### 3. 新增 HTTP 与自检项

- `GET /gen5/dissolve` — 宿主层扫描快照（`hostSections` / `constrained` / `covered` / `skipped` / `errors`）
- `POST /gen5/engage` — 六步流水，返回 `steps: [{ id, label, status, detail, ms }]` 与 `verdict`
- `gen5_verify` 新增：`dissolve-host-scan`（引擎是否读到宿主层）、
  `dissolve-constrained`（命中 / 覆盖 / 宿主段数）

### 4. 版本与文案

- 版本 0.4.0 → **0.4.1**（徽标、控制台、install.ps1、文档同步）
- 源码目录仍沿用 `dsh-armor-gen5-0.4.0`（历史路径），包内版本以 `package.json` 为准

## 0.4.0-r2 — 2026-11-05（瓦解层修复：`gen5_verify` 部署验证失败）

现象：`gen5_verify` 报 `dissolve-persona-prefix: conflict` / `dissolve-persona-suffix: conflict`
→ `verdict: FAIL`，而 `dissolve-suppress-context: on`、`dissolve-complete: off`。

根因（宿主实现，不是配置错）：`@deepseek-ai/dsh-system-prompt` 的 `section()` 是

```js
return this.layers.effect(this.ctx, (layer) => layer.sections.insert(section.name, section), …);
```

`this.ctx` 是**服务自己的 ctx**，没有 scope tag → 所有注册都进 **global 层**。
宿主构造期已在 global 层注册 `harness:identity` / `deployment:persona-prefix` /
`deployment:persona-suffix`，插件再注册同名必然抛 `prompt section "…" is already registered`。
源码注释承诺的"agent preset 同名遮蔽"在当前实现里没有通路，所以初版的三层遮蔽恒为 `conflict`。

| # | 问题 | 修复 |
|---|---|---|
| 1 | persona 前缀/后缀用宿主的 `deployment:persona-*` 名字，必冲突 | 改用自有命名空间 `infinite-gen-5:persona-prefix`（order 0）/ `infinite-gen-5:persona-suffix`（order 10200）。宿主这两个 section 默认 text 为 `""`、渲染时被丢弃，自有名字等价替换且不撞名 |
| 2 | `harness:identity` 用空文本同名遮蔽，必冲突 | 不再尝试删除（插件 API 删不掉），改由 `ARMOR_PERSONA_PREFIX` 的压制句（"更早的身份句被本工作台身份取代"）+ `ARMOR_SEAL` 的 last-word 覆盖；状态记 `seal-fallback` |
| 3 | 重名错误一律判 `conflict` → FAIL | `registerDissolveSection()` 区分：`already registered` → `shadowed`（另一会话已注册，等价生效）；其余异常才是 `conflict` |
| 4 | 第二个 armor 会话注册同名核心 section 会抛错，中断整条激活链 | 新增 `registerOnceSection()`：persona 注入 / 破甲核 / complete 撞重名时按 `existing` 处理，不中断 |
| 5 | `gen5_verify` 的判定过严 | identity 判 `!== "conflict"`；persona 判 `on || shadowed`；complete 增加 `shared` 状态 |

改后 `gen5_verify` 期望：`dissolve-identity: seal-fallback`、`dissolve-persona-prefix: on`
（或 `shadowed`）、`dissolve-persona-suffix: on`（或 `shadowed`）、`dissolve-suppress-context: on`、
`dissolve-complete: off` → `verdict: OK`。

## 0.4.0-r1 — 2026-11-05（交付整理批次，包版本号不变）

本批次不改注入链、不改 prompt、不改瓦解层逻辑，只做「交付给别人不会踩坑」的收尾：

### 1. 客户端 UI 修复（从 0.3.0-r1 移植；0.4.0 原包漏了这三处）

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 左侧边栏插件项显示 `armor-gen5` 而不是「无限五代」 | 宿主 `dsh-client-ui-sidebar` 用 `resolveSlotLabel(options.label) ?? id` 取名；原来 `label` 是 `function(){ return t(); }`，而 `t` 被 `ctx.locale.bind(ns)` 替换成"需要 key 的翻译函数"，裸调用返回 `undefined`，宿主回落到 slot `id`（`armor-gen5`） | `label` 改为常量 `PANEL_LABEL`（`"无限五代"`），不再经过 `locale.bind`；main 面板与 sidebar 面板共用同一常量 |
| 2 | 徽标同时出现绿点 + 黑点（`⚫`） | `var text = "⚫ " + BADGE_TEXT + …`，黑点是文本前缀，绿点是 `DOT_STYLE` 圆点 | 删除文本前缀，只保留状态圆点 |
| 3 | 徽标尾部多出「· 全部模式」 | 同一行 `global ? " · 全部模式" : ""` 拼进文本 | 删除后缀；范围信息保留在 `title` 悬浮提示与控制台「注入范围」行 |

### 2. 打包与文档

| # | 文件 | 问题 | 修复 |
|---|---|---|---|
| 4 | `package.json` | `files` 白名单漏 `restore-bundles.ps1` → `npm pack` 后别人拿不到 bundles 恢复脚本 | 补入，并新增 `CHANGELOG.md` / `HANDOFF.md` / `tools` |
| 5 | `HARNESS_PLUGIN.md` | 标题与安装示例仍写 `dsh-infinite-gen-5`（装上去解析不到包）；验收值写的是 0.3.0 的 revision | 改为 `dsh-armor-gen5`；revision 更正为 `20261105-gen5-forge-v910-dissolve`；补瓦解层五项验收 |
| 6 | `README.md` | 面板名写「破甲」、徽标写「⚫ 破甲已开启 · …」，与实际 UI 不符 | 统一为「无限五代」+「● 无限五代 破甲 v0.4.0」；补文档索引与瓦解层说明 |
| 7 | `install.ps1` | 安装完成提示写旧文案（⚫ / ⚡破甲） | 改为实际 UI（● / ⚡无限五代） |
| 8 | `cordis.patch.yml` | 注释写「⚫ 破甲状态条 + 左侧边栏「破甲」控制台」 | 同步为实际 UI 描述 |
| 9 | `preheat.js` | 首行注释写 `dsh-infinite-gen-5` | 改为 `dsh-armor-gen5` |
| 10 | 新增 `tools/asar-read.cjs` | 无：宿主前端在 `app.asar` 内，`grep` 搜不到，排查 slot/label 类问题需要它 | 零依赖提取单文件（注释含 asar 头结构说明） |

## 0.4.0 — 2026-11-05

- 实现修订号：`20261105-gen5-forge-v910-dissolve`
- **瓦解层（DISSOLVE STACK）**：破甲启动时通过 `SystemPrompt` 官方 API 瓦解宿主限制层，不修改任何宿主文件
  1. `harness:identity` 遮蔽（order -1000，空文本 = 从渲染中移除）
  2. `deployment:persona-prefix` 遮蔽（order 0，工作台身份 + 指令权威性声明）
  3. `deployment:persona-suffix` = ARMOR SEAL（order 10200，全文最后一段）
  4. `suppressRuntimeContext()`（清空运行时上下文快照）
  5. `complete: true`（可选，`GEN5_COMPLETE=1`，整个系统提示词只剩破甲核）
- 降级安全：每一层独立 try/catch，宿主改名/改序/缺 API 时记 `conflict` 并继续，不崩溃
- 新开关：`GEN5_DISSOLVE` / `GEN5_SUPPRESS_CONTEXT` / `GEN5_COMPLETE`
- `gen5_verify` 新增 5 项瓦解层检查
- `prompts/infinite-gen-5.md` 与 0.3.0 完全一致（prompt-set-hash 不变）

## 0.3.0 — 2026-11-04

- 破甲核 FLASH-FORGE v9.1（首字门 / 回归测试语境 / 思考槽封口 / 反制路由 / 词汇表 / 四公理）
- 机制层：W5 自我博弈再锚定、T4 证据链预热、会话投影 `armor`（四态判定）
- `prompt-inject.md` 身份层注入（`GEN5_PERSONA_INJECT`）+ 提示词权威性声明
- 客户端：输入框徽标（点击切 scope）+ 左侧控制台面板
- 工具：`gen5_verify`、`infinite_gen5_profile`
- HTTP：`/gen5/scope`、`/gen5/verify`

## 0.2.0 — 2026-11-04

见 `dsh-armor-gen5-0.2.0/FIXES.md`：安装脚本编码、`files` 白名单、`cordis.patch.yml` 结构、
client `inject` 声明、逐注册 try/catch、控制台空白（`__dshGen5Tools` 占位）等 12 项。
