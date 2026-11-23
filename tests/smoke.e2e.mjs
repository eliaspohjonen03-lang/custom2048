// Savutesti mobiilinäkymässä (390×844) Playwrightilla.
// Ajo:  node tests/smoke.e2e.mjs   (vaatii playwrightin; käynnistää oman paikallisen palvelimen)
// Valinnainen: SHOTS=/polku/kansioon tallentaa kuvakaappaukset.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
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
const OV = 'https://api.openverse.org/';
const MOCKED = [OV, 'https://fi.wikipedia.org/', 'https://en.wikipedia.org/', 'https://commons.wikimedia.org/', 'https://upload.wikimedia.org/'];
page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !MOCKED.some(m => u.startsWith(m)) && !u.startsWith('blob:') && !u.startsWith('data:')) errors.push('ulkoinen pyyntö: ' + u); });

// Yksivärinen 8×6-PNG (väri vaihtelee numeron mukaan) jäljiteltyjä pikkukuvia varten.
function solidPNG(i) {
  const W = 8, H = 6, rgb = [(i * 67) % 256, (i * 131 + 80) % 256, (i * 29 + 160) % 256];
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw.set(rgb, y * (1 + W * 3) + 1 + x * 3);
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Jäljitelty Openverse-rajapinta: haku "virhe" palauttaa 429, muut 30 tulosta (2 sivua).
const ovCalls = [];
await page.route(OV + '**', async route => {
  const u = new URL(route.request().url()); ovCalls.push(u.pathname + u.search);
  const cors = { 'access-control-allow-origin': '*' };
  const m = u.pathname.match(/^\/v1\/images\/([^/]+)\/thumb\/$/);
  if (m) {
    const i = +m[1].slice(1);
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: solidPNG(i) });
  }
  if (u.pathname === '/v1/images/') {
    if (u.searchParams.get('q') === 'virhe') return route.fulfill({ status: 429, headers: cors, body: '{}' });
    const page = +u.searchParams.get('page'), size = +u.searchParams.get('page_size');
    const results = [];
    for (let i = (page - 1) * size; i < Math.min(30, page * size); i++) results.push({
      id: 'k' + i, title: 'Kissa ' + i, creator: 'Kuvaaja ' + i, license: 'by', license_version: '2.0',
      thumbnail: `${OV}v1/images/k${i}/thumb/`, url: `https://kuvat.example/k${i}.jpg`, foreign_landing_url: `https://flickr.example/k${i}`
    });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({ result_count: 30, page_count: 2, page_size: size, page, results }) });
  }
  return route.fulfill({ status: 404, headers: cors, body: '' });
});

// Jäljitellyt Wikipedia- ja Commons-rajapinnat. Haku "virhe" palauttaa 429.
// Wikipedia: "Teemu Pukki" -artikkelin pääkuva (sama tiedosto fi- ja en-wikissä, en-wikissä lisäksi toinen).
// Commons: 25 tulosta (20 + 5).
const wikiCalls = [];
await page.route('https://upload.wikimedia.org/**', route => {
  const i = (route.request().url().match(/(\d+)\.png/) || [, 0])[1];
  return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' }, body: solidPNG(+i + 3) });
});
await page.route(/^https:\/\/(fi|en)\.wikipedia\.org\/w\/api\.php|^https:\/\/commons\.wikimedia\.org\/w\/api\.php/, route => {
  const u = new URL(route.request().url()); const P = u.searchParams; wikiCalls.push(u.host + ' ' + u.search);
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  const json = d => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(d) });
  const ii = (file, n) => [{ thumburl: `https://upload.wikimedia.org/thumb/${n}.png`, url: `https://upload.wikimedia.org/${n}.png`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
    extmetadata: { Artist: { value: `<a href="https://x.example/u${n}">Kuvaaja W${n}</a>` }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }];
  if (P.get('origin') !== '*' || P.get('format') !== 'json') return route.fulfill({ status: 400, headers: cors, body: '{}' });
  if ((P.get('gsrsearch') || '').startsWith('virhe')) return route.fulfill({ status: 429, headers: cors, body: '{}' });
  const ns = u.host.startsWith('fi.') ? 'Tiedosto:' : 'File:';
  if (u.host === 'commons.wikimedia.org') {
    const off = +(P.get('gsroffset') || 0); const pages = [];
    for (let i = off; i < Math.min(25, off + 20); i++) pages.push({ pageid: 100 + i, ns: 6, title: `File:Kuva ${i}.jpg`, index: i - off + 1, imageinfo: ii(`Kuva ${i}.jpg`, 100 + i) });
    return json(off + 20 < 25 ? { continue: { gsroffset: off + 20, continue: 'gsroffset||' }, query: { pages } } : { query: { pages } });
  }
  if (P.get('generator') === 'search') {
    const pages = P.get('gsrsearch') === 'Teemu Pukki' ? [
      { pageid: 1, ns: 0, title: 'Teemu Pukki', index: 1, pageimage: 'Teemu_Pukki_2019.jpg' },
      { pageid: 2, ns: 0, title: 'Norwich City FC', index: 2 },
      ...(u.host.startsWith('en.') ? [{ pageid: 3, ns: 0, title: 'Pukki goal', index: 3, pageimage: 'Pukki_goal.jpg' }] : [])
    ] : [];
    return json(pages.length ? { query: { pages } } : { batchcomplete: true });
  }
  if (P.get('titles')) {
    const pages = P.get('titles').split('|').map((t, k) => { const f = t.replace(/^File:/, '').replace(/_/g, ' '); return { ns: 6, title: ns + f, imageinfo: ii(f, f.startsWith('Teemu') ? 1 : 2) }; });
    return json({ query: { pages } });
  }
  return json({});
});

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

  await step('kuvasetin vaihto pääruudun napista', async () => {
    await page.click('#btnSets'); await page.waitForSelector('.set-item');
    assert.equal(await page.locator('.set-item').count(), 2);
    await page.waitForSelector('.set-item[data-id]:not([data-id=""]) >> text=1 kuvaa');
    await shot('vaihda-setti.png');
    await page.click('.set-item[data-id=""]');
    await page.waitForFunction(() => document.querySelector('#evoName').textContent === 'Tavalliset numerot');
    assert.equal(await page.locator('#evo .face.img').count(), 0);
    await page.click('#btnSets'); await page.click('.set-item >> text=Testisetti');
    await page.waitForFunction(() => document.querySelectorAll('#evo .face.img').length === 1);
    assert.equal(await page.textContent('#evoName'), 'Testisetti');
    // sama nappi myös Asetuksissa
    await page.click('#btnSettings'); await page.click('.modal >> text=Vaihda kuvasettiä');
    await page.click('.modal:last-child .set-item[data-id=""]');
    await page.waitForSelector('.modal .cur-set >> text=Tavalliset numerot');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.modal').count(), 0);
  });

  await step('kuvahaku netistä: monta kerralla ja yksittäinen taso', async () => {
    await page.click('#btnSettings'); await page.waitForSelector('.modal');
    await page.click('text=+ Uusi kuvasetti');
    await page.fill('.modal:last-child input[type=text]', 'Hakusetti');
    await page.click('.modal:last-child >> text=Luo');
    await page.waitForSelector('.lvl');
    // oletuslähde on Wikipedia; virhetilanne näytetään käyttäjälle
    await page.click('text=🔍 Hae kuvia netistä');
    assert.equal(await page.textContent('.search-src button.on'), 'Wikipedia');
    await page.fill('.modal:last-child input[type=search]', 'virhe');
    await page.press('.modal:last-child input[type=search]', 'Enter');
    await page.waitForSelector('.modal:last-child .err:not([hidden]) >> text=Liikaa hakuja');
    // ihmishaku: artikkelin pääkuva ensin (fi ja en, kaksoiskappale pois), sitten Commons; sivutus
    await page.fill('.modal:last-child input[type=search]', 'Teemu Pukki');
    await page.click('.modal:last-child button[type=submit]');
    await page.waitForFunction(() => document.querySelectorAll('.search-grid .hit').length === 22);
    const ids = await page.$$eval('.search-grid .hit', b => b.slice(0, 3).map(x => x.dataset.id));
    assert.deepEqual(ids, ['wm:teemu_pukki_2019.jpg', 'wm:pukki_goal.jpg', 'wm:kuva_0.jpg']);
    await page.click('.modal:last-child >> text=Lisää tuloksia');
    await page.waitForFunction(() => document.querySelectorAll('.search-grid .hit').length === 27);
    assert.ok(await page.locator('.modal:last-child >> text=Lisää tuloksia').isHidden());
    assert.ok(await page.isDisabled('.modal:last-child >> text=Lisää valitut'));
    await page.click('.search-grid .hit[data-id="wm:teemu_pukki_2019.jpg"]');
    await page.click('.search-grid .hit[data-id="wm:kuva_3.jpg"]');
    await page.click('.search-grid .hit[data-id="wm:kuva_24.jpg"]');
    await page.click('.search-grid .hit[data-id="wm:kuva_24.jpg"]'); // poisto valinnasta
    assert.equal(await page.getAttribute('.search-grid .hit[data-id="wm:teemu_pukki_2019.jpg"]', 'data-n'), '1');
    assert.equal(await page.getAttribute('.search-grid .hit[data-id="wm:kuva_3.jpg"]', 'data-n'), '2');
    await page.$eval('.modal:last-child .sheet', el => { el.scrollTop = 0; });
    await shot('kuvahaku.png');
    await page.click('.modal:last-child >> text=Lisää valitut (2)');
    await page.waitForSelector('.lvl[data-v="4"] >> text=Rajaa');
    assert.ok(await page.locator('.lvl[data-v="2"] >> text=Rajaa').isVisible());
    assert.equal(await page.locator('.lvl[data-v="8"] >> text=Rajaa').count(), 0);
    await page.waitForSelector('.sources >> text=Kuvien lähteet (2)');
    // yksittäinen taso: lähteen vaihto Openverseen hakee saman hakusanan uudelleen
    await page.click('.lvl[data-v="16"] >> text=Haku');
    await page.fill('.modal:last-child input[type=search]', 'kissa');
    await page.press('.modal:last-child input[type=search]', 'Enter');
    await page.waitForSelector('.search-grid .hit[data-id="wm:kuva_0.jpg"]');
    await page.click('.search-src button[data-src="openverse"]');
    await page.waitForFunction(() => document.querySelectorAll('.search-grid .hit').length === 20 && !document.querySelector('.search-grid .hit[data-id^="wm:"]'));
    await page.click('.modal:last-child >> text=Lisää tuloksia');
    await page.waitForFunction(() => document.querySelectorAll('.search-grid .hit').length === 30);
    await page.click('.search-grid .hit[data-id="ov:k7"]');
    await page.waitForSelector('.crop-view canvas');
    await page.click('.modal:last-child >> text=Tallenna');
    await page.waitForSelector('.lvl[data-v="16"] >> text=Rajaa');
    await page.click('.sources summary');
    const src = await page.textContent('.sources');
    assert.match(src, /Kuvien lähteet \(3\)/);
    assert.match(src, /2: ”Teemu Pukki” – Kuvaaja W1, CC BY-SA 4\.0 \(Wikipedia\)/);
    assert.match(src, /4: ”Kuva 3” – Kuvaaja W103, CC BY-SA 4\.0 \(Wikimedia Commons\)/);
    assert.match(src, /16: ”Kissa 7” – Kuvaaja 7, CC BY 2\.0 \(Openverse\)/);
    // valittu lähde muistetaan
    assert.equal(await page.evaluate(() => localStorage.getItem('g2048.searchSource')), '"openverse"');
    // uudelleenrajaus säilyttää lähdetiedon, laitteelta vaihdettu kuva poistaa sen
    await page.click('.lvl[data-v="16"] >> text=Rajaa'); await page.click('.modal:last-child >> text=Tallenna');
    await page.waitForSelector('.sources >> text=Kuvien lähteet (3)');
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 50; return c.toDataURL('image/png').split(',')[1]; });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.lvl[data-v="16"] >> text=Laitteelta')]);
    await chooser.setFiles({ name: 'oma.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.click('.modal:last-child >> text=Tallenna');
    await page.waitForSelector('.sources >> text=Kuvien lähteet (2)');
    await shot('lahteet.png');
    assert.ok(ovCalls.some(c => c.includes('q=kissa') && c.includes('page=2')));
    assert.ok(wikiCalls.some(c => c.startsWith('commons.wikimedia.org') && c.includes('gsroffset=20')));
    await page.keyboard.press('Escape');
    // kuvat säilyvät uudelleenlatauksen yli
    await page.reload(); await page.waitForSelector('#tiles .tile');
    await page.waitForFunction(() => document.querySelectorAll('#evo .face.img').length === 3);
  });

  await step('ei konsolivirheitä eikä ulkoisia pyyntöjä', async () => {
    // jäljitellyn 429-vastauksen selain kirjaa itse konsoliin – se on odotettu
    assert.deepEqual(errors.filter(e => !/status of 429/.test(e)), []);
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
