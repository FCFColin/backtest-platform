# 回测平台 — 多语言统一命令入口（T-26，维度7 开发者体验）
#
# 企业为何需要：服务跨 TS/Go 两种语言各有独立工具链（Rust/Python 已退役，ADR-003），
# 新成员需记忆异构命令。统一的 Makefile 提供一致的动词（install/dev/test/lint/check），
# 降低上手成本与心智负担，并使 CI 与本地命令对齐（减少"本地能过 CI 挂"）。
#
# 用法：make help

.DEFAULT_GOAL := help
.PHONY: help install dev up down check lint test test-unit bench audit simplify deadcode \
        go-test go-vet fmt

help: ## 显示所有可用命令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## 安装 Node 依赖（pnpm lockfile）
	pnpm install

dev: ## SaaS 本地开发（预构建前端+API:15001，自动拉起 engine-go）
	pnpm run dev

up: ## 启动核心依赖（postgres/redis/engine/data；可选：--profile cdc|redis-ha|edge）
	docker compose up -d

down: ## 停止依赖容器
	docker compose down

# ---- TypeScript（API + 前端）----
check: ## TS 类型检查
	pnpm run check

lint: ## ESLint
	pnpm run lint

test: ## 全部测试（vitest）
	pnpm run test

test-unit: ## 单元测试
	pnpm run test:unit

bench: ## Go 引擎性能基准（engine-go benchmarks）
	cd engine-go && go test -bench=. -benchmem ./...

audit: ## 供应链审计（prod 依赖漏洞阻断）
	pnpm run audit:supply

simplify: ## 重复代码检测（jscpd）
	pnpm run simplify

deadcode: ## 死代码检测（knip）
	pnpm run deadcode

# ---- Go（engine-go / data-fetcher）----
go-test: ## Go 竞态测试
	cd engine-go && go test -race ./... && cd ../data-fetcher && go test -race ./...

go-vet: ## Go 静态检查
	cd engine-go && go vet ./... && cd ../data-fetcher && go vet ./...

fmt: ## 格式化（prettier）
	pnpm exec prettier --write .
