import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Docker 容器名（与 docker-compose.yml 中 container_name 一致）
 *
 * 企业理由：原脚本使用 `backtest-postgres-1`（docker-compose v1 自动后缀），
 * 实际 docker-compose.yml 显式指定 container_name: backtest-postgres，
 * 导致网络断开操作失败。此处集中维护容器名，避免硬编码散落各处。
 */
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

async function isContainerRunning(containerName: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerName}`);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * 企业理由：熔断器状态是可用性关键信号，chaos 测试需断言熔断器
 * 在故障期间进入 Open 状态（快速失败），恢复后回到 Closed。
 */
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

/**
 * 企业理由：原脚本使用 PowerShell Get-Process 查找 Node.js PID，
 * 仅 Windows 可用且可能误杀其他 Node 进程。docker kill --signal
 * 通过 Docker daemon 发送信号，跨平台且精准定位容器内主进程。
 */
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

export interface ChaosFixture {
  dockerAvailable: boolean;
  containerRunning: boolean;
  recover: () => Promise<void>;
}

export async function setupChaosFixture(
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
