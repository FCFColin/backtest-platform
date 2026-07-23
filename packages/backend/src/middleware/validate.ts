import { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { sendProblem } from '../utils/errors.js';

function createValidator(source: 'body' | 'query', statusCode: number) {
  return (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === 'body' ? req.body : req.query);
    if (!result.success) {
      sendProblem(res, statusCode, 'VALIDATION_ERROR');
      return;
    }
    if (source === 'body') req.body = result.data;
    next();
  };
}

export const validate = createValidator('body', 400);
export const validateQuery = createValidator('query', 422);
