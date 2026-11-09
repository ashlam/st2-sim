/**
 * 事件池自检：把三幕事件逐段渲染一遍，确认
 *   1) 每段都能渲染出选项（没有 undefined / 抛错）
 *   2) 事件池与源码的池子一致
 * 只做渲染，不点选项，避免把牌组改乱。
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
await page.waitForTimeout(500);

const check = await page.evaluate(async () => {
  const app = window.app;
  const { EVENTS, ACT_EVENTS } = await import('./src/data/events.js');
  const { Run } = await import('./src/engine/run.js');
  // 事件里的选项要读 run（金币 / 随机流 / 角色），先造一局
  app.run = new Run('EVENTCHECK', 0, 'IRONCLAD');
  app._tinkerType = 'ATTACK';
  const results = [];
  for (const act of [1, 2, 3]) {
    for (const id of ACT_EVENTS[act]) {
      const ev = EVENTS[id];
      if (!ev) { results.push({ act, id, error: '事件不存在' }); continue; }
      const pages = ['INITIAL', ...Object.keys(ev.pages || {})];
      for (const pg of pages) {
        try {
          app.renderEvent(id, pg);
          const n = document.querySelectorAll('#event-list .choice').length;
          const title = document.querySelector('.sheet-title')?.textContent || '';
          results.push({ act, id, pg, n, title });
        } catch (e) {
          results.push({ act, id, pg, error: String((e && e.message) || e) });
        }
      }
    }
  }
  app.clearOverlay();
  return results;
});

const bad = check.filter(r => r.error || !r.n);
console.log(`事件段数: ${check.length}，异常/空选项: ${bad.length}`);
for (const b of bad) console.log('  ✗', JSON.stringify(b));
for (const r of check.filter(x => x.act >= 2)) {
  console.log(`  act${r.act} ${r.id}/${r.pg} 选项=${r.n} 「${r.title}」`);
}
// 第一幕只打印本轮新增的几个，避免刷屏
const ACT1_NEW = new Set(['AROMA_OF_CHAOS', 'BYRDONIS_NEST', 'DENSE_VEGETATION', 'MORPHIC_GROVE', 'UNREST_SITE', 'SUNKEN_STATUE']);
for (const r of check.filter(x => x.act === 1 && ACT1_NEW.has(x.id))) {
  console.log(`  act1 ${r.id}/${r.pg} 选项=${r.n} 「${r.title}」`);
}
if (errors.length) console.log('页面错误:', errors.slice(0, 5));
console.log(bad.length === 0 && errors.length === 0 ? 'OK' : 'FAIL');

await browser.close();
process.exit(bad.length === 0 && errors.length === 0 ? 0 : 1);
