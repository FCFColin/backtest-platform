import { test, expect } from '@playwright/test';
import { expectA11y } from '../../helpers/a11y.js';

interface PageSmokeCase {
  name: string;
  url: string;
  panelRegex: RegExp;
}

// 新注册用户首次进入工具页为空态引导（无 H1/结果区），老用户为完整工作台；
// 因此冒烟断言锚定稳定契约：路由保持 + 参数面板/引导 CTA 可见 + 无障碍基线。
const SMOKE_PAGES: PageSmokeCase[] = [
  {
    name: '战术资产配置',
    url: '/tactical',
    panelRegex: /基础参数|信号构建器|立即体验/,
  },
  {
    name: '单信号分析',
    url: '/signal-analyzer',
    panelRegex: /开始分析|指标|信号/,
  },
  {
    name: 'PCA 主成分分析',
    url: '/pca',
    panelRegex: /开始分析|分析参数|时间范围/,
  },
  {
    name: '目标优化器',
    url: '/goal-optimizer',
    panelRegex: /目标金额|初始金额|模拟/,
  },
];

test.describe('页面冒烟测试', () => {
  for (const smoke of SMOKE_PAGES) {
    test(`页面加载 — 路由保持且面板可见: ${smoke.name}`, async ({ page }) => {
      await page.goto(smoke.url, { waitUntil: 'networkidle' });
      await expect(page).toHaveURL(new RegExp(smoke.url));
      await expect(page.getByText(smoke.panelRegex).first()).toBeVisible({ timeout: 10_000 });
      await expectA11y(page);
    });
  }

  test('战术分配 — 结果区域或引导态存在', async ({ page }) => {
    await page.goto('/tactical', { waitUntil: 'networkidle' });
    await expect(page.getByText(/结果|Results|等权基准|立即体验/).first()).toBeVisible({
      timeout: 10_000,
    });
    await expectA11y(page);
  });
});
