import { exec, execFile, execFileSync } from 'child_process';
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
  (containerName: string, network: string = NETWORK_NAME) => {
    const args = ['docker', 'network', action];
    if (action === 'connect') {
      // compose 以服务名（去掉 backtest- 前缀）注册网络别名；
      // 手动重连不带 --alias 会丢掉该别名，导致其余容器解析不到此服务（docker 已知行为）
      args.push('--alias', containerName.replace(/^backtest-/, ''));
    }
    args.push(network, containerName);
    return execAsync(args.join(' '));
  };
export const disconnectContainer = networkAction('disconnect');
export const reconnectContainer = networkAction('connect');

const execFileAsync = promisify(execFile);

// skipIf 在收集期求值（beforeAll 尚未运行），故需同步探测 docker，否则实验恒被跳过
function isDockerAvailableSync(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 容器运行态同步探测：skipIf 在收集期求值（beforeAll 尚未运行），
// 仅同步探测才能让"无容器栈"的 CI 环境正确跳过而非空跑通过；
// 用 execFileSync 避免 shell 把模板单引号透传给 docker（Windows cmd 下会返回带引号的输出）
function isContainerRunningSync(containerName: string): boolean {
  try {
    const stdout: string = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', containerName],
      { encoding: 'utf8' },
    );
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function isContainerRunning(containerName: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      '-f',
      '{{.State.Running}}',
      containerName,
    ]);
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

export async function waitForContainerState(
  containerName: string,
  running: boolean,
  timeoutMs: number = 30000,
): Promise<boolean> {
  return waitForCondition(
    async () => (await isContainerRunning(containerName)) === running,
    timeoutMs,
    1000,
  );
}

// 混沌实验只测并发/优雅停机行为，不测限流；/api 全局限流 100/15min（rl:api:*），
// 100 并发恰好顶到预算且跨实验累积，故开跑前清空桶（execFile 避免 shell 引号问题）
async function resetRateLimit(): Promise<void> {
  const lua =
    "for _,k in ipairs(redis.call('KEYS','rl:api:*')) do redis.call('DEL',k) end return 1";
  await execFileAsync('docker', ['exec', 'backtest-redis', 'redis-cli', 'EVAL', lua, '0']);
}

export async function waitForCondition(
  predicate: () => Promise<boolean>,
  timeoutMs: number = 30000,
  intervalMs: number = 1000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export const waitForHealthy = (url: string, timeoutMs: number = 30000, intervalMs: number = 1000) =>
  waitForCondition(
    async () => {
      try {
        return (await fetch(url)).ok;
      } catch {
        return false;
      }
    },
    timeoutMs,
    intervalMs,
  );

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
    if (containerReady) {
      // 实验共享 /api 限流预算（100/15min），串行运行时前一个实验会耗尽预算污染后一个
      try {
        await resetRateLimit();
      } catch {
        /* 限流复位失败不阻塞实验 */
      }
    }
  }, 30000);
  afterAll(async () => {
    if (containerReady) {
      try {
        await recoverFn(containerName);
      } catch {
        /* recovery may fail, continue */
      }
    }
  }, 60000);
  return {
    // 收集期同步门控：docker 可用且容器在跑才执行实验，否则显式 skip
    get containerReady() {
      return isDockerAvailableSync() && isContainerRunningSync(containerName);
    },
  };
}
