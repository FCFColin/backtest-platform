// 性能冒烟测试（T-07，维度2）
//
// 企业为何需要：在压测拐点扫描前，先用低并发确认端点功能正常、阈值配置合理，
// 避免把"功能 bug 导致的快速 5xx"误读为"高性能"。
//
// 运行：k6 run scripts/load/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5001';
const TOKEN = __ENV.TOKEN || '';

export const options = {
  vus: 10,
  duration: '30s',
  // 阈值与 docs/runbook.md SLO 对齐：P95 < 2s，错误率 < 1%。
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`, { headers });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has status field': (r) => r.body && r.body.includes('status'),
  });
  sleep(1);
}
