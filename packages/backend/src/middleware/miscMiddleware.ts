import type { Request, Response, NextFunction, Application } from 'express';
import type { ZodSchema } from 'zod';
import swaggerUi from 'swagger-ui-express';
import { sendProblem } from '../utils/errors.js';
import { generateOpenApiDocument } from '../schemas/openapi-registry.js';

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

export interface DeprecationConfig {
  deprecated: string;
  sunset?: string;
  successor?: string;
}

export function createDeprecationMiddleware(config: DeprecationConfig) {
  const { deprecated, sunset, successor } = config;
  return function deprecationHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Deprecation', deprecated);
    if (sunset) {
      res.setHeader('Sunset', sunset);
    }
    if (successor) {
      res.setHeader('Link', `<${successor}>; rel="successor-version"`);
    }
    next();
  };
}

export function setupOpenApiUi(app: Application): void {
  if (process.env.NODE_ENV === 'production') return;
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
