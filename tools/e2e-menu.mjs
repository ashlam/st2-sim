/** 战斗 / 地图的 ☰ 菜单：牌组、记录、返回标题、放弃本局 */
import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 8081;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('CONSOLE: ' + m.text()); });

const ok = [];
const bad = [];
const t = (name, cond, extra = '') => (cond ? ok : bad).push(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
const q = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const txt = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent.trim() || '', sel);
const overlayOpen = () => page.evaluate(() => !document.querySelector('#overlay-layer').classList.contains('hidden'));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(180);
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(280);
await page.evaluate(() => document.querySelectorAll('#anc-list .choice')[0]?.click());
await page.waitForTimeout(380);
for (let i = 0; i < 4; i++) {
  if (!(await overlayOpen())) break;
  await page.evaluate(() => document.querySelector('#sel-cancel, #close-deck')?.click());
  await page.waitForTimeout(160);
}
// 先古可能顺带弹奖励/选牌，全部关掉回到地图
for (let i = 0; i < 4; i++) {
  if (!(await overlayOpen())) break;
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#overlay-layer .btn')].find(x => /跳过|关闭|取消|不要/.test(x.textContent));
    (btn || document.querySelector('#overlay-layer .btn'))?.click();
  });
  await page.waitForTimeout(160);
}

/* ---------- 1) 地图上的菜单入口 ---------- */
t('地图界面有 ☰ 菜单按钮', await q('.map-screen #open-menu'));
const floor0 = await page.evaluate(() => window.app.run.floor);
await page.click('.map-screen #open-menu');
await page.waitForTimeout(200);
const menuTitle = await txt('#overlay-layer .sheet-title');
t('点 ☰ 打开菜单', /菜单/.test(menuTitle), menuTitle);
const rows = await page.evaluate(() => [...document.querySelectorAll('#menu-list [data-menu]')].map(x => x.dataset.menu));
t('菜单里有牌组 / 返回标题 / 放弃本局', ['deck', 'exit', 'abandon'].every(k => rows.includes(k)), rows.join(','));
t('地图上的菜单没有战斗记录', !rows.includes('log'));
t('菜单显示血量与金币', /❤/.test(await txt('#overlay-layer .sheet-sub')), await txt('#overlay-layer .sheet-sub'));
t('菜单底部有「继续游戏」', await q('#menu-close'));

/* ---------- 2) 牌组入口 ---------- */
await page.evaluate(() => document.querySelector('[data-menu="deck"]').click());
await page.waitForTimeout(180);
t('菜单能打开牌组', /牌组/.test(await txt('#overlay-layer .sheet-title')));
await page.evaluate(() => document.querySelector('#close-deck')?.click());
await page.waitForTimeout(150);
t('关掉牌组后回到地图', !(await overlayOpen()) && (await q('.map-screen')));

/* ---------- 3) 返回标题：会存档 ---------- */
await page.click('.map-screen #open-menu');
await page.waitForTimeout(180);
await page.evaluate(() => document.querySelector('[data-menu="exit"]').click());
await page.waitForTimeout(180);
t('返回标题先弹确认', await q('.cfm-pop'));
await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok').click());
await page.waitForTimeout(250);
t('回到标题页', await q('.title-screen'));
const contText = await txt('[data-act="continue"]');
t('标题页有「继续攀登」', !!contText, contText);
const savedFloor = await page.evaluate(() => JSON.parse(localStorage.getItem('sts2sim.run.v1')).floor);
t('地图退出会写存档', savedFloor === floor0, `save.floor=${savedFloor} 当前层=${floor0}`);

await page.evaluate(() => document.querySelector('[data-act="continue"]').click());
await page.waitForTimeout(250);
t('继续能回到地图', await q('.map-screen'));

/* ---------- 4) 战斗里的菜单 ---------- */
const node = await page.evaluate(() => {
  const el = document.querySelector('.map-node.available');
  return el ? { id: el.dataset.node, floor: window.app.run.floor } : null;
});
await page.evaluate(() => document.querySelector('.map-node.available').click());
await page.waitForTimeout(500);
const inCombat = await q('.combat-screen');
t('进入战斗', inCombat);
t('战斗界面有 ☰ 菜单按钮', await q('.combat-screen #open-menu'));
await page.click('.combat-screen #open-menu');
await page.waitForTimeout(200);
const crows = await page.evaluate(() => [...document.querySelectorAll('#menu-list [data-menu]')].map(x => x.dataset.menu));
t('战斗菜单多了「战斗记录」', crows.includes('log'), crows.join(','));
t('战斗菜单提示进度不保存', /不会保存/.test(await page.evaluate(() => document.querySelector('[data-menu="exit"] .d').textContent)));

await page.evaluate(() => document.querySelector('[data-menu="log"]').click());
await page.waitForTimeout(250);
t('战斗记录能打开', await q('.log-modal'));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.log-modal .btn, .log-modal button')].pop();
  btn?.click();
});
await page.waitForTimeout(200);
// 战斗记录是叠在菜单之上的独立层，关掉它菜单还在
await page.evaluate(() => document.querySelector('#menu-close')?.click());
await page.waitForTimeout(180);

/* ---------- 5) 战斗里返回标题：不存档，下一次从这层之前重走 ---------- */
await page.click('.combat-screen #open-menu');
await page.waitForTimeout(180);
await page.evaluate(() => document.querySelector('[data-menu="exit"]').click());
await page.waitForTimeout(180);
await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok').click());
await page.waitForTimeout(300);
t('战斗里退出也回标题', await q('.title-screen'));
const savedFloor2 = await page.evaluate(() => JSON.parse(localStorage.getItem('sts2sim.run.v1')).floor);
t('战斗退出不写盘（存档停在这一层之前）', savedFloor2 === node.floor, `save.floor=${savedFloor2} 进战斗前=${node.floor}`);

await page.evaluate(() => document.querySelector('[data-act="continue"]').click());
await page.waitForTimeout(300);
const back = await page.evaluate((id) => ({
  map: !!document.querySelector('.map-screen'),
  floor: window.app.run.floor,
  avail: !!document.querySelector(`.map-node[data-node="${id}"]`)?.classList.contains('available'),
}), node.id);
t('继续后回到这一层之前', back.map && back.floor === node.floor, `floor=${back.floor}`);
t('那一格重新可走（战斗会重来）', back.avail);

/* ---------- 6) 放弃本局：删档 ---------- */
await page.click('.map-screen #open-menu');
await page.waitForTimeout(180);
await page.evaluate(() => document.querySelector('[data-menu="abandon"]').click());
await page.waitForTimeout(180);
t('放弃本局先弹确认', await q('.cfm-pop'));
await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok').click());
await page.waitForTimeout(280);
t('放弃后回到标题', await q('.title-screen'));
t('放弃后没有「继续攀登」', !(await q('[data-act="continue"]')));
t('放弃后存档被删', !(await page.evaluate(() => !!localStorage.getItem('sts2sim.run.v1'))));

console.log(ok.join('\n'));
if (bad.length) { console.log('\n--- 失败 ---'); console.log(bad.join('\n')); }
console.log(`\n${ok.length} 通过 / ${bad.length} 失败`);
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await b.close();
process.exit(bad.length || errs.length ? 1 : 0);
