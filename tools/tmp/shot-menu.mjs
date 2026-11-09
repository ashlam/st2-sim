/** 截菜单界面（地图 / 战斗） */
import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 8081;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(200);
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelectorAll('#anc-list .choice')[0]?.click());
await page.waitForTimeout(400);
for (let i = 0; i < 5; i++) {
  const open = await page.evaluate(() => !document.querySelector('#overlay-layer').classList.contains('hidden'));
  if (!open) break;
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#overlay-layer .btn')].find(x => /跳过|关闭|取消|不要/.test(x.textContent));
    (btn || document.querySelector('#overlay-layer .btn'))?.click();
  });
  await page.waitForTimeout(180);
}
await page.screenshot({ path: 'shots/menu-map-hud.png' });
await page.click('.map-screen #open-menu');
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/menu-map.png' });

await page.evaluate(() => document.querySelector('#menu-close').click());
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelector('.map-node.available').click());
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/menu-combat-hud.png' });
await page.click('.combat-screen #open-menu');
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/menu-combat.png' });
console.log('ok');
await b.close();
