import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(`http://localhost:${process.env.PORT || 8081}/index.html`, { waitUntil: 'load' });
await page.click('[data-act="new"]'); await page.waitForTimeout(250); await page.click('[data-char="IRONCLAD"]');
await page.click('#asc-list .choice');
await page.waitForTimeout(150);
await page.click('#anc-list .choice');
await page.waitForTimeout(400);

// 商店
await page.evaluate(() => { window.app.run.gold = 500; window.app.showShop(); });
await page.waitForTimeout(400); await page.screenshot({ path: 'shots/10-shop.png' });
await page.evaluate(() => window.app.clearOverlay());
// 休息
await page.evaluate(() => window.app.showRest());
await page.waitForTimeout(300); await page.screenshot({ path: 'shots/11-rest.png' });
await page.evaluate(() => window.app.clearOverlay());
// 事件
await page.evaluate(() => window.app.showEvent());
await page.waitForTimeout(300); await page.screenshot({ path: 'shots/12-event.png' });
await page.evaluate(() => window.app.clearOverlay());
// 宝箱
await page.evaluate(() => window.app.showTreasure());
await page.waitForTimeout(300); await page.screenshot({ path: 'shots/13-treasure.png' });
await page.evaluate(() => window.app.clearOverlay());
// 奖励
await page.evaluate(() => window.app.showRewards([{kind:'gold',amount:17},{kind:'relic',id:'VAJRA'},{kind:'cards',ids:['ANGER','SHRUG_IT_OFF','INFLAME']},{kind:'potion',id:'FIRE_POTION'}], () => {}));
await page.waitForTimeout(300); await page.screenshot({ path: 'shots/14-reward.png' });
await page.evaluate(() => window.app.clearOverlay());
// 战斗（多敌人 + boss）
await page.evaluate(async () => {
  const { Combat } = await import('/src/engine/combat.js');
  const { ENCOUNTERS } = await import('/src/data/enemies.js');
  window.app.startCombat('normal');
});
await page.waitForTimeout(900); await page.screenshot({ path: 'shots/15-combat.png' });
await b.close();
