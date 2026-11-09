/**
 * 先古（Ancient）遗物 —— 8 位先古之民的赠礼。
 * 效果对照 sts2-sim 的 Models/Relics/*.cs 与 Models/Events/Ancients/*.cs，
 * 中文取自官方 zhs 本地化（relics.json）；少数源码里有、本地化里缺失的条目按类名意译。
 *
 * 钩子约定：
 *   拾起时       onObtain(R)
 *   战斗中       onCombatStart / beforeDraw / afterDraw / onTurnStart / onCardPlayed /
 *                modifyMaxEnergy / modifyDraw / modifyCost / onTurnEnd / onCombatEnd
 *   幕/房间      onRoomEntered / onRestHeal / onEliteWin / onCombatWon
 * 需要玩家做选择的「拾起时」效果统一 R.queueRelicJob(job)，由 UI 在流程空档兑现。
 */
import { CARDS } from './cards.js';

const leg = (R, tag) => R.deck.find(d => CARDS[d.id]?.tags?.includes(tag) && CARDS[d.id].rarity === 'basic');
const basicId = (R, kind) => `${kind}_${R.charId}`;
const upgradable = (R) => R.deck.filter(d => !d.upgraded && CARDS[d.id] && !['status', 'curse'].includes(CARDS[d.id].rarity));
const removable = (R) => R.deck.filter(d => CARDS[d.id] && !CARDS[d.id].eternal);
const randCurse = (R, e) => R.randomCurse(e);

export const ANCIENT_RELICS = {
  /* =====================================================================
     涅奥（Neow）—— 第一幕幕首
     ===================================================================== */

  /* ---------- 代价（诅咒）----------- */
  CURSED_PEARL: {
    name: '诅咒珍珠', icon: '🦪', rarity: 'ancient',
    desc: '拾起时，获得一张[red]贪婪[/red]，获得333[gold]金币[/gold]。',
    onObtain: (R) => { R.addCard('GREED'); R.gainGold(333); },
  },
  DOWSING_ROD: {
    name: '探测棒', icon: '🥢', rarity: 'ancient',
    desc: '拾起时，获得一张[gold]占卜[/gold]（走完5个未知房间后变为[gold]丰饶[/gold]）。',
    onObtain: (R) => { R.addCard('DOWSING'); },
  },
  HEFTY_TABLET: {
    name: '厚重石板', icon: '🪨', rarity: 'ancient',
    desc: '拾起时，从3张[gold]稀有牌[/gold]中选择1张加入牌组，并将一张[red]受伤[/red]加入牌组。',
    onObtain: (R) => R.queueRelicJob({ k: 'reward', picks: 1, rarity: 'rare', extraCard: 'INJURY', optional: true }),
  },
  LARGE_CAPSULE: {
    name: '巨大扭蛋', icon: '🥚', rarity: 'ancient',
    desc: '拾起时，获得2件随机[gold]遗物[/gold]，并额外获得一对[gold]打击[/gold]和[gold]防御[/gold]。',
    onObtain: (R) => {
      R.addRelic(R.rollRelic());
      R.addRelic(R.rollRelic());
      R.addCard(basicId(R, 'STRIKE'));
      R.addCard(basicId(R, 'DEFEND'));
    },
  },
  LEAFY_POULTICE: {
    name: '树叶药膏', icon: '🍃', rarity: 'ancient',
    desc: '拾起时，[gold]变化[/gold]你的1张[gold]打击[/gold]和1张[gold]防御[/gold]，然后失去12点最大生命。',
    onObtain: (R) => {
      R.gainMaxHp(-12);
      for (const tag of ['strike', 'defend']) {
        const e = leg(R, tag);
        if (e) R.transformEntry(e, R.randomCard({ rarity: ['common', 'uncommon', 'rare'] }));
      }
    },
  },
  NEOWS_BONES: {
    name: '涅奥之骨', icon: '🦴', rarity: 'ancient',
    desc: '拾起时，获得2件[gold]先古[/gold]遗物，然后将一张随机[red]诅咒[/red]加入牌组。',
    onObtain: (R) => R.queueRelicJob({ k: 'ancientRelics', n: 2, thenCurse: true }),
  },
  NEOWS_SACRIFICE: {
    name: '涅奥的牺牲', icon: '🔥', rarity: 'ancient',
    desc: '拾起时，获得药水[gold]龙涎香[/gold]，将一张[red]愧疚[/red]加入牌组。',
    onObtain: (R) => { R.addPotion('AMBERGRIS'); R.addCard('GUILTY'); },
  },
  PRECARIOUS_SHEARS: {
    name: '松动羊毛剪', icon: '✂️', rarity: 'ancient',
    desc: '拾起时，从牌组中移除2张牌，并受到16点伤害。',
    onObtain: (R) => { R.damage(16); R.queueRelicJob({ k: 'remove', n: 2 }); },
  },
  SILKEN_TRESS: {
    name: '丝之长发', icon: '🎀', rarity: 'ancient',
    desc: '拾起时，失去所有[gold]金币[/gold]。你遇到的第一组卡牌奖励会被[gold]附魔[/gold]：[purple]华彩[/purple]。',
    onObtain: (R) => { R.gainGold(-R.gold); R.relicData.silkenTress = 1; },
  },
  SILVER_CRUCIBLE: {
    name: '白银熔炉', icon: '⚗️', rarity: 'ancient',
    desc: '你遇到的前3组卡牌奖励将是被[gold]升级[/gold]过的。你打开的第一个宝箱将是[red]空的[/red]。',
    onObtain: (R) => { R.relicData.silverCrucible = 3; },
  },

  /* ---------- 馈赠（正面）----------- */
  ARCANE_SCROLL: {
    name: '奥术卷轴', icon: '📜', rarity: 'ancient',
    desc: '拾起时，将一张随机[gold]稀有牌[/gold]加入你的牌组。',
    onObtain: (R) => { const id = R.randomCardId('rare'); if (id) R.addCard(id); },
  },
  BOOMING_CONCH: {
    name: '轰鸣海螺', icon: '🐚', rarity: 'ancient',
    desc: '在[gold]精英[/gold]战的第一回合，额外抽2张牌并获得1点能量。',
    onTurnStart: (C, turn) => {
      if (turn === 1 && C.isElite) C.gainEnergy(1);
    },
    modifyDraw: (C, n) => (C.turn === 1 && C.isElite ? n + 2 : n),
  },
  FISHING_ROD: {
    name: '钓竿', icon: '🎣', rarity: 'ancient',
    desc: '每经过3场普通战斗，随机[gold]升级[/gold]一张牌。',
    onCombatWon: (R, o) => {
      if (o.nodeType !== 'monster') return;
      R.relicData.fishingRod = (R.relicData.fishingRod || 0) + 1;
      if (R.relicData.fishingRod % 3) return;
      const pool = upgradable(R);
      if (pool.length) R.rng.pick(pool).upgraded = true;
    },
  },
  GOLDEN_PEARL: {
    name: '金色珍珠', icon: '🟡', rarity: 'ancient',
    desc: '拾起时，获得150[gold]金币[/gold]。',
    onObtain: (R) => R.gainGold(150),
  },
  KALEIDOSCOPE: {
    name: '万花筒', icon: '🔮', rarity: 'ancient',
    desc: '拾起时，获得2组来自[gold]其他角色[/gold]的卡牌奖励。',
    onObtain: (R) => {
      R.queueRelicJob({ k: 'reward', picks: 1, count: 3, otherChar: true });
      R.queueRelicJob({ k: 'reward', picks: 1, count: 3, otherChar: true });
    },
  },
  LEAD_PAPERWEIGHT: {
    name: '铅制镇纸', icon: '⚖️', rarity: 'ancient',
    desc: '拾起时，从2张无色牌中选择1张加入你的[gold]牌组[/gold]。',
    onObtain: (R) => R.queueRelicJob({ k: 'reward', picks: 1, count: 2, colorless: true, optional: true }),
  },
  LOST_COFFER: {
    name: '失物盒', icon: '🧳', rarity: 'ancient',
    desc: '拾起时，获得1组卡牌奖励和1瓶随机药水。',
    onObtain: (R) => { R.addPotion(R.rollPotion()); R.queueRelicJob({ k: 'reward', picks: 1, count: 3 }); },
  },
  MASSIVE_SCROLL: {
    name: '巨大卷轴', icon: '📜', rarity: 'ancient', multiOnly: true,
    desc: '（多人游戏专属，单人局不会出现。）',
  },
  NEOWS_TORMENT: {
    name: '涅奥的苦痛', icon: '😖', rarity: 'ancient',
    desc: '拾起时，将1张[gold]涅奥之怒[/gold]加入你的[gold]牌组[/gold]。',
    onObtain: (R) => R.addCard('NEOWS_FURY'),
  },
  NEW_LEAF: {
    name: '新叶', icon: '🌱', rarity: 'ancient',
    desc: '拾起时，[gold]变化[/gold]1张牌。',
    onObtain: (R) => R.queueRelicJob({ k: 'transform', n: 1 }),
  },
  PHIAL_HOLSTER: {
    name: '药水瓶套', icon: '🧷', rarity: 'ancient',
    desc: '拾起时，获得1个药水栏位，并装满2瓶随机药水。',
    onObtain: (R) => {
      R.potionSlots += 1;
      R.potions.push(null);
      for (let i = 0; i < 2; i++) R.addPotion(R.rollPotion());
    },
  },
  PRECISE_SCISSORS: {
    name: '精准剪刀', icon: '✂️', rarity: 'ancient',
    desc: '拾起时，从你的[gold]牌组[/gold]中移除1张牌。',
    onObtain: (R) => R.queueRelicJob({ k: 'remove', n: 1 }),
  },
  SCROLL_BOXES: {
    name: '卷轴箱', icon: '📦', rarity: 'ancient',
    desc: '拾起时，失去所有[gold]金币[/gold]，并从2个卡牌包中选择1包加入你的[gold]牌组[/gold]。',
    onObtain: (R) => {
      R.gainGold(-R.gold);
      R.queueRelicJob({ k: 'bundle' });
    },
  },
  WINGED_BOOTS: {
    name: '飞翼靴', icon: '👢', rarity: 'ancient',
    desc: '你可以无视地图连线自由移动3次。',
    onObtain: (R) => { R.relicData.wingedBoots = 3; },
  },

  /* ---------- 额外馈赠 ---------- */
  LAVA_ROCK: {
    name: '熔岩石', icon: '🌋', rarity: 'ancient',
    desc: '第一幕的Boss敌人额外掉落2件[gold]遗物[/gold]。',
    onBossRewards: (R, act) => (act === 1 && !R.relicData.lavaRockUsed ? 2 : 0),
  },
  NEOWS_TALISMAN: {
    name: '涅奥的护符', icon: '🧿', rarity: 'ancient',
    desc: '拾起时，[gold]升级[/gold]你的最后一张[gold]打击[/gold]与最后一张[gold]防御[/gold]。',
    onObtain: (R) => {
      for (const tag of ['strike', 'defend']) {
        const list = R.deck.filter(d => CARDS[d.id]?.tags?.includes(tag) && CARDS[d.id].rarity === 'basic');
        const last = list[list.length - 1];
        if (last) last.upgraded = true;
      }
    },
  },
  NUTRITIOUS_OYSTER: {
    name: '营养牡蛎', icon: '🦪', rarity: 'ancient',
    desc: '拾起时，将你的最大生命值提升11点。',
    onObtain: (R) => R.gainMaxHp(11),
  },
  POMANDER: {
    name: '橙型香盒', icon: '🍊', rarity: 'ancient',
    desc: '拾起时，[gold]升级[/gold]一张牌。',
    onObtain: (R) => R.queueRelicJob({ k: 'upgrade', n: 1 }),
  },
  SMALL_CAPSULE: {
    name: '小型扭蛋', icon: '🥚', rarity: 'ancient',
    desc: '拾起时，获得一件随机[gold]遗物[/gold]。',
    onObtain: (R) => R.addRelic(R.rollRelic()),
  },
  STONE_HUMIDIFIER: {
    name: '石炉加湿器', icon: '🫖', rarity: 'ancient',
    desc: '每当你在[gold]休息处[/gold]休息时，将你的最大生命值提升5点。',
    onRestHeal: (R) => R.gainMaxHp(5),
  },

  /* =====================================================================
     欧洛巴斯（Orobas）—— 第二幕
     ===================================================================== */
  ELECTRIC_SHRYMP: {
    name: '放电异虾', icon: '🦐', rarity: 'ancient',
    desc: '拾起时，选择一张技能牌为它[gold]附魔[/gold]：[purple]注能[/purple]。',
    onObtain: (R) => R.queueRelicJob({ k: 'enchant', enchant: 'IMBUED', n: 1, type: 'skill' }),
  },
  GLASS_EYE: {
    name: '玻璃眼珠', icon: '👁️', rarity: 'ancient',
    desc: '拾起时，获得2组[gold]普通[/gold]、2组[gold]罕见[/gold]和1组[gold]稀有[/gold]卡牌奖励。',
    onObtain: (R) => {
      for (const r of ['common', 'common', 'uncommon', 'uncommon', 'rare']) {
        R.queueRelicJob({ k: 'reward', picks: 1, count: 3, rarity: r });
      }
    },
  },
  ALCHEMICAL_COFFER: {
    name: '炼金箱', icon: '🧪', rarity: 'ancient',
    desc: '拾起时，获得4个放有随机药水的药水栏位。',
    onObtain: (R) => {
      R.potionSlots += 4;
      for (let i = 0; i < 4; i++) R.potions.push(null);
      for (let i = 0; i < 4; i++) R.addPotion(R.rollPotion());
    },
  },
  DRIFTWOOD: {
    name: '浮木', icon: '🪵', rarity: 'ancient',
    desc: '你可以在每一个卡牌奖励中重掷一次。',
    onObtain: (R) => { R.relicData.driftwood = 1; },
  },
  RADIANT_PEARL: {
    name: '发光珍珠', icon: '⚪', rarity: 'ancient',
    desc: '在每场战斗开始时，将1张[gold]冷光[/gold]加入你的[gold]手牌[/gold]。',
    beforeDraw: (C, turn) => {
      if (turn !== 1) return;
      C.addCardToHand(C.makeCard('LUMINESCE'), true);
    },
  },
  SAND_CASTLE: {
    name: '沙堡', icon: '🏰', rarity: 'ancient',
    desc: '拾起时，随机[gold]升级[/gold]6张牌。',
    onObtain: (R) => {
      for (const e of R.rng.pickMany(upgradable(R), 6)) e.upgraded = true;
    },
  },
  TOUCH_OF_OROBAS: {
    name: '欧洛巴斯之触', icon: '🖐️', rarity: 'ancient',
    desc: '拾起时，将你的初始[gold]遗物[/gold]替换为[gold]先古[/gold]版本。',
    onObtain: (R) => {
      const map = {
        BURNING_BLOOD: 'BLACK_BLOOD', RING_OF_THE_SNAKE: 'RING_OF_THE_DRAKE',
        DIVINE_RIGHT: 'DIVINE_DESTINY', BOUND_PHYLACTERY: 'PHYLACTERY_UNBOUND',
        CRACKED_CORE: 'INFUSED_CORE',
      };
      const idx = R.relics.findIndex((id) => map[id]);
      if (idx < 0) return;
      const up = map[R.relics[idx]];
      R.relics.splice(idx, 1);
      R.relics.push(up);
    },
  },
  ARCHAIC_TOOTH: {
    name: '古老牙齿', icon: '🦷', rarity: 'ancient',
    desc: '拾起时，将一张初始卡牌[gold]变化[/gold]为先古版本。',
    onObtain: (R) => {
      const map = { BASH: 'BREAK', NEUTRALIZE: 'SUPPRESS', UNLEASH: 'PROTECTOR', FALLING_STAR: 'METEOR_SHOWER', DUALCAST: 'QUADCAST' };
      const e = R.deck.find((d) => map[d.id]);
      if (!e) return;
      e.id = map[e.id];
    },
  },
  SEA_GLASS: {
    name: '海玻璃', icon: '🔷', rarity: 'ancient',
    desc: '查看来自[gold]其他角色[/gold]的15张牌，从中选择任意数量的卡牌加入你的[gold]牌组[/gold]。',
    onObtain: (R) => {
      const others = ['IRONCLAD', 'SILENT', 'DEFECT', 'REGENT', 'NECROBINDER'].filter((c) => c !== R.charId);
      R.queueRelicJob({ k: 'seaglass', charId: R.rng.pick(others) });
    },
  },
  PRISMATIC_GEM: {
    name: '棱彩宝石', icon: '💎', rarity: 'ancient',
    desc: '在每回合开始时获得1点能量。卡牌奖励现在会包含其他颜色的卡牌。',
    modifyMaxEnergy: () => 1,
    onObtain: (R) => { R.relicData.prismatic = true; },
  },

  /* =====================================================================
     佩尔（Pael）—— 第二幕
     ===================================================================== */
  PAELS_FLESH: {
    name: '佩尔之肉', icon: '🫀', rarity: 'ancient',
    desc: '从你的第3回合开始，在回合开始时额外获得1点能量。',
    modifyMaxEnergy: (C) => (C.turn >= 3 ? 1 : 0),
  },
  PAELS_HORN: {
    name: '佩尔之角', icon: '🐏', rarity: 'ancient',
    desc: '拾起时，将2张[gold]放松[/gold]加入你的[gold]牌组[/gold]。',
    onObtain: (R) => { R.addCard('RELAX'); R.addCard('RELAX'); },
  },
  PAELS_TEARS: {
    name: '佩尔之泪', icon: '💧', rarity: 'ancient',
    desc: '如果你在拥有未花费的能量时结束回合，则下个回合额外获得2点能量。',
    onTurnEnd: (C) => { C.run.relicData.paelsTears = C.energy > 0; },
    onTurnStart: (C, turn) => {
      if (C.run.relicData.paelsTears && turn > 1) C.gainEnergy(2);
      if (turn > 1) C.run.relicData.paelsTears = false;
    },
  },
  PAELS_WING: {
    name: '佩尔之翼', icon: '🪽', rarity: 'ancient',
    desc: '你可以将卡牌奖励献祭给佩尔。每献祭2次，获得一件[gold]遗物[/gold]。',
    onObtain: (R) => { R.relicData.paelsWing = R.relicData.paelsWing || 0; },
  },
  PAELS_EYE: {
    name: '佩尔之眼', icon: '👁️', rarity: 'ancient',
    desc: '你在每场战斗中第一次没有打出任何牌就结束回合时，[gold]消耗[/gold]所有手牌并进行一个额外回合。',
    onTurnEnd: async (C) => {
      if (C.run.relicData.paelsEyeUsed || C.cardsPlayedThisTurn > 0) return;
      C.run.relicData.paelsEyeUsed = true;
      for (const card of [...C.hand]) await C.exhaustCard(card);
      C.logEvent('power', '「佩尔之眼」：进行一个额外回合');
      await C.startPlayerTurn(false);
    },
    onCombatStart: (C) => { C.run.relicData.paelsEyeUsed = false; },
  },
  PAELS_BLOOD: {
    name: '佩尔之血', icon: '🩸', rarity: 'ancient',
    desc: '在你的回合开始时，额外抽1张牌。',
    modifyDraw: (C, n) => n + 1,
  },
  PAELS_CLAW: {
    name: '佩尔之爪', icon: '🐾', rarity: 'ancient',
    desc: '拾起时，为所有的「[gold]防御[/gold]」[gold]附魔[/gold]：[purple]黏糊[/purple]。',
    onObtain: (R) => {
      for (const e of R.deck) {
        if (CARDS[e.id]?.tags?.includes('defend')) { e.enchant = 'GOOPY'; e.goopy = 0; }
      }
    },
  },
  PAELS_TOOTH: {
    name: '佩尔之牙', icon: '🦷', rarity: 'ancient',
    desc: '拾起时，从[gold]牌组[/gold]中移除5张牌。每场战斗结束时，将其中随机1张牌[gold]升级[/gold]后返还。',
    onObtain: (R) => R.queueRelicJob({ k: 'tooth', n: 5 }),
    onCombatEnd: (C) => {
      const store = C.run.relicData.toothStore || [];
      if (!store.length) return;
      const i = C.run.rng.int(store.length);
      const e = store.splice(i, 1)[0];
      C.run.relicData.toothStore = store;
      C.run.deck.push({ id: e.id, upgraded: true, uid: 'd' + Math.random().toString(36).slice(2, 9) });
      C.logEvent('system', `「佩尔之牙」返还了升级过的 ${CARDS[e.id]?.name || e.id}`);
    },
  },
  PAELS_LEGION: {
    name: '佩尔的士兵', icon: '🛡️', rarity: 'ancient',
    desc: '将你从一张卡牌内获得的[gold]格挡[/gold]翻倍，然后休眠2个回合。',
  },
  PAELS_GROWTH: {
    name: '佩尔的增生组织', icon: '🫧', rarity: 'ancient',
    desc: '拾起时，从[gold]牌组[/gold]中选择一张牌，为其[gold]附魔[/gold]：[purple]克隆[/purple]。',
    onObtain: (R) => R.queueRelicJob({ k: 'enchant', enchant: 'CLONE', n: 1 }),
  },

  /* =====================================================================
     特兹卡塔拉（Tezcatara）—— 第二幕
     ===================================================================== */
  VERY_HOT_COCOA: {
    name: '烫嘴可可', icon: '☕', rarity: 'ancient',
    desc: '在每场战斗的第一回合额外获得4点能量。',
    onTurnStart: (C, turn) => { if (turn === 1) C.gainEnergy(4); },
  },
  YUMMY_COOKIE: {
    name: '美味饼干', icon: '🍪', rarity: 'ancient',
    desc: '拾起时，[gold]升级[/gold]4张牌。',
    onObtain: (R) => R.queueRelicJob({ k: 'upgrade', n: 4 }),
  },
  BIIIG_HUG: {
    name: '大～抱抱', icon: '🤗', rarity: 'ancient',
    desc: '拾起时，从你的[gold]牌组[/gold]中移除4张牌。每当你的[gold]抽牌堆[/gold]打乱洗牌时，将一张[gold]煤灰[/gold]加入抽牌堆。',
    onObtain: (R) => R.queueRelicJob({ k: 'remove', n: 4 }),
    onShuffle: (C) => { C.drawPile.push(C.makeCard('SOOT')); },
  },
  STORYBOOK: {
    name: '故事书', icon: '📕', rarity: 'ancient',
    desc: '拾起时，将1张[gold]至亮之焰[/gold]加入你的[gold]牌组[/gold]。',
    onObtain: (R) => R.addCard('BRIGHTEST_FLAME'),
  },
  TOASTY_MITTENS: {
    name: '烘焙手套', icon: '🧤', rarity: 'ancient',
    desc: '在你的回合开始时，[gold]消耗[/gold]你[gold]抽牌堆[/gold]顶部的牌并获得1点[gold]力量[/gold]。',
    onTurnStart: async (C) => {
      if (C.drawPile.length) {
        const card = C.drawPile.pop();
        await C.exhaustCard(card);
      }
      await C.addPower('strength', 1);
    },
  },
  GOLDEN_COMPASS: {
    name: '黄金罗盘', icon: '🧭', rarity: 'ancient',
    desc: '拾起时，将第2[gold]阶段[/gold]的地图替换为一条特殊的直道。',
    onObtain: (R) => { R.relicData.goldenCompass = true; },
  },
  PUMPKIN_CANDLE: {
    name: '南瓜蜡烛', icon: '🎃', rarity: 'ancient',
    desc: '在每回合开始时获得1点能量。这件遗物将在5场战斗后熄灭（可在休息处重新点燃）。',
    onObtain: (R) => { R.relicData.pumpkinCandle = 5; },
    modifyMaxEnergy: (C) => ((C.run.relicData.pumpkinCandle || 0) > 0 ? 1 : 0),
    onCombatEnd: (C) => {
      const rd = C.run.relicData;
      if ((rd.pumpkinCandle || 0) > 0) rd.pumpkinCandle -= 1;
    },
  },
  TOY_BOX: {
    name: '玩具盒', icon: '🧸', rarity: 'ancient',
    desc: '拾起时，获得5件[gold]蜡制遗物[/gold]。每经过3场战斗，你最左侧的[gold]蜡制遗物[/gold]将会融化。',
    onObtain: (R) => {
      const wax = [];
      for (let i = 0; i < 5; i++) {
        const id = R.rollRelic();
        if (id) { R.addRelic(id); wax.push(id); }
      }
      R.relicData.toyBoxWax = wax;
      R.relicData.toyBoxCount = 0;
    },
    onCombatWon: (R) => {
      const wax = R.relicData.toyBoxWax || [];
      if (!wax.length) return;
      R.relicData.toyBoxCount = (R.relicData.toyBoxCount || 0) + 1;
      if (R.relicData.toyBoxCount % 3) return;
      const melt = wax.shift();
      R.removeRelic(melt);
      R.relicData.toyBoxWax = wax;
    },
  },
  SEAL_OF_GOLD: {
    name: '黄金印', icon: '🪙', rarity: 'ancient',
    desc: '在你的回合开始时，花费3[gold]金币[/gold]来获得1点能量。',
    onTurnStart: (C) => {
      if (C.run.gold < 3) return;
      C.run.gold -= 3;
      C.gainEnergy(1);
    },
  },
  NUTRITIOUS_SOUP: {
    name: '营养汤', icon: '🍲', rarity: 'ancient',
    desc: '拾起时，为你[gold]牌组[/gold]中的所有「[gold]打击[/gold]」[gold]附魔[/gold]：[purple]特兹卡塔拉的余烬[/purple]。',
    onObtain: (R) => {
      for (const e of R.deck) {
        if (CARDS[e.id]?.rarity === 'basic' && CARDS[e.id]?.tags?.includes('strike')) e.enchant = 'TEZCATARAS_EMBER';
      }
    },
  },

  /* =====================================================================
     诺奴佩普（Nonupeipe）—— 第三幕
     ===================================================================== */
  BLESSED_ANTLER: {
    name: '赐福鹿角', icon: '🦌', rarity: 'ancient',
    desc: '在每回合开始时获得1点能量。在战斗开始时，将3张[gold]晕眩[/gold]放入你的[gold]抽牌堆[/gold]。',
    modifyMaxEnergy: () => 1,
    onCombatStart: (C) => {
      for (let i = 0; i < 3; i++) {
        const idx = C.rng.int(C.drawPile.length + 1);
        C.drawPile.splice(idx, 0, C.makeCard('DAZED'));
      }
    },
  },
  BRILLIANT_SCARF: {
    name: '艳丽围巾', icon: '🧣', rarity: 'ancient',
    desc: '你每回合打出的第5张牌可以被免费打出。',
    modifyCost: (C, card, c) => (C.cardsPlayedThisTurn === 4 ? 0 : c),
  },
  DELICATE_FROND: {
    name: '娇嫩蕨草', icon: '🌿', rarity: 'ancient',
    desc: '在每场战斗开始时，用随机药水将你的空药水栏位填满。',
    onCombatStart: (C) => {
      let guard = 0;
      while (C.run.potions.includes(null) && guard++ < 8) {
        const id = C.run.rollPotion();
        if (!id || !C.run.addPotion(id)) break;
      }
    },
  },
  DIAMOND_DIADEM: {
    name: '钻石头冠', icon: '👑', rarity: 'ancient',
    desc: '在第一回合获得20点[gold]格挡[/gold]与1层[gold]残影[/gold]。',
    onTurnStart: async (C, turn) => {
      if (turn !== 1) return;
      await C.block(20, { raw: true, silent: true });
      await C.addPower('blur', 1);
    },
  },
  FUR_COAT: {
    name: '皮草大衣', icon: '🧥', rarity: 'ancient',
    desc: '拾起时，随机标记8处战斗。这些战斗中的敌人将只有1点生命。',
    onObtain: (R) => {
      const pts = (R.map?.nodes || []).filter((n) => n.type === 'monster' || n.type === 'elite');
      R.relicData.furCoatMarks = R.rng.pickMany(pts, 8).map((n) => `${n.row},${n.col}`);
      R.relicData.furCoatAct = R.act;
    },
    onCombatStart: (C) => {
      const rd = C.run.relicData;
      const node = C.run.curNode;
      if (!node || rd.furCoatAct !== C.run.act) return;
      if (!(rd.furCoatMarks || []).includes(`${node.row},${node.col}`)) return;
      for (const e of C.enemies) {
        e.hp = 1;
        e.maxHp = Math.max(e.maxHp, 1);
      }
      C.logEvent('system', '「皮草大衣」：这些敌人只有 1 点生命');
    },
  },
  GLITTER: {
    name: '亮片', icon: '✨', rarity: 'ancient',
    desc: '为之后的所有卡牌奖励[gold]附魔[/gold]：[purple]华彩[/purple]。',
    onObtain: (R) => { R.relicData.glitter = true; },
  },
  JEWELRY_BOX: {
    name: '珠宝盒', icon: '💍', rarity: 'ancient',
    desc: '拾起时，将1张[gold]神化[/gold]加入你的[gold]牌组[/gold]。',
    onObtain: (R) => R.addCard('APOTHEOSIS'),
  },
  LOOMING_FRUIT: {
    name: '布质果实', icon: '🍎', rarity: 'ancient',
    desc: '拾起时，将你的最大生命值提升31点。',
    onObtain: (R) => R.gainMaxHp(31),
  },
  SIGNET_RING: {
    name: '图章戒指', icon: '💠', rarity: 'ancient',
    desc: '拾起时，获得888[gold]金币[/gold]。',
    onObtain: (R) => R.gainGold(888),
  },
  BEAUTIFUL_BRACELET: {
    name: '华美手镯', icon: '📿', rarity: 'ancient',
    desc: '拾起时，从你的[gold]牌组[/gold]中随机选择4张牌，[gold]附魔[/gold]：[purple]迅速[/purple]2。',
    onObtain: (R) => {
      for (const e of R.rng.pickMany(R.deck.filter((d) => CARDS[d.id]?.type !== 'power'), 4)) {
        e.enchant = 'SWIFT';
      }
    },
  },

  /* =====================================================================
     坦克斯（Tanx）—— 第三幕
     ===================================================================== */
  CLAWS: {
    name: '利爪', icon: '🐾', rarity: 'ancient',
    desc: '拾起时，将至多6张牌[gold]变化[/gold]为[gold]撕咬[/gold]（保留升级与附魔）。',
    onObtain: (R) => {
      R.queueRelicJob({ k: 'maul', n: 6 });
    },
  },
  CROSSBOW: {
    name: '十字弓', icon: '🏹', rarity: 'ancient',
    desc: '在你的回合开始时，将一张随机[gold]攻击牌[/gold]加入你的[gold]手牌[/gold]。这张牌在本回合耗能为0。',
    onTurnStart: (C) => {
      const id = C.run.randomCard({ type: 'attack' });
      if (!id) return;
      const card = C.makeCard(id);
      card.freeThisTurn = true;
      C.addCardToHand(card);
    },
  },
  IRON_CLUB: {
    name: '铁棒', icon: '🏏', rarity: 'ancient',
    desc: '你每打出4张牌，就抽1张牌。',
    onCardPlayed: async (C, card) => {
      const rd = C.run.relicData;
      rd.ironClub = (rd.ironClub || 0) + 1;
      if (rd.ironClub >= 4) { rd.ironClub = 0; await C.draw(1); }
    },
    onCombatStart: (C) => { C.run.relicData.ironClub = 0; },
  },
  MEAT_CLEAVER: {
    name: '切肉刀', icon: '🔪', rarity: 'ancient',
    desc: '你可以在休息处进行[gold]烹饪[/gold]：移除2张牌，回复8点生命。',
    restOption: (R) => (R.deck.filter((d) => CARDS[d.id] && !CARDS[d.id].eternal).length >= 2
      ? { label: '烹饪 · 移除2张牌并回复8点生命', k: 'cook' } : null),
  },
  SAI: {
    name: '钗', icon: '🗡️', rarity: 'ancient',
    desc: '在你的回合开始时，获得7点[gold]格挡[/gold]。',
    onTurnStart: async (C) => { await C.block(7, { raw: true, silent: true }); },
  },
  SPIKED_GAUNTLETS: {
    name: '带刺手甲', icon: '🥊', rarity: 'ancient',
    desc: '在每回合开始时获得1点能量。能力牌的耗能增加1。',
    modifyMaxEnergy: () => 1,
    modifyCost: (C, card, c) => (card.type === 'power' ? c + 1 : c),
  },
  TANXS_WHISTLE: {
    name: '坦克斯的哨子', icon: '📯', rarity: 'ancient',
    desc: '拾起时，将1张[gold]吹哨[/gold]加入你的[gold]牌组[/gold]。',
    onObtain: (R) => R.addCard('WHISTLE'),
  },
  THROWING_AXE: {
    name: '投斧', icon: '🪓', rarity: 'ancient',
    desc: '你在每场战斗中打出的第一张牌会多打出一次。',
    onCombatStart: (C) => { C.run.relicData.throwingAxeUsed = false; },
  },
  WAR_HAMMER: {
    name: '战锤', icon: '🔨', rarity: 'ancient',
    desc: '每当你击败一名[gold]精英[/gold]敌人时，随机[gold]升级[/gold]4张牌。',
    onEliteWin: (R) => {
      for (const e of R.rng.pickMany(upgradable(R), 4)) e.upgraded = true;
    },
  },
  TRI_BOOMERANG: {
    name: '三刃回旋镖', icon: '🪃', rarity: 'ancient',
    desc: '从你的[gold]牌组[/gold]中选择3张攻击牌，为这些牌[gold]附魔[/gold]：[purple]本能[/purple]。',
    onObtain: (R) => R.queueRelicJob({ k: 'enchant', enchant: 'INSTINCT', n: 3, type: 'attack' }),
  },

  /* =====================================================================
     瓦库（Vakuu）—— 第三幕
     ===================================================================== */
  BLOOD_SOAKED_ROSE: {
    name: '血染玫瑰', icon: '🌹', rarity: 'ancient',
    desc: '拾起时，将1张[red]执迷[/red]加入你的[gold]牌组[/gold]。在回合开始时获得1点能量。',
    onObtain: (R) => R.addCard('ENTHRALLED'),
    modifyMaxEnergy: () => 1,
  },
  WHISPERING_EARRING: {
    name: '低语耳环', icon: '👂', rarity: 'ancient',
    desc: '在每个回合开始时获得1点能量。[red]瓦库将在每场战斗的第一回合接管你。[/red]',
    modifyMaxEnergy: () => 1,
    afterDraw: async (C, turn) => {
      if (turn !== 1) return;
      for (let i = 0; i < 13; i++) {
        const card = C.hand.find((c) => C.canPlay(c));
        if (!card || C.finished) break;
        await C.autoPlay(card);
      }
    },
  },
  FIDDLE: {
    name: '小提琴', icon: '🎻', rarity: 'ancient',
    desc: '在每个回合开始时，额外抽2张牌。你在回合进行中不再能抽任何牌。',
    modifyDraw: (C, n) => n + 2,
  },
  PRESERVED_FOG: {
    name: '腌制活雾', icon: '🌫️', rarity: 'ancient',
    desc: '拾起时，从你的[gold]牌组[/gold]中移除3张牌。将一张[red]愚行[/red]加入你的[gold]牌组[/gold]。',
    onObtain: (R) => { R.addCard('FOLLY'); R.queueRelicJob({ k: 'remove', n: 3 }); },
  },
  SERE_TALON: {
    name: '原初之爪', icon: '🦅', rarity: 'ancient',
    desc: '拾起时，失去9点最大生命值，将3张[purple]许愿[/purple]加入你的[gold]牌组[/gold]。',
    onObtain: (R) => {
      R.gainMaxHp(-9);
      for (let i = 0; i < 3; i++) R.addCard('WISH');
    },
  },
  DISTINGUISHED_CAPE: {
    name: '卓越斗篷', icon: '🦸', rarity: 'ancient',
    desc: '拾起时，将2张随机[red]诅咒[/red]和3张[gold]灵体[/gold]加入你的[gold]牌组[/gold]。',
    onObtain: (R) => {
      const used = [];
      for (let i = 0; i < 2; i++) {
        const c = randCurse(R, used);
        if (!c) break;
        used.push(c);
        R.addCard(c);
      }
      for (let i = 0; i < 3; i++) R.addCard('APPARITION');
    },
  },
  CHOICES_PARADOX: {
    name: '选择悖论', icon: '🎲', rarity: 'ancient',
    desc: '在每场战斗开始时，从5张随机牌中选择1张放入你的[gold]手牌[/gold]。被选中的牌获得[gold]保留[/gold]。',
    beforeDraw: async (C, turn) => {
      if (turn !== 1) return;
      const pool = [];
      const seen = new Set();
      let guard = 0;
      while (pool.length < 5 && guard++ < 60) {
        const id = C.run.randomCard();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        pool.push(C.makeCard(id));
      }
      if (!pool.length) return;
      const chosen = C.requestSelection
        ? await C.requestSelection({ pool, count: 1, prompt: '「选择悖论」：选择一张牌加入手牌' })
        : [pool[0]];
      const card = chosen[0] || pool[0];
      card.retain = true;
      C.addCardToHand(card);
    },
  },
  MUSIC_BOX: {
    name: '音乐盒', icon: '🎵', rarity: 'ancient',
    desc: '将你每回合打出的第一张攻击牌的一张[gold]虚无[/gold]复制品加入你的手牌。',
    onCardPlayed: async (C, card) => {
      const rd = C.run.relicData;
      if (card.type !== 'attack' || rd.musicBoxUsed) return;
      rd.musicBoxUsed = true;
      if (C.hand.length >= 10) return;
      const copy = C.makeCard(card.id, card.upgraded);
      copy.ethereal = true;
      C.addCardToHand(copy);
    },
    onTurnStart: (C) => { C.run.relicData.musicBoxUsed = false; },
  },
  LORDS_PARASOL: {
    name: '领主阳伞', icon: '☂️', rarity: 'ancient',
    desc: '当你遇见[gold]商人[/gold]时，立刻免费获得他所出售的所有物品，并免费移除一张牌。',
    onObtain: (R) => { R.relicData.lordsParasol = true; },
  },
  JEWELED_MASK: {
    name: '宝石面具', icon: '🎭', rarity: 'ancient',
    desc: '在每场战斗开始时，将一张随机能力牌从你的[gold]抽牌堆[/gold]放入你的[gold]手牌[/gold]，这张牌可以免费打出。',
    beforeDraw: (C, turn) => {
      if (turn !== 1) return;
      const powers = C.drawPile.filter((c) => c.type === 'power');
      if (!powers.length) {
        const id = C.run.randomCard({ type: 'power' });
        if (!id) return;
        const card = C.makeCard(id);
        card.freeThisTurn = true;
        card.freeCombat = true;
        C.addCardToHand(card);
        return;
      }
      const card = powers.find((c) => !c.innate) || powers[0];
      const i = C.drawPile.indexOf(card);
      if (i >= 0) C.drawPile.splice(i, 1);
      card.freeThisTurn = true;
      card.freeCombat = true;
      C.addCardToHand(card);
    },
  },

  /* =====================================================================
     达弗（Darv）—— 共享池
     ===================================================================== */
  ASTROLABE: {
    name: '星盘', icon: '🔭', rarity: 'ancient',
    desc: '拾起时，选择3张牌进行[gold]变化[/gold]，然后将这些牌[gold]升级[/gold]。',
    onObtain: (R) => R.queueRelicJob({ k: 'transform', n: 3, upgrade: true }),
  },
  BLACK_STAR: {
    name: '黑星', icon: '⭐', rarity: 'ancient',
    desc: '[gold]精英[/gold]敌人在被打败时多掉落一件遗物。',
    onEliteWin: (R) => { R.pendingRelicRewards = (R.pendingRelicRewards || 0) + 1; },
  },
  CALLING_BELL: {
    name: '召唤铃铛', icon: '🔔', rarity: 'ancient',
    desc: '拾起时，获得一个独特的[red]诅咒[/red]和3件[gold]遗物[/gold]（普通/罕见/稀有各一）。',
    onObtain: (R) => {
      R.addCard('CURSE_OF_THE_BELL');
      R.queueRelicJob({ k: 'relicTiers', tiers: ['common', 'uncommon', 'rare'] });
    },
  },
  EMPTY_CAGE: {
    name: '空鸟笼', icon: '🐦', rarity: 'ancient',
    desc: '拾起时，选择移除[gold]牌组[/gold]中的2张牌。',
    onObtain: (R) => R.queueRelicJob({ k: 'remove', n: 2 }),
  },
  PANDORAS_BOX: {
    name: '潘多拉魔盒', icon: '📦', rarity: 'ancient',
    desc: '[gold]变化[/gold]所有「[gold]打击[/gold]」和「[gold]防御[/gold]」。',
    onObtain: (R) => {
      for (const e of R.deck) {
        const d = CARDS[e.id];
        if (d?.rarity === 'basic' && (d.tags?.includes('strike') || d.tags?.includes('defend'))) {
          R.transformEntry(e, R.randomCard({ rarity: ['common', 'uncommon', 'rare'] }));
        }
      }
    },
  },
  DUSTY_TOME: {
    name: '尘封魔典', icon: '📖', rarity: 'ancient',
    desc: '拾起时，获得一张[gold]先古牌[/gold]（已升级）。',
    onObtain: (R) => { R.queueRelicJob({ k: 'dustyTome' }); },
  },
};

/** 升级版初始遗物（欧洛巴斯之触 / 先古版）*/
export const UPGRADED_STARTERS = {
  BLACK_BLOOD: {
    name: '黑暗之血', icon: '🖤', rarity: 'starter',
    desc: '战斗结束时，回复12点生命。',
    onCombatEnd: (C) => { if (C.won) C.healPlayer(12); },
  },
  RING_OF_THE_DRAKE: {
    name: '幼龙之戒', icon: '🐲', rarity: 'starter',
    desc: '战斗的前3个回合，额外抽2张牌。',
    modifyDraw: (C, n) => (C.turn <= 3 ? n + 2 : n),
  },
  DIVINE_DESTINY: {
    name: '神圣天命', icon: '🌟', rarity: 'starter',
    desc: '战斗的第一回合，获得7点星愿。',
    onTurnStart: async (C, turn) => { if (turn === 1) await C.gainStars(7); },
  },
  PHYLACTERY_UNBOUND: {
    name: '破封命匣', icon: '🪬', rarity: 'starter',
    desc: '战斗开始时召唤5，之后每回合开始时召唤2。',
    onCombatStart: async (C) => { if (C.necro) await C.necro.summon(5); },
    onTurnStart: async (C) => { if (C.necro) await C.necro.summon(2); },
  },
  INFUSED_CORE: {
    name: '灌注核心', icon: '⚡', rarity: 'starter',
    desc: '战斗的第一回合，生成3个闪电充能球。闪电球的被动数值 +1。',
    onTurnStart: async (C, turn) => {
      if (turn !== 1) return;
      for (let i = 0; i < 3; i++) await C.channelOrb('LIGHTNING');
    },
  },
};

/** 涅奥的候选池（对照 Neow.cs 的 CurseTypes / PositiveTypes / ExtraPositiveTypes） */
export const NEOW_POOLS = {
  curse: ['CURSED_PEARL', 'DOWSING_ROD', 'HEFTY_TABLET', 'LARGE_CAPSULE', 'LEAFY_POULTICE',
    'NEOWS_BONES', 'NEOWS_SACRIFICE', 'PRECARIOUS_SHEARS', 'SILKEN_TRESS', 'SILVER_CRUCIBLE'],
  positive: ['ARCANE_SCROLL', 'BOOMING_CONCH', 'FISHING_ROD', 'GOLDEN_PEARL', 'KALEIDOSCOPE',
    'LEAD_PAPERWEIGHT', 'LOST_COFFER', 'NEOWS_TORMENT', 'NEW_LEAF', 'PHIAL_HOLSTER',
    'PRECISE_SCISSORS', 'SCROLL_BOXES', 'WINGED_BOOTS'],
  extra: ['LAVA_ROCK', 'NEOWS_TALISMAN', 'NUTRITIOUS_OYSTER', 'POMANDER', 'SMALL_CAPSULE', 'STONE_HUMIDIFIER'],
  /** 与诅咒互斥的正面遗物（Neow.RemoveMutuallyExclusivePositives） */
  exclusive: {
    CURSED_PEARL: ['GOLDEN_PEARL'],
    HEFTY_TABLET: ['ARCANE_SCROLL'],
    LEAFY_POULTICE: ['NEW_LEAF'],
    PRECARIOUS_SHEARS: ['PRECISE_SCISSORS'],
    NEOWS_SACRIFICE: ['PHIAL_HOLSTER', 'LOST_COFFER'],
  },
};
