#!/usr/bin/env node
/**
 * sync-users-to-localstorage.js
 * 
 * Utilitaire de synchronisation : lit les utilisateurs depuis la base SQLite
 * et écrit un fichier HTML avec un script d'injection pour forcer le localStorage
 * client à se synchroniser.
 * 
 * Utilisation : 
 *   1. Exécuter ce script : node sync-users-to-localstorage.js
 *   2. Ouvrir le fichier HTML généré dans un navigateur
 *   3. Cliquer sur "Synchroniser maintenant"
 *   4. La page recharge avec les données serveur dans le localStorage
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'api-proxy', 'data', 'si_genie.db');

console.log('📊 DIAGNOSTIC SYNC UTILISATEURS');
console.log('═'.repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Lire les données depuis la DB
  const usersRow = db.prepare('SELECT json FROM si_data WHERE key = ?').get('users');
  const gcUsersRow = db.prepare('SELECT json FROM si_data WHERE key = ?').get('gc-users');
  
  let users = [];
  let gcUsers = [];
  
  if (usersRow) {
    try {
      users = JSON.parse(usersRow.json);
      console.log(`✅ Clé "users" en DB: ${Array.isArray(users) ? users.length : 0} comptes`);
    } catch (e) {
      console.log('❌ Erreur parsing "users"');
    }
  } else {
    console.log('❌ Clé "users" absente de la DB');
  }
  
  if (gcUsersRow) {
    try {
      gcUsers = JSON.parse(gcUsersRow.json);
      console.log(`✅ Clé "gc-users" en DB: ${Array.isArray(gcUsers) ? gcUsers.length : 0} comptes`);
    } catch (e) {
      console.log('❌ Erreur parsing "gc-users"');
    }
  } else {
    console.log('❌ Clé "gc-users" absente de la DB');
  }
  
  db.close();
  
  // Sélectionner la source valide
  const source = Array.isArray(users) && users.length > 0 ? users : 
                 Array.isArray(gcUsers) && gcUsers.length > 0 ? gcUsers : [];
  
  if (source.length === 0) {
    console.log('\n❌ Aucun compte trouvé dans la DB !');
    process.exit(1);
  }
  
  // Générer une page HTML d'injection
  const sourceJson = JSON.stringify(source);
  const usersList = source.map(u => 
    `        <div class="user-item">
          <span class="user-id">${u.id}</span>
          <span class="user-name">${u.name}</span>
          <span class="user-level">L${u.level || 1}</span>
        </div>`
  ).join('\n');

  const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Synchronisation Utilisateurs - SI Génie Consultant</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #0A1E4A 0%, #162540 50%, #050D1A 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #E8EDF5;
      padding: 20px;
    }
    .container {
      background: #0F2847;
      border: 1px solid #C41E3A44;
      border-radius: 20px;
      padding: 40px;
      max-width: 600px;
      box-shadow: 0 32px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(196,30,58,0.12);
    }
    h1 {
      color: #C41E3A;
      margin-bottom: 20px;
      font-size: 24px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .status {
      background: #16293922;
      border-left: 4px solid #C41E3A;
      padding: 15px;
      margin-bottom: 20px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.6;
    }
    .status-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .status-item:last-child { margin-bottom: 0; }
    .status-label { color: #A0B0C8; }
    .status-value { font-weight: 700; color: #22C55E; font-family: monospace; }
    .users-list {
      background: #162540;
      border: 1px solid #3B82F644;
      border-radius: 12px;
      max-height: 300px;
      overflow-y: auto;
      margin-bottom: 20px;
    }
    .user-item {
      padding: 10px 15px;
      border-bottom: 1px solid #3B82F622;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .user-item:last-child { border-bottom: none; }
    .user-id { color: #F59E0B; font-weight: 600; font-family: monospace; }
    .user-name { color: #A0B0C8; margin-left: 10px; flex: 1; }
    .user-level { color: #3B82F6; background: #3B82F611; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .button-group {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    button {
      flex: 1;
      padding: 12px 20px;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      letter-spacing: 0.5px;
    }
    .btn-primary {
      background: #C41E3A;
      color: white;
    }
    .btn-primary:hover {
      background: #A01A2E;
      box-shadow: 0 8px 24px rgba(196,30,58,0.4);
    }
    .btn-secondary {
      background: #3B82F6;
      color: white;
    }
    .btn-secondary:hover {
      background: #2563EB;
    }
    .info-box {
      background: #EF444415;
      border-left: 4px solid #EF4444;
      padding: 15px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 20px;
      display: none;
    }
    .info-box.show { display: block; }
    .info-box.success {
      background: #22C55E15;
      border-left-color: #22C55E;
    }
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #C41E3A44;
      border-top-color: #C41E3A;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: 8px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔄 Synchronisation Utilisateurs</h1>
    
    <div class="status">
      <div class="status-item">
        <span class="status-label">📊 Comptes en DB:</span>
        <span class="status-value">${source.length}</span>
      </div>
      <div class="status-item">
        <span class="status-label">💾 Base de données:</span>
        <span class="status-value">si_genie.db</span>
      </div>
      <div class="status-item">
        <span class="status-label">⚠️ État LocalStorage:</span>
        <span class="status-value" id="localStorageStatus">Non synchronisé</span>
      </div>
    </div>

    <h2 style="font-size: 16px; margin-bottom: 10px; color: #A0B0C8;">📋 Comptes à synchroniser:</h2>
    <div class="users-list">
${usersList}
    </div>

    <div class="button-group">
      <button class="btn-primary" onclick="syncNow()">
        <span id="btnText">🚀 Synchroniser maintenant</span>
      </button>
      <button class="btn-secondary" onclick="checkStatus()">
        🔍 Vérifier status
      </button>
    </div>

    <div id="infoBox" class="info-box">
      <p id="infoText"></p>
    </div>
  </div>

  <script>
    const DATA = ${sourceJson};

    function showInfo(msg, isSuccess = false) {
      const box = document.getElementById('infoBox');
      const text = document.getElementById('infoText');
      text.textContent = msg;
      box.classList.toggle('success', isSuccess);
      box.classList.add('show');
    }

    function checkStatus() {
      try {
        const stored = localStorage.getItem('GC_SI_v12:users') || localStorage.getItem('users');
        if (!stored) {
          showInfo('❌ Aucune donnée utilisateur dans localStorage');
          return;
        }
        const parsed = JSON.parse(stored);
        const count = Array.isArray(parsed) ? parsed.length : 0;
        showInfo('✅ localStorage contient ' + count + ' comptes', true);
      } catch (e) {
        showInfo('❌ Erreur lecture localStorage: ' + e.message);
      }
    }

    async function syncNow() {
      const btn = document.querySelector('.btn-primary');
      const btnText = document.getElementById('btnText');
      const original = btnText.textContent;
      
      try {
        btn.disabled = true;
        btnText.innerHTML = '<span class="spinner"></span>Synchronisation...';

        // Écrire dans localStorage
        localStorage.setItem('GC_SI_v12:users', JSON.stringify(DATA));
        localStorage.setItem('users', JSON.stringify(DATA));
        
        // Pour les tests
        console.log('✅ Données écrites dans localStorage');
        console.log('   GC_SI_v12:users: ' + DATA.length + ' comptes');
        console.log('   users: ' + DATA.length + ' comptes');

        // Afficher status
        showInfo('✅ ' + DATA.length + ' comptes synchronisés dans localStorage !\\n\\n💡 Rechargez la page ou fermez/rouvrez le navigateur pour appliquer.', true);
        
        setTimeout(() => {
          btnText.textContent = original;
          btn.disabled = false;
        }, 2000);

      } catch (e) {
        showInfo('❌ Erreur synchronisation: ' + e.message);
        btnText.textContent = original;
        btn.disabled = false;
      }
    }

    // Vérifier le status au chargement
    setTimeout(() => {
      try {
        const stored = localStorage.getItem('GC_SI_v12:users') || localStorage.getItem('users');
        if (stored) {
          const parsed = JSON.parse(stored);
          document.getElementById('localStorageStatus').textContent = (Array.isArray(parsed) ? parsed.length : 0) + ' comptes synchronisés';
        }
      } catch (_) {}
    }, 100);
  </script>
</body>
</html>`;

  // Sauvegarder le fichier HTML
  const htmlPath = path.join(__dirname, '..', 'sync-users-client.html');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');
  
  console.log('\n✅ Page de synchronisation générée :');
  console.log(`   📄 ${htmlPath}`);
  console.log('\n🚀 Instructions:');
  console.log('   1. Ouvrir le fichier HTML dans un navigateur');
  console.log('   2. Cliquer sur "🚀 Synchroniser maintenant"');
  console.log('   3. Recharger la page du SI (Ctrl+F5)');
  console.log('   4. Connexion avec les comptes synchronisés\n');
  
} catch (e) {
  console.error('❌ Erreur:', e.message);
  process.exit(1);
}
