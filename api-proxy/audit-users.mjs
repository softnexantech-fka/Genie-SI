import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'si_genie.db');

console.log('\n' + '═'.repeat(70));
console.log('👤 AUDIT COMPTES UTILISATEURS');
console.log('═'.repeat(70) + '\n');

try {
  const db = new Database(dbPath);

  // Vérifier les données
  console.log('📊 CONTENU BASE DE DONNÉES:\n');
  
  const allData = db.prepare('SELECT key, json FROM si_data ORDER BY key').all();
  
  console.log(`Total clés: ${allData.length}\n`);
  
  allData.forEach(row => {
    console.log(`📍 Clé: ${row.key}`);
    try {
      const parsed = JSON.parse(row.json);
      
      if (typeof parsed === 'object' && parsed !== null) {
        if (Array.isArray(parsed)) {
          console.log(`   Type: ARRAY avec ${parsed.length} items`);
          if (parsed.length > 0) {
            console.log(`   Preview: ${JSON.stringify(parsed.slice(0, 1), null, 2).split('\n').slice(0, 5).join('\n   ')}`);
          }
        } else {
          const keys = Object.keys(parsed);
          console.log(`   Type: OBJECT avec ${keys.length} clés`);
          console.log(`   Clés: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
        }
      } else {
        console.log(`   Type: ${typeof parsed}`);
        console.log(`   Valeur: ${JSON.stringify(parsed)}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Format invalide: ${e.message}`);
    }
    console.log();
  });

  // Chercher spécifiquement les comptes
  console.log('\n' + '═'.repeat(70));
  console.log('👤 DÉTAIL COMPTES UTILISATEURS');
  console.log('═'.repeat(70) + '\n');

  const usersRow = db.prepare('SELECT json FROM si_data WHERE key = ?').get('users');
  const gcUsersRow = db.prepare('SELECT json FROM si_data WHERE key = ?').get('gc-users');

  if (usersRow) {
    console.log('📌 Clé "users":');
    try {
      const users = JSON.parse(usersRow.json);
      console.log(`   Nombre de comptes: ${Array.isArray(users) ? users.length : 'N/A'}`);
      if (Array.isArray(users) && users.length > 0) {
        console.log(`   Détail:\n${JSON.stringify(users, null, 2)}`);
      } else {
        console.log(`   Contenu: ${JSON.stringify(users)}`);
      }
    } catch (e) {
      console.log(`   Erreur: ${e.message}`);
    }
  } else {
    console.log('❌ Clé "users" NON TROUVÉE');
  }

  console.log('\n');

  if (gcUsersRow) {
    console.log('📌 Clé "gc-users":');
    try {
      const gcUsers = JSON.parse(gcUsersRow.json);
      console.log(`   Nombre de comptes: ${Array.isArray(gcUsers) ? gcUsers.length : 'N/A'}`);
      if (Array.isArray(gcUsers) && gcUsers.length > 0) {
        console.log(`   Détail:\n${JSON.stringify(gcUsers, null, 2)}`);
      } else {
        console.log(`   Contenu: ${JSON.stringify(gcUsers)}`);
      }
    } catch (e) {
      console.log(`   Erreur: ${e.message}`);
    }
  } else {
    console.log('❌ Clé "gc-users" NON TROUVÉE');
  }

  db.close();
  process.exit(0);

} catch (err) {
  console.error('❌ ERREUR:', err.message);
  process.exit(1);
}
