import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const frontendRequire = createRequire(path.resolve(projectRoot, 'packages/frontend/package.json'));
const tailwindcss = frontendRequire('tailwindcss');
const autoprefixer = frontendRequire('autoprefixer');
const tailwindConfigPath = path.resolve(projectRoot, 'tailwind.config.cjs');

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
export default defineConfig(async ({ command }) => {
  // Module Federation 插件（ADR-050）。
  // 包未 pnpm install 前不可解析——以动态 import + 降级方式加载：
  // 安装后 federation 插件正常启用；未安装时跳过，避免阻塞 vite/vitest 加载本配置。
  let federation: ((opts: unknown) => Plugin) | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- devDependency；安装前后均不报错（ADR-050）
    // @ts-ignore
    ({ federation } = await import('@originjs/vite-plugin-federation'));
  } catch {
    // 包未安装：federation 能力暂不可用，不影响其余构建/测试能力
  }

  return {
    root: projectRoot,
    resolve: {
      preserveSymlinks: false,
      alias: frontendAlias,
      dedupe: ['react', 'react-dom', 'react-router-dom', 'recharts', 'zustand'],
    },
    plugins: [
      zustandEsmResolver(),
      // Module Federation 必须置于 react() 之前（ADR-050）；federation 为 null 时跳过
      ...(federation
        ? [
            federation({
              name: 'backtest_host',
              remotes: {}, // 暂无远端；host 自身可作为 remote provider
              exposes: {
                './OptimizerPage': './packages/frontend/src/pages/optimizer/OptimizerPage.tsx',
                './SignalAnalyzerPage':
                  './packages/frontend/src/pages/signal/SignalAnalyzerPage.tsx',
              },
              shared: [
                'react',
                'react-dom',
                'react-router-dom',
                'zustand',
                'i18next',
                'react-i18next',
              ],
            }),
          ]
        : []),
      react(),
      (await import('vite-tsconfig-paths')).default(),
      ...(enableCoverage && command === 'serve'
        ? [
            (await import('vite-plugin-istanbul')).default({
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
    css: {
      postcss: {
        plugins: [tailwindcss({ config: tailwindConfigPath }), autoprefixer()],
      },
    },
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
      // Module Federation 要求（ADR-050）：esnext + 关闭 modulePreload / cssCodeSplit
      target: 'esnext',
      modulePreload: false,
      cssCodeSplit: false,
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
      port: parseInt(process.env.VITE_PORT || '15173', 10),
      watch: {
        ignored: ['**/coverage/**', '**/dist/**'],
      },
      proxy: {
        '/api': {
          target: `http://localhost:${process.env.API_PORT || '15001'}`,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('error', (_err, _req, _res) => {
              /* Dev proxy errors are expected when backend isn't started yet */
            });
          },
        },
      },
    },
  };
});
