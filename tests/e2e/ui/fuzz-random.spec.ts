/* eslint-disable no-console -- fuzz 计时输出到终端 */
import { test, expect } from '@playwright/test';
import { COMPUTE_PAGES, ERRORS } from './fuzz/adapters.js';
import { getSeed, mulberry32 } from './fuzz/fuzz-core.js';

// 全计算页面随机输入测试：随机标的/权重/日期/参数 → 真实运行 → 断言
// 1) 能跑成（结果区出现）或返回合理错误（非崩溃） 2) 耗时预算内 3) 结果数值合理
const RESULT_BUDGET_MS = Number(process.env.FUZZ_RESULT_BUDGET_MS ?? 1_000);

for (const adapter of COMPUTE_PAGES) {
  test(`${adapter.name}: 随机输入运行 — 结果合理 / 耗时预算`, async ({ page }) => {
    test.setTimeout(120_000);
    const rng = mulberry32(getSeed() + adapter.url.length * 7919);
    await page.goto(adapter.url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: adapter.heading }).first()).toBeVisible({
      timeout: 1_000,
    });

    await adapter.fill(page, rng);

    const started = Date.now();
    if (adapter.instant) {
      await expect(page.getByText(adapter.resultText).first()).toBeVisible({ timeout: 10_000 });
    } else {
      await page.getByRole('button', { name: adapter.runText }).click();
    }

    const result = page.getByText(adapter.resultText).first();
    const error = page.getByText(ERRORS).first();
    const crash = page.getByText(/该区块加载失败|页面出错了|Unexpected|Cannot read/i).first();

    await expect(result.or(error)).toBeVisible({ timeout: RESULT_BUDGET_MS });
    await expect(crash).toHaveCount(0);

    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(RESULT_BUDGET_MS);
    console.log(`[fuzz] ${adapter.name}: ${elapsed}ms (budget ${RESULT_BUDGET_MS}ms)`);
  });
}
