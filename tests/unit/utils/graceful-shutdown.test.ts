import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createShutdownOnce } from '../../../packages/backend/src/utils/gracefulShutdown.js';

let exitMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  exitMock = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterEach(() => {
  vi.useRealTimers();
  exitMock.mockRestore();
});

describe('createShutdownOnce', () => {
  it('收到信号后执行 onShutdown 并以传入 exitCode 退出', async () => {
    const onShutdown = vi.fn().mockResolvedValue(undefined);
    createShutdownOnce({ onShutdown })('SIGTERM', 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(onShutdown).toHaveBeenCalledWith('SIGTERM');
    expect(exitMock).toHaveBeenCalledWith(0);
  });

  it('重复信号被忽略（onShutdown 只执行一次）', async () => {
    const onShutdown = vi.fn().mockResolvedValue(undefined);
    const shutdown = createShutdownOnce({ onShutdown });
    shutdown('SIGINT');
    shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    expect(onShutdown).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledTimes(1);
  });

  it('onShutdown 失败时退出码为 1', async () => {
    const onShutdown = vi.fn().mockRejectedValue(new Error('boom'));
    createShutdownOnce({ onShutdown })('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('超时后强制退出（退出码 1）', async () => {
    const onShutdown = vi.fn().mockReturnValue(new Promise(() => {}));
    createShutdownOnce({ onShutdown, timeoutMs: 5000 })('SIGTERM');
    await vi.advanceTimersByTimeAsync(5000);
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});
