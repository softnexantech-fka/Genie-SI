import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// CodificationPanel.jsx — SI Génie Consultant v127
import { formatDate, generateAccessCode, useSI, getUserProcess, _activeUser, formatDateTime, getProcColor, ALPHA_SEQ, GC_SEQ_ALPHA, gcSeqFromIndex } from '../../core/index.js';
import { CODES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge} from '../../components/UI.jsx';

export function CodificationPanel() {
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
    appHabilitations, setAppHabilitations, appAccessCodes, setAppAccessCodes,
  } = si;
  // FIX v126 — canCodifAll: règle métier au lieu d'IDs DEMO
  const canCodifAll = localUser.level >= 5 || (localUser?.isAdmin || localUser?.level >= 6) ||
    (localUser.level >= 4 && ["S02","P02","O01"].some(p => (localUser.processes||[localUser.process||""]).includes(p)));
  const userProcs = getUserProcess(localUser);
  const year = new Date().getFullYear();

  const [activeTab, setActiveTab] = useState(canCodifAll||localUser.level>=4 ? "generator" : "registry");
  const [type, setType] = useState("DOC");
  const [proc, setProc] = useState(canCodifAll ? "P01" : (userProcs[0] || "O01"));
  const [seqIndex, setSeqIndex] = useState(0);
  const [subproc, setSubproc] = useState("01");
  const [version, setVersion] = useState("v1.0");
  const [description, setDescription] = useState("");
  const [label, setLabel] = useState("");
  const registry = codifRegistry;
  const setRegistry = setCodifRegistry;
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFilter, setSearchFilter] = useState("ALL");
  const [lexique, setLexique] = useState(Object.entries(CODES.types).map(([k,v])=>({code:k, label:v, editable:false})));
  const [newLexCode, setNewLexCode] = useState("");
  const [newLexLabel, setNewLexLabel] = useState("");
  const [editingLex, setEditingLex] = useState(null);

  // FIX v126 — canEditLex: règle métier au lieu d'IDs DEMO
  const canEditLex = localUser.level >= 5 || (localUser?.isAdmin || localUser?.level >= 6) ||
    (localUser.level >= 4 && ["S02","P02"].some(p => (localUser.processes||[localUser.process||""]).includes(p)));

  const availableProcs = canCodifAll
    ? Object.entries(CODES.processes)
    : Object.entries(CODES.processes).filter(([k]) => userProcs.includes(k));

  const seq = ALPHA_SEQ[seqIndex] || "A01";
  const gen = `${type}-${seq}-${proc}${subproc ? "."+subproc : ""}${version ? "."+version : ""}/${year}`;

  const handleSaveRef = () => {
    if (!label) { gcAlert("Veuillez saisir un libellé pour cette référence."); return; }
    const newEntry = {
      id: "COD-" + Date.now(), ref: gen, type, process: proc,
      seq, subproc, version, year: String(year), label,
      description, createdBy: localUser.id, createdAt: new Date().toISOString(),
    };
    setRegistry(prev => [...prev, newEntry]);
    if (!canCodifAll && !userProcs.includes(proc)) {
      // No-op: user not allowed to notifiy other processes
    } else if (canCodifAll) {
      const procUsers = users.filter(u => _activeUser(u)&&u.process && (u.process === proc || u.process.includes(proc)) && u.id !== localUser.id);
      if (procUsers.length > 0) {
        setNotifications(prev => [{
          id: "N"+Date.now(), icon: "🏷️",
          message: `Nouvelle référence ${gen} créée pour le processus ${proc} par ${localUser.name}`,
          at: new Date().toISOString(), read: false,
          targetUsers: procUsers.map(u=>u.id),
        }, ...prev]);
      }
    }
    setLabel(""); setDescription(""); setSeqIndex(prev => prev+1);
    gcAlert(`✅ Référence enregistrée : ${gen}`);
  };

  const filteredRegistry = registry.filter(r => {
    const matchSearch = !searchTerm ||
      r.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.description||"").toLowerCase().includes(searchTerm.toLowerCase());
    const matchFilter = searchFilter === "ALL" || r.process === searchFilter || r.type === searchFilter;
    return matchSearch && matchFilter;
  });

  return (
    <div>
      <h3 style={{ color:"#C41E3A", margin:"0 0 14px", fontSize:14, fontWeight:800 }}>🏷️ Codification & Références</h3>
      {/* Badge "Lecture seule" pour niv 1-3 */}
      {!canCodifAll && localUser.level < 4 && (
        <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:7,padding:"5px 12px",marginBottom:8,fontSize:10,color:"#3B82F6",display:"inline-flex",alignItems:"center",gap:6}}>
          🔒 Manuel de Codification — Mode consultation (Niv.{localUser.level}) · Le générateur de références est réservé aux Niv.4+
        </div>
      )}
      <Tabs tabs={[
        ...(canCodifAll||localUser.level>=4 ? [{ id:"generator", icon:"⚙️", label:"Générateur", count:0 }] : []),
        { id:"registry", icon:"📚", label:"Manuel de Codification", count:registry.length },
        { id:"search", icon:"🔍", label:"Recherche & Références", count:0 },
        { id:"lexique", icon:"📖", label:"Lexique & Définitions", count:lexique.length },
      ]} active={activeTab||"registry"} onChange={setActiveTab} T={T} />

      {/* GENERATOR TAB */}
      {activeTab === "generator" && (
        <div>
          {!canCodifAll && (
            <div style={{ background:"#F59E0B15", border:"1px solid #F59E0B44", borderRadius:8, padding:"8px 12px", marginBottom:12, color:"#F59E0B", fontSize:11 }}>
              ⚠ Vous ne pouvez créer des références que pour votre processus : <strong>{userProcs.join(", ")}</strong>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {/* Form */}
            <div style={{ background:T.surface2, borderRadius:12, padding:16, border:`1px solid ${T.border}` }}>
              <h4 style={{ color:T.textMuted, margin:"0 0 12px", fontSize:12 }}>Génération de référence alphanumérique</h4>
              <div style={{ background:T.surface3, borderRadius:8, padding:"8px 12px", marginBottom:10, fontSize:11, color:T.textMuted }}>
                <strong style={{ color:"#C41E3A" }}>Formule :</strong> TYPE - SEQ - PROCESSUS.SOUS-PROC.VERSION/ANNÉE
              </div>
              <SelectField label="Type *" value={type} onChange={e=>setType(e.target.value)} options={lexique.map(l=>({value:l.code,label:`${l.code} – ${l.label}`}))} T={T} />
              <div style={{ marginBottom:12 }}>
                <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>N° Séquentiel * (A01→Z99)</label>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <select value={seq} onChange={e=>{ const idx=ALPHA_SEQ.indexOf(e.target.value); if(idx>=0) setSeqIndex(idx); }} style={{ flex:1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 13px", color:T.text, fontSize:13 }}>
                    {ALPHA_SEQ.slice(0, 26*2).map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={()=>setSeqIndex(p=>Math.max(0,p-1))} style={{ background:T.surface3, border:`1px solid ${T.border}`, borderRadius:6, padding:"8px 12px", color:T.textMuted, cursor:"pointer" }}>◀</button>
                  <button onClick={()=>setSeqIndex(p=>Math.min(ALPHA_SEQ.length-1,p+1))} style={{ background:T.surface3, border:`1px solid ${T.border}`, borderRadius:6, padding:"8px 12px", color:T.textMuted, cursor:"pointer" }}>▶</button>
                </div>
              </div>
              <SelectField label="Processus *" value={proc} onChange={e=>setProc(e.target.value)} options={availableProcs.map(([k,v])=>({value:k,label:`${k} – ${v}`}))} T={T} />
              <InputField label="Sous-processus / Activité" value={subproc} onChange={e=>setSubproc(e.target.value)} placeholder="ex: 01, O02.01, PROC" T={T} />
              <InputField label="Version" value={version} onChange={e=>setVersion(e.target.value)} placeholder="v1.0" T={T} />
              <InputField label="Libellé / Objet *" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Description courte de la référence" T={T} />
              <InputField label="Description détaillée" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Notes complémentaires..." T={T} />
              {/* Preview */}
              <div style={{ background:T.primary, borderRadius:10, padding:14, border:"2px solid #C41E3A", textAlign:"center", marginBottom:10 }}>
                <div style={{ color:T.textMuted, fontSize:10, marginBottom:4, textTransform:"uppercase", letterSpacing:1 }}>Référence générée</div>
                <div style={{ color:"#C41E3A", fontFamily:"monospace", fontSize:14, fontWeight:800, letterSpacing:1 }}>{gen}</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <Btn variant="primary" size="sm" style={{ flex:1, justifyContent:"center" }} onClick={handleSaveRef}>💾 Enregistrer la référence</Btn>
                <QRDisplay value={gen} size={50} />
              </div>
            </div>
            {/* Structure reminder */}
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ background:T.surface2, borderRadius:12, padding:16, border:`1px solid ${T.border}` }}>
                <h4 style={{ color:T.textMuted, margin:"0 0 10px", fontSize:12 }}>Structure de codification</h4>
                {[["Niv.1","TYPE","DOC, DOS, FAC, FCH..."],["Niv.2","SÉQUENTIEL","A01 → Z99 (alphanumérique)"],["Niv.3","PROCESSUS","P01, O02, S03..."],["Niv.3.2","SOUS-PROC","P02.02, O03.04..."],["Niv.4","VERSION","v1.0, v1.1, v2.0"],["Niv.5","ANNÉE","2026"]].map(([n,k,v])=>(
                  <div key={k} style={{ display:"flex", gap:8, padding:"5px 8px", background:T.surface3, borderRadius:6, marginBottom:3 }}>
                    <span style={{ color:T.textDim, fontSize:9, width:36, flexShrink:0 }}>{n}</span>
                    <span style={{ color:"#C41E3A", fontFamily:"monospace", fontWeight:700, fontSize:11, width:80, flexShrink:0 }}>{k}</span>
                    <span style={{ color:T.textMuted, fontSize:11 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:T.surface2, borderRadius:12, padding:16, border:`1px solid ${T.border}` }}>
                <h4 style={{ color:T.textMuted, margin:"0 0 8px", fontSize:12 }}>Exemple pratique</h4>
                {[
                  ["DOC-A01-P02.V1.0/2026","Grand Livre des Process"],
                  ["DOS-A01-O02.01/2026","Dossier juridique civil"],
                  ["RAP-A01-O03.04/2026","Rapport d'audit externe"],
                  ["FAC-A01-S05.01","Facture achat/logistique"],
                  ["TCHE-A01-O01.02/2026","Tâche Kanban Admin"],
                  ["MSG-A01-S04.02/2026","Message interne Communication"],
                  ["NOTE-A01-O01.02/2026","Note rapide bureau"],
                  ["PRES-A01-S04.02/2026","Présentation Pro"],
                ].map(([ref, desc])=>(
                  <div key={ref} style={{ padding:"5px 8px", background:T.surface3, borderRadius:6, marginBottom:3 }}>
                    <div style={{ color:"#C41E3A", fontFamily:"monospace", fontSize:10, fontWeight:700 }}>{ref}</div>
                    <div style={{ color:T.textDim, fontSize:10 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REGISTRY TAB */}
      {activeTab === "registry" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <h4 style={{ color:T.text, margin:0, fontSize:13, fontWeight:700 }}>📚 Manuel de Codification — {registry.length} référence(s)</h4>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <div style={{ color:T.textDim, fontSize:10 }}>Synchro temps réel · Dossiers + Documents inclus</div>
            </div>
          </div>
          {/* Filter bar */}
          <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
            {[["ALL","Tous"],["DOS","Dossiers"],["DOC","Documents"],["COD","Manuels"],["FCH","Fiches"],["RAP","Rapports"]].map(([k,l])=>(
              <button key={k} onClick={()=>setSearchFilter(k)}
                style={{ background:searchFilter===k?"#C41E3A":T.surface2, color:searchFilter===k?"#fff":T.textMuted, border:`1px solid ${searchFilter===k?"#C41E3A":T.border}`, borderRadius:16, padding:"4px 12px", cursor:"pointer", fontSize:10, fontWeight:searchFilter===k?800:400 }}>
                {l} ({k==="ALL"?registry.length:registry.filter(r=>r.type===k).length})
              </button>
            ))}
          </div>
          <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ display:"grid", gridTemplateColumns:"48px 2.5fr 80px 80px 110px 1.5fr 60px", padding:"8px 14px", background:T.surface3, borderBottom:`1px solid ${T.border}`, fontSize:9, color:T.textMuted, textTransform:"uppercase", letterSpacing:0.8 }}>
              <span>QR</span><span>Référence</span><span>Type</span><span>Proc.</span><span>Date</span><span>Libellé / Créateur</span><span>Actions</span>
            </div>
            {(searchFilter==="ALL"?registry:registry.filter(r=>r.type===searchFilter)).map(r=>{
              const creator = users.find(u=>u.id===r.createdBy);
              const sourceLabel = r.sourceType==="DOSSIER"?"📁 Dossier":r.sourceType==="DOCUMENT"?"📄 Document":r.sourceType==="SIRH"?"👥 SIRH":"🏷️ Manuel";
              return (
                <div key={r.id} style={{ display:"grid", gridTemplateColumns:"48px 2.5fr 80px 80px 110px 1.5fr 60px", padding:"10px 14px", borderBottom:`1px solid ${T.border}20`, alignItems:"center", transition:"background 0.15s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=T.surface3} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <div><QRDisplay value={r.ref} size={36} /></div>
                  <div>
                    <div style={{ color:"#C41E3A", fontFamily:"monospace", fontSize:10, fontWeight:800 }}>{r.ref}</div>
                    {r.description && <div style={{ color:T.textDim, fontSize:9, marginTop:1 }}>{r.description.slice(0,50)}{r.description.length>50?"…":""}</div>}
                    {r.sourceType && <span style={{ background:"#C41E3A11", color:"#C41E3A", borderRadius:4, padding:"1px 5px", fontSize:8, fontWeight:700 }}>{sourceLabel}</span>}
                  </div>
                  <Badge label={r.type} color="#3B82F6" small />
                  <Badge label={r.process} color={getProcColor(r.process)} small />
                  <div style={{ color:T.textMuted, fontSize:9 }}>{r.createdAt ? formatDate(r.createdAt) : "—"}</div>
                  <div>
                    <div style={{ color:T.text, fontSize:10, fontWeight:600 }}>{r.label}</div>
                    <div style={{ color:T.textDim, fontSize:9 }}>{creator?.name || r.createdBy}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    <QRDisplay value={r.ref} size={1} showDownload={true} label={r.ref} />
                    {canCodifAll && <button onClick={async () => {const nl = await gcPrompt("Nouveau libellé :",r.label);if(nl)setRegistry(prev=>prev.map(x=>x.id===r.id?{...x,label:nl}:x));}} style={{ background:"#22C55E11", border:"1px solid #22C55E33", borderRadius:4, padding:"2px 5px", color:"#22C55E", cursor:"pointer", fontSize:8, fontWeight:700 }}>✏️</button>}
                  </div>
                </div>
              );
            })}
            {registry.length === 0 && <div style={{ padding:30, textAlign:"center", color:T.textMuted, fontSize:12 }}>Aucune référence — Créez un dossier ou un document pour générer automatiquement</div>}
          </div>
        </div>
      )}

      {/* SEARCH TAB */}
      {activeTab === "search" && (
        <div>
          <h4 style={{ color:T.text, margin:"0 0 12px", fontSize:13, fontWeight:700 }}>🔍 Recherche de Références</h4>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, marginBottom:12 }}>
            <input
              value={searchTerm}
              onChange={e=>setSearchTerm(e.target.value)}
              placeholder="Rechercher par référence, libellé, description..."
              style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"10px 14px", color:T.text, fontSize:13, outline:"none" }}
            />
            <select value={searchFilter} onChange={e=>setSearchFilter(e.target.value)} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"10px 14px", color:T.text, fontSize:12 }}>
              <option value="ALL">Tous les filtres</option>
              {Object.entries(CODES.processes).map(([k,v])=><option key={k} value={k}>{k} – {v}</option>)}
              {lexique.map(l=><option key={l.code} value={l.code}>{l.code} – {l.label}</option>)}
            </select>
          </div>
          <div style={{ color:T.textMuted, fontSize:11, marginBottom:8 }}>{filteredRegistry.length} résultat(s) trouvé(s)</div>
          {filteredRegistry.map(r=>{
            const creator = users.find(u=>u.id===r.createdBy);
            const sourceLabel = r.sourceType==="DOSSIER"?"📁 Dossier source":r.sourceType==="DOCUMENT"?"📄 Document source":r.sourceType==="SIRH"?"👥 SIRH":"🏷️ Généré manuellement";
            return (
              <div key={r.id} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:"12px 16px", marginBottom:6, display:"flex", gap:14, alignItems:"flex-start" }}>
                <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <QRDisplay value={r.ref} size={52} showDownload={true} label={r.ref} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                    <div style={{ color:"#C41E3A", fontFamily:"monospace", fontSize:13, fontWeight:800 }}>{r.ref}</div>
                    {canCodifAll && <button onClick={async () => {const nl = await gcPrompt("Nouveau libellé :",r.label);if(nl)setRegistry(prev=>prev.map(x=>x.id===r.id?{...x,label:nl,updatedAt:new Date().toISOString()}:x));}} style={{ background:"#22C55E11", border:"1px solid #22C55E33", borderRadius:5, padding:"3px 8px", color:"#22C55E", cursor:"pointer", fontSize:9, fontWeight:700, flexShrink:0 }}>✏️ Modifier</button>}
                  </div>
                  <div style={{ color:T.text, fontSize:12, fontWeight:600, marginBottom:2 }}>{r.label}</div>
                  {r.description && <div style={{ color:T.textMuted, fontSize:11, marginBottom:4 }}>{r.description}</div>}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    <Badge label={r.type} color="#3B82F6" small />
                    <Badge label={r.process} color={getProcColor(r.process)} small />
                    <Badge label={formatDate(r.createdAt)} color="#7A90B0" small />
                    <Badge label={creator?.name || r.createdBy} color="#22C55E" small />
                    <span style={{ background:"#C41E3A11", color:"#C41E3A", borderRadius:5, padding:"1px 6px", fontSize:9, fontWeight:700 }}>{sourceLabel}</span>
                  </div>
                  {r.sourceId && r.sourceType==="DOSSIER" && (
                    <div style={{ marginTop:6, fontSize:9, color:"#3B82F6", fontFamily:"monospace" }}>🔗 Source : {r.sourceId}</div>
                  )}
                  {r.updatedAt && <div style={{ marginTop:3, fontSize:9, color:T.textDim }}>Modifié le {formatDateTime(r.updatedAt)}</div>}
                </div>
              </div>
            );
          })}
          {filteredRegistry.length === 0 && <div style={{ padding:30, textAlign:"center", color:T.textMuted }}>Aucun résultat pour cette recherche</div>}
        </div>
      )}

      {/* LEXIQUE TAB */}
      {activeTab === "lexique" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <h4 style={{ color:T.text, margin:0, fontSize:13, fontWeight:700 }}>📖 Lexique de Codification</h4>
            {!canEditLex && <div style={{ color:T.textDim, fontSize:10 }}>Ajout possible — Modification/Suppression réservée aux niveaux 5+</div>}
          </div>
          {/* Add entry - available to all */}
          <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:14, marginBottom:12 }}>
            <div style={{ color:T.textMuted, fontSize:11, fontWeight:700, marginBottom:8 }}>+ Ajouter une entrée</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr auto", gap:8, alignItems:"end" }}>
              <InputField label="Code *" value={newLexCode} onChange={e=>setNewLexCode(e.target.value.toUpperCase())} placeholder="ex: RAPPORT" T={T} />
              <InputField label="Signification *" value={newLexLabel} onChange={e=>setNewLexLabel(e.target.value)} placeholder="ex: Rapport d'activité" T={T} />
              <Btn variant="primary" size="sm" onClick={()=>{
                if (!newLexCode || !newLexLabel) return;
                if (lexique.find(l=>l.code===newLexCode)) { gcAlert("Ce code existe déjà"); return; }
                setLexique(prev=>[...prev,{code:newLexCode,label:newLexLabel,editable:true}]);
                setNotifications(prev=>[{id:"N"+Date.now(),icon:"📖",message:`Nouveau code lexique ajouté : ${newLexCode} — ${newLexLabel} par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
                setNewLexCode(""); setNewLexLabel("");
              }}>Ajouter</Btn>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            {lexique.map((l,i)=>(
              <div key={l.code} style={{ display:"flex", gap:8, padding:"8px 12px", background:T.surface2, borderRadius:8, alignItems:"center", border:`1px solid ${T.border}` }}>
                {editingLex === l.code && canEditLex ? (
                  <>
                    <input value={l.code} readOnly style={{ width:80, background:T.surface3, border:`1px solid ${T.border}`, borderRadius:6, padding:"4px 8px", color:"#C41E3A", fontFamily:"monospace", fontWeight:700, fontSize:11 }} />
                    <input defaultValue={l.label} id={`lex-edit-${l.code}`} style={{ flex:1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:"4px 8px", color:T.text, fontSize:11 }} />
                    <button onClick={()=>{
                      const newLabel = document.getElementById(`lex-edit-${l.code}`)?.value;
                      if (newLabel) setLexique(prev=>prev.map(x=>x.code===l.code?{...x,label:newLabel}:x));
                      setEditingLex(null);
                    }} style={{ background:"#22C55E22", border:"1px solid #22C55E44", borderRadius:6, padding:"3px 8px", color:"#22C55E", cursor:"pointer", fontSize:11 }}>✓</button>
                    <button onClick={()=>setEditingLex(null)} style={{ background:T.surface3, border:`1px solid ${T.border}`, borderRadius:6, padding:"3px 8px", color:T.textMuted, cursor:"pointer", fontSize:11 }}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ color:"#C41E3A", fontFamily:"monospace", fontWeight:700, fontSize:11, minWidth:60 }}>{l.code}</span>
                    <span style={{ color:T.textMuted, fontSize:12, flex:1 }}>{l.label}</span>
                    {canEditLex && (
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>setEditingLex(l.code)} style={{ background:T.surface3, border:`1px solid ${T.border}`, borderRadius:5, padding:"2px 7px", color:T.textMuted, cursor:"pointer", fontSize:10 }}>✏️</button>
                        <button onClick={async () => { if(await gcConfirm(`Supprimer le code "${l.code}" ?`)) setLexique(prev=>prev.filter(x=>x.code!==l.code)); }} style={{ background:"#C41E3A15", border:"1px solid #C41E3A33", borderRadius:5, padding:"2px 7px", color:"#C41E3A", cursor:"pointer", fontSize:10 }}>🗑️</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


