// ============================================================
// filestore.js — Gestion fichiers : Disque serveur + IndexedDB cache
// SI Génie Consultant v127
//
// ARCHITECTURE :
//   Serveur (SQLite + Disque)  = stockage principal (250 GB+)
//   IndexedDB navigateur       = cache offline
//   Auto-sync IDB → Serveur   = dès que connexion rétablie
// ============================================================

import { _lsGet } from './storage.js';

// ── JWT helper (miroir de datastore.js pour éviter la dépendance circulaire) ──
function _getJWT() {
  try {
    return _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || null;
  } catch { return null; }
}
function _authHeaders(extra = {}) {
  const headers = { ...extra };
  const token = _getJWT();
  if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  return headers;
}

const IDB_NAME    = 'GC_FileStore_v1';
const IDB_VERSION = 3;  // Incrémenté pour migration
const IDB_STORE   = 'files';
// FIX v152 CRITICAL — Même logique que datastore.js : remplacer le port frontend
// (4173/5173 Vite) par le port backend (3001). window.location.origin donnait le
// port frontend et faisait échouer tous les uploads en environnement LAN.
const BACKEND_PORT = 3001;
const ORIGIN_PROXY_URL = (() => {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  const { hostname, protocol } = window.location;
  return `${protocol}//${hostname}:${BACKEND_PORT}`;
})();
const SAVED_PROXY_URL = (() => {
  try {
    const saved = JSON.parse(_lsGet('gc-ai-proxy-url') || 'null');
    return saved && typeof saved === 'string' ? saved : null;
  } catch {
    return null;
  }
})();
let PROXY_URL = SAVED_PROXY_URL || ORIGIN_PROXY_URL;

function getProxyUrl() {
  return PROXY_URL;
}

// Construire une URL absolue vers le backend pour les fichiers
function fileApiUrl(path) {
  return `${getProxyUrl()}${path}`;
}

async function checkProxyUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return r.ok;
  } catch {
    return false;
  }
}

// ── IndexedDB (cache local offline) ──────────────────────────────────────────
let _idb = null;

function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        store.createIndex('dossierId', 'dossierId', { unique: false });
        store.createIndex('module',    'module',    { unique: false });
        store.createIndex('synced',    'synced',    { unique: false });
      }
      // Migration v3: ajouter index 'synced' si absent
      if (e.oldVersion < 3) {
        const tx = e.target.transaction;
        if (tx.objectStoreNames.contains(IDB_STORE)) {
          const s = tx.objectStore(IDB_STORE);
          if (!s.indexNames.contains('synced')) {
            s.createIndex('synced', 'synced', { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => { _idb = req.result; resolve(_idb); };
    req.onerror   = () => resolve(null);
  });
}

function idbTransaction(mode) {
  if (!_idb) return null;
  try { return _idb.transaction([IDB_STORE], mode).objectStore(IDB_STORE); }
  catch { return null; }
}

function idbRun(storeGetter, fn) {
  return new Promise((resolve, reject) => {
    openIDB().then(() => {
      const store = storeGetter();
      if (!store) return resolve(null);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(null);
    }).catch(reject);
  });
}

// ── Lecture depuis serveur ────────────────────────────────────────────────────
async function serverAvailable() {
  const originalUrl = PROXY_URL;
  const urls = Array.from(new Set([PROXY_URL, ORIGIN_PROXY_URL]));
  for (const url of urls) {
    const available = await checkProxyUrl(url);
    if (available) {
      if (url !== originalUrl) {
        console.warn(`[FS] Proxy ${originalUrl} indisponible, utilisation de ${url}`);
      }
      PROXY_URL = url;
      return true;
    }
  }
  return false;
}

async function uploadToServer(file, meta) {
  // FIX v154 CRITICAL — Rejeter les fichiers vides AVANT l'envoi.
  if (!file || file.size === 0) {
    console.error('[uploadToServer] ❌ Fichier vide (0 octet) — upload annulé :', file?.name);
    return null;
  }
  const form = new FormData();
  form.append('file', file);
  if (meta.dossierId)   form.append('dossierId',   meta.dossierId);
  if (meta.module)      form.append('module',       meta.module);
  if (meta.uploadedBy)  form.append('uploadedBy',   meta.uploadedBy);
  try {
    // FIX CRITICAL — URL absolue vers le backend (port 3001), pas relative au frontend
    const r = await fetch(fileApiUrl('/api/files/upload'), {
      method: 'POST',
      headers: _authHeaders(),
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) {
      let errBody = '';
      try { errBody = await r.text(); } catch (_) {}
      const message = errBody ? `Serveur ${r.status}: ${errBody.slice(0, 200)}` : `Serveur ${r.status}`;
      console.warn(`[uploadToServer] ❌ ${message}`);
      return { error: message };
    }
    const data = await r.json();
    if (!data?.ok) {
      const message = data?.error || 'Réponse serveur invalide';
      console.warn('[uploadToServer] ❌ Rejet serveur :', message);
      return { error: message };
    }
    return data.file || { error: 'Aucun fichier renvoyé par le serveur' };
  } catch (err) {
    console.warn('[uploadToServer] ❌ Réseau :', err.message);
    return { error: err.message };
  }
}

// ── IDB helpers ──────────────────────────────────────────────────────────────
// FIX IDB-P1 — Purge automatique des fichiers IDB déjà synchronisés avant d'en ajouter un nouveau.
// Évite le QuotaExceededError silencieux qui bloquait les uploads offline.
const IDB_SOFT_LIMIT_MB = 100; // Déclencher purge au-dessus de 100 Mo dans IDB
async function idbPurgeIfNeeded(requiredBytes = 0) {
  try {
    if (!navigator?.storage?.estimate) return;
    const { usage, quota } = await navigator.storage.estimate();
    const usedMB = usage / (1024 * 1024);
    const quotaMB = quota / (1024 * 1024);
    const percentUsed = Math.round((usage / quota) * 100);
    // Purger si > 80% du quota OU si IDB trop chargé
    if (percentUsed < 80 && usedMB < IDB_SOFT_LIMIT_MB) return;
    const all = await idbGetAll();
    if (!all?.length) return;
    // Trier par date d'upload : les plus anciens et déjà synchronisés partent en premier
    const purgeable = all
      .filter(f => f.synced && !f.blob)
      .sort((a, b) => (a.uploadedAt || '') < (b.uploadedAt || '') ? -1 : 1);
    let purged = 0;
    for (const f of purgeable) {
      await idbDelete(f.id);
      purged++;
      // Purger jusqu'à libérer suffisamment ou max 50 fichiers
      if (purged >= 50) break;
    }
    if (purged > 0) console.log(`[IDB] Purge auto : ${purged} fichiers anciens supprimés (espace libéré)`);
  } catch {}
}

async function idbSave(fileRef) {
  // Purge préventive avant tout save avec blob (fichier offline)
  if (fileRef?.blob) await idbPurgeIfNeeded(fileRef.taille || 0);
  return idbRun(() => idbTransaction('readwrite'), s => s.put(fileRef));
}
async function idbGet(id) {
  return idbRun(() => idbTransaction('readonly'), s => s.get(id));
}
async function idbDelete(id) {
  return idbRun(() => idbTransaction('readwrite'), s => s.delete(id));
}
async function idbGetAll() {
  return idbRun(() => idbTransaction('readonly'), s => s.getAll());
}
async function idbGetByIndex(indexName, value) {
  return idbRun(
    () => { const s = idbTransaction('readonly'); return s ? s.index(indexName) : null; },
    s => s.getAll(value)
  );
}
async function idbGetUnsynced() {
  const all = await idbGetAll();
  return (all || []).filter(f => !f.synced && f.blob);
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Sauvegarder un fichier
 * 1. Sur le serveur si dispo (stockage disque 250 GB+)
 * 2. Sinon en cache IDB (offline) avec retry à la reconnexion
 */
export async function gcFileSave(file, meta = {}) {
  if (!file) return null;
  const id = meta.id || `F-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // FIX v154 CRITICAL — S'assurer qu'on a un vrai File avec un vrai contenu.
  let blob;
  if (file instanceof File) {
    blob = file;
  } else if (file instanceof Blob) {
    blob = file;
  } else {
    console.warn('[gcFileSave] Type de fichier inattendu :', typeof file, '— wrapping en Blob');
    blob = new Blob([file]);
  }

  const realSize = blob.size ?? 0;
  if (realSize === 0) {
    console.error('[gcFileSave] ❌ Fichier vide (0 octet) — opération annulée :', meta.nom || file.name);
    return null;
  }

  const ref = {
    id,
    nom:            meta.nom        || file.name   || id,
    type:           meta.type       || file.type   || blob.type || 'application/octet-stream',
    taille:         realSize,
    module:         meta.module     || 'general',
    dossierId:      meta.dossierId  || null,
    uploadedBy:     meta.uploadedBy || meta.userId || null,
    uploadedByName: meta.uploadedByName || null,
    uploadedAt:     new Date().toISOString(),
    synced:         false,
    serverId:       null,
  };

  const fileToUpload = (file instanceof File)
    ? file
    : new File([blob], ref.nom, { type: ref.type });

  if (fileToUpload.size === 0) {
    console.error('[gcFileSave] ❌ fileToUpload vide après conversion — fallback IDB :', ref.nom);
    ref.blob = blob;
    ref.storageType = 'local';
    try { ref.dataUrl = URL.createObjectURL(blob); ref.url = ref.dataUrl; } catch (_) {}
    await idbSave(ref);
    return ref;
  }

  let serverRef = null;
  try {
    serverRef = await uploadToServer(fileToUpload, meta);
  } catch (err) {
    console.warn('[gcFileSave] Erreur upload serveur :', err.message, '→ fallback IDB');
  }

  if (serverRef && serverRef.id) {
    ref.synced      = true;
    ref.serverId    = serverRef.id;
    // FIX CRITICAL — URL absolue stockée dans la référence
    ref.serverUrl   = serverRef.serverUrl
      ? (serverRef.serverUrl.startsWith('http') ? serverRef.serverUrl : fileApiUrl(serverRef.serverUrl))
      : fileApiUrl(`/api/files/${serverRef.id}`);
    ref.path        = ref.serverUrl;
    ref.url         = ref.serverUrl;
    ref.storageType = 'server';
    await idbSave({ ...ref, blob: null });
    console.log(`[gcFileSave] ✅ Upload serveur OK : ${ref.nom} → ${ref.serverUrl}`);
    return ref;
  }
  if (serverRef && serverRef.error) {
    ref.error = serverRef.error;
    ref.warning = `⚠️ Upload serveur impossible : ${serverRef.error}. Stocké localement uniquement.`;
    console.warn('[gcFileSave] ⚠️ Upload serveur impossible :', serverRef.error);
  } else if (serverRef && !serverRef.id) {
    ref.warning = `⚠️ Upload serveur non confirmé. Stocké localement.`;
    console.warn('[gcFileSave] Upload serveur répondu sans id — fallback IDB', serverRef);
  }

  // Fallback IDB offline
  ref.blob = blob;
  ref.storageType = 'local';
  try {
    ref.dataUrl = URL.createObjectURL(blob);
    ref.url = ref.dataUrl;
  } catch (_) {}
  await idbSave(ref);
  ref.warning = `⚠️ ${ref.nom} stocké localement. Il sera synchronisé lorsque la connexion reviendra mais n'est pas encore accessible aux autres utilisateurs.`;
  console.warn(`[gcFileSave] ⚠️ Offline — fichier en cache IDB: ${ref.nom} (sera sync au rétablissement)`);
  return ref;
}

// FIX BUG-FILE-1 — Détecter si un fileRef est côté serveur même sans serverId/serverUrl explicite.
// Retourne TOUJOURS une URL absolue vers le backend.
function _resolveServerUrl(fileRef) {
  if (!fileRef) return null;
  // URL absolue déjà stockée → utiliser directement
  if (fileRef.serverUrl) {
    return fileRef.serverUrl.startsWith('http')
      ? fileRef.serverUrl
      : fileApiUrl(fileRef.serverUrl);
  }
  if (fileRef.serverId) return fileApiUrl(`/api/files/${fileRef.serverId}`);
  // Compatibilité ascendante : anciens refs avec url direct ou storageType server
  if (fileRef.storageType === 'server' && fileRef.url) {
    return fileRef.url.startsWith('http') ? fileRef.url : fileApiUrl(fileRef.url);
  }
  if (fileRef.url && typeof fileRef.url === 'string' && fileRef.url.includes('/api/files/')) {
    return fileRef.url.startsWith('http') ? fileRef.url : fileApiUrl(fileRef.url);
  }
  // Dernier recours : id de type F-xxxxx sans blob connu
  if (fileRef.id && /^F-\d+-/.test(fileRef.id) && !fileRef.blob) {
    return fileApiUrl(`/api/files/${fileRef.id}`);
  }
  return null;
}

/**
 * Charger un fichier (URL de téléchargement)
 */
export async function gcFileLoad(fileRef) {
  if (!fileRef?.id) return null;

  const serverUrl = _resolveServerUrl(fileRef);
  if (serverUrl) {
    return { ...fileRef, url: serverUrl, local: false };
  }

  const cached = await idbGet(fileRef.id);
  if (cached?.blob) {
    const url = URL.createObjectURL(cached.blob);
    return { ...cached, url, local: true };
  }

  if (fileRef.dataUrl && typeof fileRef.dataUrl === 'string' && fileRef.dataUrl.startsWith('data:')) {
    return { ...fileRef, url: fileRef.dataUrl, local: true };
  }

  return { ...fileRef, url: null, error: 'Fichier introuvable (ni sur le serveur ni en cache local)', local: false };
}

/**
 * Obtenir l'URL d'un fichier pour consultation
 */
export async function gcFileUrl(fileRef) {
  if (!fileRef?.id) return { url: null, isObjectUrl: false };

  // FIX BUG-FILE-2 — URL absolue + ?view=1 pour Content-Disposition: inline
  const serverUrl = _resolveServerUrl(fileRef);
  if (serverUrl) {
    const viewUrl = serverUrl.includes('?') ? `${serverUrl}&view=1` : `${serverUrl}?view=1`;
    return { url: viewUrl, isObjectUrl: false };
  }

  const cached = await idbGet(fileRef.id);
  if (cached?.blob) {
    const url = URL.createObjectURL(cached.blob);
    return { url, isObjectUrl: true };
  }

  return { url: null, isObjectUrl: false, error: 'Fichier introuvable' };
}

/**
 * Télécharger un fichier (déclenche le téléchargement navigateur)
 */
export async function gcFileDownload(fileRef) {
  const loaded = await gcFileLoad(fileRef);
  if (!loaded?.url) {
    const reason = loaded?.error || 'URL de téléchargement introuvable';
    console.warn('[gcFileDownload] Impossible de télécharger:', fileRef?.nom, '—', reason);
    return { ok: false, error: reason };
  }
  const a = document.createElement('a');
  a.href     = loaded.url;
  a.download = fileRef.nom || fileRef.id;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (loaded.local) setTimeout(() => URL.revokeObjectURL(loaded.url), 10_000);
  return { ok: true };
}

/**
 * Supprimer un fichier (serveur + IDB)
 */
export async function gcFileDelete(fileRef) {
  if (!fileRef?.id) return false;
  const online = await serverAvailable();
  if (online && (fileRef.serverId || fileRef.serverUrl)) {
    const id = fileRef.serverId || fileRef.id;
    try {
      // FIX CRITICAL — URL absolue pour la suppression
      await fetch(fileApiUrl(`/api/files/${id}`), {
        method: 'DELETE',
        headers: _authHeaders(),
        signal: AbortSignal.timeout(8000),
      });
    } catch {}
  }
  await idbDelete(fileRef.id);
  return true;
}

/**
 * FIX SYNC-F2 — Supprimer uniquement du cache IDB local (sans appel serveur).
 * Utilisé quand le serveur broadcast 'file_deleted' : un autre client a déjà fait la suppression,
 * on nettoie juste notre cache local pour cohérence.
 */
export async function gcFileDeleteLocal(fileId) {
  if (!fileId) return false;
  try { await idbDelete(fileId); } catch {}
  return true;
}

/**
 * Lister les fichiers d'un dossier
 */
export async function gcFileListByDossier(dossierId) {
  if (!dossierId) return [];
  const online = await serverAvailable();
  if (online) {
    try {
      // FIX CRITICAL — URL absolue pour la liste
      const r = await fetch(fileApiUrl(`/api/files?dossierId=${encodeURIComponent(dossierId)}`), {
        headers: _authHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const data = await r.json();
        return (data.files || []).map(f => ({
          id:         f.id,
          nom:        f.original_name,
          type:       f.mime_type,
          taille:     f.size_bytes,
          module:     f.module,
          dossierId:  f.dossier_id,
          uploadedBy: f.uploaded_by,
          uploadedAt: f.uploaded_at ? new Date(f.uploaded_at * 1000).toISOString() : null,
          serverId:   f.id,
          serverUrl:  fileApiUrl(`/api/files/${f.id}`),
          synced:     true,
        }));
      }
    } catch {}
  }
  // Fallback IDB
  const cached = await idbGetByIndex('dossierId', dossierId);
  return cached || [];
}

/**
 * Lister les fichiers d'un module
 */
export async function gcFileListByModule(module) {
  if (!module) return [];
  const online = await serverAvailable();
  if (online) {
    try {
      // FIX CRITICAL — URL absolue pour la liste
      const r = await fetch(fileApiUrl(`/api/files?module=${encodeURIComponent(module)}`), {
        headers: _authHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const data = await r.json();
        return (data.files || []).map(f => ({
          id: f.id, nom: f.original_name, type: f.mime_type,
          taille: f.size_bytes, module: f.module,
          serverId: f.id, serverUrl: fileApiUrl(`/api/files/${f.id}`), synced: true,
        }));
      }
    } catch {}
  }
  const cached = await idbGetByIndex('module', module);
  return cached || [];
}

/**
 * Synchroniser les fichiers IDB non synchros vers le serveur
 */
export async function gcSyncFilesToServer() {
  const unsynced = await idbGetUnsynced();
  if (!unsynced?.length) return { synced: 0 };

  const online = await serverAvailable();
  if (!online) return { synced: 0, offline: true };

  let count = 0;
  for (const ref of unsynced) {
    if (!ref.blob) continue;
    const file = new File([ref.blob], ref.nom, { type: ref.type });
    const serverRef = await uploadToServer(file, {
      dossierId:   ref.dossierId,
      module:      ref.module,
      uploadedBy:  ref.uploadedBy,
    });
    if (serverRef && serverRef.id) {
      const updated = {
        ...ref, blob: null, synced: true,
        serverId:  serverRef.id,
        serverUrl: fileApiUrl(`/api/files/${serverRef.id}`),
      };
      await idbSave(updated);
      count++;
    }
  }
  console.log(`[FileStore] Sync IDB→Serveur : ${count}/${unsynced.length} fichiers`);
  return { synced: count, total: unsynced.length };
}

/**
 * Migration des anciens fichiers LS/IDB vers serveur
 */
export async function gcMigrateFilesFromLS() {
  const online = await serverAvailable();
  if (!online) return { migrated: 0, skipped: 0 };
  await gcSyncFilesToServer();
  return { migrated: 0, skipped: 0 };
}

/**
 * Statistiques stockage fichiers
 */
export async function gcFileStats() {
  let lsUsed = 0;
  let lsLimit = 5 * 1024 * 1024;
  try {
    for (let key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        lsUsed += key.length + (localStorage[key] || '').length;
      }
    }
  } catch (_) {}
  const lsUsedMB = (lsUsed / (1024 * 1024)).toFixed(1);
  const lsLimitMB = (lsLimit / (1024 * 1024)).toFixed(1);
  const lsPercent = Math.round((lsUsed / lsLimit) * 100);

  let idbCount = 0;
  let idbTotalSize = 0;
  try {
    const db = await openIDB();
    if (db) {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      await new Promise((resolve, reject) => {
        req.onsuccess = () => {
          const files = req.result;
          idbCount = files.length;
          idbTotalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
          resolve();
        };
        req.onerror = reject;
      });
    }
  } catch (_) {}

  const idbTotalSizeMB = (idbTotalSize / (1024 * 1024)).toFixed(1);
  const proxy = await serverAvailable();

  return {
    localStorage: { usedMB: parseFloat(lsUsedMB), limitMB: parseFloat(lsLimitMB), percentUsed: lsPercent },
    idb: { count: idbCount, totalSizeMB: parseFloat(idbTotalSizeMB) },
    proxy
  };
}

/**
 * Vérifier si le proxy API est disponible
 * FIX CRITICAL — URL absolue vers le backend, pas relative au frontend
 */
export async function gcProxyStatus() {
  try {
    const response = await fetch(fileApiUrl('/health'), { method: 'GET', signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch (_) {
    return false;
  }
}

export default {
  gcFileSave, gcFileLoad, gcFileDownload, gcFileDelete, gcFileUrl,
  gcFileListByDossier, gcFileListByModule,
  gcSyncFilesToServer, gcMigrateFilesFromLS, gcFileStats, gcProxyStatus,
};
