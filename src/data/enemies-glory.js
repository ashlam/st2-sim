/**
 * 第三幕「荣耀」（Glory）敌人数据
 *
 * 数值 / 招式 / 状态机取自 sts2-sim：
 *   Content/Acts/GloryEncounters.BatchA.cs / BatchB.cs / Bosses.cs（遭遇编组与 slot）
 *   Content/Acts/Glory.cs（遭遇总表顺序、精英/首领名单、弱怪池场数）
 *   Models/Monsters/*.cs（血量、伤害、招式顺序、条件分支、死亡/召唤逻辑）
 * 中文名与招式名取自官方 zhs 本地化 localization/zhs/monsters.json。
 *
 * 进阶：ToughEnemies（进阶 8）改血量，DeadlyEnemies（进阶 9）改伤害 ——
 * 与第一、二幕一样用 hp / hpAsc、enemyAttack(e, base, ascValue) 表达。
 *
 * 少数机制做了等效实现，条目里用注释说明（都是时序差异，不影响数值与胜负判定）。
 */

/* 回合结束时给敌人挂能力的统一写法：ritual / nemesis 等「本回合施加、下回合才起效」的机制 */
const addPower = async (C, e, id, n) => {
  await C.enemyPower(e, id, n);
};

export const GLORY_ENEMIES = {
  /* ================= 巨斧机器人（库存：被击杀后换一具新机体） ================= */
  AXEBOT: {
    name: '巨斧机器人', icon: '🪓', hp: [70, 78], hpAsc: [76, 86],
    // 库存：第 1、2 具机体各留 1 次备用；每换一具血量 +10（MinInitialHp = 基础 + (2-StockAmount)*10）
    onSpawn: (C, e) => {
      e.stock = e.stock ?? 2;
      const bonus = (2 - e.stock) * 10;
      e.hp += bonus; e.maxHp += bonus;
      if (e.stock > 0) e.powers.stock = e.stock;
    },
    moves: {
      boot: {
        name: '启动', intent: { type: 'defend', block: 10, blockAsc: 15 },
        run: async (C, e) => {
          await C.enemyBlock(e, C.asc >= 9 ? 15 : 10);
          // 越晚出场的机体，启动时积攒的力量越多
          await C.enemyPower(e, 'strength', 3 * (2 - (e.stock ?? 2)), 4 * (2 - (e.stock ?? 2)));
        },
      },
      uppercut: {
        name: '上勾锤击', intent: { type: 'attack', dmg: 14, dmgAsc: 18 },
        run: async (C, e) => {
          await C.enemyAttack(e, 14, 18);
          await C.addPower('weak', 2);
          await C.addPower('frail', 2);
        },
      },
      oneTwo: {
        name: '两连击', intent: { type: 'attack', dmg: 10, dmgAsc: 11, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 10, 11, 2); },
      },
    },
    // 首具机体从上勾锤击起手；换机体后从「启动」起手
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return e.bootFirst ? 'boot' : 'uppercut'; }
      return { boot: 'uppercut', uppercut: 'oneTwo', oneTwo: 'uppercut' }[e.moveKey] || 'uppercut';
    },
    // 库存：倒下时补一具新机体（原机体确实消失）
    onDeath: async (C, e) => {
      const stock = e.powers.stock || 0;
      if (stock <= 0) return false;
      await C.spawnEnemy('AXEBOT', e, { stock: stock - 1, bootFirst: true });
      C.msg(`「库存」：又一具${e.name}被推了上来`);
      return false;
    },
  },

  /* ================= 虔诚雕刻师 ================= */
  DEVOTED_SCULPTOR: {
    name: '虔诚雕刻师', icon: '🗿', hp: [162, 162], hpAsc: [172, 172],
    moves: {
      incantation: {
        name: '禁忌咒文', intent: { type: 'buff' },
        run: async (C, e) => {
          await C.enemyPower(e, 'ritual', 9);
          e.ritualSkip = 1;          // 咒文当回合结束时不计入「仪式」
        },
      },
      savage: {
        name: '狂击', intent: { type: 'attack', dmg: 12, dmgAsc: 15 },
        run: async (C, e) => { await C.enemyAttack(e, 12, 15); },
      },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'incantation'; }
      return 'savage';
    },
  },

  /* ================= 组装师 + 四种子机体 ================= */
  FABRICATOR: {
    name: '组装师', icon: '⚙️', hp: [150, 150], hpAsc: [155, 155],
    moves: {
      fabricate: {
        name: '组装', intent: { type: 'buff' },
        run: async (C, e) => { await fabricateBot(C, e, ['GUARDBOT', 'NOISEBOT']); await fabricateBot(C, e, ['ZAPBOT', 'STABBOT']); },
      },
      strike: {
        name: '组装打击', intent: { type: 'attack', dmg: 18, dmgAsc: 21 },
        run: async (C, e) => { await C.enemyAttack(e, 18, 21); await fabricateBot(C, e, ['ZAPBOT', 'STABBOT']); },
      },
      disintegrate: {
        name: '瓦解', intent: { type: 'attack', dmg: 11, dmgAsc: 13 },
        run: async (C, e) => { await C.enemyAttack(e, 11, 13); },
      },
    },
    // 场上存活敌人 <4 时随机「组装 / 组装打击」，否则「瓦解」
    ai: (C, e, pick) => {
      if (C.alive().length >= 4) return 'disintegrate';
      return pick([['fabricate', 1], ['strike', 1]]);
    },
  },
  GUARDBOT: {
    name: '守护机器人', icon: '🛡️', hp: [16, 20], hpAsc: [17, 21], minion: true,
    moves: {
      guard: {
        name: '守护', intent: { type: 'defend', block: 15 },
        run: async (C, e) => {
          for (const ally of C.alive()) {
            if (ally.id !== 'FABRICATOR') continue;
            await C.enemyBlock(ally, 15);
          }
        },
      },
    },
    ai: () => 'guard',
  },
  NOISEBOT: {
    name: '噪音机器人', icon: '📢', hp: [18, 23], hpAsc: [19, 24], minion: true,
    moves: {
      noise: {
        name: '噪音', intent: { type: 'status' },
        run: async (C, e) => { await C.addCard('DAZED', 'discard', false, 1); await C.addCard('DAZED', 'draw', false, 1); },
      },
    },
    ai: () => 'noise',
  },
  ZAPBOT: {
    name: '电击机器人', icon: '⚡', hp: [18, 23], hpAsc: [19, 24], minion: true,
    onSpawn: (C, e) => { e.powers.highVoltage = 2; },
    moves: {
      zap: {
        name: '电击', intent: { type: 'attack', dmg: 14, dmgAsc: 15 },
        run: async (C, e) => { await C.enemyAttack(e, 14, 15); },
      },
    },
    ai: () => 'zap',
    onTurnEnd: async (C, e) => { await addPower(C, e, 'strength', 2); },
  },
  STABBOT: {
    name: '戳刺机器人', icon: '🗡️', hp: [18, 23], hpAsc: [19, 24], minion: true,
    moves: {
      stab: {
        name: '戳刺', intent: { type: 'attack', dmg: 11, dmgAsc: 12 },
        run: async (C, e) => { await C.enemyAttack(e, 11, 12); await C.addPower('frail', 1); },
      },
    },
    ai: () => 'stab',
  },

  /* ================= 青蛙骑士 ================= */
  FROG_KNIGHT: {
    name: '青蛙骑士', icon: '🐸', hp: [191, 191], hpAsc: [199, 199],
    onSpawn: (C, e) => { e.powers.plating = C.asc >= 8 ? 19 : 15; e.charged = false; },
    moves: {
      queen: { name: '为了女王', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 5); } },
      strike: { name: '惩恶一击', intent: { type: 'attack', dmg: 21, dmgAsc: 23 }, run: async (C, e) => { await C.enemyAttack(e, 21, 23); } },
      lash: {
        name: '吐舌', intent: { type: 'attack', dmg: 13, dmgAsc: 14 },
        run: async (C, e) => { await C.enemyAttack(e, 13, 14); await C.addPower('frail', 2); },
      },
      charge: {
        name: '甲虫冲锋', intent: { type: 'attack', dmg: 35, dmgAsc: 40 },
        run: async (C, e) => { e.charged = true; await C.enemyAttack(e, 35, 40); },
      },
    },
    // 吐舌 → 惩恶一击 → 为了女王 →（未冲锋且血量过半 → 甲虫冲锋；否则 吐舌）→ 吐舌 …
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'lash'; }
      if (e.moveKey === 'queen') {
        return (e.charged || e.hp >= Math.floor(e.maxHp / 2)) ? 'lash' : 'charge';
      }
      return { lash: 'strike', strike: 'queen', charge: 'lash' }[e.moveKey] || 'lash';
    },
  },

  /* ================= 电球头 ================= */
  GLOBE_HEAD: {
    name: '电球头', icon: '🔮', hp: [148, 148], hpAsc: [158, 158],
    onSpawn: (C, e) => { e.powers.galvanic = C.asc >= 9 ? 8 : 6; },
    moves: {
      slap: {
        name: '电击掌', intent: { type: 'attack', dmg: 13, dmgAsc: 14 },
        run: async (C, e) => { await C.enemyAttack(e, 13, 14); await C.addPower('frail', 2); },
      },
      thunder: {
        name: '雷击', intent: { type: 'attack', dmg: 6, dmgAsc: 7, times: 3 },
        run: async (C, e) => { await C.enemyAttack(e, 6, 7, 3); },
      },
      burst: {
        name: '流电爆发', intent: { type: 'attack', dmg: 16, dmgAsc: 17 },
        run: async (C, e) => { await C.enemyAttack(e, 16, 17); await C.enemyPower(e, 'strength', 2); },
      },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'slap'; }
      return { slap: 'thunder', thunder: 'burst', burst: 'slap' }[e.moveKey] || 'slap';
    },
  },

  /* ================= 猫头鹰法官 ================= */
  OWL_MAGISTRATE: {
    name: '猫头鹰法官', icon: '🦉', hp: [231, 231], hpAsc: [247, 247],
    // 翱翔：落地前受到的攻击伤害减半
    incomingScale: (C, e, opts) => (e.powers.soar && opts.isAttack ? 0.5 : null),
    moves: {
      scrutiny: { name: '法官审查', intent: { type: 'attack', dmg: 16, dmgAsc: 17 }, run: async (C, e) => { await C.enemyAttack(e, 16, 17); } },
      peck: { name: '猛啄袭击', intent: { type: 'attack', dmg: 6, times: 6 }, run: async (C, e) => { await C.enemyAttack(e, 6, 6, 6); } },
      flight: { name: '飞法行为', intent: { type: 'buff' }, run: async (C, e) => { e.powers.soar = 1; C.emit(); } },
      verdict: {
        name: '裁决', intent: { type: 'attack', dmg: 33, dmgAsc: 36 },
        run: async (C, e) => {
          await C.enemyAttack(e, 33, 36);
          await C.addPower('vulnerable', 4);
          delete e.powers.soar;
          C.emit();
        },
      },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'scrutiny'; }
      return { scrutiny: 'peck', peck: 'flight', flight: 'verdict', verdict: 'scrutiny' }[e.moveKey] || 'scrutiny';
    },
  },

  /* ================= 构造体动物园（拳击构装体；立柱构造体见第一幕同名条目） ================= */
  PUNCH_CONSTRUCT: {
    name: '拳击构装体', icon: '🥊', hp: [55, 55], hpAsc: [60, 60],
    onSpawn: (C, e) => { e.powers.artifact = 1; },
    moves: {
      ready: { name: '准备就绪', intent: { type: 'defend', block: 10 }, run: async (C, e) => { await C.enemyBlock(e, 10); } },
      fast: {
        name: '快速拳', intent: { type: 'attack', dmg: 5, dmgAsc: 6, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 5, 6, 2); await C.addPower('frail', 1); },
      },
      strong: { name: '强力拳', intent: { type: 'attack', dmg: 14, dmgAsc: 16 }, run: async (C, e) => { await C.enemyAttack(e, 14, 16); } },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'ready'; }
      return { ready: 'fast', fast: 'strong', strong: 'ready' }[e.moveKey] || 'ready';
    },
  },

  /* ================= 骑士团（精英） ================= */
  FLAIL_KNIGHT: {
    name: '连枷骑士', icon: '⛓️', hp: [101, 101], hpAsc: [108, 108], elite: true,
    moves: {
      chant: { name: '战吼', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 3); } },
      flail: { name: '连枷', intent: { type: 'attack', dmg: 9, dmgAsc: 10, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 9, 10, 2); } },
      ram: { name: '撞击', intent: { type: 'attack', dmg: 15, dmgAsc: 17 }, run: async (C, e) => { await C.enemyAttack(e, 15, 17); } },
    },
    // 撞击起手；之后 战吼(不可连续) / 连枷(权重2) / 撞击(权重2)
    ai: (C, e, pick) => {
      if (!e.acted) { e.acted = true; return 'ram'; }
      const pool = [['chant', 1], ['flail', 2], ['ram', 2]].filter(([k]) => k !== e.moveKey || k !== 'chant');
      return pick(pool);
    },
  },
  SPECTRAL_KNIGHT: {
    name: '幽灵骑士', icon: '👻', hp: [93, 93], hpAsc: [97, 97], elite: true,
    moves: {
      hex: { name: '恶咒', intent: { type: 'debuff' }, run: async (C, e) => { await C.addPower('hex', 2); } },
      slash: { name: '灵魂斩击', intent: { type: 'attack', dmg: 15, dmgAsc: 17 }, run: async (C, e) => { await C.enemyAttack(e, 15, 17); } },
      flame: { name: '灵魂火焰', intent: { type: 'attack', dmg: 3, dmgAsc: 4, times: 3 }, run: async (C, e) => { await C.enemyAttack(e, 3, 4, 3); } },
    },
    // 恶咒 → 灵魂斩击 → 随机（灵魂斩击 权重2 / 灵魂火焰 不可连续）
    ai: (C, e, pick) => {
      if (!e.acted) { e.acted = true; return 'hex'; }
      if (e.moveKey === 'hex') return 'slash';
      const pool = [['slash', 2], ['flame', 1]].filter(([k]) => !(k === 'flame' && e.moveKey === 'flame'));
      return pick(pool);
    },
    // 恶咒：幽灵骑士存活时，你的所有卡牌都拥有「虚无」（由引擎在回合结束时判定）
    onDeath: async (C, e) => { delete C.player.powers.hex; C.emit(); return false; },
  },
  MAGI_KNIGHT: {
    name: '魔法骑士', icon: '🧙', hp: [82, 82], hpAsc: [89, 89], elite: true,
    moves: {
      shield: {
        name: '强力护盾', intent: { type: 'attack', dmg: 6, dmgAsc: 7 },
        run: async (C, e) => { await C.enemyAttack(e, 6, 7); await C.enemyBlock(e, C.asc >= 8 ? 9 : 5); },
      },
      dampen: { name: '抑制', intent: { type: 'debuff' }, run: async (C, e) => { await C.applyDampen(e); } },
      ram: { name: '撞击', intent: { type: 'attack', dmg: 10, dmgAsc: 11 }, run: async (C, e) => { await C.enemyAttack(e, 10, 11); } },
      prep: { name: '预备', intent: { type: 'defend', block: 5, blockAsc: 9 }, run: async (C, e) => { await C.enemyBlock(e, C.asc >= 8 ? 9 : 5); } },
      bomb: { name: '魔法炸弹', intent: { type: 'attack', dmg: 35, dmgAsc: 40 }, run: async (C, e) => { await C.enemyAttack(e, 35, 40); } },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'shield'; }
      return { shield: 'dampen', dampen: 'ram', ram: 'prep', prep: 'bomb', bomb: 'ram' }[e.moveKey] || 'shield';
    },
    // 抑制：魔法骑士存活期间，你的所有卡牌被降级；它倒下后恢复
    onDeath: async (C, e) => { C.clearDampen(e); return false; },
  },

  /* ================= 咬人卷轴 ================= */
  SCROLL_OF_BITING: {
    name: '咬人卷轴', icon: '📜', hp: [30, 37], hpAsc: [33, 39],
    onSpawn: (C, e) => { e.powers.paperCuts = 2; },
    moves: {
      chomp: { name: '大啃', intent: { type: 'attack', dmg: 14, dmgAsc: 16 }, run: async (C, e) => { await C.enemyAttack(e, 14, 16); } },
      teeth: { name: '更多牙齿', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2); } },
      chew: { name: '咀嚼', intent: { type: 'attack', dmg: 5, dmgAsc: 6, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 5, 6, 2); } },
    },
    // 起手由遭遇编组给的 starter 决定；大啃 → 更多牙齿 → 咀嚼 → 随机（大啃 1 / 咀嚼 2）
    ai: (C, e, pick) => {
      if (!e.acted) { e.acted = true; return ['chomp', 'chew', 'teeth'][e.starter ?? 0] || 'chomp'; }
      if (e.moveKey === 'chew') return pick([['chomp', 1], ['chew', 2]]);
      return { chomp: 'teeth', teeth: 'chew' }[e.moveKey] || 'chomp';
    },
  },

  /* ================= 史莱姆狂战士 ================= */
  SLIMED_BERSERKER: {
    name: '史莱姆狂战士', icon: '🟢', hp: [261, 261], hpAsc: [281, 281],
    moves: {
      vomit: { name: '呕吐脓液', intent: { type: 'status' }, run: async (C, e) => { await C.addCard('SLIMED', 'discard', false, 10); } },
      pummel: { name: '愤怒拍打', intent: { type: 'attack', dmg: 4, dmgAsc: 5, times: 4 }, run: async (C, e) => { await C.enemyAttack(e, 4, 5, 4); } },
      hug: {
        name: '吸血拥抱', intent: { type: 'debuff' },
        run: async (C, e) => { await C.addPower('weak', 3); await C.enemyPower(e, 'strength', 3); },
      },
      smother: { name: '窒息', intent: { type: 'attack', dmg: 30, dmgAsc: 33 }, run: async (C, e) => { await C.enemyAttack(e, 30, 33); } },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'vomit'; }
      return { vomit: 'pummel', pummel: 'hug', hug: 'smother', smother: 'vomit' }[e.moveKey] || 'vomit';
    },
  },

  /* ================= 灵魂枢纽（精英） ================= */
  SOUL_NEXUS: {
    name: '灵魂枢纽', icon: '🌀', hp: [234, 234], hpAsc: [254, 254], elite: true,
    moves: {
      burn: { name: '灵魂灼烧', intent: { type: 'attack', dmg: 29, dmgAsc: 31 }, run: async (C, e) => { await C.enemyAttack(e, 29, 31); } },
      maelstrom: { name: '大漩涡', intent: { type: 'attack', dmg: 6, dmgAsc: 7, times: 4 }, run: async (C, e) => { await C.enemyAttack(e, 6, 7, 4); } },
      drain: {
        name: '汲取生命', intent: { type: 'attack', dmg: 18, dmgAsc: 19 },
        run: async (C, e) => { await C.enemyAttack(e, 18, 19); await C.addPower('vulnerable', 2); await C.addPower('weak', 2); },
      },
    },
    // 灵魂灼烧起手；之后三招随机，且都不能连续重复
    ai: (C, e, pick) => {
      if (!e.acted) { e.acted = true; return 'burn'; }
      return pick([['burn', 1], ['maelstrom', 1], ['drain', 1]].filter(([k]) => k !== e.moveKey));
    },
  },

  /* ================= 失落之物 / 遗忘之物 ================= */
  THE_LOST: {
    name: '失落之物', icon: '🫥', hp: [93, 93], hpAsc: [99, 99],
    onSpawn: (C, e) => { e.powers.possessStrength = 1; e.stolenStr = 0; },
    moves: {
      smog: {
        name: '致残雾霾', intent: { type: 'debuff' },
        run: async (C, e) => { await C.addPower('strength', -2); e.stolenStr = (e.stolenStr || 0) + 2; await C.enemyPower(e, 'strength', 2); },
      },
      lasers: { name: '眼部激光', intent: { type: 'attack', dmg: 4, dmgAsc: 5, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 4, 5, 2); } },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'smog'; }
      return e.moveKey === 'smog' ? 'lasers' : 'smog';
    },
    // 抢夺力量：倒下时把偷走的力量还给你
    onDeath: async (C, e) => {
      if (e.stolenStr) { await C.addPower('strength', e.stolenStr); C.msg(`「抢夺力量」：${e.name} 归还了 ${e.stolenStr} 点力量`); }
      return false;
    },
  },
  THE_FORGOTTEN: {
    name: '遗忘之物', icon: '🕳️', hp: [106, 106], hpAsc: [111, 111],
    onSpawn: (C, e) => { e.powers.possessSpeed = 1; e.stolenDex = 0; },
    moves: {
      miasma: {
        name: '瘴气', intent: { type: 'debuff' },
        run: async (C, e) => {
          await C.addPower('dexterity', -2);
          e.stolenDex = (e.stolenDex || 0) + 2;
          await C.enemyBlock(e, 8);
          await C.enemyPower(e, 'dexterity', 2);
        },
      },
      dread: {
        name: '恐惧', intent: { type: 'attack', dmg: 13, dmgAsc: 15 },
        // 伤害额外加上自身当前敏捷（可为负）
        run: async (C, e) => { await C.enemyAttack(e, 13 + (e.powers.dexterity || 0), 15 + (e.powers.dexterity || 0)); },
      },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'miasma'; }
      return e.moveKey === 'miasma' ? 'dread' : 'miasma';
    },
    onDeath: async (C, e) => {
      if (e.stolenDex) { await C.addPower('dexterity', e.stolenDex); C.msg(`「抢夺速度」：${e.name} 归还了 ${e.stolenDex} 点敏捷`); }
      return false;
    },
  },

  /* ================= 活体盾 / 高塔炮手（弱怪） ================= */
  LIVING_SHIELD: {
    name: '活体盾', icon: '🛡️', hp: [55, 55], hpAsc: [65, 65],
    onSpawn: (C, e) => { e.powers.rampart = 25; },
    moves: {
      slam: { name: '盾击', intent: { type: 'attack', dmg: 6 }, run: async (C, e) => { await C.enemyAttack(e, 6, 6); } },
      smash: {
        name: '粉碎', intent: { type: 'attack', dmg: 16, dmgAsc: 18 },
        run: async (C, e) => { await C.enemyAttack(e, 16, 18); await C.enemyPower(e, 'strength', 3); },
      },
    },
    // 盾击起手；同伴还活着就继续盾击，只剩它自己就换成「粉碎」并一直粉碎
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'slam'; }
      const others = C.alive().filter(x => x !== e).length;
      if (others > 0) return 'slam';
      return 'smash';
    },
  },
  TURRET_OPERATOR: {
    name: '高塔炮手', icon: '🔫', hp: [41, 41], hpAsc: [51, 51],
    moves: {
      unload: { name: '弹雨！', intent: { type: 'attack', dmg: 3, dmgAsc: 4, times: 5 }, run: async (C, e) => { await C.enemyAttack(e, 3, 4, 5); } },
      unload2: { name: '弹雨！', intent: { type: 'attack', dmg: 3, dmgAsc: 4, times: 5 }, run: async (C, e) => { await C.enemyAttack(e, 3, 4, 5); } },
      reload: { name: '上弹', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 1); } },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'unload'; }
      return { unload: 'unload2', unload2: 'reload', reload: 'unload' }[e.moveKey] || 'unload';
    },
  },

  /* ================= 机甲骑士（精英） ================= */
  MECHA_KNIGHT: {
    name: '机甲骑士', icon: '🤖', hp: [300, 300], hpAsc: [320, 320], elite: true,
    onSpawn: (C, e) => { e.powers.artifact = 3; },
    moves: {
      charge: { name: '冲锋', intent: { type: 'attack', dmg: 25, dmgAsc: 30 }, run: async (C, e) => { await C.enemyAttack(e, 25, 30); } },
      flame: {
        name: '喷火器', intent: { type: 'attack', dmg: 8, dmgAsc: 12 },
        run: async (C, e) => { await C.enemyAttack(e, 8, 12); await C.addCard('BURN', 'hand', false, 4); },
      },
      windup: {
        name: '举起蓄力', intent: { type: 'defend', block: 15 },
        run: async (C, e) => { await C.enemyBlock(e, 15); await C.enemyPower(e, 'strength', 5); },
      },
      cleave: { name: '重斩', intent: { type: 'attack', dmg: 35, dmgAsc: 40 }, run: async (C, e) => { await C.enemyAttack(e, 35, 40); } },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'charge'; }
      return { charge: 'flame', flame: 'windup', windup: 'cleave', cleave: 'flame' }[e.moveKey] || 'charge';
    },
  },

  /* ================= 永世之镜（首领） ================= */
  AEONGLASS: {
    name: '永世之镜', icon: '🪞', hp: [512, 512], hpAsc: [535, 535], boss: true,
    onSpawn: (C, e) => {
      e.powers.artifact = 3;
      e.powers.witheringPresence = 6;   // 你每打出 6 张牌，加入 1 张「凋零」
      e.witherCardsPlayed = 0;
      e.witherUpgrades = 0;
      e.additionalStrength = 0;
    },
    moves: {
      ebb: {
        name: '落潮', intent: { type: 'attack', dmg: 22, dmgAsc: 26 },
        run: async (C, e) => { await C.enemyAttack(e, 22, 26); await C.enemyBlock(e, 33); },
      },
      eyeLasers: { name: '眼球激光', intent: { type: 'attack', dmg: 11, dmgAsc: 12, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 11, 12, 2); } },
      intensity: {
        name: '渐强', intent: { type: 'buff' },
        run: async (C, e) => {
          // 场上所有「凋零」假升级 1 级；随后层数 +1，新生成的凋零按新层数出场
          for (const c of [...C.drawPile, ...C.hand, ...C.discardPile, ...C.exhaustPile]) {
            if (c.id === 'WITHER') c.witherLevel = (c.witherLevel || 0) + 1;
          }
          e.witherUpgrades++;
          const made = await C.addCard('WITHER', 'discard', false, C.asc >= 9 ? 2 : 1);
          for (const c of made) c.witherLevel = e.witherUpgrades;
          C.emit();
          await C.enemyPower(e, 'strength', 3 + e.additionalStrength, 4 + e.additionalStrength);
          e.additionalStrength++;
        },
      },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'ebb'; }
      return { ebb: 'eyeLasers', eyeLasers: 'intensity', intensity: 'ebb' }[e.moveKey] || 'ebb';
    },
    // 凋零气场：每打出 N 张牌，塞 1 张凋零进手牌
    onPlayerCardPlayed: async (C, e) => {
      const n = e.powers.witheringPresence || 0;
      if (!n) return;
      e.witherCardsPlayed = (e.witherCardsPlayed || 0) + 1;
      if (e.witherCardsPlayed < n) return;
      e.witherCardsPlayed = 0;
      const made = await C.addCard('WITHER', 'hand', false, 1);
      for (const c of made) c.witherLevel = e.witherUpgrades || 0;
      C.emit();
    },
  },

  /* ================= 女王 + 火炬头聚合体（首领，两个部件） ================= */
  TORCH_HEAD_AMALGAM: {
    name: '火炬头聚合体', icon: '🔥', hp: [199, 199], hpAsc: [211, 211], minion: true,
    moves: {
      strongTackle: { name: '强力冲撞', intent: { type: 'attack', dmg: 26, dmgAsc: 32 }, run: async (C, e) => { await C.enemyAttack(e, 26, 32); } },
      tackle: { name: '冲撞', intent: { type: 'attack', dmg: 18, dmgAsc: 22 }, run: async (C, e) => { await C.enemyAttack(e, 18, 22); } },
      beam: { name: '光束', intent: { type: 'attack', dmg: 8, times: 3 }, run: async (C, e) => { await C.enemyAttack(e, 8, 8, 3); } },
      weakTackle: { name: '虚弱冲撞', intent: { type: 'attack', dmg: 14, dmgAsc: 16 }, run: async (C, e) => { await C.enemyAttack(e, 14, 16); } },
    },
    // 强力冲撞 → 冲撞 → 光束 → 虚弱冲撞 → 虚弱冲撞 → 光束 → 虚弱冲撞 …
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'strongTackle'; }
      e.tackleStep = (e.tackleStep || 0) + 1;
      if (e.tackleStep === 1) return 'tackle';
      return ['beam', 'weakTackle', 'weakTackle'][(e.tackleStep - 2) % 3];
    },
  },
  QUEEN: {
    name: '女王', icon: '👑', hp: [400, 400], hpAsc: [419, 419], boss: true,
    onSpawn: (C, e) => { e.amalgamDead = false; },
    moves: {
      puppetStrings: {
        name: '傀儡丝线', intent: { type: 'debuff' },
        run: async (C, e) => { await C.addPower('chainsOfBinding', 3); },
      },
      youAreMine: {
        name: '你是我的了', intent: { type: 'debuff' },
        run: async (C, e) => { await C.addPower('frail', 99); await C.addPower('weak', 99); await C.addPower('vulnerable', 99); },
      },
      burnBright: {
        name: '为我尽力燃烧吧', intent: { type: 'defend', block: 20 },
        run: async (C, e) => {
          for (const ally of C.alive()) {
            if (ally === e) continue;
            await C.enemyPower(ally, 'strength', 1);
          }
          await C.enemyBlock(e, 20);
        },
      },
      offWithYourHead: { name: '将头砍下', intent: { type: 'attack', dmg: 3, dmgAsc: 4, times: 5 }, run: async (C, e) => { await C.enemyAttack(e, 3, 4, 5); } },
      execution: { name: '处决', intent: { type: 'attack', dmg: 15, dmgAsc: 18 }, run: async (C, e) => { await C.enemyAttack(e, 15, 18); } },
      enrage: { name: '暴怒', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2); } },
    },
    // 聚合体还活着就反复「为我尽力燃烧吧」；它一倒下立刻转为 将头砍下 → 处决 → 暴怒 → 循环
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'puppetStrings'; }
      if (e.moveKey === 'puppetStrings') return 'youAreMine';
      if (e.moveKey === 'youAreMine' || e.moveKey === 'burnBright') {
        return e.amalgamDead ? 'offWithYourHead' : 'burnBright';
      }
      return { offWithYourHead: 'execution', execution: 'enrage', enrage: 'offWithYourHead' }[e.moveKey] || 'offWithYourHead';
    },
    // 聚合体死亡：标记，并让已经排好的「为我尽力燃烧吧」立刻变成「暴怒」
    onAllyDeath: async (C, e, dead) => {
      if (dead.id !== 'TORCH_HEAD_AMALGAM') return;
      e.amalgamDead = true;
      if (e.moveKey === 'burnBright') e.moveKey = 'enrage';
      C.msg(`「${e.name}」失去了聚合体，勃然大怒`);
      C.emit();
    },
  },

  /* ================= 实验体（首领，三形态） ================= */
  TEST_SUBJECT: {
    name: '实验体', icon: '🧬', hp: [100, 100], hpAsc: [111, 111], boss: true,
    onSpawn: (C, e) => {
      e.powers.adaptable = 1;
      e.powers.enrage = C.asc >= 9 ? 3 : 2;
      e.respawns = 0;
      e.extraClaw = 0;
      e.testPhase = 1;
    },
    moves: {
      bite: { name: '啃咬', intent: { type: 'attack', dmg: 20, dmgAsc: 22 }, run: async (C, e) => { await C.enemyAttack(e, 20, 22); } },
      skullBash: {
        name: '颅骨重击', intent: { type: 'attack', dmg: 14, dmgAsc: 16 },
        run: async (C, e) => { await C.enemyAttack(e, 14, 16); await C.addPower('vulnerable', 1); },
      },
      multiClaw: {
        name: '多爪攻击', intent: { type: 'attack', dmg: 10, dmgAsc: 11, times: 3 },
        run: async (C, e) => { await C.enemyAttack(e, 10, 11, 3 + e.extraClaw); e.extraClaw++; },
      },
      lacerate: { name: '裂伤', intent: { type: 'attack', dmg: 10, dmgAsc: 11, times: 3 }, run: async (C, e) => { await C.enemyAttack(e, 10, 11, 3); } },
      bigPounce: { name: '猛扑', intent: { type: 'attack', dmg: 45 }, run: async (C, e) => { await C.enemyAttack(e, 45, 45); } },
      burningGrowl: {
        name: '燃烧咆哮', intent: { type: 'status' },
        run: async (C, e) => {
          await C.addCard('BURN', 'discard', false, C.asc >= 9 ? 5 : 3);
          await C.enemyPower(e, 'strength', 2, 3);
        },
      },
      respawn: { name: '重生', intent: { type: 'buff' }, run: async () => {} },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'bite'; }
      if (e.moveKey === 'respawn') return e.respawns >= 2 ? 'lacerate' : 'multiClaw';
      if (e.testPhase === 1) return e.moveKey === 'bite' ? 'skullBash' : 'bite';
      if (e.testPhase === 2) return 'multiClaw';
      return { lacerate: 'bigPounce', bigPounce: 'burningGrowl', burningGrowl: 'lacerate' }[e.moveKey] || 'lacerate';
    },
    // 适者生存：两次「倒下」都会复活成更强的形态
    onDeath: async (C, e) => {
      if ((e.respawns || 0) >= 2) return false;
      e.respawns++;
      if (e.respawns === 1) {
        e.testPhase = 2;
        e.maxHp = C.asc >= 8 ? 212 : 200;
        e.hp = e.maxHp;
        e.powers.painfulStabs = 1;
        C.msg(`${e.name} 重组了躯体，站了起来`);
      } else {
        e.testPhase = 3;
        e.maxHp = C.asc >= 8 ? 313 : 300;
        e.hp = e.maxHp;
        delete e.powers.adaptable;
        delete e.powers.painfulStabs;
        e.powers.nemesis = 1;
        e.nemesisOn = false;
        C.msg(`${e.name} 现出了最后的形态`);
      }
      e.moveKey = 'respawn';   // 复活当回合不攻击
      C.emit();
      return true;             // 没有真正倒下
    },
    onTurnEnd: async (C, e) => {
      // 天罚：每两个回合结束时获得/移除 1 层无实体
      if (!e.powers.nemesis) return;
      e.nemesisOn = !e.nemesisOn;
      if (e.nemesisOn) { e.powers.intangible = 1; C.msg(`${e.name} 变得无实体`); }
      else { delete e.powers.intangible; }
      C.emit();
    },
  },

  /* ---- 事件专用敌人（不进随机遭遇表） ---- */
  // 灯火钥匙：连枷骑士的强化版（+6 力量、+6 覆甲）
  MYSTERIOUS_KNIGHT: {
    name: '神秘骑士', icon: '🗡️', hp: [101, 101], hpAsc: [108, 108],
    onSpawn: (C, e) => { e.powers.strength = (e.powers.strength || 0) + 6; e.powers.plating = (e.powers.plating || 0) + 6; },
    moves: {
      chant: { name: '战吼', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 3); } },
      flail: { name: '连枷', intent: { type: 'attack', dmg: 9, dmgAsc: 10, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 9, 10, 2); } },
      ram: { name: '撞击', intent: { type: 'attack', dmg: 15, dmgAsc: 17 }, run: async (C, e) => { await C.enemyAttack(e, 15, 17); } },
    },
    ai: (C, e, pick) => {
      if (!e.acted) { e.acted = true; return 'ram'; }
      const pool = [['chant', 1], ['flail', 2], ['ram', 2]].filter(([k]) => k !== e.moveKey || k !== 'chant');
      return pick(pool);
    },
  },
  // 战痕累累的训练假人：只会站着挨打，3 个自己的回合后溜走
  BATTLE_FRIEND_V1: {
    name: '战斗好伙伴V1.0', icon: '🎯', hp: [75, 75], hpAsc: [75, 75],
    onSpawn: (C, e) => { e.dummyTurns = 0; },
    moves: { nothing: { name: '无', intent: { type: 'stun' }, run: async () => {} } },
    ai: () => 'nothing',
    onTurnEnd: async (C, e) => {
      e.dummyTurns = (e.dummyTurns || 0) + 1;
      if (e.dummyTurns >= 3) await C.escapeEnemy(e);
    },
  },
  BATTLE_FRIEND_V2: {
    name: '战斗好伙伴V2.0', icon: '🎯', hp: [150, 150], hpAsc: [150, 150],
    onSpawn: (C, e) => { e.dummyTurns = 0; },
    moves: { nothing: { name: '无', intent: { type: 'stun' }, run: async () => {} } },
    ai: () => 'nothing',
    onTurnEnd: async (C, e) => {
      e.dummyTurns = (e.dummyTurns || 0) + 1;
      if (e.dummyTurns >= 3) await C.escapeEnemy(e);
    },
  },
  BATTLE_FRIEND_V3: {
    name: '战斗好伙伴V3.0', icon: '🎯', hp: [300, 300], hpAsc: [300, 300],
    onSpawn: (C, e) => { e.dummyTurns = 0; },
    moves: { nothing: { name: '无', intent: { type: 'stun' }, run: async () => {} } },
    ai: () => 'nothing',
    onTurnEnd: async (C, e) => {
      e.dummyTurns = (e.dummyTurns || 0) + 1;
      if (e.dummyTurns >= 3) await C.escapeEnemy(e);
    },
  },
};

/** 组装师召唤子机体：场上同伴 <4 时才召唤，且不连续召唤同一种 */
async function fabricateBot(C, e, choices) {
  const living = C.alive().filter((x) => x !== e).length;
  if (living >= 4) return;
  const avail = choices.filter((id) => id !== e.lastBot);
  const pick = avail.length ? C.rng.pick(avail) : choices[0];
  e.lastBot = pick;
  await C.spawnEnemy(pick, e);
}

/**
 * 第三幕遭遇编组 —— 顺序与 Glory.CreateAllEncounters 一致。
 * weak 为 true 的属于弱怪池（本幕前 2 场战斗）。
 */
export const GLORY_ENCOUNTERS = {
  monster: [
    { id: 'AXEBOTS_NORMAL', weak: false, units: [['AXEBOT']], slots: ['front'] },
    {
      id: 'CONSTRUCT_MENAGERIE_NORMAL', weak: false,
      units: [['PUNCH_CONSTRUCT', 'CUBEX_CONSTRUCT', 'CUBEX_CONSTRUCT']], slots: [null, null, null],
    },
    { id: 'DEVOTED_SCULPTOR_WEAK', weak: true, units: [['DEVOTED_SCULPTOR']], slots: [null] },
    { id: 'FABRICATOR_NORMAL', weak: false, units: [['FABRICATOR']], slots: ['fabricator'] },
    { id: 'FROG_KNIGHT_NORMAL', weak: false, units: [['FROG_KNIGHT']], slots: [null] },
    { id: 'GLOBE_HEAD_NORMAL', weak: false, units: [['GLOBE_HEAD']], slots: [null] },
    { id: 'OWL_MAGISTRATE_NORMAL', weak: false, units: [['OWL_MAGISTRATE']], slots: [null] },
    {
      id: 'SCROLLS_OF_BITING_NORMAL', weak: false, units: [['SCROLL_OF_BITING']],
      // 4 张卷轴：起手招式按随机起点错开，第 4 张固定从「更多牙齿」开始
      build: (C) => {
        const start = C.rng.int(3);
        return [0, 1, 2, 3].map((i) => ({ id: 'SCROLL_OF_BITING', extra: { starter: i === 3 ? 2 : (start + i) % 3 } }));
      },
      slots: [null, null, null, null],
    },
    {
      id: 'SCROLLS_OF_BITING_WEAK', weak: true, units: [['SCROLL_OF_BITING']],
      build: (C) => {
        const start = C.rng.int(3);
        return [0, 1, 2].map((i) => ({ id: 'SCROLL_OF_BITING', extra: { starter: (start + i) % 3 } }));
      },
      slots: [null, null, null],
    },
    { id: 'SLIMED_BERSERKER_NORMAL', weak: false, units: [['SLIMED_BERSERKER']], slots: [null] },
    {
      id: 'THE_LOST_AND_FORGOTTEN_NORMAL', weak: false,
      units: [['THE_LOST', 'THE_FORGOTTEN']], slots: [null, null],
    },
    {
      id: 'TURRET_OPERATOR_WEAK', weak: true,
      units: [['LIVING_SHIELD', 'TURRET_OPERATOR']], slots: [null, null],
    },
  ],
  elite: [
    {
      id: 'KNIGHTS_ELITE', units: [['FLAIL_KNIGHT', 'SPECTRAL_KNIGHT', 'MAGI_KNIGHT']],
      slots: ['first', 'second', 'third'],
    },
    { id: 'MECHA_KNIGHT_ELITE', units: [['MECHA_KNIGHT']], slots: [null] },
    { id: 'SOUL_NEXUS_ELITE', units: [['SOUL_NEXUS']], slots: [null] },
  ],
  boss: [
    { id: 'AEONGLASS_BOSS', units: [['AEONGLASS']], slots: [null] },
    { id: 'QUEEN_BOSS', units: [['TORCH_HEAD_AMALGAM', 'QUEEN']], slots: ['amalgam', 'queen'] },
    { id: 'TEST_SUBJECT_BOSS', units: [['TEST_SUBJECT']], slots: [null] },
  ],
};

/** 第三幕弱怪池场数（Glory.NumberOfWeakEncounters） */
export const GLORY_WEAK_COUNT = 2;
