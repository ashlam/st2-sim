import { HIVE_ENEMIES, HIVE_ENCOUNTERS, HIVE_WEAK_COUNT } from './enemies-hive.js';
import { GLORY_ENEMIES, GLORY_ENCOUNTERS, GLORY_WEAK_COUNT } from './enemies-glory.js';
import { UNDERDOCK_ENEMIES, UNDERDOCK_ENCOUNTERS, UNDERDOCK_WEAK_COUNT } from './enemies-underdocks.js';

/**
 * 第一幕（Overgrowth / 蔓生之地）敌人数据
 * 数值来自 sts2-sim 的 MonsterModel 移植；括号内为进阶 8/9 级的强化值。
 * intent: attack{dmg,times} | defend{block} | buff | debuff | status | sleep | stun
 */
const ACT1_ENEMIES = {
  /* ---------- 普通 ---------- */
  CUBEX_CONSTRUCT: {
    name: '立柱构造体', icon: '🗿', hp: [65, 65], hpAsc: [70, 70],
    // 登场即获得 13 点格挡与 1 层人工制品（CubexConstruct.AfterAddedToRoom）
    onSpawn: (C, e) => { e.block += 13; e.powers.artifact = 1; },
    pattern: ['charge', 'blast', 'blast', 'expel', 'blast', 'blast', 'expel'],
    moves: {
      charge: { name: '蓄能', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2); } },
      blast: { name: '重复轰击', intent: { type: 'attack', dmg: 7, dmgAsc: 8 }, run: async (C, e) => { await C.enemyAttack(e, 7, 8); await C.enemyPower(e, 'strength', 2); } },
      expel: { name: '排出冲击', intent: { type: 'attack', dmg: 5, dmgAsc: 6, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 5, 6, 2); } },
    },
  },
  FLYCONID: {
    name: '飞蝇菌子', icon: '🍄', hp: [47, 49], hpAsc: [51, 53],
    pattern: ['frail', 'random'],
    moves: {
      vulnerable: { name: '虚弱孢子', intent: { type: 'debuff' }, run: async (C, e) => { await C.addPower('weak', 2); } },
      frail: { name: '脆弱孢子', intent: { type: 'attack', dmg: 8, dmgAsc: 9 }, run: async (C, e) => { await C.enemyAttack(e, 8, 9); await C.addPower('frail', 2); } },
      smash: { name: '猛砸', intent: { type: 'attack', dmg: 11, dmgAsc: 12 }, run: async (C, e) => { await C.enemyAttack(e, 11, 12); } },
    },
    random: [['vulnerable', 1], ['frail', 1], ['smash', 1]],
  },
  LEAF_SLIME_S: {
    name: '树叶史莱姆（小）', icon: '🍃', hp: [11, 15], hpAsc: [12, 16],
    pattern: ['random'],
    moves: {
      tackle: { name: '冲撞', intent: { type: 'attack', dmg: 3, dmgAsc: 4 }, run: async (C, e) => { await C.enemyAttack(e, 3, 4); } },
      goop: { name: '黏液', intent: { type: 'status' }, run: async (C, e) => { await C.addCard('SLIMED', 'discard'); } },
    },
    random: [['tackle', 1], ['goop', 1]],
  },
  LEAF_SLIME_M: {
    name: '树叶史莱姆（中）', icon: '🍀', hp: [32, 35], hpAsc: [33, 36],
    pattern: ['sticky', 'clump'],
    moves: {
      sticky: { name: '黏糊射击', intent: { type: 'status' }, run: async (C, e) => { await C.addCard('SLIMED', 'discard', false, 2); } },
      clump: { name: '团块射击', intent: { type: 'attack', dmg: 8, dmgAsc: 9 }, run: async (C, e) => { await C.enemyAttack(e, 8, 9); } },
    },
  },
  TWIG_SLIME_S: {
    name: '树枝史莱姆（小）', icon: '🍂', hp: [7, 11], hpAsc: [8, 12],
    pattern: ['tackle'],
    moves: {
      tackle: { name: '冲撞', intent: { type: 'attack', dmg: 4, dmgAsc: 5 }, run: async (C, e) => { await C.enemyAttack(e, 4, 5); } },
    },
  },
  TWIG_SLIME_M: {
    name: '树枝史莱姆（中）', icon: '🌾', hp: [26, 28], hpAsc: [27, 29],
    pattern: ['sticky', 'pounce'],
    moves: {
      sticky: { name: '黏糊射击', intent: { type: 'status' }, run: async (C, e) => { await C.addCard('SLIMED', 'discard'); } },
      pounce: { name: '戳刺扑击', intent: { type: 'attack', dmg: 11, dmgAsc: 12 }, run: async (C, e) => { await C.enemyAttack(e, 11, 12); } },
    },
  },
  FOGMOG: {
    name: '雾菇', icon: '🌫️', hp: [74, 74], hpAsc: [78, 78],
    pattern: ['illusion', 'swipe', 'branch'],
    moves: {
      illusion: { name: '幻象孢子', intent: { type: 'buff' }, run: async (C, e) => { await C.spawnEnemy('EYE_WITH_TEETH', e); } },
      swipe: { name: '重击', intent: { type: 'attack', dmg: 8, dmgAsc: 9 }, run: async (C, e) => { await C.enemyAttack(e, 8, 9); await C.enemyPower(e, 'strength', 1); } },
      headbutt: { name: '头槌', intent: { type: 'attack', dmg: 14, dmgAsc: 16 }, run: async (C, e) => { await C.enemyAttack(e, 14, 16); } },
    },
    random: [['swipe', 1], ['headbutt', 1]],
  },
  FUZZY_WURM_CRAWLER: {
    name: '毛绒伏地虫', icon: '🐛', hp: [55, 57], hpAsc: [58, 59],
    pattern: ['acid', 'acid', 'inhale'],
    moves: {
      acid: { name: '酸液黏球', intent: { type: 'attack', dmg: 4, dmgAsc: 6 }, run: async (C, e) => { await C.enemyAttack(e, 4, 6); } },
      inhale: { name: '吸气', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 7); } },
    },
  },
  INKLET: {
    name: '墨宝', icon: '💧', hp: [11, 17], hpAsc: [12, 18],
    pattern: ['jab', 'random'],
    moves: {
      jab: { name: '刺击', intent: { type: 'attack', dmg: 3, dmgAsc: 4 }, run: async (C, e) => { await C.enemyAttack(e, 3, 4); } },
      whirlwind: { name: '蓄力拳', intent: { type: 'attack', dmg: 2, dmgAsc: 3, times: 3 }, run: async (C, e) => { await C.enemyAttack(e, 2, 3, 3); } },
      gaze: { name: '锐利凝视', intent: { type: 'attack', dmg: 10, dmgAsc: 11 }, run: async (C, e) => { await C.enemyAttack(e, 10, 11); } },
    },
    random: [['jab', 2], ['whirlwind', 2], ['gaze', 1]],
    startWith: 'whirlwind',
    middle: true,
  },
  MAWLER: {
    name: '蛮兽', icon: '🐗', hp: [72, 72], hpAsc: [76, 76],
    pattern: ['claw', 'random'],
    moves: {
      claw: { name: '爪击', intent: { type: 'attack', dmg: 4, dmgAsc: 5, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 4, 5, 2); } },
      rip: { name: '狂乱撕扯', intent: { type: 'attack', dmg: 14, dmgAsc: 16 }, run: async (C, e) => { await C.enemyAttack(e, 14, 16); } },
      roar: { name: '怒吼', intent: { type: 'debuff' }, run: async (C, e) => { await C.addPower('vulnerable', 3); } },
    },
    random: [['claw', 1], ['rip', 1], ['roar', 1]],
  },
  NIBBIT: {
    name: '小啃兽', icon: '🐿️', hp: [42, 46], hpAsc: [44, 48],
    pattern: ['butt', 'slice', 'hiss'],
    moves: {
      butt: { name: '顶撞', intent: { type: 'attack', dmg: 12, dmgAsc: 13 }, run: async (C, e) => { await C.enemyAttack(e, 12, 13); } },
      slice: { name: '犹豫斩击', intent: { type: 'attack', dmg: 6, dmgAsc: 7 }, run: async (C, e) => { await C.enemyAttack(e, 6, 7); await C.enemyBlock(e, 5, 6); } },
      hiss: { name: '哈气', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2, 3); } },
    },
  },
  SHRINKER_BEETLE: {
    name: '缩小甲虫', icon: '🐞', hp: [38, 40], hpAsc: [40, 42],
    pattern: ['shrink', 'chomp', 'stomp', 'chomp', 'stomp'],
    moves: {
      shrink: { name: '缩小', intent: { type: 'debuff' }, run: async (C, e) => { await C.addPower('shrink', 2); await C.addPower('weak', 1); } },
      chomp: { name: '大啃', intent: { type: 'attack', dmg: 7, dmgAsc: 8 }, run: async (C, e) => { await C.enemyAttack(e, 7, 8); } },
      stomp: { name: '践踏', intent: { type: 'attack', dmg: 13, dmgAsc: 14 }, run: async (C, e) => { await C.enemyAttack(e, 13, 14); } },
    },
  },
  AXE_RUBY_RAIDER: {
    name: '劫掠者斧手', icon: '⛏️', hp: [20, 22], hpAsc: [21, 23],
    pattern: ['swing', 'swing', 'big'],
    moves: {
      swing: { name: '挥舞', intent: { type: 'attack', dmg: 5, dmgAsc: 6 }, run: async (C, e) => { await C.enemyAttack(e, 5, 6); await C.enemyBlock(e, 5, 6); } },
      big: { name: '大力挥舞', intent: { type: 'attack', dmg: 12, dmgAsc: 13 }, run: async (C, e) => { await C.enemyAttack(e, 12, 13); } },
    },
  },
  ASSASSIN_RUBY_RAIDER: {
    name: '劫掠者刺客', icon: '🗡️', hp: [18, 23], hpAsc: [19, 24],
    pattern: ['killshot'],
    moves: {
      killshot: { name: '致命射击', intent: { type: 'attack', dmg: 10, dmgAsc: 11 }, run: async (C, e) => { await C.enemyAttack(e, 10, 11); } },
    },
  },
  BRUTE_RUBY_RAIDER: {
    name: '劫掠者暴徒', icon: '🔨', hp: [30, 33], hpAsc: [31, 34],
    pattern: ['beat', 'roar'],
    moves: {
      beat: { name: '殴打', intent: { type: 'attack', dmg: 7, dmgAsc: 8 }, run: async (C, e) => { await C.enemyAttack(e, 7, 8); } },
      roar: { name: '咆哮', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 3); } },
    },
  },
  CROSSBOW_RUBY_RAIDER: {
    name: '劫掠者弩手', icon: '🏹', hp: [18, 21], hpAsc: [19, 22],
    pattern: ['reload', 'fire'],
    moves: {
      reload: { name: '装填', intent: { type: 'defend', block: 3 }, run: async (C, e) => { await C.enemyBlock(e, 3, 3); } },
      fire: { name: '射击！', intent: { type: 'attack', dmg: 14, dmgAsc: 16 }, run: async (C, e) => { await C.enemyAttack(e, 14, 16); } },
    },
  },
  TRACKER_RUBY_RAIDER: {
    name: '劫掠者追踪手', icon: '🐕', hp: [21, 25], hpAsc: [22, 26],
    pattern: ['track', 'hounds'],
    moves: {
      track: { name: '追踪', intent: { type: 'debuff' }, run: async (C, e) => { await C.addPower('frail', 2); } },
      hounds: { name: '放狗', intent: { type: 'attack', dmg: 1, times: 8, timesAsc: 9 }, run: async (C, e) => { await C.enemyAttack(e, 1, 1, C.asc >= 9 ? 9 : 8); } },
    },
  },
  SNAPPING_JAXFRUIT: {
    name: '闪光贾克斯果', icon: '🌰', hp: [31, 33], hpAsc: [34, 36],
    pattern: ['orb'],
    moves: {
      orb: { name: '能量球', intent: { type: 'attack', dmg: 3, dmgAsc: 4 }, run: async (C, e) => { await C.enemyAttack(e, 3, 4); await C.enemyPower(e, 'strength', 2); } },
    },
  },
  VINE_SHAMBLER: {
    name: '藤蔓蹒跚者', icon: '🌿', hp: [61, 61], hpAsc: [64, 64],
    pattern: ['swipe', 'vines', 'chomp'],
    moves: {
      swipe: { name: '挥击', intent: { type: 'attack', dmg: 6, dmgAsc: 7, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 6, 7, 2); } },
      vines: { name: '紧绕藤蔓', intent: { type: 'attack', dmg: 8, dmgAsc: 9 }, run: async (C, e) => { await C.enemyAttack(e, 8, 9); await C.addPower('tangled', 1); } },
      chomp: { name: '大啃', intent: { type: 'attack', dmg: 16, dmgAsc: 18 }, run: async (C, e) => { await C.enemyAttack(e, 16, 18); } },
    },
  },
  SLITHERING_STRANGLER: {
    name: '蛇行扼杀者', icon: '🐍', hp: [53, 55], hpAsc: [54, 56],
    pattern: ['constrict', 'random'],
    moves: {
      constrict: { name: '缠身', intent: { type: 'debuff' }, run: async (C, e) => { await C.addPower('constrict', 3); } },
      thwack: { name: '重击', intent: { type: 'attack', dmg: 7, dmgAsc: 8 }, run: async (C, e) => { await C.enemyAttack(e, 7, 8); await C.enemyBlock(e, 5, 5); } },
      lash: { name: '甩动', intent: { type: 'attack', dmg: 12, dmgAsc: 13 }, run: async (C, e) => { await C.enemyAttack(e, 12, 13); } },
    },
    random: [['thwack', 1], ['lash', 1]],
  },
  EYE_WITH_TEETH: {
    name: '利齿之眼', icon: '👁️', hp: [6, 6], hpAsc: [6, 6],
    pattern: ['distract'],
    moves: {
      distract: { name: '牵制', intent: { type: 'status' }, run: async (C, e) => { await C.addCard('DAZED', 'discard', false, 3); } },
    },
  },
  // 只在「茂密的植被」事件里出场（DenseVegetationEventEncounter）：4 只，按 wriggler1..4 站位决定起手
  WRIGGLER: {
    name: '扭动虫', icon: '🐛', hp: [17, 21], hpAsc: [18, 22],
    moves: {
      bite: { name: '扭动打击', intent: { type: 'attack', dmg: 6, dmgAsc: 7 }, run: async (C, e) => { await C.enemyAttack(e, 6, 7); } },
      wriggle: {
        name: '寄生', intent: { type: 'buff' },
        run: async (C, e) => { await C.addCard('INFECTION', 'discard'); await C.enemyPower(e, 'strength', 2); },
      },
    },
    // 1/3 号位从啃咬起手、2/4 号位从寄生起手，之后两者交替
    ai: (C, e) => {
      if (!e.acted) {
        e.acted = true;
        return (e.slot === 'wriggler2' || e.slot === 'wriggler4') ? 'wriggle' : 'bite';
      }
      return e.moveKey === 'bite' ? 'wriggle' : 'bite';
    },
  },

  /* ---------- 精英 ---------- */
  BYGONE_EFFIGY: {
    name: '旧日雕像', icon: '🗿', hp: [127, 127], hpAsc: [132, 132], elite: true,
    pattern: ['sleep', 'wake', 'slash'],
    moves: {
      sleep: { name: '沉睡', intent: { type: 'sleep' }, run: async () => {} },
      wake: { name: '苏醒', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 10); } },
      slash: { name: '斩击', intent: { type: 'attack', dmg: 13, dmgAsc: 15 }, run: async (C, e) => { await C.enemyAttack(e, 13, 15); } },
    },
  },
  BYRDONIS: {
    name: '多尼斯异鸟', icon: '🦅', hp: [81, 84], hpAsc: [90, 90], elite: true,
    pattern: ['swoop', 'peck'],
    moves: {
      swoop: { name: '俯冲', intent: { type: 'attack', dmg: 17, dmgAsc: 19 }, run: async (C, e) => { await C.enemyAttack(e, 17, 19); } },
      peck: { name: '啄击', intent: { type: 'attack', dmg: 3, dmgAsc: 4, times: 3 }, run: async (C, e) => { await C.enemyAttack(e, 3, 4, 3); } },
    },
  },
  PHROG_PARASITE: {
    name: '异蛙寄生虫', icon: '🐸', hp: [61, 64], hpAsc: [66, 68], elite: true,
    pattern: ['infect', 'lash'],
    moves: {
      infect: { name: '感染', intent: { type: 'status' }, run: async (C, e) => { await C.addCard('INFECTION', 'discard', false, 3); } },
      lash: { name: '甩动', intent: { type: 'attack', dmg: 4, dmgAsc: 5, times: 4 }, run: async (C, e) => { await C.enemyAttack(e, 4, 5, 4); } },
    },
  },

  /* ---------- Boss ---------- */
  CEREMONIAL_BEAST: {
    name: '仪式兽', icon: '🐘', hp: [252, 252], hpAsc: [262, 262], boss: true,
    pattern: ['stamp', 'plow', 'plow'],
    moves: {
      stamp: { name: '跺地', intent: { type: 'debuff' }, desc: '盯住你，标记犁地线：生命降到 150（进阶 160）以下时会暴走，力量清零并眩晕一回合', run: async (C, e) => { e.plowThreshold = C.asc >= 9 ? 160 : 150; } },
      plow: { name: '横冲直撞', intent: { type: 'attack', dmg: 18, dmgAsc: 20 }, run: async (C, e) => { await C.enemyAttack(e, 18, 20); await C.enemyPower(e, 'strength', 2); } },
      stun: { name: '昏厥', intent: { type: 'stun' }, run: async () => {} },
      cry: { name: '野兽咆哮', intent: { type: 'debuff' }, run: async (C, e) => { await C.addPower('ringing', 1); } },
      stomp: { name: '踩踏', intent: { type: 'attack', dmg: 15, dmgAsc: 17 }, run: async (C, e) => { await C.enemyAttack(e, 15, 17); } },
      crush: { name: '碾碎', intent: { type: 'attack', dmg: 17, dmgAsc: 19 }, run: async (C, e) => { await C.enemyAttack(e, 17, 19); await C.enemyPower(e, 'strength', 3, 4); } },
    },
    phase2: ['cry', 'stomp', 'crush'],
    checkPhase: (e) => e.plowThreshold != null && e.hp <= e.plowThreshold && !e.plowTriggered,
    onPhase: async (C, e) => {
      e.plowTriggered = true;
      e.powers.strength = 0;
      e.pendingStun = true;
    },
  },
  THE_KIN: {
    name: '同族', icon: '👥', hp: [1, 1], boss: true, composite: [
      { id: 'KIN_FOLLOWER', startWithDance: true, slot: 1 },
      { id: 'KIN_FOLLOWER', slot: 2 },
      { id: 'KIN_PRIEST', slot: 3 },
    ], moves: {},
  },
  KIN_FOLLOWER: {
    name: '同族信徒', icon: '🧎', hp: [58, 59], hpAsc: [62, 63],
    pattern: ['quick', 'boomerang', 'dance'], minion: true,
    moves: {
      quick: { name: '快速斩击', intent: { type: 'attack', dmg: 5 }, run: async (C, e) => { await C.enemyAttack(e, 5, 5); } },
      boomerang: { name: '回旋镖', intent: { type: 'attack', dmg: 2, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 2, 2, 2); } },
      dance: { name: '力量之舞', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2, 3); } },
    },
  },
  KIN_PRIEST: {
    name: '同族神官', icon: '🧙', hp: [190, 190], hpAsc: [199, 199], boss: true,
    pattern: ['frailOrb', 'weakOrb', 'beam', 'ritual'],
    moves: {
      frailOrb: { name: '脆弱球', intent: { type: 'attack', dmg: 8, dmgAsc: 9 }, run: async (C, e) => { await C.enemyAttack(e, 8, 9); await C.addPower('frail', 1); } },
      weakOrb: { name: '虚弱球', intent: { type: 'attack', dmg: 8, dmgAsc: 9 }, run: async (C, e) => { await C.enemyAttack(e, 8, 9); await C.addPower('weak', 1); } },
      beam: { name: '灵魂光束', intent: { type: 'attack', dmg: 3, times: 3 }, run: async (C, e) => { await C.enemyAttack(e, 3, 3, 3); } },
      ritual: { name: '黑暗仪式', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2, 3); } },
    },
  },
  VANTOM: {
    name: '墨影幻灵', icon: '👤', hp: [173, 173], hpAsc: [183, 183], boss: true,
    pattern: ['inkBlot', 'lance', 'dismember', 'prepare'],
    moves: {
      inkBlot: { name: '墨迹', intent: { type: 'attack', dmg: 7, dmgAsc: 8 }, run: async (C, e) => { await C.enemyAttack(e, 7, 8); } },
      lance: { name: '墨水长枪', intent: { type: 'attack', dmg: 6, dmgAsc: 7, times: 2 }, run: async (C, e) => { await C.enemyAttack(e, 6, 7, 2); } },
      dismember: { name: '肢解', intent: { type: 'attack', dmg: 26, dmgAsc: 30 }, run: async (C, e) => { await C.enemyAttack(e, 26, 30); await C.addCard('WOUND', 'discard', false, 3); } },
      prepare: { name: '准备', intent: { type: 'buff' }, run: async (C, e) => { await C.enemyPower(e, 'strength', 2); } },
    },
  },
};

/** 遭遇战：普通/精英/Boss 池（第一幕） */
const ACT1_ENCOUNTERS = {
  weak: [
    { id: 'SHRINKER_BEETLE', units: [['SHRINKER_BEETLE']] },
    { id: 'FUZZY_WURM', units: [['FUZZY_WURM_CRAWLER']] },
    { id: 'LONE_NIBBIT', units: [['NIBBIT']] },
    { id: 'SLIMES_WEAK', units: [['TWIG_SLIME_M'], ['LEAF_SLIME_S', 'TWIG_SLIME_S']] },
  ],
  normal: [
    { id: 'CUBEX_CONSTRUCT', units: [['CUBEX_CONSTRUCT']] },
    { id: 'FLYCONID', units: [['FLYCONID'], ['LEAF_SLIME_M']] },
    { id: 'FOGMOG', units: [['FOGMOG']] },
    { id: 'INKLETS', units: [['INKLET', 'INKLET', 'INKLET']], middle: 1 },
    { id: 'MAWLER', units: [['MAWLER']] },
    { id: 'NIBBITS', units: [['NIBBIT', 'NIBBIT']] },
    { id: 'CRAWLERS', units: [['SHRINKER_BEETLE', 'FUZZY_WURM_CRAWLER']] },
    { id: 'RUBY_RAIDERS', units: [['randomRaiders']], count: 3 },
    { id: 'SLIMES_NORMAL', units: [['TWIG_SLIME_M', 'LEAF_SLIME_M']] },
    { id: 'STRANGLER', units: [['SLITHERING_STRANGLER']] },
    { id: 'JAXFRUIT', units: [['SNAPPING_JAXFRUIT', 'FLYCONID']] },
    { id: 'VINE_SHAMBLER', units: [['VINE_SHAMBLER']] },
  ],
  elite: [
    { id: 'BYGONE_EFFIGY', units: [['BYGONE_EFFIGY']] },
    { id: 'BYRDONIS', units: [['BYRDONIS']] },
    { id: 'PHROG_PARASITE', units: [['PHROG_PARASITE']] },
  ],
  boss: [
    { id: 'CEREMONIAL_BEAST', units: [['CEREMONIAL_BEAST']] },
    { id: 'THE_KIN', units: [['THE_KIN']] },
    { id: 'VANTOM', units: [['VANTOM']] },
  ],
};

/* ---------------- 按幕汇总 ---------------- */
/** 全部敌人（合并时后写的覆盖同名的，各幕没有重名） */
export const ENEMIES = { ...ACT1_ENEMIES, ...HIVE_ENEMIES, ...GLORY_ENEMIES, ...UNDERDOCK_ENEMIES };

/** 各幕的遭遇池。key 是幕序号（1 = 密林，2 = 巢穴，3 = 荣耀） */
export const ENCOUNTERS_BY_ACT = {
  1: ACT1_ENCOUNTERS,
  2: HIVE_ENCOUNTERS,
  3: GLORY_ENCOUNTERS,
};

/**
 * 第一幕的两个变体（对照 ActDefinition.GetRandomList：第一幕在 Overgrowth 与 Underdocks 之间随机）
 * key 与 Run.act1 一致。
 */
export const ACT1_VARIANTS = {
  OVERGROWTH: ACT1_ENCOUNTERS,
  UNDERDOCK: UNDERDOCK_ENCOUNTERS,
};

/** 取某一幕的遭遇池；第一幕按变体区分 */
export function encounterPool(act, variant) {
  if (act === 1) return ACT1_VARIANTS[variant] || ACT1_VARIANTS.OVERGROWTH;
  return ENCOUNTERS_BY_ACT[act] || ENCOUNTERS_BY_ACT[1];
}

/** 弱怪池场数（第一幕 3、第二/三幕 2，见 Overgrowth / Hive / Glory 的 NumberOfWeakEncounters） */
export const WEAK_COUNTS = { 1: 3, 2: HIVE_WEAK_COUNT, 3: GLORY_WEAK_COUNT };

export { UNDERDOCK_WEAK_COUNT };

/** 兼容旧引用：默认第一幕 */
export const ENCOUNTERS = ACT1_ENCOUNTERS;

export const RAIDER_POOL = ['AXE_RUBY_RAIDER', 'ASSASSIN_RUBY_RAIDER', 'BRUTE_RUBY_RAIDER', 'CROSSBOW_RUBY_RAIDER', 'TRACKER_RUBY_RAIDER'];
