import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Mail,
  Palette,
  DollarSign,
  RefreshCw,
  CreditCard,
  Crown,
  Calendar,
  LogIn,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/miscHooks.js';
import { useAuthStore } from '@/store/authStore';
import { importLocalConfigsOnce } from '@/utils/portfolioStorage';
import { SectionTitle, PrefRow } from '../../components/cards.js';
import { StandardPageShell } from '../../components/shells/index.js';
const AVATAR_STYLE: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  background: 'var(--brand)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 26,
  fontWeight: 700,
  flexShrink: 0,
};
const USER_CARD_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  marginBottom: 24,
  padding: 16,
  background: 'var(--bg-subtle)',
  borderRadius: 'var(--radius-control)',
};
const ROLE_BADGE_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--brand)',
  background: 'var(--brand-soft)',
  padding: '2px 8px',
  borderRadius: 10,
};
const EMAIL_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  color: 'var(--text-muted)',
};
const LOGIN_LINK_STYLE: React.CSSProperties = {
  minHeight: 38,
  padding: '0 16px',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};
const SUB_CARD_STYLE: React.CSSProperties = {
  padding: 20,
  background: 'var(--brand-soft)',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border-soft)',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
};
const CROWN_STYLE: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  background: 'var(--brand)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
const PLAN_NAME_STYLE: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-strong)',
  marginBottom: 4,
};
const PLAN_DATE_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--text-muted)',
};
const NOTICE_STYLE: React.CSSProperties = {
  marginTop: 20,
  padding: 14,
  background: 'var(--bg-subtle)',
  borderRadius: 'var(--radius-control)',
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.7,
};
const SELECT_CLASS = 'bg-input-bg text-fg border border-border-subtle rounded font-medium';
const CURRENCY_OPTS = [
  ['USD', 'currencyUSD'],
  ['CNY', 'currencyCNY'],
  ['EUR', 'currencyEUR'],
  ['JPY', 'currencyJPY'],
  ['HKD', 'currencyHKD'],
] as const;
const REBALANCE_OPTS = [
  ['none', 'rebalanceBuyHold'],
  ['monthly', 'rebalanceMonthly'],
  ['quarterly', 'rebalanceQuarterly'],
  ['yearly', 'rebalanceYearly'],
  ['threshold', 'rebalanceThreshold'],
] as const;
function UserInfoCard({
  displayName,
  roleLabel,
  initials,
  userId,
}: {
  displayName: string;
  roleLabel: string;
  initials: string;
  userId: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div style={USER_CARD_STYLE}>
      <div style={AVATAR_STYLE}>{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>
            {displayName}
          </span>
          <span style={ROLE_BADGE_STYLE}>{roleLabel}</span>
        </div>
        <div style={EMAIL_ROW_STYLE}>
          <Mail className="w-3.5 h-3.5" />
          {userId ? t('account.userIdLabel', { userId }) : 'user@backtest.local'}
        </div>
      </div>
      {!userId && (
        <Link to="/login" className="main-action-btn no-underline" style={LOGIN_LINK_STYLE}>
          <LogIn className="w-4 h-4" /> {t('account.login')}
        </Link>
      )}
    </div>
  );
}
function ThemeToggleRow({
  isDark,
  toggleTheme,
  t,
}: {
  isDark: boolean;
  toggleTheme: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <PrefRow
      icon={<Palette className="w-4 h-4" />}
      label={t('account.preferences.themeMode')}
      desc={
        isDark
          ? t('account.preferences.themeCurrentDark')
          : t('account.preferences.themeCurrentLight')
      }
    >
      <div
        className={`toggle-switch ${isDark ? 'active' : ''}`}
        onClick={toggleTheme}
        role="switch"
        tabIndex={0}
        aria-checked={isDark}
        title={isDark ? t('nav.switchToLight') : t('nav.switchToDark')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleTheme();
          }
        }}
      />
    </PrefRow>
  );
}
function PreferencesSection({
  isDark,
  toggleTheme,
  currency,
  rebalance,
  onCurrencyChange,
  onRebalanceChange,
}: {
  isDark: boolean;
  toggleTheme: () => void;
  currency: string;
  rebalance: string;
  onCurrencyChange: (v: string) => void;
  onRebalanceChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle icon={<Palette className="w-5 h-5" />} title={t('account.preferences.title')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        <ThemeToggleRow isDark={isDark} toggleTheme={toggleTheme} t={t} />
        <PrefRow
          icon={<DollarSign className="w-4 h-4" />}
          label={t('account.preferences.currency')}
          desc={t('account.preferences.currencyDesc')}
        >
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className={SELECT_CLASS}
            style={{ width: 140 }}
          >
            {CURRENCY_OPTS.map(([v, k]) => (
              <option key={v} value={v}>
                {t(`account.preferences.${k}`)}
              </option>
            ))}
          </select>
        </PrefRow>
        <PrefRow
          icon={<RefreshCw className="w-4 h-4" />}
          label={t('account.preferences.rebalance')}
          desc={t('account.preferences.rebalanceDesc')}
        >
          <select
            value={rebalance}
            onChange={(e) => onRebalanceChange(e.target.value)}
            className={SELECT_CLASS}
            style={{ width: 140 }}
          >
            {REBALANCE_OPTS.map(([v, k]) => (
              <option key={v} value={v}>
                {t(`account.preferences.${k}`)}
              </option>
            ))}
          </select>
        </PrefRow>
      </div>
    </>
  );
}
function SubscriptionSection({ plan }: { plan: string | undefined }) {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle
        icon={<CreditCard className="w-5 h-5" />}
        title={t('account.subscription.title')}
      />
      <div style={SUB_CARD_STYLE}>
        <div style={CROWN_STYLE}>
          <Crown className="w-5 h-5" />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={PLAN_NAME_STYLE}>
            {plan
              ? t('account.subscription.currentPlanSuffix', { plan: plan.toUpperCase() })
              : t('account.subscription.freePlan')}
          </div>
          <div style={PLAN_DATE_STYLE}>
            <Calendar className="w-3 h-3" />
            {t('account.subscription.localDeploy')}
          </div>
        </div>
        <button
          className="main-action-btn"
          style={{ minHeight: 38, padding: '0 18px', fontSize: 13 }}
          onClick={() => {
            window.location.hash = '#/pricing';
          }}
        >
          {t('account.subscription.upgrade')}
        </button>
      </div>
    </>
  );
}
export default function AccountPage() {
  const { t } = useTranslation();
  const { toggleTheme, isDark } = useTheme();
  const [currency, setCurrency] = useState('USD');
  const [rebalance, setRebalance] = useState('quarterly');
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  useEffect(() => {
    if (user?.tenantId) void importLocalConfigsOnce();
  }, [user?.tenantId]);
  const displayName = org?.name ?? (user ? user.userId : 'Backtest User');
  const roleLabel = user
    ? user.platformAdmin
      ? t('account.role.admin')
      : (org?.role ?? user.role)
    : t('account.role.local');
  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <StandardPageShell config={{ titleKey: 'account.title' }}>
      <div className="bt-main-card card" style={{ padding: 24 }}>
        <UserInfoCard
          displayName={displayName}
          roleLabel={roleLabel}
          initials={initials}
          userId={user?.userId}
        />
        <PreferencesSection
          isDark={isDark}
          toggleTheme={toggleTheme}
          currency={currency}
          rebalance={rebalance}
          onCurrencyChange={setCurrency}
          onRebalanceChange={setRebalance}
        />
        <SubscriptionSection plan={org?.plan} />
        <div style={NOTICE_STYLE}>
          <User
            className="w-3.5 h-3.5"
            style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }}
          />
          {t('account.localDeployNotice')}
        </div>
      </div>
    </StandardPageShell>
  );
}
