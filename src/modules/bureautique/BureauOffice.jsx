import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// BureauOffice.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, playSound, gcCalcPaie, _activeUser, SIErrorBoundary, gcAIAsk, gcGetActivePlan, dsSave } from '../../core/index.js';
import { PROCESS_APP_MATRIX_DEFAULT, PLAN_COMPTABLE_OHADA } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';
import { AIAssistant } from '../../components/AIAssistant.jsx';
import { ToolsWidget } from '../../components/ToolsWidget.jsx';
import { AuditApp } from '../audit/AuditApp.jsx';
import { CommunicationApp } from '../communication/CommunicationApp.jsx';
import { ConformiteFull } from '../conformite/ConformiteApp.jsx';
import { ConseilApp } from '../conseil/ConseilApp.jsx';
import { FiscalConfigPanel } from '../admin/SIConfigPanels.jsx';
import { ConventionModule, FacturationModule, OHADARefApp } from '../finance/FinanceApp.jsx';
import { FormulaireApp } from './Formulaires.jsx';
import { GestionRapideUnifiee } from './GestionRapide.jsx';
import { GestionDocsUnifiee } from '../docs/GestionDocsUnifiee.jsx';
import { AppAccessManager } from '../docs/AppAccessManager.jsx';
import { JuridiqueAppV2 } from '../juridique/JuridiqueApp.jsx';
import { LogistiqueModule } from '../logistique/LogistiqueApp.jsx';
import { PresentationApp } from './PresentationPro.jsx';
import { RapportActiviteModule } from '../rapport/RapportActiviteModule.jsx';
import { SIRHModule } from '../sirh/SIRHModule.jsx';
import { WriterProApp } from './WriterPro.jsx';
import { TableurPro } from './TableurPro.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export const BureauOffice = React.memo(function BureauOffice(props) {
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const { T, currentUser, setNotifications, rdvs=[], dossiers=[], setDossiers=_noop, partners=[], setPartnersSync=_noop, appHabilitations=[], appAccessCodes=[], setAppHabilitations=_noop, setAppAccessCodes=_noop, users=[], setUsers=_noop, taches=[], setTaches=_noop, setRdvs=_noop, isDemoMode=false, initialApp=null, pendingApprovals=[], setPendingApprovals=_noop, docs=[], setDocs=_noop, standaloneDocuments=[], saveStandaloneDocs=_noop, dossierFiles=[], saveDossierFiles=_noop } = props;
  const isAdmin = currentUser?.isAdmin || currentUser?.level >= 6;
  const resolveInitialApp = (id) => {
    if (!id) return null;
    // FIX v125 — "gestion_docs" est l'alias module sidebar de docs_app dans BureauOffice
    const map = { "rh": "sirh", "gestion_docs": "docs_app" };
    return map[id] || id;
  };
  const [activeApp, setActiveAppRaw] = useState(() => {
    const fromProp = resolveInitialApp(initialApp);
    if (fromProp) return fromProp;
    try { return sessionStorage.getItem('gc-bureau-app') || null; } catch (_) { return null; }
  });
  const [accessDeniedApp, setAccessDeniedApp] = useState(null);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [promoMsg, setPromoMsg] = useState(null);
  // FIX v150 — Bouton Paramètres (admin) dans les apps contrôlées
  const [showAppSettings, setShowAppSettings] = useState(false);

  const [lastVisits, setLastVisits] = useState(()=>{ try{ return JSON.parse(_lsGet("gc-bureau-lastvisits")||"{}") }catch (_) {return{};} });
  const setActiveApp = React.useCallback((appId)=>{
    setLastVisits(prev=>{ const n={...prev,[appId]:new Date().toISOString()}; try{_lsSet("gc-bureau-lastvisits",JSON.stringify(n));}catch (_) {} return n; });
    try { sessionStorage.setItem('gc-bureau-app', appId); } catch (_) {}
    setActiveAppRaw(appId);
  },[]);

  // Listener gc:open-facture — depuis GestionDocsUnifiee → ouvre directement Facturation
  React.useEffect(()=>{
    const handler = () => { setActiveApp("facturation"); };
    window.addEventListener("gc:open-facture", handler);
    return () => window.removeEventListener("gc:open-facture", handler);
  }, [setActiveApp]);

  // Listener gc:open-subapp — depuis Hub Programmes → ouvre une sous-app directement (ex: conventions)
  React.useEffect(()=>{
    const handler = (e) => { if(e.detail?.subApp) setActiveApp(e.detail.subApp); };
    window.addEventListener("gc:open-subapp", handler);
    return () => window.removeEventListener("gc:open-subapp", handler);
  }, [setActiveApp]);
  const getAppBadge = React.useCallback((appId)=>{
    const since = lastVisits[appId] ? new Date(lastVisits[appId]) : null;
    if(!since) return 0;
    if(appId==="docs_app"){
      const newD=(dossiers||[]).filter(d=>d.createdAt&&new Date(d.createdAt)>since).length;
      const newDoc=(docs||[]).filter(d=>d.createdAt&&new Date(d.createdAt)>since).length;
      return newD+newDoc;
    }
    if(appId==="courrier"){
      const msgs=(()=>{ try{ return JSON.parse(_lsGet("gc-messages-v2")||"[]"); }catch (_) {return[];} })();
      return msgs.filter(m=>m.to===currentUser?.id&&!m.read&&m.at&&new Date(m.at)>since).length;
    }
    if(appId==="gestion_rapide"){
      const cards=(()=>{ try{ return JSON.parse(_lsGet("gc-kanban-cards-v2")||"[]"); }catch (_) {return[];} })();
      return cards.filter(c=>c.createdAt&&new Date(c.createdAt)>since&&c.assignee===currentUser?.id).length;
    }
    return 0;
  },[lastVisits,dossiers,currentUser]);

  const hasAppAccess = (app) => {
    // ── Niveaux 5 et 6 (DG / Admin) : accréditation totale SI — accès à tout ──
    if (currentUser.isAdmin || currentUser.isMG || currentUser.level >= 5) return true;

    // ── Convention de Mission : universel niv.3+ ──
    if (app.id === "conventions") return currentUser.level >= 3;
    if (!app.minLevel && (!app.processes || app.processes.length === 0) && !app.id) return true;

    // FIX v150 — strictBlock : si l'app est marquée strictBlock ET que l'utilisateur
    // n'appartient pas à un processus autorisé → blocage total (aucun code ne peut débloquer)
    if (app.strictBlock && app.processes?.length > 0) {
      const rawProc = currentUser?.process || "";
      const userProcs = [...new Set([
        ...(currentUser?.processes || []),
        ...rawProc.split("/").map(p => p.trim()).filter(Boolean),
      ])].filter(Boolean);
      const inAllowedProc = app.processes.some(p => userProcs.includes(p));
      if (!inAllowedProc) return false; // bloqué définitivement
    }

    const now = Date.now();

    // ── Vérification 1 : Matrice processus (config Admin ou DG — prioritaire) ──
    const processMatrix = (() => { try { return JSON.parse(_lsGet("gc-process-app-matrix")||"null") || PROCESS_APP_MATRIX_DEFAULT; } catch (_) { return PROCESS_APP_MATRIX_DEFAULT; } })();
    const rawProc = currentUser.process || "";
    // FIX v143 — Déduplique et normalise : inclut process principal + tableau processes + process composite (séparateur "/")
    const userProcesses = [...new Set([
      ...(currentUser.processes || []),
      ...rawProc.split("/").map(p => p.trim()).filter(Boolean),
    ])].filter(Boolean);
    // FIX v130 — matrixAllows retourne maintenant "explicit" | "global" | false
    // "explicit" = app listée directement dans la matrice du processus user → prioritaire sur app.processes
    // "global"   = app dans la clé ALL sans override négatif
    // false      = bloqué ou absent
    const matrixAllows = (appId) => {
      for (const proc of userProcesses) {
        const allowed = processMatrix[proc] || [];
        if (allowed.includes("!" + appId)) return false;         // override négatif explicite
        if (allowed.includes(appId)) return "explicit";          // ✅ activé spécifiquement pour ce processus
      }
      const allAllowed = processMatrix["ALL"] || [];
      if (allAllowed.includes("!" + appId)) return false;
      if (allAllowed.includes(appId)) return "global";
      return false;
    };

    // ── Vérification 2 : Habilitations individuelles (AppAccessManager) ──
    const hasHab = () => (appHabilitations||[]).some(h =>
      h.active && h.appId === app.id &&
      (h.userId === currentUser.id || h.userId === "ALL")
    );
    const hasCode = () => {
      return (appAccessCodes||[]).some(c => {
        if (!c.active) return false;
        if (!(c.appId === app.id || c.appId === "ALL")) return false;
        if (c.expiresAt && new Date(c.expiresAt).getTime() <= now) return false;
        if (c.userId === currentUser.id || c.userId === "ALL") return true;
        if (c.targetMode === "universal") return true;
        if (Array.isArray(c.targetIds) && (c.targetIds.includes(currentUser.id) || c.targetIds.includes("ALL"))) return true;
        return false;
      });
    };

    // Habilitation individuelle ou code → accès même si pas dans matrice
    if (hasHab() || hasCode()) return true;

    // FIX v130 — Utiliser le résultat typé de matrixAllows
    // "explicit" = DG/Admin a explicitement ouvert cette app pour ce processus → accès garanti (bypass app.processes)
    // "global"   = app dans la liste ALL → accès si aussi validé par app.processes ou minLevel
    // false      = bloqué explicitement par override négatif
    const matrixResult = app.id ? matrixAllows(app.id) : null;
    if (matrixResult === false) return false;
    if (matrixResult === "explicit") {
      // La matrice a été configurée par DG/Admin : court-circuiter le filtre app.processes
      return !(app.minLevel && currentUser.level < app.minLevel);
    }

    if (app.minLevel && currentUser.level < app.minLevel) return false;

    if (app.processes && app.processes.length > 0) {
      if (app.processes.some(p => userProcesses.includes(p))) return true;
      return false;
    }
    return true;
  };

  const tryPromoCode = (app) => {
    const trimmed = promoCodeInput.trim().toUpperCase();
    if (!trimmed) { setPromoMsg({ type:"error", text:"Veuillez saisir un code d'accès." }); return; }
    const now = Date.now();
    const match = appAccessCodes.find(c => {
      if (c.code !== trimmed) return false;
      if (!(c.appId === app.id || c.appId === "ALL")) return false;
      if (!c.active) return false;
      if (c.expiresAt && new Date(c.expiresAt).getTime() <= now) return false;
      if (c.userId === currentUser.id || c.userId === "ALL") return true;
      if (c.targetMode === "universal") return true;
      if (Array.isArray(c.targetIds) && (c.targetIds.includes(currentUser.id) || c.targetIds.includes("ALL"))) return true;
      return false;
    });
    if (match) {
      setPromoMsg({ type:"success", text:"✅ Accès accordé !" });
      setTimeout(() => { setActiveApp(app.id); setAccessDeniedApp(null); setPromoCodeInput(""); setPromoMsg(null); }, 700);
    } else {
      setPromoMsg({ type:"error", text:"❌ Code invalide, expiré ou non autorisé pour cette application." });
    }
  };

  const [writerDocs, setWriterDocs] = useState(() => { try { return JSON.parse(_lsGet("gc-writer-docs")||"[]"); } catch (_) { return []; }});
  const [writerCurrent, setWriterCurrent] = useState(null);
  const [writerContent, setWriterContent] = useState("");
  const [writerTitle, setWriterTitle] = useState("Document sans titre");
  const writerEditorRef = useRef(null);

  const [tableurDocs, setTableurDocs] = useState(() => { try { return JSON.parse(_lsGet("gc-tableur-docs")||"[]"); } catch (_) { return []; }});
  const [tableurCurrent, setTableurCurrent] = useState(null);
  const [rows, setRows] = useState(() => Array.from({length:20},(_,r)=>Array.from({length:8},(_,c)=>({v:r===0?["A","B","C","D","E","F","G","H"][c]:"",bold:r===0,formula:""}))));
  const [sel, setSel] = useState({r:1,c:0});
  const [editVal, setEditVal] = useState("");

  const [finTool, setFinTool] = useState("dashboard");
  // Filtres & tri — Journal comptable
  const [journalSearch, setJournalSearch] = useState("");
  const [journalDateFrom, setJournalDateFrom] = useState("");
  const [journalDateTo, setJournalDateTo] = useState("");
  const [journalSort, setJournalSort] = useState("date_desc");
  const [journalPage, setJournalPage] = useState(0); // pagination — 25 par page
  // FIX v143 — Exercice comptable OHADA : 1er jan → 31 déc (Art. 7 AUPCAP)
  const [exerciceAnnee, setExerciceAnnee] = useState(() => new Date().getFullYear());
  // Filtres — Budget
  const [budgetSearch, setBudgetSearch] = useState("");
  // Filtres — TPA (Audit) — définis dans l'app Audit (ligne ~13237)
  // FIX v63 — Plan comptable OHADA: états déplacés hors IIFE (Rules of Hooks)
  const [cptSearch, setCptSearch] = React.useState("");
  const [cptFilter, setCptFilter] = React.useState("all");
  const [showCptForm, setShowCptForm] = React.useState(false);
  const [cptForm, setCptForm] = React.useState({num:"",lib:"",cl:"6",type:"CH"});
  const [editCpt, setEditCpt] = React.useState(null);
  const [journalEntries, setJournalEntries] = useState(() => { try { return JSON.parse(_lsGet("gc-journal")||"null") || []; } catch (_) { return []; }});
  const [journalForm, setJournalForm] = useState({date:new Date().toISOString().split("T")[0],piece:"",libelle:"",compteDebit:"",compteCredit:"",debit:"",credit:"",tiers:"",dossierId:""});
  const [editingJournalId, setEditingJournalId] = useState(null);
  const [budgetLines, setBudgetLines] = useState(() => { try { return JSON.parse(_lsGet("gc-budget")||"null") || [{ id:1, poste:"Honoraires", previsionnel:5000000, realise:3200000 },{ id:2, poste:"Charges salariales", previsionnel:2500000, realise:2100000 },{ id:3, poste:"Frais généraux", previsionnel:800000, realise:450000 }]; } catch (_) { return []; }});
  const [tvaForm, setTvaForm] = useState({ht:"",taux:"18",tva:"",ttc:""}) // TVA Gabon 18% par défaut (OHADA);
  const [budgetForm, setBudgetForm] = useState({poste:"",previsionnel:"",realise:""});
  const [editingBudgetId, setEditingBudgetId] = useState(null);

  const [rhTool, setRhTool] = useState("paie");
  const [paieForm, setPaieForm] = useState({nom:"",brut:"",avantages:"0",retenues:"0"});
  const [paieResult, setPaieResult] = useState(null);
  const [leaveForm, setLeaveForm] = useState({employe:"",type:"CONGE_ANNUEL",debut:"",fin:"",motif:""});
  const [leaves, setLeaves] = useState(() => { try { return JSON.parse(_lsGet("gc-leaves")||"[]"); } catch (_) { return []; }});

  const [auditTool, setAuditTool] = useState("dashboard"); // FIX v137 — open on dashboard
  const [riskMatrix, setRiskMatrix] = useState(() => { try { return JSON.parse(_lsGet("gc-risks")||"null") || [
    {id:1,domaine:"Finances",risque:"Non-recouvrement créances",probabilite:3,impact:4,controle:"Suivi mensuel"},
    {id:2,domaine:"RH",risque:"Turnover élevé",probabilite:2,impact:3,controle:"Politique fidélisation"},
    {id:3,domaine:"SI",risque:"Perte données",probabilite:2,impact:5,controle:"Sauvegardes quotidiennes"},
  ]; } catch (_) { return []; }});
  const [newRisk, setNewRisk] = useState({domaine:"",risque:"",probabilite:1,impact:1,controle:""});
  const [checklistItems, setChecklistItems] = useState(() => { try { return JSON.parse(_lsGet("gc-audit-checklist")||"null") || [
    {id:1,section:"Comptabilité",point:"Balance de vérification établie",done:false},
    {id:2,section:"Comptabilité",point:"Rapprochement bancaire effectué",done:false},
    {id:3,section:"RH",point:"Contrats de travail signés",done:true},
    {id:4,section:"RH",point:"Registre du personnel à jour",done:false},
    {id:5,section:"Fiscal",point:"Déclarations TVA à jour",done:true},
    {id:6,section:"Fiscal",point:"IS/IRPP calculé",done:false},
    {id:7,section:"Gouvernance",point:"PV du Conseil d'Administration",done:true},
    {id:8,section:"Gouvernance",point:"Rapport de gestion rédigé",done:false},
  ]; } catch (_) { return []; }});

  const saveWriterDoc = () => {
    const now = new Date().toISOString();
    const content = writerEditorRef.current?.innerHTML || "";
    let docs;
    if (writerCurrent) {
      docs = writerDocs.map(d => d.id===writerCurrent.id ? {...d, title:writerTitle, content, updatedAt:now} : d);
    } else {
      const newDoc = {id:`WD-${Date.now()}`,title:writerTitle,content,createdBy:currentUser.name,createdAt:now,updatedAt:now};
      setWriterCurrent(newDoc);
      docs = [newDoc, ...writerDocs];
    }
    setWriterDocs(docs);
    try { _lsSet("gc-writer-docs", JSON.stringify(docs.slice(0,30).map(d=>({...d,content:d.content?.slice(0,20000)||""}))));} catch (_) {}
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"📄",message:`Document "${writerTitle}" sauvegardé`,at:now,read:false},...prev]);
  };

  const newWriterDoc = () => { setWriterCurrent(null); setWriterTitle("Document sans titre"); if(writerEditorRef.current)writerEditorRef.current.innerHTML=""; };

  // FIX v92 Bug#2 — Parser d'expressions sécurisé : remplace eval() dans les formules
  // Accepte : nombres, +−*/(), espaces, et fonctions SUM/AVG/MIN/MAX/ROUND/IF
  // Refuse tout le reste (fetch, alert, window, etc.) → retourne #ERR
  const _safeEval = (() => {
    // Tokenizer léger
    const TOKEN = /(\d+\.?\d*|\.\d+)|([+\-*/(),])|([A-Za-z_]\w*)|(\s+)/g;
    const tokenize = (expr) => {
      const tokens = [];
      let m;
      TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(expr)) !== null) {
        if (m[4]) continue; // espace
        if (m[1]) tokens.push({ t: "num", v: parseFloat(m[1]) });
        else if (m[2]) tokens.push({ t: "op", v: m[2] });
        else if (m[3]) tokens.push({ t: "id", v: m[3].toUpperCase() });
        else throw new Error("Token invalide");
      }
      return tokens;
    };
    // Fonctions autorisées uniquement
    const FNS = {
      SUM:   (args) => args.reduce((a, b) => a + b, 0),
      AVG:   (args) => args.length ? args.reduce((a, b) => a + b, 0) / args.length : 0,
      MIN:   (args) => Math.min(...args),
      MAX:   (args) => Math.max(...args),
      ROUND: (args) => Math.round(args[0] * Math.pow(10, args[1] || 0)) / Math.pow(10, args[1] || 0),
      ABS:   (args) => Math.abs(args[0]),
      IF:    (args) => args[0] ? args[1] : args[2]};
    // Parser récursif descent
    const parse = (tokens, pos) => {
      const parseExpr = () => {
        let left = parseTerm();
        while (pos[0] < tokens.length && (tokens[pos[0]].v === "+" || tokens[pos[0]].v === "-")) {
          const op = tokens[pos[0]++].v;
          const right = parseTerm();
          left = op === "+" ? left + right : left - right;
        }
        return left;
      };
      const parseTerm = () => {
        let left = parseFactor();
        while (pos[0] < tokens.length && (tokens[pos[0]].v === "*" || tokens[pos[0]].v === "/")) {
          const op = tokens[pos[0]++].v;
          const right = parseFactor();
          if (op === "/" && right === 0) return NaN;
          left = op === "*" ? left * right : left / right;
        }
        return left;
      };
      const parseFactor = () => {
        if (pos[0] >= tokens.length) return 0;
        const tk = tokens[pos[0]];
        // Nombre
        if (tk.t === "num") { pos[0]++; return tk.v; }
        // Moins unaire
        if (tk.t === "op" && tk.v === "-") { pos[0]++; return -parseFactor(); }
        // Parenthèses
        if (tk.t === "op" && tk.v === "(") {
          pos[0]++;
          const val = parseExpr();
          if (pos[0] < tokens.length && tokens[pos[0]].v === ")") pos[0]++;
          return val;
        }
        // Fonction ou identifiant
        if (tk.t === "id") {
          const name = tk.v;
          pos[0]++;
          if (pos[0] < tokens.length && tokens[pos[0]].v === "(") {
            if (!FNS[name]) throw new Error(`Fonction inconnue: ${name}`);
            pos[0]++; // consommer "("
            const args = [];
            while (pos[0] < tokens.length && tokens[pos[0]].v !== ")") {
              args.push(parseExpr());
              if (pos[0] < tokens.length && tokens[pos[0]].v === ",") pos[0]++;
            }
            if (pos[0] < tokens.length) pos[0]++; // consommer ")"
            return FNS[name](args);
          }
          // Identifiant sans parenthèse → 0 (référence déjà résolue avant tokenize)
          return 0;
        }
        return 0;
      };
      return parseExpr();
    };
    return (expr) => {
      try {
        const tokens = tokenize(expr);
        const pos = [0];
        const result = parse(tokens, pos);
        if (!isFinite(result)) return "#DIV0";
        return result;
      } catch(_) { return null; } // null = #ERR
    };
  })();

  const calcCell = (val, allRows) => {
    if (!val || !val.startsWith("=")) return val || "";
    try {
      // Résoudre les références cellules AVANT de tokeniser (ex: A1 → 42)
      const expr = val.slice(1).replace(/([A-H])(\d+)/gi, (_, col, row) => {
        const ci = "ABCDEFGH".indexOf(col.toUpperCase());
        const ri = parseInt(row, 10) - 1;
        // FIX v92 Bug#5 — allRows est le tableau complet de lignes (pas la ligne courante)
        return parseFloat(allRows?.[ri]?.[ci]?.v) || 0;
      });
      const result = _safeEval(expr);
      if (result === null) return "#ERR";
      // Arrondir les flottants parasites (ex: 0.1+0.2 = 0.30000000000000004)
      const rounded = Math.round(result * 1e10) / 1e10;
      return String(rounded);
    } catch (_) { return "#ERR"; }
  };

  const updateCell = (r, c, val) => {
    setRows(prev => {
      const next = prev.map((row,ri) => ri===r ? row.map((cell,ci) => ci===c ? {...cell, v:val} : cell) : row);
      return next;
    });
    setEditVal(val);
  };

  const tableurCSV = () => {
    const csv = rows.map(row=>row.map(c=>`"${c.v||""}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="tableur_gc.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const calcTVA = () => {
    const ht = parseFloat(tvaForm.ht) || 0;
    const taux = parseFloat(tvaForm.taux) || 18;
    const tva = ht * taux / 100;
    const ttc = ht + tva;
    setTvaForm(f=>({...f, tva:tva.toFixed(0), ttc:ttc.toFixed(0)}));
  };

  const addJournalEntry = async () => {
    if (!journalForm.libelle || !journalForm.compteDebit || !journalForm.compteCredit) { gcAlert("Libellé, compte débit et compte crédit sont requis."); return; }
    if (!journalForm.debit || parseFloat(journalForm.debit)<=0) { gcAlert("Montant requis (> 0)."); return; }
    // FIX v59: vérification équilibre débit/crédit (partie double OHADA)
    const debitVal = parseFloat(journalForm.debit)||0;
    const creditVal = parseFloat(journalForm.credit)||debitVal;
    if (Math.abs(debitVal - creditVal) > 0.01) { if(!await gcConfirm(`⚠️ Écriture déséquilibrée : Débit ${debitVal.toLocaleString("fr-FR")} ≠ Crédit ${creditVal.toLocaleString("fr-FR")}. Continuer quand même ?`)) return; }
    const montant = parseFloat(journalForm.debit) || 0;
    // FIX v59: utiliser le montant crédit saisi si différent (écritures complexes)
    const montantCredit = parseFloat(journalForm.credit) || montant;
    const resetForm = {date:new Date().toISOString().split("T")[0],piece:"",libelle:"",compteDebit:"",compteCredit:"",debit:"",credit:"",tiers:"",dossierId:""};
    if (editingJournalId) {
      // Mode édition : mise à jour de l'écriture existante
      const updated = journalEntries.map(e => e.id===editingJournalId
        ? {...e,...journalForm,compte:journalForm.compteDebit,credit:String(montant),updatedBy:currentUser.name,updatedAt:new Date().toISOString()}
        : e);
      setJournalEntries(updated);
      try { _lsSet("gc-journal", JSON.stringify(updated.slice(0,500))); } catch (_) {} dsSave("gc-journal", updated.slice(0,500)).catch(err => gcToast.syncError('', err));
      setEditingJournalId(null);
    } else {
      // Mode création
      const entry = {...journalForm,compte:journalForm.compteDebit,debit:String(montant),credit:String(montantCredit),id:`JE-${Date.now()}`,addedBy:currentUser.name,addedAt:new Date().toISOString()};
      const updated = [entry, ...journalEntries];
      setJournalEntries(updated);
      try { _lsSet("gc-journal", JSON.stringify(updated.slice(0,500))); } catch (_) {} dsSave("gc-journal", updated.slice(0,500)).catch(err => gcToast.syncError('', err));
    }
    setJournalForm(resetForm);
  };

  const calcPaie = () => {
    const brut = parseFloat(paieForm.brut) || 0;
    const avantages = parseFloat(paieForm.avantages) || 0;
    const retenues = parseFloat(paieForm.retenues) || 0;
    // Utilise la config fiscale OHADA (modifiable depuis Admin Paramètres)
    const result = gcCalcPaie(brut, avantages, retenues);
    setPaieResult(result);
  };

  const addLeave = () => {
    if (!leaveForm.employe || !leaveForm.debut || !leaveForm.fin) { gcAlert("Tous les champs sont requis."); return; }
    const updated = [{...leaveForm, id:`LV-${Date.now()}`, status:"EN_ATTENTE", demandePar:currentUser.name, demandeAt:new Date().toISOString()}, ...leaves];
    setLeaves(updated);
    try { _lsSet("gc-leaves", JSON.stringify(updated)); dsSave("gc-leaves",updated).catch(err => gcToast.syncError('', err)); } catch (_) {}
    setLeaveForm({employe:"",type:"CONGE_ANNUEL",debut:"",fin:"",motif:""});
  };

  const addRisk = () => {
    if (!newRisk.domaine || !newRisk.risque) { gcAlert("Domaine et risque requis."); return; }
    const updated = [...riskMatrix, {...newRisk, id:Date.now()}];
    setRiskMatrix(updated);
    try { _lsSet("gc-risks", JSON.stringify(updated)); dsSave("gc-risks",updated).catch(err => gcToast.syncError('', err)); } catch (_) {}
    setNewRisk({domaine:"",risque:"",probabilite:1,impact:1,controle:""});
  };

  const riskScore = (p,i) => p*i;
  const riskColor = (s) => s>=12?"#EF4444":s>=6?"#F59E0B":s>=3?"#3B82F6":"#22C55E";
  const riskLabel = (s) => s>=12?"CRITIQUE":s>=6?"ÉLEVÉ":s>=3?"MODÉRÉ":"FAIBLE";

  const APPS = useMemo(() => [
    // ── BUREAUTIQUE — Accès universel ─────────────────────────────────────
    { id:"gestion_rapide",icon:"🗂️", label:"Gestion Rapide & Kanban", desc:"Tâches Kanban + Dossiers + Documents + Archives — Codification cabinet intégrée", color:"#EC4899", group:"bureau" },
    { id:"writer",       icon:"📝", label:"Writer Pro",              desc:"Traitement de texte WYSIWYG — Styles, tableaux, colonnes, export Word/HTML",  color:"#3B82F6", group:"bureau" },
    { id:"tableur",      icon:"📊", label:"Tableur Pro",             desc:"Tableur avancé — Formules déroulantes SUM/AVG/IF/VLOOKUP, multi-feuilles, export CSV",  color:"#22C55E", group:"bureau" },
    { id:"presentation", icon:"🖥️", label:"Présentation Pro",        desc:"Diaporamas & slides professionnels — Animations, thèmes, export HTML/PDF",  color:"#8B5CF6", group:"bureau" },
    { id:"formulaires",  icon:"📝", label:"Formulaires & Checklists",desc:"Formulaires internes, checklists, enquêtes",                    color:"#F97316", group:"bureau" },
    // Conventions dans Bureautique — niv.3+ universel (tous processus) — verrouillé niv.1 et niv.2
    { id:"conventions",  icon:"📜", label:"Conventions de Mission",    desc:"Lettres de mission, conventions de prestation, avenants — signature numérique · Niv.3+ universel",
      color:"#8B5CF6", group:"bureau", minLevel:3, processes:[] },
    // Budget Rapide déplacé dans ToolsWidget (topbar) — plus accessible, outil quotidien

    // ── APPLICATIONS MÉTIER — Accès contrôlé par processus/habilitation ──
    { id:"docs_app",     icon:"📁", label:"Gestionnaire Docs",       desc:"Parcourir, consulter et archiver dossiers & documents",
      color:"#6366F1", group:"metier", processes:[], minLevel:1 },
    { id:"juridique",    icon:"⚖️", label:"Juridique & OHADA",       desc:"Droit des affaires, OHADA, contrats, modèles juridiques",
      color:"#DC2626", group:"metier", processes:["O02","P02"], minLevel:2 },
    { id:"audit",        icon:"🔍", label:"Audit & Contrôle",        desc:"Risques, matrices ISA/COSO, checklists, rapports d'audit",
      color:"#C41E3A", group:"metier", processes:["S02","O03"], minLevel:2 },
    { id:"finance",      icon:"💰", label:"Finance & Comptabilité",  desc:"Journal comptable, budget, TVA, fiscalité, bilan",
      color:"#C9A84C", group:"metier", processes:["P01","P02","S01"], minLevel:2, strictBlock:true },
      // FIX v150 — Finance strictement réservé P01 (Management), P02 (Gouvernance) et S01 (Finance).
      // strictBlock:true = accès entièrement bloqué sans code ni habilitation possible hors processus autorisés.
    { id:"conseil",      icon:"🎯", label:"Conseil & Stratégie",     desc:"SWOT, PESTEL, matrices stratégiques, plans d'action",
      color:"#0EA5E9", group:"metier", processes:["P01","P02","P03","P04","O03"], minLevel:3 },
    { id:"sirh",         icon:"👥", label:"SIRH — Ressources Humaines", desc:"Présences, congés, recrutements, paie, registre du personnel — Module complet",
      color:"#EA580C", group:"metier", processes:["S03"], minLevel:2 },
    { id:"conformite",   icon:"🛡️", label:"Conformité & Réglementations",desc:"OHADA, droit gabonais, conformité, alertes réglementaires",
      color:"#10B981", group:"metier", processes:["P02","S02"], minLevel:2 },
    { id:"communication",icon:"📢", label:"Communication & Marketing",desc:"Communication externe, réseaux sociaux, plans marketing",
      color:"#EC4899", group:"metier", processes:["S04"], minLevel:2 },
    { id:"logistique",   icon:"🚚", label:"Logistique & Moyens Généraux",desc:"Achats, stocks, équipements, maintenance — Module complet",
      color:"#78716C", group:"metier", processes:["S05","S06"], minLevel:1 },
    // rapport_activite déplacé dans sidebar (entre Tâches et Demandes)
    // Facturation supprimée ici — accessible uniquement depuis Finance & Comptabilité (S01)
  ], []);

  if (!activeApp) return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
        <div style={{fontSize:36}}>💼</div>
        <div style={{flex:1}}>
          <div style={{color:T.text,fontWeight:900,fontSize:17}}>Bureau & Applications</div>
          <div style={{color:T.textMuted,fontSize:11}}>Suite intégrée · Documents, Calcul, Outils métier, Horloge</div>
        </div>
        <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 14px",fontSize:10,color:T.textMuted,textAlign:"right"}}>
          <div style={{fontWeight:700,color:T.text,fontSize:13}}>{new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
          <div>{new Date().toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})}</div>
        </div>
      </div>

      {/* ACCESS DENIED MODAL */}
      {accessDeniedApp && (() => { const app = APPS.find(a=>a.id===accessDeniedApp); return app ? (
        <div style={{position:"fixed",inset:0,background:"#000A",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={() => {setAccessDeniedApp(null);setPromoCodeInput("");setPromoMsg(null);}}>
          <div style={{background:T.surface,border:`2px solid ${app.color}66`,borderRadius:18,padding:"28px 30px",width:360,boxShadow:`0 24px 64px #000A, 0 0 0 1px ${app.color}22`}} onClick={e=>e.stopPropagation()}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:40,marginBottom:6}}>{app.icon}</div>
              <div style={{color:T.text,fontWeight:900,fontSize:15}}>{app.label}</div>
              <div style={{color:"#F59E0B",fontWeight:700,fontSize:11,marginTop:4}}>🔒 Accès restreint</div>
              <div style={{color:T.textMuted,fontSize:10,marginTop:6,lineHeight:1.5}}>
                {app.processes?.length>0 ? `Réservé aux processus : ${app.processes.join(", ")}` : ""}
                {app.minLevel>1 ? ` · Niveau minimum requis : ${app.minLevel}` : ""}
              </div>
            </div>
            {/* FIX v150 — strictBlock : pas de code d'accès pour les apps verrouillées (ex: Finance) */}
            {!app.strictBlock ? (
              <div style={{background:T.surface2,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                <div style={{color:T.textMuted,fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Code d'accès provisoire</div>
                <div style={{display:"flex",gap:8}}>
                  <input value={promoCodeInput} onChange={e=>setPromoCodeInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&tryPromoCode(app)}
                    placeholder="Ex: GCAPP-XXXX" style={{flex:1,background:T.surface3,border:`1px solid ${app.color}55`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,fontFamily:"monospace",letterSpacing:2}} />
                  <button onClick={()=>tryPromoCode(app)} style={{background:app.color,border:"none",color:"#fff",borderRadius:8,padding:"9px 16px",cursor:"pointer",fontWeight:800,fontSize:12}}>OK</button>
                </div>
                {promoMsg && <div style={{marginTop:8,fontSize:11,fontWeight:700,color:promoMsg.type==="success"?"#22C55E":"#EF4444"}}>{promoMsg.text}</div>}
              </div>
            ) : (
              <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:10,padding:"12px 14px",marginBottom:14,textAlign:"center"}}>
                <div style={{fontSize:22,marginBottom:4}}>⛔</div>
                <div style={{color:"#C9A84C",fontWeight:700,fontSize:11}}>Accès totalement restreint</div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:4,lineHeight:1.5}}>Cette application ne peut être ouverte que par les collaborateurs des processus autorisés. Aucun code d'accès provisoire n'est accepté.</div>
              </div>
            )}
            <div style={{fontSize:10,color:T.textDim,textAlign:"center",lineHeight:1.5}}>
              {app.strictBlock
                ? <>Contactez votre <strong>Responsable SI</strong> pour obtenir les droits d'accès adaptés à votre profil.</>
                : <>Demandez un code d'accès provisoire au <strong>Responsable SI</strong> ou au <strong>Manager Général</strong>.<br/>Un code permanent peut être accordé par habilitation.</>
              }
            </div>
            <button onClick={() => {setAccessDeniedApp(null);setPromoCodeInput("");setPromoMsg(null);}} style={{marginTop:14,width:"100%",background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"8px",cursor:"pointer",fontSize:12}}>Fermer</button>
          </div>
        </div>
      ) : null; })()}

      <div style={{marginBottom:18}}>
        <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:3,height:14,background:"#3B82F6",borderRadius:2,display:"inline-block"}}></span> Bureautique
          <span style={{marginLeft:"auto",background:"#3B82F622",border:"1px solid #3B82F633",borderRadius:6,padding:"2px 8px",fontSize:9,color:"#3B82F6"}}>Accès universel</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:12}}>
          {APPS.filter(a=>a.group==="bureau").map(app=>{
            const badge=getAppBadge(app.id);
            // Conventions de Mission : accès contrôlé niv.3+ (conforme aux habilitations configurées)
            const accessible = app.minLevel ? hasAppAccess(app) : true;
            return (
            <button key={app.id} onClick={()=>accessible?setActiveApp(app.id):setAccessDeniedApp(app.id)}
              style={{background:accessible?`linear-gradient(145deg,${T.surface2},${T.surface3})`:`linear-gradient(145deg,${T.surface2},${T.surface3})`,border:`1.5px solid ${accessible?app.color+"33":"#44444455"}`,borderRadius:14,padding:"16px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.22s",position:"relative",overflow:"hidden",minHeight:110,display:"flex",flexDirection:"column",gap:0,opacity:accessible?1:0.78}}
              onMouseEnter={e=>{e.currentTarget.style.border=`1.5px solid ${accessible?app.color+"88":"#66666688"}`;e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 8px 24px ${app.color}22`;e.currentTarget.style.background=`linear-gradient(145deg,${accessible?app.color+"12":T.surface2},${T.surface3})`;}}
              onMouseLeave={e=>{e.currentTarget.style.border=`1.5px solid ${accessible?app.color+"33":"#44444455"}`;e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";e.currentTarget.style.background=`linear-gradient(145deg,${T.surface2},${T.surface3})`;}}>
              {badge>0&&accessible&&<div style={{position:"absolute",top:8,right:8,background:"#EF4444",color:"#fff",borderRadius:99,minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,padding:"0 4px",boxShadow:"0 2px 6px rgba(239,68,68,0.6)",zIndex:2}}>{badge>99?"99+":badge}</div>}
              {app.minLevel&&!accessible&&<div style={{position:"absolute",top:8,right:8,background:"#44444466",color:"#aaa",borderRadius:6,padding:"2px 6px",fontSize:8,fontWeight:700}}>Niv.{app.minLevel}+</div>}
              <div style={{width:32,height:32,borderRadius:10,background:app.color+"18",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8,fontSize:18,transition:"transform 0.2s",filter:accessible?"none":"grayscale(0.4)",flexShrink:0}}>{app.icon}</div>
              <div style={{color:accessible?T.text:T.textMuted,fontWeight:800,fontSize:12,marginBottom:3,lineHeight:1.3}}>{app.label}</div>
              <div style={{color:T.textDim,fontSize:9,lineHeight:1.4,flex:1}}>{app.desc}</div>
              <div style={{display:"flex",alignItems:"center",gap:4,marginTop:8,paddingTop:6,borderTop:`1px solid ${accessible?app.color+"22":"#44444433"}`}}>
                {accessible
                  ? <><span style={{color:app.color,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>Ouvrir</span><span style={{color:app.color,fontSize:11,marginLeft:"auto"}}>→</span></>
                  : <span style={{color:T.textDim,fontSize:9}}>🔒 Niv.{app.minLevel}+ requis</span>}
              </div>
            </button>
          );})}
        </div>
      </div>

      <div>
        <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:3,height:14,background:"#C41E3A",borderRadius:2,display:"inline-block"}}></span> Applications Métier
          <span style={{marginLeft:"auto",background:"#C41E3A22",border:"1px solid #C41E3A33",borderRadius:6,padding:"2px 8px",fontSize:9,color:"#C41E3A"}}>Accès contrôlé par processus/habilitation</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:12}}>
          {APPS.filter(a=>a.group==="metier").map(app=>{ const accessible=hasAppAccess(app); const badge=getAppBadge(app.id); return (
            <button key={app.id} onClick={()=>accessible?setActiveApp(app.id):setAccessDeniedApp(app.id)}
              style={{background:accessible?`linear-gradient(145deg,${app.color}08,${T.surface2})`:`linear-gradient(145deg,${T.surface2},${T.surface3})`,border:`1.5px solid ${accessible?app.color+"44":"#44444455"}`,borderRadius:14,padding:"16px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.22s",position:"relative",overflow:"hidden",opacity:accessible?1:0.72,minHeight:110,display:"flex",flexDirection:"column",gap:0}}
              onMouseEnter={e=>{e.currentTarget.style.border=`1.5px solid ${accessible?app.color+"99":"#66666688"}`;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 6px 20px ${accessible?app.color:"#333"}22`;}}
              onMouseLeave={e=>{e.currentTarget.style.border=`1.5px solid ${accessible?app.color+"44":"#44444455"}`;e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
              {badge>0&&accessible&&<div style={{position:"absolute",top:8,right:8,background:"#EF4444",color:"#fff",borderRadius:99,minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,padding:"0 4px",zIndex:2}}>{badge>99?"99+":badge}</div>}
              <div style={{width:32,height:32,borderRadius:10,background:accessible?app.color+"18":"#44444418",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8,fontSize:18,filter:accessible?"none":"grayscale(0.5)",flexShrink:0}}>{app.icon}</div>
              <div style={{color:accessible?T.text:T.textMuted,fontWeight:800,fontSize:12,marginBottom:3,lineHeight:1.3}}>{app.label}</div>
              <div style={{color:T.textDim,fontSize:9,lineHeight:1.4,flex:1}}>{app.desc}</div>
              <div style={{display:"flex",alignItems:"center",gap:4,marginTop:8,paddingTop:6,borderTop:`1px solid ${accessible?app.color+"22":"#44444433"}`}}>
                {accessible?<span style={{color:app.color,fontSize:9,fontWeight:700}}>Ouvrir</span>:<span style={{color:T.textDim,fontSize:9}}>🔒 Accès restreint</span>}
                {accessible&&<span style={{color:app.color,fontSize:11,marginLeft:"auto"}}>→</span>}
                {accessible&&app.processes?.length>0&&<span style={{background:app.color+"22",color:app.color,borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{app.processes[0]}</span>}
              </div>
            </button>
          );})}
        </div>
      </div>

    </div>
  );

  // FIX v150 — AppHeader : bouton ⚙️ Paramètres visible uniquement pour l'admin (niv6)
  // Permet à l'admin de gérer les accès de l'application depuis l'intérieur même du module.
  // Apps contrôlées (accès restreint) : finance, sirh, audit, conformite, conseil, communication, juridique, logistique
  const CONTROLLED_APPS = ["finance","sirh","audit","conformite","conseil","communication","juridique","logistique","conventions","indicateurs"];
  const AppHeader = ({icon, title, color="#C41E3A", printContent, appId}) => (
    <>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:12,borderBottom:`1px solid ${T.border}`}}>
        <button onClick={()=>setActiveApp(null)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",color:T.textMuted,fontSize:11}}>← Retour</button>
        <span style={{fontSize:24}}>{icon}</span>
        <div style={{color:T.text,fontWeight:900,fontSize:15}}>{title}</div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          <PrintButton title={title} size="xs" T={T} />
          {/* Bouton Paramètres — réservé admin niv6 pour les apps contrôlées */}
          {isAdmin && appId && CONTROLLED_APPS.includes(appId) && (
            <button
              onClick={() => setShowAppSettings(true)}
              title="Paramètres d'accès de cette application"
              style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",color:T.textMuted,fontSize:11,display:"flex",alignItems:"center",gap:4}}
            >
              <span>⚙️</span><span style={{fontSize:10}}>Paramètres</span>
            </button>
          )}
          <div style={{background:color+"22",border:`1px solid ${color}44`,borderRadius:6,padding:"3px 10px",color:color,fontSize:10,fontWeight:700}}>Application</div>
        </div>
      </div>
      {/* Modal Paramètres d'accès — AppAccessManager */}
      {isAdmin && showAppSettings && appId && (
        <div style={{position:"fixed",inset:0,background:"#000C",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowAppSettings(false)}>
          <div style={{background:T.surface,borderRadius:18,padding:0,width:"min(700px,97vw)",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 32px 80px #000B"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 22px 14px",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontSize:22}}>⚙️</span>
              <div style={{color:T.text,fontWeight:900,fontSize:14}}>Paramètres d'accès — {title}</div>
              <button onClick={()=>setShowAppSettings(false)} style={{marginLeft:"auto",background:"none",border:"none",color:T.textMuted,fontSize:18,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{padding:"18px 22px"}}>
              <AppAccessManager
                T={T}
                currentUser={currentUser}
                users={users}
                appId={appId}
                appLabel={title}
                appColor={color}
                appHabilitations={appHabilitations}
                setAppHabilitations={setAppHabilitations}
                appAccessCodes={appAccessCodes}
                setAppAccessCodes={setAppAccessCodes}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (activeApp === "writer") return (
    <div>
      <AppHeader icon="📝" title="Writer Pro — Traitement de texte professionnel" color="#3B82F6" />
      <WriterProApp T={T} currentUser={currentUser} setNotifications={setNotifications} />
    </div>
  );

  if (activeApp === "tableur") return <TableurPro T={T} currentUser={currentUser} setNotifications={setNotifications} AppHeader={AppHeader} />;

  if (activeApp === "finance") return (
    <div>
      <AppHeader icon="💰" title="Finance & Comptabilité — Module Pro OHADA" color="#C9A84C" appId="finance" />
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"nowrap",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        {[["dashboard","🏠","Tableau de bord"],["journal","📒","Journal"],["etats","📊","États Financiers"],["budget","📈","Budget & Contrôle"],["tresorerie","💳","Trésorerie"],["tva","🧾","TVA & Fiscal"],["indicateurs","📉","Indicateurs"],["rh_charges","👥","Charges RH"],["facturation_s01","🧾","Facturation"],["ohada_ref","📚","Référentiels OHADA"],["config_fiscale","⚙️","Config Fiscale"]].map(([id,icon,label])=>(
          <button key={id} onClick={()=>setFinTool(id)} style={{background:(id==="etats"?finTool.startsWith("etats"):finTool===id)?"#C9A84C22":"transparent",border:`1px solid ${(id==="etats"?finTool.startsWith("etats"):finTool===id)?"#C9A84C66":T.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",color:(id==="etats"?finTool.startsWith("etats"):finTool===id)?"#C9A84C":T.textMuted,fontWeight:finTool===id?700:400,fontSize:12,display:"flex",alignItems:"center",gap:5}}>
            <span>{icon}</span><span className="gc-hide-sm">{label}</span>
          </button>
        ))}
      </div>

      {finTool==="dashboard" && (() => {
        const totalD = journalEntries.reduce((a,e)=>a+(parseFloat(e.debit)||0),0);
        const totalC = journalEntries.reduce((a,e)=>a+(parseFloat(e.credit)||0),0);
        // FIX #14 — Dashboard: produits/charges/trésorerie using correct debit/credit comptes
        const produits = journalEntries.reduce((a,e)=>a+((e.compteCredit||"").startsWith("7")?parseFloat(e.credit)||0:(e.compteDebit||e.compte||"").startsWith("7")?parseFloat(e.debit)||0:0),0);
        const charges = journalEntries.reduce((a,e)=>a+((e.compteDebit||e.compte||"").startsWith("6")?parseFloat(e.debit)||0:0),0);
        const resultNet = produits - charges;
        // FIX — Trésorerie dashboard: use compteDebit AND compteCredit for class 5
        const tresor = journalEntries.reduce((a,e)=>a+((e.compteDebit||e.compte||"").startsWith("5")?parseFloat(e.debit)||0:0)-((e.compteCredit||"").startsWith("5")?parseFloat(e.credit)||0:0),0);
        const totalPrev = budgetLines.reduce((a,l)=>a+l.previsionnel,0);
        const totalReal = budgetLines.reduce((a,l)=>a+l.realise,0);
        const tauxExec = totalPrev>0?Math.round((totalReal/totalPrev)*100):0;
        const ruptures = budgetLines.filter(l=>l.realise>l.previsionnel);
        // v99 — Facturation KPIs réels (gc-factures)
        const factKpis = (() => {
          try {
            const fs = JSON.parse(_lsGet("gc-factures") || "[]");
            return {
              facture:  fs.filter(f=>["EMISE","PAYEE","EN_RETARD"].includes(f.status)).reduce((a,f)=>a+(f.ttc||0),0),
              encaisse: fs.filter(f=>f.status==="PAYEE").reduce((a,f)=>a+(f.ttc||0),0),
              retard:   fs.filter(f=>f.status==="EN_RETARD").reduce((a,f)=>a+(f.ttc||0),0),
              count:    fs.filter(f=>["EMISE","EN_RETARD"].includes(f.status)).length};
          } catch(_) { return {facture:0,encaisse:0,retard:0,count:0}; }
        })();
        return (
          <div>
            {/* KPI CARDS */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
              {[
                {label:"Total Débits",v:totalD,color:"#22C55E",icon:"📈",suffix:"FCFA",detail:`${journalEntries.length} écritures`},
                {label:"Total Crédits",v:totalC,color:"#EF4444",icon:"📉",suffix:"FCFA",detail:"Charges enregistrées"},
                {label:"Résultat Net",v:resultNet,color:resultNet>=0?"#22C55E":"#EF4444",icon:resultNet>=0?"✅":"⚠️",suffix:"FCFA",detail:resultNet>=0?"Bénéficiaire":"Déficitaire"},
                {label:"Trésorerie",v:tresor,color:tresor>=0?"#C9A84C":"#EF4444",icon:"💰",suffix:"FCFA",detail:"Disponibilités nettes"},
              ].map(kpi=>(
                <div key={kpi.label} className="gc-hover-card" style={{background:T.surface2,border:`2px solid ${kpi.color}33`,borderRadius:12,padding:"14px 12px",cursor:"pointer"}} onClick={()=>setFinTool(kpi.label.includes("Résultat")?"etats":kpi.label.includes("Trésor")?"tresorerie":"journal")}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <span style={{fontSize:22}}>{kpi.icon}</span>
                    <span style={{background:kpi.color+"22",color:kpi.color,borderRadius:5,padding:"2px 7px",fontSize:8,fontWeight:700}}>FCFA</span>
                  </div>
                  <div style={{color:kpi.color,fontWeight:900,fontSize:18,lineHeight:1}}>{Math.abs(kpi.v).toLocaleString("fr-FR")}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:4,fontWeight:600}}>{kpi.label}</div>
                  <div style={{color:T.textDim,fontSize:9,marginTop:2}}>{kpi.detail}</div>
                </div>
              ))}
            </div>
            {/* v99 — FACTURATION KPIs (cliquable → module Facturation) */}
            {(factKpis.facture>0||factKpis.count>0)&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14,cursor:"pointer"}} onClick={()=>setFinTool("facturation_s01")}>
                {[
                  {label:"CA Facturé (706)",v:factKpis.facture,c:"#3B82F6",icon:"📤",detail:`${factKpis.count} facture(s) ouvertes`},
                  {label:"CA Encaissé",v:factKpis.encaisse,c:"#22C55E",icon:"✅",detail:"Paiements reçus"},
                  {label:"En retard",v:factKpis.retard,c:"#EF4444",icon:"⚠️",detail:"À relancer"},
                ].map(kpi=>(
                  <div key={kpi.label} style={{background:T.surface2,border:`1px solid ${kpi.c}44`,borderRadius:10,padding:"10px 12px"}}>
                    <div style={{color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>{kpi.icon} {kpi.label}</div>
                    <div style={{color:kpi.c,fontWeight:900,fontSize:14,marginTop:2}}>{kpi.v>=1e6?(kpi.v/1e6).toFixed(1)+"M":kpi.v>=1e3?(kpi.v/1e3).toFixed(0)+"k":kpi.v.toLocaleString("fr-FR")} F</div>
                    <div style={{color:T.textDim,fontSize:9,marginTop:1}}>{kpi.detail}</div>
                  </div>
                ))}
              </div>
            )}
            {/* BUDGET + TRÉSO */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
              {/* Budget gauge */}
              <div style={{background:T.surface2,border:"1px solid #C9A84C33",borderRadius:12,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{color:"#C9A84C",fontWeight:800,fontSize:12}}>📈 Contrôle Budgétaire</div>
                  <button onClick={()=>setFinTool("budget")} style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>Voir →</button>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{color:T.textMuted,fontSize:10}}>Taux d'exécution global</span>
                    <span style={{color:tauxExec>100?"#EF4444":tauxExec>80?"#22C55E":"#F59E0B",fontWeight:800,fontSize:13}}>{tauxExec}%</span>
                  </div>
                  <div style={{background:T.surface3,borderRadius:99,height:8,overflow:"hidden"}}>
                    <div style={{width:`${Math.min(tauxExec,100)}%`,height:"100%",background:tauxExec>100?"#EF4444":tauxExec>80?"#22C55E":"#F59E0B",borderRadius:99,transition:"width 1s"}} />
                  </div>
                </div>
                {budgetLines.slice(0,4).map(l=>{
                  const tx=l.previsionnel>0?Math.round((l.realise/l.previsionnel)*100):0;
                  return (
                    <div key={l.id} style={{marginBottom:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                        <span style={{color:T.text,fontSize:10,fontWeight:600}}>{l.poste}</span>
                        <span style={{color:tx>100?"#EF4444":T.textMuted,fontSize:9}}>{tx}%</span>
                      </div>
                      <div style={{background:T.surface3,borderRadius:99,height:4}}>
                        <div style={{width:`${Math.min(tx,100)}%`,height:"100%",background:tx>100?"#EF4444":tx>80?"#22C55E":"#F59E0B",borderRadius:99}} />
                      </div>
                    </div>
                  );
                })}
                {ruptures.length>0 && <div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:6,padding:"6px 10px",marginTop:8,fontSize:10,color:"#EF4444",fontWeight:700}}>⚠️ {ruptures.length} dépassement(s) budgétaire(s)</div>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:10}}>
                  <div style={{background:"#22C55E15",border:"1px solid #22C55E33",borderRadius:7,padding:"8px",textAlign:"center"}}>
                    <div style={{color:"#22C55E",fontWeight:800,fontSize:13}}>{totalPrev.toLocaleString("fr-FR")}</div>
                    <div style={{color:T.textDim,fontSize:9}}>Prévisionnel (FCFA)</div>
                  </div>
                  <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:7,padding:"8px",textAlign:"center"}}>
                    <div style={{color:"#3B82F6",fontWeight:800,fontSize:13}}>{totalReal.toLocaleString("fr-FR")}</div>
                    <div style={{color:T.textDim,fontSize:9}}>Réalisé (FCFA)</div>
                  </div>
                </div>
              </div>
              {/* Dernières écritures */}
              <div style={{background:T.surface2,border:"1px solid #3B82F633",borderRadius:12,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{color:"#3B82F6",fontWeight:800,fontSize:12}}>📒 Dernières Écritures</div>
                  <button onClick={()=>setFinTool("journal")} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>Journal →</button>
                </div>
                {journalEntries.length===0 ? (
                  <div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:"20px 0"}}>Aucune écriture — <button onClick={()=>setFinTool("journal")} style={{background:"none",border:"none",color:"#C9A84C",cursor:"pointer",fontWeight:700,fontSize:11}}>Saisir →</button></div>
                ) : journalEntries.slice(0,6).map(e=>(
                  <div key={e.id} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}22`,alignItems:"center"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:parseFloat(e.debit)>0?"#22C55E":"#EF4444",flexShrink:0}} />
                    <div style={{flex:1,overflow:"hidden"}}>
                      <div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.libelle}</div>
                      <div style={{color:T.textDim,fontSize:9}}>{e.date} · {e.compte}</div>
                    </div>
                    <div style={{color:parseFloat(e.debit)>0?"#22C55E":"#EF4444",fontWeight:700,fontSize:11,flexShrink:0}}>
                      {parseFloat(e.debit)>0?"+":"−"}{(parseFloat(e.debit||e.credit)||0).toLocaleString("fr-FR")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Fiscal + Actions rapides */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {/* Calendrier fiscal */}
              <div style={{background:T.surface2,border:"1px solid #F59E0B33",borderRadius:12,padding:14}}>
                <div style={{color:"#F59E0B",fontWeight:800,fontSize:12,marginBottom:10}}>📅 Prochaines Échéances Fiscales</div>
                {[{label:"TVA mensuelle",date:"15 du mois",urgent:true},{label:"Déclaration IS",date:"30 Avr",urgent:false},{label:"DSF annuelle",date:"30 Avr",urgent:false},{label:"Patente",date:"31 Déc",urgent:false}].map((f,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}22`,alignItems:"center"}}>
                    <span style={{color:T.text,fontSize:11}}>{f.label}</span>
                    <span style={{background:f.urgent?"#F59E0B22":"transparent",color:f.urgent?"#F59E0B":T.textMuted,borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:f.urgent?700:400}}>{f.date}</span>
                  </div>
                ))}
                <button onClick={()=>setFinTool("tva")} style={{width:"100%",background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:7,padding:"7px",cursor:"pointer",fontWeight:700,fontSize:11,marginTop:10}}>🧾 Calculer TVA →</button>
              </div>
              {/* Actions rapides */}
              <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
                <div style={{color:T.text,fontWeight:800,fontSize:12,marginBottom:10}}>⚡ Actions Rapides</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[
                    {label:"Nouvelle écriture",icon:"📝",color:"#3B82F6",action:()=>setFinTool("journal")},
                    {label:"Ajouter budget",icon:"📈",color:"#C9A84C",action:()=>setFinTool("budget")},
                    {label:"États financiers",icon:"📊",color:"#22C55E",action:()=>setFinTool("etats")},
                    {label:"Calcul TVA",icon:"🧾",color:"#F59E0B",action:()=>setFinTool("tva")},
                    {label:"Trésorerie",icon:"💳",color:"#A855F7",action:()=>setFinTool("tresorerie")},
                    {label:"Charges RH",icon:"👥",color:"#EC4899",action:()=>setFinTool("rh_charges")},
                  ].map(a=>(
                    <button key={a.label} onClick={a.action} style={{background:a.color+"15",border:`1px solid ${a.color}33`,borderRadius:8,padding:"10px 8px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>{a.icon}</span>
                      <span style={{color:T.text,fontSize:11,fontWeight:600}}>{a.label}</span>
                    </button>
                  ))}
                </div>
                <button style={{width:"100%",background:"linear-gradient(135deg,#C9A84C,#E2B96A)",border:"none",color:"#000",borderRadius:8,padding:"9px",cursor:"pointer",fontWeight:700,fontSize:12,marginTop:12}} onClick={() => {if(window.gcAIAsk){window.gcAIAsk("Analyse la situation financière globale du cabinet Génie Consultant et fournis un diagnostic complet :\n- Journaux: "+journalEntries.length+" écritures\n- Total Débits: "+totalD.toLocaleString("fr-FR")+" FCFA\n- Total Crédits: "+totalC.toLocaleString("fr-FR")+" FCFA\n- Résultat estimé: "+resultNet.toLocaleString("fr-FR")+" FCFA\n- Budget exécuté: "+tauxExec+"%\n- Trésorerie: "+tresor.toLocaleString("fr-FR")+" FCFA");}}}>✨ Diagnostic Financier IA</button>
              </div>
            </div>

            {/* ── GRAPHIQUES MODULAIRES ─────────────────── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginTop:14}}>
              {/* Graphique: Répartition Charges vs Produits (barres) */}
              <div style={{background:T.surface2,border:"1px solid #C9A84C33",borderRadius:12,padding:14}}>
                <div style={{color:"#C9A84C",fontWeight:800,fontSize:11,marginBottom:10}}>📊 Charges vs Produits</div>
                {(()=>{
                  const items=[
                    {label:"Produits",val:produits,color:"#22C55E"},
                    {label:"Charges",val:charges,color:"#EF4444"},
                    {label:"Résultat",val:Math.abs(resultNet),color:resultNet>=0?"#C9A84C":"#F97316"},
                  ];
                  const max=Math.max(...items.map(i=>i.val),1);
                  return (
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {items.map(item=>(
                        <div key={item.label}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{color:T.textMuted,fontSize:9,fontWeight:600}}>{item.label}</span>
                            <span style={{color:item.color,fontSize:10,fontWeight:700,fontFamily:"monospace"}}>{item.val.toLocaleString("fr-FR")}</span>
                          </div>
                          <div style={{background:T.surface3,borderRadius:99,height:10,overflow:"hidden"}}>
                            <div style={{width:`${(item.val/max)*100}%`,height:"100%",background:item.color,borderRadius:99,transition:"width 1s",minWidth:item.val>0?4:0}} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {/* Graphique: Trésorerie par compte (mini bars) */}
              <div style={{background:T.surface2,border:"1px solid #3B82F633",borderRadius:12,padding:14}}>
                <div style={{color:"#3B82F6",fontWeight:800,fontSize:11,marginBottom:10}}>💳 Soldes de Trésorerie</div>
                {(()=>{
                  const tresorerieCodes=[
                    // FIX v73 — Soldes = mouvD(compte) - mouvC(compte) selon SYSCOHADA
                    {num:"512",label:"Banque (512)",color:"#3B82F6"},
                    {num:"521",label:"Banque crt (521)",color:"#6366F1"},
                    {num:"571",label:"Caisse (571)",color:"#22C55E"},
                    {num:"572",label:"Caisse ag. (572)",color:"#10B981"},
                    {num:"524",label:"Épargne (524)",color:"#C9A84C"},
                  ];
                  const soldes=tresorerieCodes.map(tc=>({
                    ...tc,
                    // ENCAISSEMENT = débit sur ce compte (fonds entrants)
                    debit:journalEntries.reduce((a,e)=>a+((e.compteDebit||e.compte||"").startsWith(tc.num)?parseFloat(e.debit)||0:0),0),
                    // DÉCAISSEMENT = crédit sur ce compte (fonds sortants)
                    credit:journalEntries.reduce((a,e)=>a+((e.compteCredit||"").startsWith(tc.num)?parseFloat(e.credit)||0:0),0)})).map(s=>({...s,solde:s.debit-s.credit}));
                  const maxAbs=Math.max(...soldes.map(s=>Math.abs(s.solde)),1);
                  return (
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {soldes.map(s=>(
                        <div key={s.num}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                            <span style={{color:T.textMuted,fontSize:9}}>{s.label}</span>
                            <span style={{color:s.solde>=0?s.color:"#EF4444",fontSize:9,fontWeight:700,fontFamily:"monospace"}}>{s.solde>=0?"+":""}{s.solde.toLocaleString("fr-FR")}</span>
                          </div>
                          <div style={{background:T.surface3,borderRadius:99,height:8,overflow:"hidden",position:"relative"}}>
                            <div style={{position:"absolute",left:s.solde>=0?"50%":"auto",right:s.solde<0?"50%":"auto",width:`${(Math.abs(s.solde)/maxAbs)*50}%`,height:"100%",background:s.solde>=0?s.color:"#EF4444",transition:"width 1s"}} />
                          </div>
                        </div>
                      ))}
                      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:6,display:"flex",justifyContent:"space-between"}}>
                        <span style={{color:T.textMuted,fontSize:9,fontWeight:700}}>TOTAL NET</span>
                        <span style={{color:tresor>=0?"#22C55E":"#EF4444",fontSize:10,fontWeight:800,fontFamily:"monospace"}}>{tresor>=0?"+":""}{tresor.toLocaleString("fr-FR")} FCFA</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* Graphique: Évolution des écritures (mini courbe simulée) */}
              <div style={{background:T.surface2,border:"1px solid #A855F733",borderRadius:12,padding:14}}>
                <div style={{color:"#A855F7",fontWeight:800,fontSize:11,marginBottom:10}}>📈 Activité Comptable</div>
                {(()=>{
                  // Group by month
                  const months={};
                  journalEntries.forEach(e=>{
                    const m=e.date?e.date.slice(0,7):"?";
                    if(!months[m]) months[m]={d:0,c:0,n:0};
                    months[m].d+=parseFloat(e.debit)||0;
                    months[m].c+=parseFloat(e.credit)||0;
                    months[m].n++;
                  });
                  const mkeys=Object.keys(months).sort().slice(-6);
                  if(!mkeys.length) return <div style={{color:T.textDim,fontSize:10,textAlign:"center",padding:12}}>Aucune écriture</div>;
                  const maxV=Math.max(...mkeys.map(k=>Math.max(months[k].d,months[k].c)),1);
                  return (
                    <div>
                      <div style={{display:"flex",alignItems:"flex-end",gap:4,height:60,marginBottom:6}}>
                        {mkeys.map(m=>(
                          <div key={m} style={{flex:1,display:"flex",flexDirection:"column",gap:2,alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                            <div style={{width:"100%",display:"flex",gap:1,alignItems:"flex-end",justifyContent:"center",height:"100%"}}>
                              <div style={{flex:1,background:"#22C55E",borderRadius:"2px 2px 0 0",height:`${(months[m].d/maxV)*100}%`,transition:"height 1s",minHeight:months[m].d>0?2:0}} title={`Débits: ${months[m].d.toLocaleString("fr-FR")}`} />
                              <div style={{flex:1,background:"#EF4444",borderRadius:"2px 2px 0 0",height:`${(months[m].c/maxV)*100}%`,transition:"height 1s",minHeight:months[m].c>0?2:0}} title={`Crédits: ${months[m].c.toLocaleString("fr-FR")}`} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        {mkeys.map(m=>(
                          <div key={m} style={{flex:1,textAlign:"center",color:T.textDim,fontSize:7,overflow:"hidden",textOverflow:"ellipsis"}}>{m.slice(5)}</div>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:6,justifyContent:"center"}}>
                        <span style={{fontSize:9,color:"#22C55E"}}>■ Déb.</span>
                        <span style={{fontSize:9,color:"#EF4444"}}>■ Cré.</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            {/* ── TABLEAU DE SYNTHÈSE PAR CLASSE ─────── */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14,marginTop:14}}>
              <div style={{color:"#C9A84C",fontWeight:800,fontSize:11,marginBottom:10}}>📋 Tableau de Synthèse par Classe OHADA</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                  <thead>
                    <tr style={{background:T.surface3}}>
                      {["Classe","Libellé","Nb écritures","Total Débits","Total Crédits","Solde Net"].map(h=>(
                        <th key={h} style={{padding:"6px 10px",textAlign:h==="Classe"||h==="Nb écritures"?"center":"right",color:T.textMuted,fontWeight:700,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {cl:"1",label:"Ressources durables",color:"#C9A84C"},
                      {cl:"2",label:"Immobilisations",color:"#A855F7"},
                      {cl:"3",label:"Stocks",color:"#78716C"},
                      {cl:"4",label:"Tiers",color:"#3B82F6"},
                      {cl:"5",label:"Trésorerie",color:"#22C55E"},
                      {cl:"6",label:"Charges",color:"#EF4444"},
                      {cl:"7",label:"Produits",color:"#10B981"},
                    ].map(row=>{
                      const entries=journalEntries.filter(e=>(e.compteDebit||e.compte||"").startsWith(row.cl)||(e.compteCredit||"").startsWith(row.cl));
                      const td=entries.reduce((a,e)=>a+((e.compteDebit||e.compte||"").startsWith(row.cl)?parseFloat(e.debit)||0:0),0);
                      const tc=entries.reduce((a,e)=>a+((e.compteCredit||"").startsWith(row.cl)?parseFloat(e.credit)||0:0),0);
                      const solde=td-tc;
                      return (
                        <tr key={row.cl} style={{borderBottom:`1px solid ${T.border}22`}} onClick={()=>setFinTool("journal")} className="gc-hover-card">
                          <td style={{padding:"7px 10px",textAlign:"center",fontWeight:800,color:row.color,fontFamily:"monospace",fontSize:13}}>{row.cl}</td>
                          <td style={{padding:"7px 10px",color:T.text,fontWeight:600}}>{row.label}</td>
                          <td style={{padding:"7px 10px",textAlign:"center",color:T.textMuted}}>{entries.length}</td>
                          <td style={{padding:"7px 10px",textAlign:"right",color:"#22C55E",fontFamily:"monospace",fontWeight:600}}>{td>0?td.toLocaleString("fr-FR"):"-"}</td>
                          <td style={{padding:"7px 10px",textAlign:"right",color:"#EF4444",fontFamily:"monospace",fontWeight:600}}>{tc>0?tc.toLocaleString("fr-FR"):"-"}</td>
                          <td style={{padding:"7px 10px",textAlign:"right",color:solde>=0?"#22C55E":"#EF4444",fontFamily:"monospace",fontWeight:800}}>{solde!==0?(solde>0?"+":"")+solde.toLocaleString("fr-FR"):"-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {finTool==="journal" && (
        <div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14,marginBottom:12}}>
            <div id="journal-form-top" style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:10}}>{editingJournalId?"✏️ Modifier l'écriture":"📝 Saisir une écriture comptable"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:8,marginBottom:8}}>
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Date</label><input type="date" value={journalForm.date} onChange={e=>setJournalForm(f=>({...f,date:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>N° Pièce <span style={{color:"#C9A84C",cursor:"pointer",fontSize:9}} onClick={() => {try{const ns=JSON.parse(_lsGet("gc-piece-series")||"null")||{AC:{prefix:"AC",seq:1}};const s=ns["AC"];const yr=new Date().getFullYear().toString().slice(2),num=String(s.seq).padStart(4,"0"),piece=`${s.prefix}${yr}-${num}`;ns["AC"]={...s,seq:s.seq+1};_lsSet("gc-piece-series",JSON.stringify(ns));setJournalForm(f=>({...f,piece}));}catch (_) {}}}>⚡ Auto</span></label><input value={journalForm.piece} onChange={e=>setJournalForm(f=>({...f,piece:e.target.value}))} placeholder="AC26-0001" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:"#C9A84C",fontSize:11,fontFamily:"monospace",boxSizing:"border-box"}} /></div>
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Libellé</label><input value={journalForm.libelle} onChange={e=>setJournalForm(f=>({...f,libelle:e.target.value}))} placeholder="Description de l'opération" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
            </div>
            {(()=>{
              // FIX v75 — Utilise gcGetActivePlan() pour respecter les overrides/corrections utilisateur
              const allC = gcGetActivePlan();
              const matchedD=journalForm.compteDebit?allC.find(c=>c.num===journalForm.compteDebit||c.num.startsWith(journalForm.compteDebit)):null;
              const matchedC=journalForm.compteCredit?allC.find(c=>c.num===journalForm.compteCredit||c.num.startsWith(journalForm.compteCredit)):null;
              const montant=parseFloat(journalForm.debit)||0;
              const isBalanced=montant>0;
              return (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <label style={{color:"#22C55E",fontSize:10,display:"block",marginBottom:3,fontWeight:700}}>📥 Compte à DÉBITER *</label>
                <input list="ohada-debit-list" value={journalForm.compteDebit} onChange={e=>setJournalForm(f=>({...f,compteDebit:e.target.value}))} placeholder="Ex: 6011 — Achats…" style={{width:"100%",background:T.surface3,border:"1px solid #22C55E44",borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                <datalist id="ohada-debit-list">{allC.map(c=><option key={c.num} value={c.num}>{c.num} — {c.lib}</option>)}</datalist>
                {matchedD&&<div style={{color:"#22C55E",fontSize:9,marginTop:2,fontStyle:"italic"}}>{matchedD.lib} (Cl.{matchedD.cl})</div>}
              </div>
              <div>
                <label style={{color:"#EF4444",fontSize:10,display:"block",marginBottom:3,fontWeight:700}}>📤 Compte à CRÉDITER *</label>
                <input list="ohada-credit-list" value={journalForm.compteCredit} onChange={e=>setJournalForm(f=>({...f,compteCredit:e.target.value}))} placeholder="Ex: 401 — Fournisseurs…" style={{width:"100%",background:T.surface3,border:"1px solid #EF444444",borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                <datalist id="ohada-credit-list">{allC.map(c=><option key={c.num} value={c.num}>{c.num} — {c.lib}</option>)}</datalist>
                {matchedC&&<div style={{color:"#EF4444",fontSize:9,marginTop:2,fontStyle:"italic"}}>{matchedC.lib} (Cl.{matchedC.cl})</div>}
              </div>
              <div>
                <label style={{color:"#C9A84C",fontSize:10,display:"block",marginBottom:3,fontWeight:700}}>💰 Montant (FCFA) *</label>
                <input type="number" value={journalForm.debit} onChange={e=>setJournalForm(f=>({...f,debit:e.target.value,credit:e.target.value}))} placeholder="0" style={{width:"100%",background:T.surface3,border:"1px solid #C9A84C44",borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                {isBalanced&&<div style={{color:"#C9A84C",fontSize:9,marginTop:2}}>✅ Débit = Crédit = {montant.toLocaleString("fr-FR")} FCFA</div>}
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Tiers / Référence <span style={{color:T.textDim,fontSize:8}}>(clients & fournisseurs du SI)</span></label>
                <input list="gc-tiers-list" value={journalForm.tiers} onChange={e=>setJournalForm(f=>({...f,tiers:e.target.value}))} placeholder="Client, Fournisseur… (saisie ou sélection)" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                <datalist id="gc-tiers-list">
                  {(partners||[]).map(p=><option key={p.id} value={p.nom}>{p.nom} — {p.type} {p.secteur?`(${p.secteur})`:""}</option>)}
                </datalist>
                {journalForm.tiers&&(partners||[]).find(p=>p.nom===journalForm.tiers)&&(
                  <div style={{color:"#22C55E",fontSize:9,marginTop:2}}>✅ {(partners||[]).find(p=>p.nom===journalForm.tiers)?.type?.toUpperCase()} enregistré dans le SI</div>
                )}
              </div>
              {/* Dossier lié — pour traçabilité honoraires par dossier */}
              <div>
                <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Dossier lié <span style={{color:T.textDim,fontSize:8}}>(optionnel — traçabilité honoraires)</span></label>
                <select value={journalForm.dossierId||""} onChange={e=>setJournalForm(f=>({...f,dossierId:e.target.value}))}
                  style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11}}>
                  <option value="">— Aucun dossier lié —</option>
                  {(dossiers||[]).filter(d=>d.status!=="ARCHIVE").map(d=>(
                    <option key={d.id} value={d.id}>{d.ref} — {d.client} ({d.process})</option>
                  ))}
                </select>
                {journalForm.dossierId&&(()=>{
                  const dos=(dossiers||[]).find(d=>d.id===journalForm.dossierId);
                  return dos?<div style={{color:"#C9A84C",fontSize:9,marginTop:2}}>📁 {dos.objet} · Éch. {dos.dueDate||"—"}</div>:null;
                })()}
              </div>
            </div>);})()}
            <div style={{display:"flex",gap:8}}>
              <button onClick={addJournalEntry} style={{background:"#C9A84C",border:"none",color:"#000",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>{editingJournalId?"✅ Mettre à jour":"✅ Enregistrer"}</button>
              {editingJournalId&&<button onClick={() => {setEditingJournalId(null);setJournalForm({date:new Date().toISOString().split("T")[0],piece:"",libelle:"",compteDebit:"",compteCredit:"",debit:"",credit:"",tiers:"",dossierId:""});}} style={{background:"#6B728022",border:"1px solid #6B728044",color:T.textMuted,borderRadius:7,padding:"8px 14px",cursor:"pointer",fontSize:12}}>✖ Annuler</button>}
              <button onClick={() => {const csv=["Date,Pièce,Libellé,Cpt Débit,Cpt Crédit,Montant,Tiers,Dossier",...journalEntries.map(e=>`"${e.date}","${e.piece}","${e.libelle}","${e.compteDebit||e.compte||""}","${e.compteCredit||""}","${e.debit||0}","${e.tiers||""}","${e.dossierId||""}"`)].join("\n");const b=new Blob(["\uFEFF"+csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`journal_gc_${new Date().getFullYear()}.csv`;a.click();URL.revokeObjectURL(u);}}
                style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:7,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>⬇ Export CSV</button>
              <button style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12}} onClick={() => {if(window.gcAIAsk){const rows=journalEntries.slice(0,20).map(function(e){return e.date+"|"+e.compte+"|"+e.libelle+"|D:"+(e.debit||0)+"|C:"+(e.credit||0);}).join("\n");window.gcAIAsk("Analyse ce journal comptable SYSCOHADA et génère un rapport de synthèse avec les soldes par compte, les anomalies détectées et les recommandations :\n"+rows);}}}>✨ Analyser IA</button>
              {(()=>{
                const td=journalEntries.reduce((a,e)=>a+(parseFloat(e.debit)||0),0);
                const tc=journalEntries.reduce((a,e)=>a+(parseFloat(e.credit)||0),0);
                const diff=Math.abs(td-tc);
                const isOk=diff<=0.01;
                return (
                  <div style={{display:"flex",alignItems:"center",gap:8,background:isOk?"#22C55E15":"#EF444415",border:`1px solid ${isOk?"#22C55E44":"#EF444444"}`,borderRadius:7,padding:"6px 14px",flex:1,minWidth:200}}>
                    <span style={{fontSize:16}}>{isOk?"✅":"⚠️"}</span>
                    <div>
                      <div style={{color:isOk?"#22C55E":"#EF4444",fontSize:10,fontWeight:800}}>{isOk?"Journal équilibré ✓":"Déséquilibre détecté"}</div>
                      <div style={{color:isOk?"#22C55E":"#EF4444",fontSize:9}}>
                        D: {td.toLocaleString("fr-FR")} | C: {tc.toLocaleString("fr-FR")}{!isOk?" | Écart: "+diff.toLocaleString("fr-FR")+" FCFA":""}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{color:"#C9A84C",fontWeight:800,fontSize:12}}>📒 Journal SYSCOHADA ({journalEntries.length} écritures)</div>
            </div>
            {/* ── Barre filtres Journal ── */}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
              <input value={journalSearch} onChange={e=>{setJournalSearch(e.target.value);setJournalPage(0);}} placeholder="🔍 Libellé, pièce, compte, tiers…" style={{flex:"1 1 160px",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 10px",color:T.text,fontSize:10}}/>
              <input type="date" value={journalDateFrom} onChange={e=>{setJournalDateFrom(e.target.value);setJournalPage(0);}} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 8px",color:T.text,fontSize:10}} title="Date début"/>
              <input type="date" value={journalDateTo} onChange={e=>{setJournalDateTo(e.target.value);setJournalPage(0);}} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 8px",color:T.text,fontSize:10}} title="Date fin"/>
              <select value={journalSort} onChange={e=>{setJournalSort(e.target.value);setJournalPage(0);}} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 8px",color:T.text,fontSize:10}}>
                <option value="date_desc">↓ Date récente</option>
                <option value="date_asc">↑ Date ancienne</option>
                <option value="montant_desc">↓ Montant</option>
                <option value="montant_asc">↑ Montant</option>
              </select>
              {(journalSearch||journalDateFrom||journalDateTo)&&<button onClick={() => {setJournalSearch("");setJournalDateFrom("");setJournalDateTo("");}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:9}}>✕ Effacer</button>}
            </div>
            {(()=>{
              const q=journalSearch.toLowerCase();
              let jFiltered=journalEntries.filter(e=>{
                const matchQ=!q||(e.libelle||"").toLowerCase().includes(q)||(e.piece||"").toLowerCase().includes(q)||(e.compteDebit||e.compte||"").toLowerCase().includes(q)||(e.compteCredit||"").toLowerCase().includes(q)||(e.tiers||"").toLowerCase().includes(q);
                const matchFrom=!journalDateFrom||e.date>=journalDateFrom;
                const matchTo=!journalDateTo||e.date<=journalDateTo;
                return matchQ&&matchFrom&&matchTo;
              });
              if(journalSort==="date_asc")jFiltered=[...jFiltered].sort((a,b)=>a.date.localeCompare(b.date));
              else if(journalSort==="montant_desc")jFiltered=[...jFiltered].sort((a,b)=>(parseFloat(b.debit)||0)-(parseFloat(a.debit)||0));
              else if(journalSort==="montant_asc")jFiltered=[...jFiltered].sort((a,b)=>(parseFloat(a.debit)||0)-(parseFloat(b.debit)||0));
              else jFiltered=[...jFiltered].sort((a,b)=>b.date.localeCompare(a.date));
              if(jFiltered.length===0) return <div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:20}}>{journalEntries.length===0?"Aucune écriture enregistrée":"Aucune écriture pour ces critères"}</div>;
              const tdF=jFiltered.reduce((a,e)=>a+(parseFloat(e.debit)||0),0);
              const tcF=jFiltered.reduce((a,e)=>a+(parseFloat(e.credit)||0),0);
              const PAGE_SIZE=25;
              const totalPages=Math.ceil(jFiltered.length/PAGE_SIZE);
              const safePage=Math.min(journalPage,totalPages-1);
              const pageData=jFiltered.slice(safePage*PAGE_SIZE,(safePage+1)*PAGE_SIZE);
              return (<div style={{overflowX:"auto"}}>
              {/* Compteur et navigation */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                <span style={{color:T.textMuted,fontSize:10}}>{jFiltered.length} écriture(s){jFiltered.length!==journalEntries.length?` (sur ${journalEntries.length} total)`:""}</span>
                <span style={{color:T.textDim,fontSize:9}}>· D total: {tdF.toLocaleString("fr-FR")} FCFA · C total: {tcF.toLocaleString("fr-FR")} FCFA</span>
                {totalPages>1&&<div style={{marginLeft:"auto",display:"flex",gap:4,alignItems:"center"}}>
                  <button onClick={()=>setJournalPage(Math.max(0,safePage-1))} disabled={safePage===0} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:5,padding:"2px 8px",cursor:safePage===0?"default":"pointer",color:safePage===0?T.textDim:T.text,fontSize:10}}>←</button>
                  <span style={{color:T.textMuted,fontSize:9}}>{safePage+1}/{totalPages}</span>
                  <button onClick={()=>setJournalPage(Math.min(totalPages-1,safePage+1))} disabled={safePage>=totalPages-1} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:5,padding:"2px 8px",cursor:safePage>=totalPages-1?"default":"pointer",color:safePage>=totalPages-1?T.textDim:T.text,fontSize:10}}>→</button>
                </div>}
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:T.surface3}}>{["Date","Pièce","Libellé","Cpt Débit","Débit","Cpt Crédit","Crédit","Tiers","Dossier",""].map(h=><th key={h} style={{padding:"6px 8px",textAlign:h==="Débit"||h==="Crédit"?"right":"left",color:T.textMuted,fontWeight:700,fontSize:10,border:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
              <tbody>{pageData.map(e=>(
                <tr key={e.id} className="gc-tr-hover" style={{borderBottom:`1px solid ${T.border}22`}}>
                  <td style={{padding:"5px 8px",color:T.text,whiteSpace:"nowrap"}}>{e.date}</td>
                  <td style={{padding:"5px 8px",color:"#C9A84C",fontFamily:"monospace"}}>{e.piece}</td>
                  <td style={{padding:"5px 8px",color:T.text,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.libelle}</td>
                  <td style={{padding:"4px 8px",color:"#22C55E",fontFamily:"monospace",fontWeight:700,fontSize:10}}>{e.compteDebit||e.compte||"—"}</td>
                  <td style={{padding:"5px 8px",color:"#22C55E",fontWeight:700,textAlign:"right",fontFamily:"monospace"}}>{e.debit?Number(e.debit).toLocaleString("fr-FR"):"—"}</td>
                  <td style={{padding:"4px 8px",color:"#EF4444",fontFamily:"monospace",fontWeight:700,fontSize:10}}>{e.compteCredit||"—"}</td>
                  <td style={{padding:"5px 8px",color:"#EF4444",fontWeight:700,textAlign:"right",fontFamily:"monospace"}}>{e.credit?Number(e.credit).toLocaleString("fr-FR"):"—"}</td>
                  <td style={{padding:"5px 8px",color:T.textDim}}>{e.tiers||"—"}</td>
                  <td style={{padding:"5px 8px",color:"#C9A84C",fontSize:9,fontFamily:"monospace"}}>{e.dossierId?(()=>{const d=(dossiers||[]).find(x=>x.id===e.dossierId);return d?<span title={d.objet}>{d.ref}</span>:<span style={{opacity:0.5}}>{e.dossierId.slice(0,10)}…</span>;})():"—"}</td>
                  <td style={{padding:"4px 6px"}}>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={async () => {setJournalForm({date:e.date,piece:e.piece,libelle:e.libelle,compteDebit:e.compteDebit||e.compte||"",compteCredit:e.compteCredit||"",debit:e.debit,credit:e.credit,tiers:e.tiers||"",dossierId:e.dossierId||""});setEditingJournalId(e.id);const el=document.getElementById("journal-form-top");if(el)el.scrollIntoView({behavior:"smooth"});}} style={{background:"#3B82F615",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9}}>✏️</button>
                      <button onClick={async () => {if(!await gcConfirm("Supprimer cette écriture ?"))return;const u=journalEntries.filter(x=>x.id!==e.id);setJournalEntries(u);try{_lsSet("gc-journal",JSON.stringify(u.slice(0,500)));dsSave("gc-journal",u.slice(0,500)).catch(err => gcToast.syncError('', err));}catch (_) {}}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9}}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
              <tfoot><tr style={{background:"#C9A84C15",fontWeight:700}}>
                <td colSpan={3} style={{padding:"6px 8px",color:"#C9A84C",fontSize:11}}>TOTAUX {jFiltered.length<journalEntries.length?`(${jFiltered.length}/${journalEntries.length} filtrées)`:""}</td>
                <td style={{padding:"6px 8px",color:T.textDim,fontSize:10,textAlign:"right"}}>—</td>
                <td style={{padding:"6px 8px",color:"#22C55E",textAlign:"right",fontWeight:800,fontFamily:"monospace"}}>{tdF.toLocaleString("fr-FR")}</td>
                <td style={{padding:"6px 8px",color:T.textDim,fontSize:10,textAlign:"right"}}>—</td>
                <td style={{padding:"6px 8px",color:"#EF4444",textAlign:"right",fontWeight:800,fontFamily:"monospace"}}>{tcF.toLocaleString("fr-FR")}</td>
                <td colSpan={3}></td>
              </tr></tfoot>
            </table></div>);
            })()}
          </div>
        </div>
      )}

      {(finTool==="etats"||finTool.startsWith("etats_")) && (()=>{
        // FIX v75 — gcGetActivePlan() unique source de vérité pour le plan comptable
        const allC_ = gcGetActivePlan();
        const etatsTab = finTool==="etats" ? "bilan" : finTool.replace("etats_","");

        // FIX v143 — Exercice comptable OHADA (Art. 7 AUPCAP / SYSCOHADA révisé) :
        // Les états financiers doivent être établis par exercice du 1er janvier au 31 décembre.
        // On filtre les écritures par exercice sélectionné pour un bilan exact à la date de clôture.
        const exerciceEntries = journalEntries.filter(e => {
          if (!e.date) return false;
          const yr = parseInt(e.date.slice(0,4), 10);
          return yr <= exerciceAnnee; // cumul depuis le début — conforme partie double OHADA
        });
        // Pour les états de résultat, uniquement l'exercice en cours (charges/produits de l'année)
        const exerciceEntriesYear = journalEntries.filter(e => {
          if (!e.date) return false;
          const yr = parseInt(e.date.slice(0,4), 10);
          return yr === exerciceAnnee;
        });

        // ── SYSCOHADA soldes par classe ──────────────────────
        // FIX v143 — mouvD/mouvC utilisent exerciceEntries (cumul jusqu'à l'exercice sélectionné)
        // pour les comptes de bilan (classes 1-5), et exerciceEntriesYear pour le résultat (6-7).
        const mouvD = (pfx) => exerciceEntries.reduce((a,e)=>{
          const cd=e.compteDebit||e.compte||"";
          return a+(cd.startsWith(pfx)?parseFloat(e.debit)||0:0);
        },0);
        // BUG FIX #13 — mouvC lisait e.debit au lieu de e.credit → tous les montants
        // apparaissaient dans les deux colonnes (encaissements ET décaissements).
        // Correction : lecture de e.credit pour les mouvements créditeurs.
        const mouvC = (pfx) => exerciceEntries.reduce((a,e)=>{
          const cc=e.compteCredit||"";
          return a+(cc.startsWith(pfx)?parseFloat(e.credit)||0:0);
        },0);
        // mouvDY / mouvCY : mouvements de l'exercice UNIQUEMENT (pour C. Résultat cl.6 et 7)
        const mouvDY = (pfx) => exerciceEntriesYear.reduce((a,e)=>{
          const cd=e.compteDebit||e.compte||"";
          return a+(cd.startsWith(pfx)?parseFloat(e.debit)||0:0);
        },0);
        const mouvCY = (pfx) => exerciceEntriesYear.reduce((a,e)=>{
          const cc=e.compteCredit||"";
          return a+(cc.startsWith(pfx)?parseFloat(e.credit)||0:0);
        },0);
        const solde = (pfx) => mouvD(pfx) - mouvC(pfx); // solde débiteur net (bilan cumulatif)

        // ACTIF SYSCOHADA — formules FIX v98 (comptes correcteurs, créances séparées)
        const soldeC = (pfx) => mouvC(pfx) - mouvD(pfx); // solde créditeur net

        // Immobilisations — solde DÉBITEUR des comptes 20-29
        const immoCorp   = Math.max(0, solde("21")+solde("22")+solde("23")+solde("24"));
        const immoIncorp = Math.max(0, solde("20"));
        // FIX v98: comptes 28 (amortissements) et 29 (provisions) sont des comptes correcteurs
        const immoAmort  = Math.max(0, mouvC("28")+mouvC("29")-mouvD("28")-mouvD("29"));
        const immoFin    = Math.max(0, solde("25")+solde("26")+solde("27"));
        const totalImmo  = immoCorp+immoIncorp+immoFin-immoAmort;
        const stocks     = Math.max(0, solde("3"));
        // FIX v98: séparation nette créances (actif) / dettes (passif) pour 42, 44
        const creances_clients = Math.max(0, solde("41"));
        const creances_autres  = Math.max(0, solde("43")+solde("47")+solde("48"));
        const avances_perso    = Math.max(0, solde("42")); // Cl.42 débiteur = avances salaires
        // FIX v143 — BUG TVA DOUBLE AU BILAN :
        // Ancien code : solde("44") capturait TOUTES les 44x incluant 4431 (TVA collectée).
        // Or le passif utilisait soldeC("44")+soldeC("443")+soldeC("444")... qui RE-comptabilisait
        // les mêmes sous-comptes → TVA apparaissait 2× (actif ET passif).
        // CORRECTION : séparer nettement TVA déductible (actif) vs TVA collectée (passif).
        // Comptes TVA déductible SYSCOHADA : 4441 (immo), 4446 (autres achats), 4449 (régularisation)
        const tva_deductible   = Math.max(0, solde("4441")+solde("4446")+solde("4449"));
        const creances_fisc    = tva_deductible + Math.max(0, solde("4456")+solde("4457")); // retenues à la source récup.
        const creances         = creances_clients + creances_autres + avances_perso + creances_fisc;
        // FIX v98: trésorerie = solde(5) seul, PAS de double comptage sous-comptes
        const tresor     = Math.max(0, solde("5"));
        const totalActif = Math.max(0, totalImmo) + stocks + creances + tresor;

        // PASSIF SYSCOHADA — solde CRÉDITEUR
        const cap_social = Math.max(0, mouvC("101")+mouvC("102")+mouvC("103")-mouvD("101")-mouvD("102")-mouvD("103"));
        const reserves   = Math.max(0, mouvC("111")+mouvC("112")+mouvC("118")-mouvD("111")-mouvD("112")-mouvD("118"));
        const reportANouv= soldeC("12"); // peut être négatif (report débiteur)
        // FIX v143 — Compte de résultat : utilise mouvCY/mouvDY (exercice courant uniquement)
        // conforme OHADA Art. 34 : le résultat est la différence produits-charges de l'exercice.
        const produits_exploit = mouvCY("70")+mouvCY("71")+mouvCY("72")+mouvCY("73")+mouvCY("74")+mouvCY("75")+mouvCY("76")+mouvCY("77")+mouvCY("78")+mouvCY("79");
        const produits   = produits_exploit > 0 ? produits_exploit : mouvDY("7");
        const charges_exploit = mouvDY("60")+mouvDY("61")+mouvDY("62")+mouvDY("63")+mouvDY("64")+mouvDY("65")+mouvDY("66")+mouvDY("67")+mouvDY("68")+mouvDY("69");
        const charges    = charges_exploit;
        const resultNet  = produits - charges;

        // PASSIF SYSCOHADA — FIX v98/v99 : soldeC (solde créditeur NET) pour éviter double-comptage
        const dettes_fin    = Math.max(0, soldeC("16")+soldeC("17"));
        const dettes_fourn  = Math.max(0, soldeC("40"));
        // FIX v143 — PASSIF dettes fiscales : NE PAS additionner soldeC("44") + soldeC("443") etc.
        // car "443", "444", "448" commencent par "44" → déjà inclus dans soldeC("44") → double-comptage !
        // CORRECTION : comptes spécifiques TVA collectée (4431, 4432) + impôts/taxes (447, 448)
        // Comptes TVA collectée SYSCOHADA : 4431 (ventes locales), 4432 (intracommunautaire)
        const tva_collectee    = Math.max(0, soldeC("4431")+soldeC("4432")+soldeC("4434")+soldeC("4435"));
        const impots_taxes     = Math.max(0, soldeC("447")+soldeC("448")); // IS, patente, taxes diverses
        const dettes_fisc      = tva_collectee + impots_taxes;
        // FIX v143b — dettes_perso : soldeC("42") capture DÉJÀ tous les sous-comptes 421/422/423/425/428
        // car ils commencent tous par "42". Ajouter soldeC("421")... → DOUBLE-COMPTAGE.
        // SYSCOHADA : compte 42 = Dettes envers le personnel (salaires nets à payer, congés, primes)
        // On utilise UNIQUEMENT le solde créditeur net de la classe 42 globale.
        const dettes_perso  = Math.max(0, soldeC("42"));
        // Autres dettes CT (cl.45/46/47 fournisseurs divers, avances clients, comptes de liaison)
        const dettes_autres = Math.max(0, soldeC("45")+soldeC("46")+soldeC("47"));

        // FIX v98/v99: capitaux propres incluent résultat avec son signe (perte = diminue CP)
        const capitaux_propres = cap_social + reserves + reportANouv + resultNet;
        const totalPassif = Math.max(0, capitaux_propres) + dettes_fin + dettes_fourn + dettes_fisc + dettes_perso + dettes_autres;

        const isBalanced  = totalActif > 0 && Math.abs(totalActif - totalPassif) < 2;
        const bilanEcart  = totalActif - totalPassif;

        // ── Flux de trésorerie (base calculs) ─────────────────
        const encaissements = mouvD("5");
        const decaissements = mouvC("5");
        const tresNette     = encaissements - decaissements;
        // FIX v98 — Flux par nature (SYSCOHADA TFT)
        const flux_exploit = mouvD("512")+mouvD("515")+mouvD("521") - mouvC("512") - mouvC("515") - mouvC("521");
        const flux_invest  = -(mouvD("20")+mouvD("21")+mouvD("22")+mouvD("23")+mouvD("24")+mouvD("25")+mouvD("26")+mouvD("27") - mouvC("20")-mouvC("21")-mouvC("22")-mouvC("23")-mouvC("24")-mouvC("25")-mouvC("26")-mouvC("27"));
        const flux_finan   = mouvC("16")+mouvC("17")+mouvC("10") - mouvD("16")-mouvD("17")-mouvD("10");

        // ── Ratios financiers SYSCOHADA complets ─────────────
        const margeNette   = produits > 0 ? (resultNet / produits) * 100 : 0;
        const actif_circ   = stocks + creances + tresor;
        const dettes_ct    = dettes_fourn + dettes_fisc + dettes_perso + dettes_autres;
        // Liquidité générale = actif circulant / dettes CT (>1 = solvable CT)
        const liquidite    = dettes_ct > 0 ? actif_circ / dettes_ct : 0;
        // Liquidité réduite (sans stocks — plus prudente)
        const liquidite_r  = dettes_ct > 0 ? (creances + tresor) / dettes_ct : 0;
        const autofin      = cap_social + reserves > 0 ? (resultNet / (cap_social + reserves)) * 100 : 0;
        const endettement  = totalActif > 0 ? ((dettes_fin + dettes_fourn) / totalActif) * 100 : 0;
        // Solvabilité = capitaux propres / total passif
        const solvabilite  = totalPassif > 0 ? (Math.max(0, capitaux_propres) / totalPassif) * 100 : 0;

        const FMT = (v) => Math.round(v).toLocaleString("fr-FR");

        const gcDiagFinancier = (() => {
          const alertes = [];
          const WARN = (code, titre, detail, action, compte, gravite="WARN") =>
            alertes.push({code, titre, detail, action, compte, gravite});

          // ── 1. Vérifications BILAN ─────────────────────────────────────
          if (totalActif === 0 && journalEntries.length === 0)
            WARN("B01","Aucune écriture comptable",
              "Le journal est vide. Aucun état financier ne peut être établi.",
              "Saisissez vos écritures dans Finance > Journal OHADA. Commencez par l'écriture d'ouverture : D:Banque/Caisse (512/571) | C:Capital (101).",
              "101 / 512","INFO");

          if (cap_social === 0 && journalEntries.length > 0)
            WARN("B02","Aucun capital enregistré",
              "Le compte 101 (Capital) n'a pas été mouvementé. Le passif ne comprend que le résultat, ce qui est incomplet pour une entité constituée.",
              "Saisissez l'écriture d'apport en capital : D:512 Banque (ou 571 Caisse) | C:101 Capital social — Montant : apport des associés.",
              "101","WARN");

          if (Math.abs(bilanEcart) >= 2 && totalActif > 0)
            WARN("B03","Bilan non équilibré — écart de " + FMT(Math.abs(bilanEcart)) + " FCFA",
              "Total Actif (" + FMT(totalActif) + ") ≠ Total Passif (" + FMT(totalPassif) + "). En comptabilité en partie double, toute écriture doit avoir Débit = Crédit.",
              "Vérifiez : (1) que chaque écriture du journal a Débit = Crédit, (2) que les comptes correcteurs (amortissements 28x, provisions 39x) sont bien saisis en crédit, (3) que le capital de départ est enregistré (compte 101).",
              "Tous comptes","ERROR");

          if (mouvD("5") > 0 && solde("41") > 0 && creances_clients > 0)
            WARN("B04","Clients non soldés — " + FMT(creances_clients) + " FCFA de créances",
              "Des comptes clients (Cl.41) restent débiteurs, indiquant des ventes non encore encaissées.",
              "À l'encaissement : D:512 Banque ou D:571 Caisse | C:411 Clients — Montant : règlement reçu.",
              "411 / 512 / 571","INFO");

          if (immoAmort > 0 && !journalEntries.some(e=>e.compteCredit?.startsWith("28")))
            WARN("B05","Amortissements non constatés",
              "Des immobilisations sont enregistrées mais aucune dotation aux amortissements n'est détectée (compte 28x non mouvementé).",
              "En fin d'exercice : D:681 Dotation aux amortissements | C:28x Amortissements du bien — Montant : valeur brute / durée de vie.",
              "681 / 28x","WARN");

          // ── 2. Vérifications COMPTE DE RÉSULTAT ───────────────────────
          if (produits === 0 && journalEntries.length > 0)
            WARN("CR01","Aucun produit (Cl.7) enregistré",
              "Le compte de résultat ne contient aucun produit. Les ventes et prestations doivent être créditées en classe 7.",
              "Saisissez vos ventes : D:411 Clients (ou D:571 Caisse si paiement comptant) | C:701 Ventes marchandises ou C:706 Prestations de services.",
              "701 / 706 / 411","ERROR");

          if (charges === 0 && journalEntries.length > 0)
            WARN("CR02","Aucune charge (Cl.6) enregistrée",
              "Aucune charge n'est enregistrée. Vérifiez si les achats, salaires et charges d'exploitation ont bien été saisis en débit de classe 6.",
              "Saisissez vos charges : D:601 Achats marchandises | C:401 Fournisseurs (ou C:571 Caisse si comptant).",
              "601 / 66x / 401","INFO");

          if (mouvD("66") === 0 && journalEntries.length > 5)
            WARN("CR03","Charges de personnel absentes",
              "Aucune charge de personnel (compte 66x) n'est enregistrée. Si l'entité a des salariés, la paie doit être comptabilisée.",
              "Écriture de paie : D:661 Salaires bruts | C:421 Personnel—salaires à payer. Versement : D:421 | C:571 Caisse ou C:512 Banque.",
              "661 / 421 / 512","WARN");

          if (resultNet > produits && produits > 0)
            WARN("CR04","Résultat supérieur aux produits — incohérence",
              "Résultat (" + FMT(resultNet) + ") > Produits (" + FMT(produits) + ") est mathématiquement impossible (sauf si des charges sont créditées en cl.6, ce qui est incorrect).",
              "Vérifiez les écritures de classe 6 : les charges doivent être enregistrées en DÉBIT (D:6xx). Un crédit en classe 6 est une contre-passation ou régularisation, pas une charge normale.",
              "Cl.6 (débit obligatoire)","ERROR");

          // ── 3. Vérifications PROCÉDURE OHADA ──────────────────────────
          // P01 — Vérifier que le compte 411 (Clients) est soldé si la trésorerie a encaissé
          // (571/512 débité ET 411 crédité = client soldé = pas de créance résiduelle = correct)
          // La procédure standard correcte est : D:411|C:701 puis D:571|C:411
          const hasClientSolde = creances_clients === 0 && mouvD("411") > 0 && mouvC("411") > 0;
          const hasClientNonSolde = creances_clients > 0 && mouvD("5") > 0;
          if (hasClientNonSolde)
            WARN("P01","Clients non soldés malgré des encaissements",
              `Des créances clients (411) restent ouvertes (${FMT(creances_clients)} FCFA) alors que des encaissements ont été enregistrés en trésorerie. Le compte 411 doit être soldé lors du règlement.`,
              "À l'encaissement : D:571 Caisse (ou D:512 Banque) | C:411 Clients — pour le montant exact réglé. Exemple : vente 10 000 à crédit → D:411=10000|C:701=10000, puis encaissement → D:571=10000|C:411=10000.",
              "411 / 571 / 512","WARN");

          // Vérifier si 511 est utilisé comme substitut permanent à 411 (erreur courante)
          const uses511PermanentlyForSales = journalEntries.filter(e=>
            e.compteDebit?.startsWith("511") && e.compteCredit?.startsWith("70")
          ).length > 2; // Tolérance : 1-2 fois peut être légit (chèques)
          if (uses511PermanentlyForSales)
            WARN("P01b","Compte 511 utilisé systématiquement pour les ventes",
              "Le compte 511 (Valeurs à l'encaissement) est utilisé pour chaque vente. Ce compte est réservé aux chèques/traites en attente de remise en banque, pas pour toutes les créances.",
              "Vente ordinaire à crédit : D:411 Clients | C:701 Ventes. Utiliser 511 uniquement si vous recevez un chèque physique non encore remis en banque, puis D:512 Banque | C:511 à la remise.",
              "411 vs 511","INFO");

          // Détecter achat débité en 571 ou 512 directement (pas de 401 Fournisseur)
          const hasDirectPurchase = journalEntries.some(e=>
            e.compteDebit?.startsWith("6") && e.compteCredit?.startsWith("57")
          );
          if (hasDirectPurchase && mouvC("401") === 0)
            WARN("P02","Achats réglés comptant sans transit fournisseur",
              "Des achats sont directement crédités en caisse/banque (Cl.57x/51x) sans passer par le compte fournisseur (401). C'est acceptable pour les achats comptants, mais si des fournisseurs ont des délais de paiement, utiliser le compte 401.",
              "Pour achats comptants : D:601 Achats | C:571 Caisse ✅ (conforme pour petits achats). Pour achats à crédit : D:601 Achats | C:401 Fournisseurs — puis paiement : D:401 | C:512 Banque.",
              "601 / 401 / 571","INFO");

          // Détecter TVA collectée non constatée
          const hasTVACollected = journalEntries.some(e=>e.compteCredit?.startsWith("443"));
          const hasRevenue = produits > 0;
          if (hasRevenue && !hasTVACollected && produits > 500000)
            WARN("P03","TVA collectée non constatée",
              "Des produits sont enregistrés mais aucune écriture de TVA collectée (compte 4431) n'est détectée. Si l'entité est assujettie à la TVA (18% au Gabon), la TVA doit être constatée.",
              "Écriture correcte avec TVA : D:411 Clients (TTC) | C:701 Ventes (HT) + C:4431 TVA collectée (18%). Exemple 10 000 HT : D:411 = 11 800 | C:701 = 10 000 | C:4431 = 1 800.",
              "4431 TVA collectée","WARN");

          // ── 4. Vérifications TRÉSORERIE ────────────────────────────────
          if (tresor < 0)
            WARN("T01","Trésorerie nette négative — découvert",
              "Le solde de trésorerie (classe 5) est négatif (" + FMT(tresor) + " FCFA), ce qui indique un découvert ou des écritures de trésorerie incorrectes.",
              "Vérifiez : (1) qu'aucun compte de classe 5 n'est crédité pour plus qu'il n'a été débité, (2) l'existence d'un découvert autorisé (compte 562), (3) l'absence d'erreurs de saisie dans le journal.",
              "Cl.5 (solde anormal)","ERROR");

          const encaissTresor = mouvD("5");
          const decaissTresor = mouvC("5");
          if (encaissTresor > 0 && decaissTresor > encaissTresor * 2)
            WARN("T02","Décaissements anormalement élevés",
              "Les sorties de trésorerie (" + FMT(decaissTresor) + ") sont plus du double des encaissements (" + FMT(encaissTresor) + "). Vérifiez l'absence de doublons ou d'écritures de contre-passation incorrectes.",
              "Examinez le journal ligne par ligne et vérifiez que chaque sortie correspond à une transaction réelle. Les contre-passations doivent utiliser les mêmes comptes en inversant débit/crédit.",
              "Cl.5","WARN");

          // Double comptage (avant fix v98 : avertir si soldes sous-classes != solde classe)
          const soommeSousClasses5 = solde("50")+solde("51")+solde("52")+solde("53")+solde("57")+solde("58");
          if (Math.abs(soommeSousClasses5 - solde("5")) > 1)
            WARN("T03","Écritures de trésorerie sur comptes récapitulatifs",
              "Certaines écritures utilisent le compte générique '5' au lieu des sous-comptes (511, 512, 571...). Le compte 5 est récapitulatif et ne doit pas être directement mouvementé.",
              "Utilisez toujours les sous-comptes de trésorerie : 512 Banques locales, 515 Régie de recettes, 571 Caisse siège, 572 Caisse agence... Évitez de saisir le compte '5' directement.",
              "Sous-comptes Cl.5","WARN");

          // ── 5. Vérifications COHÉRENCE GLOBALE ────────────────────────
          if (totalActif > 0 && totalPassif > 0 && Math.abs(resultNet) > totalActif * 2)
            WARN("G01","Résultat disproportionné par rapport à l'actif",
              "Le résultat (" + FMT(Math.abs(resultNet)) + ") est anormalement élevé par rapport à l'actif total (" + FMT(totalActif) + "). Cela peut indiquer des charges ou produits saisis plusieurs fois.",
              "Passez en revue le journal et vérifiez qu'aucune écriture n'a été dupliquée par erreur. Utilisez la fonction 'Rechercher' dans le journal pour filtrer par date ou compte.",
              "Cl.6 / Cl.7","WARN");

          if (dettes_fourn > 0 && mouvD("401") === 0)
            WARN("G02","Fournisseurs créditeurs sans règlement enregistré",
              "Des dettes fournisseurs (" + FMT(dettes_fourn) + " FCFA) sont enregistrées mais aucun règlement (débit 401) n'apparaît dans le journal.",
              "Lorsque vous payez un fournisseur : D:401 Fournisseurs | C:512 Banque ou C:571 Caisse — pour solder la dette.",
              "401 / 512","INFO");

          return alertes;
        })();

        const DIAG_COLORS = {INFO:"#3B82F6", WARN:"#F59E0B", ERROR:"#EF4444"};
        const DIAG_ICONS  = {INFO:"ℹ️", WARN:"⚠️", ERROR:"❌"};

        // Composant diagnostic réutilisable
        const DiagBlock = ({filter=null}) => {
          const alertesFilt = filter
            ? gcDiagFinancier.filter(a=>filter.includes(a.code[0]))
            : gcDiagFinancier;
          if (alertesFilt.length === 0) return (
            <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:8,padding:"8px 14px",marginTop:12,fontSize:10,color:"#22C55E",display:"flex",alignItems:"center",gap:8}}>
              <span>✅</span>
              <span>Aucune irrégularité détectée pour cet état — procédures conformes SYSCOHADA.</span>
            </div>
          );
          return (
            <div style={{marginTop:12}}>
              <div style={{color:"#C9A84C",fontWeight:800,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>
                🔍 Diagnostic SYSCOHADA — {alertesFilt.length} point(s) à vérifier
              </div>
              {alertesFilt.map((a,i)=>{
                const c=DIAG_COLORS[a.gravite]||"#6B7280";
                return (
                  <div key={i} style={{background:c+"0D",border:`1px solid ${c}44`,borderRadius:8,padding:"10px 12px",marginBottom:7}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:5}}>
                      <span style={{fontSize:14,flexShrink:0}}>{DIAG_ICONS[a.gravite]}</span>
                      <div style={{flex:1}}>
                        <div style={{color:c,fontWeight:800,fontSize:11}}>[{a.code}] {a.titre}</div>
                        <div style={{color:"#94A3B8",fontSize:10,marginTop:2,lineHeight:1.5}}>{a.detail}</div>
                      </div>
                      {a.compte&&<span style={{background:c+"22",color:c,borderRadius:4,padding:"2px 7px",fontSize:8,fontWeight:700,flexShrink:0}}>{a.compte}</span>}
                    </div>
                    <div style={{background:"#0A1E4A33",borderRadius:5,padding:"6px 10px",marginLeft:22}}>
                      <div style={{color:"#C9A84C",fontSize:9,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>💡 Action recommandée</div>
                      <div style={{color:"#CBD5E1",fontSize:10,lineHeight:1.6}}>{a.action}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        };

        const SUB_TABS = [["bilan","📊 Bilan"],["cr","📈 C. Résultat"],["tresorerie_etat","💳 Trésorerie"],["tft","🌊 Flux (TFT)"],["ratios","📉 Ratios"],["diagnostic","🔍 Diagnostic"],["plan_cpt","⚙️ Plan Comptable"]];
        const customCpts = ()=>{try{return JSON.parse(_lsGet("gc-ohada-custom")||"[]");}catch (_) {return [];}};
        const saveCustomCpts = c => { try{_lsSet("gc-ohada-custom",JSON.stringify(c));dsSave("gc-ohada-custom",c).catch(err => gcToast.syncError('', err));}catch (_) {} };

        return (
          <div>
            {/* Navigation sous-onglets */}
            <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <button onClick={()=>setFinTool("dashboard")} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11}}>← Retour</button>
                            {/* FIX v143 — Sélecteur exercice comptable OHADA Art.7 AUPCAP */}
              {(()=>{
                const availYears=[...new Set(journalEntries.map(e=>e.date?.slice(0,4)).filter(Boolean))].sort().reverse();
                const selYears=availYears.length>0?availYears:[String(new Date().getFullYear())];
                return (
                  <div style={{display:"flex",alignItems:"center",gap:5,background:"#C9A84C15",border:"1px solid #C9A84C44",borderRadius:8,padding:"4px 10px",marginRight:4}}>
                    <span style={{color:"#C9A84C",fontSize:10,fontWeight:700}}>📅 Exercice</span>
                    <select value={exerciceAnnee} onChange={e=>setExerciceAnnee(parseInt(e.target.value))}
                      style={{background:"transparent",border:"none",color:"#C9A84C",fontSize:11,fontWeight:800,cursor:"pointer",outline:"none"}}>
                      {selYears.map(y=><option key={y} value={Number(y)}>{y}</option>)}
                    </select>
                    <span style={{color:"#C9A84C",fontSize:8,opacity:0.7}}>01/01→31/12</span>
                  </div>
                );
              })()}
              {SUB_TABS.map(([id,label])=>(
                <button key={id} onClick={()=>setFinTool("etats_"+id)}
                  style={{background:etatsTab===id?"#C9A84C22":T.surface2,border:`1px solid ${etatsTab===id?"#C9A84C66":T.border}`,color:etatsTab===id?"#C9A84C":T.textMuted,borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:etatsTab===id?800:500,fontSize:11}}>
                  {label}
                </button>
              ))}
              {/* Indicateur équilibre */}
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,background:isBalanced?"#22C55E15":"#EF444415",border:`1px solid ${isBalanced?"#22C55E44":"#EF444433"}`,borderRadius:7,padding:"5px 12px"}}>
                <span>{isBalanced?"✅":"⚠️"}</span>
                <span style={{color:isBalanced?"#22C55E":"#EF4444",fontSize:10,fontWeight:700}}>
                  {isBalanced?"BILAN ÉQUILIBRÉ":"Écart: "+FMT(Math.abs(bilanEcart))+" FCFA"}
                </span>
              </div>
            </div>

            {/* ── BILAN ────────────────────────────────────── */}
            {etatsTab==="bilan" && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                {/* ACTIF */}
                <div style={{background:T.surface2,border:"2px solid #22C55E44",borderRadius:12,padding:14}}>
                  <div style={{color:"#22C55E",fontWeight:800,fontSize:12,marginBottom:10}}>📊 BILAN — ACTIF (SYSCOHADA)</div>
                  {[
                    {label:"Immobilisations incorporelles nettes (Cl.20)",v:immoIncorp,compte:"20"},
                    {label:"Immobilisations corporelles nettes (Cl.21-24 – amort.28)",v:Math.max(0,immoCorp-immoAmort),compte:"21"},
                    {label:"Immobilisations financières (Cl.25-27)",v:immoFin,compte:"25"},
                    {label:"Stocks & en-cours (Cl.3)",v:stocks,compte:"3"},
                    {label:"Créances clients (Cl.41)",v:creances_clients,compte:"41"},
                    {label:"Avances personnel (Cl.42 déb.) & fisc. (Cl.44 déb.)",v:avances_perso+creances_fisc,compte:"42"},
                    {label:"Autres créances (Cl.43/47/48)",v:creances_autres,compte:"43"},
                    {label:"Trésorerie nette (Cl.5)",v:tresor,compte:"5"},
                  ].map((r,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}22`}}>
                      <span style={{color:T.textMuted,fontSize:10}}>{r.label}</span>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:r.color||T.text,fontWeight:600,fontSize:11,fontFamily:"monospace"}}>{FMT(r.v)}</span>
                        <button onClick={()=>setFinTool("journal")} title="Voir les écritures" style={{background:"#22C55E15",border:"1px solid #22C55E33",color:"#22C55E",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:8}}>📝</button>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"2px solid #22C55E44",marginTop:4}}>
                    <span style={{color:"#22C55E",fontWeight:800,fontSize:12}}>TOTAL ACTIF</span>
                    <span style={{color:"#22C55E",fontWeight:900,fontSize:14,fontFamily:"monospace"}}>{FMT(totalActif)} FCFA</span>
                  </div>
                </div>
                {/* PASSIF */}
                <div style={{background:T.surface2,border:"2px solid #3B82F644",borderRadius:12,padding:14}}>
                  <div style={{color:"#3B82F6",fontWeight:800,fontSize:12,marginBottom:10}}>📊 BILAN — PASSIF (SYSCOHADA)</div>
                  {[
                    {label:"Capital social (Cl.101-103)",v:cap_social,compte:"10"},
                    {label:"Réserves (Cl.111-118)",v:reserves,compte:"11"},
                    {label:"Report à nouveau (Cl.12)",v:reportANouv,compte:"12",color:reportANouv<0?"#EF4444":T.text},
                    {label:`Résultat ${resultNet>=0?"bénéfice":"perte"} de l'exercice`,v:resultNet,compte:"13",color:resultNet>=0?"#22C55E":"#EF4444"},
                    {label:"Dettes financières LT (Cl.16-17)",v:dettes_fin,compte:"16"},
                    {label:"Dettes fournisseurs (Cl.40 — solde créditeur)",v:dettes_fourn,compte:"40"},
                    {label:"Dettes fiscales (Cl.44 — TVA, IS)",v:dettes_fisc,compte:"44"},
                    {label:"Dettes envers le personnel (Cl.42)",v:dettes_perso,compte:"42"},
                    {label:"Autres dettes CT (Cl.45/46/47)",v:dettes_autres,compte:"45"},
                  ].map((r,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}22`}}>
                      <span style={{color:T.textMuted,fontSize:10}}>{r.label}</span>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:r.color||T.text,fontWeight:600,fontSize:11,fontFamily:"monospace"}}>{FMT(r.v)}</span>
                        <button onClick={()=>setFinTool("journal")} title="Voir les écritures" style={{background:"#3B82F615",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:8}}>📝</button>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"2px solid #3B82F644",marginTop:4}}>
                    <span style={{color:"#3B82F6",fontWeight:800,fontSize:12}}>TOTAL PASSIF</span>
                    <span style={{color:isBalanced?"#3B82F6":"#EF4444",fontWeight:900,fontSize:14,fontFamily:"monospace"}}>{FMT(totalPassif)} FCFA</span>
                  </div>
                  {!isBalanced&&totalActif>0&&(
                    <div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:6,padding:"6px 10px",marginTop:8,fontSize:10,color:"#EF4444",fontWeight:700}}>
                      ⚠️ Écart: {FMT(Math.abs(bilanEcart))} FCFA — Vérifiez les écritures de clôture
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── COMPTE DE RÉSULTAT ─────────────────────── */}
            {etatsTab==="cr" && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div style={{background:T.surface2,border:"2px solid #22C55E44",borderRadius:12,padding:14}}>
                  <div style={{color:"#22C55E",fontWeight:800,fontSize:12,marginBottom:10}}>📈 PRODUITS (Classe 7 — SYSCOHADA)</div>
                  {[
                    {label:"Ventes de marchandises (Cl.701-703)",    v:mouvC("701")+mouvC("702")+mouvC("703")||mouvC("70")},
                    {label:"Prestations de services — Honoraires (706)",v:mouvC("706")||mouvD("706")},
                    {label:"Travaux & services (704-705)",            v:mouvC("704")+mouvC("705")},
                    {label:"Production stockée (Cl.71)",              v:mouvC("71")},
                    {label:"Production immobilisée (Cl.72)",          v:mouvC("72")},
                    {label:"Subventions d'exploitation (Cl.74)",      v:mouvC("74")},
                    {label:"Autres produits d'exploitation (Cl.75)",  v:mouvC("75")},
                    {label:"Produits financiers (Cl.77)",             v:mouvC("77")},
                    {label:"Produits HAO & exceptionnels (Cl.78-79)", v:mouvC("78")+mouvC("79")},
                  ].map((r,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}22`}}>
                      <span style={{color:T.textMuted,fontSize:10}}>{r.label}</span>
                      <div style={{display:"flex",gap:5,alignItems:"center"}}>
                        <span style={{color:r.v>0?"#22C55E":T.textDim,fontWeight:600,fontSize:11,fontFamily:"monospace"}}>{FMT(r.v)}</span>
                        <button onClick={()=>setFinTool("journal")} title="Voir les écritures" style={{background:"#22C55E15",border:"1px solid #22C55E33",color:"#22C55E",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:8}}>📝</button>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:"2px solid #22C55E44",marginTop:4,fontWeight:800}}>
                    <span style={{color:"#22C55E",fontSize:12}}>TOTAL PRODUITS</span>
                    <span style={{color:"#22C55E",fontSize:13,fontFamily:"monospace"}}>{FMT(produits)} FCFA</span>
                  </div>
                </div>
                <div style={{background:T.surface2,border:"2px solid #EF444444",borderRadius:12,padding:14}}>
                  <div style={{color:"#EF4444",fontWeight:800,fontSize:12,marginBottom:10}}>📉 CHARGES (Classe 6 — SYSCOHADA)</div>
                  {[
                    {label:"Achats & variations de stocks (Cl.60)",      v:mouvD("60")},
                    {label:"Services extérieurs A (Cl.61)",              v:mouvD("61")},
                    {label:"Services extérieurs B (Cl.62)",              v:mouvD("62")},
                    {label:"Impôts, taxes & versements (Cl.63)",         v:mouvD("63")},
                    {label:"Charges de personnel — salaires (Cl.66)",    v:mouvD("66")},
                    {label:"Charges sociales patronales (Cl.64)",        v:mouvD("64")},
                    {label:"Dotations amortissements & provisions (Cl.68)",v:mouvD("68")},
                    {label:"Charges financières (Cl.67)",                v:mouvD("67")},
                    {label:"Charges HAO & exceptionnelles (Cl.69)",      v:mouvD("69")},
                  ].map((r,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}22`}}>
                      <span style={{color:T.textMuted,fontSize:10}}>{r.label}</span>
                      <div style={{display:"flex",gap:5,alignItems:"center"}}>
                        <span style={{color:r.v>0?"#EF4444":T.textDim,fontWeight:600,fontSize:11,fontFamily:"monospace"}}>{FMT(r.v)}</span>
                        <button onClick={()=>setFinTool("journal")} title="Voir les écritures" style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:8}}>📝</button>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:"2px solid #EF444444",marginTop:4,fontWeight:800}}>
                    <span style={{color:"#EF4444",fontSize:12}}>TOTAL CHARGES</span>
                    <span style={{color:"#EF4444",fontSize:13,fontFamily:"monospace"}}>{FMT(charges)} FCFA</span>
                  </div>
                </div>
                <div style={{gridColumn:"span 2",background:T.surface2,border:`2px solid ${resultNet>=0?"#C9A84C":"#EF4444"}44`,borderRadius:12,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:resultNet>=0?"#C9A84C":"#EF4444",fontWeight:900,fontSize:14}}>RÉSULTAT NET DE L'EXERCICE</span>
                    <span style={{color:resultNet>=0?"#22C55E":"#EF4444",fontWeight:900,fontSize:18,fontFamily:"monospace"}}>{resultNet>=0?"+":""}{FMT(resultNet)} FCFA</span>
                  </div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:4}}>Produits ({FMT(produits)}) — Charges ({FMT(charges)})</div>
                </div>
              </div>
            )}

            {/* ── TABLEAU DE TRÉSORERIE ─────────────────── */}
            {etatsTab==="tresorerie_etat" && (()=>{
              // RÈGLE SYSCOHADA STRICTE :
              // ENCAISSEMENT = débit d'un compte de classe 5 (entrée de fonds)
              // DÉCAISSEMENT = crédit d'un compte de classe 5 (sortie de fonds)
              // Chaque poste est exclusif : un même compte ne peut pas être dans les deux colonnes
              const TRESO_POSTES_ENC = [
                {label:"511 — Valeurs à l'encaissement",        v:mouvD("511"),  compte:"511"},
                {label:"512 — Banques (virements reçus)",        v:mouvD("512"),  compte:"512"},
                {label:"515 — Caisse (entrées espèces)",         v:mouvD("515"),  compte:"515"},
                {label:"516 — Chèques postaux (encaissements)",  v:mouvD("516"),  compte:"516"},
                {label:"521 — Banques locales (débits reçus)",   v:mouvD("521"),  compte:"521"},
                {label:"531 — VMP cédées (entrées)",             v:mouvD("531"),  compte:"531"},
                {label:"570 — Trésorerie mobile/digital",        v:mouvD("570"),  compte:"570"},
                {label:"Autres comptes Cl.5 débités",            v:mouvD("5") - mouvD("511") - mouvD("512") - mouvD("515") - mouvD("516") - mouvD("521") - mouvD("531") - mouvD("570"), compte:"5"},
              ].filter(r=>r.v>0);
              const TRESO_POSTES_DEC = [
                // FIX v73 — UNIQUEMENT les comptes Cl.5 crédités = sorties de trésorerie réelles
                // Les comptes 401/441/421 crédités sont des dettes constituées, PAS des décaissements
                {label:"511 — Valeurs à l'encaissement (sorties)",v:mouvC("511"),  compte:"511"},
                {label:"512 — Banques (virements émis)",           v:mouvC("512"),  compte:"512"},
                {label:"514 — Chèques émis",                       v:mouvC("514"),  compte:"514"},
                {label:"515 — Caisse (sorties espèces)",           v:mouvC("515"),  compte:"515"},
                {label:"516 — Chèques postaux (émis)",             v:mouvC("516"),  compte:"516"},
                {label:"521 — Banque locale (débits effectués)",   v:mouvC("521"),  compte:"521"},
                {label:"522 — Banque devise (sorties)",            v:mouvC("522"),  compte:"522"},
                {label:"524 — Épargne retirée",                    v:mouvC("524"),  compte:"524"},
                {label:"531 — Chèques postaux émis",               v:mouvC("531"),  compte:"531"},
                {label:"571 — Caisse siège (sorties)",             v:mouvC("571"),  compte:"571"},
                {label:"572 — Caisse agence (sorties)",            v:mouvC("572"),  compte:"572"},
                {label:"Autres comptes Cl.5 crédités",             v:Math.max(0,mouvC("5")-mouvC("511")-mouvC("512")-mouvC("514")-mouvC("515")-mouvC("516")-mouvC("521")-mouvC("522")-mouvC("524")-mouvC("531")-mouvC("571")-mouvC("572")), compte:"5"},
              ].filter(r=>r.v>0);
              const totalEnc = mouvD("5");
              const totalDec = mouvC("5");
              const nette = totalEnc - totalDec;
              return (
                <div>
                  {/* Info pédagogique */}
                  <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:10,color:"#C9A84C"}}>
                    ℹ️ <strong>Règle SYSCOHADA :</strong> Encaissement = débit classe 5 (fonds entrants) · Décaissement = crédit classe 5 (fonds sortants). Les montants sont calculés depuis le journal OHADA.
                    <button onClick={()=>setFinTool("journal")} style={{marginLeft:8,background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:5,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>📝 Saisir des écritures</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                    {/* ENCAISSEMENTS */}
                    <div style={{background:T.surface2,border:"2px solid #22C55E44",borderRadius:12,padding:14}}>
                      <div style={{color:"#22C55E",fontWeight:800,fontSize:12,marginBottom:10}}>💰 ENCAISSEMENTS — Débits Cl.5 (entrées de fonds)</div>
                      {TRESO_POSTES_ENC.length===0 && <div style={{color:T.textDim,textAlign:"center",padding:20,fontSize:11}}>Aucun encaissement enregistré</div>}
                      {TRESO_POSTES_ENC.map((r,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}22`}}>
                          <span style={{color:T.textMuted,fontSize:10}}>{r.label}</span>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            <span style={{color:"#22C55E",fontWeight:600,fontSize:11,fontFamily:"monospace"}}>{FMT(r.v)}</span>
                            <button onClick={()=>setFinTool("journal")} style={{background:"#22C55E15",border:"1px solid #22C55E33",color:"#22C55E",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:8}}>📝</button>
                          </div>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:"2px solid #22C55E44",marginTop:4,fontWeight:800}}>
                        <span style={{color:"#22C55E",fontSize:12}}>TOTAL ENCAISSEMENTS</span>
                        <span style={{color:"#22C55E",fontSize:13,fontFamily:"monospace"}}>{FMT(totalEnc)} FCFA</span>
                      </div>
                    </div>
                    {/* DÉCAISSEMENTS */}
                    <div style={{background:T.surface2,border:"2px solid #EF444444",borderRadius:12,padding:14}}>
                      <div style={{color:"#EF4444",fontWeight:800,fontSize:12,marginBottom:10}}>💸 DÉCAISSEMENTS — Crédits Cl.5 (sorties de fonds)</div>
                      {TRESO_POSTES_DEC.length===0 && <div style={{color:T.textDim,textAlign:"center",padding:20,fontSize:11}}>Aucun décaissement enregistré</div>}
                      {TRESO_POSTES_DEC.map((r,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}22`}}>
                          <span style={{color:T.textMuted,fontSize:10}}>{r.label}</span>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            <span style={{color:"#EF4444",fontWeight:600,fontSize:11,fontFamily:"monospace"}}>{FMT(r.v)}</span>
                            <button onClick={()=>setFinTool("journal")} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:8}}>📝</button>
                          </div>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:"2px solid #EF444444",marginTop:4,fontWeight:800}}>
                        <span style={{color:"#EF4444",fontSize:12}}>TOTAL DÉCAISSEMENTS</span>
                        <span style={{color:"#EF4444",fontSize:13,fontFamily:"monospace"}}>{FMT(totalDec)} FCFA</span>
                      </div>
                    </div>
                  </div>
                  {/* Variation nette */}
                  <div style={{background:T.surface2,border:`2px solid ${nette>=0?"#22C55E":"#EF4444"}44`,borderRadius:12,padding:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <span style={{color:nette>=0?"#22C55E":"#EF4444",fontWeight:900,fontSize:14}}>VARIATION NETTE DE TRÉSORERIE</span>
                      <span style={{color:nette>=0?"#22C55E":"#EF4444",fontWeight:900,fontSize:18,fontFamily:"monospace"}}>{nette>=0?"+":""}{FMT(nette)} FCFA</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:16}}>
                      {[{label:"Encaissements",val:totalEnc,color:"#22C55E"},{label:"Décaissements",val:totalDec,color:"#EF4444"}].map(item=>{
                        const total=Math.max(totalEnc+totalDec,1);
                        return (
                          <div key={item.label} style={{flex:1}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                              <span style={{color:T.textMuted,fontSize:9}}>{item.label}</span>
                              <span style={{color:item.color,fontSize:10,fontWeight:700}}>{Math.round((item.val/total)*100)}%</span>
                            </div>
                            <div style={{background:T.surface3,borderRadius:99,height:8,overflow:"hidden"}}>
                              <div style={{width:`${(item.val/total)*100}%`,height:"100%",background:item.color,borderRadius:99,transition:"width 1s"}}/>
                            </div>
                            <div style={{color:item.color,fontSize:9,marginTop:2,fontFamily:"monospace",textAlign:"right"}}>{FMT(item.val)} FCFA</div>
                          </div>
                        );
                      })}
                    </div>
                    {(totalEnc===0&&totalDec===0)&&(
                      <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:6,padding:"8px 12px",marginTop:10,fontSize:10,color:"#F59E0B",textAlign:"center"}}>
                        ⚠️ Aucune écriture de trésorerie trouvée. Saisissez vos écritures dans le journal OHADA en utilisant les comptes de classe 5 (512, 515, 521...).
                        <button onClick={()=>setFinTool("journal")} style={{display:"block",margin:"6px auto 0",background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:10}}>📝 Ouvrir le journal</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── RATIOS FINANCIERS ─────────────────────── */}
            {etatsTab==="ratios" && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                {[
                  {label:"💹 Taux de marge nette",    val:produits>0?margeNette.toFixed(1)+"%":"N/A",   color:margeNette>15?"#22C55E":margeNette>5?"#F59E0B":"#EF4444",   desc:"Résultat / Produits",                 benchmark:"Cible > 15%",       tab:"cr"},
                  {label:"💧 Liquidité générale",      val:dettes_ct>0?liquidite.toFixed(2)+"x":"N/A",   color:liquidite>1.5?"#22C55E":liquidite>1?"#F59E0B":"#EF4444",    desc:"Actif circ. / Dettes CT",             benchmark:"Cible > 1.5",       tab:"bilan"},
                  {label:"💧 Liquidité réduite",       val:dettes_ct>0?liquidite_r.toFixed(2)+"x":"N/A", color:liquidite_r>1?"#22C55E":liquidite_r>0.5?"#F59E0B":"#EF4444",desc:"(Créances+Tréso) / Dettes CT",       benchmark:"Cible > 1.0",       tab:"bilan"},
                  {label:"🏦 Taux d'endettement",      val:totalActif>0?endettement.toFixed(1)+"%":"N/A", color:endettement<40?"#22C55E":endettement<60?"#F59E0B":"#EF4444", desc:"(Dettes LT+Fourn.) / Total Actif",   benchmark:"Cible < 40%",       tab:"bilan"},
                  {label:"💰 Autofinancement",          val:cap_social+reserves>0?autofin.toFixed(1)+"%":"N/A", color:autofin>10?"#22C55E":autofin>0?"#F59E0B":"#EF4444",   desc:"Résultat / Capitaux propres",         benchmark:"Cible > 10%",       tab:"cr"},
                  {label:"🛡️ Solvabilité",              val:totalPassif>0?solvabilite.toFixed(1)+"%":"N/A",color:solvabilite>40?"#22C55E":solvabilite>20?"#F59E0B":"#EF4444",desc:"Cap. propres / Total Passif",        benchmark:"Cible > 40%",       tab:"bilan"},
                  {label:"📦 Rotation des actifs",      val:totalActif>0?(produits/totalActif).toFixed(2)+"x":"N/A", color:"#A855F7",                                        desc:"Produits / Total Actif",              benchmark:"Ref sectorielle",   tab:"cr"},
                  {label:"🌊 Flux trésorerie net",      val:`${tresNette>=0?"+":""}${FMT(tresNette)} F`,  color:tresNette>=0?"#22C55E":"#EF4444",                            desc:"Encaissements − Décaissements",       benchmark:"Doit être > 0",     tab:"tresorerie_etat"},
                ].map((r,i)=>(
                  <div key={i} onClick={()=>r.tab&&setFinTool("etats_"+r.tab)}
                    style={{background:T.surface2,border:`1px solid ${r.color}33`,borderRadius:10,padding:14,cursor:r.tab?"pointer":"default",transition:"all 0.15s"}}
                    onMouseEnter={e=>{if(r.tab)e.currentTarget.style.border=`1px solid ${r.color}77`;}}
                    onMouseLeave={e=>{if(r.tab)e.currentTarget.style.border=`1px solid ${r.color}33`;}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{color:T.text,fontWeight:700,fontSize:12}}>{r.label}</span>
                      <span style={{color:r.color,fontWeight:900,fontSize:20,fontFamily:"monospace"}}>{r.val}</span>
                    </div>
                    <div style={{color:T.textMuted,fontSize:10,marginBottom:2}}>{r.desc}</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:r.color,fontSize:9,fontStyle:"italic"}}>{r.benchmark}</span>
                      {r.tab&&<span style={{color:r.color,fontSize:9,opacity:0.7}}>→ voir détail</span>}
                    </div>
                  </div>
                ))}
                <button onClick={()=>setFinTool("journal")} style={{gridColumn:"span 2",background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                  📝 Saisir ou modifier des écritures comptables
                </button>
              </div>
            )}

            {/* ── TABLEAU DES FLUX DE TRÉSORERIE (TFT SYSCOHADA) ─── */}
            {etatsTab==="tft" && (()=>{
              // ═══════════════════════════════════════════════════════════════
              // TFT SYSCOHADA — Méthode directe + Soldes Intermédiaires
              // ═══════════════════════════════════════════════════════════════

              // ── Soldes Intermédiaires de Gestion (SIG SYSCOHADA) ─────────
              const chiffresAffaires   = produits; // Total produits
              const valeurAjoutee      = chiffresAffaires - (mouvD("60")+mouvD("61")+mouvD("62")+mouvD("63"));
              // EBE = VA - Charges personnel (66+64) = cash-flow opérationnel brut
              const chargesPersonnel   = mouvD("66") + mouvD("64");
              const EBE                = valeurAjoutee - chargesPersonnel;
              const EBIT               = EBE - mouvD("68"); // avant intérêts et impôts
              const EBITDA_marge       = chiffresAffaires > 0 ? (EBE / chiffresAffaires) * 100 : 0;

              // Flux exploitation
              const encClients     = mouvD("411")+mouvD("412")+mouvD("413");
              const decFournis     = mouvC("521")+mouvC("512")+mouvC("571") - mouvC("7");
              const decSalaires    = mouvD("421")+mouvD("422")+mouvD("425");
              const decChargesSoc  = mouvD("431")+mouvD("432")+mouvD("437");
              const decImpots      = mouvD("441")+mouvD("444")+mouvD("447");
              const encAutres      = mouvD("74")+mouvD("75")+mouvD("71");
              // On approxime les flux réels depuis les comptes de tréso mouvementés
              const totalEncExpl   = mouvD("5"); // total encaissements réels
              const totalDecExpl   = mouvC("5"); // total décaissements réels
              const fluxExpl       = totalEncExpl - totalDecExpl;

              // Flux investissement (acquisitions = mouvD cl.2, cessions = mouvC cl.2)
              const acqImmo        = mouvD("21")+mouvD("22")+mouvD("23")+mouvD("24");
              const cessionImmo    = mouvC("82"); // Produits cessions cl.82
              const fluxInvest     = cessionImmo - acqImmo;

              // Flux financement (emprunts reçus = mouvC cl.16, remboursements = mouvD cl.16)
              const empruntsRecus  = mouvC("16")+mouvC("17");
              const rembEmpr       = mouvD("16")+mouvD("17");
              const augCapital     = mouvC("101")+mouvC("102");
              const dividendes     = mouvD("46");
              const fluxFinanc     = empruntsRecus + augCapital - rembEmpr - dividendes;

              const variationTreso = fluxExpl + fluxInvest + fluxFinanc;
              const tresoOuverture = 0; // À paramétrer via solde N-1
              const tresoFermeture = tresoOuverture + variationTreso;

              const FMT3=(v)=>(v>=0?"+":"")+Math.round(v).toLocaleString("fr-FR")+" FCFA";
              const Row=({label,v,bold,indent,color})=>(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${bold?"8px":"5px"} 0`,borderBottom:`1px solid ${T.border}22`,paddingLeft:indent?16:0}}>
                  <span style={{color:bold?"#C9A84C":T.textMuted,fontSize:bold?12:10,fontWeight:bold?800:400}}>{label}</span>
                  <span style={{color:color||(v>=0?"#22C55E":"#EF4444"),fontWeight:bold?800:600,fontSize:bold?13:11,fontFamily:"monospace"}}>{FMT3(v)}</span>
                </div>
              );
              return (
                <div>
                  <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:10,color:"#C9A84C"}}>
                    ℹ️ <strong>TFT SYSCOHADA — Méthode directe</strong> · Les flux sont calculés depuis les écritures du journal OHADA. Encaissements = débits Cl.5 · Décaissements = crédits Cl.5.
                  </div>

                  {/* SIG — Soldes Intermédiaires de Gestion */}
                  <div style={{background:T.surface2,border:"1px solid #A855F733",borderRadius:10,padding:14,marginBottom:14}}>
                    <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:10}}>📊 SOLDES INTERMÉDIAIRES DE GESTION (SIG SYSCOHADA)</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8,marginBottom:8}}>
                      {[
                        {l:"Chiffre d'Affaires",v:chiffresAffaires,c:"#22C55E",desc:"Total produits (Cl.7)"},
                        {l:"Valeur Ajoutée",v:valeurAjoutee,c:"#3B82F6",desc:"CA − achats − services ext."},
                        {l:"EBE",v:EBE,c:EBE>=0?"#C9A84C":"#EF4444",desc:"VA − charges personnel"},
                        {l:"EBIT",v:EBIT,c:EBIT>=0?"#22C55E":"#EF4444",desc:"EBE − amortissements"},
                        {l:"Marge EBE",v:null,c:"#A855F7",desc:`${EBITDA_marge.toFixed(1)}% du CA`,fmt:true},
                      ].map(k=>(
                        <div key={k.l} style={{background:T.surface,border:`1px solid ${k.c}22`,borderRadius:8,padding:"9px 11px"}}>
                          <div style={{color:k.c,fontWeight:900,fontSize:14,fontFamily:"monospace",lineHeight:1}}>
                            {k.fmt ? `${EBITDA_marge.toFixed(1)}%` : (k.v>=0?"+":"")+Math.round(k.v||0).toLocaleString("fr-FR")}
                          </div>
                          <div style={{color:T.text,fontWeight:700,fontSize:10,marginTop:3}}>{k.l}</div>
                          <div style={{color:T.textDim,fontSize:8,marginTop:1}}>{k.desc}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{color:T.textDim,fontSize:9,fontStyle:"italic"}}>EBE &gt; 0 = l'activité génère du cash avant financement · EBE &lt; 0 = risque de trésorerie structurel</div>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                    {[
                      {label:"Flux exploitation",v:fluxExpl,icon:"⚙️",desc:"Activités opérationnelles"},
                      {label:"Flux investissement",v:fluxInvest,icon:"🏗️",desc:"Acquisitions / Cessions"},
                      {label:"Flux financement",v:fluxFinanc,icon:"🏦",desc:"Emprunts / Capital"},
                    ].map(f=>(
                      <div key={f.label} style={{background:T.surface2,border:`2px solid ${f.v>=0?"#22C55E":"#EF4444"}33`,borderRadius:10,padding:12}}>
                        <div style={{fontSize:18,marginBottom:4}}>{f.icon}</div>
                        <div style={{color:f.v>=0?"#22C55E":"#EF4444",fontWeight:900,fontSize:16,fontFamily:"monospace"}}>{FMT3(f.v)}</div>
                        <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{f.label}</div>
                        <div style={{color:T.textDim,fontSize:9}}>{f.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14,marginBottom:14}}>
                    <div style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:10}}>🌊 TABLEAU DES FLUX DE TRÉSORERIE (SYSCOHADA)</div>
                    <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:8,padding:"8px 12px",marginBottom:8}}>
                      <div style={{color:"#22C55E",fontWeight:800,fontSize:11,marginBottom:4}}>A — FLUX NET D'EXPLOITATION</div>
                      <Row label="Total encaissements (Débit Cl.5)" v={totalEncExpl} indent/>
                      <Row label="Total décaissements (Crédit Cl.5)" v={-totalDecExpl} indent/>
                      <Row label="= FLUX NET D'EXPLOITATION" v={fluxExpl} bold/>
                    </div>
                    <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:8}}>
                      <div style={{color:"#3B82F6",fontWeight:800,fontSize:11,marginBottom:4}}>B — FLUX NET D'INVESTISSEMENT</div>
                      <Row label="Acquisitions d'immobilisations (Cl.2 débité)" v={-acqImmo} indent/>
                      <Row label="Produits de cessions (Cl.82 crédité)" v={cessionImmo} indent/>
                      <Row label="= FLUX NET D'INVESTISSEMENT" v={fluxInvest} bold/>
                    </div>
                    <div style={{background:"#A855F711",border:"1px solid #A855F733",borderRadius:8,padding:"8px 12px",marginBottom:8}}>
                      <div style={{color:"#A855F7",fontWeight:800,fontSize:11,marginBottom:4}}>C — FLUX NET DE FINANCEMENT</div>
                      <Row label="Emprunts et concours bancaires reçus (Cl.16)" v={empruntsRecus} indent/>
                      <Row label="Augmentation de capital (Cl.101)" v={augCapital} indent/>
                      <Row label="Remboursements d'emprunts" v={-rembEmpr} indent/>
                      <Row label="Dividendes versés (Cl.46)" v={-dividendes} indent/>
                      <Row label="= FLUX NET DE FINANCEMENT" v={fluxFinanc} bold/>
                    </div>
                    <div style={{background:variationTreso>=0?"#22C55E11":"#EF444411",border:`1px solid ${variationTreso>=0?"#22C55E":"#EF4444"}44`,borderRadius:8,padding:"10px 12px"}}>
                      <Row label="D = A + B + C — VARIATION NETTE DE TRÉSORERIE" v={variationTreso} bold color={variationTreso>=0?"#22C55E":"#EF4444"}/>
                      <Row label="Trésorerie d'ouverture (solde N-1)" v={tresoOuverture} indent color="#C9A84C"/>
                      <Row label="TRÉSORERIE DE CLÔTURE" v={tresoFermeture} bold color={tresoFermeture>=0?"#C9A84C":"#EF4444"}/>
                    </div>
                  </div>
                  {(totalEncExpl===0&&totalDecExpl===0)&&(
                    <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"10px 14px",fontSize:10,color:"#F59E0B",textAlign:"center"}}>
                      ⚠️ Aucune écriture de trésorerie (Cl.5) détectée. Saisissez vos encaissements et décaissements dans le journal OHADA.
                      <button onClick={()=>setFinTool("journal")} style={{display:"block",margin:"6px auto 0",background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:10}}>📝 Journal OHADA</button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── PLAN COMPTABLE CRUD COMPLET ─────────────── */}
            {/* ── ONGLET DIAGNOSTIC SYSCOHADA ─────────────────────────── */}
            {etatsTab==="diagnostic" && (() => {
              const errors   = gcDiagFinancier.filter(a=>a.gravite==="ERROR");
              const warns    = gcDiagFinancier.filter(a=>a.gravite==="WARN");
              const infos    = gcDiagFinancier.filter(a=>a.gravite==="INFO");
              const total    = gcDiagFinancier.length;
              const COLORS   = {INFO:"#3B82F6", WARN:"#F59E0B", ERROR:"#EF4444"};
              const ICONS    = {INFO:"ℹ️", WARN:"⚠️", ERROR:"❌"};
              return (
                <div>
                  {/* Résumé global */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
                    {[
                      {l:"Erreurs critiques",v:errors.length,c:"#EF4444",i:"❌"},
                      {l:"Avertissements",   v:warns.length, c:"#F59E0B",i:"⚠️"},
                      {l:"Points info",      v:infos.length, c:"#3B82F6",i:"ℹ️"},
                    ].map(k=>(
                      <div key={k.l} style={{background:k.c+"12",border:`1px solid ${k.c}33`,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                        <div style={{fontSize:20,marginBottom:4}}>{k.i}</div>
                        <div style={{color:k.c,fontWeight:900,fontSize:22}}>{k.v}</div>
                        <div style={{color:T.textMuted,fontSize:9,marginTop:2}}>{k.l}</div>
                      </div>
                    ))}
                  </div>

                  {total === 0 && (
                    <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:10,padding:"16px 20px",textAlign:"center"}}>
                      <div style={{fontSize:28,marginBottom:8}}>✅</div>
                      <div style={{color:"#22C55E",fontWeight:700,fontSize:13}}>Comptabilité conforme SYSCOHADA</div>
                      <div style={{color:T.textMuted,fontSize:10,marginTop:4}}>Aucune irrégularité détectée · Procédures conformes aux normes OHADA</div>
                    </div>
                  )}

                  {/* Liste des alertes */}
                  {['ERROR','WARN','INFO'].map(gravite => {
                    const items = gcDiagFinancier.filter(a=>a.gravite===gravite);
                    if(items.length===0) return null;
                    const c = COLORS[gravite];
                    return (
                      <div key={gravite} style={{marginBottom:14}}>
                        <div style={{color:c,fontWeight:800,fontSize:10,textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                          <span>{ICONS[gravite]}</span>
                          {gravite==="ERROR"?"Erreurs critiques — Action requise":gravite==="WARN"?"Avertissements — À vérifier":"Points d'information"}
                          <span style={{background:c+"22",borderRadius:99,padding:"1px 8px",fontSize:9}}>{items.length}</span>
                        </div>
                        {items.map((a,i)=>(
                          <div key={i} style={{background:c+"0D",border:`1px solid ${c}33`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                            <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                              <div style={{flex:1}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                                  <span style={{background:c+"22",color:c,borderRadius:5,padding:"2px 7px",fontFamily:"monospace",fontWeight:800,fontSize:9}}>{a.code}</span>
                                  <span style={{color:c,fontWeight:800,fontSize:11}}>{a.titre}</span>
                                </div>
                                <div style={{color:T.textMuted,fontSize:10,lineHeight:1.6}}>{a.detail}</div>
                              </div>
                              {a.compte&&<span style={{background:c+"22",color:c,borderRadius:6,padding:"3px 8px",fontSize:9,fontWeight:700,flexShrink:0,fontFamily:"monospace"}}>{a.compte}</span>}
                            </div>
                            <div style={{background:"#0A1E4A44",borderRadius:7,padding:"8px 12px"}}>
                              <div style={{color:"#C9A84C",fontSize:9,fontWeight:700,textTransform:"uppercase",marginBottom:3}}>💡 Action recommandée</div>
                              <div style={{color:"#CBD5E1",fontSize:10,lineHeight:1.6}}>{a.action}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {/* Bouton IA diagnostic */}
                  {journalEntries.length>0&&(
                    <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Analyse la comptabilité SYSCOHADA/OHADA de Génie Consultant (cabinet de conseil, Libreville, Gabon).\n\nDiagnostic automatique détecté:\n${gcDiagFinancier.map(a=>`[${a.gravite}][${a.code}] ${a.titre}: ${a.detail}`).join('\n')||'Aucune alerte'}\n\nDonnées:\n- ${journalEntries.length} écritures journal\n- Total Actif: ${FMT(totalActif)} FCFA\n- Total Passif: ${FMT(totalPassif)} FCFA\n- Résultat: ${FMT(resultNet)} FCFA (${resultNet>=0?'bénéfice':'perte'})\n- Trésorerie: ${FMT(tresor)} FCFA\n- Capitaux propres: ${FMT(capitaux_propres)} FCFA\n\nFournis: (1) validation du diagnostic, (2) analyse des risques SYSCOHADA, (3) recommandations priorisées, (4) points de vigilance fiscaux Gabon.`)}
                      style={{width:"100%",background:"linear-gradient(135deg,#C9A84C,#D97706)",border:"none",color:"#000",borderRadius:9,padding:"11px",cursor:"pointer",fontWeight:800,fontSize:12,marginTop:4}}>
                      ✨ Analyse IA complète — Diagnostic SYSCOHADA & Conformité OHADA
                    </button>
                  )}
                </div>
              );
            })()}

            {etatsTab==="plan_cpt" && (()=>{
              // FIX v74 — CRUD total : les comptes OHADA standards sont éditables via overrides.
              // FIX v75 — gcGetActivePlan() = source unique pour CRUD + affichage
              const loadOverrides = ()=>{try{return JSON.parse(_lsGet("gc-ohada-overrides")||"[]");}catch(_){return [];}};
              const saveOverrides = v=>{try{_lsSet("gc-ohada-overrides",JSON.stringify(v));dsSave("gc-ohada-overrides",v).catch(err => gcToast.syncError('', err));}catch(_){}};
              const overrides = loadOverrides();
              const allCpt = gcGetActivePlan(); // Plan actif (= base + overrides - masqués + customs)
              const filtered=allCpt.filter(c=>(cptFilter==="all"||String(c.cl)===cptFilter)&&(!cptSearch||(c.num+" "+c.lib).toLowerCase().includes(cptSearch.toLowerCase())));
              // customs = comptes perso qui ne sont PAS dans le plan standard (pour compteur)
              const customs = allCpt.filter(c=>c.custom);

              const handleAddCpt = () => {
                if(!cptForm.num||!cptForm.lib){gcAlert("Numéro et libellé requis.");return;}
                if(allCpt.find(c=>c.num===cptForm.num)){gcAlert("Ce numéro de compte existe déjà.");return;}
                const newC={...cptForm,cl:parseInt(cptForm.cl,10),custom:true};
                saveCustomCpts([...customCpts(),newC]);
                setCptForm({num:"",lib:"",cl:"6",type:"CH"});
                setShowCptForm(false);
                gcAlert(`✅ Compte ${newC.num} ajouté au plan comptable.`);
              };

              const handleEditCpt = () => {
                if(!editCpt||!cptForm.lib){gcAlert("Libellé requis.");return;}
                const isStandard = PLAN_COMPTABLE_OHADA.find(c=>c.num===editCpt);
                if(isStandard){
                  // Store as override
                  const existing=loadOverrides();
                  const updated=[...existing.filter(o=>o.num!==editCpt),{num:editCpt,lib:cptForm.lib,cl:parseInt(cptForm.cl,10),type:cptForm.type,overridden:true}];
                  saveOverrides(updated);
                } else {
                  const existing=customCpts();
                  saveCustomCpts(existing.map(c=>c.num===editCpt?{...c,lib:cptForm.lib,cl:parseInt(cptForm.cl,10),type:cptForm.type}:c));
                }
                setEditCpt(null);setCptForm({num:"",lib:"",cl:"6",type:"CH"});
                gcAlert(`✅ Compte ${editCpt} mis à jour.`);
              };

              const handleDeleteCpt = async (num) => {
                const isStandard = PLAN_COMPTABLE_OHADA.find(c=>c.num===num);
                if(isStandard){
                  if(!await gcConfirm(`⚠️ "${num}" est un compte OHADA standard.\nSupprimer = le retirer du plan actif (il peut être restauré).\nConfirmer ?`))return;
                  // Disable via override with hidden flag
                  const existing=loadOverrides();
                  saveOverrides([...existing.filter(o=>o.num!==num),{num,hidden:true}]);
                  gcAlert(`🗑️ Compte ${num} masqué du plan actif.`);
                } else {
                  if(!await gcConfirm(`Supprimer le compte ${num} ?`))return;
                  saveCustomCpts(customCpts().filter(c=>c.num!==num));
                  gcAlert(`🗑️ Compte ${num} supprimé.`);
                }
              };

              const handleRestoreOverride = (num) => {
                saveOverrides(loadOverrides().filter(o=>o.num!==num));
                gcAlert(`✅ Compte ${num} restauré aux valeurs OHADA d'origine.`);
              };

              const CL_LABELS={1:"Cl.1 Ressources",2:"Cl.2 Immobilisations",3:"Cl.3 Stocks",4:"Cl.4 Tiers",5:"Cl.5 Trésorerie",6:"Cl.6 Charges",7:"Cl.7 Produits",8:"Cl.8 HAO"};
              const TYPE_LABELS={CP:"Capitaux",AI:"Actif Immob.",ST:"Stocks",TI:"Tiers",TR:"Trésorerie",CH:"Charges",PR:"Produits",AUT:"Autres",DLT:"Dettes LT"};
              const hiddenNums = new Set(loadOverrides().filter(o=>o.hidden).map(o=>o.num));
              const visibleFiltered = filtered.filter(c=>!hiddenNums.has(c.num));
              const overriddenCount = overrides.filter(o=>!o.hidden).length;
              const hiddenCount = overrides.filter(o=>o.hidden).length;
              return (
                <div>
                  <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
                    <div style={{flex:1}}>
                      <div style={{color:"#C9A84C",fontWeight:800,fontSize:12}}>⚙️ Plan Comptable OHADA — CRUD complet</div>
                      <div style={{color:T.textDim,fontSize:9,marginTop:2}}>
                        {allCpt.length} comptes actifs · {customs.length} personnalisés · {overriddenCount} modifiés · {hiddenCount} masqués
                      </div>
                    </div>
                    <button onClick={() => {setShowCptForm(!showCptForm);setEditCpt(null);setCptForm({num:"",lib:"",cl:"6",type:"CH"});}}
                      style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                      ➕ Nouveau compte
                    </button>
                  </div>

                  {/* Info CRUD */}
                  <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:7,padding:"7px 12px",marginBottom:10,fontSize:10,color:"#C9A84C"}}>
                    💡 <strong>Tous les comptes sont modifiables</strong> — y compris les comptes OHADA standards pour un meilleur rapprochement réel ou pour besoins d'ajustement et mises à jour. Les modifications sont conservées. Cliquez ✏️ sur n'importe quel compte pour l'éditer.
                  </div>

                  {/* Formulaire ajout/édition */}
                  {(showCptForm||editCpt!==null)&&(
                    <div style={{background:T.surface2,border:`2px solid ${editCpt?"#C9A84C44":"#22C55E44"}`,borderRadius:10,padding:14,marginBottom:12}}>
                      <div style={{color:editCpt?"#C9A84C":"#22C55E",fontWeight:700,fontSize:11,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span>{editCpt?`✏️ Modifier le compte ${editCpt}${PLAN_COMPTABLE_OHADA.find(c=>c.num===editCpt)?" (OHADA standard)":""}`:"➕ Nouveau compte"}</span>
                        {editCpt&&PLAN_COMPTABLE_OHADA.find(c=>c.num===editCpt)&&(
                          <span style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:5,padding:"2px 8px",fontSize:9,color:"#F59E0B",fontWeight:600}}>⚠️ Compte normalisé — modification locale</span>
                        )}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 3fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
                        <div>
                          <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:3}}>N° Compte *</label>
                          <input value={editCpt||cptForm.num} disabled={!!editCpt}
                            onChange={e=>setCptForm(f=>({...f,num:e.target.value}))}
                            placeholder="Ex: 623"
                            style={{width:"100%",background:editCpt?T.surface3:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 9px",color:editCpt?T.textDim:T.text,fontSize:11,boxSizing:"border-box"}} />
                        </div>
                        <div>
                          <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:3}}>Libellé *</label>
                          <input value={cptForm.lib}
                            onChange={e=>setCptForm(f=>({...f,lib:e.target.value}))}
                            placeholder="Ex: Banque locale (571)"
                            style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                        </div>
                        <div>
                          <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:3}}>Classe</label>
                          <select value={cptForm.cl} onChange={e=>setCptForm(f=>({...f,cl:e.target.value}))}
                            style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 6px",color:T.text,fontSize:11}}>
                            {[1,2,3,4,5,6,7,8].map(cl=><option key={cl} value={String(cl)}>{CL_LABELS[cl]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:3}}>Type</label>
                          <select value={cptForm.type} onChange={e=>setCptForm(f=>({...f,type:e.target.value}))}
                            style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 6px",color:T.text,fontSize:11}}>
                            {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        <div style={{display:"flex",gap:5}}>
                          <button onClick={editCpt?handleEditCpt:handleAddCpt}
                            style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>
                            ✅ {editCpt?"Enregistrer":"Ajouter"}
                          </button>
                          <button onClick={() => {setShowCptForm(false);setEditCpt(null);setCptForm({num:"",lib:"",cl:"6",type:"CH"});}}
                            style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 10px",cursor:"pointer",fontSize:11}}>✖</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Filtres + recherche */}
                  <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
                    <input value={cptSearch} onChange={e=>setCptSearch(e.target.value)}
                      placeholder="🔍 Rechercher par n° ou libellé…"
                      style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px",color:T.text,fontSize:11,width:220}} />
                    <select value={cptFilter} onChange={e=>setCptFilter(e.target.value)}
                      style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 8px",color:T.text,fontSize:11}}>
                      <option value="all">Toutes les classes</option>
                      {[1,2,3,4,5,6,7,8].map(cl=><option key={cl} value={String(cl)}>{CL_LABELS[cl]}</option>)}
                    </select>
                    <span style={{color:T.textDim,fontSize:10}}>{visibleFiltered.length} affiché(s)</span>
                    {hiddenCount>0&&<button onClick={()=>setCptFilter("hidden")} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:5,padding:"3px 9px",cursor:"pointer",fontSize:9,fontWeight:700}}>{hiddenCount} masqué(s)</button>}
                  </div>

                  {/* Vue comptes masqués */}
                  {cptFilter==="hidden"&&(
                    <div style={{background:T.surface2,border:"1px solid #F59E0B44",borderRadius:8,padding:12,marginBottom:10}}>
                      <div style={{color:"#F59E0B",fontWeight:700,fontSize:11,marginBottom:8}}>🙈 Comptes masqués ({hiddenCount})</div>
                      {overrides.filter(o=>o.hidden).map(o=>{
                        const orig=PLAN_COMPTABLE_OHADA.find(c=>c.num===o.num)||{};
                        return (
                          <div key={o.num} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}22`}}>
                            <span style={{color:T.text,fontSize:11}}><span style={{fontFamily:"monospace",color:"#C9A84C",fontWeight:700}}>{o.num}</span> — {orig.lib||"?"}</span>
                            <button onClick={()=>handleRestoreOverride(o.num)} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:5,padding:"3px 9px",cursor:"pointer",fontSize:9,fontWeight:700}}>🔁 Restaurer</button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Table des comptes */}
                  <div style={{overflowY:"auto",maxHeight:420,border:`1px solid ${T.border}`,borderRadius:8}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                      <thead style={{position:"sticky",top:0,background:T.surface3,zIndex:1}}>
                        <tr>
                          {["N°","Libellé","Classe","Type","Statut","Actions"].map(h=>(
                            <th key={h} style={{padding:"7px 10px",textAlign:"left",color:T.textMuted,fontWeight:700,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleFiltered.map(c=>{
                          const isStd = !!PLAN_COMPTABLE_OHADA.find(b=>b.num===c.num);
                          const isModified = !!overrides.find(o=>o.num===c.num&&!o.hidden);
                          return (
                            <tr key={c.num} style={{borderBottom:`1px solid ${T.border}22`,background:c.custom?"#C9A84C08":isModified?"#F59E0B06":"transparent"}}>
                              <td style={{padding:"6px 10px",fontFamily:"monospace",fontWeight:800,color:"#C9A84C"}}>{c.num}</td>
                              <td style={{padding:"6px 10px",color:T.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.lib}</td>
                              <td style={{padding:"6px 10px",color:T.textMuted,whiteSpace:"nowrap"}}>{CL_LABELS[c.cl]||`Cl.${c.cl}`}</td>
                              <td style={{padding:"6px 10px"}}><span style={{background:T.surface3,borderRadius:4,padding:"2px 6px",fontSize:9,color:T.textMuted,fontWeight:600}}>{TYPE_LABELS[c.type]||c.type}</span></td>
                              <td style={{padding:"6px 10px"}}>
                                {isModified?<span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700}}>✏️ Modifié</span>
                                  :c.custom?<span style={{background:"#C9A84C22",color:"#C9A84C",borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700}}>🆕 Perso.</span>
                                  :<span style={{color:T.textDim,fontSize:9}}>OHADA</span>}
                              </td>
                              <td style={{padding:"6px 10px"}}>
                                <div style={{display:"flex",gap:4}}>
                                  <button onClick={() => {setEditCpt(c.num);setCptForm({num:c.num,lib:c.lib,cl:String(c.cl),type:c.type||"CH"});setShowCptForm(false);}}
                                    title="Modifier"
                                    style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>✏️</button>
                                  {isModified&&(
                                    <button onClick={()=>handleRestoreOverride(c.num)} title="Restaurer OHADA d'origine"
                                      style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>🔁</button>
                                  )}
                                  <button onClick={()=>handleDeleteCpt(c.num)} title={isStd?"Masquer":"Supprimer"}
                                    style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>{isStd?"🙈":"🗑️"}</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Actions globales */}
                  <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button onClick={() => {const csv=["Numéro,Libellé,Classe,Type,Statut",...allCpt.filter(c=>!hiddenNums.has(c.num)).map(c=>`"${c.num}","${c.lib}","${c.cl}","${c.type}","${c.custom?"Personnalisé":c.overridden?"Modifié":"OHADA Standard"}"`).join("\n")];const b=new Blob(["﻿"+csv.join("\n")],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`plan_comptable_gc_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(u);}}
                      style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>⬇ Exporter CSV</button>
                    {overriddenCount>0&&<button onClick={async () => {if(!await gcConfirm("Réinitialiser toutes les modifications (restaurer le plan OHADA d'origine) ?"))return;saveOverrides([]);gcAlert("✅ Plan comptable restauré.");}}
                      style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>🔁 Tout restaurer</button>}
                    {customs.length>0&&<button onClick={async () => {if(!await gcConfirm("Supprimer tous les comptes personnalisés ?"))return;saveCustomCpts([]);gcAlert("✅ Comptes personnalisés supprimés.");}}
                      style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>🗑️ Effacer personnalisés</button>}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {finTool==="budget" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:"#C9A84C",fontWeight:800,fontSize:13}}>📈 Contrôle Budgétaire — Exercice {new Date().getFullYear()}</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => {const csv=["Poste,Prévisionnel,Réalisé,Écart,Taux",...budgetLines.map(l=>`"${l.poste}",${l.previsionnel},${l.realise},${l.realise-l.previsionnel},${l.previsionnel>0?((l.realise/l.previsionnel)*100).toFixed(1):0}`)].join("\n");const b=new Blob(["\uFEFF"+csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="budget_gc_"+new Date().getFullYear()+".csv";a.click();URL.revokeObjectURL(u);}}
                style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>⬇ Excel</button>
              <button style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}} onClick={() => {if(window.gcAIAsk){const rows=budgetLines.map(function(l){return l.poste+": Prévu "+l.previsionnel.toLocaleString("fr-FR")+" / Réalisé "+l.realise.toLocaleString("fr-FR")+" / Écart "+(l.realise-l.previsionnel).toLocaleString("fr-FR");}).join("\n");window.gcAIAsk("Analyse ce budget et fournis un rapport de contrôle budgétaire avec les écarts significatifs, les causes probables et les recommandations d'actions correctives :\n"+rows);}}}>✨ Analyse IA</button>
            </div>
          </div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{color:"#C9A84C",fontWeight:700,fontSize:11,marginBottom:8}}>➕ Ajouter un poste budgétaire</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8}}>
              <input placeholder="Poste budgétaire" value={budgetForm.poste} onChange={e=>setBudgetForm(f=>({...f,poste:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}} />
              <input type="number" placeholder="Prévisionnel" value={budgetForm.previsionnel} onChange={e=>setBudgetForm(f=>({...f,previsionnel:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}} />
              <input type="number" placeholder="Réalisé" value={budgetForm.realise} onChange={e=>setBudgetForm(f=>({...f,realise:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}} />
              <button onClick={() => {if(!budgetForm.poste)return;
              // FIX v59: validation des montants budgétaires
              if(!budgetForm.poste.trim()){gcAlert("Le libellé du poste est requis."); return;}
              const _prev=parseFloat(budgetForm.previsionnel)||0, _real=parseFloat(budgetForm.realise)||0;
              if(_prev<0||_real<0){gcAlert("Les montants ne peuvent pas être négatifs."); return;}
              if(editingBudgetId){const nl=budgetLines.map(x=>x.id===editingBudgetId?{...x,poste:budgetForm.poste.trim(),previsionnel:_prev,realise:_real}:x);setBudgetLines(nl);try{_lsSet("gc-budget",JSON.stringify(nl));dsSave("gc-budget",nl).catch(err => gcToast.syncError('', err));}catch (_) {};setEditingBudgetId(null);}
              else{const nl=[...budgetLines,{id:Date.now(),poste:budgetForm.poste.trim(),previsionnel:_prev,realise:_real}];setBudgetLines(nl);try{_lsSet("gc-budget",JSON.stringify(nl));dsSave("gc-budget",nl).catch(err => gcToast.syncError('', err));}catch (_) {};}
              setBudgetForm({poste:"",previsionnel:"",realise:""}); playSound("success");}}
                style={{background:"#C9A84C",border:"none",color:"#000",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>+</button>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:T.surface3}}>{["Poste budgétaire","Prévisionnel (FCFA)","Réalisé (FCFA)","Écart","Taux d'exécution","Action"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:h==="Poste budgétaire"?"left":"right",color:T.textMuted,fontWeight:700,fontSize:11,border:`1px solid ${T.border}`}}>{h}</th>)}</tr></thead>
              <tbody>{budgetLines.map(l=>{
                const ecart=l.realise-l.previsionnel;const taux=l.previsionnel>0?(l.realise/l.previsionnel)*100:0;
                return <tr key={l.id} className="gc-tr-hover" style={{borderBottom:`1px solid ${T.border}22`}}>
                  <td style={{padding:"8px 12px",color:T.text,fontWeight:600}}>{l.poste}</td>
                  <td style={{padding:"8px 12px",color:T.textMuted,textAlign:"right"}}>{l.previsionnel.toLocaleString("fr-FR")}</td>
                  <td style={{padding:"8px 12px",color:"#3B82F6",textAlign:"right",fontWeight:600}}>{l.realise.toLocaleString("fr-FR")}</td>
                  <td style={{padding:"8px 12px",color:ecart>=0?"#22C55E":"#EF4444",textAlign:"right",fontWeight:700}}>{ecart>=0?"+":""}{ecart.toLocaleString("fr-FR")}</td>
                  <td style={{padding:"8px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
                      <div style={{width:60,height:6,background:T.surface3,borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(taux,100)}%`,height:"100%",background:taux>100?"#EF4444":taux>80?"#22C55E":"#F59E0B",borderRadius:3}} /></div>
                      <span style={{color:taux>100?"#EF4444":taux>80?"#22C55E":"#F59E0B",fontWeight:700,minWidth:40,textAlign:"right"}}>{taux.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{padding:"8px 12px",textAlign:"right"}}>
                    <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                      <button onClick={() => {setBudgetForm({poste:l.poste,previsionnel:String(l.previsionnel),realise:String(l.realise)});setEditingBudgetId(l.id);}} style={{background:"#3B82F615",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️</button>
                      <button onClick={() => {const n=budgetLines.filter(x=>x.id!==l.id);setBudgetLines(n);try{_lsSet("gc-budget",JSON.stringify(n));dsSave("gc-budget",n).catch(err => gcToast.syncError('', err));}catch (_) {};setEditingBudgetId(null);}} style={{background:"transparent",border:"1px solid #EF444444",color:"#EF4444",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10}}>🗑</button>
                    </div>
                  </td>
                </tr>;
              })}</tbody>
              <tfoot><tr style={{background:"#C9A84C15",fontWeight:700}}>
                <td style={{padding:"8px 12px",color:"#C9A84C"}}>TOTAL</td>
                <td style={{padding:"8px 12px",color:T.textMuted,textAlign:"right"}}>{budgetLines.reduce((a,l)=>a+l.previsionnel,0).toLocaleString("fr-FR")}</td>
                <td style={{padding:"8px 12px",color:"#3B82F6",textAlign:"right",fontWeight:800}}>{budgetLines.reduce((a,l)=>a+l.realise,0).toLocaleString("fr-FR")}</td>
                <td style={{padding:"8px 12px",textAlign:"right",color:budgetLines.reduce((a,l)=>a+l.realise-l.previsionnel,0)>=0?"#22C55E":"#EF4444",fontWeight:800}}>{budgetLines.reduce((a,l)=>a+(l.realise-l.previsionnel),0).toLocaleString("fr-FR")}</td>
                <td colSpan={2}></td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}

      {finTool==="tresorerie" && (()=>{
        // ══════════════════════════════════════════════════════════════════════
        // FIX v73 — TRÉSORERIE CORRIGÉE (SYSCOHADA STRICT)
        // RÈGLE : Encaissement = DÉBIT d'un compte Cl.5 (compteDebit starts "5")
        //         Décaissement = CRÉDIT d'un compte Cl.5 (compteCredit starts "5")
        // L'ancienne version utilisait e.compte (= compteDebit alias) + débit ET crédit
        // sur les mêmes entrées filtrées → un même montant apparaissait dans les deux colonnes
        // ══════════════════════════════════════════════════════════════════════
        const enc5  = journalEntries.reduce((a,e)=> a+((e.compteDebit||e.compte||"").startsWith("5")?parseFloat(e.debit)||0:0),0);
        const dec5  = journalEntries.reduce((a,e)=> a+((e.compteCredit||"").startsWith("5")?parseFloat(e.credit)||0:0),0);
        const solde5 = enc5 - dec5;

        // ── Flux par compte Cl.5 (détail) ──
        const CL5_COMPTES = [
          {num:"511",label:"511 — Effets à encaisser"},
          {num:"512",label:"512 — Banque locale"},
          {num:"514",label:"514 — Chèques à encaisser"},
          {num:"521",label:"521 — Banque (compte courant)"},
          {num:"522",label:"522 — Banque (devise)"},
          {num:"524",label:"524 — Épargne"},
          {num:"531",label:"531 — Chèques postaux"},
          {num:"571",label:"571 — Caisse siège"},
          {num:"572",label:"572 — Caisse agence"},
        ];
        const cl5Detail = CL5_COMPTES.map(c=>{
          const encC = journalEntries.reduce((a,e)=>a+((e.compteDebit||e.compte||"").startsWith(c.num)?parseFloat(e.debit)||0:0),0);
          const decC = journalEntries.reduce((a,e)=>a+((e.compteCredit||"").startsWith(c.num)?parseFloat(e.credit)||0:0),0);
          return {...c, enc:encC, dec:decC, solde:encC-decC};
        }).filter(c=>c.enc>0||c.dec>0);

        // ── Flux mensuels réels depuis journal ──
        const now = new Date();
        const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
        const monthlyFlux = Array.from({length:12},(_,mi)=>{
          const yr = now.getFullYear();
          const prefix = `${yr}-${String(mi+1).padStart(2,"0")}`;
          const mEnc = journalEntries.filter(e=>e.addedAt?.startsWith(prefix)||(e.date||"").startsWith(prefix))
            .reduce((a,e)=>a+((e.compteDebit||e.compte||"").startsWith("5")?parseFloat(e.debit)||0:0),0);
          const mDec = journalEntries.filter(e=>e.addedAt?.startsWith(prefix)||(e.date||"").startsWith(prefix))
            .reduce((a,e)=>a+((e.compteCredit||"").startsWith("5")?parseFloat(e.credit)||0:0),0);
          return {m:MONTHS_FR[mi], enc:mEnc, dec:mDec, net:mEnc-mDec};
        });
        const cumulatif = monthlyFlux.reduce((acc,m,i)=>{
          const prev=i>0?acc[i-1].cumul:0;
          acc.push({...m,cumul:prev+m.net});
          return acc;
        },[]);
        const hasRealData = journalEntries.some(e=>(e.compteDebit||e.compte||"").startsWith("5")||(e.compteCredit||"").startsWith("5"));

        // ── Ratios trésorerie ──
        const chargesFixesMens = journalEntries.filter(e=>(e.compteDebit||e.compte||"").startsWith("6"))
          .reduce((a,e)=>a+(parseFloat(e.debit)||0),0)/Math.max(1,12);
        const daysRun = chargesFixesMens>0?Math.round(solde5/chargesFixesMens*30):null;

        const FMT2=(v)=>Math.round(v).toLocaleString("fr-FR");
        return (
          <div>
            {/* Règle pédagogique */}
            <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:10,color:"#3B82F6"}}>
              ℹ️ <strong>Règle SYSCOHADA stricte :</strong> Encaissement = compte Cl.5 <em>débité</em> (fonds entrants) · Décaissement = compte Cl.5 <em>crédité</em> (fonds sortants). Aucun montant ne peut apparaître dans les deux colonnes.
              <button onClick={()=>setFinTool("journal")} style={{marginLeft:8,background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>📝 Saisir des écritures</button>
            </div>
            {/* KPI TRÉSORERIE */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[
                {label:"Total Encaissements",v:enc5,color:"#22C55E",icon:"📈",sub:"Débits Cl.5"},
                {label:"Total Décaissements",v:dec5,color:"#EF4444",icon:"📉",sub:"Crédits Cl.5"},
                {label:"Solde net de trésorerie",v:solde5,color:solde5>=0?"#C9A84C":"#EF4444",icon:"💰",sub:solde5>=0?"Excédentaire":"⚠️ Déficitaire"},
              ].map(kpi=>(
                <div key={kpi.label} style={{background:T.surface2,border:`2px solid ${kpi.color}44`,borderRadius:12,padding:"16px"}}>
                  <div style={{fontSize:22,marginBottom:6}}>{kpi.icon}</div>
                  <div style={{color:kpi.color,fontWeight:900,fontSize:20,fontFamily:"monospace"}}>{kpi.v>=0?"":"-"}{FMT2(Math.abs(kpi.v))}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:3}}>{kpi.label}</div>
                  <div style={{color:kpi.color,fontSize:9,marginTop:2,fontWeight:700}}>{kpi.sub} · FCFA</div>
                </div>
              ))}
            </div>
            {daysRun!==null&&<div style={{background:"#A855F711",border:"1px solid #A855F733",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:11,color:"#A855F7",display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:16}}>🏃</span>
              <span><strong>Autonomie de trésorerie estimée :</strong> {daysRun} jours de charges fixes couverts par le solde actuel</span>
            </div>}
            {/* DÉTAIL PAR COMPTE */}
            {cl5Detail.length>0&&(
              <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14,marginBottom:14}}>
                <div style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:10}}>💳 Soldes par compte de trésorerie</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{background:T.surface3}}>
                    {["Compte","Encaissements (Débit)","Décaissements (Crédit)","Solde net"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:h==="Compte"?"left":"right",color:T.textMuted,fontSize:10,fontWeight:700,border:`1px solid ${T.border}`}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {cl5Detail.map(c=>(
                      <tr key={c.num} className="gc-tr-hover">
                        <td style={{padding:"6px 10px",color:T.text,fontWeight:600,border:`1px solid ${T.border}22`}}>{c.label}</td>
                        <td style={{padding:"6px 10px",textAlign:"right",color:"#22C55E",fontFamily:"monospace",border:`1px solid ${T.border}22`}}>+{FMT2(c.enc)}</td>
                        <td style={{padding:"6px 10px",textAlign:"right",color:"#EF4444",fontFamily:"monospace",border:`1px solid ${T.border}22`}}>-{FMT2(c.dec)}</td>
                        <td style={{padding:"6px 10px",textAlign:"right",color:c.solde>=0?"#22C55E":"#EF4444",fontFamily:"monospace",fontWeight:700,border:`1px solid ${T.border}22`}}>{c.solde>=0?"+":""}{FMT2(c.solde)}</td>
                      </tr>
                    ))}
                    <tr style={{background:T.surface3,fontWeight:900}}>
                      <td style={{padding:"7px 10px",color:"#C9A84C",fontWeight:800}}>TOTAL CL.5</td>
                      <td style={{padding:"7px 10px",textAlign:"right",color:"#22C55E",fontFamily:"monospace",fontWeight:800}}>+{FMT2(enc5)}</td>
                      <td style={{padding:"7px 10px",textAlign:"right",color:"#EF4444",fontFamily:"monospace",fontWeight:800}}>-{FMT2(dec5)}</td>
                      <td style={{padding:"7px 10px",textAlign:"right",color:solde5>=0?"#22C55E":"#EF4444",fontFamily:"monospace",fontWeight:900}}>{solde5>=0?"+":""}{FMT2(solde5)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {/* FLUX MENSUELS */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{color:"#C9A84C",fontWeight:700,fontSize:12,marginBottom:10}}>📅 Flux mensuels {new Date().getFullYear()} {!hasRealData&&<span style={{color:"#F59E0B",fontSize:10,fontWeight:500}}>— Aucun mouvement Cl.5 enregistré</span>}</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,minWidth:700}}>
                  <thead><tr style={{background:T.surface3}}>
                    {["Mois","Encaissements","Décaissements","Net du mois","Cumul"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:h==="Mois"?"left":"right",color:T.textMuted,fontWeight:700,border:`1px solid ${T.border}22`}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {cumulatif.map((r,i)=>(
                      <tr key={i} className="gc-tr-hover" style={{opacity:r.enc===0&&r.dec===0?0.45:1}}>
                        <td style={{padding:"5px 8px",color:T.text,fontWeight:600}}>{r.m}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",color:"#22C55E",fontFamily:"monospace"}}>{r.enc>0?"+"+FMT2(r.enc):"—"}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",color:"#EF4444",fontFamily:"monospace"}}>{r.dec>0?"-"+FMT2(r.dec):"—"}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",color:r.net>0?"#22C55E":r.net<0?"#EF4444":T.textMuted,fontFamily:"monospace",fontWeight:600}}>{r.net===0?"—":(r.net>0?"+":"")+FMT2(r.net)}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",color:r.cumul>=0?"#C9A84C":"#EF4444",fontFamily:"monospace",fontWeight:700}}>{(r.cumul>=0?"+":"")+FMT2(r.cumul)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Analyse le flux de trésorerie mensuel suivant pour un cabinet de conseil (Génie Consultant, Libreville) et fournis : diagnostic, risques, recommandations et prévisions S2:\nEncaissements YTD: ${FMT2(enc5)} FCFA\nDécaissements YTD: ${FMT2(dec5)} FCFA\nSolde net: ${FMT2(solde5)} FCFA`)}
                style={{width:"100%",background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:7,padding:"8px",cursor:"pointer",fontWeight:700,fontSize:12,marginTop:10}}>✨ Analyse IA & prévisions 12 mois</button>
            </div>
            {!hasRealData&&(
              <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"12px 14px",fontSize:10,color:"#F59E0B",textAlign:"center"}}>
                ⚠️ Aucune écriture de trésorerie détectée. Saisissez des écritures dans le <strong>Journal OHADA</strong> en utilisant les comptes de classe 5 (512, 521, 571...) en débit pour les encaissements et en crédit pour les décaissements.
                <button onClick={()=>setFinTool("journal")} style={{display:"block",margin:"8px auto 0",background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:10}}>📝 Ouvrir le journal OHADA</button>
              </div>
            )}
          </div>
        );
      })()}

      {finTool==="tva" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* Colonne gauche — Calculateur + Déclaration réelle */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
              <div style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:10}}>🧾 Calculateur TVA — Gabon</div>
              {[{k:"ht",l:"Montant HT (FCFA)"},{k:"taux",l:"Taux TVA"}].map(({k,l})=>(
                <div key={k} style={{marginBottom:8}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>{l}</label>
                  {k==="taux"?
                    <select value={tvaForm[k]} onChange={e=>setTvaForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}}>
                      {[{v:"18",l:"18% — Taux standard Gabon"},{v:"0",l:"0% — Exonéré"},{v:"10",l:"10% — Taux réduit"}].map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                    </select> :
                    <input type="number" value={tvaForm[k]} onChange={e=>setTvaForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}} />
                  }
                </div>
              ))}
              <button onClick={() => {const ht=parseFloat(tvaForm.ht)||0;const taux=parseFloat(tvaForm.taux)||0;const tva=ht*taux/100;setTvaForm(f=>({...f,tva:tva.toFixed(0),ttc:(ht+tva).toFixed(0)}));}}
                style={{background:"#C9A84C",border:"none",color:"#000",borderRadius:7,padding:"9px",cursor:"pointer",fontWeight:700,fontSize:12,width:"100%",marginBottom:10}}>Calculer</button>
              {tvaForm.tva && <div style={{background:"#C9A84C15",border:"1px solid #C9A84C33",borderRadius:8,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:T.textMuted,fontSize:11}}>Montant HT</span><span style={{color:T.text,fontWeight:700}}>{parseFloat(tvaForm.ht).toLocaleString("fr-FR")} FCFA</span></div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:T.textMuted,fontSize:11}}>TVA ({tvaForm.taux}%)</span><span style={{color:"#F59E0B",fontWeight:700}}>{parseFloat(tvaForm.tva).toLocaleString("fr-FR")} FCFA</span></div>
                <div style={{display:"flex",justifyContent:"space-between",paddingTop:6,borderTop:`1px solid #C9A84C33`}}><span style={{color:"#C9A84C",fontWeight:800,fontSize:13}}>TOTAL TTC</span><span style={{color:"#C9A84C",fontWeight:900,fontSize:16}}>{parseFloat(tvaForm.ttc).toLocaleString("fr-FR")} FCFA</span></div>
              </div>}
            </div>

            {/* Déclaration TVA depuis le journal — données réelles */}
            {(()=>{
              const tvaCollectee  = journalEntries.reduce((s,e)=>{
                const c=e.compteCredit||""; const d=e.compteDebit||e.compte||"";
                if(c.startsWith("4431")||c.startsWith("4432")||c.startsWith("4436")) return s+(parseFloat(e.credit)||0);
                if(d.startsWith("4431")||d.startsWith("4432")||d.startsWith("4436")) return s-(parseFloat(e.debit)||0);
                return s;
              },0);
              const tvaDeductible = journalEntries.reduce((s,e)=>{
                const d=e.compteDebit||e.compte||""; const c=e.compteCredit||"";
                if(d.startsWith("4451")||d.startsWith("4452")||d.startsWith("4456")) return s+(parseFloat(e.debit)||0);
                if(c.startsWith("4451")||c.startsWith("4452")||c.startsWith("4456")) return s-(parseFloat(e.credit)||0);
                return s;
              },0);
              const tvaDue = Math.max(0, tvaCollectee - tvaDeductible);
              const creditTva = tvaCollectee < tvaDeductible ? Math.abs(tvaCollectee - tvaDeductible) : 0;
              if(tvaCollectee===0&&tvaDeductible===0) return (
                <div style={{background:T.surface2,border:"1px solid #3B82F633",borderRadius:10,padding:12,fontSize:10,color:T.textMuted,textAlign:"center"}}>
                  ℹ️ Aucun compte TVA (4431/4451) trouvé dans le journal.<br/>Saisissez les écritures avec les comptes TVA pour voir la déclaration automatique.
                </div>
              );
              return (
                <div style={{background:T.surface2,border:"1px solid #3B82F633",borderRadius:10,padding:14}}>
                  <div style={{color:"#3B82F6",fontWeight:800,fontSize:12,marginBottom:10}}>📊 Déclaration TVA — Données journal réel</div>
                  {[
                    {l:"TVA collectée (Cl.4431-4436)",v:tvaCollectee,c:"#EF4444"},
                    {l:"TVA déductible (Cl.4451-4456)",v:tvaDeductible,c:"#22C55E"},
                    {l:tvaDue>0?"TVA nette due":"Crédit de TVA",v:tvaDue||creditTva,c:tvaDue>0?"#F59E0B":"#3B82F6"},
                  ].map(r=>(
                    <div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}22`}}>
                      <span style={{color:T.textMuted,fontSize:10}}>{r.l}</span>
                      <span style={{color:r.c,fontWeight:700,fontFamily:"monospace",fontSize:11}}>{Math.round(r.v).toLocaleString("fr-FR")} F</span>
                    </div>
                  ))}
                  {tvaDue>0&&<button onClick={() => {
                    const e={id:"JE-TVA-"+Date.now(),date:new Date().toISOString().split("T")[0],piece:"TVA-"+new Date().toISOString().slice(0,7),libelle:"Règlement TVA — "+(new Date().toLocaleDateString("fr-FR",{month:"long",year:"numeric"})),compteDebit:"4431",compteCredit:"521",debit:tvaDue,credit:tvaDue,tiers:"DGI Gabon",dossierId:""};
                    const upd=[...journalEntries,e];setJournalEntries(upd);try{_lsSet("gc-journal",JSON.stringify(upd.slice(0,500)));dsSave("gc-journal",upd.slice(0,500)).catch(err => gcToast.syncError('', err));}catch(_){}
                    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"🧾",message:`Règlement TVA enregistré : ${Math.round(tvaDue).toLocaleString("fr-FR")} FCFA → D:4431 C:521`,at:new Date().toISOString(),read:false},...p]);
                  }} style={{width:"100%",marginTop:8,background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:7,padding:"7px",cursor:"pointer",fontWeight:700,fontSize:10}}>
                    📝 Enregistrer le règlement TVA en journal
                  </button>}
                </div>
              );
            })()}
          </div>

          {/* Colonne droite — Calendrier fiscal */}
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
            <div style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:10}}>📅 Calendrier fiscal Gabon</div>
            {[{date:"15 du mois",label:"Déclaration TVA mensuelle",icon:"🧾",urgent:true},{date:"31 Mars",label:"Clôture exercice / Bilan",icon:"📊",urgent:false},{date:"30 Avril",label:"Déclaration IS (Impôt sur les Sociétés)",icon:"💰",urgent:false},{date:"30 Avril",label:"DSF — Déclaration Statistique et Fiscale",icon:"📋",urgent:false},{date:"30 Juin",label:"Déclarations IRPP",icon:"👤",urgent:false},{date:"31 Déc",label:"Patente annuelle",icon:"🏢",urgent:false}].map((o,i)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}22`}}>
                <span style={{fontSize:16}}>{o.icon}</span>
                <div style={{flex:1}}>
                  <div style={{color:T.text,fontSize:11,fontWeight:600}}>{o.label}</div>
                  <div style={{color:o.urgent?"#F59E0B":T.textMuted,fontSize:10}}>{o.date}</div>
                </div>
                {o.urgent&&<span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>MENSUEL</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {finTool==="indicateurs" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
            {(() => {
              const ca=dossiers.reduce((a,d)=>a+(d.amount||0),0);
              const caRealise=dossiers.filter(d=>d.status==="TERMINE").reduce((a,d)=>a+(d.amount||0),0);
              const charges=budgetLines.reduce((a,l)=>a+l.realise,0);
              const margeB=ca>0?((caRealise-charges)/caRealise*100):0;
              return [
                {label:"CA Total",v:ca,unit:"FCFA",color:"#C9A84C",icon:"💰",suffix:"M",divisor:1000000},
                {label:"CA Réalisé",v:caRealise,unit:"FCFA",color:"#22C55E",icon:"✅",suffix:"M",divisor:1000000},
                {label:"Marge brute estimée",v:margeB,unit:"%",color:margeB>20?"#22C55E":margeB>10?"#F59E0B":"#EF4444",icon:"📊",suffix:"",divisor:1},
                {label:"Dossiers actifs",v:dossiers.filter(d=>d.status!=="TERMINE").length,unit:"",color:"#3B82F6",icon:"📁",suffix:"",divisor:1},
                {label:"Charges totales",v:charges,unit:"FCFA",color:"#EF4444",icon:"📉",suffix:"M",divisor:1000000},
                {label:"Taux recouvrement",v:ca>0?(caRealise/ca*100):0,unit:"%",color:"#A855F7",icon:"🔄",suffix:"",divisor:1},
              ].map(kpi=>(
                <div key={kpi.label} style={{background:T.surface2,border:`2px solid ${kpi.color}33`,borderRadius:12,padding:"14px 16px",position:"relative",overflow:"hidden"}}>
                  <div className="gc-shimmer" style={{position:"absolute",inset:0,opacity:0.3}} />
                  <div style={{fontSize:22,marginBottom:4}}>{kpi.icon}</div>
                  <div style={{color:kpi.color,fontWeight:900,fontSize:22,lineHeight:1}}>
                    {kpi.divisor>1?(kpi.v/kpi.divisor).toFixed(1)+kpi.suffix:kpi.v.toFixed(kpi.unit==="%"?1:0)}{kpi.unit}
                  </div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:4}}>{kpi.label}</div>
                </div>
              ));
            })()}
          </div>
          <button style={{background:"linear-gradient(135deg,#C9A84C,#E2B96A)",border:"none",color:"#000",borderRadius:9,padding:"10px 24px",cursor:"pointer",fontWeight:700,fontSize:12}} onClick={() => {if(window.gcAIAsk){const caTotal=dossiers.reduce(function(a,d){return a+(d.amount||0);},0).toLocaleString("fr-FR");const actifs=dossiers.filter(function(d){return d.status!=="TERMINE";}).length;const charges=budgetLines.reduce(function(a,l){return a+l.realise;},0).toLocaleString("fr-FR");window.gcAIAsk("Analyse ces indicateurs financiers pour le cabinet Génie Consultant et génère un rapport de performance financière avec des recommandations stratégiques :\n- CA Total: "+caTotal+" FCFA\n- Dossiers actifs: "+actifs+"\n- Budget charges: "+charges+" FCFA");}}}>✨ Rapport de performance financière avec IA</button>
        </div>
      )}

      {finTool==="rh_charges" && (
        <div>
          <div style={{background:"#A855F715",border:"1px solid #A855F733",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1}}>
              <div style={{color:T.text,fontSize:11}}>👥 <strong>Charges salariales RH</strong> — Données réelles issues du SIRH · Bulletins de paie transmis</div>
            </div>
            <button onClick={()=>setFinTool("journal")} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>→ Journal</button>
          </div>
          {(() => {
            // Lire les vrais bulletins depuis gc-paie-transferts (source SIRH)
            const bulletins = (()=>{ try{ return JSON.parse(_lsGet("gc-paie-transferts")||"[]"); }catch(_){ return []; } })();
            const taux_paie = (()=>{ try{ return JSON.parse(_lsGet("gc-paie-taux")||"null")||{cnss_sal:2.5,cnss_pat:17.5,cnamgs_sal:1.5,cnamgs_pat:4.1}; }catch(_){ return {cnss_sal:2.5,cnss_pat:17.5,cnamgs_sal:1.5,cnamgs_pat:4.1}; } })();
            const rh_users = users.filter(u=>_activeUser(u)&&!u.isAdmin&&u.level>=1);

            // Calculs depuis bulletins réels
            const hasBulletins = bulletins.length > 0;
            const masseBrute   = hasBulletins
              ? bulletins.reduce((s,b)=>s+(parseFloat(b.brut)||0),0)
              : rh_users.length * 350000; // fallback estimatif

            const cnssPatron  = masseBrute * (taux_paie.cnss_pat/100);
            const cnamgsPatron= masseBrute * (taux_paie.cnamgs_pat/100);
            const cnssSalarial= masseBrute * (taux_paie.cnss_sal/100);
            const chargesTotal= masseBrute + cnssPatron + cnamgsPatron;
            const effectif    = hasBulletins ? new Set(bulletins.map(b=>b.empId)).size : rh_users.length;

            // Regrouper par collaborateur (dernier bulletin)
            const parCollab = {};
            bulletins.forEach(b=>{
              if(!parCollab[b.empId]||new Date(b.at)>new Date(parCollab[b.empId].at))
                parCollab[b.empId] = b;
            });

            return (
              <div>
                {!hasBulletins&&(
                  <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:10,color:"#F59E0B"}}>
                    ⚠️ Aucun bulletin de paie transmis depuis le SIRH — données estimées (350 000 FCFA/collab.) · <button onClick={() => {}} style={{background:"none",border:"none",color:"#F59E0B",cursor:"pointer",fontWeight:700,fontSize:10,textDecoration:"underline"}}>Allez dans SIRH → Paie pour saisir les bulletins</button>
                  </div>
                )}
                {/* KPI Cards */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
                  {[
                    {label:"Masse salariale brute",  v:masseBrute,   color:"#A855F7", sub:hasBulletins?`${effectif} bulletins réels`:`${effectif} collab. estimés`},
                    {label:`CNSS patronal (${taux_paie.cnss_pat}%)`,v:cnssPatron,color:"#EF4444",sub:"Charge employeur"},
                    {label:`CNAMGS patronal (${taux_paie.cnamgs_pat}%)`,v:cnamgsPatron,color:"#F97316",sub:"Couverture maladie"},
                    {label:"Total charges employeur",v:chargesTotal,color:"#C9A84C",sub:"Brut + cotisations"},
                  ].map(c=>(
                    <div key={c.label} style={{background:T.surface2,border:`1px solid ${c.color}33`,borderRadius:10,padding:"12px"}}>
                      <div style={{color:c.color,fontWeight:900,fontSize:15,fontFamily:"monospace"}}>{Math.round(c.v).toLocaleString("fr-FR")}</div>
                      <div style={{color:T.textMuted,fontSize:9,marginTop:3}}>{c.label} (FCFA)</div>
                      <div style={{color:T.textDim,fontSize:8,marginTop:1}}>{c.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Tableau collaborateurs — données réelles si disponibles */}
                <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14,marginBottom:12}}>
                  <div style={{color:"#A855F7",fontWeight:700,fontSize:12,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>📋 {hasBulletins?"Derniers bulletins de paie (SIRH réel)":"Estimation masse salariale"}</span>
                    <span style={{color:T.textDim,fontSize:9}}>{hasBulletins?`${bulletins.length} bulletin(s) total`:"Données estimées"}</span>
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead><tr style={{background:T.surface3}}>{["Collaborateur","Département","Brut (FCFA)","CNSS salarié","CNAMGS sal.","Net versé","Période"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:T.textMuted,fontWeight:700,fontSize:9,border:`1px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {hasBulletins
                        ? Object.values(parCollab).slice(0,15).map((b,i)=>{
                            const brut=parseFloat(b.brut)||0;
                            const cnss_s=brut*(taux_paie.cnss_sal/100);
                            const cnamgs_s=brut*(taux_paie.cnamgs_sal/100);
                            const net=parseFloat(b.net)||brut-cnss_s-cnamgs_s;
                            return <tr key={i} className="gc-tr-hover">
                              <td style={{padding:"6px 10px"}}><div style={{color:T.text,fontWeight:600,fontSize:11}}>{b.empName||"—"}</div></td>
                              <td style={{padding:"6px 10px",color:T.textMuted,fontSize:10}}>{users.find(u=>u.id===b.empId)?.dept||"—"}</td>
                              <td style={{padding:"6px 10px",color:"#3B82F6",textAlign:"right",fontWeight:700,fontFamily:"monospace"}}>{Math.round(brut).toLocaleString("fr-FR")}</td>
                              <td style={{padding:"6px 10px",color:"#F97316",textAlign:"right",fontFamily:"monospace"}}>{Math.round(cnss_s).toLocaleString("fr-FR")}</td>
                              <td style={{padding:"6px 10px",color:"#F97316",textAlign:"right",fontFamily:"monospace"}}>{Math.round(cnamgs_s).toLocaleString("fr-FR")}</td>
                              <td style={{padding:"6px 10px",color:"#22C55E",textAlign:"right",fontWeight:700,fontFamily:"monospace"}}>{Math.round(net).toLocaleString("fr-FR")}</td>
                              <td style={{padding:"6px 10px",color:T.textDim,fontSize:9}}>{b.periode||b.at?.slice(0,7)||"—"}</td>
                            </tr>;
                          })
                        : rh_users.slice(0,10).map((u,i)=>{
                            const brut=350000, cnss=brut*(taux_paie.cnss_sal/100), cnamgs=brut*(taux_paie.cnamgs_sal/100), net=brut-cnss-cnamgs;
                            return <tr key={i} className="gc-tr-hover">
                              <td style={{padding:"6px 10px"}}><div style={{color:T.text,fontWeight:600}}>{u.name}</div><div style={{color:"#F59E0B",fontSize:8}}>estimé</div></td>
                              <td style={{padding:"6px 10px",color:T.textMuted}}>{u.dept||"—"}</td>
                              <td style={{padding:"6px 10px",color:"#3B82F6",textAlign:"right",fontFamily:"monospace"}}>{brut.toLocaleString("fr-FR")}</td>
                              <td style={{padding:"6px 10px",color:"#F97316",textAlign:"right",fontFamily:"monospace"}}>{Math.round(cnss).toLocaleString("fr-FR")}</td>
                              <td style={{padding:"6px 10px",color:"#F97316",textAlign:"right",fontFamily:"monospace"}}>{Math.round(cnamgs).toLocaleString("fr-FR")}</td>
                              <td style={{padding:"6px 10px",color:"#22C55E",textAlign:"right",fontFamily:"monospace"}}>{Math.round(net).toLocaleString("fr-FR")}</td>
                              <td style={{padding:"6px 10px",color:T.textDim,fontSize:9}}>—</td>
                            </tr>;
                          })
                      }
                    </tbody>
                    <tfoot><tr style={{background:T.surface3}}>
                      <td colSpan="2" style={{padding:"7px 10px",color:"#C9A84C",fontWeight:800,fontSize:11}}>TOTAL MASSE SALARIALE</td>
                      <td style={{padding:"7px 10px",color:"#C9A84C",fontWeight:900,textAlign:"right",fontFamily:"monospace"}}>{Math.round(masseBrute).toLocaleString("fr-FR")}</td>
                      <td colSpan="2" style={{padding:"7px 10px",color:"#EF4444",fontWeight:700,textAlign:"right",fontSize:9}}>Charges pat. tot.: {Math.round(cnssPatron+cnamgsPatron).toLocaleString("fr-FR")}</td>
                      <td colSpan="2" style={{padding:"7px 10px",color:"#C9A84C",fontWeight:900,textAlign:"right",fontFamily:"monospace"}}>{Math.round(chargesTotal).toLocaleString("fr-FR")}</td>
                    </tr></tfoot>
                  </table>
                </div>

                {/* Actions */}
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={() => {
                    const row=budgetLines.find(l=>l.poste==="Charges salariales");
                    const updated=row?budgetLines.map(l=>l.poste==="Charges salariales"?{...l,realise:chargesTotal}:l):[...budgetLines,{id:Date.now(),poste:"Charges salariales",previsionnel:chargesTotal*12,realise:chargesTotal}];
                    setBudgetLines(updated);try{_lsSet("gc-budget",JSON.stringify(updated));dsSave("gc-budget",updated).catch(err => gcToast.syncError('', err));}catch (_) {}
                    setFinTool("budget");
                    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"👥",message:`Charges salariales intégrées au budget: ${Math.round(chargesTotal).toLocaleString("fr-FR")} FCFA`,at:new Date().toISOString(),read:false},...p]);
                  }} style={{background:"linear-gradient(135deg,#A855F7,#9333EA)",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                    📊 Intégrer au Budget Finance
                  </button>
                  <button onClick={() => {
                    // Générer écriture journal 64/66
                    const ecriture={id:"JE-RH-"+Date.now(),date:new Date().toISOString().split("T")[0],piece:"PAY-"+new Date().toISOString().slice(0,7),libelle:"Charges salariales — "+new Date().toLocaleDateString("fr-FR",{month:"long",year:"numeric"}),compteDebit:"66",compteCredit:"421",debit:masseBrute,credit:masseBrute,tiers:"Personnel",dossierId:""};
                    const ecriturePatron={id:"JE-RH-PAT-"+Date.now(),date:ecriture.date,piece:ecriture.piece,libelle:"Charges sociales patronales (CNSS+CNAMGS)",compteDebit:"64",compteCredit:"431",debit:cnssPatron+cnamgsPatron,credit:cnssPatron+cnamgsPatron,tiers:"CNSS/CNAMGS",dossierId:""};
                    const updated=[...journalEntries,ecriture,ecriturePatron];
                    setJournalEntries(updated);try{_lsSet("gc-journal",JSON.stringify(updated.slice(0,500)));dsSave("gc-journal",updated.slice(0,500)).catch(err => gcToast.syncError('', err));}catch (_) {}
                    setFinTool("journal");
                    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📒",message:"Écritures salariales générées : D:66 C:421 + D:64 C:431",at:new Date().toISOString(),read:false},...p]);
                  }} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                    📒 Générer les écritures journal (Cl.64/66)
                  </button>
                  <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Analyse la masse salariale de Génie Consultant (cabinet conseil, Libreville, Gabon):\n- Effectif: ${effectif} collaborateurs\n- Masse salariale brute: ${Math.round(masseBrute).toLocaleString("fr-FR")} FCFA/mois\n- CNSS patronal (${taux_paie.cnss_pat}%): ${Math.round(cnssPatron).toLocaleString("fr-FR")} FCFA\n- CNAMGS patronal (${taux_paie.cnamgs_pat}%): ${Math.round(cnamgsPatron).toLocaleString("fr-FR")} FCFA\n- Total charges employeur: ${Math.round(chargesTotal).toLocaleString("fr-FR")} FCFA\n\nFournis: (1) analyse du ratio charges/CA, (2) benchmark secteur conseil Gabon/CEMAC, (3) recommandations d'optimisation RH, (4) conformité droit gabonais du travail.`)}
                    style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                    ✨ Analyse RH avec IA
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── RÉFÉRENTIELS OHADA ──────────────────────────────── */}
      {finTool==="ohada_ref" && <OHADARefApp T={T} currentUser={currentUser} journalEntries={journalEntries} setJournalEntries={setJournalEntries} setJournalForm={setJournalForm} setFinTool={setFinTool} setNotifications={setNotifications} />}
      {/* v99 — Facturation intégrée dans l'onglet Finance */}
      {finTool==="facturation_s01" && (
        <FacturationModule
          T={T} currentUser={currentUser}
          dossiers={dossiers} partners={partners||[]}
          journalEntries={journalEntries} setJournalEntries={setJournalEntries}
          setJournalForm={setJournalForm} setFinTool={setFinTool}
          setNotifications={setNotifications}
        />
      )}
      {finTool==="config_fiscale" && (
        <div style={{padding:"16px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"12px 16px",background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:10}}>
            <span style={{fontSize:20}}>⚙️</span>
            <div>
              <div style={{color:T.text,fontWeight:800,fontSize:13}}>Configuration Fiscale OHADA</div>
              <div style={{color:T.textMuted,fontSize:11}}>Paramètres TVA, IS, IRPP et autres taux applicables au Gabon · Finance & Comptabilité</div>
            </div>
          </div>
          <FiscalConfigPanel T={T} currentUser={currentUser} />
        </div>
      )}
    </div>
  );

  // v104 — Facturation uniquement dans Finance & Comptabilité (S01)
  // La Facturation standalone Bureau est supprimée — redirection directe vers Finance → onglet Facturation
  if (activeApp === "facturation") {
    setTimeout(() => {
      setActiveApp("finance");
      if (setFinTool) setFinTool("facturation_s01");
    }, 0);
    return (
      <div>
        <AppHeader icon="💰" title="Facturation & Honoraires" color="#C9A84C" />
        <div style={{background:"#C9A84C0D",border:"1px solid #C9A84C33",borderRadius:12,padding:"28px 32px",textAlign:"center",marginTop:8}}>
          <div style={{fontSize:40,marginBottom:10}}>💰</div>
          <div style={{color:T.text,fontWeight:900,fontSize:15,marginBottom:8}}>Facturation & Honoraires</div>
          <div style={{color:T.textMuted,fontSize:12,marginBottom:20,lineHeight:1.8}}>
            La Facturation est désormais intégrée dans<br/>
            <strong style={{color:"#C9A84C"}}>Finance & Comptabilité (S01)</strong> — onglet <em>🧾 Facturation</em>.<br/>
            <span style={{fontSize:10}}>Redirection automatique en cours…</span>
          </div>
          <button onClick={() => { setActiveApp("finance"); if(setFinTool) setFinTool("facturation_s01"); }}
            style={{background:"linear-gradient(135deg,#C9A84C,#E8B84B)",border:"none",color:"#fff",borderRadius:9,padding:"11px 28px",cursor:"pointer",fontWeight:800,fontSize:13,boxShadow:"0 4px 14px #C9A84C44"}}>
            → Ouvrir Finance & Facturation
          </button>
        </div>
      </div>
    );
  }
  if (activeApp === "conventions") return (
    <div>
      <AppHeader icon="📜" title="Conventions de Mission" color="#8B5CF6" />
      <ConventionModule T={T} currentUser={currentUser} dossiers={dossiers} partners={partners||[]} users={users} setNotifications={setNotifications} setTaches={setTaches} setDossiers={setDossiers} />
    </div>
  );
  if (activeApp === "rapport_activite") return (
    <div>
      <AppHeader icon="📋" title="Rapport d'Activité" color="#06B6D4" />
      <RapportActiviteModule T={T} currentUser={currentUser} dossiers={dossiers} taches={taches} rdvs={rdvs} users={users} setNotifications={setNotifications} setTaches={setTaches} />
    </div>
  );

  if (activeApp === "sirh") return (
    <div>
      <AppHeader icon="👥" title="SIRH — Ressources Humaines" color="#A855F7" appId="sirh" />
      <SIRHModule
        T={T}
        currentUser={currentUser}
        users={users}
        setUsers={setUsers}
        setNotifications={setNotifications}
        dossiers={dossiers}
        taches={taches}
        setTaches={setTaches}
        rdvs={rdvs}
        setRdvs={setRdvs}
        isDemoMode={isDemoMode}
        pendingApprovals={pendingApprovals}
        setPendingApprovals={setPendingApprovals}
        docs={docs}
        standaloneDocuments={standaloneDocuments}
      />
    </div>
  );

  if (activeApp === "audit") return (
    <div>
      <AppHeader icon="🔍" title="Audit & Contrôle — Module Pro" color="#C41E3A" appId="audit" />
      <AuditApp
        T={T}
        currentUser={currentUser}
        setNotifications={setNotifications}
        setTaches={setTaches}
        riskMatrix={riskMatrix}
        setRiskMatrix={setRiskMatrix}
        newRisk={newRisk}
        setNewRisk={setNewRisk}
        addRisk={addRisk}
        auditTool={auditTool}
        setAuditTool={setAuditTool}
      />
    </div>
  );

  if (activeApp === "presentation") return (
    <div>
      <AppHeader icon="🖥️" title="Présentation — Diaporamas & Slides" color="#8B5CF6" />
      <PresentationApp T={T} currentUser={currentUser} setNotifications={setNotifications} />
    </div>
  );

  if (activeApp === "formulaires") return (
    <div>
      <AppHeader icon="📝" title="Formulaires & Checklists" color="#F97316" />
      <FormulaireApp T={T} currentUser={currentUser} setNotifications={setNotifications} />
    </div>
  );

  if (activeApp === "kanban" || activeApp === "gestion_rapide") return (
    <div>
      <AppHeader icon="🗂️" title="Gestion Rapide & Kanban — Tâches · Dossiers · Documents" color="#EC4899" />
      <GestionRapideUnifiee T={T} currentUser={currentUser} setNotifications={setNotifications} dossiers={dossiers} setDossiers={setDossiers} taches={taches} setTaches={setTaches} users={users} partners={partners} />
    </div>
  );

  if (activeApp === "juridique") return (
    <div>
      <AppHeader icon="⚖️" title="Juridique & OHADA — Droit des Affaires" color="#DC2626" appId="juridique" />
      <JuridiqueAppV2
        T={T}
        currentUser={currentUser}
        setNotifications={setNotifications}
        dossiers={dossiers}
        setDossiers={setDossiers}
        taches={taches}
        setTaches={setTaches}
        users={users}
        partners={partners}
        docs={docs}
        standaloneDocuments={standaloneDocuments}
        setDocs={setDocs}
        saveStandaloneDocs={saveStandaloneDocs}
      />
    </div>
  );

  if (activeApp === "conseil") return (
    <div>
      <AppHeader icon="🎯" title="Conseil & Stratégie — Outils analytiques" color="#0EA5E9" appId="conseil" />
      <ConseilApp T={T} currentUser={currentUser} setNotifications={setNotifications} taches={taches} dossiers={dossiers} users={users} />
    </div>
  );

  if (activeApp === "conformite") return (
    <div>
      <AppHeader icon="🛡️" title="Conformité & Veille Réglementaire" color="#10B981" appId="conformite" />
      <ConformiteFull
        T={T}
        currentUser={currentUser}
        users={users}
        setNotifications={setNotifications}
        isDemoMode={isDemoMode}
        taches={taches}
        setTaches={setTaches}
        dossiers={dossiers}
        setDossiers={setDossiers}
        docs={docs}
      />
    </div>
  );

  if (activeApp === "communication") return (
    <div>
      <AppHeader icon="📢" title="Communication & Marketing" color="#EC4899" appId="communication" />
      <CommunicationApp T={T} currentUser={currentUser} setNotifications={setNotifications} />
    </div>
  );

  if (activeApp === "logistique") return (
    <div>
      <AppHeader icon="🚚" title="Logistique & Moyens Généraux" color="#78716C" appId="logistique" />
      <LogistiqueModule T={T} currentUser={currentUser} users={users} setNotifications={setNotifications} isDemoMode={isDemoMode} />
    </div>
  );

  if (activeApp === "docs_app") return (
    <div>
      <AppHeader icon="📁" title="Gestion Documentaire — Dossiers · Documents · Archives" color="#6366F1" />
      <SIErrorBoundary T={T}><GestionDocsUnifiee
        T={T}
        currentUser={currentUser}
        dossiers={dossiers}
        setDossiers={setDossiers}
        taches={taches}
        setTaches={setTaches}
        users={users}
        partners={partners}
        setNotifications={setNotifications}
        docs={docs}
        setDocs={setDocs}
        dossierFiles={dossierFiles}
        saveDossierFiles={saveDossierFiles}
      /></SIErrorBoundary>
    </div>
  );


  return null;
}); // React.memo — BureauOffice


