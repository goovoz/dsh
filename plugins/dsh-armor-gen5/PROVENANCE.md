# 来源与上游关系（PROVENANCE）

| 项 | 内容 |
|---|---|
| 上游 | https://github.com/Minglink/dsh-armor-gen5 （原始作者 Minglink） |
| 本目录内容 | 本地保存的 0.3.0 快照 |
| 为什么 vendored | 上游仓库当前不可访问；先以本地代码入库，保证构建可复现 |
| 版权 | 保留原 LICENSE，版权归原作者 |
| 本仓库对它的改动 | 仅 patches/0001-armor-gen5-preset-selfcheck.patch（构建期施加，修自检里的 profiles/desktop 硬编码）；dsh-install.sh 是本仓库新增的 Linux 容器适配脚本，不属于上游 |

## 上游恢复可见后怎么切回去

    git rm -r --cached plugins/dsh-armor-gen5
    rm -rf plugins/dsh-armor-gen5
    git submodule add https://github.com/Minglink/dsh-armor-gen5 plugins/dsh-armor-gen5

如果上游已经自己修好了 preset-patch 自检：删掉 patches/0001-*.patch；
如果上游也提供了安装钩子（dsh-install.sh），用上游版本替换本仓库那份。

验证：集成构建（make build PLUGINS=1）后打开 GUI → 侧栏「无限五代」→ 部署自检应 20 项全绿。
