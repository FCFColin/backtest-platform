import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const fe = (p: string) => path.resolve(root, 'packages/frontend/node_modules', p);
const sharedDir = path.resolve(root, 'packages/shared/types');
export const sharedAliases: Record<string, string> = {
  '@backtest/shared/types/tactical': `${sharedDir}/tactical.ts`,
  '@backtest/shared/types/signal': `${sharedDir}/signal.ts`,
  '@backtest/shared/types/index': `${sharedDir}/index.ts`,
  '@backtest/shared/types': `${sharedDir}/index.ts`,
  '@backtest/shared/constants': path.resolve(root, 'packages/shared/constants.ts'),
  '@backtest/shared': `${sharedDir}/index.ts`,
};
export const FE_PKGS = [
  'react',
  'react-dom',
  'react-router',
  'echarts',
  'lucide-react',
  'i18next',
  'react-i18next',
];
export const frontendAlias: Record<string, string> = {
  '@': path.resolve(root, 'packages/frontend/src'),
  'react/jsx-dev-runtime': fe('react/jsx-dev-runtime.js'),
  'react/jsx-runtime': fe('react/jsx-runtime.js'),
  'react-dom/client': fe('react-dom/client.js'),
  ...Object.fromEntries(FE_PKGS.map((p) => [p, fe(p)])),
};
