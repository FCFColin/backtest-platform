#!/usr/bin/env node
/**
 * 本地性能基线实测（T-07）
 *
 * 无 k6 依赖，使用 Node fetch 并发压测 /api/health。
 * 输出 P50/P95/P99 与 RPS，供 scripts/load/README.md 回填。
 *
 * 用法：node scripts/load/measure-baseline.mjs [BASE_URL]
 */
const BASE_URL = process.argv[2] || process.env.BASE_URL || 'http://localhost:5001';
const CONCURRENCY = Number(process.env.CONCURRENCY || 10);
const DURATION_MS = Number(process.env.DURATION_MS || 30000);
const TARGET = `${BASE_URL.replace(/\/$/, '')}/api/health`;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function probe() {
  const start = performance.now();
  try {
    const res = await fetch(TARGET);
    await res.text();
    return { ok: res.ok, ms: performance.now() - start };
  } catch {
    return { ok: false, ms: performance.now() - start };
  }
}

async function main() {
  const deadline = Date.now() + DURATION_MS;
  const latencies = [];
  let errors = 0;
  let total = 0;

  async function worker() {
    while (Date.now() < deadline) {
      const r = await probe();
      latencies.push(r.ms);
      if (!r.ok) errors += 1;
      total += 1;
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsedSec = (Date.now() - started) / 1000;

  latencies.sort((a, b) => a - b);
  const result = {
    target: TARGET,
    concurrency: CONCURRENCY,
    durationSec: Math.round(elapsedSec),
    requests: total,
    rps: Math.round(total / elapsedSec),
    errorRate: total ? errors / total : 0,
    p50ms: Math.round(percentile(latencies, 50) * 100) / 100,
    p95ms: Math.round(percentile(latencies, 95) * 100) / 100,
    p99ms: Math.round(percentile(latencies, 99) * 100) / 100,
    measuredAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
