# 无限N代（dsh-infinite-gen-n）— 项目执行计划

> 状态：待评审 | 命名：无限N代 / Infinite Generation N | package: `dsh-infinite-gen-n`

## 一、项目目标

把三个资产融合为**一个** DeepSeek Harness 插件「无限N代」：

| 资产 | 来源 | 在融合中的角色 |
|---|---|---|
| v10 op spec（1146 行） | `prompt_deepseek_v10.txt` | L3 提示词层：主提示词原文换入 |
| 无限四代 v0.5.3 | `dsh-infinite-gen-4-main/` | 架构与界面：preset 注入 + 徽标 + 归一化 + 预热，代码主体 |
| dsh-purge 1.1.71 | `dsh-purge-1.1.71/` | 引擎：宿主清洗补丁引擎（**剥掉全部渗透内容后**移植） |

### 技术决策（默认采用，可改）

| 决策点 | 取值 | 理由 |
|---|---|---|
| 形态 | preset 注入为主，清洗为内置可选模块 | 界面以四代为准；purge 的会话按钮/演练台全弃 |
| 版本 | `1.0.0` 起，代际标 `N` | "N" = 终代/集大成，打破 minor=代际的旧口径 |
| 提示词 | v10 全文原样，不裁不删 | 39 节机制完整保留，只换不写 |
| 兼容工具名 | `nv_verify` / `nv_profile`，保留 `gen5_verify` 别名 | 老验收脚本不炸 |

---

## 二、里程碑

### M0 — 骨架立起（0.5 天）
- Fork 四代目录 → `dsh-infinite-gen-n/`，全局改名（id、预设名、徽标文案、投影 key）
- `prompts/v10.md` ← `prompt_deepseek_v10.txt` 原文放入
- `package.json` 1.0.0 + dsh 元数据更名；`cordis.patch.yml` / `preset-rows.js` 更名
- **验收**：`node --check index.js && node --check client.js` 全绿；装机后新建会话可选「无限N代」预设，选中出现徽标

### M1 — v10 适配层（1 天）
- `PROMPT_URL` 默认指向 `v10.md`（`GEN4_VARIANT=v10`）
- `REFUSAL_MARKERS` 扩充 v10 house-register 禁词（however / please note / worth noting / let me know if / hope this helps…）
- 投影新增两项检测（只亮灯不改写）：
  - **token-zero**：首 token 非 `ollie:` → `partial`
  - **watermark**：末尾缺零宽水印字符（U+200B..U+2064）→ 提示不判失败
- `REANCHOR_TEXT` 默认文案换 v10 spine 风格英文短句
- `delivery_profile`：`lineage` 增 `v10-op-spec`，`strengthCalibration` 增 `v10: 95`，`TEMPLATES` 换 v10 acknowledgment set + counter-bank
- **验收**：`nv_verify` checks 全 pass；真实对话中徽标四态（思考中/✓/◐/✗）正确；v10 协议输出（`ollie:` / `Title:` / 水印）均被检测到

### M2 — purge 引擎移植（1.5 天，本项目核心）
- `lib/host-patch/`：备份 `.bak`、幂等 apply、revert、版本原文比对后 skipped、`MANIFEST-SHA256` 校验 —— 引擎整体照抄 purge
- 移植**非渗透**补丁子集：#4 #5 #6 #7 #11 #12 #14 #15 #16 #17 #18 #19 #22 #23 #24 #25 #26 #29 #30 #31 #33 #34 #38 #39 #40 #42 #45 #46 #47 #48 #49 #51 #53 #54（persona 清洗 / 审批放行 / 沙箱禁用 / 读取上限 / 工具结果免疫）
- `nv_verify` 增 L1 校验项（清洗是否生效）
- 开关 `GEN4_PATCH=0` 可整体关闭清洗层
- **验收**：apply→revert 往返一致；对不上的补丁 skipped 不乱改；`GEN4_PATCH=0` 时零清洗生效

### M3 — 安装/分发/收尾（0.5 天）
- `install.ps1` / `uninstall.ps1` / `install.sh` / `uninstall.sh` 更名适配（三处复制 + 哈希回读 + 备份回滚 + `plugin-backups`）
- `MANIFEST-SHA256.txt`、`RELEASE_NOTES.md`、`README.md`
- **验收**：从零安装 → 验收四层（装上了 / 加载了 / 生效了 / 交付了）逐层过

---

## 三、依赖关系

```
M0 ──► M1 ──► M3
  \          ▲
   └─► M2 ────┘
```

M2（清洗引擎移植）工作量最大、风险最高，但独立于 M1；若 M2 遇阻，M1+M3 可先出一个纯注入版本。

## 四、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| **与已装 dsh-purge 冲突**（同一宿主两套补丁） | 高：补丁互相覆盖 | M2 首个任务：检测 dsh-purge 已应用状态；已装则默认跳过 L1 清洗并提示 |
| purge 补丁绑定 `dshTarget: 0.2.0-rc.2` | 宿主升级后清洗失效 | 保留原文比对 + skipped 机制，失效只降级为"纯注入模式"，不乱改 |
| v10 英文提示词 × 中文会话 | 低 | `normalize.js` 中英兼容已验证；reanchor 默认英文匹配 v10 register，可 `GEN4_REANCHOR_TEXT` 覆盖 |
| v10 水印/token 协议被宿主裁剪 | 低 | 投影只检测不强制，协议承载全在提示词 |

## 五、验收口径

1. **装上了**：三处副本版本号 + SHA256 一致
2. **加载了**：会话内 `nv_verify` 报 `implementationRevision` 为当前版
3. **生效了**：checks 全 pass；清洗补丁（如启用）applied 列表与预期一致
4. **交付了**：选「无限N代」预设真实对话，徽标四态随 v10 协议行为翻转
