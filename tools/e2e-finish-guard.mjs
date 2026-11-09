/**
 * 战斗结束兜底回归：消灭最后一个敌人后，结算链路无论正常 / 抛错 / 挂住，
 * 界面都必须继续往下走，不能停在"日志最后一条 = XX 被击败"的死画面。
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

async function newCombat() {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(180);
  await page.click('[data-act="new"]'); await page.waitForTimeout(180);
  await page.click('[data-char="IRONCLAD"]'); await page.waitForTimeout(140);
  await page.click('#asc-list .choice'); await page.waitForTimeout(180);
  await page.click('#anc-list .choice'); await page.waitForTimeout(240);
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('.sheet .btn')].find(x => x.textContent.includes('取消'));
    if (c) c.click();
  });
  await page.waitForTimeout(100);
  return page.evaluate(async () => {
    window.DEBUG_SPEED = 0;
    window.__rejects.length = 0;
    const app = window.app;
    await app.enterNode(app.run.map.startNodes[0]);
    await new Promise(r => setTimeout(r, 60));
    return app.combat?.enc?.id;
  });
}

/** 用真实伤害管线杀光所有敌人，可选注入结算故障 */
async function killAll(mode) {
  return page.evaluate(async (mode) => {
    const app = window.app;
    if (mode === 'throw') app.onCombatFinished = async () => { throw new Error('模拟结算异常'); };
    if (mode === 'hang') app.onCombatFinished = () => new Promise(() => {});
    const c = app.combat;
    for (const e of [...c.enemies]) {
      if (e.alive) await c.dealDamage(e, 999999, { ignoreBlock: true, isAttack: true });
    }
    return { finished: c.finished, won: c.won, alive: c.alive().length };
  }, mode);
}

const state = () => page.evaluate(() => ({
  combat: !!window.app.combat,
  map: !!document.querySelector('.map-node'),
  sheet: document.querySelector('.sheet-title')?.textContent || null,
  rejects: window.__rejects.slice(0, 3),
}));

console.log('① 正常结算');
await newCombat();
let k = await killAll('normal');
await page.waitForTimeout(400);
let s = await state();
ok(k.finished && k.won && k.alive === 0, '敌人全部死亡且判定胜利');
ok(s.sheet === '战利品', '弹出战利品', JSON.stringify(s));
ok(s.combat === false, '战斗对象已释放');
ok(!s.rejects.length, '没有未处理的 Promise rejection', JSON.stringify(s.rejects));

console.log('② 结算函数抛异常');
await newCombat();
k = await killAll('throw');
await page.waitForTimeout(400);
s = await state();
ok(s.combat === false, '战斗对象已释放（没有冻在战斗画面）', JSON.stringify(s));
ok(s.map === true, '兜底回到地图', JSON.stringify(s));
ok(!s.rejects.length, '异常被接住，未冒泡成 rejection', JSON.stringify(s.rejects));

console.log('③ 结算函数永久挂起（等待 5.5s 的超时兜底）');
await newCombat();
k = await killAll('hang');
await page.waitForTimeout(5600);
s = await state();
ok(s.combat === false, '重试与强制超时后释放战斗', JSON.stringify(s));
ok(s.map === true, '兜底回到地图', JSON.stringify(s));

console.log('page errors:', pageErrors.length ? pageErrors.slice(0, 3) : 'none');
console.log(`\n结果：${pass} 通过 / ${fails.length} 失败`);
if (fails.length) { fails.forEach(f => console.log('  ✗', f)); process.exitCode = 1; }
await b.close();
