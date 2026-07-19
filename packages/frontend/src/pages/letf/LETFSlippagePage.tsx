/**
 * @file LETF Slippage（杠杆 ETF 滑点）页面
 * @description 分析杠杆 ETF 相对基准指数的滑点拖累，展示滑点曲线、年化拖累、实际杠杆 vs 名义杠杆及对比统计
 * @route /letf-slippage
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { LETFParamsPanel } from './LETFSlippageParams.js';
import { LETFResultsPanel } from './LETFSlippageResults.js';
import { useLETFSlippageState } from './hooks/useLETFSlippageState.js';

/** SEO 卡：抽出以避免触发 max-lines-per-function 规则 */
function LetfSlippageSeoCard({ t }: { t: TFunction }) {
  return (
    <ToolSeoCard
      desc={t('letf.seo.desc')}
      features={[
        {
          title: t('letf.seo.analyzableTitle'),
          desc: t('letf.seo.analyzableDesc'),
        },
        {
          title: t('letf.seo.scenarioTitle'),
          desc: t('letf.seo.scenarioDesc'),
        },
      ]}
      related={[
        { title: t('nav.portfolioBacktest'), href: '/' },
        { title: t('nav.assetAnalysis'), href: '/analysis' },
        { title: t('nav.pca'), href: '/pca' },
      ]}
    />
  );
}

export default function LETFSlippagePage() {
  const { t } = useTranslation();
  const {
    letfTicker,
    benchmarkTicker,
    leverage,
    startDate,
    endDate,
    isLoading,
    error,
    results,
    setLetfTicker,
    setBenchmarkTicker,
    setLeverage,
    setStartDate,
    setEndDate,
    runAnalysis,
  } = useLETFSlippageState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('letf.title')}</h1>
      </div>
      <LetfSlippageSeoCard t={t} />
      <ToolPageLayout
        title={t('letf.paramsTitle')}
        params={
          <LETFParamsPanel
            letfTicker={letfTicker}
            benchmarkTicker={benchmarkTicker}
            leverage={leverage}
            startDate={startDate}
            endDate={endDate}
            isLoading={isLoading}
            onLetfTickerChange={setLetfTicker}
            onBenchmarkTickerChange={setBenchmarkTicker}
            onLeverageChange={setLeverage}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onRun={runAnalysis}
          />
        }
        results={
          <LETFResultsPanel
            results={results}
            error={error}
            isLoading={isLoading}
            leverage={leverage}
          />
        }
      />
    </div>
  );
}
