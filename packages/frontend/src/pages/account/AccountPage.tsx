/**
 * @file 账户/个人中心页面
 * @description 用户信息、偏好设置（主题/货币/再平衡频率）、订阅状态
 * @route /account
 */
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
import { useTheme } from '../../hooks/useTheme.js';
import { useAuthStore } from '@/store/authStore';
import { importLocalConfigsOnce } from '@/utils/configApi';
import { SectionTitle, PrefRow } from '../../components/cards.js';
import { StandardPageShell } from '../../components/shells/StandardPageShell.js';

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

interface UserInfoCardProps {
  displayName: string;
  roleLabel: string;
  initials: string;
  userId: string | undefined;
}

function UserInfoCard({ displayName, roleLabel, initials, userId }: UserInfoCardProps) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
        padding: 16,
        background: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div style={AVATAR_STYLE}>{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>
            {displayName}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--brand)',
              background: 'var(--brand-soft)',
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {roleLabel}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          <Mail className="w-3.5 h-3.5" />
          {userId ? t('account.userIdLabel', { userId }) : 'user@backtest.local'}
        </div>
      </div>
      {!userId && (
        <Link
          to="/login"
          className="main-action-btn no-underline"
          style={{
            minHeight: 38,
            padding: '0 16px',
            fontSize: 13,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <LogIn className="w-4 h-4" /> {t('account.login')}
        </Link>
      )}
    </div>
  );
}

interface PreferencesSectionProps {
  theme: string;
  isDark: boolean;
  toggleTheme: () => void;
  currency: string;
  rebalance: string;
  onCurrencyChange: (v: string) => void;
  onRebalanceChange: (v: string) => void;
}

function PreferencesSection({
  theme,
  isDark,
  toggleTheme,
  currency,
  rebalance,
  onCurrencyChange,
  onRebalanceChange,
}: PreferencesSectionProps) {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle icon={<Palette className="w-5 h-5" />} title={t('account.preferences.title')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
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
            aria-checked={isDark}
            title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
          />
        </PrefRow>
        <PrefRow
          icon={<DollarSign className="w-4 h-4" />}
          label={t('account.preferences.currency')}
          desc={t('account.preferences.currencyDesc')}
        >
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="portfolio-rebalance-select"
            style={{ width: 140 }}
          >
            <option value="USD">{t('account.preferences.currencyUSD')}</option>
            <option value="CNY">{t('account.preferences.currencyCNY')}</option>
            <option value="EUR">{t('account.preferences.currencyEUR')}</option>
            <option value="JPY">{t('account.preferences.currencyJPY')}</option>
            <option value="HKD">{t('account.preferences.currencyHKD')}</option>
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
            className="portfolio-rebalance-select"
            style={{ width: 140 }}
          >
            <option value="none">{t('account.preferences.rebalanceBuyHold')}</option>
            <option value="monthly">{t('account.preferences.rebalanceMonthly')}</option>
            <option value="quarterly">{t('account.preferences.rebalanceQuarterly')}</option>
            <option value="yearly">{t('account.preferences.rebalanceYearly')}</option>
            <option value="threshold">{t('account.preferences.rebalanceThreshold')}</option>
          </select>
        </PrefRow>
      </div>
    </>
  );
}

interface SubscriptionSectionProps {
  plan: string | undefined;
}

function SubscriptionSection({ plan }: SubscriptionSectionProps) {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle
        icon={<CreditCard className="w-5 h-5" />}
        title={t('account.subscription.title')}
      />
      <div
        style={{
          padding: 20,
          background: 'var(--brand-soft)',
          borderRadius: 'var(--radius-control)',
          border: '1px solid var(--border-soft)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--brand)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Crown className="w-5 h-5" />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div
            style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}
          >
            {plan
              ? t('account.subscription.currentPlanSuffix', { plan: plan.toUpperCase() })
              : t('account.subscription.freePlan')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
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
  const { theme, toggleTheme, isDark } = useTheme();
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
          theme={theme}
          isDark={isDark}
          toggleTheme={toggleTheme}
          currency={currency}
          rebalance={rebalance}
          onCurrencyChange={setCurrency}
          onRebalanceChange={setRebalance}
        />

        <SubscriptionSection plan={org?.plan} />

        <div
          style={{
            marginTop: 20,
            padding: 14,
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-control)',
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.7,
          }}
        >
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
