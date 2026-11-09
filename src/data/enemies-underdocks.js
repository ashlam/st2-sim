import { POWERS } from './powers.js';

/* =========================================================================
   第一幕 · 海底（Underdocks）的怪物与遭遇
   数值与招式对照 sts2-sim 的 Models/Monsters/*.cs，
   中文名与招式名取自官方 zhs 本地化（monsters.json）。
   进阶对应：ToughEnemies(A8) → 生命值，DeadlyEnemies(A9) → 伤害。
   ========================================================================= */

const pickNoRepeat = (pick, e, pairs) => {
  const pool = pairs.filter(([k]) => k !== e.moveKey);
  return pick(pool.length ? pool : pairs);
};

export const UNDERDOCK_ENEMIES = {
  /* ---------------- 普通 ---------------- */

  CORPSE_SLUG: {
    name: '噬尸蛞蝓', icon: '🐌', hp: [25, 27], hpAsc: [27, 29],
    onSpawn: (C, e) => {
      // 饥饿（RavenousPower）：有同伴倒下时吃掉尸体，本回合被击晕并变强
      e.powers.ravenous = C.asc >= 9 ? 5 : 4;
      if (e.starterIdx == null) e.starterIdx = 0;
    },
    moves: {
      whip: {
        name: '鞭打', intent: { type: 'attack', dmg: 3, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 3, null, 2); },
      },
      glomp: {
        name: '啃食', intent: { type: 'attack', dmg: 8, dmgAsc: 9 },
        run: async (C, e) => { await C.enemyAttack(e, 8, 9); },
      },
      goop: {
        name: '黏液', intent: { type: 'debuff' },
        run: async (C, e) => { await C.addPower('frail', 2, C.player); },
      },
      stun: { name: '被击晕', intent: { type: 'stun' }, run: async () => {} },
    },
    ai: (C, e) => {
      if (e.moveKey === 'stun') return e.stunReturn || 'whip';
      if (!e.acted) {
        e.acted = true;
        return ['whip', 'glomp', 'goop'][e.starterIdx % 3];
      }
      return { whip: 'glomp', glomp: 'goop', goop: 'whip' }[e.moveKey] || 'whip';
    },
    // 同伴倒下：吃掉尸体 → 变强并在本回合被击晕
    onAllyDeath: async (C, e, dead) => {
      if (!e.alive || !e.powers.ravenous) return;
      e.stunReturn = { whip: 'glomp', glomp: 'goop', goop: 'whip' }[e.moveKey] || 'whip';
      e.pendingStun = true;
      await C.addPower('strength', e.powers.ravenous, e);
      C.msg(`${e.name} 吞下了 ${dead.name} 的尸体`);
    },
  },

  CALCIFIED_CULTIST: {
    name: '钙化邪教徒', icon: '🦴', hp: [38, 41], hpAsc: [39, 42],
    moves: {
      incantation: {
        name: '念咒', intent: { type: 'buff' },
        run: async (C, e) => { await C.enemyPower(e, 'ritual', 2); e.ritualSkip = 1; },
      },
      darkStrike: {
        name: '黑暗打击', intent: { type: 'attack', dmg: 9, dmgAsc: 11 },
        run: async (C, e) => { await C.enemyAttack(e, 9, 11); },
      },
    },
    ai: (C, e) => (!e.acted ? ((e.acted = true), 'incantation') : 'darkStrike'),
  },

  DAMP_CULTIST: {
    name: '潮湿邪教徒', icon: '🕯️', hp: [51, 53], hpAsc: [52, 54],
    moves: {
      incantation: {
        name: '念咒', intent: { type: 'buff' },
        run: async (C, e) => { await C.enemyPower(e, 'ritual', 5, 6); e.ritualSkip = 1; },
      },
      darkStrike: {
        name: '黑暗打击', intent: { type: 'attack', dmg: 1, dmgAsc: 3 },
        run: async (C, e) => { await C.enemyAttack(e, 1, 3); },
      },
    },
    ai: (C, e) => (!e.acted ? ((e.acted = true), 'incantation') : 'darkStrike'),
  },

  FOSSIL_STALKER: {
    name: '化石追踪者', icon: '🐛', hp: [51, 53], hpAsc: [54, 56],
    onSpawn: (C, e) => { e.powers.suck = 3; },
    moves: {
      latch: {
        name: '缠上', intent: { type: 'attack', dmg: 12, dmgAsc: 14 },
        run: async (C, e) => { await C.enemyAttack(e, 12, 14); },
      },
      tackle: {
        name: '冲撞', intent: { type: 'attack', dmg: 9, dmgAsc: 11 },
        run: async (C, e) => {
          await C.enemyAttack(e, 9, 11);
          await C.addPower('frail', 1, C.player);
        },
      },
      lash: {
        name: '甩动', intent: { type: 'attack', dmg: 3, dmgAsc: 4, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 3, 4, 2); },
      },
    },
    // 起手固定「缠上」，之后三招等权重随机
    ai: (C, e, pick) => {
      if (!e.acted) { e.acted = true; return 'latch'; }
      return pick([['latch', 1], ['tackle', 1], ['lash', 1]]);
    },
  },

  GREMLIN_MERC: {
    name: '地精佣兵', icon: '👺', hp: [47, 49], hpAsc: [51, 53],
    onSpawn: (C, e) => {
      e.powers.surprise = 1;   // 死亡时叫来同伴
      e.stolenGold = 0;
    },
    moves: {
      gimme: {
        name: '拿来', intent: { type: 'attack', dmg: 7, dmgAsc: 8, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 7, 8, 2); await C.stealGold(e, 20); },
      },
      smash: {
        name: '双重猛击', intent: { type: 'attack', dmg: 6, dmgAsc: 7, times: 2 },
        run: async (C, e) => {
          await C.enemyAttack(e, 6, 7, 2);
          await C.stealGold(e, 20);
          await C.addPower('weak', 2, C.player);
        },
      },
      hehe: {
        name: '嘿嘿', intent: { type: 'attack', dmg: 8, dmgAsc: 9 },
        run: async (C, e) => {
          await C.enemyAttack(e, 8, 9);
          await C.stealGold(e, 20);
          await C.addPower('strength', 2, e);
        },
      },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'gimme'; }
      return { gimme: 'smash', smash: 'hehe', hehe: 'gimme' }[e.moveKey] || 'gimme';
    },
    // 意外：倒地时放出胖地精与鬼祟地精，并把偷走的金币交给胖地精
    onDeath: async (C, e) => {
      if (e.surprised) return false;
      e.surprised = true;
      C.msg(`${e.name} 的同伴从暗处窜了出来！`);
      const fat = await C.spawnEnemy('FAT_GREMLIN', e, { slot: 'fat' });
      fat.stolenGold = e.stolenGold || 0;
      const sneaky = await C.spawnEnemy('SNEAKY_GREMLIN', e, { slot: 'sneaky' });
      sneaky.moveKey = 'spawned';
      e.stolenGold = 0;
      return false;
    },
  },

  SNEAKY_GREMLIN: {
    name: '鬼祟地精', icon: '🥷', hp: [10, 14], hpAsc: [11, 15],
    moves: {
      spawned: { name: '登场', intent: { type: 'stun' }, run: async () => {} },
      tackle: {
        name: '冲撞', intent: { type: 'attack', dmg: 9, dmgAsc: 10 },
        run: async (C, e) => { await C.enemyAttack(e, 9, 10); },
      },
    },
    ai: (C, e) => (e.moveKey === 'spawned' ? 'tackle' : 'tackle'),
  },

  FAT_GREMLIN: {
    name: '胖地精', icon: '💰', hp: [13, 17], hpAsc: [14, 18],
    moves: {
      spawned: { name: '登场', intent: { type: 'stun' }, run: async () => {} },
      flee: { name: '逃跑', intent: { type: 'escape' }, run: async (C, e) => { await C.escapeEnemy(e); } },
    },
    ai: (C, e) => (e.moveKey === 'spawned' ? 'flee' : 'flee'),
    // 打死胖地精就能把被偷的金币拿回来
    onDeath: async (C, e) => {
      if (e.stolenGold > 0) {
        C.run.gold += e.stolenGold;
        C.msg(`取回了被偷走的 ${e.stolenGold} 金币`);
        e.stolenGold = 0;
        C.emit();
      }
      return false;
    },
  },

  HAUNTED_SHIP: {
    name: '幽灵船', icon: '⛵', hp: [63, 63], hpAsc: [67, 67],
    moves: {
      haunt: {
        name: '纠缠', intent: { type: 'status' },
        run: async (C, e) => {
          await C.addPower('weak', 3, C.player);
          await C.addCard('DAZED', 'discard', false, 5);
        },
      },
      swipe: {
        name: '扫击', intent: { type: 'attack', dmg: 13, dmgAsc: 14 },
        run: async (C, e) => { await C.enemyAttack(e, 13, 14); },
      },
      stomp: {
        name: '践踏', intent: { type: 'attack', dmg: 4, dmgAsc: 5, times: 3 },
        run: async (C, e) => { await C.enemyAttack(e, 4, 5, 3); },
      },
    },
    // 纠缠 → 扫击 → 践踏 → 扫击 …
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'haunt'; }
      return { haunt: 'swipe', swipe: 'stomp', stomp: 'swipe' }[e.moveKey] || 'swipe';
    },
  },

  LIVING_FOG: {
    name: '活雾', icon: '🌫️', hp: [80, 80], hpAsc: [82, 82],
    moves: {
      advancedGas: {
        name: '高级毒气', intent: { type: 'attack', dmg: 8, dmgAsc: 9 },
        run: async (C, e) => {
          await C.enemyAttack(e, 8, 9);
          await C.addPower('smoggy', 1, C.player);
        },
      },
      bloat: {
        name: '膨胀', intent: { type: 'attack', dmg: 5, dmgAsc: 6 },
        run: async (C, e) => {
          // 在空着的炸弹槽位里放一枚气态炸弹
          const free = ['bomb1', 'bomb2', 'bomb3', 'bomb4', 'bomb5']
            .find((s) => !C.enemies.some((o) => o.alive && o.slot === s));
          if (free) await C.spawnEnemy('GAS_BOMB', e, { slot: free });
          await C.enemyAttack(e, 5, 6);
        },
      },
      superGas: {
        name: '超级毒气冲击', intent: { type: 'attack', dmg: 8, dmgAsc: 9 },
        run: async (C, e) => { await C.enemyAttack(e, 8, 9); },
      },
    },
    // 高级毒气 → 膨胀 → 超级毒气 → 膨胀 → 超级毒气 …
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'advancedGas'; }
      return { advancedGas: 'bloat', bloat: 'superGas', superGas: 'bloat' }[e.moveKey] || 'bloat';
    },
  },

  GAS_BOMB: {
    name: '气态炸弹', icon: '💣', hp: [7, 7], hpAsc: [8, 8], minion: true,
    moves: {
      explode: {
        name: '爆炸', intent: { type: 'attack', dmg: 8, dmgAsc: 9 },
        run: async (C, e) => {
          await C.enemyAttack(e, 8, 9);
          e.hp = 0;
          await C.killEnemy(e);
        },
      },
    },
    ai: () => 'explode',
  },

  SEAPUNK: {
    name: '海洋混混', icon: '🌊', hp: [44, 46], hpAsc: [47, 49],
    moves: {
      seaKick: {
        name: '海洋踢', intent: { type: 'attack', dmg: 11, dmgAsc: 13 },
        run: async (C, e) => { await C.enemyAttack(e, 11, 13); },
      },
      spinningKick: {
        name: '回旋踢', intent: { type: 'attack', dmg: 2, times: 4 },
        run: async (C, e) => { await C.enemyAttack(e, 2, null, 4); },
      },
      bubbleBurp: {
        name: '吐泡泡', intent: { type: 'defend', block: 7 },
        run: async (C, e) => {
          await C.enemyBlock(e, C.asc >= 8 ? 8 : 7);
          await C.enemyPower(e, 'strength', 1, 2);
        },
      },
    },
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'seaKick'; }
      return { seaKick: 'spinningKick', spinningKick: 'bubbleBurp', bubbleBurp: 'seaKick' }[e.moveKey] || 'seaKick';
    },
  },

  SEWER_CLAM: {
    name: '下水道蚌', icon: '🦪', hp: [56, 56], hpAsc: [58, 58],
    onSpawn: (C, e) => { e.powers.plating = C.asc >= 8 ? 9 : 8; },
    moves: {
      pressurize: {
        name: '增压', intent: { type: 'buff' },
        run: async (C, e) => { await C.enemyPower(e, 'strength', 4); },
      },
      jet: {
        name: '喷射', intent: { type: 'attack', dmg: 10, dmgAsc: 11 },
        run: async (C, e) => { await C.enemyAttack(e, 10, 11); },
      },
    },
    // 起手喷射，然后 增压 → 喷射 → 增压 …
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'jet'; }
      return e.moveKey === 'jet' ? 'pressurize' : 'jet';
    },
  },

  TWO_TAILED_RAT: {
    name: '双尾鼠', icon: '🐀', hp: [17, 21], hpAsc: [18, 22],
    onSpawn: (C, e) => {
      e.summonTimer = 2;
      e.callCount = 0;
      e.starterIdx = e.starterIdx ?? null;
    },
    moves: {
      scratch: {
        name: '抓挠', intent: { type: 'attack', dmg: 8, dmgAsc: 9 },
        run: async (C, e) => { e.summonTimer--; await C.enemyAttack(e, 8, 9); },
      },
      disease: {
        name: '疾病啃咬', intent: { type: 'attack', dmg: 6, dmgAsc: 7 },
        run: async (C, e) => { e.summonTimer--; await C.enemyAttack(e, 6, 7); },
      },
      screech: {
        name: '尖声嘶吼', intent: { type: 'debuff' },
        run: async (C, e) => { e.summonTimer--; await C.addPower('frail', 1, C.player); },
      },
      call: {
        name: '呼唤后援', intent: { type: 'summon' },
        run: async (C, e) => {
          const free = ['first', 'second', 'third', 'fourth', 'fifth']
            .filter((s) => !C.enemies.some((o) => o.alive && o.slot === s));
          const slot = free[free.length - 1];
          if (slot) await C.spawnEnemy('TWO_TAILED_RAT', e, { slot, starterIdx: 0 });
          const n = Math.max(...C.alive().filter((o) => o.id === 'TWO_TAILED_RAT').map((o) => o.callCount || 0), 0) + 1;
          for (const r of C.alive()) if (r.id === 'TWO_TAILED_RAT') r.callCount = n;
        },
      },
    },
    ai: (C, e, pick) => {
      if (!e.acted) {
        e.acted = true;
        if (e.starterIdx != null) return ['scratch', 'disease', 'screech'][e.starterIdx % 3];
      }
      if (!e.alive) return 'scratch';
      const free = ['first', 'second', 'third', 'fourth', 'fifth']
        .some((s) => !C.enemies.some((o) => o.alive && o.slot === s));
      const maxCalls = Math.max(0, ...C.alive().filter((o) => o.id === 'TWO_TAILED_RAT').map((o) => o.callCount || 0));
      const otherCalling = C.alive().some((o) => o !== e && o.id === 'TWO_TAILED_RAT' && o.moveKey === 'call');
      const canSummon = e.summonTimer <= 0 && maxCalls < 3 && free && !otherCalling;
      if (canSummon) {
        return pick([['scratch', 1], ['disease', 1], ['screech', 3], ['call', 9]]);
      }
      return pickNoRepeat(pick, e, [['scratch', 1], ['disease', 1], ['screech', 3]]);
    },
  },

  TOADPOLE: {
    name: '蟾蜍蝌蚪', icon: '🐸', hp: [21, 25], hpAsc: [22, 26],
    moves: {
      spiken: {
        name: '带刺', intent: { type: 'buff' },
        run: async (C, e) => { await C.enemyPower(e, 'thorns', 2); },
      },
      spikeSpit: {
        name: '吐刺', intent: { type: 'attack', dmg: 3, dmgAsc: 4, times: 3 },
        run: async (C, e) => {
          await C.addPower('thorns', -2, e);
          await C.enemyAttack(e, 3, 4, 3);
        },
      },
      whirl: {
        name: '旋转', intent: { type: 'attack', dmg: 7, dmgAsc: 8 },
        run: async (C, e) => { await C.enemyAttack(e, 7, 8); },
      },
    },
    // 前排先「带刺」，后排先「旋转」；之后 带刺 → 吐刺 → 旋转 → 带刺 …
    ai: (C, e) => {
      if (!e.acted) {
        e.acted = true;
        return e.isFront ? 'spiken' : 'whirl';
      }
      return { whirl: 'spiken', spiken: 'spikeSpit', spikeSpit: 'whirl' }[e.moveKey] || 'whirl';
    },
  },

  SLUDGE_SPINNER: {
    name: '淤泥旋螺', icon: '🌀', hp: [37, 39], hpAsc: [41, 42],
    moves: {
      oil: {
        name: '喷油', intent: { type: 'attack', dmg: 8, dmgAsc: 9 },
        run: async (C, e) => {
          await C.enemyAttack(e, 8, 9);
          await C.addPower('weak', 1, C.player);
        },
      },
      slam: {
        name: '砸击', intent: { type: 'attack', dmg: 11, dmgAsc: 12 },
        run: async (C, e) => { await C.enemyAttack(e, 11, 12); },
      },
      rage: {
        name: '狂怒', intent: { type: 'attack', dmg: 6, dmgAsc: 7 },
        run: async (C, e) => {
          await C.enemyAttack(e, 6, 7);
          await C.enemyPower(e, 'strength', 3);
        },
      },
    },
    ai: (C, e, pick) => {
      if (!e.acted) { e.acted = true; return 'oil'; }
      return pickNoRepeat(pick, e, [['oil', 1], ['slam', 1], ['rage', 1]]);
    },
  },

  /* ---------------- 精英 ---------------- */

  PHANTASMAL_GARDENER: {
    name: '花园幽灵鳗', icon: '🌿', hp: [26, 31], hpAsc: [27, 32], elite: true,
    onSpawn: (C, e) => { e.powers.skittish = C.asc >= 8 ? 7 : 6; e.skittishUsed = false; },
    // 胆小：每回合第一次被命中时获得格挡
    onDamaged: async (C, e, d) => {
      if (e.skittishUsed || !d.isAttack || !d.unblocked || !e.powers.skittish) return;
      e.skittishUsed = true;
      await C.enemyBlock(e, e.powers.skittish);
    },
    onPlayerTurnStart: (C, e) => { e.skittishUsed = false; },
    moves: {
      bite: {
        name: '啃咬', intent: { type: 'attack', dmg: 5 },
        run: async (C, e) => { await C.enemyAttack(e, 5); },
      },
      lash: {
        name: '甩动', intent: { type: 'attack', dmg: 7 },
        run: async (C, e) => { await C.enemyAttack(e, 7); },
      },
      flail: {
        name: '猛晃', intent: { type: 'attack', dmg: 1, times: 3 },
        run: async (C, e) => { await C.enemyAttack(e, 1, null, 3); },
      },
      enlarge: {
        name: '变大', intent: { type: 'buff' },
        run: async (C, e) => { await C.enemyPower(e, 'strength', 2, 3); },
      },
    },
    // 起手按站位错开：first=猛晃 second=啃咬 third=甩动 fourth=变大
    ai: (C, e) => {
      if (!e.acted) {
        e.acted = true;
        return { first: 'flail', second: 'bite', third: 'lash', fourth: 'enlarge' }[e.slot] || 'bite';
      }
      return { bite: 'lash', lash: 'flail', flail: 'enlarge', enlarge: 'bite' }[e.moveKey] || 'bite';
    },
  },

  SKULKING_COLONY: {
    name: '鬼祟珊瑚群', icon: '🪸', hp: [75, 75], hpAsc: [80, 80], elite: true,
    onSpawn: (C, e) => { e.powers.hardenedShell = 20; e.shellLost = 0; },
    // 硬化外壳：每回合最多失去 20 点生命
    damageCap: (C, e) => Math.max(0, (e.powers.hardenedShell || 20) - (e.shellLost || 0)),
    onDamaged: (C, e, d) => { e.shellLost = (e.shellLost || 0) + d.unblocked; },
    onPlayerTurnStart: (C, e) => { e.shellLost = 0; },
    moves: {
      zoom: {
        name: '猛冲', intent: { type: 'attack', dmg: 14, dmgAsc: 16 },
        run: async (C, e) => { await C.enemyAttack(e, 14, 16); },
      },
      zoom2: {
        name: '猛冲', intent: { type: 'attack', dmg: 14, dmgAsc: 16 },
        run: async (C, e) => { await C.enemyAttack(e, 14, 16); },
      },
      inertia: {
        name: '惯性', intent: { type: 'attack', dmg: 9, dmgAsc: 11 },
        run: async (C, e) => {
          await C.enemyAttack(e, 9, 11);
          await C.enemyPower(e, 'strength', 2, 4);
        },
      },
      stabs: {
        name: '穿刺', intent: { type: 'attack', dmg: 7, dmgAsc: 8, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 7, 8, 2); },
      },
    },
    // 猛冲 → 猛冲 → 惯性 → 穿刺 → 猛冲 …
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'zoom'; }
      return { zoom: 'zoom2', zoom2: 'inertia', inertia: 'stabs', stabs: 'zoom' }[e.moveKey] || 'zoom';
    },
  },

  TERROR_EEL: {
    name: '骇鳗', icon: '🦈', hp: [140, 140], hpAsc: [150, 150], elite: true,
    onSpawn: (C, e) => { e.powers.shriek = C.asc >= 8 ? 75 : 70; },
    // 尖叫：生命值第一次跌破阈值时被击晕，之后接「恐惧」
    onDamaged: (C, e, d) => {
      if (e.shrieked || !d.unblocked || !e.powers.shriek) return;
      if (e.hp > e.powers.shriek) return;
      e.shrieked = true;
      delete e.powers.shriek;
      e.pendingStun = true;
      e.stunReturn = 'terror';
      C.msg(`${e.name} 发出刺耳的尖叫！`);
      C.emit();
    },
    moves: {
      crash: {
        name: '冲击', intent: { type: 'attack', dmg: 16, dmgAsc: 18 },
        run: async (C, e) => { await C.enemyAttack(e, 16, 18); },
      },
      thrash: {
        name: '撕扯', intent: { type: 'attack', dmg: 3, dmgAsc: 4, times: 3 },
        run: async (C, e) => {
          await C.enemyAttack(e, 3, 4, 3);
          await C.enemyPower(e, 'vigor', 6);
        },
      },
      stun: { name: '被击晕', intent: { type: 'stun' }, run: async () => {} },
      terror: {
        name: '恐惧', intent: { type: 'debuff' },
        run: async (C, e) => { await C.addPower('vulnerable', 99, C.player); },
      },
    },
    // 冲击 ↔ 撕扯 交替；生命首次跌破尖叫阈值时被击晕，之后「恐惧」再回到冲击
    ai: (C, e) => {
      if (e.moveKey === 'stun') return e.stunReturn || 'terror';
      if (!e.acted) { e.acted = true; return 'crash'; }
      return e.moveKey === 'crash' ? 'thrash' : 'crash';
    },
  },

  /* ---------------- 首领 ---------------- */

  LAGAVULIN_MATRIARCH: {
    name: '乐加维林族母', icon: '🦑', hp: [222, 222], hpAsc: [233, 233], boss: true,
    onSpawn: (C, e) => {
      e.powers.plating = 12;
      e.asleep = 3;
      e.awake = false;
      e.moveKey = 'sleep';
    },
    moves: {
      sleep: { name: '沉睡', intent: { type: 'sleep' }, run: async () => {} },
      stun: { name: '苏醒', intent: { type: 'stun' }, run: async () => {} },
      slash: {
        name: '斩击', intent: { type: 'attack', dmg: 19, dmgAsc: 21 },
        run: async (C, e) => { await C.enemyAttack(e, 19, 21); },
      },
      disembowel: {
        name: '开膛破肚', intent: { type: 'attack', dmg: 9, dmgAsc: 10, times: 2 },
        run: async (C, e) => { await C.enemyAttack(e, 9, 10, 2); },
      },
      slash2: {
        name: '斩击', intent: { type: 'attack', dmg: 12, dmgAsc: 14 },
        run: async (C, e) => {
          await C.enemyAttack(e, 12, 14);
          await C.enemyBlock(e, C.asc >= 8 ? 14 : 12);
        },
      },
      soulSiphon: {
        name: '灵魂汲取', intent: { type: 'debuff' },
        run: async (C, e) => {
          await C.addPower('strength', -2, C.player);
          await C.addPower('dexterity', -2, C.player);
          await C.enemyPower(e, 'strength', 2);
        },
      },
    },
    ai: (C, e) => {
      if (!e.awake) return 'sleep';
      if (e.wakeStun) { e.wakeStun = false; return 'stun'; }
      if (e.moveKey === 'stun' || e.moveKey === 'sleep') return 'slash';
      return { slash: 'disembowel', disembowel: 'slash2', slash2: 'soulSiphon', soulSiphon: 'slash' }[e.moveKey] || 'slash';
    },
    // 沉睡计时：3 个回合后自然醒来
    onTurnEnd: async (C, e) => {
      if (e.awake) return;
      e.asleep--;
      if (e.asleep <= 0) { e.awake = true; C.msg(`${e.name} 醒了过来`); C.emit(); }
    },
    // 受击即醒：卸掉覆甲、被击晕一回合，然后进入斩击循环
    onDamaged: async (C, e, d) => {
      if (e.awake || !d.unblocked) return;
      e.awake = true;
      e.asleep = 0;
      e.wakeStun = true;
      delete e.powers.plating;
      C.msg(`${e.name} 被惊醒了！`);
      C.emit();
    },
  },

  SOUL_FYSH: {
    name: '灵魂异鱼', icon: '🐟', hp: [211, 211], hpAsc: [221, 221], boss: true,
    moves: {
      beckon: {
        name: '呼唤', intent: { type: 'status' },
        run: async (C, e) => {
          await C.addCard('BECKON', 'draw');
          await C.addCard('BECKON', 'discard');
        },
      },
      deGas: {
        name: '排气', intent: { type: 'attack', dmg: 16, dmgAsc: 18 },
        run: async (C, e) => { await C.enemyAttack(e, 16, 18); },
      },
      gaze: {
        name: '凝视', intent: { type: 'attack', dmg: 7, dmgAsc: 8 },
        run: async (C, e) => {
          await C.enemyAttack(e, 7, 8);
          await C.addCard('BECKON', 'discard');
        },
      },
      fade: {
        name: '隐没', intent: { type: 'buff' },
        run: async (C, e) => { await C.enemyPower(e, 'intangible', 2); },
      },
      scream: {
        name: '尖叫', intent: { type: 'attack', dmg: 13, dmgAsc: 15 },
        run: async (C, e) => {
          await C.enemyAttack(e, 13, 15);
          await C.addPower('vulnerable', 3, C.player);
        },
      },
    },
    // 呼唤 → 排气 → 凝视 → 隐没 → 尖叫 → 呼唤 …
    ai: (C, e) => {
      if (!e.acted) { e.acted = true; return 'beckon'; }
      return {
        beckon: 'deGas', deGas: 'gaze', gaze: 'fade', fade: 'scream', scream: 'beckon',
      }[e.moveKey] || 'beckon';
    },
  },

  WATERFALL_GIANT: {
    name: '瀑布巨兽', icon: '🗿', hp: [240, 240], hpAsc: [250, 250], boss: true,
    onSpawn: (C, e) => { e.pressureGun = C.asc >= 9 ? 23 : 20; },
    moves: {
      pressurize: {
        name: '增压', intent: { type: 'buff' },
        run: async (C, e) => { await C.enemyPower(e, 'steamEruption', 15, 20); },
      },
      stomp: {
        name: '践踏', intent: { type: 'attack', dmg: 15, dmgAsc: 16 },
        run: async (C, e) => {
          await C.enemyAttack(e, 15, 16);
          await C.addPower('weak', 1, C.player);
          await C.enemyPower(e, 'steamEruption', 3);
        },
      },
      ram: {
        name: '撞击', intent: { type: 'attack', dmg: 10, dmgAsc: 11 },
        run: async (C, e) => {
          await C.enemyAttack(e, 10, 11);
          await C.enemyPower(e, 'steamEruption', 3);
        },
      },
      siphon: {
        name: '虹吸', intent: { type: 'heal' },
        run: async (C, e) => {
          await C.enemyHeal(e, C.asc >= 8 ? 15 : 10);
          await C.enemyPower(e, 'steamEruption', 3);
        },
      },
      pressureGun: {
        name: '压力炮', intent: { type: 'attack', dmg: 20, dmgAsc: 23 },
        run: async (C, e) => {
          await C.enemyAttack(e, e.pressureGun);
          e.pressureGun += 5;
          await C.enemyPower(e, 'steamEruption', 3);
        },
      },
      pressureUp: {
        name: '升压', intent: { type: 'attack', dmg: 13, dmgAsc: 14 },
        run: async (C, e) => {
          await C.enemyAttack(e, 13, 14);
          await C.enemyPower(e, 'steamEruption', 3);
        },
      },
      aboutToBlow: { name: '即将爆炸', intent: { type: 'stun' }, run: async () => {} },
      explode: {
        name: '蒸汽爆炸', intent: { type: 'attack', dmg: 0 },
        run: async (C, e) => {
          const dmg = e.steamDamage || 0;
          C.msg(`${e.name} 的蒸汽炸开了！`);
          await C.dealDamage(C.player, dmg, { isAttack: true, source: e });
          e.hp = 0;
          await C.killEnemy(e);
        },
      },
    },
    // 增压 → 践踏 → 撞击 → 虹吸 → 压力炮 → 升压 → 践踏 …
    ai: (C, e) => {
      if (e.moveKey === 'aboutToBlow') return 'explode';
      if (!e.acted) { e.acted = true; return 'pressurize'; }
      return {
        pressurize: 'stomp', stomp: 'ram', ram: 'siphon', siphon: 'pressureGun',
        pressureGun: 'pressureUp', pressureUp: 'stomp',
      }[e.moveKey] || 'stomp';
    },
    // 蒸汽喷发：带着积攒的蒸汽不倒下，下个回合眩晕，再下个回合爆炸
    onDeath: async (C, e) => {
      if (e.blowingUp || !e.powers.steamEruption) return false;
      e.blowingUp = true;
      e.steamDamage = e.powers.steamEruption;
      delete e.powers.steamEruption;
      e.hp = 999999999;
      e.maxHp = 999999999;
      e.moveKey = 'aboutToBlow';
      C.msg(`${e.name} 积攒的蒸汽快要炸了！`);
      C.emit();
      return true;
    },
  },
};

/* =========================================================================
   遭遇编组（顺序对照 UnderdocksEncounters.BatchA / BatchB / Elites / Bosses）
   ========================================================================= */

export const UNDERDOCK_ENCOUNTERS = {
  monster: [
    // ---- BatchA ----
    {
      id: 'CORPSE_SLUGS_NORMAL', weak: false,
      build: (C) => {
        const starter = C.rng.int(3);
        return [0, 1, 2].map((i) => ({ id: 'CORPSE_SLUG', extra: { starterIdx: (starter + i) % 3 } }));
      },
    },
    {
      id: 'CULTISTS_NORMAL', weak: false,
      units: [['CALCIFIED_CULTIST', 'DAMP_CULTIST']], slots: ['first', 'second'],
    },
    { id: 'FOSSIL_STALKER_NORMAL', weak: false, units: [['FOSSIL_STALKER']], slots: [null] },
    { id: 'GREMLIN_MERC_NORMAL', weak: false, units: [['GREMLIN_MERC']], slots: ['merc'] },
    { id: 'HAUNTED_SHIP_NORMAL', weak: false, units: [['HAUNTED_SHIP']], slots: [null] },
    { id: 'LIVING_FOG_NORMAL', weak: false, units: [['LIVING_FOG']], slots: ['livingFog'] },
    { id: 'PUNCH_CONSTRUCT_NORMAL', weak: false, units: [['PUNCH_CONSTRUCT']], slots: [null] },

    // ---- BatchB ----
    {
      id: 'SEAPUNK_NORMAL', weak: false,
      units: [['CALCIFIED_CULTIST', 'SEAPUNK']], slots: ['first', 'second'],
    },
    { id: 'SEWER_CLAM_NORMAL', weak: false, units: [['SEWER_CLAM']], slots: [null] },
    {
      id: 'TWO_TAILED_RATS_NORMAL', weak: false,
      build: (C) => {
        const starter = C.rng.int(3);
        return ['third', 'fourth', 'fifth'].map((slot, i) => ({
          id: 'TWO_TAILED_RAT', slot, extra: { starterIdx: (starter + i) % 3 },
        }));
      },
    },
    {
      id: 'CORPSE_SLUGS_WEAK', weak: true,
      build: (C) => {
        const starter = C.rng.int(3);
        return [0, 1].map((i) => ({ id: 'CORPSE_SLUG', extra: { starterIdx: (starter + i) % 3 } }));
      },
    },
    { id: 'SEAPUNK_WEAK', weak: true, units: [['SEAPUNK']], slots: [null] },
    { id: 'SLUDGE_SPINNER_WEAK', weak: true, units: [['SLUDGE_SPINNER']], slots: [null] },
    {
      id: 'TOADPOLES_WEAK', weak: true,
      build: () => [
        { id: 'TOADPOLE', extra: { isFront: true } },
        { id: 'TOADPOLE', extra: { isFront: false } },
      ],
    },
  ],

  elite: [
    {
      id: 'PHANTASMAL_GARDENERS_ELITE',
      build: () => ['first', 'second', 'third', 'fourth'].map((slot) => ({ id: 'PHANTASMAL_GARDENER', slot })),
    },
    { id: 'SKULKING_COLONY_ELITE', units: [['SKULKING_COLONY']], slots: [null] },
    { id: 'TERROR_EEL_ELITE', units: [['TERROR_EEL']], slots: [null] },
  ],

  boss: [
    { id: 'LAGAVULIN_MATRIARCH_BOSS', units: [['LAGAVULIN_MATRIARCH']], slots: [null] },
    { id: 'SOUL_FYSH_BOSS', units: [['SOUL_FYSH']], slots: [null] },
    { id: 'WATERFALL_GIANT_BOSS', units: [['WATERFALL_GIANT']], slots: [null] },
  ],
};

/** 第一幕弱怪池场数（Underdocks.NumberOfWeakEncounters = 3） */
export const UNDERDOCK_WEAK_COUNT = 3;
