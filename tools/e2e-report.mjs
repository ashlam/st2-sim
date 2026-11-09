/**
 * 本轮的两个人机交互回归：
 *  ① 战斗里长按药水 = 看说明（而不是用掉）；短按仍然使用
 *  ② 失败结算页有「查看战报」入口，战报能列出逐场战斗并翻出战斗记录
 * 需要先起服务：PORT=8081 node tools/serve.mjs
 */
import { chromium } from 'playwright-core';

const PORT = process.env.PORT || '8081';
const b = await chromium.launch({
  executablePath: 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  window.__rejects = [];
  window.addEventListener('unhandledrejection', e => window.__rejects.push(String(e.reason?.message || e.reason)));
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

let pass = 0;
const fails = [];
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fails.push(`${label} ${extra}`); console.log('  ✗', label, extra); }
};

/** 先古遗物可能带「拾起时选牌」的延迟任务，选完先古后它才弹面板，会盖住后面的战斗界面 */
async function dismissOverlays() {
  for (let i = 0; i < 5; i++) {
    const shown = await page.evaluate(() => {
      const o = document.querySelector('#overlay-layer');
      return !!o && !o.classList.contains('hidden') && !!o.querySelector('.sheet, .choices');
    });
    if (!shown) return;
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#overlay-layer .btn, #overlay-layer .choice')];
      const cancel = btns.find(x => /取消|跳过|关闭|不要|返回/.test(x.textContent));
      if (cancel) cancel.click();
    });
    await page.waitForTimeout(220);
  }
}

async function newCombat() {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(200);
  await page.click('[data-act="new"]'); await page.waitForTimeout(200);
  await page.click('[data-char="IRONCLAD"]'); await page.waitForTimeout(160);
  await page.click('#asc-list .choice'); await page.waitForTimeout(180);
  await page.click('#anc-list .choice'); await page.waitForTimeout(600);
  await dismissOverlays();
  await page.evaluate(async () => {
    window.DEBUG_SPEED = 0;
    window.__rejects.length = 0;
    const app = window.app;
    await app.enterNode(app.run.map.startNodes[0]);
    await new Promise(r => setTimeout(r, 80));
  });
  await page.waitForTimeout(300);
  await dismissOverlays();
}

/* ---------------- ① 长按药水 ---------------- */
console.log('① 长按药水看说明');
await newCombat();
await page.evaluate(() => {
  const app = window.app;
  app.run.potions[0] = 'HEAL_POTION';
  app.renderCombat();
});
await page.waitForTimeout(200);

const potBox = await page.evaluate(() => {
  const el = document.querySelector('[data-potion="0"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, hp: window.app.run.hp };
});
ok(!!potBox, '战斗界面渲染出药水格');
let potsBefore = 0;

if (potBox) {
  // 先古遗物可能顺带塞了别的药水，所以只比相对数量
  const hpBefore = await page.evaluate(() => window.app.combat.player.hp);
  potsBefore = await page.evaluate(() => window.app.run.potions.filter(Boolean).length);
  await page.mouse.move(potBox.x, potBox.y);
  await page.mouse.down();
  await page.waitForTimeout(560);
  const during = await page.evaluate(() => ({
    pop: !!document.querySelector('.kw-pop'),
    title: document.querySelector('.kw-title')?.textContent || '',
    pots: window.app.run.potions.filter(Boolean).length,
    hp: window.app.combat.player.hp,
  }));
  await page.mouse.up();
  await page.waitForTimeout(700);            // 越过长按吞点击的 700ms 窗口
  const after = await page.evaluate(() => ({
    pots: window.app.run.potions.filter(Boolean).length,
    hp: window.app.combat.player.hp,
    pop: !!document.querySelector('.kw-pop'),
  }));
  ok(during.pop, '长按弹出说明层');
  ok(/治疗/.test(during.title), '说明层是这瓶药水', during.title);
  ok(during.pots === potsBefore, '长按期间药水还在', `${potsBefore} → ${during.pots}`);
  ok(after.pots === potsBefore, '松手后药水没被用掉', `${potsBefore} → ${after.pots}`);
  ok(after.hp === hpBefore, '生命没有被药水改变', `${hpBefore} → ${after.hp}`);
  ok(after.pop, '说明层保持打开，等玩家自己关');
}

// 关掉说明层，短按仍然正常使用
await page.evaluate(() => window.app.closeInfo());
await page.waitForTimeout(160);
const hpNow = await page.evaluate(() => { window.app.combat.player.hp = 30; window.app.renderCombat(); return 30; });
await page.waitForTimeout(160);
const bx = await page.evaluate(() => {
  const el = document.querySelector('[data-potion="0"]');
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(bx.x, bx.y);
await page.waitForTimeout(400);
const used = await page.evaluate((n) => ({
  pots: window.app.run.potions.filter(Boolean).length,
  expected: n - 1,
  hp: window.app.combat.player.hp,
}), potsBefore);
ok(used.pots === used.expected, '短按仍然把药用掉', `${potsBefore} → ${used.pots}`);
ok(used.hp > hpNow, '药水效果生效（回血）', `${hpNow} → ${used.hp}`);

/* ---------------- ② 失败结算 → 战报 ---------------- */
console.log('② 失败结算的战报入口');
await newCombat();
// 打完一场：直接用伤害管线清场，让 run.battles 真正落一条
await page.evaluate(async () => {
  const app = window.app;
  const c = app.combat;
  for (const e of [...c.enemies]) if (e.alive) await c.dealDamage(e, 999999, { ignoreBlock: true, isAttack: true });
});
await page.waitForTimeout(500);
await page.evaluate(() => {
  // 战利品里点「继续」跳过
  const btn = [...document.querySelectorAll('.sheet .btn')].find(x => /继续|跳过/.test(x.textContent));
  if (btn) btn.click();
});
await page.waitForTimeout(400);
const rec = await page.evaluate(() => ({
  battles: window.app.run.battles.length,
  first: window.app.run.battles[0],
}));
ok(rec.battles === 1, '战斗结束后记进战报', `n=${rec.battles}`);
ok(rec.first && rec.first.dealt > 0, '记下了造成的伤害', JSON.stringify(rec.first));

// 制造死亡
await page.evaluate(async () => {
  const app = window.app;
  await app.enterNode(app.run.map.nodes.find(n => n.type === 'monster') || app.run.map.startNodes[0]);
  await new Promise(r => setTimeout(r, 80));
  const c = app.combat;
  await c.dealDamage(c.player, 999999, { ignoreBlock: true, isAttack: true });
});
await page.waitForTimeout(700);

const over = await page.evaluate(() => ({
  title: document.querySelector('.result-title')?.textContent || '',
  hasBtn: !!document.querySelector('#open-report'),
}));
ok(over.title === '你倒下了', '进入失败结算', over.title);
ok(over.hasBtn, '结算页有「查看战报」按钮');

await page.click('#open-report');
await page.waitForTimeout(300);
const rep = await page.evaluate(() => ({
  open: !!document.querySelector('.br-sheet'),
  cells: [...document.querySelectorAll('.br-grid > div')].map(d => `${d.querySelector('span').textContent}=${d.querySelector('b').textContent}`),
  rows: [...document.querySelectorAll('.br-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
}));
ok(rep.open, '战报面板打开');
ok(rep.cells.length === 8, '概览有 8 项', rep.cells.join(' / '));
ok(rep.rows.length === 2, '列出两场战斗', JSON.stringify(rep.rows));
console.log('    ' + rep.cells.join(' '));
for (const r of rep.rows) console.log('    ·', r);

// 点第一行翻那场的战斗记录
await page.click('.br-row');
await page.waitForTimeout(300);
const logOpen = await page.evaluate(() => {
  const m = document.querySelector('.log-modal');
  return { open: !!m, n: m ? m.querySelectorAll('.log-line').length : 0 };
});
ok(logOpen.open, '点一行打开那场的战斗记录');
ok(logOpen.n > 0, '记录里有内容', `n=${logOpen.n}`);

await page.evaluate(() => document.querySelector('.log-modal [data-lg="close"]')?.click());
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelector('#br-close')?.click());
await page.waitForTimeout(200);
const closed = await page.evaluate(() => ({
  sheet: !!document.querySelector('.br-sheet'),
  over: !!document.querySelector('.result-screen'),
}));
ok(!closed.sheet && closed.over, '关掉战报后回到结算页');

const rejects = await page.evaluate(() => window.__rejects.slice(0, 3));
ok(!rejects.length && !pageErrors.length, '没有报错', JSON.stringify([...rejects, ...pageErrors]));

await page.screenshot({ path: 'shots/e2e-report.png' });
await b.close();

console.log(`\n通过 ${pass} 项${fails.length ? `，失败 ${fails.length} 项` : '，全部通过'}`);
if (fails.length) { console.log('失败项：\n' + fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
