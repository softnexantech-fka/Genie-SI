import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'si_genie.db');

console.log('\n' + '═'.repeat(70));
console.log('🔥 RÉINITIALISATION DIRECTE EN BASE DE DONNÉES');
console.log('═'.repeat(70) + '\n');

const db = new Database(dbPath);

try {
  // Backup avant wipe
  console.log('📦 Création backup avant reset...');
  const fs = await import('fs').then(m => m.promises);
  const backupPath = path.join(__dirname, 'data', `backups/si_genie_backup_${Date.now()}.db`);
  await fs.copyFile(dbPath, backupPath);
  console.log(`✅ Backup sauvegardé: ${backupPath}\n`);

  // Voir état avant
  console.log('📊 ÉTAT AVANT:');
  const tablesBefore = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  let totalBefore = 0;
  tablesBefore.forEach(t => {
    const result = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
    const count = result?.cnt || 0;
    totalBefore += count;
    if (count > 0) console.log(`  • ${t.name}: ${count} rows`);
  });
  console.log(`  ✅ TOTAL: ${totalBefore} rows\n`);

  // RESET: Vider si_data (WHERE key NOT IN users, gc-users)
  console.log('🗑️  Suppression des données de travail...');
  
  const deleteCount = db.prepare(`
    DELETE FROM si_data 
    WHERE key NOT IN ('users', 'gc-users')
  `).run();
  
  console.log(`✅ ${deleteCount.changes} lignes supprimées\n`);

  // Vider si_audit (logs)
  console.log('🗑️  Suppression des logs d\'audit...');
  const auditCount = db.prepare('DELETE FROM si_audit').run();
  console.log(`✅ ${auditCount.changes} logs supprimés\n`);

  // Vider si_offline_queue
  console.log('🗑️  Suppression offline queue...');
  const queueCount = db.prepare('DELETE FROM si_offline_queue').run();
  console.log(`✅ ${queueCount.changes} items queue supprimés\n`);

  // Voir état après
  console.log('📊 ÉTAT APRÈS:');
  const tablesAfter = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  let totalAfter = 0;
  tablesAfter.forEach(t => {
    const result = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
    const count = result?.cnt || 0;
    totalAfter += count;
    if (count > 0) console.log(`  • ${t.name}: ${count} rows`);
  });
  console.log(`  ✅ TOTAL: ${totalAfter} rows (avant: ${totalBefore})\n`);

  // Vérifier comptes préservés
  console.log('👤 VÉRIFICATION COMPTES PRÉSERVÉS:');
  const users = db.prepare('SELECT key, json FROM si_data WHERE key IN ("users", "gc-users")').all();
  users.forEach(row => {
    try {
      const data = JSON.parse(row.json);
      const count = Array.isArray(data) ? data.length : Object.keys(data).length;
      console.log(`  ✅ ${row.key}: ${count} items`);
    } catch {
      console.log(`  ⚠️  ${row.key}: format non analysable`);
    }
  });
  
  console.log('\n' + '═'.repeat(70));
  console.log('✅ RÉINITIALISATION RÉUSSIE!');
  console.log('═'.repeat(70));
  
  console.log(`
🎯 Résultats:
  • Données de travail: ${deleteCount.changes} items SUPPRIMÉS ✅
  • Logs d'audit: ${auditCount.changes} entries SUPPRIMÉES ✅
  • Offline queue: ${queueCount.changes} items SUPPRIMÉS ✅
  • Comptes utilisateurs: PRÉSERVÉS ✅
  
📁 Backup: ${backupPath}

🚀 Le système est PRÊT pour redémarrer!
  `);

  process.exit(0);

} catch (err) {
  console.error('\n❌ ERREUR:', err.message);
  console.error('\n', err);
  process.exit(1);
} finally {
  db.close();
}
