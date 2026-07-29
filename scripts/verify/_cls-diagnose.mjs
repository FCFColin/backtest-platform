// scripts/verify/_cls-diagnose.mjs
// 诊断脚本：用 Playwright 测量首页 CLS 并逐元素归因。Playwright 后备方案。
import { chromium } from '@playwright/test';
const BASE = 'http://localhost:15173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const page = await context.newPage();
await page.addInitScript(() => {
  window.__clsEntries = [];
  window.__clsTotal = 0;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__clsTotal += entry.value;
        const sources = (entry.sources || []).map((s) => ({
          node: s.node ? { tag: s.node.tagName, id: s.node.id || null, cls: s.node.className || null, text: (s.node.textContent || '').trim().slice(0, 60) } : null,
          prev: s.previousRect ? { x: s.previousRect.x, y: s.previousRect.y, w: s.previousRect.width, h: s.previousRect.height } : null,
          curr: s.currentRect ? { x: s.currentRect.x, y: s.currentRect.y, w: s.currentRect.width, h: s.currentRect.height } : null,
        }));
        window.__clsEntries.push({ value: entry.value, startTime: entry.startTime, sources });
      }
    });
    po.observe({ type: 'layout-shift', buffered: true });
  } catch (e) { window.__clsError = String(e); }
});
await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);
const report = await page.evaluate(() => ({
  clsTotal: Math.round((window.__clsTotal || 0) * 10000) / 10000,
  entryCount: (window.__clsEntries || []).length,
  entries: (window.__clsEntries || []).slice().sort((a, b) => b.value - a.value).slice(0, 8).map((e) => ({ value: Math.round(e.value * 10000) / 10000, startTime: Math.round(e.startTime), topSource: e.sources[0] || null, sourceCount: e.sources.length })),
  clsError: window.__clsError || null,
  bodyHeight: document.body.scrollHeight,
  viewportHeight: window.innerHeight,
}));
console.log(JSON.stringify(report, null, 2));
await browser.close();
