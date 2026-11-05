/**
 * 平衡性抽样：用一个"新手水平"的启发式策略跑多局，统计胜率 / 平均层数。
 * 同时是引擎的压力测试（大量随机种子 × 全部第一幕遭遇）。
 *
 *   node tools/balance.mjs 50 0
 *   node tools/balance.mjs 50 10 -v
 */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { CARDS, makeCard } from '../src/data/cards.js';
import { POTIONS } from '../src/data/items.js';

const N = Number(process.argv[2] || 50);
const ASC = Number(process.argv[3] || 0);
const CHAR = process.argv.find(a => a.startsWith('--char='))?.split('=')[1] || 'IRONCLAD';
const VERBOSE = process.argv.includes('-v');

/* ---------------- 评估 ---------------- */

function varsOf(id) {
  const def = CARDS[id];
  if (!def) return {};
  try {
    const inst = makeCard(id, false);
    return def.vars?.(inst, null, inst) || {};
  } catch { return {}; }
}

/** 卡牌静态质量分（用于选牌/升级） */
function cardQuality(id) {
  const def = CARDS[id];
  if (!def) return -99;
  if (def.type === 'status' || def.type === 'curse') return -99;
  const v = varsOf(id);
  const dmg = (v.Damage || 0) * (v.Times || 1);
  const block = v.Block || 0;
  const cost = typeof def.cost === 'number' ? Math.max(0.5, def.cost) : 1;
  let s = (dmg * 1.1 + block * 0.95) / Math.sqrt(cost);
  if (def.type === 'power') s += 14;
  if (def.tags?.includes('exhaust') && dmg + block === 0) s -= 4;
  if (def.ethereal) s -= 3;
  return s;
}

/** 本回合敌人会打出的总伤害 */
function incoming(c) {
  return c.alive().reduce((s, e) => {
    const it = c.intentOf(e);
    if (it.type !== 'attack') return s;
    return s + it.dmg * (it.times || 1);
  }, 0);
}

function pickTarget(c, card) {
  const alive = c.alive();
  if (!alive.length) return null;
  const v = varsOf(card.id);
  const dmg = c.calcPlayerAttack ? 0 : (v.Damage || 0);
  // 优先能一刀打死的残血敌人
  const killable = alive.filter(e => e.hp <= dmg * (v.Times || 1) && e.block === 0);
  if (killable.length) return killable.sort((a, b) => a.hp - b.hp)[0];
  return alive.slice().sort((a, b) => (a.hp + a.block) - (b.hp + b.block))[0];
}

function blockOf(card) {
  const v = varsOf(card.id);
  if (v.Block) return v.Block;
  // 少数卡用别的键名
  const keys = ['BlockPerCard', 'BlockGain'];
  for (const k of keys) if (v[k]) return v[k];
  return 0;
}

function dmgOf(card) {
  const v = varsOf(card.id);
  return (v.Damage || 0) * (v.Times || 1);
}

async function usePotionIfNeeded(c, run, kind) {
  const hpPct = c.player.hp / c.player.maxHp;
  const threshold = kind === 'boss' ? 0.55 : 0.35;
  if (hpPct > threshold) return;
  const idx = run.potions.findIndex(id => id && POTIONS[id] && POTIONS[id].special !== 'ashwater');
  if (idx < 0) return;
  const id = run.potions[idx];
  const def = POTIONS[id];
  c._target = c.alive()[0];
  await def.use(c, c.alive()[0]);
  run.removePotion(idx);
}

async function smartTurn(c) {
  let guard = 0;
  while (guard++ < 40) {
    if (c.finished || !c.alive().length) break;
    const playable = c.hand.filter(x => c.canPlay(x));
    if (!playable.length) break;

    const inc = incoming(c);
    const gap = Math.max(0, inc - c.player.block);

    // 1) 先补格挡，补不上就尽量挡（人类玩家的默认打法）
    if (gap > 0) {
      const blockers = playable
        .filter(x => blockOf(x) > 0 && c.costOf(x) > 0)
        .sort((a, b) => blockOf(b) / Math.max(1, c.costOf(b)) - blockOf(a) / Math.max(1, c.costOf(a)));
      if (blockers.length) {
        await c.playCard(blockers[0], pickTarget(c, blockers[0]));
        continue;
      }
    }

    // 2) 能力牌先铺
    const powers = playable.filter(x => x.type === 'power');
    if (powers.length) {
      await c.playCard(powers[0], pickTarget(c, powers[0]));
      continue;
    }

    // 3) 攻击：优先能补刀的目标
    const attacks = playable.filter(x => x.type === 'attack')
      .sort((a, b) => dmgOf(b) / Math.max(0.5, c.costOf(b)) - dmgOf(a) / Math.max(0.5, c.costOf(a)));
    if (attacks.length) {
      await c.playCard(attacks[0], pickTarget(c, attacks[0]));
      continue;
    }

    // 4) 剩下的技能
    const skills = playable.filter(x => x.type === 'skill')
      .sort((a, b) => blockOf(b) - blockOf(a));
    if (skills.length) {
      await c.playCard(skills[0], pickTarget(c, skills[0]));
      continue;
    }
    break;
  }
}

/* ---------------- 路线 ---------------- */

function pickPath(next, run) {
  const hpPct = run.hp / run.maxHp;
  const rank = (n) => {
    if (n.type === 'elite') return hpPct > 0.7 ? 5 : -5;
    if (n.type === 'rest') return hpPct < 0.6 ? 9 : 5;
    if (n.type === 'treasure') return 4;
    if (n.type === 'shop') return hpPct < 0.45 ? 6 : 2;
    if (n.type === 'unknown') return 3;
    if (n.type === 'monster') return 2;
    if (n.type === 'boss') return 0;
    return 1;
  };
  let best = next[0], bestScore = -99;
  for (const n of next) {
    const s = rank(n);
    if (s > bestScore) { bestScore = s; best = n; }
  }
  return best;
}

/* ---------------- 单局 ---------------- */

async function runOne(seed) {
  const run = new Run(seed, ASC, CHAR);
  let node = null;
  let floors = 0;
  let fights = 0;
  let hpAtBoss = null;

  while (floors < 25) {
    const next = node ? node.children : run.map.startNodes;
    if (!next || !next.length) break;
    node = pickPath(next, run);
    floors++;
    run.floor = floors;

    // ---- 休息处 ----
    if (node.type === 'rest') {
      if (run.hp / run.maxHp < 0.62) {
        run.heal(Math.floor(run.maxHp * 0.3));
      } else {
        const cand = run.deck.filter(d => !d.upgraded).sort((a, b) => cardQuality(b.id) - cardQuality(a.id))[0];
        if (cand) run.upgradeCardEntry(cand);
      }
      continue;
    }
    // ---- 宝箱：拿一件遗物（与原作一致，走随机池）----
    if (node.type === 'treasure') { run.addRelic(run.rollRelic()); continue; }
    // ---- 商店 / 未知：跳过（保守假设，不拿收益）----
    if (node.type === 'shop' || node.type === 'unknown') continue;

    // ---- 战斗 ----
    const kind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'normal';
    if (kind === 'boss') hpAtBoss = run.hp;
    const enc = run.rollEncounter(kind);
    run.combatCount++;
    const c = new Combat(run, enc, { speed: 0 });
    c.onUpdate = () => {};
    c.onFloat = () => {};
    await c.start();
    fights++;
    let guard = 0;
    while (!c.finished && guard++ < 400) {
      await smartTurn(c);
      if (c.finished) break;
      await usePotionIfNeeded(c, run, kind);
      if (c.finished) break;
      await c.endTurn();
    }
    run.hp = Math.max(0, c.player.hp);

    if (!c.won) return { win: false, floors, fights, hp: 0, hpAtBoss };

    // ---- 战斗奖励：三选一 + 偶尔掉药水 ----
    if (kind !== 'boss') {
      const opts = run.rollCardReward(3);
      const best = opts
        .map(id => ({ id, s: cardQuality(id) }))
        .sort((a, b) => b.s - a.s)[0];
      if (best && best.s > cardQuality('STRIKE')) run.addCard(best.id);
      if (run.rng.chance(0.4)) run.addPotion(run.rollPotion());
    }
    if (kind === 'boss') {
      const relic = run.rollBossRelic();
      run.addRelic(relic);
      return { win: true, floors, fights, hp: run.hp, hpAtBoss };
    }
  }
  return { win: false, floors, fights, hp: run.hp, hpAtBoss };
}

/* ---------------- 汇总 ---------------- */

let wins = 0, floorsSum = 0, fightsSum = 0, bossHpSum = 0, bossHpN = 0;
const deathsByFloor = {};
const deathsByKind = {};
let hpSum = 0;

for (let i = 0; i < N; i++) {
  const seed = 'BAL' + i;
  const r = await runOne(seed);
  if (r.win) wins++;
  floorsSum += r.floors;
  fightsSum += r.fights;
  hpSum += r.hp;
  if (r.hpAtBoss != null) { bossHpSum += r.hpAtBoss; bossHpN++; }
  deathsByFloor[r.floors] = (deathsByFloor[r.floors] || 0) + 1;
  if (!r.win) deathsByKind[r.floors] = deathsByKind[r.floors] || 0;
  if (VERBOSE) console.log(seed, r.win ? 'WIN ' : 'LOSE', 'floor', r.floors, 'fights', r.fights, 'hp', r.hp);
}

console.log(`asc=${ASC} 局数=${N} 胜率=${(wins / N * 100).toFixed(0)}% 平均层数=${(floorsSum / N).toFixed(1)} 平均战斗=${(fightsSum / N).toFixed(1)}`);
console.log(`抵达首领时平均血量=${bossHpN ? (bossHpSum / bossHpN).toFixed(1) : '-'} (${bossHpN}/${N} 局撑到首领)`);
console.log('结束层数分布', JSON.stringify(deathsByFloor));
