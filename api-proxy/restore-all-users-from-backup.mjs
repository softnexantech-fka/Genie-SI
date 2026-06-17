#!/usr/bin/env node
/**
 * RESTAURATION DES COMPTES DEPUIS UN BACKUP JSON — SI Génie Consultant
 * Usage : node restore-all-users-from-backup.mjs [chemin/vers/backup.json]
 *
 * Si aucun fichier n'est fourni, recherche automatiquement le backup le plus récent
 * dans api-proxy/data/backups/ (fichiers .json ou .db contenant {"data":{"users":[...]}})
 *
 * [FIX-v2] Correction :
 *  - Chemin de backup auto-détecté (plus de chemin codé en dur inexistant)
 *  - gc-users reconstruit avec la bonne structure (pas les profils complets)
 *  - passwordHash correctement injecté depuis KNOWN_HASHES si absent du backup
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath    = path.join(__dirname, 'data', 'si_genie.db');
const backupDir = path.join(__dirname, 'data', 'backups');
const SALT      = 'GC_SALT_2026_GABON';

const _sha256 = (s) => crypto.createHash('sha256').update(s + SALT).digest('hex');

// Hashes connus pour chaque utilisateur
const KNOWN_HASHES = {
  'USR-ADM-000':  '947adf4731ce63781262f5eaa4bcf7b304bfa2b4b899db3275b81f6de74eff89',
  'USR-DG-001':   'ec84d9e28100bcc651a40ec79c48c57eb35d94c57c5111bf0b66be396d718531',
  'USR-S01-5763': '5dd57c92bd25860ea767e3cf919aeace4cfec18037ae5ce33ebbcbbb594eb17e',
  'USR-S02-0571': '4080c9403bd7810523e6792bbe8c29683e58e1e85a4873d1d01386896ac55a04',
  'USR-O02-8587': 'f428357e60d1e22d2929594c9df504d85bd891d926c07f52c84593a4967454ad',
  'USR-S03-3840': '78b0c4e9e13fde649c04da9be72a639b38f36ab31593d96ce07ee7fc09b07ba5',
  'USR-P02-2567': '073823e5dc2e8e77b75696c0fcfc0592b734980d03235512ba19fb7701bbf7b3',
  'USR-O02-4973': 'b8328ab2316b7daa088e43de4088a50f9cfc5d54f0cfe1eab7b974be192d625f',
  'USR-O01-7458': '3363a9894b3933325e0b70881af0f1131cf0ad8a29af5d1d0c2954efc5178a3e',
  'USR-O02-6873': 'bf307a3593026bdf386cddc0731fe58504fc4a9b6d7790d46f5c80a47ae0e3a1',
  'USR-O02-5833': '85e0c97424789c444e5820f10f9525db47320ed8241dcc498a76273eb6a1ec8d',
  'USR-O02-8631': 'ac779006aacf6d71028b4373be8c2b4b1b8a22438838971070066419e73d015c',
  'USR-S05-6391': '7fe7124077233ef706413136eac2f467ac977cf8a1bef0273ceb2e49305962bd',
  'USR-S01-2483': '33462aa0feb6fbc7d8e13898be249152b0a6b79f9e6facbb8cdbfd1cebd27ce0',
};

const W = 70;
const line = () => '='.repeat(W);
console.log('\n' + line());
console.log('RESTAURATION DES COMPTES DEPUIS BACKUP JSON — SI Genie Consultant');
console.log(line() + '\n');

// 1. Trouver le fichier backup
let backupPath = process.argv[2]; // argument optionnel
if (!backupPath) {
  // Auto-détection : fichier JSON le plus récent dans backups/
  if (fs.existsSync(backupDir)) {
    const candidates = fs.readdirSync(backupDir)
      .filter(f => (f.endsWith('.json') || f.endsWith('.db')) && !f.includes('corrupted'))
      .map(f => ({ f, mtime: fs.statSync(path.join(backupDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);

    // Trouver le premier fichier qui contient {"data":{"users":[...]}}
    for (const { f } of candidates) {
      const fp = path.join(backupDir, f);
      try {
        const content = fs.readFileSync(fp, 'utf8');
        if (content.trim().startsWith('{') && content.includes('"users"')) {
          const parsed = JSON.parse(content);
          if (parsed.data && Array.isArray(parsed.data.users) && parsed.data.users.length > 0) {
            backupPath = fp;
            console.log('  Backup auto-detecte : ' + f);
            break;
          }
        }
      } catch (_) {}
    }
  }
}

if (!backupPath || !fs.existsSync(backupPath)) {
  console.error('  ERREUR : Aucun fichier backup trouvé.');
  console.error('  Usage : node restore-all-users-from-backup.mjs [chemin/backup.json]');
  process.exit(1);
}

console.log('  Lecture du backup : ' + path.basename(backupPath));
let backupData;
try {
  const content = fs.readFileSync(backupPath, 'utf8');
  backupData = JSON.parse(content);
} catch (e) {
  console.error('  ERREUR lecture backup : ' + e.message);
  process.exit(1);
}

const users = (backupData.data || backupData).users || [];
if (!Array.isArray(users) || users.length === 0) {
  console.error('  ERREUR : Aucun utilisateur dans le backup.');
  process.exit(1);
}
console.log('  ' + users.length + ' comptes trouves dans le backup\n');

// 2. Vérifier la DB
if (!fs.existsSync(dbPath)) {
  console.error('  ERREUR : Base de donnees introuvable : ' + dbPath);
  process.exit(1);
}

// 3. Backup préventif
const preBackup = path.join(backupDir, `si_genie_pre_restore_${Date.now()}.db`);
fs.copyFileSync(dbPath, preBackup);
console.log('  Backup preventif : ' + path.basename(preBackup));

// 4. Ouvrir la DB et détecter le schéma
const db = new Database(dbPath);
const cols = db.prepare("PRAGMA table_info(si_data)").all().map(c => c.name);
const valCol = cols.includes('value') ? 'value' : cols.includes('json') ? 'json' : 'value';
console.log('  Schema DB : colonne "' + valCol + '"\n');

const dbWrite = (key, val) => {
  const json = JSON.stringify(val);
  db.prepare('INSERT INTO si_data (key, "' + valCol + '", updated_at, size_bytes) VALUES (?, ?, strftime(\'%s\',\'now\'), ?) ON CONFLICT(key) DO UPDATE SET "' + valCol + '" = excluded."' + valCol + '", updated_at = excluded.updated_at, size_bytes = excluded.size_bytes').run(key, json, Buffer.byteLength(json, 'utf8'));
};

// 5. Enrichir les users avec les hashes manquants
console.log('Verification et enrichissement des passwordHash...');
let fixed = 0;
for (const u of users) {
  const known = KNOWN_HASHES[u.id];
  if (!u.passwordHash) {
    u.passwordHash = known || _sha256(u.id.slice(-6));
    console.log('  Hash injecte : ' + u.id + ' (' + (u.alias || u.name) + ')');
    fixed++;
  }
}
console.log('  ' + fixed + ' hash(es) injecte(s), ' + (users.length - fixed) + ' inchange(s)\n');

// 6. Supprimer et recréer users + gc-users
console.log('Restauration dans la base...');
db.prepare('DELETE FROM si_data WHERE key IN (\'users\', \'gc-users\')').run();

// Écrire users
dbWrite('users', users);
console.log('  OK "users" : ' + users.length + ' comptes');

// [FIX-v2] Construire gc-users avec la BONNE structure (pas les profils complets)
const gcUsers = users.map(u => ({
  id:            u.id,
  username:      u.alias || u.id,
  email:         u.email || '',
  passwordHash:  KNOWN_HASHES[u.id] || u.passwordHash || _sha256(u.id.slice(-6)),
  role:          u.role || 'Collaborateur',
  level:         u.level ?? 1,
  accountStatus: u.accountStatus || 'ACTIF',
  isAdmin:       u.isAdmin || false,
  isMG:          u.isMG || false,
}));
dbWrite('gc-users', gcUsers);
console.log('  OK "gc-users" : ' + gcUsers.length + ' entrees (structure correcte)');

db.close();

// 7. Résumé
console.log('\n' + line());
console.log('RESTAURATION COMPLETE!');
console.log(line());
console.log('\nComptes restaures : ' + users.length);
users.forEach(u => {
  const hasPwd = !!(KNOWN_HASHES[u.id] || u.passwordHash);
  console.log('  ' + (hasPwd ? 'OK' : 'WARN') + ' ' + u.id + ' — ' + (u.alias || u.name));
});
console.log('\nRelancez maintenant le backend : node api-proxy.js\n');
process.exit(0);
