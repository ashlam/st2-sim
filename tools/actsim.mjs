/** 各幕遭遇的自动对战：验证每个敌人机制都能跑通（不需要浏览器）
 *  用法：node tools/actsim.mjs [act=3] [asc=0] [seed] */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { ENCOUNTERS_BY_ACT } from '../src/data/enemies.js';

const act = Number(process.argv[2] || 3);
const asc = Number(process.argv[3] || 0);
const seed = process.argv[4] || 'ACTSIM01';

const pool = ENCOUNTERS_BY_ACT[act];
if (!pool) { console.log('没有第', act, '幕的遭遇池'); process.exit(1); }
const all = [...(pool.monster || []), ...(pool.weak || []), ...(pool.normal || []), ...pool.elite, ...pool.boss];

let bad = 0;
for (const enc of all) {
  const run = new Run(seed, asc, 'IRONCLAD');
  run.act = act;
  let c = null;
  try {
    c = new Combat(run, { ...enc }, { speed: 0 });
    c.onUpdate = () => {};
    c.onFloat = () => {};
    await c.start();
    let guard = 0;
    const seen = new Set();
    while (!c.finished && guard++ < 300) {
      let played = false;
      for (const card of [...c.hand]) {
        if (!c.canPlay(card)) continue;
        await c.playCard(card, c.alive()[0]);
        played = true;
        if (c.finished) break;
        break;
      }
      if (c.finished) break;
      if (!played) await c.endTurn();
      for (const e of c.enemies) seen.add(`${e.id}:${e.moveKey}`);
    }
    if (guard >= 300) throw new Error('战斗超时');
    console.log(`  ${enc.id.padEnd(30)} turn=${String(c.turn).padStart(2)} won=${c.won ? 'Y' : 'N'} hp=${c.player.hp}/${c.player.maxHp}`);
    console.log(`     招式轨迹: ${[...seen].slice(0, 14).join(' ')}`);
  } catch (err) {
    bad++;
    console.log(`  ✗ ${enc.id}: ${err.message}`);
    console.log('    ', (err.stack || '').split('\n').slice(1, 3).join(' | '));
  }
}
console.log('\n问题数:', bad);
