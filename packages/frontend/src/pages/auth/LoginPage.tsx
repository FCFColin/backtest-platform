import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router';
import { LogIn, UserPlus, MailCheck } from 'lucide-react';
import { z } from 'zod';
import { useAuthStore } from '@/store/authStore';
import { ErrorBanner } from '@/components/stateDisplay';
import { Checkbox } from '@/components/ui/uiComponents';
import AuthPageLayout, { AuthFormField, AuthSubmitButton } from '@/components/auth/formFields';
const loginSchema = z.object({
  username: z.string().min(1, 'auth.login.usernameRequired'),
  password: z.string().min(1, 'auth.login.passwordRequired'),
});
const signupSchema = z.object({
  username: z
    .string()
    .min(3, 'auth.signup.usernameMinLength')
    .max(30, 'auth.signup.usernameMaxLength'),
  email: z.string().email('auth.signup.emailInvalid'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  orgName: z
    .string()
    .min(1, 'auth.signup.orgNameRequired')
    .max(100, 'auth.signup.orgNameMaxLength'),
  termsAccepted: z.boolean().refine((v) => v === true, 'auth.signup.termsError'),
});
function firstZodErrorKey<T>(result: ReturnType<z.ZodType<T>['safeParse']>): string | null {
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
  const sessionMessage = sessionExpired
    ? t('Your session has expired due to inactivity. Please log in again.')
    : null;
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
      title={t('Log In')}
      footer={
        <>
          {t('Dont have an account?')}
          <Link to="/signup" className="text-brand">
            {t('Sign Up')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-[14px]">
        <AuthFormField
          label={t('Username')}
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <AuthFormField
          label={t('Password')}
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="current-password"
        />
        <ErrorBanner message={formError || error || sessionMessage} />
        <AuthSubmitButton
          loading={loading}
          icon={<LogIn className="w-4 h-4" />}
          label={t('Log In')}
          loadingLabel={t('Logging in...')}
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
        {t('I have read and agree to the')}{' '}
        <Link to="/legal/terms" className="text-brand hover:underline">
          {t('Terms of Service')}
        </Link>{' '}
        {t('and')}{' '}
        <Link to="/legal/privacy" className="text-brand hover:underline">
          {t('Privacy Policy')}
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
      icon={<MailCheck className="w-10 h-10 text-brand mx-auto mb-3" />}
      title={t('Registration Successful')}
    >
      <p className="text-sm text-fg-tertiary leading-relaxed">
        {t('A verification email has been sent to')} <strong>{email}</strong>{' '}
        {t('Please check your email to verify.')}
      </p>
      <div className="mt-[18px]">
        <Link to="/login" className="main-action-btn inline-flex h-10 items-center px-[18px]">
          {t('Go to Login')}
        </Link>
      </div>
    </AuthPageLayout>
  );
}
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
      title={t('Create Account')}
      maxWidth={460}
      footer={
        <>
          {t('Already have an account?')}
          <Link to="/login" className="text-brand">
            {t('Log In')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-[14px]">
        <AuthFormField
          label={t('Username')}
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <AuthFormField
          label={t('Email')}
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
        />
        <AuthFormField
          label={t('Password must be at least 8 characters')}
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="new-password"
          minLength={8}
        />
        <AuthFormField label={t('Organization Name')} value={orgName} onChange={setOrgName} />
        <TermsCheckbox accepted={termsAccepted} onChange={setTermsAccepted} />
        <ErrorBanner message={formError || error} />
        <AuthSubmitButton
          loading={loading}
          icon={<UserPlus className="w-4 h-4" />}
          label={t('Sign Up')}
          loadingLabel={t('Signing up...')}
        />
      </form>
    </AuthPageLayout>
  );
}
