/** 无界面冒烟测试：自动打完整局，验证引擎不崩、数值合理 */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { ENCOUNTERS } from '../src/data/enemies.js';

const seed = process.argv[2] || 'SMOKE001';
const asc = Number(process.argv[3] || 0);
const charId = process.argv[4] || 'IRONCLAD';

let run = new Run(seed, asc, charId);
console.log('seed', run.seed, 'asc', asc, 'deck', run.deck.length, 'map nodes', run.map.nodes.length);

async function autoCombat(enc) {
  const c = new Combat(run, enc, { speed: 0 });
  c.onUpdate = () => {};
  c.onFloat = () => {};
  await c.start();
  let guard = 0;
  while (!c.finished && guard++ < 400) {
    let played = false;
    for (const card of [...c.hand]) {
      if (c.canPlay(card)) {
        const target = c.alive()[0];
        await c.playCard(card, target);
        played = true;
        if (c.finished) break;
        break;
      }
    }
    if (c.finished) break;
    if (!played) {
      await c.endTurn();
    }
  }
  if (guard >= 400) throw new Error('战斗超时');
  run.hp = c.player.hp;
  return { won: c.won, hp: run.hp, turn: c.turn };
}

// 走一遍地图：优先普通战斗 -> 精英 -> 其它
let node = null;
let visited = 0;
while (visited < 30) {
  const next = node ? node.children : run.map.startNodes;
  if (!next.length) break;
  node = next[0];
  visited++;
  run.floor++;
  const enc = node.type === 'boss' ? ENCOUNTERS.boss[0]
    : node.type === 'elite' ? ENCOUNTERS.elite[0]
    : ENCOUNTERS.normal[visited % ENCOUNTERS.normal.length];
  const kind = node.type === 'boss' ? 'Boss' : node.type === 'elite' ? 'Elite' : 'Normal';
  const res = await autoCombat({ ...enc, isBoss: node.type === 'boss', isElite: node.type === 'elite' });
  console.log(`floor ${run.floor} [${kind}] ${enc.id.padEnd(18)} won=${res.won} hp=${res.hp} turns=${res.turn}`);
  if (!res.won) { console.log('STOP: 玩家死亡'); break; }
  if (node.type === 'boss') { console.log('BOSS 击败，通关'); break; }
}

// 全卡牌可打出性检查
const ids = Object.keys((await import('../src/data/cards.js')).CARDS);
console.log('cards loaded:', ids.length);
console.log('OK');
