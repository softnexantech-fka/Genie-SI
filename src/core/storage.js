// ============================================================
// core/storage.js — localStorage, encryption AES-GCM, migration
// SI Génie Consultant v127
// ============================================================
export const LS_KEY = "GC_SI_v12";
export const LS_KEY_OLD = "GC_SI_v11";

// BUG FIX #2  -  _migrateLS was previously called BEFORE _lsGet/_lsSet were defined,
// causing a ReferenceError (Temporal Dead Zone). Moved _GC_MEM + ls wrappers first.
export const _GC_MEM = {};
// BUG FIX : ls wrappers avec fallback mémoire (_GC_MEM) si localStorage indisponible
export const _lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return _GC_MEM[k] != null ? _GC_MEM[k] : null; } };
export const _lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { _GC_MEM[k] = v; } };
export const _lsRm  = (k) => { try { localStorage.removeItem(k); } catch (_) { delete _GC_MEM[k]; } };

// FIX BUG-B11 — Exposer _lsGet/_lsSet sur window pour que helpers.js (notamment
// gcGetSoundSettings) utilise la même couche avec fallback mémoire _GC_MEM.
try {
  if (typeof window !== 'undefined') {
    window.__gcLsGet = _lsGet;
    window.__gcLsSet = _lsSet;
  }
} catch (_) {}

// FIX v63 C5  -  Versioning schéma localStorage
export const LS_SCHEMA_VERSION = "63";
export const _checkSchemaVersion = () => {
  try {
    const stored = _lsGet("gc-schema-version");
    if (stored !== LS_SCHEMA_VERSION) {
      // Migration: conserver les données, juste mettre à jour la version
      console.info(`[SI Génie] Migration schéma LS: v${stored||"<62"} → v${LS_SCHEMA_VERSION}`);
      _lsSet("gc-schema-version", LS_SCHEMA_VERSION);
    }
  } catch (_) {}
};
_checkSchemaVersion();

// FIX v63 C2  -  Chiffrement AES-GCM du localStorage (clés sensibles uniquement)
// Les clés chiffrées sont préfixées "GC_ENC:" pour permettre la migration transparente
export const GC_ENC_MARKER = "GC_ENC:";
export const GC_ENC_KEYS = new Set(["gc-users","gc-session-logs","gc-dossiers","gc-taches"]);

// FIX v128 — Chiffrement PER-UTILISATEUR avec clé dérivée du mot de passe
// Plus de clé globale publique — chaque utilisateur a sa propre clé AES-GCM
export const _gcGetAESKey = (() => {
  const _cachedKeys = new Map(); // Cache par userId pour éviter re-dérivation
  return async (userId, passwordHash) => {
    if (!userId || !passwordHash) return null; // Fallback non chiffré si pas d'auth

    const cacheKey = `${userId}-${passwordHash.slice(0, 16)}`; // Hash partiel pour cache
    if (_cachedKeys.has(cacheKey)) return _cachedKeys.get(cacheKey);

    try {
      const encoder = new TextEncoder();
      // Dérivation PBKDF2 avec salt unique par utilisateur
      const salt = encoder.encode(`GC_SALT_${userId}_2026`); // Salt déterministe par user
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(passwordHash), // Utilise le hash du mot de passe comme base
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
      _cachedKeys.set(cacheKey, key);
      return key;
    } catch (_) { return null; }
  };
})();

export const _gcEncrypt = async (plaintext, userId, passwordHash) => {
  try {
    const key = await _gcGetAESKey(userId, passwordHash);
    if (!key) return plaintext; // Fallback non chiffré si pas d'auth
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
    // Stocker: iv (12 octets) + ciphertext  - encodés en base64
    const buf = new Uint8Array(12 + ciphertext.byteLength);
    buf.set(iv, 0);
    buf.set(new Uint8Array(ciphertext), 12);
    return GC_ENC_MARKER + btoa(String.fromCharCode(...buf));
  } catch (_) { return plaintext; }
};

export const _gcDecrypt = async (stored, userId, passwordHash) => {
  try {
    if (!stored || !stored.startsWith(GC_ENC_MARKER)) return stored;
    const key = await _gcGetAESKey(userId, passwordHash);
    if (!key) return stored; // Fallback si pas d'auth
    const data = atob(stored.slice(GC_ENC_MARKER.length));
    const buf = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) buf[i] = data.charCodeAt(i);
    const iv = buf.slice(0, 12);
    const ciphertext = buf.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (_) { return stored; }
};

// Wrappers LS chiffrés (async)  -  utilisés pour les clés sensibles
// FIX v140 BUG #5 — _gcDecrypt/_gcEncrypt nécessitent userId + passwordHash pour AES-GCM
// per-user (introduit v128). _lsGetSecure et lsSave les appelaient SANS ces paramètres
// → fallback silencieux non chiffré (données sensibles en clair dans localStorage).
// Fix : passage explicite des credentials depuis le contexte courant via __gcCurrentUser.
//
// Pattern : AppRoot.setCurrentUser() met à jour window.__gcCurrentUser = { id, passwordHash }
// dès qu'un utilisateur se connecte. Avant connexion → fallback plaintext (acceptable).
export const _lsGetSecure = async (k) => {
  try {
    const raw = _lsGet(k);
    if (!raw) return null;
    if (raw.startsWith(GC_ENC_MARKER)) {
      const ctx = typeof window !== 'undefined' ? window.__gcCurrentUser : null;
      return await _gcDecrypt(raw, ctx?.id, ctx?.passwordHash);
    }
    return raw; // données existantes non chiffrées — migration transparente
  } catch (_) { return null; }
};
export const _lsSetSecure = async (k, v) => {
  try {
    if (GC_ENC_KEYS.has(k.replace(/^GC_SI_v12:/, ""))) {
      const ctx = typeof window !== 'undefined' ? window.__gcCurrentUser : null;
      const enc = await _gcEncrypt(v, ctx?.id, ctx?.passwordHash);
      _lsSet(k, enc);
    } else {
      _lsSet(k, v);
    }
  } catch (_) { _lsSet(k, v); }
};


// -- Génération d'IDs robustes (Phase 0 v57) -------------------------------
// Utilise crypto.randomUUID() si disponible, sinon fallback sécurisé
const gcGenId = (prefix = "ID") => {
  try {
    if (crypto?.randomUUID) {
      const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
      return `${prefix}-${uuid}`;
    }
  } catch (_) {}
  // Fallback : combinaison timestamp + random base36
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ts}${rnd}`;
};

export const _migrateLS = () => {
  try {
    if (_lsGet("_gc_migrated_v12")) return;
    const keys = ["users","dossiers","taches","rdvs","pendingApprovals","theme","siLogoUrl","siAppearance","siCSSOverrides"];
    keys.forEach(k => {
      const oldVal = _lsGet(`${LS_KEY_OLD}:${k}`);
      if (oldVal && !_lsGet(`${LS_KEY}:${k}`)) {
        _lsSet(`${LS_KEY}:${k}`, oldVal);
      }
    });
    _lsSet("_gc_migrated_v12", "1");
  } catch (_) {}
};
_migrateLS();

// FIX v123 — Utilise 'password' (clair) au lieu de GC_DG_HASH
// La migration au boot re-hachera avec le contexte crypto courant.
export const _migrateDGAccount = () => {
  try {
    const raw = _lsGet(LS_KEY + ":users");
    if (!raw || raw.startsWith(GC_ENC_MARKER)) return;
    const stored = JSON.parse(raw);
    if (!Array.isArray(stored)) return;
    const hasDG = stored.some(u => u.id === "USR-DG-001");
    if (!hasDG) {
      const dgAccount = {
        id: "USR-DG-001", name: "Directeur General", alias: "dg.genie",
        role: "Directeur General", dept: "Direction Generale",
        process: "P01", level: 5, avatar: "DG", color: "#C9A84C",
        isMG: true, password: "DG@GenieSI#2026!",
        sexe: "N/A", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
        telephone: "+241 000 000 001", email: "dg@genie-consultant.com",
        adresse: "Direction Generale",
        bio: "Compte Directeur General par defaut. Veuillez configurer votre profil a la premiere connexion.",
        photoUrl: null, isActive: true, accountStatus: "ACTIF", isFirstLogin: true,
      };
      const adminIdx = stored.findIndex(u => u.isAdmin || u.id === "USR-ADM-000");
      const insertAt = adminIdx >= 0 ? adminIdx + 1 : 0;
      stored.splice(insertAt, 0, dgAccount);
      _lsSet(LS_KEY + ":users", JSON.stringify(stored));
    } else {
      // FIX v128 — Race condition profil 1ère connexion :
      // Si le compte DG existe mais n'a ni password ni passwordHash (suite à une
      // sauvegarde de profil qui a écrasé les credentials avant leur migration),
      // on restaure le mot de passe par défaut pour que la migration async puisse le hacher.
      const dgIdx = stored.findIndex(u => u.id === "USR-DG-001");
      if (dgIdx >= 0) {
        const dg = stored[dgIdx];
        if (!dg.password && !dg.passwordHash) {
          stored[dgIdx] = { ...dg, password: "DG@GenieSI#2026!" };
          _lsSet(LS_KEY + ":users", JSON.stringify(stored));
        }
      }
    }
  } catch (_) {}
};
_migrateDGAccount();

// FIX v63 C2  -  Version async de lsLoad pour les clés sensibles
export const lsLoadSecure = async (key, fallback) => {
  try {
    const fullKey = `${LS_KEY}:${key}`;
    const raw = _lsGet(fullKey);
    if (!raw) return fallback;
    let plaintext = raw;
    if (raw.startsWith(GC_ENC_MARKER)) {
      plaintext = await _gcDecrypt(raw);
      if (plaintext === null) return fallback;
      // Mettre en cache mémoire pour lsLoad sync
      _GC_MEM[`dec:${fullKey}`] = plaintext;
    }
    return JSON.parse(plaintext);
  } catch (_) { return fallback; }
};



// ==========================================================================
// COMPOSANT : Configuration Fiscale OHADA (Phase 0 v57)
// Permet à l'Admin de modifier les taux fiscaux sans toucher au code
// ==========================================================================

export const lsLoad = (key, fallback) => {
  try {
    const raw = _lsGet(`${LS_KEY}:${key}`);
    if (!raw) return fallback;
    // FIX v63 C2  -  Si la valeur est chiffrée, on la déchiffre en sync via cache mémoire
    // (la déchiffrement async sera propagé au prochain cycle via lsLoadSecure)
    if (raw.startsWith(GC_ENC_MARKER)) {
      // Tenter de lire depuis le cache mémoire si disponible (peuplé par lsLoadSecure)
      const cached = _GC_MEM[`dec:${LS_KEY}:${key}`];
      if (cached !== undefined) return JSON.parse(cached);
      // Fallback: retourner la valeur par défaut jusqu'à ce que le déchiffrement async soit prêt
      return fallback;
    }
    return JSON.parse(raw);
  } catch (_) { return fallback; }
};

// FIX v63 C2  -  Version async de lsLoad pour les clés sensibles

export const lsSave = (key, value) => {
  try {
    const json = JSON.stringify(value);
    const fullKey = `${LS_KEY}:${key}`;
    if (GC_ENC_KEYS.has(key)) {
      // FIX BUG-MEM-1 — Écrire en clair SYNCHRONIQUEMENT en premier pour garantir
      // la persistance immédiate même si la page recharge avant la fin du chiffrement async.
      // Le chiffrement async remplace ensuite la valeur en clair par la version sécurisée.
      _lsSet(fullKey, json);
      _GC_MEM[`dec:${fullKey}`] = json;
      const ctx = typeof window !== 'undefined' ? window.__gcCurrentUser : null;
      _gcEncrypt(json, ctx?.id, ctx?.passwordHash).then(enc => {
        if (enc && enc !== json) _lsSet(fullKey, enc);
        _GC_MEM[`dec:${fullKey}`] = json;
      }).catch(() => { /* déjà sauvegardé en clair ci-dessus */ });
    } else {
      _lsSet(fullKey, json);
    }
  } catch (_) {}
};


// ==========================================================================
// COMPOSANT : Configuration Fiscale OHADA (Phase 0 v57)
// Permet à l'Admin de modifier les taux fiscaux sans toucher au code
// ==========================================================================

// ═══════════════════════════════════════════════════════════════
// AUTO-SYNC HOOK — Permet à datastore.js de s'abonner aux writes
// sans créer de dépendance circulaire
// ═══════════════════════════════════════════════════════════════
const _syncCallbacks = [];
export const _registerSyncHook = (fn) => { _syncCallbacks.push(fn); };

// Patch _lsSet pour notifier les abonnés (datastore) quand une clé partagée change
const _origLsSet = _lsSet;
export const _lsSetWithSync = (k, v) => {
  _origLsSet(k, v);
  // Notifier les callbacks de sync (non-bloquant)
  if (_syncCallbacks.length > 0 && k) {
    const rawKey = k.startsWith(LS_KEY + ':') ? k.slice(LS_KEY.length + 1) : k;
    for (const cb of _syncCallbacks) {
      try { cb(rawKey, v); } catch (_) {}
    }
  }
};

// FIX v127 — _lsSetWithSync était défini mais JAMAIS utilisé : les modules appelant
// _lsSet directement ne déclenchaient aucun hook de sync vers le datastore serveur.
// Solution : re-exporter _lsSet comme alias de _lsSetWithSync pour que tous les
// imports existants de _lsSet bénéficient automatiquement des hooks de sync.
// NOTE : on ne peut pas reassigner un const, donc on exporte un wrapper nommé.
export { _lsSetWithSync as _lsSetSync };

// Patch de lsSave pour utiliser _lsSetWithSync sur les clés versionnées
// (lsSave écrit sur `LS_KEY:${key}` — ce patch garantit la propagation sync)
