/**
 * @file 回测参数表单
 * @description 回测核心参数配置面板容器。使用统一参数布局组件。
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import TickerInput from './TickerInput.js';

import { validateDateChange } from './backtestParamsUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

import { CashflowLegsSection, OneTimeCashflowSection } from './BacktestParamsForm.CashflowLegs.js';
import { ParamRow, ParamCard } from './params/index.js';

/** 日期范围选择器 */
function DateRangeSelect({
  mode,
  onChange,
  t,
}: {
  mode: string;
  onChange: (value: string) => void;
  t: (key: string) => string;
}) {
  return (
    <select
      className="param-input"
      style={{ width: 140 }}
      value={mode}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">{t('params.allHistory')}</option>
      <option value="custom">{t('params.customRange')}</option>
    </select>
  );
}

/** 日期范围选择卡片 */
function DateRangeCard({ mode, onChange }: { mode: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <ParamCard label={t('params.dateRange')}>
      <DateRangeSelect mode={mode} onChange={onChange} t={t} />
    </ParamCard>
  );
}

/** 起始资金输入 */
function StartingValueCard() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <ParamCard label={t('params.startingValue')}>
      <div className="param-input-prefix-wrap">
        <span className="param-input-prefix">{parameters.baseCurrency === 'usd' ? '$' : '¥'}</span>
        <input
          type="number"
          value={parameters.startingValue}
          min={1}
          step={1000}
          className="param-input param-input-with-prefix"
          onChange={(e) =>
            updateParameter('startingValue', Math.max(1, Number(e.target.value) || 0))
          }
        />
      </div>
    </ParamCard>
  );
}

/** 货币选择 */
function CurrencyCard() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <ParamCard label={t('params.currency')}>
      <select
        value={parameters.baseCurrency}
        className="param-input"
        onChange={(e) => updateParameter('baseCurrency', e.target.value as 'usd' | 'cny')}
      >
        <option value="usd">USD ($)</option>
        <option value="cny">CNY (¥)</option>
      </select>
    </ParamCard>
  );
}

/** 通胀调整 */
function InflationCard() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <ParamCard label={t('params.inflationAdjust')}>
      <label className="param-check">
        <input
          type="checkbox"
          checked={parameters.adjustForInflation}
          onChange={(e) => updateParameter('adjustForInflation', e.target.checked)}
        />
        <span>{t('params.adjustForInflation')}</span>
      </label>
    </ParamCard>
  );
}

/** 滚动窗口 */
function RollingWindowCard() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <ParamCard label={t('params.rollingWindow')}>
      <div className="param-input-suffix-wrap">
        <input
          type="number"
          value={parameters.rollingWindowMonths}
          min={1}
          max={120}
          className="param-input param-input-with-suffix"
          onChange={(e) =>
            updateParameter('rollingWindowMonths', Math.max(1, Number(e.target.value) || 12))
          }
        />
        <span className="param-input-suffix">{t('params.months')}</span>
      </div>
    </ParamCard>
  );
}

/** 日期输入 */
function DateCards({ mode }: { mode: string }) {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <>
      <ParamCard label={t('params.startDate')}>
        <input
          type="date"
          value={parameters.startDate}
          disabled={mode === 'all'}
          className="param-input"
          onChange={(e) => {
            const err = validateDateChange('startDate', e.target.value, parameters.endDate, t);
            if (err) {
              useToastStore.getState().addToast('warning', err);
              return;
            }
            updateParameter('startDate', e.target.value);
          }}
        />
      </ParamCard>
      <ParamCard label={t('params.endDate')}>
        <input
          type="date"
          value={parameters.endDate}
          disabled={mode === 'all'}
          className="param-input"
          onChange={(e) => {
            const err = validateDateChange('endDate', e.target.value, parameters.startDate, t);
            if (err) {
              useToastStore.getState().addToast('warning', err);
              return;
            }
            updateParameter('endDate', e.target.value);
          }}
        />
      </ParamCard>
    </>
  );
}

/** 扩展提款统计 */
function ExtendedStatsCard() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <ParamCard label={t('params.extendedStats')}>
      <label className="param-check">
        <input
          type="checkbox"
          checked={parameters.extendedWithdrawalStats}
          onChange={(e) => updateParameter('extendedWithdrawalStats', e.target.checked)}
        />
        <span>{t('params.extendedWithdrawalStats')}</span>
      </label>
    </ParamCard>
  );
}

/** 基准选择 */
function BenchmarkCard() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <ParamCard label={t('params.benchmark')}>
      <label className="param-check">
        <input
          type="checkbox"
          checked={parameters.benchmarkTicker !== ''}
          onChange={(e) => updateParameter('benchmarkTicker', e.target.checked ? 'SPY' : '')}
        />
        <span>{t('params.pickBenchmarkTicker')}</span>
      </label>
      {parameters.benchmarkTicker !== '' && (
        <TickerInput
          value={parameters.benchmarkTicker}
          onChange={(v) => updateParameter('benchmarkTicker', v)}
          placeholder="SPY"
        />
      )}
    </ParamCard>
  );
}

/** 基本参数分区 */
function BasicParamsSection() {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);

  const dateRangeMode = parameters.startDate === '' && parameters.endDate === '' ? 'all' : 'custom';

  const handleDateRangeChange = (value: string) => {
    if (value === 'all') {
      updateParameter('startDate', '');
      updateParameter('endDate', '');
    } else {
      updateParameter('startDate', DEFAULT_BACKTEST_START_DATE);
      updateParameter('endDate', DEFAULT_END_DATE);
    }
  };

  return (
    <>
      <ParamRow>
        <DateRangeCard mode={dateRangeMode} onChange={handleDateRangeChange} />
        <DateCards mode={dateRangeMode} />
        <StartingValueCard />
        <InflationCard />
        <RollingWindowCard />
      </ParamRow>
      <ParamRow>
        <ExtendedStatsCard />
        <BenchmarkCard />
        <CurrencyCard />
      </ParamRow>
    </>
  );
}

const BacktestParamsForm = memo(function BacktestParamsForm() {
  return (
    <>
      <BasicParamsSection />
      <CashflowLegsSection />
      <OneTimeCashflowSection />
    </>
  );
});

export default BacktestParamsForm;
