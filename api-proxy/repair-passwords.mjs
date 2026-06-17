#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║       SCRIPT DE RÉPARATION — SI Génie Consultant                       ║
 * ║  Usage : node repair-passwords.mjs  (depuis le dossier api-proxy/)     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Ce script :
 *  1. Détecte et migre le schéma SQLite si nécessaire
 *     (colonne "json" → "value" + ajout size_bytes, updated_by)
 *  2. Injecte les hashes SHA-256 corrects pour tous les utilisateurs
 *  3. Reconstruit gc-users avec la bonne structure
 *  4. Vérifie le résultat final
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE    = path.join(__dirname, 'data', 'si_genie.db');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const SALT       = 'GC_SALT_2026_GABON';

const _sha256 = (s) => crypto.createHash('sha256').update(s + SALT).digest('hex');

// Hashes SHA-256 précalculés et vérifiés
const KNOWN_HASHES = {
  'USR-ADM-000':  '947adf4731ce63781262f5eaa4bcf7b304bfa2b4b899db3275b81f6de74eff89', // Admin@SI#2026!
  'USR-DG-001':   'ec84d9e28100bcc651a40ec79c48c57eb35d94c57c5111bf0b66be396d718531', // mdp DG
  'USR-S01-5763': '5dd57c92bd25860ea767e3cf919aeace4cfec18037ae5ce33ebbcbbb594eb17e', // 1-5763
  'USR-S02-0571': '4080c9403bd7810523e6792bbe8c29683e58e1e85a4873d1d01386896ac55a04', // fkastanh@30
  'USR-O02-8587': 'f428357e60d1e22d2929594c9df504d85bd891d926c07f52c84593a4967454ad', // 2-8587
  'USR-S03-3840': '78b0c4e9e13fde649c04da9be72a639b38f36ab31593d96ce07ee7fc09b07ba5', // 3-3840
  'USR-P02-2567': '073823e5dc2e8e77b75696c0fcfc0592b734980d03235512ba19fb7701bbf7b3', // 2-2567
  'USR-O02-4973': 'b8328ab2316b7daa088e43de4088a50f9cfc5d54f0cfe1eab7b974be192d625f', // 2-4973
  'USR-O01-7458': '3363a9894b3933325e0b70881af0f1131cf0ad8a29af5d1d0c2954efc5178a3e', // 1-7458
  'USR-O02-6873': 'bf307a3593026bdf386cddc0731fe58504fc4a9b6d7790d46f5c80a47ae0e3a1', // 2-6873
  'USR-O02-5833': '85e0c97424789c444e5820f10f9525db47320ed8241dcc498a76273eb6a1ec8d', // 2-5833
  'USR-O02-8631': 'ac779006aacf6d71028b4373be8c2b4b1b8a22438838971070066419e73d015c', // 2-8631
  'USR-S05-6391': '7fe7124077233ef706413136eac2f467ac977cf8a1bef0273ceb2e49305962bd', // 5-6391
  'USR-S01-2483': '33462aa0feb6fbc7d8e13898be249152b0a6b79f9e6facbb8cdbfd1cebd27ce0', // 1-2483
};

// ── Affichage ─────────────────────────────────────────────────────────────
const W = 72;
const line = (c = '=') => c.repeat(W);
const h1   = (t) => { console.log('\n' + line()); console.log('  ' + t); console.log(line()); };
const h2   = (t) => console.log('\n  -- ' + t);
const ok   = (t) => console.log('  OK ' + t);
const warn = (t) => console.log('  !! ' + t);
const err  = (t) => console.log('  XX ' + t);

// ── Auto-test ─────────────────────────────────────────────────────────────
h1('REPARATION DES MOTS DE PASSE — SI Genie Consultant');
h2('Auto-verification des hashes SHA-256...');

const tests = [
  ['USR-ADM-000',  'Admin@SI#2026!',  KNOWN_HASHES['USR-ADM-000']],
  ['USR-S01-5763', '1-5763',          KNOWN_HASHES['USR-S01-5763']],
  ['USR-S02-0571', 'fkastanh@30',     KNOWN_HASHES['USR-S02-0571']],
  ['USR-S01-2483', '1-2483',          KNOWN_HASHES['USR-S01-2483']],
];
let selfOk = true;
for (const [id, pwd, exp] of tests) {
  const got = _sha256(pwd);
  if (got !== exp) { err('SELF-TEST ECHOUE : ' + id); selfOk = false; }
}
if (!selfOk) { err('Arret — hashes invalides'); process.exit(1); }
ok('Tous les hashes verifies');

// ── Vérification DB ───────────────────────────────────────────────────────
h2('Verification de la base de donnees...');
if (!fs.existsSync(DB_FILE)) {
  err('Base introuvable : ' + DB_FILE);
  err('Lancez ce script depuis le dossier api-proxy/');
  process.exit(1);
}
ok('Base trouvee : ' + DB_FILE);

// ── Backup ────────────────────────────────────────────────────────────────
h2('Sauvegarde preventive...');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, 'si_genie_pre_repair_' + Date.now() + '.db');
fs.copyFileSync(DB_FILE, backupFile);
ok('Backup : ' + path.basename(backupFile));

// ── Ouvrir la DB ──────────────────────────────────────────────────────────
const db = new Database(DB_FILE);

// Détecter le schéma actuel
const colInfo = db.prepare('PRAGMA table_info(si_data)').all();
const colNames = colInfo.map(c => c.name);
ok('Colonnes detectees : ' + colNames.join(', '));

const hasValueCol   = colNames.includes('value');
const hasJsonCol    = colNames.includes('json');
const hasSizeBytes  = colNames.includes('size_bytes');
const hasUpdatedBy  = colNames.includes('updated_by');

// ── Migration du schéma si nécessaire ─────────────────────────────────────
if (!hasValueCol && hasJsonCol) {
  h2('MIGRATION DU SCHEMA REQUISE (json -> value + colonnes manquantes)...');

  // Lire toutes les données avant migration
  const allRows = db.prepare('SELECT key, json FROM si_data').all();
  warn(allRows.length + ' entree(s) a migrer');

  // Créer le nouveau schéma correct (compatible avec api-proxy.js)
  db.exec(`
    CREATE TABLE IF NOT EXISTS si_data_v2 (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_by TEXT    DEFAULT NULL,
      size_bytes INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_si_data_v2_updated ON si_data_v2(updated_at DESC);
  `);

  // Migrer les données
  const insertMig = db.prepare(
    "INSERT OR REPLACE INTO si_data_v2 (key, value, size_bytes) VALUES (?, ?, ?)"
  );
  const migTx = db.transaction(() => {
    for (const row of allRows) {
      const size = row.json ? Buffer.byteLength(row.json, 'utf8') : 0;
      insertMig.run(row.key, row.json, size);
    }
  });
  migTx();
  ok(allRows.length + ' entree(s) migree(s)');

  // Supprimer l'ancienne table et renommer
  db.exec(`
    DROP TABLE si_data;
    ALTER TABLE si_data_v2 RENAME TO si_data;
  `);
  ok('Schema migre : colonne "value" + size_bytes + updated_by');

  // Recréer l'index
  db.exec('CREATE INDEX IF NOT EXISTS idx_si_data_updated ON si_data(updated_at DESC);');
  ok('Index recree');

} else if (hasValueCol && !hasSizeBytes) {
  h2('Ajout des colonnes manquantes (size_bytes, updated_by)...');
  if (!hasSizeBytes) {
    db.exec('ALTER TABLE si_data ADD COLUMN size_bytes INTEGER DEFAULT 0;');
    ok('Colonne size_bytes ajoutee');
  }
  if (!hasUpdatedBy) {
    db.exec('ALTER TABLE si_data ADD COLUMN updated_by TEXT DEFAULT NULL;');
    ok('Colonne updated_by ajoutee');
  }
} else if (hasValueCol) {
  ok('Schema deja correct (colonne "value" presente)');
}

// Vérifier le schéma final
const finalCols = db.prepare('PRAGMA table_info(si_data)').all().map(c => c.name);
ok('Schema final : ' + finalCols.join(', '));

// Helper d'écriture universel
function dbWrite(key, val) {
  const json = JSON.stringify(val);
  const size = Buffer.byteLength(json, 'utf8');
  db.prepare(
    "INSERT INTO si_data (key, value, updated_at, size_bytes) VALUES (?, ?, strftime('%s','now'), ?) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, " +
    "updated_at = excluded.updated_at, size_bytes = excluded.size_bytes"
  ).run(key, json, size);
}

function dbRead(key) {
  const row = db.prepare('SELECT value FROM si_data WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

// ── Lire les users ────────────────────────────────────────────────────────
h2('Lecture des comptes utilisateurs...');
let users = dbRead('users');

if (!Array.isArray(users) || users.length === 0) {
  warn('Table "users" vide ! Tentative de recuperation depuis le fallback JSON...');
  const fallbackPath = path.join(__dirname, 'data', 'si_data_fallback.json');
  if (fs.existsSync(fallbackPath)) {
    try {
      const fb = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      users = fb.users || fb['users'] || [];
    } catch (_) {}
  }
  if (Array.isArray(users) && users.length > 0) {
    ok(users.length + ' comptes recuperes depuis si_data_fallback.json');
  } else {
    err('Aucun utilisateur trouve. Impossible de continuer.');
    db.close();
    process.exit(1);
  }
} else {
  ok(users.length + ' compte(s) trouve(s) dans "users"');
}

// ── Corriger les hashes dans users ───────────────────────────────────────
h2('Correction des passwordHash dans "users"...');
let usersFixed = 0, usersSkipped = 0;

for (const u of users) {
  const knownHash = KNOWN_HASHES[u.id];
  const currentHash = u.passwordHash || '';
  const isBcrypt = currentHash.startsWith('$2b$') || currentHash.startsWith('$2a$');

  if (isBcrypt) {
    // Conserver les hash bcrypt (l'utilisateur a changé son mot de passe via l'UI)
    ok('Hash bcrypt conserve : ' + u.id + ' (' + (u.alias||u.name) + ')');
    usersSkipped++;
  } else if (!currentHash) {
    // Pas de hash du tout → injecter le hash connu
    u.passwordHash = knownHash || _sha256(u.id.slice(-6));
    ok('Hash injecte : ' + u.id + ' (' + (u.alias||u.name) + ')');
    usersFixed++;
  } else if (knownHash && currentHash !== knownHash) {
    // Hash SHA-256 existant mais différent du hash attendu → remplacer
    warn('Hash remplace pour ' + u.id + ' (' + (u.alias||u.name) + ')');
    u.passwordHash = knownHash;
    usersFixed++;
  } else {
    usersSkipped++;
  }
}

dbWrite('users', users);
ok('"users" sauvegarde : ' + usersFixed + ' corrige(s), ' + usersSkipped + ' inchange(s)');

// ── Reconstruire gc-users ─────────────────────────────────────────────────
h2('Reconstruction de "gc-users"...');
let gcExisting = dbRead('gc-users') || [];

// Détecter mauvaise structure (profils complets au lieu d'entrées auth)
const wrongStruct = Array.isArray(gcExisting) && gcExisting.some(u => u.dept || u.bio || u.telephone);
if (wrongStruct) {
  warn('gc-users contient des profils complets (mauvaise structure) -> reconstruction');
  gcExisting = [];
}

const gcMap = new Map((gcExisting || []).map(g => [g.id, g]));
const gcRebuilt = [];

for (const u of users) {
  if (!u.id) continue;
  const existing = gcMap.get(u.id) || {};
  const existIsBcrypt = typeof existing.passwordHash === 'string' &&
    (existing.passwordHash.startsWith('$2b$') || existing.passwordHash.startsWith('$2a$'));

  let finalHash;
  if (existIsBcrypt) {
    finalHash = existing.passwordHash;  // préserver bcrypt (changement de mdp UI)
  } else {
    finalHash = KNOWN_HASHES[u.id] || u.passwordHash || _sha256(u.id.slice(-6));
  }

  gcRebuilt.push({
    id:            u.id,
    username:      u.alias || existing.username || u.id,
    email:         u.email || existing.email || '',
    passwordHash:  finalHash,
    role:          u.role  || existing.role || 'Collaborateur',
    level:         u.level ?? existing.level ?? 1,
    accountStatus: u.accountStatus || existing.accountStatus || 'ACTIF',
    isAdmin:       u.isAdmin || false,
    isMG:          u.isMG   || false,
  });
}

dbWrite('gc-users', gcRebuilt);
ok('"gc-users" reconstruit : ' + gcRebuilt.length + ' compte(s)');

// ── Rapport final ─────────────────────────────────────────────────────────
h2('Rapport de verification...');
const verUsers  = dbRead('users')    || [];
const verGc     = dbRead('gc-users') || [];

console.log('');
console.log('  | ID               | alias           | users       | gc-users    |');
console.log('  |------------------|-----------------|-------------|-------------|');
let allOk = true;
for (const u of verUsers) {
  const gc  = verGc.find(g => g.id === u.id);
  const uH  = u.passwordHash   ? u.passwordHash.slice(0,8)+'...'   : 'VIDE';
  const gH  = gc?.passwordHash ? gc.passwordHash.slice(0,8)+'...'  : 'VIDE';
  const st  = (u.passwordHash && gc?.passwordHash) ? 'OK' : 'XX';
  if (st !== 'OK') allOk = false;
  const alias = (u.alias || '').padEnd(15);
  console.log('  | ' + u.id.padEnd(16) + ' | ' + alias + ' | ' + uH.padEnd(11) + ' | ' + gH.padEnd(11) + ' | ' + st);
}

// ── Mots de passe à communiquer ───────────────────────────────────────────
h2('Mots de passe apres reparation :');
console.log('');
const PWD_TABLE = {
  'USR-ADM-000':  'Admin@SI#2026!',
  'USR-S02-0571': 'fkastanh@30',
  'USR-DG-001':   '(mdp DG — inchange)',
};
console.log('  | ID               | alias           | Mot de passe       |');
console.log('  |------------------|-----------------|---------------------|');
for (const u of verUsers) {
  const gcEntry = verGc.find(g => g.id === u.id);
  const isBcrypt = gcEntry?.passwordHash?.startsWith('$2') || false;
  let pwd;
  if (isBcrypt && !PWD_TABLE[u.id]) {
    pwd = '(change via UI — bcrypt)';
  } else {
    pwd = PWD_TABLE[u.id] || u.id.slice(-6);
  }
  const alias = (u.alias || u.id).padEnd(15);
  console.log('  | ' + u.id.padEnd(16) + ' | ' + alias + ' | ' + pwd.padEnd(19) + ' |');
}

db.close();

if (allOk) {
  h1('REPARATION COMPLETE — Redemarrez maintenant le backend');
  console.log('\n  Etapes suivantes :');
  console.log('    1. Arretez le backend (CTRL+C)');
  console.log('    2. Relancez : node api-proxy.js  (ou npm start)');
  console.log('    3. Testez la connexion de chaque compte');
  console.log('\n  Backup cree : ' + path.basename(backupFile));
  console.log('');
} else {
  h1('REPARATION PARTIELLE — Verifiez les lignes "XX" ci-dessus');
  process.exit(1);
}
