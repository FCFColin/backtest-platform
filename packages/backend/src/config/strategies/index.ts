import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface StrategyParameter {
  type: string;
  default: number | string;
  min?: number;
  max?: number;
  enum?: string[];
  description?: string;
}

interface RiskRules {
  maxWeight: number;
  minWeight: number;
  maxTurnover?: number;
}

interface StrategyConfig {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, StrategyParameter>;
  riskRules: RiskRules;
}

interface StrategiesConfig {
  strategies: StrategyConfig[];
}

let cachedConfig: StrategiesConfig | null = null;

export function loadStrategiesConfig(): StrategiesConfig {
  if (cachedConfig) return cachedConfig;

  const filePath = join(__dirname, 'default-strategies.json');
  const raw = readFileSync(filePath, 'utf-8');
  cachedConfig = JSON.parse(raw) as StrategiesConfig;
  return cachedConfig;
}

export function getStrategyById(id: string): StrategyConfig | undefined {
  const config = loadStrategiesConfig();
  return config.strategies.find((s) => s.id === id);
}

export function getAllStrategies(): StrategyConfig[] {
  return loadStrategiesConfig().strategies;
}

export type { StrategyConfig, StrategyParameter, RiskRules, StrategiesConfig };
