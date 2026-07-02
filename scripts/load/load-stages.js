// 阶梯负载测试（T-07，维度2）—— 探测延迟非线性增长拐点与错误起始并发。
//
// 企业为何需要：USL（通用扩展定律）指出系统吞吐随并发增长存在拐点，
// 超过后延迟非线性恶化。阶梯加压可定位"延迟开始劣化"与"开始返回错误"的并发量，
// 作为容量规划（单实例可支撑的并发/DAU）与扩容触发阈值的依据。
//
// 运行：BASE_URL=... TOKEN=... k6 run scripts/load/load-stages.js
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5001';
const TOKEN = __ENV.TOKEN || '';

const historyLatency = new Trend('history_latency', true);

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      // 阶梯：100 → 1000 → 5000，每档稳定 1 分钟，观察各档 P95/P99。
      stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 1000 },
        { duration: '2m', target: 5000 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
  },
};

const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

export default function () {
  // 只读热路径：历史行情查询（典型用户高频操作）。
  const tickers = 'SPY,QQQ,TLT';
  const res = http.get(
    `${BASE_URL}/api/v1/data/history?tickers=${tickers}&start=2020-01-01&end=2023-01-01`,
    { headers },
  );
  historyLatency.add(res.timings.duration);
  check(res, {
    'status < 500': (r) => r.status < 500,
  });
}
