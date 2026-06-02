import { gcCloseDossierWithSync } from './DossiersList.jsx';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader } from '../../components/FileUploader.jsx';
import { _lsGet, _lsSet, _noop, playSound, formatCFA, formatDate, formatDateTime, _dataUrlToBlob, gcFileSave, getProcColor, getUser, gcDelaiStatut, daysLeft } from '../../core/index.js';
import { STATUS_CONFIG, PRIORITY_CONFIG, CODES, gcViewDoc, gcDownloadDoc } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge, ProgressBar} from '../../components/UI.jsx';
// NOTE: Ce module utilise FileUploader + gcFileSave pour les uploads
// (remplacement progressif des readAsDataURL)
export function DossierDetailModal({ dossier, setSelectedDossier=_noop, T, localUser, dossierFiles, saveDossierFiles, dossiers=[], setDossiers=_noop, taches=[], setTaches=_noop, users=[], setNotifications=_noop, setShowMessaging=_noop, partners=[], rdvs=[], setRdvs=_noop, setShowTransferModal=_noop}){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'docs',
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
      } catch(e) { console.error('[upload docs]', file.name, e.message); }
    }
    return results;
  };

  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  // Hooks must run unconditionally (React rules) - guard will be applied before render
  const [tab, setTab] = useState("info");
  const [fileViewerIdx, setFileViewerIdx] = useState(null);
  const dDocRef = useRef(null);
  const currentUser = localUser;
  
  if (!dossier || !localUser) return null; // Guard after hooks
  const d = dossier;
  const isAdmin = (localUser?.isAdmin || localUser?.level >= 6) || false;
    const sc = STATUS_CONFIG[d.status];
    const dl = daysLeft(d.dueDate);
    const thisDossierFiles = (dossierFiles||[]).filter(f=>f.dossierId===d.id);

    // ── Permission helpers ────────────────────────────────────────────────
    const myProcs = localUser.processes || [localUser.process];
    const isOwner       = d.createdBy === localUser.id || d.assignedTo === localUser.id;
    const isCollaborator= (d.collaborators||[]).includes(localUser.id);
    const isSubmittedTo = d.submittedTo === localUser.id;
    const isInProcess   = myProcs.includes(d.process);
    const isDirectlyInvolved = isOwner || isCollaborator || isSubmittedTo;
    // canAct: user can take actions on this dossier
    const canAct = isAdmin || localUser.level >= 5
      || (localUser.level >= 4 && (isInProcess || isDirectlyInvolved))
      || (localUser.level === 3 && isDirectlyInvolved)
      || (localUser.level <= 2 && isOwner);
    // canModify: can edit / change status
    const canModify = isAdmin || localUser.level >= 5
      || (localUser.level >= 4 && (isInProcess || isDirectlyInvolved))
      || isOwner;
    // canArchive: terminé + droits (même logique que DossiersList)
    const canArchiveDossier = d.status === "TERMINE" && (
      isAdmin || localUser.level >= 5 || isO01Proc()
      || (localUser.level >= 4 && isInProcess)
      || isOwner  // propriétaire (créateur ou assigné) à tout niveau
      || isCollaborator  // collaborateur nommé
    );

    function isO01Proc() { return myProcs.includes("O01"); }

    const handleDownload = (f) => {
      if (f.accessLevel > (localUser?.level || 0) && !isAdmin) { gcAlert("Accès refusé — Habilitation insuffisante."); return; }
      gcDownloadDoc({ id:f.id, serverUrl:f.serverUrl, url:f.url, dataUrl:f.dataUrl||f.fileData, nom:f.name||f.fileName, name:f.name||f.fileName });
      saveDossierFiles(prev=>prev.map(x=>x.id===f.id?{...x,downloads:(x.downloads||0)+1}:x));
    };

    const openFile = (f) => {
      if (f.accessLevel > (localUser?.level || 0) && !isAdmin) { gcAlert("Accès refusé — Habilitation insuffisante."); return; }
      const mime = f.mimeType || f.fileMime || "";
      if (mime.startsWith("image/") || [".jpg",".jpeg",".png",".gif",".webp"].includes((f.ext||"").toLowerCase())) {
        const i = thisDossierFiles.indexOf(f);
        setFileViewerIdx(i >= 0 ? i : 0);
      } else {
        gcViewDoc({ id:f.id, serverUrl:f.serverUrl, url:f.url, dataUrl:f.dataUrl||f.fileData, nom:f.name||f.fileName, name:f.name||f.fileName });
      }
    };
    return (
      <Modal title={`📁 ${d.ref}`} onClose={() => setSelectedDossier(null)} wide T={T}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Badge label={sc.label} color={sc.color} icon={sc.icon} />
          <Badge label={d.priority} color={PRIORITY_CONFIG[d.priority].color} />
          <Badge label={d.process} color={getProcColor(d.process)} />
          <Badge label={dl < 0 ? "DÉPASSÉ" : `J-${dl}`} color={dl < 0 ? "#C41E3A" : dl < 3 ? "#F59E0B" : "#22C55E"} />
          {(d.collaborators||[]).length>0&&<Badge label={`👥 ${(d.collaborators||[]).length} collab.`} color="#A855F7" small />}
          {thisDossierFiles.length>0&&<Badge label={`📎 ${thisDossierFiles.length} fichier(s)`} color="#3B82F6" small />}
        </div>
        <Tabs tabs={[{ id: "info", icon: "ℹ️", label: "Informations" }, { id: "specs", icon: "📋", label: "Spécifications" }, { id: "docs", icon: "📎", label: `Documents (${thisDossierFiles.length})` }, { id: "collabs", icon: "👥", label: `Collaborateurs` }, { id: "qr", icon: "◼", label: "QR Code" }]} active={tab} onChange={setTab} T={T} />
        {tab === "info" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["Client", d.client], ["Objet", d.objet], ["Processus", CODES.processes[d.process]], ["Référence", d.ref], ["Montant estimé", formatCFA(d.amount)], ["Créé le", formatDate(d.createdAt)], ["Échéance", formatDate(d.dueDate)], ["Notes", d.notes]].map(([l, v]) => (
              <div key={l} style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px", gridColumn: ["Objet", "Notes"].includes(l) ? "span 2" : "span 1" }}>
                <div style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{l}</div>
                <div style={{ color: T.text, fontSize: 13 }}>{v}</div>
              </div>
            ))}
            {d.updatedAt&&<div style={{gridColumn:"span 2",background:T.surface2,borderRadius:8,padding:"8px 12px"}}>
              <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Dernière modification</div>
              <div style={{color:T.text,fontSize:11}}>{formatDateTime(d.updatedAt)} — par {getUser(d.updatedBy,users).name}</div>
            </div>}
            <div style={{ gridColumn: "span 2", background: T.surface2, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Avancement</span>
                <span style={{ color: T.text, fontWeight: 700 }}>{d.progress}%</span>
              </div>
              <ProgressBar value={d.progress} color={sc.color} />
            </div>
          </div>
        )}
        {tab === "specs" && (() => {
          const classification = d.classification || "INTERNE";
          const CLASSIF_CFG = {
            PUBLIC:        { color:"#22C55E", icon:"🌐", desc:"Accessible au public, aucune restriction" },
            INTERNE:       { color:"#3B82F6", icon:"🗂️", desc:"Diffusion interne cabinet uniquement" },
            CONFIDENTIEL:  { color:"#F59E0B", icon:"🔒", desc:"Accès restreint aux personnes habilitées" },
            SECRET:        { color:"#EF4444", icon:"⛔", desc:"Accès Direction Générale uniquement" },
          };
          const cl = CLASSIF_CFG[classification] || CLASSIF_CFG.INTERNE;
          const natureLabel = d.nature==="INTERNE"?"Dossier Interne Cabinet":"Dossier Client / Externe";
          const processLabel = CODES.processes[d.process] || d.process;
          const docTypeLabel = d.type && CODES.types?.[d.type] ? `${d.type} – ${CODES.types[d.type]}` : (d.type || "—");
          const fileCount = thisDossierFiles.length;
          const totalSize = thisDossierFiles.reduce((acc,f)=>acc+(f.size||0),0);
          const totalSizeStr = totalSize < 1024*1024 ? `${Math.round(totalSize/1024)} Ko` : `${(totalSize/1024/1024).toFixed(1)} Mo`;
          return (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {/* Classification badge */}
              <div style={{ background:`${cl.color}15`, border:`2px solid ${cl.color}44`, borderRadius:12, padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:28 }}>{cl.icon}</span>
                <div>
                  <div style={{ color:cl.color, fontWeight:900, fontSize:14 }}>Classification : {classification}</div>
                  <div style={{ color:T.textMuted, fontSize:11, marginTop:2 }}>{cl.desc}</div>
                </div>
                {(localUser?.level >= 4 || localUser?.isAdmin || localUser?.level >= 6) && (
                  <select value={classification} onChange={e=>setDossiers(prev=>prev.map(x=>x.id===d.id?{...x,classification:e.target.value}:x))}
                    style={{ marginLeft:"auto", background:T.surface2, border:`1px solid ${cl.color}55`, borderRadius:8, padding:"6px 10px", color:cl.color, fontSize:11, fontWeight:700 }}>
                    {Object.keys(CLASSIF_CFG).map(k=><option key={k} value={k}>{k}</option>)}
                  </select>
                )}
              </div>

              {/* Metadata grid */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  ["📁 Nature du dossier", natureLabel, "#3B82F6"],
                  ["🏷️ Processus", processLabel, "#C41E3A"],
                  ["📄 Type de document", docTypeLabel, "#A855F7"],
                  ["📊 Priorité", d.priority, PRIORITY_CONFIG[d.priority]?.color||"#F59E0B"],
                  ["👤 Responsable", getUser(d.assignedTo,users).name, "#22C55E"],
                  ["👤 Créé par", getUser(d.createdBy,users).name, "#06B6D4"],
                  ["📅 Date de création", formatDate(d.createdAt), T.textMuted],
                  ["⏰ Date d'échéance", formatDate(d.dueDate), gcDelaiStatut(d.dueDate).color],
                ].map(([label,val,color])=>(
                  <div key={label} style={{ background:T.surface2, borderRadius:8, padding:"9px 12px", border:`1px solid ${T.border}` }}>
                    <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase", letterSpacing:0.8, marginBottom:3 }}>{label}</div>
                    <div style={{ color:color, fontWeight:700, fontSize:11 }}>{val||"—"}</div>
                  </div>
                ))}
              </div>

              {/* Document stats */}
              <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 14px" }}>
                <div style={{ color:T.textMuted, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8 }}>📎 Statistiques documentaires</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {[
                    ["Fichiers", fileCount, "#3B82F6"],
                    ["Taille totale", totalSizeStr, "#22C55E"],
                    ["Collaborateurs", (d.collaborators||[]).length+(d.externalCollaborators||[]).length, "#A855F7"],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{ textAlign:"center" }}>
                      <div style={{ color:c, fontWeight:900, fontSize:18 }}>{v}</div>
                      <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase" }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* File type breakdown */}
              {thisDossierFiles.length > 0 && (
                <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 14px" }}>
                  <div style={{ color:T.textMuted, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8 }}>📂 Types de fichiers</div>
                  {Object.entries(thisDossierFiles.reduce((acc,f)=>{ const t=f.ext||"autre"; acc[t]=(acc[t]||0)+1; return acc; },{})).map(([ext,count])=>(
                    <div key={ext} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"3px 0", borderBottom:`1px solid ${T.border}22` }}>
                      <span style={{ color:T.textMuted, fontSize:11 }}>{ext.replace(".","").toUpperCase()}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:60, height:4, background:T.surface3, borderRadius:2 }}><div style={{ width:`${(count/fileCount)*100}%`, height:"100%", background:"#3B82F6", borderRadius:2 }}/></div>
                        <span style={{ color:"#3B82F6", fontWeight:700, fontSize:11, minWidth:16, textAlign:"right" }}>{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Version & conservation */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px" }}>
                  <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase", letterSpacing:0.8, marginBottom:4 }}>🔄 Version du dossier</div>
                  <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{d.version||"v1.0"}</div>
                  {d.updatedAt && <div style={{ color:T.textDim, fontSize:9, marginTop:2 }}>Mis à jour le {formatDate(d.updatedAt)}</div>}
                </div>
                <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px" }}>
                  <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase", letterSpacing:0.8, marginBottom:4 }}>🗄️ Conservation légale</div>
                  <div style={{ color:"#F59E0B", fontWeight:700, fontSize:12 }}>
                    {d.nature==="EXTERNE" ? "5 ans (OHADA)" : d.process?.startsWith("O") ? "10 ans" : "3 ans"}
                  </div>
                  <div style={{ color:T.textDim, fontSize:9, marginTop:2 }}>Archivage obligatoire</div>
                </div>
              </div>

              {/* Tags */}
              <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px" }}>
                <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>🏷️ Mots-clés & étiquettes</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:6 }}>
                  {(d.tags||[]).map((tag,i)=>(
                    <span key={i} style={{ background:"#C41E3A22", border:"1px solid #C41E3A44", borderRadius:20, padding:"3px 10px", fontSize:10, color:"#C41E3A", fontWeight:700 }}>{tag}
                      {localUser.level>=2&&<span onClick={()=>setDossiers(prev=>prev.map(x=>x.id===d.id?{...x,tags:(x.tags||[]).filter((_,j)=>j!==i)}:x))} style={{ marginLeft:4, cursor:"pointer" }}>×</span>}
                    </span>
                  ))}
                  {(d.tags||[]).length===0 && <span style={{ color:T.textDim, fontSize:10 }}>Aucune étiquette</span>}
                </div>
                {localUser.level>=2&&(
                  <div style={{ display:"flex", gap:6 }}>
                    <input id={`tag-input-${d.id}`} placeholder="Ajouter un mot-clé…" style={{ flex:1, background:T.surface3, border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 8px", color:T.text, fontSize:11 }}
                      onKeyDown={e=>{ if(e.key==="Enter"&&e.target.value.trim()){ setDossiers(prev=>prev.map(x=>x.id===d.id?{...x,tags:[...(x.tags||[]),e.target.value.trim()]}:x)); e.target.value=""; }}} />
                    <button onClick={()=>{ const el=document.getElementById(`tag-input-${d.id}`); if(el?.value.trim()){ setDossiers(prev=>prev.map(x=>x.id===d.id?{...x,tags:[...(x.tags||[]),el.value.trim()]}:x)); el.value=""; }}}
                      style={{ background:"#C41E3A22", border:"1px solid #C41E3A44", color:"#C41E3A", borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>+ Tag</button>
                  </div>
                )}
              </div>

              {/* Partenaire lié */}
              {d.partnerId && (
                <div style={{ background:"#C41E3A11", border:"1px solid #C41E3A33", borderRadius:8, padding:"9px 12px", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:18 }}>🤝</span>
                  <div>
                    <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{d.partnerNom}</div>
                    <div style={{ color:T.textDim, fontSize:10 }}>{d.partnerType} · Partenaire externe associé</div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        {tab === "docs" && (
          <div>
            {/* ── Visionneuse image inline ── */}
            {fileViewerIdx !== null && thisDossierFiles[fileViewerIdx] && (() => {
              const f = thisDossierFiles[fileViewerIdx];
              const src = f.serverUrl || f.dataUrl || f.fileData;
              return (
                <div style={{background:"#000e",borderRadius:10,marginBottom:10,position:"relative",textAlign:"center",padding:"8px 0"}}>
                  <img src={src} alt={f.name} style={{maxWidth:"100%",maxHeight:320,objectFit:"contain",borderRadius:8}} />
                  <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:6,alignItems:"center"}}>
                    <button onClick={()=>setFileViewerIdx(i=>Math.max(0,i-1))} disabled={fileViewerIdx===0} style={{background:"#fff2",border:"none",color:"#fff",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:13}}>◀</button>
                    <span style={{color:"#94A3B8",fontSize:10}}>{fileViewerIdx+1}/{thisDossierFiles.length} — {f.name}</span>
                    <button onClick={()=>setFileViewerIdx(i=>Math.min(thisDossierFiles.length-1,i+1))} disabled={fileViewerIdx===thisDossierFiles.length-1} style={{background:"#fff2",border:"none",color:"#fff",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:13}}>▶</button>
                    <button onClick={()=>setFileViewerIdx(null)} style={{background:"#EF444422",border:"none",color:"#EF4444",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,marginLeft:8}}>✕ Fermer</button>
                  </div>
                </div>
              );
            })()}

            {thisDossierFiles.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:"24px 0",fontSize:12}}>Aucun fichier attaché à ce dossier</div>}
            {thisDossierFiles.map((f,fi) => {
              const canAccess = f.accessLevel<=(localUser?.level||0) || isAdmin || f.uploadedBy===localUser?.id;
              const canDel = f.uploadedBy===localUser?.id || localUser?.level>=4 || isAdmin;
              const mime = f.mimeType||"";
              const isImg = mime.startsWith("image/") || [".jpg",".jpeg",".png",".gif",".webp"].includes((f.ext||"").toLowerCase());
              const isPdf = mime==="application/pdf" || (f.ext||"").toLowerCase()===".pdf";
              return (
                <div key={f.id} style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 12px", background:T.surface2, borderRadius:8, border:`1px solid ${T.border}`, marginBottom:6 }}>
                  <span style={{fontSize:18,flexShrink:0}}>{isPdf?"📄":isImg?"🖼️":(f.ext===".xlsx"||f.ext===".xls")?"📊":(f.ext===".docx"||f.ext===".doc")?"📝":"📁"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{ color:T.text, fontSize:12, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>{f.sizeStr} · {formatDate(f.uploadedAt)} · {f.uploadedByName} · Niv.{f.accessLevel}+{(f.downloads||0)>0?` · ⬇ ${f.downloads}`:""}</div>
                  </div>
                  <div style={{display:"flex",gap:4,flexShrink:0}}>
                    {canAccess ? (<>
                      {/* 👁️ Voir — ouvre image inline ou PDF dans nouvel onglet */}
                      <Btn variant="ghost" size="sm" onClick={()=>openFile(f)} title={isImg?"Visionner l'image":isPdf?"Ouvrir le PDF":"Télécharger"}>{isImg?"🖼️":isPdf?"👁️":"📂"}</Btn>
                      {/* ⬇️ Télécharger */}
                      <Btn variant="ghost" size="sm" onClick={()=>handleDownload(f)}>⬇{(f.downloads||0)>0?` (${f.downloads})`:""}</Btn>
                    </>) : (
                      <span style={{color:"#EF4444",fontSize:10,padding:"4px 8px"}}>🔒 Niv.{f.accessLevel}+</span>
                    )}
                    {canDel&&(
                      <Btn variant="danger" size="sm" onClick={async () => {if(!await gcConfirm(`Supprimer "${f.name}" ?`))return; saveDossierFiles(prev=>prev.filter(x=>x.id!==f.id));}}>🗑️</Btn>
                    )}
                  </div>
                </div>
              );
            })}
            {/* ── Zone dépôt fichier ── uniquement si l'utilisateur a des droits sur ce dossier */}
            {canModify && (
              <div style={{ position:"relative", marginTop:8 }}>
                <input ref={dDocRef} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png"
                  onChange={async e => {
                    const refs = await _uploadFiles(e.target.files, { dossierId: d.id });
                    if (!refs?.length) return;
                    saveDossierFiles(prev => [...prev, ...refs.map(ref => ({
                      ...ref,
                      dossierId: d.id, dossierRef: d.ref,
                      name: ref.nom || ref.name,
                      ext: '.' + (ref.nom || ref.name || '').split('.').pop().toLowerCase(),
                      size: ref.taille || ref.size,
                      sizeStr: (ref.taille||0) < 1048576
                        ? `${Math.round((ref.taille||0)/1024)} Ko`
                        : `${((ref.taille||0)/1048576).toFixed(1)} Mo`,
                      mimeType: ref.type,
                      dataUrl: ref?.dataUrl || null,
                      description: '', accessLevel: localUser.level,
                      uploadedBy: localUser.id, uploadedByName: localUser.name,
                      uploadedAt: new Date().toISOString(), downloads: 0,
                    }))]);
                    e.target.value = '';
                  }}
                  style={{ position:"absolute", inset:0, opacity:0, cursor:"pointer", zIndex:2, width:"100%", height:"100%" }}
                />
                <div style={{ background:T.surface2, border:`2px dashed ${T.border}`, borderRadius:8, padding:"12px 14px", textAlign:"center", color:T.textMuted, fontSize:12, pointerEvents:"none" }}>
                  📂 Cliquer pour déposer un fichier ou glisser-déposer
                </div>
              </div>
            )}
          </div>
        )}
        {tab === "collabs" && (
          <div>
            <div style={{color:T.textMuted,fontSize:11,marginBottom:10}}>Collaborateurs affectés à ce dossier</div>
            {(d.collaborators||[]).length===0&&(d.externalCollaborators||[]).length===0&&(
              <div style={{color:T.textMuted,textAlign:"center",padding:"20px 0",fontSize:12}}>Aucun collaborateur assigné</div>
            )}
            {(d.collaborators||[]).map(uid=>{
              const u=getUser(uid,users);
              return (
                <div key={uid} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 12px",background:T.surface2,borderRadius:8,marginBottom:5}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:u.color||"#3B82F6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,overflow:"hidden",flexShrink:0}}>
                    {u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{u.name}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>{u.role} — Niv.{u.level}</div>
                  </div>
                  <Badge label="👤 Interne" color="#3B82F6" small />
                </div>
              );
            })}
            {(d.externalCollaborators||[]).map(pid=>{
              const p=partners.find(x=>x.id===pid);
              if (!p) return null;
              return (
                <div key={pid} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 12px",background:T.surface2,borderRadius:8,marginBottom:5}}>
                  <span style={{fontSize:20}}>{p.type==="client"?"🤝":p.type==="fournisseur"?"📦":"🌐"}</span>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{p.nom}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>{p.type}</div>
                  </div>
                  <Badge label="🌐 Externe" color="#C41E3A" small />
                </div>
              );
            })}
          </div>
        )}
        {tab === "qr" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 20 }}>
            <QRDisplay value={d.ref} size={160} showDownload={true} label={d.ref} />
            <div style={{ color: T.text, fontWeight: 700, fontFamily: "monospace" }}>{d.ref}</div>
            <div style={{ color: T.textMuted, fontSize: 11, textAlign: "center" }}>QR Code de suivi du dossier.<br />Scanner pour accéder au dossier dans le SI.</div>
            <Btn variant="primary" size="sm">🖨️ Imprimer le QR Code</Btn>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 14, flexWrap: "wrap" }}>
          {/* ── Habilitations Dossiers ──────────────────────────────
              NIV 1 : lecture seule (aucun bouton d'action)
              NIV 2 : écriture + soumission (si non soumis ou rejeté)
              NIV 3 : validation (son processus) + écriture libre
              NIV 4 : approbation inter-processus + délégation
              NIV 5 : tout + signature
              NIV 6 (admin) : tout, irrévocable
          ──────────────────────────────────────────────────────── */}

          {/* ── Séparateur : boutons d'action ──────────────────────────────────
              Tous les boutons d'action (sauf Fermer/Imprimer) sont conditionnés
              par canAct / canModify pour éviter d'afficher des actions inaccessibles.
              canAct : l'utilisateur est impliqué dans ce dossier ou a les droits de gestion
              canModify : l'utilisateur peut modifier le statut
          ──────────────────────────────────────────────────────── */}

          {/* NIV 2+ : Soumettre — seulement propriétaire/assigné */}
          {canModify && localUser.level >= 2 && isOwner && (
            d.status === "ATTENTE_TRAITEMENT" || d.status === "REJETE" ? (
              <Btn variant="primary" size="sm" onClick={() => {
                setDossiers(prev => prev.map(dos => dos.id === d.id ? {
                  ...dos, status: "EN_COURS", progress: Math.max(dos.progress, 10),
                  submittedBy: localUser.id, submittedAt: new Date().toISOString(), rejectComment: null
                } : dos));
                setNotifications(prev => [{id:"N"+Date.now(),icon:"📤",message:`Dossier ${d.ref} soumis par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
                setSelectedDossier(null);
              }}>📤 {d.status === "REJETE" ? "♻️ Re-soumettre" : "Soumettre"}</Btn>
            ) : d.status === "EN_COURS" && localUser.level < 3 ? (
              <span style={{fontSize:11,color:T.textMuted,background:T.surface2,borderRadius:6,padding:"6px 10px"}}>🔒 Soumis — en traitement</span>
            ) : null
          )}

          {/* NIV 3+ : Valider — processus concerné ou directement impliqué */}
          {canModify && localUser.level >= 3 && (isDirectlyInvolved || (localUser.level >= 4 && isInProcess)) &&
            (d.status === "EN_COURS" || d.status === "ATTENTE_TRAITEMENT") && (
            <Btn variant="success" size="sm" onClick={() => {
              setDossiers(prev => prev.map(dos => dos.id === d.id ? {
                ...dos, status: "ATTENTE_APPROBATION", progress: Math.min(100, dos.progress+20),
                validatedBy: localUser.id, validatedAt: new Date().toISOString()
              } : dos));
              setNotifications(prev => [{id:"N"+Date.now(),icon:"✅",message:`Dossier ${d.ref} validé par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
              setSelectedDossier(null);
            }}>✅ Valider</Btn>
          )}

          {/* NIV 3+ : Rejeter — processus concerné ou directement impliqué */}
          {canModify && localUser.level >= 3 && (isDirectlyInvolved || (localUser.level >= 4 && isInProcess)) &&
            (d.status === "EN_COURS" || d.status === "ATTENTE_APPROBATION") && (
            <Btn variant="danger" size="sm" onClick={async () => {
              const motif = await gcPrompt("Motif du rejet (obligatoire) :");
              if (!motif?.trim()) return;
              setDossiers(prev => prev.map(dos => dos.id === d.id ? {
                ...dos, status: "REJETE", rejectComment: motif,
                rejectedBy: localUser.id, rejectedAt: new Date().toISOString()
              } : dos));
              setNotifications(prev => [{id:"N"+Date.now(),icon:"❌",message:`Dossier ${d.ref} rejeté par ${localUser.name} — ${motif}`,at:new Date().toISOString(),read:false},...prev]);
              setSelectedDossier(null);
            }}>❌ Rejeter</Btn>
          )}

          {/* NIV 4+ : Approuver inter-processus — seulement si dans le processus ou impliqué */}
          {canModify && localUser.level >= 4 && (isInProcess || isDirectlyInvolved) && d.status === "ATTENTE_APPROBATION" && (
            <Btn variant="navy" size="sm" onClick={() => {
              setDossiers(prev => prev.map(dos => dos.id === d.id ? {
                ...dos, status: "ATTENTE_SIGNATURE",
                approvedBy: localUser.id, approvedAt: new Date().toISOString()
              } : dos));
              setNotifications(prev => [{id:"N"+Date.now(),icon:"🏛️",message:`Dossier ${d.ref} approuvé par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
              setSelectedDossier(null);
            }}>🏛️ Approuver</Btn>
          )}

          {/* 🧾 Facturer — disponible si dossier actif avec montant */}
          {(localUser.level >= 3 || ["O01","O02","O03","S01"].some(p=>localUser.process===p||(localUser.processes||[]).includes(p))) && d.status !== "ARCHIVE" && d.amount > 0 && (
            <Btn variant="gold" size="sm" onClick={() => {
              // Ouvrir FacturationModule avec ce dossier pré-rempli
              try {
                const prefill = { ref: d.ref, client: d.client, objet: d.objet||"", amount: d.amount||0, process: d.process };
                _lsSet("gc-prefill-facture", JSON.stringify(prefill));
              } catch(_) {}
              setSelectedDossier(null);
              // Navigation vers Bureau → Facturation avec dossier pré-rempli
              if(window.__gcNavigate) window.__gcNavigate("facturation");
              else {
                setNotifications(prev=>[{id:"N"+Date.now(),icon:"🧾",message:`Allez dans Bureau → Facturation & Honoraires pour facturer le dossier ${d.ref} (${(d.amount||0).toLocaleString("fr-FR")} FCFA)`,at:new Date().toISOString(),read:false},...prev]);
              }
            }}>🧾 Facturer</Btn>
          )}

          {/* NIV 4+ : Transférer — seulement si responsable du processus ou admin */}
          {(isAdmin || (localUser.level >= 4 && (isInProcess || isDirectlyInvolved))) && (
            <Btn variant="ghost" size="sm" onClick={() => { setShowTransferModal(d); setSelectedDossier(null); }}>↗️ Transférer</Btn>
          )}

          {/* NIV 5+ : Signer & Clôturer */}
          {localUser.level >= 5 && (d.status === "ATTENTE_SIGNATURE" || d.status === "ATTENTE_APPROBATION") && (
            <Btn variant="gold" size="sm" onClick={() => {
              setDossiers(prev => prev.map(dos => dos.id === d.id ? {
                ...dos, status: "TERMINE", progress: 100,
                signedBy: localUser.id, signedAt: new Date().toISOString()
              } : dos));
              // FIX v126 — sync tâches et RDV liés
              gcCloseDossierWithSync({ dossierId: d.id, taches, setTaches, rdvs, setRdvs });
              setNotifications(prev => [{id:"N"+Date.now(),icon:"✍️",message:`Dossier ${d.ref} signé et clôturé par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
              setSelectedDossier(null);
            }}>✍️ Signer & Clôturer</Btn>
          )}

          {/* NIV 6 ADMIN : Clôturer directement */}
          {isAdmin && d.status !== "TERMINE" && d.status !== "ARCHIVE" && (
            <Btn variant="danger" size="sm" onClick={async () => {
              if(!await gcConfirm(`⚡ ACTION ADMIN IRRÉVOCABLE\nClôturer le dossier ${d.ref} directement ?`)) return;
              setDossiers(prev => prev.map(dos => dos.id === d.id ? {
                ...dos, status: "TERMINE", progress: 100,
                adminClosed: true, closedBy: localUser.id, closedAt: new Date().toISOString()
              } : dos));
              // FIX v126 — sync tâches et RDV liés
              gcCloseDossierWithSync({ dossierId: d.id, taches, setTaches, rdvs, setRdvs });
              setNotifications(prev => [{id:"N"+Date.now(),icon:"⚡",message:`[ADMIN] Dossier ${d.ref} clôturé directement`,at:new Date().toISOString(),read:false},...prev]);
              setSelectedDossier(null);
            }}>⚡ Admin : Clôturer</Btn>
          )}

          {/* 🗄️ Archiver — TERMINE + droits + pas déjà archivé */}
          {canArchiveDossier && d.status === "TERMINE" && (
            <Btn variant="ghost" size="sm" onClick={async () => {
              if(!await gcConfirm(`Archiver le dossier ${d.ref} ?\nIl sera transmis à la Secrétaire Administrative (O01) pour classement physique.\nLe dossier restera consultable ici avec le statut Archivé.`)) return;
              const archRef=`ARCH-A${String(Date.now()).slice(-5)}-${d.process}/${new Date().getFullYear()}`;
              const archEntry = {
                id:"ARCH-"+Date.now(), ref:archRef,
                dossier: d.id, dossierRef: d.ref,
                client: d.client, objet: d.objet||d.client,
                archiveur: localUser.id, archiveurName: localUser.name,
                archivedAt: new Date().toISOString(),
                receivedBySec: false, secNotes:"",
                process: d.process, docType:"DOS",
                status:"EN_ATTENTE_SECRETARIAT", notes: d.notes||"",
              };
              try { const prev=JSON.parse(_lsGet("gc-archives")||"[]"); _lsSet("gc-archives", JSON.stringify([archEntry,...prev].slice(0,500))); } catch(_) {}
              setDossiers(prev=>prev.map(x=>x.id===d.id?{...x,status:"ARCHIVE",archivedAt:new Date().toISOString(),archivedBy:localUser.id,archiveRef:archRef}:x));
              // Notifier O01 + parties prenantes
              const o01Users=(users||[]).filter(u=>(u.process==="O01"||(u.processes||[]).includes("O01"))&&u.level>=2);
              const involvedIds=[...new Set([d.createdBy,d.assignedTo,...(d.collaborators||[])].filter(id=>id&&id!==localUser.id))];
              const notifMsg=`🗄️ ARCHIVAGE : ${d.ref} — ${d.client}. Réf. : ${archRef}. Transmis au Secrétariat O01 pour classement physique.`;
              setNotifications(prev=>[{id:"N"+Date.now(),icon:"🗄️",message:notifMsg,at:new Date().toISOString(),read:false,module:"archivage"},...prev]);
              [...o01Users.map(u=>u.id), ...involvedIds].forEach(uid=>{ try{ const k=`GC_SI_v12:notif:${uid}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now()+uid,icon:"🗄️",message:notifMsg,at:new Date().toISOString(),read:false,module:"archivage",urgent:o01Users.some(u=>u.id===uid)}); _lsSet(k,JSON.stringify(ex.slice(0,200))); }catch(_){} });
              playSound("success");
              setSelectedDossier(null);
              gcAlert(`✅ Dossier ${d.ref} archivé avec succès.\nRéf. archivage : ${archRef}\n\nLe Secrétariat (O01) a été notifié pour réception et classement physique.`);
            }}>🗄️ Archiver</Btn>
          )}

          {/* Motif de rejet */}
          {d.status === "REJETE" && d.rejectComment && (
            <div style={{width:"100%",background:"#EF444415",border:"1px solid #EF444444",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#EF4444",marginTop:4}}>
              ❌ <strong>Motif de rejet :</strong> {d.rejectComment}
              {d.rejectedBy && <span style={{color:T.textDim}}> — par {users.find(u=>u.id===d.rejectedBy)?.name || d.rejectedBy}</span>}
            </div>
          )}

          {/* Message si lecture seule */}
          {!canAct && (
            <span style={{fontSize:10,color:T.textMuted,background:T.surface2,borderRadius:6,padding:"5px 10px",fontStyle:"italic"}}>👁 Lecture seule — vous n'êtes pas désigné sur ce dossier</span>
          )}

          <Btn variant="ghost" size="sm" onClick={() => { setSelectedDossier(null); setShowMessaging(true); }}>📧 Envoyer</Btn>
          <Btn variant="ghost" size="sm" onClick={() => window.print?.()}>🖨️ Imprimer</Btn>
          <Btn variant="secondary" size="sm" onClick={() => setSelectedDossier(null)}>Fermer</Btn>
        </div>
      </Modal>
    );
}


