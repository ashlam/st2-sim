/**
 * 故障机器人卡池 —— 数值取自 sts2-sim Models/Cards/*.cs（v0.111.0），
 * 文本对照官方 zhs 本地化改写（保持本仓库的 {变量} + [gold] 写法）。
 *
 * 收录 86 张（官方 91 张去掉 5 张多人限定牌：能量涌动 / 休眠 / 引火 / 模仿学习 / 众志成城），
 * 外加衍生牌「燃料」与状态牌「虚空」。
 *
 * 专属机制：
 *  - 充能球 orb：生成 / 激发 / 被动，见 src/data/orbs.js 与 combat.js 的「充能球」段
 *  - 集中 focus：提高球的数值（等离子除外），可以为负数
 *  - 黑暗球：被动把伤害累加进激发值；玻璃球：每次被动后自身数值 -1
 */
const D = (o) => ({ char: 'DEFECT', ...o });

/** 临时集中：本回合加，回合结束时还回去 */
async function tempFocus(C, n) {
  await C.addPower('focus', n);
  C.player.tempFocus = (C.player.tempFocus || 0) + n;
}

export const DEFECT_CARDS = {
  /* ================= 基础 ================= */
  STRIKE_DEFECT: D({
    id: 'STRIKE_DEFECT', name: '打击', type: 'attack', rarity: 'basic', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  DEFEND_DEFECT: D({
    id: 'DEFEND_DEFECT', name: '防御', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    tags: ['defend'], text: '获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  ZAP: D({
    id: 'ZAP', name: '电击', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    text: '[gold]生成[/gold]1个[gold]闪电[/gold]充能球。',
    vars: () => ({}),
    play: async (C) => { await C.channelOrb('LIGHTNING'); },
    upgradeCost: 0,
  }),
  DUALCAST: D({
    id: 'DUALCAST', name: '双重释放', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    text: '[gold]激发[/gold]你最左侧的充能球两次。',
    vars: () => ({}),
    play: async (C) => { await C.evokeFirst(2); },
    upgradeCost: 0,
  }),

  /* ================= 普通 · 攻击 ================= */
  BALL_LIGHTNING: D({
    id: 'BALL_LIGHTNING', name: '球状闪电', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n[gold]生成[/gold]1个[gold]闪电[/gold]充能球。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 7 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.channelOrb('LIGHTNING'); },
  }),
  BARRAGE: D({
    id: 'BARRAGE', name: '弹幕齐射', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '当前每有一个[gold]充能球[/gold]，造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 7 : 5 }),
    play: async (C) => {
      const hits = C.player.orbs.length;
      if (hits > 0) await C.attack(C.v('Damage'), { times: hits });
    },
  }),
  BEAM_CELL: D({
    id: 'BEAM_CELL', name: '光束射线', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 4 : 3, Vuln: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('vulnerable', C.v('Vuln'), t);
    },
  }),
  CLAW: D({
    id: 'CLAW', name: '爪击', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n本场战斗中所有爪击卡牌的伤害增加{Increase}点。',
    vars: (c) => ({ Damage: 3 + (c.bonus || 0), Increase: c.upgraded ? 3 : 2 }),
    play: async (C, c) => {
      await C.attack(C.v('Damage'));
      const inc = c.upgraded ? 3 : 2;
      const all = [...C.drawPile, ...C.hand, ...C.discardPile, ...C.exhaustPile, c];
      for (const x of all) if (x !== c && x.id === 'CLAW') x.bonus = (x.bonus || 0) + inc;
      c.bonus = (c.bonus || 0) + inc;
    },
  }),
  COLD_SNAP: D({
    id: 'COLD_SNAP', name: '寒流', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n[gold]生成[/gold]1个[gold]冰霜[/gold]充能球。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.channelOrb('FROST'); },
  }),
  COMPILE_DRIVER: D({
    id: 'COMPILE_DRIVER', name: '编译冲击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n你每有一种不同的充能球，就抽一张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 7 }),
    play: async (C) => {
      const n = C.distinctOrbs();
      await C.attack(C.v('Damage'));
      if (n > 0) await C.draw(n);
    },
  }),
  FOCUSED_STRIKE: D({
    id: 'FOCUSED_STRIKE', name: '集中打击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。\n在本回合获得{Focus}点[gold]集中[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 11 : 9, Focus: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      await tempFocus(C, C.v('Focus'));
    },
  }),
  GO_FOR_THE_EYES: D({
    id: 'GO_FOR_THE_EYES', name: '眼部攻击', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n如果敌人的意图是攻击，则给予{Weak}层[gold]虚弱[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 4 : 3, Weak: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (!t || !t.alive) return;
      if (C.intentOf(t).type === 'attack') await C.addPower('weak', C.v('Weak'), t);
    },
  }),
  GUNK_UP: D({
    id: 'GUNK_UP', name: '污秽攻击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害{Repeat}次。\n在你的[gold]弃牌堆[/gold]中加入一张[gold]黏液[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 5 : 4, Repeat: 3 }),
    play: async (C) => {
      await C.attack(C.v('Damage'), { times: 3 });
      await C.addCard('SLIMED', 'discard');
    },
  }),
  MOMENTUM_STRIKE: D({
    id: 'MOMENTUM_STRIKE', name: '趁势打击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。\n这张牌的耗能降为0。',
    vars: (c) => ({ Damage: c.upgraded ? 15 : 11 }),
    play: async (C, c) => { await C.attack(C.v('Damage')); c.costReduction = 9; },
  }),
  SWEEPING_BEAM: D({
    id: 'SWEEPING_BEAM', name: '扫荡射线', type: 'attack', rarity: 'common', cost: 1, target: 'all',
    text: '对所有敌人造成{Damage}点伤害。\n抽{Cards}张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6, Cards: 1 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true }); await C.draw(1); },
  }),
  UPROAR: D({
    id: 'UPROAR', name: '骚动', type: 'attack', rarity: 'common', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害两次。\n随机打出你的[gold]抽牌堆[/gold]中的1张攻击牌。',
    vars: (c) => ({ Damage: c.upgraded ? 8 : 6 }),
    play: async (C) => {
      await C.attack(C.v('Damage'), { times: 2 });
      const cand = C.drawPile.filter(x => x.type === 'attack' && !x.unplayable);
      if (cand.length) await C.autoPlay(C.rng.pick(cand));
    },
  }),

  /* ================= 普通 · 技能 ================= */
  BOOST_AWAY: D({
    id: 'BOOST_AWAY', name: '高速脱离', type: 'skill', rarity: 'common', cost: 0, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n将一张[gold]晕眩[/gold]添加到你的[gold]弃牌堆[/gold]中。',
    vars: (c) => ({ Block: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addCard('DAZED', 'discard'); },
  }),
  CHARGE_BATTERY: D({
    id: 'CHARGE_BATTERY', name: '充电', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n在下个回合获得1点能量。',
    vars: (c) => ({ Block: c.upgraded ? 10 : 7 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addPower('energyNextTurn', 1); },
  }),
  COOLHEADED: D({
    id: 'COOLHEADED', name: '冷静头脑', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '[gold]生成[/gold]1个[gold]冰霜[/gold]充能球。\n抽{Cards}张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.channelOrb('FROST'); await C.draw(C.v('Cards')); },
  }),
  HOLOGRAM: D({
    id: 'HOLOGRAM', name: '全息影像', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    exhaustOnPlay: true, noExhaustOnUpgrade: true,
    text: '获得{Block}点[gold]格挡[/gold]。\n将[gold]弃牌堆[/gold]中的一张牌放入你的[gold]手牌[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 5 : 3 }),
    play: async (C) => {
      await C.block(C.v('Block'));
      const chosen = await C.choose({ from: 'discard', count: 1, prompt: '选择一张牌放入手牌', optional: true });
      if (chosen.length) {
        const card = chosen[0];
        const i = C.discardPile.indexOf(card);
        if (i >= 0) C.discardPile.splice(i, 1);
        C.addCardToHand(card);
      }
    },
  }),
  LEAP: D({
    id: 'LEAP', name: '飞跃', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 12 : 9 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  GLACIER: D({
    id: 'GLACIER', name: '冰川', type: 'skill', rarity: 'uncommon', cost: 2, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n[gold]生成[/gold]2个[gold]冰霜[/gold]充能球。',
    vars: (c) => ({ Block: c.upgraded ? 9 : 6 }),
    play: async (C) => {
      await C.block(C.v('Block'));
      await C.channelOrb('FROST');
      await C.channelOrb('FROST');
    },
  }),
  LIGHTNING_ROD: D({
    id: 'LIGHTNING_ROD', name: '引雷针', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n在下{n}个回合开始时，[gold]生成[/gold]1个[gold]闪电[/gold]充能球。',
    vars: (c) => ({ Block: c.upgraded ? 7 : 4, n: 2 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addPower('lightningRod', 2); },
  }),
  OVERCLOCK: D({
    id: 'OVERCLOCK', name: '超频', type: 'skill', rarity: 'common', cost: 0, target: 'self',
    text: '抽{Cards}张牌。\n将一张[gold]灼伤[/gold]加入你的[gold]弃牌堆[/gold]。',
    vars: (c) => ({ Cards: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.draw(C.v('Cards')); await C.addCard('BURN', 'discard'); },
  }),
  TURBO: D({
    id: 'TURBO', name: '内核加速', type: 'skill', rarity: 'common', cost: 0, target: 'self',
    text: '获得{E}点能量。\n将一张[gold]虚空[/gold]加入你的[gold]弃牌堆[/gold]。',
    vars: (c) => ({ E: c.upgraded ? 3 : 2 }),
    play: async (C) => { C.gainEnergy(C.v('E')); await C.addCard('VOID', 'discard'); },
  }),

  /* ================= 罕见 · 攻击 ================= */
  HELIX_DRILL: D({
    id: 'HELIX_DRILL', name: '螺旋钻击', type: 'attack', rarity: 'rare', cost: 0, target: 'enemy',
    text: '在本回合中，每个被使用的能量，都会使此牌造成{Damage}点伤害一次。',
    vars: (c) => ({ Damage: c.upgraded ? 5 : 3 }),
    play: async (C) => {
      const hits = C.energySpentThisTurn;
      if (hits > 0) await C.attack(C.v('Damage'), { times: hits });
    },
  }),
  ICE_LANCE: D({
    id: 'ICE_LANCE', name: '冰之长枪', type: 'attack', rarity: 'rare', cost: 3, target: 'enemy',
    text: '造成{Damage}点伤害。\n[gold]生成[/gold]{Repeat}个[gold]冰霜[/gold]充能球。',
    vars: (c) => ({ Damage: c.upgraded ? 24 : 19, Repeat: 3 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      for (let i = 0; i < 3; i++) await C.channelOrb('FROST');
    },
  }),
  METEOR_STRIKE: D({
    id: 'METEOR_STRIKE', name: '陨石打击', type: 'attack', rarity: 'rare', cost: 5, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。\n[gold]生成[/gold]3个[gold]等离子[/gold]充能球。',
    vars: (c) => ({ Damage: c.upgraded ? 30 : 24 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      for (let i = 0; i < 3; i++) await C.channelOrb('PLASMA');
    },
  }),
  NULL: D({
    id: 'NULL', name: '空无', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{Weak}层[gold]虚弱[/gold]。\n[gold]生成[/gold]1个[gold]黑暗[/gold]充能球。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 10, Weak: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('weak', C.v('Weak'), t);
      await C.channelOrb('DARK');
    },
  }),
  REFRACT: D({
    id: 'REFRACT', name: '折射', type: 'attack', rarity: 'uncommon', cost: 3, target: 'enemy',
    text: '造成{Damage}点伤害两次。\n[gold]生成[/gold]{Repeat}个[gold]玻璃[/gold]充能球。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 10, Repeat: 2 }),
    play: async (C) => {
      await C.attack(C.v('Damage'), { times: 2 });
      for (let i = 0; i < 2; i++) await C.channelOrb('GLASS');
    },
  }),
  ROCKET_PUNCH: D({
    id: 'ROCKET_PUNCH', name: '火箭飞拳', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n抽{Cards}张牌。\n当有一张状态被生成时，将此牌的耗能在本回合降为0。',
    vars: (c) => ({ Damage: c.upgraded ? 14 : 13, Cards: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.draw(C.v('Cards')); },
  }),
  SCRAPE: D({
    id: 'SCRAPE', name: '刮削', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n抽{Cards}张牌。\n丢弃抽到的牌中耗能不为0的牌。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 7, Cards: c.upgraded ? 5 : 4 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      const drawn = await C.draw(C.v('Cards'));
      for (const x of drawn) {
        if (C.costOf(x) !== 0 && C.hand.includes(x)) C.discardCard(x);
      }
      C.emit();
    },
  }),
  SHATTER: D({
    id: 'SHATTER', name: '打碎', type: 'attack', rarity: 'rare', cost: 1, target: 'all',
    exhaustOnPlay: true,
    text: '对所有敌人造成{Damage}点伤害。\n[gold]激发[/gold]所有充能球两次。',
    vars: (c) => ({ Damage: c.upgraded ? 11 : 7 }),
    play: async (C) => {
      await C.attack(C.v('Damage'), { all: true });
      const n = C.player.orbs.length;
      for (let i = 0; i < n; i++) await C.evokeFirst(2);
    },
  }),
  SUNDER: D({
    id: 'SUNDER', name: '分离', type: 'attack', rarity: 'uncommon', cost: 3, target: 'enemy',
    text: '造成{Damage}点伤害。\n如果这张牌击杀了敌人，则获得3点能量。',
    vars: (c) => ({ Damage: c.upgraded ? 34 : 26 }),
    play: async (C) => {
      const killed = await C.attack(C.v('Damage'), { trackKill: true });
      if (killed) C.gainEnergy(3);
    },
  }),
  SYNTHESIS: D({
    id: 'SYNTHESIS', name: '人工合成', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n你打出的下一张能力牌耗能变为0。',
    vars: (c) => ({ Damage: c.upgraded ? 20 : 14 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.addPower('freePower', 1); },
  }),
  TESLA_COIL: D({
    id: 'TESLA_COIL', name: '特斯拉线圈', type: 'attack', rarity: 'uncommon', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n对该敌人触发你的所有[gold]闪电[/gold]充能球的被动。',
    vars: (c) => ({ Damage: c.upgraded ? 4 : 3 }),
    play: async (C, c) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (!t || !t.alive) return;
      const list = C.player.orbs.filter(o => o.kind === 'LIGHTNING');
      for (const orb of list) {
        await C.orbPassive(orb, t);
        if (c.upgraded) await C.orbPassive(orb, t);
      }
    },
  }),
  FTL: D({
    id: 'FTL', name: '超越光速', type: 'attack', rarity: 'uncommon', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n如果你在这回合打出的牌数小于{PlayMax}张，抽1张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 6 : 5, PlayMax: c.upgraded ? 4 : 3 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      // cardsPlayedThisTurn 已经算进这一张，原作的判定不含当前牌
      if (C.cardsPlayedThisTurn - 1 < C.v('PlayMax')) await C.draw(1);
    },
  }),

  /* ================= 罕见 · 技能 ================= */
  CAPACITOR: D({
    id: 'CAPACITOR', name: '扩容', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Repeat}个充能球栏位。',
    vars: (c) => ({ Repeat: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addOrbSlots(C.v('Repeat')); },
  }),
  CHAOS: D({
    id: 'CHAOS', name: '混沌', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]生成[/gold]{Repeat}个随机充能球。',
    vars: (c) => ({ Repeat: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.channelRandom(C.v('Repeat')); },
  }),
  CHILL: D({
    id: 'CHILL', name: '冰寒', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    exhaustOnPlay: true, noExhaustOnUpgrade: true,
    text: '当前每有一名敌人，就[gold]生成[/gold]1个[gold]冰霜[/gold]充能球。',
    vars: () => ({}),
    play: async (C) => {
      const n = C.alive().length;
      for (let i = 0; i < n; i++) await C.channelOrb('FROST');
    },
  }),
  COMPACT: D({
    id: 'COMPACT', name: '压缩', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n将你[gold]手牌[/gold]中的全部状态牌[gold]变化[/gold]为[gold]燃料[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 7 : 6 }),
    play: async (C, c) => {
      await C.block(C.v('Block'));
      const statuses = C.hand.filter(x => x.type === 'status');
      for (const s of statuses) {
        const i = C.hand.indexOf(s);
        if (i >= 0) C.hand.splice(i, 1);
        await C.addCard('FUEL', 'hand', !!c.upgraded);
      }
    },
  }),
  DARKNESS: D({
    id: 'DARKNESS', name: '漆黑', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]生成[/gold]1个[gold]黑暗[/gold]充能球。\n触发所有[gold]黑暗[/gold]充能球的被动{IfUp}。',
    vars: (c) => ({ IfUp: c.upgraded ? '两次' : '' }),
    play: async (C, c) => {
      await C.channelOrb('DARK');
      const times = c.upgraded ? 2 : 1;
      for (const orb of C.player.orbs.filter(o => o.kind === 'DARK')) {
        for (let i = 0; i < times; i++) await C.orbPassive(orb);
      }
    },
  }),
  DOUBLE_ENERGY: D({
    id: 'DOUBLE_ENERGY', name: '双倍能量', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    exhaustOnPlay: true, text: '将你的能量翻倍。',
    vars: () => ({}),
    play: async (C) => { C.gainEnergy(C.energy); },
    upgradeCost: 0,
  }),
  FIGHT_THROUGH: D({
    id: 'FIGHT_THROUGH', name: '强撑', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n将2张[gold]伤口[/gold]加入你的[gold]弃牌堆[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 17 : 13 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addCard('WOUND', 'discard', false, 2); },
  }),
  FUSION: D({
    id: 'FUSION', name: '聚变', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    exhaustOnPlay: true, noExhaustOnUpgrade: true,
    text: '[gold]生成[/gold]1个[gold]等离子[/gold]充能球。',
    vars: () => ({}),
    play: async (C) => { await C.channelOrb('PLASMA'); },
  }),
  GLASSWORK: D({
    id: 'GLASSWORK', name: '玻璃工艺', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n[gold]生成[/gold]1个[gold]玻璃[/gold]充能球。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); await C.channelOrb('GLASS'); },
  }),
  HOTFIX: D({
    id: 'HOTFIX', name: '热修复', type: 'skill', rarity: 'common', cost: 0, target: 'self',
    exhaustOnPlay: true, noExhaustOnUpgrade: true,
    text: '在本回合获得{Focus}点[gold]集中[/gold]。',
    vars: (c) => ({ Focus: 2 }),
    play: async (C) => { await tempFocus(C, C.v('Focus')); },
  }),
  MODDED: D({
    id: 'MODDED', name: '模组改造', type: 'skill', rarity: 'rare', cost: 0, target: 'self',
    text: '获得1个充能球栏位。\n抽{Cards}张牌。这张牌的耗能加1。',
    vars: (c) => ({ Cards: c.upgraded ? 2 : 1 }),
    play: async (C, c) => {
      await C.addOrbSlots(1);
      await C.draw(C.v('Cards'));
      c.costPenalty = (c.costPenalty || 0) + 1;
    },
  }),
  MULTI_CAST: D({
    id: 'MULTI_CAST', name: '多重释放', type: 'skill', rarity: 'rare', cost: 'X', target: 'self',
    text: '[gold]激发[/gold]你最左侧的充能球{IfUp}次。',
    vars: (c) => ({ IfUp: c.upgraded ? 'X+1' : 'X' }),
    play: async (C, c) => {
      const n = (C.xValue || 0) + (c.upgraded ? 1 : 0);
      if (n > 0) await C.evokeFirst(n);
    },
  }),
  QUADCAST: D({
    id: 'QUADCAST', name: '四重释放', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    text: '[gold]激发[/gold]你最左侧的充能球{Repeat}次。',
    vars: () => ({ Repeat: 4 }),
    play: async (C) => { await C.evokeFirst(4); },
    upgradeCost: 0,
  }),
  RAINBOW: D({
    id: 'RAINBOW', name: '彩虹', type: 'skill', rarity: 'rare', cost: 2, target: 'self',
    exhaustOnPlay: true, noExhaustOnUpgrade: true,
    text: '[gold]生成[/gold]1个[gold]闪电[/gold]充能球。\n[gold]生成[/gold]1个[gold]冰霜[/gold]充能球。\n[gold]生成[/gold]1个[gold]黑暗[/gold]充能球。',
    vars: () => ({}),
    play: async (C) => {
      await C.channelOrb('LIGHTNING');
      await C.channelOrb('FROST');
      await C.channelOrb('DARK');
    },
  }),
  REBOOT: D({
    id: 'REBOOT', name: '重启', type: 'skill', rarity: 'rare', cost: 0, target: 'self',
    exhaustOnPlay: true,
    text: '将你的所有未消耗的卡牌重新洗牌放入[gold]抽牌堆[/gold]。\n抽{Cards}张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 6 : 4 }),
    play: async (C) => {
      for (const x of C.hand.slice()) C.discardCard(x);
      C.drawPile = C.rng.shuffle([...C.drawPile, ...C.discardPile]);
      C.discardPile = [];
      await C.draw(C.v('Cards'));
    },
  }),
  SCAVENGE: D({
    id: 'SCAVENGE', name: '再利用', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]消耗[/gold]一张牌。\n在下个回合获得{E}点能量。',
    vars: (c) => ({ E: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      const chosen = await C.choose({ from: 'hand', count: 1, prompt: '选择一张牌消耗' });
      if (chosen.length) await C.exhaustCard(chosen[0]);
      await C.addPower('energyNextTurn', C.v('E'));
    },
  }),
  SHADOW_SHIELD: D({
    id: 'SHADOW_SHIELD', name: '暗影之盾', type: 'skill', rarity: 'uncommon', cost: 2, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n[gold]生成[/gold]1个[gold]黑暗[/gold]充能球。',
    vars: (c) => ({ Block: c.upgraded ? 15 : 11 }),
    play: async (C) => { await C.block(C.v('Block')); await C.channelOrb('DARK'); },
  }),
  SKIM: D({
    id: 'SKIM', name: '快速检索', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '抽{Cards}张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.draw(C.v('Cards')); },
  }),
  SUPERCRITICAL: D({
    id: 'SUPERCRITICAL', name: '超临界态', type: 'skill', rarity: 'rare', cost: 0, target: 'self',
    exhaustOnPlay: true,
    text: '获得{E}点能量。',
    vars: (c) => ({ E: c.upgraded ? 6 : 4 }),
    play: async (C) => { C.gainEnergy(C.v('E')); },
  }),
  SYNCHRONIZE: D({
    id: 'SYNCHRONIZE', name: '同步', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '你每有一种不同的充能球，就在本回合获得{Per}点[gold]集中[/gold]。',
    vars: (c) => ({ Per: c.upgraded ? 2 : 1 }),
    play: async (C) => { await tempFocus(C, C.distinctOrbs() * C.v('Per')); },
  }),
  TEMPEST: D({
    id: 'TEMPEST', name: '暴风雨', type: 'skill', rarity: 'uncommon', cost: 'X', target: 'self',
    text: '[gold]生成[/gold]{IfUp}个[gold]闪电[/gold]充能球。',
    vars: (c) => ({ IfUp: c.upgraded ? 'X+1' : 'X' }),
    play: async (C, c) => {
      const n = (C.xValue || 0) + (c.upgraded ? 1 : 0);
      for (let i = 0; i < n; i++) await C.channelOrb('LIGHTNING');
    },
  }),
  WHITE_NOISE: D({
    id: 'WHITE_NOISE', name: '白噪声', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    exhaustOnPlay: true,
    text: '将一张随机能力牌加入你的[gold]手牌[/gold]。这张牌在本回合内免费打出。',
    vars: () => ({}),
    play: async (C) => {
      const card = C.randomCardOfType('power');
      if (!card) return;
      card.freeThisTurn = true;
      C.addCardToHand(card);
    },
    upgradeCost: 0,
  }),
  GENETIC_ALGORITHM: D({
    id: 'GENETIC_ALGORITHM', name: '遗传算法', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    exhaustOnPlay: true,
    text: '获得{Block}点[gold]格挡[/gold]。\n每打出一次，这张牌在本局游戏中的[gold]格挡[/gold]值永久增加{Increase}点。',
    vars: (c) => ({ Block: 1 + (c.persist?.gaBonus || 0), Increase: c.upgraded ? 4 : 3 }),
    play: async (C, c) => {
      await C.block(C.v('Block'));
      const inc = c.upgraded ? 4 : 3;
      if (c.persist) c.persist.gaBonus = (c.persist.gaBonus || 0) + inc;
    },
  }),

  /* ================= 罕见/稀有 · 能力 ================= */
  BIASED_COGNITION: D({
    id: 'BIASED_COGNITION', name: '偏差认知', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '获得{Focus}点[gold]集中[/gold]。\n在你的回合开始时，失去{Decay}点[gold]集中[/gold]。',
    vars: (c) => ({ Focus: c.upgraded ? 6 : 5, Decay: 1 }),
    play: async (C) => {
      await C.addPower('focus', C.v('Focus'));
      await C.addPower('biasedCognition', 1);
    },
  }),
  BOOT_SEQUENCE: D({
    id: 'BOOT_SEQUENCE', name: '启动流程', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    innate: true, exhaustOnPlay: true,
    text: '[gold]固有[/gold]。\n获得{Block}点[gold]格挡[/gold]。\n[gold]消耗[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 13 : 10 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  BUFFER: D({
    id: 'BUFFER', name: '缓冲', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '阻止下{Buffer}次你受到的生命值损伤。',
    vars: (c) => ({ Buffer: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('buffer', C.v('Buffer')); },
  }),
  BULK_UP: D({
    id: 'BULK_UP', name: '暴涨', type: 'power', rarity: 'uncommon', cost: 2, target: 'self',
    text: '失去1个充能球栏位。\n获得{Str}点[gold]力量[/gold]。\n获得{Dex}点[gold]敏捷[/gold]。',
    vars: (c) => ({ Str: c.upgraded ? 3 : 2, Dex: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      await C.removeOrbSlots(1);
      await C.addPower('strength', C.v('Str'));
      await C.addPower('dexterity', C.v('Dex'));
    },
  }),
  CONSUMING_SHADOW: D({
    id: 'CONSUMING_SHADOW', name: '吞噬暗影', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '[gold]生成[/gold]{Repeat}个[gold]黑暗[/gold]充能球。\n在你的回合结束时，[gold]激发[/gold]你最右侧的充能球。',
    vars: (c) => ({ Repeat: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      for (let i = 0; i < C.v('Repeat'); i++) await C.channelOrb('DARK');
      await C.addPower('consumingShadow', 1);
    },
  }),
  COOLANT: D({
    id: 'COOLANT', name: '冷却剂', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '在你的回合开始时，你每有一种不同的充能球，就获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('coolant', C.v('Block')); },
  }),
  CREATIVE_AI: D({
    id: 'CREATIVE_AI', name: '创造性AI', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    text: '在你的回合开始时，将一张随机能力牌加入你的[gold]手牌[/gold]。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('creativeAi', 1); },
    upgradeCost: 2,
  }),
  DEFRAGMENT: D({
    id: 'DEFRAGMENT', name: '碎片整理', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '获得{Focus}点[gold]集中[/gold]。',
    vars: (c) => ({ Focus: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('focus', C.v('Focus')); },
  }),
  ECHO_FORM: D({
    id: 'ECHO_FORM', name: '回响形态', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    ethereal: true, noEtherealOnUpgrade: true,
    text: '[gold]虚无[/gold]。\n你每回合打出的第一张牌会被打出两次。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('echoForm', 1); },
  }),
  FERAL: D({
    id: 'FERAL', name: '野性', type: 'power', rarity: 'uncommon', cost: 2, target: 'self',
    text: '你每回合打出的第一张耗能为0的攻击牌，会放回你的[gold]手牌[/gold]。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('feral', 1); },
    upgradeCost: 1,
  }),
  HAILSTORM: D({
    id: 'HAILSTORM', name: '冰雹风暴', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '在你的回合结束时，如果你有[gold]冰霜[/gold]充能球，则对所有敌人造成{Dmg}点伤害。',
    vars: (c) => ({ Dmg: c.upgraded ? 8 : 6 }),
    play: async (C) => { await C.addPower('hailstorm', C.v('Dmg')); },
  }),
  ITERATION: D({
    id: 'ITERATION', name: '迭代', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每回合你第一次抽到状态牌时，抽{Cards}张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('iteration', C.v('Cards')); },
  }),
  LOOP: D({
    id: 'LOOP', name: '循环', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '在你的回合开始时，触发你最左侧的充能球的被动能力{IfUp}。',
    vars: (c) => ({ IfUp: c.upgraded ? '2次' : '' }),
    play: async (C, c) => { await C.addPower('loop', c.upgraded ? 2 : 1); },
  }),
  MACHINE_LEARNING: D({
    id: 'MACHINE_LEARNING', name: '机器学习', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    innateOnUpgrade: true,
    text: '在你的回合开始时，额外抽1张牌。',
    textFn: (c) => '在你的回合开始时，额外抽1张牌。' + (c.upgraded ? '\n[gold]固有[/gold]。' : ''),
    vars: () => ({}),
    play: async (C) => { await C.addPower('machineLearning', 1); },
  }),
  SIGNAL_BOOST: D({
    id: 'SIGNAL_BOOST', name: '信号增强', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    exhaustOnPlay: true,
    text: '你的下一张能力牌会额外打出一次。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('signalBoost', 1); },
    upgradeCost: 0,
  }),
  SMOKESTACK: D({
    id: 'SMOKESTACK', name: '烟囱', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你生成一张状态牌时，对所有敌人造成{Dmg}点伤害。',
    vars: (c) => ({ Dmg: c.upgraded ? 7 : 5 }),
    play: async (C) => { await C.addPower('smokestack', C.v('Dmg')); },
  }),
  SPINNER: D({
    id: 'SPINNER', name: '旋转工艺', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '在你的回合开始时，[gold]生成[/gold]1个[gold]玻璃[/gold]充能球。',
    textFn: (c) => (c.upgraded ? '[gold]生成[/gold]1个[gold]玻璃[/gold]充能球。\n' : '')
      + '在你的回合开始时，[gold]生成[/gold]1个[gold]玻璃[/gold]充能球。',
    vars: () => ({}),
    play: async (C, c) => {
      if (c.upgraded) await C.channelOrb('GLASS');
      await C.addPower('spinner', 1);
    },
  }),
  STORM: D({
    id: 'STORM', name: '雷暴', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你打出一张能力牌时，[gold]生成[/gold]{N}个[gold]闪电[/gold]充能球。',
    vars: (c) => ({ N: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('storm', C.v('N')); },
  }),
  SUBROUTINE: D({
    id: 'SUBROUTINE', name: '子程序', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '当你打出一张能力牌时，获得1点能量。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('subroutine', 1); },
    upgradeCost: 0,
  }),
  THUNDER: D({
    id: 'THUNDER', name: '雷霆', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你[gold]激发闪电[/gold]充能球时，对被命中的敌人造成{Dmg}点伤害。',
    vars: (c) => ({ Dmg: c.upgraded ? 11 : 8 }),
    play: async (C) => { await C.addPower('thunder', C.v('Dmg')); },
  }),
  TRASH_TO_TREASURE: D({
    id: 'TRASH_TO_TREASURE', name: '化废为宝', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '每当你生成状态牌的时候，随机[gold]生成[/gold]一个充能球。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('trashToTreasure', 1); },
    upgradeCost: 0,
  }),

  /* ================= 稀有 · 攻击/技能 ================= */
  ADAPTIVE_STRIKE: D({
    id: 'ADAPTIVE_STRIKE', name: '适应打击', type: 'attack', rarity: 'rare', cost: 2, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。\n将这张牌的一张0费复制品添加到你的[gold]弃牌堆[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 23 : 18 }),
    play: async (C, c) => {
      await C.attack(C.v('Damage'));
      const [clone] = await C.addCard('ADAPTIVE_STRIKE', 'discard', !!c.upgraded);
      if (clone) clone.costReduction = 9;
    },
  }),
  ALL_FOR_ONE: D({
    id: 'ALL_FOR_ONE', name: '万物一心', type: 'attack', rarity: 'rare', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n将你[gold]弃牌堆[/gold]中的所有0费牌放入你的[gold]手牌[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 14 : 10 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      if (C.finished) return;
      const zero = C.discardPile.filter(x => ['attack', 'skill', 'power'].includes(x.type) && C.costOf(x) === 0);
      for (const x of zero) {
        const i = C.discardPile.indexOf(x);
        if (i >= 0) C.discardPile.splice(i, 1);
        C.addCardToHand(x);
      }
    },
  }),
  FLAK_CANNON: D({
    id: 'FLAK_CANNON', name: '散射炮', type: 'attack', rarity: 'rare', cost: 2, target: 'random',
    text: '[gold]消耗[/gold]你所有的[gold]状态[/gold]牌。\n每有一张被[gold]消耗[/gold]的牌，就随机对敌人造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 11 : 8 }),
    play: async (C) => {
      const statuses = [];
      for (const pile of [C.hand, C.drawPile, C.discardPile]) {
        for (const x of pile) if (x.type === 'status') statuses.push(x);
      }
      for (const s of statuses) await C.exhaustCard(s);
      for (let i = 0; i < statuses.length; i++) {
        if (C.finished) return;
        await C.attack(C.v('Damage'), { random: true });
      }
    },
  }),
  HYPERBEAM: D({
    id: 'HYPERBEAM', name: '超能光束', type: 'attack', rarity: 'rare', cost: 2, target: 'all',
    text: '对所有敌人造成{Damage}点伤害。\n失去3点[gold]集中[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 30 : 24 }),
    play: async (C) => {
      await C.attack(C.v('Damage'), { all: true });
      await tempFocus(C, -3);
    },
  }),
  VOLTAIC: D({
    id: 'VOLTAIC', name: '电流相生', type: 'skill', rarity: 'rare', cost: 3, target: 'self',
    exhaustOnPlay: true, noExhaustOnUpgrade: true,
    text: '[gold]生成[/gold]等量于你在这场战斗中[gold]生成过[/gold]的[gold]闪电[/gold]充能球数量的[gold]闪电[/gold]充能球。',
    vars: () => ({}),
    play: async (C) => {
      const n = C.orbsChanneled.LIGHTNING || 0;
      for (let i = 0; i < n; i++) await C.channelOrb('LIGHTNING');
    },
  }),

  /* ================= 衍生 / 状态 ================= */
};

/** 燃料：压缩生成的衍生牌，0 费、消耗、给能量 */
export const FUEL = {
  id: 'FUEL', name: '燃料', type: 'skill', rarity: 'token', char: 'TOKEN',
  cost: 0, target: 'self', exhaustOnPlay: true,
  text: '获得{E}点能量。\n[gold]消耗[/gold]。',
  vars: (c) => ({ E: c.upgraded ? 2 : 1 }),
  play: async (C) => { C.gainEnergy(C.v('E')); },
};

/** 虚空：故障机器人的状态牌，抽到就掉 1 点能量（掉能量的逻辑在 combat.draw 里） */
export const VOID = {
  id: 'VOID', name: '虚空', type: 'status', rarity: 'status', char: 'NEUTRAL',
  cost: -1, target: 'none', unplayable: true, ethereal: true,
  text: '无法被打出。\n[gold]虚无[/gold]。\n每当你抽到这张牌时，失去1点能量。',
  vars: () => ({}), play: async () => {},
};
