/**
 * 储君 / Regent 卡池 —— 数值取自 sts2-sim Models/Cards/*.cs（v0.111.0），
 * 文本对照官方 zhs 本地化改写（保持本仓库的 {变量} + [gold] 写法）。
 *
 * 收录 RegentCardPool.OfficialCardTypes 91 张中的 86 张：
 *  - 跳过 5 张多人限定：CONSTELLATION / HAMMER_TIME / LARGESSE / PLOT / TUTOR
 *  - 2 张 Ancient（METEOR_SHOWER / THE_SEALED_THRONE）收录，但 rarity: 'special'
 *  - 衍生牌 SOVEREIGN_BLADE（君王之剑）单独导出
 *
 * 专属机制：
 *  - 星愿 stars：第二资源，星费由出牌流程自动扣除，play 里不再手动扣星
 *  - 铸造 forge(n)：生成/强化君王之剑；活力 vigor：下一张攻击牌 +n 伤害后清零
 *  - 新能力 id（触发逻辑由引擎统一实现）：childOfTheStars / blackHole /
 *    starNextTurn / genesis / sealedThrone / conqueror / monarchsGaze / monologue /
 *    orbit / pillarOfCreation / reflect / retainHand / tyranny / furnace /
 *    paleBlueDot / parry / royalties / seekingEdge / swordSage / arsenal /
 *    foregoneConclusion / spectrumShift / voidForm
 */
const R = (o) => ({ char: 'REGENT', ...o });

export const REGENT_CARDS = {
  /* ================= 基础 ================= */
  STRIKE_REGENT: R({
    id: 'STRIKE_REGENT', name: '打击', type: 'attack', rarity: 'basic', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  DEFEND_REGENT: R({
    id: 'DEFEND_REGENT', name: '防御', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    tags: ['defend'], text: '获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  FALLING_STAR: R({
    id: 'FALLING_STAR', name: '陨星', type: 'attack', rarity: 'basic', cost: 0, stars: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{Weak}层[gold]虚弱[/gold]。\n给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 8, Weak: 1, Vuln: 1 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) { await C.addPower('weak', C.v('Weak'), t); await C.addPower('vulnerable', C.v('Vuln'), t); }
    },
  }),
  VENERATE: R({
    id: 'VENERATE', name: '崇拜', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    text: '获得{Stars}点[gold]星愿[/gold]。',
    vars: (c) => ({ Stars: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.gainStars(C.v('Stars')); },
  }),

  /* ================= 普通 · 攻击 ================= */
  ASTRAL_PULSE: R({
    id: 'ASTRAL_PULSE', name: '星界脉冲', type: 'attack', rarity: 'common', cost: 0, stars: 3, target: 'all',
    text: '对所有敌人造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 8 : 6 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true, times: 2 }); },
  }),
  CELESTIAL_MIGHT: R({
    id: 'CELESTIAL_MIGHT', name: '天穹之力', type: 'attack', rarity: 'common', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害{Repeat}次。',
    vars: (c) => ({ Damage: 6, Repeat: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.attack(C.v('Damage'), { times: C.v('Repeat') }); },
  }),
  COLLISION_COURSE: R({
    // 简化：原版生成衍生牌「碎屑」（未收录），以「伤口」近似
    id: 'COLLISION_COURSE', name: '碰撞轨迹', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n将一张[gold]碎屑[/gold]添加至你的[gold]手牌[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 14 : 10 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.addCard('WOUND', 'hand'); },
  }),
  CRUSH_UNDER: R({
    id: 'CRUSH_UNDER', name: '下砸', type: 'attack', rarity: 'common', cost: 1, target: 'all',
    text: '对所有敌人造成{Damage}点伤害。所有敌人在本回合失去{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 8, Str: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true }); await C.addPowerAll('strengthTemp', -C.v('Str')); },
  }),
  GAMMA_BLAST: R({
    id: 'GAMMA_BLAST', name: '伽马爆破', type: 'attack', rarity: 'uncommon', cost: 0, stars: 3, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{Weak}层[gold]虚弱[/gold]。\n给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 18 : 13, Weak: 2, Vuln: 2 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) { await C.addPower('weak', C.v('Weak'), t); await C.addPower('vulnerable', C.v('Vuln'), t); }
    },
  }),
  GUIDING_STAR: R({
    id: 'GUIDING_STAR', name: '引导之星', type: 'attack', rarity: 'common', cost: 1, stars: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n在下一回合抽{Cards}张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 12, Cards: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.addPower('drawNextTurn', C.v('Cards')); },
  }),
  PHOTON_CUT: R({
    id: 'PHOTON_CUT', name: '光子切割', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n抽{Cards}张牌。\n将[gold]手牌[/gold]中的一张牌放到[gold]抽牌堆[/gold]顶部。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 10, Cards: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      await C.draw(C.v('Cards'));
      const chosen = await C.choose({ from: 'hand', count: 1, prompt: '选择一张牌放到抽牌堆顶部', optional: true });
      if (chosen.length) C.putOnDrawTop(chosen[0]);
    },
  }),
  SOLAR_STRIKE: R({
    id: 'SOLAR_STRIKE', name: '太阳打击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。\n获得{Stars}点[gold]星愿[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 9, Stars: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.gainStars(C.v('Stars')); },
  }),
  WROUGHT_IN_WAR: R({
    id: 'WROUGHT_IN_WAR', name: '战火铸就', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n[gold]铸造[/gold]{Forge}。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 7, Forge: c.upgraded ? 9 : 7 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.forge(C.v('Forge')); },
  }),

  /* ================= 普通 · 技能 ================= */
  BEGONE: R({
    // 简化：官方描述含伤害但 C# 无伤害数值；仆从衍生牌未收录，简化为升级所选手牌
    id: 'BEGONE', name: '下去！', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '选择你[gold]手牌[/gold]中的一张牌，将其[gold]变化[/gold]为仆从牌。',
    vars: () => ({}),
    play: async (C) => {
      const picked = await C.choose({ from: 'hand', count: 1, prompt: '选择一张牌变化', optional: true });
      for (const x of picked) C.upgradeCard(x);
    },
  }),
  CLOAK_OF_STARS: R({
    id: 'CLOAK_OF_STARS', name: '群星斗篷', type: 'skill', rarity: 'common', cost: 0, stars: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 10 : 7 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  COSMIC_INDIFFERENCE: R({
    id: 'COSMIC_INDIFFERENCE', name: '宇宙冷漠', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n将[gold]弃牌堆[/gold]中的一张牌放到你的[gold]抽牌堆[/gold]的顶部。',
    vars: (c) => ({ Block: c.upgraded ? 9 : 6 }),
    play: async (C) => {
      await C.block(C.v('Block'));
      const chosen = await C.choose({ from: 'discard', count: 1, prompt: '选择一张牌放到抽牌堆顶部', optional: true });
      if (chosen.length) C.putOnDrawTop(chosen[0]);
    },
  }),
  GATHER_LIGHT: R({
    id: 'GATHER_LIGHT', name: '收集光辉', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n获得{Stars}点[gold]星愿[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 11 : 8, Stars: 1 }),
    play: async (C) => { await C.block(C.v('Block')); await C.gainStars(C.v('Stars')); },
  }),
  GLITTERSTREAM: R({
    id: 'GLITTERSTREAM', name: '流光溢彩', type: 'skill', rarity: 'common', cost: 2, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n在下一回合获得{Next}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 13 : 11, Next: c.upgraded ? 7 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addPower('blockNextTurn', C.v('Next')); },
  }),
  GLOW: R({
    id: 'GLOW', name: '辉光', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Stars}点[gold]星愿[/gold]。\n抽{Cards}张牌。',
    vars: (c) => ({ Stars: c.upgraded ? 2 : 1, Cards: 1 }),
    play: async (C) => {
      await C.gainStars(C.v('Stars'));
      await C.draw(C.v('Cards'));
      await C.addPower('drawNextTurn', C.v('Cards'));
    },
  }),
  HIDDEN_CACHE: R({
    id: 'HIDDEN_CACHE', name: '隐秘藏品', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Stars}点[gold]星愿[/gold]。\n在下个回合获得{Next}点[gold]星愿[/gold]。',
    vars: (c) => ({ Stars: 1, Next: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.gainStars(C.v('Stars')); await C.addPower('starNextTurn', C.v('Next')); },
  }),
  KNOW_THY_PLACE: R({
    id: 'KNOW_THY_PLACE', name: '何人僭越', type: 'skill', rarity: 'common', cost: 0, target: 'enemy',
    exhaustOnPlay: true, noExhaustOnUpgrade: true,
    text: '给予{Weak}层[gold]虚弱[/gold]。\n给予{Vuln}层[gold]易伤[/gold]。',
    vars: () => ({ Weak: 1, Vuln: 1 }),
    play: async (C) => {
      const t = C.target;
      if (t) { await C.addPower('weak', C.v('Weak'), t); await C.addPower('vulnerable', C.v('Vuln'), t); }
    },
  }),
  PATTER: R({
    id: 'PATTER', name: '星星点点', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n获得{Vigor}点[gold]活力[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 10 : 8, Vigor: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.block(C.v('Block')); C.addVigor(C.v('Vigor')); },
  }),
  REFINE_BLADE: R({
    id: 'REFINE_BLADE', name: '淬炼刀刃', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '[gold]铸造[/gold]{Forge}。\n在下个回合获得{Energy}点[gold]能量[/gold]。',
    vars: (c) => ({ Forge: c.upgraded ? 12 : 8, Energy: 1 }),
    play: async (C) => { await C.forge(C.v('Forge')); await C.addPower('energyNextTurn', C.v('Energy')); },
  }),
  SPOILS_OF_BATTLE: R({
    // C# 另抽 2 张牌（官方描述未列出）
    id: 'SPOILS_OF_BATTLE', name: '战利品', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '[gold]铸造[/gold]{Forge}。',
    vars: (c) => ({ Forge: c.upgraded ? 9 : 6, Cards: 2 }),
    play: async (C) => { await C.forge(C.v('Forge')); await C.draw(C.v('Cards')); },
  }),
  PROPHESIZE: R({
    id: 'PROPHESIZE', name: '预言', type: 'skill', rarity: 'uncommon', cost: 2, target: 'self',
    text: '抽{Cards}张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.draw(C.v('Cards')); },
  }),

  /* ================= 罕见 · 攻击 ================= */
  BEAT_INTO_SHAPE: R({
    // 简化：无法统计「本回合击中该敌人的次数」，铸造固定为基础值（升级后 7）
    id: 'BEAT_INTO_SHAPE', name: '锻打成型', type: 'attack', rarity: 'rare', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n[gold]铸造[/gold]{Forge}。\n本回合此前你每击中过该敌人一次，[gold]铸造[/gold]值就上升{Extra}。',
    vars: (c) => ({ Damage: c.upgraded ? 7 : 5, Forge: c.upgraded ? 7 : 5, Extra: c.upgraded ? 7 : 5 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.forge(C.v('Forge')); },
  }),
  BOMBARDMENT: R({
    // 简化：原版在回合开始时从消耗牌堆自动再打出一次，简化为本次出牌结算两次伤害
    id: 'BOMBARDMENT', name: '轰击', type: 'attack', rarity: 'rare', cost: 3, target: 'enemy',
    exhaustOnPlay: true,
    text: '造成{Damage}点伤害。\n在你的回合开始时，从[gold]消耗牌堆[/gold]打出这张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 24 : 18 }),
    play: async (C) => { await C.attack(C.v('Damage'), { times: 2 }); },
  }),
  COMET: R({
    id: 'COMET', name: '彗星', type: 'attack', rarity: 'rare', cost: 0, stars: 5, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{Weak}层[gold]虚弱[/gold]。\n给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 44 : 33, Weak: 3, Vuln: 3 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) { await C.addPower('weak', C.v('Weak'), t); await C.addPower('vulnerable', C.v('Vuln'), t); }
    },
  }),
  CRESCENT_SPEAR: R({
    id: 'CRESCENT_SPEAR', name: '新月长矛', type: 'attack', rarity: 'common', cost: 1, stars: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n你每有一张拥有[gold]星愿[/gold]耗能的卡牌，这张牌就额外造成{Extra}点伤害。',
    vars: (c, C) => {
      const n = C ? [...C.drawPile, ...C.hand, ...C.discardPile, ...C.exhaustPile].filter((x) => x && (x.def?.stars || x.stars)).length : 0;
      const extra = c.upgraded ? 3 : 2;
      return { Damage: 8 + extra * n, Extra: extra };
    },
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  DEVASTATE: R({
    id: 'DEVASTATE', name: '葬送', type: 'attack', rarity: 'uncommon', cost: 1, stars: 4, target: 'enemy',
    text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 45 : 35 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  DYING_STAR: R({
    id: 'DYING_STAR', name: '星灭', type: 'attack', rarity: 'rare', cost: 1, stars: 3, target: 'all',
    ethereal: true,
    text: '对所有敌人造成{Damage}点伤害。所有敌人在本回合中失去{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 11 : 9, Str: c.upgraded ? 11 : 9 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true }); await C.addPowerAll('strengthTemp', -C.v('Str')); },
  }),
  HEAVENLY_DRILL: R({
    id: 'HEAVENLY_DRILL', name: '天际钻头', type: 'attack', rarity: 'rare', cost: 'X', target: 'enemy',
    text: '造成{Damage}点伤害X次。\n如果X的最终数值为{Threshold}或以上，则将X的数值翻倍。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 8, Threshold: 4 }),
    play: async (C) => {
      const x = C.xValue || 0;
      await C.attack(C.v('Damage'), { times: x >= C.v('Threshold') ? x * 2 : x });
    },
  }),
  HEGEMONY: R({
    id: 'HEGEMONY', name: '霸权', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n在下个回合获得{Energy}点[gold]能量[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 18 : 15, Energy: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.addPower('energyNextTurn', C.v('Energy')); },
  }),
  HEIRLOOM_HAMMER: R({
    // 简化：无色牌过滤未实现，改为复制任意 1 张手牌
    id: 'HEIRLOOM_HAMMER', name: '传承之锤', type: 'attack', rarity: 'rare', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n选择你[gold]手牌[/gold]中的一张无色牌。将这张牌的一张复制品放入你的[gold]手牌[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 25 : 20 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      const chosen = await C.choose({ from: 'hand', count: 1, prompt: '选择一张牌复制', optional: true });
      if (chosen.length) await C.addCard(chosen[0].id, 'hand', chosen[0].upgraded);
    },
  }),
  KINGLY_KICK: R({
    // 简化：原版每次被抽到时本战斗耗能 -1，引擎无对应钩子，省略
    id: 'KINGLY_KICK', name: '王者之踢', type: 'attack', rarity: 'uncommon', cost: 4, target: 'enemy',
    text: '造成{Damage}点伤害。\n每当你抽到这张牌时，这张牌的耗能减少1。',
    vars: (c) => ({ Damage: c.upgraded ? 35 : 27 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  KINGLY_PUNCH: R({
    // 简化：原版每次被抽到永久增伤，引擎无抽牌钩子，简化为打出后本场战斗增伤
    id: 'KINGLY_PUNCH', name: '王者之拳', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n每当你抽到这张牌时，在这场战斗中其伤害增加{Extra}。',
    vars: (c) => ({ Damage: (c.upgraded ? 10 : 8) + (c.bonus || 0), Extra: c.upgraded ? 6 : 4 }),
    play: async (C, c) => { await C.attack(C.v('Damage')); c.bonus = (c.bonus || 0) + C.v('Extra'); },
  }),
  KNOCKOUT_BLOW: R({
    id: 'KNOCKOUT_BLOW', name: '决胜一击', type: 'attack', rarity: 'uncommon', cost: 3, target: 'enemy',
    text: '造成{Damage}点伤害。\n如果此牌击杀了敌人，获得{Stars}点[gold]星愿[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 38 : 30, Stars: 5 }),
    play: async (C) => {
      const killed = await C.attack(C.v('Damage'));
      if (killed) await C.gainStars(C.v('Stars'));
    },
  }),
  LUNAR_BLAST: R({
    id: 'LUNAR_BLAST', name: '月面射击', type: 'attack', rarity: 'uncommon', cost: 0, target: 'enemy',
    text: '本回合每打出过一张技能牌，就造成{Damage}点伤害一次。',
    vars: (c) => ({ Damage: c.upgraded ? 5 : 4 }),
    play: async (C) => { const hits = C.skillsPlayedThisTurn; if (hits > 0) await C.attack(C.v('Damage'), { times: hits }); },
  }),
  MAKE_IT_SO: R({
    // 简化：原版每打出 3 张技能牌后回手，引擎无延后钩子，省略回手
    id: 'MAKE_IT_SO', name: '如此甚好', type: 'attack', rarity: 'rare', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n你每在一回合内打出{Cards}张技能牌，就将这张牌放入你的[gold]手牌[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6, Cards: 3 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  RADIATE: R({
    id: 'RADIATE', name: '辐射', type: 'attack', rarity: 'uncommon', cost: 0, target: 'all',
    text: '你在本回合每获得一点[gold]星愿[/gold]，就对所有敌人造成{Damage}点伤害一次。',
    vars: (c) => ({ Damage: c.upgraded ? 4 : 3 }),
    play: async (C) => { const hits = C.player.starsGainedThisTurn || 0; if (hits > 0) await C.attack(C.v('Damage'), { all: true, times: hits }); },
  }),
  SEVEN_STARS: R({
    id: 'SEVEN_STARS', name: '七星', type: 'attack', rarity: 'rare', cost: 2, stars: 7, target: 'all',
    upgradeCost: 1,
    text: '对所有敌人造成{Damage}点伤害{Repeat}次。',
    vars: () => ({ Damage: 7, Repeat: 7 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true, times: C.v('Repeat') }); },
  }),
  SHINING_STRIKE: R({
    // 简化：原版出牌后置于抽牌堆顶，引擎出牌流程固定进弃牌堆，改为生成同名复制品置于抽牌堆顶
    id: 'SHINING_STRIKE', name: '明耀打击', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n获得{Stars}点[gold]星愿[/gold]。\n将这张牌放置于你的[gold]抽牌堆[/gold]顶部。',
    vars: (c) => ({ Damage: c.upgraded ? 11 : 8, Stars: 2 }),
    play: async (C, c) => {
      await C.attack(C.v('Damage'));
      await C.gainStars(C.v('Stars'));
      await C.addCard('SHINING_STRIKE', 'draw', !!c.upgraded);
    },
  }),
  STARDUST: R({
    id: 'STARDUST', name: '星尘', type: 'attack', rarity: 'uncommon', cost: 0, stars: 'X', target: 'random',
    text: '随机对敌人造成{Damage}点伤害X次。',
    vars: (c) => ({ Damage: c.upgraded ? 7 : 5 }),
    play: async (C) => { const x = C.starXValue || 0; if (x > 0) await C.attack(C.v('Damage'), { random: true, times: x }); },
  }),
  SUPERMASSIVE: R({
    id: 'SUPERMASSIVE', name: '超质量体', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n你在本场战斗中每生成过一张牌，这张牌就额外造成{Extra}点伤害。',
    vars: (c, C) => {
      const per = c.upgraded ? 4 : 3;
      return { Damage: 5 + per * (C ? (C.cardsGeneratedThisCombat || 0) : 0), Extra: per };
    },
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),

  /* ================= 罕见 · 技能 ================= */
  ALIGNMENT: R({
    id: 'ALIGNMENT', name: '星位序列', type: 'skill', rarity: 'uncommon', cost: 0, stars: 2, target: 'self',
    text: '获得{Energy}点[gold]能量[/gold]。',
    vars: (c) => ({ Energy: c.upgraded ? 3 : 2 }),
    play: async (C) => { C.gainEnergy(C.v('Energy')); },
  }),
  BIG_BANG: R({
    id: 'BIG_BANG', name: '大爆炸', type: 'skill', rarity: 'rare', cost: 0, target: 'self',
    exhaustOnPlay: true, innateOnUpgrade: true,
    text: '抽{Cards}张牌。\n获得{Energy}点[gold]能量[/gold]。\n获得{Stars}点[gold]星愿[/gold]。\n[gold]铸造[/gold]{Forge}。',
    vars: () => ({ Cards: 1, Energy: 1, Stars: 1, Forge: 5 }),
    play: async (C) => {
      await C.draw(C.v('Cards'));
      await C.gainStars(C.v('Stars'));
      C.gainEnergy(C.v('Energy'));
      await C.forge(C.v('Forge'));
    },
  }),
  BULWARK: R({
    id: 'BULWARK', name: '铸墙', type: 'skill', rarity: 'uncommon', cost: 2, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n[gold]铸造[/gold]{Forge}。',
    vars: (c) => ({ Block: c.upgraded ? 15 : 12, Forge: c.upgraded ? 13 : 10 }),
    play: async (C) => { await C.block(C.v('Block')); await C.forge(C.v('Forge')); },
  }),
  BUNDLE_OF_JOY: R({
    // 简化：无色牌池未实现，改用随机技能牌近似
    id: 'BUNDLE_OF_JOY', name: '新生之喜', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    exhaustOnPlay: true, text: '将{Cards}张随机无色牌添加到你的[gold]手牌[/gold]。',
    vars: (c) => ({ Cards: c.upgraded ? 4 : 3 }),
    play: async (C) => {
      for (let i = 0; i < C.v('Cards'); i++) { const card = C.randomCardOfType('skill'); if (card) C.addCardToHand(card); }
    },
  }),
  CHARGE: R({
    // 简化：原版从抽牌堆选 2 张变化为仆从牌；引擎 choose 不支持抽牌堆且仆从牌未收录，简化为升级抽牌堆顶 2 张牌
    id: 'CHARGE', name: '冲锋！！', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '选择你[gold]抽牌堆[/gold]中的{Cards}张牌，将其[gold]变化[/gold]为仆从牌。',
    vars: () => ({ Cards: 2 }),
    play: async (C) => { for (const card of C.drawPile.slice(-2)) C.upgradeCard(card); },
  }),
  CONQUEROR: R({
    id: 'CONQUEROR', name: '征服者', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '[gold]铸造[/gold]{Forge}。\n[gold]君王之剑[/gold]在本回合对敌人造成双倍伤害。',
    vars: (c) => ({ Forge: c.upgraded ? 5 : 3 }),
    play: async (C) => { await C.forge(C.v('Forge')); await C.addPower('conqueror', 1, C.target); },
  }),
  CONVERGENCE: R({
    id: 'CONVERGENCE', name: '汇流', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '在本回合[gold]保留[/gold]你的[gold]手牌[/gold]。\n在下个回合，\n获得{Energy}点[gold]能量[/gold]与{Stars}点[gold]星愿[/gold]。',
    vars: (c) => ({ Energy: 1, Stars: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      await C.addPower('retainHand', 1);
      await C.addPower('energyNextTurn', C.v('Energy'));
      await C.addPower('starNextTurn', C.v('Stars'));
    },
  }),
  CRASH_LANDING: R({
    // 简化：原版用「碎屑」衍生牌填满手牌（未收录），以「伤口」近似
    id: 'CRASH_LANDING', name: '迫降', type: 'attack', rarity: 'rare', cost: 1, target: 'all',
    text: '对所有敌人造成{Damage}点伤害。\n用[gold]碎屑[/gold]填满你的[gold]手牌[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 26 : 21 }),
    play: async (C) => {
      await C.attack(C.v('Damage'), { all: true });
      while (C.hand.length < 10) await C.addCard('WOUND', 'hand');
    },
  }),
  DECISIONS_DECISIONS: R({
    // 简化：重复打出的技能牌由引擎 autoPlay 定标为存活的首名敌人，而非随机目标
    id: 'DECISIONS_DECISIONS', name: '抉择，抉择', type: 'skill', rarity: 'rare', cost: 0, stars: 6, target: 'self',
    exhaustOnPlay: true,
    text: '抽{Cards}张牌。\n选择你[gold]手牌[/gold]中的一张技能牌，并将其打出{Repeat}次。',
    vars: (c) => ({ Cards: c.upgraded ? 5 : 3, Repeat: 3 }),
    play: async (C) => {
      await C.draw(C.v('Cards'));
      const chosen = await C.choose({ from: 'hand', count: 1, filter: (x) => x.type === 'skill' && !x.unplayable, prompt: '选择一张技能牌' });
      if (chosen.length) for (let i = 0; i < C.v('Repeat'); i++) await C.autoPlay(chosen[0]);
    },
  }),
  FOREGONE_CONCLUSION: R({
    id: 'FOREGONE_CONCLUSION', name: '既定事项', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    text: '在下个回合，从你的[gold]抽牌堆[/gold]中选择{Cards}张牌放入你的[gold]手牌[/gold]。',
    // GeneratedPowerEffects: ForegoneConclusionPower 2m / 升级 +1m
    vars: (c) => ({ Cards: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('foregoneConclusion', C.v('Cards')); },
  }),
  GLIMMER: R({
    id: 'GLIMMER', name: '微光', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '抽{Cards}张牌。\n将你[gold]手牌[/gold]中的{PutBack}张牌放到[gold]抽牌堆[/gold]顶部。',
    vars: (c) => ({ Cards: c.upgraded ? 4 : 3, PutBack: 1 }),
    play: async (C) => {
      await C.draw(C.v('Cards'));
      const chosen = await C.choose({ from: 'hand', count: 1, prompt: '选择一张牌放到抽牌堆顶部', optional: true });
      if (chosen.length) C.putOnDrawTop(chosen[0]);
    },
  }),
  GUARDS: R({
    // 简化：C# 为确定性「选 0 张」无操作、仆从衍生牌未收录，简化为升级所选 1 张手牌
    id: 'GUARDS', name: '护驾！！！', type: 'skill', rarity: 'rare', cost: 2, target: 'self',
    exhaustOnPlay: true,
    text: '将你[gold]手牌[/gold]中的任意张牌[gold]变化[/gold]为仆从牌。',
    vars: () => ({}),
    play: async (C) => {
      const picked = await C.choose({ from: 'hand', count: 1, prompt: '选择要变化的牌', optional: true });
      for (const x of picked) C.upgradeCard(x);
    },
  }),
  I_AM_INVINCIBLE: R({
    // 简化：原版「位于抽牌堆顶则回合结束自动打出」无法表达，仅结算格挡
    id: 'I_AM_INVINCIBLE', name: '所向无敌', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n在你的回合结束时，如果这张牌位于[gold]抽牌堆[/gold]顶部，则将其打出。',
    vars: (c) => ({ Block: c.upgraded ? 13 : 10 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  MANIFEST_AUTHORITY: R({
    // 简化：无色牌池未实现，改用随机技能牌；升级状态随本卡
    id: 'MANIFEST_AUTHORITY', name: '君权自授', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n将一张随机无色牌加入你的[gold]手牌[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 7 }),
    play: async (C, c) => {
      await C.block(C.v('Block'));
      const card = C.randomCardOfType('skill');
      if (card) { if (c.upgraded) C.upgradeCard(card); C.addCardToHand(card); }
    },
  }),
  MONOLOGUE: R({
    // 简化：原版仅升级后获得「保留」，makeCard 无 retainOnUpgrade，简化为始终保留
    id: 'MONOLOGUE', name: '独白', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    retain: true,
    text: '每当你在本回合打出卡牌时，在本回合获得{Str}点[gold]力量[/gold]。',
    vars: () => ({ Str: 1 }),
    play: async (C) => { await C.addPower('monologue', C.v('Str')); },
  }),
  PARTICLE_WALL: R({
    // 简化：原版出牌后返回手牌，引擎出牌流程固定进弃牌堆，改为生成同名复制品进手牌
    id: 'PARTICLE_WALL', name: '粒子墙', type: 'skill', rarity: 'uncommon', cost: 0, stars: 2, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n将此牌返回你的[gold]手牌[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 12 : 9 }),
    play: async (C, c) => { await C.block(C.v('Block')); await C.addCard('PARTICLE_WALL', 'hand', !!c.upgraded); },
  }),
  QUASAR: R({
    // 简化：无色牌池与「3 选 1」未实现，改为生成 1 张随机技能牌（升级后随之升级）
    id: 'QUASAR', name: '类星体', type: 'skill', rarity: 'uncommon', cost: 0, stars: 2, target: 'self',
    text: '从3张随机无色牌中选择1张加入你的[gold]手牌[/gold]。',
    vars: () => ({}),
    play: async (C, c) => {
      const card = C.randomCardOfType('skill');
      if (card) { if (c.upgraded) C.upgradeCard(card); C.addCardToHand(card); }
    },
  }),
  REFLECT: R({
    id: 'REFLECT', name: '倒映', type: 'skill', rarity: 'uncommon', cost: 1, stars: 3, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n在本回合将你格挡掉的攻击伤害反弹给攻击者。',
    vars: (c) => ({ Block: c.upgraded ? 20 : 15 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addPower('reflect', 1); },
  }),
  RESONANCE: R({
    id: 'RESONANCE', name: '共鸣', type: 'skill', rarity: 'uncommon', cost: 1, stars: 2, target: 'all',
    text: '获得{Str}点[gold]力量[/gold]。所有敌人失去1点[gold]力量[/gold]。',
    vars: (c) => ({ Str: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('strength', C.v('Str')); await C.addPowerAll('strength', -1); },
  }),
  ROYAL_GAMBLE: R({
    // 简化：原版仅升级后获得「保留」，makeCard 无 retainOnUpgrade，简化为始终保留
    id: 'ROYAL_GAMBLE', name: '胜券在王', type: 'skill', rarity: 'uncommon', cost: 0, stars: 5, target: 'self',
    exhaustOnPlay: true, retain: true,
    text: '获得{Stars}点[gold]星愿[/gold]。',
    vars: () => ({ Stars: 9 }),
    play: async (C) => { await C.gainStars(C.v('Stars')); },
  }),
  SUMMON_FORTH: R({
    id: 'SUMMON_FORTH', name: '征召上前', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]铸造[/gold]{Forge}。\n不论何处，将[gold]君王之剑[/gold]放入你的[gold]手牌[/gold]。',
    vars: (c) => ({ Forge: c.upgraded ? 11 : 8 }),
    play: async (C) => {
      for (const pile of [C.drawPile, C.discardPile, C.exhaustPile]) {
        for (const card of pile.filter((x) => x.id === 'SOVEREIGN_BLADE')) { pile.splice(pile.indexOf(card), 1); C.addCardToHand(card); }
      }
      await C.forge(C.v('Forge'));
    },
  }),
  TERRAFORMING: R({
    id: 'TERRAFORMING', name: '地形改造', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Vigor}点[gold]活力[/gold]。',
    vars: (c) => ({ Vigor: c.upgraded ? 10 : 7 }),
    play: async (C) => { C.addVigor(C.v('Vigor')); },
  }),
  THE_SMITH: R({
    id: 'THE_SMITH', name: '铸剑者', type: 'skill', rarity: 'rare', cost: 1, stars: 4, target: 'self',
    text: '[gold]铸造[/gold]{Forge}。',
    vars: (c) => ({ Forge: c.upgraded ? 40 : 30 }),
    play: async (C) => { await C.forge(C.v('Forge')); },
  }),

  /* ================= 能力 ================= */
  ARSENAL: R({
    id: 'ARSENAL', name: '武器库', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    innateOnUpgrade: true,
    text: '你每打出一张无色牌，都获得{Str}点[gold]力量[/gold]。',
    vars: () => ({ Str: 1 }),
    play: async (C) => { await C.addPower('arsenal', C.v('Str')); },
  }),
  BLACK_HOLE: R({
    id: 'BLACK_HOLE', name: '黑洞', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你花费或获得[gold]星愿[/gold]时，对所有敌人造成{Dmg}点伤害。',
    vars: (c) => ({ Dmg: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.addPower('blackHole', C.v('Dmg')); },
  }),
  CHILD_OF_THE_STARS: R({
    id: 'CHILD_OF_THE_STARS', name: '群星之子', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你花费[gold]星愿[/gold]时，每花费一点[gold]星愿[/gold]，获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('childOfTheStars', C.v('Block')); },
  }),
  FURNACE: R({
    id: 'FURNACE', name: '熔炉', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '在你的回合开始时，[gold]铸造[/gold]{Forge}。',
    // GeneratedPowerEffects: FurnacePower 5m / 升级 +2m
    vars: (c) => ({ Forge: c.upgraded ? 7 : 5 }),
    play: async (C) => { await C.addPower('furnace', C.v('Forge')); },
  }),
  GENESIS: R({
    id: 'GENESIS', name: '创世纪', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '在你的回合开始时，获得{Stars}点[gold]星愿[/gold]。',
    vars: (c) => ({ Stars: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('genesis', C.v('Stars')); },
  }),
  METEOR_SHOWER: R({
    id: 'METEOR_SHOWER', name: '流星雨', type: 'attack', rarity: 'special', cost: 0, stars: 2, target: 'all',
    text: '对所有敌人造成{Damage}点伤害。\n给予所有敌人{Weak}层[gold]虚弱[/gold]和[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 21 : 14, Weak: 2, Vuln: 2 }),
    play: async (C) => {
      await C.attack(C.v('Damage'), { all: true });
      await C.addPowerAll('weak', C.v('Weak'));
      await C.addPowerAll('vulnerable', C.v('Vuln'));
    },
  }),
  MONARCHS_GAZE: R({
    id: 'MONARCHS_GAZE', name: '王之凝视', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    upgradeCost: 1,
    text: '每当你攻击敌人的时候，这名敌人在本回合失去{Str}点[gold]力量[/gold]。',
    vars: () => ({ Str: 1 }),
    play: async (C) => { await C.addPower('monarchsGaze', C.v('Str')); },
  }),
  NEUTRON_AEGIS: R({
    // GeneratedPowerEffects: PlatingPower 8m / 升级 +3m（Spec 本身全 0，层数由该映射施加）
    id: 'NEUTRON_AEGIS', name: '中子护盾', type: 'power', rarity: 'rare', cost: 1, stars: 5, target: 'self',
    text: '获得{Plating}层[gold]覆甲[/gold]。',
    vars: (c) => ({ Plating: c.upgraded ? 11 : 8 }),
    play: async (C) => { await C.addPower('plating', C.v('Plating')); },
  }),
  ORBIT: R({
    id: 'ORBIT', name: '环绕轨道', type: 'power', rarity: 'uncommon', cost: 2, target: 'self',
    upgradeCost: 1,
    text: '你每花费{Threshold}点能量，\n就获得{Energy}点[gold]能量[/gold]。',
    vars: () => ({ Threshold: 4, Energy: 1 }),
    play: async (C) => { await C.addPower('orbit', C.v('Energy')); },
  }),
  PALE_BLUE_DOT: R({
    // GeneratedPowerEffects: PaleBlueDotPower 1m / 升级 +1m，阈值 5（Power 源码里硬编码）
    id: 'PALE_BLUE_DOT', name: '暗淡蓝点', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '如果你在一回合内打出了大于等于{CardPlay}张牌，在下个回合开始时抽{Cards}张牌。',
    vars: (c) => ({ CardPlay: 5, Cards: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('paleBlueDot', C.v('Cards')); },
  }),
  PARRY: R({
    // GeneratedPowerEffects: ParryPower 10m / 升级 +4m
    id: 'PARRY', name: '招架', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你打出[gold]君王之剑[/gold]时，获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 14 : 10 }),
    play: async (C) => { await C.addPower('parry', C.v('Block')); },
  }),
  PILLAR_OF_CREATION: R({
    id: 'PILLAR_OF_CREATION', name: '创世之柱', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你生成一张卡牌，就获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('pillarOfCreation', C.v('Block')); },
  }),
  ROYALTIES: R({
    // GeneratedPowerEffects: RoyaltiesPower 30m / 升级 +10m。
    // 注：zhs/powers.json 的静态描述写 25，这里按 sts2-sim 的实际结算数值取 30/40。
    id: 'ROYALTIES', name: '王国资产', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '在战斗结束时，获得{Gold}点[gold]金币[/gold]。',
    vars: (c) => ({ Gold: c.upgraded ? 40 : 30 }),
    play: async (C) => { await C.addPower('royalties', C.v('Gold')); },
  }),
  SEEKING_EDGE: R({
    id: 'SEEKING_EDGE', name: '追踪之刃', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '[gold]铸造[/gold]{Forge}。\n[gold]君王之剑[/gold]现在会对所有敌人造成伤害。',
    // GeneratedPowerEffects: SeekingEdgePower 1m / 升级 +4m；sim 未移植该 Power 的独立实现，
    // 层数在本复刻里只作「存在即让君王之剑打全体」的标志（官方描述也是如此）。
    vars: (c) => ({ Forge: c.upgraded ? 11 : 7 }),
    play: async (C, c) => { await C.forge(C.v('Forge')); await C.addPower('seekingEdge', c.upgraded ? 5 : 1); },
  }),
  SPECTRUM_SHIFT: R({
    id: 'SPECTRUM_SHIFT', name: '光谱偏移', type: 'power', rarity: 'uncommon', cost: 2, target: 'self',
    upgradeCost: 1,
    text: '在你的回合开始时，将{Cards}张随机无色牌添加到你的[gold]手牌[/gold]中。',
    vars: () => ({ Cards: 1 }),
    play: async (C) => { await C.addPower('spectrumShift', C.v('Cards')); },
  }),
  SWORD_SAGE: R({
    id: 'SWORD_SAGE', name: '剑圣', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    upgradeCost: 1,
    text: '[gold]君王之剑[/gold]的耗能加1。[gold]君王之剑[/gold]现在会额外命中一次。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('swordSage', 1); },
  }),
  THE_SEALED_THRONE: R({
    id: 'THE_SEALED_THRONE', name: '封印王座', type: 'power', rarity: 'special', cost: 1, stars: 3, target: 'self',
    upgradeCost: 0,
    text: '你每打出一张牌，获得[gold]星愿[/gold]。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('sealedThrone', 1); },
  }),
  TYRANNY: R({
    id: 'TYRANNY', name: '暴政', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    innateOnUpgrade: true,
    text: '在你的回合开始时，抽一张牌，并从你的[gold]手牌[/gold]中[gold]消耗[/gold]1张牌。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('tyranny', 1); },
  }),
  VOID_FORM: R({
    // 简化：原版打出后立即结束回合，引擎无对应时机，省略
    id: 'VOID_FORM', name: '虚空形态', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    ethereal: true, noEtherealOnUpgrade: true,
    text: '结束你的回合。\n你可以免费打出每回合的前{Cards}张牌。',
    vars: () => ({ Cards: 2 }),
    play: async (C) => { await C.addPower('voidForm', C.v('Cards')); },
  }),
};

/** 君王之剑：铸造生成的衍生牌，不进普通奖励池 */
export const SOVEREIGN_BLADE = {
  id: 'SOVEREIGN_BLADE', name: '君王之剑', type: 'attack', rarity: 'token', char: 'TOKEN',
  cost: 2, target: 'enemy', retain: true,
  text: '造成{Damage}点伤害。\n[gold]保留[/gold]。',
  vars: (c) => ({ Damage: 10 + (c.bonus || 0) }),
  play: async (C) => {
    // 剑圣：额外命中一次；追踪之刃：改为打全体；征服者双倍由 calcPlayerAttack 处理
    const times = 1 + (C.player.powers.swordSage || 0);
    if (C.player.powers.seekingEdge) await C.attack(C.v('Damage'), { all: true, times });
    else await C.attack(C.v('Damage'), { times });
    if (C.player.powers.parry) await C.block(C.player.powers.parry);
  },
};
