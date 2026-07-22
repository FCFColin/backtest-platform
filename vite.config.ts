import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import istanbul from 'vite-plugin-istanbul';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** E2E 覆盖率脚本会设 VITE_COVERAGE=true */
const enableCoverage = process.env.VITE_COVERAGE === 'true';

const frontendNodeModules = path.resolve(projectRoot, 'packages/frontend/node_modules');

/**
 * pnpm 严格隔离：前端依赖仅安装在 packages/frontend/node_modules，
 * vite 从 monorepo 根运行时 rollup 无法向上查找到这些包。
 * 通过显式 alias 将裸导入映射到实际路径。
 * 子路径导出（react/jsx-*）须置于裸包名之前，确保精确匹配优先。
 */
const frontendAlias: Record<string, string> = {
  'react/jsx-dev-runtime': path.resolve(frontendNodeModules, 'react/jsx-dev-runtime.js'),
  'react/jsx-runtime': path.resolve(frontendNodeModules, 'react/jsx-runtime.js'),
  'react-dom/client': path.resolve(frontendNodeModules, 'react-dom/client.js'),
  react: path.resolve(frontendNodeModules, 'react'),
  'react-dom': path.resolve(frontendNodeModules, 'react-dom'),
  'react-router-dom': path.resolve(frontendNodeModules, 'react-router-dom'),
  recharts: path.resolve(frontendNodeModules, 'recharts'),
  'lucide-react': path.resolve(frontendNodeModules, 'lucide-react'),
  i18next: path.resolve(frontendNodeModules, 'i18next'),
  'react-i18next': path.resolve(frontendNodeModules, 'react-i18next'),
  'i18next-browser-languagedetector': path.resolve(
    frontendNodeModules,
    'i18next-browser-languagedetector',
  ),
};

/**
 * esbuild 预编译 zustand v5 时，无法正确处理 ESM 子路径导出
 * （zustand/vanilla、zustand/react），导致生成的预编译模块缺失 export 语句。
 * resolve.alias 对 node_modules 内部导入不生效，因此使用 Vite 插件的
 * resolveId hook 拦截 zustand 全部裸导入，直接指向 ESM 入口。
 */
function zustandEsmResolver(): Plugin {
  const zustandEsm = path.resolve(frontendNodeModules, 'zustand/esm');
  const zustandMap: Record<string, string> = {
    zustand: 'index.mjs',
    'zustand/vanilla': 'vanilla.mjs',
    'zustand/vanilla/shallow': 'vanilla/shallow.mjs',
    'zustand/react': 'react.mjs',
    'zustand/react/shallow': 'react/shallow.mjs',
    'zustand/shallow': 'shallow.mjs',
    'zustand/middleware': 'middleware.mjs',
  };
  return {
    name: 'zustand-esm-resolver',
    enforce: 'pre',
    resolveId(source) {
      const target = zustandMap[source];
      if (target) return path.join(zustandEsm, target);
      return null;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  root: projectRoot,
  resolve: {
    preserveSymlinks: false,
    alias: frontendAlias,
    dedupe: ['react', 'react-dom', 'react-router-dom', 'recharts', 'zustand'],
  },
  plugins: [
    zustandEsmResolver(),
    react(),
    tsconfigPaths(),
    ...(enableCoverage && command === 'serve'
      ? [
          istanbul({
            include: ['packages/frontend/src/**'],
            exclude: ['node_modules', 'tests/**', 'packages/frontend/src/i18n/**'],
            extension: ['.ts', '.tsx'],
            cypress: false,
            requireEnv: true,
            forceBuildInstrument: false,
          }),
        ]
      : []),
  ],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-dev-runtime',
      'react-router-dom',
      'recharts',
      'lucide-react',
      'i18next',
      'react-i18next',
      'i18next-browser-languagedetector',
    ],
    exclude: ['zustand'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['recharts'],
          'state-vendor': ['zustand'],
        },
      },
    },
  },
  server: {
    host: true,
    port: parseInt(process.env.VITE_PORT || '5176', 10),
    watch: {
      ignored: ['**/coverage/**', '**/dist/**'],
    },
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || '5001'}`,
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
}));
