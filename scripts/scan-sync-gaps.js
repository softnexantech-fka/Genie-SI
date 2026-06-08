#!/usr/bin/env node
/**
 * DIAGNOSTIC SCRIPT - Détecte tous les setState sans dsSave()
 * Usage: node scan-sync-gaps.js > SYNC_GAPS_REPORT.md
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Scanning patterns
const patterns = [
  { name: 'setUsers', key: 'setUsers' },
  { name: 'setDossiers', key: 'setDossiers' },
  { name: 'setTaches', key: 'setTaches' },
  { name: 'setRdvs', key: 'setRdvs' },
];

const results = {
  fixed: [],
  needsFix: [],
  stats: {}
};

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    patterns.forEach(pattern => {
      const regex = new RegExp(`${pattern.name}\\s*\\(\\s*(?:prev\\s*=>|\\w+\\s*=>)`, 'g');
      let match;
      let lineNum = 1;
      
      lines.forEach((line, idx) => {
        if (regex.test(line)) {
          // Check if dsSave is on same or next line
          const nextLine = lines[idx + 1] || '';
          const hasDsSave = line.includes('dsSave') || nextLine.includes('dsSave');
          
          if (!hasDsSave && !line.includes('setNotifications')) {
            results.needsFix.push({
              file: filePath.replace(__dirname, ''),
              line: idx + 1,
              pattern: pattern.name,
              code: line.trim().slice(0, 80)
            });
          } else if (hasDsSave) {
            results.fixed.push({
              file: filePath.replace(__dirname, ''),
              line: idx + 1,
              pattern: pattern.name
            });
          }
        }
        lineNum++;
      });
    });
  } catch (err) {
    // Ignore read errors
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && file !== 'node_modules') {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.jsx')) {
      scanFile(fullPath);
    }
  });
}

// Run scan
console.log('# 🔍 DIAGNOSTIC: État de la Synchronisation Frontend\n');
console.log('Scanning all .jsx files...\n');

walkDir(srcDir);

// Generate report
console.log('## 📊 Résumé\n');
console.log(`- ✅ **Locations FIXÉES** (avec dsSave): ${results.fixed.length}`);
console.log(`- 🔴 **À FIXER** (sans dsSave): ${results.needsFix.length}\n`);

console.log('---\n');

console.log('## ✅ Déjà Fixé\n');
results.fixed.slice(0, 10).forEach(r => {
  console.log(`- [${r.file}](${r.file}#L${r.line}): ${r.pattern}`);
});
if (results.fixed.length > 10) {
  console.log(`- ... et ${results.fixed.length - 10} autres ✅\n`);
}

console.log('---\n');

console.log('## 🔴 À Fixer\n');

// Group by file
const byFile = {};
results.needsFix.forEach(r => {
  if (!byFile[r.file]) byFile[r.file] = [];
  byFile[r.file].push(r);
});

Object.keys(byFile).sort().forEach(file => {
  const items = byFile[file];
  console.log(`### [${file}](${file})\n`);
  items.forEach(r => {
    console.log(`- **Line ${r.line}** - \`${r.pattern}\`: \n  \`\`\`\n  ${r.code}\n  \`\`\`\n`);
  });
});

console.log('\n---\n');
console.log(`## 📈 Stats par Module\n`);

const byModule = {};
results.needsFix.forEach(r => {
  const mod = r.file.split('/')[2] || 'core';
  byModule[mod] = (byModule[mod] || 0) + 1;
});

Object.keys(byModule).sort((a, b) => byModule[b] - byModule[a]).forEach(mod => {
  console.log(`- **${mod}**: ${byModule[mod]} à fixer`);
});
