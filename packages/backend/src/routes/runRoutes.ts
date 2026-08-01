/**
 * 回测运行历史（backtest_runs）路由（ADR-034）
 *
 * 挂载于 /api/v1/runs，前置链：jwtAuth → resolveTenant → requireTenant
 * → requirePermission(BACKTEST_RUN)。所有操作经 backtestRunRepo（withTenant）隔离。
 *
 * 仅提供 list/get/create/delete：运行记录是不可变的历史快照，无更新语义。
 */
import { tenantCrudRoutes } from './routeUtils.js';
import { backtestRunBodySchema } from '../schemas/backtest.js';
import { listRuns, getRun, createRun, deleteRun } from '../repositories/backtestRunRepo.js';

export default tenantCrudRoutes(
  {
    list: listRuns,
    get: getRun,
    create: createRun,
    remove: deleteRun,
  },
  {
    resource: 'runs',
    codePrefix: 'RUN',
    notFoundCode: 'RUN_NOT_FOUND',
    createSchema: backtestRunBodySchema,
  },
);
