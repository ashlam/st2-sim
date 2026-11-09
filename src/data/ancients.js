/**
 * 先古之民（Ancient）幕首事件。
 * 选项抽取规则逐条对照 sts2-sim 的 Models/Events/Ancients/*.cs，
 * 名称、称号与首访台词取自官方 zhs 本地化（ancients.json 的 firstVisitEver）。
 *
 * 幕与先古的对应（ActDefinition.AncientPool + RunState.GenerateAllActRooms）：
 *   第 1 幕  → 涅奥
 *   第 2 幕  → 欧洛巴斯 / 佩尔 / 特兹卡塔拉（+ 共享池里的达弗）
 *   第 3 幕  → 诺奴佩普 / 坦克斯 / 瓦库（+ 共享池里的达弗）
 * 共享池（只有达弗）在开局时随机分配到第 2、3 幕。
 */
import { CARDS } from './cards.js';
import { NEOW_POOLS } from './relics-ancient.js';
import { Rng } from '../engine/rng.js';

const CHAR_IDS = ['IRONCLAD', 'SILENT', 'DEFECT', 'REGENT', 'NECROBINDER'];
const TRANSCENDENCE = { BASH: 1, NEUTRALIZE: 1, UNLEASH: 1, FALLING_STAR: 1, DUALCAST: 1 };

const hasBasicStrike = (R) => R.deck.some((d) => CARDS[d.id]?.rarity === 'basic' && CARDS[d.id]?.tags?.includes('strike'));
const hasBlockCard = (d) => {
  const def = CARDS[d.id];
  return def && def.type === 'skill' && /格挡/.test(def.text || '');
};

export const ANCIENTS = {
  /* ================= 涅奥 ================= */
  NEOW: {
    id: 'NEOW', title: '涅奥', epithet: '复生之母（被放逐）', icon: '🌊',
    text: '[sine]我又... 重铸了你....\n...上... ..去吧.....[/sine]',
    options: (R) => {
      const curse = R.rng.pick(NEOW_POOLS.curse);
      const banned = NEOW_POOLS.exclusive[curse] || [];
      const positives = NEOW_POOLS.positive.filter((id) => !banned.includes(id));
      if (curse !== 'LARGE_CAPSULE') positives.push(R.rng.chance(0.5) ? 'LAVA_ROCK' : 'SMALL_CAPSULE');
      positives.push(R.rng.chance(0.5) ? 'NUTRITIOUS_OYSTER' : 'STONE_HUMIDIFIER');
      positives.push(R.rng.chance(0.5) ? 'NEOWS_TALISMAN' : 'POMANDER');
      return [...R.rng.pickMany(positives, 2), curse].map((relic) => ({ relic }));
    },
  },

  /* ================= 欧洛巴斯 ================= */
  OROBAS: {
    id: 'OROBAS', title: '欧洛巴斯', epithet: '活体虹光', icon: '🌈',
    text: '傀儡傀儡！！一路来到这里？！收下这些，拿去拿去！',
    options: (R) => {
      const others = CHAR_IDS.filter((c) => c !== R.charId);
      const seaChar = R.rng.pick(others);
      const third = R.rng.chance(1 / 3) ? 'PRISMATIC_GEM' : 'SEA_GLASS';
      const first = R.rng.pick(['ELECTRIC_SHRYMP', 'GLASS_EYE', third]);
      const second = R.rng.pick(['ALCHEMICAL_COFFER', 'DRIFTWOOD', 'RADIANT_PEARL', 'SAND_CASTLE']);
      const pool3 = ['TOUCH_OF_OROBAS'];
      if (R.deck.some((d) => TRANSCENDENCE[d.id])) pool3.push('ARCHAIC_TOOTH');
      const out = [
        first === 'SEA_GLASS' ? { relic: 'SEA_GLASS', charId: seaChar } : { relic: first },
        { relic: second },
        { relic: R.rng.pick(pool3) },
      ];
      return out;
    },
  },

  /* ================= 佩尔 ================= */
  PAEL: {
    id: 'PAEL', title: '佩尔', epithet: '融化巨龙', icon: '🐉',
    text: '[thinky_dots]有傀儡来了？\n能帮我去看看父亲的状况么？我太累了……[/thinky_dots]',
    options: (R) => {
      const first = R.rng.pick(['PAELS_FLESH', 'PAELS_HORN', 'PAELS_TEARS']);
      const secondPool = ['PAELS_WING'];
      if (R.deck.filter(hasBlockCard).length >= 3) secondPool.push('PAELS_CLAW');
      if (R.deck.filter((d) => CARDS[d.id] && !CARDS[d.id].eternal).length >= 5) secondPool.push('PAELS_TOOTH');
      // 对照源码：先把已有候选复制一遍再加增生组织（翼/爪/牙因此权重翻倍）
      const secondCandidates = [...secondPool, ...secondPool, 'PAELS_GROWTH'];
      const second = R.rng.pick(secondCandidates);
      const third = R.rng.pick(['PAELS_EYE', 'PAELS_BLOOD', 'PAELS_LEGION']);
      return [{ relic: first }, { relic: second }, { relic: third }];
    },
  },

  /* ================= 特兹卡塔拉 ================= */
  TEZCATARA: {
    id: 'TEZCATARA', title: '特兹卡塔拉', epithet: '饲火者', icon: '🔥',
    text: '哎呀，有客人！快进来吧，亲爱的！\n特兹卡塔拉能为你做点什么吶？',
    options: (R) => {
      const firstPool = ['VERY_HOT_COCOA', 'YUMMY_COOKIE'];
      if (hasBasicStrike(R)) firstPool.push('NUTRITIOUS_SOUP');
      return [
        { relic: R.rng.pick(firstPool) },
        { relic: R.rng.pick(['BIIIG_HUG', 'STORYBOOK', 'TOASTY_MITTENS']) },
        { relic: R.rng.pick(['GOLDEN_COMPASS', 'PUMPKIN_CANDLE', 'TOY_BOX', 'SEAL_OF_GOLD']) },
      ];
    },
  },

  /* ================= 诺奴佩普 ================= */
  NONUPEIPE: {
    id: 'NONUPEIPE', title: '诺奴佩普', epithet: '机缘的化身', icon: '🦌',
    text: '我有几千年都没有接待过访客了！\n哎呀，你的穿搭看起来有些乏味呢，来，我们给你挑些漂亮的穿吧。',
    options: (R) => {
      const base = ['BLESSED_ANTLER', 'BRILLIANT_SCARF', 'DELICATE_FROND', 'DIAMOND_DIADEM',
        'FUR_COAT', 'GLITTER', 'JEWELRY_BOX', 'LOOMING_FRUIT', 'SIGNET_RING'];
      if (R.deck.filter((d) => CARDS[d.id]?.type !== 'power').length >= 4) base.push('BEAUTIFUL_BRACELET');
      return R.rng.pickMany(base, 3).map((relic) => ({ relic }));
    },
  },

  /* ================= 坦克斯 ================= */
  TANX: {
    id: 'TANX', title: '坦克斯', epithet: '嵌合兽之王', icon: '⚔️',
    text: '[b]太弱小了！但是你很有潜力！[/b]\n[b]用这把武器！！[/b]',
    options: (R) => {
      const base = ['CLAWS', 'CROSSBOW', 'IRON_CLUB', 'MEAT_CLEAVER', 'SAI',
        'SPIKED_GAUNTLETS', 'TANXS_WHISTLE', 'THROWING_AXE', 'WAR_HAMMER'];
      if (R.deck.filter((d) => CARDS[d.id]?.type === 'attack').length >= 3) base.push('TRI_BOOMERANG');
      return R.rng.pickMany(base, 3).map((relic) => ({ relic }));
    },
  },

  /* ================= 瓦库 ================= */
  VAKUU: {
    id: 'VAKUU', title: '瓦库', epithet: '第一个恶魔', icon: '😈',
    text: '把你自己交给我，你就能变得和我一样万众畏惧。',
    options: (R) => [
      { relic: R.rng.pick(['BLOOD_SOAKED_ROSE', 'WHISPERING_EARRING', 'FIDDLE']) },
      { relic: R.rng.pick(['PRESERVED_FOG', 'SERE_TALON', 'DISTINGUISHED_CAPE']) },
      { relic: R.rng.pick(['CHOICES_PARADOX', 'MUSIC_BOX', 'LORDS_PARASOL', 'JEWELED_MASK']) },
    ],
  },

  /* ================= 达弗（共享池） ================= */
  DARV: {
    id: 'DARV', title: '达弗', epithet: '囤积者', icon: '💰',
    text: '……我把那东西放哪儿了……喔！\n来看我的收藏的吗！？那边那堆里随便挑一个吧，得好好用上哦！',
    options: (R) => {
      const act = R.act;
      const sets = [
        { relic: 'ASTROLABE', ok: () => true },
        { relic: 'BLACK_STAR', ok: () => true },
        { relic: 'CALLING_BELL', ok: () => true },
        { relic: 'EMPTY_CAGE', ok: () => true },
        { relic: 'PANDORAS_BOX', ok: () => true },
        { relic: 'RUNIC_PYRAMID', ok: () => true },
        { relic: 'SNECKO_EYE', ok: () => true },
        { relic: 'ECTOPLASM', ok: () => act === 2 },
        { relic: 'SOZU', ok: () => act === 2 },
        { relic: 'PHILOSOPHERS_STONE', ok: () => act >= 2 },
        { relic: 'VELVET_CHOKER', ok: () => act >= 2 },
      ];
      const pool = R.rng.shuffle(sets.filter((s) => s.ok()).map((s) => s.relic));
      if (!R.rng.chance(0.5)) return pool.slice(0, 3).map((relic) => ({ relic }));
      return [...pool.slice(0, 2).map((relic) => ({ relic })), { relic: 'DUSTY_TOME' }];
    },
  },
};

/** 各幕的先古池（含共享池分配结果） */
export function rollAncients(seed, act1) {
  const shared = ['DARV'];
  const shuffleRng = new Rng(seed + ':ancients:shuffle');
  let remaining = shuffleRng.shuffle(shared);
  const subsets = [[], []];
  for (let i = 1; i <= 2; i++) {
    const rng = new Rng(seed + `:ancients:act${i}:count`);
    const count = rng.int(remaining.length + 1);
    subsets[i - 1] = remaining.slice(0, count);
    remaining = remaining.filter((x) => !subsets[i - 1].includes(x));
  }
  const act2Pool = ['OROBAS', 'PAEL', 'TEZCATARA', ...subsets[0]];
  const act3Pool = ['NONUPEIPE', 'TANX', 'VAKUU', ...subsets[1]];
  const pick = (pool, key) => new Rng(seed + `:ancients:${key}`).pick(pool);
  return {
    1: pick(['NEOW'], 'act1'),
    2: pick(act2Pool, 'act2'),
    3: pick(act3Pool, 'act3'),
  };
}

export function ancientDef(id) { return ANCIENTS[id]; }
