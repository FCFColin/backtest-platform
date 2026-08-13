import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { beforeAll, afterAll } from 'vitest';

const execAsync = promisify(exec);

export const CONTAINERS = {
  postgres: 'backtest-postgres',
  dataFetcher: 'backtest-data-fetcher',
  api: 'backtest-api',
  engineGo: 'backtest-engine-go',
  redis: 'backtest-redis',
} as const;

const NETWORK_NAME = 'backtest_default';

const networkAction =
  (action: 'connect' | 'disconnect') =>
  (containerName: string, network: string = NETWORK_NAME) =>
    execAsync(`docker network ${action} ${network} ${containerName}`);
export const disconnectContainer = networkAction('disconnect');
export const reconnectContainer = networkAction('connect');

// skipIf 在收集期求值（beforeAll 尚未运行），故需同步探测 docker，否则实验恒被跳过
function isDockerAvailableSync(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 容器运行态同步探测：skipIf 在收集期求值（beforeAll 尚未运行），
// 仅同步探测才能让"无容器栈"的 CI 环境正确跳过而非空跑通过
function isContainerRunningSync(containerName: string): boolean {
  try {
    const { stdout } = execSync(`docker inspect -f '{{.State.Running}}' ${containerName}`, {
      stdio: 'ignore',
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function isContainerRunning(containerName: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerName}`);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function sendSignalToContainer(
  containerName: string,
  signal: string = 'SIGTERM',
): Promise<void> {
  await execAsync(`docker kill --signal=${signal} ${containerName}`);
}

export async function startContainer(containerName: string): Promise<void> {
  await execAsync(`docker start ${containerName}`);
}

export async function waitForHealthy(
  url: string,
  timeoutMs: number = 30000,
  intervalMs: number = 1000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* fetch failed, will retry */
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export async function checkServerAvailable(
  url: string,
  timeoutMs: number = 2000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    // 4xx（如 404）视为可用：服务在运行仅路径不存在
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

export async function withContainerStopped<T>(
  container: string,
  fn: () => Promise<T>,
  options?: { settleMs?: number; readyUrl?: string },
): Promise<T> {
  await execAsync(`docker stop ${container}`);
  try {
    if (options?.settleMs) {
      await new Promise((r) => setTimeout(r, options.settleMs));
    }
    return await fn();
  } finally {
    await execAsync(`docker start ${container}`);
    if (options?.readyUrl) {
      await waitForHealthy(options.readyUrl, 30000);
    }
  }
}

export function setupChaosLifecycle(containerName: string, recoverFn = startContainer) {
  let containerReady = false;
  beforeAll(async () => {
    containerReady = await isContainerRunning(containerName);
  }, 30000);
  afterAll(async () => {
    if (containerReady) {
      try {
        await recoverFn(containerName);
      } catch {
        /* recovery may fail, continue */
      }
    }
  }, 30000);
  return {
    // 收集期同步门控：docker 可用且容器在跑才执行实验，否则显式 skip
    get containerReady() {
      return isDockerAvailableSync() && isContainerRunningSync(containerName);
    },
  };
}
