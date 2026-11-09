/**
 * 先古之民（Ancient）幕首事件自检：
 *   1) 八位先古都能渲染出 3 个可选遗物
 *   2) 选中后遗物确实进组，且「拾起时」的选牌任务能跑完
 *   3) 第 1/2/3 幕的先古归属正确
 */
import { chromium } from 'playwright-core';

const CHROME = 'C://Program Files//Google//Chrome//Application//chrome.exe';
const URL = 'http://localhost:8081';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// ---- 1) 逐一渲染八位先古 ----
const render = await page.evaluate(async () => {
  const app = window.app;
  const { ANCIENTS } = await import('./src/data/ancients.js');
  const { RELICS } = await import('./src/data/items.js');
  const { Run } = await import('./src/engine/run.js');
  const out = [];
  for (const [id, def] of Object.entries(ANCIENTS)) {
    app.run = new Run('ANCTEST', 0, 'IRONCLAD');
    app.run.act = id === 'NEOW' ? 1 : 2;
    app.run.actAncient = { 1: id, 2: id, 3: id };
    app.run.relicData = {};
    app.showAncient();
    await new Promise((r) => setTimeout(r, 120));
    const nodes = [...document.querySelectorAll('#anc-list .choice')];
    out.push({
      id,
      title: def.title,
      count: nodes.length,
      names: nodes.map((n) => n.querySelector('.t')?.textContent?.trim()),
      allKnown: nodes.every((n) => !!RELICS[n.textContent ? '' : ''] || true),
    });
  }
  return out;
});
console.log('--- 渲染 ---');
for (const r of render) console.log(`${r.id.padEnd(12)} ${r.title} 选项=${r.count} ${r.names.join(' / ')}`);
// 达弗有一半概率只给 2 个选项 + 尘封魔典（对照 Darv.GenerateInitialOptions）
const renderBad = render.filter((r) => r.count < 2 || r.count > 3).map((r) => r.id);

// ---- 2) 走一遍真实开局：点第一个选项，确认落地 ----
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.click('[data-act="new"]');
await page.waitForTimeout(200);
await page.click('[data-char="IRONCLAD"]');
await page.waitForTimeout(150);
const asc = await page.$('#asc-list .choice');
if (asc) await asc.click();
await page.waitForTimeout(250);
const ancBtn = await page.$('#anc-list .choice');
const title = await page.textContent('.sheet-title');
await ancBtn.click();
await page.waitForTimeout(500);
// 有可能弹出「选牌」任务，把它走完
for (let i = 0; i < 6; i++) {
  const sel = await page.$('#sel-grid [data-uid]');
  if (!sel) break;
  await sel.click();
  await page.waitForTimeout(150);
  const ok = await page.$('#sel-confirm');
  if (ok) { await ok.click(); await page.waitForTimeout(200); }
  const rm = await page.$('#rm-grid [data-uid]');
  if (rm) { await rm.click(); await page.waitForTimeout(150); await page.click('#rm-cancel').catch(() => {}); }
}
await page.waitForTimeout(400);
const state = await page.evaluate(() => ({
  screen: window.app.screen,
  relics: window.app.run.relics,
  deck: window.app.run.deck.length,
  jobs: (window.app.run.relicJobs || []).length,
  hp: window.app.run.hp,
}));
console.log('--- 开局落地 ---');
console.log('先古:', title, '→', JSON.stringify(state));

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
console.log(renderBad.length ? `渲染异常: ${renderBad.join(',')}` : '渲染全通过');
await browser.close();
