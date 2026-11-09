/**
 * 第一幕 5 个新事件 + 扭动虫 + 异鸟蛋 的自检。
 * 直接构造一个假的 Game（只实现事件 g.* 用到的接口），把每个选项都点一遍看有没有报错。
 */
import { Run } from '../../src/engine/run.js';
import { EVENTS, ACT1_EVENTS, eventPoolFor } from '../../src/data/events.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { CARDS } from '../../src/data/cards.js';
import { RELICS } from '../../src/data/items.js';
import { Combat } from '../../src/engine/combat.js';

let bad = 0;
const err = (...a) => { console.log('BAD', ...a); bad++; };

/* ---------- 1. 池子与定义 ---------- */
const NEW_IDS = ['AROMA_OF_CHAOS', 'BYRDONIS_NEST', 'DENSE_VEGETATION', 'MORPHIC_GROVE', 'UNREST_SITE'];
for (const id of NEW_IDS) {
  if (!EVENTS[id]) err('missing event', id);
  if (!ACT1_EVENTS.includes(id)) err('not in ACT1 pool', id);
}
if (!ACT1_EVENTS.includes('SUNKEN_STATUE')) err('SUNKEN_STATUE 不在第一幕池');
const pool1 = eventPoolFor(1, 'OVERGROWTH');
for (const id of ACT1_EVENTS) if (!EVENTS[id]) err('pool 指向不存在的定义', id);
if (ACT1_EVENTS.length !== 13) err('第一幕事件数应为 13，实际', ACT1_EVENTS.length);

/* ---------- 2. 卡片 / 遗物 / 敌人 ---------- */
for (const id of ['BYRDONIS_EGG', 'BYRD_SWOOP', 'POOR_SLEEP', 'INFECTION']) {
  if (!CARDS[id]) err('missing card', id);
}
if (CARDS.POOR_SLEEP && !CARDS.POOR_SLEEP.retain) err('睡眠不佳应有保留');
if (!RELICS.BYRDPIP) err('missing relic BYRDPIP');
if (!ENEMIES.WRIGGLER) err('missing enemy WRIGGLER');

/* ---------- 3. 假 Game：把选项逐个点一遍 ---------- */
function makeG(run) {
  const g = {
    run,
    _evs: {},
    log: [],
    toast() {},
    evState(init) {
      if (init) for (const k of Object.keys(init)) if (!(k in g._evs)) g._evs[k] = init[k];
      return g._evs;
    },
    heal(n) { run.heal(n); g.log.push(`heal ${n}`); },
    damage(n) { run.damage(n); g.log.push(`damage ${n}`); },
    gainGold(n) { run.gainGold(n); g.log.push(`gold ${n}`); },
    gainMaxHp(n) { run.gainMaxHp(n); g.log.push(`maxhp ${n}`); },
    loseMaxHp(n) { run.gainMaxHp(-n); g.log.push(`maxhp -${n}`); },
    addCardById(id) { run.addCard(id); g.log.push(`card ${id}`); },
    addRelicRandom() { const id = run.rollRelic(); if (id) run.addRelic(id); g.log.push(`relic ${id}`); },
    addRelicById(id) { run.addRelic(id); g.log.push(`relic ${id}`); },
    async removeCards() {}, async upgradeChoice() { g.log.push('upgrade'); },
    async transformChoice(n) { g.log.push(`transform ${n}`); },
    isTransformable(id) { const d = CARDS[id]; return !!d && d.type !== 'quest'; },
    hasEventPet() { return run.relics.includes('BYRDPIP') || run.deck.some(d => d.id === 'BYRDONIS_EGG'); },
    eventPage(id, page) { g.log.push(`page ${page}`); g.page = page; },
    eventDone() { g.log.push('done'); },
    eventCombat(encId, ids, after, opts) { g.log.push(`combat ${ids.join('+')} slots=${(opts?.slots || []).join(',')}`); },
  };
  return g;
}

for (const id of NEW_IDS) {
  const def = EVENTS[id];
  for (const seed of ['E1', 'E2', 'E3']) {
    const run = new Run(seed, 0, 'IRONCLAD');
    const g = makeG(run);
    if (def.allowed && !def.allowed(g)) {
      // 条件不满足就补资源，确保能进入选项
      run.hp = run.maxHp;
      run.gainGold(200);
    }
    let choices;
    try { choices = def.choices(g); }
    catch (e) { err(`${id} choices 抛错: ${e.message}`); continue; }
    if (!choices || !choices.length) { err(`${id} 没有选项`); continue; }
    for (const ch of choices) {
      if (!ch.label) err(`${id} 选项缺 label`);
      if (typeof ch.apply !== 'function') err(`${id} 「${ch.label}」缺 apply`);
    }
  }
}

/* ---------- 4. DENSE_VEGETATION 两段流程 ---------- */
{
  const run = new Run('DV1', 0, 'IRONCLAD');
  run.hp = 40;
  const g = makeG(run);
  const c1 = EVENTS.DENSE_VEGETATION.choices(g);
  const trudge = c1.find(c => c.label === '坚持跋涉');
  const hp0 = run.hp, gold0 = run.gold;
  await trudge.apply(g);
  if (run.hp !== hp0 - 8) err('坚持跋涉应失去 8 点生命', run.hp, hp0);
  if (run.gold - gold0 < 61 || run.gold - gold0 > 99) err('金币应在 61..99', run.gold - gold0);

  const g2 = makeG(new Run('DV2', 0, 'IRONCLAD'));
  const rest = EVENTS.DENSE_VEGETATION.choices(g2).find(c => c.label === '休息');
  rest.apply(g2);
  if (g2.page !== 'REST') err('休息应跳到 REST 页');
  const fight = EVENTS.DENSE_VEGETATION.pages.REST.choices(g2)[0];
  fight.apply(g2);
  if (!g2.log.some(s => s.includes('WRIGGLER+WRIGGLER'))) err('休息后应进入 4 只扭动虫的战斗');
  if (!g2.log.some(s => s.includes('wriggler4'))) err('扭动虫需要 4 个槽位');
}

/* ---------- 5. 异鸟蛋 → 异鸟宝宝 ---------- */
{
  const run = new Run('EGG1', 0, 'IRONCLAD');
  run.addCard('BYRDONIS_EGG');
  const before = run.deck.filter(d => d.id === 'BYRDONIS_EGG').length;
  run.addRelic('BYRDPIP');
  const after = run.deck.filter(d => d.id === 'BYRDONIS_EGG').length;
  const swoop = run.deck.filter(d => d.id === 'BYRD_SWOOP').length;
  if (before !== 1 || after !== 0 || swoop !== 1) err('孵化转换失败', { before, after, swoop });
}

/* ---------- 6. 扭动虫实战：4 只，起手按槽位 ---------- */
{
  const run = new Run('WRIG1', 0, 'IRONCLAD');
  const c = new Combat(run, {
    id: 'DENSE_VEGETATION',
    units: [['WRIGGLER']], repeat: 4,
    slots: ['wriggler1', 'wriggler2', 'wriggler3', 'wriggler4'],
  }, { kind: 'normal' });
  if (c.enemies.length !== 4) err('应有 4 只扭动虫，实际', c.enemies.length);
  const first = c.enemies.map(e => e.moveKey);
  if (first[0] !== 'bite' || first[1] !== 'wriggle' || first[2] !== 'bite' || first[3] !== 'wriggle') {
    err('起手招式不符合槽位规则', first);
  }
  const hpRange = c.enemies.map(e => e.maxHp);
  if (hpRange.some(h => h < 17 || h > 21)) err('普通难度血量应在 17..21', hpRange);
}

console.log('bad =', bad);
process.exit(bad ? 1 : 0);
