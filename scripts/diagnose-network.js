#!/usr/bin/env node

/**
 * NETWORK DIAGNOSTIC TOOL
 * Identifie les problèmes de synchronisation localhost ↔ host
 * 
 * Utilisation:
 * node diagnose-network.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================================
// PART 1: VERIFICATION DES PORTS
// ============================================================================

function checkPorts() {
  console.log('\n📡 CHECK 1: Ports actifs\n');
  
  const { exec } = require('child_process');
  
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
  
  const configFile = path.join(__dirname, 'api-proxy', 'api-proxy.js');
  
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
  
  const configFile = path.join(__dirname, 'vite.config.js');
  
  if (!fs.existsSync(configFile)) {
    console.log('❌ vite.config.js non trouvé');
    return {masterIp: '?', masterPort: '?'};
  }
  
  const content = fs.readFileSync(configFile, 'utf8');
  
  // Extract MASTER_IP
  const ipMatch = content.match(/const MASTER_IP\s*=\s*process\.env\.VITE_MASTER_IP\s*\|\|\s*'([^']+)'/);
  const ip = ipMatch ? ipMatch[1] : '192.168.1.133';
  console.log(`🌐 MASTER_IP: ${ip}`);
  
  // Extract MASTER_PORT
  const portMatch = content.match(/const MASTER_PORT\s*=\s*process\.env\.VITE_MASTER_PORT\s*\|\|\s*'(\d+)'/);
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
  
  const tests = [
    { name: 'localhost:3001', url: `http://localhost:${backendPort}` },
    { name: '127.0.0.1:3001', url: `http://127.0.0.1:${backendPort}` },
    { name: '192.168.1.133:3001', url: `http://192.168.1.133:${backendPort}` },
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
  
  const dbPath = path.join(__dirname, 'api-proxy', 'data', 'si.db');
  const walPath = path.join(__dirname, 'api-proxy', 'data', 'si.db-wal');
  const shmPath = path.join(__dirname, 'api-proxy', 'data', 'si.db-shm');
  
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
  
  if (!connectivity['192.168.1.133:3001']?.includes('✅')) {
    issues.push('192.168.1.133:3001 NON ACCESSIBLE - Vérifiez firewall');
  }
  
  if (issues.length === 0) {
    console.log('✅ Configuration semble correcte!');
    console.log('\nSi toujours des problèmes:');
    console.log('1. Redémarrez Backend: ctrl-c puis node api-proxy.js');
    console.log('2. Vérifiez localStorage entre localhost et host');
    console.log('3. Vérifiez WebSocket dans DevTools Network tab');
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
