/**
 * @file DualSignal 参数面板
 * @description 双信号配置 + 组合方式 + 股票代码 + 日期范围；从 DualSignalPage 拆分以便独立维护。
 */
import { useTranslation } from 'react-i18next';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import { ParamRow, ParamCard } from '../../components/params/index.js';
import {
  INDICATORS,
  TickerField,
  DateRangeFields,
  RunAnalysisButton,
} from './SignalParamsPanel.js';
import type { SignalCfg } from './useDualSignalState.js';

/** 组合方式选项 */
const COMBINATION_METHODS: { value: 'and' | 'or' | 'xor'; label: string }[] = [
  { value: 'and', label: 'signal.dual.combinationAnd' },
  { value: 'or', label: 'signal.dual.combinationOr' },
  { value: 'xor', label: 'signal.dual.combinationXor' },
];

/** DualSignal 参数面板 Props */
interface DualSignalParamsProps {
  cfg1: SignalCfg;
  cfg2: SignalCfg;
  combinationMethod: 'and' | 'or' | 'xor';
  ticker: string;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onCfg1Change: (cfg: SignalCfg) => void;
  onCfg2Change: (cfg: SignalCfg) => void;
  onCombinationMethodChange: (m: 'and' | 'or' | 'xor') => void;
  onTickerChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

/** 单信号配置字段 */
function SignalCfgFields({
  cfg,
  onChange,
}: {
  cfg: SignalCfg;
  onChange: (cfg: SignalCfg) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ParamCard label={t('signal.dual.indicator')}>
        <select
          className="param-input"
          value={cfg.indicator}
          onChange={(e) => onChange({ ...cfg, indicator: e.target.value })}
        >
          {INDICATORS.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </ParamCard>
      <ParamRow>
        <ParamCard label={t('signal.dual.period')}>
          <input
            type="number"
            className="param-input"
            value={cfg.period}
            min={2}
            onChange={(e) => onChange({ ...cfg, period: Number(e.target.value) })}
          />
        </ParamCard>
        <ParamCard label={t('signal.dual.threshold')}>
          <input
            type="number"
            className="param-input"
            value={cfg.threshold}
            onChange={(e) => onChange({ ...cfg, threshold: Number(e.target.value) })}
          />
        </ParamCard>
      </ParamRow>
    </>
  );
}

/** DualSignal 参数面板 */
export function DualSignalParamsPanel({
  cfg1,
  cfg2,
  combinationMethod,
  ticker,
  startDate,
  endDate,
  isLoading,
  onCfg1Change,
  onCfg2Change,
  onCombinationMethodChange,
  onTickerChange,
  onStartDateChange,
  onEndDateChange,
  onRun,
}: DualSignalParamsProps) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <ParamsSection title={t('signal.dual.signal1Config')}>
        <SignalCfgFields cfg={cfg1} onChange={onCfg1Change} />
      </ParamsSection>
      <ParamsSection title={t('signal.dual.signal2Config')}>
        <SignalCfgFields cfg={cfg2} onChange={onCfg2Change} />
      </ParamsSection>
      <ParamsSection title={t('signal.dual.combinationSection')}>
        <ParamCard label={t('signal.dual.combinationLogic')}>
          <select
            className="param-input"
            value={combinationMethod}
            onChange={(e) => onCombinationMethodChange(e.target.value as 'and' | 'or' | 'xor')}
          >
            {COMBINATION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {t(m.label)}
              </option>
            ))}
          </select>
        </ParamCard>
        <TickerField value={ticker} onChange={onTickerChange} />
        <DateRangeFields
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={onStartDateChange}
          onEndDateChange={onEndDateChange}
        />
      </ParamsSection>
      <RunAnalysisButton isLoading={isLoading} onClick={onRun} />
    </ParamsPanel>
  );
}
