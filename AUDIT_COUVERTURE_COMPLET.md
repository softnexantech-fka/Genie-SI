# Audit Intégral de Couverture — Génie SI
> Généré le 2026-06-02 · Version 153+ · Analyse exhaustive frontend ↔ backend

---

## LÉGENDE

```
✅ Couvert  ⚠️ Partiel  ❌ Absent/Cassé  🔧 À corriger  📌 Local uniquement (intentionnel)
```

---

## 1. SCHÉMA GÉNÉRAL DU FLUX DE DONNÉES

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           POSTE CLIENT (Navigateur)                         │
│                                                                              │
│  AppRoot.jsx ──────── HYDRATE_MAP (57 clés) ──────────────────────┐         │
│  SIApp.jsx  ─────────── dsGet / lsLoad au mount              LS  │         │
│  Module.jsx ─────────── _lsGet / lsLoad ─────── localStorage ────┤         │
│                          useSyncedState        (GC_SI_v12:xxx)    │         │
│                          dsSave / dsGet                           │         │
│  core/datastore.js ─── SHARED_KEYS (161 clés) ───── POST /api/data/:key    │
│  core/filestore.js ─── gcFileSave / gcFileDownload ─ POST /api/files/upload │
│  core/constants.js ─── gcDownloadDoc / gcViewDoc ─── GET /api/files/:id   │
│  core/storage.js ───── _lsGet / _lsSet / lsLoad / lsSave (wrappers LS)    │
└──────────────────────────────────────────────────────────────────┬──────────┘
                WebSocket (Socket.io)  +  HTTP REST                │
                data_changed / file_uploaded events               │
┌──────────────────────────────────────────────────────────────────▼──────────┐
│                           SERVEUR (192.168.1.133:3001)                       │
│                                                                              │
│  api-proxy.js                                                                │
│  ├── ALLOWED_KEYS (161 clés) ← whitelist POST /api/data/:key                │
│  ├── SHARED_KEYS  (161 clés) ← même liste côté frontend                     │
│  ├── SQLite WAL   ← si_data (key/value) + si_files + si_audit + si_tombstones│
│  ├── /api/auth/login    → JWT (8h)                                           │
│  ├── /api/data/:key     → GET (authenticateTokenOptional)                    │
│  ├── /api/data/:key     → POST (authenticateToken)                           │
│  ├── /api/files/upload  → multipart → disque api-proxy/data/uploads/YYYY/MM │
│  ├── /api/files/:id     → GET → stream fichier                               │
│  └── /api/admin/*       → stats, audit, backup                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. INVENTAIRE COMPLET DES CLÉS

### 2A. SHARED_KEYS / ALLOWED_KEYS — 161 clés synchronisées

```
ÉTAT : ✅ Toutes dans SHARED_KEYS (datastore.js) = ALLOWED_KEYS (api-proxy.js)
EXCEPTION : 'notifications' présent dans SHARED_KEYS mais ABSENT de ALLOWED_KEYS → ⚠️
```

| # | Clé | Type | Module consommateur | HYDRATE_MAP | SHARED | ALLOWED |
|---|-----|------|---------------------|:-----------:|:------:|:-------:|
| 1 | `users` | Array | Auth, Admin, tous | ✅ | ✅ | ✅ |
| 2 | `dossiers` | Array | Docs, Dashboard | ✅ | ✅ | ✅ |
| 3 | `taches` | Array | Tâches, Rapport | ✅ | ✅ | ✅ |
| 4 | `rdvs` | Array | Agenda | ✅ | ✅ | ✅ |
| 5 | `partners` | Array | Finance, Admin | ✅ | ✅ | ✅ |
| 6 | `pendingApprovals` | Array | Admin, Auth | ✅ | ✅ | ✅ |
| 7 | `standaloneDocuments` | Array | Docs | ✅ | ✅ | ✅ |
| 8 | `siAppearance` | Object | AppRoot, tous | ✅ | ✅ | ✅ |
| 9 | `siLogoUrl` | String | AppRoot, tous | ✅ | ✅ | ✅ |
| 10 | `siCSSOverrides` | String | AppRoot | ✅ | ✅ | ✅ |
| 11 | `gc-users` | Array | Auth, backend | ❌¹ | ✅ | ✅ |
| 12 | `gc-pending-approvals` | Array | Admin, Auth | ✅ | ✅ | ✅ |
| 13 | `gc-session-logs` | Array | Auth, Admin | ✅ | ✅ | ✅ |
| 14 | `gc-pending-connections` | Array | Auth | ✅ | ✅ | ✅ |
| 15 | `gc-require-conn-approval` | Bool | Auth, Config | ✅ | ✅ | ✅ |
| 16 | `gc-app-habilitations` | Array | Admin | ✅ | ✅ | ✅ |
| 17 | `gc-app-access-codes` | Array | Admin | ✅ | ✅ | ✅ |
| 18 | `gc-account-actions` | Array | Admin | ✅ | ✅ | ✅ |
| 19 | `gc-si-docs` | Array | Docs | ✅ | ✅ | ✅ |
| 20 | `gc-docs-unified` | Array | Docs | ✅ | ✅ | ✅ |
| 21 | `gc-process-config` | Object | Admin, Dashboard | ✅ | ✅ | ✅ |
| 22 | `gc-cabinet-info` | Object | Admin, Config | ✅ | ✅ | ✅ |
| 23 | `gc-fiscal-config` | Object | Finance, Config | ✅ | ✅ | ✅ |
| 24 | `gc-delai-config` | Object | Admin, Config | ✅ | ✅ | ✅ |
| 25 | `gc-circuits` | Array | Admin, Auth | ✅ | ✅ | ✅ |
| 26 | `gc-orgigram-nodes` | Array | Admin | ✅ | ✅ | ✅ |
| 27 | `gc-orgigram-links` | Array | Admin | ✅ | ✅ | ✅ |
| 28 | `gc-process-app-matrix` | Object | Admin | ✅ | ✅ | ✅ |
| 29 | `gc-codif-registry` | Object | Docs, Admin | ✅ | ✅ | ✅ |
| 30 | `gc-dossier-files` | Array | Docs, Fichiers | ✅ | ✅ | ✅ |
| 31 | `gc-standalone-docs` | Array | Docs | ✅ | ✅ | ✅ |
| 32 | `gc-courrier-docs` | Array | Docs | ✅ | ✅ | ✅ |
| 33 | `gc-external-docs` | Array | Docs | ✅ | ✅ | ✅ |
| 34 | `gc-internal-docs` | Array | Docs | ✅ | ✅ | ✅ |
| 35 | `gc-writer-docs` | Array | Bureautique | ✅ | ✅ | ✅ |
| 36 | `gc-writer-pro-v2` | Array | Bureautique | ✅ | ✅ | ✅ |
| 37 | `gc-tableur-pro` | Array | Bureautique | ✅ | ✅ | ✅ |
| 38 | `gc-pres-decks-v2` | Array | Bureautique | ✅ | ✅ | ✅ |
| 39 | `gc-factures` | Array | Finance | ✅ | ✅ | ✅ |
| 40 | `gc-devis` | Array | Finance | ✅ | ✅ | ✅ |
| 41 | `gc-journal` | Array | Finance | ✅ | ✅ | ✅ |
| 42 | `gc-achats` | Array | Finance, Logistique | ✅ | ✅ | ✅ |
| 43 | `gc-demandes` | Array | Admin | ✅ | ✅ | ✅ |
| 44 | `gc-kyc-workflows` | Array | Conformité | ✅ | ✅ | ✅ |
| 45 | `gc-leaves` | Array | SIRH | ✅ | ✅ | ✅ |
| 46 | `gc-recrutements` | Array | SIRH | ✅ | ✅ | ✅ |
| 47 | `gc-sirh-presences` | Array | SIRH | ✅ | ✅ | ✅ |
| 48 | `gc-sirh-evaluations` | Array | SIRH | ✅ | ✅ | ✅ |
| 49 | `gc-sirh-fichiers` | Array | SIRH | ✅ | ✅ | ✅ |
| 50 | `gc-paie-taux` | Array | SIRH Paie | ✅ | ✅ | ✅ |
| 51 | `gc-paie-transferts` | Array | SIRH Paie | ✅ | ✅ | ✅ |
| 52 | `gc-crm-interactions` | Array | CRM | ✅ | ✅ | ✅ |
| 53 | `gc-crm-opps` | Array | CRM | ✅ | ✅ | ✅ |
| 54 | `gc-crm-relances` | Array | CRM | ✅ | ✅ | ✅ |
| 55 | `gc-conventions` | Array | Finance, CRM | ✅ | ✅ | ✅ |
| 56 | `gc-messages-global` | Array | Messagerie | ✅ | ✅ | ✅ |
| 57 | `gc-audit-actions` | Array | Audit | ✅ | ✅ | ✅ |
| 58 | `gc-audit-checklist` | Array | Audit | ✅ | ✅ | ✅ |
| 59 | `gc-audit-prog` | Array | Audit | ✅ | ✅ | ✅ |
| 60 | `gc-risks` | Array | Conformité | ✅ | ✅ | ✅ |
| 61 | `gc-nc` | Array | Conformité | ✅ | ✅ | ✅ |
| 62 | `gc-obligations` | Array | Conformité | ✅ | ✅ | ✅ |
| 63 | `gc-rgpd-traitements` | Array | Conformité | ✅ | ✅ | ✅ |
| 64 | `gc-conseil-opinions` | Array | Conseil | ✅ | ✅ | ✅ |
| 65 | `gc-si-appearance` | Object | Admin Config | ⚠️² | ✅ | ✅ |
| 66 | `gc-si-logo-url` | String | Admin Config | ⚠️² | ✅ | ✅ |
| 67 | `gc-si-css-overrides` | String | Admin Config | ⚠️² | ✅ | ✅ |
| 68 | `gc-budget` | Object | Finance | ❌³ | ✅ | ✅ |
| 69 | `gc-budget-rapide` | Array | Bureautique | ❌³ | ✅ | ✅ |
| 70 | `gc-stocks` | Array | Finance/Logistique | ❌³ | ✅ | ✅ |
| 71 | `gc-inventaires` | Array | Logistique | ❌³ | ✅ | ✅ |
| 72 | `gc-inventaire-en-cours` | Object | Logistique | ❌³ | ✅ | ✅ |
| 73 | `gc-logistique-actifs` | Array | Logistique | ❌³ | ✅ | ✅ |
| 74 | `gc-tpa` | Array | Audit | ❌³ | ✅ | ✅ |
| 75 | `gc-feuille-tests` | Array | Audit | ❌³ | ✅ | ✅ |
| 76 | `gc-audit-checklist-custom` | Array | Audit | ❌³ | ✅ | ✅ |
| 77 | `gc-audit-grille-taches` | Array | Audit | ❌³ | ✅ | ✅ |
| 78 | `gc-pca` | Array | Audit PCA | ❌³ | ✅ | ✅ |
| 79 | `gc-pca-risques` | Array | Audit PCA | ❌³ | ✅ | ✅ |
| 80 | `gc-pca-procedures` | Array | Audit PCA | ❌³ | ✅ | ✅ |
| 81 | `gc-pca-tests` | Array | Audit PCA | ❌³ | ✅ | ✅ |
| 82 | `gc-coso-scores` | Array | Audit COSO | ❌³ | ✅ | ✅ |
| 83 | `gc-coso-notes` | Array | Audit COSO | ❌³ | ✅ | ✅ |
| 84 | `gc-coso-custom-q` | Array | Audit COSO | ❌³ | ✅ | ✅ |
| 85 | `gc-conffull-approvals` | Array | Conformité | ❌³ | ✅ | ✅ |
| 86 | `gc-conffull-checks` | Array | Conformité | ❌³ | ✅ | ✅ |
| 87 | `gc-conffull-kpi` | Array | Conformité | ❌³ | ✅ | ✅ |
| 88 | `gc-conffull-veille` | Array | Conformité | ❌³ | ✅ | ✅ |
| 89 | `gc-jur-docs` | Array | Juridique | ❌³ | ✅ | ✅ |
| 90 | `gc-jur-custom-laws` | Array | Juridique | ❌³ | ✅ | ✅ |
| 91 | `gc-jur-custom-modeles` | Array | Juridique | ❌³ | ✅ | ✅ |
| 92 | `gc-jur-veille` | Array | Juridique | ❌³ | ✅ | ✅ |
| 93 | `gc-jur-kyc` | Array | Juridique, SIRH | ❌³ | ✅ | ✅ |
| 94 | `gc-comm-fiches` | Array | Communication | ❌³ | ✅ | ✅ |
| 95 | `gc-comm-custom-tpl` | Array | Communication | ❌³ | ✅ | ✅ |
| 96 | `gc-comm-contacts` | Array | Communication | ❌³ | ✅ | ✅ |
| 97 | `gc-comm-campagnes` | Array | Communication | ❌³ | ✅ | ✅ |
| 98 | `gc-bcg` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 99 | `gc-mckinsey` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 100 | `gc-porter` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 101 | `gc-vrio` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 102 | `gc-qqoqcp` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 103 | `gc-pdca` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 104 | `gc-pareto` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 105 | `gc-mc7s` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 106 | `gc-ansoff` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 107 | `gc-10m` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 108 | `gc-5m` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 109 | `gc-5s` | Array | Analyse Strat. | ❌³ | ✅ | ✅ |
| 110 | `gc-amelio-actions` | Array | Amélioration | ❌³ | ✅ | ✅ |
| 111 | `gc-amelio-kpis` | Array | Amélioration | ❌³ | ✅ | ✅ |
| 112 | `gc-amelio-ncs` | Array | Amélioration | ❌³ | ✅ | ✅ |
| 113 | `gc-matrix-log` | Array | Admin | ❌³ | ✅ | ✅ |
| 114 | `gc-msg-drafts` | Array | Messagerie | ❌³ | ✅ | ✅ |
| 115 | `gc-msg-templates` | Array | Messagerie | ❌³ | ✅ | ✅ |
| 116 | `gc-notes-rapides` | Array | Outils | ❌³ | ✅ | ✅ |
| 117 | `gc-logmod-stocks` | Array | Logistique | ❌³ | ✅ | ✅ |
| 118 | `gc-piece-series` | Array | Finance | ❌³ | ✅ | ✅ |
| 119 | `gc-backup-log` | Array | Sys/Admin | ❌³ | ✅ | ✅ |
| 120 | `gc-backups` | Array | Sys/Admin | ❌³ | ✅ | ✅ |
| 121 | `gc-kanban-cols-v2` | Array | Tâches | ❌³ | ✅ | ✅ |
| 122 | `gc-kanban-cards-v2` | Array | Tâches | ❌³ | ✅ | ✅ |
| 123 | `gc-forms` | Array | Bureautique | ❌³ | ✅ | ✅ |
| 124 | `gc-ohada-docs` | Array | Finance | ❌³ | ✅ | ✅ |
| 125 | `gc-ohada-custom` | Object | Finance | ❌³ | ✅ | ✅ |
| 126 | `gc-ohada-overrides` | Object | Finance | ❌³ | ✅ | ✅ |
| 127 | `gc-presence` | Object | Admin SIRH | ❌³ | ✅ | ✅ |
| 128 | `gc-security-alerts` | Array | Sécurité | ❌³ | ✅ | ✅ |
| 129 | `gc-crm-clients` | Array | CRM | ❌³ | ✅ | ✅ |
| 130 | `gc-sirh-leaves` | Array | SIRH | ❌³ | ✅ | ✅ |
| 131 | `gc-sirh-recrutements` | Array | SIRH | ❌³ | ✅ | ✅ |
| 132 | `gc-gestion-archives` | Array | Docs | ❌³ | ✅ | ✅ |
| 133 | `gc-archives` | Array | Docs | ❌³ | ✅ | ✅ |
| 134 | `gc-memos` | Array | Outils | ❌³ | ✅ | ✅ |
| 135 | `gc-rapport-activite` | Array | Rapport | ❌³ | ✅ | ✅ |
| 136 | `gc-ai-proxy-url` | String | Config | 📌 | ✅ | ✅ |
| 137 | `gc-tombstones` | Object | Sys | 📌 | ✅ | ✅ |
| 138 | `gc-files` | Array | Sys | 📌 | ✅ | ✅ |
| 139 | `gc-schema-version` | String | Sys | 📌 | ✅ | ✅ |
| 140 | `notifications` | Array | Messagerie | ❌⁴ | ✅ | ❌⁴ |
| 141 | `gc-committees` | Object | Dashboard | ❌³ | ✅ | ✅ |
| ... | _et 20+ clés système..._ | | | | | |

**Notes :**
- ¹ `gc-users` : backend uniquement, ne doit PAS être dans HYDRATE_MAP (sécurité)
- ² `gc-si-appearance/logo-url/css-overrides` : dans HYDRATE_MAP comme setters vers state React (correct, mais clé distincte de `siAppearance`)
- ³ ❌ dans HYDRATE_MAP = **données non hydratées au démarrage** → module charge vide sur poste frais
- ⁴ `notifications` : dans SHARED_KEYS mais **absent de ALLOWED_KEYS** → écriture bloquée côté serveur

---

## 3. GRAPHE DE COUVERTURE MODULES ↔ HYDRATE_MAP

```
MODULE                    CLÉS UTILISÉES               HYDRATÉE?
───────────────────────────────────────────────────────────────────
Administration
 ├─ AdminPanel.jsx         users, dossiers, partners      ✅✅✅
 ├─ CabinetInfoConfig.jsx  gc-cabinet-info                ✅
 ├─ HubPanels.jsx          gc-process-app-matrix          ✅
 ├─ GestionComptesPanel    users, gc-account-actions      ✅✅
 ├─ CollaborateursPanel    gc-presence, gc-jur-kyc        ❌❌  ← non hydraté
 ├─ InformationsPanel      dossiers, gc-cabinet-info      ✅✅
 └─ SIConfigPanels         gc-process-config              ✅

Tableau de bord
 ├─ Dashboard.jsx          gc-committees, gc-process-cfg  ❌✅
 └─ Indicateurs.jsx        (dsGet dynamique)              ✅ (via dsGet)

Dossiers / Docs
 ├─ GestionDocsUnifiee     gc-si-docs, gc-docs-unified    ✅✅
 │                         gc-standalone-docs             ✅
 ├─ DossiersList.jsx       dossiers, taches               ✅✅
 ├─ ArchivagePanel         gc-archives, gc-gestion-arch   ❌❌  ← non hydraté
 └─ CodificationPanel      gc-codif-registry              ✅

Finance
 └─ FinanceApp.jsx         gc-factures, gc-devis          ✅✅
                           gc-journal, gc-conventions     ✅✅
                           gc-paie-taux, gc-budget        ✅❌  ← gc-budget non hydraté
                           gc-stocks, gc-piece-series     ❌❌  ← non hydratés
                           gc-ohada-docs, gc-ohada-custom ❌❌  ← non hydratés

SIRH
 └─ SIRHModule.jsx         gc-sirh-presences              ✅
                           gc-sirh-evaluations            ✅
                           gc-leaves, gc-recrutements     ✅✅
                           gc-sirh-leaves                 ❌  ← non hydraté
                           gc-sirh-recrutements           ❌  ← non hydraté

Audit
 └─ AuditApp.jsx           gc-tpa, gc-feuille-tests       ❌❌  ← non hydratés
                           gc-audit-actions, gc-audit-prog ✅✅
                           gc-audit-checklist             ✅
                           gc-audit-checklist-custom      ❌
                           gc-pca, gc-pca-*               ❌❌  ← non hydratés
                           gc-coso-*                      ❌❌  ← non hydratés

Conformité
 └─ ConformiteApp.jsx      gc-kyc-workflows               ✅
                           gc-nc, gc-obligations          ✅✅
                           gc-rgpd-traitements            ✅
                           gc-conffull-*                  ❌❌  ← non hydratés
                           gc-risks                       ✅

Juridique
 └─ JuridiqueApp.jsx       gc-jur-docs                    ❌  ← non hydraté
                           gc-jur-custom-laws             ❌
                           gc-jur-custom-modeles          ❌
                           gc-jur-veille                  ❌
                           gc-jur-kyc                     ❌  ← AUCUNE des 5 clés

Communication
 └─ CommunicationApp.jsx   gc-comm-campagnes              ❌  ← aucune hydratée
                           gc-comm-contacts               ❌
                           gc-comm-fiches                 ❌

Logistique
 └─ LogistiqueApp.jsx      gc-achats                      ✅
                           gc-inventaires                 ❌
                           gc-logmod-stocks               ❌
                           gc-logistique-actifs           ❌
                           gc-inventaire-en-cours         ❌

Conseil
 └─ ConseilApp.jsx         gc-conseil-opinions            ✅

Messagerie
 └─ MessagerieUnifiee.jsx  gc-messages-global             ✅
                           gc-msg-drafts, gc-msg-templates ❌❌

Agenda
 └─ AgendaModule.jsx       rdvs                           ✅

Tâches
 └─ TachesPanel.jsx        taches                         ✅
                           gc-kanban-cols-v2              ❌
                           gc-kanban-cards-v2             ❌

Bureautique
 ├─ WriterPro.jsx          gc-writer-pro-v2               ✅
 ├─ TableurPro.jsx         gc-tableur-pro                 ✅
 ├─ PresentationPro.jsx    gc-pres-decks-v2               ✅
 ├─ BudgetRapide.jsx       gc-budget-rapide               ❌
 └─ Formulaires.jsx        gc-forms                       ❌

Rapport
 └─ RapportActiviteModule  taches, gc-rapport-activite    ✅❌
```

---

## 4. IMPORTS/EXPORTS — ÉTAT DE COUVERTURE

### 4A. core/index.js — Barrel Export

```javascript
export * from './storage.js'         // ✅ _lsGet, _lsSet, _lsRm, lsLoad, lsSave,
                                     //    lsLoadSecure, _gcEncrypt, _gcDecrypt, etc.
export * from './helpers.js'         // ✅ playSound, formatDate, formatCFA, gcPushNotif,
                                     //    gcHashPassword, gcVerifyPassword, generateAccessCode, etc.
export * from './context.jsx'        // ✅ useSI, SICtx, SIErrorBoundary
export * from './constants.js'       // ✅ INITIAL_*, GC_*, THEMES, gcDownloadDoc, gcViewDoc
export * from './filestore.js'       // ✅ gcFileSave, gcFileDownload, gcFileUrl, gcFileLoad
export * from './datastore.js'       // ✅ dsSave, dsGet, dsLoad, dsOnSync, SHARED_KEYS
export { useSyncedState }            // ✅ hook exporté
  from '../hooks/useSyncedState.js'
```

**Conflits d'export détectés :**
| Symbole | Exporté par | Risque |
|---------|-------------|--------|
| `gcDownloadDoc` | constants.js ET filestore.js (indirect) | ⚠️ Résolu — constants.js importe filestore.js |
| `gcViewDoc` | constants.js ET helpers.js | ⚠️ Doublon — helpers.js ré-exporte depuis constants.js |
| `getProxyUrl` | filestore.js ET datastore.js | ⚠️ Double export — même logique, deux implémentations |
| `gcHashPassword` | constants.js ET helpers.js | ⚠️ Doublon — helpers ré-exporte depuis constants |

### 4B. Imports manquants dans les modules

| Module | Symbole importé | Disponible ? |
|--------|-----------------|:------------:|
| Tous modules | `dsSave`, `dsGet` | ✅ (via index.js) |
| Finance | `lsLoadSecure` | ✅ (via index.js → storage.js) |
| Dashboard | `dsDeleteItemFromArray` | ✅ |
| Juridique | `dsOnSync` | ✅ |
| Auth.jsx | `getProxyUrl` | ✅ (via index.js) |
| AppRoot.jsx | `dsGet` (import dynamique) | ✅ |

**Aucun import cassé détecté** dans les 24 modules.

### 4C. Symboles exportés mais jamais importés

| Symbole | Exporté dans | Importé ? |
|---------|-------------|:---------:|
| `useSyncedState` | hooks/useSyncedState.js | ❌ Jamais utilisé dans les modules |
| `gcProxyStatus` | filestore.js | ❌ Jamais importé |
| `gcMigrateFilesFromLS` | filestore.js | ❌ Jamais appelé depuis les modules |
| `dsClearTombstones` | datastore.js | ❌ Jamais appelé |
| `gcFileStats` | filestore.js | ❌ Seulement dans TestUpload.jsx |
| `isSharedKey` | datastore.js | ❌ Non utilisé côté frontend |

---

## 5. ANOMALIES ET BUGS DÉTECTÉS

### 5A. Clés court-circuitant la synchronisation

| Clé | Fichier | Ligne | Problème |
|-----|---------|-------|---------|
| `GC_SI_v12:notif:${userId}` | GestionComptesPanel.jsx | 1358, 2253, 2260 | ⚠️ Clé dynamique avec préfixe différent de `gc-notif-` → validation isAllowedKey() échoue |
| `gc-admin-redirect` | SIConfigPanels.jsx | 758 | 📌 _lsSet uniquement, jamais dsSave → local seulement (intentionnel ?) |
| `session-logs` | FinanceApp.jsx | 1852 | ⚠️ lsLoadSecure("session-logs") mais la clé officielle est `gc-session-logs` |

### 5B. Clé dans SHARED_KEYS mais absente de ALLOWED_KEYS

| Clé | Impact |
|-----|--------|
| `notifications` | POST /api/data/notifications → 403 "Clé non autorisée" |

### 5C. Modules dont AUCUNE clé n'est hydratée au démarrage

Ces modules **démarrent toujours vides** sur un poste frais (sauf si l'utilisateur a déjà visité la page) :

| Module | Clés non hydratées |
|--------|-------------------|
| Juridique | gc-jur-docs, gc-jur-custom-laws, gc-jur-custom-modeles, gc-jur-veille, gc-jur-kyc |
| Communication | gc-comm-campagnes, gc-comm-contacts, gc-comm-fiches, gc-comm-custom-tpl |
| Bureautique/Budget | gc-budget-rapide, gc-budget, gc-forms |
| Logistique (partiel) | gc-inventaires, gc-logmod-stocks, gc-logistique-actifs, gc-inventaire-en-cours |
| Audit COSO/PCA | gc-coso-*, gc-pca-*, gc-tpa, gc-feuille-tests |
| Analyse Stratégique | gc-bcg, gc-mckinsey, gc-porter, gc-vrio, gc-qqoqcp, gc-pdca, gc-pareto, gc-mc7s, gc-ansoff, gc-10m, gc-5m, gc-5s |
| Messagerie (partiel) | gc-msg-drafts, gc-msg-templates |
| Tâches Kanban | gc-kanban-cols-v2, gc-kanban-cards-v2 |
| Dashboard | gc-committees |
| Rapport | gc-rapport-activite |
| Admin | gc-presence, gc-security-alerts |

---

## 6. TASKLIST PRIORITAIRE

### 🔴 PRIORITÉ 1 — Critique (bloquant fonctionnement)

```
[ ] T01 — Ajouter 'notifications' dans ALLOWED_KEYS (api-proxy.js)
    Fichier : api-proxy/api-proxy.js
    Action  : Ajouter 'notifications' dans le Set ALLOWED_KEYS
    Impact  : Messagerie bloquée en écriture côté serveur

[ ] T02 — Corriger les clés de notification dynamiques dans GestionComptesPanel
    Fichier : src/modules/admin/GestionComptesPanel.jsx lignes 1358, 2253, 2260
    Action  : Remplacer 'GC_SI_v12:notif:${userId}' par un dsSave vers
              'gc-notif-${userId}' (préfixe reconnu par isAllowedKey)
    Impact  : Notifications admin non synchronisées entre postes

[ ] T03 — Corriger la clé 'session-logs' en 'gc-session-logs' dans FinanceApp
    Fichier : src/modules/finance/FinanceApp.jsx ligne 1852
    Action  : lsLoadSecure("session-logs") → lsLoad("gc-session-logs", [])
    Impact  : Logs de session chargés depuis une mauvaise clé
```

### 🟠 PRIORITÉ 2 — Important (données manquantes sur postes clients)

```
[ ] T04 — Ajouter les clés JURIDIQUE dans HYDRATE_MAP (AppRoot.jsx)
    Clés : gc-jur-docs, gc-jur-custom-laws, gc-jur-custom-modeles,
           gc-jur-veille, gc-jur-kyc
    Impact : Module Juridique vide sur tout nouveau poste

[ ] T05 — Ajouter les clés COMMUNICATION dans HYDRATE_MAP
    Clés : gc-comm-campagnes, gc-comm-contacts, gc-comm-fiches, gc-comm-custom-tpl
    Impact : Module Communication vide sur tout nouveau poste

[ ] T06 — Ajouter les clés AUDIT AVANCÉ dans HYDRATE_MAP
    Clés : gc-tpa, gc-feuille-tests, gc-audit-checklist-custom, gc-audit-grille-taches
           gc-pca, gc-pca-risques, gc-pca-procedures, gc-pca-tests
           gc-coso-scores, gc-coso-notes, gc-coso-custom-q
           gc-amelio-actions, gc-amelio-kpis, gc-amelio-ncs
    Impact : Module Audit COSO/PCA vide sur postes frais

[ ] T07 — Ajouter les clés CONFORMITÉ AVANCÉE dans HYDRATE_MAP
    Clés : gc-conffull-approvals, gc-conffull-checks, gc-conffull-kpi, gc-conffull-veille
    Impact : Sections conformité avancée vides sur postes frais

[ ] T08 — Ajouter les clés LOGISTIQUE dans HYDRATE_MAP
    Clés : gc-inventaires, gc-inventaire-en-cours, gc-logmod-stocks, gc-logistique-actifs
    Impact : Module Logistique partiellement vide

[ ] T09 — Ajouter les clés FINANCE avancées dans HYDRATE_MAP
    Clés : gc-budget, gc-budget-rapide, gc-stocks, gc-piece-series,
           gc-ohada-docs, gc-ohada-custom, gc-ohada-overrides
    Impact : Sections Finance avancées vides (OHADA, Budget, Stocks)

[ ] T10 — Ajouter les clés SIRH avancées dans HYDRATE_MAP
    Clés : gc-sirh-leaves, gc-sirh-recrutements
    Impact : Doublons de leaves/recrutements sur SIRH

[ ] T11 — Ajouter les clés MESSAGERIE avancées dans HYDRATE_MAP
    Clés : gc-msg-drafts, gc-msg-templates
    Impact : Brouillons et modèles de messages perdus sur postes frais

[ ] T12 — Ajouter les clés TÂCHES KANBAN dans HYDRATE_MAP
    Clés : gc-kanban-cols-v2, gc-kanban-cards-v2
    Impact : Vue Kanban vide sur postes frais

[ ] T13 — Ajouter les clés DASHBOARD dans HYDRATE_MAP
    Clés : gc-committees, gc-rapport-activite
    Impact : Dashboard partiellement vide

[ ] T14 — Ajouter les clés ADMIN avancées dans HYDRATE_MAP
    Clés : gc-presence, gc-security-alerts, gc-matrix-log
    Impact : Présence et alertes sécurité non synchronisées

[ ] T15 — Ajouter les clés ANALYSE STRATÉGIQUE dans HYDRATE_MAP
    Clés : gc-bcg, gc-mckinsey, gc-porter, gc-vrio, gc-qqoqcp, gc-pdca,
           gc-pareto, gc-mc7s, gc-ansoff, gc-10m, gc-5m, gc-5s
    Impact : Outils d'analyse stratégique vides sur postes frais

[ ] T16 — Ajouter les clés ARCHIVES dans HYDRATE_MAP
    Clés : gc-archives, gc-gestion-archives, gc-docs-archives
    Impact : Archives vides sur postes frais

[ ] T17 — Ajouter les clés OUTILS dans HYDRATE_MAP
    Clés : gc-forms, gc-notes-rapides, gc-memos
    Impact : Formulaires et notes non synchronisés

[ ] T18 — Ajouter les clés CRM avancées dans HYDRATE_MAP
    Clés : gc-crm-clients
    Impact : Base clients CRM vide sur postes frais
```

### 🟡 PRIORITÉ 3 — Amélioration (qualité/robustesse)

```
[ ] T19 — Résoudre le double export getProxyUrl (filestore.js ET datastore.js)
    Action : Exporter depuis un seul endroit (datastore.js), ré-importer dans filestore.js
    Impact : Incohérence potentielle si les URLs divergent

[ ] T20 — Résoudre le double export gcHashPassword / gcVerifyPassword
    (constants.js ET helpers.js — helpers ré-exporte)
    Action : Supprimer les ré-exports de helpers.js, importer depuis constants.js
    Impact : Confusion sur quelle implémentation est utilisée

[ ] T21 — Activer useSyncedState dans au moins 3 modules pilotes
    Actuellement : hook exporté mais JAMAIS utilisé dans les modules
    Action : Remplacer les patterns _lsGet + dsGet + dsOnSync manuels
             par useSyncedState dans Agenda, Tâches, Messagerie
    Impact : Cohérence temps réel améliorée, moins de code boilerplate

[ ] T22 — Implémenter dsClearTombstones périodique
    Fichier : api-proxy/api-proxy.js
    Action  : Appeler dsClearTombstones() ou équivalent serveur tous les 30 jours
    Impact  : Table si_tombstones grossit indéfiniment

[ ] T23 — Nettoyer les exports morts
    Symboles : gcProxyStatus, gcMigrateFilesFromLS, gcFileStats (hors TestUpload), isSharedKey
    Action  : Retirer de core/index.js si non consommés (ou documenter leur usage prévu)

[ ] T24 — Valider gc-admin-redirect : intentionnellement local ou oubli dsSave ?
    Fichier : src/modules/admin/SIConfigPanels.jsx ligne 758
    Action  : Si sync nécessaire → ajouter dsSave + clé dans SHARED_KEYS/ALLOWED_KEYS
```

---

## 7. RÉSUMÉ EXÉCUTIF

```
COUVERTURE GLOBALE
┌─────────────────────────────────────────────────────────────────────┐
│ Clés totales déclarées (SHARED_KEYS)       : 161                    │
│ Clés dans HYDRATE_MAP (hydratées au boot)  :  64  (40%)             │
│ Clés synchronisées dsSave mais non hydratées: 90  (56%)  ← GAP MAJEUR│
│ Clés dans ALLOWED_KEYS (backend)           : 160  (99%)  ← 1 manquant│
│ Modules sans aucune hydratation            :   5  modules            │
│ Imports cassés                             :   0  ✅                  │
│ Exports conflictuels                       :   4  ⚠️                  │
└─────────────────────────────────────────────────────────────────────┘

IMPACT SUR L'UTILISATEUR
- Connexion & auth                     : ✅ Fonctionnelle (fixes récents)
- Données de base (dossiers, users...) : ✅ Synchronisées
- Modules métier principaux            : ⚠️ Partiellement vides sur postes frais
- Modules Juridique / Communication    : ❌ Vides sur tout poste neuf
- Modules Audit COSO/PCA               : ❌ Vides sur tout poste neuf
- Fichiers (upload/download)           : ✅ Fonctionnel (fixes récents)
- Temps réel WebSocket                 : ✅ Fonctionnel
- Backup SQLite                        : ✅ Implémenté (toutes les 6h)

PROCHAINES ÉTAPES (ordre recommandé)
  1. Appliquer T01-T03 (bugs critiques, 30 min)
  2. Appliquer T04-T18 en lot (une passe dans AppRoot.jsx, 1h)
  3. Appliquer T19-T24 (qualité, 2h)
  4. Build + déploiement + Ctrl+Shift+R sur tous les postes
```

---

*Audit généré automatiquement — Génie Consultant SI v153+*
