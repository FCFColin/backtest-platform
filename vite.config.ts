import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const frontendRequire = createRequire(path.resolve(projectRoot, 'packages/frontend/package.json'));
const tailwindcss = frontendRequire('tailwindcss');
const autoprefixer = frontendRequire('autoprefixer');
const tailwindConfigPath = path.resolve(projectRoot, 'tailwind.config.cjs');

const sharedTypesDir = path.resolve(projectRoot, 'packages/shared/types');
const sharedTypeAliases: Record<string, string> = {
  '@backtest/shared/types/tactical': `${sharedTypesDir}/tactical.ts`,
  '@backtest/shared/types/signal': `${sharedTypesDir}/signal.ts`,
  '@backtest/shared/types/index': `${sharedTypesDir}/index.ts`,
  '@backtest/shared/types': `${sharedTypesDir}/index.ts`,
  '@backtest/shared/constants': path.resolve(projectRoot, 'packages/shared/constants.ts'),
  '@backtest/shared': `${sharedTypesDir}/index.ts`,
};

const feNm = (p: string) => path.resolve(projectRoot, 'packages/frontend/node_modules', p);
const FE_PACKAGES = [
  'react',
  'react-dom',
  'react-router',
  'echarts',
  'lucide-react',
  'i18next',
  'react-i18next',
];
const frontendAlias: Record<string, string> = {
  '@': path.resolve(projectRoot, 'packages/frontend/src'),
  'react/jsx-dev-runtime': feNm('react/jsx-dev-runtime.js'),
  'react/jsx-runtime': feNm('react/jsx-runtime.js'),
  'react-dom/client': feNm('react-dom/client.js'),
  ...Object.fromEntries(FE_PACKAGES.map((p) => [p, feNm(p)])),
};

function zustandEsmResolver(): Plugin {
  const esm = feNm('zustand/esm');
  const map: Record<string, string> = {
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
      return map[source] && path.join(esm, map[source]);
    },
  };
}

function ssrLocalesCopy(): Plugin {
  let outDir = '';
  return {
    name: 'ssr-locales-copy',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      if (!outDir.endsWith('dist-ssr')) return;
      fs.cpSync(
        path.resolve(projectRoot, 'packages/frontend/src/i18n/locales'),
        path.resolve(projectRoot, outDir, 'locales'),
        { recursive: true },
      );
    },
  };
}

export default defineConfig(async () => {
  const { federation } = await import('@originjs/vite-plugin-federation').catch(() => ({
    federation: null,
  }));

  return {
    root: projectRoot,
    resolve: {
      preserveSymlinks: false,
      alias: frontendAlias,
      dedupe: ['react', 'react-dom', 'react-router', 'echarts', 'zustand'],
    },
    test: {
      projects: [
        {
          test: {
            name: 'node',
            globals: true,
            include: [
              'tests/unit/{application,config,db,domain,federation,infrastructure,middleware,queues,repositories,routes,schemas,services,lib,styles}/**/*.test.ts',
              'tests/unit/utils/**/*.test.ts',
              'tests/integration/**/*.test.ts',
              'tests/contract/**/*.test.ts',
              'tests/property/**/*.{test,pbt}.ts',
            ],
            exclude: [
              'tests/chaos/**',
              'tests/**/*.bench.ts',
              'tests/unit/utils/{admin-stats,api-client,auth-tokens,chart-data-merge,color-scale,config-api,format,portfolio-storage,stats,url-state}.test.ts',
            ],
            testTimeout: 30000,
            hookTimeout: 60000,
            deps: {
              moduleDirectories: [
                'node_modules',
                'packages/backend/node_modules',
                'packages/frontend/node_modules',
              ],
            },
          },
          resolve: {
            alias: {
              ...sharedTypeAliases,
              '@': path.resolve(projectRoot, './packages/frontend/src'),
              ...Object.fromEntries(
                [
                  'express',
                  'opossum',
                  'pg',
                  'jose',
                  'argon2',
                  'bullmq',
                  'zod',
                  'stripe',
                  'ioredis',
                  'express-rate-limit',
                  'rate-limit-redis',
                ].map((p) => [p, path.resolve(projectRoot, 'packages/backend/node_modules', p)]),
              ),
            },
          },
        },
        // browser
        {
          plugins: [react()],
          test: {
            name: 'browser',
            globals: true,
            environment: 'jsdom',
            setupFiles: ['tests/setup-browser.ts'],
            include: [
              'tests/unit/store/**/*.test.{ts,tsx}',
              'tests/unit/hooks/**/*.test.{ts,tsx}',
              'tests/unit/components/**/*.test.{ts,tsx}',
              'tests/unit/pages/**/*.test.{ts,tsx}',
              'tests/unit/utils/{admin-stats,api-client,auth-tokens,chart-data-merge,color-scale,config-api,format,portfolio-storage,stats,url-state}.test.ts',
            ],
            deps: { moduleDirectories: ['node_modules', 'packages/frontend/node_modules'] },
          },
          resolve: {
            alias: {
              ...frontendAlias,
              zustand: feNm('zustand'),
              '@testing-library/react': feNm('@testing-library/react'),
              '@': path.resolve(projectRoot, './packages/frontend/src'),
              'react-router': path.resolve(projectRoot, 'tests/mocks/react-router.tsx'),
            },
          },
        },
        {
          test: {
            name: 'chaos',
            globals: true,
            include: ['tests/chaos/**/*.test.ts'],
            testTimeout: 120000,
            hookTimeout: 60000,
            // 实验共享同一 docker 栈全局状态，串行由脚本层 --maxWorkers=1 保证
            //（maxWorkers/minWorkers/fileParallelism 为 NonProjectOptions，项目级配置会被忽略）
          },
          resolve: { alias: { '@': path.resolve(projectRoot, './packages/frontend/src') } },
        },
      ],
      coverage: {
        provider: 'v8',
        reporter: ['html', 'lcov', 'text', 'json-summary'],
        reportsDirectory: 'coverage/vitest',
        all: true,
        include: [
          'packages/backend/src/**/*.{ts,tsx}',
          'packages/frontend/src/store/**/*.{ts,tsx}',
          'packages/frontend/src/hooks/**/*.{ts,tsx}',
          'packages/frontend/src/utils/**/*.{ts,tsx}',
        ],
        exclude: [
          'packages/frontend/src/**/*.d.ts',
          'packages/frontend/src/**/*.test.{ts,tsx}',
          'packages/frontend/src/store/{index,types}.ts',
          'packages/backend/src/{utils/{logger,metrics},db/{import,marketStatsTypes},app,ssrMiddleware,infrastructure/mailService,schemas/{goalOptimizer,letf,pca,tacticalGrid,dataManage},queues/{dataUpdateWorker,workerEntrypoint}}.ts',
        ],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
          'packages/backend/src/domain/**': { lines: 95 },
          'packages/backend/src/middleware/**': { lines: 90 },
          'packages/backend/src/application/**': { lines: 85 },
          'packages/frontend/src/store/**': { lines: 80 },
        },
      },
    },
    plugins: [
      zustandEsmResolver(),
      ssrLocalesCopy(),
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
              shared: ['react', 'react-dom', 'react-router', 'zustand', 'i18next', 'react-i18next'],
            }),
          ]
        : []),
      react(),
      (await import('vite-tsconfig-paths')).default(),
    ],
    css: {
      postcss: {
        plugins: [tailwindcss({ config: tailwindConfigPath }), autoprefixer()],
      },
    },
    optimizeDeps: {
      include: FE_PACKAGES,
      exclude: ['zustand'],
    },
    build: {
      target: 'esnext',
      modulePreload: true,
      cssCodeSplit: false,
      ssrEmitAssets: true,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (process.env.VITE_SSR === 'true') return;
            if (
              id.includes('packages/frontend/src/utils/') ||
              id.includes('packages/frontend/src/hooks/')
            )
              return 'shared-utils';
            const nmIdx = id.lastIndexOf('node_modules');
            if (nmIdx === -1) return;
            const afterNm = id.slice(nmIdx + 13);
            const pkg = afterNm.startsWith('@')
              ? afterNm.split('/').slice(0, 2).join('/')
              : afterNm.split('/')[0];
            if (pkg === 'react-dom') {
              const subPath = afterNm.split('/').slice(1).join('/');
              if (subPath.startsWith('server')) return 'react-dom-server';
              if (subPath.startsWith('client')) return 'react-dom-client';
              return 'react-dom';
            }
            const CHUNKS: Record<string, string[]> = {
              'react-router': ['react-router'],
              'state-vendor': ['zustand'],
              'ui-vendor': [
                '@radix-ui',
                'class-variance-authority',
                'clsx',
                'tailwind-merge',
                'tailwindcss-animate',
              ],
              'icon-vendor': ['lucide-react'],
              'i18n-vendor': ['i18next', 'react-i18next'],
              'util-vendor': ['zod', 'web-vitals'],
            };
            for (const [chunk, pkgs] of Object.entries(CHUNKS))
              if (pkgs.some((p) => pkg.startsWith(p))) return chunk;
          },
        },
      },
    },
    server: {
      host: true,
      port: parseInt(process.env.VITE_PORT || '15173', 10),
      watch: { ignored: ['**/coverage/**', '**/dist/**'] },
      proxy: {
        '/api': {
          target: `http://localhost:${process.env.API_PORT || '15001'}`,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => proxy.on('error', () => {}),
        },
      },
    },
  };
});
