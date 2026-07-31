import { vi } from 'vitest';

// vi.hoisted 结果不能直接 export（Vitest 转换会抛 SyntaxError: Cannot export
// hoisted variable）。统一创建到 internalMocks 容器，通过属性引用对外导出。
const internalMocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
}));

/**
 * 共享 logger mock 容器（mockFactories.createLoggerMocks 的同构 hoisted 版本）。
 *
 * 多个测试文件重复声明同一段 vi.hoisted logger 样板，统一收敛到此 fixture。
 * 测试文件仍需自行注册 `vi.mock('.../utils/logger.js')`（部分文件附带
 * sanitizeLog 等额外导出），但可直接引用本容器进行断言。
 */
export const loggerMocks = internalMocks.logger;
