/** 诊断：逐场战斗记录 血量/回合数/敌人，用于核对单场损耗是否接近原作 */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';

const SEEDS = Number(process.argv[2] || 6);

function incoming(c) {
  return c.alive().reduce((s, e) => {
    const it = c.intentOf(e);
    return it.type === 'attack' ? s + it.dmg * (it.times || 1) : s;
  }, 0);
}

function varsOf(card) { try { return card.def.vars?.(card, null, card) || {}; } catch { return {}; } }
function blockOf(card) { return varsOf(card).Block || 0; }
function dmgOf(card) { const v = varsOf(card); return (v.Damage || 0) * (v.Times || 1); }

async function turn(c) {
  let g = 0;
  while (g++ < 40) {
    if (c.finished || !c.alive().length) break;
    const pl = c.hand.filter(x => c.canPlay(x));
    if (!pl.length) break;
    const inc = incoming(c);
    const gap = Math.max(0, inc - c.player.block);
    if (gap > 0) {
      const bl = pl.filter(x => blockOf(x) > 0 && c.costOf(x) > 0)
        .sort((a, b) => blockOf(b) / Math.max(1, c.costOf(b)) - blockOf(a) / Math.max(1, c.costOf(a)));
      if (bl.length) { await c.playCard(bl[0], c.alive()[0]); continue; }
    }
    const pw = pl.filter(x => x.type === 'power');
    if (pw.length) { await c.playCard(pw[0], c.alive()[0]); continue; }
    const at = pl.filter(x => x.type === 'attack').sort((a, b) => dmgOf(b) / Math.max(0.5, c.costOf(b)) - dmgOf(a) / Math.max(0.5, c.costOf(a)));
    if (at.length) { await c.playCard(at[0], c.alive()[0]); continue; }
    const sk = pl.filter(x => x.type === 'skill').sort((a, b) => blockOf(b) - blockOf(a));
    if (sk.length) { await c.playCard(sk[0], c.alive()[0]); continue; }
    break;
  }
}

for (let i = 0; i < SEEDS; i++) {
  const run = new Run('DIAG' + i, 0);
  console.log(`\n=== DIAG${i} hp=${run.hp} deck=${run.deck.length} ===`);
  let node = null, floors = 0;
  while (floors < 25) {
    const next = node ? node.children : run.map.startNodes;
    if (!next || !next.length) break;
    node = next[0];
    floors++;
    if (node.type !== 'monster' && node.type !== 'elite' && node.type !== 'boss') {
      if (node.type === 'rest') run.heal(Math.floor(run.maxHp * 0.3));
      continue;
    }
    const kind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'normal';
    const enc = run.rollEncounter(kind);
    const c = new Combat(run, enc, { speed: 0 });
    c.onUpdate = () => {}; c.onFloat = () => {};
    const hp0 = run.hp;
    await c.start();
    const names = c.enemies.map(e => `${e.name}(${e.hp}/${e.maxHp})`).join(' + ');
    let turns = 0;
    while (!c.finished && turns < 200) { await turn(c); if (c.finished) break; await c.endTurn(); turns++; }
    run.hp = Math.max(0, c.player.hp);
    const lost = hp0 - run.hp;
    console.log(`f${String(floors).padStart(2)} ${c.won ? 'WIN ' : 'LOSE'} ${names.padEnd(40)} 回合=${turns} hp ${hp0}->${run.hp} (-${lost})`);
    if (!c.won) break;
    if (kind !== 'boss') {
      const opts = run.rollCardReward(3);
      run.addCard(opts[0]);
    }
  }
}
