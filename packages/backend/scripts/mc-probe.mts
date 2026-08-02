import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const browser = await chromium.launch();
const state = JSON.parse(readFileSync('../../.auth/user.json', 'utf-8'));
const ctx = await browser.newContext({ storageState: state, locale: 'zh-CN' });
const page = await ctx.newPage();
await page.goto('http://localhost:15001/monte-carlo', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const allInputs = await page.locator('input').count();
console.log('input count:', allInputs);
const phCount = await page.getByPlaceholder(/输入代码|Enter ticker|Enter symbol|e\.g\. VTI/).count();
console.log('placeholder match count:', phCount);
if (phCount > 0) {
  const info = await page.getByPlaceholder(/输入代码|Enter ticker/).first().evaluate((el) => {
    const p = el.parentElement;
    return { ph: el.getAttribute('placeholder'), parentHtml: p ? p.outerHTML.slice(0, 300) : 'none' };
  });
  console.log('first match:', JSON.stringify(info));
}
const btn = page.getByRole('button', { name: /开始模拟/ });
console.log('start btn count:', await btn.count());
const body = await page.locator('body').innerText();
console.log('has 组合配置:', body.includes('组合配置'), '| has 模拟参数:', body.includes('模拟参数'), '| has 构建模式:', body.includes('构建模式'));
await browser.close();
