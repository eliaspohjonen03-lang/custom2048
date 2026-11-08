// Käynnistys, syötteet, pelisilmukka ja service worker.
import { $, h } from './dom.js';
import { SIZES, CFG, spawn, slide, canMove, maxTile, encode, decode, fmtTime } from './logic.js';
import { store, requestPersist } from './storage.js';
import { st, saveStats, recordMove } from './stats.js';
import { loadActiveImages, onImagesChange } from './profiles.js';
import {
  ANIM, boardEl, setupBoard, resize, renderHard, renderMove, refreshFaces, renderEvo, evoNeedsUpdate,
  updateHUD as paintHUD, showOver as paintOver, hideOver
} from './render.js';
import {
  initUI, toastTile, confirmBox, openStats, openSettings, isModalOpen, closeTopModal, showUpdateBar
} from './ui.js';

/* ================= Aikalaskuri ================= */
let G = null;
let runSince = null;
function elapsed() { return G.elapsed + (runSince != null ? performance.now() - runSince : 0); }
function startTimer() { if (runSince == null && G && G.started && !G.over && !document.hidden) runSince = performance.now(); }
function pauseTimer() { if (runSince != null) { G.elapsed += performance.now() - runSince; runSince = null; } }

function updateHUD() { paintHUD(G, fmtTime(elapsed())); }
function showOver() { paintOver(G, () => freshGame(G.n)); }

/* ================= Pelin tila ================= */
function freshGame(n) {
  G = { n, cells: new Array(n * n).fill(null), score: 0, moves: 0, undos: 0, elapsed: 0,
        started: false, over: false, milestone: 1024, reached: false, hist: [] };
  runSince = null;
  spawn(G.cells, CFG[n].start);
  store.set('size', n);
  setupBoard(G); renderHard(G); hideOver(); updateHUD(); renderEvo(G); saveGame();
}
function saveGame() {
  if (!G) return;
  const per = G.n * G.n + 24;
  const keep = Math.max(50, Math.floor(400000 / per)); // tallennettava peruutushistoria (muistissa rajaton)
  store.set('game', { n: G.n, g: encode(G.cells), score: G.score, moves: G.moves, undos: G.undos,
    elapsed: Math.round(elapsed()), started: G.started, over: G.over, milestone: G.milestone, reached: G.reached,
    hist: G.hist.slice(-keep) });
}
function loadGame() {
  const s = store.get('game', null);
  try {
    if (s && SIZES.includes(s.n) && typeof s.g === 'string' && s.g.length === s.n * s.n) {
      G = { n: s.n, cells: decode(s.g), score: s.score | 0, moves: s.moves | 0, undos: s.undos | 0,
            elapsed: +s.elapsed || 0, started: !!s.started, over: !!s.over, milestone: s.milestone || 1024,
            reached: !!s.reached, hist: Array.isArray(s.hist) ? s.hist.filter(x => x && typeof x.g === 'string' && x.g.length === s.n * s.n) : [] };
      if (!G.cells.some(Boolean)) throw 0;
      setupBoard(G); renderHard(G); updateHUD(); renderEvo(G);
      if (G.over) showOver(); else startTimer();
      return;
    }
  } catch (e) {}
  const n = store.get('size', 4);
  freshGame(SIZES.includes(n) ? n : 4);
}

function move(dir) {
  if (!G || G.over || isModalOpen()) return;
  const before = encode(G.cells);
  const { out, gained, moved } = slide(G.cells, G.n, dir);
  if (!moved) return;
  G.hist.push({ g: before, s: G.score, m: G.moves });
  G.cells = out; G.score += gained; G.moves++;
  spawn(G.cells, CFG[G.n].spawn);
  if (!G.started) { G.started = true; st(G.n).games++; startTimer(); }
  const mx = maxTile(G.cells);
  recordMove(G, mx, elapsed());
  if (mx >= 2048 && mx > G.milestone) { G.milestone = mx; toastTile(mx); }
  renderMove(G);
  if (!canMove(G.cells, G.n)) { G.over = true; pauseTimer(); setTimeout(() => { if (G.over) showOver(); }, ANIM + 60); }
  updateHUD(); if (evoNeedsUpdate(mx)) renderEvo(G);
  saveGame(); saveStats();
}
function undo() {
  if (!G || !G.hist.length || isModalOpen()) return;
  const snap = G.hist.pop();
  G.cells = decode(snap.g); G.score = snap.s; G.moves = snap.m; G.undos++;
  if (G.over) { G.over = false; hideOver(); }
  startTimer();
  renderHard(G); updateHUD(); renderEvo(G); saveGame();
}
function gameInProgress() { return G && G.moves > 0 && !G.over; }
async function requestNewGame(n) {
  if (gameInProgress()) {
    const ok = await confirmBox(n === G.n ? 'Aloitetaanko uusi peli?' : `Vaihdetaanko kokoon ${n}×${n}?`,
      'Nykyinen peli päättyy, eikä sitä voi enää jatkaa.', n === G.n ? 'Uusi peli' : 'Vaihda koko');
    if (!ok) return;
  }
  freshGame(n);
}

/* ================= Syötteet ================= */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.key === 'Escape') { closeTopModal(); return; }
  if (isModalOpen() || tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const map = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
  if (e.key in map) { e.preventDefault(); move(map[e.key]); }
  else if (e.key === 'u' || e.key === 'U') undo();
});
(() => {
  let sx = 0, sy = 0, id = null, t0 = 0;
  boardEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.over')) return;
    id = e.pointerId; sx = e.clientX; sy = e.clientY; t0 = Date.now();
  });
  const end = e => {
    if (e.pointerId !== id) return; id = null;
    const dx = e.clientX - sx, dy = e.clientY - sy, ax = Math.abs(dx), ay = Math.abs(dy);
    const th = Math.max(18, boardEl.clientWidth * .04);
    if (Math.max(ax, ay) < th || Date.now() - t0 > 1500) return;
    move(ax > ay ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  };
  boardEl.addEventListener('pointerup', end);
  boardEl.addEventListener('pointercancel', e => { if (e.pointerId === id) id = null; });
  // estää sivun vierityksen iOS:llä laudan päällä
  boardEl.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
})();
$('#btnUndo').onclick = undo;
$('#btnNew').onclick = () => requestNewGame(G.n);
$('#btnStats').onclick = openStats;
$('#btnSettings').onclick = openSettings;
SIZES.forEach(n => {
  const b = h('button', null, `${n}×${n}`); b.dataset.n = n;
  b.onclick = () => { if (n !== G.n) requestNewGame(n); };
  $('#sizes').appendChild(b);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseTimer(); if (G) saveGame(); } else startTimer(); });
window.addEventListener('pagehide', () => { if (!G) return; pauseTimer(); saveGame(); });
window.addEventListener('pageshow', () => startTimer());
setInterval(() => { if (G && runSince != null) $('#time').textContent = fmtTime(elapsed()); }, 250);
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(boardEl); else window.addEventListener('resize', resize);

initUI({
  getN: () => G.n,
  onStatsReset: () => updateHUD(),
  onFacesChange: () => refreshFaces(G)
});
onImagesChange(() => refreshFaces(G));

/* ================= Service worker ja päivitykset ================= */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (location.protocol !== 'https:' && !local) return;
  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating) return;
    updating = false; location.reload();
  });
  const offer = w => showUpdateBar(() => { updating = true; saveGame(); w.postMessage({ type: 'SKIP_WAITING' }); });
  navigator.serviceWorker.register('./sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    // Tarkistetaan päivitykset myös, kun sovellus palaa näkyviin.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
}

/* ================= Käynnistys ================= */
loadGame();
loadActiveImages();
requestPersist();
registerSW();
