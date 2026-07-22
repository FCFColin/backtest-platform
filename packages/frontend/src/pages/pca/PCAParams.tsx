/**
 * @file PCA 参数面板
 * @description 资产选择 + 日期范围 + 主成分数配置；从 PCAPage 拆分以便独立维护。
 */
import { useTranslation } from 'react-i18next';
import { Play, Plus, X } from 'lucide-react';
import LoadingButton from '../../components/LoadingButton.js';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import { ParamRow, ParamCard, ActionBar } from '../../components/params/index.js';

/** PCA 参数面板 Props */
interface PCAParamsProps {
  tickers: string[];
  startDate: string;
  endDate: string;
  numComponents: number | '';
  isLoading: boolean;
  onAddTicker: () => void;
  onRemoveTicker: (idx: number) => void;
  onUpdateTicker: (idx: number, val: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onNumComponentsChange: (v: number | '') => void;
  onRun: () => void;
}

/** PCA 资产选择区块 */
function PcaAssetSelection({
  tickers,
  onAddTicker,
  onRemoveTicker,
  onUpdateTicker,
}: Pick<PCAParamsProps, 'tickers' | 'onAddTicker' | 'onRemoveTicker' | 'onUpdateTicker'>) {
  const { t } = useTranslation();
  return (
    <ParamsSection title={t('pca.asset.section')} info={t('pca.asset.sectionInfo')}>
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {tickers.map((tk, idx) => (
            <div key={idx} className="ticker-row">
              <input
                type="text"
                value={tk}
                onChange={(e) => onUpdateTicker(idx, e.target.value)}
                placeholder={t('pca.asset.tickerPlaceholder')}
                className="ticker-input"
              />
              {tickers.length > 1 && (
                <button
                  onClick={() => onRemoveTicker(idx)}
                  className="row-remove-btn"
                  title={t('pca.asset.delete')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <button className="portfolios-add-btn" onClick={onAddTicker} style={{ marginTop: 8 }}>
        <Plus className="w-4 h-4" />
        {t('pca.asset.addTicker')}
      </button>
    </ParamsSection>
  );
}

/** PCA 参数面板 */
export function PCAParamsPanel({
  tickers,
  startDate,
  endDate,
  numComponents,
  isLoading,
  onAddTicker,
  onRemoveTicker,
  onUpdateTicker,
  onStartDateChange,
  onEndDateChange,
  onNumComponentsChange,
  onRun,
}: PCAParamsProps) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <PcaAssetSelection
        tickers={tickers}
        onAddTicker={onAddTicker}
        onRemoveTicker={onRemoveTicker}
        onUpdateTicker={onUpdateTicker}
      />

      <ParamsSection title={t('pca.dateRange.section')}>
        <ParamRow>
          <ParamCard label={t('pca.dateRange.startDate')}>
            <input
              type="date"
              className="param-input"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </ParamCard>
          <ParamCard label={t('pca.dateRange.endDate')}>
            <input
              type="date"
              className="param-input"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </ParamCard>
        </ParamRow>
      </ParamsSection>

      <ParamsSection title={t('pca.params.section')} defaultOpen={false}>
        <ParamRow>
          <ParamCard label={t('pca.params.numComponents')}>
            <div className="param-input-suffix-wrap">
              <input
                type="number"
                min={1}
                className="param-input param-input-with-suffix"
                value={numComponents}
                onChange={(e) =>
                  onNumComponentsChange(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder={t('pca.params.numComponentsPlaceholder')}
              />
              <span className="param-input-suffix">{t('pca.params.numComponentsSuffix')}</span>
            </div>
          </ParamCard>
        </ParamRow>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          {t('pca.params.numComponentsHint')}
        </div>
      </ParamsSection>

      <ActionBar>
        <LoadingButton isLoading={isLoading} onClick={onRun} loadingText={t('pca.analyzing')}>
          <Play className="w-4 h-4" />
          {t('pca.startAnalysis')}
        </LoadingButton>
      </ActionBar>
    </ParamsPanel>
  );
}
