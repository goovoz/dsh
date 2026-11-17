# 来源与状态（PROVENANCE）

| 项 | 值 |
|---|---|
| 上游 | https://github.com/Minglink/dsh-infinite-gen-n |
| 本仓库快照版本 | v1.1.0（`package.json`） |
| 最后可用的上游提交 | `686db07d`（2026-11-15，`fix install.ps1 …`） |
| 上游现状 | 2026-11-16 提交 `c0acafa7`「convert repo to promo landing page」后，**代码文件已全部移除**（`index.js`/`client.js`/`preset-rows.js`/`cordis.patch.yml`/`package.json` 均 404），只留 README 与推广页 |
| 同步策略 | 已改为 `mode=offline`（见 `plugins/upstreams.tsv`），**不再自动同步**；本目录即唯一可用源码 |
| 本地附加内容 | `dsh-install.sh`（本仓库维护的安装钩子）、`patches/0002-infinite-gen-n-same-origin.patch`（同源校验适配反代/局域网） |

如果需要基于上游继续演进：从本目录（或上游 `686db07d` 的快照）fork 出新的仓库，再改 `upstreams.tsv` 指向它。
