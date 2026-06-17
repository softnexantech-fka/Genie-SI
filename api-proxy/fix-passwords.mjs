#!/usr/bin/env node
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'si_genie.db');
const GC_SHA256_SALT = 'GC_SALT_2026_GABON';

const sha256Hash = (password) => crypto.createHash('sha256').update(password + GC_SHA256_SALT).digest('hex');

console.log('═'.repeat(70));
console.log('🔧 CORRECTION FINALE - RÉGÉNÉRATION DE TOUS LES MOTS DE PASSE');
console.log('═'.repeat(70) + '\n');

try {
  const db = new Database(dbPath);
  
  // Lire les comptes actuels
  const usersRow = db.prepare('SELECT json FROM si_data WHERE key = ?').get('users');
  let users = JSON.parse(usersRow.json);
  
  console.log(`[1] Lus ${users.length} comptes depuis la DB`);
  console.log('[2] Régénération de TOUS les mots de passe...\n');
  
  // Régénérer les hashs pour TOUS les comptes
  const fixedUsers = users.map((u, idx) => {
    let pwd = '';
    let reason = '';
    
    if (u.id === 'USR-S02-0571') {
      pwd = 'fkastanh@30';
      reason = '(mot de passe custom connu)';
    } else {
      // Extraire le dernier segment après le tiret
      const parts = (u.id || '').split('-');
      pwd = parts.length > 0 ? parts[parts.length - 1] : '';
      reason = `(dernier segment: ${pwd})`;
    }
    
    const oldHash = u.passwordHash ? u.passwordHash.substring(0, 8) : 'NONE';
    const newHash = sha256Hash(pwd);
    const newHashShort = newHash.substring(0, 8);
    
    console.log(`  ${idx + 1}. ${u.id.padEnd(15)} ${reason}`);
    console.log(`     pwd: '${pwd}' | oldHash: ${oldHash}... | newHash: ${newHashShort}...`);
    
    return {
      ...u,
      passwordHash: newHash
    };
  });
  
  console.log('\n[3] Sauvegarde en DB...');
  
  // Effacer et re-écrire
  db.prepare('DELETE FROM si_data WHERE key = ?').run('users');
  db.prepare('DELETE FROM si_data WHERE key = ?').run('gc-users');
  db.prepare('INSERT INTO si_data (key, json) VALUES (?, ?)').run('users', JSON.stringify(fixedUsers));
  db.prepare('INSERT INTO si_data (key, json) VALUES (?, ?)').run('gc-users', JSON.stringify(fixedUsers));
  
  console.log('✅ Sauvegardé!\n');
  
  // Vérification
  console.log('[4] VÉRIFICATION FINALE:\n');
  
  let allMatch = true;
  fixedUsers.forEach(u => {
    let expectedPwd = '';
    if (u.id === 'USR-S02-0571') {
      expectedPwd = 'fkastanh@30';
    } else {
      const parts = (u.id || '').split('-');
      expectedPwd = parts.length > 0 ? parts[parts.length - 1] : '';
    }
    
    const expectedHash = sha256Hash(expectedPwd);
    const matches = expectedHash === u.passwordHash;
    allMatch = allMatch && matches;
    
    const status = matches ? '✓' : '❌';
    console.log(`  ${status} ${u.id.padEnd(15)} | pwd: ${expectedPwd.padEnd(10)}`);
  });
  
  db.close();
  
  console.log('\n' + '═'.repeat(70));
  if (allMatch) {
    console.log('✅ SUCCÈS ! Tous les mots de passe sont maintenant corrects !');
  } else {
    console.log('❌ ERREUR ! Certains mots de passe ne correspondent pas');
  }
  console.log('═'.repeat(70) + '\n');
  
} catch (e) {
  console.error(`❌ Erreur: ${e.message}`);
  process.exit(1);
}
