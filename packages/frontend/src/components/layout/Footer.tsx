import { Link } from 'react-router';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useDataMeta } from '@/hooks/miscHooks.js';
import { cn } from '@/lib/utils';
interface FooterLinkDef {
  to?: string;
  href?: string;
  label: string;
}
const LINK_CLASS =
  'text-caption text-fg-secondary transition-colors duration-150 ease-out-quart hover:text-fg';
const BUILD_HASH = import.meta.env.VITE_BUILD_HASH ?? 'dev';
function FooterLink({ to, href, label }: FooterLinkDef) {
  if (to)
    return (
      <Link to={to} className={LINK_CLASS}>
        {label}
      </Link>
    );
  return (
    <a href={href} className={LINK_CLASS}>
      {label}
    </a>
  );
}
function FooterSection({ title, links }: { title: string; links: FooterLinkDef[] }) {
  return (
    <div>
      <h2 className="text-label-tiny text-fg-tertiary mb-3">{title}</h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            <FooterLink {...link} />
          </li>
        ))}
      </ul>
    </div>
  );
}
function SystemStatusIndicator() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'operational' | 'degraded'>('operational');
  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const s = json?.status ?? json?.data?.status;
        if (s === 'ok' || s === 'operational') setStatus('operational');
        else if (s) setStatus('degraded');
      })
      .catch(() => setStatus('degraded'));
  }, []);
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          status === 'operational' ? 'bg-success' : 'bg-warning',
        )}
      />
      <span className="text-caption text-fg-tertiary">
        {status === 'operational' ? t('All systems operational') : t('System degraded')}
      </span>
    </div>
  );
}
function FooterBrand() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-5 w-5 text-brand" />
        <span className="text-h3">{t('Backtest Platform')}</span>
      </div>
      <p className="text-caption text-fg-tertiary leading-relaxed">
        {t('Professional backtesting platform for individual investors')}
      </p>
    </div>
  );
}
function FooterDataColumn() {
  const { t } = useTranslation();
  const meta = useDataMeta();
  const displayDate = meta?.lastUpdated ?? new Date().toISOString().split('T')[0];
  const tickerCount = meta?.tickerCount ?? '—';
  const earliestDate = meta?.earliestDate ?? '1962';
  return (
    <div>
      <h2 className="text-label-tiny text-fg-tertiary mb-3">{t('Data')}</h2>
      <div className="space-y-2 text-caption text-fg-tertiary">
        <div>
          <div className="text-fg-secondary">{t('Data Source')}</div>
          <div>{t('yfinance · finnhub · akshare · BaoStock')}</div>
        </div>
        <div data-testid="footer-data-update">
          <div className="text-fg-secondary">{t('Data Updated')}</div>
          <div className="font-mono">{displayDate}</div>
        </div>
        <div data-testid="footer-data-history">
          <div className="text-fg-secondary">{t('History Depth')}</div>
          <div className="font-mono">{t('from {{date}}', { date: earliestDate })}</div>
        </div>
        <div data-testid="footer-data-coverage">
          <div className="text-fg-secondary">{t('Tickers Covered')}</div>
          <div className="font-mono">{t('{{count}}', { count: tickerCount })}</div>
        </div>
      </div>
    </div>
  );
}
function FooterBottom() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <div className="border-t border-border-subtle mt-8 pt-4 flex flex-col gap-3">
      <p className="text-caption text-fg-tertiary">
        {t(
          'This platform is for research and educational purposes only and does not constitute investment advice',
        )}{' '}
        <Link to="/legal/disclaimer" className="text-fg-secondary hover:text-fg underline">
          {t('Disclaimer')}
        </Link>
      </p>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="text-caption text-fg-tertiary">
          {t('© {{year}} {{brand}}', { year, brand: t('Backtest Platform') })}
          {import.meta.env.DEV && BUILD_HASH !== 'dev' && ` · v${BUILD_HASH.slice(0, 7)}`}
        </div>
        <div className="flex items-center gap-4 text-caption">
          <SystemStatusIndicator />
        </div>
      </div>
    </div>
  );
}
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-surface-sunken border-t border-border-subtle mt-auto">
      <div className="page-container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          <FooterBrand />
          <FooterSection
            title={t('Product')}
            links={[
              { to: '/', label: t('nav.portfolioBacktest') },
              { to: '/monte-carlo', label: t('Monte Carlo') },
              { to: '/optimizer', label: t('Optimizer') },
              { to: '/tactical', label: t('Tactical') },
              { to: '/analysis', label: t('Analysis Tools') },
            ]}
          />
          <FooterSection
            title={t('Resources')}
            links={[
              { to: '/help', label: t('Help Center') },
              { href: '/api/docs', label: t('API Reference') },
              { to: '/changelog', label: t('Changelog') },
            ]}
          />
          <FooterSection
            title={t('Company')}
            links={[
              { to: '/about', label: t('About') },
              { to: '/pricing', label: t('Pricing') },
              { to: '/contact', label: t('Contact Us') },
              { to: '/legal/privacy', label: t('Privacy Policy') },
              { to: '/legal/terms', label: t('Terms of Service') },
            ]}
          />
          <FooterDataColumn />
        </div>
        <FooterBottom />
      </div>
    </footer>
  );
}
