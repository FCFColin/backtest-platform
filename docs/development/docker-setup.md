# 本地 Docker 开发环境配置(Windows)

> 适用对象:Windows 开发者机器。目标是让 `tests/chaos/`、`tests/integration/` 中依赖 testcontainers/Docker 的测试在本地可运行,与 CI 环境对齐。

## 1. 前置条件

| 组件           | 最低版本        | 说明                                       |
| -------------- | --------------- | ------------------------------------------ |
| Windows        | 10 build 19044+ | Windows 11 推荐;WSL2 需内核 5.10+          |
| Docker Desktop | 4.30+           | 启用 WSL2 backend,不要用 Hyper-V backend   |
| WSL2           | 内核 5.10+      | `wsl --update` 升级                        |
| pnpm           | 9.x             | 项目包管理器                               |
| Node.js        | 20.x            | 与 CI 一致(see `.github/workflows/ci.yml`) |

## 2. 安装步骤

### 2.1 启用 WSL2

以管理员身份打开 PowerShell:

```powershell
wsl --install
wsl --set-default-version 2
wsl --update
```

重启系统后,确认默认分发为 WSL2:

```powershell
wsl -l -v
```

输出应包含 `VERSION 2` 列。如显示 `VERSION 1`,执行 `wsl --set-version <DistroName> 2` 转换。

### 2.2 安装 Docker Desktop

1. 下载 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) 并安装。
2. 启动 Docker Desktop → Settings → General:
   - 勾选 `Use the WSL 2 based engine`(默认启用,确认即可)。
3. Settings → Resources → WSL Integration:
   - 勾选 `Enable integration with my default WSL distro`。
   - 针对需要的发行版单独勾选(如 `Ubuntu`)。
4. 应用并重启 Docker Desktop。

### 2.3 验证 Docker 可用

```powershell
docker info
docker run --rm hello-world
```

两条命令都成功输出即安装完成。`tests/helpers/testcontainersPg.ts` 中的 `isDockerAvailable()` 通过 `docker info` + `docker run --rm hello-world` 双重检测,本地必须两项都通过。

## 3. 启动本地开发栈

`docker-compose.yml` 定义了 postgres / redis / engine-go / api / frontend / data-fetcher 全套服务。chaos 测试依赖此栈运行。

```powershell
# 拉取基础镜像(首次执行)
docker pull postgres:16-alpine
docker pull redis:7-alpine

# 启动完整应用栈(后台)
docker compose up -d

# 仅启动 chaos 测试依赖的最小集
docker compose up -d postgres redis engine-go api

# 查看运行状态
docker compose ps

# 停止 / 清理
docker compose down
```

容器名约定(与 `tests/helpers/chaos.ts` 中 `CONTAINERS` 常量一致):

| 服务         | 容器名                  | 端口 |
| ------------ | ----------------------- | ---- |
| postgres     | `backtest-postgres`     | 5432 |
| redis        | `backtest-redis`        | 6379 |
| engine-go    | `backtest-engine-go`    | 5004 |
| api          | `backtest-api`          | 5001 |
| data-fetcher | `backtest-data-fetcher` | 5003 |
| frontend     | `backtest-frontend`     | 80   |

## 4. 运行 Docker 依赖测试

### 4.1 一键跑全套(推荐)

```powershell
npm run test:docker
```

该脚本等价于 `cross-env RUN_TESTCONTAINERS=1 vitest run`,会启用所有依赖 Docker 的测试路径。

### 4.2 单独跑 chaos

chaos 测试需要完整应用栈运行(API 在 `http://127.0.0.1:5001` 可达):

```powershell
# 先启动应用栈
docker compose up -d postgres redis engine-go api

# 等待 API 就绪
npx wait-on http://127.0.0.1:5001/api/health --timeout 120000

# 跑 chaos(5 个 experiment 全部执行,不再 7 skip)
npm run test:chaos
```

### 4.3 单独跑 integration

integration 测试通过 testcontainers 自启动临时 postgres 容器,不需要预先 `docker compose up`:

```powershell
# 设置环境变量启用 testcontainers 路径
$env:RUN_TESTCONTAINERS=1
npm run test:integration

# 或一次性
cross-env RUN_TESTCONTAINERS=1 npm run test:integration
```

启用后,Docker 路径 41 个集成测试从 skip 恢复为执行(总 skip 从 70 降至 ≤29)。

## 5. CI 环境

CI 配置在 `.github/workflows/ci.yml`,关键 job:

| Job                  | Docker service container | 说明                                        |
| -------------------- | ------------------------ | ------------------------------------------- |
| `node-deep`          | postgres:16 + redis:7    | 覆盖率 + 构建,非阻断                        |
| `integration`        | postgres:16 + redis:7    | 集成测试,非阻断                             |
| `chaos`              | docker compose 全栈      | 5 个 chaos experiment,非阻断                |
| `e2e`                | docker compose 全栈      | Playwright E2E,阻断                         |
| `property`           | 无                       | property-based 测试,在 node-quick matrix 中 |
| `migration-rollback` | postgres:16              | 迁移回滚测试,阻断                           |

CI 自动设置 `RUN_TESTCONTAINERS=1`,本地复现需手动设置(见 4.3)。

## 6. 常见问题

### 6.1 `docker info` 成功但 `docker run --rm hello-world` 失败

WSL2 集成未生效。打开 Docker Desktop → Settings → Resources → WSL Integration,勾选当前发行版后重启 Docker。

### 6.2 chaos 测试仍 skip

检查前置条件:

```powershell
docker info
docker inspect -f '{{.State.Running}}' backtest-postgres
docker inspect -f '{{.State.Running}}' backtest-api
curl http://127.0.0.1:5001/api/health
```

四项全部正常才会执行 chaos experiment。

### 6.3 端口冲突

容器默认绑定 `127.0.0.1`,如本机已有同名端口占用,编辑 `docker-compose.override.yml` 重映射。

### 6.4 Windows 防火墙阻断 Docker 网络

`docker network disconnect` / `connect` 命令需要 Docker daemon 网络权限。如被防火墙拦截,把 `Docker Desktop` 加入允许列表。

## 7. 资源限制建议

Docker Desktop 默认分配 4GB 内存 / 2 CPU,跑 chaos + integration 同时建议:

- Memory: 8192 MB
- CPUs: 4
- Swap: 2 GB

Settings → Resources 调整后 Apply & Restart。
