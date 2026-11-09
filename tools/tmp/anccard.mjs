/** 先古牌逐张实战：把每张先古牌塞进牌组打一场，确保 play 不炸 */
import { Run } from '../../src/engine/run.js';
import { Combat } from '../../src/engine/combat.js';
import { ENCOUNTERS } from '../../src/data/enemies.js';
import { CARDS } from '../../src/data/cards.js';
import { ANCIENT_CARDS } from '../../src/data/cards-ancient.js';

let bad = 0;
for (const id of Object.keys(ANCIENT_CARDS)) {
  const def = CARDS[id];
  if (!def) { console.log('MISSING DEF', id); bad++; continue; }
  if (def.type === 'status' || def.type === 'curse' || def.unplayable) continue;
  for (const up of [false, true]) {
    const run = new Run('ANCARD1', 0, 'IRONCLAD');
    run.deck = [{ id, upgraded: up, uid: 'x1' }, ...run.deck.slice(0, 5)];
    try {
      const c = new Combat(run, { ...ENCOUNTERS.normal[0] }, { speed: 0 });
      c.onUpdate = () => {};
      c.onFloat = () => {};
      c.requestSelection = async ({ pool, count }) => pool.slice(0, count || 1);
      await c.start();
      const card = c.hand.find((x) => x.id === id) || c.drawPile.find((x) => x.id === id);
      if (card && c.canPlay(card)) await c.playCard(card, c.alive()[0]);
    } catch (e) {
      console.log('PLAY FAIL', id, up ? '+' : '', e.message);
      bad++;
    }
  }
}
console.log('card-bad =', bad);
