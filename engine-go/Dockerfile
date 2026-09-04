# engine-go 多阶段构建
FROM golang:1.27-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS builder

WORKDIR /build

# 复制依赖清单并下载依赖（利用 Docker 层缓存）
COPY engine-go/go.mod engine-go/go.sum ./engine-go/

# 复制 go-shared 依赖（replace ../packages/go-shared 需要在构建上下文中可用）
COPY packages/go-shared ./packages/go-shared

RUN cd engine-go && go mod download

# 复制源码
COPY engine-go ./engine-go

# 编译静态二进制
RUN cd engine-go && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /engine-go-bin ./cmd/server

# Stage 2: runner (digest pin 防止供应链攻击)
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc AS runner

RUN apk add --no-cache ca-certificates wget tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

COPY --from=builder /engine-go-bin /app/engine-go

ENV ENGINE_GO_PORT=5004 \
    GIN_MODE=release

EXPOSE 5004

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:5004/api/engine/health || exit 1

RUN adduser -D -u 1000 appuser
USER appuser
CMD ["/app/engine-go"]
