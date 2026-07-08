/**
 * @file 注册页
 * @description 自助注册：用户名 + 邮箱 + 密码 + 组织名，提交后创建账户与组织，
 *              并提示前往邮箱完成验证。
 * @route /signup
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Loader2, MailCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const fieldLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-body)',
};
const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };

function SignupSuccess({ email }: { email: string }) {
  return (
    <div className="bt-page" style={{ maxWidth: 460, margin: '0 auto' }}>
      <div
        className="bt-main-card card"
        style={{ padding: 28, marginTop: 40, textAlign: 'center' }}
      >
        <MailCheck className="w-10 h-10" style={{ color: 'var(--brand)', margin: '0 auto 12px' }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>
          注册成功
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          我们已向 <strong>{email}</strong> 发送了一封验证邮件，请点击其中的链接完成邮箱验证。
        </p>
        <div style={{ marginTop: 18 }}>
          <Link
            to="/login"
            className="main-action-btn"
            style={{ display: 'inline-flex', height: 40, alignItems: 'center', padding: '0 18px' }}
          >
            前往登录
          </Link>
        </div>
      </div>
    </div>
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
  return (
    <>
      <label style={fieldWrap}>
        <span style={fieldLabel}>用户名</span>
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
        <span style={fieldLabel}>邮箱</span>
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
        <span style={fieldLabel}>密码（至少 8 位）</span>
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
        <span style={fieldLabel}>组织名称</span>
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

/** 注册页头部 */
function SignupHeader() {
  return (
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
        <UserPlus className="w-5 h-5" />
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
        创建账户
      </h1>
    </div>
  );
}

/** 注册提交按钮 */
function SignupSubmitButton({ loading }: { loading: boolean }) {
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
      {loading ? '注册中…' : '注册'}
    </button>
  );
}

/** 错误提示横幅 */
function SignupErrorBanner({ error }: { error: string | null }) {
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

export default function SignupPage() {
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
    <div className="bt-page" style={{ maxWidth: 460, margin: '0 auto' }}>
      <div className="bt-main-card card" style={{ padding: 28, marginTop: 40 }}>
        <SignupHeader />

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
          <SignupErrorBanner error={error} />
          <SignupSubmitButton loading={loading} />
        </form>

        <div
          style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}
        >
          已有账户？
          <Link to="/login" style={{ color: 'var(--brand)' }}>
            登录
          </Link>
        </div>
      </div>
    </div>
  );
}
