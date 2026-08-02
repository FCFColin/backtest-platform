import { test, expect } from '@playwright/test';

test.describe('数据引擎页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/data-engine', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 1_000 });
  });

  test('T7: 数据引擎页面加载 — 不卡死', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /数据引擎|Data Engine/ })).toBeVisible({
      timeout: 1_000,
    });

    await expect(page.getByText(/加载超时|load timeout/i)).toHaveCount(0);

    const statsCard = page.getByText(/标的宇宙|Ticker Universe/).first();
    const errorMsg = page.getByText(/数据加载失败|Data load failed|鉴权失败|扫描失败/).first();
    await expect(statsCard.or(errorMsg)).toBeVisible({ timeout: 1_000 });
  });

  test('T8: 刷新统计 — 无报错', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /数据引擎|Data Engine/ })).toBeVisible({
      timeout: 1_000,
    });

    const refreshBtn = page.getByRole('button', { name: /刷新统计|Refresh Stats/ });
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();

      await expect(page.getByText(/加载超时|load timeout/i)).toHaveCount(0);

      await expect(page.getByRole('heading', { name: /数据引擎|Data Engine/ })).toBeVisible();
    }
  });

  test('T17: 数据引擎页面加载 — 显示统计或错误重试机制', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /数据引擎|Data Engine/ })).toBeVisible({
      timeout: 1_000,
    });

    try {
      await expect(page.getByText(/标的宇宙|Ticker Universe/).first()).toBeVisible({
        timeout: 15_000,
      });
    } catch {
      await expect(page.getByRole('button', { name: /重试|Retry/ })).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
