// ensure-sqlite.cjs
// Ensures better-sqlite3 native module matches current Node ABI.
// If require fails (typical after Node upgrade), tries:
// 1) npm rebuild better-sqlite3
// 2) npm install better-sqlite3 (to fetch a compatible prebuild if available)

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const STRICT_SQLITE = ["1", "true", "yes", "on"].includes(
  String(process.env.GC_SQLITE_STRICT || "").toLowerCase()
);

function log(msg) {
  process.stdout.write(msg + "\n");
}

function resolveNpmCli() {
  // Ensure npm runs with the same Node executable as current process.
  // Typical Windows path:
  //   C:\Program Files\nodejs\node.exe
  //   C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js
  const nodeDir = path.dirname(process.execPath);
  const candidate = path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function runNpm(args) {
  const npmCli = resolveNpmCli();
  const joined = args.join(" ");
  if (npmCli) {
    const cmd = `"${process.execPath}" "${npmCli}" ${joined}`;
    log(`[ensure-sqlite] run: ${cmd}`);
    execSync(cmd, { stdio: "inherit" });
  } else {
    const cmd = `npm ${joined}`;
    log(`[ensure-sqlite] run: ${cmd}`);
    execSync(cmd, { stdio: "inherit" });
  }
}

function tryRequire() {
  try {
    // Validate full native load, not just package resolution.
    // Some mismatches only appear on first Database instantiation.
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    db.pragma("journal_mode = MEMORY");
    db.close();
    return true;
  } catch (e) {
    log(`[ensure-sqlite] better-sqlite3 unavailable: ${e.message}`);
    return false;
  }
}

log(`[ensure-sqlite] node=${process.version} modules=${process.versions.modules}`);
log(`[ensure-sqlite] execPath=${process.execPath}`);
log(`[ensure-sqlite] strict=${STRICT_SQLITE ? "ON" : "OFF"}`);

if (!tryRequire()) {
  try {
    log("[ensure-sqlite] Rebuilding better-sqlite3...");
    runNpm(["rebuild", "better-sqlite3", "--update-binary", "--ignore-scripts=false"]);
  } catch (e) {
    log(`[ensure-sqlite] Rebuild failed: ${e?.message || e}`);
  }

  if (!tryRequire()) {
    try {
      const moduleDir = path.join(process.cwd(), "node_modules", "better-sqlite3");
      if (fs.existsSync(moduleDir)) {
        log("[ensure-sqlite] Removing stale better-sqlite3 directory...");
        fs.rmSync(moduleDir, { recursive: true, force: true });
      }
      log("[ensure-sqlite] Trying fresh install of better-sqlite3...");
      runNpm([
        "install",
        "better-sqlite3@latest",
        "--no-audit",
        "--no-fund",
        "--ignore-scripts=false",
      ]);
    } catch (e) {
      log(`[ensure-sqlite] Install failed: ${e?.message || e}`);
    }
  }

  if (!tryRequire()) {
    if (STRICT_SQLITE) {
      log("[ensure-sqlite] STRICT mode: better-sqlite3 unavailable -> aborting startup.");
      log("[ensure-sqlite] Refusing JSON fallback to protect data integrity.");
      process.exit(1);
    } else {
      log("[ensure-sqlite] Could not load better-sqlite3. api-proxy will keep JSON fallback.");
      log("[ensure-sqlite] Fix: ensure one Node version is used, then run:");
      log("[ensure-sqlite]   cd api-proxy && npm install && npm rebuild better-sqlite3");
    }
  } else {
    log("[ensure-sqlite] better-sqlite3 OK.");
  }
}

