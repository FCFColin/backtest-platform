/**
 * @file 因子回归页面
 * @description 对投资组合进行因子回归分析（如 CAPM、Fama-French 三因子），展示 Alpha、Beta 及 R² 等结果
 * @route /factor-regression
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, X } from 'lucide-react';
import { CHART_COLORS } from '@backtest/shared';
import { fmtPct, fmtNum } from '@/utils/format';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { apiFetch } from '../utils/apiClient';
import { runFFRegression } from '../utils/factorRegression.js';
import LoadingButton from '../components/LoadingButton';
import { useToastStore } from '@/store/toastStore';

type ReturnFrequency = 'monthly' | 'daily';

/** 因子回归结果 */
interface FactorRegressionResult {
  alpha: number; // 年化 Alpha
  beta: number; // 市场因子 Beta
  smb: number; // SMB 因子载荷
  hml: number; // HML 因子载荷
  rSquared: number; // R²
  residuals: number[]; // 残差序列
}

/** 因子选项 */
const FACTOR_OPTIONS = [
  { key: 'mktRF', label: 'MKT-RF', desc: '市场超额收益' },
  { key: 'smb', label: 'SMB', desc: '小盘股溢价' },
  { key: 'hml', label: 'HML', desc: '价值股溢价' },
];

/** 无风险利率来源 */
const RF_SOURCE_OPTIONS = [
  { value: 'us-3m', label: '美国3月期国债' },
  { value: 'us-1y', label: '美国1年期国债' },
];

interface AssetItem {
  ticker: string;
  weight: number;
}

/** 因子选择器 */
interface FactorSelectorProps {
  selectedFactors: string[];
  onToggle: (key: string) => void;
}

function FactorSelector({ selectedFactors, onToggle }: FactorSelectorProps) {
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
          {opt.label}
          <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>({opt.desc})</span>
        </label>
      ))}
    </div>
  );
}

/** 组合编辑器 */
interface PortfolioEditorProps {
  assets: AssetItem[];
  totalWeight: number;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
}

function PortfolioEditor({ assets, totalWeight, onAdd, onRemove, onUpdate }: PortfolioEditorProps) {
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
                onChange={(e) => onUpdate(i, 'ticker', e.target.value)}
                placeholder="输入代码，如 VTI"
                className="ticker-input"
              />
              <div className="weight-cell">
                <input
                  type="number"
                  value={a.weight || ''}
                  onChange={(e) => onUpdate(i, 'weight', Number(e.target.value))}
                  min={0}
                  max={100}
                  className="weight-input"
                  placeholder="%"
                />
                <span className="weight-suffix">%</span>
              </div>
              <button onClick={() => onRemove(i)} className="row-remove-btn" title="删除">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="portfolio-card-toolbar">
            <button className="toolbar-btn" onClick={onAdd}>
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

/** 回归结果表 */
interface RegressionResultProps {
  result: FactorRegressionResult;
  selectedFactors: string[];
}

/** 回归残差图 */
function ResidualsChart({ residuals }: { residuals: number[] }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
        回归残差
      </div>
      <div style={{ position: 'relative', width: '100%', height: 200 }}>
        <svg
          viewBox="0 0 800 200"
          style={{ width: '100%', height: '100%' }}
          preserveAspectRatio="none"
        >
          <line
            x1="10"
            y1="100"
            x2="790"
            y2="100"
            stroke="var(--border-soft)"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          {residuals.map((r, i) => {
            const x = 10 + (i / (residuals.length - 1)) * 780;
            const barHeight = (Math.abs(r) / 0.04) * 90;
            const y = r >= 0 ? 100 - barHeight : 100;
            return (
              <rect
                key={i}
                x={x - 1}
                y={y}
                width={2}
                height={barHeight}
                fill={r >= 0 ? 'var(--success)' : 'var(--error)'}
                opacity={0.5}
              />
            );
          })}
        </svg>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 4,
          justifyContent: 'center',
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        <span>
          <span
            className="inline-block w-3 h-1 rounded mr-1"
            style={{ backgroundColor: 'var(--success)' }}
          />
          正残差
        </span>
        <span>
          <span
            className="inline-block w-3 h-1 rounded mr-1"
            style={{ backgroundColor: 'var(--error)' }}
          />
          负残差
        </span>
      </div>
    </div>
  );
}

const TH_BASE = 'text-[12px] font-semibold py-2.5 px-3';
const TH_STYLE = { color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' };
const TD_BASE = 'text-[13px] py-2 px-3';
const TD_BORDER = { borderBottom: '1px solid var(--border-soft)' };

/** 回归结果表格行 */
function RegressionRow({
  label,
  color,
  value,
  valueStyle,
  desc,
  bg,
}: {
  label: string;
  color: string;
  value: string;
  valueStyle: React.CSSProperties;
  desc: string;
  bg: string;
}) {
  return (
    <tr style={{ backgroundColor: bg }}>
      <td className={TD_BASE} style={{ color: 'var(--text-strong)', ...TD_BORDER }}>
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: color }}
        />
        {label}
      </td>
      <td
        className={`${TD_BASE} font-medium text-right font-mono`}
        style={{ ...valueStyle, ...TD_BORDER }}
      >
        {value}
      </td>
      <td className="text-[12px] py-2 px-3" style={{ color: 'var(--text-muted)', ...TD_BORDER }}>
        {desc}
      </td>
    </tr>
  );
}

/** 模拟数据提示 */
function MockDataNotice() {
  return (
    <div
      style={{
        marginTop: 16,
        padding: '8px 12px',
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        fontSize: 11,
        color: 'var(--text-muted)',
        fontStyle: 'italic',
      }}
    >
      因子数据来源于 Kenneth French 数据库（模拟数据）。完整版将接入实时 Fama-French 因子数据。
    </div>
  );
}

function RegressionResultTable({ result, selectedFactors }: RegressionResultProps) {
  return (
    <div className="bt-results-card card">
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
        Fama-French 三因子回归结果
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <th className={`${TH_BASE} text-left`} style={TH_STYLE}>
                系数
              </th>
              <th className={`${TH_BASE} text-right`} style={TH_STYLE}>
                估计值
              </th>
              <th className={`${TH_BASE} text-left`} style={TH_STYLE}>
                含义
              </th>
            </tr>
          </thead>
          <tbody>
            <RegressionRow
              label="Alpha"
              color={CHART_COLORS[0]}
              value={fmtPct(result.alpha)}
              valueStyle={{ color: result.alpha >= 0 ? 'var(--success)' : 'var(--error)' }}
              desc="组合超额收益（年化），正值表示跑赢因子模型预期"
              bg="transparent"
            />
            <RegressionRow
              label="Beta (MKT-RF)"
              color={CHART_COLORS[1]}
              value={fmtNum(result.beta, 3)}
              valueStyle={{ color: 'var(--text-strong)' }}
              desc="市场敏感度，1.0 表示与市场同步波动"
              bg="var(--bg-subtle)"
            />
            {selectedFactors.includes('smb') && (
              <RegressionRow
                label="SMB"
                color={CHART_COLORS[2]}
                value={fmtNum(result.smb, 3)}
                valueStyle={{ color: 'var(--text-strong)' }}
                desc="规模因子载荷，正值偏向小盘股"
                bg="transparent"
              />
            )}
            {selectedFactors.includes('hml') && (
              <RegressionRow
                label="HML"
                color={CHART_COLORS[3]}
                value={fmtNum(result.hml, 3)}
                valueStyle={{ color: 'var(--text-strong)' }}
                desc="价值因子载荷，正值偏向价值股"
                bg="var(--bg-subtle)"
              />
            )}
            <RegressionRow
              label="R²"
              color="transparent"
              value={fmtNum(result.rSquared, 3)}
              valueStyle={{ color: 'var(--text-strong)' }}
              desc="模型解释力，越接近1说明因子对收益的解释越充分"
              bg={selectedFactors.includes('hml') ? 'transparent' : 'var(--bg-subtle)'}
            />
          </tbody>
        </table>
      </div>
      {result.residuals.length > 0 && <ResidualsChart residuals={result.residuals} />}
      <MockDataNotice />
    </div>
  );
}

/** SEO 卡片 */
function FactorRegressionSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        使用 Fama-French 三因子模型（MKT-RF、SMB、HML）对投资组合进行回归分析，
        分解组合收益来源，计算 Alpha、Beta、规模因子和价值因子载荷，以及 R² 和残差。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            组合超额收益中来自市场、规模、价值因子的贡献比例，以及经理的 Alpha 能力。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">因子说明</div>
          <div className="bt-seo-feature-desc">
            MKT-RF：市场超额收益；SMB：小盘股减大盘股；HML：价值股减成长股。数据来源于 Kenneth
            French 数据库。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
          资产分析
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/rebalancing-sensitivity" className="link-blue" style={{ fontWeight: 700 }}>
          调仓敏感性
        </Link>
      </div>
    </div>
  );
}

/** 参数设置区域 */
interface FactorParamsProps {
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
}

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
}: FactorParamsProps) {
  return (
    <div className="params-section">
      <div className="params-title">参数设置</div>
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
                onStartDateChange('2010-01-01');
                onEndDateChange('2024-12-31');
              }
            }}
          />
          <span>全部历史</span>
        </label>
      </div>
      <div className="params-row">
        <div className="param-field">
          <label className="param-label">开始日期</label>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </div>
        <div className="param-field">
          <label className="param-label">结束日期</label>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
        </div>
        <div className="param-field" style={{ width: 110 }}>
          <label className="param-label">收益频率</label>
          <select
            className="param-input"
            value={returnFrequency}
            onChange={(e) => onReturnFrequencyChange(e.target.value as ReturnFrequency)}
          >
            <option value="monthly">月度</option>
            <option value="daily">日度</option>
          </select>
        </div>
        <div className="param-field" style={{ width: 150 }}>
          <label className="param-label">无风险利率</label>
          <select
            className="param-input"
            value={rfSource}
            onChange={(e) => onRfSourceChange(e.target.value)}
          >
            {RF_SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          因子选择（多选）
        </div>
        <FactorSelector selectedFactors={selectedFactors} onToggle={onToggleFactor} />
      </div>
    </div>
  );
}

/** 因子回归请求参数 */
interface FetchRegressionParams {
  validAssets: AssetItem[];
  startDate: string;
  endDate: string;
  selectedFactors: string[];
  returnFrequency: ReturnFrequency;
  rfSource: string;
}

/** 从分析数据中提取各 ticker 的日收益率和日期序列 */
function extractTickerReturns(
  tickersData: Array<{
    ticker: string;
    growthCurve?: Array<{ date: string }>;
    dailyReturns?: number[];
  }>,
): Array<{ ticker: string; dailyReturns: number[]; dates: string[] }> {
  const result: Array<{ ticker: string; dailyReturns: number[]; dates: string[] }> = [];
  for (const tk of tickersData) {
    const gc = tk.growthCurve ?? [];
    const dr = tk.dailyReturns ?? [];
    if (gc.length < 2 || dr.length < 1) continue;
    // growthCurve 有 n 个价格点 → n-1 个日收益率，取后半段 dates
    const dates = gc.slice(1).map((p: { date: string }) => p.date);
    result.push({ ticker: tk.ticker, dailyReturns: dr, dates });
  }
  return result;
}

/** 将各 ticker 日收益率按权重合并为月度收益序列 */
function computeCombinedMonthlyReturns(
  tickerReturns: Array<{ ticker: string; dailyReturns: number[]; dates: string[] }>,
  weightMap: Map<string, number>,
): Array<{ date: string; value: number }> {
  const longest = tickerReturns.reduce((a, b) =>
    a.dailyReturns.length > b.dailyReturns.length ? a : b,
  );
  const combinedMonthlyReturns = new Map<string, number>();

  for (let i = 0; i < longest.dailyReturns.length; i++) {
    const date = longest.dates[i];
    if (!date) continue;
    const monthKey = date.slice(0, 7);
    let dailyReturn = 0;
    for (const tr of tickerReturns) {
      const idx = tr.dates.indexOf(date);
      if (idx >= 0) dailyReturn += tr.dailyReturns[idx] * (weightMap.get(tr.ticker) ?? 0);
    }
    const prev = combinedMonthlyReturns.get(monthKey) ?? 1;
    combinedMonthlyReturns.set(monthKey, prev * (1 + dailyReturn));
  }

  return Array.from(combinedMonthlyReturns.entries())
    .map(([date, value]) => ({ date, value: value - 1 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 执行因子回归：获取价格数据 → 计算组合月收益 → OLS 回归 */
async function fetchRegression(params: FetchRegressionParams): Promise<FactorRegressionResult> {
  const { validAssets, startDate, endDate, selectedFactors } = params;

  // 获取每个标的的分析数据（含 dailyReturns）
  const tickers = validAssets.map((a) => a.ticker);
  const analysisRes = await apiFetch('/api/backtest/analysis', {
    method: 'POST',
    body: JSON.stringify({
      tickers,
      parameters: {
        startDate,
        endDate,
        startingValue: 10000,
        baseCurrency: 'usd',
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
        extendedWithdrawalStats: false,
        cashflowLegs: [],
        oneTimeCashflows: [],
      },
    }),
  });

  if (!analysisRes.ok) throw new Error('获取行情数据失败');
  const analysisJson = await analysisRes.json();
  if (analysisJson.success === false) throw new Error(analysisJson.error || '获取行情数据失败');
  const analysisData = analysisJson.data ?? analysisJson;

  const tickerReturns = extractTickerReturns(analysisData.tickers ?? []);
  if (tickerReturns.length === 0) throw new Error('无法获取足够的价格数据');

  const totalW = validAssets.reduce((s, a) => s + (a.weight || 0), 0);
  const weightMap = new Map(validAssets.map((a) => [a.ticker, (a.weight || 0) / totalW]));

  const monthlyReturns = computeCombinedMonthlyReturns(tickerReturns, weightMap);
  if (monthlyReturns.length < 3) throw new Error('数据点不足（至少需要 3 个月）');

  return runFFRegression({ monthlyReturns }, selectedFactors, startDate, endDate);
}

// ===== 主页面 =====

/** 因子回归状态管理 hook */
function useFactorRegressionState() {
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [returnFrequency, setReturnFrequency] = useState<ReturnFrequency>('monthly');
  const [rfSource, setRfSource] = useState('us-3m');
  const [selectedFactors, setSelectedFactors] = useState<string[]>(['mktRF', 'smb', 'hml']);
  const [assets, setAssets] = useState<AssetItem[]>([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [result, setResult] = useState<FactorRegressionResult | null>(null);

  const toggleFactor = (key: string) =>
    setSelectedFactors((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );
  const addAsset = () => setAssets([...assets, { ticker: '', weight: 0 }]);
  const removeAsset = (i: number) => setAssets(assets.filter((_, idx) => idx !== i));
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...assets];
    next[i] = { ...next[i], [field]: val };
    setAssets(next);
  };
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);

  const runRegression = () => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      setError('请至少添加一个标的');
      return;
    }
    if (Math.abs(totalWeight - 100) > 0.01) {
      setError('权重合计必须为 100%');
      return;
    }
    if (selectedFactors.length === 0) {
      setError('请至少选择一个因子');
      return;
    }
    setResult(null);
    run(async () => {
      try {
        const r = await fetchRegression({
          validAssets,
          startDate,
          endDate,
          selectedFactors,
          returnFrequency,
          rfSource,
        });
        setResult(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '回归计算失败';
        setError(msg);
        useToastStore.getState().addToast('error', msg);
      }
    });
  };

  return {
    startDate,
    endDate,
    returnFrequency,
    rfSource,
    selectedFactors,
    assets,
    totalWeight,
    isLoading,
    error,
    result,
    runRegression,
    setStartDate,
    setEndDate,
    setReturnFrequency,
    setRfSource,
    toggleFactor,
    addAsset,
    removeAsset,
    updateAsset,
  };
}

export default function FactorRegressionPage() {
  const {
    startDate,
    endDate,
    returnFrequency,
    rfSource,
    selectedFactors,
    assets,
    totalWeight,
    isLoading,
    error,
    result,
    runRegression,
    setStartDate,
    setEndDate,
    setReturnFrequency,
    setRfSource,
    toggleFactor,
    addAsset,
    removeAsset,
    updateAsset,
  } = useFactorRegressionState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">因子回归分析</h1>
      </div>
      <FactorRegressionSeoCard />

      <div className="bt-main-card card">
        <FactorParamsSection
          startDate={startDate}
          endDate={endDate}
          returnFrequency={returnFrequency}
          rfSource={rfSource}
          selectedFactors={selectedFactors}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onReturnFrequencyChange={setReturnFrequency}
          onRfSourceChange={setRfSource}
          onToggleFactor={toggleFactor}
        />
        <PortfolioEditor
          assets={assets}
          totalWeight={totalWeight}
          onAdd={addAsset}
          onRemove={removeAsset}
          onUpdate={updateAsset}
        />
        <div className="bt-action-row">
          <LoadingButton
            isLoading={isLoading}
            onClick={runRegression}
            loadingText="回归分析中..."
            style={{ width: '100%' }}
          >
            <Play className="w-4 h-4" />
            开始分析
          </LoadingButton>
        </div>
      </div>

      {error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
        >
          分析失败：{error}
        </div>
      )}
      {result && <RegressionResultTable result={result} selectedFactors={selectedFactors} />}
    </div>
  );
}
