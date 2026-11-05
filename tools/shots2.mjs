import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(`http://localhost:${process.env.PORT || 8081}/index.html`, { waitUntil: 'load' });
await page.click('[data-act="new"]'); await page.waitForTimeout(250); await page.click('[data-char="IRONCLAD"]'); await page.click('#asc-list .choice'); await page.waitForTimeout(150); await page.click('#neow-list .choice');
await page.waitForTimeout(300);
// 多敌人战斗
await page.evaluate(() => { window.app.run.relics.push('VAJRA','ANCHOR','BLOOD_VIAL'); window.app.startCombat('elite'); });
await page.waitForTimeout(900); await page.screenshot({ path: 'shots/20-elite.png' });
await page.evaluate(() => { window.app.combat = null; window.app.run.curNode = null; window.app.showMap(); });
// Boss
await page.evaluate(() => window.app.startCombat('boss'));
await page.waitForTimeout(900); await page.screenshot({ path: 'shots/21-boss.png' });
// 出牌后的状态
await page.evaluate(async () => {
  const c = window.app.combat; c.speed = 0;
  const card = c.hand.find(x => c.canPlay(x));
  if (card) await c.playCard(card, c.alive()[0]);
  window.app.renderCombat();
});
await page.waitForTimeout(400); await page.screenshot({ path: 'shots/22-after.png' });
await b.close();
