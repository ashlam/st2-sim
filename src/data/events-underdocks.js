/**
 * 海底（Underdocks）幕专属事件。
 * 文本对照官方 zhs 本地化 events.json，效果与数值对照 sts2-sim 的 Models/Events/*.cs。
 */

/** 无尽传送带：菜品与权重对照 EndlessConveyor.RollDish */
export const CONVEYOR_DISHES = {
  CAVIAR: '鱼子酱',
  CLAM_ROLL: '蚌肉卷',
  FRIED_EEL: '炸鳗鱼',
  GOLDEN_FYSH: '金色异鱼',
  JELLY_LIVER: '水母肝',
  SEAPUNK_SALAD: '海洋混混沙拉',
  SPICY_SNAPPY: '香辣薄脆',
  SUSPICIOUS_CONDIMENT: '可疑调味料',
};

/** 「被遗忘的旧日」牌池（TrashHeap.CardPool） */
export const FORGOTTEN_CARDS = [
  'CALTROPS', 'CLASH', 'DISTRACTION', 'DUAL_WIELD', 'ENTRENCH',
  'HELLO_WORLD', 'OUTMANEUVER', 'REBOUND', 'RIP_AND_TEAR', 'STACK',
];

export const UNDERDOCK_EVENTS = {
  ABYSSAL_BATHS: {
    id: 'ABYSSAL_BATHS', title: '深渊浴场', icon: '🛁',
    text: '你发现了一间僻静的密室。\n\n氤氲的雾气从沸腾的池水中升腾而起，池水的色泽正以一种催眠般的节奏变幻。天花板上垂挂着覆满藤壶的异形生长物，滴落的粘稠液体在触及水面的瞬间，一边发出嘶嘶声，一边如活物般扭动挣扎。空气粘滞沉重，充斥着盐的味道和某种不言而喻的活物的气息。\n\n当你靠近那口最大的水池时，液面泛起了涟漪。水流翻腾得愈发狂乱，仿佛正期待着你的到来。',
    choices: (g) => {
      const st = g.evState({ damage: 3, lingered: 0 });
      return [
        {
          label: '投身其中', desc: `获得2点最大生命值。受到${st.damage}点伤害。`,
          page: 'IMMERSE', apply: () => g.bathImmerse(),
        },
        { label: '敬而远之', desc: '回复10点生命。', apply: () => { g.heal(10); g.eventDone(); } },
      ];
    },
    pages: {
      IMMERSE: {
        text: (g) => {
          const st = g.evState();
          if (st.lingered <= 0) {
            return '池水如烈焰般灼烧着你的每一寸肌肤，那竟是彻骨严寒与沸腾炽热的诡异交织。\n\n在水面之下，好像有什么东西掠过了你的双腿——是某种触须？还是带有意志的暗流？然而，当剧痛渐渐平息，你感到身体变得…更加凝实，更具质感。同时池水此时似乎正发出一阵满意的低鸣。';
          }
          const texts = [
            '温度仍在疯狂攀升！\n\n在这股蒸汽将你由内而外彻底蒸熟之前，你还能支撑多久？',
            '祂的温度仍在飙升！\n\n池子的咕嘟声，此刻听来竟像是某种狞笑。',
            '好烫！！！\n\n你开始好奇这是否就是生活在恶魔之村里的感觉？',
            '你浸泡了太久，已经忘却了时间的流逝，意识也开始模糊…',
            '这里很好。',
            '真的很棒。',
            '你感到舒适',
            '唔…',
            '呼...\n...呼噜...',
          ];
          return texts[Math.min(st.lingered, texts.length) - 1];
        },
        choices: (g) => {
          const st = g.evState();
          return [
            {
              label: '沉溺', desc: `获得2点最大生命值。受到${st.damage}点伤害。`,
              page: 'IMMERSE', apply: () => g.bathImmerse(),
            },
            { label: '离开浴场', desc: '你最终还是没能承受住这股灼热感，急忙从池中抽身而出。', apply: () => g.eventDone() },
          ];
        },
      },
    },
  },

  DROWNING_BEACON: {
    id: 'DROWNING_BEACON', title: '淹水灯塔', icon: '🗼',
    text: '穿过一片由岩石与静水构成的梦幻之境，你来到了一座散发着逆流光的沉没灯塔前。\n\n你可以把积聚在此的诡异发光水装进瓶子里，或者爬上这座破败的建筑，取下其中的透镜。',
    choices: (g) => [
      {
        label: '装瓶', desc: '获得一瓶发光水。',
        apply: () => { g.addPotionById('GLOWWATER_POTION'); g.eventDone(); },
      },
      {
        label: '攀爬', desc: '获得菲涅耳透镜。失去13点最大生命。',
        apply: () => { g.loseMaxHp(13); g.addRelicById('FRESNEL_LENS'); g.eventDone(); },
      },
    ],
  },

  ENDLESS_CONVEYOR: {
    id: 'ENDLESS_CONVEYOR', title: '无尽传送带', icon: '🍽️',
    allowed: (g) => g.run.gold >= 120,
    text: '你走进一间挂着歪斜招牌的小木屋，招牌亮得发晃，上面写着：\n「无尽盛宴—按饿付费！」\n\n屋里，一位身形修长的多臂大厨正熟练地准备着一份份小食，并将它们摆在一条蜿蜒的几丁质传送带上。\n\n大厨其中的一只手臂指向一块牌子：\n每份40金币',
    choices: (g) => {
      g.evState({ grabs: 0, lastDish: '', lastDishShown: '', atFirst: true });
      g.rollConveyorDish();
      return g.conveyorChoices();
    },
    pages: {
      GRAB: {
        text: (g) => {
          const st = g.evState();
          return `你从传送带上拿了盘${CONVEYOR_DISHES[st.lastDishShown] || ''}转眼间就吃完了。\n好吃！`;
        },
        choices: (g) => g.conveyorChoices(),
      },
      LEAVE: {
        text: '既然已经吃饱喝足了，那就继续上路吧。',
        choices: (g) => [{ label: '离开', desc: '', apply: () => g.eventDone() }],
      },
      OBSERVE_CHEF: {
        text: '你没去座位上，而是躲在店门口的阴影中观察。\n\n主厨面不改色，手里的活儿一点没停。通过观察这份从容与专注，你学会了如何在战斗中摒除多余的动作和情绪波动。',
        choices: (g) => [
          { label: '离开', desc: '随机升级一张牌。', apply: () => { g.upgradeRandomN(1); g.eventDone(); } },
        ],
      },
    },
  },

  PUNCH_OFF: {
    id: 'PUNCH_OFF', title: '重拳出击', icon: '👊',
    allowed: (g) => g.run.floor >= 6,
    text: '两个拳击构装体正在挥拳互殴，而你看到在它们两个之间有一些财宝……\n\n要不要把财宝顺走？',
    choices: (g) => [
      {
        label: '顺走', desc: '将一张受伤加入你的牌组。获得一件随机遗物。',
        apply: () => {
          g.addCardById('INJURY');
          g.addRelicRandom();
          g.eventDone();
        },
      },
      {
        label: '我能打两个', desc: '和它们战斗以得到更好的奖励。', combat: true,
        apply: () => g.eventCombat('PUNCH_OFF_FIGHT', ['PUNCH_CONSTRUCT', 'PUNCH_CONSTRUCT'], (won) => {
          if (won) { g.addRelicRandom(); g.addPotionRandom(); }
          g.eventDone();
        }),
      },
    ],
  },

  SPIRALING_WHIRLPOOL: {
    id: 'SPIRALING_WHIRLPOOL', title: '螺旋漩涡', icon: '🌀',
    allowed: (g) => g.run.deck.some(d => isBasicStrikeOrDefend(d.id)),
    text: '你偶遇了一个巨大的螺旋漩涡。水流以精准而优雅的韵律回旋着，四周的墙壁也布满了螺旋纹路。\n\n转啊，转啊…转…\n…转个不停…何等奇景…\n\n你要做什么呢？？',
    choices: (g) => {
      const heal = Math.floor(g.run.maxHp * 0.33);
      return [
        {
          label: '观察', desc: '为一张「打击」或「防御」附魔：涡旋。',
          apply: async () => {
            await g.enchantChoice('SPIRAL', (def) => !!def && def.rarity === 'basic'
              && (def.tags || []).some(t => t === 'strike' || t === 'defend'));
            g.eventDone();
          },
        },
        { label: '饮用', desc: `回复${heal}点生命。`, apply: () => { g.heal(heal); g.eventDone(); } },
      ];
    },
  },

  SUNKEN_STATUE: {
    id: 'SUNKEN_STATUE', title: '沉没雕像', icon: '🗿',
    text: '你看见一尊古老的雕像，一半沉没在池塘的水中。雕像的手放在一把石剑之上。\n\n同时你还看见，池塘的水底似乎有一些东西在闪烁着光芒。\n或许是人们祈愿投下的金币？\n\n钱可是个好东西……',
    choices: (g) => {
      const gold = 111 + g.run.rng.range(-10, 11);
      return [
        { label: '拿起石剑', desc: '获得石之剑。', apply: () => { g.addRelicById('SWORD_OF_STONE'); g.eventDone(); } },
        {
          label: '潜水', desc: `获得${gold}金币。失去7点生命。`,
          apply: () => { g.gainGold(gold); g.damage(7); g.eventDone(); },
        },
      ];
    },
  },

  SUNKEN_TREASURY: {
    id: 'SUNKEN_TREASURY', title: '淹水金库', icon: '💰',
    text: '一条小路让你找到了一个部分淹水的金库。\n你看到里面有2个箱子，但却只有1把脆弱的钥匙。\n\n第一个箱子：你摇晃了一下，能听到叮铃哐啷的轻响，应该是少量金币。\n第二个箱子：巨大、精致、而且显然被诅咒了。里面有很多金币！',
    choices: (g) => {
      const small = 60 + g.run.rng.range(-8, 9);
      const large = 333 + g.run.rng.range(-30, 31);
      return [
        { label: '第一个箱子', desc: `获得${small}金币。`, apply: () => { g.gainGold(small); g.eventDone(); } },
        {
          label: '第二个箱子', desc: `获得${large}金币。得到贪婪。`,
          apply: () => { g.gainGold(large); g.addCardById('GREED'); g.eventDone(); },
        },
      ];
    },
  },

  DOORS_OF_LIGHT_AND_DARK: {
    id: 'DOORS_OF_LIGHT_AND_DARK', title: '光与暗的门扉', icon: '🚪',
    text: '一道门扉突然凭空出现了…\n\n你步入其中，见到了两道散发着微光的门，以及一位衣着得体的看门人。\n「终于有访客了！请，请！选一扇门，任何一扇都可以！」\n\n我们还在尖塔里吗？这地方为何竟如此洁净？',
    choices: (g) => [
      { label: '光之门', desc: '随机升级2张牌。', apply: () => { g.upgradeRandomN(2); g.eventDone(); } },
      { label: '暗之门', desc: '从你的牌组中选择1张牌移除。', apply: async () => { await g.removeCards(1); g.eventDone(); } },
    ],
  },

  TRASH_HEAP: {
    id: 'TRASH_HEAP', title: '垃圾堆', icon: '🗑️',
    allowed: (g) => g.run.hp > 5,
    text: '你发现了一座如山般堆积的垃圾，里面有着废旧武器、遗弃饰品和众多其他古怪玩意儿。垃圾堆摇摆晃动着，仿佛正在从内部不断生长变大……\n\n如果你从表面搜索，应该能找到一些好东西。但如果你努努力扎进垃圾堆里面，那就能找到一些奇珍异宝。',
    choices: (g) => [
      {
        label: '扎进垃圾堆', desc: '失去8点生命。获得一件被遗忘的旧日遗物。',
        apply: () => {
          g.damage(8);
          g.addRelicById(g.run.rng.pick(['DARKSTONE_PERIAPT', 'DREAM_CATCHER', 'HAND_DRILL', 'MAW_BANK', 'THE_BOOT']));
          g.eventDone();
        },
      },
      {
        label: '随便拿点垃圾', desc: '获得100金币。获得一张被遗忘的旧日卡牌。',
        apply: () => {
          g.gainGold(100);
          g.addCardById(g.run.rng.pick(FORGOTTEN_CARDS));
          g.eventDone();
        },
      },
    ],
  },

  WATERLOGGED_SCRIPTORIUM: {
    id: 'WATERLOGGED_SCRIPTORIUM', title: '水漫缮写室', icon: '🖋️',
    allowed: (g) => g.run.gold >= 55,
    text: '在昏暗的通道中前行时，你找到了一个小店，里面有一个憔悴的员工。四周的书架上塞满了无数潮湿的卷轴与羊皮纸。\n\n抄写员兼店主注意到有客人进店，猛地回过神来，为你指了指书桌上摆放着的一些器具。',
    choices: (g) => {
      const gold = g.run.gold;
      return [
        { label: '血液墨水', desc: '获得6点最大生命。', apply: () => { g.gainMaxHp(6); g.eventDone(); } },
        {
          label: '触手羽毛笔', desc: gold >= 55 ? '支付55金币。给一张牌附魔：稳定。' : '需要55金币。',
          disabled: gold < 55,
          apply: async () => { g.gainGold(-55); await g.enchantChoice('STEADY'); g.eventDone(); },
        },
        {
          label: '扎手海绵', desc: gold >= 99 ? '支付99金币。给2张牌附魔：稳定。' : '需要99金币。',
          disabled: gold < 99,
          apply: async () => {
            g.gainGold(-99);
            await g.enchantChoice('STEADY');
            await g.enchantChoice('STEADY');
            g.eventDone();
          },
        },
      ];
    },
  },
};

/** 只有基础打击/防御才能被「涡旋」附魔（对照 Spiral.CanEnchant） */
export function isBasicStrikeOrDefend(id) {
  const basic = {
    STRIKE_IRONCLAD: 1, DEFEND_IRONCLAD: 1, STRIKE_SILENT: 1, DEFEND_SILENT: 1,
    STRIKE_DEFECT: 1, DEFEND_DEFECT: 1, STRIKE_NECROBINDER: 1, DEFEND_NECROBINDER: 1,
    STRIKE_REGENT: 1, DEFEND_REGENT: 1,
  };
  return !!basic[id];
}

/** 海底幕事件池（顺序对照 UnderdocksEventPool.All） */
export const UNDERDOCK_EVENT_IDS = Object.keys(UNDERDOCK_EVENTS);
