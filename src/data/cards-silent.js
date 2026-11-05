/**
 * 静默猎手卡池 —— 数值取自 sts2-sim Models/Cards/*.cs（v0.111.0），
 * 文本对照官方 zhs 本地化。多人限定牌（BladeSymphony/Concoct/Fade/Flanking/Sneaky）未收录。
 *
 * 专属机制：
 *  - 中毒 poison：回合结束按层数扣血（无视格挡），然后层数 -1
 *  - 小刀 SHIV：0 费衍生攻击牌，打出后消耗
 *  - 弃牌：discardCards(n) 从手牌选 n 张弃掉
 *  - 奇巧 Sly：这张牌被弃置时自动打出（定义在 sly 字段）
 */
import { uid } from '../engine/rng.js';

const S = (o) => ({ char: 'SILENT', ...o });

/* 小刀：衍生牌，不进奖励池 */
export const SHIV = {
  id: 'SHIV', name: '小刀', type: 'attack', rarity: 'token', char: 'TOKEN',
  cost: 0, target: 'enemy', tags: ['shiv'], exhaustOnPlay: true,
  text: '造成{Damage}点伤害。\n[gold]消耗[/gold]。',
  vars: (c, C) => {
    let d = c.upgraded ? 6 : 4;
    if (C) {
      d += C.player.powers.accuracy || 0;
      if (C.player.powers.phantomBlades && C.shivsPlayedThisTurn === 0 && C.player.phantomReady) d += C.player.powers.phantomBlades;
    }
    return { Damage: d };
  },
  play: async (C, c) => {
    const dmg = C.v('Damage');
    const all = C.player.powers.fanOfKnives > 0;
    await C.attack(dmg, all ? { all: true } : {});
    if (C.player.powers.phantomBlades && C.shivsPlayedThisTurn === 0) C.player.phantomReady = false;
    C.shivsPlayedThisTurn = (C.shivsPlayedThisTurn || 0) + 1;
  },
};

export const SILENT_CARDS = {
  /* ================= 基础 ================= */
  STRIKE_SILENT: S({
    id: 'STRIKE_SILENT', name: '打击', type: 'attack', rarity: 'basic', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  DEFEND_SILENT: S({
    id: 'DEFEND_SILENT', name: '防御', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    tags: ['defend'], text: '获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  NEUTRALIZE: S({
    id: 'NEUTRALIZE', name: '中和', type: 'attack', rarity: 'basic', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{Weak}层[gold]虚弱[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 4 : 3, Weak: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('weak', C.v('Weak'), t);
    },
  }),
  SURVIVOR: S({
    id: 'SURVIVOR', name: '生存者', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n丢弃1张牌。',
    vars: (c) => ({ Block: c.upgraded ? 11 : 8 }),
    play: async (C) => { await C.block(C.v('Block')); await C.discardCards(1); },
  }),

  /* ================= 普通 ================= */
  BACKFLIP: S({
    id: 'BACKFLIP', name: '后空翻', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n抽2张牌。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); await C.draw(2); },
  }),
  BLADE_DANCE: S({
    id: 'BLADE_DANCE', name: '刀刃之舞', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    exhaustOnPlay: true, text: '添加{Cards}张[gold]小刀[/gold]到你的[gold]手牌[/gold]。',
    vars: (c) => ({ Cards: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.addShiv(C.v('Cards')); },
  }),
  CLOAK_AND_DAGGER: S({
    id: 'CLOAK_AND_DAGGER', name: '斗篷与匕首', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n将{Cards}张[gold]小刀[/gold]添加到你的[gold]手牌[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 9 : 6, Cards: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addShiv(C.v('Cards')); },
  }),
  DAGGER_SPRAY: S({
    id: 'DAGGER_SPRAY', name: '匕首雨', type: 'attack', rarity: 'common', cost: 1, target: 'all',
    text: '对所有敌人造成{Damage}点伤害两次。',
    vars: (c) => ({ Damage: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true, times: 2 }); },
  }),
  DAGGER_THROW: S({
    id: 'DAGGER_THROW', name: '投掷匕首', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n抽1张牌。\n丢弃1张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 9 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.draw(1); await C.discardCards(1); },
  }),
  DEADLY_POISON: S({
    id: 'DEADLY_POISON', name: '致命毒药', type: 'skill', rarity: 'common', cost: 1, target: 'enemy',
    text: '给予{Poison}层[gold]中毒[/gold]。',
    vars: (c) => ({ Poison: c.upgraded ? 7 : 5 }),
    play: async (C) => {
      const t = C.target;
      if (t) await C.addPower('poison', C.v('Poison'), t);
    },
  }),
  DEFLECT: S({
    id: 'DEFLECT', name: '偏折', type: 'skill', rarity: 'common', cost: 0, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 7 : 4 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  DODGE_AND_ROLL: S({
    id: 'DODGE_AND_ROLL', name: '闪躲翻滚', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n在下个回合，获得{Next}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 7 : 4, Next: c.upgraded ? 7 : 4 }),
    play: async (C) => {
      const b = C.v('Block');
      await C.block(b);
      C.player.powers.blockNextTurn = (C.player.powers.blockNextTurn || 0) + b;
    },
  }),
  FLICK_FLACK: S({
    id: 'FLICK_FLACK', name: '翻越撑击', type: 'attack', rarity: 'common', cost: 1, target: 'all',
    sly: true, text: '对所有敌人造成{Damage}点伤害。\n[gold]奇巧[/gold]：被丢弃时自动打出。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 7 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true }); },
  }),
  ABRASIVE: S({
    id: 'ABRASIVE', name: '磨蚀', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    sly: true, text: '获得1点[gold]敏捷[/gold]。\n获得{Thorns}点[gold]荆棘[/gold]。\n[gold]奇巧[/gold]：被丢弃时自动打出。',
    vars: (c) => ({ Thorns: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.addPower('dexterity', 1); await C.addPower('thorns', C.v('Thorns')); },
  }),
  ANTICIPATE: S({
    id: 'ANTICIPATE', name: '预判', type: 'skill', rarity: 'common', cost: 0, target: 'self',
    text: '在本回合获得{Dex}点[gold]敏捷[/gold]。',
    vars: (c) => ({ Dex: c.upgraded ? 4 : 2 }),
    play: async (C) => {
      // 本回合敏捷：回合结束回收
      C.player.tempDex = (C.player.tempDex || 0) + C.v('Dex');
      await C.addPower('dexterity', C.v('Dex'));
    },
  }),
  BACKSTAB: S({
    id: 'BACKSTAB', name: '背刺', type: 'attack', rarity: 'uncommon', cost: 0, target: 'enemy',
    innate: true, exhaustOnPlay: true, text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 15 : 11 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  BLUR: S({
    id: 'BLUR', name: '残影', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n你的下一回合开始时[gold]格挡[/gold]不会消失。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); C.player.powers.blur = 1; },
  }),
  SIDESTEP: S({
    id: 'SIDESTEP', name: '侧步', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    text: '在下个回合获得{Energy}点[gold]能量[/gold]。',
    vars: (c) => ({ Energy: c.upgraded ? 2 : 1 }),
    play: async (C) => { C.player._carryEnergy = (C.player._carryEnergy || 0) + C.v('Energy'); },
  }),
  LEADING_STRIKE: S({
    id: 'LEADING_STRIKE', name: '先制打击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n将{Shivs}张[gold]小刀[/gold]加入你的[gold]手牌[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 6 : 3, Shivs: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.addShiv(C.v('Shivs')); },
  }),
  POISONED_STAB: S({
    id: 'POISONED_STAB', name: '带毒刺击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{Poison}层[gold]中毒[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 8 : 6, Poison: c.upgraded ? 4 : 3 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('poison', C.v('Poison'), t);
    },
  }),
  PREDATOR: S({
    id: 'PREDATOR', name: '猎杀者', type: 'attack', rarity: 'common', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n在下个回合抽2张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 20 : 15 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      C.player.powers.drawNextTurn = (C.player.powers.drawNextTurn || 0) + 2;
    },
  }),
  PREPARED: S({
    id: 'PREPARED', name: '早有准备', type: 'skill', rarity: 'common', cost: 0, target: 'self',
    text: '抽{Cards}张牌。\n丢弃{Cards}张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.draw(C.v('Cards')); await C.discardCards(C.v('Cards')); },
  }),
  RICOCHET: S({
    id: 'RICOCHET', name: '连续反弹', type: 'attack', rarity: 'common', cost: 2, target: 'random',
    text: '随机对敌人造成{Damage}点伤害{Repeat}次。',
    vars: (c) => ({ Damage: 3, Repeat: c.upgraded ? 5 : 4 }),
    play: async (C) => { await C.attack(C.v('Damage'), { random: true, times: C.v('Repeat') }); },
  }),
  SLICE: S({
    id: 'SLICE', name: '切割', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  SNAKEBITE: S({
    id: 'SNAKEBITE', name: '蛇咬', type: 'skill', rarity: 'common', cost: 2, target: 'enemy',
    retain: true, text: '给予{Poison}层[gold]中毒[/gold]。\n[gold]保留[/gold]。',
    vars: (c) => ({ Poison: c.upgraded ? 10 : 7 }),
    play: async (C) => {
      const t = C.target;
      if (t) await C.addPower('poison', C.v('Poison'), t);
    },
  }),
  SUCKER_PUNCH: S({
    id: 'SUCKER_PUNCH', name: '突然一拳', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n给予{Weak}层[gold]虚弱[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 8, Weak: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('weak', C.v('Weak'), t);
    },
  }),
  ACROBATICS: S({
    id: 'ACROBATICS', name: '杂技', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '抽{Cards}张牌。\n丢弃1张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.draw(C.v('Cards')); await C.discardCards(1); },
  }),

  /* ================= 罕见 ================= */
  ACCURACY: S({
    id: 'ACCURACY', name: '精准', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]小刀[/gold]额外造成{Amount}点伤害。',
    vars: (c) => ({ Amount: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.addPower('accuracy', C.v('Amount')); },
  }),
  BOUNCING_FLASK: S({
    id: 'BOUNCING_FLASK', name: '弹跳药瓶', type: 'skill', rarity: 'uncommon', cost: 2, target: 'random',
    text: '随机给予敌人{Poison}层[gold]中毒[/gold]{Repeat}次。',
    vars: (c) => ({ Poison: c.upgraded ? 4 : 3, Repeat: c.upgraded ? 4 : 3 }),
    play: async (C) => {
      for (let i = 0; i < C.v('Repeat'); i++) {
        const a = C.alive();
        if (!a.length) break;
        await C.addPower('poison', C.v('Poison'), C.rng.pick(a));
      }
    },
  }),
  BUBBLE_BUBBLE: S({
    id: 'BUBBLE_BUBBLE', name: '咕嘟冒泡', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '如果该敌人拥有[gold]中毒[/gold]，则给予{Poison}层[gold]中毒[/gold]。',
    vars: (c) => ({ Poison: c.upgraded ? 12 : 9 }),
    play: async (C) => {
      const t = C.target;
      if (t && t.powers.poison) await C.addPower('poison', C.v('Poison'), t);
    },
  }),
  CALCULATED_GAMBLE: S({
    id: 'CALCULATED_GAMBLE', name: '计算下注', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    exhaustOnPlay: true, text: '丢弃你的所有[gold]手牌[/gold]，然后抽相同数量的牌。',
    vars: () => ({}),
    play: async (C, c) => {
      const n = C.hand.length;
      await C.discardAll();
      await C.draw(n);
    },
  }),
  CORROSIVE_WAVE: S({
    id: 'CORROSIVE_WAVE', name: '腐蚀波', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    text: '本回合你每抽到一张牌，就给予所有敌人{Poison}层[gold]中毒[/gold]。',
    vars: (c) => ({ Poison: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('corrosiveWave', C.v('Poison')); },
  }),
  DASH: S({
    id: 'DASH', name: '冲刺', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '获得{Block}点[gold]格挡[/gold]。\n造成{Damage}点伤害。',
    vars: (c) => ({ Block: c.upgraded ? 13 : 10, Damage: c.upgraded ? 13 : 10 }),
    play: async (C) => { await C.block(C.v('Block')); await C.attack(C.v('Damage')); },
  }),
  ECHOING_SLASH: S({
    id: 'ECHOING_SLASH', name: '回响斩击', type: 'attack', rarity: 'uncommon', cost: 1, target: 'all',
    text: '对所有敌人造成{Damage}点伤害。\n每有一名敌人被击杀，就重复此效果。',
    vars: (c) => ({ Damage: c.upgraded ? 14 : 10 }),
    play: async (C) => {
      let rounds = 1;
      for (let i = 0; i < rounds && i < 5; i++) {
        const before = C.alive().length;
        await C.attack(C.v('Damage'), { all: true });
        const killed = before - C.alive().length;
        if (killed <= 0) break;
        rounds += killed;
      }
    },
  }),
  ESCAPE_PLAN: S({
    id: 'ESCAPE_PLAN', name: '逃脱计划', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    text: '抽1张牌。\n如果抽到的是技能牌，则获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 5 : 3 }),
    play: async (C) => {
      const got = await C.draw(1, { quiet: true });
      if (got[0] && got[0].type === 'skill') await C.block(C.v('Block'));
    },
  }),
  EXPERTISE: S({
    id: 'EXPERTISE', name: '独门技术', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '抽牌直至你的[gold]手牌[/gold]有{Cards}张牌。',
    vars: (c) => ({ Cards: c.upgraded ? 7 : 6 }),
    play: async (C) => {
      const need = Math.max(0, C.v('Cards') - C.hand.length);
      if (need) await C.draw(need);
    },
  }),
  EXPOSE: S({
    id: 'EXPOSE', name: '暴露', type: 'skill', rarity: 'uncommon', cost: 0, target: 'enemy',
    exhaustOnPlay: true, text: '去除敌人身上的所有[gold]格挡[/gold]值和[gold]人工制品[/gold]。\n并给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Vuln: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      const t = C.target;
      if (!t) return;
      t.block = 0;
      delete t.powers.artifact;
      await C.addPower('vulnerable', C.v('Vuln'), t);
      C.emit();
    },
  }),
  FAN_OF_KNIVES: S({
    id: 'FAN_OF_KNIVES', name: '刀扇', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '[gold]小刀[/gold]现在会攻击所有敌人。\n将{Shivs}张[gold]小刀[/gold]添加到你的[gold]手牌[/gold]。',
    vars: (c) => ({ Shivs: c.upgraded ? 5 : 4 }),
    play: async (C) => { await C.addPower('fanOfKnives', 1); await C.addShiv(C.v('Shivs')); },
  }),
  FINISHER: S({
    id: 'FINISHER', name: '终结技', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '这个回合内每打出过一张攻击牌，就造成{Damage}点伤害一次。',
    vars: (c) => ({ Damage: c.upgraded ? 8 : 6 }),
    play: async (C) => {
      const hits = Math.max(1, C.attacksPlayedThisTurn);
      await C.attack(C.v('Damage'), { times: hits });
    },
  }),
  FLECHETTES: S({
    id: 'FLECHETTES', name: '飞镖', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '[gold]手牌[/gold]中每有一张技能牌，造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 7 : 5 }),
    play: async (C) => {
      const hits = C.hand.filter(x => x.type === 'skill').length;
      if (hits > 0) await C.attack(C.v('Damage'), { times: hits });
    },
  }),
  FOOTWORK: S({
    id: 'FOOTWORK', name: '灵动步法', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Dex}点[gold]敏捷[/gold]。',
    vars: (c) => ({ Dex: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('dexterity', C.v('Dex')); },
  }),
  HAND_TRICK: S({
    id: 'HAND_TRICK', name: '手上技法', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n在本回合给你[gold]手牌[/gold]中的一张技能牌添加[gold]奇巧[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 10 : 7 }),
    play: async (C) => {
      await C.block(C.v('Block'));
      const skills = C.hand.filter(x => x.type === 'skill');
      if (skills.length) skills[C.rng.int(skills.length)].sly = true;
    },
  }),
  HAZE: S({
    id: 'HAZE', name: '迷雾', type: 'skill', rarity: 'uncommon', cost: 2, target: 'all',
    text: '给予所有敌人{Poison}层[gold]中毒[/gold]。',
    vars: (c) => ({ Poison: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.addPowerAll('poison', C.v('Poison')); },
  }),
  HIDDEN_DAGGERS: S({
    id: 'HIDDEN_DAGGERS', name: '隐秘匕首', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self',
    text: '丢弃{Cards}张牌。\n将2张[gold]小刀[/gold]加入你的[gold]手牌[/gold]。',
    vars: (c) => ({ Cards: 2 }),
    play: async (C, c) => { await C.discardCards(2); await C.addShiv(2, c.upgraded); },
  }),
  INFINITE_BLADES: S({
    id: 'INFINITE_BLADES', name: '无尽刀刃', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '在你的回合开始时，在你的[gold]手牌[/gold]中加入1张[gold]小刀[/gold]。',
    vars: (c) => ({ Up: c.upgraded ? 1 : 0 }),
    play: async (C, c) => { await C.addPower('infiniteBlades', c.upgraded ? 2 : 1); },
  }),
  KNIFE_TRAP: S({
    id: 'KNIFE_TRAP', name: '刀刃陷阱', type: 'skill', rarity: 'rare', cost: 2, target: 'enemy',
    text: '将你[gold]消耗牌堆[/gold]中的所有[gold]小刀[/gold]对一名敌人打出。',
    vars: () => ({}),
    play: async (C, c) => {
      const shivs = C.exhaustPile.filter(x => x.id === 'SHIV');
      for (const sh of shivs) {
        C.exhaustPile.splice(C.exhaustPile.indexOf(sh), 1);
        if (c.upgraded) sh.upgraded = true;
        await C.attack(C.cardDamageValue(sh), {});
      }
    },
  }),
  LEG_SWEEP: S({
    id: 'LEG_SWEEP', name: '扫腿', type: 'skill', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '给予{Weak}层[gold]虚弱[/gold]。\n获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Weak: c.upgraded ? 3 : 2, Block: c.upgraded ? 14 : 11 }),
    play: async (C) => {
      const t = C.target;
      if (t) await C.addPower('weak', C.v('Weak'), t);
      await C.block(C.v('Block'));
    },
  }),
  MASTER_PLANNER: S({
    id: 'MASTER_PLANNER', name: '谋划专家', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '当你打出技能牌时，该牌获得[gold]奇巧[/gold]。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('masterPlanner', 1); },
  }),
  MEMENTO_MORI: S({
    id: 'MEMENTO_MORI', name: '铭记死亡', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n本回合每丢弃过一张牌，则增加{Extra}点额外伤害。',
    vars: (c, C) => {
      const extra = c.upgraded ? 6 : 4;
      return { Damage: 9 + extra * (C ? C.discardedThisTurn : 0), Extra: extra };
    },
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  MIRAGE: S({
    id: 'MIRAGE', name: '蜃景', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    exhaustOnPlay: true, text: '获得等同于所有敌人[gold]中毒[/gold]层数的[gold]格挡[/gold]。',
    vars: (c, C) => ({ Block: C ? C.alive().reduce((s, e) => s + (e.powers.poison || 0), 0) : 0 }),
    play: async (C) => { const b = C.v('Block'); if (b > 0) await C.block(b); },
  }),
  NIGHTMARE: S({
    id: 'NIGHTMARE', name: '夜魇', type: 'skill', rarity: 'rare', cost: 3, target: 'self',
    exhaustOnPlay: true, text: '选择一张牌。\n在下个回合将这张牌的3张复制品加入你的[gold]手牌[/gold]。',
    vars: () => ({}),
    play: async (C) => {
      const picked = await C.choose({ from: 'hand', count: 1, prompt: '选择一张牌，下回合获得 3 张复制品' });
      if (picked.length) C.player.nightmareCard = picked[0].id;
    },
  }),
  PHANTOM_BLADES: S({
    id: 'PHANTOM_BLADES', name: '幻影之刃', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]小刀[/gold]获得[gold]保留[/gold]。\n你在每回合打出的第一张[gold]小刀[/gold]额外造成{Amount}点伤害。',
    vars: (c) => ({ Amount: c.upgraded ? 12 : 9 }),
    play: async (C) => {
      await C.addPower('phantomBlades', C.v('Amount'));
      C.player.phantomReady = true;
      C.player.shivRetain = 1;
    },
  }),
  PINPOINT: S({
    id: 'PINPOINT', name: '精密瞄准', type: 'attack', rarity: 'uncommon', cost: 3, target: 'enemy',
    text: '造成{Damage}点伤害。\n你在本回合中每打出过一张技能牌，其耗能减少1。',
    vars: (c) => ({ Damage: c.upgraded ? 20 : 15 }),
    costMod: (card, C) => -C.skillsPlayedThisTurn,
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  POUNCE: S({
    id: 'POUNCE', name: '猛扑', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n你的下一张技能牌耗能变为0。',
    vars: (c) => ({ Damage: c.upgraded ? 18 : 14 }),
    play: async (C) => { await C.attack(C.v('Damage')); C.player.powers.freeSkill = 1; },
  }),
  PRECISE_CUT: S({
    id: 'PRECISE_CUT', name: '精确切击', type: 'attack', rarity: 'uncommon', cost: 0, target: 'enemy',
    text: '造成{Damage}点伤害。\n你的[gold]手牌[/gold]中每有一张牌，此牌的伤害就降低{Extra}点。',
    vars: (c, C) => {
      const base = c.upgraded ? 15 : 13;
      return { Damage: Math.max(0, base - 2 * (C ? C.hand.length : 0)), Extra: 2 };
    },
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  REFLEX: S({
    id: 'REFLEX', name: '本能反应', type: 'skill', rarity: 'uncommon', cost: 3, target: 'self',
    sly: true, text: '抽{Cards}张牌。\n[gold]奇巧[/gold]：被丢弃时自动打出。',
    vars: (c) => ({ Cards: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.draw(C.v('Cards')); },
  }),
  SERPENT_FORM: S({
    id: 'SERPENT_FORM', name: '群蛇形态', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    text: '你每打出一张牌，就对随机一名敌人造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.addPower('serpentForm', C.v('Damage')); },
  }),
  SHADOW_STEP: S({
    id: 'SHADOW_STEP', name: '暗影步', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    text: '丢弃所有[gold]手牌[/gold]。\n在下个回合，你所有的攻击伤害翻倍。',
    vars: () => ({}),
    play: async (C) => { await C.discardAll(); C.player.powers.shadowStep = 1; },
  }),
  SHADOWMELD: S({
    id: 'SHADOWMELD', name: '融入暗影', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    text: '本回合你获得的[gold]格挡[/gold]值翻倍。',
    vars: () => ({}),
    play: async (C) => { C.player.powers.shadowmeld = 1; },
  }),
  SKEWER: S({
    id: 'SKEWER', name: '串刺', type: 'attack', rarity: 'uncommon', cost: 'X', target: 'enemy',
    text: '造成{Damage}点伤害X次。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 8 }),
    play: async (C) => {
      const x = Math.max(1, C.xValue || 0);
      await C.attack(C.v('Damage'), { times: x });
    },
  }),
  SPEEDSTER: S({
    id: 'SPEEDSTER', name: '速行者', type: 'power', rarity: 'uncommon', cost: 2, target: 'self',
    text: '每当你在回合进行中抽到一张牌时，对所有敌人造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('speedster', C.v('Damage')); },
  }),
  STORM_OF_STEEL: S({
    id: 'STORM_OF_STEEL', name: '钢铁风暴', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    text: '丢弃所有[gold]手牌[/gold]。\n每丢弃一张牌，就将一张[gold]小刀[/gold]添加至你的[gold]手牌[/gold]。',
    vars: (c) => ({ Up: c.upgraded ? 1 : 0 }),
    play: async (C, c) => {
      const n = C.hand.length;
      await C.discardAll();
      await C.addShiv(n, c.upgraded);
    },
  }),
  STRANGLE: S({
    id: 'STRANGLE', name: '紧勒', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n你在这个回合内每出一张牌，该名敌人都会失去{Hp}点生命。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 10, Hp: c.upgraded ? 2 : 3 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) t.powers.strangle = (t.powers.strangle || 0) + C.v('Hp');
    },
  }),
  TACTICIAN: S({
    id: 'TACTICIAN', name: '战术大师', type: 'skill', rarity: 'uncommon', cost: 3, target: 'self',
    sly: true, text: '获得{Energy}点能量。\n[gold]奇巧[/gold]：被丢弃时自动打出。',
    vars: (c) => ({ Energy: c.upgraded ? 2 : 1 }),
    play: async (C) => { C.gainEnergy(C.v('Energy')); },
  }),
  THE_HUNT: S({
    id: 'THE_HUNT', name: '狩猎', type: 'attack', rarity: 'rare', cost: 1, target: 'enemy',
    exhaustOnPlay: true, text: '造成{Damage}点伤害。\n[gold]斩杀[/gold]时，额外获得一组卡牌奖励。',
    vars: (c) => ({ Damage: c.upgraded ? 15 : 10 }),
    play: async (C) => {
      const t = C.target;
      const had = t && t.alive;
      await C.attack(C.v('Damage'), { target: t });
      if (had && t && !t.alive) C.run.extraCardReward = (C.run.extraCardReward || 0) + 1;
    },
  }),
  TOOLS_OF_THE_TRADE: S({
    id: 'TOOLS_OF_THE_TRADE', name: '必备工具', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '在你的回合开始时，抽1张牌，丢弃1张牌。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('toolsOfTheTrade', 1); },
  }),
  TRACKING: S({
    id: 'TRACKING', name: '跟踪', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '对[gold]虚弱[/gold]状态的敌人，造成的攻击伤害翻倍。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('tracking', 1); },
  }),
  UNTOUCHABLE: S({
    id: 'UNTOUCHABLE', name: '触不可及', type: 'skill', rarity: 'common', cost: 2, target: 'self',
    sly: true, text: '获得{Block}点[gold]格挡[/gold]。\n[gold]奇巧[/gold]：被丢弃时自动打出。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 6 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  UP_MY_SLEEVE: S({
    id: 'UP_MY_SLEEVE', name: '袖里乾坤', type: 'skill', rarity: 'uncommon', cost: 2, target: 'self',
    text: '将{Cards}张[gold]小刀[/gold]加入你的[gold]手牌[/gold]。\n这张牌的耗能减少1。',
    vars: (c) => ({ Cards: c.upgraded ? 4 : 3 }),
    play: async (C, c) => {
      await C.addShiv(C.v('Cards'));
      c.costReduction = (c.costReduction || 0) + 1;
    },
  }),
  WELL_LAID_PLANS: S({
    id: 'WELL_LAID_PLANS', name: '计划妥当', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '在你的回合结束时，[gold]保留[/gold]最多{Retain}张牌。',
    vars: (c) => ({ Retain: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('wellLaidPlans', C.v('Retain')); },
  }),
  WRAITH_FORM: S({
    id: 'WRAITH_FORM', name: '幽魂形态', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    text: '获得{Intangible}层[gold]无实体[/gold]。\n在你的回合开始时，失去1点[gold]敏捷[/gold]。',
    vars: (c) => ({ Intangible: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      await C.addPower('intangible', C.v('Intangible'));
      await C.addPower('wraithForm', 1);
    },
  }),

  /* ================= 稀有 ================= */
  ACCELERANT: S({
    id: 'ACCELERANT', name: '触媒', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]中毒[/gold]会额外触发{Extra}次。',
    vars: (c) => ({ Extra: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('accel', C.v('Extra')); },
  }),
  ADRENALINE: S({
    id: 'ADRENALINE', name: '肾上腺素', type: 'skill', rarity: 'rare', cost: 0, target: 'self',
    exhaustOnPlay: true, text: '获得{Energy}点能量。\n抽2张牌。',
    vars: (c) => ({ Energy: c.upgraded ? 2 : 1 }),
    play: async (C) => { C.gainEnergy(C.v('Energy')); await C.draw(2); },
  }),
  AFTERIMAGE: S({
    id: 'AFTERIMAGE', name: '余像', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '你每打出一张牌，都获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('afterimage', C.v('Block')); },
  }),
  ASSASSINATE: S({
    id: 'ASSASSINATE', name: '刺杀', type: 'attack', rarity: 'rare', cost: 0, target: 'enemy',
    innate: true, exhaustOnPlay: true,
    text: '造成{Damage}点伤害。\n给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 10, Vuln: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t && t.alive) await C.addPower('vulnerable', C.v('Vuln'), t);
    },
  }),
  BLADE_OF_INK: S({
    id: 'BLADE_OF_INK', name: '墨之刃', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    text: '每当你在本回合打出一张攻击牌时，本回合获得{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Str: c.upgraded ? 3 : 2 }),
    play: async (C) => { C.player.powers.inkBlade = (C.player.powers.inkBlade || 0) + C.v('Str'); },
  }),
  BULLET_TIME: S({
    id: 'BULLET_TIME', name: '子弹时间', type: 'skill', rarity: 'rare', cost: 3, target: 'self',
    text: '你在本回合内不能再抽牌。你[gold]手牌[/gold]中的所有牌在本回合免费打出。',
    vars: () => ({}),
    play: async (C) => {
      for (const card of C.hand) card.freeThisTurn = true;
      await C.addPower('noDraw', 1);
      C.emit();
    },
  }),
  BURST: S({
    id: 'BURST', name: '爆发', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    text: '在这个回合，你打出的下{Skills}张技能牌会被额外打出一次。',
    vars: (c) => ({ Skills: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('burst', C.v('Skills')); },
  }),
  ENVENOM: S({
    id: 'ENVENOM', name: '涂毒', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '每有一次攻击造成未被格挡的伤害，就给予{Poison}层[gold]中毒[/gold]。',
    vars: (c) => ({ Poison: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('envenom', C.v('Poison')); },
  }),
  GRAND_FINALE: S({
    id: 'GRAND_FINALE', name: '华丽收场', type: 'attack', rarity: 'rare', cost: 0, target: 'all',
    text: '只有当你的[gold]抽牌堆[/gold]中没有牌时才能打出。对所有敌人造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 75 : 60 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true }); },
    canPlay: (C) => C.drawPile.length === 0,
  }),
  MALAISE: S({
    id: 'MALAISE', name: '萎靡', type: 'skill', rarity: 'rare', cost: 'X', target: 'enemy',
    exhaustOnPlay: true, text: '敌人失去X{Up}点[gold]力量[/gold]。给予X{Up}层[gold]虚弱[/gold]。',
    vars: (c) => ({ Up: c.upgraded ? '+1' : '' }),
    play: async (C, c) => {
      const t = C.target;
      const x = Math.max(0, C.xValue || 0) + (c.upgraded ? 1 : 0);
      if (!t || x <= 0) return;
      if (t.powers.strength) {
        t.powers.strength = Math.max(0, t.powers.strength - x);
        if (!t.powers.strength) delete t.powers.strength;
      }
      await C.addPower('weak', x, t);
    },
  }),
  MURDER: S({
    id: 'MURDER', name: '谋杀', type: 'attack', rarity: 'rare', cost: 3, target: 'enemy',
    text: '造成{Damage}点伤害。\n你在本场战斗中每抽过一张牌，此牌就额外造成1点伤害。',
    vars: (c, C) => ({ Damage: 1 + (C ? C.cardsDrawnThisCombat : 0) }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  NOXIOUS_FUMES: S({
    id: 'NOXIOUS_FUMES', name: '毒雾', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '在你的回合开始时，给予所有敌人{Poison}层[gold]中毒[/gold]。',
    vars: (c) => ({ Poison: c.upgraded ? 3 : 2 }),
    play: async (C) => { await C.addPower('noxiousFumes', C.v('Poison')); },
  }),
  OUTBREAK: S({
    id: 'OUTBREAK', name: '毒性爆发', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    text: '每当你给予{Every}次[gold]中毒[/gold]，就对所有敌人造成{Damage}点伤害。',
    vars: (c) => ({ Every: c.upgraded ? 4 : 3, Damage: c.upgraded ? 12 : 9 }),
    play: async (C) => {
      await C.addPower('outbreak', C.v('Damage'));
      C.player.outbreakEvery = C.v('Every');
      C.player.outbreakCount = 0;
    },
  }),
  PIERCING_WAIL: S({
    id: 'PIERCING_WAIL', name: '尖啸', type: 'skill', rarity: 'common', cost: 1, target: 'all',
    exhaustOnPlay: true, text: '所有敌人在本回合失去{Str}点[gold]力量[/gold]。',
    vars: (c) => ({ Str: c.upgraded ? 8 : 6 }),
    play: async (C) => {
      for (const e of C.alive()) {
        e.strengthLoss = (e.strengthLoss || 0) + C.v('Str');
      }
      C.emit();
    },
  }),
};
