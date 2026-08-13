import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// 第三方依赖全部 external，运行时从 node_modules 以真实 CJS 加载（原生/__dirname 模块不受 bundle 影响）；
// @backtest/shared 为 TS 源码无构建产物，必须打包进 bundle。
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@backtest/shared');

const entry = process.argv[2] ?? 'src/server.ts';

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: {
    // CJS 依赖在 ESM 输出里经 __require shim 的动态 require 需要运行时 require 可用
    js: "import{createRequire as _cr}from'module';const require=_cr(import.meta.url);",
  },
  external,
  outdir: 'dist',
});
