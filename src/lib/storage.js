const DB_NAME = 'ifc-planner';
const DB_VERSION = 1;
const STORE = 'ifc-files';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveIfcFile(file) {
  const buf = await file.arrayBuffer();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: 'last', name: file.name, size: file.size, data: buf, savedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSavedIfcFile() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('last');
    req.onsuccess = () => {
      const rec = req.result;
      if (!rec) { resolve(null); return; }
      const file = new File([rec.data], rec.name, { type: 'application/x-step' });
      resolve({ file, savedAt: rec.savedAt });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSavedIfcFile() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('last');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
