# Cartographie Technique — SI Génie Consultant
> Version 10.5.1 / 10.6.0 · Juin 2026 · Document interne confidentiel

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture globale](#architecture-globale)
3. [Frontend — Structure React](#frontend--structure-react)
4. [Frontend — Flux de données](#frontend--flux-de-données)
5. [Backend — Serveur Express](#backend--serveur-express)
6. [Backend — Routes API & WebSocket](#backend--routes-api--websocket)
7. [Modules métier](#modules-métier)
8. [Sécurité & Contrôle d'accès](#sécurité--contrôle-daccès)
9. [Synchronisation temps réel](#synchronisation-temps-réel)
10. [Gestion des fichiers](#gestion-des-fichiers)
11. [Données & Persistance](#données--persistance)
12. [Tests & Qualité](#tests--qualité)
13. [Déploiement](#déploiement)
14. [UI/UX — Description fonctionnelle](#uiux--description-fonctionnelle)

---

## Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│                     SI GÉNIE CONSULTANT                              │
│               Système d'Information Intégré — LAN                   │
│                                                                      │
│   Frontend React 19        ←WebSocket→       Backend Express        │
│   :4173 (Vite preview)    ←HTTP REST→        :3001 (Node.js)        │
│                                              │                       │
│   • 19 modules métier                        • SQLite (WAL)         │
│   • Suite bureautique                        • Upload fichiers       │
│   • Authentification JWT                     • Proxy IA (Claude/GPT)│
│   • Contrôle d'accès par processus           • Backup auto 6h       │
│   • UI 100% temps réel                       • Logs audit           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Architecture globale

```mermaid
graph TB
    subgraph CLIENT["🖥️ Postes Clients (LAN)"]
        BROWSER["Navigateur Web"]
        LS["localStorage\n(cache local)"]
        IDB["IndexedDB\n(fichiers cache)"]
    end

    subgraph FRONTEND["⚛️ Frontend — React 19 :4173"]
        MAIN["main.jsx\nPoint d'entrée"]
        APP_ROOT["AppRoot.jsx\nRouter principal + Auth"]
        SI_APP["SIApp.jsx\nOrchestration modules + Sidebar"]
        MODULES["19 Modules Métier"]
        COMPONENTS["Composants partagés\n(UI, Auth, AI, Tools)"]
        CORE["Core\n(datastore, helpers, constants)"]
        HOOKS["Hooks\n(useSyncedState, useFileStore)"]
    end

    subgraph BACKEND["🗄️ Backend — Express + Node.js :3001"]
        EXPRESS["api-proxy.js\nServeur Express principal"]
        SOCKETIO["Socket.io\nWebSocket temps réel"]
        SQLITE["SQLite (WAL)\nsi_genie.db"]
        UPLOADS["Uploads\n/data/uploads/"]
        BACKUPS["Backups auto\n/data/backups/"]
        AI_PROXY["Proxy IA\nClaude / GPT / Gemini"]
    end

    subgraph EXTERNAL["🌐 Externes"]
        CLAUDE["Anthropic API\n(Claude)"]
        GPT["OpenAI API\n(GPT)"]
        GEMINI["Google API\n(Gemini)"]
    end

    BROWSER --> MAIN
    MAIN --> APP_ROOT
    APP_ROOT --> SI_APP
    SI_APP --> MODULES
    SI_APP --> COMPONENTS
    MODULES --> CORE
    MODULES --> HOOKS
    CORE --> LS
    CORE --> IDB
    CORE <-->|"HTTP REST\n/api/*"| EXPRESS
    CORE <-->|"WebSocket\nsocket.io"| SOCKETIO
    EXPRESS --> SQLITE
    EXPRESS --> UPLOADS
    EXPRESS --> BACKUPS
    EXPRESS --> AI_PROXY
    SOCKETIO --> EXPRESS
    AI_PROXY --> CLAUDE
    AI_PROXY --> GPT
    AI_PROXY --> GEMINI
```

---

## Frontend — Structure React

```mermaid
graph TD
    subgraph ENTRY["Point d'entrée"]
        IDX["index.html"]
        MAIN["main.jsx\n• Init React\n• Intercepte fetch\n• Error boundaries globaux"]
        APP["App.jsx\n• Barrel export"]
    end

    subgraph ROUTING["Routing & Auth"]
        AR["AppRoot.jsx\n• Auth (login/register/2FA)\n• Langue & thème\n• Navigation modules\n• Gestion sessions"]
    end

    subgraph ORCHESTRATION["Orchestration principale"]
        SA["SIApp.jsx\n• Sidebar navigation\n• Header global\n• Chargement initial données\n• Props drilling vers modules\n• Gestion docs/dossiers centralisée"]
    end

    subgraph SHARED_COMPONENTS["Composants partagés /components/"]
        AUTH["Auth.jsx\nLogin, Register, 2FA,\nProfil, Permissions, Upload avatar"]
        UI["UI.jsx\nBtn, Modal, InputField,\nSelectField, Badge, Tabs,\nProgressBar, PrintButton, QRDisplay"]
        AI["AIAssistant.jsx\nProxy Claude/GPT/Gemini\nConfig admin IA\nHistorique conversations"]
        TOOLS["ToolsWidget.jsx\nCalculatrice, Notes,\nConvertisseur, Traducteur,\nGénérateur QR/codes"]
        DLG["Dialog.jsx\nuseDialog hook\nalert/confirm/prompt React"]
        FU["FileUploader.jsx\nDrag-drop, multiple files\ngcFileStore (IDB + serveur)"]
        TOAST["ToastManager.jsx\ngcToast() global\nNotifications visuelles"]
        SS["ServerStatus.jsx\nIndicateur /health"]
        CLK["ClockButton.jsx\nHorloge, minuteur, alarmes"]
        ERR["AppErrorBoundary.jsx\nError boundary React\nFallback UI"]
    end

    subgraph CORE_LAYER["Couche Core /core/"]
        DS["datastore.js\n• dsGet/dsSave\n• WebSocket sync\n• Offline queue\n• JWT auth"]
        FS["filestore.js\n• gcFileSave/gcFileUrl\n• IndexedDB + serveur\n• Compression"]
        HELPERS["helpers.js\n• Formatages dates/montants\n• bcryptjs passwords\n• gcVerifyAdmin\n• playSound()"]
        CONSTANTS["constants.js\n• INITIAL_* data\n• PROCESS_APP_MATRIX\n• Configs métier\n• USER_FUNCTIONS"]
        CTX["context.jsx\n• useSI hook\n• SICtx Provider\n• Thèmes, langue, user"]
        STORAGE["storage.js\n• _lsGet/_lsSet\n• Clés shared/private\n• Fallback si LS absent"]
    end

    subgraph HOOKS_LAYER["Hooks /hooks/"]
        RSH["useSyncedState.js\n• useRemoteSync(syncMap)\n• Écoute __GC__key events\n• Refresh depuis serveur"]
        UFH["useFileStore.js\n• Upload/download wrapper\n• Métadatas fichiers"]
    end

    IDX --> MAIN --> APP --> AR --> SA
    SA --> SHARED_COMPONENTS
    SA --> CORE_LAYER
    SA --> HOOKS_LAYER
```

### Arborescence fichiers Frontend

```
src/
├── main.jsx                    # Point d'entrée, error boundaries, fetch interceptor
├── App.jsx                     # Barrel
├── AppRoot.jsx                 # Router principal (1703 lignes)
├── SIApp.jsx                   # Orchestration (2303 lignes)
├── index.css / App.css         # Styles globaux
│
├── components/
│   ├── Auth.jsx                # Auth complète (3868 lignes)
│   ├── UI.jsx                  # Librairie composants (1197 lignes)
│   ├── AIAssistant.jsx         # Assistant IA intégré (1793 lignes)
│   ├── ToolsWidget.jsx         # Widget outils flottants (1425 lignes)
│   ├── Dialog.jsx              # Dialogs React (242 lignes)
│   ├── FileUploader.jsx        # Upload fichiers (440 lignes)
│   ├── ToastManager.jsx        # Notifications toast (173 lignes)
│   ├── ServerStatus.jsx        # Indicateur serveur (61 lignes)
│   ├── ClockButton.jsx         # Horloge & minuteur (821 lignes)
│   ├── AppErrorBoundary.jsx    # Error boundary (82 lignes)
│   └── index.js                # Barrel export
│
├── core/
│   ├── constants.js            # Constantes globales & données initiales (2110 lignes)
│   ├── datastore.js            # Synchronisation SQLite ↔ React (1010 lignes)
│   ├── filestore.js            # Gestion fichiers IDB + serveur (579 lignes)
│   ├── helpers.js              # Utilitaires métier (840 lignes)
│   ├── context.jsx             # React Context global (655 lignes)
│   ├── storage.js              # Wrapper localStorage (311 lignes)
│   └── index.js                # Barrel export
│
├── hooks/
│   ├── useSyncedState.js       # Sync temps réel (useRemoteSync)
│   └── useFileStore.js         # Hook gestion fichiers
│
├── styles/
│   └── GlobalStyles.jsx        # Variables CSS & thèmes dynamiques
│
└── modules/
    └── [19 modules métier]     # Voir section "Modules Métier"
```

---

## Frontend — Flux de données

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant C as Composant React
    participant DS as datastore.js
    participant LS as localStorage
    participant WS as WebSocket
    participant API as Express API
    participant DB as SQLite

    Note over U,DB: ── Chargement initial ──
    U->>C: Ouvre module (ex: TachesPanel)
    C->>LS: _lsGet('gc-taches') [sync]
    LS-->>C: Données cachées
    C->>DS: dsGet('gc-taches')
    DS->>API: GET /api/data/gc-taches
    API->>DB: SELECT value FROM si_kv WHERE key='gc-taches'
    DB-->>API: JSON data
    API-->>DS: {value: [...]}
    DS-->>C: setState(data) [hydratation]

    Note over U,DB: ── Modification données ──
    U->>C: Crée une tâche
    C->>DS: dsSave('gc-taches', newData)
    DS->>LS: _lsSet('gc-taches', ...) [immédiat]
    DS->>API: POST /api/data {key, value}
    API->>DB: INSERT/UPDATE si_kv
    DB-->>API: OK
    API->>WS: broadcast('data_changed', {key})
    WS-->>C: StorageEvent '__GC__gc-taches'
    Note over C: useRemoteSync listener déclenche dsGet
    C->>DS: dsGet('gc-taches') [rafraîchi]
```

### Synchronisation multi-postes

```mermaid
flowchart LR
    subgraph PC1["💻 Poste A"]
        M1["Module"] -->|dsSave| DS1["datastore"]
    end

    subgraph SERVER["🗄️ Serveur"]
        API["Express API"] --> DB["SQLite"]
        DB --> WS["Socket.io\nbroadcast"]
    end

    subgraph PC2["💻 Poste B"]
        DS2["useRemoteSync\nécoute StorageEvent"] --> M2["Module mis à jour"]
    end

    subgraph PC3["💻 Poste C"]
        DS3["useRemoteSync\nécoute StorageEvent"] --> M3["Module mis à jour"]
    end

    DS1 -->|"POST /api/data"| API
    WS -->|"__GC__key event"| DS2
    WS -->|"__GC__key event"| DS3
```

---

## Backend — Serveur Express

```mermaid
graph TD
    subgraph SERVER["🗄️ api-proxy.js — Express :3001"]
        MW["Middlewares\n• helmet (sécurité HTTP)\n• cors (CORS)\n• compression (gzip/brotli)\n• express-rate-limit\n• express-validator\n• multer (upload)"]

        AUTH_MW["Auth Middleware\nVerify JWT Bearer token\nInjecte userId + level"]

        subgraph ROUTES["Routes Express"]
            R_AUTH["POST /api/auth/*\nLogin, Register, 2FA,\nRefresh token, Logout"]
            R_DATA["GET/POST/PUT/DELETE /api/data/*\nCRUD clé-valeur SQLite\nBatch reads"]
            R_FILES["POST /api/upload\nGET /api/file/:id\nDELETE /api/file/:id"]
            R_AI["POST /api/ai/claude\nPOST /api/ai/gpt\nPOST /api/ai/gemini/:model\nProxy IA sécurisé"]
            R_SYS["GET /health\nPOST /api/logs\nPOST /api/backup\nGET /api/version"]
        end

        subgraph DATA["Persistance"]
            DB["SQLite WAL\nsi_genie.db\n• si_kv (clé-valeur)\n• si_audit (logs)"]
            DISK["Fichiers disque\n/data/uploads/\n(multer)"]
            BK["Backups auto\n/data/backups/\ntoutes les 6h"]
        end

        subgraph WS_SRV["WebSocket (socket.io)"]
            IDENTIFY["on('identify')\n→ auth JWT\n→ enregistre socket"]
            BROADCAST["emit('data_changed')\n→ tous les clients\nsauf émetteur"]
        end
    end

    MW --> AUTH_MW --> ROUTES
    ROUTES --> DATA
    ROUTES --> WS_SRV
    DB --> BK
```

### Structure dossiers Backend

```
api-proxy/
├── api-proxy.js            # Serveur principal (2488 lignes)
├── package.json            # v10.6.0 — express, socket.io, better-sqlite3...
├── .env                    # JWT_SECRET, PROXY_PORT, DATABASE_PATH
├── generate-jwt-secret.js  # Générateur clé JWT
├── scripts/
│   └── ensure-sqlite.cjs   # Init tables SQLite
└── data/
    ├── si_genie.db         # Base SQLite (356 KB — WAL mode)
    ├── uploads/            # Fichiers uploadés (persistants)
    └── backups/            # Snapshots auto toutes les 6h
```

---

## Backend — Routes API & WebSocket

### Routes complètes

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| `POST` | `/api/auth/login` | ❌ | Authentification email+password → JWT |
| `POST` | `/api/auth/register` | ❌ | Création compte |
| `POST` | `/api/auth/verify-2fa` | ❌ | Vérification code 2FA |
| `POST` | `/api/auth/refresh-token` | ✅ | Renouvellement JWT |
| `POST` | `/api/auth/logout` | ✅ | Déconnexion |
| `GET` | `/api/data/:key` | ✅ | Lire valeur par clé |
| `POST` | `/api/data` | ✅ | Écrire clé+valeur |
| `PUT` | `/api/data/:key` | ✅ | Mettre à jour |
| `DELETE` | `/api/data/:key` | ✅ | Supprimer clé |
| `GET` | `/api/data/batch` | ✅ | Lire plusieurs clés |
| `POST` | `/api/upload` | ✅ | Upload fichier (multipart) |
| `GET` | `/api/file/:id` | ✅ | Télécharger fichier |
| `DELETE` | `/api/file/:id` | ✅ | Supprimer fichier |
| `GET` | `/api/files/list` | ✅ | Lister fichiers utilisateur |
| `POST` | `/api/ai/claude` | ✅ | Proxy Anthropic Claude |
| `POST` | `/api/ai/gpt` | ✅ | Proxy OpenAI GPT |
| `POST` | `/api/ai/gemini/:model` | ✅ | Proxy Google Gemini |
| `GET` | `/health` | ❌ | Health check |
| `POST` | `/api/logs` | ✅ | Envoyer logs audit |
| `POST` | `/api/backup` | ✅ admin | Déclencher backup manuel |
| `GET` | `/api/version` | ❌ | Version API |

### Événements WebSocket

| Direction | Événement | Payload | Rôle |
|-----------|-----------|---------|------|
| Client → Server | `identify` | `{userId, userName, token}` | Auth socket + enregistrement |
| Client → Server | `data_sync_request` | `{keys: []}` | Demande sync données |
| Client → Server | `file_uploaded` | `{meta}` | Notifier upload terminé |
| Server → Client | `data_changed` | `{key, updatedAt}` | Données modifiées → refresh |
| Server → Client | `gc-sync-online` | `{data}` | Données synchronisées |
| Server → Client | `file_available` | `{fileId, meta}` | Fichier disponible |
| Server → Client | `notification` | `{type, message, userId}` | Notification push |

---

## Modules Métier

```mermaid
graph LR
    subgraph PILOTAGE["🎯 Pilotage (P01–P04)"]
        DASH["Dashboard\n& Indicateurs"]
        CONS["Conseil\n& Stratégie"]
        COMM["Communication\n& Marketing"]
        CONF["Conformité\n& KYC"]
    end

    subgraph OPERATIONNEL["⚙️ Opérationnel (O01–O03)"]
        DOCS["Gestion Docs\n& Dossiers"]
        JUR["Juridique\n& OHADA"]
        AUD["Audit\n& Contrôle"]
    end

    subgraph SUPPORT["🔧 Support (S01–S06)"]
        FIN["Finance\n& Comptabilité"]
        SIRH["SIRH\nRessources Humaines"]
        LOG["Logistique\n& Moyens"]
        MSG["Messagerie\nUnifiée"]
        AGD["Agenda\n& RDVs"]
        RPT["Rapports\nActivité"]
    end

    subgraph BUREAU["💼 Bureautique (Personnel)"]
        WR["WriterPro\n(traitement texte)"]
        TAB["TableurPro\n(tableur)"]
        PRES["PresentationPro\n(slides)"]
        BUD["BudgetRapide\n(finances perso)"]
    end

    subgraph ADMIN["⚙️ Administration SI"]
        ADM["AdminPanel\nGestion comptes"]
        ORGA["Organigramme"]
        CFG["Config SI"]
    end

    SI_APP(("SIApp.jsx\nOrchestration")) --> PILOTAGE
    SI_APP --> OPERATIONNEL
    SI_APP --> SUPPORT
    SI_APP --> BUREAU
    SI_APP --> ADMIN
```

### Tableau des modules complet

| Module | Fichier principal | Lignes | Processus | Partage |
|--------|-------------------|--------|-----------|---------|
| **Admin** | `AdminPanel.jsx` + 7 panneaux | 708 KB | Admin SI | Partagé |
| **Dashboard** | `Dashboard.jsx` | 140 KB | Tous (filtré niveau) | Partagé |
| **Processus Map** | `ProcessusMap.jsx` | 133 KB | Tous | Partagé |
| **Indicateurs** | `Indicateurs.jsx` | 37 KB | Tous | Partagé |
| **Tâches** | `TachesPanel.jsx` | 58 KB | Tous | Partagé |
| **Gestion Docs** | `GestionDocsUnifiee.jsx` | 164 KB | P01, P04, O01, O02 | Partagé |
| **Dossiers** | `DossiersList.jsx` | 206 KB | P01, P04, O01, O02 | Partagé |
| **Archivage** | `ArchivagePanel.jsx` | 37 KB | P01, O01 | Partagé |
| **Finance** | `FinanceApp.jsx` | 149 KB | P01, P03, S01 🔒 | Partagé |
| **Messagerie** | `MessagerieUnifiee.jsx` | 113 KB | Tous | Partagé |
| **SIRH** | `SIRHModule.jsx` | 198 KB | P01, S03 | Partagé |
| **Bureautique** | `BureauOffice.jsx` | 233 KB | Tous | — |
| **WriterPro** | `WriterPro.jsx` | 52 KB | Tous | **Personnel** |
| **TableurPro** | `TableurPro.jsx` | 73 KB | Tous | **Personnel** |
| **PresentationPro** | `PresentationPro.jsx` | 54 KB | Tous | **Personnel** |
| **BudgetRapide** | `BudgetRapide.jsx` | 8.6 KB | Tous | **Personnel** |
| **Audit** | `AuditApp.jsx` | 172 KB | P01, P02, O03, S02 | Partagé |
| **Conformité** | `ConformiteApp.jsx` + KYC | 88 KB | P01, P02, S02 | Partagé |
| **Communication** | `CommunicationApp.jsx` | 57 KB | P01, S04 | Partagé |
| **Conseil** | `ConseilApp.jsx` | 221 KB | P01, P02, P03, P04 | Partagé |
| **Juridique** | `JuridiqueApp.jsx` | 63 KB | P01, O02 | Partagé |
| **Logistique** | `LogistiqueApp.jsx` | 41 KB | P01, P03, S01, S05 | Partagé |
| **Agenda** | `AgendaModule.jsx` | 57 KB | Tous | Partagé |
| **Rapports** | `RapportActiviteModule.jsx` | 35 KB | Tous | Partagé |

> 🔒 Finance = `strictBlock:true` — aucun code d'accès provisoire possible, processus autorisés seulement.  
> **Personnel** = données isolées par `userId` (ne se synchronisent pas entre collaborateurs).

---

## Sécurité & Contrôle d'accès

### Niveaux utilisateurs

```
Niveau 6 — Admin SI        → Accès total, gestion infrastructure
Niveau 5 — Direction Gén.  → Accès total modules + validation finale
Niveau 4 — Responsable     → Accès modules processus + management équipe
Niveau 3 — Senior          → Accès modules processus + création dossiers
Niveau 2 — Collaborateur   → Accès restreint à son processus
Niveau 1 — Employé         → Lecture seule, tâches assignées
```

### Matrice Processus → Applications

```mermaid
graph TD
    subgraph PROC_P["Processus Pilotage"]
        P01["P01 Management\n→ TOUT"]
        P02["P02 Gouvernance\n→ Audit, Conformité,\n   Conseil, Indicateurs"]
        P03["P03 Contrôle Gestion\n→ Finance, Logistique,\n   Conseil"]
        P04["P04 Veille\n→ Communication,\n   Docs, Conseil"]
    end

    subgraph PROC_O["Processus Opérationnels"]
        O01["O01 Administratif\n→ Docs, Indicateurs"]
        O02["O02 Juridique\n→ Juridique, Docs"]
        O03["O03 Gestion\n→ Audit, Indicateurs"]
    end

    subgraph PROC_S["Processus Support"]
        S01["S01 Finance\n→ Finance, Logistique"]
        S02["S02 Audit\n→ Audit, Conformité"]
        S03["S03 RH\n→ SIRH"]
        S04["S04 Communication\n→ Communication"]
        S05["S05 Logistique\n→ Logistique"]
        S06["S06 Sécurité\n→ Indicateurs seulement"]
    end
```

### Flux de contrôle d'accès (hasAppAccess)

```mermaid
flowchart TD
    START(["Utilisateur clique app"]) --> A{isAdmin\nou level≥5 ?}
    A -->|Oui| ALLOW["✅ Accès accordé"]
    A -->|Non| B{app = conventions\net level≥3 ?}
    B -->|Oui| ALLOW
    B -->|Non| C{strictBlock\n+ process pas autorisé ?}
    C -->|Oui| DENY["⛔ Accès refusé\n(pas de code possible)"]
    C -->|Non| D{Matrice processus\n→ 'explicit' ?}
    D -->|Oui| E{level ≥ minLevel ?}
    E -->|Oui| ALLOW
    E -->|Non| DENY
    D -->|Non| F{Habilitation\nindividuelle ?}
    F -->|Oui| ALLOW
    F -->|Non| G{Code d'accès\nvalide ?}
    G -->|Oui| ALLOW
    G -->|Non| H{Matrice → false ?}
    H -->|Oui| DENY
    H -->|Non| I{Process dans\napp.processes ?}
    I -->|Oui| ALLOW
    I -->|Non| DENY
```

### Mécanismes de sécurité

| Mécanisme | Implémentation | Portée |
|-----------|----------------|--------|
| Authentification | JWT RS256 (8h + refresh) | Toutes routes API |
| Hash password | bcryptjs (salted) | Auth |
| Rate limiting | express-rate-limit | API globale |
| En-têtes sécurité | helmet | HTTP headers |
| CORS | cors configuré | API |
| Compression | gzip + brotli | Réponses |
| Validation inputs | express-validator | Routes data |
| Upload sécurisé | multer (taille + type) | /api/upload |
| Logs audit | si_audit table (immuable) | Actions sensibles |
| Backup auto | Snapshot SQLite toutes 6h | Persistance |
| Accès process | PROCESS_APP_MATRIX | Modules métier |
| strictBlock | Finance + apps sensibles | Blocage total |

---

## Synchronisation temps réel

```mermaid
sequenceDiagram
    participant A as Poste A (Edit)
    participant SRV as Serveur
    participant B as Poste B
    participant C as Poste C

    Note over A: Utilisateur A modifie une facture
    A->>SRV: POST /api/data {key:'gc-factures', value:[...]}
    SRV->>SRV: UPDATE si_kv SET value=...
    SRV->>SRV: dispatch StorageEvent '__GC__gc-factures'
    par Broadcast WebSocket
        SRV->>B: socket.emit('data_changed', {key:'gc-factures'})
        SRV->>C: socket.emit('data_changed', {key:'gc-factures'})
    end
    Note over B: useRemoteSync détecte StorageEvent
    B->>SRV: GET /api/data/gc-factures
    SRV-->>B: {value: [...updated]}
    Note over B: setFactures(data) → re-render

    Note over C: useRemoteSync détecte StorageEvent
    C->>SRV: GET /api/data/gc-factures
    SRV-->>C: {value: [...updated]}
    Note over C: setFactures(data) → re-render
```

### Clés synchronisées (principales)

| Clé | Module | Type |
|-----|--------|------|
| `gc-taches` | Tâches | Partagé |
| `gc-factures` | Finance | Partagé |
| `gc-devis` | Finance | Partagé |
| `gc-messages-global` | Messagerie | Partagé |
| `gc-courrier-docs` | Messagerie | Partagé |
| `dossiers` | Docs/Dossiers | Partagé |
| `gc-cabinet-info` | Admin | Partagé |
| `gc-process-app-matrix` | Admin | Partagé |
| `rdvs` | Agenda | Partagé |
| `gc-sirh-*` | SIRH | Partagé |
| `gc-writer-pro-v2:{userId}` | WriterPro | **Personnel** |
| `gc-tableur-pro:{userId}` | TableurPro | **Personnel** |
| `gc-pres-decks-v2:{userId}` | Présentation | **Personnel** |
| `gc-budget-rapide:{userId}` | Budget | **Personnel** |

---

## Gestion des fichiers

```mermaid
flowchart TD
    U(["Utilisateur\nchoisit un fichier"]) --> FU["FileUploader.jsx\n(drag-drop / click)"]
    FU --> GFS["gcFileSave()\n(filestore.js)"]
    GFS --> IDB["IndexedDB\n(cache local immédiat)"]
    GFS --> UPL["POST /api/upload\n(multipart/form-data)"]
    UPL --> MULTER["Middleware multer\n(validation type & taille)"]
    MULTER --> DISK["/data/uploads/\n(persistant serveur)"]
    DISK --> META["Retourne\n{id, serverUrl, serverId}"]
    META --> DOC["Sauvegardé dans\ndossier / document"]
    DOC --> DS["dsSave(key, data)\n→ sync tous postes"]

    DL(["Utilisateur\ntélécharge/consulte"]) --> GDL["gcDownloadDoc()\ngcViewDoc()"]
    GDL --> CHECK{serverUrl\nou serverId ?}
    CHECK -->|Oui| SRV["GET /api/file/:id\n→ stream depuis disque"]
    CHECK -->|Non| LOC["dataUrl / url locale\nIndexedDB"]
```

---

## Données & Persistance

### Structure SQLite

```sql
-- Table principale clé-valeur (tout le SI)
CREATE TABLE si_kv (
    key        TEXT PRIMARY KEY,
    value      TEXT,          -- JSON sérialisé
    updated_at INTEGER        -- timestamp ms
);

-- Table logs audit (immuable)
CREATE TABLE si_audit (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    action     TEXT,          -- CREATE / UPDATE / DELETE / ACCESS
    userId     TEXT,
    resource   TEXT,          -- clé ou chemin fichier
    before     TEXT,          -- JSON état avant
    after      TEXT,          -- JSON état après
    timestamp  INTEGER        -- timestamp ms
);
```

### Stratégie de cache multicouche

```
┌─────────────────────────────────────────────────────┐
│  Couche 1 : État React (mémoire)    ← le plus rapide │
│  setState() → re-render immédiat                     │
├─────────────────────────────────────────────────────┤
│  Couche 2 : localStorage            ← sync           │
│  _lsGet / _lsSet                                    │
│  Disponible même offline                             │
├─────────────────────────────────────────────────────┤
│  Couche 3 : IndexedDB               ← fichiers       │
│  gcFileSave / gcFileUrl                             │
│  Pour les binaires (images, PDF...)                  │
├─────────────────────────────────────────────────────┤
│  Couche 4 : SQLite serveur          ← source vérité  │
│  si_genie.db (WAL mode)                             │
│  Partagé entre tous les postes                       │
│  Backups auto toutes les 6 heures                    │
└─────────────────────────────────────────────────────┘
```

---

## Tests & Qualité

### Suite Playwright E2E (20 fichiers)

```
tests/
├── si-e2e-auth.spec.ts           # Auth, 2FA, permissions
├── si-e2e-admin.spec.ts          # Admin, gestion comptes
├── si-e2e-dashboard.spec.ts      # Dashboard, KPIs
├── si-e2e-documents.spec.ts      # Upload, CRUD, permissions docs
├── si-e2e-finance.spec.ts        # Module finance
├── si-e2e-messaging.spec.ts      # Messagerie temps réel
├── si-e2e-agenda.spec.ts         # Agenda & RDVs
├── si-e2e-taches.spec.ts         # Tâches
├── si-e2e-bureautique.spec.ts    # Suite office
├── si-e2e-communication.spec.ts  # Communication
├── si-e2e-conformite.spec.ts     # Conformité & KYC
├── si-e2e-conseil.spec.ts        # Module conseil
├── si-e2e-juridique.spec.ts      # Juridique
├── si-e2e-logistique.spec.ts     # Logistique
├── si-e2e-rapports.spec.ts       # Rapports
├── si-e2e-sirh.spec.ts           # SIRH
├── si-e2e-approvals.spec.ts      # Approbations
├── si-e2e-errors-security.spec.ts# Sécurité
├── si-e2e-workflows-complete.spec.ts # Workflows métier
├── si-ci.spec.ts                 # CI/CD
└── connectivity-test.spec.ts     # Connectivité réseau
```

**Configuration Playwright :**
- Navigateurs : Edge (prioritaire), Chrome, Firefox
- Timeout : 120s · Retries : 2 (CI)
- Capture : vidéo + trace + screenshots
- Base URL : http://localhost:4173

---

## Déploiement

### Topologie réseau LAN

```
┌─────────────────────────────────────────────────┐
│                 Réseau LAN Interne               │
│                                                  │
│  ┌─────────────────┐     ┌──────────────────┐   │
│  │   Serveur Génie  │     │ Postes Clients   │   │
│  │  192.168.1.133   │     │  (n'importe quel │   │
│  │                  │     │   IP LAN)         │   │
│  │ :3001 — Backend  │◄────┤                  │   │
│  │ :4173 — Frontend │     │  Navigateur Web   │   │
│  │                  │     │  (Edge/Chrome/FF) │   │
│  │ SQLite + uploads │     │                  │   │
│  │ PM2 (auto-restart│     └──────────────────┘   │
│  └─────────────────┘                             │
└─────────────────────────────────────────────────┘
```

### Processus PM2

```json
{
  "name": "si-proxy",
  "script": "api-proxy/api-proxy.js",
  "node_args": "--max-old-space-size=512",
  "env": { "NODE_ENV": "production", "PROXY_PORT": 3001 },
  "autorestart": true,
  "restart_delay": 5000,
  "max_restarts": 10,
  "log_file": "api-proxy/data/logs/"
}
```

### Commandes démarrage

```bash
# Backend (avec PM2)
cd api-proxy && npm run pm2

# Frontend (build + preview)
npm run build && npm run preview

# Développement complet
npm run dev           # frontend :4173
cd api-proxy && npm run dev   # backend :3001
```

---

## UI/UX — Description fonctionnelle

### Identité visuelle

L'interface adopte un **thème sombre professionnel** avec trois variantes (Sombre, Clair, Marine GC). La palette principale utilise les couleurs institutionnelles de Génie Consultant — marine profond `#0A1E4A`, or `#C9A84C` — garantissant une cohérence visuelle forte. Chaque module métier possède sa propre couleur d'accentuation pour une identification rapide.

### Navigation principale

La **sidebar latérale** est organisée en sections hiérarchiques : Bureau (apps personnelles), Modules Métier (filtré par processus), Outils Transversaux (Messagerie, Agenda, Tâches). Les modules inaccessibles sont masqués ou grisés selon les droits de l'utilisateur, sans exposer leur existence au mauvais profil.

Le **header** affiche en permanence l'identité de l'utilisateur connecté, son niveau, les notifications actives, l'accès à l'assistant IA et le widget d'outils rapides. Une horloge temps réel et un indicateur de statut serveur complètent la barre de navigation.

### Système de thèmes

L'objet `T` (Theme) est injecté dans chaque composant et contient toutes les variables CSS dynamiques : couleurs de surface (4 niveaux), couleurs de texte (3 variantes), couleurs d'accentuation, bordures. Le passage d'un thème à l'autre est instantané sans rechargement.

### Formulaires & Saisie

Tous les formulaires utilisent des composants standardisés (`InputField`, `SelectField`, `NationaliteField`) garantissant une expérience homogène. Les validations sont faites en temps réel avec retours visuels immédiats. Les dialogues de confirmation (`gcAlert`, `gcConfirm`, `gcPrompt`) remplacent les `window.alert` natifs par des modals stylisées contextuelles.

### Gestion documentaire

L'interface des dossiers et documents est construite autour d'une **liste filtrable multi-colonnes** avec recherche full-text, filtres par statut/processus/date, et actions en masse. Chaque document dispose de boutons d'action contextuels (Voir, Télécharger, Supprimer) visibles uniquement si l'utilisateur a les droits correspondants.

### Feedback utilisateur

Le système de feedback utilise plusieurs canaux simultanés :
- **Toasts** (bas-droite) pour les confirmations non bloquantes
- **Banners SmartBanner** pour les alertes importantes en contexte
- **Badges** animés sur les icônes sidebar pour les compteurs de notifications
- **Progress indicators** pour les uploads et opérations longues
- **Dialogs modaux** pour les confirmations destructives

### Suite Bureautique (Personnel)

Les applications WriterPro, TableurPro et PresentationPro présentent des interfaces **inspirées des suites office professionnelles** avec barres d'outils riches, menus contextuels, raccourcis clavier, et prévisualisation temps réel. BudgetRapide offre un tableau de bord financier simplifié avec graphiques instantanés. Ces données restent **strictement privées** à chaque utilisateur.

### Assistant IA intégré

Un panneau latéral rétractable donne accès à l'assistant IA (Claude/GPT/Gemini configurable par l'admin). L'assistant est **conscient du contexte du module actif** et adapte ses réponses aux problématiques métier en cours. L'historique des conversations est conservé par session.

### Responsive & Accessibilité

L'interface est optimisée pour les **écrans 1280px–2560px** en mode paysage (usage bureau). La navigation clavier est supportée sur tous les formulaires et modals. Les contrastes respectent les ratios WCAG AA pour les textes principaux.

---

## Statistiques

| Métrique | Valeur |
|----------|--------|
| Modules métier | 19 |
| Composants React | 70+ |
| Hooks personnalisés | 2 |
| Routes API | 21+ |
| Événements WebSocket | 7 |
| Fichiers specs de tests | 20 |
| Lignes de code total | ~50 000 |
| Version Frontend | 10.5.1 |
| Version Backend | 10.6.0 |
| Base de données | SQLite 356 KB |

---

*Document généré le 03 juin 2026 — Confidentiel — Usage interne Génie Consultant uniquement*
