/** 静默猎手流程：选人 → 进战斗 → 打牌（小刀/中毒）→ 战报点卡名 */
import { chromium } from 'playwright-core';

const b = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.click('[data-act="new"]');
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/70-char-select.png' });
await page.click('[data-char="SILENT"]');
await page.waitForTimeout(200);
await page.click('#asc-list .choice');
await page.waitForTimeout(250);
await page.click('#neow-list .choice');
await page.waitForTimeout(300);
await page.evaluate(() => { const c = [...document.querySelectorAll('.sheet .btn')].find(b => b.textContent.includes('取消')); if (c) c.click(); });
await page.waitForTimeout(150);

await page.evaluate(async () => {
  window.DEBUG_SPEED = 0;
  await window.app.enterNode(window.app.run.map.startNodes[0]);
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/71-silent-battle.png' });

const info = await page.evaluate(() => ({
  char: window.app.run.character,
  hp: window.app.run.hp,
  hand: window.app.combat.hand.map(c => c.name),
  deck: window.app.run.deck.length,
}));
console.log('开局:', JSON.stringify(info));

// 塞几张代表性牌进手牌，验证 UI 渲染与结算
await page.evaluate(async () => {
  const app = window.app;
  const c = app.combat;
  c.energy = 9;
  const ids = ['BLADE_DANCE', 'DEADLY_POISON', 'TACTICIAN'];
  const { makeCard } = await import('./src/data/cards.js');
  // 清空手牌再塞，保证小刀有位置进来（手牌上限 10，起手牌数量随机）
  c.hand.length = 0;
  for (const id of ids) c.hand.push(makeCard(id));
  c.hand.push(makeCard('STRIKE_SILENT'));
  app.renderCombat();
});
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/72-silent-hand.png' });

const played = await page.evaluate(async () => {
  const c = window.app.combat;
  const target = c.alive()[0];
  const out = [];
  const bd = c.hand.find(x => x.id === 'BLADE_DANCE');
  if (bd) { await c.playCard(bd, target); out.push('刀刃之舞'); }
  const dp = c.hand.find(x => x.id === 'DEADLY_POISON');
  if (dp) { await c.playCard(dp, target); out.push('致命毒药'); }
  window.app.renderCombat();
  return { out, shivs: c.hand.filter(x => x.id === 'SHIV').length, poison: target.powers.poison || 0 };
});
console.log('打出:', played.out.join('、'), '| 小刀', played.shivs, '| 敌人中毒', played.poison);
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/73-silent-shiv.png' });

// 点手牌里的小刀 = 选中它（再点一下才打出）；顺便看牌面文字是否在
await page.evaluate(() => { [...document.querySelectorAll('.hand .card')].find(el => el.textContent.includes('小刀'))?.click(); });
await page.waitForTimeout(200);
const shivSel = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.hand .card')].find(x => x.textContent.includes('小刀'));
  return { selected: !!el?.classList.contains('selected'), text: (el?.innerText || '').replace(/\n+/g, ' ').trim().slice(0, 40) };
});
console.log('点小刀 → 选中:', shivSel.selected, '| 牌面:', shivSel.text || '无');
await page.evaluate(() => { window.app.selectedCard = null; window.app.renderCombat(); });

// 打一张小刀
const shivDmg = await page.evaluate(async () => {
  const c = window.app.combat;
  const sh = c.hand.find(x => x.id === 'SHIV');
  const e = c.alive()[0];
  const hp = e.hp;
  if (sh) await c.playCard(sh, e);
  window.app.renderCombat();
  return { dmg: hp - e.hp, left: c.hand.filter(x => x.id === 'SHIV').length };
});
console.log('小刀伤害', shivDmg.dmg, '剩余小刀', shivDmg.left);

// 战报
await page.evaluate(() => window.app.showCombatLog());
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/74-silent-log.png' });
console.log('战报行数:', await page.evaluate(() => document.querySelectorAll('.log-modal .log-line').length));
await page.evaluate(() => document.querySelector('.log-modal [data-lg="close"]')?.click());

console.log('errors:', errs.length ? errs.join(' / ') : 'none');
await b.close();
