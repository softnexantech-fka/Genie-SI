// ============================================================
// core/storage.js — localStorage, encryption AES-GCM, migration
// SI Génie Consultant v127
// ============================================================
import React from 'react';

export const LS_KEY = "GC_SI_v12";
export const LS_KEY_OLD = "GC_SI_v11";

// Fallback constants for localStorage (loaded at startup)
export function LiveClock({ color = "#C41E3A", style: s = {} }) {
  const [time, setTime] = React.useState(() => new Date());
  React.useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  const pad = n => String(n).padStart(2, "0");
  return (
    <span style={{ fontFamily: "monospace", color, fontWeight: 700, ...s }}>
      {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
    </span>
  );
};

// BUG FIX : ls wrappers avec fallback mémoire (_GC_MEM) si localStorage indisponible
export const _GC_MEM = {};
export const _lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return _GC_MEM[k] != null ? _GC_MEM[k] : null; } };
export const _lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { _GC_MEM[k] = v; } };
export const _lsRm  = (k) => { try { localStorage.removeItem(k); } catch (_) { delete _GC_MEM[k]; } };

// Versioning schéma localStorage
export const LS_SCHEMA_VERSION = "63";
export const _checkSchemaVersion = () => {
  try {
    const stored = _lsGet("gc-schema-version");
    if (stored !== LS_SCHEMA_VERSION) {
      console.info(`[SI Génie] Migration schéma LS: v${stored||"<62"} → v${LS_SCHEMA_VERSION}`);
      _lsSet("gc-schema-version", LS_SCHEMA_VERSION);
    }
  } catch (_) {}
};
_checkSchemaVersion();

// Chiffrement AES-GCM du localStorage (clés sensibles uniquement)
export const GC_ENC_MARKER = "GC_ENC:";
export const GC_ENC_KEYS = new Set(["gc-users","gc-session-logs","gc-dossiers","gc-taches"]);

// Chiffrement PER-UTILISATEUR avec clé dérivée du mot de passe
export const _gcGetAESKey = (() => {
  const _cachedKeys = new Map();
  return async (userId, passwordHash) => {
    if (!userId || !passwordHash) return null;
    const cacheKey = `${userId}-${passwordHash.slice(0, 16)}`;
    if (_cachedKeys.has(cacheKey)) return _cachedKeys.get(cacheKey);
    try {
      const encoder = new TextEncoder();
      const salt = encoder.encode(`GC_SALT_${userId}_2026`);
      const keyMaterial = await crypto.subtle.importKey(
        "raw", encoder.encode(passwordHash), { name: "PBKDF2" }, false, ["deriveKey"]
      );
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
      );
      _cachedKeys.set(cacheKey, key);
      return key;
    } catch (_) { return null; }
  };
})();

export const _gcEncrypt = async (plaintext, userId, passwordHash) => {
  try {
    const key = await _gcGetAESKey(userId, passwordHash);
    if (!key) return plaintext;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
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
    if (!key) return stored;
    const data = atob(stored.slice(GC_ENC_MARKER.length));
    const buf = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) buf[i] = data.charCodeAt(i);
    const iv = buf.slice(0, 12);
    const ciphertext = buf.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (_) { return stored; }
};

// Wrappers LS chiffrés (async)
export const _lsGetSecure = async (k) => {
  try {
    const raw = _lsGet(k);
    if (!raw) return null;
    let plaintext = raw;
    if (raw.startsWith(GC_ENC_MARKER)) {
      plaintext = await _gcDecrypt(raw);
      if (plaintext === null) return null;
      _GC_MEM[`dec:${k}`] = plaintext;
    }
    return JSON.parse(plaintext);
  } catch (_) { return null; }
};
export const _lsSetSecure = async (k, v) => {
  try {
    if (GC_ENC_KEYS.has(k.replace(/^GC_SI_v12:/, ""))) {
      const enc = await _gcEncrypt(JSON.stringify(v));
      _lsSet(k, enc);
    } else {
      _lsSet(k, JSON.stringify(v));
    }
  } catch (_) { _lsSet(k, JSON.stringify(v)); }
};

// Génération d'IDs robustes
const gcGenId = (prefix = "ID") => {
  try {
    if (crypto?.randomUUID) {
      const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
      return `${prefix}-${uuid}`;
    }
  } catch (_) {}
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

export const lsLoadSecure = async (key, fallback) => {
  try {
    const fullKey = `${LS_KEY}:${key}`;
    const raw = _lsGet(fullKey);
    if (!raw) return fallback;
    let plaintext = raw;
    if (raw.startsWith(GC_ENC_MARKER)) {
      plaintext = await _gcDecrypt(raw);
      if (plaintext === null) return fallback;
      _GC_MEM[`dec:${fullKey}`] = plaintext;
    }
    return JSON.parse(plaintext);
  } catch (_) { return fallback; }
};

export const lsLoad = (key, fallback) => {
  try {
    const raw = _lsGet(`${LS_KEY}:${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) { return fallback; }
};

export const lsSave = (key, value) => {
  try {
    _lsSet(`${LS_KEY}:${key}`, JSON.stringify(value));
  } catch (_) {}
};
