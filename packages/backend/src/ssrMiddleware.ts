import { type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { RT_COOKIE } from './middleware/jwtAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const SSR_DIST = path.resolve(PROJECT_ROOT, 'dist-ssr');
const FRONTEND_DIST = config.FRONTEND_DIST_DIR;
const SSR_RENDER_TIMEOUT_MS = 10_000;

let cssContent: string | null = null;
try {
  const cssFiles = fs
    .readdirSync(path.resolve(FRONTEND_DIST, 'assets'))
    .filter((f) => f.startsWith('style-') && f.endsWith('.css'));
  if (cssFiles.length > 0) {
    cssContent = fs.readFileSync(path.resolve(FRONTEND_DIST, 'assets', cssFiles[0]), 'utf-8');
    logger.info(`[ssr] 内联 CSS: ${cssFiles[0]} (${(cssContent.length / 1024).toFixed(1)} KB)`);
  }
} catch {
  /* 构建产物没有 CSS 文件时忽略 */
}

let metaCache: string | null = null;
async function prefetchMeta(): Promise<void> {
  try {
    const resp = await fetch(`http://127.0.0.1:${config.API_PORT}/api/v1/data/meta`, {
      signal: AbortSignal.timeout(2000),
      headers: { Accept: 'application/json' },
    });
    if (resp.ok) {
      const json = await resp.json();
      metaCache = JSON.stringify(json);
    }
  } catch {
    logger.warn('[ssr] meta 数据预取失败（服务未就绪）');
  }
}
prefetchMeta().catch(() => {});

interface PipeableStream {
  pipe: <T extends NodeJS.WritableStream>(destination: T) => T;
  abort: (reason?: unknown) => void;
  on: (event: 'error', listener: (err: Error) => void) => void;
}

type RenderFn = (url: string, nonce: string) => PipeableStream | Promise<PipeableStream>;

let renderFn: RenderFn | null = null;
let htmlTemplate: { head: string; tail: string } | null = null;

const ssrCache = new Map<string, { html: string; ts: number }>();
const CACHE_TTL = 60_000;
const CACHE_MAX = 20;
function getCached(key: string): string | null {
  const entry = ssrCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.html;
  ssrCache.delete(key);
  return null;
}
function setCache(key: string, html: string): void {
  if (ssrCache.size >= CACHE_MAX) {
    const oldest = ssrCache.keys().next().value;
    if (oldest) ssrCache.delete(oldest);
  }
  ssrCache.set(key, { html, ts: Date.now() });
}

function loadHtmlTemplate(): { head: string; tail: string } | null {
  try {
    const html = fs.readFileSync(path.resolve(FRONTEND_DIST, 'index.html'), 'utf-8');
    const marker = '<!--ssr-outlet-->';
    const idx = html.indexOf(marker);
    if (idx === -1) {
      const divIdx = html.indexOf('<div id="root">');
      if (divIdx === -1) return null;
      return {
        head: html.slice(0, divIdx + '<div id="root">'.length),
        tail: html.slice(divIdx + '<div id="root">'.length),
      };
    }
    return {
      head: html.slice(0, idx),
      tail: html.slice(idx + marker.length),
    };
  } catch (err) {
    logger.warn({ err }, '[ssr] 无法读取 index.html 模板');
    return null;
  }
}

async function loadSsrRenderFn(): Promise<RenderFn | null> {
  try {
    const mod = await import(pathToFileURL(path.resolve(SSR_DIST, 'entry-server.js')).href);
    return mod.render;
  } catch (err) {
    logger.warn({ err }, '[ssr] SSR 渲染函数加载失败，降级为 SPA 模式');
    return null;
  }
}

function buildSsrHead(templateHead: string, nonce: string): string {
  let head = templateHead;

  if (cssContent) {
    head = head.replace(
      /<link rel="stylesheet"[^>]*\/assets\/style-[^"]*\.css[^>]*>/,
      `<style>${cssContent}</style>`,
    );
  }

  const entryScript = templateHead.match(/<script[^>]*src="\/assets\/index-[^"]*\.js"[^>]*>/);
  if (entryScript) {
    head = head.replace(
      entryScript[0],
      entryScript[0].replace('></script>', ' fetchpriority="high"></script>'),
    );
  }

  const KEY_PAGES = [
    'MonteCarloPage',
    'OptimizerPage',
    'AboutPage',
    'AnalysisPage',
    'PricingPage',
    'TacticalPage',
    'HelpPage',
    'LoginPage',
  ];
  try {
    const assets = fs.readdirSync(path.resolve(FRONTEND_DIST, 'assets'));
    const allPages = assets.filter((f) =>
      /^(MonteCarlo|Optimizer|Analysis|About|Pricing|Login|BacktestOptimizer|SignalAnalyzer|TacticalPage|DataEngine|EfficientFrontier|Calculators|FactorRegression|PCAPage|LETFSlippage|GoalOptimizer|RebalancingSensitivity|LumpSumVsDCA|TacticalGrid|DualSignal|MultiSignal|AdminDashboard|SystemMonitor|DataManagement|SystemSettings|ChartBenchmark)Page-.*\.js$/.test(
        f,
      ),
    );
    const preloadLinks = allPages
      .map((f) => {
        const isKey = KEY_PAGES.some((k) => f.startsWith(k));
        return `<link rel="${isKey ? 'modulepreload' : 'prefetch'}" href="/assets/${f}" crossorigin>`;
      })
      .join('\n    ');
    const vendorPrefetch = assets
      .filter((f) =>
        /^(YAxis|generateCategoricalChart|shared-utils|util-vendor|i18n-vendor|icon-vendor|ui-vendor|state-vendor|react-router|react-dom-client)-.*\.js$/.test(
          f,
        ),
      )
      .map((f) => `<link rel="prefetch" href="/assets/${f}" crossorigin>`)
      .join('\n    ');
    head = head.replace('</head>', `    ${preloadLinks}\n    ${vendorPrefetch}\n  </head>`);
  } catch {
    /* 构建产物读取失败时跳过 */
  }

  if (metaCache) {
    head = head.replace(
      '</head>',
      `    <script nonce="${nonce}">window.__INITIAL_DATA__=${metaCache}</script>\n  </head>`,
    );
  }
  return head;
}

async function withRenderTimeout<T>(p: T | Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('SSR render timeout')), SSR_RENDER_TIMEOUT_MS);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function ssrMiddleware(req: Request, res: Response): Promise<void> {
  if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return;
  res.setHeader('Cache-Control', 'no-cache');

  const startTotal = performance.now();
  const url = req.originalUrl || req.url;

  const cached = getCached(url);
  if (cached) {
    const cachedMs = Math.round(performance.now() - startTotal);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Server-Timing', `cache;dur=${cachedMs}`);
    res.send(cached);
    return;
  }

  if (!renderFn) renderFn = await loadSsrRenderFn();
  if (!htmlTemplate) htmlTemplate = loadHtmlTemplate();

  if (!renderFn || !htmlTemplate) {
    res.sendFile(FRONTEND_DIST + '/index.html');
    return;
  }

  try {
    const t0 = performance.now();
    const nonce = res.locals.nonce ?? randomBytes(16).toString('base64');
    const stream = await withRenderTimeout(renderFn(url, nonce));
    const renderMs = Math.round(performance.now() - t0);

    const head = buildSsrHead(htmlTemplate.head, nonce);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Rendered-By', 'ssr');
    res.setHeader('Server-Timing', `render;dur=${renderMs}`);
    res.setHeader('X-Cache', 'MISS');
    res.write(head);

    let tail = htmlTemplate.tail;
    tail = tail.replace(
      /(<script[^>]*src="[^"]*index-[^"]*\.js"[^>]*)>/g,
      '$1 fetchpriority="high">',
    );

    let body = head;
    const passThrough = new PassThrough();
    passThrough.pipe(res, { end: false });
    // 渲染流异常若不监听会触发 unhandled 'error' 崩溃进程；响应头已发出，只能截断收尾
    const abortStream = (err: Error) => {
      logger.error({ err, url: req.url }, '[ssr] 渲染流错误，终止响应');
      res.end();
    };
    passThrough.on('error', abortStream);
    stream.on('error', abortStream);
    passThrough.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    passThrough.on('end', () => {
      body += tail;
      res.end(tail);
      if (!req.headers.authorization && !req.cookies?.[RT_COOKIE]) {
        setCache(url, body);
      }
    });

    stream.pipe(passThrough);
  } catch (err) {
    logger.error({ err, url: req.url }, '[ssr] SSR 渲染失败，降级到 SPA');
    res.sendFile(FRONTEND_DIST + '/index.html');
  }
}
