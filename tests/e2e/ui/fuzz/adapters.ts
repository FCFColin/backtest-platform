import { expect, type Page } from '@playwright/test';
import type { Rng } from './fuzz-core.js';
import { randomAmount, randomDateRange, randomPortfolio } from './fuzz-core.js';

interface PageAdapter {
  name: string;
  url: string;
  heading: RegExp;
  runText: RegExp;
  resultText: RegExp;
  fill: (page: Page, rng: Rng) => Promise<void>;
  instant?: boolean; // 计算器类：无运行按钮，输入即出结果
}

const TICKER_PLACEHOLDER = /输入代码|标的代码|Enter ticker|Enter symbol|e\.g\. VTI|^VTI$/;
export const ERRORS = /校验|错误|失败|无效|至少|不能为空|exceeded|invalid|failed/i;

async function fillPortfolioEditor(page: Page, rng: Rng, maxRows = 4): Promise<void> {
  const { tickers, weights } = randomPortfolio(rng);
  const rows = page.getByPlaceholder(TICKER_PLACEHOLDER);
  for (let i = 0; i < Math.min(tickers.length, maxRows); i++) {
    if (i >= (await rows.count())) {
      await page.getByRole('button', { name: /添加标的|Add Asset/ }).click();
      await page.waitForTimeout(150);
    }
    const tickerInput = rows.nth(i);
    await tickerInput.fill(tickers[i]);
    const weight = tickerInput.locator('xpath=..').locator('input[type="number"]');
    if ((await weight.count()) > 0) {
      await weight.fill(String(weights[i]));
    }
  }
}

async function fillTagInput(page: Page, rng: Rng): Promise<void> {
  const { tickers } = randomPortfolio(rng);
  const input = page.getByLabel(TICKER_PLACEHOLDER).last();
  for (const t of tickers.slice(0, 2)) {
    await input.fill(t);
    await input.press('Enter');
  }
}

async function fillPlainInput(page: Page, rng: Rng, placeholder: RegExp): Promise<void> {
  await page
    .getByPlaceholder(placeholder)
    .fill(rng.pick(['VTI', 'SPY', 'QQQ', 'GLD', 'TLT', 'AGG', 'IWM']));
}

async function fillDateRange(
  page: Page,
  rng: Rng,
  ids: [string, string] | 'generic',
): Promise<void> {
  const { start, end } = randomDateRange(rng);
  if (ids === 'generic') {
    const dates = page.locator('input[type="date"]');
    await dates.nth(0).fill(start);
    await dates.nth(1).fill(end);
  } else {
    await page.locator(ids[0]).fill(start);
    await page.locator(ids[1]).fill(end);
  }
}

const portfolioFill =
  (dateIds?: [string, string] | 'generic', maxRows = 4) =>
  async (page: Page, rng: Rng) => {
    await fillPortfolioEditor(page, rng, maxRows);
    if (dateIds) await fillDateRange(page, rng, dateIds);
  };

const plainFill =
  (placeholders: RegExp[], dateIds: [string, string] | 'generic') =>
  async (page: Page, rng: Rng) => {
    for (const p of placeholders) await fillPlainInput(page, rng, p);
    await fillDateRange(page, rng, dateIds);
  };

const tagFill = async (page: Page, rng: Rng) => {
  await fillTagInput(page, rng);
  await fillDateRange(page, rng, 'generic');
};

export const COMPUTE_PAGES: PageAdapter[] = [
  {
    name: '组合回测',
    url: '/',
    heading: /组合回测|Portfolio Backtest/,
    runText: /运行回测|BACKTEST|Run Backtest/,
    resultText: /CAGR/,
    fill: async (page, rng) => {
      if ((await page.getByPlaceholder(TICKER_PLACEHOLDER).count()) === 0) {
        await page.getByRole('button', { name: /加载示例|Load Example/ }).click();
        await expect(page.getByPlaceholder(TICKER_PLACEHOLDER).first()).toBeVisible({
          timeout: 5_000,
        });
      }
      await fillPortfolioEditor(page, rng);
      await fillDateRange(page, rng, 'generic');
    },
  },
  {
    name: '蒙特卡洛模拟',
    url: '/monte-carlo',
    heading: /蒙特卡洛模拟|Monte Carlo/,
    runText: /开始模拟|Run Simulation|startSim/,
    resultText: /中位终值|Median Final Value|保留/,
    fill: portfolioFill('generic'),
  },
  {
    name: 'PCA 主成分分析',
    url: '/pca',
    heading: /PCA|主成分分析/,
    runText: /开始分析|Run Analysis/,
    resultText: /Eigenvalues|特征值|Cumulative|累计/,
    fill: (page, rng) => fillDateRange(page, rng, ['#pca-start-date', '#pca-end-date']),
  },
  {
    name: '因子回归',
    url: '/factor-regression',
    heading: /因子回归|Factor Regression/,
    runText: /开始分析|Start Analysis/,
    resultText: /Alpha|Beta|R²|R-Squared/,
    fill: portfolioFill(['#fr-start-date', '#fr-end-date']),
  },
  {
    name: '战术分配',
    url: '/tactical',
    heading: /战术分配|Tactical/,
    runText: /运行战术回测|Run Tactical Backtest/,
    resultText: /Tactical|Benchmark|战术|基准/,
    fill: portfolioFill(['#tactical-start-date', '#tactical-end-date'], 2),
  },
  {
    name: '杠杆 ETF 滑点',
    url: '/letf-slippage',
    heading: /杠杆 ETF|Leveraged ETF/,
    runText: /开始分析|Run Analysis/,
    resultText: /Annual Decay|年化衰减|Slippage|滑点/,
    fill: plainFill([/如 TQQQ|e\.g\. TQQQ/, /如 QQQ|e\.g\. QQQ/], 'generic'),
  },
  {
    name: '目标优化器',
    url: '/goal-optimizer',
    heading: /目标优化器|Goal Optimizer/,
    runText: /开始优化|Start Optimization/,
    resultText: /Probability of Reaching Goal|达成目标概率/,
    fill: async (page, rng) => {
      await fillPortfolioEditor(page, rng, 2);
      await page.locator('#go-target').fill(String(randomAmount(rng, 100_000, 2_000_000, 100_000)));
      await page.locator('#go-years').fill(String(rng.int(10, 30)));
    },
  },
  {
    name: '有效前沿',
    url: '/efficient-frontier',
    heading: /有效前沿|Efficient Frontier/,
    runText: /计算有效前沿|Calculate Efficient Frontier/,
    resultText: /Max Sharpe Portfolio|最大夏普组合/,
    fill: tagFill,
  },
  {
    name: '一次性 vs 定投',
    url: '/lumpsum-vs-dca',
    heading: /一次性|定投|Lump Sum/,
    runText: /开始对比|开始比较|Start Comparison/,
    resultText: /CAGR|年化/,
    fill: portfolioFill(['#bp-start-date', '#bp-end-date']),
  },
  {
    name: '再平衡敏感性',
    url: '/rebalancing-sensitivity',
    heading: /调仓敏感性|再平衡|Rebalancing/,
    runText: /开始分析|Start Analysis/,
    resultText: /Sortino|CAGR|夏普/,
    fill: portfolioFill(['#bp-start-date', '#bp-end-date']),
  },
  {
    name: '回测优化器',
    url: '/backtest-optimizer',
    heading: /回测优化器|Backtest Optimizer/,
    runText: /开始优化|Start Optimization/,
    resultText:
      /最优权重|最优组合指标|Optimal Weights|Optimal Metrics|没有满足约束条件的组合|No Combinations Match/,
    fill: portfolioFill('generic', 2),
  },
  {
    name: '投资计算器',
    url: '/calculators',
    heading: /计算器|Calculator/,
    runText: /__never__/,
    resultText: /Min Variance Weight|最小方差权重|年化|CAGR|Result/,
    instant: true,
    fill: async (page, rng) => {
      const inputs = page.locator('input[type="number"]');
      const n = Math.min(await inputs.count(), 4);
      for (let i = 0; i < n; i++) {
        await inputs.nth(i).fill(String(rng.int(1, 30)));
      }
    },
  },
  {
    name: '单信号分析',
    url: '/signal-analyzer',
    heading: /单信号|Signal Analysis/,
    runText: /开始分析|Run Analysis/,
    resultText: /总信号数|Total Signals|信号总数/,
    fill: plainFill([/如 SPY|e\.g\. SPY/], 'generic'),
  },
  {
    name: '战术网格搜索',
    url: '/tactical-grid',
    heading: /战术网格|Tactical Grid/,
    runText: /开始网格搜索|开始搜索|Start Grid Search/,
    resultText: /Combinations|组合数/,
    fill: async (page, rng) => {
      await page.locator('#grid-ticker').fill(rng.pick(['SPY', 'QQQ', 'GLD', 'TLT']));
      await fillDateRange(page, rng, ['#grid-start-date', '#grid-end-date']);
      const nums = page.locator('input[type="number"]');
      await nums.nth(0).fill('10');
      await nums.nth(1).fill('10');
      await nums.nth(2).fill('1');
      await nums.nth(3).fill('3');
      await nums.nth(4).fill('3');
      await nums.nth(5).fill('1');
    },
  },
  {
    name: '双信号',
    url: '/dual-signal',
    heading: /双信号|Dual Signal/,
    runText: /开始分析|Run Analysis/,
    resultText: /Combined Signal Stats|组合信号/,
    fill: plainFill([/如 SPY|e\.g\. SPY/], 'generic'),
  },
  {
    name: '多信号',
    url: '/multi-signal',
    heading: /多信号|Multi Signal/,
    runText: /开始分析|Run Analysis/,
    resultText: /Aggregated Signal Statistics|聚合信号/,
    fill: plainFill([/如 SPY|e\.g\. SPY/], 'generic'),
  },
];
