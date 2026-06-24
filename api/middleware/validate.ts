import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

// Validation: 通用请求体校验中间件
// 企业为何需要：集中处理校验错误，统一返回RFC 7807格式
// 权衡：中间件模式增加一层抽象，但避免每个路由重复校验逻辑

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({
        type: 'https://httpstatuses.com/400',
        title: 'Bad Request',
        status: 400,
        detail: `Request validation failed: ${errors}`,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
