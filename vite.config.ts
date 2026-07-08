import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import istanbul from 'vite-plugin-istanbul';

/** E2E 覆盖率脚本会设 VITE_COVERAGE=true */
const enableCoverage = process.env.VITE_COVERAGE === 'true';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
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
      'zustand',
      'i18next',
      'react-i18next',
      'i18next-browser-languagedetector',
    ],
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
