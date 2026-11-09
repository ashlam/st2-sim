/** 事件牌 / 诅咒 / 事件遗物的机制自检（纯引擎，无浏览器） */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { makeCard } from '../src/data/cards.js';
import { ENCOUNTERS } from '../src/data/enemies.js';

const ok = [];
const bad = [];
const t = (name, cond, extra = '') => (cond ? ok : bad).push(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);

function newCombat(extraDeck = [], relics = [], charId = 'IRONCLAD') {
  const run = new Run('EVENTCARD', 0, charId);
  for (const id of extraDeck) run.addCard(id);
  for (const r of relics) run.addRelic(r);
  // 选一个没有开场格挡/人工制品的编组，便于核对纯伤害数值
  const enc = { ...ENCOUNTERS.weak[0] };
  const c = new Combat(run, enc, { speed: 0 });
  c.onUpdate = () => {};
  c.onFloat = () => {};
  return c;
}

/* 1. 诅咒：回合结束时留在手里才触发 */
{
  const c = newCombat(['DECAY']);
  c.player.hp = 80; c.player.maxHp = 80;
  await c.start();
  const decay = makeCard('DECAY');
  c.hand.push(decay);
  const before = c.player.hp;
  await c.endTurn();
  t('腐朽：回合结束受 2 点伤害', c.player.hp <= before - 2, `${before} → ${c.player.hp}`);
}

{
  const c = newCombat(['BAD_LUCK']);
  c.player.hp = 80; c.player.maxHp = 80;
  await c.start();
  c.hand.push(makeCard('BAD_LUCK'));
  const before = c.player.hp;
  await c.endTurn();
  t('霉运：回合结束失去 13 点生命', before - c.player.hp >= 13, `${before} → ${c.player.hp}`);
}

{
  const c = newCombat(['REGRET']);
  c.player.hp = 80; c.player.maxHp = 80;
  await c.start();
  c.hand.push(makeCard('REGRET'));
  const handSize = c.hand.length;
  const before = c.player.hp;
  await c.endTurn();
  t('悔恨：按手牌数量失去生命', before - c.player.hp >= handSize, `手牌 ${handSize}，失去 ${before - c.player.hp}`);
}

{
  const c = newCombat(['DOUBT', 'SHAME']);
  c.player.hp = 80; c.player.maxHp = 80;
  await c.start();
  c.hand.push(makeCard('DOUBT'), makeCard('SHAME'));
  await c.endTurn();
  t('疑虑 / 羞耻：回合结束获得虚弱 / 脆弱', !!(c.player.powers.weak || c.player.powers.frail),
    JSON.stringify({ weak: c.player.powers.weak, frail: c.player.powers.frail }));
}

/* 2. 凡庸：每回合最多 3 张 */
{
  const c = newCombat(['NORMALITY']);
  await c.start();
  c.hand = [makeCard('NORMALITY'), makeCard('STRIKE_IRONCLAD'), makeCard('STRIKE_IRONCLAD'),
    makeCard('STRIKE_IRONCLAD'), makeCard('STRIKE_IRONCLAD')];
  c.energy = 10;
  c.cardsPlayedThisTurn = 3;
  const playable = c.hand.filter((x) => c.canPlay(x)).map((x) => x.id);
  t('凡庸：打出 3 张后其余牌不可打出', !playable.includes('STRIKE_IRONCLAD'), JSON.stringify(playable));
}

/* 3. 事件牌：数值 */
{
  const c = newCombat(['EXTERMINATE', 'SQUASH', 'ULTIMATE_STRIKE', 'ULTIMATE_DEFEND']);
  await c.start();
  c.hand = [makeCard('EXTERMINATE')];
  c.energy = 5;
  const hp0 = c.alive().map((e) => e.hp);
  await c.playCard(c.hand[0], c.alive()[0]);
  const hp1 = c.alive().map((e) => e.hp);
  t('杀灭：对全体 3 点 ×4', hp0[0] - hp1[0] === 12, `${hp0} → ${hp1}`);

  c.hand = [makeCard('SQUASH')];
  const vuln0 = c.alive()[0].powers.vulnerable || 0;
  const hpS0 = c.alive()[0].hp;
  await c.playCard(c.hand[0], c.alive()[0]);
  t('压扁：造成 10 点伤害', hpS0 - c.alive()[0].hp === 10, `${hpS0} → ${c.alive()[0]?.hp}`);
  t('压扁：10 伤害 + 2 易伤', (c.alive()[0].powers.vulnerable || 0) === vuln0 + 2,
    `易伤 ${vuln0} → ${c.alive()[0].powers.vulnerable}`);

  for (const e of c.alive()) e.block = 0;   // 清掉开场格挡，便于核对数值
  c.player.block = 0;
  c.hand = [makeCard('ULTIMATE_DEFEND')];
  await c.playCard(c.hand[0]);
  t('究极防御：11 点格挡', c.player.block === 11, String(c.player.block));
}

/* 4. 疯狂科学：技能 / 能力词条 */
{
  const c = newCombat(['MAD_SCIENCE_SKILL_ENERGIZED']);
  await c.start();
  c.hand = [makeCard('MAD_SCIENCE_SKILL_ENERGIZED')];
  c.energy = 3;
  const e0 = c.energy, b0 = c.player.block;
  await c.playCard(c.hand[0]);
  t('疯狂科学（技能·充能）：8 格挡 + 2 能量', c.player.block === b0 + 8 && c.energy === e0 - 1 + 2,
    JSON.stringify({ block: b0, energy: e0 }));
}
{
  const c = newCombat(['MAD_SCIENCE_POWER_CURIOUS']);
  await c.start();
  c.hand = [makeCard('MAD_SCIENCE_POWER_CURIOUS')];
  c.energy = 5;
  await c.playCard(c.hand[0]);
  const power = makeCard('INFLAME');
  t('疯狂科学（能力·好奇）：能力牌耗能 -1', c.costOf(power) === Math.max(0, power.cost - 1),
    `${power.cost} → ${c.costOf(power)}`);
}

/* 5. 开悟：手牌耗能降到 1 */
{
  const c = newCombat(['ENLIGHTENMENT']);
  await c.start();
  const big = makeCard('BASH');   // 2 费
  c.hand = [big, makeCard('ENLIGHTENMENT')];
  c.energy = 5;
  await c.playCard(c.hand[1]);
  t('开悟：手牌 2 费变 1 费', c.costOf(big) === 1, String(c.costOf(big)));
}

/* 6. 羽化：抽牌堆加入免费攻击牌 */
{
  const c = newCombat(['METAMORPHOSIS']);
  await c.start();
  c.hand = [makeCard('METAMORPHOSIS')];
  c.energy = 5;
  const d0 = c.drawPile.length;
  await c.playCard(c.hand[0]);
  const added = c.drawPile.length - d0;
  const free = c.drawPile.filter((x) => x.freeCombat).length;
  t('羽化：加入 3 张免费攻击牌', added === 3 && free === 3, `+${added}，免费 ${free}`);
}

/* 7. 事件遗物 */
{
  const c = newCombat([], ['BIG_MUSHROOM']);
  await c.start();
  t('大蘑菇：首回合少抽 2 张', c.hand.length === 3, `手牌 ${c.hand.length}`);
}
{
  const c = newCombat([], ['ROYAL_POISON']);
  c.player.hp = 50; c.player.maxHp = 80;
  await c.start();
  t('皇家毒药：首回合受到 4 点伤害', c.player.hp === 46, String(c.player.hp));
}
{
  const c = newCombat([], ['LOST_WISP']);
  await c.start();
  c.hand = [makeCard('INFLAME')];
  c.energy = 5;
  for (const e of c.alive()) e.block = 0;
  const hp0 = c.alive()[0].hp;
  await c.playCard(c.hand[0]);
  t('迷失鬼火：打出能力牌对全体造成 8 点伤害', c.alive()[0].hp <= hp0 - 8, `${hp0} → ${c.alive()[0].hp}`);
}
{
  const c = newCombat([], ['FORGOTTEN_SOUL']);
  await c.start();
  for (const e of c.alive()) e.block = 0;
  const hp0 = c.alive()[0].hp;
  await c.exhaustCard(makeCard('STRIKE_IRONCLAD'));
  t('遗忘之魂：消耗一张牌造成 1 点伤害', c.alive()[0].hp <= hp0 - 1, `${hp0} → ${c.alive()[0].hp}`);
}
{
  const c = newCombat([], ['POLLINOUS_CORE']);
  await c.start();
  let extra = 0;
  for (let i = 0; i < 4; i++) {
    const before = c.hand.length;
    await c.draw(1);
    if (c.hand.length > before + 1) extra++;
  }
  t('授粉核心：第 4 次抽牌多抽 2 张', extra === 1, `额外次数 ${extra}`);
}

for (const l of ok) console.log(l);
for (const l of bad) console.log(l);
console.log(bad.length === 0 ? 'OK' : `FAIL (${bad.length})`);
process.exit(bad.length ? 1 : 0);
