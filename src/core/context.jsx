// FIX v128 — Refactorer AppRoot : Context API + useReducer pour éviter
// les 30+ useState qui causent des re-renders massifs et bugs d'état
import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer, createContext, useContext } from 'react'; // FIX v135 — useReducer manquait (ReferenceError si SIStateProvider instancié)

 
import { _lsGet, _lsSet, _lsRm, lsLoad, lsSave, _lsGetSecure, _lsSetSecure, _gcEncrypt, _gcDecrypt, LS_KEY } from './storage.js';
import { dsSave } from './datastore.js'; // FIX v134 — dsSave manquait dans context.jsx (ReferenceError dans siReducer)
import { playSound, gcCopy, generateAccessCode, formatCFA, gcCalcPaie, gcCalcIRPP, gcLoadFiscalConfig, gcFindApprover, gcAILoadConfig, gcAISaveConfig, gcAIBuildSystemPrompt, gcAIRateCheck, gcAICheckInjection, GC_AI_PROXY_URL, _gcProxyFetch, gcCodif, gcCodifDOC, gcCodifTCHE, gcCodifMSG, ALPHA_SEQ, GC_SEQ_ALPHA, gcSeqFromIndex, _gcSafeCalc, formatDate, gcGetDelaiConfig, gcAntiRedondance, _dataUrlToBlob } from './helpers.js';
// FIX v127 — PROCESS_ACTIVITIES utilisé dans getUserProcess() mais non importé
import { PROCESS_ACTIVITIES } from './constants.js';

// ── État global avec useReducer ──────────────────────────────────────────────
export const SIStateContext = createContext();

// Actions pour le reducer
export const SI_ACTIONS = {
  SET_SCREEN: 'SET_SCREEN',
  SET_THEME: 'SET_THEME',
  SET_USERS: 'SET_USERS',
  SET_DOSSIERS: 'SET_DOSSIERS',
  SET_TACHES: 'SET_TACHES',
  SET_RDVS: 'SET_RDVS',
  SET_PENDING_APPROVALS: 'SET_PENDING_APPROVALS',
  SET_PARTNERS: 'SET_PARTNERS',
  SET_NOTIFICATIONS: 'SET_NOTIFICATIONS',
  SET_SESSION_LOGS: 'SET_SESSION_LOGS',
  SET_PENDING_CONNECTIONS: 'SET_PENDING_CONNECTIONS',
  SET_PENDING_ACCOUNT_ACTIONS: 'SET_PENDING_ACCOUNT_ACTIONS',
  SET_APP_HABILITATIONS: 'SET_APP_HABILITATIONS',
  SET_APP_ACCESS_CODES: 'SET_APP_ACCESS_CODES',
  SET_SI_LOGO_URL: 'SET_SI_LOGO_URL',
  SET_SI_APPEARANCE: 'SET_SI_APPEARANCE',
  SET_SI_CSS_OVERRIDES: 'SET_SI_CSS_OVERRIDES',
  SET_SI_SYSTEM_DOCS: 'SET_SI_SYSTEM_DOCS',
  SET_COMMITTEES: 'SET_COMMITTEES',
  SET_CODIF_REGISTRY: 'SET_CODIF_REGISTRY',
  SET_INTERNAL_DOCS: 'SET_INTERNAL_DOCS',
  SET_REQUIRE_CONN_APPROVAL: 'SET_REQUIRE_CONN_APPROVAL',
  SET_ACHIEVEMENTS: 'SET_ACHIEVEMENTS',
  SET_LEAVES: 'SET_LEAVES',
  SET_SIRH_PRESENCES: 'SET_SIRH_PRESENCES',
  SET_RECRUTEMENTS: 'SET_RECRUTEMENTS',
  SET_ACHATS: 'SET_ACHATS',
  SET_10M: 'SET_10M',
  SET_5M: 'SET_5M',
  SET_5S: 'SET_5S',
  SET_WRITER_DOCS: 'SET_WRITER_DOCS',
  SET_WRITER_PRO_V2: 'SET_WRITER_PRO_V2',
  SET_TABLEUR_PRO: 'SET_TABLEUR_PRO',
  SET_PRESENTATION_DECKS_V2: 'SET_PRESENTATION_DECKS_V2',
  SET_COURRIER_DOCS: 'SET_COURRIER_DOCS',
  SET_OHADA_DOCS: 'SET_OHADA_DOCS',
  SET_DOCS_ARCHIVES: 'SET_DOCS_ARCHIVES',
  SET_FEUILLE_TESTS: 'SET_FEUILLE_TESTS',
  SET_AUDIT_CHECKLIST_CUSTOM: 'SET_AUDIT_CHECKLIST_CUSTOM',
  SET_AMELIO_ACTIONS: 'SET_AMELIO_ACTIONS',
  SET_AMELIO_KPIS: 'SET_AMELIO_KPIS',
  SET_AMELIO_NCS: 'SET_AMELIO_NCS',
  SET_COSO_SCORES: 'SET_COSO_SCORES',
  SET_COSO_NOTES: 'SET_COSO_NOTES',
  SET_COSO_CUSTOM_Q: 'SET_COSO_CUSTOM_Q',
  SET_BCG: 'SET_BCG',
  SET_MCKINSEY: 'SET_MCKINSEY',
  SET_PORTER: 'SET_PORTER',
  SET_VRIO: 'SET_VRIO',
  SET_QQOQCP: 'SET_QQOQCP',
  SET_PDCA: 'SET_PDCA',
  SET_PARETO: 'SET_PARETO',
  SET_MC7S: 'SET_MC7S',
  SET_ANSOff: 'SET_ANSOff',
  SET_CONSEIL_OPINIONS: 'SET_CONSEIL_OPINIONS',
  SET_MATRIX_LOG: 'SET_MATRIX_LOG',
  SET_MSG_DRAFTS: 'SET_MSG_DRAFTS',
  SET_MSG_TEMPLATES: 'SET_MSG_TEMPLATES',
  SET_NOTES_RAPIDES: 'SET_NOTES_RAPIDES',
  SET_LOGMOD_STOCKS: 'SET_LOGMOD_STOCKS',
  SET_PIECE_SERIES: 'SET_PIECE_SERIES',
  SET_BACKUP_LOG: 'SET_BACKUP_LOG',
  SET_BACKUPS: 'SET_BACKUPS',
  SET_DEVIS: 'SET_DEVIS',
  SET_BUDGET_RAPIDE: 'SET_BUDGET_RAPIDE',
};

// État initial
export const initialSIState = {
  screen: 'cover',
  themeMode: 'dark',
  users: [],
  dossiers: [],
  taches: [],
  rdvs: [],
  pendingApprovals: [],
  partners: [],
  notifications: [],
  sessionLogs: [],
  pendingConnections: [],
  pendingAccountActions: [],
  appHabilitations: [],
  appAccessCodes: [],
  siLogoUrl: null,
  siAppearance: {
    primaryColor: "#C41E3A",
    navyColor: "#0A1E4A",
    goldColor: "#C9A84C",
    accentColor: "#3B82F6",
    cabinetName: "GÉNIE CONSULTANT",
    cabinetSlogan: "Excellence · Intégrité · Performance",
    loginSubtitle: "Système d'Information Intégré",
    coverBg: "navy",
    fontScale: 1,
  },
  siCSSOverrides: "",
  siSystemDocs: [],
  committees: [],
  codifRegistry: [],
  internalDocs: [],
  requireConnApproval: false,
  achievements: [],
  leaves: [],
  sirhPresences: [],
  recrutements: [],
  achats: [],
  _10m: [],
  _5m: [],
  _5s: [],
  writerDocs: [],
  writerProV2: [],
  tableurPro: [],
  presentationDecksV2: [],
  courrierDocs: [],
  ohadaDocs: [],
  docsArchives: [],
  feuilleTests: [],
  auditChecklistCustom: [],
  amelioActions: [],
  amelioKPIs: [],
  amelioNCS: [],
  cosoScores: [],
  cosoNotes: [],
  cosoCustomQ: [],
  bcg: [],
  mckinsey: [],
  porter: [],
  vrio: [],
  qqoqcp: [],
  pdca: [],
  pareto: [],
  mc7s: [],
  ansoff: [],
  conseilOpinions: [],
  matrixLog: [],
  msgDrafts: [],
  msgTemplates: [],
  notesRapides: [],
  logmodStocks: [],
  pieceSeries: [],
  backupLog: [],
  backups: [],
  devis: [],
  budgetRapide: [],
};

// Reducer pour gérer l'état
export function siReducer(state, action) {
  switch (action.type) {
    case SI_ACTIONS.SET_SCREEN:
      return { ...state, screen: action.payload };
    case SI_ACTIONS.SET_THEME:
      lsSave("theme", action.payload);
      return { ...state, themeMode: action.payload };
    case SI_ACTIONS.SET_USERS:
      return { ...state, users: action.payload };
    case SI_ACTIONS.SET_DOSSIERS:
      return { ...state, dossiers: action.payload };
    case SI_ACTIONS.SET_TACHES:
      return { ...state, taches: action.payload };
    case SI_ACTIONS.SET_RDVS:
      return { ...state, rdvs: action.payload };
    case SI_ACTIONS.SET_PENDING_APPROVALS:
      return { ...state, pendingApprovals: action.payload };
    case SI_ACTIONS.SET_PARTNERS:
      return { ...state, partners: action.payload };
    case SI_ACTIONS.SET_NOTIFICATIONS:
      return { ...state, notifications: action.payload };
    case SI_ACTIONS.SET_SESSION_LOGS:
      return { ...state, sessionLogs: action.payload };
    case SI_ACTIONS.SET_PENDING_CONNECTIONS:
      return { ...state, pendingConnections: action.payload };
    case SI_ACTIONS.SET_PENDING_ACCOUNT_ACTIONS:
      return { ...state, pendingAccountActions: action.payload };
    case SI_ACTIONS.SET_APP_HABILITATIONS:
      return { ...state, appHabilitations: action.payload };
    case SI_ACTIONS.SET_APP_ACCESS_CODES:
      return { ...state, appAccessCodes: action.payload };
    case SI_ACTIONS.SET_SI_LOGO_URL:
      dsSave("siLogoUrl", action.payload);
      return { ...state, siLogoUrl: action.payload };
    case SI_ACTIONS.SET_SI_APPEARANCE:
      dsSave("siAppearance", action.payload);
      return { ...state, siAppearance: action.payload };
    case SI_ACTIONS.SET_SI_CSS_OVERRIDES:
      dsSave("siCSSOverrides", action.payload);
      return { ...state, siCSSOverrides: action.payload };
    case SI_ACTIONS.SET_SI_SYSTEM_DOCS:
      return { ...state, siSystemDocs: action.payload };
    case SI_ACTIONS.SET_COMMITTEES:
      return { ...state, committees: action.payload };
    case SI_ACTIONS.SET_CODIF_REGISTRY:
      return { ...state, codifRegistry: action.payload };
    case SI_ACTIONS.SET_INTERNAL_DOCS:
      return { ...state, internalDocs: action.payload };
    case SI_ACTIONS.SET_REQUIRE_CONN_APPROVAL:
      return { ...state, requireConnApproval: action.payload };
    case SI_ACTIONS.SET_ACHIEVEMENTS:
      return { ...state, achievements: action.payload };
    case SI_ACTIONS.SET_LEAVES:
      return { ...state, leaves: action.payload };
    case SI_ACTIONS.SET_SIRH_PRESENCES:
      return { ...state, sirhPresences: action.payload };
    case SI_ACTIONS.SET_RECRUTEMENTS:
      return { ...state, recrutements: action.payload };
    case SI_ACTIONS.SET_ACHATS:
      return { ...state, achats: action.payload };
    case SI_ACTIONS.SET_10M:
      return { ...state, _10m: action.payload };
    case SI_ACTIONS.SET_5M:
      return { ...state, _5m: action.payload };
    case SI_ACTIONS.SET_5S:
      return { ...state, _5s: action.payload };
    case SI_ACTIONS.SET_WRITER_DOCS:
      return { ...state, writerDocs: action.payload };
    case SI_ACTIONS.SET_WRITER_PRO_V2:
      return { ...state, writerProV2: action.payload };
    case SI_ACTIONS.SET_TABLEUR_PRO:
      return { ...state, tableurPro: action.payload };
    case SI_ACTIONS.SET_PRESENTATION_DECKS_V2:
      return { ...state, presentationDecksV2: action.payload };
    case SI_ACTIONS.SET_COURRIER_DOCS:
      return { ...state, courrierDocs: action.payload };
    case SI_ACTIONS.SET_OHADA_DOCS:
      return { ...state, ohadaDocs: action.payload };
    case SI_ACTIONS.SET_DOCS_ARCHIVES:
      return { ...state, docsArchives: action.payload };
    case SI_ACTIONS.SET_FEUILLE_TESTS:
      return { ...state, feuilleTests: action.payload };
    case SI_ACTIONS.SET_AUDIT_CHECKLIST_CUSTOM:
      return { ...state, auditChecklistCustom: action.payload };
    case SI_ACTIONS.SET_AMELIO_ACTIONS:
      return { ...state, amelioActions: action.payload };
    case SI_ACTIONS.SET_AMELIO_KPIS:
      return { ...state, amelioKPIs: action.payload };
    case SI_ACTIONS.SET_AMELIO_NCS:
      return { ...state, amelioNCS: action.payload };
    case SI_ACTIONS.SET_COSO_SCORES:
      return { ...state, cosoScores: action.payload };
    case SI_ACTIONS.SET_COSO_NOTES:
      return { ...state, cosoNotes: action.payload };
    case SI_ACTIONS.SET_COSO_CUSTOM_Q:
      return { ...state, cosoCustomQ: action.payload };
    case SI_ACTIONS.SET_BCG:
      return { ...state, bcg: action.payload };
    case SI_ACTIONS.SET_MCKINSEY:
      return { ...state, mckinsey: action.payload };
    case SI_ACTIONS.SET_PORTER:
      return { ...state, porter: action.payload };
    case SI_ACTIONS.SET_VRIO:
      return { ...state, vrio: action.payload };
    case SI_ACTIONS.SET_QQOQCP:
      return { ...state, qqoqcp: action.payload };
    case SI_ACTIONS.SET_PDCA:
      return { ...state, pdca: action.payload };
    case SI_ACTIONS.SET_PARETO:
      return { ...state, pareto: action.payload };
    case SI_ACTIONS.SET_MC7S:
      return { ...state, mc7s: action.payload };
    case SI_ACTIONS.SET_ANSOff:
      return { ...state, ansoff: action.payload };
    case SI_ACTIONS.SET_CONSEIL_OPINIONS:
      return { ...state, conseilOpinions: action.payload };
    case SI_ACTIONS.SET_MATRIX_LOG:
      return { ...state, matrixLog: action.payload };
    case SI_ACTIONS.SET_MSG_DRAFTS:
      return { ...state, msgDrafts: action.payload };
    case SI_ACTIONS.SET_MSG_TEMPLATES:
      return { ...state, msgTemplates: action.payload };
    case SI_ACTIONS.SET_NOTES_RAPIDES:
      return { ...state, notesRapides: action.payload };
    case SI_ACTIONS.SET_LOGMOD_STOCKS:
      return { ...state, logmodStocks: action.payload };
    case SI_ACTIONS.SET_PIECE_SERIES:
      return { ...state, pieceSeries: action.payload };
    case SI_ACTIONS.SET_BACKUP_LOG:
      return { ...state, backupLog: action.payload };
    case SI_ACTIONS.SET_BACKUPS:
      return { ...state, backups: action.payload };
    case SI_ACTIONS.SET_DEVIS:
      return { ...state, devis: action.payload };
    case SI_ACTIONS.SET_BUDGET_RAPIDE:
      return { ...state, budgetRapide: action.payload };
    default:
      return state;
  }
}

// Provider pour l'état global SI
export function SIStateProvider({ children }) {
  const [state, dispatch] = useReducer(siReducer, initialSIState);

  // Actions pour mettre à jour l'état
  const actions = useMemo(() => ({
    setScreen: (screen) => dispatch({ type: SI_ACTIONS.SET_SCREEN, payload: screen }),
    setTheme: (theme) => dispatch({ type: SI_ACTIONS.SET_THEME, payload: theme }),
    setUsers: (users) => dispatch({ type: SI_ACTIONS.SET_USERS, payload: users }),
    setDossiers: (dossiers) => dispatch({ type: SI_ACTIONS.SET_DOSSIERS, payload: dossiers }),
    setTaches: (taches) => dispatch({ type: SI_ACTIONS.SET_TACHES, payload: taches }),
    setRdvs: (rdvs) => dispatch({ type: SI_ACTIONS.SET_RDVS, payload: rdvs }),
    setPendingApprovals: (approvals) => dispatch({ type: SI_ACTIONS.SET_PENDING_APPROVALS, payload: approvals }),
    setPartners: (partners) => dispatch({ type: SI_ACTIONS.SET_PARTNERS, payload: partners }),
    setNotifications: (notifications) => dispatch({ type: SI_ACTIONS.SET_NOTIFICATIONS, payload: notifications }),
    setSessionLogs: (logs) => dispatch({ type: SI_ACTIONS.SET_SESSION_LOGS, payload: logs }),
    setPendingConnections: (connections) => dispatch({ type: SI_ACTIONS.SET_PENDING_CONNECTIONS, payload: connections }),
    setPendingAccountActions: (actions) => dispatch({ type: SI_ACTIONS.SET_PENDING_ACCOUNT_ACTIONS, payload: actions }),
    setAppHabilitations: (habilitations) => dispatch({ type: SI_ACTIONS.SET_APP_HABILITATIONS, payload: habilitations }),
    setAppAccessCodes: (codes) => dispatch({ type: SI_ACTIONS.SET_APP_ACCESS_CODES, payload: codes }),
    setSiLogoUrl: (url) => dispatch({ type: SI_ACTIONS.SET_SI_LOGO_URL, payload: url }),
    setSiAppearance: (appearance) => dispatch({ type: SI_ACTIONS.SET_SI_APPEARANCE, payload: appearance }),
    setSiCSSOverrides: (overrides) => dispatch({ type: SI_ACTIONS.SET_SI_CSS_OVERRIDES, payload: overrides }),
    setSiSystemDocs: (docs) => dispatch({ type: SI_ACTIONS.SET_SI_SYSTEM_DOCS, payload: docs }),
    setCommittees: (committees) => dispatch({ type: SI_ACTIONS.SET_COMMITTEES, payload: committees }),
    setCodifRegistry: (registry) => dispatch({ type: SI_ACTIONS.SET_CODIF_REGISTRY, payload: registry }),
    setInternalDocs: (docs) => dispatch({ type: SI_ACTIONS.SET_INTERNAL_DOCS, payload: docs }),
    setRequireConnApproval: (require) => dispatch({ type: SI_ACTIONS.SET_REQUIRE_CONN_APPROVAL, payload: require }),
    setAchievements: (achievements) => dispatch({ type: SI_ACTIONS.SET_ACHIEVEMENTS, payload: achievements }),
    setLeaves: (leaves) => dispatch({ type: SI_ACTIONS.SET_LEAVES, payload: leaves }),
    setSirhPresences: (presences) => dispatch({ type: SI_ACTIONS.SET_SIRH_PRESENCES, payload: presences }),
    setRecrutements: (recrutements) => dispatch({ type: SI_ACTIONS.SET_RECRUTEMENTS, payload: recrutements }),
    setAchats: (achats) => dispatch({ type: SI_ACTIONS.SET_ACHATS, payload: achats }),
    set10m: (_10m) => dispatch({ type: SI_ACTIONS.SET_10M, payload: _10m }),
    set5m: (_5m) => dispatch({ type: SI_ACTIONS.SET_5M, payload: _5m }),
    set5s: (_5s) => dispatch({ type: SI_ACTIONS.SET_5S, payload: _5s }),
    setWriterDocs: (docs) => dispatch({ type: SI_ACTIONS.SET_WRITER_DOCS, payload: docs }),
    setWriterProV2: (docs) => dispatch({ type: SI_ACTIONS.SET_WRITER_PRO_V2, payload: docs }),
    setTableurPro: (data) => dispatch({ type: SI_ACTIONS.SET_TABLEUR_PRO, payload: data }),
    setPresentationDecksV2: (decks) => dispatch({ type: SI_ACTIONS.SET_PRESENTATION_DECKS_V2, payload: decks }),
    setCourrierDocs: (docs) => dispatch({ type: SI_ACTIONS.SET_COURRIER_DOCS, payload: docs }),
    setOhadaDocs: (docs) => dispatch({ type: SI_ACTIONS.SET_OHADA_DOCS, payload: docs }),
    setDocsArchives: (archives) => dispatch({ type: SI_ACTIONS.SET_DOCS_ARCHIVES, payload: archives }),
    setFeuilleTests: (tests) => dispatch({ type: SI_ACTIONS.SET_FEUILLE_TESTS, payload: tests }),
    setAuditChecklistCustom: (checklist) => dispatch({ type: SI_ACTIONS.SET_AUDIT_CHECKLIST_CUSTOM, payload: checklist }),
    setAmelioActions: (actions) => dispatch({ type: SI_ACTIONS.SET_AMELIO_ACTIONS, payload: actions }),
    setAmelioKPIs: (kpis) => dispatch({ type: SI_ACTIONS.SET_AMELIO_KPIS, payload: kpis }),
    setAmelioNCS: (ncs) => dispatch({ type: SI_ACTIONS.SET_AMELIO_NCS, payload: ncs }),
    setCosoScores: (scores) => dispatch({ type: SI_ACTIONS.SET_COSO_SCORES, payload: scores }),
    setCosoNotes: (notes) => dispatch({ type: SI_ACTIONS.SET_COSO_NOTES, payload: notes }),
    setCosoCustomQ: (questions) => dispatch({ type: SI_ACTIONS.SET_COSO_CUSTOM_Q, payload: questions }),
    setBcg: (bcg) => dispatch({ type: SI_ACTIONS.SET_BCG, payload: bcg }),
    setMckinsey: (mckinsey) => dispatch({ type: SI_ACTIONS.SET_MCKINSEY, payload: mckinsey }),
    setPorter: (porter) => dispatch({ type: SI_ACTIONS.SET_PORTER, payload: porter }),
    setVrio: (vrio) => dispatch({ type: SI_ACTIONS.SET_VRIO, payload: vrio }),
    setQqoqcp: (qqoqcp) => dispatch({ type: SI_ACTIONS.SET_QQOQCP, payload: qqoqcp }),
    setPdca: (pdca) => dispatch({ type: SI_ACTIONS.SET_PDCA, payload: pdca }),
    setPareto: (pareto) => dispatch({ type: SI_ACTIONS.SET_PARETO, payload: pareto }),
    setMc7s: (mc7s) => dispatch({ type: SI_ACTIONS.SET_MC7S, payload: mc7s }),
    setAnsoff: (ansoff) => dispatch({ type: SI_ACTIONS.SET_ANSOff, payload: ansoff }),
    setConseilOpinions: (opinions) => dispatch({ type: SI_ACTIONS.SET_CONSEIL_OPINIONS, payload: opinions }),
    setMatrixLog: (log) => dispatch({ type: SI_ACTIONS.SET_MATRIX_LOG, payload: log }),
    setMsgDrafts: (drafts) => dispatch({ type: SI_ACTIONS.SET_MSG_DRAFTS, payload: drafts }),
    setMsgTemplates: (templates) => dispatch({ type: SI_ACTIONS.SET_MSG_TEMPLATES, payload: templates }),
    setNotesRapides: (notes) => dispatch({ type: SI_ACTIONS.SET_NOTES_RAPIDES, payload: notes }),
    setLogmodStocks: (stocks) => dispatch({ type: SI_ACTIONS.SET_LOGMOD_STOCKS, payload: stocks }),
    setPieceSeries: (series) => dispatch({ type: SI_ACTIONS.SET_PIECE_SERIES, payload: series }),
    setBackupLog: (log) => dispatch({ type: SI_ACTIONS.SET_BACKUP_LOG, payload: log }),
    setBackups: (backups) => dispatch({ type: SI_ACTIONS.SET_BACKUPS, payload: backups }),
    setDevis: (devis) => dispatch({ type: SI_ACTIONS.SET_DEVIS, payload: devis }),
    setBudgetRapide: (budget) => dispatch({ type: SI_ACTIONS.SET_BUDGET_RAPIDE, payload: budget }),
  }), []);

  const value = useMemo(() => ({
    state,
    actions,
  }), [state, actions]);

  return (
    <SIStateContext.Provider value={value}>
      {children}
    </SIStateContext.Provider>
  );
}
export class SIErrorBoundary extends React.Component {
  constructor(p){
    super(p);
    this.state={hasError:false,error:null,errorInfo:null,errorCount:0,resetKey:0,consecutiveCrashes:0,lastCrashTs:null,recentCrashes:false};
  }

  static getDerivedStateFromError(e){
    return{hasError:true,error:e};
  }

  componentDidCatch(error,info){
    const ts=new Date().toISOString();
    // Extraire le composant source depuis la stack
    const stack=(info?.componentStack||'');
    const sourceLines=stack.split('\n').filter(l=>l.trim().startsWith('at ')).slice(0,6);
    try{
      const log={ts,msg:error?.message||String(error),component:sourceLines[0]?.trim()||'?',componentStack:sourceLines.join('\n'),stack:error?.stack?.slice(0,600)};
      const prev=JSON.parse(localStorage.getItem('gc-error-log')||'[]');
      localStorage.setItem('gc-error-log',JSON.stringify([log,...prev].slice(0,30)));
    }catch(_){}
    this.setState(s=>{
      const timeSinceLast=s.lastCrashTs?Date.now()-new Date(s.lastCrashTs).getTime():Infinity;
      const consec=timeSinceLast<10000?s.consecutiveCrashes+1:1;

      // Protection contre les crashes répétés : si 5 crashes en 30 secondes, arrêter les tentatives de récupération
      const recentCrashes = consec >= 5 && timeSinceLast < 30000;

      return{errorCount:s.errorCount+1,consecutiveCrashes:consec,lastCrashTs:ts,errorInfo:info,recentCrashes};
    });
  }

  handleRecover=()=>{
    // FIX — dispatcher l'événement dans le callback setState pour garantir que
    // le composant est sorti de l'état d'erreur AVANT de naviguer vers le dashboard.
    // recentCrashes ne bloque plus : on laisse toujours l'utilisateur récupérer.
    this.setState(
      s=>({hasError:false,error:null,errorInfo:null,consecutiveCrashes:0,resetKey:s.resetKey+1,recentCrashes:false}),
      ()=>{ try { window.dispatchEvent(new CustomEvent("gc:force-dashboard")); } catch(_) {} }
    );
  };

  render(){
    const{hasError,error,errorInfo,errorCount,resetKey,consecutiveCrashes}=this.state;
    const T=this.props.T||{};

    if(hasError){
      const bg=T.primary||'#0A1E4A';
      const sur=T.surface||'#0D2257';
      const mu=T.textMuted||'#94A3B8';
      const loopDetected=consecutiveCrashes>=3;
      const borderColor=loopDetected?'#F59E0B':'#EF4444';

      // Extraire le composant source et la ligne
      const rawStack=(errorInfo?.componentStack||'');
      const srcLines=rawStack.split('\n').filter(l=>l.trim().startsWith('at ')).slice(0,5);
      const firstSrc=srcLines[0]?.trim()||null;
      // Extraire le nom du composant React parent
      const compMatch=firstSrc?.match(/^at (\w+)/);
      const compName=compMatch?compMatch[1]:null;
      // Extraire ligne JS si dispo dans error.stack
      const jsStackLines=(error?.stack||'').split('\n').filter(l=>l.includes('<anonymous>')||l.includes('.jsx')||l.includes('.js')).slice(0,3);
      const firstJsLine=jsStackLines[0]?.trim()||null;

      // Mapper les noms de composants aux modules SI lisibles
      const SI_MODULE_MAP={
        BureauOffice:'Bureau & Applications',SIApp:'Noyau SI principal',
        AuditApp:'Audit & Contrôle',GestionComptesPanel:'Gestion des Comptes',
        InformationsPanel:'Informations & Approbations',ProcessusMap:'Processus & Hiérarchie',
        AdminPanel:'Paramètres Direction SI',DemandesModule:'Mes Demandes',
        DossierDetailModal:'Détail Dossier',CollaborateursPanel:'Collaborateurs',
        ConformiteFull:'Conformité',ArchivagePanel:'Archivage',
        NotificationCenter:'Centre de Notifications',AIConfigAdminTab:'Config IA',
        HubProgrammesPanel:'Hub Programmes',HubCfgPanel:'Config Hub',
        GestionDocsUnifiee:'Dossiers & Documents',
      };
      // Chercher le premier composant SI reconnu dans la stack
      let siModule=null;
      let siCompName=null;
      for(const line of srcLines){
        const m=line.match(/at (\w+)/);
        if(m&&SI_MODULE_MAP[m[1]]){siModule=SI_MODULE_MAP[m[1]];siCompName=m[1];break;}
      }
      // Si pas trouvé, chercher dans toute la stack
      if(!siModule&&compName&&SI_MODULE_MAP[compName]){siModule=SI_MODULE_MAP[compName];siCompName=compName;}

      return(
        <div style={{width:'100vw',height:'100vh',background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Segoe UI,system-ui,sans-serif',position:'fixed',inset:0,zIndex:99999}}>
          <div style={{background:sur,border:`2px solid ${borderColor}`,borderRadius:16,padding:'28px 32px',maxWidth:620,width:'92%',textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}}>
            <div style={{fontSize:44,marginBottom:8}}>{loopDetected?'⚠️':'🛡️'}</div>
            <div style={{color:borderColor,fontWeight:900,fontSize:16,marginBottom:6}}>
              {loopDetected?'Erreur persistante détectée':'Erreur interceptée — Données préservées'}
            </div>
            <div style={{color:mu,fontSize:12,marginBottom:12,lineHeight:1.8}}>
              {loopDetected
                ?<><strong style={{color:'#F59E0B'}}>⚠️ Mode dégradé actif — vos données sont sauvegardées.</strong></>
                :<><strong style={{color:'#22C55E'}}>✅ Toutes vos données sont intactes</strong> et seront restaurées automatiquement.</>
              }
            </div>

            {/* Nature / cause de l'erreur */}
            {error&&(
              <div style={{background:'#EF444412',border:'1px solid #EF444428',borderRadius:8,padding:'10px 14px',marginBottom:10,textAlign:'left'}}>
                <div style={{color:'#F87171',fontWeight:800,fontSize:11,marginBottom:4}}>🔴 Nature de l'erreur</div>
                <div style={{fontFamily:'monospace',color:'#FCA5A5',fontSize:10,wordBreak:'break-all',lineHeight:1.6}}>
                  {error.message||String(error)}
                </div>
              </div>
            )}

            {/* Source de l'erreur */}
            {(siModule||compName||firstJsLine)&&(
              <div style={{background:'#F59E0B0D',border:'1px solid #F59E0B28',borderRadius:8,padding:'10px 14px',marginBottom:10,textAlign:'left'}}>
                <div style={{color:'#FCD34D',fontWeight:800,fontSize:11,marginBottom:6}}>📍 Source du problème</div>
                {siModule&&<div style={{color:'#FDE68A',fontSize:11,fontWeight:700,marginBottom:3}}>🗂️ Module SI : <strong style={{color:'#F59E0B'}}>{siModule}</strong></div>}
                {siCompName&&<div style={{fontFamily:'monospace',color:'#FDE68A',fontSize:10,marginBottom:3}}>Composant React : <strong>{siCompName}</strong></div>}
                {!siModule&&compName&&<div style={{fontFamily:'monospace',color:'#FDE68A',fontSize:10,marginBottom:3}}>Composant : <strong>{compName}</strong></div>}
                {firstJsLine&&<div style={{fontFamily:'monospace',color:'#FDE68A',fontSize:9,opacity:0.8,wordBreak:'break-all'}}>{firstJsLine}</div>}
              </div>
            )}

            {/* Stack composants React */}
            {srcLines.length>0&&(
              <details style={{marginBottom:12,textAlign:'left'}}>
                <summary style={{color:mu,fontSize:10,cursor:'pointer',userSelect:'none'}}>🔍 Arborescence des composants (cliquer pour dérouler)</summary>
                <div style={{background:'#00000030',borderRadius:6,padding:'8px 10px',marginTop:6,fontFamily:'monospace',fontSize:9,color:'#94A3B8',lineHeight:1.7,overflow:'auto',maxHeight:100}}>
                  {srcLines.map((l,i)=><div key={i}>{l}</div>)}
                </div>
              </details>
            )}

            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:14}}>
              {!loopDetected&&(
                <button onClick={this.handleRecover}
                  style={{background:'linear-gradient(135deg,#22C55E,#16A34A)',border:'none',color:'#fff',borderRadius:8,padding:'10px 22px',cursor:'pointer',fontWeight:700,fontSize:13,boxShadow:'0 4px 14px #22C55E40'}}>
                  🔄 Récupérer et continuer
                </button>
              )}
              {loopDetected&&(
                <button onClick={this.handleRecover}
                  style={{background:'linear-gradient(135deg,#F59E0B,#D97706)',border:'none',color:'#fff',borderRadius:8,padding:'10px 22px',cursor:'pointer',fontWeight:700,fontSize:13,boxShadow:'0 4px 14px #F59E0B40'}}>
                  ↩ Retourner à l'écran d'accueil
                </button>
              )}
              <button onClick={()=>window.location.reload()}
                style={{background:'transparent',border:`1px solid ${borderColor}55`,color:mu,borderRadius:8,padding:'10px 18px',cursor:'pointer',fontWeight:600,fontSize:12}}>
                ↺ Recharger la page
              </button>
            </div>
            <div style={{color:mu,fontSize:10,lineHeight:1.7,borderTop:`1px solid ${borderColor}22`,paddingTop:10}}>
              Incident #{errorCount}{consecutiveCrashes>1?` · ${consecutiveCrashes} consécutifs`:''} · {new Date().toLocaleString('fr-FR')}<br/>
              <span style={{opacity:0.65}}>Données sauvegardées en continu — aucune perte possible</span>
            </div>
          </div>
        </div>
      );
    }

    return React.cloneElement(
      React.Children.only(this.props.children),
      {key:'si-app-'+resetKey}
    );
  }
}

/* ===========================================================
   SI CONTEXT  -  États partagés sans re-créer les composants
   =========================================================== */
export const SICtx = createContext(null);

export const _noop = () => {};
// FIX v127 — Normalisation statuts tâches : "TERMINÉ" (accent, modules) et "TERMINE" (sans accent, système) coexistent
// Ces helpers centralisent le test pour éviter tout oubli dans les filtres
export const _tDone   = (t) => t?.status === "TERMINE" || t?.status === "TERMINÉ";
export const _tActive = (t) => t?.status !== "TERMINE" && t?.status !== "TERMINÉ";

// v117 — Helper: exclure les comptes suspendus définitivement de toutes les listes
export const _activeUser = (u) => (u?.accountStatus || "ACTIF") !== "SUSPENDU_DEFINITIF";
export const _activeUsers = (users) => (users || []).filter(_activeUser);

// ── Utilitaire global : push notification cross-user vers localStorage (dédup intégré) ──
export const gcPushNotif = (userId, notif) => {
  if (!userId || !notif) return;
  try {
    const k = `GC_SI_v12:notif:${userId}`;
    const ex = JSON.parse(_lsGet(k) || "[]");
    // Dédup par message+heure similaire (évite les envois multiples rapides)
    const now = Date.now();
    const isDup = ex.some(n =>
      n.message === notif.message &&
      Math.abs(new Date(n.at||0).getTime() - now) < 5000
    );
    if (isDup) return;
    const next = [notif, ...ex].slice(0, 200);
    _lsSet(k, JSON.stringify(next));
    // FIX v129 — Sync cross-machine : propager les notifications aux autres postes
    // via le hook enregistré par dsRegisterNotifSync() (datastore.js)
    try {
      if (typeof window !== 'undefined' && typeof window.__gcNotifSync === 'function') {
        window.__gcNotifSync(userId, next);
      }
    } catch (_) {}
  } catch (_) {}
};

// Fallback constants for localStorage (loaded at startup)
// FIX vSERVER-TIME — Heure du serveur : décalage calculé une seule fois au démarrage.
// Toutes les horloges du SI utilisent getServerTime() au lieu de new Date().
let _serverTimeOffset = 0; // ms de différence entre heure serveur et heure locale
let _serverTimeSynced = false;

export function syncServerTime(proxyUrl) {
  if (_serverTimeSynced) return;
  try {
    const t0 = Date.now();
    fetch(`${proxyUrl}/api/server-time`, { method: 'GET' })
      .then(r => r.json())
      .then(data => {
        const t1 = Date.now();
        const rtt = t1 - t0;
        const serverMs = new Date(data.time).getTime();
        // Décalage = heure serveur - heure locale (corrigé du RTT aller-retour)
        _serverTimeOffset = serverMs - (t0 + rtt / 2);
        _serverTimeSynced = true;
        console.log(`[SI] 🕐 Heure serveur synchronisée. Décalage : ${Math.round(_serverTimeOffset)}ms`);
      })
      .catch(() => {});
  } catch (_) {}
}

export function getServerTime() {
  return new Date(Date.now() + _serverTimeOffset);
}

export function LiveClock({ color = "#C41E3A", style: s = {} }) {
  const [time, setTime] = useState(() => getServerTime());
  useEffect(() => {
    const iv = setInterval(() => setTime(getServerTime()), 1000);
    return () => clearInterval(iv);
  }, []);
  const pad = n => String(n).padStart(2, "0");
  return (
    <span style={{ fontFamily: "monospace", color, fontWeight: 700, ...s }}>
      {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
    </span>
  );
};


export const getUserProcess = (user) => {
  if (!user) return [];
  if (user.level >= 5 || user.isAdmin || user.isMG) return Object.keys(PROCESS_ACTIVITIES);
  // FIX v130 — Visibilité totale pour S02/P02 niveau 4+ que ce soit le processus principal OU secondaire.
  // Ex : un auditeur principal S02 niv4+ voit tout. Un juriste O02/S02 niv4+ aussi.
  // La distinction v130 vs v126 : on vérifie user.process ET user.processes, mais uniquement niv4+.
  const allUserProcs = [...(user.processes || []), user.process || ""].filter(Boolean);
  if (["S02","P02"].some(p => allUserProcs.includes(p)) && user.level >= 4) return Object.keys(PROCESS_ACTIVITIES);
  const p = user.process || "";
  if (p === "ALL") return Object.keys(PROCESS_ACTIVITIES);
  // FIX v129 — Inclure toujours le processus principal dans la liste multi-processus
  if (user.processes && user.processes.length > 0) {
    return [...new Set([p, ...user.processes].filter(Boolean))];
  }
  return p.split("/").filter(Boolean);
};

export const useSI = () => useContext(SICtx);

