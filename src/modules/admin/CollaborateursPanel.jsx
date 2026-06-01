import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// CollaborateursPanel.jsx — SI Génie Consultant v141
import { _lsGet, _lsSet, _noop, gcPushNotif, playSound, _activeUser, getProcColor, dsSave, dsOnSync, dsGet, gcNormalizeUser } from '../../core/index.js';
import { gcToast } from '../../components/ToastManager.jsx';
import { STATUS_CONFIG, CODES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge} from '../../components/UI.jsx';

// ── FloatModal HORS du composant pour éviter le re-mount à chaque render ──
// (fix bug saisie lettre par lettre : React recréait le composant inline)
const FloatModal = React.memo(function FloatModal({title,color,onClose,children}) {
  return (
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:8000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"#0D1F38",border:`2px solid ${color}44`,borderRadius:16,padding:24,width:"100%",maxWidth:460,boxShadow:`0 24px 60px #000A, 0 0 0 1px ${color}22`}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{color,fontWeight:900,fontSize:14}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
});

export function CollaborateursPanel({ users=[], setUsers=_noop, currentUser, pendingApprovals=[], setPendingApprovals=_noop, T, isAdmin, partnersList, setPartnersList=_noop, setActiveModule=_noop, setAMod=_noop, dossiers=[], setDossiers=_noop, setSelectedDossier=_noop, setNotifications=_noop, setShowMessaging=_noop, setShowNewDossier=_noop, taches=[], setTaches=_noop }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  // ── FIX v142 — Présence en ligne (point vert/rouge) ──────────────────────
  // Mécanisme : chaque collaborateur qui ouvre ce module écrit son heartbeat
  // dans window.__gcOnlineUsers (Map userId → timestamp). Un intervalle de 20s
  // rafraîchit le heartbeat. On considère "en ligne" tout heartbeat < 45s.
  // Pour la visibilité cross-machine, on lit gc-presence depuis le SERVEUR via dsGet
  // ET on souscrit à dsOnSync pour re-render instantané quand un autre poste se connecte.
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());
  useEffect(() => {
    // Initialiser le store global si absent
    if (!window.__gcOnlineUsers) window.__gcOnlineUsers = new Map();

    // Recalcule l'ensemble des utilisateurs en ligne depuis toutes les sources
    const computeOnline = (serverPresence) => {
      const now = Date.now();
      const online = new Set();
      // Source 1 : window.__gcOnlineUsers (même machine)
      window.__gcOnlineUsers.forEach((ts, uid) => {
        if (now - ts < 45000) online.add(uid);
      });
      // Source 2 : gc-presence localStorage (mis à jour par SIApp heartbeat)
      try {
        const lsPresence = JSON.parse(_lsGet('gc-presence') || '{}');
        Object.entries(lsPresence).forEach(([uid, ts]) => {
          if (now - Number(ts) < 45000) online.add(uid);
        });
      } catch (_) {}
      // Source 3 : données serveur fraîches (cross-machine)
      if (serverPresence && typeof serverPresence === 'object') {
        Object.entries(serverPresence).forEach(([uid, ts]) => {
          if (now - Number(ts) < 45000) online.add(uid);
        });
      }
      return online;
    };

    // Marquer l'utilisateur courant + rafraîchir la vue
    const markOnline = async () => {
      window.__gcOnlineUsers.set(currentUser.id, Date.now());
      // Lire la présence serveur pour cross-machine accuracy
      let serverPresence = null;
      try { serverPresence = await dsGet('gc-presence', null); } catch (_) {}
      setOnlineUsers(computeOnline(serverPresence));
    };

    markOnline();
    const interval = setInterval(markOnline, 20000); // heartbeat toutes les 20s

    // FIX v142 — Souscrire aux changements SSE pour réactivité instantanée cross-machine
    const unsub = dsOnSync(async (key) => {
      if (key === 'gc-presence') {
        let serverPresence = null;
        try { serverPresence = await dsGet('gc-presence', null); } catch (_) {}
        // Sync vers localStorage pour cohérence
        if (serverPresence) {
          try { _lsSet('gc-presence', JSON.stringify(serverPresence)); } catch (_) {}
          if (!window.__gcOnlineUsers) window.__gcOnlineUsers = new Map();
          const now = Date.now();
          Object.entries(serverPresence).forEach(([uid, ts]) => {
            if (now - Number(ts) < 45000) window.__gcOnlineUsers.set(uid, Number(ts));
            else window.__gcOnlineUsers.delete(uid);
          });
        }
        setOnlineUsers(computeOnline(serverPresence));
      }
    });

    return () => {
      clearInterval(interval);
      if (typeof unsub === 'function') unsub();
    };
   
  }, [currentUser.id]);

  const isOnline = (uid) => onlineUsers.has(uid) || uid === currentUser.id;

  // Suspension par responsable processus niv4 (non-RH)
  const [showSuspendReqModal, setShowSuspendReqModal] = useState(null); // user obj
  const [suspReqMotif, setSuspReqMotif] = useState("");
  const [suspReqFile, setSuspReqFile] = useState(null);
  const isProcessHead = !isAdmin && currentUser.level === 4 &&
    !(currentUser.process === "S03" || (currentUser.processes||[]).includes("S03")); // niv4 non-RH
  const handleRequestSuspension = (targetUser) => {
    if (!suspReqMotif.trim()) { gcAlert("Le motif est obligatoire."); return; }
    const sameProcess = (targetUser.process === currentUser.process) ||
      (currentUser.processes||[]).some(p => [targetUser.process,...(targetUser.processes||[])].includes(p));
    if (!sameProcess) { gcAlert("Vous pouvez uniquement demander la suspension de collaborateurs de votre processus."); return; }
    const rhUser = (users||[]).find(u=>(u.process==="S03"||(u.processes||[]).includes("S03"))&&u.level>=4&&!u.isAdmin);
    const dgUser = (users||[]).find(u=>(u.isMG||u.id==="USR-MG-001"||u.level===5)&&!u.isAdmin);
    const targets = [rhUser?.id, dgUser?.id].filter(Boolean);
    const req = {
      id:"APPRO-PROC-SUSP-"+Date.now(),
      type:"PROCESS_SUSPENSION_REQUEST",
      targetUserId:targetUser.id,targetUserName:targetUser.name,targetUserRole:targetUser.role,targetUserProcess:targetUser.process,
      initiatedBy:currentUser.id,initiatedByName:currentUser.name,initiatedByRole:currentUser.role,initiatedByProcess:currentUser.process,
      initiatedAt:new Date().toISOString(),
      status:"EN_ATTENTE_RH",
      motif:suspReqMotif,
      attachment:suspReqFile,
      circuit:["RH","CONF","DG"],
    };
    if (setPendingApprovals) setPendingApprovals(prev=>[...prev,req]);
    if (targets.length) setNotifications(prev=>[{id:"N"+Date.now(),icon:"⏸️",message:`⏸️ Demande suspension (circuit) : ${targetUser.name} — Motif: ${suspReqMotif} — par ${currentUser.name}`,at:new Date().toISOString(),read:false,module:"gestion_comptes",targetUsers:targets},...prev]);
    setShowSuspendReqModal(null);setSuspReqMotif("");setSuspReqFile(null);
    gcAlert(`⏳ Demande soumise au circuit RH → Conformité → DG.`);
  };
  const [tab, setTab] = useState("internes");
  const [search, setSearch] = useState("");
  const [collabLevelFilter, setCollabLevelFilter] = useState("ALL");
  const [collabProcessFilter, setCollabProcessFilter] = useState("ALL");
  const [collabStatusFilter, setCollabStatusFilter] = useState("ALL");
  const [partnerTypeFilter, setPartnerTypeFilter] = useState("ALL");
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [partnerForm, setPartnerForm] = useState({ type:"client", nom:"", contact:"", tel:"", email:"", adresse:"", secteur:"", notes:"", process:"O02", site:"", dossiersIds:[], segment:"PME", riskLevel:"FAIBLE", kycStatut:"EN_ATTENTE", sourceAcquisition:"Réseau", statut:"PROSPECT" });
  const [floatingProfile, setFloatingProfile] = useState(null);
  const [composeTarget, setComposeTarget] = useState(null);
  const [taskTarget, setTaskTarget] = useState(null);
  const [demandeTarget, setDemandeTarget] = useState(null);
  const [quickMsgText, setQuickMsgText] = useState("");
  const [quickTaskForm, setQuickTaskForm] = useState({titre:"",desc:"",deadline:"",priority:"NORMALE"});
  const [quickDemandeForm, setQuickDemandeForm] = useState({objet:"",action:"TRAITER"});
  const localUser = currentUser; // alias

  const PARTNER_TYPES = [
    { key: "client",      label: "Portefeuille Clients",        icon: "🤝", color: "#3B82F6" },
    { key: "fournisseur", label: "Fournisseurs",                 icon: "📦", color: "#F59E0B" },
    { key: "regulateur",  label: "Partenaires Réglementaires",  icon: "⚖️",  color: "#A855F7" },
    { key: "etat",        label: "État & Institutions",          icon: "🏛️",  color: "#C9A84C" },
    { key: "partenaire",  label: "Autres Partenaires",           icon: "🌐", color: "#22C55E" },
  ];

  // FIX v143 — Normalisation via gcNormalizeUser (core/helpers.js) pour cohérence SI.
  // Garantit que process et processes[] sont toujours fusionnés correctement,
  // même pour les anciens comptes qui n'ont que process (sans processes[]).
  const normalizeProcs = (u) => {
    const normalized = gcNormalizeUser(u);
    return normalized?.processes || [normalized?.process].filter(Boolean);
  };
  const myProcesses = normalizeProcs(currentUser);
  const canSeeAll = true;
  const canManage = isAdmin || currentUser.level >= 4;
  const canAssign = isAdmin || currentUser.level >= 3;
  const sharesProcess = (u) => {
    const uProcs = normalizeProcs(u);
    return myProcesses.some(p => uProcs.includes(p));
  };

  const filteredCollabs = users.filter(u => {
    if(!_activeUser(u)) return false;
    if (u.id === "USR-ADM-000" || u.isAdmin) return false;
    const q = search.toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || (u.alias||"").toLowerCase().includes(q) || (u.process||"").toLowerCase().includes(q);
    const matchLevel = collabLevelFilter === "ALL" || String(u.level) === collabLevelFilter;
    const matchProc = collabProcessFilter === "ALL" || normalizeProcs(u).includes(collabProcessFilter);
    const matchStatus = collabStatusFilter === "ALL" || (u.accountStatus||"ACTIF") === collabStatusFilter;
    return matchSearch && matchLevel && matchProc && matchStatus;
  });

  const filteredPartners = (pt) => (partnersList||[]).filter(p => {
    if (partnerTypeFilter !== "ALL" && p.type !== partnerTypeFilter) return false;
    const q = search.toLowerCase();
    return (p.type === pt || partnerTypeFilter === pt) && (!q || p.nom.toLowerCase().includes(q) || (p.contact||"").toLowerCase().includes(q) || (p.secteur||"").toLowerCase().includes(q));
  });

  const myUserDossiers = (uid) => dossiers.filter(d => d.assignedTo === uid || d.createdBy === uid).slice(0,3);
  const partnerDossiers = (dossiersIds) => dossiers.filter(d => (dossiersIds||[]).includes(d.id));

  const handleAddPartner = () => {
    if (!partnerForm.nom) { gcAlert("Le nom est obligatoire."); return; }
    const now = new Date().toISOString();
    const pid = `${partnerForm.type.slice(0,3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const selectedDossierIds = partnerForm.dossiersIds || [];
    const newPartner = {
      id: pid, ...partnerForm,
      dossiersIds: selectedDossierIds, docsIds: [], rdvsIds: [], tachesIds: [],
      // Champs CRM complets — synchronisés avec GestionDocsUnifiee/CRM
      segment: partnerForm.segment || "PME",
      riskLevel: partnerForm.riskLevel || "FAIBLE",
      kycStatut: partnerForm.kycStatut || "EN_ATTENTE",
      statut: partnerForm.statut || (partnerForm.type === "client" ? "PROSPECT" : "ACTIF"),
      sourceAcquisition: partnerForm.sourceAcquisition || "Réseau",
      createdAt: now, createdBy: currentUser.id, createdByName: currentUser.name,
    };
    (setPartnersList||((f)=>{}))(prev => [...prev, newPartner]);
    if (selectedDossierIds.length > 0) {
      // FIX v135 — setDossiers guard
      typeof setDossiers === 'function' && setDossiers(prev => prev.map(d => selectedDossierIds.includes(d.id) ? {...d, partnerId:pid, partnerNom:partnerForm.nom, partnerType:partnerForm.type} : d));
    }
    // Sync KYC vers JuridiqueApp si c'est un client avec données KYC
    if ((partnerForm.type === "client" || partnerForm.type === "prospect") && (partnerForm.rccm || partnerForm.nif)) {
      try {
        const existing = JSON.parse(_lsGet("gc-jur-kyc") || "[]");
        const alreadyExists = existing.find(k => k.nom?.toLowerCase() === partnerForm.nom.toLowerCase());
        if (!alreadyExists) {
          const newKyc = {
            id: "KYC-" + Date.now(), nom: partnerForm.nom, type: "PERSONNE_MORALE",
            rccm: partnerForm.rccm || "", nif: partnerForm.nif || "",
            activite: partnerForm.secteur || "", adresse: partnerForm.adresse || "",
            responsable: partnerForm.contact || "", tel: partnerForm.tel || "", email: partnerForm.email || "",
            riskLevel: partnerForm.riskLevel || "FAIBLE", statut: "EN_ATTENTE",
            notes: partnerForm.notes || "", partnerId: pid,
            createdBy: currentUser.name, createdAt: now, docs: [],
          };
          _lsSet("gc-jur-kyc", JSON.stringify([newKyc, ...existing])); dsSave("gc-jur-kyc", [newKyc, ...existing]).catch(err => gcToast.syncError("gc-jur-kyc", err));
        }
      } catch(_) {}
    }
    // Notifier O01 (Administration) d'un nouveau collaborateur externe
    const o01Users = (users || []).filter(u => u.process === "O01" || (u.processes||[]).includes("O01"));
    o01Users.forEach(u => {
      if (u.id !== currentUser.id) {
        gcPushNotif(u.id, {
          id: "N"+Date.now()+u.id, icon: "🤝",
          message: `🤝 Nouveau collaborateur externe : ${partnerForm.nom} (${partnerForm.type}) — créé par ${currentUser.name}`,
          at: now, read: false, module: "crm",
        });
      }
    });
    setNotifications && setNotifications(p=>[{id:"N"+Date.now(),icon:"🤝",
      message:`Nouveau ${PARTNER_TYPES.find(pt=>pt.key===partnerForm.type)?.label||partnerForm.type} : ${partnerForm.nom}${selectedDossierIds.length>0?" — lié à "+selectedDossierIds.length+" dossier(s)":""}`,
      at:now,read:false,module:"crm"},...p]);
    setPartnerForm({ type:"client", nom:"", contact:"", tel:"", email:"", adresse:"", secteur:"", notes:"", process:"O02", site:"", dossiersIds:[], segment:"PME", riskLevel:"FAIBLE", kycStatut:"EN_ATTENTE", sourceAcquisition:"Réseau", statut:"PROSPECT" });
    setShowAddPartner(false);
    playSound("success");
  };

  const TABS = [
    { key: "internes", label: "👥 Collaborateurs", count: filteredCollabs.length },
    { key: "equipes", label: "🏢 Équipes / Processus", count: null },
    ...PARTNER_TYPES.map(pt => ({ key: pt.key, label: `${pt.icon} ${pt.label.split(" ")[0]}`, count: filteredPartners(pt.key).length, color: pt.color })),
  ];

  const sendQuickMsg = () => {
    if (!quickMsgText.trim() || !composeTarget) return;
    const now = new Date().toISOString();
    const saved = _lsGet("gc-messages-global");
    let msgs = []; try { msgs = saved ? JSON.parse(saved) : []; } catch (_) { msgs = []; } // FIX v127
    const newMsg = {id:"MSG-"+Date.now(),from:localUser.id,fromName:localUser.name,to:[composeTarget.id],subject:"Message rapide",body:quickMsgText.trim(),at:now,read:false,read_by:{[localUser.id]:now},type:"private"};
    msgs.unshift(newMsg);
    const trimmed = msgs.slice(0,500);
    try { _lsSet("gc-messages-global",JSON.stringify(trimmed)); dsSave("gc-messages-global",trimmed).catch(err => gcToast.syncError("gc-messages-global", err)); } catch (_) {}
    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"✉️",message:`✉️ Message de ${localUser.name} → ${composeTarget.name} : ${quickMsgText.slice(0,50)}`,at:now,read:false,module:"messagerie",targetUsers:[composeTarget.id]},...p]);
    playSound("message");
    setQuickMsgText("");
    setComposeTarget(null);
  };
  const sendQuickTask = () => {
    if (!quickTaskForm.titre.trim() || !taskTarget) return;
    const now = new Date().toISOString();
    const newT = {id:"T"+Date.now(),titre:quickTaskForm.titre.trim(),description:quickTaskForm.desc,assignedTo:taskTarget.id,assigneeName:taskTarget.name,creatorId:localUser.id,creatorName:localUser.name,status:"A_FAIRE",statut:"A_FAIRE",priority:quickTaskForm.priority,module:"gestion_comptes",type:"ASSIGNATION",deadline:quickTaskForm.deadline,createdAt:now,canCancel:true};
    setTaches&&setTaches(p=>[newT,...p]);
    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📋",message:`📋 Tâche assignée par ${localUser.name} → ${taskTarget.name} : "${quickTaskForm.titre.trim()}"`,at:now,read:false,module:"taches",targetUsers:[taskTarget.id]},...p]);
    playSound("task");
    setQuickTaskForm({titre:"",desc:"",deadline:"",priority:"NORMALE"});
    setTaskTarget(null);
  };
  const sendQuickDemande = () => {
    if (!quickDemandeForm.objet.trim() || !demandeTarget) return;
    const now = new Date().toISOString();
    const newT = {id:"T"+Date.now(),titre:`[DEMANDE] ${quickDemandeForm.objet.trim()}`,description:`Demande de ${localUser.name} → Action : ${quickDemandeForm.action}`,assignedTo:demandeTarget.id,assigneeName:demandeTarget.name,creatorId:localUser.id,creatorName:localUser.name,status:"A_FAIRE",statut:"A_FAIRE",priority:"NORMALE",module:"demandes",type:"DEMANDE",submitAction:quickDemandeForm.action,createdAt:now,canCancel:true};
    setTaches&&setTaches(p=>[newT,...p]);
    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📨",message:`📨 Demande de ${localUser.name} → ${demandeTarget.name} : [${quickDemandeForm.action}] "${quickDemandeForm.objet.trim()}"`,at:now,read:false,module:"demandes",targetUsers:[demandeTarget.id]},...p]);
    playSound("message");
    setQuickDemandeForm({objet:"",action:"TRAITER"});
    setDemandeTarget(null);
  };

  return (
    <div>
      {/* ── MODAL PROFIL FLOTTANT ── */}
      {floatingProfile && (
        <FloatModal title={`👤 Profil — ${floatingProfile.name}`} color="#A855F7" onClose={()=>setFloatingProfile(null)}>
          <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:16}}>
            <div style={{width:60,height:60,borderRadius:"50%",background:floatingProfile.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#fff",fontWeight:800,overflow:"hidden",flexShrink:0,border:"3px solid #A855F733"}}>
              {floatingProfile.photoUrl?<img src={floatingProfile.photoUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="" />:floatingProfile.avatar}
            </div>
            <div>
              <div style={{color:"#E8EDF5",fontWeight:900,fontSize:16}}>{floatingProfile.name}</div>
              <div style={{color:"#A855F7",fontSize:11,fontWeight:700}}>{floatingProfile.role}</div>
              <div style={{color:"#7A90B0",fontSize:9,fontFamily:"monospace",marginTop:2,background:"#A855F710",borderRadius:4,padding:"1px 6px",display:"inline-block"}}>🪪 {floatingProfile.id}</div>
              <div style={{display:"flex",gap:4,marginTop:4}}>
                <span style={{background:"#C41E3A22",color:"#C41E3A",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>Niv.{floatingProfile.level}</span>
                <span style={{background:"#A855F722",color:"#A855F7",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>{floatingProfile.process}</span>
                {(floatingProfile.processes||[]).filter(p=>p!==floatingProfile.process).map(p=>(
                  <span key={p} style={{background:"#3B82F622",color:"#3B82F6",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>{p}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {[
              {icon:"📧",label:"Email",value:floatingProfile.email},
              {icon:"📞",label:"Téléphone",value:floatingProfile.telephone||floatingProfile.phone},
              {icon:"📍",label:"Adresse",value:floatingProfile.adresse},
              {icon:"🌍",label:"Nationalité",value:floatingProfile.nationalite},
              {icon:"⚧",label:"Genre",value:floatingProfile.sexe==="M"?"Masculin":floatingProfile.sexe==="F"?"Féminin":null},
              {icon:"📅",label:"Entrée",value:floatingProfile.startDate},
            ].filter(f=>f.value).map(f=>(
              <div key={f.label} style={{background:"#1E3A5F33",borderRadius:8,padding:"7px 10px"}}>
                <div style={{color:"#7A90B0",fontSize:8,textTransform:"uppercase",fontWeight:700,marginBottom:2}}>{f.icon} {f.label}</div>
                <div style={{color:"#E8EDF5",fontSize:11,fontWeight:600}}>{f.value}</div>
              </div>
            ))}
          </div>
          {floatingProfile.bio && (
            <div style={{background:"#A855F710",border:"1px solid #A855F733",borderRadius:8,padding:"8px 10px",marginBottom:12}}>
              <div style={{color:"#A855F7",fontSize:9,fontWeight:700,marginBottom:3}}>📝 BIO</div>
              <div style={{color:"#C0D0E8",fontSize:11,lineHeight:1.5}}>{floatingProfile.bio}</div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[
              {icon:"📁",label:"Dossiers",value:dossiers.filter(d=>d.assignedTo===floatingProfile.id||d.createdBy===floatingProfile.id).length,c:"#3B82F6"},
              {icon:"📋",label:"Tâches actives",value:(taches||[]).filter(t=>t.assignedTo===floatingProfile.id&&t.statut!=="TERMINE").length,c:"#22C55E"},
              {icon:"🌴",label:"Congés",value:"-",c:"#F59E0B"},
            ].map(s=>(
              <div key={s.label} style={{background:s.c+"15",border:`1px solid ${s.c}33`,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                <div style={{color:s.c,fontWeight:900,fontSize:18}}>{s.value}</div>
                <div style={{color:"#7A90B0",fontSize:9}}>{s.icon} {s.label}</div>
              </div>
            ))}
          </div>
        </FloatModal>
      )}

      {/* ── MODAL ENVOYER MESSAGE ── */}
      {composeTarget && (
        <FloatModal title={`✉️ Message à ${composeTarget.name}`} color="#3B82F6" onClose={()=>{setComposeTarget(null);setQuickMsgText("");}}>
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12,background:"#3B82F615",borderRadius:8,padding:"8px 12px"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:composeTarget.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}}>{composeTarget.avatar}</div>
              <div>
                <div style={{color:"#E8EDF5",fontWeight:700,fontSize:12}}>{composeTarget.name}</div>
                <div style={{color:"#7A90B0",fontSize:10}}>{composeTarget.role}</div>
              </div>
            </div>
            <label style={{color:"#7A90B0",fontSize:10,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"}}>Message</label>
            <textarea value={quickMsgText} onChange={e=>setQuickMsgText(e.target.value)} rows={4} placeholder={`Écrivez votre message à ${composeTarget.name}…`} style={{width:"100%",background:"#1E3A5F",border:"1px solid #3B82F644",borderRadius:8,padding:"10px 12px",color:"#E8EDF5",fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}} />
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={sendQuickMsg} disabled={!quickMsgText.trim()} style={{flex:1,background:"linear-gradient(135deg,#3B82F6,#2563EB)",border:"none",color:"#fff",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontWeight:800,fontSize:12,opacity:quickMsgText.trim()?1:0.5}}>✉️ Envoyer</button>
            <button onClick={()=>{setComposeTarget(null);setQuickMsgText("");}} style={{background:"#1E3A5F",border:"1px solid #334",color:"#888",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12}}>Annuler</button>
          </div>
        </FloatModal>
      )}

      {/* ── MODAL ASSIGNER TÂCHE ── */}
      {taskTarget && (
        <FloatModal title={`📋 Assigner une tâche à ${taskTarget.name}`} color="#22C55E" onClose={()=>{setTaskTarget(null);setQuickTaskForm({titre:"",desc:"",deadline:"",priority:"NORMALE"});}}>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
            <div>
              <label style={{color:"#7A90B0",fontSize:10,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"}}>Titre de la tâche *</label>
              <input value={quickTaskForm.titre} onChange={e=>setQuickTaskForm(f=>({...f,titre:e.target.value}))} placeholder="Titre de la tâche…" style={{width:"100%",background:"#1E3A5F",border:"1px solid #22C55E44",borderRadius:7,padding:"8px 10px",color:"#E8EDF5",fontSize:12,boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:"#7A90B0",fontSize:10,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"}}>Description / Instructions</label>
              <textarea value={quickTaskForm.desc} onChange={e=>setQuickTaskForm(f=>({...f,desc:e.target.value}))} rows={3} placeholder="Instructions optionnelles…" style={{width:"100%",background:"#1E3A5F",border:"1px solid #22C55E44",borderRadius:7,padding:"8px 10px",color:"#E8EDF5",fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}} />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <label style={{color:"#7A90B0",fontSize:10,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"}}>Échéance</label>
                <input type="date" value={quickTaskForm.deadline} onChange={e=>setQuickTaskForm(f=>({...f,deadline:e.target.value}))} style={{width:"100%",background:"#1E3A5F",border:"1px solid #22C55E44",borderRadius:7,padding:"8px 10px",color:"#E8EDF5",fontSize:12,boxSizing:"border-box"}} />
              </div>
              <div>
                <label style={{color:"#7A90B0",fontSize:10,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"}}>Priorité</label>
                <select value={quickTaskForm.priority} onChange={e=>setQuickTaskForm(f=>({...f,priority:e.target.value}))} style={{width:"100%",background:"#1E3A5F",border:"1px solid #22C55E44",borderRadius:7,padding:"8px 10px",color:"#E8EDF5",fontSize:12}}>
                  <option value="BASSE">🟢 Basse</option>
                  <option value="NORMALE">🟡 Normale</option>
                  <option value="HAUTE">🔴 Haute</option>
                </select>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={sendQuickTask} disabled={!quickTaskForm.titre.trim()} style={{flex:1,background:"linear-gradient(135deg,#22C55E,#16A34A)",border:"none",color:"#fff",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontWeight:800,fontSize:12,opacity:quickTaskForm.titre.trim()?1:0.5}}>📋 Assigner</button>
            <button onClick={()=>{setTaskTarget(null);setQuickTaskForm({titre:"",desc:"",deadline:"",priority:"NORMALE"});}} style={{background:"#1E3A5F",border:"1px solid #334",color:"#888",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12}}>Annuler</button>
          </div>
        </FloatModal>
      )}

      {/* ── MODAL ENVOYER DEMANDE ── */}
      {demandeTarget && (
        <FloatModal title={`📨 Demande à ${demandeTarget.name}`} color="#F59E0B" onClose={()=>{setDemandeTarget(null);setQuickDemandeForm({objet:"",action:"TRAITER"});}}>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
            <div>
              <label style={{color:"#7A90B0",fontSize:10,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"}}>Objet de la demande *</label>
              <input value={quickDemandeForm.objet} onChange={e=>setQuickDemandeForm(f=>({...f,objet:e.target.value}))} placeholder="Objet de la demande…" style={{width:"100%",background:"#1E3A5F",border:"1px solid #F59E0B44",borderRadius:7,padding:"8px 10px",color:"#E8EDF5",fontSize:12,boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:"#7A90B0",fontSize:10,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"}}>Action requise</label>
              <select value={quickDemandeForm.action} onChange={e=>setQuickDemandeForm(f=>({...f,action:e.target.value}))} style={{width:"100%",background:"#1E3A5F",border:"1px solid #F59E0B44",borderRadius:7,padding:"8px 10px",color:"#E8EDF5",fontSize:12}}>
                {["TRAITER","VALIDER","APPROUVER","RÉVISER","POUR INFO","SIGNER","SOUMETTRE"].map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={sendQuickDemande} disabled={!quickDemandeForm.objet.trim()} style={{flex:1,background:"linear-gradient(135deg,#F59E0B,#D97706)",border:"none",color:"#fff",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontWeight:800,fontSize:12,opacity:quickDemandeForm.objet.trim()?1:0.5}}>📨 Envoyer</button>
            <button onClick={()=>{setDemandeTarget(null);setQuickDemandeForm({objet:"",action:"TRAITER"});}} style={{background:"#1E3A5F",border:"1px solid #334",color:"#888",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12}}>Annuler</button>
          </div>
        </FloatModal>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <h3 style={{ color:"#C41E3A", margin:0, fontSize:14, fontWeight:800 }}>🤝 Collaborateurs & Partenaires</h3>
        {(isAdmin || currentUser.level >= 3) && (
          <button onClick={() => setShowAddPartner(true)} style={{ background:"#C41E3A", border:"none", color:"#fff", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:11, fontWeight:700 }}>+ Ajouter</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, marginBottom:14, overflowX:"auto", paddingBottom:2 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch(""); setSelectedUser(null); setSelectedPartner(null); }}
            style={{ background:tab===t.key?(t.color||"#C41E3A"):(T.surface2), border:`1px solid ${tab===t.key?(t.color||"#C41E3A"):T.border}`, borderRadius:20, padding:"5px 12px", cursor:"pointer", fontSize:11, fontWeight:tab===t.key?800:400, color:tab===t.key?"#fff":T.textMuted, whiteSpace:"nowrap", flexShrink:0 }}>
            {t.label} <span style={{ background:tab===t.key?"rgba(255,255,255,0.25)":"transparent", borderRadius:10, padding:"1px 5px", fontSize:9 }}>{t.count}</span>
          </button>
        ))}
      </div>

      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{flex:"1 1 160px",minWidth:120}}><InputField label="" placeholder="🔍 Nom, rôle, processus…" value={search} onChange={e => setSearch(e.target.value)} T={T} style={{margin:0,marginBottom:0}} /></div>
        <select value={collabLevelFilter} onChange={e=>setCollabLevelFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",color:T.text,fontSize:11,cursor:"pointer",height:38}}>
          <option value="ALL">Tous niveaux</option>
          {[1,2,3,4,5,6].map(l=><option key={l} value={String(l)}>Niv. {l}</option>)}
        </select>
        <select value={collabProcessFilter} onChange={e=>setCollabProcessFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",color:T.text,fontSize:11,cursor:"pointer",height:38}}>
          <option value="ALL">Tous processus</option>
          {[...new Set(users.filter(u=>_activeUser(u)&&!u.isAdmin).flatMap(u=>normalizeProcs(u)).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <select value={collabStatusFilter} onChange={e=>setCollabStatusFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",color:T.text,fontSize:11,cursor:"pointer",height:38}}>
          <option value="ALL">Tous statuts</option>
          <option value="ACTIF">✅ Actif</option>
          <option value="SUSPENDU">⏸ Suspendu</option>
          <option value="INACTIF">⛔ Inactif</option>
        </select>
        <span style={{color:T.textDim,fontSize:10,whiteSpace:"nowrap"}}>{filteredCollabs.length} résultat(s)</span>
      </div>

      {/* ── COLLABORATEURS INTERNES ── */}
      {tab === "internes" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px,1fr))", gap:10, marginTop:10 }}>
          {filteredCollabs.map(u => {
            const uDoss = myUserDossiers(u.id);
            const sel = selectedUser?.id === u.id;
            return (
              <div key={u.id} onClick={() => setSelectedUser(sel ? null : u)}
                style={{ background:T.surface2, border:sel?`2px solid #C41E3A`:`1px solid ${T.border}`, borderRadius:12, padding:14, cursor:"pointer", transition:"all 0.2s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <div style={{ width:40,height:40,borderRadius:"50%",background:u.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",fontWeight:700,flexShrink:0,overflow:"hidden",border:"2px solid rgba(255,255,255,0.2)" }}>
                    {u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:T.text, fontWeight:700, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}</div>
                    <div style={{ color:T.textMuted, fontSize:10 }}>{u.role}</div>
                    {/* FIX v141 — Badges Niv. + processus + point présence sur la même ligne */}
                    <div style={{ display:"flex", gap:4, marginTop:2, alignItems:"center" }}>
                      <Badge label={`Niv.${u.level}`} color="#C41E3A" small />
                      <Badge label={u.process} color={getProcColor(u.process)} small />
                      {/* Point vert = en ligne, rouge = hors-ligne */}
                      <span
                        title={isOnline(u.id) ? "En ligne" : "Hors-ligne"}
                        style={{
                          display:"inline-block",
                          width:8, height:8,
                          borderRadius:"50%",
                          background: isOnline(u.id) ? "#22C55E" : "#EF4444",
                          boxShadow: isOnline(u.id) ? "0 0 4px #22C55E99" : "none",
                          flexShrink:0,
                          marginLeft:2,
                          border:`1.5px solid ${T.surface2}`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                {/* FIX v130 — contact bloc avec espacement uniforme */}
                {(u.email || u.telephone) && (
                  <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:3 }}>
                    {u.email && (
                      <div style={{ color:T.textDim, fontSize:10, display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ opacity:0.7 }}>📧</span>
                        <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.email}</span>
                      </div>
                    )}
                    {u.telephone && (
                      <div style={{ color:T.textDim, fontSize:10, display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ opacity:0.7 }}>📞</span>
                        <span>{u.telephone}</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Séparateur visuel + ID / alias */}
                <div style={{ marginTop:8, paddingTop:6, borderTop:`1px dashed ${T.border}`, display:"flex", flexDirection:"column", gap:3 }}>
                  <div style={{ color:T.textDim, fontSize:9, fontFamily:"monospace", background:T.surface3, borderRadius:4, padding:"2px 7px", display:"inline-block", alignSelf:"flex-start" }}>🪪 {u.id}</div>
                  {u.alias && (
                    <div style={{ color:T.textMuted, fontSize:10 }}>
                      <span style={{ color:T.textDim }}>@{u.alias}</span>
                      {u.dept && <span style={{ color:T.textMuted }}> · {u.dept}</span>}
                    </div>
                  )}
                </div>
                {sel && (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
                    {/* Aperçu travaux en temps réel */}
                    {uDoss.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ color:T.textDim, fontSize:10, fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>📁 Dossiers en cours</div>
                        {uDoss.map(d => (
                          <div key={d.id} onClick={e=>{e.stopPropagation();setSelectedDossier(d);}}
                            style={{ background:T.surface3, borderRadius:6, padding:"5px 8px", marginBottom:3, border:`1px solid ${T.border}`, cursor:"pointer", display:"flex", justifyContent:"space-between" }}>
                            <span style={{ color:T.text, fontSize:10, fontWeight:600 }}>{d.client}</span>
                            <Badge label={STATUS_CONFIG[d.status]?.label||d.status} color={STATUS_CONFIG[d.status]?.color||"#888"} small />
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {/* ✉️ Message interne — accessible à tous les niveaux */}
                      {u.id !== currentUser.id && (
                        <button onClick={e=>{e.stopPropagation();setComposeTarget(u);}} style={{ background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:6,padding:"4px 10px",color:"#3B82F6",cursor:"pointer",fontSize:10,fontWeight:700 }}>✉️ Message</button>
                      )}
                      {/* 📋 Assigner tâche : crée une tâche assignée à ce collaborateur */}
                      {(canAssign || sharesProcess(u)) && u.id !== currentUser.id && (
                        <button onClick={e=>{e.stopPropagation();setTaskTarget(u);}} style={{ background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:6,padding:"4px 10px",color:"#22C55E",cursor:"pointer",fontSize:10,fontWeight:700 }}>📋 Assigner tâche</button>
                      )}
                      {/* 📨 Envoyer demande : soumettre une action à ce collaborateur */}
                      {canAssign && u.id !== currentUser.id && (
                        <button onClick={e=>{e.stopPropagation();setDemandeTarget(u);}} style={{ background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:6,padding:"4px 10px",color:"#F59E0B",cursor:"pointer",fontSize:10,fontWeight:700 }}>📨 Envoyer demande</button>
                      )}
                      {/* 👁️ Profil complet — accessible à tous les niveaux */}
                      <button onClick={e=>{e.stopPropagation();setFloatingProfile(u);}} style={{ background:"#A855F722",border:"1px solid #A855F744",borderRadius:6,padding:"4px 10px",color:"#A855F7",cursor:"pointer",fontSize:10,fontWeight:700 }}>👁️ Profil</button>
                      {u.bio && <div style={{ color:T.textDim, fontSize:10, marginTop:4, fontStyle:"italic", lineHeight:1.4, width:"100%" }}>"{u.bio?.slice(0,80)}…"</div>}
                      {!sharesProcess(u) && u.id !== currentUser.id && (
                        <div style={{ color:T.textMuted, fontSize:9, marginTop:2 }}>⚠️ Hors de vos processus directs</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredCollabs.length === 0 && <div style={{ color:T.textMuted, textAlign:"center", padding:30, gridColumn:"1/-1" }}>Aucun collaborateur trouvé</div>}
        </div>
      )}

      {/* ── ÉQUIPES PAR PROCESSUS ── */}
      {tab === "equipes" && (() => {
        const allInternals = users.filter(u=>_activeUser(u)&&!u.isAdmin&&u.id!=="USR-ADM-000");
        const procGroups = {};
        allInternals.forEach(u => {
          const procs = normalizeProcs(u);
          procs.forEach(proc => {
            if(!proc) return;
            if(!procGroups[proc]) procGroups[proc] = [];
            procGroups[proc].push(u);
          });
        });
        const sortedProcs = Object.keys(procGroups).sort((a,b)=>{
          const order = (x) => x.startsWith("P")?0:x.startsWith("O")?1:2;
          return order(a)-order(b) || a.localeCompare(b);
        });
        return (
          <div>
            <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"}}>
              {[{label:"Pilotage",c:"#3B82F6",pfx:"P"},{label:"Opérationnel",c:"#22C55E",pfx:"O"},{label:"Support",c:"#FF7900",pfx:"S"}].map(g=>{
                const count = Object.keys(procGroups).filter(k=>k.startsWith(g.pfx)).reduce((a,k)=>{const ids=new Set(procGroups[k].map(u=>u.id));return a+ids.size;},0);
                return <div key={g.pfx} style={{background:g.c+"15",border:`1px solid ${g.c}44`,borderRadius:8,padding:"6px 14px",fontSize:11,color:g.c,fontWeight:800}}>{g.label} · {count} pers.</div>;
              })}
              <div style={{color:T.textDim,fontSize:10,alignSelf:"center",marginLeft:"auto"}}>{sortedProcs.length} processus · {allInternals.length} collaborateurs</div>
            </div>
            {sortedProcs.map(proc=>{
              const members = procGroups[proc];
              const color = getProcColor(proc);
              const procLabel = CODES.processes[proc] || proc;
              const group = proc.startsWith("P")?"PILOTAGE":proc.startsWith("O")?"OPÉRATIONNEL":"SUPPORT";
              return (
                <div key={proc} style={{background:T.surface2,border:`2px solid ${color}33`,borderRadius:12,padding:"12px 14px",marginBottom:8,transition:"border-color 0.2s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=color+"66"} onMouseLeave={e=>e.currentTarget.style.borderColor=color+"33"}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{background:color+"22",color,border:`1px solid ${color}55`,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:900,fontFamily:"monospace"}}>{proc}</span>
                    <span style={{color:T.text,fontWeight:700,fontSize:12,flex:1}}>{procLabel}</span>
                    <span style={{background:color+"15",color,borderRadius:6,padding:"1px 8px",fontSize:9,fontWeight:700}}>{group}</span>
                    <span style={{color:T.textDim,fontSize:10}}>· {members.length} membre(s)</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {members.map(u=>(
                      <div key={u.id} onClick={()=>{setSelectedUser(u);setTab("internes");}}
                        style={{display:"flex",alignItems:"center",gap:6,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:9,padding:"6px 10px",cursor:"pointer",transition:"all 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=color;e.currentTarget.style.background=color+"12";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surface3;}}>
                        <div style={{width:26,height:26,borderRadius:"50%",background:u.color||color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:800,flexShrink:0,overflow:"hidden",border:`2px solid ${color}44`}}>
                          {u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar||u.name?.charAt(0)}
                        </div>
                        <div>
                          <div style={{color:T.text,fontSize:10,fontWeight:700,lineHeight:1.1,display:"flex",alignItems:"center",gap:4}}>
                            {u.name}
                            {/* FIX v141 — point présence dans la vue équipes */}
                            <span title={isOnline(u.id)?"En ligne":"Hors-ligne"} style={{width:6,height:6,borderRadius:"50%",background:isOnline(u.id)?"#22C55E":"#EF4444",display:"inline-block",flexShrink:0}} />
                          </div>
                          <div style={{color:T.textDim,fontSize:8}}>Niv.{u.level} · {u.role?.slice(0,20)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {sortedProcs.length === 0 && <div style={{color:T.textMuted,textAlign:"center",padding:30}}>Aucun collaborateur dans les processus</div>}
          </div>
        );
      })()}

      {/* ── PARTENAIRES EXTERNES ── */}
      {tab !== "internes" && tab !== "equipes" && (() => {
        const pt = PARTNER_TYPES.find(p=>p.key===tab);
        const list = filteredPartners(tab);
        return (
          <div style={{ marginTop:10 }}>
            <div style={{ background:pt.color+"11", border:`1px solid ${pt.color}33`, borderRadius:10, padding:"8px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:20 }}>{pt.icon}</span>
              <div>
                <div style={{ color:pt.color, fontWeight:800, fontSize:12 }}>{pt.label}</div>
                <div style={{ color:T.textDim, fontSize:10 }}>{list.length} enregistrement(s)</div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))", gap:10 }}>
              {list.map(p => {
                const sel = selectedPartner?.id === p.id;
                const pDoss = partnerDossiers(p.dossiersIds);
                return (
                  <div key={p.id} onClick={() => setSelectedPartner(sel?null:p)}
                    style={{ background:T.surface2, border:sel?`2px solid ${pt.color}`:`1px solid ${T.border}`, borderRadius:12, padding:14, cursor:"pointer", transition:"all 0.2s" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:8 }}>
                      <div style={{ width:40,height:40,borderRadius:10,background:pt.color+"22",border:`1px solid ${pt.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>{pt.icon}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{p.nom}</div>
                        {p.contact && <div style={{ color:T.textMuted, fontSize:10 }}>👤 {p.contact}</div>}
                        <Badge label={p.secteur||p.type} color={pt.color} small />
                      </div>
                    </div>
                    {p.tel && <div style={{ color:T.textDim, fontSize:10 }}>📞 {p.tel}</div>}
                    {p.email && <div style={{ color:T.textDim, fontSize:10 }}>📧 {p.email}</div>}
                    {p.adresse && <div style={{ color:T.textDim, fontSize:10 }}>📍 {p.adresse}</div>}
                    {p.notes && <div style={{ color:T.textDim, fontSize:10, marginTop:4, fontStyle:"italic" }}>{p.notes}</div>}
                    {sel && (
                      <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
                        {pDoss.length > 0 && (
                          <div style={{ marginBottom:8 }}>
                            <div style={{ color:T.textDim, fontSize:10, fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>📁 Dossiers affiliés</div>
                            {pDoss.map(d => (
                              <div key={d.id} onClick={e=>{e.stopPropagation();setSelectedDossier(d);}}
                                style={{ background:T.surface3, borderRadius:6, padding:"5px 8px", marginBottom:3, border:`1px solid ${T.border}`, cursor:"pointer", display:"flex", justifyContent:"space-between" }}>
                                <span style={{ color:T.text, fontSize:10, fontWeight:600 }}>{d.client} — {d.objet?.slice(0,30)}</span>
                                <Badge label={STATUS_CONFIG[d.status]?.label||d.status} color={STATUS_CONFIG[d.status]?.color||"#888"} small />
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          <button onClick={e=>{e.stopPropagation();setShowMessaging && setShowMessaging(true);}} style={{ background:pt.color+"22",border:`1px solid ${pt.color}44`,borderRadius:6,padding:"4px 10px",color:pt.color,cursor:"pointer",fontSize:10,fontWeight:700 }}>✉️ Contacter</button>
                          {currentUser.level >= 3 && <button onClick={e=>{e.stopPropagation();setShowNewDossier && setShowNewDossier(true);}} style={{ background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:6,padding:"4px 10px",color:"#3B82F6",cursor:"pointer",fontSize:10,fontWeight:700 }}>📁 Créer dossier</button>}
                          {isProcessHead && (p.process===currentUser.process||(currentUser.processes||[]).some(pr=>[p.process,...(p.processes||[])].includes(pr))) && (p.accountStatus||"ACTIF")==="ACTIF" && p.id!==currentUser.id && (
                            <button onClick={e=>{e.stopPropagation();setSuspReqMotif("");setSuspReqFile(null);setShowSuspendReqModal(p);}} style={{ background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:6,padding:"4px 10px",color:"#F59E0B",cursor:"pointer",fontSize:10,fontWeight:700 }}>⏸️ Demander suspension</button>
                          )}
                          {currentUser.level >= 4 && (
                            <button onClick={async e => {e.stopPropagation();
                              const nom = await gcPrompt("Nom du partenaire :",p.nom)||p.nom;
                              const contact = await gcPrompt("Contact :",p.contact||"")||p.contact;
                              const tel = await gcPrompt("Téléphone :",p.tel||"")||p.tel;
                              const email = await gcPrompt("Email :",p.email||"")||p.email;
                              const notes = await gcPrompt("Notes :",p.notes||"")||p.notes;
                              const dossierId = await gcPrompt("Associer dossier (ref) :",p.dossiersIds?p.dossiersIds[0]:"");
                              const updP={...p,nom,contact,tel,email,notes};
                              if(dossierId)updP.dossiersIds=[...new Set([...(p.dossiersIds||[]),dossierId])];
                              if(setPartnersList)(setPartnersList)(prev=>prev.map(x=>x.id===p.id?updP:x));
                              setNotifications(prev=>[{id:"N"+Date.now(),icon:"✏️",message:`Partenaire ${nom} modifié par ${currentUser.name}`,at:new Date().toISOString(),read:false},...prev]);
                              gcAlert("✅ Informations mises à jour.");
                            }}
                            style={{ background:"#A855F722",border:"1px solid #A855F744",borderRadius:6,padding:"4px 10px",color:"#A855F7",cursor:"pointer",fontSize:10,fontWeight:700 }}>✏️ Modifier</button>
                          )}
                          {(isAdmin||currentUser.level>=4) && <button onClick={async e => {e.stopPropagation();if(await gcConfirm(`Supprimer ${p.nom} ?`))(setPartnersList||((f)=>{}))(prev=>prev.filter(x=>x.id!==p.id));}} style={{ background:"#EF444415",border:"1px solid #EF444444",borderRadius:6,padding:"4px 10px",color:"#EF4444",cursor:"pointer",fontSize:10,fontWeight:700 }}>🗑️</button>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {list.length === 0 && <div style={{ color:T.textMuted, textAlign:"center", padding:30, gridColumn:"1/-1" }}>Aucun {pt.label.toLowerCase()} enregistré</div>}
            </div>
          </div>
        );
      })()}

      {/* Modal ajout collaborateur/partenaire */}
      {showAddPartner && (
        <Modal title="➕ Ajouter un collaborateur / contact" onClose={() => setShowAddPartner(false)} T={T} wide>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {/* Type selector */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:4 }}>
              {[
                {value:"INTERNE_VIA_ADMIN",label:"👤 Interne",desc:"Via Admin bypass",color:"#C41E3A"},
                {value:"client",label:"🤝 Client",desc:"Portefeuille client",color:"#3B82F6"},
                {value:"fournisseur",label:"📦 Fournisseur",desc:"Prestataire",color:"#F59E0B"},
                {value:"regulateur",label:"⚖️ Réglementaire",desc:"Organisme de contrôle",color:"#A855F7"},
                {value:"etat",label:"🏛️ État / Inst.",desc:"Institution publique",color:"#C9A84C"},
                {value:"partenaire",label:"🌐 Partenaire",desc:"Autre partenaire ext.",color:"#22C55E"},
              ].map(opt => (
                <button key={opt.value} onClick={()=>setPartnerForm(f=>({...f,type:opt.value}))}
                  style={{background:partnerForm.type===opt.value?opt.color+"22":T.surface2, border:`2px solid ${partnerForm.type===opt.value?opt.color:T.border}`, borderRadius:8, padding:"8px 10px", cursor:"pointer", textAlign:"left", transition:"all 0.15s"}}>
                  <div style={{fontSize:16,marginBottom:2}}>{opt.label.split(" ")[0]}</div>
                  <div style={{color:partnerForm.type===opt.value?opt.color:T.text, fontSize:10, fontWeight:700}}>{opt.label.slice(opt.label.indexOf(" ")+1)}</div>
                  <div style={{color:T.textDim, fontSize:9}}>{opt.desc}</div>
                </button>
              ))}
            </div>

            {/* If internal: redirect to admin bypass */}
            {partnerForm.type === "INTERNE_VIA_ADMIN" ? (
              <div style={{ background:"#C41E3A15", border:"2px solid #C41E3A44", borderRadius:12, padding:"20px", textAlign:"center" }}>
                <div style={{fontSize:32,marginBottom:8}}>⚡</div>
                <div style={{color:"#C41E3A",fontWeight:900,fontSize:14,marginBottom:6}}>Création de compte interne</div>
                <div style={{color:T.textMuted,fontSize:12,marginBottom:14,lineHeight:1.6}}>
                  La création d'un collaborateur interne passe par le formulaire officiel de création de compte.<br/>
                  {isAdmin ? "En tant qu'Admin, vous pouvez créer le compte immédiatement avec le mode Bypass ⚡." : "La demande sera soumise au circuit d'approbation (RH → DG)."}
                </div>
                <button onClick={()=>{ setShowAddPartner(false); setAMod&&setAMod("gestion_comptes"); try{_lsSet("gc-admin-redirect",JSON.stringify({tab:"creer_compte",bypass:isAdmin,at:new Date().toISOString()}));}catch (_) {} }}
                  style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:8,padding:"10px 24px",cursor:"pointer",fontWeight:800,fontSize:13}}>
                  ⚡ Ouvrir le formulaire de création de compte
                </button>
              </div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <InputField label="Nom / Raison sociale *" value={partnerForm.nom} onChange={e=>setPartnerForm(f=>({...f,nom:e.target.value}))} T={T} />
                  <InputField label="Contact principal" value={partnerForm.contact} onChange={e=>setPartnerForm(f=>({...f,contact:e.target.value}))} T={T} />
                  <InputField label="Secteur / Spécialité" value={partnerForm.secteur} onChange={e=>setPartnerForm(f=>({...f,secteur:e.target.value}))} T={T} />
                  <InputField label="Téléphone" value={partnerForm.tel} onChange={e=>setPartnerForm(f=>({...f,tel:e.target.value}))} T={T} />
                  <InputField label="Email" type="email" value={partnerForm.email} onChange={e=>setPartnerForm(f=>({...f,email:e.target.value.toLowerCase()}))} T={T} />
                  <InputField label="Site web" value={partnerForm.site||""} onChange={e=>setPartnerForm(f=>({...f,site:e.target.value}))} T={T} />
                  <SelectField label="Processus lié" value={partnerForm.process} onChange={e=>setPartnerForm(f=>({...f,process:e.target.value}))}
                    options={Object.entries(CODES.processes).map(([k,v])=>({value:k,label:`${k} – ${v}`}))} T={T} />
                  {/* Champs CRM — synchronisés avec GestionDocsUnifiee/CRM O01 */}
                  <SelectField label="Statut CRM" value={partnerForm.statut||"PROSPECT"} onChange={e=>setPartnerForm(f=>({...f,statut:e.target.value}))}
                    options={["PROSPECT","ACTIF","INACTIF","VIP","SUSPENDU","ARCHIVE"].map(s=>({value:s,label:s}))} T={T} />
                  <SelectField label="Segment" value={partnerForm.segment||"PME"} onChange={e=>setPartnerForm(f=>({...f,segment:e.target.value}))}
                    options={["TPE","PME","Grande Entreprise","Multinationale","Association/ONG","Particulier","Institution Publique","Startup","Autre"].map(s=>({value:s,label:s}))} T={T} />
                  <SelectField label="Niveau risque KYC" value={partnerForm.riskLevel||"FAIBLE"} onChange={e=>setPartnerForm(f=>({...f,riskLevel:e.target.value}))}
                    options={[{value:"FAIBLE",label:"🟢 Faible"},{value:"MOYEN",label:"🟡 Moyen"},{value:"ÉLEVÉ",label:"🟠 Élevé"},{value:"CRITIQUE",label:"🔴 Critique"}]} T={T} />
                  <SelectField label="Statut KYC" value={partnerForm.kycStatut||"EN_ATTENTE"} onChange={e=>setPartnerForm(f=>({...f,kycStatut:e.target.value}))}
                    options={[{value:"EN_ATTENTE",label:"⏳ En attente"},{value:"EN_COURS",label:"🔄 En cours"},{value:"VALIDE",label:"✅ Validé"},{value:"REJETE",label:"❌ Rejeté"}]} T={T} />
                </div>
                <InputField label="Adresse" value={partnerForm.adresse} onChange={e=>setPartnerForm(f=>({...f,adresse:e.target.value}))} T={T} />

                {/* Associate existing dossier */}
                <div>
                  <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>📁 Dossier(s) associé(s) (optionnel)</label>
                  <select multiple onChange={e=>setPartnerForm(f=>({...f,dossiersIds:Array.from(e.target.selectedOptions).map(o=>o.value)}))}
                    style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px",color:T.text,fontSize:11,height:80}}>
                    {dossiers.filter(d=>d.nature==="EXTERNE").map(d=><option key={d.id} value={d.id}>{d.ref} — {d.client}</option>)}
                  </select>
                  <div style={{color:T.textDim,fontSize:9,marginTop:2}}>Ctrl+Clic pour sélectionner plusieurs dossiers</div>
                </div>

                <InputField label="Notes internes" value={partnerForm.notes} onChange={e=>setPartnerForm(f=>({...f,notes:e.target.value}))} T={T} />
                <div style={{background:"#F9731615",border:"1px solid #F9731633",borderRadius:6,padding:"5px 10px",fontSize:9,color:"#F97316"}}>
                  ℹ️ Ce contact sera visible dans : Collaborateurs · CRM O01 · GestionDocs · Finance (champ Tiers) · Dossiers
                </div>
                <div style={{ display:"flex", gap:8, marginTop:6 }}>
                  <Btn variant="primary" onClick={handleAddPartner}>✅ Enregistrer</Btn>
                  <Btn variant="ghost" onClick={() => setShowAddPartner(false)}>Annuler</Btn>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};


