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

// [D6][FIX v153-A] PROXY_URL — déterminé une seule fois au chargement du module
// Port lu depuis import.meta.env.VITE_MASTER_PORT si disponible (défini dans .env.discovery)
// Fallback à 3001 si non défini. Permet de changer le port backend sans modifier ce fichier.
const BACKEND_PORT = (() => {
  try {
    const envPort = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_MASTER_PORT : null;
    const parsed = parseInt(envPort, 10);
    return (parsed > 0 && parsed < 65536) ? parsed : 3001;
  } catch { return 3001; }
})();
const ORIGIN_PROXY_URL = (() => {
  if (typeof window === 'undefined') return `http://localhost:${BACKEND_PORT}`;
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
const DS_HEALTH_TIMEOUT_MS = 10_000;
const DS_GET_TIMEOUT_MS = 20_000;
const DS_SAVE_TIMEOUT_MS = 25_000;
const OFFLINE_RETRY_INTERVAL_MS = 15_000;
const OFFLINE_FLUSH_BATCH_SIZE = 50;

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
  'gc-process-config',      // configuration processus partagée
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
  'gc-kyc-workflows',       // workflows KYC
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
  'gc-audit-grille-taches', // grille de tâches audit FIX v153
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
  'gc-jur-docs',            // documents juridiques
  'gc-jur-veille',          // veille juridique
  // ── FIX v141 : Configuration cabinet ─────────────────────────────
  'gc-cabinet-info',        // informations cabinet
  'gc-fiscal-config',       // configuration fiscale
  'gc-delai-config',        // configuration délais
  // ── FIX v141 : Communication ──────────────────────────────────────
  'gc-comm-fiches',         // fiches communication
  'gc-comm-custom-tpl',     // modèles communication
  'gc-comm-contacts',       // contacts communication FIX v153
  // ── FIX v141 : Documents & Archives ──────────────────────────────
  'gc-docs-unified',        // documents unifiés
  'gc-external-docs',       // documents externes
  'gc-forms',               // formulaires
  'gc-gestion-archives',    // archives gestion
  'gc-ohada-custom',        // OHADA personnalisé
  'gc-ohada-overrides',     // surcharges OHADA
  // ── FIX v141 : Présence temps réel ───────────────────────────────
  'gc-presence',            // heartbeats présence collaborateurs (cross-machine)
  // ── FIX v142 : Clés manquantes ───────────────────────────────────
  'gc-security-alerts',     // alertes sécurité session (connexions suspectes)
  'gc-widget-alarms',       // alarmes agenda
  'gc-system-msgs',         // messages système / newsletter / annonces
  'gc-system-alerts',       // alertes système globales
  'gc-rapport-activite',    // rapports d'activité partagés
  'gc-file-versions',       // historique versions de fichiers
  'gc-codif-registry',      // registre de codification
  'gc-cabinet-info',        // informations cabinet (nom, adresse, RCCM…)
  'gc-delai-config',        // configuration des délais par processus
  'gc-matrix-log',          // journal des modifications matrice accès
  // ── FIX v142b : Clés ERP/CRM/SIRH/Archives manquantes ───────────
  'gc-crm-clients',         // clients CRM
  'gc-jur-kyc',             // dossiers KYC juridique
  'gc-sirh-leaves',         // congés SIRH
  'gc-sirh-recrutements',   // recrutements SIRH
  'gc-comm-campagnes',      // campagnes communication
  'gc-kanban-cols-v2',      // colonnes kanban gestion rapide
  'gc-kanban-cards-v2',     // cartes kanban gestion rapide
  'gc-archives',            // archives dossiers
  'gc-memos',               // mémos widget
  'gc-si-docs',             // documents SI
  'gc-paie-transferts',     // transferts paie
  'gc-sirh-evaluations',    // évaluations SIRH
  // ── FIX v151 : Tombstones ─────────────────────────────────────────
  'gc-tombstones',          // IDs supprimés intentionnellement (ne régresse jamais)
  // ── FIX v153b : Clés collaboratives cross-machine manquantes ──────
  'gc-files',               // catalogs fichiers partagés
  'gc-schema-version',      // version schéma synchronisation
  'gc-auto-backup-enabled', // activation backup auto
  'gc-auto-backup-interval',// intervalle backup auto
  'gc-printers',            // liste imprimantes partagées
  'gc-print-queue',         // queue impression partagée
  'gc-prefill-facture',     // templates facture préremplie
  'gc-bureau-lastvisits',   // derniers bureaux visités
  'gc-kpi-alerts',          // alertes KPI partagées
  'gc-kpi-dg-view',         // vue KPI direction générale
  'gc-si-source',           // source SI configurée
  'gc-ai-delays',           // délais IA configurés
  'gc-anti-redondance-v1',  // anti-redondance données
]);

function isSharedKey(key) {
  if (!key) return false;
  if (SHARED_KEYS.has(key)) return true;
  if (key.startsWith('gc-notif-')) return true;
  // Clés aliasées
  if (key === 'users' || key === 'dossiers' || key === 'taches' || key === 'rdvs' || key === 'pendingApprovals' || key === 'partners' || key === 'standaloneDocuments' || key === 'notifications') return true;
  return false;
}

// ── FIX v151 : Tombstone helpers ────────────────────────────────────────────
const TOMBSTONE_LS_KEY = 'gc-tombstones';
function _loadTombstones() {
  try { return JSON.parse(_lsGet(TOMBSTONE_LS_KEY) || '{}'); } catch { return {}; }
}
function _saveTombstones(t) {
  try { _lsSet(TOMBSTONE_LS_KEY, JSON.stringify(t)); } catch {}
  if (_online) {
    fetch(`${getProxyUrl()}/api/data/${encodeURIComponent(TOMBSTONE_LS_KEY)}`, {
      method: 'POST', headers: getRequestHeaders(),
      body: JSON.stringify({ value: t }), signal: AbortSignal.timeout(6000),
    }).catch(() => {});
  }
}
export function dsMarkDeleted(listKey, ids) {
  if (!listKey) return;
  const id_arr = Array.isArray(ids) ? ids : [ids];
  const t = _loadTombstones();
  const existing = new Set(t[listKey] || []);
  id_arr.forEach(id => { if (id) existing.add(String(id)); });
  t[listKey] = [...existing].slice(-5000);
  _saveTombstones(t);
}
export async function dsDeleteItem(listKey, id, newList) {
  dsMarkDeleted(listKey, id);
  // FIX v152 — forceOverwrite:true pour que ni le client ni le serveur
  // ne "regonflent" la liste avec l'item supprimé intentionnellement.
  return dsSave(listKey, newList, null, { forceOverwrite: true });
}

// FIX v152 — Suppression chirurgicale d'un item sans passer la nouvelle liste en argument.
// Charge la liste courante depuis LS/cache, filtre l'item, et persiste avec forceOverwrite.
// Aussi déclenche la suppression côté serveur via le nouvel endpoint DELETE item.
export async function dsDeleteItemFromArray(listKey, itemId, userId = null) {
  if (!listKey || !itemId) return { ok: false, reason: 'listKey et itemId requis' };

  // 1. Enregistrer tombstone IMMÉDIATEMENT (garantie que ni client ni serveur ne le ressuscitent)
  dsMarkDeleted(listKey, itemId);

  // 2. Supprimer côté serveur en premier (endpoint atomique + tombstone serveur)
  if (_online) {
    try {
      await fetch(
        `${getProxyUrl()}/api/data/${encodeURIComponent(listKey)}/item/${encodeURIComponent(itemId)}`,
        { method: 'DELETE', headers: getRequestHeaders(), signal: AbortSignal.timeout(8000) }
      );
    } catch (_) { /* continue avec suppression locale */ }
  }

  // 3. Mettre à jour localement
  const current = dsLoad(listKey) || [];
  const newList = current.filter(item => item?.id && String(item.id) !== String(itemId));
  return dsSave(listKey, newList, userId, { forceOverwrite: true });
}
export function dsClearTombstones() {
  try { _lsSet(TOMBSTONE_LS_KEY, '{}'); } catch {}
  if (_online) {
    fetch(`${getProxyUrl()}/api/data/${encodeURIComponent(TOMBSTONE_LS_KEY)}`, {
      method: 'POST', headers: getRequestHeaders(),
      body: JSON.stringify({ value: {} }), signal: AbortSignal.timeout(6000),
    }).catch(() => {});
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// [D2] Récupérer JWT token depuis localStorage
export function getJWTToken() {
  try {
    return _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || null;
  } catch { return null; }
}

export function getRequestHeaders(extra = {}) {
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
const _pendingGets = new Map(); // key → Promise (déduplication dsGet globale)
const _rateLimitState = new Map(); // key → { until:number, fails:number }

const REGRESSION_KEYS = new Set(['users', 'dossiers', 'taches', 'rdvs', 'partners', 'gc-users']);
function isArrayOfObjectsWithIds(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => item && typeof item === 'object' && (typeof item.id === 'string' || typeof item.id === 'number'));
}
function shouldProtectAgainstRegression(key, value) {
  return REGRESSION_KEYS.has(key) || (isSharedKey(key) && isArrayOfObjectsWithIds(value));
}

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

let _offlineFlushInFlight = false;
let _offlineRetryTimer = null;

async function flushOfflineQueue() {
  if (_offlineFlushInFlight || !_online) return { ok: false, reason: 'busy-or-offline' };
  const queue = loadOfflineQueue();
  if (!queue.length) return { ok: true, synced: 0, total: 0 };

  _offlineFlushInFlight = true;
  try {
    const batch = queue.slice(0, OFFLINE_FLUSH_BATCH_SIZE);
    const tail = queue.slice(OFFLINE_FLUSH_BATCH_SIZE);

    const saveRemaining = (syncedCount) => {
      const remainingBatch = batch.slice(Math.max(0, syncedCount));
      saveOfflineQueue([...remainingBatch, ...tail]);
      return syncedCount;
    };

    if (_socketReady && _socket) {
      try {
        const result = await new Promise((resolve, reject) => {
          let timeout = null;
          const onResult = (payload) => {
            cleanup();
            if (payload && typeof payload.synced === 'number') return resolve(payload);
            resolve({ synced: 0, total: batch.length });
          };
          const cleanup = () => {
            if (timeout) clearTimeout(timeout);
            _socket.off('flush_result', onResult);
          };
          timeout = setTimeout(() => {
            cleanup();
            reject(new Error('flush_result timeout'));
          }, DS_SAVE_TIMEOUT_MS);
          _socket.on('flush_result', onResult);
          _socket.emit('flush_offline_queue', batch);
        });

        const synced = saveRemaining(result.synced ?? 0);
        if (synced > 0) {
          console.log(`[DS] ✅ Flush offline WS: ${synced}/${queue.length}`);
        }
        return { ok: true, synced, total: queue.length };
      } catch (e) {
        console.warn('[DS] WebSocket flush failed, fallback HTTP:', e?.message);
      }
    }

    let synced = 0;
    const remaining = [];

    for (const item of batch) {
      try {
        const r = await fetch(`${getProxyUrl()}/api/data/${encodeURIComponent(item.key)}`, {
          method:  'POST',
          headers: getRequestHeaders(),
          body:    JSON.stringify({ value: item.value, userId: item.userId ?? null }),
          signal:  AbortSignal.timeout(DS_SAVE_TIMEOUT_MS),
        });
        if (!r.ok) {
          remaining.push(item);
          if (r.status === 429 || r.status >= 500) {
            remaining.push(...batch.slice(batch.indexOf(item) + 1));
            break;
          }
        } else {
          synced += 1;
          _cache.set(item.key, { data: item.value, ts: Date.now() });
        }
      } catch {
        remaining.push(item);
      }
    }

    saveOfflineQueue([...remaining, ...tail]);
    if (synced > 0) {
      console.log(`[DS] ✅ Flush offline HTTP: ${synced}/${queue.length}`);
    }
    return { ok: true, synced, total: queue.length };
  } finally {
    _offlineFlushInFlight = false;
  }
}

function startOfflineRetryLoop() {
  if (_offlineRetryTimer) return;
  _offlineRetryTimer = setInterval(() => {
    flushOfflineQueue().catch(() => {});
  }, OFFLINE_RETRY_INTERVAL_MS);
}

function stopOfflineRetryLoop() {
  if (_offlineRetryTimer) {
    clearInterval(_offlineRetryTimer);
    _offlineRetryTimer = null;
  }
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

      // Flusher la file d'attente offline de façon fiable (HTTP + retry)
      flushOfflineQueue().catch(() => {});
    });

    _socket.on('disconnect', (reason) => {
      _socketReady = false;
      console.log(`[DS] WebSocket déconnecté (${reason}) — mode offline`);
    });

    // Notification changement de données → invalider cache + notifier React
    _socket.on('data_changed', ({ key, action, by, ts, updatedAt, itemId }) => {
      if (!key) return;

      // Protection contre les régressions temps-réel :
      // si notre dernière écriture locale est plus récente que ce broadcast, on ignore.
      if (action === 'set') {
        try {
          const localWriteTs = parseInt(_lsGet('__ts__:' + key) || '0');
          const serverBroadcastTs = updatedAt || ts || 0;
          if (localWriteTs > serverBroadcastTs) {
            // Notre donnée locale est plus récente — ne pas invalider le cache
            return;
          }
        } catch {}
      }

      _cache.delete(key);
      _pendingFetches.delete(key);

      // FIX v152 — Propagation tombstone inter-machines :
      // Quand un item est supprimé sur une autre machine (action=item_delete),
      // enregistrer immédiatement le tombstone en localStorage local pour que
      // l'anti-régression client n'essaie pas de le "restaurer" lors d'un dsSave.
      if (action === 'item_delete' && itemId) {
        try {
          const t = _loadTombstones();
          const existing = new Set(t[key] || []);
          existing.add(String(itemId));
          t[key] = [...existing].slice(-5000);
          _lsSet(TOMBSTONE_LS_KEY, JSON.stringify(t));
        } catch {}
      }

      // Quand gc-tombstones change sur le serveur (suppression depuis une autre machine),
      // re-fetcher pour mettre à jour le localStorage local.
      if (key === TOMBSTONE_LS_KEY) {
        dsGet(TOMBSTONE_LS_KEY, {}).then(serverTombstones => {
          if (serverTombstones && typeof serverTombstones === 'object') {
            try { _lsSet(TOMBSTONE_LS_KEY, JSON.stringify(serverTombstones)); } catch {}
          }
        }).catch(() => {});
      }

      _syncListeners.forEach(fn => {
        try { fn({ key, action, by, ts, itemId }); } catch {}
      });
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: `__GC__${key}`,
          newValue: JSON.stringify({ ts, action }),
        }));
      } catch {}
    });

    // FIX SYNC-F1 — file_uploaded : invalider cache des clés fichiers + notifier composants
    _socket.on('file_uploaded', (data) => {
      // Invalider les clés liées aux fichiers pour forcer un re-fetch
      const fileKeys = ['gc-dossier-files', 'gc-files', 'gc-docs-unified', 'gc-standalone-docs'];
      if (data?.module) {
        if (data.module === 'sirh')   fileKeys.push('gc-sirh-fichiers');
        if (data.module === 'crm')    fileKeys.push('gc-crm-interactions');
        if (data.module === 'docs')   fileKeys.push('gc-docs-unified');
        if (data.module === 'logistique') fileKeys.push('gc-stocks');
      }
      fileKeys.forEach(k => {
        _cache.delete(k);
        _pendingFetches.delete(k);
      });
      // Notifier tous les listeners (composants React et hooks)
      _syncListeners.forEach(fn => {
        try { fn({ key: data?.dossierId ? 'gc-dossier-files' : 'gc-files', action: 'file_uploaded', type: 'file_uploaded', ...data }); } catch {}
      });
      // Dispatch StorageEvent pour les composants qui écoutent via useRemoteSync
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: '__GC__gc-dossier-files',
          newValue: JSON.stringify({ ts: Date.now(), action: 'file_uploaded' }),
        }));
        window.dispatchEvent(new StorageEvent('storage', {
          key: '__GC__gc-files',
          newValue: JSON.stringify({ ts: Date.now(), action: 'file_uploaded' }),
        }));
      } catch {}
    });

    // FIX SYNC-F2 — file_deleted : nettoyer l'IDB local + notifier composants
    _socket.on('file_deleted', ({ id, ts }) => {
      if (!id) return;
      // Supprimer de l'IDB local (import dynamique pour éviter dépendance circulaire)
      try {
        import('./filestore.js').then(({ gcFileDeleteLocal }) => {
          if (gcFileDeleteLocal) gcFileDeleteLocal(id).catch(() => {});
        }).catch(() => {});
      } catch {}
      // Invalider cache fichiers
      ['gc-dossier-files', 'gc-files', 'gc-docs-unified', 'gc-standalone-docs'].forEach(k => {
        _cache.delete(k);
        _pendingFetches.delete(k);
      });
      _syncListeners.forEach(fn => {
        try { fn({ key: 'gc-files', action: 'file_deleted', fileId: id, ts }); } catch {}
      });
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: '__GC__gc-dossier-files',
          newValue: JSON.stringify({ ts: ts || Date.now(), action: 'file_deleted', fileId: id }),
        }));
      } catch {}
    });

    // FIX SYNC-A2 — Resync global déclenché par l'admin : vider le cache + notifier hooks
    _socket.on('resync_all', ({ by, ts, reason }) => {
      console.log(`[DS] Resync global demandé par ${by} (${reason})`);
      _cache.clear();
      _pendingFetches.clear();
      _syncListeners.forEach(fn => {
        try { fn({ key: '__all__', action: 'force_resync', ts, by }); } catch {}
      });
      // Dispatch custom event pour AppRoot si abonné
      try { window.dispatchEvent(new CustomEvent('gc-resync-all', { detail: { by, ts, reason } })); } catch {}
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
      const t = setTimeout(() => ctrl.abort(), DS_HEALTH_TIMEOUT_MS);
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
    await flushOfflineQueue();
    console.log('[DS] ✅ Synchronisation SQLite activée');
    // Signaler à tous les useSyncedState hooks que la connexion est prête → re-fetch serveur
    try { window.dispatchEvent(new CustomEvent('gc-sync-online')); } catch (_) {}
  } else {
    console.log('[DS] ℹ️  Mode offline — données locales actives');
  }
  startOfflineRetryLoop();
  dsRegisterNotifSync();
  return { online, synced: 0 };
}

export function dsOnSync(fn) {
  _syncListeners.add(fn);
  return () => _syncListeners.delete(fn);
}

// ── Resync forcé ─────────────────────────────────────────────────────────────
// FIX SYNC-R1 — Resync complet : vide tout le cache + re-fetch toutes les clés actives.
// Utilisé par le panneau admin ou après détection d'incohérence.
export async function dsForceResyncAll() {
  _cache.clear();
  _pendingFetches.clear();
  const online = await checkProxy();
  if (!online) return { ok: false, reason: 'offline' };
  // Flush la file offline d'abord
  await flushOfflineQueue().catch(() => {});
  // Notifier tous les hooks de rafraîchir
  _syncListeners.forEach(fn => {
    try { fn({ key: '__all__', action: 'force_resync', ts: Date.now() }); } catch {}
  });
  // Déclencher re-fetch des clés les plus critiques
  const criticalKeys = [
    'users', 'gc-users', 'dossiers', 'taches', 'rdvs',
    'gc-dossier-files', 'gc-files', 'gc-docs-unified', 'gc-notifications',
    'gc-messages-global', 'gc-presence',
  ];
  const results = await Promise.allSettled(
    criticalKeys.map(k => dsGet(k, null).then(v => {
      if (v !== null) {
        _cache.set(k, { value: v, ts: Date.now() });
        try {
          window.dispatchEvent(new StorageEvent('storage', {
            key: `__GC__${k}`,
            newValue: JSON.stringify({ ts: Date.now(), action: 'force_resync' }),
          }));
        } catch {}
      }
      return { key: k, ok: true };
    }))
  );
  const synced = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[DS] Force resync : ${synced}/${criticalKeys.length} clés rafraîchies`);
  return { ok: true, synced, total: criticalKeys.length };
}

// ── Statut synchronisation ────────────────────────────────────────────────────
// FIX SYNC-R2 — Expose l'état complet de la sync pour le panneau admin.
export function dsGetSyncStatus() {
  const queue = loadOfflineQueue();
  return {
    online:         _online,
    socketReady:    _socketReady,
    socketId:       _socket?.id || null,
    cacheSize:      _cache.size,
    offlineQueue:   queue.length,
    proxyUrl:       PROXY_URL,
    pendingFetches: _pendingFetches.size,
    ts:             Date.now(),
  };
}

// [D4] dsStartSync — l'ancien code ajoutait onUpdate sans le retirer.
// Désormais on retourne un unsub propre ET on évite les doublons.
export function dsStartSync(onUpdate) {
  let unsub = null;
  if (onUpdate) {
    _syncListeners.add(onUpdate);
    unsub = () => _syncListeners.delete(onUpdate);
  }

  startOfflineRetryLoop();

  // FIX SYNC-P1 — Heartbeat resync toutes les 60s pour les clients passifs.
  // Invalide le cache des clés critiques pour forcer un re-fetch discret en arrière-plan.
  // Évite qu'un client reste "bloqué" sur des données périmées s'il a manqué des broadcasts.
  let _heartbeatTick = 0;
  const HEARTBEAT_KEYS = [
    'users', 'gc-users', 'dossiers', 'taches', 'gc-dossier-files', 'gc-files',
    'gc-notifications', 'gc-messages-global', 'gc-presence',
  ];

  const interval = setInterval(async () => {
    const nowOnline = await checkProxy();
    if (nowOnline && !_socketReady) {
      await initWebSocket();
    }
    if (nowOnline) {
      await flushOfflineQueue();
      // FIX SYNC-P1 : Toutes les 60s (6 ticks × 10s), invalider les clés critiques
      _heartbeatTick++;
      if (_heartbeatTick % 6 === 0) {
        HEARTBEAT_KEYS.forEach(k => {
          const cached = _cache.get(k);
          // N'invalider que si la donnée a plus de 45s (évite d'écraser un fetch récent)
          if (!cached || Date.now() - cached.ts > 45_000) {
            _cache.delete(k);
            _pendingFetches.delete(k);
          }
        });
        // Notifier les hooks pour qu'ils re-fetchent si abonnés
        _syncListeners.forEach(fn => {
          try { fn({ key: '__heartbeat__', action: 'heartbeat', ts: Date.now() }); } catch {}
        });
      }
    }
    if (!nowOnline && _online) {
      _online = false;
      console.log('[DS] Connexion perdue — mode offline');
    }
  }, 10_000);

  // Retourne une fonction de nettoyage complète
  return () => {
    clearInterval(interval);
    stopOfflineRetryLoop();
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
          .then(async serverVal => {
            let cleanedVal = serverVal;
            if (serverVal === null && key === 'users') {
              const gcUsers = await dsGet('gc-users', null);
              if (Array.isArray(gcUsers)) {
                cleanedVal = gcUsers.map(u => ({
                  id:            u.id,
                  alias:         u.username || u.alias || u.id,
                  name:          u.name || u.username || u.alias || u.id,
                  email:         u.email || '',
                  role:          u.role || 'Collaborateur',
                  level:         u.level ?? 1,
                  accountStatus: u.accountStatus || 'ACTIF',
                  passwordHash:  u.passwordHash || u.password || '',
                  isAdmin:       u.isAdmin || false,
                  isMG:          u.isMG || false,
                  process:       u.process || '',
                  processes:     u.processes || [],
                }));
              }
            }
            if (cleanedVal !== null) {
              // FIX v151 — Filtrer les IDs tombstonés depuis la réponse serveur
              if (Array.isArray(cleanedVal)) {
                const _t = _loadTombstones();
                const _tb = new Set(_t[key] || []);
                if (_tb.size > 0) {
                  cleanedVal = cleanedVal.filter(item => !item?.id || !_tb.has(String(item.id)));
                }
              }
              const localJson  = JSON.stringify(lsLoad(key, null));
              const serverJson = JSON.stringify(cleanedVal);
              if (localJson !== serverJson) {
                lsSave(key, cleanedVal);
                _cache.set(key, { data: cleanedVal, ts: Date.now() });
                try {
                  window.dispatchEvent(new StorageEvent('storage', {
                    key: `__GC__${key}`,
                    newValue: JSON.stringify(cleanedVal),
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
  const resolveStaleSafe = () => {
    const cached = _cache.get(key);
    if (cached && typeof cached.data !== 'undefined') return cached.data;
    // En cas de réseau lent / 429, ne pas "vider" l'UI avec [].
    // On préfère la dernière valeur locale connue.
    return lsLoad(key, fallback);
  };
  const now = Date.now();
  const rl = _rateLimitState.get(key);
  if (rl?.until && rl.until > now) {
    return resolveStaleSafe();
  }

  if (_pendingGets.has(key)) {
    return _pendingGets.get(key);
  }

  const req = (async () => {
    try {
      const r = await fetch(`${getProxyUrl()}/api/data/${encodeURIComponent(key)}`, {
        headers: getRequestHeaders(),
        signal:  AbortSignal.timeout(DS_GET_TIMEOUT_MS),
      });

      if (r.status === 404) return fallback; // clé absente = null propre
      if (r.status === 401) return fallback; // [D8] Non authentifié — traiter comme clé absente (fallback)

      if (r.status === 429) {
        const retryAfterRaw = Number(r.headers.get('retry-after') || 0);
        const prev = _rateLimitState.get(key);
        const fails = (prev?.fails || 0) + 1;
        const retryMs = retryAfterRaw > 0
          ? retryAfterRaw * 1000
          : Math.min(60_000, 5_000 * Math.pow(2, Math.max(0, fails - 1)));
        _rateLimitState.set(key, { until: Date.now() + retryMs, fails });
        console.warn(`[DS] Serveur 429 pour ${key} — pause ${Math.round(retryMs / 1000)}s`);
        return resolveStaleSafe();
      }

      if (!r.ok) {
        console.warn(`[DS] Serveur ${r.status} pour ${key}`);
        return resolveStaleSafe();
      }

      _rateLimitState.delete(key);
      const json = await r.json();
      const val  = json.value ?? fallback;
      _cache.set(key, { data: val, ts: Date.now() });
      // Stocker le timestamp serveur pour comparaison lors de l'hydratation
      if (json.updatedAt) try { _lsSet('__svts__:' + key, String(json.updatedAt)); } catch {}
      return val;
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`[DS] Réseau ${key}:`, e.message);
      return resolveStaleSafe();
    } finally {
      _pendingGets.delete(key);
    }
  })();

  _pendingGets.set(key, req);
  return req;
}

// FIX v152 — 4e param options = {} : forceOverwrite:true bypasse l'anti-régression
// pour les suppressions intentionnelles (dsDeleteItem, dsDeleteItemFromArray).
export async function dsSave(key, value, userId = null, options = {}) {
  lsSave(key, value);
  const _writeNow = Date.now();
  _cache.set(key, { data: value, ts: _writeNow });
  // Estampille locale : permet à l'hydratation de comparer avec updated_at serveur
  try { _lsSet('__ts__:' + key, String(_writeNow)); } catch {}

  if (!isSharedKey(key)) return { ok: true, local: true };

  if (!_online) {
    enqueueOffline(key, value, userId); // [D5] validation dans enqueueOffline
    startOfflineRetryLoop();
    return { ok: true, local: true, queued: true };
  }

  // ── FIX v140 BUG #3 — Merge défensif côté client ──────────────────────────
  // Avant d'envoyer au serveur, comparer avec le cache mémoire (dernière valeur
  // connue du serveur). Si la valeur locale est une régression évidente (tableau
  // beaucoup plus court), avertir et enrichir avec les données manquantes du cache.
  //
  // FIX v152 — forceOverwrite:true court-circuite ce garde-fou pour les suppressions
  // intentionnelles : l'appelant a déjà enregistré un tombstone, la liste réduite
  // est correcte et ne doit pas être regonflée par le merge.
  // ─────────────────────────────────────────────────────────────────────────────
  let sendValue = value;
  if (shouldProtectAgainstRegression(key, value) && Array.isArray(value) && !options.forceOverwrite) {
    let cached = _cache.get(key);
    let cachedData = cached?.data;
    if (!_online && !cachedData) {
      // If offline and without cache, preserve current local state only.
      cachedData = null;
    }
    if (!cachedData && _online) {
      try {
        const fresh = await dsGet(key, null);
        if (Array.isArray(fresh)) {
          cachedData = fresh;
          _cache.set(key, { data: fresh, ts: Date.now() });
        }
      } catch (_) {
        // ignore fetch failure, fallback to existing cache/local state
      }
    }
    // FIX BUG-SYNC-1 — Seuil abaissé : protéger même les petites listes (>= 2 items)
    // Ancien seuil : > 10 items ET < 80% → ne protégeait pas les petites listes.
    // Nouveau seuil : >= 2 items ET < 70% → conservateur, réduit les faux positifs
    // sur suppressions légitimes de plus de 20%.
    if (Array.isArray(cachedData) && cachedData.length >= 2 && value.length < cachedData.length * 0.7) {
      const incomingIds = new Set(value.map(item => item?.id).filter(Boolean));
      const _tombstones = _loadTombstones();
      const tombstonedIds = new Set(_tombstones[key] || []);
      const preserved = cachedData.filter(item => item?.id && !incomingIds.has(item.id) && !tombstonedIds.has(String(item.id)));
      if (preserved.length > 0) {
        // FIX BUG-B5 — Déduplication par ID après merge pour éviter les doublons
        const merged = [...value, ...preserved];
        const seenIds = new Set();
        sendValue = merged.filter(item => {
          const id = item?.id ? String(item.id) : null;
          if (!id) return true;
          if (seenIds.has(id)) return false;
          seenIds.add(id);
          return true;
        });
        console.warn(
          `[dsSave ANTI-REGRESSION v140+] Merge défensif client pour '${key}': ` +
          `local=${value.length}, cache=${cachedData.length}, envoi=${sendValue.length} (${preserved.length} préservés, ${tombstonedIds.size} tombstonés exclus)`
        );
        lsSave(key, sendValue);
        _cache.set(key, { data: sendValue, ts: Date.now() });
      }
    }
  }

  // Transmettre forceOverwrite au serveur via header pour court-circuiter l'anti-régression côté serveur
  const extraHeaders = options.forceOverwrite ? { 'x-force-overwrite': '1' } : {};
  try {
    const r = await fetch(`${getProxyUrl()}/api/data/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: getRequestHeaders(extraHeaders),
      body:    JSON.stringify({ value: sendValue, userId }),
      signal:  AbortSignal.timeout(DS_SAVE_TIMEOUT_MS),
    });
    if (!r.ok) {
      console.warn(`[DS] Serveur ${r.status} pour save ${key}`);
      enqueueOffline(key, sendValue, userId);
      startOfflineRetryLoop();
      return { ok: false, queued: true };
    }
    // Dès qu'on réussit un save en ligne, tenter aussi de vider la file en attente.
    flushOfflineQueue().catch(() => {});
    return { ok: true, synced: true };
  } catch (e) {
    if (e.name !== 'AbortError') console.warn(`[DS] Réseau save ${key}:`, e.message);
    enqueueOffline(key, sendValue, userId);
    startOfflineRetryLoop();
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

// FIX BUG-B8 — Sauvegarde de la liste users avec pruning explicite côté serveur.
// À appeler UNIQUEMENT par un admin lors de la suppression intentionnelle d'un compte.
// Le serveur retirera de gc-users les comptes absents de la nouvelle liste.
// Sécurité : le serveur vérifie req.user.level >= 6 || req.user.isAdmin.
export async function dsSaveUsersWithPrune(usersList, userId = null) {
  lsSave('users', usersList);
  _cache.set('users', { data: usersList, ts: Date.now() });
  if (!_online) {
    enqueueOffline('users', usersList, userId);
    startOfflineRetryLoop();
    return { ok: true, local: true, queued: true };
  }
  try {
    const r = await fetch(`${getProxyUrl()}/api/data/${encodeURIComponent('users')}`, {
      method:  'POST',
      headers: getRequestHeaders({ 'x-prune-users': '1', 'x-force-overwrite': '1' }),
      body:    JSON.stringify({ value: usersList, userId }),
      signal:  AbortSignal.timeout(DS_SAVE_TIMEOUT_MS),
    });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, pruned: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
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
  dsMarkDeleted, dsDeleteItem, dsDeleteItemFromArray, dsClearTombstones, dsSaveUsersWithPrune,
  gcSyncAuthUsers,
  SHARED_KEYS, getJWTToken, getRequestHeaders, getProxyUrl,
};
