import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { createServer, Socket } from 'node:net';
import { isWin, npxCmd, nodeCmd, PROJECT_ROOT, tsxLoaderUrl } from './_dev-shared.mjs';

const ROOT = PROJECT_ROOT;

if (!tsxLoaderUrl) {
  console.error(
    '[dev] 错误：找不到 tsx/dist/loader.mjs（node_modules/.pnpm/tsx@*/），请检查 pnpm install',
  );
  process.exit(1);
}

const HEADLESS = process.env.HEADLESS !== 'false' && !process.argv.includes('--interactive');
const LOG_DIR = path.resolve('.dev-logs');
const composeCmd = 'docker';

const DATA_FETCHER_HEALTH_URL = process.env.GO_DATA_SERVICE_URL
  ? `${process.env.GO_DATA_SERVICE_URL.replace(/\/$/, '')}/api/data/health`
  : 'http://127.0.0.1:15003/api/data/health';
const ENGINE_HEALTH_URL = process.env.GO_ENGINE_URL
  ? `${process.env.GO_ENGINE_URL.replace(/\/$/, '')}/api/engine/health`
  : 'http://127.0.0.1:15004/api/engine/health';

const PG_PORT = parseInt(process.env.DATABASE_URL?.match(/:(\d+)\//)?.[1] || '15442', 10);
const REDIS_PORT = parseInt(process.env.REDIS_URL?.match(/:(\d+)\//)?.[1] || '16381', 10);

function findFreePort(preferred) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(preferred ?? 0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      if (preferred) {
        resolve(findFreePort(0));
      } else {
        resolve(0);
      }
    });
  });
}

async function logTo(tag, text) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${tag}] ${text}\n`;
  if (HEADLESS) {
    try {
      await appendFile(path.join(LOG_DIR, `${tag}.log`), line, 'utf-8');
    } catch {}
  } else {
    process.stdout.write(line);
  }
}

async function waitServiceHealthy(url, deadlineMs = 30_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function waitPortOpen(port, label, deadlineMs = 30_000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + deadlineMs;
    const check = () => {
      const socket = new Socket();
      socket.setTimeout(2000);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() < deadline) {
          setTimeout(check, 1000);
        } else {
          resolve(false);
        }
      });
      socket.once('timeout', () => {
        socket.destroy();
        if (Date.now() < deadline) {
          setTimeout(check, 1000);
        } else {
          resolve(false);
        }
      });
      socket.connect(port, '127.0.0.1');
    };
    check();
  });
}

function spawnLocalService(cwd, args, label) {
  console.log(`[dev] docker 不可用，回退到本地 go run ${args.join(' ')}（${label}）`);
  const child = spawn('go', ['run', ...args], {
    cwd,
    stdio: HEADLESS ? 'ignore' : 'inherit',
    env: { ...env, HEADLESS: undefined },
    shell: isWin,
    detached: true,
  });
  child.unref();
}

function startProcess(cmd, args, opts = {}) {
  const tag = opts.tag || cmd;
  // 全平台统一使用 spawn + detached 实现后台进程分离。
  // 之前 Windows 用 PowerShell Start-Process 命令字符串传递环境变量，
  // 但含 JSON/特殊字符的 env 值（如 VSCODE_NLS_CONFIG）会破坏 PowerShell 语法。
  // spawn 的 env 选项直接以键值对传递，无字符串编码问题。
  // Windows .cmd/.bat 文件需要 shell:true 才能执行；.exe 可直接 spawn
  const needsShell = isWin && /\.(cmd|bat)$/i.test(cmd);
  const child = spawn(cmd, args, {
    ...opts,
    stdio: HEADLESS ? 'ignore' : 'inherit',
    shell: needsShell,
    detached: true,
  });
  if (child) {
    child.unref();
    child.on('error', (err) => logTo(tag, `启动失败: ${err.message}`));
  }
  return child;
}

const env = {
  ...process.env,
  SERVE_STATIC: 'true',
  COMPUTE_RATE_LIMIT_MAX: process.env.COMPUTE_RATE_LIMIT_MAX || '200',
  // Go 服务间认证 token：dev.mjs 不加载 .env，需显式提供默认值（与后端 engineConfig 默认值一致）
  ENGINE_AUTH_TOKEN: process.env.ENGINE_AUTH_TOKEN || 'dev-engine-auth-token',
  DATA_SERVICE_AUTH_TOKEN: process.env.DATA_SERVICE_AUTH_TOKEN || 'dev-data-service-auth-token',
};

async function ensureInfrastructure() {
  const pgOk = await waitPortOpen(PG_PORT, 'PostgreSQL', 2_000);
  const redisOk = await waitPortOpen(REDIS_PORT, 'Redis', 2_000);
  if (pgOk && redisOk) {
    console.log('[dev] PostgreSQL + Redis 已就绪');
    return;
  }
  console.log('[dev] 启动 Docker 基础设施 (postgres + redis)…');
  try {
    execSync(`${composeCmd} compose -p backtest up -d postgres redis`, {
      stdio: 'inherit',
      env,
      shell: isWin,
      timeout: 120_000,
    });
  } catch (err) {
    console.error('[dev] docker compose up postgres/redis 失败:', err.message);
    console.error('[dev] 请确保 Docker Desktop 已启动');
    process.exit(1);
  }
  const [pgReady, redisReady] = await Promise.all([
    waitPortOpen(PG_PORT, 'PostgreSQL', 30_000),
    waitPortOpen(REDIS_PORT, 'Redis', 30_000),
  ]);
  if (pgReady) console.log('[dev] PostgreSQL 已就绪');
  else console.warn('[dev] PostgreSQL 未就绪，部分功能可能不可用');
  if (redisReady) console.log('[dev] Redis 已就绪');
  else console.warn('[dev] Redis 未就绪，任务队列/缓存可能不可用');
}

async function ensureEngineGo() {
  if (await waitServiceHealthy(ENGINE_HEALTH_URL, 2_000)) {
    console.log('[dev] Go 引擎已就绪');
    return;
  }
  console.log('[dev] 启动 Go 计算引擎 (engine-go:15004)…');
  try {
    execSync(`${composeCmd} compose -p backtest up -d engine-go`, {
      stdio: 'inherit',
      env,
      shell: isWin,
      timeout: 60_000,
    });
  } catch (err) {
    console.warn('[dev] docker compose up engine-go 失败:', err.message);
    spawnLocalService('engine-go', ['./cmd/server'], 'engine-go:15004');
  }
  if (await waitServiceHealthy(ENGINE_HEALTH_URL, 30_000)) {
    console.log('[dev] Go 引擎已就绪');
  } else {
    console.warn('[dev] Go 引擎 30s 内未就绪，回测将返回 ENGINE_UNAVAILABLE');
  }
}

function ensureDataFetcher() {
  waitServiceHealthy(DATA_FETCHER_HEALTH_URL, 2_000).then((ok) => {
    if (ok) {
      console.log('[dev] Go 数据服务已就绪');
      return;
    }
    console.log('[dev] 后台启动 Go 数据服务 (data-fetcher:15003)…');
    const child = spawn(composeCmd, ['compose', '-p', 'backtest', 'up', '-d', 'data-fetcher'], {
      stdio: 'inherit',
      env,
      shell: isWin,
      detached: true,
    });
    child.unref();
    child.on('error', (err) => {
      console.warn('[dev] docker compose up data-fetcher 失败:', err.message);
      spawnLocalService('data-fetcher', ['.'], 'data-fetcher:15003');
    });
  });
}

if (HEADLESS) {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  console.log(`[dev] 日志目录: ${LOG_DIR}/`);
}

await ensureInfrastructure();
await ensureEngineGo();
ensureDataFetcher();

if (!existsSync('dist/index.html')) {
  console.log('[dev] 首次启动：构建前端产物（约 30–60s，仅一次）…');
  execSync(`${npxCmd} vite build`, { stdio: 'inherit', env, shell: isWin });
}

const preferredPort = parseInt(process.env.API_PORT || process.env.PORT || '15001', 10);
const port = await findFreePort(preferredPort);
const portSuffix = port !== preferredPort ? `（${preferredPort} 已被占，改用 ${port}）` : '';

logTo('dev', '启动 Vite watch…');
startProcess(npxCmd, ['vite', 'build', '--watch'], { env, tag: 'vite-watch' });

if (HEADLESS) {
  logTo('dev', `通过 VBScript 脱壳启动后台进程 (port ${port})…`);
  const vbsScript = path.resolve('scripts/dev-start-bg.vbs');
  const vbsChild = spawn('wscript.exe', [vbsScript], {
    stdio: 'ignore',
    detached: true,
  });
  vbsChild.unref();
  await new Promise((r) => setTimeout(r, 6000));
} else {
  logTo('dev', `启动 API 服务器 (port ${port})…`);
  startProcess(nodeCmd, ['--import', tsxLoaderUrl, 'packages/backend/src/server.ts'], {
    env: { ...env, PORT: String(port) },
    tag: 'server',
  });

  logTo('dev', '启动 Worker 进程…');
  startProcess(
    nodeCmd,
    ['--watch', '--import', tsxLoaderUrl, 'packages/backend/src/queues/workerEntrypoint.ts'],
    {
      env,
      tag: 'worker',
    },
  );
}

const url = `http://localhost:${port}/`;
console.log('');
console.log('══════════════════════════════════════════════');
console.log(`  ✅ 全栈开发环境已启动${portSuffix}`);
console.log(`  🔗  ${url}`);
console.log(`  📦  PostgreSQL: 127.0.0.1:${PG_PORT}  Redis: 127.0.0.1:${REDIS_PORT}`);
console.log(`  ⚙️   Go Engine: :15004  Worker: 后台运行`);
if (HEADLESS) {
  console.log(`  📋 日志: ${LOG_DIR}/`);
  console.log(`  🔧   停止: npm run dev:stop`);
  console.log(`  ℹ️   前台模式: npm run dev -- --interactive`);
} else {
  console.log('[dev] 前台模式：按 Ctrl+C 停止所有服务');
}
console.log('══════════════════════════════════════════════');
