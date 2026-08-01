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

// SSR 产物需自带 i18n locale 文件：客户端资源已内联打包，但 entry-server 按需
// 从文件系统读取 ./locales/{lang}/{ns}.json（dev 由 vite 解析 src，生产缺此拷贝即 key 未翻译）
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
    test: {
      projects: [
        // ── node：后端单元 + 集成 + contract + fuzz + shared ──
        {
          test: {
            name: 'node',
            globals: true,
            include: [
              'tests/unit/api/**/*.test.ts',
              'tests/unit/application/**/*.test.ts',
              'tests/unit/config/**/*.test.ts',
              'tests/unit/db/**/*.test.ts',
              'tests/unit/domain/**/*.test.ts',
              'tests/unit/federation/**/*.test.ts',
              'tests/unit/infrastructure/**/*.test.ts',
              'tests/unit/middleware/**/*.test.ts',
              'tests/unit/queues/**/*.test.ts',
              'tests/unit/repositories/**/*.test.ts',
              'tests/unit/routes/**/*.test.ts',
              'tests/unit/schemas/**/*.test.ts',
              'tests/unit/services/**/*.test.ts',
              'tests/unit/lib/**/*.test.ts',
              'tests/unit/styles/**/*.test.ts',
              'tests/unit/utils/{crypto,date-utils,engine-body-builder,engine-client,envelope-encryption,errors,http-client,integrity,log-sanitizer,logger,metrics,numeric-range,rate-limiter,rate-limiter-fail-closed,request-context,ssrf-guard,ticker-validation}.test.ts',
              'tests/integration/**/*.test.ts',
              'tests/contract/**/*.test.ts',
              'tests/fuzz/**/*.test.ts',
              'tests/property/**/*.pbt.ts',
              'tests/property/**/*.test.ts',
              'packages/shared/**/*.test.ts',
            ],
            exclude: ['tests/chaos/**', 'tests/**/*.bench.ts'],
            testTimeout: 30000,
            hookTimeout: 60000,
            deps: {
              moduleDirectories: ['node_modules', 'packages/backend/node_modules'],
            },
          },
          resolve: {
            alias: {
              '@backtest/shared/types/tactical': path.resolve(
                projectRoot,
                'packages/shared/types/tactical.ts',
              ),
              '@backtest/shared/types/signal': path.resolve(
                projectRoot,
                'packages/shared/types/signal.ts',
              ),
              '@backtest/shared/types/letf': path.resolve(
                projectRoot,
                'packages/shared/types/letf.ts',
              ),
              '@backtest/shared/types/index': path.resolve(
                projectRoot,
                'packages/shared/types/index.ts',
              ),
              '@backtest/shared/types': path.resolve(projectRoot, 'packages/shared/types/index.ts'),
              '@backtest/shared/constants': path.resolve(
                projectRoot,
                'packages/shared/constants.ts',
              ),
              '@backtest/shared': path.resolve(projectRoot, 'packages/shared/types/index.ts'),
              express: path.resolve(projectRoot, 'packages/backend/node_modules/express'),
              opossum: path.resolve(projectRoot, 'packages/backend/node_modules/opossum'),
              pg: path.resolve(projectRoot, 'packages/backend/node_modules/pg'),
              jose: path.resolve(projectRoot, 'packages/backend/node_modules/jose'),
              argon2: path.resolve(projectRoot, 'packages/backend/node_modules/argon2'),
              bullmq: path.resolve(projectRoot, 'packages/backend/node_modules/bullmq'),
              zod: path.resolve(projectRoot, 'packages/backend/node_modules/zod'),
              stripe: path.resolve(projectRoot, 'packages/backend/node_modules/stripe'),
              ioredis: path.resolve(projectRoot, 'packages/backend/node_modules/ioredis'),
              'express-rate-limit': path.resolve(
                projectRoot,
                'packages/backend/node_modules/express-rate-limit',
              ),
              'rate-limit-redis': path.resolve(
                projectRoot,
                'packages/backend/node_modules/rate-limit-redis',
              ),
            },
          },
        },
        // ── browser：前端单元 + 组件 + hooks + store ──
        {
          plugins: [react()],
          test: {
            name: 'browser',
            globals: true,
            include: [
              'tests/unit/store/**/*.test.{ts,tsx}',
              'tests/unit/hooks/**/*.test.{ts,tsx}',
              'tests/unit/components/**/*.test.{ts,tsx}',
              'tests/unit/pages/**/*.test.{ts,tsx}',
              'tests/unit/utils/{admin-stats,api-client,auth-tokens,chart-data-merge,color-scale,config-api,format,portfolio-storage,stats,ticker-presets,url-state,formatter-boundaries}.test.ts',
            ],
            deps: {
              moduleDirectories: ['node_modules', 'packages/frontend/node_modules'],
            },
            environment: 'jsdom',
            setupFiles: ['tests/setup-browser.ts'],
          },
          resolve: {
            alias: {
              'react/jsx-dev-runtime': path.resolve(
                projectRoot,
                'packages/frontend/node_modules/react/jsx-dev-runtime.js',
              ),
              'react/jsx-runtime': path.resolve(
                projectRoot,
                'packages/frontend/node_modules/react/jsx-runtime.js',
              ),
              'react-dom/client': path.resolve(
                projectRoot,
                'packages/frontend/node_modules/react-dom/client.js',
              ),
              react: path.resolve(projectRoot, 'packages/frontend/node_modules/react'),
              'react-dom': path.resolve(projectRoot, 'packages/frontend/node_modules/react-dom'),
              recharts: path.resolve(projectRoot, 'packages/frontend/node_modules/recharts'),
              zustand: path.resolve(projectRoot, 'packages/frontend/node_modules/zustand'),
              'lucide-react': path.resolve(
                projectRoot,
                'packages/frontend/node_modules/lucide-react',
              ),
              i18next: path.resolve(projectRoot, 'packages/frontend/node_modules/i18next'),
              'react-i18next': path.resolve(
                projectRoot,
                'packages/frontend/node_modules/react-i18next',
              ),
              'i18next-browser-languagedetector': path.resolve(
                projectRoot,
                'packages/frontend/node_modules/i18next-browser-languagedetector',
              ),
              '@testing-library/react': path.resolve(
                projectRoot,
                'packages/frontend/node_modules/@testing-library/react',
              ),
              '@': path.resolve(projectRoot, './packages/frontend/src'),
              'react-router-dom': path.resolve(projectRoot, 'tests/mocks/react-router-dom.tsx'),
            },
          },
        },
        // ── chaos：Docker 依赖的混沌工程测试 ──
        {
          test: {
            name: 'chaos',
            globals: true,
            include: ['tests/chaos/**/*.test.ts'],
            testTimeout: 120000,
            hookTimeout: 60000,
          },
          resolve: {
            alias: {
              '@': path.resolve(projectRoot, './packages/frontend/src'),
            },
          },
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
          'packages/frontend/src/store/index.ts',
          'packages/frontend/src/store/types.ts',
          'packages/backend/src/utils/logger.ts',
          'packages/backend/src/utils/metrics.ts',
          'packages/backend/src/db/import.ts',
          'packages/backend/src/app.ts',
          'packages/backend/src/infrastructure/mailService.ts',
          'packages/backend/src/schemas/goalOptimizer.ts',
          'packages/backend/src/schemas/letf.ts',
          'packages/backend/src/schemas/pca.ts',
          'packages/backend/src/schemas/tacticalGrid.ts',
          'packages/backend/src/schemas/dataManage.ts',
        ],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 70,
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
      // PWA / Service Worker — 预缓存 app shell 实现离线加载与秒开
      // 仅在非 Vite 开发服务器（即 build 命令）时启用，避免 dev 模式下 SW 干扰 HMR
      ...(command === 'build'
        ? [
            (await import('vite-plugin-pwa')).VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['favicon.svg'],
              manifest: {
                name: 'testfolio - Portfolio Backtester',
                short_name: 'testfolio',
                description: '面向个人投资者的专业组合回测工具',
                theme_color: '#0b0c0f',
                background_color: '#0b0c0f',
                display: 'standalone',
                icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,woff2}'],
                navigateFallback: '/index.html',
                navigationPreload: true,
                runtimeCaching: [
                  {
                    urlPattern: /^https?:\/\/.*\/api\/v1\/data\/meta/,
                    handler: 'NetworkFirst',
                    options: {
                      cacheName: 'api-meta',
                      expiration: { maxEntries: 1, maxAgeSeconds: 1800 },
                    },
                  },
                  {
                    urlPattern: /^https?:\/\/.*\/api\/.*/,
                    handler: 'NetworkOnly',
                  },
                ],
              },
            }),
          ]
        : []),
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
      // MF 不要求 modulePreload: false（经源码验证，1.4.1 不检查此配置）；开启后 Vite 自动注入 modulepreload，减少 waterfall
      target: 'esnext',
      modulePreload: true,
      cssCodeSplit: false,
      // SSR 构建入口由 CLI --ssr 传递，确保 SSR 构建时输出 asset 文件
      ssrEmitAssets: true,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // SSR 构建不拆分 chunk（单一文件模块解析更可靠）
            if (process.env.VITE_SSR === 'true') return;

            // 将 src/utils 和 src/hooks 下的小模块合并为 shared-utils，减少 < 5KB 碎片请求
            if (
              id.includes('packages/frontend/src/utils/') ||
              id.includes('packages/frontend/src/hooks/')
            ) {
              return 'shared-utils';
            }
            // 解析包名：从 node_modules 路径中提取
            const nmIdx = id.lastIndexOf('node_modules');
            if (nmIdx === -1) return;
            const afterNm = id.slice(nmIdx + 13);
            const pkg = afterNm.startsWith('@')
              ? afterNm.slice(1).split('/')[0] + '/' + afterNm.slice(1).split('/')[1]
              : afterNm.split('/')[0];
            // 特殊处理：react-dom/server 分离（客户端不需要服务端渲染代码）
            if (pkg === 'react-dom') {
              const subPath = afterNm.split('/').slice(1).join('/');
              if (subPath.startsWith('server')) return 'react-dom-server';
              if (subPath.startsWith('client')) return 'react-dom-client';
              return 'react-dom'; // main entry
            }

            const CHUNKS: Record<string, string[]> = {
              'react-router': ['react-router-dom'],
              // react 为 CJS 包，拆出独立 chunk 会破坏 ESM interop（浏览器报 exports undefined），留在主 bundle
              'state-vendor': ['zustand'],
              'ui-vendor': [
                '@radix-ui',
                'class-variance-authority',
                'clsx',
                'tailwind-merge',
                'tailwindcss-animate',
              ],
              'icon-vendor': ['lucide-react'],
              'i18n-vendor': ['i18next', 'i18next-browser-languagedetector', 'react-i18next'],
              'form-vendor': ['react-hook-form', '@hookform'],
              'util-vendor': ['zod', 'web-vitals', '@tanstack'],
            };
            for (const [chunk, pkgs] of Object.entries(CHUNKS)) {
              if (pkgs.some((p) => pkg.startsWith(p))) return chunk;
            }
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
