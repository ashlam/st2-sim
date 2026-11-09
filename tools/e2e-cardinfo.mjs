/**
 * 长按看牌回归：
 * ① 战斗中长按手牌 → 弹出卡牌详情，且松手不会把牌打出去（也不会进入选中态）
 * ② 详情里点关键词 → 弹出该关键词的说明
 * ③ 卡牌奖励长按 → 看详情；点选后只有被选中的那张高亮，其余淡化（不再整片变黑）
 * ④ 商店卡牌长按 → 看详情
 */
import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 8081;
const b = await chromium.launch({ executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const center = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, sel);

async function longPress(sel, ms = 650) {
  const pt = await center(sel);
  if (!pt) throw new Error('找不到元素: ' + sel);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  const open = await page.evaluate(() => !!document.querySelector('.kw-pop'));
  await page.mouse.up();
  await page.waitForTimeout(180);
  return open;
}

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
// 涅奥的祝福选金币，避免后续弹移除/升级
await page.click('#anc-list .choice');
await page.waitForTimeout(300);
await page.evaluate(async () => {
  const node = window.app.run.map.nodes.find(n => n.type === 'monster');
  await window.app.enterNode(node);
});
await page.waitForTimeout(600);

/* ---------- ① 手牌长按 ---------- */
const handBefore = await page.evaluate(() => ({ n: window.app.combat.hand.length, e: window.app.combat.player.energy }));
const opened = await longPress('.hand .card');
const popTitle = await page.evaluate(() => document.querySelector('.kw-pop .kw-title')?.textContent || '');
const kwCount = await page.evaluate(() => document.querySelectorAll('.kw-pop .card-text .kwl').length);
console.log('① 长按手牌弹出详情:', opened, '| 标题:', popTitle, '| 卡面可点关键词数:', kwCount);
const afterLong = await page.evaluate(() => ({
  n: window.app.combat.hand.length,
  e: window.app.combat.player.energy,
  sel: window.app.selectedCard ? window.app.selectedCard.name : null,
}));
console.log('   松手没误出牌:', afterLong.n === handBefore.n && afterLong.e === handBefore.e, '| 没进入选中态:', afterLong.sel === null);

/* ---------- ② 详情里点关键词（换一张文本里带关键词的牌） ---------- */
const kwHit = await page.evaluate(() => {
  const app = window.app;
  app.closeInfo();
  for (const id of ['BASH', 'DEFEND_IRONCLAD', 'SHRUG_IT_OFF']) {
    app.showCardInfo(id);
    const n = document.querySelectorAll('.kw-pop .kw-cardwrap .kwl').length;
    if (n > 0) {
      const before = document.querySelector('.kw-pop .kw-title')?.textContent || '';
      document.querySelector('.kw-pop .kw-cardwrap .kwl').click();
      const after = document.querySelector('.kw-pop .kw-title')?.textContent || '';
      return { id, n, before, after, body: (document.querySelector('.kw-pop .kw-body')?.innerText || '').replace(/\s+/g, ' ').slice(0, 50) };
    }
  }
  return null;
});
await page.waitForTimeout(150);
console.log('② 卡面关键词可点:', !!kwHit, kwHit ? `${kwHit.before} → ${kwHit.after}（${kwHit.body}）` : '没找到带关键词的牌');
await page.evaluate(() => window.app.closeInfo());

/* ---------- 短按仍然能出牌 ---------- */
const tapSel = await page.evaluate(() => {
  const el = document.querySelector('.hand .card:not(.disabled)') || document.querySelector('.hand .card');
  el?.click();
  return window.app.selectedCard ? window.app.selectedCard.name : null;
});
await page.evaluate(() => { window.app.selectedCard = null; window.app.renderCombat(); });
console.log('   短按仍可选中手牌:', !!tapSel, tapSel || '');

/* ---------- ③ 卡牌奖励 ---------- */
await page.evaluate(() => {
  const app = window.app;
  app.showRewards(
    [{ kind: 'gold', amount: 20 }, { kind: 'cards', ids: app.run.deck.slice(0, 3).map(x => x.id) }],
    () => {},
  );
});
await page.waitForTimeout(250);
const rewardOpen = await longPress('#card-reward .card');
const rewardTitle = await page.evaluate(() => document.querySelector('.kw-pop .kw-title')?.textContent || '');
const deckBefore = await page.evaluate(() => window.app.run.deck.length);
console.log('③ 奖励卡长按看详情:', rewardOpen, '| 标题:', rewardTitle, '| 没顺手选走:', deckBefore);
await page.evaluate(() => window.app.closeInfo());
await page.waitForTimeout(120);

/* ---------- ③b 选择卡牌的二次确认 ---------- */
const deckBeforePick = await page.evaluate(() => window.app.run.deck.length);
await page.evaluate(() => document.querySelector('#card-reward .card')?.click());
await page.waitForTimeout(200);
const cfm = await page.evaluate(() => ({
  shown: !!document.querySelector('.cfm-pop'),
  title: document.querySelector('.cfm-title')?.textContent || '',
  deck: window.app.run.deck.length,
}));
console.log('   选择前有确认层:', cfm.shown, '| 标题:', cfm.title, '| 未确认不落地:', cfm.deck === deckBeforePick);
await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok')?.click());
await page.waitForTimeout(250);
const pick = await page.evaluate(() => ({
  picked: document.querySelectorAll('#card-reward .card.picked').length,
  unpicked: document.querySelectorAll('#card-reward .card.unpicked').length,
  gridOpacity: document.querySelector('#card-reward').style.opacity || '1',
  deck: window.app.run.deck.length,
  btn: document.querySelector('#skip-reward')?.textContent,
}));
console.log('   选中后标记:', JSON.stringify(pick), '→ 只有一张高亮:', pick.picked === 1 && pick.unpicked === 2 && pick.gridOpacity === '1');

/* ---------- ④ 商店 ---------- */
await page.evaluate(() => { window.app.clearOverlay(); window.app.showShop(); });
await page.waitForTimeout(250);
const shopOpen = await longPress('[data-buy-card]');
const shopTitle = await page.evaluate(() => document.querySelector('.kw-pop .kw-title')?.textContent || '');
const shopSheetAlive = await page.evaluate(() => !!document.querySelector('.sheet'));
console.log('④ 商店卡牌长按看详情:', shopOpen, '| 标题:', shopTitle, '| 商店页还在:', shopSheetAlive);

console.log('errors:', errs.length ? errs.join(' / ') : 'none');
await b.close();
