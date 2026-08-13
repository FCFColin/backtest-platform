import { request } from '@playwright/test';

// 引擎健康默认 15004（后端 GO_ENGINE_URL 默认值与 docker-compose 映射），
// `go run` 直跑时用 GO_ENGINE_URL 覆盖为 5004。
const ENGINE_HEALTH = `${(process.env.GO_ENGINE_URL ?? 'http://127.0.0.1:15004').replace(/\/$/, '')}/api/engine/health`;

export default async function setup(): Promise<void> {
  const deadline = Date.now() + 30_000;
  let engineReady = false;
  while (Date.now() < deadline) {
    try {
      const ctx = await request.newContext();
      const res = await ctx.get(ENGINE_HEALTH, { timeout: 3_000 });
      engineReady = res.ok();
      await res.dispose();
      await ctx.dispose();
      if (engineReady) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1_000));
  }
  if (!engineReady) {
    throw new Error(
      `Go 引擎未就绪 (${ENGINE_HEALTH})，请先: docker compose -p backtest up -d engine-go 或 cd engine-go && ENGINE_AUTH_TOKEN=dev-engine-auth-token go run ./cmd/server`,
    );
  }
  // 清理残留回测 job（中断测试留下的 wait 队列积压，free 套餐并发=1 时排队拖慢）。
  const { execFileSync } = await import('node:child_process');
  const redisPort = process.env.REDIS_URL ? new URL(process.env.REDIS_URL).port : '';
  try {
    execFileSync(
      'redis-cli',
      [
        '-p',
        redisPort || '16381',
        'EVAL',
        "local ks = redis.call('keys', ARGV[1]); for _,k in ipairs(ks) do redis.call('del', k) end; return #ks",
        '0',
        'bull:backtest-compute*',
      ],
      { stdio: 'ignore' },
    );
  } catch {}
}
