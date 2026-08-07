import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(root, 'packages/backend');
const env = { ...process.env, DEV_SKIP_AUTH: 'false' };
// 本地默认库在 .env（15442）；playwright webServer 注入的 5432 默认值仅适合 CI，
// 未显式设置时删除，让后端读 .env
if (!process.env.DATABASE_URL) delete env.DATABASE_URL;

const children = new Set();
function start(cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

const backend = start('pnpm', ['exec', 'tsx', 'src/server.ts'], backendDir);
start('pnpm', ['run', 'worker'], backendDir);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);
void backend;
