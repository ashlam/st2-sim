/** 地图生成 —— 7 列 × 15 行的标准尖塔式分支地图（规则对照原作：无交叉连线、精英/休息不提前出现） */
import { Rng } from './rng.js';

const COLS = 7;
const ROWS = 15;
const PATHS = 6;

export const NODE_TYPES = {
  monster: { icon: '战', name: '战斗' },
  elite: { icon: '精', name: '精英' },
  rest: { icon: '火', name: '休息处' },
  shop: { icon: '商', name: '商店' },
  treasure: { icon: '宝', name: '宝箱' },
  unknown: { icon: '?', name: '未知' },
  boss: { icon: '首', name: '首领' },
};

/**
 * 各幕的目标节点数量（对照 ActDefinition.GetMapPointTypes）：
 *   第一幕 Overgrowth：休息处 NextGaussianInt(7,1,6,7)、未知 NextGaussianInt(12,1,10,14)
 *   第二幕 Hive：      休息处 NextGaussianInt(6,1,6,7)、未知 同上 - 1
 *   第三幕 Glory：     休息处 NextInt(5,7)、未知 同上 - 1
 * 商店恒为 3；精英基础 5，进阶 1「蜂拥精英」×1.6 → 8（MapPointTypeCounts.NumOfElites）。
 */
function countsFor(act, asc, rng) {
  const standardUnknown = () => rng.gaussInt(12, 1, 10, 14);
  let rest, unknown;
  if (act >= 3) {
    rest = rng.range(5, 6);          // NextInt(5, 7) 右开
    unknown = standardUnknown() - 1;
  } else if (act === 2) {
    rest = rng.gaussInt(6, 1, 6, 7);
    unknown = standardUnknown() - 1;
  } else {
    rest = rng.gaussInt(7, 1, 6, 7);
    unknown = standardUnknown();
  }
  return {
    elite: asc >= 1 ? 8 : 5,
    rest,
    shop: 3,
    unknown: Math.max(0, unknown),
  };
}

export function generateMap(seed, asc = 0, act = 1) {
  const rng = new Rng(seed + ':map');
  let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const nodes = [];
  let idc = 0;

  const nodeAt = (row, col) => {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    if (!grid[row][col]) {
      grid[row][col] = { id: 'n' + (idc++), row, col, type: 'unknown', children: [], parents: [], visited: false };
      nodes.push(grid[row][col]);
    }
    return grid[row][col];
  };

  const crosses = (r, c1, c2) => {
    // 检查 (r,c1)->(r+1,c2) 是否与已有边交叉
    const [lo, hi] = c1 < c2 ? [c1, c2] : [c2, c1];
    if (hi - lo !== 1) return false;
    const a = grid[r][hi], b = grid[r + 1][lo];
    if (a && b && a.children.includes(b)) return true;
    return false;
  };

  // 生成若干条随机路径
  for (let p = 0; p < PATHS; p++) {
    let col = rng.int(COLS);
    let cur = nodeAt(0, col);
    for (let row = 0; row < ROWS - 1; row++) {
      const candidates = [col - 1, col, col + 1].filter(c => c >= 0 && c < COLS);
      let picks = candidates.filter(c => !crosses(row, col, c));
      if (!picks.length) picks = [col];
      const nc = rng.pick(picks);
      const next = nodeAt(row + 1, nc);
      if (!cur.children.includes(next)) cur.children.push(next);
      if (!next.parents.includes(cur)) next.parents.push(cur);
      cur = next;
      col = nc;
    }
  }

  // 起点（第一行）必定连通
  const startNodes = nodes.filter(n => n.row === 0);
  const bossNode = { id: 'boss', row: ROWS, col: 3, type: 'boss', children: [], parents: [], visited: false };
  for (const n of nodes.filter(n => n.row === ROWS - 1)) n.children.push(bossNode);
  nodes.push(bossNode);

  // 类型分配
  for (const n of nodes) {
    if (n.row === 0) n.type = 'monster';
  }
  // 宝箱行固定（对照 StandardActMap：第 rowCount-7 行），最后一行为休息处
  const treasureRow = 8;
  const interior = nodes.filter(n => n.row > 0 && n.row < ROWS - 1);
  for (const n of interior) if (n.row === treasureRow) n.type = 'treasure';
  for (const n of nodes) if (n.row === ROWS - 1) n.type = 'rest';

  const assignable = (n) => n.type === 'unknown';
  const sameTypeInPath = (n, type) => {
    // 相邻父子或兄弟节点不允许同类型（休息/商店/精英）
    const neighbours = [...n.parents, ...n.children];
    return neighbours.some(m => m.type === type);
  };

  const pickNodes = (type, count, minRow) => {
    const pool = interior.filter(n => assignable(n) && n.row >= minRow && n.row !== treasureRow && !sameTypeInPath(n, type));
    const picked = rng.shuffle(pool).slice(0, count);
    picked.forEach(n => { n.type = type; });
    return picked;
  };

  const counts = countsFor(act, asc, rng);
  pickNodes('elite', counts.elite, 5);
  pickNodes('rest', counts.rest, 4);
  pickNodes('shop', counts.shop, 4);

  // 其余为战斗，再随机挑一部分变成“未知”
  const restPool = interior.filter(n => n.type === 'unknown' && n.row !== treasureRow);
  restPool.forEach(n => { n.type = 'monster'; });
  rng.shuffle(restPool).slice(0, counts.unknown).forEach(n => { n.type = 'unknown'; });

  return { nodes, startNodes, bossNode, rows: ROWS, cols: COLS };
}

/** 从当前节点可达的下一批节点 */
export function reachable(map, curNode) {
  if (!curNode) return map.startNodes;
  return curNode.children || [];
}
