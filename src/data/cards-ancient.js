/**
 * 先古（Ancient）稀有度牌与先古遗物附带的衍生牌 / 诅咒。
 * 数值对照 sts2-sim 的 Models/Cards/*.cs，中文取自官方 zhs 本地化。
 */
export const ANCIENT_CARDS = {
  /* ---------------- 先古稀有度 ---------------- */
  NEOWS_FURY: {
    id: 'NEOWS_FURY', char: 'NEUTRAL', name: '涅奥之怒', type: 'attack', rarity: 'ancient', cost: 1, target: 'enemy',
    exhaustOnPlay: true,
    text: '造成{Damage}点伤害。\n将你[gold]弃牌堆[/gold]中的{Cards}张随机牌放入你的[gold]手牌[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 14 : 10, Cards: c.upgraded ? 3 : 2 }),
    play: async (C, c) => {
      await C.attack(C.v('Damage'));
      const n = Math.min(C.v('Cards'), Math.max(0, 10 - C.hand.length));
      const taken = C.discardPile.splice(0, n);
      for (const card of taken) C.addCardToHand(card);
      if (taken.length) C.logEvent('play', `「涅奥之怒」取回 ${taken.length} 张牌`);
    },
  },
  RELAX: {
    id: 'RELAX', char: 'NEUTRAL', name: '放松', type: 'skill', rarity: 'ancient', cost: 3, target: 'self',
    exhaustOnPlay: true,
    text: '获得{Block}点[gold]格挡[/gold]。\n下个回合，抽{Cards}张牌并获得{Energy}点能量。',
    vars: (c) => ({ Block: c.upgraded ? 18 : 16, Cards: c.upgraded ? 3 : 2, Energy: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      await C.block(C.v('Block'));
      await C.addPower('drawNextTurn', C.v('Cards'));
      await C.addPower('energyNextTurn', C.v('Energy'));
    },
  },
  BRIGHTEST_FLAME: {
    id: 'BRIGHTEST_FLAME', char: 'NEUTRAL', name: '至亮之焰', type: 'skill', rarity: 'ancient', cost: 0, target: 'self',
    text: '获得{Energy}点能量。\n抽{Cards}张牌。\n失去{MaxHp}点最大生命。',
    vars: (c) => ({ Energy: c.upgraded ? 3 : 2, Cards: c.upgraded ? 3 : 2, MaxHp: 2 }),
    play: async (C) => {
      C.gainEnergy(C.v('Energy'));
      await C.draw(C.v('Cards'));
      C.loseMaxHp(C.v('MaxHp'));
    },
  },
  LUMINESCE: {
    id: 'LUMINESCE', char: 'NEUTRAL', name: '冷光', type: 'skill', rarity: 'token', cost: 0, target: 'self',
    exhaustOnPlay: true, retain: true,
    text: '获得{Energy}点能量。\n[gold]保留[/gold]。\n[gold]消耗[/gold]。',
    vars: (c) => ({ Energy: c.upgraded ? 3 : 2 }),
    play: async (C) => { C.gainEnergy(C.v('Energy')); },
  },
  WISH: {
    id: 'WISH', char: 'NEUTRAL', name: '许愿', type: 'skill', rarity: 'ancient', cost: 0, target: 'self',
    exhaustOnPlay: true, retainOnUpgrade: true,
    text: '将你[gold]抽牌堆[/gold]中的一张牌放入你的[gold]手牌[/gold]。',
    vars: () => ({}),
    play: async (C) => {
      const picked = await C.choose({ from: 'draw', count: 1, prompt: '「许愿」：选择一张牌加入手牌', optional: true });
      for (const card of picked) {
        const i = C.drawPile.indexOf(card);
        if (i >= 0) C.drawPile.splice(i, 1);
        C.addCardToHand(card);
      }
    },
  },
  APPARITION: {
    id: 'APPARITION', char: 'NEUTRAL', name: '灵体', type: 'skill', rarity: 'ancient', cost: 1, target: 'self',
    ethereal: true, exhaustOnPlay: true, noEtherealOnUpgrade: true,
    text: '获得{Intangible}层[gold]无实体[/gold]。\n[gold]虚无[/gold]。\n[gold]消耗[/gold]。',
    vars: () => ({ Intangible: 1 }),
    play: async (C) => { await C.addPower('intangible', 1); },
  },
  WHISTLE: {
    id: 'WHISTLE', char: 'NEUTRAL', name: '吹哨', type: 'attack', rarity: 'ancient', cost: 2, target: 'enemy',
    exhaustOnPlay: true,
    text: '造成{Damage}点伤害。\n[gold]击晕[/gold]该敌人。',
    vars: (c) => ({ Damage: c.upgraded ? 44 : 33 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) {
        t.pendingStun = true;
        C.msg(`${t.name} 被击晕`);
      }
    },
  },
  APOTHEOSIS: {
    id: 'APOTHEOSIS', char: 'NEUTRAL', name: '神化', type: 'skill', rarity: 'ancient', cost: 2, target: 'self',
    exhaustOnPlay: true, innate: true, upgradeCost: 1,
    text: '[gold]升级[/gold]你的全部卡牌。\n[gold]固有[/gold]。\n[gold]消耗[/gold]。',
    vars: () => ({}),
    play: async (C, c) => {
      for (const card of C.allCombatCards()) {
        if (card !== c && !card.upgraded) C.upgradeCard(card);
      }
    },
  },
  MAUL: {
    id: 'MAUL', char: 'NEUTRAL', name: '撕咬', type: 'attack', rarity: 'ancient', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害两次。\n在这场战斗中，将所有「撕咬」牌的伤害增加{Increase}点。',
    vars: (c) => ({
      Damage: (c.upgraded ? 6 : 5) + (c.maulBonus || 0),
      Increase: c.upgraded ? 3 : 2,
    }),
    play: async (C, c) => {
      await C.attack(C.v('Damage'), { times: 2 });
      const inc = c.upgraded ? 3 : 2;
      for (const card of C.allCombatCards()) {
        if (card.id === 'MAUL') card.maulBonus = (card.maulBonus || 0) + inc;
      }
    },
  },
  BREAK: {
    id: 'BREAK', char: 'IRONCLAD', name: '破击', type: 'attack', rarity: 'ancient', cost: 1, target: 'enemy',
    tags: ['strike'],
    text: '造成{Damage}点伤害。\n给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 30 : 20, Vuln: c.upgraded ? 7 : 5 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('vulnerable', C.v('Vuln'), t);
    },
  },
  SUPPRESS: {
    id: 'SUPPRESS', char: 'SILENT', name: '压制', type: 'attack', rarity: 'ancient', cost: 0, target: 'enemy',
    innate: true,
    text: '造成{Damage}点伤害。\n给予{Weak}层[gold]虚弱[/gold]。\n[gold]固有[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 17 : 11, Weak: c.upgraded ? 5 : 3 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('weak', C.v('Weak'), t);
    },
  },
  ABUNDANCE: {
    id: 'ABUNDANCE', char: 'NEUTRAL', name: '丰饶', type: 'skill', rarity: 'ancient', cost: 1, target: 'self',
    exhaustOnPlay: true, upgradeCost: 0,
    text: '获得一张升级过的随机能力牌。这张牌在本回合内可以免费打出。\n[gold]消耗[/gold]。',
    vars: () => ({}),
    play: async (C) => {
      const card = C.randomCardOfType('power');
      if (card) {
        C.upgradeCard(card);
        card.freeThisTurn = true;
        C.addCardToHand(card);
      }
    },
  },

  /* ---------------- 先古遗物附带的状态牌 / 诅咒 ---------------- */
  SOOT: {
    id: 'SOOT', name: '煤灰', type: 'status', rarity: 'status', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。',
    vars: () => ({}), play: async () => {},
  },
  GUILTY: {
    id: 'GUILTY', name: '愧疚', type: 'curse', rarity: 'curse', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。\n在5场战斗后从你的[gold]牌组[/gold]中移除。',
    vars: () => ({}), play: async () => {},
  },
  ENTHRALLED: {
    id: 'ENTHRALLED', name: '执迷', type: 'curse', rarity: 'curse', cost: 2, target: 'none',
    eternal: true,
    mustPlayFirst: true,
    text: '如果这张牌在你的[gold]手牌[/gold]中，你必须优先打出这张牌。',
    vars: () => ({}), play: async () => {},
  },
  FOLLY: {
    id: 'FOLLY', name: '愚行', type: 'curse', rarity: 'curse', cost: -1, target: 'none',
    unplayable: true, eternal: true, innate: true, ethereal: true,
    text: '无法被打出。\n[gold]固有[/gold]。\n[gold]虚无[/gold]。',
    vars: () => ({}), play: async () => {},
  },
  CURSE_OF_THE_BELL: {
    id: 'CURSE_OF_THE_BELL', name: '铃铛的诅咒', type: 'curse', rarity: 'curse', cost: -1, target: 'none',
    unplayable: true, eternal: true,
    text: '无法被打出。\n[gold]永恒[/gold]。',
    vars: () => ({}), play: async () => {},
  },
};
