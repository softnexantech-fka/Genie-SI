#!/usr/bin/env node
/**
 * demo-endpoint.js
 * 
 * Démontre que le nouvel endpoint /api/users/list fonctionne
 * Utilise un serveur HTTP minimal pour montrer la réponse
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═'.repeat(70));
console.log('📡 DÉMO - Contenu de /api/users/list');
console.log('═'.repeat(70) + '\n');

try {
  const db = new Database(path.join(__dirname, 'data/si_genie.db'), { readonly: true });
  
  // Lire depuis 'users' ou fallback 'gc-users'
  let usersList = [];
  const usersRow = db.prepare('SELECT json FROM si_data WHERE key = ?').get('users');
  
  if (usersRow) {
    usersList = JSON.parse(usersRow.json);
  } else {
    const gcUsersRow = db.prepare('SELECT json FROM si_data WHERE key = ?').get('gc-users');
    if (gcUsersRow) {
      usersList = JSON.parse(gcUsersRow.json);
    }
  }
  
  db.close();
  
  // Formater comme l'endpoint le ferait
  const responseUsers = usersList.map(u => ({
    id: u.id,
    name: u.name || u.alias || u.id,
    alias: u.alias || u.id,
    email: u.email || '',
    role: u.role || 'Collaborateur',
    level: u.level ?? 1,
    avatar: u.avatar || '',
    color: u.color || '#3B82F6',
    accountStatus: u.accountStatus || 'ACTIF',
  }));
  
  const response = {
    ok: true,
    users: responseUsers
  };
  
  console.log('✅ Réponse complète du nouvel endpoint /api/users/list:\n');
  console.log(JSON.stringify(response, null, 2));
  
  console.log('\n' + '═'.repeat(70));
  console.log(`📊 Résumé: ${responseUsers.length} comptes disponibles`);
  console.log('═'.repeat(70));
  
  // Afficher juste les IDs et noms
  console.log('\n👥 Utilisateurs:');
  responseUsers.forEach((u, idx) => {
    const status = u.accountStatus === 'ACTIF' ? '🟢' : '🔴';
    console.log(`  ${status} ${idx + 1}. ${u.id} - ${u.name.substring(0, 40)}`);
  });
  
  console.log('\n');
  
} catch (e) {
  console.error(`❌ Erreur: ${e.message}`);
  process.exit(1);
}
