/**
 * iclaw — IndexedDB Store
 * Persistent storage for chat history, project metadata, and settings.
 */

const DB_NAME = 'iclaw-db';
const DB_VERSION = 1;

const STORES = {
  CHATS: 'chats',
  SETTINGS: 'settings',
  PROJECTS: 'projects',
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.CHATS)) {
        const chatStore = db.createObjectStore(STORES.CHATS, { keyPath: 'id' });
        chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
        db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

async function tx(storeName, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function wrapRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Chat History ───────────────────────────────────────────────────

export async function saveChat(chat) {
  const store = await tx(STORES.CHATS, 'readwrite');
  return wrapRequest(store.put({ ...chat, updatedAt: Date.now() }));
}

export async function getChat(id) {
  const store = await tx(STORES.CHATS);
  return wrapRequest(store.get(id));
}

export async function getAllChats() {
  const store = await tx(STORES.CHATS);
  return wrapRequest(store.getAll());
}

export async function deleteChat(id) {
  const store = await tx(STORES.CHATS, 'readwrite');
  return wrapRequest(store.delete(id));
}

// ─── Settings ───────────────────────────────────────────────────────

export async function setSetting(key, value) {
  const store = await tx(STORES.SETTINGS, 'readwrite');
  return wrapRequest(store.put({ key, value }));
}

export async function getSetting(key, defaultVal = null) {
  const store = await tx(STORES.SETTINGS);
  const result = await wrapRequest(store.get(key));
  return result ? result.value : defaultVal;
}

// ─── Projects ───────────────────────────────────────────────────────

export async function saveProject(project) {
  const store = await tx(STORES.PROJECTS, 'readwrite');
  return wrapRequest(store.put({ ...project, updatedAt: Date.now() }));
}

export async function getAllProjects() {
  const store = await tx(STORES.PROJECTS);
  return wrapRequest(store.getAll());
}

export async function deleteProject(id) {
  const store = await tx(STORES.PROJECTS, 'readwrite');
  return wrapRequest(store.delete(id));
}

// ─── Storage Estimate ───────────────────────────────────────────────

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  return {
    used: est.usage,
    quota: est.quota,
    usedMB: (est.usage / (1024 * 1024)).toFixed(1),
    quotaMB: (est.quota / (1024 * 1024)).toFixed(0),
    percentUsed: ((est.usage / est.quota) * 100).toFixed(1),
  };
}
