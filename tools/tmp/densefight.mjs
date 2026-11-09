import { chromium } from 'playwright-core';
const CHROME = 'C://Program Files//Google//Chrome//Application//chrome.exe';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
await page.click('#anc-list .choice');
await page.waitForTimeout(400);

// 进事件 → 休息 → 战
await page.evaluate(() => { window.app.run.hp = 30; window.app.renderEvent('DENSE_VEGETATION'); });
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelectorAll('#event-list .choice')[1].click());
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok')?.click());
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelectorAll('#event-list .choice')[0].click());
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok')?.click());
await page.waitForTimeout(900);
const st = await page.evaluate(() => {
  const c = window.app.combat;
  return {
    screen: window.app.screen,
    enemies: c ? c.enemies.map((e) => ({ name: e.name, hp: e.hp, max: e.maxHp, move: e.moveKey, slot: e.slot })) : null,
    hp: window.app.run.hp,
  };
});
console.log(JSON.stringify(st, null, 1));
await page.screenshot({ path: 'shots/ev-dense-fight.png' });
// 打完
for (let i = 0; i < 200; i++) {
  const done = await page.evaluate(() => {
    const c = window.app.combat;
    if (!c || c.finished) return true;
    const btn = document.querySelector('#end-turn');
    if (btn && !btn.disabled) btn.click();
    return false;
  });
  if (done) break;
  await page.waitForTimeout(120);
}
await page.waitForTimeout(800);
console.log('after:', await page.evaluate(() => ({
  screen: window.app.screen,
  sheet: document.querySelector('.sheet-title')?.textContent || null,
  hp: window.app.run.hp,
  infection: window.app.run.deck.filter((d) => d.id === 'INFECTION').length,
})));
await page.screenshot({ path: 'shots/ev-dense-after.png' });
console.log('errors:', errs.length ? errs.slice(0, 4) : 'none');
await b.close();
