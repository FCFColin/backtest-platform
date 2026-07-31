/**
 * 命名配置（saved_configs）CRUD 路由（ADR-034）
 *
 * 挂载于 /api/v1/configs，前置链：jwtAuth → resolveTenant → requireTenant
 * → requirePermission(BACKTEST_RUN)。所有操作经 savedConfigRepo（withTenant）隔离。
 */
import { tenantCrudRoutes } from './routeUtils.js';
import { savedConfigBodySchema } from '../schemas/persistence.js';
import {
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
} from '../repositories/savedConfigRepo.js';

export default tenantCrudRoutes(
  {
    list: listConfigs,
    get: getConfig,
    create: createConfig,
    update: updateConfig,
    remove: deleteConfig,
  },
  {
    resource: 'configs',
    codePrefix: 'CONFIG',
    notFoundCode: 'CONFIG_NOT_FOUND',
    createSchema: savedConfigBodySchema,
    updateSchema: savedConfigBodySchema,
  },
);
