import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Card, Button } from '@/components/ui/uiComponents';
import { ToolPageLayout } from '@/components/layout/ToolPageLayout';
import type { Portfolio } from '@backtest/shared';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  buildBacktestParameters,
} from '@/utils/constants';

const DEMO_CONFIG: {
  portfolios: Portfolio[];
  parameters: ReturnType<typeof buildBacktestParameters>;
} = {
  portfolios: [
    {
      id: 'portfolio-demo-1',
      name: '60/40 Demo',
      assets: [
        { ticker: 'VTI', weight: 60 },
        { ticker: 'BND', weight: 40 },
      ],
      rebalanceFrequency: 'annual',
    },
  ],
  parameters: buildBacktestParameters(DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE, {
    baseCurrency: 'usd',
    adjustForInflation: false,
  }),
};

export default function DemoPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const preset = [
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ];
  const startFullBacktest = () => {
    try {
      localStorage.setItem('bt_load_from_optimizer', JSON.stringify(DEMO_CONFIG));
    } catch {}
    navigate('/');
  };
  return (
    <div className="page-container flex flex-col gap-4 pb-6">
      <h1 className="text-page-title text-fg">{t('Demo — 60/40 Portfolio')}</h1>
      <p className="text-body text-fg-secondary max-w-[720px]">
        {t(
          'This demo uses preset demo data with a classic 60/40 allocation — no login required. Results shown are samples.',
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
            <Button variant="primary" onClick={startFullBacktest}>
              {t('Try Full Backtest')}
            </Button>
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
