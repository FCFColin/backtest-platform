import { useTranslation } from 'react-i18next';
import { useAnalysisState } from '../../hooks/miscHooks.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { buildSignalRequest, type DualSignalResponse } from './signalTypes.js';
export interface SignalCfg {
  indicator: string;
  period: number;
  threshold: number;
}
type DualState = {
  cfg1: SignalCfg;
  cfg2: SignalCfg;
  combinationMethod: 'and' | 'or' | 'xor';
  ticker: string;
  startDate: string;
  endDate: string;
};
export type UseDualSignalStateResult = ReturnType<typeof useDualSignalState>;
export function useDualSignalState() {
  const { t } = useTranslation();
  return useAnalysisState<DualState, DualSignalResponse>(
    '/api/v1/signal/dual',
    {
      cfg1: { indicator: 'SMA', period: 20, threshold: 30 },
      cfg2: { indicator: 'EMA', period: 50, threshold: 30 },
      combinationMethod: 'and' as 'and' | 'or' | 'xor',
      ticker: 'SPY',
      startDate: DEFAULT_START_DATE,
      endDate: DEFAULT_END_DATE,
    },
    (s) => ({
      signal1: buildSignalRequest(s.ticker, s.cfg1, 'both', s.startDate, s.endDate),
      signal2: buildSignalRequest(s.ticker, s.cfg2, 'both', s.startDate, s.endDate),
      combinationMethod: s.combinationMethod,
    }),
    (s) => (s.ticker.trim() ? null : t('Please enter a ticker symbol')),
  );
}
