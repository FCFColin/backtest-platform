import { useState, useEffect } from 'react';
import { Link } from 'react-router';
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
import { useSettingsStore } from '@/store/settingsStore';
import { importLocalConfigsOnce } from '@/utils/portfolioStorage';
import { SectionTitle, PrefRow } from '../../components/cards.js';
import { StandardPageShell } from '../../components/shells/index.js';
import { Button, Card } from '@/components/ui/uiComponents';
const SELECT_CLASS = 'bg-input-bg text-fg border border-border-subtle rounded font-medium';
const CURRENCY_OPTS = [
  ['USD', 'currencyUSD'],
  ['CNY', 'currencyCNY'],
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
    <div className="flex items-center gap-4 mb-6 p-4 bg-[var(--bg-subtle)] rounded-[var(--radius-control)]">
      <div className="h-16 w-16 shrink-0 rounded-full bg-brand text-brand-fg flex items-center justify-center text-[26px] font-bold">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[18px] font-bold text-[var(--text-strong)]">{displayName}</span>
          <span className="text-[11px] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded-[10px]">
            {roleLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
          <Mail className="w-3.5 h-3.5" />
          {userId ? t('User ID: {{userId}}', { userId }) : 'user@backtest.local'}
        </div>
      </div>
      {!userId && (
        <Button asChild variant="primary" className="min-h-[38px] px-4 text-[13px]">
          <Link to="/login" className="no-underline">
            <LogIn className="w-4 h-4" /> {t('Log In')}
          </Link>
        </Button>
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
      label={t('Theme Mode')}
      desc={isDark ? t('Currently dark theme') : t('Currently light theme')}
    >
      <div
        className={`toggle-switch ${isDark ? 'active' : ''}`}
        onClick={toggleTheme}
        role="switch"
        tabIndex={0}
        aria-checked={isDark}
        title={isDark ? t('Switch to light theme') : t('Switch to dark theme')}
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
  const renderSelect = (
    value: string,
    onChange: (v: string) => void,
    opts: ReadonlyArray<readonly [string, string]>,
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
      style={{ width: 140 }}
    >
      {opts.map(([v, k]) => (
        <option key={v} value={v}>
          {t(`account.preferences.${k}`)}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <SectionTitle icon={<Palette className="w-5 h-5" />} title={t('Preferences')} />
      <div className="flex flex-col gap-3 mb-7">
        <ThemeToggleRow isDark={isDark} toggleTheme={toggleTheme} t={t} />
        <PrefRow
          icon={<DollarSign className="w-4 h-4" />}
          label={t('Currency')}
          desc={t('Select the currency displayed in backtest results')}
        >
          {renderSelect(currency, onCurrencyChange, CURRENCY_OPTS)}
        </PrefRow>
        <PrefRow
          icon={<RefreshCw className="w-4 h-4" />}
          label={t('Rebalancing Frequency')}
          desc={t('Set the default rebalance frequency')}
        >
          {renderSelect(rebalance, onRebalanceChange, REBALANCE_OPTS)}
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
        title={t('Subscription Information')}
      />
      <div className="p-5 bg-brand/10 rounded-[var(--radius-control)] border border-[var(--border-soft)] flex items-center gap-4 flex-wrap">
        <div className="h-12 w-12 rounded-full bg-brand text-brand-fg flex items-center justify-center shrink-0">
          <Crown className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="text-[16px] font-bold text-[var(--text-strong)] mb-1">
            {plan ? t('Current plan: {{plan}}', { plan: plan.toUpperCase() }) : t('Free Plan')}
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
            <Calendar className="w-3 h-3" />
            {t('Self-hosted Version')}
          </div>
        </div>
        <Button asChild variant="primary" className="min-h-[38px] px-[18px] text-[13px]">
          <Link to="/pricing">{t('Upgrade Plan')}</Link>
        </Button>
      </div>
    </>
  );
}
export default function AccountPage() {
  const { t } = useTranslation();
  const { toggleTheme, isDark } = useTheme();
  const currency = useSettingsStore((s) => s.currency.toUpperCase());
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const [rebalance, setRebalance] = useState('quarterly');
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  useEffect(() => {
    if (user?.tenantId) void importLocalConfigsOnce();
  }, [user?.tenantId]);
  const displayName = org?.name ?? (user ? user.userId : 'Backtest User');
  const roleLabel = user
    ? user.platformAdmin
      ? t('Platform Administrator')
      : (org?.role ?? user.role)
    : t('Local User');
  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <StandardPageShell config={{ titleKey: 'Account' }}>
      <Card className="p-6">
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
          onCurrencyChange={(v) => setCurrency(v.toLowerCase() as 'usd' | 'cny')}
          onRebalanceChange={setRebalance}
        />
        <SubscriptionSection plan={org?.plan} />
        <div className="mt-5 p-3.5 bg-[var(--bg-subtle)] rounded-[var(--radius-control)] text-[12px] text-[var(--text-muted)] leading-[1.7]">
          <User className="w-3.5 h-3.5 inline mr-1.5 align-[-2px]" />
          {t('You are using the self-hosted version; all features are available.')}
        </div>
      </Card>
    </StandardPageShell>
  );
}
