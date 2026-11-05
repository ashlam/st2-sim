/** 应用外壳：屏幕路由 + 全部界面渲染 */
import { Combat } from '../engine/combat.js';
import { Run } from '../engine/run.js';
import { NODE_TYPES, reachable } from '../engine/map.js';
import { CARDS, makeCard } from '../data/cards.js';
import { RELICS, POTIONS } from '../data/items.js';
import { ENEMIES, ENCOUNTERS } from '../data/enemies.js';
import { POWERS } from '../data/powers.js';
import { ORBS } from '../data/orbs.js';
import { EVENTS } from '../data/events.js';
import { CHARACTERS, CHARACTER_BY_ID } from '../data/characters.js';
import { TERMS } from '../data/glossary.js';
import { linkify, intentLabel, describeMove } from './inspect.js';

const $ = (sel, root = document) => root.querySelector(sel);
const SAVE_KEY = 'sts2sim.run.v1';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 卡牌文本渲染：{Var} 替换数值，[gold]..[/gold] 高亮 */
function fmtText(def, card, combat) {
  let text = def.textFn ? def.textFn(card) : def.text;
  let vars = {};
  try { vars = def.vars ? def.vars(card, combat, card) : {}; } catch (e) { vars = {}; }
  text = esc(text);
  text = text.replace(/\[gold\]/g, '<span class="kw">').replace(/\[\/gold\]/g, '</span>');
  text = text.replace(/\{([A-Za-z]+)\}/g, (m, k) => (vars[k] != null ? `<b class="num">${vars[k]}</b>` : ''));
  return text.replace(/\n/g, '<br>');
}

function cardHTML(card, opts = {}) {
  const def = CARDS[card.id] || card.def;
  const cost = opts.combat ? opts.combat.costOf(card) : card.cost;
  const typeLabel = { attack: '攻击', skill: '技能', power: '能力', status: '状态', curse: '诅咒' }[card.type] || '';
  const glyph = { attack: '⚔', skill: '✧', power: '✦', status: '◇', curse: '✖' }[card.type] || '✧';
  const disabled = opts.disabled ? ' disabled' : '';
  const sel = opts.selected ? ' selected' : '';
  const up = card.upgraded ? ' upgraded' : '';
  return `<div class="card ${card.type}${up}${disabled}${sel}" data-uid="${card.uid}" data-card="1">
    <div class="card-cost${cost === 0 ? ' free' : ''}${typeof cost === 'number' && cost < 0 ? ' none' : ''}">${cost === 'X' ? 'X' : (typeof cost === 'number' && cost < 0 ? '—' : cost)}</div>
    <div class="card-name">${esc(card.name)}${card.upgraded ? '+' : ''}</div>
    <div class="card-text">${fmtText(def, card, opts.combat)}</div>
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
    this.screen = 'title';
    // 全局接管「关键词」点击：牌名、状态名、敌人名、遗物名、机制词
    // 放在捕获阶段，避免点击落在卡牌/敌人身上时又被出牌逻辑吃掉
    document.addEventListener('click', (ev) => {
      const kw = ev.target.closest && ev.target.closest('[data-kw-kind]');
      if (!kw) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.showKw(kw.dataset.kwKind, kw.dataset.kwId, kw.dataset.kwOwner, kw.dataset.kwStack);
    }, true);
    this.showTitle();
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
      if (act === 'continue') { this.run = save; this.showMap(); }
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
    this.save();
    this.showNeow();
  }

  showNeow() {
    const opts = [
      { t: '获得 8 点最大生命值', d: '涅奥的祝福', run: () => this.run.gainMaxHp(8) },
      { t: '获得 100 金币', d: '涅奥的祝福', run: () => this.run.gainGold(100) },
      { t: '获得一件随机遗物', d: '涅奥的祝福', run: () => this.run.addRelic(this.run.rollRelic('common')) },
      { t: '移除一张牌', d: '涅奥的祝福', run: () => { this.neowRemove = true; } },
      { t: '获得一张稀有牌', d: '涅奥的祝福', run: () => { this.neowRare = true; } },
      { t: '将一张牌升级', d: '涅奥的祝福', run: () => { this.neowUpgrade = true; } },
    ];
    const picked = [];
    const pool = opts.slice();
    while (picked.length < 4) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);

    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">涅奥的馈赠</div>
      <div class="sheet-sub">选择一项祝福，开始这一局。</div>
      <div class="sheet-body"><div class="choices" id="neow-list"></div></div>
    </div>`);
    const list = $('#neow-list');
    picked.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `<div class="t">${o.t}</div><div class="d">${o.d}</div>`;
      b.onclick = async () => {
        this.clearOverlay();
        o.run();
        if (this.neowRemove) { this.neowRemove = false; await this.promptRemoveCard(); }
        if (this.neowRare) { this.neowRare = false; this.run.addCard(this.run.rollCardReward(1, { rarity: 'rare' })[0]); }
        if (this.neowUpgrade) { this.neowUpgrade = false; await this.promptUpgradeCard(); }
        this.save();
        this.showMap();
      };
      list.appendChild(b);
    });
  }

  /* ================= 地图 ================= */
  showMap() {
    this.screen = 'map';
    this.selectedCard = null;
    this.closeInfo();
    this.clearOverlay();
    const run = this.run;
    const available = reachable(run.map, run.curNode);
    const availIds = new Set(available.map(n => n.id));

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
          <div class="dim small">第 ${run.floor} 层 · 第一幕 · 蔓生之地</div>
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
    const body = String(t.desc).split('\n').map(p => `<p class="kw-p">${linkify(p)}</p>`).join('');
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

  showCardInfo(id) {
    let def = CARDS[id];
    // 两个角色都有「打击」「防御」，按当前角色找同名的那张
    if (def && this.run && def.char !== this.run.charId && def.char !== 'NEUTRAL') {
      const alt = Object.values(CARDS).find(d => d.name === def.name && d.char === this.run.charId);
      if (alt) { id = alt.id; def = alt; }
    }
    if (!def) return;
    const card = makeCard(id, false);
    const upCard = makeCard(id, true);
    const baseText = fmtText(def, card, null);
    const upText = fmtText(def, upCard, null);
    const typeLabel = { attack: '攻击', skill: '技能', power: '能力', status: '状态', curse: '诅咒' }[def.type] || '';
    const rarityLabel = { common: '普通', uncommon: '罕见', rare: '稀有', starter: '初始', basic: '初始', status: '状态', curse: '诅咒' }[def.rarity] || '';
    const sub = [typeLabel, rarityLabel, typeof def.cost === 'number' ? `${def.cost} 费` : 'X 费'].filter(Boolean).join(' · ');
    const body = `
      <div class="kw-cardwrap">${cardHTML(card)}</div>
      <p class="kw-p">${baseText}</p>
      ${upText !== baseText ? `<div class="kw-sec">升级后</div><p class="kw-p">${upText}</p>` : '<div class="kw-note">这张牌没有升级效果。</div>'}`;
    this.showInfo({ title: card.name, sub, body });
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
    this.showInfo({ icon: r.icon, title: r.name, sub: '遗物', body: `<p class="kw-p">${linkify(r.desc)}</p>` });
  }

  showPotionInfo(id) {
    const p = POTIONS[id];
    if (!p) return;
    this.showInfo({ icon: p.icon, title: p.name, sub: '药水', body: `<p class="kw-p">${linkify(p.desc)}</p>` });
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

  showCardDetail(card) {
    const def = CARDS[card.id];
    if (!def) return;
    const typeLabel = { attack: '攻击', skill: '技能', power: '能力', status: '状态', curse: '诅咒' }[def.type] || '';
    const sorted = makeCard(card.id, true);
    const curText = fmtText(def, card, null);
    const upText = fmtText(def, sorted, null);
    const body = `
      <div class="kw-cardwrap">${cardHTML(card)}</div>
      <p class="kw-p">${curText}</p>
      ${!card.upgraded && upText !== curText ? `<div class="kw-sec">升级后</div><p class="kw-p">${upText}</p>` : ''}
      ${card.upgraded ? '<div class="kw-note">这张牌已经升级过了。</div>' : ''}`;
    this.showInfo({
      title: `${card.name}${card.upgraded ? '+' : ''}`,
      sub: `${typeLabel}${typeof card.cost === 'number' ? ` · ${card.cost} 费` : ' · X 费'}`,
      body,
    });
  }

  /* ================= 进入节点 ================= */
  enterNode(node) {
    this.run.curNode = node;
    node.visited = true;
    this.run.floor++;
    this.run.stats.floors = this.run.floor;
    const t = node.type;
    if (t === 'boss') return this.startCombat('boss', node);
    if (t === 'elite') return this.startCombat('elite', node);
    if (t === 'monster') return this.startCombat('normal', node);
    if (t === 'rest') return this.showRest();
    if (t === 'shop') return this.showShop();
    if (t === 'treasure') return this.showTreasure();
    if (t === 'unknown') return this.resolveUnknown(node);
  }

  resolveUnknown(node) {
    const r = Math.random();
    const noCombat = this.run.relics.includes('JUZU_BRACELET');
    if (!noCombat && r < 0.25) return this.startCombat('normal', node);
    if (r < 0.35) return this.showShop();
    if (r < 0.45) return this.showTreasure();
    return this.showEvent();
  }

  /* ================= 战斗 ================= */
  startCombat(kind, node) {
    const enc = this.run.rollEncounter(kind);
    this.run.combatCount++;
    this.combat = new Combat(this.run, enc, { speed: window.DEBUG_SPEED ?? 1 });
    this.combat.onUpdate = () => this.renderCombat();
    this.combat.onFloat = (target, text, kind2) => this.floatAt(target, text, kind2);
    this.combat.onLog = (m) => {};
    this.combat.requestSelection = (opts) => this.requestSelection(opts);
    this.selectedCard = null;
    this.pendingPotion = null;
    this.renderCombat(true);
    this.combat.start();
  }

  renderCombat(first = false) {
    const c = this.combat;
    if (!c) return;
    if (c.finished) { this.onCombatFinished(); return; }
    const run = this.run;
    const scrollLeft = $('.hand')?.scrollLeft || 0;

    const enemies = c.enemies.map(e => {
      if (!e.alive) return '';
      const intent = c.intentOf(e);
      let intentHtml = '';
      const cls = intent.type === 'attack' ? 'attack' : intent.type === 'defend' ? 'defend' : intent.type === 'buff' ? 'buff' : ['debuff', 'status', 'sleep', 'stun'].includes(intent.type) ? 'debuff' : '';
      if (intent.type === 'attack') intentHtml = `⚔ ${intent.dmg}${intent.times > 1 ? ` ×${intent.times}` : ''}`;
      else if (intent.type === 'defend') intentHtml = `🛡 ${intent.block}`;
      else if (intent.type === 'buff') intentHtml = '💪 强化';
      else if (intent.type === 'debuff') intentHtml = '☠ 削弱';
      else if (intent.type === 'status') intentHtml = '🃏 塞牌';
      else if (intent.type === 'sleep') intentHtml = '💤 沉睡';
      else if (intent.type === 'stun') intentHtml = '💫 眩晕';
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
      this.toast(typeof cost === 'number' ? '能量不足' : '无法打出');
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
    if (this.combat && this.combat.finished) this.onCombatFinished();
    else this.renderCombat();
  }

  banner(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'turn-banner ' + cls;
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
    if (this.combat && this.combat.finished) this.onCombatFinished();
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
    if (this.combat && this.combat.finished) this.onCombatFinished();
  }

  /** 战斗记录：按回合分组，可复制成纯文本便于复盘。独立弹层，任何界面都能打开 */
  showCombatLog() {
    const entries = (this.combat && this.combat.log.length ? this.combat.log : this.lastCombatLog) || [];
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
    const sub = [this.lastCombatTitle, `共 ${entries.length} 条`, '点亮起的词看说明'].filter(Boolean).join(' · ');
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
      if (card) this.showCardDetail(card);
    };
  }

  floatAt(target, text, kind) {
    if (!target) return;
    const el = target.isPlayer
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
    this.combatResolved = true;
    await c.finish();
    const win = c.won;
    this.lastCombatLog = c.log.slice();
    this.lastCombatTitle = c.enemies.map(e => e.name).join('、');
    this.run.hp = c.player.hp;
    this.save();
    if (!win) {
      this.combat = null;
      return this.showGameOver(false);
    }
    const isBoss = c.isBoss;
    const isElite = c.isElite;
    this.run.stats.combats++;
    if (isElite) this.run.stats.elites++;
    if (isBoss) this.run.stats.bosses++;

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
    const cards = this.run.rollCardReward(isBoss ? 3 : 3);
    rewards.push({ kind: 'cards', ids: cards });
    const potion = this.run.rollPotion();
    if (potion && this.run.potions.includes(null)) rewards.push({ kind: 'potion', id: potion });

    this.combat = null;
    this.combatResolved = false;

    if (isBoss) {
      this.run.bossKilled++;
      this.run.bossQueue.shift();
      await this.showRewards(rewards, () => {
        if (this.run.bossQueue.length) {
          this.run.heal(Math.floor(this.run.maxHp * 0.25));
          this.startCombat('boss', null);
        } else {
          this.showGameOver(true);
        }
      });
      return;
    }
    this.showRewards(rewards, () => this.showMap());
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
      if (r.kind === 'relic') return `<div class="choice" data-reward="${i}"><div class="t">${RELICS[r.id].icon} ${RELICS[r.id].name}</div><div class="d">${RELICS[r.id].desc}</div></div>`;
      if (r.kind === 'potion') return `<div class="choice" data-reward="${i}"><div class="t">${POTIONS[r.id].icon} ${POTIONS[r.id].name}</div><div class="d">${POTIONS[r.id].desc}</div></div>`;
      return '';
    }).join('');

    const cardChoices = rewards.find(r => r.kind === 'cards');
    this.setOverlay(`<div class="sheet">
      <div class="sheet-title">战利品</div>
      <div class="sheet-sub">选一张卡牌加入牌组。金币和道具可以现在点，也可以留到点「继续」时一起收下。</div>
      <div class="sheet-body">
        <div class="choices" id="loot-list">${items}</div>
        <div class="sheet-sub" style="margin-top:16px">卡牌奖励</div>
        <div class="reward-grid" id="card-reward">
          ${cardChoices.ids.map(id => cardHTML(makeCard(id), {})).join('')}
        </div>
      </div>
      <div class="reward-tip" id="reward-tip">点「继续」会收下所有还没领的金币和道具</div>
      <div class="log-actions">
        <button class="btn" id="view-log">📜 上一战记录</button>
        <button class="btn primary" id="skip-reward">跳过卡牌，继续</button>
      </div>
    </div>`);

    const taken = new Set();
    this.overlay.onclick = (e) => {
      if (e.target.closest('#view-log')) { this.showCombatLog(); return; }
      const rEl = e.target.closest('[data-reward]');
      if (rEl) {
        const i = +rEl.dataset.reward;
        if (taken.has(i)) return;
        const r = rewards[i];
        const name = this.grantReward(r);
        if (!name) { this.toast('药水栏位已满，先喝掉一瓶'); return; }
        taken.add(i);
        rEl.classList.add('sold');
        this.toast(r.kind === 'gold' ? `+${r.amount} 金币` : `获得 ${name}`);
        this.updateRewardTip(rewards, taken, cardChoices);
        return;
      }
      const cardEl = e.target.closest('#card-reward [data-uid]');
      if (cardEl) {
        const idx = [...$('#card-reward').children].indexOf(cardEl);
        const id = cardChoices.ids[idx];
        this.run.addCard(id);
        this.toast(`获得 ${CARDS[id].name}`);
        $('#card-reward').style.opacity = '.35';
        $('#card-reward').style.pointerEvents = 'none';
        $('#skip-reward').textContent = '继续';
        this.updateRewardTip(rewards, taken, cardChoices, true);
        return;
      }
      if (e.target.closest('#skip-reward')) {
        // 兜底：卡牌以外还没领的一律收下，避免「点了继续就丢奖励」
        const got = [];
        rewards.forEach((r, i) => {
          if (r.kind === 'cards' || taken.has(i)) return;
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

  /** 奖励页底部提示：还没领的还剩几项 */
  updateRewardTip(rewards, taken, cardChoices, cardPicked = false) {
    const el = $('#reward-tip');
    if (!el) return;
    const left = rewards.filter((r, i) => r.kind !== 'cards' && !taken.has(i));
    if (cardPicked && !left.length) { el.textContent = '奖励已全部收下'; return; }
    const names = left.map(r => r.kind === 'gold' ? `${r.amount} 金币` : r.kind === 'relic' ? RELICS[r.id].name : POTIONS[r.id].name);
    el.textContent = names.length
      ? `点「继续」会收下：${names.join('、')}`
      : '金币和道具已全部收下';
  }

  /* ================= 休息处 ================= */
  showRest() {
    const run = this.run;
    const healAmt = Math.floor(run.maxHp * (run.asc >= 2 ? 0.25 : 0.3));
    const feather = run.relics.includes('ETERNAL_FEATHER') ? Math.floor(run.deck.length / 5) * 3 : 0;
    const canGirya = run.relics.includes('GIRYA') && (run.giryaCount || 0) < 3;

    const choices = [];
    choices.push({ label: `休息 · 回复 ${healAmt + feather} 点生命`, desc: feather ? `（含永恒羽毛 ${feather} 点）` : '', act: () => { run.heal(healAmt + feather); } });
    choices.push({ label: '锻造 · 升级一张牌', desc: '选择牌组中的一张牌升级', act: async () => { await this.promptUpgradeCard(); } });
    if (canGirya) choices.push({ label: '锻炼 · 获得 1 点力量', desc: `壶铃（${run.giryaCount || 0}/3）`, act: () => { run.giryaCount = (run.giryaCount || 0) + 1; run.addRelic('GIRYA'); this.run.strengthBonus = (this.run.strengthBonus || 0) + 1; run.relics = run.relics.filter(r => r !== 'GIRYA'); run.relics.push('GIRYA'); run.giryaStrength = (run.giryaStrength || 0) + 1; } });

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
      const rarity = { common: '普通', uncommon: '罕见', rare: '稀有', basic: '初始' }[def.rarity] || '';
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
      descHtml: esc(RELICS[item.id].desc).replace(/\n/g, '<br>'),
      price: item.price, sold: item.sold,
    });

    const potionRow = (item, i) => row({
      attr: 'data-buy-potion', i,
      icon: POTIONS[item.id].icon,
      name: POTIONS[item.id].name,
      tag: '药水',
      descHtml: esc(POTIONS[item.id].desc),
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
      <div class="sheet-sub">点任意商品先看效果，确认后再付钱。</div>
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
      const rarity = { common: '普通', uncommon: '罕见', rare: '稀有' }[def.rarity] || '';
      const type = { attack: '攻击', skill: '技能', power: '能力' }[def.type] || '';
      title = def.name;
      tag = [rarity, type].filter(Boolean).join(' · ');
      body = `<div class="shop-preview">${cardHTML(makeCard(item.id), {})}</div>
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
    const picked = await this.requestSelection({ pool: run.deck.map(d => makeCard(d.id, d.upgraded)).map((c, i) => ({ ...c, _entry: run.deck[i] })), count: 1, prompt: '选择要移除的牌' });
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
          ${rid ? `<div class="choice"><div class="t">${RELICS[rid].icon} ${RELICS[rid].name}</div><div class="d">${RELICS[rid].desc}</div></div>` : ''}
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
    if (!run.eventPool.length) run.eventPool = Object.keys(EVENTS).slice();
    const id = run.eventPool.shift();
    const ev = EVENTS[id];
    const choices = ev.choices(this);

    this.setOverlay(`<div class="sheet">
      <div class="event-art">${esc(ev.title.slice(0, 1))}</div>
      <div class="sheet-title">${esc(ev.title)}</div>
      <div class="event-text">${esc(ev.text)}</div>
      <div class="sheet-body"><div class="choices" id="event-list"></div></div>
    </div>`);
    const list = $('#event-list');
    choices.forEach((ch) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `<div class="t">${esc(ch.label)}</div>${ch.desc ? `<div class="d">${esc(ch.desc)}</div>` : ''}`;
      b.onclick = async () => {
        this.clearOverlay();
        await ch.apply();
        this.save();
        this.showMap();
      };
      list.appendChild(b);
    });
  }

  /* ================= 选择卡牌 ================= */
  requestSelection({ pool, count = 1, prompt = '选择卡牌', optional = false, multi = false }) {
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
      grid.onclick = (e) => {
        const el = e.target.closest('[data-uid]');
        if (!el) return;
        const card = cards.find(c => c.uid === el.dataset.uid);
        if (!card) return;
        if (!multiMode) { this.clearOverlay(); settle([card]); return; }
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
  heal(n) { this.run.heal(n); this.toast(`回复 ${n} 点生命`); }
  damage(n) { this.run.damage(n); this.toast(`失去 ${n} 点生命`); }
  gainGold(n) { this.run.gainGold(n); this.toast(n >= 0 ? `获得 ${n} 金币` : `失去 ${-n} 金币`); }
  gainMaxHp(n) { this.run.gainMaxHp(n); this.toast(n >= 0 ? `最大生命 +${n}` : `最大生命 ${n}`); }
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
      $('#rm-grid').onclick = (e) => {
        const el = e.target.closest('[data-uid]');
        if (!el) return;
        const idx = [...$('#rm-grid').children].indexOf(el);
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
      $('#up-grid').onclick = (e) => {
        const el = e.target.closest('[data-uid]');
        if (!el) return;
        const idx = [...$('#up-grid').children].indexOf(el);
        this.run.deck[upgradable[idx].i].upgraded = true;
        this.clearOverlay();
        this.toast('已升级');
        resolve();
      };
      $('#up-cancel').onclick = () => { this.clearOverlay(); resolve(); };
    });
  }

  /* ================= 结算 ================= */
  showGameOver(win) {
    this.clearSave();
    const run = this.run;
    this.root.innerHTML = `
      <div class="screen result-screen">
        <div class="result-title ${win ? 'win' : 'lose'}">${win ? '塔顶之光' : '你倒下了'}</div>
        <div class="dim small">${win ? '你击败了第一幕的首领。' : '尖塔又一次收下了它的祭品。'}</div>
        <div class="result-stats">
          <div>抵达层数</div><b>${run.floor}</b>
          <div>战斗场次</div><b>${run.stats.combats}</b>
          <div>精英击杀</div><b>${run.stats.elites}</b>
          <div>首领击杀</div><b>${run.stats.bosses}</b>
          <div>牌组张数</div><b>${run.deck.length}</b>
          <div>金币</div><b>${run.gold}</b>
        </div>
        <button class="btn primary" id="back-title" style="width:min(70%,280px)">返回标题</button>
      </div>`;
    $('#back-title').onclick = () => { this.run = null; this.showTitle(); };
  }
}
