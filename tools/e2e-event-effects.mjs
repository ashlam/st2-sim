/** 事件效果与事件战斗的端到端检查（第二/三幕） */
import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 8081;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('CONSOLE: ' + m.text()); });

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.evaluate(() => { window.DEBUG_SPEED = 0; window.app.startRun('IRONCLAD', 0); });
await page.waitForTimeout(300);
await page.click('#anc-list .choice');
await page.waitForTimeout(400);

const ok = [];
const bad = [];
const t = (name, cond, extra = '') => (cond ? ok : bad).push(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);

/** 点事件里的第 n 个选项，并确认弹窗 */
async function pickChoice(n = 0) {
  await page.evaluate((i) => document.querySelectorAll('#event-list .choice')[i].click(), n);
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('.cfm-pop .cfm-ok')?.click());
  await page.waitForTimeout(350);
}

// 1) 熔合者：移除 2 张打击，换成究极打击
{
  const before = await page.evaluate(() => window.app.run.deck.map((d) => d.id));
  await page.evaluate(() => window.app.renderEvent('AMALGAMATOR'));
  await page.waitForTimeout(150);
  await pickChoice(0);
  const after = await page.evaluate(() => window.app.run.deck.map((d) => d.id));
  const strikes = before.filter((x) => x === 'STRIKE_IRONCLAD').length;
  const strikes2 = after.filter((x) => x === 'STRIKE_IRONCLAD').length;
  t('熔合者：少了 2 张打击', strikes2 === strikes - 2, `${strikes} → ${strikes2}`);
  t('熔合者：获得究极打击', after.includes('ULTIMATE_STRIKE'));
  t('熔合者：回到地图', await page.evaluate(() => !!document.querySelector('.map-head')));
}

// 2) 人形洞穴之地：附魔「完美契合」
{
  await page.evaluate(() => window.app.renderEvent('FIELD_OF_MAN_SIZED_HOLES'));
  await page.waitForTimeout(150);
  await pickChoice(1);   // 进入你的洞
  await page.waitForTimeout(200);
  const hasPicker = await page.evaluate(() => !!document.querySelector('#sel-grid'));
  await page.evaluate(() => document.querySelector('#sel-grid [data-uid]')?.click());
  await page.waitForTimeout(300);
  const enchanted = await page.evaluate(() => window.app.run.deck.filter((d) => d.enchant === 'PERFECT_FIT').length);
  t('人形洞穴：弹出选牌面板', hasPicker);
  t('人形洞穴：牌组记录了附魔', enchanted === 1, `附魔 ${enchanted} 张`);
}

// 3) 迷失鬼火：金币选项
{
  const g0 = await page.evaluate(() => window.app.run.gold);
  await page.evaluate(() => window.app.renderEvent('LOST_WISP'));
  await page.waitForTimeout(150);
  await pickChoice(1);
  const g1 = await page.evaluate(() => window.app.run.gold);
  t('迷失鬼火：金币增加 45~75', g1 - g0 >= 45 && g1 - g0 <= 75, `+${g1 - g0}`);
}

// 4) 修禅织网者：金币不足时选项禁用
{
  await page.evaluate(() => { window.app.run.gold = 40; window.app.renderEvent('ZEN_WEAVER'); });
  await page.waitForTimeout(150);
  const disabled = await page.evaluate(() =>
    [...document.querySelectorAll('#event-list .choice')].map((x) => x.classList.contains('sold')));
  t('修禅织网者：金币不足则整排禁用', disabled.every(Boolean), JSON.stringify(disabled));
  await page.evaluate(() => window.app.clearOverlay());
}

// 5) 训练假人：3 回合后溜走，不给奖励
{
  await page.evaluate(() => { window.app.run.gold = 100; window.app.renderEvent('BATTLEWORN_DUMMY'); });
  await page.waitForTimeout(150);
  await pickChoice(0);   // 第 1 档
  await page.waitForTimeout(600);
  const enc = await page.evaluate(() => ({
    screen: window.app.screen,
    enc: window.app.combat?.enc.id,
    enemy: window.app.combat?.alive()[0]?.name,
    hp: window.app.combat?.alive()[0]?.maxHp,
  }));
  t('训练假人：开打', enc.enc === 'BATTLE_FRIEND_V1', JSON.stringify(enc));

  for (let i = 0; i < 8; i++) {
    const st = await page.evaluate(() => {
      const c = window.app.combat;
      return { finished: !c || c.finished, turned: c?.turn || 0 };
    });
    if (st.finished) break;
    await page.evaluate(() => document.querySelector('#end-turn')?.click());
    await page.waitForTimeout(500);
  }
  const res = await page.evaluate(() => ({
    finished: window.app.combat?.finished,
    timedOut: window.app.combat?.timedOut,
    back: !!document.querySelector('.map-head'),
    hp: window.app.run.hp,
  }));
  t('训练假人：计时结束后自动离开战斗', res.finished || res.back, JSON.stringify(res));
}

// 6) 灯火钥匙：与神秘骑士战斗
{
  await page.evaluate(() => { window.app.run.hp = 200; window.app.run.maxHp = 200; window.app.renderEvent('THE_LANTERN_KEY'); });
  await page.waitForTimeout(150);
  await pickChoice(1);
  await page.waitForTimeout(600);
  const s = await page.evaluate(() => ({
    enc: window.app.combat?.enc.id,
    name: window.app.combat?.alive()[0]?.name,
    str: window.app.combat?.alive()[0]?.powers.strength,
    plating: window.app.combat?.alive()[0]?.powers.plating,
  }));
  t('灯火钥匙：神秘骑士出场（+6 力量 / +6 覆甲）', s.enc === 'MYSTERIOUS_KNIGHT_ENCOUNTER' && s.str === 6 && s.plating === 6, JSON.stringify(s));

  // 直接把它打死，检查是否发卡 + 回地图
  await page.evaluate(() => {
    const c = window.app.combat;
    c.dealDamage(c.alive()[0], 9999, { source: 'player' });
  });
  await page.waitForTimeout(2000);
  // 战利品面板：点「跳过卡牌，继续」
  for (let i = 0; i < 6; i++) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((x) => /继续|离开|完成/.test(x.textContent));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) { await page.waitForTimeout(400); continue; }
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);
  const deck = await page.evaluate(() => window.app.deck_check = window.app.run.deck.map((d) => d.id));
  if (!deck.includes('LANTERN_KEY')) {
    console.log('  调试:', await page.evaluate(() => ({
      sheet: document.querySelector('.sheet-title')?.textContent || null,
      buttons: [...document.querySelectorAll('button')].map((x) => x.textContent.trim()).slice(0, 6),
      cb: !!window.app._eventCombatAfter,
      deck: window.app.run.deck.length,
    })));
  }
  t('灯火钥匙：胜利后获得「灯火钥匙」', deck.includes('LANTERN_KEY'));
}

// 6) 混沌芳香：放任自流 = 变化一张牌
{
  const before = await page.evaluate(() => {
    window.app.run.hp = window.app.run.maxHp;
    window.app.renderEvent('AROMA_OF_CHAOS');
    return window.app.run.deck.map((d) => d.id);
  });
  await page.waitForTimeout(150);
  await pickChoice(0);                       // 放任自流
  await page.waitForTimeout(250);
  const hasPicker = await page.evaluate(() => !!document.querySelector('#sel-grid'));
  await page.evaluate(() => document.querySelector('#sel-grid [data-uid]')?.click());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.app.run.deck.map((d) => d.id));
  const changed = before.filter((id, i) => id !== after[i]).length;
  t('混沌芳香：弹出选牌面板', hasPicker);
  t('混沌芳香：恰好一张牌被换掉', after.length === before.length && changed === 1, `变化 ${changed} 张`);
  await page.evaluate(() => window.app.clearOverlay());
}

// 7) 变形灵林谷：大群 = 清空金币 + 变化 2 张
{
  await page.evaluate(() => { window.app.run.gold = 150; window.app.renderEvent('MORPHIC_GROVE'); });
  await page.waitForTimeout(150);
  await pickChoice(0);
  await page.waitForTimeout(250);
  const goldAfter = await page.evaluate(() => window.app.run.gold);
  t('变形灵林谷：金币清零', goldAfter === 0, String(goldAfter));
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => document.querySelector('#sel-grid [data-uid]')?.click());
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => window.app.clearOverlay());
}

// 8) 无休之处：休息回满血 + 睡眠不佳
{
  await page.evaluate(() => { window.app.run.hp = 20; window.app.renderEvent('UNREST_SITE'); });
  await page.waitForTimeout(150);
  await pickChoice(0);
  const rest = await page.evaluate(() => ({
    hp: window.app.run.hp, max: window.app.run.maxHp,
    curse: window.app.run.deck.filter((d) => d.id === 'POOR_SLEEP').length,
  }));
  t('无休之处：回复全部生命', rest.hp === rest.max, `${rest.hp}/${rest.max}`);
  t('无休之处：获得睡眠不佳', rest.curse === 1, `${rest.curse} 张`);
}

// 9) 多尼斯异鸟巢：带走蛋 → 休息处可孵化
{
  await page.evaluate(() => window.app.renderEvent('BYRDONIS_NEST'));
  await page.waitForTimeout(150);
  await pickChoice(1);                       // 带走这颗蛋
  const egg = await page.evaluate(() => window.app.run.deck.filter((d) => d.id === 'BYRDONIS_EGG').length);
  t('异鸟巢：蛋进了牌组', egg === 1, `${egg} 张`);

  await page.evaluate(() => window.app.showRest());
  await page.waitForTimeout(200);
  const hatch = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#rest-list .choice')].find((x) => /孵化/.test(x.textContent));
    if (!b) return null;
    b.click();
    return true;
  });
  await page.waitForTimeout(400);
  const hatched = await page.evaluate(() => ({
    relic: window.app.run.relics.includes('BYRDPIP'),
    egg: window.app.run.deck.filter((d) => d.id === 'BYRDONIS_EGG').length,
    swoop: window.app.run.deck.filter((d) => d.id === 'BYRD_SWOOP').length,
  }));
  t('异鸟巢：休息处出现孵化选项', !!hatch);
  t('异鸟巢：孵化后获得异鸟宝宝', hatched.relic);
  t('异鸟巢：蛋变成异鸟扑击', hatched.egg === 0 && hatched.swoop === 1, JSON.stringify(hatched));
}

for (const line of ok) console.log(line);
for (const line of bad) console.log(line);
if (errs.length) console.log('页面错误:', errs.slice(0, 6));
console.log(bad.length === 0 && !errs.length ? 'OK' : 'FAIL');
await b.close();
process.exit(bad.length === 0 && !errs.length ? 0 : 1);
