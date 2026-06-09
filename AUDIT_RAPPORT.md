# Rapport d'Audit Complet — SI Génie Consultant

**Date :** 09 juin 2026  
**Version backend :** v132  
**Version frontend :** v10.5.1  
**Rédigé par :** Analyse automatisée complète (backend, frontend, sync, sécurité, UI/UX)

---

## Table des matières

1. [Ce qui fonctionne correctement](#1-ce-qui-fonctionne-correctement)
2. [Fichier .env manquant](#2-fichier-env-manquant--corrigé)
3. [Bugs documents / CRM](#3-bugs-documents--crm--corrigés)
4. [Synchronisation multi-postes](#4-synchronisation-multi-postes)
5. [Tombstones (suppression persistée)](#5-tombstones--suppression-persistée)
6. [Sécurité](#6-sécurité)
7. [UI/UX — fonctions manquantes ou dégradées](#7-uiux--fonctions-manquantes-ou-dégradées)
8. [Performances & stabilité serveur](#8-performances--stabilité-serveur)
9. [Liste des tâches priorisées](#9-liste-des-tâches-priorisées)
10. [Résumé des corrections appliquées](#10-résumé-des-corrections-appliquées)

---

## 1. Ce qui fonctionne correctement

### ✅ Backend (api-proxy.js v132)
| Fonctionnalité | État |
|---|---|
| Authentification JWT (login / register / refresh) | ✅ Fonctionnel |
| RBAC — niveaux 1→6, isAdmin, isManager | ✅ Fonctionnel |
| Anti-régression merge (MERGE_ALWAYS_KEYS) | ✅ Actif |
| Protection écrasement tableau vide (CRITICAL_EMPTY_ARRAY_KEYS) | ✅ Actif |
| Déduplication écriture serveur (noop si valeur identique) | ✅ Actif (ajouté session précédente) |
| Tombstones côté serveur (DELETE /api/data/:key/item/:itemId) | ✅ Fonctionnel |
| Upload fichiers (multer, limite MB configurable) | ✅ Fonctionnel |
| Download fichiers avec check access_level | ✅ Fonctionnel |
| WebSocket broadcast (data_changed) — seulement sockets vérifiés | ✅ Fonctionnel |
| Audit log (si_audit, rotation 30j) | ✅ Fonctionnel |
| Backup automatique (6h) + backup manuel | ✅ Fonctionnel |
| Checkpoint WAL SQLite (5 min + arrêt propre) | ✅ Fonctionnel |
| Rate limiting (global 800 req/min, login 5/min) | ✅ Actif |
| Batch GET /api/data/batch (110+ requêtes → 1) | ✅ Fonctionnel |
| Filtrage niveau utilisateur (applyLevelFilter) | ✅ Fonctionnel |
| Logger sécurisé (tokens/passwords redactés dans logs) | ✅ Actif |
| Compression (gzip via express compression) | ✅ Actif |
| Redis cache (optionnel, si REDIS_URL fourni) | ✅ Optionnel |

### ✅ Frontend (datastore.js + AppRoot.jsx)
| Fonctionnalité | État |
|---|---|
| Synchronisation offline-first (LS → serveur) | ✅ Fonctionnelle |
| Heartbeat 10s / invalidation cache 60s | ✅ Fonctionnel |
| File d'attente offline + flush à la reconnexion | ✅ Fonctionnel |
| Tombstones côté client (dsMarkDeleted, dsDeleteItemFromArray) | ✅ Fonctionnel |
| Filtrage tombstones dans flush_offline_queue | ✅ Actif (session précédente) |
| Préchargement tombstones avant push boot | ✅ Actif (session précédente) |
| Déduplication frontend saveAppHabilitations | ✅ Actif (session précédente) |
| Hydratation batch au démarrage (dsBatchGet) | ✅ Fonctionnelle (session précédente) |
| dsOnSync — callback reçoit objet {key, action, by, ts} | ✅ Corrigé session précédente |
| Présence cross-machine (gc-presence) | ✅ Fonctionnelle |
| useRemoteSync hook | ✅ Fonctionnel |
| useSyncedState hook | ✅ Fonctionnel |

### ✅ UI/UX
| Module | État |
|---|---|
| Dashboard, Tableau de bord KPI | ✅ Fonctionnel |
| Gestion des tâches (TachesPanel) | ✅ Fonctionnel |
| Agenda / RDVs | ✅ Fonctionnel |
| SIRH (congés, présences, recrutement) | ✅ Fonctionnel |
| Finance (journal, budget, paie, facturation) | ✅ Fonctionnel |
| Juridique (KYC, conventions) | ✅ Fonctionnel |
| Bureautique (Writer, Tableur, Présentation) | ✅ Fonctionnel |
| Conformité, Audit | ✅ Fonctionnel |
| Admin Panel (collaborateurs, config SI) | ✅ Fonctionnel |
| Messagerie globale | ✅ Fonctionnelle |
| Notifications temps réel | ✅ Fonctionnelles |

---

## 2. Fichier .env manquant — ✅ CORRIGÉ

### Constat
Le fichier `api-proxy/.env` était **absent** alors que le serveur en dépend pour les secrets JWT, les secrets API, et la configuration du port/origins.

**Conséquences sans .env :**
- JWT_SECRET = `gc-jwt-secret-change-me-in-env` (valeur par défaut) — vulnérable à la forge de tokens
- API_SECRET = `gc-secret-change-me-in-env` (valeur par défaut)
- Aucun avertissement au démarrage → risque silencieux en production

### Correction appliquée
- **Fichier créé :** `api-proxy/.env` avec des clés aléatoires de 128 hex (512 bits d'entropie pour JWT)
- **Avertissement serveur ajouté :** Si les valeurs par défaut sont détectées, un `console.warn` clair s'affiche au démarrage (sans bloquer le serveur en dev)
- **Confirmation .gitignore :** `api-proxy/.env` était déjà listé dans `.gitignore` ✓

### Variables configurées
```ini
PROXY_PORT=3001
ALLOWED_ORIGIN=http://localhost:4173
JWT_SECRET=<512 bits aléatoires>
API_SECRET=<256 bits aléatoires>
MAX_FILE_MB=500
MAX_DB_GB=250
MAX_VALUE_MB=10
MAX_DISK_GB=250
NODE_ENV=development
```

### Variables optionnelles (non activées par défaut)
```ini
# REDIS_URL=redis://localhost:6379
# EMAIL_USER=...  EMAIL_PASS=...
# CLAUDE_API_KEY=...  GEMINI_API_KEY=...  OPENAI_API_KEY=...
```

---

## 3. Bugs documents / CRM — ✅ CORRIGÉS

### BUG-DOC-1 : Documents n'apparaissent pas dans GestionDocsUnifiee sur machine fraîche

**Sévérité :** 🔴 Majeur  
**Impact :** Tous les documents créés sur d'autres postes sont invisibles sur une nouvelle machine ou après effacement du localStorage.

**Cause racine :**  
Dans `SIApp.jsx`, le state `docs` est initialisé **uniquement depuis le localStorage** :
```js
const [docs, setDocsRaw] = useState(() => {
  try { return JSON.parse(_lsGet("gc-docs-unified") || "[]"); } catch (_) { return []; }
});
```
AppRoot hydrate bien `siSystemDocs` depuis le serveur (`gc-docs-unified` / `gc-si-docs`), mais cette donnée **n'était jamais propagée vers `docs`** dans SIApp. Les deux variables coexistaient sans connexion.

**Correction appliquée (`SIApp.jsx`) :**
```js
// FIX v155 — Propagation siSystemDocs → docs
useEffect(() => {
  if (!Array.isArray(siSystemDocs) || siSystemDocs.length === 0) return;
  setDocsRaw(prev => {
    if (prev.length >= siSystemDocs.length) return prev;
    try { _lsSet("gc-docs-unified", JSON.stringify(siSystemDocs)); } catch (_) {}
    return siSystemDocs;
  });
}, [siSystemDocs]);
```

---

### BUG-DOC-2 : dsOnSync fetchait la mauvaise clé pour gc-docs-unified

**Sévérité :** 🔴 Majeur  
**Impact :** Quand un autre poste ajoutait un document et broadcastait `data_changed: gc-docs-unified`, les autres machines rechargaient `gc-standalone-docs` au lieu de `gc-docs-unified` → les docs restaient stales.

**Cause racine (`SIApp.jsx`, ancienne ligne 763-774) :**
```js
if (key === 'gc-standalone-docs' || key === 'gc-docs-unified') {
  dsGet('gc-standalone-docs', []).then(val => { ... }) // ← MAUVAISE CLÉ
```

**Correction appliquée :**  
Séparation en deux blocs distincts :
- `gc-standalone-docs` → fetch `gc-standalone-docs` → met à jour `standaloneDocumentsRaw`
- `gc-docs-unified` / `gc-si-docs` → fetch `gc-docs-unified` → met à jour `docs` state

---

### BUG-DOC-3 : saveDocs (SIApp) n'enregistrait pas sur gc-docs-unified serveur

**Sévérité :** 🟡 Modéré  
**Impact :** Les sauvegardes via certains chemins (BureauOffice direct) n'enregistraient que sur `gc-standalone-docs`, pas sur `gc-docs-unified`. Incohérence entre clés.

**Correction appliquée (`SIApp.jsx`) :**
```js
dsSave('gc-standalone-docs', forSync).catch(() => {});
dsSave('gc-docs-unified',    forSync).catch(() => {}); // ← ajouté
```

---

### BUG-CRM-1 : Données CRM non chargées au premier montage

**Sévérité :** 🟡 Modéré  
**Impact :** Sur une machine fraîche, les onglets Relances, Interactions, Opportunités et KYC de GestionDocsUnifiee sont vides même si le serveur a des données.

**Cause racine :**  
Les états sont initialisés depuis `_lsGet(...)` (localStorage) uniquement. `useRemoteSync` ne couvre que les broadcasts, pas le chargement initial.

**Correction appliquée (`GestionDocsUnifiee.jsx`) :**  
Ajout d'un `useEffect` de montage qui fetch depuis le serveur si les états locaux sont vides :
```js
useEffect(() => {
  const { dsGet } = await import('../../core/datastore.js');
  const [rel, inter, opps, kyc] = await Promise.all([...]);
  if (Array.isArray(rel) && rel.length > 0) setRelancesRaw(rel);
  // ... idem pour les autres
  // + docs unifiés si serveur a plus d'éléments que local
}, []);
```

---

### BUG-CRM-2 : saveKycData appelait dsSave deux fois

**Sévérité :** 🟠 Faible  
**Impact :** Double écriture réseau pour chaque sauvegarde KYC → consommation bande passante inutile + risque de write storm sur gc-jur-kyc.

**Correction appliquée (`GestionDocsUnifiee.jsx`) :**  
Suppression de l'appel `dsSave` redondant dans le bloc `try/catch`.

---

## 4. Synchronisation multi-postes

### Architecture globale (rappel)

```
[Poste A]                     [Serveur SQLite]                  [Poste B]
  │                                  │                               │
  ├─ localStorage (cache immédiat)   │                               ├─ localStorage
  ├─ dsSave() → POST /api/data/:key ─┤─ dbSet + broadcast ──────────┤
  └─ dsGet()  → GET  /api/data/:key ─┤                               └─ dsOnSync → re-fetch
                                     │
                              [WebSocket / Socket.IO]
                         broadcast data_changed → tous clients
```

### ✅ Ce qui fonctionne
- **Anti-régression** : merge union si incoming < 70% de existing (pour MERGE_ALWAYS_KEYS : 100%)
- **Tombstones cross-machine** : suppression propagée à tous les postes
- **Heartbeat** : clés critiques re-fetchées toutes les 60s
- **File offline** : opérations jouées en mémoire + flush dès reconnexion
- **DEDUP serveur** : POST ignoré si valeur identique → casse les boucles d'écriture

### ⚠️ Limitations connues (non bloquantes)

| Point | Impact | Recommandation |
|---|---|---|
| Pas de verrouillage optimiste | Conflict "last-write-wins" si 2 users éditent le même dossier simultanément | Acceptable pour usage cabinet (faible concurrence simultanée) |
| gc-tombstones croissance illimitée | Après ~5000 suppressions, les IDs les plus anciens sont évincés (slice(-5000)) | Purge annuelle ou migration vers DELETE cascade en base |
| Offline flush limité à 200 items | Si > 200 opérations offline → items perdus | Augmenter limite ou segmenter flush par lots |
| Rate limit 800 GET/min partagé | Si useRemoteSync track 20+ clés + gc-resync-all → ~200 GET/s → throttling 429 | Déjà mitigé par dsBatchGet au boot |

---

## 5. Tombstones — Suppression persistée

### Flux complet de suppression

```
1. dsDeleteItemFromArray(listKey, itemId)
   ├─ dsMarkDeleted() → écrit dans gc-tombstones (LS)
   ├─ DELETE /api/data/:key/item/:itemId
   │   ├─ Vérif propriété (niv 1-2 : seulement leurs items)
   │   ├─ Enregistrement tombstone serveur (gc-tombstones SQLite)
   │   ├─ dbSet → liste filtrée
   │   └─ broadcast data_changed { action: 'item_delete' }
   └─ Filtre local + dsSave (forceOverwrite:true)

2. Anti-résurrection (3 couches)
   ├─ MERGE_ALWAYS_KEYS consulte gc-tombstones avant union-merge
   ├─ flush_offline_queue filtre par tombstones
   └─ Préchargement tombstones au boot (avant push local)
```

### ✅ Ce qui fonctionne
- Suppression atomique + tombstone simultané
- Anti-résurrection multi-couches
- Cross-machine : broadcast immédiat sur toutes les machines connectées

### ⚠️ Points de vigilance

| Scénario | Comportement actuel | Risque |
|---|---|---|
| Machine offline pendant suppression | L'item est tombstoné localement. Au flush, l'offline queue filtre les tombstonés. | ✅ Géré |
| Reset fabrique (factory reset) | `dsClearTombstones()` vide gc-tombstones + serveur | Après reset, les items pourraient revenir via un poste en cache. **Solution : flush complet + reset tous postes en même temps** |
| Suppression d'un item non-propriétaire (niv 1-2) | 403 Forbidden | ✅ Géré (BUG-DEL2) |
| gc-tombstones > 5000 IDs par clé | Troncature automatique (slice(-5000)) → les plus vieux IDs évincés | Risque de résurrection d'items très anciens sur postes hors-ligne longtemps |

---

## 6. Sécurité

### Correctifs déjà appliqués (sessions précédentes)
| Ref | Description | État |
|---|---|---|
| SEC-01 | Validation JWT_SECRET/API_SECRET au démarrage | ✅ Warning + doc .env |
| SEC-05 | CORS Origin whitelist pour download fichiers | ✅ Corrigé |
| SEC-06 | Rate limit login 10/min → 5/min | ✅ Corrigé |
| SEC-09 | Upload requiert authenticateToken (plus authenticateTokenOptional) | ✅ Corrigé |
| SEC-10 | applyLevelFilter — filtrage champs sensibles selon niveau | ✅ Corrigé |
| SEC-11 | x-force-overwrite restreint aux niveaux 4+ | ✅ Corrigé |
| SEC-13 | Dump /api/data restreint niveau 6 (admin) | ✅ Corrigé |
| SEC-16 | XSS dans SVG TableurPro (escape HTML) | ✅ Corrigé |
| SEC-19 | Dossiers confidentiels : confAccess + pas de confPass en réponse | ✅ Corrigé |
| ARCH-08 | broadcast() seulement vers sockets vérifiés | ✅ Corrigé |
| QUAL-02 | jwt.verify avec algorithms:['HS256'] | ✅ Corrigé |
| QUAL-05 | Vérification accountStatus à chaque requête auth | ✅ Corrigé |

### ⚠️ Points restants à surveiller
| Ref | Description | Priorité |
|---|---|---|
| SEC-02 | Mots de passe stockés en bcrypt (OK) mais PIN en clair pour certains users | 🟡 Moyen |
| SEC-03 | JWT stocké en localStorage (pas httpOnly cookie) | 🟠 Faible (réseau local uniquement) |
| SEC-04 | Pas de 2FA / MFA | 🟠 Faible (cabinet interne) |
| SEC-17 | Historique mots de passe (passwordHistory) non vérifié côté serveur | 🟡 Moyen |

---

## 7. UI/UX — Fonctions manquantes ou dégradées

### BUG-UI-1 : Documents absents sur machine fraîche
**Statut :** ✅ Corrigé (cf. BUG-DOC-1/2/3)

### BUG-UI-2 : Données CRM vides au premier chargement
**Statut :** ✅ Corrigé (cf. BUG-CRM-1)

### BUG-UI-3 : Onglet CRM — partenaires non synchronisés entre postes en temps réel
**Sévérité :** 🟠 Faible  
**Description :** Les partenaires/clients CRM sont synchés via `setPartnersSync` → `dsSave("partners")`. `useRemoteSync` dans GestionDocsUnifiee ne surveille pas `partners`. Un ajout sur poste A n'est visible sur poste B qu'après refresh ou heartbeat (60s).  
**Recommandation :** Ajouter `'partners': setPartnersRaw` dans le `useRemoteSync` de GestionDocsUnifiee.

### BUG-UI-4 : Dossiers liés — filtre CRM non cohérent
**Sévérité :** 🟠 Faible  
**Description :** Dans l'onglet détail client CRM, `clientDossiers(client.id)` filtre par `d.clientId === client.id`. Si un dossier a été créé via DossiersList avec `partenaire.id` ≠ `client.id` (nommage différent), le lien ne se fait pas.  
**Recommandation :** Normaliser l'attribut `clientId` lors de la création de dossier (toujours utiliser l'ID partenaire du CRM).

### BUG-UI-5 : Éditeur de document — fermeture prématurée sur upload
**Sévérité :** 🟠 Faible  
**Description :** État `pendingDocFiles` ajouté en v154 mais pas toujours vérifié avant fermeture modale. Un utilisateur qui clique hors de la modale peut perdre ses fichiers en attente.  
**Recommandation :** Ajouter `onBeforeClose: () => pendingDocFiles.length === 0` dans le composant Modal.

### BUG-UI-6 : Notifications non marquées "lues" cross-machine
**Sévérité :** 🟡 Moyen  
**Description :** Marquer une notification comme lue sur poste A ne la marque pas lue sur poste B. L'état "lu/non-lu" est local.  
**Recommandation :** Sauvegarder l'état lu/non-lu dans `gc-notif-{userId}` et synchoniser via dsOnSync.

### BUG-UI-7 : Présence — délai d'affichage "hors ligne"
**Sévérité :** 🟠 Faible  
**Description :** Un utilisateur déconnecté brutalement (onglet fermé, coupure réseau) reste affiché "En ligne" pendant 90s (PURGE_MS) avant disparition.  
**Statut :** Comportement attendu (heartbeat 45s + marge 2x). Acceptable.

### BUG-UI-8 : Fichier original*.jsx toujours présents dans src/
**Sévérité :** 🟠 Faible  
**Description :** Fichiers `src/originalAppRoot.jsx`, `src/originalSIApp.jsx`, `src/modules/dashboard/originalProcessusMap.jsx`, `src/modules/taches/originalTachesPanel.jsx` présents en repo. Ces fichiers contiennent du code obsolète (dont `saveAppHabilitations` sans dédup) et augmentent le bundle.  
**Recommandation :** Supprimer ces fichiers du repo (ils avaient été supprimés mais réintroduits par remplacement ZIP).

---

## 8. Performances & Stabilité serveur

### ✅ Optimisations actives
- **dsBatchGet** : 1 POST `/api/data/batch` remplace 110+ GET au démarrage
- **DEDUP serveur** : POST sans changement = noop, 0 broadcast
- **HEARTBEAT_KEYS réduit** : 5 clés légères uniquement (plus de dossiers/tâches)
- **Rate limiting** : 800 req/min global, 5/min login
- **Redis** : optionnel, clés chaudes cachées (TTL 60s)
- **SQLite WAL** : checkpoint 5 min + FULL à l'arrêt

### ⚠️ Points à surveiller
| Point | Seuil critique | Action |
|---|---|---|
| Taille SQLite | 250 GB (MAX_DB_GB) | Vérifier `/api/admin/health` régulièrement |
| WAL file | >100 MB si checkpoint désactivé | PM2 + SIGTERM propre requis |
| Backup automatique 6h | Si > 100k entrées → backup > 2 min | Ajuster intervalle via cron externe si nécessaire |
| connectedClients WebSocket | Max 500 (C14) | Suffisant pour usage cabinet |

---

## 9. Liste des tâches priorisées

### 🔴 Critique (bloquant ou sécurité)

- [x] **ENV-01** — Créer `api-proxy/.env` avec secrets sécurisés ✅ FAIT
- [x] **DOC-01** — Propager siSystemDocs → docs dans SIApp.jsx ✅ FAIT
- [x] **DOC-02** — Corriger dsOnSync fetch mauvaise clé pour gc-docs-unified ✅ FAIT
- [x] **DOC-03** — saveDocs SIApp : ajouter sauvegarde vers gc-docs-unified ✅ FAIT
- [x] **CRM-01** — Hydratation initiale données CRM au montage GestionDocsUnifiee ✅ FAIT
- [x] **CRM-02** — saveKycData double dsSave → simple ✅ FAIT
- [x] **HAB-01** — Boucle infinie gc-app-habilitations stoppée (DEDUP serveur + frontend) ✅ FAIT (session précédente)

### 🟡 Important (dégradation fonctionnelle)

- [ ] **CRM-03** — Ajouter `'partners': setPartners` dans useRemoteSync de GestionDocsUnifiee
- [ ] **NOTIF-01** — Sync état "lu" notifications entre postes via gc-notif-{userId}
- [ ] **DOC-04** — Augmenter limite slice(0,200) à slice(0,500) pour gc-docs-unified (grand cabinet)
- [ ] **UI-01** — Confirmation fermeture modale upload si fichiers en attente (pendingDocFiles)
- [ ] **SEC-02** — Vérifier que les PINs ne sont pas stockés en clair dans gc-users
- [ ] **SEC-17** — Implémenter vérification passwordHistory côté serveur (POST /api/auth/change-password)

### 🟠 Améliorations

- [ ] **CLEAN-01** — Supprimer `src/originalAppRoot.jsx`, `src/originalSIApp.jsx`, `src/modules/dashboard/originalProcessusMap.jsx`, `src/modules/taches/originalTachesPanel.jsx`
- [ ] **CLEAN-02** — Supprimer `tmp_check_passwords.py` s'il est revenu dans le repo
- [ ] **PERF-01** — Ajouter pagination côté serveur pour GET /api/data/:key (arrays > 500 items)
- [ ] **PERF-02** — Purge gc-tombstones anciens > 1 an (endpoint admin dédié)
- [ ] **MON-01** — Dashboard serveur `/api/admin/health` accessible niveau 6 uniquement
- [ ] **BACKUP-01** — Vérifier que les backups se créent bien dans `api-proxy/data/backups/`
- [ ] **ENV-02** — Adapter `ALLOWED_ORIGIN` en production (IP serveur ou nom de domaine)
- [ ] **ENV-03** — Configurer SMTP pour alertes email (niveau 5+ et admin)

### 🔵 Long terme

- [ ] **ARCH-01** — Verrouillage optimiste lors d'édition concurrent (champ `lockOwner` + TTL 5 min)
- [ ] **ARCH-02** — Pagination GET avec cursor pour gros datasets (> 1000 items)
- [ ] **ARCH-03** — Séparation des fichiers binaires (IndexedDB browser) du state JSON (localStorage)
- [ ] **SEC-03** — Migration JWT vers httpOnly cookie si déployé en HTTPS/internet
- [ ] **SEC-04** — TOTP/2FA pour comptes DG et Admin (niveau 5+)
- [ ] **MON-02** — Intégration PM2 avec métriques CPU/mémoire visibles dans Admin Panel

---

## 10. Résumé des corrections appliquées

### Session actuelle (09 juin 2026)

| Fichier | Correction | Ref |
|---|---|---|
| `api-proxy/.env` | **Créé** avec secrets aléatoires 512 bits | ENV-01 |
| `api-proxy/api-proxy.js` | Warning console si secrets par défaut détectés | ENV-01 |
| `src/SIApp.jsx` | useEffect : propagation siSystemDocs → docs (machine fraîche) | DOC-01 |
| `src/SIApp.jsx` | dsOnSync gc-docs-unified : fetch gc-docs-unified au lieu de gc-standalone-docs | DOC-02 |
| `src/SIApp.jsx` | saveDocs : ajout dsSave vers gc-docs-unified | DOC-03 |
| `src/modules/docs/GestionDocsUnifiee.jsx` | useEffect montage : hydratation CRM + docs depuis serveur | CRM-01 |
| `src/modules/docs/GestionDocsUnifiee.jsx` | saveKycData : suppression double dsSave | CRM-02 |

### Session précédente

| Fichier | Correction | Ref |
|---|---|---|
| `api-proxy/api-proxy.js` | DEDUP serveur : noop si valeur identique (brise boucle write storm) | HAB-01 |
| `src/AppRoot.jsx` | saveAppHabilitations : dsSave seulement si valeur changée | HAB-01 |
| `src/modules/finance/FinanceApp.jsx` | saveAppHabilitations : même fix | HAB-01 |
| `src/core/datastore.js` | dsBatchGet : 1 POST batch remplace 110+ GET | PERF |
| `src/AppRoot.jsx` | Préchargement tombstones avant push local (boot) | TOMB |
| `api-proxy/api-proxy.js` | flush_offline_queue : filtre tombstones (les 2 chemins) | TOMB |
| `src/core/datastore.js` | HEARTBEAT_KEYS : retiré dossiers/taches/fichiers (trop lourds) | PERF |
| `src/modules/admin/CollaborateursPanel.jsx` | markOnline() écrit via dsSave (cross-machine) | PRESENCE |
| `src/modules/admin/CollaborateursPanel.jsx` | dsOnSync callback : signature objet {key} | SYNC |
| `src/modules/bureautique/TableurPro.jsx` | XSS SVG : escape HTML sur toutes les valeurs | SEC-16 |

---

## Annexe A — Variables .env complètes

```ini
# Obligatoires
PROXY_PORT=3001
ALLOWED_ORIGIN=http://localhost:4173   # adapter en production
JWT_SECRET=<généré — voir api-proxy/.env>
API_SECRET=<généré — voir api-proxy/.env>

# Stockage
MAX_FILE_MB=500
MAX_DB_GB=250
MAX_VALUE_MB=10
MAX_DISK_GB=250
NODE_ENV=development

# Optionnels
REDIS_URL=redis://localhost:6379       # cache distribué
REDIS_CACHE_TTL=60
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=votre@email.com
EMAIL_PASS=votre_mdp_app
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
OPENAI_API_KEY=sk-...
```

## Annexe B — Architecture des clés de synchronisation

```
SHARED_KEYS (190+)          : toutes les clés métier synchronisées
MERGE_ALWAYS_KEYS (12)      : union-merge systématique (jamais écraser)
CRITICAL_EMPTY_ARRAY_KEYS (10) : rejet si incoming = [] et existing > 0
ADMIN_ONLY_WRITE_KEYS (14)  : écriture nécessite niveau >= 4
HEARTBEAT_KEYS (5)          : re-fetchées toutes les 60s
  → users, gc-users, gc-notifications, gc-messages-global, gc-presence
```

## Annexe C — Niveaux utilisateurs

| Niveau | Rôle | Droits |
|---|---|---|
| 1 | Collaborateur Junior | Lecture propre processus + écriture tâches/RDVs personnels |
| 2 | Collaborateur | Lecture élargie + écriture dossiers partagés |
| 3 | Chef de service | Gestion dossiers + accès CRM + suppression propres items |
| 4 | Manager | Tout niv.3 + écriture ADMIN_ONLY_WRITE_KEYS + suppression tout |
| 5 | Directeur Général | Tout niv.4 + backup + suppression clés entières |
| 6 | Administrateur Système | Accès total, dump complet, purge tombstones |

---

*Rapport généré automatiquement — v10.5.1 frontend / v132 backend*
