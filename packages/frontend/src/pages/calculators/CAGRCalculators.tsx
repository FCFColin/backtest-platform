import { useState, useMemo } from 'react';
import { TrendingUp, DollarSign } from 'lucide-react';
import { Area } from 'recharts';
import { useTranslation } from 'react-i18next';
import { Field, ResultRow, InfoBox, CollapsibleCard } from './BaseCalculatorUI.js';
import { formatPct, formatNum } from './baseCalculatorUtils.js';
import { CHART_COLORS } from '@backtest/shared';
import { SimpleAreaChart } from '@/components/charts/sharedChartContent.js';
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
    <CollapsibleCard icon={TrendingUp} title={t('CAGR Calculator')} defaultOpen>
      <div className="grid grid-cols-3 gap-3">
        <Field
          label={t('Initial Value')}
          value={initial}
          onChange={setInitial}
          step={1000}
          min={0}
        />
        <Field
          label={t('Final Value')}
          value={finalVal}
          onChange={setFinalVal}
          step={1000}
          min={0}
        />
        <Field
          label={t('Years')}
          value={years}
          onChange={setYears}
          suffix={t('y')}
          step={1}
          min={1}
        />
      </div>
      <div className="mt-3">
        <ResultRow label="CAGR" value={formatPct(cagr)} tone="brand" />
      </div>
      <InfoBox>
        {t(
          'Formula: Final Value = Initial Value × (1 + Monthly Return)^Months + Monthly Contribution × [((1 + Monthly Return)^Months - 1) / Monthly Return]',
        )}
      </InfoBox>
    </CollapsibleCard>
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
    <CollapsibleCard icon={DollarSign} title={t('Future Value Calculation')} defaultOpen>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t('Initial Value')}
          value={initial}
          onChange={setInitial}
          step={1000}
          min={0}
        />
        <Field label="CAGR" value={cagr} onChange={setCagr} suffix="%" step={0.5} />
        <Field
          label={t('Years')}
          value={years}
          onChange={setYears}
          suffix={t('y')}
          step={1}
          min={1}
        />
        <Field
          label={t('Monthly Contribution')}
          value={monthly}
          onChange={setMonthly}
          step={100}
          min={0}
        />
      </div>
      <div className="mt-3">
        <ResultRow label={t('Final Value')} value={formatNum(finalValue)} tone="brand" />
        <ResultRow label={t('Total Contribution')} value={formatNum(totalContributions)} />
        <ResultRow
          label={t('Investment Gain')}
          value={formatNum(finalValue - totalContributions)}
          tone="success"
        />
      </div>
      <div className="mt-3">
        <SimpleAreaChart
          data={curve}
          height={240}
          xDataKey="year"
          showLegend={false}
          yTickFormatter={formatNum}
          xTickInterval="preserveStartEnd"
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
    <CollapsibleCard icon={TrendingUp} title={t('Assumptions')}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Expected Return')} value={cagr} onChange={setCagr} suffix="%" />
        <Field label={t('Volatility')} value={vol} onChange={setVol} suffix="%" />
        <Field label={t('Time')} value={years} onChange={setYears} suffix={t('y')} step={1} />
        <Field label={t('Initial Capital')} value={initial} onChange={setInitial} step={1000} />
      </div>
      <div className="mt-3">
        <ResultRow label={t('Final Value')} value={formatNum(finalValue)} tone="brand" />
      </div>
      <div className="mt-3">
        <SimpleAreaChart
          data={curve}
          height={200}
          xDataKey="year"
          showLegend={false}
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
    </CollapsibleCard>
  );
}
