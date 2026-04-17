const DB_NAME = 'ifc-planner';
const DB_VERSION = 2;
const STORE_FILES = 'ifc-files';
const STORE_WALLS = 'parsed-walls';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_WALLS)) {
        db.createObjectStore(STORE_WALLS, { keyPath: 'id' });
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
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).put({ id: 'last', name: file.name, size: file.size, data: buf, savedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSavedIfcFile() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const req = tx.objectStore(STORE_FILES).get('last');
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
    const tx = db.transaction([STORE_FILES, STORE_WALLS], 'readwrite');
    tx.objectStore(STORE_FILES).delete('last');
    tx.objectStore(STORE_WALLS).delete('last');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveParsedWalls(fileName, fileSize, walls) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WALLS, 'readwrite');
    tx.objectStore(STORE_WALLS).put({ id: 'last', fileName, fileSize, walls, savedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadParsedWalls(fileName, fileSize) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WALLS, 'readonly');
    const req = tx.objectStore(STORE_WALLS).get('last');
    req.onsuccess = () => {
      const rec = req.result;
      if (!rec || rec.fileName !== fileName || rec.fileSize !== fileSize) { resolve(null); return; }
      resolve(rec.walls);
    };
    req.onerror = () => reject(req.error);
  });
}

const STORE_HANDLE = 'file-handles';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ifc-handles', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_HANDLE, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFileHandle(handle) {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANDLE, 'readwrite');
    tx.objectStore(STORE_HANDLE).put({ id: 'last', handle, savedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFileHandle() {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANDLE, 'readonly');
    const req = tx.objectStore(STORE_HANDLE).get('last');
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteFileHandle() {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANDLE, 'readwrite');
    tx.objectStore(STORE_HANDLE).delete('last');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export function supportsFileSystemAccess() {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}
