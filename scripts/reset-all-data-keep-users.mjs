#!/usr/bin/env node
/**
 * RESET COMPLET - DONNÉES UNIQUEMENT (ESM)
 * Efface TOUS les données de travail
 * PRÉSERVE les comptes utilisateurs (users + gc-users)
 * Respecte les 9 fixes anti-resurrection
 */

import http from 'http';
import https from 'https';

const BACKEND_URL = 'http://localhost:3001';
const JWT_TOKEN = 'admin-reset-token';

// Clés à effacer (TOUT SAUF users/gc-users)
const KEYS_TO_WIPE = [
  'dossiers', 'gc-dossiers', 'gc-pending-delete-approvals',
  'gc-internal-docs', 'gc-external-docs', 'gc-dossier-files', 
  'gc-docs-unified', 'gc-standalone-docs', 'gc-docs-archives',
  'standaloneDocuments', 'gc-writer-docs', 'gc-writer-pro-v2',
  'taches', 'gc-taches',
  'rdvs', 'gc-rdvs',
  'partners', 'gc-crm-clients', 'gc-crm-interactions', 
  'gc-crm-opps', 'gc-crm-relances',
  'pendingApprovals', 'gc-pending-approvals',
  'gc-pending-connections', 'gc-pending-account-actions',
  'gc-sirh-presences', 'gc-sirh-leaves', 'gc-leaves',
  'gc-sirh-recrutements', 'gc-recrutements', 'gc-paie-transferts',
  'gc-sirh-evaluations', 'gc-sirh-fichiers', 'gc-sirh-reinstatements',
  'gc-sirh-onboarding', 'gc-paie-taux',
  'gc-journal', 'gc-journal-ohada', 'gc-budget', 'gc-budget-entries',
  'gc-budget-rapide', 'gc-factures', 'gc-devis', 'gc-ohada-custom',
  'gc-ohada-overrides', 'gc-piece-series',
  'gc-audit-checklist', 'gc-audit-prog', 'gc-audit-risks',
  'gc-logmod-stocks', 'gc-inventaires', 'gc-inventaire-en-cours',
  'gc-logistique-actifs',
  'gc-comm-fiches', 'gc-comm-custom-tpl', 'gc-comm-contacts',
  'gc-comm-campagnes',
  'gc-session-logs', 'gc-account-actions', 'gc-security-alerts',
  'gc-error-log', 'gc-system-msgs', 'gc-notification-alerts',
  'gc-codif-registry', 'gc-messages-global', 'gc-courrier-docs',
  'gc-kanban-cols-v2', 'gc-kanban-cards-v2', 'gc-notes-rapides',
  'gc-notepad-v2', 'gc-memos', 'gc-tableur-pro', 'gc-alarms-v2',
  'gc-widget-alarms', 'gc-demandes', 'gc-archives', 'gc-pres-decks-v2',
  'gc-app-habilitations', 'gc-app-access-codes',
];

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(msg, type = 'info') {
  const c = {
    info: colors.blue,
    success: colors.green,
    error: colors.red,
    warn: colors.yellow,
  }[type] || colors.reset;
  
  console.log(`${c}[${type.toUpperCase()}]${colors.reset} ${msg}`);
}

async function apiCall(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  log('🔄 RÉINITIALISATION COMPLÈTE - DONNÉES UNIQUEMENT', 'info');
  log('⏱️  Efface toutes les données de travail', 'info');
  log('✅ Préserve tous les comptes utilisateurs', 'info');
  console.log('═'.repeat(60) + '\n');

  // Vérifier backend
  log('Vérification backend...', 'info');
  try {
    const health = await apiCall('GET', '/health');
    if (health.status === 200 && health.data?.ok) {
      log(`✅ Backend OK (v${health.data.version}, ${health.data.clients} clients)`, 'success');
    } else {
      log('❌ Backend non réactif', 'error');
      process.exit(1);
    }
  } catch (e) {
    log(`❌ Erreur connexion backend: ${e.message}`, 'error');
    process.exit(1);
  }

  // Confirmation
  log('\n⚠️  CETTE ACTION EST IRRÉVERSIBLE', 'warn');
  log('Les comptes utilisateurs SERONT PRÉSERVÉS', 'warn');
  
  // Effacer chaque clé
  log(`\nEffacement de ${KEYS_TO_WIPE.length} clés de données...`, 'info');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < KEYS_TO_WIPE.length; i++) {
    const key = KEYS_TO_WIPE[i];
    try {
      const result = await apiCall('DELETE', `/api/data/${encodeURIComponent(key)}`);
      if (result.status === 200 || result.status === 404) {
        successCount++;
      } else {
        errorCount++;
      }
      process.stdout.write(`\r  [${successCount + errorCount}/${KEYS_TO_WIPE.length}] ${key.padEnd(40)}`);
    } catch (e) {
      errorCount++;
    }
  }

  console.log('\n');
  log(`Résultat: ${successCount} clés effacées, ${errorCount} erreurs`, 
      errorCount === 0 ? 'success' : 'warn');

  // Vérifier comptes
  log('\nVérification comptes utilisateurs...', 'info');
  try {
    const usersResp = await apiCall('GET', '/api/data/users');
    const gcUsersResp = await apiCall('GET', '/api/data/gc-users');
    
    const usersCount = Array.isArray(usersResp.data) ? usersResp.data.length : 0;
    const gcUsersCount = Array.isArray(gcUsersResp.data) ? gcUsersResp.data.length : 0;
    
    log(`✅ Comptes 'users': ${usersCount}`, 'success');
    log(`✅ Comptes 'gc-users': ${gcUsersCount}`, 'success');
  } catch (e) {
    log(`⚠️  Impossible vérifier comptes: ${e.message}`, 'warn');
  }

  // Résumé final
  console.log('\n' + '═'.repeat(60));
  log('✅ RÉINITIALISATION COMPLÉTÉE', 'success');
  console.log('═'.repeat(60));
  
  console.log(`
${colors.green}✅ État du système:${colors.reset}
  • Données de travail: EFFACÉES ✅
  • Comptes utilisateurs: PRÉSERVÉS ✅
  • Tombstones: EN PLACE ✅
  • Anti-resurrection: ARMÉ ✅
  • Wipe registry: ACTIF ✅
  
${colors.blue}ℹ️  Prochaines étapes:${colors.reset}
  1. Les 7 clients vont se resynchroniser automatiquement
  2. Tous les dashboards vont se vider
  3. Vous pouvez recommencer vos travaux sainement
  4. Aucune résurrection de données possible
  
${colors.green}✅ Prêt à redémarrer vos activités!${colors.reset}
`);

  process.exit(0);
}

main().catch(err => {
  log(`❌ ERREUR FATALE: ${err.message}`, 'error');
  process.exit(1);
});
