# @backtest/api-client

Auto-generated TypeScript API client for the Backtest Platform.

> 当前版本为手写的轻量级客户端（基于 `fetch`），作为
> `openapi-generator-cli`（`typescript-fetch`）生成结果的占位实现。
> 待生成器接入后，对外公共 API（`Configuration` / `BacktestApi` / `TickerApi` / `AuthApi`）
> 将保持稳定，底层可无缝切换到生成代码。

## 安装

```bash
npm install @backtest/api-client
# 或在 monorepo 中
pnpm add @backtest/api-client
```

## 快速开始

```ts
import { Configuration, BacktestApi, TickerApi, AuthApi } from '@backtest/api-client';

// 1. 配置基地址与凭据
const config = new Configuration({
  basePath: 'http://localhost:5001/api/v1', // 与 OpenAPI servers 一致
  accessToken: '<JWT accessToken>', // 可选，访问需 JWT 的端点时必填
  apiKey: '<组织级 API Key>', // 可选，过渡兼容
});

// 2. 使用各 API 包装类
const backtestApi = new BacktestApi(config);
const tickerApi = new TickerApi(config);
const authApi = new AuthApi(config);

// 登录并获取令牌
const tokens = await authApi.login('my-user', 'my-password');
config.accessToken = tokens.accessToken; // 或 backtestApi.setAccessToken(tokens.accessToken)

// 搜索标的
const tickers = await tickerApi.searchTickers('SPY');

// 运行组合回测
const result = await backtestApi.runBacktest(
  {
    id: 'p1',
    name: '60/40',
    assets: [
      { ticker: 'SPY', weight: 0.6 },
      { ticker: 'AGG', weight: 0.4 },
    ],
    rebalanceFrequency: 'annual',
  },
  {
    startDate: '2010-01-01',
    endDate: '2024-12-31',
    startingValue: 10000,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: 'SPY',
  },
);
```

## 认证

SDK 支持两种互兼容的鉴权方式（与 OpenAPI `securitySchemes` 对齐）：

### JWT Bearer Token（推荐）

通过 `Configuration.accessToken` 或 `BaseApiClient.setAccessToken(token)` 注入，
SDK 会自动附加 `Authorization: Bearer <token>` 请求头。

```ts
const config = new Configuration({ accessToken: 'eyJhbGciOi...' });
// 令牌刷新后更新：
// backtestApi.setAccessToken(newAccessToken);
```

获取令牌：

```ts
const authApi = new AuthApi(config);
const { accessToken, refreshToken } = await authApi.login('user', 'pass');
// 后续刷新：
const refreshed = await authApi.refreshToken(refreshToken);
```

### 组织级 API Key（过渡兼容）

通过 `Configuration.apiKey` 注入，SDK 会附加 `x-api-key` 请求头。
**不推荐生产长期依赖**，优先使用 JWT。

```ts
const config = new Configuration({ apiKey: 'org-key-xxx' });
```

两种方式可同时使用；调用方自定义的 `Authorization` / `x-api-key` 头不会被覆盖。

## 错误处理

所有非 2xx 响应与网络层故障都会被包装为 `BacktestApiError` 抛出：

```ts
import { BacktestApiError } from '@backtest/api-client';

try {
  await backtestApi.getBacktestRun('job-123');
} catch (err) {
  if (err instanceof BacktestApiError) {
    console.error('status:', err.status); // HTTP 状态码；网络故障为 0
    console.error('statusText:', err.statusText);
    console.error('body:', err.body); // 解析后的响应体（通常为 RFC 7807 ProblemDetail）
  }
}
```

后端错误体遵循 RFC 7807 Problem Details：

```jsonc
{
  "success": false,
  "error": {
    "type": "about:blank",
    "title": "Unauthorized",
    "status": 401,
    "code": "AUTH_INVALID",
    "detail": "...",
  },
}
```

## 可用 API 方法

所有路径前缀为 `basePath`（默认 `http://localhost:5001/api/v1`）。

### `BacktestApi`

| 方法                              | HTTP | 路径                       | 说明                 |
| --------------------------------- | ---- | -------------------------- | -------------------- |
| `runBacktest(portfolio, options)` | POST | `/backtest/portfolio`      | 运行组合回测         |
| `getBacktestRun(jobId)`           | GET  | `/backtest/runs/:jobId`    | 查询异步回测任务状态 |
| `getBacktestResults(runId)`       | GET  | `/backtest/results/:runId` | 获取已完成的回测结果 |

### `TickerApi`

| 方法                                            | HTTP | 路径              | 说明             |
| ----------------------------------------------- | ---- | ----------------- | ---------------- |
| `searchTickers(query)`                          | GET  | `/tickers/search` | 搜索可回测标的   |
| `getTickerPrices(ticker, startDate?, endDate?)` | GET  | `/prices/:ticker` | 获取标的历史价格 |

### `AuthApi`

| 方法                         | HTTP | 路径            | 说明                       |
| ---------------------------- | ---- | --------------- | -------------------------- |
| `login(username, password)`  | POST | `/auth/login`   | 用户名密码登录，返回令牌对 |
| `refreshToken(refreshToken)` | POST | `/auth/refresh` | 刷新访问令牌               |
| `getProfile()`               | GET  | `/auth/me`      | 查询当前用户身份（需 JWT） |

## 底层用法

如需访问尚未被包装的端点，可直接使用 `BaseApiClient.request`：

```ts
import { BaseApiClient } from '@backtest/api-client';

const client = new BaseApiClient({
  basePath: 'http://localhost:5001/api/v1',
  accessToken: '<jwt>',
});

const data = await client.request('GET', '/health', undefined, { verbose: true });
```

## 构建

```bash
pnpm --filter @backtest/api-client build   # tsc -> dist/
pnpm --filter @backtest/api-client test    # vitest run
```

## 从 OpenAPI 重新生成

```bash
pnpm --filter @backtest/api-client generate
# 等价于：openapi-generator-cli generate -i ../../docs/openapi.yaml -g typescript-fetch -o src ...
```

> `generate` 脚本需要本机安装 Java 运行时（openapi-generator-cli 依赖）。
> 在未安装 Java 的环境中，继续使用本手写客户端即可。
