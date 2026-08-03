import { reportPerformance } from './errorReporter.js';
import { onLCP, onCLS, onINP, onFCP, onTTFB } from 'web-vitals';

const apiTimers = new WeakMap<Promise<Response>, number>();

export function trackApiCall(fetchPromise: Promise<Response>, url: string, method: string): void {
  const start = performance.now();
  apiTimers.set(fetchPromise, start);
  const report = (statusCode: number) => {
    const endpoint = String(url).split('?')[0].slice(0, 256);
    reportPerformance('api_timing', {
      endpoint,
      value: Math.round((performance.now() - start) * 100) / 100,
      statusCode,
      method,
    });
  };
  fetchPromise.then((res) => report(res.status)).catch(() => report(0));
}

let lastNavStart = 0;
export function onNavStart(): void {
  lastNavStart = performance.now();
}
export function onNavEnd(route: string): void {
  if (lastNavStart <= 0) return;
  reportPerformance('navigation', {
    route: route.slice(0, 256),
    value: Math.round((performance.now() - lastNavStart) * 100) / 100,
  });
  lastNavStart = 0;
}

export function reportPageLoadTiming(): void {
  try {
    const nav = (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])[0];
    if (!nav) return;
    for (const [metric, fn] of [
      ['ttfb', () => nav.responseStart - nav.requestStart],
      ['fcp', () => nav.domContentLoadedEventEnd - nav.startTime],
      ['dom_ready', () => nav.domComplete - nav.startTime],
      ['load', () => nav.loadEventEnd - nav.startTime],
    ] as const) {
      reportPerformance('page_timing', { metric, value: Math.round(fn()) });
    }
  } catch {
    /* performance API not available */
  }
}

export function initVitalsReporting(): void {
  for (const [metric, fn, round] of [
    ['lcp', onLCP, true],
    ['cls', onCLS, false],
    ['inp', onINP, true],
    ['fcp', onFCP, true],
    ['ttfb', onTTFB, true],
  ] as const) {
    fn((m) => {
      const value = round ? Math.round(m.value) : m.value;
      reportPerformance('vital', { metric, value });
    });
  }
}
