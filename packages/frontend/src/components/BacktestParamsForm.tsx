/**
 * @file 回测参数表单
 * @description 回测核心参数配置面板容器。组合各可折叠分区：
 * 基本参数（本文件）、组合高级设置/再平衡带、周期性现金流、一次性现金流。
 * 子分区按职责拆分到 BacktestParamsForm.*.tsx，纯函数见 backtestParamsUtils.ts。
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '@/store/backtestStore';
import TickerInput from './TickerInput.js';
import { ParamsPanel, ParamsSection } from './ParamsPanel.js';
import { DateRangeFields } from './BacktestParamsForm.DateRange.js';
import { AdvancedSettingsSection } from './BacktestParamsForm.Rebalance.js';
import { CashflowLegsSection, OneTimeCashflowSection } from './BacktestParamsForm.CashflowLegs.js';
import type { TFunctionProp } from './BacktestParamsForm.types.js';

/** 基本参数分区 */
function BasicParamsSection() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);

  return (
    <ParamsSection title={t('params.basicParams')} info={t('params.basicParamsInfo')}>
      <div className="params-row">
        <DateRangeFields
          startDate={parameters.startDate}
          endDate={parameters.endDate}
          onUpdate={(field, value) => updateParameter(field, value)}
          t={t}
        />
        <StartingValueField t={t} />
        <CurrencyField t={t} />
        <InflationToggle t={t} />
        <RollingWindowField t={t} />
        <label className="param-check">
          <input
            type="checkbox"
            checked={parameters.extendedWithdrawalStats}
            onChange={(e) => updateParameter('extendedWithdrawalStats', e.target.checked)}
          />
          <span>{t('params.extendedWithdrawalStats')}</span>
        </label>
        <BenchmarkField t={t} />
      </div>
    </ParamsSection>
  );
}

function StartingValueField({ t }: TFunctionProp) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <div className="param-field param-field-start-val">
      <label className="param-label">{t('params.startingValue')}</label>
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
    </div>
  );
}

function CurrencyField({ t }: TFunctionProp) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <div className="param-field" style={{ width: 90 }}>
      <label className="param-label">{t('params.currency')}</label>
      <select
        value={parameters.baseCurrency}
        className="param-input"
        onChange={(e) => updateParameter('baseCurrency', e.target.value as 'usd' | 'cny')}
      >
        <option value="usd">USD ($)</option>
        <option value="cny">CNY (¥)</option>
      </select>
    </div>
  );
}

function InflationToggle({ t }: TFunctionProp) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <>
      <label className="param-toggle">
        <span>{t('params.inflationAdjust')}</span>
        <div
          className={`toggle-switch ${parameters.adjustForInflation ? 'active' : ''}`}
          onClick={() => updateParameter('adjustForInflation', !parameters.adjustForInflation)}
        />
      </label>
      {parameters.adjustForInflation && (
        <span
          className="param-hint"
          style={{ color: '#f59e0b', fontSize: '12px', whiteSpace: 'nowrap' }}
        >
          {parameters.baseCurrency === 'usd' ? t('params.useUSCPI') : t('params.useCNCPI')}
        </span>
      )}
    </>
  );
}

function RollingWindowField({ t }: TFunctionProp) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <div className="param-field param-field-rolling">
      <label className="param-label">{t('params.rollingWindow')}</label>
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
    </div>
  );
}

function BenchmarkField({ t }: TFunctionProp) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <>
      <label className="param-check">
        <input
          type="checkbox"
          checked={parameters.benchmarkTicker !== ''}
          onChange={(e) => updateParameter('benchmarkTicker', e.target.checked ? 'SPY' : '')}
        />
        <span>{t('params.selectBenchmark')}</span>
      </label>
      {parameters.benchmarkTicker !== '' && (
        <div className="param-field" style={{ width: 120 }}>
          <TickerInput
            value={parameters.benchmarkTicker}
            onChange={(v) => updateParameter('benchmarkTicker', v)}
            placeholder="SPY"
          />
        </div>
      )}
    </>
  );
}

const BacktestParamsForm = memo(function BacktestParamsForm() {
  const { t } = useTranslation();
  return (
    <div className="params-section">
      <div className="params-title">{t('params.title')}</div>
      <ParamsPanel>
        <BasicParamsSection />
        <AdvancedSettingsSection />
        <CashflowLegsSection />
        <OneTimeCashflowSection />
      </ParamsPanel>
    </div>
  );
});

export default BacktestParamsForm;
