/**
 * @file 页脚组件 v2
 * @description 五栏结构：品牌 / 产品 / 资源 / 公司 / 数据。
 *   底部横条：版权+版本号 + SystemStatusIndicator + 数据信息。
 *   bg-surface-sunken border-t，responsive: 5→2→1 栏。
 */
import { Link } from 'react-router-dom';
import { BarChart3, Github, Twitter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useDataMeta } from '@/hooks/useDataMeta.js';
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
        {status === 'operational' ? t('footer.status.operational') : t('footer.status.degraded')}
      </span>
    </div>
  );
}

/** 品牌栏：Logo + 标语 + 社交链接 */
function FooterBrand() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-5 w-5 text-brand" />
        <span className="text-h3">{t('nav.brandName')}</span>
      </div>
      <p className="text-caption text-fg-tertiary leading-relaxed mb-4">
        {t('footer.brandTagline')}
      </p>
      <div className="flex items-center gap-3">
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          className="text-fg-tertiary hover:text-fg"
        >
          <Github className="h-4 w-4" aria-hidden="true" />
        </a>
        <a
          href="https://twitter.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Twitter"
          className="text-fg-tertiary hover:text-fg"
        >
          <Twitter className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/** 数据栏：数据来源 / 更新时间 / 历史深度 / 覆盖标的 */
function FooterDataColumn() {
  const { t } = useTranslation();
  const meta = useDataMeta();
  const displayDate = meta?.lastUpdated ?? new Date().toISOString().split('T')[0];
  const tickerCount = meta?.tickerCount ?? '—';
  const earliestDate = meta?.earliestDate ?? '1962';

  return (
    <div>
      <h2 className="text-label-tiny text-fg-tertiary mb-3">{t('footer.sections.data')}</h2>
      <div className="space-y-2 text-caption text-fg-tertiary">
        <div>
          <div className="text-fg-secondary">{t('footer.data.source')}</div>
          <div>{t('footer.data.sourceValue')}</div>
        </div>
        <div data-testid="footer-data-update">
          <div className="text-fg-secondary">{t('footer.data.updated')}</div>
          <div className="font-mono">{displayDate}</div>
        </div>
        <div data-testid="footer-data-history">
          <div className="text-fg-secondary">{t('footer.data.historyDepth')}</div>
          <div className="font-mono">
            {t('footer.data.historyDepthValue', { date: earliestDate })}
          </div>
        </div>
        <div data-testid="footer-data-coverage">
          <div className="text-fg-secondary">{t('footer.data.coverage')}</div>
          <div className="font-mono">{t('footer.data.coverageValue', { count: tickerCount })}</div>
        </div>
      </div>
    </div>
  );
}

/** 底部横条：版权 + 版本号 + 系统状态 */
function FooterBottom() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <div className="border-t border-border-subtle mt-8 pt-4 flex items-center justify-between flex-wrap gap-4">
      <div className="text-caption text-fg-tertiary">
        © {year} {t('nav.brandName')} · v{BUILD_HASH.slice(0, 7)}
      </div>
      <div className="flex items-center gap-4 text-caption">
        <SystemStatusIndicator />
      </div>
    </div>
  );
}

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-surface-sunken border-t border-border-subtle mt-auto">
      <div className="max-w-[1440px] mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          <FooterBrand />

          <FooterSection
            title={t('footer.sections.product')}
            links={[
              { to: '/', label: t('footer.product.portfolioBacktest') },
              { to: '/monte-carlo', label: t('footer.product.monteCarlo') },
              { to: '/optimizer', label: t('footer.product.optimizer') },
              { to: '/tactical', label: t('footer.product.tactical') },
              { to: '/analysis', label: t('footer.product.analysis') },
            ]}
          />

          <FooterSection
            title={t('footer.sections.resources')}
            links={[
              { to: '/help', label: t('footer.resources.docs') },
              { href: '/api/docs', label: t('footer.resources.apiRef') },
              { to: '/help', label: t('footer.resources.changelog') },
              { to: '/help', label: t('footer.resources.helpCenter') },
              { to: '/help', label: t('footer.resources.feedback') },
            ]}
          />

          <FooterSection
            title={t('footer.sections.company')}
            links={[
              { to: '/about', label: t('footer.company.about') },
              { to: '/pricing', label: t('footer.company.pricing') },
              { to: '/about', label: t('footer.company.contact') },
              { to: '/about', label: t('footer.company.privacy') },
              { to: '/about', label: t('footer.company.terms') },
            ]}
          />

          <FooterDataColumn />
        </div>

        <FooterBottom />
      </div>
    </footer>
  );
}
