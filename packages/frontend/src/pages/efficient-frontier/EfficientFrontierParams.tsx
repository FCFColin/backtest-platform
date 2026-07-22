import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Play, Plus, X } from 'lucide-react';
import LoadingButton from '../../components/LoadingButton.js';
import { ParamRow, ParamCard, ActionBar } from '../../components/params/index.js';
import type { SolveSpeed, FrontierSolver, ReturnObjective } from './efficientFrontierTypes.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

const solveSpeedOptions = (t: TFunction) => [
  { value: 'ultrafast', label: t('efficientFrontier.solveSpeed.ultrafast') },
  { value: 'fast', label: t('efficientFrontier.solveSpeed.fast') },
  { value: 'medium', label: t('efficientFrontier.solveSpeed.medium') },
  { value: 'slow', label: t('efficientFrontier.solveSpeed.slow') },
];
const rebalanceFreqOptions = (t: TFunction) => [
  { value: 'daily', label: t('efficientFrontier.rebalanceFreq.daily') },
  { value: 'weekly', label: t('efficientFrontier.rebalanceFreq.weekly') },
  { value: 'monthly', label: t('efficientFrontier.rebalanceFreq.monthly') },
  { value: 'quarterly', label: t('efficientFrontier.rebalanceFreq.quarterly') },
  { value: 'yearly', label: t('efficientFrontier.rebalanceFreq.yearly') },
];
const returnObjOptions = (t: TFunction) => [
  { value: 'maxCagr', label: t('efficientFrontier.returnObjective.maxCagr') },
  { value: 'minVolatility', label: t('efficientFrontier.returnObjective.minVolatility') },
];
const solverOptions = (t: TFunction) => [
  { value: 'markowitz', label: t('efficientFrontier.solver.markowitz') },
  { value: 'nsga2', label: t('efficientFrontier.solver.nsga2') },
];

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <ParamCard label={label}>
      <select className="param-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </ParamCard>
  );
}

interface FrontierParamsProps {
  tickers: string[];
  startDate: string;
  endDate: string;
  numPoints: number;
  solveSpeed: SolveSpeed;
  minInclusionWeight: number;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  onAddTicker: () => void;
  onRemoveTicker: (i: number) => void;
  onUpdateTicker: (i: number, val: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onNumPointsChange: (v: number) => void;
  onSolveSpeedChange: (v: SolveSpeed) => void;
  onMinInclusionWeightChange: (v: number) => void;
  onRebalanceFrequencyChange: (v: string) => void;
  onAllowCashChange: (v: boolean) => void;
  onReturnObjectiveChange: (v: ReturnObjective) => void;
  onSolverChange: (v: FrontierSolver) => void;
  isLoading: boolean;
  onRun: () => void;
}

function FrontierDateRange({ p }: { p: FrontierParamsProps }) {
  const { t } = useTranslation();
  return (
    <ParamRow>
      <ParamCard label={t('efficientFrontier.params.allHistory')}>
        <label className="param-check">
          <input
            type="checkbox"
            checked={p.startDate === '' && p.endDate === ''}
            onChange={(e) => {
              if (e.target.checked) {
                p.onStartDateChange('');
                p.onEndDateChange('');
              } else {
                p.onStartDateChange(DEFAULT_BACKTEST_START_DATE);
                p.onEndDateChange(DEFAULT_END_DATE);
              }
            }}
          />
          <span>{t('efficientFrontier.params.allHistory')}</span>
        </label>
      </ParamCard>
      <ParamCard label={t('efficientFrontier.params.startDate')}>
        <input
          type="date"
          className="param-input"
          value={p.startDate}
          onChange={(e) => p.onStartDateChange(e.target.value)}
        />
      </ParamCard>
      <ParamCard label={t('efficientFrontier.params.endDate')}>
        <input
          type="date"
          className="param-input"
          value={p.endDate}
          onChange={(e) => p.onEndDateChange(e.target.value)}
        />
      </ParamCard>
      <ParamCard label={t('efficientFrontier.params.numPoints')}>
        <input
          type="number"
          className="param-input"
          value={p.numPoints}
          onChange={(e) => p.onNumPointsChange(Number(e.target.value))}
          min={5}
          max={100}
        />
      </ParamCard>
    </ParamRow>
  );
}

function FrontierAdvancedFields({ p }: { p: FrontierParamsProps }) {
  const { t } = useTranslation();
  return (
    <ParamRow>
      <SelectField
        label={t('efficientFrontier.params.solveSpeed')}
        value={p.solveSpeed}
        onChange={(v) => p.onSolveSpeedChange(v as SolveSpeed)}
        options={solveSpeedOptions(t)}
      />
      <ParamCard label={t('efficientFrontier.params.minInclusionWeight')}>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={p.minInclusionWeight}
            onChange={(e) => p.onMinInclusionWeightChange(Number(e.target.value))}
            min={0}
            max={100}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </ParamCard>
      <SelectField
        label={t('efficientFrontier.params.rebalanceFreq')}
        value={p.rebalanceFrequency}
        onChange={p.onRebalanceFrequencyChange}
        options={rebalanceFreqOptions(t)}
      />
      <SelectField
        label={t('efficientFrontier.params.returnObjective')}
        value={p.returnObjective}
        onChange={(v) => p.onReturnObjectiveChange(v as ReturnObjective)}
        options={returnObjOptions(t)}
      />
      <SelectField
        label={t('efficientFrontier.params.solver')}
        value={p.solver}
        onChange={(v) => p.onSolverChange(v as FrontierSolver)}
        options={solverOptions(t)}
      />
      <ParamCard label={t('efficientFrontier.params.allowCash')}>
        <label className="param-check">
          <input
            type="checkbox"
            checked={p.allowCash}
            onChange={(e) => p.onAllowCashChange(e.target.checked)}
          />
          <span>{t('efficientFrontier.params.allowCash')}</span>
        </label>
      </ParamCard>
    </ParamRow>
  );
}

function FrontierParamsFields({ p }: { p: FrontierParamsProps }) {
  const { t } = useTranslation();
  return (
    <div className="param-section">
      <div className="param-section-header">
        <h2 className="param-section-title">{t('efficientFrontier.params.title')}</h2>
      </div>
      <div className="param-section-content">
        <FrontierDateRange p={p} />
        <FrontierAdvancedFields p={p} />
      </div>
    </div>
  );
}

function FrontierTickerList({ p }: { p: FrontierParamsProps }) {
  const { t } = useTranslation();
  return (
    <div className="portfolios-section">
      <div className="portfolios-header">
        <span className="portfolios-title">{t('efficientFrontier.params.tickerList')}</span>
        <button className="portfolios-add-btn" onClick={p.onAddTicker}>
          <Plus className="w-4 h-4" />
          {t('efficientFrontier.params.addAsset')}
        </button>
      </div>
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {p.tickers.map((tk, i) => (
            <div key={tk || i} className="ticker-row">
              <input
                type="text"
                value={tk}
                onChange={(e) => p.onUpdateTicker(i, e.target.value)}
                placeholder={t('efficientFrontier.params.tickerPlaceholder')}
                className="ticker-input"
              />
              {p.tickers.length > 2 && (
                <button
                  onClick={() => p.onRemoveTicker(i)}
                  className="row-remove-btn"
                  title={t('efficientFrontier.params.delete')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FrontierParams(props: FrontierParamsProps) {
  const { t } = useTranslation();
  return (
    <div className="bt-main-card card">
      <FrontierParamsFields p={props} />
      <ActionBar>
        <LoadingButton
          isLoading={props.isLoading}
          onClick={props.onRun}
          loadingText={t('efficientFrontier.params.calculating')}
        >
          <Play className="w-4 h-4" />
          {t('efficientFrontier.params.calcFrontier')}
        </LoadingButton>
      </ActionBar>
      <FrontierTickerList p={props} />
    </div>
  );
}

export { FrontierParams };
export type { FrontierSolver, ReturnObjective };
