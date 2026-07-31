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
    key: (i: number) => Object.keys(store)[i] ?? null
  };
}
if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = () => ({ matches: false, media: '', onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false });
}
function nsForUrl(url: string): string {
  if (url === '/' || url.startsWith('/?')) return 'backtest';
  if (
    url.startsWith('/monte-carlo') ||
    url.startsWith('/optimizer') ||
    url.startsWith('/analysis') ||
    url.startsWith('/efficient-frontier') ||
    url.startsWith('/data-engine') ||
    url.startsWith('/rebalancing') ||
    url.startsWith('/lumpsum') ||
    url.startsWith('/factor-regression') ||
    url.startsWith('/calculators') ||
    url.startsWith('/tactical') ||
    url.startsWith('/backtest-optimizer') ||
    url.startsWith('/pca') ||
    url.startsWith('/signal') ||
    url.startsWith('/letf') ||
    url.startsWith('/goal-optimizer') ||
    url.startsWith('/portfolio-comparison') ||
    url.startsWith('/swr') ||
    url.startsWith('/tvm') ||
    url.startsWith('/workspace') ||
    url.startsWith('/prototype')
  )
    return 'analysis';
  if (url.startsWith('/about') || url.startsWith('/contact') || url.startsWith('/help') || url.startsWith('/changelog') || url.startsWith('/pricing') || url.startsWith('/limits') || url.startsWith('/upgrade')) return 'pages';
  if (url.startsWith('/login') || url.startsWith('/signup') || url.startsWith('/verify') || url.startsWith('/accept')) return 'auth';
  if (url.startsWith('/legal')) return 'legal';
  if (url.startsWith('/account') || url.startsWith('/org') || url.startsWith('/billing')) return 'account';
  if (url.startsWith('/admin')) return 'admin';
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
    } catch {}
  }
  return renderToPipeableStream(
    <StaticRouter location={url}>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
    </StaticRouter>
  );
}
