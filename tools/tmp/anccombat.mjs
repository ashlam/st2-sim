/** 先古遗物战斗回归：逐件装备后打完一场战斗，确保钩子不炸 */
import { Run } from '../../src/engine/run.js';
import { Combat } from '../../src/engine/combat.js';
import { ENCOUNTERS } from '../../src/data/enemies.js';
import { RELICS } from '../../src/data/items.js';

const CHARS = ['IRONCLAD', 'SILENT', 'DEFECT', 'REGENT', 'NECROBINDER'];
const ids = Object.values(RELICS).filter((d) => d.rarity === 'ancient').map((d) => Object.keys(RELICS).find((k) => RELICS[k] === d));

async function autoCombat(run, enc) {
  const c = new Combat(run, enc, { speed: 0 });
  c.onUpdate = () => {};
  c.onFloat = () => {};
  c.requestSelection = async ({ pool, count }) => pool.slice(0, count || 1);
  await c.start();
  let guard = 0;
  while (!c.finished && guard++ < 300) {
    let played = false;
    for (const card of [...c.hand]) {
      if (c.canPlay(card)) {
        await c.playCard(card, c.alive()[0]);
        played = true;
        break;
      }
    }
    if (c.finished) break;
    if (!played) await c.endTurn();
  }
  if (guard >= 300) throw new Error('战斗超时');
  run.hp = c.player.hp;
  return c;
}

let bad = 0;
for (const cid of CHARS) {
  for (const rid of ids) {
    const run = new Run('ANCREL1', 0, cid);
    run.relics.push(rid);
    try {
      const def = RELICS[rid];
      if (def.onCombatStart || def.beforeDraw || def.afterDraw || def.onTurnStart
        || def.modifyDraw || def.modifyMaxEnergy || def.modifyCost || def.onCardPlayed
        || def.onShuffle || def.onTurnEnd || def.onCombatEnd) {
        await autoCombat(run, { ...ENCOUNTERS.normal[0], isElite: false, isBoss: false });
        await autoCombat(run, { ...ENCOUNTERS.elite[0], isElite: true, isBoss: false });
      }
    } catch (e) {
      console.log('FAIL', cid, rid, e.message);
      bad++;
    }
  }
}
console.log('combat-bad =', bad, 'relics tested =', ids.length * CHARS.length);
