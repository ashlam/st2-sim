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

export function generateMap(seed, asc = 0) {
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
  // 宝箱行固定
  const treasureRow = 8;
  const interior = nodes.filter(n => n.row > 0 && n.row < ROWS - 1);
  for (const n of interior) if (n.row === treasureRow) n.type = 'treasure';

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

  pickNodes('elite', asc >= 1 ? 4 : 3, 5);
  pickNodes('rest', 7, 4);
  pickNodes('shop', 3, 4);

  // 其余为战斗，再随机挑一部分变成“未知”
  const restPool = interior.filter(n => n.type === 'unknown' && n.row !== treasureRow);
  restPool.forEach(n => { n.type = 'monster'; });
  rng.shuffle(restPool).slice(0, 11).forEach(n => { n.type = 'unknown'; });

  return { nodes, startNodes, bossNode, rows: ROWS, cols: COLS };
}

/** 从当前节点可达的下一批节点 */
export function reachable(map, curNode) {
  if (!curNode) return map.startNodes;
  return curNode.children || [];
}
