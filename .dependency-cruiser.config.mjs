export default {
  forbidden: [
    {
      name: 'domain-zero-deps',
      comment: 'domain 层除 invariant 和 node_modules 外不应依赖外部',
      severity: 'error',
      from: { path: 'packages/backend/src/domain' },
      to: {
        pathNot: [
          'node_modules',
          'packages/backend/src/domain',
          'packages/backend/src/utils',
          'packages/shared',
        ],
      },
    },
    {
      name: 'no-reverse-layer',
      comment: 'services 不可依赖 routes',
      severity: 'error',
      from: { path: 'packages/backend/src/services' },
      to: { path: 'packages/backend/src/routes' },
    },
    {
      name: 'utils-no-routes',
      comment: '工具层不可依赖路由层',
      severity: 'error',
      from: { path: 'packages/backend/src/utils' },
      to: { path: 'packages/backend/src/routes' },
    },
    {
      name: 'frontend-no-backend',
      comment: '前端代码不可直接引用后端模块',
      severity: 'error',
      from: { path: 'packages/frontend/src/' },
      to: { path: 'packages/backend/src/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: '禁止循环依赖',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: 'node_modules',
    exclude: {
      path: [
        '\\.test\\.',
        '\\.spec\\.',
        '\\.bench\\.',
        'node_modules',
        'dist',
        'build',
        'coverage',
      ],
    },
    includeOnly: { path: ['packages/backend/src', 'packages/frontend/src', 'packages/shared'] },
    tsPreCompilationDeps: true,
  },
};
