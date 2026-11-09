import { Run } from '../../src/engine/run.js';
import { ANCIENTS, rollAncients } from '../../src/data/ancients.js';
import { RELICS } from '../../src/data/items.js';

let bad = 0;
for (const charId of ['IRONCLAD','SILENT','DEFECT','REGENT','NECROBINDER']) {
  for (const seed of ['AAA111','BBB222','CCC333']) {
    const run = new Run(seed, 0, charId);
    const acts = rollAncients(seed);
    if (!acts[1] || !acts[2] || !acts[3]) { console.log('BAD acts', acts); bad++; }
    for (const [aid, def] of Object.entries(ANCIENTS)) {
      let opts;
      try { run.act = aid === 'NEOW' ? 1 : 2; opts = def.options(run); }
      catch (e) { console.log('OPT FAIL', aid, e.message); bad++; continue; }
      for (const o of opts) {
        if (!RELICS[o.relic]) { console.log('MISSING relic', aid, o.relic); bad++; continue; }
      }
      if (!opts.length) { console.log('EMPTY opts', aid); bad++; }
    }
  }
}
// 逐件遗物跑 onObtain
for (const [id, d] of Object.entries(RELICS)) {
  if (d.rarity !== 'ancient') continue;
  const run = new Run('TEST99', 0, 'IRONCLAD');
  run.act = 2;
  try {
    run.relics.push(id);
    if (d.onObtain) d.onObtain(run);
  } catch (e) { console.log('OBTAIN FAIL', id, e.message); bad++; }
}
console.log('bad =', bad, 'ancient relics =', Object.values(RELICS).filter(d=>d.rarity==='ancient').length);
