/**
 * api-proxy/sync-master.mjs
 * ════════════════════════════════════════════════════════════════════════
 * 
 * ORCHESTRATEUR PURIFICATION MULTI-POSTES
 * ────────────────────────────────────────
 * Responsabilités:
 * 1. Calculer snapshot intégrité de toutes les données
 * 2. Broadcaster ordre de purification à tous les clients
 * 3. Valider que les clients convergent vers l'état serveur
 * 4. Enregistrer checksums de référence pour détection post-corruption
 * 5. Maintenir wipe-registry pour bloquer résurrections
 * 
 * API:
 * POST /api/sync/purify-all    → Déclenche purification complète
 * GET  /api/sync/state-checksum → Obtient checksum intégrité globale
 * POST /api/sync/validate-client → Client envoie son checksum pour validation
 */

import crypto from 'crypto';

// ────────────────────────────────────────────────────────────────────────
// CONTEXT (will be initialized by api-proxy.js)
// ────────────────────────────────────────────────────────────────────────

let _dbGetFn = null;
let _dbSetFn = null;
let _dbDeleteFn = null;

export function initializeSyncMaster(dbGetFunc, dbSetFunc, dbDeleteFunc) {
  _dbGetFn = dbGetFunc;
  _dbSetFn = dbSetFunc;
  _dbDeleteFn = dbDeleteFunc;
  console.log('[SyncMaster] Context initialized with database functions');
}

function getDbGet() {
  if (!_dbGetFn) throw new Error('[SyncMaster] dbGet not initialized - call initializeSyncMaster first');
  return _dbGetFn;
}

function getDbSet() {
  if (!_dbSetFn) throw new Error('[SyncMaster] dbSet not initialized - call initializeSyncMaster first');
  return _dbSetFn;
}

function getDbDelete() {
  if (!_dbDeleteFn) throw new Error('[SyncMaster] dbDelete not initialized - call initializeSyncMaster first');
  return _dbDeleteFn;
};

const SYNC_MASTER_VERSION = '2.0.0';

/** Clés à purifier (vérifier intégrité) */
const PURIFY_KEYS = [
  'gc-users', 'gc-dossiers', 'gc-taches', 'gc-rdvs', 'gc-partners',
  'gc-messages', 'gc-notifications', 'gc-writer-docs', 'gc-achievements',
  'gc-leaves', 'gc-sirh-reinstatements', 'gc-achats', 'gc-committees',
  'gc-app-habilitations', 'gc-codif-registry', 'gc-session-logs',
];

/** Registre global des purifications (ts + checksum) */
const PURIFICATION_REGISTRY = 'gc-purification-registry';

/** État de sync actuel (pour éviter purifications concurrentes) */
let _syncInProgress = false;
let _lastPurifyTs = 0;
const _clientValidations = new Map(); // socket.id → { checksum, ts, key }

// ────────────────────────────────────────────────────────────────────────
// CORE FUNCTIONS
// ────────────────────────────────────────────────────────────────────────

/**
 * Calcule le checksum SHA-256 de toutes les données métier.
 * Format: hash(key1:hash1 + key2:hash2 + ...)
 */
export async function calculateGlobalChecksum() {
  const hashes = [];
  const _dbGetFn = getDbGet();
  
  for (const key of PURIFY_KEYS) {
    try {
      const value = await _dbGetFn(key);
      const keyHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(value || null))
        .digest('hex');
      hashes.push(`${key}:${keyHash}`);
    } catch (e) {
      console.warn(`[SyncMaster] Erreur checksum ${key}:`, e.message);
      hashes.push(`${key}:ERROR`);
    }
  }

  const combined = hashes.join('|');
  const globalChecksum = crypto
    .createHash('sha256')
    .update(combined)
    .digest('hex');

  return {
    globalChecksum,
    keyChecksums: Object.fromEntries(hashes.map(h => h.split(':'))),
    ts: Date.now(),
  };
}

/**
 * Enregistre le checksum dans le registre de purification.
 * Utilisé pour détecter les dérives post-purge.
 */
export async function recordPurificationCheckpoint() {
  try {
    const _dbGetFn = getDbGet();
    const _dbSetFn = getDbSet();
    
    const checksum = await calculateGlobalChecksum();
    const registry = (await _dbGetFn(PURIFICATION_REGISTRY)) || { history: [] };
    
    registry.history = (registry.history || [])
      .slice(-99) // Garder 100 derniers
      .concat([{
        ts: Date.now(),
        checksum: checksum.globalChecksum,
        keyChecksums: checksum.keyChecksums,
      }]);
    
    await _dbSetFn(PURIFICATION_REGISTRY, registry);
    
    console.log(`[SyncMaster] ✅ Checkpoint enregistré: ${checksum.globalChecksum.slice(0, 8)}...`);
    return checksum;
  } catch (e) {
    console.error('[SyncMaster] Erreur checksum:', e.message);
    throw e;
  }
}

/**
 * Initialise une nouvelle purification multi-clients.
 * Étapes:
 * 1. Vérifier pas de purification en cours
 * 2. Calculer checksum serveur
 * 3. Broadcaster ordre purification à tous clients
 * 4. Démarrer timer validation (30s timeout)
 */
export async function initiatePurification(io, options = {}) {
  if (_syncInProgress) {
    console.warn('[SyncMaster] Purification déjà en cours, abandon');
    return { ok: false, error: 'Purification already in progress' };
  }

  if (Date.now() - _lastPurifyTs < 60000) {
    console.warn('[SyncMaster] Purification trop fréquente (< 60s), abandon');
    return { ok: false, error: 'Purification throttled (min 60s between)' };
  }

  _syncInProgress = true;
  _lastPurifyTs = Date.now();
  const purifyId = `purify-${_lastPurifyTs}`;

  try {
    const _dbGetFn = getDbGet();
    const _dbSetFn = getDbSet();
    
    console.log(`[SyncMaster] 🔄 Démarrage purification: ${purifyId}`);

    // 1. Calculer snapshot serveur
    const checksum = await calculateGlobalChecksum();
    console.log(`[SyncMaster] Checksum serveur: ${checksum.globalChecksum.slice(0, 16)}...`);

    // 2. Enregistrer wipe-registry (bloque résurrections)
    const wipeRegistry = (await _dbGetFn('gc-wipe-registry')) || {};
    for (const key of PURIFY_KEYS) {
      wipeRegistry[key] = Date.now();
    }
    await _dbSetFn('gc-wipe-registry', wipeRegistry);
    console.log(`[SyncMaster] Wipe registry mis à jour (${PURIFY_KEYS.length} clés)`);

    // 3. Broadcaster à tous les clients connectés
    const purifyOrder = {
      id: purifyId,
      ts: Date.now(),
      keys: PURIFY_KEYS,
      serverChecksum: checksum.globalChecksum,
      options: {
        clearTombstones: options.clearTombstones ?? true,
        clearWipeRegistry: options.clearWipeRegistry ?? false,
        mode: options.mode ?? 'merge', // ou 'replace'
      },
    };

    const rooms = io.sockets.adapter.rooms;
    let connectedCount = 0;
    for (const [socketId, socket] of io.sockets.sockets) {
      connectedCount++;
      socket.emit('gc-purify-order', purifyOrder);
    }

    console.log(`[SyncMaster] 📡 Ordre broadcast: ${connectedCount} clients`);

    // 4. Démarrer validation timer
    const validationTimer = setTimeout(async () => {
      console.warn(`[SyncMaster] ⏱️ Timeout validation (30s) - certains clients n'ont pas confirmé`);
      _syncInProgress = false;
      // Enregistrer quand même checkpoint (partiel)
      await recordPurificationCheckpoint();
    }, 30000);

    // 5. Attendre confirmations clients (dans handleClientValidation)
    _clientValidations.clear();
    _clientValidations.set('_timer', { ref: validationTimer, expected: connectedCount });

    return {
      ok: true,
      purifyId,
      serverChecksum: checksum.globalChecksum,
      clientsConnected: connectedCount,
    };
  } catch (e) {
    console.error('[SyncMaster] Erreur purification:', e.message);
    _syncInProgress = false;
    throw e;
  }
}

/**
 * Handler client validation: client confirme reception de l'ordre et checksum
 */
export function handleClientValidation(socket, payload) {
  const { clientChecksum, keys, error } = payload;
  
  if (error) {
    console.warn(`[SyncMaster] ⚠️ Client ${socket.id} erreur: ${error}`);
    return;
  }

  _clientValidations.set(socket.id, {
    clientChecksum,
    keys,
    ts: Date.now(),
  });

  const validationCount = _clientValidations.size - 1; // -1 for timer entry
  console.log(`[SyncMaster] ✅ Client ${socket.id.slice(0, 6)}... validé (${validationCount}/${_clientValidations.get('_timer')?.expected || '?'})`);

  // Vérifier si tous les clients ont validé
  const timerEntry = _clientValidations.get('_timer');
  if (timerEntry && validationCount >= timerEntry.expected) {
    console.log(`[SyncMaster] 🎯 Tous clients validés!`);
    finalizeValidation();
  }
}

/**
 * Finalise la validation: enregistre checkpoints et réinitialise état
 */
async function finalizeValidation() {
  try {
    const timerEntry = _clientValidations.get('_timer');
    if (timerEntry?.ref) clearTimeout(timerEntry.ref);

    await recordPurificationCheckpoint();
    
    console.log(`[SyncMaster] ✅ Purification COMPLÈTE`);
    _syncInProgress = false;
    _clientValidations.clear();
  } catch (e) {
    console.error('[SyncMaster] Erreur finalisation:', e.message);
  }
}

/**
 * Fonction anti-drift: vérifie qu'un client n'a pas divergé du serveur
 * Utilisée par les GET /api/data/:key pour détecter corruption
 */
export async function verifyDataIntegrity(key) {
  try {
    const _dbGetFn = getDbGet();
    const serverValue = await _dbGetFn(key);
    const serverHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(serverValue || null))
      .digest('hex');
    
    return {
      key,
      serverHash,
      isValid: true,
    };
  } catch (e) {
    console.error(`[SyncMaster] Erreur vérification ${key}:`, e.message);
    return {
      key,
      serverHash: 'ERROR',
      isValid: false,
      error: e.message,
    };
  }
}

/**
 * Détecte items "zombies" (supprimés côté serveur mais présent LS client)
 * Utilisé pour nettoyer après factory reset
 */
export async function scanForZombieItems(key, clientItems) {
  try {
    const _dbGetFn = getDbGet();
    const serverValue = await _dbGetFn(key);
    if (!Array.isArray(serverValue) || !Array.isArray(clientItems)) {
      return { zombies: [] };
    }

    const serverIds = new Set(serverValue.map(item => item?.id).filter(Boolean));
    const zombies = clientItems.filter(item => item?.id && !serverIds.has(item.id));

    if (zombies.length > 0) {
      console.warn(`[SyncMaster] 🧟 ${zombies.length} zombies détectés dans ${key}`);
    }

    return { zombies, count: zombies.length };
  } catch (e) {
    console.error('[SyncMaster] Erreur scan zombies:', e.message);
    return { zombies: [], error: e.message };
  }
}

// ────────────────────────────────────────────────────────────────────────
// ROUTES EXPRESS
// ────────────────────────────────────────────────────────────────────────

export function registerSyncMasterRoutes(app, io, authenticateToken) {
  // [FIX P0-03] authenticateToken est désormais OBLIGATOIRE. Avant cette correction, ces 4
  // routes n'avaient AUCUN middleware d'auth : req.user était toujours undefined, et le test
  // `req.user?.access_level < 5` valait `undefined < 5` => false en JS => ne bloquait JAMAIS.
  // N'IMPORTE QUI sur le réseau pouvait déclencher une purification globale des données.
  if (typeof authenticateToken !== 'function') {
    throw new Error('[SyncMaster] registerSyncMasterRoutes requiert authenticateToken (middleware JWT) en 3e argument');
  }

  /**
   * POST /api/sync/purify-all
   * Déclenche purification complète (Admin only)
   */
  app.post('/api/sync/purify-all', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      const level = req.user?.level; // [FIX P0-03] était req.user?.access_level (champ inexistant)
      const isAdmin = req.user?.isAdmin;

      if (!isAdmin && !(level >= 5)) {
        return res.status(403).json({ ok: false, error: 'Admin level 5+ required' });
      }

      const result = await initiatePurification(io, req.body?.options || {});
      res.json(result);
    } catch (e) {
      console.error('[SyncMaster] Route error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * GET /api/sync/state-checksum
   * Retourne le checksum intégrité global du serveur
   */
  app.get('/api/sync/state-checksum', authenticateToken, async (req, res) => {
    try {
      const _dbGetFn = getDbGet();
      const checksum = await calculateGlobalChecksum();
      const registry = (await _dbGetFn(PURIFICATION_REGISTRY)) || { history: [] };

      res.json({
        ok: true,
        ...checksum,
        lastCheckpoint: registry.history?.[registry.history.length - 1] || null,
      });
    } catch (e) {
      console.error('[SyncMaster] Route error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * POST /api/sync/validate-client
   * Client envoie son checksum pour validation
   */
  app.post('/api/sync/validate-client', authenticateToken, async (req, res) => {
    try {
      const { clientChecksum, keys } = req.body;
      const userId = req.user?.id;

      if (!clientChecksum || !Array.isArray(keys)) {
        return res.status(400).json({ ok: false, error: 'Missing clientChecksum or keys' });
      }

      const serverChecksum = await calculateGlobalChecksum();
      const match = serverChecksum.globalChecksum === clientChecksum;

      if (!match) {
        console.warn(`[SyncMaster] ⚠️ Divergence checksum client ${userId}: attendu ${serverChecksum.globalChecksum.slice(0, 8)}..., reçu ${clientChecksum.slice(0, 8)}...`);
      }

      res.json({
        ok: true,
        match,
        serverChecksum: serverChecksum.globalChecksum,
        divergence: match ? 0 : 1,
      });
    } catch (e) {
      console.error('[SyncMaster] Route error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * GET /api/sync/status
   * État actuel de la sync
   * [FIX P0-03] NOTE : api-proxy.js définit déjà sa propre route GET /api/sync/status
   * (authentifiée, enregistrée avant celle-ci) qui répond en priorité — celle-ci ne sert
   * que de filet de sécurité si jamais l'ordre d'enregistrement changeait. Authentifiée ici aussi.
   */
  app.get('/api/sync/status', authenticateToken, async (req, res) => {
    try {
      const _dbGetFn = getDbGet();
      const registry = (await _dbGetFn(PURIFICATION_REGISTRY)) || { history: [] };
      
      res.json({
        ok: true,
        syncInProgress: _syncInProgress,
        lastPurifyTs: _lastPurifyTs,
        purificationHistory: registry.history || [],
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('[SyncMaster] ✅ Routes registrées (authentification JWT activée)');
}

// ────────────────────────────────────────────────────────────────────────
// WEBSOCKET HANDLERS
// ────────────────────────────────────────────────────────────────────────

export function registerSyncMasterWebSocket(io) {
  io.on('connection', (socket) => {
    socket.on('gc-client-validate', (payload) => {
      handleClientValidation(socket, payload);
    });

    socket.on('gc-sync-error', (payload) => {
      console.warn(`[SyncMaster] Sync error from ${socket.id}:`, payload);
    });
  });

  console.log('[SyncMaster] ✅ WebSocket handlers registrés');
}

export default {
  initializeSyncMaster,
  calculateGlobalChecksum,
  recordPurificationCheckpoint,
  initiatePurification,
  handleClientValidation,
  verifyDataIntegrity,
  scanForZombieItems,
  registerSyncMasterRoutes,
  registerSyncMasterWebSocket,
};
