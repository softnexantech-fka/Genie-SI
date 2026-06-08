## Scripts — SI Génie Consultant

Ce dossier contient des scripts d'installation, diagnostics et démarrage.
Le projet est en `"type":"module"` : les scripts Node **compatibles** sont en `.mjs` ou `.cjs`.
Certains fichiers `.js` servent de **wrappers** pour éviter les conflits.

### Démarrage (recommandé)

- **Tout-en-un (ports + prerequis + backend + preview)**:
  - `npm run run:preview`
  - `npm run run:preview -- --force` (réinstalle/rebuild si nécessaire)
  - `npm run run:preview:strict` (force + refuse fallback JSON si SQLite KO)

### Automatisation Windows (serveur)

- **Démarrer**: `npm run si:start`
- **Arrêter**: `npm run si:stop`
- **Installer planification 07:30/20:00** (PowerShell admin requis):
  - `npm run si:schedule:install`

Voir aussi: `guide/SI_AUTOMATION_WINDOWS.md`

### Scripts techniques (diagnostics / maintenance)

- **Libérer les ports 3001/4173**: `node scripts/cleanup-ports.js`
- **Diagnostic réseau**: `node scripts/diagnose-network.js`
- **Scan de sync** (canonique `.cjs`):
  - `node scripts/scan-sync-issues.cjs`
  - ou wrapper: `node scripts/scan-sync-issues.js`
- **Validation fixes** (canonique `.mjs`):
  - `node scripts/validate-fixes.mjs`
  - ou wrapper: `node scripts/validate-fixes.js`

### Installation

- Windows: `scripts/install-windows.bat`
- Unix: `scripts/install-unix.sh`

### Notes importantes

- Si `better-sqlite3` casse après mise à jour Node, `api-proxy/scripts/ensure-sqlite.cjs`
  tente automatiquement `npm rebuild` / `npm install` au démarrage.
- Mode strict SQLite:
  - `GC_SQLITE_STRICT=1` (ou script `npm run run:preview:strict`)
  - si SQLite est indisponible, le backend s'arrête (pas de fallback JSON).

