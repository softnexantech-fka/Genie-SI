import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// SIRHModule.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, gcPushNotif, playSound, formatDate, gcFileSave, _activeUser, getProcColor , dsSave } from '../../core/index.js';
import { INITIAL_SIRH_PRESENCES, INITIAL_SIRH_LEAVES, INITIAL_RECRUTEMENTS, CODES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge} from '../../components/UI.jsx';
import { FiscalConfigPanel } from '../admin/SIConfigPanels.jsx';
import { PaieSimulateur } from '../finance/FinanceApp.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function SIRHModule({ T, currentUser, users=[], setUsers=_noop, setNotifications=_noop, dossiers=[], taches=[], setTaches=_noop, rdvs=[], setRdvs=_noop, isDemoMode=false, pendingApprovals=[], setPendingApprovals=_noop}){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'sirh',
          nom: file.name, taille: file.size, type: file.type,
          uploadedBy: currentUser?.id, uploadedByName: currentUser?.name,
          ...extraMeta,
        });
        results.push({
          ...ref, name: file.name, size: file.size, mimeType: file.type,
          sizeStr: file.size < 1048576 ? `${Math.round(file.size/1024)} Ko` : `${(file.size/1048576).toFixed(1)} Mo`,
          ext: '.' + file.name.split('.').pop().toLowerCase(),
          uploadedAt: new Date().toISOString(), downloads: 0,
        });
      } catch(e) { console.error('[upload sirh]', file.name, e.message); }
    }
    return results;
  };

  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const lsKey = k => isDemoMode ? null : `gc-sirh-${k}`;
  const [tab, setTab] = useState("dashboard");
  const [presences, setPresences] = useState(() => { try { return JSON.parse(_lsGet("gc-sirh-presences")||"null") || INITIAL_SIRH_PRESENCES; } catch (_) { return INITIAL_SIRH_PRESENCES; } });
  const [leaves, setLeaves] = useState(() => { try { return JSON.parse(_lsGet("gc-sirh-leaves")||"null") || INITIAL_SIRH_LEAVES; } catch (_) { return INITIAL_SIRH_LEAVES; } });
  const [recrutements, setRecrutements] = useState(() => { try { return JSON.parse(_lsGet("gc-sirh-recrutements")||"null") || INITIAL_RECRUTEMENTS; } catch (_) { return INITIAL_RECRUTEMENTS; } });
  const [showForm, setShowForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ userId:"", type:"CONGE_ANNUEL", debut:"", fin:"", motif:"" });
  const [selectedRec, setSelectedRec] = useState(null);
  const [showEditCollab, setShowEditCollab] = useState(null); // collab obj
  const [sirhSearch, setSirhSearch] = useState("");
  const [sirhStatusFilter, setSirhStatusFilter] = useState("ALL");
  const [sirhProcessFilter, setSirhProcessFilter] = useState("ALL");
  const [presSearch, setPresSearch] = useState("");
  const [presMonthFilter, setPresMonthFilter] = useState("");
  const [leaveSearch, setLeaveSearch] = useState("");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("ALL");
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("ALL");
  const [editCollabForm, setEditCollabForm] = useState({});
  const [showSuspendCollab, setShowSuspendCollab] = useState(null);
  const [suspendMotif, setSuspendMotif] = useState("");
  const [showReactivateCollab, setShowReactivateCollab] = useState(null);
  const [sirhSuspAttachment, setSirhSuspAttachment] = useState(null);

  const savePresences = v => {
    setPresences(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if(!isDemoMode) try { _lsSet("gc-sirh-presences", JSON.stringify(resolved)); dsSave('gc-sirh-presences', resolved).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return resolved;
    });
  };
  const saveLeaves = v => {
    setLeaves(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if(!isDemoMode) try { _lsSet("gc-sirh-leaves", JSON.stringify(resolved)); dsSave('gc-sirh-leaves', resolved).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return resolved;
    });
  };

  const lvl = currentUser.level;
  const isLvl5 = currentUser.isMG || currentUser.id === "USR-MG-001" || lvl === 5;
  const isRH4 = (currentUser.process === "S03" || (currentUser.processes||[]).includes("S03")) && lvl >= 4;
  const isConf4 = (currentUser.process === "P02" || (currentUser.processes||[]).includes("P02")) && lvl >= 4;
  const isResp4 = lvl >= 4 && !currentUser.isAdmin;
  // ─────────────────────────────────────────────────────────────────────────
  // FIX v152 — RÈGLE DE VISIBILITÉ vs RÈGLE D'ACTION (bonne pratique SI)
  //
  //  VOIR (canViewModule) : TOUS les users ayant accès au module SIRH voient
  //  l'ensemble des données RH de leur scope (tous les collègues intégrés).
  //  Les accès au module sont déjà contrôlés par gc-app-habilitations /
  //  PROCESS_APP_MATRIX → si tu es dans le module, tu as le droit de voir.
  //
  //  AGIR (canApprove / canEdit / canDelete) : restreint par niveau.
  //  niv1-2 : lecture seule + saisie propre présence
  //  niv3   : lecture complète + saisie propre + modification propres données
  //  niv4+  : approbation, intégration, modification de tout
  //  niv5+  : droits complets
  // ─────────────────────────────────────────────────────────────────────────
  const canApprove = currentUser.isAdmin || isLvl5 || isRH4 || isConf4 || isResp4;
  // Peut modifier les données d'un autre collaborateur (pas seulement les siennes)
  const canEditOthers = canApprove;
  // TOUS les membres ayant accès au module SIRH voient TOUS les collègues intégrés
  // (sauf admin système USR-ADM-000 qui n'a pas de données SIRH)
  // Note : le filtrage d'accès au module est fait en amont par PROCESS_APP_MATRIX
  const canSeeAll = true; // FIX v152 — tous les membres du module voient tout
  const today = new Date().toISOString().split("T")[0];
  const myPresence = presences.find(p => p.userId === currentUser.id && p.date === today);
  const allCollabs = users.filter(u => _activeUser(u)&&!u.isAdmin && u.id !== "USR-ADM-000");

  // ── CONFIG v75 : Auto-intégration du Manager Général (niv5) à sa 1ère session ──
  useEffect(()=>{
    const mgUser = users.find(u => (u.isMG || u.id==="USR-MG-001") && !u.isAdmin);
    if(!mgUser) return;
    const alreadyPresent = presences.some(p=>p.userId===mgUser.id);
    if(!alreadyPresent && mgUser.needsSirhOnboarding!==false){
      // Intégration automatique MG dans la base SIRH
      const nowIso = new Date().toISOString();
      savePresences(prev=>[...prev,{id:`PRE-MG-${Date.now()}`,userId:mgUser.id,date:today,arrivee:null,depart:null,pause:60,statut:"PRESENT",notes:"Intégration automatique — Manager Général"}]);
      if(setUsers) setUsers(prev=>prev.map(u=>u.id===mgUser.id?{...u,needsSirhOnboarding:false,sirhIntegratedAt:nowIso,sirhIntegratedBy:"SYSTEME"}:u));
    }
   
  },[]);

  // ── CONFIG v75 : Règle d'intégration SIRH ──
  // Un collaborateur NON-intégré (needsSirhOnboarding===true) :
  //   - apparaît dans Gestion Personnel avec statut "NON INTÉGRÉ" (inactif)
  //   - N'apparaît PAS dans les données SIRH (présences, paie, congés)
  //   - Seuls canApprove (niv4+ RH/Conf/DG + resp-processus) peuvent l'intégrer
  const integratedCollabs = allCollabs.filter(u => _activeUser(u)&&!u.needsSirhOnboarding);
  const pendingIntegration = allCollabs.filter(u => _activeUser(u)&&u.needsSirhOnboarding);

  // ── Listes filtrées SIRH ───────────────────────────────────────────────
  const filteredSirhCollabs = React.useMemo(() => {
    const q = sirhSearch.toLowerCase();
    return integratedCollabs.filter(u => { if(!_activeUser(u)) return false;
      const matchS = !q || (u.name||"").toLowerCase().includes(q) || (u.role||"").toLowerCase().includes(q) || (u.process||"").toLowerCase().includes(q);
      const matchSt = sirhStatusFilter === "ALL" || (u.accountStatus||"ACTIF") === sirhStatusFilter;
      const matchP = sirhProcessFilter === "ALL" || u.process === sirhProcessFilter || (u.processes||[]).includes(sirhProcessFilter);
      return matchS && matchSt && matchP;
    });
  }, [integratedCollabs, sirhSearch, sirhStatusFilter, sirhProcessFilter]);

  const filteredLeaves = React.useMemo(() => {
    const q = leaveSearch.toLowerCase();
    return (leaves||[]).filter(l => {
      const matchS = !q || (l.userName||"").toLowerCase().includes(q) || (l.type||"").toLowerCase().includes(q);
      const matchT = leaveTypeFilter === "ALL" || l.type === leaveTypeFilter;
      const matchSt = leaveStatusFilter === "ALL" || l.status === leaveStatusFilter;
      return matchS && matchT && matchSt;
    });
  }, [leaves, leaveSearch, leaveTypeFilter, leaveStatusFilter]);

  // FIX v152 — tous les membres du module voient tous les congés (lecture)
  // seule l'action d'approbation est restreinte au niveau canApprove
  const visibleCollabs = integratedCollabs; // tous voient tous
  const myLeaves = leaves.filter(l=>integratedCollabs.some(u=>u.id===l.userId));
  const pendingLeaves = leaves.filter(l => l.statut === "EN_ATTENTE" && integratedCollabs.some(u=>u.id===l.userId));

  useEffect(() => {
    try {
      const logs = JSON.parse(_lsGet("gc-session-logs")||"[]");
      const todayLogs = logs.filter(l => l.at?.startsWith(today));
      allCollabs.forEach(collab => {
        const userLogs = todayLogs.filter(l => l.userId === collab.id);
        const firstLogin = userLogs.filter(l => l.type==="CONNEXION" && l.status==="SUCCESS").sort((a,b)=>a.at.localeCompare(b.at))[0];
        const lastLogout = userLogs.filter(l => l.type==="DECONNEXION").sort((a,b)=>b.at.localeCompare(a.at))[0];
        if (firstLogin) {
          const arriveeTime = new Date(firstLogin.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
          const departTime = lastLogout ? new Date(lastLogout.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : null;
          savePresences(prev => {
            const existing = prev.find(p => p.userId===collab.id && p.date===today);
            if (!existing) {
              return [...prev, { id:`PRE-AUTO-${collab.id}-${today}`, userId:collab.id, date:today, arrivee:arriveeTime, depart:departTime, pause:60, statut:departTime?"PRESENT":"EN_POSTE", notes:"[Auto-sync SI]", autoSync:true }];
            } else if (existing.autoSync) {
              return prev.map(p => p.userId===collab.id&&p.date===today ? {...p, arrivee:arriveeTime, depart:departTime||p.depart, statut:departTime?"PRESENT":"EN_POSTE"} : p);
            }
            return prev;
          });
        }
      });
    } catch (_) {}
  }, [today]);

  // v117 — Paramètres SIRH configurables
  const SIRH_CFG_KEY = "gc-sirh-global-config";
  const SIRH_CFG_DEFAULT = {
    heuresJour: 8,           // heures de travail standard par jour
    joursBase: 22,           // jours ouvrés par mois
    heureDebut: "08:00",     // heure début
    heureFin: "17:30",       // heure fin
    pauseDejeuner: 60,       // pause déjeuner en minutes
    heureDebutPause: "12:00",  // heure début pause déjeuner
    heureFinPause: "13:00",    // heure fin pause déjeuner
    quotaCongesAnnuels: 30,  // jours de congés annuels
    quotaMaladie: 15,        // jours maladie autorisés
    retardDeductionParMin: 500, // FCFA déduit par minute de retard (après 15min)
    retardSeuilMin: 15,       // seuil (min) avant déduction
    heuresSuppTaux: 1.5,      // multiplicateur heures sup
    salaireBaseDefaut: 200000,// salaire de base défaut FCFA
    multiProcessDepuisNiv: 3, // niveau min pour multi-processus
  };
  const [sirhConfig, setSirhConfig] = useState(() => {
    try { return {...SIRH_CFG_DEFAULT, ...JSON.parse(_lsGet(SIRH_CFG_KEY)||"{}")}; } catch(_) { return SIRH_CFG_DEFAULT; }
  });
  const saveSirhConfig = (cfg) => { setSirhConfig(cfg); try { _lsSet(SIRH_CFG_KEY, JSON.stringify(cfg)); } catch(_) {} };
  const [sirhCfgDraft, setSirhCfgDraft] = useState(null); // draft editing state
  const [sirhCfgSaved, setSirhCfgSaved] = useState(false);

  const LEAVE_TYPES = { CONGE_ANNUEL:"Congé annuel", MALADIE:"Maladie", FORMATION:"Formation", MISSION:"Mission", SANS_SOLDE:"Sans solde", AUTRE:"Autre" };
  const LEAVE_STATUT = { EN_ATTENTE:{c:"#F59E0B",l:"En attente"}, APPROUVE:{c:"#22C55E",l:"Approuvé"}, REFUSE:{c:"#EF4444",l:"Refusé"} };
  const REC_STAGES = ["RECU","PRESELECTIONNE","ENTRETIEN_1","ENTRETIEN_2","DECISION","ONBOARDING"];
  const REC_STAGE_LABELS = { RECU:"Reçu", PRESELECTIONNE:"Présélectionné", ENTRETIEN_1:"Entretien 1", ENTRETIEN_2:"Entretien 2", DECISION:"Décision", ONBOARDING:"Onboarding" };

  const handlePointage = (type) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    if (type === "arrivee") {
      const newP = { id:`PRE-${Date.now()}`, userId:currentUser.id, date:today, arrivee:timeStr, depart:null, pause:60, statut:"EN_POSTE", notes:"" };
      savePresences(prev => [...prev.filter(p => !(p.userId===currentUser.id&&p.date===today)), newP]);
      setNotifications(prev => [{id:"N"+Date.now(),icon:"🟢",message:`Pointage arrivée enregistré à ${timeStr}`,at:now.toISOString(),read:false},...prev]);
    } else {
      savePresences(prev => prev.map(p => p.userId===currentUser.id&&p.date===today ? {...p,depart:timeStr,statut:"PRESENT"} : p));
      setNotifications(prev => [{id:"N"+Date.now(),icon:"🔴",message:`Pointage départ enregistré à ${timeStr}`,at:now.toISOString(),read:false},...prev]);
    }
    playSound("success");
  };

  const handleLeaveSubmit = () => {
    if (!leaveForm.userId || !leaveForm.debut || !leaveForm.fin) { gcAlert("Tous les champs sont requis."); return; }
    const newLeave = { ...leaveForm, id:`LV-${Date.now()}`, statut:"EN_ATTENTE", validePar:null, valideAt:null, soldeAvant:20, soldeApres:20, createdBy:currentUser.id, createdAt:new Date().toISOString() };
    saveLeaves(prev => [...prev, newLeave]);
    setNotifications(prev => [{id:"N"+Date.now(),icon:"📅",message:`Demande de congé soumise pour ${users.find(u=>u.id===leaveForm.userId)?.name||leaveForm.userId}`,at:new Date().toISOString(),read:false,module:"sirh"},...prev]);
    setLeaveForm({ userId:"", type:"CONGE_ANNUEL", debut:"", fin:"", motif:"" });
    setShowForm(false);
    playSound("success");
  };

  const handleLeaveAction = (leaveId, action, motif) => {
    saveLeaves(prev => prev.map(l => l.id===leaveId ? {...l, statut:action==="approve"?"APPROUVE":"REFUSE", validePar:currentUser.id, valideAt:new Date().toISOString(), refusMotif:motif||null} : l));
    const leave = leaves.find(l=>l.id===leaveId);
    const now = new Date().toISOString();
    setNotifications(prev => [{id:"N"+Date.now(),icon:action==="approve"?"✅":"❌",message:`Congé ${action==="approve"?"approuvé":"refusé"} pour ${users.find(u=>u.id===leave?.userId)?.name||"Collaborateur"} — ${leave?.debut} → ${leave?.fin}`,at:now,read:false,module:"sirh"},...prev]);
    // FIX v92 — Notifier l'employé concerné de la décision sur son congé
    if (leave?.userId && leave.userId !== currentUser.id) {
      gcPushNotif(leave.userId, {
        id:"N"+Date.now()+leave.userId, icon:action==="approve"?"✅":"❌",
        message:`${action==="approve"?"✅ Congé approuvé":"❌ Congé refusé"} (${leave.debut} → ${leave.fin})${motif?" — Motif : "+motif:""} — par ${currentUser.name}`,
        at:now, read:false, module:"sirh",
      });
    }
  };

  const handleDeleteLeave = async (leaveId) => {
    if (!await gcConfirm("Supprimer cette demande de congé ?")) return;
    saveLeaves(prev => prev.filter(l => l.id !== leaveId));
    playSound("delete");
  };

  const handlePurgeTreatedLeaves = async () => {
    const treated = myLeaves.filter(l => l.statut==="APPROUVE"||l.statut==="REFUSE");
    if (treated.length===0) { gcAlert("Aucun congé traité à purger."); return; }
    if (!await gcConfirm(`Purger ${treated.length} congé(s) traité(s) (approuvés et refusés) ? Cette action est irréversible.`)) return;
    saveLeaves(prev => prev.filter(l => l.statut==="EN_ATTENTE" || !myLeaves.find(m=>m.id===l.id)));
    playSound("success");
  };

  const todayPresences = presences.filter(p => p.date === today);
  const presents = todayPresences.filter(p => p.statut === "PRESENT" || p.statut === "EN_POSTE").length;
  const absents = allCollabs.length - todayPresences.filter(p => ["PRESENT","EN_POSTE"].includes(p.statut)).length;
  const enConge = leaves.filter(l => l.statut==="APPROUVE" && l.debut<=today && l.fin>=today).length;

  // Onboarding : DG et RH voient tout ; les autres responsables niv4 voient uniquement leur processus
  const pendingOnboarding = users.filter(u => { if(!_activeUser(u)) return false;
    if (!u.needsSirhOnboarding || u.isAdmin) return false;
    if (currentUser.isAdmin || isLvl5 || isRH4) return true; // DG/Admin/RH : tous
    if (isConf4 || isResp4) {
      // Autres responsables niv4 : uniquement leur processus
      const myProcs = currentUser.processes || [currentUser.process];
      return myProcs.some(p => u.process === p || (u.processes||[]).includes(p));
    }
    return false;
  });

  const [showPresenceForm, setShowPresenceForm] = useState(false);
  const [presenceForm, setPresenceForm] = useState({userId:"",date:today,arrivee:"09:00",depart:"17:00",pause:60, pauseDebut:"12:00", pauseFin:"13:00",statut:"PRESENT",motif:"",type:"PRESENT"});
  const [presListDate, setPresListDate] = useState(today);
  const [presListFilter, setPresListFilter] = useState("all");
  const [showReintForm, setShowReintForm] = useState(null); // collab obj
  const [reintForm, setReintForm] = useState({type:"REINSTATEMENT",motif:"",dateEffet:today});

  const pendingReinstatements = (() => {
    try { return JSON.parse(_lsGet("gc-sirh-reinstatements")||"[]"); } catch (_) { return []; }
  })();
  const saveReinstatement = (req) => {
    const all = [...pendingReinstatements, req];
    try { _lsSet("gc-sirh-reinstatements", JSON.stringify(all.slice(0,200))); dsSave('gc-sirh-reinstatements', all.slice(0,200)).catch(err => gcToast.syncError('', err)); } catch (_) {}
  };

  const handleCreatePresence = () => {
    if (!presenceForm.userId || !presenceForm.date) { gcAlert("Collaborateur et date requis."); return; }
    const {userId, date, arrivee, depart, pause, statut, motif, type} = presenceForm;
    let dureeMin = 0;
    if (arrivee && depart) {
      const [ah,am]=arrivee.split(":").map(Number);
      const [dh,dm]=depart.split(":").map(Number);
      dureeMin = Math.max(0, (dh*60+dm) - (ah*60+am) - (parseInt(pause)||0));
    }
    const baselineMin = 8*60;
    const retardMin = arrivee > "09:00" ? Math.max(0, (()=>{const[h,m]=arrivee.split(":").map(Number);return (h*60+m) - (9*60);})()) : 0;
    const hsupMin = Math.max(0, dureeMin - baselineMin);
    const newPres = {
      id:`PRE-MAN-${Date.now()}`, userId, date, arrivee, depart, pause:parseInt(pause)||60,
      pauseDebut:presenceForm.pauseDebut||"12:00", pauseFin:presenceForm.pauseFin||"13:00",
      statut: type==="ABSENT"?"ABSENT":dureeMin>=baselineMin?"PRESENT":dureeMin>0?"EN_POSTE":"ABSENT",
      motif, type, dureeMin, retardMin, heuresSup:hsupMin, manualEntry:true, createdBy:currentUser.id,
      createdAt:new Date().toISOString()
    };
    savePresences(prev => {
      const filtered = prev.filter(p => !(p.userId===userId && p.date===date));
      return [...filtered, newPres];
    });
    setNotifications(p=>[{id:"N"+Date.now(),icon:"⏱️",message:`Présence créée : ${users.find(u=>u.id===userId)?.name||userId} — ${date}`,at:new Date().toISOString(),read:false,module:"sirh"},...p]);
    setShowPresenceForm(false);
    setPresenceForm({userId:"",date:today,arrivee:"09:00",depart:"17:00",pause:60,pauseDebut:"12:00",pauseFin:"13:00",statut:"PRESENT",motif:"",type:"PRESENT"});
    playSound("success");
  };

  // ── Évaluations du personnel ─────────────────────────────────────────────
  const [evaluations, setEvaluations] = useState(()=>{try{return JSON.parse(_lsGet("gc-sirh-evaluations")||"[]");}catch(_){return [];}});
  const saveEvaluations = v=>{setEvaluations(v);try{_lsSet("gc-sirh-evaluations",JSON.stringify(v));dsSave('gc-sirh-evaluations',v).catch(err => gcToast.syncError('', err));}catch(_){}};

  const TABS = [
    {id:"dashboard",l:"📊 Tableau de bord"},{id:"presences",l:"⏱️ Présences"},
    {id:"liste_presences",l:"📋 Liste Présences"},
    {id:"personnel",l:"👤 Gestion Personnel"},
    {id:"evaluation_personnel",l:"⭐ Évaluation Personnel"},
    {id:"conges",l:`🌴 Congés${pendingLeaves.length>0&&canApprove?" ("+pendingLeaves.length+")":""}`},
    ...(lvl>=3?[{id:"recrutement",l:"🎯 Recrutement"}]:[]),
    ...(lvl>=4?[{id:"fichiers",l:"🗃️ Base Fichiers"}]:[]),
    ...(lvl>=4?[{id:"paie",l:"💰 Paie"}]:[]),
    ...(canApprove?[{id:"onboarding",l:`🆕 Onboarding${pendingOnboarding.length>0?" ("+pendingOnboarding.length+")":""}`}]:[]),
    ...(canApprove?[{id:"base_sirh",l:"🗄️ Base SIRH"}]:[]),
    ...(lvl>=4?[{id:"config_fiscale",l:"⚙️ Config Fiscale"}]:[]),
    ...(lvl>=4?[{id:"sirh_config",l:"⚙️ Paramètres SIRH"}]:[]),
  ];

  return (
    <div className="gc-fade-in">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#A855F7,#7C3AED)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>👥</div>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>SIRH — Ressources Humaines</div>
          <div style={{color:T.textMuted,fontSize:11}}>Processus S03 · Présences · Congés · Recrutement · Paie</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:16,borderBottom:`1px solid ${T.border}`,paddingBottom:8,overflowX:"auto"}} className="gc-tabs-scroll">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?"#A855F7":T.surface2,color:tab===t.id?"#fff":T.textMuted,border:`1px solid ${tab===t.id?"#A855F7":T.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:tab===t.id?800:400,fontSize:11,whiteSpace:"nowrap"}}>{t.l}</button>
        ))}
      </div>

      {/* ── DASHBOARD SIRH AMÉLIORÉ ── */}
      {tab==="dashboard" && (
        <div className="gc-stagger">
          {/* Mini alertes dynamiques */}
          {canApprove && (() => {
            const alerts = [];
            if(pendingLeaves.length>0) alerts.push({color:"#F59E0B",icon:"🌴",msg:`${pendingLeaves.length} demande(s) de congé en attente d'approbation`,action:()=>setTab("conges")});
            if(pendingOnboarding.length>0) alerts.push({color:"#A855F7",icon:"🆕",msg:`${pendingOnboarding.length} collaboration(s) nécessitent une intégration SIRH`,action:()=>setTab("onboarding")});
            const absentsNoPresence = allCollabs.filter(u=>_activeUser(u)&&!presences.find(p=>p.userId===u.id&&p.date===today));
            if(absentsNoPresence.length>0) alerts.push({color:"#EF4444",icon:"⚠️",msg:`${absentsNoPresence.length} collaborateur(s) sans pointage aujourd'hui`,action:()=>setTab("presences")});
            const recEnCours = recrutements.filter(r=>r.statut!=="CLOTURE");
            if(recEnCours.length>0) alerts.push({color:"#3B82F6",icon:"🎯",msg:`${recEnCours.length} mission(s) recrutement en cours`,action:()=>setTab("recrutement")});
            if(alerts.length===0) return null;
            return (
              <div style={{marginBottom:14}}>
                {alerts.map((a,i)=>(
                  <div key={i} onClick={a.action} style={{background:a.color+"12",border:`1px solid ${a.color}33`,borderRadius:9,padding:"8px 12px",marginBottom:6,display:"flex",gap:8,alignItems:"center",cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background=a.color+"22"} onMouseLeave={e=>e.currentTarget.style.background=a.color+"12"}>
                    <span style={{fontSize:14}}>{a.icon}</span>
                    <span style={{color:T.text,fontSize:11,flex:1}}>{a.msg}</span>
                    <span style={{color:a.color,fontSize:10,fontWeight:700}}>→</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Pointage rapide — visible pour tous les membres (ils pointent leur propre présence) */}
          {!canApprove && (
            <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:11,color:"#3B82F6"}}>
              ℹ️ Vous consultez les données SIRH en <strong>lecture seule</strong>. Vous pouvez saisir vos propres présences. Pour toute modification ou approbation, adressez-vous à votre responsable.
            </div>
          )}
          {!canApprove && (
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:10}}>⏱️ Mon Pointage — {today}</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>handlePointage("arrivee")} disabled={!!myPresence?.arrivee}
                  style={{flex:1,background:myPresence?.arrivee?"#22C55E22":"#22C55E",border:`1px solid ${myPresence?.arrivee?"#22C55E44":"#22C55E"}`,color:myPresence?.arrivee?"#22C55E":"#fff",borderRadius:8,padding:"10px",cursor:myPresence?.arrivee?"not-allowed":"pointer",fontWeight:700,fontSize:12}}>
                  🟢 {myPresence?.arrivee?`Arrivée : ${myPresence.arrivee}`:"Pointer l'arrivée"}
                </button>
                <button onClick={()=>handlePointage("depart")} disabled={!myPresence?.arrivee||!!myPresence?.depart}
                  style={{flex:1,background:myPresence?.depart?"#EF444422":"#EF4444",border:`1px solid ${myPresence?.depart?"#EF444444":"#EF4444"}`,color:myPresence?.depart?"#EF4444":"#fff",borderRadius:8,padding:"10px",cursor:(!myPresence?.arrivee||myPresence?.depart)?"not-allowed":"pointer",fontWeight:700,fontSize:12}}>
                  🔴 {myPresence?.depart?`Départ : ${myPresence.depart}`:"Pointer le départ"}
                </button>
              </div>
            </div>
          )}

          {/* KPIs principaux — indicateur haut-droite, infos bas-gauche */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}} className="gc-grid-4">
            {[
              {l:"Effectif total",v:allCollabs.length,icon:"👥",c:"#A855F7",sub:`${allCollabs.filter(u=>_activeUser(u)&&(u.accountStatus||"ACTIF")==="ACTIF").length} actifs`,bar:null,tab:"personnel"},
              {l:"Présents aujourd'hui",v:presents,icon:"✅",c:"#22C55E",sub:`${allCollabs.length>0?Math.round(presents/allCollabs.length*100):0}% de l'effectif`,bar:allCollabs.length>0?Math.round(presents/allCollabs.length*100):0,tab:"presences"},
              {l:"Absents / En congé",v:absents,icon:"❌",c:"#EF4444",sub:`dont ${enConge} en congé approuvé`,bar:allCollabs.length>0?Math.round(absents/allCollabs.length*100):0,tab:"presences"},
              {l:"Congés en attente",v:pendingLeaves.length,icon:"🌴",c:"#F59E0B",sub:`${leaves.filter(l=>l.statut==="APPROUVE").length} approuvés au total`,bar:null,tab:"conges"},
            ].map(s=>(
              <div key={s.l} onClick={()=>setTab(s.tab)}
                style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14,cursor:"pointer",transition:"border-color 0.2s,box-shadow 0.2s",display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:90}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=s.c+"66";e.currentTarget.style.boxShadow=`0 4px 16px ${s.c}20`;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="";}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <span style={{fontSize:20}}>{s.icon}</span>
                  <span style={{color:s.c,fontSize:28,fontWeight:900,lineHeight:1}}>{s.v}</span>
                </div>
                <div>
                  <div style={{color:T.text,fontSize:11,fontWeight:700,marginBottom:2}}>{s.l}</div>
                  <div style={{color:T.textMuted,fontSize:9}}>{s.sub}</div>
                  {s.bar!=null && allCollabs.length>0 && (
                    <div style={{height:3,background:T.surface3,borderRadius:3,marginTop:6,overflow:"hidden"}}>
                      <div style={{width:`${Math.min(s.bar,100)}%`,height:"100%",background:s.c,borderRadius:3,transition:"width 0.6s"}} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Cartes analytiques — présence + processus (managers uniquement) */}
          {canSeeAll && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}} className="gc-grid-2">
              <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{color:T.text,fontWeight:700,fontSize:12}}>📊 Présence aujourd'hui</span>
                  <span style={{color:T.textMuted,fontSize:10}}>{allCollabs.length} collaborateurs</span>
                </div>
                {[
                  {label:"En poste",color:"#3B82F6",count:presences.filter(p=>p.date===today&&p.statut==="EN_POSTE").length},
                  {label:"Présent (départ enr.)",color:"#22C55E",count:presences.filter(p=>p.date===today&&p.statut==="PRESENT").length},
                  {label:"En congé approuvé",color:"#F59E0B",count:enConge},
                  {label:"Absent / Non pointé",color:"#EF4444",count:absents},
                ].map(sg=>{const total=allCollabs.length||1;return (
                  <div key={sg.label} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{color:T.textMuted,fontSize:10}}>{sg.label}</span>
                      <span style={{color:sg.color,fontSize:10,fontWeight:700}}>{sg.count} ({Math.round(sg.count/total*100)}%)</span>
                    </div>
                    <div style={{height:5,background:T.surface3,borderRadius:4,overflow:"hidden"}}>
                      <div style={{width:`${Math.min(Math.round(sg.count/total*100),100)}%`,height:"100%",background:sg.color,borderRadius:4,transition:"width 0.6s"}} />
                    </div>
                  </div>
                );})}
              </div>
              <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{color:T.text,fontWeight:700,fontSize:12}}>🗂️ Effectif par processus</span>
                  <span style={{color:T.textMuted,fontSize:10}}>Top 6</span>
                </div>
                {(()=>{const procGroups={};allCollabs.forEach(u=>{const p=u.process||"?";procGroups[p]=(procGroups[p]||0)+1;});const sorted=Object.entries(procGroups).sort((a,b)=>b[1]-a[1]).slice(0,6);const max=sorted[0]?.[1]||1;return sorted.map(([proc,count])=>(
                  <div key={proc} style={{marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:34,color:getProcColor(proc),fontSize:9,fontWeight:700,textAlign:"right",flexShrink:0}}>{proc}</span>
                    <div style={{flex:1,height:7,background:T.surface3,borderRadius:4,overflow:"hidden"}}>
                      <div style={{width:`${Math.min(Math.round(count/max*100),100)}%`,height:"100%",background:getProcColor(proc),borderRadius:4,transition:"width 0.6s"}} />
                    </div>
                    <span style={{color:T.textMuted,fontSize:10,width:16,textAlign:"right",flexShrink:0}}>{count}</span>
                  </div>
                ));})()} 
              </div>
            </div>
          )}

          {/* Congés en attente (si approbateur) */}
          {canApprove && pendingLeaves.length > 0 && (
            <div style={{background:"#F59E0B12",border:"1px solid #F59E0B44",borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{color:"#F59E0B",fontWeight:800,fontSize:13}}>⏳ {pendingLeaves.length} demande(s) de congé en attente</div>
                <button onClick={()=>setTab("conges")} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>Voir tout →</button>
              </div>
              {pendingLeaves.slice(0,3).map(l=>{
                const u=users.find(x=>x.id===l.userId);
                return (
                  <div key={l.id} style={{display:"flex",alignItems:"center",gap:8,background:T.surface2,borderRadius:8,padding:"8px 12px",marginBottom:6}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:u?.color||"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,flexShrink:0}}>{u?.avatar||"?"}</div>
                    <div style={{flex:1}}>
                      <div style={{color:T.text,fontSize:12,fontWeight:600}}>{u?.name||l.userId}</div>
                      <div style={{color:T.textMuted,fontSize:10}}>{LEAVE_TYPES[l.type]} · {l.debut} → {l.fin}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>handleLeaveAction(l.id,"approve")} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontSize:10}}>✅ Approuver</button>
                      <button onClick={async () => {const motif=await gcPrompt("Motif du refus :","","Refus de congé","❌");handleLeaveAction(l.id,"refuse",motif||"Refusé par le responsable");}} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontSize:10}}>❌ Refuser</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Accès rapides modules RH — Personnel · Recrutement · Paie · Fichiers */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}} className="gc-grid-2">
            {[
              {icon:"👤",label:"Personnel",sub:`${allCollabs.length} collaborateurs`,tab:"personnel",c:"#A855F7",badge:allCollabs.length},
              ...(lvl>=3?[{icon:"🎯",label:"Recrutement",sub:`${recrutements.filter(r=>r.statut!=="CLOTURE").length} mission(s) active(s)`,tab:"recrutement",c:"#22C55E",badge:recrutements.filter(r=>r.statut!=="CLOTURE").length||null}]:[]),
              ...(lvl>=4?[{icon:"💰",label:"Paie & Bulletins",sub:"Calcul rémunérations",tab:"paie",c:"#C9A84C",badge:null}]:[]),
              ...(lvl>=4?[{icon:"🗃️",label:"Fichiers RH",sub:"Base documentaire personnel",tab:"fichiers",c:"#06B6D4",badge:null}]:[]),
            ].map(item=>(
              <div key={item.tab} onClick={()=>setTab(item.tab)}
                style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16,cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:12}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=item.c+"66";e.currentTarget.style.background=item.c+"10";e.currentTarget.style.boxShadow=`0 4px 12px ${item.c}20`;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surface2;e.currentTarget.style.boxShadow="";}}>
                <div style={{width:44,height:44,borderRadius:10,background:item.c+"22",border:`1px solid ${item.c}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{item.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:item.c,fontWeight:800,fontSize:12,marginBottom:2}}>{item.label}</div>
                  <div style={{color:T.textDim,fontSize:10}}>{item.sub}</div>
                </div>
                {item.badge!=null && <span style={{background:item.c+"22",color:item.c,border:`1px solid ${item.c}44`,borderRadius:10,padding:"2px 9px",fontSize:11,fontWeight:900,flexShrink:0}}>{item.badge}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PRÉSENCES ── */}
      {tab==="presences" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <h4 style={{color:"#A855F7",margin:0,fontSize:13,fontWeight:800}}>⏱️ Feuille de présence — {today}</h4>
            {canApprove && (
              <button onClick={()=>setShowPresenceForm(true)} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:800,fontSize:11}}>
                + Créer une présence / absence
              </button>
            )}
          </div>
          {/* ── FORMULAIRE CRÉATION PRÉSENCE MANUELLE ── */}
          {showPresenceForm && canApprove && (
            <div style={{background:"#A855F710",border:"2px solid #A855F744",borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:12}}>➕ Nouvelle fiche de présence / absence</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
                <div>
                  <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Collaborateur *</label>
                  <select value={presenceForm.userId} onChange={e=>setPresenceForm(f=>({...f,userId:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11}}>
                    <option value="">— Sélectionner —</option>
                    {allCollabs.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Date *</label>
                  <input type="date" value={presenceForm.date} onChange={e=>setPresenceForm(f=>({...f,date:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Type</label>
                  <select value={presenceForm.type} onChange={e=>setPresenceForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11}}>
                    <option value="PRESENT">✅ Présent</option>
                    <option value="ABSENT">❌ Absent</option>
                    <option value="RETARD">⏰ Retard</option>
                    <option value="MISSION">🚗 Mission</option>
                    <option value="TELETRAVAIL">💻 Télétravail</option>
                  </select>
                </div>
              </div>
              {presenceForm.type !== "ABSENT" && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                  <div>
                    <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Heure arrivée</label>
                    <input type="time" value={presenceForm.arrivee} onChange={e=>setPresenceForm(f=>({...f,arrivee:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                    {presenceForm.arrivee>"09:00"&&<div style={{color:"#F97316",fontSize:9,marginTop:2}}>⏰ Retard : {(()=>{const[h,m]=presenceForm.arrivee.split(":").map(Number);return Math.max(0,(h*60+m)-(9*60))+" min"})()}</div>}
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Heure départ</label>
                    <input type="time" value={presenceForm.depart} onChange={e=>setPresenceForm(f=>({...f,depart:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                    {presenceForm.depart>"17:00"&&<div style={{color:"#22C55E",fontSize:9,marginTop:2}}>⚡ H.Sup : {(()=>{const[h,m]=presenceForm.depart.split(":").map(Number);return Math.max(0,(h*60+m)-(17*60))+" min"})()}</div>}
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Pause (min)</label>
                    <input type="number" value={presenceForm.pause} onChange={e=>setPresenceForm(f=>({...f,pause:e.target.value}))} min="0" max="120" style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,textTransform:"uppercase",fontWeight:600}}>Début pause</label>
                    <input type="time" value={presenceForm.pauseDebut||"12:00"} onChange={e=>setPresenceForm(f=>({...f,pauseDebut:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,textTransform:"uppercase",fontWeight:600}}>Fin pause</label>
                    <input type="time" value={presenceForm.pauseFin||"13:00"} onChange={e=>setPresenceForm(f=>({...f,pauseFin:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                  </div>
                </div>
              )}
              <div style={{marginBottom:10}}>
                <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Motif {presenceForm.type==="ABSENT"?"(requis si sanction)":"(optionnel)"}</label>
                <input value={presenceForm.motif} onChange={e=>setPresenceForm(f=>({...f,motif:e.target.value}))} placeholder="Ex: Maladie, Mission extérieure, Sanction disciplinaire…" style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
              </div>
              {/* Récapitulatif calcul */}
              {presenceForm.type!=="ABSENT"&&presenceForm.arrivee&&presenceForm.depart&&(()=>{
                const [ah,am]=presenceForm.arrivee.split(":").map(Number);
                const [dh,dm]=presenceForm.depart.split(":").map(Number);
                const dureeMin=Math.max(0,(dh*60+dm)-(ah*60+am)-(parseInt(presenceForm.pause)||0));
                const baselineMin=8*60;
                const retardMin=presenceForm.arrivee>"09:00"?Math.max(0,(ah*60+am)-(9*60)):0;
                const hSupMin=Math.max(0,dureeMin-baselineMin);
                const manque=Math.max(0,baselineMin-dureeMin);
                return (
                  <div style={{background:T.surface2,border:`1px solid ${dureeMin>=baselineMin?"#22C55E44":"#F59E0B44"}`,borderRadius:8,padding:"8px 12px",marginBottom:10,display:"flex",gap:10,flexWrap:"wrap"}}>
                    <div style={{flex:1,fontSize:10,color:T.text}}>⏱️ Durée effective : <strong style={{color:dureeMin>=baselineMin?"#22C55E":"#F59E0B"}}>{Math.floor(dureeMin/60)}h{String(dureeMin%60).padStart(2,"0")}</strong> / 8h</div>
                    {retardMin>0&&<div style={{fontSize:10,color:"#F97316"}}>⚠️ Retard : {retardMin} min → déduction paie</div>}
                    {hSupMin>0&&<div style={{fontSize:10,color:"#22C55E"}}>⚡ H.Sup : {Math.floor(hSupMin/60)}h{String(hSupMin%60).padStart(2,"0")} → majoration paie</div>}
                    {manque>0&&!retardMin&&<div style={{fontSize:10,color:"#F59E0B"}}>📉 Quota non atteint : -{manque} min → déduction paie</div>}
                  </div>
                );
              })()}
              <div style={{display:"flex",gap:8}}>
                <button onClick={handleCreatePresence} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Enregistrer</button>
                <button onClick={()=>setShowPresenceForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:T.surface2}}>
                  {["Collaborateur","Statut","Arrivée","Départ","Durée","Notes"].map(h=>(
                    <th key={h} style={{padding:"8px 10px",textAlign:"left",color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",borderBottom:`1px solid ${T.border}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCollabs.map(collab=>{
                  const pres=presences.find(p=>p.userId===collab.id&&p.date===today);
                  const statut=pres?.statut||(leaves.find(l=>l.userId===collab.id&&l.statut==="APPROUVE"&&l.debut<=today&&l.fin>=today)?"EN_CONGE":"ABSENT");
                  const statusConf={PRESENT:{c:"#22C55E",l:"Présent"},EN_POSTE:{c:"#3B82F6",l:"En poste"},ABSENT:{c:"#EF4444",l:"Absent"},EN_CONGE:{c:"#F59E0B",l:"En congé"},RETARD:{c:"#F97316",l:"Retard"}};
                  const sc=statusConf[statut]||{c:"#888",l:statut};
                  let duree="—"; let dureeMin=0;
                  if(pres?.arrivee&&pres?.depart){
                    const [ah,am]=pres.arrivee.split(":").map(Number);
                    const [dh,dm]=pres.depart.split(":").map(Number);
                    dureeMin=(dh*60+dm)-(ah*60+am)-(pres.pause||0);
                    duree=`${Math.floor(dureeMin/60)}h${String(dureeMin%60).padStart(2,"0")}`;
                  }
                  const workGoalMins=8*60; // 8h objectif
                  const workPct=dureeMin>0?Math.min(100,Math.round(dureeMin/workGoalMins*100)):0;
                  // FIX v152 — lecture/action par niveau :
                  // niv1-2 : lecture seule (sauf propre ligne)
                  // niv3   : peut modifier sa propre ligne
                  // niv4+  : peut modifier tout (canEditOthers)
                  const isOwnLine = collab.id === currentUser.id;
                  const canEditThis = canEditOthers || (isOwnLine && lvl >= 1);
                  return (
                    <tr key={collab.id} className="gc-tr-hover" style={{borderBottom:`1px solid ${T.border}20`}}>
                      <td style={{padding:"8px 10px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:24,height:24,borderRadius:"50%",background:collab.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700}}>{collab.avatar}</div>
                          <div>
                            <div style={{color:T.text,fontSize:11,fontWeight:600}}>{collab.name}</div>
                            <div style={{color:T.textMuted,fontSize:9}}>{collab.role}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{padding:"8px 10px"}}><span style={{background:sc.c+"22",color:sc.c,border:`1px solid ${sc.c}44`,borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700}}>{sc.l}</span></td>
                      <td style={{padding:"4px 6px"}}>
                        {canEditThis ? <input type="time" defaultValue={pres?.arrivee||""} onBlur={e=>{const v=e.target.value;savePresences(prev=>prev.map(p=>p.userId===collab.id&&p.date===today?{...p,arrivee:v||p.arrivee}:p)||(pres?prev:[...prev,{id:`PRE-${Date.now()}`,userId:collab.id,date:today,arrivee:v,depart:null,pause:60,statut:"EN_POSTE",notes:""}]));}} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 5px",color:T.text,fontSize:10,fontFamily:"monospace",width:72}} />
                        : <span style={{color:T.text,fontSize:11,fontFamily:"monospace"}}>{pres?.arrivee||"—"}</span>}
                      </td>
                      <td style={{padding:"4px 6px"}}>
                        {canEditThis ? <input type="time" defaultValue={pres?.depart||""} onBlur={e=>{const v=e.target.value;savePresences(prev=>prev.map(p=>p.userId===collab.id&&p.date===today?{...p,depart:v||p.depart,statut:v?"PRESENT":p.statut}:p));}} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 5px",color:T.text,fontSize:10,fontFamily:"monospace",width:72}} />
                        : <span style={{color:T.text,fontSize:11,fontFamily:"monospace"}}>{pres?.depart||"—"}</span>}
                      </td>
                      <td style={{padding:"8px 10px"}}>
                        <div style={{color:duree!=="—"?(workPct>=100?"#22C55E":workPct>=75?"#F59E0B":"#EF4444"):T.textMuted,fontSize:11,fontWeight:600}}>{duree}</div>
                        {dureeMin>0&&<div style={{width:50,height:4,background:T.surface3,borderRadius:3,marginTop:3,overflow:"hidden"}}><div style={{width:Math.min(workPct,100)+"%",height:"100%",background:workPct>=100?"#22C55E":workPct>=75?"#F59E0B":"#EF4444",borderRadius:3}} /></div>}
                      </td>
                      <td style={{padding:"4px 6px"}}>
                        {canEditThis ? <input defaultValue={pres?.notes||""} onBlur={e=>{const v=e.target.value;savePresences(prev=>prev.map(p=>p.userId===collab.id&&p.date===today?{...p,notes:v}:p));}} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,fontSize:10,width:"100%"}} />
                        : <span style={{color:T.textMuted,fontSize:10}}>{pres?.notes||"—"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── GESTION PERSONNEL ── */}
      {tab==="personnel" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <h4 style={{color:"#A855F7",margin:0,fontSize:13,fontWeight:800}}>👤 Gestion du Personnel — Collaborateurs internes</h4>
            {canApprove && <div style={{color:T.textMuted,fontSize:11}}>{integratedCollabs.length} intégrés · {pendingIntegration.length} en attente · {today}</div>}
          </div>

          {/* Section non-intégrés : visible dans Gestion Personnel comme inactifs */}
          {pendingIntegration.length>0&&canApprove&&(
            <div style={{background:"#F59E0B11",border:"1px solid #F59E0B44",borderRadius:12,padding:14,marginBottom:16}}>
              <div style={{color:"#F59E0B",fontWeight:800,fontSize:12,marginBottom:8}}>⏳ Collaborateurs non intégrés dans SIRH ({pendingIntegration.length})</div>
              <div style={{color:T.textDim,fontSize:10,marginBottom:10}}>Ces comptes ont été créés mais ne sont pas encore intégrés dans la base SIRH (présences, paie, congés). Visible ici en statut INACTIF. L'intégration est réservée aux managers Niv.4+, RH, Conformité (P02) ou DG.</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {pendingIntegration.map(u=>(
                  <div key={u.id} style={{background:T.surface2,border:"1px solid #F59E0B33",borderRadius:10,padding:"10px 14px",display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:"#7A90B0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,overflow:"hidden"}}>
                      {u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar||"?"}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{color:T.text,fontWeight:700,fontSize:12}}>{u.name}</div>
                      <div style={{color:T.textMuted,fontSize:10}}>{u.role} · Niv.{u.level} · {u.process}</div>
                    </div>
                    <span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:4,padding:"2px 8px",fontSize:9,fontWeight:700}}>⏳ NON INTÉGRÉ</span>
                    {canApprove&&(
                      <button onClick={async () => {
                        if(!await gcConfirm(`Intégrer ${u.name} dans la base SIRH ?\n\n• Fiche de présence créée\n• Solde congés initial : 20 jours\n• Accessible dans la gestion des présences et paie`))return;
                        const nowIso=new Date().toISOString();
                        savePresences(prev=>[...prev,{id:`PRE-${Date.now()}`,userId:u.id,date:today,arrivee:null,depart:null,pause:60,statut:"ABSENT",notes:"Intégration SIRH — 1er jour"}]);
                        if(setUsers)setUsers(prev=>prev.map(x=>x.id===u.id?{...x,needsSirhOnboarding:false,sirhIntegratedAt:nowIso,sirhIntegratedBy:currentUser.name}:x));
                        setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"👥",message:`${u.name} intégré(e) dans la base SIRH par ${currentUser.name}`,at:nowIso,read:false,module:"sirh"},...p]);
                        gcAlert(`✅ ${u.name} intégré(e) dans la base SIRH.`);
                      }} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Intégrer</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Filtres Personnel ── */}
          {canSeeAll && (
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
              <input value={sirhSearch} onChange={e=>setSirhSearch(e.target.value)} placeholder="🔍 Nom, rôle, processus…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
              <select value={sirhProcessFilter} onChange={e=>setSirhProcessFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
                <option value="ALL">🗂️ Tous processus</option>
                {[...new Set(integratedCollabs.map(u=>u.process).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select value={sirhStatusFilter} onChange={e=>setSirhStatusFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
                <option value="ALL">🔍 Tous statuts</option>
                <option value="ACTIF">✅ Actif</option>
                <option value="SUSPENDU">⏸ Suspendu</option>
                <option value="INACTIF">⛔ Inactif</option>
              </select>
              <span style={{color:T.textDim,fontSize:10}}>{filteredSirhCollabs.length}/{integratedCollabs.length}</span>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
            {/* FIX v152 — tous les membres du module voient tous les collègues */}
            {filteredSirhCollabs.map(collab=>{
              const pres=presences.find(p=>p.userId===collab.id&&p.date===today);
              const onLeave=leaves.find(l=>l.userId===collab.id&&l.statut==="APPROUVE"&&l.debut<=today&&l.fin>=today);
              const statusColor=pres?.statut==="EN_POSTE"?"#3B82F6":pres?.statut==="PRESENT"?"#22C55E":onLeave?"#F59E0B":"#EF4444";
              const statusLabel=pres?.statut==="EN_POSTE"?"🟢 En poste":pres?.statut==="PRESENT"?"✅ Présent":onLeave?"🌴 En congé":"⭕ Absent";
              let dureeMin=0;
              if(pres?.arrivee&&pres?.depart){const[ah,am]=pres.arrivee.split(":").map(Number);const[dh,dm]=pres.depart.split(":").map(Number);dureeMin=(dh*60+dm)-(ah*60+am)-(pres.pause||60);}
              const workPct=dureeMin>0?Math.min(100,Math.round(dureeMin/(8*60)*100)):0;
              return (
                <div key={collab.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14,display:"flex",flexDirection:"column",gap:8,transition:"border-color 0.2s,box-shadow 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#A855F766";e.currentTarget.style.boxShadow="0 4px 20px rgba(168,85,247,0.15)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="";}}>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:collab.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#fff",fontWeight:700,overflow:"hidden",flexShrink:0}}>
                      {collab.photoUrl?<img src={collab.photoUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="" />:collab.avatar}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{color:T.text,fontWeight:700,fontSize:13}}>{collab.name}</div>
                      <div style={{color:T.textMuted,fontSize:10}}>{collab.role} · Niv.{collab.level} · {collab.process}</div>
                    </div>
                    <div style={{width:8,height:8,borderRadius:"50%",background:statusColor,flexShrink:0}} className={pres?.statut==="EN_POSTE"?"gc-dot-online":""} />
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:statusColor,fontSize:11,fontWeight:700}}>{statusLabel}</span>
                    {dureeMin>0&&<span style={{color:workPct>=100?"#22C55E":workPct>=75?"#F59E0B":"#EF4444",fontSize:10,fontWeight:700}}>{Math.floor(dureeMin/60)}h{String(dureeMin%60).padStart(2,"0")}/8h ({workPct}%)</span>}
                  </div>
                  {dureeMin>0&&<div style={{height:4,background:T.surface3,borderRadius:3,overflow:"hidden"}}><div style={{width:Math.min(workPct,100)+"%",height:"100%",background:workPct>=100?"#22C55E":workPct>=75?"#F59E0B":"#EF4444",borderRadius:3,transition:"width 0.5s"}} /></div>}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:10}}>
                    <div style={{color:T.textMuted}}>📧 {collab.email||"—"}</div>
                    <div style={{color:T.textMuted}}>📱 {collab.telephone||collab.phone||"—"}</div>
                    <div style={{color:T.textMuted}}>📅 Entrée : {collab.startDate||"—"}</div>
                    <div style={{color:T.textMuted}}>📍 {collab.location||"Siège"}</div>
                  </div>
                  {canApprove && (
                    <div style={{display:"flex",gap:6,marginTop:4,paddingTop:8,borderTop:`1px solid ${T.border}33`}}>
                      <button
                        onClick={(e)=>{e.stopPropagation();setEditCollabForm({name:collab.name,role:collab.role,email:collab.email||"",telephone:collab.telephone||collab.phone||"",startDate:collab.startDate||"",location:collab.location||"Siège",level:collab.level,process:collab.process,sexe:collab.sexe||"M",nationalite:collab.nationalite||"Gabonaise",adresse:collab.adresse||"",bio:collab.bio||"",salaireBase:collab.salaireBase||"",typeContrat:collab.typeContrat||"CDI",matricule:collab.matricule||""});setShowEditCollab(collab);}}
                        style={{flex:1,background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}
                        onMouseEnter={e=>{e.currentTarget.style.background="#3B82F633";}} onMouseLeave={e=>{e.currentTarget.style.background="#3B82F622";}}>
                        ✏️ Modifier
                      </button>
                      {collab.id !== currentUser.id && (
                        (collab.accountStatus||"ACTIF")==="ACTIF" ? (
                          <button onClick={(e)=>{e.stopPropagation();setSuspendMotif("");setShowSuspendCollab(collab);}}
                            style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>⏸️ Suspendre</button>
                        ) : (
                          <button onClick={(e)=>{e.stopPropagation();setShowReactivateCollab(collab);}}
                            style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>▶️ Réactiver</button>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MODAL MODIFIER COLLABORATEUR ── */}
      {showEditCollab && (
        <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowEditCollab(null)}>
          <div style={{background:"#0D1F38",border:"1px solid #1E3A5F",borderRadius:14,padding:24,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <h4 style={{color:"#A855F7",margin:0,fontSize:14,fontWeight:800}}>✏️ Modifier — {showEditCollab.name}</h4>
              <button onClick={()=>setShowEditCollab(null)} style={{background:"none",border:"none",color:"#EF4444",fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[["name","Nom complet"],["role","Poste / Fonction"],["email","Email"],["telephone","Téléphone"],["startDate","Date d'entrée"],["location","Localisation"]].map(([k,lbl])=>(
                <div key={k}>
                  <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>{lbl}</label>
                  <input value={editCollabForm[k]||""} onChange={e=>setEditCollabForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,boxSizing:"border-box"}} />
                </div>
              ))}
              <div>
                <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Niveau (1-6)</label>
                <select value={editCollabForm.level||1} onChange={e=>setEditCollabForm(f=>({...f,level:parseInt(e.target.value, 10)}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11}}>
                  {[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Processus</label>
                <select value={editCollabForm.process||"O01"} onChange={e=>setEditCollabForm(f=>({...f,process:e.target.value}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11}}>
                  {Object.entries(CODES.processes).map(([k,v])=><option key={k} value={k}>{k} – {v}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Genre</label>
                <select value={editCollabForm.sexe||"M"} onChange={e=>setEditCollabForm(f=>({...f,sexe:e.target.value}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11}}>
                  <option value="M">Masculin</option><option value="F">Féminin</option><option value="N/A">N/A</option>
                </select>
              </div>
              <div>
                <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Nationalité</label>
                <input value={editCollabForm.nationalite||""} onChange={e=>setEditCollabForm(f=>({...f,nationalite:e.target.value}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,boxSizing:"border-box"}} />
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Adresse</label>
              <input value={editCollabForm.adresse||""} onChange={e=>setEditCollabForm(f=>({...f,adresse:e.target.value}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,boxSizing:"border-box"}} />
            </div>
            <div style={{marginBottom:16}}>
              <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Bio / Notes RH</label>
              <textarea value={editCollabForm.bio||""} onChange={e=>setEditCollabForm(f=>({...f,bio:e.target.value}))} rows={2} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,resize:"vertical",boxSizing:"border-box"}} />
            </div>
            {/* ── Section Rémunération (niv4+/admin) ── */}
            {(lvl>=4||currentUser.isAdmin) && (
              <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                <div style={{color:"#C9A84C",fontWeight:800,fontSize:11,marginBottom:10}}>💰 Rémunération & Contrat</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  <div>
                    <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Salaire brut de base (FCFA)</label>
                    <input type="number" min={0} value={editCollabForm.salaireBase||""} onChange={e=>setEditCollabForm(f=>({...f,salaireBase:e.target.value?parseFloat(e.target.value):""}))}
                      placeholder={String((() => { try { return JSON.parse(_lsGet("gc-sirh-global-config")||"{}").salaireBaseDefaut||200000; } catch(_) { return 200000; } })())}
                      style={{width:"100%",background:"#0A1E40",border:"1px solid #C9A84C44",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,boxSizing:"border-box"}} />
                    <div style={{color:"#7A90B0",fontSize:8,marginTop:2}}>Laisser vide = salaire défaut SIRH</div>
                  </div>
                  <div>
                    <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Type de contrat</label>
                    <select value={editCollabForm.typeContrat||"CDI"} onChange={e=>setEditCollabForm(f=>({...f,typeContrat:e.target.value}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11}}>
                      {["CDI","CDD","Stage","Prestation","Consultant","Autre"].map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Matricule RH</label>
                    <input value={editCollabForm.matricule||""} onChange={e=>setEditCollabForm(f=>({...f,matricule:e.target.value}))} placeholder="Ex: GC-2024-001"
                      style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,boxSizing:"border-box"}} />
                  </div>
                </div>
              </div>
            )}
            {/* Avertissement si champs sensibles modifiés */}
            {(editCollabForm.level !== showEditCollab?.level || editCollabForm.process !== showEditCollab?.process) && (
              <div style={{background:"#F59E0B15",border:"1px solid #F59E0B44",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#F59E0B"}}>
                ⚠️ <strong>Champs sensibles modifiés</strong> (Niveau ou Processus) — Cette modification sera soumise au circuit d'approbation : Resp. Conformité (P02 Niv.4) → DG/Manager Général (Niv.5).
              </div>
            )}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{
                const hasSensitiveChange = editCollabForm.level !== showEditCollab.level || editCollabForm.process !== showEditCollab.process;
                if (hasSensitiveChange) {
                  // Circuit d'approbation obligatoire pour level/process
                  const confUser = users.find(u => _activeUser(u) && (u.process==="P02"||(u.processes||[]).includes("P02")) && u.level>=4 && !u.isAdmin);
                  const dgUser = users.find(u => _activeUser(u) && (u.isMG || u.level===5) && !u.isAdmin);
                  const approvalReq = {
                    id: "APPRO-SIRH-ACC-" + Date.now(),
                    type: "SIRH_ACCESS_CHANGE",
                    targetUserId: showEditCollab.id,
                    targetUserName: showEditCollab.name,
                    changes: {
                      level: { from: showEditCollab.level, to: editCollabForm.level },
                      process: { from: showEditCollab.process, to: editCollabForm.process },
                    },
                    nonSensitiveChanges: { name: editCollabForm.name, role: editCollabForm.role, email: editCollabForm.email, telephone: editCollabForm.telephone, startDate: editCollabForm.startDate, location: editCollabForm.location, sexe: editCollabForm.sexe, nationalite: editCollabForm.nationalite, adresse: editCollabForm.adresse, bio: editCollabForm.bio, salaireBase: editCollabForm.salaireBase !== "" ? editCollabForm.salaireBase : undefined, typeContrat: editCollabForm.typeContrat, matricule: editCollabForm.matricule },
                    initiatedBy: currentUser.id,
                    initiatedByName: currentUser.name,
                    initiatedAt: new Date().toISOString(),
                    status: "EN_ATTENTE_CONF",
                    confUserId: confUser?.id || null,
                    dgUserId: dgUser?.id || null,
                    motif: "",
                  };
                  // Appliquer immédiatement les champs non-sensibles
                  setUsers(prev => { const _u=prev.map(u => u.id===showEditCollab.id ? {
                    ...u,
                    name: editCollabForm.name, role: editCollabForm.role, email: editCollabForm.email,
                    telephone: editCollabForm.telephone, phone: editCollabForm.telephone,
                    startDate: editCollabForm.startDate, location: editCollabForm.location,
                    sexe: editCollabForm.sexe, nationalite: editCollabForm.nationalite,
                    adresse: editCollabForm.adresse, bio: editCollabForm.bio,
                    updatedAt: new Date().toISOString(), updatedBy: currentUser.id,
                  } : u); dsSave('users',_u); return _u; });
                  // Envoyer au circuit d'approbation
                  if(setPendingApprovals) setPendingApprovals(prev => [...prev, approvalReq]);
                  // Notifier le Resp Conformité (P02 niv4)
                  if(confUser) setNotifications(prev => [{id:"N"+Date.now(),icon:"🔐",message:`⚠️ Demande de changement d'accès SIRH en attente de votre validation — ${showEditCollab.name} (Niveau ${showEditCollab.level}→${editCollabForm.level})`,at:new Date().toISOString(),read:false,module:"sirh",forUser:confUser.id,urgent:true},...prev]);
                  // Notifier le DG
                  if(dgUser) setNotifications(prev => [{id:"N"+Date.now(),icon:"🔐",message:`⚠️ Changement d'accès SIRH soumis au circuit — ${showEditCollab.name} (Niv.${showEditCollab.level}→${editCollabForm.level} / ${showEditCollab.process}→${editCollabForm.process})`,at:new Date().toISOString(),read:false,module:"sirh",forUser:dgUser.id},...prev]);
                  playSound("success");
                  setShowEditCollab(null);
                  return;
                }
                // Pas de changement sensible — enregistrement direct
                setUsers(prev=>prev.map(u=>u.id===showEditCollab.id?{...u,...editCollabForm,telephone:editCollabForm.telephone,phone:editCollabForm.telephone,salaireBase:editCollabForm.salaireBase!==""?editCollabForm.salaireBase:u.salaireBase,typeContrat:editCollabForm.typeContrat||u.typeContrat,matricule:editCollabForm.matricule||u.matricule,updatedAt:new Date().toISOString(),updatedBy:currentUser.id}:u));
                setNotifications(prev=>[{id:"N"+Date.now(),icon:"✏️",message:`Fiche RH mise à jour : ${editCollabForm.name||showEditCollab.name} par ${currentUser.name}`,at:new Date().toISOString(),read:false,module:"sirh",targetLevel:4},...prev]);
                playSound("success");
                setShowEditCollab(null);
              }}
                style={{flex:1,background:"#A855F7",border:"none",color:"#fff",borderRadius:9,padding:"10px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                {(editCollabForm.level !== showEditCollab?.level || editCollabForm.process !== showEditCollab?.process)
                  ? "📤 Soumettre au circuit d'approbation"
                  : "✅ Enregistrer les modifications"}
              </button>
              <button onClick={()=>setShowEditCollab(null)} style={{background:"none",border:"1px solid #1E3A5F",color:"#7A90B0",borderRadius:9,padding:"10px 16px",cursor:"pointer",fontSize:12}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL SUSPENDRE COLLABORATEUR ── */}
      {showSuspendCollab && (
        <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setShowSuspendCollab(null);setSuspendMotif("");setSirhSuspAttachment(null);}}>
          <div style={{background:"#0D1F38",border:"1px solid #F59E0B44",borderRadius:14,padding:24,width:"100%",maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <h4 style={{color:"#F59E0B",margin:"0 0 14px",fontSize:13,fontWeight:800}}>⏸️ Suspension — {showSuspendCollab.name}</h4>
            <label style={{color:"#7A90B0",fontSize:10,display:"block",marginBottom:5,fontWeight:700,textTransform:"uppercase"}}>Motif de suspension *</label>
            <textarea value={suspendMotif} onChange={e=>setSuspendMotif(e.target.value)} rows={3} placeholder="Indiquez le motif de suspension..." style={{width:"100%",background:"#0A1E40",border:"1px solid #F59E0B44",borderRadius:8,padding:"8px 12px",color:"#E8EDF5",fontSize:11,resize:"vertical",boxSizing:"border-box",marginBottom:10}} />
            {/* Pièce justificative */}
            <div style={{marginBottom:10}}>
              <label style={{color:"#7A90B0",fontSize:10,display:"block",marginBottom:4,fontWeight:700,textTransform:"uppercase"}}>📎 Pièce justificative</label>
              <input type="file" onChange={e=>{const fi=e.target.files?.[0];if(!fi)return; _uploadFiles([fi], { module: 'sirh' }).then(([ref])=>{ if(ref) setSirhSuspAttachment({name:ref.nom,size:ref.taille,ref}); }).catch(err=>console.error('[SIRH] upload susp:', err)); e.target.value="";}} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"5px 8px",color:"#E8EDF5",fontSize:11}} />
              {sirhSuspAttachment && <div style={{color:"#22C55E",fontSize:10,marginTop:3}}>📎 {sirhSuspAttachment.name}</div>}
            </div>
            {/* Circuit info si non-admin/DG */}
            {!(currentUser.isAdmin||currentUser.level>=5) && (
              <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:7,padding:"7px 10px",color:"#F59E0B",fontSize:10,marginBottom:10,fontWeight:600}}>
                ⚠️ Cette demande sera soumise au DG pour approbation avant application.
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{
                if(!suspendMotif.trim()){gcAlert("Motif requis.");return;}
                const isDirectActor = currentUser.isAdmin || currentUser.level >= 5;
                if (isDirectActor) {
                  setUsers(prev=>{
                    const updated=prev.map(u=>u.id===showSuspendCollab.id?{...u,accountStatus:"SUSPENDU_PROVISOIRE",suspensionMotif:suspendMotif,suspensionBy:currentUser.id,suspensionByName:currentUser.name,suspensionAt:new Date().toISOString(),suspensionAttachment:sirhSuspAttachment||null}:u);
                    dsSave('users', updated);  // [FIX-SYNC] Persist suspension + broadcast to all users
                    return updated;
                  });
                  setNotifications(prev=>{
                    const notifs=[{id:"N"+Date.now(),icon:"⏸️",message:`[SIRH] ${showSuspendCollab.name} suspendu — ${suspendMotif} (par ${currentUser.name})`,at:new Date().toISOString(),read:false,module:"sirh"},...prev];
                    dsSave('gc-notifications', notifs);  // [FIX-SYNC] Sync notifications
                    return notifs;
                  });
                  playSound("alarm");
                } else {
                  const dgUser=(users||[]).find(u=>(u.isMG||u.id==="USR-MG-001"||u.level===5)&&!u.isAdmin);
                  const approvalReq={id:"APPRO-SIRH-SUSP-"+Date.now(),type:"SIRH_SUSPENSION",targetUserId:showSuspendCollab.id,targetUserName:showSuspendCollab.name,targetUserRole:showSuspendCollab.role,initiatedBy:currentUser.id,initiatedByName:currentUser.name,initiatedByRole:currentUser.role,initiatedAt:new Date().toISOString(),status:"EN_ATTENTE_DG",motif:suspendMotif,attachment:sirhSuspAttachment||null};
                  if(setPendingApprovals) setPendingApprovals(prev=>[...prev,approvalReq]);
                  if(dgUser) setNotifications(prev=>[{id:"N"+Date.now(),icon:"⏸️",message:`⏸️ Approbation DG requise (SIRH) : Suspension de ${showSuspendCollab.name} — Motif: ${suspendMotif} — par ${currentUser.name}`,at:new Date().toISOString(),read:false,module:"sirh",targetUsers:[dgUser.id]},...prev]);
                  playSound("notif");
                  gcAlert(`⏳ Demande soumise au DG.\n${showSuspendCollab.name} sera suspendu(e) après approbation DG.`);
                }
                setShowSuspendCollab(null);setSuspendMotif("");setSirhSuspAttachment(null);
              }} style={{flex:1,background:"#F59E0B",border:"none",color:"#fff",borderRadius:8,padding:"9px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                {(currentUser.isAdmin||currentUser.level>=5)?"⏸️ Suspendre directement":"📤 Soumettre au DG"}
              </button>
              <button onClick={()=>{setShowSuspendCollab(null);setSuspendMotif("");setSirhSuspAttachment(null);}} style={{background:"none",border:"1px solid #1E3A5F",color:"#7A90B0",borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIG FISCALE ── */}
      {tab==="config_fiscale" && (
        <div style={{padding:"16px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"12px 16px",background:"#A855F711",border:"1px solid #A855F733",borderRadius:10}}>
            <span style={{fontSize:20}}>⚙️</span>
            <div><div style={{color:T.text,fontWeight:800,fontSize:13}}>Configuration Fiscale OHADA</div><div style={{color:T.textMuted,fontSize:11}}>Paramètres TVA, IS, IRPP — accessible au management (Niv.4+)</div></div>
          </div>
          <FiscalConfigPanel T={T} currentUser={currentUser} />
        </div>
      )}
      {/* ── PARAMÈTRES SIRH — v117 ── */}
      {tab==="sirh_config" && lvl>=4 && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div>
              <div style={{color:T.text,fontWeight:900,fontSize:14}}>⚙️ Paramètres SIRH</div>
              <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>Configuration du temps de travail, congés, retards, paie et multi-processus</div>
            </div>
            {sirhCfgDraft ? (
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{saveSirhConfig(sirhCfgDraft);setSirhCfgDraft(null);setSirhCfgSaved(true);setTimeout(()=>setSirhCfgSaved(false),2500);setNotifications(p=>[{id:"N"+Date.now(),icon:"⚙️",message:"Paramètres SIRH mis à jour",at:new Date().toISOString(),read:false},...p]);}}
                  style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                  {sirhCfgSaved?"✅ Enregistré !":"💾 Enregistrer"}
                </button>
                <button onClick={()=>setSirhCfgDraft(null)} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            ) : (
              <button onClick={()=>setSirhCfgDraft({...sirhConfig})} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>✏️ Modifier</button>
            )}
          </div>
          {(()=>{
            const cfg = sirhCfgDraft || sirhConfig;
            const set = (k,v) => sirhCfgDraft && setSirhCfgDraft(d=>({...d,[k]:v}));
            const Field = ({label, k, type="number", min, max, unit}) => (
              <div style={{background:T.surface2,borderRadius:9,padding:"10px 14px",border:`1px solid ${T.border}`}}>
                <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{label}{unit&&<span style={{color:T.textDim,marginLeft:4,fontWeight:400}}>({unit})</span>}</div>
                {sirhCfgDraft ? (
                  <input type={type} value={cfg[k]} min={min} max={max}
                    onChange={e=>set(k, type==="number"?parseFloat(e.target.value)||0:e.target.value)}
                    style={{width:"100%",background:T.surface,border:`1px solid #A855F744`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:13,fontWeight:700,boxSizing:"border-box"}}/>
                ) : (
                  <div style={{color:"#A855F7",fontWeight:900,fontSize:16}}>{cfg[k]}<span style={{color:T.textDim,fontSize:11,fontWeight:400,marginLeft:4}}>{unit}</span></div>
                )}
              </div>
            );
            return (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                <div style={{gridColumn:"1/-1",color:"#A855F7",fontWeight:700,fontSize:12,paddingBottom:4,borderBottom:`1px solid #A855F733`}}>⏰ Temps de Travail</div>
                <Field label="Heures/Jour" k="heuresJour" min={1} max={12} unit="h"/>
                <Field label="Jours ouvrés/Mois" k="joursBase" min={15} max={31} unit="j"/>
                <Field label="Heure début" k="heureDebut" type="time" unit=""/>
                <Field label="Heure fin" k="heureFin" type="time" unit=""/>
                <Field label="Pause déjeuner" k="pauseDejeuner" min={0} max={120} unit="min"/>
                <Field label="Début pause" k="heureDebutPause" type="time" unit=""/>
                <Field label="Fin pause" k="heureFinPause" type="time" unit=""/>
                <div style={{gridColumn:"1/-1",color:"#22C55E",fontWeight:700,fontSize:12,paddingBottom:4,borderBottom:`1px solid #22C55E33`,marginTop:8}}>🌴 Quotas Congés</div>
                <Field label="Congés annuels" k="quotaCongesAnnuels" min={0} max={60} unit="j/an"/>
                <Field label="Congés maladie" k="quotaMaladie" min={0} max={30} unit="j/an"/>
                <div style={{gridColumn:"1/-1",color:"#F59E0B",fontWeight:700,fontSize:12,paddingBottom:4,borderBottom:`1px solid #F59E0B33`,marginTop:8}}>⚠️ Retards & Déductions</div>
                <Field label="Seuil tolérance retard" k="retardSeuilMin" min={0} max={60} unit="min"/>
                <Field label="Déduction/min retard" k="retardDeductionParMin" min={0} max={5000} unit="FCFA/min"/>
                <Field label="Taux heures sup" k="heuresSuppTaux" min={1} max={3} unit="×"/>
                <div style={{gridColumn:"1/-1",color:"#3B82F6",fontWeight:700,fontSize:12,paddingBottom:4,borderBottom:`1px solid #3B82F633`,marginTop:8}}>💰 Paie</div>
                <Field label="Salaire base défaut" k="salaireBaseDefaut" min={0} unit="FCFA"/>
                <div style={{gridColumn:"1/-1",color:"#C9A84C",fontWeight:700,fontSize:12,paddingBottom:4,borderBottom:`1px solid #C9A84C33`,marginTop:8}}>🔀 Multi-Processus</div>
                <div style={{background:T.surface2,borderRadius:9,padding:"10px 14px",border:`1px solid ${T.border}`,gridColumn:"span 2"}}>
                  <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Niveau minimum pour multi-processus</div>
                  {sirhCfgDraft ? (
                    <select value={cfg.multiProcessDepuisNiv} onChange={e=>set("multiProcessDepuisNiv",parseInt(e.target.value))}
                      style={{width:"100%",background:T.surface,border:`1px solid #C9A84C44`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:12}}>
                      {[[1,"Niv.1 — Exécutant"],[2,"Niv.2 — Opérationnel"],[3,"Niv.3 — Responsable"],[4,"Niv.4 — Manager"],[5,"Niv.5 — Direction"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : (
                    <div style={{color:"#C9A84C",fontWeight:900,fontSize:16}}>Niv.{cfg.multiProcessDepuisNiv}+</div>
                  )}
                  <div style={{color:T.textDim,fontSize:10,marginTop:4}}>Les collaborateurs de ce niveau peuvent être rattachés à plusieurs processus simultanément</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── MODAL RÉACTIVER COLLABORATEUR ── */}
      {showReactivateCollab && (
        <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowReactivateCollab(null)}>
          <div style={{background:"#0D1F38",border:"1px solid #22C55E44",borderRadius:14,padding:24,width:"100%",maxWidth:380}} onClick={e=>e.stopPropagation()}>
            <h4 style={{color:"#22C55E",margin:"0 0 14px",fontSize:13,fontWeight:800}}>▶️ Réactiver — {showReactivateCollab.name}</h4>
            <div style={{color:"#E8EDF5",fontSize:12,marginBottom:16}}>Confirmer la réactivation du compte de <strong>{showReactivateCollab.name}</strong> ?<br/><span style={{color:"#7A90B0",fontSize:10}}>Le compte repassera en statut Actif.</span></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setUsers(prev=>{const updated=prev.map(u=>u.id===showReactivateCollab.id?{...u,accountStatus:"ACTIF",suspensionMotif:null,suspensionBy:null,reactivatedAt:new Date().toISOString(),reactivatedBy:currentUser.id}:u);dsSave('users',updated);return updated;});setNotifications(prev=>{const notifs=[{id:"N"+Date.now(),icon:"▶️",message:`[RH] ${showReactivateCollab.name} réactivé par ${currentUser.name}`,at:new Date().toISOString(),read:false,module:"sirh",targetLevel:4},...prev];dsSave('gc-notifications',notifs);return notifs;});playSound("success");setShowReactivateCollab(null);}}
                style={{flex:1,background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"9px",cursor:"pointer",fontWeight:800,fontSize:12}}>▶️ Confirmer la réactivation</button>
              <button onClick={()=>setShowReactivateCollab(null)} style={{background:"none",border:"1px solid #1E3A5F",color:"#7A90B0",borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LISTE DES PRÉSENCES PAR JOURNÉE ── */}
      {tab==="liste_presences" && (
        <div>
          {/* ── FORMULAIRE CRÉATION PRÉSENCE MANUELLE ── */}
          {showPresenceForm && canApprove && (
            <div style={{background:"#A855F710",border:"2px solid #A855F744",borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:12}}>➕ Nouvelle fiche de présence / absence</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
                <div>
                  <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Collaborateur *</label>
                  <select value={presenceForm.userId} onChange={e=>setPresenceForm(f=>({...f,userId:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11}}>
                    <option value="">— Sélectionner —</option>
                    {allCollabs.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Date *</label>
                  <input type="date" value={presenceForm.date} onChange={e=>setPresenceForm(f=>({...f,date:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Type</label>
                  <select value={presenceForm.type} onChange={e=>setPresenceForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11}}>
                    <option value="PRESENT">✅ Présent</option>
                    <option value="ABSENT">❌ Absent</option>
                    <option value="RETARD">⏰ Retard</option>
                    <option value="MISSION">🚗 Mission</option>
                    <option value="TELETRAVAIL">💻 Télétravail</option>
                  </select>
                </div>
              </div>
              {presenceForm.type !== "ABSENT" && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                  <div>
                    <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Heure arrivée</label>
                    <input type="time" value={presenceForm.arrivee} onChange={e=>setPresenceForm(f=>({...f,arrivee:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                    {presenceForm.arrivee>"09:00"&&<div style={{color:"#F97316",fontSize:9,marginTop:2}}>⏰ Retard : {(()=>{const[h,m]=presenceForm.arrivee.split(":").map(Number);return Math.max(0,(h*60+m)-(9*60))+" min"})()}</div>}
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Heure départ</label>
                    <input type="time" value={presenceForm.depart} onChange={e=>setPresenceForm(f=>({...f,depart:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                    {presenceForm.depart>"17:00"&&<div style={{color:"#22C55E",fontSize:9,marginTop:2}}>⚡ H.Sup : {(()=>{const[h,m]=presenceForm.depart.split(":").map(Number);return Math.max(0,(h*60+m)-(17*60))+" min"})()}</div>}
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Pause (min)</label>
                    <input type="number" value={presenceForm.pause} onChange={e=>setPresenceForm(f=>({...f,pause:e.target.value}))} min="0" max="120" style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,textTransform:"uppercase",fontWeight:600}}>Début pause</label>
                    <input type="time" value={presenceForm.pauseDebut||"12:00"} onChange={e=>setPresenceForm(f=>({...f,pauseDebut:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,textTransform:"uppercase",fontWeight:600}}>Fin pause</label>
                    <input type="time" value={presenceForm.pauseFin||"13:00"} onChange={e=>setPresenceForm(f=>({...f,pauseFin:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 9px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                  </div>
                </div>
              )}
              <div style={{marginBottom:10}}>
                <label style={{color:T.textMuted,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase"}}>Motif {presenceForm.type==="ABSENT"?"(requis si sanction)":"(optionnel)"}</label>
                <input value={presenceForm.motif} onChange={e=>setPresenceForm(f=>({...f,motif:e.target.value}))} placeholder="Ex: Maladie, Mission extérieure, Sanction disciplinaire…" style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
              </div>
              {/* Récapitulatif calcul */}
              {presenceForm.type!=="ABSENT"&&presenceForm.arrivee&&presenceForm.depart&&(()=>{
                const [ah,am]=presenceForm.arrivee.split(":").map(Number);
                const [dh,dm]=presenceForm.depart.split(":").map(Number);
                const dureeMin=Math.max(0,(dh*60+dm)-(ah*60+am)-(parseInt(presenceForm.pause)||0));
                const baselineMin=8*60;
                const retardMin=presenceForm.arrivee>"09:00"?Math.max(0,(ah*60+am)-(9*60)):0;
                const hSupMin=Math.max(0,dureeMin-baselineMin);
                const manque=Math.max(0,baselineMin-dureeMin);
                return (
                  <div style={{background:T.surface2,border:`1px solid ${dureeMin>=baselineMin?"#22C55E44":"#F59E0B44"}`,borderRadius:8,padding:"8px 12px",marginBottom:10,display:"flex",gap:10,flexWrap:"wrap"}}>
                    <div style={{flex:1,fontSize:10,color:T.text}}>⏱️ Durée effective : <strong style={{color:dureeMin>=baselineMin?"#22C55E":"#F59E0B"}}>{Math.floor(dureeMin/60)}h{String(dureeMin%60).padStart(2,"0")}</strong> / 8h</div>
                    {retardMin>0&&<div style={{fontSize:10,color:"#F97316"}}>⚠️ Retard : {retardMin} min → déduction paie</div>}
                    {hSupMin>0&&<div style={{fontSize:10,color:"#22C55E"}}>⚡ H.Sup : {Math.floor(hSupMin/60)}h{String(hSupMin%60).padStart(2,"0")} → majoration paie</div>}
                    {manque>0&&!retardMin&&<div style={{fontSize:10,color:"#F59E0B"}}>📉 Quota non atteint : -{manque} min → déduction paie</div>}
                  </div>
                );
              })()}
              <div style={{display:"flex",gap:8}}>
                <button onClick={handleCreatePresence} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Enregistrer</button>
                <button onClick={()=>setShowPresenceForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
            <h4 style={{color:"#A855F7",margin:0,fontSize:13,fontWeight:800}}>📋 Liste des présences / absences</h4>
            <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <input type="date" value={presListDate} onChange={e=>setPresListDate(e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 9px",color:T.text,fontSize:11}} />
              <select value={presListFilter} onChange={e=>setPresListFilter(e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 9px",color:T.text,fontSize:11}}>
                <option value="all">Tous</option>
                <option value="PRESENT">✅ Présents</option>
                <option value="ABSENT">❌ Absents</option>
                <option value="RETARD">⏰ Retards</option>
                <option value="EN_CONGE">🌴 En congé</option>
              </select>
              {canApprove && <button onClick={()=>setShowPresenceForm(true)} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:800,fontSize:10}}>+ Créer</button>}
            </div>
          </div>
          {/* Alertes */}
          {(() => {
            const dayPres = presences.filter(p=>p.date===presListDate);
            const absNR = integratedCollabs.filter(u => { if(!_activeUser(u)) return false;const p=dayPres.find(d=>d.userId===u.id);const ec=leaves.find(l=>l.userId===u.id&&l.statut==="APPROUVE"&&l.debut<=presListDate&&l.fin>=presListDate);return !p&&!ec;});
            const retards = dayPres.filter(p=>p.arrivee>"09:00"||(p.retardMin||0)>0);
            const hsup = dayPres.filter(p=>(p.depart||"")>"17:00"||(p.heuresSup||0)>0);
            const alts = [...(absNR.length?[{c:"#EF4444",m:`${absNR.length} absent(s) sans fiche`,i:"⚠️"}]:[]),...(retards.length?[{c:"#F97316",m:`${retards.length} retard(s)`,i:"⏰"}]:[]),...(hsup.length?[{c:"#22C55E",m:`${hsup.length} H.Sup`,i:"⚡"}]:[])];
            return alts.length ? <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{alts.map((a,i)=><span key={i} style={{background:a.c+"15",border:`1px solid ${a.c}44`,borderRadius:6,padding:"4px 10px",color:a.c,fontSize:10,fontWeight:700}}>{a.i} {a.m}</span>)}</div> : null;
          })()}
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:T.surface2}}>
                {["Collaborateur","Statut","Arrivée","Départ","Durée","Retard","H.Sup","Motif","Impact paie",""].map(h=>(
                  <th key={h} style={{padding:"6px 7px",textAlign:"left",color:T.textMuted,fontSize:8,fontWeight:700,textTransform:"uppercase",borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {allCollabs.filter(collab=>{
                  const pres=presences.find(p=>p.userId===collab.id&&p.date===presListDate);
                  const ec=leaves.find(l=>l.userId===collab.id&&l.statut==="APPROUVE"&&l.debut<=presListDate&&l.fin>=presListDate);
                  const st=pres?.statut||(ec?"EN_CONGE":"ABSENT");
                  return presListFilter==="all"||st===presListFilter;
                }).map(collab=>{
                  const pres=presences.find(p=>p.userId===collab.id&&p.date===presListDate);
                  const ec=leaves.find(l=>l.userId===collab.id&&l.statut==="APPROUVE"&&l.debut<=presListDate&&l.fin>=presListDate);
                  const st=pres?.statut||(ec?"EN_CONGE":"ABSENT");
                  const sc={PRESENT:{c:"#22C55E",l:"Présent"},EN_POSTE:{c:"#3B82F6",l:"En poste"},ABSENT:{c:"#EF4444",l:"Absent"},EN_CONGE:{c:"#F59E0B",l:"En congé"},RETARD:{c:"#F97316",l:"Retard"},MISSION:{c:"#8B5CF6",l:"Mission"},TELETRAVAIL:{c:"#06B6D4",l:"Télétravail"}}[st]||{c:"#888",l:st};
                  let dm=pres?.dureeMin||0;
                  if(!dm&&pres?.arrivee&&pres?.depart){const[ah,am]=pres.arrivee.split(":").map(Number);const[dh,mns]=pres.depart.split(":").map(Number);dm=Math.max(0,(dh*60+mns)-(ah*60+am)-(pres.pause||60));}
                  const retM=pres?.retardMin||(pres?.arrivee>"09:00"?(()=>{const[h,m]=(pres.arrivee||"09:00").split(":").map(Number);return Math.max(0,(h*60+m)-540);})():0);
                  const hsM=pres?.heuresSup||Math.max(0,dm-480);
                  const manqM=st==="ABSENT"?480:Math.max(0,480-dm);
                  const impStr=st==="ABSENT"?"-8h abs":retM>0?`-${retM}min`:hsM>0?`+${Math.floor(hsM/60)}h${String(hsM%60).padStart(2,"0")}HS`:manqM>0&&dm>0?`-${manqM}min`:"=";
                  const impC=st==="ABSENT"||retM>0||manqM>0&&dm>0?"#EF4444":hsM>0?"#22C55E":T.textMuted;
                  return (
                    <tr key={collab.id} className="gc-tr-hover" style={{borderBottom:`1px solid ${T.border}20`}}>
                      <td style={{padding:"6px 7px"}}><div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:18,height:18,borderRadius:"50%",background:collab.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,color:"#fff",fontWeight:700}}>{collab.avatar}</div><span style={{color:T.text,fontSize:10,fontWeight:600}}>{collab.name}</span></div></td>
                      <td style={{padding:"6px 7px"}}><span style={{background:sc.c+"22",color:sc.c,borderRadius:5,padding:"1px 5px",fontSize:8,fontWeight:700}}>{sc.l}</span></td>
                      <td style={{padding:"6px 7px",fontFamily:"monospace",fontSize:10,color:T.text}}>{pres?.arrivee||"—"}{retM>0&&<span style={{color:"#F97316",fontSize:8}}> +{retM}m</span>}</td>
                      <td style={{padding:"6px 7px",fontFamily:"monospace",fontSize:10,color:T.text}}>{pres?.depart||"—"}{hsM>0&&<span style={{color:"#22C55E",fontSize:8}}> +{Math.floor(hsM/60)}h</span>}</td>
                      <td style={{padding:"6px 7px"}}>{dm>0?<span style={{color:dm>=480?"#22C55E":dm>=360?"#F59E0B":"#EF4444",fontSize:10,fontWeight:600}}>{Math.floor(dm/60)}h{String(dm%60).padStart(2,"0")}</span>:<span style={{color:T.textDim,fontSize:10}}>—</span>}</td>
                      <td style={{padding:"6px 7px",fontSize:10,color:"#F97316"}}>{retM>0?`${retM}m`:"—"}</td>
                      <td style={{padding:"6px 7px",fontSize:10,color:"#22C55E"}}>{hsM>0?`${Math.floor(hsM/60)}h${String(hsM%60).padStart(2,"0")}`:"—"}</td>
                      <td style={{padding:"6px 7px",fontSize:9,color:T.textMuted,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pres?.motif||ec?`Congé`:"—"}</td>
                      <td style={{padding:"6px 7px"}}><span style={{color:impC,fontSize:8,fontWeight:700,background:impC+"15",borderRadius:4,padding:"1px 5px"}}>{impStr}</span></td>
                      <td style={{padding:"4px 6px"}}>{canApprove&&<div style={{display:"flex",gap:3}}><button onClick={()=>{setPresenceForm({userId:collab.id,date:presListDate,arrivee:pres?.arrivee||"09:00",depart:pres?.depart||"17:00",pause:pres?.pause||60,statut:pres?.statut||"PRESENT",motif:pres?.motif||"",type:pres?.type||"PRESENT"});setShowPresenceForm(true);}} style={{background:"#3B82F615",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:8}}>✏️</button>{pres&&<button onClick={async () => {if(!await gcConfirm("Supprimer ?"))return;savePresences(prev=>prev.filter(p=>!(p.userId===collab.id&&p.date===presListDate)));}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:8}}>🗑</button>}</div>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BASE SIRH ── */}
      {tab==="base_sirh" && canApprove && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <h4 style={{color:"#A855F7",margin:0,fontSize:13,fontWeight:800}}>🗄️ Base de données SIRH — Vue consolidée</h4>
            {lvl>=4&&<button onClick={()=>setTab("fichiers")} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗃️ Base Fichiers RH →</button>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
            {[
              {l:"Total présences",v:presences.length,c:"#3B82F6",i:"⏱️"},
              {l:"Total congés",v:leaves.length,c:"#F59E0B",i:"🌴"},
              {l:"Collaborateurs",v:allCollabs.length,c:"#22C55E",i:"👥"},
              {l:"Bulletins de paie",v:(()=>{try{return JSON.parse(_lsGet("gc-paie-transferts")||"[]").length;}catch (_) {return 0;}})(),c:"#A855F7",i:"💰"},
            ].map(s=><div key={s.l} style={{background:T.surface2,border:`1px solid ${s.c}33`,borderRadius:10,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:18}}>{s.i}</span><span style={{color:s.c,fontSize:20,fontWeight:900}}>{s.v}</span></div>
              <div style={{color:T.textMuted,fontSize:10,marginTop:4}}>{s.l}</div>
            </div>)}
          </div>
          {/* Per-collab summary */}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {allCollabs.map(collab=>{
              const myPres = presences.filter(p=>p.userId===collab.id);
              const myLeav = leaves.filter(l=>l.userId===collab.id);
              const retards = myPres.filter(p=>p.retardMin>0||(p.arrivee||"09:00")>"09:00").length;
              const hsup = myPres.filter(p=>(p.heuresSup||0)>0||(p.depart||"")>"17:00").length;
              const payBulletins = (() =>{try{return JSON.parse(_lsGet("gc-paie-transferts")||"[]").filter(b=>b.empId===collab.id).length;}catch (_) {return 0;}})();
              return (
                <div key={collab.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:collab.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700,overflow:"hidden",flexShrink:0}}>
                    {collab.photoUrl?<img src={collab.photoUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="" />:collab.avatar}
                  </div>
                  <div style={{flex:1,minWidth:120}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{collab.name}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>{collab.role} · {collab.process}</div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {[
                      {l:"Fiches présence",v:myPres.length,c:"#3B82F6"},
                      {l:"Congés",v:myLeav.length,c:"#F59E0B"},
                      {l:"Retards",v:retards,c:"#F97316"},
                      {l:"H.Sup",v:hsup,c:"#22C55E"},
                      {l:"Bulletins paie",v:payBulletins,c:"#A855F7"},
                    ].map(s=><div key={s.l} style={{background:s.c+"15",border:`1px solid ${s.c}33`,borderRadius:7,padding:"5px 9px",textAlign:"center"}}>
                      <div style={{color:s.c,fontWeight:900,fontSize:14}}>{s.v}</div>
                      <div style={{color:T.textDim,fontSize:8}}>{s.l}</div>
                    </div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ ÉVALUATION DU PERSONNEL ══ */}
      {tab==="evaluation_personnel" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{color:"#F59E0B",fontWeight:800,fontSize:13}}>⭐ Évaluation du Personnel</div>
              <div style={{color:T.textDim,fontSize:10}}>Évaluations individuelles · Critères SMART · Publication aux responsables Niv.4+</div>
            </div>
            {canApprove&&(
              <button onClick={async () => {
                const collabId = await gcPrompt("ID ou nom du collaborateur à évaluer (ex: USR-XXX) :");
                if(!collabId)return;
                const collab=allCollabs.find(u=>u.id===collabId||u.name.toLowerCase().includes(collabId.toLowerCase()));
                if(!collab){gcAlert("Collaborateur introuvable.");return;}
                const already=evaluations.find(e=>e.collabId===collab.id&&e.periode===new Date().getFullYear()+"");
                if(already){gcAlert(`⚠️ Une évaluation pour ${collab.name} (${new Date().getFullYear()}) existe déjà. Utilisez l'édition.`);return;}
                const newEval={
                  id:"EVAL-"+Date.now(),collabId:collab.id,collabName:collab.name,
                  evaluateurId:currentUser.id,evaluateurName:currentUser.name,
                  periode:new Date().getFullYear()+"",
                  createdAt:new Date().toISOString(),statut:"BROUILLON",
                  publie:false,publishedTo:[],
                  criteres:{competences:0,performance:0,leadership:0,collaboration:0,innovation:0,engagement:0},
                  commentaire:"",pointsForts:"",pointsAmeliorer:"",objectifsN1:"",
                };
                saveEvaluations([newEval,...evaluations]);
                setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"⭐",message:`Évaluation créée pour ${collab.name} (${new Date().getFullYear()}) — En brouillon`,at:new Date().toISOString(),read:false,module:"sirh"},...p]);
              }} style={{background:"#F59E0B",border:"none",color:"#000",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>➕ Créer évaluation</button>
            )}
          </div>

          {/* KPIs */}
          {evaluations.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
              {[
                {l:"Total évaluations",v:evaluations.length,c:"#F59E0B"},
                {l:"Publiées",v:evaluations.filter(e=>e.publie).length,c:"#22C55E"},
                {l:"Brouillons",v:evaluations.filter(e=>e.statut==="BROUILLON").length,c:"#3B82F6"},
                {l:"Moy. globale",v:(()=>{const done=evaluations.filter(e=>e.statut==="FINALISÉ");if(!done.length)return"—";const avg=done.reduce((a,e)=>{const s=Object.values(e.criteres||{}).reduce((x,y)=>x+y,0)/6;return a+s;},0)/done.length;return avg.toFixed(1)+"/5";})(),c:"#A855F7"},
              ].map(s=>(
                <div key={s.l} style={{background:T.surface2,border:`2px solid ${s.c}33`,borderRadius:10,padding:"12px",textAlign:"center"}}>
                  <div style={{color:s.c,fontWeight:900,fontSize:20}}>{s.v}</div>
                  <div style={{color:T.textMuted,fontSize:9,marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>
          )}

          {evaluations.length===0?<div style={{color:T.textDim,textAlign:"center",padding:28,background:T.surface2,borderRadius:10,border:`1px dashed ${T.border}`}}>
            Aucune évaluation — {canApprove?"cliquez ➕ Créer évaluation":"Aucune évaluation disponible"}
          </div>:(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {evaluations.map(ev=>{
                const avgScore=Object.values(ev.criteres||{}).reduce((a,b)=>a+b,0)/6;
                const scoreColor=avgScore>=4?"#22C55E":avgScore>=3?"#F59E0B":avgScore>=2?"#F97316":"#EF4444";
                const isMine=ev.evaluateurId===currentUser.id||canApprove;
                const isVisible=canApprove||ev.publishedTo?.includes(currentUser.id)||ev.publie;
                if(!isVisible)return null;
                return(
                  <div key={ev.id} style={{background:T.surface2,border:`1px solid ${ev.publie?"#22C55E":"#F59E0B"}33`,borderRadius:12,padding:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div>
                        <div style={{color:T.text,fontWeight:700,fontSize:13}}>{ev.collabName} <span style={{color:T.textDim,fontSize:10,fontWeight:400}}>· {ev.periode}</span></div>
                        <div style={{color:T.textMuted,fontSize:10}}>Évaluateur : {ev.evaluateurName} · {formatDate(ev.createdAt)}</div>
                        <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                          <span style={{background:ev.statut==="FINALISÉ"?"#22C55E22":"#F59E0B22",color:ev.statut==="FINALISÉ"?"#22C55E":"#F59E0B",borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700}}>{ev.statut}</span>
                          {ev.publie&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700}}>✅ Publié aux responsables</span>}
                        </div>
                      </div>
                      {avgScore>0&&<div style={{textAlign:"right"}}>
                        <div style={{color:scoreColor,fontWeight:900,fontSize:24}}>{avgScore.toFixed(1)}</div>
                        <div style={{color:T.textDim,fontSize:9}}>/5 — Moyenne</div>
                      </div>}
                    </div>
                    {/* Grille des critères */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:10}}>
                      {[["competences","🧠 Compétences"],["performance","📈 Performance"],["leadership","👑 Leadership"],["collaboration","🤝 Collaboration"],["innovation","💡 Innovation"],["engagement","🔥 Engagement"]].map(([k,l])=>(
                        <div key={k} style={{background:T.surface3,borderRadius:7,padding:"6px 10px"}}>
                          <div style={{color:T.textMuted,fontSize:9,marginBottom:4}}>{l}</div>
                          {isMine&&ev.statut!=="FINALISÉ"?(
                            <div style={{display:"flex",gap:3}}>
                              {[1,2,3,4,5].map(star=>(
                                <button key={star} onClick={()=>saveEvaluations(evaluations.map(x=>x.id===ev.id?{...x,criteres:{...x.criteres,[k]:star}}:x))}
                                  style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:ev.criteres[k]>=star?"#F59E0B":"#334155",padding:"0 1px"}}>★</button>
                              ))}
                            </div>
                          ):(
                            <div style={{display:"flex",gap:2}}>
                              {[1,2,3,4,5].map(star=><span key={star} style={{fontSize:12,color:ev.criteres[k]>=star?"#F59E0B":"#334155"}}>★</span>)}
                            </div>
                          )}
                          <div style={{color:ev.criteres[k]>0?"#F59E0B":T.textDim,fontSize:9,marginTop:2,fontWeight:700}}>{ev.criteres[k]||0}/5</div>
                        </div>
                      ))}
                    </div>
                    {/* Commentaires */}
                    {isMine&&ev.statut!=="FINALISÉ"&&(
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                        {[{l:"Points forts",k:"pointsForts",ph:"Qualités remarquées…"},{l:"Points à améliorer",k:"pointsAmeliorer",ph:"Axes de progression…"},{l:"Commentaire général",k:"commentaire",ph:"Synthèse de l'évaluation…",span:1},{l:"Objectifs N+1",k:"objectifsN1",ph:"Objectifs pour l'année prochaine…"}].map(f=>(
                          <div key={f.k} style={{gridColumn:`span ${f.span||1}`}}>
                            <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                            <textarea value={ev[f.k]||""} onChange={e=>saveEvaluations(evaluations.map(x=>x.id===ev.id?{...x,[f.k]:e.target.value}:x))} placeholder={f.ph} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:10,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Affichage si finalisé */}
                    {ev.statut==="FINALISÉ"&&(ev.pointsForts||ev.commentaire)&&(
                      <div style={{background:T.surface3,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:10}}>
                        {ev.pointsForts&&<div style={{color:"#22C55E",marginBottom:4}}><strong>Points forts :</strong> {ev.pointsForts}</div>}
                        {ev.pointsAmeliorer&&<div style={{color:"#F59E0B",marginBottom:4}}><strong>À améliorer :</strong> {ev.pointsAmeliorer}</div>}
                        {ev.commentaire&&<div style={{color:T.textMuted}}><strong>Commentaire :</strong> {ev.commentaire}</div>}
                      </div>
                    )}
                    {/* Actions */}
                    {isMine&&(
                      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                        {ev.statut==="BROUILLON"&&(
                          <button onClick={()=>{if(!Object.values(ev.criteres||{}).every(v=>v>0)){gcAlert("Renseignez tous les critères (1-5 étoiles) avant de finaliser.");return;}saveEvaluations(evaluations.map(x=>x.id===ev.id?{...x,statut:"FINALISÉ",finalisedAt:new Date().toISOString()}:x));setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"⭐",message:`Évaluation de ${ev.collabName} finalisée`,at:new Date().toISOString(),read:false,module:"sirh"},...p]);}}
                            style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Finaliser</button>
                        )}
                        {ev.statut==="FINALISÉ"&&!ev.publie&&canApprove&&(
                          <button onClick={()=>{
                            // Publier uniquement aux responsables niv4+
                            const responsables=users.filter(u=>_activeUser(u)&&u.level>=4&&!u.isAdmin&&u.id!==currentUser.id);
                            const ids=responsables.map(u=>u.id);
                            saveEvaluations(evaluations.map(x=>x.id===ev.id?{...x,publie:true,publishedTo:ids,publishedAt:new Date().toISOString(),publishedBy:currentUser.name}:x));
                            responsables.forEach(u=>gcPushNotif(u.id,{id:"N"+Date.now()+u.id,icon:"⭐",message:`[ÉVALUATION] ${ev.collabName} — Évaluation ${ev.periode} publiée par ${currentUser.name}`,at:new Date().toISOString(),read:false,module:"sirh"}));
                            setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📢",message:`Évaluation ${ev.collabName} publiée à ${responsables.length} responsable(s) Niv.4+`,at:new Date().toISOString(),read:false},...p]);
                            gcAlert(`✅ Évaluation publiée à ${responsables.length} responsable(s) niveau 4+.`);
                          }} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>📤 Publier aux responsables Niv.4+</button>
                        )}
                        {ev.publie&&<span style={{color:"#22C55E",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>✅ Publié le {formatDate(ev.publishedAt)} par {ev.publishedBy}</span>}
                        <button onClick={async () => {if(await gcConfirm(`Supprimer l'évaluation de ${ev.collabName} ?`))saveEvaluations(evaluations.filter(x=>x.id!==ev.id));}}
                          style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DEMANDES DE RÉINTÉGRATION ── */}
      {tab==="conges" && canApprove && (
        <div style={{marginTop:16,borderTop:`1px solid ${T.border}`,paddingTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h5 style={{color:"#F97316",margin:0,fontSize:12,fontWeight:800}}>🔄 Demandes de réintégration / réhabilitation</h5>
          </div>
          {allCollabs.filter(u=>_activeUser(u)&&(u.accountStatus==="SUSPENDU_PROVISOIRE"||u.accountStatus==="SUSPENDU_DEFINITIF")).map(u=>(
            <div key={u.id} style={{background:T.surface2,border:"1px solid #F9741644",borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:u.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,overflow:"hidden"}}>{u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar}</div>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:700,fontSize:12}}>{u.name} — <span style={{color:"#EF4444"}}>{u.accountStatus==="SUSPENDU_DEFINITIF"?"Suspendu définitivement":"Suspendu provisoirement"}</span></div>
                <div style={{color:T.textMuted,fontSize:10}}>{u.suspensionMotif||"Motif non renseigné"}</div>
              </div>
              {showReintForm?.id===u.id ? (
                <div style={{display:"flex",flexDirection:"column",gap:6,flex:2}}>
                  <select value={reintForm.type} onChange={e=>setReintForm(f=>({...f,type:e.target.value}))} style={{background:T.surface3,border:"1px solid #F9741644",borderRadius:6,padding:"5px 8px",color:T.text,fontSize:10}}>
                    <option value="REINSTATEMENT">Réintégration complète</option>
                    <option value="REHABILITATION">Réhabilitation partielle</option>
                    <option value="LEVEE_SANCTION">Levée de sanction</option>
                  </select>
                  <input value={reintForm.motif} onChange={e=>setReintForm(f=>({...f,motif:e.target.value}))} placeholder="Motif de la demande…" style={{background:T.surface3,border:"1px solid #F9741644",borderRadius:6,padding:"5px 8px",color:T.text,fontSize:10,boxSizing:"border-box",width:"100%"}} />
                  <input type="date" value={reintForm.dateEffet} onChange={e=>setReintForm(f=>({...f,dateEffet:e.target.value}))} style={{background:T.surface3,border:"1px solid #F9741644",borderRadius:6,padding:"5px 8px",color:T.text,fontSize:10}} />
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{
                      const req={id:`REIN-${Date.now()}`,userId:u.id,userName:u.name,...reintForm,createdBy:currentUser.id,createdAt:new Date().toISOString(),status:"EN_ATTENTE"};
                      saveReinstatement(req);
                      setNotifications(p=>[{id:"N"+Date.now(),icon:"🔄",message:`Demande de réintégration soumise pour ${u.name}`,at:new Date().toISOString(),read:false,module:"sirh"},...p]);
                      setShowReintForm(null);
                      playSound("success");
                      gcAlert(`✅ Demande de ${reintForm.type.toLowerCase()} soumise pour ${u.name}. La DG sera notifiée.`);
                    }} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontWeight:800,fontSize:10}}>✅ Soumettre</button>
                    <button onClick={()=>setShowReintForm(null)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10}}>Annuler</button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>{setShowReintForm(u);setReintForm({type:"REINSTATEMENT",motif:"",dateEffet:today});}} style={{background:"#F9741622",border:"1px solid #F9741644",color:"#F97316",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:10,flexShrink:0}}>🔄 Demander réintégration</button>
              )}
            </div>
          ))}
          {allCollabs.filter(u=>_activeUser(u)&&u.accountStatus==="SUSPENDU_PROVISOIRE"||u.accountStatus==="SUSPENDU_DEFINITIF").length===0&&(
            <div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:10}}>Aucun compte suspendu actuellement.</div>
          )}
        </div>
      )}

      {/* ── CONGÉS ── */}
      {tab==="conges" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <h4 style={{color:"#A855F7",margin:0,fontSize:13,fontWeight:800}}>🌴 Gestion des Congés & Absences</h4>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setShowForm(!showForm)} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nouvelle demande</button>
              {canApprove&&<button onClick={handlePurgeTreatedLeaves} title="Purger les congés approuvés et refusés" style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>🗑 Purger traités</button>}
            </div>
          </div>
          {showForm && (
            <div style={{background:T.surface2,border:"1px solid #A855F744",borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Collaborateur *</label>
                  <select value={leaveForm.userId} onChange={e=>setLeaveForm(f=>({...f,userId:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11}}>
                    <option value="">— Sélectionner —</option>
                    {/* FIX v152 — tous voient tous les collègues ; pour demander pour soi-même la valeur par défaut est son propre ID */}
                    {(canApprove ? allCollabs : [users.find(u=>u.id===currentUser.id)].filter(Boolean)).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Type de congé</label>
                  <select value={leaveForm.type} onChange={e=>setLeaveForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11}}>
                    {Object.entries(LEAVE_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <InputField label="Date début *" type="date" value={leaveForm.debut} onChange={e=>setLeaveForm(f=>({...f,debut:e.target.value}))} T={T} />
                <InputField label="Date fin *" type="date" value={leaveForm.fin} onChange={e=>setLeaveForm(f=>({...f,fin:e.target.value}))} T={T} />
                <div style={{gridColumn:"span 2"}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Motif</label>
                  <textarea value={leaveForm.motif} onChange={e=>setLeaveForm(f=>({...f,motif:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} />
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={handleLeaveSubmit} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Soumettre</button>
                <button onClick={()=>setShowForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          {/* ── Filtres Congés ── */}
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={leaveSearch} onChange={e=>setLeaveSearch(e.target.value)} placeholder="🔍 Nom, type de congé…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <select value={leaveTypeFilter} onChange={e=>setLeaveTypeFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">📋 Tous types</option>
              {Object.entries(LEAVE_TYPES||{}).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
            <select value={leaveStatusFilter} onChange={e=>setLeaveStatusFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🔍 Tous statuts</option>
              <option value="EN_ATTENTE">⏳ En attente</option>
              <option value="APPROUVE">✅ Approuvés</option>
              <option value="REFUSE">❌ Refusés</option>
            </select>
            <span style={{color:T.textDim,fontSize:10}}>{filteredLeaves.length}/{myLeaves.length}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filteredLeaves.length===0 && <div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:30}}>Aucune demande de congé.</div>}
            {filteredLeaves.sort((a,b)=>b.createdAt?.localeCompare(a.createdAt||"")||0).map(l=>{
              const u=users.find(x=>x.id===l.userId);
              const sc=LEAVE_STATUT[l.statut]||{c:"#888",l:l.statut};
              const nb=l.debut&&l.fin?Math.ceil((new Date(l.fin)-new Date(l.debut))/86400000)+1:0;
              return (
                <div key={l.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:12,alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                      <span style={{color:T.text,fontWeight:700,fontSize:12}}>{u?.name||l.userId}</span>
                      <span style={{background:sc.c+"22",color:sc.c,border:`1px solid ${sc.c}44`,borderRadius:6,padding:"1px 7px",fontSize:9,fontWeight:700}}>{sc.l}</span>
                      <span style={{background:T.surface3,borderRadius:5,padding:"1px 7px",fontSize:9,color:T.textMuted}}>{LEAVE_TYPES[l.type]||l.type}</span>
                    </div>
                    <div style={{color:T.textMuted,fontSize:11}}>{l.debut} → {l.fin} · {nb} jour(s) {l.motif?`· ${l.motif}`:""}</div>
                    {l.refusMotif && <div style={{color:"#EF4444",fontSize:10,marginTop:2}}>Motif refus : {l.refusMotif}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,flexDirection:"column"}}>
                    {canApprove && l.statut==="EN_ATTENTE" && (
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>handleLeaveAction(l.id,"approve")} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontWeight:700,fontSize:10}}>✅ Approuver</button>
                        <button onClick={async () => {const m=await gcPrompt("Motif du refus :","","Refus de congé","❌");handleLeaveAction(l.id,"refuse",m||"Refusé par le responsable");}} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontWeight:700,fontSize:10}}>❌ Refuser</button>
                      </div>
                    )}
                    {(canApprove || l.userId===currentUser.id) && (
                      <button onClick={()=>handleDeleteLeave(l.id)} style={{background:"#6B728015",border:"1px solid #6B728033",color:T.textMuted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:9}}>🗑 Supprimer</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RECRUTEMENT ── */}
      {tab==="recrutement" && lvl>=3 && (
        <RecrutementPanel T={T} currentUser={currentUser} users={users} setUsers={setUsers}
          recrutements={recrutements} setRecrutements={setRecrutements}
          rdvs={rdvs} setRdvs={setRdvs} taches={taches} setTaches={setTaches}
          setNotifications={setNotifications} isDemoMode={isDemoMode} today={today}
          REC_STAGES={REC_STAGES} REC_STAGE_LABELS={REC_STAGE_LABELS} dossiers={dossiers} />
      )}

      {/* ── PAIE ── */}
      {/* ── BASE FICHIERS TRAITEMENT ── */}
      {tab==="fichiers" && lvl>=4 && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{color:"#A855F7",fontWeight:800,fontSize:13}}>🗃️ Base de Fichiers RH</div>
            {canApprove&&<button onClick={()=>setTab("base_sirh")} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗄️ Base SIRH →</button>}
          </div>
          <BaseFichiersRH T={T} currentUser={currentUser} users={allCollabs} isDemoMode={isDemoMode} />
        </div>
      )}

      {tab==="paie" && lvl>=4 && (
        <div>
          <h4 style={{color:"#A855F7",margin:"0 0 14px",fontSize:13,fontWeight:800}}>💰 Module Paie — Calcul des Bulletins</h4>
          <div style={{background:T.surface2,border:"1px solid #A855F744",borderRadius:12,padding:16}}>
            <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>🧮 Simulateur de bulletin de paie (droit gabonais)</div>
            <PaieSimulateur T={T} users={visibleCollabs} currentUser={currentUser} setNotifications={setNotifications} allUsers={users} />
          </div>
        </div>
      )}

      {/* ── ONBOARDING / INTÉGRATIONS SIRH ── */}
      {tab==="onboarding" && canApprove && (
        <div>
          <div style={{background:"#A855F711",border:"1px solid #A855F744",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:11,color:T.text}}>
            🆕 <strong>Intégrations en attente</strong> — Ces collaborateurs ont été créés mais ne sont pas encore intégrés dans la base SIRH. Finalisez leur intégration (fiche présence, solde congés, paramètres paie).
          </div>
          {pendingOnboarding.length === 0 ? (
            <div style={{background:T.surface2,borderRadius:10,padding:40,textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:8}}>✅</div>
              <div style={{color:T.textMuted,fontSize:13}}>Toutes les intégrations SIRH sont à jour</div>
            </div>
          ) : pendingOnboarding.map(collab => {
            const handleConfirmOnboarding = async () => {
              if (!await gcConfirm(`Confirmer l'intégration SIRH de ${collab.name} ?\n\nCela créera :\n• Une fiche de présence initiale\n• Un solde de congés annuels (20 jours)\n• L'accès à la gestion paie`)) return;
              const todayDate = new Date().toISOString().split("T")[0];
              savePresences(prev => {
                const exists = prev.find(p => p.userId===collab.id && p.date===todayDate);
                if (exists) return prev;
                return [...prev, { id:`PRE-${Date.now()}`, userId:collab.id, date:todayDate, arrivee:null, depart:null, pause:60, statut:"ABSENT", notes:"Intégration SIRH — 1er jour" }];
              });
              setUsers(prev => { const _u=prev.map(u=>u.id===collab.id?{...u,needsSirhOnboarding:false,sirhIntegratedAt:new Date().toISOString(),sirhIntegratedBy:currentUser.id}:u); dsSave('users',_u); return _u; });
              setNotifications(prev => [{id:"N"+Date.now(),icon:"✅",message:`Intégration SIRH confirmée : ${collab.name} — Fiche présence créée, solde congés initialisé`,at:new Date().toISOString(),read:false,module:"sirh"},...prev]);
              gcAlert(`✅ ${collab.name} intégré(e) dans la base SIRH.\n\n• Fiche de présence créée\n• Solde congés : 20 jours\n• Accessible dans la gestion des présences et de la paie`);
            };
            const createdHow = collab.createdByDG ? "Créé par DG" : collab.createdByAdmin ? "Créé par Admin" : collab.createdViaApproval ? "Via approbation" : "Manuel";
            return (
              <div key={collab.id} style={{background:T.surface2,border:"2px solid #A855F744",borderRadius:12,padding:16,marginBottom:10}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:collab.color||"#A855F7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",fontWeight:800,flexShrink:0,border:"2px solid #fff2"}}>
                    {collab.photoUrl ? <img src={collab.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}} /> : collab.avatar}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:800,fontSize:14}}>{collab.name}</div>
                    <div style={{color:T.textMuted,fontSize:11}}>{collab.role} · Niv.{collab.level} · {collab.process}</div>
                    <div style={{color:T.textDim,fontSize:10,fontFamily:"monospace"}}>{collab.id} · {collab.email || "—"}</div>
                  </div>
                  <span style={{background:"#A855F722",color:"#A855F7",border:"1px solid #A855F744",borderRadius:8,padding:"3px 10px",fontSize:9,fontWeight:700}}>{createdHow}</span>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                  {collab.sexe&&collab.sexe!=="N/A"&&<span style={{background:T.surface3,borderRadius:6,padding:"2px 8px",fontSize:10,color:T.textMuted}}>Genre : {collab.sexe==="M"?"Masculin":"Féminin"}</span>}
                  {collab.nationalite&&<span style={{background:T.surface3,borderRadius:6,padding:"2px 8px",fontSize:10,color:T.textMuted}}>🌍 {collab.nationalite}</span>}
                  {collab.telephone&&<span style={{background:T.surface3,borderRadius:6,padding:"2px 8px",fontSize:10,color:T.textMuted}}>📞 {collab.telephone}</span>}
                  {collab.adresse&&<span style={{background:T.surface3,borderRadius:6,padding:"2px 8px",fontSize:10,color:T.textMuted}}>📍 {collab.adresse}</span>}
                  <span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>⏳ Onboarding en attente</span>
                </div>
                <button onClick={handleConfirmOnboarding} style={{width:"100%",background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:9,padding:"11px 16px",cursor:"pointer",fontWeight:800,fontSize:13}}>
                  ✅ Confirmer l'intégration SIRH — {collab.name}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


export function RecrutementPanel(props) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const { T, currentUser, users, setUsers, recrutements, setRecrutements, rdvs, setRdvs, taches, setTaches, setNotifications, isDemoMode, today, REC_STAGES, REC_STAGE_LABELS, dossiers } = props;
  const lvl = currentUser.level;
  const [view, setView] = useState("list"); // list | detail | candidat
  const [selectedRec, setSelectedRec] = useState(null);
  const [selectedCand, setSelectedCand] = useState(null);
  const [recTab, setRecTab] = useState("candidats"); // candidats | docs | entretiens | analyse | onboarding
  const [showNewRec, setShowNewRec] = useState(false);
  const [newRecForm, setNewRecForm] = useState({ poste:"", departement:currentUser.process||"", description:"", priorite:"NORMALE", docsRequis:[], responsableId:"" });
  const [newDocInput, setNewDocInput] = useState("");
  const [showNewCand, setShowNewCand] = useState(false);
  const [newCandForm, setNewCandForm] = useState({ nom:"", email:"", tel:"", cv:"", note:"", commentaire:"" });
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [memoDec, setMemoDec] = useState({});
  const [showScheduleModal, setShowScheduleModal] = useState(null); // {rec, cand}
  const [scheduleForm, setScheduleForm] = useState({ date:"", heure:"09:00", lieu:"", responsableId:"", note:"" });

  const saveRec = (updated) => {
    setRecrutements(updated);
    if(!isDemoMode) try { _lsSet("gc-sirh-recrutements", JSON.stringify(updated)); dsSave('gc-sirh-recrutements', updated).catch(err => gcToast.syncError('', err)); } catch (_) {}
  };

  const handleCreateRec = () => {
    if(!newRecForm.poste.trim()) return;
    const now = new Date().toISOString();
    const newR = { id:`REC-${Date.now()}`, ...newRecForm, demandeurId:currentUser.id, dateDemande:today, statut:"EN_COURS", candidats:[], entretiens:[], docsRequis:newRecForm.docsRequis };
    const updated = [...recrutements, newR];
    saveRec(updated);
    const procRespUsers = users.filter(u=>_activeUser(u)&&u.process===newRecForm.departement&&u.level>=3&&u.id!==currentUser.id);
    const dgUsers = users.filter(u=>_activeUser(u)&&u.level>=5&&!u.isAdmin);
    const allNotifyIds = [...new Set([newRecForm.responsableId,...procRespUsers.map(u=>u.id),...dgUsers.map(u=>u.id)].filter(Boolean))];
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"🎯",message:`🎯 Nouvelle mission recrutement : ${newRecForm.poste} (${newRecForm.priorite}) — initiée par ${currentUser.name} pour le processus ${newRecForm.departement}`,at:now,read:false,module:"sirh",targetUsers:allNotifyIds},...prev]);
    if(procRespUsers.length>0||newRecForm.responsableId) {
      const avisResponsable = procRespUsers[0] || users.find(u=>u.id===newRecForm.responsableId);
      if(avisResponsable) {
        setTaches(prev=>[{id:"T"+Date.now(),titre:`Avis requis — Recrutement : ${newRecForm.poste}`,description:`La RH a initié une mission de recrutement pour votre processus (${newRecForm.departement}).\n\nPoste : ${newRecForm.poste}\nPriorité : ${newRecForm.priorite}\nDescription : ${newRecForm.description||"Non précisée"}\n\nVeuillez :\n• Définir le profil recherché et les documents requis\n• Renseigner votre avis sur les critères de sélection\n• Participer aux entretiens si nécessaire`,status:"A_FAIRE",statut:"A_FAIRE",creatorId:currentUser.id,assigneeId:avisResponsable.id,module:"sirh",recId:newR.id,type:"AVIS_RECRUTEMENT",deadline:today,createdAt:now,canCancel:false,priority:newRecForm.priorite},...prev]);
        setNotifications(prev=>[{id:"N"+Date.now(),icon:"📋",message:`📋 Votre avis est requis pour le recrutement : ${newRecForm.poste} — Veuillez renseigner le profil et les critères dans SIRH → Recrutement`,at:now,read:false,module:"sirh",targetUsers:[avisResponsable.id]},...prev]);
      }
    }
    setTaches(prev=>[{id:"T"+(Date.now()+1),titre:`Recrutement : ${newRecForm.poste}`,description:`Nouvelle mission de recrutement initiée par ${currentUser.name}.\nPriorité : ${newRecForm.priorite}\nProcessus : ${newRecForm.departement}`,status:"A_FAIRE",statut:"A_FAIRE",creatorId:currentUser.id,assigneeId:newRecForm.responsableId||currentUser.id,module:"sirh",recId:newR.id,type:"RECRUTEMENT",createdAt:now,canCancel:true},...prev]);
    setShowNewRec(false);
    setNewRecForm({ poste:"", departement:currentUser.process||"", description:"", priorite:"NORMALE", docsRequis:[], responsableId:"" });
    setSelectedRec(newR);
    setView("detail");
    playSound("success");
  };

  const handleAddCandidat = () => {
    if(!newCandForm.nom.trim()) return;
    const newC = { id:`CAND-${Date.now()}`, ...newCandForm, note:parseFloat(newCandForm.note)||0, statut:"RECU", dateDepot:today, docsRecus:[], collaborateurId:null };
    const updated = recrutements.map(r => r.id===selectedRec.id ? {...r, candidats:[...r.candidats, newC]} : r);
    saveRec(updated);
    setSelectedRec(updated.find(r=>r.id===selectedRec.id));
    setShowNewCand(false);
    setNewCandForm({ nom:"", email:"", tel:"", cv:"", note:"", commentaire:"" });
  };

  const handleDeleteCandidat = async (recId, candId) => {
    if (!await gcConfirm("Supprimer ce candidat du processus ?")) return;
    const updated = recrutements.map(r => r.id===recId ? {...r, candidats:r.candidats.filter(c=>c.id!==candId)} : r);
    saveRec(updated);
    if(selectedRec) setSelectedRec(updated.find(r=>r.id===recId));
  };

  const handleDeleteRecrutement = async (recId) => {
    if (!await gcConfirm("Supprimer entièrement ce recrutement et tous ses candidats ?")) return;
    const updated = recrutements.filter(r => r.id !== recId);
    saveRec(updated);
    setView("list");
    setSelectedRec(null);
  };

  const handleMoveCandidat = (recId, candId, newStatut) => {
    const updated = recrutements.map(r => r.id===recId ? {...r, candidats: r.candidats.map(c => c.id===candId ? {...c, statut:newStatut} : c)} : r);
    saveRec(updated);
    if(selectedRec) setSelectedRec(updated.find(r=>r.id===recId));
  };

  const handleScheduleEntretien = (rec, cand) => {
    setScheduleForm({ date:"", heure:"09:00", lieu:"", responsableId:currentUser.id, note:"" });
    setShowScheduleModal({ rec, cand });
  };

  const handleConfirmSchedule = () => {
    const { rec, cand } = showScheduleModal;
    if(!scheduleForm.date || !scheduleForm.heure) { gcAlert("Date et heure obligatoires."); return; }
    const respUser = users.find(u=>u.id===scheduleForm.responsableId)||currentUser;
    const entretien = { id:`ENT-${Date.now()}`, candId:cand.id, candidatNom:cand.nom, date:scheduleForm.date, heure:scheduleForm.heure, lieu:scheduleForm.lieu||"Bureau", responsableId:scheduleForm.responsableId||currentUser.id, responsableNom:respUser.name, note:scheduleForm.note, statut:"PROGRAMME", createdAt:new Date().toISOString() };
    const updated = recrutements.map(r => r.id===rec.id ? {...r, entretiens:[...r.entretiens, entretien]} : r);
    saveRec(updated);
    setSelectedRec(updated.find(r=>r.id===rec.id));
    setRdvs(prev=>[...prev, { id:`RDV-REC-${Date.now()}`, titre:`Entretien: ${cand.nom} — ${rec.poste}`, client:cand.nom, date:scheduleForm.date, heure:scheduleForm.heure, lieu:scheduleForm.lieu||"Bureau", assignedTo:[scheduleForm.responsableId||currentUser.id], status:"PROGRAMME", type:"ENTRETIEN_REC", module:"sirh", recId:rec.id, candId:cand.id, public:false, duree:60 }]);
    const processRespUsers = users.filter(u=>_activeUser(u)&&u.process===rec.departement&&u.level>=3&&u.id!==currentUser.id);
    const allTargets = [...new Set([scheduleForm.responsableId, ...processRespUsers.map(u=>u.id)])].filter(Boolean);
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"📅",message:`Entretien programmé : ${cand.nom} — ${rec.poste} · ${scheduleForm.date} à ${scheduleForm.heure} avec ${respUser.name}`,at:new Date().toISOString(),read:false,module:"sirh",targetUsers:allTargets},...prev]);
    setTaches(prev=>[{id:"T"+Date.now(),titre:`Préparer entretien : ${cand.nom} — ${rec.poste}`,description:`Date : ${scheduleForm.date} à ${scheduleForm.heure}\nLieu : ${scheduleForm.lieu||"Bureau"}\nCandidat : ${cand.nom} (${cand.email||"—"})\n${scheduleForm.note?"Note : "+scheduleForm.note:""}`,status:"A_FAIRE",statut:"A_FAIRE",creatorId:currentUser.id,assigneeId:scheduleForm.responsableId||currentUser.id,module:"sirh",recId:rec.id,candId:cand.id,type:"ENTRETIEN",deadline:scheduleForm.date,createdAt:new Date().toISOString(),canCancel:false},...prev]);
    playSound("rdv");
    setShowScheduleModal(null);
    gcAlert(`✅ Entretien programmé le ${scheduleForm.date} à ${scheduleForm.heure}.\nRDV ajouté à l'agenda, tâche créée pour ${respUser.name}.`);
  };

  const handleAiAnalysis = async (rec) => {
    setAiLoading(true);
    const candidatsInfo = rec.candidats.map(c=>`• ${c.nom} (note: ${c.note}/5, stade: ${REC_STAGE_LABELS[c.statut]||c.statut}) — ${c.commentaire||"Pas de commentaire"}`).join("\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1000, messages:[{ role:"user", content:`Tu es un expert RH. Analyse ce pipeline recrutement :\n\nPoste: ${rec.poste}\nDescription: ${rec.description||"Non précisée"}\nPriorité: ${rec.priorite}\nCandidats:\n${candidatsInfo||"Aucun candidat encore"}\n\nDonne une analyse concise (3-5 points) sur: qualité du pipeline, recommandations de progression, points d'attention, et un avis global en 1-2 phrases. Format: JSON avec champs: analyse (array de strings), avisGlobal (string), recommande (string nom candidat ou "À évaluer").` }]})});
      const data = await res.json();
      const text = data.content?.map(b=>b.text||"").join("") || "{}";
      try {
        const clean = text.replace(/```json|```/g,"").trim();
        setAiAnalysis(JSON.parse(clean));
      } catch (_) { setAiAnalysis({ analyse:[text], avisGlobal:"Analyse disponible", recommande:"À évaluer" }); }
    } catch (_) { setAiAnalysis({ analyse:["Analyse IA non disponible"], avisGlobal:"Erreur de connexion", recommande:"À évaluer" }); }
    setAiLoading(false);
  };

  const handleOnboard = async (rec, cand) => {
    if(!await gcConfirm(`Valider le recrutement de ${cand.nom} pour le poste ${rec.poste} et lancer l'onboarding ?`)) return;
    const memo = memoDec[cand.id] || `Candidat retenu suite à processus de sélection — ${rec.poste}`;
    const now = new Date().toISOString();
    const procRespUsers = users.filter(u=>_activeUser(u)&&u.process===rec.departement&&u.level>=3&&!u.isAdmin);
    const dgUsers = users.filter(u=>_activeUser(u)&&u.level>=5&&!u.isAdmin);
    const rhUsers = users.filter(u=>_activeUser(u)&&u.process==="S03"&&u.level>=3&&!u.isAdmin);
    const allNotifyIds = [...new Set([...procRespUsers.map(u=>u.id),...dgUsers.map(u=>u.id),...rhUsers.map(u=>u.id)])].filter(Boolean);
    setTaches(prev=>[
      {id:"T"+Date.now(),titre:`Onboarding : ${cand.nom} — ${rec.poste}`,description:`Mémo décisionnel:\n${memo}\n\n✅ ACTIONS REQUISES:\n• Créer le compte SI (Administration → Gestion Comptes)\n• Affecter au processus : ${rec.departement}\n• Remettre le matériel de travail\n• Planifier formation initiale\n• Intégrer dans SIRH (Gestion Personnel)`,status:"A_FAIRE",statut:"A_FAIRE",creatorId:currentUser.id,assigneeId:currentUser.id,module:"sirh",recId:rec.id,type:"ONBOARDING",deadline:today,createdAt:now,canCancel:false,priority:"HAUTE"},
      {id:"T"+(Date.now()+1),titre:`Avis responsable processus : ${cand.nom} — ${rec.poste}`,description:`Suite à la validation du recrutement de ${cand.nom} pour le poste ${rec.poste}.\n\nVeuillez :\n• Préparer le plan d'intégration au processus ${rec.departement}\n• Définir les objectifs des 30 premiers jours\n• Planifier la passation de poste si nécessaire`,status:"A_FAIRE",statut:"A_FAIRE",creatorId:currentUser.id,assigneeId:procRespUsers[0]?.id||currentUser.id,module:"sirh",recId:rec.id,type:"INTEGRATION",deadline:today,createdAt:now,canCancel:false},...prev]);
    const notifMsg = `🎉 Recrutement validé : ${cand.nom} → ${rec.poste} (${rec.departement}) | Mémo : ${memo.slice(0,80)}`;
    setNotifications(prev=>[
      {id:"N"+Date.now(),icon:"🎉",message:notifMsg,at:now,read:false,module:"sirh",targetUsers:allNotifyIds},
      {id:"N"+(Date.now()+1),icon:"🆕",message:`🆕 Onboarding à traiter : ${cand.nom} — Créez le compte SI et intégrez dans SIRH`,at:now,read:false,module:"sirh",targetUsers:[...rhUsers.map(u=>u.id),currentUser.id]},
      ...prev]);
    const updated = recrutements.map(r => r.id===rec.id ? {...r, statut:"CLOTURE", candidatRetenuId:cand.id, candidatRetenuNom:cand.nom, dateCloture:today, memoDecisionnel:memo, candidatEmail:cand.email, candidatTel:cand.tel, candidats:r.candidats.map(c=>c.id===cand.id?{...c,statut:"ONBOARDING",onboardedAt:now}:c)} : r);
    saveRec(updated);
    setSelectedRec(updated.find(r=>r.id===rec.id));
    playSound("success");
    gcAlert(`✅ Onboarding lancé pour ${cand.nom}.\n\n• Tâche créée pour RH (intégration SI)\n• Tâche créée pour Responsable processus ${rec.departement}\n• Notifications envoyées aux DG et responsables\n\nProchaine étape : Onglet Admin → Créer le compte utilisateur`);
  };

  const recColor = { RECU:"#6B7280", EN_COURS:"#3B82F6", ENTRETIENS:"#F59E0B", DECISION:"#A855F7", CLOTURE:"#22C55E" };

  if(view==="detail" && selectedRec) {
    const rec = recrutements.find(r=>r.id===selectedRec.id) || selectedRec;
    return (
      <div>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
          <button onClick={()=>setView("list")} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11}}>← Retour</button>
          {lvl>=4&&<button onClick={()=>handleDeleteRecrutement(rec.id)} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑 Supprimer recrutement</button>}
          <h4 style={{color:"#A855F7",margin:0,fontSize:14,fontWeight:800,flex:1}}>🎯 {rec.poste}</h4>
          <Badge label={rec.statut} color={recColor[rec.statut]||"#A855F7"} small />
          <button onClick={()=>handleAiAnalysis(rec)} disabled={aiLoading} style={{background:"linear-gradient(135deg,#6366F1,#8B5CF6)",border:"none",color:"#fff",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>{aiLoading?"⏳ Analyse...":"🤖 Analyse IA"}</button>
        </div>

        {/* Sub-tabs */}
        <div style={{display:"flex",gap:4,marginBottom:14,overflowX:"auto"}} className="gc-tabs-scroll">
          {[["candidats","👥 Candidats"],["docs","📋 Docs requis"],["entretiens","📅 Entretiens"],["analyse","🤖 Analyse IA"],["onboarding","🚀 Onboarding"]].map(([k,l])=>(
            <button key={k} onClick={()=>setRecTab(k)} style={{background:recTab===k?"#A855F7":T.surface3,color:recTab===k?"#fff":T.textMuted,border:"none",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{l}</button>
          ))}
        </div>

        {/* Candidats */}
        {recTab==="candidats" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{color:T.textMuted,fontSize:11}}>{rec.candidats.length} candidat(s)</span>
              {lvl>=3 && <button onClick={()=>setShowNewCand(true)} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Candidat</button>}
            </div>
            {showNewCand && (
              <div style={{background:"#A855F711",border:"1px solid #A855F744",borderRadius:10,padding:14,marginBottom:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  {[["nom","Nom complet *"],["email","Email"],["tel","Téléphone"],["cv","Référence CV/dossier"]].map(([k,l])=>(
                    <div key={k}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{l}</label>
                    <input value={newCandForm[k]} onChange={e=>setNewCandForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
                  ))}
                </div>
                <div style={{marginBottom:8}}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Note initiale (0-5)</label>
                <input type="number" min="0" max="5" step="0.5" value={newCandForm.note} onChange={e=>setNewCandForm(f=>({...f,note:e.target.value}))} style={{width:80,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 8px",color:T.text,fontSize:11}} /></div>
                <div style={{marginBottom:10}}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Commentaire</label>
                <textarea value={newCandForm.commentaire} onChange={e=>setNewCandForm(f=>({...f,commentaire:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} /></div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={handleAddCandidat} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>✅ Ajouter</button>
                  <button onClick={()=>setShowNewCand(false)} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                </div>
              </div>
            )}
            {/* Kanban */}
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6}} className="gc-tabs-scroll">
              {REC_STAGES.map(stage=>{
                const cands=rec.candidats.filter(c=>c.statut===stage);
                return (
                  <div key={stage} style={{minWidth:140,maxWidth:160,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",flexShrink:0}}>
                    <div style={{color:"#A855F7",fontSize:9,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{REC_STAGE_LABELS[stage]} ({cands.length})</div>
                    {cands.map(c=>(
                      <div key={c.id} style={{background:T.surface2,borderRadius:7,padding:"7px 9px",marginBottom:6,border:`1px solid ${T.border}`}}>
                        <div style={{color:T.text,fontWeight:700,fontSize:11,marginBottom:2}}>{c.nom}</div>
                        {c.email&&<div style={{color:T.textMuted,fontSize:9}}>{c.email}</div>}
                        {c.note>0&&<div style={{color:"#C9A84C",fontSize:9,marginTop:2}}>★ {c.note}/5</div>}
                        {c.commentaire&&<div style={{color:T.textDim,fontSize:9,marginTop:2,fontStyle:"italic"}}>{c.commentaire.slice(0,40)}{c.commentaire.length>40?"…":""}</div>}
                        <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:5}}>
                          {stage!=="ONBOARDING"&&REC_STAGES.indexOf(stage)<REC_STAGES.length-1&&(
                            <button onClick={()=>handleMoveCandidat(rec.id,c.id,REC_STAGES[REC_STAGES.indexOf(stage)+1])} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:5,padding:"2px 6px",cursor:"pointer",fontSize:8,fontWeight:700}}>→ Avancer</button>
                          )}
                          {stage!=="RECU"&&(
                            <button onClick={()=>handleMoveCandidat(rec.id,c.id,REC_STAGES[REC_STAGES.indexOf(stage)-1])} style={{background:"#6B7280",border:"none",color:"#fff",borderRadius:5,padding:"2px 6px",cursor:"pointer",fontSize:8}}>← Reculer</button>
                          )}
                          {(stage==="ENTRETIEN_1"||stage==="ENTRETIEN_2")&&(
                            <button onClick={()=>handleScheduleEntretien(rec,c)} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:5,padding:"2px 6px",cursor:"pointer",fontSize:8,fontWeight:700}}>📅 RDV</button>
                          )}
                          {stage==="DECISION"&&lvl>=4&&(
                            <button onClick={()=>handleOnboard(rec,c)} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:5,padding:"2px 6px",cursor:"pointer",fontSize:8,fontWeight:700}}>🚀 Onboard</button>
                          )}
                          {lvl>=3&&(
                             <button onClick={()=>handleDeleteCandidat(rec.id,c.id)} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"2px 5px",cursor:"pointer",fontSize:8}}>🗑</button>
                          )}
                        </div>
                        {stage==="DECISION"&&(
                          <div style={{marginTop:5}}>
                            <label style={{color:T.textMuted,fontSize:8,display:"block",marginBottom:2}}>Mémo décisionnel</label>
                            <textarea value={memoDec[c.id]||""} onChange={e=>setMemoDec(m=>({...m,[c.id]:e.target.value}))} rows={2} placeholder="Avis responsable..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 5px",color:T.text,fontSize:9,resize:"none",boxSizing:"border-box"}} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Docs requis */}
        {recTab==="docs" && (
          <div>
            <div style={{color:T.textMuted,fontSize:11,marginBottom:10}}>Documents demandés aux candidats :</div>
            <div style={{marginBottom:10}}>
              {(rec.docsRequis||[]).map((doc,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:T.surface2,borderRadius:7,padding:"6px 10px",marginBottom:5}}>
                  <span style={{fontSize:11}}>📄</span>
                  <span style={{color:T.text,fontSize:11,flex:1}}>{doc}</span>
                  {lvl>=3&&<button onClick={()=>{const updated=recrutements.map(r=>r.id===rec.id?{...r,docsRequis:r.docsRequis.filter((_,j)=>j!==i)}:r);saveRec(updated);setSelectedRec(updated.find(r=>r.id===rec.id));}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:13}}>🗑️</button>}
                </div>
              ))}
              {(rec.docsRequis||[]).length===0&&<div style={{color:T.textMuted,fontSize:11,fontStyle:"italic"}}>Aucun document requis défini.</div>}
            </div>
            {lvl>=3&&(
              <div style={{display:"flex",gap:8}}>
                <input value={newDocInput} onChange={e=>setNewDocInput(e.target.value)} placeholder="Ex: CV, Lettre de motivation, Diplôme..." style={{flex:1,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}} />
                <button onClick={()=>{if(!newDocInput.trim())return;const updated=recrutements.map(r=>r.id===rec.id?{...r,docsRequis:[...(r.docsRequis||[]),newDocInput.trim()]}:r);saveRec(updated);setSelectedRec(updated.find(r=>r.id===rec.id));setNewDocInput("");}} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Ajouter</button>
              </div>
            )}
            <div style={{marginTop:14,borderTop:`1px solid ${T.border}`,paddingTop:10}}>
              <div style={{color:T.textMuted,fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase"}}>Suivi docs par candidat</div>
              {rec.candidats.map(c=>(
                <div key={c.id} style={{background:T.surface2,borderRadius:7,padding:"8px 10px",marginBottom:6}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:11,marginBottom:4}}>{c.nom} — {REC_STAGE_LABELS[c.statut]||c.statut}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {(rec.docsRequis||[]).map(doc=>{
                      const recu=(c.docsRecus||[]).includes(doc);
                      return <span key={doc} onClick={()=>{const updated=recrutements.map(r=>r.id===rec.id?{...r,candidats:r.candidats.map(ca=>ca.id===c.id?{...ca,docsRecus:recu?(ca.docsRecus||[]).filter(d=>d!==doc):[...(ca.docsRecus||[]),doc]}:ca)}:r);saveRec(updated);setSelectedRec(updated.find(r=>r.id===rec.id));}} style={{background:recu?"#22C55E22":"#EF444422",color:recu?"#22C55E":"#EF4444",border:`1px solid ${recu?"#22C55E44":"#EF444444"}`,borderRadius:5,padding:"2px 7px",fontSize:9,cursor:"pointer",fontWeight:700}}>{recu?"✅":"⏳"} {doc}</span>;
                    })}
                    {(rec.docsRequis||[]).length===0&&<span style={{color:T.textMuted,fontSize:9}}>Aucun doc requis</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Entretiens */}
        {recTab==="entretiens" && (
          <div>
            <div style={{color:T.textMuted,fontSize:11,marginBottom:10}}>{rec.entretiens.length} entretien(s) programmé(s)</div>
            {rec.entretiens.map(ent=>(
              <div key={ent.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:T.text,fontWeight:700,fontSize:12}}>{ent.candidatNom}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>📅 {ent.date} à {ent.heure} — 📍 {ent.lieu}</div>
                </div>
                <Badge label={ent.statut} color="#3B82F6" small />
              </div>
            ))}
            {rec.entretiens.length===0&&<div style={{color:T.textMuted,fontSize:11,fontStyle:"italic",textAlign:"center",padding:20}}>Aucun entretien programmé. Avancez des candidats aux stades Entretien pour planifier.</div>}
          </div>
        )}

        {/* Analyse IA */}
        {recTab==="analyse" && (
          <div>
            {!aiAnalysis&&!aiLoading&&(
              <div style={{textAlign:"center",padding:30}}>
                <div style={{fontSize:32,marginBottom:8}}>🤖</div>
                <div style={{color:T.textMuted,fontSize:12,marginBottom:14}}>L'IA peut analyser votre pipeline et recommander les meilleures actions.</div>
                <button onClick={()=>handleAiAnalysis(rec)} style={{background:"linear-gradient(135deg,#6366F1,#A855F7)",border:"none",color:"#fff",borderRadius:9,padding:"10px 22px",cursor:"pointer",fontWeight:800,fontSize:13}}>🤖 Lancer l'analyse IA</button>
              </div>
            )}
            {aiLoading&&<div style={{textAlign:"center",padding:30,color:"#A855F7",fontSize:13}}>⏳ Analyse IA en cours...</div>}
            {aiAnalysis&&!aiLoading&&(
              <div>
                <div style={{background:"linear-gradient(135deg,#6366F111,#A855F711)",border:"1px solid #A855F744",borderRadius:12,padding:16,marginBottom:14}}>
                  <div style={{color:"#A855F7",fontWeight:800,fontSize:13,marginBottom:10}}>🤖 Analyse IA — {rec.poste}</div>
                  {aiAnalysis.analyse?.map((point,i)=>(
                    <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
                      <span style={{color:"#A855F7",fontSize:11}}>•</span>
                      <span style={{color:T.text,fontSize:11}}>{point}</span>
                    </div>
                  ))}
                </div>
                <div style={{background:"#22C55E11",border:"1px solid #22C55E44",borderRadius:10,padding:14,marginBottom:10}}>
                  <div style={{color:"#22C55E",fontWeight:700,fontSize:12,marginBottom:4}}>💬 Avis global</div>
                  <div style={{color:T.text,fontSize:12}}>{aiAnalysis.avisGlobal}</div>
                </div>
                {aiAnalysis.recommande&&aiAnalysis.recommande!=="À évaluer"&&(
                  <div style={{background:"#F59E0B11",border:"1px solid #F59E0B44",borderRadius:10,padding:14}}>
                    <div style={{color:"#F59E0B",fontWeight:700,fontSize:12,marginBottom:4}}>⭐ Candidat recommandé</div>
                    <div style={{color:T.text,fontSize:13,fontWeight:700}}>{aiAnalysis.recommande}</div>
                  </div>
                )}
                <button onClick={()=>{setAiAnalysis(null);handleAiAnalysis(rec);}} style={{marginTop:12,background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:10}}>🔄 Relancer l'analyse</button>
              </div>
            )}
          </div>
        )}

        {/* Onboarding */}
        {recTab==="onboarding" && (
          <div>
            {rec.statut==="CLOTURE"&&rec.candidatRetenuNom?(
              <div>
                <div style={{background:"#22C55E11",border:"1px solid #22C55E44",borderRadius:12,padding:16,marginBottom:14}}>
                  <div style={{color:"#22C55E",fontWeight:800,fontSize:13,marginBottom:6}}>✅ Recrutement clôturé</div>
                  <div style={{color:T.text,fontSize:12}}>Candidat retenu : <strong>{rec.candidatRetenuNom}</strong></div>
                  <div style={{color:T.textMuted,fontSize:11,marginTop:4}}>Date clôture : {rec.dateCloture}</div>
                  {rec.memoDecisionnel&&<div style={{color:T.text,fontSize:11,marginTop:8,padding:"8px 12px",background:T.surface3,borderRadius:8,fontStyle:"italic"}}>"{rec.memoDecisionnel}"</div>}
                </div>
              </div>
            ):(
              <div>
                <div style={{color:T.textMuted,fontSize:11,marginBottom:10}}>Candidats en stade DÉCISION disponibles pour onboarding :</div>
                {rec.candidats.filter(c=>c.statut==="DECISION").map(c=>(
                  <div key={c.id} style={{background:T.surface2,border:"2px solid #A855F744",borderRadius:10,padding:14,marginBottom:10}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:6}}>{c.nom}</div>
                    <div style={{marginBottom:8}}>
                      <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Mémo décisionnel</label>
                      <textarea value={memoDec[c.id]||""} onChange={e=>setMemoDec(m=>({...m,[c.id]:e.target.value}))} rows={3} placeholder="Résumé décisionnel à conserver dans le dossier..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} />
                    </div>
                    <button onClick={()=>handleOnboard(rec,c)} style={{width:"100%",background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:9,padding:"10px 16px",cursor:"pointer",fontWeight:800,fontSize:12}}>🚀 Valider recrutement & lancer onboarding</button>
                  </div>
                ))}
                {rec.candidats.filter(c=>c.statut==="DECISION").length===0&&<div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:20}}>Aucun candidat en stade Décision. Avancez un candidat depuis le pipeline.</div>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* ── MODAL PROGRAMMER ENTRETIEN ── */}
      {showScheduleModal && (
        <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowScheduleModal(null)}>
          <div style={{background:"#0D1F38",border:"1px solid #A855F766",borderRadius:14,padding:24,width:"100%",maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h4 style={{color:"#A855F7",margin:0,fontSize:13,fontWeight:800}}>📅 Programmer un entretien</h4>
              <button onClick={()=>setShowScheduleModal(null)} style={{background:"none",border:"none",color:"#EF4444",fontSize:18,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{background:"#A855F711",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#E8EDF5"}}>
              <strong>{showScheduleModal.cand.nom}</strong> — Poste : <strong>{showScheduleModal.rec.poste}</strong>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Date *</label>
                <input type="date" value={scheduleForm.date} onChange={e=>setScheduleForm(f=>({...f,date:e.target.value}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,boxSizing:"border-box"}} />
              </div>
              <div>
                <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Heure *</label>
                <input type="time" value={scheduleForm.heure} onChange={e=>setScheduleForm(f=>({...f,heure:e.target.value}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,boxSizing:"border-box"}} />
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Lieu / Lien visio</label>
              <input value={scheduleForm.lieu} onChange={e=>setScheduleForm(f=>({...f,lieu:e.target.value}))} placeholder="Salle A, Bureau, Teams..." style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,boxSizing:"border-box"}} />
            </div>
            <div style={{marginBottom:10}}>
              <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Responsable de l'entretien</label>
              <select value={scheduleForm.responsableId} onChange={e=>setScheduleForm(f=>({...f,responsableId:e.target.value}))} style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11}}>
                {users.filter(u=>_activeUser(u)&&u.level>=2&&!u.isAdmin).map(u=><option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{color:"#7A90B0",fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Note / Instructions</label>
              <textarea value={scheduleForm.note} onChange={e=>setScheduleForm(f=>({...f,note:e.target.value}))} rows={2} placeholder="Instructions pour le responsable..." style={{width:"100%",background:"#0A1E40",border:"1px solid #1E3A5F",borderRadius:7,padding:"7px 10px",color:"#E8EDF5",fontSize:11,resize:"vertical",boxSizing:"border-box"}} />
            </div>
            <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:10,color:"#7A90B0"}}>
              ℹ️ Un RDV sera automatiquement ajouté à l'agenda commun et une tâche assignée au responsable sélectionné.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleConfirmSchedule} style={{flex:1,background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:9,padding:"10px",cursor:"pointer",fontWeight:800,fontSize:12}}>📅 Confirmer & Programmer</button>
              <button onClick={()=>setShowScheduleModal(null)} style={{background:"none",border:"1px solid #1E3A5F",color:"#7A90B0",borderRadius:9,padding:"10px 14px",cursor:"pointer",fontSize:11}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h4 style={{color:"#A855F7",margin:0,fontSize:13,fontWeight:800}}>🎯 Pipeline de Recrutement</h4>
        {lvl>=3 && <button onClick={()=>setShowNewRec(true)} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nouveau poste</button>}
      </div>

      {showNewRec && (
        <div style={{background:"#A855F711",border:"1px solid #A855F744",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:12}}>Nouvelle mission de recrutement</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Poste *</label>
            <input value={newRecForm.poste} onChange={e=>setNewRecForm(f=>({...f,poste:e.target.value}))} placeholder="Ex: Juriste Junior, Comptable..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
            <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Processus / Département *</label>
            <select value={newRecForm.departement} onChange={e=>setNewRecForm(f=>({...f,departement:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
              <option value="">— Sélectionner —</option>
              {Object.entries(CODES.processes).map(([k,v])=><option key={k} value={k}>{k} – {v}</option>)}
            </select></div>
          </div>
          <div style={{marginBottom:8}}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Description</label>
          <textarea value={newRecForm.description} onChange={e=>setNewRecForm(f=>({...f,description:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} /></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Priorité</label>
            <select value={newRecForm.priorite} onChange={e=>setNewRecForm(f=>({...f,priorite:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
              <option value="BASSE">Basse</option><option value="NORMALE">Normale</option><option value="HAUTE">Haute</option><option value="URGENTE">Urgente</option>
            </select></div>
            <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Responsable</label>
            <select value={newRecForm.responsableId} onChange={e=>setNewRecForm(f=>({...f,responsableId:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
              <option value="">— Sélectionner —</option>
              {users.filter(u=>_activeUser(u)&&u.level>=3).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleCreateRec} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Créer la mission</button>
            <button onClick={()=>setShowNewRec(false)} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
          </div>
        </div>
      )}

      {recrutements.map(rec=>(
        <div key={rec.id} onClick={()=>{setSelectedRec(rec);setView("detail");setRecTab("candidats");setAiAnalysis(null);}} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14,marginBottom:10,cursor:"pointer",transition:"border-color 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor="#A855F7"} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div>
              <div style={{color:T.text,fontWeight:800,fontSize:13}}>{rec.poste}</div>
              <div style={{color:T.textMuted,fontSize:10}}>Dept: {rec.departement} · Demandé: {rec.dateDemande}</div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{background:`${recColor[rec.priorite]||"#6B7280"}22`,color:recColor[rec.priorite]||"#6B7280",borderRadius:5,padding:"2px 6px",fontSize:9,fontWeight:700}}>{rec.priorite||"NORMALE"}</span>
              <Badge label={rec.statut} color={recColor[rec.statut]||"#A855F7"} small />
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {REC_STAGES.map(stage=>{
              const n=rec.candidats.filter(c=>c.statut===stage).length;
              if(n===0) return null;
              return <span key={stage} style={{background:T.surface3,borderRadius:5,padding:"2px 7px",fontSize:9,color:T.textMuted}}>{REC_STAGE_LABELS[stage]}: {n}</span>;
            })}
            {rec.candidats.length===0&&<span style={{color:T.textMuted,fontSize:9}}>Aucun candidat</span>}
          </div>
        </div>
      ))}
      {recrutements.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:30,fontSize:12}}>Aucune mission de recrutement en cours.</div>}
    </div>
  );
};


export function BaseFichiersRH({ T, currentUser, users=[], isDemoMode=false }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [fichiers, setFichiers] = useState(() => { try { return JSON.parse(_lsGet("gc-sirh-fichiers")||"null") || []; } catch (_) { return []; } });
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedType, setSelectedType] = useState("ALL");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ userId:"", type:"CONTRAT", nom:"", notes:"", fileData:"", fileName:"", fileSize:0 });

  const TYPES_FICHIERS = [
    {v:"CONTRAT",l:"📄 Contrat de travail",c:"#3B82F6"},
    {v:"AVENANT",l:"📝 Avenant",c:"#F59E0B"},
    {v:"FICHE_PAIE",l:"💰 Fiche de paie",c:"#22C55E"},
    {v:"CONGE",l:"🌴 Justificatif congé",c:"#A855F7"},
    {v:"MEDICAL",l:"🏥 Certificat médical",c:"#EF4444"},
    {v:"FORMATION",l:"🎓 Attestation formation",c:"#06B6D4"},
    {v:"EVALUATION",l:"⭐ Évaluation annuelle",c:"#C9A84C"},
    {v:"DISCIPLINAIRE",l:"⚠️ Avertissement",c:"#F97316"},
    {v:"AUTRE",l:"📎 Autre",c:"#6B7280"},
  ];

  const saveFichiers = (f) => { setFichiers(f); if(!isDemoMode) try { _lsSet("gc-sirh-fichiers", JSON.stringify(f)); } catch (_) {} };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > 5*1024*1024) { gcAlert("Fichier trop volumineux (max 5Mo)"); return; }
    // FIX v135 — _uploadFiles is defined at component root, eslint-disable for nested scope
    // eslint-disable-next-line no-undef
    const [ref] = await _uploadFiles([file], { module: 'sirh', uploadedBy: currentUser?.id });
    if(ref) setUploadForm(f=>({...f, fileData:ref.dataUrl||ref.path, fileName:file.name, fileSize:file.size}));
    // readAsDataURL remplacé par _uploadFiles ci-dessus
  };

  const handleAddFichier = () => {
    if(!uploadForm.userId || !uploadForm.type || !uploadForm.nom) { gcAlert("Collaborateur, type et nom obligatoires."); return; }
    const user = users.find(u=>u.id===uploadForm.userId);
    const newF = { id:`FRH-${Date.now()}`, ...uploadForm, userName:user?.name||"—", createdBy:currentUser.id, createdByName:currentUser.name, createdAt:new Date().toISOString() };
    saveFichiers([newF,...fichiers]);
    setShowUpload(false);
    setUploadForm({ userId:"", type:"CONTRAT", nom:"", notes:"", fileData:"", fileName:"", fileSize:0 });
  };

  const filtered = fichiers.filter(f => {
    const userOk = !selectedUser || f.userId===selectedUser;
    const typeOk = selectedType==="ALL" || f.type===selectedType;
    return userOk && typeOk;
  });

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <h4 style={{color:"#A855F7",margin:0,fontSize:13,fontWeight:800}}>🗃️ Base de Données Fichiers RH</h4>
          <div style={{color:T.textMuted,fontSize:10}}>{fichiers.length} fichier(s) total · {filtered.length} affiché(s)</div>
        </div>
        <button onClick={()=>setShowUpload(true)} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>📎 Ajouter fichier</button>
      </div>

      {showUpload && (
        <div style={{background:"#A855F711",border:"1px solid #A855F744",borderRadius:12,padding:16,marginBottom:14}}>
          <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:12}}>Nouveau fichier collaborateur</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Collaborateur *</label>
            <select value={uploadForm.userId} onChange={e=>setUploadForm(f=>({...f,userId:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
              <option value="">— Sélectionner —</option>
              {users.filter(_activeUser).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
            <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Type de document *</label>
            <select value={uploadForm.type} onChange={e=>setUploadForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
              {TYPES_FICHIERS.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
            </select></div>
          </div>
          <div style={{marginBottom:8}}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Nom du document *</label>
          <input value={uploadForm.nom} onChange={e=>setUploadForm(f=>({...f,nom:e.target.value}))} placeholder="Ex: Contrat CDI 2026" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
          <div style={{marginBottom:8}}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Fichier (optionnel, max 5Mo)</label>
          <input type="file" onChange={handleFileUpload} style={{color:T.text,fontSize:11}} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png,.txt" />
          {uploadForm.fileName&&<div style={{color:T.textMuted,fontSize:10,marginTop:3}}>📎 {uploadForm.fileName} ({Math.round(uploadForm.fileSize/1024)} Ko)</div>}</div>
          <div style={{marginBottom:10}}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Notes</label>
          <textarea value={uploadForm.notes} onChange={e=>setUploadForm(f=>({...f,notes:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} /></div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleAddFichier} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Enregistrer</button>
            <button onClick={()=>setShowUpload(false)} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <select value={selectedUser} onChange={e=>setSelectedUser(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,flex:1,minWidth:160}}>
          <option value="">Tous les collaborateurs</option>
          {users.filter(_activeUser).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={selectedType} onChange={e=>setSelectedType(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11}}>
          <option value="ALL">Tous types</option>
          {TYPES_FICHIERS.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
      </div>

      {/* Stats by type */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {TYPES_FICHIERS.map(t=>{
          const n=fichiers.filter(f=>f.type===t.v).length;
          if(n===0) return null;
          return <span key={t.v} style={{background:t.c+"22",color:t.c,border:`1px solid ${t.c}44`,borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700}}>{t.l.split(" ")[0]} {n}</span>;
        })}
      </div>

      {/* File list */}
      {filtered.map(f=>{
        const typeInfo = TYPES_FICHIERS.find(t=>t.v===f.type)||{l:"Autre",c:"#6B7280"};
        return (
          <div key={f.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{width:36,height:36,borderRadius:8,background:typeInfo.c+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{typeInfo.l.split(" ")[0]}</div>
            <div style={{flex:1}}>
              <div style={{color:T.text,fontWeight:700,fontSize:12}}>{f.nom}</div>
              <div style={{color:T.textMuted,fontSize:10}}>{f.userName} · {typeInfo.l.split(" ").slice(1).join(" ")} · {f.createdAt?.slice(0,10)}</div>
              {f.notes&&<div style={{color:T.textDim,fontSize:9,marginTop:2,fontStyle:"italic"}}>{f.notes}</div>}
              {f.fileName&&<div style={{color:"#3B82F6",fontSize:9,marginTop:2}}>📎 {f.fileName}</div>}
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              {f.fileData&&<button onClick={()=>{const a=document.createElement("a");a.href=f.fileData;a.download=f.fileName||f.nom;a.click();}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>⬇️</button>}
              <button onClick={async () => {if(await gcConfirm("Supprimer ce fichier ?"))saveFichiers(fichiers.filter(x=>x.id!==f.id));}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️</button>
            </div>
          </div>
        );
      })}
      {filtered.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:30,fontSize:12}}>Aucun fichier{selectedUser||selectedType!=="ALL"?" correspondant aux filtres":""}</div>}
    </div>
  );
};
