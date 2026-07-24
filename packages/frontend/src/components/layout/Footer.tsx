/**
 * @file 页脚组件
 * @description 包含品牌标识、法律链接、数据时间戳与问题反馈，暗色金融平台主题，响应式布局。
 */
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FooterLinkDef {
  to?: string;
  href?: string;
  label: string;
}

const LINK_CLASS =
  'text-body text-fg-secondary transition-colors duration-150 ease-out-quart hover:text-fg';

/**
 * 页脚链接：内部路由用 Link，外链用 a，统一样式。
 * @param props - to/href/label。
 * @returns 渲染的链接元素。
 */
function FooterLink({ to, href, label }: FooterLinkDef) {
  if (to) {
    return (
      <Link to={to} className={LINK_CLASS}>
        {label}
      </Link>
    );
  }
  return (
    <a href={href} className={LINK_CLASS}>
      {label}
    </a>
  );
}

/**
 * 页脚组件：品牌标识 + 法律链接 + 数据时间戳 + 问题反馈 + 版权。
 * @returns 页脚元素。
 */
export function Footer() {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];
  const year = new Date().getFullYear();

  const links: FooterLinkDef[] = [
    { to: '/help', label: t('footer.help') },
    { href: 'mailto:support@example.com', label: t('footer.contact') },
    { to: '/about', label: t('footer.terms') },
    { to: '/about', label: t('footer.privacy') },
  ];

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:flex-row sm:items-start sm:px-6">
        <div className="flex shrink-0 items-center gap-2 text-fg">
          <BarChart3 className="size-4 text-brand" />
          <span className="text-label">{t('nav.brandName')}</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((link) => (
            <FooterLink key={link.label} {...link} />
          ))}
        </nav>
        <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
          <a
            href="https://github.com/issues"
            target="_blank"
            rel="noreferrer"
            className={LINK_CLASS}
          >
            {t('footer.bugReport')}
          </a>
          <span className="text-caption text-fg-tertiary">
            {t('footer.marketDataUpdated')}: {today}
          </span>
          <span className="text-caption text-fg-tertiary">
            © {year} {t('nav.brandName')}
          </span>
        </div>
      </div>
    </footer>
  );
}
