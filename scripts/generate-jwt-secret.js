// ============================================================
// generate-jwt-secret.js — Générateur de clé JWT secrète
// Usage: node generate-jwt-secret.js
// ============================================================

import crypto from 'crypto';

const secret = crypto.randomBytes(64).toString('hex');
console.log('🔐 Clé JWT secrète générée:');
console.log('');
console.log(`JWT_SECRET=${secret}`);
console.log('');
console.log('📋 Copiez cette ligne dans votre fichier .env');
console.log('⚠️  Gardez cette clé SECRÈTE et en sécurité !');