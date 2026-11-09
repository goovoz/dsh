# 破甲词库（Prompt Packs）设计 — dsh-armor-gen5 0.3.0

> 一句话：把「破甲词」从插件安装目录里拿出来，变成用户可自由替换、可导入导出、下一轮就生效的
> Markdown 词库；三个槽位（破甲核 / 身份前缀 / 封口段）都能换，不改宿主文件、不重装、不重启。

---

## 1. 为什么做

当前破甲文本只有两条路能改：

1. 直接改 `<安装目录>/prompts/infinite-gen-5.md` —— 升级即覆盖，且预设用的 `armor-kernel/`
   是另一份副本，改一处不生效；
2. 改 `prompt-inject.md` —— 那是身份层，不是破甲核，混在一起会把两套机制绑死。

用户真正需要的是：**换一套词 = 换一个文件**。不同模型、不同审核版本、不同场景
（技术交付 / 创作 / 渗透话术）用不同破甲词，本来就不该共用一个 md。

## 2. 设计取舍

| 方案 | 结论 | 原因 |
|---|---|---|
| 在 UI 里直接编辑一大段 textarea | 不做 | 10KB 级正文不适合在侧栏里改，容易手滑；md 文件才是用户的编辑器 |
| 每次换词都重装/重启 | 不做 | 打断会话；且预设内核副本与 bundle 副本会漂移 |
| 换词后重新注册 section | 不需要 | 宿主 `systemPrompt.section({ text: fn })` 每轮 `assemble()` 重新求值，函数即可热更新 |
| 词库放插件目录内 | 不做 | 升级/重装会清空；且两处副本各一份 |
| 词库放 `<DSH_HOME>/armor-gen5/` | **采用** | 用户数据与插件代码分离；bundle 实例与 preset 内核都读同一路径 |

## 3. 数据模型

```
<DSH_HOME>/armor-gen5/
├── packs.json                 # 当前选择（唯一状态文件）
├── packs/
│   ├── 技术交付.md            # 用户词库，文件名即 id
│   ├── 创作模式.md
│   └── ...
└── backup/
    └── 技术交付-20261107123045.md   # 删除/覆盖前自动备份
```

`packs.json`：

```json
{
  "version": 1,
  "active": {
    "core": "技术交付",
    "persona": "builtin",
    "seal": "builtin"
  },
  "updatedAt": "2026-11-07T04:30:00.000Z",
  "by": "armor-gen5-console"
}
```

- `active.<slot>` = `"builtin"` 或某个 `packs/<id>.md` 的 id；
- 三个槽位独立选择，互不影响；
- 选择文件缺失 / 写坏 / 超限时：**回落内置**，但 `describe()` 里保留 `ok:false + error`，界面能看到。

### 三个槽位

| slot | 注入位置 | 内置默认 | 建议替换频率 |
|---|---|---|---|
| `core` | `infinite-gen-5:global-system-prompt`（order 100） | `prompts/infinite-gen-5.md` | 高（主战场） |
| `persona` | `infinite-gen-5:persona-prefix`（order 0） | `prompts/armor-persona-prefix.md` | 低（身份声明） |
| `seal` | `infinite-gen-5:persona-suffix`（order 10200） | `prompts/armor-seal.md` | 中（last word 封口） |

## 4. 读取与热更新

`prompt-pack.js` 是纯函数 + 文件读取层，不依赖 Cordis：

```
text(slot)
  → readConfig() 取 active id
  → builtin ? 读内置文件 : 读 packs/<id>.md
  → stat(mtimeMs + size) 命中缓存直接返回
  → 校验 UTF-8 / 去 BOM / 拒绝 NUL / ≤ 96KB / 非空
  → 失败：返回内置文本 + 记录 error
```

注入侧：

```js
ctx.systemPrompt.section({
  name: "infinite-gen-5:global-system-prompt",
  order: 100,
  text: () => promptPack.text("core"),   // 函数：每轮 assemble 重新求值
});
```

宿主 `SystemPrompt.assemble()` 对 `typeof section.text === "function"` 的分支就是
`section.text(context)`，因此：

- 换词 = 写 `packs.json` + 文件落盘；
- 下一轮请求组装系统提示词时自动用新文本；
- **不需要 dispose/重新注册 section，也不需要重启**。

`gen5_verify` 的 `prompt-set-hash` 同步变成动态计算，`prompt-pack` 一项显示
`core=xxx · persona=xxx · seal=xxx`，任何槽位回落都会 FAIL 点名。

## 5. HTTP API

路由只在常驻实例注册（与 `/gen5/scope` 同源）。

### `GET /gen5/packs`

```json
{
  "ok": true,
  "slotNames": ["core", "persona", "seal"],
  "dir": "C:\\Users\\X\\.dsh\\armor-gen5",
  "packsDir": "C:\\Users\\X\\.dsh\\armor-gen5\\packs",
  "maxBytes": 98304,
  "slots": { "core": { ... }, "persona": { ... }, "seal": { ... } },
  "packs": [{ "id": "技术交付", "bytes": 10240, "hash": "ab12…", "mtimeMs": 1762… }]
}
```

单个 slot 描述：

```json
{
  "slot": "core",
  "active": "技术交付",
  "file": "C:\\Users\\X\\.dsh\\armor-gen5\\packs\\技术交付.md",
  "builtinFile": "infinite-gen-5.md",
  "source": "user",
  "ok": true,
  "error": "",
  "bytes": 10240,
  "hash": "…64 位 sha256…",
  "mtimeMs": 1762…
}
```

### `POST /gen5/packs`

| action | body | 行为 |
|---|---|---|
| `select` | `{ action, slot, id }` | 切换槽位到 `builtin` 或用户词库；目标不存在 → 400 |
| `import` | `{ action, slot, name, text }` | 新建词库（名 → 安全 id，重名自动 `-2`），默认立即应用 |
| `remove` | `{ action, id }` | 移到 `backup/`；若正被使用则同时回落 `builtin` |
| `reset` | `{ action, slot }` | 等价 `select(slot, "builtin")` |

所有响应都带完整 `describe()`，前端一次拿到最新列表，不需要二次请求。

## 6. 控制台交互（0.3.0）

「破甲词库」区块：

```
破甲核    用户词库 · 10240 B · ab12cd34ef56     [技术交付 ▾]  [恢复内置] [删除]
身份前缀  内置 · 653 B · 9f8e…                  [内置 · armor-persona-prefix.md ▾]
封口段    内置 · 855 B · 7d6c…                  [内置 · armor-seal.md ▾]
导入 .md  [破甲核 ▾]  [选择文件]
词库目录：C:\Users\X\.dsh\armor-gen5\packs（改完下一轮生效；切换失败会自动回落内置）
```

- 下拉选项 = `builtin` + 全部用户词库（显示字节数）；
- 选中的用户文件被删/写坏时，下拉会补一个「（文件缺失）」项，同时 `error` 显示在 meta 行；
- 切换成功提示「下一轮生效」，并立即刷新 `gen5_verify`（hash 变了）。

## 7. 安全边界

| 风险 | 处理 |
|---|---|
| 路径穿越（`../x`、`a/b`、`..`） | id 白名单：字母/数字/点/横线/下划线/中文，禁止分隔符与连续 `..`；文件永远拼在 `packs/` 下 |
| 超大文件拖垮每轮 assemble | 96KB 上限（内置核约 10KB），超限直接拒绝并回落内置 |
| 二进制 / 空文件 | 去 BOM 后必须非空、不含 NUL |
| 写入中断留下半个文件 | 先写 `*.tmp-<pid>` 再 `rename` 原子替换 |
| 删除误伤 | 不真删，移到 `backup/<id>-<时间戳>.md` |
| 配置写坏 | `packs.json` parse 失败 → 全部回落 `builtin`，破甲不整体失效 |
| SSRF / 远程拉取 | 0.3.0 不做 URL 导入；只接受本地文件内容 |

注意：这是**用户自己的**系统提示词，词库内容等价于用户手改 `prompts/*.md`，
插件只负责"放进去 + 选中 + 注入"，不校验内容语义。

## 8. 与双实例 / preset 的关系

`armor-gen5` 有两个模块副本：

1. bundle 实例（`node_modules/dsh-armor-gen5`）——注册路由、控制台数据源；
2. preset 内核（`profiles/desktop/armor-kernel/`）——「破甲模式」会话里真正注入的实例。

两份代码都调用 `createPromptPack({ home: <DSH_HOME>/armor-gen5, ... })`，**读同一份文件**：

- 控制台切词 → 写共享 `packs.json`；
- 下一轮，任一副本 `text()` 都读到新内容；
- 两个副本不需要进程间通信，也不需要重启。

## 9. 打包 / 升级 / 卸载

- `package.json.files` 增加 `prompt-pack.js`；
- `install.ps1` 把 `prompt-pack.js` 复制进 `armor-kernel/`；
- 升级不清空 `<DSH_HOME>/armor-gen5/`（用户数据在 DSH home，不在插件目录）；
- 卸载默认保留词库目录；需要彻底清理时手动删 `<DSH_HOME>/armor-gen5/`。

## 10. 验收

```powershell
node tools/test-packs.mjs     # 10 项：默认/导入/切换/热更新/坏文件/穿越/上限/删除
node tools/render-smoke.mjs   # 控制台离线渲染：注入状态=已注入 + 词库区块
node tools/selftest.mjs       # 机制 14 项
node --check index.js; node --check client.js; node --check prompt-pack.js
```

手工验收：

1. 控制台「破甲词库」把破甲核切成用户词库 → 提示"下一轮生效"；
2. 在同一会话发一条消息 → `gen5_verify` 的 `prompt-set-hash` 变化；
3. 把 `packs/<id>.md` 改成空文件 → 控制台显示回落、`prompt-pack` 检查 FAIL；
4. 恢复内置 → hash 回到安装时的值。

## 11. 路线图

| 版本 | 能力 |
|---|---|
| 0.3.0 | 三槽位本地词库 + 导入/切换/删除/恢复 + 热更新 |
| 0.3.x | 词库内联预览、diff（切之前看差异）、按模型绑定（deepseek-flash / 其它） |
| 0.4.0 | 词库包（`pack.json` + 多 md + 元数据）导入导出、社区分享格式 |
| 后续 | A/B：同一会话内两套核轮换，按通过率自动选优 |
