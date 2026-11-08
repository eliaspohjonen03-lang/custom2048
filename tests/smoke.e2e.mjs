// Savutesti mobiilinäkymässä (390×844) Playwrightilla.
// Ajo:  node tests/smoke.e2e.mjs   (vaatii playwrightin; käynnistää oman paikallisen palvelimen)
// Valinnainen: SHOTS=/polku/kansioon tallentaa kuvakaappaukset.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS || null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/__tyhja') { res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>tyhjä</title>'); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { const b = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(b); }
  catch { res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) errors.push('ulkoinen pyyntö: ' + r.url()); });

const game = () => page.evaluate(() => JSON.parse(localStorage.getItem('g2048.game')));
const num = async sel => +(await page.textContent(sel));
const settle = () => page.waitForTimeout(250);
async function tileCountMatches() {
  const g = await game();
  const stateTiles = [...g.g].filter(c => c !== '0').length;
  const domTiles = await page.locator('#tiles .tile').count();
  assert.equal(domTiles, stateTiles, `DOM-laattoja ${domTiles}, tilassa ${stateTiles}`);
}
// Asettaa localStorage-tilan ja avaa pelin uudelleen. Ensin siirrytään toiselle saman originin
// sivulle, jotta pelin pagehide-tallennus ei kirjoita asetetun tilan päälle.
async function reopenWith(fn, arg) {
  await page.goto(BASE + '__tyhja');
  await page.evaluate(fn, arg);
  await page.goto(BASE); await page.waitForSelector('#tiles .tile');
}
async function shot(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: true }); }
const step = async (name, fn) => { await fn(); console.log('✓', name); };

try {
  await page.goto(BASE);
  await page.waitForSelector('#tiles .tile');

  await step('aloitus 4×4: 2 laattaa', async () => {
    assert.equal(await page.locator('#tiles .tile').count(), 2);
    assert.equal(await page.locator('#grid > div').count(), 16);
    assert.equal(await page.isDisabled('#btnUndo'), true);
  });

  await step('näppäinsiirrot', async () => {
    for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'a', 'w']) await page.keyboard.press(k);
    await settle();
    assert.ok(await num('#moves') > 0);
    await tileCountMatches();
  });

  await step('pyyhkäisy', async () => {
    const before = await num('#moves');
    const b = await page.locator('#board').boundingBox();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    for (const [dx, dy] of [[-120, 0], [0, -120], [120, 0], [0, 120], [-120, 0], [0, -120]]) {
      await page.mouse.move(cx, cy); await page.mouse.down();
      await page.mouse.move(cx + dx / 2, cy + dy / 2); await page.mouse.move(cx + dx, cy + dy); await page.mouse.up();
    }
    await settle();
    assert.ok(await num('#moves') > before, 'pyyhkäisy ei siirtänyt');
    // pieni liike ei ole pyyhkäisy
    const m = await num('#moves');
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 5, cy); await page.mouse.up();
    await settle();
    assert.equal(await num('#moves'), m);
  });

  await step('peruutus', async () => {
    const moves = await num('#moves');
    await page.click('#btnUndo'); await settle();
    assert.equal(await num('#moves'), moves - 1);
    assert.equal(await num('#undos'), 1);
    await page.keyboard.press('Control+z'); await settle();
    assert.equal(await num('#undos'), 2);
    await tileCountMatches();
  });

  await step('nopea syöte ei riko lautaa', async () => {
    const keys = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
    for (let i = 0; i < 80; i++) await page.keyboard.press(keys[i % 4], { delay: 0 });
    await page.waitForTimeout(400);
    await tileCountMatches();
  });

  await step('uudelleenlataus säilyttää pelin', async () => {
    const g1 = await game();
    await page.reload(); await page.waitForSelector('#tiles .tile');
    const g2 = await game();
    assert.equal(g2.g, g1.g); assert.equal(g2.moves, g1.moves); assert.equal(g2.score, g1.score);
    assert.equal(await num('#moves'), g1.moves);
    await tileCountMatches();
  });

  await step('koon vaihto vahvistusikkunan kautta', async () => {
    await page.click('#sizes button[data-n="8"]');
    await page.waitForSelector('.modal');
    await page.click('.modal >> text=Peruuta');
    assert.equal(await page.locator('#grid > div').count(), 16);
    await page.click('#sizes button[data-n="8"]');
    await page.click('.modal >> text=Vaihda koko');
    assert.equal(await page.locator('#grid > div').count(), 64);
    assert.equal(await page.locator('#tiles .tile').count(), 8);
    assert.equal(await num('#moves'), 0);
  });

  await step('pelin päättyminen ja peruutus sen jälkeen', async () => {
    await reopenWith(() => {
      const enc = vals => vals.map(v => v ? Math.log2(v).toString(36) : '0').join('');
      const g = [8, 16, 8, 0, 32, 64, 32, 64, 64, 32, 64, 32, 128, 256, 128, 256];
      localStorage.setItem('g2048.game', JSON.stringify({ n: 4, g: enc(g), score: 100, moves: 10, undos: 0, elapsed: 5000,
        started: true, over: false, milestone: 1024, reached: false, hist: [] }));
    });
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('.over');
    assert.match(await page.textContent('.over'), /Peli päättyi/);
    const timeA = await page.textContent('#time'); await page.waitForTimeout(1200);
    assert.equal(await page.textContent('#time'), timeA, 'aika ei pysähtynyt');
    await page.click('#btnUndo');
    assert.equal(await page.locator('.over').count(), 0);
    assert.equal(await num('#moves'), 10);
    await tileCountMatches();
  });

  await step('2048-onnittelu ja tilastot', async () => {
    await reopenWith(() => {
      const enc = vals => vals.map(v => v ? Math.log2(v).toString(36) : '0').join('');
      localStorage.setItem('g2048.game', JSON.stringify({ n: 4, g: enc([1024, 1024, 0, 0, ...new Array(12).fill(0)]), score: 0, moves: 3, undos: 1, elapsed: 0,
        started: true, over: false, milestone: 1024, reached: false, hist: [] }));
    });
    await page.keyboard.press('ArrowLeft');
    await page.waitForSelector('#toast.show');
    assert.match(await page.textContent('#toast'), /saavutit 2048/);
    await page.click('#btnStats'); await page.waitForSelector('.modal');
    const txt = await page.textContent('.modal');
    assert.match(txt, /2048 saavutettu1 kertaa/);
    assert.match(txt, /Vähiten siirtoja 2048:aan4/);
    assert.match(txt, /Pelatut pelit/);
    await shot('tilastot.png');
    await page.click('.modal .seg button[data-n="8"]');
    assert.match(await page.textContent('.modal'), /Pelatut pelit0/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.modal').count(), 0);
  });

  await step('kuvasetin luonti, kuva laitteelta ja rajaus', async () => {
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 240; const x = c.getContext('2d');
      x.fillStyle = '#e33'; x.fillRect(0, 0, 200, 240); x.fillStyle = '#33e'; x.fillRect(200, 0, 200, 240);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.click('#btnSettings'); await page.waitForSelector('.modal');
    await page.click('text=+ Uusi kuvasetti');
    await page.fill('.modal:last-child input[type=text]', 'Testisetti');
    await page.click('.modal:last-child >> text=Luo');
    await page.waitForSelector('.lvl');
    assert.equal(await page.textContent('#evoName'), 'Testisetti');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.lvl[data-v="2"] >> text=Laitteelta')]);
    await chooser.setFiles({ name: 'testi.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForSelector('.crop-view canvas');
    const v = await page.locator('.crop-view').boundingBox();
    await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2); await page.mouse.down();
    await page.mouse.move(v.x + v.width / 2 + 60, v.y + v.height / 2, { steps: 5 }); await page.mouse.up();
    await page.locator('.modal:last-child input[type=range]').fill('2');
    await shot('rajaus.png');
    await page.click('.modal:last-child >> text=Tallenna');
    await page.waitForSelector('.lvl[data-v="2"] >> text=Rajaa');
    await shot('asetukset.png');
    // järjestyksen vaihto nuolilla: kuva tasolta 2 tasolle 4 ja takaisin
    assert.ok(await page.locator('.lvl[data-v="2"] .mv-up').isDisabled());
    await page.click('.lvl[data-v="2"] .mv-down');
    await page.waitForSelector('.lvl[data-v="4"] >> text=Rajaa');
    assert.equal(await page.locator('.lvl[data-v="2"] >> text=Rajaa').count(), 0);
    await page.click('.lvl[data-v="4"] .mv-up');
    await page.waitForSelector('.lvl[data-v="2"] >> text=Rajaa');
    assert.equal(await page.locator('.lvl[data-v="4"] >> text=Rajaa').count(), 0);
    await page.click('.modal .sheet-head button[aria-label=Sulje]');
    const imgs = await page.locator('#evo .face.img').count();
    assert.equal(imgs, 1);
    // kuva säilyy uudelleenlatauksen yli (IndexedDB)
    await page.reload(); await page.waitForSelector('#tiles .tile');
    await page.waitForFunction(() => document.querySelectorAll('#evo .face.img').length === 1);
  });

  await step('ei konsolivirheitä eikä ulkoisia pyyntöjä', async () => {
    assert.deepEqual(errors, []);
  });

  await step('service worker ja offline-tila', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.waitForSelector('#tiles .tile');
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload(); await page.waitForSelector('#tiles .tile');
    await context.setOffline(false);
  });

  if (SHOTS) {
    for (const n of [4, 8, 16]) {
      await reopenWith(n => { localStorage.removeItem('g2048.game'); localStorage.setItem('g2048.size', n); }, n);
      const keys = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowDown'];
      for (let i = 0; i < (n === 4 ? 30 : n === 8 ? 60 : 120); i++) await page.keyboard.press(keys[i % 4]);
      await page.waitForTimeout(400);
      await tileCountMatches();
      await shot(`lauta-${n}.png`);
    }
    console.log('✓ kuvakaappaukset:', SHOTS);
  }
  console.log('\nKaikki savutestit läpi.');
} catch (e) {
  console.error('\n✗ Savutesti epäonnistui:', e);
  if (errors.length) console.error('Konsolivirheet:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
