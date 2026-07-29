/**
 * 前端测试全局 setup（browser project）
 *
 * jsdom 中 navigator.language 默认为 'en-US'，导致 i18n 初始化为英文。
 * 测试断言期望中文文本，故在 setup 阶段将 i18nextLng 写入 localStorage，
 * 使 i18n 模块导入时初始化为 zh-CN。
 *
 * 同时显式导入 i18n 模块（dynamic import 确保 localStorage 先于 i18n init），
 * 使使用 useTranslation() 的组件（不直接导入 i18n）也能获取已初始化的 i18n 实例。
 */
localStorage.setItem('i18nextLng', 'zh-CN');
await import('@/i18n/index.js');