// Modaalit, toast, Tilastot- ja Asetukset-ikkunat sekä päivitysilmoitus.
import { $, h, esc } from './dom.js';
import { SIZES, LEVELS, fmtTime } from './logic.js';
import { st, resetStats } from './stats.js';
import { miniTile } from './render.js';
import {
  P, activeProfile, saveProfiles, setShowValue, loadActiveImages, saveLevelImage, removeLevelImage, getLevel, swapLevels, reverseLevels,
  createProfile, deleteProfile, profilePreview, exportJSON, exportFilename, importJSON, levelSources
} from './profiles.js';
import { openCropper, fileToOrig, urlToOrig } from './cropper.js';
import { SOURCES, searchImages, itemToOrig, itemMeta } from './search.js';
import { store } from './storage.js';

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
      const r1 = h('div', 'row');
      r1.appendChild(h('div', 'cur-set', p ? p.name : 'Tavalliset numerot'));
      const bPick = h('button', 'btn small primary', 'Vaihda kuvasettiä');
      bPick.onclick = () => openSetPicker({ afterChange: rebuild, inSettings: true });
      r1.appendChild(bPick); sec.appendChild(r1);
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
            try { const o = await fileToOrig(f); await saveLevelImage(p.id, empty[k], o, null, null); k++; } catch (e) {}
          }
          await loadActiveImages(); rebuild();
          toast(k ? `Lisättiin ${k} kuvaa tyhjille tasoille.` : 'Ei vapaita tasoja tai kuvia ei voitu lukea.');
        };
        const web = h('button', 'btn small', '🔍 Hae kuvia netistä');
        web.onclick = async () => {
          const empty = LEVELS.filter(v => !P.imgURLs[v]);
          if (!empty.length) { toast('Kaikilla tasoilla on jo kuva.'); return; }
          const picked = await openImageSearch({ max: empty.length });
          if (!picked.length) return;
          let k = 0;
          for (const it of picked) {
            try { const o = await itemToOrig(it); await saveLevelImage(p.id, empty[k], o, null, itemMeta(it)); k++; } catch (e) {}
          }
          await loadActiveImages(); rebuild();
          const fail = picked.length - k;
          toast(k ? `Lisättiin ${k} kuvaa tyhjille tasoille.${fail ? ` ${fail} kuvaa ei saatu tallennettua.` : ''}` : 'Kuvia ei saatu tallennettua. Kokeile toisia kuvia.');
        };
        const filled = LEVELS.filter(v => P.imgURLs[v]);
        const topRow = h('div', 'row'); topRow.append(many, web);
        if (filled.length > 1) {
          const rev = h('button', 'btn small', '⇅ Käännä järjestys');
          rev.onclick = async () => { await reverseLevels(p.id, filled); await loadActiveImages(); rebuild(); };
          topRow.appendChild(rev);
        }
        const info = h('p', 'muted', 'Kuvat täyttävät tyhjät tasot pienimmästä alkaen. Muuta järjestystä ▲▼-nuolilla: pienin taso (2) tulee ensin, joten laita sinne esim. pienin kala ja isommille tasoille isommat. Napauta kuvaa rajataksesi sen. Tasoille, joilla ei ole kuvaa, näytetään numero.');
        im.append(topRow, info);
        const list = h('div'); list.style.marginTop = '8px';
        const move = async (from, to) => {
          await swapLevels(p.id, from, to); await loadActiveImages();
          const y = s.scrollTop; rebuild(); s.scrollTop = y;
          const btn = s.querySelector(`.lvl[data-v="${to}"] .mv-${to > from ? 'down' : 'up'}`);
          if (btn && !btn.disabled) btn.focus({ preventScroll: true });
        };
        LEVELS.forEach((v, i) => {
          const row = h('div', 'lvl'); row.dataset.v = v;
          const mv = h('div', 'mv');
          const up = h('button', 'mv-up', '▲'); up.setAttribute('aria-label', `Siirrä kuva tasolta ${v} pienemmälle tasolle`);
          const dn = h('button', 'mv-down', '▼'); dn.setAttribute('aria-label', `Siirrä kuva tasolta ${v} isommalle tasolle`);
          const has = !!P.imgURLs[v];
          up.disabled = !has || i === 0; dn.disabled = !has || i === LEVELS.length - 1;
          up.onclick = () => move(v, LEVELS[i - 1]); dn.onclick = () => move(v, LEVELS[i + 1]);
          mv.append(up, dn); row.appendChild(mv);
          const sq = miniTile(v, false); row.appendChild(sq);
          row.appendChild(h('div', 'num', v));
          const btns = h('div', 'btns');
          const bDev = h('button', 'btn small', 'Laitteelta');
          const bWeb = h('button', 'btn small', 'Haku');
          const bUrl = h('button', 'btn small', 'Linkki');
          btns.append(bDev, bWeb, bUrl); row.appendChild(btns);
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
          const afterOrig = async (orig, meta = null) => {
            const cr = await openCropper(orig, null, v); if (!cr) return;
            await saveLevelImage(p.id, v, orig, cr, meta); await loadActiveImages(); rebuild();
          };
          bWeb.onclick = async () => {
            const [it] = await openImageSearch({ max: 1, level: v }); if (!it) return;
            let orig; try { orig = await itemToOrig(it); } catch (e) { toast(e.message); return; }
            await afterOrig(orig, itemMeta(it));
          };
          bDev.onclick = async () => {
            const [f] = await pickFile($('#fileOne')); if (!f) return;
            try { await afterOrig(await fileToOrig(f)); } catch (e) { toast('Kuvaa ei voitu lukea.'); }
          };
          bUrl.onclick = () => openUrlDialog(v, afterOrig);
          list.appendChild(row);
        });
        im.appendChild(list);
        const srcBox = h('details', 'sources'); srcBox.hidden = true;
        im.appendChild(srcBox);
        levelSources(p.id).then(list => {
          if (!list.length) return;
          srcBox.hidden = false;
          srcBox.appendChild(h('summary', null, `Kuvien lähteet (${list.length})`));
          const ul = h('ul');
          list.forEach(({ v, meta }) => {
            const li = h('li'); li.appendChild(h('b', null, v + ': '));
            const t = meta.title ? `”${meta.title}”` : 'Kuva';
            if (meta.landing) { const a = h('a', null, t); a.href = meta.landing; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.appendChild(a); }
            else li.appendChild(document.createTextNode(t));
            const rest = [meta.creator, meta.license].filter(Boolean).join(', ');
            li.appendChild(document.createTextNode((rest ? ' – ' + rest : '') + (meta.via ? ` (${meta.via})` : '')));
            ul.appendChild(li);
          });
          srcBox.appendChild(ul);
        });
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

/* ---------- Kuvasetin valinta ---------- */
// opts: { afterChange(): void, inSettings: boolean }
export function openSetPicker(opts = {}) {
  openModal((s, close) => {
    head(s, 'Vaihda kuvasettiä', close);
    const list = h('div', 'set-list');
    const choose = async id => {
      P.activeId = id; saveProfiles(); close();
      await loadActiveImages();
      if (opts.afterChange) opts.afterChange();
      const p = activeProfile(); toast(`Käytössä: ${p ? p.name : 'Tavalliset numerot'}`);
    };
    const item = (id, name) => {
      const b = h('button', 'set-item' + ((P.activeId || null) === id ? ' on' : ''));
      b.dataset.id = id || '';
      const th = h('div', 'thumbs'); const txt = h('div', 'txt');
      txt.appendChild(h('b', null, name)); const sub = h('small', null, id ? '…' : 'Numerot 2, 4, 8, …');
      txt.appendChild(sub);
      if (!id) [2, 4, 8].forEach(v => { const t = h('div', 'th num', v); th.appendChild(t); });
      else profilePreview(id).then(({ count, thumbs }) => {
        sub.textContent = count ? `${count} kuvaa` : 'Ei vielä kuvia';
        thumbs.forEach(d => { const t = h('div', 'th'); t.style.backgroundImage = `url("${d}")`; th.appendChild(t); });
      });
      const mark = h('span', 'mark', (P.activeId || null) === id ? '✓' : '');
      b.append(th, txt, mark);
      b.onclick = () => { if ((P.activeId || null) === id) close(); else choose(id); };
      list.appendChild(b);
    };
    item(null, 'Tavalliset numerot');
    P.profiles.forEach(p => item(p.id, p.name));
    s.appendChild(list);
    const bNew = h('button', 'btn', '+ Uusi kuvasetti'); bNew.style.marginTop = '12px';
    bNew.onclick = async () => {
      const name = await promptBox('Uuden kuvasetin nimi', '', 'Luo'); if (!name) return;
      close(); await createProfile(name);
      if (opts.inSettings) opts.afterChange && opts.afterChange(); else openSettings();
    };
    s.appendChild(bNew);
  }, true);
}

/* ---------- Kuvahaku netistä ---------- */
// opts: { max: number, level?: number }. Palauttaa valitut tulokset valintajärjestyksessä (tai []).
// max = 1: napautus valitsee heti. Muuten valitaan monta ja painetaan "Lisää valitut".
export function openImageSearch(opts = {}) {
  const max = Math.max(1, opts.max || 1); const single = max === 1;
  return new Promise(res => {
    let result = [];
    const m = openModal((s, close) => {
      head(s, opts.level ? `Hae kuva – taso ${opts.level}` : 'Hae kuvia netistä', close);
      const form = h('form', 'search-form');
      const inp = h('input'); inp.type = 'search'; inp.placeholder = 'Esim. kissa, auto, kala…'; inp.maxLength = 100;
      inp.setAttribute('aria-label', 'Hakusana'); inp.enterKeyHint = 'search';
      const go = h('button', 'btn primary', 'Hae'); go.type = 'submit';
      form.append(inp, go); s.appendChild(form);
      let source = SOURCES.some(x => x.id === store.get('searchSource')) ? store.get('searchSource') : SOURCES[0].id;
      const seg = h('div', 'seg search-src'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Hakulähde');
      SOURCES.forEach(x => {
        const b = h('button', null, x.label); b.type = 'button'; b.dataset.src = x.id; b.title = x.hint;
        b.onclick = () => { if (source === x.id) return; source = x.id; store.set('searchSource', source); drawSeg(); if (q) { page = 0; load(); } };
        seg.appendChild(b);
      });
      const srcHint = h('span', 'muted');
      const drawSeg = () => {
        [...seg.children].forEach(b => b.classList.toggle('on', b.dataset.src === source));
        srcHint.textContent = SOURCES.find(x => x.id === source).hint;
      };
      const srcRow = h('div', 'row'); srcRow.style.marginTop = '10px'; srcRow.append(seg, srcHint); s.appendChild(srcRow);
      s.appendChild(h('p', 'muted', single
        ? 'Napauta kuvaa valitaksesi sen. Kuvat ovat vapaasti käytettäviä, ja valittu kuva tallentuu tälle laitteelle.'
        : `Valitse enintään ${max} kuvaa. Ne lisätään tyhjille tasoille valintajärjestyksessä, pienimmästä tasosta alkaen. Kuvat ovat vapaasti käytettäviä ja tallentuvat tälle laitteelle.`));
      const err = h('p', 'err'); err.hidden = true; s.appendChild(err);
      const grid = h('div', 'search-grid'); s.appendChild(grid);
      const more = h('button', 'btn small', 'Lisää tuloksia'); more.hidden = true; more.style.cssText = 'display:block;margin:10px auto 0';
      s.appendChild(more);
      const foot = h('div', 'row search-foot'); foot.hidden = single;
      const cnt = h('span', 'muted'); cnt.style.flex = '1';
      const ok = h('button', 'btn primary', 'Lisää valitut'); ok.disabled = true;
      foot.append(cnt, ok); s.appendChild(foot);

      let q = '', page = 0, cursor = null, busy = false, gen = 0; const sel = [];
      const upd = () => {
        cnt.textContent = `Valittu ${sel.length}/${max}`;
        ok.disabled = !sel.length; ok.textContent = sel.length ? `Lisää valitut (${sel.length})` : 'Lisää valitut';
        grid.querySelectorAll('.hit').forEach(b => {
          const i = sel.findIndex(x => x.id === b.dataset.id);
          b.classList.toggle('on', i >= 0); b.dataset.n = i >= 0 ? i + 1 : '';
          b.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
        });
      };
      const add = items => items.forEach(it => {
        if (grid.querySelector(`.hit[data-id="${CSS.escape(it.id)}"]`)) return;
        const b = h('button', 'hit'); b.type = 'button'; b.dataset.id = it.id;
        b.setAttribute('aria-label', (it.title || 'Kuva') + (it.creator ? ' – ' + it.creator : ''));
        const img = h('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
        img.onerror = () => b.remove(); img.src = it.thumb; b.appendChild(img);
        b.onclick = () => {
          if (single) { result = [it]; close(); return; }
          const i = sel.findIndex(x => x.id === it.id);
          if (i >= 0) sel.splice(i, 1);
          else if (sel.length < max) sel.push(it);
          else { toast(`Voit valita enintään ${max} kuvaa.`); return; }
          upd();
        };
        grid.appendChild(b);
      });
      // page = ladattujen sivujen määrä (0 = uusi haku). gen estää vanhan haun tulosten sekoittumisen uuteen.
      const load = async () => {
        if (!q || (busy && page)) return;
        const my = ++gen; busy = true; err.hidden = true;
        more.disabled = true; more.textContent = 'Haetaan…';
        if (!page) { grid.innerHTML = '<p class="muted search-msg">Haetaan…</p>'; more.hidden = true; cursor = null; }
        try {
          const r = await searchImages(source, q, page ? cursor : null);
          if (my !== gen) return;
          if (!page) grid.innerHTML = '';
          page++; cursor = r.next; add(r.items); upd();
          if (!grid.querySelector('.hit')) grid.innerHTML = '<p class="muted search-msg">Ei tuloksia. Kokeile toista hakusanaa' + (source === 'openverse' ? ', englanniksi tai Wikipedia-lähdettä.' : ' tai Openverse-lähdettä.') + '</p>';
          more.hidden = r.next == null;
        } catch (e) {
          if (my !== gen) return;
          if (!page) grid.innerHTML = '';
          err.textContent = e.message; err.hidden = false;
        } finally { if (my === gen) { busy = false; more.disabled = false; more.textContent = 'Lisää tuloksia'; } }
      };
      form.onsubmit = e => {
        e.preventDefault(); const v = inp.value.trim(); if (!v) { inp.focus(); return; }
        inp.blur(); q = v; page = 0; load();
      };
      more.onclick = load;
      ok.onclick = () => { result = sel.slice(); close(); };
      drawSeg(); upd(); setTimeout(() => inp.focus(), 30);
    });
    m._onclose = () => res(result);
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
