import { chromium } from 'playwright-core';
const CHROME = 'C://Program Files//Google//Chrome//Application//chrome.exe';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/run-title.png' });

// 新开局：角色选择
await page.evaluate(() => window.app.showCharSelect?.());
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/run-charselect.png' });

// 真实开局
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/run-ancient.png' });
const anc = await page.evaluate(() => ({
  title: document.querySelector('#anc-title')?.textContent,
  opts: [...document.querySelectorAll('#anc-list .choice')].map((e) => e.textContent.trim().slice(0, 40)),
}));

await page.click('#anc-list .choice');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/run-map.png' });

// 进一场战斗
const st = await page.evaluate(async () => {
  const a = window.app;
  const node = a.run.map?.nodes.find((n) => n.type === 'monster');
  a.startCombat('normal');
  return { nodeType: node?.type, screen: a.screen };
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/run-combat.png' });

const info = await page.evaluate(() => {
  const a = window.app;
  const C = a.combat;
  return {
    screen: a.screen,
    hp: `${a.run.hp}/${a.run.maxHp}`,
    relics: a.run.relics.length,
    deck: a.run.deck.length,
    enemies: C ? C.enemies.map((e) => `${e.name} ${e.hp}/${e.maxHp}`) : null,
    hand: C ? C.hand.length : null,
    energy: C ? `${C.energy}/${C.maxEnergy}` : null,
  };
});

console.log('先古:', anc.title, anc.opts);
console.log('进战斗:', JSON.stringify(st));
console.log('状态:', JSON.stringify(info));
console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
await b.close();
