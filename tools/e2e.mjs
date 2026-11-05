/** 用本机 Chrome 做端到端验收：截图 + 收集控制台错误 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = `http://localhost:${process.env.PORT || 8081}/index.html`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'shots/01-title.png' });

// 新游戏
await page.click('[data-act="new"]'); await page.waitForTimeout(250); await page.click('[data-char="IRONCLAD"]');
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/02-asc.png' });
await page.click('#asc-list .choice');
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/03-neow.png' });

// 选第一个祝福
await page.click('#neow-list .choice');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/04-map.png' });

// 进入第一个可用节点
const node = await page.$('.map-node.available');
if (node) {
  await node.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/05-combat.png' });
}

// 打几张牌
const cards = await page.$$('.hand .card:not(.disabled)');
if (cards.length) { await cards[0].click(); await page.waitForTimeout(200); await page.screenshot({ path: 'shots/06-selected.png' }); }
const enemy = await page.$('[data-enemy]');
if (enemy) { await enemy.click(); await page.waitForTimeout(900); await page.screenshot({ path: 'shots/07-played.png' }); }

console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
