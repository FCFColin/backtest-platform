/**
 * @file 页脚组件
 * @description 包含法律链接与数据时间戳，与导航栏风格一致，响应式布局
 */
import { useTranslation } from 'react-i18next';

/** 页脚链接 - 复用统一悬停色 */
function FooterLink({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} className="app-footer-link" {...rest}>
      {children}
    </a>
  );
}

/** 页脚组件 - 包含法律链接与数据时间戳 */
export function Footer() {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];
  const leftLinks = [
    { href: '/help', label: t('footer.help') },
    { href: 'mailto:support@example.com', label: t('footer.contact') },
    { href: '/about', label: t('footer.terms') },
    { href: '/about', label: t('footer.privacy') },
  ];
  return (
    <footer className="app-footer">
      <div className="app-footer-left">
        {leftLinks.map((link, i) => (
          <span key={i}>
            {i > 0 && <span className="app-footer-sep">·</span>}
            <FooterLink href={link.href}>{link.label}</FooterLink>
          </span>
        ))}
        <span className="app-footer-sep">·</span>
        <span>
          {t('footer.marketDataUpdated')}: {today}
        </span>
      </div>
      <div className="app-footer-right">
        <FooterLink href="https://github.com/issues" target="_blank" rel="noreferrer">
          {t('footer.bugReport')}
        </FooterLink>
      </div>
    </footer>
  );
}
