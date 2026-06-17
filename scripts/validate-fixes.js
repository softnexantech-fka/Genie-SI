#!/usr/bin/env node
/**
 * validate-fixes.js
 *
 * Wrapper ESM compatible (repo en "type":"module").
 * La version canonique est `validate-fixes.mjs`.
 *
 * Usage:
 *   node scripts/validate-fixes.js
 */

import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const r = spawnSync(process.execPath, [path.join(__dirname, "validate-fixes.mjs")], {
  stdio: "inherit",
});
process.exit(r.status ?? 0);
