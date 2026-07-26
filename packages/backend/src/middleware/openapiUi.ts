/**
 * Swagger UI 中间件（P1-05）。
 *
 * 仅在非生产环境挂载 GET /api/docs，提供交互式 API 文档。
 * 生产环境不挂载，避免暴露内部 API 结构。
 */
import type { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from '../schemas/openapi-registry.js';

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
