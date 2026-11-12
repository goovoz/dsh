# vendor/ql.js 来源

本目录下的 `ql.js` 是官方青龙 CLI 的独立 npm bundle，原样收录，未做修改。

| 项 | 值 |
|---|---|
| 包名 | `@whyour/qinglong-cli` |
| 版本 | 0.1.4 |
| 文件 | `dist/npm/ql.js` |
| SHA-256 | `3edb3aa6b72b3b1b28f636bcfe6907fbdc81248c81ebb2721efcd43bcfcb1b61` |
| 大小 | 112510 字节 |
| 上游仓库 | https://github.com/whyour/qinglong （`cli/` 目录） |
| 许可 | Apache-2.0，见同目录 `LICENSE` |
| 获取方式 | `npm pack @whyour/qinglong-cli@0.1.4` 后从 tgz 提取 |

## 为什么内联到插件里

镜像和桌面环境不一定有可用的 `npm`，而插件运行时要 `node vendor/ql.js` 才能工作。
把单文件 bundle 带进来，等于把「安装 CLI」这一步固化进插件，代价是 110 KB。

## 更新方式

```bash
npm pack @whyour/qinglong-cli@<新版本>          # 注意：上游版本号在 cli/package.json，独立于面板版本
tar xzf whyour-qinglong-cli-<版本>.tgz
cp package/dist/npm/ql.js vendor/ql.js
cp package/LICENSE vendor/LICENSE
sha256sum vendor/ql.js                          # 更新本文件的校验值
```

更新后跑一遍 `node tools/selftest.mjs`，它会用新 bundle 走完整链路（mock 面板）。
若官方改了子命令的选项结构，`index.js` 里的选项集自适应会自动适配，不需要改代码。
