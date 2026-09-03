import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, Button } from '@/components/ui/uiComponents';
import { ToolPageLayout } from '@/components/layout/ToolPageLayout';
export default function DemoPage() {
  const { t } = useTranslation();
  const preset = [
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ];
  return (
    <div className="page-container flex flex-col gap-4 pb-6">
      <h1 className="text-page-title text-fg">{t('Demo — 60/40 Portfolio')}</h1>
      <p className="text-body text-fg-secondary max-w-[720px]">
        {t(
          'Experience the platform without login. This demo uses a classic 60/40 allocation and shows sample results.',
        )}
      </p>
      <ToolPageLayout
        params={
          <Card className="p-5">
            <h3 className="text-h3 mb-3">{t('Demo Portfolio')}</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {preset.map((a) => (
                <div
                  key={a.ticker}
                  className="flex justify-between rounded border border-border-subtle px-3 py-2"
                >
                  <span className="font-mono text-fg">{a.ticker}</span>
                  <span className="font-mono text-fg-secondary">{a.weight}%</span>
                </div>
              ))}
            </div>
            <Link to="/">
              <Button variant="primary">{t('Try Full Backtest')}</Button>
            </Link>
          </Card>
        }
        results={
          <Card className="p-5">
            <h3 className="text-h3 mb-3">{t('Sample Results')}</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded bg-input-bg p-3 text-center">
                <div className="text-caption text-fg-tertiary">CAGR</div>
                <div className="font-mono text-success">7.2%</div>
              </div>
              <div className="rounded bg-input-bg p-3 text-center">
                <div className="text-caption text-fg-tertiary">Volatility</div>
                <div className="font-mono">11.3%</div>
              </div>
              <div className="rounded bg-input-bg p-3 text-center">
                <div className="text-caption text-fg-tertiary">Sharpe</div>
                <div className="font-mono">0.64</div>
              </div>
            </div>
            <p className="mt-3 text-caption text-fg-tertiary">
              {t('Historical performance does not guarantee future returns.')}
            </p>
          </Card>
        }
      />
    </div>
  );
}
