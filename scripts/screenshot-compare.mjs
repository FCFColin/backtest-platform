import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Local light mode
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await setTimeout(2000);
  await page.screenshot({ path: 'd:/Project/回测平台/.trae/specs/local-v3-light.png', fullPage: true });

  // Switch to dark mode by clicking the theme toggle (look for sun/moon icon button in navbar)
  const themeBtn = page.locator('nav .navbar-icon-btn').filter({ hasText: /☀|🌙|Moon|Sun/i }).or(page.locator('nav button[title*="theme"], nav button[title*="dark"], nav button[title*="light"]'));
  if (await themeBtn.count() > 0) {
    await themeBtn.first().click();
    await setTimeout(1000);
    await page.screenshot({ path: 'd:/Project/回测平台/.trae/specs/local-v3-dark.png', fullPage: true });
  }

  // testfol.io dark mode
  await page.goto('https://testfol.io/', { waitUntil: 'networkidle' });
  await setTimeout(2000);
  // Find and click dark mode toggle (usually a moon icon)
  const tfThemeBtn = page.locator('button[aria-label*="theme"], button[title*="theme"], button[aria-label*="dark"]').first();
  if (await tfThemeBtn.count() > 0) {
    await tfThemeBtn.click();
    await setTimeout(1000);
  }
  await page.screenshot({ path: 'd:/Project/回测平台/.trae/specs/testfolio-ref-dark.png', fullPage: true });

  await browser.close();
  console.log('Screenshots saved');
}
capture().catch(console.error);
