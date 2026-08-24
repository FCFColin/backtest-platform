import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import ErrorBoundary from './components/errorBoundaries.js';
import AppShell from './AppShell.js';
import './i18n/index.js';
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
export async function render(url: string, nonce: string) {
  return renderToPipeableStream(
    <StaticRouter location={url}>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
    </StaticRouter>,
    {
      nonce,
      // 服务端渲染错误必须可见：静默丢失会让流既无输出也无终止信号。
      // 本模块仅在服务端执行，console 直达后端进程 stdout（no-console 仅此处豁免）
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error('[ssr] render error:', err);
      },
    },
  );
}
