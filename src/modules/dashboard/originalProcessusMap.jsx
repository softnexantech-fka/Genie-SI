import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// ProcessusMap.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, playSound, formatDate, generateAccessCode, useSI, getUserProcess, gcFileSave, _activeUser, gcViewDoc, getProcColor, gcReadFile, gcFmtSize, gcDownloadDoc, gcDocIcon, ALPHA_SEQ } from '../../core/index.js';
import { STATUS_CONFIG, PROCESS_ACTIVITIES, CODES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge} from '../../components/UI.jsx';
import { CircuitsPanel } from '../docs/DossiersList.jsx';
import { HubProgrammesPanel } from '../admin/HubPanels.jsx';

export const ProcessusMap = React.memo(function ProcessusMap() {
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'dashboard',
          nom: file.name, taille: file.size, type: file.type,
          uploadedBy: localUser?.id, uploadedByName: localUser?.name,
          ...extraMeta,
        });
        results.push({
          ...ref, name: file.name, size: file.size, mimeType: file.type,
          sizeStr: file.size < 1048576 ? `${Math.round(file.size/1024)} Ko` : `${(file.size/1048576).toFixed(1)} Mo`,
          ext: '.' + file.name.split('.').pop().toLowerCase(),
          uploadedAt: new Date().toISOString(), downloads: 0,
        });
      } catch(e) { console.error('[upload dashboard]', file.name, e.message); }
    }
    return results;
  };

  const si = useSI();
  const { T, localUser, users, setUsers, dossiers, setDossiers,
    taches, setTaches, rdvs, setRdvs, partners, setPartnersSync,
    pendingApprovals, setPendingApprovals, notifications, setNotifications,
    isAdmin, isMG, isDG, isDemoMode, codifRegistry, setCodifRegistry,
    internalDocs, setInternalDocs, externalDocs, setExternalDocs,
    committees, setCommittees, systemMsgs, setSystemMsgs, sessionLogs,
    setActiveModule, handleSetActiveModule, selectedDossier, setSelectedDossier,
    processConfig, setProcessConfig, demandesData, generateAccessCode,
    addSessionLog, onLogout, pendingAccountActions, setPendingAccountActions,
    appHabilitations, setAppHabilitations, appAccessCodes, setAppAccessCodes,
  } = si;
  const [selectedProc, setSelectedProc] = useState(null);
  const [showProcDocUpload, setShowProcDocUpload] = useState(null);
  const [procMapTab, setProcMapTab] = useState("processus"); // processus | docs | comites | externes
  const [docUploadForm, setDocUploadForm] = useState({ name: "", process: "ALL", category: "Référentiel", description: "", fileType: "PDF", visible: "ALL", accessLevel: 1, dataUrl: null, fileName: null, fileSize: 0 });
  const [docUploadStatus, setDocUploadStatus] = useState(null);
  const intDocFileRef = useRef(null);
  const extDocFileRef = useRef(null);
  const [editingCommittee, setEditingCommittee] = useState(null);
  const [committeeEditForm, setCommitteeEditForm] = useState(null);
  const [newMemberSelectId, setNewMemberSelectId] = useState(""); // React-controlled select for add member
  const [docFilter, setDocFilter] = useState("ALL");
  const [extDocFilter, setExtDocFilter] = useState("ALL");
  const [announcingCommittee, setAnnouncingCommittee] = useState(null);
  const [announceForm, setAnnounceForm] = useState({ titre:"", message:"", priorite:"normale" });
  const [showExtDocModal, setShowExtDocModal] = useState(false);
  const [extDocForm, setExtDocForm] = useState({ name: "", process: "ALL", category: "EXTERNE", description: "", source: "", fileType: "PDF", accessLevel: 1, dataUrl: null, fileName: null, fileSize: 0 });
  const [extDocStatus, setExtDocStatus] = useState(null);
  const [editingProc, setEditingProc] = useState(null);
  const [procEditForm, setProcEditForm] = useState(null);
  const [viewingMember, setViewingMember] = useState(null);
  // FIX v63: suspension request modal vars (orphaned from CollaborateursPanel)
  const [showSuspendReqModal, setShowSuspendReqModal] = useState(null);
  const [suspReqMotif, setSuspReqMotif] = useState("");
  const [suspReqFile, setSuspReqFile] = useState(null);
  const handleRequestSuspension = (targetUser) => {
    if (!suspReqMotif.trim()) { gcAlert("Le motif est obligatoire."); return; }
    const sameProcess = (targetUser.process === localUser.process) ||
      (localUser.processes||[]).some(p => [targetUser.process,...(targetUser.processes||[])].includes(p));
    if (!sameProcess) { gcAlert("Vous pouvez uniquement demander la suspension de collaborateurs de votre processus."); return; }
    const rhUser = (users||[]).find(u=>(u.process==="S03"||(u.processes||[]).includes("S03"))&&u.level>=4&&u.isActive!==false);
    const dgUser = (users||[]).find(u=>(u.isMG||u.id==="USR-MG-001"||u.level===5)&&!u.isAdmin);
    const targets = [rhUser?.id, dgUser?.id].filter(Boolean);
    const req = {
      id:"APPRO-PROC-SUSP-"+Date.now(),
      type:"PROCESS_SUSPENSION_REQUEST",
      targetUserId:targetUser.id,targetUserName:targetUser.name,targetUserRole:targetUser.role,
      targetUserProcess:targetUser.process,
      initiatedBy:localUser.id,initiatedByName:localUser.name,initiatedByRole:localUser.role,
      initiatedAt:new Date().toISOString(),
      status:"EN_ATTENTE_RH",motif:suspReqMotif,attachment:suspReqFile,
      circuit:["RH","CONF","DG"],
    };
    if (setPendingApprovals) setPendingApprovals(prev=>[...prev,req]);
    if (targets.length) setNotifications(prev=>[{id:"N"+Date.now(),icon:"⏸️",
      message:`⏸️ Demande suspension ${targetUser.name} soumise au circuit`,
      type:"warning",at:new Date().toISOString(),targets},...prev]);
    if (addSessionLog) addSessionLog("MODIFICATION", localUser, {status:"SUCCESS",
      reason:`Demande suspension ${targetUser.name} soumise (circuit RH→Conf→DG)`});
    setShowSuspendReqModal(null); setSuspReqMotif(""); setSuspReqFile(null);
    gcAlert("⏳ Demande soumise au circuit RH → Conformité → DG.");
  };

  // FIX v126 — canSeeAll: règle métier (Audit S02/P02 niv4+) au lieu d'IDs DEMO
  const canSeeAll = localUser.level >= 5 || (localUser?.isAdmin || localUser?.level >= 6) || isMG;
  const canManageDocs = isMG || localUser.level >= 4 || (localUser?.isAdmin || localUser?.level >= 6);
  const canManageProcessDocs = (procCode) => {
    if (isMG || (localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 5) return true;
    if (localUser.level >= 4) {
      const myProcs = localUser.processes || [localUser.process];
      return myProcs.includes(procCode) || procCode === "ALL";
    }
    return false;
  };
  const canEditCommittees = isMG || (localUser?.isAdmin || localUser?.level >= 6) || localUser.level >= 5;
  // FIX v131 — Édition d'un processus : MG (niv5) et Admin ont tout. Les autres doivent être
  // responsable (niv4+) du processus concerné. isS02Manager niv3 retiré (trop permissif).
  const canEditProcess = (procCode) => {
    if (isMG || localUser.isAdmin || localUser.level >= 5) return true;
    if (localUser.level >= 4) {
      const myProcs = [...(localUser.processes || []), localUser.process || ""].filter(Boolean);
      return myProcs.includes(procCode);
    }
    return false;
  };
  // Garde rétrocompatibilité : canEditProcesses = peut éditer au moins 1 processus
  const canEditProcesses = isMG || localUser.isAdmin || localUser.level >= 5 ||
    (localUser.level >= 4 && [...(localUser.processes || []), localUser.process || ""].filter(Boolean).length > 0);
  const userProcesses = getUserProcess(localUser);

  const sections = [
    { label: "PROCESSUS PILOTAGE (P)", color: "#3B82F6", icon: "⬆", codes: ["P01","P02","P03","P04"] },
    { label: "PROCESSUS OPÉRATIONNEL (O)", color: "#22C55E", icon: "⚙", codes: ["O01","O02","O03"] },
    { label: "PROCESSUS SUPPORT (S)", color: "#FF7900", icon: "🛠", codes: ["S01","S02","S03","S04","S05","S06"] },
  ];

  const getDocsByProcess = (code) => internalDocs.filter(d => d.process === code || d.process === "ALL");
  const filteredDocs = docFilter === "ALL" ? internalDocs : internalDocs.filter(d => d.process === docFilter || d.process === "ALL");
  const filteredExtDocs = extDocFilter === "ALL" ? externalDocs : externalDocs.filter(d => d.process === extDocFilter || d.process === "ALL");

  const visibleInternalDocs = filteredDocs.filter(d => {
    if (canSeeAll) return true;
    const minLvl = d.accessLevel || 1;
    if (localUser.level < minLvl) return false;
    if (d.process === "ALL") return true;
    const myProcs = localUser.processes || [localUser.process];
    return myProcs.includes(d.process);
  });

  const handleIntDocFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocUploadStatus({ type: "loading", msg: "⏳ Lecture du fichier…" });
    try {
      const result = await gcReadFile(file, 10);
      setDocUploadForm(f => ({ ...f, dataUrl: result.dataUrl, fileName: result.name, fileSize: result.size, fileType: result.ext }));
      setDocUploadStatus({ type: "ok", msg: `✅ ${result.name} (${result.sizeStr})` });
    } catch (err) {
      setDocUploadStatus({ type: "error", msg: `❌ ${err.message}` });
    }
    if (e.target) e.target.value = "";
  };

  const handleUploadDoc = () => {
    if (!docUploadForm.name) { gcAlert("Veuillez saisir le nom du document."); return; }
    const newDoc = {
      id: "IDOC-" + Date.now(),
      ref: `${docUploadForm.fileType || "DOC"}-${ALPHA_SEQ[internalDocs.length] || "A99"}-${docUploadForm.process}.v1.0/${new Date().getFullYear()}`,
      name: docUploadForm.name,
      process: docUploadForm.process,
      category: docUploadForm.category,
      uploadedBy: localUser.id,
      uploadedAt: new Date().toISOString(),
      description: docUploadForm.description,
      fileType: docUploadForm.fileType,
      fileSize: docUploadForm.fileSize,
      sizeStr: gcFmtSize(docUploadForm.fileSize),
      hasFile: !!docUploadForm.dataUrl,
      dataUrl: docUploadForm.dataUrl || null,
      fileName: docUploadForm.fileName || null,
      accessLevel: docUploadForm.accessLevel || 1,
      visible: docUploadForm.visible || "ALL",
      downloads: 0,
    };
    setInternalDocs(prev => [...prev, newDoc]);
    setNotifications(prev => [{
      id: "N" + Date.now(), icon: "📄",
      message: `Document interne ajouté : "${newDoc.name}" (${newDoc.process}) par ${localUser.name}`,
      at: new Date().toISOString(), read: false
    }, ...prev]);
    setDocUploadForm({ name: "", process: "ALL", category: "Référentiel", description: "", fileType: "PDF", visible: "ALL", accessLevel: 1, dataUrl: null, fileName: null, fileSize: 0 });
    setDocUploadStatus(null);
    setShowProcDocUpload(null);
    gcAlert(`✅ Document "${newDoc.name}" ajouté.\nRéférence : ${newDoc.ref}`);
  };

  const handleExtDocFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtDocStatus({ type: "loading", msg: "⏳ Lecture du fichier…" });
    try {
      const result = await gcReadFile(file, 10);
      setExtDocForm(f => ({ ...f, dataUrl: result.dataUrl, fileName: result.name, fileSize: result.size, fileType: result.ext }));
      setExtDocStatus({ type: "ok", msg: `✅ ${result.name} (${result.sizeStr})` });
    } catch (err) {
      setExtDocStatus({ type: "error", msg: `❌ ${err.message}` });
    }
    if (e.target) e.target.value = "";
  };

  const handleSaveExtDoc = () => {
    if (!extDocForm.name.trim()) { gcAlert("Veuillez saisir le nom du document."); return; }
    const newDoc = {
      id: "EDOC-" + Date.now(),
      ref: `EXT-${ALPHA_SEQ[externalDocs.length]||"A99"}-${extDocForm.process}.v1.0/${new Date().getFullYear()}`,
      name: extDocForm.name, category: "EXTERNE", description: extDocForm.description,
      source: extDocForm.source, process: extDocForm.process, fileType: extDocForm.fileType,
      fileSize: extDocForm.fileSize, sizeStr: gcFmtSize(extDocForm.fileSize),
      dataUrl: extDocForm.dataUrl || null, fileName: extDocForm.fileName || null,
      accessLevel: extDocForm.accessLevel || 1,
      uploadedBy: localUser.id, uploadedAt: new Date().toISOString(), downloads: 0,
    };
    setExternalDocs(prev => [...prev, newDoc]);
    setNotifications(prev => [{ id: "N"+Date.now(), icon: "🌐", message: `Document externe ajouté : "${newDoc.name}" (${newDoc.process}) par ${localUser.name}`, at: new Date().toISOString(), read: false }, ...prev]);
    setExtDocForm({ name: "", process: "ALL", category: "EXTERNE", description: "", source: "", fileType: "PDF", accessLevel: 1, dataUrl: null, fileName: null, fileSize: 0 });
    setExtDocStatus(null);
    setShowExtDocModal(false);
    gcAlert(`✅ Document externe "${newDoc.name}" ajouté.`);
  };

  const handleDownloadIntDoc = (doc) => {
    if (!doc.dataUrl) { gcAlert("⚠️ Aucun fichier disponible. Le document n'a pas encore de fichier téléversé."); return; }
    setInternalDocs(prev => prev.map(d => d.id === doc.id ? { ...d, downloads: (d.downloads||0)+1 } : d));
    gcDownloadDoc(doc);
  };

  const handleDownloadExtDoc = (doc) => {
    if (!doc.dataUrl) { gcAlert("⚠️ Aucun fichier disponible pour ce document externe."); return; }
    setExternalDocs(prev => prev.map(d => d.id === doc.id ? { ...d, downloads: (d.downloads||0)+1 } : d));
    gcDownloadDoc(doc);
  };

  const handleDeleteIntDoc = async (doc) => {
    if (!await gcConfirm(`Supprimer le document "${doc.name}" ?`)) return;
    setInternalDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  const handleDeleteExtDoc = async (doc) => {
    if (!await gcConfirm(`Supprimer le document externe "${doc.name}" ?`)) return;
    setExternalDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  const handleSaveCommittee = () => {
    if (!committeeEditForm) return;
    setCommittees(prev => prev.map(c => c.id === committeeEditForm.id ? committeeEditForm : c));
    setEditingCommittee(null);
    setCommitteeEditForm(null);
    gcAlert("✅ Comité mis à jour avec succès.");
  };

  const handlePublishAnnouncement = () => {
    if (!announceForm.message || !announcingCommittee) return;
    const com = committees.find(c=>c.id===announcingCommittee);
    const priorityIcon = announceForm.priorite==="urgente" ? "🚨" : announceForm.priorite==="haute" ? "⚠️" : "📢";
    const fullMsg = `${priorityIcon} [${com?.acronym}] ${announceForm.titre ? announceForm.titre + " — " : ""}${announceForm.message}`;
    const memberIds = (com?.membres||[]).map(m=>m.userId);
    setNotifications(prev => [{
      id:"N"+Date.now(), icon: priorityIcon,
      message: fullMsg,
      at: new Date().toISOString(), read: false,
      targetUsers: memberIds,
      from: localUser.id, committee: com?.id,
    }, ...prev]);
    playSound(announceForm.priorite==="urgente" ? "alarm" : "notif");
    setAnnouncingCommittee(null);
    setAnnounceForm({ titre:"", message:"", priorite:"normale" });
    gcAlert(`✅ Annonce publiée aux ${memberIds.length} membres du comité "${com?.name}".`);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <h3 style={{ color:"#C41E3A", margin:0, fontSize:14, fontWeight:800 }}>🗺️ Processus & Hiérarchie</h3>
        {!canSeeAll && (
          <div style={{ background:"#F59E0B22", border:"1px solid #F59E0B44", borderRadius:8, padding:"5px 10px", color:"#F59E0B", fontSize:11 }}>
            ⚠ Vue restreinte — Seul(s) le(s) processus de votre service s'affichent
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div style={{ display:"flex", gap:4, marginBottom:16, borderBottom:`1px solid ${T.border}`, paddingBottom:8, overflowX:"auto", flexWrap:"nowrap", WebkitOverflowScrolling:"touch" }} className="gc-tabs-scroll">
        {[
          { id: "processus",      icon: "🗺️", label: "Cartographie" },
          { id: "organigramme",   icon: "🏢", label: "Organigramme" },
          { id: "circuits",       icon: "🔄", label: "Circuits" },
          { id: "accreditations", icon: "🎖️", label: "Accréditations" },
          { id: "comites", icon: "🏛️", label: "Comités" },
          { id: "hub", icon: "🔗", label: "Hub Programmes" },
          { id: "docs", icon: "📄", label: `Documents Internes (${internalDocs.length})` },
          { id: "externes", icon: "🌐", label: `Documents Externes (${externalDocs.length})` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setProcMapTab(tab.id)} style={{
            background: procMapTab === tab.id ? "#C41E3A22" : "transparent",
            border: `1px solid ${procMapTab === tab.id ? "#C41E3A55" : T.border}`,
            borderRadius: 8, padding: "6px 12px", color: procMapTab === tab.id ? "#C41E3A" : T.textMuted,
            cursor: "pointer", fontSize: 12, fontWeight: procMapTab === tab.id ? 700 : 400, flexShrink: 0
          }}>{tab.icon} {tab.label}</button>
        ))}
      </div>

      {/* ── ONGLET CARTOGRAPHIE ── */}
      {procMapTab === "processus" && (
        <div>
          <div style={{ background:`linear-gradient(135deg, ${T.surface2}, ${T.surface3})`, border:`1px solid ${T.border}`, borderRadius:12, padding:14, marginBottom:16, textAlign:"center" }}>
            <div style={{ color:T.textMuted, fontSize:10, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>Génie Consultant — Cabinet Juridique et d'Affaires</div>
            <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap", marginBottom:8 }}>
              {["PILOTAGE","OPÉRATIONNEL","SUPPORT"].map((m,i)=>(<Badge key={m} label={m} color={["#3B82F6","#22C55E","#FF7900"][i]} />))}
            </div>
            <div style={{ color:T.textDim, fontSize:10 }}>Modèle ISO 9001-2015 • DOC-A01-PROS.v1.0/2026</div>
          </div>

          {sections.map((section) => {
            // FIX: Tous voient tous les processus (lecture seule selon niveau)
            // Les opérations sont conditionnées séparément via canManageDocs / canEditProcesses
            // v116 — Chaque user voit seulement ses processus (Manager niv5+/Admin voient tout)
            const visibleCodes = canSeeAll
              ? section.codes
              : section.codes.filter(c => userProcesses.includes(c));
            if (!visibleCodes.length) return null;
            return (
              <div key={section.label} style={{ marginBottom:20 }}>
                <div style={{ background:section.color+"22", border:`1px solid ${section.color}44`, borderRadius:10, padding:"8px 14px", marginBottom:10, textAlign:"center" }}>
                  <span style={{ color:section.color, fontWeight:800, fontSize:13 }}>{section.icon} {section.label}</span>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {visibleCodes.map(code => {
                    const pData = processConfig[code] || PROCESS_ACTIVITIES[code];
                    if (!pData) return null;
                    const procUsers = users.filter(u => _activeUser(u)&&u.process===code || u.processes?.includes(code));
                    const procInternalDocs = getDocsByProcess(code);
                    const isEditing = editingProc === code;
                    return (
                      <div key={code} style={{ background:T.surface2, borderRadius:10, border:`1px solid ${section.color}33`, overflow:"hidden" }}>
                        <div onClick={() => !isEditing && setSelectedProc(selectedProc===code?null:code)}
                          style={{ display:"flex", alignItems:"center", padding:"12px 16px", gap:14, cursor:"pointer" }}>
                          <div style={{ fontSize:22, flexShrink:0, width:32, textAlign:"center" }}>{pData.icon}</div>
                          <div style={{ width:44, color:section.color, fontWeight:800, fontFamily:"monospace", fontSize:13, flexShrink:0 }}>{code}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ color:T.text, fontSize:13, fontWeight:600 }}>{pData.label}</div>
                            <div style={{ color:T.textMuted, fontSize:10, marginTop:1 }}>{pData.activities.length} activités • {procUsers.length} collaborateur(s) • {procInternalDocs.length} doc(s)</div>
                          </div>
                          <div style={{ display:"flex", gap:4, alignItems:"center", flexShrink:0 }}>
                            {/* Clickable member avatars */}
                            {procUsers.slice(0,4).map(u=>(
                              <div key={u.id} onClick={e=>{e.stopPropagation();setViewingMember(u);}} title={`${u.name} — ${u.role}`}
                                style={{ width:26,height:26,borderRadius:"50%",background:u.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,cursor:"pointer",border:"2px solid transparent",transition:"border 0.15s" }}
                                onMouseEnter={e=>e.currentTarget.style.border=`2px solid ${section.color}`}
                                onMouseLeave={e=>e.currentTarget.style.border="2px solid transparent"}>
                                {u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}}/>:u.avatar}
                              </div>
                            ))}
                            {procInternalDocs.length > 0 && <Badge label={`📄 ${procInternalDocs.length}`} color="#C9A84C" small />}
                            {canManageDocs && (
                              <button onClick={e=>{e.stopPropagation();setDocUploadForm(f=>({...f,process:code}));setShowProcDocUpload(code);}}
                                style={{ background:"#C41E3A22",border:"1px solid #C41E3A44",borderRadius:5,padding:"2px 6px",color:"#C41E3A",cursor:"pointer",fontSize:10,fontWeight:700 }}
                                title="Ajouter un document">+ Doc</button>
                            )}
                            {/* FIX v131 — Bouton modifier conditionné par canEditProcess(code) : responsable du processus niv4+ ou MG/admin */}
                            {canEditProcess(code) && (
                              <button onClick={e=>{e.stopPropagation();
                                if(isEditing){setEditingProc(null);setProcEditForm(null);}
                                else{
                                  setEditingProc(code);
                                  setProcEditForm({
                                    label:pData.label, icon:pData.icon, responsable:pData.responsable,
                                    objectifs:[...pData.objectifs],
                                    activities:pData.activities.map(a=>({...a})),
                                  });
                                  setSelectedProc(code);
                                }
                              }} style={{ background:isEditing?"#F59E0B22":"#A855F722",border:`1px solid ${isEditing?"#F59E0B44":"#A855F744"}`,borderRadius:5,padding:"2px 8px",color:isEditing?"#F59E0B":"#A855F7",cursor:"pointer",fontSize:10,fontWeight:700 }}>
                                {isEditing?"✕ Annuler":"✏️ Modifier"}
                              </button>
                            )}
                            <span style={{ color:T.textDim, fontSize:12, marginLeft:2 }}>{selectedProc===code?"▲":"▼"}</span>
                          </div>
                        </div>

                        {selectedProc === code && (
                          <div style={{ borderTop:`1px solid ${section.color}33`, background:T.surface3, padding:"14px 16px" }}>
                            {isEditing && procEditForm ? (
                              /* -- EDITION MODE -- */
                              <div>
                                <div style={{ color:"#F59E0B", fontWeight:800, fontSize:12, marginBottom:10 }}>✏️ Modification du processus {code}</div>
                                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                                  <InputField label="Nom du processus" value={procEditForm.label} onChange={e=>setProcEditForm(f=>({...f,label:e.target.value}))} T={T} />
                                  <InputField label="Icône (emoji)" value={procEditForm.icon} onChange={e=>setProcEditForm(f=>({...f,icon:e.target.value}))} T={T} />
                                  <div style={{ gridColumn:"span 2" }}>
                                    <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>🎯 Responsable (Niv. 4+ uniquement)</label>
                                    <select value={procEditForm.responsable} onChange={e=>setProcEditForm(f=>({...f,responsable:e.target.value}))} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                                      <option value="">— Sélectionner un responsable de niveau 4+ —</option>
                                      {users.filter(u=>_activeUser(u)&&u.level>=4&&!u.isAdmin).map(u=><option key={u.id} value={u.name}>{u.name} — {u.role} (Niv.{u.level})</option>)}
                                    </select>
                                  </div>
                                </div>
                                {/* Activités éditables */}
                                <div style={{ marginBottom:10 }}>
                                  <div style={{ color:section.color, fontSize:11, fontWeight:700, marginBottom:6, textTransform:"uppercase", letterSpacing:1, display:"flex", justifyContent:"space-between" }}>
                                    <span>📋 Activités ({procEditForm.activities.length})</span>
                                    <button style={{ background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:4,padding:"2px 8px",color:"#22C55E",cursor:"pointer",fontSize:10,fontWeight:700 }} onClick={()=>setProcEditForm(f=>({...f,activities:[...f.activities,{code:code+"."+String(f.activities.length+1).padStart(2,"0"),label:"Nouvelle activité"}]}))}>+ Activité</button>
                                  </div>
                                  {procEditForm.activities.map((act,i)=>(
                                    <div key={i} style={{ display:"flex",gap:8,marginBottom:4,alignItems:"center" }}>
                                      <input value={act.code} onChange={e=>setProcEditForm(f=>({...f,activities:f.activities.map((a,j)=>j===i?{...a,code:e.target.value}:a)}))}
                                        style={{ width:80,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:section.color,fontSize:10,fontFamily:"monospace",fontWeight:700,outline:"none",flexShrink:0 }} />
                                      <input value={act.label} onChange={e=>setProcEditForm(f=>({...f,activities:f.activities.map((a,j)=>j===i?{...a,label:e.target.value}:a)}))}
                                        style={{ flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11,outline:"none" }} />
                                      <button onClick={()=>setProcEditForm(f=>({...f,activities:f.activities.filter((_,j)=>j!==i)}))}
                                        style={{ background:"#EF444415",border:"1px solid #EF444444",borderRadius:4,padding:"2px 6px",color:"#EF4444",cursor:"pointer",fontSize:10,flexShrink:0 }}>🗑️</button>
                                    </div>
                                  ))}
                                </div>
                                {/* Membres — assigner/retirer */}
                                <div style={{ marginBottom:10 }}>
                                  <div style={{ color:T.textMuted, fontSize:11, fontWeight:700, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>👥 Membres du processus</div>
                                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                                    {procUsers.map(u=>(
                                      <div key={u.id} style={{ display:"flex",alignItems:"center",gap:4,background:u.color+"22",border:`1px solid ${u.color}44`,borderRadius:16,padding:"3px 10px" }}>
                                        <div style={{ width:18,height:18,borderRadius:"50%",background:u.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700 }}>{u.avatar}</div>
                                        <span style={{ color:T.text,fontSize:10,fontWeight:600 }}>{u.name.split(" ")[0]}</span>
                                        <button onClick={()=>{
                                          const newProcs = (u.processes||[u.process]).filter(p=>p!==code);
                                          setUsers(prev=>prev.map(x=>x.id===u.id?{...x,process:newProcs[0]||u.process,processes:newProcs.length?newProcs:[u.process]}:x));
                                          setNotifications(prev=>[{id:"N"+Date.now(),icon:"👤",message:`${u.name} retiré du processus ${code} par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
                                        }} style={{ background:"transparent",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10,padding:0,lineHeight:1 }}>×</button>
                                      </div>
                                    ))}
                                  </div>
                                  <select onChange={e=>{
                                    const uid=e.target.value; if(!uid) return;
                                    const u=users.find(x=>x.id===uid); if(!u) return;
                                    const procs=u.processes||[u.process];
                                    if(!procs.includes(code)) setUsers(prev=>prev.map(x=>x.id===uid?{...x,process:code,processes:[...procs,code]}:x));
                                    setNotifications(prev=>[{id:"N"+Date.now(),icon:"👤",message:`${u.name} ajouté au processus ${code} par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
                                    e.target.value="";
                                  }} style={{ background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:11,width:"100%",outline:"none" }}>
                                    <option value="">+ Ajouter un collaborateur à ce processus…</option>
                                    {users.filter(u=>_activeUser(u)&&!procUsers.find(pu=>pu.id===u.id)&&u.id!=="USR-ADM-000").map(u=><option key={u.id} value={u.id}>{u.name} — Niv.{u.level} ({u.process})</option>)}
                                  </select>
                                </div>
                                <div style={{ display:"flex",gap:8 }}>
                                  <button onClick={()=>{
                                    setProcessConfig(prev=>({...prev,[code]:{...prev[code],...procEditForm}}));
                                    setNotifications(prev=>[{id:"N"+Date.now(),icon:"⚙️",message:`Processus ${code} mis à jour par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
                                    setEditingProc(null); setProcEditForm(null);
                                    gcAlert(`✅ Processus ${code} modifié avec succès.`);
                                  }} style={{ background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:800,fontSize:12 }}>
                                    💾 Enregistrer
                                  </button>
                                  <button onClick={()=>{setEditingProc(null);setProcEditForm(null);}} style={{ background:T.surface2,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12 }}>
                                    Annuler
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* -- VIEW MODE -- */
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                                <div>
                                  <div style={{ color:section.color, fontSize:11, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>📋 Activités</div>
                                  {pData.activities.map(a=>(
                                    <div key={a.code} style={{ display:"flex", gap:8, padding:"5px 8px", background:T.surface2, borderRadius:6, marginBottom:4, border:`1px solid ${section.color}22` }}>
                                      <span style={{ color:section.color, fontFamily:"monospace", fontSize:10, fontWeight:700, minWidth:52, flexShrink:0 }}>{a.code}</span>
                                      <span style={{ color:T.textMuted, fontSize:11 }}>{a.label}</span>
                                    </div>
                                  ))}
                                  {/* Membres cliquables */}
                                  <div style={{ marginTop:12 }}>
                                    <div style={{ color:T.textMuted, fontSize:11, fontWeight:700, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>👥 Collaborateurs ({procUsers.length})</div>
                                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                      {procUsers.map(u=>{
                                        const uDoss = dossiers.filter(d=>(d.assignedTo===u.id||d.createdBy===u.id)&&d.status!=="TERMINE").slice(0,3);
                                        return (
                                          <button key={u.id} onClick={()=>setViewingMember(viewingMember?.id===u.id?null:u)}
                                            title={`${u.name} — ${u.role} — Cliquer pour profil`}
                                            style={{ display:"flex",alignItems:"center",gap:5,background:viewingMember?.id===u.id?u.color+"33":T.surface2,border:`1px solid ${viewingMember?.id===u.id?u.color:T.border}`,borderRadius:16,padding:"4px 10px",cursor:"pointer",transition:"all 0.15s" }}>
                                            <div style={{ width:20,height:20,borderRadius:"50%",background:u.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700,flexShrink:0,overflow:"hidden" }}>
                                              {u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar}
                                            </div>
                                            <span style={{ color:T.text,fontSize:10,fontWeight:600 }}>{u.name.split(" ")[0]}</span>
                                            <Badge label={`Niv.${u.level}`} color={u.color} small />
                                          </button>
                                        );
                                      })}
                                      {procUsers.length===0&&<span style={{color:T.textDim,fontSize:10,fontStyle:"italic"}}>Aucun collaborateur assigné</span>}
                                    </div>
                                    {/* Expanded member view */}
                                    {viewingMember && procUsers.find(u=>u.id===viewingMember.id) && (
                                      <div style={{ background:viewingMember.color+"11",border:`1px solid ${viewingMember.color}33`,borderRadius:10,padding:"12px 14px",marginTop:8 }}>
                                        <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:8 }}>
                                          <div style={{ width:36,height:36,borderRadius:"50%",background:viewingMember.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700,flexShrink:0,overflow:"hidden" }}>
                                            {viewingMember.photoUrl?<img src={viewingMember.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:viewingMember.avatar}
                                          </div>
                                          <div style={{ flex:1 }}>
                                            <div style={{ color:T.text,fontWeight:800,fontSize:13 }}>{viewingMember.name}</div>
                                            <div style={{ color:T.textMuted,fontSize:10 }}>{viewingMember.role} · {viewingMember.dept}</div>
                                            <div style={{ display:"flex",gap:4,marginTop:3 }}>
                                              <Badge label={`Niv.${viewingMember.level}`} color="#C41E3A" small />
                                              <Badge label={viewingMember.process} color={getProcColor(viewingMember.process)} small />
                                            </div>
                                          </div>
                                          <button onClick={()=>setViewingMember(null)} style={{ background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:16 }}>✕</button>
                                        </div>
                                        {viewingMember.email && <div style={{ color:T.textDim,fontSize:10 }}>📧 {viewingMember.email}</div>}
                                        {viewingMember.telephone && <div style={{ color:T.textDim,fontSize:10 }}>📞 {viewingMember.telephone}</div>}
                                        <div style={{ marginTop:8 }}>
                                          <div style={{ color:T.textDim,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:4 }}>Travaux en cours (temps réel)</div>
                                          {dossiers.filter(d=>(d.assignedTo===viewingMember.id||d.createdBy===viewingMember.id)&&d.status!=="TERMINE").slice(0,4).map(d=>(
                                            <div key={d.id} onClick={()=>setSelectedDossier(d)} style={{ background:T.surface2,borderRadius:6,padding:"5px 8px",marginBottom:3,border:`1px solid ${T.border}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                                              <span style={{ color:T.text,fontSize:10,fontWeight:600 }}>{d.client}</span>
                                              <div style={{ display:"flex",gap:4 }}>
                                                <Badge label={d.process} color={getProcColor(d.process)} small />
                                                <Badge label={STATUS_CONFIG[d.status]?.label||d.status} color={STATUS_CONFIG[d.status]?.color||"#888"} small />
                                              </div>
                                            </div>
                                          ))}
                                          {dossiers.filter(d=>(d.assignedTo===viewingMember.id||d.createdBy===viewingMember.id)&&d.status!=="TERMINE").length===0 && (
                                            <div style={{ color:T.textDim,fontSize:10,fontStyle:"italic" }}>Aucun dossier actif</div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ color:T.textMuted, fontSize:11, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>ℹ️ Informations</div>
                                  <div style={{ background:T.surface2, borderRadius:6, padding:"8px 10px", marginBottom:8, fontSize:11 }}>
                                    <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase", marginBottom:2 }}>Responsable</div>
                                    <div style={{ color:T.text, fontWeight:600 }}>{pData.responsable}</div>
                                  </div>
                                  <div style={{ background:T.surface2, borderRadius:6, padding:"8px 10px", marginBottom:8, fontSize:11 }}>
                                    <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase", marginBottom:4 }}>Objectifs</div>
                                    {pData.objectifs.map((o,i)=><div key={i} style={{ color:T.textMuted, marginBottom:2 }}>• {o}</div>)}
                                  </div>
                                  {/* Internal documents */}
                                  <div>
                                    <div style={{ color:"#C9A84C", fontSize:11, fontWeight:700, marginBottom:6, textTransform:"uppercase", letterSpacing:1, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                      <span>📄 Documents ({procInternalDocs.length})</span>
                                      {canManageDocs && <button onClick={e=>{e.stopPropagation();setDocUploadForm(f=>({...f,process:code}));setShowProcDocUpload(code);}} style={{ background:"#C9A84C22",border:"1px solid #C9A84C44",borderRadius:4,padding:"2px 6px",color:"#C9A84C",cursor:"pointer",fontSize:9,fontWeight:700 }}>+ Ajouter</button>}
                                    </div>
                                    {procInternalDocs.length===0?(
                                      <div style={{ color:T.textDim,fontSize:10,fontStyle:"italic",padding:"6px 8px",background:T.surface2,borderRadius:6 }}>Aucun document interne</div>
                                    ):procInternalDocs.map(d=>(
                                      <div key={d.id} style={{ background:T.surface2,borderRadius:6,padding:"5px 8px",marginBottom:3,border:"1px solid #C9A84C22",display:"flex",gap:8,alignItems:"center" }}>
                                        <span style={{ fontSize:12 }}>{d.fileType==="PDF"?"📕":d.fileType==="XLSX"?"📗":d.fileType==="DOCX"?"📘":"📄"}</span>
                                        <div style={{ flex:1,minWidth:0 }}>
                                          <div style={{ color:T.text,fontSize:10,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{d.name}</div>
                                          <div style={{ color:T.textDim,fontSize:9 }}>{d.ref} • {d.fileType}</div>
                                        </div>
                                        {d.hasFile&&<span style={{ color:"#22C55E",fontSize:10 }}>✅</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ONGLET DOCUMENTS INTERNES ── */}
      {procMapTab === "docs" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div>
              <h4 style={{ color:T.text, margin:0, fontSize:13, fontWeight:700 }}>📄 Documents Internes du Cabinet ({internalDocs.length})</h4>
              <div style={{ color:T.textMuted, fontSize:10, marginTop:2 }}>{internalDocs.filter(d=>d.dataUrl).length} fichier(s) disponible(s) au téléchargement</div>
            </div>
            {canManageDocs && (
              <button onClick={() => setShowProcDocUpload("new")} style={{ background:"#C41E3A", border:"none", color:"#fff", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:12, fontWeight:700 }}>
                + Ajouter un document
              </button>
            )}
          </div>
          {/* Filter by process */}
          <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
            {[["ALL","Tous"],["P01","P01"],["P02","P02"],["P03","P03"],["P04","P04"],["O01","O01"],["O02","O02"],["O03","O03"],["S01","S01"],["S02","S02"],["S03","S03"],["S04","S04"],["S05","S05"],["S06","S06"]].map(([v,l])=>(
              <button key={v} onClick={()=>setDocFilter(v)} style={{ background:docFilter===v?"#C41E3A22":"transparent", border:`1px solid ${docFilter===v?"#C41E3A55":T.border}`, borderRadius:6, padding:"4px 9px", color:docFilter===v?"#C41E3A":T.textMuted, cursor:"pointer", fontSize:11, fontWeight:docFilter===v?700:400 }}>{l}</button>
            ))}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {visibleInternalDocs.map(doc => {
              const uploader = users.find(u => u.id === doc.uploadedBy);
              const canDelete = isMG || (localUser?.isAdmin || localUser?.level >= 6) || (canManageProcessDocs(doc.process) && doc.uploadedBy === localUser.id) || localUser.level >= 5;
              const canUploadFile = canManageProcessDocs(doc.process);
              return (
                <div key={doc.id} style={{ background:T.surface2, borderRadius:10, border:`1px solid ${doc.dataUrl?"#22C55E33":T.border}`, padding:"12px 16px", display:"flex", gap:12, alignItems:"flex-start" }}>
                  <div style={{ fontSize:28, flexShrink:0 }}>{gcDocIcon(doc.fileType)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:T.text, fontSize:13, fontWeight:700 }}>{doc.name}</div>
                    <div style={{ color:T.textMuted, fontSize:10, marginTop:2, fontFamily:"monospace" }}>{doc.ref}</div>
                    {doc.description && <div style={{ color:T.textDim, fontSize:10, marginTop:2, fontStyle:"italic" }}>{doc.description}</div>}
                    <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap", alignItems:"center" }}>
                      <Badge label={doc.category} color="#3B82F6" small />
                      <Badge label={doc.process === "ALL" ? "Tous processus" : doc.process} color={getProcColor(doc.process)} small />
                      <Badge label={doc.fileType} color="#C9A84C" small />
                      {doc.dataUrl
                        ? <Badge label={`✅ ${doc.sizeStr || gcFmtSize(doc.fileSize)}`} color="#22C55E" small />
                        : <Badge label="⏳ Sans fichier" color="#F59E0B" small />}
                      {doc.downloads > 0 && <Badge label={`⬇ ${doc.downloads}`} color="#06B6D4" small />}
                    </div>
                    <div style={{ color:T.textDim, fontSize:9, marginTop:4 }}>Par {uploader?.name || doc.uploadedBy} · {formatDate(doc.uploadedAt)}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
                    {doc.dataUrl && (
                      <button onClick={() => handleDownloadIntDoc(doc)} style={{ background:"#22C55E22", border:"1px solid #22C55E44", borderRadius:6, padding:"4px 10px", color:"#22C55E", cursor:"pointer", fontSize:10, fontWeight:700 }}>⬇ Télécharger</button>
                    )}
                    {doc.dataUrl && (
                      <button onClick={() => gcViewDoc(doc)} style={{ background:"#A855F722", border:"1px solid #A855F744", borderRadius:6, padding:"4px 10px", color:"#A855F7", cursor:"pointer", fontSize:10, fontWeight:700 }}>👁 Visualiser</button>
                    )}
                    {canUploadFile && (
                      <label style={{ background:"#3B82F622", border:"1px solid #3B82F644", borderRadius:6, padding:"4px 10px", color:"#3B82F6", cursor:"pointer", fontSize:10, fontWeight:700, textAlign:"center" }}>
                        ⬆ {doc.dataUrl ? "Remplacer" : "Téléverser"}
                        <input type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png,.pptx,.txt" style={{ display:"none" }} onChange={async e => {
                          const file = e.target.files?.[0]; if (!file) return;
                          try {
                            const result = await gcReadFile(file, 10);
                            setInternalDocs(prev => prev.map(d => d.id === doc.id ? { ...d, dataUrl: result.dataUrl, fileName: result.name, fileSize: result.size, sizeStr: result.sizeStr, fileType: result.ext, hasFile: true, uploadedBy: localUser.id, uploadedAt: new Date().toISOString() } : d));
                            gcAlert(`✅ Fichier "${result.name}" téléversé sur "${doc.name}".`);
                          } catch (err) { gcAlert(`❌ ${err.message}`); }
                          if (e.target) e.target.value = "";
                        }} />
                      </label>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDeleteIntDoc(doc)} style={{ background:"#EF444415", border:"1px solid #EF444440", borderRadius:6, padding:"4px 10px", color:"#EF4444", cursor:"pointer", fontSize:10 }}>🗑 Supprimer</button>
                    )}
                  </div>
                </div>
              );
            })}
            {visibleInternalDocs.length === 0 && (
              <div style={{ textAlign:"center", padding:40, color:T.textDim, fontSize:13 }}>
                Aucun document interne pour ce filtre.
                {canManageDocs && <div style={{ marginTop:8, color:"#C41E3A", cursor:"pointer", fontSize:12, fontWeight:600 }} onClick={() => setShowProcDocUpload("new")}>+ Téléverser le premier document</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ONGLET DOCUMENTS EXTERNES ── */}
      {procMapTab === "externes" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div>
              <h4 style={{ color:T.text, margin:0, fontSize:13, fontWeight:700 }}>🌐 Documents Externes ({externalDocs.length})</h4>
              <div style={{ color:T.textMuted, fontSize:10, marginTop:2 }}>Textes de loi, rapports externes, références documentaires</div>
            </div>
            {canManageDocs && (
              <button onClick={() => setShowExtDocModal(true)} style={{ background:"#06B6D4", border:"none", color:"#fff", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:12, fontWeight:700 }}>
                + Ajouter document externe
              </button>
            )}
          </div>
          {/* Filter by process */}
          <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
            {[["ALL","Tous"],["P01","P01"],["P02","P02"],["O01","O01"],["O02","O02"],["O03","O03"],["S01","S01"],["S02","S02"],["S03","S03"]].map(([v,l])=>(
              <button key={v} onClick={()=>setExtDocFilter(v)} style={{ background:extDocFilter===v?"#06B6D422":"transparent", border:`1px solid ${extDocFilter===v?"#06B6D455":T.border}`, borderRadius:6, padding:"4px 9px", color:extDocFilter===v?"#06B6D4":T.textMuted, cursor:"pointer", fontSize:11, fontWeight:extDocFilter===v?700:400 }}>{l}</button>
            ))}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filteredExtDocs.map(doc => {
              const uploader = users.find(u => u.id === doc.uploadedBy);
              const canDelete = isMG || (localUser?.isAdmin || localUser?.level >= 6) || doc.uploadedBy === localUser.id || localUser.level >= 5;
              return (
                <div key={doc.id} style={{ background:T.surface2, borderRadius:10, border:`1px solid ${doc.dataUrl?"#06B6D433":T.border}`, padding:"12px 16px", display:"flex", gap:12, alignItems:"flex-start" }}>
                  <div style={{ fontSize:28, flexShrink:0 }}>🌐</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:T.text, fontSize:13, fontWeight:700 }}>{doc.name}</div>
                    <div style={{ color:T.textMuted, fontSize:10, marginTop:2, fontFamily:"monospace" }}>{doc.ref}</div>
                    {doc.source && <div style={{ color:"#06B6D4", fontSize:10, marginTop:2 }}>🔗 Source : {doc.source}</div>}
                    {doc.description && <div style={{ color:T.textDim, fontSize:10, marginTop:2, fontStyle:"italic" }}>{doc.description}</div>}
                    <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
                      <Badge label={doc.process === "ALL" ? "Tous processus" : doc.process} color={getProcColor(doc.process)} small />
                      <Badge label={doc.fileType} color="#06B6D4" small />
                      {doc.dataUrl ? <Badge label={`✅ ${gcFmtSize(doc.fileSize)}`} color="#22C55E" small /> : <Badge label="⏳ Sans fichier" color="#F59E0B" small />}
                      {doc.downloads > 0 && <Badge label={`⬇ ${doc.downloads}`} color="#06B6D4" small />}
                    </div>
                    <div style={{ color:T.textDim, fontSize:9, marginTop:4 }}>Par {uploader?.name || "—"} · {formatDate(doc.uploadedAt)}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
                    {doc.dataUrl && <button onClick={() => handleDownloadExtDoc(doc)} style={{ background:"#22C55E22", border:"1px solid #22C55E44", borderRadius:6, padding:"4px 10px", color:"#22C55E", cursor:"pointer", fontSize:10, fontWeight:700 }}>⬇ Télécharger</button>}
                    {doc.dataUrl && <button onClick={() => gcViewDoc(doc)} style={{ background:"#A855F722", border:"1px solid #A855F744", borderRadius:6, padding:"4px 10px", color:"#A855F7", cursor:"pointer", fontSize:10, fontWeight:700 }}>👁 Visualiser</button>}
                    {canDelete && <button onClick={() => handleDeleteExtDoc(doc)} style={{ background:"#EF444415", border:"1px solid #EF444440", borderRadius:6, padding:"4px 10px", color:"#EF4444", cursor:"pointer", fontSize:10 }}>🗑</button>}
                  </div>
                </div>
              );
            })}
            {filteredExtDocs.length === 0 && (
              <div style={{ textAlign:"center", padding:40, color:T.textDim, fontSize:13 }}>
                Aucun document externe pour ce filtre.
                {canManageDocs && <div style={{ marginTop:8, color:"#06B6D4", cursor:"pointer", fontSize:12, fontWeight:600 }} onClick={() => setShowExtDocModal(true)}>+ Ajouter un document externe</div>}
              </div>
            )}
          </div>

          {/* ── MODAL DOCUMENT EXTERNE ── */}
          {showExtDocModal && (
            <div style={{ position:"fixed", inset:0, background:"#000B", zIndex:5000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onMouseDown={e=>{if(e.target===e.currentTarget)setShowExtDocModal(false);}}>
              <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:18, padding:"28px 32px", width:"min(500px,95vw)", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 30px 100px #0009" }}>
                <h3 style={{ color:"#06B6D4", margin:"0 0 18px", fontWeight:800 }}>🌐 Nouveau document externe</h3>
                <InputField label="Nom du document *" value={extDocForm.name} onChange={e=>setExtDocForm(f=>({...f,name:e.target.value}))} T={T} placeholder="Ex: Loi n°2021-01 sur le droit des sociétés" />
                <InputField label="Source / Référence" value={extDocForm.source} onChange={e=>setExtDocForm(f=>({...f,source:e.target.value}))} T={T} placeholder="Ex: Journal Officiel du Gabon, OHADA, etc." />
                <div style={{ marginTop:10 }}>
                  <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Description</label>
                  <textarea value={extDocForm.description} onChange={e=>setExtDocForm(f=>({...f,description:e.target.value}))} rows={2} placeholder="Description du document externe…" style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 12px", color:T.text, fontSize:12, resize:"vertical", boxSizing:"border-box" }} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10 }}>
                  <div>
                    <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Processus</label>
                    <select value={extDocForm.process} onChange={e=>setExtDocForm(f=>({...f,process:e.target.value}))} style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                      <option value="ALL">Tous</option>
                      {Object.entries(CODES.processes).map(([k,v])=><option key={k} value={k}>{k} — {v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Accès min. (niveau)</label>
                    <select value={extDocForm.accessLevel} onChange={e=>setExtDocForm(f=>({...f,accessLevel:Number(e.target.value)}))} style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                      <option value={1}>1 — Tous</option>
                      <option value={2}>2 — Opérateurs+</option>
                      <option value={3}>3 — Superviseurs+</option>
                      <option value={4}>4 — Responsables+</option>
                      <option value={5}>5 — Direction+</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop:12 }}>
                  <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Fichier (PDF, DOCX, etc. — max 10 Mo)</label>
                  <div style={{ position:"relative" }}>
                    <input ref={extDocFileRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png,.txt" style={{ position:"absolute", inset:0, opacity:0, cursor:"pointer", zIndex:2, width:"100%", height:"100%" }} onChange={handleExtDocFileSelect} />
                    <div style={{ background:T.surface2, border:`2px dashed ${extDocForm.dataUrl?"#22C55E":T.border}`, borderRadius:10, padding:"16px", textAlign:"center", color:extDocForm.dataUrl?"#22C55E":T.textMuted, fontSize:12, pointerEvents:"none" }}>
                      {extDocForm.dataUrl ? `✅ ${extDocForm.fileName} (${gcFmtSize(extDocForm.fileSize)})` : "📂 Cliquer pour sélectionner un fichier"}
                    </div>
                  </div>
                  {extDocStatus && <div style={{ marginTop:5, fontSize:11, color:extDocStatus.type==="ok"?"#22C55E":extDocStatus.type==="error"?"#EF4444":"#F59E0B", fontWeight:600 }}>{extDocStatus.msg}</div>}
                </div>
                <div style={{ display:"flex", gap:10, marginTop:20 }}>
                  <Btn variant="primary" size="sm" onClick={handleSaveExtDoc}>✅ Ajouter</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => { setShowExtDocModal(false); setExtDocStatus(null); }}>Annuler</Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ONGLET COMITÉS ── */}

      {/* ── ONGLET HUB PROGRAMMES ── */}
      {procMapTab === "hub" && <HubProgrammesPanel T={T} localUser={localUser} setActiveModule={setActiveModule} />}

      {procMapTab === "comites" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <h4 style={{ color:T.text, margin:0, fontSize:13, fontWeight:700 }}>🏛️ Comités du Cabinet — Constitution & Rôles</h4>
            {canEditCommittees && (
              <div style={{ background:"#C9A84C22", border:"1px solid #C9A84C44", borderRadius:6, padding:"4px 10px", color:"#C9A84C", fontSize:10, fontWeight:600 }}>
                ✏️ Modification autorisée — Direction Générale
              </div>
            )}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {committees.map(com => {
              const responsable = users.find(u => u.id === com.responsable);
              const isEditing = editingCommittee === com.id;
              return (
                <div key={com.id} style={{ background:T.surface2, borderRadius:12, border:`2px solid ${com.color}44`, overflow:"hidden" }}>
                  {/* Committee header */}
                  <div style={{ background:com.color+"22", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <span style={{ fontSize:24 }}>{com.icon}</span>
                      <div>
                        <div style={{ color:com.color, fontWeight:900, fontSize:14 }}>{com.name}</div>
                        <div style={{ color:T.textMuted, fontSize:11, marginTop:2 }}>Périodicité : {com.periodicite}</div>
                      </div>
                    </div>
                    {canEditCommittees && (
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => { setAnnouncingCommittee(com.id); setAnnounceForm({ titre:"", message:"", priorite:"normale" }); }} style={{ background:"transparent", border:`1px solid #06B6D444`, borderRadius:6, padding:"4px 10px", color:"#06B6D4", cursor:"pointer", fontSize:11, fontWeight:600 }}>📢 Annonce</button>
                        <button onClick={() => { setEditingCommittee(com.id); setCommitteeEditForm({...com}); }} style={{ background:"transparent", border:`1px solid ${com.color}55`, borderRadius:6, padding:"4px 10px", color:com.color, cursor:"pointer", fontSize:11, fontWeight:600 }}>✏️ Modifier</button>
                      </div>
                    )}
                  </div>
                  {/* Responsable */}
                  {responsable && (
                    <div style={{ padding:"8px 16px", background:com.color+"11", borderBottom:`1px solid ${com.color}33`, display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:30,height:30,borderRadius:"50%",background:responsable.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,flexShrink:0 }}>{responsable.avatar}</div>
                      <div>
                        <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase", letterSpacing:0.8, fontWeight:700 }}>🎯 Responsable / Président</div>
                        <div style={{ color:T.text, fontSize:12, fontWeight:700 }}>{responsable.name}</div>
                        <div style={{ color:T.textMuted, fontSize:10 }}>{responsable.role}</div>
                      </div>
                    </div>
                  )}
                  {/* Role description */}
                  <div style={{ padding:"10px 16px", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase", marginBottom:4, fontWeight:700 }}>Rôle & Mission</div>
                    <div style={{ color:T.text, fontSize:12 }}>{com.role}</div>
                  </div>
                  {/* Members */}
                  <div style={{ padding:"10px 16px" }}>
                    <div style={{ color:T.textDim, fontSize:9, textTransform:"uppercase", marginBottom:8, fontWeight:700 }}>👥 Membres ({com.membres.length})</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:6 }}>
                      {com.membres.map((m, mi) => {
                        const mu = users.find(u => u.id === m.userId);
                        return (
                          <div key={mi} style={{ background:T.surface3, borderRadius:8, padding:"6px 10px", display:"flex", gap:8, alignItems:"center", border:`1px solid ${T.border}` }}>
                            {mu ? (
                              <div style={{ width:24,height:24,borderRadius:"50%",background:mu.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,flexShrink:0 }}>{mu.avatar}</div>
                            ) : (
                              <div style={{ width:24,height:24,borderRadius:"50%",background:T.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:T.textDim,fontWeight:700,flexShrink:0 }}>?</div>
                            )}
                            <div style={{ minWidth:0 }}>
                              <div style={{ color:T.text, fontSize:10, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{mu?.name || m.userId}</div>
                              <div style={{ color:T.textMuted, fontSize:9 }}>{m.fonction}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {!canEditCommittees && (
            <div style={{ marginTop:12, padding:"8px 14px", background:T.surface2, borderRadius:8, color:T.textDim, fontSize:11, textAlign:"center" }}>
              🔒 La modification des comités est réservée au Manager Général
            </div>
          )}
        </div>
      )}

      {/* ── ONGLET ORGANIGRAMME ── visible tous, modif niv4+ → validation DG/Admin */}
      {procMapTab === "organigramme" && (
        <div>
          <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:10,color:"#3B82F6",display:"flex",alignItems:"center",gap:8}}>
            <span>ℹ️</span>
            <span>Visible par tous les collaborateurs · Modifications par les Responsables niv.4+ · <strong>Validation obligatoire DG/Manager Général</strong></span>
          </div>
          <OrganigrammePanel T={T} localUser={localUser} users={users} isDG={isDG||isMG||isAdmin} />
          {/* Workflow modification organigramme — niv4+ seulement */}
          {(localUser.level >= 4) && (
            <div style={{marginTop:16,background:T.surface2,border:"1px solid #A855F733",borderRadius:10,padding:14}}>
              <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:8}}>⚙️ Modification de l'organigramme — Circuit de validation</div>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:8}}>Toute modification structurelle doit être soumise à la Direction Générale pour validation et mise en application dans le SI.</div>
              {(isDG||isMG||isAdmin) ? (
                <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:7,padding:"8px 12px",fontSize:10,color:"#22C55E"}}>
                  ✅ Vous avez les droits de validation directe (DG/Admin). Les modifications prennent effet immédiatement.
                </div>
              ) : (
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={()=>{
                    const dgUsers=(si.users||[]).filter(u=>u.level>=5&&!u.isAdmin);
                    const msg=`📋 Demande de modification organigramme soumise par ${localUser.name} (${localUser.process} · Niv.${localUser.level}) — Veuillez examiner et valider dans Processus & Hiérarchie → Organigramme.`;
                    dgUsers.forEach(u=>{ try{ const k=`GC_SI_v12:notif:${u.id}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now()+u.id,icon:"🏢",message:msg,at:new Date().toISOString(),read:false,urgent:true}); _lsSet(k,JSON.stringify(ex.slice(0,200))); }catch(_){} });
                    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📤",message:"Demande de validation organigramme envoyée à la Direction Générale",at:new Date().toISOString(),read:false},...p]);
                    if(setTaches) setTaches(prev=>[...prev,{id:"TACHE-ORG-"+Date.now(),titre:`Validation modification organigramme — ${localUser.name}`,description:`${localUser.name} (${localUser.process}) demande validation d'une modification structurelle de l'organigramme.`,assignedTo:dgUsers[0]?.id||"DG",createdBy:localUser.id,status:"EN_COURS",priority:"HAUTE",module:"processus",createdAt:new Date().toISOString()}]);
                  }} style={{background:"linear-gradient(135deg,#A855F7,#9333EA)",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                    📤 Soumettre modification pour validation DG
                  </button>
                  <span style={{color:T.textDim,fontSize:9}}>Un responsable DG/Manager recevra une tâche et notification</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ONGLET CIRCUITS DE VALIDATION ── */}
      {procMapTab === "circuits" && (
        <div>
          {/* ═══ SECTION A — NIVEAUX DE CIRCUITS ═══════════════════════════════ */}
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,paddingBottom:8,borderBottom:`2px solid ${T.border}`}}>
              <span style={{fontSize:20}}>🔄</span>
              <div>
                <div style={{color:T.text,fontWeight:900,fontSize:14}}>Niveaux de Circuits d'Approbation</div>
                <div style={{color:T.textMuted,fontSize:10}}>Classification des circuits selon leur niveau de validation requis — Visible par tous</div>
              </div>
            </div>
            {(()=>{
              const CIRCUITS_NIVEAUX = [
                {
                  id:"COURT", label:"Circuit Court", niveau:"Niveau Faible", icon:"🟢", color:"#22C55E",
                  desc:"Validation directe par le supérieur hiérarchique immédiat. Délai rapide, traitement simple.",
                  etapes:[
                    {n:1,acteur:"Initiateur (tout niveau)",action:"Soumet la demande/document à son supérieur direct",delai:"J0"},
                    {n:2,acteur:"Supérieur hiérarchique (niv.+1)",action:"Validation ou rejet avec commentaire, signature",delai:"J+1"},
                  ],
                  exemples:"Congés, demandes de matériel, notes internes, justificatifs, absences ponctuelles",
                },
                {
                  id:"MOYEN", label:"Circuit Moyen", niveau:"Niveau Intermédiaire", icon:"🟡", color:"#F59E0B",
                  desc:"Validation par les responsables opérationnels (tout processus niv.3+) + conformité P02 si requis. Sans passage obligatoire DG.",
                  etapes:[
                    {n:1,acteur:"Initiateur (niv.2+)",action:"Soumission avec pièces justificatives",delai:"J0"},
                    {n:2,acteur:"Responsable processus (niv.3+)",action:"Vérification, validation intégrité et conformité opérationnelle",delai:"J+1"},
                    {n:3,acteur:"Conformité P02 (niv.4) — si requis",action:"Contrôle réglementaire OHADA/COBAC/CEMAC si applicable",delai:"J+2"},
                  ],
                  exemples:"KYC clients, ouverture dossiers, conventions de mission, validations opérationnelles",
                },
                {
                  id:"LONG", label:"Circuit Long", niveau:"Niveau Élevé", icon:"🟠", color:"#F97316",
                  desc:"Circuit complet avec validation processus + Conformité P02 obligatoire + approbation finale DG/Manager Général (niv.5, P01).",
                  etapes:[
                    {n:1,acteur:"Initiateur (niv.2+)",action:"Soumission complète avec justificatifs",delai:"J0"},
                    {n:2,acteur:"Responsable processus (niv.4)",action:"Première validation et instruction du dossier",delai:"J+1"},
                    {n:3,acteur:"Conformité P02 (niv.4)",action:"Contrôle réglementaire obligatoire, conformité OHADA",delai:"J+2"},
                    {n:4,acteur:"DG / Manager Général (niv.5, P01)",action:"Décision finale — validation, autorisation d'exécution, signature",delai:"J+3"},
                  ],
                  exemples:"Dossiers RH sensibles, recrutements, licenciements, sanctions, engagements financiers >500k FCFA",
                },
                {
                  id:"URGENT", label:"Circuit Urgent/Express", niveau:"Décision Directe", icon:"🔴", color:"#EF4444",
                  desc:"Soumission directe au DG/Manager Général sans étape intermédiaire. Réservé aux cas exceptionnels urgents.",
                  etapes:[
                    {n:1,acteur:"Initiateur (niv.3+ minimum)",action:"Soumission directe DG avec motif d'urgence documenté",delai:"J0"},
                    {n:2,acteur:"DG / Manager Général (niv.5, P01)",action:"Décision immédiate — validation ou renvoi au circuit standard",delai:"J0"},
                  ],
                  exemples:"Crises, urgences juridiques, situations exceptionnelles, décisions stratégiques immédiates",
                },
              ];
              return (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {CIRCUITS_NIVEAUX.map(circ=>(
                    <div key={circ.id} style={{background:T.surface2,border:`2px solid ${circ.color}33`,borderRadius:12,overflow:"hidden"}}>
                      <div style={{background:`linear-gradient(135deg,${circ.color}18,${circ.color}05)`,padding:"12px 16px",borderBottom:`1px solid ${circ.color}22`,display:"flex",alignItems:"center",gap:12}}>
                        <span style={{fontSize:22,flexShrink:0}}>{circ.icon}</span>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{color:circ.color,fontWeight:900,fontSize:14}}>{circ.label}</span>
                            <span style={{background:circ.color+"22",color:circ.color,border:`1px solid ${circ.color}44`,borderRadius:12,padding:"2px 10px",fontSize:9,fontWeight:700}}>{circ.niveau}</span>
                          </div>
                          <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{circ.desc}</div>
                        </div>
                        <span style={{background:circ.color+"15",color:circ.color,border:`1px solid ${circ.color}33`,borderRadius:20,padding:"3px 12px",fontSize:9,fontWeight:700,flexShrink:0}}>{circ.etapes.length} étape{circ.etapes.length>1?"s":""}</span>
                      </div>
                      <div style={{padding:"12px 16px"}}>
                        <div style={{display:"flex",gap:0,marginBottom:10,overflowX:"auto",paddingBottom:4}}>
                          {circ.etapes.map((e,idx)=>(
                            <div key={e.n} style={{display:"flex",alignItems:"center",minWidth:0}}>
                              <div style={{textAlign:"center",flexShrink:0,minWidth:75}}>
                                <div style={{width:30,height:30,borderRadius:"50%",background:circ.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:12,margin:"0 auto 4px"}}>{e.n}</div>
                                <div style={{color:circ.color,fontSize:8,fontWeight:700,maxWidth:80,textAlign:"center",lineHeight:1.2}}>{e.acteur.split("(")[0].trim()}</div>
                                <div style={{color:T.textDim,fontSize:7,maxWidth:80,textAlign:"center",lineHeight:1.3,marginTop:2}}>{e.action.slice(0,45)}{e.action.length>45?"…":""}</div>
                                <div style={{color:T.textMuted,fontSize:7,marginTop:2,fontStyle:"italic"}}>{e.delai}</div>
                              </div>
                              {idx<circ.etapes.length-1&&<div style={{height:2,width:28,background:`linear-gradient(90deg,${circ.color}66,${circ.color}22)`,flexShrink:0,margin:"0 2px 24px",borderRadius:1}}/>}
                            </div>
                          ))}
                        </div>
                        <div style={{background:circ.color+"08",border:`1px solid ${circ.color}20`,borderRadius:7,padding:"6px 12px",fontSize:9,color:T.textMuted}}>
                          <strong style={{color:circ.color}}>Cas d'usage :</strong> {circ.exemples}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* ═══ SECTION B — SOUS-PROCESSUS & DÉLÉGATIONS ═══════════════════════ */}
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,paddingBottom:8,borderBottom:`2px solid ${T.border}`}}>
              <span style={{fontSize:20}}>🔀</span>
              <div>
                <div style={{color:T.text,fontWeight:900,fontSize:14}}>Sous-Processus & Délégations</div>
                <div style={{color:T.textMuted,fontSize:10}}>Articulation entre processus, délégations de validation et périmètres de responsabilité</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
              {[
                {
                  titre:"P01 — Management & Direction",color:"#3B82F6",icon:"⬆️",
                  items:[
                    "Pilote l'ensemble des processus P, O et S",
                    "Validation finale des circuits longs et urgents",
                    "Délègue aux responsables processus niv.4 pour circuits moyens",
                    "Accrédite les habilitations niv.4 et 5",
                  ]
                },
                {
                  titre:"P02 — Gouvernance & Conformité",color:"#8B5CF6",icon:"⚖️",
                  items:[
                    "Contrôle réglementaire OHADA pour circuits moyen et long",
                    "Délègue aux juristes O02 pour conformité opérationnelle",
                    "Validation accréditations et habilitations SI",
                    "Circuit court possible pour vérifications ponctuelles",
                  ]
                },
                {
                  titre:"O01/O02/O03 — Opérationnels",color:"#22C55E",icon:"⚙️",
                  items:[
                    "Circuits courts pour tâches internes de traitement",
                    "Circuits moyens pour KYC, dossiers clients, conventions",
                    "Peut initier un circuit long sur décision DG/MG (tout processus)",
                    "Sous-process O01→O02/O03 : transfert dossier après KYC",
                  ]
                },
                {
                  titre:"S01/S02/S03 — Support",color:"#F97316",icon:"🛠️",
                  items:[
                    "S03 (RH) : circuits courts pour gestion quotidienne",
                    "S03 (RH) : circuit long pour suspensions, licenciements → DG",
                    "S01 (Finance) : circuit moyen pour facturation, validation paiements",
                    "S02 (Audit) : rapport d'audit soumis en circuit long vers DG",
                  ]
                },
              ].map(sec=>(
                <div key={sec.titre} style={{background:T.surface2,border:`1px solid ${sec.color}33`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{fontSize:16}}>{sec.icon}</span>
                    <div style={{color:sec.color,fontWeight:800,fontSize:11}}>{sec.titre}</div>
                  </div>
                  {sec.items.map((item,i)=>(
                    <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:5,fontSize:10,color:T.textMuted,lineHeight:1.4}}>
                      <span style={{color:sec.color,flexShrink:0,marginTop:1}}>▸</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ SECTION C — CIRCUITS EN VIGUEUR ═══════════════════════════════ */}
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,paddingBottom:8,borderBottom:`2px solid ${T.border}`}}>
              <span style={{fontSize:20}}>📋</span>
              <div>
                <div style={{color:T.text,fontWeight:900,fontSize:14}}>Circuits de Validation en Vigueur</div>
                <div style={{color:T.textMuted,fontSize:10}}>Circuits officiels documentés et validés par la Direction · <strong>Modifications niv.4+ → validation DG obligatoire</strong></div>
              </div>
            </div>
            <CircuitsPanel T={T} localUser={localUser} canEdit={localUser.level>=4} setNotifications={setNotifications} users={si.users||[]} />
            {localUser.level>=4 && !(isDG||isMG||isAdmin) && (
              <div style={{marginTop:10,background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12}}>⚠️</span>
                <span style={{color:"#F59E0B",fontSize:10}}>Les modifications de circuits requièrent la validation du Manager Général ou Directeur Général avant application.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ONGLET ACCRÉDITATIONS ── */}
      {procMapTab === "accreditations" && (
        <div>
          <div style={{background:"#C41E3A11",border:"1px solid #C41E3A33",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:10,color:"#C41E3A",display:"flex",alignItems:"center",gap:8}}>
            <span>ℹ️</span>
            <span>Règles d'accréditation et niveaux d'habilitation · Visible par tous · <strong>Modifications niv.4+ → validation DG</strong></span>
          </div>
          <ReglesAccreditationsPanel T={T} localUser={localUser} users={si.users||[]} canEdit={localUser.level>=4} isAdmin={isAdmin} isDG={isDG||isMG} />
          {localUser.level>=4 && !(isDG||isMG||isAdmin) && (
            <div style={{marginTop:12,background:T.surface2,border:"1px solid #C41E3A33",borderRadius:10,padding:14}}>
              <div style={{color:"#C41E3A",fontWeight:800,fontSize:12,marginBottom:8}}>📜 Soumettre une modification des règles d'accréditation</div>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:8}}>Toute modification des niveaux ou règles d'accréditation impacte les accès dans tout le SI et doit être validée par la Direction.</div>
              <button onClick={()=>{
                const dgUsers=(si.users||[]).filter(u=>u.level>=5&&!u.isAdmin);
                const msg=`🎖️ Demande de modification des règles d'accréditation par ${localUser.name} (${localUser.process} · Niv.${localUser.level}) — À valider dans Processus → Accréditations.`;
                dgUsers.forEach(u=>{ try{ const k=`GC_SI_v12:notif:${u.id}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now()+u.id,icon:"🎖️",message:msg,at:new Date().toISOString(),read:false,urgent:true}); _lsSet(k,JSON.stringify(ex.slice(0,200))); }catch(_){} });
                setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📤",message:"Demande de validation accréditations envoyée à la Direction",at:new Date().toISOString(),read:false},...p]);
                if(setTaches) setTaches(prev=>[...prev,{id:"TACHE-ACC-"+Date.now(),titre:`Validation règles accréditation — ${localUser.name}`,description:msg,assignedTo:dgUsers[0]?.id||"DG",createdBy:localUser.id,status:"EN_COURS",priority:"HAUTE",module:"processus",createdAt:new Date().toISOString()}]);
              }} style={{background:"#C41E3A22",border:"1px solid #C41E3A44",color:"#C41E3A",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                📤 Soumettre pour validation Direction Générale
              </button>
            </div>
          )}
        </div>
      )}
      {showProcDocUpload && (
        <div style={{ position:"fixed", inset:0, background:"#000B", zIndex:4000, display:"flex", alignItems:"center", justifyContent:"center" }}
          onMouseDown={e => { if (e.target === e.currentTarget) { setShowProcDocUpload(null); setDocUploadStatus(null); } }}>
          <div onClick={e => e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:"28px 32px", width:520, maxWidth:"95vw", boxShadow:"0 24px 80px #0009", maxHeight:"90vh", overflowY:"auto" }}>
            <h3 style={{ color:"#C41E3A", margin:"0 0 16px", fontWeight:800 }}>📄 Ajouter un document interne</h3>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div style={{ gridColumn:"span 2" }}>
                <InputField label="Nom du document *" value={docUploadForm.name} onChange={e=>setDocUploadForm(f=>({...f,name:e.target.value}))} T={T} placeholder="Ex: Procédure de traitement des dossiers" />
              </div>
              <div>
                <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Processus</label>
                <select value={docUploadForm.process} onChange={e=>setDocUploadForm(f=>({...f,process:e.target.value}))} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                  {canManageDocs && <option value="ALL">Tous processus</option>}
                  {Object.entries(CODES.processes).filter(([k]) => canSeeAll || (localUser.processes||[localUser.process]).includes(k)).map(([k,v])=><option key={k} value={k}>{k} — {v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Catégorie</label>
                <select value={docUploadForm.category} onChange={e=>setDocUploadForm(f=>({...f,category:e.target.value}))} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                  {["Référentiel","Manuel","Procédure","Charte","Fiche","Rapport","Modèle","Instruction","Autre"].map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Accès minimum (niveau)</label>
                <select value={docUploadForm.accessLevel} onChange={e=>setDocUploadForm(f=>({...f,accessLevel:Number(e.target.value)}))} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                  <option value={1}>1 — Tous</option>
                  <option value={2}>2 — Opérateurs+</option>
                  <option value={3}>3 — Superviseurs+</option>
                  <option value={4}>4 — Responsables+</option>
                  <option value={5}>5 — Direction+</option>
                </select>
              </div>
              <div>
                <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Visibilité</label>
                <select value={docUploadForm.visible} onChange={e=>setDocUploadForm(f=>({...f,visible:e.target.value}))} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                  <option value="ALL">Tous les collaborateurs</option>
                  <option value="MANAGERS">Managers et Direction uniquement</option>
                </select>
              </div>
              <div style={{ gridColumn:"span 2" }}>
                <InputField label="Description / Objet" value={docUploadForm.description} onChange={e=>setDocUploadForm(f=>({...f,description:e.target.value}))} T={T} placeholder="Brève description du document…" />
              </div>
              <div style={{ gridColumn:"span 2" }}>
                <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:6, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Fichier (PDF, DOCX, XLSX, Images — max 10 Mo)</label>
                <div style={{ position:"relative" }}>
                  <input ref={intDocFileRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png,.pptx,.txt" style={{ position:"absolute", inset:0, opacity:0, cursor:"pointer", zIndex:2, width:"100%", height:"100%" }} onChange={handleIntDocFileSelect} />
                  <div style={{ background:T.surface2, border:`2px dashed ${docUploadForm.dataUrl?"#22C55E":T.border}`, borderRadius:10, padding:"20px", textAlign:"center", color:docUploadForm.dataUrl?"#22C55E":T.textMuted, fontSize:12, pointerEvents:"none", transition:"all 0.2s" }}>
                    {docUploadForm.dataUrl ? `✅ ${docUploadForm.fileName} (${gcFmtSize(docUploadForm.fileSize)})` : "📂 Cliquer pour sélectionner ou glisser-déposer (optionnel)"}
                  </div>
                </div>
                {docUploadStatus && (
                  <div style={{ marginTop:5, fontSize:11, color:docUploadStatus.type==="ok"?"#22C55E":docUploadStatus.type==="error"?"#EF4444":"#F59E0B", fontWeight:600 }}>
                    {docUploadStatus.msg}
                  </div>
                )}
                {docUploadForm.dataUrl && (
                  <button onClick={() => { setDocUploadForm(f=>({...f,dataUrl:null,fileName:null,fileSize:0})); setDocUploadStatus(null); }} style={{ marginTop:6, background:"transparent", border:"none", color:"#EF4444", fontSize:11, cursor:"pointer" }}>🗑 Retirer le fichier</button>
                )}
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button onClick={handleUploadDoc} style={{ background:"#C41E3A", border:"none", color:"#fff", borderRadius:8, padding:"10px 20px", cursor:"pointer", fontWeight:700, fontSize:13 }}>📤 Enregistrer dans le SI</button>
              <button onClick={() => { setShowProcDocUpload(null); setDocUploadStatus(null); }} style={{ background:T.surface2, border:`1px solid ${T.border}`, color:T.text, borderRadius:8, padding:"10px 16px", cursor:"pointer", fontSize:13 }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL : Modification comité ── */}
      {editingCommittee && committeeEditForm && (
        <div style={{ position:"fixed", inset:0, background:"#000B", zIndex:4000, display:"flex", alignItems:"center", justifyContent:"center" }}
          onMouseDown={e => { if (e.target === e.currentTarget) { setEditingCommittee(null); setCommitteeEditForm(null); } }}>
          <div onClick={e => e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:"28px 32px", width:560, maxWidth:"95vw", boxShadow:"0 24px 80px #0009", maxHeight:"90vh", overflowY:"auto" }}>
            <h3 style={{ color:"#C41E3A", margin:"0 0 16px", fontWeight:800 }}>✏️ Modifier le Comité — {committeeEditForm.acronym}</h3>
            <InputField label="Nom du comité" value={committeeEditForm.name} onChange={e=>setCommitteeEditForm(f=>({...f,name:e.target.value}))} T={T} />
            <div style={{ marginTop:10 }}>
              <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Rôle & Mission</label>
              <textarea value={committeeEditForm.role} onChange={e=>setCommitteeEditForm(f=>({...f,role:e.target.value}))} rows={3} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12, resize:"vertical", boxSizing:"border-box" }} />
            </div>
            <InputField label="Périodicité" value={committeeEditForm.periodicite} onChange={e=>setCommitteeEditForm(f=>({...f,periodicite:e.target.value}))} T={T} style={{ marginTop:10 }} />
            <div style={{ marginTop:10 }}>
              <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>🎯 Président / Responsable (Niv. 4 minimum)</label>
              <select value={committeeEditForm.responsable} onChange={e=>setCommitteeEditForm(f=>({...f,responsable:e.target.value}))} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                <option value="">— Sélectionner un responsable —</option>
                {users.filter(u=>_activeUser(u)&&u.level>=4&&!u.isAdmin).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role} · Niv.{u.level}</option>)}
              </select>
            </div>

            {/* Member management */}
            <div style={{ marginTop:14 }}>
              <div style={{ color:T.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600, marginBottom:8 }}>👥 Membres du comité ({committeeEditForm.membres?.length || 0}) — Niv. 3 minimum</div>
              <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:8 }}>
                {(committeeEditForm.membres || []).map((m, mi) => {
                  const mu = users.find(u=>u.id===m.userId);
                  return (
                    <div key={mi} style={{ display:"flex", alignItems:"center", gap:8, background:T.surface3, borderRadius:8, padding:"6px 10px", border:`1px solid ${T.border}` }}>
                      <div style={{ width:24,height:24,borderRadius:"50%",background:mu?.color||T.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,flexShrink:0 }}>{mu?.avatar||"?"}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ color:T.text, fontSize:11, fontWeight:600 }}>{mu?.name || m.userId}</div>
                        <input value={m.fonction} onChange={e=>{const newM=[...committeeEditForm.membres]; newM[mi]={...newM[mi],fonction:e.target.value}; setCommitteeEditForm(f=>({...f,membres:newM}));}} placeholder="Fonction dans le comité" style={{ background:"transparent", border:"none", borderBottom:`1px solid ${T.border}`, color:T.textMuted, fontSize:10, width:"100%", outline:"none", padding:"1px 0" }} />
                      </div>
                      <button onClick={()=>{const newM=committeeEditForm.membres.filter((_,i)=>i!==mi); setCommitteeEditForm(f=>({...f,membres:newM}));}} style={{ background:"#C41E3A22", border:"1px solid #C41E3A44", borderRadius:5, padding:"2px 7px", color:"#C41E3A", cursor:"pointer", fontSize:11, flexShrink:0 }}>✕</button>
                    </div>
                  );
                })}
              </div>
              {/* Add member — React-controlled */}
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <select value={newMemberSelectId} onChange={e=>setNewMemberSelectId(e.target.value)} style={{ flex:1, background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"7px 10px", color:T.text, fontSize:11 }}>
                  <option value="">— Sélectionner un membre à ajouter —</option>
                  {users.filter(u=>_activeUser(u)&&u.level>=3&&!u.isAdmin&&!(committeeEditForm.membres||[]).some(m=>m.userId===u.id)).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role} (Niv.{u.level})</option>)}
                </select>
                <button type="button" onClick={()=>{
                  if(!newMemberSelectId) return;
                  const newM=[...(committeeEditForm.membres||[]),{userId:newMemberSelectId,fonction:"Membre"}];
                  setCommitteeEditForm(f=>({...f,membres:newM}));
                  setNewMemberSelectId("");
                }} style={{ background:"#22C55E22", border:"1px solid #22C55E44", borderRadius:8, padding:"7px 12px", color:"#22C55E", cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>+ Ajouter</button>
              </div>
            </div>

            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button onClick={handleSaveCommittee} style={{ background:"#C41E3A", border:"none", color:"#fff", borderRadius:8, padding:"10px 20px", cursor:"pointer", fontWeight:700, fontSize:13 }}>💾 Enregistrer</button>
              <button onClick={() => { setEditingCommittee(null); setCommitteeEditForm(null); }} style={{ background:T.surface2, border:`1px solid ${T.border}`, color:T.text, borderRadius:8, padding:"10px 16px", cursor:"pointer", fontSize:13 }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL : Annonce comité ── */}
      {announcingCommittee && (
        <div style={{ position:"fixed", inset:0, background:"#000B", zIndex:4000, display:"flex", alignItems:"center", justifyContent:"center" }}
          onMouseDown={e => { if (e.target === e.currentTarget) { setAnnouncingCommittee(null); } }}>
          <div onClick={e => e.stopPropagation()} style={{ background:T.surface, border:`1px solid #06B6D444`, borderRadius:16, padding:"28px 32px", width:500, maxWidth:"95vw", boxShadow:"0 24px 80px #0009", maxHeight:"90vh", overflowY:"auto" }}>
            <h3 style={{ color:"#06B6D4", margin:"0 0 16px", fontWeight:800 }}>📢 Publier une annonce — {committees.find(c=>c.id===announcingCommittee)?.name}</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div>
                <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Niveau de priorité</label>
                <div style={{ display:"flex", gap:6 }}>
                  {[["normale","🔵 Normale"],["haute","⚠️ Haute"],["urgente","🚨 Urgente"]].map(([p,l])=>(
                    <button key={p} onClick={()=>setAnnounceForm(f=>({...f,priorite:p}))} style={{ flex:1, padding:"7px 6px", background:announceForm.priorite===p?(p==="urgente"?"#C41E3A":p==="haute"?"#F59E0B":"#06B6D4"):"transparent", color:announceForm.priorite===p?"#fff":T.textMuted, border:`1px solid ${announceForm.priorite===p?(p==="urgente"?"#C41E3A":p==="haute"?"#F59E0B":"#06B6D4"):T.border}`, borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:11 }}>{l}</button>
                  ))}
                </div>
              </div>
              <InputField label="Titre / Objet (facultatif)" value={announceForm.titre} onChange={e=>setAnnounceForm(f=>({...f,titre:e.target.value}))} T={T} placeholder="Ex: Réunion mensuelle reportée..." />
              <div>
                <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Message *</label>
                <textarea value={announceForm.message} onChange={e=>setAnnounceForm(f=>({...f,message:e.target.value}))} rows={4} placeholder="Saisir le message de l'annonce à publier aux membres du comité…" style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12, resize:"vertical", boxSizing:"border-box" }} />
              </div>
              <div style={{ color:T.textMuted, fontSize:11, background:T.surface2, borderRadius:8, padding:"8px 12px" }}>
                📨 Cette annonce sera notifiée aux <strong style={{color:T.text}}>{committees.find(c=>c.id===announcingCommittee)?.membres?.length || 0} membres</strong> du comité.
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button onClick={handlePublishAnnouncement} style={{ background:"#06B6D4", border:"none", color:"#fff", borderRadius:8, padding:"10px 20px", cursor:"pointer", fontWeight:700, fontSize:13 }}>📢 Publier l'annonce</button>
              <button onClick={() => setAnnouncingCommittee(null)} style={{ background:T.surface2, border:`1px solid ${T.border}`, color:T.text, borderRadius:8, padding:"10px 16px", cursor:"pointer", fontSize:13 }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL : Demande de suspension (niv4 responsable processus) */}
      {showSuspendReqModal && (
        <div style={{position:"fixed",inset:0,background:"#000B",zIndex:5000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onMouseDown={e=>{if(e.target===e.currentTarget){setShowSuspendReqModal(null);setSuspReqMotif("");setSuspReqFile(null);}}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:"2px solid #F59E0B55",borderRadius:16,padding:"24px 28px",width:"min(460px,94vw)",boxShadow:"0 24px 80px #0009"}}>
            <h4 style={{color:"#F59E0B",margin:"0 0 14px",fontSize:14,fontWeight:800}}>⏸️ Demande de suspension</h4>
            <div style={{background:T.surface2,borderRadius:8,padding:"8px 12px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:showSuspendReqModal.color||"#F59E0B",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:14,flexShrink:0}}>{showSuspendReqModal.avatar||showSuspendReqModal.name?.charAt(0)}</div>
              <div>
                <div style={{color:T.text,fontWeight:700,fontSize:13}}>{showSuspendReqModal.name}</div>
                <div style={{color:T.textMuted,fontSize:10}}>{showSuspendReqModal.role} · {showSuspendReqModal.process} · Niv.{showSuspendReqModal.level}</div>
              </div>
            </div>
            <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",color:"#3B82F6",fontSize:10,marginBottom:10}}>
              📋 Circuit : <strong>RH → Conformité → DG</strong> — Toutes les pièces jointes seront transmises.
            </div>
            <div style={{marginBottom:10}}>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4,fontWeight:700,textTransform:"uppercase"}}>Motif *</label>
              <textarea value={suspReqMotif} onChange={e=>setSuspReqMotif(e.target.value)} rows={3}
                placeholder="Décrivez précisément le motif de la demande de suspension…"
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,resize:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4,fontWeight:700,textTransform:"uppercase"}}>📎 Pièce justificative (optionnel)</label>
              <input type="file" onChange={e=>{
                const fi=e.target.files?.[0]; if(!fi) return;
                _uploadFiles([fi], { module: 'dashboard' }).then(([ref])=>{ if(ref) setSuspReqFile({name:ref.nom||fi.name,size:fi.size,dataUrl:ref?.dataUrl||ref?.path||null}).catch(err => console.error('[ProcessusMap] upload:', err));
                }); e.target.value="";
              }} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 8px",color:T.text,fontSize:11}} />
              {suspReqFile && <div style={{color:"#22C55E",fontSize:10,marginTop:3}}>📎 {suspReqFile.name}</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>handleRequestSuspension(showSuspendReqModal)}
                style={{flex:1,background:"linear-gradient(135deg,#F97316,#EA580C)",border:"none",color:"#fff",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                📤 Soumettre au circuit RH→Conf→DG
              </button>
              <button onClick={()=>{setShowSuspendReqModal(null);setSuspReqMotif("");setSuspReqFile(null);}}
                style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}); // React.memo — ProcessusMap


export function OrganigrammePanel({ T, localUser, users=[], isDG=false }) {
  const [orgView, setOrgView] = React.useState("hierarchique");
  const LEVEL_COLORS = {6:"#C41E3A",5:"#C9A84C",4:"#A855F7",3:"#3B82F6",2:"#22C55E",1:"#6B7280"};
  const LEVEL_LABELS = {6:"Direction SI",5:"Direction Générale",4:"Responsable",3:"Opérateur Confirmé",2:"Opérateur Standard",1:"Stagiaire/Assistant"};
  const PROC_COLORS = {"O01":"#F97316","O02":"#C41E3A","O03":"#22C55E","P01":"#3B82F6","P02":"#8B5CF6","P03":"#0F766E","P04":"#0369A1","S01":"#15803D","S02":"#D97706","S03":"#BE185D","S04":"#EC4899","S05":"#78716C","S06":"#57534E"};
  const PROC_NAMES = {"O01":"Exéc. Administratif","O02":"Juridique & Conseil","O03":"Gestion & Évaluation","P01":"Management","P02":"Conformité","P03":"Contrôle Gestion","P04":"Veille Stratégique","S01":"Finance","S02":"Audit","S03":"RH","S04":"Communication","S05":"Relations Ext.","S06":"Entretien"};

  const activeUsers = users.filter(u=>_activeUser(u)&&(u.accountStatus||"ACTIF")==="ACTIF"&&!u.blocked);

  const renderHierarchique = () => {
    const byLevel = [5,4,3,2,1].map(lvl=>({lvl,users:activeUsers.filter(u=>u.level===lvl),label:LEVEL_LABELS[lvl]||`Niveau ${lvl}`,color:LEVEL_COLORS[lvl]||"#6B7280"})).filter(g=>g.users.length>0);
    return(
      <div>
        <div style={{background:`linear-gradient(135deg,${T.surface2},${T.surface3})`,border:`1px solid ${T.border}`,borderRadius:12,padding:14,marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:20,marginBottom:4}}>⚖️</div>
          <div style={{color:T.text,fontWeight:900,fontSize:13}}>GÉNIE CONSULTANT</div>
          <div style={{color:T.textMuted,fontSize:10}}>Cabinet Juridique, d'Affaires & de Conseil — Libreville, Gabon</div>
        </div>
        {byLevel.map(g=>(
          <div key={g.lvl} style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{height:2,flex:1,background:g.color+"33"}}/>
              <span style={{background:g.color+"22",color:g.color,border:`1px solid ${g.color}44`,borderRadius:20,padding:"3px 12px",fontSize:10,fontWeight:700,flexShrink:0}}>
                Niv.{g.lvl} — {g.label} ({g.users.length})
              </span>
              <div style={{height:2,flex:1,background:g.color+"33"}}/>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
              {g.users.map(u=>(
                <div key={u.id} style={{background:T.surface,border:`2px solid ${g.color}33`,borderRadius:10,padding:"8px 12px",textAlign:"center",minWidth:100,maxWidth:140}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:u.color||g.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700,margin:"0 auto 5px",overflow:"hidden"}}>
                    {u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar||u.name?.[0]||"?"}
                  </div>
                  <div style={{color:T.text,fontSize:10,fontWeight:700,lineHeight:1.2}}>{u.name}</div>
                  <div style={{color:T.textMuted,fontSize:9,marginTop:2}}>{u.role||"—"}</div>
                  <div style={{marginTop:3}}>
                    <span style={{background:PROC_COLORS[u.process]+"22",color:PROC_COLORS[u.process]||"#6B7280",border:`1px solid ${PROC_COLORS[u.process]||"#6B7280"}44`,borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{u.process||"—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderFonctionnel = () => {
    const procs = [...new Set(activeUsers.map(u=>u.process||"—").filter(Boolean))].sort();
    return(
      <div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
          {procs.map(proc=>{
            const procUsers = activeUsers.filter(u=>u.process===proc||(u.processes||[]).includes(proc));
            const resp = procUsers.filter(u=>u.level>=4).sort((a,b)=>b.level-a.level)[0];
            const collabs = procUsers.filter(u=>u.level<4);
            const pc = PROC_COLORS[proc]||"#6B7280";
            return(
              <div key={proc} style={{background:T.surface,border:`2px solid ${pc}33`,borderRadius:10,overflow:"hidden"}}>
                <div style={{background:`linear-gradient(135deg,${pc}22,${pc}11)`,padding:"10px 12px",borderBottom:`1px solid ${pc}33`}}>
                  <div style={{color:pc,fontWeight:900,fontSize:12}}>{proc}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>{PROC_NAMES[proc]||proc} — {procUsers.length} pers.</div>
                </div>
                <div style={{padding:"8px 12px"}}>
                  {resp&&(
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,background:pc+"11",borderRadius:6,padding:"4px 7px"}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:resp.color||pc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,flexShrink:0}}>
                        {resp.avatar||resp.name?.[0]||"?"}
                      </div>
                      <div style={{minWidth:0}}>
                        <div style={{color:pc,fontSize:10,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{resp.name}</div>
                        <div style={{color:T.textDim,fontSize:8}}>Responsable Niv.{resp.level}</div>
                      </div>
                    </div>
                  )}
                  {collabs.slice(0,4).map(u=>(
                    <div key={u.id} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                      <div style={{width:14,height:14,borderRadius:"50%",background:u.color||"#6B7280",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff",flexShrink:0}}>{u.avatar||u.name?.[0]||"?"}</div>
                      <span style={{color:T.textMuted,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</span>
                      <span style={{color:T.textDim,fontSize:8,flexShrink:0}}>Niv.{u.level}</span>
                    </div>
                  ))}
                  {collabs.length>4&&<div style={{color:T.textDim,fontSize:9,marginTop:2}}>+{collabs.length-4} autres</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStructurel = () => {
    const sections_org = [
      {label:"DIRECTION GÉNÉRALE",color:"#C9A84C",icon:"🏛️",procs:["P01","P02","P03","P04"],desc:"Pilotage stratégique, conformité, contrôle de gestion, veille"},
      {label:"OPÉRATIONS",color:"#C41E3A",icon:"⚙️",procs:["O01","O02","O03"],desc:"Activités génératrices de CA — Accueil, Juridique, Gestion"},
      {label:"SUPPORT",color:"#3B82F6",icon:"🛠️",procs:["S01","S02","S03","S04","S05","S06"],desc:"Fonctions support — Finance, Audit, RH, Communication, Logistique"},
    ];
    return(
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {sections_org.map(sec=>{
          const secUsers = activeUsers.filter(u=>sec.procs.some(p=>u.process===p||(u.processes||[]).includes(p)));
          return(
            <div key={sec.label} style={{background:T.surface,border:`2px solid ${sec.color}33`,borderRadius:12,overflow:"hidden"}}>
              <div style={{background:`linear-gradient(135deg,${sec.color}22,${sec.color}11)`,padding:"10px 14px",borderBottom:`1px solid ${sec.color}33`,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>{sec.icon}</span>
                <div>
                  <div style={{color:sec.color,fontWeight:900,fontSize:12}}>{sec.label}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>{sec.desc}</div>
                </div>
                <span style={{marginLeft:"auto",background:sec.color+"22",color:sec.color,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{secUsers.length} pers.</span>
              </div>
              <div style={{padding:"10px 14px",display:"flex",flexWrap:"wrap",gap:6}}>
                {sec.procs.map(proc=>{
                  const pu=activeUsers.filter(u=>u.process===proc||(u.processes||[]).includes(proc));
                  if(pu.length===0)return null;
                  const pc=PROC_COLORS[proc]||"#6B7280";
                  return(
                    <div key={proc} style={{background:pc+"11",border:`1px solid ${pc}33`,borderRadius:8,padding:"6px 10px",minWidth:100}}>
                      <div style={{color:pc,fontWeight:700,fontSize:10}}>{proc} — {PROC_NAMES[proc]||proc}</div>
                      <div style={{color:T.textMuted,fontSize:9,marginTop:2}}>{pu.length} collaborateur(s)</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Trombinoscope supprimé (doublon de Collaborateurs — v123)

  return(
    <div>
      <div style={{marginBottom:14}}>
        <div style={{color:T.text,fontWeight:900,fontSize:14,marginBottom:2}}>🏢 Organigramme du Cabinet</div>
        <div style={{color:T.textMuted,fontSize:11}}>{activeUsers.length} collaborateur(s) actif(s) · 3 vues disponibles</div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[["hierarchique","📊 Hiérarchique"],["fonctionnel","🏷️ Fonctionnel"],["structurel","🏢 Structurel"]].map(([k,l])=>(
          <button key={k} onClick={()=>setOrgView(k)}
            style={{flex:1,minWidth:80,background:orgView===k?"#0A1E4A":"transparent",border:`1px solid ${orgView===k?"#0A1E4A":T.border}`,color:orgView===k?"#fff":T.textMuted,borderRadius:8,padding:"8px",cursor:"pointer",fontWeight:orgView===k?700:400,fontSize:11}}>
            {l}
          </button>
        ))}
      </div>
      {orgView==="hierarchique"&&renderHierarchique()}
      {orgView==="fonctionnel"&&renderFonctionnel()}
      {orgView==="structurel"&&renderStructurel()}
    </div>
  );
}



export function ReglesAccreditationsPanel({ T, localUser, users=[], canEdit=false, isAdmin=false, isDG=false }) {
  const [ruleTab, setRuleTab] = React.useState("niveaux");
  const NIVEAUX = [
    {n:6,label:"Superviseur SI",icon:"⚙️",color:"#C41E3A",
     droits:["Accès total système","Réinitialisation SI","Gestion comptes techniques","Config IA et API","Paramétrage global"],
     restrictions:["Aucune restriction technique"],
     processus:"Tous"},
    {n:5,label:"Directeur Général / Manager Général",icon:"🏛️",color:"#C9A84C",
     droits:["Accès total fonctionnel","Validation finale approbations","Clôture dossiers stratégiques","Activation comptes collaborateurs","Signature électronique niv5","Vue 360° toutes données"],
     restrictions:["Paramétrage technique réservé Admin"],
     processus:"Tous"},
    {n:4,label:"Responsable de Processus",icon:"👑",color:"#A855F7",
     droits:["CRUD complet son processus","Lecture tous dossiers","Validation/rejet dossiers","Suspension collaborateurs (circuit)","Assignation tâches et collaborateurs","Accès apps métier autorisées"],
     restrictions:["Pas d'accès admin système","Validation DG requise sur décisions critiques"],
     processus:"Son processus principal"},
    {n:3,label:"Opérateur Confirmé",icon:"🎓",color:"#3B82F6",
     droits:["Son processus + dossiers assignés","Transfert de dossiers","Soumission pour validation","Création dossiers externes (O01)","Accès rapport d'activité","Facturation (si habilité)"],
     restrictions:["Pas d'accès niv4+ (validation, suspension)","Anti-doublon actif"],
     processus:"Son processus"},
    {n:2,label:"Opérateur Standard",icon:"👤",color:"#22C55E",
     droits:["Ses dossiers uniquement","Créer dossiers INTERNES","Soumission au responsable","Accès apps bureau standard"],
     restrictions:["Pas de création dossiers EXTERNES","Anti-doublon strict","Pas d'accès données financières complètes"],
     processus:"Son processus uniquement"},
    {n:1,label:"Stagiaire / Assistant",icon:"🎯",color:"#6B7280",
     droits:["Lecture seule sur dossiers assignés","Accès bureau de base","Demandes internes"],
     restrictions:["Aucune création ni modification","Accès très limité"],
     processus:"Limité"},
  ];
  const HABILITATIONS = [
    {app:"Finance & Comptabilité S01",proc:["S01","P03","O01"],minLevel:2,icon:"💰",desc:"Journal OHADA, bilan, TVA, facturation — Accès contrôlé par processus"},
    {app:"Juridique & OHADA O02",proc:["O02","P02"],minLevel:2,icon:"⚖️",desc:"Actes, contrats, procédures, registres — Processus O02 et P02 uniquement"},
    {app:"Conseil & Stratégie",proc:["P01","P02","P03","P04","O03"],minLevel:3,icon:"🎯",desc:"Matrices stratégiques — Niveau 3+ et processus pilotage/O03"},
    {app:"SIRH — Ressources Humaines",proc:["S03"],minLevel:2,icon:"👥",desc:"Présences, paie, congés — S03 et DG uniquement"},
    {app:"Audit & Contrôle S02",proc:["S02","O03"],minLevel:2,icon:"🔍",desc:"Matrices risques, checklists — S02 et auditeurs O03"},
    {app:"Conformité P02",proc:["P02","S02"],minLevel:2,icon:"🛡️",desc:"Obligations légales, alertes OHADA/COBAC — P02 et S02"},
    {app:"Facturation & Honoraires",proc:["S01","O01","O02","O03"],minLevel:3,icon:"💰",desc:"Émission notes d'honoraires — Niveau 3+ et processus métier"},
    {app:"Conventions de Mission",proc:["O01","O02","O03"],minLevel:3,icon:"📜",desc:"Lettres de mission — Processus opérationnels et niv3+"},
    {app:"Rapport d'Activité",proc:[],minLevel:2,icon:"📊",desc:"Génération rapports — Niveau 2+ (périmètre limité par niveau)"},
    {app:"Logistique & Moyens Généraux",proc:["S05","S06"],minLevel:1,icon:"🚚",desc:"Achats, stocks, équipements — Tous utilisateurs (données filtrées)"},
  ];
  const REGLES_DOSSIERS = [
    {r:"Création dossier EXTERNE",cond:"O01 tous niveaux, ou Niv3+ tout processus",color:"#22C55E"},
    {r:"Création dossier INTERNE",cond:"Tout collaborateur (Niv1+)",color:"#3B82F6"},
    {r:"Anti-doublon dossiers",cond:"Niv2 : même objet + processus actif → bloqué",color:"#F59E0B"},
    {r:"Lecture dossier",cond:"Niv4+ : tous dossiers. Niv3 : son processus + assignés. Niv1-2 : ses dossiers",color:"#6B7280"},
    {r:"Modification dossier",cond:"Propriétaire (créateur ou assigné) + Niv4+ + Admin",color:"#A855F7"},
    {r:"Validation/Approbation",cond:"Niv4+ sur son processus, Niv5+ sur tous",color:"#C9A84C"},
    {r:"Rejet de dossier",cond:"Niv4+ obligatoire avec motif (note de rejet)",color:"#EF4444"},
    {r:"Clôture (TERMINE)",cond:"Niv5+ Signer&Clôturer. Niv4 : workflow validation. Admin : direct",color:"#C41E3A"},
    {r:"Archivage",cond:"Propriétaire + Niv4+ + O01 (dossiers TERMINE uniquement)",color:"#64748B"},
    {r:"Suppression",cond:"Circuit approbation requis Niv1-3. Direct si Niv4+ et auteur",color:"#EF4444"},
    {r:"Dossier confidentiel",cond:"Création : Niv4+ uniquement. Lecture : accès explicite par créateur",color:"#C41E3A"},
  ];

  return(
    <div>
      <div style={{marginBottom:14}}>
        <div style={{color:T.text,fontWeight:900,fontSize:14,marginBottom:2}}>📜 Règles & Accréditations</div>
        <div style={{color:T.textMuted,fontSize:11}}>Niveaux d'accès, droits d'usage et habilitations — Configuration officielle du SI</div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[["niveaux","🏅 Niveaux d'accès"],["habilitations","🔓 Habilitations Apps"],["dossiers","📁 Droits Dossiers"],["signatures","✍️ Droits Signatures"]].map(([k,l])=>(
          <button key={k} onClick={()=>setRuleTab(k)}
            style={{background:ruleTab===k?"#0A1E4A":"transparent",border:`1px solid ${ruleTab===k?"#0A1E4A":T.border}`,color:ruleTab===k?"#fff":T.textMuted,borderRadius:8,padding:"7px 12px",cursor:"pointer",fontWeight:ruleTab===k?700:400,fontSize:11}}>
            {l}
          </button>
        ))}
      </div>

      {ruleTab==="niveaux"&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {NIVEAUX.map(niv=>(
            <div key={niv.n} style={{background:T.surface,border:`2px solid ${niv.color}33`,borderRadius:10,overflow:"hidden"}}>
              <div style={{background:`linear-gradient(135deg,${niv.color}22,${niv.color}11)`,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:38,height:38,borderRadius:8,background:niv.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{niv.icon}</div>
                <div style={{flex:1}}>
                  <div style={{color:niv.color,fontWeight:900,fontSize:12}}>Niveau {niv.n} — {niv.label}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>Processus : {niv.processus}</div>
                </div>
                <span style={{color:T.textDim,fontSize:10,background:T.surface,borderRadius:5,padding:"2px 8px"}}>{users.filter(u=>_activeUser(u)&&u.level===niv.n&&(u.accountStatus||"ACTIF")==="ACTIF").length} utilisateur(s)</span>
              </div>
              <div style={{padding:"8px 14px 12px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{color:"#22C55E",fontWeight:700,fontSize:10,textTransform:"uppercase",marginBottom:5}}>✅ Droits accordés</div>
                  {niv.droits.map((d,i)=><div key={i} style={{color:T.text,fontSize:10,marginBottom:3,display:"flex",gap:5}}><span style={{color:"#22C55E",flexShrink:0}}>•</span>{d}</div>)}
                </div>
                <div>
                  <div style={{color:"#EF4444",fontWeight:700,fontSize:10,textTransform:"uppercase",marginBottom:5}}>🚫 Restrictions</div>
                  {niv.restrictions.map((r,i)=><div key={i} style={{color:T.textMuted,fontSize:10,marginBottom:3,display:"flex",gap:5}}><span style={{color:"#EF4444",flexShrink:0}}>•</span>{r}</div>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ruleTab==="habilitations"&&(
        <div>
          <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#3B82F6"}}>
            📋 Les habilitations permanentes sont gérées par le Manager Général dans <strong>Gestion des Accès</strong>. Des codes provisoires peuvent être émis par l'Direction SI.
          </div>
          {HABILITATIONS.map((h,i)=>(
            <div key={i} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",marginBottom:6,display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:20,flexShrink:0}}>{h.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:T.text,fontWeight:700,fontSize:11}}>{h.app}</div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{h.desc}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{color:"#F59E0B",fontWeight:700,fontSize:10}}>Niv.{h.minLevel}+</div>
                {h.proc.length>0&&<div style={{color:T.textDim,fontSize:9}}>{h.proc.join(", ")}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {ruleTab==="dossiers"&&(
        <div>
          <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#C9A84C"}}>
            ⚖️ Règles de gestion documentaire — SYSCOHADA & Politique interne Génie Consultant
          </div>
          {REGLES_DOSSIERS.map((r,i)=>(
            <div key={i} style={{background:T.surface,border:`1px solid ${r.color}22`,borderRadius:7,padding:"8px 12px",marginBottom:5,display:"flex",gap:10,alignItems:"center",borderLeft:`3px solid ${r.color}`}}>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:700,fontSize:11}}>{r.r}</div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{r.cond}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ruleTab==="signatures"&&(
        <div>
          <div style={{background:"#8B5CF611",border:"1px solid #8B5CF633",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#8B5CF6"}}>
            ✍️ La signature numérique par PIN est horodatée et tracée. Elle vaut acceptation et engagement du signataire.
          </div>
          {[
            {rule:"Signature dossier (ATTENTE_SIGNATURE → TERMINE)",who:"Niv5+ (DG) uniquement",color:"#C9A84C"},
            {rule:"Signature note d'honoraires",who:"Niv4+ ou habilitation S01/O01",color:"#22C55E"},
            {rule:"Signature convention de mission",who:"Niv4+ ou habilitation O01/O02/O03",color:"#3B82F6"},
            {rule:"Validation KYC O01 (étape 1/3)",who:"O01 Niv3+ uniquement",color:"#F97316"},
            {rule:"Validation KYC Conformité (étape 2/3)",who:"P02 Niv4+ uniquement",color:"#8B5CF6"},
            {rule:"Approbation finale KYC (étape 3/3)",who:"DG/MG Niv5+",color:"#C41E3A"},
            {rule:"Approbation comptes collaborateurs",who:"Circuit RH→P02→DG obligatoire",color:"#A855F7"},
            {rule:"Clôture dossier (Admin direct)",who:"Niv6 — action irréversible",color:"#EF4444"},
          ].map((r,i)=>(
            <div key={i} style={{background:T.surface,border:`1px solid ${r.color}22`,borderRadius:7,padding:"8px 12px",marginBottom:5,borderLeft:`3px solid ${r.color}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:T.text,fontSize:11,fontWeight:600}}>{r.rule}</div>
              <div style={{color:r.color,fontWeight:700,fontSize:10,flexShrink:0,marginLeft:10,textAlign:"right"}}>{r.who}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


