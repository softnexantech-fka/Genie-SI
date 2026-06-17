#!/usr/bin/env node
/**
 * RECONSTRUCTION BASE DE DONNÉES — SI Génie Consultant
 * Crée une nouvelle base SQLite saine depuis une base corrompue
 * Correction v2 : colonne "value" (et non "json") pour compatibilité api-proxy.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath    = path.join(__dirname, 'data', 'si_genie.db');
const backupDir = path.join(__dirname, 'data', 'backups');

const W = 70;
const line = () => '='.repeat(W);
console.log('\n' + line());
console.log('RECONSTRUCTION DE LA BASE DE DONNEES — SI Genie Consultant');
console.log(line() + '\n');

try {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  let usersData   = [];
  let gcUsersData = [];

  if (fs.existsSync(dbPath)) {
    console.log('Sauvegarde de la base existante...');
    const corruptedBackup = path.join(backupDir, `si_genie_corrupted_${Date.now()}.db`);
    fs.copyFileSync(dbPath, corruptedBackup);
    console.log('  OK Backup : ' + path.basename(corruptedBackup) + '\n');

    console.log('Extraction des comptes depuis la base existante...');
    try {
      const corruptedDb = new Database(corruptedBackup, { timeout: 3000 });
      // [FIX-v2] Detecter le nom de la colonne (value ou json)
      const cols = corruptedDb.prepare("PRAGMA table_info(si_data)").all().map(c => c.name);
      const valCol = cols.includes('value') ? 'value' : cols.includes('json') ? 'json' : null;

      if (valCol) {
        const readRow = (key) => {
          const row = corruptedDb.prepare('SELECT "' + valCol + '" FROM si_data WHERE key = ? LIMIT 1').get(key);
          if (!row) return null;
          try { return JSON.parse(row[valCol]); } catch { return null; }
        };
        const ud = readRow('users');
        if (Array.isArray(ud) && ud.length > 0) { usersData = ud; console.log('  OK ' + usersData.length + " comptes 'users' recuperes"); }
        const gd = readRow('gc-users');
        if (Array.isArray(gd) && gd.length > 0) { gcUsersData = gd; console.log('  OK ' + gcUsersData.length + " comptes 'gc-users' recuperes"); }
      }
      corruptedDb.close();
    } catch (e) {
      console.log('  WARN Impossible lire la base : ' + e.message);
    }

    console.log('\nSuppression ancienne base...');
    fs.unlinkSync(dbPath);
    console.log('  OK Ancienne base supprimee\n');
  }

  console.log('Creation nouvelle base de donnees...');
  const db = new Database(dbPath);

  // [FIX-v2] Schema avec colonne "value" (compatible api-proxy.js)
  db.exec(`
    CREATE TABLE si_data (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_by TEXT    DEFAULT NULL,
      size_bytes INTEGER DEFAULT 0
    );
    CREATE INDEX idx_si_data_updated ON si_data(updated_at DESC);
    CREATE TABLE si_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT, file_key TEXT UNIQUE NOT NULL,
      original_name TEXT, mime_type TEXT, size_bytes INTEGER DEFAULT 0,
      disk_path TEXT, compressed_path TEXT, compressed INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0, created_at INTEGER DEFAULT (strftime('%s','now')), created_by TEXT
    );
    CREATE TABLE si_file_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, file_key TEXT NOT NULL,
      version_id TEXT UNIQUE NOT NULL, size_bytes INTEGER DEFAULT 0,
      disk_path TEXT, created_at INTEGER DEFAULT (strftime('%s','now')), created_by TEXT,
      FOREIGN KEY (file_key) REFERENCES si_files(file_key)
    );
    CREATE TABLE si_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL,
      target TEXT, detail TEXT, ip TEXT, ts INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE si_offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT, action TEXT,
      key TEXT, value TEXT, timestamp INTEGER DEFAULT (strftime('%s','now'))
    );
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
  `);
  console.log('  OK Tables creees (schema v2 avec colonne "value")\n');

  const dbWrite = (key, val) => {
    const json = JSON.stringify(val);
    db.prepare('INSERT INTO si_data (key, value, updated_at, size_bytes) VALUES (?, ?, strftime(\'%s\',\'now\'), ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, size_bytes = excluded.size_bytes').run(key, json, Buffer.byteLength(json, 'utf8'));
  };

  console.log('Restauration des comptes...');
  dbWrite('users', usersData.length > 0 ? usersData : []);
  console.log('  OK ' + (usersData.length > 0 ? usersData.length + " comptes 'users' restaures" : "Cle 'users' initialisee vide"));

  // [FIX-v2] Nettoyer gc-users si structure incorrecte
  if (gcUsersData.length > 0) {
    const wrongStruct = gcUsersData.some(u => u.dept || u.bio || u.telephone);
    if (wrongStruct && usersData.length > 0) {
      console.log('  WARN gc-users avait une mauvaise structure — reconstruction depuis users');
      gcUsersData = usersData.map(u => ({
        id: u.id, username: u.alias || u.id, email: u.email || '',
        passwordHash: u.passwordHash || '', role: u.role || 'Collaborateur',
        level: u.level ?? 1, accountStatus: u.accountStatus || 'ACTIF',
        isAdmin: u.isAdmin || false, isMG: u.isMG || false,
      }));
    }
    dbWrite('gc-users', gcUsersData);
    console.log('  OK ' + gcUsersData.length + " comptes 'gc-users' restaures");
  } else {
    dbWrite('gc-users', []);
    console.log("  OK Cle 'gc-users' initialisee vide");
  }

  dbWrite('gc-wipe-registry', { __reset: Date.now() });
  console.log('\n  OK Wipe registry initialise');

  const tables   = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const dataRows = db.prepare('SELECT COUNT(*) as cnt FROM si_data').get();
  console.log('\nVerification : ' + tables.length + ' tables, ' + dataRows.cnt + ' entrees');
  db.close();

  console.log('\n' + line());
  console.log('RECONSTRUCTION REUSSIE!');
  console.log(line());
  console.log('\nLancez ensuite: node repair-passwords.mjs');
  console.log('Puis redemarrez: node api-proxy.js\n');
  process.exit(0);

} catch (err) {
  console.error('\nERREUR FATALE:', err.message, err.stack);
  process.exit(1);
}
