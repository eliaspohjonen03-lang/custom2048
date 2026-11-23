// Kuvahaku netistä. Lähteet:
//  - wiki: Wikipedian artikkelien pääkuvat (suomi + englanti) ja Wikimedia Commons. Hyvä ihmisille ja asioille.
//  - openverse: vapaasti lisensoitu kuvapankki (https://openverse.org).
// Kumpikaan ei tarvitse API-avainta. Kaikki kuvat ovat vapaasti käytettäviä.
import { loadImg, downscale } from './cropper.js';

export const SOURCES = [
  { id: 'wiki', label: 'Wikipedia', hint: 'Ihmiset, eläimet, paikat ja asiat' },
  { id: 'openverse', label: 'Openverse', hint: 'Vapaa kuvapankki' }
];
const TIMEOUT = 12000;
const THUMB = 500; // pikkukuvan leveys (px); riittää laattaan ja rajaukseen

/* ---------- Yhteiset apurit ---------- */
async function getJSON(url) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ac ? setTimeout(() => ac.abort(), TIMEOUT) : null;
  let res;
  try { res = await fetch(url, ac ? { signal: ac.signal } : undefined); }
  catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Haku kesti liian kauan. Yritä uudelleen tai vaihda hakulähdettä.');
    throw new Error(navigator.onLine === false ? 'Haku vaatii verkkoyhteyden.' : 'Hakupalveluun ei saatu yhteyttä. Yritä hetken päästä uudelleen.');
  } finally { if (t) clearTimeout(t); }
  if (res.status === 429) throw new Error('Liikaa hakuja lyhyessä ajassa. Odota hetki ja yritä uudelleen.');
  if (!res.ok) throw new Error('Haku epäonnistui. Yritä hetken päästä uudelleen.');
  try { return await res.json(); } catch (e) { throw new Error('Haku epäonnistui. Yritä hetken päästä uudelleen.'); }
}
const httpUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
function stripHtml(s) {
  if (!s) return '';
  try { return new DOMParser().parseFromString(String(s), 'text/html').body.textContent || ''; }
  catch (e) { return String(s).replace(/<[^>]*>/g, ''); }
}

/* ---------- Openverse ---------- */
const OV = 'https://api.openverse.org/v1/images/';
export const PAGE_SIZE = 20; // anonyymin käytön enimmäiskoko
const LICENSES = { by: 'CC BY', 'by-sa': 'CC BY-SA', 'by-nd': 'CC BY-ND', 'by-nc': 'CC BY-NC', 'by-nc-sa': 'CC BY-NC-SA', 'by-nc-nd': 'CC BY-NC-ND', cc0: 'CC0', pdm: 'Public Domain' };
export function licenseLabel(lic, ver) {
  const l = String(lic || '').toLowerCase();
  const base = LICENSES[l] || (l ? l.toUpperCase() : '');
  return base && ver && l !== 'pdm' && l !== 'cc0' ? `${base} ${ver}` : base;
}
export function toItem(r) {
  if (!r || !r.id || !(r.thumbnail || r.url)) return null;
  return {
    id: 'ov:' + r.id, thumb: r.thumbnail || r.url, full: r.url || r.thumbnail,
    title: clip(r.title, 120), creator: clip(r.creator, 80),
    license: licenseLabel(r.license, r.license_version), landing: httpUrl(r.foreign_landing_url), via: 'Openverse'
  };
}
async function searchOpenverse(q, cursor) {
  const page = cursor || 1;
  const d = await getJSON(`${OV}?q=${encodeURIComponent(q)}&page=${page}&page_size=${PAGE_SIZE}`);
  const items = (Array.isArray(d.results) ? d.results : []).map(toItem).filter(Boolean);
  return { items, next: page < (+d.page_count || 0) && items.length ? page + 1 : null };
}

/* ---------- Wikipedia + Wikimedia Commons ---------- */
const WIKIS = ['https://fi.wikipedia.org', 'https://en.wikipedia.org'];
const COMMONS = 'https://commons.wikimedia.org';
const api = (base, params) => `${base}/w/api.php?` + new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params });
const fileKey = name => String(name || '').replace(/^(File|Tiedosto):/i, '').replace(/ /g, '_').toLowerCase();

// Muuntaa imageinfo-tiedon kohteeksi. title = näytettävä nimi, jos tiedossa.
function infoToItem(fileTitle, ii, title, via) {
  if (!ii || !(ii.thumburl || ii.url)) return null;
  const m = ii.extmetadata || {};
  const val = k => (m[k] && m[k].value) || '';
  const name = title || clip(stripHtml(val('ObjectName')), 120) || String(fileTitle || '').replace(/^(File|Tiedosto):/i, '').replace(/\.[a-z0-9]+$/i, '');
  return {
    id: 'wm:' + fileKey(fileTitle), thumb: ii.thumburl || ii.url, full: ii.thumburl || ii.url,
    title: clip(name, 120), creator: clip(stripHtml(val('Artist')), 80), license: clip(stripHtml(val('LicenseShortName')), 40),
    landing: httpUrl(ii.descriptionurl), via
  };
}

// Artikkelien pääkuvat yhdestä Wikipediasta.
async function wikiLeadImages(base, q) {
  const d = await getJSON(api(base, {
    generator: 'search', gsrsearch: q, gsrnamespace: '0', gsrlimit: '8',
    prop: 'pageimages', piprop: 'name', pilicense: 'free'
  }));
  const pages = (d.query && d.query.pages || []).filter(p => p.pageimage).sort((a, b) => (a.index || 0) - (b.index || 0));
  if (!pages.length) return [];
  const files = pages.map(p => 'File:' + p.pageimage);
  const info = await getJSON(api(base, {
    titles: files.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: String(THUMB),
    iiextmetadatafilter: 'Artist|LicenseShortName|ObjectName'
  }));
  const byKey = {};
  (info.query && info.query.pages || []).forEach(p => { if (p.imageinfo && p.imageinfo[0]) byKey[fileKey(p.title)] = p; });
  return pages.map(p => {
    const f = byKey[fileKey(p.pageimage)]; if (!f) return null;
    return infoToItem(f.title, f.imageinfo[0], p.title, base.includes('//fi.') ? 'Wikipedia' : 'Wikipedia (en)');
  }).filter(Boolean);
}

// Kuvahaku Wikimedia Commonsista; offset sivutusta varten.
async function commonsSearch(q, offset) {
  const d = await getJSON(api(COMMONS, {
    generator: 'search', gsrsearch: q + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: '20', gsroffset: String(offset || 0),
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: String(THUMB),
    iiextmetadatafilter: 'Artist|LicenseShortName|ObjectName'
  }));
  const pages = (d.query && d.query.pages || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0));
  const items = pages.map(p => infoToItem(p.title, p.imageinfo && p.imageinfo[0], '', 'Wikimedia Commons')).filter(Boolean);
  const next = d.continue && d.continue.gsroffset != null ? +d.continue.gsroffset : null;
  return { items, next };
}

async function searchWiki(q, cursor) {
  if (cursor) { const r = await commonsSearch(q, cursor); return { items: r.items, next: r.next }; }
  // Ensimmäinen sivu: artikkelien pääkuvat ensin (hyvä ihmisille), sitten Commons. Haut rinnakkain.
  const [fi, en, cm] = await Promise.allSettled([wikiLeadImages(WIKIS[0], q), wikiLeadImages(WIKIS[1], q), commonsSearch(q, 0)]);
  const ok = [fi, en, cm].filter(r => r.status === 'fulfilled');
  if (!ok.length) throw fi.reason || cm.reason;
  const lead = [], a = fi.status === 'fulfilled' ? fi.value : [], b = en.status === 'fulfilled' ? en.value : [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) lead.push(a[i]); if (b[i]) lead.push(b[i]); }
  const c = cm.status === 'fulfilled' ? cm.value : { items: [], next: null };
  return { items: [...lead, ...c.items], next: c.next };
}

/* ---------- Julkinen rajapinta ---------- */
// Palauttaa { items, next }; next = seuraavan sivun kursori tai null. Kaksoiskappaleet poistaa kutsuja (id).
export function searchImages(source, q, cursor = null) {
  return source === 'openverse' ? searchOpenverse(q, cursor) : searchWiki(q, cursor);
}

// Lataa kuvan laitteelle (dataURL) samaan muotoon kuin laitteelta valittu kuva.
export async function itemToOrig(item) {
  for (const src of [item.thumb, item.full]) {
    if (!src) continue;
    try { return downscale(await loadImg(src, true)); } catch (e) { /* kokeillaan seuraavaa */ }
  }
  throw new Error('Kuvaa ei saatu tallennettua. Kokeile toista kuvaa.');
}

// Tallennettava lähdetieto (näytetään Asetusten "Kuvien lähteet" -kohdassa).
export function itemMeta(item) {
  return { title: item.title, creator: item.creator, license: item.license, landing: item.landing, via: item.via || '' };
}
