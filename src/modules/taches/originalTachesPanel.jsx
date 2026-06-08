import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// TachesPanel.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, gcPushNotif, playSound, formatDate, generateAccessCode, useSI, _activeUser, formatDateTime, getUser, daysLeft, dsSave } from '../../core/index.js';
import { STATUS_CONFIG, PRIORITY_CONFIG, INITIAL_SESSION_LOGS } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge} from '../../components/UI.jsx';

export function TachesPanel() {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const si = useSI();
  const { T, localUser, users, setUsers, dossiers, setDossiers,
    taches, setTaches, rdvs, setRdvs, partners, setPartnersSync,
    pendingApprovals, setPendingApprovals, notifications, setNotifications,
    isAdmin, isMG, isDG, isDemoMode, codifRegistry, setCodifRegistry,
    internalDocs, setInternalDocs, externalDocs, setExternalDocs,
    committees, systemMsgs, setSystemMsgs, sessionLogs,
    setActiveModule, handleSetActiveModule, selectedDossier, setSelectedDossier,
    processConfig, setProcessConfig, demandesData, generateAccessCode,
    addSessionLog, onLogout, pendingAccountActions, setPendingAccountActions,
    pendingConnections = [], setSessionLogs, appHabilitations, setAppHabilitations, appAccessCodes, setAppAccessCodes,
  } = si;
  const isRHManager = (localUser.process === "S03" || localUser.processes?.includes("S03")) && localUser.level >= 4;
  const canSeeSessions = isRHManager || (localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 5;
  const _alertVDI = (msg="", icon="") => {
    const m = msg.toLowerCase();
    if (icon && icon !== "🔔") return icon;
    if (m.includes("connexion")||m.includes("session")||m.includes("déconnexion")) return "🔐";
    if (m.includes("dossier")||m.includes("dos-")) return "📁";
    if (m.includes("tâche")||m.includes("task")) return "📋";
    if (m.includes("rdv")||m.includes("rendez")) return "📅";
    if (m.includes("message")||m.includes("messagerie")) return "✉️";
    if (m.includes("approbation")||m.includes("approuver")||m.includes("validé")) return "✅";
    if (m.includes("rejet")||m.includes("refusé")) return "❌";
    if (m.includes("création")||m.includes("créé")||m.includes("nouveau")) return "➕";
    if (m.includes("suppression")||m.includes("supprimé")) return "🗑️";
    if (m.includes("backup")||m.includes("sauvegarde")) return "💾";
    if (m.includes("document")||m.includes("doc-")) return "📄";
    if (m.includes("urgence")||m.includes("urgent")||m.includes("alerte")) return "🚨";
    if (m.includes("paiement")||m.includes("facture")||m.includes("fcfa")) return "💰";
    if (m.includes("compte")||m.includes("collaborateur")||m.includes("usrdr")) return "👤";
    if (m.includes("transfert")) return "📤";
    if (m.includes("rapport")) return "📊";
    return "🔔";
  };
  const _myLevel = localUser.level || 1;
  const _myProcsAlert = localUser.processes || [localUser.process];
  const myNotifAlerts = (notifications||[]).filter(n => {
    if (n.dismissed) return false;
    if (n.adminOnly && !(localUser?.isAdmin || localUser?.level >= 6)) return false;
    if (localUser?.isAdmin || localUser?.level >= 6) return true;
    if (_myLevel >= 4) return true;
    if (_myLevel >= 3) {
      if (!n.targetProcess || _myProcsAlert.includes(n.targetProcess)) return true;
      if (n.targetUserId && (n.targetUserId === localUser.id)) return true;
      return false;
    }
    return !n.targetUserId || n.targetUserId === localUser.id;
  });

  const [mainTab, setMainTab] = useState("taches"); // taches | sessions | alertes_generales
  const [tacheForm, setTacheForm] = useState({ titre:"", dossier:"", assignedTo:localUser.id, deadline:"", priority:"NORMALE", type:"RÉDACTION", partnerId:"", submitAction:"TRAITER", description:"", confidentiel:false, confPass:"", confAccess:[] });
  const [showNewTache, setShowNewTache] = useState(false);
  const [tacheSearch, setTacheSearch] = useState("");
  const [tacheFilter, setTacheFilter] = useState("ALL"); // ALL | EN_ATTENTE | EN_COURS | TERMINE | HAUTE
  const [tacheProcessFilter, setTacheProcessFilter] = useState("ALL");
  const [tacheTypeFilter, setTacheTypeFilter] = useState("ALL");
  const [tachePriorityFilter, setTachePriorityFilter] = useState("ALL");
  const [selectedTaches, setSelectedTaches] = useState([]); // multi-select checkboxes
  const [sesFilter, setSesFilter] = useState("ALL");
  const [sesSearch, setSesSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [siAlerts, setSiAlerts] = useState(() => {
    try { return JSON.parse(_lsGet("gc-security-alerts")||"[]"); } catch (_) { return []; }
  });
  const [siAlertFilter, setSiAlertFilter] = useState("ALL");
  const [siAlertSearch, setSiAlertSearch] = useState("");
  const [selectedAlerts, setSelectedAlerts] = useState([]); // multi-select for alertes

  const _myProcs = localUser.processes || [localUser.process];
  const myTaches = localUser.level >= 4 || (localUser?.isAdmin || localUser?.level >= 6)
    ? taches
    : localUser.level >= 3
      ? taches.filter(t => (t.assignedTo === localUser.id || t.assigneeId === localUser.id) || t.createdBy === localUser.id || _myProcs.some(p => dossiers.find(d => d.process === p && d.id === t.dossier)))
      : taches.filter(t => (t.assignedTo === localUser.id || t.assigneeId === localUser.id) || t.createdBy === localUser.id);

  const [unlockedConfTaches, setUnlockedConfTaches] = useState({});
  const canReadConfTache = (t) => {
    if (!t.confidentiel) return true;
    if ((localUser?.isAdmin || localUser?.level >= 6) || t.createdBy === localUser.id || t.assignedTo === localUser.id || t.assigneeId === localUser.id) return true;
    if ((t.confAccess||[]).includes(localUser.id)) return true;
    return false;
  };
  const handleUnlockConfTache = async (t) => {
    const pass = await gcPrompt("🔒 Tâche confidentielle — Saisir le mot de passe :");
    if (pass === null) return;
    if (pass === t.confPass) { setUnlockedConfTaches(prev=>({...prev,[t.id]:true})); }
    else { gcAlert("❌ Mot de passe incorrect."); }
  };
  const visibleTaches = myTaches.filter(t => {
    if (!t.confidentiel) return true;
    return canReadConfTache(t) || unlockedConfTaches[t.id];
  });

  const handleCreateTache = () => {
    if (!tacheForm.titre) { gcAlert("Veuillez renseigner le titre de la tâche."); return; }
    const assignee = users.find(u=>u.id===tacheForm.assignedTo);
    const linkedPartner = tacheForm.partnerId ? partners.find(p=>p.id===tacheForm.partnerId) : null;
    const newT = {
      id: "TACHE-"+Date.now(), titre: tacheForm.titre,
      dossier: tacheForm.dossier, assignedTo: tacheForm.assignedTo,
      deadline: tacheForm.deadline, priority: tacheForm.priority,
      status: "ATTENTE_TRAITEMENT", type: tacheForm.type,
      createdAt: new Date().toISOString().split("T")[0], createdBy: localUser.id,
      partnerId: linkedPartner?.id||null, partnerNom: linkedPartner?.nom||null,
      submitAction: tacheForm.submitAction, description: tacheForm.description,
      confidentiel: localUser.level >= 4 && tacheForm.confidentiel,
      confPass: localUser.level >= 4 && tacheForm.confidentiel ? tacheForm.confPass : null,
      confAccess: localUser.level >= 4 && tacheForm.confidentiel ? [localUser.id, ...(tacheForm.confAccess||[])] : null,
    };
    if (setTaches) setTaches(prev => {const updated=[...prev, newT];dsSave('taches',updated);return updated;});
    setNotifications(prev => [{id:"N"+Date.now(),icon:"📋",message:`Tâche [${tacheForm.submitAction}] : "${tacheForm.titre}" → ${assignee?.name||"?"}${linkedPartner?" | "+linkedPartner.nom:""}`,at:new Date().toISOString(),read:false},...prev]);
    if (linkedPartner) setTimeout(()=>setNotifications(p=>[{id:"N"+Date.now(),icon:"📌",message:`📌 Rappel tâche avec ${linkedPartner.nom} : ${tacheForm.titre}`,at:new Date().toISOString(),read:false},...p]),200);
    // FIX v92 — Notifier l'assigné s'il est différent du créateur
    if (assignee && assignee.id !== localUser.id) {
      gcPushNotif(assignee.id, {
        id: "N"+Date.now()+assignee.id, icon: "📋",
        message: `📋 Nouvelle tâche [${tacheForm.submitAction}] de ${localUser.name} : "${tacheForm.titre}"${tacheForm.deadline?" — Échéance : "+tacheForm.deadline:""}`,
        at: new Date().toISOString(), read: false, module: "taches",
      });
    }
    playSound("task");
    setShowNewTache(false);
    setTacheForm({titre:"",dossier:"",assignedTo:localUser.id,deadline:"",priority:"NORMALE",type:"RÉDACTION",partnerId:"",submitAction:"TRAITER",description:""});
  };

  const handleStatusChange = (tId, newStatus) => {
    const tache = taches.find(t => t.id === tId);
    if (setTaches) setTaches(prev => {const updated=prev.map(t => t.id === tId ? {...t,status:newStatus} : t);dsSave('taches',updated);return updated;});
    if (tache) {
      const statusLabels = {EN_COURS:"mis en cours",ATTENTE_VALIDATION:"soumis pour validation",TERMINE:"marqué terminé",REJETE:"rejeté",ANNULE:"annulé"};
      const assignee = users.find(u=>u.id===tache.assignedTo);
      const creator = users.find(u=>u.id===tache.createdBy);
      const actionLabel = statusLabels[newStatus]||newStatus;
      setNotifications(prev=>[{id:"N"+Date.now(),icon:"📋",message:`Tâche "${tache.titre}" — ${actionLabel} par ${localUser.name}${assignee&&assignee.id!==localUser.id?" · Assignée à : "+assignee.name:""}${creator&&creator.id!==localUser.id?" · Créé par : "+creator.name:""}`,at:new Date().toISOString(),read:false},...prev]);
      // FIX v92 — Notifier créateur et assigné du changement de statut
      const now = new Date().toISOString();
      const notifTargets = new Set();
      if (creator && creator.id !== localUser.id) notifTargets.add(creator.id);
      if (assignee && assignee.id !== localUser.id) notifTargets.add(assignee.id);
      notifTargets.forEach(uid => {
        gcPushNotif(uid, {
          id:"N"+Date.now()+uid, icon:"📋",
          message:`📋 Tâche "${tache.titre}" — ${actionLabel} par ${localUser.name}`,
          at:now, read:false, module:"taches",
        });
      });
    }
  };

  const allLogs = sessionLogs || [];
  const filteredLogs = allLogs.filter(l => {
    if (!(localUser?.isAdmin || localUser?.level >= 6) && (l.userLevel >= 6 || l.isAdminUser === true)) return false;
    const typeMatch = sesFilter === "ALL" || l.type === sesFilter || l.status === sesFilter;
    const searchMatch = !sesSearch || l.userName?.toLowerCase().includes(sesSearch.toLowerCase()) || l.userRole?.toLowerCase().includes(sesSearch.toLowerCase()) || l.userId?.toLowerCase().includes(sesSearch.toLowerCase());
    return typeMatch && searchMatch;
  });

  const SESSION_TYPE_CONFIG = {
    CONNEXION:    { icon:"🟢", color:"#22C55E", label:"Connexion" },
    DECONNEXION:  { icon:"🔴", color:"#EF4444", label:"Déconnexion" },
    TENTATIVE:    { icon:"⚠️",  color:"#F59E0B", label:"Tentative" },
  };
  const SESSION_STATUS_CONFIG = {
    SUCCESS: { icon:"✅", color:"#22C55E", label:"Succès" },
    FAILED:  { icon:"❌", color:"#EF4444", label:"Échec" },
    PENDING: { icon:"⏳", color:"#F59E0B", label:"En attente" },
    MANUAL:  { icon:"👤", color:"#3B82F6", label:"Manuelle" },
    AUTO:    { icon:"🤖", color:"#A855F7", label:"Automatique" },
  };

  const todayLogs = allLogs.filter(l => l.at?.startsWith(new Date().toISOString().slice(0,10)));
  const stats = {
    total: todayLogs.length,
    connexions: todayLogs.filter(l=>l.type==="CONNEXION"&&l.status==="SUCCESS").length,
    echecs: todayLogs.filter(l=>l.status==="FAILED").length,
    actifs: [...new Set(allLogs.filter(l=>l.type==="CONNEXION"&&l.status==="SUCCESS").map(l=>l.userId))].filter(uid => !allLogs.find(l=>l.userId===uid&&l.type==="DECONNEXION"&&new Date(l.at)>new Date(allLogs.find(x=>x.userId===uid&&x.type==="CONNEXION"&&x.status==="SUCCESS")?.at||0))).length,
  };

  const handleCreateTaskFromSession = (log) => {
    const newT = {
      id: "TACHE-"+Date.now(),
      titre: `[SUIVI SESSION] ${log.type} ${log.userName} — ${formatDateTime(log.at)}`,
      dossier: "", assignedTo: localUser.id, deadline: new Date().toISOString().split("T")[0],
      priority: log.status==="FAILED"?"HAUTE":"NORMALE", status:"ATTENTE_TRAITEMENT",
      type:"SUIVI", createdAt: new Date().toISOString().split("T")[0], createdBy: localUser.id,
      sessionRef: log.id,
    };
    if (setTaches) setTaches(prev => [...prev, newT]);
    setNotifications(prev => [{id:"N"+Date.now(),icon:"🔐",message:`Tâche de suivi créée pour session : ${log.userName}`,at:new Date().toISOString(),read:false},...prev]);
    gcAlert(`✅ Tâche de suivi créée : "${newT.titre}"`);
  };

  const handleExportSessions = () => {
    const csv = ["Date,Type,Statut,Utilisateur,Rôle,Niveau,Processus,Appareil,Motif",
      ...filteredLogs.map(l=>`"${formatDateTime(l.at)}","${l.type}","${l.status}","${l.userName}","${l.userRole}","${l.userLevel}","${l.userProcess}","${l.device||'—'}","${l.reason||'—'}"`)
    ].join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`sessions-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Tab selector */}
      <div style={{display:"flex",gap:6,marginBottom:14,borderBottom:`1px solid ${T.border}`,paddingBottom:10,flexWrap:"wrap"}}>
        <button onClick={()=>setMainTab("taches")} style={{background:mainTab==="taches"?"#C41E3A":T.surface2,color:mainTab==="taches"?"#fff":T.textMuted,border:`1px solid ${mainTab==="taches"?"#C41E3A":T.border}`,borderRadius:8,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>
          📋 Tâches ({visibleTaches.length})
        </button>
        <button onClick={()=>setMainTab("alertes_generales")} style={{background:mainTab==="alertes_generales"?"#F59E0B":T.surface2,color:mainTab==="alertes_generales"?"#fff":T.textMuted,border:`1px solid ${mainTab==="alertes_generales"?"#F59E0B":T.border}`,borderRadius:8,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
          🔔 Alertes Générales {myNotifAlerts.filter(n=>!n.read).length>0&&<span style={{background:"#F59E0B",color:"#fff",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800}}>{myNotifAlerts.filter(n=>!n.read).length}</span>}
        </button>
        {canSeeSessions && (
          <button onClick={()=>setMainTab("sessions")} style={{background:mainTab==="sessions"?"#3B82F6":T.surface2,color:mainTab==="sessions"?"#fff":T.textMuted,border:`1px solid ${mainTab==="sessions"?"#3B82F6":T.border}`,borderRadius:8,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
            🔐 Sessions & Sécurité {allLogs.filter(l=>l.status==="FAILED").length > 0 && <span style={{background:"#EF4444",color:"#fff",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800}}>{allLogs.filter(l=>l.status==="FAILED").length}</span>}
          </button>
        )}
        {(canSeeSessions) && siAlerts.length > 0 && (
          <button onClick={()=>setMainTab("alertes_securite")} style={{background:mainTab==="alertes_securite"?"#EF4444":T.surface2,color:mainTab==="alertes_securite"?"#fff":T.textMuted,border:`1px solid ${mainTab==="alertes_securite"?"#EF4444":T.border}`,borderRadius:8,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
            🚨 Alertes Sécurité <span style={{background:"#EF4444",color:"#fff",borderRadius:"50%",width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800}}>{siAlerts.length}</span>
          </button>
        )}
      </div>

      {/* ── TÂCHES ── */}
      {mainTab === "taches" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h3 style={{color:"#C41E3A",margin:0,fontSize:14,fontWeight:800}}>📋 Planificateur de Tâches & Alertes</h3>
            {localUser.level >= 2 && <Btn variant="primary" size="sm" onClick={()=>setShowNewTache(true)}>+ Nouvelle tâche</Btn>}
          </div>
          {/* ── Barre recherche + filtres fonctionnels ── */}
          <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={tacheSearch} onChange={e=>setTacheSearch(e.target.value)} placeholder="🔍 Rechercher une tâche…"
              style={{flex:1,minWidth:160,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:12}} />
            <select value={tacheFilter} onChange={e=>{setTacheFilter(e.target.value);setSelectedTaches([]);}}
              style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🔍 Tous statuts</option>
              <option value="EN_ATTENTE">⏳ En attente</option>
              <option value="EN_COURS">▶ En cours</option>
              <option value="ATTENTE_VALIDATION">🔍 À valider</option>
              <option value="HAUTE">⚡ Priorité haute</option>
              <option value="TERMINE">✅ Terminés</option>
              <option value="RETARD">⚠ En retard</option>
            </select>
            <select value={tachePriorityFilter} onChange={e=>{setTachePriorityFilter(e.target.value);setSelectedTaches([]);}}
              style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🎯 Toutes priorités</option>
              <option value="HAUTE">🔴 Haute</option>
              <option value="MOYENNE">🟡 Moyenne</option>
              <option value="NORMALE">🟢 Normale</option>
              <option value="BASSE">⚪ Basse</option>
            </select>
            <select value={tacheProcessFilter} onChange={e=>{setTacheProcessFilter(e.target.value);setSelectedTaches([]);}}
              style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🗂️ Tous processus</option>
              {[...new Set((visibleTaches||[]).map(t=>t.process||t.module||"—").filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            {visibleTaches.some(t=>t.status==="TERMINE"||t.status==="REJETE"||t.status==="ANNULE") && (
              <button onClick={async ()=>{if(await gcConfirm("Supprimer toutes les tâches terminées/annulées ?"))setTaches&&setTaches(prev=>prev.filter(t=>!(["TERMINE","REJETE","ANNULE"].includes(t.status)&&(t.assignedTo===localUser.id||t.createdBy===localUser.id||localUser.level>=4))));setSelectedTaches([]);}}
                style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>
                🗑️ Purger terminées
              </button>
            )}
          </div>
          {/* ── Actions multi-sélection ── */}
          {selectedTaches.length > 0 && (
            <div style={{background:"#3B82F611",border:"1px solid #3B82F644",borderRadius:8,padding:"8px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{color:"#3B82F6",fontWeight:700,fontSize:11}}>✔ {selectedTaches.length} sélectionné(s)</span>
              <button onClick={async () => {if(await gcConfirm(`Marquer ${selectedTaches.length} tâche(s) comme terminées ?`)){setTaches&&setTaches(prev=>prev.map(t=>selectedTaches.includes(t.id)?{...t,status:"TERMINE"}:t));setSelectedTaches([]);}}}
                style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Terminer</button>
              <button onClick={async () => {if(await gcConfirm(`Supprimer ${selectedTaches.length} tâche(s) ?`)){setTaches&&setTaches(prev=>prev.filter(t=>!selectedTaches.includes(t.id)));setSelectedTaches([]);}}}
                style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️ Supprimer</button>
              <button onClick={()=>setSelectedTaches([])} style={{background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:10,marginLeft:"auto"}}>✕ Désélectionner</button>
            </div>
          )}
          {(() => {
            const filtered = visibleTaches.filter(t => {
              const q = tacheSearch.toLowerCase();
              const matchSearch = !q || t.titre?.toLowerCase().includes(q) || getUser(t.assignedTo,users).name?.toLowerCase().includes(q) || t.type?.toLowerCase().includes(q);
              const dl = daysLeft(t.deadline);
              const matchFilter =
                tacheFilter==="ALL" ? true :
                tacheFilter==="EN_ATTENTE" ? (t.status==="ATTENTE_TRAITEMENT"||t.status==="ATTENTE_SIGNATURE"||t.status==="ATTENTE_APPROBATION") :
                tacheFilter==="EN_COURS" ? t.status==="EN_COURS" :
                tacheFilter==="ATTENTE_VALIDATION" ? t.status==="ATTENTE_VALIDATION" :
                tacheFilter==="HAUTE" ? t.priority==="HAUTE" :
                tacheFilter==="TERMINE" ? (t.status==="TERMINE"||t.status==="REJETE"||t.status==="ANNULE") :
                tacheFilter==="RETARD" ? (dl<0 && !["TERMINE","REJETE","ANNULE"].includes(t.status)) : true;
              const matchPriority = tachePriorityFilter==="ALL" || t.priority===tachePriorityFilter;
              const matchProcess = tacheProcessFilter==="ALL" || (t.process||t.module||"—")===tacheProcessFilter;
              return matchSearch && matchFilter && matchPriority && matchProcess;
            }).sort((a,b)=>{
              const pO={HAUTE:0,MOYENNE:1,NORMALE:2}; const sO={ATTENTE_VALIDATION:0,ATTENTE_TRAITEMENT:1,EN_COURS:2,ATTENTE_SIGNATURE:3,TERMINE:4,REJETE:5,ANNULE:5};
              return (sO[a.status]-sO[b.status])||(pO[a.priority]-pO[b.priority]);
            });
            const allIds = filtered.map(t=>t.id);
            const allSel = allIds.length>0 && allIds.every(id=>selectedTaches.includes(id));
            return (
              <>
                {filtered.length>0&&(
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",marginBottom:4}}>
                    <input type="checkbox" checked={allSel} onChange={()=>setSelectedTaches(allSel?[]:allIds)} style={{width:14,height:14,cursor:"pointer",accentColor:"#3B82F6"}} />
                    <span style={{color:T.textDim,fontSize:10,fontWeight:600}}>Tout sélectionner ({filtered.length} tâche{filtered.length>1?"s":""})</span>
                  </div>
                )}
                {filtered.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:30,fontSize:12}}>Aucune tâche correspondante</div>}
                {filtered.map(t => {
                  const sc=STATUS_CONFIG[t.status]||{icon:"📋",label:t.status,color:"#888"}; const pc=PRIORITY_CONFIG[t.priority]; const dl=daysLeft(t.deadline);
                  const isMine=t.assignedTo===localUser.id||t.assigneeId===localUser.id;
                  const isCreator=t.createdBy===localUser.id;
                  const canEdit=localUser.level>=3||(isMine&&localUser.level>=2&&t.status!=="EN_COURS"&&t.status!=="ATTENTE_VALIDATION");
                  const isDone=t.status==="TERMINE"||t.status==="REJETE"||t.status==="ANNULE";
                  const isSelected=selectedTaches.includes(t.id);
                  return (
                    <div key={t.id} style={{background:isSelected?`${sc?.color}18`:T.surface2,borderRadius:10,border:`1px solid ${isSelected?"#3B82F666":isDone?"#22C55E22":dl<0?"#C41E3A44":T.border}`,padding:"12px 16px",marginBottom:8,display:"flex",gap:10,alignItems:"center",opacity:isDone?0.8:1,transition:"all 0.15s"}}>
                      <input type="checkbox" checked={isSelected} onChange={()=>setSelectedTaches(prev=>isSelected?prev.filter(id=>id!==t.id):[...prev,t.id])}
                        style={{width:15,height:15,cursor:"pointer",accentColor:"#3B82F6",flexShrink:0}} />
                      <span style={{fontSize:20}}>{sc?.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{color:T.text,fontWeight:700,fontSize:13}}>{t.titre}</div>
                        <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>
                          Assigné à {getUser(t.assignedTo,users).name}
                          {t.createdBy&&t.createdBy!==t.assignedTo?` · Créé par ${getUser(t.createdBy,users).name}`:""} {t.dossier?`• Dossier : ${t.dossier}`:""} • {t.type}
                        </div>
                        {(t.status==="REJETE"||t.status==="ANNULE")&&t.rejectComment&&<div style={{color:"#EF4444",fontSize:10,marginTop:2}}>❌ {t.status==="ANNULE"?"Annulation":"Rejet"} : {t.rejectComment}</div>}
                        {dl<0&&!isDone&&<div style={{color:"#C41E3A",fontSize:10,fontWeight:700,marginTop:2}}>⚠ DÉLAI DÉPASSÉ DE {Math.abs(dl)} JOUR(S)</div>}
                        {dl>=0&&dl<3&&!isDone&&<div style={{color:"#F59E0B",fontSize:10,fontWeight:700,marginTop:2}}>⚡ URGENT — Échéance dans {dl} jour(s)</div>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end"}}>
                        <div style={{display:"flex",gap:5}}>
                          <Badge label={sc?.label} color={sc?.color} small />
                          <Badge label={pc?.label} color={pc?.color} small />
                        </div>
                        <div style={{color:T.textMuted,fontSize:10}}>{formatDate(t.deadline)}</div>
                        {!isDone&&canEdit&&(
                          <div style={{display:"flex",gap:4,marginTop:2}}>
                            {(isMine||localUser.level>=3)&&<button onClick={()=>handleStatusChange(t.id,"EN_COURS")} title="Mettre en cours" style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:4,padding:"2px 6px",color:"#3B82F6",cursor:"pointer",fontSize:10}}>▶</button>}
                            {localUser.level>=3&&<button onClick={()=>handleStatusChange(t.id,"ATTENTE_VALIDATION")} title="Soumettre" style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:4,padding:"2px 6px",color:"#A855F7",cursor:"pointer",fontSize:10}}>🔍</button>}
                            {localUser.level>=3&&<button onClick={()=>handleStatusChange(t.id,"TERMINE")} title="Terminer" style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:4,padding:"2px 6px",color:"#22C55E",cursor:"pointer",fontSize:10}}>✅</button>}
                            {localUser.level>=4&&!isCreator&&<button onClick={async () => {const m = await gcPrompt("Motif du rejet :");if(m!==null){if(setTaches)setTaches(prev=>prev.map(tk=>tk.id===t.id?{...tk,status:"REJETE",rejectComment:m,rejectedBy:localUser.id}:tk));setNotifications(prev=>[{id:"N"+Date.now(),icon:"❌",message:`Tâche "${t.titre}" rejetée par ${localUser.name} — Motif : ${m}`,at:new Date().toISOString(),read:false},...prev]);}}} title="Rejeter" style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:4,padding:"2px 6px",color:"#F59E0B",cursor:"pointer",fontSize:10}}>❌</button>}
                    </div>
                  )}
                  {/* Annuler : accessible au créateur à TOUT MOMENT (hors tâche déjà terminée) */}
                  {!isDone&&isCreator&&<button onClick={async () => {const m = await gcPrompt("Motif de l'annulation (obligatoire) :");if(m!==null&&m.trim()){if(setTaches)setTaches(prev=>prev.map(tk=>tk.id===t.id?{...tk,status:"ANNULE",rejectComment:m.trim(),rejectedBy:localUser.id,cancelledAt:new Date().toISOString()}:tk));setNotifications(prev=>[{id:"N"+Date.now(),icon:"🚫",message:`Tâche "${t.titre}" annulée par son créateur ${localUser.name} — Motif : ${m.trim()}`,at:new Date().toISOString(),read:false},...prev]);}else if(m!==null){gcAlert("Un motif est obligatoire pour annuler.");}}} title="Annuler cette tâche (créateur)" style={{background:"#C41E3A22",border:"1px solid #C41E3A44",borderRadius:4,padding:"2px 6px",color:"#C41E3A",cursor:"pointer",fontSize:10,marginTop:2}}>🚫 Annuler</button>}
                  {/* Bouton supprimer si tâche terminée/annulée */}
                  {isDone&&(isMine||isCreator||localUser.level>=4)&&(
                    <button onClick={async () => {if(await gcConfirm("Supprimer cette tâche ?"))setTaches&&setTaches(prev=>{const updated=prev.filter(tk=>tk.id!==t.id);dsSave('taches',updated);return updated;});setSelectedTaches(p=>p.filter(id=>id!==t.id));}} title="Supprimer" style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:10,marginTop:2}}>🗑️</button>
                  )}
                  {!isDone&&!canEdit&&t.status!=="ATTENTE_TRAITEMENT"&&<span style={{fontSize:9,color:T.textDim}}>🔒 Soumis</span>}
                </div>
              </div>
            );
          })}
              </>
            );
          })()}

          {showNewTache&&(
            <Modal title="📋 Nouvelle Tâche" onClose={()=>setShowNewTache(false)} T={T} wide>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <InputField label="Titre *" value={tacheForm.titre} onChange={e=>setTacheForm(f=>({...f,titre:e.target.value}))} T={T} />
                <InputField label="Description / Instructions" value={tacheForm.description} onChange={e=>setTacheForm(f=>({...f,description:e.target.value}))} T={T} />
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>👤 Collaborateur interne (assigné)</label>
                    <select value={tacheForm.assignedTo} onChange={e=>setTacheForm(f=>({...f,assignedTo:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"9px 13px",color:T.text,fontSize:12,outline:"none"}}>
                      {(localUser.level>=4?users:localUser.level>=3?users.filter(u=>_activeUser(u)&&u.process===localUser.process||localUser.processes?.includes(u.process)||u.id===localUser.id):[localUser]).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role} · Niv.{u.level}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>🌐 Partenaire externe (rappel)</label>
                    <select value={tacheForm.partnerId} onChange={e=>setTacheForm(f=>({...f,partnerId:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"9px 13px",color:T.text,fontSize:12,outline:"none"}}>
                      <option value="">— Aucun partenaire —</option>
                      <optgroup label="🤝 Clients">{partners.filter(p=>p.type==="client").map(p=><option key={p.id} value={p.id}>🤝 {p.nom}</option>)}</optgroup>
                      <optgroup label="📦 Fournisseurs">{partners.filter(p=>p.type==="fournisseur").map(p=><option key={p.id} value={p.id}>📦 {p.nom}</option>)}</optgroup>
                      <optgroup label="Autres">{partners.filter(p=>!["client","fournisseur"].includes(p.type)).map(p=><option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup>
                    </select>
                    {tacheForm.partnerId&&<div style={{color:"#F59E0B",fontSize:9,marginTop:2}}>📌 Un rappel vous sera généré</div>}
                  </div>
                  <SelectField label="Action requise" value={tacheForm.submitAction} onChange={e=>setTacheForm(f=>({...f,submitAction:e.target.value}))}
                    options={["TRAITER","VALIDER","SIGNER","APPROUVER","RÉVISER","ARCHIVER","TRANSMETTRE","CONSULTER","NOTIFIER","POUR INFO"].map(a=>({value:a,label:a}))} T={T} />
                  <SelectField label="Priorité" value={tacheForm.priority} onChange={e=>setTacheForm(f=>({...f,priority:e.target.value}))} options={Object.entries(PRIORITY_CONFIG).map(([k,v])=>({value:k,label:v.label}))} T={T} />
                  <SelectField label="Type" value={tacheForm.type} onChange={e=>setTacheForm(f=>({...f,type:e.target.value}))} options={["RÉDACTION","VALIDATION","COLLECTE","ARCHIVAGE","RÉUNION","SUIVI","AUTRE"].map(t=>({value:t,label:t}))} T={T} />
                  <InputField label="Date d'échéance" type="date" value={tacheForm.deadline} onChange={e=>setTacheForm(f=>({...f,deadline:e.target.value}))} T={T} />
                  <SelectField label="📁 Dossier associé" value={tacheForm.dossier} onChange={e=>setTacheForm(f=>({...f,dossier:e.target.value}))}
                    options={[{value:"",label:"-- Aucun --"},...dossiers.map(d=>({value:d.id,label:`${d.ref} — ${d.client}`}))]} T={T} />
                </div>
                <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",fontSize:11,color:T.text}}>
                  📨 Tâche [{tacheForm.submitAction}] assignée à <strong style={{color:"#3B82F6"}}>{users.find(u=>u.id===tacheForm.assignedTo)?.name||"?"}</strong>
                  {tacheForm.partnerId && <> | Partenaire : <strong style={{color:"#22C55E"}}>{partners.find(p=>p.id===tacheForm.partnerId)?.nom}</strong></>}
                </div>
                 {/* ── CONFIDENTIEL (niv 4+) ── */}
                 {localUser.level >= 4 && (
                   <div style={{background:tacheForm.confidentiel?"#C41E3A10":"#44444410",border:`1.5px solid ${tacheForm.confidentiel?"#C41E3A44":"#44444444"}`,borderRadius:10,padding:"10px 12px"}}>
                     <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:tacheForm.confidentiel?8:0}}>
                       <input type="checkbox" checked={tacheForm.confidentiel} onChange={e=>setTacheForm(f=>({...f,confidentiel:e.target.checked,confPass:"",confAccess:[]}))} style={{width:15,height:15,accentColor:"#C41E3A"}} />
                       <span style={{color:tacheForm.confidentiel?"#C41E3A":T.textMuted,fontWeight:700,fontSize:11}}>🔒 Tâche Confidentielle</span>
                     </label>
                     {tacheForm.confidentiel && (
                       <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                         <div>
                           <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Mot de passe d'accès *</label>
                           <input type="password" value={tacheForm.confPass} onChange={e=>setTacheForm(f=>({...f,confPass:e.target.value}))}
                             placeholder="Min. 6 caractères" style={{width:"100%",background:T.surface3,border:"1px solid #C41E3A44",borderRadius:6,padding:"6px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                         </div>
                         <div>
                           <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Accès autorisé à</label>
                           <select multiple value={tacheForm.confAccess} onChange={e=>setTacheForm(f=>({...f,confAccess:[...e.target.selectedOptions].map(o=>o.value)}))} style={{width:"100%",background:T.surface3,border:"1px solid #C41E3A44",borderRadius:6,padding:"3px 8px",color:T.text,fontSize:10,height:68}}>
                             {users.filter(u=>_activeUser(u)&&u.id!==localUser.id&&!u.blocked).map(u=><option key={u.id} value={u.id}>{u.name} (Niv.{u.level})</option>)}
                           </select>
                         </div>
                       </div>
                     )}
                   </div>
                 )}

                <div style={{display:"flex",gap:8,marginTop:6}}>
                  <Btn variant="primary" onClick={handleCreateTache}>✅ Créer & Notifier</Btn>
                  <Btn variant="ghost" onClick={()=>setShowNewTache(false)}>Annuler</Btn>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── SESSIONS & ALERTES ── */}
      {mainTab === "sessions" && canSeeSessions && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h3 style={{color:"#3B82F6",margin:0,fontSize:14,fontWeight:800}}>🔐 Surveillance des Sessions & Alertes</h3>
            <div style={{display:"flex",gap:6}}>
              {isRHManager&&<Badge label="RH · S03" color="#22C55E" />}
              {(localUser?.isAdmin || localUser?.level >= 6)&&isAdmin&&<Badge label="ADMIN" color="#C41E3A" />}
              {localUser.level>=5&&!(localUser?.isAdmin || localUser?.level >= 6)&&<Badge label="DG · Niv5+" color="#A855F7" />}
              <button onClick={handleExportSessions} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>📊 Exporter CSV</button>
              {((localUser?.isAdmin || localUser?.level >= 6)||localUser.level>=5)&&<button onClick={async () => {if(await gcConfirm("Effacer tous les journaux de session ?"))setSessionLogs&&setSessionLogs(INITIAL_SESSION_LOGS.slice(0,1));}} style={{background:"#EF444415",border:"1px solid #EF444444",color:"#EF4444",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗑️ Purger</button>}
            </div>
          </div>

          {/* Stats row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {[
              {label:"Événements aujourd'hui",val:stats.total,icon:"📅",color:"#3B82F6"},
              {label:"Connexions réussies",val:stats.connexions,icon:"🟢",color:"#22C55E"},
              {label:"Échecs / Alertes",val:stats.echecs,icon:"⚠️",color:"#EF4444"},
              {label:"Total journaux",val:allLogs.length,icon:"📋",color:"#A855F7"},
            ].map(s=>(
              <div key={s.label} style={{background:s.color+"11",border:`1px solid ${s.color}33`,borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
                <div style={{color:s.color,fontWeight:900,fontSize:20}}>{s.val}</div>
                <div style={{color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:0.5,marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <input value={sesSearch} onChange={e=>setSesSearch(e.target.value)} placeholder="🔍 Rechercher utilisateur…"
              style={{flex:1,minWidth:180,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}} />
            {["ALL","CONNEXION","DECONNEXION","TENTATIVE","SUCCESS","FAILED"].map(f=>(
              <button key={f} onClick={()=>setSesFilter(f)} style={{background:sesFilter===f?"#3B82F6":T.surface2,color:sesFilter===f?"#fff":T.textMuted,border:`1px solid ${sesFilter===f?"#3B82F6":T.border}`,borderRadius:16,padding:"4px 12px",cursor:"pointer",fontSize:10,fontWeight:sesFilter===f?700:400,flexShrink:0}}>
                {f==="ALL"?"Tous":f==="CONNEXION"?"🟢 Connexion":f==="DECONNEXION"?"🔴 Déco":f==="TENTATIVE"?"⚠️ Tentatives":f==="SUCCESS"?"✅ Succès":"❌ Échecs"}
              </button>
            ))}
          </div>

          {/* Log list */}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {filteredLogs.slice(0,50).map(log=>{
              const tc=SESSION_TYPE_CONFIG[log.type]||{icon:"❓",color:"#888",label:log.type};
              const sc2=SESSION_STATUS_CONFIG[log.status]||{icon:"❓",color:"#888",label:log.status};
              const u=users.find(u=>u.id===log.userId);
              const isAlert=log.status==="FAILED";
              const isSelected=selectedLog?.id===log.id;
              return (
                <div key={log.id} onClick={()=>setSelectedLog(isSelected?null:log)}
                  style={{background:isAlert?"#EF444408":T.surface2,border:`1px solid ${isAlert?"#EF444433":isSelected?"#3B82F6":T.border}`,borderRadius:10,padding:"10px 14px",cursor:"pointer",transition:"all 0.15s"}}>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{width:32,height:32,borderRadius:8,background:tc.color+"22",border:`1px solid ${tc.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{tc.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{color:T.text,fontWeight:700,fontSize:12}}>{log.userName}</span>
                        <Badge label={log.userRole} color={tc.color} small />
                        <Badge label={`Niv.${log.userLevel}`} color="#C41E3A" small />
                        <Badge label={log.userProcess} color="#3B82F6" small />
                        {isAlert&&<Badge label="⚠️ ALERTE" color="#EF4444" small />}
                      </div>
                      <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>
                        {tc.label} · {formatDateTime(log.at)} · {log.device||"—"}
                      </div>
                      {log.reason&&<div style={{color:isAlert?"#EF4444":T.textDim,fontSize:10,marginTop:1,fontStyle:"italic"}}>{isAlert?"⚠️ ":""}{log.reason}</div>}
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0,alignItems:"center"}}>
                      <div style={{background:sc2.color+"22",border:`1px solid ${sc2.color}44`,borderRadius:6,padding:"3px 8px",display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:10}}>{sc2.icon}</span>
                        <span style={{color:sc2.color,fontSize:10,fontWeight:700}}>{sc2.label}</span>
                      </div>
                      <span style={{color:T.textDim,fontSize:12}}>{isSelected?"▲":"▼"}</span>
                    </div>
                  </div>

                  {isSelected&&(
                    <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                        {[["ID Log",log.id],["ID Utilisateur",log.userId],["Adresse IP",log.ip||"—"],["Appareil",log.device||"—"],["Processus",log.userProcess],["Habilitation",`Niveau ${log.userLevel}`]].map(([l,v])=>(
                          <div key={l} style={{background:T.surface3,borderRadius:6,padding:"6px 10px"}}>
                            <div style={{color:T.textDim,fontSize:9,textTransform:"uppercase",marginBottom:2}}>{l}</div>
                            <div style={{color:T.text,fontSize:11,fontWeight:600,fontFamily:l==="ID Log"||l==="ID Utilisateur"||l==="Adresse IP"?"monospace":"inherit"}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button onClick={e=>{e.stopPropagation();handleCreateTaskFromSession(log);}} style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:6,padding:"5px 12px",color:"#3B82F6",cursor:"pointer",fontSize:10,fontWeight:700}}>📋 Créer tâche de suivi</button>
                        {((localUser?.isAdmin || localUser?.level >= 6)||localUser.level>=5)&&!(log.userLevel>=6&&!(localUser?.isAdmin || localUser?.level >= 6))&&<button onClick={async e => {e.stopPropagation();if(await gcConfirm(`Bloquer l'utilisateur ${log.userName} ?`)){setUsers(prev=>prev.map(u=>u.id===log.userId?{...u,blocked:true}:u));setNotifications(prev=>[{id:"N"+Date.now(),icon:"🚫",message:`Compte ${log.userName} bloqué par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);}}} style={{background:"#EF444415",border:"1px solid #EF444444",borderRadius:6,padding:"5px 12px",color:"#EF4444",cursor:"pointer",fontSize:10,fontWeight:700}}>🚫 Bloquer compte</button>}
                        {((localUser?.isAdmin || localUser?.level >= 6)||isRHManager)&&!(log.userLevel>=6&&!(localUser?.isAdmin || localUser?.level >= 6))&&<button onClick={async e => {e.stopPropagation();const note = await gcPrompt("Note de suivi :");if(note)setNotifications(prev=>[{id:"N"+Date.now(),icon:"📝",message:`[SUIVI SESSION] ${log.userName} — ${note}`,at:new Date().toISOString(),read:false},...prev]);gcAlert("Note enregistrée.");}} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:6,padding:"5px 12px",color:"#F59E0B",cursor:"pointer",fontSize:10,fontWeight:700}}>📝 Ajouter note</button>}
                        {isAlert&&((localUser?.isAdmin || localUser?.level >= 6)||localUser.level>=5)&&!(log.userLevel>=6&&!(localUser?.isAdmin || localUser?.level >= 6))&&<button onClick={e=>{e.stopPropagation();if(setSessionLogs)setSessionLogs(prev=>prev.map(l=>l.id===log.id?{...l,reviewed:true}:l));}} style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:6,padding:"5px 12px",color:"#22C55E",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Marquée comme traitée</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredLogs.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:40}}>Aucun événement de session trouvé</div>}
            {filteredLogs.length>50&&<div style={{color:T.textDim,textAlign:"center",fontSize:11,padding:8}}>Affichage limité aux 50 derniers événements — Exportez pour voir tout</div>}
          </div>
        </div>
      )}

      {/* ── ALERTES GÉNÉRALES (activités globales du SI) ── */}
      {mainTab === "alertes_generales" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div>
              <h3 style={{color:"#F59E0B",margin:0,fontSize:14,fontWeight:800}}>🔔 Alertes Générales — Activités Temps Réel</h3>
              <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>
                {(localUser?.isAdmin || localUser?.level >= 6)||_myLevel>=4?"Vue complète":_myLevel>=3?`Périmètre (${_myProcsAlert.join(", ")})` : "Vue personnelle"}
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {selectedAlerts.length>0&&(
                <>
                  <button onClick={()=>{setNotifications(prev=>prev.map(n=>selectedAlerts.includes(n.id)?{...n,read:true}:n));setSelectedAlerts([]);}}
                    style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✓ Lire ({selectedAlerts.length})</button>
                  <button onClick={()=>{setNotifications(prev=>prev.map(n=>selectedAlerts.includes(n.id)?{...n,dismissed:true}:n));setSelectedAlerts([]);}}
                    style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️ Supprimer ({selectedAlerts.length})</button>
                </>
              )}
              <button onClick={()=>{setNotifications(prev=>prev.map(n=>({...n,dismissed:true})));setSelectedAlerts([]);}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗑️ Tout effacer</button>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={siAlertSearch} onChange={e=>setSiAlertSearch(e.target.value)} placeholder="🔍 Rechercher dans les alertes…"
              style={{flex:1,minWidth:160,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
            <select value={siAlertFilter} onChange={e=>{setSiAlertFilter(e.target.value);setSelectedAlerts([]);}}
              style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🔍 Toutes</option>
              <option value="NON_LU">🔔 Non lues</option>
              <option value="CREATION">➕ Création</option>
              <option value="MODIFICATION">✏️ Modification</option>
              <option value="VALIDATION">✅ Validation</option>
              <option value="CONNEXION">🔐 Connexion</option>
              <option value="APPROBATION">👤 Approbation</option>
              <option value="DOSSIER">📁 Dossier</option>
              <option value="DOCUMENT">📄 Document</option>
              <option value="TÂCHE">📋 Tâche</option>
            </select>
          </div>
          {(() => {
            const filteredNotifs = myNotifAlerts.filter(n => {
              const q = siAlertSearch.toLowerCase();
              const matchS = !q || n.message?.toLowerCase().includes(q);
              const matchF =
                siAlertFilter==="ALL" ? true :
                siAlertFilter==="NON_LU" ? !n.read :
                n.message?.toUpperCase().includes(siAlertFilter.toUpperCase()) ||
                (siAlertFilter==="CONNEXION" && (n.message?.toLowerCase().includes("connexion")||n.message?.toLowerCase().includes("session")));
              return matchS && matchF;
            });
            const allAlertIds = filteredNotifs.map(n=>n.id);
            const allAlertSel = allAlertIds.length>0 && allAlertIds.every(id=>selectedAlerts.includes(id));
            return (
              <>
                {filteredNotifs.length>0&&(
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",marginBottom:4}}>
                    <input type="checkbox" checked={allAlertSel} onChange={()=>setSelectedAlerts(allAlertSel?[]:allAlertIds)} style={{width:14,height:14,cursor:"pointer",accentColor:"#F59E0B"}} />
                    <span style={{color:T.textDim,fontSize:10,fontWeight:600}}>Tout sélectionner ({filteredNotifs.length})</span>
                  </div>
                )}
                {filteredNotifs.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:30,fontSize:12}}>✅ Aucune alerte correspondante</div>}
                {filteredNotifs.slice(0,60).map(n=>{
                  const vdiIcon=_alertVDI(n.message,n.icon);
                  const alertColor=n.icon==="🚨"||n.message?.toLowerCase().includes("urgent")?"#EF4444":n.icon==="✅"||n.icon==="✓"?"#22C55E":n.icon==="📁"||n.icon==="📋"?"#3B82F6":"#F59E0B";
                  const isSel=selectedAlerts.includes(n.id);
                  return (
                    <div key={n.id} style={{background:isSel?alertColor+"18":T.surface2,border:`1px solid ${isSel?"#F59E0B66":n.read?T.border+"44":alertColor+"33"}`,borderLeft:`3px solid ${n.read?"#22C55E":alertColor}`,borderRadius:8,padding:"10px 14px",marginBottom:5,display:"flex",gap:8,alignItems:"flex-start",transition:"all 0.15s"}}
                      onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=alertColor+"08";}}
                      onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=T.surface2;}}>
                      <input type="checkbox" checked={isSel} onChange={()=>setSelectedAlerts(prev=>isSel?prev.filter(id=>id!==n.id):[...prev,n.id])}
                        style={{width:14,height:14,cursor:"pointer",accentColor:"#F59E0B",flexShrink:0,marginTop:2}} />
                      <span style={{fontSize:15,flexShrink:0,opacity:n.read?0.5:1}}>{vdiIcon}</span>
                      <div style={{flex:1}}>
                        <div style={{color:n.read?T.textMuted:T.text,fontSize:12,lineHeight:1.5,fontWeight:n.read?400:600}}>{n.message}</div>
                        <div style={{display:"flex",gap:8,marginTop:3,flexWrap:"wrap"}}>
                          <span style={{color:T.textDim,fontSize:9}}>{formatDateTime(n.at)}</span>
                          {n.module&&<span style={{background:alertColor+"22",color:alertColor,borderRadius:4,padding:"0 5px",fontSize:9,fontWeight:600}}>{n.module}</span>}
                          {!n.read&&<span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:4,padding:"0 5px",fontSize:9,fontWeight:700}}>Non lu</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        {!n.read&&<button onClick={()=>setNotifications(prev=>prev.map(x=>x.id===n.id?{...x,read:true}:x))} style={{background:"#22C55E15",border:"1px solid #22C55E33",color:"#22C55E",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9,fontWeight:700}}>✓</button>}
                        <button onClick={()=>{setNotifications(prev=>prev.map(x=>x.id===n.id?{...x,dismissed:true}:x));setSelectedAlerts(p=>p.filter(id=>id!==n.id));}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}

      {/* ── ALERTES SÉCURITÉ (RH/Admin/DG) ── */}
      {mainTab === "alertes_securite" && canSeeSessions && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h3 style={{color:"#EF4444",margin:0,fontSize:14,fontWeight:800}}>🚨 Alertes Sécurité — Connexions & Comptes</h3>
            <button onClick={async () => {if(await gcConfirm("Effacer toutes les alertes sécurité ?"))try{_lsSet("gc-security-alerts","[]");setSiAlerts([]);}catch (_) {};}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗑️ Purger</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {siAlerts.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:40}}>Aucune alerte sécurité enregistrée</div>}
            {siAlerts.map((a,i)=>{
              const typeColors={SUSPENDU_LOGIN:"#EF4444",HORS_HORAIRES:"#F59E0B",APPROBATION_PENDANTE:"#3B82F6",NOUVEAU_COMPTE:"#A855F7"};
              const tc=typeColors[a.type]||"#888";
              return (
                <div key={a.id||i} style={{background:tc+"11",border:`1px solid ${tc}44`,borderRadius:10,padding:"10px 14px",display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:18,flexShrink:0}}>{a.type==="SUSPENDU_LOGIN"?"🔴":a.type==="HORS_HORAIRES"?"⏰":a.type==="APPROBATION_PENDANTE"?"⏳":"👤"}</span>
                  <div style={{flex:1}}>
                    <div style={{color:tc,fontWeight:700,fontSize:12}}>{a.type?.replace(/_/g," ")}</div>
                    <div style={{color:T.text,fontSize:11,marginTop:2}}>{a.msg}</div>
                    <div style={{color:T.textDim,fontSize:9,marginTop:2}}>{formatDateTime(a.at)}</div>
                  </div>
                  <button onClick={()=>{const updated=siAlerts.filter((_,j)=>j!==i);setSiAlerts(updated);try{_lsSet("gc-security-alerts",JSON.stringify(updated));}catch (_) {};}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};


