import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// GestionComptesPanel.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _lsRm, _noop, _tDone, _tActive, formatDate, generateAccessCode, gcFileSave, _activeUser, gcViewDoc, formatDateTime, getProcColor, _gcCachedIp, _GC_MEM, gcDownloadDoc, playSound, gcHashPassword, dsSave, dsSaveUsersWithPrune, gcNormalizeUser, gcNormalizeUserProcess } from '../../core/index.js';
import { gcToast } from '../../components/ToastManager.jsx';
import { STATUS_CONFIG, USER_FUNCTIONS, SUSPENSION_CAUSES, ACCOUNT_STATUS_CONFIG, CODES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, ProgressBar, UserAvatar} from '../../components/UI.jsx';

export const AdminCodeEditor = ({T, setNotifications, siLogoUrl, setSiLogoUrl, siAppearance, setSiAppearance, siCSSOverrides, setSiCSSOverrides, users, setUsers, dossiers, setDossiers, taches, setTaches, rdvs, setRdvs, pendingApprovals, setPendingApprovals, localUser}) => {
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'admin',
          nom: file.name, taille: file.size, type: file.type,
          uploadedBy: localUser?.id, uploadedByName: localUser?.name,
          ...extraMeta});
        results.push({
          ...ref, name: file.name, size: file.size, mimeType: file.type,
          sizeStr: file.size < 1048576 ? `${Math.round(file.size/1024)} Ko` : `${(file.size/1048576).toFixed(1)} Mo`,
          ext: '.' + file.name.split('.').pop().toLowerCase(),
          uploadedAt: new Date().toISOString(), downloads: 0});
      } catch(e) { console.error('[upload admin]', file.name, e.message); }
    }
    return results;
  };
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [activeTab, setActiveTab] = useState("commandes");
  const [saveMsg, setSaveMsg] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const codeFont = "'Courier New', Consolas, 'Fira Code', monospace";
  const [cssOverrideDraft, setCssOverrideDraft] = useState(siCSSOverrides || "");
  const logoInputRef = useRef(null);
  const [localApp, setLocalApp] = useState({ ...siAppearance });
  const [logoPreview, setLogoPreview] = useState(siLogoUrl);

  const [siSource, setSiSource] = useState(() => {
    try { return _lsGet("gc-si-source") || "// Source du SI non encore chargée.\n// Utilisez 'Charger le fichier source' pour importer le JSX actuel.\n"; }
    catch (_) { return ""; }
  });
  const [siSourceModified, setSiSourceModified] = useState(false);
  const [siSearchTerm, setSiSearchTerm] = useState("");
  const [siReplaceTerm, setSiReplaceTerm] = useState("");
  const [siLineCount, setSiLineCount] = useState(0);
  const siEditorRef = useRef(null);
  useEffect(() => { setSiLineCount(siSource.split("\n").length); }, [siSource]);

  const [termHistory, setTermHistory] = useState([
    { type:"system", text:"GénieConsultant SI — Terminal Interne v27.0" },
    { type:"system", text:"Cabinet Juridique & d'Affaires — Libreville, Gabon" },
    { type:"system", text:"Tapez 'help' pour voir les commandes disponibles." },
    { type:"prompt", text:"" },
  ]);
  const [termInput, setTermInput] = useState("");
  const [termCmdHistory, setTermCmdHistory] = useState([]);
  const [termCmdIdx, setTermCmdIdx] = useState(-1);
  const termRef = useRef(null);
  const termInputRef = useRef(null);

  const [aiMessages, setAiMessages] = useState([
    { role:"assistant", content:"👋 Bonjour ! Je suis votre assistant IA intégré au SI Génie Consultant.\n\nJe peux vous aider à :\n• **Écrire du code React/JSX** pour étendre le SI\n• **Corriger des bugs** et anomalies détectées\n• **Expliquer** le fonctionnement de composants\n• **Générer des composants** complets\n• **Optimiser** des fonctions existantes\n\nQue souhaitez-vous améliorer aujourd'hui ?" }
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiChatRef = useRef(null);
  const [aiContext, setAiContext] = useState("general");

  const [cmdCategory, setCmdCategory] = useState("users");
  const [cmdResult, setCmdResult] = useState(null);
  const [cmdJson, setCmdJson] = useState("");
  const [cmdLog, setCmdLog] = useState([]);

  useEffect(() => { if (aiChatRef.current) aiChatRef.current.scrollTop = aiChatRef.current.scrollHeight; }, [aiMessages]);
  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }, [termHistory]);

  const notify = (msg) => {
    setSaveMsg(msg);
    if (setNotifications) setNotifications(prev => [{ id:"N"+Date.now(), icon:"🎨", message: msg, at: new Date().toISOString(), read: false }, ...prev]);
    setTimeout(() => setSaveMsg(""), 3500);
  };

  const addCmdLog = (type, text) => setCmdLog(prev => [{id:Date.now(),type,text,at:new Date().toLocaleTimeString("fr-FR")},...prev].slice(0,50));

  const MIME_MAP = {
    csv:  { mime:"text/csv;charset=utf-8;",       ext:".csv" },
    json: { mime:"application/json",               ext:".json" },
    jsx:  { mime:"text/javascript",                ext:".jsx" },
    js:   { mime:"text/javascript",                ext:".js" },
    html: { mime:"text/html;charset=utf-8;",       ext:".html" },
    txt:  { mime:"text/plain;charset=utf-8;",      ext:".txt" },
    md:   { mime:"text/markdown;charset=utf-8;",   ext:".md" },
    pdf:  { mime:"application/pdf",                ext:".pdf" },
    xml:  { mime:"application/xml",                ext:".xml" },
    zip:  { mime:"application/zip",                ext:".zip" }};

  const gcDownload = (content, baseName, type) => {
    const {mime, ext} = MIME_MAP[type] || MIME_MAP.txt;
    const fileName = baseName.endsWith(ext) ? baseName : baseName + ext;
    const isUint8 = content instanceof Uint8Array;
    const blob = isUint8 ? new Blob([content], {type:mime}) : new Blob([content], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    notify(`⬇️ Téléchargé : ${fileName}`);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { gcAlert("Fichier invalide."); return; }
    gcFileSave(file, { module: "admin", type: "image", nom: file.name, taille: file.size }).then(ref => setLogoPreview(ref.dataUrl || ref.path || "")).catch(err => console.error("[Admin] logo upload:", err));
  };
  const handleApplyLogo = () => { if (logoPreview && setSiLogoUrl) { setSiLogoUrl(logoPreview); notify("✅ Logo mis à jour"); } };
  const handleRemoveLogo = () => { setLogoPreview(null); if (setSiLogoUrl) { setSiLogoUrl(null); notify("🗑️ Logo supprimé"); } };

  const handleSaveAppearance = () => { if (setSiAppearance) setSiAppearance(localApp); notify("✅ Apparence appliquée en temps réel"); };
  const handleResetAppearance = () => {
    const d = { primaryColor:"#C41E3A", navyColor:"#0A1E4A", goldColor:"#C9A84C", accentColor:"#3B82F6", cabinetName:"GÉNIE CONSULTANT", cabinetSlogan:"Excellence · Intégrité · Performance", loginSubtitle:"Système d'Information Intégré", coverBg:"navy", fontScale:1 };
    setLocalApp(d); if (setSiAppearance) setSiAppearance(d); notify("🔄 Réinitialisé");
  };

  const handleApplyCSS = () => { if (setSiCSSOverrides) setSiCSSOverrides(cssOverrideDraft); notify("✅ CSS personnalisé appliqué"); };
  const handleClearCSS = () => { setCssOverrideDraft(""); if (setSiCSSOverrides) setSiCSSOverrides(""); notify("🗑️ CSS effacé"); };

  const handleLoadSiSource = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file.name);
    const reader = new FileReader();
    reader.onload = ev => { setSiSource(ev.target.result); setSiSourceModified(false); notify(`✅ Source chargée : ${file.name} (${(ev.target.result.length/1024).toFixed(1)} Ko)`); };
    reader.readAsText(file);
  };
  const handleSaveSiSource = () => {
    try { _lsSet("gc-si-source", siSource); } catch(e) {}
    notify("💾 Source sauvegardée dans le stockage local");
    setSiSourceModified(false);
  };
  const handleDownloadSiSource = () => {
    const name = selectedFile || "GenieConsultant_SI_v27_modifie.jsx";
    gcDownload(siSource, name.replace(/\.[^.]+$/,""), "jsx");
  };
  const handleSiSearch = () => {
    if (!siSearchTerm || !siEditorRef.current) return;
    const ta = siEditorRef.current;
    const start = ta.value.indexOf(siSearchTerm, ta.selectionEnd);
    if (start >= 0) { ta.focus(); ta.setSelectionRange(start, start + siSearchTerm.length); }
    else { gcAlert(`"${siSearchTerm}" introuvable.`); }
  };
  const handleSiReplace = () => {
    if (!siSearchTerm) return;
    setSiSource(prev => { const r = prev.replace(siSearchTerm, siReplaceTerm); setSiSourceModified(true); return r; });
    notify(`↩️ Remplacé : "${siSearchTerm}" → "${siReplaceTerm}"`);
  };
  const handleSiReplaceAll = () => {
    if (!siSearchTerm) return;
    // FIX v135 — Proper regex escape without extra backslash before $
    const count = (siSource.match(new RegExp(siSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    setSiSource(prev => { const r = prev.replace(new RegExp(siSearchTerm.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'g'), siReplaceTerm); setSiSourceModified(true); return r; });
    notify(`↩️ ${count} remplacements effectués`);
  };

  const SI_COMMANDS = {
    users: [
      { id:"list_users", label:"📋 Lister tous les utilisateurs", icon:"👥", action:() => { const data = (users||[]).map(u=>({id:u.id,name:u.name,role:u.role,level:u.level,process:u.process,status:u.accountStatus||"ACTIF"})); setCmdResult({type:"table",headers:["ID","Nom","Rôle","Niv.","Processus","Statut"],rows:data.map(u=>[u.id,u.name,u.role,u.level,u.process,u.status])}); addCmdLog("ok",`${data.length} utilisateurs listés`); }},
      { id:"export_users_csv", label:"📊 Exporter utilisateurs CSV", icon:"📊", action:() => { const csv="ID,Nom,Rôle,Niveau,Processus,Email,Statut\n"+(users||[]).map(u=>`"${u.id}","${u.name}","${u.role}","${u.level}","${u.process}","${u.email||""}","${u.accountStatus||"ACTIF"}"`).join("\n"); gcDownload("\uFEFF"+csv,`utilisateurs-gc-${new Date().toISOString().slice(0,10)}`, "csv"); addCmdLog("ok","Export CSV utilisateurs"); }},
      { id:"export_users_json", label:"📦 Exporter utilisateurs JSON", icon:"📦", action:() => { gcDownload(JSON.stringify(users,null,2),`utilisateurs-gc-${new Date().toISOString().slice(0,10)}`,"json"); addCmdLog("ok","Export JSON utilisateurs"); }},
      { id:"reset_passwords", label:"🔑 Afficher stats mots de passe", icon:"🔑", action:() => { const stats = {total:(users||[]).length, withPwd:(users||[]).filter(u=>u.password).length, withoutPwd:(users||[]).filter(u=>!u.password).length}; setCmdResult({type:"stats",data:stats}); addCmdLog("info","Audit mots de passe"); }},
      { id:"user_from_json", label:"➕ Créer utilisateur (JSON ci-dessous)", icon:"➕", action:() => {
        try {
          const u = JSON.parse(cmdJson);
          if (!u.name||!u.id) { addCmdLog("err","JSON invalide : 'name' et 'id' obligatoires"); return; }
          if (setUsers) { setUsers(prev => prev.find(x=>x.id===u.id) ? prev : [...prev, {accountStatus:"ACTIF",createdAt:new Date().toISOString(),createdByAdmin:true,...u}]); }
          addCmdLog("ok",`Utilisateur créé : ${u.name} (${u.id})`);
          notify(`👤 Utilisateur créé : ${u.name}`);
          setCmdResult({type:"json",data:u});
        } catch(e) { addCmdLog("err",`JSON invalide : ${e.message}`); }
      }},
    ],
    dossiers: [
      { id:"list_dossiers", label:"📋 Lister les dossiers", icon:"📁", action:() => { const data=(dossiers||[]).map(d=>({id:d.id,client:d.client,status:d.status,process:d.process,priority:d.priority})); setCmdResult({type:"table",headers:["ID","Client","Statut","Processus","Priorité"],rows:data.map(d=>[d.id,d.client,d.status,d.process,d.priority])}); addCmdLog("ok",`${data.length} dossiers`); }},
      { id:"export_dossiers_csv", label:"📊 Exporter dossiers CSV", icon:"📊", action:() => { const csv="Ref,Client,Objet,Statut,Processus,Priorité,Montant,Assigné,Date\n"+(dossiers||[]).map(d=>`"${d.ref||d.id}","${d.client}","${d.objet||""}","${d.status}","${d.process}","${d.priority}","${d.amount||0}","${d.assignedTo||""}","${d.createdAt||""}"`).join("\n"); gcDownload("\uFEFF"+csv,`dossiers-gc-${new Date().toISOString().slice(0,10)}`,"csv"); addCmdLog("ok","Export CSV dossiers"); }},
      { id:"export_dossiers_json", label:"📦 Exporter dossiers JSON", icon:"📦", action:() => { gcDownload(JSON.stringify(dossiers,null,2),`dossiers-gc-${new Date().toISOString().slice(0,10)}`,"json"); addCmdLog("ok","Export JSON dossiers"); }},
      { id:"dossier_stats", label:"📊 Statistiques dossiers", icon:"📊", action:() => { const byStatus={}; (dossiers||[]).forEach(d=>{byStatus[d.status]=(byStatus[d.status]||0)+1;}); const totalCA=(dossiers||[]).reduce((a,d)=>a+(d.amount||0),0); setCmdResult({type:"stats",data:{...byStatus,TOTAL_DOSSIERS:(dossiers||[]).length,"CA_TOTAL_FCFA":totalCA.toLocaleString("fr-FR")}}); addCmdLog("info","Statistiques dossiers calculées"); }},
    ],
    taches: [
      { id:"list_taches", label:"📋 Lister les tâches", icon:"📋", action:() => { const data=(taches||[]).map(t=>({id:t.id,titre:t.titre,status:t.status,priority:t.priority,assignedTo:t.assignedTo})); setCmdResult({type:"table",headers:["ID","Titre","Statut","Priorité","Assigné"],rows:data.map(t=>[t.id,(t.titre||"").slice(0,30),t.status,t.priority,t.assignedTo])}); addCmdLog("ok",`${data.length} tâches`); }},
      { id:"export_taches_csv", label:"📊 Exporter tâches CSV", icon:"📊", action:() => { const csv="ID,Titre,Statut,Priorité,Assigné,Deadline,Créé\n"+(taches||[]).map(t=>`"${t.id}","${t.titre}","${t.status}","${t.priority}","${t.assignedTo}","${t.deadline||""}","${t.createdAt||""}"`).join("\n"); gcDownload("\uFEFF"+csv,`taches-gc-${new Date().toISOString().slice(0,10)}`,"csv"); addCmdLog("ok","Export CSV tâches"); }},
      { id:"clear_done_taches", label:"🗑️ Supprimer tâches TERMINÉ", icon:"🗑️", action: async () => { if (!await gcConfirm("Supprimer toutes les tâches au statut TERMINÉ ?")) return; const before=(taches||[]).length; if (setTaches) setTaches(prev=>prev.filter(t=>t.status!=="TERMINÉ"&&t.status!=="TERMINE")); addCmdLog("ok",`Tâches TERMINÉ supprimées (avant: ${before})`); notify("🗑️ Tâches terminées supprimées"); }},
    ],
    systeme: [
      { id:"export_full_config", label:"📦 Export configuration complète SI", icon:"📦", action:() => { const data={}; Object.keys(typeof localStorage !== "undefined" ? localStorage : _GC_MEM).filter(k=>k.startsWith("gc-")).forEach(k=>{try{data[k]=JSON.parse(_lsGet(k));}catch (_) {data[k]=_lsGet(k);}}); gcDownload(JSON.stringify(data,null,2),`gc-si-config-full-${new Date().toISOString().slice(0,10)}`,"json"); addCmdLog("ok",`Configuration exportée (${Object.keys(data).length} clés)`); }},
      { id:"export_session_logs", label:"📊 Exporter journaux session CSV", icon:"📊", action:() => { try { const logs=JSON.parse(_lsGet("gc-session-logs")||"[]"); const csv="Date,Type,Statut,Utilisateur,Rôle,IP\n"+logs.map(l=>`"${new Date(l.at).toLocaleString("fr-FR")}","${l.type}","${l.status}","${l.userName}","${l.userRole}","${l.ip||"—"}"`).join("\n"); gcDownload("\uFEFF"+csv,`journaux-sessions-${new Date().toISOString().slice(0,10)}`,"csv"); addCmdLog("ok","Export CSV journaux"); } catch(e){addCmdLog("err",e.message);} }},
      { id:"ls_storage", label:"🗂️ Afficher clés localStorage", icon:"🗂️", action:() => { const keys=Object.keys(typeof localStorage !== "undefined" ? localStorage : _GC_MEM).filter(k=>k.startsWith("gc-")); const rows=keys.map(k=>{const v=_lsGet(k)||""; return [k,`${(v.length/1024).toFixed(1)} Ko`];}); setCmdResult({type:"table",headers:["Clé","Taille"],rows}); addCmdLog("info",`${keys.length} clés localStorage`); }},
      { id:"clear_cache", label:"🗑️ Vider le cache localStorage", icon:"🗑️", action: async () => { if (!await gcConfirm("⚠️ Vider tout le cache GC ? Les données seront perdues !")) return; Object.keys(typeof localStorage !== "undefined" ? localStorage : _GC_MEM).filter(k=>k.startsWith("gc-")).forEach(k=>_lsRm(k)); addCmdLog("warn","Cache localStorage vidé"); notify("🗑️ Cache vidé — Rechargez la page"); }},
      { id:"si_health", label:"🩺 Diagnostic système SI", icon:"🩺", action:() => { const health={VERSION:"v29.0/2026",UTILISATEURS:String((users||[]).length),DOSSIERS:String((dossiers||[]).length),TACHES:String((taches||[]).length),RDV:String((rdvs||[]).length),APPROBATIONS:String((pendingApprovals||[]).length),LOCALSTORAGE_KEYS:String(Object.keys(typeof localStorage !== "undefined" ? localStorage : _GC_MEM).filter(k=>k.startsWith("gc-")).length),MEMOIRE_JS:`~${Math.round(performance.memory?.usedJSHeapSize/1048576||0)} Mo`,RESOLUTION:`${window.innerWidth}×${window.innerHeight}`,STATUS:"✅ OPÉRATIONNEL"}; setCmdResult({type:"stats",data:health}); addCmdLog("ok","Diagnostic SI complet"); }},
      { id:"import_config_json", label:"📥 Importer configuration JSON (fichier)", icon:"📥", action:() => { const inp=document.createElement("input"); inp.type="file"; inp.accept=".json"; inp.onchange=(e)=>{ const file=e.target.files[0]; if(!file)return; const reader=new FileReader(); reader.onload=(ev)=>{ try{ const data=JSON.parse(ev.target.result); Object.entries(data).forEach(([k,v])=>{ try{_lsSet(k,typeof v==="string"?v:JSON.stringify(v));}catch (_) {} }); addCmdLog("ok",`Configuration importée (${Object.keys(data).length} clés) — Rechargez la page`); notify("📥 Configuration importée — Rechargez la page pour appliquer"); setCmdResult({type:"json",data:{imported:Object.keys(data).length,keys:Object.keys(data)}}); }catch(er){addCmdLog("err",`Erreur import : ${er.message}`);}  }; reader.readAsText(file); }; inp.click(); }},
    ]};

  const runCommand = (cmd) => { try { cmd.action(); } catch(e) { addCmdLog("err", `Erreur : ${e.message}`); } };

  const TERM_CMDS = {
    help: () => ["╔══════════════════════════════════════════╗","║    GénieConsultant SI — Terminal v27.0   ║","╠══════════════════════════════════════════╣","║  help        — Afficher cette aide       ║","║  clear       — Effacer le terminal       ║","║  version     — Version du SI             ║","║  status      — État du système           ║","║  ls          — Modules disponibles       ║","║  gc storage  — Clés localStorage         ║","║  gc clear    — Effacer tout le cache     ║","║  gc export   — Exporter la config        ║","║  gc source   — Aller à l'éditeur source  ║","║  whoami      — Infos système             ║","║  date        — Date/heure actuelle       ║","║  uptime      — Temps de session          ║","╚══════════════════════════════════════════╝"],
    clear: () => { setTermHistory([{type:"prompt",text:""}]); return null; },
    version: () => ["GénieConsultant SI v29.0/2026", "Build: React 18 · localStorage persistence", "DOC-A01-SI.v29.0/2026"],
    whoami: () => [`Admin : ${localUser?.name||"Direction SI"}`, `Navigateur : ${navigator.userAgent.split(" ").slice(-1)[0]}`, `Résolution : ${window.innerWidth}×${window.innerHeight}`, `Langue : ${navigator.language}`],
    date: () => [new Date().toLocaleString("fr-FR", { weekday:"long", day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" })],
    uptime: () => [`Session démarrée à : ${new Date(performance.timeOrigin).toLocaleTimeString("fr-FR")}`, `Durée : ${Math.round(performance.now()/1000)}s`],
    status: () => { const keys = Object.keys(typeof localStorage !== "undefined" ? localStorage : _GC_MEM).filter(k=>k.startsWith("gc-")); return ["● GénieConsultant SI : ACTIF ✅", `● Utilisateurs : ${(users||[]).length}`, `● Dossiers : ${(dossiers||[]).length}`, `● Tâches : ${(taches||[]).length}`, `● localStorage : ${keys.length} clés`, "● Authentification : Opérationnelle"]; },
    ls: () => ["📁 Modules disponibles :", "  dashboard  — Tableau de bord", "  dossiers   — Gestion dossiers clients", "  taches     — Planificateur de tâches", "  agenda     — Agenda & rendez-vous", "  processus  — Cartographie processus", "  indicateurs— KPIs & indicateurs", "  archivage  — Archivage dossiers", "  admin      — Paramètres administrateur"],
    "gc storage": () => { const keys=Object.keys(typeof localStorage !== "undefined" ? localStorage : _GC_MEM).filter(k=>k.startsWith("gc-")); return keys.length>0?[`LocalStorage (${keys.length} clés) :`,...keys.map(k=>`  ${k} [${((_lsGet(k)||"").length/1024).toFixed(1)}Ko]`)]:["Aucune donnée en cache."]; },
    "gc clear": () => { Object.keys(typeof localStorage !== "undefined" ? localStorage : _GC_MEM).filter(k=>k.startsWith("gc-")).forEach(k=>_lsRm(k)); return ["✅ Cache GC effacé — Rechargez la page pour appliquer."]; },
    "gc reset": () => { (()=>{try{localStorage.clear();}catch(_){Object.keys(_GC_MEM).forEach(k=>delete _GC_MEM[k]);}})() ; return ["⚠️ Toutes les données réinitialisées.", "Rechargez la page pour démarrer en mode vierge."]; },
    "gc export": () => { const data={}; Object.keys(typeof localStorage !== "undefined" ? localStorage : _GC_MEM).filter(k=>k.startsWith("gc-")).forEach(k=>{try{data[k]=JSON.parse(_lsGet(k));}catch (_) {data[k]=_lsGet(k);}}); const b=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=`gc-si-config-${new Date().toISOString().slice(0,10)}.json`; a.click(); return ["✅ Configuration exportée en JSON."]; },
    "gc source": () => { setActiveTab("source"); return ["→ Navigation vers l'éditeur source SI…"]; }};
  const runTermCmd = (cmd) => {
    const trimmed = cmd.trim().toLowerCase();
    const fn = TERM_CMDS[trimmed];
    let output;
    if (fn) { output = fn(); }
    else if (trimmed === "") { output = []; }
    else { output = [`'${cmd}' : commande introuvable. Tapez 'help'.`]; }
    if (output === null) return;
    setTermHistory(prev => { const newH=[...prev.filter(h=>h.type!=="prompt"),{type:"cmd",text:`$ ${cmd}`},...(output||[]).map(t=>({type:"out",text:t})),{type:"prompt",text:""}]; return newH; });
  };
  const handleTermKey = (e) => {
    if (e.key==="Enter") { const cmd=termInput; setTermCmdHistory(h=>[cmd,...h].slice(0,50)); setTermCmdIdx(-1); setTermInput(""); runTermCmd(cmd); }
    else if (e.key==="ArrowUp") { e.preventDefault(); const idx=Math.min(termCmdIdx+1,termCmdHistory.length-1); setTermCmdIdx(idx); setTermInput(termCmdHistory[idx]||""); }
    else if (e.key==="ArrowDown") { e.preventDefault(); const idx=Math.max(termCmdIdx-1,-1); setTermCmdIdx(idx); setTermInput(idx>=0?termCmdHistory[idx]:""); }
    else if (e.key==="Tab") { e.preventDefault(); const cmds=Object.keys(TERM_CMDS); const match=cmds.find(c=>c.startsWith(termInput.toLowerCase())); if(match)setTermInput(match); }
  };

  const handleAiSend = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput(""); setAiMessages(prev => [...prev, { role:"user", content: userMsg }]); setAiLoading(true);
    const systemPrompt = `Tu es l'assistant IA intégré au système d'information GénieConsultant SI v29.0/2026, développé pour un cabinet juridique à Libreville, Gabon. 
Le SI est une application React (JSX) single-page avec : gestion dossiers clients, tâches, agenda, messagerie, comités, KPIs, codification, archivage.
Aide l'administrateur à modifier, corriger et étendre ce SI. Réponds en français. Fournis du code React/JSX fonctionnel avec inline CSS.
${aiContext==="source"&&siSource?"\n[Extrait source (3000 chars)] :\n"+siSource.slice(0,3000):""}`;
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},
        body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:2000, system:systemPrompt, messages:[...aiMessages,{role:"user",content:userMsg}].filter(m=>m.role!=="assistant"||m.content!==aiMessages[0]?.content||aiMessages.length>1).slice(-12).map(m=>({role:m.role,content:m.content})) })
      });
      const data = await response.json();
      const reply = data.content?.map(c=>c.text||"").join("") || "Erreur de réponse.";
      setAiMessages(prev => [...prev, { role:"assistant", content: reply }]);
    } catch(err) {
      setAiMessages(prev => [...prev, { role:"assistant", content: `⚠️ Erreur de connexion à l'API IA.\nErreur : ${err.message}` }]);
    } finally { setAiLoading(false); }
  };

  const [codeToValidate, setCodeToValidate] = useState("");
  const [validationResult, setValidationResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validationApproved, setValidationApproved] = useState(false);
  const handleValidateCode = async () => {
    if (!codeToValidate.trim()) { gcAlert("Collez d'abord le code à valider."); return; }
    setValidating(true); setValidationResult(null); setValidationApproved(false);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},
        body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1500,
          system:`Tu es un expert React/JSX validant du code pour GénieConsultant SI. Réponds UNIQUEMENT en JSON valide (sans markdown) : {"score":85,"verdict":"APPROUVÉ","problems":["problèmes"],"suggestions":["suggestions"],"summary":"Résumé","safe":true}. verdict: "APPROUVÉ" si score>=80, "APPROUVÉ AVEC RÉSERVES" si >=50, "REJETÉ" si <50. safe=true si applicable sans risque.`,
          messages:[{role:"user",content:`Valide ce code JSX React pour GénieConsultant:\n\n${codeToValidate.slice(0,4000)}`}] })
      });
      const data = await response.json();
      const text = data.content?.map(c=>c.text||"").join("")||"{}";
      try { const clean=text.replace(/```json|```/g,"").trim(); setValidationResult(JSON.parse(clean)); }
      catch (_) { setValidationResult({score:50,verdict:"APPROUVÉ AVEC RÉSERVES",problems:["Impossible d'analyser automatiquement"],suggestions:["Vérifiez manuellement"],summary:text.slice(0,200),safe:false}); }
    } catch(err) { setValidationResult({score:0,verdict:"ERREUR",problems:[`Connexion IA échouée: ${err.message}`],suggestions:[],summary:"Vérification manuelle requise",safe:false}); }
    finally { setValidating(false); }
  };
  const handleApplyValidatedCode = async () => {
    if (!validationResult?.safe && !await gcConfirm("⚠️ L'IA a signalé ce code comme risqué. Confirmer quand même ?")) return;
    setSiSource(prev => prev + "\n\n// ── CODE APPLIQUÉ PAR ADMIN le " + new Date().toLocaleDateString("fr-FR") + " ──\n" + codeToValidate);
    setSiSourceModified(true); setValidationApproved(true);
    notify(`✅ Code inséré dans la source SI (${codeToValidate.split("\n").length} lignes)`);
    setCodeToValidate(""); setValidationResult(null);
  };

  const editorTabs = [
    { id:"commandes",  icon:"⚡", label:"Commandes SI" },
    { id:"apparence",  icon:"🎨", label:"Apparence" },
    { id:"logo",       icon:"🖼️", label:"Logo & Branding" },
    { id:"css",        icon:"✏️", label:"CSS Live" },
    { id:"source",     icon:"📝", label:"Source JSX" },
    { id:"validate",   icon:"🔬", label:"Valider Code" },
    { id:"terminal",   icon:"💻", label:"Terminal" },
    { id:"ai",         icon:"🤖", label:"Assistant IA" },
  ];

  const CMD_CATS = [
    {id:"users",label:"👥 Utilisateurs",color:"#3B82F6"},
    {id:"dossiers",label:"📁 Dossiers",color:"#C41E3A"},
    {id:"taches",label:"📋 Tâches",color:"#F59E0B"},
    {id:"systeme",label:"⚙️ Système",color:"#22C55E"},
  ];

  const LOG_COLORS = {ok:"#22C55E",err:"#EF4444",warn:"#F59E0B",info:"#3B82F6"};

  return (
    <div>
      <div style={{ background:"#F59E0B15", border:"1px solid #F59E0B44", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:12, color:T.text }}>
        ⚠️ <strong>Zone Supervision SI</strong> — Commandes directes SI · Modifications en temps réel · Source JSX · Terminal · Assistant IA
      </div>
      {saveMsg && <div style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:8,padding:"8px 14px",marginBottom:12,color:"#22C55E",fontWeight:700,fontSize:12}}>{saveMsg}</div>}

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap",borderBottom:`1px solid ${T.border}`,paddingBottom:10}}>
        {editorTabs.map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{background:activeTab===tab.id?"#C41E3A":T.surface2,color:activeTab===tab.id?"#fff":T.textMuted,border:`1px solid ${activeTab===tab.id?"#C41E3A":T.border}`,borderRadius:8,padding:"7px 14px",fontWeight:700,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",gap:5}}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ══ COMMANDES SI DIRECTES ══ */}
      {activeTab==="commandes" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:14,minHeight:520}}>
            {/* Left: command palette */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14,overflow:"hidden"}}>
              <div style={{color:T.text,fontWeight:800,fontSize:13,marginBottom:10}}>⚡ Palette de commandes SI</div>
              {/* Category tabs */}
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>
                {CMD_CATS.map(c=>(
                  <button key={c.id} onClick={()=>setCmdCategory(c.id)}
                    style={{background:cmdCategory===c.id?c.color+"33":T.surface3,color:cmdCategory===c.id?c.color:T.textMuted,border:`1px solid ${cmdCategory===c.id?c.color:T.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:cmdCategory===c.id?800:400}}>
                    {c.label}
                  </button>
                ))}
              </div>
              {/* Commands */}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {(SI_COMMANDS[cmdCategory]||[]).map(cmd=>(
                  <button key={cmd.id} onClick={()=>runCommand(cmd)}
                    style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",cursor:"pointer",textAlign:"left",color:T.text,fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:8,transition:"background 0.15s"}}>
                    <span style={{fontSize:15,flexShrink:0}}>{cmd.icon}</span>
                    <span style={{flex:1,lineHeight:1.3}}>{cmd.label}</span>
                  </button>
                ))}
              </div>
              {/* JSON editor for creation commands */}
              <div style={{marginTop:14}}>
                <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Payload JSON (pour création)</div>
                <textarea value={cmdJson} onChange={e=>setCmdJson(e.target.value)} placeholder={'{\n  "id": "USR-XXX-0001",\n  "name": "Prénom NOM",\n  "role": "Juriste",\n  "level": 2,\n  "process": "O01"\n}'} rows={7}
                  style={{width:"100%",background:"#0A0F1A",border:"1px solid #1E3A5F",borderRadius:8,padding:"8px 10px",color:"#C9A84C",fontSize:10,fontFamily:codeFont,resize:"vertical",boxSizing:"border-box",outline:"none"}} />
              </div>
            </div>
            {/* Right: results + log */}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Result display */}
              <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14,flex:1,overflow:"auto",minHeight:280}}>
                <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>📊 Résultat</div>
                {!cmdResult && <div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:40}}>Exécutez une commande pour voir les résultats ici</div>}
                {cmdResult?.type==="table" && (
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                      <thead><tr>{cmdResult.headers.map(h=><th key={h} style={{padding:"6px 8px",background:T.surface3,color:T.textMuted,fontWeight:700,textAlign:"left",fontSize:9,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                      <tbody>{cmdResult.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} style={{padding:"6px 8px",color:T.text,borderBottom:`1px solid ${T.border}22`,fontFamily:j===0?codeFont:"inherit",fontSize:j===0?10:11}}>{cell}</td>)}</tr>)}</tbody>
                    </table>
                    <div style={{color:T.textDim,fontSize:10,marginTop:6}}>{cmdResult.rows.length} entrée(s)</div>
                  </div>
                )}
                {cmdResult?.type==="stats" && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8}}>
                    {Object.entries(cmdResult.data).map(([k,v])=>(
                      <div key={k} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px"}}>
                        <div style={{color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:0.5,fontWeight:700,marginBottom:3}}>{k.replace(/_/g," ")}</div>
                        <div style={{color:"#C9A84C",fontWeight:900,fontSize:15,fontFamily:codeFont}}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
                {cmdResult?.type==="json" && (
                  <pre style={{background:"#0A0F1A",borderRadius:8,padding:12,color:"#C9A84C",fontSize:10,fontFamily:codeFont,overflow:"auto",maxHeight:240,margin:0}}>{JSON.stringify(cmdResult.data,null,2)}</pre>
                )}
              </div>
              {/* Command log */}
              <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:12,maxHeight:180,overflow:"auto"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:11}}>📋 Journal des commandes</div>
                  <button onClick={()=>setCmdLog([])} style={{background:"none",border:"none",color:T.textDim,cursor:"pointer",fontSize:10}}>Effacer</button>
                </div>
                {cmdLog.length===0 ? <div style={{color:T.textMuted,fontSize:11}}>Aucune commande exécutée</div> :
                  cmdLog.map(entry=>(
                    <div key={entry.id} style={{display:"flex",gap:8,alignItems:"baseline",marginBottom:3}}>
                      <span style={{color:T.textDim,fontSize:9,flexShrink:0,fontFamily:codeFont}}>{entry.at}</span>
                      <span style={{color:LOG_COLORS[entry.type]||T.textMuted,fontSize:10,fontWeight:entry.type==="err"?700:400}}>{entry.type==="ok"?"✓":entry.type==="err"?"✗":entry.type==="warn"?"⚠":"ℹ"} {entry.text}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ APPARENCE ══ */}
      {activeTab==="apparence" && (
        <div>
          <h4 style={{color:T.text,margin:"0 0 16px",fontWeight:800}}>🎨 Personnalisation de l'interface</h4>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
              <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:12}}>🎨 Palette de couleurs</div>
              {[["primaryColor","Couleur primaire (rouge)"],["navyColor","Couleur marine"],["goldColor","Couleur or"],["accentColor","Couleur accent (bleu)"]].map(([key,label])=>(
                <div key={key} style={{marginBottom:12}}>
                  <div style={{color:T.textMuted,fontSize:11,marginBottom:4}}>{label}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input type="color" value={localApp[key]||"#C41E3A"} onChange={e=>setLocalApp(p=>({...p,[key]:e.target.value}))} style={{width:40,height:32,border:"none",borderRadius:4,cursor:"pointer",padding:0}}/>
                    <input value={localApp[key]||""} onChange={e=>setLocalApp(p=>({...p,[key]:e.target.value}))} placeholder="#RRGGBB" style={{flex:1,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:12,fontFamily:codeFont}}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
              <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:12}}>🏢 Identité cabinet</div>
              {[["cabinetName","Nom du cabinet"],["cabinetSlogan","Slogan"],["loginSubtitle","Sous-titre login"]].map(([key,label])=>(
                <div key={key} style={{marginBottom:10}}>
                  <div style={{color:T.textMuted,fontSize:11,marginBottom:3}}>{label}</div>
                  <input value={localApp[key]||""} onChange={e=>setLocalApp(p=>({...p,[key]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button onClick={handleSaveAppearance} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"10px 24px",cursor:"pointer",fontWeight:800,fontSize:13}}>✅ Appliquer en temps réel</button>
            <button onClick={handleResetAppearance} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12}}>↺ Réinitialiser</button>
          </div>
        </div>
      )}

      {/* ══ LOGO ══ */}
      {activeTab==="logo" && (
        <div>
          <h4 style={{color:T.text,margin:"0 0 16px",fontWeight:800}}>🖼️ Logo & Branding</h4>
          <div style={{display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{background:T.surface2,border:`2px dashed ${T.border}`,borderRadius:12,padding:20,textAlign:"center",minWidth:200}}>
              {logoPreview ? <img src={logoPreview} alt="Logo" style={{maxWidth:180,maxHeight:90,objectFit:"contain"}}/> : <div style={{color:T.textMuted,fontSize:12,padding:"20px 0"}}>Aucun logo</div>}
            </div>
            <div style={{flex:1,minWidth:200}}>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{display:"none"}}/>
              <button onClick={()=>logoInputRef.current?.click()} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:12,marginBottom:8,display:"block"}}>📁 Choisir une image</button>
              <button onClick={handleApplyLogo} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:12,marginBottom:8,display:"block"}}>✅ Appliquer le logo</button>
              <button onClick={handleRemoveLogo} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:12,display:"block"}}>🗑️ Supprimer le logo</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CSS LIVE ══ */}
      {activeTab==="css" && (
        <div>
          <h4 style={{color:T.text,margin:"0 0 12px",fontWeight:800}}>✏️ CSS personnalisé — Appliqué en temps réel</h4>
          <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:T.textMuted}}>Les styles CSS ici s'appliquent en surcharge de l'interface SI. Variables disponibles : --gc-primary, --gc-navy, --gc-gold, --gc-accent</div>
          <textarea value={cssOverrideDraft} onChange={e=>setCssOverrideDraft(e.target.value)}
            placeholder={`/* Exemples :\n.gc-nav-item { border-radius: 4px; }\nbutton { transition: all 0.2s ease; }\n*/`} rows={14}
            style={{width:"100%",background:"#0A0F1A",border:"1px solid #1E3A5F",borderRadius:8,padding:12,color:"#C9A84C",fontSize:12,fontFamily:codeFont,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={handleApplyCSS} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>▶ Appliquer</button>
            <button onClick={handleClearCSS} style={{background:"#EF444422",border:"1px solid #EF444433",color:"#EF4444",borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>🗑️ Effacer</button>
          </div>
        </div>
      )}

      {/* ══ SOURCE JSX ══ */}
      {activeTab==="source" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <h4 style={{color:T.text,margin:0,fontWeight:800}}>📝 Éditeur Source SI {siSourceModified&&<span style={{color:"#F59E0B",fontSize:11,marginLeft:8}}>● Modifié</span>}</h4>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <label style={{background:"#3B82F6",color:"#fff",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>📁 Charger JSX<input type="file" accept=".jsx,.js,.txt" onChange={handleLoadSiSource} style={{display:"none"}}/></label>
              <button onClick={handleSaveSiSource} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>💾 Sauvegarder</button>
              <button onClick={handleDownloadSiSource} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>⬇ Télécharger .jsx</button>
            </div>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            <input value={siSearchTerm} onChange={e=>setSiSearchTerm(e.target.value)} placeholder="Rechercher…" style={{flex:1,minWidth:150,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <input value={siReplaceTerm} onChange={e=>setSiReplaceTerm(e.target.value)} placeholder="Remplacer par…" style={{flex:1,minWidth:150,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <button onClick={handleSiSearch} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:11}}>🔍</button>
            <button onClick={handleSiReplace} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:11}}>↩ x1</button>
            <button onClick={handleSiReplaceAll} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:11}}>↩ Tous</button>
          </div>
          <div style={{color:T.textDim,fontSize:9,marginBottom:4,fontFamily:codeFont}}>{siLineCount} lignes · {(siSource.length/1024).toFixed(1)} Ko{selectedFile?` · ${selectedFile}`:""}</div>
          <textarea ref={siEditorRef} value={siSource} onChange={e=>{setSiSource(e.target.value);setSiSourceModified(true);}} spellCheck={false} rows={22}
            style={{width:"100%",background:"#0A0F1A",border:"1px solid #1E3A5F",borderRadius:8,padding:12,color:"#A8D8EA",fontSize:11,fontFamily:codeFont,resize:"vertical",outline:"none",boxSizing:"border-box",lineHeight:1.5}}/>
        </div>
      )}

      {/* ══ VALIDER CODE ══ */}
      {activeTab==="validate" && (
        <div>
          <h4 style={{color:T.text,margin:"0 0 12px",fontWeight:800}}>🔬 Validation IA du code React/JSX</h4>
          <textarea value={codeToValidate} onChange={e=>setCodeToValidate(e.target.value)} placeholder="Collez ici le code JSX/React à analyser…" rows={10}
            style={{width:"100%",background:"#0A0F1A",border:"1px solid #1E3A5F",borderRadius:8,padding:12,color:"#A8D8EA",fontSize:11,fontFamily:codeFont,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={handleValidateCode} disabled={validating} style={{background:validating?"#888":"linear-gradient(135deg,#3B82F6,#2563EB)",border:"none",color:"#fff",borderRadius:8,padding:"10px 20px",cursor:validating?"not-allowed":"pointer",fontWeight:800,fontSize:12}}>
              {validating?"⏳ Analyse en cours…":"🔬 Analyser avec l'IA"}
            </button>
          </div>
          {validationResult && (
            <div style={{marginTop:14,background:T.surface2,border:`2px solid ${validationResult.score>=80?"#22C55E":validationResult.score>=50?"#F59E0B":"#EF4444"}`,borderRadius:12,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:24}}>{validationResult.score>=80?"✅":validationResult.score>=50?"⚠️":"❌"}</span>
                  <div>
                    <div style={{color:T.text,fontWeight:900,fontSize:15}}>{validationResult.verdict}</div>
                    <div style={{color:T.textMuted,fontSize:11}}>{validationResult.summary}</div>
                  </div>
                </div>
                <div style={{background:validationResult.score>=80?"#22C55E22":validationResult.score>=50?"#F59E0B22":"#EF444422",borderRadius:8,padding:"8px 14px",textAlign:"center"}}>
                  <div style={{color:validationResult.score>=80?"#22C55E":validationResult.score>=50?"#F59E0B":"#EF4444",fontWeight:900,fontSize:22}}>{validationResult.score}%</div>
                  <div style={{color:T.textDim,fontSize:9}}>score</div>
                </div>
              </div>
              {validationResult.problems?.length>0&&<div style={{marginBottom:8}}><div style={{color:"#EF4444",fontWeight:700,fontSize:11,marginBottom:4}}>⚠ Problèmes détectés</div>{validationResult.problems.map((p,i)=><div key={i} style={{color:T.textMuted,fontSize:11,paddingLeft:12}}>• {p}</div>)}</div>}
              {validationResult.suggestions?.length>0&&<div style={{marginBottom:8}}><div style={{color:"#22C55E",fontWeight:700,fontSize:11,marginBottom:4}}>💡 Suggestions</div>{validationResult.suggestions.map((s,i)=><div key={i} style={{color:T.textMuted,fontSize:11,paddingLeft:12}}>• {s}</div>)}</div>}
              {validationResult.score>=50&&<button onClick={handleApplyValidatedCode} style={{background:"linear-gradient(135deg,#22C55E,#16A34A)",border:"none",color:"#fff",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:12,marginTop:6}}>✅ Insérer dans la source SI</button>}
              {validationApproved&&<div style={{color:"#22C55E",fontWeight:700,fontSize:12,marginTop:8}}>✅ Code inséré avec succès dans la source SI.</div>}
            </div>
          )}
        </div>
      )}

      {/* ══ TERMINAL ══ */}
      {activeTab==="terminal" && (
        <div>
          <h4 style={{color:T.text,margin:"0 0 12px",fontWeight:800}}>💻 Terminal SI</h4>
          <div ref={termRef} onClick={()=>termInputRef.current?.focus()}
            style={{background:"#0A0F1A",borderRadius:10,padding:14,height:340,overflowY:"auto",fontFamily:codeFont,fontSize:12,cursor:"text",border:"1px solid #1E3A5F"}}>
            {termHistory.map((line,i)=>(
              <div key={i} style={{marginBottom:2,color:line.type==="cmd"?"#C9A84C":line.type==="system"?"#3B82F6":line.type==="prompt"?"#22C55E":"#A8D8EA"}}>
                {line.type==="prompt"?(
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{color:"#22C55E"}}>root@gc-si:~$</span>
                    <input ref={termInputRef} value={termInput} onChange={e=>setTermInput(e.target.value)} onKeyDown={handleTermKey}
                      style={{flex:1,background:"none",border:"none",outline:"none",color:"#C9A84C",fontFamily:codeFont,fontSize:12,caretColor:"#22C55E"}}
                      autoFocus/>
                  </div>
                ):(
                  <span>{line.type==="cmd"?<><span style={{color:"#22C55E"}}>root@gc-si:~$</span> {line.text.slice(2)}</>:line.text}</span>
                )}
              </div>
            ))}
          </div>
          <div style={{color:T.textDim,fontSize:10,marginTop:6}}>Tapez 'help' pour afficher les commandes disponibles · Tab pour auto-complétion · ↑↓ historique</div>
        </div>
      )}

      {/* ══ AI ASSISTANT ══ */}
      {activeTab==="ai" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h4 style={{color:T.text,margin:0,fontWeight:800}}>🤖 Assistant IA — GénieConsultant SI</h4>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{color:T.textDim,fontSize:10}}>Contexte :</span>
              {[["general","Général"],["source","Avec source"]].map(([v,l])=>(
                <button key={v} onClick={()=>setAiContext(v)} style={{background:aiContext===v?"#A855F722":T.surface2,color:aiContext===v?"#A855F7":T.textMuted,border:`1px solid ${aiContext===v?"#A855F744":T.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:aiContext===v?700:400}}>{l}</button>
              ))}
            </div>
          </div>
          <div ref={aiChatRef} style={{background:"#0A0F1A",borderRadius:10,padding:14,height:300,overflowY:"auto",marginBottom:10,border:"1px solid #1E3A5F"}}>
            {aiMessages.map((m,i)=>(
              <div key={i} style={{marginBottom:12,display:"flex",gap:8,justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                {m.role==="assistant"&&<div style={{width:28,height:28,borderRadius:"50%",background:"#A855F722",border:"1px solid #A855F744",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>🤖</div>}
                <div style={{background:m.role==="user"?"#C41E3A22":"#1E2A3A",border:`1px solid ${m.role==="user"?"#C41E3A33":"#1E3A5F"}`,borderRadius:10,padding:"8px 12px",maxWidth:"80%",color:T.text,fontSize:12,lineHeight:1.6,whiteSpace:"pre-wrap"}}>
                  {m.content}
                </div>
                {m.role==="user"&&<div style={{width:28,height:28,borderRadius:"50%",background:"#C41E3A22",border:"1px solid #C41E3A44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>👤</div>}
              </div>
            ))}
            {aiLoading&&<div style={{color:"#A855F7",fontSize:12,textAlign:"center",padding:10}}>⏳ L'assistant réfléchit…</div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <textarea value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleAiSend();}}}
              placeholder="Posez une question ou demandez une modification du SI… (Entrée pour envoyer, Shift+Entrée pour nouvelle ligne)" rows={3}
              style={{flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,resize:"none",outline:"none",fontFamily:"inherit"}}/>
            <button onClick={handleAiSend} disabled={aiLoading} style={{background:aiLoading?"#555":"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:8,padding:"0 18px",cursor:aiLoading?"not-allowed":"pointer",fontWeight:800,fontSize:13}}>▶</button>
          </div>
        </div>
      )}
    </div>
  );
};


export function AdminConnexionsTab(props) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const { T, users=[], setUsers, pendingConnections=[], setPendingConnections, setNotifications=_noop, sessionLogs=[], setSessionLogs=_noop, pendingApprovals=[], setPendingApprovals=_noop, generateAccessCode } = props;
  const [closingUser, setClosingUser] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const countdownIvRef = useRef(null); // FIX v102: évite fuite mémoire si démontage pendant countdown
  useEffect(() => { return () => { if (countdownIvRef.current) clearInterval(countdownIvRef.current); }; }, []);
  const [connTab, setConnTab] = useState("pending"); // pending | force | history | acces_apps | circuits
  const [sesSearch, setSesSearch] = useState("");
  const [sesTypeFilter, setSesTypeFilter] = useState("ALL");

  const genCode = generateAccessCode || (() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let c = ""; for (let i=0;i<8;i++) c+=chars[Math.floor(Math.random()*chars.length)];
    return c.slice(0,4)+"-"+c.slice(4);
  });

  const approveConnection = (req) => {
    // v113 — Lire depuis LS pour vérification universelle en temps réel
    let lsReqs = [];
    try { lsReqs = JSON.parse(_lsGet("gc-pending-connections")||"[]"); } catch(_) {}
    const current = lsReqs.find(r => r.id === req.id);
    if (!current) { gcAlert("⚠️ Cette demande a déjà été traitée par un autre approbateur."); return; }
    if (current.processedBy) { gcAlert(`⚠️ Déjà traité par ${current.processedBy}. Action unique — une seule validation possible.`); return; }
    // Le code est déjà généré (approvedCode pré-existant) — on l'utilise directement
    // v115 — Le code est toujours pré-généré à la demande (ABCD-XXXX format)
    const code = current.approvedCode || (()=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";const r=Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join("");return r.slice(0,4)+"-"+r.slice(4);})();
    // FIX v132 — Conserver la demande marquée APPROUVE (ne pas supprimer) pendant 15 min
    // Auth.jsx lit req.approvedCode depuis pendingConnections pour valider le code saisi
    // Si on supprime ici, l'utilisateur côté Auth ne peut plus valider → code perdu
    const processedReq = {
      ...current, approvedCode: code,
      processedBy: (_lsGet("gc-current-user-name") || "Approbateur"),
      processedAt: new Date().toISOString(),
      status: "APPROUVE",
      expiresAt: new Date(Date.now() + 15*60*1000).toISOString(), // 15 min pour que l'user saisisse
    };
    const updatedLS = lsReqs.map(r => r.id === req.id ? processedReq : r);
    try {
      _lsSet("gc-pending-connections", JSON.stringify(updatedLS));
      dsSave("gc-pending-connections", updatedLS).catch(() => {});
      dsSave("gc-pending-connections", updatedLS).catch(() => {});
      window.dispatchEvent(new StorageEvent("storage", {key:"gc-pending-connections", newValue:JSON.stringify(updatedLS)}));
    } catch(_) {}
    if (setPendingConnections) setPendingConnections(prev => prev.map(r => r.id === req.id ? processedReq : r));
    if (setUsers) setUsers(prevU => prevU.map(u => u.id === req.userId ? { ...u, accessCode: code } : u));
    if (setPendingApprovals) {
      setPendingApprovals(prev => {
        const existing = prev.find(a => a.generatedId === req.userId);
        if (existing) {
          return prev.map(a => a.generatedId===req.userId ? {...a, accessCode:code, status:"APPROUVE", accountCreated:true, accountCreatedAt:new Date().toISOString(), lastActionBy:"Direction SI"} : a);
        }
        return prev;
      });
    }
    // FIX v132 — Notifier le collaborateur avec le code ET le type de demande clairement
    try {
      const k=`gc-notif-${req.userId}`;
      const ex=JSON.parse(_lsGet(k)||"[]");
      const typeLabel = req.type==="SUSPENDU" ? "compte suspendu" : "connexion hors horaires";
      const n={
        id:"N"+Date.now(), icon:"🔑",
        message:`✅ Accès autorisé (${typeLabel}) — Votre code : ${code} · Valide 15 min · Saisissez-le sur l'écran de connexion.`,
        at:new Date().toISOString(), read:false, urgent:true
      };
      _lsSet(k,JSON.stringify([n,...ex].slice(0,200)));
    } catch(_) {}
    if (setNotifications) setNotifications(prev => [{
      id:"N"+Date.now(), icon:"🔑",
      message:`✅ Connexion approuvée : ${req.userName} — Code d'accès : ${code} — À communiquer au collaborateur`,
      at:new Date().toISOString(), read:false, module:"gestion_comptes"
    }, ...prev]);
    if (setSessionLogs) setSessionLogs(prev => [{
      id:`SES-${Date.now()}`, type:"CONNEXION", userId:req.userId, userName:req.userName,
      userRole:req.userRole, userLevel:2, userProcess:"—", at:new Date().toISOString(),
      ip:_gcCachedIp||"IP non disponible", device:"En attente", status:"APPROVED_BY_ADMIN", reason:`Approuvé — Code: ${code}`
    }, ...prev]);
    gcAlert(`✅ Connexion approuvée pour ${req.userName}.\n\n🔑 Code d'accès : ${code}\n\n📋 Le collaborateur reçoit une notification — il peut saisir ce code sur l'écran de connexion.\n\n⚠️ Une seule validation possible — les autres approbateurs ne peuvent plus agir.`);
  };

  const rejectConnection = (req) => {
    // v113 — Lire depuis LS pour vérification universelle
    let lsReqs = [];
    try { lsReqs = JSON.parse(_lsGet("gc-pending-connections")||"[]"); } catch(_) {}
    const current = lsReqs.find(r => r.id === req.id);
    if (!current) { gcAlert("⚠️ Cette demande a déjà été traitée par un autre approbateur."); return; }
    if (current.processedBy) { gcAlert(`⚠️ Déjà refusé par ${current.processedBy}.`); return; }
    // Incrémenter le compteur de rejets pour ce user dans LS
    const userRejKey = `gc-conn-rejects:${req.userId}`;
    let rejData = {count:0, firstAt: new Date().toISOString(), lockedUntil:null};
    try { rejData = JSON.parse(_lsGet(userRejKey)||JSON.stringify(rejData)); } catch(_) {}
    const now = Date.now();
    // Réinitialiser si le lockout est expiré
    if (rejData.lockedUntil && new Date(rejData.lockedUntil).getTime() < now) {
      rejData = {count:0, firstAt:new Date().toISOString(), lockedUntil:null};
    }
    rejData.count = (rejData.count||0) + 1;
    if (rejData.count >= 5) {
      rejData.lockedUntil = new Date(now + 30*60*1000).toISOString(); // lockout 30min après 5 rejets
    }
    try { _lsSet(userRejKey, JSON.stringify(rejData)); } catch(_) {}
    // Marquer comme refusé + notifier (avec rejectedBy pour info universelle)
    const rejectedReq = {...current, processedBy:(_lsGet("gc-current-user-name")||"Approbateur"), processedAt:new Date().toISOString(), status:"REJETE", rejectedBy:(_lsGet("gc-current-user-name")||"Approbateur")};
    const updatedLS = lsReqs.filter(r => r.id !== req.id);
    try {
      _lsSet("gc-pending-connections", JSON.stringify(updatedLS));
      dsSave("gc-pending-connections", updatedLS).catch(() => {});
      dsSave("gc-pending-connections", updatedLS).catch(() => {});
      window.dispatchEvent(new StorageEvent("storage", {key:"gc-pending-connections", newValue:JSON.stringify(updatedLS)}));
    } catch(_) {}
    if (setPendingConnections) setPendingConnections(prev => prev.filter(r => r.id !== req.id));
    try {
      const k=`gc-notif-${req.userId}`;
      const ex=JSON.parse(_lsGet(k)||"[]");
      const lockMsg = rejData.count>=5 ? ` 🔒 Trop de rejets — nouvelle demande impossible pendant 30 min.` : ` (${5-rejData.count} tentative(s) restante(s) avant verrouillage 30 min)`;
      const n={id:"N"+Date.now(),icon:"🚫",message:`❌ Demande de connexion refusée par ${rejectedReq.rejectedBy}.${lockMsg}`,at:new Date().toISOString(),read:false};
      _lsSet(k,JSON.stringify([n,...ex].slice(0,200)));
    } catch(_) {}
    if (setNotifications) setNotifications(prev => [{
      id:"N"+Date.now(), icon:"🚫",
      message:`Connexion refusée : ${req.userName} — ${rejData.count>=5?"🔒 Verrouillé 30min":rejData.count+"/5 rejet(s)"}`,
      at:new Date().toISOString(), read:false
    }, ...prev]);
    if (setSessionLogs) setSessionLogs(prev => [{
      id:`SES-${Date.now()}`, type:"TENTATIVE", userId:req.userId, userName:req.userName,
      userRole:req.userRole, userLevel:2, userProcess:"—", at:new Date().toISOString(),
      ip:_gcCachedIp||"IP non disponible", device:"—", status:"REJECTED", reason:"Refusé par la Direction SI"
    }, ...prev]);
    gcAlert(`❌ Connexion refusée pour ${req.userName}. L'utilisateur a été notifié. Action unique — les autres approbateurs ne peuvent plus agir.`);
  };

  const forceClose = (targetUser) => {
    if (closingUser?.id === targetUser.id) return;
    setClosingUser(targetUser);
    let c = 10;
    setCountdown(c);
    if (countdownIvRef.current) clearInterval(countdownIvRef.current);
    countdownIvRef.current = setInterval(() => {
      c--; setCountdown(c);
      if (c <= 0) {
        clearInterval(countdownIvRef.current);
        countdownIvRef.current = null;
        if (setNotifications) setNotifications(prev => [{ id:"N"+Date.now(), icon:"🔒", message:`⚠️ Session de ${targetUser.name} fermée par la Direction SI`, at:new Date().toISOString(), read:false }, ...prev]);
        if (setSessionLogs) setSessionLogs(prev => [{
          id:`SES-${Date.now()}`, type:"DECONNEXION", userId:targetUser.id, userName:targetUser.name,
          userRole:targetUser.role, userLevel:targetUser.level, userProcess:targetUser.process||"—",
          at:new Date().toISOString(), ip:_gcCachedIp||"IP non disponible", device:"—", status:"FORCED", reason:"Fermeture forcée par la Direction SI"
        }, ...prev]);
        setClosingUser(null); setCountdown(null);
        gcAlert(`🔒 Session de ${targetUser.name} fermée.`);
      }
    }, 1000);
  };

  // v113 — Sync temps réel: tous les approbateurs voient les mêmes données
  const [_connRefresh, _setConnRefresh] = useState(0);
  useEffect(() => {
    const onStorage = (e) => {
      if (e?.key === "gc-pending-connections") {
        try {
          const fresh = JSON.parse(e.newValue||"[]");
          if (setPendingConnections) setPendingConnections(fresh);
          _setConnRefresh(n=>n+1);
        } catch(_) {}
      }
    };
    window.addEventListener("storage", onStorage);
    const poll = setInterval(() => {
      try {
        const fresh = JSON.parse(_lsGet("gc-pending-connections")||"[]");
        if (setPendingConnections) setPendingConnections(curr => {
          const changed = JSON.stringify(curr) !== JSON.stringify(fresh);
          if (changed) _setConnRefresh(n=>n+1);
          return changed ? fresh : curr;
        });
      } catch(_) {}
    }, 5000);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(poll); };
  }, []);

  // FIX v132 — Ne plus supprimer les demandes APPROUVÉES de l'affichage (le code doit rester visible)
  // Seules les demandes EN_ATTENTE expirées sont auto-nettoyées
  const connRequests = (pendingConnections || []).map(r => {
    // Auto-clean seulement les demandes EN ATTENTE expirées (pas encore traitées)
    if (!r.status || r.status === "EN_ATTENTE") {
      if (r.expiresAt && new Date(r.expiresAt) < new Date()) return null;
    }
    return r;
  }).filter(Boolean);
  const connPending  = connRequests.filter(r => !r.status || r.status === "EN_ATTENTE");
  const connApproved = connRequests.filter(r => r.status === "APPROUVE");
  const managedUsers = users.filter(u => _activeUser(u)&&u.id !== "USR-ADM-000");
  const allLogs = sessionLogs || [];

  const filteredLogs = allLogs.filter(l => {
    const typeOk = sesTypeFilter === "ALL" || l.type === sesTypeFilter || l.status === sesTypeFilter;
    const searchOk = !sesSearch || l.userName?.toLowerCase().includes(sesSearch.toLowerCase()) || l.userId?.toLowerCase().includes(sesSearch.toLowerCase());
    return typeOk && searchOk;
  });

  const today = new Date().toISOString().slice(0,10);
  const todayLogs = allLogs.filter(l => l.at?.startsWith(today));
  const failedLogs = allLogs.filter(l => l.status === "FAILED");
  const uniqueActive = [...new Set(allLogs.filter(l => l.type==="CONNEXION"&&l.status==="SUCCESS").map(l=>l.userId))];

  const exportLogs = () => {
    const csv = ["Date,Type,Statut,Utilisateur,Rôle,Niveau,Processus,IP,Appareil,Motif",
      ...filteredLogs.map(l=>`"${new Date(l.at).toLocaleString("fr-FR")}","${l.type}","${l.status}","${l.userName}","${l.userRole}","${l.userLevel||'—'}","${l.userProcess||'—'}","${l.ip||'—'}","${l.device||'—'}","${l.reason||'—'}"`)
    ].join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`sessions-admin-${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const STATUS_COLORS = { SUCCESS:"#22C55E", FAILED:"#EF4444", PENDING:"#F59E0B", FORCED:"#C41E3A", APPROVED_BY_ADMIN:"#3B82F6", REJECTED:"#EF4444", MANUAL:"#3B82F6", AUTO:"#A855F7" };
  const TYPE_ICONS = { CONNEXION:"🟢", DECONNEXION:"🔴", TENTATIVE:"⚠️" };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <h4 style={{color:T.text,margin:0,fontSize:13,fontWeight:700}}>🔗 Gestion Complète des Connexions & Sessions</h4>
        <div style={{display:"flex",gap:6}}>
          <button onClick={exportLogs} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>📊 Export CSV</button>
          {connPending.length > 0 && <div style={{background:"#EF4444",color:"#fff",borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800}}>{connPending.length}</div>}
          {connApproved.length > 0 && <div style={{background:"#22C55E",color:"#fff",borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800}} title="Codes approuvés en attente de saisie">✓{connApproved.length}</div>}
        </div>
      </div>

      {/* KPI row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
        {[
          {label:"Aujourd'hui",val:todayLogs.length,icon:"📅",color:"#3B82F6"},
          {label:"Actifs (session)",val:uniqueActive.length,icon:"🟢",color:"#22C55E"},
          {label:"Alertes (échecs)",val:failedLogs.length,icon:"⚠️",color:"#EF4444"},
          {label:"En attente appro.",val:connPending.length,icon:"⏳",color:"#F59E0B"},
        ].map(s=>(
          <div key={s.label} style={{background:s.color+"11",border:`1px solid ${s.color}33`,borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
            <div style={{fontSize:18}}>{s.icon}</div>
            <div style={{color:s.color,fontWeight:900,fontSize:18}}>{s.val}</div>
            <div style={{color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:0.5,marginTop:1}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:4,marginBottom:12,borderBottom:`1px solid ${T.border}`,paddingBottom:8,overflowX:"auto",WebkitOverflowScrolling:"touch"}} className="gc-tabs-scroll">
        {[
          {id:"pending",label:`⏳ En attente (${connPending.length})${connApproved.length>0?" · ✅ Approuvés ("+connApproved.length+")":""}`,alert:connPending.length>0},
          {id:"force",label:"🔒 Fermeture Forcée"},
          {id:"history",label:`📋 Historique Sessions (${allLogs.length})`},
          {id:"acces_apps",label:"🔑 Accès Applications"},
          {id:"circuits",label:"📋 Circuits d'Approbation"},
        ].map(t=>(
          <button key={t.id} onClick={()=>setConnTab(t.id)} style={{background:connTab===t.id?"#C41E3A":T.surface2,color:connTab===t.id?"#fff":T.textMuted,border:`1px solid ${connTab===t.id?"#C41E3A":t.alert?"#F59E0B":T.border}`,borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11,whiteSpace:"nowrap",flexShrink:0}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Pending ── */}
      {connTab === "pending" && (
        <div>
          {/* ── Section : Demandes EN ATTENTE ── */}
          <div style={{color:"#F59E0B",fontWeight:800,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>
            ⏳ Demandes en attente ({connPending.length})
          </div>
          {connPending.length === 0 ? (
            <div style={{background:T.surface2,borderRadius:8,padding:16,textAlign:"center",color:T.textMuted,fontSize:12,marginBottom:12}}>✅ Aucune demande en attente</div>
          ) : connPending.map(req => (
            <div key={req.id} style={{background:T.surface2,border:"1px solid #F59E0B44",borderRadius:10,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{width:34,height:34,borderRadius:"50%",background:"#F59E0B33",border:"1px solid #F59E0B44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>👤</div>
                <div style={{flex:1}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:12}}>{req.userName}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>{req.userRole} · {req.type==="SUSPENDU"?"Compte suspendu":"Connexion hors horaires"} · Demandé à {new Date(req.requestedAt).toLocaleTimeString("fr-FR")}
                    {req.expiresAt && <span style={{color:new Date(req.expiresAt)<new Date()?"#EF4444":"#22C55E",marginLeft:6,fontWeight:700}}>
                      {new Date(req.expiresAt)<new Date()?"⚠️ Expiré":"⏱ Expire à "+new Date(req.expiresAt).toLocaleTimeString("fr-FR")}
                    </span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>approveConnection(req)} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Approuver</button>
                  <button onClick={()=>rejectConnection(req)} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>❌ Refuser</button>
                </div>
              </div>
              {/* Code pré-généré visible pour transmission immédiate avant clic Approuver */}
              {req.approvedCode && (
                <div style={{marginTop:10,padding:"8px 12px",background:"#F59E0B12",border:"1px solid #F59E0B33",borderRadius:7,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{color:"#F59E0B",fontSize:12}}>🔑</span>
                  <div style={{flex:1}}>
                    <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",marginBottom:2}}>Code pré-généré — à transmettre après validation</div>
                    <div style={{color:"#F59E0B",fontFamily:"monospace",fontWeight:900,fontSize:18,letterSpacing:4}}>{req.approvedCode}</div>
                  </div>
                  <button onClick={() => {try{navigator.clipboard.writeText(req.approvedCode);}catch(_){} gcAlert(`Code : ${req.approvedCode}`);}}
                    style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>📋 Copier</button>
                </div>
              )}
            </div>
          ))}

          {/* ── Section : Codes APPROUVÉS en attente de saisie ── */}
          {connApproved.length > 0 && (
            <>
              <div style={{color:"#22C55E",fontWeight:800,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:6,marginTop:16}}>
                ✅ Codes approuvés — en attente de saisie par le collaborateur ({connApproved.length})
              </div>
              {connApproved.map(req => {
                const expiresIn = req.expiresAt ? Math.max(0, Math.floor((new Date(req.expiresAt)-new Date())/1000/60)) : null;
                const isExpired = req.expiresAt && new Date(req.expiresAt) < new Date();
                return (
                  <div key={req.id} style={{background:T.surface2,border:`1px solid ${isExpired?"#EF444444":"#22C55E44"}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <div style={{width:34,height:34,borderRadius:"50%",background:isExpired?"#EF444422":"#22C55E22",border:`1px solid ${isExpired?"#EF444444":"#22C55E44"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{isExpired?"❌":"✅"}</div>
                      <div style={{flex:1}}>
                        <div style={{color:T.text,fontWeight:700,fontSize:12}}>{req.userName}</div>
                        <div style={{color:T.textMuted,fontSize:10}}>
                          {req.userRole} · Approuvé par {req.processedBy||"Approbateur"} à {req.processedAt?new Date(req.processedAt).toLocaleTimeString("fr-FR"):"—"}
                          {expiresIn !== null && <span style={{color:isExpired?"#EF4444":"#22C55E",marginLeft:6,fontWeight:700}}>
                            {isExpired?"⚠️ Code expiré":`⏱ Expire dans ${expiresIn} min`}
                          </span>}
                        </div>
                      </div>
                      <button onClick={() => {
                        // Retirer manuellement après confirmation
                        if(setPendingConnections) setPendingConnections(prev=>{ const updated=prev.filter(r=>r.id!==req.id); dsSave("gc-pending-connections",updated).catch(err=>gcToast.syncError("gc-pending-connections",err)); return updated; });
                        try{const ls=JSON.parse(_lsGet("gc-pending-connections")||"[]");const filtered=ls.filter(r=>r.id!==req.id);_lsSet("gc-pending-connections",JSON.stringify(filtered));dsSave("gc-pending-connections",filtered).catch(err=>gcToast.syncError("gc-pending-connections",err));}catch(_){}
                      }} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✔ Terminé</button>
                    </div>
                    {req.approvedCode && (
                      <div style={{marginTop:10,padding:"10px 14px",background:"#22C55E12",border:"1px solid #22C55E44",borderRadius:8,display:"flex",alignItems:"center",gap:12}}>
                        <span style={{color:"#22C55E",fontSize:14}}>🔑</span>
                        <div style={{flex:1}}>
                          <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",marginBottom:3}}>Code d'accès — à communiquer au collaborateur</div>
                          <div style={{color:"#22C55E",fontFamily:"monospace",fontWeight:900,fontSize:22,letterSpacing:5}}>{req.approvedCode}</div>
                        </div>
                        <button onClick={() => {try{navigator.clipboard.writeText(req.approvedCode);}catch(_){} gcAlert(`✅ Code copié :\n\n${req.approvedCode}\n\nCommuniquez ce code à ${req.userName}.`);}}
                          style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontSize:11,fontWeight:800}}>📋 Copier & Afficher</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Force close ── */}
      {connTab === "force" && (
        <div>
          <div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:T.textMuted}}>
            ⚠️ Une alerte de 10 secondes est envoyée avant fermeture. Les sessions fermées de force sont enregistrées dans les journaux.
          </div>
          {managedUsers.map(u=>{
            const userLastLogin = allLogs.filter(l=>l.userId===u.id&&l.type==="CONNEXION"&&l.status==="SUCCESS").sort((a,b)=>new Date(b.at)-new Date(a.at))[0];
            const isBlocked = u.blocked;
            return (
              <div key={u.id} style={{background:T.surface2,border:`1px solid ${isBlocked?"#EF444444":T.border}`,borderRadius:8,padding:"10px 12px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
                <UserAvatar user={u} size={28} />
                <div style={{flex:1}}>
                  <div style={{color:T.text,fontSize:12,fontWeight:600}}>{u.name} {isBlocked&&<span style={{color:"#EF4444",fontSize:9,fontWeight:700}}>🚫 BLOQUÉ</span>}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>{u.role} · Niv.{u.level} · {u.process}</div>
                  {userLastLogin && <div style={{color:T.textDim,fontSize:9}}>Dernière connexion : {new Date(userLastLogin.at).toLocaleString("fr-FR")}</div>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  {closingUser?.id === u.id ? (
                    <div style={{background:"#EF444422",border:"1px solid #EF4444",borderRadius:8,padding:"6px 14px",color:"#EF4444",fontWeight:800,fontSize:14}}>⏰ {countdown}s</div>
                  ) : (
                    <button onClick={()=>forceClose(u)} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>🔒 Fermer session</button>
                  )}
                  {!isBlocked ? (
                    <button onClick={async () => {if(await gcConfirm(`Bloquer définitivement ${u.name} ?`)){const upd=users.map(x=>x.id===u.id?{...x,blocked:true}:x);if(setNotifications)setNotifications(prev=>[{id:"N"+Date.now(),icon:"🚫",message:`Compte ${u.name} bloqué par Admin`,at:new Date().toISOString(),read:false},...prev]);gcAlert(`🚫 ${u.name} bloqué.`);}}} style={{background:"#C41E3A22",border:"1px solid #C41E3A44",color:"#C41E3A",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>🚫 Bloquer</button>
                  ) : (
                    <button onClick={()=>gcAlert(`Déblocage de ${u.name} effectué.`)} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>🔓 Débloquer</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── History ── */}
      {connTab === "history" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <input value={sesSearch} onChange={e=>setSesSearch(e.target.value)} placeholder="🔍 Rechercher utilisateur…"
              style={{flex:1,minWidth:160,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 11px",color:T.text,fontSize:11}} />
            {["ALL","CONNEXION","DECONNEXION","TENTATIVE"].map(f=>(
              <button key={f} onClick={()=>setSesTypeFilter(f)} style={{background:sesTypeFilter===f?"#C41E3A":T.surface2,color:sesTypeFilter===f?"#fff":T.textMuted,border:`1px solid ${sesTypeFilter===f?"#C41E3A":T.border}`,borderRadius:15,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:sesTypeFilter===f?700:400,flexShrink:0}}>
                {TYPE_ICONS[f]||"📋"} {f==="ALL"?"Tous":f}
              </button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {filteredLogs.slice(0,60).map(log => {
              const tc = STATUS_COLORS[log.status] || "#888";
              const isAlert = log.status === "FAILED" || log.status === "REJECTED";
              return (
                <div key={log.id} style={{background:isAlert?"#EF444408":T.surface2,border:`1px solid ${isAlert?"#EF444433":T.border}`,borderRadius:8,padding:"8px 12px",display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:14,flexShrink:0}}>{TYPE_ICONS[log.type]||"❓"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{color:T.text,fontWeight:700,fontSize:11}}>{log.userName}</span>
                      <span style={{color:T.textDim,fontSize:10}}>{log.userRole}</span>
                      {isAlert&&<span style={{background:"#EF444422",color:"#EF4444",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700}}>⚠️ ALERTE</span>}
                    </div>
                    <div style={{color:T.textMuted,fontSize:10}}>{new Date(log.at).toLocaleString("fr-FR")} · {log.device||"—"}</div>
                    {log.reason&&<div style={{color:isAlert?"#EF4444":T.textDim,fontSize:10,fontStyle:"italic"}}>{log.reason}</div>}
                  </div>
                  <div style={{background:tc+"22",border:`1px solid ${tc}44`,borderRadius:6,padding:"3px 8px",flexShrink:0}}>
                    <span style={{color:tc,fontSize:9,fontWeight:700}}>{log.status}</span>
                  </div>
                </div>
              );
            })}
            {filteredLogs.length === 0 && <div style={{color:T.textMuted,textAlign:"center",padding:30,fontSize:12}}>Aucun journal trouvé</div>}
          </div>
        </div>
      )}

      {/* ── Accès Applications ── */}
      {connTab === "acces_apps" && (
        <div>
          <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:T.text}}>
            📱 Gérez les accès de chaque utilisateur aux applications du SI. Cliquez sur une application pour activer/désactiver l'accès.
          </div>
          {managedUsers.map(user => {
            const appList = ["Messagerie","Agenda","Dossiers & Docs","Demandes","SIRH","Comptabilité","Recrutement","Conformité","Achats","Stocks","Obligations","Boîte à outils"];
            const userApps = user.appAccess || appList; // default: tous les accès
            return (
              <div key={user.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <UserAvatar user={user} size={32} />
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{user.name}</div>
                    <div style={{color:T.textMuted,fontSize:9}}>{user.role} · Niv.{user.level}</div>
                  </div>
                  <span style={{background:user.accountStatus==="ACTIF"?"#22C55E22":"#EF444422",color:user.accountStatus==="ACTIF"?"#22C55E":"#EF4444",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>{user.accountStatus||"ACTIF"}</span>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {appList.map(app=>{
                    const hasAccess = (user.appAccess||appList).includes(app);
                    return (
                      <span key={app} onClick={() => {
                        setUsers(prev=>{const updated=prev.map(u=>u.id===user.id?{...u,appAccess:hasAccess?(u.appAccess||appList).filter(a=>a!==app):[...(u.appAccess||appList),app]}:u);dsSave('users',updated);return updated;});
                        if(setNotifications) setNotifications(prev=>[{id:"N"+Date.now(),icon:"📱",message:`Accès ${app} ${hasAccess?"retiré":"accordé"} à ${user.name}`,at:new Date().toISOString(),read:false,module:"gestion_comptes"},...prev]);
                      }} style={{background:hasAccess?"#22C55E22":"#EF444422",color:hasAccess?"#22C55E":"#EF4444",border:`1px solid ${hasAccess?"#22C55E44":"#EF444444"}`,borderRadius:5,padding:"3px 8px",fontSize:9,cursor:"pointer",fontWeight:700,userSelect:"none"}}>
                        {hasAccess?"✅":"🚫"} {app}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Circuits d'Approbation ── */}
      {connTab === "circuits" && (() => {
        const allApprovals = (pendingApprovals||[]);
        const pending = allApprovals.filter(a => !["APPROUVE","REJETE"].includes(a.status));
        const approved = allApprovals.filter(a => a.status === "APPROUVE");
        const rejected = allApprovals.filter(a => a.status === "REJETE");
        const CIRCUIT_STEPS = [
          { key:"ATTENTE_RH",    label:"① RH",         color:"#F59E0B", icon:"👥" },
          { key:"ATTENTE_CONF",  label:"② Conformité", color:"#A855F7", icon:"⚖️" },
          { key:"ATTENTE_DG",    label:"③ Direction",  color:"#C41E3A", icon:"👑" },
          { key:"APPROUVE",      label:"✅ Approuvé",  color:"#22C55E", icon:"✅" },
          { key:"REJETE",        label:"❌ Rejeté",    color:"#EF4444", icon:"❌" },
        ];
        return (
          <div>
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
              {[
                {l:"En attente",v:pending.length,c:"#F59E0B",icon:"⏳"},
                {l:"Approuvés",v:approved.length,c:"#22C55E",icon:"✅"},
                {l:"Rejetés",v:rejected.length,c:"#EF4444",icon:"❌"},
              ].map(s=>(
                <div key={s.l} style={{background:s.c+"15",border:`1px solid ${s.c}44`,borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
                  <div style={{fontSize:22}}>{s.icon}</div>
                  <div style={{color:s.c,fontSize:20,fontWeight:900}}>{s.v}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Circuit legend */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",marginBottom:12}}>
              <div style={{color:T.textMuted,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Circuit de validation des comptes</div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                {CIRCUIT_STEPS.map((s,i)=>(
                  <React.Fragment key={s.key}>
                    <span style={{background:s.color+"22",border:`1px solid ${s.color}55`,borderRadius:6,padding:"4px 10px",color:s.color,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                      {s.icon} {s.label}
                    </span>
                    {i<3 ? <span style={{color:T.textDim,fontSize:14}}>→</span> : null}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Pending approvals list */}
            {allApprovals.length === 0 ? (
              <div style={{background:T.surface2,borderRadius:10,padding:40,textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:8}}>✅</div>
                <div style={{color:T.textMuted,fontSize:13,fontWeight:600}}>Aucune demande de compte</div>
                <div style={{color:T.textDim,fontSize:11,marginTop:4}}>Les demandes de création de compte apparaîtront ici.</div>
              </div>
            ) : allApprovals.map(a => {
              const step = CIRCUIT_STEPS.find(s=>s.key===a.status)||CIRCUIT_STEPS[0];
              return (
                <div key={a.id} style={{background:T.surface2,border:`1px solid ${step.color}44`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    <div style={{width:36,height:36,borderRadius:8,background:step.color+"22",border:`1px solid ${step.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{step.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <span style={{color:T.text,fontWeight:800,fontSize:12}}>{a.applicant}</span>
                        <span style={{background:step.color+"22",color:step.color,borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700}}>{step.label}</span>
                        {a.accessCode&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700,fontFamily:"monospace"}}>🔑 {a.accessCode}</span>}
                      </div>
                      <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>
                        {a.functionLabel||a.function} · {a.dept||"—"} · Soumis le {formatDate(a.submittedAt)}
                      </div>
                      {a.generatedId&&<div style={{color:T.textDim,fontSize:9,fontFamily:"monospace",marginTop:2}}>ID généré : {a.generatedId}</div>}
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      {a.status==="ATTENTE_DG"&&(
                        <>
                          <button type="button" onClick={() => {
                            const code = genCode();
                            // FIX v126 — accountCreated:false → SIApp useEffect crée le compte
                            setPendingApprovals(prev=>prev.map(x=>x.id===a.id?{...x,status:"APPROUVE",accessCode:code,approvedAt:new Date().toISOString(),approvedBy:"Direction SI",accountCreated:false}:x));
                            setUsers(prev=>{const updated=prev.map(u=>u.id===a.generatedId?{...u,accessCode:code,accountStatus:"ACTIF"}:u);dsSave('users',updated);return updated;});
                            if(setNotifications) setNotifications(prev=>[{id:"N"+Date.now(),icon:"✅",message:`Compte approuvé : ${a.applicant} — Code : ${code}`,at:new Date().toISOString(),read:false},...prev]);
                          }} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>✅ Approuver</button>
                          <button type="button" onClick={async () => {
                            const motif = await gcPrompt("Motif du rejet :");
                            if(!motif)return;
                            setPendingApprovals(prev=>prev.map(x=>x.id===a.id?{...x,status:"REJETE",rejectionMotif:motif,rejectedAt:new Date().toISOString()}:x));
                          }} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>❌ Rejeter</button>
                        </>
                      )}
                      {["ATTENTE_RH","ATTENTE_CONF"].includes(a.status)&&(
                        <button type="button" onClick={() => {
                          const nextStatus=a.status==="ATTENTE_RH"?"ATTENTE_CONF":a.status==="ATTENTE_CONF"?"ATTENTE_DG":"APPROUVE";
                          setPendingApprovals(prev=>prev.map(x=>x.id===a.id?{...x,status:nextStatus,lastActionBy:"Direction SI",lastActionAt:new Date().toISOString()}:x));
                        }} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>→ Étape suivante</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};

// FIX v72 — Constante manquante SUSPENSION_CAUSES (provoquait ReferenceError dans GestionComptesPanel
// et AdminPanel → "ACCOUNT_STATUS_CONFIG is not defined" affiché par le ErrorBoundary sur l'écran suivant)


export function GestionComptesPanel(props) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const { localUser, users=[], setUsers, taches=[], setTaches, dossiers=[], setDossiers, rdvs=[], pendingAccountActions=[], setPendingAccountActions, setNotifications, pendingApprovals=[], setPendingApprovals, T, sessionLogs=[], setSessionLogs, onLogout, pendingConnections=[], setPendingConnections, generateAccessCode: genCode } = props;
  const isAdmin = (localUser?.isAdmin || localUser?.level >= 6) || false;
  const isDG = !isAdmin && ((localUser?.isMG || localUser?.id === "USR-MG-001" || (localUser?.level === 5)) || false);
  const isRH = !isAdmin && !isDG && ((localUser?.process === "S03" || localUser?.processes?.includes?.("S03")) && (localUser?.level >= 4)) || false;
  const isConf = !isAdmin && !isDG && !isRH && ((localUser?.process === "P02" || localUser?.processes?.includes?.("P02")) && (localUser?.level >= 4)) || false;
  const canSuspendDirect = isAdmin || isDG;  // Can act directly without RH circuit
  const canDeleteDirect = isAdmin;            // Only admin can delete without approval

  const generateCode = genCode || (() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let c = "";
    for (let i=0;i<8;i++) c += chars[Math.floor(Math.random()*chars.length)];
    return c.slice(0,4)+"-"+c.slice(4);
  });

  const pendingConns = pendingConnections || [];
  // v116 — Lire gc-admin-redirect pour navigation directe depuis CollaborateursPanel
  const [gcTab, setGcTab] = useState(() => {
    try {
      const redir = JSON.parse(_lsGet("gc-admin-redirect")||"null");
      if (redir && redir.tab && (Date.now() - new Date(redir.at||0).getTime()) < 10000) {
        _lsRm("gc-admin-redirect"); // consommer une seule fois
        return redir.tab;
      }
    } catch(_) {}
    return isAdmin || isDG ? "comptes" : isRH ? "circuits_approbation" : isConf ? "dossiers_conf" : "circuits_approbation";
  });
  // v116 — Lire bypass depuis gc-admin-redirect
  const [bypassFromRedirect] = useState(() => {
    try {
      const redir = JSON.parse(_lsGet("gc-admin-redirect")||"null");
      return redir?.bypass || false;
    } catch(_) { return false; }
  });
  const [confTab, setConfTab] = useState("appro"); // ← Dossier Unique Conformité sub-tab
  const [showSuspendModal, setShowSuspendModal] = useState(null);    // user object
  const [showCreateModal, setShowCreateModal]  = useState(false);
  const [showDeleteModal, setShowDeleteModal]  = useState(null);     // user object
  const [showRHSuggest, setShowRHSuggest]      = useState(null);     // {type, user}
  const [userSearch, setUserSearch]  = useState("");
  const [userFilter, setUserFilter]  = useState("ALL"); // ALL | ACTIF | SUSPENDU | BLOQUE

  const [suspForm, setSuspForm] = useState({ type:"PROVISOIRE", cause:"SANCTION", motif:"", endDate:"", sessionOnly:false, attachments:[] });

  const [rhForm, setRhForm] = useState({ type:"SUSPENSION", suspType:"PROVISOIRE", cause:"SANCTION", motif:"", endDate:"", targetUser:null });

  const [createForm, setCreateForm] = useState({ name:"", role:"", email:"", telephone:"", process:"O01", level:2, dept:"", sexe:"", nationalite:"Gabonaise", motif:"", bypass:false, dgDirect:false, processes:["O01"] });

  useEffect(() => {
    if (!pendingApprovals || !setNotifications) return;
    const newRH = pendingApprovals.filter(a => a.type === "CREATION_COMPTE" && a.status === "ATTENTE_RH" && !a.notifsSent?.rh);
    const newConf = pendingApprovals.filter(a => a.type === "CREATION_COMPTE" && a.status === "ATTENTE_CONF" && !a.notifsSent?.conformite);
    const newDG = pendingApprovals.filter(a => a.type === "CREATION_COMPTE" && a.status === "ATTENTE_DG" && !a.notifsSent?.dg);

    if (isRH && newRH.length > 0) {
      newRH.forEach(a => {
        notify("📥", `[NOUVEAU DOSSIER RH] Demande de création de compte : ${a.applicant} (${a.functionLabel || a.function}) — En attente de votre validation (Étape 1/3 : RH → Conformité → DG)`, "gestion_comptes");
      });
      setPendingApprovals(prev => prev.map(a => newRH.find(n => n.id === a.id) ? { ...a, notifsSent: { ...a.notifsSent, rh: true } } : a));
    }
    if (isConf && newConf.length > 0) {
      newConf.forEach(a => {
        notify("⚖️", `[CONFORMITÉ REQUISE] Dossier ${a.applicant} (${a.functionLabel || a.function}) validé par RH — En attente de votre approbation Conformité P02 (Étape 2/3)`, "gestion_comptes");
      });
      setPendingApprovals(prev => prev.map(a => newConf.find(n => n.id === a.id) ? { ...a, notifsSent: { ...a.notifsSent, conformite: true } } : a));
    }
    if ((isDG || isAdmin) && newDG.length > 0) {
      newDG.forEach(a => {
        notify("👑", `[APPROBATION DG] Dossier ${a.applicant} (${a.functionLabel || a.function}) — ✅ RH + ✅ Conformité — En attente de votre décision finale (Étape 3/3)`, "gestion_comptes");
      });
      setPendingApprovals(prev => prev.map(a => newDG.find(n => n.id === a.id) ? { ...a, notifsSent: { ...a.notifsSent, dg: true } } : a));
    }

    if (isAdmin || isDG || isRH) {
      const now = Date.now();
      const stale = pendingApprovals.filter(a =>
        !["APPROUVE","REJETE"].includes(a.status) &&
        a.submittedAt && (now - new Date(a.submittedAt).getTime()) > 48*60*60*1000 &&
        !a.notifsSent?.staleAlert
      );
      if(stale.length > 0) {
        stale.forEach(a => {
          const hoursElapsed = Math.round((now - new Date(a.submittedAt).getTime()) / (60*60*1000));
          notify("⏰", `[ALERTE PROCESSUS] Approbation pour ${a.applicant} non terminée depuis ${hoursElapsed}h — Étape bloquée : ${a.status.replace("ATTENTE_","")} — Action requise`, "gestion_comptes");
        });
        setPendingApprovals(prev => prev.map(a => stale.find(s=>s.id===a.id) ? {...a, notifsSent:{...a.notifsSent, staleAlert:true}} : a));
      }
    }
  }, [pendingApprovals?.length, isRH, isConf, isDG, isAdmin]);

  const notify = (icon, msg, module) => {
    setNotifications(prev => [{
      id:"N"+Date.now(), icon, message:msg, at:new Date().toISOString(), read:false,
      ...(module?{module}:{})
    }, ...prev]);
  };

  const createTask = (titre, assignedTo, priority="HAUTE") => {
    if (!setTaches) return;
    setTaches(prev => [...prev, {
      id:"TACHE-"+Date.now(), titre, dossier:"", assignedTo, deadline:new Date(Date.now()+2*86400000).toISOString().split("T")[0],
      priority, status:"ATTENTE_TRAITEMENT", type:"SUIVI", createdAt:new Date().toISOString().split("T")[0], createdBy:localUser.id}]);
  };

  const findDG = () => users.find(u => u.isMG || u.id==="USR-MG-001" || (u.level===5&&!u.isAdmin));
  const findAdmin = () => users.find(u => u.isAdmin);
  const findConf = () => users.find(u => (u.process === "P02" || u.processes?.includes?.("P02")) && u.level >= 4 && !u.isAdmin && !(u.isMG || u.id==="USR-MG-001"));

  const StatusBadge = ({ status }) => {
    const cfg = ACCOUNT_STATUS_CONFIG[status] || ACCOUNT_STATUS_CONFIG.ACTIF;
    return <span style={{background:cfg.color+"22",border:`1px solid ${cfg.color}44`,borderRadius:12,padding:"2px 8px",color:cfg.color,fontSize:10,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>{cfg.icon} {cfg.label}</span>;
  };

  const handleSuspend = (targetUser) => {
    if (!suspForm.motif.trim()) { gcAlert("Le motif de suspension est obligatoire."); return; }
    const newStatus = suspForm.sessionOnly ? "SUSPENDU_SESSION" : suspForm.type==="DEFINITIF" ? "SUSPENDU_DEFINITIF" : "SUSPENDU_PROVISOIRE";
    const label = ACCOUNT_STATUS_CONFIG[newStatus]?.label || newStatus;

    // Si RH (S03 niv4), la suspension passe par approbation DG
    if (isRH) {
      const dgUser = users.find(u => (u.isMG || u.id === "USR-MG-001" || u.level === 5) && !u.isAdmin);
      const approvalReq = {
        id: "APPRO-SUSP-" + Date.now(),
        type: "RH_SUSPENSION",
        targetUserId: targetUser.id, targetUserName: targetUser.name, targetUserRole: targetUser.role,
        initiatedBy: localUser.id, initiatedByName: localUser.name, initiatedByRole: localUser.role,
        initiatedAt: new Date().toISOString(),
        status: "EN_ATTENTE_DG",
        suspensionStatus: newStatus,
        suspensionType: suspForm.type, cause: suspForm.cause,
        motif: suspForm.motif, endDate: suspForm.endDate||null,
        attachments: suspForm.attachments||[]};
      if (setPendingApprovals) setPendingApprovals(prev => [...prev, approvalReq]);
      if (dgUser && setNotifications) setNotifications(prev => [{
        id:"N"+Date.now(), icon:"⏸️",
        message:`⏸️ Approbation requise (RH→DG) : Suspension de ${targetUser.name} — Motif: ${suspForm.motif} — Demandé par ${localUser.name}`,
        at:new Date().toISOString(), read:false, module:"gestion_comptes", targetUsers:[dgUser.id]
      },...prev]);
      setShowSuspendModal(null);
      setSuspForm({ type:"PROVISOIRE", cause:"SANCTION", motif:"", endDate:"", sessionOnly:false, attachments:[] });
      gcAlert(`⏳ Demande de suspension soumise au Directeur Général.

${targetUser.name} sera suspendu(e) seulement après approbation DG.`);
      return;
    }

    setUsers(prev => { const _u=prev.map(u => u.id===targetUser.id ? {
      ...u, accountStatus: newStatus,
      suspensionType: suspForm.type, suspensionCause: suspForm.cause,
      suspensionMotif: suspForm.motif, suspensionEndDate: suspForm.endDate||null,
      suspensionBy: localUser.id, suspensionByName: localUser.name, suspensionAt: new Date().toISOString()} : u); dsSave('users',_u); return _u; });

    notify("⏸️", `[COMPTE ${label.toUpperCase()}] ${targetUser.name} — Cause : ${SUSPENSION_CAUSES.find(c=>c.value===suspForm.cause)?.label||suspForm.cause} — Par : ${localUser.name}`, "gestion_comptes");
    createTask(`[SUSPENSION] Suivi compte ${targetUser.name} — ${label}`, findAdmin()?.id || localUser.id, "HAUTE");

    if (setSessionLogs) setSessionLogs(prev => [{
      id:"SES-"+Date.now(), type:"SUSPENSION", userId:targetUser.id, userName:targetUser.name,
      userRole:targetUser.role, userLevel:targetUser.level, userProcess:targetUser.process||"—",
      at:new Date().toISOString(), ip:"—", device:"Direction SI", status:newStatus,
      reason:`${suspForm.motif} (par ${localUser.name})`}, ...prev]);

    setShowSuspendModal(null);
    setSuspForm({ type:"PROVISOIRE", cause:"SANCTION", motif:"", endDate:"", sessionOnly:false });
    gcAlert(`✅ Compte ${targetUser.name} → ${label}\n\nMotif enregistré. Notifications envoyées.`);
  };

  const handleLiftSuspension = async (targetUser) => {
    if (!await gcConfirm(`Réactiver le compte de ${targetUser.name} ?`)) return;
    // v117 — Circuit court: RH initie, DG confirme avant prise à effet
    if (isRH && !isAdmin && !isDG) {
      const dgUser = users.find(u => (u.isMG || u.id === "USR-MG-001" || u.level === 5) && !u.isAdmin);
      const req = {
        id:"APPRO-REACT-"+Date.now(), type:"RH_REACTIVATION",
        targetUserId:targetUser.id, targetUserName:targetUser.name, targetUserRole:targetUser.role,
        initiatedBy:localUser.id, initiatedByName:localUser.name, initiatedByRole:localUser.role,
        initiatedAt:new Date().toISOString(), status:"EN_ATTENTE_DG"};
      if (setPendingApprovals) setPendingApprovals(prev => [...prev, req]);
      if (dgUser && setNotifications) setNotifications(prev=>[{
        id:"N"+Date.now(), icon:"✅",
        message:`✅ Approbation requise (RH→DG) : Réactivation de ${targetUser.name} — Demandé par ${localUser.name}`,
        at:new Date().toISOString(), read:false, module:"gestion_comptes", targetUsers:[dgUser.id]
      },...prev]);
      // Push notif LS to DG
      if (dgUser) { try { const k=`gc-notif-${dgUser.id}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now(),icon:"✅",message:`[RH→DG] Réactivation compte ${targetUser.name} à approuver`,at:new Date().toISOString(),read:false,module:"gestion_comptes",urgent:true}); _lsSet(k,JSON.stringify(ex.slice(0,200))); } catch(_) {} }
      gcAlert(`⏳ Demande de réactivation soumise au Directeur Général.
${targetUser.name} sera réactivé(e) seulement après approbation DG.`);
      return;
    }
    setUsers(prev => { const _u=prev.map(u => u.id===targetUser.id ? {
      ...u, accountStatus:"ACTIF",
      suspensionType:null, suspensionCause:null, suspensionMotif:null,
      suspensionEndDate:null, suspensionBy:null, suspensionAt:null,
      reactivatedBy:localUser.id, reactivatedAt:new Date().toISOString()} : u); dsSave('users',_u); return _u; });
    notify("✅", `Compte réactivé : ${targetUser.name} — Par : ${localUser.name}`, "gestion_comptes");
    createTask(`[RÉACTIVATION] Compte ${targetUser.name} réactivé — Suivi`, localUser.id, "NORMALE");
    gcAlert(`✅ Compte de ${targetUser.name} réactivé avec succès.`);
  };

  const handleDeleteUser = (targetUser) => {
    if (!isAdmin) { gcAlert("Seule la Direction peut supprimer définitivement un compte."); return; }
    if (targetUser.id === "USR-ADM-000") { gcAlert("Le compte administrateur principal ne peut pas être supprimé."); return; }
    setUsers(prev => {const updated=prev.filter(u => u.id !== targetUser.id);dsSaveUsersWithPrune(updated, localUser.id).catch(()=>{});return updated;});
    notify("🗑️", `[COMPTE SUPPRIMÉ] ${targetUser.name} (${targetUser.id}) supprimé définitivement par ${localUser.name}`, "gestion_comptes");
    if (setSessionLogs) setSessionLogs(prev => [{
      id:"SES-"+Date.now(), type:"SUPPRESSION", userId:targetUser.id, userName:targetUser.name,
      userRole:targetUser.role, userLevel:targetUser.level, userProcess:targetUser.process||"—",
      at:new Date().toISOString(), ip:"—", device:"Direction SI", status:"DELETED",
      reason:`Suppression définitive par ${localUser.name}`}, ...prev]);
    setShowDeleteModal(null);
    gcAlert(`✅ Compte ${targetUser.name} supprimé définitivement.`);
  };

  const handleRHSuggest = () => {
    if (!rhForm.targetUser) { gcAlert("Sélectionnez un utilisateur."); return; }
    if (!rhForm.motif.trim()) { gcAlert("Le motif est obligatoire."); return; }
    const dg = findDG();
    const action = {
      id:"ACT-"+Date.now(), type:rhForm.type,
      targetUserId:rhForm.targetUser.id, targetUserName:rhForm.targetUser.name, targetUserRole:rhForm.targetUser.role,
      initiatedBy:localUser.id, initiatedByName:localUser.name, initiatedByRole:localUser.role,
      initiatedAt:new Date().toISOString(),
      suspensionType:rhForm.suspType, cause:rhForm.cause, motif:rhForm.motif, endDate:rhForm.endDate||null,
      status:"EN_ATTENTE_DG", dgResponse:null, dgResponseAt:null};
    setPendingAccountActions(prev => { const updated = [...prev, action]; dsSave("gc-account-actions", updated).catch(() => {}); return updated; });

    const dgId = dg?.id || "USR-MG-001";
    const adminId = findAdmin()?.id;
    const typeLabel = rhForm.type==="SUSPENSION"?"Suspension":rhForm.type==="SUPPRESSION"?"Suppression":"Création";
    notify("📋", `[RH → DG] ${typeLabel} de compte ${rhForm.targetUser.name} suggérée par ${localUser.name} — En attente de votre approbation`, "gestion_comptes");
    createTask(`[APPROBATION RH] ${typeLabel} compte ${rhForm.targetUser.name} — Décision DG requise`, dgId, "HAUTE");
    if (adminId) createTask(`[INFO ADMIN] Suggestion RH : ${typeLabel} ${rhForm.targetUser.name} — Suivi`, adminId, "NORMALE");

    setShowRHSuggest(null);
    setRhForm({ type:"SUSPENSION", suspType:"PROVISOIRE", cause:"SANCTION", motif:"", endDate:"", targetUser:null });
    gcAlert(`✅ Suggestion envoyée au Directeur Général.\n\nUne tâche d'approbation a été créée dans son espace.`);
  };

  const handleRHCreateAccount = () => {
    if (!createForm.name || !createForm.email) { gcAlert("Nom et email obligatoires."); return; }
    const genId = `USR-${createForm.process.replace(/[^A-Z0-9]/g,"")}-${String(Date.now()).slice(-4)}`;

    if ((isAdmin && createForm.bypass) || (isDG && createForm.dgDirect)) {
      const avatarChars = createForm.name.trim().split(/\s+/).map(w=>w[0]||"").join("").slice(0,2).toUpperCase();
      const colors = ["#3B82F6","#22C55E","#A855F7","#F59E0B","#06B6D4","#EC4899"];
      const newUser = {
        id:genId, name:createForm.name, alias:createForm.name.split(" ")[0].toLowerCase(),
        role:createForm.role||"Collaborateur", dept:createForm.dept||"Non défini",
        process:createForm.process, level:createForm.level, avatar:avatarChars,
        color:colors[Math.floor(Math.random()*colors.length)], isAdmin:createForm.level>=6,
        sexe:createForm.sexe||"N/A", nationalite:createForm.nationalite||"Gabonaise",
        situationMatrimoniale:"N/A", telephone:createForm.telephone||"+241 000 000 000",
        email:createForm.email, adresse:"Libreville, Gabon",
        bio:`${createForm.role} au cabinet Génie Consultant.`,
        photoUrl:null, accountStatus:"ACTIF",
        createdAt:new Date().toISOString(),
        needsSirhOnboarding: true,
        ...(isAdmin ? {createdByAdmin:true, createdByAdminId:localUser.id} : {}),
        ...(isDG ? {createdByDG:true, createdByDGId:localUser.id, createdByDGName:localUser.name} : {})};
      // FIX v129 — Hash du mot de passe avant stockage (était en clair avant).
      // Le mot de passe initial reste les 6 derniers chars de l'ID pour la communication,
      // mais seul le hash est persisté en base (localStorage + SQLite).
      const initialPwd = genId.slice(-6);
      gcHashPassword(initialPwd).then(hash => {
        const userWithHash = { ...newUser, passwordHash: hash };
        setUsers(prev => prev.find(u => u.id === genId)
          ? prev.map(u => u.id === genId ? userWithHash : u)
          : [...prev, gcNormalizeUser(userWithHash)]
        );
      }).catch(() => { setUsers(prev => {const updated=[...prev,gcNormalizeUser(newUser)];dsSave('users',updated);return updated;}); });
      setUsers(prev => [...prev, gcNormalizeUser(newUser)]); // insertion immédiate (hash arrive après)
      const who = isAdmin ? `Admin (${localUser.name})` : `DG (${localUser.name})`;
      notify("👤", `[COMPTE CRÉÉ] ${newUser.name} (${genId}) — Créé directement par ${who}`, "gestion_comptes");
      const rhUserForSirh = users.find(u => (u.process === "S03" || u.processes?.includes?.("S03")) && u.level >= 4 && !u.isAdmin);
      if (rhUserForSirh) {
        notify("👥", `[RH → SIRH] Intégration requise — ${newUser.name} créé par ${who} · À incorporer dans la base RH (présences, paie, congés)`, "sirh");
        createTask(`[ONBOARDING SIRH] ${newUser.name} — Incorporation base personnel, fiche présence et paie obligatoire`, rhUserForSirh.id, "HAUTE");
      }
      const code = generateCode();
      const now = new Date().toISOString();
      const approvalData = {approved:true, by:localUser.name, byId:localUser.id, at:now, adminBypass:true};
      const newApproval = {
        id:`APPRO-${Date.now()}`, type:"CREATION_COMPTE",
        applicant:createForm.name, function:createForm.role||"Collaborateur",
        submittedAt:now, status:"APPROUVE",
        approvals:{rh:approvalData, conformite:approvalData, dg:approvalData},
        generatedId:genId, alertsSent:0,
        tel:createForm.telephone||"", email:createForm.email,
        process:createForm.process, level:createForm.level, dept:createForm.dept,
        accessCode:code, accountCreated:true, accountCreatedAt:now,
        lastActionBy:localUser.name, lastActionAt:now};
      setPendingApprovals(prev => [...prev, newApproval]);
      setShowCreateModal(false);
      gcAlert(`✅ Compte créé directement par ${isDG?"le DG":"l'Admin"}.\n\nID : ${genId}\nMot de passe initial : ${genId.slice(-6)}\nCode d'accès : ${code}\n\n📋 Communiquez ces informations au collaborateur.\n👥 La Responsable RH a été notifiée pour l'intégration SIRH.`);
      return;
    }

    const dg = findDG();
    const newPending = {
      id:`APPRO-${Date.now()}`, type:"CREATION_COMPTE",
      applicant:createForm.name, function:createForm.role||"Collaborateur",
      submittedAt:new Date().toISOString(),
      status:"ATTENTE_RH",  // Début du circuit officiel
      approvals:{ rh:null, conformite:null, dg:null },
      generatedId:genId, alertsSent:0,
      tel:createForm.telephone||"", email:createForm.email,
      process:createForm.process, level:createForm.level, dept:createForm.dept,
      initiatedByDG:isDG, initiatedByDGName:isDG?localUser.name:undefined,
      motif:createForm.motif,
      notifsSent:{ rh:false, conformite:false, dg:false },
      // FIX v143 — processes normalisé dès le pending (appliqué à la validation DG)
      processes: [...new Set([createForm.process || 'O01', ...(createForm.processes||[]).filter(Boolean)])].filter(Boolean),
    };
    setPendingApprovals(prev => [...prev, newPending]);

    const rhUser = users.find(u => (u.process === "S03" || u.processes?.includes?.("S03")) && u.level >= 4 && !u.isAdmin);
    const confUser = findConf();
    notify("📤", `[CIRCUIT OFFICIEL] Création compte ${createForm.name} initiée — Circuit : RH → Conformité (P02) → DG. Notifié : RH${rhUser?" ("+rhUser.name+")":""} · Conformité${confUser?" ("+confUser.name+")":""} · DG`, "gestion_comptes");
    if (rhUser) createTask(`[DOSSIER RH] Création compte ${createForm.name} (${createForm.process} Niv.${createForm.level}) — Étape 1/3 : Validation RH requise`, rhUser.id, "HAUTE");

    setShowCreateModal(false);
    setCreateForm({ name:"", role:"", email:"", telephone:"", process:"O01", level:2, dept:"", sexe:"", nationalite:"Gabonaise", motif:"", bypass:false, dgDirect:false, funcValue:"", processes:["O01"] });
    gcAlert(`✅ Circuit officiel lancé.\n🔗 RH ⏳ → Conformité ⏳ → DG ⏳\n\nUne tâche a été créée pour le Responsable RH (Étape 1/3).`);
  };

  const handleDGDecision = (actionId, approved) => {
    const action = pendingAccountActions.find(a => a.id === actionId);
    if (!action) return;

    const reason = approved ? null : gcPrompt("Motif du refus :");
    if (!approved && !reason) return;

    setPendingAccountActions(prev => prev.map(a => a.id===actionId ? {
      ...a, status: approved?"APPROUVE_DG":"REJETE_DG",
      dgResponse:approved?"Approuvé":"Refusé : "+reason,
      dgResponseAt:new Date().toISOString(), dgId:localUser.id} : a));

    if (approved) {
      if (action.type === "SUSPENSION") {
        const newStatus = action.suspensionType==="DEFINITIF"?"SUSPENDU_DEFINITIF":"SUSPENDU_PROVISOIRE";
        setUsers(prev => prev.map(u => u.id===action.targetUserId ? {
          ...u, accountStatus:newStatus,
          suspensionType:action.suspensionType, suspensionCause:action.cause,
          suspensionMotif:action.motif, suspensionEndDate:action.endDate||null,
          suspensionBy:localUser.id, suspensionByName:localUser.name, suspensionAt:new Date().toISOString(),
          suspensionApprovedByDG:true} : u));
        notify("✅", `[DG APPROUVÉ] Suspension ${action.targetUserName} approuvée — Exécution par ${localUser.name}`, "gestion_comptes");
        createTask(`[SUIVI] Suspension ${action.targetUserName} approuvée et exécutée — Archiver RH`, action.initiatedBy, "NORMALE");
      } else if (action.type === "SUPPRESSION") {
        setUsers(prev => { const _u=prev.filter(u=>u.id!==action.targetUserId); dsSave('users',_u); return _u; });
        notify("🗑️", `[DG APPROUVÉ] Suppression compte ${action.targetUserName} approuvée par DG — Exécutée`, "gestion_comptes");
        createTask(`[ARCHIVAGE] Compte ${action.targetUserName} supprimé — Dossier RH à archiver`, action.initiatedBy, "NORMALE");
      } else if (action.type === "CREATION") {
        const colors = ["#3B82F6","#22C55E","#A855F7","#F59E0B","#06B6D4","#EC4899"];
        const nud = action.newUserData || {};
        const avatarChars = (nud.name || action.targetUserName || "?").trim().split(/\s+/).map(w=>w[0]||"").join("").slice(0,2).toUpperCase();
        const alreadyExists = users.find(u => u.id === (nud.id || action.targetUserId));
        if (!alreadyExists) {
          const rawUser = {
            id: nud.id || action.targetUserId,
            name: nud.name || action.targetUserName,
            alias: (nud.name || action.targetUserName || "").split(" ")[0].toLowerCase(),
            role: nud.role || action.targetUserRole || "Collaborateur",
            dept: nud.dept || "",
            process: nud.process || "O01",
            level: nud.level || 2,
            processes: nud.processes || [],
            avatar: avatarChars,
            color: colors[Math.floor(Math.random() * colors.length)],
            isAdmin: (nud.level || 2) >= 6,
            sexe: nud.sexe || "N/A",
            nationalite: nud.nationalite || "Gabonaise",
            situationMatrimoniale: nud.sitMatrimoniale || "N/A",
            telephone: nud.telephone || "+241 000 000 000",
            email: nud.email || "",
            adresse: nud.adresse || "Libreville, Gabon",
            bio: `${nud.role || "Collaborateur"} au cabinet Génie Consultant.`,
            photoUrl: nud.uploadedDocs?.photo?.dataUrl || null,
            accountStatus: "ACTIF",
            createdAt: new Date().toISOString(),
            createdViaApproval: true,
            approvedByDG: localUser.id,
            needsSirhOnboarding: true};
          // FIX v143 — gcNormalizeUser garantit process+processes toujours cohérents
          const newUser = gcNormalizeUser(rawUser);
          // FIX v129 — Hash du mot de passe avant stockage (était en clair).
          // Le mot de passe initial = 6 derniers chars de l'ID (communiqué au collaborateur).
          const approvalInitialPwd = (nud.id || action.targetUserId).slice(-6);
          setUsers(prev => [...prev, newUser]); // insertion immédiate
          gcHashPassword(approvalInitialPwd).then(hash => {
            setUsers(prev => prev.map(u =>
              u.id === (nud.id || action.targetUserId)
                ? { ...u, passwordHash: hash }
                : u
            ));
          }).catch(() => {});
        }
        const now = new Date().toISOString();
        setPendingApprovals(prev => prev.map(a => a.generatedId === action.targetUserId
          ? { ...a, status: "APPROUVE", accountCreated: true, accountCreatedAt: now, approvals: { ...a.approvals, dg: { approved: true, by: localUser.name, byId: localUser.id, at: now } } }
          : a
        ));
        notify("👤", `[DG APPROUVÉ] Compte ${action.targetUserName} créé — ID : ${nud.id || action.targetUserId}`, "gestion_comptes");
        const rhUser = users.find(u => (u.process === "S03" || u.processes?.includes?.("S03")) && u.level >= 4 && !u.isAdmin);
        if (rhUser) {
          notify("👥", `[RH → SIRH] Nouveau collaborateur ${action.targetUserName} approuvé par DG — Intégration base RH (présences, paie, congés) requise`, "sirh");
          createTask(`[ONBOARDING SIRH] ${action.targetUserName} — Incorporation base personnel, fiche présence et paie`, rhUser.id, "HAUTE");
        }
        createTask(`[COMPTE CRÉÉ] ${action.targetUserName} — Informer le collaborateur de ses accès`, action.initiatedBy || localUser.id, "HAUTE");
      }
    } else {
      notify("❌", `[DG REFUSÉ] ${action.type} de ${action.targetUserName} refusée par DG — Motif : ${reason}`, "gestion_comptes");
      createTask(`[REFUS DG] ${action.type} de ${action.targetUserName} refusée — Motif : ${reason}`, action.initiatedBy, "NORMALE");
    }
    gcAlert(`✅ Décision enregistrée : ${approved?"Approuvé":"Refusé"} — Notifications envoyées.`);
  };

  const filteredUsers = users.filter(u => { if(!_activeUser(u)) return false;
    // L'admin (niveau 6) est invisible pour les niveaux 1-5
    if (u.isAdmin && !isAdmin) return false;
    const status = u.accountStatus || "ACTIF";
    const statusOk = userFilter==="ALL" || (userFilter==="ACTIF"&&status==="ACTIF") || (userFilter==="SUSPENDU"&&status.startsWith("SUSPENDU")) || (userFilter==="BLOQUE"&&status==="BLOQUE");
    const searchOk = !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.role?.toLowerCase().includes(userSearch.toLowerCase()) || u.id?.toLowerCase().includes(userSearch.toLowerCase());
    return statusOk && searchOk;
  });

  const pendingActionsForDG = (pendingAccountActions||[]).filter(a=>a.status==="EN_ATTENTE_DG");
  const myActions = (pendingAccountActions||[]).filter(a=>a.initiatedBy===localUser.id);

  const stats = {
    total:users.length,
    actifs:users.filter(u=>_activeUser(u)&&(u.accountStatus||"ACTIF")==="ACTIF").length,
    suspendus:users.filter(u=>_activeUser(u)&&(u.accountStatus||"ACTIF").startsWith("SUSPENDU")).length,
    bloques:users.filter(u=>_activeUser(u)&&(u.accountStatus||"ACTIF")==="BLOQUE").length,
    pending:pendingActionsForDG.length};

  const RoleBadge = () => {
    if (isAdmin) return <span style={{background:"#C41E3A22",color:"#C41E3A",border:"1px solid #C41E3A44",borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:800}}>⚙️ ADMIN — Accès total</span>;
    if (isDG) return <span style={{background:"#C9A84C22",color:"#C9A84C",border:"1px solid #C9A84C44",borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:800}}>👑 DIRECTEUR GÉNÉRAL</span>;
    if (isRH) return <span style={{background:"#22C55E22",color:"#22C55E",border:"1px solid #22C55E44",borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:800}}>👥 RH — Notification & Approbation (S03)</span>;
    if (isConf) return <span style={{background:getProcColor("P02")+"22",color:getProcColor("P02"),border:`1px solid ${getProcColor("P02")}44`,borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:800}}>⚖️ CONFORMITÉ — Notification & Approbation (P02)</span>;
    return null;
  };

  const rhPendingDossiers = (pendingApprovals||[]).filter(a => a.type==="CREATION_COMPTE" && (a.status==="ATTENTE_RH" || a.status==="ATTENTE_CONF" || a.status==="ATTENTE_DG"));
  const confPendingDossiers = (pendingApprovals||[]).filter(a => a.type==="CREATION_COMPTE" && (a.status==="ATTENTE_CONF" || a.status==="ATTENTE_DG"));

  const GC_TABS = [
    ...(isAdmin||isDG ? [{id:"comptes", icon:"👥", label:`Comptes (${users.length})`}] : []),
    ...(isDG||isAdmin ? [{id:"approbations_dg", icon:"✅", label:`Approbations DG (${pendingActionsForDG.length})`, alert:pendingActionsForDG.length>0}] : []),
    ...((isAdmin||isDG||isRH||isConf) ? [{id:"connexions_en_attente", icon:"🔗", label:`Demandes Connexion (${pendingConns.length})`, alert:pendingConns.length>0}] : []),
    ...((isAdmin||isDG||isRH||isConf||localUser.level>=4) ? [{id:"circuits_approbation", icon:"✅", label:`Approbations & Validation RH (${(pendingApprovals||[]).filter(a=>!["APPROUVE","REJETE"].includes(a.status)).length})`, alert:(pendingApprovals||[]).filter(a=>!["APPROUVE","REJETE"].includes(a.status)).length>0}] : []),
    ...(isRH ? [{id:"dossiers_rh", icon:"📥", label:`Dossiers reçus (${rhPendingDossiers.filter(a=>a.status==="ATTENTE_RH").length})`, alert:rhPendingDossiers.filter(a=>a.status==="ATTENTE_RH").length>0}] : []),
    ...(isRH ? [{id:"mes_demandes", icon:"📋", label:`Mes demandes (${myActions.length})`}] : []),
    ...(isRH ? [{id:"rh_suggest", icon:"💡", label:"Nouvelle suggestion"}] : []),
    ...(isConf ? [{id:"dossiers_conf", icon:"⚖️", label:`Dossier Unique (${confPendingDossiers.filter(a=>a.status==="ATTENTE_CONF").length} en attente)`, alert:confPendingDossiers.filter(a=>a.status==="ATTENTE_CONF").length>0}] : []),
    ...(isAdmin||isDG ? [{id:"creer_compte", icon:"➕", label:"Créer un collaborateur"}] : []),
    ...(isAdmin||isDG ? [{id:"historique", icon:"📊", label:"Historique & Journaux"}] : []),
  ];

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div>
          <h3 style={{color:"#C41E3A",margin:0,fontWeight:800,fontSize:15}}>🔑 Gestion Avancée des Comptes SI</h3>
          <div style={{color:T.textMuted,fontSize:11,marginTop:3}}>Suspension · Suppression · Création · Approbations · Journalisation complète</div>
        </div>
        <RoleBadge />
      </div>

      {/* KPI Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
        {[
          {l:"Total comptes",v:stats.total,i:"👥",c:"#3B82F6"},
          {l:"Actifs",v:stats.actifs,i:"🟢",c:"#22C55E"},
          {l:"Suspendus",v:stats.suspendus,i:"🟠",c:"#F97316"},
          {l:"Bloqués",v:stats.bloques,i:"🔴",c:"#EF4444"},
          {l:"En attente DG",v:stats.pending,i:"⏳",c:"#F59E0B"},
        ].map(s=>(
          <div key={s.l} style={{background:s.c+"11",border:`1px solid ${s.c}33`,borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
            <div style={{fontSize:18}}>{s.i}</div>
            <div style={{color:s.c,fontWeight:900,fontSize:18}}>{s.v}</div>
            <div style={{color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:0.4,marginTop:1}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="gc-tabs-scroll" style={{display:"flex",gap:4,marginBottom:14,borderBottom:`1px solid ${T.border}`,paddingBottom:8,overflowX:"auto",flexWrap:"nowrap",WebkitOverflowScrolling:"touch"}}>
        {GC_TABS.map(tab=>(
          <button key={tab.id} onClick={()=>setGcTab(tab.id)}
            style={{background:gcTab===tab.id?"#C41E3A":T.surface2,color:gcTab===tab.id?"#fff":T.textMuted,border:`1px solid ${gcTab===tab.id?"#C41E3A":tab.alert?"#F59E0B":T.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",flexShrink:0}}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.alert&&tab.id!==gcTab&&<span style={{background:"#F59E0B",color:"#000",borderRadius:"50%",width:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900}}>{tab.id==="connexions_en_attente"?pendingConns.length:pendingActionsForDG.length}</span>}
          </button>
        ))}
      </div>

      {/* ══ TAB: COMPTES ══ */}
      {gcTab === "comptes" && (isAdmin || isDG) && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="🔍 Rechercher…"
              style={{flex:1,minWidth:180,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}} />
            {["ALL","ACTIF","SUSPENDU","BLOQUE"].map(f=>(
              <button key={f} onClick={()=>setUserFilter(f)}
                style={{background:userFilter===f?"#C41E3A":T.surface2,color:userFilter===f?"#fff":T.textMuted,border:`1px solid ${userFilter===f?"#C41E3A":T.border}`,borderRadius:16,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:userFilter===f?700:400}}>
                {f==="ALL"?"Tous":f==="ACTIF"?"🟢 Actifs":f==="SUSPENDU"?"🟠 Suspendus":"🔴 Bloqués"}
              </button>
            ))}
            {isAdmin && <button onClick={()=>setGcTab("creer_compte")} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>➕ Créer compte</button>}
            {isDG && <button onClick={()=>setGcTab("creer_compte")} style={{background:"linear-gradient(135deg,#C9A84C,#E8C054)",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>👑 Ajouter collaborateur</button>}
          </div>

          {filteredUsers.map(u => {
            const status = u.accountStatus || "ACTIF";
            const cfg = ACCOUNT_STATUS_CONFIG[status] || ACCOUNT_STATUS_CONFIG.ACTIF;
            const isSelf = u.id === localUser.id;
            const isProtected = u.id === "USR-ADM-000";
            const canSuspend = canSuspendDirect && !isSelf && !isProtected;
            const canDel = isAdmin && !isSelf && !isProtected;
            return (
              <div key={u.id} style={{background:T.surface2,border:`1px solid ${status!=="ACTIF"?cfg.color+"44":T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <UserAvatar user={u} size={36} style={{opacity:status!=="ACTIF"?0.6:1}} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{color:T.text,fontWeight:700,fontSize:13}}>{u.name}</span>
                      <StatusBadge status={status} />
                      {u.isAdmin&&isAdmin&&<span style={{background:"#C41E3A22",color:"#C41E3A",borderRadius:6,padding:"1px 6px",fontSize:9,fontWeight:700}}>ADMIN</span>}
                      {(u.isMG||u.id==="USR-MG-001")&&<span style={{background:"#C9A84C22",color:"#C9A84C",borderRadius:6,padding:"1px 6px",fontSize:9,fontWeight:700}}>DG</span>}
                    </div>
                    <div style={{color:T.textMuted,fontSize:10,marginTop:1}}>{u.role} · Niv.{u.level} · {u.process} · {u.email}</div>
                    <div style={{color:T.textDim,fontSize:9,fontFamily:"monospace"}}>{u.id}</div>
                    {status!=="ACTIF"&&u.suspensionMotif&&(
                      <div style={{background:cfg.color+"11",border:`1px solid ${cfg.color}22`,borderRadius:6,padding:"4px 8px",marginTop:4,fontSize:10}}>
                        <span style={{color:cfg.color,fontWeight:700}}>Motif : </span><span style={{color:T.text}}>{u.suspensionMotif}</span>
                        {u.suspensionEndDate&&<span style={{color:T.textMuted}}> · Jusqu'au {formatDate(u.suspensionEndDate)}</span>}
                        {u.suspensionByName&&<span style={{color:T.textDim}}> · Par : {u.suspensionByName}</span>}
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    {status==="ACTIF" && canSuspend && (
                      <button onClick={() => {setShowSuspendModal(u);setSuspForm({type:"PROVISOIRE",cause:"SANCTION",motif:"",endDate:"",sessionOnly:false});}}
                        style={{background:"#F97316 22",border:"1px solid #F9731644",color:"#F97316",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>⏸️ Suspendre</button>
                    )}
                    {status!=="ACTIF" && canSuspend && (
                      <button onClick={()=>handleLiftSuspension(u)}
                        style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>▶️ Réactiver</button>
                    )}
                    {isRH && !isSelf && !isProtected && status==="ACTIF" && (
                      <button onClick={()=>setShowRHSuggest({user:u})}
                        style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>💡 Suggérer action</button>
                    )}
                    {canDel && (
                      <button onClick={()=>setShowDeleteModal(u)}
                        style={{background:"#EF444415",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️ Supprimer</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredUsers.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:40}}>Aucun compte trouvé</div>}
        </div>
      )}

      {/* ══ TAB: APPROBATIONS DG ══ */}
      {gcTab === "approbations_dg" && (isAdmin || isDG) && (
        <div>
          <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:11,color:T.text}}>
            ⚡ Actions soumises par la RH nécessitant votre décision. Chaque décision génère automatiquement les notifications et tâches de suivi.
          </div>
          {pendingActionsForDG.length === 0 ? (
            <div style={{background:T.surface2,borderRadius:10,padding:40,textAlign:"center",color:T.textMuted,fontSize:13}}>✅ Aucune demande en attente de votre décision</div>
          ) : pendingActionsForDG.map(action => {
            const typeColors = { SUSPENSION:"#F97316", SUPPRESSION:"#EF4444", CREATION:"#22C55E" };
            const color = typeColors[action.type] || "#3B82F6";
            const typeLabel = action.type==="SUSPENSION"?"⏸️ Suspension":action.type==="SUPPRESSION"?"🗑️ Suppression":"➕ Création";
            return (
              <div key={action.id} style={{background:T.surface2,border:`1px solid ${color}44`,borderRadius:12,padding:16,marginBottom:10}}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
                  <div style={{width:40,height:40,borderRadius:10,background:color+"22",border:`1px solid ${color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{typeLabel.slice(0,2)}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                      <span style={{fontWeight:800,fontSize:13,color:T.text}}>{typeLabel.slice(3)} — {action.targetUserName}</span>
                      <span style={{background:color+"22",color,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{action.type}</span>
                      {action.suspensionType&&<span style={{background:T.surface3,color:T.textMuted,borderRadius:6,padding:"2px 8px",fontSize:9}}>{action.suspensionType}</span>}
                    </div>
                    <div style={{color:T.textMuted,fontSize:10}}>Soumis par <strong>{action.initiatedByName}</strong> ({action.initiatedByRole}) le {formatDateTime(action.initiatedAt)}</div>
                    <div style={{background:T.surface3,borderRadius:6,padding:"6px 10px",marginTop:6}}>
                      <div style={{color:T.textDim,fontSize:9,textTransform:"uppercase",marginBottom:2}}>Motif</div>
                      <div style={{color:T.text,fontSize:11}}>{action.motif}</div>
                      {action.cause&&<div style={{color:T.textMuted,fontSize:10,marginTop:2}}>Cause : {SUSPENSION_CAUSES.find(c=>c.value===action.cause)?.label||action.cause}</div>}
                      {action.endDate&&<div style={{color:T.textMuted,fontSize:10}}>Jusqu'au : {formatDate(action.endDate)}</div>}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,borderTop:`1px solid ${T.border}`,paddingTop:10}}>
                  <button onClick={()=>handleDGDecision(action.id, true)}
                    style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12,flex:1}}>
                    ✅ Approuver & Exécuter
                  </button>
                  <button onClick={()=>handleDGDecision(action.id, false)}
                    style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                    ❌ Refuser
                  </button>
                </div>
              </div>
            );
          })}
          {/* ── Changements d'accès SIRH en attente d'approbation DG ── */}
          {(()=>{
            const sirhDG = (pendingApprovals||[]).filter(a => a.type==="SIRH_ACCESS_CHANGE" && a.status==="EN_ATTENTE_DG");
            if (!sirhDG.length) return null;
            return (
              <div style={{marginBottom:20}}>
                <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                  🔐 Changements d'accès SIRH — Décision finale requise ({sirhDG.length})
                </div>
                {sirhDG.map(req => {
                  const chg = req.changes || {};
                  return (
                    <div key={req.id} style={{background:T.surface2,border:"1px solid #A855F744",borderRadius:12,padding:16,marginBottom:10}}>
                      <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
                        <div style={{width:40,height:40,borderRadius:10,background:"#A855F722",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🔐</div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:800,fontSize:13,color:T.text}}>Changement accès — {req.targetUserName}</div>
                          <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>Demandé par <strong>{req.initiatedByName}</strong> · Approuvé Conf. P02 : <strong>{req.approvals?.conformite?.by||"—"}</strong></div>
                        </div>
                        <span style={{background:"#22C55E22",color:"#22C55E",border:"1px solid #22C55E44",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700}}>✅ Conf. validé</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                        <div style={{background:"#EF444411",border:"1px solid #EF444433",borderRadius:8,padding:"8px 12px"}}>
                          <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",fontWeight:700,marginBottom:4}}>🏷️ Niveau</div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{background:T.surface3,color:T.textMuted,borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>Niv.{chg.level?.from}</span>
                            <span style={{color:"#EF4444",fontWeight:900}}>→</span>
                            <span style={{background:"#22C55E22",color:"#22C55E",borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>Niv.{chg.level?.to}</span>
                          </div>
                        </div>
                        <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px"}}>
                          <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",fontWeight:700,marginBottom:4}}>🗂️ Processus</div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{background:T.surface3,color:T.textMuted,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700}}>{chg.process?.from}</span>
                            <span style={{color:"#3B82F6",fontWeight:900}}>→</span>
                            <span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700}}>{chg.process?.to}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8,borderTop:`1px solid ${T.border}`,paddingTop:10}}>
                        <button onClick={async ()=>{
                          if(!await gcConfirm(`Approuver définitivement le changement d'accès SIRH de ${req.targetUserName} ?\nNiv.${chg.level?.from}→${chg.level?.to} / ${chg.process?.from}→${chg.process?.to}`)) return;
                          // ✅ Application réelle du changement — gcNormalizeUserProcess garantit process+processes cohérents
                          setUsers(prev => {
                            const updated = prev.map(u => {
                              if (u.id !== req.targetUserId) return u;
                              const newProcess = chg.process?.to ?? u.process;
                              const newLevel   = chg.level?.to ?? u.level;
                              return {
                                ...gcNormalizeUserProcess(u, newProcess),
                                level: newLevel,
                                ...(req.nonSensitiveChanges||{}),
                                updatedAt: new Date().toISOString(),
                                updatedBy: localUser.id,
                                lastAccessChangeApprovedBy: localUser.id,
                                lastAccessChangeAt: new Date().toISOString(),
                              };
                            });
                            dsSave('users', updated).catch(err => gcToast.syncError('users', err));
                            return updated;
                          });
                          setPendingApprovals(prev => prev.map(a => a.id===req.id ? {
                            ...a, status:"APPROUVE",
                            approvals: { ...a.approvals, dg: { approved:true, by:localUser.name, byId:localUser.id, at:new Date().toISOString() } }
                          } : a));
                          // Notifier l'initiateur
                          const initiator = users.find(u=>u.id===req.initiatedBy);
                          if(initiator) setNotifications(prev=>[{id:"N"+Date.now(),icon:"✅",message:`✅ Changement d'accès SIRH approuvé par le DG — ${req.targetUserName} est maintenant Niv.${chg.level?.to} / ${chg.process?.to}`,at:new Date().toISOString(),read:false,module:"sirh",forUser:initiator.id},...prev]);
                          // Notifier l'utilisateur cible
                          setNotifications(prev=>[{id:"N"+Date.now(),icon:"🔐",message:`Votre profil d'accès SIRH a été mis à jour — Niv.${chg.level?.from}→${chg.level?.to} / ${chg.process?.from}→${chg.process?.to}`,at:new Date().toISOString(),read:false,module:"sirh",forUser:req.targetUserId},...prev]);
                          if (typeof playSound === 'function') playSound("success");
                          gcAlert(`✅ Changement d'accès SIRH appliqué.\n${req.targetUserName} — Niv.${chg.level?.to} / ${chg.process?.to}\nNotifications envoyées.`);
                        }} style={{flex:1,background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                          ✅ Approuver & Appliquer définitivement
                        </button>
                        <button onClick={async ()=>{
                           
                          const motif = await gcPrompt(`Motif du refus DG — ${req.targetUserName} :`);
                          if(motif===null) return;
                          setPendingApprovals(prev=>prev.map(a=>a.id===req.id?{...a,status:"REJETE",approvals:{...a.approvals,dg:{approved:false,motif,by:localUser.name,byId:localUser.id,at:new Date().toISOString()}}}:a));
                          const initiator=users.find(u=>u.id===req.initiatedBy);
                          if(initiator) setNotifications(prev=>[{id:"N"+Date.now(),icon:"❌",message:`❌ [DG] Changement d'accès SIRH refusé — ${req.targetUserName} — Motif : ${motif}`,at:new Date().toISOString(),read:false,module:"sirh",forUser:initiator.id},...prev]);
                          gcAlert(`❌ Refusé. Motif consigné. L'initiateur est notifié.`);
                        }} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                          ❌ Refuser
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Historique des décisions prises */}
          {pendingAccountActions.filter(a=>a.status!=="EN_ATTENTE_DG").length>0&&(
            <div style={{marginTop:20}}>
              <div style={{color:T.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>📋 Décisions récentes</div>
              {pendingAccountActions.filter(a=>a.status!=="EN_ATTENTE_DG").slice(0,5).map(action=>(
                <div key={action.id} style={{background:T.surface2,border:`1px solid ${action.status==="APPROUVE_DG"?"#22C55E44":"#EF444433"}`,borderRadius:8,padding:"10px 12px",marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14}}>{action.status==="APPROUVE_DG"?"✅":"❌"}</span>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:600,fontSize:11}}>{action.type} — {action.targetUserName}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>{action.dgResponse} · {formatDateTime(action.dgResponseAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: CONNEXIONS EN ATTENTE ══ */}
      {gcTab === "connexions_en_attente" && (isAdmin || isDG || isRH) && (
        <div>
          <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:11,color:T.text}}>
            🔗 Connexions hors horaires (avant 8h ou après 17h30) ou comptes suspendus/bloqués. Seuls le <strong>Responsable RH (S03 Niv.4)</strong> et le <strong>Directeur Général (Niv.5)</strong> peuvent approuver. Générez le code d'accès et transmettez-le au collaborateur.
          </div>
          {pendingConns.length === 0 ? (
            <div style={{background:T.surface2,borderRadius:10,padding:40,textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:8}}>✅</div>
              <div style={{color:T.textMuted,fontSize:13,fontWeight:600}}>Aucune demande de connexion en attente</div>
              <div style={{color:T.textDim,fontSize:11,marginTop:4}}>Toutes les connexions sont traitées.</div>
            </div>
          ) : (
            <>
              {/* Bouton "Tout approuver" */}
              {pendingConns.length > 1 && (
                <button onClick={async () => {
                  if (!await gcConfirm(`Approuver les ${pendingConns.length} demandes en attente et générer un code pour chacune ?`)) return;
                  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                  const genCodeBulk = () => { let c=""; for(let i=0;i<8;i++) c+=chars[Math.floor(Math.random()*chars.length)]; return c.slice(0,4)+"-"+c.slice(4); };
                  // FIX v132 — Marquer APPROUVE dans LS (pas vider) + notifier chaque collaborateur
                  const now = new Date();
                  const expiresAt = new Date(now.getTime()+15*60*1000).toISOString();
                  const approvedReqs = pendingConns.map(req => ({
                    ...req, approvedCode: genCodeBulk(), status: "APPROUVE",
                    processedBy: localUser.name, processedAt: now.toISOString(), expiresAt
                  }));
                  // Mettre à jour LS
                  try {
                    const ls = JSON.parse(_lsGet("gc-pending-connections")||"[]");
                    const updated = ls.map(r => { const a=approvedReqs.find(x=>x.id===r.id); return a||r; });
                    _lsSet("gc-pending-connections", JSON.stringify(updated));
                    dsSave("gc-pending-connections", updated).catch(() => {});
                    dsSave("gc-pending-connections", updated).catch(() => {});
                    window.dispatchEvent(new StorageEvent("storage", {key:"gc-pending-connections", newValue:JSON.stringify(updated)}));
                  } catch(_) {}
                  if (setPendingConnections) setPendingConnections(prev => prev.map(r => { const a=approvedReqs.find(x=>x.id===r.id); return a||r; }));
                  approvedReqs.forEach(req => {
                    setUsers(prevU => prevU.map(u => u.id === req.userId ? { ...u, accessCode: req.approvedCode } : u));
                    notify("🔑", `[CONNEXION APPROUVÉE] ${req.userName} — Code : ${req.approvedCode}`, "gestion_comptes");
                    // Notifier le collaborateur
                    try {
                      const k=`gc-notif-${req.userId}`;
                      const ex=JSON.parse(_lsGet(k)||"[]");
                      const typeLabel = req.type==="SUSPENDU"?"compte suspendu":"connexion hors horaires";
                      _lsSet(k,JSON.stringify([{id:"N"+Date.now()+req.userId,icon:"🔑",
                        message:`✅ Accès autorisé (${typeLabel}) — Code : ${req.approvedCode} · Valide 15 min · Saisissez-le sur l'écran de connexion.`,
                        at:now.toISOString(),read:false,urgent:true},...ex].slice(0,200)));
                    } catch(_) {}
                  });
                  gcAlert(`✅ ${approvedReqs.length} connexion(s) approuvées.\n\nChaque collaborateur a reçu une notification avec son code d'accès.\nCodes valides 15 minutes.`);
                }} style={{background:"linear-gradient(135deg,#22C55E,#16A34A)",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12,marginBottom:12,width:"100%"}}>
                  ⚡ Tout approuver ({pendingConns.length} demandes)
                </button>
              )}
              {pendingConns.map(req => {
                const user = users.find(u => u.id === req.userId);
                const existingCode = user?.accessCode || "";
                const approveConn = () => {
                  const code = generateCode();
                  // FIX v132 — Marquer APPROUVE dans LS (ne pas supprimer) pour que Auth puisse lire le code
                  const approvedReq = {...req, approvedCode: code, status: "APPROUVE",
                    processedBy: localUser.name, processedAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now()+15*60*1000).toISOString()};
                  if (setPendingConnections) setPendingConnections(prev => prev.map(r => r.id===req.id ? approvedReq : r));
                  try {
                    const ls = JSON.parse(_lsGet("gc-pending-connections")||"[]");
                    const updated = ls.map(r => r.id===req.id ? approvedReq : r);
                    _lsSet("gc-pending-connections", JSON.stringify(updated));
                    dsSave("gc-pending-connections", updated).catch(() => {});
                    dsSave("gc-pending-connections", updated).catch(() => {});
                    window.dispatchEvent(new StorageEvent("storage", {key:"gc-pending-connections", newValue:JSON.stringify(updated)}));
                  } catch(_) {}
                  // Écrire accessCode sur user comme fallback
                  setUsers(prevU => prevU.map(u => u.id === req.userId ? { ...u, accessCode: code } : u));
                  setPendingApprovals(prev => {
                    const existing = prev.find(a => a.generatedId === req.userId);
                    if (existing) return prev.map(a => a.generatedId === req.userId ? { ...a, accessCode: code, status: "APPROUVE", accountCreated: true, accountCreatedAt: new Date().toISOString(), lastActionBy: localUser.name, lastActionAt: new Date().toISOString() } : a);
                    return prev;
                  });
                  // FIX v132 — Notifier le collaborateur via LS (il le voit dans ses notifs SI)
                  try {
                    const k=`gc-notif-${req.userId}`;
                    const ex=JSON.parse(_lsGet(k)||"[]");
                    const typeLabel = req.type==="SUSPENDU" ? "compte suspendu" : "connexion hors horaires";
                    const n={id:"N"+Date.now(),icon:"🔑",
                      message:`✅ Accès autorisé (${typeLabel}) — Code : ${code} · Valide 15 min · Saisissez-le sur l'écran de connexion.`,
                      at:new Date().toISOString(),read:false,urgent:true};
                    _lsSet(k,JSON.stringify([n,...ex].slice(0,200)));
                  } catch(_) {}
                  notify("🔑", `[CONNEXION APPROUVÉE] ${req.userName} — Code : ${code} — Approuvé par ${localUser.name}`, "gestion_comptes");
                  gcAlert(`✅ Connexion approuvée pour ${req.userName}.\n\n🔑 Code d'accès : ${code}\n\n📋 Le collaborateur est notifié.\nVous pouvez aussi lui communiquer ce code directement.\n\n⏱ Valide 15 minutes.`);
                };
                const rejectConn = async () => {
                  const reason = await gcPrompt(`Motif du refus de connexion pour ${req.userName} (optionnel) :`)||"Refusé par l'administrateur";
                  if (setPendingConnections) setPendingConnections(prev => prev.filter(r => r.id !== req.id));
                  notify("🚫", `[CONNEXION REFUSÉE] ${req.userName} — Motif : ${reason}`, "gestion_comptes");
                };
                return (
                  <div key={req.id} style={{background:T.surface2,border:"2px solid #F59E0B44",borderRadius:12,padding:16,marginBottom:10}}>
                    <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
                      <div style={{width:44,height:44,borderRadius:"50%",background:user?.color||"#F59E0B33",border:"2px solid #F59E0B55",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#fff",fontWeight:800,flexShrink:0}}>
                        {user?.avatar||req.userName?.slice(0,2)||"?"}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:3}}>
                          <span style={{color:T.text,fontWeight:800,fontSize:14}}>{req.userName}</span>
                          <span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700,border:"1px solid #F59E0B44"}}>⏳ EN ATTENTE</span>
                          {existingCode && <span style={{background:"#22C55E22",color:"#22C55E",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700,border:"1px solid #22C55E44"}}>🔑 Code déjà généré</span>}
                        </div>
                        <div style={{color:T.textMuted,fontSize:11}}>{req.userRole||user?.role||"Collaborateur"} · {user?.process||"—"} · Niv.{user?.level||"?"}</div>
                        <div style={{display:"flex",gap:10,marginTop:3}}>
                          <span style={{color:T.textDim,fontSize:10,fontFamily:"monospace"}}>{req.userId}</span>
                          <span style={{color:T.textDim,fontSize:10}}>Demandé le {new Date(req.requestedAt||Date.now()).toLocaleString("fr-FR")}</span>
                        </div>
                      </div>
                    </div>
                    {existingCode && (
                      <div style={{background:"#22C55E15",border:"1px solid #22C55E33",borderRadius:8,padding:"8px 12px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
                        <span style={{color:"#22C55E",fontSize:11,fontWeight:600}}>🔑 Code existant :</span>
                        <span style={{fontFamily:"monospace",fontSize:13,color:"#22C55E",fontWeight:800,letterSpacing:3}}>{existingCode}</span>
                        <button onClick={() => {gcAlert(`Code d'accès pour ${req.userName} :\n\n${existingCode}\n\nCommuniquez ce code au collaborateur.`);}} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>Afficher</button>
                      </div>
                    )}
                    <div style={{background:T.surface3,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11}}>
                      <span style={{color:T.textDim,fontWeight:600,textTransform:"uppercase",fontSize:9,letterSpacing:0.5}}>Informations compte · </span>
                      <span style={{color:T.textMuted}}>{user?.email||"—"}</span>
                      {user?.telephone&&<span style={{color:T.textMuted}}> · {user.telephone}</span>}
                      {user?.dept&&<span style={{color:T.textMuted}}> · {user.dept}</span>}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={approveConn}
                        style={{background:"linear-gradient(135deg,#22C55E,#16A34A)",border:"none",color:"#fff",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontWeight:800,fontSize:12,flex:1,boxShadow:"0 4px 12px rgba(34,197,94,0.3)"}}>
                        {existingCode ? "🔄 Renouveler le code" : "✅ Approuver & Générer code"}
                      </button>
                      <button onClick={() => {
                        if (setPendingConnections) setPendingConnections(prev => prev.filter(r => r.id !== req.id));
                        notify("✅", `Demande de ${req.userName} retirée de la file sans action`, "gestion_comptes");
                      }} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                        ✔ Traité
                      </button>
                      <button onClick={rejectConn}
                        style={{background:"#EF444422",border:"1px solid #EF444455",color:"#EF4444",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                        ❌ Refuser
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ══ TAB: DOSSIERS REÇUS RH (depuis interface de connexion) ══ */}
      {gcTab === "dossiers_rh" && isRH && (() => {
        const attRH = rhPendingDossiers.filter(a => a.status === "ATTENTE_RH");
        const attConf = rhPendingDossiers.filter(a => a.status === "ATTENTE_CONF");
        const attDG = rhPendingDossiers.filter(a => a.status === "ATTENTE_DG");

        const handleRHValidate = async (appro) => {
          if (!await gcConfirm(`Valider le dossier de ${appro.applicant} et transmettre au Responsable Conformité (P02) pour vérification ?`)) return;
          setPendingApprovals(prev => prev.map(a => a.id === appro.id
            ? { ...a, status: "ATTENTE_CONF", approvals: { ...a.approvals, rh: { approved: true, by: localUser.name, byId: localUser.id, at: new Date().toISOString() } } }
            : a
          ));
          const confUser = findConf();
          const dg = findDG();
          if (confUser) {
            notify("⚖️", `[RH→CONFORMITÉ] Dossier ${appro.applicant} validé par ${localUser.name} (RH) — En attente de votre approbation Conformité (P02)`, "gestion_comptes");
            createTask(`[APPROBATION CONFORMITÉ] Création compte ${appro.applicant} — Dossier validé RH, vérification conformité P02 requise`, confUser.id, "HAUTE");
          }
          if (dg) {
            notify("📨", `[INFO DG] Dossier ${appro.applicant} — Étape 1/3 : Validé RH par ${localUser.name} → En cours d'examen Conformité`, "gestion_comptes");
          }
          notify("📨", `[RH→CONFORMITÉ] Dossier ${appro.applicant} validé par ${localUser.name} — Transmis au Responsable Conformité (P02)`, "gestion_comptes");
          gcAlert(`✅ Dossier de ${appro.applicant} validé.\n\nTransmis au Responsable Conformité (P02) pour vérification.\n🔗 Chaîne : RH ✅ → Conformité ⏳ → DG ⏳\nID provisoire : ${appro.generatedId}`);
        };

        const handleRHReject = async (appro) => {
          const motif = await gcPrompt(`Motif du refus du dossier de ${appro.applicant} :`);
          if (motif === null) return;
          setPendingApprovals(prev => prev.map(a => a.id === appro.id
            ? { ...a, status: "REJETE", approvals: { ...a.approvals, rh: { approved: false, motif, by: localUser.name, byId: localUser.id, at: new Date().toISOString() } } }
            : a
          ));
          notify("❌", `[RH] Dossier ${appro.applicant} refusé — Motif : ${motif}`, "gestion_comptes");
          gcAlert(`❌ Dossier de ${appro.applicant} refusé.\nMotif enregistré.`);
        };

        const DOC_KEYS = [
          { key: "contrat", label: "📄 Contrat signé" },
          { key: "identite", label: "🪪 Pièce d'identité" },
          { key: "cv", label: "📎 CV" },
          { key: "photo", label: "🖼️ Photo" },
        ];

        return (
          <div>
            <div style={{ background: "#A855F711", border: "1px solid #A855F744", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 11, color: T.text }}>
              👥 <strong>Responsable RH — Dossiers entrants (Étape 1/3)</strong> : Examinez les documents, vérifiez la conformité administrative, puis validez pour transmission au Responsable Conformité (P02) ou rejetez le dossier incomplet.
              <br/><span style={{color:"#C9A84C",fontWeight:700}}>Circuit : RH ✅ → Conformité (P02) → DG</span>
            </div>

            {attRH.length === 0 && attConf.length === 0 && attDG.length === 0 && (
              <div style={{ background: T.surface2, borderRadius: 10, padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                <div style={{ color: T.textMuted, fontSize: 13 }}>Aucun dossier en attente de traitement RH</div>
              </div>
            )}

            {attRH.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "#F59E0B", fontWeight: 800, fontSize: 12, textTransform: "uppercase", marginBottom: 10 }}>⏳ En attente de validation RH ({attRH.length})</div>
                {attRH.map(appro => (
                  <div key={appro.id} style={{ background: T.surface2, border: "2px solid #F59E0B44", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    {/* Header */}
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: "#A855F722", border: "1px solid #A855F744", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>👤</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>{appro.applicant}</div>
                        <div style={{ color: T.textMuted, fontSize: 11 }}>{appro.functionLabel || appro.function} · {appro.email} · {appro.tel}</div>
                        <div style={{ color: T.textDim, fontSize: 10 }}>Soumis le {new Date(appro.submittedAt).toLocaleDateString("fr-FR")} · ID prov. : <span style={{ fontFamily: "monospace", color: "#C9A84C" }}>{appro.generatedId}</span></div>
                      </div>
                      <span style={{ background: "#F59E0B22", color: "#F59E0B", border: "1px solid #F59E0B44", borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 700 }}>⏳ ATTENTE RH</span>
                    </div>
                    {/* Infos personnelles */}
                    {(appro.adresse || appro.sexe || appro.nationalite) && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {appro.sexe && <span style={{ background: T.surface3, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: T.textMuted }}>Genre : {appro.sexe === "M" ? "Masculin" : "Féminin"}</span>}
                        {appro.nationalite && <span style={{ background: T.surface3, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: T.textMuted }}>🌍 {appro.nationalite}</span>}
                        {appro.sitMatrimoniale && <span style={{ background: T.surface3, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: T.textMuted }}>{appro.sitMatrimoniale}</span>}
                        {appro.adresse && <span style={{ background: T.surface3, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: T.textMuted }}>📍 {appro.adresse}</span>}
                      </div>
                    )}
                    {/* Documents */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: T.textMuted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>📁 Documents soumis</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {DOC_KEYS.map(({ key, label }) => {
                          const doc = appro.uploadedDocs?.[key];
                          return (
                            <div key={key} style={{ background: doc ? "#22C55E11" : "#EF444411", border: `1px solid ${doc ? "#22C55E33" : "#EF444433"}`, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12 }}>{doc ? "✅" : "❌"}</span>
                              <span style={{ color: doc ? "#22C55E" : "#EF4444", fontSize: 10, fontWeight: 600 }}>{label}</span>
                              {doc && (
                                <>
                                  <button onClick={() => gcViewDoc({ dataUrl: doc.dataUrl, name: doc.name, mime: doc.mime })} style={{ background: "#3B82F622", border: "1px solid #3B82F644", color: "#3B82F6", borderRadius: 5, padding: "2px 6px", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>👁</button>
                                  <button onClick={() => gcDownloadDoc({ dataUrl: doc.dataUrl, fileName: doc.name, name: doc.name })} style={{ background: "#22C55E22", border: "1px solid #22C55E44", color: "#22C55E", borderRadius: 5, padding: "2px 6px", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>⬇</button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Profil */}
                    {appro.profil && (
                      <div style={{ background: T.surface3, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                        <div style={{ color: T.textMuted, fontSize: 9, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>Profil & compétences</div>
                        <div style={{ color: T.text, fontSize: 11, lineHeight: 1.5, maxHeight: 80, overflowY: "auto" }}>{appro.profil}</div>
                      </div>
                    )}
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                      <button onClick={() => handleRHValidate(appro)} style={{ flex: 1, background: "#22C55E", border: "none", color: "#fff", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 800, fontSize: 12 }}>
                        ✅ Valider → Transmettre Conformité (P02)
                      </button>
                      <button onClick={() => handleRHReject(appro)} style={{ background: "#EF444422", border: "1px solid #EF444444", color: "#EF4444", borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                        ❌ Rejeter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {attConf.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "#C41E3A", fontWeight: 800, fontSize: 12, textTransform: "uppercase", marginBottom: 10 }}>⚖️ En cours d'examen — Conformité (P02) ({attConf.length})</div>
                {attConf.map(appro => (
                  <div key={appro.id} style={{ background: T.surface2, border: "1px solid #C41E3A33", borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#C41E3A22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>⚖️</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>{appro.applicant}</div>
                      <div style={{ color: T.textMuted, fontSize: 10 }}>{appro.functionLabel || appro.function} · Validé RH le {new Date(appro.approvals?.rh?.at || appro.submittedAt).toLocaleDateString("fr-FR")} par {appro.approvals?.rh?.by || "RH"}</div>
                    </div>
                    <span style={{ background: "#C41E3A22", color: "#C41E3A", border: "1px solid #C41E3A44", borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 700 }}>⚖️ ATTENTE CONFORMITÉ</span>
                  </div>
                ))}
              </div>
            )}

            {attDG.length > 0 && (
              <div>
                <div style={{ color: "#3B82F6", fontWeight: 800, fontSize: 12, textTransform: "uppercase", marginBottom: 10 }}>⏳ En attente de décision DG ({attDG.length})</div>
                {attDG.map(appro => (
                  <div key={appro.id} style={{ background: T.surface2, border: "1px solid #3B82F633", borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#3B82F622", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>👤</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>{appro.applicant}</div>
                      <div style={{ color: T.textMuted, fontSize: 10 }}>{appro.functionLabel || appro.function} · RH ✅ · Conformité ✅ · En attente DG</div>
                    </div>
                    <span style={{ background: "#3B82F622", color: "#3B82F6", border: "1px solid #3B82F644", borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 700 }}>⏳ ATTENTE DG</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ TAB: MES DEMANDES (RH) ══ */}
      {gcTab === "mes_demandes" && (
        <div>
          {myActions.length===0 ? (
            <div style={{background:T.surface2,borderRadius:10,padding:40,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>📋</div>
              <div style={{color:T.textMuted,fontSize:13}}>Aucune demande soumise pour l'instant</div>
              <button onClick={()=>setGcTab("rh_suggest")} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:8,padding:"8px 20px",cursor:"pointer",fontWeight:700,fontSize:12,marginTop:12}}>💡 Soumettre une suggestion</button>
            </div>
          ) : myActions.map(action=>{
            const statusColors = { EN_ATTENTE_DG:"#F59E0B", APPROUVE_DG:"#22C55E", REJETE_DG:"#EF4444", EXECUTE:"#3B82F6" };
            const color = statusColors[action.status]||"#888";
            const statusLabel = action.status==="EN_ATTENTE_DG"?"⏳ En attente DG":action.status==="APPROUVE_DG"?"✅ Approuvé":action.status==="REJETE_DG"?"❌ Refusé":"✅ Exécuté";
            return (
              <div key={action.id} style={{background:T.surface2,border:`1px solid ${color}44`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                  <span style={{fontWeight:700,color:T.text,fontSize:12}}>{action.type} — {action.targetUserName}</span>
                  <span style={{background:color+"22",color,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{statusLabel}</span>
                  <span style={{color:T.textDim,fontSize:10}}>par {action.initiatedByName}</span>
                </div>
                <div style={{color:T.textMuted,fontSize:10}}>Soumis le {formatDateTime(action.initiatedAt)} · Motif : {action.motif}</div>
                {action.dgResponse&&<div style={{color:action.status==="APPROUVE_DG"?"#22C55E":"#EF4444",fontSize:10,marginTop:4,fontStyle:"italic"}}>Réponse DG : {action.dgResponse} ({formatDateTime(action.dgResponseAt)})</div>}
                {/* v118 — Boutons d'approbation DG si en attente */}
                {action.status==="EN_ATTENTE_DG" && (isDG||isAdmin) && (
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    <button onClick={() => {
                      // Exécuter l'action
                      const targetU = users.find(u=>u.id===action.targetUserId);
                      if (!targetU) return;
                      let updated = users;
                      if (action.type==="SUSPENSION" || action.type==="RH_SUSPENSION") {
                        updated = users.map(u=>u.id===action.targetUserId?{...u,accountStatus:action.suspensionType==="DEFINITIF"?"SUSPENDU_DEFINITIF":"SUSPENDU_PROVISOIRE",suspensionMotif:action.motif,suspensionBy:localUser.id,suspensionAt:new Date().toISOString()}:u);
                      } else if (action.type==="RH_REACTIVATION" || action.type==="REACTIVATION") {
                        updated = users.map(u=>u.id===action.targetUserId?{...u,accountStatus:"ACTIF",suspensionType:null,suspensionMotif:null,reactivatedBy:localUser.id,reactivatedAt:new Date().toISOString()}:u);
                      } else if (action.type==="SUPPRESSION") {
                        updated = users.filter(u=>u.id!==action.targetUserId);
                      }
                      setUsers(updated);
                      dsSave('users', updated);  // [FIX-SYNC] Persist suspension/reactivation/deletion
                      if (setPendingAccountActions) setPendingAccountActions(prev=>prev.map(a=>a.id===action.id?{...a,status:"APPROUVE_DG",dgResponse:`Approuvé par ${localUser.name}`,dgResponseAt:new Date().toISOString()}:a));
                      setNotifications&&setNotifications(prev=>[{id:"N"+Date.now(),icon:"✅",message:`✅ ${action.type} de ${action.targetUserName} approuvée par ${localUser.name} et exécutée`,at:new Date().toISOString(),read:false,module:"gestion_comptes"},...prev]);
                      try{const k=`gc-notif-${action.targetUserId}`;const ex=JSON.parse(_lsGet(k)||"[]");ex.unshift({id:"N"+Date.now(),icon:"✅",message:`Décision DG : ${action.type} de votre compte ${action.type==="RH_REACTIVATION"||action.type==="REACTIVATION"?"→ Réactivé":"→ Suspendu"} par ${localUser.name}`,at:new Date().toISOString(),read:false,urgent:true});_lsSet(k,JSON.stringify(ex.slice(0,200)));} catch(_){}
                    }} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:7,padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                      ✅ Approuver & Exécuter
                    </button>
                    <button onClick={() => {
                      if (setPendingAccountActions) setPendingAccountActions(prev=>prev.map(a=>a.id===action.id?{...a,status:"REJETE_DG",dgResponse:`Refusé par ${localUser.name}`,dgResponseAt:new Date().toISOString()}:a));
                      setNotifications&&setNotifications(prev=>[{id:"N"+Date.now(),icon:"❌",message:`❌ ${action.type} de ${action.targetUserName} refusée par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
                      try{const k=`gc-notif-${action.targetUserId}`;const ex=JSON.parse(_lsGet(k)||"[]");ex.unshift({id:"N"+Date.now(),icon:"❌",message:`Décision DG : Demande de ${action.type} refusée par ${localUser.name}`,at:new Date().toISOString(),read:false});_lsSet(k,JSON.stringify(ex.slice(0,200)));} catch(_){}
                    }} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                      ❌ Refuser
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ TAB: RH SUGGESTION ══ */}
      {gcTab === "rh_suggest" && (
        <div>
          <div style={{background:"#A855F715",border:"1px solid #A855F733",borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:11,color:T.text}}>
            💡 <strong>Suggestion RH → DG :</strong> Soumettez une suggestion de suspension ou suppression de compte. Le Directeur Général devra l'approuver avant exécution. Toutes les décisions sont tracées.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Type d'action *</label>
              <div style={{display:"flex",gap:6}}>
                {[["SUSPENSION","⏸️ Suspension"],["SUPPRESSION","🗑️ Suppression"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setRhForm(f=>({...f,type:v}))} style={{background:rhForm.type===v?"#A855F7":T.surface2,color:rhForm.type===v?"#fff":T.textMuted,border:`1px solid ${rhForm.type===v?"#A855F7":T.border}`,borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>{l}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Collaborateur concerné *</label>
              <select value={rhForm.targetUser?.id||""} onChange={e=>{const u=users.find(x=>x.id===e.target.value);setRhForm(f=>({...f,targetUser:u||null}));}}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 13px",color:T.text,fontSize:12}}>
                <option value="">-- Sélectionner --</option>
                {users.filter(u=>_activeUser(u)&&!u.isAdmin&&u.id!==localUser.id).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role} (Niv.{u.level})</option>)}
              </select>
            </div>

            {rhForm.type==="SUSPENSION"&&(
              <>
                <div>
                  <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Type de suspension *</label>
                  <div style={{display:"flex",gap:6}}>
                    {[["PROVISOIRE","🟠 Provisoire"],["DEFINITIF","🔴 Définitive"]].map(([v,l])=>(
                      <button key={v} onClick={()=>setRhForm(f=>({...f,suspType:v}))} style={{background:rhForm.suspType===v?"#F97316":T.surface2,color:rhForm.suspType===v?"#fff":T.textMuted,border:`1px solid ${rhForm.suspType===v?"#F97316":T.border}`,borderRadius:8,padding:"7px 16px",cursor:"pointer",fontSize:11,fontWeight:700}}>{l}</button>
                    ))}
                  </div>
                </div>
                {rhForm.suspType==="PROVISOIRE"&&(
                  <div>
                    <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Date de fin (provisoire)</label>
                    <input type="date" value={rhForm.endDate} onChange={e=>setRhForm(f=>({...f,endDate:e.target.value}))}
                      style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
                  </div>
                )}
              </>
            )}

            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Cause *</label>
              <select value={rhForm.cause} onChange={e=>setRhForm(f=>({...f,cause:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 13px",color:T.text,fontSize:12}}>
                {SUSPENSION_CAUSES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Motif détaillé *</label>
              <textarea value={rhForm.motif} onChange={e=>setRhForm(f=>({...f,motif:e.target.value}))}
                placeholder="Décrivez en détail le motif de cette suggestion…" rows={3}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,resize:"vertical",outline:"none",boxSizing:"border-box"}} />
            </div>

            {rhForm.targetUser&&(
              <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"8px 12px",fontSize:11,color:T.text}}>
                ⚠️ Cette suggestion sera soumise au <strong>Directeur Général</strong> pour approbation. Une tâche lui sera automatiquement assignée. Aucune action ne sera prise sans sa validation explicite.
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={handleRHSuggest} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:8,padding:"10px 24px",cursor:"pointer",fontWeight:800,fontSize:13}}>📤 Soumettre au DG</button>
              <button onClick={() => {setRhForm({type:"SUSPENSION",suspType:"PROVISOIRE",cause:"SANCTION",motif:"",endDate:"",targetUser:null});}} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12}}>↺ Réinitialiser</button>
            </div>
          </div>
        </div>
      )}

      {/* FIX v61 F23 ══ TAB: CRÉER UN COMPTE ══ */}
{gcTab === "creer_compte" && (isAdmin || isDG) && (
<div style={{background:T.surface2,border:`1px solid #22C55E44`,borderRadius:12,padding:20}}>
  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
    <span style={{fontSize:28}}>➕</span>
    <div>
      <div style={{color:"#22C55E",fontWeight:900,fontSize:14}}>Créer un compte collaborateur</div>
      <div style={{color:T.textMuted,fontSize:10}}>La création passe par le panel Admin → onglet Comptes</div>
    </div>
  </div>
  <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:8,padding:"12px 14px",marginBottom:12,color:T.text,fontSize:11,lineHeight:1.6}}>
    Pour créer un nouveau compte, rendez-vous dans <strong>Paramètres Système</strong> (onglet <strong>Comptes</strong>), puis cliquez sur <em>"Nouveau compte"</em>.<br/>
    La création inclut : identifiant, rôle, niveau d'accès, processus métier et mot de passe provisoire.
  </div>
  <button onClick={()=>setGcTab("comptes")} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:700,fontSize:12}}>
    → Aller vers la gestion des comptes
  </button>
</div>
)}

{/* FIX v61 F23 ══ TAB: CIRCUITS D'APPROBATION ══ */}
{gcTab === "circuits_approbation" && (isAdmin || isDG || localUser.level >= 4) && (
<div>
  <div style={{color:T.text,fontWeight:800,fontSize:13,marginBottom:12}}>🔄 Circuits d'approbation actifs ({(pendingApprovals||[]).filter(a=>a.status!=="APPROUVE_COMPLET"&&a.status!=="REJETE").length})</div>
  {(pendingApprovals||[]).filter(a=>a.status!=="APPROUVE_COMPLET"&&a.status!=="REJETE").length===0 ? (
    <div style={{background:T.surface2,borderRadius:10,padding:40,textAlign:"center"}}>
      <div style={{fontSize:36,marginBottom:8}}>✅</div>
      <div style={{color:T.textMuted,fontSize:13}}>Aucun circuit d'approbation en cours</div>
    </div>
  ) : (pendingApprovals||[]).filter(a=>a.status!=="APPROUVE_COMPLET"&&a.status!=="REJETE").map(a=>(
    <div key={a.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{color:T.text,fontWeight:700,fontSize:12}}>{a.applicant || a.targetUserName || "—"}</div>
          <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{a.type} · {a.function || a.targetUserRole || "—"} · {new Date(a.createdAt||Date.now()).toLocaleDateString("fr-FR")}</div>
        </div>
        <span style={{background:a.status==="EN_COURS_APPROBATION"?"#F59E0B22":"#3B82F622",color:a.status==="EN_COURS_APPROBATION"?"#F59E0B":"#3B82F6",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700}}>{a.status}</span>
      </div>
      {a.approvalSteps&&a.approvalSteps.length>0&&(
        <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
          {a.approvalSteps.map((s,si)=>(
            <span key={si} style={{background:s.approved?"#22C55E22":"#EF444422",color:s.approved?"#22C55E":"#EF4444",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700}}>
              {s.approved?"✅":"❌"} {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  ))}
</div>
)}

{/* FIX v61 F23 ══ TAB: HISTORIQUE & JOURNAUX ══ */}
{gcTab === "historique" && (isAdmin || isDG) && (
<div>
  <div style={{color:T.text,fontWeight:800,fontSize:13,marginBottom:12}}>📊 Historique des comptes ({(sessionLogs||[]).filter(l=>["CONNEXION","DECONNEXION","PASSWORD_CHANGE","CREATION_COMPTE"].includes(l.type)).length} entrées)</div>
  {(sessionLogs||[]).filter(l=>["CONNEXION","DECONNEXION","PASSWORD_CHANGE","CREATION_COMPTE","SUSPENSION","SUPPRESSION"].includes(l.type)).slice(0,50).map(log=>(
    <div key={log.id} style={{display:"flex",gap:10,alignItems:"center",padding:"7px 10px",borderBottom:`1px solid ${T.border}`,fontSize:10}}>
      <span style={{fontSize:14}}>{log.type==="CONNEXION"?"🟢":log.type==="DECONNEXION"?"🔴":log.type==="PASSWORD_CHANGE"?"🔑":log.type==="SUSPENSION"?"⏸️":"📋"}</span>
      <div style={{flex:1}}>
        <span style={{color:T.text,fontWeight:700}}>{log.userName||log.userId}</span>
        <span style={{color:T.textMuted,marginLeft:6}}>{log.type}</span>
        {log.reason&&<span style={{color:T.textDim,marginLeft:6}}>— {log.reason}</span>}
      </div>
      <span style={{color:T.textDim}}>{new Date(log.at).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"})}</span>
    </div>
  ))}
  {(sessionLogs||[]).filter(l=>["CONNEXION","DECONNEXION","PASSWORD_CHANGE","CREATION_COMPTE","SUSPENSION","SUPPRESSION"].includes(l.type)).length===0&&(
    <div style={{background:T.surface2,borderRadius:10,padding:30,textAlign:"center",color:T.textMuted,fontSize:12}}>Aucun historique enregistré</div>
  )}
</div>
)}

{/* ══ TAB: DOSSIER UNIQUE CONFORMITÉ (P02) — Panel Unifié ══ */}
      {gcTab === "dossiers_conf" && isConf && (() => {
        const attConf     = confPendingDossiers.filter(a => a.status === "ATTENTE_CONF");
        const attDG2      = confPendingDossiers.filter(a => a.status === "ATTENTE_DG");
        const approuvees  = (pendingApprovals||[]).filter(a => a.type==="CREATION_COMPTE" && a.status==="APPROUVE" && a.approvals?.conformite?.byId===localUser.id);

        const myTaches = (taches||[]).filter(t =>
          (t.assignedTo === localUser.id || t.assigneeId === localUser.id) ||
          (t.process === "P02" || t.process === "S02")
        );
        const tachesActives   = myTaches.filter(_tActive);
        const tachesTerminees = myTaches.filter(_tDone);

        const myDossiers = (dossiers||[]).filter(d =>
          d.process === "P02" || d.process === "S02" ||
          d.tags?.some(tag => ["CONFORMITE","AUDIT","RÉGLEMENTATION","OHADA","COMPLIANCE"].includes(tag?.toUpperCase()))
        );

        const confConns = pendingConns;

        // Demandes changement accès SIRH (level/process) — circuit P02 → DG
        const sirhAccessChanges = (pendingApprovals||[]).filter(a =>
          a.type === "SIRH_ACCESS_CHANGE" &&
          !["APPROUVE","REJETE"].includes(a.status)
        );
        const unclassified = (pendingApprovals||[]).filter(a =>
          a.type !== "CREATION_COMPTE" &&
          a.type !== "SIRH_ACCESS_CHANGE" &&
          !(a.status === "APPROUVE" || a.status === "REJETE")
        );

        const CONF_TABS = [
          { id:"appro",     icon:"⚖️",  label:`Approbations (${attConf.length})`,                      alert: attConf.length > 0 },
          { id:"sirh_access",icon:"🔐", label:`Accès SIRH (${sirhAccessChanges.length})`,              alert: sirhAccessChanges.filter(a=>a.status==="EN_ATTENTE_CONF").length > 0 },
          { id:"taches",    icon:"📋",  label:`Tâches (${tachesActives.length})`,                      alert: tachesActives.length > 0 },
          { id:"dossiers",  icon:"📁",  label:`Dossiers (${myDossiers.length})` },
          { id:"connexions",icon:"🔗",  label:`Connexions (${confConns.length})`,                      alert: confConns.length > 0 },
          { id:"autres",    icon:"🗂️",  label:`Non classifié (${unclassified.length})` },
          { id:"historique",icon:"📊",  label:`Historique (${approuvees.length})` },
        ];

        const handleConfValidate = async (appro) => {
          if (!await gcConfirm(`Approuver le dossier de ${appro.applicant} (vérification conformité P02) et transmettre au DG ?`)) return;
          setPendingApprovals(prev => prev.map(a => a.id === appro.id
            ? { ...a, status: "ATTENTE_DG", approvals: { ...a.approvals, conformite: { approved: true, by: localUser.name, byId: localUser.id, at: new Date().toISOString() } } }
            : a
          ));
          const dg = findDG();
          const newAction = {
            id: "ACT-" + Date.now(), type: "CREATION",
            targetUserId: appro.generatedId, targetUserName: appro.applicant, targetUserRole: appro.functionLabel || appro.function,
            initiatedBy: localUser.id, initiatedByName: localUser.name, initiatedByRole: localUser.role,
            initiatedAt: new Date().toISOString(), cause: "RECRUTEMENT",
            motif: `RH ✅ + Conformité ✅ (${localUser.name}) — Profil : ${(appro.profil || "").slice(0, 120)}…`,
            status: "EN_ATTENTE_DG",
            newUserData: {
              id: appro.generatedId, name: appro.applicant,
              role: appro.functionLabel || appro.function,
              process: appro.processS03 || "O01", level: appro.levelTarget || 2,
              dept: appro.dept || "", email: appro.email || "", telephone: appro.tel || "",
              adresse: appro.adresse || "Libreville, Gabon",
              sexe: appro.sexe || "N/A", nationalite: appro.nationalite || "Gabonaise",
              sitMatrimoniale: appro.sitMatrimoniale || "N/A",
              profil: appro.profil || "", uploadedDocs: appro.uploadedDocs || {}}};
          setPendingAccountActions(prev => [...prev, newAction]);
          notify("📨", `[CONF→DG] Dossier ${appro.applicant} approuvé par Conformité — Transmis au DG pour décision finale`, "gestion_comptes");
          createTask(`[APPROBATION DG] Création compte ${appro.applicant} — ✅ RH + ✅ Conformité P02 — Décision DG requise`, dg?.id || "USR-MG-001", "HAUTE");
          gcAlert(`✅ ${appro.applicant} approuvé(e) par Conformité.\n🔗 RH ✅ → Conformité ✅ → DG ⏳\nTransmis au DG.`);
        };

        const handleConfReject = async (appro) => {
          const motif = await gcPrompt(`Motif du rejet conformité — ${appro.applicant} :`);
          if (motif === null) return;
          setPendingApprovals(prev => prev.map(a => a.id === appro.id
            ? { ...a, status: "REJETE", approvals: { ...a.approvals, conformite: { approved: false, motif, by: localUser.name, byId: localUser.id, at: new Date().toISOString() } } }
            : a
          ));
          notify("❌", `[CONFORMITÉ] Dossier ${appro.applicant} refusé — Motif : ${motif}`, "gestion_comptes");
          gcAlert(`❌ Dossier refusé.\nMotif consigné.`);
        };

        // ── Handlers SIRH_ACCESS_CHANGE (niveau / processus) ─────────────────────
        const handleConfApproveAccess = async (req) => {
          const chg = req.changes || {};
          const detail = `Niv.${chg.level?.from}→${chg.level?.to} / ${chg.process?.from}→${chg.process?.to}`;
          if (!await gcConfirm(`Approuver le changement d'accès SIRH de ${req.targetUserName} (${detail}) et transmettre au DG ?`)) return;
          const dg = findDG();
          setPendingApprovals(prev => prev.map(a => a.id === req.id
            ? { ...a, status: "EN_ATTENTE_DG", approvals: { ...a.approvals, conformite: { approved: true, by: localUser.name, byId: localUser.id, at: new Date().toISOString() } } }
            : a
          ));
          if (dg) {
            setNotifications(prev => [{ id:"N"+Date.now(), icon:"🔐", message:`⚠️ [CONF ✅] Changement accès SIRH ${req.targetUserName} (${detail}) — Votre approbation finale requise`, at:new Date().toISOString(), read:false, module:"sirh", forUser:dg.id, urgent:true },...prev]);
          }
          gcAlert(`✅ Approuvé par Conformité P02.\n${detail}\nTransmis au DG pour décision finale.`);
        };

        const handleConfRejectAccess = async (req) => {
          const motif = await gcPrompt(`Motif du rejet — Changement accès SIRH de ${req.targetUserName} :`);
          if (motif === null) return;
          setPendingApprovals(prev => prev.map(a => a.id === req.id
            ? { ...a, status: "REJETE", approvals: { ...a.approvals, conformite: { approved: false, motif, by: localUser.name, byId: localUser.id, at: new Date().toISOString() } } }
            : a
          ));
          // Notifier l'initiateur du refus
          const initiator = users.find(u => u.id === req.initiatedBy);
          if (initiator) setNotifications(prev => [{ id:"N"+Date.now(), icon:"❌", message:`❌ Changement d'accès SIRH refusé par Conformité — ${req.targetUserName} — Motif : ${motif}`, at:new Date().toISOString(), read:false, module:"sirh", forUser:initiator.id },...prev]);
          gcAlert(`❌ Demande refusée.\nMotif consigné. L'initiateur est notifié.`);
        };

        const DOC_KEYS = [
          { key:"contrat",  label:"📄 Contrat" },
          { key:"identite", label:"🪪 Identité" },
          { key:"cv",       label:"📎 CV" },
          { key:"photo",    label:"🖼️ Photo" },
        ];

        const PRIORITY_COL = { HAUTE:"#EF4444", MOYENNE:"#F59E0B", NORMALE:"#3B82F6" };
        const STATUS_COL   = { EN_COURS:"#3B82F6", ATTENTE_TRAITEMENT:"#F59E0B", ATTENTE_VALIDATION:"#A855F7", TERMINE:"#22C55E" };

        return (
          <div>
            {/* ── En-tête ── */}
            <div style={{ background:"linear-gradient(135deg,#C41E3A11,#A855F711)", border:"1px solid #C41E3A33", borderRadius:10, padding:"10px 16px", marginBottom:14, display:"flex", gap:12, alignItems:"center" }}>
              <span style={{ fontSize:24 }}>⚖️</span>
              <div>
                <div style={{ color:"#C41E3A", fontWeight:900, fontSize:13 }}>Dossier Unique — Responsable Conformité (P02)</div>
                <div style={{ color:T.textMuted, fontSize:10 }}>Toutes vos activités, approbations, tâches et dossiers centralisés · <span style={{color:"#C9A84C",fontWeight:700}}>Circuit : RH ✅ → Conformité ⏳ → DG</span></div>
              </div>
              <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                <div style={{ background:"#C41E3A22", border:"1px solid #C41E3A44", borderRadius:8, padding:"4px 10px", textAlign:"center" }}>
                  <div style={{ color:"#C41E3A", fontWeight:900, fontSize:16 }}>{attConf.length}</div>
                  <div style={{ color:T.textDim, fontSize:8, textTransform:"uppercase" }}>En attente</div>
                </div>
                <div style={{ background:"#F59E0B22", border:"1px solid #F59E0B44", borderRadius:8, padding:"4px 10px", textAlign:"center" }}>
                  <div style={{ color:"#F59E0B", fontWeight:900, fontSize:16 }}>{tachesActives.length}</div>
                  <div style={{ color:T.textDim, fontSize:8, textTransform:"uppercase" }}>Tâches</div>
                </div>
                <div style={{ background:"#3B82F622", border:"1px solid #3B82F644", borderRadius:8, padding:"4px 10px", textAlign:"center" }}>
                  <div style={{ color:"#3B82F6", fontWeight:900, fontSize:16 }}>{myDossiers.filter(d=>d.status!=="TERMINE").length}</div>
                  <div style={{ color:T.textDim, fontSize:8, textTransform:"uppercase" }}>Dossiers</div>
                </div>
              </div>
            </div>

            {/* ── Sub-tabs ── */}
            <div style={{ display:"flex", gap:4, marginBottom:14, borderBottom:`1px solid ${T.border}`, paddingBottom:8, overflowX:"auto", flexWrap:"nowrap", WebkitOverflowScrolling:"touch" }}>
              {CONF_TABS.map(tab => (
                <button key={tab.id} onClick={()=>setConfTab(tab.id)}
                  style={{ background:confTab===tab.id?"#C41E3A":T.surface2, color:confTab===tab.id?"#fff":T.textMuted,
                    border:`1px solid ${confTab===tab.id?"#C41E3A":tab.alert?"#F59E0B":T.border}`,
                    borderRadius:8, padding:"6px 12px", cursor:"pointer", fontWeight:700, fontSize:10,
                    display:"flex", alignItems:"center", gap:4 }}>
                  {tab.icon} {tab.label}
                  {tab.alert && tab.id!==confTab && <span style={{ background:"#F59E0B", color:"#000", borderRadius:"50%", width:14, height:14, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:900 }}>!</span>}
                </button>
              ))}
            </div>

            {/* ════════ COMPARTIMENT 1 : APPROBATIONS COMPTES ════════ */}
            {confTab === "appro" && (
              <div>
                {attConf.length === 0 && attDG2.length === 0 && (
                  <div style={{ background:T.surface2, borderRadius:10, padding:40, textAlign:"center" }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
                    <div style={{ color:T.textMuted, fontSize:13 }}>Aucune approbation en attente</div>
                  </div>
                )}

                {attConf.length > 0 && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ color:"#C41E3A", fontWeight:800, fontSize:12, textTransform:"uppercase", marginBottom:10 }}>⚖️ À approuver — Vérification conformité ({attConf.length})</div>
                    {attConf.map(appro => (
                      <div key={appro.id} style={{ background:T.surface2, border:"2px solid #C41E3A44", borderRadius:12, padding:16, marginBottom:12 }}>
                        {/* Header candidat */}
                        <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:12 }}>
                          <div style={{ width:44, height:44, borderRadius:10, background:"#C41E3A22", border:"1px solid #C41E3A44", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>👤</div>
                          <div style={{ flex:1 }}>
                            <div style={{ color:T.text, fontWeight:800, fontSize:14 }}>{appro.applicant}</div>
                            <div style={{ color:T.textMuted, fontSize:11 }}>{appro.functionLabel||appro.function} · {appro.email} · {appro.tel}</div>
                            <div style={{ color:T.textDim, fontSize:10 }}>Validé RH par <strong>{appro.approvals?.rh?.by||"RH"}</strong> · ID prov. : <span style={{fontFamily:"monospace",color:"#C9A84C"}}>{appro.generatedId}</span></div>
                          </div>
                          <span style={{ background:"#C41E3A22", color:"#C41E3A", border:"1px solid #C41E3A44", borderRadius:6, padding:"3px 10px", fontSize:10, fontWeight:700 }}>⏳ ATTENTE CONF.</span>
                        </div>
                        {/* Infos personnelles */}
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                          {appro.sexe && <span style={{ background:T.surface3, borderRadius:6, padding:"2px 8px", fontSize:10, color:T.textMuted }}>Genre : {appro.sexe==="M"?"Masculin":"Féminin"}</span>}
                          {appro.nationalite && <span style={{ background:T.surface3, borderRadius:6, padding:"2px 8px", fontSize:10, color:T.textMuted }}>🌍 {appro.nationalite}</span>}
                          {appro.sitMatrimoniale && <span style={{ background:T.surface3, borderRadius:6, padding:"2px 8px", fontSize:10, color:T.textMuted }}>{appro.sitMatrimoniale}</span>}
                          {appro.adresse && <span style={{ background:T.surface3, borderRadius:6, padding:"2px 8px", fontSize:10, color:T.textMuted }}>📍 {appro.adresse}</span>}
                        </div>
                        {/* Habilitation */}
                        <div style={{ background:"#3B82F611", border:"1px solid #3B82F633", borderRadius:8, padding:"7px 12px", marginBottom:10, fontSize:11 }}>
                          <span style={{ color:"#3B82F6", fontWeight:700 }}>🔐 Habilitation : </span>
                          <span style={{ color:T.text }}>Processus <strong>{appro.processS03||"O01"}</strong> — Niveau <strong>{appro.levelTarget||2}</strong> — {appro.dept||"—"}</span>
                        </div>
                        {/* Documents */}
                        <div style={{ marginBottom:10 }}>
                          <div style={{ color:T.textMuted, fontSize:10, fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>📁 Documents</div>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {DOC_KEYS.map(({ key, label }) => {
                              const doc = appro.uploadedDocs?.[key];
                              return (
                                <div key={key} style={{ background:doc?"#22C55E11":"#EF444411", border:`1px solid ${doc?"#22C55E33":"#EF444433"}`, borderRadius:8, padding:"5px 8px", display:"flex", alignItems:"center", gap:5 }}>
                                  <span style={{ fontSize:11 }}>{doc?"✅":"❌"}</span>
                                  <span style={{ color:doc?"#22C55E":"#EF4444", fontSize:9, fontWeight:600 }}>{label}</span>
                                  {doc && <>
                                    <button onClick={()=>gcViewDoc({dataUrl:doc.dataUrl,name:doc.name,mime:doc.mime})} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"2px 6px",cursor:"pointer",fontSize:9,fontWeight:700}}>👁</button>
                                    <button onClick={()=>gcDownloadDoc({dataUrl:doc.dataUrl,fileName:doc.name,name:doc.name})} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:5,padding:"2px 6px",cursor:"pointer",fontSize:9,fontWeight:700}}>⬇</button>
                                  </>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* Profil */}
                        {appro.profil && (
                          <div style={{ background:T.surface3, borderRadius:8, padding:"8px 10px", marginBottom:10 }}>
                            <div style={{ color:T.textMuted, fontSize:9, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>Profil & compétences</div>
                            <div style={{ color:T.text, fontSize:11, lineHeight:1.5, maxHeight:70, overflowY:"auto" }}>{appro.profil}</div>
                          </div>
                        )}
                        {/* Actions */}
                        <div style={{ display:"flex", gap:8, borderTop:`1px solid ${T.border}`, paddingTop:10 }}>
                          <button onClick={()=>handleConfValidate(appro)} style={{ flex:1, background:"#C41E3A", border:"none", color:"#fff", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontWeight:800, fontSize:12 }}>
                            ⚖️ Approuver → Transmettre DG
                          </button>
                          <button onClick={()=>handleConfReject(appro)} style={{ background:"#EF444422", border:"1px solid #EF444444", color:"#EF4444", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontWeight:700, fontSize:12 }}>
                            ❌ Rejeter
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {attDG2.length > 0 && (
                  <div>
                    <div style={{ color:"#3B82F6", fontWeight:800, fontSize:12, textTransform:"uppercase", marginBottom:10 }}>📬 Transmis au DG — En attente de décision ({attDG2.length})</div>
                    {attDG2.map(appro => (
                      <div key={appro.id} style={{ background:T.surface2, border:"1px solid #3B82F633", borderRadius:10, padding:"12px 14px", marginBottom:8, display:"flex", gap:10, alignItems:"center" }}>
                        <div style={{ width:36, height:36, borderRadius:8, background:"#3B82F622", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>👤</div>
                        <div style={{ flex:1 }}>
                          <div style={{ color:T.text, fontWeight:700, fontSize:13 }}>{appro.applicant}</div>
                          <div style={{ color:T.textMuted, fontSize:10 }}>{appro.functionLabel||appro.function} · ✅ RH · ✅ Conformité ({appro.approvals?.conformite?.by||"Vous"}) · En attente DG</div>
                        </div>
                        <span style={{ background:"#3B82F622", color:"#3B82F6", border:"1px solid #3B82F644", borderRadius:6, padding:"3px 10px", fontSize:10, fontWeight:700 }}>⏳ ATTENTE DG</span>
                      </div>
                    ))}
                  </div>
                )}

                {approuvees.length > 0 && (
                  <div style={{ marginTop:16 }}>
                    <div style={{ color:"#22C55E", fontWeight:800, fontSize:12, textTransform:"uppercase", marginBottom:10 }}>✅ Approuvés par vous ({approuvees.length})</div>
                    {approuvees.slice(0,5).map(appro => (
                      <div key={appro.id} style={{ background:"#22C55E08", border:"1px solid #22C55E22", borderRadius:8, padding:"8px 12px", marginBottom:6, display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontSize:14 }}>✅</span>
                        <div style={{ flex:1 }}>
                          <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{appro.applicant}</div>
                          <div style={{ color:T.textMuted, fontSize:10 }}>{appro.functionLabel||appro.function} · Approuvé le {new Date(appro.approvals?.conformite?.at||appro.submittedAt).toLocaleDateString("fr-FR")}</div>
                        </div>
                        <span style={{ background:"#22C55E22", color:"#22C55E", borderRadius:6, padding:"2px 8px", fontSize:9, fontWeight:700 }}>APPROUVÉ</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════════ COMPARTIMENT 2 : TÂCHES ════════ */}
            {confTab === "taches" && (
              <div>
                {tachesActives.length === 0 && tachesTerminees.length === 0 && (
                  <div style={{ background:T.surface2, borderRadius:10, padding:40, textAlign:"center" }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
                    <div style={{ color:T.textMuted, fontSize:13 }}>Aucune tâche assignée ou liée au processus P02/S02</div>
                  </div>
                )}
                {tachesActives.length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ color:"#F59E0B", fontWeight:800, fontSize:12, textTransform:"uppercase", marginBottom:10 }}>⏳ Tâches actives ({tachesActives.length})</div>
                    {tachesActives.map(t => (
                      <div key={t.id} style={{ background:T.surface2, border:`1px solid ${(PRIORITY_COL[t.priority]||"#888")}33`, borderRadius:10, padding:"11px 14px", marginBottom:8, display:"flex", gap:10, alignItems:"flex-start" }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:PRIORITY_COL[t.priority]||"#888", marginTop:4, flexShrink:0 }} />
                        <div style={{ flex:1 }}>
                          <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{t.titre}</div>
                          <div style={{ color:T.textMuted, fontSize:10, marginTop:2 }}>
                            {t.dossier && <span>Dossier : {t.dossier} · </span>}
                            Échéance : <strong style={{color:new Date(t.deadline)<new Date()?"#EF4444":T.textMuted}}>{formatDate(t.deadline)}</strong> · {t.type||"TÂCHE"}
                          </div>
                        </div>
                        <span style={{ background:(STATUS_COL[t.status]||"#888")+"22", color:STATUS_COL[t.status]||"#888", border:`1px solid ${STATUS_COL[t.status]||"#888"}44`, borderRadius:6, padding:"2px 8px", fontSize:9, fontWeight:700, whiteSpace:"nowrap" }}>{t.status?.replace(/_/g," ")||"—"}</span>
                        <span style={{ background:(PRIORITY_COL[t.priority]||"#888")+"22", color:PRIORITY_COL[t.priority]||"#888", border:`1px solid ${PRIORITY_COL[t.priority]||"#888"}44`, borderRadius:6, padding:"2px 8px", fontSize:9, fontWeight:700, whiteSpace:"nowrap" }}>{t.priority||"—"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {tachesTerminees.length > 0 && (
                  <div>
                    <div style={{ color:"#22C55E", fontWeight:800, fontSize:12, textTransform:"uppercase", marginBottom:10 }}>✅ Tâches terminées ({tachesTerminees.length})</div>
                    {tachesTerminees.slice(0,5).map(t => (
                      <div key={t.id} style={{ background:"#22C55E08", border:"1px solid #22C55E22", borderRadius:8, padding:"8px 12px", marginBottom:6, display:"flex", gap:8, alignItems:"center", opacity:0.7 }}>
                        <span style={{ fontSize:14 }}>✅</span>
                        <div style={{ flex:1, color:T.textMuted, fontSize:11 }}>{t.titre}</div>
                        <span style={{ color:T.textDim, fontSize:9 }}>{formatDate(t.deadline)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════════ COMPARTIMENT 3 : DOSSIERS ════════ */}
            {confTab === "dossiers" && (
              <div>
                {myDossiers.length === 0 ? (
                  <div style={{ background:T.surface2, borderRadius:10, padding:40, textAlign:"center" }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>📁</div>
                    <div style={{ color:T.textMuted, fontSize:13 }}>Aucun dossier lié aux processus P02 / S02</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ color:T.textMuted, fontSize:11, marginBottom:10 }}>Dossiers des processus <strong>P02 — Gouvernance & Conformité</strong> et <strong>S02 — Audit & Contrôle</strong></div>
                    {myDossiers.map(dos => (
                      <div key={dos.id} style={{ background:T.surface2, border:`1px solid ${STATUS_COL[dos.status]||T.border}33`, borderRadius:10, padding:"11px 14px", marginBottom:8 }}>
                        <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                          <div style={{ flex:1 }}>
                            <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{dos.ref}</div>
                            <div style={{ color:T.textMuted, fontSize:11, marginTop:2 }}>{dos.client} — {dos.objet}</div>
                            <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
                              <span style={{ background:T.surface3, borderRadius:6, padding:"2px 8px", fontSize:10, color:T.textDim }}>📌 {dos.process}</span>
                              <span style={{ background:T.surface3, borderRadius:6, padding:"2px 8px", fontSize:10, color:T.textDim }}>📅 {formatDate(dos.dueDate)}</span>
                              {dos.tags?.map(tag => <span key={tag} style={{ background:"#C41E3A11", border:"1px solid #C41E3A22", borderRadius:5, padding:"1px 6px", fontSize:9, color:"#C41E3A" }}>{tag}</span>)}
                            </div>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                            <span style={{ background:(STATUS_COL[dos.status]||"#888")+"22", color:STATUS_COL[dos.status]||"#888", border:`1px solid ${STATUS_COL[dos.status]||"#888"}44`, borderRadius:6, padding:"3px 10px", fontSize:10, fontWeight:700 }}>{STATUS_CONFIG[dos.status]?.label||dos.status}</span>
                            <span style={{ background:(PRIORITY_COL[dos.priority]||"#888")+"22", color:PRIORITY_COL[dos.priority]||"#888", borderRadius:6, padding:"2px 7px", fontSize:9 }}>{dos.priority}</span>
                          </div>
                        </div>
                        {dos.progress != null && (
                          <div style={{ marginTop:8 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                              <span style={{ color:T.textDim, fontSize:9 }}>Avancement</span>
                              <span style={{ color:T.textMuted, fontSize:9, fontWeight:700 }}>{dos.progress}%</span>
                            </div>
                            <ProgressBar value={dos.progress} color={dos.progress>=100?"#22C55E":"#C41E3A"} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════════ COMPARTIMENT 4 : CONNEXIONS ════════ */}
            {confTab === "connexions" && (
              <div>
                <div style={{ background:"#3B82F611", border:"1px solid #3B82F633", borderRadius:8, padding:"8px 14px", marginBottom:12, fontSize:11, color:T.text }}>
                  🔗 <strong>Connexions en attente</strong> — Visibilité Conformité. Pour approuver/rejeter, voir le panel Admin/DG.
                </div>
                {confConns.length === 0 ? (
                  <div style={{ background:T.surface2, borderRadius:10, padding:30, textAlign:"center", color:T.textMuted, fontSize:13 }}>✅ Aucune connexion en attente</div>
                ) : confConns.map(req => (
                  <div key={req.id||req.userId} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:"11px 14px", marginBottom:8, display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:"#3B82F622", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>🔗</div>
                    <div style={{ flex:1 }}>
                      <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{req.userName||req.userId}</div>
                      <div style={{ color:T.textMuted, fontSize:10 }}>{req.role||"—"} · Demandé le {formatDateTime(req.requestedAt||req.at||"")}</div>
                    </div>
                    <span style={{ background:"#F59E0B22", color:"#F59E0B", border:"1px solid #F59E0B44", borderRadius:6, padding:"3px 10px", fontSize:10, fontWeight:700 }}>⏳ EN ATTENTE</span>
                  </div>
                ))}
              </div>
            )}

            {/* ════════ COMPARTIMENT SIRH ACCÈS : CHANGEMENTS NIVEAU / PROCESSUS ════════ */}
            {confTab === "sirh_access" && (
              <div>
                <div style={{ background:"#A855F711", border:"1px solid #A855F733", borderRadius:8, padding:"8px 14px", marginBottom:12, fontSize:11, color:T.text }}>
                  🔐 <strong>Demandes de changement d'accès SIRH</strong> — Modification du niveau d'habilitation ou du processus d'un collaborateur. Circuit obligatoire : Conformité P02 ✅ → DG Niv.5 ✅
                </div>
                {sirhAccessChanges.length === 0 ? (
                  <div style={{ background:T.surface2, borderRadius:10, padding:40, textAlign:"center" }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
                    <div style={{ color:T.textMuted, fontSize:13 }}>Aucune demande de changement d'accès en attente</div>
                  </div>
                ) : sirhAccessChanges.map(req => {
                  const chg = req.changes || {};
                  const levelChanged = chg.level?.from !== chg.level?.to;
                  const processChanged = chg.process?.from !== chg.process?.to;
                  const canActConf = req.status === "EN_ATTENTE_CONF";
                  const waitDG = req.status === "EN_ATTENTE_DG";
                  return (
                    <div key={req.id} style={{ background:T.surface2, border:`1px solid ${canActConf?"#A855F744":"#3B82F644"}`, borderRadius:12, padding:16, marginBottom:10 }}>
                      <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:10 }}>
                        <div style={{ width:40, height:40, borderRadius:10, background:"#A855F722", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>🔐</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:800, fontSize:13, color:T.text, marginBottom:2 }}>Changement accès — {req.targetUserName}</div>
                          <div style={{ color:T.textMuted, fontSize:10 }}>Demandé par <strong>{req.initiatedByName}</strong> · {new Date(req.initiatedAt).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"})}</div>
                          <span style={{ background:canActConf?"#F59E0B22":"#3B82F622", color:canActConf?"#F59E0B":"#3B82F6", borderRadius:6, padding:"2px 8px", fontSize:9, fontWeight:700, marginTop:4, display:"inline-block" }}>
                            {canActConf?"⏳ En attente Conformité":"📨 En attente DG"}
                          </span>
                        </div>
                      </div>
                      {/* Détail des changements */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                        {levelChanged && (
                          <div style={{ background:"#EF444411", border:"1px solid #EF444433", borderRadius:8, padding:"8px 12px" }}>
                            <div style={{ color:T.textMuted, fontSize:9, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>🏷️ Niveau d'habilitation</div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ background:T.surface3, color:T.textMuted, borderRadius:6, padding:"3px 10px", fontSize:12, fontWeight:700 }}>Niv.{chg.level?.from}</span>
                              <span style={{ color:"#EF4444", fontWeight:900, fontSize:16 }}>→</span>
                              <span style={{ background:"#22C55E22", color:"#22C55E", borderRadius:6, padding:"3px 10px", fontSize:12, fontWeight:700 }}>Niv.{chg.level?.to}</span>
                            </div>
                          </div>
                        )}
                        {processChanged && (
                          <div style={{ background:"#3B82F611", border:"1px solid #3B82F633", borderRadius:8, padding:"8px 12px" }}>
                            <div style={{ color:T.textMuted, fontSize:9, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>🗂️ Processus</div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ background:T.surface3, color:T.textMuted, borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{chg.process?.from}</span>
                              <span style={{ color:"#3B82F6", fontWeight:900, fontSize:16 }}>→</span>
                              <span style={{ background:"#3B82F622", color:"#3B82F6", borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{chg.process?.to}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Suivi circuit */}
                      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                        <span style={{ background:req.approvals?.conformite?.approved?"#22C55E22":"#F59E0B11", color:req.approvals?.conformite?.approved?"#22C55E":"#F59E0B", border:`1px solid ${req.approvals?.conformite?.approved?"#22C55E44":"#F59E0B33"}`, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700 }}>
                          {req.approvals?.conformite?.approved?`✅ Conf. : ${req.approvals.conformite.by}`:"⏳ Conformité P02"}
                        </span>
                        <span style={{ background:req.approvals?.dg?.approved?"#22C55E22":"#3B82F611", color:req.approvals?.dg?.approved?"#22C55E":"#3B82F6", border:`1px solid ${req.approvals?.dg?.approved?"#22C55E44":"#3B82F633"}`, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700 }}>
                          {req.approvals?.dg?.approved?`✅ DG : ${req.approvals.dg.by}`:"⏳ DG Niv.5"}
                        </span>
                      </div>
                      {canActConf && (
                        <div style={{ display:"flex", gap:8, borderTop:`1px solid ${T.border}`, paddingTop:10 }}>
                          <button onClick={()=>handleConfApproveAccess(req)} style={{ flex:1, background:"#A855F7", border:"none", color:"#fff", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontWeight:800, fontSize:12 }}>
                            ⚖️ Approuver → Transmettre DG
                          </button>
                          <button onClick={()=>handleConfRejectAccess(req)} style={{ background:"#EF444422", border:"1px solid #EF444444", color:"#EF4444", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontWeight:700, fontSize:12 }}>
                            ❌ Rejeter
                          </button>
                        </div>
                      )}
                      {waitDG && (
                        <div style={{ background:"#3B82F611", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#3B82F6", marginTop:8 }}>
                          📨 Approuvé par Conformité — En attente de la décision du DG/Manager Général
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ════════ COMPARTIMENT 5 : NON CLASSIFIÉ ════════ */}
            {confTab === "autres" && (
              <div>
                <div style={{ background:"#A855F711", border:"1px solid #A855F733", borderRadius:8, padding:"8px 14px", marginBottom:12, fontSize:11, color:T.text }}>
                  🗂️ <strong>Non classifié</strong> — Tous les éléments en attente non rattachés à un compartiment spécifique.
                </div>
                {unclassified.length === 0 ? (
                  <div style={{ background:T.surface2, borderRadius:10, padding:30, textAlign:"center", color:T.textMuted, fontSize:13 }}>✅ Aucun élément non classifié</div>
                ) : unclassified.map(item => (
                  <div key={item.id} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:"11px 14px", marginBottom:8, display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:"#A855F722", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>🗂️</div>
                    <div style={{ flex:1 }}>
                      <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{item.type||"ÉLÉMENT"} — {item.applicant||item.id}</div>
                      <div style={{ color:T.textMuted, fontSize:10 }}>Soumis le {formatDateTime(item.submittedAt||"")} · Statut : {item.status||"—"}</div>
                    </div>
                    <span style={{ background:"#A855F722", color:"#A855F7", border:"1px solid #A855F744", borderRadius:6, padding:"3px 10px", fontSize:10, fontWeight:700 }}>{item.status||"—"}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ════════ COMPARTIMENT 6 : HISTORIQUE ════════ */}
            {confTab === "historique" && (
              <div>
                <div style={{ color:T.textMuted, fontSize:11, marginBottom:12 }}>Toutes vos décisions de conformité — Approbations et rejets</div>
                {(pendingApprovals||[]).filter(a => a.approvals?.conformite?.byId===localUser.id || a.approvals?.conformite?.by===localUser.name).length === 0 ? (
                  <div style={{ background:T.surface2, borderRadius:10, padding:30, textAlign:"center", color:T.textMuted, fontSize:13 }}>Aucune décision enregistrée</div>
                ) : (pendingApprovals||[]).filter(a => a.approvals?.conformite?.byId===localUser.id||a.approvals?.conformite?.by===localUser.name).map(a => {
                  const dec = a.approvals?.conformite;
                  return (
                    <div key={a.id} style={{ background:T.surface2, border:`1px solid ${dec?.approved?"#22C55E":"#EF4444"}33`, borderRadius:10, padding:"11px 14px", marginBottom:8, display:"flex", gap:10, alignItems:"center" }}>
                      <span style={{ fontSize:20 }}>{dec?.approved?"✅":"❌"}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{a.applicant}</div>
                        <div style={{ color:T.textMuted, fontSize:10 }}>{a.functionLabel||a.function} · {dec?.approved?"Approuvé":"Refusé"} le {new Date(dec?.at||"").toLocaleDateString("fr-FR")} · Statut final : {a.status}</div>
                        {!dec?.approved && dec?.motif && <div style={{ color:"#EF4444", fontSize:10, marginTop:2, fontStyle:"italic" }}>Motif refus : {dec.motif}</div>}
                      </div>
                      <span style={{ background:(dec?.approved?"#22C55E":"#EF4444")+"22", color:dec?.approved?"#22C55E":"#EF4444", borderRadius:6, padding:"3px 10px", fontSize:10, fontWeight:700 }}>{dec?.approved?"APPROUVÉ":"REFUSÉ"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ TAB: CRÉER COMPTE ══ */}
      {gcTab === "creer_compte" && (
        <div>
          <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:11,color:T.text}}>
            {isAdmin ? <span>⚙️ <strong>Admin</strong> : Créez directement (bypass) ou initiez la procédure officielle RH → Conformité → DG.</span>
             : isDG ? <span>👑 <strong>Directeur Général</strong> : Vous pouvez ajouter un collaborateur directement ou initier le circuit officiel (RH → Conformité → DG). Toute création directe est tracée et consignée.</span>
             : null}
          </div>
          {/* ── RECONNAISSANCE AUTOMATIQUE DE FONCTION ── */}
          <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:11,color:T.text}}>
            🤖 <strong>Reconnaissance intelligente des fonctions</strong> : Sélectionnez une fonction pour paramétrer automatiquement le processus, le département et le niveau d'habilitation.
          </div>
          <div style={{marginBottom:12}}>
            <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Fonction — Détection automatique *</label>
            <select
              value={createForm.funcValue||""}
              onChange={e => {
                const fn = USER_FUNCTIONS.find(f => f.value === e.target.value);
                if (fn) {
                  setCreateForm(f => ({ ...f, funcValue: e.target.value, role: fn.label, process: fn.process, level: fn.level, dept: fn.dept }));
                } else {
                  setCreateForm(f => ({ ...f, funcValue: "", role: "", process: "O01", level: 2, dept: "" }));
                }
              }}
              style={{width:"100%",background:T.surface2,border:`1px solid ${createForm.funcValue ? "#22C55E" : T.border}`,borderRadius:8,padding:"9px 13px",color:T.text,fontSize:12}}
            >
              <option value="">-- Sélectionner la fonction --</option>
              {USER_FUNCTIONS.map(f => <option key={f.value} value={f.value}>{f.label} · {f.dept} · Niv.{f.level} · {f.process}</option>)}
            </select>
            {createForm.funcValue && (
              <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:6,padding:"6px 10px",marginTop:6,display:"flex",gap:12,flexWrap:"wrap",fontSize:10}}>
                <span style={{color:"#22C55E",fontWeight:700}}>✅ Paramètres auto-détectés :</span>
                <span style={{color:T.text}}>Processus : <strong>{createForm.process}</strong></span>
                <span style={{color:T.text}}>Niveau : <strong>{createForm.level}</strong></span>
                <span style={{color:T.text}}>Département : <strong>{createForm.dept}</strong></span>
              </div>
            )}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Nom complet *</label>
                <input value={createForm.name} onChange={e=>setCreateForm(f=>({...f,name:e.target.value}))} placeholder="Prénom NOM"
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Rôle / Fonction *</label>
                <input value={createForm.role} onChange={e=>setCreateForm(f=>({...f,role:e.target.value}))} placeholder="Ex : Juriste Senior"
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Email professionnel *</label>
                <input type="email" value={createForm.email} onChange={e=>setCreateForm(f=>({...f,email:e.target.value.toLowerCase()}))} onInput={e=>{e.target.value=e.target.value.toLowerCase()}} placeholder="prenom.nom@genie-consultant.com"
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Téléphone</label>
                <input value={createForm.telephone} onChange={e=>setCreateForm(f=>({...f,telephone:e.target.value}))} placeholder="+241 0XX XXX XXX"
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Processus principal *</label>
                <select value={createForm.process} onChange={e=>setCreateForm(f=>({...f,process:e.target.value,processes:[e.target.value,...(f.processes||[]).slice(1)]}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}}>
                  {Object.entries(CODES.processes).map(([k,v])=><option key={k} value={k}>{k} — {v}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Niveau d'habilitation</label>
                <select value={createForm.level} onChange={e=>setCreateForm(f=>({...f,level:parseInt(e.target.value,10)}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}}>
                  {[1,2,3,4].map(n=><option key={n} value={n}>Niveau {n}{n===1?" (Opérationnel)":n===2?" (Standard)":n===3?" (Senior)":n===4?" (Manager)":""}</option>)}
                  {(isDG||isAdmin)&&<option value={5}>Niveau 5 (Direction)</option>}
                  {isAdmin&&<option value={6}>Niveau 6 (Superviseur)</option>}
                </select>
              </div>
              {/* Multi-processus : disponible uniquement si niveau >= 2 */}
              {createForm.level >= 2 && (
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{color:"#A855F7",fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:700}}>
                    🔀 Processus secondaires (multi-processus — Niv. 2+ uniquement)
                  </label>
                  <div style={{background:"#A855F711",border:"1px solid #A855F733",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{color:T.textDim,fontSize:10,marginBottom:8}}>Cochez les processus supplémentaires auxquels ce collaborateur aura accès :</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:4}}>
                      {Object.entries(CODES.processes).filter(([k])=>k!==createForm.process).map(([k,v])=>{
                        const checked=(createForm.processes||[]).includes(k);
                        return (
                          <label key={k} style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",padding:"4px 6px",borderRadius:5,background:checked?"#A855F715":"transparent",transition:"background 0.15s"}}
                            onMouseEnter={e=>e.currentTarget.style.background=checked?"#A855F720":"#A855F708"}
                            onMouseLeave={e=>e.currentTarget.style.background=checked?"#A855F715":"transparent"}>
                            <input type="checkbox" checked={checked} onChange={()=>{
                              setCreateForm(f=>{
                                const procs=(f.processes||[f.process]).filter(p=>p);
                                return {...f,processes:checked?procs.filter(p=>p!==k):[...procs,k]};
                              });
                            }} style={{width:13,height:13,accentColor:"#A855F7",cursor:"pointer"}} />
                            <span style={{color:checked?"#A855F7":T.textMuted,fontSize:10,fontWeight:checked?700:400}}>{k} — {v.slice(0,30)}{v.length>30?"…":""}</span>
                          </label>
                        );
                      })}
                    </div>
                    {(createForm.processes||[]).length>1&&(
                      <div style={{marginTop:8,color:"#A855F7",fontSize:10,fontWeight:600}}>
                        ✓ {(createForm.processes||[]).length} processus sélectionnés : {(createForm.processes||[]).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {createForm.level < 2 && (
                <div style={{gridColumn:"1/-1",background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:7,padding:"7px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14}}>ℹ️</span>
                  <span style={{color:"#F59E0B",fontSize:11}}>Le multi-processus nécessite un niveau d'habilitation ≥ 2</span>
                </div>
              )}
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Motif / Contexte de création</label>
              <textarea value={createForm.motif} onChange={e=>setCreateForm(f=>({...f,motif:e.target.value}))}
                placeholder="Ex : Recrutement suite entretien du 01/03/2026 — poste validé en CODIR…" rows={2}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,resize:"vertical",outline:"none",boxSizing:"border-box"}} />
            </div>
            {isAdmin&&(
              <div style={{background:"#C41E3A11",border:"1px solid #C41E3A33",borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                <input type="checkbox" id="bypass" checked={createForm.bypass} onChange={e=>setCreateForm(f=>({...f,bypass:e.target.checked,dgDirect:false}))} style={{width:16,height:16,cursor:"pointer"}} />
                <label htmlFor="bypass" style={{color:"#C41E3A",fontSize:11,cursor:"pointer",fontWeight:700}}>⚡ Bypass Admin — Créer le compte immédiatement sans circuit d'approbation (Admin uniquement)</label>
              </div>
            )}
            {isDG&&(
              <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                <input type="checkbox" id="dgDirect" checked={createForm.dgDirect} onChange={e=>setCreateForm(f=>({...f,dgDirect:e.target.checked,bypass:false}))} style={{width:16,height:16,cursor:"pointer"}} />
                <label htmlFor="dgDirect" style={{color:"#C9A84C",fontSize:11,cursor:"pointer",fontWeight:700}}>👑 Création Directe DG — Ajouter immédiatement le collaborateur sans passer par le circuit RH. La création sera tracée au journal et un code d'accès généré.</label>
              </div>
            )}
            <div style={{background:T.surface3,borderRadius:8,padding:"8px 12px",fontSize:11,color:T.textMuted}}>
              {(isAdmin&&createForm.bypass)||(isDG&&createForm.dgDirect)
                ? `${isDG?"👑 DG":"⚡ Admin"} : Ce compte sera créé immédiatement. ID + mot de passe initial + code d'accès générés automatiquement.`
                : "📋 La demande sera soumise au circuit complet : RH → Conformité (P02) → DG — pour respecter la procédure officielle. Notifications automatiques envoyées à chaque étape."}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleRHCreateAccount} style={{background:(isDG&&createForm.dgDirect)?"linear-gradient(135deg,#C9A84C,#E8C054)":(isAdmin&&createForm.bypass)?"linear-gradient(135deg,#C41E3A,#E02244)":"#22C55E",border:"none",color:"#fff",borderRadius:8,padding:"10px 24px",cursor:"pointer",fontWeight:800,fontSize:13}}>
                {(isAdmin&&createForm.bypass) ? "⚡ Créer directement (Admin)" : (isDG&&createForm.dgDirect) ? "👑 Créer directement (DG)" : "📤 Initier le circuit officiel (RH→Conf→DG)"}
              </button>
              <button onClick={()=>setCreateForm({name:"",role:"",email:"",telephone:"",process:"O01",level:2,dept:"",sexe:"",nationalite:"Gabonaise",motif:"",bypass:false,dgDirect:false,funcValue:"",processes:["O01"]})} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12}}>↺ Réinitialiser</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: CIRCUITS D'APPROBATION ══ */}
      {gcTab === "circuits_approbation" && (isAdmin || isDG || isRH) && (() => {
        const allApprovals = (pendingApprovals||[]);
        const pending = allApprovals.filter(a => !["APPROUVE","REJETE"].includes(a.status));
        const approved = allApprovals.filter(a => a.status === "APPROUVE");
        const rejected = allApprovals.filter(a => a.status === "REJETE");
        const CIRCUIT_STEPS = [
          { key:"ATTENTE_RH",    label:"① RH",          color:"#F59E0B",  icon:"👥" },
          { key:"ATTENTE_CONF",  label:"② Conformité",  color:"#A855F7",  icon:"⚖️" },
          { key:"ATTENTE_DG",    label:"③ Direction",   color:"#C41E3A",  icon:"👑" },
          { key:"APPROUVE",      label:"✅ Approuvé",   color:"#22C55E",  icon:"✅" },
          { key:"REJETE",        label:"❌ Rejeté",     color:"#EF4444",  icon:"❌" },
        ];
        return (
          <div>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
              <div style={{width:36,height:36,borderRadius:8,background:"linear-gradient(135deg,#C41E3A,#A01028)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🔄</div>
              <div>
                <div style={{color:T.text,fontWeight:900,fontSize:14}}>Circuits d'Approbation — Comptes Collaborateurs</div>
                <div style={{color:T.textMuted,fontSize:11}}>Suivi complet du processus RH → Conformité → Direction Générale</div>
              </div>
            </div>

            {/* Summary */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
              {[{l:"En attente",v:pending.length,c:"#F59E0B",icon:"⏳"},{l:"Approuvés",v:approved.length,c:"#22C55E",icon:"✅"},{l:"Rejetés",v:rejected.length,c:"#EF4444",icon:"❌"}].map(s=>(
                <div key={s.l} style={{background:s.c+"15",border:`1px solid ${s.c}44`,borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
                  <div style={{fontSize:22}}>{s.icon}</div>
                  <div style={{color:s.c,fontSize:22,fontWeight:900}}>{s.v}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Circuit visual */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",marginBottom:12}}>
              <div style={{color:T.textMuted,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Circuit de validation</div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                {CIRCUIT_STEPS.map((s,i)=>(
                  <React.Fragment key={s.key}>
                    <span style={{background:s.color+"22",border:`1px solid ${s.color}55`,borderRadius:6,padding:"4px 10px",color:s.color,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                      {s.icon} {s.label}
                    </span>
                    {i<3 ? <span style={{color:T.textDim,fontSize:16,fontWeight:900}}>→</span> : null}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Dossiers */}
            {allApprovals.length === 0 ? (
              <div style={{background:T.surface2,borderRadius:10,padding:40,textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:8}}>📋</div>
                <div style={{color:T.textMuted,fontSize:13,fontWeight:600}}>Aucune demande de compte en cours</div>
                <div style={{color:T.textDim,fontSize:11,marginTop:4}}>Les demandes de création de compte créées depuis la page de connexion apparaîtront ici.</div>
              </div>
            ) : allApprovals.map(a => {
              const step = CIRCUIT_STEPS.find(s=>s.key===a.status)||CIRCUIT_STEPS[0];
              return (
                <div key={a.id} style={{background:T.surface2,border:`1px solid ${step.color}44`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:step.color+"22",border:`1px solid ${step.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{step.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <span style={{color:T.text,fontWeight:800,fontSize:12}}>{a.applicant}</span>
                        <span style={{background:step.color+"22",color:step.color,borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700}}>{step.label}</span>
                        {a.accessCode&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700,fontFamily:"monospace"}}>🔑 Code: {a.accessCode}</span>}
                      </div>
                      <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{a.functionLabel||a.function} · {a.dept||"—"} · Soumis le {formatDate(a.submittedAt)}</div>
                      {a.generatedId&&<div style={{color:T.textDim,fontSize:9,fontFamily:"monospace",marginTop:2}}>ID: {a.generatedId}</div>}
                      {a.rejectionMotif&&<div style={{background:"#EF444415",borderRadius:4,padding:"4px 8px",color:"#EF4444",fontSize:10,marginTop:4}}>❌ Motif rejet: {a.rejectionMotif}</div>}
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap"}}>
                      {a.status==="ATTENTE_RH"&&isRH&&(
                        <>
                          <button type="button" onClick={async () => {setPendingApprovals(prev=>prev.map(x=>x.id===a.id?{...x,status:"ATTENTE_CONF",approvals:{...x.approvals,rh:{by:localUser.id,at:new Date().toISOString()}}}:x));}} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>✅ Valider RH</button>
                          <button type="button" onClick={async () => {const m = await gcPrompt("Motif du rejet RH:");if(!m)return;setPendingApprovals(prev=>prev.map(x=>x.id===a.id?{...x,status:"REJETE",rejectionMotif:m,rejectedAt:new Date().toISOString()}:x));}} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>❌ Rejeter</button>
                        </>
                      )}
                      {a.status==="ATTENTE_CONF"&&(isAdmin||isDG)&&(
                        <>
                          <button type="button" onClick={async () => {setPendingApprovals(prev=>prev.map(x=>x.id===a.id?{...x,status:"ATTENTE_DG",approvals:{...x.approvals,conformite:{by:localUser.id,at:new Date().toISOString()}}}:x));}} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>⚖️ Valider Conformité</button>
                          <button type="button" onClick={async () => {const m = await gcPrompt("Motif rejet Conformité:");if(!m)return;setPendingApprovals(prev=>prev.map(x=>x.id===a.id?{...x,status:"REJETE",rejectionMotif:m,rejectedAt:new Date().toISOString()}:x));}} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>❌ Rejeter</button>
                        </>
                      )}
                      {a.status==="ATTENTE_DG"&&(isAdmin||isDG)&&(
                        <>
                          <button type="button" onClick={() => {
                            const code=generateCode();
                            // FIX v126 — accountCreated:false → délègue création à SIApp useEffect
                            setPendingApprovals(prev=>prev.map(x=>x.id===a.id?{...x,status:"APPROUVE",accessCode:code,approvedAt:new Date().toISOString(),approvedBy:localUser.name,accountCreated:false}:x));
                            setUsers(prev=>{const updated=prev.map(u=>u.id===a.generatedId?{...u,accessCode:code,accountStatus:"ACTIF"}:u);dsSave('users',updated);return updated;});
                            if(setNotifications) setNotifications(prev=>[{id:"N"+Date.now(),icon:"✅",message:`✅ Compte APPROUVÉ : ${a.applicant} — Code d'accès : ${code} — Communiquer ce code à l'utilisateur`,at:new Date().toISOString(),read:false},...prev]);
                          }} style={{background:"#C41E3A22",border:"1px solid #C41E3A44",color:"#C41E3A",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>👑 Approuver DG</button>
                          <button type="button" onClick={async () => {const m = await gcPrompt("Motif rejet DG:");if(!m)return;setPendingApprovals(prev=>prev.map(x=>x.id===a.id?{...x,status:"REJETE",rejectionMotif:m,rejectedAt:new Date().toISOString()}:x));}} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>❌ Rejeter</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ══ TAB: HISTORIQUE ══ */}
      {gcTab === "historique" && (isAdmin || isDG) && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h4 style={{color:T.text,margin:0,fontWeight:700,fontSize:13}}>📊 Historique complet des actions comptes</h4>
            <button onClick={() => {
              const csv=["Date,Type,Cible,Statut,Initiateur,Motif",
                ...(pendingAccountActions||[]).map(a=>`"${formatDateTime(a.initiatedAt)}","${a.type}","${a.targetUserName}","${a.status}","${a.initiatedByName}","${a.motif}"`)
              ].join("\n");
              const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const el=document.createElement("a");el.href=url;el.download=`compte-actions-${new Date().toISOString().slice(0,10)}.csv`;el.click();URL.revokeObjectURL(url);
            }} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>📊 Export CSV</button>
          </div>
          {(pendingAccountActions||[]).length===0 ? (
            <div style={{color:T.textMuted,textAlign:"center",padding:40}}>Aucune action enregistrée</div>
          ) : [...(pendingAccountActions||[])].reverse().map(a=>{
            const typeColors={SUSPENSION:"#F97316",SUPPRESSION:"#EF4444",CREATION:"#22C55E"};
            const statusColors={EN_ATTENTE_DG:"#F59E0B",APPROUVE_DG:"#22C55E",REJETE_DG:"#EF4444",EXECUTE:"#3B82F6"};
            const c=typeColors[a.type]||"#888";
            const sc=statusColors[a.status]||"#888";
            const statusLabel=a.status==="EN_ATTENTE_DG"?"⏳ Attente DG":a.status==="APPROUVE_DG"?"✅ Approuvé":a.status==="REJETE_DG"?"❌ Refusé":"✅ Exécuté";
            return (
              <div key={a.id} style={{background:T.surface2,border:`1px solid ${c}22`,borderRadius:8,padding:"10px 12px",marginBottom:6,display:"flex",gap:8,alignItems:"center"}}>
                <div style={{width:32,height:32,borderRadius:8,background:c+"22",border:`1px solid ${c}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
                  {a.type==="SUSPENSION"?"⏸️":a.type==="SUPPRESSION"?"🗑️":"➕"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{color:T.text,fontWeight:700,fontSize:11}}>{a.type} — {a.targetUserName}</span>
                    <span style={{background:sc+"22",color:sc,borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700}}>{statusLabel}</span>
                  </div>
                  <div style={{color:T.textMuted,fontSize:10}}>Par {a.initiatedByName} · {formatDateTime(a.initiatedAt)}</div>
                  {a.motif&&<div style={{color:T.textDim,fontSize:10,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.motif}</div>}
                </div>
                {a.dgResponse&&<div style={{color:a.status==="APPROUVE_DG"?"#22C55E":"#EF4444",fontSize:9,textAlign:"right",maxWidth:120}}>DG : {a.dgResponse.slice(0,40)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ MODAL: SUSPEND ══ */}
      {showSuspendModal && (
        <div style={{position:"fixed",inset:0,background:"#000C",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,width:"min(520px,96vw)",maxHeight:"90vh",overflowY:"auto",padding:24,boxShadow:"0 32px 80px #000E"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:"#F97316",fontWeight:800,fontSize:14}}>⏸️ Suspension de compte</h3>
              <button onClick={()=>setShowSuspendModal(null)} style={{background:"transparent",border:"none",color:T.textMuted,fontSize:18,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{background:"#F9731611",border:"1px solid #F9731633",borderRadius:8,padding:"10px 12px",marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:showSuspendModal.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:12}}>{showSuspendModal.avatar}</div>
              <div>
                <div style={{color:T.text,fontWeight:700,fontSize:12}}>{showSuspendModal.name}</div>
                <div style={{color:T.textMuted,fontSize:10}}>{showSuspendModal.role} · Niv.{showSuspendModal.level} · {showSuspendModal.process}</div>
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Session only */}
              <div style={{background:T.surface2,borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>setSuspForm(f=>({...f,sessionOnly:!f.sessionOnly}))}>
                <div style={{width:18,height:18,borderRadius:4,background:suspForm.sessionOnly?"#F59E0B":"transparent",border:`2px solid ${suspForm.sessionOnly?"#F59E0B":T.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {suspForm.sessionOnly&&<span style={{color:"#fff",fontSize:10}}>✓</span>}
                </div>
                <div>
                  <div style={{color:T.text,fontSize:12,fontWeight:600}}>⏸️ Suspension de session uniquement</div>
                  <div style={{color:T.textDim,fontSize:10}}>Le compte reste actif mais la session en cours est interrompue. L'utilisateur peut se reconnecter.</div>
                </div>
              </div>

              {!suspForm.sessionOnly&&(
                <>
                  <div>
                    <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Type de suspension *</label>
                    <div style={{display:"flex",gap:6}}>
                      {[["PROVISOIRE","🟠 Provisoire"],["DEFINITIF","🔴 Définitive"]].map(([v,l])=>(
                        <button key={v} onClick={()=>setSuspForm(f=>({...f,type:v}))} style={{flex:1,background:suspForm.type===v?"#F97316":T.surface2,color:suspForm.type===v?"#fff":T.textMuted,border:`1px solid ${suspForm.type===v?"#F97316":T.border}`,borderRadius:8,padding:"8px",cursor:"pointer",fontSize:11,fontWeight:700}}>{l}</button>
                      ))}
                    </div>
                  </div>
                  {suspForm.type==="PROVISOIRE"&&(
                    <div>
                      <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Date de fin</label>
                      <input type="date" value={suspForm.endDate} onChange={e=>setSuspForm(f=>({...f,endDate:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
                    </div>
                  )}
                </>
              )}

              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Cause *</label>
                <select value={suspForm.cause} onChange={e=>setSuspForm(f=>({...f,cause:e.target.value}))} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 13px",color:T.text,fontSize:12}}>
                  {SUSPENSION_CAUSES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Motif détaillé *</label>
                <textarea value={suspForm.motif} onChange={e=>setSuspForm(f=>({...f,motif:e.target.value}))}
                  placeholder="Décrivez le motif précis de suspension…" rows={3}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,resize:"vertical",outline:"none",boxSizing:"border-box"}} />
              </div>

              <div style={{background:"#EF444411",border:"1px solid #EF444433",borderRadius:8,padding:"8px 12px",fontSize:10,color:"#EF4444"}}>
                ⚠️ Cette action est immédiatement effective, irréversible sans action volontaire de {isAdmin?"l'Admin ou du DG":"votre part"}, et est enregistrée dans les journaux du SI.
              </div>

              <div style={{display:"flex",gap:8}}>
                {/* Pièce justificative */}
                <div style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                  <div style={{color:T.textDim,fontSize:9,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>📎 Justificatif (optionnel)</div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <label style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:5,padding:"3px 8px",color:"#3B82F6",cursor:"pointer",fontSize:10,fontWeight:700}}>
                      ⬆ Fichier
                      <input type="file" multiple style={{display:"none"}} onChange={e=>{
                        Array.from(e.target.files||[]).forEach(fi=>{
                          // ⬇️ MIGRÉ: ce bloc FileReader utilise maintenant _uploadFiles (gcFileStore)
                          // Les fichiers sont stockés dans IndexedDB ou sur le serveur automatiquement
//                           const r=new FileReader();
//                           r.onload=(ev)=>setSuspForm(f=>({...f,attachments:[...(f.attachments||[]),{id:"ATT-"+Date.now(),name:fi.name,size:fi.size,type:fi.type,dataUrl:ev.target.result}]}));
//                           r.readAsDataURL(fi);
                        }); e.target.value="";
                      }}/>
                    </label>
                    {(suspForm.attachments||[]).length > 0 && (
                      <span style={{color:"#22C55E",fontSize:10,fontWeight:600}}>{suspForm.attachments.length} fichier(s)</span>
                    )}
                  </div>
                  {(suspForm.attachments||[]).length > 0 && (
                    <div style={{marginTop:4,display:"flex",gap:4,flexWrap:"wrap"}}>
                      {suspForm.attachments.map((att,i)=>(
                        <span key={att.id} style={{background:"#3B82F615",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:4,padding:"1px 6px",fontSize:9,display:"flex",gap:3,alignItems:"center"}}>
                          📎 {att.name.slice(0,20)}
                          <button onClick={()=>setSuspForm(f=>({...f,attachments:f.attachments.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:9,padding:0}}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {isRH && (
                  <div style={{background:"#F59E0B15",border:"1px solid #F59E0B44",borderRadius:7,padding:"7px 10px",color:"#F59E0B",fontSize:10,marginBottom:8}}>
                    ⚠️ En tant que RH, cette demande sera soumise au DG pour approbation avant application.
                  </div>
                )}
                <button onClick={()=>handleSuspend(showSuspendModal)} style={{flex:1,background:"#F97316",border:"none",color:"#fff",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:800,fontSize:13}}>
                  {isRH ? "📤 Soumettre au DG" : suspForm.sessionOnly?"⏸️ Suspendre la session":"🔒 Confirmer la suspension"}
                </button>
                <button onClick={()=>setShowSuspendModal(null)} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: DELETE CONFIRM ══ */}
      {showDeleteModal && (
        <div style={{position:"fixed",inset:0,background:"#000D",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:T.surface,border:"1px solid #EF444466",borderRadius:16,width:"min(440px,96vw)",padding:24,boxShadow:"0 32px 80px #000E"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:44,marginBottom:8}}>🗑️</div>
              <h3 style={{margin:0,color:"#EF4444",fontWeight:800}}>Suppression définitive</h3>
            </div>
            <div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:8,padding:"12px 14px",marginBottom:14,textAlign:"center"}}>
              <div style={{color:T.text,fontWeight:700,fontSize:13}}>{showDeleteModal.name}</div>
              <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>{showDeleteModal.role} · {showDeleteModal.id}</div>
            </div>
            <div style={{background:"#EF444411",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#EF4444",textAlign:"center"}}>
              ⚠️ Cette action est <strong>IRRÉVERSIBLE</strong>. Toutes les données de ce compte seront supprimées. Les dossiers et tâches associés resteront dans le SI.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>handleDeleteUser(showDeleteModal)} style={{flex:1,background:"#EF4444",border:"none",color:"#fff",borderRadius:8,padding:"11px",cursor:"pointer",fontWeight:800,fontSize:13}}>🗑️ Supprimer définitivement</button>
              <button onClick={()=>setShowDeleteModal(null)} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"11px 16px",cursor:"pointer",fontSize:12}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
