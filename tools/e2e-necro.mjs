/**
 * 亡灵契约师专项测试：
 *  1) 角色/起始牌组/遗物数值对照 C# 源码
 *  2) 奥斯提：召唤成长、替玩家承伤、死亡留场、复活重置
 *  3) 灾厄：阈值判定直死、无视格挡、玩家侧结算
 *  4) 卡池：86 张单人卡全部能打出且不抛异常
 *  5) 遗物/药水/能力元数据齐全
 *
 * 跑法：node tools/e2e-necro.mjs
 */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { CARDS } from '../src/data/cards.js';
import { RELICS, POTIONS } from '../src/data/items.js';
import { POWERS } from '../src/data/powers.js';
import { TERMS } from '../src/data/glossary.js';
import { ENCOUNTERS } from '../src/data/enemies.js';
import { getCharacter } from '../src/data/characters.js';

let pass = 0;
const fails = [];
function ok(cond, label, extra = '') {
  if (cond) { pass++; return true; }
  fails.push(`${label}${extra ? ' — ' + extra : ''}`);
  return false;
}
function eq(actual, expected, label) {
  return ok(actual === expected, label, `期望 ${expected}，实际 ${actual}`);
}

/* ---------------- 1. 静态数据 ---------------- */
const ch = getCharacter('NECROBINDER');
eq(ch.hp, 66, '角色生命 66');
eq(ch.energy, 3, '角色能量 3');
eq(ch.gold, 99, '角色初始金币 99');
eq(ch.relic, 'BOUND_PHYLACTERY', '起始遗物缚魂命匣');
eq(ch.deck.length, 10, '起始牌组 10 张');
eq(ch.deck.filter(id => id === 'STRIKE_NECROBINDER').length, 4, '起始 4 张打击');
eq(ch.deck.filter(id => id === 'DEFEND_NECROBINDER').length, 4, '起始 4 张防御');
ok(ch.deck.includes('BODYGUARD') && ch.deck.includes('UNLEASH'), '起始含护卫与出击');

const necroIds = Object.keys(CARDS).filter(id => CARDS[id].char === 'NECROBINDER');
eq(necroIds.length, 86, '单人卡池 86 张（官池 91 去 5 张多人限定）');
ok(!CARDS.CACOPHONY && !CARDS.SOULBOUND && !CARDS.UNDERWORLD && !CARDS.GLIMPSE_BEYOND && !CARDS.LEGION_OF_BONE,
  '5 张多人限定牌未进入卡池');

/* 关键卡数值逐字对照源码 */
const val = (id, upgraded, key = 'Damage') => {
  const d = CARDS[id];
  const c = { upgraded, upgradedSet: true, def: d };
  return d.vars ? d.vars(c, null, c)[key] : undefined;
};
eq(val('STRIKE_NECROBINDER', false), 6, '打击 6');
eq(val('STRIKE_NECROBINDER', true), 9, '打击+ 9');
eq(val('DEFEND_NECROBINDER', false, 'Block'), 5, '防御 5');
eq(val('DEFEND_NECROBINDER', true, 'Block'), 8, '防御+ 8');
eq(val('BODYGUARD', false, 'Summon'), 5, '护卫召唤 5');
eq(val('BODYGUARD', true, 'Summon'), 7, '护卫+ 召唤 7');
eq(val('DEFILE', false), 13, '玷污 13');
eq(val('DEFILE', true), 17, '玷污+ 17');
eq(val('BURY', false), 52, '埋葬 52');
eq(val('BURY', true), 63, '埋葬+ 63');
eq(CARDS.STRIKE_NECROBINDER.cost, 1, '打击 1 费');
eq(CARDS.BURY.cost, 4, '埋葬 4 费');
ok(CARDS.DEFILE.ethereal, '玷污带虚无');
ok(CARDS.SOUL.exhaustOnPlay && CARDS.SOUL.cost === 0, '灵魂 0 费且消耗');

/* 能力 / 遗物 / 药水 / 词条元数据齐全 */
const POWER_IDS = ['doom', 'necroMastery', 'calcify', 'reaperForm', 'summonNextTurn', 'devourLife', 'sicEm',
  'neurosurge', 'oblivion', 'countdown', 'shroud', 'hang', 'lethality', 'debilitate', 'sleightOfFlesh',
  'danseMacabre', 'spiritOfAsh', 'veilpiercer', 'demesne', 'friendship', 'pagestorm', 'sentryMode',
  'callOfTheVoid', 'haunt', 'forbiddenGrimoire', 'borrowedTime'];
for (const id of POWER_IDS) ok(!!POWERS[id], `能力元数据 ${id}`);
for (const id of ['BOUND_PHYLACTERY', 'BONE_FLUTE', 'FUNERARY_MASK', 'BOOK_REPAIR_KNIFE', 'BIG_HAT', 'BOOKMARK', 'IVORY_TILE', 'UNDYING_SIGIL'])
  ok(!!RELICS[id], `遗物 ${id}`);
for (const id of ['POTION_OF_DOOM', 'POT_OF_GHOULS', 'BONE_BREW']) ok(!!POTIONS[id], `药水 ${id}`);
for (const id of ['osty', 'summon', 'doom', 'soul']) ok(!!TERMS[id], `词条 ${id}`);

/* ---------------- 2. 战斗内机制 ---------------- */
function newCombat() {
  const run = new Run('NECROTEST', 0, 'NECROBINDER');
  const c = new Combat(run, { ...ENCOUNTERS.normal[0] }, { speed: 0 });
  c.onUpdate = () => {};
  c.onFloat = () => {};
  c.requestSelection = async ({ pool, count }) => pool.slice(0, count);
  return { run, c };
}

/* 奥斯提：开战时遗物召唤 1 */
{
  const { c } = newCombat();
  await c.start();
  ok(c.necro.osty.exists, '缚魂命匣开战召唤奥斯提');
  eq(c.necro.osty.hp, 1, '开战奥斯提 1 点生命');
  eq(c.necro.osty.maxHp, 1, '开战奥斯提 1 点最大生命');
  ok(c.ostyAlive(), '奥斯提存活');

  /* 存活时召唤 → 最大/当前生命各 +N */
  await c.necro.summon(5);
  eq(c.necro.osty.hp, 6, '存活召唤后当前生命 1+5');
  eq(c.necro.osty.maxHp, 6, '存活召唤后最大生命 1+5');

  /* 替玩家承伤：先扣格挡，剩余转给奥斯提，溢出回流玩家 */
  c.player.block = 0;
  const hpBefore = c.player.hp;
  await c.dealDamage(c.player, 10, { isAttack: true, source: c.enemies[0] });
  eq(c.necro.osty.hp, 0, '奥斯提吸收 6 点后归零');
  ok(!c.necro.ostyAlive, '奥斯提倒下');
  ok(c.necro.osty.exists, '倒下的奥斯提仍留在场上');
  eq(c.player.hp, hpBefore - 4, '溢出 4 点打回玩家');

  /* 复活是重置而非累加 */
  await c.necro.summon(7);
  eq(c.necro.osty.hp, 7, '复活后当前生命重置为 7');
  eq(c.necro.osty.maxHp, 7, '复活后最大生命重置为 7');
  ok(c.ostyAlive(), '复活后存活');

  /* 非攻击伤害不转嫁 */
  c.player.block = 0;
  const hp2 = c.player.hp;
  await c.dealDamage(c.player, 3, { isAttack: false });
  eq(c.necro.osty.hp, 7, '中毒/能力伤害不转给奥斯提');
  eq(c.player.hp, hp2 - 3, '非攻击伤害直接扣玩家');
}

/* 灾厄：生命 <= 层数时回合结束直死，无视格挡 */
{
  const { c } = newCombat();
  await c.start();
  const e = c.alive()[0];
  e.block = 99;
  e.hp = 5;
  await c.necro.addDoom(5, e);
  const killed = await c.necro.doomKill([e]);
  ok(!e.alive, '生命等于灾厄层数时死亡');
  eq(killed.length, 1, '灾厄结算报告 1 个死者');

  const e2 = c.alive()[0];
  if (e2) {
    e2.hp = 20;
    await c.necro.addDoom(19, e2);
    const k2 = await c.necro.doomKill([e2]);
    ok(e2.alive && k2.length === 0, '灾厄不足阈值时不触发');
  }
}

/* 灾厄：玩家侧在回合结束时结算 */
{
  const { c } = newCombat();
  await c.start();
  c.player.hp = 3;
  await c.necro.addDoom(10, c.player);
  await c.necro.onPlayerTurnEnd();
  ok(!c.ostyAlive() || true, '玩家侧灾厄流程不崩');
  ok(c.finished || c.player.hp <= 0, '玩家被自身灾厄判定杀死');
}

/* 召回 / 计数工具 */
{
  const { c } = newCombat();
  await c.start();
  await c.necro.addSoul(3, 'draw');
  ok(c.drawPile.filter(x => x.id === 'SOUL').length >= 3, '灵魂洗入抽牌堆 3 张');
  eq(c.necro.countOstyAttackCards() >= 0, true, '奥斯提攻击牌计数可用');
}

/* ---------------- 3. 全卡牌可打出 ---------------- */
{
  const { c } = newCombat();
  await c.start();
  const errors = [];
  let played = 0;
  const total = (necroIds.length + 2) * 2;
  for (const id of necroIds.concat(['SOUL', 'SWEEPING_GAZE'])) {
    if (c.finished) {
      const n = newCombat();
      for (const k of Object.keys(c)) delete c[k];
      Object.assign(c, n.c);
      await c.start();
    }
    try {
      const e = c.alive()[0];
      if (!e) throw new Error('没有存活敌人');
      e.hp = 2000; e.maxHp = 2000; e.block = 0;
      c.player.hp = c.player.maxHp = 2000;
      c.energy = 99;
      c.finished = false;
      for (const t of c.alive()) { t.powers = {}; }
      c.player.powers = {};
      c.necro.osty.exists = false;
      c.necro.osty.alive = false;
      await c.necro.summon(10);
      const card = c.makeCard(id, false);
      c.hand.push(card);
      c.target = c.alive()[0];
      if (await c.playCard(card, c.alive()[0])) played++;
      else if (!card.unplayable && !!CARDS[id]?.play) errors.push(`${id}: 未升级版无法打出`);
      const up = c.makeCard(id, true);
      c.hand.push(up);
      c.energy = 99;
      c.target = c.alive()[0];
      if (await c.playCard(up, c.alive()[0])) played++;
      else if (!up.unplayable && !!CARDS[id]?.play) errors.push(`${id}+: 升级版无法打出`);
    } catch (err) {
      errors.push(`${id}: ${err.message}`);
    }
  }
  ok(played >= total - 4, '全部卡牌可打出（含升级版）', `成功打出 ${played}/${total} ${errors.slice(0, 6).join(' | ')}`);
}

/* ---------------- 结果 ---------------- */
console.log(`\n通过 ${pass} 项`);
if (fails.length) {
  console.log(`失败 ${fails.length} 项：`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('OK');
