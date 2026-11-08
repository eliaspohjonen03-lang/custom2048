// Puhdas pelilogiikka: ei DOM-viittauksia. Satunnaisuus annetaan parametrina (rng),
// jotta testit ovat toistettavia.

export const SIZES = [4, 8, 16];
export const CFG = {
  4:  { start: 2,  spawn: 1, gap: .028, radius: 4 },
  8:  { start: 8,  spawn: 2, gap: .014, radius: 3 },
  16: { start: 32, spawn: 4, gap: .007, radius: 2 }
};
export const LEVELS = Array.from({ length: 13 }, (_, i) => 2 ** (i + 1)); // 2 … 8192

let nextId = 1;
export const newTile = v => ({ id: nextId++, v });

export function emptyIdx(cells) { const r = []; for (let i = 0; i < cells.length; i++) if (!cells[i]) r.push(i); return r; }

// Lisää enintään `count` uutta laattaa (2 tn. 90 %, muuten 4) satunnaisiin vapaisiin ruutuihin.
export function spawn(cells, count, rng = Math.random) {
  const e = emptyIdx(cells);
  for (let k = 0; k < count && e.length; k++) {
    const i = e.splice(Math.floor(rng() * e.length), 1)[0];
    const t = newTile(rng() < .9 ? 2 : 4); t.isNew = true; cells[i] = t;
  }
  return cells;
}

// 0 ylös, 1 oikea, 2 alas, 3 vasen. Jokainen rivi alkaa siitä reunasta, jota kohti liikutaan.
export function lines(n, dir) {
  const out = [];
  for (let a = 0; a < n; a++) {
    const L = [];
    for (let b = 0; b < n; b++) {
      let r, c;
      if (dir === 0) { c = a; r = b; } else if (dir === 2) { c = a; r = n - 1 - b; }
      else if (dir === 3) { r = a; c = b; } else { r = a; c = n - 1 - b; }
      L.push(r * n + c);
    }
    out.push(L);
  }
  return out;
}

export function slide(cells, n, dir) {
  const out = new Array(n * n).fill(null); let gained = 0, moved = false;
  for (const L of lines(n, dir)) {
    const res = [];
    for (const i of L) {
      const t = cells[i]; if (!t) continue;
      const last = res[res.length - 1];
      if (last && !last.m && last.v === t.v) {
        const nt = newTile(t.v * 2); nt.from = [last.id, t.id]; nt.m = true;
        res[res.length - 1] = nt; gained += nt.v;
      } else res.push({ id: t.id, v: t.v });
    }
    res.forEach((t, k) => { delete t.m; out[L[k]] = t; });
    for (const i of L) if ((cells[i] ? cells[i].id : 0) !== (out[i] ? out[i].id : 0)) moved = true;
  }
  return { out, gained, moved };
}

export function canMove(cells, n) {
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const t = cells[r * n + c]; if (!t) return true;
    if (c < n - 1) { const o = cells[r * n + c + 1]; if (!o || o.v === t.v) return true; }
    if (r < n - 1) { const o = cells[(r + 1) * n + c]; if (!o || o.v === t.v) return true; }
  }
  return false;
}

export function maxTile(cells) { let m = 0; for (const t of cells) if (t && t.v > m) m = t.v; return m; }

// Jokainen ruutu log2-arvona base36-merkkinä ('0' = tyhjä).
export function encode(cells) { return cells.map(t => t ? Math.log2(t.v).toString(36) : '0').join(''); }
export function decode(s) { return [...s].map(ch => { const k = parseInt(ch, 36); return k ? newTile(2 ** k) : null; }); }

export function fmtTime(ms) {
  const s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

export function fsFor(v) { const d = String(v).length; return [0, .52, .48, .4, .32, .26, .22, .19][Math.min(d, 7)]; }
