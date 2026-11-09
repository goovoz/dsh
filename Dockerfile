# syntax=docker/dockerfile:1.7
# DSH Web —— 浏览器访问的 DeepSeekRuntime（容器化部署）
# 上游版本由 --build-arg DSH_VERSION 决定；第三方插件默认不集成（WITH_PLUGINS=0）。
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}

ARG DSH_VERSION=0.2.2-rc.1
ARG WITH_EXTRAS=1
ARG WITH_PLUGINS=0

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git tini procps bubblewrap ripgrep less patch \
      tzdata locales sudo python3 \
 && rm -rf /var/lib/apt/lists/*

# 上游 runtime：一条 npm 版本决定一切
RUN npm i -g pnpm@10 "@deepseek-ai/dsh@${DSH_VERSION}" \
 && dsh --version

ENV DSH_HOME=/data/dsh \
    DSH_WORKSPACE=/data/workspace \
    DSH_WEB_PORT=3080 \
    DSH_GATEWAY_PORT=8899 \
    DSH_PROFILE_NAME=web \
    DSH_EXTRAS=${WITH_EXTRAS} \
    DSH_PLUGINS=${WITH_PLUGINS} \
    TZ=Asia/Shanghai \
    LANG=C.UTF-8

# GUI 的「主目录」= 卷里的 workspace（root 的 home 指过去）
RUN mkdir -p /opt/dsh /data/dsh /data/workspace /run/dsh /opt/plugins \
 && sed -i 's|^root:x:0:0:root:/root:|root:x:0:0:root:/data/workspace:|' /etc/passwd

COPY scripts/ /opt/dsh/scripts/
COPY capture.mjs gateway.mjs entrypoint.sh /opt/dsh/
RUN chmod +x /opt/dsh/entrypoint.sh /opt/dsh/scripts/*.sh

# 第三方插件：默认**不集成**。WITH_PLUGINS=1 时才把 plugins/ 拷进镜像并在构建期打补丁。
RUN --mount=type=bind,source=plugins,target=/tmp/plugins \
    --mount=type=bind,source=patches,target=/tmp/patches \
    if [ "$WITH_PLUGINS" = "1" ]; then \
      cp -a /tmp/plugins/. /opt/plugins/ && \
      /opt/dsh/scripts/apply-plugin-patches.sh /opt/plugins /tmp/patches; \
    else \
      echo "[build] 第三方插件未集成（WITH_PLUGINS=0）"; \
    fi

EXPOSE 8899
ENTRYPOINT ["/usr/bin/tini","--","/opt/dsh/entrypoint.sh"]
