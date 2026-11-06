import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
await page.goto(`http://localhost:${process.env.PORT || 8081}/index.html`, { waitUntil: 'load' });
await page.click('[data-act="new"]'); await page.waitForTimeout(250); await page.click('[data-char="IRONCLAD"]');
await page.waitForTimeout(300);
await page.click('#asc-list .choice >> nth=9');   // 野心 9
await page.waitForTimeout(400);
console.log('neow?', !!(await page.$('#neow-list')));
await page.click('#neow-list .choice');
await page.waitForTimeout(600);
console.log('run?', await page.evaluate(() => !!window.app.run), 'overlay?', await page.evaluate(() => !document.querySelector('.overlay-layer').classList.contains('hidden')));
const before = await page.evaluate(() => { const r = window.app.run; return r ? { seed: r.seed, hp: r.hp, deck: r.deck.length, asc: r.asc, bosses: r.bossQueue.length } : null; });
await page.evaluate(() => window.app.save());
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(400);
const hasContinue = await page.$('[data-act="continue"]');
if (hasContinue) await hasContinue.click();
await page.waitForTimeout(500);
const after = await page.evaluate(() => { const r = window.app.run; return r ? { seed: r.seed, hp: r.hp, deck: r.deck.length, asc: r.asc, bosses: r.bossQueue.length } : null; });
console.log('before', JSON.stringify(before));
console.log('after ', JSON.stringify(after));
// 牌组视图
await page.click('#deck-btn');
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/30-deck.png' });
const deckCount = await page.$$eval('#deck-btn', () => 1).catch(() => 0);
await page.click('#close-deck');
// 野心 9 的双 Boss 队列检查
console.log('boss queue len:', after.bosses, '(asc>=10 应为 2)');
console.log('errors:', errs.length ? errs.join(' | ') : 'none');
await b.close();
