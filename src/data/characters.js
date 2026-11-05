/**
 * 角色表。名称与介绍取自官方中文本地化（localization/zhs/characters.json），
 * 初始生命/起始遗物取自 sts2-sim 的 Models/Characters/*.cs（v0.111.0）。
 *
 * playable: false 的角色只展示、不可选 —— 他们的卡池与专属机制还没移植。
 */
export const CHARACTERS = [
  {
    id: 'IRONCLAD',
    name: '铁甲战士',
    en: 'Ironclad',
    avatar: '🗡️',
    hp: 80,
    energy: 3,
    gold: 99,
    relic: 'BURNING_BLOOD',
    relicName: '燃烧之血',
    deck: [
      'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD',
      'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD',
      'BASH',
    ],
    desc: '铁甲军团最后的士兵。\n并非出自自身的意愿，用刀剑与烈焰击溃敌人们。',
    playable: true,
    accent: '#c4553f',
  },
  {
    id: 'SILENT',
    name: '静默猎手',
    en: 'Silent',
    avatar: '🔪',
    hp: 70,
    energy: 3,
    gold: 99,
    relic: 'RING_OF_THE_SNAKE',
    relicName: '蛇之戒指',
    deck: [
      'STRIKE_SILENT', 'STRIKE_SILENT', 'STRIKE_SILENT', 'STRIKE_SILENT', 'STRIKE_SILENT',
      'DEFEND_SILENT', 'DEFEND_SILENT', 'DEFEND_SILENT', 'DEFEND_SILENT', 'DEFEND_SILENT',
      'NEUTRALIZE', 'SURVIVOR',
    ],
    desc: '一位来自尖塔之外的女猎手。\n随时准备刀刺与毒杀任何拦路者。',
    playable: true,
    accent: '#4f9d7a',
  },
  {
    id: 'DEFECT',
    name: '故障机器人',
    en: 'Defect',
    avatar: '🤖',
    hp: 75,
    energy: 3,
    gold: 99,
    orbSlots: 3,
    relic: 'CRACKED_CORE',
    relicName: '破损核心',
    deck: [
      'STRIKE_DEFECT', 'STRIKE_DEFECT', 'STRIKE_DEFECT', 'STRIKE_DEFECT',
      'DEFEND_DEFECT', 'DEFEND_DEFECT', 'DEFEND_DEFECT', 'DEFEND_DEFECT',
      'ZAP', 'DUALCAST',
    ],
    desc: '一具不停改造自己来生存下去的自动机械。\n在不得不战斗时，它会使用充能球科技来作战。',
    playable: true,
    accent: '#4a86c4',
  },
  {
    id: 'REGENT',
    name: '储君',
    en: 'Regent',
    avatar: '👑',
    hp: 75,
    energy: 3,
    gold: 99,
    relic: 'DIVINE_RIGHT',
    relicName: '天赋君权',
    deck: [
      'STRIKE_REGENT', 'STRIKE_REGENT', 'STRIKE_REGENT', 'STRIKE_REGENT',
      'DEFEND_REGENT', 'DEFEND_REGENT', 'DEFEND_REGENT', 'DEFEND_REGENT',
      'FALLING_STAR', 'VENERATE',
    ],
    desc: '群星王座的继承人。\n拥有宇宙的力量，但总是让他的仆从们去做各种事情。',
    playable: true,
    accent: '#b08a3e',
  },
  {
    id: 'NECROBINDER',
    name: '亡灵契约师',
    en: 'Necrobinder',
    avatar: '💀',
    hp: 66,
    energy: 3,
    gold: 99,
    relic: 'BOUND_PHYLACTERY',
    relicName: '缚魂命匣',
    deck: [],
    desc: '一位出生在尖塔的巫妖，正在寻求复仇。\n战斗中会召唤她可靠的左手奥斯提。',
    playable: false,
    accent: '#7a5aa8',
  },
];

export const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));

export function getCharacter(id) {
  return CHARACTER_BY_ID[id] || CHARACTER_BY_ID.IRONCLAD;
}
