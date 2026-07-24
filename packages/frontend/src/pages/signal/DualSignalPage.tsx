/**
 * @file 双信号对比页面
 * @description 配置两个信号并按 AND/OR/XOR 组合，对比组合信号与单信号的统计与权益曲线
 * @route /dual-signal
 */
import { useTranslation } from 'react-i18next';
import { ToolPageLayout } from '@/components/layout/ToolPageLayout';
import { DualSignalParamsPanel } from './DualSignalParams.js';
import { DualSignalResultsPanel } from './DualSignalResults.js';
import { useDualSignalState } from './useDualSignalState.js';

/**
 * 双信号对比页面：ToolPageLayout 包参数面板 + 结果面板。
 * @returns 渲染的双信号对比页面
 */
export default function DualSignalPage() {
  const { t } = useTranslation();
  const s = useDualSignalState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('signal.dual.title')}</h1>
      </div>
      <ToolPageLayout
        title={t('signal.dual.paramsTitle')}
        params={
          <DualSignalParamsPanel
            cfg1={s.cfg1}
            cfg2={s.cfg2}
            combinationMethod={s.combinationMethod}
            ticker={s.ticker}
            startDate={s.startDate}
            endDate={s.endDate}
            isLoading={s.isLoading}
            onCfg1Change={s.setCfg1}
            onCfg2Change={s.setCfg2}
            onCombinationMethodChange={s.setCombinationMethod}
            onTickerChange={s.setTicker}
            onStartDateChange={s.setStartDate}
            onEndDateChange={s.setEndDate}
            onRun={s.runAnalysis}
          />
        }
        results={
          <DualSignalResultsPanel
            results={s.results}
            error={s.error}
            isLoading={s.isLoading}
          />
        }
      />
    </div>
  );
}
