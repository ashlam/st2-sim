/** 第一幕事件（“?”房间）—— 名称取自原作事件池，效果按简化版实现 */
export const EVENTS = {
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

export const ACT1_EVENTS = Object.keys(EVENTS);
