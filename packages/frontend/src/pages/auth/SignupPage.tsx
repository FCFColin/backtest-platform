/**
 * @file 注册页
 * @description 自助注册：用户名 + 邮箱 + 密码 + 组织名，提交后创建账户与组织，
 *              并提示前往邮箱完成验证。
 * @route /signup
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { UserPlus, Loader2, MailCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import ErrorBanner from '@/components/ErrorBanner';
import AuthPageLayout from '@/components/auth/AuthPageLayout';

const fieldLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-body)',
};
const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };

function SignupSuccess({ email }: { email: string }) {
  const { t } = useTranslation();
  return (
    <AuthPageLayout
      centered
      maxWidth={460}
      icon={
        <MailCheck className="w-10 h-10" style={{ color: 'var(--brand)', margin: '0 auto 12px' }} />
      }
      title={t('auth.signup.successTitle')}
    >
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {t('auth.signup.verificationEmailPrefix')} <strong>{email}</strong>{' '}
        {t('auth.signup.verificationEmailSuffix')}
      </p>
      <div style={{ marginTop: 18 }}>
        <Link
          to="/login"
          className="main-action-btn"
          style={{ display: 'inline-flex', height: 40, alignItems: 'center', padding: '0 18px' }}
        >
          {t('auth.signup.goToLogin')}
        </Link>
      </div>
    </AuthPageLayout>
  );
}

/** 注册表单字段 */
function SignupFormFields({
  username,
  email,
  password,
  orgName,
  setUsername,
  setEmail,
  setPassword,
  setOrgName,
}: {
  username: string;
  email: string;
  password: string;
  orgName: string;
  setUsername: (v: string) => void;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  setOrgName: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <label style={fieldWrap}>
        <span style={fieldLabel}>{t('auth.login.username')}</span>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          className="portfolio-rebalance-select"
          style={{ width: '100%', height: 40 }}
        />
      </label>
      <label style={fieldWrap}>
        <span style={fieldLabel}>{t('auth.signup.email')}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="portfolio-rebalance-select"
          style={{ width: '100%', height: 40 }}
        />
      </label>
      <label style={fieldWrap}>
        <span style={fieldLabel}>{t('auth.signup.passwordHint')}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className="portfolio-rebalance-select"
          style={{ width: '100%', height: 40 }}
        />
      </label>
      <label style={fieldWrap}>
        <span style={fieldLabel}>{t('auth.signup.orgName')}</span>
        <input
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          required
          className="portfolio-rebalance-select"
          style={{ width: '100%', height: 40 }}
        />
      </label>
    </>
  );
}

/** 注册提交按钮 */
function SignupSubmitButton({ loading }: { loading: boolean }) {
  const { t } = useTranslation();
  return (
    <button
      type="submit"
      disabled={loading}
      className="main-action-btn"
      style={{
        height: 42,
        marginTop: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
      {loading ? t('auth.signup.submitting') : t('auth.signup.submit')}
    </button>
  );
}

export default function SignupPage() {
  const { t } = useTranslation();
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await register({
      username: username.trim(),
      password,
      email: email.trim(),
      orgName: orgName.trim(),
    });
    if (ok) setDone(true);
  };

  if (done) {
    return <SignupSuccess email={email} />;
  }

  return (
    <AuthPageLayout
      icon={<UserPlus className="w-5 h-5" />}
      title={t('auth.signup.createAccount')}
      maxWidth={460}
      footer={
        <>
          {t('auth.signup.hasAccountPrefix')}
          <Link to="/login" style={{ color: 'var(--brand)' }}>
            {t('auth.login.submit')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SignupFormFields
          username={username}
          email={email}
          password={password}
          orgName={orgName}
          setUsername={setUsername}
          setEmail={setEmail}
          setPassword={setPassword}
          setOrgName={setOrgName}
        />
        <ErrorBanner message={error} />
        <SignupSubmitButton loading={loading} />
      </form>
    </AuthPageLayout>
  );
}
