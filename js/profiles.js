// Kuvasetit (profiilit), niiden kuvat sekä vienti ja tuonti.
import { store, imgDB } from './storage.js';
import { LEVELS } from './logic.js';
import { loadImg, clampCrop, renderTileData } from './cropper.js';

// Jaettu tila. Objektin kentät ovat muokattavissa muista moduuleista.
export const P = {
  profiles: [],
  activeId: null,
  showValue: true,
  imgURLs: {} // arvo -> blob-URL
};
{
  const list = store.get('profiles', []);
  P.profiles = Array.isArray(list) ? list.filter(x => x && typeof x.id === 'string') : [];
  P.activeId = store.get('active', null);
  P.showValue = store.get('showValue', true) !== false;
  if (P.activeId && !P.profiles.find(p => p.id === P.activeId)) P.activeId = null;
}

const listeners = [];
export function onImagesChange(fn) { listeners.push(fn); }

export function activeProfile() { return P.profiles.find(p => p.id === P.activeId) || null; }
export function saveProfiles() { store.set('profiles', P.profiles); store.set('active', P.activeId); }
export function setShowValue(v) { P.showValue = v; store.set('showValue', v); }
export function newProfileId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function dataURLtoBlob(d) {
  const [head, b64] = d.split(',');
  const mime = (head.match(/:(.*?);/) || [, 'image/jpeg'])[1];
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function loadActiveImages() {
  const old = P.imgURLs; const next = {};
  if (P.activeId) {
    const pid = P.activeId;
    const recs = await Promise.all(LEVELS.map(v => imgDB.get(pid + ':' + v).catch(() => null)));
    if (pid !== P.activeId) return; // vaihdettiin kesken
    recs.forEach((r, i) => { if (r && r.data) { try { next[LEVELS[i]] = URL.createObjectURL(dataURLtoBlob(r.data)); } catch (e) {} } });
  }
  P.imgURLs = next;
  Object.values(old).forEach(u => URL.revokeObjectURL(u));
  listeners.forEach(fn => { try { fn(); } catch (e) {} });
}

export async function saveLevelImage(pid, v, orig, cr) {
  const im = await loadImg(orig);
  cr = clampCrop(im, cr || { rot: 0, zoom: 1, x: 0, y: 0 });
  const data = renderTileData(im, cr);
  await imgDB.put(pid + ':' + v + ':o', orig);
  await imgDB.put(pid + ':' + v, { data, crop: cr });
}
export async function removeLevelImage(pid, v) {
  await imgDB.del(pid + ':' + v); await imgDB.del(pid + ':' + v + ':o');
}
// Vaihtaa kahden tason kuvat keskenään (myös tyhjän tason kanssa).
export async function swapLevels(pid, a, b) {
  if (a === b) return;
  const keys = v => [pid + ':' + v, pid + ':' + v + ':o'];
  const [ka, kb] = [keys(a), keys(b)];
  const va = await Promise.all(ka.map(k => imgDB.get(k)));
  const vb = await Promise.all(kb.map(k => imgDB.get(k)));
  const write = (k, val) => val == null ? imgDB.del(k) : imgDB.put(k, val);
  for (let i = 0; i < 2; i++) { await write(ka[i], vb[i]); await write(kb[i], va[i]); }
}
// Kääntää kuvien järjestyksen niiden tasojen kesken, joilla on kuva.
export async function reverseLevels(pid, levels) {
  for (let i = 0, j = levels.length - 1; i < j; i++, j--) await swapLevels(pid, levels[i], levels[j]);
}
export async function getLevel(pid, v) {
  return { orig: await imgDB.get(pid + ':' + v + ':o'), rec: await imgDB.get(pid + ':' + v) };
}

export async function createProfile(name) {
  const id = newProfileId();
  P.profiles.push({ id, name }); P.activeId = id; saveProfiles(); await loadActiveImages();
  return id;
}
export async function deleteProfile(p) {
  await Promise.all(LEVELS.flatMap(v => [imgDB.del(p.id + ':' + v), imgDB.del(p.id + ':' + v + ':o')]));
  P.profiles = P.profiles.filter(x => x.id !== p.id); P.activeId = null; saveProfiles(); await loadActiveImages();
}

// Vienti: {app:"2048-kuvasetti", version:1, name, images:{"2":"data:image/jpeg;base64,…", …}}
export async function exportJSON(p) {
  const images = {};
  for (const v of LEVELS) { const r = await imgDB.get(p.id + ':' + v); if (r && r.data) images[v] = r.data; }
  return { json: JSON.stringify({ app: '2048-kuvasetti', version: 1, name: p.name, images }), count: Object.keys(images).length };
}
export function exportFilename(p) { return (p.name.replace(/[^\wåäöÅÄÖ\- ]+/g, '').trim() || 'kuvasetti') + '.2048.json'; }

// Tuonti. Heittää virheen, jos teksti ei ole kelvollinen kuvasetti. Palauttaa setin nimen.
export async function importJSON(txt) {
  const d = JSON.parse(txt);
  if (!d || d.app !== '2048-kuvasetti' || typeof d.images !== 'object' || !d.images) throw new Error('invalid');
  let name = String(d.name || 'Tuotu').slice(0, 40); const base = name; let k = 2;
  while (P.profiles.some(x => x.name === name)) name = `${base} (${k++})`;
  const id = newProfileId();
  for (const v of LEVELS) {
    const data = d.images[v];
    if (typeof data === 'string' && /^data:image\//.test(data)) await saveLevelImage(id, v, data, null);
  }
  P.profiles.push({ id, name }); P.activeId = id; saveProfiles(); await loadActiveImages();
  return name;
}
