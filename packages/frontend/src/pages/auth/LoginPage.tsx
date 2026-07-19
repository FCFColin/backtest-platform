/**
 * @file 登录页
 * @description 用户名 + 密码登录，成功后由 authStore 解析默认活跃组织并跳转首页。
 * @route /login
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import ErrorBanner from '@/components/ErrorBanner';
import AuthPageLayout from '@/components/auth/AuthPageLayout';

/** 登录表单字段 */
function LoginFormFields({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
}: {
  username: string;
  password: string;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>
          {t('auth.login.username')}
        </span>
        <input
          type="text"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          autoComplete="username"
          required
          className="portfolio-rebalance-select"
          style={{ width: '100%', height: 40 }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>
          {t('auth.login.password')}
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="current-password"
          required
          className="portfolio-rebalance-select"
          style={{ width: '100%', height: 40 }}
        />
      </label>
    </>
  );
}

/** 登录提交按钮 */
function LoginSubmitButton({ loading }: { loading: boolean }) {
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
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
      {loading ? t('auth.login.submitting') : t('auth.login.submit')}
    </button>
  );
}

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
        <LoginFormFields
          username={username}
          password={password}
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
        />
        <ErrorBanner message={error} />
        <LoginSubmitButton loading={loading} />
      </form>
    </AuthPageLayout>
  );
}
