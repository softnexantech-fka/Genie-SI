import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupPath = path.join(__dirname, 'data', 'backups', 'genie_si_backup_2026-06-12.db');

console.log('\n' + '═'.repeat(70));
console.log('🔍 VÉRIFICATION BACKUP ANCIEN');
console.log('═'.repeat(70) + '\n');

try {
  const db = new Database(backupPath, { timeout: 5000 });

  // Chercher les comptes
  console.log('👤 Recherche comptes dans le backup...\n');

  // Vérifier la structure
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log(`Tables: ${tables.map(t => t.name).join(', ')}\n`);

  // Vérifier si si_data existe
  const siDataTest = db.prepare('SELECT COUNT(*) as cnt FROM si_data').get();
  console.log(`Rows dans si_data: ${siDataTest.cnt}\n`);

  // Afficher toutes les clés
  const allRows = db.prepare('SELECT key FROM si_data ORDER BY key').all();
  console.log(`Clés disponibles: ${allRows.map(r => r.key).join(', ')}\n`);

  // Extraire users et gc-users
  console.log('═'.repeat(70));
  console.log('📊 EXTRACTION DES COMPTES');
  console.log('═'.repeat(70) + '\n');

  let usersFound = false;
  let gcUsersFound = false;

  // Essayer différentes structures (au cas où)
  try {
    const usersData = db.prepare('SELECT * FROM si_data WHERE key = ?').get('users');
    if (usersData) {
      usersFound = true;
      console.log('✅ Clé "users" trouvée!');
      
      // Essayer json column
      if (usersData.json) {
        const parsed = JSON.parse(usersData.json);
        console.log(`   Type: ${Array.isArray(parsed) ? 'ARRAY' : 'OBJECT'}`);
        console.log(`   Contenu:\n${JSON.stringify(parsed, null, 2)}\n`);
      }
      // Essayer value column
      else if (usersData.value) {
        const parsed = JSON.parse(usersData.value);
        console.log(`   Type: ${Array.isArray(parsed) ? 'ARRAY' : 'OBJECT'}`);
        console.log(`   Contenu:\n${JSON.stringify(parsed, null, 2)}\n`);
      }
    }
  } catch (e) {
    console.log(`⚠️  Erreur lecture 'users': ${e.message}`);
  }

  try {
    const gcUsersData = db.prepare('SELECT * FROM si_data WHERE key = ?').get('gc-users');
    if (gcUsersData) {
      gcUsersFound = true;
      console.log('✅ Clé "gc-users" trouvée!');
      
      if (gcUsersData.json) {
        const parsed = JSON.parse(gcUsersData.json);
        console.log(`   Type: ${Array.isArray(parsed) ? 'ARRAY' : 'OBJECT'}`);
        console.log(`   Contenu:\n${JSON.stringify(parsed, null, 2)}\n`);
      }
      else if (gcUsersData.value) {
        const parsed = JSON.parse(gcUsersData.value);
        console.log(`   Type: ${Array.isArray(parsed) ? 'ARRAY' : 'OBJECT'}`);
        console.log(`   Contenu:\n${JSON.stringify(parsed, null, 2)}\n`);
      }
    }
  } catch (e) {
    console.log(`⚠️  Erreur lecture 'gc-users': ${e.message}`);
  }

  if (!usersFound) console.log('❌ Clé "users" NON trouvée');
  if (!gcUsersFound) console.log('❌ Clé "gc-users" NON trouvée');

  db.close();
  process.exit(0);

} catch (err) {
  console.error('❌ ERREUR:', err.message);
  process.exit(1);
}
