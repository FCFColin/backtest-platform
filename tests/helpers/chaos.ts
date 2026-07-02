/**
 * Chaos 测试跨平台 Docker 工具集
 *
 * 企业理由：原 chaos 实验脚本使用 PowerShell 和 Linux tc 命令，
 * 无法跨平台运行。本模块封装跨平台 Docker 操作（docker network/kill/inspect），
 * 使 chaos 测试在 Windows/Linux/macOS 上均可运行。
 *
 * 权衡：依赖 Docker CLI（而非 Docker API），但 CLI 是最稳定的跨平台接口。
 */
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

/**
 * Docker 网络名（docker-compose 默认创建的 network）
 */
export const NETWORK_NAME = 'backtest_default';

/**
 * 断开容器与网络的连接（模拟网络分区）
 *
 * @param containerName - 容器名
 * @param network - Docker 网络名，默认 backtest_default
 */
export async function disconnectContainer(
  containerName: string,
  network: string = NETWORK_NAME,
): Promise<void> {
  await execAsync(`docker network disconnect ${network} ${containerName}`);
}

/**
 * 重新连接容器到网络（恢复网络分区）
 *
 * @param containerName - 容器名
 * @param network - Docker 网络名，默认 backtest_default
 */
export async function reconnectContainer(
  containerName: string,
  network: string = NETWORK_NAME,
): Promise<void> {
  await execAsync(`docker network connect ${network} ${containerName}`);
}

/**
 * 检测 Docker 是否可用（docker info 是否成功）
 *
 * @returns Docker 可用返回 true，否则 false
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info');
    return true;
  } catch {
    return false;
  }
}

/**
 * 检测指定容器是否正在运行
 *
 * @param containerName - 容器名
 * @returns 容器运行中返回 true，否则 false
 */
export async function isContainerRunning(containerName: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerName}`);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * 从 /metrics 端点读取熔断器状态
 *
 * 企业理由：熔断器状态是可用性关键信号，chaos 测试需断言熔断器
 * 在故障期间进入 Open 状态（快速失败），恢复后回到 Closed。
 *
 * @param breakerName - 熔断器名称（如 postgres / go_data_service）
 * @param metricsUrl - Prometheus 指标端点 URL
 * @returns 状态码：-1=未找到, 0=closed, 1=open, 2=halfOpen
 */
export async function getCircuitBreakerState(
  breakerName: string,
  metricsUrl: string = 'http://127.0.0.1:5001/metrics',
): Promise<number> {
  const response = await fetch(metricsUrl);
  const text = await response.text();
  const regex = new RegExp(`circuit_breaker_state\\{[^}]*name="${breakerName}"[^}]*\\}\\s+(\\d+)`);
  const match = text.match(regex);
  return match ? parseInt(match[1], 10) : -1; // -1 = not found, 0 = closed, 1 = open, 2 = halfOpen
}

/**
 * 向容器发送信号（跨平台，使用 docker kill --signal）
 *
 * 企业理由：原脚本使用 PowerShell Get-Process 查找 Node.js PID，
 * 仅 Windows 可用且可能误杀其他 Node 进程。docker kill --signal
 * 通过 Docker daemon 发送信号，跨平台且精准定位容器内主进程。
 *
 * @param containerName - 容器名
 * @param signal - 信号名，默认 SIGTERM
 */
export async function sendSignalToContainer(
  containerName: string,
  signal: string = 'SIGTERM',
): Promise<void> {
  // Cross-platform: use docker kill which works everywhere
  await execAsync(`docker kill --signal=${signal} ${containerName}`);
}

/**
 * 停止容器（模拟服务不可达）
 *
 * @param containerName - 容器名
 */
export async function stopContainer(containerName: string): Promise<void> {
  await execAsync(`docker stop ${containerName}`);
}

/**
 * 启动已停止的容器（恢复服务）
 *
 * @param containerName - 容器名
 */
export async function startContainer(containerName: string): Promise<void> {
  await execAsync(`docker start ${containerName}`);
}

/**
 * 等待容器健康（通过 HTTP 探活）
 *
 * @param url - 健康检查 URL
 * @param timeoutMs - 超时毫秒，默认 30s
 * @param intervalMs - 轮询间隔毫秒，默认 1s
 * @returns 健康返回 true，超时返回 false
 */
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
      // 服务未就绪，继续轮询
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
