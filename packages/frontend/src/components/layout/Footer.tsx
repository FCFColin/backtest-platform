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
  if (to) return <Link to={to} className={LINK_CLASS}>{label}</Link>;
  return <a href={href} className={LINK_CLASS}>{label}</a>;
}

function FooterSection({ title, links }: { title: string; links: FooterLinkDef[] }) {
  return (
    <div>
      <h4 className="text-label-tiny text-fg-tertiary mb-3">{title}</h4>
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
        {status === 'operational' ? '系统运行正常' : '系统降级'}
      </span>
    </div>
  );
}

export function Footer() {
  const { t } = useTranslation();
  const meta = useDataMeta();
  const year = new Date().getFullYear();
  const displayDate = meta?.lastUpdated ?? new Date().toISOString().split('T')[0];
  const tickerCount = meta?.tickerCount ?? '—';
  const earliestDate = meta?.earliestDate ?? '1962';

  return (
    <footer className="bg-surface-sunken border-t border-border-subtle mt-20">
      <div className="max-w-[1440px] mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          {/* 品牌栏 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-5 w-5 text-brand" />
              <span className="text-h3">{t('nav.brandName')}</span>
            </div>
            <p className="text-caption text-fg-tertiary leading-relaxed mb-4">
              面向个人投资者的专业回测平台
            </p>
            <div className="flex items-center gap-3">
              <a href="https://github.com" target="_blank" rel="noreferrer" className="text-fg-tertiary hover:text-fg">
                <Github className="h-4 w-4" />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noreferrer" className="text-fg-tertiary hover:text-fg">
                <Twitter className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* 产品栏 */}
          <FooterSection title="产品" links={[
            { to: '/', label: '组合回测' },
            { to: '/monte-carlo', label: '蒙特卡洛' },
            { to: '/optimizer', label: '优化器' },
            { to: '/tactical', label: '战术分配' },
            { to: '/analysis', label: '分析工具' },
          ]} />

          {/* 资源栏 */}
          <FooterSection title="资源" links={[
            { to: '/help', label: '文档' },
            { href: '/api/docs', label: 'API 参考' },
            { to: '/help', label: '更新日志' },
            { to: '/help', label: '帮助中心' },
            { to: '/help', label: '反馈' },
          ]} />

          {/* 公司栏 */}
          <FooterSection title="公司" links={[
            { to: '/about', label: '关于' },
            { to: '/pricing', label: '定价' },
            { to: '/about', label: '联系我们' },
            { to: '/about', label: '隐私政策' },
            { to: '/about', label: '服务条款' },
          ]} />

          {/* 数据栏 */}
          <div>
            <h4 className="text-label-tiny text-fg-tertiary mb-3">数据</h4>
            <div className="space-y-2 text-caption text-fg-tertiary">
              <div>
                <div className="text-fg-secondary">数据来源</div>
                <div>yfinance · finnhub · akshare · BaoStock</div>
              </div>
              <div>
                <div className="text-fg-secondary">数据更新</div>
                <div className="font-mono">{displayDate}</div>
              </div>
              <div>
                <div className="text-fg-secondary">历史深度</div>
                <div className="font-mono">{earliestDate} 起</div>
              </div>
              <div>
                <div className="text-fg-secondary">覆盖标的</div>
                <div className="font-mono">{tickerCount} 个</div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部横条 */}
        <div className="border-t border-border-subtle mt-8 pt-4 flex items-center justify-between flex-wrap gap-4">
          <div className="text-caption text-fg-tertiary">
            © {year} {t('nav.brandName')} · v{BUILD_HASH.slice(0, 7)}
          </div>
          <div className="flex items-center gap-4 text-caption">
            <SystemStatusIndicator />
          </div>
        </div>
      </div>
    </footer>
  );
}
