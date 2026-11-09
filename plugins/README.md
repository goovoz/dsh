# 插件库

本目录是**构建进镜像的插件来源**。每个子目录就是一个插件包（含 `package.json`），
构建时整体拷进镜像 `/opt/plugins`，容器启动时按 `enabled.txt` 装进 profile。

## 加一个作者的插件

```bash
# 方式 A：git subtree / submodule（推荐，方便跟随作者更新）
git submodule add https://github.com/<owner>/<plugin>.git plugins/<plugin>
echo <plugin> >> plugins/enabled.txt

# 方式 B：直接拷目录
cp -a /path/to/plugin plugins/<plugin>
echo <plugin> >> plugins/enabled.txt
```

然后重建镜像：`make build && make up`。启动时会自动 `dsh plugin --profile web add file:/opt/plugins/<plugin>`。

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

补丁里的路径以 `a/<plugin>/...` 开头，构建期由 `scripts/apply-plugin-patches.sh` 用 `patch -p1 -d /opt/plugins` 依次施加。
已经内置的 `patches/0001-armor-gen5-preset-selfcheck.patch` 就是这种用法。
