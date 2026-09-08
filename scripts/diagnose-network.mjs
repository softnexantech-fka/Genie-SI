#!/usr/bin/env node

/**
 * NETWORK DIAGNOSTIC TOOL
 * Identifie les problèmes de synchronisation localhost ↔ host
 * 
 * Utilisation:
 * node diagnose-network.js
 */

// [FIX ESM] Ce fichier est chargé comme module ES (package.json → "type": "module").
// require() n'existe pas en ESM → le script plantait immédiatement à l'exécution
// avec "ReferenceError: require is not defined in ES module scope".
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// [FIX PATH] Ce script vit dans /scripts, mais api-proxy.js, vite.config.js et
// data/si.db sont à la RACINE du projet. Sans ce '..', les 3 checks suivants
// cherchaient (et échouaient silencieusement à trouver) des fichiers dans
// /scripts/api-proxy/... au lieu de /api-proxy/... → faux négatifs partout.
const ROOT = path.join(__dirname, '..');

// ============================================================================
// PART 1: VERIFICATION DES PORTS
// ============================================================================

function checkPorts() {
  console.log('\n📡 CHECK 1: Ports actifs\n');

  return new Promise((resolve) => {
    exec('netstat -ano | findstr ":3001 :4173"', (error, stdout, stderr) => {
      const lines = stdout.split('\n').filter(l => l.trim());
      
      if (lines.length === 0) {
        console.log('❌ AUCUN PORT ACTIF');
        console.log('  → Backend et Frontend ne tournent pas');
        console.log('  Lancez : npm run dev');
        resolve({port3001: false, port4173: false});
        return;
      }
      
      const port3001 = lines.some(l => l.includes(':3001'));
      const port4173 = lines.some(l => l.includes(':4173'));
      
      console.log(port3001 ? '✅ Port 3001 ACTIF (Backend)' : '❌ Port 3001 INACTIF');
      console.log(port4173 ? '✅ Port 4173 ACTIF (Frontend)' : '❌ Port 4173 INACTIF');
      
      if (port3001 && port4173) {
        console.log('\n💡 Détails:');
        lines.forEach(line => console.log('   ' + line.trim()));
      }
      
      resolve({port3001, port4173});
    });
  });
}

// ============================================================================
// PART 2: VERIFICATION BACKEND CONFIGURATION
// ============================================================================

async function checkBackendConfig() {
  console.log('\n📋 CHECK 2: Configuration Backend\n');
  
  const configFile = path.join(ROOT, 'api-proxy', 'api-proxy.js');
  
  if (!fs.existsSync(configFile)) {
    console.log('❌ api-proxy.js non trouvé');
    return {listen: '?', allowedOrigin: '?'};
  }
  
  const content = fs.readFileSync(configFile, 'utf8');
  
  // Extract listen port
  const portMatch = content.match(/const PORT\s*=\s*parseInt\(process\.env\.PROXY_PORT\s*\|\|\s*'(\d+)'\)/);
  const port = portMatch ? portMatch[1] : '3001';
  console.log(`✅ Backend écoute port: ${port}`);
  
  // Extract ALLOWED_ORIGIN
  const originMatch = content.match(/const ALLOWED_ORIGIN\s*=\s*process\.env\.ALLOWED_ORIGIN\s*\|\|\s*'([^']+)'/);
  const origin = originMatch ? originMatch[1] : 'http://localhost:4173';
  console.log(`📌 ALLOWED_ORIGIN: ${origin}`);
  
  // Check if listens on 0.0.0.0
  const listenMatch = content.match(/server\.listen\([^,]+,\s*'([^']+)'/);
  const listenAddr = listenMatch ? listenMatch[1] : 'unknown';
  console.log(`📡 Écoute sur: ${listenAddr}`);
  
  if (listenAddr === '0.0.0.0') {
    console.log('   ✅ Accessible depuis toutes les interfaces');
  } else if (listenAddr === 'localhost' || listenAddr === '127.0.0.1') {
    console.log('   ❌ PROBLÈME: Accessible SEULEMENT depuis localhost!');
    console.log('      → Changez en 0.0.0.0 dans api-proxy.js ligne ~1527');
  }
  
  return {port, allowedOrigin: origin, listenAddr};
}

// ============================================================================
// PART 3: VERIFICATION FRONTEND CONFIGURATION
// ============================================================================

async function checkFrontendConfig() {
  console.log('\n⚙️  CHECK 3: Configuration Frontend\n');
  
  const configFile = path.join(ROOT, 'vite.config.js');
  
  if (!fs.existsSync(configFile)) {
    console.log('❌ vite.config.js non trouvé');
    return {masterIp: '?', masterPort: '?'};
  }
  
  const content = fs.readFileSync(configFile, 'utf8');
  
  // Extract MASTER_IP
  // [FIX REGEX] L'ancienne regex cherchait "process.env.VITE_MASTER_IP" mais le code
  // réel utilise "process.env?.VITE_MASTER_IP" (optional chaining) → ne matchait jamais,
  // masquant silencieusement toute valeur définie via la variable d'environnement.
  const ipMatch = content.match(/const MASTER_IP\s*=.*process\.env\??\.VITE_MASTER_IP\)?\s*\|\|\s*'([^']+)'/);
  const ip = ipMatch ? ipMatch[1] : '192.168.1.133';
  console.log(`🌐 MASTER_IP: ${ip}`);
  
  // Extract MASTER_PORT
  const portMatch = content.match(/const MASTER_PORT\s*=.*process\.env\??\.VITE_MASTER_PORT\)?\s*\|\|\s*'(\d+)'/);
  const port = portMatch ? portMatch[1] : '3001';
  console.log(`🔌 MASTER_PORT: ${port}`);
  
  console.log(`✅ Frontend proxy redirige vers: http://${ip}:${port}`);
  
  return {masterIp: ip, masterPort: port};
}

// ============================================================================
// PART 4: TEST CONNECTIVITY
// ============================================================================

async function testConnectivity(backendPort) {
  console.log('\n🔗 CHECK 4: Connectivité\n');
  console.log('  ⚠️  Ces tests tournent EN LOCAL sur cette machine. Un succès ici ne prouve');
  console.log('     PAS qu\'un autre poste du réseau peut se connecter : Windows Firewall,');
  console.log('     l\'antivirus (pare-feu + inspection réseau) ou un mode "Public" sur le');
  console.log('     profil réseau bloquent souvent le trafic ENTRANT venant du LAN tout en');
  console.log('     laissant passer le trafic local (localhost → localhost).');
  console.log('     → Pour un vrai test, exécutez depuis UN POSTE CLIENT qui échoue :');
  console.log('       Test-NetConnection -ComputerName 192.168.1.133 -Port 4173');
  console.log('       Test-NetConnection -ComputerName 192.168.1.133 -Port 3001\n');

  // [FIX] Le port 4173 (frontend, celui qui échoue réellement chez l'utilisateur)
  // n'était jamais testé — seul le backend 3001 l'était.
  const tests = [
    { name: 'localhost:3001 (backend)', url: `http://localhost:${backendPort}` },
    { name: '127.0.0.1:3001 (backend)', url: `http://127.0.0.1:${backendPort}` },
    { name: '192.168.1.133:3001 (backend)', url: `http://192.168.1.133:${backendPort}` },
    { name: '192.168.1.133:4173 (frontend)', url: `http://192.168.1.133:4173` },
  ];
  
  const results = {};
  
  for (const test of tests) {
    await new Promise((resolve) => {
      console.log(`  Testing ${test.name}...`);
      
      http.get(test.url, {timeout: 2000}, (res) => {
        results[test.name] = res.statusCode === 200 ? '✅' : `⚠️ (${res.statusCode})`;
        console.log(`  ${results[test.name]} ${test.name}`);
        resolve();
      }).on('error', (err) => {
        results[test.name] = `❌ (${err.code})`;
        console.log(`  ${results[test.name]} ${test.name}`);
        resolve();
      });
    });
  }
  
  return results;
}

// ============================================================================
// PART 5: ANALYZE DATABASE
// ============================================================================

async function analyzeDatabase() {
  console.log('\n💾 CHECK 5: Base de Données\n');
  
  const dbPath = path.join(ROOT, 'api-proxy', 'data', 'si.db');
  const walPath = path.join(ROOT, 'api-proxy', 'data', 'si.db-wal');
  const shmPath = path.join(ROOT, 'api-proxy', 'data', 'si.db-shm');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Base de données non trouvée: ' + dbPath);
  } else {
    const stats = fs.statSync(dbPath);
    console.log(`✅ Base trouvée: ${path.basename(dbPath)}`);
    console.log(`   Taille: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Modifiée: ${stats.mtime.toLocaleString()}`);
  }
  
  if (fs.existsSync(walPath)) {
    console.log(`ℹ️  WAL file présent (transaction en cours?): ${(fs.statSync(walPath).size / 1024).toFixed(2)} KB`);
  }
  
  if (fs.existsSync(shmPath)) {
    console.log(`ℹ️  SHM file présent (shared memory): ${(fs.statSync(shmPath).size / 1024).toFixed(2)} KB`);
  }
}

// ============================================================================
// PART 6: RECOMMENDATIONS
// ============================================================================

async function printRecommendations(backendConfig, frontendConfig, connectivity) {
  console.log('\n🎯 RECOMMENDATIONS\n');
  
  const issues = [];
  
  if (backendConfig.listenAddr !== '0.0.0.0' && backendConfig.listenAddr !== 'localhost') {
    issues.push('Backend DOIT écouter sur 0.0.0.0');
  }
  
  if (!connectivity['192.168.1.133:3001 (backend)']?.includes('✅')) {
    issues.push('192.168.1.133:3001 (backend) NON ACCESSIBLE depuis cette machine elle-même - Vérifiez firewall');
  }
  if (!connectivity['192.168.1.133:4173 (frontend)']?.includes('✅')) {
    issues.push('192.168.1.133:4173 (frontend) NON ACCESSIBLE depuis cette machine elle-même - Vérifiez firewall');
  }

  if (issues.length === 0) {
    console.log('✅ Configuration applicative et connectivité LOCALE semblent correctes!');
    console.log('\nSi les AUTRES postes du réseau ne se connectent toujours pas, le problème');
    console.log('est très probablement au niveau OS/réseau de CETTE machine (le serveur),');
    console.log('pas dans le code de l\'app. À vérifier dans cet ordre :');
    console.log('1. Profil réseau Windows: Paramètres > Réseau et Internet > Wifi >');
    console.log('   propriétés du réseau connecté → doit être "Privé", pas "Public"');
    console.log('   (un réseau "Public" bloque par défaut les connexions entrantes du LAN)');
    console.log('2. Pare-feu / module réseau de votre antivirus (Kaspersky, ESET, Avast...):');
    console.log('   désactivez temporairement "protection réseau" / "pare-feu" pour tester,');
    console.log('   puis ajoutez une exception plutôt que de le laisser désactivé');
    console.log('3. Windows Defender Firewall: vérifiez qu\'une règle entrante autorise');
    console.log('   node.exe (ou les ports 4173/3001 TCP) sur les profils Privé ET Public');
    console.log('4. Isolation clients (AP/Client Isolation) sur le routeur Wifi, si activée');
    console.log('   elle empêche les appareils du même réseau de se joindre entre eux');
  } else {
    console.log('❌ Problèmes détectés:\n');
    issues.forEach((issue, i) => {
      console.log(`${i+1}. ${issue}`);
    });
  }
}

// ============================================================================
// MAIN
// ============================================================================

(async function() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  🔍 RÉSEAU DIAGNOSTIC - SI GÉNIE CONSULTANT');
  console.log('════════════════════════════════════════════════════════════');
  
  try {
    const ports = await checkPorts();
    const backendConfig = await checkBackendConfig();
    const frontendConfig = await checkFrontendConfig();
    
    if (ports.port3001) {
      const connectivity = await testConnectivity(backendConfig.port);
      await analyzeDatabase();
      await printRecommendations(backendConfig, frontendConfig, connectivity);
    } else {
      console.log('\n⚠️  Backend ne tourne pas - ne peut pas tester connectivité');
      console.log('Lancez d\'abord: cd api-proxy && node api-proxy.js');
    }
    
    console.log('\n════════════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('❌ Erreur:', err.message);
  }
})();
