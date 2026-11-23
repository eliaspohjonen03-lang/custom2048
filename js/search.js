// Kuvahaku Openversesta (https://openverse.org): vapaasti lisensoituja kuvia, ei API-avainta.
import { loadImg, downscale } from './cropper.js';

const API = 'https://api.openverse.org/v1/images/';
export const PAGE_SIZE = 20; // anonyymin käytön enimmäiskoko

const LICENSES = { by: 'CC BY', 'by-sa': 'CC BY-SA', 'by-nd': 'CC BY-ND', 'by-nc': 'CC BY-NC', 'by-nc-sa': 'CC BY-NC-SA', 'by-nc-nd': 'CC BY-NC-ND', cc0: 'CC0', pdm: 'Public Domain' };
export function licenseLabel(lic, ver) {
  const l = String(lic || '').toLowerCase();
  const base = LICENSES[l] || (l ? l.toUpperCase() : '');
  return base && ver && l !== 'pdm' && l !== 'cc0' ? `${base} ${ver}` : base;
}

// Muuntaa API:n tuloksen sovelluksen käyttämään muotoon.
export function toItem(r) {
  if (!r || !r.id || !(r.thumbnail || r.url)) return null;
  return {
    id: String(r.id),
    thumb: r.thumbnail || r.url,
    full: r.url || r.thumbnail,
    title: String(r.title || '').slice(0, 120),
    creator: String(r.creator || '').slice(0, 80),
    license: licenseLabel(r.license, r.license_version),
    landing: /^https?:\/\//i.test(r.foreign_landing_url || '') ? r.foreign_landing_url : ''
  };
}

// Palauttaa { items, hasMore }. Heittää virheen suomenkielisellä viestillä.
export async function searchImages(q, page = 1) {
  const u = `${API}?q=${encodeURIComponent(q)}&page=${page}&page_size=${PAGE_SIZE}`;
  let res;
  try { res = await fetch(u, { headers: { Accept: 'application/json' } }); }
  catch (e) { throw new Error(navigator.onLine === false ? 'Haku vaatii verkkoyhteyden.' : 'Hakupalveluun ei saatu yhteyttä. Yritä hetken päästä uudelleen.'); }
  if (res.status === 429) throw new Error('Liikaa hakuja lyhyessä ajassa. Odota hetki ja yritä uudelleen.');
  if (!res.ok) throw new Error('Haku epäonnistui. Yritä hetken päästä uudelleen.');
  let d; try { d = await res.json(); } catch (e) { throw new Error('Haku epäonnistui. Yritä hetken päästä uudelleen.'); }
  const items = (Array.isArray(d.results) ? d.results : []).map(toItem).filter(Boolean);
  const pages = +d.page_count || 0;
  return { items, hasMore: page < pages && items.length > 0 };
}

// Lataa kuvan laitteelle (dataURL) samaan muotoon kuin laitteelta valittu kuva.
// Pikkukuva tulee Openversen omalta palvelimelta, joten se toimii yleensä varmimmin.
export async function itemToOrig(item) {
  for (const src of [item.thumb, item.full]) {
    if (!src) continue;
    try { return downscale(await loadImg(src, true)); } catch (e) { /* kokeillaan seuraavaa */ }
  }
  throw new Error('Kuvaa ei saatu tallennettua. Kokeile toista kuvaa.');
}

// Tallennettava lähdetieto (näytetään Asetusten "Kuvien lähteet" -kohdassa).
export function itemMeta(item) {
  return { title: item.title, creator: item.creator, license: item.license, landing: item.landing, via: 'Openverse' };
}
