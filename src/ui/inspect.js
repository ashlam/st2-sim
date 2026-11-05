/**
 * 关键词识别：把战斗记录/说明文字里出现的牌名、状态名、敌人名、遗物名、机制名，
 * 变成可以点击的 <span class="kwl" data-kw-kind data-kw-id>。
 * 具体弹什么面板由 app.js 的 showKw() 决定（这里只做识别和转义）。
 */
import { CARDS } from '../data/cards.js';
import { RELICS, POTIONS } from '../data/items.js';
import { ENEMIES } from '../data/enemies.js';
import { POWERS } from '../data/powers.js';
import { TERMS } from '../data/glossary.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let index = null;
let pattern = null;

function ensure() {
  if (index) return;
  index = new Map();
  const add = (name, kind, id) => {
    if (!name) return;
    if (!index.has(name)) index.set(name, { kind, id });
  };
  // 顺序即优先级：同名的先注册者胜（卡牌 > 状态 > 敌人 > 遗物 > 药水 > 机制词）
  for (const [id, def] of Object.entries(CARDS)) add(def.name, 'card', id);
  for (const [id, def] of Object.entries(POWERS)) add(def.name, 'power', id);
  for (const [id, def] of Object.entries(ENEMIES)) add(def.name, 'enemy', id);
  for (const [id, def] of Object.entries(RELICS)) add(def.name, 'relic', id);
  for (const [id, def] of Object.entries(POTIONS)) add(def.name, 'potion', id);
  for (const [id, def] of Object.entries(TERMS)) add(def.name, 'term', id);
  // 长的优先：「双重打击」要盖住「打击」，「抽牌堆」要盖住「抽牌」
  const names = [...index.keys()].sort((a, b) => b.length - a.length);
  pattern = new RegExp(names.map(escRe).join('|'), 'g');
}

/** 把一段纯文本转成带关键词链接的 HTML（会做 HTML 转义，可安全插入） */
export function linkify(text) {
  const s = String(text ?? '');
  if (!s) return '';
  ensure();
  let out = '';
  let last = 0;
  pattern.lastIndex = 0;
  let m;
  while ((m = pattern.exec(s)) !== null) {
    const hit = index.get(m[0]);
    if (!hit) continue;
    if (m.index > last) out += esc(s.slice(last, m.index));
    out += `<span class="kwl" data-kw-kind="${hit.kind}" data-kw-id="${hit.id}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += esc(s.slice(last));
  return out;
}

/* ---------------- 敌人招式 → 效果描述 ---------------- */

const PILE_LABEL = { discard: '弃牌堆', draw: '抽牌堆', hand: '手牌', exhaust: '消耗堆' };

/** 按顶层逗号切分实参（跳过字符串和嵌套括号） */
function splitArgs(src) {
  const out = [];
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { out.push(src.slice(start, i).trim()); start = i + 1; }
  }
  const tail = src.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** 扫出一段代码里所有 C.xxx(...) 调用及实参源码 */
function scanCalls(src) {
  const calls = [];
  const re = /C\.([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 1, quote = null;
    const start = i;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\') { i++; }
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (!depth) break; }
      i++;
    }
    calls.push({ fn: m[1], args: splitArgs(src.slice(start, i)) });
    re.lastIndex = i + 1;
  }
  return calls;
}

/** 求值实参表达式（只处理本仓库自己写的招式数据） */
function evalArg(expr, C) {
  if (expr == null) return undefined;
  try { return Function('C', `"use strict"; return (${expr});`)(C); } catch { return undefined; }
}

/**
 * 把敌人的一个招式翻译成中文效果列表。
 * 直接读 move.run 的源码，按引擎原语（enemyAttack / enemyBlock / enemyPower /
 * addPower / addCard / spawnEnemy）还原，所以以后加新敌人不用再补说明。
 * @returns {{def, mv, effects: string[], intent: string, attack: {base:number, times:number}|null}|null}
 */
export function describeMove(enemyId, key, asc = 0) {
  const def = ENEMIES[enemyId];
  const mv = def?.moves?.[key];
  if (!def || !mv) return null;

  const C = { asc };
  const effects = [];
  let attack = null;

  if (mv.desc) {
    effects.push(mv.desc);
  } else {
    for (const { fn, args } of scanCalls(String(mv.run || ''))) {
      if (fn === 'enemyAttack') {
        const base = Number(evalArg(args[1], C));
        const ascVal = Number(evalArg(args[2], C));
        const dmg = asc >= 9 && Number.isFinite(ascVal) ? ascVal : base;
        const times = Number(evalArg(args[3] ?? '1', C)) || 1;
        if (Number.isFinite(dmg)) {
          attack = { base: dmg, times };
          effects.push(`造成 ${dmg} 点伤害${times > 1 ? `，共 ${times} 次` : ''}`);
        }
      } else if (fn === 'enemyBlock') {
        const b = Number(evalArg(args[1], C));
        if (Number.isFinite(b)) effects.push(`自身获得 ${b} 点格挡`);
      } else if (fn === 'enemyPower') {
        const pid = evalArg(args[1], C);
        const amt = Number(asc >= 9 && args[3] != null ? evalArg(args[3], C) : evalArg(args[2], C));
        if (pid && Number.isFinite(amt)) effects.push(`自身获得 ${amt} 层${POWERS[pid]?.name || pid}`);
      } else if (fn === 'addPower') {
        // addPower(id, amount, target?)：目标不传时是玩家
        const pid = evalArg(args[0], C);
        const amt = Number(evalArg(args[1], C));
        const meta = POWERS[pid];
        if (pid && Number.isFinite(amt)) {
          const who = meta?.type === 'debuff' ? '给予你' : '你获得';
          effects.push(`${who} ${amt} 层${meta?.name || pid}`);
        }
      } else if (fn === 'addCard') {
        // addCard(id, pile, upgraded, times)
        const cid = evalArg(args[0], C);
        const pile = evalArg(args[1], C) || 'discard';
        const times = Number(evalArg(args[3] ?? '1', C)) || 1;
        if (cid) effects.push(`将 ${times} 张「${CARDS[cid]?.name || cid}」放入你的${PILE_LABEL[pile] || '弃牌堆'}`);
      } else if (fn === 'spawnEnemy') {
        const eid = evalArg(args[0], C);
        if (eid) effects.push(`召唤一只「${ENEMIES[eid]?.name || eid}」`);
      }
    }
  }

  if (!effects.length) {
    if (mv.intent?.type === 'sleep') effects.push('沉睡中，不会行动（被攻击会醒来）');
    else if (mv.intent?.type === 'stun') effects.push('眩晕中，这一回合无法行动');
    else effects.push('没有额外的数值效果');
  }

  return { def, mv, effects, intent: intentLabel(mv.intent, asc), attack };
}

/** 意图 → 一句话（敌人详情面板用） */
export function intentLabel(intent, asc = 0) {
  if (!intent) return '未知';
  if (intent.type === 'attack') {
    const base = asc >= 9 ? (intent.dmgAsc ?? intent.dmg) : intent.dmg;
    const times = asc >= 9 ? (intent.timesAsc ?? intent.times ?? 1) : (intent.times ?? 1);
    return `攻击 ${base}${times > 1 ? ` ×${times}` : ''}`;
  }
  return {
    defend: '获得格挡', buff: '强化自身', debuff: '施加负面',
    status: '塞状态牌', sleep: '沉睡', stun: '眩晕', none: '无',
  }[intent.type] || '未知';
}
