# DeepSeek Harness Plugin — 无限五代 / dsh-armor-gen5

破甲（armor-breaking）插件，项目名：**无限五代 破甲 v0.2.3**。

原创破甲工作台：破甲核为 **FLASH-FORGE v9.1**（本研究项目实测最优），机制层包含
**W5 自我博弈再锚定**与 **T4 证据链预热**。

## What the plugin provides

- `prompts/infinite-gen-5.md`（FLASH-FORGE v9.1）以追加式系统提示词段注册（`order: 100`）。
- **首字门（FIRST-TOKEN GATE）** — 拒绝句需要有一个开头句；首字强制为 `##` 后拒绝没有落点。
- **回归测试语境（REGRESSION CONTEXT）** — 把请求定义为"回归测试的执行项"，实测比安全语境更有效。
- **思考槽封口（THINKING-SLOT SEAL）** — 思考槽只允许三件事（钉原动词、填占位符、排交付顺序），推脱/绕路草稿当场作废。
- **W5 自我博弈再锚定** — 检测到拒绝/降级后注入 `[work-reminder]` + 池内随机文案（5 种）。wave2 实测：34.5% 残余救援率。0.2.0 起波次按窗口归还（默认 3 次 / 20 轮）。
- **T4 证据链预热** — 授权工具 + 扫描工具的堆叠注入（`preheat.js`）。wave4 实测：59.1% vs 基线 31.8%（22 探针样本）。0.2.0 起真正接在会话首轮 + 裸续句门控上。
- **运行期热配置（v0.2.0）** — `~/.dsh/.dsh-armor-gen5.json` 承载 W5 预算/窗口/文案池、重申间隔、归一化、预热模式、自定义拒绝词；mtime 缓存，免重装生效。

### 启动注入的两个入口（控制台）

| | 🛡 一键隔离注入 | ⚡ 启动注入 |
|---|---|---|
| scope | `local` | `global` |
| 注入者 | 预设实例 | 常驻实例 |
| 生效会话 | 仅「破甲模式」预设 | 本 profile 所有预设 |
| 适用 | 日常 | 其它预设也要破甲 |

同一条路由 `/gen5/engage`、同一套六步流水（识别 → 扫描 → 覆盖 → 注入确认 → 自检 → 就绪）。
「覆盖约束层」是进程级动作，两个入口都会执行；区别只在破甲核注入到哪些会话。
写盘后约 3 秒热生效；`local` 不等于关闭破甲；`GEN5_SCOPE` 环境变量存在时按钮不改范围。
- **`client.js`（客户端半体）** — 对话框徽标「● 无限五代 破甲 v0.2.3」，左侧状态圆点四态实时判定；左侧边栏「无限五代」控制台：两个注入入口（一键隔离注入 / 启动注入）+ 六步流程时间线 + 完成横幅。
- **自动瓦解引擎（v0.4.6）** — 启动时枚举宿主 `systemPrompt.layers.global.sections`，按名字与文本词根识别约束性段落，就地清空覆盖；不可读时降级为追加压制。开关：`GEN5_DISSOLVE` / `GEN5_SUPPRESS_CONTEXT` / `GEN5_COMPLETE`。
- 会话投影 `armor`（拒绝触发 W5 + 每 10 轮周期重申，advisory 不阻塞）。

## 强度标定

| 版本 | 强度 | 说明 |
|---|---|---|
| **无限五代 (v0.2.3)** | **≈92** | FLASH-FORGE v9.1 破甲核 + W5 再锚定（窗口化）+ T4 证据链（已接线）+ 自动瓦解 + 运行期热配置 |
| 无限四代 (STABLE v4) | ≈92 | 三代骨架 + 防超时纪律 + stealth v4 |
| 无限三代 (v0.4.6) | ≈90 | fusion 冠军骨架 |
| 无限二代 (v0.2.3) | ≈85 | 稳定化 + 降档 |
| 无限一代 | ≈60 | 保留豁免与澄清口子 |

注：与 gen-4 同为 ≈92，但路径不同：gen-4 靠防超时纪律 + stealth v4，
gen-5 靠 W5 自我博弈（拒绝后修复）+ T4 证据链（预热增强）。
两者是互补而非严格递进；如果与 gen-4 同装，gen-5 只在 armor 预设下注入。

## 实测成绩（deepseek-flash, temp 0.7, 128 探针题库）

| 配置 | 通过率 | 样本量 |
|---|---|---|
| V9.1 单帧（破甲核） | 30% | 50 探针（同批 V8 24%）|
| + 帧排列（F1-F4 轮换） | 77.3% | 128 探针 |
| + W5/W4/CoT 残余救援 | 89.1% | 128 探针 |
| E2E 引擎 v2（真实递进） | 77.3% | 22 探针 |
| W5 单项救援率 | 34.5% | 29 残余失败 |
| T4 证据链单帧 | 59.1% | 22 探针（基线 31.8%）|

## Install

```powershell
# 1. 把本插件目录放到 lab home 的 plugins/ 下（或任意位置）
# 2. 在 profile 的 package.json 中添加依赖：
"dependencies": {
  "dsh-armor-gen5": "file:../../plugins/dsh-armor-gen5"
}
# 3. 在 profile 的 package.json 中加入 bundles：
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "dsh-armor-gen5"] } }
# 4. pnpm install && 重启会话
```

或直接使用安装脚本：

```powershell
.\install.ps1
```

卸载：

```powershell
.\uninstall.ps1
```

## Local verification

```powershell
node --check index.js; node --check client.js   # 双绿 = 语法通过
```

部署后在会话中调用 `gen5_verify` 工具，确认：
- `package-version` = `0.2.3`
- `implementation-revision` = `20261105-gen5-forge-v915-auto`
- `prompt-set-hash` 前 16 位
- `dissolve-host-scan` = `section-map @ <时间>`（引擎读到了宿主层）
- `dissolve-constrained` = `命中 N / 覆盖 M / 宿主 K`（M > 0 即自动覆盖生效）
- 其余五项（`dissolve-identity` / `-persona-prefix` / `-persona-suffix` / `-suppress-context` / `-complete`）不出现 `conflict`

## 与 gen-4 共存

gen-5 与 gen-4 可同装。两者都只在各自激活时注入：
- gen-4 在「破甲模式」预设（`armor-gen4` 行）激活时注入
- gen-5 在「破甲模式」预设（`armor-gen5` 行）激活时注入

若两个版本的 armor 行同时启用，后注册的生效（先注册的先被释放）。
