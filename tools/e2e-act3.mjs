/** 第三幕端到端：能进入、能打、能过首领 */
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

// 直接跳到第三幕
await page.evaluate(() => { window.app.run.startAct(3); window.app.run.hp = 200; window.app.run.maxHp = 200; window.app.showMap(); });
await page.waitForTimeout(300);
console.log('地图标题:', await page.textContent('.map-head .dim.small'));

// 打一场普通怪
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

for (let i = 0; i < 8; i++) {
  const done = await page.evaluate(() => !!document.querySelector('#card-reward, .result-screen'));
  if (done) break;
  const played = await page.evaluate(() => {
    const c = window.app.combat;
    if (!c || c.finished) return 'end';
    const card = c.hand.find(x => c.canPlay(x) && x.type !== 'power');
    if (card) { c.playCard(card, c.alive()[0]); return 'play'; }
    return 'end';
  });
  await page.waitForTimeout(180);
  if (played === 'end') {
    await page.evaluate(() => document.querySelector('#end-turn')?.click());
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

// 直接进第三幕首领（女王 + 聚合体），确认双部件与意图渲染
await page.evaluate(() => {
  window.app.combat = null;
  window.app.run.bossQueue = ['QUEEN_BOSS'];
  window.app.startCombat('boss');
});
await page.waitForTimeout(600);
console.log('首领战:', await page.evaluate(() => ({
  enc: window.app.combat?.enc.id,
  enemies: window.app.combat?.enemies.map(e => `${e.name}(${e.hp}) ${e.moveKey}`),
  intents: [...document.querySelectorAll('.enemy .intent')].map(x => x.textContent.trim()),
})));
await page.screenshot({ path: 'tools/_act3-boss.png' });
console.log('errors:', errs.length ? errs.slice(0, 5).join(' / ') : 'none');
await b.close();
