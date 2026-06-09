#!/usr/bin/env node
/**
 * scan-sync-issues.js
 *
 * Wrapper ESM compatible (repo en "type":"module").
 * La version canonique est `scan-sync-issues.cjs`.
 *
 * Usage:
 *   node scripts/scan-sync-issues.js
 */

import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const r = spawnSync(process.execPath, [path.join(__dirname, "scan-sync-issues.cjs")], {
  stdio: "inherit",
});
process.exit(r.status ?? 0);
