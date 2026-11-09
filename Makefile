# DSH Web 容器化部署
DSH_VERSION ?= $(shell node -e "console.log(require('./package.json').dshVersion)" 2>/dev/null || echo latest)
PORT ?= 8899
PLUGINS ?= 0                 # 1 = 集成 plugins/ 下的第三方插件
EXTRAS ?= 1                  # 0 = 不装 extras.txt 里的桌面等价插件组
IMAGE ?= dsh-web
GHCR ?= ghcr.io/goovoz/dsh
SUFFIX := $(if $(filter 1,$(PLUGINS)),-plugins,)
ALIAS := $(if $(filter 1,$(PLUGINS)),latest-plugins,latest)
CONTAINER_NAME ?= dsh-web
URL ?=
NAME ?=

.PHONY: help build build-arm64 build-compose up up-build up-pull down logs shell latest bump ghcr plugin-add plugin-update plugin-remove plugin-list

help:
	@echo "make build                      # 本地构建 amd64 镜像（$(IMAGE):$(DSH_VERSION)$(SUFFIX)，插件: $(if $(filter 1,$(PLUGINS)),集成,不集成)）"
	@echo "make build PLUGINS=1            # 构建含第三方插件的镜像"
	@echo "make build-arm64                # 本地构建 arm64 镜像（qemu）"
	@echo "make build-compose              # 用 compose 叠加文件构建（tag: dsh-web:local）"
	@echo "make up                         # 用本地镜像启动（需要 PUBLIC_HOST=host:port）"
	@echo "make up-build                   # 先构建再启动"
	@echo "make up-pull                    # 直接拉发布镜像并启动（不本地构建）"
	@echo "make down / logs / shell        # 停止 / 日志 / 进容器"
	@echo "make ghcr                       # 多架构构建并推送 $(GHCR)"
	@echo "make plugin-add URL=<git-url>   # 把第三方插件加为 submodule 并启用"
	@echo "make plugin-update NAME=<dir>   # 拉取作者最新版（submodule）"
	@echo "make plugin-remove NAME=<dir>   # 摘除插件并清 enabled.txt"
	@echo "make plugin-list                # 列出插件库与启用状态"
	@echo "make latest / bump              # 查看 / 更新上游 dsh 版本"

build:
	docker build \
	  --build-arg DSH_VERSION=$(DSH_VERSION) \
	  --build-arg WITH_PLUGINS=$(PLUGINS) \
	  --build-arg WITH_EXTRAS=$(EXTRAS) \
	  -t $(IMAGE):$(DSH_VERSION)$(SUFFIX) .

build-arm64:
	docker buildx build --platform linux/arm64 --load \
	  --build-arg DSH_VERSION=$(DSH_VERSION) \
	  --build-arg WITH_PLUGINS=$(PLUGINS) \
	  --build-arg WITH_EXTRAS=$(EXTRAS) \
	  -t $(IMAGE):$(DSH_VERSION)$(SUFFIX)-arm64 .

# 关键：IMAGE_TAG 必须和 build 产出的 tag 完全一致（含 -plugins 后缀），否则 compose 会去找不存在的镜像
up:
	DSH_VERSION=$(DSH_VERSION) WITH_PLUGINS=$(PLUGINS) WITH_EXTRAS=$(EXTRAS) \
	IMAGE_TAG=$(IMAGE):$(DSH_VERSION)$(SUFFIX) CONTAINER_NAME=$(CONTAINER_NAME) \
	DSH_PORT=$(PORT) docker compose up -d

build-compose:
	docker compose -f compose.yaml -f compose.build.yaml build

up-build: build
	DSH_VERSION=$(DSH_VERSION) WITH_PLUGINS=$(PLUGINS) WITH_EXTRAS=$(EXTRAS) \
	IMAGE_TAG=$(IMAGE):$(DSH_VERSION)$(SUFFIX) CONTAINER_NAME=$(CONTAINER_NAME) \
	DSH_PORT=$(PORT) docker compose up -d

up-pull:
	CONTAINER_NAME=$(CONTAINER_NAME) DSH_PORT=$(PORT) docker compose pull && \
	CONTAINER_NAME=$(CONTAINER_NAME) DSH_PORT=$(PORT) docker compose up -d

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
	node -e "const f='package.json';const p=require('./'+f);p.dshVersion='$$v';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"; \
	echo "dshVersion -> $$v"

ghcr:
	docker buildx build \
	  --platform linux/amd64,linux/arm64 \
	  --build-arg DSH_VERSION=$(DSH_VERSION) \
	  --build-arg WITH_PLUGINS=$(PLUGINS) \
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
