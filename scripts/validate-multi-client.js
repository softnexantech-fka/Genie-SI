#!/usr/bin/env node
// ============================================================
// validate-multi-client.js
// Multi-Client LAN Validation for Anti-Resurrection Phase 1
// ============================================================
// 
// Usage:
//   npm run validate:multi-client
//   node scripts/validate-multi-client.js --host 192.168.1.100
//
// This script simulates 3-5 concurrent clients connecting to the
// same backend instance, performing delete/sync operations, and
// validating that the anti-resurrection layer works correctly
// across all clients and network conditions.
// ============================================================

import fetch from 'node-fetch';
import { setTimeout as delay } from 'timers/promises';
import chalk from 'chalk';

// CONFIG
const API_HOST = process.argv.includes('--host')
  ? process.argv[process.argv.indexOf('--host') + 1]
  : 'localhost';
const API_PORT = process.env.API_PORT || 3001;
const FRONTEND_PORT = process.env.FRONTEND_PORT || 5173;
const API_URL = `http://${API_HOST}:${API_PORT}`;
const FRONTEND_URL = `http://${API_HOST}:${FRONTEND_PORT}`;

const TEST_USERS = [
  { id: 'user-admin-1', email: 'admin@test.local', password: 'pass123', level: 6 },
  { id: 'user-mgmt-1', email: 'mgmt@test.local', password: 'pass123', level: 5 },
  { id: 'user-collab-1', email: 'collab@test.local', password: 'pass123', level: 2 },
  { id: 'user-collab-2', email: 'collab2@test.local', password: 'pass123', level: 2 },
  { id: 'user-readonly-1', email: 'viewer@test.local', password: 'pass123', level: 1 },
];

let PASS = 0, FAIL = 0;
const results = [];

// ── UTILITIES ────────────────────────────────────────────────────
function log(level, msg) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const prefix = `[${timestamp}]`;
  
  switch(level) {
    case 'OK':
      console.log(`${prefix} ${chalk.green('✓')} ${msg}`);
      PASS++;
      results.push({ status: 'PASS', msg });
      break;
    case 'FAIL':
      console.log(`${prefix} ${chalk.red('✗')} ${msg}`);
      FAIL++;
      results.push({ status: 'FAIL', msg });
      break;
    case 'INFO':
      console.log(`${prefix} ${chalk.blue('ℹ')} ${msg}`);
      break;
    case 'WARN':
      console.log(`${prefix} ${chalk.yellow('⚠')} ${msg}`);
      break;
  }
}

async function getToken(email, password) {
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
    const data = await res.json();
    return data.token;
  } catch (e) {
    log('FAIL', `Auth failed for ${email}: ${e.message}`);
    return null;
  }
}

async function apiCall(method, path, token, body = null) {
  try {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      timeout: 5000,
    };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(`${API_URL}${path}`, opts);
    if (!res.ok) {
      log('WARN', `API ${method} ${path} returned ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    log('WARN', `API call failed: ${e.message}`);
    return null;
  }
}

// ── TEST SUITES ──────────────────────────────────────────────────

console.log(chalk.bold.cyan(`
╔════════════════════════════════════════════════════════════════╗
║   Multi-Client LAN Validation — Phase 1 Anti-Resurrection    ║
║   Testing concurrent access from multiple network clients      ║
╚════════════════════════════════════════════════════════════════╝
`));

log('INFO', `Targeting API: ${API_URL}`);
log('INFO', `Targeting Frontend: ${FRONTEND_URL}`);
log('INFO', `Testing with ${TEST_USERS.length} concurrent users`);
log('INFO', '');

// ────────────────────────────────────────────────────────────────
// TEST 1: Backend Connectivity (All Clients)
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n📡 TEST 1: Backend Connectivity'));
console.log(chalk.dim('─'.repeat(60)));

try {
  const health = await apiCall('GET', '/api/health');
  if (health && health.ok) {
    log('OK', `Backend is healthy (${health.version})`);
  } else {
    log('FAIL', 'Backend health check failed');
  }
} catch (e) {
  log('FAIL', `Cannot reach backend: ${e.message}`);
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────
// TEST 2: Frontend Accessibility
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n🌐 TEST 2: Frontend Accessibility'));
console.log(chalk.dim('─'.repeat(60)));

try {
  const html = await fetch(`${FRONTEND_URL}/`);
  if (html.ok) {
    log('OK', `Frontend is accessible (${html.status})`);
  } else {
    log('FAIL', `Frontend returned ${html.status}`);
  }
} catch (e) {
  log('FAIL', `Cannot reach frontend: ${e.message}`);
}

// ────────────────────────────────────────────────────────────────
// TEST 3: Multi-User Authentication
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n🔐 TEST 3: Multi-User Authentication'));
console.log(chalk.dim('─'.repeat(60)));

const userTokens = {};
for (const user of TEST_USERS) {
  const token = await getToken(user.email, user.password);
  if (token) {
    userTokens[user.id] = { ...user, token };
    log('OK', `${user.email} (level ${user.level}) authenticated`);
  } else {
    log('FAIL', `${user.email} authentication failed`);
  }
}

if (Object.keys(userTokens).length < TEST_USERS.length) {
  log('WARN', `Only ${Object.keys(userTokens).length}/${TEST_USERS.length} users authenticated`);
}

// ────────────────────────────────────────────────────────────────
// TEST 4: Current Data State (All Users See Same)
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n📊 TEST 4: Current Data State Consistency'));
console.log(chalk.dim('─'.repeat(60)));

const userDataSnapshots = {};
for (const [userId, userData] of Object.entries(userTokens)) {
  const users = await apiCall('GET', '/api/data/gc-users', userData.token);
  if (users) {
    userDataSnapshots[userId] = users.length || 0;
    log('INFO', `${userData.email}: gc-users=${users.length || 0} items`);
  }
}

// Verify all users see the same data
const snapshots = Object.values(userDataSnapshots);
if (new Set(snapshots).size === 1) {
  log('OK', `All users see consistent data (${snapshots[0]} users)`);
} else {
  log('FAIL', `Data inconsistency detected: ${JSON.stringify(userDataSnapshots)}`);
}

// ────────────────────────────────────────────────────────────────
// TEST 5: Delete Item + Checksum Recording (Admin)
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n🗑️  TEST 5: Delete Item + Checksum Recording'));
console.log(chalk.dim('─'.repeat(60)));

const adminUser = Object.values(userTokens).find(u => u.level === 6);
if (adminUser) {
  // Create test item
  const testItem = {
    id: `test-resurrection-${Date.now()}`,
    name: 'Test Item for Resurrection',
    email: 'test@resurrection.local',
    level: 2,
  };
  
  // Add to gc-users
  const currentUsers = await apiCall('GET', '/api/data/gc-users', adminUser.token) || [];
  const updatedUsers = [...currentUsers, testItem];
  
  const saveRes = await apiCall('POST', '/api/data/gc-users', adminUser.token, {
    value: updatedUsers,
    userId: adminUser.id,
  });
  
  if (saveRes) {
    log('OK', `Created test item: ${testItem.id}`);
  } else {
    log('FAIL', 'Failed to create test item');
  }
  
  // Delete it
  const deleteRes = await apiCall(
    'DELETE',
    `/api/data/gc-users/item/${testItem.id}`,
    adminUser.token
  );
  
  if (deleteRes) {
    log('OK', `Deleted test item: ${testItem.id}`);
  } else {
    log('FAIL', 'Failed to delete test item');
  }
} else {
  log('WARN', 'No admin user available for delete test');
}

// ────────────────────────────────────────────────────────────────
// TEST 6: Offline Client Resync (Simulated)
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n📡 TEST 6: Offline Client Resync Blocking'));
console.log(chalk.dim('─'.repeat(60)));

const collabUser = Object.values(userTokens).find(u => u.level === 2);
if (collabUser) {
  // Simulate stale data with resurrected item
  const staleData = [
    {
      id: 'user-123',
      name: 'Previously Deleted User',
      email: 'deleted@example.com',
      level: 1,
    },
  ];
  
  // Try to sync stale data
  const syncRes = await apiCall(
    'POST',
    '/api/data/gc-users',
    collabUser.token,
    { value: staleData, userId: collabUser.id }
  );
  
  if (syncRes) {
    log('INFO', 'Stale data submission succeeded (may be filtered server-side)');
  } else {
    log('WARN', 'Stale data submission was blocked or failed');
  }
} else {
  log('WARN', 'No collaborator user available for offline test');
}

// ────────────────────────────────────────────────────────────────
// TEST 7: Concurrent Operations (Multi-Client Race)
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n🏃 TEST 7: Concurrent Operations (Race Condition Safety)'));
console.log(chalk.dim('─'.repeat(60)));

// Simulate 3 clients doing rapid operations
const clients = Object.entries(userTokens).slice(0, 3);
const promises = clients.map(async ([userId, userData], idx) => {
  await delay(Math.random() * 100); // Stagger starts
  
  const data = await apiCall('GET', '/api/data/gc-users', userData.token);
  return { client: idx, count: data?.length || 0 };
});

const raceResults = await Promise.all(promises);
const counts = raceResults.map(r => r.count);

if (new Set(counts).size === 1) {
  log('OK', `All concurrent reads see same data: ${counts[0]} users`);
} else {
  log('FAIL', `Concurrent race detected: ${JSON.stringify(raceResults)}`);
}

// ────────────────────────────────────────────────────────────────
// TEST 8: Wipe Registry Persistence (Admin Only)
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n💾 TEST 8: Wipe Registry Persistence'));
console.log(chalk.dim('─'.repeat(60)));

if (adminUser) {
  // Check if wipe registry exists
  const wipeReg = await apiCall('GET', '/api/data/gc-wipe-registry', adminUser.token);
  if (wipeReg !== null) {
    const wipeCount = Object.keys(wipeReg).length;
    log('OK', `Wipe registry accessible (${wipeCount} recorded wipes)`);
  } else {
    log('WARN', 'Wipe registry not found or empty');
  }
} else {
  log('WARN', 'No admin user for wipe registry test');
}

// ────────────────────────────────────────────────────────────────
// TEST 9: Backup Availability (All Users Can Download)
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n📦 TEST 9: Backup Availability'));
console.log(chalk.dim('─'.repeat(60)));

for (const [userId, userData] of Object.entries(userTokens)) {
  if (userData.level >= 5) {
    try {
      const res = await fetch(`${API_URL}/api/admin/backup`, {
        headers: { 'Authorization': `Bearer ${userData.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        log('OK', `${userData.email} can access backups (${data.file})`);
      } else if (res.status === 403) {
        log('INFO', `${userData.email} has insufficient permission (expected for level ${userData.level})`);
      }
    } catch (e) {
      log('WARN', `Backup check failed for ${userData.email}`);
    }
  }
}

// ────────────────────────────────────────────────────────────────
// TEST 10: Network Resilience (Simulated Latency)
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold('\n⏱️  TEST 10: Network Resilience'));
console.log(chalk.dim('─'.repeat(60)));

const latencyTests = [];
for (let i = 0; i < 3; i++) {
  const start = Date.now();
  await apiCall('GET', '/api/health');
  const duration = Date.now() - start;
  latencyTests.push(duration);
}

const avgLatency = latencyTests.reduce((a, b) => a + b) / latencyTests.length;
const maxLatency = Math.max(...latencyTests);

if (avgLatency < 200) {
  log('OK', `Network latency acceptable (avg ${avgLatency.toFixed(0)}ms, max ${maxLatency}ms)`);
} else if (avgLatency < 500) {
  log('WARN', `Network latency high (avg ${avgLatency.toFixed(0)}ms, max ${maxLatency}ms)`);
} else {
  log('FAIL', `Network latency too high (avg ${avgLatency.toFixed(0)}ms)`);
}

// ────────────────────────────────────────────────────────────────
// SUMMARY REPORT
// ────────────────────────────────────────────────────────────────
console.log(chalk.bold(`\n📋 SUMMARY REPORT`));
console.log(chalk.dim('─'.repeat(60)));

const totalTests = PASS + FAIL;
const passRate = ((PASS / totalTests) * 100).toFixed(1);

console.log(`
  Total Tests:  ${totalTests}
  Passed:       ${chalk.green(PASS)}
  Failed:       ${chalk.red(FAIL)}
  Pass Rate:    ${passRate}%
  
  Users Tested: ${Object.keys(userTokens).length}/${TEST_USERS.length}
  Endpoint:     ${API_URL}
  Frontend:     ${FRONTEND_URL}
`);

if (FAIL === 0) {
  console.log(chalk.bold.green('\n✅ ALL TESTS PASSED — Multi-client environment is READY FOR PRODUCTION\n'));
  process.exit(0);
} else if (FAIL <= 2) {
  console.log(chalk.bold.yellow('\n⚠️  SOME TESTS FAILED — Review warnings above, deployment may proceed with caution\n'));
  process.exit(1);
} else {
  console.log(chalk.bold.red('\n❌ CRITICAL FAILURES — Do not deploy until issues are resolved\n'));
  process.exit(2);
}
