import { useTranslation } from 'react-i18next';
import type { Statistics } from '@backtest/shared';
import { Card } from '@/components/ui/uiComponents';
import { fmtPct } from '@/utils/format';
export function AiExplanation({ stats }: { stats: Statistics }) {
  const { t } = useTranslation();
  const cagr = stats.cagr ?? 0,
    sharpe = stats.sharpe ?? 0,
    mdd = stats.maxDrawdown ?? 0,
    vol = stats.stdev ?? 0;
  const tone = sharpe > 1 ? 'success' : sharpe > 0.5 ? 'warning' : 'danger';
  const sentences = [
    t('Your portfolio delivered {{cagr}} annualized return with {{vol}} volatility.', {
      cagr: fmtPct(cagr),
      vol: fmtPct(vol),
    }),
    sharpe > 1
      ? t('Sharpe {{sharpe}} indicates strong risk-adjusted performance.', {
          sharpe: sharpe.toFixed(2),
        })
      : t('Sharpe {{sharpe}} suggests room to improve risk-adjusted return.', {
          sharpe: sharpe.toFixed(2),
        }),
    mdd > 0.3
      ? t(
          'Max drawdown {{mdd}} is significant — consider lower equity exposure or tighter rebalancing bands.',
          { mdd: fmtPct(mdd) },
        )
      : t('Max drawdown {{mdd}} is contained.', { mdd: fmtPct(mdd) }),
  ];
  return (
    <Card className="p-4 border-l-4 border-l-brand bg-input-bg/50">
      <h3 className="text-h3 mb-2 flex items-center gap-2">
        <span className="inline-block size-2 rounded-full bg-brand animate-pulse" />
        {t('AI Explanation')}
      </h3>
      <ul className="list-disc pl-5 space-y-1 text-body text-fg-secondary">
        {sentences.map((s, i) => (
          <li key={i} className={tone === 'success' ? 'marker:text-success' : ''}>
            {s}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption italic text-fg-tertiary">
        {t('Generated from your backtest metrics — not investment advice.')}
      </p>
    </Card>
  );
}
