import { test, expect } from '@playwright/test';

test.describe('数据引擎页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/data-engine', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 60_000 });
  });

  test('T7: 数据引擎页面加载 — 不卡死', async ({ page }) => {
    // 等待"数据引擎"标题出现
    await expect(page.getByRole('heading', { name: /数据引擎|Data Engine/ })).toBeVisible({ timeout: 60_000 });

    // 验证没有超时错误
    await expect(page.getByText(/加载超时|load timeout/i)).toHaveCount(0);

    // 验证统计卡片出现或错误提示出现
    const statsCard = page.getByText(/标的宇宙|Ticker Universe/).first();
    const errorMsg = page.getByText(/数据加载失败|Data load failed|鉴权失败|扫描失败/).first();
    await expect(statsCard.or(errorMsg)).toBeVisible({ timeout: 60_000 });
  });

  test('T8: 刷新统计 — 无报错', async ({ page }) => {
    // 等待页面加载完成
    await expect(page.getByRole('heading', { name: /数据引擎|Data Engine/ })).toBeVisible({ timeout: 60_000 });

    // 点击"刷新统计"按钮
    const refreshBtn = page.getByRole('button', { name: /刷新统计|Refresh Stats/ });
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();

      // 等待刷新完成（页面不应卡死）
      await expect(page.getByText(/加载超时|load timeout/i)).toHaveCount(0);

      // 验证标题仍在
      await expect(page.getByRole('heading', { name: /数据引擎|Data Engine/ })).toBeVisible();
    }
  });

  test('T17: 数据引擎页面加载 — 显示统计或错误重试机制', async ({ page }) => {
    // 等待页面加载完成
    await expect(page.getByRole('heading', { name: /数据引擎|Data Engine/ })).toBeVisible({ timeout: 60_000 });

    // 页面应显示统计卡片（正常状态）或错误信息+重试按钮（错误状态）
    const statsVisible = await page.getByText(/标的宇宙|Ticker Universe/).first().isVisible().catch(() => false);

    if (statsVisible) {
      // 正常状态：统计卡片可见
      await expect(page.getByText(/标的宇宙|Ticker Universe/).first()).toBeVisible();
    } else {
      // 错误状态：应有重试按钮
      await expect(page.getByRole('button', { name: /重试|Retry/ })).toBeVisible({ timeout: 10_000 });
    }
  });
});
