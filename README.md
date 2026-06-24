# 回测平台 (Backtest Platform)

模仿 [testfol.io](https://testfol.io/) 的专业投资组合回测平台，支持 ETF/股票/基金的历史回测、蒙特卡洛模拟、组合优化和有效前沿分析。本地部署、免费、多语言微服务架构。

## 架构概览

本项目由 5 个子项目组成（4 种语言），通过 HTTP 互相通信，具备完整的降级链：

```
┌─────────┐    HTTP    ┌──────────┐    HTTP    ┌────────────┐
│  前端   │ ─────────▶ │ Express  │ ─────────▶ │ Rust 引擎  │ (主)
│ React   │            │  API     │            │ actix-web  │
│ Vite    │            │ TS ESM   │            └────────────┘
└─────────┘            │          │    失败降级      │
                       │          │ ─────────▶ ┌────────────┐
                       │          │            │ Node 引擎  │ (备)
                       │          │            │ api/engine │
                       │          │            └────────────┘
                       │          │    HTTP    ┌────────────┐
                       │          │ ─────────▶ │ Go 数据    │ (主)
                       │          │            │ gin        │
                       │          │            └────────────┘
                       │          │    失败降级      │
                       │          │ ─────────▶ ┌────────────┐
                       │          │            │ Python/本地│ (备)
                       └──────────┘            └────────────┘
```

| 服务 | 语言 | 目录 | 端口 | 职责 |
|------|------|------|------|------|
| 前端 Web | React/TS | `src/` | 5173 | UI 渲染、用户交互 |
| 后端 API | Express/TS | `api/` | 5001 | 路由编排、降级调度 |
| Rust 引擎 | Rust | `engine-rs/` | 5002 | 主计算引擎 |
| Go 数据服务 | Go | `data-fetcher/` | 5003 | 主数据服务 |
| Python 引擎 | Python | `api/python/` | - | CLI 批量数据工具 |

> 降级说明：Rust 引擎不可用时降级到 Node TS 引擎（功能不完整，会返回 `degraded` 警告）；Go 数据服务不可用时降级到 Python 子进程或本地文件。

## 快速启动

### 前置要求
- Node.js 18+、npm
- Rust toolchain（cargo）
- Go 1.21+
- Python 3.11+（可选，用于数据抓取）

### 1. 安装依赖
```powershell
npm install
```

### 2. 启动前端 + 后端 API（开发模式）
```powershell
npm run dev
```
该命令会同时启动：
- 前端 Vite 开发服务器：http://localhost:5173
- 后端 Express API：http://localhost:5001

### 3. 启动 Rust 引擎（可选，推荐）
```powershell
cd engine-rs
cargo run
```
监听 http://127.0.0.1:5002。不启动时后端自动降级到 Node TS 引擎。

### 4. 启动 Go 数据服务（可选，推荐）
```powershell
cd data-fetcher
go run main.go
```
监听 http://127.0.0.1:5003。不启动时后端自动降级到 Python/本地文件。

### 5. Python 数据引擎（CLI 工具，按需使用）
```powershell
cd api/python
python -m engine.main full        # 全量更新数据
python -m engine.main status      # 查看进度
```

## 目录结构

```
回测平台/
├── src/                  # 前端 (React + Vite + Tailwind)
│   ├── components/       # 组件 (charts/layout/backtest/common)
│   ├── pages/            # 页面
│   ├── store/            # Zustand 状态管理
│   ├── hooks/            # 自定义 Hooks
│   └── lib/              # 工具函数
├── api/                  # 后端 API (Express + TS)
│   ├── routes/           # 路由层
│   ├── services/         # 服务层
│   ├── engine/           # Node 降级引擎
│   └── python/           # Python 数据引擎 (CLI)
├── engine-rs/            # Rust 主引擎 (actix-web)
├── data-fetcher/         # Go 数据服务 (gin)
├── shared/               # 前后端共享类型
├── data/                 # 市场数据 (CPI/汇率/指数/标的)
├── tests/                # 测试 (unit/e2e/adversarial)
├── docs/                 # 文档
└── .trae/documents/      # 需求/架构文档
```

详细结构见 [project-spec.md](.trae/documents/project-spec.md)，架构详解见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 技术栈

- **前端**：React 18 + TypeScript + Vite 6 + Tailwind CSS 3 + Zustand + Recharts
- **后端**：Express 4 + TypeScript (ESM) + tsx
- **Rust 引擎**：actix-web 4 + serde + nalgebra + rayon
- **Go 数据服务**：gin + baostock 客户端
- **Python**：akshare / yfinance
- **测试**：Vitest (TS) + cargo test (Rust) + go test (Go)

## 常用命令

```powershell
npm run dev          # 启动前端+后端开发服务器
npm run build        # 构建前端
npm run check        # TypeScript 类型检查
npm run lint         # ESLint
npm run test         # 运行所有测试
npm run test:unit    # 仅单元测试
npm run test:e2e     # 仅 E2E 测试
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 5001 | 后端 API 端口 |
| `RUST_ENGINE_URL` | `http://127.0.0.1:5002` | Rust 引擎地址 |
| `GO_DATA_SERVICE_URL` | `http://127.0.0.1:5003` | Go 数据服务地址 |
| `NODE_ENV` | - | 环境（development 显示错误详情） |

## 文档

- [项目结构规范](.trae/documents/project-spec.md) - 结构与命名宪法
- [架构详解](docs/ARCHITECTURE.md) - 服务拓扑、降级链、数据流
- [产品需求文档](.trae/documents/prd.md) - 功能模块与页面设计
- [技术架构](.trae/documents/tech-architecture.md) - API 定义与数据模型
