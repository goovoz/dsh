# DSH Web 容器化部署
-include .env            # 支持在 .env 里写 PUBLIC_HOST / DSH_PORT 等

DSH_VERSION ?= $(shell node -e "console.log(require('./package.json').dshVersion)" 2>/dev/null || echo latest)
PORT ?= 8899
PLUGINS ?= all               # all | none | 插件名[,插件名]（默认全部）
EXTRAS ?= 1                  # 0 = 不装 extras.txt 里的桌面等价插件组
IMAGE ?= dsh-web
GHCR ?= ghcr.io/goovoz/dsh
# 插件规格归一化：all/1 -> 全部，none/0 -> 空，a,b -> 指定
PLUGIN_SPEC := $(shell bash scripts/resolve-plugins.sh spec "$(PLUGINS)")
PLUGIN_SUFFIX := $(shell bash scripts/resolve-plugins.sh suffix "$(PLUGINS)")
SUFFIX := $(PLUGIN_SUFFIX)
ALIAS := $(if $(filter -plugins%,$(SUFFIX)),latest-plugins,latest)
CONTAINER_NAME ?= dsh-web
ALLOW_LOOPBACK ?= 0
PUBLIC_HOST ?=
URL ?=
NAME ?=

# 传给 compose 的完整环境（compose 只认 environment 里声明过的变量）
COMPOSE_ENV = PUBLIC_HOST=$(PUBLIC_HOST) DSH_PORT=$(PORT) DSH_ALLOW_LOOPBACK=$(ALLOW_LOOPBACK) DSH_EXTRAS=$(EXTRAS)

.PHONY: help plugin-spec build build-arm64 build-compose up up-build up-pull down logs shell latest bump ghcr plugin-add plugin-update plugin-remove plugin-list require-public-host

help:
	@echo "make build                      # 构建镜像 $(IMAGE):$(DSH_VERSION)$(SUFFIX)（插件: $(if $(PLUGIN_SPEC),$(PLUGIN_SPEC),无)）"
	@echo "make build PLUGINS=all          # 全部插件（默认）"
	@echo "make build PLUGINS=none         # 不带插件"
	@echo "make build PLUGINS=qinglong-cli # 只带指定插件（逗号分隔可多选）"
	@echo "make plugin-spec PLUGINS=...    # 只看插件规格解析结果"
	@echo "make plugin-list                # 列出插件库与启用状态"
	@echo "make build-arm64                # 本地构建 arm64 镜像（qemu）"
	@echo "make build-compose              # 用 compose 叠加文件构建（tag: dsh-web:local）"
	@echo "make up                         # 用本地镜像启动（PUBLIC_HOST 必填，可写进 .env）"
	@echo "make up-build                   # 先构建再启动"
	@echo "make up-pull                    # 直接拉发布镜像并启动（不本地构建）"
	@echo "make down / logs / shell        # 停止 / 日志 / 进容器"
	@echo "make ghcr                       # 多架构构建并推送 $(GHCR)"
	@echo "make plugin-add URL=<git-url>   # 把第三方插件加为 submodule 并启用"
	@echo "make plugin-update NAME=<dir>   # 拉取作者最新版（submodule）"
	@echo "make plugin-remove NAME=<dir>   # 摘除插件并清 enabled.txt"
	@echo "make plugin-list                # 列出插件库与启用状态"
	@echo "make latest / bump              # 查看 / 更新上游 dsh 版本"

plugin-spec:
	@echo "PLUGINS     = $(PLUGINS)"
	@echo "PLUGIN_SPEC = $(PLUGIN_SPEC)"
	@echo "SUFFIX      = $(SUFFIX)"
	@echo "ALIAS       = $(ALIAS)"
	@bash scripts/resolve-plugins.sh check "$(PLUGINS)" && echo "插件名校验通过"

build:
	docker build \
	  --build-arg DSH_VERSION=$(DSH_VERSION) \
	  --build-arg WITH_PLUGINS="$(PLUGIN_SPEC)" \
	  --build-arg WITH_EXTRAS=$(EXTRAS) \
	  -t $(IMAGE):$(DSH_VERSION)$(SUFFIX) .

build-arm64:
	docker buildx build --platform linux/arm64 --load \
	  --build-arg DSH_VERSION=$(DSH_VERSION) \
	  --build-arg WITH_PLUGINS="$(PLUGIN_SPEC)" \
	  --build-arg WITH_EXTRAS=$(EXTRAS) \
	  -t $(IMAGE):$(DSH_VERSION)$(SUFFIX)-arm64 .

require-public-host:
	@if [ -z "$(PUBLIC_HOST)" ]; then \
	  echo "PUBLIC_HOST 未设置（必填）：必须等于浏览器实际访问的 host[:port]" >&2; \
	  echo "  例：PUBLIC_HOST=192.168.1.10:8899 make up，或写进 .env" >&2; \
	  echo "  本机自测：PUBLIC_HOST=127.0.0.1:8899 ALLOW_LOOPBACK=1 make up" >&2; \
	  exit 2; \
	fi

# IMAGE_TAG / CONTAINER_NAME 必须与构建产物一致，否则 compose 会去找不存在的镜像
up: require-public-host
	$(COMPOSE_ENV) DSH_VERSION=$(DSH_VERSION) WITH_PLUGINS="$(PLUGIN_SPEC)" WITH_EXTRAS=$(EXTRAS) \
	IMAGE_TAG=$(IMAGE):$(DSH_VERSION)$(SUFFIX) CONTAINER_NAME=$(CONTAINER_NAME) \
	docker compose up -d

up-build: build require-public-host
	$(COMPOSE_ENV) DSH_VERSION=$(DSH_VERSION) WITH_PLUGINS="$(PLUGIN_SPEC)" WITH_EXTRAS=$(EXTRAS) \
	IMAGE_TAG=$(IMAGE):$(DSH_VERSION)$(SUFFIX) CONTAINER_NAME=$(CONTAINER_NAME) \
	docker compose up -d

up-pull: require-public-host
	$(COMPOSE_ENV) CONTAINER_NAME=$(CONTAINER_NAME) docker compose pull && \
	$(COMPOSE_ENV) CONTAINER_NAME=$(CONTAINER_NAME) docker compose up -d

build-compose:
	DSH_VERSION=$(DSH_VERSION) WITH_EXTRAS=$(EXTRAS) WITH_PLUGINS="$(PLUGIN_SPEC)" \
	IMAGE_TAG=$(IMAGE):local docker compose -f compose.yaml -f compose.build.yaml build

down:
	CONTAINER_NAME=$(CONTAINER_NAME) docker compose down

logs:
	CONTAINER_NAME=$(CONTAINER_NAME) docker compose logs -f dsh-web

shell:
	docker exec -it $(CONTAINER_NAME) bash

latest:
	@npm view @deepseek-ai/dsh version

bump:
	@v=$$(npm view @deepseek-ai/dsh version); \
	old=$$(node -e "console.log(require('./package.json').dshVersion)"); \
	if [ "$$v" = "$$old" ]; then echo "已是最新 $$v"; exit 0; fi; \
	node -e "const f='package.json';const p=require('./'+f);p.dshVersion='$$v';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"; \
	echo "dshVersion: $$old -> $$v"

ghcr:
	docker buildx build \
	  --platform linux/amd64,linux/arm64 \
	  --build-arg DSH_VERSION=$(DSH_VERSION) \
	  --build-arg WITH_PLUGINS="$(PLUGIN_SPEC)" \
	  --build-arg WITH_EXTRAS=$(EXTRAS) \
	  -t $(GHCR):$(DSH_VERSION)$(SUFFIX) \
	  -t $(GHCR):$(ALIAS) \
	  --push .

plugin-add:
	@URL=$(URL) NAME=$(NAME) bash scripts/plugin-add.sh

plugin-update:
	@NAME=$(NAME) bash scripts/plugin-update.sh

plugin-remove:
	@NAME=$(NAME) bash scripts/plugin-remove.sh

plugin-list:
	@echo "启用的插件（plugins/enabled.txt）："; grep -vE '^[[:space:]]*(#|$$)' plugins/enabled.txt 2>/dev/null || true
	@echo; echo "插件库目录："; ls -1d plugins/*/ 2>/dev/null | grep -v '_template' || true
	@echo; echo "submodule 状态："; git submodule status 2>/dev/null || true
