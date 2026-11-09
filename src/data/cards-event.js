/**
 * 「被遗忘的旧日」牌池（CardRarity.Event / Quest / Curse）与事件专供的诅咒。
 * 数值与效果对照 sts2-sim 的 Models/Cards/*.cs，中文取自官方 zhs 本地化。
 * 这些牌只会由事件获得，不进战斗奖励池与商店。
 */
export const EVENT_CARDS = {
  /* ---------------- 事件牌 ---------------- */
  CALTROPS: {
    id: 'CALTROPS', name: '铁蒺藜', type: 'power', rarity: 'event', cost: 1, target: 'self',
    text: '每当你被攻击时，对攻击者造成{Thorns}点伤害。',
    vars: (c) => ({ Thorns: c.upgraded ? 5 : 3 }),
    play: async (C, c) => { await C.addPower('thorns', c.upgraded ? 5 : 3); },
  },
  CLASH: {
    id: 'CLASH', name: '交锋', type: 'attack', rarity: 'event', cost: 0, target: 'enemy',
    tags: ['strike'],
    text: '只有在[gold]手牌[/gold]中每一张牌都是攻击牌时才能被打出。\n造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 18 : 14 }),
    // 手牌里全是攻击牌才能打出
    canPlay: (C) => C.hand.every((x) => x.type === 'attack'),
    play: async (C) => { await C.attack(C.v('Damage')); },
  },
  DISTRACTION: {
    id: 'DISTRACTION', name: '声东击西', type: 'skill', rarity: 'event', cost: 1, target: 'self',
    exhaustOnPlay: true, upgradeCost: 0,
    text: '将一张随机技能牌添加到你的[gold]手牌[/gold]中。这张牌在本回合内可以免费打出。',
    vars: () => ({}),
    play: async (C) => {
      const card = C.randomCardOfType('skill');
      if (card) { card.freeThisTurn = true; C.addCardToHand(card); }
    },
  },
  DUAL_WIELD: {
    id: 'DUAL_WIELD', name: '双持', type: 'skill', rarity: 'event', cost: 1, target: 'self',
    text: '选择一张攻击牌或能力牌。将{IfUpgraded:show:{Cards}张此牌的复制品|一张此牌的复制品}加入你的[gold]手牌[/gold]。',
    vars: (c) => ({ IfUpgraded: 'show', Cards: 2 }),
    play: async (C, c) => {
      const picked = await C.choose({
        from: 'hand', count: 1, prompt: '选择一张攻击牌或能力牌',
        filter: (x) => x.type === 'attack' || x.type === 'power',
      });
      if (!picked.length) return;
      const times = c.upgraded ? 2 : 1;
      for (let i = 0; i < times; i++) C.addCardToHand(C.makeCard(picked[0].id, picked[0].upgraded));
    },
  },
  ENTRENCH: {
    id: 'ENTRENCH', name: '巩固', type: 'skill', rarity: 'event', cost: 2, target: 'self',
    upgradeCost: 1,
    text: '将你当前的[gold]格挡[/gold]翻倍。',
    vars: () => ({}),
    play: async (C) => { await C.block(C.player.block, { raw: true }); },
  },
  HELLO_WORLD: {
    id: 'HELLO_WORLD', name: '你好世界', type: 'power', rarity: 'event', cost: 1, target: 'self',
    innateOnUpgrade: true,
    text: '在你的回合开始时，将一张随机普通牌加入你的[gold]手牌[/gold]。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('helloWorld', 1); },
  },
  OUTMANEUVER: {
    id: 'OUTMANEUVER', name: '抢占先机', type: 'skill', rarity: 'event', cost: 1, target: 'self',
    text: '在下个回合获得{Energy}。',
    vars: (c) => ({ Energy: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('energyNextTurn', C.v('Energy')); },
  },
  REBOUND: {
    id: 'REBOUND', name: '弹回', type: 'attack', rarity: 'event', cost: 1, target: 'enemy',
    tags: ['strike'],
    text: '造成{Damage}点伤害。\n将你在本回合打出的下一张牌放置到你的[gold]抽牌堆[/gold]顶部。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 9 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      await C.addPower('rebound', 1);
    },
  },
  RIP_AND_TEAR: {
    id: 'RIP_AND_TEAR', name: '狂乱撕扯', type: 'attack', rarity: 'event', cost: 1, target: 'self',
    text: '随机对敌人造成{Damage}点伤害两次。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 7 }),
    play: async (C) => { await C.attack(C.v('Damage'), { random: true, times: 2 }); },
  },
  STACK: {
    id: 'STACK', name: '堆栈', type: 'skill', rarity: 'event', cost: 1, target: 'self',
    text: '获得等量于你[gold]弃牌堆[/gold]中牌数{IfUpgraded:show:+{Bonus}}的[gold]格挡[/gold]。',
    vars: (c) => ({ IfUpgraded: 'show', Bonus: 3 }),
    play: async (C, c) => { await C.block(C.discardPile.length + (c.upgraded ? 3 : 0)); },
  },
  FEEDING_FRENZY: {
    id: 'FEEDING_FRENZY', name: '疯狂进食', type: 'skill', rarity: 'event', cost: 0, target: 'self',
    text: '在本回合内获得{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Str: c.upgraded ? 7 : 5 }),
    play: async (C) => { await C.addPower('strengthTemp', C.v('Str')); },
  },
  // 异鸟宝宝（ByrdSwoop.cs）：0 费 14 伤害，升级 +4
  BYRD_SWOOP: {
    id: 'BYRD_SWOOP', name: '异鸟扑击', type: 'attack', rarity: 'event', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 18 : 14 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  },
  SPOILS_MAP: {
    id: 'SPOILS_MAP', name: '藏宝图', type: 'quest', rarity: 'quest', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。\n在下一幕的地图上标记一个有额外[gold]金币[/gold]的地点。',
    vars: () => ({}), play: async () => {},
  },
  // 多尼斯异鸟蛋（ByrdonisEgg.cs）：任务牌，休息处可孵化
  BYRDONIS_EGG: {
    id: 'BYRDONIS_EGG', name: '多尼斯异鸟蛋', type: 'quest', rarity: 'quest', cost: -1, target: 'none', unplayable: true,
    text: '能在[gold]休息处[/gold]被孵化。',
    vars: () => ({}), play: async () => {},
  },

  /* ---------------- 诅咒 ---------------- */
  INJURY: {
    id: 'INJURY', name: '受伤', type: 'curse', rarity: 'curse', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。',
    vars: () => ({}), play: async () => {},
  },
  GREED: {
    id: 'GREED', name: '贪婪', type: 'curse', rarity: 'curse', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。\n[gold]永恒[/gold]。',
    vars: () => ({}), play: async () => {},
  },
  CLUMSY: {
    id: 'CLUMSY', name: '笨拙', type: 'curse', rarity: 'curse', cost: -1, target: 'none', unplayable: true, ethereal: true,
    text: '无法被打出。\n[gold]虚无[/gold]。',
    vars: () => ({}), play: async () => {},
  },
  WRITHE: {
    id: 'WRITHE', name: '苦恼', type: 'curse', rarity: 'curse', cost: -1, target: 'none', unplayable: true, innate: true,
    text: '无法被打出。\n[gold]固有[/gold]。',
    vars: () => ({}), play: async () => {},
  },
  DEBT: {
    id: 'DEBT', name: '债务', type: 'curse', rarity: 'curse', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。\n在你的回合结束时，如果这张牌在你的[gold]手牌[/gold]中，则失去10[gold]金币[/gold]。',
    vars: () => ({}), play: async () => {},
  },
  // 无休之处（PoorSleep.cs）：不可打出 + 保留，没有任何主动效果
  POOR_SLEEP: {
    id: 'POOR_SLEEP', name: '睡眠不佳', type: 'curse', rarity: 'curse', cost: -1, target: 'none', unplayable: true, retain: true,
    text: '无法被打出。\n[gold]保留[/gold]。',
    vars: () => ({}), play: async () => {},
  },
};
