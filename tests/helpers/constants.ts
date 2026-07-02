/**
 * 测试常量：服务端口与基础 URL
 *
 * 企业理由：多个测试文件硬编码端口号（5001、5004、5003 等），
 * 端口变更时需逐文件修改，易遗漏。本模块集中维护端口常量，
 * 并提供拼接好的基础 URL，减少拼写错误。
 *
 * 注意：Go 引擎（ENGINE_GO_PORT=5004）为唯一计算引擎（ADR-008）。
 */

/** API 服务端口 */
export const API_PORT = 5001;

/** 数据获取服务端口 */
export const DATA_FETCHER_PORT = 5003;

/** Go 引擎服务端口 */
export const ENGINE_GO_PORT = 5004;

/** API 服务基础 URL */
export const API_BASE_URL = `http://localhost:${API_PORT}`;

/** 数据获取服务基础 URL */
export const DATA_FETCHER_BASE_URL = `http://localhost:${DATA_FETCHER_PORT}`;

/** Go 引擎服务基础 URL（使用 127.0.0.1 与现有测试保持一致） */
export const ENGINE_GO_BASE_URL = `http://127.0.0.1:${ENGINE_GO_PORT}`;
