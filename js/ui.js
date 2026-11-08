// Modaalit, toast, Tilastot- ja Asetukset-ikkunat sekä päivitysilmoitus.
import { $, h, esc } from './dom.js';
import { SIZES, LEVELS, fmtTime } from './logic.js';
import { st, resetStats } from './stats.js';
import { miniTile } from './render.js';
import {
  P, activeProfile, saveProfiles, setShowValue, loadActiveImages, saveLevelImage, removeLevelImage, getLevel,
  createProfile, deleteProfile, exportJSON, exportFilename, importJSON
} from './profiles.js';
import { openCropper, fileToOrig, urlToOrig } from './cropper.js';

// main.js antaa tämän: { getN(): number, onStatsReset(): void, onFacesChange(): void }
let ctx = { getN: () => 4, onStatsReset() {}, onFacesChange() {} };
export function initUI(c) { ctx = Object.assign(ctx, c); }

/* ---------- Toast ---------- */
let toastT = null;
export function toast(msg, tileV) {
  const t = $('#toast'); t.innerHTML = '';
  if (tileV && P.imgURLs[tileV]) t.appendChild(miniTile(tileV));
  t.appendChild(h('span', null, msg));
  t.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
export function toastTile(v) { toast(v === 2048 ? '🎉 Mahtavaa, saavutit 2048! Peli jatkuu.' : `🎉 Uusi taso: ${v}!`, v); }

/* ---------- Päivitysilmoitus ---------- */
export function showUpdateBar(onUpdate) {
  if (document.querySelector('.update-bar')) return;
  const bar = h('div', 'update-bar'); bar.setAttribute('role', 'status');
  bar.appendChild(h('span', null, 'Uusi versio saatavilla'));
  const b = h('button', null, 'Päivitä');
  b.onclick = () => { b.disabled = true; onUpdate(); };
  bar.appendChild(b); document.body.appendChild(bar);
}

/* ---------- Modaalit ---------- */
export function isModalOpen() { return !!document.querySelector('.modal'); }
export function closeTopModal() { const m = [...document.querySelectorAll('.modal')].pop(); if (m && m._close) m._close(); }
export function openModal(build, narrow) {
  const m = h('div', 'modal'); const s = h('div', 'sheet' + (narrow ? ' narrow' : '')); m.appendChild(s);
  let closed = false;
  const close = () => { if (closed) return; closed = true; m.remove(); if (m._onclose) m._onclose(); };
  m._close = close;
  m.addEventListener('pointerdown', e => { m._downOnBg = e.target === m; });
  m.addEventListener('click', e => { if (e.target === m && m._downOnBg) close(); });
  document.body.appendChild(m);
  build(s, close, m);
  return m;
}
export function head(sheet, title, close) {
  const hd = h('div', 'sheet-head'); hd.appendChild(h('h2', null, title));
  const x = h('button', 'icon-btn'); x.setAttribute('aria-label', 'Sulje');
  x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  x.onclick = close; hd.appendChild(x); sheet.appendChild(hd);
}
export function confirmBox(title, text, okText = 'OK', danger = false) {
  return new Promise(res => {
    let result = false;
    const m = openModal((s, close) => {
      s.appendChild(h('h2', null, title)).style.margin = '0 0 8px';
      if (text) s.appendChild(h('p', 'muted', text)).style.margin = '0 0 16px';
      const row = h('div', 'row'); row.style.justifyContent = 'flex-end';
      const c = h('button', 'btn', 'Peruuta'); c.onclick = close;
      const o = h('button', 'btn ' + (danger ? 'danger' : 'primary'), okText); o.onclick = () => { result = true; close(); };
      row.append(c, o); s.appendChild(row); setTimeout(() => o.focus(), 30);
    }, true);
    m._onclose = () => res(result);
  });
}
export function promptBox(title, value, okText = 'Tallenna') {
  return new Promise(res => {
    let result = null;
    const m = openModal((s, close) => {
      s.appendChild(h('h2', null, title)).style.margin = '0 0 12px';
      const inp = h('input'); inp.type = 'text'; inp.value = value || ''; inp.maxLength = 40; s.appendChild(inp);
      const row = h('div', 'row'); row.style.cssText = 'justify-content:flex-end;margin-top:14px';
      const c = h('button', 'btn', 'Peruuta'); c.onclick = close;
      const o = h('button', 'btn primary', okText);
      const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } result = v; close(); };
      o.onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
      row.append(c, o); s.appendChild(row); setTimeout(() => { inp.focus(); inp.select(); }, 30);
    }, true);
    m._onclose = () => res(result);
  });
}

/* ---------- Tilastot-ikkuna ---------- */
export function openStats() {
  let n = ctx.getN();
  openModal((s, close) => {
    head(s, 'Tilastot', close);
    const seg = h('div', 'seg'); seg.style.marginBottom = '12px';
    const body = h('div', 'section');
    const draw = () => {
      [...seg.children].forEach(b => b.classList.toggle('on', +b.dataset.n === n));
      const S = st(n); const dash = '–';
      const rows = [
        ['Paras pistemäärä', S.best || dash],
        ['Suurin saavutettu laatta', S.bestTile || dash],
        ['Nopein aika 2048:aan', S.fast != null ? fmtTime(S.fast) : dash],
        ['Vähiten siirtoja 2048:aan', S.fewMoves != null ? S.fewMoves : dash],
        ['Vähiten peruutuksia 2048:aan', S.fewUndos ? `${S.fewUndos.u}<small>${S.fewUndos.m} siirtoa · ${fmtTime(S.fewUndos.t)} · ${new Date(S.fewUndos.d).toLocaleDateString('fi-FI')}</small>` : dash],
        ['Pelatut pelit', S.games],
        ['2048 saavutettu', S.wins ? S.wins + ' kertaa' : dash]
      ];
      body.innerHTML = rows.map(([a, b]) => `<div class="stat"><span>${a}</span><b>${b}</b></div>`).join('');
    };
    SIZES.forEach(k => { const b = h('button', null, `${k}×${k}`); b.dataset.n = k; b.onclick = () => { n = k; draw(); }; seg.appendChild(b); });
    s.append(seg, body);
    const reset = h('button', 'btn danger small', 'Nollaa tämän koon tilastot');
    reset.onclick = async () => {
      if (await confirmBox(`Nollataanko ${n}×${n}-tilastot?`, 'Ennätykset poistetaan pysyvästi.', 'Nollaa', true)) {
        resetStats(n); draw(); ctx.onStatsReset();
      }
    };
    s.appendChild(reset);
    draw();
  });
}

/* ---------- Tiedostovalinta ---------- */
function pickFile(input) {
  return new Promise(res => {
    input.value = '';
    input.onchange = () => res([...input.files]);
    input.click();
  });
}

/* ---------- Asetukset-ikkuna ---------- */
export function openSettings() {
  openModal((s, close, m) => {
    const rebuild = () => { s.innerHTML = ''; build(); };
    m._rebuild = rebuild;
    const build = () => {
      head(s, 'Asetukset ja kuvat', close);
      const p = activeProfile();

      // Profiilin valinta
      const sec = h('div', 'section'); sec.appendChild(h('h4', null, 'Kuvasetti'));
      const r1 = h('div', 'row'); const sel = document.createElement('select');
      sel.innerHTML = `<option value="">Tavalliset numerot</option>` + P.profiles.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
      sel.value = P.activeId || '';
      sel.onchange = async () => { P.activeId = sel.value || null; saveProfiles(); await loadActiveImages(); rebuild(); };
      r1.appendChild(sel); sec.appendChild(r1);
      const r2 = h('div', 'row');
      const bNew = h('button', 'btn small', '+ Uusi kuvasetti');
      bNew.onclick = async () => {
        const name = await promptBox('Uuden kuvasetin nimi', '', 'Luo'); if (!name) return;
        await createProfile(name); rebuild();
      };
      r2.appendChild(bNew);
      if (p) {
        const bRen = h('button', 'btn small', 'Nimeä uudelleen');
        bRen.onclick = async () => { const name = await promptBox('Uusi nimi', p.name); if (!name) return; p.name = name; saveProfiles(); ctx.onFacesChange(); rebuild(); };
        const bDel = h('button', 'btn small danger', 'Poista');
        bDel.onclick = async () => {
          if (!await confirmBox(`Poistetaanko "${p.name}"?`, 'Kuvasetti ja sen kuvat poistetaan pysyvästi.', 'Poista', true)) return;
          await deleteProfile(p); rebuild();
        };
        r2.append(bRen, bDel);
      }
      sec.appendChild(r2);
      const r3 = h('div', 'row'); const lab = h('label', 'check'); const cb = h('input'); cb.type = 'checkbox'; cb.checked = P.showValue;
      cb.onchange = () => { setShowValue(cb.checked); ctx.onFacesChange(); };
      lab.append(cb, document.createTextNode('Näytä arvo kuvan kulmassa')); r3.appendChild(lab); sec.appendChild(r3);
      s.appendChild(sec);

      // Kuvat
      const im = h('div', 'section');
      if (!p) {
        im.appendChild(h('h4', null, 'Kuvat'));
        im.appendChild(h('p', 'muted', 'Nyt käytössä ovat tavalliset numerot. Luo uusi kuvasetti (esim. "Perhe" tai "Automerkit"), niin voit lisätä jokaiselle tasolle oman kuvan.')).style.margin = '0';
      } else {
        im.appendChild(h('h4', null, `Kuvat – ${p.name}`));
        const many = h('button', 'btn small', '＋ Lisää monta kuvaa kerralla');
        many.onclick = async () => {
          const files = await pickFile($('#fileMany'));
          if (!files.length) return;
          const empty = LEVELS.filter(v => !P.imgURLs[v]);
          let k = 0;
          for (const f of files) {
            if (k >= empty.length) break;
            try { const o = await fileToOrig(f); await saveLevelImage(p.id, empty[k], o); k++; } catch (e) {}
          }
          await loadActiveImages(); rebuild();
          toast(k ? `Lisättiin ${k} kuvaa tyhjille tasoille.` : 'Ei vapaita tasoja tai kuvia ei voitu lukea.');
        };
        const info = h('p', 'muted', 'Kuvat täyttävät tyhjät tasot pienimmästä alkaen. Napauta kuvaa rajataksesi sen. Tasoille, joilla ei ole kuvaa, näytetään numero.');
        im.append(many, info);
        const list = h('div'); list.style.marginTop = '8px';
        for (const v of LEVELS) {
          const row = h('div', 'lvl'); row.dataset.v = v;
          const sq = miniTile(v, false); row.appendChild(sq);
          row.appendChild(h('div', 'num', v));
          const btns = h('div', 'btns');
          const bDev = h('button', 'btn small', 'Laitteelta');
          const bUrl = h('button', 'btn small', 'Linkki');
          btns.append(bDev, bUrl); row.appendChild(btns);
          const doCrop = async () => {
            const { orig, rec } = await getLevel(p.id, v);
            const src = orig || (rec && rec.data); if (!src) return;
            const cr = await openCropper(src, orig && rec ? rec.crop : null, v); if (!cr) return;
            await saveLevelImage(p.id, v, src, cr); await loadActiveImages(); rebuild();
          };
          if (P.imgURLs[v]) {
            const bCrop = h('button', 'btn small', 'Rajaa'); bCrop.onclick = doCrop;
            const bRm = h('button', 'btn small danger', '✕'); bRm.setAttribute('aria-label', 'Poista kuva');
            bRm.onclick = async () => { await removeLevelImage(p.id, v); await loadActiveImages(); rebuild(); };
            btns.append(bCrop, bRm); sq.onclick = doCrop;
          } else {
            sq.onclick = () => bDev.click();
          }
          const afterOrig = async orig => {
            const cr = await openCropper(orig, null, v); if (!cr) return;
            await saveLevelImage(p.id, v, orig, cr); await loadActiveImages(); rebuild();
          };
          bDev.onclick = async () => {
            const [f] = await pickFile($('#fileOne')); if (!f) return;
            try { await afterOrig(await fileToOrig(f)); } catch (e) { toast('Kuvaa ei voitu lukea.'); }
          };
          bUrl.onclick = () => openUrlDialog(v, afterOrig);
          list.appendChild(row);
        }
        im.appendChild(list);
      }
      s.appendChild(im);

      // Varmuuskopio
      const bk = h('div', 'section'); bk.appendChild(h('h4', null, 'Jaa ja varmuuskopioi'));
      bk.appendChild(h('p', 'muted', 'Kuvat tallentuvat vain tälle laitteelle. Vie kuvasetti tiedostoksi tai tekstiksi, niin voit siirtää sen toiselle laitteelle tai kaverille.')).style.margin = '0 0 10px';
      const br = h('div', 'row');
      if (p) { const be = h('button', 'btn small', 'Vie kuvasetti'); be.onclick = () => openExport(p); br.appendChild(be); }
      const bi = h('button', 'btn small', 'Tuo kuvasetti'); bi.onclick = () => openImport(rebuild); br.appendChild(bi);
      bk.appendChild(br); s.appendChild(bk);
    };
    build();
  });
}

function openUrlDialog(v, afterOrig) {
  openModal((s, close) => {
    head(s, `Kuva linkistä – taso ${v}`, close);
    const inp = h('input'); inp.type = 'url'; inp.placeholder = 'https://…/kuva.jpg'; s.appendChild(inp);
    const err = h('p', 'err'); err.hidden = true; s.appendChild(err);
    s.appendChild(h('p', 'muted', 'Liitä suora linkki kuvaan (päättyy usein .jpg tai .png). Jos linkki ei toimi, tallenna kuva laitteelle ja käytä "Laitteelta"-nappia.'));
    const row = h('div', 'row'); row.style.cssText = 'justify-content:flex-end;margin-top:12px';
    const c = h('button', 'btn', 'Peruuta'); c.onclick = close;
    const ok = h('button', 'btn primary', 'Hae kuva');
    ok.onclick = async () => {
      const u = inp.value.trim(); if (!/^https?:\/\//i.test(u)) { err.textContent = 'Linkin pitää alkaa https://'; err.hidden = false; return; }
      ok.disabled = true; ok.textContent = 'Haetaan…'; err.hidden = true;
      try { const orig = await urlToOrig(u); close(); afterOrig(orig); }
      catch (e) { err.textContent = e.message; err.hidden = false; ok.disabled = false; ok.textContent = 'Hae kuva'; }
    };
    inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
    row.append(c, ok); s.appendChild(row); setTimeout(() => inp.focus(), 30);
  }, true);
}

async function openExport(p) {
  const { json, count } = await exportJSON(p);
  openModal((s, close) => {
    head(s, 'Vie kuvasetti', close);
    s.appendChild(h('p', 'muted', `"${p.name}" – ${count} kuvaa. Lataa tiedosto tai kopioi teksti ja lähetä se esim. viestillä.`)).style.margin = '0 0 12px';
    const row = h('div', 'row');
    const dl = h('button', 'btn primary', 'Lataa tiedosto');
    dl.onclick = () => {
      try {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = exportFilename(p); document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (e) { toast('Lataus ei onnistunut – käytä kopiointia.'); }
    };
    const cp = h('button', 'btn', 'Kopioi tekstinä');
    cp.onclick = async () => { try { await navigator.clipboard.writeText(json); toast('Kopioitu leikepöydälle!'); } catch (e) { toast('Kopiointi ei onnistunut tässä selaimessa.'); } };
    row.append(dl, cp); s.appendChild(row);
  }, true);
}

function openImport(after) {
  openModal((s, close) => {
    head(s, 'Tuo kuvasetti', close);
    const err = h('p', 'err'); err.hidden = true;
    const bf = h('button', 'btn', 'Valitse tiedosto…');
    const ta = h('textarea'); ta.placeholder = '…tai liitä kopioitu teksti tähän';
    const ok = h('button', 'btn primary', 'Tuo teksti');
    const doImport = async txt => {
      try {
        const name = await importJSON(txt);
        close(); after && after(); toast(`Kuvasetti "${name}" tuotu.`);
      } catch (e) { err.textContent = 'Tiedosto tai teksti ei ole kelvollinen kuvasetti.'; err.hidden = false; }
    };
    bf.onclick = async () => { const [f] = await pickFile($('#fileImport')); if (f) doImport(await f.text()); };
    ok.onclick = () => doImport(ta.value.trim());
    s.append(bf, h('div')); s.lastChild.style.height = '10px';
    s.append(ta, err);
    const row = h('div', 'row'); row.style.cssText = 'justify-content:flex-end;margin-top:10px'; row.appendChild(ok); s.appendChild(row);
  }, true);
}
