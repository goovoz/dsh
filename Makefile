DSH_VERSION ?= $(shell node -e "console.log(require('./package.json').dshVersion)" 2>/dev/null || echo latest)
PORT ?= 8899
PLUGINS ?= 0                 # 1 = 集成 plugins/ 下的第三方插件
IMAGE ?= dsh-web
GHCR ?= ghcr.io/goovoz/dsh
SUFFIX := $(if $(filter 1,$(PLUGINS)),-plugins,)
URL ?=
NAME ?=

.PHONY: help build up down logs shell latest bump ghcr plugin-add plugin-list

help:
	@echo "make build                      # 构建镜像（DSH_VERSION=$(DSH_VERSION)，插件: $(if $(filter 1,$(PLUGINS)),集成,不集成)）"
	@echo "make build PLUGINS=1            # 构建含第三方插件的镜像"
	@echo "make up                         # 启动（需要 PUBLIC_HOST=host:port）"
	@echo "make plugin-add URL=<git-url>   # 把第三方插件加为 submodule 并启用"
	@echo "make plugin-list                # 列出插件库与启用状态"
	@echo "make ghcr PLUGINS=1             # 打标并推送到 $(GHCR)"
	@echo "make latest / bump              # 查看 / 更新上游 dsh 版本"

build:
	docker build \
	  --build-arg DSH_VERSION=$(DSH_VERSION) \
	  --build-arg WITH_PLUGINS=$(PLUGINS) \
	  -t $(IMAGE):$(DSH_VERSION)$(SUFFIX) .

up:
	DSH_VERSION=$(DSH_VERSION) WITH_PLUGINS=$(PLUGINS) DSH_PORT=$(PORT) docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f dsh-web

shell:
	docker exec -it dsh-web bash

latest:
	@npm view @deepseek-ai/dsh version

bump:
	@v=$$(npm view @deepseek-ai/dsh version); \
	node -e "const f='package.json';const p=require('./'+f);p.dshVersion='$$v';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"; \
	echo "dshVersion -> $$v"

plugin-add:
	@URL=$(URL) NAME=$(NAME) bash scripts/plugin-add.sh

plugin-list:
	@echo "启用的插件（plugins/enabled.txt）："; grep -vE '^[[:space:]]*(#|$$)' plugins/enabled.txt 2>/dev/null || true
	@echo; echo "插件库目录："; ls -1d plugins/*/ 2>/dev/null | grep -v '_template' || true
	@echo; echo "submodule 状态："; git submodule status 2>/dev/null || true

ghcr: build
	docker tag $(IMAGE):$(DSH_VERSION)$(SUFFIX) $(GHCR):$(DSH_VERSION)$(SUFFIX)
	docker tag $(IMAGE):$(DSH_VERSION)$(SUFFIX) $(GHCR):$(if $(filter 1,$(PLUGINS)),latest-plugins,latest)
	docker push $(GHCR):$(DSH_VERSION)$(SUFFIX)
	docker push $(GHCR):$(if $(filter 1,$(PLUGINS)),latest-plugins,latest)
