/**
 * 无头开发启动脚本（默认）
 *
 * 自动找空闲端口，后台启动服务（不绑定终端），输出访问地址。
 * 可通过 HEADLESS=false 或 --interactive 切换到前台交互模式。
 *
 * 流程：engine-go → dist build → 后台启动 API (SERVE_STATIC=true)
 * 访问 http://localhost:<port>/
 */

import { spawn, exec, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';
const nodeCmd = isWin ? 'node.exe' : 'node';
const composeCmd = 'docker';

import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

/** 项目根目录 */
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

/** 在 pnpm node_modules/.pnpm 下找 tsx loader 路径 */
function findTsxLoader() {
  const pnpmDir = path.join(ROOT, 'node_modules', '.pnpm');
  if (!existsSync(pnpmDir)) return undefined;
  const entries = readdirSync(pnpmDir);
  const tsxDir = entries.find((d) => d.startsWith('tsx@'));
  if (!tsxDir) return undefined;
  const loader = path.join(pnpmDir, tsxDir, 'node_modules', 'tsx', 'dist', 'loader.mjs');
  return existsSync(loader) ? loader : undefined;
}
const tsxLoaderPath = findTsxLoader();
if (!tsxLoaderPath) {
  console.error('[dev] 错误：找不到 tsx/dist/loader.mjs（node_modules/.pnpm/tsx@*/），请检查 pnpm install');
  process.exit(1);
}
const tsxLoaderUrl = pathToFileURL(tsxLoaderPath).href;

const HEADLESS = process.env.HEADLESS !== 'false' && !process.argv.includes('--interactive');
const LOG_DIR = path.resolve('.dev-logs');

const DATA_FETCHER_HEALTH_URL = process.env.GO_DATA_SERVICE_URL
  ? `${process.env.GO_DATA_SERVICE_URL.replace(/\/$/, '')}/api/data/health`
  : 'http://127.0.0.1:5003/api/data/health';
const ENGINE_HEALTH_URL = process.env.GO_ENGINE_URL
  ? `${process.env.GO_ENGINE_URL.replace(/\/$/, '')}/api/engine/health`
  : 'http://127.0.0.1:5004/api/engine/health';

/** 找空闲端口 */
function findFreePort(preferred) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(preferred ?? 0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      if (preferred) { resolve(findFreePort(0)); }
      else { resolve(0); }
    });
  });
}

/** 写日志（异步追加） */
async function logTo(tag, text) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${tag}] ${text}\n`;
  if (HEADLESS) {
    try { await appendFile(path.join(LOG_DIR, `${tag}.log`), line, 'utf-8'); } catch { /* 静默 */ }
  } else {
    process.stdout.write(line);
  }
}

/** 轮询服务健康 */
async function waitServiceHealthy(url, deadlineMs = 30_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch { /* 仍在启动 */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** 本地 go run 回退（docker 不可用时） */
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

/** 启动子进程（无头时后台运行，交互时前台） */
function startProcess(cmd, args, opts = {}) {
  const tag = opts.tag || cmd;
  if (HEADLESS && isWin) {
    // Windows 下用 Start-Process 实现真正 detached（避免 spawn+shell 子进程被回收）
    const escapedArgs = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ');
    const envBlock = (opts.env ? Object.entries(opts.env).filter(([k]) => !['HEADLESS', 'NODE_DEBUG'].includes(k)) : [])
      .map(([k, v]) => `$env:${k}="${String(v).replace(/"/g, '\\"')}"`)
      .join('; ');
    const wd = opts.cwd ? `-WorkingDirectory "${opts.cwd}"` : '';
    const psCmd = `${envBlock}; Start-Process -FilePath "${cmd}" -ArgumentList ${escapedArgs} ${wd} -WindowStyle Hidden`;
    exec(psCmd, { shell: 'powershell.exe' }, (err) => {
      if (err) logTo(tag, `启动失败: ${err.message}`);
    });
    return null;
  }
  const child = spawn(cmd, args, {
    ...opts,
    stdio: HEADLESS ? 'ignore' : 'inherit',
    shell: !isWin ? false : undefined, // Windows spawn with shell:true has detach issues
    detached: !isWin ? true : false,   // Unix truly detach; Windows uses Start-Process above
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
};

// ------ 服务确保函数 ------

/** 拉起 engine-go 并等待健康 */
async function ensureEngineGo() {
  if (await waitServiceHealthy(ENGINE_HEALTH_URL, 2_000)) {
    console.log('[dev] Go 引擎已就绪');
    return;
  }
  console.log('[dev] 启动 Go 计算引擎 (engine-go:5004)…');
  try {
    execSync(`${composeCmd} compose -p backtest up -d engine-go`, { stdio: 'inherit', env, shell: isWin });
  } catch (err) {
    console.warn('[dev] docker compose up engine-go 失败:', err.message);
    spawnLocalService('engine-go', ['./cmd/server'], 'engine-go:5004');
  }
  if (await waitServiceHealthy(ENGINE_HEALTH_URL, 30_000)) {
    console.log('[dev] Go 引擎已就绪');
  } else {
    console.warn('[dev] Go 引擎 30s 内未就绪，回测将返回 ENGINE_UNAVAILABLE');
  }
}

/** 拉起 data-fetcher（后台，不阻塞主流程） */
function ensureDataFetcher() {
  waitServiceHealthy(DATA_FETCHER_HEALTH_URL, 2_000).then((ok) => {
    if (ok) { console.log('[dev] Go 数据服务已就绪'); return; }
    console.log('[dev] 后台启动 Go 数据服务 (data-fetcher:5003)…');
    const child = spawn(composeCmd, ['compose', '-p', 'backtest', 'up', '-d', 'data-fetcher'], {
      stdio: 'inherit',
      env,
      shell: isWin,
      detached: true,
    });
    child.unref();
    child.on('error', (err) => {
      console.warn('[dev] docker compose up data-fetcher 失败:', err.message);
      spawnLocalService('data-fetcher', ['.'], 'data-fetcher:5003');
    });
  });
}

// ====== 主流程 ======

// 1. 日志目录
if (HEADLESS) {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  console.log(`[dev] 日志目录: ${LOG_DIR}/`);
}

// 2. Go 引擎（先启动，阻塞等待）
await ensureEngineGo();
// 3. Data-fetcher（后台启动，不阻塞主流程 — 不可用时 API 会降级到 DB）
ensureDataFetcher();

// 4. 首次构建
if (!existsSync('dist/index.html')) {
  console.log('[dev] 首次启动：构建前端产物（约 30–60s，仅一次）…');
  execSync(`${npxCmd} vite build`, { stdio: 'inherit', env, shell: isWin });
}

// 5. 找空闲端口
const preferredPort = parseInt(process.env.API_PORT || process.env.PORT || '5001', 10);
const port = await findFreePort(preferredPort);
const portSuffix = port !== preferredPort ? `（${preferredPort} 已被占，改用 ${port}）` : '';

// 6. 启动 Vite watch（前端热构建）
logTo('dev', '启动 Vite watch…');
startProcess(npxCmd, ['vite', 'build', '--watch'], { env, tag: 'vite-watch' });

// 7. 启动 API 服务器（SERVER_STATIC=true 同时服务前端 dist/）
// 使用 node --import tsx-loader 而非 npx tsx，避免 detached 模式下 npx 子进程被回收
logTo('dev', `启动 API 服务器 (port ${port})…`);
startProcess(nodeCmd, ['--import', tsxLoaderUrl, 'packages/backend/src/server.ts'], {
  env: { ...env, PORT: String(port) },
  tag: 'server',
});

// 8. 输出访问地址
const url = `http://localhost:${port}/`;
console.log('');
console.log('══════════════════════════════════════════════');
console.log(`  ✅ 后端 + 前端已无头启动${portSuffix}`);
console.log(`  🔗  ${url}`);
if (HEADLESS) {
  console.log(`  📋 日志: ${LOG_DIR}/`);
  console.log(`  ℹ️   前台模式: npm run dev -- --interactive`);
} else {
  console.log('[dev] 前台模式：按 Ctrl+C 停止所有服务');
}
console.log('══════════════════════════════════════════════');
