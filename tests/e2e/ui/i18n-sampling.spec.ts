import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROUTES = [
  '/',
  '/analysis',
  '/monte-carlo',
  '/optimizer',
  '/efficient-frontier',
  '/data-engine',
  '/rebalancing-sensitivity',
  '/lumpsum-vs-dca',
  '/factor-regression',
  '/calculators',
  '/tactical',
  '/tactical-grid',
  '/backtest-optimizer',
  '/pca',
  '/signal-analyzer',
  '/dual-signal',
  '/multi-signal',
  '/letf-slippage',
  '/goal-optimizer',
  '/about',
  '/contact',
  '/help',
  '/changelog',
  '/pricing',
  '/limits',
  '/upgrade',
  '/login',
  '/signup',
  '/verify-email',
  '/legal/terms',
];

test('i18n 运行时键采样（D-5b）', async ({ page }) => {
  const byRoute: Record<string, string[]> = {};
  for (const r of ROUTES) {
    try {
      await page.goto(`http://localhost:${process.env.API_PORT ?? 15001}${r}`, {
        waitUntil: 'networkidle',
        timeout: 15_000,
      });
      await page.waitForTimeout(500);
    } catch {
      byRoute[r] = ['__NAV_FAIL__'];
      continue;
    }
    const keys = await page.evaluate(() =>
      Array.from((globalThis as unknown as { __i18nUsedKeys?: Set<string> }).__i18nUsedKeys ?? []),
    );
    byRoute[r] = keys;
  }
  const outDir = path.resolve(process.cwd(), 'docs/audit/reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'i18n-used-keys-runtime.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), byRoute }, null, 2),
  );
});
