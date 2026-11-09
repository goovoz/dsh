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
PUBLIC_HOST=192.168.1.10:8899 make up
```

浏览器打开 `http://<PUBLIC_HOST>/` 即可，无需点带 token 的链接。

> `PUBLIC_HOST` 必须等于浏览器实际访问的 `host[:port]`：DSH 的 `/api` 信任围栏按 `Host` 比对，
> 会话 cookie 也按 authority 签名；换端口/换域名要一起改。

## 随上游更新

```bash
make latest     # 查 npm 上 @deepseek-ai/dsh 的最新版本
make bump       # 写回 package.json#dshVersion
make build && make up
```

链路上有三处会跟着动：

1. **DSH 本体**：`Dockerfile` 里 `npm i -g @deepseek-ai/dsh@@${DSH_VERSION}`；
2. **桌面等价插件组**（`extras.txt`）：启动时先试 `npm view <pkg>@<已装 dsh 版本>`，命中就装同版本，
   没这个版本才回退 `latest`，避免版本错位；
3. **第三方插件**（`plugins/`）：若是 submodule，`git submodule update --remote` 即可；
   若是 vendored 目录，更新插件后重跑 `docker build`。

CI 已在 `.github/workflows/build.yml`：每次 push、每周一 03:00 UTC、以及手动触发时会构建镜像并
推到 `ghcr.io/<owner>/dsh:<dshVersion>` 与 `:latest`；日志里会打印 pinned 与 upstream 版本，便于发现落后。

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
| `PUBLIC_HOST` | `127.0.0.1:8899` | 浏览器实际访问的 authority，必须与访问地址一致 |
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
                --public-url http://<PUBLIC_HOST>/ --trusted-host <PUBLIC_HOST> <host>
                      ▼
            /data/dsh（DSH_HOME） + /data/workspace（工作区）= ./data 卷
```

三条硬约束（改配置时容易踩）：

1. 后端只能监听**具体 IP**，DSH 在加载期拒绝通配地址；
2. `--trusted-host` 必须覆盖浏览器看到的 authority（含端口），否则每个 `/api` 调用 403；
3. launch token 是**进程级**凭证，只能在服务端换 cookie，不能暴露给浏览器。

## 排错

| 现象 | 处理 |
|---|---|
| 页面 302 循环 | 日志里没有 `dsh web: http://...?token=`，说明 dsh 没起来；看 entrypoint 输出 |
| 每个 API 都 403 | `PUBLIC_HOST` 与实际访问地址不一致 |
| bash 工具报 `SANDBOX_UNAVAILABLE` | 少了 `cap_add: SYS_ADMIN` 或 `apparmor=unconfined`；或宿主 `kernel.apparmor_restrict_unprivileged_userns=1` |
| 插件没生效 | `docker logs dsh-web | grep plugins`；`enabled.txt` 是否列了该目录 |
| 补丁冲突导致构建失败 | 插件升级了，按提示重新生成 `patches/0002-*.patch` |
| 模型 401 | 在设置里重填 API Key，或把 `~/.dsh/.credentials.yaml` 放进 `data/dsh/` |

## 安全与边界

- 镜像里 `cap_add: SYS_ADMIN` 是给 bubblewrap 沙箱用的；不需要命令行沙箱可以删掉并把 sandbox 策略设为 `read-only`。
- 默认单实例单用户：一个容器一个 launch token 一个 owner。多人用请一容器一用户。
- 默认 HTTP 明文，只适合内网；上公网请在前面加 TLS 反代（保留 Host、透传 upgrade）。

## 多架构

镜像里没有架构相关的原生包（Ghidra/JDK/JPype 那类不在本仓库范围），所以：

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <repo>:latest .
```

本机跑 arm64 需要 `docker run --privileged --rm tonistiigi/binfmt --install arm64`。

## 镜像与发布

| 产物 | 触发 | 说明 |
|---|---|---|
| ghcr.io/goovoz/dsh:<dshVersion> / :latest | push、每周一、手动 | 不含第三方插件 |
| ghcr.io/goovoz/dsh:<dshVersion>-plugins / :latest-plugins | 手动 with_plugins=true | 含 plugins/ |
| GitHub Release dsh-<ver>[-plugins] | 手动 / tag dsh-* | 说明里给 pull 命令；重复触发不重复建 |

本地等价：make ghcr 或 make ghcr PLUGINS=1。

## 许可

MIT（见 `LICENSE`）。DSH 本体、第三方插件各自遵循其原始许可；`plugins/` 下的插件保留原作者版权。
