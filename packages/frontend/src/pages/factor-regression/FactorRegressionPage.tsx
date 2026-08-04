import { useTranslation } from 'react-i18next';
import { fmtPct, fmtNum } from '@/utils/format';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/uiComponents';
import { CollapsibleSection } from '@/components/cards.js';
import { ErrorBanner } from '@/components/stateDisplay.js';
import { FACTOR_COLORS } from './factorRegressionUtils.js';
import type { FactorRegressionResult } from './factorRegressionUtils.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import {
  useFactorRegressionState,
  type FactorRegressionState,
} from '@/hooks/useFactorRegressionState.js';
import { FactorRegressionParamsPanel } from './FactorRegressionParams.js';
function StatCard({
  label,
  value,
  tone,
  color,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
  color?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-caption text-fg-tertiary">
        {color && color !== 'transparent' && (
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />
        )}
        {label}
      </div>
      <div
        className={cn(
          'mt-1 font-mono tabular-nums text-h2',
          tone === 'pos' && 'text-pos',
          tone === 'neg' && 'text-neg',
          !tone && 'text-fg',
        )}
      >
        {value}
      </div>
    </Card>
  );
}
function RegressionRow({
  label,
  color,
  value,
  valueClassName,
  desc,
}: {
  label: string;
  color: string;
  value: string;
  valueClassName: string;
  desc: string;
}) {
  return (
    <tr className="border-b border-border-subtle transition-colors last:border-0 hover:bg-hover">
      <td className="px-3 py-2 text-body text-fg">
        <span
          className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
          style={{ backgroundColor: color }}
        />
        {label}
      </td>
      <td
        className={cn(
          'px-3 py-2 text-right font-mono tabular-nums text-body font-medium',
          valueClassName,
        )}
      >
        {value}
      </td>
      <td className="px-3 py-2 text-caption text-fg-tertiary">{desc}</td>
    </tr>
  );
}
function ResidualsChart({ residuals }: { residuals: number[] }) {
  const { t } = useTranslation();
  return (
    <div className="relative w-full" style={{ height: 200 }}>
      <svg viewBox="0 0 800 200" className="h-full w-full" preserveAspectRatio="none">
        <line
          x1="10"
          y1="100"
          x2="790"
          y2="100"
          stroke="var(--border-subtle)"
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
              fill={r >= 0 ? 'hsl(var(--success))' : 'hsl(var(--danger))'}
              opacity={0.5}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-center gap-4 text-caption text-fg-tertiary">
        <span>
          <span
            className="mr-1 inline-block h-1 w-3 rounded"
            style={{ backgroundColor: 'hsl(var(--success))' }}
          />
          {t('Positive residual')}
        </span>
        <span>
          <span
            className="mr-1 inline-block h-1 w-3 rounded"
            style={{ backgroundColor: 'hsl(var(--danger))' }}
          />
          {t('Negative residual')}
        </span>
      </div>
    </div>
  );
}
function RegressionResultTable({
  result,
  selectedFactors,
}: {
  result: FactorRegressionResult;
  selectedFactors: string[];
}) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-border-subtle">
              <th className="px-3 py-2.5 text-left text-caption font-semibold text-fg-tertiary">
                {t('Coefficient')}
              </th>
              <th className="px-3 py-2.5 text-right text-caption font-semibold text-fg-tertiary">
                {t('Estimate')}
              </th>
              <th className="px-3 py-2.5 text-left text-caption font-semibold text-fg-tertiary">
                {t('Meaning')}
              </th>
            </tr>
          </thead>
          <tbody>
            <RegressionRow
              label="Alpha"
              color={FACTOR_COLORS.alpha}
              value={fmtPct(result.alpha)}
              valueClassName={result.alpha >= 0 ? 'text-pos' : 'text-neg'}
              desc={t(
                "Portfolio excess return (annualized); positive means outperforming the factor model's expectation",
              )}
            />
            <RegressionRow
              label="Beta (MKT-RF)"
              color={FACTOR_COLORS.beta}
              value={fmtNum(result.beta, 3)}
              valueClassName="text-fg"
              desc={t('Market sensitivity; 1.0 means moving in sync with the market')}
            />
            {selectedFactors.includes('smb') && (
              <RegressionRow
                label="SMB"
                color={FACTOR_COLORS.smb}
                value={fmtNum(result.smb, 3)}
                valueClassName="text-fg"
                desc={t('Size factor loading; positive tilts toward small-cap stocks')}
              />
            )}
            {selectedFactors.includes('hml') && (
              <RegressionRow
                label="HML"
                color={FACTOR_COLORS.hml}
                value={fmtNum(result.hml, 3)}
                valueClassName="text-fg"
                desc={t('Value factor loading; positive tilts toward value stocks')}
              />
            )}
            <RegressionRow
              label="R²"
              color="transparent"
              value={fmtNum(result.rSquared, 3)}
              valueClassName="text-fg"
              desc={t(
                'Model explanatory power; closer to 1 means factors explain returns more fully',
              )}
            />
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function FactorRegressionResultsPanel({ state: s }: { state: FactorRegressionState }) {
  const { result, error, selectedFactors } = s;
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorBanner variant="error" message={`${t('Analysis failed')}: ${error}`} />}
      {result && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Alpha"
              value={fmtPct(result.alpha)}
              tone={result.alpha >= 0 ? 'pos' : 'neg'}
              color={FACTOR_COLORS.alpha}
            />
            <StatCard
              label="Beta (MKT-RF)"
              value={fmtNum(result.beta, 3)}
              color={FACTOR_COLORS.beta}
            />
            <StatCard label="R²" value={fmtNum(result.rSquared, 3)} color="transparent" />
          </div>
          <CollapsibleSection title={t('Fama-French Three-Factor Regression Results')} defaultOpen>
            <RegressionResultTable result={result} selectedFactors={selectedFactors} />
          </CollapsibleSection>
          {result.residuals.length > 0 && (
            <CollapsibleSection title={t('Regression Residuals')} defaultOpen>
              <Card className="p-4">
                <ResidualsChart residuals={result.residuals} />
              </Card>
            </CollapsibleSection>
          )}
          <div className="rounded-md border border-border-subtle bg-input-bg p-3 text-caption italic text-fg-tertiary">
            {t(
              'Factor data sourced from Kenneth French database (simulated data). The full version will integrate real-time Fama-French factor data.',
            )}
          </div>
        </>
      )}
    </div>
  );
}
const config: ComputeToolConfig<FactorRegressionState> = {
  titleKey: 'factorRegression.title',
  seoDescKey: 'factorRegression.seo.desc',
  seoFeatures: [
    {
      titleKey: 'factorRegression.seo.analyzableTitle',
      descKey: 'factorRegression.seo.analyzableDesc',
    },
    {
      titleKey: 'factorRegression.seo.factorTitle',
      descKey: 'factorRegression.seo.factorDesc',
    },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.rebalancingSensitivity', href: '/rebalancing-sensitivity' },
  ],
  params: FactorRegressionParamsPanel,
  results: FactorRegressionResultsPanel,
};
export default function FactorRegressionPage() {
  const { t } = useTranslation();
  const s = useFactorRegressionState(t);
  return <ComputeToolShell config={config} state={s} />;
}
