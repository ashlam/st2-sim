/** 第二幕端到端：能进入、能打、能拿奖励、能过幕 */
import { chromium } from 'playwright-core';
const PORT = process.env.PORT || 8081;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('CONSOLE: ' + m.text()); });

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
await page.click('#anc-list .choice');
await page.waitForTimeout(300);

// 直接跳到第二幕
await page.evaluate(() => { window.app.run.startAct(2); window.app.run.hp = 80; window.app.showMap(); });
await page.waitForTimeout(300);
console.log('地图标题:', await page.textContent('.map-head .dim.small'));

// 进战斗
await page.evaluate(async () => {
  const n = window.app.run.map.nodes.find(n => n.type === 'monster' && n.row === 0);
  await window.app.enterNode(n);
});
await page.waitForTimeout(600);
const info = await page.evaluate(() => ({
  screen: window.app.screen,
  enemies: window.app.combat?.enemies.map(e => `${e.name}(${e.hp}) ${e.moveKey}`),
  enc: window.app.combat?.enc.id,
}));
console.log('战斗:', info.enc, '|', info.enemies?.join('，'));

// 打满 8 回合（能出牌就出）
for (let i = 0; i < 8; i++) {
  const done = await page.evaluate(() => !!document.querySelector('#card-reward, .result-screen'));
  if (done) break;
  const played = await page.evaluate(() => {
    const c = window.app.combat;
    if (!c || c.finished) return 'end';
    const card = c.hand.find(x => c.canPlay(x) && x.type !== 'power');
    if (card) {
      const e = c.alive()[0];
      c.playCard(card, e);
      return 'play';
    }
    return 'end';
  });
  await page.waitForTimeout(180);
  if (played === 'end') {
    await page.evaluate(() => window.app.endTurn?.() || document.querySelector('#end-turn')?.click());
    await page.waitForTimeout(400);
  }
}
await page.waitForTimeout(600);
console.log('回合后:', await page.evaluate(() => ({
  finished: window.app.combat?.finished,
  won: window.app.combat?.won,
  reward: !!document.querySelector('#card-reward'),
  result: document.querySelector('.result-title')?.textContent || null,
  hp: window.app.run.hp,
})));
console.log('errors:', errs.length ? errs.slice(0, 5).join(' / ') : 'none');
await b.close();
