/**
 * 引擎回归：跑那些"单局冒烟不容易撞上、但一定会卡死/出错"的边界。
 * 现在覆盖：
 *   ① 用带选择效果的卡（头槌）打死最后一个敌人 —— 不能卡在选择面板上
 *   ② 选择面板已经弹出后战斗才结束 —— 引擎要能强制收掉
 * 用法：node tools/regress.mjs   （失败时进程退出码非 0）
 */
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { makeCard } from '../src/data/cards.js';

function setup(seed, { hangSelection = false } = {}) {
  const run = new Run(seed, 0);
  const c = new Combat(run, run.rollEncounter('normal'), { speed: 0 });
  c.onUpdate = () => {};
  c.onFloat = () => {};
  c.asked = 0;
  if (hangSelection) {
    // 永远不 resolve：等价于面板卡在界面上
    c.requestSelection = () => { c.asked++; return new Promise(() => {}); };
  }
  return c;
}

// ---- 场景一：头槌补刀打死最后一个敌人 ----
const c = setup('KILLSEL', { hangSelection: true });
await c.start();
// 只留一个敌人，且只剩 1 血
const keep = c.alive()[0];
for (const e of c.alive()) if (e !== keep) { e.alive = false; e.hp = 0; }
keep.hp = 1;
// 弃牌堆里放两张牌，保证「选择」这一步真会触发
c.discardPile.push(makeCard('STRIKE_IRONCLAD', false), makeCard('DEFEND_IRONCLAD', false));

const hb = makeCard('HEADBUTT', false);
c.hand.push(hb);
c.energy = 3;

const t0 = Date.now();
try {
  await Promise.race([
    c.playCard(hb, keep),
    new Promise((_, rej) => setTimeout(() => rej(new Error('HANG: 出牌没有结束')), 3000)),
  ]);
  console.log(`① 头槌补刀：finished=${c.finished} won=${c.won} 弹过选择=${c.asked} busy=${c.busy} 用时=${Date.now() - t0}ms`);
  if (!c.finished || !c.won) throw new Error('战斗没有正确判定胜利');
} catch (e) {
  console.log('FAIL', e.message);
  process.exit(1);
}

// ---- 场景二：面板已弹出后战斗才结束（引擎强制收掉） ----
const c2 = setup('KILLSEL2');
let cancelled = 0;
let resolveSel = null;
c2.requestSelection = () => new Promise((res) => { resolveSel = res; });
c2._cancelSelection = () => { cancelled++; resolveSel && resolveSel([]); };
await c2.start();
const p = c2.choose({ from: 'hand', count: 1, prompt: 'x', optional: true });
await Promise.resolve();
c2.finished = true; c2.won = true;
c2.cancelSelection();
const r = await Promise.race([p, new Promise((res) => setTimeout(() => res('TIMEOUT'), 2000))]);
console.log(`② 面板挂起时结束战斗：返回=${JSON.stringify(r)} 取消次数=${cancelled}`);
if (r === 'TIMEOUT') process.exit(1);

// ---- 场景三：卡牌结算抛异常，不能把 busy 卡死（卡死 = 整场战斗点不动） ----
const c3 = setup('KILLSEL3');
await c3.start();
const bad = makeCard('STRIKE_IRONCLAD', false);
bad.def = { ...bad.def, play: async () => { throw new Error('boom'); } };
c3.hand.push(bad);
await c3.playCard(bad, c3.alive()[0]);
console.log(`③ 卡牌抛异常后 busy=${c3.busy} 能量=${c3.energy}`);
if (c3.busy) { console.log('FAIL: busy 没有复位'); process.exit(1); }

console.log('OK');
