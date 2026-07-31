# Docker 开发环境配置(Windows)

## 前置条件

Windows 10/11 + WSL2 + Docker Desktop。验证: docker info 成功且 docker run --rm hello-world 成功。

## 启动本地开发栈

    docker compose pull              # 拉取基础镜像(首次)
    docker compose up -d             # 启动完整应用栈(后台)
    docker compose -f docker-compose.chaos.yml up -d  # chaos 测试最小集
    docker compose ps                # 查看运行状态
    docker compose down              # 停止/清理

## 运行 Docker 依赖测试

    pnpm test:docker                 # 一键跑全套(RUN_TESTCONTAINERS=1)
    # 单独跑 chaos:
    docker compose -f docker-compose.chaos.yml up -d
    pnpm test:chaos
    # 单独跑 integration:
    =1; pnpm test:integration

## 常见问题

| 问题                        | 解决                                            |
| --------------------------- | ----------------------------------------------- |
| docker info 成功但 run 失败 | 检查 WSL2 后端, 重启 Docker Desktop             |
| chaos 测试 skip             | 确认 docker-compose.chaos.yml 已启动且 API 就绪 |
| 端口冲突                    | 修改 docker-compose.override.yml 端口映射       |
| Windows 防火墙阻断          | 允许 Docker 通过防火墙                          |

## 资源限制: Docker Desktop 内存 >= 4GB, CPU >= 2 核, 磁盘 >= 20GB
