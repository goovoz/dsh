# dsh-qinglong-cli

把青龙面板（[qinglong](https://github.com/whyour/qinglong)）接成 DSH 原生工具。封装的是官方 npm 包 `@whyour/qinglong-cli`，覆盖面板全部 148 条 OpenAPI 路由。

## 为什么需要这层封装

官方 CLI 有两个直接拿来做集成会卡住的地方，插件把它们都消化掉了：

| 约束 | 官方行为 | 插件做法 |
|---|---|---|
| 传输 | 只接受 HTTPS 或**回环** HTTP，`http://192.168.x.x:5700` 直接报「远程认证需要 HTTPS；HTTP 仅允许回环地址」 | 在 `127.0.0.1:随机端口` 起双向转发（https 上游用 TLS 握手），注入 `QL_URL=http://127.0.0.1:<port><前缀>` |
| 反代子路径 | `QL_URL` 允许带路径前缀（如 `https://host/ql`），CLI 会把它拼在 `/open/*` 前面 | 转发时保留 `URL.pathname`，中转地址是 `http://127.0.0.1:<port>/ql` |
| 参数代际 | 新命令吃 `--query/--data/--timeout`，旧命令只吃 `--page/--size` 这类位置式选项 | 先跑 `ql <cmd> --help` 缓存选项集，再决定 `query` 转成 `--query <json>` 还是展开成 `--key value` |
| 凭据 | `ql login` 是交互式，且会把凭据写盘 | 插件自己用 Client ID/Secret 换 `/open/auth/token`，内存缓存、按 expiration 刷新，不落盘 |

## 工具

| 工具 | 作用 |
|---|---|
| `qlcli` | 执行任意子命令：`{args:["task","list"], query:{page:1,size:5}}` |
| `qlcli_help` | 看命令树或某个子命令的选项 |
| `qlcli_routes` | 拉全量路由表（约 148 条），确认操作对应哪个命令 |
| `qlcli_status` | `ql auth status`，连通性与权限自检 |

## 侧边栏面板

插件带客户端半体（`client.js`），在 DSH 侧边栏注册「**青龙**」入口。点开是设置页：

- 三个字段：`面板地址`、`Client ID`、`Client Secret`，**回填并显示真实值**（不脱敏，便于核对）
- 「保存并生效」：写入配置文件 → 立刻重建 token/中转 → 顺带跑一次连通性探测，结果直接显示
- 「测试连接」「重新读取」
- 显示配置文件路径；若某项由环境变量提供，会标注「已被环境变量固定」

背后是服务端注册的两条路由：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/qinglong/config` | 返回 `settings`（真实值）、`locked`（哪些被 env 固定）、`settingsFile`、`ready` |
| POST | `/qinglong/config` | 保存 `{qlUrl, clientId, clientSecret}` → 落盘 0600 → 立即生效 → 返回 `saved` + `probe` |
| POST | `/qinglong/test` | 只测试连接，不改配置 |

保存后不需要重启 DSH：`resetRuntime()` 会丢掉缓存的 relay 与 token，下一次工具调用自动用新配置。

## 配置

配置文件（面板保存就写这里）：

- `$DSH_HOME/ql-cli.json`（容器里是 `/data/dsh/ql-cli.json`）
- `~/.dsh/qinglong-cli.json`（桌面）
- `QINGLONG_CLI_CONFIG` 指定的任意路径

环境变量优先级更高（面板会标注 locked）：

| 变量 | 说明 |
|---|---|
| `QL_URL` | 面板根地址，例如 `http://172.20.0.9:5700`；挂反代子路径时写 `https://example.com/ql`（不要带 `/open`，插件会自己拼） |
| `QL_CLIENT_ID` / `QL_CLIENT_SECRET` | 面板「系统设置 → 应用设置」创建的应用凭据 |
| `QL_CLI_PATH` | 可选，覆盖内置 `vendor/ql.js` |

应用需要勾选要用的 scope：`crons`、`scripts`、`logs`、`envs`、`configs`、`subscriptions`、`dependencies`、`dashboard`。

## 安装

### 容器（本仓库镜像）

```bash
echo dsh-qinglong-cli >> plugins/enabled.txt
make build PLUGINS=1
PUBLIC_HOST=<host:port> make up PLUGINS=1
```

容器启动时 `scripts/install-plugins.sh` 会 `dsh plugin add` 并把内核复制到 profile，凭据走 compose 环境变量传入。

### 桌面

```bash
dsh plugin --profile desktop add file:/path/to/plugins/dsh-qinglong-cli
```

然后写 `~/.dsh/qinglong-cli.json`，重启 DSH。

## 用法示例

```
qlcli { args:["task","list"], query:{page:1,size:20} }
qlcli { args:["task","run"], data:[22,23] }
qlcli { args:["task","log-files","22"] }
qlcli { args:["script","get"], query:{path:"checkin/sf", file:"sf_signin.py"} }
qlcli { args:["script","update"], data:{path:"checkin/sf",filename:"sf_signin.py",content:"..."} }
qlcli { args:["api","request","GET","/open/crons/22"] }
```

## 已知青龙服务端问题

`task detail`（`GET /open/crons/detail`）在青龙 2.24.0 上必 500：

```
{"code":500,"message":"WHERE parameter \"log_path\" has invalid \"undefined\" value"}
```

这是面板侧 bug，与 CLI 无关。改用 `GET /open/crons/:id`：

```
qlcli { args:["api","request","GET","/open/crons/26"] }
```

## 自检

```bash
npm test
```

三个用例，都不需要真实面板：

- `tools/selftest.mjs`：mock 面板绑在 `127.0.0.1`（回环直通路径），覆盖 token、任务列表、脚本列表、帮助、路由表。
- `tools/selftest-prefix.mjs`：mock 面板绑在 `127.0.0.2` 并挂在 `/ql` 子路径 —— `127.0.0.2` 不在回环白名单，强制走转发分支，断言中转地址保留前缀、上游收到 `/ql/open/*`、且没有裸 `/open` 请求。
- `tools/selftest-config.mjs`：假 ctx 拿插件注册的 HTTP 路由，验证 `GET/POST /qinglong/config` 返回真实值（不脱敏）、落盘 0600、保存后无需重启即可用、环境变量存在时 `locked` 标记正确。

## 目录

```
index.js             服务端：relay + token + 4 个工具 + /qinglong/config|test 路由
client.js            客户端：侧边栏「青龙」入口 + 设置页
vendor/ql.js         官方 @whyour/qinglong-cli 0.1.4 的 npm bundle（Apache-2.0）
cordis.patch.yml     插件自带 bundle patch
dsh-install.sh       容器内后置安装（复制内核 + 写 profile patch）
tools/selftest*.mjs  三个离线自检
```

`vendor/ql.js` 来源与校验值见 [PROVENANCE.md](vendor/PROVENANCE.md)。
