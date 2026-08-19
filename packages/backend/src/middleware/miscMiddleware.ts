import type { Request, Response, NextFunction, Application } from 'express';
import type { ZodSchema } from 'zod';
import swaggerUi from 'swagger-ui-express';
import { sendProblem } from '../utils/errors.js';
import { generateOpenApiDocument } from '../schemas/openapi-paths.js';
import { config } from '../config/index.js';

function createValidator(source: 'body' | 'query', statusCode: number) {
  return (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === 'body' ? req.body : req.query);
    if (!result.success) {
      const detail = result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      sendProblem(res, statusCode, 'VALIDATION_ERROR', undefined, { detail });
      return;
    }
    if (source === 'body') req.body = result.data;
    next();
  };
}

export const validate = createValidator('body', 400);
export const validateQuery = createValidator('query', 422);

export function setupOpenApiUi(app: Application): void {
  if (config.NODE_ENV === 'production') return;
  const document = generateOpenApiDocument();
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: '回测平台 API 文档',
    }),
  );
}
