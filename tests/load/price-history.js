// k6 负载测试 — GET /api/v1/prices/:ticker
//
// 场景：500 并发历史价格读取，验证读路径（缓存 + 只读副本）的吞吐与尾延迟。
// 企业理由：价格历史是前端图表与回测引擎的基础读路径，高频读需在 500 并发下
// 保证 P99<200ms 的 SLA。读路径应命中 Redis/Postgres 只读副本，不冲击主库写入。
//
// 运行：
//   k6 run tests/load/price-history.js
//   BASE_URL=http://localhost:8001 API_KEY=xxx k6 run tests/load/price-history.js
//
// k6 使用自有模块系统（import from 'k6/http' 等），非 Node.js 模块。

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标：错误率与读取延迟分布
const errorRate = new Rate('errors');
const readLatency = new Trend('read_latency');

// 真实 ticker 池：覆盖大盘 ETF、科技股、债券、商品，确保命中不同数据缓存行
const TICKERS = [
  'AAPL',
  'MSFT',
  'GOOGL',
  'AMZN',
  'TSLA',
  'NVDA',
  'META',
  'SPY',
  'VOO',
  'VTI',
  'VXUS',
  'BND',
  'BNDX',
  'GLD',
  'QQQ',
  'VYM',
  'SCHD',
  'HDV',
  'VT',
  'VTV',
];

export const options = {
  // 4 段阶梯负载：ramp up to 500 VUs（读路径可承受更高并发）
  stages: [
    { duration: '30s', target: 250 }, // ramp up to 250 VUs
    { duration: '1m', target: 500 }, // ramp up to 500 VUs
    { duration: '2m', target: 500 }, // hold at 500 VUs
    { duration: '30s', target: 0 }, // ramp down
  ],
  thresholds: {
    errors: ['rate<0.05'], // SLA：<5% 错误率
    http_req_duration: ['p(99)<200'], // SLA：99% 请求 <200ms
    read_latency: ['p(99)<200'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8001';
const API_KEY = __ENV.API_KEY || '';

// 认证：x-api-key header（若提供）
const headers = {};
if (API_KEY) {
  headers['x-api-key'] = API_KEY;
}

export default function () {
  // 随机挑选 ticker + 日期窗口，制造多样化的缓存键，避免全部命中同一行
  const ticker = TICKERS[Math.floor(Math.random() * TICKERS.length)];
  const url = `${BASE_URL}/api/v1/prices/${ticker}?startDate=2020-01-01&endDate=2024-12-31`;

  const res = http.get(url, { headers });
  readLatency.add(res.timings.duration);

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has success flag or data': (r) => {
      if (r.status !== 200) return false;
      try {
        const parsed = JSON.parse(r.body);
        return parsed.success === true || parsed.data !== undefined;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!ok);

  // 读路径停顿较短，模拟前端轮询/图表刷新的高频读
  sleep(0.2);
}
