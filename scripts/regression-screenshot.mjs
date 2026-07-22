import { firefox } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'http://localhost:5176';
const PAGES = [
  { path: '/', name: 'backtest' },
  { path: '/analysis', name: 'analysis' },
  { path: '/monte-carlo', name: 'monte-carlo' },
  { path: '/optimizer', name: 'optimizer' },
];
const OUT_DIR = 'd:/Project/回测平台/.trae/specs/ui-align-testfolio-v3';

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  for (const theme of ['light', 'dark']) {
    const page = await context.newPage();

    // 收集控制台错误
    const allErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        allErrors.push(`[${theme}] [ERROR] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => {
      allErrors.push(`[${theme}] [PAGE ERROR] ${err.message}`);
    });

    // 先访问首页设置主题
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate((t) => {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(t);
      localStorage.setItem('theme', t);
    }, theme);
    await page.waitForTimeout(300);

    for (const { path, name } of PAGES) {
      console.log(`[${theme}] Screenshotting ${path} ...`);
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
      // 等待 lazy chunk 加载和渲染
      await page.waitForTimeout(2000);

      const screenshotPath = `${OUT_DIR}/regression-${name}-${theme}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const sizeKb = Math.round(fs.statSync(screenshotPath).size / 1024);
      console.log(`  -> ${screenshotPath} (${sizeKb} KB)`);
      if (sizeKb < 40) {
        console.log(`  ⚠️ Screenshot suspiciously small, possible loading issue`);
      }
    }

    await page.close();

    if (allErrors.length > 0) {
      console.log(`\n!! Console errors (${theme}):`);
      allErrors.forEach(l => console.log(`  ${l}`));
    } else {
      console.log(`\n✓ No console errors (${theme})`);
    }
  }

  await browser.close();
  console.log('Done.');
})();
