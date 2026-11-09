/**
 * 第二幕「巢穴」（Hive）敌人数据
 *
 * 数值 / 招式 / 状态机取自 sts2-sim：
 *   Content/Acts/HiveEncounters.BatchA.cs / BatchB.cs（遭遇编组与 slot）
 *   Models/Monsters/*.cs（血量、伤害、招式顺序、条件分支）
 * 中文名与招式名取自官方 zhs 本地化 localization/zhs/monsters.json。
 *
 * 进阶：ToughEnemies（进阶 8）改血量，DeadlyEnemies（进阶 9）改伤害 ——
 * 与第一幕一样用 hp / hpAsc、enemyAttack(e, base, ascValue) 表达。
 *
 * 少数机制做了等效实现，条目里用 note 说明。
 */

export const HIVE_ENEMIES = {
  /* ================= 盛碗虫 ================= */
  BOWLBUG_ROCK: {
    name: '盛碗虫（石）', icon: '🪨', hp: [45, 48], hpAsc: [46, 49],
    onSpawn: (C, e) => { e.powers.imbalanced = 1; e.offBalance = false; },
    moves: {
      headbutt: {
        name: '头槌', intent: { type: 'attack', dmg: 15, dmgAsc: 16 },
        run: async (C, e) => {
          await C.enemyAttack(e, 15, 16);
          if (e.offBalance) { e.offBalance = false; e.dizzyNext = true; C.emit(); }
        },
      },
      dizzy: { name: '眩晕', intent: { type: 'stun' }, run: async (C, e) => { e.dizzyNext = false; } },
    },
    // 失衡：攻击被完全格挡 → 失衡，下一次头槌后眩晕一回合
    onDamaged: async (C, e, info) => { if (info.isAttack && info.fullyBlocked) e.offBalance = true; },
    ai: (C, e) => (e.dizzyNext ? 'dizzy' : 'headbutt'),
  },
  BOWLBUG_EGG: {
    name: '盛碗虫（卵）', icon: '🥚', hp: [21, 22], hpAsc: [23, 24],
    moves: {
      bite: {
        name: '啃咬', intent: { type: 'attack', dmg: 7, dmgAsc: 8 },
        run: async (C, e) => { await C.enemyAttack(e, 7, 8); await C.enemyBlock(e, C.asc >= 9 ? 8 : 7); },
      },
    },
    ai: () => 'bite',
  },
  BOWLBUG_SILK: {
    name: '盛碗虫（丝）', icon: '🕸️', hp: [40, 43], hpAsc: [41, 44],
    moves: {
      web: { name: '吐网', intent: { type: 'debuff' }, run: async (C, e) => { await C.addPower('weak', 1); } },
      thrash: {
        name: '撕扯', intent: { type: 'attack', dmg: 4, dmgAsc: 5, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 4, 5, 2); },
      },
    },
    ai: (C, e) => { const s = e.step || 0; e.step = s + 1; return s % 2 === 0 ? 'web' : 'thrash'; },
  },
  BOWLBUG_NECTAR: {
    name: '盛碗虫（蜜）', icon: '🍯', hp: [35, 38], hpAsc: [36, 39],
    moves: {
      thrash: { name: '撕扯', intent: { type: 'attack', dmg: 3 }, run: async (C, e) => { await C.enemyAttack(e, 3, 3); } },
      buff: { name: '强化', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 15, 16); } },
    },
    // 撕扯 → 强化 → 撕扯 → 撕扯 → …
    ai: (C, e) => {
      const s = e.step || 0;
      e.step = s + 1;
      if (s === 0) return 'thrash';
      if (s === 1) return 'buff';
      return 'thrash';
    },
  },

  /* ================= 啃咬机 ================= */
  CHOMPER: {
    name: '啃咬机', icon: '🦷', hp: [60, 64], hpAsc: [63, 67],
    onSpawn: (C, e) => { e.powers.artifact = 2; },
    moves: {
      clamp: {
        name: '猛夹', intent: { type: 'attack', dmg: 8, dmgAsc: 9, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 8, 9, 2); },
      },
      screech: {
        name: '尖锐鸣叫', intent: { type: 'status' },
        run: async (C, e) => { await C.addCard('DAZED', 'discard', false, 3); },
      },
    },
    // 猛夹 ↔ 尖锐鸣叫 交替；第二只（screamFirst）从鸣叫起手
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return e.screamFirst ? 'screech' : 'clamp'; }
      return e.moveKey === 'clamp' ? 'screech' : 'clamp';
    },
  },

  /* ================= 外骨骼虫 ================= */
  EXOSKELETON: {
    name: '外骨骼虫', icon: '🦂', hp: [24, 28], hpAsc: [26, 30],
    onSpawn: (C, e) => { e.powers.hardToKill = 9; },
    // 难以杀灭：单次受到的伤害不超过 9
    damageCap: () => 9,
    moves: {
      skitter: {
        name: '忙乱', intent: { type: 'attack', dmg: 1, times: 3, timesAsc: 4 },
        run: async (C, e) => { await C.enemyAttack(e, 1, 1, C.asc >= 9 ? 4 : 3); },
      },
      mandibles: {
        name: '啃食', intent: { type: 'attack', dmg: 8, dmgAsc: 9 },
        run: async (C, e) => { await C.enemyAttack(e, 8, 9); },
      },
      enrage: { name: '激怒', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2); } },
    },
    ai: (C, e, pick) => {
      if (!e.acted) {
        e.acted = true;
        if (e.slot === 'first') return 'skitter';
        if (e.slot === 'second') return 'mandibles';
        if (e.slot === 'third') return 'enrage';
        return pick([['skitter', 1], ['mandibles', 1]]);
      }
      const last = e.moveKey;
      // 忙乱与啃食都不能连续重复，所以忙乱之后只能啃食
      if (last === 'skitter') return 'mandibles';
      if (last === 'mandibles') return 'enrage';
      return pick([['skitter', 1], ['mandibles', 1]]);
    },
  },

  /* ================= 猎人杀手 ================= */
  HUNTER_KILLER: {
    name: '猎人杀手', icon: '🕷️', hp: [121, 121], hpAsc: [126, 126],
    moves: {
      goop: { name: '嫩化黏液', intent: { type: 'debuff' }, run: async (C, e) => { await C.addPower('tender', 1); } },
      bite: { name: '啃咬', intent: { type: 'attack', dmg: 17, dmgAsc: 19 }, run: async (C, e) => { await C.enemyAttack(e, 17, 19); } },
      puncture: {
        name: '刺穿', intent: { type: 'attack', dmg: 7, dmgAsc: 8, times: 3 },
        run: async (C, e) => { await C.enemyAttack(e, 7, 8, 3); },
      },
    },
    // 嫩化黏液 → 随机（啃咬不可连续，刺穿权重 2）→ …
    ai: (C, e, pick) => {
      if (!e.acted) { e.acted = true; return 'goop'; }
      const pairs = e.moveKey === 'bite' ? [['puncture', 1]] : [['bite', 1], ['puncture', 2]];
      return pick(pairs);
    },
  },

  /* ================= 虱虫之祖 ================= */
  LOUSE_PROGENITOR: {
    name: '虱虫之祖', icon: '🪳', hp: [134, 136], hpAsc: [138, 141],
    onSpawn: (C, e) => { e.powers.curlUp = C.asc >= 8 ? 18 : 14; },
    moves: {
      web: {
        name: '吐网炮', intent: { type: 'attack', dmg: 9, dmgAsc: 10 },
        run: async (C, e) => { await C.enemyAttack(e, 9, 10); await C.addPower('frail', 2); },
      },
      curl: {
        name: '蜷身成长', intent: { type: 'defend', block: 14, blockAsc: 18 },
        run: async (C, e) => {
          await C.enemyBlock(e, C.asc >= 8 ? 18 : 14);
          await C.enemyPower(e, 'strength', 5, 7);
        },
      },
      pounce: { name: '扑击', intent: { type: 'attack', dmg: 14, dmgAsc: 16 }, run: async (C, e) => { await C.enemyAttack(e, 14, 16); } },
    },
    ai: (C, e) => {
      const s = e.step || 0;
      e.step = s + 1;
      return ['web', 'curl', 'pounce'][s % 3];
    },
  },

  /* ================= 异螨 ================= */
  MYTE: {
    name: '异螨', icon: '🦟', hp: [61, 67], hpAsc: [64, 69],
    moves: {
      toxic: { name: '浓毒', intent: { type: 'status' }, run: async (C, e) => { await C.addCard('TOXIC', 'hand', false, 2); } },
      bite: { name: '啃咬', intent: { type: 'attack', dmg: 13, dmgAsc: 15 }, run: async (C, e) => { await C.enemyAttack(e, 13, 15); } },
      suck: {
        name: '吸吮', intent: { type: 'attack', dmg: 4, dmgAsc: 6 },
        run: async (C, e) => { await C.enemyAttack(e, 4, 6); await C.enemyPower(e, 'strength', 2, 3); },
      },
    },
    // 第二只从「吸吮」起手，之后 浓毒 → 啃咬 → 吸吮 循环
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return e.slot === 'second' ? 'suck' : 'toxic'; }
      const next = { toxic: 'bite', bite: 'suck', suck: 'toxic' };
      return next[e.moveKey] || 'toxic';
    },
  },

  /* ================= 直飞产卵虫 ================= */
  OVICOPTER: {
    name: '直飞产卵虫', icon: '🦋', hp: [124, 130], hpAsc: [126, 132],
    moves: {
      lay: {
        name: '产卵', intent: { type: 'buff' },
        run: async (C, e) => {
          // 场上存活敌人 ≤3 时下 3 颗蛋
          const alive = C.alive().length;
          if (alive > 3) return;
          for (let i = 0; i < 3; i++) await C.spawnEnemy('TOUGH_EGG', e);
        },
      },
      smash: { name: '猛砸', intent: { type: 'attack', dmg: 16, dmgAsc: 17 }, run: async (C, e) => { await C.enemyAttack(e, 16, 17); } },
      tenderizer: {
        name: '嫩化', intent: { type: 'attack', dmg: 7, dmgAsc: 8 },
        run: async (C, e) => { await C.enemyAttack(e, 7, 8); await C.addPower('vulnerable', 2); },
      },
      paste: { name: '高营养糊糊', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 3, 4); } },
    },
    // 产卵 → 猛砸 → 嫩化 → （能产卵则产卵，否则高营养糊糊）→ 猛砸 …
    ai: (C, e) => {
      const next = { lay: 'smash', paste: 'smash', smash: 'tenderizer' };
      if (e.moveKey === 'tenderizer') return C.alive().length <= 3 ? 'lay' : 'paste';
      return next[e.moveKey] || 'lay';
    },
  },

  /* ================= 结实的卵 ================= */
  TOUGH_EGG: {
    name: '结实的卵', icon: '🥚', hp: [14, 18], hpAsc: [15, 19], minion: true,
    onSpawn: (C, e) => { e.hatchIn = 2; },
    moves: {
      hatch: { name: '孵化', intent: { type: 'sleep' }, run: async (C, e) => {} },
      nibble: { name: '啃咬', intent: { type: 'attack', dmg: 4, dmgAsc: 5 }, run: async (C, e) => { await C.enemyAttack(e, 4, 5); } },
    },
    onTurnEnd: async (C, e) => {
      if (e.hatched) return;
      e.hatchIn--;
      if (e.hatchIn <= 0) {
        e.hatched = true;
        const hp = C.rng.range(C.asc >= 8 ? 20 : 19, C.asc >= 8 ? 23 : 22);
        e.maxHp = hp; e.hp = hp;
        C.msg(`${e.name} 孵化了`);
        C.emit();
      }
    },
    ai: (C, e) => (e.hatched ? 'nibble' : 'hatch'),
  },

  /* ================= 沉睡甲虫 ================= */
  SLUMBERING_BEETLE: {
    name: '沉睡甲虫', icon: '🪲', hp: [86, 86], hpAsc: [89, 89],
    onSpawn: (C, e) => {
      e.powers.plating = C.asc >= 8 ? 18 : 15;
      e.slumber = 3;
    },
    moves: {
      snore: { name: '打鼾', intent: { type: 'sleep' }, run: async (C, e) => {} },
      wakeStun: { name: '苏醒', intent: { type: 'stun' }, run: async (C, e) => { delete e.powers.plating; } },
      roll: {
        name: '出击', intent: { type: 'attack', dmg: 16, dmgAsc: 18 },
        run: async (C, e) => { await C.enemyAttack(e, 16, 18); await C.enemyPower(e, 'strength', 2); },
      },
    },
    // 熟睡：自己回合结束 -1；受到未格挡伤害也会 -1；层数归零后醒来（受伤醒来先眩晕一回合）
    onTurnEnd: async (C, e) => {
      if (e.awake) return;
      e.slumber--;
      if (e.slumber <= 0) { e.awake = true; delete e.powers.plating; C.msg(`${e.name} 醒了`); }
    },
    onDamaged: async (C, e, info) => {
      if (e.awake || !info.unblocked) return;
      e.slumber--;
      if (e.slumber <= 0) { e.awake = true; e.wakeStun = true; C.msg(`${e.name} 被打醒了`); }
    },
    ai: (C, e) => {
      if (!e.awake) return 'snore';
      if (e.wakeStun) { e.wakeStun = false; return 'wakeStun'; }
      return 'roll';
    },
  },

  /* ================= 棘刺蟾蜍 ================= */
  SPINY_TOAD: {
    name: '棘刺蟾蜍', icon: '🐸', hp: [116, 119], hpAsc: [121, 124],
    moves: {
      spikes: { name: '伸出尖刺', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'thorns', 5); } },
      explosion: {
        name: '尖刺爆破', intent: { type: 'attack', dmg: 23, dmgAsc: 25 },
        run: async (C, e) => {
          await C.enemyAttack(e, 23, 25);
          if (e.powers.thorns) {
            e.powers.thorns -= 5;
            if (e.powers.thorns <= 0) delete e.powers.thorns;
            C.emit();
          }
        },
      },
      lash: { name: '吐舌', intent: { type: 'attack', dmg: 17, dmgAsc: 19 }, run: async (C, e) => { await C.enemyAttack(e, 17, 19); } },
    },
    ai: (C, e) => {
      const s = e.step || 0;
      e.step = s + 1;
      return ['spikes', 'explosion', 'lash'][s % 3];
    },
  },

  /* ================= 胧光怪 ================= */
  THE_OBSCURA: {
    name: '胧光怪', icon: '🌑', hp: [123, 123], hpAsc: [129, 129],
    moves: {
      illusion: { name: '幻象', intent: { type: 'buff' }, run: async (C, e) => { await C.spawnEnemy('PARAFRIGHT', e); } },
      gaze: { name: '锐利凝视', intent: { type: 'attack', dmg: 10, dmgAsc: 11 }, run: async (C, e) => { await C.enemyAttack(e, 10, 11); } },
      wail: {
        name: '哭号', intent: { type: 'buff' },
        run: async (C, e) => { for (const a of C.alive()) await C.enemyPower(a, 'strength', 3); },
      },
      hardening: {
        name: '硬化攻击', intent: { type: 'attack', dmg: 6, dmgAsc: 7 },
        run: async (C, e) => { await C.enemyAttack(e, 6, 7); await C.enemyBlock(e, 6, 7); },
      },
    },
    // 幻象 → 随机三选一（不可连续重复）→ …
    ai: (C, e, pick) => {
      if (!e.acted) { e.acted = true; return 'illusion'; }
      const all = [['gaze', 1], ['wail', 1], ['hardening', 1]];
      const pairs = all.filter(([k]) => k !== e.moveKey);
      return pick(pairs.length ? pairs : all);
    },
  },
  PARAFRIGHT: {
    name: '寄生惧魔', icon: '👻', hp: [21, 21], hpAsc: [21, 21], minion: true,
    onSpawn: (C, e) => { e.powers.illusion = 1; e.revived = false; },
    moves: {
      slam: { name: '砸击', intent: { type: 'attack', dmg: 16, dmgAsc: 17 }, run: async (C, e) => { await C.enemyAttack(e, 16, 17); } },
    },
    ai: () => 'slam',
    // 幻象：死亡后以完整生命值复活一次（等效实现：立刻满血站起来，只触发一次）
    onDeath: async (C, e) => {
      if (e.revived) return false;
      e.revived = true;
      e.hp = e.maxHp;
      C.msg(`${e.name} 的幻象重聚`);
      C.emit();
      return true;
    },
  },

  /* ================= 地道虫 ================= */
  TUNNELER: {
    name: '地道虫', icon: '🪱', hp: [87, 87], hpAsc: [92, 92],
    moves: {
      bite: { name: '啃咬', intent: { type: 'attack', dmg: 13, dmgAsc: 15 }, run: async (C, e) => { e.burrowed = false; await C.enemyAttack(e, 13, 15); } },
      burrow: {
        name: '钻洞', intent: { type: 'defend', block: 32, blockAsc: 37 },
        run: async (C, e) => {
          e.burrowed = true;
          await C.enemyBlock(e, C.asc >= 8 ? 37 : 32);
        },
      },
      below: { name: '下方攻击', intent: { type: 'attack', dmg: 23, dmgAsc: 26 }, run: async (C, e) => { e.burrowed = false; await C.enemyAttack(e, 23, 26); } },
      burrowStun: { name: '眩晕', intent: { type: 'stun' }, run: async (C, e) => { e.burrowed = false; } },
    },
    // 钻洞期间格挡不清空，被打穿则眩晕一回合
    keepBlock: (e) => !!e.burrowed,
    onDamaged: async (C, e, info) => {
      if (!e.burrowed || e.block > 0) return;
      e.burrowed = false;
      e.burrowStunNext = true;
      C.msg(`${e.name} 被从洞里打了出来`);
    },
    ai: (C, e) => {
      if (e.burrowStunNext) { e.burrowStunNext = false; return 'burrowStun'; }
      if (!e.acted) { e.acted = true; return 'bite'; }
      if (e.moveKey === 'bite') return 'burrow';
      return 'below';
    },
  },

  /* ================= 偷窃草蜢 ================= */
  THIEVING_HOPPER: {
    name: '偷窃草蜢', icon: '🦗', hp: [79, 79], hpAsc: [84, 84],
    onSpawn: (C, e) => { e.escapeIn = 5; },   // 逃脱大师：5 回合后离场
    moves: {
      theft: {
        name: '偷盗', intent: { type: 'attack', dmg: 17, dmgAsc: 19 },
        run: async (C, e) => {
          // 顺手拿走你牌组里的一张牌（战斗结束后归还由 onDeath 处理）
          const pool = C.run.deck.filter(d => !e.stolen || d.uid !== e.stolen.uid);
          if (pool.length && !e.stolen) {
            const pick = C.rng.pick(pool);
            e.stolen = pick;
            C.msg(`${e.name} 顺走了「${pick.id}」`);
          }
          await C.enemyAttack(e, 17, 19);
        },
      },
      flutter: { name: '振翅', intent: { type: 'buff' }, run: async (C, e) => { e.powers.flutter = 5; } },
      hat: { name: '帽子戏法', intent: { type: 'attack', dmg: 21, dmgAsc: 23 }, run: async (C, e) => { await C.enemyAttack(e, 21, 23); } },
      nab: { name: '抢夺', intent: { type: 'attack', dmg: 14, dmgAsc: 16 }, run: async (C, e) => { await C.enemyAttack(e, 14, 16); } },
      escape: { name: '逃跑', intent: { type: 'stun' }, run: async (C, e) => { await C.escapeEnemy(e); } },
    },
    // 振翅：受到攻击伤害减半，每次受击减 1 层
    incomingScale: (C, e, opts) => (e.powers.flutter && opts.isAttack ? .5 : 1),
    onDamaged: async (C, e, info) => {
      if (!info.isAttack || !info.unblocked || !e.powers.flutter) return;
      e.powers.flutter--;
      if (e.powers.flutter <= 0) { delete e.powers.flutter; e.pendingStun = false; }
      C.emit();
    },
    // 逃脱大师：自己回合结束 -1，归零就跑
    onTurnEnd: async (C, e) => { if (e.escapeIn > 1) e.escapeIn--; },
    onDeath: async (C, e) => {
      if (e.stolen) { C.msg(`「${e.stolen.id}」回到了你的牌组`); e.stolen = null; }
      return false;
    },
    ai: (C, e) => {
      if (e.escapeIn <= 1) return 'escape';
      const next = { theft: 'flutter', flutter: 'hat', hat: 'nab', nab: 'escape' };
      if (!e.acted) { e.acted = true; return 'theft'; }
      return next[e.moveKey] || 'escape';
    },
  },

  /* ================= 残杀千足虫（精英） ================= */
  DECIMILLIPEDE_SEGMENT: {
    name: '残杀千足虫', icon: '🐛', hp: [40, 46], hpAsc: [46, 52], elite: true,
    onSpawn: (C, e) => { e.segIndex = e.segIndex || 0; },
    moves: {
      writhe: {
        name: '扭动', intent: { type: 'attack', dmg: 5, dmgAsc: 6, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 5, 6, 2); },
      },
      bulk: {
        name: '胀大', intent: { type: 'attack', dmg: 6, dmgAsc: 7 },
        run: async (C, e) => { await C.enemyAttack(e, 6, 7); await C.enemyPower(e, 'strength', 2); },
      },
      constrict: {
        name: '紧缠', intent: { type: 'attack', dmg: 8, dmgAsc: 9 },
        run: async (C, e) => { await C.enemyAttack(e, 8, 9); await C.addPower('weak', 1); },
      },
    },
    // 三段各自从不同招式起手；之后 扭动→紧缠→胀大→扭动
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return ['writhe', 'bulk', 'constrict'][(e.segIndex || 0) % 3]; }
      return { writhe: 'constrict', constrict: 'bulk', bulk: 'writhe' }[e.moveKey] || 'writhe';
    },
    // 接续：还有别的身体部位存活时，以 25 点生命复活（等效：倒下即复起，仅一次）
    onDeath: async (C, e) => {
      const others = C.alive().filter(x => x !== e && x.id === 'DECIMILLIPEDE_SEGMENT');
      if (!others.length || e.reattached) return false;
      e.reattached = true;
      e.hp = 25;
      C.msg(`${e.name} 的一节重新接上了`);
      C.emit();
      return true;
    },
  },

  /* ================= 蜂群术士（精英） ================= */
  ENTOMANCER: {
    name: '蜂群术士', icon: '🐝', hp: [145, 145], hpAsc: [165, 165], elite: true,
    onSpawn: (C, e) => { e.powers.personalHive = 1; },
    moves: {
      pheromone: {
        name: '喷射信息素', intent: { type: 'buff' },
        run: async (C, e) => {
          if ((e.powers.personalHive || 0) >= 3) { await C.enemyPower(e, 'strength', 2); return; }
          e.powers.personalHive = (e.powers.personalHive || 0) + 1;
          await C.enemyPower(e, 'strength', 1);
          C.emit();
        },
      },
      bees: {
        name: '蜜——蜂——！', intent: { type: 'attack', dmg: 3, times: 7, timesAsc: 8 },
        run: async (C, e) => { await C.enemyAttack(e, 3, 3, C.asc >= 9 ? 8 : 7); },
      },
      spear: { name: '矛击！', intent: { type: 'attack', dmg: 18, dmgAsc: 20 }, run: async (C, e) => { await C.enemyAttack(e, 18, 20); } },
    },
    // 人体蜂房：被攻击命中时，往你的抽牌堆塞等量张「眩晕」
    onDamaged: async (C, e, info) => {
      if (!info.isAttack) return;
      for (let i = 0; i < (e.powers.personalHive || 0); i++) await C.addCard('DAZED', 'draw');
    },
    ai: (C, e) => {
      const next = { bees: 'spear', spear: 'pheromone', pheromone: 'bees' };
      if (!e.acted) { e.acted = true; return 'bees'; }
      return next[e.moveKey] || 'bees';
    },
  },

  /* ================= 感染棱柱（精英） ================= */
  INFESTED_PRISM: {
    name: '感染棱柱', icon: '🔮', hp: [161, 161], hpAsc: [171, 171], elite: true,
    onSpawn: (C, e) => { e.powers.vitalSpark = C.asc >= 9 ? 3 : 2; e.sparkTurn = 0; },
    moves: {
      jab: { name: '刺击', intent: { type: 'attack', dmg: 15, dmgAsc: 17 }, run: async (C, e) => { await C.enemyAttack(e, 15, 17); } },
      radiate: {
        name: '辐射', intent: { type: 'attack', dmg: 11, dmgAsc: 13 },
        run: async (C, e) => { await C.enemyAttack(e, 11, 13); await C.enemyBlock(e, 11, 13); },
      },
      whirlwind: {
        name: '旋风', intent: { type: 'attack', dmg: 5, dmgAsc: 6, times: 3 },
        run: async (C, e) => { await C.enemyAttack(e, 5, 6, 3); },
      },
      pulsate: {
        name: '脉动', intent: { type: 'attack', dmg: 8, dmgAsc: 10 },
        run: async (C, e) => {
          await C.enemyAttack(e, 8, 10);
          await C.enemyBlock(e, C.asc >= 8 ? 22 : 20);
          e.powers.vitalSpark = (e.powers.vitalSpark || 0) + (C.asc >= 9 ? 3 : 2);
          C.emit();
        },
      },
    },
    // 活力火花：每回合第一次被攻击命中时，你获得 1 点能量
    onDamaged: async (C, e, info) => {
      if (!info.isAttack || e.sparkTurn === C.turn) return;
      e.sparkTurn = C.turn;
      await C.gainEnergy(1);
      C.msg('「活力火花」：获得 1 点能量');
    },
    ai: (C, e) => {
      const next = { jab: 'radiate', radiate: 'whirlwind', whirlwind: 'pulsate', pulsate: 'jab' };
      if (!e.acted) { e.acted = true; return 'jab'; }
      return next[e.moveKey] || 'jab';
    },
  },

  /* ================= 无厌沙虫（首领） ================= */
  THE_INSATIABLE: {
    name: '无厌沙虫', icon: '🪱', hp: [321, 321], hpAsc: [341, 341], boss: true,
    onSpawn: (C, e) => { e.sandpit = 0; },
    moves: {
      liquify: {
        name: '液化地面', intent: { type: 'status' },
        run: async (C, e) => {
          e.sandpit = 4;
          for (let i = 0; i < 6; i++) await C.addCard('FRANTIC_ESCAPE', i < 3 ? 'draw' : 'discard');
          C.emit();
        },
      },
      thrash: {
        name: '撕扯', intent: { type: 'attack', dmg: 8, dmgAsc: 9, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 8, 9, 2); },
      },
      bite: { name: '前扑啃咬', intent: { type: 'attack', dmg: 28, dmgAsc: 31 }, run: async (C, e) => { await C.enemyAttack(e, 28, 31); } },
      salivate: { name: '分泌唾液', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2, 3); } },
      thrash2: {
        name: '撕扯', intent: { type: 'attack', dmg: 8, dmgAsc: 9, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 8, 9, 2); },
      },
    },
    // 液化地面 → 撕扯 → 前扑啃咬 → 分泌唾液 → 撕扯 → 撕扯 …
    ai: (C, e) => {
      const next = { liquify: 'thrash', thrash: 'bite', bite: 'salivate', salivate: 'thrash2', thrash2: 'thrash' };
      if (!e.acted) { e.acted = true; return 'liquify'; }
      return next[e.moveKey] || 'thrash';
    },
  },

  /* ================= 知识恶魔（首领） ================= */
  KNOWLEDGE_DEMON: {
    name: '知识恶魔', icon: '👁️', hp: [379, 379], hpAsc: [399, 399], boss: true,
    onSpawn: (C, e) => { e.curseCount = 0; },
    moves: {
      curse: {
        name: '知识的诅咒', intent: { type: 'debuff' },
        run: async (C, e) => {
          // 源码让玩家在「瓦解」与另一张诅咒之间二选一；这里直接施加被选中那张的效果
          const n = e.curseCount;
          e.curseCount = n + 1;
          if (n === 0) { await C.addPower('mindRot', 1); C.msg('「心灵腐化」：每回合少抽 1 张牌'); }
          else if (n === 1) { await C.addPower('sloth', 3); C.msg('「懒惰」：每回合最多打出 3 张牌'); }
          else { await C.addPower('wasteAway', 1); C.msg('「衰朽」：每回合少 1 点能量'); }
          C.emit();
        },
      },
      slap: { name: '拍击', intent: { type: 'attack', dmg: 17, dmgAsc: 18 }, run: async (C, e) => { await C.enemyAttack(e, 17, 18); } },
      overwhelming: {
        name: '知识过载', intent: { type: 'attack', dmg: 8, dmgAsc: 9, times: 3 },
        run: async (C, e) => { await C.enemyAttack(e, 8, 9, 3); },
      },
      ponder: {
        name: '思考', intent: { type: 'attack', dmg: 11, dmgAsc: 13 },
        run: async (C, e) => {
          await C.enemyAttack(e, 11, 13);
          e.hp = Math.min(e.maxHp, e.hp + 30);
          await C.enemyPower(e, 'strength', 2, 3);
          C.emit();
        },
      },
    },
    // 诅咒 → 拍击 → 知识过载 → 思考 →（诅咒次数 <3 再诅咒，否则拍击）
    ai: (C, e) => {
      const next = { curse: 'slap', slap: 'overwhelming', overwhelming: 'ponder' };
      if (!e.acted) { e.acted = true; return 'curse'; }
      if (e.moveKey === 'ponder') return (e.curseCount || 0) < 3 ? 'curse' : 'slap';
      return next[e.moveKey] || 'slap';
    },
  },

  /* ================= 凯撒蟹（首领，两个部件） ================= */
  CRUSHER: {
    name: '碾碎爪', icon: '🦀', hp: [209, 209], hpAsc: [219, 219], boss: true,
    onSpawn: (C, e) => { e.powers.crabRage = 1; },
    moves: {
      thrash: { name: '撕扯', intent: { type: 'attack', dmg: 12, dmgAsc: 14 }, run: async (C, e) => { await C.enemyAttack(e, 12, 14); } },
      enlarge: { name: '巨化打击', intent: { type: 'attack', dmg: 4 }, run: async (C, e) => { await C.enemyAttack(e, 4, 4); } },
      sting: {
        name: '虫蛰', intent: { type: 'attack', dmg: 6, dmgAsc: 7, times: 2 },
        run: async (C, e) => {
          await C.enemyAttack(e, 6, 7, 2);
          await C.addPower('weak', 2);
          await C.addPower('frail', 2);
        },
      },
      adapt: { name: '适应', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2, 3); } },
      guarded: {
        name: '戒备打击', intent: { type: 'attack', dmg: 12, dmgAsc: 14 },
        run: async (C, e) => { await C.enemyAttack(e, 12, 14); await C.enemyBlock(e, 18); },
      },
    },
    // 蟹之怒：盟友倒下时获得 5 力量与 99 格挡
    onAllyDeath: async (C, e) => {
      await C.enemyPower(e, 'strength', 5);
      await C.enemyBlock(e, 99);
      C.msg(`「蟹之怒」：${e.name} 力量 +5、格挡 +99`);
    },
    ai: (C, e) => {
      const order = ['thrash', 'enlarge', 'sting', 'adapt', 'guarded'];
      const i = order.indexOf(e.moveKey);
      return order[(i + 1) % order.length];
    },
  },
  ROCKET: {
    name: '火箭', icon: '🚀', hp: [199, 199], hpAsc: [209, 209], boss: true,
    onSpawn: (C, e) => { e.powers.crabRage = 1; },
    moves: {
      reticle: { name: '瞄准十字', intent: { type: 'attack', dmg: 3, dmgAsc: 4 }, run: async (C, e) => { await C.enemyAttack(e, 3, 4); } },
      beam: { name: '精准光束', intent: { type: 'attack', dmg: 18, dmgAsc: 20 }, run: async (C, e) => { await C.enemyAttack(e, 18, 20); } },
      charge: { name: '蓄能', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2, 3); } },
      laser: { name: '激光', intent: { type: 'attack', dmg: 31, dmgAsc: 35 }, run: async (C, e) => { await C.enemyAttack(e, 31, 35); } },
      recharge: { name: '重新充能', intent: { type: 'sleep' }, run: async (C, e) => {} },
    },
    onAllyDeath: async (C, e) => {
      await C.enemyPower(e, 'strength', 5);
      await C.enemyBlock(e, 99);
      C.msg(`「蟹之怒」：${e.name} 力量 +5、格挡 +99`);
    },
    ai: (C, e) => {
      const order = ['reticle', 'beam', 'charge', 'laser', 'recharge'];
      const i = order.indexOf(e.moveKey);
      return order[(i + 1) % order.length];
    },
  },
};

/**
 * 第二幕遭遇编组 —— 顺序与 Hive.CreateAllEncounters 一致（权重抽取按这个顺序建袋）。
 * weak 为 true 的属于弱怪池（本幕前 2 场战斗）。
 */
export const HIVE_ENCOUNTERS = {
  monster: [
    {
      id: 'BOWLBUGS_NORMAL', weak: false, units: [['BOWLBUG_ROCK']],
      // 石 + 随机两只不同的工虫（卵/丝/蜜）
      build: (C) => ['BOWLBUG_ROCK', ...C.rng.pickMany(['BOWLBUG_EGG', 'BOWLBUG_SILK', 'BOWLBUG_NECTAR'], 2)],
      slots: ['first', 'middle', 'last'],
    },
    {
      id: 'BOWLBUGS_WEAK', weak: true, units: [['BOWLBUG_ROCK']],
      build: (C) => ['BOWLBUG_ROCK', C.rng.next() < 0.5 ? 'BOWLBUG_EGG' : 'BOWLBUG_NECTAR'],
      slots: ['odd', 'even'],
    },
    { id: 'CHOMPERS_NORMAL', weak: false, units: [['CHOMPER', 'CHOMPER']], slots: [null, null], screamSecond: true },
    { id: 'EXOSKELETONS_NORMAL', weak: false, units: [['EXOSKELETON']], repeat: 4, slots: ['first', 'second', 'third', 'fourth'] },
    { id: 'EXOSKELETONS_WEAK', weak: true, units: [['EXOSKELETON']], repeat: 3, slots: ['first', 'second', 'third'] },
    { id: 'HUNTER_KILLER_NORMAL', weak: false, units: [['HUNTER_KILLER']], slots: [null] },
    { id: 'LOUSE_PROGENITOR_NORMAL', weak: false, units: [['LOUSE_PROGENITOR']], slots: [null] },
    { id: 'MYTES_NORMAL', weak: false, units: [['MYTE', 'MYTE']], slots: ['first', 'second'] },
    { id: 'OVICOPTER_NORMAL', weak: false, units: [['OVICOPTER']], slots: ['ovicopter'] },
    {
      id: 'SLUMBERING_BEETLE_NORMAL', weak: false, units: [['BOWLBUG_ROCK', 'BOWLBUG_SILK', 'SLUMBERING_BEETLE']],
      slots: ['first', 'second', 'third'],
    },
    { id: 'SPINY_TOAD_NORMAL', weak: false, units: [['SPINY_TOAD']], slots: [null] },
    { id: 'THE_OBSCURA_NORMAL', weak: false, units: [['THE_OBSCURA']], slots: ['obscura'] },
    { id: 'THIEVING_HOPPER_WEAK', weak: true, units: [['THIEVING_HOPPER']], slots: [null] },
    { id: 'TUNNELER_WEAK', weak: true, units: [['TUNNELER']], slots: [null] },
  ],
  elite: [
    {
      id: 'DECIMILLIPEDE_ELITE', units: [['DECIMILLIPEDE_SEGMENT']],
      repeat: 3, // 三段，起手招式依次错开
      slots: ['segment1', 'segment2', 'segment3'],
      startOffset: true,
    },
    { id: 'ENTOMANCER_ELITE', units: [['ENTOMANCER']], slots: [null] },
    { id: 'INFESTED_PRISMS_ELITE', units: [['INFESTED_PRISM']], slots: [null] },
  ],
  boss: [
    { id: 'THE_INSATIABLE_BOSS', units: [['THE_INSATIABLE']], slots: [null] },
    { id: 'KNOWLEDGE_DEMON_BOSS', units: [['KNOWLEDGE_DEMON']], slots: [null] },
    { id: 'KAISER_CRAB_BOSS', units: [['CRUSHER', 'ROCKET']], slots: ['crusher', 'rocket'] },
  ],
};

/** 第二幕弱怪池场数（Hive.NumberOfWeakEncounters） */
export const HIVE_WEAK_COUNT = 2;
