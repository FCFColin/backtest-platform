// 首帧主题脚本：在 React 挂载前同步设置 data-theme，避免亮/暗闪变（与 useTheme 逻辑保持一致）
(function () {
  var t;
  try {
    t = localStorage.getItem('theme');
  } catch {
    t = 'dark';
  }
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.add(t);
})();
