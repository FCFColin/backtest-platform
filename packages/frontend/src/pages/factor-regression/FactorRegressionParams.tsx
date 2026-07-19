/**
 * @file 因子回归参数面板子组件
 * @description 承载日期/频率/无风险利率源/因子选择器与参数区，以及参数面板容器与执行按钮
 */
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { ParamsPanel } from '../../components/ParamsPanel.js';
import LoadingButton from '../../components/LoadingButton.js';
import { PortfolioEditor } from '../../components/ParamsShared.js';
import { FACTOR_OPTIONS, RF_SOURCE_OPTIONS } from './factorRegressionUtils.js';
import type { AssetItem, ReturnFrequency } from './factorRegressionUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

/** 因子选择器 */
function FactorSelector({
  selectedFactors,
  onToggle,
}: {
  selectedFactors: string[];
  onToggle: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FACTOR_OPTIONS.map((opt) => (
        <label
          key={opt.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 'var(--radius-control)',
            border: `1px solid ${selectedFactors.includes(opt.key) ? 'var(--brand)' : 'var(--border-soft)'}`,
            backgroundColor: selectedFactors.includes(opt.key)
              ? 'var(--brand-soft)'
              : 'transparent',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: selectedFactors.includes(opt.key) ? 'var(--brand)' : 'var(--text-muted)',
            transition: 'all .12s',
          }}
        >
          <input
            type="checkbox"
            checked={selectedFactors.includes(opt.key)}
            onChange={() => onToggle(opt.key)}
            style={{ display: 'none' }}
          />
          {t(opt.label)}
          <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>({t(opt.desc)})</span>
        </label>
      ))}
    </div>
  );
}

function FactorDateFreqRow({
  startDate,
  endDate,
  returnFrequency,
  rfSource,
  onStartDateChange,
  onEndDateChange,
  onReturnFrequencyChange,
  onRfSourceChange,
}: {
  startDate: string;
  endDate: string;
  returnFrequency: ReturnFrequency;
  rfSource: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onReturnFrequencyChange: (v: ReturnFrequency) => void;
  onRfSourceChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="params-row">
      <div className="param-field">
        <label className="param-label">{t('factorRegression.startDate')}</label>
        <input
          type="date"
          className="param-input"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
        />
      </div>
      <div className="param-field">
        <label className="param-label">{t('factorRegression.endDate')}</label>
        <input
          type="date"
          className="param-input"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
        />
      </div>
      <div className="param-field" style={{ width: 110 }}>
        <label className="param-label">{t('factorRegression.returnFrequency')}</label>
        <select
          className="param-input"
          value={returnFrequency}
          onChange={(e) => onReturnFrequencyChange(e.target.value as ReturnFrequency)}
        >
          <option value="monthly">{t('factorRegression.freqMonthly')}</option>
          <option value="daily">{t('factorRegression.freqDaily')}</option>
        </select>
      </div>
      <div className="param-field" style={{ width: 150 }}>
        <label className="param-label">{t('factorRegression.rfRate')}</label>
        <select
          className="param-input"
          value={rfSource}
          onChange={(e) => onRfSourceChange(e.target.value)}
        >
          {RF_SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.label)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** 因子回归参数区（全历史开关 + 日期/频率/无风险利率源 + 因子选择） */
function FactorParamsSection({
  startDate,
  endDate,
  returnFrequency,
  rfSource,
  selectedFactors,
  onStartDateChange,
  onEndDateChange,
  onReturnFrequencyChange,
  onRfSourceChange,
  onToggleFactor,
}: {
  startDate: string;
  endDate: string;
  returnFrequency: ReturnFrequency;
  rfSource: string;
  selectedFactors: string[];
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onReturnFrequencyChange: (v: ReturnFrequency) => void;
  onRfSourceChange: (v: string) => void;
  onToggleFactor: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="params-section">
      <div className="params-title">{t('factorRegression.paramsSettings')}</div>
      <div className="params-row" style={{ marginBottom: 8 }}>
        <label className="param-check">
          <input
            type="checkbox"
            checked={startDate === '' && endDate === ''}
            onChange={(e) => {
              if (e.target.checked) {
                onStartDateChange('');
                onEndDateChange('');
              } else {
                onStartDateChange(DEFAULT_BACKTEST_START_DATE);
                onEndDateChange(DEFAULT_END_DATE);
              }
            }}
          />
          <span>{t('factorRegression.allHistory')}</span>
        </label>
      </div>
      <FactorDateFreqRow
        startDate={startDate}
        endDate={endDate}
        returnFrequency={returnFrequency}
        rfSource={rfSource}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onReturnFrequencyChange={onReturnFrequencyChange}
        onRfSourceChange={onRfSourceChange}
      />
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          {t('factorRegression.factorSelect')}
        </div>
        <FactorSelector selectedFactors={selectedFactors} onToggle={onToggleFactor} />
      </div>
    </div>
  );
}

/** 因子回归参数面板 props */
interface FactorRegressionParamsPanelProps {
  startDate: string;
  endDate: string;
  returnFrequency: ReturnFrequency;
  rfSource: string;
  selectedFactors: string[];
  assets: AssetItem[];
  totalWeight: number;
  isLoading: boolean;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onReturnFrequencyChange: (v: ReturnFrequency) => void;
  onRfSourceChange: (v: string) => void;
  onToggleFactor: (key: string) => void;
  onAddAsset: () => void;
  onRemoveAsset: (i: number) => void;
  onUpdateAsset: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
  onRun: () => void;
}

/** 因子回归参数面板（参数区 + 资产编辑 + 执行按钮） */
export function FactorRegressionParamsPanel(props: FactorRegressionParamsPanelProps) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <FactorParamsSection
        startDate={props.startDate}
        endDate={props.endDate}
        returnFrequency={props.returnFrequency}
        rfSource={props.rfSource}
        selectedFactors={props.selectedFactors}
        onStartDateChange={props.onStartDateChange}
        onEndDateChange={props.onEndDateChange}
        onReturnFrequencyChange={props.onReturnFrequencyChange}
        onRfSourceChange={props.onRfSourceChange}
        onToggleFactor={props.onToggleFactor}
      />
      <PortfolioEditor
        assets={props.assets}
        totalWeight={props.totalWeight}
        onAdd={props.onAddAsset}
        onRemove={props.onRemoveAsset}
        onUpdate={props.onUpdateAsset}
      />
      <div className="bt-action-row">
        <LoadingButton
          isLoading={props.isLoading}
          onClick={props.onRun}
          loadingText={t('factorRegression.analyzing')}
          style={{ width: '100%' }}
        >
          <Play className="w-4 h-4" />
          {t('factorRegression.startAnalysis')}
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}
