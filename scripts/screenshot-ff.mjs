import { firefox } from '@playwright/test';
import { setTimeout } from 'timers/promises';

async function capture() {
  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
  // Local light mode
  await page.goto('http://localhost:5176/', { waitUntil: 'networkidle' });
  await setTimeout(5000);
  await page.screenshot({ path: 'd:/Project/回测平台/.trae/specs/local-v3-light.png', fullPage: true });
  console.log('Light screenshot saved');

  // Switch to dark mode - try multiple selectors
  const selectors = [
    'nav button[class*="icon"]',
    'nav button[title*="theme" i]',
    'nav button[title*="dark" i]',
    'nav button[title*="light" i]',
    'nav button',
  ];
  let clicked = false;
  for (const sel of selectors) {
    const btns = await page.locator(sel).all();
    for (const btn of btns) {
      const text = (await btn.textContent().catch(() => '')) ?? '';
      const title = (await btn.getAttribute('title').catch(() => '')) ?? '';
      if (text.includes('☀') || text.includes('🌙') || title.toLowerCase().includes('theme') || title.toLowerCase().includes('dark') || title.toLowerCase().includes('light')) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (clicked) break;
  }
  if (clicked) {
    await setTimeout(3000);
    await page.screenshot({ path: 'd:/Project/回测平台/.trae/specs/local-v3-dark.png', fullPage: true });
    console.log('Dark screenshot saved');
  } else {
    console.log('Theme toggle not found');
  }

  // testfol.io dark mode
  await page.goto('https://testfol.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await setTimeout(5000);
  const tfBtns = await page.locator('button').all();
  let tfClicked = false;
  for (const btn of tfBtns) {
    const label = (await btn.getAttribute('aria-label').catch(() => '')) ?? '';
    const title = (await btn.getAttribute('title').catch(() => '')) ?? '';
    if (label.toLowerCase().includes('theme') || title.toLowerCase().includes('theme') || label.toLowerCase().includes('dark') || label.toLowerCase().includes('light')) {
      await btn.click();
      tfClicked = true;
      break;
    }
  }
  if (tfClicked) await setTimeout(3000);
  await page.screenshot({ path: 'd:/Project/回测平台/.trae/specs/testfolio-ref-dark.png', fullPage: true });
  console.log('testfol.io screenshot saved');

  } finally {
    await browser.close();
  }
}
capture().catch(console.error);
