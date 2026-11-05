/**
 * 战利品回归：
 * ① 只选卡牌 → 点「继续」时，金币和遗物必须自动到账（历史 bug：点了继续就丢掉）
 * ② 先点金币/遗物 → 再点继续，不能重复发放
 * ③ 战报里敌人行动名可点，能打开招式说明
 */
import { chromium } from 'playwright-core';

const b = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
await page.evaluate(async () => { await window.app.enterNode(window.app.run.map.startNodes[0]); });
await page.waitForTimeout(400);

/* ---------- 战报：敌人行动 ---------- */
await page.evaluate(async () => { await window.app.combat.endTurn(); window.app.renderCombat(); });
await page.waitForTimeout(700);
await page.evaluate(() => window.app.showCombatLog());
await page.waitForTimeout(300);

const logRows = await page.evaluate(() => [...document.querySelectorAll('.log-modal .log-line.lg-enemy')].map(el => {
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), text: el.innerText.replace(/\n/g, ' ') };
}));
console.log('① 敌人行动行:', JSON.stringify(logRows));
const wide = logRows.every(r => r.w > 200);
console.log('   行宽正常(未被 96px 敌人卡样式挤断):', wide, '| 有招名链接:',
  await page.evaluate(() => !!document.querySelector('.log-modal .kwl[data-kw-kind="move"]')));

const mvTitle = await page.evaluate(() => {
  document.querySelector('.log-modal .kwl[data-kw-kind="move"]')?.click();
  return 1;
});
await page.waitForTimeout(250);
const mvPanel = await page.evaluate(() => document.querySelector('.kw-pop')?.innerText.replace(/\n+/g, ' | ') || '无');
console.log('   招式面板:', mvPanel.slice(0, 120));
await page.evaluate(() => {
  document.querySelector('.kw-pop .kw-close')?.click();
  document.querySelector('.log-modal [data-lg="close"]')?.click();
});
await page.waitForTimeout(200);

/* ---------- 场景①：只选卡牌，点继续 ---------- */
const s1 = await page.evaluate(() => {
  const app = window.app;
  const relic = app.run.rollRelic();
  window.__done = false;
  window.__before = { gold: app.run.gold, relics: app.run.relics.slice() };
  app.showRewards(
    [{ kind: 'gold', amount: 25 }, { kind: 'relic', id: relic }, { kind: 'cards', ids: app.run.deck.slice(0, 3).map(x => x.id) }],
    () => { window.__done = true; },
  );
  return { gold: app.run.gold, relic, tip: document.querySelector('#reward-tip')?.textContent };
});
await page.waitForTimeout(200);
await page.evaluate(() => { document.querySelector('#card-reward [data-uid]')?.click(); });
await page.waitForTimeout(150);
await page.evaluate(() => { document.querySelector('#skip-reward')?.click(); });
await page.waitForTimeout(300);
const s1after = await page.evaluate(() => ({ gold: window.app.run.gold, relics: window.app.run.relics.slice(), done: window.__done }));
console.log('② 只选卡牌后继续 → 金币+25:', s1after.gold === s1.gold + 25, '| 遗物到账:', s1after.relics.includes(s1.relic), '| 流程继续:', s1after.done);

/* ---------- 场景②：先领金币/遗物，再继续（不重复） ---------- */
const s2 = await page.evaluate(() => {
  const app = window.app;
  const relic = app.run.rollRelic();
  window.__done = false;
  app.showRewards(
    [{ kind: 'gold', amount: 30 }, { kind: 'relic', id: relic }, { kind: 'cards', ids: app.run.deck.slice(0, 3).map(x => x.id) }],
    () => { window.__done = true; },
  );
  return { gold: app.run.gold, relic };
});
await page.waitForTimeout(200);
await page.evaluate(() => {
  document.querySelectorAll('#loot-list [data-reward]').forEach(el => el.click());
});
await page.waitForTimeout(200);
const mid = await page.evaluate(() => ({ gold: window.app.run.gold, relics: window.app.run.relics.length, tip: document.querySelector('#reward-tip')?.textContent }));
await page.evaluate(() => { document.querySelector('#skip-reward')?.click(); });
await page.waitForTimeout(300);
const s2after = await page.evaluate(() => ({ gold: window.app.run.gold, relics: window.app.run.relics.length }));
console.log('③ 先点领取 → 金币+30:', mid.gold === s2.gold + 30, '| 继续后不重复:', s2after.gold === mid.gold && s2after.relics === mid.relics, '| 提示:', mid.tip);

console.log('errors:', errs.length ? errs.join(' / ') : 'none');
await b.close();
