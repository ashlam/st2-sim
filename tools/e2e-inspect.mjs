import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) console.log('BAD', r.status(), r.url()); });

await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.click('[data-act="new"]'); await page.waitForTimeout(250);
await page.click('[data-char="IRONCLAD"]'); await page.waitForTimeout(200);
await page.click('#asc-list .choice'); await page.waitForTimeout(200);
await page.click('#neow-list .choice'); await page.waitForTimeout(300);
await page.evaluate(() => { const c = [...document.querySelectorAll('.sheet .btn')].find(b => b.textContent.includes('取消')); if (c) c.click(); });
await page.waitForTimeout(150);

// 进第一场战斗，打两张牌 + 结束一回合，攒日志
await page.evaluate(async () => {
  window.DEBUG_SPEED = 0;
  await window.app.enterNode(window.app.run.map.startNodes[0]);
});
await page.waitForTimeout(400);
await page.evaluate(async () => {
  const c = window.app.combat;
  for (let i = 0; i < 2; i++) {
    const p = c.hand.filter(x => c.canPlay(x));
    if (p.length) await c.playCard(p[0], c.alive()[0]);
  }
  // 造点状态出来：敌人身上力量+易伤，玩家身上敏捷
  await c.enemyPower(c.enemies[0], 'strength', 3);
  await c.addPower('vulnerable', 2, c.alive()[0]);
  await c.addPower('dexterity', 1);
  await c.endTurn();
  window.app.renderCombat();
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/50-battle.png' });

// 1) 打开战报
await page.evaluate(() => window.app.showCombatLog());
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/51-log.png' });

// 2) 点日志里的牌名
const kinds = await page.evaluate(() => {
  const seen = {};
  document.querySelectorAll('.log-modal .kwl').forEach(el => { seen[el.dataset.kwKind] = (seen[el.dataset.kwKind] || 0) + 1; });
  return seen;
});
console.log('日志里可点的关键词类型:', JSON.stringify(kinds));
await page.evaluate(() => { document.querySelector('.log-modal .kwl[data-kw-kind="card"]')?.click(); });
await page.waitForTimeout(350);
await page.screenshot({ path: 'shots/52-log-card.png' });
console.log('卡牌详情打开:', await page.evaluate(() => document.querySelector('.kw-pop .kw-title')?.textContent || '无'));

// 3) 点日志里的状态名
await page.evaluate(() => {
  document.querySelector('.kw-pop .kw-close')?.click();
  document.querySelector('.log-modal .kwl[data-kw-kind="power"]')?.click();
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/53-log-power.png' });
console.log('状态详情打开:', await page.evaluate(() => (document.querySelector('.kw-pop')?.innerText || '无').replace(/\n+/g, ' | ')));

// 4) 关掉日志，点敌人身上的状态 / 点能量球 / 点敌人本体
await page.evaluate(() => {
  document.querySelector('.kw-pop .kw-close')?.click();
  document.querySelector('.log-modal [data-lg="close"]')?.click();
});
await page.waitForTimeout(300);
await page.evaluate(() => { document.querySelector('.enemy .pw')?.click(); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/54-enemy-power.png' });
const p1 = await page.evaluate(() => document.querySelector('.kw-pop')?.innerText.slice(0, 80) || '无');
console.log('敌人状态详情:', p1.replace(/\n/g, ' | '));

await page.evaluate(() => {
  document.querySelector('.kw-pop .kw-close')?.click();
  document.querySelector('.energy')?.click();
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/55-energy.png' });
console.log('能量说明:', await page.evaluate(() => document.querySelector('.kw-pop .kw-title')?.textContent || '无'));

await page.evaluate(() => {
  document.querySelector('.kw-pop .kw-close')?.click();
  document.querySelector('.enemy')?.click();
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/56-enemy.png' });
console.log('敌人详情:', await page.evaluate(() => document.querySelector('.kw-pop .kw-title')?.textContent || '无'));

await page.evaluate(() => document.querySelector('.kw-pop .kw-close')?.click());
await page.waitForTimeout(200);
console.log('errors:', errs.length ? errs.join(' / ') : 'none');
await b.close();
