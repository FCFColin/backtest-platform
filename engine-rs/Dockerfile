# =============================================================================
# Rust 回测引擎 - 多阶段构建
# =============================================================================
# Stage 1: builder
# 使用 rust:1.80-slim 编译 release 二进制
# =============================================================================
# Supply Chain: 基础镜像digest pin，防止供应链攻击
# 企业为何需要：tag是可变的（rust:1.80-slim可指向不同镜像），digest是不可变的
# 权衡：需定期更新digest（可通过Renovate自动化），但防止tag碰撞攻击
FROM rust:1.80-slim@sha256:907ff4b3ee7df57149ffee04f606e0a08b9b2ed3507f00a19cf3c9c0f74b7681 AS builder

WORKDIR /build

# 安装编译所需的系统依赖（actix-web / openssl 等）
RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖清单，利用 Docker 层缓存编译依赖
COPY Cargo.toml Cargo.lock ./
# 创建占位源文件以缓存依赖编译（项目含 lib.rs，需一并占位）
RUN mkdir src \
    && echo 'fn main() {}' > src/main.rs \
    && echo '' > src/lib.rs \
    && cargo build --release \
    && rm -rf src

# 复制真实源码并编译
COPY src ./src
RUN touch src/main.rs src/lib.rs && cargo build --release

# =============================================================================
# Stage 2: runner
# 使用 debian:bookworm-slim 运行编译后的二进制
# =============================================================================
# Supply Chain: 基础镜像digest pin，防止供应链攻击
# 企业为何需要：tag是可变的（debian:bookworm-slim可指向不同镜像），digest是不可变的
# 权衡：需定期更新digest（可通过Renovate自动化），但防止tag碰撞攻击
FROM debian:bookworm-slim@sha256:96e378d7e6531ac9a15ad505478fcc2e69f371b10f5cdf87857c4b8188404716 AS runner

# 安装运行时依赖（libssl 用于 actix-web / TLS）
RUN apt-get update \
    && apt-get install -y --no-install-recommends libssl3 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制编译产物
COPY --from=builder /build/target/release/engine-rs /app/engine-rs

# 运行环境配置：绑定到 0.0.0.0 以便容器外部访问
ENV ENGINE_ADDR=0.0.0.0:5002 \
    RUST_LOG=info

# 暴露引擎端口
EXPOSE 5002

# 健康检查：每 30s 探测 /api/engine/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5002/api/engine/health || exit 1

# 企业理由：容器以 root 运行是 CIS Docker Benchmark 第一条禁止项。
# 创建专用非 root 用户（UID 1000），与 K8s securityContext.runAsUser 匹配。
RUN groupadd -g 1000 appuser && useradd -u 1000 -g appuser -r appuser
USER appuser
CMD ["/app/engine-rs"]
