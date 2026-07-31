import { z } from 'zod';
export const loginSchema = z.object({
  username: z.string().min(1, 'auth.login.usernameRequired'),
  password: z.string().min(1, 'auth.login.passwordRequired')
});
export type LoginFormData = z.infer<typeof loginSchema>;
export const signupSchema = z.object({
  username: z.string().min(3, 'auth.signup.usernameMinLength').max(30, 'auth.signup.usernameMaxLength'),
  email: z.string().email('auth.signup.emailInvalid'),
  password: z.string().min(8, 'auth.signup.passwordMinLength'),
  orgName: z.string().min(1, 'auth.signup.orgNameRequired').max(100, 'auth.signup.orgNameMaxLength'),
  termsAccepted: z.boolean().refine((v) => v === true, 'auth.signup.termsError')
});
export type SignupFormData = z.infer<typeof signupSchema>;
export function firstZodErrorKey<T>(result: ReturnType<z.ZodType<T>['safeParse']>): string | null {
  if (result.success) return null;
  const firstIssue = result.error.issues[0];
  return firstIssue ? (firstIssue.message as string) : null;
}
