import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// DemandesModule.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, playSound, formatDate, _activeUser, formatDateTime, dsSave, dsOnSync, gcPushNotif, gcFileSave, gcViewDoc } from '../../core/index.js';
import { gcToast } from '../../components/ToastManager.jsx';
import { CODES, gcDownloadDoc } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';

export function DemandesModule({ currentUser, users=[], dossiers=[], T, setNotifications=_noop, isDemoMode=false }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const lvl = currentUser.level;
  const isManager = lvl >= 3;
  const isAdmin = currentUser.isAdmin || lvl >= 6;

  const loadDemandes = () => { try { return JSON.parse(_lsGet("gc-demandes")||"[]"); } catch (_) { return []; }};
  const saveDemandes = (v) => {
    if(!isDemoMode) {
      try { _lsSet("gc-demandes", JSON.stringify(v)); dsSave("gc-demandes", v).catch(err => gcToast.syncError("gc-demandes", err)); } catch (_) {}
    }
  };

  const [demandes, setDemandesRaw] = useState(loadDemandes);
  const setDemandes = (v) => {
    const resolved = typeof v === "function" ? v(demandes) : v;
    setDemandesRaw(resolved);
    saveDemandes(resolved);
  };

  // FIX vDEM-SYNC — Écouter les changements temps réel depuis les autres postes
  useEffect(() => {
    const unsub = dsOnSync((event) => {
      if (event.key !== 'gc-demandes') return;
      try {
        const fresh = JSON.parse(_lsGet("gc-demandes") || "[]");
        setDemandesRaw(fresh);
      } catch (_) {}
    });
    return unsub;
   
  }, []);

  const [tab, setTab] = useState(isManager ? "recues" : "soumettre");
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [demSearch, setDemSearch] = useState("");
  const [demTypeFilter, setDemTypeFilter] = useState("ALL");
  const [demSort, setDemSort] = useState("date_desc");
  // FIX v152 — pendingFiles : vrais objets File en attente d'upload au moment de la soumission
  const [pendingFiles, setPendingFiles] = useState([]);
  const [form, setForm] = useState({
    type: "DOSSIER", titre: "", description: "",
    targetProcess: currentUser.process || "O01",
    targetUserId: "", priority: "NORMALE",
    attachmentNote: "",
    attachmentDossierId: "", // from dossiers module
    attachmentUpload: null,   // uploaded file name (affiché à l'utilisateur)
  });
  const [replyText, setReplyText] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const DEMANDE_TYPES = {
    DOSSIER:         { icon:"📁", label:"Nouveau dossier client",          color:"#3B82F6" },
    DOCUMENT:        { icon:"📄", label:"Demande de document",             color:"#06B6D4" },
    SUPPORT:         { icon:"🛠️", label:"Support / Assistance technique",  color:"#F59E0B" },
    ACCES_APP:       { icon:"🔓", label:"Demande d'accès application",     color:"#A855F7" },
    CONGE:           { icon:"🌴", label:"Demande de congé",                color:"#22C55E" },
    MATERIEL:        { icon:"📦", label:"Demande matériel/fournitures",    color:"#F97316" },
    INFORMATION:     { icon:"❓", label:"Demande d'information",           color:"#8B5CF6" },
    SIGNATURE:       { icon:"✍️", label:"Demande de signature",            color:"#EC4899" },
    VALIDATION:      { icon:"✅", label:"Demande de validation",           color:"#10B981" },
    APPROBATION:     { icon:"☑️", label:"Demande d'approbation",          color:"#0EA5E9" },
    RECRUTEMENT:     { icon:"🎯", label:"Demande de recrutement",          color:"#C41E3A" },
    MISSION:         { icon:"🚀", label:"Ordre de mission",               color:"#6366F1" },
    FORMATION:       { icon:"🎓", label:"Demande de formation",           color:"#14B8A6" },
    TRANSFERT:       { icon:"🔄", label:"Demande de transfert de dossier", color:"#78716C" },
    AUTRE:           { icon:"📨", label:"Autre demande",                   color:"#7A90B0" },
  };
  const STATUT_CFG = {
    EN_ATTENTE: { c:"#F59E0B", l:"En attente",   icon:"⏳" },
    EN_COURS:   { c:"#3B82F6", l:"En cours",      icon:"🔄" },
    TRAITE:     { c:"#22C55E", l:"Traité",         icon:"✅" },
    REJETE:     { c:"#EF4444", l:"Rejeté",         icon:"❌" },
    INFO_REQUISE:{ c:"#A855F7",l:"Info requise",   icon:"💬" },
  };
  const PRIORITY_CFG = {
    BASSE:  { c:"#7A90B0", l:"Basse" },
    NORMALE:{ c:"#3B82F6", l:"Normale" },
    HAUTE:  { c:"#F59E0B", l:"Haute" },
    URGENT: { c:"#EF4444", l:"Urgent" },
  };

  const processManagers = users.filter(u => _activeUser(u)&&u.level >= 4 && !u.isAdmin);
  const getProcessManager = (procCode) => {
    const mgr = users.find(u => {
      const procs = u.processes || [u.process];
      return procs.includes(procCode) && u.level >= 4;
    });
    return mgr || users.find(u => u.level >= 5 && !u.isAdmin) || null;
  };

  const myProcs = currentUser.processes || [currentUser.process];
  const visibleDemandes = demandes.filter(d => {
    if (isAdmin) return true;
    if (lvl >= 5) return true;
    if (lvl >= 3) return (
      myProcs.includes(d.targetProcess) ||
      d.targetUserId === currentUser.id ||
      d.submittedBy === currentUser.id
    );
    return d.submittedBy === currentUser.id;
  });

  const filteredDemandes = visibleDemandes.filter(d => {
    const q = demSearch.toLowerCase();
    const matchSearch = !q || (d.titre||d.objet||"").toLowerCase().includes(q) || (d.submittedByName||"").toLowerCase().includes(q) || (d.type||"").toLowerCase().includes(q) || (d.targetProcess||"").toLowerCase().includes(q) || (d.targetUserName||"").toLowerCase().includes(q);
    const matchStatus = filterStatus==="ALL" || d.status===filterStatus;
    const matchType = demTypeFilter==="ALL" || (d.type||"")===demTypeFilter;
    return matchSearch && matchStatus && matchType;
  }).sort((a,b)=>{
    if(demSort==="date_asc") return (a.createdAt||"").localeCompare(b.createdAt||"");
    if(demSort==="objet") return (a.objet||"").localeCompare(b.objet||"");
    return (b.createdAt||"").localeCompare(a.createdAt||"");
  });

  const myPending = visibleDemandes.filter(d =>
    d.status === "EN_ATTENTE" &&
    (lvl >= 3 ? (myProcs.includes(d.targetProcess) || d.targetUserId === currentUser.id) : d.submittedBy === currentUser.id)
  ).length;

  // FIX v152 — handleSubmit async : upload réel des fichiers via gcFileSave
  const handleSubmit = async () => {
    if (!form.titre.trim()) { gcAlert("Veuillez saisir un titre pour la demande."); return; }
    const manager = form.targetUserId
      ? users.find(u => u.id === form.targetUserId)
      : getProcessManager(form.targetProcess);
    const now = new Date().toISOString();

    // Upload des fichiers joints (si présents) — stockage serveur ou IDB offline
    let attachmentRefs = [];
    if (pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        try {
          const ref = await gcFileSave(file, {
            module: 'demandes',
            uploadedBy: currentUser.id,
            uploadedByName: currentUser.name,
            nom: file.name,
            taille: file.size,
            type: file.type,
          });
          if (ref) attachmentRefs.push(ref);
        } catch (_) {}
      }
    }

    const newD = {
      id: "DEM-" + Date.now(),
      type: form.type,
      titre: form.titre,
      description: form.description,
      priority: form.priority,
      targetProcess: form.targetProcess,
      targetUserId: manager?.id || null,
      targetUserName: manager?.name || "Responsable processus",
      submittedBy: currentUser.id,
      submittedByName: currentUser.name,
      submittedByRole: currentUser.role,
      submittedByLevel: currentUser.level,
      submittedAt: now,
      status: "EN_ATTENTE",
      attachmentNote: form.attachmentNote,
      attachmentDossierId: form.attachmentDossierId || null,
      // FIX v152 — stocker les refs complètes (serverUrl, serverId, nom…) au lieu du nom seul
      attachmentUpload: attachmentRefs.length > 0 ? null : form.attachmentUpload,
      attachmentRefs: attachmentRefs.length > 0 ? attachmentRefs : undefined,
      replies: [],
      lastUpdated: now,
    };
    setDemandes(prev => [newD, ...prev]);
    setNotifications(prev => [{
      id: "N"+Date.now(), icon: DEMANDE_TYPES[form.type]?.icon || "📨",
      message: `📨 Nouvelle demande de ${currentUser.name} [${DEMANDE_TYPES[form.type]?.label}] : "${form.titre}" → ${manager?.name || "Responsable"}`,
      at: now, read: false, module: "demandes",
      targetUserId: manager?.id,
    }, ...prev]);
    // FIX vDEM-NOTIF — Notifier le manager destinataire via gcPushNotif (cross-machine)
    if (manager?.id && manager.id !== currentUser.id) {
      gcPushNotif(manager.id, {
        id: "N"+Date.now()+manager.id, icon: DEMANDE_TYPES[form.type]?.icon || "📨",
        message: `📨 Demande de ${currentUser.name} [${DEMANDE_TYPES[form.type]?.label}] : "${form.titre}"`,
        at: now, read: false, module: "demandes",
      });
    }
    playSound("success");
    setShowForm(false);
    setTab("mes_demandes");
    setPendingFiles([]);
    setForm({ type:"DOSSIER", titre:"", description:"", targetProcess: currentUser.process || "O01", targetUserId:"", priority:"NORMALE", attachmentNote:"", attachmentDossierId:"", attachmentUpload:null });
    gcAlert(`✅ Demande "${newD.titre}" envoyée à ${manager?.name || "Responsable " + form.targetProcess}.`);
  };

  const handleStatusChange = (demId, newStatus) => {
    setDemandes(prev => prev.map(d => d.id === demId ? { ...d, status: newStatus, lastUpdated: new Date().toISOString(), handledBy: currentUser.id, handledByName: currentUser.name } : d));
    const dem = demandes.find(d => d.id === demId);
    if (dem) {
      const notifMsg = `${STATUT_CFG[newStatus]?.icon} Votre demande "${dem.titre}" a été ${STATUT_CFG[newStatus]?.l.toLowerCase()} par ${currentUser.name}`;
      setNotifications(prev => [{
        id: "N"+Date.now(), icon: STATUT_CFG[newStatus]?.icon || "🔔",
        message: notifMsg,
        at: new Date().toISOString(), read: false, module: "demandes",
        targetUserId: dem.submittedBy,
      }, ...prev]);
      // FIX vDEM-NOTIF — Notifier l'émetteur sur son poste
      if (dem.submittedBy && dem.submittedBy !== currentUser.id) {
        gcPushNotif(dem.submittedBy, {
          id: "N"+Date.now()+dem.submittedBy, icon: STATUT_CFG[newStatus]?.icon || "🔔",
          message: notifMsg,
          at: new Date().toISOString(), read: false, module: "demandes",
        });
      }
    }
    playSound("success");
  };

  const handleReply = (demId) => {
    const txt = (replyText[demId] || "").trim();
    if (!txt) return;
    const now = new Date().toISOString();
    setDemandes(prev => prev.map(d => d.id === demId ? {
      ...d, status: "EN_COURS",
      replies: [...(d.replies||[]), { from: currentUser.id, fromName: currentUser.name, text: txt, at: now }],
      lastUpdated: now,
    } : d));
    const dem = demandes.find(d => d.id === demId);
    if (dem) {
      const targetId = dem.submittedBy !== currentUser.id ? dem.submittedBy : dem.targetUserId;
      const notifMsg = `💬 Réponse de ${currentUser.name} sur votre demande "${dem.titre}" : ${txt.slice(0,80)}…`;
      setNotifications(prev => [{
        id: "N"+Date.now(), icon: "💬",
        message: notifMsg,
        at: now, read: false, module: "demandes",
        targetUserId: targetId,
      }, ...prev]);
      // FIX vDEM-NOTIF — Notifier le destinataire de la réponse sur son poste
      if (targetId && targetId !== currentUser.id) {
        gcPushNotif(targetId, {
          id: "N"+Date.now()+targetId, icon: "💬",
          message: notifMsg,
          at: now, read: false, module: "demandes",
        });
      }
    }
    setReplyText(prev => ({ ...prev, [demId]: "" }));
    playSound("message");
  };

  const TABS_DEF = [
    { id: "soumettre", l: "📨 Soumettre", show: true },
    { id: "mes_demandes", l: "📋 Mes envois", show: true, count: demandes.filter(d=>d.submittedBy===currentUser.id&&d.status==="EN_ATTENTE").length },
    { id: "recues", l: `📥 Reçues${myPending>0?" ("+myPending+")":""}`, show: isManager },
    { id: "toutes", l: "📊 Toutes", show: isAdmin || lvl >= 5 },
  ].filter(t => t.show);

  return (
    <div className="gc-fade-in">
      {/* En-tête */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 4px 14px rgba(59,130,246,0.4)"}}>📨</div>
        <div style={{flex:1}}>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>Mes Demandes — Portail Collaborateur</div>
          <div style={{color:T.textMuted,fontSize:11}}>Soumettez vos demandes · Suivez leur traitement · Interagissez avec votre responsable</div>
        </div>
        {myPending > 0 && isManager && (
          <div style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:8,padding:"6px 12px",color:"#F59E0B",fontWeight:700,fontSize:11}}>
            ⏳ {myPending} en attente
          </div>
        )}
        <button onClick={()=>{setTab("soumettre");setShowForm(true);}} style={{background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",border:"none",color:"#fff",borderRadius:8,padding:"9px 16px",cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6,boxShadow:"0 4px 14px rgba(59,130,246,0.3)"}}>
          ➕ Nouvelle demande
        </button>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:5,marginBottom:14,borderBottom:`1px solid ${T.border}`,paddingBottom:8,overflowX:"auto",flexWrap:"nowrap",WebkitOverflowScrolling:"touch"}}>
        {TABS_DEF.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:tab===t.id?"#3B82F6":T.surface2,color:tab===t.id?"#fff":T.textMuted,border:`1px solid ${tab===t.id?"#3B82F6":T.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:tab===t.id?800:400,fontSize:11,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5}}>
            {t.l}
            {t.count>0&&<span style={{background:"#EF4444",color:"#fff",borderRadius:99,padding:"0 5px",fontSize:9,fontWeight:800}}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ─── SOUMETTRE ─── */}
      {tab === "soumettre" && (
        <div>
          <div style={{background:`linear-gradient(135deg,#3B82F618,${T.surface2})`,border:"1px solid #3B82F633",borderRadius:12,padding:"16px 20px",marginBottom:14}}>
            <div style={{color:"#3B82F6",fontWeight:800,fontSize:13,marginBottom:4}}>📨 Soumettre une demande</div>
            <div style={{color:T.textMuted,fontSize:11}}>Votre demande sera transmise directement au responsable du processus concerné.</div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            {/* Type de demande */}
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:6}}>Type de demande *</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:6}}>
                {Object.entries(DEMANDE_TYPES).map(([k,v])=>(
                  <div key={k} onClick={()=>setForm(f=>({...f,type:k}))}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:form.type===k?v.color+"22":T.surface2,border:`1px solid ${form.type===k?v.color:T.border}`,borderRadius:8,cursor:"pointer",transition:"all 0.15s"}}>
                    <span style={{fontSize:16}}>{v.icon}</span>
                    <span style={{color:form.type===k?v.color:T.textMuted,fontWeight:form.type===k?700:400,fontSize:11}}>{v.label}</span>
                    {form.type===k&&<span style={{marginLeft:"auto",color:v.color,fontSize:12}}>✓</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Titre */}
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>Titre / Objet *</label>
              <input value={form.titre} onChange={e=>setForm(f=>({...f,titre:e.target.value}))}
                placeholder="Ex: Demande d'accès au module Finance..."
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 13px",color:T.text,fontSize:13,boxSizing:"border-box"}} />
            </div>

            {/* Description */}
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>Description détaillée</label>
              <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3}
                placeholder="Décrivez votre demande en détail, le contexte, les informations nécessaires..."
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 13px",color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}} />
            </div>

            {/* Processus cible */}
            <div>
              <label style={{color:T.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>Processus concerné *</label>
              <select value={form.targetProcess} onChange={e=>setForm(f=>({...f,targetProcess:e.target.value,targetUserId:""}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 13px",color:T.text,fontSize:12}}>
                {Object.entries(CODES.processes).map(([k,v])=>(
                  <option key={k} value={k}>{k} — {v}</option>
                ))}
              </select>
              {getProcessManager(form.targetProcess) && (
                <div style={{marginTop:4,fontSize:10,color:"#3B82F6"}}>
                  👤 Responsable : <strong>{getProcessManager(form.targetProcess)?.name}</strong>
                </div>
              )}
            </div>

            {/* Priorité */}
            <div>
              <label style={{color:T.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>Priorité</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {Object.entries(PRIORITY_CFG).map(([k,v])=>(
                  <button key={k} onClick={()=>setForm(f=>({...f,priority:k}))}
                    style={{background:form.priority===k?v.c+"22":"transparent",border:`1px solid ${form.priority===k?v.c:T.border}`,borderRadius:7,padding:"6px 12px",cursor:"pointer",color:form.priority===k?v.c:T.textMuted,fontWeight:form.priority===k?700:400,fontSize:11}}>
                    {v.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Responsable spécifique (optionnel) */}
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>Envoyer spécifiquement à (optionnel)</label>
              <select value={form.targetUserId} onChange={e=>setForm(f=>({...f,targetUserId:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 13px",color:T.text,fontSize:12}}>
                <option value="">— Responsable du processus (automatique) —</option>
                {processManagers.map(u=>(
                  <option key={u.id} value={u.id}>{u.name} — {u.role} (Niv.{u.level})</option>
                ))}
              </select>
            </div>

            {/* Note + Pièces jointes */}
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:5}}>📎 Pièces jointes (si applicable)</label>
              <div style={{background:T.surface3,border:`1px dashed ${T.border}`,borderRadius:9,padding:12,display:"flex",flexDirection:"column",gap:8}}>
                {/* Option 1 : depuis dossiers */}
                <div>
                  <div style={{color:T.textMuted,fontSize:10,fontWeight:700,marginBottom:4}}>📁 Depuis Dossiers & Documents</div>
                  <select value={form.attachmentDossierId} onChange={e=>setForm(f=>({...f,attachmentDossierId:e.target.value}))}
                    style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="">— Sélectionner un dossier/document source —</option>
                    {typeof dossiers !== "undefined" && dossiers.map&&dossiers.filter(d=>d.assignedTo===currentUser.id||d.createdBy===currentUser.id||currentUser.level>=3).map(d=>(
                      <option key={d.id} value={d.id}>{d.ref} — {d.client} ({d.status})</option>
                    ))}
                  </select>
                  {form.attachmentDossierId && <div style={{color:"#3B82F6",fontSize:10,marginTop:2}}>✅ Dossier sélectionné comme source</div>}
                </div>
                {/* Option 2 : téléversement externe */}
                <div>
                  <div style={{color:T.textMuted,fontSize:10,fontWeight:700,marginBottom:4}}>⬆️ Téléverser depuis l'extérieur</div>
                  {/* FIX v152 — Capturer les vrais objets File pour upload via gcFileSave */}
                  <input type="file" multiple
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      setPendingFiles(files);
                      const names = files.map(f => f.name).join(", ");
                      setForm(f => ({ ...f, attachmentUpload: names }));
                      e.target.value = "";
                    }}
                    style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px",color:T.text,fontSize:11}} />
                  {form.attachmentUpload && <div style={{color:"#22C55E",fontSize:10,marginTop:2}}>📎 {pendingFiles.length} fichier(s) prêt(s) : {form.attachmentUpload}</div>}
                </div>
                {/* Note libre */}
                <div>
                  <input value={form.attachmentNote} onChange={e=>setForm(f=>({...f,attachmentNote:e.target.value}))}
                    placeholder="Note complémentaire sur les pièces jointes…"
                    style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                </div>
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:10}}>
            <button onClick={handleSubmit} style={{background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",border:"none",color:"#fff",borderRadius:9,padding:"11px 24px",cursor:"pointer",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:8,boxShadow:"0 4px 16px rgba(59,130,246,0.35)"}}>
              📨 Envoyer la demande
            </button>
            <button onClick={()=>{setPendingFiles([]);setForm({type:"DOSSIER",titre:"",description:"",targetProcess:currentUser.process||"O01",targetUserId:"",priority:"NORMALE",attachmentNote:"",attachmentDossierId:"",attachmentUpload:null});}}
              style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:9,padding:"11px 18px",cursor:"pointer",fontSize:12}}>
              🗑️ Effacer
            </button>
          </div>
        </div>
      )}

      {/* ─── MES ENVOIS ─── */}
      {tab === "mes_demandes" && (
        <div>
          {/* Barre recherche mes envois */}
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={demSearch} onChange={e=>setDemSearch(e.target.value)} placeholder="🔍 Titre, type, destinataire…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <select value={demTypeFilter} onChange={e=>setDemTypeFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">📂 Tous types</option>
              {Object.keys(DEMANDE_TYPES||{}).map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            {(demSearch||demTypeFilter!=="ALL")&&<button onClick={()=>{setDemSearch("");setDemTypeFilter("ALL");}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:9}}>✕</button>}
          </div>
          <div style={{marginBottom:10,display:"flex",gap:6,flexWrap:"wrap"}}>
            {["ALL","EN_ATTENTE","EN_COURS","TRAITE","REJETE","INFO_REQUISE"].map(s=>(
              <button key={s} onClick={()=>setFilterStatus(s)}
                style={{background:filterStatus===s?(STATUT_CFG[s]?.c||"#3B82F6")+"22":T.surface2,color:filterStatus===s?(STATUT_CFG[s]?.c||"#3B82F6"):T.textMuted,border:`1px solid ${filterStatus===s?(STATUT_CFG[s]?.c||"#3B82F6"):T.border}`,borderRadius:16,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:filterStatus===s?800:400}}>
                {s==="ALL"?"Toutes":STATUT_CFG[s]?.l} ({s==="ALL"?demandes.filter(d=>d.submittedBy===currentUser.id).length:demandes.filter(d=>d.submittedBy===currentUser.id&&d.status===s).length})
              </button>
            ))}
          </div>
          {demandes.filter(d=>{const q=demSearch.toLowerCase();const matchQ=!q||(d.titre||"").toLowerCase().includes(q)||(d.type||"").toLowerCase().includes(q)||(d.targetUserName||"").toLowerCase().includes(q);const matchType=demTypeFilter==="ALL"||d.type===demTypeFilter;return d.submittedBy===currentUser.id&&matchQ&&matchType&&(filterStatus==="ALL"||d.status===filterStatus);}).length === 0 ? (
            <div style={{textAlign:"center",padding:"40px 20px",color:T.textMuted,fontSize:12}}>
              <div style={{fontSize:40,marginBottom:12}}>📭</div>
              Aucune demande envoyée.{" "}
              <span onClick={()=>setTab("soumettre")} style={{color:"#3B82F6",cursor:"pointer",fontWeight:700}}>Soumettre ma première demande →</span>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {demandes.filter(d=>{
                const q=demSearch.toLowerCase();
                const matchQ=!q||(d.titre||"").toLowerCase().includes(q)||(d.type||"").toLowerCase().includes(q)||(d.targetUserName||"").toLowerCase().includes(q);
                const matchType=demTypeFilter==="ALL"||d.type===demTypeFilter;
                const matchS=filterStatus==="ALL"||d.status===filterStatus;
                return d.submittedBy===currentUser.id&&matchQ&&matchType&&matchS;
              }).map(d=>{
                const dt = DEMANDE_TYPES[d.type]||DEMANDE_TYPES.AUTRE;
                const sc = STATUT_CFG[d.status]||STATUT_CFG.EN_ATTENTE;
                const pc = PRIORITY_CFG[d.priority]||PRIORITY_CFG.NORMALE;
                const isExpanded = expandedId === d.id;
                return (
                  <div key={d.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
                    <div onClick={()=>setExpandedId(isExpanded?null:d.id)} style={{padding:"12px 16px",cursor:"pointer",display:"flex",gap:12,alignItems:"center"}}>
                      <div style={{width:36,height:36,borderRadius:8,background:dt.color+"22",border:`1px solid ${dt.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{dt.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:T.text,fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.titre}</div>
                        <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>
                          → {d.targetUserName||"Responsable "+d.targetProcess} · {d.targetProcess} · {formatDate(d.submittedAt)}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        <span style={{background:pc.c+"22",color:pc.c,border:`1px solid ${pc.c}44`,borderRadius:99,padding:"2px 8px",fontSize:9,fontWeight:700}}>{pc.l}</span>
                        <span style={{background:sc.c+"22",color:sc.c,border:`1px solid ${sc.c}44`,borderRadius:99,padding:"3px 10px",fontSize:10,fontWeight:700}}>{sc.icon} {sc.l}</span>
                        <span style={{color:T.textMuted,fontSize:12}}>{isExpanded?"▲":"▼"}</span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{borderTop:`1px solid ${T.border}`,padding:"12px 16px"}}>
                        {d.description && <div style={{color:T.textMuted,fontSize:11,marginBottom:10,lineHeight:1.6}}>{d.description}</div>}
                        {(d.attachmentNote||d.attachmentDossierId||d.attachmentUpload||d.attachmentRefs?.length>0) && (
                          <div style={{background:"#3B82F608",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:10}}>
                            <div style={{color:"#3B82F6",fontWeight:700,fontSize:10,marginBottom:5}}>📎 Documents / Pièces jointes</div>
                            {/* FIX v152 — Afficher les refs complètes avec boutons Voir/Télécharger */}
                            {(d.attachmentRefs||[]).map((ref,i)=>(
                              <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                <span style={{color:T.text,fontSize:11,flex:1}}>📄 {ref.nom||ref.name||`Fichier ${i+1}`}</span>
                                <button onClick={()=>gcViewDoc(ref)} style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:5,padding:"3px 9px",color:"#3B82F6",cursor:"pointer",fontSize:10,fontWeight:700}}>👁 Voir</button>
                                <button onClick={()=>gcDownloadDoc(ref)} style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:5,padding:"3px 9px",color:"#22C55E",cursor:"pointer",fontSize:10,fontWeight:700}}>⬇ DL</button>
                              </div>
                            ))}
                            {/* Fallback : nom de fichier seul (ancien format sans refs) */}
                            {!d.attachmentRefs?.length && d.attachmentUpload && <div style={{color:T.text,fontSize:11,marginBottom:3}}>📄 {d.attachmentUpload}</div>}
                            {d.attachmentDossierId && <div style={{color:T.text,fontSize:11,marginBottom:3}}>📁 Dossier lié : <strong style={{color:"#C9A84C"}}>{(dossiers||[]).find(x=>x.id===d.attachmentDossierId)?.ref||d.attachmentDossierId}</strong></div>}
                            {d.attachmentNote && <div style={{color:T.textMuted,fontSize:10,fontStyle:"italic"}}>Note : {d.attachmentNote}</div>}
                          </div>
                        )}
                        {(d.replies||[]).length > 0 && (
                          <div style={{marginBottom:10}}>
                            <div style={{color:"#3B82F6",fontWeight:700,fontSize:11,marginBottom:6}}>💬 Réponses ({d.replies.length})</div>
                            {d.replies.map((r,i)=>(
                              <div key={i} style={{background:r.from===currentUser.id?"#3B82F615":"#C41E3A08",border:`1px solid ${r.from===currentUser.id?"#3B82F633":"#C41E3A22"}`,borderRadius:8,padding:"8px 12px",marginBottom:4}}>
                                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                                  <span style={{color:T.text,fontWeight:700,fontSize:11}}>{r.fromName}</span>
                                  <span style={{color:T.textMuted,fontSize:9}}>{formatDateTime(r.at)}</span>
                                </div>
                                <div style={{color:T.text,fontSize:11,lineHeight:1.5}}>{r.text}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {(d.status==="INFO_REQUISE"||d.status==="EN_COURS") && (
                          <div style={{display:"flex",gap:8,marginTop:8}}>
                            <input value={replyText[d.id]||""} onChange={e=>setReplyText(p=>({...p,[d.id]:e.target.value}))}
                              placeholder="Votre réponse / complément d'information..." onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleReply(d.id)}
                              style={{flex:1,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}} />
                            <button onClick={()=>handleReply(d.id)} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>📤 Envoyer</button>
                          </div>
                        )}
                        {/* FIX vDEM-DEL — Bouton supprimer (demandes envoyées) */}
                        <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
                          <button onClick={()=>gcConfirm(`Supprimer "${d.titre}" ?`,"Suppression","🗑️",true).then(ok=>{if(ok){setDemandes(prev=>prev.filter(x=>x.id!==d.id));setExpandedId(null);playSound("success");}})}
                            style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                            🗑️ Supprimer cette demande
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── DEMANDES REÇUES (niv 3+) ─── */}
      {(tab === "recues" || tab === "toutes") && isManager && (
        <div>
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={demSearch} onChange={e=>setDemSearch(e.target.value)} placeholder="🔍 Objet, expéditeur, type…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <select value={demTypeFilter} onChange={e=>setDemTypeFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">📂 Tous types</option>
              {Object.keys(DEMANDE_TYPES||{}).map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select value={demSort} onChange={e=>setDemSort(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="date_desc">↓ Plus récents</option>
              <option value="date_asc">↑ Plus anciens</option>
              <option value="objet">A→Z Objet</option>
            </select>
          </div>
          <div style={{marginBottom:10,display:"flex",gap:6,flexWrap:"wrap"}}>
            {["ALL","EN_ATTENTE","EN_COURS","TRAITE","REJETE","INFO_REQUISE"].map(s=>(
              <button key={s} onClick={()=>setFilterStatus(s)}
                style={{background:filterStatus===s?(STATUT_CFG[s]?.c||"#3B82F6")+"22":T.surface2,color:filterStatus===s?(STATUT_CFG[s]?.c||"#3B82F6"):T.textMuted,border:`1px solid ${filterStatus===s?(STATUT_CFG[s]?.c||"#3B82F6"):T.border}`,borderRadius:16,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:filterStatus===s?800:400}}>
                {s==="ALL"?"Toutes":STATUT_CFG[s]?.l} ({s==="ALL"?filteredDemandes.length:visibleDemandes.filter(d=>d.status===s).length})
              </button>
            ))}
          </div>

          {filteredDemandes.filter(d=>tab==="toutes"||d.submittedBy!==currentUser.id).length === 0 ? (
            <div style={{textAlign:"center",padding:"40px 20px",color:T.textMuted,fontSize:12}}>
              <div style={{fontSize:40,marginBottom:12}}>📭</div>
              Aucune demande {filterStatus!=="ALL"?`avec le statut "${STATUT_CFG[filterStatus]?.l}"`:""} dans votre périmètre.
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {filteredDemandes.filter(d=>tab==="toutes"||d.submittedBy!==currentUser.id).map(d=>{
                const dt = DEMANDE_TYPES[d.type]||DEMANDE_TYPES.AUTRE;
                const sc = STATUT_CFG[d.status]||STATUT_CFG.EN_ATTENTE;
                const pc = PRIORITY_CFG[d.priority]||PRIORITY_CFG.NORMALE;
                const isExpanded = expandedId === d.id;
                const submitter = users.find(u=>u.id===d.submittedBy);
                return (
                  <div key={d.id} style={{background:T.surface2,border:`2px solid ${d.status==="EN_ATTENTE"?dt.color+"44":T.border}`,borderRadius:12,overflow:"hidden"}}>
                    <div onClick={()=>{
                      const newExpanded = isExpanded ? null : d.id;
                      setExpandedId(newExpanded);
                      // FIX vDEM-READ — marquer la demande comme lue par le destinataire
                      if (newExpanded && !d.readByTarget && (d.targetUserId === currentUser.id || myProcs.includes(d.targetProcess))) {
                        setDemandes(prev => prev.map(x => x.id === d.id ? {...x, readByTarget: true} : x));
                      }
                    }} style={{padding:"12px 16px",cursor:"pointer",display:"flex",gap:12,alignItems:"center"}}>
                      <div style={{width:36,height:36,borderRadius:8,background:dt.color+"22",border:`1px solid ${dt.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{dt.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:T.text,fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.titre}</div>
                        <div style={{color:T.textMuted,fontSize:10,marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
                          <span>De : <strong style={{color:T.text}}>{d.submittedByName}</strong> ({d.submittedByRole})</span>
                          <span>Processus : <strong style={{color:"#3B82F6"}}>{d.targetProcess}</strong></span>
                          <span>{formatDate(d.submittedAt)}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        <span style={{background:pc.c+"22",color:pc.c,border:`1px solid ${pc.c}44`,borderRadius:99,padding:"2px 8px",fontSize:9,fontWeight:700}}>{pc.l}</span>
                        <span style={{background:sc.c+"22",color:sc.c,border:`1px solid ${sc.c}44`,borderRadius:99,padding:"3px 10px",fontSize:10,fontWeight:700}}>{sc.icon} {sc.l}</span>
                        <span style={{color:T.textMuted,fontSize:12}}>{isExpanded?"▲":"▼"}</span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{borderTop:`1px solid ${T.border}`,padding:"14px 16px"}}>
                        {d.description && (
                          <div style={{background:T.surface3,borderRadius:8,padding:"10px 14px",marginBottom:12,color:T.text,fontSize:12,lineHeight:1.6}}>{d.description}</div>
                        )}
                        {d.attachmentNote && (
                          <div style={{background:"#3B82F608",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:12,color:"#3B82F6",fontSize:11}}>
                            📎 Note PJ : {d.attachmentNote}
                          </div>
                        )}
                        {/* FIX vDEM-DOCS — Afficher tous les documents attachés toujours */}
                        {(d.attachmentRefs?.length>0||d.attachmentUpload||d.attachmentDossierId) && (
                          <div style={{background:"#3B82F608",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:12}}>
                            <div style={{color:"#3B82F6",fontWeight:700,fontSize:10,marginBottom:5}}>📎 Documents transmis par l'émetteur</div>
                            {/* FIX v152 — Boutons Voir/DL pour les refs uploadées */}
                            {(d.attachmentRefs||[]).map((ref,i)=>(
                              <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                <span style={{color:"#3B82F6",fontSize:11,flex:1}}>📄 {ref.nom||ref.name||`Fichier ${i+1}`}</span>
                                <button onClick={()=>gcViewDoc(ref)} style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:5,padding:"3px 9px",color:"#3B82F6",cursor:"pointer",fontSize:10,fontWeight:700}}>👁 Voir</button>
                                <button onClick={()=>gcDownloadDoc(ref)} style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:5,padding:"3px 9px",color:"#22C55E",cursor:"pointer",fontSize:10,fontWeight:700}}>⬇ DL</button>
                              </div>
                            ))}
                            {!d.attachmentRefs?.length && d.attachmentUpload && <div style={{color:"#3B82F6",fontSize:11,marginBottom:3}}>📄 Fichier(s) : <strong>{d.attachmentUpload}</strong></div>}
                            {d.attachmentDossierId && <div style={{color:"#3B82F6",fontSize:11}}>📁 Dossier lié : <strong style={{color:"#C9A84C"}}>{(dossiers||[]).find(x=>x.id===d.attachmentDossierId)?.ref||d.attachmentDossierId}</strong></div>}
                          </div>
                        )}

                        {/* Historique replies */}
                        {(d.replies||[]).length > 0 && (
                          <div style={{marginBottom:12}}>
                            <div style={{color:"#3B82F6",fontWeight:700,fontSize:11,marginBottom:6}}>💬 Échanges ({d.replies.length})</div>
                            {d.replies.map((r,i)=>(
                              <div key={i} style={{background:r.from===currentUser.id?"#C41E3A08":"#3B82F608",border:`1px solid ${r.from===currentUser.id?"#C41E3A22":"#3B82F622"}`,borderRadius:8,padding:"8px 12px",marginBottom:4}}>
                                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                                  <span style={{color:T.text,fontWeight:700,fontSize:11}}>{r.fromName}</span>
                                  <span style={{color:T.textMuted,fontSize:9}}>{formatDateTime(r.at)}</span>
                                </div>
                                <div style={{color:T.text,fontSize:11,lineHeight:1.5}}>{r.text}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        {d.submittedBy !== currentUser.id && (
                          <div>
                            <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                              {d.status==="EN_ATTENTE"&&<button onClick={()=>handleStatusChange(d.id,"EN_COURS")} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>🔄 Prendre en charge</button>}
                              {(d.status==="EN_ATTENTE"||d.status==="EN_COURS")&&<button onClick={()=>handleStatusChange(d.id,"TRAITE")} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Marquer traité</button>}
                              {(d.status==="EN_ATTENTE"||d.status==="EN_COURS")&&<button onClick={()=>handleStatusChange(d.id,"INFO_REQUISE")} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>💬 Infos requises</button>}
                              {d.status!=="REJETE"&&d.status!=="TRAITE"&&<button onClick={()=>handleStatusChange(d.id,"REJETE")} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>❌ Rejeter</button>}
                            </div>
                            <div style={{display:"flex",gap:8}}>
                              <input value={replyText[d.id]||""} onChange={e=>setReplyText(p=>({...p,[d.id]:e.target.value}))}
                                placeholder="Votre réponse à l'expéditeur..." onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleReply(d.id)}
                                style={{flex:1,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}} />
                              <button onClick={()=>handleReply(d.id)} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>📤 Répondre</button>
                            </div>
                          </div>
                        )}
                        {/* FIX vDEM-DEL — Bouton supprimer (demandes reçues, admin/manager uniquement) */}
                        {isAdmin && <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
                          <button onClick={()=>gcConfirm(`Supprimer la demande "${d.titre}" ?`,"Suppression","🗑️",true).then(ok=>{if(ok){setDemandes(prev=>prev.filter(x=>x.id!==d.id));setExpandedId(null);playSound("success");}})}
                            style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                            🗑️ Supprimer cette demande
                          </button>
                        </div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


