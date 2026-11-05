/** 储君端到端：选人 → 星愿 HUD → 星费牌 → 铸造 → 战报 → 无报错 */
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = process.env.PORT || '8082';
fs.mkdirSync('shots', { recursive: true });
const b = await chromium.launch({
  executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true,
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.click('[data-act="new"]');
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/80-regent-char-select.png' });
const unlocked = await page.evaluate(() => {
  const el = document.querySelector('[data-char="REGENT"]');
  return { exists: !!el, locked: el?.classList.contains('locked') };
});
console.log('选人界面储君:', JSON.stringify(unlocked));

await page.click('[data-char="REGENT"]');
await page.waitForTimeout(200);
await page.click('#asc-list .choice');
await page.waitForTimeout(250);
await page.click('#neow-list .choice');
await page.waitForTimeout(300);
await page.evaluate(() => {
  const c = [...document.querySelectorAll('.sheet .btn')].find(b => b.textContent.includes('取消'));
  if (c) c.click();
});
await page.waitForTimeout(150);

await page.evaluate(async () => {
  window.DEBUG_SPEED = 0;
  await window.app.enterNode(window.app.run.map.startNodes[0]);
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/81-regent-battle.png' });

const opening = await page.evaluate(() => ({
  char: window.app.run.character,
  hp: window.app.run.hp,
  relic: window.app.run.relics[0],
  stars: window.app.combat.player.stars,
  hud: document.querySelector('.stars-hud')?.textContent.trim(),
  deck: window.app.run.deck.map(c => c.id),
}));
console.log('开局:', JSON.stringify(opening));

// 塞几张代表性的星费/铸造牌，验证牌面角标与结算
await page.evaluate(async () => {
  const app = window.app, c = app.combat;
  c.energy = 9;
  c.hand.length = 0;
  const { makeCard } = await import('./src/data/cards.js');
  for (const id of ['FALLING_STAR', 'VENERATE', 'WROUGHT_IN_WAR', 'STARDUST', 'CLOAK_OF_STARS']) {
    c.hand.push(makeCard(id));
  }
  app.renderCombat();
});
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/82-regent-hand.png' });

const badges = await page.evaluate(() => [...document.querySelectorAll('.hand .card')].map(el => ({
  name: el.querySelector('.card-name')?.textContent,
  star: el.querySelector('.card-stars')?.textContent,
})));
console.log('星费角标:', JSON.stringify(badges));

// 星愿词条弹层
await page.click('.stars-hud');
await page.waitForTimeout(200);
const starInfo = await page.evaluate(() => ({
  title: document.querySelector('.kw-pop .kw-title')?.textContent || '',
  text: (document.querySelector('.kw-pop .kw-body')?.innerText || '').slice(0, 50),
}));
console.log('点星愿 HUD →', JSON.stringify(starInfo));
await page.evaluate(() => window.app.closeInfo());

const played = await page.evaluate(async () => {
  const c = window.app.combat;
  const e = c.alive()[0];
  // 涅奥馈赠可能给力量/易伤，先归零让「陨星 8 点」的断言稳定
  c.player.powers.strength = 0;
  c.player.tempStr = 0;
  c.player.vigor = 0;
  delete e.powers.vulnerable;
  const out = {};
  const s0 = c.player.stars, hp0 = e.hp;
  const fs = c.hand.find(x => x.id === 'FALLING_STAR');
  await c.playCard(fs, e);
  out.fallingStar = { starSpent: s0 - c.player.stars, dmg: hp0 - e.hp, weak: e.powers.weak, vuln: e.powers.vulnerable };
  const s1 = c.player.stars;
  const v = c.hand.find(x => x.id === 'VENERATE');
  await c.playCard(v, e);
  out.venerate = { gained: c.player.stars - s1 };
  const w = c.hand.find(x => x.id === 'WROUGHT_IN_WAR');
  await c.playCard(w, e);
  const blade = [...c.hand, ...c.discardPile, ...c.drawPile].find(x => x.id === 'SOVEREIGN_BLADE');
  out.forge = { blade: !!blade, damage: blade ? blade.def.vars(blade, c).Damage : 0 };
  window.app.renderCombat();
  return out;
});
console.log('结算:', JSON.stringify(played));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/83-regent-forged.png' });

// 星愿不足时的 UI 提示
const noStars = await page.evaluate(() => {
  const c = window.app.combat;
  c.player.stars = 0;
  const card = c.hand.find(x => x.id === 'CLOAK_OF_STARS');
  if (!card) return 'no-card';
  const e = document.querySelector('.hand .card');
  return c.canPlay(card) ? 'playable' : 'blocked';
});
console.log('星愿归零后星费牌:', noStars);

// 战报
await page.evaluate(() => window.app.showCombatLog());
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/84-regent-log.png' });
const logInfo = await page.evaluate(() => ({
  lines: document.querySelectorAll('.log-modal .log-line').length,
  hasStar: [...document.querySelectorAll('.log-modal .log-line')].some(el => el.textContent.includes('星愿')),
  hasForge: [...document.querySelectorAll('.log-modal .log-line')].some(el => el.textContent.includes('铸造')),
}));
console.log('战报:', JSON.stringify(logInfo));
await page.evaluate(() => document.querySelector('.log-modal [data-lg="close"]')?.click());

const assert = [];
if (!unlocked.exists || unlocked.locked) assert.push('储君仍被锁');
if (opening.char !== '储君' || opening.stars !== 3) assert.push('开局星愿不是 3');
if (!opening.hud?.includes('3')) assert.push('HUD 没显示星愿');
if (starInfo.title !== '星愿') assert.push('星愿词条弹层没打开');
if (badges.filter(x => x.star).length < 3) assert.push('星费角标数量不足');
if (played.fallingStar.starSpent !== 2 || played.fallingStar.dmg !== 8) assert.push('陨星数值不对');
if (played.venerate.gained !== 2) assert.push('崇拜星愿不对');
if (!played.forge.blade || played.forge.damage !== 17) assert.push('铸造/君王之剑不对');
if (!logInfo.hasStar || !logInfo.hasForge) assert.push('战报缺少星愿/铸造');
console.log('断言:', assert.length ? 'FAIL ' + assert.join(' / ') : '全部通过');
console.log('errors:', errs.length ? errs.join(' / ') : 'none');
await b.close();
if (assert.length || errs.length) process.exit(1);
