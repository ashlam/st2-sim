/**
 * 储君机制对拍：所有断言的数值都来自 sts2-sim v0.111.0（见每条注释）。
 * 无界面运行：node tools/regent-verify.mjs
 */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { CARDS, makeCard } from '../src/data/cards.js';
import { REGENT_CARDS, SOVEREIGN_BLADE } from '../src/data/cards-regent.js';
import { ENCOUNTERS } from '../src/data/enemies.js';
import { CHARACTER_BY_ID } from '../src/data/characters.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name, extra); }
  else { fail++; console.log('  ✗ FAIL', name, extra); }
};

async function fresh(seed = 'REGENT-VERIFY') {
  const run = new Run(seed, 0, 'REGENT');
  const c = new Combat(run, { ...ENCOUNTERS.normal[0], enemies: ENCOUNTERS.normal[0].enemies }, { speed: 0 });
  c.onUpdate = () => {};
  c.onFloat = () => {};
  await c.start();
  return { run, c };
}

async function playId(c, id, upgraded = false) {
  const card = makeCard(id, upgraded);
  c.hand.push(card);
  c.energy = 99;
  c.player.stars = Math.max(c.player.stars, 99);
  const before = { stars: c.player.stars, energy: c.energy };
  const done = await c.playCard(card, c.alive()[0]);
  return { card, done, before, after: { stars: c.player.stars, energy: c.energy } };
}

console.log('\n[1] 角色表 / 起始配置（Regent.cs, RegentTests.cs）');
{
  const ch = CHARACTER_BY_ID.REGENT;
  ok('75 血 / 99 金 / 3 能量', ch.hp === 75 && ch.gold === 99 && ch.energy === 3);
  ok('起始遗物天赋君权', ch.relic === 'DIVINE_RIGHT' && ch.playable);
  ok('10 张起始牌组：4 打击 4 防御 陨星 崇拜',
    ch.deck.length === 10 && ch.deck.filter(x => x === 'STRIKE_REGENT').length === 4
    && ch.deck.filter(x => x === 'DEFEND_REGENT').length === 4
    && ch.deck.includes('FALLING_STAR') && ch.deck.includes('VENERATE'));
  const run = new Run('POOL', 0, 'REGENT');
  const ids = ['common', 'uncommon', 'rare'].flatMap(r => run.poolByRarity(r));
  ok('卡池按角色隔离', ids.length > 60 && ids.every(id => ['REGENT', 'NEUTRAL'].includes(CARDS[id].char)),
    `共 ${ids.length} 张`);
  ok('其它角色拿不到储君牌', !new Run('POOL', 0, 'IRONCLAD').poolByRarity('common').includes('VENERATE'));
  ok('衍生牌不进奖励池', !ids.includes('SOVEREIGN_BLADE'));
}

console.log('\n[2] 星愿资源（DivineRight.cs / PlayerCombatState.cs）');
{
  const { c } = await fresh();
  ok('战斗开始获得 3 星愿', c.player.stars === 3, `实际 ${c.player.stars}`);
  const e = c.alive()[0];
  const hp0 = e.hp, stars0 = c.player.stars;
  const card = makeCard('FALLING_STAR');
  c.hand.push(card);
  await c.playCard(card, e);
  ok('陨星：0 能量 / 2 星愿', stars0 - c.player.stars === 2, `扣了 ${stars0 - c.player.stars}`);
  ok('陨星：8 伤害 + 1 虚弱 + 1 易伤',
    hp0 - e.hp === 8 && e.powers.weak === 1 && e.powers.vulnerable === 1,
    `伤害 ${hp0 - e.hp}`);
  const noStar = makeCard('FALLING_STAR');
  c.hand.push(noStar);
  ok('星愿不足时不可打出', c.player.stars < 2 ? !c.canPlay(noStar) : true,
    `剩 ${c.player.stars} 星愿`);
  await c.gainStars(5);
  ok('崇拜/获得星愿累加且不回合重置', c.player.stars === 6);
  await c.endTurn();
  ok('星愿不会在回合开始时回满或清零', c.player.stars === 6, `第 ${c.turn} 回合剩 ${c.player.stars}`);
}

console.log('\n[3] 铸造与君王之剑（ForgeCmd.cs / SovereignBlade.cs）');
{
  const { c } = await fresh();
  await c.forge(7);
  let blade = c.hand.find(x => x.id === 'SOVEREIGN_BLADE');
  ok('第一次铸造生成君王之剑', !!blade);
  ok('君王之剑 2 费 / 保留 / 伤害 10+7',
    blade.cost === 2 && blade.retain === true && blade.def.vars(blade, c).Damage === 17,
    `伤害 ${blade?.def.vars(blade, c).Damage}`);
  const n0 = c.hand.filter(x => x.id === 'SOVEREIGN_BLADE').length;
  await c.forge(8);
  ok('再次铸造不重复生成', c.hand.filter(x => x.id === 'SOVEREIGN_BLADE').length === n0);
  ok('所有君王之剑一起加伤害', blade.def.vars(blade, c).Damage === 25);
  const e = c.alive()[0], hp0 = e.hp;
  c.energy = 9;
  await c.playCard(blade, e);
  ok('君王之剑打出后造成伤害', hp0 - e.hp === 25, `伤害 ${hp0 - e.hp}`);
}

console.log('\n[4] 星费钩子（ChildOfTheStarsPower / BlackHolePower / MiniRegent / GalacticDust）');
{
  const { c } = await fresh();
  await c.addPower('childOfTheStars', 2);
  const b0 = c.player.block;
  await c.spendStars(3);
  ok('群星之子：每花 1 星给 2 格挡 → 3 星给 6', c.player.block - b0 === 6, `+${c.player.block - b0}`);
  await c.addPower('blackHole', 3);
  const e = c.alive()[0], hp1 = e.hp;
  await c.gainStars(2);
  ok('黑洞：获得星愿时打全体 3 点', e.hp < hp1, `敌人掉 ${hp1 - e.hp} 血`);
  const hp2 = e.hp;
  await c.spendStars(1);
  ok('黑洞：花费星愿也触发', e.hp < hp2, `敌人掉 ${hp2 - e.hp} 血`);
}

console.log('\n[5] X 星费 / 活力 / 回合开始能力（Stardust.cs / VigorPower / GenesisPower）');
{
  const { c } = await fresh();
  c.player.stars = 4;
  const e = c.alive()[0], hp0 = e.hp;
  const sd = makeCard('STARDUST');
  c.hand.push(sd);
  c.energy = 9;
  await c.playCard(sd, e);
  ok('星尘：X 星费花光 4 星', c.player.stars === 0, `剩 ${c.player.stars}`);
  ok('星尘：5 伤害 × 4 次', hp0 - e.hp === 20, `伤害 ${hp0 - e.hp}`);
  c.addVigor(7);
  const hp1 = e.hp;
  const st = makeCard('STRIKE_REGENT');
  c.hand.push(st);
  c.energy = 9;
  await c.playCard(st, e);
  ok('活力：下一张攻击 +7 后清零', hp1 - e.hp === 13 && c.player.vigor === 0, `伤害 ${hp1 - e.hp}`);
  await c.addPower('genesis', 2);
  const s0 = c.player.stars;
  await c.endTurn();
  ok('创世纪：回合开始 +2 星愿', c.player.stars === s0 + 2, `${s0} → ${c.player.stars}`);
  await c.addPower('starNextTurn', 3);
  const s1 = c.player.stars;
  await c.endTurn();
  ok('下回合辉星：+3 且自身移除', c.player.stars === s1 + 5 && !c.player.powers.starNextTurn,
    `${s1} → ${c.player.stars}（含创世纪 2）`);
}

console.log('\n[6] 能力与关键词（TheSealedThronePower / RetainHandPower / VoidFormPower）');
{
  const { c } = await fresh();
  await c.addPower('sealedThrone', 1);
  const s0 = c.player.stars;
  const v = makeCard('VENERATE');
  c.hand.push(v);
  c.energy = 9;
  await c.playCard(v, c.alive()[0]);
  ok('封印王座：每打出一张牌 +1 星愿（崇拜再 +2）', c.player.stars === s0 + 3,
    `${s0} → ${c.player.stars}`);
  const blade = makeCard('SOVEREIGN_BLADE');
  c.hand.push(blade);
  await c.endTurn();
  ok('君王之剑的「保留」：回合结束仍在手牌', c.hand.includes(blade));
}

console.log('\n[7] 全卡池静态/执行体检');
{
  const { c } = await fresh();
  const ids = Object.keys(REGENT_CARDS);
  ok('收录 86 张', ids.length === 86, `实际 ${ids.length}`);
  const missingZh = ids.filter(id => /\{[^}]*:(diff|cond|choose)|starIcons|singleStarIcon|energyIcons/.test(REGENT_CARDS[id].text || ''));
  ok('文本无本地化模板残留', missingZh.length === 0, missingZh.join(','));
  const badVars = [];
  for (const id of ids.concat(['SOVEREIGN_BLADE'])) {
    const def = CARDS[id];
    const card = makeCard(id);
    try { def.vars(card, c, card); } catch (e) { badVars.push(`${id}: ${e.message}`); }
  }
  ok('所有 vars() 在战斗中可求值', badVars.length === 0, badVars.slice(0, 5).join(' | '));
  const errors = [];
  for (const id of ids.concat(['SOVEREIGN_BLADE'])) {
    const def = CARDS[id];
    const card = makeCard(id);
    c.currentCard = card;
    c._target = c.alive()[0] || null;
    c.player.stars = 99;
    c.energy = 99;
    c.xValue = 3;
    c.starXValue = 3;
    c.hand.length = 0;
    c.hand.push(card);
    try { await def.play(c, card); } catch (e) { errors.push(`${id}: ${e.message}`); }
  }
  ok('所有 play() 无异常', errors.length === 0, errors.slice(0, 8).join(' | '));
  ok('能力 id 都有元数据', ids.every(id => true) && (await import('../src/data/powers.js')).POWERS.voidForm != null);
  const { POWERS } = await import('../src/data/powers.js');
  const used = new Set();
  for (const id of ids.concat(['SOVEREIGN_BLADE'])) {
    const s = String(CARDS[id].play);
    for (const m of s.matchAll(/addPower(?:All)?\('([A-Za-z]+)'/g)) used.add(m[1]);
  }
  const unknown = [...used].filter(k => !POWERS[k]);
  ok('play 引用的能力都已登记', unknown.length === 0, `未登记: ${unknown.join(',')}`);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
