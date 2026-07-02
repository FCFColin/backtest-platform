/**
 * SaaS 本地开发：预构建前端 + API 托管 dist/（与生产一致，首屏秒开）
 *
 * 流程：engine-go → dist build → vite watch + API SERVE_STATIC=true
 * 访问 http://localhost:5001/（单端口）
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const env = {
  ...process.env,
  SERVE_STATIC: 'true',
  COMPUTE_RATE_LIMIT_MAX: process.env.COMPUTE_RATE_LIMIT_MAX || '200',
};
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const npxCmd = isWin ? 'npx.cmd' : 'npx';
const composeCmd = 'docker';

const ENGINE_HEALTH_URL = process.env.GO_ENGINE_URL
  ? `${process.env.GO_ENGINE_URL.replace(/\/$/, '')}/api/engine/health`
  : 'http://127.0.0.1:5004/api/engine/health';

/** 轮询 Go 引擎健康 */
async function waitEngineHealthy(deadlineMs = 30_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(ENGINE_HEALTH_URL, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // 仍在启动
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** 本地 go run 回退（docker 不可用时） */
function spawnLocalEngineGo() {
  const engineEnv = {
    ...env,
    ENGINE_AUTH_TOKEN: env.ENGINE_AUTH_TOKEN || 'dev-engine-auth-token',
  };
  console.log('[dev] docker 不可用，回退到本地 go run ./cmd/server（ENGINE_AUTH_TOKEN 已注入）');
  spawn('go', ['run', './cmd/server'], {
    cwd: 'engine-go',
    stdio: 'inherit',
    env: engineEnv,
    shell: isWin,
    detached: true,
  }).unref();
}

/** 拉起 engine-go 并等待健康（回测主引擎，避免 fail-closed 503） */
async function ensureEngineGo() {
  if (await waitEngineHealthy(2_000)) {
    console.log('[dev] Go 引擎已就绪');
    return;
  }

  console.log('[dev] 启动 Go 计算引擎 (engine-go:5004)…');
  try {
    execSync(`${composeCmd} compose -p backtest up -d engine-go`, {
      stdio: 'inherit',
      env,
      shell: isWin,
    });
  } catch (err) {
    console.warn('[dev] docker compose up engine-go 失败:', err.message);
    spawnLocalEngineGo();
  }

  if (await waitEngineHealthy(30_000)) {
    console.log('[dev] Go 引擎已就绪');
  } else {
    console.warn('[dev] Go 引擎 30s 内未就绪，回测将返回 ENGINE_UNAVAILABLE');
  }
}

if (!existsSync('dist/index.html')) {
  console.log('[dev] 首次启动：构建前端产物（约 30–60s，仅一次）…');
  execSync(`${npxCmd} vite build`, { stdio: 'inherit', env, shell: isWin });
}

await ensureEngineGo();

const port = process.env.API_PORT || process.env.PORT || '5001';
console.log(`[dev] SaaS 模式：API + 预构建前端 → http://localhost:${port}/`);
console.log('[dev] 前端热更新请用 npm run dev:hmr（Vite 5176，首访较慢）');

const watch = spawn(npxCmd, ['vite', 'build', '--watch'], {
  stdio: 'inherit',
  env,
  shell: isWin,
});
const server = spawn(npmCmd, ['run', 'server:dev'], {
  stdio: 'inherit',
  env,
  shell: isWin,
});

spawn(npmCmd, ['run', 'import:priority-tickers'], {
  stdio: 'inherit',
  env,
  shell: isWin,
});

function shutdown(code = 0) {
  watch.kill();
  server.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
watch.on('exit', (code) => {
  if (code && code !== 0) shutdown(code);
});
server.on('exit', (code) => shutdown(code ?? 0));
