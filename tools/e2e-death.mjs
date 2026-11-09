/** 战斗外伤害可以致死（事件 / 遗物「拾起时受到伤害」）的端到端检查 */
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

async function newRun() {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
  await page.waitForTimeout(280);
  // 先古三选一（不选会一直盖着界面）
  await page.evaluate(() => document.querySelectorAll('#anc-list .choice')[0]?.click());
  await page.waitForTimeout(320);
  // 先古遗物的「拾起时」任务可能弹出选牌面板，先关掉
  for (let i = 0; i < 4; i++) {
    const open = await page.evaluate(() => !document.querySelector('#overlay-layer').classList.contains('hidden'));
    if (!open) break;
    await page.evaluate(() => document.querySelector('#sel-cancel, #close-deck')?.click());
    await page.waitForTimeout(200);
  }
}

/** 点事件里的第 n 个选项，并确认弹窗 */
async function pickChoice(n = 0) {
  await page.evaluate((i) => document.querySelectorAll('#event-list .choice')[i]?.click(), n);
  await page.waitForTimeout(140);
  await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok')?.click());
  await page.waitForTimeout(320);
}

const state = () => page.evaluate(() => ({
  hp: window.app.run.hp,
  maxHp: window.app.run.maxHp,
  dead: !!window.app.run.dead,
  result: !!document.querySelector('.result-screen'),
  map: !!document.querySelector('.map-head'),
  save: !!localStorage.getItem('sts2sim.run.v1'),
  page: document.querySelector('.sheet-title')?.textContent || '',
}));

/* ---------- 1) 深渊浴场：伤害递增，最后真的会死 ---------- */
await newRun();
await page.evaluate(() => {
  window.app.run.hp = 3;
  window.app.renderEvent('ABYSSAL_BATHS');
});
await page.waitForTimeout(200);
await pickChoice(0);                       // 投身其中：+2 最大生命，受 3 点伤害
let s = await state();
t('深渊浴场：第一次沉溺后还活着', s.hp === 2 && !s.result, `hp=${s.hp}`);
t('深渊浴场：留在沉溺页', /深渊浴场/.test(s.page), s.page);

await pickChoice(0);                       // 沉溺：受 4 点伤害，致死
s = await state();
t('深渊浴场：伤害递增可以致死', s.hp === 0 && s.dead, `hp=${s.hp} dead=${s.dead}`);
t('深渊浴场：死亡进入结算界面', s.result);
t('深渊浴场：结算页有战报入口', await page.evaluate(() => !!document.querySelector('#open-report')));
t('深渊浴场：死亡后存档被清掉', !s.save);

await page.evaluate(() => document.querySelector('#open-report').click());
await page.waitForTimeout(200);
t('结算页：战报能打开', await page.evaluate(() => !!document.querySelector('.br-list, #br-close')));
await page.evaluate(() => document.querySelector('#br-close')?.click());
await page.waitForTimeout(150);

/* ---------- 2) 已倒下的人不会被治疗救回来 ---------- */
const revived = await page.evaluate(() => {
  const r = window.app.run;
  const before = r.hp;
  r.heal(30);
  r.gainMaxHp(20);
  return { before, hp: r.hp };
});
t('死亡后 heal 不会复活', revived.hp === 0, `${revived.before} → ${revived.hp}`);

/* ---------- 3) 非致死伤害仍然回地图 ---------- */
await newRun();
await page.evaluate(() => { window.app.run.hp = window.app.run.maxHp; window.app.renderEvent('TRASH_HEAP'); });
await page.waitForTimeout(200);
const hpBefore = (await state()).hp;
await pickChoice(0);                       // 扎进垃圾堆：失去 8 点生命
s = await state();
t('垃圾堆：掉 8 血但活着', s.hp === hpBefore - 8 && !s.dead, `${hpBefore} → ${s.hp}`);
t('垃圾堆：结束后回到地图', s.map);

/* ---------- 4) 遗物「拾起时受到伤害」也能致死（showMap 兜底） ---------- */
await newRun();
await page.evaluate(() => {
  window.app.run.hp = 10;
  window.app.run.addRelic('PRECARIOUS_SHEARS');
  window.app.showMap();
});
await page.waitForTimeout(250);
s = await state();
t('松动羊毛剪：16 点伤害把人打死', s.hp === 0 && s.dead, `hp=${s.hp}`);
t('松动羊毛剪：不画地图直接进结算', s.result && !s.map);

/* ---------- 5) 滑脚木桥：反复「再撑一会」，伤害累积到致死 ---------- */
await newRun();
await page.evaluate(() => {
  window.app.run.hp = 5;
  window.app.renderEvent('SLIPPERY_BRIDGE');
});
await page.waitForTimeout(200);
let died = false;
for (let i = 0; i < 6; i++) {
  const st = await state();
  if (st.result) { died = true; break; }
  await pickChoice(1);                     // 再撑一会：失去 3+n 点生命
}
s = await state();
t('滑脚木桥：反复硬撑会死', died || s.result, `hp=${s.hp}`);

console.log(ok.join('\n'));
if (bad.length) {
  console.log('\n--- 失败 ---');
  console.log(bad.join('\n'));
}
console.log(`\n${ok.length} 通过 / ${bad.length} 失败`);
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await b.close();
process.exit(bad.length || errs.length ? 1 : 0);
