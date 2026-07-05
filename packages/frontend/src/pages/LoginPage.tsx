/**
 * @file 登录页
 * @description 用户名 + 密码登录，成功后由 authStore 解析默认活跃组织并跳转首页。
 * @route /login
 */
import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

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
  return (
    <>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>用户名</span>
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
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>密码</span>
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

/** 错误提示横幅 */
function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      style={{
        fontSize: 13,
        color: 'var(--danger, #dc2626)',
        padding: '8px 10px',
        background: 'var(--danger-soft, #fef2f2)',
        borderRadius: 8,
      }}
    >
      {error}
    </div>
  );
}

/** 登录提交按钮 */
function LoginSubmitButton({ loading }: { loading: boolean }) {
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
      {loading ? '登录中…' : '登录'}
    </button>
  );
}

export default function LoginPage() {
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
    <div className="bt-page" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="bt-main-card card" style={{ padding: 28, marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'var(--brand)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogIn className="w-5 h-5" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
            登录
          </h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <LoginFormFields
            username={username}
            password={password}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
          />
          <ErrorBanner error={error} />
          <LoginSubmitButton loading={loading} />
        </form>

        <div
          style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}
        >
          还没有账户？
          <Link to="/signup" style={{ color: 'var(--brand)' }}>
            注册
          </Link>
        </div>
      </div>
    </div>
  );
}
