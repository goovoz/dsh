# DSH Web · Docker 部署

把 **DeepSeekRuntime（DSH）** 跑在容器里，浏览器直接使用；前端就是桌面端那份（同一份 `apps/web`），
不是仿写。另附一层零依赖网关负责自动登录与反代，卷挂 `./data` 做持久化。

| 能力 | 说明 |
|---|---|
| 跟随上游 | 一个 `package.json#dshVersion` 决定一切；`make bump` 拉到 npm 最新，`make build` 重建 |
| 插件库 | `plugins/<name>/` 每个目录一个插件包，构建进镜像，启动时装进 profile |
| 插件补丁 | `patches/*.patch` 构建期施加，用来修上游插件的小毛病（已内置 preset 自检修正） |
| 免手动登录 | 网关自动用 launch token 换 cookie，打开就是首页 |
| 持久化 | `$DSH_HOME`、workspace、会话、插件、凭据都在 `./data` 卷 |
| 多架构 | 镜像不含原生二进制，`amd64` / `arm64` 都能直接构建 |

> 默认构建不集成第三方插件；需要时 make build PLUGINS=1（镜像 tag 带 -plugins）。

## 快速开始

```bash
git clone https://github.com/goovoz/dsh.git && cd dsh
make build                       # 构建镜像（默认用 package.json 里的 dshVersion）
make up
```

浏览器打开 `http://<本机IP>:<端口>/` 即可，无需点带 token 的链接。

> 不再需要设 `PUBLIC_HOST`：容器内 DSH 用固定内部 authority `dsh.internal`，网关按来访 `Host` 自动适配，
> 浏览器用 `http://<本机IP>:<端口>/` 直接访问即可。要强制指定 authority 时再设 `PUBLIC_HOST`。

## 随上游更新（自动）

`bump.yml` 每天 04:00 UTC 检查一次 npm 上的 `@deepseek-ai/dsh`：

1. 上游比 `package.json#dshVersion` 新 → 自动提交 `chore: bump dsh to <v>` 并 push；
2. 用 `GITHUB_TOKEN` 显式派发 `build.yml`（token 触发的 push 不会连带触发别的 workflow，所以必须 dispatch）；
3. `build.yml` 构建 → 冒烟 → 推 GHCR → 建 Release。

上游不比当前新、或已同步时，工作流只记一行日志就退出。手动入口仍在：

```bash
make latest     # 看 npm 最新
make bump       # 本地写回 package.json
make build && make up
```

也可以手动触发 bump 工作流并勾 `dry_run`：只检查、不提交。

### extras 版本解析（三级回退）

`extras.txt` 里的桌面等价插件组由 `scripts/resolve-extras.mjs` 逐包解析，容器日志会标出命中级别：

| 顺序 | 规则 | 说明 |
|---|---|---|
| 1 | 精确同版本 | extras 存在与已装 dsh 完全一致的版本 → 直接用它（最稳） |
| 2 | 同 major.minor 最高 | 没精确版本时在 `x.y.*` 里取最高（含预发布），避免跨 minor 混搭 |
| 3 | latest | 前两级都落空才退回 dist-tag `latest` |

示例：`[extras] @deepseek-ai/dsh-experimental-terminal-bundle 解析 0.2.2-rc.1（exact）`。
注意 npm 的 `view <pkg>@<range>` 不支持语义化范围（会 404），所以解析器拉全量 `versions` 自己比。

### 第三方插件

`plugins/` 里的插件不会被自动升级：submodule 固定到提交，用 `make plugin-update NAME=<dir>` 跟随作者；
vendored 目录需要重新拷贝或转成 submodule。

## 插件库

默认不集成：WITH_PLUGINS=0 时镜像里没有 /opt/plugins 内容（构建期用 BuildKit mount 决定是否拷入），CI 同样默认不集成，需要时在 workflow_dispatch 勾 with_plugins。


```
plugins/
├── enabled.txt              # 每行一个要启用的插件目录名
├── README.md                # 加插件的三种姿势
├── _template/               # 新插件模板（含 dsh-install.sh 钩子）
└── dsh-armor-gen5/          # 示例：vendored 插件，自带后置脚本
```

加一个作者的插件：

```bash
git submodule add https://github.com/<owner>/<plugin>.git plugins/<plugin>   # 或 cp -a 直接拷
echo <plugin> >> plugins/enabled.txt
make build && make up
```

启动时 `scripts/install-plugins.sh` 会：

1. `dsh plugin --profile web add file:/opt/plugins/<plugin>`（幂等，profile 在卷里）；
2. 若插件目录有可执行的 `dsh-install.sh`，接着执行它，环境变量 `PROFILE_DIR` / `PLUGIN_DIR` 已就位。

后置脚本用来处理“装完还要做点什么”的插件，例如 `dsh-armor-gen5` 需要把内核副本放进 profile，
并把 `preset-armor` 行写进 `cordis.patch.yml`（预设注册表在 web-app 的 entry-local realm，
bundle 层看不到它，只能在 profile patch 里声明）。

## 插件补丁：preset 自检修正

`dsh-armor-gen5` 0.3.0 的部署自检项 `preset-patch` 里，路径被写死成 `$DSH_HOME/profiles/desktop/cordis.patch.yml`：
在 `web` profile 下这项永远 `✗`（功能其实正常，只是自检误报）。本仓库用补丁修掉：

```
patches/0001-armor-gen5-preset-selfcheck.patch
```

补丁在**构建期**由 `scripts/apply-plugin-patches.sh` 施加（`patch -p1 -d /opt/plugins`），已打过会跳过，
冲突则构建失败——不会悄悄产出半成品镜像。插件版本升级后若补丁打不上，按提示重新生成：

```bash
diff -u plugins/<plugin>/<file> <改好的文件> > patches/0002-<plugin>-<说明>.patch
```

## 目录结构

| 路径 | 作用 |
|---|---|
| `Dockerfile` | node:24-bookworm-slim + dsh + pnpm + bubblewrap + python3；构建期打补丁 |
| `compose.yaml` | 端口、卷、`cap_add: SYS_ADMIN`、`apparmor/seccomp unconfined` |
| `entrypoint.sh` | 装 extras → 装插件 → 起网关 → 守护 `dsh --profile web` |
| `gateway.mjs` | 零依赖反代：无 cookie 时用 launch token 换 cookie，HTTP + WebSocket 直通 |
| `capture.mjs` | 从启动日志抓 43 字符 launch token 落到 `/run/dsh/launch-token` |
| `scripts/` | `install-extras.sh` / `install-plugins.sh` / `apply-plugin-patches.sh` |
| `extras.txt` | 桌面等价插件组清单 |
| `plugins/` | 插件库（构建进镜像 `/opt/plugins`） |
| `patches/` | 插件补丁（构建期施加） |
| `data/` | 运行期卷：`data/dsh`（DSH_HOME）+ `data/workspace` |

## 配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `DSH_VERSION` | `package.json#dshVersion` | 构建参数，决定装哪版 `@deepseek-ai/dsh` |
| `PUBLIC_HOST` | 空（自动） | 可选。留空时用内部 authority `dsh.internal` + 网关改写，任意地址可访问；显式设置则沿用该 authority |
| `DSH_PORT` | `8899` | 宿主机端口 |
| `WITH_EXTRAS` / `DSH_EXTRAS` | `1` | 是否安装 `extras.txt` 里的插件组 |
| `TZ` | `Asia/Shanghai` | 时区 |

数据都在 `./data`：备份 `tar czf dsh-data.tgz -C . data`；凭据在 `data/dsh/.credentials.yaml`（注意权限）。

## 架构

```
浏览器 ──> :8899 gateway.mjs
            ├─ 无 dsh-auth-* cookie → 302 /?token=<launch-token>（DSH 自己铸 cookie）
            ├─ 有 cookie → 保留 Host 反代到 127.0.0.1:3080
            └─ /api/remote.mux WebSocket 用 net 直通
                      ▼
            dsh --profile web --host 127.0.0.1 --port 3080
                --trusted-host dsh.internal 127.0.0.1   # 网关把上游 Host 改写为 dsh.internal
                      ▼
            /data/dsh（DSH_HOME） + /data/workspace（工作区）= ./data 卷
```

三条硬约束（改配置时容易踩）：

1. 后端只能监听**具体 IP**，DSH 在加载期拒绝通配地址；
2. `--trusted-host` 与浏览器 authority 必须对得上——现在由网关统一改写上游 Host 为 `dsh.internal` 解决，不再依赖手工配置；
3. launch token 是**进程级**凭证，只能在服务端换 cookie，不能暴露给浏览器。

## 排错

| 现象 | 处理 |
|---|---|
| 页面 302 循环 | 日志里没有 `dsh web: http://...?token=`，说明 dsh 没起来；看 entrypoint 输出 |
| 每个 API 都 403 | 旧镜像（网关不改写 Host）→ 升级镜像；或显式把 `PUBLIC_HOST` 设成你访问用的 `host:port` |
| bash 工具报 `SANDBOX_UNAVAILABLE` | 少了 `cap_add: SYS_ADMIN` 或 `apparmor=unconfined`；或宿主 `kernel.apparmor_restrict_unprivileged_userns=1` |
| 插件没生效 | `docker logs dsh-web | grep plugins`；`enabled.txt` 是否列了该目录 |
| 补丁冲突导致构建失败 | 插件升级了，按提示重新生成 `patches/0002-*.patch` |
| 模型 401 | 在设置里重填 API Key，或把 `~/.dsh/.credentials.yaml` 放进 `data/dsh/` |

## 安全与边界

- 镜像里 `cap_add: SYS_ADMIN` 是给 bubblewrap 沙箱用的；不需要命令行沙箱可以删掉并把 sandbox 策略设为 `read-only`。
- 默认单实例单用户：一个容器一个 launch token 一个 owner。多人用请一容器一用户。
- 默认 HTTP 明文，只适合内网；上公网请在前面加 TLS 反代（保留 Host、透传 upgrade）。

## 多架构（linux/amd64 + linux/arm64）

镜像里没有架构相关的原生包（这类预编译运行包按平台分发、体积大，属于独立仓库的范畴，见 plugins/README「不在本仓库范围」），
所以两个架构都能直接构建：

| 场景 | 命令 |
|---|---|
| 本地 arm64 镜像 | `make build-arm64`（qemu，tag 带 `-arm64`） |
| 本地 amd64 镜像 | `make build` |
| 多架构 manifest 推送 GHCR | `make ghcr`（`buildx --platform linux/amd64,linux/arm64 --push`） |

CI（`.github/workflows/build.yml`）用 `docker/setup-qemu-action` + `docker/setup-buildx-action`，
一次多架构 build 产出 manifest，然后分别冒烟：

- amd64：`docker run --platform linux/amd64 … dsh --version`，附带插件隔离检查（默认镜像 `/opt/plugins` 必须为空）；
- arm64：`docker run --platform linux/arm64 … sh -lc "uname -m; dsh --version"`（QEMU 下真实执行）；
- 收尾用 `docker buildx imagetools inspect` 打印 manifest 列表。

拉取指定架构：`docker pull --platform linux/arm64 ghcr.io/goovoz/dsh:<ver>`。
本机要跑 arm64 容器需先注册 binfmt：`docker run --privileged --rm tonistiigi/binfmt --install arm64`。

注意：`plugins/` 里的纯 JS 插件两个架构通用；若将来接入带原生二进制的插件，必须按平台提供运行包，
否则 arm64 镜像起不来——那类插件应放进独立仓库。

## 许可

MIT（见 `LICENSE`）。DSH 本体、第三方插件各自遵循其原始许可；`plugins/` 下的插件保留原作者版权。
