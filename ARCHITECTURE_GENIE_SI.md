# Architecture Complète — Génie SI
> Version 153+ · LAN-only ERP/SI · Génie Consultant, Libreville, Gabon
> Généré le 2026-06-01

---

## 1. Vue d'ensemble — Topologie réseau LAN

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RÉSEAU LAN LOCAL                             │
│                                                                     │
│   Serveur principal (192.168.1.133)                                 │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  Frontend  → Vite preview   → port 4173                      │  │
│   │  Backend   → Express.js     → port 3001                      │  │
│   │  Base      → SQLite WAL     → api-proxy/data/genie_si.db     │  │
│   │  Fichiers  → Disque         → api-proxy/data/uploads/YYYY/MM │  │
│   └──────────────────────────────────────────────────────────────┘  │
│            ↕ WebSocket (Socket.io)  +  HTTP REST                    │
│   ┌────────────┐   ┌────────────┐   ┌────────────┐                  │
│   │ Poste A    │   │ Poste B    │   │ Poste C    │                  │
│   │ :4173      │   │ :4173      │   │ :4173      │                  │
│   │ Chrome/Edge│   │ Chrome/Edge│   │ Chrome/Edge│                  │
│   └────────────┘   └────────────┘   └────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Accès** : `http://192.168.1.133:4173` (Vite preview, dist/)
**Backend** : `http://192.168.1.133:3001`

---

## 2. Stack Technique

| Couche | Technologie | Version |
|--------|------------|---------|
| Frontend | React | 19 |
| Build | Vite | 6 |
| Backend | Express.js | 4.x |
| Temps réel | Socket.io | 4.7.5 |
| Base de données | better-sqlite3 (WAL) | — |
| Auth | JWT (HS256, 8h) + bcrypt (10 rounds) | — |
| Hash mdp client | SHA-256 + sel `GC_SALT_2026_GABON` | — |
| Cache local | localStorage + IndexedDB | — |

---

## 3. Structure des fichiers — Frontend (`src/`)

```
src/
├── main.jsx                    → Point d'entrée Vite
├── App.jsx                     → Wrapper React principal
├── AppRoot.jsx                 → ★ Racine : état global, auth, hydratation
├── SIApp.jsx                   → Conteneur principal post-login
│
├── components/
│   ├── Auth.jsx                → ★ Login / CreateAccount / CoverPage
│   ├── AIAssistant.jsx         → Widget IA (Claude / Gemini / GPT-4o)
│   ├── AppErrorBoundary.jsx    → Gestion d'erreurs React
│   ├── ClockButton.jsx         → Horloge flottante
│   ├── Dialog.jsx              → Système de modales
│   ├── FileUploader.jsx        → Upload de fichiers
│   ├── ServerStatus.jsx        → Indicateur connectivité backend
│   ├── TestUpload.jsx          → Interface test upload
│   ├── ToastManager.jsx        → Notifications toast
│   ├── ToolsWidget.jsx         → Widget outils flottant
│   ├── UI.jsx                  → Composants UI génériques
│   └── index.js                → Barrel export composants
│
├── core/
│   ├── constants.js            → ★ Constantes, configs, fonctions métier
│   ├── context.jsx             → React Context (SICtx, useSI)
│   ├── datastore.js            → ★ Sync SQLite + WebSocket temps réel
│   ├── filestore.js            → ★ Gestion fichiers (IDB + serveur disque)
│   ├── helpers.js              → Utilitaires (dates, calculs, sons)
│   ├── storage.js              → Wrappers localStorage / chiffrement
│   └── index.js                → Barrel export tout le core
│
├── hooks/
│   ├── useSyncedState.js       → ★ Hook état synchronisé temps réel
│   └── useFileStore.js         → Hook opérations fichiers
│
├── styles/
│   └── GlobalStyles.jsx        → CSS global (thème dark/light)
│
└── modules/
    ├── admin/                  → Administration (9 panneaux)
    ├── agenda/                 → Agenda / Calendrier
    ├── audit/                  → Module Audit
    ├── bureautique/            → Suite bureautique (Writer, Tableur, Présentations, Budget)
    ├── communication/          → Communications
    ├── conformite/             → Conformité + KYC
    ├── conseil/                → Conseil / Opinions
    ├── dashboard/              → Tableau de bord + Indicateurs + Processus
    ├── docs/                   → Gestion documentaire unifiée
    ├── finance/                → Finance (Facturation, Journal, Achats)
    ├── juridique/              → Juridique
    ├── logistique/             → Logistique
    ├── messagerie/             → Messagerie unifiée
    ├── rapport/                → Rapports d'activité
    ├── sirh/                   → SIRH (RH, Paie, Présences, Évaluations)
    └── taches/                 → Gestion des tâches
```

---

## 4. Structure Backend (`api-proxy/`)

```
api-proxy/
├── api-proxy.js        → ★ Serveur Express principal
├── generate-jwt-secret.js → Générateur secret JWT
├── package.json        → Dépendances backend
└── data/
    ├── genie_si.db     → Base SQLite (WAL mode)
    └── uploads/
        └── YYYY/MM/    → Fichiers physiques sur disque
```

---

## 5. Routes API Backend

### Auth
| Méthode | Route | Description | Auth requise |
|---------|-------|-------------|--------------|
| POST | `/api/auth/login` | Login → JWT | Non |
| POST | `/api/auth/sync-users` | Sync gc-users ← users | Admin |

### Données
| Méthode | Route | Description | Auth requise |
|---------|-------|-------------|--------------|
| GET | `/api/data/:key` | Lire une clé | Variable |
| POST | `/api/data/:key` | Écrire une clé | Variable |
| DELETE | `/api/data/:key` | Supprimer une clé | Admin |
| DELETE | `/api/data/:key/item/:itemId` | Supprimer un item (tombstone) | Auth |

### Fichiers
| Méthode | Route | Description | Auth requise |
|---------|-------|-------------|--------------|
| POST | `/api/files/upload` | Uploader un fichier | Auth |
| GET | `/api/files/:id` | Télécharger/consulter un fichier | Auth |
| GET | `/api/files/:id?view=1` | Consulter inline (PDF, image) | Auth |
| DELETE | `/api/files/:id` | Supprimer un fichier | Admin |
| GET | `/api/files?dossierId=X` | Lister fichiers d'un dossier | Auth |
| GET | `/api/files?module=X` | Lister fichiers d'un module | Auth |

### Admin & Monitoring
| Méthode | Route | Description | Auth requise |
|---------|-------|-------------|--------------|
| GET | `/health` | État du serveur | Non |
| GET | `/api/admin/stats` | Stats DB (clés, fichiers, taille) | Admin |
| GET | `/api/admin/audit` | Logs d'audit | Admin |

### WebSocket (Socket.io)
| Événement | Direction | Description |
|-----------|-----------|-------------|
| `identify` | Client → Serveur | Identification JWT |
| `flush_offline_queue` | Client → Serveur | Vider la file hors-ligne |
| `data_changed` | Serveur → Clients | Notification changement données |
| `file_uploaded` | Serveur → Clients | Notification nouveau fichier |
| `full_restore` | Serveur → Clients | Restauration complète |
| `flush_result` | Serveur → Client | Résultat flush offline |

---

## 6. Flux d'Authentification

```
Poste client (navigateur)
        │
        ▼
1. App démarre → lsLoad('users', []) depuis localStorage
        │
        ├── Si localStorage vide → dsGet('users') depuis serveur (anonymous OK)
        │
        ▼
2. Écran de connexion (Auth.jsx)
        │
        ├── Saisie identifiant + mot de passe
        │
        ├── gcHashPassword(mdp) → SHA256(mdp + 'GC_SALT_2026_GABON')
        │
        ├── Comparaison avec user.passwordHash en mémoire
        │
        │   ┌── Hash présent localement ──→ Vérification locale OK
        │   │                               ↓
        │   │                          proceedLogin()
        │   │                               ↓
        │   │                     POST /api/auth/login (JWT)
        │   │                               ↓
        │   │                     JWT stocké → lsSet('gc-jwt-token')
        │   │
        │   └── Hash absent (nouveau poste) ──→ _verifyViaServer()
        │                                        ↓
        │                               POST /api/auth/login
        │                                        ├── 401 → Mot de passe incorrect
        │                                        ├── 200 → JWT + resync users
        │                                        └── Erreur réseau → Message clair
        │
        ▼
3. Post-login → dsGet('users') pour resync des comptes complets
        │
        ▼
4. SIApp chargé → HYDRATE_MAP (55+ clés) → toutes les données métier
```

**Sécurités :**
- bcrypt (10 rounds) côté serveur sur les mots de passe gc-users
- SHA-256 + sel côté client (one-way, safe sur LAN)
- JWT HS256, expiry 8h
- RBAC niveau 1–6 : 1=User, 4=Manager, 6=Admin/SuperAdmin
- Clés admin protégées : `ADMIN_ONLY_WRITE_KEYS` (gc-users, etc.)
- `CRITICAL_EMPTY_ARRAY_KEYS` : retournent `[]` si non auth (sauf `users`)

---

## 7. Flux de Synchronisation des Données

```
Poste client                    Serveur SQLite
     │                               │
     │── useSyncedState(key) ────────┤
     │   1. lsLoad(key) → état init  │
     │   2. dsGet(key) → serveur ────┤→ SELECT value FROM si_data WHERE key=?
     │   3. setData(val) + lsSave    │
     │                               │
     │── setSyncedData(val) ─────────┤
     │   1. setData (local)          │
     │   2. dsSave → POST /api/data  │→ INSERT OR REPLACE si_data
     │                               │→ broadcast data_changed (Socket.io)
     │                               │
     │←── data_changed event ────────┤
     │   1. dsGet(key) → serveur     │
     │   2. lsSave + setData         │
     │                               │
     │── Hors-ligne ─────────────────┤
     │   → offline queue (IDB)       │
     │   → flush au reconnect        │
     │     (flush_offline_queue WS)  │
```

**Clés synchronisées** : 168 clés dans `SHARED_KEYS` (datastore.js)

**HYDRATE_MAP (55+ clés chargées au démarrage) :**
```
users, dossiers, taches, rdvs, partners,
gc-pending-approvals, gc-session-logs, gc-pending-connections,
gc-require-conn-approval, gc-app-habilitations, gc-app-access-codes,
siAppearance, siLogoUrl, siCSSOverrides,
gc-si-docs, gc-docs-unified, gc-process-config,
gc-cabinet-info, gc-fiscal-config, gc-delai-config, gc-circuits,
gc-orgigram-nodes, gc-orgigram-links, gc-process-app-matrix,
gc-codif-registry, gc-si-appearance, gc-si-logo-url, gc-si-css-overrides,
gc-dossier-files, gc-standalone-docs, standaloneDocuments,
gc-courrier-docs, gc-external-docs, gc-internal-docs,
gc-writer-docs, gc-writer-pro-v2, gc-tableur-pro, gc-pres-decks-v2,
gc-factures, gc-devis, gc-journal, gc-achats, gc-demandes,
gc-kyc-workflows, gc-leaves, gc-recrutements,
gc-sirh-presences, gc-sirh-evaluations, gc-sirh-fichiers,
gc-paie-taux, gc-paie-transferts,
gc-crm-interactions, gc-crm-opps, gc-crm-relances,
gc-conventions, gc-messages-global, gc-account-actions,
gc-risks, gc-nc, gc-obligations, gc-rgpd-traitements, gc-conseil-opinions
```

---

## 8. Flux de Gestion des Fichiers

```
Upload (FileUploader.jsx)
        │
        ▼
gcFileSave(file, meta) [filestore.js]
        │
        ├── POST /api/files/upload (multipart)
        │         │
        │         ▼
        │   Serveur : multer → disque → api-proxy/data/uploads/YYYY/MM/
        │   SQLite  : INSERT si_files (id, filename, path, dossierId, module…)
        │   Réponse : { id: "F-{timestamp}-{hex}", serverUrl: "/api/files/F-…" }
        │
        ├── Succès → IDB cache (IndexedDB, offline access)
        └── Échec réseau → IDB local uniquement (sync dès reconnexion)

─────────────────────────────────────────────────────────────────

Téléchargement / Consultation
        │
        ├── Via gcDownloadDoc(doc) ou gcViewDoc(doc) [constants.js] ← CORRIGÉ
        │   Résolution URL (_resolveDocServerUrl) :
        │   1. doc.serverUrl              (nouveau format)
        │   2. doc.serverId → /api/files/{id}
        │   3. doc.storageType==='server' && doc.url
        │   4. doc.url.startsWith('/api/files/')   (ancien format)
        │   5. doc.id =~ /^F-\d+-/                 (dernier recours)
        │   6. Fallback → doc.dataUrl (cache local)
        │   7. Rien → alert() visible à l'utilisateur
        │
        └── Via gcFileDownload(fileRef) [filestore.js]
            Idem _resolveServerUrl + IDB fallback

─────────────────────────────────────────────────────────────────

Format ID fichier : F-{timestamp}-{randomHex}
Exemple          : F-1779790306000-844f7cff
Chemin disque    : api-proxy/data/uploads/2026/05/{filename}
Route serveur    : GET /api/files/F-1779790306000-844f7cff
                   GET /api/files/F-…?view=1   (inline PDF/image)
```

---

## 9. Couverture des Corrections Implémentées

### ✅ Corrections Réalisées

| # | Problème | Fichier(s) modifié(s) | Statut |
|---|----------|----------------------|--------|
| B1 | Build error : `await` dans callback non-async | `AppRoot.jsx:292` | ✅ Corrigé |
| B2 | Build error : `handleLogin` non-async | `Auth.jsx` | ✅ Corrigé |
| B3 | `useSyncedState` stockait une Promise dans le state React | `hooks/useSyncedState.js` | ✅ Corrigé |
| B4 | HYDRATE_MAP incomplet (16 → 55+ clés) | `AppRoot.jsx` | ✅ Corrigé |
| B5 | Comptes utilisateurs invisibles sur autres postes | `api-proxy.js` (anonymous GET users) | ✅ Corrigé |
| B6 | Login bloqué : hash strippé en GET → vérification impossible | `api-proxy.js` | ✅ Corrigé |
| B7 | `proceedLogin` bloquait le login si serveur refusait (401) | `Auth.jsx` | ✅ Corrigé |
| B8 | Nouveaux postes sans hash → pas de login | `Auth.jsx` (`_verifyViaServer`) | ✅ Corrigé |
| B9 | `flush_offline_queue` utilisait mauvais noms de champs | `api-proxy.js` | ✅ Corrigé |
| B10 | `[SYNC-AUTH] writeValue incohérent` — warnings spurieux | `api-proxy.js` | ✅ Corrigé |
| B11 | Données (configs, processus) non synchronisées | `datastore.js` + `useSyncedState.js` | ✅ Corrigé |
| B12 | Suppression compte → pas purgé de gc-users serveur | `GestionComptesPanel.jsx` | ✅ Corrigé |
| B13 | `gcDownloadDoc`/`gcViewDoc` : formats URL legacy ignorés | `constants.js` | ✅ Corrigé |
| B14 | Erreur fichier silencieuse (console.warn) → pas visible | `constants.js` | ✅ Corrigé |

### Accès aux anciens fichiers uploadés

Les anciens fichiers sont **physiquement présents** sur le disque du serveur (`api-proxy/data/uploads/`). Avec la correction B13, ils sont maintenant accessibles si leur enregistrement contient **au moins un** de ces champs :
- `serverUrl` : URL complète
- `serverId` : ID du fichier
- `url` commençant par `/api/files/`
- `storageType === 'server'` + `url`
- `id` au format `F-{timestamp}-{hex}`

Si un fichier reste inaccessible, il faut vérifier sa fiche dans la base SQLite (`si_files`) et dans le module concerné.

---

## 10. Modules Métier — Périmètre Fonctionnel

```
┌─────────────────────────────────────────────────────────────────┐
│                    MODULES GENIE-SI                             │
├──────────────────────┬──────────────────────────────────────────┤
│ Administration       │ Comptes, Organigramme, Circuits,         │
│                      │ Habilitations, Config SI, Cabinet Info   │
├──────────────────────┼──────────────────────────────────────────┤
│ Tableau de bord      │ Indicateurs, Processus Map, KPIs         │
├──────────────────────┼──────────────────────────────────────────┤
│ Dossiers / Docs      │ Dossiers clients, Archives, Codification,│
│                      │ Documents unifiés, Courriers             │
├──────────────────────┼──────────────────────────────────────────┤
│ Finance              │ Facturation, Devis, Journal comptable,   │
│                      │ Achats, Config fiscale (Gabon)           │
├──────────────────────┼──────────────────────────────────────────┤
│ SIRH                 │ Collaborateurs, Congés, Paie,            │
│                      │ Présences, Évaluations, Recrutement      │
├──────────────────────┼──────────────────────────────────────────┤
│ Conformité / Audit   │ KYC, RGPD, NC, Risques, Obligations      │
├──────────────────────┼──────────────────────────────────────────┤
│ Bureautique          │ Writer Pro, Tableur Pro, Présentations,  │
│                      │ Budget rapide, Formulaires               │
├──────────────────────┼──────────────────────────────────────────┤
│ Messagerie           │ Messages internes, Notifications globales│
├──────────────────────┼──────────────────────────────────────────┤
│ Agenda               │ RDV, Planification                       │
├──────────────────────┼──────────────────────────────────────────┤
│ Tâches               │ Kanban, Suivi, Assignations              │
├──────────────────────┼──────────────────────────────────────────┤
│ CRM / Conseil        │ Interactions, Opportunités, Relances,    │
│                      │ Conventions, Opinions juridiques         │
├──────────────────────┼──────────────────────────────────────────┤
│ Logistique           │ Gestion logistique                       │
├──────────────────────┼──────────────────────────────────────────┤
│ Communication        │ Communications externes/internes         │
├──────────────────────┼──────────────────────────────────────────┤
│ Rapport              │ Rapports d'activité automatiques         │
└──────────────────────┴──────────────────────────────────────────┘
```

---

## 11. Sécurité — Matrice de Protection

| Ressource | Anonyme | Utilisateur (1-3) | Manager (4-5) | Admin (6) |
|-----------|---------|-------------------|---------------|-----------|
| `GET /api/data/users` | ✅ Lecture | ✅ | ✅ | ✅ |
| `POST /api/data/users` | ❌ | ✅ (propre profil) | ✅ | ✅ |
| `GET /api/data/gc-users` | ❌ 401 | ❌ 403 | ❌ 403 | ✅ |
| `POST /api/data/gc-users` | ❌ | ❌ | ❌ | ✅ |
| `GET /api/files/:id` | ❌ | ✅ | ✅ | ✅ |
| `POST /api/files/upload` | ❌ | ✅ | ✅ | ✅ |
| `DELETE /api/files/:id` | ❌ | ❌ | ❌ | ✅ |
| `GET /api/admin/stats` | ❌ | ❌ | ❌ | ✅ |
| `GET /health` | ✅ | ✅ | ✅ | ✅ |
| `POST /api/auth/login` | ✅ | ✅ | ✅ | ✅ |

---

## 12. Points d'Amélioration Identifiés

### 🔴 Critiques (à traiter en priorité)

| # | Problème | Impact | Solution recommandée |
|---|----------|--------|----------------------|
| A1 | **Pas de HTTPS sur le LAN** — Communications en clair, tokens JWT interceptables | Sécurité | Certificat auto-signé + `--https` Vite + `https` Express |
| A2 | **JWT secret statique ou faible** — Si `JWT_SECRET` n'est pas défini, risque de secret par défaut | Auth | Forcer via variable d'environnement, valider longueur ≥ 64 chars |
| A3 | **Chunk JS trop grand (2.76 Mo)** — Temps de chargement lent sur réseau LAN faible | Performance | Code-splitting par module (`dynamic import`), lazy loading |
| A4 | **Mots de passe par défaut** (6 derniers chars de l'ID) — Trop prévisibles | Sécurité | Forcer le changement au premier login (`passwordChanged: false` flag) |
| A5 | **Pas de rate limiting sur `/api/auth/login`** — Attaque bruteforce possible | Sécurité | `express-rate-limit` : 5 essais / 15 min par IP |

### 🟠 Importants

| # | Problème | Impact | Solution recommandée |
|---|----------|--------|----------------------|
| B1 | **Backup automatique SQLite absent** — Perte totale possible si disque défaillant | Données | Cron SQLite `.backup()` quotidien + copie réseau |
| B2 | **Pas de pagination côté serveur** — Grosses listes chargées en entier | Performance | Pagination `?offset=&limit=` sur GET /api/data |
| B3 | **IndexedDB non nettoyée** — Accumulation de fichiers orphelins en cache local | Stockage | `gcMigrateFilesFromLS()` + GC périodique IDB |
| B4 | **`originalAppRoot.jsx` et autres backups dans `src/`** — Polluent le bundle | Qualité | Déplacer dans `.backup/` hors du scope Vite |
| B5 | **E2E tests non exécutés** — Régressions non détectées | Qualité | Lancer `npm run test:e2e` avant chaque déploiement |
| B6 | **Pas de gestion de version de la DB** — Migrations manuelles risquées | Maintenabilité | Système de migrations numérotées (ex: better-sqlite3-migrate) |

### 🟡 Améliorations souhaitables

| # | Problème | Impact | Solution recommandée |
|---|----------|--------|----------------------|
| C1 | **Alert() bloquant pour erreurs fichiers** — UX médiocre | UX | Utiliser le ToastManager ou Dialog existants |
| C2 | **Pas d'indicateur de progression upload** — Utilisateur sans feedback | UX | `XMLHttpRequest.upload.onprogress` ou Axios progress |
| C3 | **AI Assistant toujours actif** — Consomme ressources même inutilisé | Performance | Lazy-load + désactiver si non configuré |
| C4 | **Logs console en production** — `console.warn` partout visible aux utilisateurs | Qualité | Logger conditionnel `DEBUG=true` env variable |
| C5 | **Tombstones non nettoyées** — Table si_tombstones grossit indéfiniment | Stockage | `dsClearTombstones()` programmé (> 30 jours) |
| C6 | **Pas de page 404 / offline** — Écran blanc si serveur coupé | UX | Service Worker ou page offline React |

---

## 13. Procédure de Déploiement

```bash
# Sur le serveur (192.168.1.133)

# 1. Arrêter les services existants
pkill -f "node api-proxy"
pkill -f "vite preview"

# 2. Récupérer les dernières corrections
git pull origin claude/keen-wright-I1lUG

# 3. Installer les dépendances
npm install
cd api-proxy && npm install && cd ..

# 4. Builder le frontend
npm run build

# 5. Démarrer le backend
cd api-proxy && node api-proxy.js &

# 6. Démarrer le frontend
npm run preview -- --host 0.0.0.0 --port 4173 &

# 7. Sur chaque poste client → Ctrl+Shift+R (vider cache)
```

---

## 14. Mots de Passe Utilisateurs (référence admin)

| Format | Règle |
|--------|-------|
| Tous les utilisateurs | 6 derniers caractères de leur ID (ex: ID `1-0001` → mdp `0-0001`... vérifier le format exact) |
| User `2-0571` | `fkastanh@30` (changé manuellement) |
| Comptes par défaut | Définis à la création |

> **Note sécurité** : Recommander à chaque utilisateur de changer son mot de passe dès la première connexion.

---

*Document généré automatiquement — Génie Consultant SI v153+*
