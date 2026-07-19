/**
 * 页面冒烟测试（合并自 tactical / signal-analyzer / pca / goal-optimizer 4 个 spec）
 *
 * 企业理由：4 个分析页面共享相同的冒烟测试模式（标题可见 + 参数面板可见），
 * 用 test.each 参数化消除重复的 beforeEach + goto + expect 样板。
 * tactical 页面额外验证"结果区域存在"，作为独立 test 保留。
 */
import { test, expect } from '@playwright/test';

interface PageSmokeCase {
  name: string;
  url: string;
  headingRegex: RegExp;
  panelRegex: RegExp;
}

const SMOKE_PAGES: PageSmokeCase[] = [
  {
    name: '战术分配',
    url: '/tactical',
    headingRegex: /战术分配/,
    panelRegex: /战术策略参数/,
  },
  {
    name: '单信号分析',
    url: '/signal-analyzer',
    headingRegex: /单信号分析/,
    panelRegex: /开始分析|指标|信号/,
  },
  {
    name: 'PCA 主成分分析',
    url: '/pca',
    headingRegex: /主成分分析.*PCA/,
    panelRegex: /开始分析|分析参数|时间范围/,
  },
  {
    name: '目标优化器',
    url: '/goal-optimizer',
    headingRegex: /目标优化器/,
    panelRegex: /目标金额|初始金额|模拟/,
  },
];

test.describe('页面冒烟测试', () => {
  test.each(SMOKE_PAGES)('页面渲染 — 标题正确: $name', async ({ page }, smoke) => {
    await page.goto(smoke.url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: smoke.headingRegex })).toBeVisible({
      timeout: 60_000,
    });
  });

  test.each(SMOKE_PAGES)('页面加载 — 参数面板可见: $name', async ({ page }, smoke) => {
    await page.goto(smoke.url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(smoke.panelRegex).first()).toBeVisible({ timeout: 30_000 });
  });

  test('战术分配 — 结果区域存在', async ({ page }) => {
    await page.goto('/tactical', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/结果|Results|等权基准/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
