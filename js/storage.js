// localStorage- ja IndexedDB-apurit. Kaikki kutsut on kääritty try/catchiin.

const KEY = 'g2048.';

export const store = {
  get(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(KEY + k); } catch (e) {} }
};

// Kuvat IndexedDB:hen (paljon enemmän tilaa kuin localStorage). Varalla muisti.
export const imgDB = (() => {
  const mem = new Map(); let dbp = null; let broken = false;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('g2048-kuvat', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('img');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function run(mode, fn) {
    if (broken) throw new Error('no idb');
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('img', mode); const req = fn(t.objectStore('img'));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  async function safe(mode, fn, memFn) {
    try { return await run(mode, fn); } catch (e) { broken = true; return memFn(); }
  }
  return {
    get: k => safe('readonly', s => s.get(k), () => mem.get(k)),
    put: (k, v) => safe('readwrite', s => s.put(v, k), () => { mem.set(k, v); }),
    del: k => safe('readwrite', s => s.delete(k), () => { mem.delete(k); })
  };
})();

// Pyydetään pysyvää tallennustilaa, jotta selain ei poista kuvia.
export function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
}
