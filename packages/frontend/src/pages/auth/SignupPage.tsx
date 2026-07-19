/**
 * @file 注册页
 * @description 自助注册：用户名 + 邮箱 + 密码 + 组织名，提交后创建账户与组织，
 *              并提示前往邮箱完成验证。
 * @route /signup
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { UserPlus, MailCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import ErrorBanner from '@/components/ErrorBanner';
import AuthPageLayout from '@/components/auth/AuthPageLayout';
import AuthFormField from '@/components/auth/AuthFormField';
import AuthSubmitButton from '@/components/auth/AuthSubmitButton';

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
        <AuthFormField
          label={t('auth.login.username')}
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <AuthFormField
          label={t('auth.signup.email')}
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
        />
        <AuthFormField
          label={t('auth.signup.passwordHint')}
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="new-password"
          minLength={8}
        />
        <AuthFormField label={t('auth.signup.orgName')} value={orgName} onChange={setOrgName} />
        <ErrorBanner message={error} />
        <AuthSubmitButton
          loading={loading}
          icon={<UserPlus className="w-4 h-4" />}
          label={t('auth.signup.submit')}
          loadingLabel={t('auth.signup.submitting')}
        />
      </form>
    </AuthPageLayout>
  );
}
