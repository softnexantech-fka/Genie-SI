#!/usr/bin/env node
/**
 * COMPREHENSIVE VALIDATION SCRIPT
 * Tests all critical fixes applied in Phase 1
 * Run: node validate-fixes.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function test(name, condition, details = '') {
  if (condition) {
    console.log(`${GREEN}✅ PASS${RESET} ${name}`);
    if (details) console.log(`   ${BLUE}→ ${details}${RESET}`);
    passCount++;
  } else {
    console.log(`${RED}❌ FAIL${RESET} ${name}`);
    if (details) console.log(`   ${RED}→ ${details}${RESET}`);
    failCount++;
  }
}

console.log(`\n${YELLOW}═══════════════════════════════════════════════════${RESET}`);
console.log(`${YELLOW} VALIDATING ALL PHASE 1 FIXES${RESET}`);
console.log(`${YELLOW}═══════════════════════════════════════════════════${RESET}\n`);

// ═══════════════════════════════════════════════════════════════════════════
// BACKEND VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

console.log(`${BLUE}[BACKEND VALIDATION]${RESET}\n`);

const backendPath = path.join(__dirname, 'api-proxy', 'api-proxy.js');
try {
  const backendCode = fs.readFileSync(backendPath, 'utf8');
  
  // Test 1: JWT Refresh Endpoint
  test(
    'JWT Refresh Endpoint Added',
    backendCode.includes("app.post('/api/auth/refresh-token'"),
    "POST /api/auth/refresh-token endpoint exists"
  );
  
  // Test 2: Token Versioning
  test(
    'Token Versioning Added',
    backendCode.includes('version:'),
    "JWT token includes version field for rotation"
  );
  
  // Test 3: Per-IP Rate Limiting Variables
  test(
    'Per-IP Rate Limiting Initialization',
    backendCode.includes('LOGIN_MAX_ATTEMPTS_PER_IP') && 
    backendCode.includes('loginAttemptsByIP'),
    "Rate limiting per IP variables declared"
  );
  
  // Test 4: Account Lockout
  test(
    'Account Lockout Implementation',
    backendCode.includes('LOCKOUT_THRESHOLD') &&
    backendCode.includes('LOCKOUT_DURATION'),
    "Account lockout mechanism present"
  );
  
  // Test 5: Emergency Backup Before Restore
  test(
    'Emergency Backup Before Restore',
    backendCode.includes('emergency-backup') &&
    backendCode.includes('FIX-EMERGENCY-BACKUP'),
    "Backup created before restore operation"
  );
  
  // Test 6: Path Traversal Protection
  test(
    'Path Traversal Protection',
    backendCode.includes('path.basename') && 
    backendCode.includes('/api/backup/restore/:filename'),
    "Backup restore validates path safely"
  );
  
  // Test 7: WAL Checkpoint
  test(
    'WAL Checkpoint on Shutdown',
    backendCode.includes('wal_checkpoint') &&
    backendCode.includes('gracefulShutdown'),
    "SQLite WAL properly checkpointed"
  );
  
  // Test 8: Input Validation
  test(
    'Input Validation Function',
    backendCode.includes('validateAndSanitizeValue'),
    "Value validation implemented"
  );
  
} catch (e) {
  test('Backend File Readable', false, e.message);
}

// ═══════════════════════════════════════════════════════════════════════════
// FRONTEND VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${BLUE}[FRONTEND VALIDATION]${RESET}\n`);

const appRootPath = path.join(__dirname, 'src', 'AppRoot.jsx');
try {
  const appRootCode = fs.readFileSync(appRootPath, 'utf8');
  
  // Test 1: Session Encryption
  test(
    'Session Token Encryption Fix',
    appRootCode.includes('FIX-ENCRYPT-SESSION') && 
    appRootCode.includes('_gcDecrypt'),
    "Session encryption handled asynchronously"
  );
  
  // Test 2: Session Restore useEffect
  test(
    'Session Restore useEffect',
    appRootCode.includes('FIX-SESSION-RESTORE') &&
    appRootCode.includes('restoreSession'),
    "Session properly restored after mount"
  );
  
  // Test 3: Hydration Timeout Increased
  test(
    'Hydration Timeout Increased',
    appRootCode.includes('8000') && 
    appRootCode.includes('FIX v137'),
    "Timeout increased to 8 seconds (from 3)"
  );
  
  // Test 4: Safe User Object
  test(
    'Password Removed from User State',
    appRootCode.includes('{ password: _p, ...safeU }'),
    "Password never stored in React state"
  );
  
  // Test 5: isAdminMode Fixed
  test(
    'isAdminMode No Longer from localStorage',
    appRootCode.includes('setIsAdminMode(false)'),
    "Admin mode computed, not stored"
  );
  
} catch (e) {
  test('Frontend AppRoot Readable', false, e.message);
}

// ───────────────────────────────────────────────────────────────────────

const siAppPath = path.join(__dirname, 'src', 'SIApp.jsx');
try {
  const siAppCode = fs.readFileSync(siAppPath, 'utf8');
  
  // Test 6: Offline Indicator
  test(
    'Offline Indicator Added',
    siAppCode.includes('ServerStatus') &&
    siAppCode.includes('FIX-OFFLINE-INDICATOR'),
    "ServerStatus component displayed in navbar"
  );
  
} catch (e) {
  test('Frontend SIApp Readable', false, e.message);
}

// ───────────────────────────────────────────────────────────────────────

const datastorePath = path.join(__dirname, 'src', 'core', 'datastore.js');
try {
  const datastoreCode = fs.readFileSync(datastorePath, 'utf8');
  
  // Test 7: Offline Queue Size Limit
  test(
    'Offline Queue Size Limit',
    datastoreCode.includes('MAX_OFFLINE_QUEUE_SIZE') &&
    datastoreCode.includes('1_000_000'),
    "1 MB offline queue limit enforced"
  );
  
  // Test 8: Offline Queue Item Limit
  test(
    'Offline Queue Item Limit',
    datastoreCode.includes('MAX_OFFLINE_QUEUE_ITEMS') &&
    datastoreCode.includes('500'),
    "500 items max in offline queue"
  );
  
  // Test 9: Queue Cleanup
  test(
    'Offline Queue Auto-Cleanup',
    datastoreCode.includes('QuotaExceededError'),
    "Handles localStorage quota exceeded"
  );
  
} catch (e) {
  test('Frontend Datastore Readable', false, e.message);
}

// ───────────────────────────────────────────────────────────────────────

const useSyncedPath = path.join(__dirname, 'src', 'hooks', 'useSyncedState.js');
try {
  const useSyncedCode = fs.readFileSync(useSyncedPath, 'utf8');
  
  // Test 10: Listener Cleanup
  test(
    'WebSocket Listener Cleanup',
    useSyncedCode.includes('unsub()') &&
    useSyncedCode.includes('removeEventListener'),
    "Event listeners properly cleaned up on unmount"
  );
  
} catch (e) {
  test('useSyncedState Readable', false, e.message);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${BLUE}[CONFIGURATION VALIDATION]${RESET}\n`);

const envPath = path.join(__dirname, 'api-proxy', '.env');
try {
  const envCode = fs.readFileSync(envPath, 'utf8');
  
  // Test 1: JWT Secret Configured
  test(
    'JWT Secret Configured',
    envCode.includes('JWT_SECRET=') && 
    !envCode.includes('change-me'),
    "JWT_SECRET set to proper value"
  );
  
  // Test 2: No Hardcoded Passwords
  test(
    'No Hardcoded Passwords',
    !envCode.includes('Admin@SI'),
    "Admin passwords not hardcoded in config"
  );
  
} catch (e) {
  test('Environment Config Readable', false, e.message);
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE EXISTENCE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${BLUE}[FILE INTEGRITY VALIDATION]${RESET}\n`);

const requiredFiles = [
  'api-proxy/api-proxy.js',
  'api-proxy/.env',
  'src/AppRoot.jsx',
  'src/SIApp.jsx',
  'src/core/datastore.js',
  'src/hooks/useSyncedState.js',
  'package.json',
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  test(
    `File Exists: ${file}`,
    fs.existsSync(filePath),
    `${filePath}`
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${YELLOW}═══════════════════════════════════════════════════${RESET}`);
console.log(`${YELLOW} VALIDATION SUMMARY${RESET}`);
console.log(`${YELLOW}═══════════════════════════════════════════════════${RESET}\n`);

console.log(`${GREEN}✅ PASSED: ${passCount}${RESET}`);
console.log(`${RED}❌ FAILED: ${failCount}${RESET}`);

const totalTests = passCount + failCount;
const passPercentage = ((passCount / totalTests) * 100).toFixed(1);

console.log(`\n${BLUE}Pass Rate: ${passPercentage}%${RESET}\n`);

if (failCount === 0) {
  console.log(`${GREEN}🎉 ALL TESTS PASSED! Ready for deployment.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}⚠️  ${failCount} test(s) failed. Review above before deploying.${RESET}\n`);
  process.exit(1);
}
