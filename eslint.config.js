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
import sonarjs from 'eslint-plugin-sonarjs';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'data/**',
      'data-fetcher/**',
      'playwright-report/**',
      'test-results/**',
      'scripts/**',
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
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
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

  // 复杂度量化门控（ADR-021 / T-9）
  //
  // 企业为何需要：圈复杂度（McCabe）与嵌套深度是"代码难以测试/理解/维护"的客观度量。
  // 单函数复杂度 > 15 是重构红线（分支爆炸，单测难以覆盖全路径）。无门控时复杂度只增不减，
  // 最终形成无人敢动的"上帝函数"。
  // 阈值依据企业基准：复杂度 15 / 深度 4 / 函数 80 行 / 参数 5 / 回调 3。
  {
    files: ['api/**/*.ts', 'src/**/*.{ts,tsx}'],
    plugins: { sonarjs },
    rules: {
      complexity: ['warn', { max: 15 }],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 5],
      'max-nested-callbacks': ['warn', 3],
      'sonarjs/cognitive-complexity': ['warn', 15],
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

  // Prettier 兼容配置（必须放在最后）
  //
  // 企业为何需要：ESLint 和 Prettier 都会检查代码格式，若两者规则冲突会导致
  // `eslint --fix` 和 `prettier --write` 互相覆盖、无限循环。eslint-config-prettier
  // 关闭所有与 Prettier 冲突的 ESLint 规则（如缩进、引号、分号等），
  // 让 ESLint 专注代码质量，Prettier 专注代码格式，职责分离。
  eslintConfigPrettier,
);
