import { type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const SSR_DIST = path.resolve(PROJECT_ROOT, 'dist-ssr');
const FRONTEND_DIST = config.FRONTEND_DIST_DIR;

// 预加载关键 CSS 内容 → 内联到 HTML 消除渲染阻塞
let cssContent: string | null = null;
try {
  const cssFiles = fs.readdirSync(path.resolve(FRONTEND_DIST, 'assets')).filter(f => f.startsWith('style-') && f.endsWith('.css'));
  if (cssFiles.length > 0) {
    cssContent = fs.readFileSync(path.resolve(FRONTEND_DIST, 'assets', cssFiles[0]), 'utf-8');
    logger.info(`[ssr] 内联 CSS: ${cssFiles[0]} (${(cssContent.length / 1024).toFixed(1)} KB)`);
  }
} catch { /* 构建产物没有 CSS 文件时忽略 */ }

// 预加载关键 API 数据（服务端缓存热，避免客户端重复 fetch）
let metaCache: string | null = null;
async function prefetchMeta(): Promise<void> {
  try {
    const resp = await fetch(`${config.GO_ENGINE_URL || 'http://localhost:5004'}/api/v1/data/meta`, {
      signal: AbortSignal.timeout(2000),
      headers: { 'Accept': 'application/json' },
    });
    if (resp.ok) {
      const json = await resp.json();
      metaCache = JSON.stringify(json);
    }
  } catch {
    logger.warn('[ssr] meta 数据预取失败（服务未就绪）');
  }
}
// 尝试预取但不等它完成（由渲染流程决定是否使用缓存值）
prefetchMeta().catch(() => {});

interface PipeableStream {
  pipe: <T extends NodeJS.WritableStream>(destination: T) => T;
  abort: (reason?: unknown) => void;
}

type RenderFn = (url: string) => PipeableStream | Promise<PipeableStream>;

let renderFn: RenderFn | null = null;
let htmlTemplate: { head: string; tail: string } | null = null;

// SSR 输出缓存（5 秒 TTL，LRU 淘汰）
const ssrCache = new Map<string, { html: string; ts: number }>();
const CACHE_TTL = 5_000;
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
/** 清除 SSR 缓存（warmMetaCache 触发时调用） */
export function clearSsrCache(): void {
  ssrCache.clear();
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

export async function ssrMiddleware(req: Request, res: Response): Promise<void> {
  if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return;

  const startTotal = performance.now();
  const url = req.originalUrl || req.url;

  // SSR 输出缓存命中
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
    const stream = await renderFn(url);
    const renderMs = Math.round(performance.now() - t0);

    // 构建 HTML head：内联 CSS + modulepreload + meta 数据
    let head = htmlTemplate.head;

    // 替换 CSS link 为内联 style（消除渲染阻塞）
    if (cssContent) {
      head = head.replace(
        /<link rel="stylesheet"[^>]*\/assets\/style-[^"]*\.css[^>]*>/,
        `<style>${cssContent}</style>`,
      );
    }

    // 主 entry script 加 fetchpriority=high，让浏览器优先下载关键 JS
    const entryScript = htmlTemplate.head.match(/<script[^>]*src="\/assets\/index-[^"]*\.js"[^>]*>/);
    if (entryScript) {
      head = head.replace(
        entryScript[0],
        entryScript[0].replace('></script>', ' fetchpriority="high"></script>'),
      );
    }

    // 按优先级预加载：导航栏页面用 modulepreload（高优先级，关键路径），其余用 prefetch（空闲时）
    const KEY_PAGES = ['MonteCarloPage', 'OptimizerPage', 'AboutPage', 'AnalysisPage', 'PricingPage', 'TacticalPage', 'HelpPage', 'LoginPage'];
    try {
      const assets = fs.readdirSync(path.resolve(FRONTEND_DIST, 'assets'));
      const allPages = assets.filter(f => /^(MonteCarlo|Optimizer|Analysis|About|Pricing|Login|BacktestOptimizer|SignalAnalyzer|TacticalPage|DataEngine|EfficientFrontier|Calculators|FactorRegression|PCAPage|LETFSlippage|GoalOptimizer|RebalancingSensitivity|LumpSumVsDCA|TacticalGrid|DualSignal|MultiSignal|AdminDashboard|SystemMonitor|DataManagement|SystemSettings|ChartBenchmark)Page-.*\.js$/.test(f));
      const preloadLinks = allPages.map(f => {
        const isKey = KEY_PAGES.some(k => f.startsWith(k));
        return `<link rel="${isKey ? 'modulepreload' : 'prefetch'}" href="/assets/${f}" crossorigin>`;
      }).join('\n    ');
      head = head.replace('</head>', `    ${preloadLinks}\n  </head>`);
    } catch { /* 构建产物读取失败时跳过 */ }

    // 注入服务端预取数据（避免客户端重复 fetch）
    if (metaCache) {
      head = head.replace('</head>',
        `    <script>window.__INITIAL_DATA__=${metaCache}</script>\n  </head>`);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Rendered-By', 'ssr');
    res.write(head);

    // 给主 entry script 加 fetchpriority="high" 提升关键 JS 下载优先级
    let tail = htmlTemplate.tail;
    tail = tail.replace(/(<script[^>]*src="[^"]*index-[^"]*\.js"[^>]*)>/g, '$1 fetchpriority="high">');

    const totalMs = Math.round(performance.now() - startTotal);
    res.setHeader('Server-Timing', `render;dur=${renderMs}, total;dur=${totalMs}`);
    res.setHeader('X-Cache', 'MISS');

    let body = head;
    const passThrough = new PassThrough();
    passThrough.pipe(res, { end: false });
    passThrough.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    passThrough.on('end', () => {
      body += tail;
      res.end(tail);
      // 5 秒缓存，仅缓存匿名首页请求
      if (!req.headers.authorization && !req.headers.cookie?.includes('refreshToken')) {
        setCache(url, body);
      }
    });

    stream.pipe(passThrough);
  } catch (err) {
    logger.error({ err, url: req.url }, '[ssr] SSR 渲染失败，降级到 SPA');
    res.sendFile(FRONTEND_DIST + '/index.html');
  }
}