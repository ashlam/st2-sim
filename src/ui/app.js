/** 应用外壳：屏幕路由 + 全部界面渲染 */
import { Combat, ENCHANTS } from '../engine/combat.js';
import { Run } from '../engine/run.js';
import { NODE_TYPES, reachable } from '../engine/map.js';
import { CARDS, makeCard } from '../data/cards.js';
import { RELICS, POTIONS } from '../data/items.js';
import { ENEMIES, ENCOUNTERS } from '../data/enemies.js';
import { POWERS } from '../data/powers.js';
import { ORBS } from '../data/orbs.js';
import { EVENTS } from '../data/events.js';
import { ANCIENTS } from '../data/ancients.js';
import { FORGOTTEN_CARDS } from '../data/events-underdocks.js';
import { RELIC_TRADABLE } from '../data/events-shared.js';
import { CHARACTERS, CHARACTER_BY_ID } from '../data/characters.js';
import { TERMS } from '../data/glossary.js';
import { linkify, intentLabel, describeMove } from './inspect.js';

const $ = (sel, root = document) => root.querySelector(sel);
const SAVE_KEY = 'sts2sim.run.v1';
const ENCHANT_NAMES = Object.fromEntries(Object.entries(ENCHANTS).map(([k, v]) => [k, v.name]));

/** 三幕：索引 1..3，名称取自官方 zhs 本地化 acts.json */
const ACT_INFO = {
  1: { label: '第一幕', name: '密林', icon: '🌿', variant: 'OVERGROWTH' },
  2: { label: '第二幕', name: '巢穴', icon: '🐝' },
  3: { label: '第三幕', name: '荣耀', icon: '🏛️' },
};
/** 第一幕的两个变体（ActDefinition.GetRandomList 的第一组） */
const ACT1_INFO = {
  OVERGROWTH: { label: '第一幕', name: '密林', icon: '🌿' },
  UNDERDOCK: { label: '第一幕', name: '暗港', icon: '🌊' },
};
const LAST_ACT = 3;

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * 把数据里的官方标记换成 HTML。**输入必须是已转义文本**（或 linkify 的产物），
 * 因为 [gold] 这类方括号不会被 esc 转义，可以在转义后安全替换。
 * 对照原作本地化：gold 高亮 / red 负面 / purple 附魔与先古 / b 强调 / sine 灵语。
 */
function markup(html) {
  return String(html)
    .replace(/\[gold\]/g, '<span class="kw">').replace(/\[\/gold\]/g, '</span>')
    .replace(/\[red\]/g, '<span class="neg">').replace(/\[\/red\]/g, '</span>')
    .replace(/\[purple\]/g, '<span class="arc">').replace(/\[\/purple\]/g, '</span>')
    .replace(/\[b\]/g, '<b>').replace(/\[\/b\]/g, '</b>')
    .replace(/\[i\]/g, '<i>').replace(/\[\/i\]/g, '</i>')
    .replace(/\[sine\]/g, '<span class="sine">').replace(/\[\/sine\]/g, '</span>');
}

/** 纯文本（未转义）→ HTML：转义 + 标记 + 换行 */
function rich(s) { return markup(esc(s)).replace(/\n/g, '<br>'); }

/** 已带链接的 HTML → 只补标记，不再转义 */
function richLinked(s) { return markup(linkify(s)); }

/** 卡牌文本渲染：{Var} 替换数值，[gold]..[/gold] 高亮，opts.link 时牌名/状态名变成可点关键词 */
function fmtText(def, card, combat, opts = {}) {
  let text = def.textFn ? def.textFn(card) : def.text;
  let vars = {};
  try { vars = def.vars ? def.vars(card, combat, card) : {}; } catch (e) { vars = {}; }
  // 数值先换占位符，等 linkify 转义/加链接后再填回去，否则 <b> 会被当成普通文本转义掉
  const PH = '\u0001';
  text = String(text).replace(/\{([A-Za-z]+)\}/g, (m, k) => (vars[k] != null ? `${PH}${k}${PH}` : ''));
  let html = opts.link ? linkify(text) : esc(text);
  html = html.replace(/\u0001([A-Za-z]+)\u0001/g, (m, k) => `<b class="num">${vars[k]}</b>`);
  html = markup(html);
  return html.replace(/\n/g, '<br>');
}

function cardHTML(card, opts = {}) {
  const def = CARDS[card.id] || card.def;
  const cost = opts.combat ? opts.combat.costOf(card) : card.cost;
  const typeLabel = { attack: '攻击', skill: '技能', power: '能力', status: '状态', curse: '诅咒', quest: '任务' }[card.type] || '';
  const glyph = { attack: '⚔', skill: '✧', power: '✦', status: '◇', curse: '✖', quest: '🗝' }[card.type] || '✧';
  const disabled = opts.disabled ? ' disabled' : '';
  const sel = opts.selected ? ' selected' : '';
  const up = card.upgraded ? ' upgraded' : '';
  // 星愿费用（储君第二资源）：X 星费牌面固定显示 X，战斗里显示实际数值用星愿 HUD
  const rawStars = card.stars ?? 0;
  const starView = rawStars === 'X' ? 'X' : (opts.combat ? opts.combat.starCostOf(card) : rawStars);
  const starBadge = (rawStars && rawStars !== 0)
    ? `<div class="card-stars">✦${starView}</div>` : '';
  return `<div class="card ${card.type}${up}${disabled}${sel}" data-uid="${card.uid}" data-card="1" data-card-id="${card.id}" data-card-up="${card.upgraded ? 1 : 0}">
    <div class="card-cost${cost === 0 ? ' free' : ''}${typeof cost === 'number' && cost < 0 ? ' none' : ''}">${cost === 'X' ? 'X' : (typeof cost === 'number' && cost < 0 ? '—' : cost)}</div>
    ${starBadge}
    <div class="card-name">${esc(card.name)}${card.upgraded ? '+' : ''}</div>
    <div class="card-text">${fmtText(def, card, opts.combat, { link: !!opts.link })}</div>
    <div class="card-type">${typeLabel}</div>
  </div>`;
}

function relicSlot(id) {
  if (!id) return '<div class="relic empty">·</div>';
  const r = RELICS[id] || { icon: '?', name: id };
  return `<div class="relic" data-relic="${id}" title="${esc(r.name)}">${r.icon}</div>`;
}

/** 状态图标：owner 传 'player' 或敌人 uid，点开时能读到当前层数 */
function powHTML(powers, owner = '') {
  // 只画有元数据的状态：引擎内部用的临时标记（如 phantomReady / strengthLoss）不露给玩家
  const keys = Object.keys(powers || {}).filter(k => POWERS[k] && powers[k] != null && powers[k] !== 0);
  return keys.map(k => {
    const meta = POWERS[k];
    const own = owner ? ` data-kw-owner="${esc(owner)}"` : '';
    return `<span class="pw ${meta.type}" data-kw-kind="power" data-kw-id="${k}"${own}>${meta.name}<b>${powers[k]}</b></span>`;
  }).join('');
}

/** 奥斯提栏：只在它出现过之后显示，倒下后留场并置灰 */
function ostyRow(combat) {
  const n = combat.necro;
  if (!n || !n.osty.exists) return '';
  const o = n.osty;
  const alive = n.ostyAlive;
  const pct = o.maxHp > 0 ? Math.max(0, (o.hp / o.maxHp) * 100) : 0;
  return `<div class="osty-row ${alive ? '' : 'dead'}" data-kw-kind="term" data-kw-id="osty">
    <div class="osty-icon">${alive ? '🦴' : '💀'}</div>
    <div class="osty-body">
      <div class="osty-top">
        <span class="osty-name">奥斯提${alive ? '' : ' · 已倒下'}</span>
        <span class="osty-hp">${Math.max(0, o.hp)} / ${o.maxHp}</span>
      </div>
      <div class="hpbar thin osty-bar"><i style="width:${pct}%"></i></div>
    </div>
  </div>`;
}

/** 充能球栏位：有球的显示图标（黑暗/玻璃带数值），空栏位画个圈 */
function orbRow(combat) {
  const slots = combat.maxOrbSlots || 0;
  if (!slots) return '';
  const orbs = combat.player.orbs || [];
  let html = '';
  for (let i = 0; i < slots; i++) {
    const orb = orbs[i];
    if (!orb) { html += '<div class="orb empty" data-kw-kind="term" data-kw-id="orbSlot"></div>'; continue; }
    const meta = ORBS[orb.kind];
    let num = '';
    if (orb.kind === 'DARK') num = `<b>${orb.value}</b>`;
    else if (orb.kind === 'GLASS') num = `<b>${combat.orbValue(orb, orb.value) * 2}</b>`;
    html += `<div class="orb ${orb.kind.toLowerCase()}" data-kw-kind="orb" data-kw-id="${i}" title="${esc(meta.name)}">${meta.icon}${num}</div>`;
  }
  return `<div class="orb-row">${html}</div>`;
}

export class App {
  constructor(root) {
    this.root = $('#screen-root');
    this.fx = $('#fx-layer');
    this.toastLayer = $('#toast-layer');
    this.overlay = $('#overlay-layer');
    this.run = null;
    this.combat = null;
    this.selectedCard = null;
    this.pendingPotion = null;
    this.battleLogs = [];          // 本局每场战斗的日志（只在内存里，供战报翻记录）
    this.screen = 'title';
    // 全局接管「关键词」点击：牌名、状态名、敌人名、遗物名、机制词
    // 放在捕获阶段，避免点击落在卡牌/敌人身上时又被出牌逻辑吃掉
    document.addEventListener('click', (ev) => {
      // 长按看牌松手后紧跟的那次 click 要吞掉，否则会顺手把牌打出去 / 选中
      if (this.swallowClick && Date.now() < (this.suppressClickUntil || 0)) {
        this.swallowClick = false;
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const kw = ev.target.closest && ev.target.closest('[data-kw-kind]');
      if (!kw) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.showKw(kw.dataset.kwKind, kw.dataset.kwId, kw.dataset.kwOwner, kw.dataset.kwStack);
    }, true);
    this.initLongPress();
    this.showTitle();
  }

  /* ================= 长按看牌 ================= */
  /**
   * 长按任意卡面（手牌 / 卡牌奖励 / 商店卡牌 / 牌堆）弹出详情，松手不会触发出牌或选中。
   * 短按行为完全不变：手牌出牌、奖励选中、商店开购买确认。
   * 战斗里的药水同理：短按使用，长按只看说明——药水是不可逆的消耗品，
   * 手指一抖就用掉太亏。
   */
  initLongPress() {
    const LONG_MS = 400;
    let timer = null, origin = null, longFired = false;

    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } origin = null; };

    document.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      const closest = ev.target.closest && ev.target.closest.bind(ev.target);
      if (!closest) return;
      const potEl = closest('[data-potion]');
      const cardEl = potEl ? null : closest('[data-card], [data-buy-card]');
      const el = potEl || cardEl;
      if (!el) return;
      // 已经在详情层里的卡面不用再长按
      if (el.closest('.kw-pop')) return;
      origin = { x: ev.clientX, y: ev.clientY };
      longFired = false;
      timer = setTimeout(() => {
        timer = null;
        longFired = true;
        if (potEl) this.peekPotion(+potEl.dataset.potion);
        else this.peekCard(el);
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
      }, LONG_MS);
    }, true);

    // 手指划动（滚动手牌 / 翻列表）不算长按
    document.addEventListener('pointermove', (ev) => {
      if (!timer || !origin) return;
      if (Math.abs(ev.clientX - origin.x) > 12 || Math.abs(ev.clientY - origin.y) > 12) {
        clearTimeout(timer);
        timer = null;
        origin = null;
      }
    }, true);

    document.addEventListener('pointerup', () => {
      if (longFired) {
        // 只吞掉长按松手带出来的这一下 click，之后正常点击不受影响
        this.swallowClick = true;
        this.suppressClickUntil = Date.now() + 700;
        longFired = false;
      }
      clear();
    }, true);

    document.addEventListener('pointercancel', () => { longFired = false; clear(); }, true);
  }

  /** 长按药水：只看说明，不用掉 */
  peekPotion(i) {
    const id = this.run?.potions?.[i];
    if (!id) return;
    this.showPotionInfo(id);
  }

  /** 长按某个卡面：优先用战斗里的实际牌（数值是当前生效的），否则退回牌面本身 */
  peekCard(el) {
    const buyRow = el.closest('[data-buy-card]');
    if (buyRow) {
      const item = this.shopStock?.cards?.[+buyRow.dataset.buyCard];
      if (item && !item.sold) return this.showCardInfo(item.id, { upgraded: item.upgraded });
      return;
    }
    const cardEl = el.closest('[data-card]');
    if (!cardEl) return;
    const uid = cardEl.dataset.uid;
    const c = this.combat;
    const live = c && uid
      ? [...(c.hand || []), ...(c.drawPile || []), ...(c.discardPile || [])].find(x => x.uid === uid)
      : null;
    if (live) return this.showCardInfo(live.id, { card: live, combat: c });
    if (cardEl.dataset.cardId) {
      return this.showCardInfo(cardEl.dataset.cardId, { upgraded: cardEl.dataset.cardUp === '1' });
    }
  }

  /* ================= 通用 ================= */
  toast(text, ms = 1400) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastLayer.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  setOverlay(html) {
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = html;
  }
  clearOverlay() {
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
  }

  save() {
    if (!this.run) return;
    try { localStorage.setItem(SAVE_KEY, this.run.serialize()); } catch (e) {}
  }
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? Run.deserialize(raw) : null;
    } catch (e) { return null; }
  }
  clearSave() { localStorage.removeItem(SAVE_KEY); }

  /* ================= 标题页 ================= */
  showTitle() {
    this.screen = 'title';
    const save = this.loadSave();
    this.root.innerHTML = `
      <div class="screen title-screen">
        <div class="title-mark">SLAY THE SPIRE II · SIMPLIFIED</div>
        <div class="title-main">尖塔之下</div>
        <div class="title-sub">杀戮尖塔 2 · 简化复刻版</div>
        <div class="title-menu">
          ${save ? `<button class="btn primary" data-act="continue">继续攀登 · 第${save.floor}层</button>` : ''}
          <button class="btn ${save ? '' : 'primary'}" data-act="new">新的攀登</button>
          <button class="btn" data-act="help">玩法说明</button>
        </div>
        <div class="title-foot">同人练习作品 · 玩法与数值参考原作<br>与 Mega Crit 无关</div>
      </div>`;
    this.root.onclick = (ev) => {
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (act === 'new') this.showCharacterSelect();
      if (act === 'continue') { this.run = save; this._gameOver = false; this.showMap(); }
      if (act === 'help') this.showHelp();
    };
  }

  showNewRun(charId = 'IRONCLAD') {
    this.charId = charId;
    const ch = CHARACTER_BY_ID[charId];
    this.root.innerHTML = `
      <div class="screen title-screen">
        <div class="title-mark">${ch ? ch.name : '新的一局'}</div>
        <div class="title-main" style="font-size:32px">野心等级</div>
        <div class="sheet-sub center" style="max-width:320px">进阶等级越高，敌人越强、资源越少。<br>建议从 0 开始。</div>
        <div class="title-menu" id="asc-list"></div>
        <button class="btn" data-act="back" style="margin-top:14px">返回</button>
      </div>`;
    const list = $('#asc-list');
    const DESC = ['标准难度', '精英更多', '休息回复更少', '金币收益降低', '药水栏位减少', '起始牌组加入「亡者之枷」', '商店价格提高', '药水掉落减少', '敌人生命提高', '敌人伤害提高', '双首领'];
    for (let i = 0; i <= 10; i++) {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `<div class="t">野心 ${i}${i === 0 ? ' · 标准' : ''}</div><div class="d">${DESC[i]}</div>`;
      b.onclick = () => this.startRun(i, this.charId);
      list.appendChild(b);
    }
    $('[data-act="back"]').onclick = () => this.showCharacterSelect();
  }

  showHelp() {
    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">玩法说明</div>
      <div class="sheet-body">
        <p class="event-text">· 点击手牌选中，再点击敌人（或再次点击卡牌）打出。
· 每回合 3 点能量、抽 5 张牌，回合结束弃掉手牌。
· 敌人头顶的图标是它下回合要做的动作，数字是预计伤害。
· 格挡在你的下个回合开始时清空。
· 故障机器人有<b>充能球</b>：回合结束时被动触发，能量满时打出的球会「激发」换掉最左边那个。
  点角色上方的球看它的数值，点「集中」看加成。
· 右上角的 📜 随时能翻战斗记录，战利品界面也能回看上一场。
· <b>点任何东西都能看说明</b>：点敌人看血量和招式，点身上的状态图标看效果，
  点能量/格挡/生命看数值规则，战斗记录里亮起的牌名、状态名、敌名也都能点开。
· 地图上只能沿连线向上走，15 层后挑战首领。</p>
        <p class="event-text small dim">数值与卡牌来自《杀戮尖塔2》v0.111.0 的社区移植代码，文本对照官方中文本地化。部分内容（事件、遗物触发）为简化实现。</p>
      </div>
      <button class="btn primary" id="close-help">知道了</button>
    </div>`);
    $('#close-help').onclick = () => this.clearOverlay();
  }

  /* ================= 新游戏 ================= */
  showCharacterSelect() {
    const cards = CHARACTERS.map((c) => {
      const locked = !c.playable;
      return `<button class="char-card ${locked ? 'locked' : ''}" data-char="${c.id}" style="--accent:${c.accent}">
        <div class="char-avatar">${c.avatar}</div>
        <div class="char-main">
          <div class="char-name">${c.name}<span class="char-en">${c.en}</span></div>
          <div class="char-desc">${esc(c.desc).replace(/\n/g, '<br>')}</div>
          <div class="char-meta">❤ ${c.hp} · ⚡ ${c.energy}${c.relicName ? ` · 起始遗物「${c.relicName}」` : ''}</div>
        </div>
        ${locked ? '<div class="char-lock">数据待移植</div>' : ''}
      </button>`;
    }).join('');
    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">选择角色</div>
      <div class="sheet-sub">每个角色的牌组、遗物与打法都不一样。</div>
      <div class="sheet-body"><div class="char-list">${cards}</div></div>
      <button class="btn" id="close-char">返回</button>
    </div>`);
    this.overlay.onclick = (ev) => {
      if (ev.target.closest('#close-char')) { this.overlay.onclick = null; this.clearOverlay(); return; }
      const el = ev.target.closest('[data-char]');
      if (!el) return;
      const c = CHARACTER_BY_ID[el.dataset.char];
      if (!c) return;
      if (!c.playable) { this.toast(`${c.name}的卡池还没有移植`); return; }
      this.overlay.onclick = null;
      this.clearOverlay();
      this.showNewRun(c.id);
    };
  }

  startRun(asc, charId = 'IRONCLAD') {
    const seeds = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let seed = '';
    for (let i = 0; i < 8; i++) seed += seeds[Math.floor(Math.random() * seeds.length)];
    this.run = new Run(seed, asc, charId);
    this.battleLogs = [];
    this._gameOver = false;
    this.save();
    this.showAncient();
  }

  /** 幕首事件：先古之民（对照 RoomFactory.CreateAncientEventRoom + AncientEventModel） */
  showAncient() {
    const run = this.run;
    const seen = run.relicData.ancientSeen || (run.relicData.ancientSeen = []);
    const id = (run.actAncient || {})[run.act];
    if (!id || seen.includes(run.act) || !ANCIENTS[id]) { this.showMap(); return; }
    const def = ANCIENTS[id];
    const opts = def.options(run);

    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">${def.icon} ${def.title}</div>
      <div class="sheet-sub">${def.epithet} · 第 ${run.act} 幕</div>
      <div class="sheet-body">
        <div class="sheet-sub ancient-voice">${rich(def.text)}</div>
        <div class="choices" id="anc-list" style="margin-top:14px"></div>
      </div>
    </div>`);
    const list = $('#anc-list');
    opts.forEach((o) => {
      const d = RELICS[o.relic];
      if (!d) return;
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `<div class="t">${d.icon || '◆'} ${esc(d.name)}</div><div class="d">${rich(d.desc)}</div>`;
      b.onclick = async () => {
        this.clearOverlay();
        if (o.relic === 'SEA_GLASS' && o.charId) run.relicData.seaGlassChar = o.charId;
        if (o.relic === 'DUSTY_TOME') run.relicData.dustyTome = true;
        run.addRelic(o.relic);
        seen.push(run.act);
        this.save();
        // 「拾起时受到伤害」的遗物（松动羊毛剪）可以直接把人打死
        if (this.checkDeath()) return;
        // 先把地图铺上：拾起时要选牌的遗物会盖在地图上，而不是盖在一片空白上
        this.showMap();
        await this.flushRelicJobs();
        if (this.checkDeath()) return;
        this.save();
        this.showMap();   // 选牌可能改了牌组，重画一次让牌组数跟上
      };
      list.appendChild(b);
    });
  }

  /**
   * 兑现先古遗物的「拾起时」选择。
   * 遗物在 run.addRelic 里同步落账，需要玩家选牌的效果则以 job 形式入队，这里逐个弹面板。
   */
  async flushRelicJobs() {
    const run = this.run;
    const jobs = run.relicJobs || [];
    if (!jobs.length) return;
    run.relicJobs = [];
    for (const job of jobs) {
      try { await this.runRelicJob(job); } catch (err) { console.error('[relic job]', job, err); }
    }
  }

  async runRelicJob(job) {
    const run = this.run;
    const pickEntry = (pred) => {
      const pool = run.deck.filter(pred);
      if (!pool.length) return null;
      return pool;
    };
    switch (job.k) {
      case 'remove': {
        for (let i = 0; i < (job.n || 1); i++) await this.promptRemoveCard();
        return;
      }
      case 'upgrade': {
        for (let i = 0; i < (job.n || 1); i++) await this.promptUpgradeCard();
        return;
      }
      case 'transform': {
        for (let i = 0; i < (job.n || 1); i++) {
          const pool = pickEntry((d) => CARDS[d.id] && !['status', 'curse'].includes(CARDS[d.id].rarity));
          if (!pool) return;
          const cards = pool.map((d) => makeCard(d.id, d.upgraded));
          const picked = await this.requestSelection({ pool: cards, count: 1, prompt: '选择要变化的牌' });
          if (!picked.length) return;
          const entry = pool[cards.indexOf(picked[0])];
          const newId = run.randomCard({ rarity: ['common', 'uncommon', 'rare'] });
          if (entry && newId) run.transformEntry(entry, newId, job.upgrade ? true : entry.upgraded);
        }
        return;
      }
      case 'enchant': {
        for (let i = 0; i < (job.n || 1); i++) {
          const pool = run.deck.filter((d) => {
            const def = CARDS[d.id];
            if (!def) return false;
            if (job.type && def.type !== job.type) return false;
            return true;
          });
          if (!pool.length) return;
          const cards = pool.map((d) => makeCard(d.id, d.upgraded));
          const picked = await this.requestSelection({ pool: cards, count: 1, prompt: `选择要附魔「${ENCHANT_NAMES[job.enchant] || job.enchant}」的牌` });
          if (!picked.length) return;
          const entry = pool[cards.indexOf(picked[0])];
          if (entry) entry.enchant = job.enchant;
        }
        return;
      }
      case 'reward': {
        const opts = { rarity: job.rarity };
        const ids = job.otherChar
          ? this.otherCharacterCards(job.count || 3)
          : job.colorless
            ? run.rng.pickMany(Object.values(CARDS).filter((d) => d && d.char === 'NEUTRAL' && ['common', 'uncommon', 'rare'].includes(d.rarity)).map((d) => d.id), job.count || 2)
            : run.rollCardReward(job.count || 3, opts);
        if (ids.length) {
          const picked = await this.pickCards(ids, '选择一张牌加入牌组', { optional: !!job.optional });
          if (picked) run.addCard(picked.id);
        }
        if (job.extraCard) run.addCard(job.extraCard);
        return;
      }
      case 'relicTiers': {
        for (const t of job.tiers || []) {
          const rid = run.rollRelic(t);
          if (rid) run.addRelic(rid);
        }
        return;
      }
      case 'ancientRelics': {
        const pool = Object.keys(RELICS).filter((id) => RELICS[id].rarity === 'ancient'
          && !['NEOWS_BONES', 'MASSIVE_SCROLL'].includes(id) && !run.relics.includes(id));
        for (let i = 0; i < (job.n || 2); i++) {
          const rid = run.rng.pick(pool);
          if (rid) { run.addRelic(rid); pool.splice(pool.indexOf(rid), 1); }
        }
        if (job.thenCurse) {
          const c = run.randomCurse();
          if (c) run.addCard(c);
        }
        return;
      }
      case 'tooth': {
        const n = job.n || 5;
        for (let i = 0; i < n; i++) {
          const pool = run.deck.filter((d) => !d.upgraded && d.crafts == null && CARDS[d.id]);
          if (!pool.length) break;
          const cards = pool.map((d) => makeCard(d.id, d.upgraded));
          const picked = await this.requestSelection({ pool: cards, count: 1, prompt: `「佩尔之牙」：选择第 ${i + 1}/${n} 张牌移除` });
          if (!picked.length) break;
          const entry = pool[cards.indexOf(picked[0])];
          if (!entry) continue;
          run.deck.splice(run.deck.indexOf(entry), 1);
          (run.relicData.toothStore || (run.relicData.toothStore = [])).push({ id: entry.id });
        }
        return;
      }
      case 'maul': {
        const pool = run.deck.filter((d) => CARDS[d.id]?.type !== 'quest' && CARDS[d.id]?.type !== 'curse');
        const cards = pool.map((d) => makeCard(d.id, d.upgraded));
        const picked = await this.requestSelection({ pool: cards, count: job.n || 6, prompt: `选择至多 ${job.n} 张牌变化为「撕咬」` });
        for (const card of picked) {
          const entry = pool[cards.indexOf(card)];
          if (!entry) continue;
          const keepEnchant = entry.enchant;
          run.transformEntry(entry, 'MAUL', entry.upgraded);
          if (keepEnchant) entry.enchant = keepEnchant;
        }
        return;
      }
      case 'bundle': {
        const mk = () => {
          const out = [];
          const used = new Set();
          for (const r of ['common', 'common', 'uncommon']) {
            const pool = run.poolByRarity(r).filter((id) => !used.has(id));
            if (!pool.length) continue;
            const id = run.rng.pick(pool);
            used.add(id);
            out.push(id);
          }
          return out;
        };
        const bundles = [mk(), mk()];
        const picked = await this.requestSelection({
          pool: bundles.map((b) => makeCard(b[0])), count: 1, prompt: '选择一包卡牌（点选后再看第二包）',
        });
        const idx = picked.length ? bundles.findIndex((b) => b[0] === picked[0].id) : 0;
        for (const id of (bundles[idx >= 0 ? idx : 0] || [])) run.addCard(id);
        return;
      }
      case 'seaglass': {
        const charId = job.charId || run.relicData.seaGlassChar;
        const ids = [];
        const used = new Set();
        let guard = 0;
        while (ids.length < 15 && guard++ < 200) {
          for (const r of ['common', 'uncommon', 'rare']) {
            const pool = Object.values(CARDS)
              .filter((d) => d && d.char === charId && d.rarity === r && !used.has(d.id))
              .map((d) => d.id);
            if (!pool.length) continue;
            const id = run.rng.pick(pool);
            used.add(id);
            ids.push(id);
            if (ids.length >= 15) break;
          }
        }
        const cards = ids.map((id) => makeCard(id));
        const picked = await this.requestSelection({ pool: cards, count: cards.length, prompt: '「海玻璃」：选择任意数量的牌加入牌组' });
        for (const c of picked) run.addCard(c.id);
        return;
      }
      case 'dustyTome': {
        const pool = Object.values(CARDS)
          .filter((d) => d && d.rarity === 'ancient' && d.char && d.char === run.charId
            && !['BREAK', 'SUPPRESS', 'PROTECTOR', 'METEOR_SHOWER', 'QUADCAST'].includes(d.id))
          .map((d) => d.id);
        const shared = Object.values(CARDS)
          .filter((d) => d && d.rarity === 'ancient' && d.char === 'NEUTRAL')
          .map((d) => d.id);
        const all = [...pool, ...shared];
        const id = all.length ? run.rng.pick(all) : null;
        if (id) run.addCard(id, true);
        return;
      }
      default:
        return;
    }
  }

  /** 取一批其他角色的牌（万花筒 / 海玻璃） */
  otherCharacterCards(n = 3) {
    const run = this.run;
    const others = ['IRONCLAD', 'SILENT', 'DEFECT', 'REGENT', 'NECROBINDER'].filter((c) => c !== run.charId);
    const pools = run.rng.shuffle(others).slice(0, 3);
    const out = [];
    for (const c of pools) {
      const list = Object.values(CARDS)
        .filter((d) => d && d.char === c && ['common', 'uncommon', 'rare'].includes(d.rarity))
        .map((d) => d.id);
      if (list.length) out.push(run.rng.pick(list));
    }
    return out.slice(0, n);
  }

  /* ================= 地图 ================= */
  /** 进入新一幕的过场 */
  showActIntro() {
    const run = this.run;
    const info = (run.act === 1 && ACT1_INFO[run.act1]) || ACT_INFO[run.act] || ACT_INFO[1];
    this.screen = 'act-intro';
    this.clearOverlay();
    this.root.innerHTML = `
      <div class="screen act-intro">
        <div class="act-icon">${info.icon}</div>
        <div class="act-label">${info.label}</div>
        <div class="act-name">${info.name}</div>
        <div class="act-line"></div>
        <div class="act-sub">第 ${run.floor} 层 · 生命 ${run.hp} / ${run.maxHp} · 牌组 ${run.deck.length} 张</div>
        <button class="btn primary" id="act-go" style="width:min(70%,280px);margin-top:26px">继续攀登</button>
      </div>`;
    $('#act-go').onclick = () => { this.save(); this.showAncient(); };
  }

  showMap() {
    // 兜底：任何流程把人耗到 0 血，都不该再画地图（遗物「拾起时受到伤害」等）
    if (this.checkDeath()) return;
    this.screen = 'map';
    this.selectedCard = null;
    this.closeInfo();
    this.clearOverlay();
    const run = this.run;
    const available = reachable(run.map, run.curNode);
    // 飞翼靴：可以无视连线，直接跳到下一排的任意房间（3 次）
    const boots = run.relicData.wingedBoots || 0;
    const curRow = run.curNode ? run.curNode.row : -1;
    const bootsNodes = boots > 0
      ? run.map.nodes.filter(n => n.row === curRow + 1 && n.type !== 'boss' && !available.includes(n))
      : [];
    this._bootsNodes = bootsNodes.map(n => n.id);
    const availIds = new Set([...available, ...bootsNodes].map(n => n.id));

    const rowH = 74, colW = 48;
    const width = colW * (run.map.cols - 1) + 40;
    const height = rowH * run.map.rows + 100;
    const x = (col) => 20 + col * colW;
    const y = (row) => height - 60 - row * rowH;

    let svg = '';
    for (const n of run.map.nodes) {
      for (const c of n.children) {
        const active = (run.curNode && n.id === run.curNode.id) || (run.curNode && n.parents.some(p => p.id === run.curNode.id) && false);
        svg += `<line x1="${x(n.col)}" y1="${y(n.row)}" x2="${x(c.col)}" y2="${y(c.row)}"
          stroke="${n.visited || (run.curNode && c.id === run.curNode.id) ? '#7a5c2a' : '#232c35'}"
          stroke-width="${active ? 2.4 : 1.6}" stroke-linecap="round" />`;
      }
    }

    let nodesHtml = '';
    for (const n of run.map.nodes) {
      const isAvail = availIds.has(n.id);
      const isCur = run.curNode && n.id === run.curNode.id;
      const cls = ['map-node'];
      if (n.type === 'boss') cls.push('boss');
      if (isAvail) cls.push('available');
      if (isCur) cls.push('current');
      if (n.visited) cls.push('visited');
      if (!isAvail && !isCur && !n.visited) cls.push('locked');
      const t = NODE_TYPES[n.type] || NODE_TYPES.monster;
      nodesHtml += `<div class="${cls.join(' ')}" data-type="${n.type}" style="left:${x(n.col)}px;top:${y(n.row)}px" data-node="${n.id}">${t.icon}</div>`;
    }

    this.root.innerHTML = `
      <div class="screen map-screen">
        <div class="hud">
          <div class="hud-chip">${this.run.asc > 0 ? '野心 ' + this.run.asc : '标准'}</div>
          <div class="hud-hp">
            <div class="hpbar"><i style="width:${(run.hp / run.maxHp) * 100}%"></i><span>${run.hp} / ${run.maxHp}</span></div>
          </div>
          <div class="hud-chip gold"><span class="ic">◉</span>${run.gold}</div>
        </div>
        <div class="relic-strip">${run.relics.map(relicSlot).join('')}${run.potions.map(p => p ? `<div class="potion" data-potion-info="${p}">${POTIONS[p].icon}</div>` : '<div class="potion empty">·</div>').join('')}</div>
        <div class="map-head">
          <div class="dim small">第 ${run.floor} 层 · ${ACT_INFO[run.act].label} · ${ACT_INFO[run.act].name}</div>
          <div class="spacer"></div>
          <button class="btn small" id="deck-btn" style="padding:7px 12px">牌组 ${run.deck.length}</button>
        </div>
        <div class="map-scroll">
          <div class="map-canvas" style="width:${width}px;height:${height}px">
            <svg class="map-svg">${svg}</svg>
            ${nodesHtml}
          </div>
        </div>
      </div>`;

    $('#deck-btn').onclick = () => this.showDeckView();
    const scroller = $('.map-scroll');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    this.root.onclick = (ev) => {
      const nodeEl = ev.target.closest('[data-node]');
      if (nodeEl && nodeEl.classList.contains('available')) {
        const n = this.run.map.nodes.find(x => x.id === nodeEl.dataset.node);
        this.enterNode(n);
      }
      const relicEl = ev.target.closest('[data-relic]');
      if (relicEl) this.showRelicInfo(relicEl.dataset.relic);
      const potEl = ev.target.closest('[data-potion-info]');
      if (potEl) this.showPotionInfo(potEl.dataset.potionInfo);
    };
    this.save();
  }

  /* ================= 详情弹层（关键词 / 状态 / 敌人 / 卡牌） ================= */
  closeInfo() {
    document.querySelectorAll('.kw-pop').forEach(x => x.remove());
  }

  showInfo({ icon = '', title = '', sub = '', body = '' }) {
    this.closeInfo();
    const el = document.createElement('div');
    el.className = 'kw-pop';
    el.innerHTML = `<div class="kw-box">
      <div class="kw-head">
        ${icon ? `<span class="kw-ic">${icon}</span>` : ''}
        <span class="kw-title">${esc(title)}</span>
        ${sub ? `<span class="kw-sub">${esc(sub)}</span>` : ''}
      </div>
      <div class="kw-body">${body}</div>
      <button class="btn primary kw-close">知道了</button>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (ev) => {
      if (ev.target === el || ev.target.closest('.kw-close')) this.closeInfo();
    });
    return el;
  }

  /**
   * 通用确认弹层，返回 Promise<boolean>。
   * 用于「点一下就落地、且不可撤销」的选择（战利品、事件选项、删牌/升级）。
   * 挂在 body 上而不是 #overlay-layer 里，所以可以叠在任何浮层之上。
   */
  askConfirm({ title = '确认？', sub = '', body = '', okText = '确认', cancelText = '取消' } = {}) {
    document.querySelectorAll('.cfm-pop').forEach(x => x.remove());
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'cfm-pop';
      el.innerHTML = `<div class="cfm-box">
        <div class="cfm-title">${esc(title)}</div>
        ${sub ? `<div class="cfm-sub">${rich(sub)}</div>` : ''}
        ${body ? `<div class="cfm-body">${body}</div>` : ''}
        <div class="cfm-actions">
          <button class="btn cfm-cancel">${esc(cancelText)}</button>
          <button class="btn primary cfm-ok">${esc(okText)}</button>
        </div>
      </div>`;
      document.body.appendChild(el);
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        el.remove();
        resolve(v);
      };
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (ev.target.closest('.cfm-ok')) finish(true);
        else if (ev.target === el || ev.target.closest('.cfm-cancel')) finish(false);
      });
    });
  }

  /** 统一入口：卡片/状态/敌人/遗物/药水/机制词 */
  showKw(kind, id, ownerUid, stackHint) {
    if (!kind || !id) return;
    if (kind === 'card') return this.showCardInfo(id);
    if (kind === 'power') return this.showPowerInfo(id, ownerUid, stackHint);
    if (kind === 'orb') return this.showOrbInfo(Number(id));
    if (kind === 'enemy') return this.showEnemyInfo(id);
    if (kind === 'move') return this.showMoveInfo(ownerUid, id);
    if (kind === 'relic') return this.showRelicInfo(id);
    if (kind === 'potion') return this.showPotionInfo(id);
    if (kind === 'term') return this.showTermInfo(id);
  }

  showTermInfo(id) {
    const t = TERMS[id];
    if (!t) return;
    const body = String(t.desc).split('\n').map(p => `<p class="kw-p">${richLinked(p)}</p>`).join('');
    this.showInfo({ icon: t.icon, title: t.name, sub: t.group, body });
  }

  showPowerInfo(id, ownerUid, stackHint) {
    const meta = POWERS[id];
    if (!meta) return;
    const c = this.combat;
    let owner = null;
    if (c && ownerUid === 'player') owner = c.player;
    else if (c && ownerUid) owner = c.enemies.find(e => e.uid === ownerUid);
    let stack = null;
    if (owner) stack = id === 'strengthTemp' ? (owner.tempStr || 0) : (owner.powers?.[id] ?? null);
    // 从战斗记录点进来时，日志里那句"获得 N 层"就是当时的层数
    const fromLog = stack == null && stackHint != null && stackHint !== '';
    if (fromLog) stack = Number(stackHint);

    const n = stack == null || stack === 0 ? 1 : stack;
    const desc = meta.desc(n);
    const ownerName = owner ? (owner.isPlayer ? '你' : owner.name) : '';
    const body = `
      <p class="kw-p">${linkify(desc)}</p>
      ${owner ? `<div class="kw-row"><b>${esc(ownerName)}</b><span>当前 ${stack} 层</span></div>` : ''}
      ${fromLog ? `<div class="kw-note">层数取自战斗记录里的那一行（当时 ${stack} 层）。</div>` : ''}
      ${stack == null ? '<div class="kw-note">上面的数值按 1 层写的，实际效果随层数变化。</div>' : ''}`;
    this.showInfo({
      icon: meta.type === 'debuff' ? '☠' : '✦',
      title: meta.name,
      sub: meta.type === 'debuff' ? '负面效果' : '增益效果',
      body,
    });
  }

  /**
   * 卡牌详情。opts.card 传战斗里的实际牌实例（数值随力量/格挡等实时变化），
   * opts.combat 传当前战斗，opts.upgraded 指定是展示升级版。
   * 正文里的牌名/状态名都可点，点了接着看那条说明。
   */
  showCardInfo(id, opts = {}) {
    let def = CARDS[id];
    // 两个角色都有「打击」「防御」，按当前角色找同名的那张
    if (def && this.run && def.char !== this.run.charId && def.char !== 'NEUTRAL') {
      const alt = Object.values(CARDS).find(d => d.name === def.name && d.char === this.run.charId);
      if (alt) { id = alt.id; def = alt; }
    }
    if (!def) return;
    const combat = opts.combat || null;
    const card = (opts.card && opts.card.id === id) ? opts.card : makeCard(id, !!opts.upgraded);
    const other = makeCard(id, !card.upgraded);
    const curText = fmtText(def, card, combat, { link: true });
    const otherText = fmtText(def, other, combat, { link: true });

    const typeLabel = { attack: '攻击', skill: '技能', power: '能力', status: '状态', curse: '诅咒' }[def.type] || '';
    const rarityLabel = { common: '普通', uncommon: '罕见', rare: '稀有', starter: '初始', basic: '初始', status: '状态', curse: '诅咒', event: '事件', quest: '任务' }[def.rarity] || '';
    const starLabel = def.stars ? ` · ✦ ${def.stars === 'X' ? 'X' : def.stars} 星愿` : '';
    const costNow = combat ? combat.costOf(card) : card.cost;
    const costLabel = costNow === 'X'
      ? 'X 费'
      : (typeof costNow === 'number' ? `${costNow < 0 ? '—' : costNow} 费` : '');
    const sub = [typeLabel, rarityLabel, costLabel].filter(Boolean).join(' · ') + starLabel;

    const body = `
      <div class="kw-cardwrap">${cardHTML(card, { combat, link: true })}</div>
      ${otherText !== curText
        ? `<div class="kw-sec">${card.upgraded ? '未升级' : '升级后'}</div><p class="kw-p">${otherText}</p>`
        : '<div class="kw-note">这张牌没有升级效果。</div>'}
      <div class="kw-note">点卡面/说明里高亮的关键词，可以看那条效果的详细说明。</div>`;
    const el = this.showInfo({ title: `${card.name}${card.upgraded ? '+' : ''}`, sub, body });
    // 牌面放不下时（文字长）补一段完整说明，短牌就不重复一遍了
    const ct = el?.querySelector('.kw-cardwrap .card-text');
    if (ct && ct.scrollHeight > ct.clientHeight + 1) {
      const p = document.createElement('p');
      p.className = 'kw-p kw-p-full';
      p.innerHTML = curText;
      el.querySelector('.kw-cardwrap').after(p);
    }
  }

  showEnemyInfo(uidOrId) {
    const c = this.combat;
    const inst = c ? c.enemies.find(e => e.uid === uidOrId || e.id === uidOrId) : null;
    const id = inst ? inst.id : uidOrId;
    const def = ENEMIES[id];
    if (!def) return;
    const asc = this.run?.asc ?? 0;
    const hp = (asc >= 8 && def.hpAsc) ? def.hpAsc : def.hp;
    const kindLabel = def.boss ? '首领' : def.elite ? '精英' : def.minion ? '召唤物' : '普通敌人';

    const moves = Object.entries(def.moves || {}).map(([k, mv]) => {
      const cur = inst && inst.moveKey === k;
      return `<div class="kw-row${cur ? ' cur' : ''}"><b>${esc(mv.name)}</b><span>${intentLabel(mv.intent, asc)}${cur ? ' · 本回合' : ''}</span></div>`;
    }).join('');

    const hpRow = inst
      ? `<div class="kw-row"><b>生命</b><span>${inst.hp} / ${inst.maxHp}${inst.block ? ` · 格挡 ${inst.block}` : ''}</span></div>`
      : `<div class="kw-row"><b>生命</b><span>${hp[0] === hp[1] ? hp[0] : `${hp[0]}~${hp[1]}`}</span></div>`;
    const curIntent = inst && inst.moveKey && def.moves?.[inst.moveKey]
      ? `<div class="kw-row"><b>本回合意图</b><span>${esc(def.moves[inst.moveKey].name)} · ${intentLabel(def.moves[inst.moveKey].intent, asc)}</span></div>`
      : '';
    const pwRow = inst && Object.keys(inst.powers).length
      ? `<div class="kw-sec">状态</div><div class="pows" style="margin:4px 0 2px">${powHTML(inst.powers, inst.uid)}</div>`
      : '';

    const body = `
      ${hpRow}
      <div class="kw-row"><b>类型</b><span>${kindLabel}</span></div>
      ${curIntent}
      ${pwRow}
      <div class="kw-sec">招式</div>${moves || '<div class="kw-note">没有固定招式</div>'}`;
    this.showInfo({ icon: def.icon, title: def.name, sub: kindLabel, body });
  }

  /** 敌人的某个招式：干什么、打多少、当前状态下实际多少 */
  showMoveInfo(enemyId, key) {
    const info = describeMove(enemyId, key, this.run?.asc ?? 0);
    if (!info) return;
    const { def, mv, effects, intent, attack } = info;
    const c = this.combat;
    const inst = c ? c.enemies.find(e => e.id === enemyId) : null;

    let actual = '';
    if (inst && inst.alive && attack && c) {
      const per = c.previewEnemyDamage(inst, attack.base);
      if (per !== attack.base) {
        actual = `按它现在的状态，每次实际造成 ${per} 点伤害${attack.times > 1 ? `，合计 ${per * attack.times} 点` : ''}。`;
      }
    }

    const body = `
      <p class="kw-p">${effects.map(x => linkify(x)).join('；')}</p>
      <div class="kw-sec">招式</div>
      <div class="kw-row"><b>意图</b><span>${esc(intent)}</span></div>
      <div class="kw-row"><b>拥有者</b><span>${esc(def.name)}</span></div>
      ${inst ? `<div class="kw-row"><b>当前生命</b><span>${Math.max(0, inst.hp)} / ${inst.maxHp}${inst.block ? ` · 格挡 ${inst.block}` : ''}</span></div>` : ''}
      ${actual ? `<div class="kw-note">${esc(actual)}</div>` : ''}
      <div class="kw-note">这一招的数值直接取自它的实现代码，进阶难度下会更高。</div>`;
    this.showInfo({ icon: def.icon, title: mv.name || key, sub: `${def.name} 的招式`, body });
  }

  /** 某个充能球：被动 / 激发 / 当前数值（含集中） */
  showOrbInfo(i) {
    const c = this.combat;
    const orb = c && c.player.orbs ? c.player.orbs[i] : null;
    if (!orb) return;
    const meta = ORBS[orb.kind];
    const focus = c.orbFocus();
    const body = `
      ${meta.detail(orb, focus).map(p => `<p class="kw-p">${linkify(p)}</p>`).join('')}
      ${focus ? `<div class="kw-row"><b>集中</b><span>${focus > 0 ? '+' : ''}${focus}</span></div>` : ''}
      <div class="kw-row"><b>位置</b><span>第 ${i + 1} 个 · 共 ${c.maxOrbSlots} 个栏位</span></div>
      <div class="kw-note">栏位满了以后再生成新球，会先激发最左边这个。</div>`;
    this.showInfo({ icon: meta.icon, title: `${meta.name}充能球`, sub: '充能球', body });
  }

  showPlayerInfo() {
    const run = this.run;
    const c = this.combat;
    const p = c ? c.player : null;
    const body = p ? `
      <div class="kw-row"><b>生命</b><span>${Math.max(0, p.hp)} / ${p.maxHp}</span></div>
      <div class="kw-row"><b>格挡</b><span>${p.block}</span></div>
      <div class="kw-row"><b>能量</b><span>${c.energy} · 回合 ${c.turn}</span></div>
      ${run.charId === 'REGENT' ? `<div class="kw-row"><b>星愿</b><span>✦ ${p.stars}</span></div>` : ''}
      <div class="kw-sec">状态</div>
      ${Object.keys(p.powers).length || p.tempStr
        ? `<div class="pows" style="margin-top:4px">${powHTML(p.powers, 'player')}${p.tempStr ? `<span class="pw buff" data-kw-kind="power" data-kw-id="strengthTemp" data-kw-owner="player">临时力量<b>${p.tempStr}</b></span>` : ''}</div>
           <div class="kw-note">点图标看每一条的说明</div>`
        : '<div class="kw-note">身上没有任何状态</div>'}`
      : '<div class="kw-note">当前不在战斗中</div>';
    this.showInfo({
      icon: run.avatar || '🗡️',
      title: run.character || '角色',
      sub: `第 ${run.floor} 层${run.asc ? ` · 野心 ${run.asc}` : ''}`,
      body,
    });
  }

  showRelicInfo(id) {
    const r = RELICS[id];
    if (!r) return;
    this.showInfo({ icon: r.icon, title: r.name, sub: '遗物', body: `<p class="kw-p">${richLinked(r.desc)}</p>` });
  }

  showPotionInfo(id) {
    const p = POTIONS[id];
    if (!p) return;
    this.showInfo({ icon: p.icon, title: p.name, sub: '药水', body: `<p class="kw-p">${richLinked(p.desc)}</p>` });
  }

  toastBtn(text) { this.toast(text, 2000); }

  showDeckView() {
    const cards = this.run.deck.map(d => makeCard(d.id, d.upgraded));
    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">牌组 · ${cards.length} 张</div>
      <div class="sheet-sub">点击卡牌查看详情</div>
      <div class="sheet-body"><div class="reward-grid">${cards.map(c => cardHTML(c)).join('')}</div></div>
      <button class="btn primary" id="close-deck">关闭</button>
    </div>`);
    $('#close-deck').onclick = () => this.clearOverlay();
    this.overlay.onclick = (e) => {
      const el = e.target.closest('[data-uid]');
      if (el) {
        const c = cards.find(x => x.uid === el.dataset.uid);
        if (c) this.showCardDetail(c);
      }
    };
  }

  showCardDetail(card, combat = null) {
    if (!card || !CARDS[card.id]) return;
    this.showCardInfo(card.id, { card, combat });
  }

  /* ================= 进入节点 ================= */
  enterNode(node) {
    // 飞翼靴：跳过了连线才消耗一次
    if ((this.run.relicData.wingedBoots || 0) > 0 && (this._bootsNodes || []).includes(node.id)) {
      this.run.relicData.wingedBoots -= 1;
      this.toast(`飞翼靴：还剩 ${this.run.relicData.wingedBoots} 次`);
    }
    this.run.curNode = node;
    node.visited = true;
    this.run.floor++;
    this.run.stats.floors = this.run.floor;
    // 巨口储蓄罐：每攀爬一层给 12 金币（在商店花过钱就失效）
    this.run.notifyRoomEntered();
    const t = node.type;
    // 探测棒：走完 5 个未知房间后变成「丰饶」
    if (t === 'unknown') {
      for (const e of this.run.deck) {
        if (e.id !== 'DOWSING') continue;
        e.dowsing = (e.dowsing || 0) + 1;
        if (e.dowsing >= 5) this.run.transformEntry(e, 'ABUNDANCE');
      }
    }
    if (t === 'boss') return this.startCombat('boss', node);
    if (t === 'elite') return this.startCombat('elite', node);
    if (t === 'monster') return this.startCombat('normal', node);
    if (t === 'rest') return this.showRest();
    if (t === 'shop') return this.showShop();
    if (t === 'treasure') return this.showTreasure();
    if (t === 'unknown') return this.resolveUnknown(node);
  }

  resolveUnknown(node) {
    // 黄金罗盘的特殊直道：每一格都是事件
    if (node.golden) return this.showEvent();
    const r = Math.random();
    const noCombat = this.run.relics.includes('JUZU_BRACELET');
    if (!noCombat && r < 0.25) return this.startCombat('normal', node);
    if (r < 0.35) return this.showShop();
    if (r < 0.45) return this.showTreasure();
    return this.showEvent();
  }

  /* ================= 战斗 ================= */
  startCombat(kind, node, forcedEnc = null, afterEvent = null) {
    const enc = forcedEnc || this.run.rollEncounter(kind);
    this.run.combatCount++;
    this._eventCombatAfter = afterEvent;
    this.combat = new Combat(this.run, enc, { speed: window.DEBUG_SPEED ?? 1 });
    // 战报要在战斗结束后知道「这一场是普通/精英/首领、进门时多少血」
    this.combat._kind = kind;
    this.combat._event = !!afterEvent;
    this.combat._hpStart = this.run.hp;
    this.combat.onUpdate = () => this.renderCombat();
    this.combat.onFloat = (target, text, kind2) => this.floatAt(target, text, kind2);
    this.combat.onLog = (m) => {};
    this.combat.requestSelection = (opts) => this.requestSelection(opts);
    this.selectedCard = null;
    this.pendingPotion = null;
    this._finishing = null;
    this.combatResolved = false;
    clearTimeout(this._finishWatchdog);
    clearTimeout(this._finishFallback);
    this.renderCombat(true);
    this.combat.start();
  }

  /**
   * 战斗结束的统一入口。
   * onCombatFinished 是异步的，以前在 renderCombat / playSelected / onEndTurn / tapPotion
   * 里都是裸调：一旦奖励生成、存档或换幕里抛错，就变成未处理的 Promise rejection，
   * 界面停在最后一帧、战斗日志停在「XX 被击败」，看起来就是"消灭最后一个敌人后卡住"。
   * 这里统一接住异常，并加一个超时重试，保证流程一定能往下走。
   */
  finishCombat() {
    const c = this.combat;
    if (!c || !c.finished) return;
    if (this._finishing === c) return;             // 同一次结算只发起一次
    this._finishing = c;

    const settle = () => {
      this._finishing = null;
      clearTimeout(this._finishWatchdog);
      clearTimeout(this._finishFallback);
    };
    Promise.resolve()
      .then(() => this.onCombatFinished())
      .then(settle, (err) => this.combatFinishFailed(err, c));

    clearTimeout(this._finishWatchdog);
    clearTimeout(this._finishFallback);
    this._finishWatchdog = setTimeout(() => {
      if (this.combat !== c || !c.finished) return;              // 已正常结算
      if (document.querySelector('.overlay-layer:not(.hidden) .sheet-title')) return; // 战利品已弹出
      console.warn('[combat] 结算超时，重试一次');
      this.combatResolved = false;
      Promise.resolve()
        .then(() => this.onCombatFinished())
        .then(settle, (err) => this.combatFinishFailed(err, c));
      // 重试也可能卡在 await 上（不抛错、不返回），再给一道强制超时
      this._finishFallback = setTimeout(() => {
        if (this.combat !== c || !c.finished) return;
        if (document.querySelector('.overlay-layer:not(.hidden) .sheet-title')) return;
        this.combatFinishFailed(new Error('结算重试后仍无响应'), c);
      }, 2500);
    }, 2500);
  }

  /** 结算链路彻底失败时的兜底：宁可丢掉本次战利品，也不能把玩家冻在战斗画面 */
  combatFinishFailed(err, c) {
    console.error('[combat finish]', err);
    clearTimeout(this._finishWatchdog);
    clearTimeout(this._finishFallback);
    this._finishing = null;
    if (this.combat !== c) return;
    this.combat = null;
    this.combatResolved = false;
    this.save();
    this.toast('战斗结算异常，已跳过本次战利品', 3000);
    try { this.showMap(); } catch { this.showTitle(); }
  }

  renderCombat(first = false) {
    const c = this.combat;
    if (!c) return;
    if (c.finished) { this.finishCombat(); return; }
    const run = this.run;
    const scrollLeft = $('.hand')?.scrollLeft || 0;

    const enemies = c.enemies.map(e => {
      if (!e.alive) return '';
      const intent = c.intentOf(e);
      let intentHtml = '';
      const cls = intent.type === 'attack' ? 'attack' : intent.type === 'defend' ? 'defend' : intent.type === 'buff' ? 'buff' : ['debuff', 'status', 'sleep', 'stun', 'escape', 'summon', 'heal'].includes(intent.type) ? 'debuff' : '';
      if (intent.type === 'attack') intentHtml = `⚔ ${intent.dmg}${intent.times > 1 ? ` ×${intent.times}` : ''}`;
      else if (intent.type === 'defend') intentHtml = `🛡 ${intent.block}`;
      else if (intent.type === 'buff') intentHtml = '💪 强化';
      else if (intent.type === 'debuff') intentHtml = '☠ 削弱';
      else if (intent.type === 'status') intentHtml = '🃏 塞牌';
      else if (intent.type === 'sleep') intentHtml = '💤 沉睡';
      else if (intent.type === 'stun') intentHtml = '💫 眩晕';
      else if (intent.type === 'escape') intentHtml = '🏃 逃跑';
      else if (intent.type === 'summon') intentHtml = '➕ 召唤';
      else if (intent.type === 'heal') intentHtml = '❤ 回复';
      const hpPct = (e.hp / e.maxHp) * 100;
      const blockedPct = e.block > 0 ? Math.min(100 - hpPct, (e.block / e.maxHp) * 100) : 0;
      const targetable = this.selectedCard && this.selectedCard.target === 'enemy' ? 'targetable' : '';
      return `<div class="enemy ${e.elite ? 'elite' : ''} ${e.boss ? 'boss' : ''} ${targetable}" data-enemy="${e.uid}">
        <div class="intent ${cls}" data-kw-kind="term" data-kw-id="intent">${intentHtml}</div>
        <div class="enemy-body">${e.icon}</div>
        <div class="enemy-name">${esc(e.name)}<span class="info-dot">ⓘ</span></div>
        <div class="enemy-hp"><div class="hpbar"><i style="width:${hpPct}%"></i>${blockedPct ? `<i class="block-fill" style="left:${hpPct}%;width:${blockedPct}%"></i>` : ''}<span>${e.hp}${e.block ? ' +' + e.block : ''}</span></div></div>
        <div class="pows">${powHTML(e.powers, e.uid)}</div>
      </div>`;
    }).join('');

    const p = c.player;
    const ascBane = run.asc > 0 ? `<span class="hud-chip" style="font-size:10px;padding:2px 6px">野心 ${run.asc}</span>` : '';
    const hand = c.hand.map(card => {
      const playable = c.canPlay(card);
      return cardHTML(card, {
        combat: c,
        disabled: !playable,
        selected: this.selectedCard && this.selectedCard.uid === card.uid,
      });
    }).join('');

    this.root.innerHTML = `
      <div class="screen combat-screen">
        <div class="hud">
          ${ascBane}
          <div class="hud-hp" data-kw-kind="term" data-kw-id="hp">
            <div class="hpbar"><i style="width:${(p.hp / p.maxHp) * 100}%"></i><span>${Math.max(0, p.hp)} / ${p.maxHp}</span></div>
          </div>
          <div class="hud-chip gold" data-kw-kind="term" data-kw-id="gold"><span class="ic">◉</span>${run.gold}</div>
          <div class="hud-chip logbtn" id="open-log" title="战斗记录">📜</div>
        </div>
        <div class="relic-strip">${run.relics.map(relicSlot).join('')}${run.potions.map((pid, i) => pid ? `<div class="potion" data-potion="${i}">${POTIONS[pid].icon}</div>` : '<div class="potion empty">·</div>').join('')}</div>
        <div class="battlefield">
          <div class="turn-badge" data-kw-kind="term" data-kw-id="turn">回合 ${c.turn}</div>
          <div class="enemy-row">${enemies}</div>
          ${ostyRow(c)}
          ${orbRow(c)}
          <div class="player-zone">
            <div class="avatar" data-info-player="1">${run.avatar || '🗡️'}<div class="block-badge ${p.block ? '' : 'zero'}" data-kw-kind="term" data-kw-id="block">${p.block}</div></div>
            <div class="player-info" data-info-player="1">
              <div class="player-top">
                <span class="player-name">${esc(run.character || '铁甲战士')}</span>
                <span class="player-hp">${Math.max(0, p.hp)} / ${p.maxHp}</span>
              </div>
              <div class="hpbar thin"><i style="width:${Math.max(0, (p.hp / p.maxHp)) * 100}%"></i></div>
              <div class="player-pows">${powHTML(p.powers, 'player')}${p.tempStr ? `<span class="pw buff" data-kw-kind="power" data-kw-id="strengthTemp" data-kw-owner="player">临时力量<b>${p.tempStr}</b></span>` : ''}</div>
            </div>
          </div>
        </div>
        <div class="action-bar">
          <div class="energy" title="能量" data-kw-kind="term" data-kw-id="energy">${c.energy}</div>
          ${run.charId === 'REGENT' ? `<div class="stars-hud" title="星愿" data-kw-kind="term" data-kw-id="stars">✦ ${c.player.stars}</div>` : ''}
          <div class="pile-chip" data-pile="draw">抽牌<b>${c.drawPile.length}</b></div>
          <div class="pile-chip" data-pile="discard">弃牌<b>${c.discardPile.length}</b></div>
          <div class="spacer"></div>
          <div class="end-turn" id="end-turn">结束回合</div>
        </div>
        <div class="hand-zone">
          <div class="hand">${hand}</div>
        </div>
      </div>`;

    const handEl = $('.hand');
    if (handEl) handEl.scrollLeft = scrollLeft;

    // 事件绑定
    this.root.onclick = (ev) => {
      if (ev.target.closest('#end-turn')) { this.onEndTurn(); return; }
      if (ev.target.closest('#open-log')) { this.showCombatLog(); return; }
      if (ev.target.closest('[data-info-player]')) { this.showPlayerInfo(); return; }
      const enemyEl = ev.target.closest('[data-enemy]');
      if (enemyEl && this.selectedCard) {
        const e = this.combat.enemies.find(x => x.uid === enemyEl.dataset.enemy);
        this.playSelected(e);
        return;
      }
      if (enemyEl && this.pendingPotion != null) {
        const e = this.combat.enemies.find(x => x.uid === enemyEl.dataset.enemy);
        this.usePotion(this.pendingPotion, e);
        return;
      }
      const potEl = ev.target.closest('[data-potion]');
      if (potEl) { this.tapPotion(+potEl.dataset.potion); return; }
      const cardEl = ev.target.closest('[data-card]');
      if (cardEl) { this.tapCard(cardEl.dataset.uid); return; }
      const pileEl = ev.target.closest('[data-pile]');
      if (pileEl) { this.showPileInfo(pileEl.dataset.pile); return; }
      const relicEl = ev.target.closest('[data-relic]');
      if (relicEl) { this.showRelicInfo(relicEl.dataset.relic); return; }
      // 没选牌、也没在等药水目标时，点敌人 = 看它的详情
      if (enemyEl) { this.showEnemyInfo(enemyEl.dataset.enemy); return; }
    };
  }

  tapCard(uid) {
    const c = this.combat;
    if (!c || c.finished) return;
    const card = c.hand.find(x => x.uid === uid);
    if (!card) return;
    if (!c.canPlay(card)) {
      const cost = c.costOf(card);
      if (c.starCostOf(card) > c.player.stars) this.toast('星愿不足');
      else if (typeof cost === 'number' && cost > c.energy) this.toast('能量不足');
      else this.toast('无法打出');
      return;
    }
    if (this.selectedCard && this.selectedCard.uid === uid) {
      if (card.target === 'enemy' && c.alive().length > 1) { this.toast('选择一个目标'); return; }
      this.playSelected(c.alive()[0]);
      return;
    }
    this.selectedCard = card;
    this.renderCombat();
  }

  async playSelected(target) {
    const card = this.selectedCard;
    if (!card || (this.combat && this.combat.busy)) return;
    this.selectedCard = null;
    this.renderCombat();
    await this.combat.playCard(card, target);
    if (this.combat && this.combat.finished) this.finishCombat();
    else this.renderCombat();
  }

  banner(text, cls = '') {
    const d = document.createElement('div');
    // 修饰类必须带自己的前缀：直接叫 enemy 会撞上敌人卡的 .enemy { width:96px }，把横幅挤成竖排
    d.className = 'turn-banner' + (cls ? ` turn-banner--${cls}` : '');
    d.textContent = text;
    this.fx.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }

  async onEndTurn() {
    if (!this.combat || this.combat.finished || this.combat.busy) return;
    this.selectedCard = null;
    this.renderCombat();
    this.banner('敌人回合', 'enemy');
    await this.combat.endTurn();
    if (this.combat && !this.combat.finished) this.banner('你的回合', 'player');
    if (this.combat && this.combat.finished) this.finishCombat();
    else this.renderCombat();
  }

  tapPotion(i) {
    const c = this.combat;
    const id = this.run.potions[i];
    if (!id) return;
    const def = POTIONS[id];
    if (def.target === 'enemy' && c.alive().length > 1) {
      this.pendingPotion = i;
      this.toast('选择一名敌人');
      return;
    }
    this.usePotion(i, c.alive()[0]);
  }

  async usePotion(i, target) {
    const id = this.run.potions[i];
    if (!id) return;
    const def = POTIONS[id];
    this.pendingPotion = null;
    if (def.special === 'ashwater') {
      const chosen = await this.requestSelection({ pool: this.combat.hand.slice(), count: 99, prompt: '选择要消耗的牌', multi: true });
      if (this.combat) for (const card of chosen) await this.combat.exhaustCard(card);
    } else {
      this.combat.target = target;
      await def.use(this.combat, target);
    }
    this.run.removePotion(i);
    this.renderCombat();
    if (this.combat && this.combat.finished) this.finishCombat();
  }

  /** 战斗记录：按回合分组，可复制成纯文本便于复盘。独立弹层，任何界面都能打开 */
  showCombatLog(entriesOverride = null, subOverride = null) {
    const entries = entriesOverride
      || (this.combat && this.combat.log.length ? this.combat.log : this.lastCombatLog) || [];
    if (!entries.length) return this.toast('还没有战斗记录');
    const KIND_ICON = {
      turn: '⏱', play: '🃏', damage: '💥', block: '🛡',
      power: '✦', enemy: '👹', draw: '🎴', system: '·', death: '💀',
    };
    let lastTurn = null;
    const rows = entries.map((e) => {
      let head = '';
      const isTurnHead = e.kind === 'turn' && /^第\s*\d+\s*回合/.test(e.text);
      if (isTurnHead) {
        head = `<div class="log-turn">${esc(e.text)}</div>`;
        lastTurn = e.turn;
        return head;
      }
      if (e.turn !== lastTurn && e.turn > 0) {
        head = `<div class="log-turn">第 ${e.turn} 回合</div>`;
        lastTurn = e.turn;
      }
      const icon = KIND_ICON[e.kind] || '·';
      // 敌人行动：招式名单独做成可点链接，行尾补一句这招干了什么。
      // 注意不能先 linkify 整句再替换——招式名本身可能是关键词（比如「缩小」），
      // 会被包成 <span>，字符串就对不上了。
      let html;
      const mi = e.move ? describeMove(e.move.enemy, e.move.key, this.run?.asc ?? 0) : null;
      const mvName = mi?.mv?.name || '';
      if (mvName && e.text.endsWith(mvName)) {
        html = linkify(e.text.slice(0, -mvName.length))
          + `<span class="kwl" data-kw-kind="move" data-kw-id="${esc(e.move.key)}" data-kw-owner="${esc(e.move.enemy)}">${esc(mvName)}</span>`;
        if (mi.effects.length) html += ` <span class="lg-eff">— ${esc(mi.effects.join('；'))}</span>`;
      } else {
        html = linkify(e.text);
      }
      // 这句记录里的层数顺手挂到状态链接上，点开就能看到当时的数值
      const lm = e.kind === 'power' ? /(\d+)\s*层/.exec(e.text) : null;
      if (lm) html = html.replace(/(data-kw-kind="power" data-kw-id="[^"]+")/g, `$1 data-kw-stack="${lm[1]}"`);
      return `${head}<div class="log-line lg-${e.kind}"><span class="lg-ic">${icon}</span><span class="lg-txt">${html}</span></div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.className = 'log-modal';
    const sub = subOverride
      ? `${subOverride} · 共 ${entries.length} 条`
      : [this.lastCombatTitle, `共 ${entries.length} 条`, '点亮起的词看说明'].filter(Boolean).join(' · ');
    modal.innerHTML = `<div class="sheet log-sheet">
      <div class="sheet-title">战斗记录</div>
      <div class="sheet-sub">${esc(sub)}</div>
      <div class="sheet-body log-body">${rows}</div>
      <div class="log-actions">
        <button class="btn" data-lg="copy">复制</button>
        <button class="btn primary" data-lg="close">关闭</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    const body = modal.querySelector('.log-body');
    body.scrollTop = body.scrollHeight;

    const close = () => modal.remove();
    modal.addEventListener('click', async (ev) => {
      if (ev.target === modal || ev.target.closest('[data-lg="close"]')) { close(); return; }
      if (ev.target.closest('[data-lg="copy"]')) {
        const text = entries.map((e, i) => {
          const prev = entries[i - 1];
          const head = !prev || prev.turn !== e.turn ? `\n=== 第 ${e.turn} 回合 ===\n` : '';
          let line = e.text;
          if (e.move) {
            const mi = describeMove(e.move.enemy, e.move.key, this.run?.asc ?? 0);
            if (mi?.effects.length) line += `（${mi.effects.join('；')}）`;
          }
          return head + '· ' + line;
        }).join('\n').trim();
        try {
          await navigator.clipboard.writeText(text);
          this.toast('已复制到剪贴板');
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); this.toast('已复制到剪贴板'); }
          catch { this.toast('复制失败，请长按文字手动复制'); }
          ta.remove();
        }
      }
    });
  }

  showPileInfo(which) {
    const c = this.combat;
    const pile = which === 'draw' ? c.drawPile : c.discardPile;
    const sorted = [...pile].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">${which === 'draw' ? '抽牌堆' : '弃牌堆'} · ${pile.length} 张</div>
      <div class="sheet-sub">${which === 'draw' ? '顺序已隐藏（按名称排列）' : '按名称排列'}</div>
      <div class="sheet-body"><div class="reward-grid">${sorted.map(x => cardHTML(x, { combat: c })).join('')}</div></div>
      <button class="btn primary" id="close-pile">关闭</button>
    </div>`);
    $('#close-pile').onclick = () => this.clearOverlay();
    this.overlay.onclick = (e) => {
      const el = e.target.closest('[data-uid]');
      if (!el) return;
      const card = sorted.find(x => x.uid === el.dataset.uid);
      if (card) this.showCardDetail(card, c);
    };
  }

  floatAt(target, text, kind) {
    if (!target) return;
    const el = target.isOsty
      ? this.root.querySelector('.osty-row')
      : target.isPlayer
        ? (this.root.querySelector('.avatar') || this.root.querySelector('.player-zone'))
        : this.root.querySelector(`[data-enemy="${target.uid}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'floater ' + (kind === 'def' || kind === 'block' ? 'block' : kind === 'heal' ? 'heal' : kind === 'buff' ? 'buff' : kind === 'debuff' ? 'debuff' : '');
    d.textContent = text;
    d.style.left = rect.left + rect.width / 2 + 'px';
    d.style.top = rect.top + rect.height * 0.2 + 'px';
    this.fx.appendChild(d);
    setTimeout(() => d.remove(), 950);
    if (kind === 'dmg' && el.classList.contains('enemy')) {
      el.classList.add('hit');
      setTimeout(() => el.classList.remove('hit'), 300);
    }
  }

  /* ================= 战斗结束 & 奖励 ================= */
  async onCombatFinished() {
    const c = this.combat;
    if (!c || this.combatResolved) return;
    this.closeInfo();
    // 战斗记录浮层是挂在 body 上的独立层（z-index 高于战利品），
    // 战斗结束时如果不收掉，它会盖住刚弹出的战利品，看起来像卡死。
    document.querySelectorAll('.log-modal').forEach(x => x.remove());
    this.combatResolved = true;
    await c.finish();
    const win = c.won;
    this.lastCombatLog = c.log.slice();
    this.lastCombatTitle = c.enemies.map(e => e.name).join('、');
    this.run.hp = c.player.hp;
    if (this.run.hp <= 0) this.run.dead = true;
    this.recordBattle(c, win);
    this.save();
    if (!win) {
      this.combat = null;
      return this.showGameOver(false);
    }
    const isBoss = c.isBoss;
    const isElite = c.isElite;
    // 敌人溜走（训练假人限时）：没有战利品，回到事件
    if (c.timedOut) {
      this.combat = null;
      const after = this._eventCombatAfter;
      this._eventCombatAfter = null;
      if (after) return after(false);
      return this.showMap();
    }
    this.run.stats.combats++;
    if (isElite) { this.run.stats.elites++; this.run.notifyEliteWin(); }
    if (isBoss) this.run.stats.bosses++;
    this.run.notifyCombatWon(isElite, isBoss, c.run.curNode?.type || (isBoss ? 'boss' : 'monster'));

    const rewards = [];
    const gold = this.run.goldForCombat(isElite, isBoss);
    rewards.push({ kind: 'gold', amount: gold });
    if (isElite) {
      const rid = this.run.rollRelic();
      if (rid) rewards.push({ kind: 'relic', id: rid });
    }
    if (isBoss) {
      const rid = this.run.rollBossRelic();
      if (rid) rewards.push({ kind: 'relic', id: rid });
    }
    // 熔岩石：第一幕的 Boss 额外掉落 2 件遗物
    if (isBoss && !this.run.relicData.lavaRockUsed && this.run.relics.includes('LAVA_ROCK')) {
      this.run.relicData.lavaRockUsed = true;
      for (let i = 0; i < 2; i++) {
        const rid = this.run.rollRelic();
        if (rid) rewards.push({ kind: 'relic', id: rid });
      }
    }
    const cards = this.run.rollCardReward(3);
    rewards.push({ kind: 'cards', ids: cards, entries: this.run.rewardMods(cards) });
    const potion = this.run.rollPotion();
    if (potion && this.run.potions.includes(null)) rewards.push({ kind: 'potion', id: potion });
    // 旺购神秘券：攒够 5 场战斗后一次性发 3 件遗物
    while ((this.run.pendingRelicRewards || 0) > 0) {
      const rid = this.run.rollRelic();
      if (rid) rewards.push({ kind: 'relic', id: rid });
      this.run.pendingRelicRewards--;
    }
    // 禁忌魔典：本场战斗结束后额外给的移除机会，在点「继续」之后弹出
    const removals = c.necro?.grimoireRemovals || 0;
    if (removals > 0) { c.necro.grimoireRemovals = 0; rewards.push({ kind: 'remove', count: removals }); }

    this.combat = null;
    this.combatResolved = false;

    const afterRewards = async (next) => {
      for (let i = 0; i < removals; i++) await this.promptRemoveCard();
      this.save();
      next();
    };

    if (isBoss) {
      this.run.bossKilled++;
      this.run.bossQueue.shift();
      await this.showRewards(rewards, () => afterRewards(() => {
        if (this.run.bossQueue.length) {
          // 进阶 10 的双首领：同一幕接着打第二个
          this.run.heal(Math.floor(this.run.maxHp * 0.25));
          this.startCombat('boss', null);
          return;
        }
        // 对照 RunEngine：最后一幕的首领倒下才算通关，否则进入下一幕
        if (this.run.act >= LAST_ACT) { this.showGameOver(true); return; }
        this.run.startAct(this.run.act + 1);
        // 黄金罗盘：第 2 幕的地图被换成一条全是事件的特殊直道
        if (this.run.act === 2 && this.run.relicData.goldenCompass) {
          for (const n of this.run.map.nodes) {
            if (n.type !== 'boss' && n.type !== 'rest' && n.row > 0) { n.type = 'unknown'; n.golden = true; }
          }
        }
        this.save();
        this.showActIntro();
      }));
      return;
    }
    this.showRewards(rewards, () => afterRewards(() => {
      // 事件里发起的战斗：奖励照拿，然后回到事件自己的后续流程
      const after = this._eventCombatAfter;
      if (after) {
        this._eventCombatAfter = null;
        return after(true);
      }
      this.showMap();
    }));
  }

  /** 领取一项战利品，返回用于提示的名字；领不了（药水栏满）返回 null。卡牌不在这里处理 */
  grantReward(r) {
    if (r.kind === 'gold') { this.run.gainGold(r.amount); return `${r.amount} 金币`; }
    if (r.kind === 'relic') { this.run.addRelic(r.id); return RELICS[r.id].name; }
    if (r.kind === 'potion') return this.run.addPotion(r.id) ? POTIONS[r.id].name : null;
    return null;
  }

  showRewards(rewards, onDone) {
    const items = rewards.map((r, i) => {
      if (r.kind === 'gold') return `<div class="choice" data-reward="${i}"><div class="t">◉ ${r.amount} 金币</div><div class="d">点击领取</div></div>`;
      if (r.kind === 'relic') return `<div class="choice" data-reward="${i}"><div class="t">${RELICS[r.id].icon} ${RELICS[r.id].name}</div><div class="d">${rich(RELICS[r.id].desc)}</div></div>`;
      if (r.kind === 'potion') return `<div class="choice" data-reward="${i}"><div class="t">${POTIONS[r.id].icon} ${POTIONS[r.id].name}</div><div class="d">${rich(POTIONS[r.id].desc)}</div></div>`;
      if (r.kind === 'remove') return `<div class="choice sold"><div class="t">✂️ 移除一张牌</div><div class="d">禁忌魔典：点「继续」后选择要移除的牌</div></div>`;
      return '';
    }).join('');

    const cardChoices = rewards.find(r => r.kind === 'cards');
    const cardList = cardChoices
      ? (cardChoices.entries || cardChoices.ids.map(id => ({ id, upgraded: false, enchant: null })))
      : [];
    const cardGrid = cardList.length
      ? cardList.map(o => cardHTML(makeCard(o.id, !!o.upgraded), {})).join('')
      : '<div class="sheet-sub" style="padding:10px 0">这次没有卡牌奖励</div>';
    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">战利品</div>
      <div class="sheet-sub">选一张卡牌加入牌组。长按卡牌可以先看完整说明，选好后会再确认一次。</div>
      <div class="sheet-body">
        <div class="choices" id="loot-list">${items}</div>
        <div class="sheet-sub" style="margin-top:16px">卡牌奖励</div>
        <div class="reward-grid" id="card-reward">
          ${cardGrid}
        </div>
      </div>
      <div class="reward-tip" id="reward-tip">点「继续」会收下所有还没领的金币和道具</div>
      <div class="log-actions">
        <button class="btn" id="view-log">📜 上一战记录</button>
        <button class="btn primary" id="skip-reward">${cardChoices ? '跳过卡牌，继续' : '继续'}</button>
      </div>
    </div>`);

    const taken = new Set();
    let cardPicked = false;
    this.overlay.onclick = async (e) => {
      if (e.target.closest('#view-log')) { this.showCombatLog(); return; }
      const rEl = e.target.closest('[data-reward]');
      if (rEl) {
        const i = +rEl.dataset.reward;
        if (taken.has(i)) return;
        const r = rewards[i];
        // 药水栏位先检查，别让玩家确认完才发现收不下
        if (r.kind === 'potion' && !this.run.potions.includes(null)) { this.toast('药水栏位已满，先喝掉一瓶'); return; }
        if (!(await this.askConfirm(this.rewardConfirm(r)))) return;
        // 确认期间界面可能已经翻页（点「继续」等），收手
        if (!$('#loot-list')) return;
        if (taken.has(i)) return;
        const name = this.grantReward(r);
        if (!name) { this.toast('药水栏位已满，先喝掉一瓶'); return; }
        taken.add(i);
        rEl.classList.add('sold');
        this.toast(r.kind === 'gold' ? `+${r.amount} 金币` : `获得 ${name}`);
        this.updateRewardTip(rewards, taken, cardChoices);
        return;
      }
      const cardEl = e.target.closest('#card-reward [data-uid]');
      if (cardEl && cardChoices) {
        if (cardPicked) return;
        const idx = [...$('#card-reward').children].indexOf(cardEl);
        const opt = cardList[idx];
        if (!opt) return;
        const def = CARDS[opt.id];
        const typeLabel = { attack: '攻击', skill: '技能', power: '能力', status: '状态', curse: '诅咒' }[def.type] || '';
        const ok = await this.askConfirm({
          title: `确认选择「${def.name}」？`,
          sub: `${typeLabel}${typeof def.cost === 'number' ? ` · ${def.cost} 费` : ' · X 费'}${def.stars ? ` · ✦ ${def.stars} 星愿` : ''}`,
          body: '确认后这张牌加入牌组，本次另外两张卡牌奖励视为放弃。',
          okText: '加入牌组',
          cancelText: '再看看',
        });
        if (!ok || cardPicked || !$('#card-reward')) return;
        const entry = this.run.addCard(opt.id, !!opt.upgraded);
        if (opt.enchant && entry) entry.enchant = opt.enchant;
        cardPicked = true;
        // 只标记被选中的那张，另外两张淡化但仍可长按看牌，避免整片变黑看不懂发生了什么
        [...$('#card-reward').children].forEach(el => el.classList.add(el === cardEl ? 'picked' : 'unpicked'));
        this.toast(`获得 ${CARDS[opt.id].name}`);
        $('#skip-reward').textContent = '继续';
        this.updateRewardTip(rewards, taken, cardChoices, true);
        return;
      }
      if (e.target.closest('#skip-reward')) {
        // 兜底：卡牌以外还没领的一律收下，避免「点了继续就丢奖励」
        const got = [];
        rewards.forEach((r, i) => {
          if (r.kind === 'cards' || r.kind === 'remove' || taken.has(i)) return;
          const name = this.grantReward(r);
          if (name) { taken.add(i); got.push(name); }
        });
        if (got.length) this.toast(`一并收下：${got.join('、')}`, 1900);
        this.clearOverlay();
        this.overlay.onclick = null;
        this.save();
        onDone();
      }
    };
    this.updateRewardTip(rewards, taken, cardChoices);
  }

  /** 战利品里非卡牌单项的确认文案 */
  rewardConfirm(r) {
    if (r.kind === 'gold') {
      return { title: `领取 ${r.amount} 金币？`, sub: `当前持有 ${this.run.gold} 金币`, okText: `领取 ${r.amount} 金币`, cancelText: '取消' };
    }
    if (r.kind === 'relic') {
      const d = RELICS[r.id];
      return { title: `收下遗物「${d.name}」？`, sub: d.desc, okText: '收下遗物', cancelText: '取消' };
    }
    if (r.kind === 'potion') {
      const d = POTIONS[r.id];
      return { title: `收下药水「${d.name}」？`, sub: d.desc, okText: '收下药水', cancelText: '取消' };
    }
    return { title: '确认领取？', okText: '确认', cancelText: '取消' };
  }

  /** 奖励页底部提示：还没领的还剩几项 */
  updateRewardTip(rewards, taken, cardChoices, cardPicked = false) {
    const el = $('#reward-tip');
    if (!el) return;
    const left = rewards.filter((r, i) => r.kind !== 'cards' && r.kind !== 'remove' && !taken.has(i));
    if (cardPicked && !left.length) { el.textContent = '奖励已全部收下'; return; }
    const names = left.map(r => r.kind === 'gold' ? `${r.amount} 金币` : r.kind === 'relic' ? RELICS[r.id].name : POTIONS[r.id].name);
    el.textContent = names.length
      ? `点「继续」会收下：${names.join('、')}`
      : '金币和道具已全部收下';
  }

  /* ================= 休息处 ================= */
  showRest() {
    const run = this.run;
    // 古茶具套装：到过休息处后，下一场战斗第一回合多 1 点能量
    if (run.relics.includes('FAKE_VENERABLE_TEA_SET')) run.relicData.teaSetArmed = true;
    const healAmt = Math.floor(run.maxHp * (run.asc >= 2 ? 0.25 : 0.3));
    const feather = run.relics.includes('ETERNAL_FEATHER') ? Math.floor(run.deck.length / 5) * 3 : 0;
    const canGirya = run.relics.includes('GIRYA') && (run.giryaCount || 0) < 3;

    const choices = [];
    choices.push({
      label: `休息 · 回复 ${healAmt + feather} 点生命`,
      desc: feather ? `（含永恒羽毛 ${feather} 点）` : '',
      act: async () => {
        run.heal(healAmt + feather);
        run.notifyRestHeal();
        // 捕梦网：休息时可以再挑一张牌加入牌组
        if (run.relics.includes('DREAM_CATCHER')) await this.cardReward();
      },
    });
    choices.push({ label: '锻造 · 升级一张牌', desc: '选择牌组中的一张牌升级', act: async () => { await this.promptUpgradeCard(); } });
    // 切肉刀：烹饪（移除 2 张牌，回复 8 点生命）
    if (run.relics.includes('MEAT_CLEAVER') && run.deck.filter(d => CARDS[d.id]).length >= 2) {
      choices.push({
        label: '烹饪 · 移除2张牌并回复8点生命', desc: '切肉刀',
        act: async () => { await this.promptRemoveCard(); await this.promptRemoveCard(); run.heal(8); },
      });
    }
    // 南瓜蜡烛：重新点燃（+5 场战斗的能量）
    if (run.relics.includes('PUMPKIN_CANDLE') && (run.relicData.pumpkinCandle || 0) <= 0) {
      choices.push({
        label: '点燃 · 南瓜蜡烛重新燃起', desc: '接下来 5 场战斗每回合 +1 能量',
        act: () => { run.relicData.pumpkinCandle = 5; },
      });
    }
    // 佩尔的增生组织：克隆附魔的牌可以在休息处复制
    const cloneable = run.deck.filter(d => d.enchant === 'CLONE');
    if (cloneable.length) {
      choices.push({
        label: '克隆 · 复制一张附魔牌', desc: `牌组里有 ${cloneable.length} 张「克隆」牌`,
        act: async () => {
          const cards = cloneable.map(d => makeCard(d.id, d.upgraded));
          const picked = await this.requestSelection({ pool: cards, count: 1, prompt: '选择要复制的牌' });
          if (!picked.length) return;
          const src = cloneable[cards.indexOf(picked[0])];
          if (!src) return;
          const entry = run.addCard(src.id, src.upgraded);
          if (src.enchant) entry.enchant = src.enchant;
        },
      });
    }
    if (canGirya) choices.push({ label: '锻炼 · 获得 1 点力量', desc: `壶铃（${run.giryaCount || 0}/3）`, act: () => { run.giryaCount = (run.giryaCount || 0) + 1; run.addRelic('GIRYA'); this.run.strengthBonus = (this.run.strengthBonus || 0) + 1; run.relics = run.relics.filter(r => r !== 'GIRYA'); run.relics.push('GIRYA'); run.giryaStrength = (run.giryaStrength || 0) + 1; } });
    // 多尼斯异鸟蛋：休息处可以孵化（对照 ByrdonisEgg.ModifyAvailableRestSiteDecisions）
    if (run.deck.some(d => d.id === 'BYRDONIS_EGG') && !run.relics.includes('BYRDPIP')) {
      choices.push({
        label: '孵化 · 多尼斯异鸟蛋',
        desc: '蛋孵化成「异鸟扑击」，并获得「异鸟宝宝」',
        act: () => { run.addRelic('BYRDPIP'); this.toast('异鸟宝宝加入了队伍'); },
      });
    }

    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">休息处</div>
      <div class="sheet-sub">篝火噼啪作响，你可以做一件事。</div>
      <div class="sheet-body"><div class="choices" id="rest-list"></div></div>
    </div>`);
    const list = $('#rest-list');
    choices.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `<div class="t">${ch.label}</div>${ch.desc ? `<div class="d">${ch.desc}</div>` : ''}`;
      b.onclick = async () => {
        this.clearOverlay();
        await ch.act();
        this.save();
        this.showMap();
      };
      list.appendChild(b);
    });
  }

  /* ================= 商店 ================= */

  /** 商店里某个货位的价格/售出状态（remove 服务没有 item 对象，这里统一成一份） */
  shopEntry(kind, idx) {
    const s = this.shopStock;
    if (!s) return null;
    if (kind === 'card') return s.cards[idx];
    if (kind === 'relic') return s.relics[idx];
    if (kind === 'potion') return s.potions[idx];
    return { price: s.removePrice, sold: s.removed };
  }

  showShop() {
    const prevScroll = $('.sheet')?.scrollTop || 0;
    if (!this.shopStock) this.shopStock = this.run.makeShop();
    const s = this.shopStock;
    const run = this.run;
    // 领主阳伞：进店时立刻免费拿走所有商品（对照 LordsParasol.AfterRoomEntered）
    if (run.relicData.lordsParasol && !s.parasolDone) {
      s.parasolDone = true;
      const got = [];
      for (const c of s.cards) if (!c.sold) { run.addCard(c.id); c.sold = true; got.push(CARDS[c.id].name); }
      for (const r of s.relics) if (!r.sold) { run.addRelic(r.id); r.sold = true; got.push(RELICS[r.id].name); }
      for (const p of s.potions) if (!p.sold && run.addPotion(p.id)) { p.sold = true; got.push(POTIONS[p.id].name); }
      if (got.length) this.toast(`领主阳伞：免费收下 ${got.length} 件商品`, 2400);
      this.save();
    }
    const potionFull = !run.potions.includes(null);

    // 一行商品：图标 + 名称/摘要 + 价格/状态。点整行先看详情，再确认购买
    const row = ({ attr, i, icon, name, tag, descHtml, price, sold, extra = '' }) => {
      const isPoor = !sold && run.gold < price;
      const state = sold ? '已售出' : isPoor ? `还差 ${price - run.gold}` : '详情 ›';
      return `<div class="shop-item ${sold ? 'sold' : ''} ${isPoor ? 'poor' : ''}" ${attr}="${i}">
        <div class="shop-mini">${icon}</div>
        <div class="shop-main">
          <div class="shop-name">${esc(name)}${tag ? `<span class="shop-tag">${tag}</span>` : ''}${extra}</div>
          <div class="shop-desc">${descHtml}</div>
        </div>
        <div class="shop-right">
          <div class="price">◉ ${price}</div>
          <div class="shop-more">${state}</div>
        </div>
      </div>`;
    };

    const cardRow = (item, i) => {
      const def = CARDS[item.id];
      const card = makeCard(item.id);
      const rarity = { common: '普通', uncommon: '罕见', rare: '稀有', basic: '初始', event: '事件', quest: '任务' }[def.rarity] || '';
      const type = { attack: '攻击', skill: '技能', power: '能力' }[def.type] || '';
      return row({
        attr: 'data-buy-card', i,
        icon: { attack: '⚔', skill: '✧', power: '✦' }[def.type] || '✦',
        name: def.name,
        tag: [rarity, type].filter(Boolean).join('·'),
        descHtml: fmtText(def, card),
        price: item.price, sold: item.sold,
      });
    };

    const relicRow = (item, i) => row({
      attr: 'data-buy-relic', i,
      icon: RELICS[item.id].icon,
      name: RELICS[item.id].name,
      tag: '遗物',
      descHtml: rich(RELICS[item.id].desc),
      price: item.price, sold: item.sold,
    });

    const potionRow = (item, i) => row({
      attr: 'data-buy-potion', i,
      icon: POTIONS[item.id].icon,
      name: POTIONS[item.id].name,
      tag: '药水',
      descHtml: rich(POTIONS[item.id].desc),
      price: item.price, sold: item.sold,
      extra: potionFull && !item.sold ? '<span class="shop-tag warn">栏位已满</span>' : '',
    });

    this.setOverlay(`<div class="sheet">
      <div class="hud" style="padding:0 0 8px">
        <div class="hud-chip gold"><span class="ic">◉</span>${run.gold}</div>
        <div class="spacer"></div>
        <button class="btn small" id="leave-shop" style="padding:7px 14px">离开商店</button>
      </div>
      <div class="sheet-title">商店</div>
      <div class="sheet-sub">点任意商品先看效果，确认后再付钱；长按卡牌可看完整说明与升级效果。</div>
      <div class="sheet-body">
        <div class="sheet-sub">卡牌</div>${s.cards.map(cardRow).join('')}
        <div class="sheet-sub" style="margin-top:12px">遗物</div>${s.relics.map(relicRow).join('')}
        <div class="sheet-sub" style="margin-top:12px">药水</div>${s.potions.map(potionRow).join('')}
        <div class="sheet-sub" style="margin-top:12px">服务</div>
        ${row({
          attr: 'data-remove-card', i: 1, icon: '✂️', name: '移除一张牌', tag: '服务',
          descHtml: '从牌组中永久移除一张牌，精简牌组能提高关键牌的抽取率。',
          price: s.removePrice, sold: s.removed,
        })}
      </div>
    </div>`);

    $('#leave-shop').onclick = () => { this.shopStock = null; this.clearOverlay(); this.save(); this.showMap(); };

    // 买完重渲染时保住滚动位置，不然一买东西就被弹回顶部
    const sheetEl = this.overlay.querySelector('.sheet');
    if (sheetEl && prevScroll) sheetEl.scrollTop = prevScroll;

    // 点商品 → 详情确认层（不再直接扣钱）
    this.overlay.onclick = (e) => {
      const card = e.target.closest('[data-buy-card]');
      if (card) return this.openShopDetail('card', +card.dataset.buyCard);
      const relic = e.target.closest('[data-buy-relic]');
      if (relic) return this.openShopDetail('relic', +relic.dataset.buyRelic);
      const potion = e.target.closest('[data-buy-potion]');
      if (potion) return this.openShopDetail('potion', +potion.dataset.buyPotion);
      if (e.target.closest('[data-remove-card]')) return this.openShopDetail('remove', 1);
    };
  }

  /** 商品详情 + 购买确认 */
  openShopDetail(kind, idx) {
    const run = this.run;
    const item = this.shopEntry(kind, idx);
    if (!item || item.sold) return;

    let title = '', tag = '', body = '';
    if (kind === 'card') {
      const def = CARDS[item.id];
      const rarity = { common: '普通', uncommon: '罕见', rare: '稀有', event: '事件', quest: '任务' }[def.rarity] || '';
      const type = { attack: '攻击', skill: '技能', power: '能力' }[def.type] || '';
      title = def.name;
      tag = [rarity, type].filter(Boolean).join(' · ');
      body = `<div class="shop-preview">${cardHTML(makeCard(item.id), { link: true })}</div>
        <div class="shop-preview-note">买下后直接加入牌组，永久保留</div>`;
    } else if (kind === 'relic') {
      const r = RELICS[item.id];
      title = r.name; tag = '遗物';
      body = `<div class="shop-big">${r.icon}</div>
        <div>${esc(r.desc).replace(/\n/g, '<br>')}</div>
        <div class="shop-preview-note">遗物常驻生效，不占牌组</div>`;
    } else if (kind === 'potion') {
      const p = POTIONS[item.id];
      title = p.name; tag = '药水';
      body = `<div class="shop-big">${p.icon}</div>
        <div>${esc(p.desc)}</div>
        <div class="shop-preview-note">拿到后可在战斗中随时使用，一次性消耗</div>`;
    } else {
      title = '移除一张牌'; tag = '服务';
      body = `<div class="shop-big">✂️</div>
        <div>从牌组中永久移除一张牌。牌组越薄，关键牌上手越快。</div>
        <div class="shop-preview-note">每个商店只能使用一次</div>`;
    }

    // 购买按钮的三种状态：可买 / 金币不足 / 药水栏满
    let note = '', btn = `<button class="btn primary" id="shop-buy">购买 · ◉ ${item.price}</button>`;
    if (kind === 'potion' && !run.potions.includes(null)) {
      note = '药水栏位已满，先喝掉一瓶再来买。';
      btn = `<button class="btn primary" id="shop-buy" disabled>药水栏位已满</button>`;
    } else if (run.gold < item.price) {
      note = `你还差 ${item.price - run.gold} 金币。`;
      btn = `<button class="btn primary" id="shop-buy" disabled>金币不足</button>`;
    }

    this.overlay.insertAdjacentHTML('beforeend', `<div class="shop-detail-mask" id="shop-detail-mask">
      <div class="shop-detail">
        <div class="shop-detail-head"><span class="shop-detail-title">${esc(title)}</span>${tag ? `<span class="shop-tag">${tag}</span>` : ''}</div>
        <div class="shop-detail-body">${body}</div>
        ${note ? `<div class="shop-detail-note">${note}</div>` : ''}
        <div class="shop-detail-actions">
          <button class="btn" id="shop-cancel">再看看</button>
          ${btn}
        </div>
      </div>
    </div>`);

    const mask = $('#shop-detail-mask');
    mask.onclick = (ev) => {
      ev.stopPropagation();
      if (ev.target === mask || ev.target.closest('#shop-cancel')) { mask.remove(); return; }
      if (!ev.target.closest('#shop-buy')) return;
      if (kind === 'remove') { mask.remove(); this.doShopRemove(); return; }
      if (this.buyShopItem(kind, idx)) { mask.remove(); this.showShop(); }
    };
  }

  buyShopItem(kind, idx) {
    const run = this.run;
    const item = this.shopEntry(kind, idx);
    if (!item || item.sold) return false;
    if (kind === 'potion' && !run.potions.includes(null)) { this.toast('药水栏位已满'); return false; }
    if (run.gold < item.price) { this.toast('金币不足'); return false; }
    run.gainGold(-item.price);
    run.relicData.mawBankSpent = true;
    item.sold = true;
    if (kind === 'card') { run.addCard(item.id); this.toast(`获得 ${CARDS[item.id].name}`); }
    else if (kind === 'relic') { run.addRelic(item.id); this.toast(`获得 ${RELICS[item.id].name}`); }
    else if (kind === 'potion') { run.addPotion(item.id); this.toast(`获得 ${POTIONS[item.id].name}`); }
    this.save();
    return true;
  }

  async doShopRemove() {
    const s = this.shopStock;
    const run = this.run;
    if (!s || s.removed) return;
    if (run.gold < s.removePrice) { this.toast('金币不足'); return; }
    const picked = await this.requestSelection({ pool: run.deck.map(d => makeCard(d.id, d.upgraded)).map((c, i) => ({ ...c, _entry: run.deck[i] })), count: 1, prompt: '选择要移除的牌', confirm: '移除' });
    if (!picked.length) return;
    run.gainGold(-s.removePrice);
    run.removeCard(picked[0]._entry);
    s.removed = true;
    this.toast('已移除');
    this.save();
    this.showShop();
  }

  /* ================= 宝箱 ================= */
  showTreasure() {
    const gold = this.run.rng.range(20, 35);
    const rid = this.run.rollRelic();
    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">宝箱</div>
      <div class="sheet-sub">箱盖弹开，里面躺着些东西。</div>
      <div class="sheet-body">
        <div class="choices">
          <div class="choice"><div class="t">◉ ${gold} 金币</div><div class="d">自动获得</div></div>
          ${rid ? `<div class="choice"><div class="t">${RELICS[rid].icon} ${RELICS[rid].name}</div><div class="d">${rich(RELICS[rid].desc)}</div></div>` : ''}
        </div>
      </div>
      <button class="btn primary" id="take-treasure">收下</button>
    </div>`);
    $('#take-treasure').onclick = () => {
      this.run.gainGold(gold);
      if (rid) this.run.addRelic(rid);
      this.clearOverlay();
      this.save();
      this.showMap();
    };
  }

  /* ================= 事件 ================= */
  showEvent() {
    const run = this.run;
    // 事件池里可能堆着条件不满足（钱不够 / 没有可附魔的牌…）的条目，先跳过它们
    let id = null;
    while (run.eventPool.length) {
      const cand = run.eventPool.shift();
      const def = EVENTS[cand];
      if (!def) continue;
      if (def.allowed && !def.allowed(this)) continue;
      id = cand;
      break;
    }
    if (!id) id = Object.keys(EVENTS)[0];
    this.renderEvent(id, 'INITIAL');
  }

  /** 渲染事件的一段。多段事件（挖花、审判、打造时间…）用 page 切换 */
  renderEvent(id, page = 'INITIAL') {
    const ev = EVENTS[id];
    if (!ev) { this.showMap(); return; }
    const run = this.run;
    if (page === 'INITIAL') this._evs = {};
    const pg = page === 'INITIAL' ? { text: ev.text, choices: ev.choices } : ev.pages?.[page];
    if (!pg) { this.showMap(); return; }
    this._eventFinished = false;
    const choices = pg.choices(this);
    const text = typeof pg.text === 'function' ? pg.text(this) : (pg.text || '');

    this.setOverlay(`<div class="sheet">
      <div class="event-art">${esc(ev.title.slice(0, 1))}</div>
      <div class="sheet-title">${esc(ev.title)}</div>
      <div class="ev-hud">
        <span>❤ <b class="${run.hp <= run.maxHp * 0.25 ? 'low' : ''}">${run.hp}</b> / ${run.maxHp}</span>
        <span>金币 <b>${run.gold}</b></span>
      </div>
      <div class="event-text">${rich(text)}</div>
      <div class="sheet-body"><div class="choices" id="event-list"></div></div>
    </div>`);
    const list = $('#event-list');
    choices.forEach((ch) => {
      const b = document.createElement('button');
      b.className = 'choice' + (ch.disabled ? ' sold' : '');
      b.innerHTML = `<div class="t">${esc(ch.label)}</div>${ch.desc ? `<div class="d">${rich(ch.desc)}</div>` : ''}`;
      b.onclick = async () => {
        if (ch.disabled) return;
        const ok = await this.askConfirm({
          title: `确认选择「${ch.label}」？`,
          body: `${ch.desc ? rich(ch.desc) + '<br>' : ''}事件里的选择通常无法反悔。`,
          okText: '确认选择',
          cancelText: '再想想',
        });
        if (!ok) return;
        this.clearOverlay();
        await ch.apply();
        // 事件伤害可能把人打死（深渊浴场、滑脚木桥…），死了就不再往下走
        if (this.checkDeath()) return;
        // 跳到别的一段 / 进入战斗的选项自己接管后续流程；其余选项到此结束
        if (!ch.page && !ch.combat && !this._eventFinished) this.eventDone();
      };
      list.appendChild(b);
    });
  }

  /** 事件里跳到另一段（同一次事件，不消耗事件池） */
  eventPage(id, page) { this.renderEvent(id, page); }

  /** 事件结束后回到地图 */
  eventDone() {
    this._eventFinished = true;
    if (this.checkDeath()) return;      // 最后一下掉血致死时不回地图，直接结算
    this.save();
    this.showMap();
  }

  /* ================= 选择卡牌 ================= */
  requestSelection({ pool, count = 1, prompt = '选择卡牌', optional = false, multi = false, confirm = '' }) {
    // 战斗打完了就不用再问了（否则面板会盖住战利品界面，流程走不下去）。
    // 注意：商店/事件的删牌、升级也会走这里，那时 combat 是 null，不能被拦。
    if (this.combat && this.combat.finished) return Promise.resolve([]);
    return new Promise((resolve) => {
      const cards = pool.slice();
      let selected = [];
      const multiMode = multi || count > 1;
      const settle = (val) => {
        if (this.combat) this.combat._cancelSelection = null;
        resolve(val);
      };
      // 引擎在战斗结束时可以强制收掉这个面板（商店/事件里 combat 为 null，不能直接挂）
      if (this.combat) this.combat._cancelSelection = () => {
        if ($('#sel-grid')) this.clearOverlay();
        settle([]);
      };
      this.setOverlay(`<div class="sheet">
        <div class="sheet-title">${esc(prompt)}</div>
        <div class="sheet-sub">${count > 1 ? `最多选择 ${count} 张` : '点击选择'}</div>
        <div class="sheet-body"><div class="reward-grid" id="sel-grid"></div></div>
        <div class="row" style="gap:8px">
          <button class="btn" id="sel-cancel" style="flex:1">取消</button>
          <button class="btn primary" id="sel-confirm" style="flex:1">确认</button>
        </div>
      </div>`);
      const grid = $('#sel-grid');
      const paint = () => {
        grid.innerHTML = cards.map(c => cardHTML(c, { selected: selected.some(s => s.uid === c.uid) })).join('');
      };
      paint();
      grid.onclick = async (e) => {
        const el = e.target.closest('[data-uid]');
        if (!el) return;
        const card = cards.find(c => c.uid === el.dataset.uid);
        if (!card) return;
        if (!multiMode) {
          // confirm 只在「点一下就直接生效」的场景传入（商店删牌），战斗中选牌不加，免得拖节奏
          if (confirm) {
            const ok = await this.askConfirm({
              title: `确认${confirm}「${card.name}」？`,
              sub: '这个操作会直接改动你的牌组，不能撤销。',
              okText: confirm,
              cancelText: '再想想',
            });
            if (!ok || !$('#sel-grid')) return;
          }
          this.clearOverlay(); settle([card]); return;
        }
        const i = selected.findIndex(s => s.uid === card.uid);
        if (i >= 0) selected.splice(i, 1);
        else if (selected.length < count) selected.push(card);
        paint();
      };
      $('#sel-cancel').onclick = () => { this.clearOverlay(); settle([]); };
      $('#sel-confirm').onclick = () => { this.clearOverlay(); settle(selected); };
    });
  }

  /* ================= 事件用到的便捷操作 ================= */
  heal(n) { const got = this.run.heal(n); this.toast(`回复 ${Math.max(0, got)} 点生命`); }
  /** 事件伤害可以是致命的，收尾统一交给 checkDeath() */
  damage(n) { const lost = this.run.damage(n); this.toast(`失去 ${lost} 点生命`); }
  /**
   * 非战斗场合掉血到 0：收掉覆盖层、直接进结算。
   * 事件里有「先掉血再给奖励」的写法，所以只在一次选择结束后判一次，
   * 不能一掉到 0 就当场打断（否则奖励和后续分支都会丢）。
   * @returns {boolean} 是否已经死亡
   */
  checkDeath() {
    if (!this.run || this.run.hp > 0) return false;
    if (this._gameOver) return true;
    this.clearOverlay();
    this.combat = null;
    this.showGameOver(false);
    return true;
  }
  gainGold(n) { this.run.gainGold(n); this.toast(n >= 0 ? `获得 ${n} 金币` : `失去 ${-n} 金币`); }
  gainMaxHp(n) { this.run.gainMaxHp(n); this.toast(n >= 0 ? `最大生命 +${n}` : `最大生命 ${n}`); }
  loseMaxHp(n) { this.run.gainMaxHp(-n); this.toast(`最大生命 -${n}`); }
  addPotionById(id) {
    if (this.run.addPotion(id)) this.toast(`获得 ${POTIONS[id].name}`);
    else this.toast('药水栏位已满');
  }
  addRelicOfTier(tier) {
    const id = this.run.rollRelic(tier);
    if (id) { this.run.addRelic(id); this.toast(`获得 ${RELICS[id].name}`); }
    return id;
  }
  /** 事件里「给一张牌附魔」，按类型过滤（'attack' / 'skill' / 'power' / 'basic'） */
  enchantOfType(kind, type) {
    return this.enchantChoice(kind, (def) => {
      if (!def) return false;
      if (type === 'basic') return def.rarity === 'basic' && (def.tags || []).some((t) => t === 'strike' || t === 'defend');
      return def.type === type;
    });
  }
  addPotionRandom() {
    const id = this.run.rollPotion();
    if (id && this.run.addPotion(id)) this.toast(`获得 ${POTIONS[id].name}`);
    else this.toast('药水栏位已满');
  }
  addRelicRandom() {
    const id = this.run.rollRelic();
    if (id) { this.run.addRelic(id); this.toast(`获得 ${RELICS[id].name}`); }
  }
  gainRandomCard(rarity) {
    const ids = this.run.rollCardReward(1, { rarity });
    if (ids.length) { this.run.addCard(ids[0]); this.toast(`获得 ${CARDS[ids[0]].name}`); }
  }
  upgradeRandomCard() {
    const pool = this.run.deck.filter(d => !d.upgraded && CARDS[d.id].rarity !== 'status' && CARDS[d.id].rarity !== 'curse');
    if (!pool.length) { this.toast('没有可升级的牌'); return; }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    pick.upgraded = true;
    this.toast(`升级了 ${CARDS[pick.id].name}`);
  }
  removeCardPrompt() { return this.promptRemoveCard(); }

  /* ================= 事件专用操作 ================= */
  addCardById(id, upgraded = false) {
    this.run.addCard(id, upgraded);
    this.toast(`获得 ${CARDS[id].name}`);
  }
  addRelicById(id) {
    this.run.addRelic(id);
    this.toast(`获得 ${RELICS[id].name}`);
  }
  async removeCards(n = 1) {
    for (let i = 0; i < n; i++) await this.promptRemoveCard();
  }
  upgradablePool() {
    return this.run.deck.filter(d => {
      const def = CARDS[d.id];
      return !d.upgraded && def && def.rarity !== 'status' && def.rarity !== 'curse' && def.rarity !== 'quest';
    });
  }
  upgradeRandomN(n) {
    const pool = this.upgradablePool();
    let done = 0;
    for (let i = 0; i < n && pool.length; i++) {
      const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      pick.upgraded = true;
      done++;
      this.toast(`升级了 ${CARDS[pick.id].name}`);
    }
    if (!done) this.toast('没有可升级的牌');
  }
  downgradeRandomN(n) {
    const pool = this.run.deck.filter(d => d.upgraded);
    for (let i = 0; i < n && pool.length; i++) {
      const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      pick.upgraded = false;
    }
  }
  duplicateDeck() {
    const copies = this.run.deck.map(d => ({ ...d, uid: 'd' + Math.random().toString(36).slice(2, 9) }));
    this.run.deck.push(...copies);
    this.toast(`复制了 ${copies.length} 张牌`);
  }
  transformRandomN(n) {
    const pool = this.run.deck.filter(d => {
      const def = CARDS[d.id];
      return def && !['status', 'curse', 'quest'].includes(def.rarity);
    });
    for (let i = 0; i < n && pool.length; i++) {
      const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const ids = this.run.rollCardReward(1);
      if (!ids.length) break;
      pick.id = ids[0];
      pick.upgraded = false;
    }
  }
  /** 这张牌能不能被「变化」（对照 CardModel.IsTransformable：任务牌与非永恒牌之外都行） */
  isTransformable(id) {
    const def = CARDS[id];
    return !!def && def.type !== 'quest' && !def.eternal;
  }
  /** 从牌组里挑 n 张牌变化成随机牌（混沌芳香 / 变形灵林谷） */
  async transformChoice(n = 1) {
    for (let i = 0; i < n; i++) {
      const pool = this.run.deck.filter(d => this.isTransformable(d.id));
      if (!pool.length) { this.toast('没有可以变化的牌'); return; }
      const cards = pool.map(d => makeCard(d.id, d.upgraded));
      const picked = await this.requestSelection({ pool: cards, count: 1, prompt: '选择要变化的牌' });
      if (!picked.length) return;
      const entry = pool[cards.indexOf(picked[0])];
      if (!entry) return;
      const ids = this.run.rollCardReward(1);
      if (!ids.length) return;
      this.run.transformEntry(entry, ids[0], false);
      this.toast(`变化为 ${CARDS[ids[0]].name}`);
    }
  }
  /** 是否已经有「事件宠物」（异鸟宝宝 / 佩尔的士兵，或牌组里还揣着蛋） */
  hasEventPet() {
    if (this.run.relics.includes('BYRDPIP') || this.run.relics.includes('PAELS_LEGION')) return true;
    return this.run.deck.some(d => d.id === 'BYRDONIS_EGG');
  }
  async pickCards(ids, prompt, opts = {}) {
    const picked = await this.requestSelection({
      pool: ids.map(id => makeCard(id)), count: 1, prompt, optional: !!opts.optional,
    });
    return picked[0] || null;
  }
  killPlayer() {
    this._eventFinished = true;
    this.run.hp = 0;
    this.run.dead = true;
    this.showGameOver(false);
  }
  /** 事件里发起的战斗：encId 只是标识，enemyIds 决定出场敌人；opts 可带 slots / repeat */
  eventCombat(encId, enemyIds, after, opts = {}) {
    const enc = { id: encId, units: enemyIds.map(id => [id]), ...opts };
    this.startCombat('normal', null, enc, after);
  }

  /* ---- 事件里更细的操作 ---- */
  /** 熔合者：移除 2 张基础打击/防御，换成对应的究极牌 */
  combineBasics(tag, newId) {
    const pool = this.run.deck.filter(d => {
      const def = CARDS[d.id];
      return def && def.rarity === 'basic' && (def.tags || []).includes(tag);
    });
    pool.slice(0, 2).forEach(d => this.run.removeCard(d));
    this.run.addCard(newId);
    this.toast(`融合完成：获得 ${CARDS[newId].name}`);
  }
  /** 色彩哲学家：三名其他角色的石像（颜色顺序同原作，随机去掉一人） */
  philosopherChoices() {
    const order = ['NECROBINDER', 'IRONCLAD', 'REGENT', 'SILENT', 'DEFECT'];
    const colorName = { NECROBINDER: '粉色', IRONCLAD: '红色', REGENT: '橙色', SILENT: '绿色', DEFECT: '蓝色' };
    const cands = order.filter(id => id !== this.run.charId);
    while (cands.length > 3) cands.splice(this.run.rng.int(cands.length), 1);
    return cands.map(id => ({
      label: colorName[id],
      desc: `获得3张${CHARACTER_BY_ID[id]?.name || id}的卡牌（普通/罕见/稀有各三选一）`,
      apply: async () => { await this.pickCharacterCards(id); this.eventDone(); },
    }));
  }
  async pickCharacterCards(charId) {
    const name = { common: '普通', uncommon: '罕见', rare: '稀有', event: '事件', quest: '任务' };
    for (const rarity of ['common', 'uncommon', 'rare']) {
      const ids = Object.values(CARDS)
        .filter(d => d.rarity === rarity && d.char === charId && d.type !== 'status' && d.type !== 'curse')
        .map(d => d.id);
      if (!ids.length) continue;
      const picks = this.run.rng.pickMany(ids, 3);
      const picked = await this.pickCards(picks, `选择一张${name[rarity]}牌`);
      if (picked) this.run.addCard(picked.id);
    }
  }
  /** 附魔：只改牌组条目的标记，战斗开始时套到卡牌实例上 */
  async enchantChoice(kind, filter = null) {
    let pool = this.run.deck.slice();
    // 兼容旧写法：第二个参数为 true 表示「只要带消耗的牌」
    if (filter === true) pool = pool.filter(d => CARDS[d.id]?.exhaustOnPlay);
    else if (typeof filter === 'function') pool = pool.filter(d => filter(CARDS[d.id]));
    if (!pool.length) { this.toast('没有可以附魔的牌'); return; }
    const cards = pool.map(d => makeCard(d.id, d.upgraded));
    const picked = await this.requestSelection({ pool: cards, count: 1, prompt: '选择要附魔的牌' });
    if (!picked.length) return;
    const entry = pool[cards.indexOf(picked[0])];
    if (!entry) return;
    entry.enchant = kind;
    this.toast(`附魔完成：${ENCHANT_NAMES[kind] || kind}`);
  }
  /** 选牌升级（不传张数时升 1 张） */
  async upgradeChoice(n = 1) {
    for (let i = 0; i < n; i++) {
      const pool = this.upgradablePool();
      if (!pool.length) { this.toast('没有可升级的牌'); return; }
      const cards = pool.map(d => makeCard(d.id, d.upgraded));
      const picked = await this.requestSelection({ pool: cards, count: 1, prompt: '选择要升级的牌' });
      if (!picked.length) return;
      const entry = pool[cards.indexOf(picked[0])];
      if (entry) entry.upgraded = true;
    }
  }
  gainRandomOfType(type) {
    const id = CARDS && Object.values(CARDS)
      .filter(d => d.type === type && !['status', 'curse', 'event', 'quest', 'token', 'basic'].includes(d.rarity))
      .filter(d => !d.char || d.char === 'NEUTRAL' || d.char === this.run.charId)
      .map(d => d.id);
    if (!id.length) return;
    const pick = this.run.rng.pick(id);
    this.run.addCard(pick);
    this.toast(`获得 ${CARDS[pick].name}`);
  }
  gainRandomZeroCost() {
    const ids = Object.values(CARDS)
      .filter(d => d.cost === 0 && !['status', 'curse', 'event', 'quest', 'token', 'basic'].includes(d.rarity))
      .filter(d => !d.char || d.char === 'NEUTRAL' || d.char === this.run.charId)
      .map(d => d.id);
    if (!ids.length) return;
    const pick = this.run.rng.pick(ids);
    this.run.addCard(pick);
    this.toast(`获得 ${CARDS[pick].name}`);
  }
  /** 一次三选一卡牌奖励（事件用） */
  async cardReward() {
    const ids = this.run.rollCardReward(3);
    if (!ids.length) return;
    const entries = this.run.rewardMods(ids);
    const picked = await this.pickCards(ids, '选择一张牌加入牌组');
    if (!picked) return;
    const opt = entries.find((o) => o.id === picked.id) || { id: picked.id };
    const entry = this.run.addCard(opt.id, !!opt.upgraded);
    if (opt.enchant && entry) entry.enchant = opt.enchant;
  }
  /** 审判：随机一个案子 */
  trialCase() { return ['MERCHANT', 'NOBLE', 'NONDESCRIPT'][this.run.rng.int(3)]; }
  /** 打造时间：类型三选二 */
  tinkerTypes() {
    const types = [['ATTACK', '攻击牌'], ['SKILL', '技能牌'], ['POWER', '能力牌']];
    const picks = this.run.rng.pickMany(types, 2);
    return picks.map(([key, label]) => ({
      label,
      desc: '看看这个方向能做出什么',
      page: 'RIDER',
      apply: () => { this._tinkerType = key; this.eventPage('TINKER_TIME', 'RIDER'); },
    }));
  }
  /** 打造时间：词条三选二 */
  tinkerRiders() {
    const map = {
      ATTACK: [['SAPPING', '虚弱 + 易伤'], ['VIOLENCE', '攻击 3 次'], ['CHOKING', '紧勒 6']],
      SKILL: [['ENERGIZED', '获得 2 能量'], ['WISDOM', '抽 3 张牌'], ['CHAOS', '随机免费牌']],
      POWER: [['EXPERTISE', '力量 +2 / 敏捷 +2'], ['CURIOUS', '能力牌耗能 -1'], ['IMPROVEMENT', '战斗结束升级一张牌']],
    };
    const picks = this.run.rng.pickMany(map[this._tinkerType] || map.ATTACK, 2);
    return picks.map(([key, label]) => ({
      label,
      desc: `「疯狂科学」（${label}）`,
      apply: () => {
        this.addCardById(`MAD_SCIENCE_${this._tinkerType}_${key}`);
        this.eventDone();
      },
    }));
  }

  /* ================= 共享 / 海底事件用到的操作 ================= */
  /** 单次事件内的临时状态（切到 INITIAL 时由 renderEvent 清空） */
  evState(init) {
    if (!this._evs) this._evs = {};
    if (init) for (const k of Object.keys(init)) if (!(k in this._evs)) this._evs[k] = init[k];
    return this._evs;
  }
  removeFirstById(id) {
    const i = this.run.deck.findIndex(d => d.id === id);
    if (i >= 0) this.run.deck.splice(i, 1);
  }
  /** 从 n 张随机牌里挑 pick 张加入牌组（脑蛭的「分享知识」） */
  async randomCardChoices(offer = 5, pick = 1) {
    const ids = this.run.rollCardReward(offer);
    if (!ids.length) return;
    const cards = ids.map(id => makeCard(id));
    const picked = await this.requestSelection({ pool: cards, count: pick, prompt: '选择一张牌' });
    for (const c of picked) this.run.addCard(c.id);
  }
  /** 无色牌奖励：本作已实装的无色牌即「被遗忘的旧日」这一组 */
  async colorlessCardReward() {
    const picks = this.run.rng.pickMany(FORGOTTEN_CARDS, 3);
    const cards = picks.map(id => makeCard(id));
    const picked = await this.requestSelection({ pool: cards, count: 1, prompt: '选择一张无色牌' });
    if (picked.length) this.run.addCard(picked[0].id);
  }
  addPotionOfTier(tier) {
    const ids = Object.entries(POTIONS)
      .filter(([id, p]) => p.rarity === tier && this.run.potionAllowed(id))
      .map(([id]) => id);
    if (ids.length) this.addPotionById(this.run.rng.pick(ids));
  }
  /** 从某稀有度里抽 offer 张，让玩家挑 count 张加入牌组 */
  async pickRarityCards(rarity, count, offer) {
    const pool = this.run.poolByRarity(rarity);
    if (!pool.length) return;
    const picks = this.run.rng.pickMany(pool, Math.min(offer, pool.length));
    const cards = picks.map(id => makeCard(id));
    const names = { common: '普通', uncommon: '罕见', rare: '稀有' };
    const picked = await this.requestSelection({ pool: cards, count, prompt: `选择${count}张${names[rarity] || ''}牌` });
    for (const c of picked) this.run.addCard(c.id);
  }
  /** 变化一张指定的牌 */
  async transformChoice() {
    const pool = this.run.deck.filter(d => {
      const def = CARDS[d.id];
      return def && !['status', 'curse', 'quest'].includes(def.rarity);
    });
    if (!pool.length) { this.toast('没有可以变化的牌'); return; }
    const cards = pool.map(d => makeCard(d.id, d.upgraded));
    const picked = await this.requestSelection({ pool: cards, count: 1, prompt: '选择要变化的牌' });
    if (!picked.length) return;
    const entry = pool[cards.indexOf(picked[0])];
    if (!entry) return;
    const ids = this.run.rollCardReward(1);
    if (!ids.length) return;
    entry.id = ids[0];
    entry.upgraded = false;
    this.toast(`变化成了 ${CARDS[ids[0]].name}`);
  }
  /** 给一张「指定稀有度 + 指定类型」的升级牌（药水的未来？） */
  async giveUpgradedCardOf(rarity, type) {
    const pool = Object.values(CARDS)
      .filter(d => d && d.rarity === rarity && d.type === type)
      .filter(d => !d.char || d.char === 'NEUTRAL' || d.char === this.run.charId)
      .map(d => d.id);
    if (!pool.length) return;
    const picks = this.run.rng.pickMany(pool, Math.min(3, pool.length));
    const cards = picks.map(id => makeCard(id, true));
    const picked = await this.requestSelection({ pool: cards, count: 1, prompt: '选择一张牌' });
    if (picked.length) this.run.addCard(picked[0].id, true);
  }

  /* ---- 深渊浴场 ---- */
  bathImmerse() {
    const st = this.evState();
    this.run.gainMaxHp(2);
    this.run.damage(st.damage);
    st.lingered++;
    st.damage++;
    this.save();
    this.eventPage('ABYSSAL_BATHS', 'IMMERSE');
  }

  /* ---- 无尽传送带（EndlessConveyor.RollDish / ResolveDish） ---- */
  rollConveyorDish() {
    const st = this.evState();
    st.grabs = (st.grabs || 0) + 1;
    if (st.grabs % 5 === 0) { st.dish = 'SEAPUNK_SALAD'; return st.dish; }
    const dishes = [
      { id: 'CAVIAR', w: 6 },
      { id: 'SPICY_SNAPPY', w: 3 },
      { id: 'JELLY_LIVER', w: 3 },
      { id: 'FRIED_EEL', w: 3 },
    ];
    if (this.run.potions.includes(null)) dishes.push({ id: 'SUSPICIOUS_CONDIMENT', w: 3 });
    if (this.run.hp !== this.run.maxHp) dishes.push({ id: 'CLAM_ROLL', w: 6 });
    if (st.grabs > 1) dishes.push({ id: 'GOLDEN_FYSH', w: 1 });
    const pool = dishes.filter(d => d.id !== st.lastDish);
    const total = pool.reduce((s, d) => s + d.w, 0);
    let r = this.run.rng.next() * total;
    let picked = pool[pool.length - 1].id;
    for (const d of pool) { r -= d.w; if (r < 0) { picked = d.id; break; } }
    st.dish = picked;
    st.lastDish = picked;
    return picked;
  }
  conveyorChoices() {
    const st = this.evState();
    const dish = st.dish;
    const cost = 40;
    const titles = {
      CAVIAR: '鱼子酱', CLAM_ROLL: '蚌肉卷', FRIED_EEL: '炸鳗鱼', GOLDEN_FYSH: '金色异鱼',
      JELLY_LIVER: '水母肝', SEAPUNK_SALAD: '海洋混混沙拉', SPICY_SNAPPY: '香辣薄脆',
      SUSPICIOUS_CONDIMENT: '可疑调味料',
    };
    const descs = {
      CAVIAR: '支付40金币。获得4点最大生命。接着吃！',
      CLAM_ROLL: '支付40金币。回复10点生命值。接着吃！',
      FRIED_EEL: '支付40金币。将一张随机无色牌添加到你的牌组。接着吃！',
      GOLDEN_FYSH: '幸运头奖！获得75金币。',
      JELLY_LIVER: '支付40金币。变化一张牌。接着吃！',
      SEAPUNK_SALAD: '支付40金币。将一张疯狂进食添加到你的牌组。接着吃！',
      SPICY_SNAPPY: '支付40金币。随机升级一张牌。接着吃！',
      SUSPICIOUS_CONDIMENT: '支付40金币。随机获得一瓶药水。接着吃！',
    };
    const out = [];
    if (this.run.gold < cost && dish !== 'GOLDEN_FYSH') {
      out.push({ label: '破产了', desc: '你还能吃得下更多，但是兜里没金币了。', apply: () => this.eventDone() });
    } else {
      out.push({
        label: `从传送带上拿份${titles[dish] || ''}`,
        desc: descs[dish] || '', page: 'GRAB',
        apply: () => this.conveyorGrab(),
      });
    }
    if (st.grabs) out.push({ label: '离开', desc: '', apply: () => this.eventDone() });
    else out.push({ label: '观察主厨', desc: '从牌组中随机升级一张牌。', page: 'OBSERVE_CHEF', apply: () => this.eventPage('ENDLESS_CONVEYOR', 'OBSERVE_CHEF') });
    return out;
  }
  async conveyorGrab() {
    const st = this.evState();
    const dish = st.dish;
    st.lastDishShown = dish;
    if (dish !== 'GOLDEN_FYSH') this.run.gainGold(-40);
    switch (dish) {
      case 'CAVIAR': this.run.gainMaxHp(4); break;
      case 'SPICY_SNAPPY': this.upgradeRandomN(1); break;
      case 'JELLY_LIVER': await this.transformChoice(); break;
      case 'FRIED_EEL': await this.colorlessCardReward(); break;
      case 'SEAPUNK_SALAD': this.addCardById('FEEDING_FRENZY'); break;
      case 'SUSPICIOUS_CONDIMENT': this.addPotionRandom(); break;
      case 'CLAM_ROLL': this.heal(10); break;
      case 'GOLDEN_FYSH': this.gainGold(75); break;
      default: break;
    }
    this.rollConveyorDish();
    this.save();
    this.eventPage('ENDLESS_CONVEYOR', 'GRAB');
  }

  /* ---- 滑脚木桥 ---- */
  pickBridgeCard() {
    const st = this.evState();
    const seen = new Set(st.seen || []);
    let cands = this.run.deck.filter(d => !seen.has(d.uid) && CARDS[d.id] && CARDS[d.id].rarity !== 'basic');
    if (!cands.length) cands = this.run.deck.filter(d => !seen.has(d.uid));
    if (!cands.length) { st.cardUid = null; return; }
    const pick = this.run.rng.pick(cands);
    st.cardUid = pick.uid;
    st.seen = [...seen, pick.uid];
  }
  bridgeChoices() {
    const st = this.evState();
    const entry = this.run.deck.find(d => d.uid === st.cardUid);
    const out = [];
    if (entry) {
      out.push({
        label: '跨越', desc: `${CARDS[entry.id].name}将从你的牌组中被移除。`,
        apply: () => { this.run.removeCard(entry); this.eventDone(); },
      });
    }
    const loss = 3 + st.holds;
    out.push({
      label: '再撑一会', desc: `失去${loss}点生命。重新随机上方选项中的卡牌。`, page: 'BRIDGE',
      apply: () => {
        this.run.damage(loss);
        st.holds++;
        this.pickBridgeCard();
        this.save();
        this.eventPage('SLIPPERY_BRIDGE', 'BRIDGE');
      },
    });
    return out;
  }

  /* ---- 长者兰伟德 / 遗物交换商 ---- */
  ranwidChoices() {
    const potions = this.run.potions.map((p, i) => ({ p, i })).filter(x => x.p);
    const relics = this.run.relics.filter(id => RELIC_TRADABLE(id));
    const potion = potions.length ? this.run.rng.pick(potions) : null;
    const relic = relics.length ? this.run.rng.pick(relics) : null;
    const out = [];
    if (potion) {
      out.push({
        label: `给他${POTIONS[potion.p].name}`, desc: '获得一件随机遗物。',
        apply: () => { this.run.removePotion(potion.i); this.addRelicRandom(); this.eventDone(); },
      });
    }
    out.push({
      label: '给他100金币', desc: '获得一件随机遗物。',
      apply: () => { this.gainGold(-100); this.addRelicRandom(); this.eventDone(); },
    });
    if (relic) {
      out.push({
        label: `给他${RELICS[relic].name}`, desc: '获得2件随机遗物。',
        apply: () => { this.run.removeRelic(relic); this.addRelicRandom(); this.addRelicRandom(); this.eventDone(); },
      });
    }
    return out;
  }
  relicTraderChoices() {
    const st = this.evState({ trades: null });
    if (!st.trades) {
      const owned = this.run.relics.filter(id => RELIC_TRADABLE(id));
      const give = this.run.rng.pickMany(owned, Math.min(3, owned.length));
      st.trades = give.map(id => ({ give: id, get: this.run.rollRelic() }));
    }
    const keys = ['拿上面这件', '拿中间这件', '拿下面这件'];
    const out = st.trades.map((t, i) => ({
      label: keys[i] || `交换 ${i + 1}`,
      desc: `用${RELICS[t.give].name}换${t.get ? RELICS[t.get].name : '一件随机遗物'}。`,
      apply: () => {
        this.run.removeRelic(t.give);
        if (t.get) this.addRelicById(t.get);
        this.eventDone();
      },
    }));
    if (!out.length) out.push({ label: '离开', desc: '「嘿嘿嘿……下次再来吶！」', apply: () => this.eventDone() });
    return out;
  }

  /* ---- 商人？？？（假商人） ---- */
  fakeMerchantChoices() {
    const st = this.evState({ stock: null });
    if (!st.stock) {
      const pool = [
        'FAKE_ANCHOR', 'FAKE_BLOOD_VIAL', 'FAKE_HAPPY_FLOWER', 'FAKE_LEES_WAFFLE',
        'FAKE_MANGO', 'FAKE_ORICHALCUM', 'FAKE_SNECKO_EYE', 'FAKE_STRIKE_DUMMY',
        'FAKE_VENERABLE_TEA_SET',
      ];
      st.stock = this.run.rng.pickMany(pool, 6)
        .map(id => ({ id, price: Math.round(50 * (0.85 + this.run.rng.next() * 0.3)), bought: false }));
    }
    const out = st.stock.filter(s => !s.bought).map((s) => ({
      label: RELICS[s.id].name,
      desc: `支付${s.price}金币。${RELICS[s.id].desc}`,
      disabled: this.run.gold < s.price,
      apply: () => {
        this.gainGold(-s.price);
        s.bought = true;
        this.addRelicById(s.id);
        this.save();
        this.eventPage('FAKE_MERCHANT', 'SHOP');
      },
    }));
    out.push({ label: '离开', desc: '「那就下次再聊，孩子。」', apply: () => this.eventDone() });
    return out;
  }

  /* ---- 药水的未来？ ---- */
  potionFusionChoices() {
    const st = this.evState({ list: null });
    if (!st.list) {
      st.list = this.run.potions
        .map((p, i) => ({ p, i }))
        .filter(x => x.p)
        .map(({ p, i }) => {
          const pr = POTIONS[p].rarity;
          const cardRarity = pr === 'uncommon' ? 'uncommon' : pr === 'rare' ? 'rare' : 'common';
          const types = (pr === 'common' || pr === 'event')
            ? ['attack', 'skill'] : ['attack', 'skill', 'power'];
          return { i, potion: p, cardRarity, type: this.run.rng.pick(types) };
        });
    }
    const rn = { common: '普通', uncommon: '罕见', rare: '稀有' };
    const tn = { attack: '攻击', skill: '技能', power: '能力' };
    const opts = st.list.slice(0, 3).map(t => ({
      label: `放入${rn[t.cardRarity]}药水`,
      desc: `失去${POTIONS[t.potion].name}。获得一张升级过的${rn[t.cardRarity]}${tn[t.type]}牌。`,
      apply: async () => {
        this.run.removePotion(t.i);
        await this.giveUpgradedCardOf(t.cardRarity, t.type);
        this.eventDone();
      },
    }));
    if (!opts.length) opts.push({ label: '离开', desc: '这机器似乎需要药水才能运作。', apply: () => this.eventDone() });
    return opts;
  }

  /* ---- 水晶球占卜小游戏（CrystalSphereMinigame 的移植） ---- */
  sphereBegin(divinations) {
    const W = 11;
    const hidden = Array.from({ length: W }, () => new Array(W).fill(true));
    const occ = Array.from({ length: W }, () => new Array(W).fill(null));
    const rng = this.run.rng;
    // 四角两次横竖扩散后预先揭开（对照源码构造函数里的 corners 展开）
    let corners = [[0, 0], [10, 0], [10, 10], [0, 10]];
    for (let i = 0; i < 2; i++) {
      const next = [];
      for (const [x, y] of corners) {
        if (x > 0) next.push([x - 1, y]);
        if (x < 10) next.push([x + 1, y]);
        if (y > 0) next.push([x, y - 1]);
        if (y < 10) next.push([x, y + 1]);
      }
      corners = corners.concat(next);
    }
    for (const [x, y] of corners) hidden[x][y] = false;

    const items = [];
    const mk = (kind, extra = {}) => {
      const size = kind === 'RELIC' ? [4, 4]
        : (kind === 'POTION' && extra.potionRarity !== 'rare') ? [1, 3]
          : kind === 'GOLD' ? [extra.big ? 2 : 1, 1] : [2, 2];
      return { kind, width: size[0], height: size[1], revealed: false, ...extra };
    };
    const batch = [
      mk('RELIC'),
      mk('POTION'), mk('POTION'), mk('POTION', { potionRarity: 'rare' }),
      mk('CARD', { rarity: 'common' }), mk('CARD', { rarity: 'uncommon' }), mk('CARD', { rarity: 'rare' }),
      mk('CURSE'),
    ];
    for (let i = 0; i < 5; i++) batch.push(mk('GOLD'));
    for (let i = 0; i < 2; i++) batch.push(mk('GOLD', { big: true }));

    for (const item of batch) {
      items.push(item);
      const cands = [];
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < W; y++) {
          if (x + item.width > W || y + item.height > W) continue;
          let ok = true;
          for (let dx = 0; dx < item.width && ok; dx++) {
            for (let dy = 0; dy < item.height && ok; dy++) {
              if (!hidden[x + dx][y + dy] || occ[x + dx][y + dy]) ok = false;
            }
          }
          if (ok) cands.push([x, y]);
        }
      }
      if (!cands.length) continue;
      const [px, py] = rng.pick(cands);
      item.pos = [px, py];
      for (let dx = 0; dx < item.width; dx++) {
        for (let dy = 0; dy < item.height; dy++) occ[px + dx][py + dy] = item;
      }
    }

    this._sphere = { W, hidden, occ, items, divinations, revealed: [] };
    this.renderSphere();
  }

  renderSphere() {
    const sp = this._sphere;
    if (!sp) { this.eventDone(); return; }
    const label = { RELIC: '🏺', POTION: '🧪', CARD: '🃏', CURSE: '☠️', GOLD: '🪙' };
    let cells = '';
    for (let x = 0; x < sp.W; x++) {
      for (let y = 0; y < sp.W; y++) {
        const it = sp.occ[x][y];
        const open = !sp.hidden[x][y];
        const glyph = open && it ? label[it.kind] : (open ? '·' : '');
        cells += `<button class="sphere-cell${open ? ' open' : ''}" data-x="${x}" data-y="${y}">${glyph}</button>`;
      }
    }
    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">水晶球</div>
      <div class="sheet-sub">还剩下 ${sp.divinations} 次占卜</div>
      <div class="event-text">通过揭开图块来揭幕你的未来！\n选择小幅占卜或大幅占卜，揭开水晶球内的图块。\n一旦有物品被揭示，你就将在本次服务时段结束时获得它…\n但要小心，揭开某些物品可能会非常危险！</div>
      <div class="sheet-body"><div class="sphere-grid" id="sphere-grid">${cells}</div></div>
      <div class="row" style="gap:8px">
        <button class="btn" id="sphere-small">小幅占卜</button>
        <button class="btn primary" id="sphere-big">大幅占卜</button>
      </div>
    </div>`);
    const grid = $('#sphere-grid');
    grid.onclick = (e) => {
      const el = e.target.closest('[data-x]');
      if (!el) return;
      this._spherePick = [Number(el.dataset.x), Number(el.dataset.y)];
      grid.querySelectorAll('.sphere-cell').forEach(c => c.classList.remove('picked'));
      el.classList.add('picked');
    };
    $('#sphere-small').onclick = () => this.sphereReveal(false);
    $('#sphere-big').onclick = () => this.sphereReveal(true);
  }

  async sphereReveal(big) {
    const sp = this._sphere;
    const pick = this._spherePick;
    if (!sp || !pick) { this.toast('先在球面上点一个位置'); return; }
    if (sp.divinations <= 0) return;
    sp.divinations--;
    const [x, y] = pick;
    const cells = [[x, y]];
    if (big) {
      if (x > 0) cells.push([x - 1, y]);
      if (x < 10) cells.push([x + 1, y]);
      if (y > 0) cells.push([x, y - 1]);
      if (y < 10) cells.push([x, y + 1]);
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
        if (x + dx >= 0 && x + dx < 11 && y + dy >= 0 && y + dy < 11) cells.push([x + dx, y + dy]);
      }
    }
    for (const [cx, cy] of cells) {
      if (!sp.hidden[cx][cy]) continue;
      sp.hidden[cx][cy] = false;
      const it = sp.occ[cx][cy];
      if (!it || it.revealed) continue;
      let fullyOpen = true;
      for (let dx = 0; dx < it.width; dx++) {
        for (let dy = 0; dy < it.height; dy++) {
          if (sp.hidden[it.pos[0] + dx][it.pos[1] + dy]) fullyOpen = false;
        }
      }
      if (!fullyOpen) continue;
      it.revealed = true;
      sp.revealed.push(it);
      if (it.kind === 'CURSE') this.addCardById('DOUBT');
    }
    this._spherePick = null;
    if (sp.divinations <= 0) { await this.sphereSettle(); return; }
    this.renderSphere();
  }

  async sphereSettle() {
    const sp = this._sphere;
    this._sphere = null;
    const items = sp ? sp.revealed : [];
    // 结算顺序对照源码 RewardOrder：金币 → 药水 → 遗物 → 卡牌
    const order = { GOLD: 1, POTION: 2, RELIC: 3, CARD: 5, CURSE: 9 };
    items.sort((a, b) => (order[a.kind] || 9) - (order[b.kind] || 9));
    const rewards = [];
    for (const it of items) {
      if (it.kind === 'GOLD') rewards.push({ kind: 'gold', amount: it.big ? 30 : 10 });
      else if (it.kind === 'POTION') {
        const id = this.run.rollPotion();
        if (id) rewards.push({ kind: 'potion', id });
      } else if (it.kind === 'RELIC') {
        const id = this.run.rollRelic();
        if (id) rewards.push({ kind: 'relic', id });
      } else if (it.kind === 'CARD') {
        rewards.push({ kind: 'cards', ids: this.run.rollCardReward(3, { rarity: it.rarity }) });
      }
    }
    if (!rewards.length) { this.eventDone(); return; }
    this.showRewards(rewards, () => this.eventDone());
  }

  /* ================= 牌组操作弹窗 ================= */
  promptRemoveCard() {
    return new Promise((resolve) => {
      const entries = this.run.deck.slice();
      const cards = entries.map(d => makeCard(d.id, d.upgraded));
      this.setOverlay(`<div class="sheet">
        <div class="sheet-title">选择要移除的牌</div>
        <div class="sheet-body"><div class="reward-grid" id="rm-grid">${cards.map(c => cardHTML(c)).join('')}</div></div>
        <button class="btn" id="rm-cancel">取消</button>
      </div>`);
      $('#rm-grid').onclick = async (e) => {
        const el = e.target.closest('[data-uid]');
        if (!el) return;
        const idx = [...$('#rm-grid').children].indexOf(el);
        const ok = await this.askConfirm({
          title: `确认移除「${cards[idx].name}」？`,
          sub: '这张牌会从牌组里永久删除，不能撤销。',
          okText: '移除这张牌',
          cancelText: '再想想',
        });
        if (!ok || !$('#rm-grid')) return;
        this.run.deck.splice(idx, 1);
        this.clearOverlay();
        resolve();
      };
      $('#rm-cancel').onclick = () => { this.clearOverlay(); resolve(); };
    });
  }

  promptUpgradeCard() {
    return new Promise((resolve) => {
      const upgradable = this.run.deck.map((d, i) => ({ d, i })).filter(x => !x.d.upgraded && CARDS[x.d.id].rarity !== 'status' && CARDS[x.d.id].rarity !== 'curse');
      if (!upgradable.length) { this.toast('没有可升级的牌'); resolve(); return; }
      const cards = upgradable.map(x => makeCard(x.d.id, x.d.upgraded));
      this.setOverlay(`<div class="sheet">
        <div class="sheet-title">选择要升级的牌</div>
        <div class="sheet-body"><div class="reward-grid" id="up-grid">${cards.map(c => cardHTML(c)).join('')}</div></div>
        <button class="btn" id="up-cancel">取消</button>
      </div>`);
      $('#up-grid').onclick = async (e) => {
        const el = e.target.closest('[data-uid]');
        if (!el) return;
        const idx = [...$('#up-grid').children].indexOf(el);
        const ok = await this.askConfirm({
          title: `确认升级「${cards[idx].name}」？`,
          sub: '升级机会用完就没了。',
          okText: '升级这张牌',
          cancelText: '再想想',
        });
        if (!ok || !$('#up-grid')) return;
        this.run.deck[upgradable[idx].i].upgraded = true;
        this.clearOverlay();
        this.toast('已升级');
        resolve();
      };
      $('#up-cancel').onclick = () => { this.clearOverlay(); resolve(); };
    });
  }

  /* ================= 结算 ================= */
  /** 把这一场战斗压进 run.battles（结算界面的战报用） */
  recordBattle(c, win) {
    const run = this.run;
    const kind = c._event ? 'event' : (c._kind === 'boss' || c.isBoss ? 'boss'
      : c._kind === 'elite' || c.isElite ? 'elite' : 'normal');
    const label = { boss: '首领', elite: '精英', event: '事件', normal: '普通' }[kind] || '战斗';
    run.battles.push({
      floor: run.floor,
      act: run.act,
      kind, label,
      enemies: [...new Set(c.enemies.map(e => e.name))],
      enemyHp: c.enemies.reduce((a, e) => a + (e.maxHp || 0), 0),
      turns: c.turn || 0,
      won: !!win,
      hpStart: c._hpStart ?? c.player.maxHp,
      hpEnd: Math.max(0, c.player.hp),
      dealt: Math.round(c.damageDealt || 0),
      taken: Math.round(c.damageTaken || 0),
    });
    // 日志只留在内存里供本局复盘，不进存档（一张牌一条，太占地方）
    (this.battleLogs || (this.battleLogs = [])).push({ rec: run.battles.at(-1), entries: c.log.slice(-300) });
    if (this.battleLogs.length > 12) this.battleLogs.shift();
  }

  /** 战报：本局概览 + 逐场战斗，点某一场能翻那场的完整记录 */
  showBattleReport() {
    const run = this.run;
    const battles = run.battles || [];
    const sum = (k) => battles.reduce((a, b) => a + (b[k] || 0), 0);
    const actName = { 1: '第一幕', 2: '第二幕', 3: '第三幕' }[run.act] || `第 ${run.act} 幕`;
    const rows = battles.map((b, i) => {
      const hasLog = !!(this.battleLogs || []).find(x => x.rec === b);
      const hp = b.hpStart === b.hpEnd ? `${b.hpEnd}` : `${b.hpStart} → ${b.hpEnd}`;
      return `<button class="br-row" data-br="${i}"${hasLog ? '' : ' disabled'}>
        <span class="br-floor">${b.floor}</span>
        <span class="br-main">
          <span class="br-name">${esc(b.enemies.join('、') || '—')}</span>
          <span class="br-sub">${b.label} · ${b.turns} 回合 · 生命 ${hp} · 伤害 ${b.dealt}／${b.taken}</span>
        </span>
        <span class="br-tag ${b.won ? 'win' : 'lose'}">${b.won ? '胜' : '败'}</span>
      </button>`;
    }).join('') || '<div class="sheet-sub" style="padding:10px 0">这局还没打过架</div>';

    this.setOverlay(`<div class="sheet br-sheet">
      <div class="sheet-title">战报</div>
      <div class="sheet-sub">${esc(`${actName} · 第 ${run.floor} 层 · 种子 ${run.seed}`)}</div>
      <div class="sheet-body">
        <div class="br-grid">
          <div><b>${run.floor}</b><span>抵达层数</span></div>
          <div><b>${battles.length}</b><span>战斗场次</span></div>
          <div><b>${run.stats.elites}</b><span>精英击杀</span></div>
          <div><b>${run.stats.bosses}</b><span>首领击杀</span></div>
          <div><b>${sum('dealt')}</b><span>造成伤害</span></div>
          <div><b>${sum('taken')}</b><span>承受伤害</span></div>
          <div><b>${run.deck.length}</b><span>牌组张数</span></div>
          <div><b>${run.gold}</b><span>金币</span></div>
        </div>
        <div class="br-sec">逐场战斗${battles.length ? '（点一行看记录 · 伤害＝造成／承受）' : ''}</div>
        <div class="br-list">${rows}</div>
      </div>
      <button class="btn primary" id="br-close" style="margin-top:10px">关闭</button>
    </div>`);
    $('#br-close').onclick = () => this.clearOverlay();
    $('.br-list').onclick = (ev) => {
      const row = ev.target.closest('[data-br]');
      if (!row || row.disabled) return;
      const b = battles[+row.dataset.br];
      const hit = (this.battleLogs || []).find(x => x.rec === b);
      if (!hit) return;
      this.showCombatLog(hit.entries, `${b.label} · ${hit.rec.enemies.join('、')} · 第 ${b.floor} 层`);
    };
  }

  showGameOver(win) {
    this._gameOver = true;
    this.clearSave();
    this.clearOverlay();
    const run = this.run;
    this.root.innerHTML = `
      <div class="screen result-screen">
        <div class="result-title ${win ? 'win' : 'lose'}">${win ? '塔顶之光' : '你倒下了'}</div>
        <div class="dim small">${win ? '你走完了这座高塔。' : '尖塔又一次收下了它的祭品。'}</div>
        <div class="result-stats">
          <div>抵达层数</div><b>${run.floor}</b>
          <div>战斗场次</div><b>${run.stats.combats}</b>
          <div>精英击杀</div><b>${run.stats.elites}</b>
          <div>首领击杀</div><b>${run.stats.bosses}</b>
          <div>牌组张数</div><b>${run.deck.length}</b>
          <div>金币</div><b>${run.gold}</b>
        </div>
        <div class="result-actions">
          <button class="btn" id="open-report">查看战报</button>
          <button class="btn primary" id="back-title">返回标题</button>
        </div>
      </div>`;
    $('#open-report').onclick = () => this.showBattleReport();
    $('#back-title').onclick = () => { this.run = null; this.combat = null; this.battleLogs = []; this.showTitle(); };
  }
}
