import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// ArchivagePanel.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, playSound, formatDate, _activeUser, formatDateTime, getProcColor, ALPHA_SEQ , dsSave } from '../../core/index.js';
import { INITIAL_ARCHIVES, CODES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge} from '../../components/UI.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function ArchivagePanel({ dossiers=[], T, localUser, users=[], setNotifications=_noop }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const [showUpload, setShowUpload] = useState(false);
  const [selectedCat, setSelectedCat] = useState(null);
  const [search, setSearch] = useState("");
  const [archTypeFilter, setArchTypeFilter] = useState("ALL");
  const [archProcessFilter, setArchProcessFilter] = useState("ALL");
  const [archStatusFilter, setArchStatusFilter] = useState("ALL");
  const fileInputRef = useRef(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [archives, setArchives] = useState(() => { try { const saved=JSON.parse(_lsGet("gc-archives")||"null"); return saved&&saved.length>0?saved:INITIAL_ARCHIVES; } catch (_) { return INITIAL_ARCHIVES; } });
  // FIX v86 — Reload from LS on mount so archives written from DossiersList are visible
  useEffect(() => {
    try { const saved=JSON.parse(_lsGet("gc-archives")||"null"); if(saved&&saved.length>0) setArchives(saved); } catch(_) {}
    // Also listen to storage events from other tabs
    const handler = (e) => { if(e.key==="gc-archives"&&e.newValue){ try { setArchives(JSON.parse(e.newValue)); } catch(_) {} } };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  // Lecture archives docs depuis GestionDocsUnifiee (gc-docs-archives)
  const [docArchives] = useState(() => { try { return JSON.parse(_lsGet("gc-docs-archives")||"[]"); } catch (_) { return []; }});
  const [archiveTab, setArchiveTab] = useState("mes_archives");
  const [secNoteInputs, setSecNoteInputs] = useState({});
  const [archiveForm, setArchiveForm] = useState({ ref:"", objet:"", process:"O01", docType:"DOC", notes:"" });
  const [showArchiveForm, setShowArchiveForm] = useState(false);
  // FIX v87 — Search + filter bar for archives
  const [archSearch, setArchSearch] = useState("");
  const [archFilterProc, setArchFilterProc] = useState("ALL");
  const [archFilterStatus, setArchFilterStatus] = useState("ALL");

  // FIX v126 — Remplace les IDs DEMO hardcodés par des règles métier
  const isSec = (localUser?.process === "O01" || (localUser?.processes||[]).includes("O01")) && localUser.level >= 2;
  const isAudit = (localUser?.process === "S02" || (localUser?.processes||[]).includes("S02")) || (localUser?.process === "P02" || (localUser?.processes||[]).includes("P02"));
  const canSeeAll = (localUser?.level || 0) >= 5 || (localUser?.isAdmin || localUser?.level >= 6) || isSec || isAudit;

  const myArchives = canSeeAll ? archives : archives.filter(a => a.archiveur === localUser.id);
  const pendingAtSec = archives.filter(a => !a.receivedBySec);

  const categories = [
    { id: "PDF", label: "PDF", icon: "📄" },
    { id: "DOCX", label: "Word/DOCX", icon: "📝" },
    { id: "XLSX", label: "Excel/XLSX", icon: "📊" },
    { id: "IMG", label: "Images", icon: "🖼️" },
    { id: "ARCH", label: "Archives", icon: "📦" },
  ];

  const allDocs = [
    ...uploadedFiles,
    ...dossiers.filter(d => d.status === "TERMINE" && (canSeeAll || d.assignedTo === localUser.id || d.createdBy === localUser.id)).map(d => ({
      ref: d.ref, name: `Dossier clôturé — ${d.client}`, type: "DOS",
      date: d.dueDate || d.createdAt, size: "—", owner: d.assignedTo,
    })),
  ];

  const filtered = allDocs.filter(d =>
    (!search || d.name.toLowerCase().includes(search.toLowerCase()) || (d.ref||"").toLowerCase().includes(search.toLowerCase()) || (d.process||"").toLowerCase().includes(search.toLowerCase())) &&
    (!selectedCat || d.type === selectedCat) &&
    (archProcessFilter === "ALL" || (d.process||"—") === archProcessFilter) &&
    (archStatusFilter === "ALL" || (d.status||"EN_ATTENTE") === archStatusFilter)
  );

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    const newFiles = files.map(f => ({
      ref: "DOC-ARCH-" + Date.now(), name: f.name,
      type: f.name.split(".").pop().toUpperCase(),
      date: new Date().toISOString().split("T")[0], size: (f.size/1024).toFixed(0)+" Ko",
      owner: localUser.id,
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleArchive = () => {
    if (!archiveForm.objet) { gcAlert("Veuillez saisir l'objet de l'archivage."); return; }
    const newArch = {
      id: "ARCH-"+Date.now(),
      ref: `ARCH-${ALPHA_SEQ[archives.length] || "A01"}-${archiveForm.process}/${new Date().getFullYear()}`,
      dossier: archiveForm.ref || null,
      client: archiveForm.objet,
      objet: archiveForm.objet,
      archiveur: localUser.id,
      archivedAt: new Date().toISOString(),
      receivedBySec: false,
      secNotes: "",
      process: archiveForm.process,
      docType: archiveForm.docType,
      status: "EN_ATTENTE_SECRETARIAT",
      notes: archiveForm.notes,
    };
    setArchives(prev => { const u=[...prev,newArch]; try{_lsSet("gc-archives",JSON.stringify(u));}catch (_) {}; dsSave("gc-archives",u).catch(err => gcToast.syncError('', err)); return u; });
    if (setNotifications) {
      setNotifications(prev => [{
        id: "N"+Date.now(),
        icon: "📦",
        message: `📦 Nouvel archivage de ${localUser.name} : "${archiveForm.objet}" — processus ${archiveForm.process}. En attente de réception et classement.`,
        at: new Date().toISOString(),
        read: false,
        forProcess: "O01", // FIX v126 — ciblage par processus O01 (Administration) au lieu d'ID DEMO
        archiveId: newArch.id,
      }, ...prev]);
    }
    setShowArchiveForm(false);
    setArchiveForm({ ref:"", objet:"", process:"O01", docType:"DOC", notes:"" });
    gcAlert(`✅ Archivage envoyé à la Secrétaire Administrative. Référence : ${newArch.ref}`);
  };

  const handleSecConfirm = (archId, notes) => {
    setArchives(prev => { const u=prev.map(a=>a.id===archId?{...a,receivedBySec:true,secNotes:notes||"Archivé",status:"ARCHIVE_CONFIRME"}:a); try{_lsSet("gc-archives",JSON.stringify(u));}catch (_) {}; dsSave("gc-archives",u).catch(err => gcToast.syncError('', err)); return u; });
    const arch = archives.find(a=>a.id===archId);
    if (arch && setNotifications) {
      setNotifications(prev => [{
        id: "N"+Date.now(),
        icon: "✅",
        message: `✅ Votre archivage "${arch.objet}" a été confirmé et classé par la Secrétaire Administrative.`,
        at: new Date().toISOString(),
        read: false,
        forUser: arch.archiveur,
      }, ...prev]);
    }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <h3 style={{ color:"#C41E3A", margin:0, fontSize:14, fontWeight:800 }}>🗂️ Archivage — Gestion Documentaire</h3>
        <div style={{ display:"flex", gap:8 }}>
          {localUser.level >= 2 && <Btn variant="primary" size="sm" onClick={()=>setShowArchiveForm(true)}>📦 Archiver un document</Btn>}
          <Btn variant="ghost" size="sm" onClick={()=>fileInputRef.current?.click()}>📁 Déposer un fichier</Btn>
          <input ref={fileInputRef} type="file" multiple onChange={handleFileUpload} style={{ display:"none" }} />
        </div>
      </div>

      {/* Secretary banner */}
      {isSec && pendingAtSec.length > 0 && (
        <div style={{ background:"#F59E0B15", border:"1px solid #F59E0B44", borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ fontSize:20 }}>⚠️</span>
          <div style={{ flex:1 }}>
            <div style={{ color:"#F59E0B", fontWeight:700, fontSize:13 }}>Archives en attente de traitement ({pendingAtSec.length})</div>
            <div style={{ color:T.textMuted, fontSize:11 }}>Des collaborateurs ont soumis des archives en attente de votre réception et classement.</div>
          </div>
          <Btn variant="secondary" size="sm" onClick={()=>setArchiveTab("pending")}>Traiter maintenant</Btn>
        </div>
      )}

      {/* Barre de recherche + filtres ── FIX v87 */}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input value={archSearch} onChange={e=>setArchSearch(e.target.value)}
          placeholder="🔍 Référence, objet, client, archiveur…"
          style={{flex:"1 1 180px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:11}} />
        <select value={archFilterProc} onChange={e=>setArchFilterProc(e.target.value)}
          style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11}}>
          <option value="ALL">Tous processus</option>
          {[...new Set((archives||[]).map(a=>a.process).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <select value={archFilterStatus} onChange={e=>setArchFilterStatus(e.target.value)}
          style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11}}>
          <option value="ALL">Tous statuts</option>
          <option value="EN_ATTENTE_SECRETARIAT">⏳ En attente secrétariat</option>
          <option value="ARCHIVE_CONFIRME">✅ Confirmé</option>
          <option value="ARCHIVE">🗄️ Archivé</option>
        </select>
        {(archSearch||archFilterProc!=="ALL"||archFilterStatus!=="ALL")&&(
          <button onClick={()=>{setArchSearch("");setArchFilterProc("ALL");setArchFilterStatus("ALL");}}
            style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>✕ Reset</button>
        )}
        <span style={{color:T.textDim,fontSize:10}}>{archives.length} archive(s)</span>
      </div>

      {/* Tabs */}
      <Tabs tabs={[
        { id:"mes_archives", icon:"📋", label:isSec?"Mes archives transmises":"Mes archives", count:myArchives.filter(a=>!isSec||a.archiveur===localUser.id).length },
        ...(canSeeAll ? [{ id:"all", icon:"🗂️", label:"Toutes les archives", count:archives.length }] : []),
        ...(isSec ? [{ id:"pending", icon:"⏳", label:"En attente", count:pendingAtSec.length }] : []),
        { id:"dossiers_docs", icon:"📂", label:"Depuis Dossiers & Docs", count: dossiers.filter(d=>d.status==="TERMINE"||(d.classification&&d.classification!=="PUBLIC")).length },
        { id:"docs", icon:"📁", label:"Documents déposés", count:allDocs.length },
      ]} active={archiveTab} onChange={setArchiveTab} T={T} />

      {/* Archives list */}
      {(archiveTab === "mes_archives" || archiveTab === "all") && (() => {
        const baseList = archiveTab === "all" ? archives : archives.filter(a => canSeeAll ? true : a.archiveur === localUser.id);
        const list = baseList.filter(a => {
          const q = archSearch.toLowerCase();
          const matchSearch = !q || (a.objet||"").toLowerCase().includes(q) || (a.client||"").toLowerCase().includes(q) || (a.ref||"").toLowerCase().includes(q) || (a.archiveurName||a.archiveur||"").toLowerCase().includes(q);
          const matchProc = archFilterProc==="ALL" || a.process===archFilterProc;
          const matchStatus = archFilterStatus==="ALL" || a.status===archFilterStatus || (!a.status && archFilterStatus==="ARCHIVE");
          return matchSearch && matchProc && matchStatus;
        });
        return (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {list.map(a => {
              const archiver = users?.find(u=>u.id===a.archiveur);
              const statusColor = a.status==="ARCHIVE_CONFIRME"||a.receivedBySec ? "#22C55E" : a.status==="ARCHIVE" ? "#3B82F6" : "#F59E0B";
              const statusLabel = a.receivedBySec||a.status==="ARCHIVE_CONFIRME" ? "✅ Confirmé & classé" : a.status==="ARCHIVE" ? "🗄️ Archivé" : "⏳ En attente secrétariat";
              return (
                <div key={a.id} style={{ background:T.surface2, border:`1px solid ${statusColor}33`, borderRadius:10, padding:"12px 16px" }}>
                  <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                    <div style={{ fontSize:22, flexShrink:0 }}>{a.docType==="DOS"?"📁":"📄"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", marginBottom:3 }}>
                        <span style={{ color:T.text, fontWeight:700, fontSize:13 }}>{a.objet||a.client||"—"}</span>
                        <Badge label={a.process||"—"} color={getProcColor(a.process)} small />
                        <Badge label={a.docType||"DOC"} color="#6B7280" small />
                      </div>
                      <div style={{ color:"#C41E3A", fontFamily:"monospace", fontSize:10, marginBottom:2 }}>{a.ref}</div>
                      {a.client&&a.client!==a.objet&&<div style={{ color:T.textMuted, fontSize:11 }}>Client : {a.client}</div>}
                      <div style={{ color:T.textMuted, fontSize:11 }}>
                        Archivé par <strong>{archiver?.name||a.archiveurName||a.archiveur||"—"}</strong> · {formatDateTime(a.archivedAt)}
                      </div>
                      {a.secNotes&&<div style={{ color:"#22C55E", fontSize:11, marginTop:2 }}>📌 {a.secNotes}</div>}
                      {a.notes&&<div style={{ color:T.textMuted, fontSize:10, marginTop:2, fontStyle:"italic" }}>{a.notes}</div>}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end", flexShrink:0 }}>
                      <Badge label={statusLabel} color={statusColor} small />
                      {!a.receivedBySec&&a.status!=="ARCHIVE_CONFIRME"&&isSec&&(
                        <button onClick={async () => {
                          const note = await gcPrompt("Note de classement (optionnel) :")||"Reçu et classé";
                          const updated=archives.map(x=>x.id===a.id?{...x,receivedBySec:true,secNotes:note,status:"ARCHIVE_CONFIRME",confirmedAt:new Date().toISOString()}:x);
                          setArchives(updated); try{_lsSet("gc-archives",JSON.stringify(updated));dsSave("gc-archives",updated).catch(err => gcToast.syncError('', err));}catch(_){}
                          if(setNotifications)setNotifications(p=>[{id:"N"+Date.now(),icon:"✅",message:`Archive "${a.objet}" confirmée par le Secrétariat. Ref: ${a.ref}`,at:new Date().toISOString(),read:false,module:"archivage"},...p]);
                          try{ const k=`GC_SI_v12:notif:${a.archiveur}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now(),icon:"✅",message:`Votre archive "${a.objet}" (${a.ref}) a été confirmée et classée par le Secrétariat.`,at:new Date().toISOString(),read:false,module:"archivage"}); _lsSet(k,JSON.stringify(ex.slice(0,200))); }catch(_){}
                          playSound("success");
                        }} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Confirmer</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {list.length === 0 && (
              <div style={{ color:T.textMuted, textAlign:"center", padding:30, background:T.surface2, borderRadius:10 }}>
                {archSearch||archFilterProc!=="ALL"||archFilterStatus!=="ALL"
                  ? `🔍 Aucun résultat pour ces filtres`
                  : archiveTab==="mes_archives" ? "Vous n'avez pas encore d'archives. Archivez un dossier TERMINÉ depuis Dossiers & Documents." : "Aucune archive enregistrée."}
              </div>
            )}
          </div>
        );
      })()}

      {/* Pending tab for secretary */}
      {archiveTab === "pending" && isSec && (
        <div>
          {pendingAtSec.length === 0 && <div style={{ color:"#22C55E", textAlign:"center", padding:30, fontSize:13 }}>✅ Aucune archive en attente — Tout est à jour !</div>}
          {pendingAtSec.map(a => {
            const archiver = users?.find(u=>u.id===a.archiveur);
            const sourceDossier = dossiers?.find(d=>d.id===a.dossier||d.ref===a.dossierRef);
            return (
              <div key={a.id} style={{ background:T.surface2, border:"1px solid #F59E0B44", borderRadius:10, padding:"14px 16px", marginBottom:10 }}>
                <div style={{ display:"flex", gap:12 }}>
                  <div style={{ fontSize:20 }}>📦</div>
                  <div style={{ flex:1 }}>
                    <div style={{ color:T.text, fontWeight:700, fontSize:13 }}>{a.objet}</div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:2 }}>
                      <div style={{ color:"#C41E3A", fontFamily:"monospace", fontSize:10 }}>{a.ref}</div>
                      {/* Lien vers le dossier source */}
                      {a.dossierRef && (
                        <button
                          onClick={()=>{ window.dispatchEvent(new CustomEvent("gc:open-dossier",{detail:{ref:a.dossierRef,id:a.dossier}})); }}
                          style={{background:"#C41E3A15",border:"1px solid #C41E3A33",color:"#C41E3A",borderRadius:5,padding:"1px 7px",cursor:"pointer",fontSize:9,fontWeight:700}}>
                          → {a.dossierRef}
                        </button>
                      )}
                    </div>
                    <div style={{ color:T.textMuted, fontSize:11, marginTop:2 }}>
                      De : <strong>{archiver?.name}</strong> ({archiver?.role}) — {formatDateTime(a.archivedAt)}
                    </div>
                    {a.notes && <div style={{ color:T.textMuted, fontSize:11, marginTop:4, fontStyle:"italic" }}>Note : {a.notes}</div>}
                  </div>
                  {sourceDossier && (
                    <div style={{fontSize:10,color:T.textDim,textAlign:"right",flexShrink:0}}>
                      <div style={{color:sourceDossier.status==="ARCHIVE"?"#64748B":"#22C55E",fontWeight:700}}>{sourceDossier.status}</div>
                      <div>{sourceDossier.client}</div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop:10, display:"flex", gap:8 }}>
                  <input
                    placeholder="Notes de classement (ex: Classeur O02/2026, Étagère B3...)"
                    value={secNoteInputs[a.id]||""}
                    onChange={e=>setSecNoteInputs(p=>({...p,[a.id]:e.target.value}))}
                    style={{ flex:1, background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"7px 12px", color:T.text, fontSize:12 }}
                  />
                  <Btn variant="success" size="sm" onClick={()=>{
                    const n = secNoteInputs[a.id]||"";
                    handleSecConfirm(a.id, n);
                  }}>✅ Confirmer réception & Archiver</Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Onglet Depuis Dossiers & Documents ── */}
      {archiveTab === "dossiers_docs" && (
        <div>
          <div style={{color:T.textMuted,fontSize:11,marginBottom:10}}>
            Sélectionnez un dossier ou document à archiver directement depuis la rubrique Dossiers &amp; Documents.
          </div>
          {/* Dossiers terminés ou classifiés */}
          <div style={{marginBottom:14}}>
            <div style={{color:"#3B82F6",fontWeight:800,fontSize:12,marginBottom:8}}>📁 Dossiers terminés / classifiés</div>
            {dossiers.filter(d=>d.status==="TERMINE"||(d.classification&&d.classification!=="PUBLIC")).length===0
              ? <div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:16,background:T.surface2,borderRadius:8}}>Aucun dossier terminé — ils apparaîtront ici une fois clôturés</div>
              : dossiers.filter(d=>d.status==="TERMINE"||(d.classification&&d.classification!=="PUBLIC")).map(d=>{
                  const alreadyArchived = archives.some(a=>a.dossier===d.id||a.dossierRef===d.ref||a.ref===d.ref);
                  return (
                    <div key={d.id} style={{background:T.surface2,border:`1px solid ${alreadyArchived?"#22C55E33":T.border}`,borderRadius:8,padding:"10px 14px",marginBottom:6,display:"flex",gap:10,alignItems:"center"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{color:T.text,fontWeight:700,fontSize:12}}>{d.ref}</span>
                          <span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700}}>{d.process}</span>
                          {d.classification&&<span style={{background:"#A855F722",color:"#A855F7",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700}}>{d.classification}</span>}
                          {alreadyArchived&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700}}>✅ Archivé</span>}
                        </div>
                        <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{d.client} — {d.objet}</div>
                      </div>
                      {!alreadyArchived&&(
                        <button onClick={()=>{
                          const now=new Date().toISOString();
                          const archRef=`ARCH-A${String(Date.now()).slice(-5)}-${d.process}/${new Date().getFullYear()}`;
                          const entry={
                            id:"ARCH-"+Date.now(), ref:archRef,
                            dossier:d.id, dossierRef:d.ref,  // FIX v87: both id and ref
                            client:d.client, objet:d.objet||d.client,
                            archiveur:localUser.id, archiveurName:localUser.name,
                            archivedAt:now, receivedBySec:false, secNotes:"",
                            process:d.process, docType:"DOS",
                            status:"EN_ATTENTE_SECRETARIAT", notes:"Archivé depuis la rubrique Archivage",
                          };
                          const updated=[entry,...archives];
                          setArchives(updated);
                          try{_lsSet("gc-archives",JSON.stringify(updated));dsSave("gc-archives",updated).catch(err => gcToast.syncError('', err));}catch(_){}
                          // Notify O01 + involved
                          const o01Users=(users||[]).filter(u=>(u.process==="O01"||(u.processes||[]).includes("O01"))&&u.level>=2);
                          const notifMsg=`🗄️ Dossier archivé depuis Archivage : ${d.ref} — ${d.client}. Réf: ${archRef}. En attente de réception O01.`;
                          if(setNotifications)setNotifications(p=>[{id:"N"+Date.now(),icon:"🗄️",message:notifMsg,at:now,read:false,module:"archivage"},...p]);
                          o01Users.forEach(u=>{ try{ const k=`GC_SI_v12:notif:${u.id}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now()+u.id,icon:"🗄️",message:notifMsg,at:now,read:false,module:"archivage",urgent:true}); _lsSet(k,JSON.stringify(ex.slice(0,200))); }catch(_){} });
                          playSound("success");
                        }} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11,flexShrink:0}}>
                          🗂️ Archiver
                        </button>
                      )}
                    </div>
                  );
                })
            }
          </div>
          {/* Documents depuis gc-docs-unified */}
          <div>
            <div style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:8}}>📄 Documents à archiver</div>
            {(()=>{
              // FIX v126 — gc-docs-unified est la clé courante (gc-docs-v2 était l'ancienne)
              let docs=[];try{docs=JSON.parse(_lsGet("gc-docs-unified")||"[]");}catch(_){}
              const archivableDocs=docs.filter(doc=>doc.status==="ACTIF"&&(doc.accessLevel<=(localUser?.level || 0)||(localUser?.isAdmin || localUser?.level >= 6)||doc.createdBy===localUser?.id));
              if(archivableDocs.length===0)return <div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:16,background:T.surface2,borderRadius:8}}>Aucun document disponible</div>;
              return archivableDocs.slice(0,20).map(doc=>{
                const alreadyArch=archives.some(a=>a.ref===doc.ref||a.docId===doc.id);
                return(
                  <div key={doc.id} style={{background:T.surface2,border:`1px solid ${alreadyArch?"#22C55E33":T.border}`,borderRadius:8,padding:"8px 12px",marginBottom:5,display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{color:T.text,fontWeight:700,fontSize:11}}>{doc.titre||doc.ref}</span>
                        <span style={{background:"#C9A84C22",color:"#C9A84C",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{doc.type||"DOC"}</span>
                        {alreadyArch&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>✅ Archivé</span>}
                      </div>
                      <div style={{color:T.textDim,fontSize:9,marginTop:1}}>{doc.ref} · {doc.process} · Par {doc.createdByName||"—"}</div>
                    </div>
                    {!alreadyArch&&(
                      <button onClick={()=>{
                        const now=new Date().toISOString();
                        const entry={
                          id:"ARCH-"+Date.now(),ref:doc.ref,objet:doc.titre||doc.ref,
                          process:doc.process,docType:doc.type||"DOC",
                          docId:doc.id,nature:doc.nature||"INTERNE",
                          archiveur:localUser.id,archiveurName:localUser.name,
                          archivedAt:now,status:"ARCHIVE",
                          classification:"CONFIDENTIEL",
                          notes:"Archivé depuis Dossiers & Documents",
                        };
                        const updated=[entry,...archives];
                        setArchives(updated);
                        try{_lsSet("gc-archives",JSON.stringify(updated));dsSave("gc-archives",updated).catch(err => gcToast.syncError('', err));}catch(_){}
                        if(setNotifications)setNotifications(p=>[{id:"N"+Date.now(),icon:"📄",message:`Document ${doc.ref} archivé par ${localUser.name}`,at:now,read:false},...p]);
                      }} style={{background:"#C9A84C",border:"none",color:"#000",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10,flexShrink:0}}>
                        🗂️ Archiver
                      </button>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Documents tab */}
      {archiveTab === "docs" && (
        <div>
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
            {categories.map(cat=>(
              <button key={cat.id} onClick={()=>setSelectedCat(selectedCat===cat.id?null:cat.id)} style={{ background:selectedCat===cat.id?"#C41E3A22":T.surface2, border:`1px solid ${selectedCat===cat.id?"#C41E3A":T.border}`, borderRadius:8, padding:"6px 12px", color:selectedCat===cat.id?"#C41E3A":T.textMuted, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", gap:5 }}>
                {cat.icon} {cat.label}
              </button>
            ))}
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher…" style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 12px", color:T.text, fontSize:12, flex:1, minWidth:120 }} />
            <select value={archProcessFilter} onChange={e=>setArchProcessFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 8px",color:T.text,fontSize:10}}>
              <option value="ALL">🗂️ Tous</option>
              {[...new Set((archives||[]).map(a=>a.process).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select value={archStatusFilter} onChange={e=>setArchStatusFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 8px",color:T.text,fontSize:10}}>
              <option value="ALL">📋 Tous statuts</option>
              <option value="ARCHIVE_CONFIRME">✅ Confirmé</option>
              <option value="EN_ATTENTE">⏳ En attente</option>
            </select>
          </div>
          {filtered.map((doc, i) => (
            <div key={i} style={{ display:"flex", gap:10, alignItems:"center", padding:"9px 0", borderBottom:`1px solid ${T.border}20` }}>
              <span style={{ fontSize:16 }}>{doc.type==="PDF"?"📄":doc.type==="DOCX"?"📝":doc.type==="XLSX"?"📊":"📎"}</span>
              <div style={{ flex:1 }}>
                <div style={{ color:T.text, fontSize:12, fontWeight:500 }}>{doc.name}</div>
                <div style={{ color:T.textMuted, fontSize:10 }}>{doc.ref} • {formatDate(doc.date)} • {doc.size}</div>
              </div>
              <div style={{ display:"flex", gap:5 }}>
                <button title="Télécharger" style={{ background:"#3B82F622", border:"1px solid #3B82F644", borderRadius:6, padding:"4px 8px", color:"#3B82F6", cursor:"pointer", fontSize:11 }}>⬇</button>
                {localUser.level >= 2 && <button onClick={()=>{
                  setArchiveForm(f=>({...f,objet:doc.name,ref:doc.ref}));
                  setShowArchiveForm(true);
                }} title="Archiver" style={{ background:"#F59E0B22", border:"1px solid #F59E0B44", borderRadius:6, padding:"4px 8px", color:"#F59E0B", cursor:"pointer", fontSize:11 }}>📦</button>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ color:T.textMuted, textAlign:"center", padding:20, fontSize:12 }}>Aucun document</div>}
        </div>
      )}

      {/* Archive form modal */}
      {showArchiveForm && (
        <Modal title="📦 Soumettre un archivage" onClose={()=>setShowArchiveForm(false)} T={T}>
          <div style={{ background:"#3B82F615", border:"1px solid #3B82F633", borderRadius:8, padding:"8px 12px", marginBottom:12, color:T.textMuted, fontSize:11 }}>
            📋 Cet archivage sera transmis en temps réel à la <strong>Secrétaire Administrative</strong> pour réception, classement et confirmation.
          </div>
          <InputField label="Référence du dossier/document (optionnel)" value={archiveForm.ref} onChange={e=>setArchiveForm(f=>({...f,ref:e.target.value}))} placeholder="DOS-A01-O02.01/2026" T={T} />
          <InputField label="Objet / Description *" value={archiveForm.objet} onChange={e=>setArchiveForm(f=>({...f,objet:e.target.value}))} placeholder="Ex: Dossier pénal OBIANG — clôturé" T={T} />
          <SelectField label="Processus *" value={archiveForm.process} onChange={e=>setArchiveForm(f=>({...f,process:e.target.value}))} options={Object.entries(CODES.processes).map(([k,v])=>({value:k,label:`${k} – ${v}`}))} T={T} />
          <SelectField label="Type de document *" value={archiveForm.docType} onChange={e=>setArchiveForm(f=>({...f,docType:e.target.value}))} options={Object.entries(CODES.types).map(([k,v])=>({value:k,label:`${k} – ${v}`}))} T={T} />
          <div style={{ marginBottom:12 }}>
            <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Notes de transmission (optionnel)</label>
            <textarea value={archiveForm.notes} onChange={e=>setArchiveForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Informations complémentaires pour la secrétaire…" style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12, resize:"vertical", boxSizing:"border-box" }} />
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Btn variant="primary" onClick={handleArchive}>📦 Soumettre à la Secrétaire</Btn>
            <Btn variant="ghost" onClick={()=>setShowArchiveForm(false)}>Annuler</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

export function TransferModal({ dossier, users=[], currentUser, onTransfer, onClose, T }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [targetUser, setTargetUser] = useState("");
  const [message, setMessage] = useState("");
  const [action, setAction] = useState("TRANSFERT"); // TRANSFERT | VALIDATION | SIGNATURE | APPROBATION | SIGNALEMENT

  const superiors = users.filter(u => _activeUser(u)&&u.level > currentUser.level && u.id !== currentUser.id);
  const allOthers = users.filter(u => _activeUser(u)&&u.id !== currentUser.id);

  const handleSubmit = () => {
    if (!targetUser) { gcAlert("Veuillez sélectionner un destinataire."); return; }
    if (!message.trim()) { gcAlert("Veuillez saisir un message/commentaire."); return; }
    onTransfer(dossier, targetUser, `[${action}] ${message} — de ${currentUser.name}`);
  };

  const actionColors = {
    TRANSFERT: "#3B82F6", VALIDATION: "#A855F7", SIGNATURE: "#EC4899",
    APPROBATION: "#06B6D4", SIGNALEMENT: "#F59E0B"
  };

  return (
    <Modal title={`📤 Transfert / Signalement — ${dossier.ref}`} onClose={onClose} T={T}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {Object.entries(actionColors).map(([a, c]) => (
          <button key={a} onClick={() => setAction(a)} style={{ background: action === a ? c + "33" : T.surface3, border: `1px solid ${action === a ? c : T.border}`, borderRadius: 6, padding: "5px 12px", color: action === a ? c : T.textMuted, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{a}</button>
        ))}
      </div>
      <SelectField
        label={action === "SIGNALEMENT" ? "Signaler à *" : "Transférer à *"}
        value={targetUser}
        onChange={e => setTargetUser(e.target.value)}
        options={[{value:"",label:"-- Sélectionner --"}, ...(["VALIDATION","APPROBATION","SIGNATURE"].includes(action) ? superiors : allOthers).map(u => ({value:u.id,label:`${u.name} — ${u.role} (Niv.${u.level})`}))]}
        T={T}
      />
      <div style={{ marginBottom: 12 }}>
        <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Message / Commentaire *</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={`Décrivez la raison du ${action.toLowerCase()} et toute information utile…`} rows={4} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12, resize: "vertical", boxSizing: "border-box" }} />
      </div>
      <div style={{ background: "#F59E0B15", border: "1px solid #F59E0B33", borderRadius: 8, padding: "8px 12px", marginBottom: 14, color: T.textMuted, fontSize: 11 }}>
        ⚠️ Cette action sera enregistrée dans le journal d'activité et notifiée au destinataire.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="primary" onClick={handleSubmit}>📤 Confirmer {action}</Btn>
        <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
      </div>
    </Modal>
  );
};


