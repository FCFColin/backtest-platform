/**
 * @file 页脚组件
 * @description 包含法律链接与数据时间戳，与导航栏风格一致，响应式布局
 */
import { useTranslation } from 'react-i18next';

/** 页脚链接 - 复用统一悬停色 */
function FooterLink({
  href,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
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
  return (
    <footer className="app-footer">
      <div className="app-footer-left">
        <FooterLink href="/help">{t('footer.help')}</FooterLink>
        <span className="app-footer-sep">·</span>
        <FooterLink href="mailto:support@example.com">{t('footer.contact')}</FooterLink>
        <span className="app-footer-sep">·</span>
        <FooterLink href="/about">{t('footer.terms')}</FooterLink>
        <span className="app-footer-sep">·</span>
        <FooterLink href="/about">{t('footer.privacy')}</FooterLink>
        <span className="app-footer-sep">·</span>
        <span>{t('footer.marketDataUpdated')}: {today}</span>
      </div>
      <div className="app-footer-right">
        <FooterLink href="https://github.com/issues" target="_blank" rel="noreferrer">
          {t('footer.bugReport')}
        </FooterLink>
      </div>
    </footer>
  );
}

export default Footer;
