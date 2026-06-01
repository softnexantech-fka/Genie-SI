// ============================================================
// datastore.js — Synchronisation SQLite + WebSocket temps réel
// SI Génie Consultant v132 (AUDIT COMPLET)
// ============================================================
//
// CORRECTIONS v132 :
// [D1] WebSocket URL — connectait en ws:// au lieu de http://.
//      socket.io-client doit recevoir une URL HTTP pour gérer
//      lui-même l'upgrade polling → WebSocket. Corrigé.
// [D2] identify — n'envoyait pas le JWT token → le serveur
//      acceptait n'importe quel userId sans vérification.
//      Désormais le token JWT est inclus dans l'identify.
// [D3] Déduplication requêtes concurrentes — plusieurs composants
//      appelant dsLoad() simultanément lançaient N fetches
//      en parallèle pour la même clé. Map de promesses en cours.
// [D4] dsStartSync() — ajoutait onUpdate à _syncListeners sans
//      jamais le retirer si appelé plusieurs fois → fuite mémoire.
// [D5] Offline queue — pas de vérification isSharedKey avant
//      d'enregistrer dans la file → clés arbitraires possibles.
// [D6] PROXY_URL recalculé à chaque module load → peut diverger
//      si window.location change. Centralisé avec cache propre.
// [D7] Gestion d'erreur dsLoad background — catch() générique
//      masquait toutes les erreurs réseau sans distinction.
// ============================================================

import { _lsGet, _lsSet, lsLoad, lsSave } from './storage.js';

// [D6] PROXY_URL — déterminé une seule fois, au chargement du module
// ✅ CRITICAL FIX: NETWORK ISOLATION
// Quand le frontend est sur 192.168.1.133:4173, le backend est sur 192.168.1.133:3001
// On doit remplacer le port du frontend (4173/5173) par le port du backend (3001).
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

// ✅ CRITICAL FIX: Export getProxyUrl as named export for use in Auth.jsx
export { getProxyUrl };

const CACHE_TTL_MS      = 30_000;  // Cache local valide 30 secondes
const OFFLINE_QUEUE_KEY = 'gc-offline-queue-v2';

// Clés partagées entre tous les utilisateurs (synchronisées SQLite)
// FIX v141 — Ajout de toutes les clés modules manquantes (étaient localStorage-only)
export const SHARED_KEYS = new Set([
  'gc-users', 'gc-dossiers', 'gc-taches', 'gc-rdvs', 'gc-pending-delete-approvals',
  'gc-partners', 'gc-messages', 'gc-notifications', 'gc-session-logs',
  'gc-pending-connections', 'gc-pending-account-actions', 'gc-app-habilitations',
  'gc-app-access-codes', 'gc-si-appearance', 'gc-si-logo-url', 'gc-si-css-overrides',
  'gc-si-system-docs', 'gc-committees', 'gc-codif-registry', 'gc-internal-docs',
  'gc-dossier-files', 'gc-standalone-docs', 'gc-achievements', 'gc-require-conn-approval',
  'gc-achats', 'gc-leaves', 'gc-sirh-reinstatements', 'gc-writer-docs',
  'gc-writer-pro-v2', 'gc-tableur-pro', 'gc-pres-decks-v2', 'gc-courrier-docs',
  'gc-docs-archives', 'gc-ohada-docs', 'gc-feuille-tests', 'gc-audit-checklist-custom',
  'gc-amelio-actions', 'gc-amelio-kpis', 'gc-amelio-ncs', 'gc-coso-scores',
  'gc-coso-notes', 'gc-coso-custom-q', 'gc-bcg', 'gc-mckinsey', 'gc-porter',
  'gc-vrio', 'gc-qqoqcp', 'gc-pdca', 'gc-pareto', 'gc-mc7s', 'gc-ansoff',
  'gc-conseil-opinions', 'gc-matrix-log', 'gc-msg-drafts', 'gc-msg-templates',
  'gc-notes-rapides', 'gc-logmod-stocks', 'gc-piece-series', 'gc-backup-log',
  'gc-backups', 'gc-devis', 'gc-10m', 'gc-5m', 'gc-5s',
  'gc-ai-proxy-url', 'gc-budget-rapide', 'gc-factures', 'gc-account-actions',
  'users', 'dossiers', 'taches', 'rdvs', 'pendingApprovals', 'partners', 'gc-pending-approvals', 'standaloneDocuments',
  'siAppearance', 'siLogoUrl', 'siCSSOverrides',
  // ── FIX v141 : Processus & Hiérarchie ─────────────────────────────
  'gc-process-app-matrix',  // matrice accès processus-applications (HubPanels)
  'gc-circuits',            // circuits d'approbation configurés
  'gc-orgigram-nodes',      // nœuds organigramme
  'gc-orgigram-links',      // liens organigramme
  // ── FIX v141 : Messagerie ──────────────────────────────────────────
  'gc-messages-global',     // messages inter-collaborateurs (badges + sync)
  // ── FIX v141 : CRM / Conseil ──────────────────────────────────────
  'gc-crm-interactions',    // interactions CRM
  'gc-crm-opps',            // opportunités CRM
  'gc-crm-relances',        // relances CRM
  'gc-conventions',         // conventions
  'gc-demandes',            // demandes inter-modules
  // ── FIX v141 : SIRH ───────────────────────────────────────────────
  'gc-sirh-presences',      // feuilles de présence
  'gc-sirh-evaluations',    // évaluations collaborateurs
  'gc-sirh-fichiers',       // fichiers SIRH
  'gc-recrutements',        // dossiers recrutement
  'gc-paie-taux',           // taux de paie configurés
  'gc-paie-transferts',     // ordres de virement paie
  // ── FIX v141 : Audit & Conformité ─────────────────────────────────
  'gc-audit-actions',       // plans d'action audit
  'gc-audit-checklist',     // checklists audit
  'gc-audit-prog',          // programmes d'audit
  'gc-pca',                 // plan de continuité d'activité
  'gc-pca-risques',         // risques PCA
  'gc-pca-procedures',      // procédures PCA
  'gc-pca-tests',           // tests PCA
  'gc-conffull-approvals',  // approbations conformité
  'gc-conffull-checks',     // contrôles conformité
  'gc-conffull-kpi',        // KPIs conformité
  'gc-conffull-veille',     // veille réglementaire
  'gc-rgpd-traitements',    // registre RGPD
  'gc-obligations',         // obligations réglementaires
  'gc-nc',                  // non-conformités
  'gc-risks',               // registre risques
  'gc-resources',           // ressources partagées
  // ── FIX v141 : Finance & Logistique ───────────────────────────────
  'gc-journal',             // journal comptable
  'gc-budget',              // budgets
  'gc-stocks',              // stocks
  'gc-inventaires',         // inventaires
  'gc-inventaire-en-cours', // inventaire en cours
  'gc-logistique-actifs',   // actifs logistique
  'gc-tpa',                 // tableaux de bord finance
  // ── FIX v141 : Juridique ──────────────────────────────────────────
  'gc-jur-custom-laws',     // lois personnalisées
  'gc-jur-custom-modeles',  // modèles juridiques
  // ── FIX v141 : Configuration cabinet ─────────────────────────────
  'gc-cabinet-info',        // informations cabinet
  'gc-fiscal-config',       // configuration fiscale
  'gc-delai-config',        // configuration délais
  // ── FIX v141 : Communication ──────────────────────────────────────
  'gc-comm-fiches',         // fiches communication
  'gc-comm-custom-tpl',     // modèles communication
  // ── FIX v141 : Documents & Archives ──────────────────────────────
  'gc-docs-unified',        // documents unifiés
  'gc-external-docs',       // documents externes
  'gc-forms',               // formulaires
  'gc-gestion-archives',    // archives gestion
  'gc-ohada-custom',        // OHADA personnalisé
  'gc-ohada-overrides',     // surcharges OHADA
  // ── FIX v141 : Présence temps réel ───────────────────────────────
  'gc-presence',            // heartbeats présence collaborateurs (cross-machine)
]);

function isSharedKey(key) {
  if (!key) return false;
  if (SHARED_KEYS.has(key)) return true;
  if (key.startsWith('gc-notif-')) return true;
  // Clés aliasées
  if (key === 'users' || key === 'dossiers' || key === 'taches' || key === 'rdvs' || key === 'pendingApprovals' || key === 'partners' || key === 'standaloneDocuments') return true;
  return false;
}

// [D2] Récupérer JWT token depuis localStorage
function getJWTToken() {
  try {
    return _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || null;
  } catch { return null; }
}

function getRequestHeaders(extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  const token = getJWTToken();
  if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  // [C8] Inclure le socket ID pour exclure l'expéditeur du broadcast serveur
  if (_socket?.id) headers['X-Socket-Id'] = _socket.id;
  return headers;
}

// ── Cache mémoire ────────────────────────────────────────────────────────────
const _cache = new Map(); // key → { data, ts }

// [D3] Map de déduplication — évite N fetches parallèles pour la même clé
const _pendingFetches = new Map(); // key → Promise

// ── État connexion ────────────────────────────────────────────────────────────
let _online        = false;
let _socket        = null;
let _socketReady   = false;
let _syncListeners = new Set();

export const dsProxyAvailable = () => _online;

// ── Notifications per-user ────────────────────────────────────────────────────
function dsRegisterNotifSync() {
  if (typeof window === 'undefined') return;
  window.__gcNotifSync = async (userId, notifs) => {
    if (!userId || !_online) return;
    const key = `gc-notif-${userId}`;
    try {
      await fetch(`${PROXY_URL}/api/data/${encodeURIComponent(key)}`, {
        method:  'POST',
        headers: getRequestHeaders(),
        body:    JSON.stringify({ value: notifs, userId }),
        signal:  AbortSignal.timeout(6000),
      });
    } catch (_) {}
  };
}

// ── File d'attente offline ────────────────────────────────────────────────────
const MAX_OFFLINE_QUEUE_SIZE = 1_000_000; // 1 MB max
const MAX_OFFLINE_QUEUE_ITEMS = 500;      // max 500 items

function loadOfflineQueue() {
  try { return JSON.parse(_lsGet(OFFLINE_QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveOfflineQueue(q) {
  try {
    const json = JSON.stringify(q);
    const sizeBytes = new Blob([json]).size;
    
    // ✅ CRITICAL FIX: Enforce size limits to prevent localStorage quota exceeded
    if (sizeBytes > MAX_OFFLINE_QUEUE_SIZE) {
      console.warn(`[DS] Offline queue exceeds ${MAX_OFFLINE_QUEUE_SIZE / 1024}KB limit (${sizeBytes / 1024}KB). Trimming oldest items.`);
      // Keep only newest 300 items
      const trimmed = q.slice(Math.max(0, q.length - 300));
      _lsSet(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed));
      return;
    }
    
    if (q.length > MAX_OFFLINE_QUEUE_ITEMS) {
      console.warn(`[DS] Offline queue > ${MAX_OFFLINE_QUEUE_ITEMS} items. Trimming to 300.`);
      const trimmed = q.slice(Math.max(0, q.length - 300));
      _lsSet(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed));
      return;
    }
    
    _lsSet(OFFLINE_QUEUE_KEY, json);
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.error('[DS] localStorage quota exceeded. Clearing offline queue.');
      try { _lsSet(OFFLINE_QUEUE_KEY, JSON.stringify([])); } catch {}
    }
  }
}
// [D5] isSharedKey vérifié avant d'enregistrer dans la file
function enqueueOffline(key, value, userId) {
  if (!isSharedKey(key)) return; // n'enregistrer que les clés autorisées
  const q   = loadOfflineQueue();
  const idx = q.findIndex(item => item.key === key);
  const entry = { key, value, userId, ts: Date.now() };
  if (idx >= 0) q[idx] = entry; else q.push(entry);
  if (q.length > 500) q.splice(0, q.length - 500);
  saveOfflineQueue(q);
}

// ── WebSocket ────────────────────────────────────────────────────────────────
async function initWebSocket() {
  try {
    const { io } = await import(
      /* @vite-ignore */ 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js'
    ).catch(() => ({ io: null }));

    if (!io) {
      console.warn('[DS] socket.io-client non disponible — mode polling uniquement');
      return;
    }

    // [D1] Connexion en HTTP (pas ws://) — socket.io gère l'upgrade automatiquement
    // L'ancien code faisait PROXY_URL.replace(/^http/, 'ws') ce qui cassait
    // le handshake initial polling → WebSocket sur certains proxies.
    _socket = io(getProxyUrl(), {
      transports:           ['websocket', 'polling'],
      reconnectionDelay:    2000,
      reconnectionAttempts: Infinity,
      timeout:              10000,
      forceNew:             false,
    });

    _socket.on('connect', () => {
      _socketReady = true;
      console.log('[DS] WebSocket connecté:', _socket.id);

      // [D2] Identifier avec JWT token pour vérification côté serveur
      try {
        const sess  = JSON.parse(_lsGet('gc-active-session') || 'null');
        const token = getJWTToken();
        if (sess?.userId) {
          _socket.emit('identify', {
            userId:   sess.userId,
            userName: sess.userName || sess.name || sess.userId,
            // Token JWT envoyé pour vérification côté serveur
            // Si absent (première connexion avant login), le serveur identifie anonymement
            token:    token ? token.replace(/^Bearer /, '') : undefined,
          });
        }
      } catch {}

      // Flusher la file d'attente offline
      const queue = loadOfflineQueue();
      if (queue.length > 0) {
        console.log(`[DS] Flush file offline: ${queue.length} éléments`);
        _socket.emit('flush_offline_queue', queue);
        saveOfflineQueue([]);
      }
    });

    _socket.on('disconnect', (reason) => {
      _socketReady = false;
      console.log(`[DS] WebSocket déconnecté (${reason}) — mode offline`);
    });

    // Notification changement de données → invalider cache + notifier React
    _socket.on('data_changed', ({ key, action, by, ts }) => {
      if (!key) return;
      _cache.delete(key);
      _pendingFetches.delete(key); // [D3] Annuler dédup si donnée changée
      _syncListeners.forEach(fn => {
        try { fn({ key, action, by, ts }); } catch {}
      });
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: `__GC__${key}`,
          newValue: JSON.stringify({ ts, action }),
        }));
      } catch {}
    });

    _socket.on('file_uploaded', (data) => {
      _syncListeners.forEach(fn => { try { fn({ type: 'file_uploaded', ...data }); } catch {} });
    });

    _socket.on('full_restore', ({ filename, restored }) => {
      console.log(`[DS] Restauration complète: ${filename} (${restored} clés)`);
      _cache.clear();
      _pendingFetches.clear();
      window.location.reload();
    });

    _socket.on('flush_result', ({ synced, total }) => {
      console.log(`[DS] ✅ Sync offline: ${synced}/${total} éléments`);
    });

    _socket.on('connect_error', (err) => {
      if (err.message !== 'xhr poll error') { // Silencieux pour erreurs polling normales
        console.warn('[DS] WebSocket erreur connexion:', err.message);
      }
    });

  } catch (e) {
    console.warn('[DS] Impossible d\'initialiser WebSocket:', e.message);
  }
}

// ── Health check proxy ────────────────────────────────────────────────────────
async function checkProxy() {
  const originalUrl = PROXY_URL;
  const urls = Array.from(new Set([PROXY_URL, ORIGIN_PROXY_URL]));
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`${url}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) {
        if (url !== originalUrl) {
          console.warn(`[DS] Proxy ${originalUrl} indisponible, utilisation de ${url} pour le backend.`);
        }
        PROXY_URL = url;
        _online = true;
        return true;
      }
    } catch (e) {
      // Continue to next candidate
    }
  }
  _online = false;
  return false;
}

// ── API publique ─────────────────────────────────────────────────────────────

export async function dsInitSync() {
  const online = await checkProxy();
  if (online) {
    await initWebSocket();
    console.log('[DS] ✅ Synchronisation SQLite activée');
  } else {
    console.log('[DS] ℹ️  Mode offline — données locales actives');
  }
  dsRegisterNotifSync();
  return { online, synced: 0 };
}

export function dsOnSync(fn) {
  _syncListeners.add(fn);
  return () => _syncListeners.delete(fn);
}

// [D4] dsStartSync — l'ancien code ajoutait onUpdate sans le retirer.
// Désormais on retourne un unsub propre ET on évite les doublons.
export function dsStartSync(onUpdate) {
  let unsub = null;
  if (onUpdate) {
    _syncListeners.add(onUpdate);
    unsub = () => _syncListeners.delete(onUpdate);
  }

  const interval = setInterval(async () => {
    const nowOnline = await checkProxy();
    if (nowOnline && !_socketReady) {
      await initWebSocket();
    }
    if (!nowOnline && _online) {
      _online = false;
      console.log('[DS] Connexion perdue — mode offline');
    }
  }, 30_000);

  // Retourne une fonction de nettoyage complète
  return () => {
    clearInterval(interval);
    if (unsub) unsub();
  };
}

export function dsLoad(key, fallback = null) {
  // Retour immédiat depuis LS (offline-first)
  const local = lsLoad(key, fallback);

  // [D3] Rafraîchir en arrière-plan si online — avec déduplication
  if (_online && isSharedKey(key)) {
    const cached = _cache.get(key);
    if (!cached || Date.now() - cached.ts > CACHE_TTL_MS) {
      // Ne lancer qu'une seule requête même si dsLoad est appelé N fois en parallèle
      if (!_pendingFetches.has(key)) {
        const promise = dsGet(key, null)
          .then(serverVal => {
            if (serverVal !== null) {
              const localJson  = JSON.stringify(lsLoad(key, null));
              const serverJson = JSON.stringify(serverVal);
              if (localJson !== serverJson) {
                lsSave(key, serverVal);
                _cache.set(key, { data: serverVal, ts: Date.now() });
                try {
                  window.dispatchEvent(new StorageEvent('storage', {
                    key: `__GC__${key}`,
                    newValue: serverJson,
                  }));
                } catch {}
              }
            }
          })
          .catch(e => {
            // [D7] Log distingué : erreur réseau vs erreur logique
            if (e.name !== 'AbortError' && e.name !== 'TypeError') {
              console.warn(`[DS] Erreur refresh ${key}:`, e.message);
            }
          })
          .finally(() => {
            _pendingFetches.delete(key); // [D3] Libérer après résolution
          });
        _pendingFetches.set(key, promise);
      }
    }
  }

  return local;
}

export async function dsGet(key, fallback = null) {
  if (!_online || !isSharedKey(key)) return fallback;
  try {
    const r = await fetch(`${getProxyUrl()}/api/data/${encodeURIComponent(key)}`, {
      headers: getRequestHeaders(),
      signal:  AbortSignal.timeout(8000),
    });
    if (r.status === 404) return fallback; // clé absente = null propre
    if (r.status === 401) return fallback; // [D8] Non authentifié — traiter comme clé absente (fallback)
    if (!r.ok) {
      console.warn(`[DS] Serveur ${r.status} pour ${key}`);
      return fallback;
    }
    const json = await r.json();
    const val  = json.value ?? fallback;
    _cache.set(key, { data: val, ts: Date.now() });
    return val;
  } catch (e) {
    if (e.name !== 'AbortError') console.warn(`[DS] Réseau ${key}:`, e.message);
    return fallback;
  }
}

export async function dsSave(key, value, userId = null) {
  lsSave(key, value);
  _cache.set(key, { data: value, ts: Date.now() });

  if (!isSharedKey(key)) return { ok: true, local: true };

  if (!_online) {
    enqueueOffline(key, value, userId); // [D5] validation dans enqueueOffline
    return { ok: true, local: true, queued: true };
  }

  // ── FIX v140 BUG #3 — Merge défensif côté client ──────────────────────────
  // Avant d'envoyer au serveur, comparer avec le cache mémoire (dernière valeur
  // connue du serveur). Si la valeur locale est une régression évidente (tableau
  // beaucoup plus court), avertir et enrichir avec les données manquantes du cache.
  //
  // Ce garde-fou client complète l'anti-régression serveur (Bug #2) pour les cas
  // où le serveur est indisponible au moment de la détection côté client.
  // ─────────────────────────────────────────────────────────────────────────────
  const REGRESSION_KEYS = new Set(['users', 'dossiers', 'taches', 'rdvs', 'partners', 'gc-users']);
  let sendValue = value;
  if (REGRESSION_KEYS.has(key) && Array.isArray(value)) {
    const cached = _cache.get(key);
    const cachedData = cached?.data;
    if (Array.isArray(cachedData) && cachedData.length > 4 && value.length < cachedData.length * 0.5) {
      // Régression locale détectée : merger pour ne pas perdre les données du cache
      const incomingIds = new Set(value.map(item => item?.id).filter(Boolean));
      const preserved   = cachedData.filter(item => item?.id && !incomingIds.has(item.id));
      sendValue = [...value, ...preserved];
      console.warn(
        `[dsSave FIX-REGRESSION v140] Merge défensif client pour '${key}': ` +
        `local=${value.length}, cache=${cachedData.length}, envoi=${sendValue.length}`
      );
      // Mettre aussi à jour le localStorage et le cache avec la valeur mergée
      lsSave(key, sendValue);
      _cache.set(key, { data: sendValue, ts: Date.now() });
    }
  }

  try {
    const r = await fetch(`${getProxyUrl()}/api/data/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: getRequestHeaders(),
      body:    JSON.stringify({ value: sendValue, userId }),
      signal:  AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      console.warn(`[DS] Serveur ${r.status} pour save ${key}`);
      enqueueOffline(key, sendValue, userId);
      return { ok: false, queued: true };
    }
    return { ok: true, synced: true };
  } catch (e) {
    if (e.name !== 'AbortError') console.warn(`[DS] Réseau save ${key}:`, e.message);
    enqueueOffline(key, sendValue, userId);
    return { ok: false, queued: true };
  }
}

export { dsSave as dsSet };

export async function dsDelete(key, userId = null) {
  lsSave(key, null);
  _cache.delete(key);
  if (!_online || !isSharedKey(key)) return { ok: true, local: true };
  try {
    await fetch(`${getProxyUrl()}/api/data/${encodeURIComponent(key)}`, {
      method:  'DELETE',
      headers: getRequestHeaders(),
      body:    JSON.stringify({ userId }),
      signal:  AbortSignal.timeout(8000),
    });
    return { ok: true, deleted: true };
  } catch { return { ok: false }; }
}

export function dsOfflineQueueSize() {
  return loadOfflineQueue().length;
}

// [FIX-SYNC-AUTH] gcSyncAuthUsers — Déclenche la synchronisation gc-users depuis users
// sur le serveur. À appeler après toute création/modification/suppression de compte.
// Silencieux en mode offline ou si le serveur n'est pas joignable.
export async function gcSyncAuthUsers() {
  if (!_online) return { ok: false, reason: 'offline' };
  try {
    const token = getJWTToken();
    if (!token) return { ok: false, reason: 'no-token' };
    const r = await fetch(`${getProxyUrl()}/api/auth/sync-users`, {
      method:  'POST',
      headers: { ...getRequestHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
      signal:  AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const data = await r.json();
    if (data.added > 0 || data.updated > 0) {
      console.info(`[SYNC-AUTH] gc-users: +${data.added} ajoutés, ${data.updated} MàJ, ${data.removed} supprimés`);
    }
    return data;
  } catch (e) {
    console.warn('[SYNC-AUTH] Échec:', e.message);
    return { ok: false, reason: e.message };
  }
}

export default {
  dsProxyAvailable, dsOfflineQueueSize,
  dsInitSync, dsOnSync, dsStartSync,
  dsLoad, dsGet, dsSave, dsSet: dsSave, dsDelete,
  gcSyncAuthUsers,
  SHARED_KEYS, getJWTToken, getRequestHeaders, getProxyUrl,
};
