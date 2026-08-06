#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const screenshotDir = resolve(ROOT, 'docs/audit/screenshots');
mkdirSync(screenshotDir, { recursive: true });

const PAGES = [
  { slug: 'backtest', path: '/' },
  { slug: 'analysis', path: '/analysis' },
  { slug: 'monte-carlo', path: '/monte-carlo' },
  { slug: 'optimizer', path: '/optimizer' },
  { slug: 'efficient-frontier', path: '/efficient-frontier' },
  { slug: 'tactical', path: '/tactical' },
  { slug: 'tactical-grid', path: '/tactical-grid' },
  { slug: 'signal', path: '/signal-analyzer' },
  { slug: 'dual-signal', path: '/dual-signal' },
  { slug: 'multi-signal', path: '/multi-signal' },
  { slug: 'pca', path: '/pca' },
  { slug: 'letf', path: '/letf-slippage' },
  { slug: 'factor-regression', path: '/factor-regression' },
  { slug: 'goal-optimizer', path: '/goal-optimizer' },
  { slug: 'calculators', path: '/calculators' },
  { slug: 'lumpsum-dca', path: '/lumpsum-vs-dca' },
  { slug: 'rebalancing', path: '/rebalancing-sensitivity' },
  { slug: 'data-engine', path: '/data-engine' },
  { slug: 'about', path: '/about' },
  { slug: 'help', path: '/help' },
  { slug: 'pricing', path: '/pricing' },
];

const BASE = process.env.BASE_URL ?? 'http://localhost:15173';

const browser = await chromium.launch();
const results = [];

for (const page of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  try {
    await p.goto(`${BASE}${page.path}`, { waitUntil: 'networkidle', timeout: 15000 });
    await p.waitForTimeout(1500);

    const audit = await p.evaluate(() => {
      const h1s = Array.from(document.querySelectorAll('h1'));

      const allText = Array.from(document.querySelectorAll('*'))
        .filter((el) => el.children.length === 0)
        .map((el) => (el.textContent ?? '').trim())
        .filter(Boolean);
      const i18nLeaked = allText.filter(
        (t) =>
          /^(common|portfolio|nav|backtest|analysis|montecarlo|optimizer|tactical|signal|hero|footer|action|params|results|chart|table|drawdown|stats|auth|billing|admin)\.[a-zA-Z]/.test(
            t,
          ) && t.length < 80,
      );

      const nanTexts = allText.filter((t) => /\bNaN\b|\bundefined\b|\bnull\b/.test(t) && !t.includes('http'));

      const emptyRegions = [];
      const scrollHeight = document.documentElement.scrollHeight;
      const step = 50;
      let lastContentY = 0;
      for (let y = 0; y < scrollHeight; y += step) {
        const el = document.elementFromPoint(window.innerWidth / 2, y);
        const hasContent =
          el &&
          el.textContent &&
          el.textContent.trim().length > 0 &&
          el.tagName !== 'HTML' &&
          el.tagName !== 'BODY' &&
          el.tagName !== 'MAIN' &&
          el.tagName !== 'SECTION' &&
          el.tagName !== 'DIV';
        if (hasContent) {
          if (y - lastContentY > 200) {
            emptyRegions.push({ start: lastContentY, end: y, height: y - lastContentY });
          }
          lastContentY = y;
        }
      }

      const titleTexts = h1s.map((h) => (h.textContent ?? '').trim());
      const duplicateH1 = titleTexts.length > 1 && new Set(titleTexts).size < titleTexts.length;

      const cards = document.querySelectorAll('[class*="rounded-xl"][class*="border"]');
      let nestedCardCount = 0;
      cards.forEach((card) => {
        const inner = card.querySelectorAll('[class*="rounded-xl"][class*="border"]');
        if (inner.length > 0) nestedCardCount++;
      });

      return {
        url: location.pathname,
        h1Count: h1s.length,
        h1Texts: titleTexts,
        duplicateH1,
        i18nLeakedCount: i18nLeaked.length,
        i18nLeakedSample: i18nLeaked.slice(0, 10),
        nanTextCount: nanTexts.length,
        nanTextSample: nanTexts.slice(0, 5),
        emptyRegionCount: emptyRegions.length,
        largestEmptyRegion: emptyRegions.reduce((max, r) => Math.max(max, r.height), 0),
        nestedCardCount,
        scrollHeight,
      };
    });

    await p.screenshot({
      path: `${screenshotDir}/p0-0-4-${page.slug}.png`,
      fullPage: true,
    });

    results.push({ ...page, ...audit, status: 'OK' });
  } catch (e) {
    results.push({ ...page, status: 'ERROR', error: e instanceof Error ? e.message : String(e) });
  } finally {
    await ctx.close();
  }
}

await browser.close();

const summary = {
  timestamp: new Date().toISOString(),
  totalPages: PAGES.length,
  pagesWithDuplicateH1: results.filter((r) => r.duplicateH1).length,
  pagesWithI18nLeak: results.filter((r) => (r.i18nLeakedCount ?? 0) > 0).length,
  pagesWithNaN: results.filter((r) => (r.nanTextCount ?? 0) > 0).length,
  pagesWithLargeEmptySpace: results.filter((r) => (r.largestEmptyRegion ?? 0) > 300).length,
  pagesWithNestedCard: results.filter((r) => (r.nestedCardCount ?? 0) > 0).length,
  details: results,
};

console.log(JSON.stringify(summary, null, 2));

const reportPath = resolve(ROOT, 'docs/audit/reports/p0-0-4-baseline.json');
writeFileSync(reportPath, JSON.stringify(summary, null, 2));
