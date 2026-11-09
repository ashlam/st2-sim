import { chromium } from 'playwright-core';
const CHROME = 'C://Program Files//Google//Chrome//Application//chrome.exe';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
await page.click('#anc-list .choice');
await page.waitForTimeout(400);

// 事件页（带 [gold] 的那段文字）
await page.evaluate(() => window.app.renderEvent('COLORFUL_PHILOSOPHERS'));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/run-event.png' });

// 遗物详情（带 [red]/[gold]）
await page.evaluate(() => { window.app.clearOverlay(); window.app.showRelicInfo('NEOWS_TALISMAN'); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/run-relicinfo.png' });

const raw = await page.evaluate(() => {
  const txt = document.body.innerText;
  return { rawTags: (txt.match(/\[\/?(gold|red|purple|b|i|sine)\]/g) || []).length };
});
console.log('剩余未渲染标记:', raw.rawTags);
console.log('errors:', errs.length ? errs.slice(0, 3) : 'none');
await b.close();
