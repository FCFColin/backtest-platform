/**
 * 策略配置加载器单元测试
 *
 * 企业理由：策略配置加载器管理所有策略定义，影响前端策略选择
 * 和后端回测参数。测试覆盖：配置加载、按 ID 查找、全部列举、缓存行为。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { readFileSync: fsMocks.readFileSync },
  readFileSync: fsMocks.readFileSync,
}));

const testStrategies = {
  strategies: [
    {
      id: 'momentum',
      name: '动量策略',
      description: '基于过去 12 个月收益率选择 top-N 资产进行配置',
      parameters: {
        lookback: {
          type: 'number',
          default: 252,
          min: 60,
          max: 504,
          description: '回看窗口（交易日）',
        },
        topN: { type: 'number', default: 5, min: 1, max: 50, description: '选中资产数' },
        rebalanceFrequency: {
          type: 'string',
          default: 'monthly',
          enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
          description: '调仓频率',
        },
      },
      riskRules: { maxWeight: 0.25, minWeight: 0.01, maxTurnover: 0.5 },
    },
    {
      id: 'equal-weight',
      name: '等权重策略',
      description: '所有资产等权重配置，定期再平衡',
      parameters: {
        rebalanceFrequency: {
          type: 'string',
          default: 'quarterly',
          enum: ['monthly', 'quarterly', 'yearly'],
          description: '再平衡频率',
        },
      },
      riskRules: { maxWeight: 0.5, minWeight: 0.01 },
    },
  ],
};

describe('strategies config loader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fsMocks.readFileSync.mockReturnValue(JSON.stringify(testStrategies));
  });

  it('loadStrategiesConfig 应解析 JSON 并返回配置', async () => {
    const { loadStrategiesConfig } =
      await import('../../../packages/backend/src/config/strategies/index.js');
    const config = loadStrategiesConfig();
    expect(config.strategies).toHaveLength(2);
    expect(config.strategies[0].id).toBe('momentum');
    expect(config.strategies[1].id).toBe('equal-weight');
    expect(fsMocks.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('loadStrategiesConfig 第二次调用应使用缓存', async () => {
    const { loadStrategiesConfig } =
      await import('../../../packages/backend/src/config/strategies/index.js');
    const config1 = loadStrategiesConfig();
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({ strategies: [{ id: 'new' }] }));
    const config2 = loadStrategiesConfig();
    expect(config1).toBe(config2);
    expect(config2.strategies).toHaveLength(2);
    expect(fsMocks.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('getStrategyById 应返回匹配的策略', async () => {
    const { getStrategyById } =
      await import('../../../packages/backend/src/config/strategies/index.js');
    const s = getStrategyById('equal-weight');
    expect(s).toBeDefined();
    expect(s!.name).toBe('等权重策略');
    expect(s!.riskRules.maxWeight).toBe(0.5);
  });

  it('getStrategyById 不存在的 ID 应返回 undefined', async () => {
    const { getStrategyById } =
      await import('../../../packages/backend/src/config/strategies/index.js');
    const s = getStrategyById('nonexistent');
    expect(s).toBeUndefined();
  });

  it('getAllStrategies 应返回全部策略数组', async () => {
    const { getAllStrategies } =
      await import('../../../packages/backend/src/config/strategies/index.js');
    const all = getAllStrategies();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('momentum');
    expect(all[1].id).toBe('equal-weight');
  });

  it('getAllStrategies 也应使用缓存', async () => {
    const { loadStrategiesConfig, getAllStrategies } =
      await import('../../../packages/backend/src/config/strategies/index.js');
    loadStrategiesConfig();
    fsMocks.readFileSync.mockReturnValue(JSON.stringify({ strategies: [{ id: 'new' }] }));
    const all = getAllStrategies();
    expect(all).toHaveLength(2);
    expect(fsMocks.readFileSync).toHaveBeenCalledTimes(1);
  });
});
