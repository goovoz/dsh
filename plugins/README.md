# 插件库

本目录是**构建进镜像的插件来源**。每个子目录就是一个插件包（含 `package.json`），
构建时整体拷进镜像 `/opt/plugins`，容器启动时按 `enabled.txt` 装进 profile。

**默认不集成**：镜像只有在 `PLUGINS=1` / `WITH_PLUGINS=1` 时才会带上这里的插件。

## 加一个作者的插件（一条命令）

```bash
make plugin-add URL=https://github.com/<owner>/<plugin>.git
make build PLUGINS=1 && PUBLIC_HOST=<host:port> make up
```

`make plugin-add` 实际做三件事：`git submodule add` 到 `plugins/<dir>`、把目录名写进 `enabled.txt`、打印后续步骤。
想换目录名：`make plugin-add URL=<git-url> NAME=<dir>`。

查看现状：

```bash
make plugin-list          # enabled.txt + 插件目录 + submodule 状态
git submodule update --remote plugins/<dir>   # 跟随作者更新
```

不想用 submodule 也可以直接拷目录，然后 `echo <dir> >> plugins/enabled.txt`。

## 更新与移除

```bash
make plugin-update NAME=<dir>   # submodule 拉到作者最新，打印新旧提交与最近 5 条日志
make plugin-remove NAME=<dir>   # deinit + git rm + 删 .git/modules + 从 enabled.txt 移除
```

`plugin-update` 只对 **submodule** 生效；vendored 普通目录会提示如何转成可跟踪的 submodule。
更新完记得 `git commit`（脚本只 `git add`）再 `make build PLUGINS=1`。

`plugin-remove` 只改仓库：**已经在跑的容器 profile 不会自动卸载**。旧实例要额外处理：

```bash
docker exec -it dsh-web dsh plugin --profile web remove <npm 包名>
# 或者换一个全新的 data 卷重建
```
## 插件需要额外动作时

在插件目录里放一个可执行的 `dsh-install.sh`，容器启动时会在 `dsh plugin add` 之后执行它，环境变量：

| 变量 | 含义 |
|---|---|
| `PROFILE_DIR` | 当前 profile 目录（`$DSH_HOME/profiles/web`） |
| `PLUGIN_DIR` | 插件在镜像里的路径（`/opt/plugins/<name>`） |

典型用途：把插件里的内核副本拷到 profile、往 `cordis.patch.yml` 追加 preset 行。
参考 `dsh-armor-gen5/dsh-install.sh`。

## 需要改插件源码时

不要直接改插件目录，改成补丁放 `patches/`：

```bash
diff -u plugins/<plugin>/some.js <改好的文件> > patches/0002-<plugin>-<说明>.patch
```

补丁里的路径以 `a/<plugin>/...` 开头，构建期由 `scripts/apply-plugin-patches.sh` 用 `patch -p1 -d /opt/plugins` 依次施加；
已打过会跳过，冲突会让构建失败（不会产出半成品镜像）。内置的 `patches/0001-armor-gen5-preset-selfcheck.patch` 就是这种用法。

## 不在本仓库范围

本仓库只做「DSH 本体 + 插件 + 部署脚手架」。**原生引擎运行时包**（例如需要 Ghidra/JDK/JPype 这类预编译依赖的大体积运行包）
不属于这里：它们有平台矩阵、体积大、跟插件解耦，请放到独立仓库另行分发，不要塞进本镜像。
