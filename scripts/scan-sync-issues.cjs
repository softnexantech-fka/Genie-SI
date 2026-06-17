#!/usr/bin/env node

/**
 * SYNC SCANNER
 * Finds all state updates that are NOT persisted to backend
 * 
 * Usage:
 * node scan-sync-issues.js
 */

const fs = require('fs');
const path = require('path');

const SHARED_KEYS = [
  'users', 'dossiers', 'taches', 'messages', 'rdvs', 'partners',
  'pendingApprovals', 'notifications', 'finances', 'projects',
  'documents', 'conformite', 'communications'
];

const STATE_SETTERS = [
  'setUsers', 'setDossiers', 'setTaches', 'setMessages', 'setRdvs', 'setPartners',
  'setPendingApprovals', 'setNotifications', 'setFinances', 'setProjects',
  'setDocuments', 'setConformite', 'setCommunications'
];

let issues = [];

// ============================================================================
// SCAN FILES
// ============================================================================

function scanFiles(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, dist, etc
      if (!['.', '..', 'node_modules', 'dist', '__pycache__'].includes(file)) {
        scanFiles(filePath);
      }
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      scanFile(filePath);
    }
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Check for state setters without dsSave
    for (const setter of STATE_SETTERS) {
      if (line.includes(setter + '(') || line.includes(setter + ' (')) {
        
        // Look ahead to see if dsSave is called within next 5 lines
        let hasFollowingDsSave = false;
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          if (lines[j].includes('dsSave') || lines[j].includes('dsSync')) {
            hasFollowingDsSave = true;
            break;
          }
        }
        
        if (!hasFollowingDsSave) {
          // Extract key name from setter (setUsers → users)
          const keyName = setter.replace(/^set/, '').toLowerCase();
          
          // Only report if it matches a SHARED_KEY
          if (SHARED_KEYS.some(k => keyName.includes(k.slice(0, 3)))) {
            issues.push({
              file: filePath.replace(process.cwd(), '.'),
              line: lineNum,
              setter: setter,
              code: line.trim().slice(0, 80),
              severity: 'HIGH'
            });
          }
        }
      }
    }
    
    // Check for direct state mutations (dangerous!)
    if (line.includes('users[') && line.includes('=') && !line.includes('const') && !line.includes('let')) {
      issues.push({
        file: filePath.replace(process.cwd(), '.'),
        line: lineNum,
        setter: 'DIRECT MUTATION',
        code: line.trim().slice(0, 80),
        severity: 'CRITICAL'
      });
    }
  }
}

// ============================================================================
// REPORT
// ============================================================================

function printReport() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  🔍 SYNC ISSUES FOUND: ' + issues.length);
  console.log('════════════════════════════════════════════════════════════\n');
  
  if (issues.length === 0) {
    console.log('✅ No obvious sync issues found!\n');
    return;
  }
  
  // Group by severity
  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const high = issues.filter(i => i.severity === 'HIGH');
  
  if (critical.length > 0) {
    console.log(`🔴 CRITICAL (${critical.length}):\n`);
    critical.forEach((issue, idx) => {
      console.log(`${idx+1}. ${issue.file}:${issue.line}`);
      console.log(`   ${issue.setter}`);
      console.log(`   ${issue.code}...`);
      console.log();
    });
  }
  
  if (high.length > 0) {
    console.log(`🟠 HIGH (${high.length}):\n`);
    high.slice(0, 10).forEach((issue, idx) => {
      console.log(`${idx+1}. ${issue.file}:${issue.line}`);
      console.log(`   ${issue.setter}`);
      console.log(`   ${issue.code}...`);
      console.log();
    });
    
    if (high.length > 10) {
      console.log(`... and ${high.length - 10} more\n`);
    }
  }
  
  // Summary
  console.log('════════════════════════════════════════════════════════════');
  console.log(`📊 SUMMARY:`);
  console.log(`   CRITICAL: ${critical.length}`);
  console.log(`   HIGH: ${high.length}`);
  console.log(`   TOTAL: ${issues.length}`);
  console.log('\n💡 SOLUTION: Add dsSave(key, updatedState) after each setter');
  console.log('════════════════════════════════════════════════════════════\n');
  
  // Save to file
  const reportPath = path.join(process.cwd(), 'evaluate', 'SYNC_AUDIT_REPORT.md');
  const report = `# 🔍 Sync Issues Audit Report

**Date**: ${new Date().toISOString()}  
**Total Issues**: ${issues.length}  
**Critical**: ${critical.length}  
**High**: ${high.length}

## CRITICAL ISSUES (Direct mutations - immediate fix required)

${critical.map((i, idx) => `\n### ${idx+1}. ${i.file}:${i.line}\n\`\`\`\n${i.code}\n\`\`\``).join('\n')}

## HIGH PRIORITY ISSUES (State updates without dsSave)

${high.map((i, idx) => `\n### ${idx+1}. ${i.file}:${i.line}\n\n**Line**: \`${i.setter}\`\n\`\`\`\n${i.code}\n\`\`\`\n\n**Fix**: Add \`dsSave\` call after state update`).join('\n')}

## ACTION ITEMS

- [ ] Fix all ${critical.length} CRITICAL issues
- [ ] Add dsSave() to all ${high.length} HIGH issues
- [ ] Re-run scanner to verify
- [ ] Test synchronization

`.trim();
  
  fs.writeFileSync(reportPath, report);
  console.log(`👉 Full report saved: ${reportPath}\n`);
}

// ============================================================================
// MAIN
// ============================================================================

console.log('\n🔍 Scanning for state sync issues...\n');

const srcPath = path.join(process.cwd(), 'src');
if (fs.existsSync(srcPath)) {
  scanFiles(srcPath);
} else {
  console.log('❌ src/ directory not found');
  process.exit(1);
}

printReport();
