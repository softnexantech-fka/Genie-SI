// ensure-run-preview-ready.js
// Prépare un environnement "run:preview" robuste :
// - s'assure que le backend a ses dépendances installées
// - s'assure que le build front existe (vite preview nécessite dist/)
// - mode --force : ré-installe/rebuild systématiquement
//
// Objectif : éviter les oublis et les pannes (dist manquant, node_modules absent).

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const BACKEND_DIR = path.join(ROOT, "api-proxy");
const FRONT_DIST = path.join(ROOT, "dist");
const FRONT_DIST_INDEX = path.join(FRONT_DIST, "index.html");
const FORCE = process.argv.includes("--force");

function log(msg) {
  process.stdout.write(msg + "\n");
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

// 1) Backend deps
if (FORCE || !exists(path.join(BACKEND_DIR, "node_modules"))) {
  log("[run:preview] Installation dépendances backend (api-proxy)...");
  run("npm install --no-audit --no-fund", BACKEND_DIR);
} else {
  log("[run:preview] Dépendances backend déjà présentes.");
}

// 2) Front build exists
if (FORCE) {
  log("[run:preview] --force : rebuild frontend (npm run build)...");
  run("npm run build", ROOT);
} else if (!exists(FRONT_DIST_INDEX)) {
  log("[run:preview] Build frontend manquant (dist/). Lancement de npm run build...");
  run("npm run build", ROOT);
} else {
  log("[run:preview] Build frontend présent (dist/).");
}

