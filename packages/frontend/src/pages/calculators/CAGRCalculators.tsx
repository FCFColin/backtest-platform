import { useState, useMemo } from 'react';
import { TrendingUp, DollarSign } from 'lucide-react';
import { Area } from 'recharts';
import { useTranslation } from 'react-i18next';
import { CalcCard } from './BaseCalculatorUI.js';
import { formatPct, formatNum } from './baseCalculatorUtils.js';
import { CHART_COLORS } from '@backtest/shared';
import { SimpleAreaChart } from '@/components/charts/sharedChartContent.js';
function ValueCurveChart({
  curve,
  height,
}: {
  curve: Array<{ year: number; value: number }>;
  height: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3">
      <SimpleAreaChart
        data={curve}
        height={height}
        xDataKey="year"
        showLegend={false}
        xTickInterval="preserveStartEnd"
        yTickFormatter={formatNum}
        tooltipFormatter={(v: number) => [formatNum(v), t('Final Value')]}
      >
        <Area
          type="monotone"
          dataKey="value"
          stroke={CHART_COLORS[0]}
          fill={CHART_COLORS[0]}
          fillOpacity={0.12}
          strokeWidth={2}
        />
      </SimpleAreaChart>
    </div>
  );
}
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
    <CalcCard
      icon={TrendingUp}
      title={t('CAGR Calculator')}
      defaultOpen
      cols={3}
      fields={[
        { label: t('Initial Value'), value: initial, onChange: setInitial, step: 1000, min: 0 },
        { label: t('Final Value'), value: finalVal, onChange: setFinalVal, step: 1000, min: 0 },
        { label: t('Years'), value: years, onChange: setYears, suffix: t('y'), step: 1, min: 1 },
      ]}
      rows={[{ label: 'CAGR', value: formatPct(cagr), tone: 'brand' }]}
      info={t(
        'Formula: Final Value = Initial Value × (1 + Monthly Return)^Months + Monthly Contribution × [((1 + Monthly Return)^Months - 1) / Monthly Return]',
      )}
    />
  );
}
function computeFutureValue(initial: number, cagr: number, years: number, monthly: number) {
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
    <CalcCard
      icon={DollarSign}
      title={t('Future Value Calculation')}
      defaultOpen
      cols={2}
      fields={[
        { label: t('Initial Value'), value: initial, onChange: setInitial, step: 1000, min: 0 },
        { label: 'CAGR', value: cagr, onChange: setCagr, suffix: '%', step: 0.5 },
        { label: t('Years'), value: years, onChange: setYears, suffix: t('y'), step: 1, min: 1 },
        {
          label: t('Monthly Contribution'),
          value: monthly,
          onChange: setMonthly,
          step: 100,
          min: 0,
        },
      ]}
      rows={[
        { label: t('Final Value'), value: formatNum(finalValue), tone: 'brand' },
        { label: t('Total Contribution'), value: formatNum(totalContributions) },
        {
          label: t('Investment Gain'),
          value: formatNum(finalValue - totalContributions),
          tone: 'success',
        },
      ]}
      chart={<ValueCurveChart curve={curve} height={240} />}
    />
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
    <CalcCard
      icon={TrendingUp}
      title={t('Assumptions')}
      cols={2}
      fields={[
        { label: t('Expected Return'), value: cagr, onChange: setCagr, suffix: '%' },
        { label: t('Volatility'), value: vol, onChange: setVol, suffix: '%' },
        { label: t('Time'), value: years, onChange: setYears, suffix: t('y'), step: 1 },
        { label: t('Initial Capital'), value: initial, onChange: setInitial, step: 1000 },
      ]}
      rows={[{ label: t('Final Value'), value: formatNum(finalValue), tone: 'brand' }]}
      chart={<ValueCurveChart curve={curve} height={200} />}
    />
  );
}
