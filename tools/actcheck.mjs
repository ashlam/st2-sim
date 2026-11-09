/** 校验各幕遭遇编组能否正常构建（不需要浏览器）。第一幕的两个变体分别校验。 */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { ENEMIES, encounterPool } from '../src/data/enemies.js';

const asc = +(process.env.ASC || 0);
const run = new Run('TESTSEED', asc, 'IRONCLAD');
let bad = 0;

const acts = [
  { act: 1, variant: 'OVERGROWTH', label: '第一幕 · 密林' },
  { act: 1, variant: 'UNDERDOCK', label: '第一幕 · 暗港' },
  { act: 2, label: '第二幕 · 巢穴' },
  { act: 3, label: '第三幕 · 荣耀' },
];

for (const spec of acts) {
  const pool = encounterPool(spec.act, spec.variant);
  if (!pool) continue;
  run.act = spec.act;
  if (spec.variant) run.act1 = spec.variant;
  const all = [
    ...(pool.monster || []), ...(pool.weak || []), ...(pool.normal || []),
    ...(pool.elite || []), ...(pool.boss || []),
  ];
  console.log(`\n=== ${spec.label}（${all.length} 个遭遇）===`);
  for (const enc of all) {
    try {
      const c = new Combat(run, { ...enc, speed: 0 });
      const line = c.enemies.map(e => `${e.name}(${e.hp}/${e.maxHp}) ${e.moveKey}`).join('，');
      console.log(`  ${enc.id.padEnd(26)} ${line}`);
      for (const e of c.enemies) if (!ENEMIES[e.id]) { console.log('    ✗ 未知敌人', e.id); bad++; }
    } catch (err) {
      console.log(`  ✗ ${enc.id}: ${err.message}`);
      bad++;
    }
  }
}
console.log('\n问题数:', bad);
