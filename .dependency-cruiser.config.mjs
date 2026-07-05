export default {
  forbidden: [
    {
      name: 'domain-zero-deps',
      comment: 'domain 层除 invariant 和 node_modules 外不应依赖外部',
      severity: 'error',
      from: { path: 'api/domain' },
      to: {
        pathNot: ['node_modules', 'api/domain', 'api/utils/invariant', 'api/utils/logger'],
      },
    },
    {
      name: 'no-reverse-layer',
      comment: 'services 不可依赖 routes',
      severity: 'error',
      from: { path: 'api/services' },
      to: { path: 'api/routes' },
    },
    {
      name: 'utils-no-routes',
      comment: '工具层不可依赖路由层',
      severity: 'error',
      from: { path: 'api/utils' },
      to: { path: 'api/routes' },
    },
    {
      name: 'frontend-no-backend',
      comment: '前端代码不可直接引用后端模块',
      severity: 'error',
      from: { path: 'src/' },
      to: { path: 'api/' },
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
    includeOnly: { path: ['api', 'src', 'shared'] },
    tsPreCompilationDeps: true,
  },
};
