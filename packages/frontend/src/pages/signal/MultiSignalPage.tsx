/**
 * @file 多信号聚合页面
 * @description 添加多个信号并按加权/投票/排名方式聚合，展示聚合统计、各信号贡献度与权益曲线
 * @route /multi-signal
 */
import { useTranslation } from 'react-i18next';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { useMultiSignalState } from './hooks/useMultiSignalState.js';
import { MultiSignalParamsPanel } from './SignalSelector.js';
import { MultiSignalResultsPanel } from './MultiSignalResultsChart.js';

export default function MultiSignalPage() {
  const { t } = useTranslation();
  const s = useMultiSignalState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('signal.multi.title')}</h1>
      </div>
      <ToolPageLayout
        title={t('signal.multi.paramsTitle')}
        params={
          <MultiSignalParamsPanel
            signals={s.signals}
            weights={s.weights}
            aggregationMethod={s.aggregationMethod}
            ticker={s.ticker}
            startDate={s.startDate}
            endDate={s.endDate}
            isLoading={s.isLoading}
            onAddSignal={s.addSignal}
            onRemoveSignal={s.removeSignal}
            onUpdateSignal={s.updateSignal}
            onUpdateWeight={s.updateWeight}
            onAggregationMethodChange={s.setAggregationMethod}
            onTickerChange={s.setTicker}
            onStartDateChange={s.setStartDate}
            onEndDateChange={s.setEndDate}
            onRun={s.runAnalysis}
          />
        }
        results={
          <MultiSignalResultsPanel results={s.results} error={s.error} isLoading={s.isLoading} />
        }
      />
    </div>
  );
}
