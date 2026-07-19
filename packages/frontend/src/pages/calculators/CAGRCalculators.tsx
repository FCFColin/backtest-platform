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
import { useTranslation } from 'react-i18next';
import { Field, ResultRow, CollapsibleCard } from './BaseCalculatorUI.js';
import { formatPct, formatNum } from './baseCalculatorUtils.js';
import { CHART_COLORS } from '@backtest/shared';
import { CHART_GRID_PROPS, AXIS_TICK_STYLE } from '../../components/charts/chartConstants.js';

export function CAGRCalculator() {
  const { t } = useTranslation();
  const [initial, setInitial] = useState(10000);
  const [finalVal, setFinalVal] = useState(50000);
  const [years, setYears] = useState(10);

  const cagr = useMemo(() => {
    if (initial <= 0 || years <= 0) return 0;
    return Math.pow(finalVal / initial, 1 / years) - 1;
  }, [initial, finalVal, years]);

  return (
    <CollapsibleCard icon={TrendingUp} title={t('calculators.cagr.title')} defaultOpen>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
        <Field
          label={t('calculators.cagr.initialValue')}
          value={initial}
          onChange={setInitial}
          step={1000}
          min={0}
        />
        <Field
          label={t('calculators.cagr.finalValue')}
          value={finalVal}
          onChange={setFinalVal}
          step={1000}
          min={0}
        />
        <Field
          label={t('calculators.cagr.years')}
          value={years}
          onChange={setYears}
          suffix={t('calculators.cagr.yearSuffix')}
          step={1}
          min={1}
        />
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
        {t('calculators.cagr.formula')}
      </div>
    </CollapsibleCard>
  );
}

interface FutureValueComputation {
  finalValue: number;
  totalContributions: number;
  curve: Array<{ year: number; value: number }>;
}

/** 计算终值、总贡献与增长曲线（从组件抽出纯函数） */
function computeFutureValue(
  initial: number,
  cagr: number,
  years: number,
  monthly: number,
): FutureValueComputation {
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
}

/** 终值增长曲线图（从 FutureValueCalculator 抽出，控制行数） */
function FutureValueChart({
  curve,
  t,
}: {
  curve: Array<{ year: number; value: number }>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <div style={{ height: 180, marginTop: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={curve}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--border-soft)" />
          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={formatNum} />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: number) => [formatNum(v), t('calculators.cagr.finalValue')]}
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
  );
}

export function FutureValueCalculator() {
  const { t } = useTranslation();
  const [initial, setInitial] = useState(10000);
  const [cagr, setCagr] = useState(8);
  const [years, setYears] = useState(20);
  const [monthly, setMonthly] = useState(500);

  const { finalValue, totalContributions, curve } = useMemo(
    () => computeFutureValue(initial, cagr, years, monthly),
    [initial, cagr, years, monthly],
  );

  return (
    <CollapsibleCard icon={DollarSign} title={t('calculators.cagr.futureValueTitle')} defaultOpen>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field
          label={t('calculators.cagr.initialValue')}
          value={initial}
          onChange={setInitial}
          step={1000}
          min={0}
        />
        <Field label="CAGR" value={cagr} onChange={setCagr} suffix="%" step={0.5} />
        <Field
          label={t('calculators.cagr.years')}
          value={years}
          onChange={setYears}
          suffix={t('calculators.cagr.yearSuffix')}
          step={1}
          min={1}
        />
        <Field
          label={t('calculators.cagr.monthlyContribution')}
          value={monthly}
          onChange={setMonthly}
          step={100}
          min={0}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow
          label={t('calculators.cagr.finalValue')}
          value={formatNum(finalValue)}
          color="var(--brand)"
        />
        <ResultRow
          label={t('calculators.cagr.totalContribution')}
          value={formatNum(totalContributions)}
        />
        <ResultRow
          label={t('calculators.cagr.investmentGain')}
          value={formatNum(finalValue - totalContributions)}
          color="var(--success)"
        />
      </div>
      <FutureValueChart curve={curve} t={t} />
    </CollapsibleCard>
  );
}

export function CAGRAssumptionCalculator() {
  const { t } = useTranslation();
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
    <CollapsibleCard icon={TrendingUp} title={t('calculators.cagr.assumptionTitle')}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field
          label={t('calculators.cagr.expectedReturn')}
          value={cagr}
          onChange={setCagr}
          suffix="%"
        />
        <Field label={t('calculators.cagr.volatility')} value={vol} onChange={setVol} suffix="%" />
        <Field
          label={t('calculators.cagr.time')}
          value={years}
          onChange={setYears}
          suffix={t('calculators.cagr.yearSuffix')}
          step={1}
        />
        <Field
          label={t('calculators.cagr.initialCapital')}
          value={initial}
          onChange={setInitial}
          step={1000}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow
          label={t('calculators.cagr.finalValue')}
          value={formatNum(finalValue)}
          color="var(--brand)"
        />
      </div>
      <div style={{ height: 200, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve}>
            <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--border-soft)" />
            <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
            <YAxis tick={AXIS_TICK_STYLE} tickFormatter={formatNum} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => [formatNum(v), t('calculators.cagr.finalValue')]}
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
