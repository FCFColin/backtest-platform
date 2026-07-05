import { useState, useMemo } from 'react';
import type { ReactNode, ElementType } from 'react';
import {
  TrendingUp,
  Layers,
  Target,
  PieChart,
  Flame,
  DollarSign,
  ShieldAlert,
  BarChart3,
  ChevronDown,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { FieldProps } from './types.js';
import { CHART_COLORS } from './types.js';
import {
  formatPct,
  formatNum,
  computeTwoFundFrontier,
  INFO_BOX_STYLE,
  COLLAPSIBLE_CARD_STYLE,
  ICON_BOX_STYLE,
  CARD_TITLE_STYLE,
} from './utils.js';
import { ResultRow, SWRChart, TwoFundChart } from './CalculatorsResults.js';

export function Field({ label, value, onChange, suffix = '', min, max, step = 0.1 }: FieldProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          className="param-input"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          style={{
            flex: 1,
            height: 36,
            padding: '0 10px',
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--border-strong)',
            fontSize: 14,
            color: 'var(--text-body)',
            background: 'var(--bg-elevated)',
            width: '100%',
          }}
        />
        {suffix && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 20 }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return <div style={INFO_BOX_STYLE}>{children}</div>;
}

function CollapsibleCardHeader({
  icon: Icon,
  title,
  open,
  onToggle,
}: {
  icon: ElementType;
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        padding: '16px 20px',
        border: 'none',
        background: hovered ? 'var(--bg-subtle)' : 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: open ? '1px solid var(--border-soft)' : 'none',
        transition: 'background-color .12s',
      }}
    >
      <div style={ICON_BOX_STYLE}>
        <Icon className="w-4 h-4" style={{ color: 'var(--brand)' }} />
      </div>
      <h3 style={CARD_TITLE_STYLE}>{title}</h3>
      <ChevronDown
        className="w-4 h-4"
        style={{
          color: 'var(--text-muted)',
          transition: 'transform .2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          flexShrink: 0,
        }}
      />
    </button>
  );
}

function CollapsibleCard({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: ElementType;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={COLLAPSIBLE_CARD_STYLE}>
      <CollapsibleCardHeader
        icon={Icon}
        title={title}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && <div style={{ padding: '16px 20px' }}>{children}</div>}
    </div>
  );
}

export function CAGRCalculator() {
  const [initial, setInitial] = useState(10000);
  const [finalVal, setFinalVal] = useState(50000);
  const [years, setYears] = useState(10);

  const cagr = useMemo(() => {
    if (initial <= 0 || years <= 0) return 0;
    return Math.pow(finalVal / initial, 1 / years) - 1;
  }, [initial, finalVal, years]);

  return (
    <CollapsibleCard icon={TrendingUp} title="CAGR 估算器" defaultOpen>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
        <Field label="初始值" value={initial} onChange={setInitial} step={1000} min={0} />
        <Field label="终值" value={finalVal} onChange={setFinalVal} step={1000} min={0} />
        <Field label="年数" value={years} onChange={setYears} suffix="年" step={1} min={1} />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="CAGR" value={formatPct(cagr)} color="var(--brand)" />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        公式: CAGR = (终值 / 初始值)^(1/年数) - 1
      </div>
    </CollapsibleCard>
  );
}

export function FutureValueCalculator() {
  const [initial, setInitial] = useState(10000);
  const [cagr, setCagr] = useState(8);
  const [years, setYears] = useState(20);
  const [monthly, setMonthly] = useState(500);

  const { finalValue, totalContributions, curve } = useMemo(() => {
    const r = cagr / 100;
    const monthlyR = r / 12;
    const months = years * 12;
    const pts: Array<{ year: number; value: number }> = [];
    let accumulated = initial;
    for (let t = 0; t <= months; t++) {
      if (t % 12 === 0) {
        pts.push({ year: t / 12, value: accumulated });
      }
      if (t < months) {
        accumulated = accumulated * (1 + monthlyR) + monthly;
      }
    }
    const totalContrib = initial + monthly * months;
    return { finalValue: accumulated, totalContributions: totalContrib, curve: pts };
  }, [initial, cagr, years, monthly]);

  return (
    <CollapsibleCard icon={DollarSign} title="终值计算器" defaultOpen>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="初始值" value={initial} onChange={setInitial} step={1000} min={0} />
        <Field label="CAGR" value={cagr} onChange={setCagr} suffix="%" step={0.5} />
        <Field label="年数" value={years} onChange={setYears} suffix="年" step={1} min={1} />
        <Field label="月投入" value={monthly} onChange={setMonthly} step={100} min={0} />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="终值" value={formatNum(finalValue)} color="var(--brand)" />
        <ResultRow label="总投入" value={formatNum(totalContributions)} />
        <ResultRow
          label="投资收益"
          value={formatNum(finalValue - totalContributions)}
          color="var(--success)"
        />
      </div>
      <div style={{ height: 180, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={formatNum} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => [formatNum(v), '终值']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS[0]}
              fill={CHART_COLORS[0]}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </CollapsibleCard>
  );
}

export function LeverageDecayCalculator() {
  const [baseVol, setBaseVol] = useState(18);
  const [leverage, setLeverage] = useState(3);
  const [years, setYears] = useState(10);

  const result = useMemo(() => {
    const sigma = baseVol / 100;
    const l = leverage;
    const volDrag = ((l * l - l) * sigma * sigma) / 2;
    const totalDecay = volDrag * years;
    const effectiveReturn = -totalDecay;
    return { volDrag, totalDecay, effectiveReturn };
  }, [baseVol, leverage, years]);

  return (
    <CollapsibleCard icon={Layers} title="杠杆 ETF 衰减估算">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
        <Field label="标的年波动率" value={baseVol} onChange={setBaseVol} suffix="%" step={1} />
        <Field
          label="杠杆倍数"
          value={leverage}
          onChange={setLeverage}
          suffix="x"
          step={0.5}
          min={1}
        />
        <Field label="持有年数" value={years} onChange={setYears} suffix="年" step={1} min={1} />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="年波动率拖累" value={formatPct(result.volDrag)} color="var(--warning)" />
        <ResultRow
          label={`${years}年累计衰减`}
          value={formatPct(result.totalDecay)}
          color="var(--danger)"
        />
        <ResultRow
          label="等效收益损失"
          value={formatPct(result.effectiveReturn)}
          color="var(--danger)"
        />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        波动率拖累 = (L² - L) × σ² / 2。杠杆ETF在震荡市中因日再平衡产生衰减，长期持有需关注此效应。
      </div>
    </CollapsibleCard>
  );
}

export function SWRCalculator() {
  const [expectedReturn, setExpectedReturn] = useState(7);
  const [volatility, setVolatility] = useState(15);
  const [retirementYears, setRetirementYears] = useState(30);
  const [successTarget, setSuccessTarget] = useState(95);

  const swr = useMemo(() => {
    const mu = expectedReturn / 100;
    const sigma = volatility / 100;
    const T = retirementYears;
    const pTarget = successTarget / 100;
    const zScore = 1.645 + (pTarget - 0.95) * 10 * 0.842;
    const baseRate = mu - 0.5 * sigma * sigma;
    const safetyMargin = (zScore * sigma) / Math.sqrt(T);
    const estimatedSWR = Math.max(0, baseRate - safetyMargin);
    return Math.min(estimatedSWR, 0.1);
  }, [expectedReturn, volatility, retirementYears, successTarget]);

  const portfolioSurvival = useMemo(() => {
    const wr = swr;
    const pts: Array<{ year: number; ratio: number }> = [];
    let ratio = 1;
    for (let t = 1; t <= retirementYears; t++) {
      ratio = ratio * (1 + expectedReturn / 100) * (1 - wr);
      pts.push({ year: t, ratio });
    }
    return pts;
  }, [swr, expectedReturn, retirementYears]);

  return (
    <CollapsibleCard icon={ShieldAlert} title="安全提款率估算 (SWR)">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field
          label="组合预期收益"
          value={expectedReturn}
          onChange={setExpectedReturn}
          suffix="%"
          step={0.5}
        />
        <Field label="波动率" value={volatility} onChange={setVolatility} suffix="%" step={1} />
        <Field
          label="退休年限"
          value={retirementYears}
          onChange={setRetirementYears}
          suffix="年"
          step={1}
          min={1}
        />
        <Field
          label="成功率目标"
          value={successTarget}
          onChange={setSuccessTarget}
          suffix="%"
          step={1}
          min={50}
          max={99}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="估算 SWR" value={formatPct(swr)} color="var(--brand)" />
        <ResultRow
          label="年度提款额 (每100万)"
          value={(swr * 1000000).toFixed(0)}
          color="var(--success)"
        />
      </div>
      <SWRChart data={portfolioSurvival} />
      <InfoBox>
        基于简化公式: SWR ≈ μ - σ²/2 -
        z·σ/√T，其中z为对应成功率目标的标准正态分位数。仅供参考，实际SWR应基于历史模拟。
      </InfoBox>
    </CollapsibleCard>
  );
}

export function AssetAllocationRiskCalculator() {
  const [stockPct, setStockPct] = useState(60);
  const [bondPct, setBondPct] = useState(40);
  const [stockVol, setStockVol] = useState(18);
  const [bondVol, setBondVol] = useState(5);
  const [correlation, setCorrelation] = useState(0.2);

  const result = useMemo(() => {
    const wS = stockPct / 100;
    const wB = bondPct / 100;
    const sS = stockVol / 100;
    const sB = bondVol / 100;
    const rho = correlation;
    const portfolioVol = Math.sqrt(
      wS * wS * sS * sS + wB * wB * sB * sB + 2 * wS * wB * rho * sS * sB,
    );
    const diversificationBenefit = wS * sS + wB * sB - portfolioVol;
    const riskContributionStock =
      (wS * wS * sS * sS + wS * wB * rho * sS * sB) / (portfolioVol * portfolioVol);
    const riskContributionBond =
      (wB * wB * sB * sB + wS * wB * rho * sS * sB) / (portfolioVol * portfolioVol);
    return { portfolioVol, diversificationBenefit, riskContributionStock, riskContributionBond };
  }, [stockPct, bondPct, stockVol, bondVol, correlation]);

  return (
    <CollapsibleCard icon={BarChart3} title="资产配置风险估算">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field
          label="股票占比"
          value={stockPct}
          onChange={setStockPct}
          suffix="%"
          step={5}
          min={0}
          max={100}
        />
        <Field
          label="债券占比"
          value={bondPct}
          onChange={setBondPct}
          suffix="%"
          step={5}
          min={0}
          max={100}
        />
        <Field label="股票波动率" value={stockVol} onChange={setStockVol} suffix="%" step={1} />
        <Field label="债券波动率" value={bondVol} onChange={setBondVol} suffix="%" step={1} />
      </div>
      <Field
        label="相关性"
        value={correlation}
        onChange={setCorrelation}
        step={0.05}
        min={-1}
        max={1}
      />
      <div style={{ marginTop: 8 }}>
        <ResultRow label="组合波动率" value={formatPct(result.portfolioVol)} color="var(--brand)" />
        <ResultRow
          label="分散化收益"
          value={formatPct(result.diversificationBenefit)}
          color="var(--success)"
        />
        <ResultRow label="股票风险贡献" value={formatPct(result.riskContributionStock)} />
        <ResultRow label="债券风险贡献" value={formatPct(result.riskContributionBond)} />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        组合波动率 = √(w₁²σ₁² + w₂²σ₂² + 2w₁w₂ρσ₁σ₂)。分散化收益 = 加权波动率之和 - 组合波动率。
      </div>
    </CollapsibleCard>
  );
}

export function CAGRAssumptionCalculator() {
  const [cagr, setCagr] = useState(8);
  const [vol, setVol] = useState(15);
  const [years, setYears] = useState(20);
  const [initial, setInitial] = useState(10000);

  const { finalValue, curve } = useMemo(() => {
    const r = cagr / 100;
    const pts: Array<{ year: number; value: number }> = [];
    for (let t = 0; t <= years; t++) {
      pts.push({ year: t, value: initial * Math.pow(1 + r, t) });
    }
    return { finalValue: initial * Math.pow(1 + r, years), curve: pts };
  }, [cagr, years, initial]);

  return (
    <CollapsibleCard icon={TrendingUp} title="股票/债券 ETF CAGR 假设">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="预期收益率" value={cagr} onChange={setCagr} suffix="%" />
        <Field label="波动率" value={vol} onChange={setVol} suffix="%" />
        <Field label="时间" value={years} onChange={setYears} suffix="年" step={1} />
        <Field label="初始资金" value={initial} onChange={setInitial} step={1000} />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="终值" value={formatNum(finalValue)} color="var(--brand)" />
      </div>
      <div style={{ height: 200, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={formatNum} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => [formatNum(v), '终值']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS[0]}
              fill={CHART_COLORS[0]}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </CollapsibleCard>
  );
}

export function LeverageETFCalculator() {
  const [baseCagr, setBaseCagr] = useState(8);
  const [baseVol, setBaseVol] = useState(15);
  const [leverage, setLeverage] = useState(2);
  const [borrowSpread, setBorrowSpread] = useState(1);

  const result = useMemo(() => {
    const mu = baseCagr / 100;
    const sigma = baseVol / 100;
    const l = leverage;
    const rBorrow = borrowSpread / 100;
    const levCagr = l * mu - (l - 1) * rBorrow - ((l * l - l) * sigma * sigma) / 2;
    const levVol = l * sigma;
    return { levCagr, levVol };
  }, [baseCagr, baseVol, leverage, borrowSpread]);

  return (
    <CollapsibleCard icon={Layers} title="杠杆 ETF 规则估算">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="基础资产 CAGR" value={baseCagr} onChange={setBaseCagr} suffix="%" />
        <Field label="基础资产波动率" value={baseVol} onChange={setBaseVol} suffix="%" />
        <Field
          label="杠杆倍数"
          value={leverage}
          onChange={setLeverage}
          suffix="x"
          step={0.5}
          min={1}
        />
        <Field label="借贷利差" value={borrowSpread} onChange={setBorrowSpread} suffix="%" />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="杠杆后 CAGR" value={formatPct(result.levCagr)} color="var(--brand)" />
        <ResultRow label="杠杆后波动率" value={formatPct(result.levVol)} color="var(--warning)" />
        <ResultRow
          label="杠杆后夏普 (假设Rf=0)"
          value={(result.levCagr / result.levVol).toFixed(3)}
        />
      </div>
    </CollapsibleCard>
  );
}

export function KellyLeverageCalculator() {
  const [baseCagr, setBaseCagr] = useState(8);
  const [baseVol, setBaseVol] = useState(15);
  const [riskFree, setRiskFree] = useState(4);

  const result = useMemo(() => {
    const mu = baseCagr / 100;
    const sigma = baseVol / 100;
    const rf = riskFree / 100;
    const kelly = (mu - rf) / (sigma * sigma);
    const halfKelly = kelly / 2;
    const optimalCagr = rf + kelly * (mu - rf) - (kelly * kelly * sigma * sigma) / 2;
    const halfKellyCagr = rf + halfKelly * (mu - rf) - (halfKelly * halfKelly * sigma * sigma) / 2;
    return { kelly, halfKelly, optimalCagr, halfKellyCagr };
  }, [baseCagr, baseVol, riskFree]);

  return (
    <CollapsibleCard icon={Target} title="最优日杠杆 (Kelly)">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
        <Field label="基础资产 CAGR" value={baseCagr} onChange={setBaseCagr} suffix="%" />
        <Field label="波动率" value={baseVol} onChange={setBaseVol} suffix="%" />
        <Field label="无风险利率" value={riskFree} onChange={setRiskFree} suffix="%" />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow
          label="Kelly 最优杠杆"
          value={result.kelly.toFixed(3) + 'x'}
          color="var(--brand)"
        />
        <ResultRow
          label="半 Kelly 杠杆"
          value={result.halfKelly.toFixed(3) + 'x'}
          color="var(--support)"
        />
        <ResultRow label="Kelly 预期 CAGR" value={formatPct(result.optimalCagr)} />
        <ResultRow label="半 Kelly 预期 CAGR" value={formatPct(result.halfKellyCagr)} />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        Kelly 公式: f* = (μ - Rf) / σ² 。半 Kelly 通常更稳健，建议优先参考。
      </div>
    </CollapsibleCard>
  );
}

export function TwoFundPortfolioCalculator() {
  const [cagrA, setCagrA] = useState(8);
  const [volA, setVolA] = useState(15);
  const [cagrB, setCagrB] = useState(4);
  const [volB, setVolB] = useState(5);
  const [corr, setCorr] = useState(0.2);

  const { frontier, minVarW, minVarCagr, minVarVol } = useMemo(
    () => computeTwoFundFrontier(cagrA, volA, cagrB, volB, corr),
    [cagrA, volA, cagrB, volB, corr],
  );

  return (
    <CollapsibleCard icon={PieChart} title="两基金组合">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="资产A CAGR" value={cagrA} onChange={setCagrA} suffix="%" />
        <Field label="资产A 波动率" value={volA} onChange={setVolA} suffix="%" />
        <Field label="资产B CAGR" value={cagrB} onChange={setCagrB} suffix="%" />
        <Field label="资产B 波动率" value={volB} onChange={setVolB} suffix="%" />
      </div>
      <Field label="相关性" value={corr} onChange={setCorr} step={0.05} min={-1} max={1} />
      <div style={{ marginTop: 8 }}>
        <ResultRow
          label="最小方差组合 A权重"
          value={(minVarW * 100).toFixed(1) + '%'}
          color="var(--brand)"
        />
        <ResultRow label="最小方差 CAGR" value={minVarCagr.toFixed(2) + '%'} />
        <ResultRow label="最小方差波动率" value={minVarVol.toFixed(2) + '%'} />
      </div>
      <TwoFundChart data={frontier} />
    </CollapsibleCard>
  );
}

export function OptionLeverageCalculator() {
  const [spotPrice, setSpotPrice] = useState(100);
  const [strikePrice, setStrikePrice] = useState(105);
  const [optionPrice, setOptionPrice] = useState(5);
  const [contractMultiplier, setContractMultiplier] = useState(100);

  const result = useMemo(() => {
    if (optionPrice <= 0 || spotPrice <= 0)
      return { leverage: 0, delta: 0, intrinsic: 0, timeValue: 0 };
    const intrinsic = Math.max(spotPrice - strikePrice, 0);
    const timeValue = optionPrice - intrinsic;
    const approxDelta = Math.min(
      1,
      Math.max(
        0.01,
        (optionPrice / spotPrice) * (spotPrice / optionPrice > 1 ? 1 : spotPrice / optionPrice),
      ),
    );
    const leverageRatio = (approxDelta * spotPrice) / (optionPrice > 0 ? optionPrice : 1);
    return { leverage: leverageRatio, delta: approxDelta, intrinsic, timeValue };
  }, [spotPrice, strikePrice, optionPrice]);

  return (
    <CollapsibleCard icon={Flame} title="期权杠杆">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="标的价" value={spotPrice} onChange={setSpotPrice} step={1} />
        <Field label="行权价" value={strikePrice} onChange={setStrikePrice} step={1} />
        <Field label="期权价" value={optionPrice} onChange={setOptionPrice} step={0.5} />
        <Field
          label="合约乘数"
          value={contractMultiplier}
          onChange={setContractMultiplier}
          step={1}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="杠杆倍数" value={result.leverage.toFixed(2) + 'x'} color="var(--brand)" />
        <ResultRow label="近似 Delta" value={result.delta.toFixed(4)} color="var(--support)" />
        <ResultRow label="内在价值" value={result.intrinsic.toFixed(2)} />
        <ResultRow label="时间价值" value={result.timeValue.toFixed(2)} />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        杠杆 = Δ × S / 期权费；Delta 采用简化近似估算。
      </div>
    </CollapsibleCard>
  );
}
