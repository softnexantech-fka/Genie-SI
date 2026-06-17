import Database from 'better-sqlite3';
import fs from 'fs';

const dbPath = './data/si_genie.db';
const db = new Database(dbPath);

console.log('\n📊 VÉRIFICATION BASE DE DONNÉES\n');

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  
  console.log(`Total tables: ${tables.length}\n`);
  
  let totalRows = 0;
  tables.forEach(t => {
    const result = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
    const count = result?.cnt || 0;
    totalRows += count;
    if (count > 0) {
      console.log(`⚠️  ${t.name}: ${count} rows`);
    } else {
      console.log(`✅ ${t.name}: 0 rows`);
    }
  });
  
  console.log(`\n📈 TOTAL: ${totalRows} rows dans la base`);
  
  // Vérifier le fichier DB
  const stats = fs.statSync(dbPath);
  console.log(`\n💾 Fichier DB: ${stats.size} bytes`);
  
  db.close();
  
} catch (err) {
  console.error('❌ ERREUR:', err.message);
  process.exit(1);
}
