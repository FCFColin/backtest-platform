#!/usr/bin/env node
// dev-stop.mjs — kill supervisor + all bg processes recorded by dev.mjs (cross-platform)
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pidsPath = join(root, '.dev-logs/dev-bg-pids.json');
const lockPath = join(root, '.dev-logs/dev-supervisor.lock');

if (process.platform === 'win32') {
  for (const sub of ['/end', '/delete /f']) {
    try {
      execSync(`schtasks ${sub} /tn "BacktestDevSupervisor"`, { stdio: 'ignore' });
    } catch {
      /* 任务不存在可忽略 */
    }
  }
}

if (existsSync(pidsPath)) {
  const pids = JSON.parse(readFileSync(pidsPath, 'utf8'));
  for (const [name, pid] of Object.entries(pids)) {
    if (!pid) continue;
    try {
      if (process.platform === 'win32') execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      else process.kill(pid, 'SIGTERM');
      console.log(`[dev-stop] killed ${name} (PID ${pid})`);
    } catch {
      console.log(`[dev-stop] ${name} (PID ${pid}) already gone`);
    }
  }
  unlinkSync(pidsPath);
}
for (const p of [lockPath]) if (existsSync(p)) unlinkSync(p);
console.log('[dev-stop] Done');
