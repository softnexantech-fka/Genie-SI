import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// InformationsPanel.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, playSound, gcFileSave, _activeUser, formatDateTime, dsSave } from '../../core/index.js';
import { USER_FUNCTIONS, FILE_TYPE_CONFIG, INITIAL_SESSION_LOGS } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge} from '../../components/UI.jsx';

export function InformationsPanel({ currentUser, pendingApprovals=[], setPendingApprovals=_noop, T, isAdmin, sysMessages, setSysMessages=_noop, setNotifications=_noop, setUsers=_noop, setDossiers=_noop, setTaches=_noop, users=[], dossiers=[], committees=[], setActiveModule=_noop, addSessionLog=_noop}){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'admin',
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
      } catch(e) { console.error('[upload admin]', file.name, e.message); }
    }
    return results;
  };

  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const lvl = currentUser.level;

  const steps = [
    { key: "rh",         label: "Responsable RH",        subLabel:"S03 · Niv.4", icon: "👥", color: "#3B82F6",
      canApprove: (u) => u.level >= 4 && (["S03"].includes(u.process) || u.processes?.includes("S03") || u.role?.toLowerCase().includes("rh")) },
    { key: "conformite", label: "Resp. Conformité",       subLabel:"P02/S02 · Niv.4", icon: "🔍", color: "#A855F7",
      canApprove: (u) => u.level >= 4 && (["P02","S02"].includes(u.process) || u.processes?.some(p=>["P02","S02"].includes(p)) || u.role?.toLowerCase().includes("conformit") || u.role?.toLowerCase().includes("audit")) },
    { key: "dg",         label: "Direction Générale",     subLabel:"P01-P04 · Niv.5", icon: "🏛️", color: "#C9A84C",
      canApprove: (u) => u.level >= 5 },
  ];

  const visibleSysMsgs = (sysMessages||[]).filter(m =>
    (!m.minLevel || lvl >= m.minLevel) &&
    (!m.maxLevel || lvl <= m.maxLevel)
  );

  const isPresident = (committees||[]).some(c =>
    c.president === currentUser.id ||
    c.presidentId === currentUser.id ||
    c.membres?.find(m => m.id === currentUser.id && m.role === "Président")
  );
  const canPublish = isAdmin || lvl >= 4 || isPresident; // Niv4+ peuvent publier des annonces processus

  const deleteMsg = (id) => {
    if(setSysMessages) setSysMessages(prev => prev.filter(m => m.id !== id));
  };

  // ── Formulaire d'annonce inline ──────────────────────────────────────────
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);
  const [announceForm, setAnnounceForm] = useState({
    titre: "", msg: "", type: "ANNONCE", minLevel: 1, module: "", icon: "📢",
  });
  const ANNOUNCE_TYPES = [
    { k:"ANNONCE", l:"📢 Annonce", c:"#C41E3A", icon:"📢" },
    { k:"INFORMATION", l:"ℹ️ Information", c:"#3B82F6", icon:"ℹ️" },
    { k:"INSTRUCTION", l:"📋 Instruction", c:"#8B5CF6", icon:"📋" },
    { k:"ALERTE", l:"🚨 Alerte urgente", c:"#EF4444", icon:"🚨" },
    { k:"RAPPEL", l:"🔔 Rappel", c:"#F59E0B", icon:"🔔" },
  ];
  // ── Filtres approbations ──────────────────────────────────────────────
  const [apprSearch, setApprSearch] = useState("");
  // FIX v141 — "EN_ATTENTE" ne correspond à AUCUN statut réel des demandes
  // (les vrais statuts sont "ATTENTE_RH", "ATTENTE_CONFORMITE", "APPROUVE", "REJETE"…).
  // Le filtre "EN_ATTENTE" affichait bien les demandes non-approuvées/non-rejetées
  // mais uniquement si elles avaient status === "EN_ATTENTE" exact → liste vide.
  // Fix : initialiser à "ALL" pour tout afficher par défaut, et corriger la logique
  // "EN_ATTENTE" pour capturer tous les statuts ATTENTE_* dynamiques.
  const [apprStatusFilter, setApprStatusFilter] = useState("ALL");
  const [apprTypeFilter, setApprTypeFilter] = useState("ALL");
  const MODULE_OPTIONS = ["dashboard","dossiers","documents","taches","agenda","collaborateurs","codification","audit","sirh","finance","logistique","communication"];

  const handlePublishSystemMsg = () => {
    if (!announceForm.msg.trim()) { gcAlert("Le message ne peut pas être vide."); return; }
    const src = isPresident
      ? (committees||[]).find(c => c.president===currentUser.id||c.presidentId===currentUser.id||c.membres?.find(m=>m.id===currentUser.id&&m.role==="Président"))?.name || currentUser.name
      : `${currentUser.name} (${currentUser.role})`;
    const typeConf = ANNOUNCE_TYPES.find(t=>t.k===announceForm.type)||ANNOUNCE_TYPES[0];
    const newMsg = {
      id: "SYS-"+Date.now(),
      title: announceForm.titre.trim()||typeConf.l,
      icon: typeConf.icon,
      type: announceForm.type,
      msg: announceForm.msg.trim(),
      color: typeConf.c,
      minLevel: parseInt(announceForm.minLevel)||1,
      at: new Date().toISOString(),
      module: announceForm.module||null,
      source: src,
      author: currentUser.name,
      authorId: currentUser.id,
      authorRole: currentUser.role,
      authorProcess: currentUser.process,
      authorLevel: currentUser.level,
      canDelete: true,
      // Champ texte affiché dans SmartBanner (rétrocompat)
      text: announceForm.msg.trim(),
    };
    if (setSysMessages) setSysMessages(prev=>[newMsg,...prev]);
    if (setNotifications) setNotifications(prev=>[{
      id:"N"+Date.now(), icon:typeConf.icon,
      message:`[${announceForm.type}] ${announceForm.msg.trim().slice(0,80)} — ${currentUser.name}`,
      at:new Date().toISOString(), read:false,
    },...prev]);
    setAnnounceForm({titre:"",msg:"",type:"ANNONCE",minLevel:1,module:"",icon:"📢"});
    setShowAnnounceForm(false);
    playSound?.("success");
  };

  return (
    <div>
      <h3 style={{ color: "#C41E3A", margin: "0 0 14px", fontSize: 14, fontWeight: 800 }}>📣 Informations Complémentaires & Approbations</h3>

      {/* System notifications */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h4 style={{ color: T.text, margin: 0, fontSize: 13 }}>📢 Messages & Notifications système</h4>
          {canPublish && (
            <button onClick={()=>setShowAnnounceForm(v=>!v)}
              style={{ background:showAnnounceForm?"#C41E3A22":"#3B82F622",border:`1px solid ${showAnnounceForm?"#C41E3A44":"#3B82F644"}`,color:showAnnounceForm?"#C41E3A":"#3B82F6",borderRadius:8,padding:"4px 12px",cursor:"pointer",fontSize:11,fontWeight:700 }}>
              {showAnnounceForm ? "✕ Annuler" : isPresident ? "📢 Publier une annonce" : lvl>=5 ? "📣 Diffusion DG" : lvl>=4 ? "📢 Annonce processus" : "+ Publier"}
            </button>
          )}
        </div>
        {/* ── Formulaire d'annonce ── */}
        {showAnnounceForm && canPublish && (
          <div style={{background:T.surface2,border:"1px solid #C41E3A44",borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{color:"#C41E3A",fontWeight:800,fontSize:12,marginBottom:10}}>📢 Nouvelle annonce / message système</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div style={{gridColumn:"span 2"}}>
                <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Titre (optionnel)</label>
                <input value={announceForm.titre} onChange={e=>setAnnounceForm(f=>({...f,titre:e.target.value}))} placeholder="Ex: Réunion de direction du 20 mars" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>
              </div>
              <div style={{gridColumn:"span 2"}}>
                <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Message *</label>
                <textarea value={announceForm.msg} onChange={e=>setAnnounceForm(f=>({...f,msg:e.target.value}))} rows={3} placeholder="Rédigez votre annonce, instruction ou information…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Type</label>
                <select value={announceForm.type} onChange={e=>setAnnounceForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}}>
                  {ANNOUNCE_TYPES.map(t=><option key={t.k} value={t.k}>{t.l}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Visibilité minimale</label>
                <select value={announceForm.minLevel} onChange={e=>setAnnounceForm(f=>({...f,minLevel:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}}>
                  <option value={1}>Niv.1+ (Tous)</option>
                  <option value={2}>Niv.2+ (Opérationnels)</option>
                  <option value={3}>Niv.3+ (Responsables)</option>
                  <option value={4}>Niv.4+ (Managers)</option>
                  <option value={5}>Niv.5+ (Direction)</option>
                </select>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Module lié (optionnel)</label>
                <select value={announceForm.module} onChange={e=>setAnnounceForm(f=>({...f,module:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}}>
                  <option value="">— Aucun —</option>
                  {MODULE_OPTIONS.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
                <button onClick={handlePublishSystemMsg} style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:11,flex:1}}>📢 Publier</button>
                <button onClick={()=>setShowAnnounceForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
              </div>
            </div>
            <div style={{color:T.textDim,fontSize:9,marginTop:4}}>📌 Publié par : {currentUser.name} ({currentUser.role} · {currentUser.process}) — visible pour Niv.{announceForm.minLevel||1}+</div>
          </div>
        )}

        {visibleSysMsgs.length === 0 && <div style={{ color:T.textMuted, textAlign:"center", padding:20, background:T.surface2, borderRadius:10, border:`1px solid ${T.border}` }}>Aucun message système</div>}
        {visibleSysMsgs.map((info) => (
          <div key={info.id} style={{ background: info.color + "15", border: `1px solid ${info.color}44`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{info.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap", alignItems: "center" }}>
                <Badge label={info.type} color={info.color} small />
                {info.title && info.title !== info.type && <span style={{color:info.color,fontWeight:700,fontSize:11}}>{info.title}</span>}
                <span style={{ color: T.textDim, fontSize: 10 }}>{formatDateTime(info.at)}</span>
              </div>
              <div style={{ color: T.text, fontSize: 12, lineHeight: 1.5, marginBottom:6 }}>{info.text||info.msg}</div>
              {/* Traçabilité — mention Système SI */}
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                {(info.authorId||info.source) && (
                  <span style={{background:T.surface3,borderRadius:4,padding:"2px 8px",color:T.textMuted,fontSize:9}}>
                    📌 {info.author||info.source}
                    {info.authorRole&&` · ${info.authorRole}`}
                    {info.authorProcess&&` · ${info.authorProcess}`}
                    {info.authorLevel&&` · Niv.${info.authorLevel}`}
                  </span>
                )}
                {!info.authorId && (
                  <span style={{background:"#C41E3A15",borderRadius:4,padding:"2px 8px",color:"#C41E3A",fontSize:9,fontWeight:700}}>⚙️ Système SI</span>
                )}
                {info.minLevel>1 && (
                  <span style={{background:T.surface3,borderRadius:4,padding:"2px 8px",color:T.textDim,fontSize:9}}>
                    🔒 Niv.{info.minLevel}+
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {info.module && (
                  <button onClick={() => setActiveModule && setActiveModule(info.module)}
                    style={{ background:info.color+"22", border:`1px solid ${info.color}44`, borderRadius:6, padding:"3px 10px", color:info.color, cursor:"pointer", fontSize:10, fontWeight:700 }}>
                    🔗 Accéder à la source
                  </button>
                )}
                {(info.canDelete && (isAdmin || lvl >= 4 || lvl >= (info.minLevel || 99))) && (
                  <button onClick={async () => { if(await gcConfirm("Supprimer ce message ?")) deleteMsg(info.id); }}
                    style={{ background:"#EF444415", border:"1px solid #EF444444", borderRadius:6, padding:"3px 10px", color:"#EF4444", cursor:"pointer", fontSize:10, fontWeight:700 }}>
                    🗑️ Supprimer
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pending approvals for eligible users */}
      {lvl >= 3 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <h4 style={{ color: T.text, margin: 0, fontSize: 13 }}>✅ Demandes d'approbation ({pendingApprovals.length})</h4>
            {(isAdmin || lvl >= 5) && pendingApprovals.some(a => a.status === "APPROUVE" || (a.approvals?.dg?.approved)) && (
              <button onClick={async () => { if(await gcConfirm("Supprimer toutes les demandes complètement traitées (approuvées) ?"))setPendingApprovals(prev=>prev.filter(a=>a.status!=="APPROUVE")); }}
                style={{ background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"4px 12px",cursor:"pointer",fontSize:10,fontWeight:700 }}>
                🗑️ Purger approuvées
              </button>
            )}
          </div>
          {pendingApprovals.length === 0 && <div style={{ textAlign: "center", color: T.textMuted, padding: 28, background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>✅ Aucune approbation en attente</div>}
          {(()=>{
            const filteredApprovals = (pendingApprovals||[]).filter(a=>{
              const q = apprSearch.toLowerCase();
              const matchSearch = !q || (a.applicant||a.userName||"").toLowerCase().includes(q) || (a.function||a.userRole||"").toLowerCase().includes(q) || (a.type||"").toLowerCase().includes(q);
              // FIX v141 — "EN_ATTENTE" capture maintenant tous les statuts ATTENTE_* dynamiques
              const isApproved = a.status === "APPROUVE";
              const isRejected = a.status === "REJETE";
              const isPending  = !isApproved && !isRejected; // ATTENTE_RH, ATTENTE_CONFORMITE, etc.
              const matchStatus = apprStatusFilter === "ALL" ? true
                : apprStatusFilter === "EN_ATTENTE" ? isPending
                : apprStatusFilter === "APPROUVE"   ? isApproved
                : apprStatusFilter === "REJETE"     ? isRejected
                : true;
              const matchType = apprTypeFilter==="ALL" || (a.type||a.applicationType||"")===apprTypeFilter;
              return matchSearch && matchStatus && matchType;
            });
            return filteredApprovals;
          })().map(a => {
            const currentStep = steps.find(s => !a.approvals[s.key] || !(a.approvals[s.key]?.approved));
            const canApprove = isAdmin || (currentUser.level >= 6) || (currentStep && currentStep.canApprove(currentUser));
            const canReject = canApprove;
            const isFullyApproved = a.status === "APPROUVE" || steps.every(s => a.approvals[s.key]?.approved);
            const isRejected = steps.some(s => a.approvals[s.key] === false);
            return (
              <div key={a.id} style={{ background: T.surface2, border: `1px solid ${isFullyApproved?"#22C55E44":isRejected?"#EF444433":T.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>👤 Création de compte — {a.applicant}</div>
                    <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>{USER_FUNCTIONS.find(f => f.value === a.function)?.label} • Soumis {formatDateTime(a.submittedAt)}</div>
                    <div style={{ color: T.textMuted, fontSize: 11 }}>ID provisoire : <span style={{ color: "#C9A84C", fontFamily: "monospace", fontWeight: 700 }}>{a.generatedId}</span></div>
                    {a.alertsSent && <div style={{ color: T.textDim, fontSize: 10 }}>🔔 {a.alertsSent} relance(s) envoyée(s)</div>}
                  </div>
                  <div style={{ display:"flex", gap:6, flexDirection:"column", alignItems:"flex-end" }}>
                    <Badge label={a.status.replace("ATTENTE_","En attente – ")} color={isFullyApproved?"#22C55E":isRejected?"#EF4444":"#F59E0B"} />
                    {/* Delete if fully treated */}
                    {(isAdmin || lvl >= 5) && (isFullyApproved || isRejected) && (
                      <button onClick={async () => {if(await gcConfirm("Supprimer cette demande traitée ?"))setPendingApprovals(prev=>prev.filter(x=>x.id!==a.id));}}
                        style={{ background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700 }}>🗑️ Supprimer</button>
                    )}
                    {/* Relance button for pending */}
                    {!isFullyApproved && !isRejected && canApprove && (
                      <button onClick={async ()=>{
                        setPendingApprovals(prev=>prev.map(p=>p.id===a.id?{...p,alertsSent:(p.alertsSent||0)+1}:p));
                        setNotifications && setNotifications(prev=>[{id:"N"+Date.now(),icon:"🔔",message:`🔔 RELANCE : Demande d'approbation pour "${a.applicant}" — Étape: ${currentStep?.label} (${a.alertsSent||0} relance(s))`,at:new Date().toISOString(),read:false},...prev]);
                        gcAlert("✅ Relance envoyée.");
                      }}
                        style={{ background:"#F59E0B15",border:"1px solid #F59E0B33",color:"#F59E0B",borderRadius:5,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700 }}>🔔 Relancer</button>
                    )}
                  </div>
                </div>
                {/* Chain */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                  {steps.map((s, i) => {
                    const sd = a.approvals[s.key];
                    const done = sd && (sd === true || sd.approved);
                    const rejected = sd === false;
                    const active = !done && !rejected && steps.slice(0,i).every(ps => { const pd=a.approvals[ps.key]; return pd&&(pd===true||pd?.approved); });
                    return (
                      <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ background: done ? s.color+"22" : rejected ? "#EF444422" : active ? s.color+"15" : T.surface3, border: `1px solid ${done ? s.color : rejected ? "#EF4444" : active ? s.color+"66" : T.border}`, borderRadius: 8, padding: "6px 10px", textAlign: "center" }}>
                          <div style={{ fontSize: 14 }}>{s.icon}</div>
                          <div style={{ color: done ? s.color : rejected ? "#EF4444" : active ? s.color : T.textMuted, fontSize: 10, fontWeight: 700 }}>{s.label}</div>
                          <div style={{ fontSize: 9, color: T.textDim }}>{s.subLabel}</div>
                          <div style={{ fontSize: 10, marginTop: 2 }}>{done ? `✅ ${typeof sd==="object"?sd.by?.split(" ")[0]||"OK":"OK"}` : rejected ? "❌ Rejeté" : active ? "⏳ En attente" : "🔒"}</div>
                        </div>
                        {i < steps.length - 1 && <span style={{ color: T.textMuted, fontSize: 12 }}>→</span>}
                      </div>
                    );
                  })}
                </div>
                {canApprove && currentStep && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Btn variant="success" size="sm" onClick={async () => {
                      const now = new Date().toISOString();
                      const approvalData = {approved:true, by:currentUser.name, byId:currentUser.id, at:now};
                      const nextStep = steps[steps.indexOf(currentStep)+1];
                      const newStatus = nextStep ? `ATTENTE_${nextStep.key.toUpperCase()}` : "APPROUVE";
                      setPendingApprovals(prev => prev.map(p => p.id === a.id ? { ...p, approvals: { ...p.approvals, [currentStep.key]: approvalData }, status: newStatus, lastActionBy:currentUser.name, lastActionAt:now } : p));
                      if (newStatus === "APPROUVE" && a.generatedId) {
                        const alreadyExists = (users||[]).find(u => u.id === a.generatedId);
                        if (!alreadyExists && setUsers) {
                          const colors = ["#3B82F6","#22C55E","#A855F7","#F59E0B","#06B6D4","#EC4899"];
                          const avatarStr = (a.applicant||"?").trim().split(/\s+/).map(w=>w[0]||"").join("").slice(0,2).toUpperCase();
                          setUsers(prev=>[...prev,{
                            id:a.generatedId, name:a.applicant,
                            alias:(a.applicant||"").split(" ")[0].toLowerCase(),
                            role:a.functionLabel||a.function||"Collaborateur",
                            dept:a.dept||"", process:a.process||"O01",
                            level:a.level||2, avatar:avatarStr,
                            color:colors[Math.floor(Math.random()*colors.length)],
                            isAdmin:false, sexe:"N/A", nationalite:"Gabonaise",
                            telephone:"", email:a.email||"",
                            password:a.generatedId.slice(-6),
                            accountStatus:"ACTIF", createdAt:now, createdViaApproval:true,
                            approvedBy:currentUser.id, needsSirhOnboarding:true,
                          }]);
                        }
                        if(setNotifications) setNotifications(prev=>[
                          {id:"N"+Date.now(),icon:"✅",message:`✅ Compte ${a.applicant} (${a.generatedId}) approuvé par circuit complet — ${currentUser.name}`,at:now,read:false,module:"gestion_comptes"},
                          ...prev
                        ]);
                        playSound("success");
                      }
                    }}>✅ Valider — {currentStep.label}</Btn>
                    {isAdmin && (
                      <Btn variant="danger" size="sm" onClick={async () => {
                        if(await gcConfirm(`⚡ Bypass Admin : approuver directement ${a.applicant} ?`)) {
                          const now = new Date().toISOString();
                          const bd = {approved:true, by:currentUser.name, byId:currentUser.id, at:now, adminBypass:true};
                          setPendingApprovals(prev => prev.map(p => p.id===a.id ? {...p, approvals:{rh:bd,conformite:bd,dg:bd}, status:"APPROUVE", lastActionBy:currentUser.name, lastActionAt:now} : p));
                          if(a.generatedId && setUsers) {
                            const alreadyExists = (users||[]).find(u => u.id === a.generatedId);
                            if(!alreadyExists) {
                              const colors=["#3B82F6","#22C55E","#A855F7","#F59E0B","#06B6D4","#EC4899"];
                              const av=(a.applicant||"?").trim().split(/\s+/).map(w=>w[0]||"").join("").slice(0,2).toUpperCase();
                              setUsers(prev=>[...prev,{id:a.generatedId,name:a.applicant,alias:(a.applicant||"").split(" ")[0].toLowerCase(),role:a.functionLabel||a.function||"Collaborateur",dept:a.dept||"",process:a.process||"O01",level:a.level||2,avatar:av,color:colors[Math.floor(Math.random()*colors.length)],isAdmin:false,sexe:"N/A",nationalite:"Gabonaise",telephone:"",email:a.email||"",password:a.generatedId.slice(-6),accountStatus:"ACTIF",createdAt:now,createdViaApproval:true,approvedBy:currentUser.id,needsSirhOnboarding:true}]);
                            }
                          }
                          playSound("success");
                        }
                      }}>⚡ Bypass Admin</Btn>
                    )}
                    <Btn variant="danger" size="sm" onClick={async () => { setRejectModal(a.id); setRejectReason(""); }}>❌ Rejeter avec motif</Btn>
                  </div>
                )}
                {!canApprove && currentStep && <div style={{ color: T.textMuted, fontSize: 11 }}>⏳ En attente de : <strong>{currentStep.label}</strong> <span style={{color:T.textDim}}>({currentStep.subLabel})</span></div>}
                {a.status === "APPROUVE" && <div style={{ color: "#22C55E", fontSize: 12, fontWeight: 700 }}>✅ Compte approuvé — ID : {a.generatedId}</div>}
                {/* RH Transfer to SIRH */}
                {a.status === "APPROUVE" && !a.sirhTransfered && (currentUser.level >= 4) && (
                  <div style={{marginTop:8,background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{color:T.textMuted,fontSize:11,flex:1}}>👥 RH : Ce collaborateur peut être intégré dans la base SIRH et un dossier collaborateur créé.</span>
                    <button onClick={async () => {
                      if(!await gcConfirm(`Transférer ${a.applicant} dans la base SIRH et créer son dossier collaborateur ?`)) return;
                      const now = new Date().toISOString();
                      if(setUsers) setUsers(prev=>prev.map(u=>u.id===a.generatedId?{...u,needsSirhOnboarding:true,sirhInitiatedBy:currentUser.id,sirhInitiatedAt:now}:u));
                      if(setDossiers) {
                        const dosId = `DOS-COLLAB-${a.generatedId}`;
                        const newDossier = {id:dosId,ref:dosId,client:a.applicant,objet:`Dossier collaborateur — ${a.applicant}`,nature:"INTERNE",process:"S03",status:"EN_COURS",priority:"NORMALE",createdAt:now,createdBy:currentUser.id,qrCode:dosId,tags:["RH","Collaborateur","Onboarding"],notes:`Dossier créé par RH suite à approbation DG.\nFonction: ${a.functionLabel||a.function}\nDossier approbation: ${a.id}`,assignedTo:currentUser.id,linkedUserId:a.generatedId,type:"COLLABORATEUR"};
                        setDossiers(prev=>[...prev, newDossier]);
                        dsSave("dossiers", [...dossiers, newDossier], currentUser.id);
                      }
                      if(setTaches) setTaches(prev=>[{id:"T"+Date.now(),titre:`Intégration SIRH : ${a.applicant}`,description:`Onboarding SIRH pour ${a.applicant} (${a.functionLabel||a.function}) — Dossier collaborateur créé automatiquement. Actions requises : présences, paie, congés.`,status:"A_FAIRE",statut:"A_FAIRE",creatorId:currentUser.id,assigneeId:currentUser.id,module:"sirh",createdAt:now,canCancel:false},...prev]);
                      if(setNotifications) setNotifications(prev=>[{id:"N"+Date.now(),icon:"👥",message:`[SIRH] ${a.applicant} transféré dans la base SIRH par ${currentUser.name}. Dossier collaborateur créé. Onboarding en attente.`,at:now,read:false,module:"sirh"},...prev]);
                      setPendingApprovals(prev=>prev.map(p=>p.id===a.id?{...p,sirhTransfered:true,sirhTransferedBy:currentUser.name,sirhTransferedAt:now}:p));
                      gcAlert(`✅ ${a.applicant} intégré dans la base SIRH.\n• Dossier collaborateur créé (${"DOS-COLLAB-"+a.generatedId})\n• Tâche onboarding créée\n• Visible dans SIRH → Onboarding`);
                    }} style={{background:"#3B82F7",border:"none",color:"#fff",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>👥 Transférer → SIRH</button>
                  </div>
                )}
                {a.sirhTransfered && <div style={{color:"#3B82F6",fontSize:10,marginTop:4}}>👥 Transféré dans SIRH le {formatDateTime(a.sirhTransferedAt)} par {a.sirhTransferedBy}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "#000C", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.surface, border: `2px solid #EF4444`, borderRadius: 16, padding: 24, width: 440 }}>
            <h3 style={{ color: "#EF4444", margin: "0 0 12px", fontSize: 15 }}>❌ Motif de rejet</h3>
            <div style={{ color: T.textMuted, fontSize: 12, marginBottom: 12 }}>Veuillez expliquer clairement les raisons du rejet et les corrections à apporter. Ce message sera transmis à l'émetteur.</div>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Motif du rejet, corrections requises, orientations…" style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, color: T.text, fontSize: 12, minHeight: 100, resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Btn variant="danger" onClick={async () => {
                if (!rejectReason.trim()) { gcAlert("Veuillez saisir un motif de rejet."); return; }
                setPendingApprovals(prev => prev.map(p => p.id === rejectModal ? { ...p, status: "REJETE", rejectReason, rejectBy: currentUser.id } : p));
                setRejectModal(null);
              }}>❌ Confirmer le rejet</Btn>
              <Btn variant="ghost" onClick={() => setRejectModal(null)}>Annuler</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Configuration du cabinet - visible pour admin/DG */}
      {(isAdmin || currentUser.level >= 5) && (
        <div style={{ marginTop: 24 }}>
          <CabinetInfoConfig T={T} currentUser={currentUser} addSessionLog={addSessionLog} />
        </div>
      )}
    </div>
  );
};


/* ===========================================================
   FIX v59  -  Composants déplacés à la portée du module (anti-pattern: ne plus nester dans SIApp)
   ActivityJournal | FileDataManager | PrinterConfig
   ═══════════════════════════════════════════════════════════ */

export function ActivityJournal({ T, sessionLogs=[], setSessionLogs=_noop, users=[], dossiers=[], taches=[], currentUser, addSessionLog }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [filterUser, setFilterUser] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [isLive, setIsLive] = useState(true);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState("list"); // list | timeline | stats
  const LOGS_PER_PAGE = 25;
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isLive) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      const now = new Date().toISOString();
      const liveEvents = [
        { type:"CONSULTATION", icon:"👁️", action:"Consultation dossier", color:"#3B82F6" },
        { type:"MODIFICATION", icon:"✏️", action:"Modification de données", color:"#F59E0B" },
        { type:"EXPORT", icon:"📤", action:"Export document", color:"#A855F7" },
        { type:"UPLOAD", icon:"📎", action:"Téléversement fichier", color:"#06B6D4" },
      ];
      const activeUsers = users.filter(u => _activeUser(u)&&u.id !== "USR-ADM-000").slice(0, 4);
      if (activeUsers.length === 0) return;
      const randomUser = activeUsers[Math.floor(Math.random() * activeUsers.length)];
      const randomEvent = liveEvents[Math.floor(Math.random() * liveEvents.length)];
      const randomDossier = dossiers[Math.floor(Math.random() * Math.max(dossiers.length, 1))];
      const syntheticLog = {
        id: `SES-LIVE-${Date.now()}`,
        type: randomEvent.type,
        userId: randomUser.id, userName: randomUser.name, userRole: randomUser.role,
        userLevel: randomUser.level, userProcess: randomUser.process || "—",
        at: now, ip: `192.168.1.${Math.floor(Math.random()*50)+10}`,
        device: ["Chrome / Windows","Firefox / macOS","Edge / Windows","Safari / iOS"][Math.floor(Math.random()*4)],
        status: "SUCCESS",
        action: randomEvent.action+(randomDossier ? " — "+randomDossier.ref : ""),
        module: ["dossiers","taches","rdvs","messagerie","documents"][Math.floor(Math.random()*5)],
        icon: randomEvent.icon, color: randomEvent.color,
        isLive: true,
      };
      setSessionLogs(prev => [syntheticLog, ...prev].slice(0, 500));
    }, 8000);
    return () => clearInterval(intervalRef.current);
  }, [isLive, users, dossiers]);

  const LOG_TYPES = {
    CONNEXION:      { label:"Connexion",      icon:"🔐", color:"#22C55E" },
    DECONNEXION:    { label:"Déconnexion",    icon:"🚪", color:"#7A90B0" },
    TENTATIVE:      { label:"Tentative",      icon:"⚠️", color:"#F59E0B" },
    CONSULTATION:   { label:"Consultation",   icon:"👁️", color:"#3B82F6" },
    CREATION:       { label:"Création",       icon:"➕", color:"#A855F7" },
    MODIFICATION:   { label:"Modification",   icon:"✏️", color:"#F97316" },
    VALIDATION:     { label:"Validation",     icon:"✅", color:"#22C55E" },
    APPROBATION:    { label:"Approbation",    icon:"☑️", color:"#06B6D4" },
    REJET:          { label:"Rejet",          icon:"❌", color:"#EF4444" },
    EXPORT:         { label:"Export",         icon:"📤", color:"#A855F7" },
    UPLOAD:         { label:"Téléversement",  icon:"📎", color:"#06B6D4" },
    DOWNLOAD:       { label:"Téléchargement", icon:"⬇️", color:"#3B82F6" },
    IMPRESSION:     { label:"Impression",     icon:"🖨️", color:"#C9A84C" },
    SUPPRESSION:    { label:"Suppression",    icon:"🗑️", color:"#EF4444" },
    SIGNATURE:      { label:"Signature",      icon:"✍️", color:"#EC4899" },
    TRANSFERT:      { label:"Transfert",      icon:"🔄", color:"#F59E0B" },
  };

  const filtered = sessionLogs.filter(l => {
    if (filterType !== "ALL" && l.type !== filterType) return false;
    if (filterUser !== "ALL" && l.userId !== filterUser) return false;
    if (filterStatus !== "ALL" && l.status !== filterStatus) return false;
    if (search && !`${l.userName}${l.userId}${l.type}${l.action||""}${l.module||""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom && l.at < dateFrom) return false;
    if (dateTo && l.at > dateTo + "T23:59:59") return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / LOGS_PER_PAGE);
  const paginated = filtered.slice((page-1)*LOGS_PER_PAGE, page*LOGS_PER_PAGE);

  const today = new Date().toISOString().slice(0,10);
  const stats = {
    total: sessionLogs.length,
    today: sessionLogs.filter(l => l.at?.slice(0,10) === today).length,
    connections: sessionLogs.filter(l => l.type === "CONNEXION").length,
    failures: sessionLogs.filter(l => l.status === "FAILED").length,
    activeUsers: [...new Set(sessionLogs.filter(l=>l.at?.slice(0,10)===today&&l.status==="SUCCESS").map(l=>l.userId))].length,
    uploads: sessionLogs.filter(l => l.type === "UPLOAD").length,
  };

  const exportCSV = () => {
    const header = "ID,Type,Utilisateur,Rôle,Processus,Date/Heure,IP,Appareil,Statut,Action,Motif";
    const rows = filtered.map(l => `"${l.id}","${l.type}","${l.userName}","${l.userRole}","${l.userProcess}","${l.at}","${l.ip}","${l.device}","${l.status}","${l.action||""}","${l.reason||""}"`);
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `journaux_gc_${today}.csv`; a.click();
    URL.revokeObjectURL(url);
    addSessionLog && addSessionLog("EXPORT", currentUser, { status:"SUCCESS", reason:`Export journaux CSV — ${filtered.length} lignes` });
  };

  return (
    <div className="gc-fade-in">
      {/* Header with live indicator */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:"linear-gradient(135deg,#1E3A5F,#0A1628)", border:`1px solid #3B82F633`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>📊</div>
          <div>
            <h3 style={{ color:T.text, margin:0, fontSize:15, fontWeight:800 }}>Journaux d'Activité — Temps Réel</h3>
            <div style={{ color:T.textMuted, fontSize:11 }}>Traçabilité complète · Toutes habilitations · {sessionLogs.length} entrées</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={() => setIsLive(l => !l)} style={{ display:"flex", alignItems:"center", gap:6, background: isLive?"#22C55E15":"#EF444415", border:`1px solid ${isLive?"#22C55E44":"#EF444444"}`, color:isLive?"#22C55E":"#EF4444", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:11, fontWeight:700 }}>
            <span className={isLive?"gc-dot-online":""} style={{ width:7, height:7, borderRadius:"50%", background:isLive?"#22C55E":"#EF4444", display:"inline-block" }} />
            {isLive ? "LIVE" : "PAUSÉ"}
          </button>
          {["list","timeline","stats"].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{ background:viewMode===m?"#C41E3A22":"transparent", border:`1px solid ${viewMode===m?"#C41E3A44":T.border}`, color:viewMode===m?"#C41E3A":T.textMuted, borderRadius:7, padding:"6px 12px", cursor:"pointer", fontSize:11, fontWeight:700 }}>
              {m==="list"?"📋 Liste":m==="timeline"?"⏱️ Timeline":"📈 Stats"}
            </button>
          ))}
          <Btn variant="success" size="sm" onClick={exportCSV}>⬇ CSV</Btn>
          {currentUser?.isAdmin && <Btn variant="danger" size="sm" onClick={async () => { if(await gcConfirm("Purger tous les journaux ?")) setSessionLogs(INITIAL_SESSION_LOGS); }}>🗑️ Purger</Btn>}
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8, marginBottom:16 }}>
        {[
          { label:"Total entrées", value:stats.total, icon:"📝", color:"#3B82F6" },
          { label:"Aujourd'hui", value:stats.today, icon:"📅", color:"#22C55E" },
          { label:"Connexions", value:stats.connections, icon:"🔐", color:"#A855F7" },
          { label:"Échecs/Alertes", value:stats.failures, icon:"⚠️", color:"#EF4444" },
          { label:"Users actifs/j", value:stats.activeUsers, icon:"👥", color:"#F59E0B" },
          { label:"Téléversements", value:stats.uploads, icon:"📎", color:"#06B6D4" },
        ].map(s => (
          <div key={s.label} style={{ background:T.surface2, border:`1px solid ${s.color}22`, borderRadius:10, padding:"10px 12px", textAlign:"center", position:"relative", overflow:"hidden" }}>
            <div className="gc-shimmer" style={{ position:"absolute", inset:0, opacity:0.4 }} />
            <div style={{ fontSize:18, marginBottom:3 }}>{s.icon}</div>
            <div style={{ color:s.color, fontWeight:800, fontSize:20, fontVariantNumeric:"tabular-nums" }}>{s.value}</div>
            <div style={{ color:T.textMuted, fontSize:9, lineHeight:1.3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:"14px 16px", marginBottom:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr", gap:10, alignItems:"end" }}>
          <div>
            <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>🔍 Recherche</label>
            <input value={search} onChange={async e=>{setSearch(e.target.value);setPage(1);}} placeholder="Nom, ID, action, module…"
              style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 12px", color:T.text, fontSize:12, boxSizing:"border-box" }} />
          </div>
          <div>
            <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>Type</label>
            <select value={filterType} onChange={async e=>{setFilterType(e.target.value);setPage(1);}} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 10px", color:T.text, fontSize:11 }}>
              <option value="ALL">Tous types</option>
              {Object.entries(LOG_TYPES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>Utilisateur</label>
            <select value={filterUser} onChange={async e=>{setFilterUser(e.target.value);setPage(1);}} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 10px", color:T.text, fontSize:11 }}>
              <option value="ALL">Tous</option>
              {[...new Set(sessionLogs.map(l=>l.userId))].map(uid => {
                const u = users.find(x=>x.id===uid);
                return <option key={uid} value={uid}>{u?.name||uid}</option>;
              })}
            </select>
          </div>
          <div>
            <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>Statut</label>
            <select value={filterStatus} onChange={async e=>{setFilterStatus(e.target.value);setPage(1);}} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 10px", color:T.text, fontSize:11 }}>
              <option value="ALL">Tous</option>
              <option value="SUCCESS">✅ Succès</option>
              <option value="FAILED">❌ Échec</option>
              <option value="MANUAL">🖱️ Manuel</option>
              <option value="AUTO">🤖 Auto</option>
            </select>
          </div>
          <div>
            <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>Du</label>
            <input type="date" value={dateFrom} onChange={async e=>{setDateFrom(e.target.value);setPage(1);}} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 10px", color:T.text, fontSize:11 }} />
          </div>
          <div>
            <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>Au</label>
            <input type="date" value={dateTo} onChange={async e=>{setDateTo(e.target.value);setPage(1);}} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 10px", color:T.text, fontSize:11 }} />
          </div>
        </div>
        <div style={{ marginTop:10, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ color:T.textMuted, fontSize:11 }}>
            <span style={{ color:T.text, fontWeight:700 }}>{filtered.length}</span> résultat(s) · Page <span style={{ color:"#C41E3A", fontWeight:700 }}>{page}</span>/{Math.max(totalPages,1)}
          </div>
          <button onClick={async ()=>{setSearch("");setFilterType("ALL");setFilterUser("ALL");setFilterStatus("ALL");setDateFrom("");setDateTo("");setPage(1);}}
            style={{ background:"transparent", border:`1px solid ${T.border}`, color:T.textMuted, borderRadius:6, padding:"4px 12px", cursor:"pointer", fontSize:11 }}>↺ Réinitialiser</button>
        </div>
      </div>

      {/* STATS VIEW */}
      {viewMode === "stats" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:16 }}>
            <h4 style={{ color:T.text, margin:"0 0 12px", fontSize:13 }}>📊 Répartition par Type d'Action</h4>
            {Object.entries(LOG_TYPES).map(([k,v]) => {
              const count = sessionLogs.filter(l=>l.type===k).length;
              const pct = sessionLogs.length > 0 ? (count/sessionLogs.length*100).toFixed(1) : 0;
              if (count === 0) return null;
              return (
                <div key={k} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ color:T.text, fontSize:11 }}>{v.icon} {v.label}</span>
                    <span style={{ color:v.color, fontWeight:700, fontSize:11 }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ background:"#00000020", borderRadius:99, height:5, overflow:"hidden" }}>
                    <div style={{ width:`${pct}%`, background:v.color, height:"100%", borderRadius:99, transition:"width 0.6s" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:16 }}>
            <h4 style={{ color:T.text, margin:"0 0 12px", fontSize:13 }}>👥 Activité par Utilisateur</h4>
            {[...new Set(sessionLogs.map(l=>l.userId))].slice(0,10).map(uid => {
              const u = users.find(x=>x.id===uid);
              const count = sessionLogs.filter(l=>l.userId===uid).length;
              const pct = sessionLogs.length > 0 ? (count/sessionLogs.length*100).toFixed(1) : 0;
              return (
                <div key={uid} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:u?.color||"#555", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:"#fff", fontWeight:700 }}>{u?.avatar||"?"}</div>
                      <span style={{ color:T.text, fontSize:11 }}>{u?.name||uid}</span>
                    </div>
                    <span style={{ color:"#C9A84C", fontWeight:700, fontSize:11 }}>{count}</span>
                  </div>
                  <div style={{ background:"#00000020", borderRadius:99, height:4, overflow:"hidden" }}>
                    <div style={{ width:`${pct}%`, background:u?.color||"#C9A84C", height:"100%", borderRadius:99 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:16, gridColumn:"span 2" }}>
            <h4 style={{ color:T.text, margin:"0 0 12px", fontSize:13 }}>🔐 Accès par Niveau d'Habilitation</h4>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10 }}>
              {[1,2,3,4,5,6].map(lvl => {
                const count = sessionLogs.filter(l=>l.userLevel===lvl).length;
                const labels = ["","Exécutant","Opérationnel","Responsable","Manager","Direction","Admin"];
                const colors = ["","#7A90B0","#3B82F6","#22C55E","#F59E0B","#A855F7","#C41E3A"];
                return (
                  <div key={lvl} style={{ background:T.surface3, border:`1px solid ${colors[lvl]}33`, borderRadius:10, padding:"12px 10px", textAlign:"center" }}>
                    <div style={{ color:colors[lvl], fontWeight:800, fontSize:22 }}>{count}</div>
                    <div style={{ color:T.text, fontSize:10, fontWeight:700 }}>Niv.{lvl}</div>
                    <div style={{ color:T.textMuted, fontSize:9 }}>{labels[lvl]}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TIMELINE VIEW */}
      {viewMode === "timeline" && (
        <div style={{ position:"relative", paddingLeft:24 }}>
          <div style={{ position:"absolute", left:10, top:0, bottom:0, width:2, background:`linear-gradient(to bottom,#C41E3A,${T.border},transparent)`, borderRadius:99 }} />
          {paginated.map((l, i) => {
            const lt = LOG_TYPES[l.type] || { icon:"📝", color:"#7A90B0", label:l.type };
            const u = users.find(x=>x.id===l.userId);
            const statusColors = { SUCCESS:"#22C55E", FAILED:"#EF4444", AUTO:"#7A90B0", MANUAL:"#3B82F6" };
            return (
              <div key={l.id} className="gc-fade-in" style={{ position:"relative", marginBottom:14, animationDelay:`${i*30}ms` }} onClick={() => setSelectedLog(l)}>
                <div style={{ position:"absolute", left:-20, top:8, width:10, height:10, borderRadius:"50%", background:lt.color, border:`2px solid ${T.surface}`, boxShadow:`0 0 8px ${lt.color}66` }} />
                <div className="gc-clickable" style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 14px", marginLeft:4 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                    <span style={{ fontSize:14 }}>{lt.icon}</span>
                    <span style={{ color:lt.color, fontSize:11, fontWeight:700 }}>{lt.label}</span>
                    {l.isLive && <span style={{ background:"#22C55E22", border:"1px solid #22C55E44", color:"#22C55E", borderRadius:99, padding:"1px 7px", fontSize:9, fontWeight:700 }} className="gc-pulse">LIVE</span>}
                    <span style={{ marginLeft:"auto", color:T.textMuted, fontSize:10, fontFamily:"monospace" }}>{l.at?.replace("T"," ").slice(0,16)}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:u?.color||"#555", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:"#fff", fontWeight:700 }}>{u?.avatar||"?"}</div>
                    <div>
                      <span style={{ color:T.text, fontWeight:700, fontSize:12 }}>{l.userName}</span>
                      <span style={{ color:T.textMuted, fontSize:10 }}> · {l.userRole} · Niv.{l.userLevel}</span>
                    </div>
                    <span style={{ marginLeft:"auto", background:(statusColors[l.status]||"#7A90B0")+"22", color:statusColors[l.status]||"#7A90B0", border:`1px solid ${(statusColors[l.status]||"#7A90B0")}44`, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{l.status}</span>
                  </div>
                  {l.action && <div style={{ color:T.textMuted, fontSize:11, marginTop:5, paddingLeft:30 }}>{l.action}</div>}
                  {l.reason && <div style={{ color:"#F59E0B", fontSize:10, marginTop:3, paddingLeft:30 }}>⚠️ {l.reason}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"140px 90px 1fr 1fr 120px 80px 60px", gap:0, padding:"8px 14px", background:T.surface3, borderBottom:`1px solid ${T.border}` }}>
            {["Date/Heure","Type","Utilisateur","Action / Module","Appareil","IP","Statut"].map(h => (
              <div key={h} style={{ color:T.textMuted, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.6 }}>{h}</div>
            ))}
          </div>
          {paginated.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 20px", color:T.textMuted }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
              <div style={{ fontSize:13 }}>Aucun journal ne correspond aux filtres sélectionnés</div>
            </div>
          )}
          {paginated.map((l, i) => {
            const lt = LOG_TYPES[l.type] || { icon:"📝", color:"#7A90B0", label:l.type };
            const u = users.find(x=>x.id===l.userId);
            const statusColors = { SUCCESS:"#22C55E", FAILED:"#EF4444", AUTO:"#7A90B0", MANUAL:"#3B82F6" };
            const isFailure = l.status === "FAILED";
            return (
              <div key={l.id} className="gc-clickable" onClick={() => setSelectedLog(l)}
                style={{ display:"grid", gridTemplateColumns:"140px 90px 1fr 1fr 120px 80px 60px", gap:0, padding:"9px 14px", borderBottom:`1px solid ${T.border}22`, background: isFailure?"#EF444408":l.isLive?"#22C55E06":"transparent", animationDelay:`${i*20}ms` }}>
                <div style={{ color:T.textMuted, fontSize:10, fontFamily:"monospace" }}>{l.at?.replace("T"," ").slice(0,16)}</div>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ fontSize:13 }}>{lt.icon}</span>
                  <span style={{ color:lt.color, fontSize:10, fontWeight:700 }}>{lt.label}</span>
                  {l.isLive && <span className="gc-pulse" style={{ width:5, height:5, background:"#22C55E", borderRadius:"50%", display:"inline-block" }} />}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", background:u?.color||"#555", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:"#fff", fontWeight:700, flexShrink:0 }}>{u?.avatar||"?"}</div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ color:T.text, fontSize:11, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{l.userName}</div>
                    <div style={{ color:T.textDim, fontSize:9 }}>Niv.{l.userLevel} · {l.userProcess}</div>
                  </div>
                </div>
                <div style={{ color:T.textMuted, fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", alignSelf:"center" }}>
                  {l.action || l.module || l.reason || "—"}
                </div>
                <div style={{ color:T.textDim, fontSize:10, alignSelf:"center", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.device}</div>
                <div style={{ color:T.textDim, fontSize:10, fontFamily:"monospace", alignSelf:"center" }}>{l.ip}</div>
                <div style={{ alignSelf:"center" }}>
                  <span style={{ background:(statusColors[l.status]||"#7A90B0")+"22", color:statusColors[l.status]||"#7A90B0", border:`1px solid ${(statusColors[l.status]||"#7A90B0")}33`, borderRadius:5, padding:"2px 7px", fontSize:9, fontWeight:700 }}>{l.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:12, alignItems:"center" }}>
          <Btn variant="ghost" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Préc</Btn>
          {Array.from({length:Math.min(totalPages,7)},(_,i)=>{
            let p = i+1;
            if (totalPages>7) { if (page<=4) p=i+1; else if (page>=totalPages-3) p=totalPages-6+i; else p=page-3+i; }
            return (
              <button key={p} onClick={()=>setPage(p)} style={{ width:32, height:32, borderRadius:8, border:`1px solid ${p===page?"#C41E3A44":T.border}`, background:p===page?"#C41E3A22":"transparent", color:p===page?"#C41E3A":T.textMuted, cursor:"pointer", fontSize:12, fontWeight:p===page?700:400 }}>{p}</button>
            );
          })}
          <Btn variant="ghost" size="sm" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Suiv →</Btn>
        </div>
      )}

      {/* Log Detail Modal */}
      {selectedLog && (() => {
        const l = selectedLog;
        const lt = LOG_TYPES[l.type] || { icon:"📝", color:"#7A90B0", label:l.type };
        const u = users.find(x=>x.id===l.userId);
        const statusColors = { SUCCESS:"#22C55E", FAILED:"#EF4444", AUTO:"#7A90B0", MANUAL:"#3B82F6" };
        return (
          <div style={{ position:"fixed", inset:0, background:"#000C", zIndex:5000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setSelectedLog(null)}>
            <div className="gc-modal-in" style={{ background:T.surface, border:`2px solid ${lt.color}44`, borderRadius:18, padding:28, width:520, maxWidth:"95vw", boxShadow:`0 32px 80px #000A, 0 0 0 1px ${lt.color}22` }} onClick={e=>e.stopPropagation()}>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, paddingBottom:14, borderBottom:`1px solid ${T.border}` }}>
                <div style={{ width:48, height:48, borderRadius:12, background:`${lt.color}22`, border:`1px solid ${lt.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>{lt.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ color:lt.color, fontWeight:800, fontSize:16 }}>{lt.label}</div>
                  <div style={{ color:T.textMuted, fontSize:11, fontFamily:"monospace" }}>{l.id}</div>
                </div>
                <span style={{ background:(statusColors[l.status]||"#7A90B0")+"22", color:statusColors[l.status]||"#7A90B0", border:`1px solid ${(statusColors[l.status]||"#7A90B0")}44`, borderRadius:8, padding:"4px 12px", fontSize:12, fontWeight:700 }}>{l.status}</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  ["👤 Utilisateur", l.userName],
                  ["🆔 ID", l.userId],
                  ["💼 Rôle", l.userRole],
                  ["🏷️ Niveau", `Niveau ${l.userLevel}`],
                  ["📂 Processus", l.userProcess],
                  ["📅 Date/Heure", l.at?.replace("T"," ").slice(0,16)],
                  ["🌐 IP", l.ip],
                  ["💻 Appareil", l.device],
                ].map(([k,v]) => (
                  <div key={k} style={{ background:T.surface2, borderRadius:8, padding:"8px 12px" }}>
                    <div style={{ color:T.textMuted, fontSize:9, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700, marginBottom:3 }}>{k}</div>
                    <div style={{ color:T.text, fontSize:12, fontFamily:["🌐 IP","🆔 ID","📅 Date/Heure"].includes(k)?"monospace":"inherit" }}>{v||"—"}</div>
                  </div>
                ))}
                {l.action && <div style={{ gridColumn:"span 2", background:T.surface2, borderRadius:8, padding:"8px 12px" }}>
                  <div style={{ color:T.textMuted, fontSize:9, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700, marginBottom:3 }}>🎯 Action / Module</div>
                  <div style={{ color:T.text, fontSize:12 }}>{l.action}</div>
                </div>}
                {l.reason && <div style={{ gridColumn:"span 2", background:"#F59E0B15", border:"1px solid #F59E0B33", borderRadius:8, padding:"8px 12px" }}>
                  <div style={{ color:"#F59E0B", fontSize:9, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700, marginBottom:3 }}>⚠️ Motif / Détail</div>
                  <div style={{ color:T.text, fontSize:12 }}>{l.reason}</div>
                </div>}
              </div>
              <div style={{ display:"flex", gap:10, marginTop:18, justifyContent:"flex-end" }}>
                {u && <div style={{ display:"flex", alignItems:"center", gap:8, marginRight:"auto" }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:u.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#fff", fontWeight:700, overflow:"hidden" }}>{u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar}</div>
                  <div><div style={{ color:T.text, fontSize:12, fontWeight:700 }}>{u.name}</div><div style={{ color:T.textMuted, fontSize:10 }}>{u.role}</div></div>
                </div>}
                <Btn variant="ghost" size="sm" onClick={()=>setSelectedLog(null)}>Fermer</Btn>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};


// FIX v72 — FILE_TYPE_CONFIG et getFileType remontés au scope module (étaient dans SIApp → ReferenceError dans FileDataManager)

const getFileType = (filename) => {
  const ext = filename?.split(".").pop()?.toLowerCase() || "unknown";
  return { ext, ...(FILE_TYPE_CONFIG[ext] || { icon:"📄", color:"#7A90B0", cat:"Autre", label:ext.toUpperCase(), viewer:"generic", editable:false }) };
};


export function FileDataManager({ T, users, currentUser, addSessionLog, setNotifications=_noop }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [files, setFiles] = useState(() => {
    try { return JSON.parse(_lsGet("gc-files")||"null") || []; } catch (_) { return []; }
  });
  const [view, setView] = useState("grid"); // grid | list
  const [filterCat, setFilterCat] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [dragging, setDragging] = useState(false);
  const [sortBy, setSortBy] = useState("date"); // date | name | size | type
  const dropRef = useRef();
  const inputRef = useRef();

  const saveFiles = (newFiles) => {
    setFiles(newFiles);
    try { _lsSet("gc-files", JSON.stringify(newFiles.map(f => ({...f, content: f.content?.slice(0,50000)})))); } catch (_) {}
  };

  const handleFileDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const dropped = Array.from(e.dataTransfer?.files || e.target?.files || []);
    processFiles(dropped);
  };

  const processFiles = async (fileList) => {
    for (const file of fileList) {
      const ft = getFileType(file.name);
      // FIX v135 — _uploadFiles is defined at component root, eslint-disable for nested scope
      // eslint-disable-next-line no-undef
      const [ref] = await _uploadFiles([file], { module: 'admin' });
      const newFile = {
          ...(ref||{}),
          id: ref?.id || `FILE-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          name: file.name, ext: ft.ext, type: ft.label, cat: ft.cat,
          icon: ft.icon, color: ft.color, viewer: ft.viewer, editable: ft.editable,
          size: file.size, sizeStr: formatFileSize(file.size),
          uploadedBy: currentUser?.id, uploadedByName: currentUser?.name,
          uploadedAt: new Date().toISOString(),
          lastModified: new Date(file.lastModified).toISOString(),
                    content: ref?.dataUrl || null,
          dataUrl: ft.viewer === "image" ? (ref?.dataUrl||null) : null,
          mimeType: file.type,
          accessLevel: currentUser?.level >= 5 ? 1 : currentUser?.level || 2,
          tags: [],
          downloads: 0,
        };
        setFiles(prev => {
          const updated = [newFile, ...prev];
          try { _lsSet("gc-files", JSON.stringify(updated.map(f=>({...f,content:f.content?.slice(0,50000)})))); } catch (_) {}
          return updated;
        });
        setNotifications && setNotifications(prev => [{id:"N"+Date.now(),icon:ft.icon,message:`Fichier téléversé : ${file.name} (${formatFileSize(file.size)})`,at:new Date().toISOString(),read:false},...prev]);
        addSessionLog && addSessionLog("UPLOAD", currentUser, { status:"SUCCESS", reason:`Téléversement : ${file.name} · ${formatFileSize(file.size)} · ${ft.label}` });
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "—";
    if (bytes < 1024) return bytes + " o";
    if (bytes < 1048576) return (bytes/1024).toFixed(1) + " Ko";
    return (bytes/1048576).toFixed(2) + " Mo";
  };

  const handleDownload = (file) => {
    if (file.dataUrl) {
      const a = document.createElement("a"); a.href = file.dataUrl; a.download = file.name; a.click();
    } else if (file.content) {
      const blob = new Blob([file.content], { type: file.mimeType || "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
    } else {
      gcAlert("Contenu du fichier non disponible pour téléchargement.");
    }
    saveFiles(files.map(f => f.id === file.id ? {...f, downloads: (f.downloads||0)+1} : f));
    addSessionLog && addSessionLog("DOWNLOAD", currentUser, { status:"SUCCESS", reason:`Téléchargement : ${file.name}` });
  };

  const handleDelete = async (fileId) => {
    if (!await gcConfirm("Supprimer définitivement ce fichier ?")) return;
    const f = files.find(x=>x.id===fileId);
    saveFiles(files.filter(x=>x.id!==fileId));
    setSelectedFile(null);
    addSessionLog && addSessionLog("SUPPRESSION", currentUser, { status:"SUCCESS", reason:`Suppression fichier : ${f?.name}` });
  };

  const handleSaveEdit = () => {
    if (!selectedFile) return;
    saveFiles(files.map(f => f.id===selectedFile.id ? {...f, content:editContent, lastModified:new Date().toISOString()} : f));
    setSelectedFile(prev => ({...prev, content:editContent}));
    setEditMode(false);
    addSessionLog && addSessionLog("MODIFICATION", currentUser, { status:"SUCCESS", reason:`Édition fichier : ${selectedFile.name}` });
  };

  const categories = ["ALL", ...new Set(files.map(f=>f.cat).filter(Boolean))];
  const filtered = files
    .filter(f => filterCat === "ALL" || f.cat === filterCat)
    .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.type?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => {
      if (sortBy==="name") return a.name.localeCompare(b.name);
      if (sortBy==="size") return (b.size||0)-(a.size||0);
      if (sortBy==="type") return (a.type||"").localeCompare(b.type||"");
      return new Date(b.uploadedAt||0)-new Date(a.uploadedAt||0);
    });

  const stats = {
    total: files.length,
    totalSize: files.reduce((s,f)=>s+(f.size||0),0),
    byCategory: Object.fromEntries(categories.filter(c=>c!=="ALL").map(c=>[c, files.filter(f=>f.cat===c).length])),
  };

  return (
    <div className="gc-fade-in">
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:"linear-gradient(135deg,#0A1E4A,#1A3A7A)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>📂</div>
          <div>
            <h3 style={{ color:T.text, margin:0, fontSize:15, fontWeight:800 }}>Gestion Fichiers & Données</h3>
            <div style={{ color:T.textMuted, fontSize:11 }}>{files.length} fichier(s) · {formatFileSize(stats.totalSize)} · Toutes extensions reconnues</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {["grid","list"].map(m => (
            <button key={m} onClick={()=>setView(m)} style={{ background:view===m?"#3B82F622":"transparent", border:`1px solid ${view===m?"#3B82F644":T.border}`, color:view===m?"#3B82F6":T.textMuted, borderRadius:7, padding:"6px 12px", cursor:"pointer", fontSize:12 }}>{m==="grid"?"⊞":"≡"}</button>
          ))}
          <Btn variant="primary" size="sm" onClick={()=>inputRef.current?.click()}>📎 Téléverser</Btn>
          <input ref={inputRef} type="file" multiple style={{display:"none"}} onChange={async e=>{ const files=Array.from(e.target.files||[]); if(files.length) processFiles(files); e.target.value=""; }} />
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
        {categories.map(c => (
          <button key={c} onClick={()=>setFilterCat(c)} style={{ background:filterCat===c?"#C41E3A22":"transparent", border:`1px solid ${filterCat===c?"#C41E3A44":T.border}`, color:filterCat===c?"#C41E3A":T.textMuted, borderRadius:20, padding:"4px 14px", cursor:"pointer", fontSize:11, fontWeight:filterCat===c?700:400 }}>
            {c} {c!=="ALL" ? `(${stats.byCategory[c]||0})` : `(${files.length})`}
          </button>
        ))}
      </div>

      {/* Filters bar */}
      <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher un fichier…"
          style={{ flex:1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 12px", color:T.text, fontSize:12 }} />
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 12px", color:T.text, fontSize:12 }}>
          <option value="date">Trier : Date</option>
          <option value="name">Trier : Nom</option>
          <option value="size">Trier : Taille</option>
          <option value="type">Trier : Type</option>
        </select>
      </div>

      {/* Drop Zone */}
      <div ref={dropRef} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={handleFileDrop}
        style={{ border:`2px dashed ${dragging?"#3B82F6":T.border}`, borderRadius:12, padding:"24px 20px", textAlign:"center", marginBottom:16, background:dragging?"#3B82F608":"transparent", transition:"all 0.2s" }}>
        <div style={{ fontSize:28, marginBottom:8 }}>📂</div>
        <div style={{ color:T.textMuted, fontSize:13 }}>Glisser-déposer des fichiers ici</div>
        <div style={{ color:T.textDim, fontSize:11, marginTop:4 }}>PDF, Word, Excel, PowerPoint, Images, Code, Archives, Audio, Vidéo… <strong style={{color:"#3B82F6"}}>Tous formats acceptés</strong></div>
      </div>

      {/* File Grid */}
      {view === "grid" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12 }}>
          {filtered.map(f => (
            <div key={f.id} className="gc-hover-card" onClick={async ()=>{setSelectedFile(f);setEditMode(false);setEditContent(f.content||"");}}
              style={{ background:T.surface2, border:`1px solid ${f.color}33`, borderRadius:12, padding:14, cursor:"pointer", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:f.color, opacity:0.6, borderRadius:"12px 12px 0 0" }} />
              <div style={{ fontSize:32, textAlign:"center", marginBottom:8, marginTop:4 }}>{f.icon}</div>
              <div style={{ color:T.text, fontSize:11, fontWeight:700, textAlign:"center", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
              <div style={{ color:f.color, fontSize:9, textAlign:"center", fontWeight:700, marginTop:4 }}>{f.type}</div>
              <div style={{ color:T.textDim, fontSize:9, textAlign:"center", marginTop:3 }}>{f.sizeStr}</div>
              {f.dataUrl && <img src={f.dataUrl} alt="" style={{ width:"100%", height:60, objectFit:"cover", borderRadius:6, marginTop:8, opacity:0.8 }} />}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn:"span 5", textAlign:"center", padding:"48px 20px", color:T.textMuted }}>
              <div style={{ fontSize:40, marginBottom:10 }}>📂</div>
              <div style={{ fontSize:13 }}>Aucun fichier. Téléversez vos premiers fichiers.</div>
            </div>
          )}
        </div>
      )}

      {/* File List */}
      {view === "list" && (
        <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"40px 1fr 100px 80px 130px 80px 70px", padding:"8px 14px", background:T.surface3, borderBottom:`1px solid ${T.border}` }}>
            {["","Nom","Type","Taille","Téléversé par","Date","Actions"].map(h => (
              <div key={h} style={{ color:T.textMuted, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.6 }}>{h}</div>
            ))}
          </div>
          {filtered.map(f => (
            <div key={f.id} className="gc-clickable" style={{ display:"grid", gridTemplateColumns:"40px 1fr 100px 80px 130px 80px 70px", padding:"10px 14px", borderBottom:`1px solid ${T.border}22`, alignItems:"center" }}>
              <div style={{ fontSize:20 }}>{f.icon}</div>
              <div onClick={async ()=>{setSelectedFile(f);setEditMode(false);setEditContent(f.content||"");}}>
                <div style={{ color:T.text, fontSize:12, fontWeight:600 }}>{f.name}</div>
                <div style={{ color:T.textDim, fontSize:9 }}>{f.mimeType || f.type}</div>
              </div>
              <div style={{ color:f.color, fontSize:11, fontWeight:700 }}>{f.type}</div>
              <div style={{ color:T.textMuted, fontSize:11, fontFamily:"monospace" }}>{f.sizeStr}</div>
              <div style={{ color:T.textMuted, fontSize:11 }}>{f.uploadedByName||"—"}</div>
              <div style={{ color:T.textDim, fontSize:10, fontFamily:"monospace" }}>{f.uploadedAt?.slice(0,10)||"—"}</div>
              <div style={{ display:"flex", gap:4 }}>
                <button onClick={()=>handleDownload(f)} title="Télécharger" style={{ background:"#3B82F622", border:"1px solid #3B82F644", color:"#3B82F6", borderRadius:5, padding:"3px 7px", cursor:"pointer", fontSize:11 }}>⬇</button>
                <button onClick={()=>handleDelete(f.id)} title="Supprimer" style={{ background:"#EF444422", border:"1px solid #EF444444", color:"#EF4444", borderRadius:5, padding:"3px 7px", cursor:"pointer", fontSize:11 }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File Viewer/Editor Modal */}
      {selectedFile && (
        <div style={{ position:"fixed", inset:0, background:"#000D", zIndex:5000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={async ()=>{setSelectedFile(null);setEditMode(false);}}>
          <div className="gc-modal-in" style={{ background:T.surface, border:`2px solid ${selectedFile.color}44`, borderRadius:18, width:"85vw", maxWidth:900, maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 40px 100px #000A" }} onClick={e=>e.stopPropagation()}>
            {/* File modal header */}
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"18px 22px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
              <div style={{ width:44, height:44, borderRadius:10, background:`${selectedFile.color}22`, border:`1px solid ${selectedFile.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{selectedFile.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ color:T.text, fontWeight:800, fontSize:14 }}>{selectedFile.name}</div>
                <div style={{ color:T.textMuted, fontSize:11 }}>{selectedFile.type} · {selectedFile.sizeStr} · {selectedFile.cat} · Téléversé par {selectedFile.uploadedByName} le {selectedFile.uploadedAt?.slice(0,10)}</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                {selectedFile.editable && !editMode && <Btn variant="navy" size="sm" onClick={()=>setEditMode(true)}>✏️ Éditer</Btn>}
                {editMode && <><Btn variant="success" size="sm" onClick={handleSaveEdit}>💾 Enregistrer</Btn><Btn variant="ghost" size="sm" onClick={()=>setEditMode(false)}>Annuler</Btn></>}
                <Btn variant="primary" size="sm" onClick={()=>handleDownload(selectedFile)}>⬇ Télécharger</Btn>
                <Btn variant="danger" size="sm" onClick={()=>handleDelete(selectedFile.id)}>🗑️</Btn>
                <button onClick={async ()=>{setSelectedFile(null);setEditMode(false);}} style={{ background:"transparent", border:`1px solid ${T.border}`, color:T.textMuted, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:13 }}>✕</button>
              </div>
            </div>

            {/* File content */}
            <div style={{ flex:1, overflow:"auto", padding:22 }}>
              {/* IMAGE */}
              {selectedFile.viewer === "image" && selectedFile.dataUrl && (
                <div style={{ textAlign:"center" }}>
                  <img src={selectedFile.dataUrl} alt={selectedFile.name} style={{ maxWidth:"100%", maxHeight:"65vh", borderRadius:10, boxShadow:"0 8px 40px #0008" }} />
                </div>
              )}
              {/* TEXT / CODE EDITOR */}
              {(selectedFile.viewer === "text" || selectedFile.viewer === "code") && (
                editMode ? (
                  <textarea value={editContent} onChange={e=>setEditContent(e.target.value)}
                    style={{ width:"100%", height:"60vh", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:16, color:T.text, fontSize:12, fontFamily:selectedFile.viewer==="code"?"'Courier New',monospace":"inherit", lineHeight:1.6, resize:"none", boxSizing:"border-box" }} />
                ) : (
                  <pre style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:16, color:T.text, fontSize:12, fontFamily:selectedFile.viewer==="code"?"'Courier New',monospace":"inherit", lineHeight:1.6, overflow:"auto", maxHeight:"60vh", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                    {selectedFile.content || <span style={{color:T.textMuted}}>Contenu non prévisualisable. Cliquez sur ⬇ Télécharger pour accéder au fichier.</span>}
                  </pre>
                )
              )}
              {/* TABLE (CSV) */}
              {selectedFile.viewer === "table" && selectedFile.content && (() => {
                const lines = selectedFile.content.split("\n").slice(0, 50);
                const rows = lines.map(l => l.split(/[,;|\t]/).map(c => c.trim().replace(/^"|"$/g,"")));
                return (
                  <div style={{ overflow:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                      <thead>
                        <tr>{(rows[0]||[]).map((cell,i) => <th key={i} style={{ background:T.surface3, border:`1px solid ${T.border}`, padding:"6px 10px", color:T.text, fontWeight:700, textAlign:"left" }}>{cell||`Col ${i+1}`}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.slice(1).map((row,ri) => (
                          <tr key={ri} style={{ background:ri%2===0?T.surface2:"transparent" }}>
                            {row.map((cell,ci) => <td key={ci} style={{ border:`1px solid ${T.border}22`, padding:"5px 10px", color:T.textMuted }}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {lines.length >= 50 && <div style={{ color:T.textMuted, fontSize:11, textAlign:"center", marginTop:10 }}>Affichage limité aux 50 premières lignes. Téléchargez pour voir tout.</div>}
                  </div>
                );
              })()}
              {/* GENERIC / ARCHIVE / OTHER */}
              {(selectedFile.viewer === "generic" || selectedFile.viewer === "archive" || selectedFile.viewer === "audio" || selectedFile.viewer === "video" || selectedFile.viewer === "slides" || (!selectedFile.content && selectedFile.viewer !== "image")) && (
                <div style={{ textAlign:"center", padding:"60px 20px" }}>
                  <div style={{ fontSize:64, marginBottom:16 }}>{selectedFile.icon}</div>
                  <div style={{ color:T.text, fontSize:16, fontWeight:700, marginBottom:8 }}>{selectedFile.name}</div>
                  <div style={{ color:T.textMuted, fontSize:12, marginBottom:8 }}>{selectedFile.type} · {selectedFile.sizeStr}</div>
                  <div style={{ color:T.textDim, fontSize:11, marginBottom:20 }}>Prévisualisation non disponible pour ce format.<br/>Téléchargez le fichier pour l'ouvrir dans l'application dédiée.</div>
                  <Btn variant="primary" onClick={()=>handleDownload(selectedFile)}>⬇ Télécharger {selectedFile.name}</Btn>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



export function CabinetInfoConfig({ T, currentUser, addSessionLog }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  // Informations par défaut du cabinet
  const defaultCabinetInfo = {
    nom: "GÉNIE CONSULTANT",
    description: "Cabinet Juridique, d'Affaires & de Conseil",
    adresse: "Libreville, Gabon",
    telephone: "+241 XX XX XX XX",
    email: "contact@genie-consultant.ga",
    siteWeb: "www.genie-consultant.ga",
    rccm: "[Numéro RCCM]",
    nif: "[Numéro NIF]"
  };

  const [cabinetInfo, setCabinetInfo] = useState(() => {
    try {
      const saved = _lsGet("gc-cabinet-info");
      return saved ? JSON.parse(saved) : defaultCabinetInfo;
    } catch (_) {
      return defaultCabinetInfo;
    }
  });

  const [saved, setSaved] = useState(false);

  const saveCabinetInfo = () => {
    try {
      _lsSet("gc-cabinet-info", JSON.stringify(cabinetInfo));
      // FIX v142 — Sync cross-machine : infos cabinet visibles sur tous les postes
      dsSave("gc-cabinet-info", cabinetInfo).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      addSessionLog && addSessionLog("MODIFICATION", currentUser, {
        status: "SUCCESS",
        reason: "Configuration informations cabinet mise à jour"
      });
    } catch (error) {
      gcAlert("Erreur lors de la sauvegarde des informations du cabinet.");
    }
  };

  const resetToDefault = async () => {
    if (!await gcConfirm("Réinitialiser toutes les informations du cabinet aux valeurs par défaut ?")) return;
    setCabinetInfo(defaultCabinetInfo);
    addSessionLog && addSessionLog("MODIFICATION", currentUser, {
      status: "SUCCESS",
      reason: "Informations cabinet réinitialisées aux valeurs par défaut"
    });
  };

  const updateField = (field, value) => {
    setCabinetInfo(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="gc-fade-in">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#C41E3A,#8B1538)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏛️</div>
          <div>
            <h3 style={{ color: T.text, margin: 0, fontSize: 15, fontWeight: 800 }}>Configuration Cabinet</h3>
            <div style={{ color: T.textMuted, fontSize: 11 }}>Informations du cabinet affichées sur les documents imprimés</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={resetToDefault}>🔄 Réinitialiser</Btn>
          <Btn variant="primary" size="sm" onClick={saveCabinetInfo}>
            💾 Sauvegarder {saved && "✓"}
          </Btn>
        </div>
      </div>

      {/* Aperçu */}
      <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h4 style={{ color: T.text, margin: "0 0 15px 0", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          👁️ Aperçu (tel qu'affiché sur les impressions)
        </h4>
        <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", padding: 15, borderRadius: 5, fontSize: 11, color: "#666" }}>
          <h4 style={{ margin: "0 0 10px 0", color: "#C41E3A", fontSize: 14 }}>{cabinetInfo.nom}</h4>
          <p><strong>{cabinetInfo.description}</strong></p>
          <p>📍 {cabinetInfo.adresse}</p>
          <p>📞 Téléphone: {cabinetInfo.telephone}</p>
          <p>📧 Email: {cabinetInfo.email}</p>
          <p>🌐 Site web: {cabinetInfo.siteWeb}</p>
          <p>📋 RCCM: {cabinetInfo.rccm} | NIF: {cabinetInfo.nif}</p>
        </div>
      </div>

      {/* Formulaire de configuration */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ color: T.text, margin: "0 0 15px 0", fontSize: 14, fontWeight: 700 }}>Informations Générales</h4>

          <InputField
            label="Nom du Cabinet"
            value={cabinetInfo.nom}
            onChange={e => updateField("nom", e.target.value)}
            placeholder="Ex: GÉNIE CONSULTANT"
            T={T}
            required
          />

          <InputField
            label="Description"
            value={cabinetInfo.description}
            onChange={e => updateField("description", e.target.value)}
            placeholder="Ex: Cabinet Juridique, d'Affaires & de Conseil"
            T={T}
          />

          <InputField
            label="Adresse"
            value={cabinetInfo.adresse}
            onChange={e => updateField("adresse", e.target.value)}
            placeholder="Ex: Libreville, Gabon"
            T={T}
          />
        </div>

        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ color: T.text, margin: "0 0 15px 0", fontSize: 14, fontWeight: 700 }}>Coordonnées</h4>

          <InputField
            label="Téléphone"
            value={cabinetInfo.telephone}
            onChange={e => updateField("telephone", e.target.value)}
            placeholder="Ex: +241 XX XX XX XX"
            T={T}
          />

          <InputField
            label="Email"
            type="email"
            value={cabinetInfo.email}
            onChange={e => updateField("email", e.target.value)}
            placeholder="Ex: contact@genie-consultant.ga"
            T={T}
          />

          <InputField
            label="Site Web"
            value={cabinetInfo.siteWeb}
            onChange={e => updateField("siteWeb", e.target.value)}
            placeholder="Ex: www.genie-consultant.ga"
            T={T}
          />
        </div>

        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ color: T.text, margin: "0 0 15px 0", fontSize: 14, fontWeight: 700 }}>Informations Juridiques</h4>

          <InputField
            label="RCCM"
            value={cabinetInfo.rccm}
            onChange={e => updateField("rccm", e.target.value)}
            placeholder="Ex: RCCM LBV 2020 B 12345"
            T={T}
          />

          <InputField
            label="NIF"
            value={cabinetInfo.nif}
            onChange={e => updateField("nif", e.target.value)}
            placeholder="Ex: 123456789"
            T={T}
          />
        </div>
      </div>

      {/* Note d'information */}
      <div style={{ background: "#C41E3A08", border: "1px solid #C41E3A22", borderRadius: 8, padding: 15, marginTop: 20 }}>
        <div style={{ color: "#C41E3A", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>ℹ️ Information</div>
        <div style={{ color: T.textMuted, fontSize: 11 }}>
          Ces informations seront automatiquement affichées en bas de tous les documents imprimés depuis le SI.
          Elles permettent d'identifier formellement le cabinet sur les rapports, factures et autres documents officiels.
        </div>
      </div>
    </div>
  );
};

export function PrinterConfig({ T, currentUser, addSessionLog }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [printers, setPrinters] = useState(() => {
    try { return JSON.parse(_lsGet("gc-printers") || "null") || [{ id: "PRT-001", name: "HP LaserJet Pro MFP", ip: "192.168.1.100", status: "CONNECTEE", type: "Laser", location: "Bureau Direction", port: 9100, protocol: "TCP/IP", format: "A4", dpi: 300, color: true, duplex: false, shared: false }]; } catch (_) { return []; }
  });
  const [selectedPrinter, setSelectedPrinter] = useState(() => printers[0] || null);
  const [printSettings, setPrintSettings] = useState({
    copies: 1,
    format: "A4",
    orientation: "portrait",
    sides: "recto",
    quality: "normal",
    color: true,
  });
  const [printQueue, setPrintQueue] = useState(() => {
    try { return JSON.parse(_lsGet("gc-print-queue") || "null") || []; } catch (_) { return []; }
  });
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [printerForm, setPrinterForm] = useState({
    name: "",
    ip: "",
    port: 9100,
    location: "",
    type: "Laser",
    protocol: "TCP/IP",
    format: "A4",
    dpi: 300,
    color: true,
    duplex: false,
    shared: false,
  });
  const [testPage, setTestPage] = useState(null);

  useEffect(() => {
    if (!selectedPrinter && printers.length) {
      setSelectedPrinter(printers[0]);
    }
  }, [printers, selectedPrinter]);

  const savePrinters = (newPrinters) => {
    setPrinters(newPrinters);
    try { _lsSet("gc-printers", JSON.stringify(newPrinters)); } catch (_) {}
    if (!newPrinters.find(p => p.id === selectedPrinter?.id)) {
      setSelectedPrinter(newPrinters[0] || null);
    }
  };

  const savePrintQueue = (queue) => {
    setPrintQueue(queue);
    try { _lsSet("gc-print-queue", JSON.stringify(queue)); } catch (_) {}
  };

  const handleAddPrinter = async () => {
    if (!printerForm.name.trim() || !printerForm.ip.trim()) {
      gcAlert("Nom et adresse IP requis pour l'imprimante.");
      return;
    }
    const newPrinter = {
      id: `PRT-${Date.now()}`,
      ...printerForm,
      status: "DECONNECTEE",
    };
    savePrinters([newPrinter, ...printers]);
    setPrinterForm({
      name: "",
      ip: "",
      port: 9100,
      location: "",
      type: "Laser",
      protocol: "TCP/IP",
      format: "A4",
      dpi: 300,
      color: true,
      duplex: false,
      shared: false,
    });
    setShowAddPrinter(false);
    addSessionLog && addSessionLog("CREATION", currentUser, { status: "SUCCESS", reason: `Ajout imprimante : ${newPrinter.name}` });
  };

  const handleTestConnection = async (printer) => {
    setTestPage({ printer, status: "testing" });
    await new Promise(resolve => setTimeout(resolve, 1200));
    const success = printer.status === "CONNECTEE";
    setTestPage({
      printer,
      status: success ? "success" : "failed",
      message: success ? `Connexion à ${printer.name} réussie.` : `Impossible de joindre ${printer.name}. Vérifiez l'adresse IP et le port.`,
    });
  };

  const handlePrint = async () => {
    if (!selectedPrinter) {
      gcAlert("Sélectionnez d'abord une imprimante.");
      return;
    }
    if (selectedPrinter.status !== "CONNECTEE") {
      gcAlert("L'imprimante doit être connectée pour imprimer.");
      return;
    }
    const job = {
      id: `JOB-${Date.now()}`,
      printer: selectedPrinter.id,
      name: `${selectedPrinter.name} - Impression`,
      pages: Math.max(1, printSettings.copies),
      copies: printSettings.copies,
      status: "EN_ATTENTE",
      addedAt: new Date().toISOString(),
    };
    const updatedQueue = [job, ...printQueue];
    savePrintQueue(updatedQueue);
    setTimeout(() => savePrintQueue(updatedQueue.map(p => p.id === job.id ? { ...p, status: "IMPRIME" } : p)), 3000);
    addSessionLog && addSessionLog("IMPRESSION", currentUser, { status: "SUCCESS", reason: `Impression sur ${selectedPrinter.name} · ${job.pages} page(s) · ${job.copies} copie(s)` });
    gcAlert(`🖨️ Impression envoyée à ${selectedPrinter.name}\n${job.pages} pages · ${job.copies} copie(s)`);
  };

  const STATUS_PRT = {
    CONNECTEE:    { label:"Connectée",    color:"#22C55E", icon:"🟢" },
    HORS_LIGNE:   { label:"Hors ligne",   color:"#EF4444", icon:"🔴" },
    DECONNECTEE:  { label:"Déconnectée",  color:"#F59E0B", icon:"🟡" },
    EN_PAUSE:     { label:"En pause",     color:"#A855F7", icon:"⏸️" },
  };

  return (
    <div className="gc-fade-in">
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:"linear-gradient(135deg,#C9A84C,#92400E)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🖨️</div>
          <div>
            <h3 style={{ color:T.text, margin:0, fontSize:15, fontWeight:800 }}>Configuration Imprimante Réseau</h3>
            <div style={{ color:T.textMuted, fontSize:11 }}>{printers.length} imprimante(s) configurée(s) · {printers.filter(p=>p.status==="CONNECTEE").length} en ligne</div>
          </div>
        </div>
        <Btn variant="primary" size="sm" onClick={()=>setShowAddPrinter(true)}>🖨️ Ajouter imprimante</Btn>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Printer List */}
        <div>
          <h4 style={{ color:T.text, margin:"0 0 12px", fontSize:13, fontWeight:700 }}>🖨️ Imprimantes réseau</h4>
          {printers.map(p => {
            const ps = STATUS_PRT[p.status] || STATUS_PRT.DECONNECTEE;
            const isSelected = selectedPrinter?.id === p.id;
            return (
              <div key={p.id} onClick={()=>setSelectedPrinter(p)}
                style={{ background:isSelected?`${ps.color}15`:T.surface2, border:`2px solid ${isSelected?ps.color:T.border}`, borderRadius:12, padding:14, marginBottom:10, cursor:"pointer", transition:"all 0.2s" }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                  <div style={{ fontSize:28 }}>🖨️</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ color:T.text, fontWeight:700, fontSize:13 }}>{p.name}</div>
                      <span style={{ background:ps.color+"22", border:`1px solid ${ps.color}44`, color:ps.color, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{ps.icon} {ps.label}</span>
                    </div>
                    <div style={{ color:T.textMuted, fontSize:11, marginTop:3 }}>{p.type} · {p.location}</div>
                    <div style={{ color:T.textDim, fontSize:10, fontFamily:"monospace", marginTop:2 }}>{p.ip}:{p.port} · {p.protocol}</div>
                    <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
                      {[
                        p.color ? "🎨 Couleur" : "⬛ N&B",
                        p.duplex ? "🔄 Recto-verso" : "📄 Recto",
                        `📐 ${p.format}`,
                        `🔬 ${p.dpi} DPI`,
                        p.shared ? "🌐 Partagée" : "🔒 Locale",
                      ].map(tag => (
                        <span key={tag} style={{ background:T.surface3, border:`1px solid ${T.border}`, borderRadius:20, padding:"2px 8px", fontSize:9, color:T.textMuted }}>{tag}</span>
                      ))}
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:10 }}>
                      <button onClick={(e)=>{e.stopPropagation();handleTestConnection(p);}} style={{ background:"#3B82F622", border:"1px solid #3B82F644", color:"#3B82F6", borderRadius:6, padding:"4px 12px", cursor:"pointer", fontSize:11, fontWeight:700 }}>📡 Tester</button>
                      <button onClick={(e)=>{e.stopPropagation();const newStatus=p.status==="CONNECTEE"?"EN_PAUSE":"CONNECTEE";savePrinters(printers.map(x=>x.id===p.id?{...x,status:newStatus}:x));}} style={{ background:"#F59E0B22", border:"1px solid #F59E0B44", color:"#F59E0B", borderRadius:6, padding:"4px 12px", cursor:"pointer", fontSize:11, fontWeight:700 }}>
                        {p.status==="CONNECTEE"?"⏸️ Pause":"▶️ Activer"}
                      </button>
                      <button onClick={async (e) => {e.stopPropagation();if(await gcConfirm("Supprimer cette imprimante ?"))savePrinters(printers.filter(x=>x.id!==p.id));}} style={{ background:"#EF444422", border:"1px solid #EF444444", color:"#EF4444", borderRadius:6, padding:"4px 12px", cursor:"pointer", fontSize:11, fontWeight:700 }}>🗑️</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Print Panel */}
        <div>
          {/* Print Settings */}
          <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
            <h4 style={{ color:T.text, margin:"0 0 14px", fontSize:13, fontWeight:700 }}>⚙️ Paramètres d'impression</h4>
            {selectedPrinter ? (
              <div style={{ background:selectedPrinter ? (STATUS_PRT[selectedPrinter.status]?.color||"#3B82F6")+"15" : T.surface3, border:`1px solid ${(STATUS_PRT[selectedPrinter?.status]?.color||T.border)}33`, borderRadius:8, padding:"8px 12px", marginBottom:12, fontSize:11, color:T.text }}>
                🖨️ <strong>{selectedPrinter.name}</strong> — <span style={{color:STATUS_PRT[selectedPrinter.status]?.color}}>{STATUS_PRT[selectedPrinter.status]?.label}</span>
              </div>
            ) : (
              <div style={{ background:T.surface3, borderRadius:8, padding:"8px 12px", marginBottom:12, fontSize:11, color:T.textMuted }}>⬅️ Sélectionnez une imprimante</div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                { label:"Copies", type:"number", key:"copies", min:1, max:99 },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>{f.label}</label>
                  <input type={f.type} value={printSettings[f.key]} min={f.min} max={f.max}
                    onChange={e=>setPrintSettings(prev=>({...prev,[f.key]:Number(e.target.value)}))}
                    style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 10px", color:T.text, fontSize:12, boxSizing:"border-box" }} />
                </div>
              ))}
              {[
                { label:"Format", key:"format", opts:["A4","A3","A5","Letter","Legal"] },
                { label:"Orientation", key:"orientation", opts:["portrait","landscape"] },
                { label:"Faces", key:"sides", opts:["recto","recto-verso"] },
                { label:"Qualité", key:"quality", opts:["brouillon","normal","haute"] },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>{f.label}</label>
                  <select value={printSettings[f.key]} onChange={e=>setPrintSettings(prev=>({...prev,[f.key]:e.target.value}))}
                    style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 10px", color:T.text, fontSize:12 }}>
                    {f.opts.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ gridColumn:"span 2", display:"flex", alignItems:"center", gap:10 }}>
                <input type="checkbox" id="print-color" checked={printSettings.color} onChange={e=>setPrintSettings(prev=>({...prev,color:e.target.checked}))} />
                <label htmlFor="print-color" style={{ color:T.text, fontSize:12, cursor:"pointer" }}>🎨 Impression couleur</label>
              </div>
            </div>
            <Btn variant="primary" style={{ width:"100%", marginTop:14, justifyContent:"center" }} onClick={handlePrint} disabled={!selectedPrinter || selectedPrinter.status!=="CONNECTEE"}>
              🖨️ Envoyer à l'imprimante
            </Btn>
          </div>

          {/* Print Queue */}
          <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:16 }}>
            <h4 style={{ color:T.text, margin:"0 0 12px", fontSize:13, fontWeight:700 }}>📋 File d'impression ({printQueue.length})</h4>
            {printQueue.length === 0 && <div style={{ textAlign:"center", color:T.textMuted, fontSize:12, padding:"20px 0" }}>✅ Aucun travail en attente</div>}
            {printQueue.slice(0,10).map(job => {
              const prt = printers.find(p=>p.id===job.printer);
              const statusCfg = { EN_ATTENTE:{ color:"#F59E0B", icon:"⏳" }, IMPRIME:{ color:"#22C55E", icon:"✅" }, ERREUR:{ color:"#EF4444", icon:"❌" } };
              const sc = statusCfg[job.status] || statusCfg.EN_ATTENTE;
              return (
                <div key={job.id} style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 12px", background:T.surface3, borderRadius:8, border:`1px solid ${T.border}`, marginBottom:6 }}>
                  <span style={{ fontSize:16 }}>📄</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:T.text, fontSize:11, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.name}</div>
                    <div style={{ color:T.textDim, fontSize:9 }}>{prt?.name||job.printer} · {job.pages}p · {job.copies}x · {job.addedAt?.slice(0,16)?.replace("T"," ")}</div>
                  </div>
                  <span style={{ background:sc.color+"22", border:`1px solid ${sc.color}44`, color:sc.color, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{sc.icon} {job.status.replace("_"," ")}</span>
                  {job.status==="EN_ATTENTE" && <button onClick={()=>setPrintQueue(prev=>prev.filter(p=>p.id!==job.id))} style={{ background:"#EF444422", border:"1px solid #EF444444", color:"#EF4444", borderRadius:5, padding:"3px 7px", cursor:"pointer", fontSize:11 }}>✕</button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Test connection result */}
      {testPage && (
        <div style={{ position:"fixed", inset:0, background:"#000C", zIndex:5000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setTestPage(null)}>
          <div className="gc-modal-in" style={{ background:T.surface, border:`2px solid ${testPage.status==="success"?"#22C55E":testPage.status==="failed"?"#EF4444":"#3B82F6"}44`, borderRadius:16, padding:32, textAlign:"center", width:400 }} onClick={e=>e.stopPropagation()}>
            {testPage.status === "testing" && <><div className="gc-pulse-scale" style={{fontSize:48,marginBottom:16}}>📡</div><div style={{color:T.text,fontSize:15,fontWeight:700}}>Test de connexion en cours…</div><div style={{color:T.textMuted,fontSize:12,marginTop:6}}>{testPage.printer.ip}:{testPage.printer.port}</div></>}
            {testPage.status !== "testing" && <><div style={{fontSize:48,marginBottom:16}}>{testPage.status==="success"?"✅":"❌"}</div><div style={{color:T.text,fontSize:15,fontWeight:700,marginBottom:8}}>{testPage.message}</div><Btn variant={testPage.status==="success"?"success":"danger"} onClick={()=>setTestPage(null)}>Fermer</Btn></>}
          </div>
        </div>
      )}

      {/* Add Printer Modal */}
      {showAddPrinter && (
        <div style={{ position:"fixed", inset:0, background:"#000A", zIndex:5000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setShowAddPrinter(false)}>
          <div className="gc-modal-in" style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:28, width:480, boxShadow:"0 32px 80px #000A" }} onClick={e=>e.stopPropagation()}>
            <h3 style={{ color:"#C41E3A", margin:"0 0 16px", fontWeight:800 }}>🖨️ Ajouter une imprimante réseau</h3>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div style={{ gridColumn:"span 2" }}><InputField label="Nom de l'imprimante *" value={printerForm.name} onChange={e=>setPrinterForm(f=>({...f,name:e.target.value}))} T={T} placeholder="Ex: HP LaserJet Pro M428" /></div>
              <InputField label="Adresse IP *" value={printerForm.ip} onChange={e=>setPrinterForm(f=>({...f,ip:e.target.value}))} T={T} placeholder="192.168.1.xxx" />
              <InputField label="Port" value={printerForm.port} onChange={e=>setPrinterForm(f=>({...f,port:Number(e.target.value)}))} T={T} placeholder="9100" />
              <InputField label="Emplacement" value={printerForm.location} onChange={e=>setPrinterForm(f=>({...f,location:e.target.value}))} T={T} placeholder="Ex: Bureau Direction" />
              <div>
                <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>Type</label>
                <select value={printerForm.type} onChange={e=>setPrinterForm(f=>({...f,type:e.target.value}))} style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 10px", color:T.text, fontSize:12 }}>
                  {["Laser","Jet d'encre","Thermique","Matricielle","Sublimation"].map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>Protocole</label>
                <select value={printerForm.protocol} onChange={e=>setPrinterForm(f=>({...f,protocol:e.target.value}))} style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 10px", color:T.text, fontSize:12 }}>
                  {["TCP/IP","IPP","LPD/LPR","SMB/Windows","AirPrint","Google Cloud Print"].map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>Format papier</label>
                <select value={printerForm.format} onChange={e=>setPrinterForm(f=>({...f,format:e.target.value}))} style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 10px", color:T.text, fontSize:12 }}>
                  {["A4","A3","A5","Letter","Legal"].map(f=><option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>Résolution (DPI)</label>
                <select value={printerForm.dpi} onChange={e=>setPrinterForm(f=>({...f,dpi:Number(e.target.value)}))} style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 10px", color:T.text, fontSize:12 }}>
                  {[300,600,1200,2400,4800].map(d=><option key={d} value={d}>{d} DPI</option>)}
                </select>
              </div>
              <div style={{ gridColumn:"span 2", display:"flex", gap:16 }}>
                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", color:T.text, fontSize:12 }}><input type="checkbox" checked={printerForm.color} onChange={e=>setPrinterForm(f=>({...f,color:e.target.checked}))} /> 🎨 Impression couleur</label>
                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", color:T.text, fontSize:12 }}><input type="checkbox" checked={printerForm.duplex} onChange={e=>setPrinterForm(f=>({...f,duplex:e.target.checked}))} /> 🔄 Recto-verso</label>
                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", color:T.text, fontSize:12 }}><input type="checkbox" checked={printerForm.shared} onChange={e=>setPrinterForm(f=>({...f,shared:e.target.checked}))} /> 🌐 Partagée réseau</label>
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <Btn variant="primary" size="sm" onClick={handleAddPrinter}>✅ Ajouter l'imprimante</Btn>
              <Btn variant="ghost" size="sm" onClick={()=>setShowAddPrinter(false)}>Annuler</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── DossierDetailModal : composant extrait hors SIApp pour éviter les hooks conditionnels ──