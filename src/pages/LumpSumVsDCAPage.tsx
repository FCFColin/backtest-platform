/**
 * @file 一次性投入 vs 定投对比页面
 * @description 对比一次性投入（Lump Sum）与定投（DCA）策略在不同标的下的收益与风险指标
 * @route /lumpsum-vs-dca
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, X, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { CHART_COLORS } from '../../shared/types';
import type { Statistics } from '../../shared/types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import LoadingButton from '../components/LoadingButton';

type DcaFrequency = 'monthly' | 'quarterly';

interface CompareResult {
  label: string;
  cagr: number;
  stdev: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  calmar?: number;
  maxDrawdownDuration?: number;
  ulcerIndex?: number;
  finalValue: number;
  growthCurve: Array<{ date: string; value: number }>;
}

function extractStats(
  stats: Statistics,
): Pick<
  CompareResult,
  | 'cagr'
  | 'stdev'
  | 'maxDrawdown'
  | 'sharpe'
  | 'sortino'
  | 'calmar'
  | 'maxDrawdownDuration'
  | 'ulcerIndex'
> {
  return {
    cagr: stats?.cagr ?? 0,
    stdev: stats?.stdev ?? 0,
    maxDrawdown: stats?.maxDrawdown ?? 0,
    sharpe: stats?.sharpe ?? 0,
    sortino: stats?.sortino ?? 0,
    calmar: stats?.calmar,
    maxDrawdownDuration: stats?.maxDrawdownDuration,
    ulcerIndex: stats?.ulcerIndex,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toResult(p: any, label: string): CompareResult {
  const curve = p.growthCurve ?? [];
  return {
    label,
    ...extractStats(p.statistics as Statistics),
    finalValue: curve.length > 0 ? curve[curve.length - 1].value : 0,
    growthCurve: curve,
  };
}

async function fetchBacktest(body: unknown) {
  const res = await fetch('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

function useLumpSumVsDCAState() {
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [startingValue, setStartingValue] = useState(120000);
  const [baseCurrency, setBaseCurrency] = useState<'usd' | 'cny'>('usd');
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [dcaFrequency, setDcaFrequency] = useState<DcaFrequency>('monthly');
  const [dcaPeriods, setDcaPeriods] = useState(12);
  const [investTbill, setInvestTbill] = useState(false);
  const [assets, setAssets] = useState([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<CompareResult[]>([]);

  const addAsset = () => setAssets([...assets, { ticker: '', weight: 0 }]);
  const removeAsset = (i: number) => setAssets(assets.filter((_, idx) => idx !== i));
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...assets];
    next[i] = { ...next[i], [field]: val };
    setAssets(next);
  };
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);

  const runComparison = () => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      setError('请至少添加一个标的');
      return;
    }
    if (Math.abs(totalWeight - 100) > 0.01) {
      setError('权重合计必须为 100%');
      return;
    }
    setResults([]);
    run(() => doComparison(validAssets));
  };

  async function doComparison(validAssets: typeof assets) {
    const baseParams = {
      startDate,
      endDate,
      startingValue,
      baseCurrency,
      adjustForInflation,
      rollingWindowMonths: 12,
      benchmarkTicker: '',
      extendedWithdrawalStats: false,
      cashflowLegs: [],
      oneTimeCashflows: [],
    };
    const portfolioDef = {
      name: '组合',
      assets: validAssets,
      rebalanceFrequency: 'quarterly' as const,
      rebalanceOffset: 0,
      drag: 0,
      totalReturn: true,
    };
    const lumpSumBody = {
      portfolios: [{ ...portfolioDef, name: '一次性投资' }],
      parameters: { ...baseParams, startingValue },
    };
    const contributionAmount = Math.round(startingValue / dcaPeriods);
    const dcaCashflowLegs = [
      {
        id: `dca-${Date.now()}`,
        amount: contributionAmount,
        type: 'contribution' as const,
        frequency: dcaFrequency === 'monthly' ? ('monthly' as const) : ('quarterly' as const),
        offset: 0,
      },
    ];
    const dcaBody = {
      portfolios: [{ ...portfolioDef, name: '定投' }],
      parameters: { ...baseParams, startingValue: 0, cashflowLegs: dcaCashflowLegs },
    };

    const [lumpSumRes, dcaRes] = await Promise.all([
      fetchBacktest(lumpSumBody),
      fetchBacktest(dcaBody),
    ]);
    if (!lumpSumRes.ok) throw new Error(`一次性投资回测失败: HTTP ${lumpSumRes.status}`);
    if (!dcaRes.ok) throw new Error(`定投回测失败: HTTP ${dcaRes.status}`);

    const lumpSumJson = await lumpSumRes.json();
    const dcaJson = await dcaRes.json();
    if (lumpSumJson.success === false) throw new Error(lumpSumJson.error || '一次性投资回测失败');
    if (dcaJson.success === false) throw new Error(dcaJson.error || '定投回测失败');

    const lumpSumP = (lumpSumJson.data ?? lumpSumJson).portfolios?.[0];
    const dcaP = (dcaJson.data ?? dcaJson).portfolios?.[0];
    if (!lumpSumP) throw new Error('一次性投资无结果');
    if (!dcaP) throw new Error('定投无结果');

    setResults([toResult(lumpSumP, '一次性投资'), toResult(dcaP, '定投')]);
  }

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    baseCurrency,
    setBaseCurrency,
    adjustForInflation,
    setAdjustForInflation,
    dcaFrequency,
    setDcaFrequency,
    dcaPeriods,
    setDcaPeriods,
    investTbill,
    setInvestTbill,
    assets,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    isLoading,
    error,
    results,
    runComparison,
  };
}

function SeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        对比一次性投入与定期定额投资（DCA）在同一组合上的表现差异。一次性投资在期初全额投入，
        定投则将资金分批投入，观察两种策略在不同市场环境下的终值与风险特征。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            一次性投入 vs 按月/按季度定投的增长曲线、终值、CAGR、波动率、最大回撤、夏普比率等。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">策略说明</div>
          <div className="bt-seo-feature-desc">
            定投将初始资金均分为若干期，每期等额投入；未投入资金可选择投入短期国债（T-Bill）获取无风险收益。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/rebalancing-sensitivity" className="link-blue" style={{ fontWeight: 700 }}>
          调仓敏感性
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
          蒙特卡洛
        </Link>
      </div>
    </div>
  );
}

function ParamsSection1({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  startingValue,
  setStartingValue,
  baseCurrency,
  setBaseCurrency,
  adjustForInflation,
  setAdjustForInflation,
  dcaFrequency,
  setDcaFrequency,
  dcaPeriods,
  setDcaPeriods,
  investTbill,
  setInvestTbill,
}: {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  baseCurrency: 'usd' | 'cny';
  setBaseCurrency: (v: 'usd' | 'cny') => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (v: boolean) => void;
  dcaFrequency: DcaFrequency;
  setDcaFrequency: (v: DcaFrequency) => void;
  dcaPeriods: number;
  setDcaPeriods: (v: number) => void;
  investTbill: boolean;
  setInvestTbill: (v: boolean) => void;
}) {
  return (
    <div className="params-section">
      <div className="params-title">参数设置</div>
      <div className="params-row">
        <div className="param-field">
          <label className="param-label">开始日期</label>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="param-field">
          <label className="param-label">结束日期</label>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="param-field param-field-start-val">
          <label className="param-label">初始资金</label>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">{baseCurrency === 'usd' ? '$' : '¥'}</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={startingValue}
              onChange={(e) => setStartingValue(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="param-field" style={{ width: 90 }}>
          <label className="param-label">货币</label>
          <select
            className="param-input"
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value as 'usd' | 'cny')}
          >
            <option value="usd">USD ($)</option>
            <option value="cny">CNY (¥)</option>
          </select>
        </div>
        <label className="param-toggle">
          <span>通胀调整</span>
          <div
            className={`toggle-switch ${adjustForInflation ? 'active' : ''}`}
            onClick={() => setAdjustForInflation(!adjustForInflation)}
          />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          定投参数
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="param-field" style={{ width: 120 }}>
            <label className="param-label">DCA节奏</label>
            <select
              className="param-input"
              value={dcaFrequency}
              onChange={(e) => setDcaFrequency(e.target.value as DcaFrequency)}
            >
              <option value="monthly">每月</option>
              <option value="quarterly">每季度</option>
            </select>
          </div>
          <div className="param-field" style={{ width: 100 }}>
            <label className="param-label">DCA期数</label>
            <div className="param-input-suffix-wrap">
              <input
                type="number"
                className="param-input param-input-with-suffix"
                value={dcaPeriods}
                onChange={(e) => setDcaPeriods(Number(e.target.value) || 1)}
                min={1}
                max={360}
              />
              <span className="param-input-suffix">期</span>
            </div>
          </div>
          <div className="param-field" style={{ width: 140 }}>
            <label className="param-label">每期投入</label>
            <div className="param-input-prefix-wrap">
              <span className="param-input-prefix">{baseCurrency === 'usd' ? '$' : '¥'}</span>
              <input
                type="text"
                className="param-input param-input-with-prefix"
                value={Math.round(startingValue / dcaPeriods).toLocaleString()}
                readOnly
                style={{ opacity: 0.7 }}
              />
            </div>
          </div>
          <label className="param-check">
            <input
              type="checkbox"
              checked={investTbill}
              onChange={(e) => setInvestTbill(e.target.checked)}
            />
            <span>未投入资金放入T-Bill</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function PortfolioEditor({
  assets,
  addAsset,
  removeAsset,
  updateAsset,
  totalWeight,
}: {
  assets: Array<{ ticker: string; weight: number }>;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
}) {
  return (
    <div className="portfolios-section">
      <div className="portfolios-header">
        <span className="portfolios-title">投资组合</span>
      </div>
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {assets.map((a, i) => (
            <div key={i} className="ticker-row">
              <input
                type="text"
                value={a.ticker}
                onChange={(e) => updateAsset(i, 'ticker', e.target.value)}
                placeholder="输入代码，如 VTI"
                className="ticker-input"
              />
              <div className="weight-cell">
                <input
                  type="number"
                  value={a.weight || ''}
                  onChange={(e) => updateAsset(i, 'weight', Number(e.target.value))}
                  min={0}
                  max={100}
                  className="weight-input"
                  placeholder="%"
                />
                <span className="weight-suffix">%</span>
              </div>
              <button onClick={() => removeAsset(i)} className="row-remove-btn" title="删除">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="portfolio-card-toolbar">
            <button className="toolbar-btn" onClick={addAsset}>
              <Plus className="w-4 h-4" />
              添加标的
            </button>
          </div>
          <div
            className={`portfolio-total ${Math.abs(totalWeight - 100) <= 0.01 ? 'complete' : 'incomplete'}`}
          >
            <span>合计</span>
            <span className="total-value">{totalWeight}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATS_ROWS = [
  { key: 'finalValue' as const, label: '终值' },
  { key: 'cagr' as const, label: 'CAGR' },
  { key: 'stdev' as const, label: '波动率' },
  { key: 'maxDrawdown' as const, label: '最大回撤' },
  { key: 'sharpe' as const, label: '夏普比率' },
  { key: 'sortino' as const, label: 'Sortino' },
  { key: 'calmar' as const, label: 'Calmar' },
  { key: 'maxDrawdownDuration' as const, label: '最长回撤期' },
  { key: 'ulcerIndex' as const, label: 'Ulcer Index' },
];

const REQUIRED_KEYS = new Set(['finalValue', 'cagr', 'stdev', 'maxDrawdown', 'sharpe', 'sortino']);

function StatsTable({
  results,
  fmtPct,
  fmtNum,
  fmtMoney,
}: {
  results: CompareResult[];
  fmtPct: (v: number) => string;
  fmtNum: (v: number) => string;
  fmtMoney: (v: number) => string;
}) {
  const fmtVal = (key: string, v: number) => {
    if (key === 'finalValue') return fmtMoney(v);
    if (key === 'maxDrawdownDuration') return `${v} 天`;
    if (['cagr', 'stdev', 'maxDrawdown'].includes(key)) return fmtPct(v);
    return fmtNum(v);
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th
              className="text-[12px] font-semibold text-left py-2.5 px-3"
              style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
            >
              指标
            </th>
            {results.map((r, idx) => (
              <th
                key={r.label}
                className="text-[12px] font-semibold text-right py-2.5 px-3"
                style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                  style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                />
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STATS_ROWS.map((row, rowIdx) => {
            const hasAnyValue = results.some(
              (r) => r[row.key] !== undefined && r[row.key] !== null,
            );
            if (!hasAnyValue && !REQUIRED_KEYS.has(row.key)) return null;
            return (
              <tr
                key={row.key}
                style={{ backgroundColor: rowIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td
                  className="text-[13px] py-2 px-3"
                  style={{
                    color: 'var(--text-body)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  {row.label}
                </td>
                {results.map((r) => {
                  const val = r[row.key];
                  return (
                    <td
                      key={r.label}
                      className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                      style={{
                        color: 'var(--text-strong)',
                        borderBottom: '1px solid var(--border-soft)',
                      }}
                    >
                      {val !== undefined && val !== null
                        ? fmtVal(row.key, val as number)
                        : '\u2014'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GrowthCurveChart({ results }: { results: CompareResult[] }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 350 }}>
      <svg
        viewBox="0 0 800 350"
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="none"
      >
        {results.map((r, idx) => {
          if (!r.growthCurve || r.growthCurve.length < 2) return null;
          const allValues = results.flatMap((x) => x.growthCurve.map((p) => p.value));
          const minVal = Math.min(...allValues);
          const maxVal = Math.max(...allValues);
          const range = maxVal - minVal || 1;
          const points = r.growthCurve
            .map(
              (p, i) =>
                `${(i / (r.growthCurve.length - 1)) * 780 + 10},${340 - ((p.value - minVal) / range) * 320 - 10}`,
            )
            .join(' ');
          return (
            <polyline
              key={r.label}
              points={points}
              fill="none"
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={2}
            />
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
        {results.map((r, idx) => (
          <div
            key={r.label}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          >
            <span
              className="inline-block w-3 h-1 rounded"
              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
            />
            <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConclusionAnalysis({
  ls,
  dca,
  fmtPct,
  fmtMoney,
}: {
  ls: CompareResult;
  dca: CompareResult;
  fmtPct: (v: number) => string;
  fmtMoney: (v: number) => string;
}) {
  const lsWins = ls.finalValue > dca.finalValue;
  const finalValueDiff = Math.abs(ls.finalValue - dca.finalValue);
  const finalValueDiffPct = ls.finalValue > 0 ? (finalValueDiff / ls.finalValue) * 100 : 0;
  const mddDiff = Math.abs(ls.maxDrawdown - dca.maxDrawdown);
  return (
    <div
      style={{
        padding: 16,
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {lsWins ? (
          <TrendingUp className="w-5 h-5" style={{ color: 'var(--success)' }} />
        ) : (
          <TrendingDown className="w-5 h-5" style={{ color: 'var(--brand)' }} />
        )}
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>结论分析</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            padding: 12,
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>胜出策略</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: lsWins ? CHART_COLORS[0] : CHART_COLORS[1],
            }}
          >
            {lsWins ? '一次性投资' : '定投'}
          </div>
        </div>
        <div
          style={{
            padding: 12,
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>终值差异</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-body)',
            }}
          >
            {fmtMoney(finalValueDiff)}{' '}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({finalValueDiffPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div
          style={{
            padding: 12,
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            最大回撤差异
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-body)',
            }}
          >
            {fmtPct(mddDiff)}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>
        {lsWins ? (
          <>
            在选定的时间范围内，<strong style={{ color: CHART_COLORS[0] }}>一次性投资</strong>
            的终值更高（{fmtMoney(ls.finalValue)} vs {fmtMoney(dca.finalValue)}），高出
            {finalValueDiffPct.toFixed(1)}%。但一次性投资的最大回撤（{fmtPct(ls.maxDrawdown)}
            ）通常大于定投（{fmtPct(dca.maxDrawdown)}），在下跌市场中承受更大的心理压力。
          </>
        ) : (
          <>
            在选定的时间范围内，<strong style={{ color: CHART_COLORS[1] }}>定投</strong>的终值更高（
            {fmtMoney(dca.finalValue)} vs {fmtMoney(ls.finalValue)}），高出
            {finalValueDiffPct.toFixed(1)}
            %。定投通过分批买入降低了平均成本，在下跌市场中获得了更好的回报。
          </>
        )}
      </div>
    </div>
  );
}

function RiskWarning({ lsWins }: { lsWins: boolean }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: '12px 16px',
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <AlertTriangle
        className="w-4 h-4 flex-shrink-0"
        style={{ color: 'var(--warning)', marginTop: 2 }}
      />
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-body)' }}>风险提示：</strong>
        {lsWins
          ? '虽然一次性投资在此历史区间内表现更优，但这是事后结果。一次性投资在入场时点选择上风险更大，若在市场高点入场可能遭受重大损失。定投虽然终值较低，但通过分散入场时点降低了择时风险，适合风险偏好较低的投资者。'
          : '定投在此历史区间内表现更优，说明市场在此期间经历了较大的波动或下跌阶段。定投通过分批买入降低了平均成本，但若市场持续上涨，一次性投资通常能获得更高收益。投资决策应结合个人风险承受能力和市场判断。'}
        历史表现不代表未来收益。
      </div>
    </div>
  );
}

export default function LumpSumVsDCAPage() {
  const s = useLumpSumVsDCAState();
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toFixed(2);
  const fmtMoney = (v: number) =>
    s.baseCurrency === 'usd'
      ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `¥${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">一次性投资 vs 定投</h1>
      </div>
      <SeoCard />
      <div className="bt-main-card card">
        <ParamsSection1
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
            fmtMoney={fmtMoney}
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
          <StatsTable results={s.results} fmtPct={fmtPct} fmtNum={fmtNum} fmtMoney={fmtMoney} />
          <RiskWarning lsWins={s.results[0].finalValue > s.results[1].finalValue} />
        </div>
      )}
    </div>
  );
}
