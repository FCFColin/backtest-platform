# Docker 开发环境配置(Windows)

## 前置条件

Windows 10/11 + WSL2 + Docker Desktop。验证: `docker info` + `docker run --rm hello-world`。

## 启动本地开发栈

    docker compose pull && docker compose up -d
    docker compose -f docker-compose.chaos.yml up -d   # chaos 测试最小集
    docker compose ps / down

## 运行 Docker 依赖测试

    pnpm test:docker        # 一键全套（RUN_TESTCONTAINERS=1）
    # 单独: docker compose -f docker-compose.chaos.yml up -d; pnpm test:chaos
    #       RUN_TESTCONTAINERS=1; pnpm test:integration

## 常见问题

| 问题                        | 解决                                      |
| --------------------------- | ----------------------------------------- |
| docker info 成功但 run 失败 | 检查 WSL2 后端, 重启 Docker Desktop       |
| chaos 测试 skip             | 确认 chaos compose 已启动且 API 就绪      |
| 端口冲突                    | 修改 docker-compose.override.yml 端口映射 |
| Windows 防火墙阻断          | 允许 Docker 通过防火墙                    |

资源限制: Docker Desktop 内存 ≥ 4GB, CPU ≥ 2 核, 磁盘 ≥ 20GB。
