# 插件模板

复制本目录为 `plugins/<你的插件>`，把插件源码放进来，然后 `echo <你的插件> >> plugins/enabled.txt`。

- `dsh-install.sh`：可选后置脚本（模板里是空实现 + 注释）。
- 需要改源码请走 `patches/`，不要改这里。
