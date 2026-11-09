/** 第一幕事件（“?”房间）—— 名称取自原作事件池，效果按简化版实现 */
export const EVENTS = {
  /* ===== 以下 5 个事件对照 sts2-sim 的 Models/Events/*.cs 移植 ===== */
  AROMA_OF_CHAOS: {
    id: 'AROMA_OF_CHAOS', title: '混沌芳香', icon: '🌸',
    text: '费力地穿过一片厚密的灌木丛并来到空地后，一种莫名的怀旧感突然向你袭来。\n\n那是花朵的芬芳、腐烂的恶臭以及某种无法言说的气息的混合体。每前进一步，这股气味都变得愈发浓烈。与此同时，你感受到周围的世界正开始扭曲，旋转。\n\n一股变幻莫测的混沌将你淹没，你开始慢慢地丧失了对自我的感知。',
    choices: (g) => [
      { label: '放任自流', desc: '变化你牌组中的一张牌。', apply: async () => { await g.transformChoice(1); g.eventDone(); } },
      { label: '维持理智', desc: '升级你牌组中的一张牌。', apply: async () => { await g.upgradeChoice(1); g.eventDone(); } },
    ],
  },
  BYRDONIS_NEST: {
    id: 'BYRDONIS_NEST', title: '多尼斯异鸟巢', icon: '🥚',
    // IsAllowed：已经拥有事件宠物（异鸟宝宝 / 佩尔的士兵）时这个事件不会出现
    allowed: (g) => !g.hasEventPet(),
    text: '你看见一只巨大的蹒跚巨兽正在驱赶一只受伤的绿色异鸟。\n\n在那只异鸟逃离的隐蔽角落里，一颗无人看守的蛋被遗弃在了那里。\n\n你的肚子咕咕作响…',
    choices: (g) => [
      { label: '吃掉这颗蛋', desc: '获得7点最大生命值。', apply: () => { g.gainMaxHp(7); g.eventDone(); } },
      {
        label: '带走这颗蛋',
        desc: '将一张「多尼斯异鸟蛋」加入你的牌组。',
        apply: () => { g.addCardById('BYRDONIS_EGG'); g.eventDone(); },
      },
    ],
  },
  DENSE_VEGETATION: {
    id: 'DENSE_VEGETATION', title: '茂密的植被', icon: '🌿',
    // 单人也允许低血量进入；只有多人局里有人血量 ≤8 才会被跳过
    allowed: (g) => g.run.hp > 8,
    text: '你在错路上走了一段时间之后，你发现自己置身于一片由蕨类、灌木和藤蔓构成的茂密丛林中。尤其是藤蔓。精疲力竭的感觉油然而生，一个可怕的念头随之浮现在脑海里：\n\n“你迷路了，毫无防备，而死亡的阴影正悄然逼近。”\n\n你要怎么办呢？',
    choices: (g) => {
      // 金币只掷一次（对照 CalculateVars），后续重绘不再消耗随机流
      const st = g.evState();
      if (!st.dense) st.dense = { gold: g.run.rng.range(61, 99) };
      const heal = Math.floor(g.run.maxHp * (g.run.asc >= 2 ? 0.25 : 0.3));
      return [
        {
          label: '坚持跋涉',
          desc: `失去8点生命（无视格挡）。获得${st.dense.gold}金币。`,
          apply: () => { g.damage(8); g.gainGold(st.dense.gold); g.eventDone(); },
        },
        { label: '休息', desc: `回复${heal}点生命。然后进入战斗。`, page: 'REST', apply: () => g.eventPage('DENSE_VEGETATION', 'REST') },
      ];
    },
    pages: {
      REST: {
        text: '你精疲力竭，小歇了片刻…\n\n…不料却被在你身上蠕动的什么东西惊醒了！',
        choices: (g) => [
          {
            label: '战！', desc: '与 4 只扭动虫战斗。', combat: true,
            apply: () => {
              const heal = Math.floor(g.run.maxHp * (g.run.asc >= 2 ? 0.25 : 0.3));
              g.heal(heal);
              g.eventCombat('DENSE_VEGETATION', ['WRIGGLER', 'WRIGGLER', 'WRIGGLER', 'WRIGGLER'], () => g.eventDone(),
                { slots: ['wriggler1', 'wriggler2', 'wriggler3', 'wriggler4'] });
            },
          },
        ],
      },
    },
  },
  MORPHIC_GROVE: {
    id: 'MORPHIC_GROVE', title: '变形灵林谷', icon: '💠',
    allowed: (g) => g.run.gold >= 100 && g.run.deck.filter(d => g.isTransformable(d.id)).length >= 2,
    text: '你进入了一片结晶树的林谷，树木开始激动地颤抖起来！\n一阵阵杂乱的问候与欢迎声在你耳边不断响起，原来是一群变形灵从树上绽放了出来。\n\n有一只变形灵在角落里坐立不安的样子，显然不像其他同类那样善于社交。\n\n你是去找一群变形灵，还是去找落单的那个？',
    choices: (g) => [
      {
        label: '大群变形灵',
        desc: `失去全部${g.run.gold}金币。变化2张牌。`,
        apply: async () => { g.gainGold(-g.run.gold); await g.transformChoice(2); g.eventDone(); },
      },
      { label: '落单变形灵', desc: '获得5点最大生命值。', apply: () => { g.gainMaxHp(5); g.eventDone(); } },
    ],
  },
  UNREST_SITE: {
    id: 'UNREST_SITE', title: '无休之处', icon: '🔥',
    allowed: (g) => g.run.hp <= g.run.maxHp * 0.7,
    text: '你找到了一个隔绝的休息处，于是点起篝火打算休息。\n结果只是打算而已。\n\n篝火点起后，火光立即胀大起来，不是向上而是向着侧面延伸向一片满是冒油树木的林地。\n\n要不要不管这个情况，就这么继续休息？',
    choices: (g) => [
      {
        label: '就这样休息', desc: '回复全部生命值。获得「睡眠不佳」。',
        apply: () => { g.heal(g.run.maxHp - g.run.hp); g.addCardById('POOR_SLEEP'); g.eventDone(); },
      },
      {
        label: '杀死树木', desc: '失去8点最大生命值。获得一件随机遗物。',
        apply: () => { g.loseMaxHp(8); g.addRelicRandom(); g.eventDone(); },
      },
    ],
  },

  WELLSPRING: {
    id: 'WELLSPRING', title: '泉眼', icon: '⛲',
    text: '林间有一眼清泉，水面泛着微光。你俯身望去，看到自己在水中的倒影显得比想象中更疲惫。',
    choices: (g) => [
      { label: '畅饮泉水', desc: '回复 25% 最大生命值', apply: () => g.heal(Math.floor(g.run.maxHp * 0.25)) },
      { label: '灌满水袋', desc: '获得 1 瓶随机药水，失去 5 点生命', apply: () => { g.damage(5); g.addPotionRandom(); } },
      { label: '离开', desc: '什么也不做', apply: () => {} },
    ],
  },
  JUNGLE_MAZE: {
    id: 'JUNGLE_MAZE', title: '密林迷宫', icon: '🌴',
    text: '藤蔓之间似乎藏着一条小路。走进去也许能找到前人留下的东西，也可能只是绕上一整天。',
    choices: (g) => [
      { label: '深入探索', desc: '获得 90 金币，失去 8 点生命', apply: () => { g.gainGold(90); g.damage(8); } },
      { label: '谨慎绕行', desc: '回复 8 点生命', apply: () => g.heal(8) },
    ],
  },
  SAPPHIRE_SEED: {
    id: 'SAPPHIRE_SEED', title: '蓝宝石种子', icon: '💠',
    text: '一枚半透明的蓝色种子落在你掌心，触手温热。它似乎在等待一个决定。',
    choices: (g) => [
      { label: '种下它', desc: '最大生命值 +6', apply: () => g.gainMaxHp(6) },
      { label: '吞下它', desc: '回复 20 点生命，失去 25 金币', apply: () => { g.heal(20); g.gainGold(-25); } },
    ],
  },
  TABLET_OF_TRUTH: {
    id: 'TABLET_OF_TRUTH', title: '真实石板', icon: '📜',
    text: '一块刻满陌生文字的石板斜插在土中。看清那些字迹的瞬间，你的太阳穴一阵刺痛。',
    choices: (g) => [
      { label: '研读石板', desc: '随机升级一张牌，失去 5 点生命', apply: () => { g.damage(5); g.upgradeRandomCard(); } },
      { label: '砸碎石板', desc: '获得 60 金币', apply: () => g.gainGold(60) },
    ],
  },
  WHISPERING_HOLLOW: {
    id: 'WHISPERING_HOLLOW', title: '低语之洞', icon: '🕳️',
    text: '洞口传出细碎的低语，像是在叫你的名字。你听不清它们在说什么，却莫名觉得它们知道些什么。',
    choices: (g) => [
      { label: '倾听低语', desc: '获得一张随机稀有牌，最大生命值 -3', apply: () => { g.gainMaxHp(-3); g.gainRandomCard('rare'); } },
      { label: '捂住耳朵离开', desc: '获得 30 金币', apply: () => g.gainGold(30) },
    ],
  },
  LUMINOUS_CHOIR: {
    id: 'LUMINOUS_CHOIR', title: '日光合唱团', icon: '✨',
    text: '一群由光点组成的生物低声合唱。它们转向你，似乎在邀请你加入。',
    choices: (g) => [
      { label: '加入合唱', desc: '获得 75 金币', apply: () => g.gainGold(75) },
      { label: '献上一张牌', desc: '移除一张牌，获得 20 金币', apply: () => { g.gainGold(20); g.removeCardPrompt(); } },
    ],
  },
  WOOD_CARVINGS: {
    id: 'WOOD_CARVINGS', title: '木雕', icon: '🪵',
    text: '一截老树桩上刻着密密麻麻的图案，像是某种记事的方式。刻痕里积着薄薄一层灰。',
    choices: (g) => [
      { label: '仔细端详', desc: '获得一件随机遗物，失去 6 点生命', apply: () => { g.damage(6); g.addRelicRandom(); } },
      { label: '取走木材', desc: '获得 45 金币', apply: () => g.gainGold(45) },
    ],
  },
};

/** 第一幕（蔓生之地）事件池：顺序对照 Act1EventPool.All */
export const ACT1_EVENTS = [
  'AROMA_OF_CHAOS', 'BYRDONIS_NEST', 'DENSE_VEGETATION', 'JUNGLE_MAZE',
  'LUMINOUS_CHOIR', 'MORPHIC_GROVE', 'SAPPHIRE_SEED', 'SUNKEN_STATUE',
  'TABLET_OF_TRUTH', 'UNREST_SITE', 'WELLSPRING', 'WHISPERING_HOLLOW',
  'WOOD_CARVINGS',
];

/* =========================================================================
   第二幕 · 巢穴（Hive）事件池
   文本对照官方 zhs 本地化，效果与数值对照 sts2-sim 的 EventModel 实现。
   ========================================================================= */
export const HIVE_EVENTS = {
  AMALGAMATOR: {
    id: 'AMALGAMATOR', title: '熔合者', icon: '⚒️',
    text: '铿！铿！！锵！！！\n墙壁的另一侧传来阵阵金属交击声的回响……\n你把头贴在墙上探听，墙壁却轰然开启，露出一个正在埋头苦干的魁梧六臂身影。\n它的「脸」是一团由发光符文构成的流转旋涡。\n「一个拥有进阶之魂的人竟然找到了我的工坊？那就让我们开始融合吧！」',
    choices: (g) => [
      { label: '融合打击', desc: '移除2张打击，将一张「究极打击」加入牌组', apply: () => g.combineBasics('strike', 'ULTIMATE_STRIKE') },
      { label: '融合防御', desc: '移除2张防御，将一张「究极防御」加入牌组', apply: () => g.combineBasics('defend', 'ULTIMATE_DEFEND') },
    ],
  },
  BUGSLAYER: {
    id: 'BUGSLAYER', title: '害虫杀手', icon: '🐛',
    text: '当你正奋力抵御一群穷凶极恶的虫群时，你突然注意到，一位威猛剽悍的战士竟然一直就在你身边并肩作战！\n\n虫群察觉败局，四散而逃。你转向这位战友。\n「你想要一些消灭这些害虫的建议吗？」\n\n还挺有礼貌。你点了点头，接受了他的提议。',
    choices: (g) => [
      { label: '学习杀灭的技巧', desc: '将一张「杀灭」加入牌组', apply: () => g.addCardById('EXTERMINATE') },
      { label: '学习压扁的技巧', desc: '将一张「压扁」加入牌组', apply: () => g.addCardById('SQUASH') },
    ],
  },
  COLORFUL_PHILOSOPHERS: {
    id: 'COLORFUL_PHILOSOPHERS', title: '色彩哲学家', icon: '🎨',
    text: '在你面前的是一幕颇为宏伟的景象。\n三座不同颜色的石像耸立在高台之上，正就色彩的哲学内涵展开激烈的争论。\n\n随着你的倾听，你感觉到眼下最核心的议题是——究竟哪种颜色才是[gold]最棒的[/gold]。\n\n你加入其中，表达了你的见解。',
    choices: (g) => g.philosopherChoices(),
  },
  COLOSSAL_FLOWER: {
    id: 'COLOSSAL_FLOWER', title: '巨大花卉', icon: '🌺',
    text: '一朵巨型花卉正生长在一座骸骨堆积而成的山上。\n\n它那变换色彩的花瓣不断搏动，你感觉到中心处一定有一团强力花粉，但那起伏的花瓣如刀锋般锋利且捉摸不定。\n\n你本可以只采集一些金色花蜜，但中心处的那个奖赏实在是太诱人了……',
    choices: (g) => [
      { label: '采集花蜜', desc: '获得35金币', apply: () => { g.gainGold(35); g.eventDone(); } },
      { label: '深入探索', desc: '失去5点生命，继续深入', page: 'DIG1', apply: () => { g.damage(5); g.eventPage('COLOSSAL_FLOWER', 'DIG1'); } },
    ],
    pages: {
      DIG1: {
        text: '你伸手探进花瓣之间，手臂上立刻被划出几道血痕。\n里面还藏着更多东西。',
        choices: (g) => [
          { label: '采集花蜜', desc: '获得75金币', apply: () => { g.gainGold(75); g.eventDone(); } },
          { label: '继续深入', desc: '失去6点生命，继续深入', page: 'DIG2', apply: () => { g.damage(6); g.eventPage('COLOSSAL_FLOWER', 'DIG2'); } },
        ],
      },
      DIG2: {
        text: '花瓣之内是一团温热的金色花粉，几乎触手可及。\n只要再往前一点——',
        choices: (g) => [
          { label: '采集花蜜', desc: '获得135金币', apply: () => { g.gainGold(135); g.eventDone(); } },
          { label: '取出授粉核心', desc: '失去7点生命，获得「授粉核心」', apply: () => { g.damage(7); g.addRelicById('POLLINOUS_CORE'); g.eventDone(); } },
        ],
      },
    },
  },
  FIELD_OF_MAN_SIZED_HOLES: {
    id: 'FIELD_OF_MAN_SIZED_HOLES', title: '人形洞穴之地', icon: '🕳️',
    text: '眼前突然出现一大片土地，上面凿刻着密密麻麻的人形轮廓，让你不由得停下了脚步。\n\n其中有一个洞的轮廓，竟然和你的体型一模一样。\n\n完美契合……',
    choices: (g) => [
      { label: '抵抗诱惑', desc: '移除2张牌，将一张「凡庸」加入牌组', apply: async () => { await g.removeCards(2); g.addCardById('NORMALITY'); g.eventDone(); } },
      { label: '进入你的洞', desc: '为一张牌附魔：「完美契合」（洗牌后必定最先抽到）', apply: async () => { await g.enchantChoice('PERFECT_FIT'); g.eventDone(); } },
    ],
  },
  INFESTED_AUTOMATON: {
    id: 'INFESTED_AUTOMATON', title: '被寄生的自动机械', icon: '🤖',
    text: '这间密室里堆满了报废的机器人。\n\n其中一台孤零零的自动机械，其核心仍在幽幽发光，但它已被一种诡异的有机增生组织吞没，毫无响应。',
    choices: (g) => [
      { label: '学习', desc: '随机获得一张能力牌', apply: () => { g.gainRandomOfType('power'); g.eventDone(); } },
      { label: '触碰核心', desc: '随机获得一张耗能为0的牌', apply: () => { g.gainRandomZeroCost(); g.eventDone(); } },
    ],
  },
  LOST_WISP: {
    id: 'LOST_WISP', title: '迷失鬼火', icon: '🔥',
    text: '远处有一幕古怪的景象。成堆的昆虫残骸层层堆叠，围绕着一个像是微小的光团的东西。\n它似乎对各种虫子都有着不俗的吸引力，但你却目睹了它迸发出火焰！\n\n你走近前去一探究竟。',
    choices: (g) => {
      const gold = 60 + g.run.rng.range(-15, 15);
      return [
        { label: '抓住这团鬼火', desc: '将一张「腐朽」加入牌组，获得「迷失鬼火」', apply: () => { g.addCardById('DECAY'); g.addRelicById('LOST_WISP'); g.eventDone(); } },
        { label: '搜索附近的区域', desc: `获得${gold}金币`, apply: () => { g.gainGold(gold); g.eventDone(); } },
      ];
    },
  },
  SPIRIT_GRAFTER: {
    id: 'SPIRIT_GRAFTER', title: '灵魂嫁接者', icon: '🦋',
    text: '在你上方，一个茧正在颤动扭曲，似乎就要破茧而出了！\n\n……它停止了扭动。茧燃烧了起来！发生什么事了？\n\n一道光芒与烈焰闪过，一个灵魂嫁接者向你冲来，试图要与你融为一体，以求完整。',
    choices: (g) => [
      { label: '接纳', desc: '回复25点生命，将一张「羽化」加入牌组', apply: () => { g.heal(25); g.addCardById('METAMORPHOSIS'); g.eventDone(); } },
      { label: '拒绝', desc: '失去10点生命，升级一张牌', apply: async () => { g.damage(10); await g.upgradeChoice(); g.eventDone(); } },
    ],
  },
  THE_LANTERN_KEY: {
    id: 'THE_LANTERN_KEY', title: '灯火钥匙', icon: '🔑',
    text: '你发现了一把发出微光的钥匙，于是将它捡了起来。\n\n「我找这把钥匙可把这里翻了个遍！你要是不介意的话……」\n\n这家伙看起来不是什么好人，但或许你也不该以貌取人。',
    choices: (g) => [
      { label: '交还钥匙', desc: '获得100金币', apply: () => { g.gainGold(100); g.eventDone(); } },
      {
        label: '留下钥匙', desc: '与神秘骑士战斗，胜利后获得「灯火钥匙」', combat: true,
        apply: () => g.eventCombat('MYSTERIOUS_KNIGHT_ENCOUNTER', ['MYSTERIOUS_KNIGHT'], (won) => {
          if (won) g.addCardById('LANTERN_KEY');
          g.eventDone();
        }),
      },
    ],
  },
  ZEN_WEAVER: {
    id: 'ZEN_WEAVER', title: '修禅织网者', icon: '🕷️',
    text: '你在行走时撞到了一张蜘蛛网，立即慌了神！\n可是很快，一阵平静的感觉席卷了你……\n\n「冷静下来，我需要你不再弄坏我的网。」\n\n一只小之又小的蜘蛛沿着丝线降落下来与你问好，它看起来愿意收取一些金币来分享它的部分技术。',
    choices: (g) => {
      const gold = g.run.gold;
      return [
        { label: '呼吸技法', desc: '支付50金币，将2张「开悟」加入牌组', disabled: gold < 50, apply: () => { g.gainGold(-50); g.addCardById('ENLIGHTENMENT'); g.addCardById('ENLIGHTENMENT'); g.eventDone(); } },
        { label: '情绪觉察', desc: '支付125金币，移除1张牌', disabled: gold < 125, apply: async () => { g.gainGold(-125); await g.removeCards(1); g.eventDone(); } },
        { label: '蜘蛛针灸', desc: '支付250金币，移除2张牌', disabled: gold < 250, apply: async () => { g.gainGold(-250); await g.removeCards(2); g.eventDone(); } },
      ];
    },
  },
};

/* =========================================================================
   第三幕 · 荣耀（Glory）事件池
   ========================================================================= */
export const GLORY_EVENTS = {
  BATTLEWORN_DUMMY: {
    id: 'BATTLEWORN_DUMMY', title: '战痕累累的训练假人', icon: '🎯',
    text: '当你靠近时，它突然开始轰鸣，滋滋作响，随后爆发出耀眼的光芒！\n\n「滋滋！训练时间到！！！你有3个回合的时间来击败我！选择一个档位，否则就准备好面对致命的羞辱吧。」\n\n在发布完这段恐怖的宣言后，假人开始认真地读出详细的指令。',
    choices: (g) => [
      {
        label: '第1档', desc: '与75点生命值的假人战斗，胜利后获得1瓶随机药水', combat: true,
        apply: () => g.eventCombat('BATTLE_FRIEND_V1', ['BATTLE_FRIEND_V1'], (won) => { if (won) g.addPotionRandom(); g.eventDone(); }),
      },
      {
        label: '第2档', desc: '与150点生命值的假人战斗，胜利后随机升级2张牌', combat: true,
        apply: () => g.eventCombat('BATTLE_FRIEND_V2', ['BATTLE_FRIEND_V2'], (won) => { if (won) g.upgradeRandomN(2); g.eventDone(); }),
      },
      {
        label: '第3档', desc: '与300点生命值的假人战斗，胜利后获得一件随机遗物', combat: true,
        apply: () => g.eventCombat('BATTLE_FRIEND_V3', ['BATTLE_FRIEND_V3'], (won) => { if (won) g.addRelicRandom(); g.eventDone(); }),
      },
    ],
  },
  GRAVE_OF_THE_FORGOTTEN: {
    id: 'GRAVE_OF_THE_FORGOTTEN', title: '遗忘之墓', icon: '⚰️',
    text: '一座孤冢上翻腾着汹涌的蓝焰……\n\n一名高傲的战士战死于此，灵魂却躁动不安。它渴望继续战斗，你甚至能感觉到它在哀求，求你带着它一起踏上征途。\n\n但也许，让它直面真相才是更好的选择？',
    choices: (g) => [
      { label: '让它直面真相', desc: '将一张「腐朽」加入牌组，为一张带「消耗」的牌附魔：「灵魂之力」', apply: async () => { g.addCardById('DECAY'); await g.enchantChoice('SOULS_POWER', true); g.eventDone(); } },
      { label: '接受这颗遗物', desc: '获得「遗忘之魂」', apply: () => { g.addRelicById('FORGOTTEN_SOUL'); g.eventDone(); } },
    ],
  },
  HUNGRY_FOR_MUSHROOMS: {
    id: 'HUNGRY_FOR_MUSHROOMS', title: '蘑菇饥渴', icon: '🍲',
    text: '上一次吃饭是什么时候来着？\n……等等，这股奇妙的香味是怎么回事？\n\n循着气味，你来到了一处温馨的营地，各种美味的蘑菇正在火上烤着！由于实在是太饿了，你甚至完全没想过这些玩意儿安不安全。\n（你饿得甚至连旁边有个死掉的冒险者这事都没注意到）',
    choices: (g) => [
      { label: '大蘑菇', desc: '获得「大蘑菇」：最大生命值+20，但每场战斗第一回合少抽2张牌', apply: () => { g.addRelicById('BIG_MUSHROOM'); g.gainMaxHp(20); g.eventDone(); } },
      { label: '芳香蘑菇', desc: '获得「芳香蘑菇」：失去15点生命，随机升级2张牌', apply: () => { g.addRelicById('FRAGRANT_MUSHROOM'); g.damage(15); g.upgradeRandomN(2); g.eventDone(); } },
    ],
  },
  REFLECTIONS: {
    id: 'REFLECTIONS', title: '镜中倒影', icon: '🪞',
    text: '这是什么？这里感觉不太对劲……\n\n……劲对太不觉感里这？么什是这',
    choices: (g) => [
      { label: '触碰镜子', desc: '降级2张随机卡牌，升级4张随机卡牌', apply: () => { g.downgradeRandomN(2); g.upgradeRandomN(4); g.eventDone(); } },
      { label: '打碎', desc: '复制你的整个牌组，获得「霉运」', apply: () => { g.duplicateDeck(); g.addCardById('BAD_LUCK'); g.eventDone(); } },
    ],
  },
  ROUND_TEA_PARTY: {
    id: 'ROUND_TEA_PARTY', title: '圆桌茶会', icon: '🫖',
    text: '你找到了一份送给「加拉洛特爵士」的请柬，邀请他参加一次茶会，于是你决定代他前去。\n\n走进其貌不扬的圆形大厅时，你发现这里有一大群指挥官、将军、军阀和商人们，正在……喝着茶？\n\n一个头戴金冠的巨人骑士开口说道：\n「汝来茶会竟敢迟到？！」',
    choices: (g) => [
      { label: '喝杯好茶', desc: '获得「皇家毒药」，回复全部生命', apply: () => { g.addRelicById('ROYAL_POISON'); g.heal(g.run.maxHp); g.eventDone(); } },
      { label: '挑事斗殴', desc: '「那就来吧。」', page: 'FIGHT', apply: () => g.eventPage('ROUND_TEA_PARTY', 'FIGHT') },
    ],
    pages: {
      FIGHT: {
        text: '你放下茶杯，把桌子掀了。\n巨人骑士缓缓起身。',
        choices: (g) => [
          { label: '继续战斗', desc: '失去11点生命，获得一件随机遗物', apply: () => { g.damage(11); g.addRelicRandom(); g.eventDone(); } },
        ],
      },
    },
  },
  TRIAL: {
    id: 'TRIAL', title: '审判', icon: '⚖️',
    text: '你排起队，和众人一起进入一栋巨大的建筑物。\n\n当你通过一道金色的拱门时，突然号角响起、彩纸爆裂飞散，天花板上还飞出了众多彩条！\n\n「第114514号进入者，你将成为今天审判的判决者。」',
    choices: (g) => [
      { label: '接受', desc: '担当今天的判决者', page: 'CASE', apply: () => g.eventPage('TRIAL', g.trialCase()) },
      { label: '拒绝', desc: '拒绝是不被允许的。', page: 'REJECT', apply: () => g.eventPage('TRIAL', 'REJECT') },
    ],
    pages: {
      REJECT: {
        text: '「拒绝是不被允许的。」\n号角再次响起，这次的声音低沉而危险。',
        choices: (g) => [
          { label: '接受', desc: '担当今天的判决者', page: 'CASE', apply: () => g.eventPage('TRIAL', g.trialCase()) },
          { label: '加倍下注', desc: '你不会活着离开这里', apply: () => g.killPlayer() },
        ],
      },
      MERCHANT: {
        text: '一个商人被带上来。他坚称自己只是「把价格调整到了合理的水平」。',
        choices: (g) => [
          { label: '有罪', desc: '获得「悔恨」，获得2件随机遗物', apply: () => { g.addCardById('REGRET'); g.addRelicRandom(); g.addRelicRandom(); g.eventDone(); } },
          { label: '无罪', desc: '获得「羞耻」，升级2张牌', apply: async () => { g.addCardById('SHAME'); await g.upgradeChoice(2); g.eventDone(); } },
        ],
      },
      NOBLE: {
        text: '一位贵族被带上来。他的领地里饿死了不少人，但他说那都是「必要的牺牲」。',
        choices: (g) => [
          { label: '有罪', desc: '回复10点生命', apply: () => { g.heal(10); g.eventDone(); } },
          { label: '无罪', desc: '获得「悔恨」，获得300金币', apply: () => { g.addCardById('REGRET'); g.gainGold(300); g.eventDone(); } },
        ],
      },
      NONDESCRIPT: {
        text: '一个毫无特点的人被带上来。你甚至想不起他犯了什么事。',
        choices: (g) => [
          { label: '有罪', desc: '获得「疑虑」，获得2次卡牌奖励', apply: async () => { g.addCardById('DOUBT'); await g.cardReward(); await g.cardReward(); g.eventDone(); } },
          { label: '无罪', desc: '获得「疑虑」，随机变化2张牌', apply: () => { g.addCardById('DOUBT'); g.transformRandomN(2); g.eventDone(); } },
        ],
      },
    },
  },
  TINKER_TIME: {
    id: 'TINKER_TIME', title: '打造时间', icon: '🔧',
    text: '你在翻越数不尽的尸山血海之时，遇到了一位正在搜寻破烂的疯狂科学家。\n\n「是的，嗨，你好！你看起来是个有实力的战士……我的下一件暴行装备正需要一个测试员！你觉得怎么样？」',
    choices: (g) => [
      { label: '接受', desc: '制作一张定制卡牌加入你的牌组', page: 'TYPE', apply: () => g.eventPage('TINKER_TIME', 'TYPE') },
    ],
    pages: {
      TYPE: {
        text: '「太好了！那么，你想要什么类型的东西？」',
        choices: (g) => g.tinkerTypes(),
      },
      RIDER: {
        text: '「这个方向我喜欢。具体要哪一种效果？」',
        choices: (g) => g.tinkerRiders(),
      },
    },
  },
};

Object.assign(EVENTS, HIVE_EVENTS, GLORY_EVENTS);

import { UNDERDOCK_EVENTS } from './events-underdocks.js';
import { SHARED_EVENTS } from './events-shared.js';

Object.assign(EVENTS, UNDERDOCK_EVENTS, SHARED_EVENTS);

export const SHARED_EVENT_IDS = Object.keys(SHARED_EVENTS);

/**
 * 第一幕两个变体的事件池：对照 Act1EventPool 与 UnderdocksEventPool。
 * 共享事件池由 ActDefinition.EffectiveEventPool 追加一次（见 ACT_EVENTS / eventPoolFor）。
 */
export const ACT1_EVENT_VARIANTS = {
  OVERGROWTH: ACT1_EVENTS,
  UNDERDOCK: Object.keys(UNDERDOCK_EVENTS),
};

/** 某一幕最终生效的事件池 = 本幕专属池 + 共享池（顺序对照源码各 Pool 的声明顺序） */
export function eventPoolFor(act, act1) {
  const own = act === 1
    ? (ACT1_EVENT_VARIANTS[act1] || ACT1_EVENTS)
    : (act === 2 ? Object.keys(HIVE_EVENTS) : Object.keys(GLORY_EVENTS));
  return [...own, ...SHARED_EVENT_IDS];
}

/** 各幕的事件池（不含第一幕变体，取默认的密林） */
export const ACT_EVENTS = {
  1: eventPoolFor(1, 'OVERGROWTH'),
  2: eventPoolFor(2),
  3: eventPoolFor(3),
};

/** 事件池条目可能只是 id 字符串；这里统一给出定义 */
export function eventDef(id) { return EVENTS[id]; }
