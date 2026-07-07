/** @file Optimizer params panel components */
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2, Plus, X } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../ParamsPanel';
import type { OptimizerState, SolverType } from './types.js';

function TickerEditor({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  const add = () => s.setTickers([...s.tickers, '']);
  const remove = (i: number) => {
    if (s.tickers.filter(Boolean).length <= 2) return;
    s.setTickers(s.tickers.filter((_, idx) => idx !== i));
  };
  const update = (i: number, v: string) => {
    const n = [...s.tickers];
    n[i] = v;
    s.setTickers(n);
  };
  return (
    <ParamsSection title={t('optimizer.assetSelection')} info={t('optimizer.assetSelectionInfo')}>
      <div
        className="portfolio-card"
        style={{ width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' }}
      >
        {s.tickers.map((tk, i) => (
          <div key={tk || i} className="ticker-row">
            <input
              type="text"
              value={tk}
              onChange={(e) => update(i, e.target.value)}
              placeholder={t('optimizer.tickerPlaceholder')}
              className="ticker-input"
            />
            {s.tickers.length > 2 && (
              <button
                onClick={() => remove(i)}
                className="row-remove-btn"
                title={t('common.delete')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button className="toolbar-btn" onClick={add}>
          <Plus className="w-4 h-4" />
          {t('optimizer.addAsset')}
        </button>
      </div>
    </ParamsSection>
  );
}

function BasicDateFields({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  return (
    <>
      <label className="param-check">
        <input
          type="checkbox"
          checked={s.startDate === '' && s.endDate === ''}
          onChange={(e) => {
            if (e.target.checked) {
              s.setStartDate('');
              s.setEndDate('');
            } else {
              s.setStartDate('2010-01-01');
              s.setEndDate('2024-12-31');
            }
          }}
        />
        <span>{t('optimizer.allHistory')}</span>
      </label>
      <div className="param-field">
        <span className="param-label">{t('optimizer.startDate')}</span>
        <input
          type="date"
          className="param-input"
          value={s.startDate}
          onChange={(e) => s.setStartDate(e.target.value)}
        />
      </div>
      <div className="param-field">
        <span className="param-label">{t('optimizer.endDate')}</span>
        <input
          type="date"
          className="param-input"
          value={s.endDate}
          onChange={(e) => s.setEndDate(e.target.value)}
        />
      </div>
    </>
  );
}

function BasicNumberFields({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="param-field">
        <span className="param-label">{t('optimizer.objective')}</span>
        <select
          className="param-input"
          value={s.objective}
          onChange={(e) => s.setObjective(e.target.value)}
        >
          <option value="maxSharpe">{t('optimizer.maxSharpe')}</option>
          <option value="minVolatility">{t('optimizer.minVolatility')}</option>
          <option value="maxReturn">{t('optimizer.maxReturn')}</option>
        </select>
      </div>
      <div className="param-field param-field-rolling">
        <span className="param-label">{t('optimizer.minWeight')}</span>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={s.minWeight}
            onChange={(e) => s.setMinWeight(Number(e.target.value))}
            min={0}
            max={100}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </div>
      <div className="param-field param-field-rolling">
        <span className="param-label">{t('optimizer.maxWeight')}</span>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={s.maxWeight}
            onChange={(e) => s.setMaxWeight(Number(e.target.value))}
            min={0}
            max={100}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </div>
      <div className="param-field param-field-rolling">
        <span className="param-label">{t('optimizer.tbillRate')}</span>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            step="0.1"
            className="param-input param-input-with-suffix"
            value={s.tbillRate}
            onChange={(e) => s.setTbillRate(Number(e.target.value))}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </div>
      <div className="param-field">
        <span className="param-label">{t('optimizer.solver')}</span>
        <select
          className="param-input"
          value={s.solver}
          onChange={(e) => s.setSolver(e.target.value as SolverType)}
        >
          <option value="markowitz">{t('optimizer.solverMarkowitz')}</option>
          <option value="ga">{t('optimizer.solverGA')}</option>
        </select>
      </div>
      <label className="param-check">
        <input
          type="checkbox"
          checked={s.allowShort}
          onChange={(e) => s.setAllowShort(e.target.checked)}
        />
        <span>{t('optimizer.allowShort')}</span>
      </label>
    </>
  );
}

function BasicParams({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  return (
    <ParamsSection title={t('optimizer.basicParams')} info={t('optimizer.basicParamsInfo')}>
      <div className="params-row">
        <BasicDateFields s={s} />
        <BasicNumberFields s={s} />
      </div>
    </ParamsSection>
  );
}

function HistoricalConstraints({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  const items = [
    {
      checked: s.enableMaxDD,
      set: s.setEnableMaxDD,
      label: t('optimizer.maxDrawdownLT'),
      value: s.maxMaxDD,
      setVal: s.setMaxMaxDD,
      placeholder: t('optimizer.placeholderDD'),
    },
    {
      checked: s.enableMinCagr,
      set: s.setEnableMinCagr,
      label: t('optimizer.cagrGT'),
      value: s.minCagr,
      setVal: s.setMinCagr,
      placeholder: t('optimizer.placeholderCagr'),
    },
    {
      checked: s.enableMaxVol,
      set: s.setEnableMaxVol,
      label: t('optimizer.volatilityLT'),
      value: s.maxVol,
      setVal: s.setMaxVol,
      placeholder: t('optimizer.placeholderVol'),
    },
  ];
  return (
    <ParamsSection
      title={t('optimizer.historicalConstraints')}
      info={t('optimizer.historicalConstraintsInfo')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="param-check" style={{ width: 130, marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={c.checked}
                onChange={(e) => c.set(e.target.checked)}
              />
              <span>{c.label}</span>
            </label>
            <div className="param-field param-field-rolling" style={{ flex: 1 }}>
              <div className="param-input-suffix-wrap">
                <input
                  type="number"
                  step="0.1"
                  className="param-input param-input-with-suffix"
                  value={c.value}
                  onChange={(e) => c.setVal(e.target.value)}
                  placeholder={c.placeholder}
                  disabled={!c.checked}
                />
                <span className="param-input-suffix">%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ParamsSection>
  );
}

function AdvancedConstraints({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('optimizer.advancedConstraints')}
      defaultOpen={false}
      info={t('optimizer.advancedConstraintsInfo')}
    >
      <div className="params-row">
        <div className="param-field param-field-rolling">
          <span className="param-label">{t('optimizer.minSharpeLabel')}</span>
          <input
            type="number"
            step="0.01"
            className="param-input"
            value={s.minSharpe}
            onChange={(e) => s.setMinSharpe(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="param-field param-field-rolling">
          <span className="param-label">{t('optimizer.minSortinoLabel')}</span>
          <input
            type="number"
            step="0.01"
            className="param-input"
            value={s.minSortino}
            onChange={(e) => s.setMinSortino(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="param-field param-field-rolling">
          <span className="param-label">{t('optimizer.maxAvgDDLabel')}</span>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              step="0.1"
              className="param-input param-input-with-suffix"
              value={s.maxAvgDD}
              onChange={(e) => s.setMaxAvgDD(e.target.value)}
              placeholder="—"
            />
            <span className="param-input-suffix">%</span>
          </div>
        </div>
        <div className="param-field">
          <span className="param-label">{t('optimizer.maxHoldings')}</span>
          <input
            type="number"
            className="param-input"
            value={s.maxHoldings}
            onChange={(e) => s.setMaxHoldings(e.target.value)}
            placeholder="—"
            min={2}
          />
        </div>
        <div className="param-field param-field-rolling">
          <span className="param-label">{t('optimizer.minWeightToInclude')}</span>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              className="param-input param-input-with-suffix"
              value={s.minWeightToInclude}
              onChange={(e) => s.setMinWeightToInclude(e.target.value)}
              placeholder="—"
              min={0}
              max={100}
            />
            <span className="param-input-suffix">%</span>
          </div>
        </div>
      </div>
    </ParamsSection>
  );
}

export function OptimizerParams({ s }: { s: OptimizerState }): ReactNode {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <TickerEditor s={s} />
      <BasicParams s={s} />
      <HistoricalConstraints s={s} />
      <AdvancedConstraints s={s} />
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <button
          onClick={() => void s.runOptimize()}
          disabled={s.isLoading || s.isCalculatingStats}
          className="main-action-btn"
          style={{ width: '100%' }}
        >
          {s.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {s.isCalculatingStats
            ? t('optimizer.calculatingStats')
            : s.isLoading
              ? t('optimizer.optimizing')
              : t('optimizer.startCalc')}
        </button>
      </div>
    </ParamsPanel>
  );
}
