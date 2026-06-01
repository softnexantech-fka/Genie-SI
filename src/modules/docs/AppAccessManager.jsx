import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// AppAccessManager.jsx — SI Génie Consultant v127
import { _noop, gcCopy, _activeUser } from '../../core/index.js';
import { PROCESS_ACTIVITIES, _APP_LIST_FOR_MGT } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';


const generatePromoCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "GC-";
  for (let i=0;i<4;i++) c += chars[Math.floor(Math.random()*chars.length)];
  return c + "-" + [...Array(4)].map(()=>chars[Math.floor(Math.random()*chars.length)]).join("");
};


export function AppAccessManager({ T, users=[], currentUser, appHabilitations=[], setAppHabilitations=_noop, appAccessCodes=[], setAppAccessCodes=_noop, setNotifications=_noop, appId=null, appLabel=null, appColor=null }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const [tab, setTab] = useState("accorder");
  const [revokeSearch, setRevokeSearch] = useState("");
  const [revokeApp, setRevokeApp] = useState(appId || "ALL");
  const [accessType, setAccessType] = useState("provisoire");     // "provisoire" | "permanent"
  const [targetMode, setTargetMode] = useState("users");          // "users" | "process" | "universal"
  // FIX v150 — si ouvert depuis une app spécifique, pré-sélectionner cette app
  const [selectedApps, setSelectedApps] = useState(appId ? [appId] : ["finance"]);
  const [selectedUsers, setSelectedUsers] = useState([]);         // multi-select user ids
  const [selectedProcs, setSelectedProcs] = useState([]);         // multi-select process codes
  const [duration, setDuration] = useState(60);
  const [formNote, setFormNote] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState([]);       // last batch of codes generated

  const PROC_LIST = Object.entries(PROCESS_ACTIVITIES).map(([code, d]) => ({
    code, label: d.label, icon: d.icon || "🗂️", color: d.color || "#3B82F6"
  }));

  const getUsersForProcess = (procCode) =>
    users.filter(u => _activeUser(u)&&!u.isAdmin && (u.process === procCode || (u.processes||[]).includes(procCode)));

  const resolveTargetUserIds = () => {
    if (targetMode === "universal") return ["ALL"];
    if (targetMode === "users") return selectedUsers.length ? selectedUsers : [];
    if (targetMode === "process") {
      const ids = new Set();
      selectedProcs.forEach(pc => getUsersForProcess(pc).forEach(u => ids.add(u.id)));
      return [...ids];
    }
    return [];
  };

  const toggleApp = (id) => setSelectedApps(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const toggleUser = (id) => setSelectedUsers(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const toggleProc = (code) => setSelectedProcs(prev => prev.includes(code) ? prev.filter(x=>x!==code) : [...prev, code]);
  const selectAllUsers = () => setSelectedUsers(users.filter(u=>_activeUser(u)&&!u.isAdmin).map(u=>u.id));
  const clearUsers = () => setSelectedUsers([]);
  const selectAllProcs = () => setSelectedProcs(PROC_LIST.map(p=>p.code));
  const clearProcs = () => setSelectedProcs([]);

  const handleGrant = () => {
    const targetIds = resolveTargetUserIds();
    if (targetIds.length === 0 && targetMode !== "universal") {
      gcAlert("Sélectionnez au moins un bénéficiaire (utilisateur, processus ou universel).");
      return;
    }
    if (selectedApps.length === 0) {
      gcAlert("Sélectionnez au moins une application.");
      return;
    }

    const now = new Date();
    const newCodes = [];
    const newHabs = [];

    if (accessType === "provisoire") {
      selectedApps.forEach(appId => {
        const code = generatePromoCode();
        const expiresAt = duration > 0 ? new Date(now.getTime() + duration * 60000).toISOString() : null;
        const targetLabel = targetMode === "universal"
          ? "Universel"
          : targetMode === "users"
            ? `${targetIds.length} utilisateur(s)`
            : `Processus : ${selectedProcs.join(", ")} (${targetIds.length} membres)`;
        const entry = {
          id: "CODE-"+Date.now()+"-"+appId, code, appId,
          targetMode, targetIds,
          processIds: targetMode === "process" ? selectedProcs : [],
          targetLabel,
          createdBy: currentUser.id, createdByName: currentUser.name,
          createdAt: now.toISOString(), expiresAt, active: true,
          note: formNote, duration, type: "PROVISOIRE"
        };
        newCodes.push(entry);
      });
      setAppAccessCodes(prev => [...newCodes, ...prev]);
      setGeneratedCodes(newCodes);
      const appNames = selectedApps.map(id => _APP_LIST_FOR_MGT.find(a=>a.id===id)?.label||id).join(", ");
      setNotifications(p => [{
        id:"N"+Date.now(), icon:"🔑",
        message:`${newCodes.length} code(s) provisoire(s) générés — Apps: ${appNames} — ${newCodes[0]?.targetLabel||""} — ${duration>0?duration+" min":"∞"}`,
        at:now.toISOString(), read:false
      },...p]);

    } else {
      let skipped = 0;
      const effectiveIds = targetIds.length ? targetIds : ["ALL"];
      effectiveIds.forEach(uid => {
        selectedApps.forEach(appId => {
          const dup = appHabilitations.find(h => h.userId===uid && h.appId===appId && h.active);
          if (dup) { skipped++; return; }
          const targetUser = uid === "ALL" ? null : users.find(u=>u.id===uid);
          const hab = {
            id: "HAB-"+Date.now()+Math.random().toString(36).slice(2,6),
            appId, userId: uid,
            userName: uid==="ALL" ? "Tous les utilisateurs" : (targetUser?.name || uid),
            processIds: targetMode==="process" ? selectedProcs : [],
            targetMode,
            createdBy: currentUser.id, createdByName: currentUser.name,
            createdAt: now.toISOString(), active: true, note: formNote, type: "PERMANENT"
          };
          newHabs.push(hab);
        });
      });
      if (newHabs.length === 0) { gcAlert(`⚠️ Toutes les habilitations existent déjà (${skipped} doublons ignorés).`); return; }
      setAppHabilitations(prev => [...newHabs, ...prev]);
      setGeneratedCodes([]);
      const appNames = selectedApps.map(id=>_APP_LIST_FOR_MGT.find(a=>a.id===id)?.label||id).join(", ");
      setNotifications(p => [{
        id:"N"+Date.now(), icon:"🏅",
        message:`${newHabs.length} habilitation(s) permanente(s) accordée(s) — Apps: ${appNames}${skipped?" ("+skipped+" doublons ignorés)":""}`,
        at:now.toISOString(), read:false
      },...p]);
      gcAlert("✅ "+newHabs.length+" habilitation(s) accordée(s)"+(skipped?"\n⚠️ "+skipped+" doublon(s) ignoré(s).":""));
    }
  };

  const revokeCode = (id) => setAppAccessCodes(prev => prev.map(c => c.id===id?{...c,active:false,revokedAt:new Date().toISOString(),revokedBy:currentUser.name}:c));
  const deleteCode = (id) => setAppAccessCodes(prev => prev.filter(c => c.id!==id));
  const revokeHab  = (id) => setAppHabilitations(prev => prev.map(h => h.id===id?{...h,active:false,revokedAt:new Date().toISOString(),revokedBy:currentUser.name}:h));
  const restoreHab = (id) => setAppHabilitations(prev => prev.map(h => h.id===id?{...h,active:true,revokedAt:null,revokedBy:null,restoredAt:new Date().toISOString(),restoredBy:currentUser.name}:h));
  const deleteHab  = (id) => setAppHabilitations(prev => prev.filter(h => h.id!==id));

  const nowMs = Date.now();
  const activeCodes   = appAccessCodes.filter(c => c.active && (!c.expiresAt || new Date(c.expiresAt).getTime() > nowMs));
  const expiredCodes  = appAccessCodes.filter(c => !c.active || (c.expiresAt && new Date(c.expiresAt).getTime() <= nowMs));
  const activeHabs    = appHabilitations.filter(h => h.active);
  const revokedHabs   = appHabilitations.filter(h => !h.active);

  const previewTargets = () => {
    if (targetMode === "universal") return [{label:"🌐 Tous les utilisateurs", color:"#8B5CF6"}];
    if (targetMode === "users") return selectedUsers.map(id => {
      const u = users.find(x=>x.id===id);
      return {label: u ? `👤 ${u.name}` : id, color:"#3B82F6"};
    });
    if (targetMode === "process") return selectedProcs.map(code => {
      const p = PROC_LIST.find(x=>x.code===code);
      const cnt = getUsersForProcess(code).length;
      return {label:`${p?.icon||"🗂️"} ${code} — ${p?.label?.split(" ").slice(0,2).join(" ")||code} (${cnt} membres)`, color: p?.color||"#3B82F6"};
    });
    return [];
  };
  const targets = previewTargets();
  const totalBeneficiaries = targetMode==="universal" ? users.filter(u=>_activeUser(u)&&!u.isAdmin).length : resolveTargetUserIds().length;

  const PILL_BTN = (active, onClick, children, color="#C9A84C") => (
    <button onClick={onClick} style={{background:active?color+"22":T.surface3,border:`1px solid ${active?color:T.border}`,color:active?color:T.textMuted,borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:11,fontWeight:active?800:400,transition:"all 0.15s"}}>{children}</button>
  );

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16}}>
        <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#C9A84C,#E8B84B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🔑</div>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>Gestion des Accès Applications</div>
          <div style={{color:T.textMuted,fontSize:11}}>Codes provisoires · Habilitations permanentes · Niveaux 5 & 6 — Multi-sélection utilisateurs & processus</div>
        </div>
      </div>

      {/* Main tabs */}
      <div style={{display:"flex",gap:6,marginBottom:18,borderBottom:`1px solid ${T.border}`,paddingBottom:10,flexWrap:"wrap"}}>
        {[
          {id:"accorder",   label:"⚡ Accorder l'accès",                         color:"#C9A84C"},
          {id:"actifs",     label:`✅ Actifs (${activeCodes.length}c · ${activeHabs.length}h)`, color:"#22C55E"},
          {id:"revocation", label:"🔒 Gestion révocations",                       color:"#EF4444"},
          {id:"historique", label:`📋 Historique (${expiredCodes.length+revokedHabs.length})`, color:"#6B7280"},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:tab===t.id?t.color+"22":T.surface2,border:`1px solid ${tab===t.id?t.color:T.border}`,color:tab===t.id?t.color:T.textMuted,borderRadius:9,padding:"8px 16px",cursor:"pointer",fontWeight:tab===t.id?800:400,fontSize:11}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ ACCORDER L'ACCÈS ══ */}
      {tab==="accorder" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:16}}>
          {/* LEFT: Form */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* Step 1 — Access type */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
              <div style={{color:T.textMuted,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>① Type d'accès</div>
              <div style={{display:"flex",gap:8}}>
                {PILL_BTN(accessType==="provisoire",()=>setAccessType("provisoire"),"🔐 Provisoire (code temporaire)","#F59E0B")}
                {PILL_BTN(accessType==="permanent",()=>setAccessType("permanent"),"🏅 Permanent (habilitation)","#C9A84C")}
              </div>
              {accessType==="provisoire" && (
                <div style={{marginTop:12,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <label style={{color:T.textMuted,fontSize:11}}>Durée de validité :</label>
                  {[15,30,60,120,480,1440,0].map(d=>(
                    PILL_BTN(duration===d,()=>setDuration(d), d===0?"∞ Illimité":`${d<60?d+"min":d/60+"h"}`,"#F59E0B")
                  ))}
                  <input type="number" value={duration} onChange={e=>setDuration(Number(e.target.value))} min={0} max={9999}
                    style={{width:80,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 8px",color:T.text,fontSize:11}} placeholder="min"/>
                </div>
              )}
              {accessType==="permanent" && (
                <div style={{marginTop:10,background:"#F59E0B12",border:"1px solid #F59E0B33",borderRadius:8,padding:"8px 12px",fontSize:10,color:T.textMuted}}>
                  ⚠️ Une habilitation permanente autorise l'accès sans limite de durée jusqu'à révocation explicite.
                </div>
              )}
            </div>

            {/* Step 2 — Applications */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
              <div style={{color:T.textMuted,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
                ② Applications concernées
                <span style={{color:selectedApps.length?"#C9A84C":T.textDim,marginLeft:8,fontWeight:700,fontSize:10}}>({selectedApps.length} sélectionnée{selectedApps.length>1?"s":""})</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {[..._APP_LIST_FOR_MGT, {id:"ALL",icon:"🌐",label:"Toutes les apps"}].map(a=>{
                  const sel = selectedApps.includes(a.id);
                  return (
                    <button key={a.id} onClick={()=>toggleApp(a.id)}
                      style={{background:sel?"#C9A84C22":T.surface3,border:`1px solid ${sel?"#C9A84C":T.border}`,color:sel?"#C9A84C":T.textMuted,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:sel?800:400,display:"flex",alignItems:"center",gap:5}}>
                      {a.icon} {a.label}
                      {sel && <span style={{color:"#C9A84C",fontWeight:900}}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3 — Target mode */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
              <div style={{color:T.textMuted,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>③ Bénéficiaires</div>
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                {PILL_BTN(targetMode==="users",()=>{setTargetMode("users");setSelectedProcs([]);},"👤 Utilisateurs spécifiques","#3B82F6")}
                {PILL_BTN(targetMode==="process",()=>{setTargetMode("process");setSelectedUsers([]);},"🗂️ Par processus (tous membres)","#8B5CF6")}
                {PILL_BTN(targetMode==="universal",()=>{setTargetMode("universal");setSelectedUsers([]);setSelectedProcs([]);},"🌐 Universel (tous)","#EF4444")}
              </div>

              {/* Users multi-select */}
              {targetMode==="users" && (
                <div>
                  <div style={{display:"flex",gap:6,marginBottom:8}}>
                    <button onClick={selectAllUsers} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>Tous</button>
                    <button onClick={clearUsers} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10}}>Aucun</button>
                    <span style={{color:T.textDim,fontSize:10,alignSelf:"center"}}>{selectedUsers.length} sélectionné(s)</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:5,maxHeight:220,overflowY:"auto",paddingRight:4}}>
                    {users.filter(u=>_activeUser(u)&&!u.isAdmin).map(u => {
                      const sel = selectedUsers.includes(u.id);
                      return (
                        <div key={u.id} onClick={()=>toggleUser(u.id)}
                          style={{background:sel?"#3B82F622":T.surface3,border:`1px solid ${sel?"#3B82F6":T.border}`,borderRadius:8,padding:"7px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all 0.1s"}}>
                          <div style={{width:14,height:14,borderRadius:3,background:sel?"#3B82F6":T.surface2,border:`1.5px solid ${sel?"#3B82F6":T.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            {sel && <span style={{color:"#fff",fontSize:9,lineHeight:1}}>✓</span>}
                          </div>
                          <div style={{width:24,height:24,borderRadius:"50%",background:u.color||"#3B82F6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,flexShrink:0,overflow:"hidden"}}>{u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar||u.name[0]}</div>
                          <div style={{minWidth:0}}>
                            <div style={{color:T.text,fontSize:11,fontWeight:sel?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div>
                            <div style={{color:T.textDim,fontSize:9}}>{u.process} · Niv.{u.level}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Process multi-select */}
              {targetMode==="process" && (
                <div>
                  <div style={{display:"flex",gap:6,marginBottom:8}}>
                    <button onClick={selectAllProcs} style={{background:"#8B5CF622",border:"1px solid #8B5CF644",color:"#8B5CF6",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>Tous</button>
                    <button onClick={clearProcs} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10}}>Aucun</button>
                    <span style={{color:T.textDim,fontSize:10,alignSelf:"center"}}>{selectedProcs.length} processus — {resolveTargetUserIds().length} membres</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:6,maxHeight:260,overflowY:"auto",paddingRight:4}}>
                    {PROC_LIST.map(p => {
                      const sel = selectedProcs.includes(p.code);
                      const membersCount = getUsersForProcess(p.code).length;
                      return (
                        <div key={p.code} onClick={()=>toggleProc(p.code)}
                          style={{background:sel?p.color+"22":T.surface3,border:`1.5px solid ${sel?p.color:T.border}`,borderRadius:10,padding:"9px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"all 0.1s"}}>
                          <div style={{width:14,height:14,borderRadius:3,background:sel?p.color:T.surface2,border:`1.5px solid ${sel?p.color:T.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            {sel && <span style={{color:"#fff",fontSize:9,lineHeight:1}}>✓</span>}
                          </div>
                          <span style={{fontSize:16,flexShrink:0}}>{p.icon}</span>
                          <div style={{minWidth:0}}>
                            <div style={{color:sel?p.color:T.text,fontWeight:sel?800:500,fontSize:11,lineHeight:1.2}}>{p.code} · {p.label.split("&")[0].trim()}</div>
                            <div style={{color:T.textDim,fontSize:9,marginTop:2}}>
                              {membersCount > 0 ? `👥 ${membersCount} membre(s)` : "Aucun membre"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {targetMode==="universal" && (
                <div style={{background:"#EF444415",border:"1px solid #EF444444",borderRadius:9,padding:"12px 14px",color:"#EF4444",fontSize:12,fontWeight:600}}>
                  ⚠️ L'accès universel s'applique à <strong>tous les utilisateurs du SI</strong> ({users.filter(u=>_activeUser(u)&&!u.isAdmin).length} collaborateurs). Utiliser avec discernement.
                </div>
              )}
            </div>

            {/* Note / Motif */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
              <div style={{color:T.textMuted,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>④ Motif / Justification</div>
              <textarea value={formNote} onChange={e=>setFormNote(e.target.value)} rows={2}
                placeholder="Ex: Accès temporaire audit Q1 — Mission externe — Délégation DG…"
                style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",color:T.text,fontSize:12,resize:"none",boxSizing:"border-box"}}/>
            </div>

            {/* Grant button */}
            <button onClick={handleGrant}
              style={{background:`linear-gradient(135deg,#C9A84C,#E8B84B)`,border:"none",color:"#000",borderRadius:10,padding:"14px",cursor:"pointer",fontWeight:900,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {accessType==="provisoire"?"🔑 Générer les codes":"🏅 Accorder les habilitations"}
              {selectedApps.length>0 && <span style={{background:"rgba(0,0,0,0.15)",borderRadius:6,padding:"2px 8px",fontSize:11}}>
                {selectedApps.length} app{selectedApps.length>1?"s":""} · {targetMode==="universal"?"Universel":`${totalBeneficiaries} bénéficiaire${totalBeneficiaries>1?"s":""}`}
              </span>}
            </button>
          </div>

          {/* RIGHT: Preview + Generated codes */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Preview card */}
            <div style={{background:T.surface2,border:`2px solid #C9A84C44`,borderRadius:14,padding:16}}>
              <div style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:12}}>📋 Récapitulatif</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                  <span style={{color:T.textMuted}}>Type</span>
                  <span style={{color:accessType==="provisoire"?"#F59E0B":"#22C55E",fontWeight:700}}>{accessType==="provisoire"?"🔐 Provisoire":"🏅 Permanent"}</span>
                </div>
                {accessType==="provisoire" && (
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                    <span style={{color:T.textMuted}}>Durée</span>
                    <span style={{color:T.text,fontWeight:700}}>{duration>0?`${duration<60?duration+"min":duration/60+"h"}`:"Illimitée"}</span>
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                  <span style={{color:T.textMuted}}>Applications</span>
                  <span style={{color:"#C9A84C",fontWeight:700}}>{selectedApps.length ? selectedApps.join(", ") : "—"}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                  <span style={{color:T.textMuted}}>Mode</span>
                  <span style={{color:T.text,fontWeight:600}}>{targetMode==="users"?"👤 Utilisateurs":targetMode==="process"?"🗂️ Processus":"🌐 Universel"}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                  <span style={{color:T.textMuted}}>Bénéficiaires</span>
                  <span style={{color:"#22C55E",fontWeight:800}}>{targetMode==="universal"?"Tous":totalBeneficiaries || "—"}</span>
                </div>
              </div>
              {/* Target chips */}
              {targets.length > 0 && (
                <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:5}}>
                  {targets.slice(0,8).map((t,i) => (
                    <span key={i} style={{background:t.color+"22",border:`1px solid ${t.color}44`,color:t.color,borderRadius:20,padding:"2px 8px",fontSize:9,fontWeight:700}}>{t.label}</span>
                  ))}
                  {targets.length > 8 && <span style={{color:T.textDim,fontSize:9,alignSelf:"center"}}>+{targets.length-8} autres</span>}
                </div>
              )}
            </div>

            {/* Generated codes display */}
            {generatedCodes.length > 0 && (
              <div style={{background:"#22C55E12",border:"2px solid #22C55E44",borderRadius:14,padding:16}}>
                <div style={{color:"#22C55E",fontWeight:900,fontSize:12,marginBottom:12}}>✅ {generatedCodes.length} code(s) généré(s)</div>
                {generatedCodes.map(gc=>{
                  const app = _APP_LIST_FOR_MGT.find(a=>a.id===gc.appId);
                  return (
                    <div key={gc.id} style={{background:"#050D1A",borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                      <div style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",marginBottom:5}}>{app?.icon} {app?.label||gc.appId}</div>
                      <div style={{color:"#C9A84C",fontFamily:"monospace",fontSize:20,fontWeight:900,letterSpacing:3,textAlign:"center",marginBottom:6}}>{gc.code}</div>
                      <div style={{color:"#7A90B0",fontSize:9,textAlign:"center"}}>{gc.targetLabel} · {gc.expiresAt?`Expire: ${new Date(gc.expiresAt).toLocaleString("fr-FR")}`:"Sans expiration"}</div>
                      <button onClick={()=>gcCopy(gc.code)}
                        style={{marginTop:8,width:"100%",background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"6px",cursor:"pointer",fontWeight:700,fontSize:10}}>
                        📋 Copier
                      </button>
                    </div>
                  );
                })}
                <button onClick={()=>setGeneratedCodes([])}
                  style={{width:"100%",background:"none",border:"none",color:T.textDim,cursor:"pointer",fontSize:10,marginTop:4}}>Fermer</button>
              </div>
            )}

            {/* Quick stats */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
              <div style={{color:T.text,fontWeight:700,fontSize:11,marginBottom:10}}>📊 État des accès</div>
              {[
                {label:"Codes actifs",value:activeCodes.length,color:"#22C55E"},
                {label:"Habilitations actives",value:activeHabs.length,color:"#C9A84C"},
                {label:"Codes expirés",value:expiredCodes.length,color:"#6B7280"},
                {label:"Habilitations révoquées",value:revokedHabs.length,color:"#EF4444"},
              ].map(s=>(
                <div key={s.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}22`}}>
                  <span style={{color:T.textMuted,fontSize:11}}>{s.label}</span>
                  <span style={{color:s.color,fontWeight:800,fontSize:13}}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ GESTION RÉVOCATIONS ══ */}
      {tab==="revocation" && (() => {
        const activeUsers = users.filter(u => _activeUser(u) && !u.isAdmin);
        const q = revokeSearch.toLowerCase();
        // Construire la vue par utilisateur : habilitations actives + codes actifs
        const userAccessMap = activeUsers.map(u => {
          const habs = activeHabs.filter(h => h.userId===u.id || h.userId==="ALL" || (h.targetMode==="process" && (h.processIds||[]).some(p=>u.process===p||(u.processes||[]).includes(p))));
          const codes = activeCodes.filter(c => (c.targetIds||[]).includes(u.id) || (c.targetIds||[]).includes("ALL") || (c.targetMode==="process" && (c.processIds||[]).some(p=>u.process===p||(u.processes||[]).includes(p))));
          return {user:u, habs, codes, total: habs.length + codes.length};
        }).filter(x => x.total > 0 || !q);

        const filtered = userAccessMap.filter(x => {
          const matchQ = !q || x.user.name.toLowerCase().includes(q) || x.user.process.toLowerCase().includes(q);
          const matchApp = revokeApp==="ALL" || x.habs.some(h=>h.appId===revokeApp) || x.codes.some(c=>c.appId===revokeApp);
          return matchQ && matchApp;
        });

        const revokeAllForUser = async (u) => {
          if(!await gcConfirm(`Révoquer TOUS les accès accordés de ${u.name} ?\nHabilitations permanentes + codes actifs liés à cet utilisateur.`, "Révocation totale", "🔒", true)) return;
          setAppHabilitations(prev => prev.map(h =>
            (h.userId===u.id && h.active) ? {...h,active:false,revokedAt:new Date().toISOString(),revokedBy:currentUser.name} : h
          ));
          setAppAccessCodes(prev => prev.map(c =>
            ((c.targetIds||[]).includes(u.id) && c.active) ? {...c,active:false,revokedAt:new Date().toISOString(),revokedBy:currentUser.name} : c
          ));
          setNotifications(p=>[{id:"N"+Date.now(),icon:"🔒",message:`Accès révoqués pour ${u.name} par ${currentUser.name}`,at:new Date().toISOString(),read:false},...p]);
        };

        return (
          <div>
            {/* Filtres */}
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              <input value={revokeSearch} onChange={e=>setRevokeSearch(e.target.value)} placeholder="🔍 Rechercher un collaborateur ou processus..."
                style={{flex:1,minWidth:180,background:T.surface2,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"8px 12px",fontSize:11}}/>
              <select value={revokeApp} onChange={e=>setRevokeApp(e.target.value)}
                style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"8px 10px",fontSize:11}}>
                <option value="ALL">Toutes les apps</option>
                {_APP_LIST_FOR_MGT.map(a=><option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
              </select>
              <div style={{color:T.textMuted,fontSize:10}}>{filtered.length} utilisateur(s) avec accès accordés</div>
            </div>

            {/* Légende */}
            <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"}}>
              {[{c:"#C9A84C",l:"Habilitation permanente"},{c:"#22C55E",l:"Code provisoire actif"}].map(x=>(
                <div key={x.l} style={{display:"flex",gap:5,alignItems:"center"}}>
                  <div style={{width:10,height:10,borderRadius:3,background:x.c}}/>
                  <span style={{color:T.textDim,fontSize:10}}>{x.l}</span>
                </div>
              ))}
            </div>

            {filtered.length===0 && (
              <div style={{color:T.textDim,textAlign:"center",padding:40,background:T.surface2,borderRadius:12}}>
                Aucun accès accordé via habilitation ou code actif trouvé.
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {filtered.map(({user:u, habs, codes}) => (
                <div key={u.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:13,padding:"12px 16px"}}>
                  {/* En-tête utilisateur */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:36,height:36,borderRadius:9,background:u.color||"#3B82F6",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:"#fff",fontSize:13,flexShrink:0}}>{u.avatar||u.name?.[0]||"?"}</div>
                    <div style={{flex:1}}>
                      <div style={{color:T.text,fontWeight:800,fontSize:13}}>{u.name}</div>
                      <div style={{color:T.textMuted,fontSize:10}}>{u.role} · {u.process} · Niv.{u.level}</div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{background:"#EF444422",border:"1px solid #EF444433",color:"#EF4444",borderRadius:20,padding:"2px 8px",fontSize:9,fontWeight:700}}>{habs.length+codes.length} accès</span>
                      <button onClick={()=>revokeAllForUser(u)}
                        style={{background:"#EF4444",border:"none",color:"#fff",borderRadius:7,padding:"6px 10px",cursor:"pointer",fontWeight:700,fontSize:10}}>
                        🔒 Tout révoquer
                      </button>
                    </div>
                  </div>

                  {/* Liste des accès */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {habs.map(h => {
                      const app = _APP_LIST_FOR_MGT.find(a=>a.id===h.appId);
                      return (
                        <div key={h.id} style={{display:"flex",alignItems:"center",gap:5,background:"#C9A84C15",border:"1px solid #C9A84C44",borderRadius:8,padding:"4px 10px"}}>
                          <span style={{fontSize:13}}>{app?.icon||"🔑"}</span>
                          <div>
                            <div style={{color:"#C9A84C",fontWeight:700,fontSize:10}}>{app?.label||h.appId}</div>
                            <div style={{color:T.textDim,fontSize:8}}>Permanent · Par {h.createdByName}</div>
                          </div>
                          <button onClick={()=>revokeHab(h.id)}
                            style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:9,fontWeight:700,marginLeft:2}}>✕</button>
                        </div>
                      );
                    })}
                    {codes.map(c => {
                      const app = _APP_LIST_FOR_MGT.find(a=>a.id===c.appId);
                      const minsLeft = c.expiresAt ? Math.max(0,Math.round((new Date(c.expiresAt).getTime()-nowMs)/60000)) : null;
                      return (
                        <div key={c.id} style={{display:"flex",alignItems:"center",gap:5,background:"#22C55E15",border:"1px solid #22C55E44",borderRadius:8,padding:"4px 10px"}}>
                          <span style={{fontSize:13}}>{app?.icon||"🔑"}</span>
                          <div>
                            <div style={{color:"#22C55E",fontWeight:700,fontSize:10}}>{app?.label||c.appId}</div>
                            <div style={{color:T.textDim,fontSize:8}}>Code: <span style={{fontFamily:"monospace"}}>{c.code}</span> · {minsLeft!==null?`${minsLeft}min restant`:"∞"}</div>
                          </div>
                          <button onClick={()=>revokeCode(c.id)}
                            style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:9,fontWeight:700,marginLeft:2}}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Révocation globale par application */}
            <div style={{marginTop:20,background:"#EF444412",border:"1px solid #EF444433",borderRadius:12,padding:14}}>
              <div style={{color:"#EF4444",fontWeight:800,fontSize:12,marginBottom:10}}>⚡ Révocation globale par application</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {_APP_LIST_FOR_MGT.filter(a => activeHabs.some(h=>h.appId===a.id) || activeCodes.some(c=>c.appId===a.id)).map(a=>{
                  const cnt = activeHabs.filter(h=>h.appId===a.id).length + activeCodes.filter(c=>c.appId===a.id).length;
                  return (
                    <button key={a.id} onClick={async()=>{
                      if(!await gcConfirm(`Révoquer TOUS les accès accordés à "${a.label}" ?\n${cnt} accès seront révoqués.`,"Révocation globale","🔒",true)) return;
                      setAppHabilitations(prev=>prev.map(h=>h.appId===a.id&&h.active?{...h,active:false,revokedAt:new Date().toISOString(),revokedBy:currentUser.name}:h));
                      setAppAccessCodes(prev=>prev.map(c=>c.appId===a.id&&c.active?{...c,active:false,revokedAt:new Date().toISOString(),revokedBy:currentUser.name}:c));
                    }} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                      {a.icon} {a.label} ({cnt})
                    </button>
                  );
                })}
                {_APP_LIST_FOR_MGT.filter(a=>activeHabs.some(h=>h.appId===a.id)||activeCodes.some(c=>c.appId===a.id)).length===0&&(
                  <div style={{color:T.textDim,fontSize:11}}>Aucune app avec accès actifs accordés.</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ ACTIFS ══ */}
      {tab==="actifs" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {/* Active Codes */}
          <div>
            <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:10}}>🟢 Codes provisoires actifs ({activeCodes.length})</div>
            {activeCodes.length===0 && <div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:"24px 0",background:T.surface2,borderRadius:10}}>Aucun code actif</div>}
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {activeCodes.map(c=>{
                const app = _APP_LIST_FOR_MGT.find(a=>a.id===c.appId);
                const minsLeft = c.expiresAt ? Math.max(0,Math.round((new Date(c.expiresAt).getTime()-nowMs)/60000)) : null;
                return (
                  <div key={c.id} style={{background:T.surface2,border:`1px solid ${"#22C55E"}33`,borderRadius:11,padding:"10px 14px"}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:5}}>
                      <span style={{fontSize:15}}>{app?.icon||"🔑"}</span>
                      <div style={{flex:1}}>
                        <div style={{color:"#C9A84C",fontFamily:"monospace",fontWeight:900,fontSize:14,letterSpacing:2}}>{c.code}</div>
                        <div style={{color:T.textDim,fontSize:9}}>{app?.label||c.appId}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        {minsLeft!==null ? <span style={{color:minsLeft<30?"#EF4444":"#22C55E",fontWeight:700,fontSize:10}}>{minsLeft<60?`${minsLeft}min`:`${Math.round(minsLeft/60)}h`}</span> : <span style={{color:"#22C55E",fontSize:10}}>∞</span>}
                      </div>
                    </div>
                    <div style={{color:T.textDim,fontSize:9,marginBottom:7}}>{c.targetLabel||c.userId} · Par {c.createdByName}</div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>gcCopy(c.code)} style={{flex:1,background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:6,padding:"5px",cursor:"pointer",fontSize:9,fontWeight:700}}>📋 Copier</button>
                      <button onClick={()=>revokeCode(c.id)} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>Révoquer</button>
                      <button onClick={()=>deleteCode(c.id)} style={{background:"#EF444422",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:9}}>🗑️</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Habilitations */}
          <div>
            <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:10}}>🏅 Habilitations permanentes actives ({activeHabs.length})</div>
            {activeHabs.length===0 && <div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:"24px 0",background:T.surface2,borderRadius:10}}>Aucune habilitation active</div>}
            <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:500,overflowY:"auto"}}>
              {activeHabs.map(h=>{
                const app = _APP_LIST_FOR_MGT.find(a=>a.id===h.appId);
                const modeIcon = h.targetMode==="process"?"🗂️":h.userId==="ALL"?"🌐":"👤";
                return (
                  <div key={h.id} style={{background:T.surface2,border:`1px solid ${"#C9A84C"}33`,borderRadius:11,padding:"10px 14px",display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{width:34,height:34,borderRadius:8,background:"#C9A84C22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{app?.icon||"🔑"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{color:T.text,fontWeight:800,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{modeIcon} {h.userName}</span>
                        {h.processIds?.length>0 && <span style={{color:"#8B5CF6",fontSize:9,background:"#8B5CF622",border:"1px solid #8B5CF633",borderRadius:5,padding:"1px 5px",flexShrink:0}}>Proc: {h.processIds.join(", ")}</span>}
                      </div>
                      <div style={{color:"#C9A84C",fontSize:10,fontWeight:700}}>{app?.icon} {app?.label||h.appId}</div>
                      <div style={{color:T.textDim,fontSize:9}}>{h.createdByName} · {new Date(h.createdAt).toLocaleDateString("fr-FR")}</div>
                    </div>
                    <button onClick={()=>revokeHab(h.id)} style={{background:"#EF444422",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontWeight:700,fontSize:10,flexShrink:0}}>Révoquer</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ HISTORIQUE ══ */}
      {tab==="historique" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div>
            <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:10}}>🔴 Codes révoqués / expirés ({expiredCodes.length})</div>
            {expiredCodes.length===0 && <div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:"20px",background:T.surface2,borderRadius:10}}>Aucun historique</div>}
            {expiredCodes.slice(0,25).map(c=>(
              <div key={c.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"8px 12px",marginBottom:5,display:"flex",gap:8,alignItems:"center",opacity:0.7}}>
                <div style={{flex:1}}>
                  <div style={{color:T.textMuted,fontFamily:"monospace",fontSize:11,fontWeight:700}}>{c.code}</div>
                  <div style={{color:T.textDim,fontSize:9}}>{c.appId} · {c.targetLabel||c.userId} · {!c.active?"Révoqué":c.expiresAt&&new Date(c.expiresAt).getTime()<=nowMs?"Expiré":""}</div>
                </div>
                <button onClick={()=>deleteCode(c.id)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12}}>🗑️</button>
              </div>
            ))}
          </div>
          <div>
            <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:10}}>⛔ Habilitations révoquées ({revokedHabs.length})</div>
            {revokedHabs.length===0 && <div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:"20px",background:T.surface2,borderRadius:10}}>Aucune révocation</div>}
            {revokedHabs.slice(0,25).map(h=>(
              <div key={h.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"8px 12px",marginBottom:5,display:"flex",gap:8,alignItems:"center",opacity:0.75}}>
                <div style={{flex:1}}>
                  <div style={{color:T.textMuted,fontWeight:700,fontSize:11}}>{h.userName} → {h.appId}</div>
                  <div style={{color:T.textDim,fontSize:9}}>Révoquée le {h.revokedAt?new Date(h.revokedAt).toLocaleDateString("fr-FR"):"-"} par {h.revokedBy||"-"}</div>
                </div>
                <button onClick={()=>restoreHab(h.id)} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:9,fontWeight:700}}>↩ Restaurer</button>
                <button onClick={()=>deleteHab(h.id)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12}}>🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};



