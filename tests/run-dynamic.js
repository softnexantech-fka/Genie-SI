#!/usr/bin/env node
/* global process */

/**
 * Lanceur dynamique des tests E2E
 * Lit la configuration depuis test-config.json et exécute les tests activés
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, 'test-config.json');

if (!fs.existsSync(configPath)) {
  console.error('❌ Fichier de configuration test-config.json introuvable');
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('❌ Erreur de lecture du fichier de configuration:', error.message);
  process.exit(1);
}

console.log('🚀 Lancement des tests E2E dynamiques du SI');
console.log('📋 Configuration chargée:', config.version);
console.log('🌐 Navigateur primaire:', config.browsers.primary);

// Collecter les modules activés
const enabledModules = Object.entries(config.modules)
  .filter(([, module]) => module.enabled)
  .map(([name, module]) => ({ name, ...module }));

if (enabledModules.length === 0) {
  console.log('⚠️ Aucun module de test activé dans la configuration');
  process.exit(0);
}

console.log(`📦 Modules activés: ${enabledModules.length}`);
enabledModules.forEach(module => {
  console.log(`  ✓ ${module.name}: ${module.description}`);
});

// Construire la commande Playwright
const testFiles = enabledModules.map(module => module.file).join(' ');
const browser = config.browsers.primary;
const headless = '--headed'; // Mode headless pour CI/CD
const parallel = '--workers=1'; // Un worker pour éviter conflits

const command = `npx playwright test ${testFiles} --project=${browser} ${headless} ${parallel} --reporter=html --output=../test-results/playwright`;

console.log('\n🔧 Commande exécutée:');
console.log(command);
console.log('\n➡️  Après exécution, voir : npx playwright show-report ../test-results/playwright');
console.log('\n' + '='.repeat(50));

try {
  execSync(command, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('\n✅ Tests terminés avec succès');
} catch {
  console.log('\n❌ Échec des tests');
  process.exit(1);
}