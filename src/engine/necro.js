/**
 * 亡灵契约师专用子系统：奥斯提（Osty）、灾厄（Doom）、灵魂（Soul）。
 *
 * 数值与结算顺序对照 sts2-sim v0.111.0：
 *  - Commands/OstyCmd.cs        召唤：存活 → 最大/当前生命各 +N；复活或首次 → 重置为 N 并回满
 *  - Models/Powers/DieForYouPower.cs  替死：玩家格挡先吸收，未被格挡的攻击伤害转给存活的奥斯提，溢出回流玩家
 *  - Commands/Builders/AttackCommand.cs  FromOsty：只换攻击者 → 不吃玩家力量/虚弱，吃目标易伤
 *  - Models/Powers/DoomPower.cs 灾厄：当前生命 ≤ 层数时，在该方回合结束被直接杀死（无视格挡）
 *  - Models/Cards/Soul.cs       灵魂：0 费消耗技能，打出抽 2（升级 3）
 *  - Models/Relics/BoundPhylactery.cs  开战召唤 1，之后每回合开始再召唤 1（首回合不重复）
 *
 * 本模块只挂到 NECROBINDER 的战斗实例上（Combat.necro），其它角色完全不走这里的逻辑。
 */
const DOOM = 'doom';

export class NecroSystem {
  constructor(C) {
    this.C = C;
    // 奥斯提死亡后仍留在场上（可被再次召唤复活），所以用 exists / alive 两个标志
    this.osty = { exists: false, alive: false, hp: 0, maxHp: 0 };
    this.etherealPlays = 0;          // 本场战斗已打出的虚无牌数（BansheesCry / PullFromBelow）
    this.ostyAttacksThisTurn = 0;    // 本回合奥斯提完成的攻击次数（Rattle / Flatten）
    this.doomAppliedThisTurn = 0;    // 本回合是否由玩家施加过灾厄（DeathsDoor）
    this.nonHandDrawsThisTurn = 0;   // 回合抽牌阶段以外抽到的牌（DeathMarch）
    this.deathsThisCombat = 0;       // 真实死亡数（Melancholy 降费）
    this.lastAttackTotals = [];      // 上一次 attack() 的逐目标总伤害（BlightStrike / ReaperForm）
    this.grimoireRemovals = 0;       // 禁忌魔典：战斗结束后可移除牌的次数
  }

  /* ================= 奥斯提 ================= */

  get ostyAlive() { return this.osty.exists && this.osty.alive && this.osty.hp > 0; }
  get ostyMissing() { return !this.ostyAlive; }

  /** 对应 OstyCmd.Summon：存活则 +N 最大/当前生命，否则把生命重置为 N */
  async summon(amount) {
    const C = this.C;
    if (this.finishedGuard()) return 0;
    const n = Math.max(0, Math.floor(amount));
    if (n === 0) return 0;                    // ModifySummonAmount 归零 → 整次召唤无效
    const o = this.osty;
    const revived = o.exists && !o.alive;
    if (this.ostyAlive) {
      o.maxHp += n;
      o.hp += n;
    } else {
      o.exists = true;
      o.alive = true;
      o.maxHp = n;                          // 复活是「重置」而非累加历史召唤量
      o.hp = n;
    }
    C.float({ isOsty: true }, `+${n} 召唤`, 'heal');
    C.logEvent('power', `${revived ? '复活' : '召唤'}奥斯提：${o.hp}/${o.maxHp} 生命`);
    C.emit();
    await C.wait(60);
    return n;
  }

  /** 奥斯提失去生命；返回实际承受量（溢出由调用方回流玩家） */
  async damageOsty(n) {
    const C = this.C;
    if (!this.ostyAlive || n <= 0) return 0;
    const lost = Math.min(n, this.osty.hp);
    this.osty.hp -= lost;
    C.float({ isOsty: true }, '-' + lost, 'dmg');
    C.logEvent('damage', `奥斯提 受到 ${lost} 伤害`);
    // 亡灵精通：奥斯失去多少血，所有敌人失去多少血（无视格挡）
    const p = C.player.powers.necroMastery || 0;
    if (p > 0) {
      for (const e of C.alive()) await C.dealDamage(e, lost * p, { ignoreBlock: true });
    }
    if (this.osty.hp <= 0) {
      this.osty.hp = 0;
      this.osty.alive = false;
      C.logEvent('death', '奥斯提 倒下了（可被再次召唤复活）');
    }
    C.emit();
    await C.wait(80);
    return lost;
  }

  async healOsty(n) {
    const C = this.C;
    if (!this.ostyAlive || n <= 0) return;
    const before = this.osty.hp;
    this.osty.hp = Math.min(this.osty.maxHp, this.osty.hp + n);
    if (this.osty.hp > before) C.float({ isOsty: true }, '+' + (this.osty.hp - before), 'heal');
    C.emit();
  }

  /** 直接杀死奥斯提（骨片 / 牺牲），不触发亡灵精通 */
  async killOsty() {
    const C = this.C;
    if (!this.ostyAlive) return 0;
    const hp = this.osty.hp;
    this.osty.hp = 0;
    this.osty.alive = false;
    C.logEvent('death', '奥斯提 死去');
    C.emit();
    await C.wait(80);
    return hp;
  }

  /* ================= 灾厄 ================= */

  async addDoom(amount, target = null) {
    const C = this.C;
    if (!target || !target.alive || amount <= 0) return;
    await C.addPower(DOOM, amount, target);
  }

  /** 立即结算一批目标的灾厄判定（末日降临 / 回合结束） */
  async doomKill(list) {
    const C = this.C;
    const doomed = [...new Set(list)].filter(t => t && t.alive && (t.powers?.[DOOM] || 0) >= t.hp && t.hp > 0);
    if (!doomed.length) return [];
    let healed = 0;
    for (const t of doomed) {
      if (t.isPlayer) {
        C.logEvent('death', '你因灾厄而死去');
        await C.dealDamage(t, t.hp, { ignoreBlock: true });
        if (C.finished) break;
      } else {
        C.logEvent('death', `${t.name} 因灾厄而死去`);
        await C.dealDamage(t, t.hp, { ignoreBlock: true });
        healed++;
      }
    }
    // 修书小刀：每个死于灾厄的敌人回复 3 点生命（源码常量 3）
    if (healed > 0 && C.run.relics.includes('BOOK_REPAIR_KNIFE')) C.healPlayer(3 * healed);
    return doomed;
  }

  /* ================= 灵魂 / 衍生牌 ================= */

  /** pile: 'draw'（随机插入）/ 'hand' / 'discard' */
  async addSoul(count, pile = 'draw', upgraded = false) {
    const C = this.C;
    for (let i = 0; i < count; i++) {
      const soul = C.makeCard('SOUL', upgraded);
      if (pile === 'hand') C.addCardToHand(soul);
      else if (pile === 'discard') C.discardPile.push(soul);
      else C.drawPile.splice(C.rng.range(0, C.drawPile.length), 0, soul);
    }
    C.emit();
    await C.wait(40);
  }

  countSouls() {
    return this.C.exhaustPile.filter(c => c.id === 'SOUL').length;
  }

  countOstyAttackCards() {
    const C = this.C;
    const piles = [C.hand, C.drawPile, C.discardPile, C.exhaustPile, C.powerPile];
    return piles.reduce((n, p) => n + p.filter(c => (c.tags || []).includes('osty') && c.id !== 'SQUEEZE').length, 0);
  }

  /** 从抽牌堆取走一张牌（选牌效果用） */
  takeFromDraw(card) {
    const i = this.C.drawPile.indexOf(card);
    if (i >= 0) this.C.drawPile.splice(i, 1);
  }

  /** 把抽牌堆中的一张牌原位变成「灵魂」（降灵） */
  transformToSoul(card) {
    const C = this.C;
    const i = C.drawPile.indexOf(card);
    if (i < 0) return;
    C.drawPile[i] = C.makeCard('SOUL');
    C.emit();
  }

  /** 弱化之触：本回合临时减力，目标所在方回合结束时归还 */
  addTempStrength(target, amount) {
    if (!target?.alive) return;
    this._tempStrength = this._tempStrength || [];
    this._tempStrength.push([target, amount]);
  }

  /** 从当前角色卡池取一张随机可生成牌（排除基础/先古/衍生/状态），实现在 Combat.randomCardIdAny() */
  randomCardId() { return this.C.randomCardIdAny(); }

  /** 生成一张带「虚无」的随机牌到手牌（虚空之唤 / 大帽子） */
  async generateEthereal(count, pile = 'hand') {
    const C = this.C;
    for (let i = 0; i < count; i++) {
      const id = this.randomCardId();
      if (!id) continue;
      const card = C.makeCard(id);
      card.ethereal = true;
      if (pile === 'hand') C.addCardToHand(card);
      else C.discardPile.push(card);
    }
    C.emit();
  }

  /* ================= 战斗流程钩子 ================= */

  finishedGuard() { return this.C.finished; }

  /** 回合开始：倒计时 / 精神过载 / 下回合召唤 / 哨卫模式 / 虚空之唤 / 大帽子 / 葬礼面具 */
  async onTurnStart(turn) {
    const C = this.C;
    const p = C.player.powers;
    this.ostyAttacksThisTurn = 0;
    this.doomAppliedThisTurn = 0;
    this.nonHandDrawsThisTurn = 0;
    if (p.countdown > 0) {
      const alive = C.alive();
      if (alive.length) await this.addDoom(p.countdown, C.rng.pick(alive));
    }
    if (p.neurosurge > 0) await this.addDoom(p.neurosurge, C.player);
    if (p.summonNextTurn > 0) {
      await this.summon(p.summonNextTurn);
      delete p.summonNextTurn;
    }
    if (p.sentryMode > 0) {
      for (let i = 0; i < p.sentryMode; i++) await C.addCard('SWEEPING_GAZE', 'hand');
    }
    if (p.callOfTheVoid > 0) await this.generateEthereal(p.callOfTheVoid);
    if (turn === 1) {
      if (C.run.relics.includes('BIG_HAT')) await this.generateEthereal(2);
      if (C.run.relics.includes('FUNERARY_MASK')) await this.addSoul(3, 'draw');
    }
  }

  /** 回合抽牌前：领域多抽、哨卫凝视、虚空之唤已在 onTurnStart 处理 */
  beforeHandDraw(drawCount) {
    return drawCount + (this.C.player.powers.demesne || 0);
  }

  modifyMaxEnergy(n) {
    const p = this.C.player.powers;
    return n + (p.demesne || 0) + (p.friendship || 0);
  }

  /** 卡牌费用修正（在 costOf 末尾调用） */
  modifyCost(card, c) {
    const C = this.C;
    const p = C.player.powers;
    if (p.borrowedTime) c += p.borrowedTime;                       // 预借时间：本回合牌费 +1
    if (card.id === 'BANSHEES_CRY') c -= 2 * this.etherealPlays;    // 女妖之嚎：每张已打出的虚无牌 -2
    if (card.id === 'FLATTEN' && this.ostyAttacksThisTurn > 0) c = 0;
    if (p.veilpiercer > 0 && card.ethereal) c = 0;                 // 刺破帷幕：下一张虚无牌 0 费
    // 注意：card.costPenalty（忧郁/重构/书签）已由 makeCard 的 cost getter 计入
    return Math.max(0, c);
  }

  /** 伤害修正（calcPlayerAttack 末尾调用） */
  modifyDamage(d, target, opts) {
    const C = this.C;
    const p = C.player.powers;
    const card = C.currentCard;
    if (opts.osty && p.calcify) d += p.calcify;                     // 钙化：只加给奥斯提的有力攻击
    if (card && card.id === 'HANG' && target?.powers?.hang) d *= target.powers.hang;
    // 致死性：本回合第一张攻击牌（看打牌计数，FromOsty 仍是卡牌来源）
    if (card && card.type === 'attack' && C.attacksPlayedThisTurn <= 1 && p.lethality) {
      d = Math.floor(d * (1 + p.lethality / 100));
    }
    // 摧残：易伤 1.5→2、虚弱 0.75→0.5
    const deb = (target?.powers?.debilitate || 0) > 0 || (p.debilitate || 0) > 0;
    if (deb && target?.powers?.vulnerable && !opts.osty) d = Math.floor(d * (2 / 1.5));
    return Math.max(0, Math.floor(d));
  }

  /** 打出牌之前：死亡之舞 / 灰烬之灵 / 刺破帷幕消耗层数 / 湮灭快照 */
  async beforeCardPlayed(card, cost) {
    const C = this.C;
    const p = C.player.powers;
    if (p.danseMacabre && cost >= 2) await C.block(p.danseMacabre, { raw: true });
    if (p.spiritOfAsh && card.ethereal) await C.block(p.spiritOfAsh, { raw: true });
    if (p.veilpiercer > 0 && card.ethereal) {
      p.veilpiercer--;
      if (p.veilpiercer <= 0) delete p.veilpiercer;
    }
    // 湮灭：记下打出开始时的层数（打出完毕后按快照施加灾厄）
    this._oblivionSnapshot = C.alive().map(e => [e, e.powers.oblivion || 0]).filter(([, n]) => n > 0);
  }

  /** 打出牌之后：虚无计数 / 灵魂 / 湮灭 / 象牙麻将牌 / 得力助手回手 */
  async afterCardPlayed(card, cost) {
    const C = this.C;
    const p = C.player.powers;
    if (card.ethereal) this.etherealPlays++;
    if (card.id === 'SOUL') {
      if (p.devourLife) await this.summon(p.devourLife);
      if (p.haunt) {
        const alive = C.alive();
        if (alive.length) await C.dealDamage(C.rng.pick(alive), p.haunt, { ignoreBlock: true });
      }
    }
    if (card.id !== 'OBLIVION') {
      for (const [e, n] of (this._oblivionSnapshot || [])) {
        if (e.alive) await this.addDoom(n, e);
      }
    }
    this._oblivionSnapshot = null;
    if (cost >= 3 && C.run.relics.includes('IVORY_TILE')) C.gainEnergy(1);
  }

  /** 牌已进入结果牌堆之后：得力助手从弃牌堆回手 */
  async afterCardPlayedLate(card, cost) {
    const C = this.C;
    if (cost < 2 || card.id === 'RIGHT_HAND_HAND') return;
    for (const c of [...C.discardPile]) {
      if (c.id !== 'RIGHT_HAND_HAND') continue;
      C.discardPile.splice(C.discardPile.indexOf(c), 1);
      C.addCardToHand(c);
    }
  }

  /** 抽到一张牌时返回「额外抽牌数」，并累计非回合抽牌 */
  cardDrawn(card, opts) {
    const C = this.C;
    if (!opts.silent) this.nonHandDrawsThisTurn++;
    let extra = 0;
    if (card.ethereal && C.player.powers.pagestorm) extra += C.player.powers.pagestorm;
    return extra;
  }

  /** 状态层数变化后：厄运之衣 / 血肉戏法 / 灾厄施加记录 */
  async afterPowerChanged(id, amount, target) {
    const C = this.C;
    const p = C.player.powers;
    if (id === DOOM && amount > 0) {
      this.doomAppliedThisTurn++;
      if (p.shroud) await C.block(p.shroud, { raw: true });
    }
    // 血肉戏法：给敌人施加负面状态时造成层数点伤害（灾厄/虚弱/易伤等）
    if (amount !== 0 && target && !target.isPlayer && POWERS_DEBUFFS.has(id) && p.sleightOfFlesh) {
      await C.dealDamage(target, p.sleightOfFlesh, { ignoreBlock: true });
    }
  }

  /** 一次 attack() 结算完毕：记录奥斯提攻击、死神形态、紧追不放、骨笛 */
  async afterAttack(opts, totals) {
    const C = this.C;
    this.lastAttackTotals = totals;
    if (opts.osty) {
      this.ostyAttacksThisTurn++;
      if (C.run.relics.includes('BONE_FLUTE')) await C.block(2, { raw: true });
    }
    for (const { target, amount } of totals) {
      if (!target?.alive || amount <= 0) continue;
      if (C.player.powers.reaperForm) await this.addDoom(amount, target);
      if (opts.osty && target.powers.sicEm) await this.summon(target.powers.sicEm);
    }
  }

  /** 有生物死亡（真实死亡） */
  onDeath(creature) {
    const C = this.C;
    this.deathsThisCombat++;
    // 忧郁：本场战斗每次真实死亡，这张牌费用 -1
    for (const pile of [C.hand, C.drawPile, C.discardPile, C.exhaustPile, C.powerPile]) {
      for (const c of pile) {
        if (c.id === 'MELANCHOLY') c.costPenalty = (c.costPenalty || 0) - 1;
      }
    }
  }

  /** 玩家回合结束（弃牌/虚无之后）：移除本回合能力、书签、玩家侧灾厄结算 */
  async onPlayerTurnEnd() {
    const C = this.C;
    const p = C.player.powers;
    delete p.borrowedTime;
    delete p.sicEm;
    for (const e of C.alive()) delete e.powers.oblivion;
    // 书签：随机一张被保留的牌，在打出前费用 -1
    if (C.run.relics.includes('BOOKMARK') && C.hand.length) {
      const cand = C.hand.filter(c => typeof c.cost === 'number' && c.cost > 0);
      if (cand.length) {
        const c = C.rng.pick(cand);
        c.costPenalty = (c.costPenalty || 0) - 1;
      }
    }
    await this.doomKill([C.player]);
  }

  /** 敌人回合结束：敌人侧灾厄结算 + 摧残递减 */
  async onEnemyTurnEnd() {
    const C = this.C;
    await this.doomKill(C.alive());
    for (const e of C.alive()) {
      delete e.powers.sicEm;
      if (e.powers.debilitate) {
        e.powers.debilitate--;
        if (e.powers.debilitate <= 0) delete e.powers.debilitate;
      }
    }
    if (C.player.powers.debilitate) {
      C.player.powers.debilitate--;
      if (C.player.powers.debilitate <= 0) delete C.player.powers.debilitate;
    }
    // 弱化之触：归还目标的临时力量
    for (const [t, n] of (this._tempStrength || [])) {
      if (t.alive) await C.addPower('strength', n, t);
    }
    this._tempStrength = [];
  }

  /** 战斗结束：禁忌魔典给一次移除牌奖励 */
  onCombatEnd() {
    const p = this.C.player.powers;
    if (p.forbiddenGrimoire) this.grimoireRemovals += p.forbiddenGrimoire;
  }
}

/** 会被「血肉戏法」视为负面状态的 power（不含临时能力） */
const POWERS_DEBUFFS = new Set([
  DOOM, 'weak', 'vulnerable', 'frail', 'poison', 'shrink', 'tangled', 'constrict',
  'hex', 'ringing', 'debilitate', 'hang', 'oblivion', 'sicEm', 'neurosurge',
]);
