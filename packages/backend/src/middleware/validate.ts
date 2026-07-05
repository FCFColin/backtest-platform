import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

// Validation: 通用请求校验中间件
// 企业为何需要：集中处理校验错误，统一返回RFC 7807格式
// 权衡：中间件模式增加一层抽象，但避免每个路由重复校验逻辑

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
      const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({
        success: false,
        error: {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          code: 'VALIDATION_ERROR',
          detail: `Request validation failed: ${errors}`,
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
 * 企业理由：仅校验 body 不足以覆盖完整攻击面，查询参数和路径参数
 * 也是外部输入，必须统一校验。但 Express 类型系统对 query 类型支持有限，
 * 调用方需按实际类型使用转换结果。
 *
 * @param schema - Zod schema
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(422).json({
        success: false,
        error: {
          type: 'https://httpstatuses.com/422',
          title: 'Unprocessable Entity',
          status: 422,
          code: 'VALIDATION_ERROR',
          detail: `Query validation failed: ${errors}`,
        },
      });
      return;
    }
    next();
  };
}
