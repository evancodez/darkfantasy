// HUD and screens, drawn with tiny pixel-art sprites and pixel fonts.
const C = { x: '#12001a', r: '#ee2244', R: '#9a0a26', w: '#ffd8e0', e: '#2a1838', E: '#1a0e26', y: '#ffd040', Y: '#c07a10', W: '#ffffff', o: '#5a2a00', b: '#a8c4ff', B: '#5a78e8', k: '#22224a', K: '#14142e' };
function sprite(rows, map = {}) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.') continue;
    g.fillStyle = map[ch] || C[ch] || '#f0f';
    g.fillRect(x, y, 1, 1);
  }
  return cv.toDataURL();
}
const HEART = [
  '.xxx...xxx.',
  'xrwrx.xrrrx',
  'xwrrrxrrrrx',
  'xrrrrrrrrRx',
  'xrrrrrrrrRx',
  '.xrrrrrrRx.',
  '..xrrrrRx..',
  '...xrrRx...',
  '....xRx....',
  '.....x.....',
];
const MOTE = [
  '....o....',
  '...oyo...',
  '...oyo...',
  '.ooyWyoo.',
  'oyyWWWyyo',
  '.ooyWyoo.',
  '...oyo...',
  '...oyo...',
  '....o....',
];
function crescent(full) {
  const rows = [];
  for (let y = 0; y < 13; y++) {
    let r = '';
    for (let x = 0; x < 13; x++) {
      const a = Math.hypot(x - 6, y - 6), b = Math.hypot(x - 8.6, y - 4.6);
      if (a <= 6.2 && b > 4.8) r += (a > 5.2 || b < 5.8) ? 'x' : (full ? (x + y < 9 ? 'W' : x + y < 13 ? 'b' : 'B') : 'k');
      else r += '.';
    }
    rows.push(r);
  }
  return sprite(rows, full ? {} : { x: '#3a3a6a' });
}
const TICKET = [
  'xxxxxxxxxxxxxx',
  'xyyyyyyyyyyyyx',
  '.yYyyyWyyyyYy.',
  'xyyyyWWryyyyyx',
  '.yYyyWryyyyYy.',
  'xyyyyyWWyyyyyx',
  'xyyyyyyyyyyyyx',
  'xxxxxxxxxxxxxx',
];
// a Dream Shard: a rainbow prism
const SHARD = [
  '....x....',
  '...xWx...',
  '..xWcmx..',
  '..xcmmx..',
  '.xWcmmyx.',
  '.xccmmyx.',
  'xWccmyyyx',
  'xcccmyyyx',
  '.xccmyyx.',
  '..xcmyx..',
  '...xmx...',
  '....x....',
];
const SPR = {
  shard: sprite(SHARD, { x: '#2a1a6a', c: '#60f0ff', m: '#ff70e0', y: '#ffe070' }), shardE: sprite(SHARD, { x: '#3a3a6a', W: '#2a2a50', c: '#1c1a40', m: '#221a44', y: '#1a1638' }),
  heart: sprite(HEART), heartE: sprite(HEART, { r: C.e, R: C.E, w: C.e, x: '#4a2a5a' }),
  mote: sprite(MOTE), sigil: crescent(true), sigilE: crescent(false),
  ticket: sprite(TICKET, { x: '#8a4a08', r: '#c0206a' }), ticketE: sprite(TICKET, { x: '#3a2a4a', y: '#2a1c3a', Y: '#1a1028', W: '#4a3a5a', r: '#3a2a4a' }),
};

// chapter select: two books, each a row of buttons
export const BOOKS = [
  { name: 'BOOK I · GRIMHOLD', ch: [['grounds', 'The Grounds'], ['hall', 'The Hall'], ['spire', 'The Spire'], ['gate', 'The Demon Gate'], ['dragon', 'The Dragon'], ['carnival', 'The Moon Carnival'], ['queen', 'The Puppet Queen']] },
  { name: 'BOOK II · THE MIRROR SEA', ch: [['dream', 'The Glass Lagoon'], ['somnia', 'Mother of Moths']] },
];
const chapterHTML = () => BOOKS.map(b => `<div class="chl">${b.name}</div>` + b.ch.map(([id, n], i) => `<button data-ch="${id}">${i + 1} · ${n}</button>`).join('')).join('');
// control hints for keyboard + mouse and for a PS5 pad (any pad: same positions)
const ps = (k) => ({ x: '<i class="ps x">\u2715</i>', o: '<i class="ps o">\u25CB</i>', s: '<i class="ps s">\u25A1</i>', t: '<i class="ps t">\u25B3</i>' }[k] || `<i class="ps sh">${k}</i>`);
const CTL = {
  kbm: ['<b>WASD</b> move', '<b>MOUSE</b> or <b>Q / E</b> camera · <b>R</b> recentre', '<b>SPACE</b> jump · again to flip',
    '<b>CLICK</b> sword · slashes in mid-air too', '<b>C</b> or <b>MIDDLE CLICK</b> spin · in mid-air: SMASH DOWN', '<b>RIGHT CLICK / SHIFT</b> shield · tap just before a hit to PARRY'],
  pad: ['<b>LEFT STICK</b> move', `<b>RIGHT STICK</b> camera · ${ps('R1')} recentre`, `${ps('x')} jump · again to flip`,
    `${ps('s')} sword · slashes in mid-air too`, `${ps('t')} spin · in mid-air: SMASH DOWN`, `${ps('L1')} shield · tap just before a hit to PARRY`],
};
const ctlHTML = () => `<div class="ctl kbm">${CTL.kbm.map(c => `<span>${c}</span>`).join('')}</div><div class="ctl pad">${CTL.pad.map(c => `<span>${c}</span>`).join('')}</div>`;
// short button names for in-game hints
export const BTN = {
  kbm: { attack: 'CLICK', heavy: 'C', jump: 'SPACE', guard: 'RIGHT CLICK', smash: 'C' },
  pad: { attack: '\u25A1', heavy: '\u25B3', jump: '\u2715', guard: 'L1', smash: '\u25B3' },
};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; parent?.appendChild(e); return e; };

export class HUD {
  constructor() {
    const root = $('hud');
    root.innerHTML = '';
    this.root = root;
    this.hp = el('div', 'hp', root);
    const mr = el('div', 'motes', root);
    el('img', 'icon', mr).src = SPR.mote;
    this.moteN = el('span', '', mr, '000');
    this.sig = el('div', 'sigils', root);
    this.sigImgs = [0, 1, 2].map(() => { const i = el('img', '', this.sig); i.src = SPR.sigilE; return i; });
    this.areaBox = el('div', 'area', root);
    this.hintBox = el('div', 'hint', root);
    this.calloutBox = el('div', 'callout', root);
    this.bossBox = el('div', 'boss hidden', root, '<div class="bname"></div><div class="bbar"><div class="blag"></div><div class="bfill"></div></div>');
    this.promptBox = el('div', 'prompt', root);
    root.classList.add('hidden');

    // screens
    const scr = el('div', 'screens', document.body);
    this.titleS = el('div', 'screen title hidden', scr, `
      <div class="logo">Grimhold</div>
      <div class="tag">~ the Candle Knight ~</div>
      <div class="press"><span class="kbm">PRESS START</span><span class="pad">PRESS ${ps('x')} TO START</span></div>
      <div class="chapters">${chapterHTML()}</div>
      ${ctlHTML()}`);
    this.titleS.addEventListener('click', (e) => { const ch = e.target.closest('[data-ch]')?.dataset.ch; if (ch) this.onChapter?.(ch); else if (!e.target.closest('.chapters')) this.onStart?.(); });
    this.loadS = el('div', 'screen loading hidden', scr, '<div class="ltxt"></div>');
    this.pauseS = el('div', 'screen pause hidden', scr, `<div class="ptitle">Paused</div><div class="press small"><span class="kbm">CLICK TO CONTINUE</span><span class="pad">${ps('x')} OR OPTIONS TO CONTINUE</span></div>
      <div class="chapters small">${chapterHTML()}</div>
      ${ctlHTML()}`);
    this.pauseS.addEventListener('click', (e) => { const ch = e.target.closest('[data-ch]')?.dataset.ch; if (ch) this.onChapter?.(ch); else if (!e.target.closest('.chapters')) this.onResume?.(); });
    this.deathS = el('div', 'screen death hidden', scr, '<div class="dtitle">Your Flame Goes Out</div><div class="dsub">…but a candle can be lit again</div>');
    this.winS = el('div', 'screen win hidden', scr, '<div class="logo small">Victory</div><div class="tag">The Star-Eater is slain. Grimhold sleeps.</div><div class="stats"></div><div class="chapters"><button class="next hidden"></button></div><div class="press">THANK YOU FOR PLAYING</div>');
    this.nextBtn = this.winS.querySelector('.next');
    this.nextBtn.addEventListener('click', () => this.onNext?.());
    this.lastCol = '';
    this.ready = false;
    this.lastHp = -1; this.lastMax = -1; this.lastMotes = -1; this.lastSig = -1;
  }
  // which control hints to show: 'kbm' or 'pad'
  setDevice(d) { document.body.classList.toggle('pad', d === 'pad'); }
  // gamepad menus: move a highlight across the chapter buttons by screen position
  menuButtons(scr) { return [...scr.querySelectorAll('[data-ch]')]; }
  menuMove(scr, dx, dy) {
    const bs = this.menuButtons(scr);
    if (!bs.length) return false;
    const cur = bs.find(b => b.classList.contains('focus'));
    if (!cur) { this.menuFocus(scr, bs[0]); return true; }
    const r0 = cur.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
    let best = null, bd = 1e9;
    for (const b of bs) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect(), vx = r.left + r.width / 2 - c0[0], vy = r.top + r.height / 2 - c0[1];
      const along = vx * dx + vy * dy, across = Math.abs(vx * dy - vy * dx);
      if (along <= 4) continue;
      const d = along + across * 3;
      if (d < bd) { bd = d; best = b; }
    }
    if (!best && dx) best = bs[(bs.indexOf(cur) + dx + bs.length) % bs.length];
    if (best) this.menuFocus(scr, best);
    return !!best;
  }
  menuFocus(scr, b) { for (const x of this.menuButtons(scr)) x.classList.toggle('focus', x === b); }
  menuFocused(scr) { return this.menuButtons(scr).find(b => b.classList.contains('focus')) || null; }
  loading(text) { this.loadS.classList.toggle('hidden', !text); if (text) this.loadS.querySelector('.ltxt').textContent = text; }
  title(on) { this.titleS.classList.toggle('hidden', !on); this.ready = on || this.ready; }
  show(on) { this.root.classList.toggle('hidden', !on); }
  pause(on) { this.pauseS.classList.toggle('hidden', !on); }
  death(on) { this.deathS.classList.toggle('hidden', !on); }
  // the end of a book: stats, a line of epilogue, and (optionally) a way on to the next book
  win(stats, tag, next = null) {
    this.winS.classList.remove('hidden'); this.winS.querySelector('.stats').innerHTML = stats; if (tag) this.winS.querySelector('.tag').textContent = tag; this.show(false);
    this.onNext = next?.go; this.nextBtn.classList.toggle('hidden', !next); this.nextBtn.classList.toggle('focus', !!next);
    if (next) this.nextBtn.innerHTML = next.label;
    this.winS.querySelector('.press').textContent = next ? '' : 'THANK YOU FOR PLAYING';
  }
  unwin() { this.winS.classList.add('hidden'); this.show(true); }

  area(name, sub = '') {
    this.areaBox.innerHTML = `<div class="aname">${name}</div>${sub ? `<div class="asub">${sub}</div>` : ''}`;
    this.areaBox.classList.remove('show'); void this.areaBox.offsetWidth; this.areaBox.classList.add('show');
  }
  hint(text, secs = 4) {
    if (!text) { clearTimeout(this._ht); this.hintBox.classList.remove('show'); return; }
    this.hintBox.textContent = text; this.hintBox.classList.add('show');
    clearTimeout(this._ht); this._ht = setTimeout(() => this.hintBox.classList.remove('show'), secs * 1000);
  }
  prompt(text) { if (this._p !== text) { this._p = text; this.promptBox.textContent = text || ''; this.promptBox.classList.toggle('show', !!text); } }
  callout(text, cls = '') {
    this.calloutBox.textContent = text; this.calloutBox.className = 'callout ' + cls;
    void this.calloutBox.offsetWidth; this.calloutBox.classList.add('show');
  }
  boss(name, frac) {
    if (name === null) { this.bossBox.classList.add('hidden'); return; }
    this.bossBox.classList.remove('hidden');
    if (name) this.bossBox.querySelector('.bname').textContent = name;
    this.bossBox.querySelector('.bfill').style.transform = `scaleX(${Math.max(0, frac)})`;
    this.bossBox.querySelector('.blag').style.transform = `scaleX(${Math.max(0, frac)})`;
  }
  update(dt, g) {
    const p = g.player;
    if (!p) return;
    if (p.hp !== this.lastHp || p.maxHp !== this.lastMax) {
      const lost = p.hp < this.lastHp;
      this.hp.innerHTML = '';
      for (let i = 0; i < p.maxHp; i++) { const im = el('img', i < p.hp ? 'h' : 'h e', this.hp); im.src = i < p.hp ? SPR.heart : SPR.heartE; if (lost && i === p.hp) im.classList.add('lost'); }
      if (p.hp === 1) this.hp.classList.add('low'); else this.hp.classList.remove('low');
      this.lastHp = p.hp; this.lastMax = p.maxHp;
    }
    if (g.motes !== this.lastMotes) {
      this.moteN.textContent = String(g.motes).padStart(3, '0');
      if (this.lastMotes >= 0) { this.moteN.parentElement.classList.remove('bump'); void this.moteN.offsetWidth; this.moteN.parentElement.classList.add('bump'); }
      this.lastMotes = g.motes;
    }
    // three Moon Sigils on the grounds, three Moon Tickets at the carnival, three Dream Shards in the Mirror Sea
    const kind = g.zone === 'carnival' ? 't' : g.zone === 'dream' ? 'd' : 's';
    const n = kind === 't' ? g.tickets || 0 : kind === 'd' ? g.shards || 0 : g.sigils, key = kind + n;
    if (key !== this.lastCol) {
      const full = { t: SPR.ticket, d: SPR.shard, s: SPR.sigil }[kind], empty = { t: SPR.ticketE, d: SPR.shardE, s: SPR.sigilE }[kind];
      this.sigImgs.forEach((im, i) => { im.src = i < n ? full : empty; im.classList.toggle('got', i < n); im.classList.toggle('tk', kind === 't'); im.classList.toggle('sh', kind === 'd'); });
      this.lastCol = key;
    }
  }
}
export { SPR };
