// Laudan ja laattojen piirto sekä animaatiot.
import { $, h } from './dom.js';
import { CFG, fsFor, maxTile } from './logic.js';
import { P, activeProfile } from './profiles.js';
import { st } from './stats.js';

export const ANIM = 100;
const PAL = {
  2: ['#ffffff', '#4a5868'], 4: ['#e9f1ff', '#35598c'], 8: ['#dcf4ea', '#1f6b4f'],
  16: ['#c5ecd9', '#175f47'], 32: ['#d5edfb', '#1c5d84'], 64: ['#b9def6', '#154d73'],
  128: ['#e4defb', '#4a3a8e'], 256: ['#d2c8f5', '#3d2e84'], 512: ['#fbdbe9', '#8a2f5b'],
  1024: ['#f6c4da', '#78234e'], 2048: ['#ffe6a3', '#7a5200'], 4096: ['#ffd472', '#6a4500'],
  8192: ['#ffc5a4', '#7a3311'], 16384: ['#ffaa86', '#6b280b'], 32768: ['#c9efab', '#2e5c12'],
  65536: ['#a6e2d6', '#145047'], 131072: ['#c3d3f3', '#22396b']
};

/* ---------- Laatan ulkoasu ---------- */
function colors(v) { return PAL[v] || ['#1e2833', '#ffffff']; }
export function paintFace(face, v, badge = true) {
  const url = P.imgURLs[v];
  face.textContent = '';
  if (url) {
    face.className = 'face img';
    face.style.backgroundImage = `url("${url}")`;
    face.style.backgroundColor = '#fff';
    face.style.color = '';
    if (badge && P.showValue) face.appendChild(h('span', 'badge', v));
  } else {
    const [bg, fg] = colors(v);
    face.className = 'face num' + (v >= 2048 ? ' glow' : '');
    face.style.backgroundImage = '';
    face.style.backgroundColor = bg;
    face.style.color = fg;
    face.style.setProperty('--fs', fsFor(v));
    face.textContent = v;
  }
}
export function miniTile(v, badge = false) {
  const sq = h('div', 'sq'); const f = h('div', 'face'); sq.appendChild(f); paintFace(f, v, badge); return sq;
}

/* ---------- Lauta ---------- */
export const boardEl = document.getElementById('board');
const gridEl = document.getElementById('grid'), tilesEl = document.getElementById('tiles');
const tileEls = new Map(); let pending = null;
let curN = 4;

export function setupBoard(G) {
  curN = G.n;
  boardEl.style.setProperty('--n', G.n);
  gridEl.innerHTML = '';
  for (let i = 0; i < G.n * G.n; i++) gridEl.appendChild(document.createElement('div'));
  [...$('#sizes').children].forEach(b => b.classList.toggle('on', +b.dataset.n === G.n));
  resize();
}
export function resize() {
  const w = boardEl.clientWidth; if (!w) return;
  const c = CFG[curN];
  const gap = Math.max(2, Math.round(w * c.gap));
  const tile = (w - 2 * gap - (curN - 1) * gap) / curN;
  boardEl.style.setProperty('--gap', gap + 'px');
  boardEl.style.setProperty('--tpx', tile.toFixed(2) + 'px');
  boardEl.style.setProperty('--tr', c.radius + 'px');
  boardEl.classList.toggle('tiny', tile < 34);
}
function place(e, i) { e.style.setProperty('--r', Math.floor(i / curN)); e.style.setProperty('--c', i % curN); }
function makeTileEl(t, i) {
  const e = h('div', 'tile'); const f = h('div', 'face'); e.appendChild(f);
  paintFace(f, t.v); place(e, i); e.dataset.v = t.v; tilesEl.appendChild(e); tileEls.set(t.id, e); return e;
}
// Vie kesken olevan animaation heti loppuun.
export function flush() { if (pending) { clearTimeout(pending.t); const fn = pending.fn; pending = null; fn(); } }
export function renderHard(G) {
  flush(); tilesEl.innerHTML = ''; tileEls.clear();
  G.cells.forEach((t, i) => { if (t) { delete t.from; delete t.isNew; makeTileEl(t, i); } });
}
export function renderMove(G) {
  flush();
  const remove = [], reveal = [], live = new Set();
  G.cells.forEach((t, i) => {
    if (!t) return;
    if (t.from) {
      for (const id of t.from) { const e = tileEls.get(id); if (e) { place(e, i); remove.push(e); tileEls.delete(id); } }
      const e = makeTileEl(t, i); e.classList.add('hidden'); reveal.push(e); delete t.from;
    } else if (t.isNew) {
      const e = makeTileEl(t, i); e.classList.add('hidden', 'spawn'); reveal.push(e); delete t.isNew;
    } else {
      const e = tileEls.get(t.id); if (e) place(e, i); else makeTileEl(t, i);
    }
    live.add(t.id);
  });
  for (const [id, e] of tileEls) if (!live.has(id)) { e.remove(); tileEls.delete(id); }
  const fn = () => { remove.forEach(e => e.remove()); reveal.forEach(e => e.classList.remove('hidden')); };
  pending = { fn, t: setTimeout(() => { if (pending && pending.fn === fn) pending = null; fn(); }, ANIM) };
}
export function refreshFaces(G) {
  if (G) for (const e of tileEls.values()) paintFace(e.firstChild, +e.dataset.v);
  renderEvo(G);
  const p = activeProfile(); $('#evoName').textContent = p ? p.name : 'Tavalliset numerot';
}

/* ---------- Evoluutiokaavio ---------- */
let evoMax = 0;
export function evoNeedsUpdate(mx) { return mx !== evoMax; }
export function renderEvo(G) {
  const box = $('#evo'); box.innerHTML = '';
  const mx = G ? maxTile(G.cells) : 0; evoMax = mx;
  const top = Math.max(8192, mx);
  for (let v = 2; v <= top; v *= 2) {
    const it = h('div', 'evo-item' + (v > mx ? ' locked' : '') + (v === mx ? ' cur' : ''));
    it.appendChild(miniTile(v)); if (P.imgURLs[v]) it.appendChild(h('small', null, v));
    box.appendChild(it);
  }
}

/* ---------- HUD ja pelin loppu ---------- */
export function updateHUD(G, timeText) {
  $('#score').textContent = G.score;
  $('#best').textContent = Math.max(st(G.n).best, G.score);
  $('#moves').textContent = G.moves;
  $('#undos').textContent = G.undos;
  $('#time').textContent = timeText;
  $('#btnUndo').disabled = !G.hist.length;
}
let overEl = null;
export function showOver(G, onNew) {
  hideOver();
  overEl = h('div', 'over');
  overEl.innerHTML = `<h2>Peli päättyi</h2><p>Pisteet: <b>${G.score}</b> · Suurin laatta: <b>${maxTile(G.cells)}</b></p>
    <p style="font-size:13px">Voit myös perua siirron alta.</p>`;
  const b = h('button', 'btn primary', 'Uusi peli'); b.onclick = onNew;
  overEl.appendChild(b); boardEl.appendChild(overEl);
}
export function hideOver() { if (overEl) { overEl.remove(); overEl = null; } }
