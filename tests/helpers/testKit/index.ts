/** TestKit：测试能力统一入口（主线 A-1）。所有新测试从此取能力，不再散落样板。 */
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

// 既有能力统一出口
export {
  startExpressApp,
  reqJson,
  postJson,
  useTestServer,
  type TestServer,
  type TestRequest,
} from '../expressApp.js';
export { withServer } from '../serverLifecycle.js';
export {
  signTestToken,
  validPayload,
  decodePayload,
  validPasswordLoginPayload,
  mockUserRecord,
} from '../authFixtures.js';
export { expectError } from '../routeAssertions.js';
