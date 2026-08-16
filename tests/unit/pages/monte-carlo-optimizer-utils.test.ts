import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPresets,
  monthFormatter,
  METRIC_FORMAT,
  RESULT_TABS,
} from '../../../packages/frontend/src/pages/monte-carlo/monteCarloUtils.js';
import { loadInBacktesterAction } from '../../../packages/frontend/src/pages/optimizer/optimizerApi.js';

const makeSetters = () => ({
  setPortfolioMode: vi.fn(),
  setPortfolios: vi.fn(),
  setNumYears: vi.fn(),
  setNumSimulations: vi.fn(),
  setStartingValue: vi.fn(),
  setMinBlock: vi.fn(),
  setMaxBlock: vi.fn(),
});

describe('monteCarloUtils.buildPresets', () => {
  beforeEach(() => localStorage.clear());

  it('应生成 3 个预设按钮，点击后设置对应参数', () => {
    const setters = makeSetters();
    const presets = buildPresets(setters as unknown as Parameters<typeof buildPresets>[0]);
    expect(presets).toHaveLength(3);

    presets[0].onClick();
    expect(setters.setPortfolioMode).toHaveBeenCalledWith(1);
    expect(setters.setNumYears).toHaveBeenCalledWith(20);
    expect(setters.setNumSimulations).toHaveBeenCalledWith(500);
    expect(setters.setStartingValue).toHaveBeenCalledWith(100000);
    expect(setters.setMinBlock).toHaveBeenCalledWith(1);
    expect(setters.setMaxBlock).toHaveBeenCalledWith(5);
    expect(setters.setPortfolios).toHaveBeenCalledWith([
      expect.objectContaining({
        assets: [
          { ticker: 'VTI', weight: 60 },
          { ticker: 'BND', weight: 40 },
        ],
      }),
    ]);
  });

  it('第三预设（三基金）应设置正确的权重组合', () => {
    const setters = makeSetters();
    const presets = buildPresets(setters as unknown as Parameters<typeof buildPresets>[0]);
    presets[2].onClick();
    const [portfolios] = setters.setPortfolios.mock.calls[0];
    expect(portfolios[0].assets).toEqual([
      { ticker: 'VTI', weight: 50 },
      { ticker: 'VXUS', weight: 30 },
      { ticker: 'BND', weight: 20 },
    ]);
  });
});

describe('monteCarloUtils 格式化', () => {
  it('monthFormatter：12 的整数倍月份应显示年数', () => {
    expect(monthFormatter(0)).toBe('0y');
    expect(monthFormatter(12)).toBe('1y');
    expect(monthFormatter(36)).toBe('3y');
    expect(monthFormatter(18)).toBe('');
  });

  it('METRIC_FORMAT 应包含全部分布指标格式化器', () => {
    for (const key of [
      'finalValue',
      'cagr',
      'maxDrawdown',
      'volatility',
      'sharpe',
      'sortino',
    ] as const) {
      expect(typeof METRIC_FORMAT[key]).toBe('function');
    }
  });

  it('RESULT_TABS 应包含五个结果页签', () => {
    expect(RESULT_TABS.map((t) => t.key)).toEqual([
      'summary',
      'range',
      'success',
      'distributions',
      'scenarios',
    ]);
  });
});

describe('optimizerApi.loadInBacktesterAction', () => {
  beforeEach(() => localStorage.clear());

  it('无结果时应直接返回不导航', () => {
    const navigate = vi.fn();
    loadInBacktesterAction(
      { results: null, startDate: '2015-01-01', endDate: '2025-01-01' },
      (k) => k,
      navigate,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('有结果时应写入 localStorage 并跳转首页', () => {
    const navigate = vi.fn();
    loadInBacktesterAction(
      {
        results: { optimalWeights: { VTI: 0.6032, BND: 0.3968 } } as unknown as NonNullable<
          Parameters<typeof loadInBacktesterAction>[0]['results']
        >,
        startDate: '2015-01-01',
        endDate: '2025-01-01',
      },
      (k) => (k === 'optimizer.optimalPortfolio' ? '最优组合' : k),
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith('/');
    const saved = JSON.parse(localStorage.getItem('bt_load_from_optimizer') as string);
    expect(saved.portfolios[0].assets).toEqual([
      { ticker: 'VTI', weight: 60.32 },
      { ticker: 'BND', weight: 39.68 },
    ]);
    expect(saved.parameters.startDate).toBe('2015-01-01');
    expect(saved.parameters.startingValue).toBe(10000);
  });
});
