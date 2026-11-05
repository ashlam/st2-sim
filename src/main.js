import { App } from './ui/app.js';

const app = new App();
window.app = app;

// PWA：离线可用（安卓可“添加到主屏幕”当 App 玩）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// 禁用双击缩放与长按菜单，减少手机误触
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.card, .enemy, .map-node')) e.preventDefault();
});
