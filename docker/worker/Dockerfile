# =============================================================================
# 回测平台 - Worker 进程多阶段构建（P0-1）
# =============================================================================
# 与 API Dockerfile 结构一致，仅入口点不同：
#   API  → dist/server.js（Express HTTP + WebSocket）
#   Worker → dist/workerEntrypoint.js（BullMQ backtest + webhook worker）
#
# Worker 无 HTTP 端口，健康检查通过 Redis heartbeat（exec 探针）。
# =============================================================================
# Stage 1: builder - 安装依赖并打包 Worker
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /app

RUN npm install -g pnpm@11.5.3

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/

RUN npx esbuild packages/backend/src/queues/workerEntrypoint.ts --bundle --platform=node --format=esm --outdir=dist

# Stage 2: runner - 生产运行
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner

WORKDIR /app

ENV NODE_ENV=production \
    GO_ENGINE_URL=http://engine-go:5004 \
    GO_DATA_SERVICE_URL=http://data-fetcher:5003

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist/workerEntrypoint.js ./dist/workerEntrypoint.js

# 健康检查：读取 Redis heartbeat key（Worker 无 HTTP 端口）
# 超过 45s 未更新 heartbeat 则判定不健康（与 docker-compose 探针一致）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const r=new(require('ioredis')('redis://redis:6379'));r.get('worker:heartbeat').then(v=>{r.quit();process.exit(v?0:1)}).catch(()=>process.exit(1))"

USER node
CMD ["node", "dist/workerEntrypoint.js"]
