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

async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info');
    return true;
  } catch {
    return false;
  }
}

// skipIf 在收集期求值（beforeAll 尚未运行），故需同步探测 docker，否则实验恒被跳过
function isDockerAvailableSync(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
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

export async function getCircuitBreakerState(
  breakerName: string,
  metricsUrl: string = 'http://127.0.0.1:15001/metrics',
): Promise<number> {
  const response = await fetch(metricsUrl);
  const text = await response.text();
  const regex = new RegExp(`circuit_breaker_state\\{[^}]*name="${breakerName}"[^}]*\\}\\s+(\\d+)`);
  const match = text.match(regex);
  return match ? parseInt(match[1], 10) : -1;
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

interface ChaosFixture {
  dockerAvailable: boolean;
  containerRunning: boolean;
  recover: () => Promise<void>;
}

async function setupChaosFixture(
  containerName: string,
  recoverFn: (name: string) => Promise<void> = startContainer,
): Promise<ChaosFixture> {
  const dockerAvailable = await isDockerAvailable();
  let containerRunning = false;
  if (dockerAvailable) {
    containerRunning = await isContainerRunning(containerName);
  }
  return {
    dockerAvailable,
    containerRunning,
    recover: async () => {
      if (dockerAvailable && containerRunning) {
        try {
          await recoverFn(containerName);
        } catch {
          /* recovery may fail, continue */
        }
      }
    },
  };
}

export function setupChaosLifecycle(containerName: string, recoverFn = startContainer) {
  let current: ChaosFixture = {
    dockerAvailable: false,
    containerRunning: false,
    recover: async () => {},
  };
  beforeAll(async () => {
    current = await setupChaosFixture(containerName, recoverFn);
  }, 30000);
  afterAll(async () => {
    await current.recover();
  }, 30000);
  return {
    get dockerAvailable() {
      return isDockerAvailableSync();
    },
    get containerRunning() {
      return current.containerRunning;
    },
  };
}
