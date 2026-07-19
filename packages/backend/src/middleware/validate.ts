import { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodIssue } from 'zod';
import { sendProblem } from '../utils/errors.js';

function formatZodIssues(issues: ZodIssue[]): string {
  return issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

function createValidator(source: 'body' | 'query', statusCode: number) {
  const label = source === 'body' ? 'Request' : 'Query';
  return (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === 'body' ? req.body : req.query);
    if (!result.success) {
      sendProblem(
        res,
        statusCode,
        'VALIDATION_ERROR',
        statusCode === 422 ? 'Unprocessable Entity' : 'Bad Request',
        {
          detail: `${label} validation failed: ${formatZodIssues(result.error.issues)}`,
        },
      );
      return;
    }
    if (source === 'body') req.body = result.data;
    next();
  };
}

export const validate = createValidator('body', 400);
export const validateQuery = createValidator('query', 422);
