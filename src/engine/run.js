/** 单局流程：种子、牌组、遗物、药水、地图、奖励、商店、休息处 */
import { Rng } from './rng.js';
import { generateMap } from './map.js';
import { CARDS, makeCard } from '../data/cards.js';
import { RELICS, RELIC_POOLS, POTIONS, POTION_POOL } from '../data/items.js';
import { ENCOUNTERS, RAIDER_POOL } from '../data/enemies.js';
import { ACT1_EVENTS, EVENTS } from '../data/events.js';
import { getCharacter } from '../data/characters.js';

export const START_DECK = [
  'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD',
  'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD',
  'BASH',
];

const RARITY_WEIGHT = { common: 60, uncommon: 36, rare: 4 };

export class Run {
  constructor(seed, asc = 0, charId = 'IRONCLAD') {
    const char = getCharacter(charId);
    this.seed = seed;
    this.asc = asc;
    this.charId = char.id;
    this.character = char.name;
    this.maxHp = char.hp;
    this.hp = char.hp;
    this.gold = char.gold ?? 99;
    this.energyPerTurn = char.energy ?? 3;
    this.orbSlots = char.orbSlots ?? 0;
    this.avatar = char.avatar;
    const deckIds = char.deck && char.deck.length ? char.deck : START_DECK;
    this.deck = deckIds.map(id => ({ id, upgraded: false, uid: 'd' + Math.random().toString(36).slice(2, 8) }));
    if (asc >= 5) this.deck.push({ id: 'ASCENDERS_BANE', upgraded: false, uid: 'bane' });
    this.relics = char.relic ? [char.relic] : ['BURNING_BLOOD'];
    this.potionSlots = asc >= 4 ? 2 : 3;
    this.potions = new Array(this.potionSlots).fill(null);
    this.map = generateMap(seed, asc);
    this.curNode = null;
    this.floor = 0;
    this.act = 1;
    this.combatCount = 0;
    this.weakFightsLeft = 3;
    this.bossKilled = 0;
    this.stats = { combats: 0, elites: 0, bosses: 0, cardsAdded: 0, damageTaken: 0, goldEarned: 0, floors: 0 };
    this.rng = new Rng(seed + ':run');
    this.bossQueue = this.rng.shuffle(ENCOUNTERS.boss.map(e => e.id));
    if (asc >= 10) this.bossQueue = [this.bossQueue[0], this.bossQueue[1]];
    else this.bossQueue = [this.bossQueue[0]];
    this.seenEvents = [];
    this.eventPool = this.rng.shuffle(ACT1_EVENTS.slice());
    this.cardPoolUsed = [];
    this.log = [];
    this.dead = false;
    this.victory = false;
  }

  get nextBossId() { return this.bossQueue[0]; }

  /* ---------- 随机内容 ---------- */
  poolByRarity(rarity) {
    return Object.values(CARDS)
      .filter(d => d && d.rarity === rarity && d.type !== 'status' && d.type !== 'curse')
      // 只出本角色的牌（衍生牌 char === 'TOKEN' 永远不会命中稀有度）
      .filter(d => !d.char || d.char === 'NEUTRAL' || d.char === this.charId)
      .map(d => d.id);
  }

  rollCardRarity(luck = 0) {
    const total = 100;
    let r = this.rng.next() * total;
    if (r < 4 + luck) return 'rare';
    if (r < 4 + luck + 36) return 'uncommon';
    return 'common';
  }

  rollCardReward(count = 3, opts = {}) {
    const out = [];
    const used = new Set();
    let luck = 0;
    for (let i = 0; i < count; i++) {
      let rarity = opts.rarity || this.rollCardRarity(luck);
      let pool = this.poolByRarity(rarity).filter(id => !used.has(id));
      if (!pool.length) pool = this.poolByRarity('common').filter(id => !used.has(id));
      if (!pool.length) break;
      const id = this.rng.pick(pool);
      used.add(id);
      out.push(id);
      if (rarity !== 'rare') luck += 1;
    }
    return out;
  }

  rollPotion() {
    if (this.asc >= 7 && this.rng.chance(0.25)) return null;
    const r = this.rng.next();
    const tier = r < 0.65 ? 'common' : r < 0.92 ? 'uncommon' : 'rare';
    return this.rng.pick(POTION_POOL[tier]);
  }

  /** 角色专属遗物只在对应角色的局里出现（原作每个角色有自己的 relic pool） */
  relicAllowed(id) {
    const r = RELICS[id];
    return !!r && (!r.char || r.char === this.charId);
  }

  rollRelic(tier = null) {
    let t = tier;
    if (!t) {
      const r = this.rng.next();
      t = r < 0.5 ? 'common' : r < 0.83 ? 'uncommon' : 'rare';
    }
    let pool = (RELIC_POOLS[t] || []).filter(id => !this.relics.includes(id) && this.relicAllowed(id));
    if (!pool.length) pool = RELIC_POOLS.common.filter(id => !this.relics.includes(id) && this.relicAllowed(id));
    if (!pool.length) pool = RELIC_POOLS.uncommon.filter(id => !this.relics.includes(id) && this.relicAllowed(id));
    return pool.length ? this.rng.pick(pool) : null;
  }

  rollBossRelic() {
    const pool = RELIC_POOLS.boss.filter(id => !this.relics.includes(id) && this.relicAllowed(id));
    return pool.length ? this.rng.pick(pool) : null;
  }

  rollEncounter(kind) {
    if (kind === 'boss') {
      const id = this.bossQueue[0];
      const enc = ENCOUNTERS.boss.find(e => e.id === id);
      return { ...enc, isBoss: true, bossId: id };
    }
    if (kind === 'elite') {
      return { ...this.rng.pick(ENCOUNTERS.elite), isElite: true };
    }
    // 普通战斗：前 3 场用弱怪池
    if (this.weakFightsLeft > 0) {
      this.weakFightsLeft--;
      return { ...this.rng.pick(ENCOUNTERS.weak) };
    }
    return { ...this.rng.pick(ENCOUNTERS.normal) };
  }

  /* ---------- 变更 ---------- */
  addCard(id, upgraded = false) {
    this.deck.push({ id, upgraded, uid: 'd' + Math.random().toString(36).slice(2, 9) });
    this.stats.cardsAdded++;
  }
  removeCard(entry) {
    const i = this.deck.findIndex(d => d.uid === entry.uid);
    if (i >= 0) this.deck.splice(i, 1);
  }
  upgradeCardEntry(entry) {
    const c = this.deck.find(d => d.uid === entry.uid);
    if (c) c.upgraded = true;
  }
  addRelic(id) { if (id && !this.relics.includes(id)) this.relics.push(id); }
  addPotion(id) {
    if (!id) return false;
    const i = this.potions.indexOf(null);
    if (i < 0) return false;
    this.potions[i] = id;
    return true;
  }
  removePotion(i) { this.potions[i] = null; }
  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }
  damage(n) {
    this.hp = Math.max(1, this.hp - n);
  }
  gainGold(n) {
    this.gold = Math.max(0, this.gold + n);
    if (n > 0) this.stats.goldEarned += n;
  }
  gainMaxHp(n) {
    this.maxHp = Math.max(1, this.maxHp + n);
    if (n > 0) this.hp += n;
    else this.hp = Math.min(this.hp, this.maxHp);
  }

  goldForCombat(isElite, isBoss) {
    if (isBoss) return this.rng.range(90, 110);
    if (isElite) return this.rng.range(25, 35);
    let g = this.rng.range(10, 20);
    if (this.asc >= 3) g = Math.floor(g * 0.75);
    return g;
  }

  /* ---------- 商店 ---------- */
  makeShop() {
    const cards = [];
    const rarityPlan = ['common', 'common', 'uncommon', 'uncommon', 'rare'];
    for (const rarity of rarityPlan) {
      const pool = this.poolByRarity(rarity);
      const id = this.rng.pick(pool);
      const base = rarity === 'common' ? this.rng.range(45, 55) : rarity === 'uncommon' ? this.rng.range(68, 82) : this.rng.range(135, 165);
      cards.push({ id, price: this.priceWithAsc(base) });
    }
    const relics = [];
    const relicTiers = ['common', 'uncommon', 'shop'];
    for (const tier of relicTiers) {
      const pool = (RELIC_POOLS[tier] || []).filter(x => !this.relics.includes(x) && !relics.some(r => r.id === x) && this.relicAllowed(x));
      if (!pool.length) continue;
      const id = this.rng.pick(pool);
      const base = tier === 'common' ? this.rng.range(143, 157) : tier === 'uncommon' ? this.rng.range(232, 265) : this.rng.range(280, 320);
      relics.push({ id, price: this.priceWithAsc(base) });
    }
    const potions2 = [];
    const seenPotion = new Set();
    let guard = 0;
    while (potions2.length < 3 && guard++ < 40) {
      const id = this.rollPotionForShop();
      if (!id || seenPotion.has(id)) continue;
      seenPotion.add(id);
      potions2.push({ id, price: this.priceWithAsc(this.rng.range(48, 72)) });
    }
    return { cards, relics, potions: potions2, removePrice: this.priceWithAsc(75), removed: false };
  }

  rollPotionForShop() {
    const r = this.rng.next();
    const tier = r < 0.65 ? 'common' : r < 0.92 ? 'uncommon' : 'rare';
    return this.rng.pick(POTION_POOL[tier]);
  }

  priceWithAsc(base) {
    if (this.asc >= 6) return Math.ceil(base * 1.25);
    return base;
  }

  /* ---------- 存读档 ---------- */
  serialize() {
    const map = {
      rows: this.map.rows, cols: this.map.cols,
      startNodes: this.map.startNodes.map(n => n.id),
      bossNode: this.map.bossNode.id,
      nodes: this.map.nodes.map(n => ({
        id: n.id, row: n.row, col: n.col, type: n.type, visited: n.visited,
        children: n.children.map(c => c.id), parents: n.parents.map(p => p.id),
      })),
    };
    return JSON.stringify({
      v: 2, seed: this.seed, asc: this.asc, charId: this.charId,
      hp: this.hp, maxHp: this.maxHp, gold: this.gold,
      deck: this.deck, relics: this.relics, potions: this.potions,
      map, curNodeId: this.curNode?.id || null, floor: this.floor,
      weakFightsLeft: this.weakFightsLeft, combatCount: this.combatCount,
      bossQueue: this.bossQueue, stats: this.stats, eventPool: this.eventPool,
      bossKilled: this.bossKilled, orbSlots: this.orbSlots,
      log: this.log.slice(-20),
    });
  }

  static deserialize(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    const run = new Run(d.seed, d.asc, d.charId || 'IRONCLAD');
    Object.assign(run, {
      hp: d.hp, maxHp: d.maxHp, gold: d.gold, deck: d.deck, relics: d.relics,
      potions: d.potions, floor: d.floor, weakFightsLeft: d.weakFightsLeft,
      combatCount: d.combatCount, bossQueue: d.bossQueue, stats: d.stats,
      eventPool: d.eventPool, bossKilled: d.bossKilled,
    });
    if (typeof d.orbSlots === 'number') run.orbSlots = d.orbSlots;
    // 还原地图引用
    const byId = {};
    const nodes = d.map.nodes.map(n => {
      const o = { ...n, children: [], parents: [] };
      byId[o.id] = o;
      return o;
    });
    for (const n of d.map.nodes) {
      for (const cid of n.children) byId[n.id].children.push(byId[cid]);
      for (const pid of n.parents) byId[n.id].parents.push(byId[pid]);
    }
    run.map = {
      rows: d.map.rows, cols: d.map.cols, nodes,
      startNodes: d.map.startNodes.map(id => byId[id]),
      bossNode: byId[d.map.bossNode],
    };
    if (d.curNodeId) {
      run.curNode = run.map.nodes.find(n => n.id === d.curNodeId) || null;
    }
    return run;
  }
}
