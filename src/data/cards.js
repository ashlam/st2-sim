/**
 * 卡牌数据 —— 数值取自 sts2-sim（v0.111.0 移植）源码，文本对照官方 zhs 本地化改写。
 * 变量写法：{Damage} / {Block} / {Cards} ...，渲染时替换为当前（含升级/战斗中修正）数值。
 */
import { uid } from '../engine/rng.js';

const S = (extra) => ({ tags: ['strike'], ...extra });

export const CARDS = {
  /* ================= 基础 ================= */
  STRIKE_IRONCLAD: {
    id: 'STRIKE_IRONCLAD', name: '打击', type: 'attack', rarity: 'basic', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6 }),
    play: async (C, c) => { await C.attack(C.v('Damage')); },
  },
  DEFEND_IRONCLAD: {
    id: 'DEFEND_IRONCLAD', name: '防御', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    tags: ['defend'], text: '获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); },
  },
  BASH: {
    id: 'BASH', name: '痛击', type: 'attack', rarity: 'basic', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 8, Vuln: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('vulnerable', C.v('Vuln'), t);
    },
  },

  /* ================= 普通 · 攻击 ================= */
  ANGER: {
    id: 'ANGER', name: '愤怒', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n将一张此牌的复制品加入你的[gold]弃牌堆[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 8 : 6 }),
    play: async (C, c) => {
      await C.attack(C.v('Damage'));
      await C.addCard(c.id, 'discard', c.upgraded);
    },
  },
  TWIN_STRIKE: {
    id: 'TWIN_STRIKE', name: '双重打击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害两次。',
    vars: (c) => ({ Damage: c.upgraded ? 7 : 5 }),
    play: async (C) => { await C.attack(C.v('Damage'), { times: 2 }); },
  },
  IRON_WAVE: {
    id: 'IRON_WAVE', name: '铁斩波', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '获得{Block}点[gold]格挡[/gold]。\n造成{Damage}点伤害。',
    vars: (c) => ({ Block: c.upgraded ? 7 : 5, Damage: c.upgraded ? 7 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); await C.attack(C.v('Damage')); },
  },
  BODY_SLAM: {
    id: 'BODY_SLAM', name: '全身撞击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成等同于你当前[gold]格挡[/gold]值的伤害。',
    vars: () => ({}),
    play: async (C) => { await C.attack(C.player.block, { noStrength: true }); },
    upgradeCost: 0,
  },
  BREAKTHROUGH: {
    id: 'BREAKTHROUGH', name: '突破', type: 'attack', rarity: 'common', cost: 1, target: 'all',
    text: '失去1点生命。\n对所有敌人造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 9 }),
    play: async (C) => { await C.loseHp(1); await C.attack(C.v('Damage'), { all: true }); },
  },
  CINDER: {
    id: 'CINDER', name: '余烬', type: 'attack', rarity: 'common', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n[gold]消耗[/gold]你[gold]抽牌堆[/gold]顶部的牌。',
    vars: (c) => ({ Damage: c.upgraded ? 24 : 18 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      await C.exhaustTopOfDraw();
    },
  },
  HEADBUTT: {
    id: 'HEADBUTT', name: '头槌', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n将你[gold]弃牌堆[/gold]中的一张牌放到[gold]抽牌堆[/gold]顶部。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 9 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      const chosen = await C.choose({ from: 'discard', count: 1, prompt: '选择一张牌放到抽牌堆顶部', optional: true });
      if (chosen.length) C.putOnDrawTop(chosen[0]);
    },
  },
  MOLTEN_FIST: {
    id: 'MOLTEN_FIST', name: '熔融之拳', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n将该敌人身上的[gold]易伤[/gold]层数翻倍。',
    vars: (c) => ({ Damage: c.upgraded ? 14 : 10 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (!t || !t.alive) return;
      const v = t.powers.vulnerable || 0;
      if (v > 0) await C.addPower('vulnerable', v, t);
    },
  },
  PERFECTED_STRIKE: {
    id: 'PERFECTED_STRIKE', name: '完美打击', type: 'attack', rarity: 'common', cost: 2, target: 'enemy',
    tags: ['strike'],
    text: '造成{Damage}点伤害。\n你每有一张名字中带有“打击”的牌，伤害+{Extra}。',
    vars: (c, C) => {
      const strikes = C ? C.countStrikes() : 0;
      const extra = c.upgraded ? 3 : 2;
      return { Damage: 6 + extra * strikes, Extra: extra };
    },
    play: async (C) => { await C.attack(C.v('Damage')); },
  },
  POMMEL_STRIKE: {
    id: 'POMMEL_STRIKE', name: '剑柄打击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。\n抽{Cards}张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 9, Cards: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.draw(C.v('Cards')); },
  },
  SETUP_STRIKE: {
    id: 'SETUP_STRIKE', name: '预备打击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。\n在本回合内获得{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 7, Str: c.upgraded ? 4 : 3 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      await C.addPower('strengthTemp', C.v('Str'));
    },
  },
  SWORD_BOOMERANG: {
    id: 'SWORD_BOOMERANG', name: '飞剑回旋镖', type: 'attack', rarity: 'common', cost: 1, target: 'random',
    text: '随机对敌人造成{Damage}点伤害{Damage}次。',
    vars: (c) => ({ Damage: 3 }),
    textFn: (c) => `随机对敌人造成3点伤害${c.upgraded ? 4 : 3}次。`,
    play: async (C, c) => { await C.attack(3, { times: c.upgraded ? 4 : 3, random: true }); },
  },
  THUNDERCLAP: {
    id: 'THUNDERCLAP', name: '闪电霹雳', type: 'attack', rarity: 'common', cost: 1, target: 'all',
    text: '对所有敌人造成{Damage}点伤害，给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 7 : 4, Vuln: 1 }),
    play: async (C) => {
      await C.attack(C.v('Damage'), { all: true });
      await C.addPowerAll('vulnerable', C.v('Vuln'));
    },
  },

  /* ================= 普通 · 技能 ================= */
  ARMAMENTS: {
    id: 'ARMAMENTS', name: '武装', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得5点[gold]格挡[/gold]。\n[gold]升级[/gold]你[gold]手牌[/gold]中的{Up}。',
    vars: (c) => ({ Up: c.upgraded ? '所有牌' : '一张牌' }),
    play: async (C, c) => {
      await C.block(5);
      const list = C.hand.filter(x => !x.upgraded && !x.unplayable);
      if (!list.length) return;
      if (c.upgraded) { for (const x of list) C.upgradeCard(x); }
      else {
        const chosen = await C.choose({ from: 'hand', count: 1, filter: x => !x.upgraded, prompt: '选择一张牌升级' });
        if (chosen.length) C.upgradeCard(chosen[0]);
      }
    },
  },
  BLOOD_WALL: {
    id: 'BLOOD_WALL', name: '血墙', type: 'skill', rarity: 'common', cost: 2, target: 'self',
    text: '失去2点生命。\n获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 20 : 16 }),
    play: async (C) => { await C.loseHp(2); await C.block(C.v('Block')); },
  },
  HAVOC: {
    id: 'HAVOC', name: '破灭', type: 'skill', rarity: 'common', cost: 1, target: 'none',
    text: '打出[gold]抽牌堆[/gold]顶部的牌并将其[gold]消耗[/gold]。',
    vars: () => ({}),
    play: async (C) => { await C.playTopOfDraw(true); },
    upgradeCost: 0,
  },
  SHRUG_IT_OFF: {
    id: 'SHRUG_IT_OFF', name: '耸肩无视', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n抽{Cards}张牌。',
    vars: (c) => ({ Block: c.upgraded ? 11 : 8, Cards: 1 }),
    play: async (C) => { await C.block(C.v('Block')); await C.draw(1); },
  },
  TRUE_GRIT: {
    id: 'TRUE_GRIT', name: '坚毅', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n{Ex}',
    vars: (c) => ({ Block: c.upgraded ? 9 : 7, Ex: c.upgraded ? '随机[gold]消耗[/gold]1张牌。' : '[gold]消耗[/gold]1张牌。' }),
    play: async (C, c) => {
      await C.block(C.v('Block'));
      if (c.upgraded) await C.exhaustRandom(1);
      else {
        const chosen = await C.choose({ from: 'hand', count: 1, prompt: '选择一张牌消耗' });
        if (chosen.length) await C.exhaustCard(chosen[0]);
      }
    },
  },
  TAUNT: {
    id: 'TAUNT', name: '挑衅', type: 'skill', rarity: 'common', cost: 1, target: 'enemy',
    text: '获得{Block}点[gold]格挡[/gold]。\n给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 7 : 6, Vuln: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addPower('vulnerable', C.v('Vuln'), C.target); },
  },
  TREMBLE: {
    id: 'TREMBLE', name: '战栗', type: 'skill', rarity: 'common', cost: 1, target: 'enemy',
    text: '给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Vuln: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.addPower('vulnerable', C.v('Vuln'), C.target); },
  },

  /* ================= 罕见 · 攻击 ================= */
  DISMANTLE: {
    id: 'DISMANTLE', name: '拆卸', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n如果该敌人有[gold]易伤[/gold]状态，则攻击两次。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 8 }),
    play: async (C) => {
      const t = C.target;
      const twice = ((t && t.powers.vulnerable) || 0) > 0;
      await C.attack(C.v('Damage'), { times: twice ? 2 : 1, target: t });
    },
  },
  HEMOKINESIS: {
    id: 'HEMOKINESIS', name: '御血术', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '失去2点生命。\n造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 20 : 15 }),
    play: async (C) => { await C.loseHp(2); await C.attack(C.v('Damage')); },
  },
  HOWL_FROM_BEYOND: {
    id: 'HOWL_FROM_BEYOND', name: '彼岸咆哮', type: 'attack', rarity: 'uncommon', cost: 3, target: 'all',
    text: '对所有敌人造成{Damage}点伤害。\n在你的回合开始时，从[gold]消耗牌堆[/gold]将此牌打出。',
    vars: (c) => ({ Damage: c.upgraded ? 24 : 18 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true }); },
  },
  PILLAGE: {
    id: 'PILLAGE', name: '劫掠', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n抽牌直到你抽到一张攻击牌。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      let guard = 0;
      while (guard++ < 20) {
        const drawn = await C.draw(1);
        if (!drawn.length) break;
        if (drawn[0].type === 'attack') break;
      }
    },
  },
  RAMPAGE: {
    id: 'RAMPAGE', name: '暴走', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n将这张牌在本场战斗中的伤害增加{Inc}。',
    vars: (c, C, card) => ({ Damage: (card?.bonus || 0) + 10, Inc: c.upgraded ? 10 : 5 }),
    play: async (C, c) => { await C.attack(C.v('Damage')); c.bonus = (c.bonus || 0) + (c.upgraded ? 10 : 5); },
  },
  SPITE: {
    id: 'SPITE', name: '怨恨', type: 'attack', rarity: 'uncommon', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n如果你在本回合失去过生命值，则攻击{Rep}次。',
    vars: (c) => ({ Damage: 5, Rep: c.upgraded ? 3 : 2 }),
    play: async (C, c) => {
      const times = C.hpLostThisTurn > 0 ? (c.upgraded ? 3 : 2) : 1;
      await C.attack(5, { times });
    },
  },
  STOMP: {
    id: 'STOMP', name: '踩踏', type: 'attack', rarity: 'uncommon', cost: 3, target: 'all',
    text: '对所有敌人造成{Damage}点伤害。\n你在本回合中每打出过一张攻击牌，其耗能减少1。',
    vars: (c) => ({ Damage: c.upgraded ? 15 : 12 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true }); },
    costMod: (card, C) => -C.attacksPlayedThisTurn,
  },
  UNRELENTING: {
    id: 'UNRELENTING', name: '无情猛攻', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n你打出的下一张攻击牌耗能变为0。',
    vars: (c) => ({ Damage: c.upgraded ? 20 : 14 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.addPower('freeAttack', 1); },
  },
  UPPERCUT: {
    id: 'UPPERCUT', name: '上勾拳', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{P}层[gold]虚弱[/gold]。\n给予{P}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: 13, P: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(13, { target: t });
      if (!t || !t.alive) return;
      await C.addPower('weak', C.v('P'), t);
      await C.addPower('vulnerable', C.v('P'), t);
    },
  },
  WHIRLWIND: {
    id: 'WHIRLWIND', name: '旋风斩', type: 'attack', rarity: 'uncommon', cost: 'X', target: 'all',
    text: '对所有敌人造成{Damage}点伤害X次。',
    vars: (c) => ({ Damage: c.upgraded ? 8 : 5 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true, times: C.xValue || 1 }); },
  },
  THRASH_UNUSED: null,

  /* ================= 罕见 · 技能 ================= */
  BATTLE_TRANCE: {
    id: 'BATTLE_TRANCE', name: '战斗专注', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    text: '抽{Cards}张牌。\n你在本回合内不能再抽任何牌。',
    vars: (c) => ({ Cards: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.draw(C.v('Cards')); await C.addPower('noDraw', 1); },
  },
  BLOODLETTING: {
    id: 'BLOODLETTING', name: '放血', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    text: '失去3点生命。\n获得{E}点能量。',
    vars: (c) => ({ E: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.loseHp(3); C.gainEnergy(C.v('E')); },
  },
  BURNING_PACT: {
    id: 'BURNING_PACT', name: '燃烧契约', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]消耗[/gold]1张牌。\n抽{Cards}张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      const chosen = await C.choose({ from: 'hand', count: 1, prompt: '选择一张牌消耗' });
      if (chosen.length) await C.exhaustCard(chosen[0]);
      await C.draw(C.v('Cards'));
    },
  },
  EVIL_EYE: {
    id: 'EVIL_EYE', name: '邪眼', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n如果你在本回合[gold]消耗[/gold]过卡牌，则再获得一次。',
    vars: (c) => ({ Block: c.upgraded ? 11 : 8 }),
    play: async (C) => {
      await C.block(C.v('Block'));
      if (C.exhaustedThisTurn > 0) await C.block(C.v('Block'));
    },
  },
  FLAME_BARRIER: {
    id: 'FLAME_BARRIER', name: '火焰屏障', type: 'skill', rarity: 'uncommon', cost: 2, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n本回合每当你受到攻击，对攻击者造成{Dmg}点伤害。',
    vars: (c) => ({ Block: c.upgraded ? 16 : 12, Dmg: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addPower('flameBarrier', C.v('Dmg')); },
  },
  FORGOTTEN_RITUAL: {
    id: 'FORGOTTEN_RITUAL', name: '被遗忘的仪式', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '如果你在本回合[gold]消耗[/gold]过卡牌，获得{E}点能量。',
    vars: (c) => ({ E: c.upgraded ? 4 : 3 }),
    play: async (C) => { if (C.exhaustedThisTurn > 0) C.gainEnergy(C.v('E')); },
  },
  INFERNAL_BLADE: {
    id: 'INFERNAL_BLADE', name: '地狱之刃', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '将一张随机攻击牌加入你的[gold]手牌[/gold]。这张牌在本回合内可以免费打出。',
    vars: () => ({}),
    play: async (C) => {
      const card = C.randomCardOfType('attack');
      if (!card) return;
      card.freeThisTurn = true;
      C.addCardToHand(card);
    },
    upgradeCost: 0,
  },
  ONE_TWO_PUNCH: {
    id: 'ONE_TWO_PUNCH', name: '连环拳', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '在本回合，你打出的下{N}张攻击牌会被额外打出一次。',
    vars: (c) => ({ N: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('oneTwoPunch', C.v('N')); },
  },
  RAGE: {
    id: 'RAGE', name: '狂怒', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    text: '在这个回合，你每打出一张攻击牌，获得{P}点[gold]格挡[/gold]。',
    vars: (c) => ({ P: c.upgraded ? 5 : 3 }),
    play: async (C) => { await C.addPower('rage', C.v('P')); },
  },
  SECOND_WIND: {
    id: 'SECOND_WIND', name: '重振精神', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]消耗[/gold][gold]手牌[/gold]中所有非攻击牌。每张获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 7 : 5 }),
    play: async (C) => {
      const list = C.hand.filter(x => x.type !== 'attack' && x.type !== 'curse');
      for (const card of list) {
        await C.exhaustCard(card);
        await C.block(C.v('Block'), { silent: true });
      }
    },
  },

  /* ================= 罕见/稀有 · 能力 ================= */
  INFLAME: {
    id: 'INFLAME', name: '燃烧', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Str: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('strength', C.v('Str')); },
  },
  FEEL_NO_PAIN: {
    id: 'FEEL_NO_PAIN', name: '无惧疼痛', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当有一张牌被[gold]消耗[/gold]，获得{P}点[gold]格挡[/gold]。',
    vars: (c) => ({ P: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.addPower('feelNoPain', C.v('P')); },
  },
  DARK_EMBRACE: {
    id: 'DARK_EMBRACE', name: '黑暗之拥', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '每当有一张牌被[gold]消耗[/gold]，抽1张牌。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('darkEmbrace', 1); },
    upgradeCost: 1,
  },
  RUPTURE: {
    id: 'RUPTURE', name: '撕裂', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你在自己的回合失去生命，获得{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Str: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('rupture', C.v('Str')); },
  },
  STONE_ARMOR: {
    id: 'STONE_ARMOR', name: '岩石铠甲', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{P}层[gold]覆甲[/gold]。\n（在你的回合结束时获得等量[gold]格挡[/gold]，然后减1层。）',
    vars: (c) => ({ P: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.addPower('plating', C.v('P')); },
  },
  CRUELTY: {
    id: 'CRUELTY', name: '残酷', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '有[gold]易伤[/gold]状态的敌人额外受到{P}%的伤害。',
    vars: (c) => ({ P: c.upgraded ? 50 : 25 }),
    play: async (C) => { await C.addPower('cruelty', C.v('P')); },
  },
  VICIOUS: {
    id: 'VICIOUS', name: '凶恶', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你给予[gold]易伤[/gold]，抽{N}张牌。',
    vars: (c) => ({ N: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('vicious', C.v('N')); },
  },
  JUGGERNAUT: {
    id: 'JUGGERNAUT', name: '势不可当', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '每当你获得[gold]格挡[/gold]，对随机敌人造成{D}点伤害。',
    vars: (c) => ({ D: c.upgraded ? 8 : 6 }),
    play: async (C) => { await C.addPower('juggernaut', C.v('D')); },
  },
  DEMON_FORM: {
    id: 'DEMON_FORM', name: '恶魔形态', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    text: '在你的回合开始时，获得{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Str: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.addPower('demonForm', C.v('Str')); },
  },
  BARRICADE: {
    id: 'BARRICADE', name: '壁垒', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    text: '[gold]格挡[/gold]不再在你的回合开始时消失。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('barricade', 1); },
    upgradeCost: 2,
  },
  CORRUPTION: {
    id: 'CORRUPTION', name: '腐化', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    text: '技能牌耗能变为0。\n每当你打出一张技能牌，将其[gold]消耗[/gold]。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('corruption', 1); },
    upgradeCost: 2,
  },
  CRIMSON_MANTLE: {
    id: 'CRIMSON_MANTLE', name: '绯红披风', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '在你的回合开始时，失去1点生命并获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 10 : 7 }),
    play: async (C) => { await C.addPower('crimsonMantle', C.v('Block')); },
  },
  PYRE: {
    id: 'PYRE', name: '薪火之源', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '在每回合开始时获得{E}点能量。',
    vars: (c) => ({ E: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('pyre', C.v('E')); },
  },
  AGGRESSION: {
    id: 'AGGRESSION', name: '好勇斗狠', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '在你的回合开始时，将你[gold]弃牌堆[/gold]的一张随机攻击牌放入[gold]手牌[/gold]并将其[gold]升级[/gold]。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('aggression', 1); },
    innateOnUpgrade: true,
  },

  /* ================= 稀有 · 攻击 ================= */
  BLUDGEON: {
    id: 'BLUDGEON', name: '重锤', type: 'attack', rarity: 'rare', cost: 3, target: 'enemy',
    text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 42 : 32 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  },
  FEED: {
    id: 'FEED', name: '狂宴', type: 'attack', rarity: 'rare', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n[gold]斩杀[/gold]时，永久获得{MaxHp}点最大生命值。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 10, MaxHp: c.upgraded ? 4 : 3 }),
    play: async (C) => {
      const killed = await C.attack(C.v('Damage'), { trackKill: true });
      if (killed) { C.gainMaxHp(C.v('MaxHp')); }
    },
    exhaustOnUpgrade: false,
  },
  FIEND_FIRE: {
    id: 'FIEND_FIRE', name: '恶魔之焰', type: 'attack', rarity: 'rare', cost: 2, target: 'enemy',
    text: '[gold]消耗[/gold]所有[gold]手牌[/gold]。\n每张被[gold]消耗[/gold]的牌造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 7 }),
    play: async (C) => {
      const n = C.hand.length;
      for (const card of [...C.hand]) await C.exhaustCard(card);
      if (n > 0) await C.attack(C.v('Damage'), { times: n });
    },
  },
  MANGLE: {
    id: 'MANGLE', name: '凌虐', type: 'attack', rarity: 'rare', cost: 3, target: 'enemy',
    text: '造成{Damage}点伤害。\n该敌人在本回合失去{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 26 : 20, Str: c.upgraded ? 15 : 10 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('strengthTemp', -C.v('Str'), t);
    },
  },
  IMPERVIOUS: {
    id: 'IMPERVIOUS', name: '岿然不动', type: 'skill', rarity: 'rare', cost: 2, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 40 : 30 }),
    play: async (C) => { await C.block(C.v('Block')); },
  },
  OFFERING: {
    id: 'OFFERING', name: '祭品', type: 'skill', rarity: 'rare', cost: 0, target: 'self',
    text: '失去6点生命。\n获得2点能量。\n抽{Cards}张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 5 : 3 }),
    play: async (C) => {
      await C.loseHp(6);
      C.gainEnergy(2);
      await C.draw(C.v('Cards'));
    },
  },

  /* ================= 状态牌 / 诅咒 ================= */
  BURN: {
    id: 'BURN', name: '烧伤', type: 'status', rarity: 'status', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。\n在你的回合结束时，受到2点伤害。',
    vars: () => ({}), play: async () => {},
  },
  WOUND: {
    id: 'WOUND', name: '伤口', type: 'status', rarity: 'status', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。',
    vars: () => ({}), play: async () => {},
  },
  DAZED: {
    id: 'DAZED', name: '眩晕', type: 'status', rarity: 'status', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。\n[gold]虚无[/gold]。',
    vars: () => ({}), play: async () => {}, ethereal: true,
  },
  SLIMED: {
    id: 'SLIMED', name: '黏液', type: 'status', rarity: 'status', cost: 1, target: 'none',
    text: '[gold]消耗[/gold]。',
    vars: () => ({}), play: async () => {}, exhaustOnPlay: true,
  },
  ASCENDERS_BANE: {
    id: 'ASCENDERS_BANE', name: '亡者之枷', type: 'curse', rarity: 'curse', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。\n[gold]虚无[/gold]。',
    vars: () => ({}), play: async () => {}, ethereal: true,
  },
  INFECTION: {
    id: 'INFECTION', name: '感染', type: 'status', rarity: 'status', cost: -1, target: 'none', unplayable: true,
    text: '无法被打出。\n在你的回合结束时，受到1点伤害。',
    vars: () => ({}), play: async () => {},
  },
};

delete CARDS.THRASH_UNUSED;

/* ---------------- 其他角色卡池合并 ---------------- */
import { SILENT_CARDS, SHIV } from './cards-silent.js';
import { DEFECT_CARDS, FUEL, VOID } from './cards-defect.js';
import { REGENT_CARDS, SOVEREIGN_BLADE } from './cards-regent.js';

for (const [id, def] of Object.entries(SILENT_CARDS)) CARDS[id] = def;
CARDS.SHIV = SHIV;
for (const [id, def] of Object.entries(DEFECT_CARDS)) CARDS[id] = def;
CARDS.FUEL = FUEL;
CARDS.VOID = VOID;
for (const [id, def] of Object.entries(REGENT_CARDS)) CARDS[id] = def;
CARDS.SOVEREIGN_BLADE = SOVEREIGN_BLADE;

// 没标 char 的都是铁甲战士的牌（含状态/诅咒；这两类不进奖励池，标 NEUTRAL 便于过滤）
for (const def of Object.values(CARDS)) {
  if (!def.char) def.char = (def.type === 'status' || def.type === 'curse') ? 'NEUTRAL' : 'IRONCLAD';
}

/** 卡牌实例工厂 */
export function makeCard(id, upgraded = false) {
  const def = CARDS[id];
  if (!def) throw new Error('未知卡牌: ' + id);
  return {
    uid: uid('card'),
    id,
    upgraded,
    def,
    bonus: 0,
    freeThisTurn: false,
    get name() { return def.name; },
    get type() { return def.type; },
    get rarity() { return def.rarity; },
    get target() { return def.target; },
    get unplayable() { return !!def.unplayable; },
    get ethereal() { return !!def.ethereal && !(upgraded && def.noEtherealOnUpgrade); },
    get exhaustOnPlay() { return !!def.exhaustOnPlay && !(upgraded && def.noExhaustOnUpgrade); },
    get innate() { return !!(def.innate || (upgraded && def.innateOnUpgrade)); },
    get retain() { return !!def.retain; },
    get tags() { return def.tags || []; },
    /** 星愿费用（储君第二资源）。不随 freeThisTurn 归零，免费由 voidForm 在 starCostOf 里处理 */
    get stars() {
      let s = def.stars ?? 0;
      if (typeof s !== 'number') return s; // 'X'
      if (upgraded && typeof def.upgradeStars === 'number') s = def.upgradeStars;
      return Math.max(0, s);
    },
    get cost() {
      let c = def.cost;
      if (typeof c !== 'number') return c; // X
      if (upgraded && typeof def.upgradeCost === 'number') c = def.upgradeCost;
      if (this.costPenalty) c += this.costPenalty;
      if (this.costReduction) c = Math.max(0, c - this.costReduction);
      if (this.freeThisTurn) c = 0;
      return c;
    },
    text(vars) {
      if (def.textFn) return def.textFn(this);
      return def.text;
    },
  };
}
