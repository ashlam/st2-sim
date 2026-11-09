import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C://Program Files//Google//Chrome//Application//chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.waitForTimeout(250);
await page.click('[data-act="new"]'); await page.waitForTimeout(200);
await page.click('[data-char="IRONCLAD"]'); await page.waitForTimeout(160);
await page.click('#asc-list .choice'); await page.waitForTimeout(180);
await page.click('#anc-list .choice'); await page.waitForTimeout(600);
for (let i = 0; i < 5; i++) {
  const shown = await page.evaluate(() => {
    const o = document.querySelector('#overlay-layer');
    return !!o && !o.classList.contains('hidden') && !!o.querySelector('.sheet, .choices');
  });
  if (!shown) break;
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#overlay-layer .btn, #overlay-layer .choice')];
    const c = btns.find(x => /取消|跳过|关闭|不要|返回/.test(x.textContent));
    if (c) c.click();
  });
  await page.waitForTimeout(220);
}
await page.evaluate(async () => {
  window.DEBUG_SPEED = 0;
  await window.app.enterNode(window.app.run.map.startNodes[0]);
  await new Promise(r => setTimeout(r, 80));
  window.app.run.potions[0] = 'FIRE_POTION';
  window.app.renderCombat();
});
await page.waitForTimeout(400);
const box = await page.evaluate(() => {
  const r = document.querySelector('[data-potion="0"]').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.waitForTimeout(600);
await page.mouse.up();
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/potion-info.png' });
console.log(await page.evaluate(() => ({
  title: document.querySelector('.kw-title')?.textContent,
  body: document.querySelector('.kw-body')?.textContent.replace(/\s+/g, ' ').slice(0, 80),
  pots: window.app.run.potions.filter(Boolean).length,
})));
await b.close();
