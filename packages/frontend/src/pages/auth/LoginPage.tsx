/* eslint-disable react-refresh/only-export-components -- 认证表单 schema 与组件同文件，拆分独立文件则重复 import */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { LogIn, UserPlus, MailCheck } from 'lucide-react';
import { z } from 'zod';
import { useAuthStore } from '@/store/authStore';
import ErrorBanner from '@/components/ErrorBanner';
import { Checkbox } from '@/components/ui/uiComponents';
import AuthPageLayout, { AuthFormField, AuthSubmitButton } from '@/components/auth/formFields';
export const loginSchema = z.object({
  username: z.string().min(1, 'auth.login.usernameRequired'),
  password: z.string().min(1, 'auth.login.passwordRequired'),
});
export type LoginFormData = z.infer<typeof loginSchema>;
export const signupSchema = z.object({
  username: z
    .string()
    .min(3, 'auth.signup.usernameMinLength')
    .max(30, 'auth.signup.usernameMaxLength'),
  email: z.string().email('auth.signup.emailInvalid'),
  password: z.string().min(8, 'auth.signup.passwordMinLength'),
  orgName: z
    .string()
    .min(1, 'auth.signup.orgNameRequired')
    .max(100, 'auth.signup.orgNameMaxLength'),
  termsAccepted: z.boolean().refine((v) => v === true, 'auth.signup.termsError'),
});
export type SignupFormData = z.infer<typeof signupSchema>;
export function firstZodErrorKey<T>(result: ReturnType<z.ZodType<T>['safeParse']>): string | null {
  if (result.success) return null;
  const firstIssue = result.error.issues[0];
  return firstIssue ? (firstIssue.message as string) : null;
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
  const [formError, setFormError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('reason') === 'session_expired';
  const sessionMessage = useMemo(
    () => (sessionExpired ? t('auth.login.sessionExpired') : null),
    [sessionExpired, t],
  );
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = loginSchema.safeParse({ username: username.trim(), password });
    const zodError = firstZodErrorKey(validation);
    if (zodError) {
      setFormError(t(zodError));
      return;
    }
    setFormError(null);
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
          <Link to="/signup" style={{ color: 'hsl(var(--brand))' }}>
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
        <ErrorBanner message={formError || error || sessionMessage} />
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
function TermsCheckbox({
  accepted,
  onChange,
}: {
  accepted: boolean;
  onChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex items-start gap-2">
      <Checkbox
        checked={accepted}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <span className="text-caption text-fg-secondary leading-relaxed">
        {t('auth.signup.termsLabel')}{' '}
        <Link to="/legal/terms" className="text-brand hover:underline">
          {t('footer.company.terms')}
        </Link>{' '}
        {t('auth.signup.termsAnd')}{' '}
        <Link to="/legal/privacy" className="text-brand hover:underline">
          {t('footer.company.privacy')}
        </Link>
      </span>
    </label>
  );
}
function SignupSuccess({ email }: { email: string }) {
  const { t } = useTranslation();
  return (
    <AuthPageLayout
      centered
      maxWidth={460}
      icon={
        <MailCheck
          className="w-10 h-10"
          style={{ color: 'hsl(var(--brand))', margin: '0 auto 12px' }}
        />
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
// eslint-disable-next-line max-lines-per-function -- 合并页面内多区块渲染，内聚保留
export function SignupPage() {
  const { t } = useTranslation();
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      username: username.trim(),
      password,
      email: email.trim(),
      orgName: orgName.trim(),
      termsAccepted,
    };
    const validation = signupSchema.safeParse(payload);
    const zodError = firstZodErrorKey(validation);
    if (zodError) {
      setFormError(t(zodError));
      return;
    }
    setFormError(null);
    const ok = await register(payload);
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
          <Link to="/login" style={{ color: 'hsl(var(--brand))' }}>
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
        <TermsCheckbox accepted={termsAccepted} onChange={setTermsAccepted} />
        <ErrorBanner message={formError || error} />
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
