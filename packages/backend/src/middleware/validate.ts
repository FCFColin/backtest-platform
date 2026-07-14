import { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodIssue } from 'zod';
import { sendProblem } from '../utils/errors.js';

function formatZodIssues(issues: ZodIssue[]): string {
  return issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

/**
 * 请求体校验中间件
 *
 * 使用 Zod schema 校验 `req.body`，校验失败时统一返回 RFC 7807 格式错误。
 *
 * @param schema - Zod schema
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      sendProblem(res, 400, 'VALIDATION_ERROR', 'Bad Request', {
        detail: `Request validation failed: ${formatZodIssues(result.error.issues)}`,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * 查询参数校验中间件
 *
 * 使用 Zod schema 校验 `req.query`，校验失败时统一返回 RFC 7807 格式错误。
 * 校验通过后，将转换后的数据写回 `req.query`（需类型断言）。
 *
 * @param schema - Zod schema
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      sendProblem(res, 422, 'VALIDATION_ERROR', 'Unprocessable Entity', {
        detail: `Query validation failed: ${formatZodIssues(result.error.issues)}`,
      });
      return;
    }
    next();
  };
}

/** 蒙特卡洛参数白名单，sanitizeMcParams 仅保留这些键 */
const MC_PARAMS_ALLOWED_KEYS = new Set([
  'numSimulations',
  'blockSize',
  'withReplacement',
  'confidenceLevel',
  'distribution',
  'seed',
]);

/**
 * 过滤 mcParams 中的未知键，仅保留白名单字段。
 *
 * @param mcParams - 原始 mcParams 对象
 * @returns 仅含白名单字段的干净对象
 */
export function sanitizeMcParams(mcParams: object | undefined): Record<string, unknown> {
  if (!mcParams || typeof mcParams !== 'object' || Array.isArray(mcParams)) return {};
  const raw = mcParams as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (MC_PARAMS_ALLOWED_KEYS.has(key)) sanitized[key] = raw[key];
  }
  return sanitized;
}
