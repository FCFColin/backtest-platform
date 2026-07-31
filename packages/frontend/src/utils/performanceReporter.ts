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
        method
      });
    })
    .catch(() => {
      const duration = performance.now() - start;
      const endpoint = (typeof url === 'string' ? url : String(url)).split('?')[0];
      reportPerformance('api_timing', {
        endpoint: endpoint.slice(0, 256),
        value: Math.round(duration * 100) / 100,
        statusCode: 0,
        method
      });
    });
}
export function onComponentRender(id: string, phase: 'mount' | 'update', actualDuration: number): void {
  if (actualDuration > 16) {
    reportPerformance('component_render', {
      component: id,
      phase,
      value: Math.round(actualDuration * 100) / 100
    });
  }
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
      value: Math.round(duration * 100) / 100
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
      reportPerformance('page_timing', { metric: 'ttfb', value: Math.round(nav.responseStart - nav.requestStart) });
      reportPerformance('page_timing', { metric: 'fcp', value: Math.round(nav.domContentLoadedEventEnd - nav.startTime) });
      reportPerformance('page_timing', { metric: 'dom_ready', value: Math.round(nav.domComplete - nav.startTime) });
      reportPerformance('page_timing', { metric: 'load', value: Math.round(nav.loadEventEnd - nav.startTime) });
    }
  } catch {}
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
export function getSampleSummary(): Record<string, { count: number; avg: number; p50: number; p95: number }> {
  const groups: Record<string, number[]> = {};
  for (const s of sampleBuffer) {
    const key = s.metric ? `${s.type}:${s.metric}` : s.type;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s.value);
  }
  const summary: Record<string, { count: number; avg: number; p50: number; p95: number }> = {};
  for (const [key, vals] of Object.entries(groups)) {
    const sorted = [...vals].sort((a, b) => a - b);
    summary[key] = {
      count: vals.length,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0
    };
  }
  return summary;
}
export function startPerformanceMonitoring(): void {
  if (flushTimer) return;
  flushTimer = window.setInterval(() => {
    sampleBuffer.length = 0;
  }, FLUSH_INTERVAL_MS);
}
export function stopPerformanceMonitoring(): void {
  if (flushTimer) {
    window.clearInterval(flushTimer);
    flushTimer = null;
  }
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
