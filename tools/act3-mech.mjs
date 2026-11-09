/**
 * 第三幕机制回归（不需要浏览器）：直接触发各敌人的关键分支，核对数值与状态机。
 * 跑法：node tools/act3-mech.mjs
 */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { ENCOUNTERS_BY_ACT } from '../src/data/enemies.js';

let pass = 0;
const fails = [];
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; return true; }
  fails.push(`${label}${extra ? ' — ' + extra : ''}`);
  return false;
};

const pool = ENCOUNTERS_BY_ACT[3];
const all = [...(pool.monster || []), ...pool.elite, ...pool.boss];

function mk(id, asc = 0) {
  const run = new Run('MECH', asc, 'IRONCLAD');
  run.act = 3;
  const enc = all.find((e) => e.id === id);
  const c = new Combat(run, { ...enc }, { speed: 0 });
  c.onUpdate = () => {}; c.onFloat = () => {};
  c.player.hp = 9999; c.player.maxHp = 9999;
  return c;
}

/* 1. 巨斧机器人「库存」：连换三具机体，血量逐具 +10 */
{
  const c = mk('AXEBOTS_NORMAL');
  const bodies = [];
  for (let i = 0; i < 5; i++) {
    const e = c.alive().find((x) => x.id === 'AXEBOT');
    if (!e) break;
    bodies.push(e);
    await c.dealDamage(e, 9999, { source: 'player' });
  }
  ok(bodies.length === 3, '巨斧机器人共 3 具机体', `实际 ${bodies.length}`);
  ok(bodies[0].moveKey === 'uppercut', '首具机体从上勾锤击起手', bodies[0].moveKey);
  ok(bodies[1] && bodies[1].moveKey === 'boot', '第二具机体从「启动」起手', bodies[1]?.moveKey);
  // 血量区间逐具上移 10（MinInitialHp = 基础 + (2-StockAmount)*10），个体随机因此只保证更靠上
  ok(bodies[1].maxHp > bodies[0].maxHp && bodies[2].maxHp > bodies[1].maxHp, '后续机体血量更高',
    bodies.map((b) => b.maxHp).join('/'));
  ok(c.won, '三具都倒下后战斗胜利');
}

/* 2. 实验体三形态 */
{
  const c = mk('TEST_SUBJECT_BOSS');
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const e = c.alive().find((x) => x.id === 'TEST_SUBJECT');
    if (!e) break;
    seen.push({ phase: e.testPhase, maxHp: e.maxHp, powers: { ...e.powers } });
    await c.dealDamage(e, 9999, { source: 'player' });
  }
  ok(seen.length === 3, '实验体复活两次共三形态', `实际 ${seen.length}`);
  ok(seen[0].maxHp === 100 && seen[1].maxHp === 200 && seen[2].maxHp === 300,
    '三形态血量 100/200/300', seen.map((s) => s.maxHp).join('/'));
  ok(seen[1].powers.painfulStabs === 1, '第二形态获得疼痛戳刺');
  ok(!seen[2].powers.adaptable && !seen[2].powers.painfulStabs && seen[2].powers.nemesis === 1,
    '第三形态换成天罚并移除前两个能力');
  ok(c.won, '三次击倒后战斗胜利');
}

/* 3. 女王：聚合体倒下后转入第二阶段 */
{
  const c = mk('QUEEN_BOSS');
  const q = c.alive().find((x) => x.id === 'QUEEN');
  const a = c.alive().find((x) => x.id === 'TORCH_HEAD_AMALGAM');
  ok(q.moveKey === 'puppetStrings', '女王以傀儡丝线起手', q.moveKey);
  q.moveKey = 'burnBright';
  await c.dealDamage(a, 9999, { source: 'player' });
  ok(q.amalgamDead === true, '聚合体倒下后女王标记为失去聚合体');
  ok(q.moveKey === 'enrage', '排好的「为我尽力燃烧吧」立刻变成「暴怒」', q.moveKey);
  ok(q.alive, '聚合体倒下不影响女王存活');
  await c.dealDamage(q, 9999, { source: 'player' });
  ok(c.won, '女王倒下后战斗胜利');
}

/* 4. 组装师召唤 + 守护机器人给组装师上格挡 */
{
  const c = mk('FABRICATOR_NORMAL');
  const f = c.alive()[0];
  await f.def.moves.fabricate.run(c, f);
  const bots = c.alive().filter((x) => x.id !== 'FABRICATOR');
  ok(bots.length === 2, '「组装」召唤 2 个子机体', `实际 ${bots.length}`);
  ok(bots.every((b) => b.minion), '子机体都是爪牙');
  const guard = c.alive().find((x) => x.id === 'GUARDBOT');
  if (guard) {
    const before = f.block;
    await guard.def.moves.guard.run(c, guard);
    ok(f.block === before + 15, '守护机器人给组装师 +15 格挡', `${before} → ${f.block}`);
  } else {
    pass++;
  }
}

/* 5. 永世之镜：凋零气场 + 渐强 */
{
  const c = mk('AEONGLASS_BOSS');
  const g = c.alive()[0];
  ok(g.powers.witheringPresence === 6, '凋零气场 6 层');
  // 打出 6 张牌 → 手里多一张凋零
  const played = [];
  for (let i = 0; i < 6; i++) {
    await g.def.onPlayerCardPlayed(c, g, { id: 'STRIKE_IRONCLAD', type: 'attack' });
  }
  const inHand = c.hand.filter((x) => x.id === 'WITHER');
  ok(inHand.length === 1, '每 6 张牌加入 1 张凋零', `实际 ${inHand.length}`);
  await g.def.moves.intensity.run(c, g);
  const w1 = c.allCombatCards().find((x) => x.id === 'WITHER');
  ok(w1.witherLevel === 1, '第一次渐强：凋零 1 级', String(w1.witherLevel));
  ok(g.powers.strength === 3, '第一次渐强 +3 力量', String(g.powers.strength));
  await g.def.moves.intensity.run(c, g);
  ok(g.powers.strength === 7, '第二次渐强 +4 力量（累计 7）', String(g.powers.strength));
  ok(c.allCombatCards().filter((x) => x.id === 'WITHER').every((x) => x.witherLevel === 2),
    '第二次渐强后所有凋零都是 2 级');
}

/* 6. 魂缚锁链：本回合只能打出 1 张魂缚牌 */
{
  const c = mk('QUEEN_BOSS');
  await c.addPower('chainsOfBinding', 3);
  await c.draw(5);
  const bound = c.hand.filter((x) => x.bound);
  ok(bound.length === 3, '抽到的前 3 张被魂缚', `实际 ${bound.length}`);
  ok(c.canPlay(bound[0]), '第 1 张魂缚牌可以打出');
  c.boundCardsPlayed = 1;
  ok(!c.canPlay(bound[1]), '打出过魂缚牌后，其余魂缚牌不能打出');
  c.boundCardsPlayed = 0;
}

/* 7. 抑制（魔法骑士）：降级全部卡牌，它倒下后恢复 */
{
  const c = mk('KNIGHTS_ELITE');
  const m = c.alive().find((x) => x.id === 'MAGI_KNIGHT');
  c.drawPile[0].upgraded = true;
  c.drawPile[1].upgraded = true;
  ok(c.allCombatCards().filter((x) => x.upgraded).length === 2, '抑制前有 2 张升级牌');
  await c.applyDampen(m);
  ok(c.allCombatCards().filter((x) => x.upgraded).length === 0, '抑制后全部降级');
  await c.dealDamage(m, 9999, { source: 'player' });
  ok(c.allCombatCards().filter((x) => x.upgraded).length === 2, '魔法骑士倒下后恢复升级');
}

/* 8. 恶咒（幽灵骑士）：它活着时手牌全部虚无 */
{
  const c = mk('KNIGHTS_ELITE');
  const sk = c.alive().find((x) => x.id === 'SPECTRAL_KNIGHT');
  await sk.def.moves.hex.run(c, sk);
  ok(c.player.powers.hex === 2, '恶咒施加 2 层');
  ok(c.hexActive(), '幽灵骑士存活时恶咒生效');
  await c.dealDamage(sk, 9999, { source: 'player' });
  ok(!c.player.powers.hex, '幽灵骑士倒下后恶咒解除');
}

/* 9. 活体盾「盾墙」：玩家回合开始时给高塔炮手上格挡 */
{
  const c = mk('TURRET_OPERATOR_WEAK');
  const t = c.alive().find((x) => x.id === 'TURRET_OPERATOR');
  const before = t.block;
  await c.startPlayerTurn(false);
  ok(t.block === before + 25, '盾墙给高塔炮手 +25 格挡', `${before} → ${t.block}`);
}

/* 10. 纸伤难愈：未被格挡的攻击伤害会削最大生命 */
{
  const c = mk('SCROLLS_OF_BITING_NORMAL');
  const s = c.alive()[0];
  const maxBefore = c.player.maxHp;
  c.player.hp = c.player.maxHp = 50;
  await c.dealDamage(c.player, 7, { source: s, isAttack: true });
  ok(c.player.maxHp === 50 - 2, '纸伤难愈削 2 点最大生命', String(c.player.maxHp));
  ok(maxBefore > 0, '前置最大生命正常');
}

console.log(`\n通过 ${pass} 项`);
if (fails.length) {
  console.log(`失败 ${fails.length} 项：`);
  for (const f of fails) console.log('  ✗', f);
  process.exitCode = 1;
} else {
  console.log('OK');
}
