/**
 * @file 未登录提示卡片
 * @description 受保护页面在用户未认证时显示的统一提示：居中卡片 + 登录链接。
 *              原先在 OrgMembersPage 与 BillingPage 中各有一份近乎相同的实现。
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface UnauthedNoticeProps {
  /** 前缀文案的 i18n key（如 "orgMembers.unauthed.prefix"） */
  prefixKey: string;
  /** 登录链接文案的 i18n key（如 "orgMembers.unauthed.login"） */
  loginKey: string;
  /** 后缀文案的 i18n key（如 "orgMembers.unauthed.suffix"） */
  suffixKey: string;
}

/**
 * 渲染未登录提示卡片：居中 bt-page 容器 + bt-main-card 卡片 + muted 文案 + 登录链接。
 *
 * @param prefixKey - 前缀文案 i18n key
 * @param loginKey - 登录链接文案 i18n key
 * @param suffixKey - 后缀文案 i18n key
 * @returns 未登录提示 JSX
 */
export default function UnauthedNotice({ prefixKey, loginKey, suffixKey }: UnauthedNoticeProps) {
  const { t } = useTranslation();
  return (
    <div className="bt-page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div
        className="bt-main-card card"
        style={{ padding: 28, marginTop: 40, textAlign: 'center' }}
      >
        <p style={{ color: 'var(--text-muted)' }}>
          {t(prefixKey)}{' '}
          <Link to="/login" style={{ color: 'var(--brand)' }}>
            {t(loginKey)}
          </Link>{' '}
          {t(suffixKey)}
        </p>
      </div>
    </div>
  );
}
