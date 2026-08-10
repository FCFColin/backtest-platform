import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const isWin = process.platform === 'win32';
export const npxCmd = isWin ? 'npx.cmd' : 'npx';
export const nodeCmd = isWin ? 'node.exe' : 'node';

/**
 * 在 pnpm node_modules/.pnpm 下找 tsx loader 路径
 * @returns {string|undefined}
 */
function findTsxLoader() {
  const pnpmDir = path.join(PROJECT_ROOT, 'node_modules', '.pnpm');
  if (!existsSync(pnpmDir)) return undefined;
  const entries = readdirSync(pnpmDir);
  const tsxDir = entries.find((d) => d.startsWith('tsx@'));
  if (!tsxDir) return undefined;
  const loader = path.join(pnpmDir, tsxDir, 'node_modules', 'tsx', 'dist', 'loader.mjs');
  return existsSync(loader) ? loader : undefined;
}

const tsxLoaderPath = findTsxLoader();
export const tsxLoaderUrl = tsxLoaderPath ? pathToFileURL(tsxLoaderPath).href : null;
