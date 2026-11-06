/**
 * 亡灵契约师 UI 端到端：选人 → 战斗（奥斯提栏）→ 禁忌魔典战后移除
 * 需要先在 8081 端口起服务：PORT=8081 node tools/serve.mjs
 */
import { chromium } from 'playwright-core';
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE: ' + m.text()); });

let pass = 0;
const fails = [];
const ok = (cond, label, extra = '') => { if (cond) pass++; else fails.push(label + (extra ? ` — ${extra}` : '')); };

await page.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await page.waitForTimeout(300);
await page.click('[data-act="new"]'); await page.waitForTimeout(250);
ok(await page.$('[data-char="NECROBINDER"]') !== null, '选人界面有亡灵契约师');

await page.click('[data-char="NECROBINDER"]'); await page.waitForTimeout(220);
const asc = await page.$('#asc-list .choice'); if (asc) await asc.click();
await page.waitForTimeout(220);

async function clearOverlays() {
  for (let i = 0; i < 8; i++) {
    const done = await page.evaluate(() => {
      const ov = document.querySelector('.overlay-layer:not(.hidden)');
      if (!ov) return 'none';
      const btn = ov.querySelector('#skip-reward, #take-treasure, #leave-shop, #sel-confirm, #close-deck, #close-pile, #rm-cancel, .btn');
      if (btn) { btn.click(); return 'btn'; }
      const choice = ov.querySelector('#neow-list .choice, .choice');
      if (choice) { choice.click(); return 'choice'; }
      return 'stuck';
    });
    if (done === 'none' || done === 'stuck') return done;
    await page.waitForTimeout(240);
  }
  return 'done';
}
await clearOverlays();
ok(await page.evaluate(() => window.app.run && window.app.run.charId === 'NECROBINDER'), '开局角色为亡灵契约师');

// 找一场战斗
for (let i = 0; i < 20; i++) {
  if (await page.$('.combat-screen')) break;
  await clearOverlays();
  if (await page.$('.combat-screen')) break;
  const node = await page.$('.map-node.available');
  if (!node) break;
  await node.click();
  await page.waitForTimeout(320);
}
await page.waitForTimeout(300);
ok(await page.$('.combat-screen') !== null, '进入战斗');
ok(await page.$('.osty-row') !== null, '战斗界面有奥斯提栏');
const ostyHp = await page.evaluate(() => window.app.combat?.necro?.osty.hp);
ok(ostyHp === 1, '缚魂命匣开战召唤 1 点生命的奥斯提', String(ostyHp));

// 打一张召唤牌让奥斯提变大
const summoned = await page.evaluate(async () => {
  const c = window.app.combat;
  await c.necro.summon(6);
  window.app.renderCombat();
  return c.necro.osty.hp;
});
ok(summoned === 7, '召唤后奥斯提 7 点生命', String(summoned));
ok((await page.textContent('.osty-row')).includes('7 / 7'), '界面显示 7 / 7');

// 给自己挂禁忌魔典，然后清场触发战后移除
await page.evaluate(async () => {
  const c = window.app.combat;
  c.player.powers.forbiddenGrimoire = 1;
  for (const e of c.alive()) await c.dealDamage(e, 99999, {});
  window.app.onCombatFinished();
});
await page.waitForTimeout(900);
const rewardTxt = await page.evaluate(() => document.querySelector('.overlay-layer:not(.hidden)')?.textContent || '');
ok(rewardTxt.includes('战利品'), '弹出战利品面板');
ok(rewardTxt.includes('移除一张牌'), '战利品里提示禁忌魔典的移除奖励', rewardTxt.slice(0, 80));

const deckBefore = await page.evaluate(() => window.app.run.deck.length);
await page.evaluate(() => document.querySelector('#skip-reward').click());
await page.waitForTimeout(600);
const rmOpen = await page.evaluate(() => (document.querySelector('.overlay-layer:not(.hidden)')?.textContent || '').includes('选择要移除的牌'));
ok(rmOpen, '点继续后弹出移除牌面板');
if (rmOpen) {
  await page.evaluate(() => document.querySelector('#rm-grid [data-uid]').click());
  await page.waitForTimeout(500);
}
const deckAfter = await page.evaluate(() => window.app.run.deck.length);
ok(deckAfter === deckBefore - 1, '牌组少了一张', `${deckBefore} → ${deckAfter}`);
ok(await page.evaluate(() => !!document.querySelector('.map-node, .combat-screen, .rest-screen')), '回到地图');

console.log(`通过 ${pass} 项`);
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); console.log('errors:', errors.join('\n') || 'none'); process.exit(1); }
if (errors.length) { console.log('errors:', errors.join('\n')); process.exit(1); }
console.log('OK');
await browser.close();
