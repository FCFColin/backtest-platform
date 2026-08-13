# Worker 多阶段构建 (BullMQ backtest + webhook)
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

RUN npm install -g pnpm@11.5.3

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/

RUN pnpm --dir packages/backend build:worker

# Stage 2: runner
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner

WORKDIR /app

ENV NODE_ENV=production \
    GO_ENGINE_URL=http://engine-go:5004 \
    GO_DATA_SERVICE_URL=http://data-fetcher:5003

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
RUN npm install -g pnpm@11.5.3 && pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/backend/dist/workerEntrypoint.js ./packages/backend/dist/workerEntrypoint.js
COPY migrations/ /migrations/

# 健康检查：Redis heartbeat（Worker 无 HTTP 端口）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const r=new(require('ioredis')('redis://redis:6379'));r.get('worker:heartbeat').then(v=>{r.quit();process.exit(v?0:1)}).catch(()=>process.exit(1))"

USER node
CMD ["node", "packages/backend/dist/workerEntrypoint.js"]
