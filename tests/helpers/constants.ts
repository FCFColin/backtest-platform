/**
 * 测试常量：服务端口与基础 URL
 *
 * 企业理由：多个测试文件硬编码端口号（5001 等），
 * 端口变更时需逐文件修改，易遗漏。本模块集中维护端口常量，
 * 并提供拼接好的基础 URL，减少拼写错误。
 */

/** API 服务端口 */
const API_PORT = 5001;

/** API 服务基础 URL */
export const API_BASE_URL = `http://localhost:${API_PORT}`;
