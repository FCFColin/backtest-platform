import { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodIssue } from 'zod';

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
      res.status(400).json({
        success: false,
        error: {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          code: 'VALIDATION_ERROR',
          detail: `Request validation failed: ${formatZodIssues(result.error.issues)}`,
        },
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
      res.status(422).json({
        success: false,
        error: {
          type: 'https://httpstatuses.com/422',
          title: 'Unprocessable Entity',
          status: 422,
          code: 'VALIDATION_ERROR',
          detail: `Query validation failed: ${formatZodIssues(result.error.issues)}`,
        },
      });
      return;
    }
    next();
  };
}
