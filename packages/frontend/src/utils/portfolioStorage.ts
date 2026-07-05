import type { Portfolio, BacktestParameters } from '@backtest/shared/types';

const STORAGE_KEY = 'backtest-portfolios';
const PARAMS_KEY = 'backtest-params';

/** 保存组合列表到 localStorage */
export function savePortfolios(portfolios: Portfolio[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
  } catch (e) {
    console.error('Failed to save portfolios:', e);
  }
}

/** 从 localStorage 加载组合列表 */
export function loadPortfolios(): Portfolio[] | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data) as Portfolio[];
  } catch (e) {
    console.error('Failed to load portfolios:', e);
    return null;
  }
}

/** 保存回测参数到 localStorage */
export function saveParameters(params: BacktestParameters): void {
  try {
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
  } catch (e) {
    console.error('Failed to save parameters:', e);
  }
}

/** 从 localStorage 加载回测参数 */
export function loadParameters(): BacktestParameters | null {
  try {
    const data = localStorage.getItem(PARAMS_KEY);
    if (!data) return null;
    return JSON.parse(data) as BacktestParameters;
  } catch (e) {
    console.error('Failed to load parameters:', e);
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
    console.error('Failed to save named config:', e);
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
  } catch {
    // Storage full or unavailable
  }
}

/** 清除所有本地存储数据 */
export function clearAllData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PARAMS_KEY);
    localStorage.removeItem(SAVED_KEY);
  } catch {
    // Storage unavailable
  }
}
