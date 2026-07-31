import { reportPerformance } from './errorReporter.js';
import { onLCP, onCLS, onINP, onFCP, onTTFB } from 'web-vitals';
const apiTimers = new WeakMap<Promise<Response>, number>();
export function trackApiCall(fetchPromise: Promise<Response>, url: string, method: string): void {
  const start = performance.now();
  apiTimers.set(fetchPromise, start);
  fetchPromise
    .then((res) => {
      const duration = performance.now() - start;
      const endpoint = (typeof url === 'string' ? url : String(url)).split('?')[0];
      reportPerformance('api_timing', {
        endpoint: endpoint.slice(0, 256),
        value: Math.round(duration * 100) / 100,
        statusCode: res.status,
        method,
      });
    })
    .catch(() => {
      const duration = performance.now() - start;
      const endpoint = (typeof url === 'string' ? url : String(url)).split('?')[0];
      reportPerformance('api_timing', {
        endpoint: endpoint.slice(0, 256),
        value: Math.round(duration * 100) / 100,
        statusCode: 0,
        method,
      });
    });
}
let lastNavStart = 0;
export function onNavStart(): void {
  lastNavStart = performance.now();
}
export function onNavEnd(route: string): void {
  if (lastNavStart > 0) {
    const duration = performance.now() - lastNavStart;
    reportPerformance('navigation', {
      route: route.slice(0, 256),
      value: Math.round(duration * 100) / 100,
    });
    lastNavStart = 0;
  }
}
export function reportPageLoadTiming(): void {
  if (!performance.timing && !PerformanceNavigationTiming) return;
  try {
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (navEntries.length > 0) {
      const nav = navEntries[0];
      reportPerformance('page_timing', {
        metric: 'ttfb',
        value: Math.round(nav.responseStart - nav.requestStart),
      });
      reportPerformance('page_timing', {
        metric: 'fcp',
        value: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      });
      reportPerformance('page_timing', {
        metric: 'dom_ready',
        value: Math.round(nav.domComplete - nav.startTime),
      });
      reportPerformance('page_timing', {
        metric: 'load',
        value: Math.round(nav.loadEventEnd - nav.startTime),
      });
    }
  } catch {
    // 环境不支持导航时序时静默跳过
  }
}
interface PerformanceSample {
  type: string;
  value: number;
  metric?: string;
  timestamp: number;
}
const sampleBuffer: PerformanceSample[] = [];
const FLUSH_INTERVAL_MS = 30_000;
let flushTimer: ReturnType<typeof setInterval> | null = null;
export function addSample(type: string, value: number, metric?: string): void {
  sampleBuffer.push({ type, value, metric, timestamp: Date.now() });
  if (sampleBuffer.length > 100) {
    sampleBuffer.splice(0, 50);
  }
}
export function startPerformanceMonitoring(): void {
  if (flushTimer) return;
  flushTimer = window.setInterval(() => {
    sampleBuffer.length = 0;
  }, FLUSH_INTERVAL_MS);
}
export function initVitalsReporting(): void {
  onLCP((metric) => {
    reportPerformance('vital', { metric: 'lcp', value: Math.round(metric.value) });
    addSample('vital', metric.value, 'lcp');
  });
  onCLS((metric) => {
    reportPerformance('vital', { metric: 'cls', value: metric.value });
    addSample('vital', metric.value, 'cls');
  });
  onINP((metric) => {
    reportPerformance('vital', { metric: 'inp', value: Math.round(metric.value) });
    addSample('vital', metric.value, 'inp');
  });
  onFCP((metric) => {
    reportPerformance('vital', { metric: 'fcp', value: Math.round(metric.value) });
    addSample('vital', metric.value, 'fcp');
  });
  onTTFB((metric) => {
    reportPerformance('vital', { metric: 'ttfb', value: Math.round(metric.value) });
    addSample('vital', metric.value, 'ttfb');
  });
}
