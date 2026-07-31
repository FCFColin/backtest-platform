import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.js';
import AppShell from './AppShell.js';
import i18n from './i18n/index.js';
import './i18n';
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}
if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
const ANALYSIS_PREFIXES = [
  '/monte-carlo',
  '/optimizer',
  '/analysis',
  '/efficient-frontier',
  '/data-engine',
  '/rebalancing',
  '/lumpsum',
  '/factor-regression',
  '/calculators',
  '/tactical',
  '/backtest-optimizer',
  '/pca',
  '/signal',
  '/letf',
  '/goal-optimizer',
  '/portfolio-comparison',
  '/prototype',
];
const PREFIX_NS: ReadonlyArray<readonly [readonly string[], string]> = [
  [['/about', '/contact', '/help', '/changelog', '/pricing', '/limits', '/upgrade'], 'pages'],
  [['/login', '/signup', '/verify', '/accept'], 'auth'],
  [['/legal'], 'legal'],
  [['/account', '/org', '/billing'], 'account'],
  [['/admin'], 'admin'],
];
function nsForUrl(url: string): string {
  if (url === '/' || url.startsWith('/?')) return 'backtest';
  if (ANALYSIS_PREFIXES.some((p) => url.startsWith(p))) return 'analysis';
  for (const [prefixes, ns] of PREFIX_NS) {
    if (prefixes.some((p) => url.startsWith(p))) return ns;
  }
  return 'common';
}
export async function render(url: string) {
  const ns = nsForUrl(url);
  if (ns !== 'common' && !i18n.hasResourceBundle(i18n.language, ns)) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const urlMod = await import('node:url');
      const __dirname = urlMod.fileURLToPath(import.meta.url);
      const dir = path.default.dirname(__dirname);
      const localePath = path.default.resolve(dir, `./locales/${i18n.language}/${ns}.json`);
      if (fs.default.existsSync(localePath)) {
        const data = JSON.parse(fs.default.readFileSync(localePath, 'utf-8'));
        i18n.addResourceBundle(i18n.language, ns, data, true, true);
      }
    } catch {
      // SSR 时区文件缺失则跳过命名空间加载
    }
  }
  return renderToPipeableStream(
    <StaticRouter location={url}>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
    </StaticRouter>,
  );
}
