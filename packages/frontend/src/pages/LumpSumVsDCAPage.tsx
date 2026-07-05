/**
 * @file 一次性投入 vs 定投对比页面
 * @description 对比一次性投入（Lump Sum）与定投（DCA）策略在不同标的下的收益与风险指标
 * @route /lumpsum-vs-dca
 */
import { Play } from 'lucide-react';
import { useLumpSumVsDCAState } from '../hooks/useLumpSumVsDCAState.js';
import { ParamsSection, PortfolioEditor } from '../components/lumpSumVsDCA/LumpSumVsDCAParams.js';
import {
  StatsTable,
  GrowthCurveChart,
  ConclusionAnalysis,
  RiskWarning,
} from '../components/lumpSumVsDCA/LumpSumVsDCAResults.js';
import { LumpSumVsDCAPresets } from '../components/lumpSumVsDCA/LumpSumVsDCAPresets.js';
import { fmtPct, fmtNum, fmtMoney } from '../components/lumpSumVsDCA/utils.js';
import LoadingButton from '../components/LoadingButton';

export default function LumpSumVsDCAPage() {
  const s = useLumpSumVsDCAState();
  const _fmtMoney = (v: number) => fmtMoney(s.baseCurrency, v);

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">一次性投资 vs 定投</h1>
      </div>
      <LumpSumVsDCAPresets />
      <div className="bt-main-card card">
        <ParamsSection
          startDate={s.startDate}
          setStartDate={s.setStartDate}
          endDate={s.endDate}
          setEndDate={s.setEndDate}
          startingValue={s.startingValue}
          setStartingValue={s.setStartingValue}
          baseCurrency={s.baseCurrency}
          setBaseCurrency={s.setBaseCurrency}
          adjustForInflation={s.adjustForInflation}
          setAdjustForInflation={s.setAdjustForInflation}
          dcaFrequency={s.dcaFrequency}
          setDcaFrequency={s.setDcaFrequency}
          dcaPeriods={s.dcaPeriods}
          setDcaPeriods={s.setDcaPeriods}
          investTbill={s.investTbill}
          setInvestTbill={s.setInvestTbill}
        />
        <PortfolioEditor
          assets={s.assets}
          addAsset={s.addAsset}
          removeAsset={s.removeAsset}
          updateAsset={s.updateAsset}
          totalWeight={s.totalWeight}
        />
        <div className="bt-action-row">
          <LoadingButton
            isLoading={s.isLoading}
            onClick={s.runComparison}
            loadingText="对比中..."
            style={{ width: '100%' }}
          >
            <Play className="w-4 h-4" />
            开始对比
          </LoadingButton>
        </div>
      </div>
      {s.error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
        >
          对比失败：{s.error}
        </div>
      )}
      {s.results.length === 2 && (
        <div className="bt-results-card card">
          <ConclusionAnalysis
            ls={s.results[0]}
            dca={s.results[1]}
            fmtPct={fmtPct}
            fmtMoney={_fmtMoney}
          />
          <div
            style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}
          >
            增长曲线对比
          </div>
          <GrowthCurveChart results={s.results} />
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--text-strong)',
              marginBottom: 12,
              marginTop: 24,
            }}
          >
            统计对比
          </div>
          <StatsTable results={s.results} fmtPct={fmtPct} fmtNum={fmtNum} fmtMoney={_fmtMoney} />
          <RiskWarning lsWins={s.results[0].finalValue > s.results[1].finalValue} />
        </div>
      )}
    </div>
  );
}
