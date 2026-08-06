// k6 负载测试 — Express 元数据端点
// 测试 /api/v1/data/meta + /api/v1/announcements 在缓存热状态下的 P90/P99
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const metaLatency = new Trend('meta_latency');
const announceLatency = new Trend('announce_latency');

export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '20s', target: 200 },
    { duration: '30s', target: 200 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    errors: ['rate<0.05'],
    meta_latency: ['p(90)<100', 'p(99)<1000'],
    announce_latency: ['p(90)<100', 'p(99)<1000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:15001';

export default function () {
  // GET /api/v1/data/meta
  const metaResp = http.get(`${BASE_URL}/api/v1/data/meta`, {
    headers: { Accept: 'application/json' },
  });
  check(metaResp, { 'meta status 200': (r) => r.status === 200 });
  errorRate.add(metaResp.status >= 400);
  metaLatency.add(metaResp.timings.duration);

  // GET /api/v1/announcements
  const annResp = http.get(`${BASE_URL}/api/v1/announcements`, {
    headers: { Accept: 'application/json' },
  });
  check(annResp, { 'announce status 200': (r) => r.status === 200 });
  errorRate.add(annResp.status >= 400);
  announceLatency.add(annResp.timings.duration);

  sleep(0.5);
}
