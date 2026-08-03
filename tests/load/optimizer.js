// k6 负载测试 — POST /api/v1/optimizer/portfolio
//
// 场景：50 并发优化器提交，验证异步优化入队路径的吞吐与尾延迟。
// 企业理由：组合优化是计算密集型异步任务，需在 50 并发下保证 P99<300ms 的
// 入队 SLA（不含实际计算耗时）。优化参数空间较大，入队延迟敏感于校验与序列化开销。
//
// 运行：
//   k6 run tests/load/optimizer.js
//   BASE_URL=http://localhost:15001 API_KEY=xxx k6 run tests/load/optimizer.js
//
// k6 使用自有模块系统（import from 'k6/http' 等），非 Node.js 模块。

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标：错误率与优化提交延迟分布
const errorRate = new Rate('errors');
const optimizeLatency = new Trend('optimize_latency');

// init context：加载优化参数 fixture（每个 VU 共享同一份只读副本）
const optimizationParams = JSON.parse(open('./fixtures/optimization-params.json'));

export const options = {
  // 4 段阶梯负载：ramp up to 50 VUs（优化器计算重，并发较回测低）
  stages: [
    { duration: '30s', target: 25 }, // ramp up to 25 VUs
    { duration: '1m', target: 50 }, // ramp up to 50 VUs
    { duration: '2m', target: 50 }, // hold at 50 VUs
    { duration: '30s', target: 0 }, // ramp down
  ],
  thresholds: {
    errors: ['rate<0.05'], // SLA：<5% 错误率
    http_req_duration: ['p(99)<300'], // SLA：99% 请求 <300ms
    optimize_latency: ['p(99)<300'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:15001';
const API_KEY = __ENV.API_KEY || '';

// 认证：x-api-key header（若提供）
const headers = {
  'Content-Type': 'application/json',
};
if (API_KEY) {
  headers['x-api-key'] = API_KEY;
}

export default function () {
  // 随机挑选一组优化参数（5 个 fixture 轮换）
  const params = optimizationParams[Math.floor(Math.random() * optimizationParams.length)];

  const res = http.post(`${BASE_URL}/api/v1/optimizer/portfolio`, JSON.stringify(params), {
    headers,
  });
  optimizeLatency.add(res.timings.duration);

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

  // 优化器提交间隔较长，模拟用户调整参数后重新提交的节奏
  sleep(1);
}
