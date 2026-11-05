/** 端到端跑完整一局（用页面内点击，避免 DOM 重渲染导致句柄失效） */
import { chromium } from 'playwright-core';
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.click('[data-act="new"]'); await page.waitForTimeout(250); await page.click('[data-char="IRONCLAD"]');
await page.click('#asc-list .choice');
await page.waitForTimeout(200);
await page.click('#neow-list .choice');
await page.waitForTimeout(500);
await page.evaluate(() => { window.DEBUG_SPEED = 0; });
// 测试用：抬高血量以便走完整个第一幕（覆盖商店/休息/事件/宝箱/Boss）
await page.evaluate(() => { if (window.app.run) { window.app.run.maxHp = 400; window.app.run.hp = 400; } });

const seen = new Set();
for (let step = 0; step < 500; step++) {
  const status = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const ov = q('.overlay-layer:not(.hidden)');
    if (ov) {
      const title = (ov.querySelector('.sheet-title') || {}).textContent || 'overlay';
      const done = q('#skip-reward') || q('#take-treasure') || q('#leave-shop') || q('#sel-confirm') || q('#close-deck') || q('#close-pile');
      if (done) { done.click(); return 'OVERLAY:' + title + ' → 完成'; }
      const card = ov.querySelector('.reward-grid .card');
      if (card) { card.click(); return 'OVERLAY:' + title + ' → 选卡'; }
      const choice = ov.querySelector('.choice');
      if (choice) { choice.click(); return 'OVERLAY:' + title + ' → 选择'; }
      const btn = ov.querySelector('.btn');
      if (btn) { btn.click(); return 'OVERLAY:' + title + ' → 按钮'; }
      return 'OVERLAY:STUCK:' + title;
    }
    if (q('.combat-screen')) {
      const cards = [...document.querySelectorAll('.hand .card:not(.disabled)')];
      if (cards.length) {
        const c = cards[Math.floor(Math.random() * cards.length)];
        c.click();
        const enemy = document.querySelector('[data-enemy]');
        const sel = document.querySelector('.card.selected');
        if (sel) { if (enemy) enemy.click(); else c.click(); }
        return 'COMBAT:play';
      }
      const et = q('#end-turn');
      if (et) { et.click(); return 'COMBAT:end'; }
    }
    const node = q('.map-node.available');
    if (node) { node.click(); return 'MAP:' + node.textContent; }
    if (q('.result-screen')) return 'RESULT:' + q('.result-title').textContent;
    const btn = q('.btn');
    if (btn) { btn.click(); return 'BTN:' + btn.textContent; }
    return 'STUCK';
  });
  if (status.startsWith('RESULT') || status === 'STUCK') { console.log('结束：', status); break; }
  if (step % 12 === 0) {
    const st = await page.evaluate(() => window.app.run ? `hp=${window.app.run.hp}/${window.app.run.maxHp} floor=${window.app.run.floor} gold=${window.app.run.gold}` : 'no-run');
    console.log('step', step, status.slice(0, 30), st);
  }
  if (status.startsWith('OVERLAY')) seen.add(status.split(' →')[0]);
  if (status.startsWith('MAP')) seen.add('MAP');
  await page.waitForTimeout(status.startsWith('COMBAT') ? 90 : 180);
}
console.log('见过的界面：', [...seen].join(' | '));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await page.screenshot({ path: 'shots/99-end.png' });
await browser.close();
