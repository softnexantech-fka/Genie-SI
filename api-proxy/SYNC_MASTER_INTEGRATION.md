/**
 * INTÉGRATION SYNC-MASTER DANS API-PROXY
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Ces modifications doivent être apportées au fichier api-proxy.js pour activer
 * l'orchestrateur de synchronisation multi-postes.
 * 
 * Étapes d'intégration:
 * 1. Importer sync-master au début du fichier
 * 2. Enregistrer les routes après la déclaration d'Express
 * 3. Enregistrer les handlers WebSocket
 * 4. (Optionnel) Ajouter un endpoint d'info pour tester
 */

// ═════════════════════════════════════════════════════════════════════════════
// ÉTAPE 1: IMPORTER SYNC-MASTER (ligne ~50 du fichier)
// ═════════════════════════════════════════════════════════════════════════════

// Ajouter après les autres imports ESM:
import syncMaster from './sync-master.mjs';

// ═════════════════════════════════════════════════════════════════════════════
// ÉTAPE 2: ENREGISTRER LES ROUTES (après app.use(express.json), ~line 1200+)
// ═════════════════════════════════════════════════════════════════════════════

// Placer AVANT le démarrage du serveur (server.listen):
// [Vous avez déjà les routes '/api/data', '/api/files', etc. — ajouter ci-dessous]

// ── Sync Master Routes ──────────────────────────────────────────────────────
// POST /api/sync/purify-all        → Déclenche purification multi-clients
// GET  /api/sync/state-checksum    → Checksum intégrité serveur
// POST /api/sync/validate-client   → Client confirme validation
// GET  /api/sync/status            → État de la sync
syncMaster.registerSyncMasterRoutes(app, io);

// ═════════════════════════════════════════════════════════════════════════════
// ÉTAPE 3: ENREGISTRER LES HANDLERS WEBSOCKET (après io.on('connection'))
// ═════════════════════════════════════════════════════════════════════════════

// Ajouter à la fin du bloc io.on('connection', (socket) => { ... }):
// (au même niveau que socket.on('identify', ...) et socket.on('flush_offline_queue', ...))

syncMaster.registerSyncMasterWebSocket(io);

// ═════════════════════════════════════════════════════════════════════════════
// ÉTAPE 4: DÉMARRER LE SERVEUR AVEC LOG (avant server.listen())
// ═════════════════════════════════════════════════════════════════════════════

console.log(`[SyncMaster] ✅ Orchestrateur de synchronisation multi-postes activé`);
console.log(`[SyncMaster] Routes disponibles:`);
console.log(`  POST /api/sync/purify-all              → Lancer purification globale`);
console.log(`  GET  /api/sync/state-checksum          → Obtenir checksum serveur`);
console.log(`  POST /api/sync/validate-client         → Validation client`);
console.log(`  GET  /api/sync/status                  → État sync`);
console.log(`[SyncMaster] WebSocket events:`);
console.log(`  Broadcast → gc-purify-order            (Ordre purification → tous clients)`);
console.log(`  Client   → gc-client-validate          (Validation → serveur)`);
console.log(`  Broadcast → wipe-registry-update       (Mise à jour registry)`);

// ═════════════════════════════════════════════════════════════════════════════
// EXEMPLE COMPLET DE DÉMARRAGE
// ═════════════════════════════════════════════════════════════════════════════

/*
  // À la fin du fichier, dans la fonction start():
  
  await initDatabase();
  
  // ... autre code de boot ...
  
  // NOUVELLES LIGNES:
  syncMaster.registerSyncMasterRoutes(app, io);
  syncMaster.registerSyncMasterWebSocket(io);
  
  console.log(`[SyncMaster] ✅ Orchestrateur activé`);
  
  // ... reste du code ...
  
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur SI Génie v${PROXY_VERSION} écoute sur le port ${PORT}`);
    console.log(`📍 http://192.168.1.133:${PORT}`);
    console.log(`[SyncMaster] Mode multi-postes activé`);
    
    // Démarrer la surveillance disque (si applicable)
    startDiskMonitoring();
  });
*/

// ═════════════════════════════════════════════════════════════════════════════
// TESTS POST-INTÉGRATION
// ═════════════════════════════════════════════════════════════════════════════

/*
  CURL TESTS (terminal):
  
  1. Vérifier que le serveur a démarré:
     curl http://192.168.1.133:3001/health
     
  2. Obtenir le checksum serveur:
     curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
          http://192.168.1.133:3001/api/sync/state-checksum
     
  3. Obtenir l'état de sync:
     curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
          http://192.168.1.133:3001/api/sync/status
     
  4. Lancer une purification (ADMIN ONLY, level 5+):
     curl -X POST -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
          -H "Content-Type: application/json" \
          -d '{"options": {"clearTombstones": true, "mode": "merge"}}' \
          http://192.168.1.133:3001/api/sync/purify-all
*/

// ═════════════════════════════════════════════════════════════════════════════
// NOTES DE SÉCURITÉ
// ═════════════════════════════════════════════════════════════════════════════

/*
  1. /api/sync/purify-all requiert level >= 5 (Directeur)
  2. Les checksum utilisent SHA-256 pour l'intégrité
  3. Les wipe-registry sont persistés et diffusés à la reconexion
  4. Les clients sont validés par JWT avant toute opération
  5. Audit trail complet : toutes les purifications sont loggées
*/

// ═════════════════════════════════════════════════════════════════════════════
// TROUBLESHOOTING
// ═════════════════════════════════════════════════════════════════════════════

/*
  ERREUR: "[SyncMaster] Routes not found"
  FIX: Vérifier que syncMaster.registerSyncMasterRoutes() est appelé AVANT server.listen()
  
  ERREUR: "Cannot find module './sync-master.mjs'"
  FIX: Vérifier que le fichier api-proxy/sync-master.mjs existe
  
  ERREUR: "Tous les clients convergents" mais pas d'état unifié
  FIX: Attendre 30+ secondes après purification pour le checkpoint complet
  
  ERREUR: "Client valide mais checksum diverge"
  FIX: Forcer resync sur client divergent: POST /api/sync/resync-all
*/
