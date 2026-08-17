import { test, expect } from '@playwright/test';
import { warmUpSuite } from './helpers/backtest.js';

test.describe.configure({ mode: 'serial' });

test.describe('回测表单错误路径', () => {
  test.beforeAll(async ({ browser }) => warmUpSuite(browser));
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 1_000 });
  });

  test('权重不等于 100% 显示错误提示', async ({ page }) => {
    if ((await page.getByPlaceholder('VTI').count()) === 0) {
      await page.getByRole('button', { name: /添加组合|Add Portfolio/ }).click();
      await page.getByRole('menuitem', { name: /添加空组合|Add Empty/ }).click();
    }
    const row = page.getByPlaceholder('VTI').first().locator('xpath=..');
    await row.locator('input').first().fill('VTI');
    await row.locator('input[type="number"]').fill('80');
    const runBtn = page.getByTestId('backtest-run');
    await runBtn.click();
    await expect(page.getByText(/100%/)).toBeVisible({ timeout: 5_000 });
  });

  test('空资产行时运行按钮不可用', async ({ page }) => {
    if ((await page.getByPlaceholder('VTI').count()) === 0) {
      await page.getByRole('button', { name: /添加组合|Add Portfolio/ }).click();
      await page.getByRole('menuitem', { name: /添加空组合|Add Empty/ }).click();
    }
    const runBtn = page.getByTestId('backtest-run');
    await expect(runBtn).toBeDisabled({ timeout: 5_000 });
  });
});
