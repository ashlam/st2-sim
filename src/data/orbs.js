/**
 * 充能球元数据 —— 数值取自 sts2-sim Models/Orbs/*.cs（v0.111.0），
 * 名称与说明对照官方 zhs 本地化（localization/zhs/orbs.json）。
 *
 * 机制要点：
 *  - 集中 Focus 加在"球的数值"上（等离子除外），计算结果最低为 0
 *  - 黑暗：被动把伤害累加进它自己的激发值，激发时打生命值最少的敌人
 *  - 玻璃：被动对所有敌人造成伤害，每次触发后自身数值 -1；激发为当前数值的 2 倍
 *  - 等离子：回合开始时给 1 点能量，激发给 2 点能量
 *  - 闪电 / 冰霜 / 黑暗 / 玻璃 的被动都在"你的回合结束时"触发
 */
export const ORBS = {
  LIGHTNING: {
    id: 'LIGHTNING', name: '闪电', icon: '⚡', color: '#f0c14b',
    passive: 3, evoke: 8,
    desc: '充能球：对随机敌人造成伤害。',
    detail: (o, focus) => [
      `被动：回合结束时，对一名随机敌人造成 ${orbVal(3, focus)} 点伤害。`,
      `激发：对一名随机敌人造成 ${orbVal(8, focus)} 点伤害。`,
    ],
  },
  FROST: {
    id: 'FROST', name: '冰霜', icon: '❄', color: '#7fc4e8',
    passive: 2, evoke: 5,
    desc: '充能球：获得格挡。',
    detail: (o, focus) => [
      `被动：回合结束时，获得 ${orbVal(2, focus)} 点格挡。`,
      `激发：获得 ${orbVal(5, focus)} 点格挡。`,
    ],
  },
  DARK: {
    id: 'DARK', name: '黑暗', icon: '🌑', color: '#a98fe0',
    passive: 6, evoke: 6,
    desc: '充能球：激发时，对生命值最少的敌人造成伤害。伤害每回合增加。',
    detail: (o, focus) => [
      `被动：回合结束时，将这个充能球的伤害增加 ${orbVal(6, focus)}。`,
      `激发：对生命值最少的敌人造成 ${o ? o.value : 6} 点伤害。`,
    ],
  },
  PLASMA: {
    id: 'PLASMA', name: '等离子', icon: '🔆', color: '#e58fd0',
    passive: 1, evoke: 2,
    desc: '充能球：获得能量。不受集中影响。',
    detail: () => [
      '被动：回合开始时，获得 1 点能量。',
      '激发：获得 2 点能量。',
      '等离子充能球不受集中影响。',
    ],
  },
  GLASS: {
    id: 'GLASS', name: '玻璃', icon: '🔷', color: '#8fd8d0',
    passive: 4, evoke: null,
    desc: '充能球：对所有敌人造成伤害。伤害每回合减少。',
    detail: (o, focus) => {
      const cur = o ? Math.max(0, o.value + (focus || 0)) : orbVal(4, focus);
      return [
        `被动：回合结束时，对所有敌人造成 ${cur} 点伤害，然后将这个充能球的数值减少 1。`,
        `激发：对所有敌人造成 ${cur * 2} 点伤害。`,
      ];
    },
  },
};

export const ORB_KINDS = Object.keys(ORBS);

/** 集中加成后的一次性数值（最低 0） */
export function orbVal(base, focus) {
  return Math.max(0, base + (focus || 0));
}

/** 造一个充能球实例。value 只有黑暗（累积伤害）和玻璃（当前数值）会用 */
export function makeOrb(kind) {
  const meta = ORBS[kind];
  if (!meta) throw new Error('未知充能球 ' + kind);
  return {
    kind,
    value: kind === 'DARK' ? 6 : kind === 'GLASS' ? 4 : 0,
    get name() { return meta.name; },
    get icon() { return meta.icon; },
  };
}
