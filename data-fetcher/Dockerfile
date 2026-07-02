# =============================================================================
# Go 数据服务 - 多阶段构建
# =============================================================================
# Stage 1: builder
# 使用 golang:1.22-alpine 编译静态二进制
# =============================================================================
# Supply Chain: 基础镜像digest pin，防止供应链攻击
# 企业为何需要：tag是可变的（golang:1.22-alpine可指向不同镜像），digest是不可变的
# 权衡：需定期更新digest（可通过Renovate自动化），但防止tag碰撞攻击
FROM golang:1.22-alpine@sha256:1699c10032ca2582ec89a24a1312d986a3f094aed3d5c1147b19880afe40e052 AS builder

WORKDIR /build

# 复制依赖清单并下载依赖（利用 Docker 层缓存）
COPY go.mod go.sum ./
RUN go mod download

# 复制源码
COPY . .

# 编译静态二进制（CGO_DISABLED 确保纯静态链接，适配 alpine 运行时）
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /data-fetcher .

# =============================================================================
# Stage 2: runner
# 使用 alpine:3.20 运行编译后的二进制
# =============================================================================
# Supply Chain: 基础镜像digest pin，防止供应链攻击
# 企业为何需要：tag是可变的（alpine:3.20可指向不同镜像），digest是不可变的
# 权衡：需定期更新digest（可通过Renovate自动化），但防止tag碰撞攻击
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc AS runner

# 安装运行时依赖：ca-certificates（HTTPS）、wget（健康检查）、tzdata（时区）
RUN apk add --no-cache ca-certificates wget tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# 复制编译产物
COPY --from=builder /data-fetcher /app/data-fetcher

# 运行环境配置
ENV DATA_FETCHER_PORT=5003 \
    DATA_DIR=/app/data/market \
    GIN_MODE=release

# 暴露数据服务端口
EXPOSE 5003

# 健康检查：每 30s 探测 /api/data/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5003/api/data/health || exit 1

# 企业理由：容器以 root 运行是 CIS Docker Benchmark 第一条禁止项。
# 创建专用非 root 用户（UID 1000），与 K8s securityContext.runAsUser 匹配。
RUN adduser -D -u 1000 appuser
USER appuser
CMD ["/app/data-fetcher"]
