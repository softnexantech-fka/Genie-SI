// run-preview.js
// Lance l'environnement "run:preview" en un seul point d'entrée,
// avec support des arguments (ex: --force).
//
// Usage:
//   npm run run:preview
//   npm run run:preview -- --force

import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";

const ROOT = process.cwd();
const FORCE = process.argv.includes("--force");
const STRICT_SQLITE = process.argv.includes("--strict-sqlite");

function log(msg) {
  process.stdout.write(msg + "\n");
}

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

function resolveNpmCli() {
  const nodeDir = path.dirname(process.execPath);
  const candidate = path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function npmArgs(args) {
  const npmCli = resolveNpmCli();
  if (npmCli) return { cmd: process.execPath, args: [npmCli, ...args], shell: false };
  return { cmd: "npm", args, shell: true };
}

function prefixed(pipe, prefix) {
  pipe.on("data", (buf) => {
    const s = buf.toString();
    // Prefix each chunk (good enough for CI/console use)
    process.stdout.write(prefix + s.replace(/\n/g, "\n" + prefix).replace(new RegExp(prefix + "$"), ""));
  });
}

// 1) Cleanup ports (4173/3001) - keep existing behavior
run(`"${process.execPath}" scripts/cleanup-ports.js`, ROOT);

// 2) Ensure backend deps + frontend dist (optionally force build)
run(`"${process.execPath}" scripts/ensure-run-preview-ready.js${FORCE ? " --force" : ""}`, ROOT);

// 3) Start backend + preview
const backendNpm = npmArgs(["start"]);
const backend = spawn(backendNpm.cmd, backendNpm.args, {
  cwd: path.join(ROOT, "api-proxy"),
  shell: backendNpm.shell,
  env: {
    ...process.env,
    ...(STRICT_SQLITE ? { GC_SQLITE_STRICT: "1" } : {}),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
prefixed(backend.stdout, "[backend] ");
prefixed(backend.stderr, "[backend] ");

const frontendNpm = npmArgs(["run", "preview"]);
const frontend = spawn(frontendNpm.cmd, frontendNpm.args, {
  cwd: ROOT,
  shell: frontendNpm.shell,
  stdio: ["ignore", "pipe", "pipe"],
});
prefixed(frontend.stdout, "[frontend] ");
prefixed(frontend.stderr, "[frontend] ");

function shutdown(code = 0) {
  try { backend.kill(); } catch {}
  try { frontend.kill(); } catch {}
  process.exit(code);
}

backend.on("exit", (code) => {
  log(`[run:preview] Backend stopped (code=${code ?? "null"}). Stopping frontend...`);
  shutdown(code ?? 0);
});
frontend.on("exit", (code) => {
  log(`[run:preview] Frontend stopped (code=${code ?? "null"}). Stopping backend...`);
  shutdown(code ?? 0);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

