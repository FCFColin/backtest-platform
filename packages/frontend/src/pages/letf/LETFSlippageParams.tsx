/**
 * @file LETF Slippage 参数面板
 * @description ETF 选择与时间范围输入，触发滑点分析
 */
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import LoadingButton from '../../components/LoadingButton.js';
import { ParamRow, ParamCard } from '../../components/params/index.js';

/** 参数面板属性 */
interface LETFParamsProps {
  letfTicker: string;
  benchmarkTicker: string;
  leverage: number;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onLetfTickerChange: (v: string) => void;
  onBenchmarkTickerChange: (v: string) => void;
  onLeverageChange: (v: number) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

/** ETF 选择区块 */
function LetfEtfSelection({
  letfTicker,
  benchmarkTicker,
  leverage,
  onLetfTickerChange,
  onBenchmarkTickerChange,
  onLeverageChange,
}: Pick<
  LETFParamsProps,
  | 'letfTicker'
  | 'benchmarkTicker'
  | 'leverage'
  | 'onLetfTickerChange'
  | 'onBenchmarkTickerChange'
  | 'onLeverageChange'
>) {
  const { t } = useTranslation();
  return (
    <ParamsSection title={t('letf.etf.section')} info={t('letf.etf.sectionInfo')}>
      <ParamCard label={t('letf.etf.letfTicker')}>
        <input
          type="text"
          className="param-input"
          value={letfTicker}
          onChange={(e) => onLetfTickerChange(e.target.value)}
          placeholder={t('letf.etf.letfTickerPlaceholder')}
        />
      </ParamCard>
      <ParamCard label={t('letf.etf.benchmarkTicker')}>
        <input
          type="text"
          className="param-input"
          value={benchmarkTicker}
          onChange={(e) => onBenchmarkTickerChange(e.target.value)}
          placeholder={t('letf.etf.benchmarkTickerPlaceholder')}
        />
      </ParamCard>
      <ParamCard label={t('letf.etf.leverage')}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[2, 3].map((lev) => (
            <button
              key={lev}
              type="button"
              onClick={() => onLeverageChange(lev)}
              className="param-input"
              style={{
                flex: 1,
                cursor: 'pointer',
                fontWeight: 600,
                textAlign: 'center',
                ...(leverage === lev
                  ? { borderColor: 'var(--brand)', backgroundColor: 'var(--brand)', color: '#fff' }
                  : {}),
              }}
            >
              {lev}x
            </button>
          ))}
        </div>
      </ParamCard>
    </ParamsSection>
  );
}

export function LETFParamsPanel({
  letfTicker,
  benchmarkTicker,
  leverage,
  startDate,
  endDate,
  isLoading,
  onLetfTickerChange,
  onBenchmarkTickerChange,
  onLeverageChange,
  onStartDateChange,
  onEndDateChange,
  onRun,
}: LETFParamsProps) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <LetfEtfSelection
        letfTicker={letfTicker}
        benchmarkTicker={benchmarkTicker}
        leverage={leverage}
        onLetfTickerChange={onLetfTickerChange}
        onBenchmarkTickerChange={onBenchmarkTickerChange}
        onLeverageChange={onLeverageChange}
      />

      <ParamsSection title={t('letf.dateRange.section')}>
        <ParamRow>
          <ParamCard label={t('letf.dateRange.startDate')}>
            <input
              type="date"
              className="param-input"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </ParamCard>
          <ParamCard label={t('letf.dateRange.endDate')}>
            <input
              type="date"
              className="param-input"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </ParamCard>
        </ParamRow>
      </ParamsSection>

      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={onRun} loadingText={t('letf.analyzing')}>
          <Play className="w-4 h-4" />
          {t('letf.startAnalysis')}
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}
