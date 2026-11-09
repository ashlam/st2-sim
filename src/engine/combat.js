/**
 * 战斗引擎 —— 逐条对应原作的结算顺序：
 * 玩家回合开始（护盾清空/能量/抽牌/回合开始触发）→ 出牌 → 回合结束（弃手牌/回合结束触发）
 * → 敌人依次行动 → 敌人回合结束（中毒/覆甲/减益倒计时）→ 回到玩家回合
 */
import { CARDS, makeCard as newCard } from '../data/cards.js';
import { ENEMIES } from '../data/enemies.js';
import { RELICS } from '../data/items.js';
import { POWERS } from '../data/powers.js';
import { ORBS, ORB_KINDS, makeOrb, orbVal } from '../data/orbs.js';
import { Rng } from './rng.js';
import { NecroSystem } from './necro.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * 附魔效果表（对照 sts2-sim 的 Models/Enchantments）
 * dmg / dmgPct / block 只在打出这张牌时生效，replay 增加打出次数。
 */
export const ENCHANTS = {
  SPIRAL: { name: '涡旋', replay: 1 },              // 额外打出一次
  STEADY: { name: '稳定', retain: true },            // 保留
  NIMBLE: { name: '灵巧', block: 2 },                // 格挡 +2
  SHARP: { name: '锋利', dmg: 2 },                   // 伤害 +2
  VIGOROUS: { name: '迅猛', dmg: 8 },                // 伤害 +8
  CORRUPTED: { name: '腐化', dmgPct: 1.5, hpLoss: 2 }, // 伤害 ×1.5，打出时失去 2 生命
  SWIFT: { name: '迅捷', draw: 2 },                  // 打出后抽 2 张
  PERFECT_FIT: { name: '完美契合' },
  SOULS_POWER: { name: '灵魂之力' },
  /* ---- 先古遗物带来的附魔（对照 Models/Enchantments） ---- */
  IMBUED: { name: '注能', autoPlay: true },          // 每场战斗开始时自动打出
  GOOPY: { name: '黏糊', exhaust: true, goopy: true }, // 获得消耗；打出时格挡值永久 +1
  CLONE: { name: '克隆', clone: true },              // 可在休息处复制
  GLAM: { name: '华彩', replay: 1 },                 // 每场战斗重放一次
  INSTINCT: { name: '本能', costDown: 1 },           // 费用 -1
  TEZCATARAS_EMBER: { name: '特兹卡塔拉的余烬', costZero: true }, // 费用 0 且获得永恒
};

export class Combat {
  constructor(run, encounter, opts = {}) {
    this.run = run;
    this.enc = encounter;
    this.asc = run.asc || 0;
    this.rng = new Rng(`${run.seed}:combat:${run.combatCount}`);
    this.speed = opts.speed ?? 1;
    this.isBoss = !!encounter.isBoss;
    this.isElite = !!encounter.isElite;

    this.turn = 0;
    this.energy = 3;
    this.maxEnergy = 3;
    this.cardsPlayedThisTurn = 0;
    this.attacksPlayedThisTurn = 0;
    this.hpLostThisTurn = 0;
    this.exhaustedThisTurn = 0;
    this.discardedThisTurn = 0;
    this.cardsDrawnThisCombat = 0;
    this.cardsDrawnThisTurn = 0;
    this.shivsPlayedThisTurn = 0;
    this.skillsPlayedThisTurn = 0;
    this.powersPlayedThisTurn = 0;
    this.energySpentThisTurn = 0;
    this.statusCardsDrawnThisTurn = 0;
    this.statusCardsGenerated = 0;
    this.zeroCostAttacksPlayed = 0;
    this.firstTurnDraw = 0;
    this.extraDrawPerTurn = 0;
    this.confusion = false;
    // 储君：本场战斗累计计数 / X 星费当次实际花费
    this.cardsPlayedThisCombat = 0;
    this.cardsGeneratedThisCombat = 0;
    this.starXValue = 0;

    const ascBane = this.asc >= 5;
    this.player = {
      isPlayer: true, alive: true, name: run.character || '铁甲战士', icon: run.avatar || '🗡️',
      hp: run.hp, maxHp: run.maxHp, block: 0, powers: {}, tempStr: 0,
      vigor: 0, penNib: 0, attackCounter: 0,
      orbs: [], tempFocus: 0,
      /* 星愿：对照 PlayerCombatState —— Stars 不随回合重置，只有 GainStars/LoseStars 显式改动；
         StarsGainedThisTurn / 本回合花费量在回合切换时归零。 */
      stars: 0, starsGainedThisTurn: 0, starsSpentThisTurn: 0, starsSpentThisCombat: 0,
      voidFormUses: 0, orbitEnergySpent: 0,
      miniRegentUsed: false, galacticDustStars: 0, regaliteUsed: false,
      paleBlueDotTriggered: false,
    };
    // 充能球栏位（故障机器人 3 个，其它角色 0 个，第一次生成时补 1 个）
    this.maxOrbSlots = run.orbSlots || 0;
    this.orbsChanneled = {};

    this.drawPile = this.rng.shuffle(run.deck.map((c) => {
      const card = newCard(c.id, c.upgraded);
      card.deckUid = c.uid;      // 让「遗传算法」这类牌能把成长写回牌组条目
      card.persist = c;
      // 事件附魔：灵魂之力去掉「消耗」，完美契合让这张牌洗牌后永远最先抽到
      if (c.enchant === 'SOULS_POWER') card._noExhaust = true;
      if (c.enchant === 'PERFECT_FIT') card.perfectFit = true;
      if (c.enchant && ENCHANTS[c.enchant]) {
        card.enchant = { ...ENCHANTS[c.enchant] };
        if (card.enchant.retain) card.retain = true;
        if (card.enchant.exhaust) card._exhaust = true;
        if (card.enchant.costDown) card.costReduction = (card.costReduction || 0) + card.enchant.costDown;
        if (card.enchant.costZero) card.costReduction = 99;
        if (card.enchant.goopy) card.goopyBonus = c.goopy || 0;
      }
      return card;
    }));
    // 固有：开局必定在起手牌里 —— 放到抽牌堆顶部（pop 出来的最后一张）
    const innate = this.drawPile.filter(c => c.def.innate || (c.upgraded && c.def.innateOnUpgrade));
    if (innate.length) {
      this.drawPile = this.drawPile.filter(c => !innate.includes(c)).concat(innate);
    }
    // 完美契合：洗牌后总是排在最前面（同样放在堆顶）
    const fitted = this.drawPile.filter(c => c.perfectFit);
    if (fitted.length) {
      this.drawPile = this.drawPile.filter(c => !c.perfectFit).concat(fitted);
    }
    this.hand = [];
    this.discardPile = [];
    this.exhaustPile = [];
    this.powerPile = [];   // 打出的能力牌：本场战斗内不再回到牌堆
    this.enemies = [];
    this.log = [];
    this.finished = false;
    this.won = false;
    this.openingDraw = 5 + (ascBane ? 0 : 0);

    // 亡灵契约师的专属子系统：奥斯提 / 灾厄 / 灵魂（其它角色为 null，完全不参与结算）
    this.necro = run.charId === 'NECROBINDER' ? new NecroSystem(this) : null;

    this.buildEnemies();
  }

  /* ---------------- 构建 ---------------- */
  buildEnemies() {
    const spawn = (id, extra = {}) => {
      const def = ENEMIES[id];
      if (!def) throw new Error('未知敌人 ' + id);
      const hpRange = (this.asc >= 8 && def.hpAsc) ? def.hpAsc : def.hp;
      const hp = hpRange[0] === hpRange[1] ? hpRange[0] : this.rng.range(hpRange[0], hpRange[1]);
      const e = {
        uid: 'e' + (this.enemies.length + 1),
        id, def, name: def.name, icon: def.icon,
        hp, maxHp: hp, block: 0, powers: {}, tempStr: 0,
        seqIndex: 0, moveKey: null, alive: true,
        elite: !!def.elite, boss: !!def.boss, minion: !!def.minion,
        history: [], ...extra,
      };
      if (def.onSpawn) def.onSpawn(this, e);
      this.enemies.push(e);
      return e;
    };

    let units = [];
    if (this.enc.build) {
      // 第二、三幕的遭遇编组带随机性，交给数据层的 build(C) 决定出场名单
      const built = this.enc.build(this);
      built.forEach((it, i) => {
        const o = typeof it === 'object' && it ? it : { id: it };
        units.push({ ...o, slot: o.slot ?? (this.enc.slots || [])[i] ?? null });
      });
    } else {
      for (const group of this.enc.units) {
        for (const u of group) {
          if (u === 'randomRaiders') {
            const pool = ['AXE_RUBY_RAIDER', 'ASSASSIN_RUBY_RAIDER', 'BRUTE_RUBY_RAIDER', 'CROSSBOW_RUBY_RAIDER', 'TRACKER_RUBY_RAIDER'];
            const picked = this.rng.pickMany(pool, this.enc.count || 3);
            units.push(...picked);
          } else units.push(u);
        }
      }
      // repeat：同一个敌人出场多次（外骨骼虫 4 只、千足虫 3 段）
      if (this.enc.repeat) {
        const base = units[0];
        units = Array.from({ length: this.enc.repeat }, (_, i) => ({
          id: typeof base === 'object' ? base.id : base,
          slot: (this.enc.slots || [])[i] ?? null,
        }));
      }
      // slot：多数敌人的起手招式按站位决定（Exoskeleton / Myte / Decimillipede）
      if (this.enc.slots) {
        units = units.map((u, i) => (typeof u === 'object' && u
          ? { ...u, slot: u.slot ?? this.enc.slots[i] }
          : { id: u, slot: this.enc.slots[i] ?? null }));
      }
    }

    units.forEach((u, i) => {
      // 单位可以是字符串，也可以是 { id, slot, extra } —— 多幕的遭遇编组要靠 slot 决定起手招式
      const id = typeof u === 'object' && u ? u.id : u;
      const extra = (typeof u === 'object' && u) ? { ...(u.extra || {}), slot: u.slot } : {};
      if (id === 'THE_KIN') {
        spawn('KIN_FOLLOWER', { startsWithDance: true });
        spawn('KIN_FOLLOWER');
        spawn('KIN_PRIEST');
        return;
      }
      const e = spawn(id, extra);
      e.encIndex = i;   // 站位序号：部分敌人的起手招式按序号错开（咬人卷轴）
      if (id === 'CHOMPER' && this.enc.screamSecond && i === 1) e.screamFirst = true;
      if (id === 'DECIMILLIPEDE_SEGMENT') {
        e.segIndex = i;
        // 三节的最大生命互相错开（每节取偶数，重复则 +2，越过上限回到下限）
        const lo = this.asc >= 8 ? 46 : 40, hi = this.asc >= 8 ? 52 : 46;
        let hp = e.maxHp % 2 ? e.maxHp + 1 : e.maxHp;
        while (this.enemies.some(o => o !== e && o.id === id && o.maxHp === hp)) {
          hp += 2;
          if (hp > hi) hp = lo;
        }
        e.maxHp = hp; e.hp = hp;
      }
      if (id === 'INKLET') { e.middle = this.enc.middle === i; }
      if (id === 'NIBBIT') { e.isFront = i === 0; }
      if (id === 'KIN_FOLLOWER' && e.startsWithDance) e.moveKey = 'dance';
    });

    // 初始意图
    for (const e of this.enemies) if (!e.moveKey) this.rollIntent(e);
  }

  /* ---------------- 工具 ---------------- */
  alive() { return this.enemies.filter(e => e.alive); }
  aliveEnemies() { return this.enemies.filter(e => e.alive); }

  /** 供亡灵契约师的卡牌/子系统使用 */
  makeCard(id, upgraded = false) { return newCard(id, upgraded); }
  randomCardIdAny() {
    const ids = Object.values(CARDS)
      .filter(d => d && !['basic', 'ancient', 'token', 'status', 'curse', 'quest'].includes(d.rarity))
      .filter(d => d.char === 'NECROBINDER' || d.char === 'NEUTRAL')
      .filter(d => d.type !== 'status' && d.type !== 'curse')
      .map(d => d.id);
    return ids.length ? this.rng.pick(ids) : null;
  }
  ostyAlive() { return !!this.necro?.ostyAlive; }
  ostyMissing() { return !this.ostyAlive(); }
  async ostyAttack(base, opts = {}) { return this.attack(base, { ...opts, osty: true }); }

  get target() {
    if (this._target && this._target.alive) return this._target;
    const a = this.alive();
    if (a.length) return a[0];
    // 全员已倒下（例：一张牌打死了最后一个敌人）：返回原目标，避免调用方读 .powers 崩溃
    return this._target;
  }
  set target(t) { this._target = t; }

  async wait(ms) {
    if (this.speed <= 0) return;
    await sleep(ms * this.speed);
  }
  emit() { this.onUpdate && this.onUpdate(); }
  /** 写一条战斗日志。kind: turn/play/damage/block/power/enemy/draw/system/death */
  logEvent(kind, text, extra = {}) {
    const entry = { turn: this.turn, kind, text, ...extra };
    this.log.push(entry);
    if (this.log.length > 600) this.log.shift();
    this.onLog && this.onLog(entry);
    return entry;
  }
  msg(text) { this.logEvent('system', text); }

  /**
   * 强制收掉还挂在界面上的选择请求（战斗中弹着选择面板时战斗就结束了）。
   * UI 侧在弹面板时会把自己注册到 _cancelSelection，这里调用它 resolve([])。
   */
  cancelSelection() {
    const fn = this._cancelSelection;
    this._cancelSelection = null;
    if (fn) fn();
  }

  syncHp() {
    this.run.hp = Math.max(0, this.player.hp);
  }

  ascVal(base, ascValue) { return this.asc >= 8 ? ascValue : base; }

  /** 敌人意图展示数据（含力量/虚弱修正） */
  intentOf(e) {
    const mv = e.def.moves[e.moveKey];
    if (!mv) return { type: 'none' };
    const it = mv.intent;
    if (it.type === 'attack') {
      const base = this.asc >= 9 ? (it.dmgAsc ?? it.dmg) : it.dmg;
      const times = this.asc >= 9 ? (it.timesAsc ?? it.times ?? 1) : (it.times ?? 1);
      const dmg = this.previewEnemyDamage(e, base);
      return { type: 'attack', dmg, times, raw: base };
    }
    return { ...it, name: mv.name };
  }

  previewEnemyDamage(e, base) {
    let d = base + this.str(e);
    if (e.powers.weak) d = Math.floor(d * 0.75);
    if (this.player.powers.vulnerable) d = Math.floor(d * 1.5);
    return Math.max(0, d);
  }

  str(c) {
    const loss = c.strengthLoss || 0;
    if (c.isPlayer) {
      let s = (c.powers.strength || 0) + (c.tempStr || 0);
      if (c.powers.shrink) s -= 0; // 缩小是伤害倍率
      return s - loss;
    }
    return (c.powers.strength || 0) + (c.tempStr || 0) - loss;
  }

  playerBlockGain(base) {
    let b = base + (this.player.powers.dexterity || 0);
    if (this.player.powers.frail) b = Math.floor(b * 0.75);
    if (this.player.powers.shadowmeld) b *= 2;
    if (this.run.relics.includes('VITRUVIAN_MINION') && this.currentCard?.tags?.includes('minion')) b *= 2;
    return Math.max(0, b);
  }

  countStrikes() {
    const all = [...this.drawPile, ...this.hand, ...this.discardPile, ...this.exhaustPile];
    return all.filter(c => c.tags?.includes('strike')).length;
  }

  /* ---------------- 充能球 ---------------- */
  orbFocus() { return this.player.powers.focus || 0; }

  /** 不同种类的球有几个（冷却剂、编译冲击、同步都按"种类"算） */
  distinctOrbs() {
    return new Set(this.player.orbs.map(o => o.kind)).size;
  }

  async addOrbSlots(n) {
    this.maxOrbSlots = Math.min(10, this.maxOrbSlots + n);
    this.logEvent('power', `充能球栏位 +${n}（共 ${this.maxOrbSlots} 个）`);
    this.emit();
    await this.wait(70);
  }

  async removeOrbSlots(n) {
    this.maxOrbSlots = Math.max(0, this.maxOrbSlots - n);
    while (this.player.orbs.length > this.maxOrbSlots) this.player.orbs.pop();
    this.logEvent('power', `充能球栏位 -${n}（共 ${this.maxOrbSlots} 个）`);
    this.emit();
    await this.wait(70);
  }

  /** 生成（充能）一个球；栏位满了就先激发最左边那个 */
  async channelOrb(kind, opts = {}) {
    if (this.finished) return null;
    const meta = ORBS[kind];
    if (!meta) throw new Error('未知充能球 ' + kind);
    // 原作：基础栏位为 0 的角色（非故障机器人）第一次生成时补 1 个栏位
    if (this.maxOrbSlots <= 0) this.maxOrbSlots = 1;
    if (this.player.orbs.length >= this.maxOrbSlots) {
      await this.evokeFirst(1);
      if (this.finished) return null;
    }
    const orb = makeOrb(kind);
    this.player.orbs.push(orb);
    this.orbsChanneled[kind] = (this.orbsChanneled[kind] || 0) + 1;
    if (!opts.silent) {
      this.float(this.player, '+' + meta.name, 'buff');
      this.logEvent('power', `生成 1 个${meta.name}充能球`);
    }
    this.emit();
    await this.wait(opts.silent ? 20 : 80);
    return orb;
  }

  async channelRandom(n = 1) {
    for (let i = 0; i < n; i++) {
      if (this.finished) return;
      await this.channelOrb(this.rng.pick(ORB_KINDS));
    }
  }

  /** 球的实际数值（含集中）。等离子不吃集中 */
  orbValue(orb, base) {
    if (orb.kind === 'PLASMA') return base;
    return orbVal(base, this.orbFocus());
  }

  /** 球的伤害走"无源"通道：不吃力量/钢笔尖，但仍吃易伤与无实体 */
  async orbDamage(base, opts = {}) {
    if (this.finished) return [];
    let targets;
    if (opts.all) targets = this.alive();
    else if (opts.target && opts.target.alive) targets = [opts.target];
    else if (this.alive().length) targets = [this.rng.pick(this.alive())];
    else return [];
    const hit = [];
    for (const t of targets) {
      if (!t.alive) continue;
      let d = base;
      if (t.powers.vulnerable) d = Math.floor(d * 1.5);
      if (t.powers.intangible) d = 1;
      await this.dealDamage(t, Math.max(0, d), { source: 'player' });
      hit.push(t);
      if (this.finished) break;
    }
    await this.wait(60);
    return hit;
  }

  /** 被动：闪电/冰霜/黑暗/玻璃在回合结束触发，等离子在回合开始触发 */
  async orbPassive(orb, target = null) {
    if (!orb || this.finished) return;
    const f = this.orbFocus();
    if (orb.kind === 'LIGHTNING') {
      await this.orbDamage(this.orbValue(orb, 3), { target });
    } else if (orb.kind === 'FROST') {
      const b = this.orbValue(orb, 2);
      if (b > 0) await this.block(b, { raw: true, silent: true });
    } else if (orb.kind === 'DARK') {
      const add = this.orbValue(orb, 6);
      orb.value += add;
      this.float(this.player, '黑暗 +' + add, 'buff');
      this.logEvent('power', `黑暗充能球的激发伤害 +${add}（现在 ${orb.value}）`);
      this.emit();
      await this.wait(50);
    } else if (orb.kind === 'PLASMA') {
      this.gainEnergy(1);
      this.logEvent('power', '等离子充能球：+1 能量');
    } else if (orb.kind === 'GLASS') {
      const v = this.orbValue(orb, orb.value);
      if (v > 0) {
        await this.orbDamage(v, { all: true });
        orb.value = Math.max(0, orb.value - 1);
        this.emit();
      }
    }
  }

  /** 激发一个球（默认先从队列里移除） */
  async evokeOrb(orb, opts = {}) {
    if (!orb || this.finished) return;
    const idx = this.player.orbs.indexOf(orb);
    if (opts.dequeue !== false && idx >= 0) this.player.orbs.splice(idx, 1);
    await this.orbEvokeEffect(orb);
  }

  async orbEvokeEffect(orb) {
    const f = this.orbFocus();
    const meta = ORBS[orb.kind];
    this.logEvent('power', `激发${meta.name}充能球`);
    this.emit();
    await this.wait(70);
    if (orb.kind === 'LIGHTNING') {
      const d = this.orbValue(orb, 8);
      const hit = await this.orbDamage(d, {});
      if (this.player.powers.thunder) {
        for (const t of hit) {
          if (t && t.alive) await this.orbDamage(this.player.powers.thunder, { target: t });
        }
      }
    } else if (orb.kind === 'FROST') {
      const b = this.orbValue(orb, 5);
      if (b > 0) await this.block(b, { raw: true, silent: true });
    } else if (orb.kind === 'DARK') {
      const alive = this.alive();
      if (!alive.length) return;
      const t = alive.slice().sort((a, b) => a.hp - b.hp)[0];
      await this.orbDamage(orb.value, { target: t });
    } else if (orb.kind === 'PLASMA') {
      this.gainEnergy(2);
      this.logEvent('power', '等离子充能球：+2 能量');
    } else if (orb.kind === 'GLASS') {
      const d = this.orbValue(orb, orb.value) * 2;
      if (d > 0) await this.orbDamage(d, { all: true });
    }
  }

  /** 激发最左边的球 times 次（最后一次才把它拿走），对应原作的 EvokeNext */
  async evokeFirst(times = 1) {
    for (let i = 0; i < times; i++) {
      if (this.finished) return;
      const orb = this.player.orbs[0];
      if (!orb) return;
      await this.orbEvokeEffect(orb);
      if (i === times - 1) this.player.orbs.shift();
      this.emit();
    }
  }

  /** 激发最右边的球 times 次（吞噬暗影用的 EvokeLast） */
  async evokeLast(times = 1) {
    for (let i = 0; i < times; i++) {
      if (this.finished) return;
      const orb = this.player.orbs[this.player.orbs.length - 1];
      if (!orb) return;
      await this.orbEvokeEffect(orb);
      if (i === times - 1) this.player.orbs.pop();
      this.emit();
    }
  }

  /** 把队列里的球全部激发掉（打碎） */
  async evokeAll() {
    let guard = 0;
    while (this.player.orbs.length && !this.finished && guard++ < 20) {
      await this.evokeFirst(1);
    }
  }


  /* ---------------- 战斗开始 ---------------- */
  async start() {
    this.emit();
    this.logEvent('system', `战斗开始 · ${this.enemies.map(e => e.name).join('、')}（${this.enemies.map(e => e.hp).join('/')} 血）`);
    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.onCombatStart) await r.onCombatStart(this, r);
    }
    if (this.run.relics.includes('SNECKO_EYE')) this.confusion = true;
    // 注能（附魔）：每场战斗开始时自动打出
    for (const card of this.allCombatCards().filter(c => c.enchant?.autoPlay).slice()) {
      await this.autoPlay(card);
      if (this.finished) return;
    }
    await this.startPlayerTurn(true);
  }

  async startPlayerTurn(first = false) {
    if (this.finished) return;
    this.turn++;
    this.logEvent('turn', `第 ${this.turn} 回合`);
    this._target = null;
    this.hpLostThisTurn = 0;
    this.exhaustedThisTurn = 0;
    this.cardsPlayedThisTurn = 0;
    this.attacksPlayedThisTurn = 0;
    this.shivsPlayedThisTurn = 0;
    // 开悟（未升级）：只把「本回合」的费用改写清掉
    for (const card of this.allCombatCards()) if (card.costOverrideTurn != null) delete card.costOverrideTurn;
    this.skillsPlayedThisTurn = 0;
    this.cardsDrawnThisTurn = 0;
    this.discardedThisTurn = 0;
    this.powersPlayedThisTurn = 0;
    this.energySpentThisTurn = 0;
    this.statusCardsDrawnThisTurn = 0;
    this.zeroCostAttacksPlayed = 0;
    // 玩家回合开始的敌人侧重置：硬化外壳的每回合上限、胆小的每回合一次
    for (const e of this.enemies) {
      if (!e.alive || !e.def) continue;
      if (e.def.onPlayerTurnStart) e.def.onPlayerTurnStart(this, e);
    }
    // 回响形态：每回合重新发放 N 次「额外打出一次」
    this.player.echoFormUses = this.player.powers.echoForm || 0;
    this.player.attackCounter = 0;
    this.player.phantomReady = !!this.player.powers.phantomBlades;
    // 储君：逐回合计数与一次性标记（对照 PlayerCombatState.EndOfTurnCleanup）
    this.player.starsGainedThisTurn = 0;
    this.player.starsSpentThisTurn = 0;
    this.player.voidFormUses = 0;
    this.player.miniRegentUsed = false;
    this.player.regaliteUsed = false;
    this.player.paleBlueDotTriggered = false;
    // 「尖啸」「王之凝视」的临时力量削减在下个自己回合开始时恢复
    for (const e of this.enemies) e.strengthLoss = 0;
    // 倒映：在上一个敌人回合结束后、下个自己回合开始时移除（ReflectPower.AfterSideTurnStart）
    delete this.player.powers.reflect;

    // 格挡清空（壁垒/残影除外）
    if (!this.player.powers.barricade && !this.player.powers.blur) this.player.block = 0;
    delete this.player.powers.blur;
    // 暗影步只在"下一个回合"生效
    delete this.player.powers.shadowStep;
    if (this.player.shadowStepPending) {
      delete this.player.shadowStepPending;
      this.player.powers.shadowStep = 1;
    }

    // 回合开始触发（亡灵契约师：倒计时 / 精神过载 / 下回合召唤 / 哨卫模式 / 首回合遗物）
    if (this.necro) await this.necro.onTurnStart(this.turn);
    // 盾墙（活体盾）：玩家回合开始时，高塔炮手获得格挡
    for (const e of this.alive()) {
      if (!e.powers.rampart) continue;
      for (const t of this.alive()) {
        if (t.id !== 'TURRET_OPERATOR') continue;
        await this.enemyBlock(t, e.powers.rampart);
      }
    }
    if (this.player.powers.noxiousFumes) await this.addPowerAll('poison', this.player.powers.noxiousFumes);
    if (this.player.powers.infiniteBlades) await this.addShiv(this.player.powers.infiniteBlades, this.player.powers.infiniteBlades > 1);
    if (this.player.powers.wraithForm) {
      this.player.powers.dexterity = (this.player.powers.dexterity || 0) - 1;
      if (this.player.powers.dexterity <= 0) delete this.player.powers.dexterity;
    }
    if (this.player.powers.blockNextTurn) {
      await this.block(this.player.powers.blockNextTurn, { silent: true });
      delete this.player.powers.blockNextTurn;
    }
    if (this.player.powers.demonForm) await this.addPower('strength', this.player.powers.demonForm);
    if (this.player.powers.crimsonMantle) {
      await this.loseHp(1, { silent: true });
      await this.block(this.player.powers.crimsonMantle, { silent: true });
    }
    if (this.player.powers.helloWorld) {
      // 你好世界：回合开始时把随机普通牌加入手牌
      for (let i = 0; i < this.player.powers.helloWorld; i++) {
        const opts = this.run.poolByRarity('common');
        if (!opts.length) break;
        this.addCardToHand(this.makeCard(this.rng.pick(opts).id));
      }
    }
    if (this.player.powers.aggression) {
      const atk = this.discardPile.filter(c => c.type === 'attack');
      if (atk.length) {
        const c = this.rng.pick(atk);
        this.discardPile.splice(this.discardPile.indexOf(c), 1);
        if (!c.upgraded) this.upgradeCard(c);
        this.hand.push(c);
      }
    }
    if (this.player.powers.plating) {
      await this.block(this.player.powers.plating, { silent: true });
      this.player.powers.plating--;
      if (this.player.powers.plating <= 0) delete this.player.powers.plating;
    }
    if (this.player.powers.regen) {
      this.healPlayer(this.player.powers.regen);
      this.player.powers.regen--;
      if (this.player.powers.regen <= 0) delete this.player.powers.regen;
    }

    // 能量（遗物提供的能量统一走 onTurnStart）
    const baseEnergy = this.run.energyPerTurn || 3;
    this.maxEnergy = this.necro ? this.necro.modifyMaxEnergy(baseEnergy) : baseEnergy;
    // 先古遗物：+1 能量的那批统一走 modifyMaxEnergy
    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.modifyMaxEnergy) this.maxEnergy += r.modifyMaxEnergy(this);
    }
    // 佩尔的士兵：冷却每回合减 1
    if (this.run.relicData.paelsLegionCd > 0) this.run.relicData.paelsLegionCd--;
    // 衰朽：每回合获得的能量减少 1
    if (this.player.powers.wasteAway) this.maxEnergy = Math.max(0, this.maxEnergy - this.player.powers.wasteAway);
    this.energy = (this.player._carryEnergy || 0) + this.maxEnergy + (this.player.powers.pyre || 0);
    this.player._carryEnergy = 0;

    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.onTurnStart) await r.onTurnStart(this, this.turn);
    }

    /* ---- 能量重置之后、抽牌之前的触发（与原作 AfterEnergyReset 对齐） ---- */
    // 创世纪：回合开始获得星愿；下回合辉星：给完就移除自身
    if (this.player.powers.genesis) await this.gainStars(this.player.powers.genesis);
    if (this.player.powers.starNextTurn > 0) {
      await this.gainStars(this.player.powers.starNextTurn);
      delete this.player.powers.starNextTurn;
    }
    // 熔炉：回合开始铸造（FurnacePower.AfterSideTurnStart）
    if (this.player.powers.furnace) await this.forge(this.player.powers.furnace);
    if (this.player.powers.energyNextTurn > 0) {
      this.gainEnergy(this.player.powers.energyNextTurn);
      this.logEvent('power', `下回合能量生效：+${this.player.powers.energyNextTurn}`);
      delete this.player.powers.energyNextTurn;
    }
    if (this.player.powers.lightningRod > 0) {
      await this.channelOrb('LIGHTNING');
      this.player.powers.lightningRod--;
      if (this.player.powers.lightningRod <= 0) delete this.player.powers.lightningRod;
    }
    if (this.player.powers.spinner > 0) {
      for (let i = 0; i < this.player.powers.spinner; i++) await this.channelOrb('GLASS');
    }

    // 循环：触发最左边那个球的被动
    if (this.player.powers.loop > 0 && this.player.orbs.length) {
      for (let i = 0; i < this.player.powers.loop; i++) {
        if (!this.player.orbs.length) break;
        await this.orbPassive(this.player.orbs[0]);
      }
    }
    // 偏差认知：回合开始失去集中
    if (this.player.powers.biasedCognition > 0) {
      await this.addPower('focus', -this.player.powers.biasedCognition);
    }
    // 冷却剂：每有一种不同的球获得格挡
    if (this.player.powers.coolant > 0) {
      const b = this.distinctOrbs() * this.player.powers.coolant;
      if (b > 0) await this.block(b, { raw: true, silent: true });
    }
    // 等离子：回合开始时给能量
    for (const orb of this.player.orbs.slice()) {
      if (orb.kind === 'PLASMA') await this.orbPassive(orb);
    }
    // 创造性AI：抽牌前塞一张随机能力牌
    if (this.player.powers.creativeAi > 0) {
      for (let i = 0; i < this.player.powers.creativeAi; i++) {
        const card = this.randomCardOfType('power');
        if (card) this.addCardToHand(card);
      }
    }

    // 既定事项：抽牌前把抽牌堆最上面的 N 张放进手牌，然后自身移除（ForegoneConclusionPower.BeforeHandDraw）
    // 简化：原作让玩家从整个抽牌堆里挑，这里直接取顶上 N 张。
    if (this.player.powers.foregoneConclusion) {
      const n = this.player.powers.foregoneConclusion;
      for (let i = 0; i < n && this.drawPile.length && this.hand.length < 10; i++) {
        this.addCardToHand(this.drawPile.pop(), true);
      }
      this.logEvent('power', `「既定事项」：从抽牌堆取 ${n} 张牌加入手牌`);
      delete this.player.powers.foregoneConclusion;
    }
    // 光谱偏移：回合开始生成 N 张随机无色牌（SpectrumShiftPower.BeforeHandDraw）
    if (this.player.powers.spectrumShift) {
      for (let i = 0; i < this.player.powers.spectrumShift; i++) {
        const card = this.randomCardOfType('skill');
        if (card) this.addCardToHand(card);
      }
      this.logEvent('power', `「光谱偏移」：生成 ${this.player.powers.spectrumShift} 张无色牌`);
    }

    // 抽牌（准备背包只在首回合生效，异蛇之眼每回合生效；暴政额外抽牌）
    let drawCount = 5 + this.extraDrawPerTurn + (first ? this.firstTurnDraw : 0)
      + (this.player.powers.drawNextTurn || 0) + (this.player.powers.machineLearning || 0)
      + (this.player.powers.tyranny || 0);
    // 心灵腐化：每回合少抽 1 张牌（可叠加）
    if (this.player.powers.mindRot) drawCount -= this.player.powers.mindRot;
    drawCount = Math.max(0, drawCount);
    if (this.necro) drawCount = this.necro.beforeHandDraw(drawCount);  // 领域：每回合多抽 1
    delete this.player.powers.drawNextTurn;
    // 遗物：抽牌前的触发（发光珍珠 / 宝石面具 / 选择悖论 / 赐福鹿角）
    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.beforeDraw) await r.beforeDraw(this, this.turn);
    }
    this.drawLocked = false;
    await this.draw(drawCount, { silent: true, handDraw: true });
    // 小提琴：回合开始的抽牌结束后，本回合不能再抽牌
    if (this.run.relics.includes('FIDDLE')) this.drawLocked = true;
    // 遗物：抽牌后的触发（低语耳环：瓦库接管第一回合）
    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.afterDraw) await r.afterDraw(this, this.turn);
    }
    if (this.player.powers.toolsOfTheTrade) { await this.draw(1); await this.discardCards(1); }
    // 暴政：抽牌后消耗手牌（TyrannyPower.AfterPlayerTurnStart）
    if (this.player.powers.tyranny) {
      const n = this.player.powers.tyranny;
      const picked = await this.choose({ from: 'hand', count: n, prompt: `「暴政」：消耗 ${n} 张手牌`, optional: true });
      for (const c of picked) await this.exhaustCard(c);
    }

    this.player.tempStr = 0;
    this.emit();
    await this.wait(120);
  }

  /* ---------------- 抓牌/弃牌 ---------------- */
  async draw(n, opts = {}) {
    // 小提琴：回合开始的那次抽牌之后，本回合不再能抽任何牌
    if (this.drawLocked && !opts.handDraw) return [];
    // 遗物改写本次抽牌数量（授粉核心 / 大蘑菇）
    if (n > 0) {
      for (const rid of this.run.relics) {
        const r = RELICS[rid];
        if (r?.modifyDraw) n = r.modifyDraw(this, n, opts);
      }
    }
    const out = [];
    let budget = n;
    let guard = 0;
    while (budget > 0 && guard++ < 60) {
      budget--;
      if (this.player.powers.noDraw) break;
      if (this.hand.length >= 10) { this.msg('手牌已满'); break; }
      if (!this.drawPile.length) {
        if (!this.discardPile.length) break;
        this.drawPile = this.rng.shuffle(this.discardPile);
        this.discardPile = [];
        this.hoistPerfectFit();
        // 大～抱抱：抽牌堆每次洗牌时塞一张煤灰
        for (const rid of this.run.relics) {
          const r = RELICS[rid];
          if (r?.onShuffle) await r.onShuffle(this);
        }
      }
      const card = this.drawPile.pop();
      if (this.confusion) card.confusedCost = this.rng.int(4);
      // 魂缚锁链：本回合抽到的前 N 张牌被侵蚀为「魂缚」
      const chains = this.player.powers.chainsOfBinding;
      if (chains && (this.boundCardsDrawn || 0) < chains) {
        this.boundCardsDrawn = (this.boundCardsDrawn || 0) + 1;
        card.bound = true;
      }
      this.hand.push(card);
      out.push(card);
      // 亡灵契约师：书页风暴（抽到虚无牌多抽）/ 死亡行军的「回合内额外抽牌」计数
      if (this.necro) budget += this.necro.cardDrawn(card, opts) || 0;
      // 虚空：抽到时失去 1 点能量
      if (card.id === 'VOID') {
        this.energy = Math.max(0, this.energy - 1);
        this.logEvent('power', '「虚空」被抽到：失去 1 点能量');
      }
      // 迭代：每回合第一次抽到状态牌时多抽几张
      if (card.type === 'status') {
        this.statusCardsDrawnThisTurn++;
        if (this.statusCardsDrawnThisTurn === 1 && this.player.powers.iteration > 0) {
          budget += this.player.powers.iteration;
          this.logEvent('power', `「迭代」触发：额外抽 ${this.player.powers.iteration} 张牌`);
        }
      }
    }
    if (out.length) {
      this.cardsDrawnThisCombat += out.length;
      if (!opts.silent) {
        this.cardsDrawnThisTurn += out.length;
        // 速行者 / 腐蚀波：在回合进行中抽到牌时结算
        for (let i = 0; i < out.length; i++) {
          if (this.player.powers.speedster) {
            await this.attack(this.player.powers.speedster, { all: true, noStrength: true });
          }
          if (this.player.powers.corrosiveWave) {
            await this.addPowerAll('poison', this.player.powers.corrosiveWave);
          }
        }
      }
      if (!opts.quiet) this.logEvent('draw', `抽了 ${out.length} 张牌`);
      this.emit();
      await this.wait(70);
    }
    return out;
  }

  /* ---------------- 中毒 / 弃牌（静默猎手） ---------------- */
  /** 中毒结算：无视格挡扣血，然后层数 -1。触媒会让它多触发几次 */
  async tickPoison(target) {
    let p = target.powers.poison || 0;
    if (p <= 0 || !target.alive) return;
    const times = 1 + (target.isPlayer ? 0 : (this.player.powers.accel || 0));
    for (let i = 0; i < times; i++) {
      if (!target.alive || this.finished) break;
      p = target.powers.poison || 0;
      if (p <= 0) break;
      this.logEvent('damage', `${target.isPlayer ? '你' : target.name} 因中毒失去 ${p} 点生命`);
      await this.dealDamage(target, p, { ignoreBlock: true });
    }
    if (!target.alive) return;
    target.powers.poison = (target.powers.poison || 0) - 1;
    if (target.powers.poison <= 0) delete target.powers.poison;
    this.emit();
  }

  /** 弃一张牌（不走选择、不触发奇巧） */
  discardCard(card) {
    const i = this.hand.indexOf(card);
    if (i >= 0) this.hand.splice(i, 1);
    this.discardPile.push(card);
    this.discardedThisTurn++;
    return true;
  }

  /** 从手牌弃 n 张；奇巧牌在弃置后自动打出 */
  async discardCards(n, opts = {}) {
    if (n <= 0 || !this.hand.length) return [];
    const ct = Math.min(n, this.hand.length);
    let picked;
    if (ct >= this.hand.length && !opts.mustChoose) picked = this.hand.slice();
    else picked = await this.choose({ from: 'hand', count: ct, prompt: opts.prompt || `选择 ${ct} 张牌弃置`, optional: true });
    const out = [];
    for (const c of picked) { this.discardCard(c); out.push(c); }
    this.emit();
    for (const c of out) await this.triggerSly(c);
    return out;
  }

  async discardAll() {
    const all = this.hand.slice();
    for (const c of all) this.discardCard(c);
    this.emit();
    for (const c of all) await this.triggerSly(c);
    return all;
  }

  /** 奇巧 Sly：被弃置时自动打出（不耗能、不重复计入出牌数） */
  async triggerSly(card) {
    if (!card || !(card.def?.sly || card.sly)) return;
    if (this.finished) return;
    const i = this.discardPile.indexOf(card);
    if (i >= 0) this.discardPile.splice(i, 1);
    this.logEvent('play', `奇巧：「${card.name}」被弃置，自动打出`);
    const wasBusy = this.busy;
    this.busy = true;
    this.currentCard = card;
    this._target = this.alive()[0] || null;
    try { await card.def.play(this, card); }
    catch (err) { console.error('[sly]', err); }
    this.currentCard = null;
    if (!this.finished) {
      if (card.exhaustOnPlay) await this.exhaustCard(card);
      else this.discardPile.push(card);
    }
    this.busy = wasBusy;
    this.emit();
  }

  async addShiv(n, upgraded = false) {
    for (let i = 0; i < n; i++) await this.addCard('SHIV', 'hand', upgraded);
  }

  /** 卡片牌面当前伤害（小刀/固定伤害牌用） */
  cardDamageValue(card) {
    const v = card.def.vars ? card.def.vars(card, this, card) : {};
    return v.Damage ?? 0;
  }

  /* ---------------- 伤害 ---------------- */
  calcPlayerAttack(base, target, opts = {}) {
    let d = base;
    // 附魔：锋利/迅猛加固定伤害，腐化按比例增伤（只作用于这张牌本身）
    const ench = this.currentCard && this.currentCard.enchant;
    if (ench && !opts.osty) {
      if (ench.dmg) d += ench.dmg;
      if (ench.dmgPct) d = Math.floor(d * ench.dmgPct);
    }
    if (opts.osty) {
      // FromOsty：攻击者是奥斯提而非玩家 → 不吃玩家力量/虚弱/钢笔尖/暗影步/跟踪，
      // 但仍吃目标身上的易伤与无实体（对照 AttackCommand.cs 的 dealer 修正）
      if (target) {
        if (target.powers.vulnerable) d = Math.floor(d * 1.5);
        if (target.powers.intangible) d = 1;
      }
    } else {
      if (!opts.noStrength) d += this.str(this.player);
      if (this.player.vigor > 0 && !opts.noStrength) { d += this.player.vigor; this.player.vigor = 0; }
      if (this.player.powers.shrink) d = Math.floor(d * 0.7);
      if (this.player.powers.weak) d = Math.floor(d * (this.player.powers.debilitate ? 0.5 : 0.75));
      if (this.player.penNib >= 10) { d *= 2; }
      if (target) {
        if (target.powers.vulnerable) {
          // 摧残（debilitate）对易伤的 1.5→2 修正在 necro.modifyDamage 里统一处理，这里不重复
          const bonus = 1.5 + ((this.player.powers.cruelty || 0) / 100);
          d = Math.floor(d * bonus);
        }
        if (target.powers.intangible) d = 1;
        // 跟踪：对虚弱敌人伤害翻倍
        if (this.player.powers.tracking && target.powers.weak) d *= 2;
        // 征服者：君王之剑对该敌人造成双倍伤害（ConquerorPower）
        if (this.currentCard?.id === 'SOVEREIGN_BLADE' && target.powers.conqueror) d *= 2;
      }
      // 维特鲁威仆从：带「仆从」标签的牌伤害翻倍
      if (this.run.relics.includes('VITRUVIAN_MINION') && this.currentCard?.tags?.includes('minion')) d *= 2;
      // 暗影步：本回合攻击翻倍
      if (this.player.powers.shadowStep) d *= 2;
      // 打击木偶：名字带「打击」的牌额外 +1（事件里的仿制品）
      if (this.run.relics.includes('FAKE_STRIKE_DUMMY') && (this.currentCard?.tags || []).includes('strike')) d += 1;
    }
    if (this.necro) d = this.necro.modifyDamage(d, target, opts);
    return Math.max(0, Math.floor(d));
  }

  async attack(base, opts = {}) {
    const times = opts.times || 1;
    let killed = false;
    const totals = [];
    for (let t = 0; t < times; t++) {
      if (this.finished) break;
      let targets;
      if (opts.all) targets = this.alive();
      else if (opts.random) {
        const a = this.alive();
        targets = a.length ? [this.rng.pick(a)] : [];
      } else {
        const tg = opts.target || this.target;
        targets = tg && tg.alive ? [tg] : (this.alive().length ? [this.alive()[0]] : []);
      }
      for (const tg of targets) {
        const dmg = this.calcPlayerAttack(base, tg, opts);
        totals.push({ target: tg, amount: dmg });
        await this.dealDamage(tg, dmg, { isAttack: true, source: 'player', osty: !!opts.osty });
        if (!tg.alive) killed = true;
      }
      await this.wait(60);
      if (!this.alive().length) break;
    }
    if (this.necro) await this.necro.afterAttack(opts, totals);
    // 钢笔尖
    if (this.run.relics.includes('PEN_NIB')) {
      this.player.penNib = (this.player.penNib || 0) + 1;
      if (this.player.penNib > 10) this.player.penNib = 0;
    }
    return killed;
  }

  async dealDamage(target, amount, opts = {}) {
    if (!target.alive) return;
    if (target.isPlayer && target.powers.buffer > 0) {
      target.powers.buffer--;
      if (target.powers.buffer <= 0) delete target.powers.buffer;
      this.emit();
      return;
    }
    let remain = amount;
    let absorbed = 0;
    // 敌人数据层的伤害修正：单次伤害上限（难杀）、受到攻击减伤（飘忽）
    if (!target.isPlayer && target.def) {
      if (target.def.damageCap) {
        const cap = target.def.damageCap(this, target);
        if (cap != null) remain = Math.min(remain, cap);
      }
      if (target.def.incomingScale) {
        const s = target.def.incomingScale(this, target, opts);
        if (s != null && s !== 1) remain = Math.floor(remain * s);
      }
    }
    if (target.block > 0 && !opts.ignoreBlock) {
      absorbed = Math.min(target.block, remain);
      target.block -= absorbed;
      remain -= absorbed;
      if (absorbed > 0) this.float(target, '-' + absorbed, 'block');
      // 手钻：突破敌人格挡时给予 2 层易伤
      if (absorbed > 0 && target.block <= 0 && !target.isPlayer && opts.isAttack
          && this.run.relics.includes('HAND_DRILL')) {
        await this.enemyPower(target, 'vulnerable', 2);
      }
    }
    // 发条靴：玩家造成的未格挡攻击伤害不足 5 点时提升为 5
    if (remain > 0 && remain < 5 && opts.isAttack && !target.isPlayer && !opts.osty
        && this.run.relics.includes('THE_BOOT')) {
      remain = 5;
    }
    // 为你而死（DieForYouPower）：玩家格挡先吸收，未格挡的攻击伤害转给存活的奥斯提，
    // 奥斯提被打死后溢出部分回流玩家；非攻击伤害（中毒/遗物/能力）不转嫁。
    if (remain > 0 && target.isPlayer && opts.isAttack && opts.source && !opts.source.isPlayer && this.necro?.ostyAlive) {
      const taken = await this.necro.damageOsty(remain);
      if (taken > 0) {
        remain -= taken;
        this.logEvent('damage', `奥斯提 替你承受了 ${taken} 点伤害`);
      }
    }
    if (remain > 0) {
      target.hp -= remain;
      this.float(target, '-' + remain, 'dmg');
      if (target.isPlayer) {
        this.syncHp();
        this.hpLostThisTurn += remain;
        if (this.player.powers.rupture) await this.addPower('strength', this.player.powers.rupture);
      } else if (target.def.phaseCheck) {
      }
    } else {
      this.float(target, '格挡', 'block');
    }

    const who = target.isPlayer ? '你' : target.name;
    const src = (opts.source && typeof opts.source === 'object' && !opts.source.isPlayer)
      ? `${opts.source.name} → ` : '';
    if (absorbed && remain) this.logEvent('damage', `${src}${who} 受到 ${remain} 伤害（格挡挡下 ${absorbed}）`, { target: who, amount: remain });
    else if (absorbed) this.logEvent('damage', `${src}${who} 的格挡挡下了全部 ${absorbed} 伤害`, { target: who, amount: 0 });
    else this.logEvent('damage', `${src}${who} 受到 ${remain} 伤害`, { target: who, amount: remain });

    // 受击反馈
    this.hitTarget = target;
    this.emit();
    await this.wait(120);

    // 王之凝视：每当你攻击敌人，该敌人本回合失去 N 点力量
    if (opts.isAttack && !target.isPlayer && this.player.powers.monarchsGaze) {
      target.strengthLoss = (target.strengthLoss || 0) + this.player.powers.monarchsGaze;
      this.logEvent('power', `「王之凝视」：${target.name} 本回合失去 ${this.player.powers.monarchsGaze} 点力量`);
    }
    // 倒映：被格挡挡下的攻击伤害反弹给攻击者（ReflectPower）
    if (opts.isAttack && target.isPlayer && absorbed > 0 && this.player.powers.reflect
        && this._lastAttacker && this._lastAttacker.alive) {
      const atk = this._lastAttacker;
      this.logEvent('power', `「倒映」：将 ${absorbed} 点格挡伤害反弹给 ${atk.name}`);
      await this.dealDamage(atk, absorbed, { source: 'player' });
    }

    // 荆棘 / 火焰屏障
    if (opts.isAttack) {
      if (target.isPlayer) {
        if (this.player.powers.thorns) {
          const a = this.alive()[0];
          if (a) await this.dealDamage(a, this.player.powers.thorns, { isAttack: false });
        }
        if (this.player.powers.flameBarrier) {
          const atk = this._lastAttacker;
          if (atk && atk.alive) await this.dealDamage(atk, this.player.powers.flameBarrier, { isAttack: false });
        }
      } else {
        if (target.powers.thorns) {
          // 奥斯提发起的攻击，荆棘反伤打的是奥斯提（dealer），不是玩家
          if (opts.osty && this.necro?.ostyAlive) await this.necro.damageOsty(target.powers.thorns);
          else await this.dealDamage(this.player, target.powers.thorns, { isAttack: false });
        }
      }
      if (target.powers.curlUp) {
        const amt = target.powers.curlUp;
        delete target.powers.curlUp;
        target.block += amt;
      }
      if (target.powers.malleable) {
        target.block += target.powers.malleable;
      }
    }

    // 敌人数据层的受击钩子：失衡 / 沉睡苏醒 / 格挡被打穿 / 塞牌等
    if (!target.isPlayer && target.def && target.def.onDamaged) {
      await target.def.onDamaged(this, target, {
        blocked: absorbed,
        unblocked: Math.max(0, remain),
        isAttack: !!opts.isAttack,
        fullyBlocked: absorbed > 0 && remain <= 0,
      });
      if (!target.alive) return;
    }

    // 敌人打到你身上且未被格挡：纸伤难愈（掉最大生命）/ 疼痛戳刺（塞伤口）
    if (target.isPlayer && remain > 0 && opts.source && !opts.source.isPlayer && opts.isAttack) {
      const src = opts.source;
      if (src.powers && src.alive !== false) {
        if (src.powers.paperCuts) {
          this.logEvent('power', `「纸伤难愈」：${src.name} 撕开了你的生命上限`);
          this.loseMaxHp(src.powers.paperCuts);
        }
        if (src.powers.painfulStabs) {
          await this.addCard('WOUND', 'discard', false, src.powers.painfulStabs);
        }
      }
    }

    if (target.hp <= 0) {
      if (target.isPlayer) {
        this.player.hp = 0;
        this.syncHp();
        this.finished = true;
        this.won = false;
        this.cancelSelection();
        this.emit();
      } else {
        await this.killEnemy(target);
      }
    }
  }

  async killEnemy(e) {
    if (!e.alive) return;
    // 断肢重连一类的「假死」：返回 true 表示没有真正倒下
    if (e.def && e.def.onDeath && await e.def.onDeath(this, e)) { this.emit(); return; }
    e.alive = false;
    e.hp = 0;
    this.msg(`${e.name} 被击败`);
    if (e.powers.sporeCloud) await this.addPower('vulnerable', e.powers.sporeCloud);
    // 蟹之怒：盟友倒下时，同侧其它敌人获得力量与格挡
    for (const ally of this.enemies) {
      if (ally === e || !ally.alive) continue;
      if (ally.def.onAllyDeath) await ally.def.onAllyDeath(this, ally, e);
    }
    // 首领倒下 → 小兵随之消散（原作 Minion 特性）
    if (!e.minion) {
      for (const ally of this.alive()) {
        if (!ally.minion) continue;
        ally.alive = false;
        ally.hp = 0;
        this.msg(`${ally.name} 随之消散`);
      }
    }
    if (this.necro) this.necro.onDeath(e);
    this.emit();
    await this.wait(200);
    if (!this.alive().length) {
      this.finished = true;
      this.won = true;
      this.cancelSelection();
      if (!this.player.powers.barricade) this.player.block = 0;
      this.emit();
    }
  }

  /** 敌人逃离战斗（逃脱大师）：不计入击杀，全员离场则算胜利 */
  async escapeEnemy(e) {
    if (!e.alive) return;
    if (e.def.onDeath) await e.def.onDeath(this, e);
    e.alive = false;
    e.hp = 0;
    this.msg(`${e.name} 溜走了`);
    this.emit();
    await this.wait(200);
    if (!this.alive().length) {
      this.finished = true;
      this.won = true;
      this.timedOut = true;      // 敌人溜走：不算击败，事件不给奖励
      this.cancelSelection();
      if (!this.player.powers.barricade) this.player.block = 0;
      this.emit();
    }
  }
  /* ---------------- 格挡/能力 ---------------- */
  async block(amount, opts = {}) {
    // 附魔：灵巧额外获得格挡（只作用于这张牌本身）
    if (this.currentCard && this.currentCard.enchant && this.currentCard.enchant.block) {
      amount += this.currentCard.enchant.block;
    }
    // 附魔：黏糊（佩尔之爪）—— 这张牌的格挡值永久 +1，写回牌组条目
    if (this.currentCard && this.currentCard.enchant && this.currentCard.enchant.goopy && !opts.raw) {
      const c = this.currentCard;
      c.goopyBonus = (c.goopyBonus || 0) + 1;
      if (c.persist) c.persist.goopy = c.goopyBonus;
      amount += c.goopyBonus - 1;
    }
    // 佩尔的士兵：从卡牌获得的格挡翻倍，然后休眠 2 个回合
    const rd = this.run.relicData;
    if (this.currentCard && !opts.raw && this.run.relics.includes('PAELS_LEGION')
        && (rd.paelsLegionCd || 0) <= 0) {
      amount *= 2;
      rd.paelsLegionCd = 2;
    }
    let b = opts.raw ? amount : this.playerBlockGain(amount);
    if (b <= 0) return;
    this.player.block += b;
    if (!opts.silent) {
      this.float(this.player, '+' + b, 'def');
      this.logEvent('block', `获得 ${b} 点格挡`);
    }
    this.emit();
    if (this.player.powers.juggernaut) {
      await this.attack(this.player.powers.juggernaut, { random: true, noStrength: true });
    }
    if (!opts.silent) await this.wait(90);
  }

  async addPower(id, amount, target = null) {
    const t = target || this.player;
    if (id === 'strengthTemp') {
      t.tempStr = (t.tempStr || 0) + amount;
      this.float(t, (amount > 0 ? '+' : '') + amount + ' 力量', amount > 0 ? 'buff' : 'debuff');
      this.emit();
      return;
    }
    const meta = POWERS[id];
    const isDebuff = meta?.type === 'debuff';
    if (isDebuff && t.powers.artifact > 0) {
      t.powers.artifact--;
      if (t.powers.artifact <= 0) delete t.powers.artifact;
      this.emit();
      return;
    }
    t.powers[id] = (t.powers[id] || 0) + amount;
    if (t.powers[id] <= 0 && id !== 'strength' && id !== 'focus') delete t.powers[id];
    // 回响形态：本回合就生效，立即把次数补上（升级叠加时按总层数补发）
    if (id === 'echoForm' && t.isPlayer && amount > 0) {
      t.echoFormUses = (t.echoFormUses || 0) + amount;
    }
    if (amount !== 0) this.float(t, (amount > 0 ? '+' : '') + amount + ' ' + (meta?.name || id), id === 'vicious' ? 'buff' : (isDebuff ? 'debuff' : 'buff'));
    if (amount !== 0) {
      this.logEvent('power', `${t.isPlayer ? '你' : t.name} ${amount > 0 ? '获得' : '失去'} ${Math.abs(amount)} 层${meta?.name || id}`);
    }
    this.emit();
    // 毒性爆发：每给予若干次中毒，对全体造成伤害
    if (id === 'poison' && !t.isPlayer && this.player.powers.outbreak) {
      this.player.outbreakCount = (this.player.outbreakCount || 0) + 1;
      if (this.player.outbreakCount >= (this.player.outbreakEvery || 3)) {
        this.player.outbreakCount = 0;
        await this.attack(this.player.powers.outbreak, { all: true, noStrength: true });
      }
    }
    // 凶恶：给予易伤时抽牌
    if (id === 'vulnerable' && !t.isPlayer && this.player.powers.vicious) {
      await this.draw(this.player.powers.vicious);
    }
    if (this.necro) await this.necro.afterPowerChanged(id, amount, t);
    await this.wait(50);
  }

  async addPowerAll(id, amount) {
    for (const e of this.alive()) await this.addPower(id, amount, e);
  }

  async enemyPower(e, id, amount, amountAsc) {
    const amt = (amountAsc != null && this.asc >= 9) ? amountAsc : amount;
    await this.addPower(id, amt, e);
  }

  async enemyBlock(e, n) { e.block += n; this.emit(); await this.wait(60); }

  async enemyHeal(e, n) {
    e.hp = Math.min(e.maxHp, e.hp + n);
    this.float(e, '+' + n, 'heal');
    this.emit();
    await this.wait(80);
  }

  /** 地精佣兵的偷窃：从玩家身上拿走金币，记在敌人身上（打倒它可以拿回来） */
  async stealGold(e, n) {
    const steal = Math.min(n, this.run.gold);
    if (steal <= 0) return 0;
    this.run.gold -= steal;
    e.stolenGold = (e.stolenGold || 0) + steal;
    this.float(this.player, `-${steal} 金币`, 'debuff');
    this.logEvent('system', `${e.name} 偷走了 ${steal} 金币`);
    this.emit();
    await this.wait(60);
    return steal;
  }

  /* ---------------- 玩家动作 ---------------- */
  canPlay(card) {
    if (this.finished) return false;
    if (card.unplayable) return false;
    const def = CARDS[card.id];
    if (def.canPlay && !def.canPlay(this, card)) return false;
    const cost = this.costOf(card);
    if (typeof cost === 'number' && cost > this.energy) return false;
    const sc = this.starCostOf(card);
    if (typeof sc === 'number' && sc > this.player.stars) return false;
    if (this.player.powers.ringing === 0) return false;
    // 魂缚：每回合只能打出其中 1 张
    if (card.bound && (this.boundCardsPlayed || 0) > 0) return false;
    // 懒惰：每回合最多打出 N 张牌
    if (this.player.powers.sloth && this.cardsPlayedThisTurn >= this.player.powers.sloth) return false;
    // 烟雾弥漫：每回合只能打出 1 张技能牌
    if (this.player.powers.smoggy && card.type === 'skill' && this.skillsPlayedThisTurn >= 1) return false;
    // 凡庸：这张诅咒在手里时，每回合最多打出 3 张牌
    if (this.cardsPlayedThisTurn >= 3 && this.hand.some((h) => h.id === 'NORMALITY')) return false;
    return true;
  }

  costOf(card) {
    let c = card.cost;
    if (typeof c !== 'number') return c; // X
    if (card.id === 'ROCKET_PUNCH' && this.rocketPunchFree) return 0;
    if (this.confusion && card.confusedCost != null) c = card.confusedCost;
    if (this.player.powers.corruption && card.type === 'skill') c = 0;
    if (this.player.powers.freeAttack > 0 && card.type === 'attack') c = 0;
    if (this.player.powers.freeSkill > 0 && card.type === 'skill') c = 0;
    if (this.player.powers.freePower > 0 && card.type === 'power') c = 0;
    if (this.player.powers.tangled && card.type === 'attack') c += 1;
    // 好奇（打造时间）：能力牌耗能 -1
    if (this.player.powers.curious && card.type === 'power') c -= this.player.powers.curious;
    // 羽化：生成的攻击牌本场战斗免费
    if (card.freeCombat) c = 0;
    // 开悟：手牌耗能降到 1（升级版持续整场，未升级只持续本回合）
    if (card.costOverrideCombat != null) c = Math.min(c, card.costOverrideCombat);
    if (card.costOverrideTurn != null) c = Math.min(c, card.costOverrideTurn);
    // 剑圣：君王之剑耗能 +N（SwordSagePower）
    if (card.id === 'SOVEREIGN_BLADE' && this.player.powers.swordSage) c += this.player.powers.swordSage;
    // 虚空形态：每回合前 N 张牌能量为 0
    if (this.player.powers.voidForm && this.player.voidFormUses < this.player.powers.voidForm) c = 0;
    const def = CARDS[card.id];
    if (def.costMod) c += def.costMod(card, this);
    // 遗物改写费用（带刺手甲：能力牌 +1）
    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.modifyCost) c = r.modifyCost(this, card, c);
    }
    if (this.necro) c = this.necro.modifyCost(card, c);
    return Math.max(0, c);
  }

  v(name) {
    const card = this.currentCard;
    if (!card) return 0;
    const def = CARDS[card.id];
    const vars = def.vars ? def.vars(card, this, card) : {};
    return vars[name] ?? 0;
  }

  /**
   * 出牌。外面这层只管两件事：卡牌逻辑抛异常时别把 busy 卡死、
   * 以及无论如何都保证 busy 复位（busy 卡死 = 整场战斗点不动）。
   */
  async playCard(card, targetEnemy) {
    const wasBusy = this.busy;
    try {
      return await this._playCardInner(card, targetEnemy);
    } catch (err) {
      console.error('[playCard]', err);
      this.logEvent('system', `「${card?.name || '?'}」结算时出错：${err.message}`);
      return false;
    } finally {
      // 只有"这次出牌把锁留下了"才复位，正常打完时 inner 已经清过了
      if (!wasBusy && this.busy) {
        this.busy = false;
        this.emit();
      }
    }
  }

  async _playCardInner(card, targetEnemy) {
    if (this.busy) return false;
    if (!this.canPlay(card)) return false;
    const idx = this.hand.indexOf(card);
    if (idx < 0) return false;

    this.busy = true;
    // 封印王座：每张牌打出前获得星愿（TheSealedThronePower.BeforeCardPlayed）
    if (this.player.powers.sealedThrone) await this.gainStars(this.player.powers.sealedThrone);
    if (this.finished) { this.busy = false; return false; }
    const cost = this.costOf(card);
    const isX = typeof card.cost !== 'number';
    const xValue = isX ? this.energy : 0;
    const starCost = this.starCostOf(card);
    const isXStar = card.stars === 'X';
    const starXValue = isXStar ? this.player.stars : 0;
    this.starXValue = starXValue;
    this.energy -= isX ? this.energy : cost;
    this.energySpentThisTurn += isX ? xValue : cost;
    // 星愿是独立资源：扣费与 AfterStarsSpent 钩子都在卡牌效果之前结算（CardModel.PlayAsync）
    if (starCost > 0) await this.spendStars(starCost);
    if (this.finished) { this.busy = false; return false; }
    // 虚空形态用掉一次免费名额；环绕轨道累计已花费能量
    if (this.player.powers.voidForm && this.player.voidFormUses < this.player.powers.voidForm) this.player.voidFormUses++;
    this.player.orbitEnergySpent += isX ? xValue : cost;
    while (this.player.powers.orbit && this.player.orbitEnergySpent >= 4) {
      this.player.orbitEnergySpent -= 4;
      this.gainEnergy(this.player.powers.orbit);
      this.logEvent('power', `「环绕轨道」：+${this.player.powers.orbit} 能量`);
    }
    this.hand.splice(idx, 1);
    this.currentCard = card;
    this.xValue = xValue;
    this._target = targetEnemy || this.alive()[0];
    this.cardsPlayedThisTurn++;
    this.cardsPlayedThisCombat++;
    if (card.type === 'skill') this.skillsPlayedThisTurn++;
    if (card.type === 'power') this.powersPlayedThisTurn++;
    // 魂缚：打出后本回合剩余的魂缚牌不能再打出
    if (card.bound) this.boundCardsPlayed = (this.boundCardsPlayed || 0) + 1;
    // 柔嫩（Tender）：本回合每打出一张牌，失去 1 点力量与敏捷，回合结束时归还
    if (this.player.powers.tender) {
      this.player.tenderLoss = (this.player.tenderLoss || 0) + 1;
      this.player.powers.strength = (this.player.powers.strength || 0) - 1;
      this.player.powers.dexterity = (this.player.powers.dexterity || 0) - 1;
      this.logEvent('power', '「柔嫩」：失去 1 点力量与敏捷');
    }

    const aimed = card.def.target === 'enemy' && this._target && this._target.alive ? ` → ${this._target.name}` : '';
    const costText = isX ? `X=${xValue}` : cost > 0 ? `${cost} 能量` : '免费';
    const starText = starCost > 0 ? ` · ${starCost} 星愿${isXStar ? `(X=${starXValue})` : ''}` : '';
    this.logEvent('play', `打出「${card.name}」（${costText}${starText}）${aimed}`, { card: card.id });

    this.emit();
    await this.wait(60);

    // 亡灵契约师：打出前的能力（死亡之舞 / 灰烬之灵 / 刺破帷幕 / 湮灭快照）
    if (this.necro) await this.necro.beforeCardPlayed(card, isX ? xValue : cost);

    // 连环拳 / 下次攻击免费 / 爆发 / 回响形态 / 信号增强 / 重构（重放）
    let replay = 1 + (card.replayBonus || 0) + (card.enchant?.replay || 0);
    // 投斧：每场战斗打出的第一张牌多打出一次
    if (this.run.relics.includes('THROWING_AXE') && !this.run.relicData.throwingAxeUsed) {
      this.run.relicData.throwingAxeUsed = true;
      replay += 1;
    }
    if (card.type === 'attack') {
      this.attacksPlayedThisTurn++;
      this.player.attackCounter++;
      if (this.player.powers.freeAttack > 0) {
        this.player.powers.freeAttack--;
        if (this.player.powers.freeAttack <= 0) delete this.player.powers.freeAttack;
      }
      if (this.player.powers.oneTwoPunch > 0) {
        this.player.powers.oneTwoPunch--;
        if (this.player.powers.oneTwoPunch <= 0) delete this.player.powers.oneTwoPunch;
        replay = 2;
      }
      if (this.run.relics.includes('KUNAI') && this.attacksPlayedThisTurn % 3 === 0) await this.addPower('dexterity', 1);
      if (this.run.relics.includes('SHURIKEN') && this.attacksPlayedThisTurn % 3 === 0) await this.addPower('strength', 1);
    }
    if (card.type === 'skill' && this.player.powers.masterPlanner) card.sly = true;
    if (card.type === 'skill' && this.player.powers.burst > 0) {
      this.player.powers.burst--;
      if (this.player.powers.burst <= 0) delete this.player.powers.burst;
      replay = 2;
    }
    // 回响形态：本回合还没用掉的次数，用掉一次这张牌就多打一遍
    // （在能力牌生效之后打出的牌才算，所以回响形态自己不会被复制）
    if (this.player.echoFormUses > 0) {
      this.player.echoFormUses--;
      replay += 1;
    }
    // 信号增强：下一张能力牌额外打出一次
    if (card.type === 'power' && this.player.powers.signalBoost > 0) {
      this.player.powers.signalBoost--;
      if (this.player.powers.signalBoost <= 0) delete this.player.powers.signalBoost;
      replay += 1;
    }

    for (let r = 0; r < replay; r++) {
      if (this.finished) break;
      await card.def.play(this, card);
    }
    // 附魔：腐化打出扣血、迅捷打出抽牌
    if (!this.finished && card.enchant?.hpLoss) await this.loseHp(card.enchant.hpLoss, { silent: true });
    if (!this.finished && card.enchant?.draw) await this.draw(card.enchant.draw);

    // 亡灵契约师：虚无计数 / 灵魂 / 湮灭 / 象牙麻将牌
    if (this.necro) await this.necro.afterCardPlayed(card, isX ? xValue : cost);
    // 独白：本回合每打出一张牌获得力量（回合末统一回收，等价临时力量）
    if (this.player.powers.monologue && !this.finished) {
      await this.addPower('strengthTemp', this.player.powers.monologue);
    }
    // 暗淡蓝点：一回合内打出满 5 张牌时，下回合额外抽牌（每回合只触发一次）
    if (this.player.powers.paleBlueDot && !this.player.paleBlueDotTriggered
        && this.cardsPlayedThisTurn >= 5 && !this.finished) {
      this.player.paleBlueDotTriggered = true;
      await this.addPower('drawNextTurn', this.player.powers.paleBlueDot);
    }

    // 雷暴 / 子程序：每打出一张能力牌触发
    if (card.type === 'power' && !this.finished) {
      if (this.player.powers.storm > 0) {
        for (let i = 0; i < this.player.powers.storm; i++) await this.channelOrb('LIGHTNING');
      }
      if (this.player.powers.subroutine > 0) {
        this.gainEnergy(this.player.powers.subroutine);
        this.logEvent('power', `「子程序」：+${this.player.powers.subroutine} 能量`);
      }
    }

    // 余像 / 群蛇形态 / 墨之刃 / 紧勒
    if (this.player.powers.afterimage) await this.block(this.player.powers.afterimage, { silent: true });
    if (this.player.powers.serpentForm) {
      await this.attack(this.player.powers.serpentForm, { random: true, noStrength: true });
    }
    if (card.type === 'attack' && this.player.powers.inkBlade) {
      await this.addPower('strengthTemp', this.player.powers.inkBlade);
    }
    for (const e of this.alive()) {
      if (e.powers.strangle && card.id !== 'STRANGLE') {
        await this.dealDamage(e, e.powers.strangle, { ignoreBlock: true });
      }
    }

    // 狂怒
    if (card.type === 'attack' && this.player.powers.rage) {
      await this.block(this.player.powers.rage, { silent: true });
    }
    // 敌人激怒
    for (const e of this.alive()) {
      if (e.powers.enrage && card.type === 'skill') await this.enemyPower(e, 'strength', e.powers.enrage);
    }

    // 第三幕：流电（能力牌被侵蚀，打出后受伤）/ 凋零气场（每 N 张牌塞一张凋零）
    for (const e of this.alive()) {
      if (e.powers.galvanic && card.type === 'power') {
        this.logEvent('power', `「流电」：${e.name} 的电流灼烧你的能力牌`);
        await this.dealDamage(this.player, e.powers.galvanic, { source: e });
      }
      if (e.def && e.def.onPlayerCardPlayed) await e.def.onPlayerCardPlayed(this, e, card);
      if (this.finished) break;
    }
    // 遗物：打出牌时触发（迷失鬼火）
    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.onCardPlayed) await r.onCardPlayed(this, card);
      if (this.finished) break;
    }

    this.currentCard = null;

    // 野性：每回合前 N 张 0 费攻击牌回到手牌
    const zeroCostAttack = card.type === 'attack' && !isX && cost === 0;
    const feralBack = zeroCostAttack && this.player.powers.feral > 0
      && this.zeroCostAttacksPlayed < this.player.powers.feral
      && this.hand.length < 10;

    // 去处
    const exhaust = card.exhaustOnPlay
      || (this.player.powers.corruption && card.type === 'skill');
    if (this.finished) {
      // 战斗结束后卡牌不处理
    } else if (feralBack) {
      this.zeroCostAttacksPlayed++;
      this.hand.push(card);
      this.logEvent('power', `「野性」：${card.name} 回到手牌`);
    } else if (exhaust) {
      await this.exhaustCard(card, true);
    } else if (card.type === 'power') {
      // 能力牌打出后不再回到牌堆（本场战斗内一直生效）
      this.powerPile.push(card);
    } else if (this.player.powers.rebound > 0) {
      // 弹回：本回合打出的下一张牌回到抽牌堆顶部
      this.player.powers.rebound--;
      if (this.player.powers.rebound <= 0) delete this.player.powers.rebound;
      this.drawPile.push(card);
      this.logEvent('power', `「弹回」：${card.name} 回到了抽牌堆顶部`);
    } else {
      this.discardPile.push(card);
    }

    if (this.player.powers.ringing > 0) {
      this.player.powers.ringing--;
      if (this.player.powers.ringing <= 0) delete this.player.powers.ringing;
    }
    if (card.type === 'skill' && this.player.powers.freeSkill) delete this.player.powers.freeSkill;
    if (card.type === 'power' && this.player.powers.freePower > 0) {
      this.player.powers.freePower--;
      if (this.player.powers.freePower <= 0) delete this.player.powers.freePower;
    }
    // 亡灵契约师：得力助手在「打出耗能≥2的牌」之后从弃牌堆回手
    if (this.necro) await this.necro.afterCardPlayedLate(card, isX ? xValue : cost);
    card.freeThisTurn = false;
    this.busy = false;
    this.emit();
    return true;
  }

  async exhaustCard(card, fromPlay = false) {
    const hi = this.hand.indexOf(card);
    if (hi >= 0) this.hand.splice(hi, 1);
    else if (fromPlay) { /* 已在出牌时移除 */ }
    this.exhaustPile.push(card);
    this.exhaustedThisTurn++;
    if (this.player.powers.feelNoPain) await this.block(this.player.powers.feelNoPain, { silent: true });
    if (this.player.powers.darkEmbrace) await this.draw(this.player.powers.darkEmbrace);
    // 遗物：消耗时触发（遗忘之魂）
    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.onExhaust) await r.onExhaust(this, card);
    }
    this.emit();
  }

  async exhaustRandom(n) {
    for (let i = 0; i < n; i++) {
      if (!this.hand.length) return;
      const card = this.rng.pick(this.hand);
      await this.exhaustCard(card);
    }
  }

  async exhaustTopOfDraw() {
    if (!this.drawPile.length && this.discardPile.length) {
      this.drawPile = this.rng.shuffle(this.discardPile);
      this.discardPile = [];
      this.hoistPerfectFit();
    }
    const card = this.drawPile.pop();
    if (card) {
      this.exhaustPile.push(card);
      this.exhaustedThisTurn++;
      this.msg(`消耗了 ${card.name}`);
      this.emit();
    }
  }

  async playTopOfDraw(exhaustAfter = false) {
    if (!this.drawPile.length && this.discardPile.length) {
      this.drawPile = this.rng.shuffle(this.discardPile);
      this.discardPile = [];
      this.hoistPerfectFit();
    }
    const card = this.drawPile.pop();
    if (!card) return;
    this.msg(`打出了 ${card.name}`);
    this.emit();
    await this.wait(180);
    this.currentCard = card;
    this._target = this.alive()[0];
    await card.def.play(this, card);
    this.currentCard = null;
    if (exhaustAfter) {
      this.exhaustPile.push(card);
      this.exhaustedThisTurn++;
      if (this.player.powers.feelNoPain) await this.block(this.player.powers.feelNoPain, { silent: true });
      if (this.player.powers.darkEmbrace) await this.draw(this.player.powers.darkEmbrace);
    } else {
      this.discardPile.push(card);
    }
    this.emit();
  }

  putOnDrawTop(card) {
    const i = this.discardPile.indexOf(card);
    if (i >= 0) this.discardPile.splice(i, 1);
    const hi = this.hand.indexOf(card);
    if (hi >= 0) this.hand.splice(hi, 1);
    this.drawPile.push(card);
    this.emit();
  }

  /** 从任意牌堆直接打出一张牌（骚动这类"自动打出"用），不付能量、不计入出牌数 */
  async autoPlay(card) {
    if (!card || this.finished) return;
    for (const pile of [this.hand, this.drawPile, this.discardPile]) {
      const i = pile.indexOf(card);
      if (i >= 0) pile.splice(i, 1);
    }
    this.msg(`打出了 ${card.name}`);
    this.emit();
    await this.wait(160);
    this.currentCard = card;
    this._target = this.alive()[0];
    try { await card.def.play(this, card); }
    catch (err) { console.error('[autoPlay]', err); }
    this.currentCard = null;
    if (!this.finished) {
      if (card.exhaustOnPlay) await this.exhaustCard(card);
      else this.discardPile.push(card);
    }
    this.emit();
  }

  /** 完美契合：把附魔过的牌挪到抽牌堆顶部（drawPile.pop() 先取到） */
  hoistPerfectFit() {
    const fitted = this.drawPile.filter(c => c.perfectFit);
    if (fitted.length) this.drawPile = this.drawPile.filter(c => !c.perfectFit).concat(fitted);
  }

  addCardToHand(card, generated = false) {
    if (this.hand.length < 10) this.hand.push(card);
    else this.discardPile.push(card);
    this.emit();
    if (!generated) this.onCardGenerated(card);
  }

  async addCard(id, pile = 'discard', upgraded = false, times = 1) {
    const out = [];
    for (let i = 0; i < times; i++) {
      const c = newCard(id, upgraded);
      c.freeThisTurn = true;
      if (pile === 'hand') this.addCardToHand(c, true);
      else if (pile === 'draw') this.drawPile.push(c);
      else this.discardPile.push(c);
      out.push(c);
      this.onCardGenerated(c);
      if (CARDS[id]?.type === 'status') await this.onStatusGenerated(c);
    }
    this.emit();
    await this.wait(40);
    return out;
  }

  /** 生成状态牌时的连锁：烟囱 / 化废为宝 / 火箭飞拳 */
  async onStatusGenerated(card) {
    this.statusCardsGenerated++;
    if (this.finished) return;
    if (this.player.powers.smokestack) {
      await this.orbDamage(this.player.powers.smokestack, { all: true });
    }
    for (let i = 0; i < (this.player.powers.trashToTreasure || 0); i++) {
      if (this.finished) return;
      await this.channelOrb(this.rng.pick(ORB_KINDS));
    }
    this.rocketPunchFree = true;
    this.emit();
  }

  randomCardOfType(type) {
    const ids = Object.values(CARDS)
      .filter(d => d && d.type === type && !['status', 'curse', 'basic', 'token', 'event', 'quest'].includes(d.rarity))
      .filter(d => !d.char || d.char === 'NEUTRAL' || d.char === this.run.charId)
      .map(d => d.id);
    if (!ids.length) return null;
    const card = newCard(this.rng.pick(ids));
    // 本复刻没有独立的「无色牌池」，随机生成的牌按无色牌处理（武器库 / 君王矿石 / 光谱偏移）
    card.colorless = true;
    return card;
  }

  upgradeCard(card) {
    if (card.upgraded) return;
    card.upgraded = true;
    this.emit();
  }

  loseHp(n, opts = {}) {
    const before = this.player.powers.buffer;
    if (before > 0) {
      this.player.powers.buffer--;
      if (this.player.powers.buffer <= 0) delete this.player.powers.buffer;
      return;
    }
    this.player.hp -= n;
    this.syncHp();
    this.hpLostThisTurn += n;
    if (!opts.silent) this.float(this.player, '-' + n, 'dmg');
    if (this.player.powers.rupture) this.addPower('strength', this.player.powers.rupture);
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.finished = true; this.won = false;
      this.cancelSelection();
    }
    this.emit();
  }

  healPlayer(n) {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + n);
    this.syncHp();
    this.float(this.player, '+' + n, 'heal');
    this.emit();
  }

  gainMaxHp(n) {
    this.player.maxHp += n;
    this.run.maxHp += n;
    this.healPlayer(n);
  }

  /** 失去最大生命（纸伤难愈）：不会低于 1，当前生命同步压到上限 */
  loseMaxHp(n) {
    const loss = Math.max(0, Math.min(n, this.player.maxHp - 1));
    if (!loss) return;
    this.player.maxHp -= loss;
    this.run.maxHp = Math.max(1, this.run.maxHp - loss);
    if (this.player.hp > this.player.maxHp) this.player.hp = this.player.maxHp;
    this.syncHp();
    this.float(this.player, `-${loss} 上限`, 'debuff');
    this.logEvent('power', `你失去了 ${loss} 点最大生命`);
    this.emit();
  }

  gainEnergy(n) {
    this.energy += n;
    this.emit();
    this.energyGained = true;
  }

  /* ---------------- 储君：星愿（Stars）与铸造（Forge） ----------------
   * 对照 sts2-sim：
   *  - Entities/Players/PlayerCombatState.cs   Stars 不随回合重置，只有 Gain/Lose 改动
   *  - Models/CardModel.cs                    StarCost / ResolveStarCost / X 星费 = 当前星愿数
   *  - Commands/PlayerCmd.cs                  GainStars 后 Hook.AfterStarsGained
   *  - Commands/ForgeCmd.cs                  没有君王之剑就生成一张，然后给所有君王之剑 AddDamage
   *  - Models/Powers/{BlackHole,ChildOfTheStars,StarNextTurn,Genesis,TheSealedThrone}Power.cs
   */
  starCostOf(card) {
    let s = card.stars ?? 0;
    if (typeof s !== 'number') return this.player.stars; // X 星费：花光当前星愿
    // 虚空形态：每回合前 N 张牌能量与星愿都免费（VoidFormPower.TryModify*Cost）
    if (this.player.powers.voidForm && this.player.voidFormUses < this.player.powers.voidForm) s = 0;
    return Math.max(0, s);
  }

  async gainStars(n) {
    n = Math.max(0, Math.floor(n || 0));
    if (!n || this.finished) return;
    this.player.stars += n;
    this.player.starsGainedThisTurn += n;
    this.logEvent('power', `获得 ${n} 点星愿（现有 ${this.player.stars}）`);
    this.float(this.player, '+' + n + ' 星愿', 'buff');
    this.emit();
    if (this.player.powers.blackHole) await this.damageAllEnemiesRaw(this.player.powers.blackHole);
  }

  async spendStars(n) {
    n = Math.max(0, Math.floor(n || 0));
    if (!n) return;
    const spent = Math.min(n, this.player.stars);
    if (!spent) return;
    this.player.stars -= spent;
    this.player.starsSpentThisTurn += spent;
    this.player.starsSpentThisCombat += spent;
    this.logEvent('power', `花费 ${spent} 点星愿（剩余 ${this.player.stars}）`);
    this.emit();
    // 群星之子：每花费 1 点星愿给 N 点格挡（ChildOfTheStarsPower.AfterStarsSpent）
    if (this.player.powers.childOfTheStars) {
      await this.block(this.player.powers.childOfTheStars * spent, { raw: true, silent: true });
    }
    // 黑洞：花费星愿时也触发一次全体伤害
    if (this.player.powers.blackHole) await this.damageAllEnemiesRaw(this.player.powers.blackHole);
    // 迷你储君：每回合第一次花费星愿 → +1 力量
    if (this.run.relics.includes('MINI_REGENT') && !this.player.miniRegentUsed) {
      this.player.miniRegentUsed = true;
      await this.addPower('strength', 1);
    }
    // 星系尘埃：每累计花费 10 点星愿 → 10 点格挡
    if (this.run.relics.includes('GALACTIC_DUST')) {
      this.player.galacticDustStars += spent;
      const triggers = Math.floor(this.player.galacticDustStars / 10);
      if (triggers > 0) {
        this.player.galacticDustStars %= 10;
        await this.block(10 * triggers, { raw: true, silent: true });
      }
    }
  }

  addVigor(n) {
    this.player.vigor = (this.player.vigor || 0) + Math.max(0, Math.floor(n || 0));
    this.logEvent('power', `获得 ${n} 点活力`);
    this.float(this.player, '+' + n + ' 活力', 'buff');
    this.emit();
  }

  /** 铸造：生成/强化「君王之剑」（ForgeCmd.Forge） */
  async forge(n) {
    n = Math.floor(n || 0);
    if (!n || this.finished) return;
    const active = [this.drawPile, this.hand, this.discardPile, this.powerPile]
      .flat().filter(c => c && c.id === 'SOVEREIGN_BLADE');
    if (!active.length) {
      const made = await this.addCard('SOVEREIGN_BLADE', 'hand');
      const blade = made[0];
      blade.freeThisTurn = false;   // 生成的君王之剑不享受「本回合免费」
      active.push(blade);
      this.logEvent('system', '铸造：生成「君王之剑」');
    }
    // 消耗堆里的君王之剑同样被强化（ForgeCmd 传 includeExhausted: true）
    const all = active.concat(this.exhaustPile.filter(c => c.id === 'SOVEREIGN_BLADE'));
    for (const b of all) b.bonus = (b.bonus || 0) + n;
    this.logEvent('power', `铸造 +${n}：「君王之剑」现在造成 ${10 + (all[0].bonus || 0)} 点伤害`);
    this.emit();
  }

  /** 黑洞用的全体固定伤害：不吃力量/虚弱/易伤（ValueProp.Unpowered） */
  async damageAllEnemiesRaw(n) {
    for (const e of this.alive()) {
      if (this.finished) break;
      await this.dealDamage(e, n, { source: 'player' });
    }
  }

  /** 每生成一张牌的钩子：创世之柱 / 武器库 / 君王矿石 */
  onCardGenerated(card) {
    this.cardsGeneratedThisCombat++;
    if (this.finished) return;
    if (this.player.powers.pillarOfCreation) {
      const b = this.player.powers.pillarOfCreation;
      this.player.block += b;
      this.logEvent('block', `「创世之柱」：获得 ${b} 点格挡`);
    }
    if (card.colorless) {
      if (this.player.powers.arsenal) this.addPower('strength', this.player.powers.arsenal);
      if (this.run.relics.includes('REGALITE') && !this.player.regaliteUsed) {
        this.player.regaliteUsed = true;
        this.player.block += 4;
        this.logEvent('block', '「君王矿石」：获得 4 点格挡');
      }
    }
    this.emit();
  }

  async choose(opts) {
    const { from = 'hand', count = 1, filter = () => true, prompt = '选择一张牌', optional = false } = opts;
    // 战斗已经结束（例：头槌最后一击打死敌人，之后才轮到"选一张牌放回牌顶"）：
    // 这时再弹选择面板会盖在战利品界面上，流程永远等不到确认 → 直接跳过。
    if (this.finished) return [];
    const pool = (from === 'hand' ? this.hand : from === 'discard' ? this.discardPile
      : from === 'draw' ? this.drawPile : this.exhaustPile).filter(filter);
    if (!pool.length) return [];
    if (count >= pool.length) return pool.slice(0, count);
    if (this.requestSelection) {
      const picked = await this.requestSelection({ pool, count, prompt, optional });
      if (picked && picked.length) return picked;
      if (optional) return [];
      return pool.slice(0, count);
    }
    return pool.slice(0, count);
  }

  /* ---------------- 回合结束 ---------------- */
  async endTurn() {
    if (this.finished || this.busy) return;
    this.busy = true;
    try {
      await this._endTurnInner();
    } finally {
      this.busy = false;
    }
  }

  async _endTurnInner() {
    this.logEvent('turn', `—— 你的回合结束（剩 ${this.energy} 能量）——`);
    // 回合结束：手牌中的烧伤/感染
    for (const card of [...this.hand]) {
      if (card.id === 'BURN') await this.dealDamage(this.player, 2, {});
      if (card.id === 'INFECTION') await this.dealDamage(this.player, 1, {});
      if (card.id === 'TOXIC') await this.dealDamage(this.player, 5, {});
      // 呼唤（灵魂异鱼）：不可格挡的 6 点生命损失
      if (card.id === 'BECKON') await this.dealDamage(this.player, 6, { ignoreBlock: true });
      // 凋零（永世之镜）：3 点起，每被「渐强」假升级一次 +3
      if (card.id === 'WITHER') await this.dealDamage(this.player, 3 + 3 * (card.witherLevel || 0), {});
      // 诅咒：腐朽 / 霉运 / 悔恨 / 羞耻 / 疑虑（回合结束时留在手里才触发）
      if (card.id === 'DECAY') await this.dealDamage(this.player, 2, {});
      if (card.id === 'BAD_LUCK') await this.loseHp(13);
      if (card.id === 'REGRET') await this.loseHp(this.hand.length);
      if (card.id === 'SHAME') await this.addPower('frail', 1);
      if (card.id === 'DOUBT') await this.addPower('weak', 1);
      // 债务：回合结束时手里还有它，就丢掉 10 金币
      if (card.id === 'DEBT') {
        const loss = Math.min(10, this.run.gold);
        if (loss > 0) {
          this.run.gold -= loss;
          this.logEvent('system', `「债务」让你失去了 ${loss} 金币`);
          this.emit();
        }
      }
    }
    if (this.finished) return;

    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.onTurnEnd) await r.onTurnEnd(this, r);
    }

    // 冰雹风暴：回合结束时若场上有冰霜球，对所有敌人造成伤害
    if (this.player.powers.hailstorm && this.player.orbs.some(o => o.kind === 'FROST')) {
      await this.orbDamage(this.player.powers.hailstorm, { all: true });
      if (this.finished) return;
    }
    // 充能球被动（闪电/冰霜/黑暗/玻璃都在回合结束时触发；等离子在回合开始）
    for (const orb of this.player.orbs.slice()) {
      if (this.finished) return;
      if (orb.kind === 'PLASMA') continue;
      if (!this.player.orbs.includes(orb)) continue;
      await this.orbPassive(orb);
    }
    // 吞噬暗影：回合结束时激发最右边的球
    for (let i = 0; i < (this.player.powers.consumingShadow || 0); i++) {
      if (this.finished || !this.player.orbs.length) break;
      await this.evokeLast(1);
    }
    if (this.finished) return;

    // 紧缠
    if (this.player.powers.constrict) await this.dealDamage(this.player, this.player.powers.constrict, {});
    // 玩家身上的中毒
    await this.tickPoison(this.player);
    if (this.finished) return;

    // 玩家减益倒计时
    for (const k of ['vulnerable', 'weak', 'frail', 'tangled', 'shrink', 'noDraw', 'rage', 'flameBarrier', 'strengthTemp']) {
      if (k === 'strengthTemp') { this.player.tempStr = 0; continue; }
      if (this.player.powers[k] != null) {
        this.player.powers[k]--;
        if (this.player.powers[k] <= 0) delete this.player.powers[k];
      }
    }
    this.player.tempStr = 0;

    // 柔嫩：归还本回合损失的力量与敏捷，然后层数 -1
    if (this.player.powers.tender) {
      const loss = this.player.tenderLoss || 0;
      if (loss) {
        this.player.powers.strength = (this.player.powers.strength || 0) + loss;
        this.player.powers.dexterity = (this.player.powers.dexterity || 0) + loss;
        this.player.tenderLoss = 0;
      }
      this.player.powers.tender--;
      if (this.player.powers.tender <= 0) delete this.player.powers.tender;
    }
    // 本回合临时敏捷回收
    if (this.player.tempDex) {
      this.player.powers.dexterity = (this.player.powers.dexterity || 0) - this.player.tempDex;
      if (this.player.powers.dexterity <= 0) delete this.player.powers.dexterity;
      this.player.tempDex = 0;
    }
    // 临时集中回收（热修复 / 集中打击 / 超能光束 / 同步）
    if (this.player.tempFocus) {
      this.player.powers.focus = (this.player.powers.focus || 0) - this.player.tempFocus;
      if (this.player.powers.focus === 0) delete this.player.powers.focus;
      this.player.tempFocus = 0;
    }
    // 融入暗影 / 墨之刃只持续本回合
    delete this.player.powers.shadowmeld;
    delete this.player.powers.inkBlade;
    // 「倒映」要覆盖紧接着的敌人回合，所以不在玩家回合结束移除，见 startPlayerTurn()
    // 敌人身上的「征服者」在其一方回合结束时递减，见 enemyTurn()

    // 虚无：回合结束时还留在手里的牌直接消耗（不分是否保留手牌）
    // 恶咒（幽灵骑士）：它活着时你的所有手牌都被视为「虚无」
    const hexed = this.hexActive();
    for (const card of [...this.hand]) {
      if (card.ethereal || hexed) await this.exhaustCard(card);
    }
    if (this.finished) return;

    // 魂缚锁链：回合结束时解除本回合的「魂缚」标记
    if (this.player.powers.chainsOfBinding) {
      this.boundCardsPlayed = 0;
      this.boundCardsDrawn = 0;
      for (const c of this.allCombatCards()) c.bound = false;
    }

    // 弃手牌（符文金字塔 / 保留手牌全保留；计划妥当按费用保留；带「保留」的单卡也留）
    const retainAll = this.run.relics.includes('RUNIC_PYRAMID') || this.player.powers.retainHand > 0;
    if (retainAll) {
      if (this.player.powers.retainHand > 0) {
        this.player.powers.retainHand--;
        if (this.player.powers.retainHand <= 0) delete this.player.powers.retainHand;
        this.logEvent('power', '「保留手牌」：本回合手牌不弃置');
      }
    } else {
      const keep = [];
      for (const c of this.hand) if (c.retain) keep.push(c);
      if (this.player.powers.wellLaidPlans) {
        const cand = [...this.hand].filter(c => c.id !== 'SHIV').sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
        keep.push(...cand.slice(0, this.player.powers.wellLaidPlans));
      }
      if (this.player.shivRetain) {
        for (const c of this.hand) if (c.id === 'SHIV' && !keep.includes(c)) keep.push(c);
      }
      // 保留关键词（含「重构」「响指」临时加上的）
      for (const c of this.hand) if (c.retain && !keep.includes(c)) keep.push(c);
      const gone = [];
      for (const card of [...this.hand]) {
        if (keep.includes(card)) continue;
        this.discardCard(card);
        gone.push(card);
      }
      this.hand = keep.filter(c => this.hand.includes(c));
      for (const c of gone) await this.triggerSly(c);
      if (this.finished) return;
    }

    this.player._carryEnergy = (this.player._carryEnergy || 0) + (this.run.relics.includes('ICE_CREAM') ? this.energy : 0);
    if (this.run.relics.includes('ART_OF_WAR') && this.attacksPlayedThisTurn === 0) this.player._carryEnergy += 1;

    // 亡灵契约师：玩家一方回合结束（弃牌/虚无之后）清理本回合能力并结算玩家侧灾厄
    if (this.necro) await this.necro.onPlayerTurnEnd();
    if (this.finished) return;

    this.emit();
    await this.wait(150);
    await this.enemyTurn();
    if (this.finished) return;
    await this.startPlayerTurn(false);
  }

  async enemyTurn() {
    // 沙坑（无厌沙虫的场地机制）：敌人一方回合开始时倒计时 -1，归零则玩家被拖入地下
    const pit = this.enemies.find(e => e.alive && e.sandpit != null);
    if (pit) {
      pit.sandpit--;
      this.emit();
      if (pit.sandpit <= 0) {
        this.msg('沙坑吞没了你');
        await this.dealDamage(this.player, 999, { ignoreBlock: true });
        return;
      }
      this.logEvent('system', `沙坑的倒计时还剩 ${pit.sandpit}`);
    }
    for (const e of this.alive()) {
      if (this.finished) return;
      if (!e.alive) continue;
      if (e.pendingStun) { e.pendingStun = false; e.moveKey = 'stun'; }
      const mv = e.def.moves[e.moveKey];
      if (!mv) continue;

      // 埋地（Burrowed）：格挡不会在敌人回合开始时清空
      const keepBlock = typeof e.def.keepBlock === 'function' ? e.def.keepBlock(e) : e.def.keepBlock;
      if (!keepBlock) e.block = 0;
      this.actingEnemy = e;
      this.emit();
      await this.wait(180);

      this.logEvent('enemy', `${e.name} 行动：${mv.name || e.moveKey}`, { move: { enemy: e.id, key: e.moveKey } });
      // 招式的完整逻辑（含攻击）都在 run 里，intent 只用于展示
      await mv.run(this, e);
      this.actingEnemy = null;

      // 敌人回合结束：中毒/覆甲/仪式/减益倒计时
      if (e.alive) {
        await this.tickPoison(e);
        if (!e.alive) { this.emit(); await this.wait(80); continue; }
        // 仪式：施加当回合的「回合结束」不计入（RitualPower._skipFirstEnemyTurnEnd）
        if (e.powers.ritual) {
          if (e.ritualSkip) e.ritualSkip--;
          else await this.enemyPower(e, 'strength', e.powers.ritual);
        }
        if (e.powers.plating) { e.block += e.powers.plating; }
        for (const k of ['vulnerable', 'weak', 'frail', 'shrink', 'tangled', 'conqueror']) {
          if (e.powers[k] != null) {
            e.powers[k]--;
            if (e.powers[k] <= 0) delete e.powers[k];
          }
        }
        e.tempStr = 0;
        // 数据层的「自己回合结束」钩子：沉睡计时、逃脱大师倒数等
        if (e.def.onTurnEnd) await e.def.onTurnEnd(this, e);
        if (!e.alive) { this.emit(); continue; }
        this.rollIntent(e);
      }
      this.emit();
      await this.wait(140);
    }
    // 亡灵契约师：敌人一方回合结束结算敌人侧灾厄、清理紧追不放 / 弱化之触
    if (this.necro && !this.finished) await this.necro.onEnemyTurnEnd();
  }

  async enemyAttack(e, base, ascValue, times = 1) {
    const b = this.asc >= 9 && ascValue != null ? ascValue : base;
    await this.enemyAttackRaw(e, b, times);
  }

  async enemyAttackRaw(e, base, times = 1) {
    // 活力（VigorPower）：整次攻击（含多段）都加上层数，攻击结束后清零
    const vigor = e.powers.vigor || 0;
    let unblockedHits = 0;
    for (let i = 0; i < times; i++) {
      if (!e.alive || this.finished) return;
      let d = base + this.str(e) + vigor;
      // 摧残：虚弱倍率 0.75 → 0.5，易伤 1.5 → 2
      if (e.powers.weak) d = Math.floor(d * (e.powers.debilitate ? 0.5 : 0.75));
      if (this.player.powers.vulnerable) d = Math.floor(d * (this.player.powers.debilitate ? 2 : 1.5));
      // 不死符文：自身灾厄层数已达生命值（即本回合末会死）的敌人，伤害减半
      if (this.run.relics.includes('UNDYING_SIGIL') && (e.powers.doom || 0) >= e.hp) d = Math.floor(d * 0.5);
      this._lastAttacker = e;
      e.acting = true;
      this.emit();
      await this.wait(140);
      const hpBefore = this.player.hp;
      await this.dealDamage(this.player, Math.max(0, d), { isAttack: true, source: e });
      if (this.player.hp < hpBefore) unblockedHits++;
      e.acting = false;
      this.emit();
      await this.wait(80);
      if (this.finished) return;
    }
    if (vigor) delete e.powers.vigor;
    // 吮吸（SuckPower）：每次造成未被格挡的伤害就叠力量
    if (e.powers.suck && unblockedHits > 0) {
      await this.addPower('strength', e.powers.suck * unblockedHits, e);
    }
  }

  rollIntent(e) {
    const def = e.def;
    if (def.checkPhase && def.checkPhase(e)) {
      def.onPhase(this, e);
      e.moveKey = 'stun';
      e.seqIndex = 0;
      return;
    }
    // ai(C, e, pick) 是数据层自定义状态机：返回下一招的 key；pick(pairs) 抽带权重的随机分支
    if (def.ai) {
      const pick = (pairs) => this.weightedPick(pairs);
      e.lastMove = e.moveKey;
      e.moveKey = def.ai(this, e, pick) || Object.keys(def.moves)[0];
      return;
    }
    let key = null;
    if (def.pattern) {
      const seq = e.seqIndex % def.pattern.length;
      key = def.pattern[seq];
      e.seqIndex++;
      if (key === 'random' && def.random) {
        const pool = def.random.filter(([k]) => k !== e.lastMove || def.random.length === 1);
        key = this.weightedPick(pool);
      }
    } else if (def.random) {
      key = this.weightedPick(def.random);
    } else if (Object.keys(def.moves).length) {
      key = Object.keys(def.moves)[0];
    }
    e.lastMove = key;
    e.moveKey = key;
  }

  weightedPick(pairs) {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let r = this.rng.next() * total;
    for (const [k, w] of pairs) { r -= w; if (r <= 0) return k; }
    return pairs[pairs.length - 1][0];
  }

  /**
   * 战斗中动态加入敌人（组装师召唤、库存补机体、产卵等）。
   * extra 会写进敌人对象（stock / bootFirst / starter 等），并参与 onSpawn。
   */
  async spawnEnemy(id, from, extra = {}) {
    const def = ENEMIES[id];
    if (!def) throw new Error('未知敌人 ' + id);
    const hpRange = (this.asc >= 8 && def.hpAsc) ? def.hpAsc : def.hp;
    const hp = hpRange[0] === hpRange[1] ? hpRange[0] : this.rng.range(hpRange[0], hpRange[1]);
    let n = this.enemies.length + 1;
    while (this.enemies.some((o) => o.uid === 'e' + n)) n++;
    const e = {
      uid: 'e' + n, id, def, name: def.name, icon: def.icon,
      hp, maxHp: hp, block: 0, powers: {}, tempStr: 0, seqIndex: 0, moveKey: null,
      alive: true, summoned: true, history: [],
      elite: !!def.elite, boss: !!def.boss, minion: !!def.minion,
      ...extra,
    };
    if (def.onSpawn) def.onSpawn(this, e);
    this.enemies.push(e);
    this.rollIntent(e);
    this.emit();
    await this.wait(200);
    return e;
  }

  /* ---------------- 第三幕的临时状态（抑制 / 魂缚 / 凋零） ---------------- */

  /** 所有牌堆里的卡（含手牌与消耗堆） */
  allCombatCards() {
    return [...this.drawPile, ...this.hand, ...this.discardPile, ...this.exhaustPile];
  }

  /** 抑制（魔法骑士）：把你所有已升级的卡降级，记下来以便它倒下后恢复 */
  async applyDampen(e) {
    if (e.dampened) return;
    e.dampened = [];
    for (const c of this.allCombatCards()) {
      if (!c.upgraded) continue;
      c.upgraded = false;
      e.dampened.push(c);
    }
    this.player.powers.dampen = (this.player.powers.dampen || 0) + 1;
    this.logEvent('power', '「抑制」：你的所有卡牌被降级');
    this.emit();
  }

  clearDampen(e) {
    if (!e.dampened) return;
    for (const c of e.dampened) c.upgraded = true;
    e.dampened = null;
    delete this.player.powers.dampen;
    this.logEvent('power', '「抑制」解除，你的卡牌恢复了升级');
    this.emit();
  }

  /** 恶咒（幽灵骑士）：它活着时你的所有手牌都拥有「虚无」 */
  hexActive() {
    if (!this.player.powers.hex) return false;
    return this.alive().some((e) => e.id === 'SPECTRAL_KNIGHT');
  }

  /* ---------------- 结束 ---------------- */
  async finish() {
    if (this.necro) this.necro.onCombatEnd();   // 禁忌魔典：追加移除牌奖励
    // 改善（打造时间的能力牌）：战斗结束时随机升级牌组里的一张牌
    if (this.player.powers.improvement && this.won) {
      const pool = this.run.deck.filter((d) => !d.upgraded);
      if (pool.length) {
        const pick = this.rng.pick(pool);
        pick.upgraded = true;
        this.logEvent('system', `「改善」：升级了 ${CARDS[pick.id]?.name || pick.id}`);
      }
    }
    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.onCombatEnd) await r.onCombatEnd(this, r);
    }
    // 愧疚：5 场战斗后自动从牌组移除（Guilty.AfterCombatEnd）
    for (const entry of this.run.deck.slice()) {
      if (entry.id !== 'GUILTY') continue;
      entry.crafts = (entry.crafts || 0) + 1;
      if (entry.crafts >= 5) {
        this.run.deck.splice(this.run.deck.indexOf(entry), 1);
        this.logEvent('system', '「愧疚」已从你的牌组中移除');
      }
    }
    // 王国资产：战斗胜利时按能力层数给金币（RoyaltiesPower.ModifyRewards）
    if (this.won && this.player.powers.royalties > 0) {
      this.run.gold += this.player.powers.royalties;
      this.logEvent('system', `「王国资产」：获得 ${this.player.powers.royalties} 金币`);
    }
  }

  float(target, text, kind) {
    this.onFloat && this.onFloat(target, text, kind);
  }
}
