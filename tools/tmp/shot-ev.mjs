import { chromium } from 'playwright-core';
const CHROME = 'C://Program Files//Google//Chrome//Application//chrome.exe';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
await page.click('#anc-list .choice');
await page.waitForTimeout(400);
for (const [id, file] of [['AROMA_OF_CHAOS', 'ev-aroma'], ['DENSE_VEGETATION', 'ev-dense'], ['BYRDONIS_NEST', 'ev-nest'], ['UNREST_SITE', 'ev-unrest'], ['MORPHIC_GROVE', 'ev-grove']]) {
  await page.evaluate((ev) => { window.app.run.hp = 20; window.app.run.gold = 150; window.app.renderEvent(ev); }, id);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `shots/${file}.png` });
}
// 休息处孵化选项
await page.evaluate(() => { window.app.run.addCard('BYRDONIS_EGG'); window.app.clearOverlay(); window.app.showRest(); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/ev-hatch.png' });
await b.close();
console.log('done');
