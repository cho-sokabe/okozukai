// 保存（IndexedDB。設計書 5章・P-03）
const NAME = "okodukaityo";
const VERSION = 1;
export const STORES = ["records", "categories", "subs", "subRuns", "settings", "meta"];

let dbp = null;

export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id" }).createIndex("date", "date");
      if (!db.objectStoreNames.contains("categories")) db.createObjectStore("categories", { keyPath: "id" });
      if (!db.objectStoreNames.contains("subs")) db.createObjectStore("subs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("subRuns")) db.createObjectStore("subRuns", { keyPath: ["subId", "dueDate"] });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error("保存を取り消しました"));
});

/** すべての表を読む */
export async function loadAll() {
  const db = await open();
  const tx = db.transaction(STORES, "readonly");
  const get = s => new Promise((res, rej) => { const r = tx.objectStore(s).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const [records, categories, subs, subRuns, settings, meta] = await Promise.all(STORES.map(get));
  return { records, categories, subs, subRuns, settings, meta: Object.fromEntries(meta.map(m => [m.key, m.value])) };
}

/**
 * まとめて書く。全部書けたときだけ残る（1つのトランザクション。P-03）。
 * ops: [{ store, put: obj } | { store, del: key } | { store, clear: true }]
 */
export async function write(ops) {
  if (!ops.length) return;
  const db = await open();
  const tx = db.transaction([...new Set(ops.map(o => o.store))], "readwrite");
  const finished = done(tx);
  try {
    for (const o of ops) {
      const st = tx.objectStore(o.store);
      if (o.clear) st.clear();
      else if ("del" in o) st.delete(o.del);
      else st.put(o.put);
    }
  } catch (e) {
    try { tx.abort(); } catch { /* すでに終わっている */ }
    await finished.catch(() => {});
    throw e;
  }
  await finished;
}

/** iPhone に「データを消さないで」と頼む（P-03） */
export async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* 頼めなくても動く */ }
}
