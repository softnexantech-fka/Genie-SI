
// ============================================================
// API Proxy SI Génie Consultant — v132 (AUDIT COMPLET)
// Base de données SQLite + WebSocket temps réel + Stockage disque
// ============================================================
//
//  CORRECTIONS v132 (audit approfondi) :
//  [C1]  auditLog — crash silencieux en mode sqlite3 async (db.prepare inexistant)
//  [C2]  authenticateTokenOptional — retournait 403 sur token expiré → bloquait
//        toutes les lectures après 8h. Désormais fallback anonymous.
//  [C3]  flush_offline_queue — aucune validation isAllowedKey → injection possible.
//        Ajout validation + transaction + limite 200 items max.
//  [C4]  WAL non checkpointé — fichier WAL croissait indéfiniment.
//        Ajout pragma wal_autocheckpoint + checkpoint périodique (5 min) +
//        checkpoint FULL à l'arrêt propre.
//  [C5]  SIGTERM/SIGINT — fermeture sans checkpoint WAL ni close() SQLite.
//  [C6]  Middleware CSRF inutile — générait un token sans jamais le valider.
//        Supprimé (sécurité-théâtre qui consommait du CPU inutilement).
//  [C7]  Limite taille valeur absente — body 50 MB accepté en SQLite. Ajout
//        limite 10 MB par valeur clé-valeur (configurable MAX_VALUE_MB).
//  [C8]  broadcast() envoyait à tous y compris l'expéditeur. Ajout header
//        X-Socket-Id pour exclure le socket émetteur du broadcast.
//  [C9]  DELETE /api/data/:key — aucune vérification isAllowedKey.
//  [C10] dbGet — avalait toutes erreurs → impossible distinguer 404 vs crash DB.
//        Séparation "not found" vs "error" dans les helpers.
//  [C11] JSON fallback non-atomique — concurrent writes corrompaient le fichier.
//        Écriture via fichier temporaire + rename() atomique.
//  [C12] si_audit sans rotation — croissance illimitée. Purge auto > 30 jours.
//  [C13] Backup manuel seulement — ajout backup automatique toutes les 6h.
//  [C14] connectedClients sans limite — max 500 entrées.
//  [C15] Multer error non propagée correctement au client.
//  [C16] isAllowedKey manquant sur /api/data/batch (écriture batch inexistante
//        mais lecture batch exposait toutes clés si non-filtré).
//  [C17] /api/data POST sans authentification pour clés sensibles.
//        Ajout vérification minimale pour gc-users / users.
//  [C18] findFileOnDisk récursif sans limite de profondeur → risque stack overflow.
//  [C19] Version hardcodée "v127" dans logs et réponses. Centralisée.
//  [C20] Rate limiting global seulement — pas de fenêtre élargie pour uploads.
//  [C21] Socket identify — acceptait userId/userName sans JWT (usurpation identité).
//        Désormais: token JWT requis, fallback anonymous seulement si absent.

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { config } from 'dotenv';
import crypto from 'crypto';
import child_process from 'child_process';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import { body, validationResult } from 'express-validator';
import compression from 'compression';
import { createClient as createRedisClient } from 'redis';
// archiver est CommonJS — chargé via require (createRequire défini plus bas)
let archiver = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
// archiver est CommonJS — require après createRequire
archiver = require('archiver');

config({ path: path.join(__dirname, '.env') });

// Optional Redis cache (used if REDIS_URL provided)
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_SOCKET || null;
let redisClient = null;
let redisAvailable = false;
if (REDIS_URL) {
  try {
    redisClient = createRedisClient({ url: REDIS_URL });
    redisClient.on('error', (e) => console.warn('[Redis] error', e && e.message));
    await redisClient.connect();
    redisAvailable = true;
    console.log('[Redis] connecté');
  } catch (e) {
    redisClient = null; redisAvailable = false;
    console.warn('[Redis] non disponible:', e.message);
  }
}

// ── Version centralisée ─────────────────────────────────────────────────────
const PROXY_VERSION = '132';

// Redis-backed cache TTL (seconds) — utilisable pour clés très lues
const REDIS_CACHE_TTL = Number(process.env.REDIS_CACHE_TTL || '60');
const COMPRESS_THRESHOLD_BYTES = Number(process.env.FILE_COMPRESS_BYTES || '100000');
const COMPRESSIBLE_MIMES = new Set([
  'text/plain', 'application/json', 'application/javascript', 'application/xml',
  'application/x-javascript', 'application/x-ndjson', 'application/rss+xml',
  'application/atom+xml', 'application/ld+json', 'application/xhtml+xml',
  'text/csv', 'image/svg+xml', 'application/yaml', 'text/html'
]);
const CACHEABLE_KEYS = new Set([
  'gc-users', 'gc-taches', 'gc-dossiers', 'gc-rdvs', 'gc-notifications',
  'gc-audit-checklist', 'gc-budget', 'gc-journal', 'gc-cabinet-info', 'gc-si-appearance'
]);

async function redisGetCache(key) {
  if (!redisAvailable || !redisClient) return null;
  try {
    const v = await redisClient.get(`cache:${key}`);
    if (!v) return null;
    return JSON.parse(v);
  } catch (e) { return null; }
}

async function redisSetCache(key, value, ttl = REDIS_CACHE_TTL) {
  if (!redisAvailable || !redisClient) return;
  try {
    await redisClient.setEx(`cache:${key}`, parseInt(ttl, 10), JSON.stringify(value));
  } catch (e) { /* ignore */ }
}

async function redisInvalidateCache(key) {
  if (!redisAvailable || !redisClient) return;
  try { await redisClient.del(`cache:${key}`); } catch (e) { /* ignore */ }
}

function shouldCompressFile(mimeType, size) {
  return size >= COMPRESS_THRESHOLD_BYTES && COMPRESSIBLE_MIMES.has(mimeType);
}

async function compressIfNeeded(filePath, mimeType, size) {
  if (!shouldCompressFile(mimeType, size)) return { compressed: false, diskPath: filePath, compressedPath: null };
  const compressedPath = `${filePath}.gz`;
  await new Promise((resolve, reject) => {
    const inp = fs.createReadStream(filePath);
    const out = fs.createWriteStream(compressedPath);
    const gzip = zlib.createGzip({ level: 6 });
    inp.pipe(gzip).pipe(out).on('finish', resolve).on('error', reject);
  });
  await fs.promises.unlink(filePath);
  return { compressed: true, diskPath: compressedPath, compressedPath };
}

// Try scanning file with local clamscan if available. Non-blocking fallback: if clamscan not found, allow but log.
function scanFileWithClam(filePath) {
  try {
    const res = child_process.spawnSync('clamscan', ['--no-summary', filePath], { timeout: 30_000 });
    if (res.error) {
      console.warn('[ClamScan] spawn error:', res.error.message);
      return { ok: true, scanned: false };
    }
    const stdout = (res.stdout || '').toString('utf8');
    const exit = res.status || 0;
    if (exit === 0 && stdout.includes('OK')) return { ok: true, scanned: true };
    if (exit === 1 || stdout.includes('FOUND')) return { ok: false, scanned: true, reason: stdout.trim() };
    return { ok: true, scanned: false };
  } catch (e) {
    console.warn('[ClamScan] error:', e.message);
    return { ok: true, scanned: false };
  }
}

// ── Dossiers de données ─────────────────────────────────────────────────────
const DATA_DIR      = process.env.DATA_DIR    || path.join(__dirname, 'data');
const UPLOADS_DIR   = process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads');
const DB_FILE       = path.join(DATA_DIR, 'si_genie.db');
const BACKUP_DIR    = path.join(DATA_DIR, 'backups');
// DOSSIER-FS : chaque dossier SI crée un sous-répertoire physique ici
const DOSSIERS_FS_DIR = process.env.DOSSIERS_FS_DIR || path.join(DATA_DIR, 'dossiers');

for (const dir of [DATA_DIR, UPLOADS_DIR, BACKUP_DIR, DOSSIERS_FS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Surveillance disque ──────────────────────────────────────────────────────
// DISK-MON : Surveille l'espace disque toutes les 15 min.
// À 90% : alerte broadcast + notification persistante pour DG et Admin.
// À 95% : alerte critique broadcast.
const DISK_ALERT_PATH     = DATA_DIR;         // Surveiller la partition qui contient les données
const DISK_WARN_PCT       = 90;               // Seuil alerte standard
const DISK_CRIT_PCT       = 95;               // Seuil critique
const DISK_CHECK_INTERVAL = 15 * 60 * 1000;  // 15 min
let   _lastDiskAlertLevel = 'ok';             // Éviter répétition des alertes

async function getDiskUsagePct(dirPath) {
  try {
    // statvfs n'est pas dans Node standard — on utilise df via child_process
    const output = child_process.execSync(`df -k "${dirPath}" 2>/dev/null | tail -1`, { timeout: 5000 }).toString().trim();
    const parts = output.split(/\s+/);
    // Colonnes df: Filesystem, 1K-blocks, Used, Available, Use%, Mounted
    const usePctStr = parts[4] || '0%';
    return parseInt(usePctStr.replace('%', ''), 10) || 0;
  } catch {
    // Fallback : calculer à partir des tailles de dossiers
    try {
      const totalData = getDirSize(DATA_DIR);
      const MAX_BYTES = (parseInt(process.env.MAX_DISK_GB || '250', 10)) * 1024 * 1024 * 1024;
      return Math.round((totalData / MAX_BYTES) * 100);
    } catch { return 0; }
  }
}

async function checkDiskAndAlert() {
  const pct = await getDiskUsagePct(DISK_ALERT_PATH);
  const level = pct >= DISK_CRIT_PCT ? 'critical' : pct >= DISK_WARN_PCT ? 'warning' : 'ok';
  if (level === 'ok') { _lastDiskAlertLevel = 'ok'; return; }
  // Ne pas répéter la même alerte si déjà au même niveau
  if (level === _lastDiskAlertLevel) return;
  _lastDiskAlertLevel = level;

  const msg = level === 'critical'
    ? `CRITIQUE : Espace disque à ${pct}% — Intervention immédiate requise ! Sauvegardez et libérez de l'espace.`
    : `ALERTE : Espace disque à ${pct}% — Pensez à sauvegarder ou transférer les fichiers vers un disque externe ou le cloud.`;

  console.warn(`[DISK-MON] ${msg}`);

  // Broadcast alerte WebSocket (tous les clients connectés)
  io.emit('disk_alert', { level, pct, message: msg, ts: Date.now() });

  // Sauvegarder une notification persistante dans la DB pour DG et Admin
  if (dbReady) {
    try {
      const notifKey = 'gc-notifications';
      const notifs = (await dbGet(notifKey)) || [];
      const notifId = `DISK-${Date.now()}`;
      const newNotif = {
        id: notifId,
        type: level === 'critical' ? 'critical' : 'warning',
        icon: level === 'critical' ? 'server-crash' : 'hard-drive',
        message: msg,
        module: 'system',
        target: 'admin_dg',  // Visible uniquement par admin + DG
        at: new Date().toISOString(),
        read: false,
        persistent: true,
      };
      const updated = [newNotif, ...notifs].slice(0, 500);
      await dbSet(notifKey, updated, 'system');
      // Broadcast notification data_changed
      io.emit('data_changed', { key: notifKey, action: 'set', by: 'system', ts: Date.now() });
    } catch (e) { console.warn('[DISK-MON] Erreur sauvegarde notification:', e.message); }
  }
}

// Démarrer la surveillance disque (après que io et dbReady soient initialisés)
function startDiskMonitoring() {
  checkDiskAndAlert().catch(() => {});
  setInterval(() => checkDiskAndAlert().catch(() => {}), DISK_CHECK_INTERVAL);
}

// ── Dossier physique par dossier SI ──────────────────────────────────────────
// DOSSIER-FS : Crée/met à jour le dossier physique et le README pour un dossier SI.
function sanitizeFolderName(name) {
  return (name || 'sans-nom')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlever accents
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')           // caractères interdits
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
    .trim() || 'dossier';
}

function getDossierFsPath(dossierId, dossierName) {
  const safeName = sanitizeFolderName(dossierName);
  return path.join(DOSSIERS_FS_DIR, `${dossierId}_${safeName}`);
}

async function ensureDossierFolder(dossier) {
  if (!dossier?.id) return null;
  const folderPath = getDossierFsPath(dossier.id, dossier.nom || dossier.title || dossier.id);
  const filesPath  = path.join(folderPath, 'fichiers');
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    fs.mkdirSync(filesPath,  { recursive: true });
    // Écrire/mettre à jour le README.md
    const readmePath = path.join(folderPath, 'README.md');
    const now = new Date().toISOString();
    const readme = [
      `# Dossier SI : ${dossier.nom || dossier.title || dossier.id}`,
      '',
      `**Identifiant :** \`${dossier.id}\``,
      `**Référence :** ${dossier.reference || dossier.ref || '—'}`,
      `**Statut :** ${dossier.status || dossier.statut || '—'}`,
      `**Type :** ${dossier.type || dossier.categorie || '—'}`,
      `**Responsable :** ${dossier.responsable || dossier.assignedTo || '—'}`,
      `**Processus :** ${dossier.processus || dossier.process || '—'}`,
      `**Date création :** ${dossier.createdAt || dossier.dateCreation || '—'}`,
      `**Dernière modification :** ${now}`,
      '',
      `## Description`,
      '',
      dossier.description || dossier.notes || '_Aucune description._',
      '',
      `## Contenu du dossier`,
      '',
      '> Les fichiers associés à ce dossier se trouvent dans le sous-répertoire `fichiers/`.',
      '> Ce fichier est généré automatiquement par le SI Génie Consultant.',
      '',
      `---`,
      `*Exporté le ${now} depuis SI Génie Consultant*`,
    ].join('\n');
    fs.writeFileSync(readmePath, readme, 'utf8');
    return folderPath;
  } catch (e) {
    console.warn(`[DOSSIER-FS] Erreur création dossier physique ${dossier.id}:`, e.message);
    return null;
  }
}

// Copier un fichier uploadé dans le dossier physique du dossier SI
async function linkFileToDossierFolder(dossierId, dossierName, fileId, originalName, diskPath) {
  if (!dossierId || !diskPath || !fs.existsSync(diskPath)) return;
  try {
    const folderPath = getDossierFsPath(dossierId, dossierName || dossierId);
    const filesPath  = path.join(folderPath, 'fichiers');
    fs.mkdirSync(filesPath, { recursive: true });
    // Utiliser un lien dur (hard link) pour éviter la duplication d'espace disque
    const safeName = sanitizeFolderName(path.parse(originalName).name) + path.extname(originalName).toLowerCase();
    const destPath = path.join(filesPath, `${fileId}_${safeName}`);
    // Copie directe (hard links échouent cross-filesystem et sous Windows)
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(diskPath, destPath);
    }
  } catch (e) {
    console.warn(`[DOSSIER-FS] Erreur liaison fichier:`, e.message);
  }
}

// ── Clés partagées ──────────────────────────────────────────────────────────
// FIX v141 — Synchronisation ALLOWED_KEYS avec SHARED_KEYS frontend (30+ clés ajoutées)
const ALLOWED_KEYS = new Set([
  'gc-users', 'gc-dossiers', 'gc-taches', 'gc-rdvs', 'gc-pending-delete-approvals',
  'gc-partners', 'gc-messages', 'gc-notifications', 'gc-session-logs',
  'gc-pending-connections', 'gc-pending-account-actions', 'gc-app-habilitations',
  'gc-app-access-codes', 'gc-si-appearance', 'gc-si-logo-url', 'gc-si-css-overrides',
  'gc-si-system-docs', 'gc-committees', 'gc-codif-registry', 'gc-internal-docs',
  'gc-dossier-files', 'gc-standalone-docs', 'gc-achievements', 'gc-require-conn-approval',
  'gc-achats', 'gc-leaves', 'gc-sirh-reinstatements', 'gc-writer-docs',
  'gc-writer-pro-v2', 'gc-tableur-pro', 'gc-pres-decks-v2', 'gc-courrier-docs',
  'gc-docs-archives', 'gc-ohada-docs', 'gc-feuille-tests', 'gc-audit-checklist-custom',
  'gc-amelio-actions', 'gc-amelio-kpis', 'gc-amelio-ncs', 'gc-coso-scores',
  'gc-coso-notes', 'gc-coso-custom-q', 'gc-bcg', 'gc-mckinsey', 'gc-porter',
  'gc-vrio', 'gc-qqoqcp', 'gc-pdca', 'gc-pareto', 'gc-mc7s', 'gc-ansoff',
  'gc-conseil-opinions', 'gc-matrix-log', 'gc-msg-drafts', 'gc-msg-templates',
  'gc-notes-rapides', 'gc-logmod-stocks', 'gc-piece-series', 'gc-backup-log',
  'gc-backups', 'gc-devis', 'gc-10m', 'gc-5m', 'gc-5s',
  'gc-ai-proxy-url', 'gc-budget-rapide', 'gc-factures', 'gc-account-actions',
  'users', 'dossiers', 'taches', 'rdvs', 'pendingApprovals', 'partners', 'gc-pending-approvals', 'standaloneDocuments',
  'siAppearance', 'siLogoUrl', 'siCSSOverrides',
  // ── FIX v141 : Processus & Hiérarchie ─────────────────────────────
  'gc-process-app-matrix', 'gc-circuits', 'gc-orgigram-nodes', 'gc-orgigram-links',
  // ── FIX v141 : Messagerie ──────────────────────────────────────────
  'gc-messages-global',
  // ── FIX v141 : CRM / Conseil ──────────────────────────────────────
  'gc-crm-interactions', 'gc-crm-opps', 'gc-crm-relances', 'gc-conventions', 'gc-demandes',
  // ── FIX v141 : SIRH ───────────────────────────────────────────────
  'gc-sirh-presences', 'gc-sirh-evaluations', 'gc-sirh-fichiers', 'gc-recrutements',
  'gc-paie-taux', 'gc-paie-transferts', 'gc-kyc-workflows',
  // ── FIX v141 : Audit & Conformité ─────────────────────────────────
  'gc-audit-actions', 'gc-audit-checklist', 'gc-audit-prog',
  'gc-pca', 'gc-pca-risques', 'gc-pca-procedures', 'gc-pca-tests',
  'gc-conffull-approvals', 'gc-conffull-checks', 'gc-conffull-kpi', 'gc-conffull-veille',
  'gc-rgpd-traitements', 'gc-obligations', 'gc-nc', 'gc-risks', 'gc-resources',
  // ── FIX v141 : Finance & Logistique ───────────────────────────────
  'gc-journal', 'gc-budget', 'gc-stocks', 'gc-inventaires', 'gc-inventaire-en-cours',
  'gc-logistique-actifs', 'gc-tpa',
  // ── FIX v141 : Juridique ──────────────────────────────────────────
  'gc-jur-custom-laws', 'gc-jur-custom-modeles', 'gc-jur-docs', 'gc-jur-veille',
  // ── FIX v141 : Configuration cabinet ─────────────────────────────
  'gc-cabinet-info', 'gc-fiscal-config', 'gc-delai-config',
  // ── FIX v141 : Communication ──────────────────────────────────────
  'gc-comm-fiches', 'gc-comm-custom-tpl',
  // ── FIX v141 : Documents & Archives ──────────────────────────────
  'gc-docs-unified', 'gc-external-docs', 'gc-forms', 'gc-gestion-archives',
  'gc-ohada-custom', 'gc-ohada-overrides',
  // ── FIX v141 : Présence temps réel ───────────────────────────────
  'gc-presence',
  'gc-process-config',      // configuration processus partagée
  // ── FIX v142 : Clés manquantes ───────────────────────────────────
  'gc-security-alerts', 'gc-widget-alarms', 'gc-system-msgs', 'gc-system-alerts', 'gc-rapport-activite', 'gc-file-versions',
  // ── FIX v142b : Clés ERP/CRM/SIRH/Archives ───────────────────────
  'gc-crm-clients', 'gc-jur-kyc', 'gc-sirh-leaves', 'gc-sirh-recrutements',
  'gc-comm-campagnes', 'gc-kanban-cols-v2', 'gc-kanban-cards-v2', 'gc-archives',
  'gc-memos', 'gc-si-docs',
  // ── FIX v153 : Clés absentes du backend (audit 2026-05) ──────────
  // gc-tombstones : suppression persistée cross-machine (anti-résurrection)
  // gc-audit-grille-taches : grille de tâches module audit
  // gc-comm-contacts : contacts module communication
  'gc-tombstones', 'gc-audit-grille-taches', 'gc-comm-contacts',
  // ── FIX v153b : Clés collaboratives cross-machine manquantes ──────
  'gc-files', 'gc-schema-version', 'gc-auto-backup-enabled', 'gc-auto-backup-interval',
  'gc-printers', 'gc-print-queue', 'gc-prefill-facture', 'gc-bureau-lastvisits',
  'gc-kpi-alerts', 'gc-kpi-dg-view', 'gc-si-source', 'gc-ai-delays',
  'gc-anti-redondance-v1',
  // ── FIX vNext : Clé notifications manquante ──────────────────────────
  'notifications',
]);

// [C3][C9] Validation clé autorisée — préfixes dynamiques inclus
// FIX BUG-B13 — Validation stricte de longueur + format des clés dynamiques pour
// éviter qu'un utilisateur malveillant remplisse SQLite avec des milliers de clés
// gc-notif-XXX différentes (DoS) ou tente une path traversal via la clé.
const KEY_MAX_LENGTH = 80;
const NOTIF_SUFFIX_RE = /^[A-Za-z0-9_-]{1,64}$/;
function isAllowedKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.length > KEY_MAX_LENGTH) return false;
  // Bloquer caractères dangereux (/, \, .., null bytes, etc.)
  // eslint-disable-next-line no-control-regex, no-useless-escape
  if (/[/\\\x00]/.test(key) || key.includes('..')) return false;
  if (ALLOWED_KEYS.has(key)) return true;
  if (key.startsWith('gc-notif-')) {
    const suffix = key.slice('gc-notif-'.length);
    return NOTIF_SUFFIX_RE.test(suffix);
  }
  return false;
}

// ✅ PHASE 2 FIX #1: Input validation & sanitization for all data
function validateAndSanitizeValue(key, value) {
  if (value === null || value === undefined) return { valid: true, sanitized: value };
  
  const valueStr = JSON.stringify(value);
  
  // 1. Limit depth (prevent deeply nested objects)
  const depth = (obj, max = 20) => {
    if (--max < 0) return false;
    if (typeof obj !== 'object' || obj === null) return true;
    return Object.values(obj).every(v => depth(v, max));
  };
  if (!depth(value)) return { valid: false, error: 'Valeur trop profondément imbriquée' };
  
  // 2. For arrays, validate each item has safe keys
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'object' && item !== null) {
        const keys = Object.keys(item);
        // Reject keys with suspicious patterns (../, script, eval, etc)
        if (keys.some(k => /\.\.\/|<script|javascript:|eval|Function/.test(k))) {
          return { valid: false, error: 'Clés suspectes détectées' };
        }
      }
    }
  }
  
  // 3. Check for malicious content in string values
  if (typeof value === 'string') {
    if (/<script|javascript:|onerror=|onclick=/i.test(value)) {
      return { valid: false, error: 'Contenu potentiellement malveillant détecté' };
    }
  }
  
  // 4. Reject values sized > 10MB
  if (Buffer.byteLength(valueStr, 'utf8') > 10 * 1024 * 1024) {
    return { valid: false, error: 'Valeur dépasse 10MB' };
  }
  
  // If all checks pass, return sanitized (as-is for now)
  return { valid: true, sanitized: value };
}

// ── Variables d'environnement ───────────────────────────────────────────────
const PORT           = parseInt(process.env.PROXY_PORT || '3001');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:4173';
const API_SECRET     = process.env.API_SECRET || 'gc-secret-change-me-in-env';
const JWT_SECRET     = process.env.JWT_SECRET || 'gc-jwt-secret-change-me-in-env';
const MAX_FILE_MB    = parseInt(process.env.MAX_FILE_MB || '500');
const MAX_DB_GB      = parseInt(process.env.MAX_DB_GB   || '250');
// [C7] Limite par valeur clé-valeur (défaut 10 MB)
const MAX_VALUE_MB   = parseInt(process.env.MAX_VALUE_MB || '10');
const LOCAL_NETWORK_ORIGIN = /^https?:\/\/((localhost|127\.0\.0\.1)|(192\.168\.\d+\.\d+)|(10\.\d+\.\d+\.\d+)|(172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+))(?::\d+)?$/;

// FIX SYNC-S2 — Logger sécurisé : filtre les tokens JWT et mots de passe des logs.
// Évite qu'un token expiré ou invalide dans un header soit loggué en clair.
const _sanitizeForLog = (msg) => {
  if (typeof msg !== 'string') {
    try { msg = JSON.stringify(msg); } catch { msg = String(msg); }
  }
  return msg
    .replace(/Bearer\s+[\w.+-]+/gi, 'Bearer [REDACTED]')
    .replace(/"password"\s*:\s*"[^"]*"/g, '"password":"[REDACTED]"')
    .replace(/"passwordHash"\s*:\s*"[^"]*"/g, '"passwordHash":"[REDACTED]"')
    .replace(/"token"\s*:\s*"[^"]*"/g, '"token":"[REDACTED]"');
};
const logger = {
  log:   (...a) => console.log(...a.map(_sanitizeForLog)),
  warn:  (...a) => console.warn(...a.map(_sanitizeForLog)),
  error: (...a) => console.error(...a.map(_sanitizeForLog)),
  info:  (...a) => console.info(...a.map(_sanitizeForLog)),
};

// ── Sécurité ────────────────────────────────────────────────────────────────
const JWT_EXPIRES_IN    = '8h';
const BCRYPT_ROUNDS     = 12;
const GC_SHA256_SALT    = 'GC_SALT_2026_GABON';

// ── SQLite ──────────────────────────────────────────────────────────────────
let db = null;
let dbReady = false;
let dbMode  = 'none'; // 'better-sqlite3' | 'sqlite3' | 'json'

// ── Middleware auth JWT strict ───────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requis' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide ou expiré' });
    req.user = user;
    next();
  });
};

// [C2] authenticateTokenOptional — fallback anonymous si token absent/expiré
// (anciennement retournait 403 → bloquait toutes lectures après 8h de session)
const authenticateTokenOptional = (req, res, next) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) {
    req.user = { id: 'anonymous', username: 'public', role: 'GUEST', level: 0 };
    return next();
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // Token expiré ou invalide → traiter comme anonyme, ne pas bloquer
      req.user = { id: 'anonymous', username: 'public', role: 'GUEST', level: 0 };
      return next();
    }
    req.user = user;
    next();
  });
};

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Données invalides', details: errors.array() });
  next();
};

// ── Utilisateurs par défaut au démarrage ────────────────────────────────────
// [FIX-INIT-USERS] Initialiser avec au minimum le compte admin au démarrage
const DEFAULT_INITIAL_USERS = [
  {
    id: "USR-ADM-000", name: "Superviseur SI", alias: "admin.si", role: "Direction SI",
    dept: "Système d'Information", process: "ALL", level: 6, avatar: "AD", color: "#C41E3A",
    isAdmin: true, accountStatus: "ACTIF", isActive: true,
    email: "admin@genie-consultant.com", adresse: "Siège Social",
    passwordHash: "",  // Will be set during hydration
  },
  {
    id: "USR-DG-001", name: "Directeur Général", alias: "dg.genie", role: "Directeur Général",
    dept: "Direction Générale", process: "P01", level: 5, avatar: "DG", color: "#C9A84C",
    isMG: true, accountStatus: "ACTIF", isActive: true,
    email: "dg@genie-consultant.com", adresse: "Direction Générale",
    passwordHash: "",  // Will be set during hydration
  },
];

// [C1] auditLog — corrigé pour fonctionner en mode sync ET async
async function auditLog(userId, action, target, detail, ip = null) {
  try {
    if (!dbReady) return;
    const ts = Math.floor(Date.now() / 1000);
    const params = [userId, action, target, detail, ip || 'unknown', ts];
    const sql = 'INSERT INTO si_audit(user_id,action,target,detail,ip,ts) VALUES(?,?,?,?,?,?)';
    if (dbMode === 'sqlite3') {
      await runAsync(sql, params);
    } else {
      db.prepare(sql).run(...params);
    }
  } catch (e) {
    // Ne jamais laisser une erreur d'audit crasher la route principale
    console.error('[audit] Erreur:', e.message);
  }
}

async function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
    return bcrypt.compare(plain, stored);
  }
  if (stored.length === 64 && /^[0-9a-fA-F]{64}$/.test(stored)) {
    const sha = crypto.createHash('sha256').update(plain + GC_SHA256_SALT).digest('hex');
    return sha === stored;
  }
  return false;
}

// ── Init SQLite ─────────────────────────────────────────────────────────────
async function initDatabase() {
  // Essai 1 : better-sqlite3 (synchrone, recommandé)
  try {
    const BetterSQLite3 = await import('better-sqlite3').then(m => m.default || m).catch(() => null);
    if (BetterSQLite3) {
      db = new BetterSQLite3(DB_FILE, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : null,
      });
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('foreign_keys = ON');
      db.pragma('cache_size = -64000');
      db.pragma('page_size = 4096');
      // [C4] WAL auto-checkpoint toutes les 1000 pages (~4 MB)
      db.pragma('wal_autocheckpoint = 1000');
      const maxPages = Math.floor((MAX_DB_GB * 1024 * 1024 * 1024) / 4096);
      db.pragma(`max_page_count = ${maxPages}`);
      createTables();
      dbReady = true;
      dbMode  = 'better-sqlite3';
      console.log(`✅ SQLite (better-sqlite3) : ${DB_FILE} — max ${MAX_DB_GB} GB`);
      return 'better-sqlite3';
    }
  } catch(e) { console.warn('[DB] better-sqlite3 indisponible:', e.message); }

  // Essai 2 : sqlite3 (asynchrone)
  try {
    const sqlite3 = await import('sqlite3').then(m => m.default || m).catch(() => null);
    if (sqlite3) {
      await new Promise((res, rej) => {
        db = new sqlite3.Database(DB_FILE, err => err ? rej(err) : res());
      });
      db._mode = 'async'; // flag interne pour compatibilité helpers
      await runAsync('PRAGMA journal_mode=WAL');
      await runAsync('PRAGMA synchronous=NORMAL');
      await runAsync('PRAGMA foreign_keys=ON');
      await runAsync('PRAGMA wal_autocheckpoint=1000'); // [C4]
      await createTablesAsync();
      dbReady = true;
      dbMode  = 'sqlite3';
      console.log(`✅ SQLite (sqlite3 async) : ${DB_FILE}`);
      return 'sqlite3';
    }
  } catch(e) { console.warn('[DB] sqlite3 indisponible:', e.message); }

  console.warn('⚠️  SQLite non disponible — mode JSON fallback');
  dbMode = 'json';
  return 'json-fallback';
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS si_data (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_by TEXT    DEFAULT NULL,
      size_bytes INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_si_data_updated ON si_data(updated_at DESC);

    CREATE TABLE IF NOT EXISTS si_files (
      id            TEXT PRIMARY KEY,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT DEFAULT 'application/octet-stream',
      size_bytes    INTEGER DEFAULT 0,
      dossier_id    TEXT DEFAULT NULL,
      module        TEXT DEFAULT 'general',
      uploaded_by   TEXT DEFAULT NULL,
      uploaded_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      disk_path     TEXT NOT NULL,
      compressed    INTEGER DEFAULT 0,
      compressed_path TEXT DEFAULT NULL,
      checksum      TEXT DEFAULT NULL,
      deleted       INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_files_dossier  ON si_files(dossier_id);
    CREATE INDEX IF NOT EXISTS idx_files_module   ON si_files(module);
    CREATE INDEX IF NOT EXISTS idx_files_uploaded ON si_files(uploaded_at DESC);

    CREATE TABLE IF NOT EXISTS si_file_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT,
      version_id TEXT,
      filename TEXT,
      disk_path TEXT,
      checksum TEXT,
      size_bytes INTEGER,
      mime_type TEXT,
      uploaded_by TEXT,
      uploaded_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_file_versions_file ON si_file_versions(file_id);

    CREATE TABLE IF NOT EXISTS si_audit (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action  TEXT,
      target  TEXT,
      detail  TEXT,
      ip      TEXT,
      ts      INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts   ON si_audit(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON si_audit(user_id);

    CREATE TABLE IF NOT EXISTS si_offline_queue (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT,
      key       TEXT,
      value     TEXT,
      action    TEXT DEFAULT 'set',
      queued_at INTEGER DEFAULT (strftime('%s','now')),
      processed INTEGER DEFAULT 0
    );
  `);
  ensureSiFilesColumns();
}

function addColumnIfMissing(table, column, definition) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!rows.some(row => row.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    console.log(`[DB] colonne ajoutée ${table}.${column}`);
  }
}

function ensureSiFilesColumns() {
  addColumnIfMissing('si_files', 'compressed', 'INTEGER DEFAULT 0');
  addColumnIfMissing('si_files', 'compressed_path', 'TEXT DEFAULT NULL');
  // FIX BUG-FILE-ACCESS : Ajout colonne access_level pour contrôle d'accès par niveau
  addColumnIfMissing('si_files', 'access_level', 'INTEGER DEFAULT 1');
}

async function createTablesAsync() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS si_data(key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_by TEXT, size_bytes INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS si_files(id TEXT PRIMARY KEY, filename TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT DEFAULT 'application/octet-stream', size_bytes INTEGER DEFAULT 0, dossier_id TEXT, module TEXT DEFAULT 'general', uploaded_by TEXT, uploaded_at INTEGER DEFAULT (strftime('%s','now')), disk_path TEXT NOT NULL, compressed INTEGER DEFAULT 0, compressed_path TEXT, checksum TEXT, deleted INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS si_audit(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT, target TEXT, detail TEXT, ip TEXT, ts INTEGER DEFAULT (strftime('%s','now')))`,
    `CREATE TABLE IF NOT EXISTS si_offline_queue(id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT, key TEXT, value TEXT, action TEXT DEFAULT 'set', queued_at INTEGER DEFAULT (strftime('%s','now')), processed INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS si_file_versions(id INTEGER PRIMARY KEY AUTOINCREMENT, file_id TEXT, version_id TEXT, filename TEXT, disk_path TEXT, checksum TEXT, size_bytes INTEGER, mime_type TEXT, uploaded_by TEXT, uploaded_at INTEGER DEFAULT (strftime('%s','now')))`,
    `CREATE INDEX IF NOT EXISTS idx_file_versions_file ON si_file_versions(file_id)`,
    `CREATE INDEX IF NOT EXISTS idx_si_data_updated ON si_data(updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_files_dossier ON si_files(dossier_id)`,
    `CREATE INDEX IF NOT EXISTS idx_files_module ON si_files(module)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_ts ON si_audit(ts DESC)`,
  ];
  for (const sql of stmts) { try { await runAsync(sql); } catch(e) {} }
  await ensureSiFilesColumnsAsync();
}

async function addColumnIfMissingAsync(table, column, definition) {
  const rows = await allAsync(`PRAGMA table_info(${table})`);
  if (!rows.some(row => row.name === column)) {
    await runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[DB] colonne ajoutée ${table}.${column}`);
  }
}

async function ensureSiFilesColumnsAsync() {
  await addColumnIfMissingAsync('si_files', 'compressed', 'INTEGER DEFAULT 0');
  await addColumnIfMissingAsync('si_files', 'compressed_path', 'TEXT DEFAULT NULL');
}

// ── Helpers SQLite unifiés ──────────────────────────────────────────────────
function runAsync(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(err) {
    err ? rej(err) : res({ lastID: this.lastID, changes: this.changes });
  }));
}
function getAsync(sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
}
function allAsync(sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
}

// [C10] dbGet — distingue "non trouvé" (null) de "erreur DB" (throw)
async function dbGet(key) {
  if (!dbReady) return null;
  try {
    let row;
    if (dbMode === 'sqlite3') {
      row = await getAsync('SELECT value, updated_at FROM si_data WHERE key = ?', [key]);
    } else {
      row = db.prepare('SELECT value, updated_at FROM si_data WHERE key = ?').get(key);
    }
    if (!row) return null; // clé absente → null propre
    // FIX BUG-B15 — Distinguer "non trouvé" (null) de "données corrompues" (throw).
    // Si JSON.parse échoue, on log + alerte et on throw pour que l'appelant puisse
    // répondre 500 au client au lieu de masquer la corruption en répondant 404.
    try {
      return JSON.parse(row.value);
    } catch (parseErr) {
      const errMsg = `[dbGet] DONNÉES CORROMPUES pour clé "${key}": ${parseErr.message}`;
      console.error(errMsg);
      // Marquer dans l'audit log pour investigation
      try { auditLog('system', 'CORRUPTION', key, errMsg, 'server').catch(() => {}); } catch (_) {}
      const e = new Error(errMsg);
      e.code = 'CORRUPT_DATA';
      throw e;
    }
  } catch(e) {
    if (e.code === 'CORRUPT_DATA') throw e; // remonter les corruptions
    console.error(`[dbGet] Erreur pour clé "${key}":`, e.message);
    return null;
  }
}

async function dbSet(key, value, userId = null) {
  if (!dbReady) return false;
  const val  = JSON.stringify(value);
  const size = Buffer.byteLength(val, 'utf8');
  const ts   = Math.floor(Date.now() / 1000);
  const sql  =
    'INSERT INTO si_data(key,value,updated_at,updated_by,size_bytes) VALUES(?,?,?,?,?) ' +
    'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, ' +
    'updated_by=excluded.updated_by, size_bytes=excluded.size_bytes';
  try {
    if (dbMode === 'sqlite3') {
      await runAsync(sql, [key, val, ts, userId, size]);
    } else {
      db.prepare(sql).run(key, val, ts, userId, size);
    }
    return true;
  } catch(e) {
    console.error(`[dbSet] Erreur pour clé "${key}":`, e.message);
    return false;
  }
}

async function dbDelete(key) {
  if (!dbReady) return false;
  try {
    if (dbMode === 'sqlite3') await runAsync('DELETE FROM si_data WHERE key = ?', [key]);
    else db.prepare('DELETE FROM si_data WHERE key = ?').run(key);
    return true;
  } catch(e) { return false; }
}

// Comme dbGet mais retourne aussi updated_at (Unix secondes → ms) pour le client
async function dbGetWithMeta(key) {
  if (!dbReady) return null;
  try {
    let row;
    if (dbMode === 'sqlite3') {
      row = await getAsync('SELECT value, updated_at FROM si_data WHERE key = ?', [key]);
    } else {
      row = db.prepare('SELECT value, updated_at FROM si_data WHERE key = ?').get(key);
    }
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value), updatedAt: (row.updated_at || 0) * 1000 };
    } catch { return null; }
  } catch(e) { return null; }
}

async function dbGetAll() {
  if (!dbReady) return {};
  try {
    const rows = dbMode === 'sqlite3'
      ? await allAsync('SELECT key, value FROM si_data ORDER BY updated_at DESC')
      : db.prepare('SELECT key, value FROM si_data ORDER BY updated_at DESC').all();
    const result = {};
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value); } catch(e) { result[row.key] = row.value; }
    }
    return result;
  } catch(e) { return {}; }
}

async function dbStats() {
  try {
    if (!dbReady) return { keys: 0, size_bytes: 0, files: 0 };
    let row, frow;
    if (dbMode === 'sqlite3') {
      row  = await getAsync('SELECT COUNT(*) as cnt, SUM(size_bytes) as total FROM si_data');
      frow = await getAsync('SELECT COUNT(*) as cnt, SUM(size_bytes) as fsize FROM si_files WHERE deleted=0');
    } else {
      row  = db.prepare('SELECT COUNT(*) as cnt, SUM(size_bytes) as total FROM si_data').get();
      frow = db.prepare('SELECT COUNT(*) as cnt, SUM(size_bytes) as fsize FROM si_files WHERE deleted=0').get();
    }
    const dbSize      = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0;
    const uploadsSize = getDirSize(UPLOADS_DIR);
    // WAL file size monitoring [C4]
    const walSize = fs.existsSync(DB_FILE + '-wal') ? fs.statSync(DB_FILE + '-wal').size : 0;
    return {
      keys:              row?.cnt   || 0,
      data_size_bytes:   row?.total || 0,
      files:             frow?.cnt  || 0,
      files_size_bytes:  frow?.fsize || 0,
      db_file_bytes:     dbSize,
      wal_file_bytes:    walSize,
      uploads_dir_bytes: uploadsSize,
      total_bytes:       dbSize + uploadsSize,
      capacity_used_pct: Math.round((dbSize + uploadsSize) / (MAX_DB_GB * 1024 * 1024 * 1024) * 100),
    };
  } catch(e) { return { error: e.message }; }
}

function getDirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      try {
        const full = path.join(dir, f);
        const s = fs.statSync(full);
        total += s.isDirectory() ? getDirSize(full) : s.size;
      } catch(e) {}
    }
  } catch(e) {}
  return total;
}

// [C12] Purge automatique si_audit > 30 jours
async function purgeOldAuditLogs() {
  if (!dbReady) return;
  const cutoff = Math.floor(Date.now() / 1000) - (30 * 24 * 3600);
  try {
    if (dbMode === 'sqlite3') await runAsync('DELETE FROM si_audit WHERE ts < ?', [cutoff]);
    else db.prepare('DELETE FROM si_audit WHERE ts < ?').run(cutoff);
  } catch(e) {}
}

// [C11] JSON Fallback atomique (temp + rename)
const JSON_FILE = path.join(DATA_DIR, 'si_data_fallback.json');
function jsonLoad() {
  try { return JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')); } catch { return {}; }
}
function jsonSave(data) {
  const tmp = JSON_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, JSON_FILE); // atomique sur même filesystem
  } catch(e) {
    try { fs.unlinkSync(tmp); } catch(_) {}
  }
}

// ── Express + HTTP + Socket.IO ───────────────────────────────────────────────
const app    = express();
const server = createServer(app);
const io     = new SocketIO(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin === ALLOWED_ORIGIN || LOCAL_NETWORK_ORIGIN.test(origin)) return callback(null, true);
      return callback(new Error(`Origin non autorisée: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout:  60000,
  pingInterval: 25000,
  // [C5] Fermeture propre des connexions WebSocket à l'arrêt
  transports: ['websocket', 'polling'],
});

// ── Sécurité Helmet ─────────────────────────────────────────────────────────
// [FIX v153-B] hsts:false — Le serveur tourne en HTTP pur (pas de certificat SSL).
// Activer HSTS sur HTTP causerait un verrouillage navigateur de 12 mois après la 1ère visite.
// [FIX v153-C] CSP connectSrc — Les wildcards "192.168.*.*:*" ne sont PAS valides en CSP.
// La spec autorise uniquement *.domaine.tld ou des schémas complets. On utilise
// "http:" et "ws:" (schémes permissifs) suffisants pour un réseau local isolé.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'", "https://cdn.socket.io"],
      connectSrc: [
        "'self'",
        // Schémas HTTP/WS — couvre tout le réseau local (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        // sans wildcards non-standards rejetés par les navigateurs
        "http:", "ws:",
        // APIs IA externes (HTTPS uniquement)
        "https://cdn.socket.io",
        "https://generativelanguage.googleapis.com",
        "https://api.anthropic.com",
        "https://api.openai.com",
      ],
      imgSrc:  ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
    },
  },
  // [FIX v153-B] HSTS désactivé : serveur HTTP-only, pas de certificat SSL
  hsts: false,
}));

// Compression GZIP pour améliorer performances réseau
app.use(compression());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    // [FIX-CORS-DYNAMIC] Accepter localhost ET tout 192.168.1.x / 10.x.x.x / 172.16-31.x.x
    if (origin === ALLOWED_ORIGIN || LOCAL_NETWORK_ORIGIN.test(origin)) return cb(null, true);
    cb(new Error(`CORS bloqué: ${origin}`));
  },
  credentials: true,
}));

// [FIX v153-L] Body limit aligné sur MAX_VALUE_MB (10 MB) + 2 MB overhead encodage
// Avant : 50 MB → chargeait inutilement 40 MB en RAM avant rejet métier
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// ── Logging minimal ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    const ip = req.ip || req.connection?.remoteAddress || '?';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} — ${ip}`);
  }
  res.setHeader('X-API-Version', PROXY_VERSION);
  next();
});
// [C6] CSRF middleware supprimé (était purement décoratif, aucune validation)

// ── Rate limiting ────────────────────────────────────────────────────────────
const rateLimiter = (max = 100, windowMs = 60_000) =>
  rateLimit({ max, windowMs, standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' }) });

// ── Multer — upload fichiers ─────────────────────────────────────────────────
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const subdir = path.join(UPLOADS_DIR,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0')
    );
    fs.mkdirSync(subdir, { recursive: true });
    cb(null, subdir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

// [FIX v153-H] Validation upload renforcée : extensions bloquées + MIME whitelist
// + détection double-extension (file.pdf.exe → bloqué)
const BLOCKED_EXTS = new Set([
  '.exe','.bat','.cmd','.sh','.ps1','.scr','.vbs','.msi','.com','.jar',
  '.py','.rb','.pl','.php','.asp','.aspx','.jsp','.dmg','.app','.deb','.rpm',
]);

// MIME types autorisés (whitelist positive) — couvre tous les besoins métier du SI
const ALLOWED_MIMES = new Set([
  'image/jpeg','image/png','image/gif','image/webp','image/svg+xml','image/bmp','image/tiff',
  'application/pdf',
  'text/plain','text/csv','text/html','text/xml','application/xml',
  'application/json',
  // Office Open XML (docx, xlsx, pptx)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Office legacy (doc, xls, ppt)
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  // Archives (lecture seule, jamais exécutées)
  'application/zip','application/x-zip-compressed',
  'application/x-rar-compressed','application/x-7z-compressed',
  // Audio/Vidéo pour pièces jointes
  'audio/mpeg','audio/wav','audio/ogg',
  'video/mp4','video/webm','video/ogg',
  // Autres formats bureautiques courants
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const originalName = file.originalname || '';
    // Bloquer les doubles extensions (ex: facture.pdf.exe)
    const parts = originalName.split('.');
    if (parts.length > 2) {
      const secondToLast = '.' + parts[parts.length - 2].toLowerCase();
      if (BLOCKED_EXTS.has(secondToLast)) {
        return cb(new Error(`Double extension suspecte détectée : ${originalName}`));
      }
    }
    const ext = path.extname(originalName).toLowerCase();
    if (BLOCKED_EXTS.has(ext)) return cb(new Error(`Extension non autorisée : ${ext}`));
    // Whitelist MIME positive
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new Error(`Type MIME non autorisé : ${file.mimetype}. Utilisez PDF, Word, Excel, image ou archive.`));
    }
    cb(null, true);
  },
});

// [C15] Multer error middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Fichier trop grand (max ${MAX_FILE_MB} MB)` });
    return res.status(400).json({ error: `Erreur upload: ${err.message}` });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
};

// ── Broadcast ────────────────────────────────────────────────────────────────
// [C8] Prend en compte X-Socket-Id pour exclure l'expéditeur du broadcast
function broadcast(event, payload, excludeSocketId = null) {
  if (excludeSocketId) {
    // Émettre à tous sauf l'expéditeur
    for (const [sid] of io.sockets.sockets) {
      if (sid !== excludeSocketId) {
        io.to(sid).emit(event, payload);
      }
    }
  } else {
    io.emit(event, payload);
  }
}

// ── WebSocket ────────────────────────────────────────────────────────────────
const connectedClients = new Map();
const MAX_CLIENTS = 500; // [C14]

// [FIX-LOCKOUT] Account lockout tracking (username → {count, lockedUntil})
const failedLogins = new Map();
const LOCKOUT_THRESHOLD = 5;        // failures before lock
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes in ms

io.on('connection', (socket) => {
  const ip = socket.handshake.address || 'unknown';

  // [C14] Limite taille de la map
  if (connectedClients.size >= MAX_CLIENTS) {
    socket.disconnect(true);
    return;
  }

  connectedClients.set(socket.id, { userId: null, ip, connectedAt: Date.now() });
  console.log(`🔌 Client connecté: ${socket.id} (${ip}) — total: ${connectedClients.size}`);

  // [FIX v153-J] Identification WebSocket
  // AVANT : sans token, le client pouvait passer n'importe quel userId → usurpation d'identité
  // APRÈS : sans token, le client est systématiquement enregistré comme ANONYMOUS (ID = socket.id)
  //         Son userId client-fourni est IGNORÉ. Seul le JWT confère un userId réel.
  socket.on('identify', (data) => {
    try {
      const token = data?.token;
      if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
          if (err) {
            socket.emit('identified', { ok: false, error: 'Token invalide ou expiré' });
            return;
          }
          const info = connectedClients.get(socket.id) || {};
          Object.assign(info, { userId: user.id, userName: user.username, role: user.role, level: user.level, verified: true });
          connectedClients.set(socket.id, info);
          socket.emit('identified', { ok: true, socketId: socket.id, clients: connectedClients.size, verified: true });
          console.log(`👤 Identifié (JWT): ${user.username} (${socket.id})`);
          auditLog(user.id, 'WS_CONNECT', 'socket', 'Connexion WebSocket vérifiée', ip);
        });
        return;
      }
      // Pas de token → anonyme pur : userId client ignoré pour éviter l'usurpation
      const info = connectedClients.get(socket.id) || {};
      Object.assign(info, { userId: `anon-${socket.id}`, userName: 'Anonyme', role: 'GUEST', level: 0, verified: false });
      connectedClients.set(socket.id, info);
      socket.emit('identified', { ok: true, socketId: socket.id, clients: connectedClients.size, verified: false, anonymous: true });
    } catch (e) {
      socket.emit('identified', { ok: false, error: 'Erreur identification' });
    }
  });

  // [C3][FIX v153-K] Flush offline queue — userId pris du registre JWT vérifié (pas du client)
  socket.on('flush_offline_queue', async (items) => {
    if (!Array.isArray(items) || !items.length) return;

    // Utiliser le userId vérifié côté serveur (anti-usurpation dans l'audit log)
    const clientInfo = connectedClients.get(socket.id) || {};
    const verifiedUserId = clientInfo.verified ? clientInfo.userId : 'offline-anonymous';

    const batch = items.slice(0, 200);
    let synced = 0;

    const doFlush = async () => {
      for (const item of batch) {
        if (!item?.key || !isAllowedKey(item.key)) continue;
        if (item.value === undefined || item.value === null) continue;
        const validated = validateAndSanitizeValue(item.key, item.value);
        if (!validated.valid) continue;
        const valJson = JSON.stringify(validated.sanitized);
        if (Buffer.byteLength(valJson, 'utf8') > MAX_VALUE_MB * 1024 * 1024) continue;
        const ok = await dbSet(item.key, validated.sanitized, verifiedUserId);
        if (ok) {
          synced++;
          broadcast('data_changed', { key: item.key, action: 'set', by: verifiedUserId, ts: Date.now() }, socket.id);
        }
      }
    };

    if (dbMode === 'better-sqlite3') {
      try {
        db.transaction(() => {
          for (const item of batch) {
            if (!item?.key || !isAllowedKey(item.key)) continue;
            if (item.value === undefined || item.value === null) continue;
            const vr = validateAndSanitizeValue(item.key, item.value);
            if (!vr.valid) continue;
            const val = JSON.stringify(vr.sanitized);
            if (Buffer.byteLength(val, 'utf8') > MAX_VALUE_MB * 1024 * 1024) continue;
            const ts = Math.floor(Date.now() / 1000);
            db.prepare(
              'INSERT INTO si_data(key,value,updated_at,updated_by,size_bytes) VALUES(?,?,?,?,?) ' +
              'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, ' +
              'updated_by=excluded.updated_by, size_bytes=excluded.size_bytes'
            ).run(item.key, val, ts, verifiedUserId, Buffer.byteLength(val, 'utf8'));
            synced++;
          }
        })();
        for (const item of batch.slice(0, synced)) {
          if (item?.key && isAllowedKey(item.key)) {
            broadcast('data_changed', { key: item.key, action: 'set', by: verifiedUserId, ts: Date.now() }, socket.id);
          }
        }
      } catch(e) {
        console.error('[flush] Transaction error:', e.message);
        try { await doFlush(); } catch(doFlushErr) {
          // TASK6 FIX: propager l'erreur au client au lieu de la swallower
          socket.emit('flush_result', { ok: false, synced: 0, error: doFlushErr.message });
          return;
        }
      }
    } else {
      try { await doFlush(); } catch(e) {
        // TASK6 FIX: propager l'erreur au client
        socket.emit('flush_result', { ok: false, synced: 0, error: e.message });
        return;
      }
    }

    socket.emit('flush_result', { synced, total: batch.length });
    console.log(`📥 Flush offline: ${synced}/${batch.length} items by ${verifiedUserId}`);
  });

  // COLLECT-PUSH — Le client signale qu'il a terminé de pousser ses données
  socket.on('push_complete', ({ collectId, pushed }) => {
    const info = connectedClients.get(socket.id);
    if (info) info.pushComplete = true;
    console.log(`[COLLECT] ${info?.userId || socket.id} a poussé ${pushed} clés (collectId=${collectId})`);
  });

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
    console.log(`🔌 Déconnecté: ${socket.id} — total: ${connectedClients.size}`);
  });
});

// ═══════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════

app.get('/health', async (req, res) => {
  const stats = await dbStats();
  res.json({ ok: true, version: PROXY_VERSION, db: dbMode, clients: connectedClients.size, uptime: Math.round(process.uptime()), ...stats });
});

// Operational metrics (lightweight)
app.get('/api/status/metrics', rateLimiter(30), authenticateToken, async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const dbSize = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0;
    const uploadsSize = getDirSize(UPLOADS_DIR);
    const filesCountRow = dbReady ? (dbMode === 'sqlite3' ? await getAsync('SELECT COUNT(*) as cnt FROM si_files WHERE deleted=0') : db.prepare('SELECT COUNT(*) as cnt FROM si_files WHERE deleted=0').get()) : { cnt: 0 };
    const redisInfo = redisAvailable ? await (async () => { try { return await redisClient.info(); } catch(e){ return null; } })() : null;
    res.json({ ok: true, uptime: Math.round(process.uptime()), clients: connectedClients.size, memory: mem, dbSize, uploadsSize, filesCount: filesCountRow?.cnt || 0, redis: !!redisInfo, ts: Date.now() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Audit logs listing (admin level 4+)
app.get('/api/audit/logs', rateLimiter(30), authenticateToken, async (req, res) => {
  if ((req.user?.level || 0) < 4) return res.status(403).json({ error: 'Niveau 4 requis' });
  const { userId, action, target, from, to, limit = '200' } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 200, 2000);
  try {
    let sql = 'SELECT id,user_id,action,target,detail,ip,ts FROM si_audit WHERE 1=1';
    const params = [];
    if (userId) { sql += ' AND user_id=?'; params.push(userId); }
    if (action) { sql += ' AND action=?'; params.push(action); }
    if (target) { sql += ' AND target=?'; params.push(target); }
    if (from) { sql += ' AND ts>=?'; params.push(parseInt(from, 10)); }
    if (to) { sql += ' AND ts<=?'; params.push(parseInt(to, 10)); }
    sql += ' ORDER BY ts DESC LIMIT ?'; params.push(lim);
    const rows = dbMode === 'sqlite3' ? await allAsync(sql, params) : db.prepare(sql).all(...params);
    res.json({ ok: true, count: rows.length, logs: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// FIX vSERVER-TIME — Heure du serveur (référence unique pour tout le SI)
// Permet aux clients de calculer leur décalage et d'afficher la même heure partout.
app.get('/api/server-time', (req, res) => {
  res.json({ time: new Date().toISOString(), ts: Date.now() });
});

app.get('/', (req, res) => res.json({
  name: `SI Génie Consultant — Proxy v${PROXY_VERSION}`,
  db: dbMode, clients: connectedClients.size,
  endpoints: ['/health', '/api/data', '/api/files', '/api/ai', '/api/backup'],
}));

// ── Auth JWT ─────────────────────────────────────────────────────────────────
app.post('/api/auth/register', [
  body('username').isLength({ min: 3, max: 50 }),
  body('password').isLength({ min: 8 }),
  body('email').isEmail(),
  handleValidationErrors,
], rateLimiter(5), async (req, res) => {
  try {
    const { username, password, email } = req.body;
    const existing = await dbGet('gc-users');
    if (existing?.length > 0) return res.status(403).json({ error: 'Inscription désactivée' });
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = { id: 'admin', username, email, passwordHash, role: 'ADMIN', level: 6, accountStatus: 'ACTIF', createdAt: new Date().toISOString() };
    await dbSet('gc-users', [user]);
    const token = jwt.sign({ id: user.id, username, role: user.role, level: user.level }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    await auditLog(user.id, 'REGISTER', 'user', `Premier utilisateur ${username}`);
    res.json({ ok: true, token, user: { id: user.id, username, role: user.role, level: user.level } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', [
  body('username').notEmpty(),
  body('password').notEmpty(),
  handleValidationErrors,
], rateLimiter(10), async (req, res) => {
  try {
    const { username, password } = req.body;

    // [FIX-LOCKOUT-CHECK] Check if account is locked
    const lockInfo = failedLogins.get(username);
    if (lockInfo && lockInfo.lockedUntil > Date.now()) {
      const remainingMin = Math.ceil((lockInfo.lockedUntil - Date.now()) / (60 * 1000));
      return res.status(429).json({ error: `Compte verrouillé. Réessayez dans ${remainingMin}min` });
    }

    // [FIX-AUTH-1] Chercher d'abord dans gc-users (table JWT), puis fallback sur users (table complète)
    let gcUsers = await dbGet('gc-users') || [];
    let user = gcUsers.find(u =>
      u.username === username || u.alias === username ||
      u.email === username || u.id === username);

    if (!user) {
      // Fallback : chercher dans la clé 'users' (profils complets créés depuis l'admin UI)
      const allUsers = await dbGet('users') || [];
      const found = Array.isArray(allUsers)
        ? allUsers.find(u =>
            u.alias === username || u.username === username ||
            u.email === username || u.id === username)
        : null;
      if (found) {
        // Auto-enregistrement dans gc-users pour les connexions futures
        const gcEntry = {
          id:            found.id,
          username:      found.alias || found.id,
          email:         found.email || '',
          passwordHash:  found.passwordHash || '',
          role:          found.role || 'Collaborateur',
          level:         found.level ?? 1,
          accountStatus: found.accountStatus || 'ACTIF',
        };
        gcUsers = gcUsers.filter(u => u.id !== found.id); // éviter doublon
        gcUsers.push(gcEntry);
        await dbSet('gc-users', gcUsers);
        user = gcEntry;
        console.log(`[AUTH] Utilisateur '${username}' auto-enregistré dans gc-users depuis users`);
      }
    }

    let authOk = user && (await verifyPassword(password, user.passwordHash || ''));
    if (!authOk && user && !user.passwordHash) {
      // Hash vide (écrasé par un push client stale) → tenter le mot de passe par défaut (6 derniers chars de l'ID)
      const defaultPwd = user.id ? user.id.slice(-6) : '';
      if (defaultPwd && password === defaultPwd) {
        user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await dbSet('gc-users', gcUsers);
        console.log(`[HASH-RECOVERY] Hash régénéré pour ${user.id}`);
        failedLogins.delete(username);
        authOk = true;
      }
    }
    if (!user || !authOk) {
      // [FIX-LOCKOUT-INCREMENT] Track failed login
      const newFailCount = (lockInfo?.count || 0) + 1;
      if (newFailCount >= LOCKOUT_THRESHOLD) {
        failedLogins.set(username, { count: newFailCount, lockedUntil: Date.now() + LOCKOUT_DURATION });
        logger?.warn(`[LOCKOUT] Account locked after ${newFailCount} failures: ${username}`);
        return res.status(429).json({ error: 'Trop de tentatives. Compte verrouillé pour 30min' });
      } else {
        failedLogins.set(username, { count: newFailCount, lockedUntil: 0 });
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }
    }
    if (user.accountStatus !== 'ACTIF') return res.status(403).json({ error: 'Compte désactivé' });

    // [FIX-LOCKOUT-RESET] Clear failed login counter on successful auth
    failedLogins.delete(username);

    // Migration SHA-256 → bcrypt à la première connexion réussie
    if (user.passwordHash && !user.passwordHash.startsWith('$2b$') && !user.passwordHash.startsWith('$2a$') && user.passwordHash.length === 64) {
      try {
        user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await dbSet('gc-users', gcUsers);
        await auditLog(user.id, 'PASSWORD_MIGRATE', 'gc-users', 'Migration SHA-256 → bcrypt', req.ip);
      } catch (err) {
        console.warn('[PASSWORD_MIGRATE] Échec de migration:', err.message);
      }
    }

    user.lastLogin = new Date().toISOString();
    await dbSet('gc-users', gcUsers);
    const token = jwt.sign(
      { id: user.id, username: user.username || user.alias, role: user.role, level: user.level || 0 },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    await auditLog(user.id, 'LOGIN', 'auth', 'Connexion réussie', req.ip);
    res.json({ ok: true, token, user: { id: user.id, username: user.username || user.alias, role: user.role, level: user.level, email: user.email } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/change-password', [
  body('oldPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
  handleValidationErrors,
], rateLimiter(10), authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const gcUsers = await dbGet('gc-users') || [];
    const user = gcUsers.find(u => u.id === req.user.id || u.username === req.user.username || u.email === req.user.email);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (!(await verifyPassword(oldPassword, user.passwordHash || ''))) {
      return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
    }
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.passwordHash = newHash;
    await dbSet('gc-users', gcUsers);
    // Propager dans 'users' avec le hash SHA-256 (pas bcrypt) pour que les clients
    // puissent toujours vérifier localement sans appel serveur.
    // gc-users conserve bcrypt (plus sécurisé côté serveur), users conserve SHA-256 (vérifiable client).
    try {
      const sha256Hash = crypto.createHash('sha256').update(newPassword + GC_SHA256_SALT).digest('hex');
      const allUsers = await dbGet('users') || [];
      if (Array.isArray(allUsers)) {
        const pu = allUsers.find(u => u.id === user.id || u.alias === user.username);
        if (pu) { pu.passwordHash = sha256Hash; await dbSet('users', allUsers); }
      }
    } catch (_) {}
    await auditLog(req.user.id, 'CHANGE_PASSWORD', 'gc-users', 'Mot de passe modifié', req.ip);
    res.json({ ok: true, message: 'Mot de passe changé avec succès' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => res.json({ ok: true, user: req.user }));

// [FIX-SYNC-AUTH] POST /api/auth/sync-users — Resync gc-users depuis users (appelable depuis l'UI Admin)
// Utile après import batch ou restauration de sauvegarde.
app.post('/api/auth/sync-users', rateLimiter(10), authenticateToken, async (req, res) => {
  if ((req.user.level || 0) < 5 && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Niveau insuffisant (Niv. 5+ requis)' });
  }
  try {
    const allUsers   = await dbGet('users')    || [];
    const gcUsers    = await dbGet('gc-users') || [];
    let added = 0, updated = 0, removed = 0;

    for (const u of allUsers) {
      if (!u.id) continue;
      const gcIdx = gcUsers.findIndex(g => g.id === u.id);
      const entry = {
        id:            u.id,
        username:      u.alias || u.id,
        email:         u.email || '',
        passwordHash:  u.passwordHash || '',
        role:          u.role || 'Collaborateur',
        level:         u.level ?? 1,
        accountStatus: u.accountStatus || 'ACTIF',
      };
      if (gcIdx === -1) { gcUsers.push(entry); added++; }
      else {
        const g = gcUsers[gcIdx];
        if (g.passwordHash !== entry.passwordHash || g.accountStatus !== entry.accountStatus ||
            g.username !== entry.username || g.level !== entry.level) {
          gcUsers[gcIdx] = { ...g, ...entry }; updated++;
        }
      }
    }
    const validIds = new Set(allUsers.map(u => u.id));
    const before   = gcUsers.length;
    const pruned   = gcUsers.filter(g => validIds.has(g.id));
    removed        = before - pruned.length;

    await dbSet('gc-users', pruned);
    await auditLog(req.user.id, 'SYNC_USERS', 'gc-users', `Sync: +${added} ajoutés, ${updated} MàJ, ${removed} supprimés`, req.ip);
    res.json({ ok: true, total: pruned.length, added, updated, removed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Données SI ───────────────────────────────────────────────────────────────
// [FIX v153-E] GET /api/data/stats : cache 30s pour éviter O(n) sur chaque appel
let _cachedStats = null, _cachedStatsAt = 0;
app.get('/api/data/stats', rateLimiter(30), authenticateToken, async (req, res) => {
  const now = Date.now();
  if (_cachedStats && now - _cachedStatsAt < 30_000) return res.json(_cachedStats);
  _cachedStats = await dbStats();
  _cachedStatsAt = now;
  res.json(_cachedStats);
});

// [FIX v153-E] GET /api/data : authentification obligatoire — endpoint de dump complet
// (150+ clés dont gc-users, gc-audit-checklist, gc-jur-kyc, gc-cabinet-info...)
// Accessible uniquement par les admins niveau 4+ pour diagnostic/export
app.get('/api/data', rateLimiter(10), authenticateToken, async (req, res) => {
  if ((req.user?.level || 0) < 4) return res.status(403).json({ error: 'Niveau 4 minimum requis pour exporter toutes les données' });
  const all = dbReady ? await dbGetAll() : jsonLoad();
  res.json({ ok: true, data: all, count: Object.keys(all).length });
});

const CRITICAL_EMPTY_ARRAY_KEYS = new Set([
  'gc-users','users','gc-dossiers','dossiers','gc-taches','taches','gc-rdvs','rdvs','gc-partners','partners'
]);

// FIX BUG-B18 — Clés de configuration globale qui ne doivent être modifiables
// QUE par un admin (level >= 6) ou un manager (level >= 4). Sans ce garde, un
// collaborateur niveau 1 pouvait modifier le nom du cabinet, la config fiscale,
// la matrice d'accès aux processus, etc. via un appel POST direct à /api/data/:key.
const ADMIN_ONLY_WRITE_KEYS = new Set([
  'gc-users',
  'gc-cabinet-info',
  'gc-fiscal-config',
  'gc-delai-config',
  'gc-process-config',
  'gc-process-app-matrix',
  'gc-app-habilitations',
  'gc-app-access-codes',
  'gc-require-conn-approval',
  'gc-si-appearance', 'siAppearance',
  'gc-si-logo-url', 'siLogoUrl',
  'gc-si-css-overrides', 'siCSSOverrides',
  'gc-circuits',
  'gc-orgigram-nodes', 'gc-orgigram-links',
  'gc-codif-registry',
]);

// [FIX v154] Vérifier si une clé nécessite l'authentification
// TASK4 FIX: n'inclure que CRITICAL_EMPTY_ARRAY_KEYS — ADMIN_ONLY_WRITE_KEYS bloque les GET légitimes
function requiresAuthenticationForKey(key) {
  return CRITICAL_EMPTY_ARRAY_KEYS.has(key);
}

function ensureAuthForKey(req, res, key) {
  // Lecture seule des clés CRITICAL_EMPTY_ARRAY_KEYS exige juste authentification.
  // Exception : 'users' est lisible sans JWT pour permettre l'affichage de l'écran
  // de connexion sur des postes frais (localStorage vide). Les champs sensibles
  // (passwordHash, password, passwordHistory) sont retirés de la réponse dans le
  // handler GET pour les clients anonymes.
  if (CRITICAL_EMPTY_ARRAY_KEYS.has(key) && key !== 'users') {
    if (!req.user || req.user.role === 'GUEST') {
      res.status(401).json({ error: 'Authentification requise pour cette ressource' });
      return false;
    }
  }
  // FIX BUG-B18 — Écriture sur clés admin-only exige niveau >= 4 (manager+)
  if (ADMIN_ONLY_WRITE_KEYS.has(key) && req.method !== 'GET') {
    const lvl = req.user?.level || 0;
    const isAdmin = req.user?.isAdmin || lvl >= 6;
    const isManager = lvl >= 4;
    if (!isAdmin && !isManager) {
      res.status(403).json({ error: 'Niveau Manager (4+) ou Admin requis pour modifier la configuration' });
      return false;
    }
  }
  return true;
}

function isArrayOfObjectsWithIds(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => item && typeof item === 'object' && (typeof item.id === 'string' || typeof item.id === 'number'));
}

// [C16] Batch lecture — filtrage isAllowedKey strict
app.post('/api/data/batch', rateLimiter(120), authenticateToken, async (req, res) => {
  const { keys = [] } = req.body;
  if (!Array.isArray(keys)) return res.status(400).json({ error: 'keys doit être un tableau' });
  const result = {};
  for (const key of keys) {
    if (typeof key !== 'string' || !isAllowedKey(key)) continue;
    if (requiresAuthenticationForKey(key) && (!req.user || req.user.role === 'GUEST')) continue;
    result[key] = dbReady ? await dbGet(key) : (jsonLoad()[key] ?? null);
  }
  res.json({ ok: true, data: result });
});

// FIX BUG-LVL1 — Filtre les données métier (dossiers, taches, rdvs) par appartenance
// pour les utilisateurs de niveau <= 3. Les niveaux 1-3 ne voient que leurs propres
// dossiers/tâches (createdBy, assignedTo, collaborators). Les niveaux 4+ voient tout.
// Les champs sensibles (passwordHash, etc.) sont retirés pour les non-admins.
function applyLevelFilter(key, value, user) {
  if (!Array.isArray(value)) return value;
  const userLevel = user?.level || 0;
  const userId    = user?.id;
  const isAdmin   = user?.isAdmin || userLevel >= 6;

  // Clés utilisateurs : retirer les champs sensibles pour les non-admins
  if (key === 'users' || key === 'gc-users') {
    if (isAdmin) return value;
    return value.map(u => {
      const { passwordHash, password, passwordHistory, pin, ...safe } = u;
      return safe;
    });
  }

  // Clés métier : filtrer par ownership pour niveaux <= 3
  const OWNERSHIP_FILTERED_KEYS = new Set(['dossiers','gc-dossiers','taches','gc-taches','rdvs','gc-rdvs']);
  if (OWNERSHIP_FILTERED_KEYS.has(key) && !isAdmin && userLevel <= 3 && userId) {
    return value.filter(item => {
      if (!item) return false;
      if (item.createdBy === userId) return true;
      if (item.assignedTo === userId) return true;
      if (item.responsable === userId) return true;
      if (Array.isArray(item.collaborators) && item.collaborators.includes(userId)) return true;
      if (Array.isArray(item.assignees) && item.assignees.includes(userId)) return true;
      return false;
    });
  }
  return value;
}

app.get('/api/data/:key', rateLimiter(800), authenticateTokenOptional, async (req, res) => {
  const key = req.params.key;
  if (!isAllowedKey(key)) return res.status(403).json({ error: `Clé non autorisée: ${key}` });
  if (!ensureAuthForKey(req, res, key)) return;
  try {
    // Use Redis cache for hot keys when available
    if (redisAvailable && CACHEABLE_KEYS.has(key)) {
      const cached = await redisGetCache(key);
      // Appliquer le filtre niveau même sur les données en cache Redis
      if (cached !== null) {
        const filtered = applyLevelFilter(key, cached, req.user);
        return res.json({ ok: true, key, value: filtered, source: 'redis' });
      }
    }

    if (dbReady) {
      let meta;
      try {
        meta = await dbGetWithMeta(key);
      } catch (corruptErr) {
        return res.status(500).json({ ok: false, error: 'Données corrompues sur le serveur', key, corrupt: true });
      }
      if (meta === null) return res.status(404).json({ ok: false, error: 'Clé introuvable', key });
      const { value, updatedAt } = meta;
      if (redisAvailable && CACHEABLE_KEYS.has(key)) await redisSetCache(key, value);
      // FIX BUG-LVL1 : Appliquer le filtrage par niveau avant de retourner
      const filteredValue = applyLevelFilter(key, value, req.user);
      return res.json({ ok: true, key, value: filteredValue, updatedAt });
    }

    const data = jsonLoad();
    if (!(key in data)) return res.status(404).json({ ok: false, error: 'Clé introuvable', key });
    const v = data[key];
    if (redisAvailable && CACHEABLE_KEYS.has(key)) await redisSetCache(key, v);
    // FIX BUG-LVL1 : Appliquer le filtrage par niveau avant de retourner
    const filteredV = applyLevelFilter(key, v, req.user);
    return res.json({ ok: true, key, value: filteredV });
  } catch (e) {
    console.error('[GET /api/data/:key] error', e && e.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// [C7][C8] Écriture clé-valeur — limite taille + broadcast sans l'émetteur
app.post('/api/data/:key', rateLimiter(800), authenticateToken, async (req, res) => {
  const key = req.params.key;
  const { value } = req.body;
  if (!isAllowedKey(key)) return res.status(403).json({ error: `Clé non autorisée: ${key}` });
  if (!ensureAuthForKey(req, res, key)) return;
  if (value === undefined) return res.status(400).json({ error: 'value requis' });

  // ✅ PHASE 2 FIX #1: Validate & sanitize input
  const validation = validateAndSanitizeValue(key, value);
  if (!validation.valid) return res.status(400).json({ error: validation.error });
  const sanitized = validation.sanitized;

  if (CRITICAL_EMPTY_ARRAY_KEYS.has(key) && Array.isArray(sanitized) && sanitized.length === 0) {
    const existing = await dbGet(key);
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({ error: 'Impossible d\'écraser des données existantes par []' });
    }
  }

  // ── FIX v140 BUG #2 — Anti-régression côté serveur (AMÉLIORÉ) ──────────────────────────
  // Un client frais (localStorage vide) peut envoyer une liste tronquée d'utilisateurs
  // (ex: 2 comptes par défaut) alors que le serveur en possède 10+.
  // Sans ce guard, le serveur remplaçait silencieusement 10 comptes par 2.
  //
  // RÈGLE AMÉLIORÉE : Seulement si incoming < 80% de existing ET existing > 10 items
  // ET seulement si le client n'a pas explicitement demandé forceOverwrite.
  // On préserve les entrées existantes non présentes dans l'entrant (identifiées par .id).
  // Les tombstones sont respectés pour éviter la résurrection d'éléments supprimés.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // Clés métier critiques : toujours faire union-merge (jamais écraser aveuglément)
  const MERGE_ALWAYS_KEYS = new Set([
    'dossiers', 'gc-dossiers', 'taches', 'gc-taches', 'rdvs', 'gc-rdvs',
    'partners', 'gc-partners', 'gc-dossier-files', 'gc-files', 'gc-docs-unified',
    'gc-standalone-docs', 'gc-messages', 'gc-notifications',
  ]);

  let finalValue = sanitized;
  if (
    isArrayOfObjectsWithIds(sanitized) &&
    !req.headers['x-force-overwrite']
  ) {
    try {
      const existing = await dbGet(key);
      // Pour MERGE_ALWAYS_KEYS : union-merge dès qu'il y a des données existantes (pas de seuil %)
      // Pour les autres : seuil < 70% (défensif)
      const shouldMerge = Array.isArray(existing) && existing.length >= 2 && (
        MERGE_ALWAYS_KEYS.has(key)
          ? true  // union-merge systématique pour clés métier
          : sanitized.length < existing.length * 0.7
      );
      if (shouldMerge) {
        const incomingIds = new Set(sanitized.map(item => item?.id).filter(Boolean));
        let tombstonedIds = new Set();
        try {
          const tombstones = await dbGet('gc-tombstones');
          if (tombstones && typeof tombstones === 'object') {
            (tombstones[key] || []).forEach(id => tombstonedIds.add(String(id)));
          }
        } catch (_) {}
        // Items du serveur absents de l'entrant (et non-tombstonés) → à préserver
        const preserved = existing.filter(item => item?.id && !incomingIds.has(item.id) && !tombstonedIds.has(String(item.id)));
        // Filtrer aussi l'entrant lui-même (exclure tombstonés dans l'entrant)
        const filteredSanitized = sanitized.filter(item => !item?.id || !tombstonedIds.has(String(item.id)));
        // Pour les conflits (même ID dans entrant ET serveur) : garder la version la plus récente
        const existingById = new Map(existing.map(i => [String(i?.id), i]));
        const resolvedIncoming = filteredSanitized.map(item => {
          if (!item?.id) return item;
          const serverItem = existingById.get(String(item.id));
          if (!serverItem) return item;
          const incomingTs = item.updatedAt || item.modifiedAt || item.createdAt || 0;
          const serverTs   = serverItem.updatedAt || serverItem.modifiedAt || serverItem.createdAt || 0;
          return incomingTs >= serverTs ? item : serverItem;
        });
        const allItems = [...resolvedIncoming, ...preserved];
        if (preserved.length > 0 || filteredSanitized.length < sanitized.length) {
          // Déduplication finale par ID
          const seenIds = new Set();
          finalValue = allItems.filter(item => {
            const id = item?.id ? String(item.id) : null;
            if (!id) return true;
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
          });
          console.warn(
            `[ANTI-REGRESSION v140+] Merge défensif pour '${key}': ` +
            `entrant=${sanitized.length}, serveur=${existing.length}, ` +
            `final=${finalValue.length} (${preserved.length} éléments préservés, ${tombstonedIds.size} tombstonés exclus)`
          );
          await auditLog(
            req.user?.id || 'anon', 'ANTI_REGRESSION', key,
            `Merge défensif: ${sanitized.length} < 80% de ${existing.length} → final ${finalValue.length}`,
            req.ip
          );
        }
      }
    } catch (mergeErr) {
      console.warn('[ANTI-REGRESSION] Erreur lecture pour merge:', mergeErr.message);
      // En cas d'erreur de lecture → continuer avec la valeur envoyée (fail-open)
    }
  }
  // Remplacer sanitized par finalValue (merge ou original) pour toutes les écritures
  const writeValue = finalValue;

  // [C7] Limite taille par valeur
  const valJson = JSON.stringify(writeValue);
  if (Buffer.byteLength(valJson, 'utf8') > MAX_VALUE_MB * 1024 * 1024) {
    return res.status(413).json({ error: `Valeur trop grande (max ${MAX_VALUE_MB} MB)` });
  }

  if (dbReady) {
    const ok = await dbSet(key, writeValue, req.user?.id || 'anonymous');
    if (!ok) return res.status(500).json({ error: 'Erreur base de données' });

    if (['gc-users','gc-dossiers','gc-taches','users','dossiers','taches','gc-account-actions'].includes(key)) {
      await auditLog(req.user?.id || 'anon', 'MODIFY', key, `Modification ${key}`, req.ip);
    }

    await redisInvalidateCache(key);

    if (key === 'users' || key === 'gc-users') try {
      let existingGcUsers = await dbGet('gc-users') || [];
      let changed = false;
      if (Array.isArray(writeValue)) {
        for (const u of writeValue) {
          if (!u.id || !u.passwordHash) continue;
          // Match uniquement par ID pour éviter les faux positifs sur alias/email partagé
          const gcIdx = existingGcUsers.findIndex(g => g.id === u.id);
          const gcEntry = {
            id:            u.id,
            username:      u.alias || u.id,
            email:         u.email || '',
            passwordHash:  u.passwordHash,
            role:          u.role || 'Collaborateur',
            level:         u.level ?? 1,
            accountStatus: u.accountStatus || 'ACTIF',
          };
          if (gcIdx === -1) {
            existingGcUsers.push(gcEntry);
            changed = true;
            console.log(`[SYNC-AUTH] Nouveau compte '${gcEntry.username}' (${gcEntry.id}) → gc-users`);
          } else {
            // Mettre à jour le hash et le statut si changés
            const g = existingGcUsers[gcIdx];
            if (g.passwordHash !== u.passwordHash || g.accountStatus !== gcEntry.accountStatus || g.level !== gcEntry.level) {
              existingGcUsers[gcIdx] = { ...g, ...gcEntry };
              changed = true;
            }
          }
        }
      } else {
        console.warn('[SYNC-AUTH] writeValue non-tableau pour', key, '— sync gc-users ignoré.');
      }
      // FIX BUG-B8 — Pruning sécurisé de gc-users.
      // Quand un admin (level >= 6) sauvegarde explicitement la liste users avec
      // header 'x-prune-users: 1' (envoyé par l'UI lors d'une suppression de compte),
      // on retire les comptes absents de la nouvelle liste. Sans ce header, on garde
      // l'ancien comportement (pas de suppression) pour éviter les pertes accidentelles
      // lors des sauvegardes partielles.
      const isAdminCall = (req.user?.level || 0) >= 6 || req.user?.isAdmin;
      const requestPrune = req.headers['x-prune-users'] === '1' && isAdminCall;
      // TASK5 FIX: ne pruner que si existingGcUsers et writeValue ont tous deux des entrées
      if (requestPrune && existingGcUsers.length > 0 && Array.isArray(writeValue) && writeValue.length > 0 && (key === 'users' || key === 'gc-users')) {
        const incomingIds = new Set(writeValue.map(u => u?.id).filter(Boolean));
        const before = existingGcUsers.length;
        existingGcUsers = existingGcUsers.filter(g => incomingIds.has(g.id));
        if (existingGcUsers.length !== before) {
          changed = true;
          console.log(`[SYNC-AUTH] Pruning admin : ${before - existingGcUsers.length} compte(s) retiré(s) de gc-users`);
        }
      }
      if (changed) {
        await dbSet('gc-users', existingGcUsers);
        console.log(`[SYNC-AUTH] gc-users synchronisé (${existingGcUsers.length} comptes)`);
      }
    } catch (syncErr) {
      console.warn('[SYNC-AUTH] Échec sync gc-users:', syncErr.message);
    }
  } else {
    // FIX v140 — utiliser writeValue (merge inclus) aussi en mode JSON fallback
    const data = jsonLoad(); data[key] = writeValue; jsonSave(data);
  }

  // DOSSIER-FS : si on sauvegarde la liste des dossiers, créer les dossiers physiques manquants
  if ((key === 'dossiers' || key === 'gc-dossiers') && Array.isArray(writeValue)) {
    setImmediate(async () => {
      for (const dossier of writeValue.slice(0, 200)) {
        if (!dossier?.id) continue;
        await ensureDossierFolder(dossier).catch(() => {});
      }
    });
  }

  // [C8] Exclure l'expéditeur du broadcast via X-Socket-Id header
  const senderSocketId = req.headers['x-socket-id'] || null;
  const writeTs = Date.now();
  broadcast('data_changed', { key, action: 'set', by: req.user?.id || 'anonymous', ts: writeTs, updatedAt: writeTs }, senderSocketId);
  res.json({ ok: true, key, saved: true, updatedAt: writeTs });
});

// GET history for a key (audit entries)
app.get('/api/data/:key/history', rateLimiter(200), authenticateToken, async (req, res) => {
  const key = req.params.key;
  if (!isAllowedKey(key)) return res.status(403).json({ error: `Clé non autorisée: ${key}` });
  if ((req.user?.level || 0) < 2) return res.status(403).json({ error: 'Niveau 2 minimum requis pour consulter l’historique' });
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 1000);
  try {
    const sql = 'SELECT id,user_id,action,target,detail,ip,ts FROM si_audit WHERE target=? ORDER BY ts DESC LIMIT ?';
    const rows = dbMode === 'sqlite3' ? await allAsync(sql, [key, limit]) : db.prepare(sql).all(key, limit);
    return res.json({ ok: true, key, history: rows });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// [C9] DELETE — vérification isAllowedKey + garde niveau pour clés métier
app.delete('/api/data/:key', rateLimiter(200), authenticateToken, async (req, res) => {
  const key = req.params.key;
  if (!isAllowedKey(key)) return res.status(403).json({ error: `Clé non autorisée: ${key}` });
  if (!ensureAuthForKey(req, res, key)) return;
  // FIX BUG-DEL1 — Les clés métier (dossiers, taches, rdvs, etc.) ne peuvent être supprimées
  // en intégralité que par un niveau 5+ ou admin. Évite qu'un niveau 1 vide toute la base.
  const BUSINESS_FULL_DELETE_LEVEL = new Set([
    'dossiers','gc-dossiers','taches','gc-taches','rdvs','gc-rdvs',
    'partners','gc-partners','gc-dossier-files','gc-files','gc-docs-unified',
    'gc-messages','gc-notifications',
  ]);
  if (BUSINESS_FULL_DELETE_LEVEL.has(key)) {
    const lvl = req.user?.level || 0;
    if (!req.user?.isAdmin && lvl < 5) {
      await auditLog(req.user?.id || 'anon', 'DELETE_DENIED', key, 'Niveau 5+ requis pour suppression totale', req.ip);
      return res.status(403).json({ error: 'Niveau 5+ requis pour supprimer une clé métier complète' });
    }
  }
  const userId = req.body?.userId || req.user?.id || 'anonymous';
  if (dbReady) {
    await dbDelete(key);
    await redisInvalidateCache(key);
  } else { const d = jsonLoad(); delete d[key]; jsonSave(d); }
  const senderSocketId = req.headers['x-socket-id'] || null;
  broadcast('data_changed', { key, action: 'delete', by: userId, ts: Date.now() }, senderSocketId);
  res.json({ ok: true, key, deleted: true });
});

// FIX v152 — DELETE /api/data/:key/item/:itemId
// Suppression chirurgicale d'un seul élément avec enregistrement tombstone.
// Garantit que l'anti-régression ne ressuscitera jamais cet item même après re-sync.
app.delete('/api/data/:key/item/:itemId', rateLimiter(200), authenticateToken, async (req, res) => {
  const { key, itemId } = req.params;
  if (!isAllowedKey(key)) return res.status(403).json({ error: `Clé non autorisée: ${key}` });
  if (!ensureAuthForKey(req, res, key)) return;
  if (!itemId) return res.status(400).json({ error: 'itemId requis' });

  // FIX BUG-DEL2 — Vérification de propriété pour suppression d'item : un utilisateur
  // de niveau 1-2 ne peut supprimer que ses propres items (createdBy ou assignedTo).
  // Les niveaux 3+ et admins peuvent supprimer n'importe quel item.
  const requestorLevel = req.user?.level || 0;
  const requestorId = req.user?.id;
  if (requestorLevel < 3 && !req.user?.isAdmin && requestorId) {
    try {
      const currentForCheck = dbReady ? await dbGet(key) : null;
      if (Array.isArray(currentForCheck)) {
        const targetItem = currentForCheck.find(i => i?.id && String(i.id) === String(itemId));
        if (targetItem) {
          const isOwner = targetItem.createdBy === requestorId || targetItem.assignedTo === requestorId || targetItem.responsable === requestorId;
          if (!isOwner) {
            await auditLog(requestorId, 'DELETE_ITEM_DENIED', key, `Item ${itemId} non-propriétaire`, req.ip);
            return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres éléments' });
          }
        }
      }
    } catch (_) {}
  }

  // 1. Enregistrer le tombstone AVANT toute modification
  try {
    let tombstones = {};
    if (dbReady) tombstones = (await dbGet('gc-tombstones')) || {};
    const tbs = new Set(tombstones[key] || []);
    tbs.add(String(itemId));
    tombstones[key] = [...tbs].slice(-5000);
    if (dbReady) await dbSet('gc-tombstones', tombstones, req.user?.id || 'anonymous');
  } catch (tErr) {
    console.warn('[DELETE-ITEM] Erreur enregistrement tombstone:', tErr.message);
  }

  // 2. Supprimer l'item du tableau en base
  if (!dbReady) return res.status(503).json({ error: 'DB indisponible' });
  try {
    const current = await dbGet(key);
    if (!Array.isArray(current)) return res.status(404).json({ error: `Clé '${key}' n'est pas un tableau` });
    const newList = current.filter(item => item?.id && String(item.id) !== String(itemId));
    await dbSet(key, newList, req.user?.id || 'anonymous');
    await redisInvalidateCache(key);
    await auditLog(req.user?.id || 'anon', 'DELETE_ITEM', key, `Suppression item ${itemId}`, req.ip);
    const senderSocketId = req.headers['x-socket-id'] || null;
    broadcast('data_changed', { key, action: 'item_delete', itemId, by: req.user?.id || 'anonymous', ts: Date.now() }, senderSocketId);
    res.json({ ok: true, key, itemId, deleted: true, remaining: newList.length });
  } catch (e) {
    console.error('[DELETE-ITEM] Erreur:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Fichiers ─────────────────────────────────────────────────────────────────
// FIX v153 — authenticateTokenOptional : l'upload n'est pas bloqué si le token est absent
// (le token est utilisé pour tracer l'uploadedBy mais n'est pas requis pour l'opération)
// Les uploads sans token sont tracés avec uploadedBy depuis req.body.uploadedBy
// [FIX v153-L] Rate limit upload réduit : 50→10/min par IP (50×500MB=25GB/min était inacceptable)
app.post('/api/files/upload', rateLimiter(10, 60_000), authenticateTokenOptional,
  (req, res, next) => upload.single('file')(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  }),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    const { dossierId, module: mod = 'general', uploadedBy, accessLevel } = req.body;
    const fileId  = `F-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const hash    = crypto.createHash('md5');
    const stream  = fs.createReadStream(req.file.path);
    await new Promise(res => stream.on('data', d => hash.update(d)).on('end', res).on('error', res));
    const checksum = hash.digest('hex');
    // Tracer l'uploader : priorité body.uploadedBy, puis user authentifié, puis 'anonymous'
    const uploaderId = uploadedBy || req.user?.id || 'anonymous';
    // FIX BUG-FILE-ACCESS : access_level envoyé par le client, clamped entre 1 et 6
    const fileAccessLvl = Math.min(6, Math.max(1, parseInt(accessLevel || '1', 10) || 1));
    const { compressed, diskPath, compressedPath } = await compressIfNeeded(req.file.path, req.file.mimetype, req.file.size);
    const meta = {
      id: fileId, filename: req.file.filename, original_name: req.file.originalname,
      mime_type: req.file.mimetype, size_bytes: req.file.size,
      dossier_id: dossierId || null, module: mod,
      uploaded_by: uploaderId,
      disk_path: diskPath,
      compressed: compressed ? 1 : 0,
      compressed_path: compressedPath,
      checksum,
      access_level: fileAccessLvl,
    };
    // Malware scan (if clamscan available)
    try {
      const scan = scanFileWithClam(meta.disk_path);
      if (scan && scan.scanned && !scan.ok) {
        // Remove file from disk and reject upload
        try { fs.unlinkSync(meta.disk_path); } catch(e) {}
        console.warn('[upload] fichier rejeté par le scanner:', scan.reason || 'infected');
        return res.status(400).json({ ok: false, error: 'Fichier rejeté (infecté) ou non conforme au scan antivirus' });
      }
    } catch(e) { console.warn('[upload] scan erreur:', e.message); }
    if (!dbReady) {
      try { if (fs.existsSync(meta.disk_path)) fs.unlinkSync(meta.disk_path); } catch (e) {}
      return res.status(503).json({ ok: false, error: 'Base de données indisponible pour l\'upload du fichier' });
    }
    try {
      const sql = `INSERT INTO si_files(id,filename,original_name,mime_type,size_bytes,dossier_id,module,uploaded_by,disk_path,compressed,compressed_path,checksum,access_level) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`;
      const params = [meta.id, meta.filename, meta.original_name, meta.mime_type, meta.size_bytes, meta.dossier_id, meta.module, meta.uploaded_by, meta.disk_path, meta.compressed, meta.compressed_path, meta.checksum, meta.access_level];
      if (dbMode === 'sqlite3') await runAsync(sql, params);
      else db.prepare(sql).run(...params);
      // Insert file version snapshot for versioning/history
      try {
        const verId = `V-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        const verSql = `INSERT INTO si_file_versions(file_id,version_id,filename,disk_path,checksum,size_bytes,mime_type,uploaded_by) VALUES(?,?,?,?,?,?,?,?)`;
        const verParams = [meta.id, verId, meta.original_name, meta.disk_path, meta.checksum, meta.size_bytes, meta.mime_type, meta.uploaded_by];
        if (dbMode === 'sqlite3') await runAsync(verSql, verParams);
        else db.prepare(verSql).run(...verParams);
      } catch (e) { console.warn('[upload] file version insert error:', e.message); }
    } catch(e) {
      console.error('[upload] meta insert error:', e.message);
      try { if (fs.existsSync(meta.disk_path)) fs.unlinkSync(meta.disk_path); } catch (err) {}
      return res.status(500).json({ ok: false, error: 'Échec de l\'enregistrement des métadonnées du fichier', details: e.message });
    }
    const uploadTs = Date.now();
    const senderSocketId = req.headers['x-socket-id'] || null;

    // FIX FILE-SYNC-1 — CRITIQUE : mettre à jour gc-dossier-files dans si_kv après chaque upload.
    // Avant ce fix, les fichiers étaient dans si_files MAIS gc-dossier-files (si_kv) n'était
    // jamais mis à jour → les autres machines fetchwaient une liste obsolète via dsGet('gc-dossier-files').
    // Maintenant : on ajoute le nouveau fichier dans la liste KV ET on broadcast data_changed
    // pour que tous les clients re-fetchent immédiatement la liste à jour.
    const fileRef = {
      id: meta.id,
      nom: meta.original_name,
      type: meta.mime_type,
      taille: meta.size_bytes,
      module: meta.module,
      dossierId: meta.dossier_id || null,
      uploadedBy: meta.uploaded_by,
      uploadedAt: new Date().toISOString(),
      synced: true,
      serverId: meta.id,
      serverUrl: `/api/files/${meta.id}`,
      checksum: meta.checksum,
    };
    try {
      // Mettre à jour gc-dossier-files (liste globale partagée)
      const currentDossierFiles = (await dbGet('gc-dossier-files')) || [];
      const updatedDossierFiles = [
        ...currentDossierFiles.filter(f => f?.id !== meta.id), // éviter doublons
        fileRef,
      ];
      await dbSet('gc-dossier-files', updatedDossierFiles, uploaderId);
      // Broadcast data_changed pour gc-dossier-files → tous les hooks useRemoteSync se rafraîchissent
      broadcast('data_changed', {
        key: 'gc-dossier-files', action: 'set',
        by: uploaderId, ts: uploadTs, updatedAt: uploadTs,
      }, senderSocketId);

      // Si module docs-unified, mettre aussi à jour gc-docs-unified
      if (meta.module === 'docs' || meta.module === 'documents') {
        const currentDocs = (await dbGet('gc-docs-unified')) || [];
        const updatedDocs = [...currentDocs.filter(f => f?.id !== meta.id), fileRef];
        await dbSet('gc-docs-unified', updatedDocs, uploaderId);
        broadcast('data_changed', {
          key: 'gc-docs-unified', action: 'set',
          by: uploaderId, ts: uploadTs, updatedAt: uploadTs,
        }, senderSocketId);
      }
    } catch (kvErr) {
      console.warn('[upload] Erreur mise à jour gc-dossier-files KV:', kvErr.message);
    }

    broadcast('file_uploaded', { id: fileId, name: req.file.originalname, size: req.file.size, module: mod, dossierId, by: uploaderId, ts: uploadTs }, senderSocketId);
    logger.log(`Upload: ${req.file.originalname} (${Math.round(req.file.size/1024)} KB) by ${uploaderId}`);
    // DOSSIER-FS : copier/lier le fichier dans le dossier physique du dossier SI
    if (dossierId) {
      try {
        // Chercher le nom du dossier pour nommer le répertoire
        let dossierName = dossierId;
        if (dbReady) {
          const dossiers = await dbGet('dossiers') || await dbGet('gc-dossiers');
          if (Array.isArray(dossiers)) {
            const d = dossiers.find(x => x.id === dossierId);
            if (d) dossierName = d.nom || d.title || d.name || dossierId;
          }
        }
        await linkFileToDossierFolder(dossierId, dossierName, fileId, req.file.originalname, meta.disk_path);
      } catch {}
    }
    res.json({ ok: true, file: {
      id: meta.id,
      filename: meta.filename,
      original_name: meta.original_name,
      mime_type: meta.mime_type,
      size_bytes: meta.size_bytes,
      dossier_id: meta.dossier_id,
      module: meta.module,
      uploaded_by: meta.uploaded_by,
      compressed: meta.compressed,
      checksum: meta.checksum,
      serverUrl: `/api/files/${meta.id}`,
    } });
  }
);

// [C16] /api/files/stats AVANT /api/files/:id
app.get('/api/files/stats', rateLimiter(60), authenticateTokenOptional, async (req, res) => {
  res.json(await dbStats());
});

app.get('/api/notifications', rateLimiter(120), authenticateTokenOptional, async (req, res) => {
  try {
    const notifications = dbReady ? await dbGet('gc-notifications') : (jsonLoad()['gc-notifications'] || []);
    return res.json({ ok: true, notifications: Array.isArray(notifications) ? notifications : [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/notifications', rateLimiter(50), authenticateToken, async (req, res) => {
  const { message, icon, metadata } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message requis' });
  const sender = req.user?.id || 'anonymous';
  try {
    const existing = (dbReady ? await dbGet('gc-notifications') : (jsonLoad()['gc-notifications'] || [])) || [];
    const notification = {
      id: `N-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      message: message.trim(),
      icon: icon || '🔔',
      metadata: metadata || {},
      createdAt: Date.now(),
      createdBy: sender,
      read: false,
    };
    const updated = [notification, ...existing].slice(0, 200);
    if (dbReady) await dbSet('gc-notifications', updated, sender);
    else { const data = jsonLoad(); data['gc-notifications'] = updated; jsonSave(data); }
    await redisInvalidateCache('gc-notifications');
    const senderSocketId = req.headers['x-socket-id'] || null;
    broadcast('data_changed', { key: 'gc-notifications', action: 'set', by: sender, ts: Date.now() }, senderSocketId);
    return res.json({ ok: true, notification, total: updated.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// FIX v152 — GET /api/files/:id/info : métadonnées sans téléchargement
// Utile pour afficher nom, taille, type avant d'ouvrir ou télécharger.
app.get('/api/files/:id/info', rateLimiter(300), authenticateTokenOptional, async (req, res) => {
  const id = req.params.id;
  if (!dbReady) return res.status(503).json({ error: 'DB indisponible' });
  try {
    const meta = dbMode === 'sqlite3'
      ? await getAsync('SELECT id, original_name, mime_type, size_bytes, uploaded_by, uploaded_at, module, dossier_id, compressed FROM si_files WHERE id=? AND deleted=0', [id])
      : db.prepare('SELECT id, original_name, mime_type, size_bytes, uploaded_by, uploaded_at, module, dossier_id, compressed FROM si_files WHERE id=? AND deleted=0').get(id);
    if (!meta) return res.status(404).json({ error: 'Fichier introuvable' });
    res.json({
      ok: true,
      id: meta.id,
      name: meta.original_name,
      mime: meta.mime_type,
      size: meta.size_bytes,
      compressed: Boolean(meta.compressed),
      uploadedBy: meta.uploaded_by,
      uploadedAt: meta.uploaded_at,
      module: meta.module,
      dossierId: meta.dossier_id,
      url: `/api/files/${meta.id}`,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET file versions
app.get('/api/files/:id/versions', rateLimiter(200), authenticateTokenOptional, async (req, res) => {
  const id = req.params.id;
  if (!dbReady) return res.status(503).json({ error: 'DB indisponible' });
  try {
    const sql = 'SELECT version_id,filename,disk_path,checksum,size_bytes,mime_type,uploaded_by,uploaded_at FROM si_file_versions WHERE file_id=? ORDER BY uploaded_at DESC';
    const rows = dbMode === 'sqlite3' ? await allAsync(sql, [id]) : db.prepare(sql).all(id);
    return res.json({ ok: true, id, versions: rows });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.get('/api/files/:id/versions/:versionId', rateLimiter(200), authenticateTokenOptional, async (req, res) => {
  const { id, versionId } = req.params;
  if (!dbReady) return res.status(503).json({ error: 'DB indisponible' });
  try {
    const sql = 'SELECT version_id,filename,disk_path,checksum,size_bytes,mime_type,uploaded_by,uploaded_at FROM si_file_versions WHERE file_id=? AND version_id=? LIMIT 1';
    const row = dbMode === 'sqlite3' ? await getAsync(sql, [id, versionId]) : db.prepare(sql).get(id, versionId);
    if (!row) return res.status(404).json({ error: 'Version introuvable' });
    return res.json({ ok: true, id, version: row });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// [FIX v153-G] GET /api/files/:id — Suppression du fallback findFileOnDisk (path traversal)
// Seule la base SQLite fait autorité. Si le fichier n'y est pas, 404 propre.
// path.resolve() vérifié pour garantir que disk_path reste dans UPLOADS_DIR.
app.get('/api/files/:id', rateLimiter(300), authenticateTokenOptional, async (req, res) => {
  const id = req.params.id;
  if (!dbReady) return res.status(503).json({ error: 'DB indisponible' });
  let meta = null;
  try {
    meta = dbMode === 'sqlite3'
      ? await getAsync('SELECT * FROM si_files WHERE id=? AND deleted=0', [id])
      : db.prepare('SELECT * FROM si_files WHERE id=? AND deleted=0').get(id);
  } catch(e) {
    return res.status(500).json({ error: 'Erreur base de données' });
  }
  if (!meta) return res.status(404).json({ error: 'Fichier introuvable' });

  // FIX BUG-FILE-ACCESS — Vérification du niveau d'accès avant d'envoyer le fichier.
  // Sans ce garde, n'importe qui (même anonyme) pouvait télécharger des fichiers
  // marqués confidentiels (access_level élevé) en connaissant simplement leur ID.
  const fileAccessLevel = meta.access_level || 1;
  const userLevel = req.user?.level || 0;
  const isAdminUser = req.user?.isAdmin || userLevel >= 6;
  if (userLevel < fileAccessLevel && !isAdminUser) {
    await auditLog(req.user?.id || 'anonymous', 'FILE_ACCESS_DENIED', id, `Niv. ${fileAccessLevel} requis, utilisateur niv. ${userLevel}`, req.ip);
    return res.status(403).json({ error: `Habilitation insuffisante — niveau ${fileAccessLevel}+ requis pour ce fichier` });
  }

  // Validation anti-path-traversal : le chemin absolu doit rester dans UPLOADS_DIR
  const realPath = path.resolve(meta.disk_path || meta.compressed_path || '');
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  if (!realPath.startsWith(uploadsRoot + path.sep) && realPath !== uploadsRoot) {
    console.error(`[SECURITY] Path traversal détecté pour fichier ${id}: ${realPath}`);
    return res.status(403).json({ error: 'Accès refusé' });
  }

  if (!fs.existsSync(realPath)) return res.status(404).json({ error: 'Fichier absent du disque' });
  const safeName = encodeURIComponent(meta.original_name).replace(/'/g, '%27').replace(/"/g, '%22');
  // FIX BUG-FILE-2 — Utiliser 'attachment' (forcer téléchargement) au lieu de 'inline'.
  // 'inline' laissait le navigateur décider d'afficher ou pas, causant des comportements
  // incohérents selon le type de fichier et le navigateur.
  // Pour la consultation (aperçu), le client utilise window.open() qui gère l'inline côté browser.
  const disposition = req.query.view === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${safeName}`);
  res.setHeader('Content-Type', meta.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (meta.compressed) {
    const stream = fs.createReadStream(realPath);
    const gunzip = zlib.createGunzip();
    stream.pipe(gunzip).on('error', err => {
      console.error('[FILE DOWNLOAD] Erreur décompression:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur de décompression' });
    }).pipe(res);
  } else {
    res.sendFile(realPath);
  }
});

app.get('/api/files', rateLimiter(200), authenticateTokenOptional, async (req, res) => {
  const { dossierId, module: mod, limit = '100' } = req.query;
  if (!dbReady) return res.json({ ok: true, files: [] });
  const lim = Math.min(parseInt(limit) || 100, 1000);
  let rows = [];
  try {
    const base = 'SELECT id,filename,original_name,mime_type,size_bytes,uploaded_at,uploaded_by,dossier_id,module,checksum FROM si_files WHERE deleted=0';
    if (dossierId) {
      const sql = `${base} AND dossier_id=? ORDER BY uploaded_at DESC LIMIT ?`;
      rows = dbMode === 'sqlite3' ? await allAsync(sql,[dossierId,lim]) : db.prepare(sql).all(dossierId,lim);
    } else if (mod) {
      const sql = `${base} AND module=? ORDER BY uploaded_at DESC LIMIT ?`;
      rows = dbMode === 'sqlite3' ? await allAsync(sql,[mod,lim]) : db.prepare(sql).all(mod,lim);
    } else {
      const sql = `${base} ORDER BY uploaded_at DESC LIMIT ?`;
      rows = dbMode === 'sqlite3' ? await allAsync(sql,[lim]) : db.prepare(sql).all(lim);
    }
  } catch(e) { rows = []; }
  res.json({ ok: true, files: rows });
});

app.delete('/api/files/:id', rateLimiter(100), authenticateToken, async (req, res) => {
  const id = req.params.id;
  if (!dbReady) return res.status(404).json({ error: 'DB indisponible' });
  let meta;
  try {
    if (dbMode === 'sqlite3') {
      meta = await getAsync('SELECT * FROM si_files WHERE id=? AND deleted=0', [id]);
      if (meta) await runAsync('UPDATE si_files SET deleted=1 WHERE id=?', [id]);
    } else {
      meta = db.prepare('SELECT * FROM si_files WHERE id=? AND deleted=0').get(id);
      if (meta) db.prepare('UPDATE si_files SET deleted=1 WHERE id=?').run(id);
    }
  } catch(e) {}
  if (meta?.disk_path && fs.existsSync(meta.disk_path)) {
    try { fs.unlinkSync(meta.disk_path); } catch(e) {}
  }
  broadcast('file_deleted', { id, ts: Date.now() });
  res.json({ ok: true, id, deleted: true });
});

// [C18] findFileOnDisk avec limite de profondeur
function findFileOnDisk(query, dir = UPLOADS_DIR, depth = 0) {
  if (depth > 5 || !fs.existsSync(dir)) return null;
  try {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      try {
        if (fs.statSync(full).isDirectory()) {
          const r = findFileOnDisk(query, full, depth + 1);
          if (r) return r;
        } else if (f.includes(query)) return full;
      } catch(e) {}
    }
  } catch(e) {}
  return null;
}

// ── IA ───────────────────────────────────────────────────────────────────────
// [FIX v153-D] Routes IA : authenticateToken obligatoire (évite consommation non-autorisée)
// [FIX v153-D] Gemini : clé déplacée dans Authorization header (plus dans l'URL/logs)
// [FIX v153-D] Validation de taille + comptage messages avant envoi
const AI_KEYS = {
  claude: process.env.CLAUDE_API_KEY || '',
  gemini: process.env.GEMINI_API_KEY || '',
  openai: process.env.OPENAI_API_KEY || '',
};

const AI_MAX_MSG_CHARS = 100_000; // 100 KB max par requête IA

function _validateAIBody(req, res) {
  const body = req.body;
  if (!body || typeof body !== 'object') { res.status(400).json({ error: 'Corps de requête invalide' }); return false; }
  const msgStr = JSON.stringify(body.messages || body.contents || body);
  if (Buffer.byteLength(msgStr, 'utf8') > AI_MAX_MSG_CHARS) {
    res.status(413).json({ error: `Requête IA trop volumineuse (max ${AI_MAX_MSG_CHARS / 1000} KB)` });
    return false;
  }
  return true;
}

// [FIX v153-K] Status IA protégé — ne révèle pas la config à un anonyme
app.get('/api/ai/status', authenticateToken, (req, res) =>
  res.json({ claude: !!AI_KEYS.claude, gemini: !!AI_KEYS.gemini, openai: !!AI_KEYS.openai })
);

app.post('/api/ai/claude', rateLimiter(10, 60_000), authenticateToken, async (req, res) => {
  if (!AI_KEYS.claude) return res.status(503).json({ error: 'CLAUDE_API_KEY non configurée' });
  if (!_validateAIBody(req, res)) return;
  try {
    const { model = 'claude-3-haiku-20240307', messages, system, max_tokens = 1000 } = req.body;
    const safeMaxTokens = Math.min(parseInt(max_tokens) || 1000, 8000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': AI_KEYS.claude, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, system, max_tokens: safeMaxTokens }),
    });
    const data = await r.json();
    res.status(r.ok ? 200 : r.status).json(data);
  } catch(e) { res.status(500).json({ error: 'Erreur proxy Claude' }); }
});

app.post('/api/ai/gemini/:model', rateLimiter(10, 60_000), authenticateToken, async (req, res) => {
  if (!AI_KEYS.gemini) return res.status(503).json({ error: 'GEMINI_API_KEY non configurée' });
  if (!_validateAIBody(req, res)) return;
  try {
    // [FIX v153-D] Clé dans le header Authorization plutôt que dans l'URL (évite fuite dans logs/proxy)
    const model = req.params.model || 'gemini-1.5-flash';
    const safeModel = model.replace(/[^a-zA-Z0-9._-]/g, '');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': AI_KEYS.gemini, 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.status(r.ok ? 200 : r.status).json(await r.json());
  } catch(e) { res.status(500).json({ error: 'Erreur proxy Gemini' }); }
});

app.post('/api/ai/gpt', rateLimiter(10, 60_000), authenticateToken, async (req, res) => {
  if (!AI_KEYS.openai) return res.status(503).json({ error: 'OPENAI_API_KEY non configurée' });
  if (!_validateAIBody(req, res)) return;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AI_KEYS.openai}`, 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.status(r.ok ? 200 : r.status).json(await r.json());
  } catch(e) { res.status(500).json({ error: 'Erreur proxy OpenAI' }); }
});

// ── Email ────────────────────────────────────────────────────────────────────
let _emailTransporter = null;
(async () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  try {
    const nm = await import('nodemailer').catch(() => null);
    if (!nm) return;
    const lib = nm.default || nm;
    _emailTransporter = lib.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await _emailTransporter.verify();
    console.log(`✅ Email SMTP: ${process.env.EMAIL_USER}`);
  } catch(e) { _emailTransporter = null; console.warn(`⚠️  Email indisponible: ${e.message}`); }
})();

// [FIX v153-F] Email : authenticateToken requis + validation destinataires + limite 3 max
// [FIX v153-L] Rate limit réduit à 3/min (10/min permettait 600 emails/heure par IP)
const _emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
app.post('/api/email', rateLimiter(3, 60_000), authenticateToken, async (req, res) => {
  if (!_emailTransporter) return res.status(503).json({ error: 'Email non configuré (voir api-proxy/.env)' });
  const { to, subject, html, text, from } = req.body;
  if (!to || !subject || (!html && !text)) return res.status(400).json({ error: 'Champs requis: to, subject, html|text' });
  const recipients = (Array.isArray(to) ? to : [to])
    .filter(r => typeof r === 'string' && _emailRegex.test(r.trim()))
    .slice(0, 3); // max 3 destinataires
  if (!recipients.length) return res.status(400).json({ error: 'Aucun destinataire email valide fourni' });
  if (subject.length > 200) return res.status(400).json({ error: 'Sujet trop long (max 200 caractères)' });
  try {
    const info = await _emailTransporter.sendMail({
      from: from || `"SI Génie" <${process.env.EMAIL_USER}>`,
      to: recipients.join(', '), subject, html, text,
    });
    await auditLog(req.user?.id || 'system', 'EMAIL_SENT', 'email', `To: ${recipients.join(',')} — ${subject}`, req.ip);
    res.json({ ok: true, messageId: info.messageId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Sync Admin ───────────────────────────────────────────────────────────────
// FIX SYNC-A1 — Statut synchronisation (admin)
// Retourne le nombre de clés, de fichiers, de clients connectés, et les dernières mise à jour.
app.get('/api/sync/status', rateLimiter(30), authenticateToken, async (req, res) => {
  try {
    const connectedClients = io.sockets.sockets.size;
    let keyCount = 0, fileCount = 0, lastUpdate = null;
    if (dbReady) {
      const row = dbMode === 'sqlite3'
        ? await getAsync('SELECT COUNT(*) as cnt FROM si_data')
        : db.prepare('SELECT COUNT(*) as cnt FROM si_data').get();
      keyCount = row?.cnt || 0;
      const fRow = dbMode === 'sqlite3'
        ? await getAsync('SELECT COUNT(*) as cnt FROM si_files WHERE deleted=0')
        : db.prepare('SELECT COUNT(*) as cnt FROM si_files WHERE deleted=0').get();
      fileCount = fRow?.cnt || 0;
      const uRow = dbMode === 'sqlite3'
        ? await getAsync('SELECT MAX(updated_at) as last FROM si_data')
        : db.prepare('SELECT MAX(updated_at) as last FROM si_data').get();
      lastUpdate = uRow?.last || null;
    }
    res.json({
      ok: true,
      connectedClients,
      keyCount,
      fileCount,
      lastUpdate,
      dbReady,
      uptime: process.uptime(),
      ts: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// FIX SYNC-A2 — Forcer resync sur tous les clients connectés (admin seulement)
// Diffuse un événement 'resync_all' sur tous les sockets, chaque client vide son cache et re-fetch.
app.post('/api/sync/resync-all', rateLimiter(5, 60_000), authenticateToken, async (req, res) => {
  if (!req.user?.isAdmin && (req.user?.level || 0) < 4) {
    return res.status(403).json({ error: 'Admin requis' });
  }
  const userId = req.user?.id || 'admin';
  const ts = Date.now();
  // Broadcast vers tous les clients connectés (y compris l'expéditeur)
  io.emit('resync_all', { by: userId, ts, reason: req.body?.reason || 'admin_resync' });
  await auditLog(userId, 'SYNC_RESYNC_ALL', 'sync', `Resync forcé par ${userId}`, req.ip);
  console.log(`[SYNC] Resync forcé par ${userId} (${io.sockets.sockets.size} clients)`);
  res.json({ ok: true, clients: io.sockets.sockets.size, ts });
});

// COLLECT-ALL — Demande à tous les clients de pousser leurs données locales vers le serveur
// Le serveur agrège via union-merge (tombstones respectés) puis rediffuse un resync_all
app.post('/api/sync/collect-all', rateLimiter(3, 120_000), authenticateToken, async (req, res) => {
  if (!req.user?.isAdmin && (req.user?.level || 0) < 6) {
    return res.status(403).json({ error: 'Admin système requis' });
  }
  const userId = req.user?.id || 'admin';
  const collectId = `collect-${Date.now()}`;
  const clientCount = io.sockets.sockets.size;

  // Réinitialiser les flags push_complete sur tous les clients
  for (const [, info] of connectedClients) info.pushComplete = false;

  // Broadcast : demander à tous les clients de pousser leurs données
  io.emit('request_push_all', { collectId, requestedBy: userId });
  await auditLog(userId, 'COLLECT_ALL', 'sync', `Collecte données tous postes (${clientCount} clients)`, req.ip);
  console.log(`[COLLECT] Collecte lancée par ${userId} — collectId=${collectId}, clients=${clientCount}`);

  // Attendre 25s que les clients poussent, puis broadcaster un resync_all
  setTimeout(() => {
    io.emit('resync_all', { by: userId, ts: Date.now(), reason: 'post_collect_resync' });
    console.log(`[COLLECT] Resync post-collecte diffusé (collectId=${collectId})`);
  }, 25000);

  res.json({ ok: true, collectId, clients: clientCount, resyncIn: 25 });
});

// FIX SYNC-A3 — Vérification données IDB vs SQLite (admin)
// Retourne les counts par clé pour comparaison client/serveur.
app.get('/api/sync/key-counts', rateLimiter(10), authenticateToken, async (req, res) => {
  if (!req.user?.isAdmin && (req.user?.level || 0) < 4) {
    return res.status(403).json({ error: 'Admin requis' });
  }
  if (!dbReady) return res.status(503).json({ error: 'DB indisponible' });
  try {
    const rows = dbMode === 'sqlite3'
      ? await allAsync('SELECT key, updated_at, updated_by FROM si_data ORDER BY updated_at DESC LIMIT 200')
      : db.prepare('SELECT key, updated_at, updated_by FROM si_data ORDER BY updated_at DESC LIMIT 200').all();
    const counts = {};
    for (const row of rows) {
      try {
        const val = await dbGet(row.key);
        counts[row.key] = {
          count: Array.isArray(val) ? val.length : (val ? 1 : 0),
          updatedAt: row.updated_at,
          updatedBy: row.updated_by,
        };
      } catch {}
    }
    res.json({ ok: true, keys: counts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Export ZIP ───────────────────────────────────────────────────────────────
// DISK-ZIP-1 : Télécharger un dossier SI complet en ZIP (README + fichiers)
app.get('/api/export/dossier/:id/zip', rateLimiter(5, 60_000), authenticateToken, async (req, res) => {
  const dossierId = req.params.id;
  if (!dossierId || !/^[A-Za-z0-9_-]{1,80}$/.test(dossierId)) {
    return res.status(400).json({ error: 'ID dossier invalide' });
  }
  if (!dbReady) return res.status(503).json({ error: 'DB indisponible' });

  try {
    // Récupérer les métadonnées du dossier
    const dossiers = await dbGet('dossiers') || await dbGet('gc-dossiers') || [];
    const dossier = Array.isArray(dossiers) ? dossiers.find(d => d.id === dossierId) : null;
    const dossierName = dossier ? (dossier.nom || dossier.title || dossierId) : dossierId;

    // Récupérer les fichiers associés
    const sql = 'SELECT id, original_name, disk_path, compressed_path, compressed, mime_type, size_bytes, uploaded_by, uploaded_at FROM si_files WHERE dossier_id=? AND deleted=0';
    const files = dbMode === 'sqlite3' ? await allAsync(sql, [dossierId]) : db.prepare(sql).all(dossierId);

    await auditLog(req.user?.id || 'anon', 'EXPORT_ZIP', 'dossier', `Export ZIP dossier ${dossierId}`, req.ip);

    const safeDossierName = sanitizeFolderName(dossierName);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="dossier_${safeDossierName}_${dossierId}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
    archive.pipe(res);

    // README.md du dossier
    if (dossier) {
      await ensureDossierFolder(dossier);
    }
    const folderPath = getDossierFsPath(dossierId, dossierName);
    const readmePath = path.join(folderPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      archive.file(readmePath, { name: 'README.md' });
    } else {
      // Générer un README minimal
      const readmeContent = `# Dossier : ${dossierName}\n\nID: ${dossierId}\nExporté le: ${new Date().toISOString()}\n`;
      archive.append(readmeContent, { name: 'README.md' });
    }

    // Métadonnées JSON du dossier
    const metaJson = JSON.stringify({ dossier: dossier || { id: dossierId }, files: files || [], exportedAt: new Date().toISOString() }, null, 2);
    archive.append(metaJson, { name: 'metadata.json' });

    // Fichiers du dossier
    for (const f of (files || [])) {
      const diskPath = f.compressed ? f.compressed_path : f.disk_path;
      if (!diskPath) continue;
      const realPath = path.resolve(diskPath);
      const uploadsRoot = path.resolve(UPLOADS_DIR);
      if (!realPath.startsWith(uploadsRoot)) continue; // Sécurité anti path-traversal
      if (!fs.existsSync(realPath)) continue;
      const safeName = sanitizeFolderName(path.parse(f.original_name).name) + path.extname(f.original_name).toLowerCase();
      archive.file(realPath, { name: `fichiers/${f.id}_${safeName}` });
    }

    await archive.finalize();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// DISK-ZIP-2 : Export ZIP global (tous les dossiers + backup JSON)
app.get('/api/export/all/zip', rateLimiter(2, 60_000), authenticateToken, async (req, res) => {
  if ((req.user?.level || 0) < 4 && !req.user?.isAdmin) {
    return res.status(403).json({ error: 'Niveau 4 ou admin requis pour l\'export global' });
  }
  if (!dbReady) return res.status(503).json({ error: 'DB indisponible' });

  try {
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="GC_SI_Export_Complet_${dateStr}.zip"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', err => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
    archive.pipe(res);

    // Backup JSON de toutes les données
    const allData = await dbGetAll();
    archive.append(JSON.stringify({ version: PROXY_VERSION, exportedAt: new Date().toISOString(), data: allData }, null, 2), { name: 'backup_donnees.json' });

    // Arborescence des dossiers physiques
    if (fs.existsSync(DOSSIERS_FS_DIR)) {
      archive.directory(DOSSIERS_FS_DIR, 'dossiers_SI');
    }

    // Fichiers uploadés (avec structure année/mois préservée)
    if (fs.existsSync(UPLOADS_DIR)) {
      archive.directory(UPLOADS_DIR, 'fichiers_uploads');
    }

    await auditLog(req.user?.id || 'anon', 'EXPORT_ZIP_ALL', 'system', 'Export ZIP global', req.ip);
    await archive.finalize();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// DISK-STAT : Statut espace disque pour le panneau admin
app.get('/api/disk/status', rateLimiter(20), authenticateToken, async (req, res) => {
  try {
    const pct  = await getDiskUsagePct(DISK_ALERT_PATH);
    const uploadsSize = getDirSize(UPLOADS_DIR);
    const dossiersSize = getDirSize(DOSSIERS_FS_DIR);
    const dbSize = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0;
    res.json({
      ok: true,
      diskUsedPct: pct,
      level: pct >= DISK_CRIT_PCT ? 'critical' : pct >= DISK_WARN_PCT ? 'warning' : 'ok',
      uploadsDirBytes: uploadsSize,
      dossiersDirBytes: dossiersSize,
      dbFileBytes: dbSize,
      totalDataBytes: uploadsSize + dossiersSize + dbSize,
      maxDiskGB: parseInt(process.env.MAX_DISK_GB || '250', 10),
      alertThreshold: DISK_WARN_PCT,
      criticalThreshold: DISK_CRIT_PCT,
      ts: Date.now(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Backup ───────────────────────────────────────────────────────────────────

// TASK1 — SQLite daily backup via better-sqlite3 .backup() API
async function runBackup() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `genie_si_backup_${date}.db`;
  const filepath = path.join(BACKUP_DIR, filename);
  console.log(`[Backup] Démarrage backup SQLite → ${filename}`);
  try {
    if (!dbReady || dbMode !== 'better-sqlite3') {
      // Fallback JSON pour les modes non-better-sqlite3
      const allData = dbReady ? await dbGetAll() : jsonLoad();
      const content = JSON.stringify({ version: PROXY_VERSION, created_at: new Date().toISOString(), data: allData }, null, 2);
      fs.writeFileSync(filepath, content, 'utf8');
    } else {
      await db.backup(filepath);
    }
    const size = fs.existsSync(filepath) ? fs.statSync(filepath).size : 0;
    console.log(`[Backup] ✅ Backup réussi : ${filename} (${Math.round(size / 1024)} KB)`);

    // Garder seulement les 7 derniers backups journaliers
    try {
      const backupFiles = fs.readdirSync(BACKUP_DIR)
        .filter(f => /^genie_si_backup_\d{4}-\d{2}-\d{2}\./.test(f))
        .sort();
      for (const old of backupFiles.slice(0, Math.max(0, backupFiles.length - 7))) {
        try { fs.unlinkSync(path.join(BACKUP_DIR, old)); console.log(`[Backup] Rotation : supprimé ${old}`); } catch (_) {}
      }
    } catch (_) {}

    return { file: filename, size };
  } catch (e) {
    console.error(`[Backup] ❌ Erreur backup : ${e.message}`);
    throw e;
  }
}

async function createBackup(label = 'auto', userId = 'system') {
  const ts       = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${label}_${ts}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  const allData  = dbReady ? await dbGetAll() : jsonLoad();
  const backup   = { version: PROXY_VERSION, created_at: new Date().toISOString(), created_by: userId, label, data: allData };
  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
  console.log(`💾 Backup: ${filename} (${Math.round(JSON.stringify(backup).length / 1024)} KB)`);

  // Garder seulement les 100 derniers backups auto
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup_auto_')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - 100))) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    }
  } catch(e) {}

  return { filename, size_bytes: fs.statSync(filepath).size };
}

app.post('/api/backup/save', rateLimiter(5, 60_000), authenticateToken, async (req, res) => {
  try {
    const result = await createBackup(req.body.label || 'manual', req.body.userId || req.user?.id || 'unknown');
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/backup/list', rateLimiter(20), authenticateToken, (req, res) => {
  try {
    const files = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'))
          .map(f => { const st = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, size: st.size, date: st.mtime }; })
          .sort((a, b) => b.date - a.date).slice(0, 50)
      : [];
    res.json({ ok: true, backups: files });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// [FIX v153-I] Téléchargement backup : niveau 5+ requis + rate limit réduit
// [FIX v153-L] Rate limit réduit à 2/min (10 était trop permissif pour des dumps complets)
app.get('/api/backup/get/:filename', rateLimiter(2, 60_000), authenticateToken, (req, res) => {
  if ((req.user?.level || 0) < 5) return res.status(403).json({ error: 'Niveau 5 minimum requis pour télécharger un backup' });
  const filename = path.basename(req.params.filename);
  // Whitelist pattern : backup_auto_... ou backup_manual_... ou emergency-backup-...
  if (!/^(backup_(auto|manual)|emergency-backup)_[\d\-T]+\.json$/.test(filename)) {
    return res.status(400).json({ error: 'Nom de backup invalide' });
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup introuvable' });
  auditLog(req.user?.id, 'BACKUP_DOWNLOAD', 'backup', filename, req.ip).catch(() => {});
  res.download(filepath, filename);
});

// [FIX v153-I] Restauration backup : niveau 5+ requis + isAllowedKey sur chaque clé
app.post('/api/backup/restore/:filename', rateLimiter(2, 60_000), authenticateToken, async (req, res) => {
  // Seuls les admins niveau 5+ peuvent lancer une restauration complète
  if ((req.user?.level || 0) < 5) return res.status(403).json({ error: 'Niveau 5 minimum requis pour restaurer un backup' });

  const filename = path.basename(req.params.filename);
  if (!/^(backup_(auto|manual)|emergency-backup)_[\d\-T]+\.json$/.test(filename)) {
    return res.status(400).json({ error: 'Nom de backup invalide' });
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup introuvable' });
  try {
    // Backup d'urgence AVANT restauration
    const emergencyTs = new Date().toISOString().replace(/[:.]/g, '-');
    const emergencyFilename = `emergency-backup-${emergencyTs}.json`;
    const emergencyPath = path.join(BACKUP_DIR, emergencyFilename);
    const currentData = dbReady
      ? Object.fromEntries(await Promise.all([...ALLOWED_KEYS].map(k => dbGet(k).then(v => [k, v]))))
      : jsonLoad();
    try {
      fs.writeFileSync(emergencyPath, JSON.stringify({ data: currentData, ts: Date.now(), reason: 'Emergency backup before restore' }, null, 2));
    } catch(eBackup) {
      return res.status(500).json({ ok: false, error: 'Impossible de créer backup d\'urgence. Restauration annulée.' });
    }

    const backup = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    const data = backup.data || backup;
    let restored = 0, skipped = 0;
    for (const [key, value] of Object.entries(data)) {
      // [FIX v153-I] Seules les clés autorisées sont restaurées — évite injection de clés arbitraires
      if (!isAllowedKey(key)) { skipped++; continue; }
      if (dbReady) await dbSet(key, value, req.user?.id);
      else { const d = jsonLoad(); d[key] = value; jsonSave(d); }
      restored++;
    }
    await auditLog(req.user?.id, 'BACKUP_RESTORE', 'backup', `Restauré ${restored} clés depuis ${filename} (ignorées: ${skipped})`, req.ip);
    broadcast('full_restore', { filename, restored, skipped, emergency: emergencyFilename, ts: Date.now() });
    res.json({ ok: true, restored, skipped, filename, emergency: emergencyFilename });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// TASK1 — GET /api/admin/backup : déclenche un backup immédiat (admin JWT requis, level >= 6)
app.get('/api/admin/backup', rateLimiter(5, 60_000), authenticateToken, async (req, res) => {
  if ((req.user?.level || 0) < 6 && !req.user?.isAdmin) {
    return res.status(403).json({ error: 'Niveau Admin (6) requis pour déclencher un backup' });
  }
  try {
    const result = await runBackup();
    await auditLog(req.user?.id || 'system', 'MANUAL_BACKUP', 'backup', result.file, req.ip);
    res.json({ ok: true, file: result.file, size: result.size });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Clients connectés ────────────────────────────────────────────────────────
app.get('/api/clients', authenticateToken, (req, res) => {
  const clients = Array.from(connectedClients.entries()).map(([id, info]) => ({
    id, userId: info.userId, userName: info.userName, ip: info.ip,
    verified: info.verified || false,
    connectedSince: Math.round((Date.now() - info.connectedAt) / 1000),
  }));
  res.json({ ok: true, count: clients.length, clients });
});

// ── Global API error safety net ─────────────────────────────────────────────
// Keeps API responsive even if an unexpected throw bubbles up.
app.use((err, req, res, next) => {
  const message = err?.message || 'Erreur interne inattendue';
  console.error('[API][UnhandledError]', {
    method: req?.method,
    url: req?.originalUrl || req?.url,
    ip: req?.ip,
    message,
  });

  if (res.headersSent) return next(err);
  return res.status(500).json({
    error: 'Erreur interne du serveur',
    details: process.env.NODE_ENV === 'production' ? undefined : message,
  });
});

// Handle unknown routes with explicit JSON response.
app.use((req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// ── Fermeture propre ─────────────────────────────────────────────────────────
// [C4][C5] Checkpoint WAL + close() SQLite avant de quitter
function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} — Fermeture propre...`);

  // Checkpoint WAL pour écrire toutes les données en mémoire sur le fichier .db
  if (db && dbMode === 'better-sqlite3' && dbReady) {
    try {
      db.pragma('wal_checkpoint(FULL)');
      db.close();
      console.log('✅ SQLite WAL checkpointé et fermé proprement');
    } catch(e) { console.error('Erreur checkpoint WAL:', e.message); }
  }

  // Fermer le serveur HTTP + Socket.IO
  io.close();
  server.close(() => {
    console.log('✅ Serveur HTTP fermé');
    process.exit(0);
  });

  // Forcer la sortie après 5 secondes si la fermeture tarde
  setTimeout(() => process.exit(0), 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('❌ uncaughtException:', err?.stack || err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection:', reason);
});

// ── Démarrage ────────────────────────────────────────────────────────────────
async function start() {
  await initDatabase()
  // [FIX-FULLSYNC-BOOT] Sync complet users → gc-users au démarrage
  try {
    let allUsers = await dbGet('users') || [];
    let gcUsers  = await dbGet('gc-users') || [];

    // [FIX-INIT-BOOT] If both tables are empty, initialize with default users
    if ((!Array.isArray(allUsers) || allUsers.length === 0) && (!Array.isArray(gcUsers) || gcUsers.length === 0)) {
      // Générer les hashes SHA-256 des mots de passe par défaut (6 derniers chars de l'ID)
      const _sha256 = (s) => crypto.createHash('sha256').update(s + GC_SHA256_SALT).digest('hex');
      allUsers = DEFAULT_INITIAL_USERS.map(u => ({
        ...u,
        passwordHash: _sha256(u.id.slice(-6)),
      }));
      gcUsers = allUsers.map(u => ({
        id: u.id,
        username: u.alias || u.id,
        email: u.email || '',
        passwordHash: u.passwordHash,
        role: u.role || 'Collaborateur',
        level: u.level ?? 1,
        accountStatus: u.accountStatus || 'ACTIF',
        isAdmin: u.isAdmin || false,
        isMG: u.isMG || false,
      }));
      await dbSet('users', allUsers);
      await dbSet('gc-users', gcUsers);
      console.log(`[BOOT-INIT] ✅ Tables utilisateurs initialisées avec ${allUsers.length} comptes par défaut (hashes SHA-256 générés)`);
    }

    // [FIX-BOOT-RECOVER] Si 'users' est perdu mais 'gc-users' existe, reconstruire
    // la table principale des comptes depuis la table d'authentification.
    if ((!Array.isArray(allUsers) || allUsers.length === 0) && Array.isArray(gcUsers) && gcUsers.length > 0) {
      const recoveredUsers = gcUsers.map(u => ({
        id:            u.id,
        alias:         u.username || u.alias || u.id,
        name:          u.name || u.username || u.alias || u.id,
        email:         u.email || '',
        role:          u.role || 'Collaborateur',
        level:         u.level ?? 1,
        accountStatus: u.accountStatus || 'ACTIF',
        passwordHash:  (u.passwordHash && !u.passwordHash.startsWith('$2') ? u.passwordHash : ''),
        isAdmin:       u.isAdmin || false,
        isMG:          u.isMG || false,
        process:       u.process || '',
        processes:     u.processes || [],
      }));
      allUsers = recoveredUsers;
      await dbSet('users', allUsers);
      console.log(`[BOOT-RECOVER] users restauré depuis gc-users : ${allUsers.length} comptes`);
    }

    let synced = [...gcUsers];
    let added = 0, updated = 0;
    for (const u of allUsers) {
      if (!u.id) continue;
      const idx = synced.findIndex(g => g.id === u.id);
      // Ne jamais écraser un hash bcrypt (gc-users) avec un hash inférieur ou vide (users).
      // Priorité : bcrypt > SHA-256 > vide.
      let hashToUse = u.passwordHash || '';
      if (idx !== -1) {
        const existingHash = synced[idx].passwordHash || '';
        const existingIsBcrypt = existingHash.startsWith('$2b$') || existingHash.startsWith('$2a$');
        const incomingIsBcrypt = hashToUse.startsWith('$2b$') || hashToUse.startsWith('$2a$');
        if (existingIsBcrypt && !incomingIsBcrypt) hashToUse = existingHash; // préserver bcrypt
        if (existingHash && !hashToUse) hashToUse = existingHash; // préserver tout hash vs vide
      }
      const entry = {
        id: u.id, username: u.alias || u.id, email: u.email || '',
        passwordHash: hashToUse, role: u.role || 'Collaborateur',
        level: u.level ?? 1, accountStatus: u.accountStatus || 'ACTIF',
      };
      if (idx === -1) { synced.push(entry); added++; }
      else { synced[idx] = { ...synced[idx], ...entry }; updated++; }
    }
    if (Array.isArray(allUsers) && allUsers.length > 0) {
      const validIds = new Set(allUsers.map(u => u.id));
      synced = synced.filter(g => validIds.has(g.id));
    }
    await dbSet('gc-users', synced);
    console.log(`[BOOT-SYNC] gc-users synchronisé : ${synced.length} comptes (+${added} ajoutés, ${updated} MàJ)`);
  } catch(e) { console.warn('[BOOT-SYNC] Échec:', e.message); };

  // [C4] Checkpoint WAL périodique (toutes les 5 min) pour éviter croissance WAL
  if (dbMode === 'better-sqlite3') {
    setInterval(() => {
      try {
        db.pragma('wal_checkpoint(PASSIVE)');
      } catch(e) {}
    }, 5 * 60 * 1000);
  }

  // [C12] Purge logs d'audit anciens (1x par jour)
  setInterval(() => purgeOldAuditLogs(), 24 * 60 * 60 * 1000);

  // [C13] Backup automatique toutes les 6 heures
  setInterval(async () => {
    try {
      await createBackup('auto', 'scheduler');
      console.log('💾 Backup automatique effectué');
    } catch(e) { console.warn('⚠️  Backup auto échoué:', e.message); }
  }, 6 * 60 * 60 * 1000);

  // [T22] Nettoyage tombstones — 1x par mois le 1er du mois à 15h30
  // Vérifié chaque heure ; ne s'exécute qu'une fois par mois (garde-fou via lastPurgeTombstones).
  const purgeTombstones = async () => {
    try {
      const now = new Date();
      const lastRun = await dbGet('gc-tombstones-last-purge').catch(() => null);
      if (lastRun) {
        const last = new Date(lastRun);
        // Ne pas relancer si déjà fait ce mois-ci
        if (last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth()) return;
      }
      const tombstones = await dbGet('gc-tombstones');
      if (!tombstones || typeof tombstones !== 'object') return;
      let changed = false;
      for (const key of Object.keys(tombstones)) {
        if (Array.isArray(tombstones[key]) && tombstones[key].length > 500) {
          tombstones[key] = tombstones[key].slice(-500);
          changed = true;
        }
      }
      if (changed) await dbSet('gc-tombstones', tombstones, 'system');
      await dbSet('gc-tombstones-last-purge', now.toISOString(), 'system');
      console.log(`[T22] Tombstones purgés le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')} — clés: ${Object.keys(tombstones).length}`);
    } catch(e) { console.warn('[T22] Erreur purge tombstones:', e.message); }
  };
  // Vérification horaire : déclenche à 15h30 le 1er de chaque mois
  const _scheduleTombstonePurge = () => {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes(), d = now.getDate();
    if (d === 1 && h === 15 && m >= 30 && m < 60) purgeTombstones();
    // Sinon vérification toutes les heures (overhead négligeable)
  };
  setInterval(_scheduleTombstonePurge, 60 * 60 * 1000); // vérification horaire

  // TASK1 — Backup SQLite journalier : immédiat au démarrage puis toutes les 24h
  try { await runBackup(); } catch (_) {}
  setInterval(async () => {
    try { await runBackup(); } catch (_) {}
  }, 24 * 60 * 60 * 1000);

  // [FIX-BOOT] Bootstrap gc-users depuis 'users' si des comptes manquent (premier démarrage)
  try {
    // [FIX-WAL] Forcer checkpoint WAL avant lecture pour éviter données obsolètes
    if (dbMode === 'better-sqlite3') {
      db.pragma('wal_checkpoint(FULL)');
    } else if (dbMode === 'sqlite3') {
      await runAsync('PRAGMA wal_checkpoint(FULL)');
    }
    const gcUsers   = await dbGet('gc-users') || [];
    const allUsers  = await dbGet('users')    || [];
    if (Array.isArray(allUsers) && allUsers.length > 0) {
      let changed = false;
      for (const u of allUsers) {
        const exists = gcUsers.some(g => g.id === u.id || g.username === u.alias || g.email === u.email);
        if (!exists && (u.passwordHash || u.password)) {
          gcUsers.push({
            id:            u.id,
            username:      u.alias || u.id,
            email:         u.email || '',
            passwordHash:  u.passwordHash || '',
            role:          u.role || 'Collaborateur',
            level:         u.level ?? 1,
            accountStatus: u.accountStatus || 'ACTIF',
          });
          changed = true;
          console.log(`[BOOT] Compte '${u.alias || u.id}' ajouté à gc-users depuis users`);
        }
        // [FIX-AUTH-ID] Corriger l'ID "admin" → vrai ID du compte dans 'users'
        const gcEntry = gcUsers.find(g => g.id === 'admin' && (g.username === u.alias || g.email === u.email));
        if (gcEntry && u.id && gcEntry.id !== u.id) {
          console.log(`[BOOT] Correction ID gc-users : "${gcEntry.id}" → "${u.id}" pour ${gcEntry.username}`);
          gcEntry.id = u.id;
          changed = true;
        }
      }
      if (changed) await dbSet('gc-users', gcUsers);
    }
  } catch (e) { console.warn('[BOOT] Bootstrap gc-users partiel:', e.message); }

  // [FIX-EADDRINUSE] Gestion propre du port déjà utilisé
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} déjà utilisé. Arrêtez l'instance existante :`);
      console.error(`   Windows : netstat -ano | findstr :${PORT}  →  taskkill /PID <PID> /F`);
      console.error(`   Linux   : lsof -ti:${PORT} | xargs kill -9`);
      console.error(`   PM2     : pm2 stop all && pm2 delete all\n`);
      process.exit(1);
    } else {
      console.error('Erreur serveur:', err.message);
      process.exit(1);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n');
    console.log('  ┌──────────────────────────────────────────────────────────┐');
    console.log(`  │  SI Génie Consultant — Proxy v${PROXY_VERSION}                       │`);
    console.log(`  │     Port      : ${PORT}                                 │`);
    console.log(`  │     Base DB   : ${dbMode} — ${path.basename(DB_FILE)}  │`);
    console.log(`  │     Fichiers  : ${UPLOADS_DIR.slice(-40)}  │`);
    console.log(`  │     Dossiers  : ${DOSSIERS_FS_DIR.slice(-40)}  │`);
    console.log(`  │     Max disk  : ${MAX_DB_GB} GB — Alerte disque : ${DISK_WARN_PCT}%      │`);
    console.log(`  │     WebSocket : actif (sync temps réel)                  │`);
    console.log(`  │     Backup auto : toutes les 6h                          │`);
    console.log(`  │     Surveillance disque : toutes les 15 min              │`);
    console.log('  └──────────────────────────────────────────────────────────┘');
    console.log(`\n  Accès local  : http://localhost:${PORT}`);
    console.log(`\n  Dossiers SI  : ${DOSSIERS_FS_DIR}`);
    console.log(`  Frontend SI  : http://localhost:4173\n`);
    // Démarrer la surveillance disque maintenant que io et db sont prêts
    startDiskMonitoring();
  });
}

start().catch(console.error);
