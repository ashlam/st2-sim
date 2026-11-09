/**
 * 跨幕共享事件池（SharedEventPool，18 个）。
 * 文本对照官方 zhs 本地化 events.json，效果与数值对照 sts2-sim 的 Models/Events/*.cs。
 * 出现条件（IsAllowed）按各事件源码逐条实现，见每个事件的 allowed。
 */
import { RELICS, POTIONS } from './items.js';
import { CARDS } from './cards.js';

/** 玩偶室的三尊玩偶遗物 */
const DOLLS = [
  { id: 'DAUGHTER_OF_THE_WIND', name: '风的女儿' },
  { id: 'MR_STRUGGLES', name: '抱抱先生' },
  { id: 'BING_BONG', name: '宾邦' },
];

export const SHARED_EVENTS = {
  BRAIN_LEECH: {
    id: 'BRAIN_LEECH', title: '脑蛭', icon: '🧠',
    allowed: (g) => g.run.act < 2,
    text: '咚！\n\n你的头顶传来一阵刺痛，一个念头刺入了你的脑海。\n\n「分享知识吗？？？」\n\n你不知如何是好…',
    choices: (g) => [
      {
        label: '分享知识', desc: '从5张随机牌中选择1张加入你的牌组。',
        apply: async () => { await g.randomCardChoices(5, 1); g.eventDone(); },
      },
      {
        label: '把它扯下来', desc: '失去5点生命值。获得一组无色卡牌奖励。',
        apply: async () => { g.damage(5); await g.colorlessCardReward(); g.eventDone(); },
      },
    ],
  },

  CRYSTAL_SPHERE: {
    id: 'CRYSTAL_SPHERE', title: '水晶球', icon: '🔮',
    allowed: (g) => g.run.act >= 2 && g.run.gold >= 100,
    text: '你找到了一台水晶球，球体内部弥漫着朦胧的雾气。\n\n「凝视这颗水晶球，平息你心中的恐惧吧…」\n\n一个声音在你耳边低语。要付出代价，才能窥见未来。',
    choices: (g) => {
      const cost = 50 + g.run.rng.range(1, 50);
      return [
        {
          label: '揭幕未来', desc: `支付${cost}金币，获得3次占卜。`,
          apply: () => { g.gainGold(-cost); g.sphereBegin(3); },
        },
        {
          label: '分期付款', desc: '获得「债务」，获得6次占卜。',
          apply: () => { g.addCardById('DEBT'); g.sphereBegin(6); },
        },
      ];
    },
  },

  DOLL_ROOM: {
    id: 'DOLL_ROOM', title: '玩偶室', icon: '🎎',
    allowed: (g) => g.run.act === 2,
    text: '你走进了一间隐藏的密室……\n\n这里堆满了琳琅满目的玩偶。每一只都独一无二，它们的表情亦从喜悦到悲哀各不相同，其服饰跨越了数个世纪，甚至来自你认知之外的领域。\n\n一阵低语的合唱变得越来越响，直到那些玩偶互相争吵着大叫起来，放声呼唤着你……\n\n你必须选择一个，并立刻离开这个地方。',
    choices: (g) => [
      {
        label: '随机拿走一尊', desc: '获取一尊玩偶遗物。',
        apply: () => { g.addRelicById(g.run.rng.pick(DOLLS).id); g.eventDone(); },
      },
      {
        label: '花点时间慢慢来', desc: '失去5点生命。从2尊玩偶遗物中选择1尊带走。',
        page: 'TAKE_SOME_TIME',
        apply: () => {
          g.damage(5);
          g.evState({ dollChoices: g.run.rng.pickMany(DOLLS.map(d => d.id), 2) });
          g.eventPage('DOLL_ROOM', 'TAKE_SOME_TIME');
        },
      },
      {
        label: '仔细检查然后挑选最好的那个', desc: '失去15点生命。从3尊玩偶遗物中选择1尊带走。',
        page: 'EXAMINE',
        apply: () => {
          g.damage(15);
          g.evState({ dollChoices: DOLLS.map(d => d.id) });
          g.eventPage('DOLL_ROOM', 'EXAMINE');
        },
      },
    ],
    pages: {
      TAKE_SOME_TIME: {
        text: '喧嚣之中，你飞快地审视着这些玩偶。\n\n这两尊里，或许有一尊是不错的选择？\n但在精神的摧残下，你实在难以集中神志。',
        choices: (g) => dollChoices(g),
      },
      EXAMINE: {
        text: '在做出决定之前，你仔细审视了这里的每一尊玩偶。\n\n那些大叫声已变成了刺耳的强音，但你还是在彻底陷入疯狂之前，设法做出了选择！',
        choices: (g) => dollChoices(g),
      },
    },
  },

  FAKE_MERCHANT: {
    id: 'FAKE_MERCHANT', title: '商人？？？', icon: '🧔',
    allowed: (g) => g.run.act >= 2 && (g.run.gold >= 100 || g.run.potions.includes('FOUL_POTION')),
    text: '一个商人模样的人朝你招手。\n\n「欢迎欢迎，遗物专家同行！」\n\n他掀开斗篷，露出地毯上摆得整整齐齐的一排「遗物」。你隐约觉得哪里不太对劲……',
    choices: (g) => g.fakeMerchantChoices(),
    pages: {
      SHOP: {
        text: '「你可真有眼光，诶嘿……多少钱来着？」\n\n商人搓着手，期待地看着你。',
        choices: (g) => g.fakeMerchantChoices(),
      },
    },
  },

  POTION_COURIER: {
    id: 'POTION_COURIER', title: '药水快递员', icon: '📦',
    allowed: (g) => g.run.act >= 2,
    text: '空气中传来一阵浓浓的酸味，不一会儿你在附近找到了一个倒在地上的药水快递员。\n一动不动，已经没了气。死了！？\n快递员带着的物品已经被洗劫得差不多了，只有一批很难闻的药水好好地放在那里，上面有一张字条：“收件人：商人”。',
    choices: (g) => [
      {
        label: '拿走这批药水', desc: '获得3瓶污浊药水。',
        apply: () => {
          for (let i = 0; i < 3; i++) g.addPotionById('FOUL_POTION');
          g.eventDone();
        },
      },
      {
        label: '洗劫', desc: '获得1瓶随机罕见药水。',
        apply: () => { g.addPotionOfTier('uncommon'); g.eventDone(); },
      },
    ],
  },

  RANWID_THE_ELDER: {
    id: 'RANWID_THE_ELDER', title: '长者兰伟德', icon: '🧓',
    allowed: (g) => g.run.act >= 2 && g.run.gold >= 100
      && g.run.relics.some(id => RELIC_TRADABLE(id)) && g.run.potions.some(p => p),
    text: '一个你至今为止见过最年迈的人走到了你的身前。\n「我们又见面了....是我，兰伟德！」\n\n你不认识这个男人。',
    choices: (g) => g.ranwidChoices(),
  },

  RELIC_TRADER: {
    id: 'RELIC_TRADER', title: '遗物交换商', icon: '🕯️',
    allowed: (g) => g.run.act >= 2 && g.run.relics.filter(id => RELIC_TRADABLE(id)).length >= 5,
    text: '你走过一个拐角，一个黑影突然矗立在前方。他转过身来，正对着你。\n\n「欢迎！你想换点什么吶？」\n\n他开口询问，同时猛地掀开斗篷，露出一大堆可疑货物。',
    choices: (g) => g.relicTraderChoices(),
  },

  ROOM_FULL_OF_CHEESE: {
    id: 'ROOM_FULL_OF_CHEESE', title: '满屋芝士', icon: '🧀',
    allowed: (g) => g.run.act < 2,
    text: '这房间里全是芝士！！！\n\n你环顾四周，想看看有没有陷阱，结果发现头顶上是…更多的芝士。屋里的蜡烛似乎也是用芝士做的。家具同样是芝士。\n突然，你身后的门砰地一声关上了。',
    choices: (g) => [
      {
        label: '大快朵颐', desc: '从8张普通牌中选择2张加入你的牌组。',
        apply: async () => { await g.pickRarityCards('common', 2, 8); g.eventDone(); },
      },
      {
        label: '四处搜寻', desc: '失去14点生命。获得天选芝士。',
        apply: () => { g.damage(14); g.addRelicById('CHOSEN_CHEESE'); g.eventDone(); },
      },
    ],
  },

  SELF_HELP_BOOK: {
    id: 'SELF_HELP_BOOK', title: '自助指南', icon: '📕',
    text: '地上有一本书：\n《征服高塔的3种最佳方法》\n\n这本书上血迹斑斑，所以你觉得它非常可疑。\n\n你要读它吗？',
    choices: (g) => {
      const has = (type) => g.run.deck.some(d => CARDS_TYPE(g, d.id) === type);
      const opts = [];
      if (has('attack')) {
        opts.push({ label: '读下封底', desc: '选择一张攻击牌附魔：锋利2。', apply: async () => { await g.enchantOfType('SHARP', 'attack'); g.eventDone(); } });
      }
      if (has('skill')) {
        opts.push({ label: '随便读个一段', desc: '选择一张技能牌附魔：灵巧2。', apply: async () => { await g.enchantOfType('NIMBLE', 'skill'); g.eventDone(); } });
      }
      if (has('power')) {
        opts.push({ label: '读完整本书', desc: '选择一张能力牌附魔：迅捷2。', apply: async () => { await g.enchantOfType('SWIFT', 'power'); g.eventDone(); } });
      }
      if (!opts.length) opts.push({ label: '离开', desc: '你没有任何可以附魔的牌。', apply: () => g.eventDone() });
      return opts;
    },
  },

  SLIPPERY_BRIDGE: {
    id: 'SLIPPERY_BRIDGE', title: '滑脚木桥', icon: '🌉',
    allowed: (g) => g.run.floor > 6 && g.run.deck.some(d => (CARDS_RARITY(g, d.id) !== 'basic')),
    text: '当你穿过一座摇摇欲坠的木桥时，忽然间暴雨倾盆。阵阵狂风不断向你袭来，似乎要将你的旅程终结与此。',
    choices: (g) => {
      g.evState({ holds: 0, seen: [] });
      g.pickBridgeCard();
      return g.bridgeChoices();
    },
    pages: {
      BRIDGE: {
        text: (g) => {
          const st = g.evState();
          const texts = [
            '你正在坚持！',
            '还在…坚…扌~~寺！！！',
            '口~阝~可~！？！！！',
            '我能行！！！',
            '不～～～～',
            '我在干什么！？',
            '!!!!!!!!!!!!!... !!!\n\n!!!!!!!! !!!!!!!!!!!?? !!!!!!!!!',
            '开发者在此告知：对于坚持了这么久的玩家，这里已经没有额外的文本内容了。若有不便，我们对此深表歉意。',
          ];
          return texts[Math.min(st.holds, texts.length - 1)];
        },
        choices: (g) => g.bridgeChoices(),
      },
    },
  },

  STONE_OF_ALL_TIME: {
    id: 'STONE_OF_ALL_TIME', title: '永恒之石', icon: '🪨',
    allowed: (g) => g.run.act === 2 && g.run.potions.some(p => p),
    text: '在一个废弃庭院的当中，有一块巨大的石头。\n\n石头边的一块牌子上写着：\n永恒之石\n\n从它的样子、形状和装饰来看，整个庭院都是围绕着这块石头建造出来的，它从来没有离开过那个地点哪怕一次。',
    choices: (g) => {
      const potionIdx = g.run.potions.findIndex(p => p);
      const potionName = potionIdx >= 0 ? (POTION_NAME(g, g.run.potions[potionIdx])) : '';
      const canPush = g.run.deck.some(d => CARDS_TYPE(g, d.id) === 'attack');
      return [
        {
          label: '喝药抬起', desc: potionIdx >= 0 ? `失去${potionName}。获得10最大生命。` : '需要药水。',
          disabled: potionIdx < 0,
          apply: () => { g.run.removePotion(potionIdx); g.gainMaxHp(10); g.eventDone(); },
        },
        {
          label: '用力去推', desc: canPush ? '失去6点生命。附魔一张攻击牌：活力8。' : '需要一张攻击牌。',
          disabled: !canPush,
          apply: async () => { g.damage(6); await g.enchantOfType('VIGOROUS', 'attack'); g.eventDone(); },
        },
      ];
    },
  },

  SYMBIOTE: {
    id: 'SYMBIOTE', title: '共生体', icon: '🦠',
    allowed: (g) => g.run.act >= 2,
    text: '一团黏稠的东西正附在墙上，缓慢地搏动着。\n\n它察觉到你，伸出了触须。',
    choices: (g) => [
      {
        label: '靠近', desc: '选择一张牌附魔：腐化（伤害×1.5，每次打出失去2生命）。',
        apply: async () => { await g.enchantChoice('CORRUPTED'); g.eventDone(); },
      },
      {
        label: '用火烧掉', desc: '变化一张牌。',
        apply: async () => { await g.transformChoice(); g.eventDone(); },
      },
    ],
  },

  TEA_MASTER: {
    id: 'TEA_MASTER', title: '茶艺大师', icon: '🍵',
    allowed: (g) => g.run.act < 3 && g.run.gold >= 150,
    text: '你不知怎么晃进了一个灯光昏暗的小棚屋，发现里面的空间感觉非常和平，四周摆满了种类繁多的茶叶。\n\n屋子里面的男人做出手势，让你去看一批茶叶，每一种都有雅致的标签告知你茶叶的高昂价格。',
    choices: (g) => {
      const gold = g.run.gold;
      return [
        {
          label: '骨茶', desc: gold >= 50 ? '支付50金币。接下来1场战斗开始时升级初始手牌。' : '需要50金币。',
          disabled: gold < 50,
          apply: () => { g.gainGold(-50); g.addRelicById('BONE_TEA'); g.eventDone(); },
        },
        {
          label: '余烬茶', desc: gold >= 150 ? '支付150金币。接下来5场战斗开始时获得2点力量。' : '需要150金币。',
          disabled: gold < 150,
          apply: () => { g.gainGold(-150); g.addRelicById('EMBER_TEA'); g.eventDone(); },
        },
        {
          label: '无礼之茶', desc: '下一场战斗开始时，将2张晕眩放入你的抽牌堆。',
          apply: () => { g.addRelicById('TEA_OF_DISCOURTESY'); g.eventDone(); },
        },
      ];
    },
  },

  THE_FUTURE_OF_POTIONS: {
    id: 'THE_FUTURE_OF_POTIONS', title: '药水的未来？', icon: '💊',
    allowed: (g) => g.run.potions.filter(p => p).length >= 2,
    text: '转过拐角，你感受到一阵轻微的轰鸣，随后发现了一台巨大的旋转装置！\n它带有几个槽位，似乎能将液体转化为高度压缩的易消化药片。\n\n将这些药水炼成一小片的想法令人有些不适，但或许尝试新事物也不错？',
    choices: (g) => g.potionFusionChoices(),
  },

  THE_LEGENDS_WERE_TRUE: {
    id: 'THE_LEGENDS_WERE_TRUE', title: '传说是真的', icon: '🗺️',
    allowed: (g) => g.run.act === 1 && g.run.deck.length > 0 && g.run.hp >= 10,
    text: '踏入漆黑的密室，一道亮光从上方刺破黑暗，与此同时，身后的门砰然关上。\n\n借着光亮，你看到前方的石台上放着一张地图。你有一种强烈的想要拿走它的冲动。\n\n事出反常。',
    choices: (g) => [
      { label: '顺走地图', desc: '获得藏宝图。', apply: () => { g.addCardById('SPOILS_MAP'); g.eventDone(); } },
      { label: '耐心寻找出口', desc: '失去8点生命。获得1瓶随机药水。', apply: () => { g.damage(8); g.addPotionRandom(); g.eventDone(); } },
    ],
  },

  THIS_OR_THAT: {
    id: 'THIS_OR_THAT', title: '这个还是那个？', icon: '🖐️',
    text: '附近的一个坑洞里突然蹿出一双手臂，一只手紧握着一袋可疑的财宝，另一只则拿着一件明显被诅咒的遗物。\n\n「这个……还是那个？」\n一个嘶哑的声音从地下传来，向你低语。',
    choices: (g) => {
      const gold = g.run.rng.range(41, 68);
      return [
        { label: '这个', desc: `失去6点生命。获得${gold}金币。`, apply: () => { g.damage(6); g.gainGold(gold); g.eventDone(); } },
        {
          label: '那个', desc: '将一张笨拙加入你的牌组。获得一件随机遗物。',
          apply: () => { g.addCardById('CLUMSY'); g.addRelicRandom(); g.eventDone(); },
        },
      ];
    },
  },

  WAR_HISTORIAN_REPY: {
    id: 'WAR_HISTORIAN_REPY', title: '战史学家 付袭', icon: '🕯️',
    // CanAppearNaturally => false / IsAllowed => false：只能由「灯火钥匙」的后续事件触发
    allowed: () => false,
    text: '你看到一个学者被关在一个吊在空中的笼子里，而旁边有一个大宝箱。\n\n那个学者一边咕哝着什么“一次性的钥匙”，一边拼命地在写着些什么。\n\n看起来你可以二选一，要么打开笼子，要么打开宝箱。',
    choices: (g) => [
      {
        label: '打开笼子', desc: '失去灯火钥匙。获得历史课。',
        apply: () => { g.removeFirstById('LANTERN_KEY'); g.addRelicById('HISTORY_COURSE'); g.eventDone(); },
      },
      {
        label: '打开宝箱', desc: '失去灯火钥匙。获得2瓶随机药水和2件随机遗物。',
        apply: () => {
          g.removeFirstById('LANTERN_KEY');
          g.addPotionRandom(); g.addPotionRandom();
          g.addRelicRandom(); g.addRelicRandom();
          g.eventDone();
        },
      },
    ],
  },

  WELCOME_TO_WONGOS: {
    id: 'WELCOME_TO_WONGOS', title: '欢迎来到旺购百货', icon: '🛒',
    allowed: (g) => g.run.act === 2 && g.run.gold >= 100,
    text: '“欢迎来到旺购百货，这里有超旺商品，一定让您越购越旺。”店员说着欢迎词，看起来没有丝毫热情。\n\n“请随意查看我们的商品，祝您在旺购过得愉快。”店员头也不抬地继续说着。',
    choices: (g) => {
      const gold = g.run.gold;
      const featured = g.run.rollRelic('rare');
      return [
        {
          label: '旺购的打折货物', desc: gold >= 100 ? '支付100金币。获得1件随机普通遗物。' : '需要100金币。',
          disabled: gold < 100,
          apply: () => { g.gainGold(-100); g.addRelicOfTier('common'); g.eventDone(); },
        },
        {
          label: '旺购的特选商品', desc: gold >= 200 ? `支付200金币。获得${RELICS_NAME(g, featured)}。` : '需要200金币。',
          disabled: gold < 200,
          apply: () => { g.gainGold(-200); g.addRelicById(featured); g.eventDone(); },
        },
        {
          label: '旺购的神秘盲盒', desc: gold >= 300 ? '支付300金币。在5场战斗后获得3个随机遗物。' : '需要300金币。',
          disabled: gold < 300,
          apply: () => { g.gainGold(-300); g.addRelicById('WONGOS_MYSTERY_TICKET'); g.eventDone(); },
        },
        {
          label: '离开', desc: '随机降级一张牌。',
          apply: () => { g.downgradeRandomN(1); g.eventDone(); },
        },
      ];
    },
  },
};

/* ---------- 事件内部用到的小工具（数据层，避免在 app.js 里散落 if） ---------- */

function dollChoices(g) {
  const st = g.evState();
  // 直接跳到这一页（或状态丢失）时退化成「三尊都能选」，避免界面没有任何按钮
  const list = (st.dollChoices && st.dollChoices.length) ? st.dollChoices : DOLLS.map(d => d.id);
  return list.map((id) => {
    const doll = DOLLS.find(d => d.id === id) || { name: id };
    return {
      label: doll.name, desc: '获得这尊玩偶遗物。',
      apply: () => { g.addRelicById(id); g.eventDone(); },
    };
  });
}

/** 可交易的遗物（对照 RelicModel.IsTradable：初始/事件/Boss 类不参与） */
export function RELIC_TRADABLE(id) {
  return !['starter', 'event', 'boss'].includes(RELICS[id]?.rarity || 'common');
}

function RELICS_NAME(g, id) { return RELICS[id]?.name || '一件遗物'; }
function POTION_NAME(g, id) { return POTIONS[id]?.name || '那瓶药水'; }
function CARDS_TYPE(g, id) { return CARDS[id]?.type; }
function CARDS_RARITY(g, id) { return CARDS[id]?.rarity; }

/** 共享事件池（顺序对照 SharedEventPool.All） */
export const SHARED_EVENT_IDS = Object.keys(SHARED_EVENTS);
