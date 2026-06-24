// @ts-check
/**
 * ESLint 9 Flat Config
 *
 * 企业理由：ESLint 9 必须使用 flat config（eslint.config.js），
 * 否则 `eslint .` 会报 "Could not find config file"。
 * 此前 package.json 声明了 `eslint .`、CI 执行 `npm run lint`、
 * pre-commit 执行 `eslint --fix`，但配置文件缺失导致整条 lint 链路断裂。
 * 团队协作中，无强制的代码风格检查 = 代码风格随个人习惯漂移 = review 噪音增大。
 *
 * 权衡：启用 typescript-eslint recommended 会产生一定存量告警，
 * 但这是保证代码质量的必要成本，存量告警可逐步修复。
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'data/**',
      'engine-rs/**',
      'data-fetcher/**',
      'api/python/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  // 基础推荐规则
  js.configs.recommended,

  // TypeScript 推荐规则
  ...tseslint.configs.recommended,

  // 前端 React 配置
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // 后端 Node.js 配置
  {
    files: ['api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // 测试配置
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // 通用规则覆盖
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      // typescript-eslint 官方建议：使用 TypeScript 时禁用 no-undef，
      // 因为 TS 编译器已通过类型系统检查未定义变量，no-undef 会误报 console 等 Node 全局变量。
      'no-undef': 'off',
      // 渐进式 lint 策略：no-unused-vars 先设为 warn，避免一次性阻断 31 个存量 error。
      // 企业引入 lint 到既有代码库的标准做法：先 warn 让团队逐步清理，清理完成后升级为 error。
      // TODO(lint-cleanup): 存量 unused vars 清理后，升级回 'error'。
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 允许 any 类型（渐进式迁移，避免一次性阻断过多）
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
