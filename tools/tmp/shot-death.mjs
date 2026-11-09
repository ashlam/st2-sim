/** 截一张「事件里被打死」的结算图 */
import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 8081;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelectorAll('#anc-list .choice')[0]?.click());
await page.waitForTimeout(400);
for (let i = 0; i < 4; i++) {
  const open = await page.evaluate(() => !document.querySelector('#overlay-layer').classList.contains('hidden'));
  if (!open) break;
  await page.evaluate(() => document.querySelector('#sel-cancel, #close-deck')?.click());
  await page.waitForTimeout(200);
}
await page.evaluate(() => { window.app.run.hp = 3; window.app.renderEvent('ABYSSAL_BATHS'); });
await page.waitForTimeout(250);
const pick = async (n) => {
  await page.evaluate((i) => document.querySelectorAll('#event-list .choice')[i]?.click(), n);
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok')?.click());
  await page.waitForTimeout(350);
};
await pick(0);
await page.screenshot({ path: 'shots/death-event.png' });
await pick(0);
console.log(await page.evaluate(() => ({
  result: !!document.querySelector('.result-screen'),
  title: document.querySelector('.result-title')?.textContent,
  hp: window.app.run.hp,
})));
await page.screenshot({ path: 'shots/death-result.png' });
await b.close();
