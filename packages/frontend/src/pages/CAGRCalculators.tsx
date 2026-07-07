import { useState, useMemo } from 'react';
import { TrendingUp, DollarSign } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Field, ResultRow, CollapsibleCard } from './BaseCalculatorUI.js';
import { CHART_COLORS, formatPct, formatNum } from './baseCalculatorUtils.js';

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
