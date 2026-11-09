// 随机数与种子 —— 与游戏一致的使用方式：一局一个种子，派生多条随机流
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class Rng {
  constructor(seed) {
    const s = typeof seed === 'number' ? seed : hashSeed(String(seed))();
    this.state = s >>> 0;
    this.seed = seed;
  }
  next() {
    // mulberry32
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(max) { return Math.floor(this.next() * max); }
  range(min, max) { return min + this.int(max - min + 1); }
  /** 正态分布取整并夹在 [lo, hi]（对照原作 Rng.NextGaussianInt 的拒绝采样，用于各幕休息处数量） */
  gaussInt(mean, sd, lo, hi) {
    for (let i = 0; i < 200; i++) {
      const u = this.next() || 1e-9;
      const v = this.next();
      const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      const r = Math.round(mean + n * sd);
      if (r >= lo && r <= hi) return r;
    }
    return Math.min(hi, Math.max(lo, Math.round(mean)));
  }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  pickMany(arr, n) { return this.shuffle(arr).slice(0, n); }
  fork(label) { return new Rng(String(this.seed) + ':' + label); }
}

let uidCounter = 1;
export function uid(prefix = 'c') { return prefix + (uidCounter++); }
