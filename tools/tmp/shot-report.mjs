import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C://Program Files//Google//Chrome//Application//chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.waitForTimeout(300);
await page.evaluate(() => {
  window.DEBUG_SPEED = 0;
  window.app.startRun('IRONCLAD', 0);
});
await page.waitForTimeout(300);
await page.click('#anc-list .choice');
await page.waitForTimeout(400);
await page.evaluate(() => {
  const app = window.app;
  const run = app.run;
  const seed = [
    { floor: 1, act: 1, kind: 'normal', label: '普通', enemies: ['淤泥旋螺'], turns: 2, won: true, hpStart: 80, hpEnd: 74, dealt: 38, taken: 6 },
    { floor: 3, act: 1, kind: 'normal', label: '普通', enemies: ['噬尸蛞蝓', '噬尸蛞蝓'], turns: 4, won: true, hpStart: 74, hpEnd: 61, dealt: 52, taken: 13 },
    { floor: 6, act: 1, kind: 'elite', label: '精英', enemies: ['哨卫', '哨卫'], turns: 6, won: true, hpStart: 61, hpEnd: 44, dealt: 96, taken: 17 },
    { floor: 8, act: 1, kind: 'event', label: '事件', enemies: ['扭动虫', '扭动虫', '扭动虫', '扭动虫'], turns: 5, won: true, hpStart: 44, hpEnd: 33, dealt: 78, taken: 11 },
    { floor: 9, act: 1, kind: 'boss', label: '首领', enemies: ['六角恶魔'], turns: 11, won: false, hpStart: 33, hpEnd: 0, dealt: 121, taken: 33 },
  ];
  run.battles = seed;
  run.floor = 9;
  run.stats.combats = 4;
  run.stats.elites = 1;
  run.gold = 217;
  app.showGameOver(false);
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/report-result.png' });
await page.click('#open-report');
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/report-panel.png' });
await b.close();
console.log('done');
