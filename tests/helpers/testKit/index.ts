/** TestKit：A-1 新增测试能力统一入口。既有 helper 仍从各自模块导入，避免重复出口面。 */
export { mkApp, DEFAULT_KIT_USER, type MkAppOptions, type KitUser } from './app.js';
export { mkAuthedReq, type AuthedReqOptions } from './request.js';
export {
  expectProblem,
  expectDegraded,
  expectOutboxWritten,
  type ApiResult,
} from './assertions.js';
export { mkPortfolio, mkEngineReq, type EngineReqOverrides } from './factories.js';
export { runRouteCases, runAuthMatrix, type RouteCase, type AuthMatrixCase } from './dsl.js';
