// Kuvan lataus, pienennys ja rajausikkuna.
import { h } from './dom.js';
import { openModal, head, toast } from './ui.js';

export function loadImg(src, cors) {
  return new Promise((res, rej) => {
    const im = new Image(); if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => rej(new Error('load')); im.src = src;
  });
}
// Pienentää alkuperäisen kuvan rajausta varten (max 1200 px) ja palauttaa dataURL:n.
export function downscale(im, max = 1200) {
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.max(1, Math.round(im.naturalWidth * k)), hh = Math.max(1, Math.round(im.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh); x.drawImage(im, 0, 0, w, hh);
  return c.toDataURL('image/jpeg', .9); // heittää virheen, jos kuva on "tainted"
}
export async function fileToOrig(file) {
  const u = URL.createObjectURL(file);
  try { const im = await loadImg(u); return downscale(im); } finally { URL.revokeObjectURL(u); }
}
export async function urlToOrig(url) {
  let im;
  try { im = await loadImg(url, true); } catch (e) { throw new Error('Kuvaa ei saatu ladattua linkistä. Tarkista, että linkki osoittaa suoraan kuvatiedostoon.'); }
  try { return downscale(im); } catch (e) { throw new Error('Sivusto ei salli kuvan käyttöä toisella sivulla. Tallenna kuva laitteellesi ja valitse se "Laitteelta"-napilla.'); }
}
function cropDims(im, rot) { return rot % 2 ? [im.naturalHeight, im.naturalWidth] : [im.naturalWidth, im.naturalHeight]; }
export function clampCrop(im, cr) {
  const [W, H] = cropDims(im, cr.rot);
  cr.zoom = Math.min(6, Math.max(1, cr.zoom));
  const s = cr.zoom / Math.min(W, H); // suhteessa näkymän kokoon 1
  const mx = (W * s - 1) / 2, my = (H * s - 1) / 2;
  cr.x = Math.min(mx, Math.max(-mx, cr.x)); cr.y = Math.min(my, Math.max(-my, cr.y));
  return cr;
}
function drawCrop(ctx, size, im, cr) {
  const [W, H] = cropDims(im, cr.rot);
  const s = size * cr.zoom / Math.min(W, H);
  ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2 + cr.x * size, size / 2 + cr.y * size); ctx.rotate(cr.rot * Math.PI / 2);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, -im.naturalWidth * s / 2, -im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
  ctx.restore();
}
export function renderTileData(im, cr) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  drawCrop(c.getContext('2d'), 256, im, cr); return c.toDataURL('image/jpeg', .86);
}

// Rajausikkuna: palauttaa rajausasetukset {rot, zoom, x, y} tai null.
export function openCropper(orig, init, v) {
  return new Promise(async res => {
    let im; try { im = await loadImg(orig); } catch (e) { toast('Kuvan avaus epäonnistui'); return res(null); }
    let cr = clampCrop(im, Object.assign({ rot: 0, zoom: 1, x: 0, y: 0 }, init || {}));
    let result = null;
    const m = openModal((s, close) => {
      head(s, `Rajaa kuva – taso ${v}`, close);
      const view = h('div', 'crop-view'); const cv = document.createElement('canvas'); view.appendChild(cv); s.appendChild(view);
      s.appendChild(h('p', 'muted', 'Siirrä kuvaa vetämällä. Zoomaa liukusäätimellä tai kahdella sormella.')).style.textAlign = 'center';
      const zr = h('input'); zr.type = 'range'; zr.min = 1; zr.max = 6; zr.step = .01; zr.value = cr.zoom; s.appendChild(zr);
      const row = h('div', 'row'); row.style.cssText = 'margin-top:12px;justify-content:space-between';
      const rot = h('button', 'btn', '⟳ Kierrä');
      const right = h('div', 'row'); const c = h('button', 'btn', 'Peruuta'); const ok = h('button', 'btn primary', 'Tallenna');
      right.append(c, ok); row.append(rot, right); s.appendChild(row);
      let V = 300;
      const draw = () => {
        const dpr = window.devicePixelRatio || 1; V = view.clientWidth || 300;
        const px = Math.round(V * dpr); if (cv.width !== px) { cv.width = cv.height = px; }
        drawCrop(cv.getContext('2d'), px, im, cr);
      };
      requestAnimationFrame(draw);
      zr.oninput = () => { cr.zoom = +zr.value; clampCrop(im, cr); draw(); };
      rot.onclick = () => { cr.rot = (cr.rot + 1) % 4; cr.x = cr.y = 0; clampCrop(im, cr); draw(); };
      c.onclick = close; ok.onclick = () => { result = cr; close(); };
      const pts = new Map(); let last = null;
      const pinch = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      view.addEventListener('pointerdown', e => { view.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = pts.size === 2 ? { d: pinch(), z: cr.zoom } : null; });
      view.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        const p = pts.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (pts.size === 1) { cr.x += dx / V; cr.y += dy / V; }
        else if (pts.size === 2 && last) { cr.zoom = last.z * pinch() / last.d; zr.value = cr.zoom; }
        clampCrop(im, cr); draw();
      });
      const up = e => { pts.delete(e.pointerId); last = pts.size === 2 ? { d: pinch(), z: cr.zoom } : null; };
      view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
      view.addEventListener('wheel', e => { e.preventDefault(); cr.zoom *= Math.exp(-e.deltaY * .0015); clampCrop(im, cr); zr.value = cr.zoom; draw(); }, { passive: false });
    }, true);
    m._onclose = () => res(result);
  });
}
