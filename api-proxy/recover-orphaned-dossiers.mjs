#!/usr/bin/env node
/**
 * ============================================================================
 * recover-orphaned-dossiers.mjs
 * ============================================================================
 * Répare les conséquences de deux bugs corrigés le 2026-06-22 :
 *
 *  1) [api-proxy.js] Le flush de la file hors-ligne (WebSocket
 *     'flush_offline_queue') écrasait silencieusement 'dossiers' / 'partners'
 *     / 'taches' / 'rdvs' avec un instantané périmé, sans passer par le merge
 *     anti-régression. Cas réel : le client "MINDZIE NGOMO OPINA" et son
 *     dossier "DOS-A02-O02.02/2026" ont disparu de la liste, alors que les 28
 *     documents déjà téléversés sont restés intacts (table si_files,
 *     indépendante de la liste 'dossiers').
 *
 *  2) [filestore.js] gcFileSave() gardait l'id PLACEHOLDER généré côté client
 *     au lieu d'adopter le serverId confirmé par le serveur après upload —
 *     chaque fichier réellement téléversé une seule fois pouvait donc
 *     apparaître DEUX FOIS dans gc-dossier-files (l'entrée "locale" et
 *     l'entrée "confirmée").
 *
 * CE SCRIPT :
 *   A. Recherche tout dossier_id présent dans la table si_files mais absent
 *      du tableau 'dossiers', et le reconstruit (dossier + client/partenaire)
 *      à partir de gc-codif-registry et gc-session-logs (qui ne sont jamais
 *      purgés par une suppression, donc conservent l'historique).
 *   B. Nettoie dans 'gc-dossier-files' les entrées "placeholder" laissées par
 *      le bug #2 (un id différent du serverId alors qu'une entrée portant déjà
 *      ce serverId existe).
 *   C. Signale (sans rien supprimer) les téléversements en double détectés
 *      (même dossier + même nom + même taille, à quelques secondes
 *      d'intervalle) afin que vous puissiez les retirer manuellement depuis
 *      l'application si besoin.
 *   D. Fusionne les clients en double (même nom) et relie tout dossier dont
 *      le partnerId est orphelin au client correspondant par son nom — cas
 *      réel corrigé : "EGLISE GOLGOTHA" / DOS-A01-O02.01/2026.
 *
 * Ce script est IDEMPOTENT : vous pouvez le relancer sans risque (il ne fait
 * rien si tout est déjà cohérent) — utile pour une vérification périodique.
 *
 * USAGE :
 *   cd api-proxy
 *   node recover-orphaned-dossiers.mjs --dry-run     # aperçu, aucune écriture
 *   node recover-orphaned-dossiers.mjs               # applique les correctifs
 *
 * Arrêtez le serveur backend avant de lancer ce script (pour éviter toute
 * écriture concurrente). Une sauvegarde horodatée du fichier .db est créée
 * automatiquement avant toute modification.
 * ============================================================================
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = path.join(__dirname, 'data', 'si_genie.db');

function log(msg) { console.log(msg); }
function warn(msg) { console.warn(`⚠️  ${msg}`); }

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ Base introuvable : ${DB_PATH}`);
  console.error('   Lancez ce script depuis le dossier api-proxy/ (celui contenant data/si_genie.db).');
  process.exit(1);
}

if (!DRY_RUN) {
  const backupPath = DB_PATH.replace(/\.db$/, `.before-recovery-${Date.now()}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  log(`💾 Sauvegarde créée avant modification : ${backupPath}`);
} else {
  log('🧪 Mode DRY-RUN — aucune écriture ne sera effectuée, ceci est un aperçu.');
}

const db = new Database(DB_PATH);

function getJSON(key, fallback) {
  const row = db.prepare('SELECT value FROM si_data WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}
function setJSON(key, value, actor = 'system-recovery') {
  const val = JSON.stringify(value);
  const ts = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO si_data(key,value,updated_at,updated_by,size_bytes) VALUES(?,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at,
      updated_by=excluded.updated_by, size_bytes=excluded.size_bytes
  `).run(key, val, ts, actor, Buffer.byteLength(val, 'utf8'));
}
function audit(action, target, detail) {
  const ts = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO si_audit(user_id,action,target,detail,ip,ts) VALUES(?,?,?,?,?,?)')
    .run('system-recovery', action, target, detail, 'local-script', ts);
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  PARTIE A — Reconstruction des dossiers / clients orphelins');
console.log('══════════════════════════════════════════════════════════════\n');

const dossiers   = getJSON('dossiers', []);
let partners      = getJSON('partners', []);
const codifReg   = getJSON('gc-codif-registry', []);
const sessionLog = getJSON('gc-session-logs', []);

const knownDossierIds = new Set(dossiers.map(d => d.id));
const fileDossierIds = db.prepare(`SELECT DISTINCT dossier_id FROM si_files WHERE dossier_id IS NOT NULL`)
  .all().map(r => r.dossier_id);

const orphanIds = fileDossierIds.filter(id => !knownDossierIds.has(id));

let dossiersChanged = false;
let partnersChanged = false;

if (orphanIds.length === 0) {
  log('✅ Aucun dossier orphelin détecté (tous les dossier_id de si_files figurent dans "dossiers").');
} else {
  log(`⚠️  ${orphanIds.length} dossier(s) orphelin(s) détecté(s) : ${orphanIds.join(', ')}\n`);

  for (const orphanId of orphanIds) {
    log(`── ${orphanId} ──`);
    const fileCount = db.prepare('SELECT COUNT(*) AS n FROM si_files WHERE dossier_id = ?').get(orphanId).n;
    log(`   ${fileCount} fichier(s) déjà téléversé(s), conservés sur le serveur (table si_files).`);

    const codifEntry   = codifReg.find(c => c.sourceId === orphanId || c.ref === orphanId);
    const sessionEntry = sessionLog.find(s => s.type === 'CREATION' && s.reason?.includes(orphanId));

    if (!codifEntry && !sessionEntry) {
      warn(`Aucune métadonnée retrouvée pour "${orphanId}" (ni gc-codif-registry, ni gc-session-logs).`);
      warn(`Les fichiers restent accessibles mais ce dossier ne sera PAS recréé automatiquement.`);
      warn(`Recréez-le manuellement depuis l'application si besoin (les fichiers existants pourront alors lui être rattachés).`);
      continue;
    }

    let objet = 'Dossier reconstitué', clientNom = 'Client à identifier';
    if (codifEntry?.label?.includes(' — ')) {
      const [o, c] = codifEntry.label.split(' — ');
      objet = o.trim(); clientNom = c.trim();
    } else if (sessionEntry?.reason) {
      objet = `Dossier reconstitué (${orphanId})`;
    }

    const createdBy    = codifEntry?.createdBy || sessionEntry?.userId || 'USR-ADM-000';
    const createdAtIso = codifEntry?.createdAt || sessionEntry?.at || new Date().toISOString();
    const createdAtDate = createdAtIso.slice(0, 10);
    const procMatch = orphanId.match(/^DOS-A\d+-([A-Z0-9]+)\./);
    const process = procMatch ? procMatch[1] : 'O02';

    let partner = partners.find(p => p.nom?.trim().toLowerCase() === clientNom.trim().toLowerCase());
    if (!partner) {
      partner = {
        id: `PAR-${Date.now()}${Math.floor(Math.random() * 1000)}`,
        nom: clientNom, type: 'client',
        contact: null, email: null, tel: null, secteur: null, adresse: null,
        dossiersIds: [],
        segment: 'PME', riskLevel: 'FAIBLE', kycStatut: 'EN_ATTENTE',
        statut: 'PROSPECT', sourceAcquisition: 'Réseau',
        createdAt: createdAtIso,
      };
      partners.push(partner);
      partnersChanged = true;
      log(`   ➕ Client recréé : "${partner.nom}" (${partner.id})`);
    } else {
      log(`   ✓ Client déjà présent, réutilisé : "${partner.nom}" (${partner.id})`);
    }
    if (!partner.dossiersIds.includes(orphanId)) {
      partner.dossiersIds = [...(partner.dossiersIds || []), orphanId];
      partnersChanged = true;
    }

    const newDossier = {
      id: orphanId, ref: orphanId, type: 'DOS', nature: 'EXTERNE',
      client: partner.nom, objet, process,
      status: 'ATTENTE_TRAITEMENT', priority: 'NORMALE',
      assignedTo: createdBy, createdBy,
      createdAt: createdAtDate,
      dueDate: null, delaiType: null, delaiJours: null,
      progress: 0,
      notes: `[Reconstitué automatiquement le ${new Date().toISOString().slice(0, 10)} — incident de synchronisation (voir audit RECOVERY). ${fileCount} document(s) déjà rattaché(s) préservés.]`,
      tags: [], amount: 0,
      submittedTo: null, submittedToName: null, submitAction: 'TRAITER', submitMotif: '',
      partnerId: partner.id, partnerNom: partner.nom, partnerType: partner.type,
      collaborators: [], externalCollaborators: [],
      qrCode: orphanId, confidentiel: false, confPass: null, confAccess: null,
    };
    dossiers.push(newDossier);
    dossiersChanged = true;
    log(`   ➕ Dossier recréé : "${objet}" — ${clientNom} (${orphanId})`);
    audit('RECOVERY', 'dossiers', `Dossier ${orphanId} reconstitué automatiquement (client: ${clientNom}, ${fileCount} fichiers préservés)`);
  }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  PARTIE B — Nettoyage des doublons "placeholder" (gc-dossier-files)');
console.log('══════════════════════════════════════════════════════════════\n');

let dossierFiles = getJSON('gc-dossier-files', []);
const beforeCount = dossierFiles.length;
// Une entrée est un résidu "placeholder" si son id diffère de son serverId
// ET qu'une AUTRE entrée portant déjà ce serverId comme id existe.
const serverIdsPresent = new Set(dossierFiles.map(f => f.serverId).filter(Boolean));
const cleanedDossierFiles = dossierFiles.filter(f => {
  const isPlaceholderLeftover = f.serverId && f.id !== f.serverId && serverIdsPresent.has(f.serverId)
    && dossierFiles.some(other => other.id === f.serverId);
  return !isPlaceholderLeftover;
});
const removedCount = beforeCount - cleanedDossierFiles.length;
let dossierFilesChanged = false;
if (removedCount > 0) {
  log(`🧹 ${removedCount} entrée(s) "placeholder" résiduelle(s) retirée(s) sur ${beforeCount} (fichiers réels non affectés).`);
  dossierFiles = cleanedDossierFiles;
  dossierFilesChanged = true;
  audit('RECOVERY', 'gc-dossier-files', `Nettoyage de ${removedCount} entrées placeholder dupliquées (bug gcFileSave corrigé)`);
} else {
  log('✅ Aucune entrée "placeholder" résiduelle trouvée.');
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  PARTIE C — Signalement des téléversements en double (info only)');
console.log('══════════════════════════════════════════════════════════════\n');

const allFiles = db.prepare(`SELECT id, dossier_id, original_name, size_bytes, uploaded_at FROM si_files WHERE deleted = 0 ORDER BY uploaded_at`).all();
const groups = new Map();
for (const f of allFiles) {
  const k = `${f.dossier_id || ''}::${f.original_name}::${f.size_bytes}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(f);
}
let dupGroups = 0, dupFiles = 0;
for (const [k, list] of groups) {
  if (list.length > 1) {
    dupGroups++;
    dupFiles += list.length - 1;
    const [dossierId, name] = k.split('::');
    log(`   🔁 "${name}" téléversé ${list.length}× dans ${dossierId || '(sans dossier)'} — ids: ${list.map(f => f.id).join(', ')}`);
  }
}
if (dupGroups === 0) {
  log('✅ Aucun téléversement en double détecté.');
} else {
  warn(`${dupFiles} fichier(s) en double détecté(s) dans ${dupGroups} groupe(s) (probablement dus à des relances réseau pendant l'upload).`);
  warn('Rien n\'a été supprimé automatiquement — vérifiez et retirez les doublons depuis l\'application si besoin.');
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  PARTIE D — Fusion des clients en double + reliaison dossier ↔ client');
console.log('══════════════════════════════════════════════════════════════\n');

// D1. Fusionner les doublons de clients (même nom, normalisé, différent id).
// On garde le PLUS ANCIEN comme survivant (généralement celui que les autres
// dossiers référencent déjà) et on fusionne dossiersIds. Toute référence à
// l'id supprimé est notée pour relecture en D2.
const normName = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const partnerIdRemap = new Map(); // ancien id (supprimé) -> id survivant
{
  const byName = new Map();
  for (const p of partners) {
    const key = normName(p.nom);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  }
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const survivor = group[0];
    const dups = group.slice(1);
    log(`🔗 "${survivor.nom}" : ${group.length} fiche(s) trouvée(s), fusion sur ${survivor.id} (créée le ${survivor.createdAt || '?'}).`);
    for (const dup of dups) {
      survivor.dossiersIds = [...new Set([...(survivor.dossiersIds || []), ...(dup.dossiersIds || [])])];
      partnerIdRemap.set(dup.id, survivor.id);
    }
  }
  if (partnerIdRemap.size > 0) {
    const removedIds = new Set(partnerIdRemap.keys());
    const before = partners.length;
    partners = partners.filter(p => !removedIds.has(p.id));
    partnersChanged = true;
    log(`   ${before - partners.length} fiche(s) en double retirée(s) après fusion.`);
    audit('RECOVERY', 'partners', `Fusion de ${before - partners.length} client(s) en double`);
  }
}

// D2. Reliaison : tout dossier dont le partnerId ne correspond à AUCUN client
// connu (qu'il ait été fusionné en D1, ou simplement orphelin — cas réel
// observé : "EGLISE GOLGOTHA" / DOS-A01-O02.01/2026) est rattaché au client
// dont le NOM correspond, si on en trouve un.
{
  const partnersById = new Map(partners.map(p => [p.id, p]));
  const partnersByName = new Map(partners.map(p => [normName(p.nom), p]));
  for (const d of dossiers) {
    if (!d.partnerId) continue;
    if (partnersById.has(d.partnerId)) continue; // déjà correct
    const remapped = partnerIdRemap.get(d.partnerId);
    const target = (remapped && partnersById.get(remapped)) || partnersByName.get(normName(d.client || d.partnerNom));
    if (!target) {
      warn(`Dossier "${d.id}" référence un client introuvable (partnerId=${d.partnerId}) et aucun client du même nom n'a été trouvé — à vérifier manuellement.`);
      continue;
    }
    log(`🔗 Dossier "${d.id}" relié à "${target.nom}" (${target.id}) — ancien partnerId orphelin : ${d.partnerId}.`);
    d.partnerId = target.id;
    d.partnerNom = target.nom;
    target.dossiersIds = [...new Set([...(target.dossiersIds || []), d.id])];
    dossiersChanged = true;
    partnersChanged = true;
    audit('RECOVERY', 'dossiers', `Dossier ${d.id} relié au client ${target.nom} (${target.id}), partnerId orphelin corrigé`);
  }
  if (!dossiersChanged && partnerIdRemap.size === 0) {
    log('✅ Aucune incohérence dossier ↔ client détectée.');
  }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  APPLICATION DES CHANGEMENTS');
console.log('══════════════════════════════════════════════════════════════\n');

if (DRY_RUN) {
  log('🧪 DRY-RUN — aucune écriture effectuée. Relancez sans --dry-run pour appliquer ces correctifs.');
} else {
  if (dossiersChanged) { setJSON('dossiers', dossiers); log(`💾 'dossiers' mis à jour (${dossiers.length} dossier(s) au total).`); }
  if (partnersChanged) { setJSON('partners', partners); log(`💾 'partners' mis à jour (${partners.length} client(s) au total).`); }
  if (dossierFilesChanged) { setJSON('gc-dossier-files', dossierFiles); log(`💾 'gc-dossier-files' mis à jour (${dossierFiles.length} entrée(s) au total).`); }
  if (!dossiersChanged && !partnersChanged && !dossierFilesChanged) log('Rien à écrire — tout était déjà cohérent.');
  log('\n✅ Terminé. Redémarrez le serveur backend pour que les postes se resynchronisent.');
}

db.close();
