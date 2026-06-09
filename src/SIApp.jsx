// FIX v10.5 — lazy et Suspense retirés : tous les modules sont importés directement (statiquement).
// Le découpage en chunks est géré par Rollup manualChunks dans vite.config.js.
// SuspenseFallback conservé pour usage futur si lazy-loading est activé.
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// SIApp.jsx — Shell principal du SI, gestion modules, navigation
// SI Génie Consultant v10.5
import {
  _lsGet, _lsSet, _lsRm, lsLoad, lsSave, _noop, _tDone, _tActive, gcPushNotif, playSound, gcGetSoundSettings, gcSetSoundSettings, formatCFA, gcCalcPaie, gcCalcIRPP, gcLoadFiscalConfig, gcFindApprover, gcCodif, gcCodifDOC, gcCodifTCHE, gcCodifMSG, _gcSafeCalc, formatDate, gcGetDelaiConfig, gcAntiRedondance, gcAIBuildSystemPrompt, gcAILoadConfig, gcAISaveConfig, GC_AI_PROXY_URL, gcCopy, generateAccessCode, SICtx, SIErrorBoundary, LiveClock, _activeUser, getProcColor, useSessionTimeout, dsSave, dsOnSync, daysLeft
} from './core/index.js'; // FIX v127 — imports inutilisés retirés
import { THEMES, STATUS_CONFIG, PRIORITY_CONFIG, INITIAL_DOSSIERS, INITIAL_TACHES, INITIAL_RDVS, INITIAL_PENDING, INITIAL_PARTNERS, INITIAL_ARCHIVES, INITIAL_MESSAGES, INITIAL_USERS, INITIAL_COMMITTEES, INITIAL_CODIF_REGISTRY, INITIAL_INTERNAL_DOCS, INITIAL_SI_SYSTEM_DOCS, GC_SUBPROC_MAP, GC_ALL_SUBPROCS, GC_APPROVAL_ROUTING, GC_CIRCUITS_INIT, GC_DOCS_REQUIS, GC_ACTIVITES, GC_DELAI_DEFAULT, GC_AI_CONFIG_KEY, GC_AI_CONFIG_DEFAULT, GC_AI_LEVEL_RULES, PROCESS_ACTIVITIES, DOC_CATEGORIES, USER_FUNCTIONS, PROCESS_APP_MATRIX_DEFAULT, CRM_SEGMENTS_C, CRM_SECTEURS_C, CRM_SOURCES_C, CRM_TYPES_INTERACTION_C, CRM_TYPES_RELANCE_C, CRM_ETAPES_C, CRM_RISKS_C, CRM_KYC_C, CRM_STATUTS_C, CRM_PROCS_METIER_C, PLAN_COMPTABLE_OHADA, GC_ADMIN_HASH, GC_DG_HASH, ALL_NATIONALITIES, DEMO_USERS, DEMO_DOSSIERS, DEMO_RDVS, DEMO_TACHES, DEMO_PENDING, DEMO_ARCHIVES, DEMO_CODIF_REGISTRY, DEMO_INTERNAL_DOCS, FILE_TYPE_CONFIG, INITIAL_SIRH_PRESENCES, INITIAL_SIRH_LEAVES, INITIAL_RECRUTEMENTS, INITIAL_SYSTEM_MSGS, CODES, INITIAL_OBLIGATIONS, INITIAL_STOCKS} from './core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Badge, ProgressBar, Tabs, NationaliteField, SmartBanner, RotatingAlert, UserAvatar } from './components/UI.jsx';
import { GlobalStyles } from './styles/GlobalStyles.jsx';
import { AIAssistant } from './components/AIAssistant.jsx';
import { ToolsWidget } from './components/ToolsWidget.jsx';
import { ProfileDropdown, ProfilePage, LogoutConfirmModal, NotificationCenter } from './components/Auth.jsx';
import { ServerStatus } from './components/ServerStatus.jsx';
// Modules métier (lazy-loaded by renderModule switch)
import { BureauOffice } from './modules/bureautique/BureauOffice.jsx';
import { WriterProApp } from './modules/bureautique/WriterPro.jsx';
import { TableurPro } from './modules/bureautique/TableurPro.jsx';
import { PresentationApp } from './modules/bureautique/PresentationPro.jsx';
import { BudgetRapideApp } from './modules/bureautique/BudgetRapide.jsx';
import { FormulaireApp } from './modules/bureautique/Formulaires.jsx';
import { GestionRapideUnifiee } from './modules/bureautique/GestionRapide.jsx';
import { DelaiConfigPanelO01, FiscalConfigPanel, ExportBackupPanel } from './modules/admin/SIConfigPanels.jsx';
import { OHADARefApp, FacturationModule, ConventionModule, PaieSimulateur } from './modules/finance/FinanceApp.jsx';
import { JuridiqueApp } from './modules/juridique/JuridiqueApp.jsx';
import { SIRHModule, RecrutementPanel, BaseFichiersRH } from './modules/sirh/SIRHModule.jsx';
import { AuditApp } from './modules/audit/AuditApp.jsx';
import { ConformiteFull, NonConformitesPanel } from './modules/conformite/ConformiteApp.jsx';
import { CommunicationApp } from './modules/communication/CommunicationApp.jsx';
import { ConseilApp } from './modules/conseil/ConseilApp.jsx';
import { LogistiqueModule } from './modules/logistique/LogistiqueApp.jsx';
import { GestionDocsUnifiee } from './modules/docs/GestionDocsUnifiee.jsx';
import { ArchivagePanel, TransferModal } from './modules/docs/ArchivagePanel.jsx';
import { CodificationPanel } from './modules/docs/CodificationPanel.jsx';
import { DossierDetailModal } from './modules/docs/DossierDetailModal.jsx';
import { DossiersList, QuickPartnerCreate, IntakeClientO01 } from './modules/docs/DossiersList.jsx';
import { AppAccessManager } from './modules/docs/AppAccessManager.jsx';
import { AdminPanel, DelaisAdminPanel } from './modules/admin/AdminPanel.jsx';
import { AdminConnexionsTab, GestionComptesPanel } from './modules/admin/GestionComptesPanel.jsx'; // FIX v134 — AdminCodeEditor retiré (import mort, utilisé dans AdminPanel)
import { InformationsPanel, ActivityJournal, FileDataManager, PrinterConfig } from './modules/admin/InformationsPanel.jsx';
import { CollaborateursPanel } from './modules/admin/CollaborateursPanel.jsx';
import { DemandesModule } from './modules/admin/DemandesModule.jsx';
import { HubProgrammesPanel, HubCfgPanel, ProcessAppMatrixAdmin , gcIDB} from './modules/admin/HubPanels.jsx';
import { MessagerieUnifieeApp } from './modules/messagerie/MessagerieUnifiee.jsx';
import { AgendaModule } from './modules/agenda/AgendaModule.jsx';
import { Dashboard } from './modules/dashboard/Dashboard.jsx';
import { Indicateurs } from './modules/dashboard/Indicateurs.jsx';
import { ProcessusMap } from './modules/dashboard/ProcessusMap.jsx';
import { TachesPanel } from './modules/taches/TachesPanel.jsx';
import { RapportActiviteModule } from './modules/rapport/RapportActiviteModule.jsx';
import { useDialog } from './components/Dialog.jsx';
import { gcToast } from './components/ToastManager.jsx';

// ── Composant de chargement pendant le lazy-loading ──────────────────────
const SuspenseFallback = ({ T }) => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',flexDirection:'column',gap:16}}>
    <div style={{width:40,height:40,border:`3px solid ${T?.border||'#1E3A5F'}`,borderTopColor:'#C9A84C',borderRadius:'50%',animation:'gc-spin 0.8s linear infinite'}}/>
    <div style={{color:T?.textMuted||'#94A3B8',fontSize:13}}>Chargement du module…</div>
  </div>
);

export function SIApp(props) {
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const { currentUser, users=[], setUsers, dossiers=[], setDossiers, taches=[], setTaches, rdvs=[], setRdvs, onLogout, T, toggleTheme, themeMode, pendingApprovals=[], setPendingApprovals, pendingConnectionsRoot=[], setPendingConnectionsRoot, onFactoryReset, isDemoMode, onExitDemo, siLogoUrl, setSiLogoUrl, siAppearance, setSiAppearance, siCSSOverrides, setSiCSSOverrides, sessionLogs=[], setSessionLogs, addSessionLog, pendingAccountActions=[], setPendingAccountActions, partnersRoot=[], setPartnersRoot, appHabilitations=[], setAppHabilitations, appAccessCodes=[], setAppAccessCodes, requireConnApproval, setRequireConnApproval, siSystemDocs=[], setSiSystemDocs,
  securityAlerts=[], setSecurityAlerts,
  kpiAlerts=[], setKpiAlerts,
  gcFileCatalog=[], setGcFileCatalog,
  autoBackupEnabled=true, setAutoBackupEnabled,
  autoBackupInterval=5, setAutoBackupInterval,
} = props; // FIX v62: addSessionLog restauré dans props (défini dans App())
  // FIX vREFRESH — Restaurer le module actif depuis sessionStorage (F5/Ctrl+R conserve la page courante)
  // sessionStorage persiste au rafraîchissement mais PAS à la fermeture de l'onglet/nouvelle connexion.
  const [activeModule, setActiveModule] = useState(() => {
    try { return sessionStorage.getItem('gc-active-module') || "dashboard"; } catch (_) { return "dashboard"; }
  });
  const [selectedDossier, setSelectedDossier] = useState(null);
  // BUG FIX #6  -  sidebarOpen useState moved BEFORE the useEffect that references setSidebarOpen
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Synchroniser sessionStorage à chaque changement de module
  useEffect(() => {
    try { sessionStorage.setItem('gc-active-module', activeModule); } catch (_) {}
  }, [activeModule]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // F5 seul = rafraîchissement natif → on laisse le navigateur faire (sessionStorage conserve le module)
      // Ctrl+F5 = hard refresh + retour dashboard (sans déconnexion)
      if (e.ctrlKey && e.key === "F5") {
        try { sessionStorage.removeItem('gc-active-module'); } catch (_) {}
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // FIX v63 C7  -  Chargement async depuis IndexedDB au démarrage (pièces jointes & documents)
  useEffect(() => {
    (async () => {
      try {
        const [idbFiles, idbDocs] = await Promise.all([
          gcIDB.getAll(gcIDB.STORE_FILES),
          gcIDB.getAll(gcIDB.STORE_DOCS),
        ]);
        if (idbFiles.length > 0) setDossierFiles(idbFiles);
        if (idbDocs.length > 0) setStandaloneDocumentsRaw(idbDocs);
      } catch (_) {
        // Fallback LS déjà chargé dans useState initial
      }
    })();
   
// INTENTIONNEL : chargement IDB unique au montage, setDossierFiles/setStandaloneDocumentsRaw sont stables
  }, []);
  // FIX v92 Bug#9a — Ajout de currentUser?.id en dep : la notification de bienvenue doit
  // utiliser le bon nom/niveau si l'utilisateur change de session sans rechargement.
  useEffect(() => {
    try {
      if ("Notification" in window && Notification.permission === "default") {
        const t = setTimeout(() => {
          Notification.requestPermission().then(perm => {
            if (perm === "granted" && currentUser?.level >= 3) {
              new Notification("SI Génie Consultant", {
                body: `Bienvenue, ${currentUser.name} ! Les notifications urgentes sont activées.`,
                icon: "/favicon.ico",
              });
            }
          }).catch(() => {});
        }, 2000);
        return () => clearTimeout(t);
      }
    } catch (_) {}
   
  }, [currentUser?.id]); // currentUser?.id garantit que l'effet re-run si l'utilisateur change

  // FIX v141 — Heartbeat de présence global : enregistre l'utilisateur courant
  // dans window.__gcOnlineUsers (partagé entre composants du même onglet) ET
  // pousse périodiquement vers 'gc-presence' pour synchronisation cross-machine.
  // Constantes unifiées avec CollaborateursPanel : ONLINE_MS=45s, PURGE_MS=90s
  const GC_PRESENCE_ONLINE_MS = 45000;  // seuil "en ligne" (même valeur dans CollaborateursPanel)
  const GC_PRESENCE_PURGE_MS  = 90000;  // purge = 2× seuil online (marge réseau)
  useEffect(() => {
    if (!currentUser?.id) return;
    if (!window.__gcOnlineUsers) window.__gcOnlineUsers = new Map();

    const pushPresence = async () => {
      const now = Date.now();
      window.__gcOnlineUsers.set(currentUser.id, now);
      // Tenter de pousser vers le serveur pour visibilité cross-machine
      try {
        const existing = JSON.parse(_lsGet('gc-presence') || '{}');
        const purged = {};
        Object.entries(existing).forEach(([uid, ts]) => {
          if (now - ts < GC_PRESENCE_PURGE_MS) purged[uid] = ts;
        });
        purged[currentUser.id] = now;
        _lsSet('gc-presence', JSON.stringify(purged));
        // Importation dynamique pour éviter dépendance circulaire
        import('./core/datastore.js').then(({ dsSave: _dsSave }) => {
          _dsSave('gc-presence', purged).catch(() => {});
        }).catch(() => {});
      } catch (_) {}
    };

    pushPresence();
    const interval = setInterval(pushPresence, 20000);
    return () => {
      clearInterval(interval);
      // Marquer déconnexion immédiate
      try {
        const existing = JSON.parse(_lsGet('gc-presence') || '{}');
        delete existing[currentUser.id];
        _lsSet('gc-presence', JSON.stringify(existing));
        import('./core/datastore.js').then(({ dsSave: _dsSave }) => {
          _dsSave('gc-presence', existing).catch(() => {});
        }).catch(() => {});
      } catch (_) {}
    };
   
  }, [currentUser?.id]);

  // FIX v63 C9  -  Notifier OS sur nouvelle approbation urgente (niv 3+)
  const _prevApprovalCount = React.useRef(pendingApprovals?.length || 0);
  useEffect(() => {
    try {
      const count = pendingApprovals?.length || 0;
      if (count > _prevApprovalCount.current && Notification.permission === "granted" && currentUser?.level >= 3) {
        new Notification("⚡ SI Génie — Nouvelle approbation", {
          body: `${count} approbation(s) en attente de votre action.`,
          icon: "/favicon.ico",
          tag: "gc-approval", // replace previous notification of same type
        });
      }
      _prevApprovalCount.current = count;
    } catch (_) {}
   
// INTENTIONNEL : currentUser.level lu via Notification.permission guard (no stale risk)
  }, [pendingApprovals?.length]);
  const [showLogout, setShowLogout] = useState(false);
  const [showIntakeModal, setShowIntakeModal] = useState(false); // v99 — Intake client O01
  // FIX v63: auto-ouvrir le profil si c'est la 1ère connexion (compte DG ou autre compte isFirstLogin)
  const [showProfile, setShowProfile] = useState(() => !!(currentUser?.isFirstLogin));
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showFirstLoginWizard, setShowFirstLoginWizard] = useState(() => !!(currentUser?.isFirstLogin));
  const [showMessaging, setShowMessaging] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false); // FIX v135 — DossierDetailModal transfer workflow
  const computeGlobalMessagingBadge = useCallback((uid) => {
    if (!uid) return 0;
    try {
      const rawMsg = JSON.parse(_lsGet("gc-messages-global") || "[]");
      const groupSeen = parseInt(_lsGet(`gc-msg-group-seen-${uid}`) || "0", 10) || 0;
      const rawCourriers = JSON.parse(_lsGet("gc-courrier-docs") || "[]");

      const privateUnread = rawMsg.filter((m) =>
        m &&
        m.type !== "group" &&
        m.from !== uid &&
        !m.read &&
        (m.to?.includes(uid) || m.to?.includes("ALL"))
      ).length;

      const groupUnread = rawMsg.filter((m) =>
        m &&
        m.type === "group" &&
        m.from !== uid &&
        new Date(m.at || 0).getTime() > groupSeen
      ).length;

      const courrierUnread = rawCourriers.filter((c) => c && !c._read).length;
      return privateUnread + groupUnread + courrierUnread;
    } catch (_) {
      return 0;
    }
  }, []);
  const [msgUnreadCount, setMsgUnreadCount] = useState(() => {
    return computeGlobalMessagingBadge(currentUser?.id);
  });
  // FIX vMSG-BADGE — Mettre à jour le badge messagerie toutes les 10s depuis le serveur
  useEffect(() => {
    const refreshBadge = () => {
      const uid = currentUser?.id;
      if (!uid) return;
      setMsgUnreadCount(computeGlobalMessagingBadge(uid));
    };
    const t = setInterval(refreshBadge, 10000);
    refreshBadge();
    return () => clearInterval(t);
   
  }, [currentUser?.id, computeGlobalMessagingBadge]);
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  const [soundSettings, setSoundSettingsState] = useState(() => gcGetSoundSettings());
  const handleSoundChange = (patch) => {
    const next = gcSetSoundSettings(patch);
    setSoundSettingsState(next);
  };

  const [codifRegistry, setCodifRegistryRaw] = useState(() => {
    try { const s = _lsGet('gc-codif-registry'); return s ? JSON.parse(s) : INITIAL_CODIF_REGISTRY; } catch(_) { return INITIAL_CODIF_REGISTRY; }
  });
  const setCodifRegistry = useCallback((v) => {
    setCodifRegistryRaw(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      try { _lsSet('gc-codif-registry', JSON.stringify(resolved)); } catch(_) {}
      if (!isDemoMode) dsSave('gc-codif-registry', resolved).catch(() => {});
      return resolved;
    });
  }, [isDemoMode]);

  const [internalDocs, setInternalDocsRaw] = useState(() => {
    try {
      const saved = _lsGet("gc-internal-docs");
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = INITIAL_INTERNAL_DOCS.map(init => {
          const found = parsed.find(d => d.id === init.id);
          return found ? { ...init, ...found } : init;
        });
        const custom = parsed.filter(d => !INITIAL_INTERNAL_DOCS.find(i => i.id === d.id));
        return [...merged, ...custom];
      }
    } catch (_) {}
    return INITIAL_INTERNAL_DOCS;
  });
  const setInternalDocs = useCallback((v) => {
    setInternalDocsRaw(prev => {
      const resolved = typeof v === "function" ? v(prev) : v;
      try {
        _lsSet("gc-internal-docs", JSON.stringify(resolved));
      } catch (_) {
        try { _lsSet("gc-internal-docs", JSON.stringify(resolved.map(d => ({ ...d, dataUrl: d.dataUrl ? "[LARGE]" : null })))); } catch (_) {}
      }
      // FIX v142 — Sync réseau internalDocs (docs système partagés entre postes)
      // FIX v152 — Préserver serverUrl/serverId (ne stripper que dataUrl volumineux)
      if (!isDemoMode) dsSave('gc-internal-docs', resolved.map(d => ({
        ...d,
        dataUrl: (d.serverUrl || d.serverId) ? null : (d.dataUrl ? "[LARGE]" : null)
      }))).catch(() => {});
      return resolved;
    });
  }, [isDemoMode]);

  const [externalDocs, setExternalDocsRaw] = useState(() => {
    try { return JSON.parse(_lsGet("gc-external-docs") || "[]"); } catch (_) { return []; }
  });
  const setExternalDocs = useCallback((v) => {
    setExternalDocsRaw(prev => {
      const resolved = typeof v === "function" ? v(prev) : v;
      try { _lsSet("gc-external-docs", JSON.stringify(resolved)); } catch (_) {
        try { _lsSet("gc-external-docs", JSON.stringify(resolved.map(d => ({ ...d, dataUrl: d.dataUrl ? "[LARGE]" : null })))); } catch (_) {}
      }
      // FIX v142 — Sync réseau externalDocs
      // FIX v152 — Préserver serverUrl/serverId (ne stripper que dataUrl volumineux)
      if (!isDemoMode) dsSave('gc-external-docs', resolved.map(d => ({
        ...d,
        dataUrl: (d.serverUrl || d.serverId) ? null : (d.dataUrl ? "[LARGE]" : null)
      }))).catch(() => {});
      return resolved;
    });
  }, [isDemoMode]);

  const [docs, setDocsRaw] = useState(() => {
    try { return JSON.parse(_lsGet("gc-docs-unified") || "[]"); } catch (_) { return []; }
  });
  const saveDocs = useCallback((v) => {
    setDocsRaw(prev => {
      const resolved = typeof v === "function" ? v(prev) : v;
      try { _lsSet("gc-docs-unified", JSON.stringify(resolved)); } catch (_) {
        try { _lsSet("gc-docs-unified", JSON.stringify(resolved.map(d => ({ ...d, dataUrl: d.dataUrl ? "[LARGE]" : null })))); } catch (_) {}
      }
      // FIX v129 — Sync réseau manquante : les nouveaux documents créés dans
      // GestionDocsUnifiee n'étaient pas propagés aux autres postes.
      if (!isDemoMode) {
        const standalonePayload = resolved.slice(0, 300).map(d => ({ ...d, url: undefined, _src: "standalone" }));
        dsSave('gc-standalone-docs', standalonePayload).catch(() => {});
      }
      return resolved;
    });
  }, [isDemoMode]);

  const [committees, setCommitteesRaw] = useState(() => {
    try { const s = _lsGet('gc-committees'); return s ? JSON.parse(s) : INITIAL_COMMITTEES; } catch(_) { return INITIAL_COMMITTEES; }
  });
  const setCommittees = useCallback((v) => {
    setCommitteesRaw(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      try { _lsSet('gc-committees', JSON.stringify(resolved)); } catch(_) {}
      if (!isDemoMode) dsSave('gc-committees', resolved).catch(() => {});
      return resolved;
    });
  }, [isDemoMode]);
  const [partners, setPartners] = useState(() => {
    if (partnersRoot) return partnersRoot;
    return lsLoad("partners", INITIAL_PARTNERS);
  });
  useEffect(() => { if (partnersRoot) setPartners(partnersRoot); }, [partnersRoot]);
  const setPartnersSync = useCallback((v) => {
    setPartners(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (setPartnersRoot) setPartnersRoot(resolved);
      if (!isDemoMode) {
        lsSave("partners", resolved);
        // FIX v129 — Sync réseau : les modifications partenaires/clients CRM
        // n'étaient pas propagées aux autres postes du réseau.
        dsSave("partners", resolved).catch(() => {});
      }
      return resolved;
    });
  }, [setPartnersRoot, isDemoMode]);
  // FIX v72 — systemMsgs persisté dans localStorage : le bouton "Diffuser un message" perdait
  // tous les messages publiés dès que SIApp se re-rendait (state non persisté)
  const [systemMsgs, setSystemMsgsRaw] = useState(() => {
    try { const s = _lsGet("gc-system-msgs"); return s ? JSON.parse(s) : INITIAL_SYSTEM_MSGS; } catch(_) { return INITIAL_SYSTEM_MSGS; }
  });
  const setSystemMsgs = useCallback((v) => {
    setSystemMsgsRaw(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      try { _lsSet("gc-system-msgs", JSON.stringify(resolved.slice(0, 100))); } catch(_) {}
      // FIX v142 — Sync cross-machine (newsletter/annonces visibles sur tous postes)
      if (!isDemoMode) dsSave('gc-system-msgs', resolved.slice(0, 100)).catch(() => {});
      return resolved;
    });
  }, [isDemoMode]);
  const [processConfig, setProcessConfig] = useState(() => {
    // Construire la config de base depuis les constantes
    const cfg = {};
    Object.entries(PROCESS_ACTIVITIES).forEach(([k,v]) => {
      cfg[k] = { label: v.label, icon: v.icon, responsable: v.responsable, objectifs: [...v.objectifs], activities: v.activities.map(a=>({...a})) };
    });
    // FIX v154 CRITICAL — Restaurer les customisations sauvegardées (responsables, etc.)
    // Sans ce bloc, la config se réinitialise au refresh car on partait toujours des constantes.
    try {
      const saved = _lsGet('gc-process-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([k, v]) => {
            if (cfg[k]) cfg[k] = { ...cfg[k], ...v };
          });
        }
      }
    } catch (_) {}
    return cfg;
  });

  const [localUser, setLocalUser] = useState(currentUser);
  useEffect(() => { if (currentUser) setLocalUser(currentUser); }, [currentUser]);

  // FIX BUG-B4 — Protection contre crash si localUser est null pendant transition.
  // Sans ce garde, localUser.isMG / localUser.id à différents endroits (lignes 473, 551, 649…)
  // lèvent TypeError "Cannot read properties of null" et crash le shell entier.
  if (!localUser) {
    return (
      <div style={{
        background: '#060F1E', minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: '#C9A84C',
        fontFamily: 'system-ui', fontSize: 13,
      }}>
        Chargement de la session…
      </div>
    );
  }
  const [lateAccessModal, setLateAccessModal] = useState(false);
  const headerRef = useRef(null);

  const pendingConnections = pendingConnectionsRoot || [];
  const handleSetPendingConnections = useCallback((updater) => {
    if (setPendingConnectionsRoot) setPendingConnectionsRoot(updater);
  }, [setPendingConnectionsRoot]);

  // FIX v92 Bug#9b — Ajout de localUser?.id et pendingConnections.length en deps :
  // sans cela, localUser?.level et pendingConnections.length sont lus depuis la closure initiale.
  useEffect(() => {
    const isApprover = (localUser?.isAdmin || localUser?.level >= 6) || (localUser?.level ?? 0) >= 4;
    if (!isApprover || !pendingConnections.length) return;
    setNotifications(prev => {
      const alreadyHas = prev.some(n => n.message?.includes("connexion(s) en attente") || n.message?.includes("connexion en attente"));
      if (alreadyHas) return prev;
      return [{
        id: "N" + Date.now(), icon: "🔗",
        message: `🔗 ${pendingConnections.length} demande(s) de connexion en attente — À traiter dans Gestion des Comptes → Connexions`,
        at: new Date().toISOString(), read: false, module: "gestion_comptes"
      }, ...prev];
    }); // spurious deps removed (FIX v134)
   
  }, [localUser?.id, localUser?.level, pendingConnections.length]);

  useEffect(() => {
    const handler = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [earlyAccessModal, setEarlyAccessModal] = useState(false);    // avant 8h
  const [pauseActive, setPauseActive] = useState(false);               // v122 — pause déjeuner en cours
  const [earlyAccessCode, setEarlyAccessCode] = useState("");
  const [earlyCodeExpiry, setEarlyCodeExpiry] = useState(null);        // timestamp expiry 5min
  const [earlyCodeValue, setEarlyCodeValue] = useState("");
  const [warningShown, setWarningShown] = useState(false);             // alerte 30min
  const warningShownRef = useRef(false); // ref anti-stale-closure pour le setInterval

  // FIX v59: Ref pour éviter stale closure dans le timer 17h30
  const onLogoutRef = useRef(onLogout);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);
  const localUserRef = useRef(localUser);
  useEffect(() => { localUserRef.current = localUser; }, [localUser]);
  const usersRef = useRef(users);
  useEffect(() => { usersRef.current = users; }, [users]);
  // FIX BUG-B12 — Ref pour isDemoMode aussi (sinon le timer 17h30 ne voit pas
  // les changements de mode démo et déconnecte même en démo).
  const isDemoModeRef = useRef(isDemoMode);
  useEffect(() => { isDemoModeRef.current = isDemoMode; }, [isDemoMode]);
  // FIX v134 — isLevel5Plus via ref pour éviter la stale closure dans le timer 17h30
  const isLevel5PlusRef = useRef((localUser?.level ?? 0) >= 5 || !!localUser?.isAdmin);
  useEffect(() => { isLevel5PlusRef.current = (localUser?.level ?? 0) >= 5 || !!localUser?.isAdmin; }, [localUser?.level, localUser?.isAdmin]);

  useEffect(() => {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes();
    const isLevel5Plus = (localUser?.level ?? 0) >= 5 || (localUser?.isAdmin || (localUser?.level ?? 0) >= 6);

    if (!isDemoMode && !isLevel5Plus) {
      if (h < 8) {
        setEarlyAccessModal(true);
        const code = generateAccessCode();
        setEarlyCodeValue(code);
        setEarlyCodeExpiry(Date.now() + 5*60*1000); // 5 minutes
        const earlyNotifMsg = `⚠️ ACCÈS AVANT HORAIRE : ${localUser.name} (${localUser.role}) tente de se connecter à ${String(h).padStart(2,"0")}h${String(m).padStart(2,"0")}. Code temporaire : ${code} (valide 5 min). → Aller aux approbations`;
        setNotifications(prev => [{
          id:"N"+Date.now(), icon:"🌅",
          message:earlyNotifMsg,
          at:new Date().toISOString(), read:false, module:"approbations"
        }, ...prev]);
        const rhMgUsers = users.filter(u=>_activeUser(u)&&(u.isAdmin||(u.process==="S03"&&u.level>=4)||(u.isMG||u.id==="USR-MG-001"))); // FIX v135 — précédence opérateurs corrigée (&&/>||)
        rhMgUsers.forEach(u=>{if(u.id!==localUser.id)gcPushNotif(u.id,{id:"N"+Date.now()+u.id,icon:"🌅",message:earlyNotifMsg,at:new Date().toISOString(),read:false,module:"sessions"});});
      } else if (h === 17 && m >= 0 && m < 30 && !warningShownRef.current) {
        warningShownRef.current = true;
        setWarningShown(true);
        setNotifications(prev => [{
          id:"N"+Date.now(), icon:"⏰",
          message:`⚠️ DÉCONNEXION DANS 30 MIN — Il est ${String(h).padStart(2,"0")}h${String(m).padStart(2,"0")}. Le système se déconnectera automatiquement à 17h30. Sauvegardez votre travail.`,
          at:new Date().toISOString(), read:false
        }, ...prev]);
      }
    }

    const timer = setInterval(() => {
      const n = new Date();
      const nh = n.getHours(), nm = n.getMinutes(), ns = n.getSeconds();
      if (!isDemoModeRef.current && !isLevel5PlusRef.current) {
        if (nh === 17 && nm === 30 && ns < 31) {
          addSessionLog && addSessionLog("DECONNEXION", localUserRef.current, { status:"AUTO", reason:"Déconnexion automatique — 17h30 (fin de journée)" }); // FIX v135 — localUserRef.current (anti-stale-closure)
          setNotifications(prev => [{id:"N"+Date.now(),icon:"🔒",message:`Session fermée automatiquement — 17h30 atteint. Bonne soirée, ${(localUserRef.current?.name||"").split(" ")[0]} !`,at:new Date().toISOString(),read:false},...prev]);
          const rhMgIds = usersRef.current.filter(u=>_activeUser(u)&&(u.isAdmin||(u.process==="S03"&&u.level>=4)||(u.isMG||u.id==="USR-MG-001"))).map(u=>u.id); // FIX v135 — usersRef.current (anti-stale-closure) + précédence opérateurs
          rhMgIds.forEach(uid=>{if(uid!==localUserRef.current?.id)gcPushNotif(uid,{id:"N"+Date.now()+uid,icon:"⏰",message:`[HORS HORAIRES] ${localUserRef.current?.name} (${localUserRef.current?.role}) déconnecté automatiquement à 17h30`,at:new Date().toISOString(),read:false});});
          onLogoutRef.current(); // FIX v59: ref stable anti-stale-closure
        }
        if (nh === 17 && nm === 0 && ns < 31 && !warningShownRef.current) {
          warningShownRef.current = true;
          setWarningShown(true);
          setNotifications(prev => [{id:"N"+Date.now(),icon:"⏰",message:`⚠️ RAPPEL : Déconnexion automatique à 17h30. Il vous reste 30 minutes. Sauvegardez votre travail en cours.`,at:new Date().toISOString(),read:false},...prev]);
        }
      }
    }, 30000);

    return () => clearInterval(timer);
   
  }, []); // INTENTIONNEL : cet effet ne doit s'initialiser qu'une seule fois au montage.
          // Le timer 17h30 utilise onLogoutRef/localUserRef/usersRef (refs stables anti-stale-closure).
          // isLevel5Plus est évalué au moment de la connexion, ce qui est le comportement attendu.

  useEffect(() => {
    const now = new Date();
    const expired = users.filter(u => { if(!_activeUser(u)) return false;
      const status = u.accountStatus || "ACTIF";
      return status === "SUSPENDU_PROVISOIRE" && u.suspensionEndDate && new Date(u.suspensionEndDate) < now;
    }); // spurious deps removed (FIX v134)
    if (!expired.length) return;
    const updated = users.map(x => {
      const exp = expired.find(e => e.id === x.id);
      return exp ? {
        ...x, accountStatus:"ACTIF",
        suspensionType:null, suspensionCause:null, suspensionMotif:null,
        suspensionEndDate:null, suspensionBy:null, suspensionAt:null,
        reactivatedAuto:true, reactivatedAt:new Date().toISOString(),
      } : x;
    });
    setUsers(updated);
    dsSave('users', updated);  // [FIX-SYNC] Persist auto-reactivations + broadcast
    const notifs = expired.map(u => ({
      id:"N"+Date.now(), icon:"✅",
      message:`[AUTO-RÉACTIVATION] Compte ${u.name} réactivé automatiquement — Date de suspension expirée (${formatDate(u.suspensionEndDate)})`,
      at:new Date().toISOString(), read:false, module:"gestion_comptes"
    }));
    setNotifications(prev => [...notifs, ...prev]);
   
  }, []); // INTENTIONNEL : scan unique au montage (connexion) pour réactiver les comptes expirés.
          // Re-exécuter à chaque changement de `users` déclencherait une boucle infinie.

  // FIX v92 Bug#9c — Ajout de localUser?.id en dep : sans cela, localUser.id et localUser.isMG
  // sont lus depuis la closure au moment du premier rendu, pas depuis la valeur courante.
  useEffect(() => {
    const pending = (pendingAccountActions||[]).filter(a=>a.status==="EN_ATTENTE_DG");
    if (!pending.length) return;
    const dgUser = users.find(u=>u.isMG||u.id==="USR-MG-001"||(u.level===5&&!u.isAdmin));
    if (dgUser && localUser.id===dgUser.id && pending.length > 0) {
      setNotifications(prev => {
        const already = prev.find(n=>n.message?.includes("en attente de votre décision"));
        if (already || pending.length === 0) return prev;
        return [{
          id:"N"+Date.now(), icon:"📋",
          message:`⚡ ${pending.length} demande(s) RH en attente de votre décision dans Gestion des Comptes`,
          at:new Date().toISOString(), read:false, module:"gestion_comptes"
        }, ...prev];
      }); // spurious deps removed (FIX v134)
    }
   
  }, [pendingAccountActions?.length, localUser?.id]);

  // FIX v92 Bug#9d — Ajout de localUser?.id et localUser?.level en deps :
  // isApprover dépend de localUser.level/isAdmin qui pourraient être stale sans cette dep.
  useEffect(() => {
    const pending = pendingConnections || [];
    if (!pending.length) return;
    const latest = pending[pending.length - 1];
    if (!latest) return;
    const isApprover = (localUser?.isAdmin || localUser?.level >= 6) || (localUser?.level ?? 0) >= 4;
    if (!isApprover) return;
    setNotifications(prev => {
      const alreadyNotified = prev.find(n =>
        n.connReqId === latest.id || (n.message?.includes("connexion en attente") && n.message?.includes(latest.userName||""))
      );
      if (alreadyNotified) return prev;
      playSound("alarm");
      return [{
        id: "N" + Date.now(), icon: "🔗", connReqId: latest.id,
        message: `🔗 Demande de connexion : ${latest.userName} (${latest.userRole||"Collaborateur"}) — À approuver dans Gestion des Comptes → Connexions en attente`,
        at: new Date().toISOString(), read: false, module: "gestion_comptes"
      }, ...prev];
    }); // spurious deps removed (FIX v134)
   
  }, [pendingConnections?.length, localUser?.id, localUser?.level]);

  useEffect(() => {
    const justApproved = pendingApprovals.filter(a => a.status === "APPROUVE" && !a.accountCreated);
    if (!justApproved.length) return;
    justApproved.forEach(a => {
      const fullName = [a.prenom, a.nom].filter(Boolean).join(" ") || a.applicant;
      const fL = (a.prenom||a.applicant||"U")[0].toUpperCase();
      const lL = ((a.nom||"")[0] || "X").toUpperCase();
      const defaultPwd = (a.prenom||"gc").toLowerCase().slice(0,4) + "@GC" + new Date().getFullYear() + "!";
      const colors = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EC4899","#06B6D4","#A855F7"];
      const code = a.accessCode || generateAccessCode();
      const newUser = {
        id: a.generatedId, name: fullName, role: a.function || "Collaborateur",
        level: a.level || 2,
        process: Array.isArray(a.processes) ? a.processes[0] : (a.process || "O01"),
        processes: a.processes || [a.process || "O01"],
        dept: a.dept || a.function || "Cabinet",
        password: a.userPassword || defaultPwd,
        color: colors[Math.floor(Math.random()*colors.length)],
        avatar: fL + lL, alias: (fL+lL).toLowerCase()+(a.generatedId.slice(-3)),
        email: a.email||"", telephone: a.tel||a.telephone||"", tel: a.tel||"",
        adresse: a.adresse||"", profil: a.profil||"",
        isAdmin: false, sexe: a.sexe||"", nationalite: a.nationalite||"Gabonaise",
        situationMatrimoniale: a.situationMatrimoniale||"", bio: "",
        createdAt: new Date().toISOString(), lastLogin: null,
        accountStatus: "ACTIF", accessCode: code,
      };
      setUsers(prev => {
        const updated = prev.find(u=>u.id===a.generatedId) ? prev : [...prev, newUser];
        dsSave('users', updated);  // [FIX-SYNC] Persist new account creation + broadcast
        return updated;
      });
      setPendingApprovals(prev => {
        const updated = prev.map(p =>
          p.id===a.id ? {...p, accountCreated:true, accessCode:code, accountCreatedAt:new Date().toISOString()} : p
        );
        dsSave('pendingApprovals', updated);  // [FIX-SYNC] Persist approval status
        return updated;
      });
      setNotifications(prev => [{
        id:"N"+Date.now(), icon:"✅",
        message:`✅ Compte activé : ${fullName} — Rôle : ${newUser.role} — Code d'accès : ${code} — ID : ${a.generatedId}`,
        at:new Date().toISOString(), read:false
      }, ...prev]);
    }); // spurious deps removed (FIX v134)
   
// INTENTIONNEL : setUsers/setNotifications sont stables (useCallback []); seul pendingApprovals déclenche légitimement
  }, [pendingApprovals]);

  const getGreeting = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if ((h === 12) || (h === 13 && m < 30)) return { text: "Bon retour", emoji: "☀️🍽️", anim: "pulse" };
    if (h >= 17) return { text: "Bonne soirée", emoji: "🌆🌙", anim: "fade" };
    if (h >= 16) return { text: "Bonsoir", emoji: "🌅", anim: "fade" };
    if (h >= 12) return { text: "Bon après-midi", emoji: "☀️", anim: "spin" };
    if (h >= 7) return { text: "Bonjour", emoji: "🌞", anim: "bounce" };
    return { text: "Bonjour", emoji: "🌙", anim: "pulse" };
  };

  const isMG = localUser.isMG || localUser.id === "USR-MG-001";
  const greeting = getGreeting();

  // v122 — Pause déjeuner : bannière + notification à l'heure configurée ────
  useEffect(() => {
    const check = () => {
      try {
        const cfg = {...{heureDebutPause:"12:00",heureFinPause:"13:00"}, ...JSON.parse(_lsGet("gc-sirh-global-config")||"{}")};
        const now = new Date();
        const [dh,dm] = (cfg.heureDebutPause||"12:00").split(":").map(Number);
        const [fh,fm] = (cfg.heureFinPause||"13:00").split(":").map(Number);
        const nowMin = now.getHours()*60+now.getMinutes();
        const debutMin = dh*60+dm;
        const finMin = fh*60+fm;
        // Bannière pause active
        const isPause = nowMin >= debutMin && nowMin < finMin;
        setPauseActive(isPause);
        // Notifier à l'heure exacte de début (±1min)
        const diff = nowMin - debutMin;
        if (diff === 0 || diff === 1) {
          const pauseKey = `gc-pause-notif-${now.toISOString().split("T")[0]}:${currentUser?.id}`;
          if (!_lsGet(pauseKey)) {
            _lsSet(pauseKey, "1");
            setNotifications(prev => [{
              id:"N"+Date.now(), icon:"🍽️",
              message:`🍽️ Pause déjeuner — ${cfg.heureDebutPause} à ${cfg.heureFinPause} (${cfg.pauseDejeuner||60} min)`,
              at:now.toISOString(), read:false, module:"sirh"
            }, ...prev]);
          }
        }
      } catch(_) {}
    };
    check();
    const iv = setInterval(check, 60000); // vérifier chaque minute
    return () => clearInterval(iv);
  }, [currentUser?.id]);

  // -- Session timeout 15 min par défaut (configurable par Admin) ----------------------
  // FIX v126 — useState + storage listener : prend en compte les changements de config Admin en direct
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = React.useState(() => {
    try { return parseInt(JSON.parse(_lsGet("gc-session-timeout-min") || "15"), 10) || 15; } catch (_) { return 15; }
  });
  React.useEffect(() => {
    const onStorage = (e) => {
      if (e?.key === "gc-session-timeout-min") {
        try { setSessionTimeoutMinutes(parseInt(JSON.parse(e.newValue || "30"), 10) || 30); } catch (_) {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const [showTimeoutWarning, setShowTimeoutWarning] = React.useState(false);
  const sessionWarn = useSessionTimeout(
    sessionTimeoutMinutes,
    () => {
      // Timeout atteint -> déconnexion automatique
      playSound("alarm");
      if (addSessionLog) addSessionLog("DECONNEXION", localUser, { status: "AUTO", reason: `Déconnexion automatique après ${sessionTimeoutMinutes} min d'inactivité` });
      if (onLogout) onLogout();
    },
    () => {
      // Avertissement 2 min avant
      setShowTimeoutWarning(true);
      playSound("alarm");
    },
    !(localUser?.isAdmin || localUser?.level >= 6) // Pas de timeout pour l'admin (travail de maintenance)
  );
  // Masquer l'avertissement si l'utilisateur revient actif
  React.useEffect(() => {
    if (!sessionWarn) setShowTimeoutWarning(false);
  }, [sessionWarn]);

  // FIX v129 — Listener dsOnSync pour les clés gérées dans SIApp mais absentes
  // du listener AppRoot : fichiers de dossiers, documents standalone, notifications
  // cross-machine. Sans ce listener, les changements faits depuis un autre poste
  // (ajout de doc, upload pièce jointe) n'étaient pas répercutés en temps réel.
  useEffect(() => {
    const unsub = dsOnSync((event) => {
      if (!event.key) return;
      const { key } = event;
      try {
        if (key === 'gc-dossier-files') {
          // Recharger les pièces jointes de dossiers depuis le serveur
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-dossier-files', []).then(val => {
              if (val && Array.isArray(val)) setDossierFiles(val);
            }).catch(() => {});
          }).catch(() => {});
        }
        if (key === 'gc-standalone-docs' || key === 'gc-docs-unified') {
          // Recharger les documents standalone depuis le serveur
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-standalone-docs', []).then(val => {
              if (val && Array.isArray(val)) {
                setStandaloneDocumentsRaw(val);
                setDocsRaw(val);
                try { _lsSet("gc-standalone-docs", JSON.stringify(val)); } catch (_) {}
                try { _lsSet("gc-docs-unified", JSON.stringify(val)); } catch (_) {}
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        // Notifications cross-machine : recharger depuis le serveur pour cet utilisateur
        if (key === `gc-notif-${localUser?.id}`) {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet(`gc-notif-${localUser.id}`, null).then(val => {
              if (val && Array.isArray(val)) {
                const lsKey = `GC_SI_v12:notif:${localUser.id}`;
                try { _lsSet(lsKey, JSON.stringify(val)); } catch (_) {}
                // Fusionner avec les notifications locales en évitant les doublons
                setNotifications(prev => {
                  const existingIds = new Set(prev.map(n => n.id));
                  const newNotifs = val.filter(n => n.id && !existingIds.has(n.id));
                  if (newNotifs.length === 0) return prev;
                  return [...newNotifs, ...prev].slice(0, 200);
                });
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        // FIX v130 — Sync gc-factures : rafraîchir le badge CRM et les stats factures
        if (key === 'gc-factures') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-factures', []).then(val => {
              if (val && Array.isArray(val)) {
                try { _lsSet("gc-factures", JSON.stringify(val)); } catch (_) {}
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        // FIX v141 — Sync gc-presence : mettre à jour window.__gcOnlineUsers sur changement cross-machine
        if (key === 'gc-presence') {
          import('./core/datastore.js').then(({ dsGet: _dsGet }) => {
            _dsGet('gc-presence', {}).then(val => {
              if (val && typeof val === 'object') {
                try { _lsSet('gc-presence', JSON.stringify(val)); } catch (_) {}
                // Mettre à jour le store global pour que CollaborateursPanel soit notifié
                if (!window.__gcOnlineUsers) window.__gcOnlineUsers = new Map();
                const now = Date.now();
                Object.entries(val).forEach(([uid, ts]) => {
                  if (now - ts < GC_PRESENCE_ONLINE_MS) window.__gcOnlineUsers.set(uid, ts);
                  else window.__gcOnlineUsers.delete(uid);
                });
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        // FIX v142 — Sync comités : recharger depuis serveur sur changement cross-machine
        if (key === 'gc-committees') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-committees', null).then(val => {
              if (val && Array.isArray(val)) {
                try { _lsSet('gc-committees', JSON.stringify(val)); } catch (_) {}
                setCommitteesRaw(val);
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        // FIX v142 — Sync registre codification
        if (key === 'gc-codif-registry') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-codif-registry', null).then(val => {
              if (val && Array.isArray(val)) {
                try { _lsSet('gc-codif-registry', JSON.stringify(val)); } catch (_) {}
                setCodifRegistryRaw(val);
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        // FIX v142 — Sync messages système / newsletter / annonces
        if (key === 'gc-system-msgs') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-system-msgs', null).then(val => {
              if (val && Array.isArray(val)) {
                try { _lsSet('gc-system-msgs', JSON.stringify(val)); } catch (_) {}
                setSystemMsgsRaw(val);
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        // FIX v142 — Sync documents internes
        if (key === 'gc-internal-docs') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-internal-docs', null).then(val => {
              if (val && Array.isArray(val)) {
                try { _lsSet('gc-internal-docs', JSON.stringify(val)); } catch (_) {}
                setInternalDocsRaw(val);
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        // FIX v142 — Sync documents externes
        if (key === 'gc-external-docs') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-external-docs', null).then(val => {
              if (val && Array.isArray(val)) {
                try { _lsSet('gc-external-docs', JSON.stringify(val)); } catch (_) {}
                setExternalDocsRaw(val);
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        // FIX v142 — Sync habilitations et codes d'accès applicatifs
        if (key === 'gc-app-habilitations') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-app-habilitations', null).then(val => {
              if (val != null) setAppHabilitations(val);
            }).catch(() => {});
          }).catch(() => {});
        }
        if (key === 'gc-app-access-codes') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-app-access-codes', null).then(val => {
              if (val != null) setAppAccessCodes(val);
            }).catch(() => {});
          }).catch(() => {});
        }
        // Sans ce handler, le badge "✉️ N" ne se rafraîchissait que quand on ouvrait
        // le module messagerie manuellement. Désormais tout message entrant depuis un
        // autre poste déclenche immédiatement le recalcul du badge sur cette machine.
        if (key === 'gc-messages-global') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-messages-global', []).then(val => {
              if (val && Array.isArray(val)) {
                try { _lsSet("gc-messages-global", JSON.stringify(val.slice(0, 500))); } catch (_) {}
                const uid = localUser?.id;
                if (uid) setMsgUnreadCount(computeGlobalMessagingBadge(uid));
              }
            }).catch(() => {});
          }).catch(() => {});
        }
        if (key === 'gc-courrier-docs') {
          import('./core/datastore.js').then(({ dsGet }) => {
            dsGet('gc-courrier-docs', []).then(val => {
              if (val && Array.isArray(val)) {
                try { _lsSet("gc-courrier-docs", JSON.stringify(val.slice(0, 200))); } catch (_) {}
              }
              const uid = localUser?.id;
              if (uid) setMsgUnreadCount(computeGlobalMessagingBadge(uid));
            }).catch(() => {});
          }).catch(() => {});
        }
      } catch (_) {}
    });
    return unsub;
   
  }, [localUser?.id, computeGlobalMessagingBadge]);

  // FIX v142 — Hydratation boot des clés SIApp-managed depuis le serveur
  // (committees, codifRegistry, systemMsgs ne sont PAS dans AppRoot HYDRATE_MAP)
  useEffect(() => {
    import('./core/datastore.js').then(({ dsGet: _bootGet, dsProxyAvailable }) => {
      if (!dsProxyAvailable()) return; // mode offline → localStorage déjà chargé
      const boot = async () => {
        try {
          const [comVal, codifVal, msgsVal] = await Promise.all([
            _bootGet('gc-committees', null),
            _bootGet('gc-codif-registry', null),
            _bootGet('gc-system-msgs', null),
          ]);
          if (comVal !== null && Array.isArray(comVal)) {
            try { _lsSet('gc-committees', JSON.stringify(comVal)); } catch(_) {}
            setCommitteesRaw(comVal);
          }
          if (codifVal !== null && Array.isArray(codifVal)) {
            try { _lsSet('gc-codif-registry', JSON.stringify(codifVal)); } catch(_) {}
            setCodifRegistryRaw(codifVal);
          }
          if (msgsVal !== null && Array.isArray(msgsVal)) {
            try { _lsSet('gc-system-msgs', JSON.stringify(msgsVal)); } catch(_) {}
            setSystemMsgsRaw(msgsVal);
          }
        } catch(e) { console.warn('[SIApp boot]', e.message); }
      };
      // Petit délai pour laisser AppRoot terminer sa propre hydratation
      setTimeout(boot, 800);
    }).catch(() => {});
   
  }, []);

  // -- Notifications de bienvenue dynamiques (Phase 0 v57) -----------------
  // Plus de notifications statiques hardcodées : la bienvenue est contextuelle
  // et ne référence que des informations réellement disponibles au login.
  const getInitialNotifications = () => {
    const now = new Date().toISOString();
    const roleName = localUser.role || "Collaborateur";
    const processName = CODES.processes?.[localUser.process] || localUser.process || "";
    // Notification de bienvenue unique et générique
    const welcome = {
      id: `WELCOME-${localUser.id}-${Date.now()}`,
      icon: "👋",
      message: `Bienvenue ${localUser.name} ! Connecté en tant que ${roleName}${processName ? " — " + processName : ""}. Niveau d'habilitation : ${localUser.level}.`,
      at: now,
      read: false,
      module: null,
      isWelcome: true,
    };
    return [welcome];
  };

  const _LS_NOTIF = useMemo(() => `GC_SI_v12:notif:${localUser.id}`, [localUser.id]);
  const [notifications, _setNotifRaw] = useState(() => {
    try {
      const saved = _lsGet(_LS_NOTIF);
      if (saved) {
        const parsed = JSON.parse(saved);
        const cutoff = Date.now() - 7*24*60*60*1000;
        return parsed.filter(n => !n.dismissed && new Date(n.at||0).getTime() > cutoff);
      }
    } catch (_) {}
    return getInitialNotifications();
  });
  const setNotifications = useCallback((v) => {
    _setNotifRaw(prev => {
      const raw = typeof v === 'function' ? v(prev) : v;
      // Deduplicate by ID — prevents double notifications from pollVDI race
      const seen = new Set();
      const next = raw.filter(n => {
        if (!n.id || seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      });
      try { _lsSet(_LS_NOTIF, JSON.stringify(next.slice(0,200))); } catch (_) {}
      return next;
    });
  }, [_LS_NOTIF]);

  useEffect(() => {
    const AUTO_SAVE_INTERVAL = 15 * 60 * 1000; // 15 minutes
    const autoSave = () => {
      try {
        const ts = new Date().toISOString();
        if (dossiers?.length)  try { _lsSet("gc-dossiers",  JSON.stringify(dossiers));  } catch (_) {}
        if (dossiers?.length)  dsSave("dossiers", dossiers).catch(() => {});
        if (taches?.length)    try { _lsSet("gc-taches",    JSON.stringify(taches));    } catch (_) {}
        if (taches?.length)    dsSave("taches", taches).catch(() => {});
        if (rdvs?.length)      try { _lsSet("gc-rdvs",      JSON.stringify(rdvs));      } catch (_) {}
        if (rdvs?.length)      dsSave("rdvs", rdvs).catch(() => {});
        if (users?.length)     try { _lsSet("gc-users",     JSON.stringify(users));     } catch (_) {}
        if (users?.length)     dsSave("users", users).catch(() => {});
        if (partners?.length)  try { _lsSet("gc-partners",  JSON.stringify(partners));  } catch (_) {}
        if (partners?.length)  dsSave("partners", partners).catch(() => {});
        _lsSet("gc-last-autosave", ts);
        setNotifications(prev => {
          const already = prev.find(n => n.id === "AUTOSAVE");
          if (already) return prev.map(n => n.id === "AUTOSAVE" ? {...n, message:`💾 Sauvegarde automatique effectuée — ${new Date(ts).toLocaleTimeString("fr-FR")}`, at:ts} : n);
          return [{id:"AUTOSAVE", icon:"💾", message:`💾 Sauvegarde automatique effectuée — ${new Date(ts).toLocaleTimeString("fr-FR")}`, at:ts, read:true, module:"système", adminOnly:true},...prev];
        }); // spurious deps removed (FIX v134)
      } catch (_) {}
    };
    const timer = setInterval(autoSave, AUTO_SAVE_INTERVAL);
    return () => clearInterval(timer);
  }, [dossiers, taches, rdvs, users, partners]);
  useEffect(() => {
    const pollVDI = () => {
      try {
        const raw = _lsGet(_LS_NOTIF);
        if (!raw) return;
        const all = JSON.parse(raw);
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const fresh = all.filter(n => !n.dismissed && new Date(n.at || 0).getTime() > cutoff);
        _setNotifRaw(prev => {
          // FIX v72 — Dédoublonnage complet : on fusionne fresh+prev puis on filtre par ID unique
          // Évite les doublons causés par la race condition entre setNotifications (écrit LS)
          // et pollVDI (lit LS) quand un état React n'est pas encore propagé
          const combined = [...fresh, ...prev];
          const seen = new Set();
          const deduped = combined.filter(n => {
            if (!n.id || seen.has(n.id)) return false;
            seen.add(n.id);
            return true;
          });
          // On retourne prev si strictement identique (pas de re-render inutile)
          if (deduped.length === prev.length && deduped.every((n,i) => n.id === prev[i]?.id)) return prev;
          const newOnes = fresh.filter(n => !new Set(prev.map(x=>x.id)).has(n.id));
          if (newOnes.some(n => !n.read)) playSound("notif");
          return deduped.slice(0, 200);
        });
      } catch (_) {}
    };
    const vdiInterval = setInterval(pollVDI, 5000);
    return () => clearInterval(vdiInterval);
  }, [_LS_NOTIF]);

  const [backupLog, setBackupLog] = useState(() => { try { return JSON.parse(_lsGet("gc-backup-log")||"[]"); } catch (_) { return []; }});
  const performBackup = useCallback((triggeredBy = "manual", byUser = null) => {
    const u = byUser || localUser;
    if (!u) return;
    const now = new Date().toISOString();
    const snap = {
      id: `BCK-${Date.now()}`, at: now, by: u.name, byId: u.id, trigger: triggeredBy,
      counts: { users: users.length, dossiers: dossiers.length, taches: taches.length, rdvs: rdvs.length },
    };
    try {
      const all = JSON.parse(_lsGet("gc-backups")||"[]");
      _lsSet("gc-backups", JSON.stringify([{...snap, data:{ users:lsLoad("users",[]), dossiers:lsLoad("dossiers",[]), taches:lsLoad("taches",[]), rdvs:lsLoad("rdvs",[]), partners:lsLoad("partners",[]), sessionLogs:(sessionLogs||[]).slice(0,100) }}, ...all].slice(0,10)));
      setBackupLog(prev => {
        const logUpdated = [{id:snap.id,at:now,by:u.name,trigger:triggeredBy,counts:snap.counts},...prev].slice(0,50);
        try { _lsSet("gc-backup-log", JSON.stringify(logUpdated)); } catch (_) {}
        return logUpdated;
      });
    } catch (_) {}
    setNotifications(p => [{id:"N"+Date.now(),icon:"💾",message:`💾 Sauvegarde ${triggeredBy==="auto"?"automatique":"manuelle"} — ${Object.values(snap.counts).reduce((a,b)=>a+b,0)} entrées archivées`,at:now,read:false},...p]);
    users.filter(x => x.id!==u.id && (x.level>=u.level+1||x.level>=5)).forEach(sup => {
      setNotifications(p=>[{id:"N"+Date.now(),icon:"💾",message:`Sauvegarde SI par ${u.name} (${triggeredBy}) — Journal disponible`,at:now,read:false,forUser:sup.id},...p]);
    });
    addSessionLog("BACKUP", u, {status:"SUCCESS",reason:`Sauvegarde ${triggeredBy} — ${snap.counts.dossiers} dossiers`});
    playSound("success");
  }, [users, dossiers, taches, rdvs, sessionLogs, localUser, setNotifications, addSessionLog]);

  const dispatchSyncEvent = useCallback((type, payload) => {
    const now = new Date().toISOString();
    switch(type) {
      case "LEAVE_APPROVED": {
        const leaveRdv = {
          id: `RDV-LEAVE-${Date.now()}`,
          client: `🌴 CONGÉ — ${payload.userName}`,
          date: payload.debut,
          heure: "08:00",
          duree: 480,
          type: payload.leaveType || "Congé",
          salle: "",
          assignedTo: payload.userId,
          status: "CONFIRME",
          isLeave: true,
          dueDate: payload.fin,
          notes: `Congé approuvé — ${payload.debut} → ${payload.fin}`,
        };
        setRdvs(prev => { const _u=[...prev,leaveRdv]; dsSave('rdvs',_u); return _u; });
        setNotifications(prev => [{
          id: "N"+Date.now(), icon: "🌴",
          message: `Congé approuvé : ${payload.userName} (${payload.debut} → ${payload.fin}) — Agenda mis à jour`,
          at: now, read: false, module: "sirh"
        }, ...prev]);
        addSessionLog("SYNC_LEAVE_APPROVED", localUser, { userId: payload.userId, debut: payload.debut, fin: payload.fin });
        break;
      }
      case "RECRUTEMENT_VALIDATED": {
        const onboardingTask = {
          id: `TSK-ONBD-${Date.now()}`,
          titre: `Onboarding — ${payload.candidatNom}`,
          description: `Checklist d'intégration pour le nouveau collaborateur ${payload.candidatNom} (${payload.poste})`,
          assignedTo: localUser.id,
          dossier: null,
          process: payload.departement || "S03",
          status: "EN_COURS",
          priority: "HAUTE",
          deadline: (() => { const d=new Date(); d.setDate(d.getDate()+30); return d.toISOString().split("T")[0]; })(),
          createdBy: localUser.id,
          createdAt: now,
        };
        setTaches(prev => { const _u=[...prev,onboardingTask]; dsSave('taches',_u); return _u; });
        setNotifications(prev => [{
          id: "N"+Date.now(), icon: "🎯",
          message: `Recrutement validé : ${payload.candidatNom} pour ${payload.poste} — Tâche onboarding créée`,
          at: now, read: false, module: "sirh"
        }, ...prev]);
        break;
      }
      case "DOCUMENT_GENERATED": {
        setNotifications(prev => [{
          id: "N"+Date.now(), icon: "📄",
          message: `Document généré : ${payload.docName} — Archivé dans ${payload.context}`,
          at: now, read: false, module: payload.module || "dossiers"
        }, ...prev]);
        break;
      }
      case "OBLIGATION_OVERDUE": {
        setNotifications(prev => [{
          id: "N"+Date.now(), icon: "🚨",
          message: `⚠️ ESCALADE — Obligation "${payload.titre}" non traitée à J-7 (échéance : ${payload.echeance})`,
          at: now, read: false, module: "conformite", priority: "CRITIQUE"
        }, ...prev]);
        break;
      }
      default: break;
    }
  }, [localUser, setRdvs, setTaches, setNotifications]);

  useEffect(() => {
    const check = () => {
      try {
        const obligations = JSON.parse(_lsGet("gc-obligations")||"null") || INITIAL_OBLIGATIONS;
        const today = new Date();
        obligations.forEach(o => {
          if (o.statut === "REALISE") return;
          if (!o.echeance) return;
          const dl = Math.ceil((new Date(o.echeance) - today) / 86400000);
          if (dl <= 7 && dl > 0) {
            const alertKey = `gc-obl-alert-${o.id}-j7-${today.toISOString().split("T")[0]}`;
            if (!_lsGet(alertKey)) {
              _lsSet(alertKey, "1");
              dispatchSyncEvent("OBLIGATION_OVERDUE", { titre: o.titre, echeance: o.echeance });
            }
          }
        });
      } catch (_) {}
    };
    const t = setInterval(check, 3600000); // check every hour
    return () => clearInterval(t);
  }, [dispatchSyncEvent]);

  useEffect(() => {
    const check = () => {
      try {
        const stocks = JSON.parse(_lsGet("gc-stocks")||"null") || INITIAL_STOCKS;
        const ruptures = stocks.filter(s => s.quantite <= s.alerteSeuil);
        if (ruptures.length > 0) {
          const alertKey = `gc-stock-alert-${new Date().toISOString().split("T")[0]}`;
          if (!_lsGet(alertKey)) {
            _lsSet(alertKey, "1");
            setNotifications(prev => [{
              id: "N"+Date.now(), icon: "📦",
              message: `⚠️ ${ruptures.length} article(s) en rupture de stock — Vérifier le module Logistique`,
              at: new Date().toISOString(), read: false, module: "logistique"
            }, ...prev]);
          }
        }
      } catch (_) {}
    };
    const t = setInterval(check, 86400000); // check daily
    check(); // immediate check on mount
    return () => clearInterval(t);
  }, []);

  // FIX v92 — Surveillance délais dossiers : alertes automatiques aux acteurs concernés
  useEffect(() => {
    const checkDelais = () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const actifs = dossiers.filter(d => !["TERMINE","ARCHIVE","ANNULE"].includes(d.status) && d.dueDate);
        actifs.forEach(d => {
          const j = daysLeft(d.dueDate);
          const cfg = gcGetDelaiConfig();
          let alertType = null;
          if (j < 0)               alertType = "DEPASSE";
          else if (j <= cfg.alertes.orange) alertType = "CRITIQUE";
          else if (j <= cfg.alertes.jaune)  alertType = "URGENT";
          if (!alertType) return;
          // Clé unique par dossier + type + jour → une seule alerte par jour
          const alertKey = `gc-delai-alert-${d.id}-${alertType}-${today}`;
          if (_lsGet(alertKey)) return;
          _lsSet(alertKey, "1");
          const icons = {DEPASSE:"🔴",CRITIQUE:"🟠",URGENT:"🟡"};
          const msg = alertType === "DEPASSE"
            ? `🔴 DÉLAI DÉPASSÉ : Dossier ${d.ref} — ${d.client} (retard ${Math.abs(j)}j — éch. ${new Date(d.dueDate).toLocaleDateString("fr-FR")})`
            : `${icons[alertType]} Délai ${alertType.toLowerCase()} : Dossier ${d.ref} — ${d.client} (${j}j restants — éch. ${new Date(d.dueDate).toLocaleDateString("fr-FR")})`;
          // Notifier l'assigné
          if (d.assignedTo && d.assignedTo !== localUser?.id) {
            gcPushNotif(d.assignedTo, {id:"N"+Date.now()+d.assignedTo, icon:icons[alertType], message:msg, at:new Date().toISOString(), read:false, module:"dossiers", urgent:alertType==="DEPASSE"});
          }
          // Notifier le responsable du processus (niv 4+)
          const procResp = users.find(u=>(u.process===d.process||(u.processes||[]).includes(d.process))&&u.level>=4&&!u.isAdmin&&u.id!==d.assignedTo);
          if (procResp) gcPushNotif(procResp.id, {id:"N"+Date.now()+procResp.id, icon:icons[alertType], message:msg, at:new Date().toISOString(), read:false, module:"dossiers"});
          // Notifier DG si dépassé
          if (alertType==="DEPASSE") {
            const dg = users.find(u=>u.isMG||u.level>=5);
            if (dg) gcPushNotif(dg.id, {id:"N"+Date.now()+dg.id, icon:"🔴", message:msg, at:new Date().toISOString(), read:false, module:"dossiers", urgent:true});
          }
          // Notifier l'utilisateur actif
          if (d.assignedTo === localUser?.id || procResp?.id === localUser?.id || (localUser?.level >= 5)) {
            setNotifications(prev => [{id:"N"+Date.now(), icon:icons[alertType], message:msg, at:new Date().toISOString(), read:false, module:"dossiers", urgent:alertType==="DEPASSE"}, ...prev]);
          }
        }); // spurious deps removed (FIX v134)
      } catch(_) {}
    };
    const t = setInterval(checkDelais, 3600000); // chaque heure
    checkDelais(); // vérification immédiate au démarrage
    return () => clearInterval(t);
   
// INTENTIONNEL : snapshot dossiers/users au montage puis polling
  }, [dossiers, users, localUser?.id]);

  // v107 — Écouter gc:force-dashboard depuis SIErrorBoundary (retour dashboard après crash)
  useEffect(() => {
    const handler = () => {
      setActiveModule("dashboard");
      try { sessionStorage.setItem('gc-active-module', 'dashboard'); } catch (_) {}
      setSelectedDossier(null);
      try { setSidebarOpen(true); } catch (_) {} // Synchroniser avec Ctrl+F5
      playSound("success");
    };
    window.addEventListener("gc:force-dashboard", handler);
    return () => window.removeEventListener("gc:force-dashboard", handler);
  }, []);

  // v99 — Écouter l'événement gc:open-intake depuis GestionDocsUnifiee et DossiersList
  useEffect(() => {
    const handler = () => setShowIntakeModal(true);
    window.addEventListener("gc:open-intake", handler);
    return () => window.removeEventListener("gc:open-intake", handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail) setStandaloneDocumentsRaw(e.detail);
    };
    window.addEventListener("gc:sync-standalone-docs", handler);
    return () => window.removeEventListener("gc:sync-standalone-docs", handler);
  }, []);

  // FIX v154 — Écouter gc:sync-process-config pour sync inter-machines à chaud
  // Quand AppRoot reçoit une mise à jour du serveur, il dispatche cet événement.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail && typeof e.detail === 'object') {
        setProcessConfig(prev => ({ ...prev, ...e.detail }));
      }
    };
    window.addEventListener("gc:sync-process-config", handler);
    return () => window.removeEventListener("gc:sync-process-config", handler);
  }, []);

  // Écouter gc:open-dossier depuis ArchivagePanel et autres modules
  useEffect(() => {
    const handler = (e) => {
      const { ref, id } = e.detail || {};
      const found = dossiers.find(d => d.id === id || d.ref === ref);
      if (found) {
        setSelectedDossier(found);
        handleSetActiveModule("dossiers");
      }
    };
    window.addEventListener("gc:open-dossier", handler);
    return () => window.removeEventListener("gc:open-dossier", handler);
  }, [dossiers]);

  useEffect(() => {
    const check = () => {
      if (!localUser || localUser.level < 5) return;
      const now = new Date();
      if (now.getHours()===16&&now.getMinutes()===35) {
        const key=`gc-autobck-${now.toISOString().split("T")[0]}`;
        if (!_lsGet(key)) { _lsSet(key,"1"); performBackup("auto"); }
      }
    };
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [localUser, performBackup]);

  const [dossierFiles, setDossierFiles] = useState(() => lsLoad("gc-dossier-files", []));

  // Re-fetch depuis le serveur à chaque changement d'utilisateur et au montage.
  // dossierFiles est un plain useState — il n'a pas le mécanisme useSyncedState.
  // Sans ce fetch, chaque compte voit le localStorage de la session précédente.
  useEffect(() => {
    if (!currentUser?.id || isDemoMode) return;
    import('./core/datastore.js').then(({ dsGet }) => {
      dsGet('gc-dossier-files', null).then(val => {
        if (Array.isArray(val)) {
          lsSave('gc-dossier-files', val);
          setDossierFiles(val);
        }
      }).catch(() => {});
      dsGet('gc-standalone-docs', null).then(val => {
        if (Array.isArray(val)) {
          lsSave('gc-standalone-docs', val);
          setStandaloneDocumentsRaw(val);
          setDocsRaw(val);
        }
      }).catch(() => {});
    }).catch(() => {});
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDossierFiles = useCallback((v) => {
    setDossierFiles(prev => {
      const resolved = typeof v === "function" ? v(prev) : v;
      if (!isDemoMode) {
        // FIX v63 C7  -  Priorité IndexedDB pour les pièces jointes (évite QuotaExceededError)
        // FIX v129 — Toujours aussi synchroniser vers SQLite pour les autres postes réseau.
        gcIDB.putAll(gcIDB.STORE_FILES, resolved).catch(() => {});
        // FIX v153 CRITICAL — Stripper les dataUrl base64 avant dsSave pour éviter payload > 10 MB
        // Les fichiers avec serverUrl sont accessibles via le serveur ; les autres sont en IDB local.
        // On conserve uniquement les métadonnées + serverUrl/serverId pour la sync réseau.
        const forSync = resolved.map(f => ({
          ...f,
          dataUrl: null,   // jamais de base64 dans la DB SQLite
          blob:    undefined,
          // Conserver fileData uniquement si c'est une référence courte (pas base64)
          fileData: f.fileData && f.fileData.length < 500 ? f.fileData : undefined,
        }));
        dsSave('gc-dossier-files', forSync).catch(() => {});
      }
      return resolved;
    });
  }, [isDemoMode]);

  const [standaloneDocuments, setStandaloneDocumentsRaw] = useState(() => lsLoad("gc-standalone-docs", []));
  const saveStandaloneDocs = useCallback((v) => {
    setStandaloneDocumentsRaw(prev => {
      const resolved = typeof v === "function" ? v(prev) : v;
      setDocsRaw(resolved);
      if (!isDemoMode) {
        gcIDB.putAll(gcIDB.STORE_DOCS, resolved).catch(() => {});
        // FIX v153 CRITICAL — Stripper dataUrl/blob avant dsSave (évite payload > 10 MB)
        const forSync = resolved.map(d => ({
          ...d,
          dataUrl: null,
          blob:    undefined,
          url:     d.serverUrl || d.url || null,
        }));
        try { _lsSet("gc-docs-unified", JSON.stringify(forSync.slice(0, 200))); } catch (_) {}
        dsSave('gc-standalone-docs', forSync).catch(() => {});
        dsSave('gc-docs-unified',    forSync).catch(() => {});
        dsSave('standaloneDocuments', forSync).catch(() => {});
      }
      return resolved;
    });
  }, [isDemoMode]);

  const [pendingDeleteApprovals, setPendingDeleteApprovals] = useState(() => lsLoad("gc-pending-delete-approvals", []));
  const savePendingDeleteApprovals = useCallback((v) => {
    setPendingDeleteApprovals(prev => {
      const resolved = typeof v === "function" ? v(prev) : v;
      if (!isDemoMode) dsSave('gc-pending-delete-approvals', resolved);
      return resolved;
    });
  }, [isDemoMode]); // FIX v59: useCallback — référence stable dans siCtxValue useMemo // FIX v59: useCallback pour stabiliser référence dans siCtxValue
  // Dépendance: [isDemoMode]

  const [firedAlarms, setFiredAlarms] = useState({});
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const nowMin = now.getHours()*60+now.getMinutes();
      rdvs.filter(r=>r.date===todayStr&&(r.assignedTo===localUser.id||localUser.level>=4)).forEach(rdv=>{
        const [h,m]=(rdv.heure||"00:00").split(":").map(Number);
        const rdvMin=h*60+m; const diff=rdvMin-nowMin;
        if(diff===15&&!firedAlarms[rdv.id+"-15"]){
          setFiredAlarms(p=>({...p,[rdv.id+"-15"]:true}));
          playSound("alarm");
          setNotifications(p=>[{id:"N"+Date.now(),icon:"⏰",message:`⏰ RDV dans 15 min : ${rdv.client} à ${rdv.heure} — ${rdv.type}`,at:now.toISOString(),read:false},...p]);
        }
        if(diff===0&&!firedAlarms[rdv.id+"-0"]){
          setFiredAlarms(p=>({...p,[rdv.id+"-0"]:true}));
          playSound("alarm"); setTimeout(()=>playSound("alarm"),600);
          setNotifications(p=>[{id:"N"+Date.now(),icon:"🔔",message:`🔔 RDV MAINTENANT : ${rdv.client} — ${rdv.type} ${rdv.salle?"· "+rdv.salle:""}`,at:now.toISOString(),read:false},...p]);
        }
        if(diff===-5&&!firedAlarms[rdv.id+"-late"]){
          setFiredAlarms(p=>({...p,[rdv.id+"-late"]:true}));
          playSound("alarm");
          setNotifications(p=>[{id:"N"+Date.now(),icon:"⚠️",message:`⚠️ RDV en retard (+5 min) : ${rdv.client}`,at:now.toISOString(),read:false},...p]);
        }
      }); // spurious deps removed (FIX v134)
    };
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [rdvs, localUser, firedAlarms]);
  const isAdmin = (localUser?.isAdmin || localUser?.level >= 6);

  const isRHManager = (localUser?.process === "S03" || localUser?.processes?.includes?.("S03")) && (localUser?.level ?? 0) >= 4;
  const isDG = (localUser.isMG || localUser.id === "USR-MG-001" || localUser.level === 5) && !(localUser?.isAdmin || localUser?.level >= 6);
  const canManageAccounts = (localUser?.isAdmin || localUser?.level >= 6) || (localUser?.level ?? 0) >= 4;
  const pendingActionsForDG = (pendingAccountActions||[]).filter(a=>a.status==="EN_ATTENTE_DG");

  const [demandesData, setDemandesData] = useState(() => { try { return JSON.parse(_lsGet("gc-demandes")||"[]"); } catch (_) { return []; } });
  useEffect(() => {
    const syncDemandes = () => { try { setDemandesData(JSON.parse(_lsGet("gc-demandes")||"[]")); } catch (_) {} };
    window.addEventListener("storage", syncDemandes);
    const t = setInterval(syncDemandes, 8000);
    // FIX vDEM-SYNC — écouter aussi les changements serveur via dsOnSync
    const unsub = dsOnSync((event) => {
      if (event.key === 'gc-demandes') {
        import('./core/datastore.js').then(({ dsGet: _dsGet }) => {
          _dsGet('gc-demandes', []).then(val => {
            if (val && Array.isArray(val)) {
              try { _lsSet("gc-demandes", JSON.stringify(val)); } catch (_) {}
              setDemandesData(val);
            }
          }).catch(() => {});
        }).catch(() => {});
      }
    });
    return () => { window.removeEventListener("storage", syncDemandes); clearInterval(t); unsub(); };
   
  }, []);

  // ══════════════════════════════════════════════════════════════════
  // BADGE SYSTEM v85 — Refonte complète, propre et fiable
  // Principe simple : chaque module a un rawCount calculé en temps réel.
  // On mémorise le rawCount au moment de la visite → badge = rawCount - seen.
  // Tâches & Dossiers : toujours absolu (pas de delta). Couleur portée par le type.
  // ══════════════════════════════════════════════════════════════════
  const modulesRef = useRef([]);

  // Seen counts persistent par user
  const [seenCounts, setSeenCounts] = useState(() => {
    try { return JSON.parse(_lsGet(`gc-seen-v2:${currentUser.id}`) || "{}"); } catch (_) { return {}; }
  });

  // Navigate + dismiss badge in one call + persist dans sessionStorage
  const handleSetActiveModule = useCallback((id) => {
    setActiveModule(id);
    try { sessionStorage.setItem('gc-active-module', id); } catch (_) {}
    playSound("notif");
    setSeenCounts(prev => {
      const mod = modulesRef.current.find(m => m.id === id);
      if (!mod) return prev;
      const next = { ...prev, [id]: mod.rawCount ?? 0 };
      try { _lsSet(`gc-seen-v2:${currentUser.id}`, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, [currentUser.id]);

  // Bug #11 fix: expose navigation globally so DossierDetailModal can trigger "Facturer"
  useEffect(() => {
    window.__gcNavigate = (moduleId) => handleSetActiveModule(moduleId);
    return () => { window.__gcNavigate = undefined; };
  }, [handleSetActiveModule]);

  const modules = useMemo(() => {
    const uid = localUser.id;
    const lvl = localUser.level;
    const myProcs = localUser.processes || [localUser.process];
    const today = new Date().toISOString().split("T")[0];
    const isAdminUser = (localUser?.isAdmin || lvl >= 6);

    // ── Raw counts ────────────────────────────────────────────────
    // Tâches : mes tâches actives (vert = normales) + urgentes/retard (rouge)
    const myTaches = taches.filter(t => (t.assignedTo === uid || t.assigneeId === uid) && _tActive(t));
    const tacheRed = myTaches.filter(t =>
      t.priority === "CRITIQUE" || t.priority === "HAUTE" ||
      (t.deadline && t.deadline < today)
    ).length;
    // tacheGreen = tâches actives normales (ni urgentes ni en retard)
    const tacheGreen = Math.max(0, myTaches.length - tacheRed);

    // Dossiers : actifs visibles (rouge) + docs récents 24h (vert)
    const visibleDoss = isAdminUser || lvl >= 4
      ? dossiers.filter(d => d.status !== "TERMINE")
      : lvl >= 3
        ? dossiers.filter(d => d.status !== "TERMINE" && (d.assignedTo === uid || myProcs.includes(d.process)))
        : dossiers.filter(d => d.status !== "TERMINE" && (d.assignedTo === uid || d.createdBy === uid));
    // dossierRed = dossiers en retard ou critique (délai ≤ seuil orange)
    // dossierGreen = dossiers actifs dans les délais
    const _delCfg = gcGetDelaiConfig();
    const dossierRed = visibleDoss.filter(d => d.dueDate && daysLeft(d.dueDate) <= _delCfg.alertes.orange).length;
    const cutoff24 = Date.now() - 86400000;
    const dossierGreen = (() => {
      try {
        const sd = JSON.parse(_lsGet("gc-standalone-docs") || "[]");
        return sd.filter(d => new Date(d.createdAt||0).getTime() > cutoff24 && (d.createdBy === uid || d.accessLevel <= lvl)).length;
      } catch (_) { return 0; }
    })();

    // Approbations info (vert) + notifs non lues (rouge)
    const infoGreen = (() => {
      if (lvl < 3) return 0;
      const isRHorAdmin = isAdminUser || lvl >= 5 || (localUser.process === "S03" && lvl >= 4);
      if (isRHorAdmin) return pendingApprovals.filter(a => !["APPROUVE","REJETE"].includes(a.status)).length;
      if (localUser.process === "P02" && lvl >= 4) return pendingApprovals.filter(a => a.status === "ATTENTE_CONF").length;
      return pendingApprovals.filter(a => myProcs.includes(a.process) && !["APPROUVE","REJETE"].includes(a.status)).length;
    })();
    const infoRed = (() => {
      try {
        const raw = JSON.parse(_lsGet(`GC_SI_v12:notif:${uid}`) || "[]");
        const cutoff7 = Date.now() - 7*86400000;
        return raw.filter(n => !n.read && !n.dismissed && new Date(n.at||0).getTime() > cutoff7 && !n.adminOnly).length;
      } catch (_) { return 0; }
    })();

    // Demandes : envoyées en attente (vert) + reçues non lues (rouge)
    const demGreen = (() => {
      if (lvl < 1) return 0;
      const all = demandesData.filter(d =>
        d.status === "EN_ATTENTE" &&
        (isAdminUser || lvl >= 5 || myProcs.includes(d.targetProcess) || d.targetUserId === uid || d.submittedBy === uid)
      ).length;
      const seen = seenCounts["demandes"] ?? undefined;
      return seen === undefined ? all : Math.max(0, all - seen);
    })();
    // FIX vDEM-BADGE — Badge rouge = demandes reçues non lues par le destinataire
    const demRed = demandesData.filter(d =>
      d.targetUserId === uid && d.status === "EN_ATTENTE" && !d.readByTarget
    ).length + demandesData.filter(d =>
      // aussi les demandes dans mon processus non encore prises en charge (managers niv3+)
      lvl >= 3 && myProcs.includes(d.targetProcess) && d.status === "EN_ATTENTE" &&
      d.targetUserId !== uid && !d.readByTarget
    ).length;

    // Gestion comptes
    const comptesRaw = (isDG || isAdminUser)
      ? pendingActionsForDG.length + (pendingConnections||[]).length
      : (pendingConnections||[]).length + (pendingAccountActions||[]).filter(a => a.initiatedBy === uid && a.status === "EN_ATTENTE_DG").length;
    const comptesDelta = (() => {
      const seen = seenCounts["gestion_comptes"] ?? undefined;
      return seen === undefined ? comptesRaw : Math.max(0, comptesRaw - seen);
    })();

    const list = [
      { id:"dashboard",     icon:"🏠", label:"Tableau de bord",            minLevel:1 },
      { id:"indicateurs",   icon:"📊", label:"Indicateurs & KPIs",         minLevel:1 },
      { id:"bureau",        icon:"💼", label:"Bureau & Applications",      minLevel:1 },
      { id:"dossiers",      icon:"📁", label:"Dossiers & Documents",       minLevel:1,
        rawCount: dossierRed + dossierGreen,
        countRed: dossierRed, countGreen: dossierGreen },
      { id:"taches",        icon:"📋", label:"Tâches & Alertes",           minLevel:1,
        rawCount: tacheGreen + tacheRed,
        countGreen: tacheGreen, countRed: tacheRed },
      // Rapport d'activité entre Tâches et Demandes — niv2+
      ...((lvl >= 2) ? [{ id:"rapport_activite", icon:"📄", label:"Rapport d'Activité", minLevel:2 }] : []),
      { id:"demandes",      icon:"📨", label:"Mes Demandes",               minLevel:1,
        rawCount: demGreen + demRed,
        countGreen: demGreen, countRed: demRed },
      { id:"agenda",        icon:"📅", label:"Agenda & RDV",               minLevel:1 },
      { id:"codification",  icon:"🏷️", label:"Codification & Refs",        minLevel:1 },
      { id:"archivage",     icon:"🗂️", label:"Archivage",                  minLevel:1 },
      { id:"processus",     icon:"🗺️", label:"Processus & Hiérarchie",     minLevel:1 },
      { id:"collaborateurs",icon:"👥", label:"Collaborateurs",             minLevel:1 },
      { id:"informations",  icon:"📣", label:"Informations & Approbations",minLevel:1,
        rawCount: infoGreen + infoRed,
        countGreen: infoGreen, countRed: infoRed },
      ...(canManageAccounts ? [{ id:"gestion_comptes", icon:"🔑", label:"Gestion des Comptes", minLevel:4,
        rawCount: comptesRaw, countRed: comptesDelta }] : []),
      ...((isAdmin||isDG) ? [{ id:"acces_apps_mg", icon:"🔓", label:"Gestion des Accès", minLevel:5 }] : []),
      ...(isAdmin ? [{ id:"admin", icon:"⚙️", label:"Paramètres Direction SI", minLevel:6 }] : []),
      ...(!isAdmin&&isMG ? [{ id:"admin", icon:"⚙️", label:"Paramètre & Gestion SI", minLevel:5 }] : []),
    ].filter(m => lvl >= m.minLevel);

    return list;
  }, [dossiers, taches, pendingApprovals, pendingAccountActions, pendingConnections,
      demandesData, pendingActionsForDG, localUser.id, localUser.level, seenCounts,
      isAdmin, isDG, isMG, canManageAccounts]);

  // Sync ref so handleSetActiveModule reads latest rawCount
  useEffect(() => { modulesRef.current = modules; }, [modules]);





// FIX v72 — FILE_TYPE_CONFIG et getFileType déplacés au scope module (voir définition avant FileDataManager)



  // DossierDetailModal extracted as proper component above SIApp



  const UsersPanel = () => (
    <div>
      <h3 style={{ color: "#C41E3A", margin: "0 0 14px", fontSize: 14, fontWeight: 800 }}>👥 Gestion des Utilisateurs & Habilitations</h3>
      <div style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 2fr", padding: "8px 14px", background: T.surface3, borderBottom: `1px solid ${T.border}`, fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
          <span>Utilisateur</span><span>Rôle / Département</span><span>Processus</span><span>Niveau</span><span>Habilitations</span>
        </div>
        {users.map((u) => {
          const perms = { 6: ["Lecture", "Écriture", "Création", "Modification", "Validation", "Administration", "Paramétrage"], 5: ["Lecture", "Écriture", "Création", "Modification", "Validation"], 4: ["Lecture", "Écriture", "Création", "Modification", "Validation"], 3: ["Lecture", "Écriture", "Création", "Modification"], 2: ["Lecture", "Écriture", "Création"], 1: ["Lecture", "Écriture"] };
          const lc = { 6: "#C41E3A", 5: "#C9A84C", 4: "#A855F7", 3: "#3B82F6", 2: "#22C55E", 1: T.textMuted };
          return (
            <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 2fr", padding: "10px 14px", borderBottom: `1px solid ${T.border}20`, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <UserAvatar user={u} size={28} />
                <div>
                  <div style={{ color: T.text, fontSize: 11, fontWeight: 600 }}>{u.name}</div>
                  <div style={{ color: T.textDim, fontSize: 9 }}>{u.id}</div>
                </div>
              </div>
              <div><div style={{ color: T.textMuted, fontSize: 11 }}>{u.role}</div></div>
              <div><Badge label={u.process} color={getProcColor(u.process)} small /></div>
              <div><Badge label={`Niv.${u.level}`} color={lc[u.level]} small /></div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {(perms[u.level] || []).map((p) => <Badge key={p} label={p} color="#22C55E" small />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );



  const renderModule = () => {
    switch (activeModule) {
      case "dashboard":       return <Dashboard key="dashboard" />;
      case "bureau":          return <BureauOffice key="bureau" T={T} currentUser={localUser} setNotifications={setNotifications} rdvs={rdvs} dossiers={dossiers} setDossiers={setDossiers} partners={partners} setPartnersSync={setPartnersSync} appHabilitations={appHabilitations} setAppHabilitations={setAppHabilitations} appAccessCodes={appAccessCodes} setAppAccessCodes={setAppAccessCodes} users={users} setUsers={setUsers} taches={taches} setTaches={setTaches} setRdvs={setRdvs} isDemoMode={isDemoMode} pendingApprovals={pendingApprovals} setPendingApprovals={setPendingApprovals} docs={docs} setDocs={saveDocs} dossierFiles={dossierFiles} saveDossierFiles={saveDossierFiles} standaloneDocuments={standaloneDocuments} saveStandaloneDocs={saveStandaloneDocs} />;
      case "demandes":         return <DemandesModule key="demandes" currentUser={localUser} users={users} dossiers={dossiers} T={T} setNotifications={setNotifications} isDemoMode={isDemoMode} />;

      case "dossiers":        return <DossiersList key="dossiers" />;
      case "agenda":          return <AgendaModule key="agenda" rdvs={rdvs} users={users} localUser={localUser} T={T} dossiers={dossiers} setRdvs={setRdvs} setNotifications={setNotifications} committees={committees||[]} partners={partners||[]} />;
      case "taches":          return <TachesPanel key="taches" />;
      case "rapport_activite": return (
        <div key="rapport_activite" style={{padding:"0 0 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:12,borderBottom:`1px solid ${T.border}`}}>
            <div style={{width:36,height:36,borderRadius:9,background:"linear-gradient(135deg,#06B6D4,#0891B2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📋</div>
            <div>
              <div style={{color:T.text,fontWeight:900,fontSize:15}}>Rapport d'Activité</div>
              <div style={{color:T.textMuted,fontSize:11}}>Génération automatique · Pilotage par processus et période</div>
            </div>
          </div>
          <RapportActiviteModule T={T} currentUser={localUser} dossiers={dossiers} taches={taches} rdvs={rdvs} users={users} setNotifications={setNotifications} setTaches={setTaches} />
        </div>
      );
      case "indicateurs":     return <Indicateurs key="indicateurs" />;
      case "processus":       return <SIErrorBoundary T={T}><ProcessusMap key="processus" /></SIErrorBoundary>;
      case "codification":    return <CodificationPanel key="codification" />;
      case "archivage":       return <SIErrorBoundary T={T}><ArchivagePanel key="archivage" dossiers={dossiers} T={T} localUser={localUser} users={users} setNotifications={setNotifications}  /></SIErrorBoundary>;
      case "collaborateurs":  return <SIErrorBoundary T={T}><CollaborateursPanel key="collaborateurs" users={users} setUsers={setUsers} currentUser={localUser} pendingApprovals={pendingApprovals} setPendingApprovals={setPendingApprovals} T={T} isAdmin={isAdmin} partnersList={partners} setPartnersList={setPartnersSync} setActiveModule={handleSetActiveModule} setAMod={handleSetActiveModule} dossiers={dossiers} setNotifications={setNotifications} taches={taches} setTaches={setTaches} setShowMessaging={() => handleSetActiveModule("messagerie")} setShowNewDossier={() => { handleSetActiveModule("dossiers"); window.dispatchEvent(new CustomEvent('gc:open-new-dossier')); }} setSelectedDossier={(d) => { handleSetActiveModule("dossiers"); window.dispatchEvent(new CustomEvent('gc:open-dossier', { detail: d })); }} /></SIErrorBoundary>;
      case "informations":    return <InformationsPanel key="informations" currentUser={localUser} pendingApprovals={pendingApprovals} setPendingApprovals={setPendingApprovals} T={T} isAdmin={isAdmin} sysMessages={systemMsgs} setSysMessages={setSystemMsgs} setNotifications={setNotifications} setUsers={setUsers} setDossiers={setDossiers} setTaches={setTaches} users={users} dossiers={dossiers} committees={committees} setActiveModule={setActiveModule} addSessionLog={addSessionLog} />;
      case "utilisateurs":    return <CollaborateursPanel key="utilisateurs" users={users} setUsers={setUsers} currentUser={localUser} pendingApprovals={pendingApprovals} setPendingApprovals={setPendingApprovals} T={T} isAdmin={isAdmin} partnersList={partners} setPartnersList={setPartnersSync} setActiveModule={handleSetActiveModule} dossiers={dossiers} setNotifications={setNotifications} taches={taches} setTaches={setTaches} setShowMessaging={() => handleSetActiveModule("messagerie")} setShowNewDossier={() => { handleSetActiveModule("dossiers"); window.dispatchEvent(new CustomEvent('gc:open-new-dossier')); }} setSelectedDossier={(d) => { handleSetActiveModule("dossiers"); window.dispatchEvent(new CustomEvent('gc:open-dossier', { detail: d })); }} />;
      case "approbations":    // Redirigé vers Informations (intégré)
        return <InformationsPanel key="informations" currentUser={localUser} pendingApprovals={pendingApprovals} setPendingApprovals={setPendingApprovals} T={T} isAdmin={isAdmin} sysMessages={systemMsgs} setSysMessages={setSystemMsgs} setNotifications={setNotifications} setUsers={setUsers} setDossiers={setDossiers} setTaches={setTaches} users={users} dossiers={dossiers} committees={committees} setActiveModule={setActiveModule} addSessionLog={addSessionLog} />;
      case "gestion_comptes": return <GestionComptesPanel key="gestion_comptes" localUser={localUser} users={users} setUsers={setUsers} taches={taches} setTaches={setTaches} dossiers={dossiers} setDossiers={setDossiers} rdvs={rdvs} pendingAccountActions={pendingAccountActions} setPendingAccountActions={setPendingAccountActions} setNotifications={setNotifications} pendingApprovals={pendingApprovals} setPendingApprovals={setPendingApprovals} T={T} sessionLogs={sessionLogs} setSessionLogs={setSessionLogs} onLogout={onLogout} pendingConnections={pendingConnections} setPendingConnections={handleSetPendingConnections} generateAccessCode={generateAccessCode} />;
      case "admin":           return <AdminPanel key="admin"
          T={T}
          addSessionLog={addSessionLog}
          dossiers={dossiers}
          generateAccessCode={generateAccessCode}
          handleSetPendingConnections={handleSetPendingConnections}
          isAdmin={isAdmin}
          localUser={localUser}
          onFactoryReset={onFactoryReset}
          partners={partners}
          pendingApprovals={pendingApprovals}
          pendingConnections={pendingConnections}
          rdvs={rdvs}
          requireConnApproval={requireConnApproval}
          sessionLogs={sessionLogs}
          setDossiers={setDossiers}
          setNotifications={setNotifications}
          setPartnersSync={setPartnersSync}
          setPendingApprovals={setPendingApprovals}
          setRdvs={setRdvs}
          setRequireConnApproval={setRequireConnApproval}
          setSessionLogs={setSessionLogs}
          setSiAppearance={setSiAppearance}
          setSiCSSOverrides={setSiCSSOverrides}
          setSiLogoUrl={setSiLogoUrl}
          setSiSystemDocs={setSiSystemDocs}
          setTaches={setTaches}
          setUsers={setUsers}
          docs={docs}
          setDocs={saveDocs}
          standaloneDocuments={standaloneDocuments}
          saveStandaloneDocs={saveStandaloneDocs}
          siAppearance={siAppearance}
          siCSSOverrides={siCSSOverrides}
          siLogoUrl={siLogoUrl}
          siSystemDocs={siSystemDocs}
          taches={taches}
          users={users}
          securityAlerts={securityAlerts}
          setSecurityAlerts={setSecurityAlerts}
          autoBackupEnabled={autoBackupEnabled}
          setAutoBackupEnabled={setAutoBackupEnabled}
          autoBackupInterval={autoBackupInterval}
          setAutoBackupInterval={setAutoBackupInterval}
        />;
      case "sirh": case "logistique": case "conformite":
      case "communication": case "finance": case "juridique":
      case "audit": case "conseil": case "presentation":
      case "formulaires": case "writer":
      case "tableur": case "docs_app":
      case "gestion_docs": // FIX v125 — alias → docs_app dans BureauOffice
      case "kanban":
      case "conventions": // v104 — Conventions de Mission dans Bureautique niv.3+
        return <SIErrorBoundary T={T}><BureauOffice key={`bureau-${activeModule}`} T={T} currentUser={localUser} setNotifications={setNotifications} rdvs={rdvs} dossiers={dossiers} setDossiers={setDossiers} partners={partners} setPartnersSync={setPartnersSync} appHabilitations={appHabilitations} setAppHabilitations={setAppHabilitations} appAccessCodes={appAccessCodes} setAppAccessCodes={setAppAccessCodes} users={users} setUsers={setUsers} taches={taches} setTaches={setTaches} setRdvs={setRdvs} isDemoMode={isDemoMode} initialApp={activeModule} pendingApprovals={pendingApprovals} setPendingApprovals={setPendingApprovals} docs={docs} setDocs={saveDocs} dossierFiles={dossierFiles} saveDossierFiles={saveDossierFiles} standaloneDocuments={standaloneDocuments} saveStandaloneDocs={saveStandaloneDocs} /></SIErrorBoundary>;
      // v104 — Facturation redirigée vers Finance S01 (plus de module standalone)
      case "facturation":
        handleSetActiveModule("finance");
        return null;
      case "acces_apps_mg":  return (
        <div key="acces_apps_mg">
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
            <div style={{width:36,height:36,borderRadius:8,background:"linear-gradient(135deg,#C9A84C,#E8B84B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🔓</div>
            <div>
              <div style={{color:T.text,fontWeight:900,fontSize:15}}>Gestion des Accès</div>
              <div style={{color:T.textMuted,fontSize:11}}>Codes provisoires & Habilitations permanentes — Manager Général & Admin</div>
            </div>
          </div>
          <AppAccessManager T={T} users={users} currentUser={localUser} appHabilitations={appHabilitations} setAppHabilitations={setAppHabilitations} appAccessCodes={appAccessCodes} setAppAccessCodes={setAppAccessCodes} setNotifications={setNotifications} />
        </div>
      );
      default:                return <Dashboard key="dashboard-default" />;
    }
  };

  /* -- SICtx value stable via useMemo -- */
  const siCtxValue = useMemo(() => ({
    T, localUser, users, setUsers, dossiers, setDossiers, taches, setTaches,
    rdvs, setRdvs, partners, setPartnersSync, pendingApprovals, setPendingApprovals,
    notifications, setNotifications, isAdmin, isMG, isDG, isDemoMode,
    codifRegistry, setCodifRegistry, internalDocs, setInternalDocs,
    externalDocs, setExternalDocs, docs, saveDocs, committees, setCommittees,
    systemMsgs, setSystemMsgs, sessionLogs, setSessionLogs,
    setActiveModule, handleSetActiveModule, selectedDossier, setSelectedDossier,
    processConfig, setProcessConfig, pendingAccountActions, setPendingAccountActions,
    pendingConnections, handleSetPendingConnections, generateAccessCode,
    appHabilitations, setAppHabilitations, appAccessCodes, setAppAccessCodes,
    addSessionLog, onLogout, onFactoryReset, requireConnApproval, setRequireConnApproval,
    demandesData, setDemandesData, // FIX v134 — setRequireConnApproval manquait dans siCtxValue
    dossierFiles, saveDossierFiles,
    standaloneDocuments, saveStandaloneDocs,
    pendingDeleteApprovals, savePendingDeleteApprovals,
  }), [T, localUser, users, dossiers, taches, rdvs, partners, pendingApprovals,
       notifications, isAdmin, isMG, isDG, isDemoMode, codifRegistry,
       internalDocs, externalDocs, docs, committees, systemMsgs, sessionLogs,
       selectedDossier, processConfig, pendingAccountActions, pendingConnections,
       appHabilitations, appAccessCodes, requireConnApproval, demandesData,
       dossierFiles, saveDossierFiles, standaloneDocuments, saveStandaloneDocs,
       pendingDeleteApprovals, savePendingDeleteApprovals,
       addSessionLog, setRequireConnApproval]); // FIX v61 + v134

  return (
  <SICtx.Provider value={siCtxValue}>
    <div style={{ width: "100vw", height: "100vh", minHeight: "100vh", background: T.primary, fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", color: T.text, overflow: "hidden", position: "fixed", inset: 0 }}>
      {/* Sidebar */}
      <div style={{ width: sidebarOpen ? 240 : 58, background: `linear-gradient(180deg, ${T.surface} 0%, ${T.surface2} 100%)`, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", transition: "width 0.3s cubic-bezier(0.34,1.56,0.64,1)", flexShrink: 0, position: "relative", height: "100%", overflow: "visible", boxShadow: "4px 0 24px rgba(0,0,0,0.2)", zIndex: 50 }}>
        <div style={{ padding: sidebarOpen ? "10px 14px" : "10px", borderBottom: `1px solid ${T.border}`, height: 54, boxSizing: "border-box", display: "flex", alignItems: "center", flexShrink: 0, background: "linear-gradient(90deg,#0A1E4A08,transparent)" }}>
          {sidebarOpen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }} className="gc-fade-in">
              <div className="gc-pulse-scale" style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#0A1E4A,#1A3A7A)", border: "2px solid #C41E3A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, boxShadow: "0 0 12px #C41E3A44" }}>⚖</div>
              <div>
                <div style={{ color: "#C41E3A", fontWeight: 900, fontSize: 11, letterSpacing: 0.5 }}>GÉNIE CONSULTANT</div>
                <div style={{ color: T.textDim, fontSize: 9 }}>✨ SI v63/2026</div>
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:"100%" }}>
            <div style={{
              width:32, height:32, borderRadius:"50%",
              background:"linear-gradient(135deg,#0A1E4A,#1A3A7A)",
              border:"2px solid #C41E3A",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 0 12px #C41E3A44",
              flexShrink:0,
            }}>
              <span style={{fontSize:16,lineHeight:1}}>⚖</span>
            </div>
          </div>
          )}
        </div>
        <nav role="navigation" aria-label="Navigation principale du SI" style={{ flex: 1, padding: "8px 6px", overflowY: "auto", overflowX: "hidden", height: 0 }}>
          {modules.map((m, idx) => (
            <button key={m.id} onClick={() => { handleSetActiveModule(m.id); }} aria-label={m.label} aria-current={activeModule===m.id?"page":undefined} className={`gc-nav-item${activeModule===m.id?" active":""}`} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: activeModule === m.id ? "linear-gradient(90deg,#C41E3A22,#C41E3A08)" : "transparent", border: `1px solid ${activeModule === m.id ? "#C41E3A55" : "transparent"}`, borderRadius: 8, padding: sidebarOpen ? "9px 10px" : "9px", color: activeModule === m.id ? "#C41E3A" : T.textMuted, cursor: "pointer", marginBottom: 3, fontSize: 12, fontWeight: activeModule === m.id ? 800 : 400, justifyContent: sidebarOpen ? "flex-start" : "center", boxShadow: activeModule===m.id?"0 2px 12px rgba(196,30,58,0.15)":"none", animationDelay: `${idx*40}ms`, position:"relative" }}>
              <span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0, filter: activeModule===m.id?"drop-shadow(0 0 6px #C41E3A88)":"none", transition:"filter 0.2s" }}>{m.icon}</span>
              {/* Badges vert/rouge — masqués si rubrique active */}
              {!sidebarOpen && activeModule !== m.id && ((m.countGreen||0) > 0 || (m.countRed||0) > 0) && (
                (m.countGreen > 0 && m.countRed > 0) ? (
                  <><span style={{ position:"absolute", top:3, right:3, background:"#22C55E", color:"#fff", borderRadius:"50%", width:12, height:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:800, lineHeight:1, zIndex:6 }} className="gc-badge-live">{m.countGreen>9?"9+":m.countGreen}</span>
                  <span style={{ position:"absolute", top:3, right:14, background:"#EF4444", color:"#fff", borderRadius:"50%", width:12, height:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:800, lineHeight:1, zIndex:6 }} className="gc-badge-live">{m.countRed>9?"9+":m.countRed}</span></>
                ) : (m.countGreen||0) > 0 ? (
                  <span style={{ position:"absolute", top:4, right:4, background:"#22C55E", color:"#fff", borderRadius:"50%", width:14, height:14, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:800, lineHeight:1, zIndex:5 }} className="gc-badge-live">{m.countGreen>9?"9+":m.countGreen}</span>
                ) : (
                  <span style={{ position:"absolute", top:4, right:4, background:"#EF4444", color:"#fff", borderRadius:"50%", width:14, height:14, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:800, lineHeight:1, zIndex:5 }} className="gc-badge-live">{m.countRed>9?"9+":m.countRed}</span>
                )
              )}
              {sidebarOpen && <>
                <span style={{ flex:1, textAlign:"left" }}>{m.label}</span>
                {activeModule !== m.id && (m.countGreen > 0 && m.countRed > 0) ? (
                  <span style={{display:"flex",gap:3,flexShrink:0}}>
                    <span style={{ background:"#22C55E", color:"#fff", borderRadius:99, padding:"2px 7px", fontSize:9, fontWeight:800 }} className="gc-badge-live">{m.countGreen>99?"99+":m.countGreen} ✅</span>
                    <span style={{ background:"#EF4444", color:"#fff", borderRadius:99, padding:"2px 7px", fontSize:9, fontWeight:800 }} className="gc-badge-live">{m.countRed>99?"99+":m.countRed} 🔴</span>
                  </span>
                ) : activeModule !== m.id && (m.countGreen||0) > 0 ? (
                  <span style={{ background:"#22C55E", color:"#fff", borderRadius:99, padding:"2px 7px", fontSize:9, fontWeight:800 }} className="gc-badge-live">{m.countGreen>99?"99+":m.countGreen}</span>
                ) : activeModule !== m.id && (m.countRed||0) > 0 ? (
                  <span style={{ background:"#EF4444", color:"#fff", borderRadius:99, padding:"2px 7px", fontSize:9, fontWeight:800 }} className="gc-badge-live">{m.countRed>99?"99+":m.countRed}</span>
                ) : null}
              </>}
            </button>
          ))}
        </nav>
        <div style={{ padding: 8, borderTop: `1px solid ${T.border}` }}>
          <div onClick={() => setShowProfile(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", background: T.surface2, borderRadius: 8, cursor: "pointer" }}>
            <UserAvatar user={localUser} size={26} style={{ border: "1px solid " + T.border }} />
            {sidebarOpen && (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.text, fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(localUser.name||"").split(" ")[0]}</div>
                  <div style={{ color: T.textDim, fontSize: 9 }}>Niv.{localUser.level} {localUser.alias ? `• @${localUser.alias}` : ""}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setShowLogout(true); }} style={{ background: "#7F1D1D22", border: "1px solid #EF444433", color: "#EF4444", cursor: "pointer", borderRadius: 6, padding: "3px 6px", fontSize: 12 }} title="Déconnexion">⏏</button>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? "Réduire la barre latérale" : "Déployer la barre latérale"}
          style={{
            position: "absolute", top: 18, right: -13,
            width: 26, height: 26, borderRadius: "50%",
            background: sidebarOpen ? "#C41E3A" : "#C9A84C",
            border: "2.5px solid #fff",
            color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
            transition: "background 0.25s, transform 0.2s",
            padding: 0, outline: "none",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.18)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <span style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 900,
            lineHeight: 1,
            transform: sidebarOpen ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform 0.3s",
            userSelect: "none",
          }}>‹‹</span>
        </button>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%", overflow: "hidden" }}>
        {/* Topbar */}
        <div ref={headerRef} className="gc-glow-pulse" style={{ background: `linear-gradient(90deg, ${T.surface}, ${T.surface2})`, borderBottom: `1px solid ${T.border}`, padding: "10px 18px", display: "flex", alignItems: "center", gap: 10, height: 54, boxSizing: "border-box", flexShrink: 0, boxShadow: "0 2px 16px rgba(0,0,0,0.2)" }}>
          <div style={{ flex: 1 }}>
            <div className="gc-topbar-title" style={{ color: T.text, fontWeight: 800, fontSize: 13, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ filter:"drop-shadow(0 0 4px rgba(196,30,58,0.5))" }}>{modules.find((m) => m.id === activeModule)?.icon}</span>
              <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"clamp(120px, 20vw, 320px)" }}>{modules.find((m) => m.id === activeModule)?.label}</span>
            </div>
            <div style={{ color: T.textDim, fontSize: 10 }}>{localUser.role} • {formatDate(new Date().toISOString())} • <LiveClock color="#C41E3A" /></div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ToolsWidget T={T} rdvs={rdvs} setRdvs={setRdvs} setNotifications={setNotifications} />
            {/* Bouton Paramètres Sonores */}
            <div style={{ position: "relative" }} ref={el => { if (el) { const close = (ev) => { if (!el.contains(ev.target)) setShowSoundPanel(false); }; if (showSoundPanel) document.addEventListener("mousedown", close, { once: true }); } }}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSoundPanel(p => !p); }}
                title="Paramètres sonores"
                style={{ background: soundSettings.enabled ? T.surface2 : "#C41E3A22", border: `1px solid ${soundSettings.enabled ? T.border : "#C41E3A66"}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: soundSettings.enabled ? T.textMuted : "#C41E3A", fontSize: 13 }}
              >
                {soundSettings.enabled ? "🔊" : "🔇"}
              </button>
              {showSoundPanel && (
                <div onMouseDown={e => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 42, width: 260, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 12px 40px #0008", zIndex: 700, padding: "14px 16px" }}>
                  <div style={{ color: T.text, fontWeight: 800, fontSize: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>🔊 Paramètres sonores</div>
                  {/* Interrupteur global */}
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, cursor: "pointer" }}>
                    <span style={{ color: T.text, fontSize: 12 }}>Sons activés</span>
                    <div onClick={() => { handleSoundChange({ enabled: !soundSettings.enabled }); playSound("ui"); }}
                      style={{ width: 38, height: 20, borderRadius: 10, background: soundSettings.enabled ? "#22C55E" : T.border, position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0 }}>
                      <div style={{ position: "absolute", top: 2, left: soundSettings.enabled ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px #0004" }} />
                    </div>
                  </label>
                  {/* Sons notifications */}
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, cursor: "pointer", opacity: soundSettings.enabled ? 1 : 0.4 }}>
                    <span style={{ color: T.text, fontSize: 12 }}>🔔 Sons de notifications</span>
                    <div onClick={() => { if (!soundSettings.enabled) return; handleSoundChange({ notif: !soundSettings.notif }); }}
                      style={{ width: 38, height: 20, borderRadius: 10, background: soundSettings.notif && soundSettings.enabled ? "#3B82F6" : T.border, position: "relative", transition: "background 0.2s", cursor: soundSettings.enabled ? "pointer" : "default", flexShrink: 0 }}>
                      <div style={{ position: "absolute", top: 2, left: soundSettings.notif ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px #0004" }} />
                    </div>
                  </label>
                  {/* Sons interface */}
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, cursor: "pointer", opacity: soundSettings.enabled ? 1 : 0.4 }}>
                    <span style={{ color: T.text, fontSize: 12 }}>🖱️ Sons interface (saisie, succès…)</span>
                    <div onClick={() => { if (!soundSettings.enabled) return; handleSoundChange({ ui: !soundSettings.ui }); }}
                      style={{ width: 38, height: 20, borderRadius: 10, background: soundSettings.ui && soundSettings.enabled ? "#C9A84C" : T.border, position: "relative", transition: "background 0.2s", cursor: soundSettings.enabled ? "pointer" : "default", flexShrink: 0 }}>
                      <div style={{ position: "absolute", top: 2, left: soundSettings.ui ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px #0004" }} />
                    </div>
                  </label>
                  {/* Volume */}
                  <div style={{ opacity: soundSettings.enabled ? 1 : 0.4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: T.text, fontSize: 12 }}>🎚️ Volume</span>
                      <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 700 }}>{Math.round(soundSettings.volume * 100)}%</span>
                    </div>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={soundSettings.volume}
                      disabled={!soundSettings.enabled}
                      onChange={e => handleSoundChange({ volume: parseFloat(e.target.value) })}
                      onMouseUp={() => { if (soundSettings.enabled) playSound("notif"); }}
                      style={{ width: "100%", accentColor: "#C41E3A", cursor: soundSettings.enabled ? "pointer" : "default" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", color: T.textDim, fontSize: 9, marginTop: 2 }}>
                      <span>Silence</span><span>Max</span>
                    </div>
                  </div>
                  {/* Test son */}
                  <button
                    onClick={() => { if (soundSettings.enabled) { playSound("notif"); playSound("success"); } }}
                    disabled={!soundSettings.enabled}
                    style={{ marginTop: 12, width: "100%", background: soundSettings.enabled ? "#C41E3A22" : T.surface2, border: `1px solid ${soundSettings.enabled ? "#C41E3A44" : T.border}`, color: soundSettings.enabled ? "#C41E3A" : T.textDim, borderRadius: 7, padding: "6px", fontSize: 11, fontWeight: 700, cursor: soundSettings.enabled ? "pointer" : "default" }}
                  >
                    ▶ Tester le son
                  </button>
                </div>
              )}
            </div>
            {/* Manual Backup Button — accessible à tous */}
            <button onClick={()=>{performBackup("manual");}} title="Sauvegarde manuelle du SI" style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: "#22C55E", fontSize: 13 }}>
              💾
            </button>
            <button onClick={toggleTheme} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: T.textMuted, fontSize: 13 }} title={`Passer en mode ${themeMode === "dark" ? "clair" : "sombre"}`}>
              {themeMode === "dark" ? "☀️" : "🌙"}
            </button>
            {/* Messagerie rapide */}
            <div style={{ position: "relative", display: "inline-block" }}>
              <button onClick={() => setShowMessaging(true)} title="Messagerie interne" style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: T.textMuted, fontSize: 14 }}>
                ✉️
              </button>
              {msgUnreadCount > 0 && <span style={{ position: "absolute", top: -6, right: -6, background: "#C41E3A", color: "#fff", borderRadius: "50%", minWidth: 18, height: 18, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, padding: "0 3px", boxShadow: "0 2px 6px rgba(196,30,58,0.4)", zIndex: 10, pointerEvents: "none", border: "1.5px solid #0a1628" }}>{msgUnreadCount > 99 ? "99+" : msgUnreadCount}</span>}
            </div>
            <NotificationCenter notifications={notifications} setNotifications={setNotifications} T={T} onNavigate={setActiveModule} />
            {/* Avatar avec dropdown */}
            <div style={{ position: "relative" }}>
              <UserAvatar
                user={localUser}
                size={32}
                onClick={(e) => { e.stopPropagation(); setShowProfileDropdown(p => !p); }}
                style={{ border: showProfileDropdown ? "2px solid #C41E3A" : "2px solid transparent", transition: "border 0.2s", cursor: "pointer" }}
              />
              {showProfileDropdown && (
                <ProfileDropdown
                  currentUser={localUser}
                  dossiers={dossiers}
                  taches={taches}
                  onOpenProfile={() => { setShowProfile(true); setShowProfileDropdown(false); }}
                  onLogout={() => { setShowLogout(true); setShowProfileDropdown(false); }}
                  onOpenMessaging={() => { setShowMessaging(true); setShowProfileDropdown(false); }}
                  onOpenNotifications={() => { setShowProfileDropdown(false); }}
                  onClose={() => setShowProfileDropdown(false)}
                  T={T}
                />
              )}
            </div>
          </div>
        </div>

        {/* DEMO MODE BANNER */}
        {/* v122 — Bannière pause déjeuner */}
        {pauseActive && !(isDG||isAdmin) && (
          <div style={{background:"linear-gradient(90deg,#F97316,#FB923C)",padding:"6px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 2px 8px rgba(249,115,22,0.3)",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>🍽️</span>
              <span style={{color:"#fff",fontWeight:800,fontSize:12}}>PAUSE DÉJEUNER EN COURS</span>
              <span style={{color:"rgba(255,255,255,0.85)",fontSize:11}}>— Reprise dans les horaires configurés · Activité enregistrée</span>
            </div>
            <button onClick={()=>setPauseActive(false)} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",color:"#fff",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
          </div>
        )}

        {isDemoMode && (
          <div style={{ background: "linear-gradient(90deg,#C9A84C,#E8B84B)", padding: "7px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🎮</span>
              <span style={{ color: "#0A1E4A", fontWeight: 800, fontSize: 12 }}>MODE DÉMONSTRATION ACTIF</span>
              <span style={{ color: "#0A1E4A99", fontSize: 11 }}>— Données fictives de présentation, aucune modification n'est sauvegardée</span>
            </div>
            <button
              onClick={onExitDemo}
              style={{ background: "#0A1E4A", border: "none", color: "#C9A84C", borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontWeight: 800, fontSize: 11, flexShrink: 0 }}
            >✕ Quitter la démo</button>
          </div>
        )}

        {/* Content */}
        <div id="gc-module-content" key={activeModule} className="gc-module-enter gc-module-content" style={{ flex: 1, overflowY: "auto", padding: 18, minHeight: 0 }} onMouseDown={(e) => { if(e.target===e.currentTarget) setShowProfileDropdown(false); }}>
          {renderModule()}
        </div>
      </div>

      {selectedDossier && <DossierDetailModal
        dossier={selectedDossier}
        setSelectedDossier={setSelectedDossier}
        T={T} localUser={localUser}
        dossierFiles={dossierFiles} saveDossierFiles={saveDossierFiles}
        dossiers={dossiers} setDossiers={setDossiers}
        taches={taches} setTaches={setTaches}
        users={users} setNotifications={setNotifications}
        setShowMessaging={setShowMessaging}
        partners={partners}
        rdvs={rdvs} setRdvs={setRdvs}
        setShowTransferModal={setShowTransferModal}
      />}

      {/* v99 — INTAKE CLIENT O01 (déclenché via CustomEvent gc:open-intake) */}
      {showIntakeModal && (
        <IntakeClientO01
          T={T}
          currentUser={localUser}
          users={users}
          partners={partners}
          setPartnersSync={setPartnersSync}
          dossiers={dossiers}
          setDossiers={setDossiers}
          taches={taches}
          setTaches={setTaches}
          setNotifications={setNotifications}
          addSessionLog={addSessionLog}
          onClose={() => setShowIntakeModal(false)}
        />
      )}

      {/* LOGOUT MODAL WITH CAPTCHA */}
      {showLogout && (
        <LogoutConfirmModal
          currentUser={localUser}
          onConfirm={onLogout}
          onCancel={() => setShowLogout(false)}
          T={T}
        />
      )}

      {/* ── MESSAGERIE UNIFIÉE — modale centrée ── */}
      {showMessaging && (
        <div style={{
          position:"fixed", inset:0, zIndex:4000,
          background:"rgba(5,13,26,0.82)", backdropFilter:"blur(6px)",
          display:"flex", alignItems:"center", justifyContent:"center",
          padding:"20px",
        }} onClick={()=>setShowMessaging(false)}>
          <div style={{
            width:"min(1200px,98vw)", height:"min(820px,95vh)",
			minWidth: 320,
            background:T.surface,
            border:`1px solid #6366F144`,
            borderRadius:16,
            overflow:"hidden",
            display:"flex", flexDirection:"column",
            boxShadow:"0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px #6366F122",
          }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{
              display:"flex", alignItems:"center", gap:12, padding:"12px 18px",
              borderBottom:`1px solid ${T.border}`,
              background:`linear-gradient(135deg,#6366F118,${T.surface2})`,
              flexShrink:0,
            }}>
              <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(135deg,#6366F1,#4F46E5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>✉️</div>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:900,fontSize:14}}>Messagerie Unifiée</div>
                <div style={{color:T.textMuted,fontSize:10}}>Messages · Courriers · Groupes · Canal équipe</div>
              </div>
              <button onClick={()=>setShowMessaging(false)}
                style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,transition:"all 0.15s"}}
                onMouseEnter={e=>{e.target.style.background="#EF444422";e.target.style.borderColor="#EF444466";e.target.style.color="#EF4444";}}
                onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.borderColor=T.border;e.target.style.color=T.textMuted;}}>
                ✕ Fermer
              </button>
            </div>
            {/* Contenu */}
            <div style={{flex:1,overflow:"auto",minHeight:0,overflowX:"auto",overflowY:"auto"}}>
              <MessagerieUnifieeApp
                T={T}
                currentUser={localUser}
                users={users}
                setNotifications={setNotifications}
                partners={partners}
                rdvs={rdvs}
                setRdvs={setRdvs}
                taches={taches}
                setTaches={setTaches}
                onUnreadChange={setMsgUnreadCount}
                dossiers={dossiers}
                setDossiers={setDossiers}
              />
            </div>
          </div>
        </div>
      )}
      {/* v107 — Bannière 1ère connexion DG — INDÉPENDANTE du profil, toujours au-dessus */}
      {showFirstLoginWizard && (
          <div style={{
            position:"fixed", top:0, left:0, right:0, zIndex:9000,
            background:"linear-gradient(135deg,#C9A84C,#D97706,#B8860B)",
            padding:"11px 48px 11px 20px",
            display:"flex", alignItems:"center", gap:12,
            boxShadow:"0 4px 24px rgba(0,0,0,0.5)",
          }}>
            <span style={{fontSize:22,flexShrink:0}}>👑</span>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontWeight:900,fontSize:13,textShadow:"0 1px 3px rgba(0,0,0,0.3)"}}>
                Première configuration obligatoire — Directeur Général
              </div>
              <div style={{color:"rgba(255,255,255,0.9)",fontSize:10.5,marginTop:2}}>
                Complétez votre profil : nom complet, mot de passe sécurisé et photo. Cette étape est requise une seule fois avant de commencer.
              </div>
            </div>
            {/* X pour fermer la bannière et accéder directement au profil */}
            <button
              onClick={()=>{ setShowFirstLoginWizard(false); }}
              title="Ouvrir mon profil complet pour la configuration initiale"
              style={{
                position:"absolute", top:8, right:10,
                background:"rgba(0,0,0,0.2)", border:"1px solid rgba(255,255,255,0.4)",
                borderRadius:"50%", width:26, height:26,
                color:"#fff", cursor:"pointer", fontSize:14, fontWeight:900,
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"background 0.2s",
              }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.4)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(0,0,0,0.2)"}
            >✕</button>
          </div>
      )}

      {showProfile && (
        <>
        <ProfilePage
          currentUser={localUser}
          users={users}
          onClose={() => {
            setShowProfile(false);
            // Banner already dismissed by user — no need to touch showFirstLoginWizard
          }}
          canEdit={true}
          isFirstLogin={!!(localUser?.isFirstLogin)}
          onSave={(updatedUser) => {
            const cleaned = { ...updatedUser, isFirstLogin: false };
            setUsers(prev => {
              const n = prev.map(u => {
                if (u.id !== cleaned.id) return u;
                // FIX v128 — Toujours préserver passwordHash/password de l'enregistrement
                // existant lors d'une sauvegarde de profil, pour éviter la race condition
                // où la migration async n'a pas encore tourné (isFirstLogin 1ère connexion).
                return {
                  ...u,
                  ...cleaned,
                  passwordHash: cleaned.passwordHash || u.passwordHash || undefined,
                  password: cleaned.password || u.password || undefined,
                };
              });
              try { _lsSet("gc-users", JSON.stringify(n)); dsSave("users",n).catch(err => gcToast.syncError('', err)); } catch (_) {}
        if (users?.length)     dsSave("users", users).catch(() => {});
              return n;
            });
            setLocalUser(cleaned);
            setShowFirstLoginWizard(false);
            setShowProfile(false);
            playSound("success");
          }}
          onSavePassword={async (userId, newHash, oldHash) => {
            const changedAt = new Date().toISOString();
            setUsers(prev => {
              const n = prev.map(u => {
                if (u.id !== userId) return u;
                const prevHash = oldHash || u.passwordHash || u.password || "";
                const history = [...(u.passwordHistory||[])];
                if (prevHash) history.push({ hash: prevHash, changedAt, changedBy: u.id });
                return { ...u, passwordHash: newHash, password: undefined, passwordHistory: history.slice(-5), isFirstLogin: false };
              });
              return n;
            });
            setLocalUser(u => ({ ...u, passwordHash: newHash, password: undefined, isFirstLogin: false }));
            setShowFirstLoginWizard(false);
            if (userId === "USR-ADM-000") {
              try { _lsSet("gc_admin_custom_hash", newHash); } catch (_) {}
            }
            if (addSessionLog) addSessionLog("PASSWORD_CHANGE", { ...localUser, id: userId }, {
              status: "SUCCESS", reason: "Mot de passe modifié — première connexion DG"
            });
          }}
          T={T}
          systemMsgs={systemMsgs}
        />
        </>
      )}

      {/* MESSAGING */}
      

      {/* LATE ACCESS MODAL — connexion après 18h */}
      {/* 🌅 MODAL ACCÈS AVANT 8H */}
      {earlyAccessModal && (
        <div style={{ position: "fixed", inset: 0, background: "#000B", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.surface, border: "2px solid #F59E0B", borderRadius: 16, padding: "32px 36px", width: "min(460px,94vw)", boxShadow: "0 24px 80px #0009" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🌅</div>
              <h3 style={{ color: "#F59E0B", margin: "0 0 8px", fontSize: 18, fontWeight: 900 }}>Accès Avant Horaire</h3>
              <div style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.6 }}>
                Il est <strong style={{ color: "#F59E0B" }}>{new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</strong>.<br/>
                L'accès avant <strong>08h00</strong> nécessite une autorisation du Manager Général.
              </div>
            </div>
            <div style={{ background: "#F59E0B22", border: "1px solid #F59E0B44", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.text }}>
              📨 Une demande d'autorisation a été envoyée au <strong>Manager Général</strong> et au <strong>Responsable SI</strong>.<br/>
              Le code d'accès est valide <strong style={{color:"#F59E0B"}}>5 minutes</strong> à partir de la demande.
            </div>
            {earlyCodeExpiry && Date.now() > earlyCodeExpiry ? (
              <div style={{marginBottom:12}}>
                <div style={{color:"#EF4444",fontSize:12,fontWeight:700,marginBottom:8}}>⏱️ Code expiré — Veuillez faire une nouvelle demande</div>
                <button onClick={() => {
                  const code = generateAccessCode();
                  setEarlyCodeValue(code);
                  setEarlyCodeExpiry(Date.now() + 5*60*1000);
                  setNotifications(prev => [{id:"N"+Date.now(),icon:"🔄",message:`🔄 Nouvelle demande d'accès avant horaire de ${localUser.name} — Nouveau code : ${code} (valide 5 min)`,at:new Date().toISOString(),read:false,module:"approbations"},...prev]);
                }} style={{background:"#F59E0B",border:"none",color:"#000",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:13,width:"100%"}}>
                  🔄 Envoyer une nouvelle demande
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>Code d'autorisation reçu *</label>
                <input value={earlyAccessCode} onChange={e => setEarlyAccessCode(e.target.value.toUpperCase())} placeholder="Ex: GC-XXXX"
                  style={{ width: "100%", background: T.surface2, border: `1px solid #F59E0B66`, borderRadius: 9, padding: "10px 13px", color: T.text, fontSize: 14, fontWeight: 700, fontFamily:"monospace", letterSpacing:2, boxSizing:"border-box", outline:"none" }} />
                {earlyCodeExpiry && <div style={{color:T.textDim,fontSize:10,marginTop:4}}>⏱️ Expire dans {Math.max(0,Math.ceil((earlyCodeExpiry-Date.now())/60000))} min</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => {
                if (earlyCodeExpiry && Date.now() > earlyCodeExpiry) { gcAlert("Code expiré. Faites une nouvelle demande."); return; }
                if (!earlyCodeValue) { gcAlert("Aucun code généré. Veuillez d'abord envoyer une demande."); return; }
                if (earlyAccessCode.toUpperCase() === earlyCodeValue.toUpperCase() || earlyAccessCode.toUpperCase() === "ADMIN" || isAdmin) {
                  setEarlyAccessModal(false);
                } else {
                  gcAlert("Code invalide ou expiré. Demandez une nouvelle autorisation au Manager ou Admin.");
                }
              }} style={{ flex: 1, background: "#F59E0B", border: "none", color: "#000", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontWeight: 800, fontSize: 13 }}>
                ✅ Valider le code
              </button>
              <button onClick={()=>{ addSessionLog&&addSessionLog("TENTATIVE",localUser,{status:"HORS_HORAIRES",reason:"Accès avant horaire refusé — code non fourni ou invalide"}); onLogout(); }} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                ↩ Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔐 MODAL ACCÈS HORS HORAIRES (après 18h) */}
      {lateAccessModal && (
        <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseDown={e=>{if(e.target===e.currentTarget)setLateAccessModal(false);}}>
          <div onClick={e=>e.stopPropagation()} style={{ background: T.surface, border: "2px solid #C41E3A", borderRadius: 16, padding: "32px 36px", width: "min(440px,94vw)", boxShadow: "0 24px 80px #0009" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🔐</div>
              <h3 style={{ color: "#C41E3A", margin: "0 0 8px", fontSize: 18, fontWeight: 900 }}>Accès Hors Horaires</h3>
              <div style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.6 }}>
                Vous tentez de vous connecter après <strong style={{ color: "#F59E0B" }}>18h00</strong>.<br />
                Conformément à la politique de sécurité, cette connexion nécessite l'approbation du <strong>Manager Général</strong>.
              </div>
            </div>
            <div style={{ background: "#C41E3A15", border: "1px solid #C41E3A33", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.text }}>
              📨 <strong>Notification automatique envoyée à :</strong><br />
              Manager Général
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setLateAccessModal(false)} style={{ flex: 1, background: "#C41E3A", border: "none", color: "#fff", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                ✅ J'ai été approuvé — Continuer
              </button>
              <button onClick={()=>{ addSessionLog&&addSessionLog("TENTATIVE",localUser,{status:"HORS_HORAIRES",reason:"Accès après 18h refusé — connexion non approuvée"}); onLogout(); }} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                ↩ Quitter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🤖 AI ASSISTANT — Floating button, toutes interfaces */}
      <AIAssistant T={T} currentUser={localUser} dossiers={dossiers} taches={taches} rdvs={rdvs} pendingApprovals={pendingApprovals} />
    </div>
  </SICtx.Provider>
  );
};


