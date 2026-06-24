# =============================================================================
# 回测平台 - 前端 + Node API 多阶段构建
# =============================================================================
# Stage 1: builder
# 安装依赖并构建前端产物（dist/）
# =============================================================================
# Supply Chain: 基础镜像digest pin，防止供应链攻击
# 企业为何需要：tag是可变的（node:20-alpine可指向不同镜像），digest是不可变的
# 权衡：需定期更新digest（可通过Renovate自动化），但防止tag碰撞攻击
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /app

# 仅复制依赖清单，最大化利用 Docker 层缓存
COPY package.json package-lock.json ./

# 安装全部依赖（含 devDependencies，构建前端需要）
RUN npm ci

# 复制源代码（受 .dockerignore 控制）
COPY . .

# 构建前端产物到 dist/
RUN npm run build

# 企业理由：生产容器中使用 tsx 运行 TypeScript 增加启动开销和内存占用。
# esbuild 打包为单文件 JS，启动快、体积小、无运行时编译开销。
# 权衡：打包后失去源码映射能力，但生产环境不需要。
# better-sqlite3 是 native 模块，必须 --external 标记以避免打包失败；
# canvas 也是可选 native 依赖，同样需要排除。
RUN npx esbuild api/server.ts --bundle --platform=node --format=esm --outdir=dist --external:better-sqlite3 --external:canvas

# =============================================================================
# Stage 2: runner
# 复制构建产物与 API 源码，运行 Node API
# =============================================================================
# Supply Chain: 基础镜像digest pin，防止供应链攻击
# 企业为何需要：tag是可变的（node:20-alpine可指向不同镜像），digest是不可变的
# 权衡：需定期更新digest（可通过Renovate自动化），但防止tag碰撞攻击
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner

WORKDIR /app

# 运行环境与端口默认值（可被 docker-compose / -e 覆盖）
ENV NODE_ENV=production \
    API_PORT=5001 \
    RUST_ENGINE_URL=http://rust-engine:5002 \
    GO_DATA_SERVICE_URL=http://go-data:5003

# 复制依赖清单与已安装的 node_modules（tsx 在 devDependencies，运行时需要）
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

# 复制前端构建产物
COPY --from=builder /app/dist ./dist

# 复制 esbuild 打包后的 API 服务端代码
COPY --from=builder /app/dist/server.js ./dist/server.js

# 复制 API 与共享类型源码（better-sqlite3 等 native 模块需要 node_modules）
COPY api ./api
COPY shared ./shared

# 暴露 API 端口
EXPOSE 5001

# 健康检查：每 30s 探测 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5001/api/health || exit 1

# 企业理由：容器以 root 运行是 CIS Docker Benchmark 第一条禁止项。
# 若应用被攻破可获得容器内完整权限。使用 node 内置用户（alpine 镜像自带）。
# 权衡：需确保数据目录权限允许非 root 用户读取。
USER node
CMD ["node", "dist/server.js"]
