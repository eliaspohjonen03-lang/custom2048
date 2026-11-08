// Tilastot, erikseen jokaiselle ruudukon koolle.
import { store } from './storage.js';

const STATS = (() => { const s = store.get('stats', {}); return s && typeof s === 'object' ? s : {}; })();

export function st(n) {
  if (!STATS[n]) STATS[n] = { best: 0, bestTile: 0, games: 0, wins: 0, fast: null, fewMoves: null, fewUndos: null };
  return STATS[n];
}
export function saveStats() { store.set('stats', STATS); }
export function resetStats(n) { delete STATS[n]; saveStats(); }

// Päivittää tilastot siirron jälkeen. Palauttaa true, jos 2048 saavutettiin nyt ensimmäistä kertaa.
export function recordMove(G, mx, elapsedMs) {
  const S = st(G.n);
  if (G.score > S.best) S.best = G.score;
  if (mx > S.bestTile) S.bestTile = mx;
  if (mx >= 2048 && !G.reached) {
    G.reached = true; S.wins++;
    const t = Math.round(elapsedMs);
    if (S.fast == null || t < S.fast) S.fast = t;
    if (S.fewMoves == null || G.moves < S.fewMoves) S.fewMoves = G.moves;
    if (S.fewUndos == null || G.undos < S.fewUndos.u || (G.undos === S.fewUndos.u && G.moves < S.fewUndos.m))
      S.fewUndos = { u: G.undos, m: G.moves, t, d: Date.now() };
    return true;
  }
  return false;
}
