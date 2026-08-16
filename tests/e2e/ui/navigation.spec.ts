import { test, expect } from '@playwright/test';
import { expectA11y } from '../../helpers/a11y.js';

test.describe('导航栏交互', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 1_000 });
  });

  test('T9: 导航到回测页', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /回测|Backtest/ }).click();
    await page.getByRole('menuitem', { name: /组合回测|Portfolio Backtest/ }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(page.getByText(/基础参数|Basic Parameters/).first()).toBeVisible({
      timeout: 1_000,
    });
    await expectA11y(page);
  });

  test('T10: 导航到优化页', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: /优化|Optimize/ }).click();
    await page.getByRole('menuitem', { name: /组合优化|Portfolio Optimization/ }).click();
    await expect(page).toHaveURL(/\/optimizer/, { timeout: 15_000 });
    await expectA11y(page);
  });

  test('T11: 导航到数据引擎', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await nav.getByRole('link', { name: /数据引擎|Data Engine/ }).click();
    await expect(page).toHaveURL(/\/data-engine/, { timeout: 15_000 });
    await expectA11y(page);
  });
});
