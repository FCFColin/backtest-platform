/** @file DataEngine shared types, constants */
import { useTranslation } from 'react-i18next';
import type { MarketStats } from '@backtest/shared/types';

export type TFunc = ReturnType<typeof useTranslation>['t'];

export type Stats = MarketStats;

export interface UniverseStats {
  total: number;
  updated_at: string;
  stats: { total: number; stocks: number; etfs: number; indices: number; us: number; cn: number };
}

export const MAX_POLL = 60;
export const INITIAL_TIMEOUT_MS = 15_000;
