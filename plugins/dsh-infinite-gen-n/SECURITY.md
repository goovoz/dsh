# 安全与读写范围（无限N代）

## L2 插件层（默认路径）

- 运行时零网络请求，不上传会话内容，不读凭据文件
- 写范围：`$DSH_HOME\.dsh-infinite-gen-n.json`（scope 设置文件，仅此一个文件）
- 会话内注入的消息带 `source.kind = "plugin:dsh-infinite-gen-n"` 标记，可审计可回溯
- 归一化只改「送往模型的那一份」用户消息，会话落盘保留原文

## L1 清洗层（`GEN4_PATCH` 开启时）

- 写范围：本机官方 `@deepseek-ai/*` 包文件（`resources/app/dsh/node_modules/@deepseek-ai`、全局 npm 的 dsh 树）
- 每个被改文件先写 `<file>.dshpurge.bak` 备份；`nv_patch_revert` 用备份还原
- 对不上原文的补丁自动 skipped，绝不强写
- 不触碰：非 `@deepseek-ai` 的第三方插件源仓库、用户会话数据、凭据

## 唯一外联

安装/更新脚本（`install.ps1` / `install.sh`）向 GitHub 取 release 与校验和；插件本体运行时完全离线。
