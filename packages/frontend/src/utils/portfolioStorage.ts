import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { reportError } from './errorReporter.js';

const STORAGE_KEY = 'backtest-portfolios';
const PARAMS_KEY = 'backtest-params';

/** 保存组合列表到 localStorage */
export function savePortfolios(portfolios: Portfolio[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'savePortfolios' });
  }
}

/** 从 localStorage 加载组合列表 */
export function loadPortfolios(): Portfolio[] | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data) as Portfolio[];
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'loadPortfolios' });
    return null;
  }
}

/** 保存回测参数到 localStorage */
export function saveParameters(params: BacktestParameters): void {
  try {
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'saveParameters' });
  }
}

/** 从 localStorage 加载回测参数 */
export function loadParameters(): BacktestParameters | null {
  try {
    const data = localStorage.getItem(PARAMS_KEY);
    if (!data) return null;
    return JSON.parse(data) as BacktestParameters;
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'loadParameters' });
    return null;
  }
}

/** 保存单个组合（带名称标签） */
export interface SavedPortfolio {
  id: string;
  name: string;
  savedAt: string;
  portfolios: Portfolio[];
  parameters: BacktestParameters;
}

const SAVED_KEY = 'backtest-saved-configs';

/** 保存当前配置为命名方案 */
export function saveNamedConfig(
  name: string,
  portfolios: Portfolio[],
  parameters: BacktestParameters,
): void {
  const configs = loadNamedConfigs();
  const newConfig: SavedPortfolio = {
    id: `config-${Date.now()}`,
    name,
    savedAt: new Date().toISOString(),
    portfolios,
    parameters,
  };
  configs.push(newConfig);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(configs));
  } catch (e) {
    reportError(e, { component: 'portfolioStorage', action: 'saveNamedConfig' });
  }
}

/** 加载所有命名方案 */
export function loadNamedConfigs(): SavedPortfolio[] {
  try {
    const data = localStorage.getItem(SAVED_KEY);
    if (!data) return [];
    return JSON.parse(data) as SavedPortfolio[];
  } catch {
    return [];
  }
}

/** 删除命名方案 */
export function deleteNamedConfig(id: string): void {
  const configs = loadNamedConfigs();
  const filtered = configs.filter((c) => c.id !== id);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(filtered));
    // eslint-disable-next-line no-empty -- 存储空间满或不可用，静默忽略
  } catch {}
}

/** 清除所有本地存储数据 */
export function clearAllData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PARAMS_KEY);
    localStorage.removeItem(SAVED_KEY);
    // eslint-disable-next-line no-empty -- 存储不可用时无需处理
  } catch {}
}
