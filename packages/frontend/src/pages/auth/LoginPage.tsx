/**
 * @file 登录页
 * @description 用户名 + 密码登录，成功后由 authStore 解析默认活跃组织并跳转首页。
 * @route /login
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import ErrorBanner from '@/components/ErrorBanner';
import AuthPageLayout from '@/components/auth/AuthPageLayout';
import AuthFormField from '@/components/auth/AuthFormField';
import AuthSubmitButton from '@/components/auth/AuthSubmitButton';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const loginPassword = useAuthStore((s) => s.loginPassword);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await loginPassword(username.trim(), password);
    if (ok) navigate(redirectTo, { replace: true });
  };

  return (
    <AuthPageLayout
      icon={<LogIn className="w-5 h-5" />}
      title={t('auth.login.submit')}
      footer={
        <>
          {t('auth.login.noAccountPrefix')}
          <Link to="/signup" style={{ color: 'var(--brand)' }}>
            {t('auth.signup.submit')}
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
          label={t('auth.login.password')}
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="current-password"
        />
        <ErrorBanner message={error} />
        <AuthSubmitButton
          loading={loading}
          icon={<LogIn className="w-4 h-4" />}
          label={t('auth.login.submit')}
          loadingLabel={t('auth.login.submitting')}
        />
      </form>
    </AuthPageLayout>
  );
}
