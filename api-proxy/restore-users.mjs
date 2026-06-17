import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'si_genie.db');

console.log('\n' + '═'.repeat(70));
console.log('🔐 RESTAURATION COMPTES UTILISATEURS & HASH PASSWORDS');
console.log('═'.repeat(70) + '\n');

// Les comptes par défaut
const DEFAULT_USERS = [
  {
    id: "USR-ADM-000", name: "Superviseur SI", alias: "admin.si", role: "Direction SI",
    dept: "Système d'Information", process: "ALL", level: 6, avatar: "AD", color: "#C41E3A",
    isAdmin: true, password: "Admin@SI#2026!",
    sexe: "N/A", nationalite: "N/A", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "admin@genie-consultant.com", adresse: "Siège Social",
    bio: "Compte d'administration système du SI Génie Consultant.",
    photoUrl: null,
  },
  {
    id: "USR-DG-001", name: "Directeur Général", alias: "dg.genie", role: "Directeur Général",
    dept: "Direction Générale", process: "P01", level: 5, avatar: "DG", color: "#C9A84C",
    isMG: true, password: "DG@GenieSI#2026!",
    sexe: "N/A", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 001", email: "dg@genie-consultant.com", adresse: "Direction Générale",
    bio: "Compte Directeur Général par défaut.",
    photoUrl: null, isActive: true, accountStatus: "ACTIF",
    isFirstLogin: true,
  },
];

// Fonction de hash (même que le code gcHashPassword)
function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

try {
  const db = new Database(dbPath);

  console.log('🔐 Hachage des passwords...\n');

  // Ajouter passwordHash et supprimer password en clair
  const usersForDb = DEFAULT_USERS.map(u => ({
    ...u,
    passwordHash: hashPassword(u.password),
    // password en clair n'est PAS stocké en base
  }));

  // Supprimer le password en clair
  const usersToStore = usersForDb.map(u => {
    const { password: _p, ...rest } = u;
    return rest;
  });

  console.log('Comptes à restaurer:');
  usersToStore.forEach(u => {
    console.log(`  ✅ ${u.id} - ${u.name}`);
    console.log(`     Email: ${u.email}`);
    console.log(`     PasswordHash: ${u.passwordHash.substring(0, 16)}...`);
  });

  console.log('\n');

  // Insérer les comptes
  db.prepare("DELETE FROM si_data WHERE key = ?").run('users');
  db.prepare('INSERT INTO si_data (key, json) VALUES (?, ?)').run(
    'users',
    JSON.stringify(usersToStore)
  );

  console.log('✅ Comptes restaurés dans si_data\n');

  // Aussi ajouter dans gc-users (pour compatibilité)
  db.prepare("DELETE FROM si_data WHERE key = ?").run('gc-users');
  db.prepare('INSERT INTO si_data (key, json) VALUES (?, ?)').run(
    'gc-users',
    JSON.stringify(usersToStore)
  );

  console.log('✅ Comptes aussi dans gc-users\n');

  // Vérifier
  console.log('═'.repeat(70));
  console.log('✅ VÉRIFICATION');
  console.log('═'.repeat(70) + '\n');

  const userRows = db.prepare('SELECT json FROM si_data WHERE key = ?').get('users');
  const gcUserRows = db.prepare('SELECT json FROM si_data WHERE key = ?').get('gc-users');

  if (userRows) {
    const users = JSON.parse(userRows.json);
    console.log(`✅ "users" key: ${users.length} comptes`);
    users.forEach(u => console.log(`   • ${u.id}: ${u.name}`));
  }

  if (gcUserRows) {
    console.log(`✅ "gc-users" key: ${JSON.parse(gcUserRows.json).length} comptes`);
  }

  db.close();

  console.log('\n' + '═'.repeat(70));
  console.log('✅ RESTAURATION COMPLÈTE!');
  console.log('═'.repeat(70));

  console.log(`
📝 RÉSUMÉ:
  ✅ 2 comptes restaurés dans la base
  ✅ Passwords hashés (jamais en clair)
  ✅ Prêts pour le login

🔑 Credentials à utiliser:
  1. Email: admin@genie-consultant.com / Password: Admin@SI#2026!
  2. Email: dg@genie-consultant.com / Password: DG@GenieSI#2026!

💾 LocalStorage: Sera rempli au premier login
  `);

  process.exit(0);

} catch (err) {
  console.error('❌ ERREUR:', err.message);
  process.exit(1);
}
