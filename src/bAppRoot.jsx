import React, { useState, useEffect, useRef, useCallback } from 'react';
// AppRoot.jsx — Composant racine: état connexion, thème, session
// SI Génie Consultant v127
import {
  _lsGet, _lsSet, _lsRm, lsLoad, lsSave, lsLoadSecure,
  _noop, _tDone, _tActive,
  gcPushNotif, _gcSafeCalc,
  gcAntiRedondance,
  _gcProxyFetch,
  _gcEncrypt, _lsGetSecure, _lsSetSecure,
  _migrateDGAccount, _checkSchemaVersion, _migrateLS, SIErrorBoundary,
  gcMigrateFilesFromLS, gcSyncFilesToServer, gcFileStats, dsInitSync, dsStartSync, dsOnSync, dsSave, dsLoad, dsGet, dsDeleteItemFromArray, dsClearTombstones, dsWipeKey, SHARED_KEYS,
  // FIX vSERVER-TIME — synchronisation heure serveur
  syncServerTime,
  // FIX v127 — fonctions IP centralisées
  gcGetClientIp, _gcCachedIp,
  // FIX v127 — fonctions session/hash
  gcHashPassword, gcGenerateSessionToken, gcValidateSessionToken,
} from './core/index.js';
import {
  THEMES,
  INITIAL_DOSSIERS, INITIAL_TACHES, INITIAL_RDVS, INITIAL_PENDING, INITIAL_PARTNERS,
  INITIAL_USERS, INITIAL_SI_SYSTEM_DOCS,
  INITIAL_SESSION_LOGS, INITIAL_ACCOUNT_ACTIONS, ACCOUNT_STATUS_CONFIG,
  USER_FUNCTIONS, DEMO_USERS, DEMO_DOSSIERS, DEMO_RDVS, DEMO_TACHES,
  DEMO_PENDING,
} from './core/constants.js';
import { gcNormalizeUser } from './core/helpers.js';
import { GlobalStyles } from './styles/GlobalStyles.jsx';
import { CoverPage, LoginPage, CreateAccountPage } from './components/Auth.jsx';
import { SIApp } from './SIApp.jsx';
import { DialogProvider, useDialog } from './components/Dialog.jsx';
import { ToastContainer } from './components/ToastManager.jsx';
import usePurifySync from './hooks/usePurifySync.js';

export default function App() {
  // FIX v127 — useDialog + helpers modaux (gcAlert/gcConfirm/gcPrompt) étaient
  // utilisés dans AppRoot mais jamais initialisés ici. Ils sont correctement
  // définis dans les autres composants via useDialog(); on les ajoute ici aussi.
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const [themeMode, setThemeMode] = useState(() => lsLoad("theme", "dark"));
  const [siLogoUrl, setSiLogoUrlState] = useState(() => lsLoad("siLogoUrl", null));
  const [siAppearance, setSiAppearanceState] = useState(() => lsLoad("siAppearance", {
    primaryColor: "#C41E3A",
    navyColor: "#0A1E4A",
    goldColor: "#C9A84C",
    accentColor: "#3B82F6",
    cabinetName: "GÉNIE CONSULTANT",
    cabinetSlogan: "Excellence · Intégrité · Performance",
    loginSubtitle: "Système d'Information Intégré",
    coverBg: "navy",
    fontScale: 1,
  }));
  const [siCSSOverrides, setSiCSSOverridesState] = useState(() => lsLoad("siCSSOverrides", ""));

  const [siSystemDocs, setSiSystemDocsState] = useState(() => {
    try {
      const saved = _lsGet("gc-si-docs");
      if (saved) {
        const parsed = JSON.parse(saved);
        // FIX BUG-B3 — Nettoyer les placeholders "[STORED]" hérités de l'ancien bug.
        // Si dataUrl == "[STORED]", c'est un vestige du précédent fix cassé : on le supprime
        // pour que l'UI re-télécharge depuis le serveur au lieu d'afficher "[STORED]".
        const cleaned = parsed.map(d => {
          if (d && d.dataUrl === "[STORED]") {
            const { dataUrl: _du, ...rest } = d;
            return rest;
          }
          return d;
        });
        const merged = INITIAL_SI_SYSTEM_DOCS.map(init => {
          const found = cleaned.find(d => d.id === init.id);
          return found ? { ...init, ...found } : init;
        });
        const customDocs = cleaned.filter(d => !INITIAL_SI_SYSTEM_DOCS.find(i => i.id === d.id));
        return [...merged, ...customDocs];
      }
    } catch (_) {}
    return INITIAL_SI_SYSTEM_DOCS;
  });
  const setSiSystemDocs = useCallback((v) => {
    setSiSystemDocsState(prev => {
      const resolved = typeof v === "function" ? v(prev) : v;
      // FIX BUG-B3 — Ne JAMAIS écrire "[STORED]" comme placeholder dans le localStorage.
      // L'ancien code remplaçait dataUrl par "[STORED]" en cas de quota → au prochain refresh,
      // l'UI rechargeait "[STORED]" comme contenu de fichier au lieu du vrai dataUrl.
      // Nouvelle stratégie : essayer d'écrire le contenu complet, si quota dépassé, écrire
      // seulement les métadonnées (sans dataUrl) — l'absence de dataUrl est gérée par l'UI
      // qui re-télécharge depuis le serveur si nécessaire.
      try {
        _lsSet("gc-si-docs", JSON.stringify(resolved.map(d => ({ ...d }))));
      } catch (_e) {
        try {
          const lightVersion = resolved.map(d => {
            const { dataUrl: _du, ...rest } = d;
            return rest; // pas de dataUrl du tout, plutôt que "[STORED]"
          });
          _lsSet("gc-si-docs", JSON.stringify(lightVersion));
        } catch (_) {}
      }
      // Sync serveur (sans dataUrl pour ne pas saturer SQLite)
      dsSave("gc-si-docs", resolved.map(d => {
        const { dataUrl: _du, ...rest } = d;
        return rest;
      })).catch(() => {});
      return resolved;
    });
  }, []);

  const readActiveSession = useCallback(() => {
    try {
      const saved = _lsGet("gc-active-session");
      if (!saved) return null;
      // NOTE: gc-active-session est stocké en JSON brut.
      // _gcDecrypt est async et ne doit pas être utilisé dans un useState initializer sync.
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }, []);

  const [screen, setScreen] = useState(() => {
    try {
      const s = readActiveSession();
      // 🔐 Validation du token de session : si token invalide -> retour cover
      if (s?.userId && s?.screen && s?.sessionToken) {
        if (gcValidateSessionToken(s.sessionToken, s.userId)) return s.screen;
      }
    } catch (_) {}
    return "cover";
  });
  // 🔐 isAdminMode n'est plus lu depuis localStorage, calculé depuis le user object
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [currentUser, setCurrentUserState] = useState(() => {
    try {
      const s = readActiveSession();
      if (s?.userId) {
        const users = JSON.parse(_lsGet("GC_SI_v12:users")||_lsGet("GC_SI_v11:users")||"null") || INITIAL_USERS;
        const u = users.find(u => u.id === s.userId) || null;
        // FIX v123 — Toujours supprimer 'password' en clair du state restauré
        if (u) {
          const { password: _p, ...safeU } = u;
          return safeU;
        }
        return null;
      }
    } catch (_) {}
    return null;
  });
  const setCurrentUser = useCallback((user) => { // FIX v135 — useCallback : évite recréation à chaque render de App()
    // FIX v123 — Toujours supprimer le champ 'password' en clair du state,
    // que passwordHash existe ou non. Le login fonctionne via gcVerifyPassword.
    let safeUser = null;
    if (user) {
      const { password: _p, ...rest } = user;
      safeUser = rest;
    }
    setCurrentUserState(safeUser);
    // FIX v140 BUG #5 — Exposer l'utilisateur courant pour le chiffrement AES-GCM
    // per-user dans storage.js (lsSave/lsLoadSecure appellent _gcEncrypt/_gcDecrypt
    // qui ont besoin de userId + passwordHash pour dériver la clé AES).
    try {
      if (typeof window !== 'undefined') {
        window.__gcCurrentUser = safeUser ? { id: safeUser.id, passwordHash: safeUser.passwordHash } : null;
      }
    } catch (_) {}
    if (safeUser) {
      // 🔐 SÉCURITÉ: On ne stocke PLUS isAdminMode dans la session
      // Le niveau d'accès est recalculé depuis l'objet user chargé depuis les données.
      // On stocke un token de session pour détecter toute falsification.
      const sessionToken = gcGenerateSessionToken(safeUser.id);
      try {
        // ✅ CRITICAL FIX: _gcEncrypt is async - must await before _lsSet
        const sessionData = JSON.stringify({
          userId: safeUser.id,
          userName: safeUser.name || safeUser.username || safeUser.id,
          screen: "app",
          sessionToken, // Token d'intégrité
          loginAt: new Date().toISOString(),
        });
        _gcEncrypt(sessionData).then(encrypted => {
          try { _lsSet("gc-active-session", encrypted); } catch (_) {}
        }).catch(() => {
          try { _lsSet("gc-active-session", sessionData); } catch (_) {} // fallback non chiffré
        });
      } catch (_) {}
    } else {
      try { _lsRm("gc-active-session"); } catch (_) {}
    }
    // Après le rendu de l'app (hooks useSyncedState montés), déclencher un re-fetch
    // général via gc-sync-online — signal que tous les hooks useSyncedState écoutent.
    // Délai 600ms pour laisser le temps à React de rendre les modules et monter les hooks.
    if (safeUser) {
      setTimeout(() => {
        try { window.dispatchEvent(new CustomEvent('gc-sync-online')); } catch (_) {}
      }, 600);
    }
  }, []); // FIX v135 — fin useCallback
  const [isDemoMode, setIsDemoMode] = useState(false);

  // [SYNC-MASTER] Client-side purification hook — écoute gc-purify-order WebSocket
  // Exécute les règles de purification reçues du serveur + valide le checksum local
  const { isPurifying, purifyOrder, checksum, validationStatus, errors: purifyErrors } = usePurifySync();

  // FIX v137 — CRITICAL: Load users from API immediately at startup
  // Before rendering LoginPage, fetch the list from /api/users/list (public endpoint)
  // This ensures NEW devices/browsers see all accounts even without localStorage cache
  const [hydrating, setHydrating] = useState(true);
  const [usersFromAPI, setUsersFromAPI] = useState(null);
  
  // Start API fetch immediately BEFORE any setState initializers
  useEffect(() => {
    const fetchUsersFromAPI = async () => {
      try {
        const response = await fetch('/api/users/list', { 
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.ok && Array.isArray(data.users) && data.users.length > 0) {
            setUsersFromAPI(data.users);
            // Also save to localStorage for offline support
            try { _lsSet('users', JSON.stringify(data.users)); } catch (_) {}
            console.log(`[AppRoot] Loaded ${data.users.length} users from /api/users/list`);
            return; // Success, exit
          }
        }
      } catch (err) {
        console.warn('[AppRoot] Failed to fetch /api/users/list:', err.message);
      }
      // On timeout or error, try to use cached data after 2s
      setTimeout(() => {
        const cached = lsLoad('users', INITIAL_USERS);
        if (!usersFromAPI && cached.length > 0) {
          console.log('[AppRoot] Using cached users');
          setUsersFromAPI(cached);
        }
      }, 2000);
    };
    
    fetchUsersFromAPI();
  }, []);

  const [prodUsers, setProdUsers] = useState(() => lsLoad("users", INITIAL_USERS));
  const [prodDossiers, setProdDossiers] = useState(() => lsLoad("dossiers", INITIAL_DOSSIERS));
  const [prodTaches, setProdTaches] = useState(() => lsLoad("taches", INITIAL_TACHES));
  const [prodRdvs, setProdRdvs] = useState(() => lsLoad("rdvs", INITIAL_RDVS));
  const [prodPending, setProdPending] = useState(() => lsLoad("pendingApprovals", INITIAL_PENDING));
  const [_prodPartners, setProdPartners] = useState(() => lsLoad("partners", INITIAL_PARTNERS));

  // Once API fetch completes, update the users state
  useEffect(() => {
    if (usersFromAPI && usersFromAPI.length > 0) {
      console.log('[AppRoot] Applying API users to state');
      setProdUsers(usersFromAPI);
    }
  }, [usersFromAPI]);

  const [users, setUsersState] = useState(() => lsLoad("users", INITIAL_USERS));
  const [dossiers, setDossiersState] = useState(() => lsLoad("dossiers", INITIAL_DOSSIERS));
  const [taches, setTachesState] = useState(() => lsLoad("taches", INITIAL_TACHES));
  const [rdvs, setRdvsState] = useState(() => lsLoad("rdvs", INITIAL_RDVS));
  const [pendingApprovals, setPendingApprovalsState] = useState(() => lsLoad("pendingApprovals", INITIAL_PENDING));
  
  // Once API users are loaded, update the main state too
  useEffect(() => {
    if (usersFromAPI && usersFromAPI.length > 0) {
      console.log('[AppRoot] Updating users state with API data');
      setUsersState(usersFromAPI);
    }
  }, [usersFromAPI]);

  const [requireConnApproval, setRequireConnApprovalState] = useState(() => {
    try { return JSON.parse(_lsGet("gc-require-conn-approval") || "false"); } catch (_) { return false; }
  });
  const setRequireConnApproval = useCallback((v) => {
    setRequireConnApprovalState(v);
    try { _lsSet("gc-require-conn-approval", JSON.stringify(v)); dsSave("gc-require-conn-approval", v).catch(() => {}); } catch (_) {}
  }, []);
  const [pendingConnections, setPendingConnectionsState] = useState(() => {
    try { return JSON.parse(_lsGet("gc-pending-connections") || "[]"); } catch (_) { return []; }
  });
  const setPendingConnections = useCallback((updater) => {
    setPendingConnectionsState(prev => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      try { _lsSet("gc-pending-connections", JSON.stringify(resolved)); dsSave("gc-pending-connections", resolved).catch(() => {}); } catch (_) {}
      return resolved;
    });
  }, []);
  const [sessionLogs, setSessionLogs] = useState(() => { try { return JSON.parse(_lsGet("gc-session-logs")||"null") || INITIAL_SESSION_LOGS; } catch (_) { return INITIAL_SESSION_LOGS; } });

  // FIX v62: addSessionLog défini ici (App scope)  -  utilisé pour login/logout + passé en prop à SIApp
  // useCallback([], []) -> référence stable, évite re-fire des useEffect qui l'ont en deps
  const addSessionLog = useCallback((type, user, extra = {}) => {
    if (!user) return null;
    // FIX v85 — Mode incognito admin : ne pas journaliser les actions de l'admin
    try { if (user.isAdmin && JSON.parse(_lsGet("gc-admin-incognito")||"false")) return null; } catch(_) {}
    const at = new Date().toISOString();
    const device = (() => {
      const ua = navigator.userAgent;
      const browser = ua.includes("Edg") ? "Edge" : ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "Navigateur";
      const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : ua.includes("Android") ? "Android" : navigator.platform || "OS inconnu";
      return `${browser} / ${os}`;
    })();
    const logBase = {
      id: `SES-${Date.now()}-${Math.random().toString(36)?.slice(2,6)}`,
      type, userId: user.id, userName: user.name, userRole: user.role,
      userLevel: user.level, userProcess: user.process || "—",
      at, device,
      ip: _gcCachedIp || "Récupération...",
      status: extra.status || "SUCCESS",
      reason: extra.reason || null,
    };
    setSessionLogs(prev => {
      const updated = [logBase, ...prev]?.slice(0, 500);
      try { _lsSet("gc-session-logs", JSON.stringify(updated)); dsSave("gc-session-logs", updated); } catch (_) {}
      return updated;
    });
    gcGetClientIp().then(ip => {
      if (ip !== logBase.ip) {
        setSessionLogs(prev => {
          const updated = prev.map(l => l.id === logBase.id ? { ...l, ip } : l);
          try { _lsSet("gc-session-logs", JSON.stringify(updated?.slice(0, 500))); dsSave("gc-session-logs", updated?.slice(0, 500)); } catch (_) {}
          return updated;
        });
      }
    });
    return logBase;
   
// INTENTIONNEL : addSessionLog est un useCallback stable, setSessionLogs ne doit pas re-créer la fonction
  }, []);
  const [pendingAccountActions, setPendingAccountActions] = useState(() => { try { return JSON.parse(_lsGet("gc-account-actions")||"null") || INITIAL_ACCOUNT_ACTIONS; } catch (_) { return INITIAL_ACCOUNT_ACTIONS; } });

  // ── États pour clés précédemment non hydratées ───────────────────────────
  const [securityAlerts, setSecurityAlerts] = useState(() => { try { return JSON.parse(_lsGet("gc-security-alerts")||"[]"); } catch (_) { return []; } });
  const [kpiAlerts, setKpiAlerts] = useState(() => { try { return JSON.parse(_lsGet("gc-kpi-alerts")||"[]"); } catch (_) { return []; } });
  const [gcFileCatalog, setGcFileCatalog] = useState(() => { try { return JSON.parse(_lsGet("gc-files")||"null") || []; } catch (_) { return []; } });
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => { try { return JSON.parse(_lsGet("gc-auto-backup-enabled")||"true"); } catch (_) { return true; } });
  const [autoBackupInterval, setAutoBackupInterval] = useState(() => { try { return parseInt(_lsGet("gc-auto-backup-interval")||"5", 10); } catch (_) { return 5; } });

  const setPAA = useCallback((v) => {
    setPendingAccountActions(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      try { _lsSet("gc-account-actions", JSON.stringify(resolved)); dsSave("gc-account-actions", resolved).catch(() => {}); } catch (_) {}
      // FIX v129 — Sync serveur manquante : les actions comptes (suspensions,
      // réactivations, suppressions) n'étaient jamais propagées aux autres postes.
      if (!isDemoModeRef.current) { dsSave("gc-account-actions", resolved); }
      return resolved;
    });
  }, []);

  const isDemoModeRef = useRef(isDemoMode);
  // ── Synchronisation données partagées + Migration fichiers ────────────
  useEffect(() => {
    // ✅ CRITICAL FIX: dsStartSync cleanup stored in ref to avoid memory leak
    let _dsStopSync = null;
    
    // 1. Synchronisation initiale avec le serveur partagé
    dsInitSync().then(async result => {
      if (result.online) {
        console.log(`[SI] ✅ Connecté au serveur — hydratation depuis SQLite en cours…`);
        // FIX vSERVER-TIME — synchroniser l'heure du SI avec le serveur
        try {
          import('./core/datastore.js').then(({ getProxyUrl: _gpUrl }) => {
            const pUrl = _gpUrl ? _gpUrl() : '';
            if (pUrl) syncServerTime(pUrl);
          }).catch(() => {});
        } catch (_) {}

        // FIX v131 — PULL-FIRST strict : le serveur est TOUJOURS la source de vérité.
        // ─────────────────────────────────────────────────────────────────────────────
        // PROBLÈME RÉSOLU : L'ancien "FIX v128" appelait au démarrage de chaque client :
        //   dsSave("users", lsLoad("users", INITIAL_USERS))
        // Tout nouvel utilisateur avec un localStorage vide chargeait INITIAL_USERS
        // puis l'écrasait sur le serveur → perte totale des données réelles.
        //
        // DISTINCTION CLEF — dsGet(key, null) retourne :
        //   • null       = clé ABSENTE du serveur (404) → premier démarrage ever
        //   • []         = clé PRÉSENTE mais vide  → intentionnel, à respecter
        //   • [...items] = clé PRÉSENTE avec données → source de vérité
        //
        // CAS A (serverVal !== null) : clé présente sur le serveur (même si vide [])
        //   → On hydrate le state React + localStorage local avec la valeur serveur.
        //   → On ne touche JAMAIS au serveur au démarrage dans ce cas.
        //   → Respecte les suppressions intentionnelles (tableaux vides volontaires).
        //
        // CAS B (serverVal === null) : clé ABSENTE = première fois absolue sur ce serveur
        //   → Sous-cas B1 : local a des données NON-par-défaut → migration, on pousse.
        //   → Sous-cas B2 : local vide ou = defaults → ne rien pousser.
        //     Le serveur se peuplera naturellement quand un vrai user créera des données
        //     via l'UI (setUsers, setDossiers…). Ces callbacks font eux-mêmes dsSave().
        //
        // GARANTIE : aucun démarrage de machine ne peut jamais réinitialiser le SI.
        // ─────────────────────────────────────────────────────────────────────────────
        const HYDRATE_MAP = [
          { key: 'users',                    setters: [(v) => setUsersState(Array.isArray(v) ? v.map(gcNormalizeUser) : v), (v) => setProdUsers(Array.isArray(v) ? v.map(gcNormalizeUser) : v)], fallback: INITIAL_USERS },
          { key: 'dossiers',                 setters: [(v) => setDossiersState(v),          (v) => setProdDossiers(v)],      fallback: INITIAL_DOSSIERS },
          { key: 'taches',                   setters: [(v) => setTachesState(v),            (v) => setProdTaches(v)],        fallback: INITIAL_TACHES },
          { key: 'rdvs',                     setters: [(v) => setRdvsState(v),              (v) => setProdRdvs(v)],          fallback: INITIAL_RDVS },
          { key: 'partners',                 setters: [(v) => setPartnersStateRaw(v),       (v) => setProdPartners(v)],      fallback: INITIAL_PARTNERS },
          { key: 'gc-pending-approvals',     setters: [(v) => setPendingApprovalsState(v),  (v) => setProdPending(v)],       fallback: INITIAL_PENDING },
          // FIX v142 — Clés manquantes dans la hydratation initiale
          { key: 'siAppearance',             setters: [(v) => setSiAppearanceState(v)],     fallback: null },
          { key: 'siLogoUrl',                setters: [(v) => setSiLogoUrlState(v)],        fallback: null },
          { key: 'siCSSOverrides',           setters: [(v) => setSiCSSOverridesState(v)],   fallback: null },
          { key: 'gc-session-logs',          setters: [(v) => setSessionLogs(v)],           fallback: [] },
          { key: 'gc-pending-connections',   setters: [(v) => setPendingConnectionsState(v)], fallback: [] },
          { key: 'gc-require-conn-approval', setters: [(v) => setRequireConnApprovalState(v)], fallback: false },
          { key: 'gc-app-habilitations',     setters: [(v) => setAppHabilitations(v)],      fallback: [] },
          { key: 'gc-app-access-codes',      setters: [(v) => setAppAccessCodes(v)],        fallback: [] },
          // FIX v154 — Clés docs et config processus manquantes dans la synchro inter-machines
          // Sans ces entrées, les documents uploadés et la config processus ne survivent pas au refresh.
          { key: 'gc-si-docs',       setters: [(v) => setSiSystemDocs(Array.isArray(v) ? v : [])], fallback: [] },
          { key: 'gc-docs-unified',  setters: [(v) => setSiSystemDocs(Array.isArray(v) ? v : [])], fallback: [] },
          // gc-process-config : SIApp lit le LS au mount. On écrit dans LS, SIApp se charge du reste.
          { key: 'gc-process-config', setters: [(v) => {
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                try { _lsSet('gc-process-config', JSON.stringify(v)); } catch (_) {}
              }
            }], fallback: {} },

          // ── FIX v160 : Clés critiques manquantes — config cabinet, circuits, organigramme ──
          // Ces clés sont lues depuis le localStorage par leurs modules respectifs au mount.
          // Sans ces entrées, les configs faites sur le poste serveur ne se propagent pas.
          { key: 'gc-cabinet-info',      setters: [(v) => { try { _lsSet('gc-cabinet-info', JSON.stringify(v)); } catch (_) {} }],       fallback: null },
          { key: 'gc-fiscal-config',     setters: [(v) => { try { _lsSet('gc-fiscal-config', JSON.stringify(v)); } catch (_) {} }],      fallback: null },
          { key: 'gc-delai-config',      setters: [(v) => { try { _lsSet('gc-delai-config', JSON.stringify(v)); } catch (_) {} }],       fallback: null },
          { key: 'gc-circuits',          setters: [(v) => { try { _lsSet('gc-circuits', JSON.stringify(v)); } catch (_) {} }],           fallback: [] },
          { key: 'gc-orgigram-nodes',    setters: [(v) => { try { _lsSet('gc-orgigram-nodes', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-orgigram-links',    setters: [(v) => { try { _lsSet('gc-orgigram-links', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-process-app-matrix',setters: [(v) => { try { _lsSet('gc-process-app-matrix', JSON.stringify(v)); } catch (_) {} }],fallback: null },
          { key: 'gc-codif-registry',    setters: [(v) => { try { _lsSet('gc-codif-registry', JSON.stringify(v)); } catch (_) {} }],     fallback: {} },

          // ── FIX v160 : Apparence — les clés gc-si-* sont les clés serveur (siAppearance est l'alias LS) ──
          { key: 'gc-si-appearance',     setters: [(v) => setSiAppearanceState(v)],    fallback: null },
          { key: 'gc-si-logo-url',       setters: [(v) => setSiLogoUrlState(v)],       fallback: null },
          { key: 'gc-si-css-overrides',  setters: [(v) => setSiCSSOverridesState(v)],  fallback: null },

          // ── FIX v160 : Documents et fichiers — références perdues sur postes frais ──
          { key: 'gc-dossier-files',     setters: [(v) => { try { _lsSet('gc-dossier-files', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-standalone-docs',   setters: [(v) => { try { _lsSet('gc-standalone-docs', JSON.stringify(v)); } catch (_) {} }],   fallback: [] },
          { key: 'standaloneDocuments',  setters: [(v) => { try { _lsSet('standaloneDocuments', JSON.stringify(v)); } catch (_) {} }],  fallback: [] },
          { key: 'gc-courrier-docs',     setters: [(v) => { try { _lsSet('gc-courrier-docs', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-external-docs',     setters: [(v) => { try { _lsSet('gc-external-docs', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-internal-docs',     setters: [(v) => { try { _lsSet('gc-internal-docs', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-writer-docs',       setters: [(v) => { try { _lsSet('gc-writer-docs', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },
          { key: 'gc-writer-pro-v2',     setters: [(v) => { try { _lsSet('gc-writer-pro-v2', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-tableur-pro',       setters: [(v) => { try { _lsSet('gc-tableur-pro', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },
          { key: 'gc-pres-decks-v2',     setters: [(v) => { try { _lsSet('gc-pres-decks-v2', JSON.stringify(v)); } catch (_) {} }],    fallback: [] },

          // ── FIX v160 : Données métier — modules finance, RH, CRM, achat ──
          { key: 'gc-factures',          setters: [(v) => { try { _lsSet('gc-factures', JSON.stringify(v)); } catch (_) {} }],          fallback: [] },
          { key: 'gc-devis',             setters: [(v) => { try { _lsSet('gc-devis', JSON.stringify(v)); } catch (_) {} }],             fallback: [] },
          { key: 'gc-journal',           setters: [(v) => { try { _lsSet('gc-journal', JSON.stringify(v)); } catch (_) {} }],           fallback: [] },
          { key: 'gc-achats',            setters: [(v) => { try { _lsSet('gc-achats', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },
          { key: 'gc-demandes',          setters: [(v) => { try { _lsSet('gc-demandes', JSON.stringify(v)); } catch (_) {} }],          fallback: [] },
          { key: 'gc-kyc-workflows',     setters: [(v) => { try { _lsSet('gc-kyc-workflows', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-leaves',            setters: [(v) => { try { _lsSet('gc-leaves', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },
          { key: 'gc-recrutements',      setters: [(v) => { try { _lsSet('gc-recrutements', JSON.stringify(v)); } catch (_) {} }],      fallback: [] },
          { key: 'gc-sirh-presences',    setters: [(v) => { try { _lsSet('gc-sirh-presences', JSON.stringify(v)); } catch (_) {} }],    fallback: [] },
          { key: 'gc-sirh-evaluations',  setters: [(v) => { try { _lsSet('gc-sirh-evaluations', JSON.stringify(v)); } catch (_) {} }],  fallback: [] },
          { key: 'gc-sirh-fichiers',     setters: [(v) => { try { _lsSet('gc-sirh-fichiers', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-paie-taux',         setters: [(v) => { try { _lsSet('gc-paie-taux', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },
          { key: 'gc-paie-transferts',   setters: [(v) => { try { _lsSet('gc-paie-transferts', JSON.stringify(v)); } catch (_) {} }],   fallback: [] },
          { key: 'gc-crm-interactions',  setters: [(v) => { try { _lsSet('gc-crm-interactions', JSON.stringify(v)); } catch (_) {} }],  fallback: [] },
          { key: 'gc-crm-opps',          setters: [(v) => { try { _lsSet('gc-crm-opps', JSON.stringify(v)); } catch (_) {} }],          fallback: [] },
          { key: 'gc-crm-relances',      setters: [(v) => { try { _lsSet('gc-crm-relances', JSON.stringify(v)); } catch (_) {} }],      fallback: [] },
          { key: 'gc-conventions',       setters: [(v) => { try { _lsSet('gc-conventions', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },
          { key: 'gc-messages-global',   setters: [(v) => { try { _lsSet('gc-messages-global', JSON.stringify(v)); } catch (_) {} }],   fallback: [] },

          // ── FIX v160 : Compte + actions (AppRoot state setter disponible) ──
          { key: 'gc-account-actions',   setters: [(v) => { setPendingAccountActions(Array.isArray(v) ? v : []); try { _lsSet('gc-account-actions', JSON.stringify(v)); } catch (_) {} }], fallback: [] },

          // ── FIX v160 : Audit, conformité, risques ──
          { key: 'gc-audit-actions',     setters: [(v) => { try { _lsSet('gc-audit-actions', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },
          { key: 'gc-audit-checklist',   setters: [(v) => { try { _lsSet('gc-audit-checklist', JSON.stringify(v)); } catch (_) {} }],   fallback: [] },
          { key: 'gc-audit-prog',        setters: [(v) => { try { _lsSet('gc-audit-prog', JSON.stringify(v)); } catch (_) {} }],        fallback: [] },
          { key: 'gc-risks',             setters: [(v) => { try { _lsSet('gc-risks', JSON.stringify(v)); } catch (_) {} }],             fallback: [] },
          { key: 'gc-nc',                setters: [(v) => { try { _lsSet('gc-nc', JSON.stringify(v)); } catch (_) {} }],                fallback: [] },
          { key: 'gc-obligations',       setters: [(v) => { try { _lsSet('gc-obligations', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },
          { key: 'gc-rgpd-traitements',  setters: [(v) => { try { _lsSet('gc-rgpd-traitements', JSON.stringify(v)); } catch (_) {} }],  fallback: [] },
          { key: 'gc-conseil-opinions',  setters: [(v) => { try { _lsSet('gc-conseil-opinions', JSON.stringify(v)); } catch (_) {} }],  fallback: [] },

          // ── FIX vNext T04 : Juridique ─────────────────────────────────────────────
          { key: 'gc-jur-docs',              setters: [(v) => { try { _lsSet('gc-jur-docs', JSON.stringify(v)); } catch (_) {} }],              fallback: [] },
          { key: 'gc-jur-custom-laws',       setters: [(v) => { try { _lsSet('gc-jur-custom-laws', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },
          { key: 'gc-jur-custom-modeles',    setters: [(v) => { try { _lsSet('gc-jur-custom-modeles', JSON.stringify(v)); } catch (_) {} }],    fallback: [] },
          { key: 'gc-jur-veille',            setters: [(v) => { try { _lsSet('gc-jur-veille', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },
          { key: 'gc-jur-kyc',               setters: [(v) => { try { _lsSet('gc-jur-kyc', JSON.stringify(v)); } catch (_) {} }],               fallback: [] },

          // ── FIX vNext T05 : Communication ─────────────────────────────────────────
          { key: 'gc-comm-campagnes',        setters: [(v) => { try { _lsSet('gc-comm-campagnes', JSON.stringify(v)); } catch (_) {} }],        fallback: [] },
          { key: 'gc-comm-contacts',         setters: [(v) => { try { _lsSet('gc-comm-contacts', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },
          { key: 'gc-comm-fiches',           setters: [(v) => { try { _lsSet('gc-comm-fiches', JSON.stringify(v)); } catch (_) {} }],           fallback: [] },
          { key: 'gc-comm-custom-tpl',       setters: [(v) => { try { _lsSet('gc-comm-custom-tpl', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },
          { key: 'gc-widget-alarms',         setters: [(v) => { try { _lsSet('gc-widget-alarms', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },

          // ── FIX vNext T06 : Audit COSO/PCA ────────────────────────────────────────
          { key: 'gc-tpa',                   setters: [(v) => { try { _lsSet('gc-tpa', JSON.stringify(v)); } catch (_) {} }],                   fallback: [] },
          { key: 'gc-feuille-tests',         setters: [(v) => { try { _lsSet('gc-feuille-tests', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },
          { key: 'gc-audit-checklist-custom',setters: [(v) => { try { _lsSet('gc-audit-checklist-custom', JSON.stringify(v)); } catch (_) {} }],fallback: [] },
          { key: 'gc-audit-grille-taches',   setters: [(v) => { try { _lsSet('gc-audit-grille-taches', JSON.stringify(v)); } catch (_) {} }],   fallback: [] },
          { key: 'gc-pca',                   setters: [(v) => { try { _lsSet('gc-pca', JSON.stringify(v)); } catch (_) {} }],                   fallback: [] },
          { key: 'gc-pca-risques',           setters: [(v) => { try { _lsSet('gc-pca-risques', JSON.stringify(v)); } catch (_) {} }],           fallback: [] },
          { key: 'gc-pca-procedures',        setters: [(v) => { try { _lsSet('gc-pca-procedures', JSON.stringify(v)); } catch (_) {} }],        fallback: [] },
          { key: 'gc-pca-tests',             setters: [(v) => { try { _lsSet('gc-pca-tests', JSON.stringify(v)); } catch (_) {} }],             fallback: [] },
          { key: 'gc-coso-scores',           setters: [(v) => { try { _lsSet('gc-coso-scores', JSON.stringify(v)); } catch (_) {} }],           fallback: [] },
          { key: 'gc-coso-notes',            setters: [(v) => { try { _lsSet('gc-coso-notes', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },
          { key: 'gc-coso-custom-q',         setters: [(v) => { try { _lsSet('gc-coso-custom-q', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },
          { key: 'gc-amelio-actions',        setters: [(v) => { try { _lsSet('gc-amelio-actions', JSON.stringify(v)); } catch (_) {} }],        fallback: [] },
          { key: 'gc-amelio-kpis',           setters: [(v) => { try { _lsSet('gc-amelio-kpis', JSON.stringify(v)); } catch (_) {} }],           fallback: [] },
          { key: 'gc-amelio-ncs',            setters: [(v) => { try { _lsSet('gc-amelio-ncs', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },

          // ── FIX vNext T07 : Conformité ────────────────────────────────────────────
          { key: 'gc-conffull-approvals',    setters: [(v) => { try { _lsSet('gc-conffull-approvals', JSON.stringify(v)); } catch (_) {} }],    fallback: [] },
          { key: 'gc-conffull-checks',       setters: [(v) => { try { _lsSet('gc-conffull-checks', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },
          { key: 'gc-conffull-kpi',          setters: [(v) => { try { _lsSet('gc-conffull-kpi', JSON.stringify(v)); } catch (_) {} }],          fallback: [] },
          { key: 'gc-conffull-veille',       setters: [(v) => { try { _lsSet('gc-conffull-veille', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },

          // ── FIX vNext T08 : Logistique ────────────────────────────────────────────
          { key: 'gc-inventaires',           setters: [(v) => { try { _lsSet('gc-inventaires', JSON.stringify(v)); } catch (_) {} }],           fallback: [] },
          { key: 'gc-inventaire-en-cours',   setters: [(v) => { try { _lsSet('gc-inventaire-en-cours', JSON.stringify(v)); } catch (_) {} }],   fallback: [] },
          { key: 'gc-logmod-stocks',         setters: [(v) => { try { _lsSet('gc-logmod-stocks', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },
          { key: 'gc-logistique-actifs',     setters: [(v) => { try { _lsSet('gc-logistique-actifs', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },

          // ── FIX vNext T09 : Finance avancé ────────────────────────────────────────
          { key: 'gc-budget',                setters: [(v) => { try { _lsSet('gc-budget', JSON.stringify(v)); } catch (_) {} }],                fallback: [] },
          { key: 'gc-budget-rapide',         setters: [(v) => { try { _lsSet('gc-budget-rapide', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },
          { key: 'gc-stocks',                setters: [(v) => { try { _lsSet('gc-stocks', JSON.stringify(v)); } catch (_) {} }],                fallback: [] },
          { key: 'gc-piece-series',          setters: [(v) => { try { _lsSet('gc-piece-series', JSON.stringify(v)); } catch (_) {} }],          fallback: [] },
          { key: 'gc-ohada-docs',            setters: [(v) => { try { _lsSet('gc-ohada-docs', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },
          { key: 'gc-ohada-custom',          setters: [(v) => { try { _lsSet('gc-ohada-custom', JSON.stringify(v)); } catch (_) {} }],          fallback: [] },
          { key: 'gc-ohada-overrides',       setters: [(v) => { try { _lsSet('gc-ohada-overrides', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },

          // ── FIX vNext T10 : SIRH avancé ───────────────────────────────────────────
          { key: 'gc-sirh-leaves',           setters: [(v) => { try { _lsSet('gc-sirh-leaves', JSON.stringify(v)); } catch (_) {} }],           fallback: [] },
          { key: 'gc-sirh-recrutements',     setters: [(v) => { try { _lsSet('gc-sirh-recrutements', JSON.stringify(v)); } catch (_) {} }],     fallback: [] },

          // ── FIX vNext T11 : Messagerie ────────────────────────────────────────────
          { key: 'gc-msg-drafts',            setters: [(v) => { try { _lsSet('gc-msg-drafts', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },
          { key: 'gc-msg-templates',         setters: [(v) => { try { _lsSet('gc-msg-templates', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },

          // ── FIX vNext T12 : Tâches Kanban ─────────────────────────────────────────
          { key: 'gc-kanban-cols-v2',        setters: [(v) => { try { _lsSet('gc-kanban-cols-v2', JSON.stringify(v)); } catch (_) {} }],        fallback: [] },
          { key: 'gc-kanban-cards-v2',       setters: [(v) => { try { _lsSet('gc-kanban-cards-v2', JSON.stringify(v)); } catch (_) {} }],       fallback: [] },

          // ── FIX vNext T13 : Dashboard ─────────────────────────────────────────────
          { key: 'gc-committees',            setters: [(v) => { try { _lsSet('gc-committees', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },
          { key: 'gc-rapport-activite',      setters: [(v) => { try { _lsSet('gc-rapport-activite', JSON.stringify(v)); } catch (_) {} }],      fallback: [] },

          // ── FIX vNext T14 : Admin ─────────────────────────────────────────────────
          { key: 'gc-presence',              setters: [(v) => { try { _lsSet('gc-presence', JSON.stringify(v)); } catch (_) {} }],              fallback: [] },
          { key: 'gc-security-alerts',       setters: [(v) => { setSecurityAlerts(v); try { _lsSet('gc-security-alerts', JSON.stringify(v)); } catch (_) {} }],  fallback: [] },
          { key: 'gc-kpi-alerts',            setters: [(v) => { setKpiAlerts(v);      try { _lsSet('gc-kpi-alerts', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },
          { key: 'gc-kpi-dg-view',           setters: [(v) => { try { _lsSet('gc-kpi-dg-view', typeof v === 'string' ? v : JSON.stringify(v)); } catch (_) {} }],     fallback: "global" },
          { key: 'gc-files',                 setters: [(v) => { setGcFileCatalog(v);  try { _lsSet('gc-files', JSON.stringify(v)); } catch (_) {} }],                  fallback: [] },
          { key: 'gc-auto-backup-enabled',   setters: [(v) => { setAutoBackupEnabled(v);  try { _lsSet('gc-auto-backup-enabled', JSON.stringify(v)); } catch (_) {} }], fallback: true },
          { key: 'gc-auto-backup-interval',  setters: [(v) => { setAutoBackupInterval(v); try { _lsSet('gc-auto-backup-interval', String(v)); } catch (_) {} }],        fallback: 5 },
          { key: 'gc-matrix-log',            setters: [(v) => { try { _lsSet('gc-matrix-log', JSON.stringify(v)); } catch (_) {} }],            fallback: [] },

          // ── FIX vNext T15 : Analyse Stratégique ───────────────────────────────────
          { key: 'gc-bcg',                   setters: [(v) => { try { _lsSet('gc-bcg', JSON.stringify(v)); } catch (_) {} }],                   fallback: [] },
          { key: 'gc-mckinsey',              setters: [(v) => { try { _lsSet('gc-mckinsey', JSON.stringify(v)); } catch (_) {} }],              fallback: [] },
          { key: 'gc-porter',                setters: [(v) => { try { _lsSet('gc-porter', JSON.stringify(v)); } catch (_) {} }],                fallback: [] },
          { key: 'gc-vrio',                  setters: [(v) => { try { _lsSet('gc-vrio', JSON.stringify(v)); } catch (_) {} }],                  fallback: [] },
          { key: 'gc-qqoqcp',                setters: [(v) => { try { _lsSet('gc-qqoqcp', JSON.stringify(v)); } catch (_) {} }],                fallback: [] },
          { key: 'gc-pdca',                  setters: [(v) => { try { _lsSet('gc-pdca', JSON.stringify(v)); } catch (_) {} }],                  fallback: [] },
          { key: 'gc-pareto',                setters: [(v) => { try { _lsSet('gc-pareto', JSON.stringify(v)); } catch (_) {} }],                fallback: [] },
          { key: 'gc-mc7s',                  setters: [(v) => { try { _lsSet('gc-mc7s', JSON.stringify(v)); } catch (_) {} }],                  fallback: [] },
          { key: 'gc-ansoff',                setters: [(v) => { try { _lsSet('gc-ansoff', JSON.stringify(v)); } catch (_) {} }],                fallback: [] },
          { key: 'gc-10m',                   setters: [(v) => { try { _lsSet('gc-10m', JSON.stringify(v)); } catch (_) {} }],                   fallback: [] },
          { key: 'gc-5m',                    setters: [(v) => { try { _lsSet('gc-5m', JSON.stringify(v)); } catch (_) {} }],                    fallback: [] },
          { key: 'gc-5s',                    setters: [(v) => { try { _lsSet('gc-5s', JSON.stringify(v)); } catch (_) {} }],                    fallback: [] },

          // ── FIX vNext T16 : Archives ──────────────────────────────────────────────
          { key: 'gc-archives',              setters: [(v) => { try { _lsSet('gc-archives', JSON.stringify(v)); } catch (_) {} }],              fallback: [] },
          { key: 'gc-gestion-archives',      setters: [(v) => { try { _lsSet('gc-gestion-archives', JSON.stringify(v)); } catch (_) {} }],      fallback: [] },
          { key: 'gc-docs-archives',         setters: [(v) => { try { _lsSet('gc-docs-archives', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },

          // ── FIX vNext T17 : Outils ────────────────────────────────────────────────
          { key: 'gc-forms',                 setters: [(v) => { try { _lsSet('gc-forms', JSON.stringify(v)); } catch (_) {} }],                 fallback: [] },
          { key: 'gc-notes-rapides',         setters: [(v) => { try { _lsSet('gc-notes-rapides', JSON.stringify(v)); } catch (_) {} }],         fallback: [] },
          { key: 'gc-memos',                 setters: [(v) => { try { _lsSet('gc-memos', JSON.stringify(v)); } catch (_) {} }],                 fallback: [] },

          // ── FIX vNext T18 : CRM ───────────────────────────────────────────────────
          { key: 'gc-crm-clients',           setters: [(v) => { try { _lsSet('gc-crm-clients', JSON.stringify(v)); } catch (_) {} }],           fallback: [] },
        ];

        // FIX BUG-B1 — Hydrater 'users' EN PREMIER et explicitement, en synchrone bloquant.
        // Sans cela, les comptes utilisateurs créés sur d'autres machines n'apparaissent
        // pas sur les machines edge (LS vide) qui affichent INITIAL_USERS.
        // On essaye dans l'ordre : 'users' → 'gc-users' (auth). Si l'un répond, on l'utilise.
        try {
          let usersFromServer = await dsGet('users', null);
          if (!Array.isArray(usersFromServer) || usersFromServer.length === 0) {
            const gcUsersFromServer = await dsGet('gc-users', null);
            if (Array.isArray(gcUsersFromServer) && gcUsersFromServer.length > 0) {
              usersFromServer = gcUsersFromServer.map(u => ({
                id:            u.id,
                alias:         u.username || u.alias || u.id,
                name:          u.name || u.username || u.alias || u.id,
                email:         u.email || '',
                role:          u.role || 'Collaborateur',
                level:         u.level ?? 1,
                accountStatus: u.accountStatus || 'ACTIF',
                passwordHash:  u.passwordHash || '',
                isAdmin:       u.isAdmin || false,
                isMG:          u.isMG || false,
                process:       u.process || '',
                processes:     u.processes || [],
              }));
              console.log(`[SI] ⬇️  Users reconstruits depuis gc-users (${usersFromServer.length} comptes)`);
            }
          }
          if (Array.isArray(usersFromServer) && usersFromServer.length > 0) {
            lsSave('users', usersFromServer);
            setUsersState(usersFromServer);
            setProdUsers(usersFromServer);
            console.log(`[SI] ⬇️  PRIORITY hydraté users : ${usersFromServer.length} comptes du serveur`);
          }
        } catch (e) {
          console.warn('[SI] Hydratation prioritaire users échouée:', e.message);
        }

        // FIX v155 — Hydration timeout: prevent page blocking on slow network
        // If hydration takes > 15s, unblock the page anyway. Hydration continues in background.
        const hydrationPromise = Promise.all(HYDRATE_MAP.map(async ({ key, setters, fallback }) => {
          try {
            // null = clé absente (404), valeur réelle = clé présente (même si [])
            const serverVal = await dsGet(key, null);

            if (serverVal !== null) {
              // ══ CAS A : clé présente sur le serveur ══
              // Comparaison timestamps — tous deux en millisecondes depuis la correction dsGet.
              // __ts__:key  = timestamp dernière écriture locale confirmée par serveur (ms)
              // __svts__:key = timestamp serveur lors du dernier dsGet (ms, converti depuis secondes Unix)
              const localWriteTs  = parseInt(_lsGet('__ts__:' + key) || '0');
              const serverKnownTs = parseInt(_lsGet('__svts__:' + key) || '0');
              // Règles de priorité (tous en ms après migration v3) :
              // 1. localWriteTs=0 → jamais écrit localement → serveur gagne toujours
              // 2. serverKnownTs=0 → jamais récupéré du serveur → serveur gagne (nouvelle machine)
              // 3. Serveur a plus d'entrées → serveur gagne (données agrégées multi-postes)
              // 4. serverKnownTs >= localWriteTs → serveur plus récent → serveur gagne
              // Sinon → local plus récent avec au moins autant d'entrées → push local vers serveur
            const localVal    = lsLoad(key, fallback);
              const localCount  = Array.isArray(localVal)  ? localVal.length  : 0;
              const serverCount = Array.isArray(serverVal) ? serverVal.length : 0;
              const serverHasMore = Array.isArray(serverVal) && serverCount > localCount;
              // [T-03 FIX] Pour les clés MERGE_ALWAYS_KEYS (données métier : taches, rdvs,
              // dossiers, partners, documents…), le serveur est TOUJOURS la source de vérité
              // au démarrage. La logique "local plus récent → push vers serveur" était la cause
              // directe du symptôme "Sync & Intégrité fonctionne mais les données disparaissent
              // au refresh" : un poste qui avait encore d'anciennes données dans son localStorage
              // (avec des items depuis supprimés sur les autres postes) les renvoyait vers le
              // serveur via ce push — écrasant la purge correcte effectuée par Sync & Intégrité.
              // Pour ces clés, on prend TOUJOURS le serveur. Si des items ont été créés offline,
              // le flush de la file hors-ligne (géré séparément par flushOfflineQueue) les
              // intégrera via le merge serveur, avec filtrage tombstone automatique.
              const isMergeCritical = ['taches','rdvs','dossiers','partners','gc-taches','gc-rdvs',
                'gc-dossiers','gc-partners','gc-dossier-files','gc-files','gc-docs-unified',
                'gc-standalone-docs','gc-messages','gc-notifications'].includes(key);
              const serverIsNewer = isMergeCritical
                ? true   // serveur fait toujours autorité pour les données métier
                : (localWriteTs === 0 || serverKnownTs === 0 || serverHasMore || serverKnownTs >= localWriteTs);

              if (serverIsNewer) {
                lsSave(key, serverVal);
                setters.forEach(fn => fn(serverVal));
                const n = Array.isArray(serverVal) ? `${serverVal.length} entrées` : 'objet';
                console.log(`[SI] ⬇️  Hydraté depuis serveur : ${key} (${n})`);
              } else {
                // Local confirmé plus récent et au moins autant d'entrées → push vers serveur
                if (localVal !== null && localVal !== undefined) {
                  setters.forEach(fn => fn(localVal));
                  dsSave(key, localVal).catch(() => {});
                  console.log(`[SI] ⬆️  Local plus récent — push vers serveur : ${key}`);
                } else {
                  lsSave(key, serverVal);
                  setters.forEach(fn => fn(serverVal));
                  console.log(`[SI] ⬇️  Fallback serveur (local vide) : ${key}`);
                }
              }

            } else if (key === 'users') {
              // ══ CAS B : clé ABSENTE du serveur, mais 'gc-users' existe ══
              // Récupérer les comptes auth et reconstruire la table users.
              const gcUsers = await dsGet('gc-users', null);
              if (Array.isArray(gcUsers) && gcUsers.length > 0) {
                const recoveredUsers = gcUsers.map(u => ({
                  id:            u.id,
                  alias:         u.username || u.alias || u.id,
                  name:          u.name || u.username || u.alias || u.id,
                  email:         u.email || '',
                  role:          u.role || 'Collaborateur',
                  level:         u.level ?? 1,
                  accountStatus: u.accountStatus || 'ACTIF',
                  passwordHash:  u.passwordHash || '',
                  isAdmin:       u.isAdmin || false,
                  isMG:          u.isMG || false,
                  process:       u.process || '',
                  processes:     u.processes || [],
                }));
                lsSave(key, recoveredUsers);
                setters.forEach(fn => fn(recoveredUsers));
                console.log(`[SI] ⬇️  Hydraté users depuis gc-users (${recoveredUsers.length} comptes)`);
                return;
              }
              // ══ CAS B général : clé ABSENTE du serveur (premier lancement ever) ══
              const localVal = lsLoad(key, null); // null si absent du LS aussi
              const hasCustom = Array.isArray(localVal)
                && localVal.length > 0
                && JSON.stringify(localVal) !== JSON.stringify(fallback);

              if (hasCustom) {
                // B1 — Migration : local a des données custom → initialiser le serveur
                await dsSave(key, localVal);
                console.log(`[SI] ⬆️  Migration → serveur : ${key} (${localVal.length} entrées)`);
              } else {
                // B2 — Local vide ou par défaut → ne rien pousser.
                // Les vraies données arriveront via les actions utilisateur.
                console.log(`[SI] ⏭️  ${key} : absent du serveur, local vide/défaut — en attente`);
              }
            } else {
              // ══ CAS B : clé ABSENTE du serveur (premier lancement ever) ══
              const localVal = lsLoad(key, null); // null si absent du LS aussi
              const hasCustom = Array.isArray(localVal)
                && localVal.length > 0
                && JSON.stringify(localVal) !== JSON.stringify(fallback);

              if (hasCustom) {
                // B1 — Migration : local a des données custom → initialiser le serveur
                await dsSave(key, localVal);
                console.log(`[SI] ⬆️  Migration → serveur : ${key} (${localVal.length} entrées)`);
              } else {
                // B2 — Local vide ou par défaut → ne rien pousser.
                // Les vraies données arriveront via les actions utilisateur.
                console.log(`[SI] ⏭️  ${key} : absent du serveur, local vide/défaut — en attente`);
              }
            }
          } catch(e) {
            console.warn(`[SI] Hydratation ${key}:`, e.message);
          }
        }));

        // FIX v155 — Race between hydration (up to 20s per key) and timeout (15s max)
        // If hydration completes first: UI shows immediately with all data
        // If timeout fires first: UI shows immediately, hydration continues in background
        const hydrationTimeout = new Promise((resolve) => {
          const timer = setTimeout(() => {
            console.log('[SI] ⏱️  Hydratation timeout: UI déverrouillée après 15s (données locales appliquées)');
            resolve();
          }, 15_000);
          hydrationPromise.then(() => { clearTimeout(timer); resolve(); });
        });

        hydrationTimeout.then(() => {
          setHydrating(false);          // FIX v136 — débloquer le login maintenant que users est prêt
          console.log('[SI] ✅ UI déverrouillée — hydratation finalisée ou timeout (hydration continue en BG)');
        });

        // 2. Démarrer la sync périodique bidirectionnelle (polling WS de secours)
        // ✅ CRITICAL FIX: Store cleanup function to avoid polling interval leak
        _dsStopSync = dsStartSync();
      } else {
        setHydrating(false); // FIX v136 — mode hors-ligne : débloquer login immédiatement avec données locales
        console.log('[SI] ⚠️ Mode hors-ligne — données locales uniquement (sync auto à la reconnexion)');
      }
    }).catch(e => { setHydrating(false); console.warn('[SI] Sync datastore:', e.message); });

    // 3. Migration fichiers localStorage → IndexedDB
    gcMigrateFilesFromLS().then(result => {
      if (result?.migrated > 0) {
        console.log(`[SI] ${result.migrated} fichiers migrés vers IndexedDB`);
      }
    }).catch(e => console.warn('[SI] Migration fichiers:', e.message));
  
    // Sync fichiers IDB non synchros vers serveur (si retour en ligne)
    gcSyncFilesToServer().then(r => {
      if (r?.synced > 0) console.log('[AppRoot] Fichiers synchros serveur:', r.synced);
    });
    // ✅ CRITICAL FIX: Cleanup on unmount
    return () => { if (_dsStopSync) _dsStopSync(); };
  }, []); // mount-only — dsInitSync + gcMigrateFilesFromLS s'exécutent une seule fois


  // ── Sync multi-utilisateurs : écouter les mises à jour serveur ─────────
  // FIX: Replace storage events with dsOnSync for cross-machine sync
  useEffect(() => {
    const unsub = dsOnSync((event) => {
      if (!event.key) return;
      const { key } = event;
      // FIX v129 — keyMap exhaustif : couvre les clés préfixées (modules) ET
      // non-préfixées (AppRoot). Chaque entrée pointe vers la clé canonique du switch.
      const keyMap = {
        // Clés préfixées → clé canonique courte
        'gc-users':                     'gc-users',
        'gc-dossiers':                  'dossiers',
        'gc-taches':                    'taches',
        'gc-rdvs':                      'rdvs',
        'gc-pending-delete-approvals':  'pendingApprovals',
        'gc-partners':                  'partners',
        'gc-si-appearance':             'siAppearance',
        'gc-si-logo-url':               'siLogoUrl',
        'gc-si-css-overrides':          'siCSSOverrides',
        // FIX v130 — bare keys saved directly by AppRoot/context (sans préfixe gc-si-)
        'siAppearance':                 'siAppearance',
        'siLogoUrl':                    'siLogoUrl',
        'siCSSOverrides':               'siCSSOverrides',
        'gc-session-logs':              'gc-session-logs',
        'gc-pending-connections':       'gc-pending-connections',
        'gc-require-conn-approval':     'gc-require-conn-approval',
        // FIX v129 — clés manquantes
        'gc-account-actions':           'gc-account-actions',
        'gc-pending-approvals':         'pendingApprovals',
        'gc-standalone-docs':           'standaloneDocuments',
        'standaloneDocuments':          'standaloneDocuments',
        'pendingApprovals':             'pendingApprovals', // clé directe (AppRoot)
        // FIX v142 — habilitations et codes d'accès applicatifs
        'gc-app-habilitations':         'gc-app-habilitations',
        'gc-app-access-codes':          'gc-app-access-codes',
        // FIX v154 — clés docs et config processus pour sync inter-machines
        'gc-si-docs':                   'gc-si-docs',
        'gc-docs-unified':              'gc-si-docs',
        'gc-process-config':            'gc-process-config',
      };
      const stateKey = keyMap[key] || key;
      const moduleAlerts = {
        'gc-audit-checklist': 'Check-list d\'audit',
        'gc-conffull-approvals': 'Approbations conformité',
        'gc-conffull-checks': 'Contrôles conformité',
        'gc-system-msgs': 'Messages système',
        'gc-system-alerts': 'Alertes système',
        'gc-notifications': 'Notifications',
        'gc-docs-unified': 'Documents unifiés',
        'gc-dossier-files': 'Pièces jointes dossiers',
        'gc-external-docs': 'Documents externes',
        'gc-internal-docs': 'Documents internes',
        'gc-journal': 'Journal comptable',
        'gc-budget': 'Budgets',
        'gc-factures': 'Factures',
        'gc-process-config': 'Configuration processus',
        'gc-security-alerts': 'Alertes sécurité',
      };
      try {
        if (currentUser?.id && moduleAlerts[key] && ['set','item_delete','delete'].includes(event.action) && event.by !== currentUser.id) {
          gcPushNotif(currentUser.id, {
            id: `N${Date.now()}${currentUser.id}`,
            icon: '🔔',
            message: `${moduleAlerts[key]} mis à jour sur un autre poste`,
            at: new Date().toISOString(),
            read: false,
            module: 'system',
          });
        }
        // [FIX v153] Les données devraient être fraîches après l'auto-refresh
        async function refreshServerValue(key, applyFn, fallback) {
          try {
            const serverVal = await dsGet(key, fallback);
            if (serverVal !== null) {
              applyFn(serverVal);
            } else {
              applyFn(lsLoad(key, fallback));
            }
          } catch (_) {
            applyFn(lsLoad(key, fallback));
          }
        }

        async function refreshUsersFromServer() {
          try {
            let serverVal = await dsGet('users', null);
            if (serverVal === null) {
              const gcUsers = await dsGet('gc-users', null);
              if (Array.isArray(gcUsers)) {
                const recoveredUsers = gcUsers.map(u => ({
                  id:            u.id,
                  alias:         u.username || u.alias || u.id,
                  name:          u.name || u.username || u.alias || u.id,
                  email:         u.email || '',
                  role:          u.role || 'Collaborateur',
                  level:         u.level ?? 1,
                  accountStatus: u.accountStatus || 'ACTIF',
                  passwordHash:  u.passwordHash || '',
                  isAdmin:       u.isAdmin || false,
                  isMG:          u.isMG || false,
                  process:       u.process || '',
                  processes:     u.processes || [],
                }));
                serverVal = recoveredUsers;
                lsSave('users', recoveredUsers);
                console.log(`[SI] ⬇️  Récupération users depuis gc-users (${recoveredUsers.length} comptes)`);
              }
            }
            if (serverVal !== null) {
              setUsersState(serverVal);
              setProdUsers(serverVal);
            }
          } catch (_) {}
        }

        switch(stateKey) {
          case 'users':
          case 'gc-users':
            refreshUsersFromServer();
            break;
          case 'dossiers':
            refreshServerValue('dossiers', (val) => {
              setDossiersState(val);
              setProdDossiers(val);
            }, INITIAL_DOSSIERS);
            break;
          case 'taches':
            refreshServerValue('taches', (val) => {
              setTachesState(val);
              setProdTaches(val);
            }, INITIAL_TACHES);
            break;
          case 'rdvs':
            refreshServerValue('rdvs', (val) => {
              setRdvsState(val);
              setProdRdvs(val);
            }, INITIAL_RDVS);
            break;
          case 'pendingApprovals':
            refreshServerValue('pendingApprovals', (val) => {
              setPendingApprovalsState(val);
              setProdPending(val);
            }, INITIAL_PENDING);
            break;
          case 'partners':
            refreshServerValue('partners', (val) => {
              setPartnersStateRaw(val);
              setProdPartners(val);
            }, INITIAL_PARTNERS);
            break;
          case 'siAppearance':
            refreshServerValue('siAppearance', setSiAppearanceState, null);
            break;
          case 'siLogoUrl':
            refreshServerValue('siLogoUrl', setSiLogoUrlState, null);
            break;
          case 'siCSSOverrides':
            refreshServerValue('siCSSOverrides', setSiCSSOverridesState, null);
            break;
          case 'gc-session-logs':
            refreshServerValue('gc-session-logs', setSessionLogs, []);
            break;
          case 'gc-pending-connections':
            refreshServerValue('gc-pending-connections', setPendingConnectionsState, []);
            break;
          case 'gc-require-conn-approval':
            refreshServerValue('gc-require-conn-approval', setRequireConnApprovalState, false);
            break;
          // FIX v142 — habilitations/codes accès cross-machine
          case 'gc-app-habilitations': {
            refreshServerValue('gc-app-habilitations', (val) => {
              setAppHabilitations(val);
              try { _lsSet('gc-app-habilitations', JSON.stringify(val)); } catch (_) {}
            }, []);
            break;
          }
          case 'gc-app-access-codes': {
            refreshServerValue('gc-app-access-codes', (val) => {
              setAppAccessCodes(val);
              try { _lsSet('gc-app-access-codes', JSON.stringify(val)); } catch (_) {}
            }, []);
            break;
          }
          case 'standaloneDocuments': {
            dsGet('gc-standalone-docs', []).then(val => {
              window.dispatchEvent(new CustomEvent('gc:sync-standalone-docs', { detail: Array.isArray(val) ? val : [] }));
            }).catch(() => {
              window.dispatchEvent(new CustomEvent('gc:sync-standalone-docs', { detail: lsLoad('gc-standalone-docs', []) }));
            });
            break;
          }
          // FIX v154 — sync documents (gc-si-docs / gc-docs-unified) et config processus
          case 'gc-si-docs': {
            refreshServerValue('gc-si-docs', (val) => {
              if (Array.isArray(val)) {
                setSiSystemDocs(val);
                try { _lsSet('gc-si-docs', JSON.stringify(val)); } catch (_) {}
              }
            }, []);
            break;
          }
          case 'gc-process-config': {
            refreshServerValue('gc-process-config', (val) => {
              if (val && typeof val === 'object' && !Array.isArray(val)) {
                try { _lsSet('gc-process-config', JSON.stringify(val)); } catch (_) {}
                window.dispatchEvent(new CustomEvent('gc:sync-process-config', { detail: val }));
              }
            }, {});
            break;
          }
          case 'gc-widget-alarms': {
            refreshServerValue('gc-widget-alarms', (val) => {
              try { _lsSet('gc-widget-alarms', JSON.stringify(val)); } catch (_) {}
            }, []);
            break;
          }
          // FIX v156 — Clés Finance / Audit / Logistique : écriture LS + CustomEvent
          // BureauOffice n'a pas de state React dans AppRoot, on passe par LS + event custom.
          case 'gc-journal': case 'gc-budget': case 'gc-factures': case 'gc-stocks':
          case 'gc-risks': case 'gc-audit-checklist': case 'gc-audit-prog': case 'gc-tpa':
          case 'gc-achats': case 'gc-logmod-stocks': case 'gc-inventaires': {
            refreshServerValue(stateKey, (val) => {
              try { _lsSet(stateKey, JSON.stringify(val)); } catch (_) {}
              window.dispatchEvent(new CustomEvent('gc:data-sync', { detail: { key: stateKey, value: val } }));
            }, []);
            break;
          }
          // FIX v129 — Actions comptes (suspensions, réactivations, créations par DG/Admin)
          case 'gc-account-actions': {
            refreshServerValue('gc-account-actions', (val) => {
              setPendingAccountActions(val);
              try { _lsSet('gc-account-actions', JSON.stringify(val)); } catch (_) {}
            }, []);
            break;
          }
          // FIX v156 — Signal de réinitialisation totale émis par DG/Admin.
          // Force un rechargement complet sur toutes les machines connectées.
          case 'gc-factory-reset-signal': {
            // Ne pas recharger la machine qui a initié le reset (elle se déconnecte elle-même)
            if (key === 'gc-factory-reset-signal' && event?.by !== (currentUser?.id)) {
              try {
                // Vider tous les caches localStorage gc-* avant rechargement
                Object.keys(localStorage)
                  .filter(k => k.startsWith('gc-') || k.startsWith('GC_SI'))
                  .forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
              } catch (_) {}
              window.location.reload();
            }
            break;
          }
          // FIX v156 — Tombstones cross-machine : quand gc-tombstones est mis à jour
          // (suppression depuis une autre machine), forcer le re-fetch des clés concernées
          case 'gc-tombstones': {
            import('./core/datastore.js').then(({ dsGet }) => {
              dsGet('gc-tombstones', {}).then(tbs => {
                if (tbs && typeof tbs === 'object') {
                  try { _lsSet('gc-tombstones', JSON.stringify(tbs)); } catch (_) {}
                  window.dispatchEvent(new CustomEvent('gc:tombstones-updated', { detail: tbs }));
                }
              }).catch(() => {});
            }).catch(() => {});
            break;
          }
          default: break;
        }
      } catch (_) {}
    });
    return unsub;
  }, []);

  // ── Surveillance mémoire localStorage ──────────────────────
  useEffect(() => {
    const checkStorage = () => {
      gcFileStats().then(stats => {
        if (stats.localStorage.percentUsed > 85) {
          console.warn(`[SI] localStorage à ${stats.localStorage.percentUsed}% — nettoyage recommandé`);
        }
      }).catch(e => console.warn('[SI] gcFileStats:', e.message));
    };
    checkStorage();
    const interval = setInterval(checkStorage, 5 * 60 * 1000); // toutes les 5 min
    return () => clearInterval(interval);
  }, []);

  // FIX SYNC-S1 — Session expirée : déconnexion automatique propre
  useEffect(() => {
    let _lastSessionAlert = 0;
    const onSessionExpired = () => {
      const now = Date.now();
      // Éviter les alertes en boucle (throttle 60s)
      if (now - _lastSessionAlert < 60_000) return;
      _lastSessionAlert = now;
      console.warn('[SI] Session JWT expirée — déconnexion automatique');
      // Notifier l'utilisateur avec un toast si disponible, puis déconnecter
      try {
        import('./components/ToastManager.jsx').then(({ gcToast }) => {
          gcToast && gcToast.warning && gcToast.warning('Session expirée — reconnexion requise');
        }).catch(() => {});
      } catch {}
      // Délai 2s pour que le toast soit visible avant déconnexion
      setTimeout(() => {
        try {
          // Nettoyer le token local ET la session active, puis recharger la page (retour au login)
          // [FIX CRITIQUE] 'gc-active-session' DOIT être effacé ici : sa validation
          // (gcValidateSessionToken) est purement locale (salt fixe, 12h), indépendante du JWT
          // serveur. Sans cette ligne, l'app rebootait après reload directement sur l'écran
          // principal (gc-active-session jugé "valide" localement) avec un token serveur
          // toujours absent → nouvel échec réseau → nouveau gc-session-expired → boucle de
          // reload infinie (écran qui scintille, travail perdu/interrompu en continu).
          ['gc-jwt-token', 'authToken', 'token', 'gc-current-user', 'gc-active-session'].forEach(k => {
            try { localStorage.removeItem(k); } catch {}
          });
          window.location.reload();
        } catch {}
      }, 2000);
    };

    // FIX SYNC-Q1 — File offline surchargée : avertissement toast
    const onQueueOverflow = (e) => {
      const { reason, dropped } = e?.detail || {};
      console.warn(`[SI] File offline surchargée : ${dropped || 0} modifications ignorées (${reason || ''})`);
      try {
        import('./components/ToastManager.jsx').then(({ gcToast }) => {
          if (gcToast?.warning) gcToast.warning(`Hors ligne : ${dropped || 0} modifications anciennes perdues (limite dépassée). Reconnectez-vous pour resynchroniser.`);
        }).catch(() => {});
      } catch {}
    };

    // DISK-MON : Alerte espace disque serveur (broadcast WebSocket depuis le serveur)
    const onDiskAlert = (e) => {
      const { level, pct, message } = e?.detail || e || {};
      console.warn(`[SI] Alerte disque serveur : ${pct}% (${level})`);
      try {
        import('./components/ToastManager.jsx').then(({ gcToast }) => {
          if (!gcToast) return;
          const fn = level === 'critical' ? gcToast.error : gcToast.warning;
          if (fn) fn(message || `Espace disque serveur à ${pct}%`);
        }).catch(() => {});
      } catch {}
    };
    // Écouter l'event WebSocket disk_alert relayé depuis datastore via CustomEvent
    window.addEventListener('gc-disk-alert', onDiskAlert);

    // Resync global admin : re-hydrater toutes les clés React depuis le serveur
    const onResyncAll = async () => {
      console.log('[AppRoot] gc-resync-all reçu — re-hydratation complète');
      try {
        const { dsGet } = await import('./core/datastore.js');
        const criticalSetters = [
          { key: 'users',              fn: (v) => { if (Array.isArray(v) && v.length) { setUsersState(v); setProdUsers(v); } } },
          { key: 'dossiers',           fn: (v) => { if (Array.isArray(v)) setDossiers(v); } },
          { key: 'taches',             fn: (v) => { if (Array.isArray(v)) setTaches(v); } },
          { key: 'rdvs',               fn: (v) => { if (Array.isArray(v)) setRdvs(v); } },
          { key: 'partners',           fn: (v) => { if (Array.isArray(v)) setPartnersStateRaw(v); } },
          { key: 'gc-app-habilitations', fn: (v) => { if (Array.isArray(v)) setAppHabilitations(v); } },
        ];
        await Promise.allSettled(criticalSetters.map(async ({ key, fn }) => {
          try {
            const val = await dsGet(key, null);
            if (val !== null && val !== undefined) { lsSave(key, val); fn(val); }
          } catch {}
        }));
      } catch {}
    };
    window.addEventListener('gc-resync-all', onResyncAll);

    window.addEventListener('gc-session-expired', onSessionExpired);
    window.addEventListener('gc-offline-queue-overflow', onQueueOverflow);
    return () => {
      window.removeEventListener('gc-session-expired', onSessionExpired);
      window.removeEventListener('gc-offline-queue-overflow', onQueueOverflow);
      window.removeEventListener('gc-disk-alert', onDiskAlert);
      window.removeEventListener('gc-resync-all', onResyncAll);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { isDemoModeRef.current = isDemoMode; }, [isDemoMode]);

  // FIX v63 C2  -  Chargement async sécurisé des clés chiffrées au boot.
  // FIX BUG-B9 — Si l'hydratation serveur est en cours (hydrating=true), on saute
  // le chargement async chiffré pour éviter le flash visuel (données non-chiffrées
  // brutes → données déchiffrées → données serveur en 3 frames différents).
  // L'hydratation serveur fournit la source de vérité ; lsLoadSecure n'est utile
  // qu'en mode offline pur (pas de connexion serveur).
  useEffect(() => {
    if (hydrating) return; // attendre la fin de l'hydratation serveur
    (async () => {
      try {
        const [secUsers, secDossiers, secTaches, secLogs] = await Promise.all([
          lsLoadSecure("users", null),
          lsLoadSecure("dossiers", null),
          lsLoadSecure("taches", null),
          lsLoadSecure("session-logs", null),
        ]);
        // Ne remplacer le state QUE si le state actuel est vide/par défaut
        // (pour ne pas écraser les données serveur fraîchement hydratées).
        if (secUsers !== null && (!users || users === INITIAL_USERS || users.length === 0)) {
          setProdUsers(secUsers); setUsersState(secUsers);
        }
        if (secDossiers !== null && (!dossiers || dossiers.length === 0)) {
          setProdDossiers(secDossiers); setDossiersState(secDossiers);
        }
        if (secTaches !== null && (!taches || taches.length === 0)) {
          setProdTaches(secTaches); setTachesState(secTaches);
        }
        if (secLogs !== null && (!sessionLogs || sessionLogs.length === 0)) setSessionLogs(secLogs);
      } catch (_) {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrating]);

  const setUsers = useCallback((v) => {
    setUsersState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdUsers(resolved); dsSave("users", resolved); }
      return resolved;
    });
  }, []);

  // FIX v123 — Migration mots de passe : hache tous les comptes avec 'password' en clair.
  // Inclut USR-ADM-000 et USR-DG-001 dont INITIAL_USERS utilise désormais 'password'.
  // Si un compte a déjà un passwordHash valide (64 hex chars), il n'est pas re-haché.
  //
  // 🔴 FIX v140 — GUARD D'HYDRATATION (correctif bug critique perte de données) :
  // Ce useEffect s'exécutait au montage AVANT que dsInitSync() ait reçu les données du
  // serveur. Sur un poste frais, lsLoad("users") retournait INITIAL_USERS (2 comptes).
  // La migration détectait password/!passwordHash → setUsers([2 users]) → dsSave écrasait
  // les N comptes réels du serveur. Fix : bloquer la migration jusqu'à la fin d'hydratation.
  React.useEffect(() => {
    if (hydrating) return; // 🛡️ GUARD : attendre la fin de l'hydratation serveur
    (async () => {
      try {
        // Garde critique : sur un poste neuf sans snapshot local "users",
        // ne jamais lancer de migration qui pourrait pousser INITIAL_USERS au serveur.
        const hasLocalUsersSnapshot = !!(_lsGet("GC_SI_v12:users") || _lsGet("GC_SI_v11:users"));
        if (!hasLocalUsersSnapshot) return;
        // Après hydratation, lsLoad("users") retourne les vraies données du serveur
        const currentUsers = lsLoad("users", INITIAL_USERS);
        const needsMigration = currentUsers.some(u => u.password && !u.passwordHash);
        if (!needsMigration) return;
        const migrated = await Promise.all(currentUsers.map(async (u) => {
          if (u.password && !u.passwordHash) {
            const hash = await gcHashPassword(u.password);
            const { password: _p, ...rest } = u;
            return { ...rest, passwordHash: hash };
          }
          return u;
        }));
        setUsers(migrated);
        console.info("[SI Génie v140] Migration mots de passe → hash effectuée (post-hydratation)");
      } catch(_) {}
    })();
   
// FIX v140 — Re-exécuté quand hydrating passe à false (données serveur disponibles)
  }, [hydrating]);  

  // FIX v133 — Re-migration contexte crypto : SÉCURISÉE contre l'écrasement de mots de passe personnalisés.
  //
  // PROBLÈME RÉSOLU (bug critique v128/v123) :
  // L'ancienne logique détectait u.passwordHash !== gcHashPassword(defaultPwd) et déclenchait
  // needsRehash=true MÊMME quand l'admin/DG avait changé son mot de passe.
  // Résultat : tout mot de passe personnalisé était réinitialisé au mot de passe par défaut à chaque
  // redémarrage, propagé au serveur via dsSave → bug critique affectant tous les postes.
  //
  // LOGIQUE CORRECTE v133 :
  //  1. Credentials manquants (ni password ni passwordHash) → restaurer le mot de passe par défaut.
  //  2. Contexte crypto changé → re-hacher UNIQUEMENT si le hash stocké est un hash CONNU du mot de
  //     passe par défaut (calculé via SHA-256 OU fallback). Si le hash ne correspond à AUCUN des deux
  //     algorithmes appliqués au mot de passe par défaut → l'utilisateur a changé son mot de passe
  //     → NE PAS toucher (préserver). gcVerifyPassword est aussi corrigé (cross-context v133).
  //
  // 🔴 FIX v140 — GUARD D'HYDRATATION (même raison que v123 ci-dessus) :
  // Sans ce guard, un poste frais lisant lsLoad("users") = INITIAL_USERS (sans passwordHash)
  // détecte missingCreds pour USR-ADM-000/USR-DG-001 → needsRehash=true → setUsers([2 users])
  // → dsSave écrase le serveur. Bloqué jusqu'à hydrating=false.
  React.useEffect(() => {
    if (hydrating) return; // 🛡️ GUARD : attendre la fin de l'hydratation serveur
    (async () => {
      try {
        // Même garde critique que ci-dessus : ne pas "réparer" des comptes
        // par défaut sur un poste neuf sans base locale fiable.
        const hasLocalUsersSnapshot = !!(_lsGet("GC_SI_v12:users") || _lsGet("GC_SI_v11:users"));
        if (!hasLocalUsersSnapshot) return;
        const defaultPwds = { "USR-ADM-000": "Admin@SI#2026!", "USR-DG-001": "DG@GenieSI#2026!" };
        const currentUsers = lsLoad("users", INITIAL_USERS);

        // Helper fallback hash (sans passer par gcHashPassword)
        const _fallbackHash = (pwd) => {
          const s = pwd + "GC_SALT_2026_GABON";
          let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
          for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
            h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
          }
          const part = (n) => (n >>> 0).toString(16).padStart(8, "0");
          const base = part(h1) + part(h2) + part(h1 ^ h2) + part((h1 + h2) >>> 0);
          return (base + base)?.slice(0, 64);
        };
        const _sha256Hash = async (pwd) => {
          try {
            if (typeof window !== "undefined" && window.crypto?.subtle) {
              const enc = new TextEncoder();
              const buf = await window.crypto.subtle.digest("SHA-256", enc.encode(pwd + "GC_SALT_2026_GABON"));
              return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
            }
          } catch (_) {}
          return null;
        };

        // Cas 1 : compte par défaut sans AUCUN credential → restaurer
        const missingCreds = currentUsers.filter(u => defaultPwds[u.id] && !u.password && !u.passwordHash);
        // Cas 2 : compte par défaut avec un hash → vérifier si c'est un hash de contexte différent
        const defaultUsers  = currentUsers.filter(u => defaultPwds[u.id] && u.passwordHash);

        let needsRehash = missingCreds.length > 0;
        const rehashSet = new Set(missingCreds.map(u => u.id)); // seuls ces comptes seront re-hachés

        // FIX BUG-B2 — Boucle de re-hashage des hash "par défaut" DÉSACTIVÉE.
        // Pourquoi : la détection isDefaultHash basée sur _fallbackHash / _sha256Hash peut
        // produire des faux positifs (collisions de hash, contextes crypto multiples),
        // ce qui réinitialise des mots de passe personnalisés et les propage au serveur.
        // gcVerifyPassword (helpers.js) gère déjà la vérification cross-context sans avoir
        // besoin de re-hacher au démarrage. On garde uniquement le cas "missingCreds"
        // (compte par défaut sans aucun credential → restauration nécessaire).
        //
        // Les variables _fallbackHash et _sha256Hash ci-dessus sont conservées car
        // potentiellement utilisées ailleurs par gcVerifyPassword.
        void _fallbackHash; void _sha256Hash; void defaultUsers;

        if (!needsRehash) return;

        const reHashed = await Promise.all(currentUsers.map(async (u) => {
          if (rehashSet.has(u.id) && defaultPwds[u.id]) {
            // Re-hacher UNIQUEMENT les comptes identifiés (hash par défaut ou sans credentials)
            const hash = await gcHashPassword(defaultPwds[u.id]);
            return { ...u, passwordHash: hash, password: undefined };
          }
          return u; // Tous les autres (mots de passe personnalisés) → intacts
        }));
        setUsers(reHashed);
        console.info(`[SI Génie v140] Re-migration contexte crypto — ${rehashSet.size} compte(s) re-haché(s) (mots de passe personnalisés préservés)`);
      } catch (_) {}
    })();

// FIX v140 — Re-exécuté quand hydrating passe à false (données serveur disponibles)
  }, [hydrating]);  

  // FIX v123 — Sync currentUser quand passwordHash change (ex: changement via profil)
  React.useEffect(() => {
    if (currentUser && !isDemoMode) {
      const updated = users.find(u => u.id === currentUser.id);
      if (updated && (
        updated.passwordHash !== currentUser.passwordHash ||
        updated.passwordHistory !== currentUser.passwordHistory
      )) {
        const { password: _p, ...safeUpdated } = updated;
        setCurrentUserState(prev => ({
          ...prev,
          passwordHash: safeUpdated.passwordHash,
          passwordHistory: safeUpdated.passwordHistory,
        }));
      }
    }
   
  }, [users]);

  const setDossiers = useCallback((v) => {
    setDossiersState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdDossiers(resolved); dsSave("dossiers", resolved); }
      return resolved;
    });
  }, []);
  const setTaches = useCallback((v) => {
    setTachesState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdTaches(resolved); dsSave("taches", resolved); }
      return resolved;
    });
  }, []);

  // ── Progression automatique des dossiers selon les tâches liées ───────────
  // Déclaré ICI — après setDossiers et setTaches (évite la TDZ const)
  // Quand les tâches changent de statut, recalcule le % d'avancement du dossier lié
  useEffect(() => {
    if (!taches?.length || !dossiers?.length) return;
    let hasChanges = false;
    const updated = dossiers.map(d => {
      if (["TERMINE","ARCHIVE","ANNULE"].includes(d.status)) return d;
      const linked = taches.filter(t => t.dossier === d.id);
      if (linked.length === 0) return d; // pas de tâches liées → pas de calcul auto
      const terminées = linked.filter(t => t.status === "TERMINÉ" || t.status === "TERMINE");
      const autoProgress = Math.round((terminées.length / linked.length) * 100);
      // Seulement mettre à jour si la différence ≥ 5% (évite les micro-updates)
      if (Math.abs((d.progress || 0) - autoProgress) >= 5) {
        hasChanges = true;
        return { ...d, progress: autoProgress, progressAuto: true, progressUpdatedAt: new Date().toISOString() };
      }
      return d;
    });
    if (hasChanges) setDossiers(updated);
   
// INTENTIONNEL : surveiller les tâches uniquement
  }, [taches]);
  const setRdvs = useCallback((v) => {
    setRdvsState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdRdvs(resolved); dsSave("rdvs", resolved); }
      return resolved;
    });
  }, []);
  const setPendingApprovals = useCallback((v) => {
    setPendingApprovalsState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { 
        setProdPending(resolved); 
        dsSave("gc-pending-approvals", resolved); 
        dsSave("pendingApprovals", resolved);
      }
      return resolved;
    });
  }, []);

  const [partnersState, setPartnersStateRaw] = useState(() => lsLoad("partners", INITIAL_PARTNERS));
  const setPartnersGlobal = useCallback((v) => {
    setPartnersStateRaw(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdPartners(resolved); dsSave("partners", resolved); }
      return resolved;
    });
  }, []);

  const [appHabilitations, setAppHabilitations] = useState(() => {
    try { return JSON.parse(_lsGet("gc-app-habilitations")||"[]"); } catch (_) { return []; }
  });
  const saveAppHabilitations = useCallback((v) => {
    setAppHabilitations(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      try { _lsSet("gc-app-habilitations", JSON.stringify(resolved)); } catch (_) {}
      // FIX v142 — Sync cross-machine : habilitations applicatives
      dsSave("gc-app-habilitations", resolved).catch(() => {});
      return resolved;
    });
  }, []);

  const [appAccessCodes, setAppAccessCodes] = useState(() => {
    try { return JSON.parse(_lsGet("gc-app-access-codes")||"[]"); } catch (_) { return []; }
  });
  const saveAppAccessCodes = useCallback((v) => {
    setAppAccessCodes(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      try { _lsSet("gc-app-access-codes", JSON.stringify(resolved)); } catch (_) {}
      // FIX v142 — Sync cross-machine : codes d'accès applicatifs
      dsSave("gc-app-access-codes", resolved).catch(() => {});
      return resolved;
    });
  }, []);

  useEffect(() => { lsSave("theme", themeMode); }, [themeMode]);

  // FIX BUG-B7 — Sauvegarder sur les 2 clés (siLogoUrl + gc-si-logo-url) pour
  // garantir la propagation entre machines quelle que soit la clé d'écoute.
  const setSiLogoUrl = useCallback((v) => {
    setSiLogoUrlState(v);
    dsSave("siLogoUrl", v);
    dsSave("gc-si-logo-url", v);
  }, []);
  const setSiAppearance = useCallback((v) => {
    setSiAppearanceState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      // FIX BUG-B7 — Écrire sur les 2 clés pour propagation cross-machine fiable
      // (certains modules écoutent 'gc-si-appearance', d'autres 'siAppearance').
      dsSave("siAppearance", resolved);
      dsSave("gc-si-appearance", resolved);
      const root = document.documentElement;
      root.style.setProperty('--gc-primary', resolved.primaryColor || '#C41E3A');
      root.style.setProperty('--gc-navy', resolved.navyColor || '#0A1E4A');
      root.style.setProperty('--gc-gold', resolved.goldColor || '#C9A84C');
      root.style.setProperty('--gc-accent', resolved.accentColor || '#3B82F6');
      root.style.setProperty('--gc-font-scale', resolved.fontScale || 1);
      return resolved;
    });
  }, []);
  const setSiCSSOverrides = useCallback((v) => {
    setSiCSSOverridesState(v);
    dsSave("siCSSOverrides", v);
    let el = document.getElementById('gc-css-overrides');
    if (!el) { el = document.createElement('style'); el.id = 'gc-css-overrides'; document.head.appendChild(el); }
    el.textContent = v;
  }, []);

  // BUG FIX #5  -  deps array was empty [] so CSS vars were never updated on appearance changes
  useEffect(() => {
    const app = siAppearance;
    const root = document.documentElement;
    root.style.setProperty('--gc-primary', app.primaryColor || '#C41E3A');
    root.style.setProperty('--gc-navy', app.navyColor || '#0A1E4A');
    root.style.setProperty('--gc-gold', app.goldColor || '#C9A84C');
    root.style.setProperty('--gc-accent', app.accentColor || '#3B82F6');
    root.style.setProperty('--gc-font-scale', app.fontScale || 1);
    if (siCSSOverrides) {
      let el = document.getElementById('gc-css-overrides');
      if (!el) { el = document.createElement('style'); el.id = 'gc-css-overrides'; document.head.appendChild(el); }
      el.textContent = siCSSOverrides;
    }
  }, [siAppearance, siCSSOverrides]);

  const T = THEMES[themeMode];
  const toggleTheme = () => setThemeMode((m) => m === "dark" ? "light" : "dark");

  const isFirstTime = prodUsers.length <= 1;

  // 🔐 addSessionLog  -  IP réelle via gcGetClientIp() (Phase 0 v57)
  const handleLogin = (user) => {
    const status = user.accountStatus || "ACTIF";
    // FIX v132 — Un compte suspendu peut se connecter avec un code d'accès valide.
    // Auth.jsx pose _approvalBypass:true sur le user objet avant d'appeler onLogin.
    // Sans ce flag, AppRoot rebloque le login → le code ne sert à rien.
    const isBypassApproved = !!user._approvalBypass;
    if (!isBypassApproved && (status === "SUSPENDU_PROVISOIRE" || status === "SUSPENDU_DEFINITIF" || status === "BLOQUE")) {
      const cfg = ACCOUNT_STATUS_CONFIG[status] || {};
      const endDateStr = user.suspensionEndDate ? ` jusqu'au ${new Date(user.suspensionEndDate).toLocaleDateString("fr-FR")}` : "";
      addSessionLog("TENTATIVE", user, { status:"FAILED", reason:`Compte ${cfg.label}${endDateStr} — Motif : ${user.suspensionMotif||"Non précisé"}` });
      const suspMsg = `🚫 TENTATIVE COMPTE ${cfg.label?.toUpperCase()||"SUSPENDU"} : ${user.name} (${user.role}) a tenté de se connecter à ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}. Motif suspension : ${user.suspensionMotif||"Non précisé"}`;
      const rhMgUsers = (users||INITIAL_USERS).filter(u=>u.isAdmin||(u.process==="S03"&&u.level>=4)||(u.isMG||u.id==="USR-MG-001")); // BUG FIX #4 — 'usersState' was undefined; correct variable is 'users'
      rhMgUsers.forEach(u=>gcPushNotif(u.id,{id:"N"+Date.now()+u.id,icon:"🚫",message:suspMsg,at:new Date().toISOString(),read:false,module:"sessions"}));
      gcAlert(`🚫 Accès refusé\n\nVotre compte est actuellement : ${cfg.label}${endDateStr}\n\n📋 Motif : ${user.suspensionMotif||"Contactez la direction ou les RH pour plus d'informations."}\n\n🔒 Pour toute contestation, contactez : rh@genie-consultant.com`);
      return;
    }
    const log = addSessionLog("CONNEXION", user, { status: "SUCCESS" });
    // FIX v131 — addSessionLog peut retourner null (mode incognito admin actif).
    // Guard : utiliser un timestamp de fallback pour ne pas crasher sur log.at
    const loginAt = log?.at ?? new Date().toISOString();
    // FIX v132 — Effacer accessCode + _approvalBypass (flags temporaires) + mettre à jour lastLogin
     
    const { _approvalBypass, accessCode: _ac, ...cleanUser } = user;
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, lastLogin: loginAt, accessCode: null } : u));
    // Nettoyer la demande de connexion approuvée dans le LS (anti-replay)
    setPendingConnections(prev => {
      const cleaned = prev.filter(r => r.userId !== user.id);
      return cleaned;
    });
    const updatedUser = { ...cleanUser, lastLogin: loginAt };
    setCurrentUser(updatedUser);
    // 🔐 Session token d'intégrité (v57)  -  plus d'isAdminMode exposé
    const _st = gcGenerateSessionToken(updatedUser.id);
    // ✅ CRITICAL FIX: _gcEncrypt is async - must await the Promise before storing
    const _sessionData = JSON.stringify({ userId: updatedUser.id, screen: "app", sessionToken: _st, loginAt });
    _gcEncrypt(_sessionData).then(encrypted => {
      try { _lsSet("gc-active-session", encrypted); } catch (_) {}
    }).catch(() => {
      try { _lsSet("gc-active-session", _sessionData); } catch (_) {} // fallback si échec crypto
    });
    // FIX vREFRESH — Connexion repart toujours sur le dashboard (pas sur la page d'avant)
    try { sessionStorage.removeItem('gc-active-module'); } catch (_) {}
    setScreen("app");
    // ── Auto-messages contextuels à la connexion ──────────────────────────────
    // FIX v123 — setSystemMsgs n'existe pas dans le scope de App().
    // Les messages sont envoyés via gcPushNotif (cross-user LS) et SIApp les récupère.
    setTimeout(() => {
      const lvl = updatedUser.level || 1;
      if (updatedUser.isFirstLogin) {
        gcPushNotif(updatedUser.id, {
          id: "AUTO-WELCOME-"+updatedUser.id,
          icon: lvl >= 5 ? "👑" : lvl >= 4 ? "🎯" : "🌟",
          message: `Bienvenue ${updatedUser.name?.split(" ")?.slice(-1)[0]||""} ! Votre compte ${updatedUser.role} (Niv.${lvl}) est activé. Complétez votre profil.`,
          at: new Date().toISOString(), read: false, module: "profil",
        });
        gcPushNotif(updatedUser.id, {
          id: "AUTO-SEC-"+updatedUser.id,
          icon: "🔐",
          message: "Sécurité — Changez votre mot de passe par défaut : Profil → Sécurité.",
          at: new Date().toISOString(), read: false, module: "profil",
        });
      }
    }, 800);
  };

  const handleAccessDemo = () => {
    const demoAdmin = DEMO_USERS.find(u => u.id === "USR-ADM-000") || DEMO_USERS[0];
    setIsDemoMode(true);
    setUsersState(DEMO_USERS);
    setDossiersState(DEMO_DOSSIERS);
    setTachesState(DEMO_TACHES);
    setRdvsState(DEMO_RDVS);
    setPendingApprovalsState(DEMO_PENDING);
    setCurrentUser(demoAdmin);
    setIsAdminMode(true);
    setScreen("app");
  };

  const handleExitDemo = () => {
    setIsDemoMode(false);
    setUsersState(prodUsers);
    setDossiersState(prodDossiers);
    setTachesState(prodTaches);
    setRdvsState(prodRdvs);
    setPendingApprovalsState(prodPending);
    setCurrentUser(null);
    setIsAdminMode(false);
    setScreen("cover");
  };

  const handleLogout = () => {
    if (isDemoMode) { handleExitDemo(); return; }
    if (currentUser) addSessionLog("DECONNEXION", currentUser, { status: "MANUAL", reason: "Déconnexion manuelle" });
    try { _lsRm("gc-active-session"); } catch (_) {}
    try { _lsRm("gc-jwt-token"); } catch (_) {}
    // FIX vREFRESH — effacer le module sauvegardé : le prochain login repart sur le dashboard
    try { sessionStorage.removeItem('gc-active-module'); } catch (_) {}
    setCurrentUserState(null);
    setIsAdminMode(false);
    setScreen("cover");
  };

  // FIX BUG-B10 — Revalidation périodique du token de session.
  // Sans cela, un utilisateur reste connecté localement même quand le JWT serveur expire,
  // et toutes ses requêtes API reçoivent silencieusement des 401.
  // On vérifie toutes les 5 minutes : si la session locale est invalide → logout propre.
  useEffect(() => {
    if (!currentUser || isDemoMode) return;
    const checkInterval = setInterval(() => {
      try {
        const saved = _lsGet("gc-active-session");
        if (!saved) {
          // Session disparue → forcer logout
          handleLogout();
          return;
        }
        const parsed = JSON.parse(saved);
        if (parsed?.sessionToken && parsed?.userId) {
          if (!gcValidateSessionToken(parsed.sessionToken, parsed.userId)) {
            console.warn('[SESSION] Token de session expiré, déconnexion automatique');
            handleLogout();
          }
        }
      } catch (_) { /* ignore parse errors */ }
    }, 5 * 60 * 1000); // toutes les 5 minutes
    return () => clearInterval(checkInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, isDemoMode]);

  const handleCreateAccountSubmit = (data) => {
    const fn = USER_FUNCTIONS.find(f => f.value === data.func);
    const applicantName = `${data.prenom} ${data.nom}`.trim();
    // v75 — Anti-redondance : empêcher double soumission pour le même nom + email
    const fingerprint = `${applicantName}::${data.email||data.func}`;
    const arCheck = gcAntiRedondance.checkAndRegister("CREATION_COMPTE", fingerprint, "LOGIN_FORM");
    if (!arCheck.allowed) {
      gcAlert(`⚠️ Une demande de création de compte pour "${applicantName}" est déjà en cours de traitement.\n\nSoumise le : ${new Date(arCheck.existing.at).toLocaleString("fr-FR")}\n\nVeuillez attendre le traitement avant de soumettre à nouveau.`);
      return;
    }
    const newPending = {
      id: `APPRO-${Date.now()}`,
      type: "CREATION_COMPTE",
      applicant: `${data.prenom} ${data.nom}`,
      // FIX v126 — champs requis par SIApp useEffect pour créer le compte
      prenom: data.prenom || "",
      nom: data.nom || "",
      function: data.func,
      functionLabel: fn?.label || data.func,
      processS03: fn?.process || "O01",
      process: fn?.process || "O01",       // alias attendu par SIApp
      processes: [fn?.process || "O01"],   // alias attendu par SIApp
      levelTarget: fn?.level || 2,
      level: fn?.level || 2,               // alias attendu par SIApp
      dept: fn?.dept || "",
      submittedAt: new Date().toISOString(),
      status: "ATTENTE_RH",
      approvals: { rh: null, conformite: null, dg: null },
      generatedId: data.genId,
      alertsSent: 0,
      tel: data.tel || "",
      email: data.email || "",
      adresse: data.adresse || "",
      profil: data.profil || "",
      sexe: data.sexe || "",
      sitMatrimoniale: data.sitMatrimoniale || "",
      situationMatrimoniale: data.sitMatrimoniale || "", // alias attendu par SIApp
      nationalite: data.nationalite || "Gabonaise",
      uploadedDocs: data.uploadedDocs || {},
      source: "LOGIN_DEMANDE",
      notifsSent: { rh: false, conformite: false, dg: false },
    };
    setPendingApprovals((prev) => [...prev, newPending]);
    const creationMsg = `👤 NOUVELLE DEMANDE COMPTE : ${newPending.applicant} — Fonction : ${newPending.functionLabel||newPending.function}. Processus d'approbation démarré.`;
    const rhMgArr = (users||INITIAL_USERS).filter(u=>u.isAdmin||(u.process==="S03"&&u.level>=4)||(u.isMG||u.id==="USR-MG-001")); // BUG FIX #4 — 'usersState' was undefined; correct variable is 'users'
    rhMgArr.forEach(u=>gcPushNotif(u.id,{id:"N"+Date.now()+u.id,icon:"👤",message:creationMsg,at:new Date().toISOString(),read:false,module:"approbations"}));
  };

  const handleFactoryReset = async () => {
    const confirmed = await gcConfirm("⚠️ RÉINITIALISATION TOTALE DU SI\n\nCela effacera L'INTÉGRALITÉ des données applicatives :\n• Tous les dossiers, documents, tâches, RDV\n• Tous les partenaires, recrutements, présences, congés\n• Toutes les codifications, journaux, configurations\n\nLes données de compte utilisateur stockées dans les clés \"users\" et \"gc-users\" seront conservées.\n\nCETTE ACTION EST IRRÉVERSIBLE.\n\nConfirmez-vous ?");
    if (!confirmed) return;
    const code = await gcPrompt("Saisir le code de confirmation : RESET-GC-SI");
    if ((code||"").trim() !== "RESET-GC-SI") { gcAlert("❌ Code incorrect. Réinitialisation annulée."); return; }
    // FIX v92 Bug#7d — Object.keys() snapshot complet, évite décalage d'index pendant suppression
    const keysToDelete = Object.keys(localStorage).filter((k) => {
      if (!k) return false;
      if (k === "users" || k === "gc-users") return false;
      if (k.endsWith(":users") || k.endsWith(":gc-users")) return false;
      return k.startsWith("GC_SI") || k.startsWith("gc-") || k.startsWith("gc_");
    });
    keysToDelete.forEach(k => { try { _lsRm(k); } catch (_) {} });
    // FIX BUG#15 — Mark all items as deleted BEFORE sending empty state
    // Without tombstones, offline clients can resurrect deleted items on reconnect
    const dossiersCurrentState = _lsGet('dossiers') ? JSON.parse(_lsGet('dossiers')) : [];
    const tachesCurrentState = _lsGet('taches') ? JSON.parse(_lsGet('taches')) : [];
    const rdvsCurrentState = _lsGet('rdvs') ? JSON.parse(_lsGet('rdvs')) : [];
    const pendingCurrentState = _lsGet('pendingApprovals') ? JSON.parse(_lsGet('pendingApprovals')) : [];
    const partnersCurrentState = _lsGet('partners') ? JSON.parse(_lsGet('partners')) : [];
    
    // Mark all as deleted first (tombstone registration)
    if (Array.isArray(dossiersCurrentState)) {
      for (const item of dossiersCurrentState) {
        if (item?.id) await dsDeleteItemFromArray('dossiers', item.id, item, true);
      }
    }
    if (Array.isArray(tachesCurrentState)) {
      for (const item of tachesCurrentState) {
        if (item?.id) await dsDeleteItemFromArray('taches', item.id, item, true);
      }
    }
    if (Array.isArray(rdvsCurrentState)) {
      for (const item of rdvsCurrentState) {
        if (item?.id) await dsDeleteItemFromArray('rdvs', item.id, item, true);
      }
    }
    if (Array.isArray(pendingCurrentState)) {
      for (const item of pendingCurrentState) {
        if (item?.id) await dsDeleteItemFromArray('pendingApprovals', item.id, item, true);
      }
    }
    if (Array.isArray(partnersCurrentState)) {
      for (const item of partnersCurrentState) {
        if (item?.id) await dsDeleteItemFromArray('partners', item.id, item, true);
      }
    }
    
    // Then wipe with forceOverwrite
    setDossiersState([]); setProdDossiers([]); dsSave("dossiers", [], {forceOverwrite: true});
    setTachesState([]); setProdTaches([]); dsSave("taches", [], {forceOverwrite: true});
    setRdvsState([]); setProdRdvs([]); dsSave("rdvs", [], {forceOverwrite: true});
    setPendingApprovalsState([]); setProdPending([]); dsSave("pendingApprovals", [], {forceOverwrite: true});
    setPartnersStateRaw([]); setProdPartners([]); dsSave("partners", [], {forceOverwrite: true});
    // -- Finance & Comptabilité --
    try { _lsSet("gc-journal","[]"); dsSave("gc-journal",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-factures","[]"); dsSave("gc-factures",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-budget","[]"); dsSave("gc-budget",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-devis","[]"); dsSave("gc-devis",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-budget-rapide","[]"); dsSave("gc-budget-rapide",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-piece-series","[]"); dsSave("gc-piece-series",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-tpa","[]"); dsSave("gc-tpa",[]).catch(()=>{}); } catch (_) {}
    // -- Communication --
    try { _lsSet("gc-comm-fiches","[]"); dsSave("gc-comm-fiches",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-comm-campagnes","[]"); dsSave("gc-comm-campagnes",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-comm-custom-tpl","[]"); dsSave("gc-comm-custom-tpl",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-comm-contacts","[]"); dsSave("gc-comm-contacts",[]).catch(()=>{}); } catch (_) {}
    // -- Rapport --
    try { _lsSet("gc-rapport-generated","[]"); dsSave("gc-rapport-generated",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-rapport-requests","[]"); dsSave("gc-rapport-requests",[]).catch(()=>{}); } catch (_) {}
    // -- Audit & Conformité --
    try { _lsSet("gc-audit-prog","[]"); dsSave("gc-audit-prog",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-audit-actions","[]"); dsSave("gc-audit-actions",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-risks","[]"); dsSave("gc-risks",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-nc","[]"); dsSave("gc-nc",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-pca","[]"); dsSave("gc-pca",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-pca-risques","[]"); dsSave("gc-pca-risques",[]).catch(()=>{}); } catch (_) {}
    // -- Logistique --
    try { _lsSet("gc-achats","[]"); dsSave("gc-achats",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-logmod-stocks","[]"); dsSave("gc-logmod-stocks",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-inventaires","[]"); dsSave("gc-inventaires",[]).catch(()=>{}); } catch (_) {}
    try { _lsSet("gc-logistique-actifs","[]"); dsSave("gc-logistique-actifs",[]).catch(()=>{}); } catch (_) {}
    // -- IA (historique conversations locales — seulement pour cet utilisateur) --
    try {
      Object.keys(localStorage).filter(k=>k.startsWith("gc-ai-history:")).forEach(k=>{ try{_lsRm(k);}catch(_){} });
    } catch (_) {}
    // -- Nouvelles clés (rapports, alarmes horloge) --
    try { _lsSet("gc-rapport-generated","[]"); } catch (_) {}

    try { _lsSet("gc-sirh-leaves", "[]"); dsSave("gc-sirh-leaves", []).catch(() => {}); } catch (_) {}
    try { _lsSet("gc-sirh-recrutements", "[]"); dsSave("gc-sirh-recrutements", []).catch(() => {}); } catch (_) {}
    try { _lsSet("gc-sirh-evaluations", "[]"); dsSave("gc-sirh-evaluations", []).catch(() => {}); } catch (_) {}
    try { _lsSet("gc-paie-transferts", "[]"); dsSave("gc-paie-transferts", []).catch(() => {}); } catch (_) {}
    // -- Documents --
    try { _lsSet("gc-internal-docs", "[]"); dsSave("gc-internal-docs", []).catch(() => {}); } catch (_) {}
    try { _lsSet("gc-external-docs", "[]"); dsSave("gc-external-docs", []).catch(() => {}); } catch (_) {}
    try { _lsSet("gc-dossier-files", "[]"); dsSave("gc-dossier-files", []).catch(() => {}); } catch (_) {}
    // -- Messagerie --
    try { _lsSet("gc-messages-global", "[]"); } catch (_) {}
    try { _lsSet("gc-courrier-docs", "[]"); } catch (_) {}
    // -- Journaux --
    try { _lsSet("gc-session-logs", "[]"); dsSave("gc-session-logs", []).catch(() => {}); } catch (_) {}
    try { _lsSet("gc-account-actions", "[]"); dsSave("gc-account-actions", []).catch(() => {}); } catch (_) {}
    try { _lsSet("gc-error-log", "[]"); } catch (_) {}
    // -- Accès --
    try { _lsRm("gc-pending-connections"); } catch (_) {}
    try { _lsRm("gc-app-habilitations"); } catch (_) {}
    try { _lsRm("gc-app-access-codes"); } catch (_) {}
    // -- Codification & Archivage --
    try { _lsSet("gc-codif-registry", "[]"); dsSave("gc-codif-registry", []).catch(() => {}); } catch (_) {}
    // -- Productivité --
    try { _lsRm("gc-kanban-cols-v2"); } catch (_) {}
    try { _lsRm("gc-kanban-cards-v2"); } catch (_) {}
    try { _lsRm("gc-notes-rapides"); } catch (_) {}
    try { _lsRm("gc-notepad-v2"); } catch (_) {}
    try { _lsRm("gc-memos"); } catch (_) {}
    try { _lsRm("gc-tableur-pro"); } catch (_) {}
    try { _lsRm("gc-alarms-v2"); } catch (_) {}
    try { _lsRm("gc-widget-alarms"); } catch (_) {}
    try { _lsRm("gc-demandes"); } catch (_) {}
    try { _lsRm("gc-archives"); } catch (_) {}
    try { _lsRm("gc-standalone-docs"); } catch (_) {}
    try { _lsRm("gc-security-alerts"); } catch (_) {}
    try { _lsRm("gc-system-msgs"); } catch (_) {}    // FIX v72 — Messages système (persistés depuis v72)
    // -- Badges "vu" sidebar (tous utilisateurs) --
    // FIX v92 Bug#7 — Snapshot complet des clés AVANT suppression (évite décalage d'index)
    try {
      const allKeys = Object.keys(localStorage);
      allKeys.filter(k => k && k.startsWith("gc-seen-badges:"))
             .forEach(k => { try { _lsRm(k); } catch(_) {} });
    } catch(_) {}
    // -- Notifications de tous les utilisateurs --
    try {
      const allKeys = Object.keys(localStorage);
      allKeys.filter(k => k && k.startsWith("GC_SI_v12:notif:"))
             .forEach(k => { try { _lsRm(k); } catch(_) {} });
    } catch(_) {}
    // -- Collaborateurs externes (réinitialiser à la liste par défaut) --
    setPartnersStateRaw(INITIAL_PARTNERS); setProdPartners(INITIAL_PARTNERS);

    const keysToWipe = [...SHARED_KEYS].filter(k => k && k !== 'users' && k !== 'gc-users' && k !== 'gc-tombstones' && k !== 'gc-wipe-registry' && k !== 'gc-factory-reset-signal');
    const wipeOps = keysToWipe.map(key => dsWipeKey(key).catch(() => {}));
    const syncPromises = [...wipeOps];
    syncPromises.push(dsSave("partners", INITIAL_PARTNERS, null, { forceOverwrite: true }).catch(() => {}));

    try { dsClearTombstones(); } catch (_) {}

    syncPromises.push(
      dsSave('gc-factory-reset-signal', { at: Date.now(), by: currentUser?.id || 'admin' }, null, { forceOverwrite: true }).catch(() => {})
    );

    try {
      await Promise.all(syncPromises);
      await new Promise(r => setTimeout(r, 500));
    } catch (_) {}

    setSessionLogs([]);
    gcAlert("✅ Réinitialisation complète effectuée.\n\nToutes les données applicatives ont été effacées.\nLes comptes utilisateurs restent disponibles dans les clés \"users\" et \"gc-users\".\nLes partenaires de base ont été restaurés.\n\nVous allez être déconnecté.");
    setCurrentUser(null);
    setIsAdminMode(false);
    setScreen("cover");
  };

  if (screen === "cover") {
    return (
      <>
        <GlobalStyles />
        <ToastContainer />
        <DialogProvider T={T}>
        <CoverPage
          onAdminKey={() => { setIsAdminMode(true); setScreen("login"); }}
          onUserLogin={() => { setIsAdminMode(false); setScreen("login"); }}
          T={T}
          toggleTheme={toggleTheme}
          themeMode={themeMode}
          isFirstTime={isFirstTime}
          siLogoUrl={siLogoUrl}
          siAppearance={siAppearance}
        />
        </DialogProvider>
      </>
    );
  }

  if (screen === "login") {
    // FIX v136 — Bloquer l'affichage du formulaire jusqu'à la fin de l'hydratation serveur.
    // Sans ce garde, un poste frais affiche INITIAL_USERS (2 comptes) avant de recevoir
    // les vrais comptes depuis le serveur → comptes créés "invisibles" au login.
    if (hydrating) {
      return (
        <>
          <GlobalStyles />
          <div style={{
            background: "#060F1E", minHeight: "100vh", display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
          }}>
            <div style={{
              width: 40, height: 40, border: "3px solid #C41E3A33",
              borderTop: "3px solid #C41E3A", borderRadius: "50%",
              animation: "gc-spin 0.8s linear infinite",
            }} />
            <style>{`@keyframes gc-spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ color: "#C9A84C", fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
              Chargement des comptes…
            </div>
            <div style={{ color: "#4B6CB7", fontSize: 11 }}>
              Synchronisation avec le serveur en cours
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        <GlobalStyles />
        <ToastContainer />
        <DialogProvider T={T}>
        <LoginPage
          users={users}
          setUsers={setUsers}
          isAdminMode={isAdminMode}
          onLogin={handleLogin}
          onCreateAccount={() => setScreen("create")}
          onBack={() => setScreen("cover")}
          onAccessDemo={isAdminMode ? handleAccessDemo : undefined}
          T={T}
          pendingConnections={pendingConnections}
          setPendingConnections={setPendingConnections}
          isFirstTime={isFirstTime}
          pendingApprovals={pendingApprovals}
          onSessionLog={addSessionLog}
          requireConnApproval={requireConnApproval}
          siSystemDocs={siSystemDocs}
          siAppearance={siAppearance}
          siLogoUrl={siLogoUrl}
        />
        </DialogProvider>
      </>
    );
  }
  if (screen === "create") {
    return (
      <>
        <GlobalStyles />
        <ToastContainer />
        <DialogProvider T={T}>
          <CreateAccountPage
            onBack={() => setScreen("login")}
            onSubmit={handleCreateAccountSubmit}
            T={T}
          />
        </DialogProvider>
      </>
    );
  }

  if (screen === "app" && currentUser) {
    return (
      <>
        <GlobalStyles />
        <ToastContainer />
        <DialogProvider T={T}>
        <SIErrorBoundary T={T}>
        <SIApp
          currentUser={currentUser}
          users={users}
          setUsers={setUsers}
          dossiers={dossiers}
          setDossiers={setDossiers}
          taches={taches}
          setTaches={setTaches}
          rdvs={rdvs}
          setRdvs={setRdvs}
          onLogout={handleLogout}
          T={T}
          toggleTheme={toggleTheme}
          themeMode={themeMode}
          pendingApprovals={pendingApprovals}
          setPendingApprovals={setPendingApprovals}
          pendingConnectionsRoot={pendingConnections}
          setPendingConnectionsRoot={setPendingConnections}
          onFactoryReset={handleFactoryReset}
          isDemoMode={isDemoMode}
          onExitDemo={handleExitDemo}
          siLogoUrl={siLogoUrl}
          setSiLogoUrl={setSiLogoUrl}
          siAppearance={siAppearance}
          setSiAppearance={setSiAppearance}
          siCSSOverrides={siCSSOverrides}
          setSiCSSOverrides={setSiCSSOverrides}
          sessionLogs={sessionLogs}
          setSessionLogs={setSessionLogs}
          addSessionLog={addSessionLog}
          pendingAccountActions={pendingAccountActions}
          setPendingAccountActions={setPAA}
          partnersRoot={partnersState}
          setPartnersRoot={setPartnersGlobal}
          appHabilitations={appHabilitations}
          setAppHabilitations={saveAppHabilitations}
          appAccessCodes={appAccessCodes}
          setAppAccessCodes={saveAppAccessCodes}
          requireConnApproval={requireConnApproval}
          setRequireConnApproval={setRequireConnApproval}
          siSystemDocs={siSystemDocs}
          setSiSystemDocs={setSiSystemDocs}
          securityAlerts={securityAlerts}
          setSecurityAlerts={setSecurityAlerts}
          kpiAlerts={kpiAlerts}
          setKpiAlerts={setKpiAlerts}
          gcFileCatalog={gcFileCatalog}
          setGcFileCatalog={setGcFileCatalog}
          autoBackupEnabled={autoBackupEnabled}
          setAutoBackupEnabled={setAutoBackupEnabled}
          autoBackupInterval={autoBackupInterval}
          setAutoBackupInterval={setAutoBackupInterval}
        />
        </SIErrorBoundary>
        </DialogProvider>
      </>
    );
  }

  return <><GlobalStyles /><ToastContainer /><div style={{ background: "#060F1E", minHeight: "100vh" }} /></>;
}


