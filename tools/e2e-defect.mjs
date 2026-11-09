/** 故障机器人流程：选人 → 进战斗 → 生成/激发充能球 → 点球看说明 → 战报 */
import { chromium } from 'playwright-core';

const b = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(`http://localhost:${process.env.PORT || 8081}/index.html`, { waitUntil: 'load' });
await page.click('[data-act="new"]');
await page.waitForTimeout(250);
await page.click('[data-char="DEFECT"]');
await page.waitForTimeout(200);
await page.click('#asc-list .choice');
await page.waitForTimeout(250);
await page.click('#anc-list .choice');
await page.waitForTimeout(300);
await page.evaluate(() => { const c = [...document.querySelectorAll('.sheet .btn')].find(b => b.textContent.includes('取消')); if (c) c.click(); });
await page.waitForTimeout(150);

await page.evaluate(async () => {
  window.DEBUG_SPEED = 0;
  await window.app.enterNode(window.app.run.map.startNodes[0]);
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/80-defect-battle.png' });

const info = await page.evaluate(() => ({
  char: window.app.run.character,
  hp: window.app.run.hp,
  slots: window.app.combat.maxOrbSlots,
  orbs: window.app.combat.player.orbs.map(o => o.kind),
  hand: window.app.combat.hand.map(c => c.name),
}));
console.log('开局:', JSON.stringify(info));

// 塞几张代表性牌，验证 UI 与控制台无报错
await page.evaluate(async () => {
  const app = window.app;
  const c = app.combat;
  c.energy = 9;
  const { makeCard } = await import('./src/data/cards.js');
  for (const id of ['BALL_LIGHTNING', 'COLD_SNAP', 'DEFRAGMENT', 'DARKNESS']) c.hand.push(makeCard(id));
  app.renderCombat();
});
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/81-defect-hand.png' });

const played = await page.evaluate(async () => {
  const c = window.app.combat;
  const target = c.alive()[0];
  const out = [];
  for (const id of ['BALL_LIGHTNING', 'COLD_SNAP', 'DEFRAGMENT', 'DARKNESS']) {
    const card = c.hand.find(x => x.id === id);
    if (card) { await c.playCard(card, target); out.push(card.name); }
  }
  window.app.renderCombat();
  return { out, orbs: c.player.orbs.map(o => o.kind), focus: c.player.powers.focus || 0 };
});
console.log('打出:', played.out.join('、'), '| 球', played.orbs.join('/'), '| 集中', played.focus);
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/82-defect-orbs.png' });

// 点球看说明
const orbCount = await page.evaluate(() => document.querySelectorAll('.orb:not(.empty)').length);
await page.evaluate(() => document.querySelector('.orb:not(.empty)')?.click());
await page.waitForTimeout(200);
const orbTip = await page.evaluate(() => document.querySelector('.kw-pop .kw-title')?.textContent || '无');
console.log('球栏数量', orbCount, '| 详情弹层:', orbTip);
await page.screenshot({ path: 'shots/83-defect-orb-info.png' });
await page.evaluate(() => document.querySelector('.kw-pop .kw-close')?.click());

// 主动激发一次（双发最左边）
const evoked = await page.evaluate(async () => {
  const c = window.app.combat;
  const e = c.alive()[0];
  const hp = e.hp;
  const before = c.player.orbs.length;
  await c.evokeFirst(2);
  window.app.renderCombat();
  return { dmg: hp - e.hp, before, after: c.player.orbs.length };
});
console.log('激发最左侧两次:', JSON.stringify(evoked));

// 结束回合 → 球的被动与敌人回合（战斗可能已经结束了，就不再推进）
const still = await page.evaluate(() => !!window.app.combat && !window.app.combat.finished);
if (still) {
  await page.evaluate(async () => { await window.app.combat.endTurn(); window.app.renderCombat(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/84-defect-turn2.png' });
} else {
  console.log('战斗已结束，跳过回合推进');
}

// 战报
await page.evaluate(() => window.app.showCombatLog());
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/85-defect-log.png' });
const lines = await page.evaluate(() => document.querySelectorAll('.log-modal .log-line').length);
console.log('战报行数:', lines);
await page.evaluate(() => document.querySelector('.log-modal [data-lg="close"]')?.click());

console.log('errors:', errs.length ? errs.join(' / ') : 'none');
await b.close();
process.exit(errs.length ? 1 : 0);
