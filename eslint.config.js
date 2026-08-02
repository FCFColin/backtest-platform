// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import sonarjs from 'eslint-plugin-sonarjs';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-ssr/**',
      '.dev-logs/**',
      'packages/backend/dist/**',
      'node_modules/**',
      'coverage/**',
      'data/**',
      'data-fetcher/**',
      'playwright-report/**',
      'test-results/**',
      'scripts/**',
      'report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/frontend/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh, 'jsx-a11y': jsxA11y },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  { files: ['packages/backend/src/**/*.ts'], languageOptions: { globals: globals.node } },
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // 圈复杂度门控：复杂度 15 / 深度 4 / 函数 80 行 / 参数 5 / 回调 3
  {
    files: ['packages/backend/src/**/*.ts', 'packages/frontend/src/**/*.{ts,tsx}'],
    plugins: { sonarjs },
    rules: {
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', 4],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 5],
      'max-nested-callbacks': ['error', 3],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
  // i18n 门控：禁止 .tsx 中文字面量
  {
    files: ['packages/frontend/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/[\\u4e00-\\u9fa5]/]',
          message: '禁止在 .tsx 中使用中文字符串字面量，请使用 useTranslation() + i18n key',
        },
        {
          selector: 'TemplateElement[value.raw=/[\\u4e00-\\u9fa5]/]',
          message: '禁止在 .tsx 中使用中文模板字面量，请使用 useTranslation() + i18n key',
        },
        {
          selector: 'JSXText[value=/[\\u4e00-\\u9fa5]/]',
          message: '禁止在 .tsx 中使用中文 JSX 文本，请使用 useTranslation() + i18n key',
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': 'error',
    },
  },
  eslintConfigPrettier,
);
