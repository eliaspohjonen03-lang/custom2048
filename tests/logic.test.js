import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slide, canMove, encode, decode, spawn, maxTile, emptyIdx, fmtTime, newTile } from '../js/logic.js';

// Apurit: arvotaulukko <-> laattataulukko
const cellsOf = vals => vals.map(v => (v ? newTile(v) : null));
const valsOf = cells => cells.map(t => (t ? t.v : 0));
const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;

// Siemennetty satunnaislukugeneraattori (mulberry32)
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function slideRow(row, dir) {
  // 4x4-lauta, jonka ensimmäinen rivi on row, muut tyhjiä
  const vals = [...row, ...new Array(12).fill(0)];
  const r = slide(cellsOf(vals), 4, dir);
  return { ...r, vals: valsOf(r.out) };
}

test('[2,2,2,2] vasemmalle -> [4,4,0,0]', () => {
  const r = slideRow([2, 2, 2, 2], LEFT);
  assert.deepEqual(r.vals.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(r.gained, 8);
  assert.equal(r.moved, true);
});

test('[4,0,4,8] vasemmalle -> [8,8,0,0]', () => {
  assert.deepEqual(slideRow([4, 0, 4, 8], LEFT).vals.slice(0, 4), [8, 8, 0, 0]);
});

test('laatta ei yhdisty kahdesti samassa siirrossa', () => {
  assert.deepEqual(slideRow([4, 2, 2, 0], LEFT).vals.slice(0, 4), [4, 4, 0, 0]);
  assert.deepEqual(slideRow([2, 2, 4, 0], LEFT).vals.slice(0, 4), [4, 4, 0, 0]);
  assert.deepEqual(slideRow([8, 4, 2, 2], LEFT).vals.slice(0, 4), [8, 4, 4, 0]);
  assert.deepEqual(slideRow([2, 2, 2, 2], RIGHT).vals.slice(0, 4), [0, 0, 4, 4]);
});

test('yhdistyminen oikealle', () => {
  const r = slideRow([2, 2, 2, 0], RIGHT);
  assert.deepEqual(r.vals.slice(0, 4), [0, 0, 2, 4]);
  assert.equal(r.gained, 4);
});

test('yhdistyminen ylös ja alas', () => {
  // Sarake 0: 2,2,4,4 ylhäältä alas
  const vals = [2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0];
  const up = valsOf(slide(cellsOf(vals), 4, UP).out);
  assert.deepEqual([up[0], up[4], up[8], up[12]], [4, 8, 0, 0]);
  const down = valsOf(slide(cellsOf(vals), 4, DOWN).out);
  assert.deepEqual([down[0], down[4], down[8], down[12]], [0, 0, 4, 8]);
  // Ylöspäin rivissä 2,2,2: yhdistyy yläreunasta alkaen
  const v2 = [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0];
  const up2 = valsOf(slide(cellsOf(v2), 4, UP).out);
  assert.deepEqual([up2[0], up2[4], up2[8], up2[12]], [4, 2, 0, 0]);
  const down2 = valsOf(slide(cellsOf(v2), 4, DOWN).out);
  assert.deepEqual([down2[0], down2[4], down2[8], down2[12]], [0, 0, 2, 4]);
});

test('moved = false, kun mikään ei liiku', () => {
  assert.equal(slideRow([2, 4, 8, 16], LEFT).moved, false);
  assert.equal(slideRow([2, 4, 8, 16], RIGHT).moved, false);
  assert.equal(slideRow([2, 4, 0, 0], LEFT).moved, false);
  assert.equal(slideRow([2, 4, 0, 0], UP).moved, false);
  assert.equal(slideRow([2, 4, 0, 0], RIGHT).moved, true);
  const empty = slide(cellsOf(new Array(16).fill(0)), 4, LEFT);
  assert.equal(empty.moved, false);
  assert.equal(empty.gained, 0);
});

test('pisteet = yhdistettyjen laattojen summa', () => {
  const vals = [2, 2, 4, 4, 8, 8, 8, 0, 16, 0, 16, 0, 0, 0, 0, 0];
  const r = slide(cellsOf(vals), 4, LEFT);
  assert.equal(r.gained, 4 + 8 + 16 + 32);
  assert.deepEqual(valsOf(r.out), [4, 8, 0, 0, 16, 8, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0]);
});

test('yhdistetty laatta kertoo, mistä se syntyi', () => {
  const cells = cellsOf([2, 2, 0, 0, ...new Array(12).fill(0)]);
  const ids = [cells[0].id, cells[1].id];
  const r = slide(cells, 4, LEFT);
  assert.deepEqual(r.out[0].from, ids);
});

test('canMove', () => {
  assert.equal(canMove(cellsOf([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]), 4), false);
  assert.equal(canMove(cellsOf([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 0]), 4), true);
  assert.equal(canMove(cellsOf([2, 2, 4, 8, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128]), 4), true); // vaakapari
  assert.equal(canMove(cellsOf([2, 4, 8, 16, 2, 8, 16, 32, 4, 16, 32, 64, 8, 32, 64, 128]), 4), true); // pystypari
});

test('encode ja decode', () => {
  const vals = [0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 65536, 2 ** 20];
  const s = encode(cellsOf(vals));
  assert.equal(s.length, 16);
  assert.equal(s[0], '0');
  assert.equal(s[1], '1');
  assert.equal(s[11], 'b'); // log2(2048) = 11
  assert.deepEqual(valsOf(decode(s)), vals);
  assert.equal(decode('0000').every(x => x === null), true);
});

test('uudet laatat: oikea määrä ja arvot 2 tai 4', () => {
  const cells = new Array(16).fill(null);
  spawn(cells, 2, rng(1));
  assert.equal(cells.filter(Boolean).length, 2);
  for (const t of cells.filter(Boolean)) assert.ok(t.v === 2 || t.v === 4);
});

test('uudet laatat täyteen lautaan: ei mitään', () => {
  const cells = cellsOf(new Array(16).fill(2));
  const before = encode(cells);
  spawn(cells, 4, rng(2));
  assert.equal(encode(cells), before);
});

test('uudet laatat melkein täyteen lautaan: niin monta kuin mahtuu', () => {
  const vals = new Array(64).fill(2); vals[5] = 0; vals[40] = 0;
  const cells = cellsOf(vals);
  spawn(cells, 4, rng(3));
  assert.equal(emptyIdx(cells).length, 0);
  assert.ok(cells[5] && cells[40]);
});

test('spawn on toistettava samalla siemenellä', () => {
  const a = spawn(new Array(256).fill(null), 32, rng(42));
  const b = spawn(new Array(256).fill(null), 32, rng(42));
  assert.equal(encode(a), encode(b));
  assert.equal(a.filter(Boolean).length, 32);
});

test('noin 90 % uusista laatoista on kakkosia', () => {
  const r = rng(7); let twos = 0; const N = 5000;
  for (let i = 0; i < N; i++) { const c = [null]; spawn(c, 1, r); if (c[0].v === 2) twos++; }
  assert.ok(Math.abs(twos / N - 0.9) < 0.02, `osuus ${twos / N}`);
});

test('maxTile ja fmtTime', () => {
  assert.equal(maxTile(cellsOf([0, 2, 512, 4])), 512);
  assert.equal(maxTile([null, null]), 0);
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(65_000), '1:05');
  assert.equal(fmtTime(3_600_000 + 61_000), '1:01:01');
});
