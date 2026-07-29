/**
 * @file 认证表单 Zod 校验 schema（H-004）
 * @description 为 Login/Signup 表单提供运行时校验，在提交前拦截非法输入。
 *   使用 zod v4 定义 schema 并推断类型，配合表单 handleSubmit 做 safeParse 校验。
 */
import { z } from 'zod';

/**
 * 登录表单校验 schema。
 * - username: 非空
 * - password: 非空
 */
export const loginSchema = z.object({
  username: z.string().min(1, 'auth.login.usernameRequired'),
  password: z.string().min(1, 'auth.login.passwordRequired'),
});

/** 登录表单推断类型 */
export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * 注册表单校验 schema。
 * - username: 3-30 字符
 * - email: 合法邮箱格式
 * - password: 至少 8 位
 * - orgName: 1-100 字符
 */
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
});

/** 注册表单推断类型 */
export type SignupFormData = z.infer<typeof signupSchema>;

/**
 * 将 Zod 校验错误转为首个 i18n key（供 ErrorBanner 展示）。
 *
 * @param result - Zod safeParse 返回的 result 对象
 * @returns 首个错误字段的 i18n key，无错误时返回 null
 */
export function firstZodErrorKey<T>(
  result: ReturnType<z.ZodType<T>['safeParse']>,
): string | null {
  if (result.success) return null;
  const firstIssue = result.error.issues[0];
  return firstIssue ? (firstIssue.message as string) : null;
}
