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

    const ascBane = this.asc >= 5;
    this.player = {
      isPlayer: true, alive: true, name: run.character || '铁甲战士', icon: run.avatar || '🗡️',
      hp: run.hp, maxHp: run.maxHp, block: 0, powers: {}, tempStr: 0,
      vigor: 0, penNib: 0, attackCounter: 0,
      orbs: [], tempFocus: 0,
    };
    // 充能球栏位（故障机器人 3 个，其它角色 0 个，第一次生成时补 1 个）
    this.maxOrbSlots = run.orbSlots || 0;
    this.orbsChanneled = {};

    this.drawPile = this.rng.shuffle(run.deck.map((c) => {
      const card = newCard(c.id, c.upgraded);
      card.deckUid = c.uid;      // 让「遗传算法」这类牌能把成长写回牌组条目
      card.persist = c;
      return card;
    }));
    // 固有：开局必定在起手牌里 —— 放到抽牌堆顶部（pop 出来的最后一张）
    const innate = this.drawPile.filter(c => c.def.innate || (c.upgraded && c.def.innateOnUpgrade));
    if (innate.length) {
      this.drawPile = this.drawPile.filter(c => !innate.includes(c)).concat(innate);
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
      this.enemies.push(e);
      return e;
    };

    let units = [];
    for (const group of this.enc.units) {
      for (const u of group) {
        if (u === 'randomRaiders') {
          const pool = ['AXE_RUBY_RAIDER', 'ASSASSIN_RUBY_RAIDER', 'BRUTE_RUBY_RAIDER', 'CROSSBOW_RUBY_RAIDER', 'TRACKER_RUBY_RAIDER'];
          const picked = this.rng.pickMany(pool, this.enc.count || 3);
          units.push(...picked);
        } else units.push(u);
      }
    }

    units.forEach((id, i) => {
      if (id === 'THE_KIN') {
        spawn('KIN_FOLLOWER', { startsWithDance: true });
        spawn('KIN_FOLLOWER');
        spawn('KIN_PRIEST');
        return;
      }
      const e = spawn(id);
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
    this.skillsPlayedThisTurn = 0;
    this.cardsDrawnThisTurn = 0;
    this.discardedThisTurn = 0;
    this.powersPlayedThisTurn = 0;
    this.energySpentThisTurn = 0;
    this.statusCardsDrawnThisTurn = 0;
    this.zeroCostAttacksPlayed = 0;
    // 回响形态：每回合重新发放 N 次「额外打出一次」
    this.player.echoFormUses = this.player.powers.echoForm || 0;
    this.player.attackCounter = 0;
    this.player.phantomReady = !!this.player.powers.phantomBlades;

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
    this.energy = (this.player._carryEnergy || 0) + this.maxEnergy + (this.player.powers.pyre || 0);
    this.player._carryEnergy = 0;

    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.onTurnStart) await r.onTurnStart(this, this.turn);
    }

    /* ---- 能量重置之后、抽牌之前的触发（与原作 AfterEnergyReset 对齐） ---- */
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

    // 抽牌（准备背包只在首回合生效，异蛇之眼每回合生效）
    let drawCount = 5 + this.extraDrawPerTurn + (first ? this.firstTurnDraw : 0)
      + (this.player.powers.drawNextTurn || 0) + (this.player.powers.machineLearning || 0);
    if (this.necro) drawCount = this.necro.beforeHandDraw(drawCount);  // 领域：每回合多抽 1
    delete this.player.powers.drawNextTurn;
    await this.draw(drawCount, { silent: true });
    if (this.player.powers.toolsOfTheTrade) { await this.draw(1); await this.discardCards(1); }

    this.player.tempStr = 0;
    this.emit();
    await this.wait(120);
  }

  /* ---------------- 抓牌/弃牌 ---------------- */
  async draw(n, opts = {}) {
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
      }
      const card = this.drawPile.pop();
      if (this.confusion) card.confusedCost = this.rng.int(4);
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
          const bonus = 1.5 + ((this.player.powers.cruelty || 0) / 100);
          d = Math.floor(d * bonus);
        }
        if (target.powers.intangible) d = 1;
        // 跟踪：对虚弱敌人伤害翻倍
        if (this.player.powers.tracking && target.powers.weak) d *= 2;
      }
      // 暗影步：本回合攻击翻倍
      if (this.player.powers.shadowStep) d *= 2;
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
    if (target.block > 0 && !opts.ignoreBlock) {
      absorbed = Math.min(target.block, remain);
      target.block -= absorbed;
      remain -= absorbed;
      if (absorbed > 0) this.float(target, '-' + absorbed, 'block');
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
    e.alive = false;
    e.hp = 0;
    this.msg(`${e.name} 被击败`);
    if (e.powers.sporeCloud) await this.addPower('vulnerable', e.powers.sporeCloud);
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

  /* ---------------- 格挡/能力 ---------------- */
  async block(amount, opts = {}) {
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

  /* ---------------- 玩家动作 ---------------- */
  canPlay(card) {
    if (this.finished) return false;
    if (card.unplayable) return false;
    const def = CARDS[card.id];
    if (def.canPlay && !def.canPlay(this, card)) return false;
    const cost = this.costOf(card);
    if (typeof cost === 'number' && cost > this.energy) return false;
    if (this.player.powers.ringing === 0) return false;
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
    const def = CARDS[card.id];
    if (def.costMod) c += def.costMod(card, this);
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
    const cost = this.costOf(card);
    const isX = typeof card.cost !== 'number';
    const xValue = isX ? this.energy : 0;
    this.energy -= isX ? this.energy : cost;
    this.energySpentThisTurn += isX ? xValue : cost;
    this.hand.splice(idx, 1);
    this.currentCard = card;
    this.xValue = xValue;
    this._target = targetEnemy || this.alive()[0];
    this.cardsPlayedThisTurn++;
    if (card.type === 'skill') this.skillsPlayedThisTurn++;
    if (card.type === 'power') this.powersPlayedThisTurn++;

    const aimed = card.def.target === 'enemy' && this._target && this._target.alive ? ` → ${this._target.name}` : '';
    const costText = isX ? `X=${xValue}` : cost > 0 ? `${cost} 能量` : '免费';
    this.logEvent('play', `打出「${card.name}」（${costText}）${aimed}`, { card: card.id });

    this.emit();
    await this.wait(60);

    // 亡灵契约师：打出前的能力（死亡之舞 / 灰烬之灵 / 刺破帷幕 / 湮灭快照）
    if (this.necro) await this.necro.beforeCardPlayed(card, isX ? xValue : cost);

    // 连环拳 / 下次攻击免费 / 爆发 / 回响形态 / 信号增强 / 重构（重放）
    let replay = 1 + (card.replayBonus || 0);
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

    // 亡灵契约师：虚无计数 / 灵魂 / 湮灭 / 象牙麻将牌
    if (this.necro) await this.necro.afterCardPlayed(card, isX ? xValue : cost);

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

  addCardToHand(card) {
    if (this.hand.length < 10) this.hand.push(card);
    else this.discardPile.push(card);
    this.emit();
  }

  async addCard(id, pile = 'discard', upgraded = false, times = 1) {
    const out = [];
    for (let i = 0; i < times; i++) {
      const c = newCard(id, upgraded);
      c.freeThisTurn = true;
      if (pile === 'hand') this.addCardToHand(c);
      else if (pile === 'draw') this.drawPile.push(c);
      else this.discardPile.push(c);
      out.push(c);
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
      .filter(d => d && d.type === type && !['status', 'curse', 'basic', 'token'].includes(d.rarity))
      .filter(d => !d.char || d.char === 'NEUTRAL' || d.char === this.run.charId)
      .map(d => d.id);
    if (!ids.length) return null;
    return newCard(this.rng.pick(ids));
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

  gainEnergy(n) {
    this.energy += n;
    this.emit();
    this.energyGained = true;
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

    // 虚无：回合结束时还留在手里的牌直接消耗（不分是否保留手牌）
    for (const card of [...this.hand]) {
      if (card.ethereal) await this.exhaustCard(card);
    }
    if (this.finished) return;

    // 弃手牌（符文金字塔全保留；计划妥当按费用保留；幻影之刃让小刀保留）
    if (!this.run.relics.includes('RUNIC_PYRAMID')) {
      const keep = [];
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
    for (const e of this.alive()) {
      if (this.finished) return;
      if (!e.alive) continue;
      if (e.pendingStun) { e.pendingStun = false; e.moveKey = 'stun'; }
      const mv = e.def.moves[e.moveKey];
      if (!mv) continue;

      e.block = 0;
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
        if (e.powers.ritual) await this.enemyPower(e, 'strength', e.powers.ritual);
        if (e.powers.plating) { e.block += e.powers.plating; }
        for (const k of ['vulnerable', 'weak', 'frail', 'shrink', 'tangled']) {
          if (e.powers[k] != null) {
            e.powers[k]--;
            if (e.powers[k] <= 0) delete e.powers[k];
          }
        }
        e.tempStr = 0;
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
    for (let i = 0; i < times; i++) {
      if (!e.alive || this.finished) return;
      let d = base + this.str(e);
      // 摧残：虚弱倍率 0.75 → 0.5，易伤 1.5 → 2
      if (e.powers.weak) d = Math.floor(d * (e.powers.debilitate ? 0.5 : 0.75));
      if (this.player.powers.vulnerable) d = Math.floor(d * (this.player.powers.debilitate ? 2 : 1.5));
      // 不死符文：自身灾厄层数已达生命值（即本回合末会死）的敌人，伤害减半
      if (this.run.relics.includes('UNDYING_SIGIL') && (e.powers.doom || 0) >= e.hp) d = Math.floor(d * 0.5);
      this._lastAttacker = e;
      e.acting = true;
      this.emit();
      await this.wait(140);
      await this.dealDamage(this.player, Math.max(0, d), { isAttack: true, source: e });
      e.acting = false;
      this.emit();
      await this.wait(80);
      if (this.finished) return;
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

  async spawnEnemy(id, from) {
    const def = ENEMIES[id];
    const hp = def.hp[0] === def.hp[1] ? def.hp[0] : this.rng.range(def.hp[0], def.hp[1]);
    const e = {
      uid: 'e' + (this.enemies.length + 1), id, def, name: def.name, icon: def.icon,
      hp, maxHp: hp, block: 0, powers: {}, tempStr: 0, seqIndex: 0, moveKey: null,
      alive: true, summoned: true, history: [],
    };
    this.enemies.push(e);
    this.rollIntent(e);
    this.emit();
    await this.wait(200);
  }

  /* ---------------- 结束 ---------------- */
  async finish() {
    if (this.necro) this.necro.onCombatEnd();   // 禁忌魔典：追加移除牌奖励
    for (const rid of this.run.relics) {
      const r = RELICS[rid];
      if (r?.onCombatEnd) await r.onCombatEnd(this, r);
    }
  }

  float(target, text, kind) {
    this.onFloat && this.onFloat(target, text, kind);
  }
}
