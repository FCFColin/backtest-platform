# =============================================================================
# Go 引擎服务 - 多阶段构建（T-ARCH-2.5）
# =============================================================================
# Stage 1: builder
# 使用 golang:1.23-alpine 编译静态二进制
# =============================================================================
# Supply Chain: 基础镜像digest pin，防止供应链攻击
# 企业为何需要：tag是可变的（golang:1.23-alpine可指向不同镜像），digest是不可变的
# 权衡：需定期更新digest（可通过Renovate自动化），但防止tag碰撞攻击
FROM golang:1.23-alpine@sha256:383395b794dffa5b53012a212365d40c8e37109a626ca30d6151c8348d380b5f AS builder

WORKDIR /build

# 复制依赖清单并下载依赖（利用 Docker 层缓存）
COPY go.mod go.sum ./
RUN go mod download

# 复制源码
COPY . .

# 编译静态二进制
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /engine-go ./cmd/server

# =============================================================================
# Stage 2: runner
# =============================================================================
# Supply Chain: 基础镜像digest pin，防止供应链攻击
# 企业为何需要：tag是可变的（alpine:3.20可指向不同镜像），digest是不可变的
# 权衡：需定期更新digest（可通过Renovate自动化），但防止tag碰撞攻击
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc AS runner

RUN apk add --no-cache ca-certificates wget tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

COPY --from=builder /engine-go /app/engine-go

ENV ENGINE_GO_PORT=5004 \
    GIN_MODE=release

EXPOSE 5004

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:5004/api/engine/health || exit 1

RUN adduser -D -u 1000 appuser
USER appuser
CMD ["/app/engine-go"]
