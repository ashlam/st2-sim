/**
 * 遗物与药水。数值参考原作（部分为简化实现，文本已按官方中文本地化改写）
 */
export const RELICS = {
  RING_OF_THE_SNAKE: {
    name: '蛇之戒指', icon: '💍', rarity: 'starter',
    desc: '战斗开始时额外抽2张牌。',
    onCombatStart: async (C) => { C.firstTurnDraw += 2; },
  },
  CRACKED_CORE: {
    name: '破损核心', icon: '🔋', rarity: 'starter',
    desc: '战斗开始时，生成1个闪电充能球。',
    onCombatStart: async (C) => { await C.channelOrb('LIGHTNING'); },
  },
  BURNING_BLOOD: {
    name: '燃烧之血', icon: '🩸', rarity: 'starter', color: 'red',
    desc: '战斗结束时，回复6点生命。',
    onCombatEnd: (C) => C.healPlayer(6),
  },
  VAJRA: {
    name: '金刚杵', icon: '🔱', rarity: 'common',
    desc: '战斗开始时，获得1点力量。',
    onCombatStart: async (C) => { await C.addPower('strength', 1); },
  },
  BAG_OF_MARBLES: {
    name: '弹珠袋', icon: '🔮', rarity: 'common',
    desc: '战斗开始时，给予所有敌人1层易伤。',
    onCombatStart: async (C) => { await C.addPowerAll('vulnerable', 1); },
  },
  ANCHOR: {
    name: '锚', icon: '⚓', rarity: 'common',
    desc: '战斗开始时获得10点格挡。',
    onCombatStart: async (C) => { await C.block(10, { silent: true }); },
  },
  BLOOD_VIAL: {
    name: '小血瓶', icon: '🧪', rarity: 'common',
    desc: '战斗开始时，回复2点生命。',
    onCombatStart: async (C) => { C.healPlayer(2); },
  },
  LANTERN: {
    name: '灯笼', icon: '🏮', rarity: 'common',
    desc: '每场战斗的第一回合获得1点能量。',
    onTurnStart: async (C, turn) => { if (turn === 1) C.gainEnergy(1); },
  },
  ODDLY_SMOOTH_STONE: {
    name: '意外光滑的石头', icon: '⚪', rarity: 'common',
    desc: '战斗开始时，获得1点敏捷。',
    onCombatStart: async (C) => { await C.addPower('dexterity', 1); },
  },
  AKABEKO: {
    name: '赤牛', icon: '🐂', rarity: 'uncommon',
    desc: '战斗开始时，获得8点活力（下一张攻击牌伤害+8）。',
    onCombatStart: async (C) => { C.player.vigor = 8; },
  },
  BRONZE_SCALES: {
    name: '铜质鳞片', icon: '🛡️', rarity: 'uncommon',
    desc: '战斗开始时，获得3点荆棘。',
    onCombatStart: async (C) => { await C.addPower('thorns', 3); },
  },
  MEAT_ON_THE_BONE: {
    name: '带骨肉', icon: '🍖', rarity: 'uncommon',
    desc: '战斗结束时若生命值不高于50%，回复12点生命。',
    onCombatEnd: (C) => { if (C.run.hp <= C.run.maxHp * 0.5) C.healPlayer(12); },
  },
  ORICHALCUM: {
    name: '奥利哈钢', icon: '🟩', rarity: 'uncommon',
    desc: '回合结束时若没有格挡，获得6点格挡。',
    onTurnEnd: async (C) => { if (C.player.block === 0) await C.block(6, { silent: true }); },
  },
  BAG_OF_PREPARATION: {
    name: '准备背包', icon: '🎒', rarity: 'common',
    desc: '战斗开始时额外抽2张牌。',
    onCombatStart: async (C) => { C.firstTurnDraw += 2; },
  },
  PEN_NIB: {
    name: '钢笔尖', icon: '🖊️', rarity: 'uncommon',
    desc: '每打出的第10张攻击牌造成双倍伤害。',
    onCombatStart: async (C) => { C.player.penNib = C.player.penNib || 0; },
  },
  HAPPY_FLOWER: {
    name: '开心小花', icon: '🌻', rarity: 'common',
    desc: '每3个回合，获得1点能量。',
    onTurnStart: async (C, turn) => { if (turn % 3 === 0) C.gainEnergy(1); },
  },
  ICE_CREAM: {
    name: '冰淇淋', icon: '🍦', rarity: 'rare',
    desc: '多余的能量可以留到下一回合。',
  },
  KUNAI: {
    name: '苦无', icon: '🗡️', rarity: 'uncommon',
    desc: '同一回合内每打出3张攻击牌，获得1点敏捷。',
  },
  SHURIKEN: {
    name: '手里剑', icon: '🌟', rarity: 'uncommon',
    desc: '同一回合内每打出3张攻击牌，获得1点力量。',
  },
  SNECKO_EYE: {
    name: '异蛇之眼', icon: '🐍', rarity: 'boss',
    desc: '每回合多抽2张牌。每场战斗开始时获得混乱：卡牌耗能随机。',
    onCombatStart: async (C) => { C.confusion = true; C.extraDrawPerTurn += 2; },
  },
  RUNIC_PYRAMID: {
    name: '符文金字塔', icon: '🔺', rarity: 'boss',
    desc: '回合结束时不再自动丢弃手牌。',
  },
  SOZU: {
    name: '添水', icon: '🍵', rarity: 'boss',
    desc: '每回合开始时获得1点能量，但你无法再获得药水。',
    onTurnStart: async (C) => { C.gainEnergy(1); },
  },
  PHILOSOPHERS_STONE: {
    name: '贤者之石', icon: '💎', rarity: 'boss',
    desc: '每回合开始时获得1点能量。所有敌人初始获得1点力量。',
    onCombatStart: async (C) => { for (const e of C.alive()) await C.enemyPower(e, 'strength', 1); },
    onTurnStart: async (C) => { C.gainEnergy(1); },
  },
  ART_OF_WAR: {
    name: '孙子兵法', icon: '📜', rarity: 'uncommon',
    desc: '若本回合没有打出攻击牌，下回合额外获得1点能量。',
  },
  JUZU_BRACELET: {
    name: '佛珠手链', icon: '📿', rarity: 'rare',
    desc: '在“?”房间中不会再遭遇普通战斗。',
  },
  GIRYA: {
    name: '壶铃', icon: '🏋️', rarity: 'uncommon',
    desc: '在休息处可以锻炼获得1点力量（最多3次）。',
  },
  ETERNAL_FEATHER: {
    name: '永恒羽毛', icon: '🍃', rarity: 'uncommon',
    desc: '牌组中每有5张牌，进入休息处时回复3点生命。',
  },

  /* ---------- 亡灵契约师 ---------- */
  BOUND_PHYLACTERY: {
    name: '缚魂命匣', icon: '⚱️', rarity: 'starter', char: 'NECROBINDER',
    desc: '战斗开始时召唤1。你的第2回合起，每回合开始时再召唤1。',
    onCombatStart: async (C) => { if (C.necro) await C.necro.summon(1); },
    onTurnStart: async (C, turn) => { if (C.necro && turn > 1) await C.necro.summon(1); },
  },
  BONE_FLUTE: {
    name: '骨笛', icon: '🦴', rarity: 'common', char: 'NECROBINDER',
    desc: '每当奥斯提攻击时，获得2点格挡。',
  },
  FUNERARY_MASK: {
    name: '葬礼面具', icon: '🎭', rarity: 'uncommon', char: 'NECROBINDER',
    desc: '战斗开始时，将3张灵魂洗入你的抽牌堆。',
  },
  BOOK_REPAIR_KNIFE: {
    name: '修书小刀', icon: '🔪', rarity: 'uncommon', char: 'NECROBINDER',
    desc: '每当有一名不是爪牙的敌人死于灾厄时，回复3点生命。',
  },
  BIG_HAT: {
    name: '大帽子', icon: '🎩', rarity: 'rare', char: 'NECROBINDER',
    desc: '战斗开始时，将2张随机虚无牌加入你的手牌。',
  },
  BOOKMARK: {
    name: '书签', icon: '🔖', rarity: 'rare', char: 'NECROBINDER',
    desc: '每回合结束时，随机一张被保留的牌在被打出前的耗能减少1。',
  },
  IVORY_TILE: {
    name: '象牙麻将牌', icon: '🀄', rarity: 'rare', char: 'NECROBINDER',
    desc: '每当你打出一张耗能大于等于3的牌时，获得1点能量。',
  },
  UNDYING_SIGIL: {
    name: '不死符文', icon: '🕯️', rarity: 'shop', char: 'NECROBINDER',
    desc: '当敌人的灾厄层数大于等于其生命值时，它造成的伤害降低50%。',
  },
  /* ---- 储君专属遗物：RegentRelicPool（v0.111.0，8 件） ---- */
  DIVINE_RIGHT: {
    name: '天赋君权', icon: '👑', rarity: 'starter', char: 'REGENT',
    desc: '每场战斗开始时，获得3点[gold]星愿[/gold]。',
    onCombatStart: async (C) => { await C.gainStars(3); },
  },
  FENCING_MANUAL: {
    name: '击剑指南', icon: '📖', rarity: 'common', char: 'REGENT',
    desc: '每场战斗开始时，[gold]铸造[/gold]10。',
    onTurnStart: async (C, turn) => { if (turn === 1) await C.forge(10); },
  },
  GALACTIC_DUST: {
    name: '星系尘埃', icon: '✨', rarity: 'uncommon', char: 'REGENT',
    desc: '每累计花费10点[gold]星愿[/gold]，获得10点[gold]格挡[/gold]。',
  },
  REGALITE: {
    name: '君王矿石', icon: '💠', rarity: 'uncommon', char: 'REGENT',
    desc: '每回合第一次生成无色牌时，获得4点[gold]格挡[/gold]。',
  },
  LUNAR_PASTRY: {
    name: '月亮糕点', icon: '🌙', rarity: 'rare', char: 'REGENT',
    desc: '在你的回合结束时，获得1点[gold]星愿[/gold]。',
    onTurnEnd: async (C) => { await C.gainStars(1); },
  },
  MINI_REGENT: {
    name: '迷你储君', icon: '🧸', rarity: 'rare', char: 'REGENT',
    desc: '每回合第一次花费[gold]星愿[/gold]时，获得1点[gold]力量[/gold]。',
  },
  ORANGE_DOUGH: {
    name: '橙色团块', icon: '🍊', rarity: 'rare', char: 'REGENT',
    desc: '每场战斗开始时，将2张随机无色牌加入你的手牌。',
    onTurnStart: async (C, turn) => {
      if (turn !== 1) return;
      for (let i = 0; i < 2; i++) {
        const card = C.randomCardOfType('skill');
        if (card) { card.colorless = true; C.addCardToHand(card); }
      }
    },
  },
  VITRUVIAN_MINION: {
    name: '维特鲁威仆从', icon: '🗿', rarity: 'shop', char: 'REGENT',
    desc: '带「仆从」标签的卡牌造成双倍的伤害与[gold]格挡[/gold]。',
  },
};

export const RELIC_POOLS = {
  common: ['VAJRA', 'BAG_OF_MARBLES', 'ANCHOR', 'BLOOD_VIAL', 'LANTERN', 'ODDLY_SMOOTH_STONE', 'BAG_OF_PREPARATION', 'HAPPY_FLOWER', 'BONE_FLUTE', 'FENCING_MANUAL'],
  uncommon: ['AKABEKO', 'BRONZE_SCALES', 'MEAT_ON_THE_BONE', 'ORICHALCUM', 'PEN_NIB', 'KUNAI', 'SHURIKEN', 'ART_OF_WAR', 'GIRYA', 'ETERNAL_FEATHER', 'FUNERARY_MASK', 'BOOK_REPAIR_KNIFE', 'GALACTIC_DUST', 'REGALITE'],
  rare: ['ICE_CREAM', 'JUZU_BRACELET', 'BIG_HAT', 'BOOKMARK', 'IVORY_TILE', 'LUNAR_PASTRY', 'MINI_REGENT', 'ORANGE_DOUGH'],
  boss: ['SNECKO_EYE', 'RUNIC_PYRAMID', 'SOZU', 'PHILOSOPHERS_STONE'],
  shop: ['AKABEKO', 'BRONZE_SCALES', 'ORICHALCUM', 'PEN_NIB', 'KUNAI', 'SHURIKEN', 'ICE_CREAM', 'UNDYING_SIGIL', 'VITRUVIAN_MINION', 'GALACTIC_DUST'],
};

/* ================= 药水 ================= */
export const POTIONS = {
  HEAL_POTION: {
    name: '治疗药水', icon: '💗', rarity: 'common', target: 'self', desc: '回复20点生命。',
    use: (C) => { C.healPlayer(20); },
  },
  STRENGTH_POTION: {
    name: '力量药水', icon: '💪', rarity: 'common', target: 'self', desc: '获得2点力量。',
    use: async (C) => { await C.addPower('strength', 2); },
  },
  DEXTERITY_POTION: {
    name: '敏捷药水', icon: '🤸', rarity: 'common', target: 'self', desc: '获得2点敏捷。',
    use: async (C) => { await C.addPower('dexterity', 2); },
  },
  BLOCK_POTION: {
    name: '格挡药水', icon: '🔵', rarity: 'common', target: 'self', desc: '获得12点格挡。',
    use: async (C) => { await C.block(12); },
  },
  ENERGY_POTION: {
    name: '能量药水', icon: '⚡', rarity: 'common', target: 'self', desc: '获得2点能量。',
    use: (C) => { C.gainEnergy(2); },
  },
  FIRE_POTION: {
    name: '火焰药水', icon: '🔥', rarity: 'common', target: 'enemy', desc: '对一名敌人造成20点伤害。',
    use: async (C) => { await C.attack(20, { noStrength: true, isPotion: true }); },
  },
  EXPLOSIVE_POTION: {
    name: '爆炸药水', icon: '💥', rarity: 'uncommon', target: 'self', desc: '对所有敌人造成10点伤害。',
    use: async (C) => { await C.attack(10, { all: true, noStrength: true, isPotion: true }); },
  },
  SWIFT_POTION: {
    name: '迅捷药水', icon: '💨', rarity: 'common', target: 'self', desc: '抽3张牌。',
    use: async (C) => { await C.draw(3); },
  },
  WEAK_POTION: {
    name: '虚弱药水', icon: '💧', rarity: 'common', target: 'self', desc: '给予所有敌人3层虚弱。',
    use: async (C) => { await C.addPowerAll('weak', 3); },
  },
  VULNERABLE_POTION: {
    name: '易伤药水', icon: '🎯', rarity: 'common', target: 'self', desc: '给予所有敌人3层易伤。',
    use: async (C) => { await C.addPowerAll('vulnerable', 3); },
  },
  BLOOD_POTION: {
    name: '血液药水', icon: '🧫', rarity: 'uncommon', target: 'self', desc: '回复最大生命值20%的生命。',
    use: (C) => { C.healPlayer(Math.floor(C.run.maxHp * 0.2)); },
  },
  REGEN_POTION: {
    name: '再生药水', icon: '🌱', rarity: 'uncommon', target: 'self', desc: '获得5层再生。',
    use: async (C) => { await C.addPower('regen', 5); },
  },
  ASHWATER: {
    name: '灰水', icon: '🍶', rarity: 'uncommon', target: 'self', desc: '消耗你手牌中的任意张牌。',
    special: 'ashwater',
  },

  /* ---------- 亡灵契约师 ---------- */
  POTION_OF_DOOM: {
    name: '灾厄药水', icon: '☠️', rarity: 'common', target: 'enemy', char: 'NECROBINDER', desc: '给予33层灾厄。',
    use: async (C) => { if (C.necro) await C.necro.addDoom(33, C.target); },
  },
  POT_OF_GHOULS: {
    name: '尸鬼瓮', icon: '🏺', rarity: 'rare', target: 'self', char: 'NECROBINDER', desc: '将2张灵魂加入你的手牌。',
    use: async (C) => { if (C.necro) await C.necro.addSoul(2, 'hand'); },
  },
  BONE_BREW: {
    name: '骨头酿', icon: '🧴', rarity: 'uncommon', target: 'self', char: 'NECROBINDER', desc: '召唤15。',
    use: async (C) => { if (C.necro) await C.necro.summon(15); },
  },
};

export const POTION_POOL = {
  common: ['HEAL_POTION', 'STRENGTH_POTION', 'DEXTERITY_POTION', 'BLOCK_POTION', 'ENERGY_POTION', 'FIRE_POTION', 'SWIFT_POTION', 'WEAK_POTION', 'VULNERABLE_POTION', 'POTION_OF_DOOM'],
  uncommon: ['EXPLOSIVE_POTION', 'BLOOD_POTION', 'REGEN_POTION', 'ASHWATER', 'BONE_BREW'],
  rare: ['BLOOD_POTION', 'POT_OF_GHOULS'],
};
