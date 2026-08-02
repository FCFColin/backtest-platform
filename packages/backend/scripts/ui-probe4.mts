import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const browser = await chromium.launch();
const state = JSON.parse(readFileSync('D:/Project/回测平台/.auth/user.json', 'utf-8'));
const ctx = await browser.newContext({ storageState: state, locale: 'zh-CN' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

async function run(path, prep, resultPh) {
  const t0 = Date.now();
  await page.goto(`http://localhost:15001${path}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(800);
  await prep();
  await page.getByRole('button', { name: /开始分析|开始网格搜索/ }).first().click();
  await page.waitForTimeout(8000);
  const body = await page.locator('body').innerText();
  const ms = Date.now() - t0;
  const hit = body.split('\n').filter((l) => resultPh.test(l)).slice(0, 3);
  const err = body.split('\n').filter((l) => /校验|错误|失败|无效|不能为空|exceeded|invalid/i.test(l)).slice(0, 3);
  console.log(`=== ${path} (${ms}ms) ===`);
  console.log('  result hit:', hit.map((h) => h.trim()).join(' || ').slice(0, 200));
  console.log('  err hit:', err.map((h) => h.trim()).join(' || ').slice(0, 200));
}

await run('/tactical-grid', async () => {
  await page.locator('#grid-ticker').fill('SPY');
  await page.locator('#grid-start-date').fill('2018-01-01');
  await page.locator('#grid-end-date').fill('2023-12-31');
  const nums = page.locator('input[type="number"]');
  await nums.nth(0).fill('10');
  await nums.nth(1).fill('10');
  await nums.nth(2).fill('1');
  await nums.nth(3).fill('3');
  await nums.nth(4).fill('3');
  await nums.nth(5).fill('1');
}, /Combinations|组合数|网格结果|最优/);

await run('/dual-signal', async () => {
  await page.getByPlaceholder(/如 SPY|e\.g\. SPY/).first().fill('VTI');
  await page.locator('#signal-start-date').fill('2018-01-01');
  await page.locator('#signal-end-date').fill('2023-12-31');
}, /组合信号统计|Combined Signal Stats/);

await run('/multi-signal', async () => {
  await page.getByPlaceholder(/如 SPY|e\.g\. SPY/).first().fill('VTI');
  await page.locator('#signal-start-date').fill('2018-01-01');
  await page.locator('#signal-end-date').fill('2023-12-31');
}, /聚合信号统计|Aggregated Signal/);

await browser.close();
