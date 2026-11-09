/** 商店：商品摘要、点开详情、确认购买、金币不足/药水栏满的提示 */
import { chromium } from 'playwright-core';

const b = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(`http://localhost:${process.env.PORT || 8081}/index.html`, { waitUntil: 'load' });
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
await page.evaluate(() => { window.app.run.gold = 400; window.app.showShop(); });
await page.waitForTimeout(350);
await page.screenshot({ path: 'shots/80-shop.png' });

const rows = await page.evaluate(() => [...document.querySelectorAll('.shop-item')].map((el) => ({
  name: el.querySelector('.shop-name')?.innerText.replace(/\n/g, ' '),
  desc: el.querySelector('.shop-desc')?.innerText.slice(0, 40),
  price: el.querySelector('.price')?.innerText,
  more: el.querySelector('.shop-more')?.innerText,
})));
console.log('商品行:');
for (const r of rows) console.log(' -', r.name, '|', r.price, '|', r.more, '|', r.desc);

// 点第一张卡牌 → 详情
await page.evaluate(() => document.querySelector('[data-buy-card="0"]').click());
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/81-shop-card.png' });
const cardDetail = await page.evaluate(() => ({
  title: document.querySelector('.shop-detail-title')?.textContent,
  body: document.querySelector('.shop-detail-body')?.innerText.replace(/\n+/g, ' | '),
  buy: document.querySelector('#shop-buy')?.innerText,
  disabled: document.querySelector('#shop-buy')?.disabled,
}));
console.log('卡牌详情:', JSON.stringify(cardDetail));

// 确认购买
const before = await page.evaluate(() => ({ gold: window.app.run.gold, deck: window.app.run.deck.length }));
await page.evaluate(() => document.querySelector('#shop-buy').click());
await page.waitForTimeout(350);
const after = await page.evaluate(() => ({ gold: window.app.run.gold, deck: window.app.run.deck.length, mask: !!document.querySelector('#shop-detail-mask') }));
console.log('购买:', JSON.stringify(before), '→', JSON.stringify(after));
await page.screenshot({ path: 'shots/82-shop-bought.png' });

// 遗物详情
await page.evaluate(() => document.querySelector('[data-buy-relic="0"]').click());
await page.waitForTimeout(250);
console.log('遗物详情:', await page.evaluate(() => document.querySelector('.shop-detail-title')?.textContent + ' | ' + document.querySelector('.shop-detail-body')?.innerText.replace(/\n+/g, ' | ')));
await page.screenshot({ path: 'shots/83-shop-relic.png' });
await page.evaluate(() => document.querySelector('#shop-cancel').click());
await page.waitForTimeout(150);

// 药水详情
await page.evaluate(() => document.querySelector('[data-buy-potion="0"]').click());
await page.waitForTimeout(200);
console.log('药水详情:', await page.evaluate(() => document.querySelector('.shop-detail-title')?.textContent + ' | ' + document.querySelector('.shop-detail-body')?.innerText.replace(/\n+/g, ' | ')));
await page.evaluate(() => document.querySelector('#shop-cancel').click());
await page.waitForTimeout(150);

// 金币不足
await page.evaluate(() => { window.app.run.gold = 5; window.app.showShop(); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/84-shop-poor.png' });
const poor = await page.evaluate(() => ({
  poorRows: document.querySelectorAll('.shop-item.poor').length,
  firstMore: document.querySelector('.shop-item.poor .shop-more')?.textContent,
}));
console.log('买不起:', JSON.stringify(poor));
await page.evaluate(() => document.querySelector('[data-buy-card="1"]').click());
await page.waitForTimeout(220);
const poorDetail = await page.evaluate(() => ({
  buy: document.querySelector('#shop-buy')?.innerText,
  disabled: document.querySelector('#shop-buy')?.disabled,
  note: document.querySelector('.shop-detail-note')?.textContent,
}));
console.log('买不起详情:', JSON.stringify(poorDetail));
await page.screenshot({ path: 'shots/85-shop-poor-detail.png' });
await page.evaluate(() => document.querySelector('#shop-cancel').click());

// 药水栏满
await page.evaluate(() => {
  const app = window.app;
  app.run.gold = 400;
  app.run.potions = ['FIRE_POTION', 'FIRE_POTION', 'FIRE_POTION'];
  app.showShop();
});
await page.waitForTimeout(300);
console.log('栏位满标记:', await page.evaluate(() => document.querySelector('.shop-tag.warn')?.textContent || '无'));
await page.evaluate(() => document.querySelector('[data-buy-potion="0"]').click());
await page.waitForTimeout(220);
console.log('栏位满详情:', await page.evaluate(() => ({
  buy: document.querySelector('#shop-buy')?.innerText,
  disabled: document.querySelector('#shop-buy')?.disabled,
  note: document.querySelector('.shop-detail-note')?.textContent,
})).then(JSON.stringify));
await page.screenshot({ path: 'shots/86-shop-potion-full.png' });

// ===== 移除牌服务（走详情确认 → 选牌面板） =====
await page.evaluate(() => document.querySelector('#shop-cancel')?.click());
await page.evaluate(() => {
  window.app.run.potions = [null, null, null];
  window.app.run.gold = 400;
  window.app.showShop();
});
await page.waitForTimeout(250);
const beforeRemove = await page.evaluate(() => ({ gold: window.app.run.gold, deck: window.app.run.deck.length }));
await page.evaluate(() => document.querySelector('[data-remove-card]').click());
await page.waitForTimeout(200);
console.log('移除服务详情:', await page.evaluate(() => document.querySelector('.shop-detail-title')?.textContent + ' | ' + document.querySelector('#shop-buy')?.innerText));
await page.screenshot({ path: 'shots/87-shop-remove.png' });
await page.evaluate(() => document.querySelector('#shop-buy').click());
await page.waitForTimeout(350);
console.log('选牌面板出现:', await page.evaluate(() => !!document.querySelector('#sel-grid')));
await page.evaluate(() => document.querySelector('#sel-grid [data-uid]').click());
await page.waitForTimeout(200);
console.log('删牌确认层:', await page.evaluate(() => !!document.querySelector('.cfm-pop')));
await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok')?.click());
await page.waitForTimeout(400);
const afterRemove = await page.evaluate(() => ({
  gold: window.app.run.gold,
  deck: window.app.run.deck.length,
  sold: !!document.querySelector('.shop-item.sold[data-remove-card]'),
  shopBack: !!document.querySelector('#leave-shop'),
}));
console.log('移除牌:', JSON.stringify(beforeRemove), '→', JSON.stringify(afterRemove));

// ===== 买完不弹回顶部 =====
await page.evaluate(() => {
  window.app.run.gold = 900;
  window.app.run.potions = [null, null, null];
  window.app.showShop();
  document.querySelector('.sheet').scrollTop = 400;
});
await page.waitForTimeout(250);
await page.evaluate(() => document.querySelector('[data-buy-potion="0"]').click());
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelector('#shop-buy').click());
await page.waitForTimeout(400);
console.log('购买后滚动位置:', await page.evaluate(() => document.querySelector('.sheet').scrollTop), '（应远离顶部，不被弹回 0）');

console.log('errors:', errs.length ? errs.join(' / ') : 'none');
await b.close();
