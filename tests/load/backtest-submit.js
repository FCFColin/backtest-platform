// k6 负载测试 — POST /api/v1/backtest/portfolio
//
// 场景：100 并发回测提交，验证异步入队路径（202 Accepted）的吞吐与尾延迟。
// 企业理由：回测提交是平台最热写入路径，需在高峰负载下保证 <5% 错误率与
// P99<500ms 的 SLA，避免队列积压导致用户无法发起回测。
//
// 运行：
//   k6 run tests/load/backtest-submit.js
//   BASE_URL=http://localhost:8001 API_KEY=xxx k6 run tests/load/backtest-submit.js
//
// k6 使用自有模块系统（import from 'k6/http' 等），非 Node.js 模块。

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标：错误率与提交延迟分布
const errorRate = new Rate('errors');
const submitLatency = new Trend('submit_latency');

// init context：加载测试数据 fixture（每个 VU 共享同一份只读副本）
const portfolios = JSON.parse(open('./fixtures/portfolios.json'));

export const options = {
  // 4 段阶梯负载：ramp up → hold → ramp down，模拟真实流量峰值
  stages: [
    { duration: '30s', target: 50 }, // ramp up to 50 VUs
    { duration: '1m', target: 100 }, // ramp up to 100 VUs
    { duration: '2m', target: 100 }, // hold at 100 VUs
    { duration: '30s', target: 0 }, // ramp down
  ],
  thresholds: {
    errors: ['rate<0.05'], // SLA：<5% 错误率
    http_req_duration: ['p(99)<500'], // SLA：99% 请求 <500ms
    submit_latency: ['p(99)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8001';
const API_KEY = __ENV.API_KEY || '';

// 认证：x-api-key header（若提供）。未提供则依赖匿名/默认租户路径。
const headers = {
  'Content-Type': 'application/json',
};
if (API_KEY) {
  headers['x-api-key'] = API_KEY;
}

// 随机挑选一个组合配置（10 个 fixture 轮换），构造回测请求体。
function buildRequestBody() {
  const portfolio = portfolios[Math.floor(Math.random() * portfolios.length)];
  return {
    portfolios: [portfolio],
    parameters: {
      startDate: '2015-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      baseCurrency: 'usd',
      adjustForInflation: false,
    },
  };
}

export default function () {
  const body = buildRequestBody();
  const res = http.post(`${BASE_URL}/api/v1/backtest/portfolio`, JSON.stringify(body), {
    headers,
  });

  // k6 内置高精度计时（含网络/TLS/服务端处理）
  submitLatency.add(res.timings.duration);

  const ok = check(res, {
    'status is 202 (async) or 200 (sync fallback)': (r) => r.status === 202 || r.status === 200,
    'response has success flag': (r) => {
      try {
        const parsed = JSON.parse(r.body);
        return parsed.success === true;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!ok);

  // 每次提交后短暂停顿，模拟用户思考时间，避免单 VU 打满 CPU
  sleep(0.5);
}
