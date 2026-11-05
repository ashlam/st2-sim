/**
 * 充能球机制自测（无界面）。
 *   node tools/orbtest.mjs
 * 覆盖：生成/栏位溢出/激发/集中/黑暗累积/玻璃衰减/等离子能量/破损核心
 */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { ENCOUNTERS } from '../src/data/enemies.js';

let fails = 0;
function ok(cond, label, extra = '') {
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
}

const enc = { ...ENCOUNTERS.normal[0], units: [['NIBBIT']] };

/** 造一场战斗：deck 为卡牌 id 数组 */
async function makeCombat(deck, asc = 0) {
  const run = new Run('ORBTEST', asc, 'DEFECT');
  run.deck = deck.map((id, i) => ({ id, upgraded: false, uid: 'd' + i }));
  run.relics = [];
  run.combatCount = 1;
  const c = new Combat(run, JSON.parse(JSON.stringify(enc)), { speed: 0 });
  c.onUpdate = () => {};
  c.onFloat = () => {};
  c.onLog = () => {};
  c.requestSelection = null;
  return c;
}

/* 1. 破损核心：战斗开始生成 1 个闪电球 */
{
  const run = new Run('ORBTEST', 0, 'DEFECT');
  run.deck = [{ id: 'STRIKE_DEFECT', upgraded: false, uid: 'd0' }];
  const c = new Combat(run, JSON.parse(JSON.stringify(enc)), { speed: 0 });
  c.onUpdate = () => {}; c.onFloat = () => {}; c.onLog = () => {};
  await c.start();
  ok(run.relics.includes('CRACKED_CORE'), '起手带破损核心');
  ok(c.player.orbs.length === 1 && c.player.orbs[0].kind === 'LIGHTNING', '开局 1 个闪电球', JSON.stringify(c.player.orbs.map(o => o.kind)));
  ok(c.maxOrbSlots === 3, '初始 3 个栏位', String(c.maxOrbSlots));
}

/* 2. 闪电被动：回合结束打 3；激发打 8 */
{
  const c = await makeCombat(['ZAP', 'ZAP', 'STRIKE_DEFECT', 'STRIKE_DEFECT', 'STRIKE_DEFECT']);
  await c.start();
  await c.channelOrb('LIGHTNING');
  const hpBefore = c.alive()[0].hp;
  await c.endTurn();
  const afterPassive = c.alive()[0] ? c.alive()[0].hp : 0;
  ok(hpBefore - afterPassive === 3 || !c.alive()[0], '闪电被动 3 点', `${hpBefore} → ${afterPassive}`);
}

/* 3. 栏位溢出：第 4 个球会先激发最左边那个 */
{
  const c = await makeCombat(['ZAP']);
  await c.start();
  c.maxOrbSlots = 2;
  c.player.orbs = [];
  const e = c.alive()[0];
  e.hp = 200; e.maxHp = 200;
  await c.channelOrb('FROST');
  await c.channelOrb('FROST');
  ok(c.player.orbs.length === 2, '两个冰霜球填满 2 个栏位');
  const blockBefore = c.player.block;
  await c.channelOrb('LIGHTNING');
  ok(c.player.orbs.length === 2, '生成第 3 个时仍然是 2 个（溢出激发）');
  ok(c.player.orbs[1].kind === 'LIGHTNING', '新球排在右边');
  ok(c.player.block === blockBefore + 5, '被挤掉的冰霜球激发了 5 点格挡', `${blockBefore} → ${c.player.block}`);
}

/* 4. 集中：冰霜被动/激发都 +2 */
{
  const c = await makeCombat(['ZAP']);
  await c.start();
  c.player.orbs = [];
  await c.addPower('focus', 2);
  await c.channelOrb('FROST');
  const b0 = c.player.block;
  await c.orbPassive(c.player.orbs[0]);
  ok(c.player.block === b0 + 4, '集中2：冰霜被动 4 点格挡', String(c.player.block - b0));
  const b1 = c.player.block;
  await c.evokeFirst(1);
  ok(c.player.block === b1 + 7, '集中2：冰霜激发 7 点格挡', String(c.player.block - b1));
}

/* 5. 黑暗：被动累加，激发打血最少的敌人 */
{
  const c = await makeCombat(['ZAP']);
  await c.start();
  c.player.orbs = [];
  const a = c.alive()[0]; a.hp = 200; a.maxHp = 200;
  await c.channelOrb('DARK');
  const orb = c.player.orbs[0];
  ok(orb.value === 6, '黑暗初始激发值 6', String(orb.value));
  await c.orbPassive(orb);
  ok(orb.value === 12, '被动 +6 → 12', String(orb.value));
  const before = a.hp;
  await c.evokeFirst(1);
  ok(before - a.hp === 12, '激发 12 点', `${before} → ${a.hp}`);
}

/* 6. 玻璃：被动 4 递减；激发翻倍 */
{
  const c = await makeCombat(['ZAP']);
  await c.start();
  c.player.orbs = [];
  const a = c.alive()[0]; a.hp = 200; a.maxHp = 200;
  await c.channelOrb('GLASS');
  const orb = c.player.orbs[0];
  await c.orbPassive(orb);
  ok(a.hp === 196 && orb.value === 3, '玻璃被动 4 点后变 3', `hp=${a.hp} v=${orb.value}`);
  const before = a.hp;
  await c.evokeFirst(1);
  ok(before - a.hp === 6, '玻璃激发 3×2=6', String(before - a.hp));
}

/* 7. 等离子：回合开始 +1 能量，激发 +2 */
{
  const c = await makeCombat(['ZAP']);
  await c.start();
  c.player.orbs = [];
  await c.channelOrb('PLASMA');
  const e0 = c.energy;
  await c.endTurn();
  ok(c.energy === 3 + 1, '等离子回合开始 +1 能量', `能量 ${c.energy}`);
  c.gainEnergy(0);
  c.player.orbs = [];
  await c.channelOrb('PLASMA');
  const e1 = c.energy;
  await c.evokeFirst(1);
  ok(c.energy === e1 + 2, '等离子激发 +2 能量', `${e1} → ${c.energy}`);
}

/* 8. 双重释放：激发两次再移出队列 */
{
  const c = await makeCombat(['DUALCAST']);
  await c.start();
  c.player.orbs = [];
  const a = c.alive()[0]; a.hp = 200; a.maxHp = 200;
  await c.channelOrb('LIGHTNING');
  const before = a.hp;
  await c.evokeFirst(2);
  ok(before - a.hp === 16, '双重释放 = 8×2', String(before - a.hp));
  ok(c.player.orbs.length === 0, '激发后球被移除');
}

/* 9. 扩容 / 暴涨 改栏位 */
{
  const c = await makeCombat(['CAPACITOR']);
  await c.start();
  await c.addOrbSlots(2);
  ok(c.maxOrbSlots === 5, '扩容 +2 → 5', String(c.maxOrbSlots));
  await c.removeOrbSlots(1);
  ok(c.maxOrbSlots === 4, '暴涨 -1 → 4', String(c.maxOrbSlots));
}

/* 10. 雷霆：激发闪电时额外伤害 */
{
  const c = await makeCombat(['ZAP']);
  await c.start();
  c.player.orbs = [];
  const a = c.alive()[0]; a.hp = 200; a.maxHp = 200;
  await c.addPower('thunder', 8);
  await c.channelOrb('LIGHTNING');
  const before = a.hp;
  await c.evokeFirst(1);
  ok(before - a.hp === 16, '雷霆：8（激发）+8（雷霆）', String(before - a.hp));
}

/* 11. 卡牌可打出性：全部 Defect 卡至少能在一场战斗里跑一遍 */
{
  const { CARDS } = await import('../src/data/cards.js');
  const ids = Object.keys(CARDS).filter(id => CARDS[id].char === 'DEFECT' && CARDS[id].type !== 'power');
  let bad = [];
  for (const id of ids) {
    const c = await makeCombat(['ZAP', 'ZAP', 'ZAP', 'ZAP', 'ZAP', 'ZAP', 'ZAP', 'ZAP', 'ZAP', 'ZAP']);
    await c.start();
    c.player.orbs = [];
    c.maxOrbSlots = 3;
    await c.channelOrb('LIGHTNING');
    await c.channelOrb('FROST');
    await c.channelOrb('DARK');
    c.maxOrbSlots = 5;
    await c.channelOrb('GLASS');
    await c.channelOrb('PLASMA');
    c.energy = 9;
    c.hand = [];
    const card = (await import('../src/data/cards.js')).makeCard(id, false);
    c.hand.push(card);
    try {
      await c.playCard(card, c.alive()[0]);
    } catch (e) {
      bad.push(id + ':' + e.message);
    }
  }
  ok(bad.length === 0, `${ids.length} 张非能力牌都能打出`, bad.join(' | '));

  const powers = Object.keys(CARDS).filter(id => CARDS[id].char === 'DEFECT' && CARDS[id].type === 'power');
  bad = [];
  for (const id of powers) {
    const c = await makeCombat(['ZAP']);
    await c.start();
    c.energy = 9;
    c.hand = [];
    const card = (await import('../src/data/cards.js')).makeCard(id, false);
    c.hand.push(card);
    try { await c.playCard(card, c.alive()[0]); }
    catch (e) { bad.push(id + ':' + e.message); }
  }
  ok(bad.length === 0, `${powers.length} 张能力牌都能打出`, bad.join(' | '));
}

/* 11. 能力牌联动：雷暴 / 冷却剂 / 偏差认知 / 回响形态 / 野性 / 缓冲 */
{
  const { makeCard } = await import('../src/data/cards.js');
  const play = async (c, id) => {
    const card = makeCard(id);
    c.hand.push(card);
    return c.playCard(card, c.alive()[0]);
  };

  // 雷暴：打能力牌生成闪电
  const c1 = await makeCombat(['ZAP']);
  await c1.start(); c1.player.orbs = []; c1.energy = 9;
  await play(c1, 'STORM');
  ok(c1.player.orbs.length === 1 && c1.player.orbs[0].kind === 'LIGHTNING', '雷暴：打能力牌生成闪电');

  // 冷却剂：回合开始按"不同种类"给格挡
  const c2 = await makeCombat(['ZAP', 'ZAP', 'ZAP', 'ZAP', 'ZAP']);
  await c2.start(); c2.player.orbs = []; c2.energy = 9;
  await c2.channelOrb('FROST'); await c2.channelOrb('FROST'); await c2.channelOrb('DARK');
  await play(c2, 'COOLANT');
  c2.player.block = 0;
  await c2.endTurn();
  ok(c2.player.block === 4, '冷却剂：2 种不同的球 × 2 点格挡', String(c2.player.block));

  // 偏差认知：回合开始掉集中
  const c3 = await makeCombat(['ZAP', 'ZAP', 'ZAP', 'ZAP', 'ZAP']);
  await c3.start(); c3.energy = 9;
  await play(c3, 'BIASED_COGNITION');
  const f1 = c3.player.powers.focus;
  await c3.endTurn();
  ok(f1 === 5 && c3.player.powers.focus === 4, '偏差认知：5 集中，回合开始剩 4', `${f1} → ${c3.player.powers.focus}`);

  // 回响形态：每回合第一张牌打两次
  const c4 = await makeCombat(['ZAP']);
  await c4.start();
  const e4 = c4.alive()[0]; e4.hp = 300; e4.maxHp = 300;
  c4.energy = 9;
  await play(c4, 'ECHO_FORM');
  let hp = e4.hp;
  await play(c4, 'STRIKE_DEFECT');
  ok(hp - e4.hp === 12, '回响形态：打击打两次（6×2）', String(hp - e4.hp));

  // 野性：0 费攻击打完回手
  const c5 = await makeCombat(['ZAP']);
  await c5.start(); c5.energy = 9;
  await play(c5, 'FERAL');
  const claw = makeCard('CLAW');
  c5.hand.push(claw);
  await c5.playCard(claw, c5.alive()[0]);
  ok(c5.hand.includes(claw), '野性：爪击回到手牌');

  // 缓冲：挡住一次生命损失
  const c6 = await makeCombat(['ZAP']);
  await c6.start(); c6.energy = 9;
  await play(c6, 'BUFFER');
  const hp6 = c6.player.hp;
  await c6.dealDamage(c6.player, 12, {});
  ok(c6.player.hp === hp6, '缓冲：挡下 12 点伤害', `${hp6} → ${c6.player.hp}`);
  await c6.dealDamage(c6.player, 12, {});
  ok(c6.player.hp === hp6 - 12, '缓冲只挡一次', `${hp6} → ${c6.player.hp}`);
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
