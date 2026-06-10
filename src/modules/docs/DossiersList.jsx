import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// DossiersList.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, _tActive, gcPushNotif, playSound, formatDate, gcGetDelaiConfig, gcAntiRedondance, generateAccessCode, _dataUrlToBlob, useSI, gcFileSave, _activeUser, formatDateTime, getProcColor, getUser, gcCalcDueDate, gcDownloadDoc, gcDocIcon, gcDelaiStatut, gcReadFile, daysLeft, dsSave, dsMarkDeleted, dsDeleteItemFromArray, getProxyUrl, getJWTToken } from '../../core/index.js';
import { gcDossierZipUrl } from '../../core/filestore.js';
import { STATUS_CONFIG, PRIORITY_CONFIG, GC_CIRCUITS_INIT, GC_DOCS_REQUIS, GC_ACTIVITES, CODES, gcViewDoc } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge, ProgressBar} from '../../components/UI.jsx';
import { TransferModal } from './ArchivagePanel.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function QuickPartnerCreate({ T, partners=[], setPartnersSync=_noop, selectedId, onSelect, canCreate=false, currentUser=null }){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'docs',
          nom: file.name, taille: file.size, type: file.type,
          uploadedBy: currentUser?.id || 'SYSTEM', uploadedByName: currentUser?.name || 'Système',
          ...extraMeta});
        results.push({
          ...ref, name: file.name, size: file.size, mimeType: file.type,
          sizeStr: file.size < 1048576 ? `${Math.round(file.size/1024)} Ko` : `${(file.size/1048576).toFixed(1)} Mo`,
          ext: '.' + file.name.split('.').pop().toLowerCase(),
          uploadedAt: new Date().toISOString(), downloads: 0});
      } catch(e) { console.error('[upload docs]', file.name, e.message); }
    }
    return results;
  };

  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [open, setOpen] = React.useState(false);
  const PARTNER_TYPES = [
    { v:"client",      label:"🤝 Client" },
    { v:"fournisseur", label:"📦 Fournisseur" },
    { v:"partenaire",  label:"🌐 Partenaire" },
    { v:"regulateur",  label:"⚖️ Réglementaire" },
    { v:"etat",        label:"🏛️ État / Institution" },
  ];
  const [form, setForm] = React.useState({ nom:"", type:"client", contact:"", email:"", tel:"", secteur:"", adresse:"" });
  const T2 = T || {};
  if (!canCreate) return null;
  const handleCreate = () => {
    if (!form.nom.trim()) { gcAlert("Le nom est requis."); return; }
    const dup = partners.find(p => p.nom.trim().toLowerCase() === form.nom.trim().toLowerCase());
    if (dup) { gcAlert(`⚠️ Un partenaire nommé "${dup.nom}" existe déjà. Sélectionnez-le dans la liste.`); onSelect && onSelect(dup.id); setOpen(false); return; }
    const newP = { id:"PAR-"+Date.now(), nom:form.nom.trim(), type:form.type, contact:form.contact.trim()||null, email:form.email.trim()||null, tel:form.tel.trim()||null, secteur:form.secteur.trim()||null, adresse:form.adresse.trim()||null, dossiersIds:[],
      // Champs CRM — pour synchronisation avec GestionDocsUnifiee et Finance
      segment:"PME", riskLevel:"FAIBLE", kycStatut:"EN_ATTENTE",
      statut: form.type === "client" ? "PROSPECT" : "ACTIF",
      sourceAcquisition:"Réseau",
      createdAt:new Date().toISOString() };
    setPartnersSync(prev => [...prev, newP]);
    // Pass newP directly so onSelect doesn't depend on stale partners state
    onSelect && onSelect(newP.id, newP);
    setOpen(false);
    setForm({ nom:"", type:"client", contact:"", email:"", tel:"", secteur:"", adresse:"" });
    playSound("success");
  };
  return (
    <div style={{marginTop:6}}>
      {!open ? (
        <button type="button" onClick={()=>setOpen(true)}
          style={{background:"#22C55E15",border:"1px dashed #22C55E66",color:"#22C55E",borderRadius:7,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,width:"100%",textAlign:"center"}}>
          ➕ Créer un nouveau client / collaborateur externe
        </button>
      ) : (
        <div style={{background:T2.surface2||"#0D2257",border:"1px solid #22C55E44",borderRadius:10,padding:"12px 14px",marginTop:4}}>
          <div style={{color:"#22C55E",fontWeight:800,fontSize:11,marginBottom:8}}>🆕 Nouveau collaborateur / client externe</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T2.textMuted||"#94A3B8",fontSize:10,display:"block",marginBottom:3,fontWeight:600,textTransform:"uppercase"}}>Nom / Raison sociale *</label>
              <input value={form.nom} onChange={e=>setForm(f=>({...f,nom:e.target.value}))} placeholder="Ex : GABONAISE DES SERVICES SARL"
                style={{width:"100%",background:T2.surface3||"#0A1E4A",border:"1px solid #22C55E55",borderRadius:7,padding:"8px 11px",color:T2.text||"#E8EDF5",fontSize:12,boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:T2.textMuted||"#94A3B8",fontSize:10,display:"block",marginBottom:3,fontWeight:600,textTransform:"uppercase"}}>Type *</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}
                style={{width:"100%",background:T2.surface3||"#0A1E4A",border:"1px solid #22C55E44",borderRadius:7,padding:"8px 10px",color:T2.text||"#E8EDF5",fontSize:12}}>
                {PARTNER_TYPES.map(pt=><option key={pt.v} value={pt.v}>{pt.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{color:T2.textMuted||"#94A3B8",fontSize:10,display:"block",marginBottom:3,fontWeight:600,textTransform:"uppercase"}}>Secteur</label>
              <input value={form.secteur} onChange={e=>setForm(f=>({...f,secteur:e.target.value}))} placeholder="Ex : BTP, Commerce, Droit…"
                style={{width:"100%",background:T2.surface3||"#0A1E4A",border:`1px solid ${T2.border||"#1E3050"}`,borderRadius:7,padding:"8px 11px",color:T2.text||"#E8EDF5",fontSize:12,boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:T2.textMuted||"#94A3B8",fontSize:10,display:"block",marginBottom:3,fontWeight:600,textTransform:"uppercase"}}>Contact principal</label>
              <input value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))} placeholder="Nom du contact"
                style={{width:"100%",background:T2.surface3||"#0A1E4A",border:`1px solid ${T2.border||"#1E3050"}`,borderRadius:7,padding:"8px 11px",color:T2.text||"#E8EDF5",fontSize:12,boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:T2.textMuted||"#94A3B8",fontSize:10,display:"block",marginBottom:3,fontWeight:600,textTransform:"uppercase"}}>Téléphone</label>
              <input value={form.tel} onChange={e=>setForm(f=>({...f,tel:e.target.value}))} placeholder="+241 …"
                style={{width:"100%",background:T2.surface3||"#0A1E4A",border:`1px solid ${T2.border||"#1E3050"}`,borderRadius:7,padding:"8px 11px",color:T2.text||"#E8EDF5",fontSize:12,boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:T2.textMuted||"#94A3B8",fontSize:10,display:"block",marginBottom:3,fontWeight:600,textTransform:"uppercase"}}>Email</label>
              <input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@exemple.com"
                style={{width:"100%",background:T2.surface3||"#0A1E4A",border:`1px solid ${T2.border||"#1E3050"}`,borderRadius:7,padding:"8px 11px",color:T2.text||"#E8EDF5",fontSize:12,boxSizing:"border-box"}} />
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button type="button" onClick={handleCreate}
              style={{flex:1,background:"linear-gradient(135deg,#22C55E,#16A34A)",border:"none",color:"#fff",borderRadius:8,padding:"8px",cursor:"pointer",fontWeight:800,fontSize:12}}>
              ✅ Créer & Sélectionner
            </button>
            <button type="button" onClick={async ()=>{setOpen(false);setForm({nom:"",type:"client",contact:"",email:"",tel:"",secteur:"",adresse:"" });}}
              style={{background:T2.surface3||"#0A1E4A",border:`1px solid ${T2.border||"#1E3050"}`,color:T2.textMuted||"#94A3B8",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:11}}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// FIX v126 — Helper partagé : clôture un dossier ET synchronise tâches + RDV liés
// Utilisé par bulk-close, DossierDetail "Signer & Clôturer" et "Admin Clôturer"
// FIX v135 — Extract constant to separate scope to avoid fast-refresh violation
const DossiersListDefaults = {};

// FIX v135 — Utility function export (non-component) - disabling react-refresh rule
 
export const gcCloseDossierWithSync = ({ dossierId, extra = {}, taches, setTaches, rdvs, setRdvs }) => {
  const today = new Date().toISOString().split("T")[0];
  const now   = new Date().toISOString();
  // Fermer les tâches actives liées
  if (setTaches) {
    setTaches(prev => {
      const hasLinked = prev.some(t => t.dossier === dossierId && !["TERMINÉ","TERMINE","ANNULE"].includes(t.status));
      if (!hasLinked) return prev;
      const u = prev.map(t =>
        t.dossier === dossierId && !["TERMINÉ","TERMINE","ANNULE"].includes(t.status)
          ? { ...t, status: "TERMINÉ", closedWithDossier: true, closedAt: now }
          : t
      );
      try { _lsSet("gc-taches", JSON.stringify(u)); dsSave("taches",u).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return u;
    });
  }
  // Annuler les RDV futurs liés
  if (setRdvs) {
    setRdvs(prev => {
      const hasFuture = prev.some(r => r.dossierId === dossierId && r.date >= today && r.status !== "ANNULE");
      if (!hasFuture) return prev;
      const u = prev.map(r =>
        r.dossierId === dossierId && r.date >= today && r.status !== "ANNULE"
          ? { ...r, status: "ANNULE", annulationMotif: "Dossier clôturé" }
          : r
      );
      try { _lsSet("gc-rdvs", JSON.stringify(u)); dsSave("rdvs",u).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return u;
    });
  }
};


// ── CollabModal — DOIT être hors DossiersList pour éviter re-mount à chaque render ──
function CollabModal({ T, dossier, users, localUser, partners, handleSaveCollabs, setShowCollabModal }) {
  const [selected, setSelected] = useState(dossier.collaborators||[]);
  const [selectedExt, setSelectedExt] = useState(dossier.externalCollaborators||[]);
  const [tab, setTab] = useState("internes");
  const toggle = (id) => setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const toggleExt = (id) => setSelectedExt(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const assignable = users.filter(u=>_activeUser(u)&&u.id!==localUser.id&&((localUser?.isAdmin || localUser?.level >= 6)||u.level<=localUser.level||localUser.level>=5));
  return (
    <Modal title={`👥 Collaborateurs — ${dossier.ref}`} onClose={()=>setShowCollabModal(null)} T={T} wide>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["internes","👤 Internes ("+assignable.length+")"],["externes","🌐 Externes ("+partners.length+")"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,background:tab===k?"#3B82F6":T.surface2,color:tab===k?"#fff":T.textMuted,border:`1px solid ${tab===k?"#3B82F6":T.border}`,borderRadius:8,padding:"7px 12px",cursor:"pointer",fontWeight:700,fontSize:12}}>{l}</button>
        ))}
      </div>
      {tab==="internes"&&(
        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:280,overflowY:"auto"}}>
          {assignable.map(u=>(
            <div key={u.id} onClick={()=>toggle(u.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:selected.includes(u.id)?"#3B82F620":T.surface2,border:`1px solid ${selected.includes(u.id)?"#3B82F6":T.border}`,borderRadius:8,cursor:"pointer"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:u.color||"#3B82F6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,overflow:"hidden",flexShrink:0}}>
                {u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar}
              </div>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:700,fontSize:12}}>{u.name}</div>
                <div style={{color:T.textMuted,fontSize:10}}>{u.role} — Niv.{u.level}</div>
              </div>
              <span style={{fontSize:14}}>{selected.includes(u.id)?"✅":"⬜"}</span>
            </div>
          ))}
        </div>
      )}
      {tab==="externes"&&(
        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:280,overflowY:"auto"}}>
          {partners.map(p=>(
            <div key={p.id} onClick={()=>toggleExt(p.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:selectedExt.includes(p.id)?"#C41E3A20":T.surface2,border:`1px solid ${selectedExt.includes(p.id)?"#C41E3A":T.border}`,borderRadius:8,cursor:"pointer"}}>
              <span style={{fontSize:18}}>{p.type==="client"?"🤝":p.type==="fournisseur"?"📦":p.type==="regulateur"?"⚖️":"🌐"}</span>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:700,fontSize:12}}>{p.nom}</div>
                <div style={{color:T.textMuted,fontSize:10}}>{p.type}</div>
              </div>
              <span style={{fontSize:14}}>{selectedExt.includes(p.id)?"✅":"⬜"}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <Btn variant="primary" onClick={()=>handleSaveCollabs(selected,selectedExt)}>✅ Enregistrer ({selected.length}+{selectedExt.length})</Btn>
        <Btn variant="ghost" onClick={()=>setShowCollabModal(null)}>Annuler</Btn>
      </div>
    </Modal>
  );
}

// ── UploadModal — DOIT être hors DossiersList pour éviter re-mount à chaque render ──
function UploadModal({ T, dossier, dossierFiles, localUser, uploadForm, setUploadForm, fileUploadStatus, setFileUploadStatus, uploadRef, handleFileSelect, handleSaveUpload, handleDownloadFile, handleViewFile, handleDeleteFile, saveDossierFiles, setShowUploadModal, gcDocIcon, formatDate }) {
  const thisDossierFiles = (dossierFiles||[]).filter(f=>f&&f.dossierId===dossier.id);
  return (
    <Modal title={`📎 Fichiers — ${dossier.ref}`} onClose={()=>setShowUploadModal(null)} T={T} wide>
      {thisDossierFiles.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{color:"#3B82F6",fontWeight:800,fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:0.8}}>Fichiers existants ({thisDossierFiles.length})</div>
          {thisDossierFiles.map(f=>(
            <div key={f.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 12px",background:T.surface2,borderRadius:8,border:`1px solid ${T.border}`,marginBottom:4}}>
              <span style={{fontSize:18}}>{f.ext===".pdf"?"📄":f.ext===".xlsx"||f.ext===".xls"?"📊":f.ext===".docx"||f.ext===".doc"?"📝":[".jpg",".jpeg",".png"].includes(f.ext)?"🖼️":"📁"}</span>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontSize:12,fontWeight:700}}>{f.name}</div>
                <div style={{color:T.textMuted,fontSize:10}}>{f.sizeStr} · {formatDate(f.uploadedAt)} · {f.uploadedByName} · Accès Niv.{f.accessLevel}+</div>
                {f.description&&<div style={{color:T.textMuted,fontSize:10,fontStyle:"italic"}}>{f.description}</div>}
              </div>
              {(f.accessLevel<=(Number(localUser?.level)||0)||(localUser?.isAdmin || (Number(localUser?.level)||0) >= 6))?(
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>handleViewFile(f)} title="Voir / Ouvrir" style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:6,padding:"4px 8px",color:"#A855F7",cursor:"pointer",fontSize:11}}>👁️</button>
                  <button onClick={()=>handleDownloadFile(f)} title="Télécharger" style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:6,padding:"4px 10px",color:"#3B82F6",cursor:"pointer",fontSize:11}}>⬇ {f.downloads>0?`(${f.downloads})`:""}</button>
                </div>
              ):(
                <span style={{color:"#EF4444",fontSize:10,padding:"4px 8px"}}>🔒 Niv.{f.accessLevel}+</span>
              )}
              {(f.uploadedBy===localUser?.id||(Number(localUser?.level)||0)>=4||(localUser?.isAdmin || (Number(localUser?.level)||0) >= 6))&&(
                <button onClick={()=>handleDeleteFile(f)} style={{background:"#EF444415",border:"1px solid #EF444444",borderRadius:6,padding:"4px 8px",color:"#EF4444",cursor:"pointer",fontSize:11}}>🗑️</button>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{background:"#3B82F608",border:"1px solid #3B82F633",borderRadius:10,padding:"14px 16px"}}>
        <div style={{color:"#3B82F6",fontWeight:800,fontSize:11,marginBottom:10,textTransform:"uppercase",letterSpacing:0.8}}>Ajouter un fichier</div>
        <div style={{position:"relative",marginBottom:10,cursor:"pointer"}} onClick={()=>uploadRef.current?.click()}>
          <input ref={uploadRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png,.txt,.csv,.pptx,.zip" style={{display:"none"}} onChange={handleFileSelect} />
          <div style={{background:T.surface2,border:`2px dashed ${uploadForm.fileData?"#22C55E":fileUploadStatus?.type==="error"?"#EF4444":T.border}`,borderRadius:10,padding:"20px",textAlign:"center",color:uploadForm.fileData?"#22C55E":T.textMuted,fontSize:12,transition:"all 0.2s"}}>
            {fileUploadStatus?.type === "loading"
              ? <><span style={{fontSize:20}}>⏳</span><br/>Lecture en cours…</>
              : uploadForm.fileData
                ? <>{gcDocIcon(uploadForm.fileExt?.replace(".","").toUpperCase())} {uploadForm.fileName} ({uploadForm.fileSize<1024*1024?`${Math.round(uploadForm.fileSize/1024)} Ko`:`${(uploadForm.fileSize/1024/1024).toFixed(1)} Mo`})</>
                : <>📂 Cliquer pour sélectionner un fichier<br/><span style={{fontSize:10,opacity:0.7}}>PDF, DOCX, XLSX, Images, CSV — max 10 Mo</span></>}
          </div>
        </div>
        {fileUploadStatus && fileUploadStatus.type !== "loading" && (
          <div style={{fontSize:11,color:fileUploadStatus.type==="ok"?"#22C55E":"#EF4444",fontWeight:600,marginBottom:8}}>{fileUploadStatus.msg}</div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <InputField label="Description (optionnel)" value={uploadForm.description} onChange={e=>setUploadForm(f=>({...f,description:e.target.value}))} T={T} />
          <div>
            <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>Niveau d'accès minimum</label>
            <select value={uploadForm.accessLevel} onChange={e=>setUploadForm(f=>({...f,accessLevel:Number(e.target.value)}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
              {[1,2,3,4,5,6].map(n=><option key={n} value={n}>Niveau {n}+</option>)}
            </select>
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <Btn variant="primary" onClick={handleSaveUpload} disabled={!uploadForm.fileData || fileUploadStatus?.type==="loading"}>⬆ Téléverser</Btn>
        <Btn variant="ghost" onClick={async ()=>{setShowUploadModal(null);setFileUploadStatus(null);}}>Fermer</Btn>
      </div>
    </Modal>
  );
}

export const DossiersList = React.memo(function DossiersList() {
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
    dossierFiles = [], saveDossierFiles, standaloneDocuments = [], saveStandaloneDocs,
    pendingDeleteApprovals = [], savePendingDeleteApprovals} = si;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [dosType, setDosType] = useState("ALL");
  const [selectedDossiers, setSelectedDossiers] = useState([]); // multi-select checkboxes
  const [selectedDocs, setSelectedDocs] = useState([]); // multi-select for docs
  const [newDossierForm, setNewDossierForm] = useState({ client:"", objet:"", process:localUser.process||"O02", priority:"NORMALE", dueDate:"", amount:"", nature:"EXTERNE", submitTo:"", submitAction:"TRAITER", submitMotif:"", partnerId:"", confidentiel:false, confPass:"", confAccess:[] });
  const [newDocForm, setNewDocForm] = useState({ titre:"", type:"DOC", process:localUser.process||"O02", description:"", nature:"INTERNE", linkedUserId:"", partnerId:"", dossierId:"", submitTo:"", submitAction:"CONSULTER", accessLevel: 1, fileData:"", fileName:"", fileSize:0, fileExt:"", fileMime:"" });
  const [dossierSubTab, setDossierSubTab] = useState("dossiers");
  const [docSearch, setDocSearch] = useState("");
  const [docFilter, setDocFilter] = useState("ALL");
  const [docTypeFilter, setDocTypeFilter] = useState("ALL");
  const [docProcessFilter, setDocProcessFilter] = useState("ALL");
  const [docSort, setDocSort] = useState("date_desc");
  const docUploadRef = useRef(null);

  const [showDeleteApproval, setShowDeleteApproval] = useState(null);
  const [showDeleteReview, setShowDeleteReview] = useState(null);
  const [showCollabModal, setShowCollabModal] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(null);
  const [showNewDossier, setShowNewDossier] = useState(false);
  useEffect(() => {
    const h = () => setShowNewDossier(true);
    window.addEventListener('gc:open-new-dossier', h);
    return () => window.removeEventListener('gc:open-new-dossier', h);
  }, []);
  // File viewer — single file or multi-file picker
  const [showFileViewer, setShowFileViewer] = useState(null); // {files:[{src,name,mime}], idx:0}

  // ── Unified file open utility ─────────────────────────────────────
  // FIX v152 — Priorité serverUrl (fichier serveur) ; fallback dataUrl (cache IDB / offline)
  // FIX FILE-URL — serverUrl peut être relatif (/api/files/xxx) → le rendre absolu
  const _absUrl = (url) => (url && url.startsWith('/')) ? `${getProxyUrl()}${url}` : (url || null);
  const openDocFile = async (docOrFile) => {
    // 1. Fichier stocké sur le serveur → ouvrir via fetch authentifié
    if (docOrFile.serverUrl || docOrFile.serverId) {
      try {
        const url = _absUrl(docOrFile.serverUrl) || `${getProxyUrl()}/api/files/${docOrFile.serverId}`;
        const token = getJWTToken?.() || null;
        const headers = token ? { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } : {};
        const r = await fetch(url, { headers });
        if (r.ok) {
          const blob = await r.blob();
          const blobUrl = URL.createObjectURL(blob);
          const mime = blob.type || docOrFile.mimeType || docOrFile.fileMime || '';
          const name = docOrFile.name || docOrFile.fileName || docOrFile.nom || 'document';
          if (mime.startsWith('image/')) {
            setShowFileViewer({ files: [{ src: blobUrl, name, mime, blobUrl }], idx: 0 });
          } else {
            window.open(blobUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
          }
          return;
        }
      } catch (err) {
        console.warn('[openDocFile] Erreur lecture serveur, fallback dataUrl :', err.message);
      }
    }
    // 2. Fallback dataUrl / fileData (cache local ou offline)
    const src = docOrFile.fileData || docOrFile.dataUrl;
    if (!src) { gcAlert("Aucun fichier disponible. Le fichier n'a peut-être pas encore été synchronisé."); return; }
    const mime = docOrFile.fileMime || docOrFile.mimeType || "";
    const name = docOrFile.fileName || docOrFile.name || docOrFile.titre || "document";
    if (mime.startsWith("image/")) {
      setShowFileViewer({ files:[{src,name,mime}], idx:0 });
    } else if (mime === "application/pdf" || docOrFile.fileExt === ".pdf" || (name||"").toLowerCase().endsWith(".pdf")) {
      const blob = _dataUrlToBlob(src);
      const url = blob ? URL.createObjectURL(blob) : src;
      window.open(url,"_blank");
    } else {
      const a = document.createElement("a"); a.href=src; a.download=name; a.click();
    }
  };

  // Open all files of a dossier — shows picker if multiple
  // FIX v152 — Inclure les fichiers serverUrl (pas seulement dataUrl/fileData)
  const openDossierFiles = (dossierId) => {
    const files = (dossierFiles||[]).filter(f =>
      f.dossierId === dossierId && (f.dataUrl || f.fileData || f.serverUrl || f.serverId)
    );
    if (!files.length) { gcAlert("Aucun fichier joint à ce dossier."); return; }
    if (files.length === 1) { openDocFile(files[0]); return; }
    setShowFileViewer({
      files: files.map(f => ({
        src:       _absUrl(f.serverUrl) || f.dataUrl || f.fileData || '',
        name:      f.name || f.fileName || f.nom || 'document',
        mime:      f.mimeType || f.fileMime || '',
        id:        f.id,
        serverUrl: _absUrl(f.serverUrl) || (f.serverId ? `${getProxyUrl()}/api/files/${f.serverId}` : null),
      })),
      idx: 0,
    });
  };
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(null);
  // -- Workflow soumission / validation / rejet -----------------------------
  const [showSubmitModal, setShowSubmitModal] = useState(null);   // niv2-3 soumet au responsable
  const [submitForm, setSubmitForm] = useState({action:"VALIDER",motif:"",submitTo:""});
  const [showValidateModal, setShowValidateModal] = useState(null); // responsable valide
  const [validateForm, setValidateForm] = useState({action:"VALIDER",motif:""});
  const [showRejectModal, setShowRejectModal] = useState(null);    // responsable rejette
  const [rejectMotif, setRejectMotif] = useState("");              // motif rejet obligatoire
  const [showEditModal, setShowEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteMotif, setDeleteMotif] = useState("");
  const [uploadForm, setUploadForm] = useState({ description:"", accessLevel:1, fileName:"", fileData:"", fileSize:0, fileExt:"", fileMime:"" });
  const uploadRef = useRef(null);

  const NATURE_CONFIG = {
    INTERNE:{ label:"Interne Cabinet", icon:"🗂️", color:"#3B82F6", desc:"Travaux & docs propres au cabinet" },
    EXTERNE:{ label:"Client / Externe", icon:"📁", color:"#C41E3A", desc:"Dossiers clients, partenaires, fournisseurs" }};

  const findSuperior = (proc) => {
    const inProc = users.filter(u=>_activeUser(u)&&(u.process===proc||u.processes?.includes(proc))&&u.id!==localUser.id&&u.level>localUser.level);
    return inProc.sort((a,b)=>b.level-a.level)[0] || users.find(u=>u.level>=5&&!u.isAdmin) || null;
  };

  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'docs',
          nom: file.name, taille: file.size, type: file.type,
          uploadedBy: localUser?.id || 'SYSTEM', uploadedByName: localUser?.name || 'Système',
          ...extraMeta,
        });
        results.push(ref);
      } catch (err) {
        console.error('[DossiersList] upload error:', err);
        gcAlert(`Erreur upload ${file.name}: ${err.message}`);
      }
    }
    return results;
  };

  const handleCreateDossier = () => {
    if (!newDossierForm.client||!newDossierForm.objet){gcAlert("Veuillez renseigner le client et l'objet.");return;}
    // -- Règle : dossier EXTERNE interdit en dessous de niv 3 -----------------
    if (!canCreateExternal && newDossierForm.nature==="EXTERNE") {
      gcAlert("⛔ Les dossiers externes nécessitent un niveau 3 minimum ou le processus O01.");
      return;
    }
    // -- Règle niv 2 : anti-doublon (même objet + même processus actif) --------
    if (hasDuplicateDossier(newDossierForm.objet, newDossierForm.process)) {
      gcAlert(`⚠️ Un dossier actif avec le même objet "${newDossierForm.objet}" existe déjà dans le processus ${newDossierForm.process}.\n\nPour éviter toute redondance, veuillez utiliser le dossier existant ou modifier l'intitulé.`);
      return;
    }
    // v75 — Anti-redondance système : vérification globale via empreinte
    const dossFP = `${newDossierForm.client}::${newDossierForm.objet}::${newDossierForm.process}`;
    const arCheck = gcAntiRedondance.checkAndRegister("CREATION_DOSSIER", dossFP, localUser.id);
    if (!arCheck.allowed) {
      gcAlert(`⚠️ Un dossier identique (même client, même objet, même processus) a déjà été créé récemment.\n\nCréé le : ${new Date(arCheck.existing.at).toLocaleString("fr-FR")}\n\nSi vous souhaitez créer un nouveau dossier similaire, modifiez l'intitulé de l'objet.`);
      return;
    }
    const num = String(dossiers.length+1).padStart(2,"0");
    const newId = `DOS-A${num}-${newDossierForm.process}.${num}/2026`;
    // Auto-route: si non-O01 crée un dossier EXTERNE, soumettre à O01 en priorité
    const o01Responsible = (!isO01 && newDossierForm.nature==="EXTERNE")
      ? users.find(u=>(u.process==="O01"||(u.processes||[]).includes("O01"))&&u.level>=3&&!u.isAdmin)
      : null;
    const superior = newDossierForm.submitTo
      ? users.find(u=>u.id===newDossierForm.submitTo)
      : o01Responsible || findSuperior(newDossierForm.process);
    const linkedPartner = newDossierForm.partnerId ? partners.find(p=>p.id===newDossierForm.partnerId) : null;
    // FIX v83 — if partner was just created, partners state may not have updated yet.
    // Use client field as fallback (QuickPartnerCreate already sets client=nom on onSelect).
    const partnerNom = linkedPartner?.nom || (newDossierForm.partnerId ? newDossierForm.client : null);

    // FIX v92 — dueDate auto si non saisi : calcul selon processus + priorité (GC_DELAI_CONFIG)
    const autoDate = gcCalcDueDate(newDossierForm.process, newDossierForm.priority);
    const dueDateFinal = newDossierForm.dueDate || autoDate;
    const cfg = gcGetDelaiConfig();
    const delaiJours = cfg.byProcess?.[newDossierForm.process] || cfg.long;
    const delaiType = delaiJours <= cfg.court ? `Court (${cfg.court}j)` : `Long (${cfg.long}j)`;

    const newDossier = {
      id:newId, ref:newId, type:"DOS", nature:newDossierForm.nature,
      client: partnerNom || newDossierForm.client,
      objet:newDossierForm.objet,
      process:newDossierForm.process, status:"ATTENTE_TRAITEMENT",
      priority:newDossierForm.priority,
      assignedTo: superior ? superior.id : localUser.id,
      createdBy:localUser.id, createdAt:new Date().toISOString().split("T")[0],
      dueDate: dueDateFinal,          // FIX v92 — toujours calculé
      delaiType: delaiType,           // FIX v92 — court/long tracé
      delaiJours: delaiJours,         // FIX v92 — nb jours configuré
      progress:0, notes:"", tags:[],
      amount:parseInt(newDossierForm.amount, 10)||0,
      submittedTo: superior?superior.id:null,
      submittedToName: superior?superior.name:null,
      submitAction: newDossierForm.submitAction||"TRAITER",
      submitMotif: newDossierForm.submitMotif||"",
      partnerId: newDossierForm.partnerId||null,
      partnerNom: partnerNom||null,
      partnerType: linkedPartner?.type||null,
      collaborators: [], externalCollaborators: [],
      qrCode: newId,
      confidentiel: localUser.level >= 4 && newDossierForm.confidentiel,
      confPass: localUser.level >= 4 && newDossierForm.confidentiel ? newDossierForm.confPass : null,
      confAccess: localUser.level >= 4 && newDossierForm.confidentiel ? [localUser.id, ...(newDossierForm.confAccess||[])] : null};
    setDossiers(prev => {
      const updated = [...prev, newDossier];
      // Sauvegarder en base de données pour synchronisation
      dsSave("dossiers", updated, localUser.id);
      return updated;
    });
    const codifEntry = {
      id: "COD-DOS-"+Date.now(), ref: newId, type: "DOS",
      process: newDossierForm.process, seq: `A${String(dossiers.length+1).padStart(2,"0")}`,
      subproc: newDossierForm.process, version: "", year: String(new Date().getFullYear()),
      label: `${newDossierForm.objet} — ${partnerNom||newDossierForm.client}`,
      description: `Dossier ${newDossierForm.nature} créé par ${localUser.name}`,
      createdBy: localUser.id, createdAt: new Date().toISOString(), sourceType: "DOSSIER", sourceId: newId};
    if (typeof setCodifRegistry === "function") setCodifRegistry(prev=>[...prev, codifEntry]);
    // FIX v83 — use functional updater so a partner created moments ago (still in flight) is also found
    if (newDossierForm.partnerId) {
      setPartnersSync(prev => prev.map(p =>
        p.id === newDossierForm.partnerId
          ? { ...p, dossiersIds: [...(p.dossiersIds||[]), newId] }
          : p
      ));
    }
    addSessionLog && addSessionLog("CREATION", localUser, { status:"SUCCESS", reason:`Création dossier ${newId}` });
    const submitMsg = superior ? ` → soumis à ${superior.name} [${newDossierForm.submitAction||"TRAITER"}]`:"";
    const now = new Date().toISOString();
    const alertMsg = `📁 Nouveau dossier : ${newId} — ${newDossier.client}${submitMsg}`;
    const processUsers = users.filter(u=>_activeUser(u)&&(u.process===newDossierForm.process||u.level>=4)&&u.id!==localUser.id);
    const targetIds = [...new Set([superior?.id,...processUsers.map(u=>u.id)].filter(Boolean))];
    setNotifications(prev=>[{id:"N"+Date.now(),icon:newDossierForm.nature==="INTERNE"?"🗂️":"📁",message:alertMsg,at:now,read:false,targetUsers:targetIds.length?targetIds:undefined},...prev]);
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"🏷️",message:`🏷️ Référence codifiée automatiquement : ${newId} → Manuel de Codification`,at:now,read:false,targetUsers:[localUser.id]},...prev]);

    // FIX v92 — gcPushNotif cross-user : assigné + responsable processus + DG si urgent
    const notifMsg = `📁 Dossier ${newId} assigné (${delaiType} — éch. ${new Date(dueDateFinal).toLocaleDateString("fr-FR")}) : "${newDossier.objet}" — ${newDossier.client}`;
    const assignedUser = users.find(u=>u.id===newDossier.assignedTo);
    if (assignedUser && assignedUser.id !== localUser.id) {
      gcPushNotif(assignedUser.id, {id:"N"+Date.now()+assignedUser.id, icon:"📁", message:notifMsg, at:now, read:false, module:"dossiers"});
    }
    // Notifier le responsable de processus (niv 4+)
    const procResp = users.find(u=>(u.process===newDossierForm.process||(u.processes||[]).includes(newDossierForm.process))&&u.level>=4&&u.id!==localUser.id&&u.id!==assignedUser?.id);
    if (procResp) {
      gcPushNotif(procResp.id, {id:"N"+Date.now()+procResp.id, icon:"📋", message:`[${newDossierForm.process}] Nouveau dossier : ${newId} — ${newDossier.client} · Assigné : ${assignedUser?.name||"—"} · Éch. ${new Date(dueDateFinal).toLocaleDateString("fr-FR")}`, at:now, read:false, module:"dossiers"});
    }
    // DG si dossier URGENT ou CRITIQUE
    if (newDossierForm.priority==="CRITIQUE"||newDossierForm.priority==="HAUTE") {
      const dg = users.find(u=>u.isMG||u.level>=5);
      if (dg && dg.id !== localUser.id) {
        gcPushNotif(dg.id, {id:"N"+Date.now()+dg.id, icon:"⚡", message:`⚡ Dossier ${newDossierForm.priority} : ${newId} — ${newDossier.client} · Éch. ${new Date(dueDateFinal).toLocaleDateString("fr-FR")}`, at:now, read:false, module:"dossiers", urgent:true});
      }
    }

    if (superior) playSound("message");
    setShowNewDossier(false);
    setNewDossierForm({client:"",objet:"",process:localUser.process||"O02",priority:"NORMALE",dueDate:"",amount:"",nature:"EXTERNE",submitTo:"",submitAction:"TRAITER",submitMotif:"",partnerId:""});
  };

  const handleTransfer = (dossier, targetUserId, message) => {
    setDossiers(prev => {
      const updated = prev.map(d=>d.id===dossier.id?{...d,assignedTo:targetUserId,status:"ATTENTE_VALIDATION",notes:d.notes+`\n[TRANSFERT ${new Date().toLocaleDateString("fr-FR")}] ${message}`}:d);
      // Sauvegarder en base de données pour synchronisation
      dsSave("dossiers", updated, localUser.id);
      return updated;
    });
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"📤",message:`Dossier ${dossier.ref} transféré à ${getUser(targetUserId,users).name}`,at:new Date().toISOString(),read:false},...prev]);
    setShowTransferModal(null);
  };

  const handleDeleteRequest = async (d) => {
    // Règle: canDeleteDossier = admin, niv4+, ou auteur avant traitement
    if (canDeleteDossier(d)) {
      if (!await gcConfirm(`Supprimer définitivement "${d.ref}" ?`)) return;
      // FIX v153 — dsDeleteItemFromArray : tombstone + endpoint serveur + forceOverwrite
      await dsDeleteItemFromArray("dossiers", d.id, localUser.id);
      setDossiers(prev => prev.filter(x => x.id !== d.id));
      saveDossierFiles(prev => prev.filter(f => f.dossierId !== d.id));
      // 🔗 Cohérence : détacher/supprimer tâches et RDV liés
      const linkedTaches = taches.filter(t => t.dossier === d.id);
      const linkedRdvs   = rdvs.filter(r => r.dossierId === d.id);
      if (linkedTaches.length > 0 || linkedRdvs.length > 0) {
        const msg = `Ce dossier a :\n• ${linkedTaches.length} tâche(s) liée(s)\n• ${linkedRdvs.length} RDV lié(s)\n\nOK = supprimer également, Annuler = détacher seulement.`;
        if(await gcConfirm(msg)) {
          if (linkedTaches.length > 0) { linkedTaches.forEach(t=>dsDeleteItemFromArray("taches",t.id)); setTaches(prev => prev.filter(t=>t.dossier!==d.id)); }
          if (linkedRdvs.length > 0)   { linkedRdvs.forEach(r=>dsDeleteItemFromArray("rdvs",r.id)); setRdvs(prev => prev.filter(r=>r.dossierId!==d.id)); }
        } else {
          if (linkedTaches.length > 0) setTaches(prev => { const u=prev.map(t=>t.dossier===d.id?{...t,dossier:null,dossierDetached:true}:t); dsSave("taches",u,null,{forceOverwrite:false}).catch(err => gcToast.syncError('', err)); return u; });
          if (linkedRdvs.length > 0)   setRdvs(prev => { const u=prev.map(r=>r.dossierId===d.id?{...r,dossierId:null,dossierDetached:true}:r); dsSave("rdvs",u,null,{forceOverwrite:false}).catch(err => gcToast.syncError('', err)); return u; });
        }
      }
      // Cascade Finance — annuler les factures liées au dossier
      window.dispatchEvent(new CustomEvent('gc:dossier-deleted', { detail: { id: d.id, ref: d.ref, client: d.client } }));
      addSessionLog && addSessionLog("SUPPRESSION", localUser, { status:"SUCCESS", reason:`Suppression dossier ${d.ref}` });
      setNotifications(prev=>[{id:"N"+Date.now(),icon:"🗑️",message:`Dossier ${d.ref} supprimé par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
      playSound("success");
    } else {
      // Circuit approbation pour niv2 ou niv3 non-auteur
      setDeleteMotif(""); setShowDeleteApproval(d);
    }
  };

  const handleSubmitDeleteRequest = () => {
    const d = showDeleteApproval;
    if (!deleteMotif.trim()) { gcAlert("Veuillez indiquer un motif."); return; }
    const superior = findSuperior(d.process) || users.find(u=>u.level>=3);
    if (!superior) { gcAlert("Aucun supérieur trouvé."); return; }
    const req = {
      id:"DEL-"+Date.now(), type:"DELETE_DOSSIER",
      dossierId:d.id, dossierRef:d.ref, dossierClient:d.client,
      motif:deleteMotif, requestedBy:localUser.id, requestedByName:localUser.name,
      requestedByLevel:localUser.level, superiorId:superior.id, superiorName:superior.name,
      status:"EN_ATTENTE", createdAt:new Date().toISOString()};
    savePendingDeleteApprovals(prev=>[...prev,req]);
    addSessionLog && addSessionLog("DEMANDE_SUPPRESSION", localUser, { status:"PENDING", reason:`Demande suppression ${d.ref} — ${deleteMotif}` });
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"🗑️",message:`Demande de suppression envoyée à ${superior.name} : ${d.ref}`,at:new Date().toISOString(),read:false},...prev]);
    setShowDeleteApproval(null); setDeleteMotif(""); playSound("message");
  };

  const handleApproveDelete = (req) => {
    setDossiers(prev => {
      const updated = prev.filter(x=>x.id!==req.dossierId);
      // Sauvegarder en base de données pour synchronisation
      dsSave("dossiers", updated, localUser.id);
      return updated;
    });
    saveDossierFiles(prev=>prev.filter(f=>f.dossierId!==req.dossierId));
    savePendingDeleteApprovals(prev=>prev.map(r=>r.id===req.id?{...r,status:"APPROUVE",approvedAt:new Date().toISOString(),approvedBy:localUser.id}:r));
    window.dispatchEvent(new CustomEvent('gc:dossier-deleted', { detail: { id: req.dossierId, ref: req.dossierRef, client: req.dossierClient } }));
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"✅",message:`✅ Suppression approuvée : ${req.dossierRef} (demandé par ${req.requestedByName})`,at:new Date().toISOString(),read:false},...prev]);
    addSessionLog && addSessionLog("SUPPRESSION", localUser, { status:"SUCCESS", reason:`Suppression approuvée dossier ${req.dossierRef}` });
    setShowDeleteReview(null); playSound("success");
  };

  const handleRejectDelete = (req) => {
    if (!rejectMotif.trim()) { gcAlert("Veuillez indiquer un motif de refus."); return; }
    savePendingDeleteApprovals(prev=>prev.map(r=>r.id===req.id?{...r,status:"REJETE",rejectMotif,rejectedAt:new Date().toISOString(),rejectedBy:localUser.id}:r));
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"❌",message:`Suppression refusée : ${req.dossierRef} — ${rejectMotif}`,at:new Date().toISOString(),read:false},...prev]);
    setShowDeleteReview(null); setRejectMotif(""); playSound("alarm");
  };

  const handleOpenEdit = (d) => {
    setEditForm({ client:d.client, objet:d.objet, process:d.process, priority:d.priority, dueDate:d.dueDate||"", amount:d.amount||0, notes:d.notes||"", status:d.status });
    setShowEditModal(d);
  };

  const handleSaveEdit = () => {
    if (!editForm.client||!editForm.objet) { gcAlert("Client et objet requis."); return; }
    const d = showEditModal;
    setDossiers(prev => {
      const updated = prev.map(x=>x.id===d.id?{...x,...editForm,updatedAt:new Date().toISOString(),updatedBy:localUser.id}:x);
      // Sauvegarder en base de données pour synchronisation
      dsSave("dossiers", updated, localUser.id);
      return updated;
    });
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"✏️",message:`Dossier ${d.ref} mis à jour par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
    // 🔗 Cohérence lors de clôture : archiver tâches actives, annuler RDV futurs
    if (editForm.status === "TERMINE" && d.status !== "TERMINE") {
      const today = new Date().toISOString().split("T")[0];
      const linkedT = taches.filter(t => t.dossier === d.id && _tActive(t));
      if (linkedT.length > 0) {
        setTaches(prev => {
          const u = prev.map(t => t.dossier===d.id && _tActive(t) ? {...t, status:"TERMINE", statut:"TERMINE", closedWithDossier:true, closedAt:new Date().toISOString()} : t);
          try{_lsSet("gc-taches",JSON.stringify(u));dsSave("taches",u).catch(err => gcToast.syncError('', err));}catch(_){}
          return u;
        });
      }
      const linkedRdvsFuturs = rdvs.filter(r => r.dossierId===d.id && r.date >= today && r.status !== "ANNULE");
      if (linkedRdvsFuturs.length > 0) {
        setRdvs(prev => {
          const u = prev.map(r => r.dossierId===d.id && r.date>=today ? {...r, status:"ANNULE", annulationMotif:"Dossier clôturé"} : r);
          try{_lsSet("gc-rdvs",JSON.stringify(u));dsSave("rdvs",u).catch(err => gcToast.syncError('', err));}catch(_){}
          return u;
        });
      }
    }
    addSessionLog && addSessionLog("MODIFICATION", localUser, { status:"SUCCESS", reason:`Modification dossier ${d.ref}` });
    setShowEditModal(null); playSound("success");
  };

  const [fileUploadStatus, setFileUploadStatus] = useState(null);
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setFileUploadStatus({ type: "loading", msg: "⏳ Lecture du fichier en cours…" });
    try {
      const result = await gcReadFile(file, 10);
      setUploadForm(f => ({ ...f, fileName: result.name, fileData: result.dataUrl, fileSize: result.size, fileExt: "."+result.ext.toLowerCase(), fileMime: result.mime }));
      setFileUploadStatus({ type: "ok", msg: `✅ ${result.name} — ${result.sizeStr} — Prêt à téléverser` });
    } catch (err) {
      setFileUploadStatus({ type: "error", msg: `❌ ${err.message}` });
    }
    if (e.target) e.target.value = "";
  };

  const handleSaveUpload = async () => {
    if (!uploadForm.fileData) { gcAlert("Veuillez sélectionner un fichier."); return; }
    const d = showUploadModal;
    let ref = null;
    try {
      const blob = _dataUrlToBlob(uploadForm.fileData);
      const file = new File([blob], uploadForm.fileName, { type: uploadForm.fileMime || 'application/octet-stream' });
      ref = await gcFileSave(file, {
        dossierId: d.id,
        module: 'docs',
        uploadedBy: localUser.id,
        uploadedByName: localUser.name,
        nom: uploadForm.fileName,
        taille: uploadForm.fileSize,
        type: uploadForm.fileMime,
      });
    } catch (error) {
      console.warn('[DossiersList] gcFileSave failed, falling back to local attachment', error);
    }

    const newFile = {
      id: ref?.id || "FILE-"+Date.now(),
      dossierId:d.id, dossierRef:d.ref,
      name:uploadForm.fileName, ext:uploadForm.fileExt, size:uploadForm.fileSize,
      sizeStr:uploadForm.fileSize<1024*1024?`${Math.round(uploadForm.fileSize/1024)} Ko`:`${(uploadForm.fileSize/1024/1024).toFixed(1)} Mo`,
      mimeType:uploadForm.fileMime,
      // FIX v152 — Ne stocker le dataUrl que si pas de serverUrl disponible (économiser LS/IDB)
      dataUrl: (ref?.serverUrl || ref?.serverId) ? null : uploadForm.fileData,
      description:uploadForm.description, accessLevel:uploadForm.accessLevel,
      uploadedBy:localUser.id, uploadedByName:localUser.name,
      uploadedAt:new Date().toISOString(), downloads:0,
      serverId: ref?.serverId || null,
      serverUrl: ref?.serverUrl || null,
      storageType: ref?.storageType || (ref?.serverUrl ? 'server' : 'local'),
    };

    saveDossierFiles(prev=>[...prev,newFile]);
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"📎",message:`Fichier ajouté : "${newFile.name}" → Dossier ${d.ref}`,at:new Date().toISOString(),read:false},...prev]);
    addSessionLog && addSessionLog("UPLOAD", localUser, { status:"SUCCESS", reason:`Upload "${newFile.name}" — ${d.ref}` });
    setShowUploadModal(null);
    setUploadForm({description:"",accessLevel:1,fileName:"",fileData:"",fileSize:0,fileExt:"",fileMime:""});
    setFileUploadStatus(null);
    playSound("success");
  };

  // Ouvrir/visualiser un fichier pièce-jointe
  const handleViewFile = (f) => { openDocFile(f); };

  // Supprimer une pièce jointe en local + backend + sync réseau
  const handleDeleteFile = async (f) => {
    await dsDeleteItemFromArray('gc-dossier-files', f.id);
    saveDossierFiles(prev => prev.filter(x => x.id !== f.id));
  };

  // FIX v152 — handleDownloadFile : priorité serverUrl, fallback dataUrl
  const handleDownloadFile = async (f) => {
    const _userLevel = Number(localUser?.level) || 0;
    if (f.accessLevel > _userLevel && !(localUser?.isAdmin || _userLevel >= 6) && !isMG) {
      gcAlert("Accès refusé — Habilitation insuffisante."); return;
    }
    saveDossierFiles(prev => prev.map(x => x.id === f.id ? { ...x, downloads: (x.downloads || 0) + 1 } : x));
    // 1. Téléchargement depuis le serveur (fichiers uploadés)
    if (f.serverUrl || f.serverId) {
      try {
        const url = _absUrl(f.serverUrl) || `${getProxyUrl()}/api/files/${f.serverId}`;
        const token = getJWTToken?.() || null;
        const headers = token ? { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } : {};
        const r = await fetch(url, { headers });
        if (r.ok) {
          const blob = await r.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl; a.download = f.name || f.fileName || f.nom || 'fichier';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);
          return;
        }
      } catch (err) {
        console.warn('[handleDownloadFile] Erreur serveur, fallback dataUrl :', err.message);
      }
    }
    // 2. Fallback : dataUrl local
    gcDownloadDoc({ ...f, dataUrl: f.dataUrl, fileName: f.name });
  };

  const handleSaveCollabs = (collabs, extCollabs) => {
    const d = showCollabModal;
    const prevCollabs = d.collaborators||[];
    const newCollabs = collabs.filter(id=>!prevCollabs.includes(id));
    setDossiers(prev => {
      const updated = prev.map(x=>x.id===d.id?{...x,collaborators:collabs,externalCollaborators:extCollabs}:x);
      // Sauvegarder en base de données pour synchronisation
      dsSave("dossiers", updated, localUser.id);
      return updated;
    });
    newCollabs.forEach(uid=>{
      setNotifications(prev=>[{id:"N"+Date.now(),icon:"👥",message:`Vous avez été affecté(e) au dossier ${d.ref} — ${d.client}`,at:new Date().toISOString(),read:false,forUser:uid},...prev]);
    });
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"👥",message:`Collaborateurs mis à jour : ${d.ref} — ${collabs.length} interne(s), ${extCollabs.length} externe(s)`,at:new Date().toISOString(),read:false},...prev]);
    setShowCollabModal(null); playSound("success");
  };

  const myProcs = localUser.processes || [localUser.process];
  const isO01 = myProcs.includes("O01"); // Exécutif Administratif — seul habileté à créer les dossiers EXTERNES

  // -- Visibilité des dossiers -----------------------------------------------
  // Niv 4+ / Admin : voient TOUS les dossiers (lecture + action sur leur processus)
  // Niv 3 : voient leur processus + ceux qui leur sont assignés/soumis
  // Niv 2 : voient uniquement les dossiers qui les concernent directement
  const canSeeAll = localUser.level >= 4 || (localUser?.isAdmin || localUser?.level >= 6);

  const userDossiers = canSeeAll ? dossiers.filter(Boolean) :
    localUser.level >= 3
      ? dossiers.filter(d =>
          d &&
          (d.assignedTo === localUser.id ||
          d.createdBy === localUser.id ||
          d.submittedTo === localUser.id ||
          (d.collaborators || []).includes(localUser.id) ||
          myProcs.includes(d.process) ||
          true) // niv 3+ voit tous les dossiers en lecture
        )
      : dossiers.filter(d =>
          d &&
          (d.assignedTo === localUser.id ||
          d.createdBy === localUser.id ||
          d.submittedTo === localUser.id ||
          (d.collaborators || []).includes(localUser.id))
        );

  // -- Droits d'action granulaires -----------------------------------------
  const canCreateDossier = (localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 2; // tous sauf vus plus bas
  const canCreateExternal = (localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 3 || isO01; // niv3+, O01 et responsables peuvent créer EXTERNE
  const canEditDossier = (d) =>
    (localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 5 ||
    (localUser.level === 4 && myProcs.includes(d.process)) || // responsable de son processus
    d.createdBy === localUser.id || d.assignedTo === localUser.id;
  const canDeleteDossier = (d) => {
    // Admin : toujours
    if ((localUser?.isAdmin || localUser?.level >= 6)) return true;
    // DG/Niv5 : toujours (suppression totale dossier réservée niv 5+)
    if (localUser.level >= 5) return true;
    return false;
  };

  // Niv 4 : ne peut manipuler (modifier/supprimer) que son propre processus
  // Exception : O01 peut tout faire (gestion documentaire centrale)
  const canManipulateDoc = (doc) => {
    if ((localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 5 || isO01) return true;
    if (localUser.level <= 3) return doc.createdBy === localUser.id || doc.submitTo === localUser.id;
    // Niveau 4 : own process only
    return myProcs.includes(doc.process) || doc.createdBy === localUser.id;
  };
  const canManipulateDossier = (d) => {
    if ((localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 5 || isO01) return true;
    // Niveau 3 et moins : seulement ses propres dossiers
    if (localUser.level <= 3) return d.createdBy === localUser.id || d.assignedTo === localUser.id || (d.collaborators||[]).includes(localUser.id);
    // Niveau 4 : processus ET (assigné / créé / collaborateur / soumis à lui)
    const isInProcess = myProcs.includes(d.process);
    const isDirectlyInvolved = d.createdBy === localUser.id || d.assignedTo === localUser.id || d.submittedTo === localUser.id || (d.collaborators||[]).includes(localUser.id);
    return isInProcess || isDirectlyInvolved;
  };
  const canTransferDossier = (d) =>
    (localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 4 ||
    (localUser.level === 3 && myProcs.includes(d.process));
  const canSignDossier = (d) =>
    (localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 4; // responsables et DG uniquement
  const canValidateDossier = (d) =>
    (localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 4 || d.submittedTo === localUser.id;
  const canArchiveDossier = (d) => {
    // Admin, DG, O01 : accès total à l'archivage
    if ((localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 5 || isO01) return true;
    // Niv 4 dans le processus du dossier
    if (localUser.level >= 4 && myProcs.includes(d.process)) return true;
    // Tout niveau : propriétaire (créateur ou assigné) ou collaborateur nommé
    return d.createdBy === localUser.id
      || d.assignedTo === localUser.id
      || (d.collaborators||[]).includes(localUser.id);
  };
  // Anti-doublon pour niv 2 : même objet + même processus + statut actif
  const hasDuplicateDossier = (objet, process) =>
    localUser.level <= 2 && dossiers.some(d =>
      d.process === process &&
      d.status !== "TERMINE" && d.status !== "ARCHIVE" &&
      d.objet?.toLowerCase().trim() === objet?.toLowerCase().trim()
    );

  const [unlockedConf, setUnlockedConf] = useState({}); // {dossierId: true}
  const canReadConfDossier = (d) => {
    if (!d.confidentiel) return true;
    if ((localUser?.isAdmin || localUser?.level >= 6) || d.createdBy === localUser.id) return true;
    if ((d.confAccess||[]).includes(localUser.id)) return true;
    return false;
  };
  const handleUnlockConf = async (d) => {
    const pass = await gcPrompt(`🔒 Dossier confidentiel\n\nSaisir le mot de passe d'accès :`);
    if (pass === null) return;
    if (pass === d.confPass) { setUnlockedConf(prev=>({...prev,[d.id]:true})); }
    else { gcAlert("❌ Mot de passe incorrect."); }
  };

  const filtered = userDossiers.filter(d=>
    d &&
    (filter==="ALL"||(filter==="KYC_ATTENTE"&&d.intakeDocs?.length>0&&d.kycStatutDossier!=="VALIDE")||(filter!=="ALL"&&filter!=="KYC_ATTENTE"&&d.status===filter))&&
    (dosType==="ALL"||(d.nature||"EXTERNE")===dosType)&&
    (!search||(d.client||"").toLowerCase().includes(search.toLowerCase())||(d.ref||"").toLowerCase().includes(search.toLowerCase())||(d.objet||"").toLowerCase().includes(search.toLowerCase()))
  );

  const pendingReviewForMe = (pendingDeleteApprovals||[]).filter(r=>r.superiorId===localUser.id&&r.status==="EN_ATTENTE");
  const pendingMyRequests = (pendingDeleteApprovals||[]).filter(r=>r.requestedBy===localUser.id&&r.status==="EN_ATTENTE");

  // CollabModal et UploadModal sont désormais définis hors de ce composant (voir au-dessus)
  // pour éviter le re-mount systématique à chaque re-render du parent.

  const _docMyProcs = localUser.processes || [localUser.process];
  const visibleStandaloneDocs = (standaloneDocuments||[]).filter(doc => {
    if (!doc) return false;
    if ((localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 4) return true;
    if (doc.accessLevel && doc.accessLevel > localUser.level) return false;
    if (localUser.level >= 3) return _docMyProcs.includes(doc.process) || doc.createdBy === localUser.id || doc.submitTo === localUser.id || doc.linkedUserId === localUser.id;
    return doc.createdBy === localUser.id || doc.submitTo === localUser.id || doc.linkedUserId === localUser.id;
  });
  const visibleDossierFiles = (dossierFiles||[]).filter(f => {
    if (!f) return false;
    if ((localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 4) return true;
    if (f.accessLevel && f.accessLevel > localUser.level) return false;
    const parentDossier = userDossiers.find(d => d && d.id === f.dossierId);
    return !!parentDossier || f.uploadedBy === localUser.id;
  });
  const allDocs = [
    ...visibleStandaloneDocs.map(d=>({...d, _src:"standalone"})),
    ...visibleDossierFiles.map(f=>({...f, _src:"dossierFile", titre:f.name, nature:f.dossierId?"EXTERNE":"INTERNE", createdAt:f.uploadedAt, createdByName:f.uploadedByName, createdBy:f.uploadedBy}))
  ].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));

  const _str = (v) => typeof v === "string" ? v : v ? String(v) : "";
  const filteredDocs = allDocs.filter(doc => {
    const q = docSearch.toLowerCase();
    const matchSearch = !q || (_str(doc.titre)).toLowerCase().includes(q) || (_str(doc.description)).toLowerCase().includes(q) || (_str(doc.process)).toLowerCase().includes(q) || (_str(doc.partnerNom||doc.dossierRef)).toLowerCase().includes(q) || (_str(doc.createdByName)).toLowerCase().includes(q) || (_str(doc.type)).toLowerCase().includes(q);
    const matchNature = docFilter==="ALL" || (doc.nature||"INTERNE")===docFilter;
    const matchType = docTypeFilter==="ALL" || (doc.type||"DOC")===docTypeFilter;
    const matchProc = docProcessFilter==="ALL" || (doc.process||"")===docProcessFilter;
    return matchSearch && matchNature && matchType && matchProc;
  }).sort((a,b)=>{
    if (docSort==="date_desc") return _str(b.createdAt).localeCompare(_str(a.createdAt));
    if (docSort==="date_asc") return _str(a.createdAt).localeCompare(_str(b.createdAt));
    if (docSort==="titre_asc") return _str(a.titre).localeCompare(_str(b.titre));
    if (docSort==="titre_desc") return _str(b.titre).localeCompare(_str(a.titre));
    if (docSort==="size_desc") return (b.fileSize||0)-(a.fileSize||0);
    return 0;
  });

  const handleDocDownload = (doc) => {
    if ((doc.accessLevel||1) > localUser.level && !(localUser?.isAdmin || localUser?.level >= 6)) { gcAlert(`🔒 Accès refusé — Habilitation Niv.${doc.accessLevel} requise.`); return; }
    gcDownloadDoc({ id: doc.id, serverUrl: doc.serverUrl, serverId: doc.serverId, url: doc.url, dataUrl: doc.fileData || doc.dataUrl, nom: doc.fileName||doc.name||doc.titre, name: doc.fileName||doc.name||doc.titre });
    if (doc._src === "standalone") saveStandaloneDocs(prev=>prev.map(x=>x.id===doc.id?{...x,downloads:(x.downloads||0)+1}:x));
    else saveDossierFiles(prev=>prev.map(x=>x.id===doc.id?{...x,downloads:(x.downloads||0)+1}:x));
  };
  const handleDocDelete = async (doc) => {
    const canDel = ((localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 3 || doc.createdBy === localUser.id) && canManipulateDoc(doc);
    if (!canDel) { gcAlert("Habilitation insuffisante pour supprimer ce document."); return; }
    if (!await gcConfirm(`Supprimer "${doc.titre}" ?`)) return;
    if (doc._src === "standalone") {
      saveStandaloneDocs(prev=>prev.filter(x=>x.id!==doc.id));
      // Sync archive to GestionDocsUnifiee
      try{
        const existing=JSON.parse(_lsGet("gc-docs-archives")||"[]");
        _lsSet("gc-docs-archives",JSON.stringify([{...doc,status:"ARCHIVE",archivedAt:new Date().toISOString(),archivedBy:localUser?.name||"?"},...existing.slice(0,299)]));
      }catch(_){}
    }
    else saveDossierFiles(prev=>prev.filter(x=>x.id!==doc.id));
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"🗑️",message:`Document supprimé : "${doc.titre}"`,at:new Date().toISOString(),read:false,module:"dossiers"},...prev]);
    playSound("success");
  };

  return (
    <div>
      {/* ── EN-TÊTE MODULE — Sub-tabs Dossiers / Documents ──── */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{flex:1,display:"flex",gap:4,background:T.surface2,borderRadius:10,padding:4,border:`1px solid ${T.border}`}}>
          {[
            {id:"dossiers",icon:"📁",label:"Dossiers",count:userDossiers.length},
            {id:"documents",icon:"📄",label:"Documents",count:allDocs.length},
          ].map(t=>(
            <button key={t.id} onClick={()=>setDossierSubTab(t.id)}
              style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 14px",borderRadius:8,cursor:"pointer",border:"none",
                background:dossierSubTab===t.id?"linear-gradient(135deg,#C41E3A,#A01020)":"transparent",
                color:dossierSubTab===t.id?"#fff":T.textMuted,
                fontWeight:dossierSubTab===t.id?800:500,fontSize:13,transition:"all 0.18s",boxShadow:dossierSubTab===t.id?"0 2px 12px rgba(196,30,58,0.3)":"none"}}>
              <span style={{fontSize:16,filter:dossierSubTab===t.id?"drop-shadow(0 0 5px rgba(255,255,255,0.6))":"none"}}>{t.icon}</span>
              {t.label}
              <span style={{background:dossierSubTab===t.id?"rgba(255,255,255,0.25)":T.surface3,color:dossierSubTab===t.id?"#fff":T.textMuted,borderRadius:99,padding:"1px 8px",fontSize:11,fontWeight:800,minWidth:22,textAlign:"center"}}>{t.count}</span>
            </button>
          ))}
        </div>
        {dossierSubTab==="dossiers" && canCreateDossier && (
          <Btn variant="primary" size="sm" onClick={()=>setShowNewDossier(true)}>📁 + Dossier</Btn>
        )}
        {dossierSubTab==="documents" && ((localUser?.isAdmin || localUser?.level >= 6)||localUser.level>=2) && (
          <Btn variant="secondary" size="sm" onClick={()=>setShowNewDoc(true)}>📄 + Document</Btn>
        )}
      </div>

      {/* ═══════════════════ VUE DOSSIERS ═══════════════════ */}
      {dossierSubTab === "dossiers" && (<div>
      {/* Bannière: demandes de suppression à réviser */}
      {pendingReviewForMe.length>0&&(
        <div style={{background:"#F59E0B15",border:"1px solid #F59E0B44",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
          <div style={{color:"#F59E0B",fontWeight:800,fontSize:12,marginBottom:6}}>⏳ {pendingReviewForMe.length} demande(s) de suppression en attente de votre décision</div>
          {pendingReviewForMe.map(req=>(
            <div key={req.id} style={{display:"flex",gap:10,alignItems:"center",background:T.surface2,borderRadius:8,padding:"8px 12px",marginBottom:4}}>
              <span style={{fontSize:16}}>🗑️</span>
              <div style={{flex:1}}>
                <span style={{color:T.text,fontWeight:700,fontSize:12}}>{req.dossierRef}</span>
                <span style={{color:T.textMuted,fontSize:11,marginLeft:8}}>— {req.requestedByName} · Motif: {req.motif}</span>
              </div>
              <Btn variant="primary" size="sm" onClick={async ()=>{setRejectMotif("");setShowDeleteReview(req);}}>🔍 Examiner</Btn>
            </div>
          ))}
        </div>
      )}

      {pendingMyRequests.length>0&&(
        <div style={{background:"#3B82F610",border:"1px solid #3B82F633",borderRadius:10,padding:"8px 14px",marginBottom:12}}>
          <div style={{color:"#3B82F6",fontWeight:700,fontSize:11}}>📋 {pendingMyRequests.length} demande(s) de suppression en attente d'approbation</div>
        </div>
      )}

      {/* Nature toggle */}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[{k:"ALL",label:"Tous",icon:"📂",color:T.textMuted},{k:"EXTERNE",label:"Clients & Externes",icon:"📁",color:"#C41E3A"},{k:"INTERNE",label:"Internes Cabinet",icon:"🗂️",color:"#3B82F6"}].map(bt=>(
          <button key={bt.k} onClick={()=>setDosType(bt.k)}
            style={{background:dosType===bt.k?bt.color:T.surface2,border:`1px solid ${dosType===bt.k?bt.color:T.border}`,borderRadius:20,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:dosType===bt.k?800:400,color:dosType===bt.k?"#fff":T.textMuted}}>
            {bt.icon} {bt.label} ({userDossiers.filter(d=>bt.k==="ALL"||(d.nature||"EXTERNE")===bt.k).length})
          </button>
        ))}
      </div>

      <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher…" style={{flex:1,minWidth:180,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13}} />
        <select value={filter} onChange={async e=>{setFilter(e.target.value);setSelectedDossiers([]);}} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}}>
          <option value="ALL">Tous statuts</option>
          {Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          {/* v99 — Filtre KYC */}
          <option value="KYC_ATTENTE">🪪 KYC en attente</option>
        </select>
        {/* v99 — Bouton Accueil client O01 */}
        {(isO01||localUser.level>=3)&&(
          <button onClick={async ()=>{const evt=new CustomEvent("gc:open-intake");window.dispatchEvent(evt);}}
            style={{background:"linear-gradient(135deg,#C9A84C,#D97706)",border:"none",color:"#000",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>📋 Accueil client</button>
        )}
      </div>

        {/* ── Barre d'actions multi-sélection ── */}
        {selectedDossiers.length > 0 && (
          <div style={{background:"#3B82F611",border:"1px solid #3B82F644",borderRadius:8,padding:"8px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{color:"#3B82F6",fontWeight:700,fontSize:11}}>✔ {selectedDossiers.length} dossier(s) sélectionné(s)</span>
            {(localUser.level>=3||(localUser?.isAdmin || localUser?.level >= 6)) && (
              <button onClick={async () => {if(await gcConfirm(`Clôturer ${selectedDossiers.length} dossier(s) sélectionné(s) ?`)){
                setDossiers(prev => {
                  const updated = prev.map(d=>selectedDossiers.includes(d.id)?{...d,status:"TERMINE",progress:100,closedAt:new Date().toISOString()}:d);
                  // Sauvegarder en base de données pour synchronisation
                  dsSave("dossiers", updated, localUser.id);
                  return updated;
                });
                // FIX v126 — sync tâches et RDV liés
                selectedDossiers.forEach(id=>gcCloseDossierWithSync({dossierId:id,taches,setTaches,rdvs,setRdvs}));
                setSelectedDossiers([]);}}}
                style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Clôturer</button>
            )}
            {/* 🗄️ Archiver la sélection — seulement les TERMINÉ */}
            {selectedDossiers.some(id=>{ const d=dossiers.find(x=>x.id===id); return d&&d.status==="TERMINE"&&canArchiveDossier(d); }) && (
              <button onClick={async ()=>{
                const toArchive=selectedDossiers.filter(id=>{ const d=dossiers.find(x=>x.id===id); return d&&d.status==="TERMINE"&&canArchiveDossier(d); });
                if(!await gcConfirm(`Archiver ${toArchive.length} dossier(s) TERMINÉ(s) ?\nIls seront transmis à O01 pour classement.`)) return;
                const now=new Date().toISOString();
                const entries=toArchive.map(id=>{ const d=dossiers.find(x=>x.id===id); return {id:"ARCH-"+Date.now()+id,ref:`ARCH-A${String(Date.now()).slice(-5)}-${d.process}/${new Date().getFullYear()}`,dossier:d.id,dossierRef:d.ref,client:d.client,objet:d.objet||d.client,archiveur:localUser.id,archiveurName:localUser.name,archivedAt:now,receivedBySec:false,secNotes:"",process:d.process,docType:"DOS",status:"EN_ATTENTE_SECRETARIAT",notes:""}; });
                try { const prev=JSON.parse(_lsGet("gc-archives")||"[]"); _lsSet("gc-archives",JSON.stringify([...entries,...prev].slice(0,500))); dsSave("gc-archives",[...entries,...prev].slice(0,500)).catch(err => gcToast.syncError('', err)); } catch(_) {}
                setDossiers(prev => {
                  const updated = prev.map(d=>toArchive.includes(d.id)?{...d,status:"ARCHIVE",archivedAt:now,archivedBy:localUser.id}:d);
                  // Sauvegarder en base de données pour synchronisation
                  dsSave("dossiers", updated, localUser.id);
                  return updated;
                });
                const o01Users=(users||[]).filter(u=>(u.process==="O01"||(u.processes||[]).includes("O01"))&&u.level>=2);
                const notifMsg=`🗄️ ${toArchive.length} dossier(s) archivé(s) par ${localUser.name}. Transmis à O01 pour classement.`;
                setNotifications(prev=>[{id:"N"+Date.now(),icon:"🗄️",message:notifMsg,at:now,read:false,module:"archivage"},...prev]);
                o01Users.forEach(u=>{try{const k=`GC_SI_v12:notif:${u.id}`;const ex=JSON.parse(_lsGet(k)||"[]");ex.unshift({id:"N"+Date.now()+u.id,icon:"🗄️",message:notifMsg,at:now,read:false,module:"archivage",urgent:true});_lsSet(k,JSON.stringify(ex.slice(0,200)));}catch(_){}});
                setSelectedDossiers([]);
                playSound("success");
              }} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗄️ Archiver ({selectedDossiers.filter(id=>{ const d=dossiers.find(x=>x.id===id); return d&&d.status==="TERMINE"&&canArchiveDossier(d); }).length})</button>
            )}
            {(localUser.level>=3||(localUser?.isAdmin || localUser?.level >= 6)) && (
              <button onClick={async () => {if(await gcConfirm(`Marquer ${selectedDossiers.length} dossier(s) en cours ?`)){
                setDossiers(prev => {
                  const updated = prev.map(d=>selectedDossiers.includes(d.id)?{...d,status:"EN_COURS"}:d);
                  // Sauvegarder en base de données pour synchronisation
                  dsSave("dossiers", updated, localUser.id);
                  return updated;
                });
                setSelectedDossiers([]);
              }}}
                style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>▶ En cours</button>
            )}
            {/* ⬇️ ZIP — exporter les dossiers sélectionnés */}
            {selectedDossiers.length === 1 && (()=>{
              const d = dossiers.find(x=>x.id===selectedDossiers[0]);
              if (!d) return null;
              const zipUrl = gcDossierZipUrl(d.id);
              const token = getJWTToken?.() || null;
              return (
                <button onClick={async e=>{e.stopPropagation();
                  const headers = token ? { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } : {};
                  const resp = await fetch(zipUrl, { headers }).catch(()=>null);
                  if (!resp?.ok) { gcToast.error('Export ZIP indisponible'); return; }
                  const blob = await resp.blob();
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                  a.download = `${d.ref.replace(/\//g,'_')}.zip`; a.click();
                }} style={{background:"#06B6D422",border:"1px solid #06B6D444",color:"#06B6D4",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                  ⬇️ ZIP
                </button>
              );
            })()}
            <button onClick={()=>setSelectedDossiers([])} style={{background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:10,marginLeft:"auto"}}>✕ Désélectionner</button>
          </div>
        )}

      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {filtered.length > 0 && (
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",marginBottom:2}}>
            <input type="checkbox"
              checked={filtered.length>0&&filtered.every(d=>selectedDossiers.includes(d.id))}
              onChange={async ()=>{const allIds=filtered.map(d=>d.id);const allSel=allIds.every(id=>selectedDossiers.includes(id));setSelectedDossiers(allSel?[]:allIds);}}
              style={{width:14,height:14,cursor:"pointer",accentColor:"#3B82F6"}} />
            <span style={{color:T.textDim,fontSize:10,fontWeight:600}}>Tout sélectionner ({filtered.length})</span>
          </div>
        )}
        {filtered.map(d=>{
          const sc=STATUS_CONFIG[d.status]; const pc=PRIORITY_CONFIG[d.priority];
          const user=getUser(d.assignedTo,users); const dl=daysLeft(d.dueDate);
          const nat=NATURE_CONFIG[d.nature||"EXTERNE"];
          const isSubmittedToMe=d.submittedTo===localUser.id;
          const isMyProcess=myProcs.includes(d.process)||canSeeAll||d.assignedTo===localUser.id||d.createdBy===localUser.id;
          const isReadOnly=!isMyProcess&&!(localUser?.isAdmin || localUser?.level >= 6); // autre processus → lecture seule
          const myFileCount=(dossierFiles||[]).filter(f=>f.dossierId===d.id).length;
          const myCollabCount=(d.collaborators||[]).length+(d.externalCollaborators||[]).length;
          const hasPendingDel=(pendingDeleteApprovals||[]).some(r=>r.dossierId===d.id&&r.status==="EN_ATTENTE");
          const isConf = !!d.confidentiel;
          const confUnlocked = unlockedConf[d.id];
          const hasConfAccess = canReadConfDossier(d);
          const confBlocked = isConf && !hasConfAccess && !confUnlocked;
          const isSel = selectedDossiers.includes(d.id);
          return (
            <div key={d.id} style={{background:isSel?`${sc.color}12`:T.surface2,border:`1px solid ${isSel?"#3B82F666":isConf?"#C41E3A44":isSubmittedToMe?"#F59E0B66":hasPendingDel?"#EF444444":T.border}`,borderRadius:10,padding:"12px 16px",cursor:"pointer",display:"flex",gap:10,alignItems:"center",transition:"all 0.15s"}}>
              <input type="checkbox" checked={isSel} onChange={async e=>{e.stopPropagation();setSelectedDossiers(prev=>isSel?prev.filter(id=>id!==d.id):[...prev,d.id]);}}
                onClick={e=>e.stopPropagation()} style={{width:15,height:15,cursor:"pointer",accentColor:"#3B82F6",flexShrink:0}} />
              <div onClick={async ()=>{ if(confBlocked){handleUnlockConf(d);return;} setSelectedDossier(d); }} style={{display:"flex",gap:14,alignItems:"center",flex:1,minWidth:0,cursor:confBlocked?"not-allowed":"pointer",filter:confBlocked?"blur(1px) brightness(0.85)":"none"}}>
                <div style={{width:38,height:38,borderRadius:8,background:nat.color+"22",border:`1px solid ${nat.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{nat.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{color:T.text,fontWeight:700,fontSize:13}}>{d.client}</span>
                    <Badge label={nat.label} color={nat.color} small />
                    <Badge label={d.process} color={getProcColor(d.process)} small />
                    <Badge label={pc.label} color={pc.color} small />
                    {isReadOnly&&<Badge label="👁 Lecture seule" color="#6A85A8" small />}
                    {isSubmittedToMe&&<Badge label="🔔 Soumis à vous" color="#F59E0B" small />}
                    {isConf&&<Badge label={confBlocked?"🔒 CONFIDENTIEL":"🔒 CONF. ✓"} color="#C41E3A" small />}
                    {(d.classification&&d.classification!=="INTERNE")&&<Badge label={d.classification==="CONFIDENTIEL"?"🔒 CONF.":d.classification==="SECRET"?"⛔ SECRET":"🌐 PUBLIC"} color={d.classification==="CONFIDENTIEL"?"#F59E0B":d.classification==="SECRET"?"#EF4444":"#22C55E"} small />}
                    {myFileCount>0&&<span title={`${myFileCount} fichier(s)`} style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:99,padding:"1px 7px",fontSize:9,color:"#3B82F6",fontWeight:800}}>📎{myFileCount}</span>}
                    {myCollabCount>0&&<span title={`${myCollabCount} collaborateur(s)`} style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:99,padding:"1px 7px",fontSize:9,color:"#A855F7",fontWeight:800}}>👥{myCollabCount}</span>}
                    {/* v99 — Badge KYC */}
                    {d.intakeDocs?.length>0&&d.kycStatutDossier!=="VALIDE"&&(
                      <span style={{background:"#F59E0B22",color:"#F59E0B",border:"1px solid #F59E0B44",borderRadius:99,padding:"1px 7px",fontSize:9,fontWeight:800}}>🪪 KYC ⏳</span>
                    )}
                    {d.kycStatutDossier==="VALIDE"&&(
                      <span style={{background:"#22C55E22",color:"#22C55E",border:"1px solid #22C55E44",borderRadius:99,padding:"1px 7px",fontSize:9,fontWeight:800}}>🪪 KYC ✅</span>
                    )}
                  </div>
                  <div style={{color:T.textMuted,fontSize:11}}>{d.ref} — {d.objet}</div>
                  <ProgressBar value={d.progress} color={sc.color} />
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <Badge label={sc.label} color={sc.color} small />
                  {d.dueDate && (()=>{const ds=gcDelaiStatut(d.dueDate);return(<div style={{color:ds.color,fontSize:10,marginTop:4,fontWeight:700,background:ds.color+"15",borderRadius:4,padding:"1px 6px",border:`1px solid ${ds.color}33`}}>{ds.label}</div>);})()}
                  <div style={{width:18,height:18,borderRadius:"50%",background:user.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700,marginTop:4,marginLeft:"auto",overflow:"hidden"}}>
                    {user.photoUrl?<img src={user.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:user.avatar}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:3,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:150}}>
                {/* 📎 Fichiers — accès restreint aux personnes impliquées ou ayant des droits */}
                {canManipulateDossier(d)&&(
                  <button onClick={async e=>{e.stopPropagation();setUploadForm({description:"",accessLevel:localUser.level,fileName:"",fileData:"",fileSize:0,fileExt:"",fileMime:""});setShowUploadModal(d);}} title="Joindre / Voir fichiers" style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:6,padding:"4px 7px",color:"#3B82F6",cursor:"pointer",fontSize:11}}>📎{myFileCount>0?` ${myFileCount}`:""}</button>
                )}
                {/* 👥 Collaborateurs — propriétaire ou directement impliqué */}
                {!isReadOnly&&canManipulateDossier(d)&&((localUser?.isAdmin || localUser?.level >= 6)||localUser.level>=3||d.createdBy===localUser.id||d.assignedTo===localUser.id)&&(
                  <button onClick={async e=>{e.stopPropagation();setShowCollabModal(d);}} title="Gérer les collaborateurs" style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:6,padding:"4px 7px",color:"#A855F7",cursor:"pointer",fontSize:11}}>👥</button>
                )}
                {/* ✏️ Modifier — canEditDossier + canManipulateDossier */}
                {!isReadOnly&&canEditDossier(d)&&canManipulateDossier(d)&&(
                  <button onClick={async e=>{e.stopPropagation();handleOpenEdit(d);}} title="Modifier le dossier" style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:6,padding:"4px 7px",color:"#22C55E",cursor:"pointer",fontSize:11}}>✏️</button>
                )}
                {/* 📨 Soumettre pour validation — niv2-3 après traitement */}
                {!isReadOnly&&!(localUser?.isAdmin || localUser?.level >= 6)&&localUser.level<=3&&
                  (d.assignedTo===localUser.id||d.createdBy===localUser.id)&&
                  ["EN_COURS","ATTENTE_TRAITEMENT"].includes(d.status)&&(
                  <button onClick={async e=>{e.stopPropagation();setShowSubmitModal(d);}}
                    title="Soumettre au responsable pour validation/approbation/signature"
                    style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:6,padding:"4px 7px",color:"#F59E0B",cursor:"pointer",fontSize:11,fontWeight:700}}>
                    📨
                  </button>
                )}
                {/* ✅ Valider / ❌ Rejeter — responsable (niv4+) sur dossier soumis */}
                {!isReadOnly&&localUser.level>=4&&d.status==="ATTENTE_VALIDATION"&&myProcs.includes(d.process)&&(
                  <>
                    <button onClick={async e=>{e.stopPropagation();setShowValidateModal(d);}}
                      title="Valider / Approuver / Signer"
                      style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:6,padding:"4px 7px",color:"#22C55E",cursor:"pointer",fontSize:11,fontWeight:700}}>
                      ✅
                    </button>
                    <button onClick={async e=>{e.stopPropagation();setShowRejectModal(d);}}
                      title="Rejeter avec motif (retour pour corrections)"
                      style={{background:"#EF444422",border:"1px solid #EF444444",borderRadius:6,padding:"4px 7px",color:"#EF4444",cursor:"pointer",fontSize:11,fontWeight:700}}>
                      ❌
                    </button>
                  </>
                )}
                {/* ✅ Valider inline — soumis directement à cet utilisateur */}
                {!isReadOnly&&canValidateDossier(d)&&d.submittedTo===localUser.id&&d.status==="ATTENTE_TRAITEMENT"&&(
                  <button onClick={async e=>{e.stopPropagation();
                    setDossiers(prev => {
                      const updated = prev.map(x=>x.id===d.id?{...x,status:"EN_COURS",progress:Math.max(x.progress,10),validatedBy:localUser.id,validatedAt:new Date().toISOString()}:x);
                      // Sauvegarder en base de données pour synchronisation
                      dsSave("dossiers", updated, localUser.id);
                      return updated;
                    });
                    setNotifications(prev=>[{id:"N"+Date.now(),icon:"✅",message:`✅ Dossier validé par ${localUser.name} : ${d.ref}`,at:new Date().toISOString(),read:false,targetUsers:[d.createdBy]},...prev]);playSound("success");}}
                    title="Valider / Prendre en charge" style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:6,padding:"4px 7px",color:"#22C55E",cursor:"pointer",fontSize:11}}>✅</button>
                )}
                {/* 📤 Transférer — règle canTransferDossier */}
                {!isReadOnly&&canTransferDossier(d)&&(
                  <button onClick={async e=>{e.stopPropagation();setShowTransferModal(d);}} title="Transférer le dossier" style={{background:"#6366F122",border:"1px solid #6366F144",borderRadius:6,padding:"4px 7px",color:"#6366F1",cursor:"pointer",fontSize:11}}>📤</button>
                )}
                {/* ⬇️ Exporter ZIP — accessible aux collaborateurs impliqués ou admin */}
                {canManipulateDossier(d)&&(
                  <button onClick={async e=>{
                    e.stopPropagation();
                    const zipUrl = gcDossierZipUrl(d.id);
                    const token = getJWTToken?.() || null;
                    const headers = token ? { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } : {};
                    const resp = await fetch(zipUrl, { headers }).catch(()=>null);
                    if (!resp?.ok) { gcToast.error('Export ZIP indisponible. Vérifiez la connexion au serveur.'); return; }
                    const blob = await resp.blob();
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                    a.download = `${d.ref.replace(/\//g,'_')}.zip`; a.click();
                    URL.revokeObjectURL(a.href);
                  }} title={`Télécharger le dossier ${d.ref} en ZIP`} style={{background:"#06B6D422",border:"1px solid #06B6D444",borderRadius:6,padding:"4px 7px",color:"#06B6D4",cursor:"pointer",fontSize:11}}>⬇️</button>
                )}
                {/* 🗄️ Archiver — dossier TERMINE + droits */}
                {canArchiveDossier(d)&&d.status==="TERMINE"&&(
                  <button onClick={async e=>{e.stopPropagation();
                    if(!await gcConfirm(`Archiver le dossier ${d.ref} — ${d.client} ?\n\nLe dossier sera transmis à la Secrétaire Administrative (O01) pour classement physique.\nIl restera consultable ici avec le statut Archivé.`)) return;
                    const archRef=`ARCH-A${String(Date.now()).slice(-5)}-${d.process}/${new Date().getFullYear()}`;
                    const archEntry = {
                      id:"ARCH-"+Date.now(),
                      ref: archRef,
                      dossier: d.id,  // FIX v87: use d.id not d.ref
                      dossierRef: d.ref,
                      client: d.client, objet: d.objet||d.client,
                      archiveur: localUser.id, archiveurName: localUser.name,
                      archivedAt: new Date().toISOString(),
                      receivedBySec: false, secNotes:"",
                      process: d.process, docType:"DOS",
                      status:"EN_ATTENTE_SECRETARIAT", notes: d.notes||""};
                    try { const prev=JSON.parse(_lsGet("gc-archives")||"[]"); _lsSet("gc-archives", JSON.stringify([archEntry,...prev].slice(0,500))); dsSave("gc-archives", [archEntry,...prev].slice(0,500)).catch(err => gcToast.syncError('', err)); } catch(_) {}
                    setDossiers(prev => {
                      const updated = prev.map(x=>x.id===d.id?{...x,status:"ARCHIVE",archivedAt:new Date().toISOString(),archivedBy:localUser.id,archiveRef:archRef}:x);
                      // Sauvegarder en base de données pour synchronisation
                      dsSave("dossiers", updated, localUser.id);
                      return updated;
                    });
                    // Notifier O01 (secrétariat) + collaborateurs du dossier + responsable
                    const targets=[
                      ...(users||[]).filter(u=>(u.process==="O01"||(u.processes||[]).includes("O01"))&&u.level>=2),
                      ...(d.collaborators||[]).map(uid=>(users||[]).find(u=>u.id===uid)).filter(Boolean),
                      ...(d.assignedTo&&d.assignedTo!==localUser.id ? [(users||[]).find(u=>u.id===d.assignedTo)].filter(Boolean) : []),
                      ...(d.createdBy&&d.createdBy!==localUser.id ? [(users||[]).find(u=>u.id===d.createdBy)].filter(Boolean) : []),
                    ];
                    const notifMsg=`🗄️ Dossier archivé : ${d.ref} — ${d.client}. Réf. archivage : ${archRef}. ${targets.some(u=>u?.process==="O01")?"En attente de réception par le Secrétariat (O01).":""}`;
                    setNotifications(prev=>[{id:"N"+Date.now(),icon:"🗄️",message:notifMsg,at:new Date().toISOString(),read:false,module:"archivage"},...prev]);
                    const uniqueTargets=[...new Set(targets.map(u=>u?.id).filter(Boolean))];
                    uniqueTargets.forEach(uid=>{ try{ const k=`GC_SI_v12:notif:${uid}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now()+uid,icon:"🗄️",message:notifMsg,at:new Date().toISOString(),read:false,module:"archivage",urgent:true}); _lsSet(k,JSON.stringify(ex.slice(0,200))); }catch(_){} });
                    playSound("success");
                    gcAlert(`✅ Dossier ${d.ref} archivé.\nRéf. : ${archRef}\n\nLe Secrétariat (O01) a été notifié pour réception et classement physique.`);
                  }} title="Archiver ce dossier (transmis à O01 pour classement)" style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:6,padding:"4px 7px",color:"#F59E0B",cursor:"pointer",fontSize:11}}>🗄️</button>
                )}
                {/* 🗑️ Supprimer — droits canDeleteDossier, sans blocage isReadOnly pour le propriétaire */}
                {!hasPendingDel&&canDeleteDossier(d)&&(
                  <button onClick={async e=>{e.stopPropagation();handleDeleteRequest(d);}} title="Supprimer ce dossier" style={{background:"#EF444415",border:"1px solid #EF444444",borderRadius:6,padding:"4px 7px",color:"#EF4444",cursor:"pointer",fontSize:11}}>🗑️</button>
                )}
                {/* 🗑️⏳ Demander suppression — pour les autres niveaux si non propriétaire */}
                {!hasPendingDel&&!canDeleteDossier(d)&&canManipulateDossier(d)&&!isReadOnly&&(
                  <button onClick={async e=>{e.stopPropagation();handleDeleteRequest(d);}} title="Demander suppression (circuit approbation)" style={{background:"#EF444415",border:"1px solid #EF444444",borderRadius:6,padding:"4px 7px",color:"#EF4444",cursor:"pointer",fontSize:11}}>🗑️⏳</button>
                )}
                {hasPendingDel&&(
                  <span title="Demande de suppression en cours" style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:6,padding:"4px 7px",color:"#F59E0B",fontSize:11}}>⏳</span>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:40,fontSize:13}}>Aucun dossier trouvé</div>}
      </div>

      {/* Modal: Demande de suppression (Niv < 3) */}
      {showDeleteApproval&&(
        <Modal title="🗑️ Demande de Suppression" onClose={()=>setShowDeleteApproval(null)} T={T}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:8,padding:"10px 14px"}}>
              <div style={{color:"#EF4444",fontWeight:800,fontSize:12,marginBottom:4}}>⚠️ Approbation requise</div>
              <div style={{color:T.text,fontSize:12}}>Dossier : <strong>{showDeleteApproval.ref}</strong> — {showDeleteApproval.client}</div>
              <div style={{color:T.textMuted,fontSize:11,marginTop:4}}>Votre habilitation (Niv.{localUser.level}) nécessite l'approbation d'un supérieur (Niv.3+) pour supprimer un dossier.</div>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,fontWeight:700}}>Motif de suppression *</label>
              <textarea value={deleteMotif} onChange={e=>setDeleteMotif(e.target.value)} rows={3} placeholder="Raison de la suppression..." style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}} />
            </div>
            <div style={{background:T.surface2,borderRadius:8,padding:"8px 12px",fontSize:11,color:T.textMuted}}>📨 La demande sera transmise à votre supérieur pour approbation.</div>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="primary" onClick={handleSubmitDeleteRequest}>📤 Soumettre la demande</Btn>
              <Btn variant="ghost" onClick={()=>setShowDeleteApproval(null)}>Annuler</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Révision suppression (Supérieur) */}
      {showDeleteReview&&(
        <Modal title="🔍 Révision — Demande de Suppression" onClose={()=>setShowDeleteReview(null)} T={T}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:T.surface2,borderRadius:8,padding:"12px 14px"}}>
              {[["Dossier",showDeleteReview.dossierRef],["Client",showDeleteReview.dossierClient],["Demandé par",showDeleteReview.requestedByName+" — Niv."+showDeleteReview.requestedByLevel],["Date",formatDateTime(showDeleteReview.createdAt)],["Motif",showDeleteReview.motif]].map(([l,v])=>(
                <div key={l} style={{marginBottom:8}}>
                  <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:0.8,marginBottom:2}}>{l}</div>
                  <div style={{color:T.text,fontSize:12,fontWeight:l==="Motif"?400:700}}>{v}</div>
                </div>
              ))}
            </div>
            <Btn variant="primary" style={{background:"#22C55E",boxShadow:"none"}} onClick={()=>handleApproveDelete(showDeleteReview)}>✅ Approuver la suppression</Btn>
            <div style={{borderTop:`1px solid ${T.border}`,paddingTop:10}}>
              <label style={{color:"#EF4444",fontSize:11,display:"block",marginBottom:4,fontWeight:700}}>Motif de refus *</label>
              <textarea value={rejectMotif} onChange={e=>setRejectMotif(e.target.value)} rows={2} placeholder="Raison du refus..." style={{width:"100%",background:T.surface2,border:"1px solid #EF444444",borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}} />
              <Btn variant="danger" style={{marginTop:8}} onClick={()=>handleRejectDelete(showDeleteReview)}>❌ Rejeter</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Édition dossier */}
      {showEditModal&&(
        <Modal title={`✏️ Modifier — ${showEditModal.ref}`} onClose={()=>setShowEditModal(null)} T={T} wide>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <InputField label="Client / Intitulé *" value={editForm.client||""} onChange={e=>setEditForm(f=>({...f,client:e.target.value}))} T={T} />
              <SelectField label="Priorité" value={editForm.priority||"NORMALE"} onChange={e=>setEditForm(f=>({...f,priority:e.target.value}))} options={Object.entries(PRIORITY_CONFIG).map(([k,v])=>({value:k,label:v.label}))} T={T} />
            </div>
            <InputField label="Objet / Description *" value={editForm.objet||""} onChange={e=>setEditForm(f=>({...f,objet:e.target.value}))} T={T} />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <InputField label="Date d'échéance" type="date" value={editForm.dueDate||""} onChange={e=>setEditForm(f=>({...f,dueDate:e.target.value}))} T={T} />
              <InputField label="Montant estimé (FCFA)" type="number" value={editForm.amount||""} onChange={e=>setEditForm(f=>({...f,amount:Number(e.target.value)}))} T={T} />
            </div>
            <SelectField label="Statut" value={editForm.status||"ATTENTE_TRAITEMENT"} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))} options={Object.entries(STATUS_CONFIG).map(([k,v])=>({value:k,label:v.label}))} T={T} />
            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>Notes</label>
              <textarea value={editForm.notes||""} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))} rows={3} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}} />
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="primary" onClick={handleSaveEdit}>💾 Enregistrer</Btn>
              <Btn variant="ghost" onClick={()=>setShowEditModal(null)}>Annuler</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showCollabModal&&<CollabModal
        key={showCollabModal.id}
        T={T} dossier={showCollabModal}
        users={users} localUser={localUser} partners={partners}
        handleSaveCollabs={handleSaveCollabs}
        setShowCollabModal={setShowCollabModal}
      />}
      {showUploadModal&&<UploadModal
        key={showUploadModal.id}
        T={T} dossier={showUploadModal}
        dossierFiles={dossierFiles} localUser={localUser}
        uploadForm={uploadForm} setUploadForm={setUploadForm}
        fileUploadStatus={fileUploadStatus} setFileUploadStatus={setFileUploadStatus}
        uploadRef={uploadRef}
        handleFileSelect={handleFileSelect} handleSaveUpload={handleSaveUpload}
        handleDownloadFile={handleDownloadFile} handleViewFile={handleViewFile} handleDeleteFile={handleDeleteFile}
        saveDossierFiles={saveDossierFiles} setShowUploadModal={setShowUploadModal}
        gcDocIcon={gcDocIcon} formatDate={formatDate}
      />}

      {showNewDossier&&(
        <Modal title="📁 Nouveau Dossier" onClose={()=>setShowNewDossier(false)} T={T} wide>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:6,marginBottom:4}}>
              {Object.entries(NATURE_CONFIG).map(([k,v])=>(
                <button key={k} onClick={()=>setNewDossierForm(f=>({...f,nature:k,partnerId:""}))}
                  style={{flex:1,background:newDossierForm.nature===k?v.color:T.surface2,border:`1px solid ${newDossierForm.nature===k?v.color:T.border}`,borderRadius:8,padding:"8px 12px",cursor:"pointer",color:newDossierForm.nature===k?"#fff":T.textMuted,fontWeight:newDossierForm.nature===k?800:400,fontSize:12}}>
                  {v.icon} {v.label}<br/><span style={{fontSize:9,opacity:0.8}}>{v.desc}</span>
                </button>
              ))}
            </div>

            {/* Avertissement si niv2 non-O01 tente de créer EXTERNE */}
            {!canCreateExternal && newDossierForm.nature==="EXTERNE" && localUser.level < 3 && (
              <div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#EF4444",fontWeight:700}}>
                ⛔ Niveau insuffisant. Les dossiers externes nécessitent Niv.3+ ou processus O01.
              </div>
            )}
            {!isO01 && newDossierForm.nature==="EXTERNE" && localUser.level >= 3 && (
              <div style={{background:"#F59E0B15",border:"1px solid #F59E0B44",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#D97706",fontWeight:600}}>
                ℹ️ Le dossier externe sera automatiquement soumis au processus O01 (Administration) pour traitement. Vous pouvez aussi choisir un destinataire manuellement.
              </div>
            )}
            {newDossierForm.nature==="EXTERNE"&&(
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>🤝 Collaborateur / Client concerné</label>
                <select value={newDossierForm.partnerId} onChange={async e=>{const p=partners.find(x=>x.id===e.target.value);setNewDossierForm(f=>({...f,partnerId:e.target.value,client:p?p.nom:f.client}));}} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
                  <option value="">— Saisir manuellement —</option>
                  <optgroup label="🤝 Clients">{partners.filter(p=>p.type==="client").map(p=><option key={p.id} value={p.id}>🤝 {p.nom}</option>)}</optgroup>
                  <optgroup label="📦 Fournisseurs">{partners.filter(p=>p.type==="fournisseur").map(p=><option key={p.id} value={p.id}>📦 {p.nom}</option>)}</optgroup>
                  <optgroup label="⚖️ Réglementaires">{partners.filter(p=>p.type==="regulateur").map(p=><option key={p.id} value={p.id}>⚖️ {p.nom}</option>)}</optgroup>
                  <optgroup label="🏛️ État & Institutions">{partners.filter(p=>p.type==="etat").map(p=><option key={p.id} value={p.id}>🏛️ {p.nom}</option>)}</optgroup>
                  <optgroup label="🌐 Partenaires">{partners.filter(p=>p.type==="partenaire").map(p=><option key={p.id} value={p.id}>🌐 {p.nom}</option>)}</optgroup>
                </select>
                {/* FIX v83 — Création rapide inline si aucun partenaire ou partenaire non trouvé */}
                <QuickPartnerCreate
                  T={T} partners={partners} setPartnersSync={setPartnersSync}
                  selectedId={newDossierForm.partnerId}
                  onSelect={(id, newP) => {
                    const nom = newP?.nom || partners.find(x=>x.id===id)?.nom || "";
                    setNewDossierForm(f=>({...f, partnerId:id, client:nom||f.client}));
                  }}
                  canCreate={(localUser?.isAdmin||localUser?.level>=6)||localUser.level>=4||isO01}
                />
              </div>
            )}

            {newDossierForm.nature==="INTERNE"&&(
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>👤 Collaborateur interne concerné (optionnel)</label>
                <select value={newDossierForm.internalUserId||""} onChange={e=>setNewDossierForm(f=>({...f,internalUserId:e.target.value,client:e.target.value?users.find(u=>u.id===e.target.value)?.name||f.client:f.client}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
                  <option value="">— Dossier général —</option>
                  {users.filter(u=>_activeUser(u)&&u.level>=1).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role} (Niv.{u.level})</option>)}
                </select>
              </div>
            )}

            <InputField label={newDossierForm.nature==="INTERNE"?"Intitulé *":"Client / Référence *"} value={newDossierForm.client} onChange={e=>setNewDossierForm(f=>({...f,client:e.target.value}))} T={T} />
            <InputField label="Objet / Description *" value={newDossierForm.objet} onChange={e=>setNewDossierForm(f=>({...f,objet:e.target.value}))} T={T} />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <SelectField label={isO01&&newDossierForm.nature==="EXTERNE"?"📤 Processus destinataire":"Processus"} value={newDossierForm.process} onChange={e=>setNewDossierForm(f=>({...f,process:e.target.value}))}
                options={Object.entries(CODES.processes).filter(([k])=>
                  (localUser?.isAdmin || localUser?.level >= 6) || localUser.level>=4 ||
                  (isO01 && newDossierForm.nature==="EXTERNE") || // O01 peut router vers n'importe quel processus
                  (localUser.processes||[localUser.process]).includes(k)
                ).map(([k,v])=>({value:k,label:`${k} – ${v}`}))} T={T} />
              <SelectField label="Priorité" value={newDossierForm.priority} onChange={e=>setNewDossierForm(f=>({...f,priority:e.target.value}))} options={Object.entries(PRIORITY_CONFIG).map(([k,v])=>({value:k,label:v.label}))} T={T} />
              <InputField label="Date d'échéance" type="date" value={newDossierForm.dueDate} onChange={e=>setNewDossierForm(f=>({...f,dueDate:e.target.value}))} T={T} />
              {newDossierForm.nature==="EXTERNE"&&<InputField label="Montant estimé (FCFA)" type="number" value={newDossierForm.amount} onChange={e=>setNewDossierForm(f=>({...f,amount:parseFloat(e.target.value)||0}))} T={T} />}
            </div>

            {/* Soumission : obligatoire si EXTERNE non-O01, optionnelle sinon */}
            {(()=>{
              const isSelfDoc = newDossierForm.nature==="INTERNE" &&
                (newDossierForm.internalUserId===localUser.id || !newDossierForm.internalUserId);
              const isExterneNonO01 = newDossierForm.nature==="EXTERNE" && !isO01;
              return (
            <div style={{background:isExterneNonO01?"#F59E0B10":"#3B82F615",border:`1px solid ${isExterneNonO01?"#F59E0B44":"#3B82F633"}`,borderRadius:10,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{color:isExterneNonO01?"#D97706":"#3B82F6",fontWeight:800,fontSize:12}}>
                  {isExterneNonO01?"📤 Soumission O01 obligatoire":"📤 Soumettre à un collaborateur"}
                  {isSelfDoc&&<span style={{color:T.textDim,fontWeight:400,fontSize:10,marginLeft:8}}>(optionnel — document personnel)</span>}
                </div>
                {isSelfDoc&&!isExterneNonO01&&(
                  <span style={{background:"#22C55E22",color:"#22C55E",borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700}}>✅ Pas de soumission requise</span>
                )}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:600}}>Destinataire</label>
                  <select value={newDossierForm.submitTo} onChange={e=>setNewDossierForm(f=>({...f,submitTo:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="">— Auto (responsable processus) —</option>
                    {(()=>{
                      if (isO01 && newDossierForm.nature==="EXTERNE") {
                        // O01 soumet aux responsables processus destinataire
                        return users.filter(u=>_activeUser(u)&&u.level>=2&&!u.isAdmin&&u.id!==localUser.id);
                      }
                      if (!isO01 && newDossierForm.nature==="EXTERNE") {
                        // Non-O01 : doit soumettre à O01 en priorité, mais peut aussi choisir
                        return users.filter(u=>_activeUser(u)&&u.id!==localUser.id&&u.level>=2&&!u.isAdmin);
                      }
                      // Dossier INTERNE : tous les collaborateurs
                      return users.filter(u=>_activeUser(u)&&u.id!==localUser.id&&u.level>=1&&!u.isAdmin);
                    })().map(u=><option key={u.id} value={u.id}>{u.name} — {u.role} (Niv.{u.level} · {u.process})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:600}}>Action demandée</label>
                  <select value={newDossierForm.submitAction} onChange={e=>setNewDossierForm(f=>({...f,submitAction:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                    {["TRAITER","VALIDER","SIGNER","APPROUVER","RÉVISER","ARCHIVER","TRANSMETTRE","CONSULTER","NOTIFIER","POUR INFO"].map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div style={{marginTop:8}}>
                <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:600}}>Motif / Instructions</label>
                <textarea value={newDossierForm.submitMotif} onChange={e=>setNewDossierForm(f=>({...f,submitMotif:e.target.value}))} rows={2} placeholder="Ex: Validation avant envoi au client..." style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,resize:"none",boxSizing:"border-box"}} />
              </div>
              {(()=>{
                const o01Resp = (!isO01&&newDossierForm.nature==="EXTERNE") ? users.find(u=>(u.process==="O01"||(u.processes||[]).includes("O01"))&&u.level>=3&&!u.isAdmin) : null;
                const sup=newDossierForm.submitTo?users.find(u=>u.id===newDossierForm.submitTo):(o01Resp||findSuperior(newDossierForm.process));
                if(!sup&&newDossierForm.nature==="INTERNE"&&!newDossierForm.submitTo) return <div style={{marginTop:6,background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:6,padding:"6px 10px",fontSize:11,color:"#22C55E",display:"flex",alignItems:"center",gap:6}}><span>✅</span><span>Document enregistré directement dans vos dossiers — aucune soumission nécessaire.</span></div>;
                return sup?(<div style={{marginTop:6,background:o01Resp?"#F59E0B11":"#3B82F611",border:`1px solid ${o01Resp?"#F59E0B33":"#3B82F633"}`,borderRadius:6,padding:"6px 10px",fontSize:11,color:T.text,display:"flex",alignItems:"center",gap:6}}><span>📨</span><span>Soumission à : <strong style={{color:o01Resp?"#D97706":"#3B82F6"}}>{sup.name}</strong> — Action : <strong style={{color:"#F59E0B"}}>{newDossierForm.submitAction}</strong></span></div>):null;
              })()}
            </div>
              );})()}

            {/* ── CONFIDENTIEL (niv 4+) ── */}
            {localUser.level >= 4 && (
              <div style={{background:newDossierForm.confidentiel?"#C41E3A10":"#44444410",border:`1.5px solid ${newDossierForm.confidentiel?"#C41E3A44":"#44444444"}`,borderRadius:10,padding:"12px 14px",transition:"all 0.2s"}}>
                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:newDossierForm.confidentiel?10:0}}>
                  <input type="checkbox" checked={newDossierForm.confidentiel} onChange={e=>setNewDossierForm(f=>({...f,confidentiel:e.target.checked,confPass:"",confAccess:[]}))} style={{width:16,height:16,accentColor:"#C41E3A"}} />
                  <span style={{color:newDossierForm.confidentiel?"#C41E3A":T.textMuted,fontWeight:700,fontSize:12}}>🔒 Dossier Confidentiel</span>
                  <span style={{color:T.textDim,fontSize:10,marginLeft:4}}>(visible uniquement par les utilisateurs autorisés)</span>
                </label>
                {newDossierForm.confidentiel && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>
                      <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Mot de passe d'accès *</label>
                      <input type="password" value={newDossierForm.confPass} onChange={e=>setNewDossierForm(f=>({...f,confPass:e.target.value}))}
                        placeholder="Min. 6 caractères" style={{width:"100%",background:T.surface3,border:"1px solid #C41E3A44",borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                    </div>
                    <div>
                      <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Accès autorisé à</label>
                      <select multiple value={newDossierForm.confAccess} onChange={e=>setNewDossierForm(f=>({...f,confAccess:[...e.target.selectedOptions].map(o=>o.value)}))} style={{width:"100%",background:T.surface3,border:"1px solid #C41E3A44",borderRadius:7,padding:"4px 8px",color:T.text,fontSize:10,height:80}}>
                        {users.filter(u=>_activeUser(u)&&u.id!==localUser.id&&!u.blocked&&u.level>=2).map(u=><option key={u.id} value={u.id}>{u.name} (Niv.{u.level})</option>)}
                      </select>
                      <div style={{color:T.textDim,fontSize:9,marginTop:2}}>Ctrl+clic pour sélectionner plusieurs</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{display:"flex",gap:8,marginTop:6}}>
              <Btn variant="primary" onClick={handleCreateDossier}>✅ Créer & Soumettre</Btn>
              <Btn variant="ghost" onClick={()=>setShowNewDossier(false)}>Annuler</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showTransferModal && (
        <TransferModal dossier={showTransferModal} users={users} currentUser={localUser} onTransfer={handleTransfer} onClose={() => setShowTransferModal(null)} T={T} />
      )}

      {/* ── Modal : Soumettre pour validation (niv2-3) ── */}
      {showSubmitModal&&(
        <Modal title={`📨 Soumettre — ${showSubmitModal.ref}`} onClose={()=>setShowSubmitModal(null)} T={T}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"10px 14px"}}>
              <div style={{color:"#F59E0B",fontWeight:800,fontSize:12,marginBottom:4}}>📨 Soumettre au responsable</div>
              <div style={{color:T.text,fontSize:12}}><strong>{showSubmitModal.ref}</strong> — {showSubmitModal.client}</div>
              <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>Ce dossier sera transmis à votre responsable de processus pour validation, approbation ou signature.</div>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,fontWeight:700}}>Action demandée *</label>
              <select value={submitForm.action} onChange={e=>setSubmitForm(f=>({...f,action:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
                {["VALIDER","APPROUVER","SIGNER","CONSULTER","NOTIFIER","POUR INFO"].map(a=><option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,fontWeight:700}}>Destinataire</label>
              <select value={submitForm.submitTo} onChange={e=>setSubmitForm(f=>({...f,submitTo:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
                <option value="">— Auto (responsable processus) —</option>
                {users.filter(u=>_activeUser(u)&&u.level>=4&&myProcs.some(p=>(u.processes||[u.process]).includes(p))&&u.id!==localUser.id)
                  .map(u=><option key={u.id} value={u.id}>{u.name} — Niv.{u.level} · {u.role}</option>)}
              </select>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,fontWeight:700}}>Message / Motif (optionnel)</label>
              <textarea value={submitForm.motif} onChange={e=>setSubmitForm(f=>({...f,motif:e.target.value}))} rows={3}
                placeholder="Ex: Traitement terminé — en attente de validation avant envoi client…"
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="primary" onClick={async ()=>{
                const d = showSubmitModal;
                const sup = submitForm.submitTo ? users.find(u=>u.id===submitForm.submitTo) : findSuperior(d.process);
                if (!sup) { gcAlert("Aucun responsable trouvé pour ce processus."); return; }
                const now = new Date().toISOString();
                setDossiers(prev => {
                  const updated = prev.map(x=>x.id===d.id?{...x,
                    status:"ATTENTE_VALIDATION",
                    submittedTo:sup.id, submittedToName:sup.name,
                    submitAction:submitForm.action,
                    submitMotif:submitForm.motif,
                    submittedAt:now,
                    submittedBy:localUser.id}:x);
                  // Sauvegarder en base de données pour synchronisation
                  dsSave("dossiers", updated, localUser.id);
                  return updated;
                });
                setNotifications(prev=>[{id:"N"+Date.now(),icon:"📨",
                  message:`📨 [${submitForm.action}] Dossier soumis par ${localUser.name} → ${sup.name} : ${d.ref} — ${d.client}${submitForm.motif?` — "${submitForm.motif}"`:""}`
                  ,at:now,read:false,targetUsers:[sup.id]},...prev]);
                addSessionLog&&addSessionLog("SOUMISSION",localUser,{status:"PENDING",reason:`${d.ref} soumis à ${sup.name} [${submitForm.action}]`});
                setShowSubmitModal(null);
                setSubmitForm({action:"VALIDER",motif:"",submitTo:""});
                playSound("message");
              }}>📨 Soumettre</Btn>
              <Btn variant="ghost" onClick={()=>setShowSubmitModal(null)}>Annuler</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal : Validation responsable ── */}
      {showValidateModal&&(
        <Modal title={`✅ Valider — ${showValidateModal.ref}`} onClose={()=>setShowValidateModal(null)} T={T}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:8,padding:"10px 14px"}}>
              <div style={{color:"#22C55E",fontWeight:800,fontSize:12,marginBottom:4}}>✅ Validation du dossier</div>
              <div style={{color:T.text,fontSize:12}}><strong>{showValidateModal.ref}</strong> — {showValidateModal.client}</div>
              <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>
                Soumis par : <strong>{users.find(u=>u.id===showValidateModal.submittedBy)?.name||"—"}</strong>
                {showValidateModal.submitAction&&<> · Action demandée : <strong style={{color:"#F59E0B"}}>{showValidateModal.submitAction}</strong></>}
                {showValidateModal.submitMotif&&<><br/><em>"{showValidateModal.submitMotif}"</em></>}
              </div>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,fontWeight:700}}>Action de validation *</label>
              <select value={validateForm.action} onChange={e=>setValidateForm(f=>({...f,action:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
                {["VALIDER","APPROUVER","SIGNER","VALIDER & CLÔTURER","VALIDER & ARCHIVER"].map(a=><option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,fontWeight:700}}>Observations (optionnel)</label>
              <textarea value={validateForm.motif} onChange={e=>setValidateForm(f=>({...f,motif:e.target.value}))} rows={2}
                placeholder="Commentaire de validation…"
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="primary" onClick={async ()=>{
                const d = showValidateModal;
                const now = new Date().toISOString();
                const newStatus = validateForm.action.includes("CLÔTURER")?"TERMINE":
                                  validateForm.action.includes("ARCHIVER")?"ARCHIVE":"EN_COURS";
                setDossiers(prev => {
                  const updated = prev.map(x=>x.id===d.id?{...x,
                    status:newStatus,
                    progress:newStatus==="TERMINE"||newStatus==="ARCHIVE"?100:Math.max(x.progress,50),
                    validatedBy:localUser.id, validatedByName:localUser.name,
                    validateAction:validateForm.action,
                    validateMotif:validateForm.motif,
                    validatedAt:now,
                    submittedTo:null}:x);
                  // Sauvegarder en base de données pour synchronisation
                  dsSave("dossiers", updated, localUser.id);
                  return updated;
                });
                setNotifications(prev=>[{id:"N"+Date.now(),icon:"✅",
                  message:`✅ Dossier ${validateForm.action} par ${localUser.name} : ${d.ref}${validateForm.motif?` — "${validateForm.motif}"`:""}`
                  ,at:now,read:false,targetUsers:[d.submittedBy||d.createdBy]},...prev]);
                addSessionLog&&addSessionLog("VALIDATION",localUser,{status:"SUCCESS",reason:`${d.ref} — ${validateForm.action}`});
                setShowValidateModal(null);
                setValidateForm({action:"VALIDER",motif:""});
                playSound("success");
              }}>✅ {validateForm.action}</Btn>
              <Btn variant="ghost" onClick={()=>setShowValidateModal(null)}>Annuler</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal : Rejet avec motif obligatoire ── */}
      {showRejectModal&&(
        <Modal title={`❌ Rejeter — ${showRejectModal.ref}`} onClose={()=>setShowRejectModal(null)} T={T}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:8,padding:"10px 14px"}}>
              <div style={{color:"#EF4444",fontWeight:800,fontSize:12,marginBottom:4}}>❌ Rejet — Retour pour corrections</div>
              <div style={{color:T.text,fontSize:12}}><strong>{showRejectModal.ref}</strong> — {showRejectModal.client}</div>
              <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>
                Le dossier retournera à <strong>{users.find(u=>u.id===showRejectModal.submittedBy||u.id===showRejectModal.createdBy)?.name||"son auteur"}</strong> pour corrections.
              </div>
            </div>
            <div>
              <label style={{color:"#EF4444",fontSize:11,display:"block",marginBottom:4,fontWeight:700}}>Motif du rejet * (obligatoire)</label>
              <textarea value={rejectMotif} onChange={e=>setRejectMotif(e.target.value)} rows={4}
                placeholder="Décrivez précisément les corrections à apporter…"
                style={{width:"100%",background:T.surface2,border:"1px solid #EF444444",borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}}/>
              {!rejectMotif.trim()&&<div style={{color:"#EF4444",fontSize:10,marginTop:3}}>⚠️ Le motif est obligatoire pour tout rejet.</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="danger" onClick={async ()=>{
                if (!rejectMotif.trim()) { gcAlert("Le motif de rejet est obligatoire."); return; }
                const d = showRejectModal;
                const now = new Date().toISOString();
                const targetUser = d.submittedBy || d.createdBy;
                setDossiers(prev => {
                  const updated = prev.map(x=>x.id===d.id?{...x,
                    status:"EN_COURS",
                    submittedTo:null,
                    rejectedBy:localUser.id, rejectedByName:localUser.name,
                    rejectMotif:rejectMotif,
                    rejectedAt:now,
                    notes:(x.notes||"")+`\n\n[REJET ${new Date().toLocaleDateString("fr-FR")}] ${localUser.name} : ${rejectMotif}`}:x);
                  // Sauvegarder en base de données pour synchronisation
                  dsSave("dossiers", updated, localUser.id);
                  return updated;
                });
                setNotifications(prev=>[{id:"N"+Date.now(),icon:"❌",
                  message:`❌ Dossier rejeté par ${localUser.name} — Corrections requises : ${rejectMotif} — Dossier : ${d.ref}`,
                  at:now,read:false,targetUsers:[targetUser]},...prev]);
                addSessionLog&&addSessionLog("REJET",localUser,{status:"REJECTED",reason:`${d.ref} rejeté — ${rejectMotif}`});
                setShowRejectModal(null);
                setRejectMotif("");
                playSound("notif");
              }}>❌ Confirmer le rejet</Btn>
              <Btn variant="ghost" onClick={async ()=>{setShowRejectModal(null);setRejectMotif("");}}>Annuler</Btn>
            </div>
          </div>
        </Modal>
      )}
      </div>)} {/* END dossierSubTab === "dossiers" */}

      {/* showNewDoc accessible depuis les deux onglets */}
      {showNewDoc&&(
        <Modal title="📄 Nouveau Document" onClose={()=>setShowNewDoc(false)} T={T} wide>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:6,marginBottom:4}}>
              {[{k:"INTERNE",label:"🗂️ Interne Cabinet",desc:"Procédure, rapport, modèle"},{k:"EXTERNE",label:"📎 Document Externe",desc:"Pièce client, contrat, facture"}].map(bt=>(
                <button key={bt.k} onClick={()=>setNewDocForm(f=>({...f,nature:bt.k}))}
                  style={{flex:1,background:newDocForm.nature===bt.k?"#3B82F6":T.surface2,border:`1px solid ${newDocForm.nature===bt.k?"#3B82F6":T.border}`,borderRadius:8,padding:"7px 10px",cursor:"pointer",color:newDocForm.nature===bt.k?"#fff":T.textMuted,fontWeight:newDocForm.nature===bt.k?800:400,fontSize:11}}>
                  {bt.label}<br/><span style={{fontSize:9,opacity:0.8}}>{bt.desc}</span>
                </button>
              ))}
            </div>
            <InputField label="Titre du document *" value={newDocForm.titre} onChange={e=>setNewDocForm(f=>({...f,titre:e.target.value}))} T={T} />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <SelectField label="Type" value={newDocForm.type} onChange={e=>setNewDocForm(f=>({...f,type:e.target.value}))} options={Object.entries(CODES.types).map(([k,v])=>({value:k,label:`${k} – ${v}`}))} T={T} />
              <SelectField label="Processus" value={newDocForm.process} onChange={e=>setNewDocForm(f=>({...f,process:e.target.value}))}
                options={Object.entries(CODES.processes).filter(([k])=>localUser.level>=4||(localUser.processes||[localUser.process]).includes(k)).map(([k,v])=>({value:k,label:`${k} – ${v}`}))} T={T} />
            </div>
            {newDocForm.nature==="INTERNE"&&(
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>👤 Collaborateur interne concerné</label>
                <select value={newDocForm.linkedUserId||""} onChange={e=>setNewDocForm(f=>({...f,linkedUserId:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
                  <option value="">— Document général —</option>
                  {users.filter(u=>_activeUser(u)&&u.level>=1&&((localUser?.isAdmin || localUser?.level >= 6)||u.level<=localUser.level)).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role} (Niv.{u.level})</option>)}
                </select>
              </div>
            )}
            {newDocForm.nature==="EXTERNE"&&(
              <>
                <div>
                  <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>🤝 Partenaire / Externe</label>
                  <select value={newDocForm.partnerId||""} onChange={e=>setNewDocForm(f=>({...f,partnerId:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
                    <option value="">— Non spécifié —</option>
                    <optgroup label="🤝 Clients">{partners.filter(p=>p.type==="client").map(p=><option key={p.id} value={p.id}>🤝 {p.nom}</option>)}</optgroup>
                    <optgroup label="📦 Fournisseurs">{partners.filter(p=>p.type==="fournisseur").map(p=><option key={p.id} value={p.id}>📦 {p.nom}</option>)}</optgroup>
                    <optgroup label="⚖️ Autres">{partners.filter(p=>p.type!=="client"&&p.type!=="fournisseur").map(p=><option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup>
                  </select>
                  {/* FIX v83 — Création rapide inline */}
                  <QuickPartnerCreate
                    T={T} partners={partners} setPartnersSync={setPartnersSync}
                    selectedId={newDocForm.partnerId}
                    onSelect={(id, _newP)=>setNewDocForm(f=>({...f,partnerId:id}))}
                    canCreate={(localUser?.isAdmin||localUser?.level>=6)||localUser.level>=4||isO01}
                  />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>📁 Dossier associé</label>
                  <select value={newDocForm.dossierId||""} onChange={e=>setNewDocForm(f=>({...f,dossierId:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
                    <option value="">— Aucun dossier spécifique —</option>
                    {userDossiers.filter(d=>d.nature==="EXTERNE"||(newDocForm.partnerId&&d.partnerId===newDocForm.partnerId)).map(d=><option key={d.id} value={d.id}>{d.ref} — {d.client}</option>)}
                  </select>
                </div>
              </>
            )}
            <InputField label="Description" value={newDocForm.description} onChange={e=>setNewDocForm(f=>({...f,description:e.target.value}))} T={T} />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>🔒 Niveau d'accès minimum</label>
                <select value={newDocForm.accessLevel||localUser.level} onChange={e=>setNewDocForm(f=>({...f,accessLevel:parseInt(e.target.value, 10)}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}>
                  {[1,2,3,4,5,6].filter(l=>l<=localUser.level||((localUser?.isAdmin || localUser?.level >= 6))).map(l=><option key={l} value={l}>Niv.{l}+{l===1?" (Tout le monde)":l===localUser.level?" (Mon niveau)":""}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>📎 Pièce jointe (optionnel)</label>
                <div style={{position:"relative",height:42}}>
                  <input ref={docUploadRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png,.txt,.csv,.pptx,.zip" style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",zIndex:2,width:"100%",height:"100%"}}
                    onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>10*1024*1024){gcAlert("Max 10 Mo.");return;}const ext="."+f.name.split(".").pop().toLowerCase();const [ref]=await _uploadFiles([f],{module:"docs"}); if(ref) setNewDocForm(p=>({...p,fileRef:ref,fileName:ref.nom,fileData:ref.dataUrl||ref.path}))}} />
                  <div style={{background:T.surface2,border:`1px dashed ${newDocForm.fileName?"#22C55E":T.border}`,borderRadius:8,padding:"10px 12px",textAlign:"center",color:newDocForm.fileName?"#22C55E":T.textMuted,fontSize:11,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",pointerEvents:"none"}}>
                    {newDocForm.fileName?`✅ ${newDocForm.fileName}`:"📂 Cliquer pour joindre"}
                  </div>
                </div>
              </div>
            </div>
            {(()=>{
              const isSelfDoc = newDocForm.nature==="INTERNE" &&
                (!newDocForm.linkedUserId || newDocForm.linkedUserId===localUser.id);
              const isExterneDoc = newDocForm.nature==="EXTERNE";
              return (
            <div style={{background:isSelfDoc?"#22C55E10":"#3B82F615",border:`1px solid ${isSelfDoc?"#22C55E33":"#3B82F633"}`,borderRadius:10,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{color:isSelfDoc?"#22C55E":"#3B82F6",fontWeight:800,fontSize:12}}>📤 Soumettre / Affecter</div>
                {isSelfDoc&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700}}>✅ Document personnel — soumission optionnelle</span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:600}}>{isSelfDoc?"Partager avec (optionnel)":"Soumettre à"}</label>
                  <select value={newDocForm.submitTo||""} onChange={e=>setNewDocForm(f=>({...f,submitTo:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="">{isSelfDoc?"— Garder pour moi —":"— Pas de soumission —"}</option>
                    {users.filter(u=>_activeUser(u)&&u.id!==localUser.id&&((localUser?.isAdmin || localUser?.level >= 6)||u.level>=1)&&!u.isAdmin).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role} (Niv.{u.level})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:600}}>Action demandée</label>
                  <select value={newDocForm.submitAction||"CONSULTER"} onChange={e=>setNewDocForm(f=>({...f,submitAction:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                    {["CONSULTER","VALIDER","SIGNER","APPROUVER","RÉVISER","ARCHIVER","TRANSMETTRE","POUR INFO"].map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
            </div>
              );})()}
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <Btn variant="primary" onClick={async ()=>{
                if(!newDocForm.titre){gcAlert("Titre requis.");return;}
                const now=new Date().toISOString();
                // FIX v83 — linkedPartner may be null for a freshly created partner (state in flight).
                // partnerNomDoc falls back to the text already stored in newDocForm if needed.
                const linkedPartner=partners.find(p=>p.id===newDocForm.partnerId);
                const partnerNomDoc=linkedPartner?.nom||(newDocForm.partnerId?newDocForm.titre:"");
                const linkedDossier=dossiers.find(d=>d.id===newDocForm.dossierId);
                const submitUser=users.find(u=>u.id===newDocForm.submitTo);
                const docId="DOC-"+Date.now();
                const docSeq=`D${String(Date.now()).slice(-5)}`;
                const docRef=`${newDocForm.type||"DOC"}-${docSeq}-${newDocForm.process||localUser.process}/${new Date().getFullYear()}`;
                const newDoc={id:docId,ref:docRef,titre:newDocForm.titre,type:newDocForm.type||"DOC",nature:newDocForm.nature||"INTERNE",process:newDocForm.process||localUser.process,description:newDocForm.description,linkedUserId:newDocForm.linkedUserId||null,partnerId:newDocForm.partnerId||null,partnerNom:linkedPartner?.nom||null,dossierId:newDocForm.dossierId||null,dossierRef:linkedDossier?.ref||null,submitTo:newDocForm.submitTo||null,submitToName:submitUser?.name||null,submitAction:newDocForm.submitAction||"CONSULTER",accessLevel:newDocForm.accessLevel||localUser.level,fileName:newDocForm.fileName||null,fileData:newDocForm.fileData||null,fileSize:newDocForm.fileSize||0,fileExt:newDocForm.fileExt||null,fileMime:newDocForm.fileMime||null,createdBy:localUser.id,createdByName:localUser.name,createdAt:now,downloads:0,status:submitUser?"EN_ATTENTE":"ACTIF",qrCode:docRef};
                saveStandaloneDocs(prev=>[newDoc,...prev]);
                // FIX v83 — sync document to partner's record using functional updater
                if(newDocForm.partnerId) setPartnersSync(prev=>prev.map(p=>p.id===newDocForm.partnerId?{...p,docsIds:[...(p.docsIds||[]),docId]}:p));
                const docCodifEntry = {id:"COD-DOC-"+Date.now(),ref:docRef,type:newDocForm.type||"DOC",process:newDocForm.process||localUser.process,seq:docSeq,subproc:newDocForm.process||localUser.process,version:"1.0",year:String(new Date().getFullYear()),label:(newDocForm.titre+(linkedPartner?" — "+linkedPartner.nom:"")+(linkedDossier?" ["+linkedDossier.ref+"]":"")),description:"Document "+newDocForm.nature+" créé par "+localUser.name,createdBy:localUser.id,createdAt:now,sourceType:"DOCUMENT",sourceId:docId};
                if(typeof setCodifRegistry==="function") setCodifRegistry(prev=>[...prev,docCodifEntry]);
                const processUsers=users.filter(u=>_activeUser(u)&&(u.process===(newDocForm.process||localUser.process)||u.level>=4)&&u.id!==localUser.id);
                const targetIds=[...new Set([submitUser?.id,...processUsers.map(u=>u.id)].filter(Boolean))];
                setNotifications(prev=>[{id:"N"+Date.now(),icon:"📄",message:`📄 Document créé : "${newDoc.titre}" [Réf: ${docRef}]${linkedDossier?" — Dossier "+linkedDossier.ref:""}${submitUser?" → "+submitUser.name+" ["+newDocForm.submitAction+"]":""}`,at:now,read:false,module:"dossiers",targetUsers:targetIds.length?targetIds:undefined},...prev]);
                setNotifications(prev=>[{id:"N"+Date.now(),icon:"🏷️",message:`🏷️ Référence automatique : ${docRef} enregistrée dans le Manuel de Codification`,at:now,read:false,targetUsers:[localUser.id]},...prev]);
                if(submitUser) playSound("message"); else playSound("success");
                setShowNewDoc(false);
                setDossierSubTab("documents");
                setNewDocForm({titre:"",type:"DOC",process:localUser.process||"O02",description:"",nature:"INTERNE",linkedUserId:"",partnerId:"",dossierId:"",submitTo:"",submitAction:"CONSULTER",accessLevel:localUser.level,fileData:"",fileName:"",fileSize:0,fileExt:"",fileMime:""});
              }}>✅ Créer & Enregistrer</Btn>
              <Btn variant="ghost" onClick={()=>setShowNewDoc(false)}>Annuler</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════════════ VUE DOCUMENTS ═══════════════════ */}
      {dossierSubTab === "documents" && (
        <div>
          {/* Stats bar */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
            {[
              {label:"Documents totaux",val:allDocs.length,icon:"📄",color:"#3B82F6"},
              {label:"Internes Cabinet",val:allDocs.filter(d=>(d.nature||"INTERNE")==="INTERNE").length,icon:"🗂️",color:"#A855F7"},
              {label:"Externes / Clients",val:allDocs.filter(d=>(d.nature||"INTERNE")==="EXTERNE").length,icon:"📎",color:"#C41E3A"},
            ].map(s=>(
              <div key={s.label} style={{background:s.color+"11",border:`1px solid ${s.color}33`,borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:2}}>{s.icon}</div>
                <div style={{color:s.color,fontWeight:900,fontSize:18}}>{s.val}</div>
                <div style={{color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:0.5}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
           {/* Filters & Sort — Documents */}
           <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap",alignItems:"center"}}>
             <input value={docSearch} onChange={async e=>{setDocSearch(e.target.value);setSelectedDocs([]);}} placeholder="🔍 Titre, processus, partenaire, auteur…" style={{flex:"1 1 180px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:11}} />
             <select value={docFilter} onChange={async e=>{setDocFilter(e.target.value);setSelectedDocs([]);}} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
               <option value="ALL">Tous ({allDocs.length})</option>
               <option value="INTERNE">🗂️ Internes ({allDocs.filter(d=>(d.nature||"INTERNE")==="INTERNE").length})</option>
               <option value="EXTERNE">📎 Externes ({allDocs.filter(d=>(d.nature||"INTERNE")==="EXTERNE").length})</option>
             </select>
             <select value={docTypeFilter} onChange={async e=>{setDocTypeFilter(e.target.value);setSelectedDocs([]);}} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
               <option value="ALL">📄 Tous types</option>
               {[...new Set(allDocs.map(d=>d.type||"DOC").filter(Boolean))].sort().map(t=><option key={t} value={t}>{t}</option>)}
             </select>
             <select value={docProcessFilter} onChange={async e=>{setDocProcessFilter(e.target.value);setSelectedDocs([]);}} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
               <option value="ALL">🗂️ Tous processus</option>
               {[...new Set(allDocs.map(d=>d.process||"—").filter(p=>p&&p!=="—"))].sort().map(p=><option key={p} value={p}>{p}</option>)}
             </select>
             <select value={docSort} onChange={e=>setDocSort(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
               <option value="date_desc">↓ Plus récents</option>
               <option value="date_asc">↑ Plus anciens</option>
               <option value="titre_asc">A→Z Titre</option>
               <option value="titre_desc">Z→A Titre</option>
               <option value="size_desc">↓ Taille fichier</option>
             </select>
             <span style={{color:T.textDim,fontSize:10,whiteSpace:"nowrap"}}>{filteredDocs.length}/{allDocs.length}</span>
           </div>

          {/* Barre actions multi-sélection docs */}
          {selectedDocs.length > 0 && (
            <div style={{background:"#A855F711",border:"1px solid #A855F744",borderRadius:8,padding:"8px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{color:"#A855F7",fontWeight:700,fontSize:11}}>✔ {selectedDocs.length} document(s) sélectionné(s)</span>
              <button onClick={async ()=>{
                const docsToDelete = selectedDocs.filter(id=>{const doc=filteredDocs.find(d=>d.id===id);return doc&&((localUser?.isAdmin || localUser?.level >= 6)||localUser.level>=3||doc.createdBy===localUser.id);});
                if(!docsToDelete.length){gcAlert("Aucun document sélectionné n'est supprimable.");return;}
                if(await gcConfirm(`Supprimer ${docsToDelete.length} document(s) ?`)){
                  docsToDelete.forEach(id=>{const doc=filteredDocs.find(d=>d.id===id);if(doc)handleDocDelete(doc);});
                  setSelectedDocs([]);
                }
              }} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️ Supprimer</button>
              <button onClick={()=>setSelectedDocs([])} style={{background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:10,marginLeft:"auto"}}>✕</button>
            </div>
          )}

          {/* Documents list */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {filteredDocs.length > 0 && (
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",marginBottom:2}}>
                <input type="checkbox"
                  checked={filteredDocs.length>0&&filteredDocs.every(d=>selectedDocs.includes(d.id))}
                  onChange={async ()=>{const allIds=filteredDocs.map(d=>d.id);const allSel=allIds.every(id=>selectedDocs.includes(id));setSelectedDocs(allSel?[]:allIds);}}
                  style={{width:14,height:14,cursor:"pointer",accentColor:"#A855F7"}} />
                <span style={{color:T.textDim,fontSize:10,fontWeight:600}}>Tout sélectionner ({filteredDocs.length})</span>
              </div>
            )}
            {filteredDocs.map(doc=>{
              const isLocked = (doc.accessLevel||1) > localUser.level && !(localUser?.isAdmin || localUser?.level >= 6);
              // hasFile: vrai si le fichier est accessible localement OU sur le serveur
              const fileSrc = doc.fileData || doc.dataUrl;
              const hasFile = !!(fileSrc || doc.serverUrl || doc.serverId);
              const isStandalone = doc._src === "standalone";
              const isSubmittedToMe = doc.submitTo === localUser.id;
              const isArchived = (doc.status||"ACTIF") === "ARCHIVE";
              const canDel = ((localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 3 || doc.createdBy === localUser.id) && canManipulateDoc(doc);
              const srcColor = isStandalone ? "#3B82F6" : "#22C55E";
              const natColor = (doc.nature||"INTERNE") === "INTERNE" ? "#A855F7" : "#C41E3A";
              const isDocSel = selectedDocs.includes(doc.id);
              return (
                <div key={doc.id} style={{background:isDocSel?"#A855F712":isArchived?"#F59E0B08":isLocked?"#EF444408":T.surface2,border:`1px solid ${isDocSel?"#A855F766":isArchived?"#F59E0B44":isSubmittedToMe?"#F59E0B66":isLocked?"#EF444433":T.border}`,borderRadius:10,padding:"12px 16px",display:"flex",gap:10,alignItems:"center",opacity:isLocked?0.7:1,transition:"all 0.15s"}}>
                  <input type="checkbox" checked={isDocSel} onChange={()=>setSelectedDocs(prev=>isDocSel?prev.filter(id=>id!==doc.id):[...prev,doc.id])}
                    style={{width:15,height:15,cursor:"pointer",accentColor:"#A855F7",flexShrink:0}} />
                  <div style={{width:36,height:36,borderRadius:8,background:isArchived?"#F59E0B22":srcColor+"22",border:`1px solid ${isArchived?"#F59E0B44":srcColor+"44"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                    {isArchived ? "🗄️" : isStandalone ? "📄" : "📎"}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",marginBottom:3}}>
                      <span style={{color:isLocked?"#EF4444":isArchived?"#F59E0B":T.text,fontWeight:700,fontSize:13}}>{isLocked?"🔒 ":""}{doc.titre}</span>
                      {isArchived&&<Badge label="🗄️ Archivé" color="#F59E0B" small />}
                      <Badge label={(doc.nature||"INTERNE")==="INTERNE"?"🗂️ Interne":"📎 Externe"} color={natColor} small />
                      {doc.process&&<Badge label={doc.process} color={getProcColor(doc.process)} small />}
                      {doc.type&&<Badge label={doc.type} color="#6B7280" small />}
                      {isSubmittedToMe&&<Badge label="🔔 Pour vous" color="#F59E0B" small />}
                      {doc.submitAction&&doc.submitTo===localUser.id&&<Badge label={doc.submitAction} color="#F59E0B" small />}
                      {isLocked&&<Badge label={`🔒 Niv.${doc.accessLevel}+`} color="#EF4444" small />}
                      {!isStandalone&&doc.dossierRef&&<span onClick={async e=>{e.stopPropagation();const d=dossiers.find(x=>x.id===doc.dossierId||x.ref===doc.dossierRef);if(d){setSelectedDossier(d);setDossierSubTab("dossiers");}}} style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:99,padding:"1px 7px",fontSize:9,color:"#22C55E",fontWeight:700,cursor:"pointer"}} title={`Ouvrir le dossier ${doc.dossierRef}`}>📁 {doc.dossierRef}</span>}
                      {doc.partnerNom&&<span style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:99,padding:"1px 7px",fontSize:9,color:"#3B82F6",fontWeight:700}}>🤝 {doc.partnerNom}</span>}
                    </div>
                    {doc.description&&<div style={{color:T.textMuted,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.description}</div>}
                    <div style={{color:T.textDim,fontSize:10,marginTop:2}}>
                      Par {doc.createdByName||doc.uploadedByName||"—"} · {formatDate(doc.createdAt||doc.uploadedAt)}
                      {(doc.downloads||0)>0&&<span style={{marginLeft:8}}>⬇ {doc.downloads}</span>}
                      {hasFile&&<span style={{marginLeft:8,color:"#3B82F6"}}>📎 {doc.fileName||doc.name} {doc.fileExt?`(${doc.fileExt.replace(".","").toUpperCase()})`:"" }</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:130}}>
                    {/* 👁️ Ouvrir / Visionner */}
                    {hasFile&&!isLocked&&(
                      <button onClick={()=>openDocFile(doc)} title={`Ouvrir : ${doc.fileName||doc.name||doc.titre}`} style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:6,padding:"5px 8px",color:"#A855F7",cursor:"pointer",fontSize:12}}>👁️</button>
                    )}
                    {/* ⬇️ Télécharger */}
                    {hasFile&&!isLocked&&(
                      <button onClick={()=>handleDocDownload(doc)} title="Télécharger" style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:6,padding:"5px 8px",color:"#3B82F6",cursor:"pointer",fontSize:12}}>⬇️</button>
                    )}
                    {/* 🗄️ Archiver — seulement si pas déjà archivé */}
                    {!isArchived&&canManipulateDoc(doc)&&(
                      <button onClick={async () => {
                        if(!await gcConfirm(`Archiver "${doc.titre}" ?\nLe document restera visible ici avec le statut Archivé et sera enregistré dans la rubrique Archivage.`)) return;
                        const archEntry = {
                          id:"ARCH-DOC-"+Date.now(),
                          ref:`ARCH-DOC-${(doc.ref||doc.id).replace(/[^A-Z0-9-]/gi,"")}`,
                          dossier: doc.dossierRef||null,
                          client: doc.partnerNom||doc.titre,
                          objet: doc.titre,
                          archiveur: localUser.id,
                          archivedAt: new Date().toISOString(),
                          receivedBySec: true,
                          secNotes: "Archivage depuis Dossiers & Documents",
                          process: doc.process||localUser.process,
                          docType: doc.type||"DOC",
                          status: "ARCHIVE_CONFIRME",
                          notes: doc.description||"",
                          sourceDocId: doc.id,
                          fileName: doc.fileName||doc.name,
                          // FIX v86: ne pas stocker fileData dans gc-archives (trop lourd) — référencer par ID
                        };
                        try { const prev=JSON.parse(_lsGet("gc-archives")||"[]"); _lsSet("gc-archives", JSON.stringify([archEntry,...prev].slice(0,500))); dsSave("gc-archives", [archEntry,...prev].slice(0,500)).catch(err => gcToast.syncError('', err)); } catch(_) {}
                        // FIX v86: mark as archived but KEEP the document in the list (don't strip fileData)
                        if(isStandalone) saveStandaloneDocs(prev=>prev.map(x=>x.id===doc.id?{...x,status:"ARCHIVE",archivedAt:new Date().toISOString(),archivedBy:localUser.id}:x));
                        else saveDossierFiles(prev=>prev.map(x=>x.id===doc.id?{...x,status:"ARCHIVE",archivedAt:new Date().toISOString(),archivedBy:localUser.id}:x));
                        setNotifications(prev=>[{id:"N"+Date.now(),icon:"🗄️",message:`Document archivé : "${doc.titre}" — Ref: ${archEntry.ref}. Visible dans la rubrique Archivage.`,at:new Date().toISOString(),read:false,module:"archivage"},...prev]);
                        playSound("success");
                      }} title="Archiver ce document" style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:6,padding:"5px 8px",color:"#F59E0B",cursor:"pointer",fontSize:12}}>🗄️</button>
                    )}
                    {/* 🗑️ Supprimer */}
                    {canDel&&(
                      <button onClick={()=>handleDocDelete(doc)} title="Supprimer" style={{background:"#EF444415",border:"1px solid #EF444444",borderRadius:6,padding:"5px 8px",color:"#EF4444",cursor:"pointer",fontSize:12}}>🗑️</button>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredDocs.length===0&&(
              <div style={{textAlign:"center",padding:48,color:T.textMuted}}>
                <div style={{fontSize:36,marginBottom:8}}>📄</div>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Aucun document trouvé</div>
                <div style={{fontSize:11}}>Créez un document avec le bouton <strong>+ Document</strong> ou ajoutez des pièces jointes à vos dossiers</div>
              </div>
            )}
          </div>

          {/* Séparateur: Pièces jointes de dossiers */}
          {visibleDossierFiles.length>0&&docFilter==="ALL"&&!docSearch&&(
            <div style={{marginTop:14,padding:"8px 12px",background:T.surface2,borderRadius:8,border:`1px solid ${T.border}`}}>
              <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>📎 {visibleDossierFiles.length} pièce(s) jointe(s) aux dossiers incluses dans la liste ci-dessus</div>
            </div>
          )}
        </div>
      )} {/* END dossierSubTab === "documents" */}

      {/* Modaux partagés — showCollabModal, showUploadModal, showEditModal sont dans la section dossiers */}

      {/* FIX v152 — FileViewer modal (images + multi-fichiers) */}
      {showFileViewer && (
        <div onClick={()=>setShowFileViewer(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#1a1a2e",borderRadius:14,overflow:"hidden",maxWidth:"92vw",maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 40px #000a"}}>
            {/* Barre titre */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",background:"rgba(255,255,255,0.05)",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
              <span style={{color:"#fff",fontWeight:700,fontSize:13}}>{showFileViewer.files[showFileViewer.idx]?.name || "Document"}</span>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>handleDownloadFile(showFileViewer.files[showFileViewer.idx])}
                  style={{background:"#22C55E22",border:"1px solid #22C55E55",color:"#22C55E",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>⬇ Télécharger</button>
                <button onClick={()=>setShowFileViewer(null)}
                  style={{background:"#EF444422",border:"1px solid #EF444455",color:"#EF4444",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>✕ Fermer</button>
              </div>
            </div>
            {/* Contenu */}
            <div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",padding:16,minHeight:200,minWidth:320}}>
              {(() => {
                const f = showFileViewer.files[showFileViewer.idx];
                const mime = f?.mime || '';
                const src = f?.src || '';
                if (!src) return <span style={{color:"#aaa",fontSize:13}}>⚠️ Fichier non disponible localement. Cliquez "Télécharger".</span>;
                if (mime.startsWith('image/')) return <img src={src} alt={f.name} style={{maxWidth:"80vw",maxHeight:"72vh",borderRadius:8,objectFit:"contain"}} />;
                if (mime==="application/pdf") return (
                  <iframe src={src} title={f.name} style={{width:"78vw",height:"72vh",border:"none",borderRadius:8,background:"#fff"}} />
                );
                return <div style={{color:"#aaa",textAlign:"center",padding:24}}>
                  <div style={{fontSize:40,marginBottom:10}}>📄</div>
                  <div style={{fontSize:13,marginBottom:8}}>{f.name}</div>
                  <div style={{fontSize:11,color:"#666"}}>Aperçu non disponible — cliquez "Télécharger" pour y accéder.</div>
                </div>;
              })()}
            </div>
            {/* Pagination si multi-fichiers */}
            {showFileViewer.files.length > 1 && (
              <div style={{display:"flex",justifyContent:"center",gap:8,padding:"8px 16px",borderTop:"1px solid rgba(255,255,255,0.1)"}}>
                {showFileViewer.files.map((f,i)=>(
                  <button key={i} onClick={()=>setShowFileViewer(p=>({...p,idx:i}))}
                    style={{background:i===showFileViewer.idx?"#C41E3A":"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:11,fontWeight:i===showFileViewer.idx?700:400}}>
                    {i+1} · {(f.name||"").slice(0,18)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}); // React.memo — DossiersList



/* ══════════════════════════════════════════════════════════════════
   MODULES v99 — Organisation, Facturation, Conventions, Rapports
   ══════════════════════════════════════════════════════════════════ */

/* ── Organisation & Gouvernance ── */


export function CircuitsPanel({ T, localUser, canEdit=false, setNotifications=_noop, users=[] }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const [circuits, setCircuits] = React.useState(() => {
    try {
      const saved = JSON.parse(_lsGet("gc-circuits")||"null");
      if (!saved) return GC_CIRCUITS_INIT;
      // v114 — Merge new circuits from GC_CIRCUITS_INIT if missing from saved (e.g. CIRC-CONN, CIRC-SUSP)
      const savedIds = new Set(saved.map(c => c.id));
      const missing = GC_CIRCUITS_INIT.filter(c => !savedIds.has(c.id));
      return missing.length > 0 ? [...saved, ...missing] : saved;
    } catch { return GC_CIRCUITS_INIT; }
  });
  const saveCircuits = (data) => { setCircuits(data); try { _lsSet("gc-circuits",JSON.stringify(data)); dsSave("gc-circuits",data).catch(err => gcToast.syncError('', err)); } catch(_){} };
  const [activeCircuit, setActiveCircuit] = React.useState(null);
  const [editForm, setEditForm] = React.useState(null);
  const [filterCat, setFilterCat] = React.useState("ALL");
  const CATS = ["ALL","APPROBATION","TRAITEMENT","FACTURATION","ARCHIVAGE","SECURITE"];
  const CATS_CFG = {APPROBATION:{c:"#3B82F6",i:"✅"},TRAITEMENT:{c:"#22C55E",i:"⚙️"},FACTURATION:{c:"#C9A84C",i:"💰"},ARCHIVAGE:{c:"#64748B",i:"🗄️"},SECURITE:{c:"#EF4444",i:"🔐"}};
  const filtered = circuits.filter(c=>filterCat==="ALL"||c.categorie===filterCat);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:14}}>🔄 Circuits & Sous-Processus</div>
          <div style={{color:T.textMuted,fontSize:11}}>Circuits d'approbation et de traitement du cabinet — {circuits.length} circuits définis</div>
        </div>
        {canEdit&&<Btn variant="primary" size="sm" onClick={()=>setEditForm({id:"CIRC-"+Date.now(),code:"",categorie:"TRAITEMENT",titre:"",description:"",processus:"O01",etapes:[],couleur:"#3B82F6",editable:true,isNew:true})}>+ Nouveau circuit</Btn>}
      </div>
      {/* Filtre catégories */}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {CATS.map(c=>{const cfg=CATS_CFG[c]||{c:"#6B7280",i:"📋"};return(
          <button key={c} onClick={()=>setFilterCat(c)}
            style={{background:filterCat===c?(cfg.c||"#0A1E4A"):"transparent",border:`1px solid ${filterCat===c?(cfg.c||"#0A1E4A"):T.border}`,color:filterCat===c?"#fff":T.textMuted,borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:filterCat===c?700:400}}>
            {c==="ALL"?"Tous":cfg.i+" "+c}
          </button>
        );})}
      </div>
      {/* Liste circuits */}
      {filtered.map(circ=>{
        const cfg=CATS_CFG[circ.categorie]||{c:"#6B7280",i:"📋"};
        const isOpen=activeCircuit===circ.id;
        return(
          <div key={circ.id} style={{background:T.surface,border:`1px solid ${isOpen?circ.couleur+"66":T.border}`,borderRadius:10,marginBottom:8,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",cursor:"pointer",background:isOpen?circ.couleur+"11":"transparent"}} onClick={()=>setActiveCircuit(isOpen?null:circ.id)}>
              <div style={{width:36,height:36,borderRadius:8,background:circ.couleur+"22",border:`2px solid ${circ.couleur}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{cfg.i}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:T.text,fontWeight:800,fontSize:12}}>{circ.titre}</div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:1}}>{circ.code} · {circ.processus} · {circ.etapes.length} étape(s)</div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{background:cfg.c+"22",color:cfg.c,border:`1px solid ${cfg.c}44`,borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700}}>{circ.categorie}</span>
                {canEdit&&circ.editable&&<button onClick={async e=>{e.stopPropagation();setEditForm({...circ});}} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:9,color:T.textMuted}}>✏️</button>}
                <span style={{color:T.textMuted,fontSize:14}}>{isOpen?"▲":"▼"}</span>
              </div>
            </div>
            {isOpen&&(
              <div style={{padding:"0 14px 14px"}}>
                <p style={{color:T.textMuted,fontSize:11,marginBottom:12,lineHeight:1.6}}>{circ.description}</p>
                <div style={{position:"relative",paddingLeft:20}}>
                  <div style={{position:"absolute",left:10,top:0,bottom:0,width:2,background:circ.couleur+"33",borderRadius:2}}/>
                  {circ.etapes.map((et,i)=>(
                    <div key={et.n} style={{display:"flex",gap:10,marginBottom:10,position:"relative"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:circ.couleur,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,flexShrink:0,position:"relative",zIndex:1,border:"2px solid "+T.surface}}>{et.n}</div>
                      <div style={{flex:1,background:T.surface2,borderRadius:8,padding:"8px 12px",border:`1px solid ${T.border}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}>
                          <div style={{color:circ.couleur,fontWeight:700,fontSize:10,textTransform:"uppercase"}}>{et.acteur}</div>
                          <div style={{display:"flex",gap:4}}>
                            <span style={{color:T.textDim,fontSize:9,background:T.surface,borderRadius:4,padding:"1px 5px"}}>⏱ {et.delai}</span>
                            <span style={{background:circ.couleur+"22",color:circ.couleur,borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{et.statut}</span>
                          </div>
                        </div>
                        <div style={{color:T.text,fontSize:11,lineHeight:1.5}}>{et.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* v114 — Règles & contraintes du circuit (champ optionnel) */}
                {circ.regles && circ.regles.length > 0 && (
                  <div style={{marginTop:12,background:"#F59E0B08",border:"1px solid #F59E0B22",borderRadius:8,padding:"10px 14px"}}>
                    <div style={{color:"#F59E0B",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>⚠️ Règles & Contraintes</div>
                    {circ.regles.map((r,i)=>(
                      <div key={i} style={{color:T.textMuted,fontSize:10.5,marginBottom:5,display:"flex",gap:8,alignItems:"flex-start",lineHeight:1.5}}>
                        <span style={{color:"#F59E0B",flexShrink:0,marginTop:1,fontWeight:700}}>•</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {/* Modal édition circuit */}
      {editForm&&canEdit&&(
        <Modal title={editForm.isNew?"Nouveau circuit":"Modifier le circuit"} onClose={()=>setEditForm(null)} wide T={T}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Code","code","text"],["Titre","titre","text"],["Processus","processus","text"]].map(([l,k,t])=>(
              <div key={k} style={k==="titre"?{gridColumn:"span 2"}:{}}>
                <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>{l}</label>
                <input type={t} value={editForm[k]} onChange={e=>setEditForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>
              </div>
            ))}
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Catégorie</label>
              <select value={editForm.categorie} onChange={e=>setEditForm(f=>({...f,categorie:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                {["APPROBATION","TRAITEMENT","FACTURATION","ARCHIVAGE","SECURITE"].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Couleur</label>
              <input type="color" value={editForm.couleur||"#3B82F6"} onChange={e=>setEditForm(f=>({...f,couleur:e.target.value}))} style={{width:"100%",height:36,borderRadius:7,border:`1px solid ${T.border}`,cursor:"pointer"}}/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Description</label>
              <textarea value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} rows={3} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box",resize:"vertical"}}/>
            </div>
          </div>
          <div style={{marginTop:12,background:T.surface2,borderRadius:8,padding:"10px 12px"}}>
            <div style={{color:T.textMuted,fontSize:10,fontWeight:700,marginBottom:6}}>Étapes ({editForm.etapes?.length||0})</div>
            {(editForm.etapes||[]).map((et,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:5}}>
                <span style={{color:T.textDim,fontSize:10,width:16}}>{et.n}.</span>
                <input value={et.acteur} onChange={async e=>{const es=[...editForm.etapes];es[i]={...es[i],acteur:e.target.value};setEditForm(f=>({...f,etapes:es}));}} placeholder="Acteur" style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 7px",color:T.text,fontSize:10}}/>
                <input value={et.action} onChange={async e=>{const es=[...editForm.etapes];es[i]={...es[i],action:e.target.value};setEditForm(f=>({...f,etapes:es}));}} placeholder="Action" style={{flex:2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 7px",color:T.text,fontSize:10}}/>
                <input value={et.delai} onChange={async e=>{const es=[...editForm.etapes];es[i]={...es[i],delai:e.target.value};setEditForm(f=>({...f,etapes:es}));}} placeholder="Délai" style={{width:60,background:T.surface,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 7px",color:T.text,fontSize:10}}/>
                <button onClick={async ()=>{const es=editForm.etapes.filter((_,j)=>j!==i).map((e,j)=>({...e,n:j+1}));setEditForm(f=>({...f,etapes:es}));}} style={{background:"#EF444422",border:"none",borderRadius:4,padding:"3px 6px",cursor:"pointer",fontSize:10,color:"#EF4444"}}>🗑</button>
              </div>
            ))}
            <button onClick={async ()=>{const n=(editForm.etapes||[]).length+1;setEditForm(f=>({...f,etapes:[...(f.etapes||[]),{n,acteur:"",action:"",delai:"J+"+n,statut:"ETAPE_"+n}]}));}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:10,color:T.textMuted,marginTop:4}}>+ Ajouter une étape</button>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
            <Btn variant="ghost" size="sm" onClick={()=>setEditForm(null)}>Annuler</Btn>
            {!editForm.isNew&&<Btn variant="danger" size="sm" onClick={async () => {if(await gcConfirm("Supprimer ce circuit ?"))saveCircuits(circuits.filter(c=>c.id!==editForm.id));setEditForm(null);}}>Supprimer</Btn>}
            <Btn variant="primary" size="sm" onClick={async ()=>{
              const {isNew,...circ}=editForm;
              if(isNew) saveCircuits([circ,...circuits]);
              else saveCircuits(circuits.map(c=>c.id===circ.id?circ:c));
              setEditForm(null);
            }}>💾 Enregistrer</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}



export function DocChecklist({ T, docs=[], requiredDocs=[], uploadedDocs=[], onUpload, canValidate=false, onValidateDoc, title="" }) {
  const fileRef = React.useRef(null);
  const [pendingDocId, setPendingDocId] = React.useState(null);

  const getDocStatus = (docId) => {
    const found = uploadedDocs.find(d => d.checklistId === docId);
    if (!found) return "MANQUANT";
    if (found.validated) return "VALIDE";
    if (found.rejected) return "REJETE";
    return "FOURNI";
  };

  const STATUS_CFG = {
    MANQUANT: { c:"#EF4444", icon:"❌", l:"Manquant" },
    FOURNI:   { c:"#F59E0B", icon:"⏳", l:"Fourni — en attente" },
    VALIDE:   { c:"#22C55E", icon:"✅", l:"Validé" },
    REJETE:   { c:"#C41E3A", icon:"⛔", l:"Rejeté" }};

  const total = requiredDocs.filter(d=>d.required).length;
  const valides = requiredDocs.filter(d=>d.required && getDocStatus(d.id)==="VALIDE").length;
  const fournis = requiredDocs.filter(d=>d.required && ["FOURNI","VALIDE"].includes(getDocStatus(d.id))).length;

  return (
    <div style={{marginBottom:8}}>
      {title && <div style={{color:"#3B82F6",fontWeight:800,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{title}</div>}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <div style={{flex:1,background:T.surface2,borderRadius:4,height:6}}>
          <div style={{height:"100%",borderRadius:4,background:valides===total?"#22C55E":"#F59E0B",width:`${total>0?Math.round((fournis/total)*100):0}%`,transition:"width 0.4s"}} />
        </div>
        <span style={{color:valides===total?"#22C55E":"#F59E0B",fontWeight:700,fontSize:9}}>{fournis}/{total} req.</span>
      </div>
      {requiredDocs.map(doc => {
        const st = STATUS_CFG[getDocStatus(doc.id)];
        const found = uploadedDocs.find(d=>d.checklistId===doc.id);
        return (
          <div key={doc.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",background:T.surface,borderRadius:6,marginBottom:4,border:`1px solid ${st.c}22`}}>
            <span style={{fontSize:12}}>{st.icon}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:T.text,fontSize:10,fontWeight:600}}>{doc.label}</div>
              {found && <div style={{color:T.textDim,fontSize:9}}>{found.name} · {found.size}</div>}
            </div>
            {doc.required && <span style={{color:"#EF4444",fontSize:8}}>*requis</span>}
            <span style={{background:st.c+"22",color:st.c,borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700,flexShrink:0}}>{st.l}</span>
            {onUpload && getDocStatus(doc.id)==="MANQUANT" && (
              <button onClick={async ()=>{setPendingDocId(doc.id);setTimeout(()=>fileRef.current?.click(),50);}}
                style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9,fontWeight:700,flexShrink:0}}>
                📤
              </button>
            )}
            {canValidate && found && !found.validated && !found.rejected && (
              <div style={{display:"flex",gap:3,flexShrink:0}}>
                <button onClick={()=>onValidateDoc&&onValidateDoc(found.id,true)} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9}}>✅</button>
                <button onClick={()=>onValidateDoc&&onValidateDoc(found.id,false)} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9}}>❌</button>
              </div>
            )}
          </div>
        );
      })}
      <input ref={fileRef} type="file" style={{display:"none"}} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        onChange={async e=>{if(e.target.files[0]&&pendingDocId&&onUpload){onUpload(e.target.files[0],pendingDocId);e.target.value="";}}} />
    </div>
  );
}


export function SignaturePINModal({ T, currentUser, onSign, onClose, docLabel }) {
  const [pin, setPin] = React.useState("");
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSign = () => {
    if (!pin || pin.length < 4) { setErr("PIN requis (minimum 4 caractères)."); return; }
    // Vérification du PIN contre le password hashé de l'utilisateur
    const stored = currentUser?.passwordHash || currentUser?.password || "";
    // Comparaison simple (le vrai hash est géré par le système d'auth principal)
    const pinOk = stored ? (pin === stored || pin === currentUser?.pin) : pin.length >= 4;
    if (!pinOk) { setErr("PIN incorrect. Vérifiez votre code d'accès."); return; }
    setLoading(true);
    setTimeout(() => {
      const sig = {
        signedBy: currentUser.id,
        signedByName: currentUser.name,
        signedAt: new Date().toISOString(),
        sigDisplay: `Signé par ${currentUser.name} le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`};
      onSign(sig);
      setLoading(false);
    }, 600);
  };

  return (
    <Modal title="✍️ Signature Numérique" onClose={onClose} T={T}>
      <div style={{padding:"4px 0"}}>
        <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:11,color:"#3B82F6"}}>
          📄 Document : <strong>{docLabel}</strong>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:5}}>Votre PIN / Mot de passe de session</label>
          <input type="password" value={pin} onChange={async e=>{setPin(e.target.value);setErr("");}}
            placeholder="••••••••" autoFocus
            style={{width:"100%",background:T.surface2,border:`1px solid ${err?"#EF4444":T.border}`,borderRadius:8,padding:"10px 12px",color:T.text,fontSize:14,boxSizing:"border-box"}}
            onKeyDown={e=>e.key==="Enter"&&handleSign()} />
          {err && <div style={{color:"#EF4444",fontSize:11,marginTop:4}}>⚠️ {err}</div>}
        </div>
        <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:11,color:T.textMuted}}>
          <div style={{fontWeight:700,color:T.text,marginBottom:4}}>Aperçu de la signature :</div>
          <div style={{fontStyle:"italic",color:"#3B82F6"}}>
            Signé par <strong>{currentUser.name}</strong> le {new Date().toLocaleDateString("fr-FR")} à {new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
          </div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" size="sm" onClick={handleSign} disabled={loading}>
            {loading ? "⏳ Signature..." : "✍️ Signer"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}


/* ── Workflow Client O01 — Intake & Checklist ── */


export function IntakeClientO01({ T, currentUser, users=[], partners=[], setPartnersSync=_noop, dossiers=[], setDossiers=_noop, taches=[], setTaches=_noop, setNotifications=_noop, onClose, addSessionLog }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const isO01 = (currentUser?.process==="O01"||(currentUser?.processes||[]).includes("O01")) || currentUser?.level>=4;

  // ── FIX: _uploadFiles défini localement dans IntakeClientO01 ──────────────────
  // Évite "ReferenceError: _uploadFiles is not defined" (était en dehors de ce scope)
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'docs',
          nom: file.name, taille: file.size, type: file.type,
          uploadedBy: currentUser?.id || 'SYSTEM',
          uploadedByName: currentUser?.name || 'Système',
          ...extraMeta,
        });
        results.push({
          ...ref, name: file.name, size: file.size, mimeType: file.type,
          sizeStr: file.size < 1048576 ? `${Math.round(file.size/1024)} Ko` : `${(file.size/1048576).toFixed(1)} Mo`,
          ext: '.' + file.name.split('.').pop().toLowerCase(),
          uploadedAt: new Date().toISOString(), downloads: 0,
        });
      } catch(e) { console.error('[upload intake]', file.name, e.message); }
    }
    return results;
  };
  const [step, setStep] = React.useState(1); // 1=client 2=activité+docs 3=transfert
  const [clientForm, setClientForm] = React.useState({
    nom:"", type:"personne_physique", tel:"", email:"", adresse:"",
    secteur:"", rccm:"", nif:"", sourceAcquisition:"Cabinet",
    segment:"PME", riskLevel:"FAIBLE", notes:"",
    partnerId: null, // rempli si le client existe déjà
  });
  const [activiteForm, setActiviteForm] = React.useState({
    processus:"O02", typeActivite:"", objet:"", amount:"",
    priority:"NORMALE", dueDate:"", notes:""});
  // Documents téléversés lors de l'intake
  const [intakeDocs, setIntakeDocs] = React.useState([]);
  const [transferForm, setTransferForm] = React.useState({ responsableId:"", motif:"" });
  const [saving, setSaving] = React.useState(false);
  const [existingClientSearch, setExistingClientSearch] = React.useState("");

  const today = new Date().toISOString().split("T")[0];

  // Docs requis selon activité choisie
  const kycDocs = [
    ...GC_DOCS_REQUIS.KYC_COMMUN,
    ...(clientForm.type==="personne_morale" ? GC_DOCS_REQUIS.KYC_PERSONNE_MORALE : []),
  ];
  const dossierDocs = activiteForm.typeActivite ? (GC_DOCS_REQUIS[activiteForm.typeActivite]||[]) : [];
  const allRequiredDocs = [...kycDocs, ...dossierDocs];

  const handleUploadDoc = async (file, checklistId) => {
    const cat = kycDocs.find(d=>d.id===checklistId) ? "KYC" : "DOSSIER";
    const [ref] = await _uploadFiles([file], { module: 'docs' }); // dossierId sera lié après création du dossier
    const newDoc = {
        ...ref,
        id: ref?.id || "IDOC-"+Date.now()+Math.random().toString(36).slice(2,4),
        checklistId, cat,
        name: file.name,
        size: (file.size/1024).toFixed(0)+"Ko",
        mimeType: file.type,
        url: ref?.dataUrl || ref?.path || null,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser.name,
        validated: false, rejected: false};
      setIntakeDocs(prev=>[...prev, newDoc]);
  };

  const handleUploadFree = async (e, cat) => {
    const files = Array.from(e.target.files||[]);
    const refs = await _uploadFiles(files, { cat });
    refs.forEach(ref => {
      setIntakeDocs(prev=>[...prev, {
          ...ref,
          id: ref.id,
          checklistId:null, cat,
          name: ref.nom, size: ref.sizeStr || (ref.taille/1024).toFixed(0)+"Ko",
          mimeType: ref.type, url: ref.dataUrl || ref.path,
          uploadedAt: new Date().toISOString(), uploadedBy: currentUser.name,
          validated: false, rejected: false}]);
    });
    e.target.value="";
  };

  const kycComplet = kycDocs.filter(d=>d.required).every(d=>intakeDocs.some(u=>u.checklistId===d.id));
  const dossierComplet = dossierDocs.filter(d=>d.required).every(d=>intakeDocs.some(u=>u.checklistId===d.id));

  const handleStepChange = (newStep) => {
    try {
      if (newStep < 1 || newStep > 3) return;
      setStep(newStep);
    } catch (error) {
      console.error("Erreur lors du changement d'étape:", error);
      gcAlert("Erreur lors de la navigation. Veuillez réessayer.");
    }
  };

  const handleClientValidation = () => {
    try {
      if (!clientForm.nom.trim()) {
        gcAlert("Le nom du client est requis.");
        return;
      }
      handleStepChange(2);
    } catch (error) {
      console.error("Erreur lors de la validation client:", error);
      gcAlert("Erreur lors de la validation. Veuillez réessayer.");
    }
  };

  const handleActivityValidation = () => {
    try {
      if (!activiteForm.typeActivite) {
        gcAlert("Sélectionnez un type d'activité.");
        return;
      }
      if (!activiteForm.objet.trim()) {
        gcAlert("L'objet de la demande est requis.");
        return;
      }
      handleStepChange(3);
    } catch (error) {
      console.error("Erreur lors de la validation activité:", error);
      gcAlert("Erreur lors de la validation. Veuillez réessayer.");
    }
  };

  const handleFinalize = () => {
    try {
      if (!clientForm.nom.trim()) { gcAlert("Le nom du client est requis."); return; }
      if (!activiteForm.typeActivite) { gcAlert("Sélectionnez un type d'activité."); return; }
      if (!activiteForm.objet.trim()) { gcAlert("L'objet de la demande est requis."); return; }
      setSaving(true);
      const now = new Date().toISOString();

    // 1. Créer ou lier le partenaire/client
    let partnerId = clientForm.partnerId;
    if (!partnerId) {
      partnerId = "PART-"+Date.now();
      const newPartner = {
        id: partnerId,
        nom: clientForm.nom,
        type: "client",
        tel: clientForm.tel, email: clientForm.email,
        adresse: clientForm.adresse, secteur: clientForm.secteur,
        rccm: clientForm.rccm, nif: clientForm.nif,
        sourceAcquisition: clientForm.sourceAcquisition,
        segment: clientForm.segment, riskLevel: clientForm.riskLevel,
        notes: clientForm.notes,
        statut: "PROSPECT",
        kycStatut: "EN_ATTENTE",
        kycDocs: intakeDocs.filter(d=>d.cat==="KYC"),
        personneType: clientForm.type,
        createdAt: now, createdBy: currentUser.id,
        dossiersIds: [],
        intakeComplet: true, intakeDate: now, intakePar: currentUser.name};
      setPartnersSync(prev=>[newPartner,...prev]);
    } else {
      // Mettre à jour le partner existant
      setPartnersSync(prev=>prev.map(p=>p.id===partnerId?{...p,
        kycDocs:[...(p.kycDocs||[]),...intakeDocs.filter(d=>d.cat==="KYC")],
        intakeUpdatedAt:now, intakeUpdatedPar:currentUser.name}:p));
    }

    // 2. Créer le dossier
    const num = String(dossiers.length+1).padStart(2,"0");
    const dossierRef = `DOS-A${num}-${activiteForm.processus}.${num}/${new Date().getFullYear()}`;

    // Responsable destinataire
    const resp = transferForm.responsableId
      ? users.find(u=>u.id===transferForm.responsableId)
      : users.find(u=>(u.process===activiteForm.processus||(u.processes||[]).includes(activiteForm.processus))&&u.level>=3&&u.id!==currentUser.id);

    const newDossier = {
      id: dossierRef, ref: dossierRef, type:"DOS", nature:"EXTERNE",
      client: clientForm.nom,
      objet: activiteForm.objet,
      process: activiteForm.processus,
      typeActivite: activiteForm.typeActivite,
      status: "ATTENTE_TRAITEMENT",
      priority: activiteForm.priority,
      amount: parseInt(activiteForm.amount)||0,
      assignedTo: resp?.id||currentUser.id,
      createdBy: currentUser.id,
      createdAt: today,
      dueDate: activiteForm.dueDate||gcCalcDueDate(activiteForm.processus, activiteForm.priority),
      progress: 0,
      notes: activiteForm.notes||"",
      tags: [activiteForm.typeActivite||activiteForm.processus],
      partnerId, partnerNom: clientForm.nom,
      submittedTo: resp?.id||null, submittedToName: resp?.name||null,
      submitAction:"TRAITER",
      collaborators:[], externalCollaborators:[],
      qrCode: dossierRef,
      // Docs d'intake rattachés au dossier
      intakeDocs: intakeDocs,
      kycStatutDossier:"EN_ATTENTE",
      intakePar: currentUser.name, intakeDate: now,
    };
    setDossiers(prev => {
      const updated = [...prev, newDossier];
      // Sauvegarder en base de données pour synchronisation
      dsSave("dossiers", updated, currentUser.id);
      return updated;
    });

    // 3. Mettre à jour le partner avec le dossierRef
    setPartnersSync(prev=>prev.map(p=>p.id===partnerId?{...p,dossiersIds:[...(p.dossiersIds||[]),dossierRef]}:p));

    // 4. Tâche KYC pour O01 niv3+
    const o01Validateur = users.find(u=>(u.process==="O01"||(u.processes||[]).includes("O01"))&&u.level>=3);
    if (o01Validateur) {
      const kycTache = {
        id:"TACHE-KYC-"+Date.now(), type:"VALIDATION_KYC",
        titre:`KYC à valider — ${clientForm.nom} (${dossierRef})`,
        dossier: dossierRef, dossierId: dossierRef,
        assignedTo: o01Validateur.id, createdBy: currentUser.id,
        deadline: today, priority:"HAUTE", status:"ATTENTE_TRAITEMENT",
        process:"O01", notes:`Intake créé par ${currentUser.name}. ${intakeDocs.filter(d=>d.cat==="KYC").length} doc(s) KYC fournis sur ${kycDocs.filter(d=>d.required).length} requis.`,
        createdAt: now};
      setTaches(prev=>[kycTache,...prev]);
    }

    // 5. Notifications
    const notifMsg = `📋 Intake client : ${clientForm.nom} — Dossier ${dossierRef} (${activiteForm.typeActivite}) — KYC à valider`;
    setNotifications(prev=>[{id:"N"+Date.now(),icon:"📋",message:notifMsg,at:now,read:false,module:"dossiers"},...prev]);
    if (resp && resp.id !== currentUser.id) {
      gcPushNotif(resp.id, {id:"N"+Date.now()+resp.id, icon:"📁", message:`Nouveau dossier client à traiter : ${dossierRef} — ${clientForm.nom} · ${activiteForm.objet}`, at:now, read:false, module:"dossiers"});
    }
    if (o01Validateur && o01Validateur.id !== currentUser.id) {
      gcPushNotif(o01Validateur.id, {id:"N"+Date.now()+o01Validateur.id, icon:"🔍", message:`KYC à valider pour ${clientForm.nom} (${dossierRef}) — ${intakeDocs.filter(d=>d.cat==="KYC").length} doc(s) fournis`, at:now, read:false, module:"dossiers", urgent:true});
    }

    addSessionLog&&addSessionLog("CREATION", currentUser, {status:"SUCCESS", reason:`Intake client ${clientForm.nom} — ${dossierRef}`});
    playSound("success");
    setSaving(false);
    gcAlert(`✅ Intake client finalisé !\n\n• Client : ${clientForm.nom}\n• Dossier : ${dossierRef}\n• ${intakeDocs.length} document(s) enregistrés\n• KYC soumis à : ${o01Validateur?.name||"O01"}\n• Dossier assigné à : ${resp?.name||"(auto)"}\n\nSuivi disponible dans : Dossiers & Documents → ${dossierRef}`);
    onClose&&onClose();
    } catch (error) {
      console.error("Erreur lors de la finalisation de l'intake:", error);
      setSaving(false);
      gcAlert("Erreur lors de la finalisation. Veuillez réessayer ou contacter le support.");
    }
  };

  const activiteOptions = [
    ...GC_ACTIVITES.O02.map(a=>({...a,proc:"O02"})),
    ...GC_ACTIVITES.O03.map(a=>({...a,proc:"O03"})),
  ];

  const selectedActivite = activiteOptions.find(a=>a.k===activiteForm.typeActivite);

  return (
    <Modal title="📋 Accueil Client — Formulaire d'Intake O01" onClose={onClose} wide T={T}>
      {/* Steps */}
      <div style={{display:"flex",gap:0,marginBottom:16}}>
        {[{n:1,l:"Identification client"},{n:2,l:"Activité & Documents"},{n:3,l:"Transfert"}].map((s,i)=>(
          <div key={s.n} style={{flex:1,display:"flex",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",flex:1}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:step>=s.n?"#C41E3A":T.surface2,border:`2px solid ${step>=s.n?"#C41E3A":T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:step>=s.n?"#fff":T.textMuted,fontWeight:700,flexShrink:0}}>{s.n}</div>
              <div style={{marginLeft:6,color:step===s.n?T.text:T.textMuted,fontSize:10,fontWeight:step===s.n?700:400}}>{s.l}</div>
            </div>
            {i<2&&<div style={{width:20,height:1,background:step>s.n?"#C41E3A":T.border,flexShrink:0,margin:"0 4px"}} />}
          </div>
        ))}
      </div>

      {/* ─ STEP 1 : Identification client ─ */}
      {step===1 && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#3B82F6"}}>
            🔍 Rechercher si le client existe déjà dans le CRM avant d'en créer un nouveau.
          </div>
          <div>
            <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4}}>Rechercher client existant</label>
            <input value={existingClientSearch} onChange={e=>setExistingClientSearch(e.target.value)}
              placeholder="Nom, RCCM, NIF..." style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
            {existingClientSearch.length>2 && (
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:7,marginTop:4,maxHeight:100,overflowY:"auto"}}>
                {partners.filter(p=>p.type==="client"&&(p.nom||"").toLowerCase().includes(existingClientSearch.toLowerCase())).slice(0,5).map(p=>(
                  <div key={p.id} onClick={async ()=>{setClientForm(f=>({...f,nom:p.nom,tel:p.tel||"",email:p.email||"",adresse:p.adresse||"",rccm:p.rccm||"",nif:p.nif||"",partnerId:p.id}));setExistingClientSearch("");}}
                    style={{padding:"6px 10px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,fontSize:11,color:T.text}}>
                    🤝 {p.nom} — {p.kycStatut} {p.rccm?`· RCCM: ${p.rccm}`:""}
                  </div>
                ))}
              </div>
            )}
            {clientForm.partnerId && <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:6,padding:"5px 10px",fontSize:10,color:"#22C55E",marginTop:4}}>✅ Client existant sélectionné — ses infos ont été pré-remplies.</div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Type de client</label>
              <div style={{display:"flex",gap:6}}>
                {[["personne_physique","👤 Personne physique"],["personne_morale","🏢 Personne morale"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setClientForm(f=>({...f,type:k}))}
                    style={{flex:1,background:clientForm.type===k?"#0A1E4A":"transparent",border:`1px solid ${clientForm.type===k?"#0A1E4A":T.border}`,borderRadius:7,padding:"7px",cursor:"pointer",color:clientForm.type===k?"#fff":T.textMuted,fontWeight:clientForm.type===k?700:400,fontSize:11}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {[["Nom complet *","nom","text"],["Téléphone *","tel","tel"],["Email","email","email"],["Adresse","adresse","text"],["Secteur d'activité","secteur","text"]].map(([l,k,t])=>(
              <div key={k} style={["nom","adresse"].includes(k)?{gridColumn:"span 2"}:{}}>
                <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>{l}</label>
                <input type={t} value={clientForm[k]} onChange={e=>setClientForm(f=>({...f,[k]:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
              </div>
            ))}
            {clientForm.type==="personne_morale" && (
              <>
                <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>RCCM</label>
                <input value={clientForm.rccm} onChange={e=>setClientForm(f=>({...f,rccm:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
                <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>NIF</label>
                <input value={clientForm.nif} onChange={e=>setClientForm(f=>({...f,nif:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
              </>
            )}
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Source d'acquisition</label>
              <select value={clientForm.sourceAcquisition} onChange={e=>setClientForm(f=>({...f,sourceAcquisition:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                {["Cabinet","Réseau","Référence","Site web","Partenaire","Autre"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Niveau de risque KYC</label>
              <select value={clientForm.riskLevel} onChange={e=>setClientForm(f=>({...f,riskLevel:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                {[["FAIBLE","🟢 Faible"],["MOYEN","🟡 Moyen"],["ÉLEVÉ","🟠 Élevé"],["CRITIQUE","🔴 Critique"]].map(([k,l])=><option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:6}}>
            <Btn variant="ghost" size="sm" onClick={onClose}>Annuler</Btn>
            <Btn variant="primary" size="sm" onClick={handleClientValidation}>Suivant →</Btn>
          </div>
        </div>
      )}

      {/* ─ STEP 2 : Activité souhaitée & Documents ─ */}
      {step===2 && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#C9A84C"}}>
            🗂️ Sélectionnez l'activité demandée, puis téléversez les documents requis.
          </div>
          <div>
            <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:6,fontWeight:700,textTransform:"uppercase"}}>Activité souhaitée *</label>
            <div style={{display:"flex",gap:4,marginBottom:6}}>
              {["O02","O03"].map(p=>(
                <button key={p} onClick={()=>setActiviteForm(f=>({...f,processus:p,typeActivite:""}))}
                  style={{flex:1,background:activiteForm.processus===p?"#0A1E4A":"transparent",border:`1px solid ${activiteForm.processus===p?"#0A1E4A":T.border}`,borderRadius:7,padding:"7px",cursor:"pointer",color:activiteForm.processus===p?"#fff":T.textMuted,fontWeight:activiteForm.processus===p?700:400,fontSize:11}}>
                  {p==="O02"?"⚖️ O02 — Juridique & Conseil":"📊 O03 — Gestion & Évaluation"}
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {GC_ACTIVITES[activiteForm.processus]?.map(a=>(
                <button key={a.k} onClick={()=>setActiviteForm(f=>({...f,typeActivite:a.k}))}
                  style={{background:activiteForm.typeActivite===a.k?"#C41E3A22":"transparent",border:`1px solid ${activiteForm.typeActivite===a.k?"#C41E3A":"${T.border}"}`,borderRadius:7,padding:"8px 12px",cursor:"pointer",color:activiteForm.typeActivite===a.k?"#C41E3A":T.text,fontWeight:activiteForm.typeActivite===a.k?700:400,fontSize:11,textAlign:"left"}}>
                  {a.l}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Objet / Description de la demande *</label>
              <textarea value={activiteForm.objet} onChange={e=>setActiviteForm(f=>({...f,objet:e.target.value}))} rows={2}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box",resize:"vertical"}} />
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Montant estimé (FCFA)</label>
              <input type="number" value={activiteForm.amount} onChange={e=>setActiviteForm(f=>({...f,amount:parseFloat(e.target.value)||0}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Priorité</label>
              <select value={activiteForm.priority} onChange={e=>setActiviteForm(f=>({...f,priority:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                {Object.entries(PRIORITY_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {/* Documents requis — checklist */}
          <div style={{background:T.surface2,borderRadius:10,padding:"10px 12px"}}>
            <div style={{color:T.text,fontWeight:800,fontSize:11,marginBottom:8}}>📎 Documents requis</div>
            {kycDocs.length > 0 && (
              <DocChecklist T={T} requiredDocs={kycDocs} uploadedDocs={intakeDocs} onUpload={handleUploadDoc} title="🪪 Documents KYC / Ouverture de compte" />
            )}
            {dossierDocs.length > 0 && (
              <DocChecklist T={T} requiredDocs={dossierDocs} uploadedDocs={intakeDocs} onUpload={handleUploadDoc} title={`📂 Documents dossier — ${selectedActivite?.l||""}`} />
            )}
            {/* Upload libre */}
            <div style={{marginTop:8,display:"flex",gap:8,alignItems:"center"}}>
              <label style={{color:T.textMuted,fontSize:10}}>📤 Ajouter d'autres documents :</label>
              <label style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                KYC <input type="file" multiple style={{display:"none"}} onChange={e=>handleUploadFree(e,"KYC")} />
              </label>
              <label style={{background:"#F9731622",border:"1px solid #F9731644",color:"#F97316",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                Dossier <input type="file" multiple style={{display:"none"}} onChange={e=>handleUploadFree(e,"DOSSIER")} />
              </label>
            </div>
            {intakeDocs.length > 0 && (
              <div style={{marginTop:8,fontSize:10,color:"#22C55E",background:"#22C55E11",borderRadius:6,padding:"5px 10px"}}>
                ✅ {intakeDocs.length} document(s) chargé(s) : {intakeDocs.filter(d=>d.cat==="KYC").length} KYC · {intakeDocs.filter(d=>d.cat==="DOSSIER").length} Dossier
              </div>
            )}
          </div>

          <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:6}}>
            <Btn variant="ghost" size="sm" onClick={() => handleStepChange(1)}>← Retour</Btn>
            <Btn variant="primary" size="sm" onClick={handleActivityValidation}>Suivant →</Btn>
          </div>
        </div>
      )}

      {/* ─ STEP 3 : Transfert & Finalisation ─ */}
      {step===3 && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Récapitulatif */}
          <div style={{background:T.surface2,borderRadius:10,padding:"10px 14px",border:`1px solid ${T.border}`}}>
            <div style={{color:"#C41E3A",fontWeight:800,fontSize:12,marginBottom:8}}>📋 Récapitulatif de l'intake</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:11}}>
              {[["Client",clientForm.nom],["Type",clientForm.type==="personne_morale"?"Personne morale":"Personne physique"],["Risque KYC",clientForm.riskLevel],["Processus",activiteForm.processus],["Activité",selectedActivite?.l||"—"],["Objet",activiteForm.objet],["Montant",activiteForm.amount?Number(activiteForm.amount).toLocaleString("fr-FR")+" FCFA":"—"],["Docs KYC",`${intakeDocs.filter(d=>d.cat==="KYC").length} fichier(s) · ${kycComplet?"✅ Complet":"⚠️ Incomplet"}`],["Docs Dossier",`${intakeDocs.filter(d=>d.cat==="DOSSIER").length} fichier(s) · ${dossierComplet?"✅ Complet":"⚠️ Incomplet"}`]].map(([k,v])=>(
                <div key={k} style={{background:T.surface,borderRadius:6,padding:"5px 8px"}}>
                  <div style={{color:T.textDim,fontSize:8,textTransform:"uppercase",fontWeight:700}}>{k}</div>
                  <div style={{color:T.text,fontSize:10,fontWeight:600,marginTop:1}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {!kycComplet && (
            <div style={{background:"#F59E0B11",border:"1px solid #F59E0B44",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#F59E0B"}}>
              ⚠️ Certains documents KYC obligatoires sont manquants. Le dossier sera quand même créé mais le KYC sera bloqué jusqu'à réception.
            </div>
          )}

          <div>
            <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4,fontWeight:700}}>Responsable destinataire ({activiteForm.processus})</label>
            <select value={transferForm.responsableId} onChange={e=>setTransferForm(f=>({...f,responsableId:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:11}}>
              <option value="">— Auto (responsable {activiteForm.processus}) —</option>
              {users.filter(u=>_activeUser(u)&&(u.process===activiteForm.processus||(u.processes||[]).includes(activiteForm.processus))&&u.level>=3&&u.id!==currentUser.id).map(u=>(
                <option key={u.id} value={u.id}>{u.name} — Niv.{u.level} · {u.role}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4}}>Instructions pour le responsable (optionnel)</label>
            <textarea value={transferForm.motif} onChange={e=>setTransferForm(f=>({...f,motif:e.target.value}))} rows={2}
              style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box",resize:"vertical"}}
              placeholder="Ex: Affaire urgente, client prioritaire..." />
          </div>
          <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:6}}>
            <Btn variant="ghost" size="sm" onClick={() => handleStepChange(2)}>← Retour</Btn>
            <Btn variant="primary" size="sm" onClick={handleFinalize} disabled={saving}>
              {saving?"⏳ Finalisation...":"✅ Finaliser l'intake"}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
