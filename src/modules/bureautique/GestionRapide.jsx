import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// GestionRapide.jsx — SI Génie Consultant v127
import { useDialog } from '../../components/Dialog.jsx';
import { _lsGet, _lsSet, _noop, gcCodif, gcCodifTCHE , dsSave } from '../../core/index.js';
import { GC_ALL_SUBPROCS } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function GestionRapideUnifiee({ T, currentUser, setNotifications=_noop, dossiers=[], setDossiers=_noop, taches=[], setTaches=_noop, users=[], partners=[] }) {
  const _dlg = useDialog();
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const YEAR = new Date().getFullYear();
  const [tab, setTab] = useState("kanban"); // kanban | taches | dossiers | notes | archives
  const [kanbanCols, setKanbanCols] = useState(()=>{try{return JSON.parse(_lsGet("gc-kanban-cols-v2")||"null")||[
    {id:"todo",label:"📋 À Faire",color:"#3B82F6"},
    {id:"inprog",label:"⚙️ En Cours",color:"#F59E0B"},
    {id:"review",label:"🔍 En Révision",color:"#8B5CF6"},
    {id:"done",label:"✅ Terminé",color:"#22C55E"},
  ];}catch (_) {return [];}});
  const [kanbanCards, setKanbanCards] = useState(()=>{try{return JSON.parse(_lsGet("gc-kanban-cards-v2")||"[]");}catch (_) {return [];}});
  const [dragging, setDragging] = useState(null);
  const [showNewCard, setShowNewCard] = useState(null);
  const [newCard, setNewCard] = useState({title:"",desc:"",priority:"NORMALE",tags:"",assignee:"",dossier:"",subproc:"O01.02",dueDate:""});
  const [showNewCol, setShowNewCol] = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [notesList, setNotesList] = useState(()=>{try{return JSON.parse(_lsGet("gc-notes-rapides")||"[]");}catch (_) {return [];}});
  const [noteForm, setNoteForm] = useState({title:"",content:"",category:"NOTE",priority:"NORMALE",tags:"",color:"#6366F1"});
  const [editNote, setEditNote] = useState(null);
  const [archives, setArchives] = useState(()=>{try{return JSON.parse(_lsGet("gc-gestion-archives")||"[]");}catch (_) {return [];}});

  const saveKanban = (cols, cards) => {
    if(cols) { setKanbanCols(cols); try{_lsSet("gc-kanban-cols-v2",JSON.stringify(cols));dsSave("gc-kanban-cols-v2",cols).catch(err => gcToast.syncError('', err));}catch (_) {} }
    if(cards) { setKanbanCards(cards); try{_lsSet("gc-kanban-cards-v2",JSON.stringify(cards.slice(0,200)));dsSave("gc-kanban-cards-v2",cards.slice(0,200)).catch(err => gcToast.syncError('', err));}catch (_) {} }
  };

  const saveNotes = n => { setNotesList(n); try{_lsSet("gc-notes-rapides",JSON.stringify(n.slice(0,100)));dsSave("gc-notes-rapides",n.slice(0,100)).catch(err => gcToast.syncError('', err));}catch (_) {}; };

  const addCard = (colId) => {
    if(!newCard.title.trim()) return;
    const seqIdx = kanbanCards.length % 99;
    const ref = gcCodifTCHE(newCard.subproc||"O01.02", seqIdx, YEAR);
    const card = {id:"K-"+Date.now(),ref,colId,title:newCard.title,desc:newCard.desc,priority:newCard.priority,tags:(newCard.tags||"").split(",").map(t=>t.trim()).filter(Boolean),assignee:newCard.assignee,dossier:newCard.dossier,subproc:newCard.subproc||"O01.02",dueDate:newCard.dueDate,createdAt:new Date().toISOString(),createdBy:currentUser?.name};
    saveKanban(null, [...kanbanCards, card]);
    setNewCard({title:"",desc:"",priority:"NORMALE",tags:"",assignee:"",dossier:"",subproc:"O01.02",dueDate:""});
    setShowNewCard(null);
    if(setNotifications) setNotifications(p=>[{id:"N"+Date.now(),icon:"🗂️",message:`Tâche créée: ${card.title} — ${ref}`,at:new Date().toISOString(),read:false},...p]);
  };

  const moveCard = (cardId, newColId) => {
    saveKanban(null, kanbanCards.map(c=>c.id===cardId?{...c,colId:newColId}:c));
  };

  const deleteCard = (cardId) => {
    const card = kanbanCards.find(c=>c.id===cardId);
    if(card) setArchives(a=>{const n=[{...card,archivedAt:new Date().toISOString(),archivedBy:currentUser?.name},...a];try{_lsSet("gc-gestion-archives",JSON.stringify(n.slice(0,200)));dsSave("gc-gestion-archives",n.slice(0,200)).catch(err => gcToast.syncError('', err));}catch (_) {}return n;});
    saveKanban(null, kanbanCards.filter(c=>c.id!==cardId));
  };

  const addNote = () => {
    if(!noteForm.title.trim()&&!noteForm.content.trim()) return;
    const seqIdx = notesList.length % 99;
    const ref = gcCodif("NOTE","O01.02",null,YEAR,seqIdx);
    const note = {...noteForm,id:"NOTE-"+Date.now(),ref,createdAt:new Date().toISOString(),createdBy:currentUser?.name};
    saveNotes([note,...notesList]);
    setNoteForm({title:"",content:"",category:"NOTE",priority:"NORMALE",tags:"",color:"#6366F1"});
    setEditNote(null);
  };

  const PRIO_CFG = {HAUTE:{c:"#EF4444"},MOYENNE:{c:"#F59E0B"},NORMALE:{c:"#3B82F6"},BASSE:{c:"#6B7280"}};
  const NOTE_COLORS = ["#C41E3A","#3B82F6","#22C55E","#F59E0B","#A855F7","#EC4899","#0891B2"];
  const NOTE_CATS = ["NOTE","MÉMO","IDÉE","RAPPEL","IMPORTANT","TÂCHE","RÉUNION"];

  const activeDossiers = dossiers.filter(d=>!["ARCHIVE","ANNULE"].includes(d.status));
  const tasksByDossier = taches.reduce((a,t)=>{const k=t.dossier||"libre";a[k]=(a[k]||0)+1;return a;},{});

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 180px)"}}>
      {/* Header banner */}
      <div style={{background:"linear-gradient(135deg,#EC4899 15,#8B5CF6 15)",border:"1px solid #EC489944",borderRadius:10,padding:"9px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>🗂️</span>
        <div style={{flex:1}}>
          <div style={{color:"#EC4899",fontWeight:800,fontSize:11}}>Gestion Rapide & Kanban — Processus O01.02</div>
          <div style={{color:T.textMuted,fontSize:9}}>Tâches Kanban · Dossiers · Notes rapides · Archives — Codification {`TCHE-SEQ-PROC.SOUSPROC/${YEAR}`}</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {[["kanban",kanbanCards.length,"#EC4899"],["taches",taches.length,"#F59E0B"],["dossiers",activeDossiers.length,"#3B82F6"],["notes",notesList.length,"#22C55E"],["archives",archives.length,"#6B7280"]].map(([k,v,c])=>(
            <span key={k} onClick={()=>setTab(k)} style={{background:c+"22",color:c,borderRadius:5,padding:"3px 9px",fontSize:9,fontWeight:700,cursor:"pointer",border:`1px solid ${tab===k?c+"66":"transparent"}`}}>{v} {k}</span>
          ))}
        </div>
      </div>
      {/* Tabs */}
      <div style={{display:"flex",gap:3,background:T.surface2,borderRadius:10,padding:4,marginBottom:12}}>
        {[["kanban","🗂️ Tableau Kanban"],["taches","⚡ Tâches SI"],["dossiers","📁 Dossiers"],["notes","📝 Notes rapides"],["archives","🗃️ Archives"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?"#EC489922":"transparent",border:tab===t?"1px solid #EC489944":"1px solid transparent",borderRadius:8,padding:"7px 0",color:tab===t?"#EC4899":T.textMuted,cursor:"pointer",fontSize:10,fontWeight:tab===t?700:400}}>{l}</button>
        ))}
      </div>

      {/* KANBAN */}
      {tab==="kanban"&&(
        <div style={{flex:1,overflowX:"auto",display:"flex",gap:12,paddingBottom:8}}>
          {kanbanCols.map(col=>{
            const colCards = kanbanCards.filter(c=>c.colId===col.id&&(!taskSearch||c.title.toLowerCase().includes(taskSearch.toLowerCase())));
            return (
              <div key={col.id} style={{minWidth:240,width:240,flexShrink:0,background:T.surface2,border:`2px solid ${col.color}33`,borderRadius:12,display:"flex",flexDirection:"column",maxHeight:"100%",overflow:"hidden"}}
                onDragOver={e=>e.preventDefault()}
                onDrop={e=>{e.preventDefault();if(dragging)moveCard(dragging,col.id);}}>
                <div style={{padding:"10px 12px",borderBottom:`2px solid ${col.color}44`,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:col.color,fontWeight:800,fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{col.label}</span>
                  <span style={{background:col.color+"22",color:col.color,borderRadius:10,padding:"1px 7px",fontSize:9,fontWeight:700,flexShrink:0}}>{colCards.length}</span>
                  {/* Move left */}
                  {kanbanCols.indexOf(col)>0&&<button title="Déplacer à gauche" onClick={()=>{const idx=kanbanCols.indexOf(col);const next=[...kanbanCols];[next[idx-1],next[idx]]=[next[idx],next[idx-1]];saveKanban(next,null);}} style={{background:"transparent",border:"none",color:T.textDim,cursor:"pointer",fontSize:11,padding:"1px 3px",flexShrink:0}}>◀</button>}
                  {/* Move right */}
                  {kanbanCols.indexOf(col)<kanbanCols.length-1&&<button title="Déplacer à droite" onClick={()=>{const idx=kanbanCols.indexOf(col);const next=[...kanbanCols];[next[idx],next[idx+1]]=[next[idx+1],next[idx]];saveKanban(next,null);}} style={{background:"transparent",border:"none",color:T.textDim,cursor:"pointer",fontSize:11,padding:"1px 3px",flexShrink:0}}>▶</button>}
                  <button onClick={()=>setShowNewCard(showNewCard===col.id?null:col.id)} style={{background:col.color+"22",border:"none",color:col.color,borderRadius:5,padding:"2px 7px",cursor:"pointer",fontWeight:700,fontSize:12,flexShrink:0}}>+</button>
                  {/* Delete column */}
                  <button title="Supprimer la colonne" onClick={async()=>{const ok=await gcConfirm(`Supprimer la colonne "${col.label}" ? Les cartes restantes seront supprimées.`,"Supprimer colonne","🗑️",true);if(ok){saveKanban(kanbanCols.filter(c=>c.id!==col.id),kanbanCards.filter(c=>c.colId!==col.id));}}} style={{background:"#EF444422",border:"none",color:"#EF4444",borderRadius:5,padding:"2px 6px",cursor:"pointer",fontSize:10,flexShrink:0}}>🗑</button>
                </div>
                {showNewCard===col.id&&(
                  <div style={{padding:"8px 10px",borderBottom:`1px solid ${T.border}`,background:T.surface3}}>
                    <input value={newCard.title} onChange={e=>setNewCard(c=>({...c,title:e.target.value}))} autoFocus placeholder="Titre de la tâche…" style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11,boxSizing:"border-box",marginBottom:4}}/>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:4}}>
                      <select value={newCard.priority} onChange={e=>setNewCard(c=>({...c,priority:e.target.value}))} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 5px",color:T.text,fontSize:9}}>
                        {["HAUTE","MOYENNE","NORMALE","BASSE"].map(p=><option key={p} value={p}>{p}</option>)}
                      </select>
                      <select value={newCard.subproc} onChange={e=>setNewCard(c=>({...c,subproc:e.target.value}))} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 5px",color:T.text,fontSize:9}}>
                        {GC_ALL_SUBPROCS.map(s=><option key={s.code} value={s.code}>{s.code}</option>)}
                      </select>
                    </div>
                    <input value={newCard.dueDate} onChange={e=>setNewCard(c=>({...c,dueDate:e.target.value}))} type="date" style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 5px",color:T.text,fontSize:9,boxSizing:"border-box",marginBottom:4}}/>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>addCard(col.id)} style={{flex:1,background:col.color,border:"none",color:"#fff",borderRadius:6,padding:"5px",cursor:"pointer",fontWeight:700,fontSize:10}}>✓ Ajouter</button>
                      <button onClick={()=>setShowNewCard(null)} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:10}}>✕</button>
                    </div>
                  </div>
                )}
                <div style={{flex:1,overflowY:"auto",padding:"8px 8px",display:"flex",flexDirection:"column",gap:6}}>
                  {colCards.map(card=>{
                    const prio = PRIO_CFG[card.priority]||PRIO_CFG.NORMALE;
                    const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();
                    return (
                      <div key={card.id} draggable onDragStart={()=>setDragging(card.id)} onDragEnd={()=>setDragging(null)}
                        style={{background:T.surface,border:`2px solid ${isOverdue?"#EF444488":prio.c+"33"}`,borderRadius:9,padding:"8px 10px",cursor:"grab",userSelect:"none",position:"relative"}}>
                        <div style={{fontWeight:700,fontSize:11,color:T.text,marginBottom:4,lineHeight:1.3}}>{card.title}</div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:4}}>
                          <span style={{background:prio.c+"22",color:prio.c,borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{card.priority}</span>
                          <span style={{background:"#6366F122",color:"#6366F1",borderRadius:4,padding:"1px 5px",fontSize:8,fontFamily:"monospace"}}>{card.subproc}</span>
                          {card.dueDate&&<span style={{background:isOverdue?"#EF444422":"#22C55E22",color:isOverdue?"#EF4444":"#22C55E",borderRadius:4,padding:"1px 5px",fontSize:8}}>📅 {card.dueDate}</span>}
                          {(card.tags||[]).slice(0,2).map(t=><span key={t} style={{background:T.surface2,color:T.textDim,borderRadius:4,padding:"1px 5px",fontSize:8}}>#{t}</span>)}
                        </div>
                        <div style={{display:"flex",gap:4,alignItems:"center"}}>
                          <span style={{color:T.textDim,fontSize:8,fontFamily:"monospace",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{card.ref}</span>
                          <button onClick={()=>deleteCard(card.id)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10,padding:"1px 4px"}}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                  {colCards.length===0&&<div style={{color:T.textDim,fontSize:10,textAlign:"center",padding:"16px 0"}}>Vide</div>}
                </div>
              </div>
            );
          })}
          {/* Add column */}
          <div style={{minWidth:180,flexShrink:0}}>
            {showNewCol?(
              <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:10}}>
                <input value={newColLabel} onChange={e=>setNewColLabel(e.target.value)} autoFocus placeholder="Nom de la colonne…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box",marginBottom:6}}/>
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>{if(newColLabel.trim()){const nc={id:"col-"+Date.now(),label:newColLabel,color:"#6366F1"};saveKanban([...kanbanCols,nc],null);setNewColLabel("");setShowNewCol(false);}}} style={{flex:1,background:"#6366F1",border:"none",color:"#fff",borderRadius:6,padding:"5px",cursor:"pointer",fontWeight:700,fontSize:10}}>✓ Créer</button>
                  <button onClick={()=>setShowNewCol(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:10}}>✕</button>
                </div>
              </div>
            ):(
              <button onClick={()=>setShowNewCol(true)} style={{width:"100%",background:"transparent",border:`2px dashed ${T.border}`,borderRadius:10,padding:"20px 14px",cursor:"pointer",color:T.textDim,fontSize:11,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <span style={{fontSize:20}}>+</span>
                <span>Ajouter colonne</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* TÂCHES SI */}
      {tab==="taches"&&(
        <div style={{flex:1,overflowY:"auto"}}>
          <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
            <input value={taskSearch} onChange={e=>setTaskSearch(e.target.value)} placeholder="🔍 Rechercher tâche…" style={{flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}/>
            <span style={{color:T.textDim,fontSize:10}}>{taches.length} tâche(s)</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {taches.filter(t=>!taskSearch||(t.titre+t.dossier).toLowerCase().includes(taskSearch.toLowerCase())).map(t=>{
              const prio=PRIO_CFG[t.priority]||PRIO_CFG.NORMALE;
              const dos=dossiers.find(d=>d.id===t.dossier);
              return (
                <div key={t.id} style={{background:T.surface2,border:`1px solid ${prio.c}33`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:4,height:36,borderRadius:2,background:prio.c,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:600,fontSize:12}}>{t.titre}</div>
                    <div style={{display:"flex",gap:8,marginTop:3}}>
                      {dos&&<span style={{color:T.textDim,fontSize:9}}>📁 {dos.ref}</span>}
                      {t.deadline&&<span style={{color:T.textDim,fontSize:9}}>📅 {t.deadline}</span>}
                      {t.assignedTo&&<span style={{color:T.textDim,fontSize:9}}>👤 {(users||[]).find(u=>u.id===t.assignedTo)?.name||t.assignedTo}</span>}
                    </div>
                  </div>
                  <div style={{background:`${prio.c}22`,color:prio.c,borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700}}>{t.status||"EN_COURS"}</div>
                </div>
              );
            })}
            {taches.length===0&&<div style={{textAlign:"center",color:T.textDim,padding:30,fontSize:13}}>Aucune tâche SI</div>}
          </div>
        </div>
      )}

      {/* DOSSIERS */}
      {tab==="dossiers"&&(
        <div style={{flex:1,overflowY:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
            {activeDossiers.map(d=>{
              const sub=GC_ALL_SUBPROCS.find(s=>s.code===d.process+".0"||d.subproc===s.code);
              return (
                <div key={d.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontFamily:"monospace",fontSize:9,color:"#6366F1",marginBottom:4}}>{d.ref||d.id}</div>
                  <div style={{fontWeight:700,fontSize:12,color:T.text,marginBottom:3}}>{d.client}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginBottom:6}}>{d.objet}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    <span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700}}>{d.process}</span>
                    <span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:4,padding:"1px 6px",fontSize:9}}>{d.status}</span>
                    <span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 6px",fontSize:9}}>{tasksByDossier[d.id]||0} tâche(s)</span>
                  </div>
                </div>
              );
            })}
            {activeDossiers.length===0&&<div style={{textAlign:"center",color:T.textDim,padding:30,fontSize:13}}>Aucun dossier actif</div>}
          </div>
        </div>
      )}

      {/* NOTES */}
      {tab==="notes"&&(
        <div style={{flex:1,overflowY:"auto",display:"flex",gap:12}}>
          <div style={{width:240,flexShrink:0,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:10}}>
              <input value={noteForm.title} onChange={e=>setNoteForm(f=>({...f,title:e.target.value}))} placeholder="Titre…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:12,fontWeight:700,marginBottom:6,boxSizing:"border-box"}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:4}}>
                <select value={noteForm.category} onChange={e=>setNoteForm(f=>({...f,category:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 5px",color:T.text,fontSize:9}}>
                  {NOTE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <select value={noteForm.priority} onChange={e=>setNoteForm(f=>({...f,priority:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 5px",color:T.text,fontSize:9}}>
                  {["HAUTE","MOYENNE","NORMALE"].map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <textarea value={noteForm.content} onChange={e=>setNoteForm(f=>({...f,content:e.target.value}))} placeholder="Contenu de la note…" rows={4} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:6}}/>
              <div style={{display:"flex",gap:3,marginBottom:6}}>
                {NOTE_COLORS.map(c=><button key={c} onClick={()=>setNoteForm(f=>({...f,color:c}))} style={{width:14,height:14,borderRadius:"50%",background:c,border:noteForm.color===c?"2px solid #fff":"1px solid transparent",cursor:"pointer",padding:0,flexShrink:0}}/>)}
              </div>
              <button onClick={addNote} style={{width:"100%",background:"#EC4899",border:"none",color:"#fff",borderRadius:7,padding:"7px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Créer note</button>
            </div>
          </div>
          <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8,alignContent:"start",overflowY:"auto"}}>
            {notesList.map(n=>{
              const prio=PRIO_CFG[n.priority||"NORMALE"]||PRIO_CFG.NORMALE;
              return (
                <div key={n.id} style={{background:n.color+"18",border:`2px solid ${n.color}44`,borderRadius:10,padding:"10px 12px",position:"relative"}}>
                  <div style={{display:"flex",gap:4,marginBottom:4}}>
                    <span style={{background:n.color+"33",color:n.color,borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{n.category}</span>
                    <span style={{background:prio.c+"22",color:prio.c,borderRadius:4,padding:"1px 5px",fontSize:8}}>{n.priority}</span>
                  </div>
                  <div style={{fontWeight:700,fontSize:11,color:T.text,marginBottom:4}}>{n.title}</div>
                  <div style={{color:T.textMuted,fontSize:10,lineHeight:1.5}}>{n.content?.slice(0,100)}{n.content?.length>100?"…":""}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                    <span style={{color:T.textDim,fontSize:8,fontFamily:"monospace"}}>{n.ref}</span>
                    <button onClick={()=>saveNotes(notesList.filter(x=>x.id!==n.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:11,padding:2}}>🗑️</button>
                  </div>
                </div>
              );
            })}
            {notesList.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:30,fontSize:12,gridColumn:"1/-1"}}>Aucune note rapide</div>}
          </div>
        </div>
      )}

      {/* ARCHIVES */}
      {tab==="archives"&&(
        <div style={{flex:1,overflowY:"auto"}}>
          <div style={{color:T.textMuted,fontSize:10,marginBottom:10}}>🗃️ {archives.length} tâche(s) archivée(s) depuis Kanban</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {archives.map(a=>(
              <div key={a.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{color:T.text,fontSize:11,fontWeight:600}}>{a.title}</div>
                  <div style={{color:T.textDim,fontSize:9,fontFamily:"monospace"}}>{a.ref} · Archivé le {new Date(a.archivedAt||a.createdAt).toLocaleDateString("fr-FR")} par {a.archivedBy||"—"}</div>
                </div>
                <span style={{background:"#6B708022",color:"#6B7080",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>ARCHIVÉ</span>
              </div>
            ))}
            {archives.length===0&&<div style={{textAlign:"center",color:T.textDim,padding:30,fontSize:12}}>Aucune archive</div>}
          </div>
        </div>
      )}
    </div>
  );
}


