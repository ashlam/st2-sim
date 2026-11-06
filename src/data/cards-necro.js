/**
 * 亡灵契约师卡池 —— 86 张单人卡（官方卡池 91 张去掉 5 张多人限定牌）＋ 2 张衍生牌。
 *
 * 数据对照（v0.111.0）：
 *  - 数值 / 费用 / 升级差异 / 稀有度：逐张取自 sts2-sim `Models/Cards/*.cs` 与
 *    `Models/CardPools/NecrobinderCardPool.cs`；`Models/Characters/Necrobinder.cs`
 *    给出 66 血 / 99 金 / 3 能量 / 起始牌组 4 打击 + 4 防御 + 护卫 + 出击 / 起始遗物缚魂命匣。
 *  - 中文卡名 / 描述：取自 STS2SourceCode `localization/zhs/cards.json`，
 *    按本项目卡面模板把 `{Var:diff()}`、`{Energy:energyIcons()}` 等占位符改写成 `{Var}`。
 *  - 二者冲突时**一律以 C# 源码为准**（官方中文描述里有若干过期/错误数值），已在文件内逐条标注：
 *    BORROWED_TIME（中文写「灾厄」，源码是牌费 +1）、DEMESNE（中文写「获得能量」，源码是最大能量 +1）、
 *    SACRIFICE（中文写「双倍」，源码是 ×3）、EIDOLON（中文写「消耗手牌得无实体」，源码是自动打出消耗堆虚无牌）、
 *    GRAVE_WARDEN / SEANCE（中文暗示「灵魂+」，源码未升级 Soul）、INVOKE（源码无费用逻辑）。
 *  - Epoch 解锁组（NECROBINDER2/5/7）在本简化版里默认全部可用；`ancient` 稀有度不进普通奖励池。
 *
 * 专属机制见 `src/engine/necro.js`：召唤奥斯提 / 灾厄直死 / 灵魂 token / 虚无与重放。
 */
const N = (o) => ({ char: 'NECROBINDER', ...o });

/** 衍生牌：灵魂（Soul.cs：0 费技能、消耗、抽 2→3） */
export const SOUL = {
  id: 'SOUL', name: '灵魂', type: 'skill', rarity: 'token', char: 'TOKEN',
  cost: 0, target: 'self', exhaustOnPlay: true,
  text: '抽{Cards}张牌。\n[gold]消耗[/gold]。',
  vars: (c) => ({ Cards: c.upgraded ? 3 : 2 }),
  play: async (C) => { await C.draw(C.v('Cards')); },
};

/** 衍生牌：扫荡凝视（SentryModePower 生成，0 费虚无消耗，奥斯提随机攻击 10） */
export const SWEEPING_GAZE = {
  id: 'SWEEPING_GAZE', name: '扫荡凝视', type: 'attack', rarity: 'token', char: 'TOKEN',
  cost: 0, target: 'enemy', ethereal: true, exhaustOnPlay: true, tags: ['osty'],
  text: '[gold]奥斯提[/gold]对随机一名敌人造成{Damage}点伤害。\n[gold]虚无[/gold]。[gold]消耗[/gold]。',
  vars: (c) => ({ Damage: c.upgraded ? 15 : 10 }),
  play: async (C) => { if (!C.ostyAlive()) return; await C.ostyAttack(C.v('Damage'), { random: true }); },
};

const DEBUFF_IDS = new Set([
  'doom', 'weak', 'vulnerable', 'frail', 'poison', 'shrink', 'tangled', 'constrict',
  'hex', 'ringing', 'debilitate', 'hang', 'oblivion', 'sicEm', 'neurosurge',
]);

/* 常用小工具 */
const ostyHp = (C) => C.necro?.ostyAlive ? C.necro.osty.hp : 0;
const ostyMaxHp = (C) => C.necro?.ostyAlive ? C.necro.osty.maxHp : 0;
const doomOf = (t) => (t?.powers?.doom || 0);
const soulCount = (C) => C.necro?.countSouls() || 0;

export const NECRO_CARDS = {
  /* ================= 基础牌（4 张，起始牌组含 4 打击 + 4 防御 + 护卫 + 出击） ================= */
  STRIKE_NECROBINDER: N({
    id: 'STRIKE_NECROBINDER', name: '打击', type: 'attack', rarity: 'basic', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  DEFEND_NECROBINDER: N({
    id: 'DEFEND_NECROBINDER', name: '防御', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    tags: ['defend'], text: '获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 8 : 5 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  BODYGUARD: N({
    id: 'BODYGUARD', name: '护卫', type: 'skill', rarity: 'basic', cost: 1, target: 'self',
    text: '[gold]召唤[/gold]{Summon}。',
    vars: (c) => ({ Summon: c.upgraded ? 7 : 5 }),
    play: async (C) => { await C.necro.summon(C.v('Summon')); },
  }),
  UNLEASH: N({
    id: 'UNLEASH', name: '出击', type: 'attack', rarity: 'basic', cost: 1, target: 'enemy',
    tags: ['osty'], text: '[gold]奥斯提[/gold]造成{Damage}点伤害。\n额外造成等量于[gold]奥斯提[/gold]当前生命值的伤害。',
    vars: (c, C) => ({ Damage: (c.upgraded ? 9 : 6) + (C ? ostyHp(C) : 0) }),
    play: async (C) => { if (C.ostyAlive()) await C.ostyAttack(C.v('Damage')); },
  }),

  /* ================= 普通牌 ================= */
  AFTERLIFE: N({
    id: 'AFTERLIFE', name: '来生', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    exhaustOnPlay: true, text: '[gold]召唤[/gold]{Summon}。\n[gold]消耗[/gold]。',
    vars: (c) => ({ Summon: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.necro.summon(C.v('Summon')); },
  }),
  BLIGHT_STRIKE: N({
    id: 'BLIGHT_STRIKE', name: '荒疫打击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。\n给予等量于所造成伤害的[gold]灾厄[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 8 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      const dealt = (C.necro?.lastAttackTotals || []).reduce((s, x) => s + x.amount, 0);
      if (t?.alive && dealt > 0) await C.necro.addDoom(dealt, t);
    },
  }),
  DEFILE: N({
    id: 'DEFILE', name: '玷污', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    ethereal: true, text: '造成{Damage}点伤害。\n[gold]虚无[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 17 : 13 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  DEFY: N({
    id: 'DEFY', name: '违逆', type: 'skill', rarity: 'common', cost: 1, target: 'enemy',
    ethereal: true, text: '获得{Block}点[gold]格挡[/gold]。\n给予{Weak}层[gold]虚弱[/gold]。\n[gold]虚无[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 9 : 6, Weak: 1 }),
    play: async (C) => {
      const t = C.target;
      await C.block(C.v('Block'));
      if (t?.alive) await C.addPower('weak', C.v('Weak'), t);
    },
  }),
  DRAIN_POWER: N({
    id: 'DRAIN_POWER', name: '能量汲取', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n随机[gold]升级[/gold]你[gold]弃牌堆[/gold]中的{Cards}张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 10, Cards: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      const cand = C.discardPile.filter(x => !x.upgraded);
      for (const c of C.rng.shuffle(cand).slice(0, C.v('Cards'))) C.upgradeCard(c);
    },
  }),
  FEAR: N({
    id: 'FEAR', name: '恐惧', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    ethereal: true, text: '造成{Damage}点伤害。\n给予{Vuln}层[gold]易伤[/gold]。\n[gold]虚无[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 8 : 7, Vuln: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t?.alive) await C.addPower('vulnerable', C.v('Vuln'), t);
    },
  }),
  FLATTEN: N({
    id: 'FLATTEN', name: '重压', type: 'attack', rarity: 'common', cost: 2, target: 'enemy',
    tags: ['osty'], text: '[gold]奥斯提[/gold]造成{Damage}点伤害。\n若[gold]奥斯提[/gold]本回合攻击过，此牌耗能为0。',
    vars: (c) => ({ Damage: c.upgraded ? 16 : 12 }),
    play: async (C) => { if (C.ostyAlive()) await C.ostyAttack(C.v('Damage')); },
  }),
  GRAVE_WARDEN: N({
    id: 'GRAVE_WARDEN', name: '守墓人', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n将一张[gold]灵魂[/gold]加入[gold]抽牌堆[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 11 : 8 }),
    // 源码未调用 CardCmd.Upgrade：升级版生成的仍是普通「灵魂」（抽 2），与官方中文的「灵魂+」不同
    play: async (C) => { await C.block(C.v('Block')); await C.necro.addSoul(1, 'draw'); },
  }),
  GRAVEBLAST: N({
    id: 'GRAVEBLAST', name: '坟冢爆射', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    exhaustOnPlay: true, noExhaustOnUpgrade: true,
    text: '造成{Damage}点伤害。\n将[gold]弃牌堆[/gold]中的一张牌放入[gold]手牌[/gold]。\n[gold]消耗[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 6 : 4 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      const [picked] = await C.choose({ from: 'discard', count: 1, prompt: '选择一张牌放回手牌', optional: true });
      if (picked) {
        C.discardPile.splice(C.discardPile.indexOf(picked), 1);
        C.addCardToHand(picked);
      }
    },
  }),
  INVOKE: N({
    id: 'INVOKE', name: '唤起', type: 'skill', rarity: 'common', cost: 1, target: 'self',
    // 源码无费用逻辑；上游注释误把 FLATTEN 的降费写到了这里
    text: '在下个回合[gold]召唤[/gold]{Summon}并获得{Energy}点能量。',
    vars: (c) => ({ Summon: c.upgraded ? 3 : 2, Energy: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      await C.addPower('summonNextTurn', C.v('Summon'));
      await C.addPower('energyNextTurn', C.v('Energy'));
    },
  }),
  NEGATIVE_PULSE: N({
    id: 'NEGATIVE_PULSE', name: '负能量脉冲', type: 'skill', rarity: 'common', cost: 1, target: 'all',
    text: '获得{Block}点[gold]格挡[/gold]。\n给予所有敌人{Doom}层[gold]灾厄[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 6 : 5, Doom: c.upgraded ? 11 : 7 }),
    play: async (C) => {
      await C.block(C.v('Block'));
      for (const e of C.alive()) await C.necro.addDoom(C.v('Doom'), e);
    },
  }),
  POKE: N({
    id: 'POKE', name: '戳击', type: 'attack', rarity: 'common', cost: 0, target: 'enemy',
    tags: ['osty'], text: '[gold]奥斯提[/gold]造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 6 }),
    play: async (C) => { if (C.ostyAlive()) await C.ostyAttack(C.v('Damage')); },
  }),
  PULL_AGGRO: N({
    id: 'PULL_AGGRO', name: '吸引仇恨', type: 'skill', rarity: 'common', cost: 2, target: 'self',
    text: '[gold]召唤[/gold]{Summon}。\n获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Summon: c.upgraded ? 5 : 4, Block: c.upgraded ? 9 : 7 }),
    play: async (C) => { await C.necro.summon(C.v('Summon')); await C.block(C.v('Block')); },
  }),
  REAP: N({
    id: 'REAP', name: '收割', type: 'attack', rarity: 'common', cost: 3, target: 'enemy',
    retain: true, text: '造成{Damage}点伤害。\n[gold]保留[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 33 : 27 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  REAVE: N({
    id: 'REAVE', name: '剥夺', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    textFn: (c) => c.upgraded ? '造成{Damage}点伤害。\n将一张[gold]灵魂+[/gold]加入[gold]抽牌堆[/gold]。' : '造成{Damage}点伤害。\n将一张[gold]灵魂[/gold]加入[gold]抽牌堆[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 10 }),
    play: async (C, c) => { await C.attack(C.v('Damage')); await C.necro.addSoul(1, 'draw', c.upgraded); },
  }),
  SCOURGE: N({
    id: 'SCOURGE', name: '鞭打', type: 'skill', rarity: 'common', cost: 1, target: 'enemy',
    text: '给予{Doom}层[gold]灾厄[/gold]。\n抽{Cards}张牌。',
    vars: (c) => ({ Doom: c.upgraded ? 16 : 13, Cards: c.upgraded ? 2 : 1 }),
    play: async (C) => {
      const t = C.target;
      if (t) await C.necro.addDoom(C.v('Doom'), t);
      await C.draw(C.v('Cards'));
    },
  }),
  SCULPTING_STRIKE: N({
    id: 'SCULPTING_STRIKE', name: '雕琢打击', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    tags: ['strike'], text: '造成{Damage}点伤害。\n为一张[gold]手牌[/gold]添加[gold]虚无[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 9 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      const [picked] = await C.choose({ from: 'hand', count: 1, filter: c => !c.ethereal, prompt: '选择一张手牌添加虚无', optional: true });
      if (picked) picked.ethereal = true;
    },
  }),
  SNAP: N({
    id: 'SNAP', name: '响指', type: 'attack', rarity: 'common', cost: 1, target: 'enemy',
    tags: ['osty'], text: '[gold]奥斯提[/gold]造成{Damage}点伤害。\n给一张[gold]手牌[/gold]添加[gold]保留[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 10 : 7 }),
    play: async (C) => {
      if (C.ostyAlive()) await C.ostyAttack(C.v('Damage'));
      const [picked] = await C.choose({ from: 'hand', count: 1, filter: c => !c.retain, prompt: '选择一张手牌添加保留', optional: true });
      if (picked) picked.retain = true;
    },
  }),
  SOW: N({
    id: 'SOW', name: '播种', type: 'attack', rarity: 'common', cost: 1, target: 'all',
    retain: true, text: '对所有敌人造成{Damage}点伤害。\n[gold]保留[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 11 : 8 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true }); },
  }),
  WISP: N({
    id: 'WISP', name: '鬼火', type: 'skill', rarity: 'common', cost: 0, target: 'self',
    exhaustOnPlay: true, retainOnUpgrade: true,
    text: '获得{Energy}点能量。\n[gold]消耗[/gold]。',
    vars: () => ({ Energy: 1 }),
    play: async (C) => { C.gainEnergy(C.v('Energy')); },
  }),

  /* ================= 罕见牌 ================= */
  BONE_SHARDS: N({
    id: 'BONE_SHARDS', name: '碎骨', type: 'attack', rarity: 'uncommon', cost: 1, target: 'all',
    tags: ['osty'], text: '若[gold]奥斯提[/gold]存活，对所有敌人造成{Damage}点伤害并获得{Block}点[gold]格挡[/gold]。\n然后[gold]奥斯提[/gold]死去。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 9, Block: c.upgraded ? 12 : 9 }),
    play: async (C) => {
      if (C.ostyMissing()) return;
      await C.ostyAttack(C.v('Damage'), { all: true });
      await C.block(C.v('Block'));
      await C.necro.killOsty();
    },
  }),
  BORROWED_TIME: N({
    id: 'BORROWED_TIME', name: '预借时间', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    // 官方中文写「给予自身灾厄」，源码实为 BorrowedTimePower（本回合牌费 +1），且先给能量后上能力
    text: '获得{Energy}点能量。\n本回合你的牌耗能增加{Cost}点。',
    vars: (c) => ({ Energy: c.upgraded ? 6 : 4, Cost: 1 }),
    play: async (C) => { C.gainEnergy(C.v('Energy')); await C.addPower('borrowedTime', C.v('Cost')); },
  }),
  BURY: N({
    id: 'BURY', name: '埋葬', type: 'attack', rarity: 'uncommon', cost: 4, target: 'enemy',
    text: '造成{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 63 : 52 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  CALCIFY: N({
    id: 'CALCIFY', name: '钙化', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]奥斯提[/gold]的攻击额外造成{Power}点伤害。',
    vars: (c) => ({ Power: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.addPower('calcify', C.v('Power')); },
  }),
  CAPTURE_SPIRIT: N({
    id: 'CAPTURE_SPIRIT', name: '捕捉灵魂', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '敌人失去{Hp}点生命。\n将{Cards}张[gold]灵魂[/gold]加入[gold]抽牌堆[/gold]。',
    vars: (c) => ({ Hp: c.upgraded ? 4 : 3, Cards: c.upgraded ? 4 : 3 }),
    play: async (C) => {
      const t = C.target;
      if (t) await C.dealDamage(t, C.v('Hp'), { ignoreBlock: true });
      await C.necro.addSoul(C.v('Cards'), 'draw');
    },
  }),
  CLEANSE: N({
    id: 'CLEANSE', name: '洁净', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '[gold]召唤[/gold]{Summon}。\n从[gold]抽牌堆[/gold]选择一张牌[gold]消耗[/gold]。',
    vars: (c) => ({ Summon: c.upgraded ? 5 : 3 }),
    play: async (C) => {
      await C.necro.summon(C.v('Summon'));
      const [picked] = await C.choose({ from: 'draw', count: 1, prompt: '选择抽牌堆中的一张牌消耗', optional: true });
      if (picked) { C.necro.takeFromDraw(picked); await C.exhaustCard(picked); }
    },
  }),
  COUNTDOWN: N({
    id: 'COUNTDOWN', name: '倒数计时', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '在你的回合开始时，给予随机敌人{Doom}点[gold]灾厄[/gold]。',
    vars: (c) => ({ Doom: c.upgraded ? 9 : 6 }),
    play: async (C) => { await C.addPower('countdown', C.v('Doom')); },
  }),
  DANSE_MACABRE: N({
    id: 'DANSE_MACABRE', name: '死亡之舞', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你打出一张耗能大于等于2的牌时，获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.addPower('danseMacabre', C.v('Block')); },
  }),
  DEATH_MARCH: N({
    id: 'DEATH_MARCH', name: '死亡行军', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    // 中文写「每抽到一张牌」，源码只数回合抽牌阶段以外抽到的牌
    text: '造成{Damage}点伤害。\n本回合每额外抽一张牌，伤害+{Extra}。',
    vars: (c, C) => ({
      Damage: (c.upgraded ? 9 : 8) + (c.upgraded ? 6 : 4) * (C?.necro?.nonHandDrawsThisTurn || 0),
      Extra: c.upgraded ? 6 : 4,
    }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  DEATHBRINGER: N({
    id: 'DEATHBRINGER', name: '死亡使者', type: 'skill', rarity: 'uncommon', cost: 2, target: 'all',
    text: '给予所有敌人{Doom}层[gold]灾厄[/gold]和{Weak}层[gold]虚弱[/gold]。',
    vars: (c) => ({ Doom: c.upgraded ? 26 : 21, Weak: 1 }),
    play: async (C) => {
      for (const e of C.alive()) await C.necro.addDoom(C.v('Doom'), e);
      for (const e of C.alive()) await C.addPower('weak', C.v('Weak'), e);
    },
  }),
  DEATHS_DOOR: N({
    id: 'DEATHS_DOOR', name: '死亡之门', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n若本回合曾给予过[gold]灾厄[/gold]，额外获得2次[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 7 : 6 }),
    play: async (C) => {
      const times = (C.necro?.doomAppliedThisTurn || 0) > 0 ? 3 : 1;
      for (let i = 0; i < times; i++) await C.block(C.v('Block'));
    },
  }),
  DEBILITATE: N({
    id: 'DEBILITATE', name: '摧残', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n接下来{Turns}回合内，该敌人的[gold]易伤[/gold]与[gold]虚弱[/gold]效果翻倍。',
    vars: (c) => ({ Damage: c.upgraded ? 12 : 10, Turns: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (t?.alive) await C.addPower('debilitate', C.v('Turns'), t);
    },
  }),
  DELAY: N({
    id: 'DELAY', name: '拖延', type: 'skill', rarity: 'uncommon', cost: 2, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n下回合获得{Energy}点能量。',
    vars: (c) => ({ Block: c.upgraded ? 13 : 11, Energy: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.block(C.v('Block')); await C.addPower('energyNextTurn', C.v('Energy')); },
  }),
  DEVOUR_LIFE: N({
    id: 'DEVOUR_LIFE', name: '吞噬生命', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '每当你打出一张[gold]灵魂[/gold]时，[gold]召唤[/gold]{Power}。',
    vars: (c) => ({ Power: c.upgraded ? 2 : 1 }),
    play: async (C) => { await C.addPower('devourLife', C.v('Power')); },
  }),
  DIRGE: N({
    id: 'DIRGE', name: '挽歌', type: 'skill', rarity: 'uncommon', cost: 'X', target: 'self',
    exhaustOnPlay: true,
    textFn: (c) => c.upgraded ? '[gold]召唤[/gold]{Summon} X次。\n将X张[gold]灵魂+[/gold]加入[gold]抽牌堆[/gold]。[gold]消耗[/gold]。' : '[gold]召唤[/gold]{Summon} X次。\n将X张[gold]灵魂[/gold]加入[gold]抽牌堆[/gold]。[gold]消耗[/gold]。',
    vars: (c) => ({ Summon: c.upgraded ? 4 : 3 }),
    play: async (C, c) => {
      const x = C.xValue || 0;
      for (let i = 0; i < x; i++) await C.necro.summon(C.v('Summon'));
      await C.necro.addSoul(x, 'draw', c.upgraded);
    },
  }),
  DREDGE: N({
    id: 'DREDGE', name: '清淤', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    exhaustOnPlay: true, retainOnUpgrade: true,
    text: '将{Cards}张牌从[gold]弃牌堆[/gold]加入[gold]手牌[/gold]。\n[gold]消耗[/gold]。',
    vars: () => ({ Cards: 3 }),
    play: async (C) => {
      const count = Math.min(C.v('Cards'), 10 - C.hand.length);
      if (count <= 0) return;
      const picked = await C.choose({ from: 'discard', count, prompt: '选择弃牌堆中的牌加入手牌', optional: true });
      for (const c of picked) { C.discardPile.splice(C.discardPile.indexOf(c), 1); C.addCardToHand(c); }
    },
  }),
  ENFEEBLING_TOUCH: N({
    id: 'ENFEEBLING_TOUCH', name: '弱化之触', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy',
    ethereal: true, text: '让一名敌人在本回合内失去{Str}点[gold]力量[/gold]。\n[gold]虚无[/gold]。',
    vars: (c) => ({ Str: c.upgraded ? 11 : 8 }),
    play: async (C) => {
      const t = C.target;
      if (!t?.alive) return;
      await C.addPower('strength', -C.v('Str'), t);
      C.necro.addTempStrength(t, C.v('Str'));
    },
  }),
  FETCH: N({
    id: 'FETCH', name: '取回', type: 'attack', rarity: 'uncommon', cost: 0, target: 'enemy',
    tags: ['osty'], text: '[gold]奥斯提[/gold]造成{Damage}点伤害。\n若本回合首次打出此牌，抽{Cards}张牌。',
    vars: (c) => ({ Damage: c.upgraded ? 6 : 3, Cards: 1 }),
    play: async (C, c) => {
      const first = c.fetchTurn !== C.turn;
      if (C.ostyAlive()) {
        await C.ostyAttack(C.v('Damage'));
        if (first) await C.draw(C.v('Cards'));
      }
      c.fetchTurn = C.turn;
    },
  }),
  FRIENDSHIP: N({
    id: 'FRIENDSHIP', name: '友谊', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    // 源码是「最大能量 +1」（每回合能量重置时生效），不是「每回合获得能量」
    text: '失去{Str}点[gold]力量[/gold]。\n每回合的最大能量+{Energy}。',
    vars: (c) => ({ Str: c.upgraded ? 1 : 2, Energy: 1 }),
    play: async (C) => {
      await C.addPower('strength', -C.v('Str'));
      await C.addPower('friendship', C.v('Energy'));
    },
  }),
  HANG: N({
    id: 'HANG', name: '吊杀', type: 'attack', rarity: 'rare', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n之后所有「吊杀」牌对这名敌人造成的伤害翻倍。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 10 }),
    play: async (C) => {
      const t = C.target;
      await C.attack(C.v('Damage'), { target: t });
      if (!t?.alive) return;
      const cur = t.powers.hang || 0;
      await C.addPower('hang', Math.max(2, cur), t);
    },
  }),
  HAUNT: N({
    id: 'HAUNT', name: '纠缠', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你打出一张[gold]灵魂[/gold]时，随机一名敌人失去{Hp}点生命。',
    vars: (c) => ({ Hp: c.upgraded ? 9 : 7 }),
    play: async (C) => { await C.addPower('haunt', C.v('Hp')); },
  }),
  HIGH_FIVE: N({
    id: 'HIGH_FIVE', name: '击掌', type: 'attack', rarity: 'uncommon', cost: 2, target: 'all',
    tags: ['osty'], canPlay: (C) => C.ostyAlive(),
    text: '[gold]奥斯提[/gold]对所有敌人造成{Damage}点伤害并给予{Vuln}层[gold]易伤[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 11, Vuln: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      if (C.ostyMissing()) return;
      await C.ostyAttack(C.v('Damage'), { all: true });
      for (const e of C.alive()) await C.addPower('vulnerable', C.v('Vuln'), e);
    },
  }),
  LETHALITY: N({
    id: 'LETHALITY', name: '致死性', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    ethereal: true, text: '每回合的第一张攻击牌造成{Percent}%额外伤害。\n[gold]虚无[/gold]。',
    vars: (c) => ({ Percent: c.upgraded ? 75 : 50 }),
    play: async (C) => { await C.addPower('lethality', C.v('Percent')); },
  }),
  MELANCHOLY: N({
    id: 'MELANCHOLY', name: '忧郁', type: 'skill', rarity: 'uncommon', cost: 3, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n每当有生物死亡，此牌本场战斗耗能-1。',
    vars: (c) => ({ Block: c.upgraded ? 17 : 13 }),
    play: async (C) => { await C.block(C.v('Block')); },
  }),
  NECRO_MASTERY: N({
    id: 'NECRO_MASTERY', name: '亡灵精通', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    text: '[gold]召唤[/gold]{Summon}。\n每当[gold]奥斯提[/gold]失去生命，所有敌人失去等量生命。',
    vars: (c) => ({ Summon: c.upgraded ? 8 : 5 }),
    play: async (C) => {
      await C.necro.summon(C.v('Summon'));
      await C.addPower('necroMastery', 1);
    },
  }),
  NO_ESCAPE: N({
    id: 'NO_ESCAPE', name: '无处可逃', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '给予{Doom}层[gold]灾厄[/gold]，敌人每有10层[gold]灾厄[/gold]额外+5层。',
    vars: (c, C) => {
      const base = c.upgraded ? 15 : 10;
      const t = C?.target;
      return { Doom: base + 5 * Math.floor(doomOf(t) / 10) };
    },
    play: async (C) => {
      const t = C.target;
      if (t) await C.necro.addDoom(C.v('Doom'), t);
    },
  }),
  PAGESTORM: N({
    id: 'PAGESTORM', name: '书页风暴', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    upgradeCost: 0, text: '每当你抽到一张[gold]虚无[/gold]牌时，抽{Cards}张牌。',
    vars: () => ({ Cards: 1 }),
    play: async (C) => { await C.addPower('pagestorm', C.v('Cards')); },
  }),
  PARSE: N({
    id: 'PARSE', name: '领会', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    ethereal: true, text: '抽{Cards}张牌。\n[gold]虚无[/gold]。',
    vars: (c) => ({ Cards: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.draw(C.v('Cards')); },
  }),
  PULL_FROM_BELOW: N({
    id: 'PULL_FROM_BELOW', name: '亡魂牵引', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '本场战斗中每打出过一张[gold]虚无[/gold]牌，造成{Damage}点伤害一次。',
    vars: (c, C) => ({ Damage: c.upgraded ? 7 : 5, Hits: C?.necro?.etherealPlays || 0 }),
    play: async (C) => { await C.attack(C.v('Damage'), { times: C.v('Hits') }); },
  }),
  PUTREFY: N({
    id: 'PUTREFY', name: '腐败', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy',
    exhaustOnPlay: true, text: '给予{Power}层[gold]虚弱[/gold]与{Power}层[gold]易伤[/gold]。\n[gold]消耗[/gold]。',
    vars: (c) => ({ Power: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      const t = C.target;
      if (!t) return;
      await C.addPower('weak', C.v('Power'), t);
      await C.addPower('vulnerable', C.v('Power'), t);
    },
  }),
  RATTLE: N({
    id: 'RATTLE', name: '猛晃', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    tags: ['osty'], text: '[gold]奥斯提[/gold]造成{Damage}点伤害。\n他本回合每攻击过一次，此牌额外打出一次伤害。',
    vars: (c, C) => ({ Damage: c.upgraded ? 9 : 7, Hits: 1 + (C?.necro?.ostyAttacksThisTurn || 0) }),
    play: async (C) => { if (C.ostyAlive()) await C.ostyAttack(C.v('Damage'), { times: C.v('Hits') }); },
  }),
  REANIMATE: N({
    id: 'REANIMATE', name: '死者苏生', type: 'skill', rarity: 'rare', cost: 3, target: 'self',
    exhaustOnPlay: true, text: '[gold]召唤[/gold]{Summon}。\n[gold]消耗[/gold]。',
    vars: (c) => ({ Summon: c.upgraded ? 25 : 20 }),
    play: async (C) => { await C.necro.summon(C.v('Summon')); },
  }),
  REAPER_FORM: N({
    id: 'REAPER_FORM', name: '死神形态', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    retainOnUpgrade: true, text: '每当你的攻击造成伤害时，同时给予等量的[gold]灾厄[/gold]。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('reaperForm', 1); },
  }),
  RIGHT_HAND_HAND: N({
    id: 'RIGHT_HAND_HAND', name: '得力助手', type: 'attack', rarity: 'uncommon', cost: 0, target: 'enemy',
    tags: ['osty'], text: '[gold]奥斯提[/gold]造成{Damage}点伤害。\n每打出一张耗能≥2的牌，将此牌从[gold]弃牌堆[/gold]放回[gold]手牌[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 6 : 4 }),
    play: async (C) => { if (C.ostyAlive()) await C.ostyAttack(C.v('Damage')); },
  }),
  SACRIFICE: N({
    id: 'SACRIFICE', name: '牺牲', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    upgradeCost: 0, retain: true,
    // 官方中文写「双倍最大生命值」，C# 为 MaxHp * 3，按源码实现
    text: '若[gold]奥斯提[/gold]存活，他死去，你获得其最大生命值3倍的[gold]格挡[/gold]。\n[gold]保留[/gold]。',
    vars: (c, C) => ({ Block: 3 * (C ? ostyMaxHp(C) : 0) }),
    play: async (C) => {
      if (C.ostyMissing()) return;
      await C.necro.killOsty();
      await C.block(C.v('Block'));
    },
  }),
  SEANCE: N({
    id: 'SEANCE', name: '降灵', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    upgradeCost: 0, ethereal: true,
    // 源码 TransformTo<Soul> 始终生成未升级的「灵魂」，官方中文的「灵魂+」不成立
    text: '将[gold]抽牌堆[/gold]中的一张牌变化为[gold]灵魂[/gold]。\n[gold]虚无[/gold]。',
    vars: () => ({ Cards: 1 }),
    play: async (C) => {
      const [picked] = await C.choose({ from: 'draw', count: 1, prompt: '选择抽牌堆中的一张牌变为灵魂', optional: true });
      if (picked) C.necro.transformToSoul(picked);
    },
  }),
  SENTRY_MODE: N({
    id: 'SENTRY_MODE', name: '哨卫模式', type: 'power', rarity: 'rare', cost: 2, target: 'self',
    upgradeCost: 1, text: '在你的回合开始时，将{Cards}张[gold]扫荡凝视[/gold]加入[gold]手牌[/gold]。',
    vars: () => ({ Cards: 1 }),
    play: async (C) => { await C.addPower('sentryMode', C.v('Cards')); },
  }),
  SEVERANCE: N({
    id: 'SEVERANCE', name: '切断', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy',
    text: '造成{Damage}点伤害。\n将一张[gold]灵魂[/gold]分别加入[gold]抽牌堆[/gold]、[gold]手牌[/gold]和[gold]弃牌堆[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 18 : 13 }),
    play: async (C) => {
      await C.attack(C.v('Damage'));
      await C.necro.addSoul(1, 'draw');
      await C.necro.addSoul(1, 'hand');
      await C.necro.addSoul(1, 'discard');
    },
  }),
  SHARED_FATE: N({
    id: 'SHARED_FATE', name: '命运同担', type: 'skill', rarity: 'rare', cost: 0, target: 'enemy',
    exhaustOnPlay: true, text: '失去{Self}点[gold]力量[/gold]。\n敌人失去{Enemy}点[gold]力量[/gold]。\n[gold]消耗[/gold]。',
    vars: (c) => ({ Self: 2, Enemy: c.upgraded ? 3 : 2 }),
    play: async (C) => {
      await C.addPower('strength', -C.v('Self'));
      const t = C.target;
      if (t) await C.addPower('strength', -C.v('Enemy'), t);
    },
  }),
  SHROUD: N({
    id: 'SHROUD', name: '厄运之衣', type: 'power', rarity: 'uncommon', cost: 1, target: 'self',
    text: '每当你给予[gold]灾厄[/gold]时，获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 4 : 3 }),
    play: async (C) => { await C.addPower('shroud', C.v('Block')); },
  }),
  SIC_EM: N({
    id: 'SIC_EM', name: '紧追不放', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    tags: ['osty'], text: '[gold]奥斯提[/gold]造成{Damage}点伤害。\n本回合每当[gold]奥斯提[/gold]攻击该敌人，[gold]召唤[/gold]{Power}。',
    vars: (c) => ({ Damage: c.upgraded ? 6 : 5, Power: c.upgraded ? 4 : 3 }),
    play: async (C) => {
      const t = C.target;
      if (C.ostyAlive()) await C.ostyAttack(C.v('Damage'), { target: t });
      if (t?.alive) await C.addPower('sicEm', C.v('Power'), t);
    },
  }),
  SLEIGHT_OF_FLESH: N({
    id: 'SLEIGHT_OF_FLESH', name: '血肉戏法', type: 'power', rarity: 'uncommon', cost: 2, target: 'self',
    text: '每当你给予敌人负面状态时，使其受到{Damage}点伤害。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 9 }),
    play: async (C) => { await C.addPower('sleightOfFlesh', C.v('Damage')); },
  }),
  SPUR: N({
    id: 'SPUR', name: '增生', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self',
    retain: true, text: '[gold]召唤[/gold]{Summon}。\n[gold]奥斯提[/gold]回复{Heal}点生命。\n[gold]保留[/gold]。',
    vars: (c) => ({ Summon: c.upgraded ? 5 : 3, Heal: c.upgraded ? 7 : 5 }),
    play: async (C) => { await C.necro.summon(C.v('Summon')); await C.necro.healOsty(C.v('Heal')); },
  }),
  TIMES_UP: N({
    id: 'TIMES_UP', name: '大限已至', type: 'attack', rarity: 'rare', cost: 2, target: 'enemy',
    retainOnUpgrade: true, text: '造成等量于该敌人身上[gold]灾厄[/gold]层数的伤害。',
    vars: (c, C) => ({ Damage: C ? doomOf(C.target) : 0 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  TRANSFIGURE: N({
    id: 'TRANSFIGURE', name: '重构', type: 'skill', rarity: 'rare', cost: 1, target: 'self',
    exhaustOnPlay: true, noExhaustOnUpgrade: true,
    text: '给一张[gold]手牌[/gold]添加[gold]重放[/gold]（额外打出一次），其耗能+{Cost}。',
    vars: () => ({ Cost: 1 }),
    play: async (C) => {
      const [picked] = await C.choose({ from: 'hand', count: 1, prompt: '选择一张手牌添加重放', optional: true });
      if (!picked) return;
      picked.replayBonus = (picked.replayBonus || 0) + 1;
      if (typeof picked.cost === 'number') picked.costPenalty = (picked.costPenalty || 0) + C.v('Cost');
      C.emit();
    },
  }),
  UNDEATH: N({
    id: 'UNDEATH', name: '不死', type: 'skill', rarity: 'rare', cost: 0, target: 'self',
    text: '获得{Block}点[gold]格挡[/gold]。\n在[gold]弃牌堆[/gold]放入一张此牌的复制品。',
    vars: (c) => ({ Block: c.upgraded ? 9 : 7 }),
    play: async (C, c) => {
      await C.block(C.v('Block'));
      C.discardPile.push(C.makeCard(c.id, c.upgraded));
    },
  }),
  VEILPIERCER: N({
    id: 'VEILPIERCER', name: '刺破帷幕', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n你打出的下一张[gold]虚无[/gold]牌耗能变为0。',
    vars: (c) => ({ Damage: c.upgraded ? 13 : 10 }),
    play: async (C) => { await C.attack(C.v('Damage')); await C.addPower('veilpiercer', 1); },
  }),

  /* ================= 稀有牌 ================= */
  BANSHEES_CRY: N({
    id: 'BANSHEES_CRY', name: '女妖之嚎', type: 'attack', rarity: 'rare', cost: 9, target: 'all',
    upgradeCost: 7, text: '对所有敌人造成{Damage}点伤害。\n本场每打出一张[gold]虚无[/gold]牌，此牌耗能-2。',
    vars: () => ({ Damage: 33 }),
    play: async (C) => { await C.attack(C.v('Damage'), { all: true }); },
  }),
  CALL_OF_THE_VOID: N({
    id: 'CALL_OF_THE_VOID', name: '虚空之唤', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    innateOnUpgrade: true, text: '在你的回合开始时，将{Cards}张随机牌加入[gold]手牌[/gold]并给予[gold]虚无[/gold]。',
    vars: () => ({ Cards: 1 }),
    play: async (C) => { await C.addPower('callOfTheVoid', C.v('Cards')); },
  }),
  DEMESNE: N({
    id: 'DEMESNE', name: '领域', type: 'power', rarity: 'rare', cost: 3, target: 'self',
    upgradeCost: 2, ethereal: true,
    // 官方中文写「获得能量」，源码是 ModifyMaxEnergy（最大能量 +1）+ 多抽 1
    text: '每回合的最大能量+{Energy}并额外抽{Cards}张牌。\n[gold]虚无[/gold]。',
    vars: () => ({ Energy: 1, Cards: 1 }),
    play: async (C) => { await C.addPower('demesne', C.v('Cards')); },
  }),
  EIDOLON: N({
    id: 'EIDOLON', name: '幻景', type: 'skill', rarity: 'rare', cost: 2, target: 'self',
    upgradeCost: 1, exhaustOnPlay: true,
    // 官方中文写「消耗所有手牌，≥9 张得无实体」，C# 实际是从消耗堆自动打出所有虚无牌
    text: '自动打出[gold]消耗堆[/gold]中所有[gold]虚无[/gold]牌（不耗能）。\n[gold]消耗[/gold]。',
    vars: () => ({}),
    play: async (C) => {
      const list = C.exhaustPile.filter(c => c.ethereal && !c.unplayable);
      for (const card of list) {
        if (C.finished) break;
        const i = C.exhaustPile.indexOf(card);
        if (i < 0) continue;
        C.exhaustPile.splice(i, 1);
        C.currentCard = card;
        C._target = C.alive()[0] || null;
        try { await card.def.play(C, card); } catch (err) { console.error('[eidolon]', err); }
        C.currentCard = null;
        if (!C.finished) {
          if (card.exhaustOnPlay) C.exhaustPile.push(card);
          else C.discardPile.push(card);
        }
      }
      C.emit();
    },
  }),
  END_OF_DAYS: N({
    id: 'END_OF_DAYS', name: '末日降临', type: 'skill', rarity: 'rare', cost: 3, target: 'all',
    text: '给予所有敌人{Doom}层[gold]灾厄[/gold]。\n杀死所有[gold]灾厄[/gold]不小于当前生命值的敌人。',
    vars: (c) => ({ Doom: c.upgraded ? 37 : 29 }),
    play: async (C) => {
      for (const e of C.alive()) await C.necro.addDoom(C.v('Doom'), e);
      await C.necro.doomKill(C.alive());
    },
  }),
  ERADICATE: N({
    id: 'ERADICATE', name: '根除', type: 'attack', rarity: 'rare', cost: 'X', target: 'enemy',
    retain: true, text: '造成{Damage}点伤害X次。\n[gold]保留[/gold]。',
    vars: (c) => ({ Damage: c.upgraded ? 14 : 11 }),
    play: async (C) => { await C.attack(C.v('Damage'), { times: C.xValue || 0 }); },
  }),
  MISERY: N({
    id: 'MISERY', name: '苦难', type: 'attack', rarity: 'rare', cost: 0, target: 'enemy',
    retainOnUpgrade: true,
    text: '造成{Damage}点伤害。\n给予其他敌人该敌人身上的所有负面状态。',
    vars: (c) => ({ Damage: c.upgraded ? 9 : 7 }),
    play: async (C) => {
      const t = C.target;
      const snapshot = t ? Object.entries(t.powers).filter(([k, n]) => DEBUFF_IDS.has(k) && n !== 0) : [];
      await C.attack(C.v('Damage'), { target: t });
      for (const e of C.alive()) {
        if (e === t) continue;
        for (const [k, n] of snapshot) await C.addPower(k, n, e);
      }
    },
  }),
  NEUROSURGE: N({
    id: 'NEUROSURGE', name: '精神过载', type: 'power', rarity: 'rare', cost: 0, target: 'self',
    text: '获得{Energy}点能量。\n抽{Cards}张牌。\n在你的回合开始时，给予自身{Doom}层[gold]灾厄[/gold]。',
    vars: (c) => ({ Energy: c.upgraded ? 4 : 3, Cards: 2, Doom: 3 }),
    play: async (C) => {
      C.gainEnergy(C.v('Energy'));
      await C.draw(C.v('Cards'));
      await C.addPower('neurosurge', C.v('Doom'));
    },
  }),
  OBLIVION: N({
    id: 'OBLIVION', name: '湮灭', type: 'skill', rarity: 'rare', cost: 0, target: 'enemy',
    text: '你在本回合内每打出一张牌，给予该敌人{Doom}层[gold]灾厄[/gold]。',
    vars: (c) => ({ Doom: c.upgraded ? 4 : 3 }),
    play: async (C) => {
      const t = C.target;
      if (t) await C.addPower('oblivion', C.v('Doom'), t);
    },
  }),
  SOUL_STORM: N({
    id: 'SOUL_STORM', name: '灵魂风暴', type: 'attack', rarity: 'rare', cost: 1, target: 'enemy',
    text: '造成{Damage}点伤害。\n[gold]消耗堆[/gold]里每有一张[gold]灵魂[/gold]，伤害+{Extra}。',
    vars: (c, C) => ({ Damage: 9 + (c.upgraded ? 6 : 4) * soulCount(C), Extra: c.upgraded ? 6 : 4 }),
    play: async (C) => { await C.attack(C.v('Damage')); },
  }),
  SPIRIT_OF_ASH: N({
    id: 'SPIRIT_OF_ASH', name: '灰烬之灵', type: 'power', rarity: 'rare', cost: 1, target: 'self',
    text: '每当你打出一张[gold]虚无[/gold]牌时，获得{Block}点[gold]格挡[/gold]。',
    vars: (c) => ({ Block: c.upgraded ? 5 : 4 }),
    play: async (C) => { await C.addPower('spiritOfAsh', C.v('Block')); },
  }),
  SQUEEZE: N({
    id: 'SQUEEZE', name: '榨取', type: 'attack', rarity: 'rare', cost: 3, target: 'enemy',
    tags: ['osty'], text: '[gold]奥斯提[/gold]造成{Damage}点伤害。\n每张[gold]奥斯提[/gold]攻击牌使伤害+{Extra}。',
    vars: (c, C) => ({ Damage: (c.upgraded ? 30 : 25) + (c.upgraded ? 6 : 5) * (C?.necro?.countOstyAttackCards() || 0), Extra: c.upgraded ? 6 : 5 }),
    play: async (C) => { if (C.ostyAlive()) await C.ostyAttack(C.v('Damage')); },
  }),
  THE_SCYTHE: N({
    id: 'THE_SCYTHE', name: '巨镰', type: 'attack', rarity: 'rare', cost: 2, target: 'enemy',
    exhaustOnPlay: true,
    text: '造成{Damage}点伤害。\n本局游戏中此牌的伤害永久+{Increase}。\n[gold]消耗[/gold]。',
    vars: (c) => ({ Damage: 13 + (c.persist?.scytheBonus || c.bonus || 0), Increase: c.upgraded ? 7 : 5 }),
    play: async (C, c) => {
      await C.attack(C.v('Damage'));
      const inc = C.v('Increase');
      if (c.persist) c.persist.scytheBonus = (c.persist.scytheBonus || 0) + inc; // 写回牌组，跨战斗生效
      else c.bonus = (c.bonus || 0) + inc;
    },
  }),

  /* ================= 先古牌（不进普通奖励池） ================= */
  FORBIDDEN_GRIMOIRE: N({
    id: 'FORBIDDEN_GRIMOIRE', name: '禁忌魔典', type: 'power', rarity: 'ancient', cost: 2, target: 'self',
    upgradeCost: 1, text: '在战斗结束时，可以从[gold]牌组[/gold]中选一张牌移除。',
    vars: () => ({}),
    play: async (C) => { await C.addPower('forbiddenGrimoire', 1); },
  }),
  PROTECTOR: N({
    id: 'PROTECTOR', name: '守护者', type: 'attack', rarity: 'ancient', cost: 1, target: 'enemy',
    upgradeCost: 0, tags: ['osty'],
    text: '[gold]奥斯提[/gold]造成{Damage}点伤害（含其最大生命值）。',
    vars: (c, C) => ({ Damage: (c.upgraded ? 15 : 10) + (C ? ostyMaxHp(C) : 0) }),
    play: async (C) => { if (C.ostyAlive()) await C.ostyAttack(C.v('Damage')); },
  }),
};

