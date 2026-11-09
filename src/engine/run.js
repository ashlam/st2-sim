/** 单局流程：种子、牌组、遗物、药水、地图、奖励、商店、休息处 */
import { Rng } from './rng.js';
import { generateMap } from './map.js';
import { CARDS, makeCard } from '../data/cards.js';
import { RELICS, RELIC_POOLS, POTIONS, POTION_POOL } from '../data/items.js';
import { ENCOUNTERS, ENCOUNTERS_BY_ACT, WEAK_COUNTS, RAIDER_POOL, encounterPool } from '../data/enemies.js';
import { eventPoolFor } from '../data/events.js';
import { getCharacter } from '../data/characters.js';
import { rollAncients } from '../data/ancients.js';

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
    this.map = null;
    this.curNode = null;
    this.floor = 0;
    this.act = 0;
    this.combatCount = 0;
    this.weakFightsLeft = 3;
    this.bossKilled = 0;
    this.stats = { combats: 0, elites: 0, bosses: 0, cardsAdded: 0, damageTaken: 0, goldEarned: 0, floors: 0 };
    this.rng = new Rng(seed + ':run');
    this.bossQueue = [];
    this.seenEvents = [];
    this.eventPool = [];
    this.cardPoolUsed = [];
    this.log = [];
    // 逐场战斗的战报摘要（供结算界面复盘用；只存数字，不存日志）
    this.battles = [];
    this.dead = false;
    this.victory = false;
    // 事件遗物的少量计数器（巨口储蓄罐是否已消费 / 余烬茶剩余场次 / 石之剑精英数…）
    this.relicData = {};
    // 待发放的遗物奖励数（旺购神秘券这类延迟奖励）
    this.pendingRelicRewards = 0;
    // 第一幕变体：对照 ActDefinition.GetRandomList，用独立的 act_selection 随机数在
    // 蔓生之地（Overgrowth）与海底（Underdocks）之间二选一
    this.act1 = new Rng(seed + ':act_selection').pick(['OVERGROWTH', 'UNDERDOCK']);
    // 先古之民：第 1 幕固定涅奥，第 2/3 幕各从本幕池 + 共享池（达弗）抽一个
    this.actAncient = rollAncients(seed);
    this.startAct(1);
  }

  /**
   * 进入某一幕：重新生成地图、重置弱怪池 / 事件池 / 首领队列。
   * 对照 RunState.AdvanceToNextAct（清空本幕状态后 InitializeCurrentAct + GenerateCurrentMap）。
   */
  startAct(n) {
    this.act = n;
    this.map = generateMap(n === 1 ? this.seed : `${this.seed}:act${n}`, this.asc, n);
    this.curNode = null;
    this.weakFightsLeft = WEAK_COUNTS[n] ?? 3;
    const byAct = eventPoolFor(n, this.act1);
    this.eventPool = this.rng.shuffle(byAct.slice());
    const pool = encounterPool(n, this.act1);
    const bosses = this.rng.shuffle(pool.boss.map(e => e.id));
    // 进阶 10：双首领（RunState.SecondBossMapPoint）
    this.bossQueue = this.asc >= 10 ? bosses.slice(0, 2) : bosses.slice(0, 1);
  }

  get nextBossId() { return this.bossQueue[0]; }

  /* ---------- 随机内容 ---------- */
  poolByRarity(rarity) {
    const prism = this.relicData && this.relicData.prismatic;
    const others = ['IRONCLAD', 'SILENT', 'DEFECT', 'REGENT', 'NECROBINDER'];
    return Object.values(CARDS)
      .filter(d => d && d.rarity === rarity && d.type !== 'status' && d.type !== 'curse')
      // 只出本角色的牌（衍生牌 char === 'TOKEN' 永远不会命中稀有度）
      // 棱彩宝石：卡牌奖励里也会混入其他颜色的牌
      .filter(d => !d.char || d.char === 'NEUTRAL' || d.char === this.charId
        || (prism && others.includes(d.char) && d.char !== this.charId))
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

  /**
   * 遗物对「卡牌奖励」的后期改写（亮片 / 白银熔炉 / 丝之长发）。
   * 返回 [{id, upgraded, enchant}]，供奖励界面显示与落地共用。
   */
  rewardMods(ids) {
    const out = ids.map(id => ({ id, upgraded: false, enchant: null }));
    if (this.relicData.glitter) for (const o of out) o.enchant = 'GLAM';
    if ((this.relicData.silverCrucible || 0) > 0) {
      for (const o of out) o.upgraded = true;
      this.relicData.silverCrucible -= 1;
    }
    if (this.relicData.silkenTress) {
      const t = out.find(o => !o.enchant);
      if (t) t.enchant = 'GLAM';
      this.relicData.silkenTress = 0;
    }
    return out;
  }

  rollPotion() {
    if (this.asc >= 7 && this.rng.chance(0.25)) return null;
    const tier = this.rollPotionTier();
    const pool = POTION_POOL[tier].filter(id => this.potionAllowed(id));
    return pool.length ? this.rng.pick(pool) : null;
  }

  rollPotionTier() {
    const r = this.rng.next();
    return r < 0.65 ? 'common' : r < 0.92 ? 'uncommon' : 'rare';
  }

  /** 角色专属药水同样只在对应角色的局里出现（如亡灵契约师的灾厄药水/骨头酿） */
  potionAllowed(id) {
    const p = POTIONS[id];
    return !!p && (!p.char || p.char === this.charId);
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
    const pool = encounterPool(this.act, this.act1);
    if (kind === 'boss') {
      const id = this.bossQueue[0];
      const enc = pool.boss.find(e => e.id === id);
      return { ...enc, isBoss: true, bossId: id };
    }
    if (kind === 'elite') {
      return { ...this.rng.pick(pool.elite), isElite: true };
    }
    // 普通战斗：本幕前 N 场用弱怪池（Overgrowth 3 场 / Hive 2 场）
    if (this.weakFightsLeft > 0) {
      this.weakFightsLeft--;
      return { ...this.rng.pick(this.weakPool(pool)) };
    }
    return { ...this.rng.pick(this.normalPool(pool)) };
  }

  /** 第一幕用 weak/normal 两个池；第二、三幕的池把两者放在 monster 里用 weak 标记区分 */
  weakPool(pool) {
    return pool.weak || (pool.monster || []).filter(e => e.weak);
  }
  normalPool(pool) {
    return pool.normal || (pool.monster || []).filter(e => !e.weak);
  }

  /* ---------- 变更 ---------- */
  /** 先古遗物的「拾起时」需要玩家做选择：先入队，由 UI 在流程空档逐个兑现 */
  queueRelicJob(job) { (this.relicJobs || (this.relicJobs = [])).push(job); }
  /** 按稀有度取一张本角色（含中立）的牌 */
  randomCardId(rarity, opts = {}) {
    let pool = this.poolByRarity(rarity);
    if (opts.notChar) pool = pool.filter((id) => CARDS[id]?.char && CARDS[id].char !== this.charId
      && CARDS[id].char !== 'NEUTRAL');
    if (opts.char) pool = pool.filter((id) => CARDS[id]?.char === opts.char);
    if (opts.type) pool = pool.filter((id) => CARDS[id]?.type === opts.type);
    return pool.length ? this.rng.pick(pool) : null;
  }
  /** 任意一张（可指定类型/稀有度集合）的牌 */
  randomCard(opts = {}) {
    let list = Object.values(CARDS).filter((d) => d
      && !['status', 'curse', 'event', 'quest', 'token', 'basic', 'ancient'].includes(d.rarity));
    if (opts.rarity) list = list.filter((d) => opts.rarity.includes(d.rarity));
    if (opts.type) list = list.filter((d) => d.type === opts.type);
    if (opts.char) list = list.filter((d) => d.char === opts.char);
    else list = list.filter((d) => !d.char || d.char === 'NEUTRAL' || d.char === this.charId);
    return list.length ? this.rng.pick(list).id : null;
  }
  /** 随机一张诅咒 */
  randomCurse(exclude = []) {
    const list = Object.values(CARDS)
      .filter((d) => d && d.type === 'curse' && d.rarity === 'curse' && d.canBeGenerated !== false)
      .filter((d) => !exclude.includes(d.id))
      .map((d) => d.id);
    return list.length ? this.rng.pick(list) : null;
  }
  /** 把牌组里的一张指定牌变形成同稀有度的随机牌（LeafyPoultice / PandorasBox 用） */
  transformEntry(entry, newId, upgraded = entry.upgraded) {
    if (!entry || !newId) return;
    entry.id = newId;
    entry.upgraded = upgraded;
    delete entry.enchant;
    delete entry.goopy;
    delete entry.crafts;
  }
  addCard(id, upgraded = false) {
    const entry = { id, upgraded, uid: 'd' + Math.random().toString(36).slice(2, 9) };
    this.deck.push(entry);
    this.stats.cardsAdded++;
    for (const rid of this.relics.slice()) {
      const r = RELICS[rid];
      if (r?.onCardAdded) r.onCardAdded(this, entry, CARDS[id]);
    }
    return entry;
  }
  removeCard(entry) {
    const i = this.deck.findIndex(d => d.uid === entry.uid);
    if (i >= 0) this.deck.splice(i, 1);
  }
  upgradeCardEntry(entry) {
    const c = this.deck.find(d => d.uid === entry.uid);
    if (c) c.upgraded = true;
  }
  addRelic(id) {
    if (!id || this.relics.includes(id)) return;
    this.relics.push(id);
    RELICS[id]?.onObtain?.(this);
  }
  removeRelic(id) {
    const i = this.relics.indexOf(id);
    if (i >= 0) this.relics.splice(i, 1);
  }
  /** 精英战胜结算：石之剑累计 5 次后自行变化为玉之剑 */
  notifyEliteWin() {
    for (const rid of this.relics.slice()) {
      const r = RELICS[rid];
      if (r?.onEliteWin) r.onEliteWin(this);
    }
  }
  /** 每攀爬一层（进入新房间前）触发，巨口储蓄罐靠这个给金币 */
  notifyRoomEntered() {
    if (!this.relicData.mawBankSpent && this.relics.includes('MAW_BANK')) this.gainGold(12);
    for (const rid of this.relics.slice()) {
      RELICS[rid]?.onRoomEntered?.(this);
    }
  }
  /** 休息处回血后触发（石炉加湿器） */
  notifyRestHeal() {
    for (const rid of this.relics.slice()) RELICS[rid]?.onRestHeal?.(this);
  }
  /** 战斗结束（胜负无关）的一次性结算，供只在 run 层记账的遗物使用 */
  notifyCombatWon(isElite, isBoss, nodeType) {
    for (const rid of this.relics.slice()) RELICS[rid]?.onCombatWon?.(this, { isElite, isBoss, nodeType });
  }
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
    const tier = this.rollPotionTier();
    const pool = POTION_POOL[tier].filter(id => this.potionAllowed(id));
    return pool.length ? this.rng.pick(pool) : null;
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
      map, curNodeId: this.curNode?.id || null, floor: this.floor, act: this.act,
      weakFightsLeft: this.weakFightsLeft, combatCount: this.combatCount,
      bossQueue: this.bossQueue, stats: this.stats, eventPool: this.eventPool,
      bossKilled: this.bossKilled, orbSlots: this.orbSlots, act1: this.act1,
      relicData: this.relicData, pendingRelicRewards: this.pendingRelicRewards,
      relicJobs: this.relicJobs || [], actAncient: this.actAncient || null,
      battles: (this.battles || []).slice(-80),
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
    run.act = d.act || 1;
    if (d.act1) run.act1 = d.act1;
    if (d.relicData) run.relicData = d.relicData;
    if (Array.isArray(d.relicJobs)) run.relicJobs = d.relicJobs;
    if (Array.isArray(d.battles)) run.battles = d.battles;
    if (d.actAncient) run.actAncient = d.actAncient;
    if (typeof d.pendingRelicRewards === 'number') run.pendingRelicRewards = d.pendingRelicRewards;
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
