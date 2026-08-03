/** OpenAPI 3.0 注册中心（P1-05）。生成: scripts/generate-openapi.ts -> docs/openapi.yaml; Swagger UI: GET /api/docs（仅开发环境）。 */
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './openapi-components.js';
import { registerAuthPaths } from './openapi-paths-auth.js';
import { registerAdminPaths } from './openapi-paths-admin.js';
import { registerBacktestPaths } from './openapi-paths-backtest.js';
import { registerDataPaths } from './openapi-paths-data.js';

registerAuthPaths();
registerBacktestPaths();
registerDataPaths();
registerAdminPaths();

const TAGS = [
  'auth',
  'backtest',
  'backtest-optimizer',
  'data',
  'data-manage',
  'admin',
  'saas-keys',
  'saas-portfolios',
  'saas-configs',
  'saas-runs',
  'saas-orgs',
  'saas-billing',
  'saas-jobs',
  'tactical',
  'tactical-grid',
  'signal',
  'pca',
  'letf',
  'goal-optimizer',
  'calculators',
  'factor-regression',
  'health',
  'webhooks',
  'announcements',
  'tactical-config',
  'data-custom',
  'audit-logs',
  'rbac',
  'errors',
  'feature-flags',
];

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: '回测平台 API',
      version: '1.0.0',
      description:
        '回测平台提供组合回测、资产分析、蒙特卡洛模拟、组合优化、有效前沿、战术分配、信号分析、PCA、LETF、目标优化等量化投资工具。\n\n## 认证\n- 计算端点必须携带 JWT Bearer Token（Authorization: Bearer <accessToken>）\n- 管理端点需 JWT + RBAC 权限\n- 兼容模式：x-api-key 请求头（过渡用，不推荐生产长期依赖）\n- 认证流程：POST /auth/login/password -> accessToken + refreshToken\n- 健康检查 /health 与 /metrics 无需用户 JWT\n\n## 速率限制\n- 普通 API：100 次/15 分钟/IP\n- 计算密集型 API（backtest、backtest-optimizer）：10 次/分钟/IP\n\n## 错误格式\n- 所有错误使用 RFC 7807 Problem Details：{ success: false, error: { type, title, status, code, detail } }\n- 数据服务降级响应包含 degraded: true + degradedWarning（仅数据端点；引擎端点 fail-closed 返回 503 + Retry-After，见 ADR-031）',
    },
    servers: [{ url: 'http://localhost:15001/api/v1', description: '本地开发环境' }],
    tags: TAGS.map((name) => ({ name })),
    security: [{ BearerAuth: [] }],
  });
}
