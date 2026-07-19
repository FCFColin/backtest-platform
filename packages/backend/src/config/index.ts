/**
 * 集中配置模块（公共入口）。
 *
 * 薄重导出层：将 configObject（合成各配置片段）、validation（启动校验）与
 * env（共享类型/工具）统一对外暴露。所有消费方应从 `./config/index.js` 导入，
 * 以保持扁平的 `config.X` 访问路径与稳定的公共 API。
 *
 * 使用方式：
 *   import { config, validateConfig } from './config/index.js';
 *   validateConfig(); // 启动时调用
 *   // 扁平访问
 *   console.log(config.API_PORT);
 */

export { config, SUNSET_DATE_STR } from './configObject.js';
export { validateConfig } from './validation.js';
