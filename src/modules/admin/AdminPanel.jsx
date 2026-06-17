import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// AdminPanel.jsx — SI Génie Consultant v127
import { _lsSet, _lsRm, _lsGet, _noop, playSound, formatDate, gcGetDelaiConfig, generateAccessCode, useSI, gcFileSave, _activeUser, gcViewDoc, getProcColor, gcHashPassword, gcReadFile, gcFmtSize, gcDownloadDoc, dsSave, dsWipeKey } from '../../core/index.js';
import { useRemoteSync } from '../../hooks/useSyncedState.js';
import { gcToast } from '../../components/ToastManager.jsx';
import { STATUS_CONFIG, DOC_CATEGORIES, ACCOUNT_STATUS_CONFIG, CODES, getCatInfo } from '../../core/constants.js'; // FIX v132 — getCatInfo importée
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge, ProgressBar, UserAvatar} from '../../components/UI.jsx';
import { AIConfigAdminTab } from '../../components/AIAssistant.jsx';
import { ActivityJournal, FileDataManager, PrinterConfig } from './InformationsPanel.jsx';
import { AdminConnexionsTab } from './GestionComptesPanel.jsx';
import { ExportBackupPanel, SyncControlPanel } from './SIConfigPanels.jsx';
import { ProcessAppMatrixAdmin } from './HubPanels.jsx';
import { AdminCodeEditor } from './GestionComptesPanel.jsx';

export function DelaisAdminPanel({ T, localUser, setNotifications=_noop}){
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

  const [dCfg, setDCfg] = React.useState(() => gcGetDelaiConfig());
  const [saved, setSaved] = React.useState(false);
  useRemoteSync({ 'gc-delai-config': setDCfg });
  const PROCS_L = {O01:"Administration",O02:"Juridique",O03:"Éval. & Gestion",S01:"Finance",S02:"Audit",S03:"RH",S04:"Communication",S05:"Logistique",S06:"Entretien",P01:"Management",P02:"Gouvernance",P03:"Contrôle gestion",P04:"Veille"};

  const save = () => {
    try {
      _lsSet("gc-delai-config", JSON.stringify(dCfg));
      // FIX v142 — Sync cross-machine : config délais partagée entre tous les postes
      dsSave("gc-delai-config", dCfg).catch(err => gcToast.syncError("gc-delai-config", err));
      setSaved(true); setTimeout(()=>setSaved(false),2500);
      setNotifications && setNotifications(p=>[{id:"N"+Date.now(),icon:"⏱️",message:`Config délais mise à jour par ${localUser?.name} (Admin)`,at:new Date().toISOString(),read:false},...p]);
      playSound("success");
    } catch(_) {}
  };

  return (
    <div style={{padding:4}}>
      <div style={{background:"linear-gradient(135deg,#F9731610,#EA580C08)",border:"1px solid #F9731633",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:22}}>⏱️</span>
        <div style={{flex:1}}>
          <div style={{color:"#F97316",fontWeight:700,fontSize:13}}>Délais & Alertes Automatiques</div>
          <div style={{color:T.textMuted,fontSize:10}}>
            Ces règles s'appliquent à tous les dossiers. Modifiables aussi par O01 niv.3+ dans Administration → Classification.
            Les alertes sont envoyées automatiquement aux collaborateurs, responsables et DG.
          </div>
        </div>
        {saved&&<span style={{background:"#22C55E22",color:"#22C55E",border:"1px solid #22C55E44",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700}}>✅ Enregistré</span>}
      </div>

      {/* Délais globaux */}
      <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14,marginBottom:12}}>
        <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:12}}>⚙️ Délais Globaux Cabinet</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {[
            {k:"court",  l:"⏱ Délai Court",  desc:"Admin, Finance, RH, Logistique",    c:"#22C55E"},
            {k:"long",   l:"📋 Délai Long",   desc:"Juridique, Audit, Gestion, Stratégie",c:"#3B82F6"},
            {k:"urgence",l:"🔴 Urgence",       desc:"Priorité CRITIQUE ou URGENTE",       c:"#EF4444"},
          ].map(item=>(
            <div key={item.k} style={{background:T.surface,border:`2px solid ${item.c}33`,borderRadius:10,padding:12}}>
              <div style={{color:item.c,fontWeight:700,fontSize:12,marginBottom:3}}>{item.l}</div>
              <div style={{color:T.textDim,fontSize:9,marginBottom:8}}>{item.desc}</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="number" min="1" max="180" value={dCfg[item.k]}
                  onChange={e=>setDCfg(p=>({...p,[item.k]:Number(e.target.value)}))}
                  style={{width:60,background:T.surface2,border:`2px solid ${item.c}66`,borderRadius:7,padding:"6px 9px",color:item.c,fontSize:16,fontWeight:900,textAlign:"center"}}/>
                <span style={{color:T.textMuted,fontSize:11}}>jours ouvrés</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seuils alertes */}
      <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14,marginBottom:12}}>
        <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:12}}>🔔 Seuils d'Alerte Automatique</div>
        <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:7,padding:"7px 11px",marginBottom:10,fontSize:10,color:T.textMuted}}>
          Les alertes sont déclenchées automatiquement chaque heure. Une seule alerte par dossier par jour par type.
          <br/>🟡 → Collaborateur · 🟠 → Responsable processus (niv.4+) + Collaborateur · 🔴 → DG + Responsable + Collaborateur
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {[
            {k:"jaune", l:"🟡 Alerte Jaune",   desc:"Attention préventive",     c:"#F59E0B"},
            {k:"orange",l:"🟠 Alerte Orange",  desc:"Critique — action requise", c:"#F97316"},
            {k:"rouge", l:"🔴 Alerte Rouge",    desc:"Dépassé — escalade DG",    c:"#EF4444"},
          ].map(item=>(
            <div key={item.k} style={{background:T.surface,border:`2px solid ${item.c}33`,borderRadius:10,padding:12}}>
              <div style={{color:item.c,fontWeight:700,fontSize:12,marginBottom:3}}>{item.l}</div>
              <div style={{color:T.textDim,fontSize:9,marginBottom:8}}>{item.desc}</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:T.textMuted,fontSize:11}}>≤</span>
                <input type="number" min="0" max="30" value={dCfg.alertes[item.k]}
                  onChange={e=>setDCfg(p=>({...p,alertes:{...p.alertes,[item.k]:Number(e.target.value)}}))}
                  style={{width:60,background:T.surface2,border:`2px solid ${item.c}66`,borderRadius:7,padding:"6px 9px",color:item.c,fontSize:16,fontWeight:900,textAlign:"center"}}/>
                <span style={{color:T.textMuted,fontSize:11}}>jours</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Délais par processus */}
      <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14,marginBottom:12}}>
        <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>🗂️ Délais par Processus Métier</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
          {Object.entries(dCfg.byProcess||{}).map(([proc,jours])=>(
            <div key={proc} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{color:jours<=14?"#22C55E":"#3B82F6",fontFamily:"monospace",fontWeight:700,fontSize:11}}>{proc}</div>
                <div style={{color:T.textDim,fontSize:9,marginTop:1}}>{PROCS_L[proc]||proc}</div>
                <div style={{color:jours<=14?"#22C55E":"#3B82F6",fontSize:9,marginTop:2,fontWeight:600}}>
                  {jours<=14?"⏱ Court":"📋 Long"}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <input type="number" min="1" max="180" value={jours}
                  onChange={e=>setDCfg(p=>({...p,byProcess:{...p.byProcess,[proc]:Number(e.target.value)}}))}
                  style={{width:50,background:T.surface2,border:`1px solid ${jours<=14?"#22C55E44":"#3B82F644"}`,borderRadius:6,padding:"5px 7px",color:jours<=14?"#22C55E":"#3B82F6",fontSize:13,fontWeight:900,textAlign:"center"}}/>
                <span style={{color:T.textDim,fontSize:9}}>j</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={save} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:8,padding:"10px 24px",cursor:"pointer",fontWeight:700,fontSize:13}}>💾 Enregistrer</button>
        <button onClick={()=>setDCfg(gcGetDelaiConfig())} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12}}>↺ Annuler</button>
        <button onClick={()=>{const d={court:14,long:21,urgence:3,byProcess:{O01:14,O02:21,O03:21,S01:14,S02:21,S03:14,S04:14,S05:14,S06:14,P01:21,P02:21,P03:14,P04:14},alertes:{rouge:0,orange:3,jaune:7}};_lsSet("gc-delai-config",JSON.stringify(d));dsSave("gc-delai-config",d).catch(err=>gcToast.syncError("gc-delai-config",err));setDCfg(d);setSaved(true);setTimeout(()=>setSaved(false),2500);}}
          style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12,fontWeight:700}}>↺ Réinitialiser (14j/21j)</button>
      </div>
    </div>
  );
}


export function AdminPanel({ T, addSessionLog, dossiers=[], generateAccessCode, handleSetPendingConnections, isAdmin, localUser, onFactoryReset, partners=[], pendingApprovals=[], pendingConnections=[], rdvs=[], requireConnApproval, sessionLogs=[], setDossiers=_noop, setNotifications=_noop, setPartnersSync=_noop, setPendingApprovals=_noop, setRdvs=_noop, setRequireConnApproval=_noop, setSessionLogs=_noop, setSiAppearance=_noop, setSiCSSOverrides=_noop, setSiLogoUrl=_noop, setSiSystemDocs=_noop, setTaches=_noop, setUsers=_noop, siAppearance, siCSSOverrides, siLogoUrl, siSystemDocs, taches=[], users=[],
  securityAlerts: securityAlertsProp=[], setSecurityAlerts: setSecurityAlertsProp=_noop,
  autoBackupEnabled: autoBackupEnabledProp, setAutoBackupEnabled: setAutoBackupEnabledProp=_noop,
  autoBackupInterval: autoBackupIntervalProp, setAutoBackupInterval: setAutoBackupIntervalProp=_noop,
}) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
    const [adminTab, setAdminTabRaw] = useState(() => {
      try { return sessionStorage.getItem('gc-admin-tab') || (isAdmin ? "users" : "settings"); } catch (_) { return isAdmin ? "users" : "settings"; }
    });
    const setAdminTab = (t) => { setAdminTabRaw(t); try { sessionStorage.setItem('gc-admin-tab', t); } catch (_) {} };
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetOptions, setResetOptions] = useState({
      dossiers: true, taches: true, rdvs: true, partners: true,
      approvals: true, connections: true, sirh: true, docs: true,
      sessionLogs: true, achats: true, notifications: false,
      finance: false, audit: false, logistique: false, comm: false,
      users: false, // JAMAIS par défaut
    });
    const [resetConfirmCode, setResetConfirmCode] = useState("");
    const [showUserModal, setShowUserModal] = useState(false);

    // ── Sauvegarde/Restauration granulaire (v143) ───────────────────────────
    const GC_GRANULAR_BACKUP_KEY = "gc-granular-backup-latest";
    const BACKUP_MODULES = [
      { id:"users",       label:"👥 Collaborateurs",    keys:[], stateKey:"users" },
      { id:"dossiers",    label:"📁 Dossiers",          keys:[], stateKey:"dossiers" },
      { id:"taches",      label:"✅ Tâches",            keys:[], stateKey:"taches" },
      { id:"rdvs",        label:"📅 RDV & Agenda",      keys:[], stateKey:"rdvs" },
      { id:"partners",    label:"🤝 Partenaires",       keys:[], stateKey:"partners" },
      { id:"approvals",   label:"📋 Approbations",      keys:[], stateKey:"pendingApprovals" },
      { id:"finance",     label:"💰 Finance & Compta",  keys:["gc-journal","gc-budget","gc-factures","gc-piece-series","gc-budget-rapide","gc-devis","gc-tpa"] },
      { id:"sirh",        label:"👔 SIRH",              keys:["gc-sirh-presences","gc-sirh-leaves","gc-sirh-evaluations","gc-sirh-fichiers","gc-sirh-reinstatements","gc-recrutements","gc-paie-taux","gc-paie-transferts","gc-leaves"] },
      { id:"docs",        label:"📄 Documents",         keys:["gc-internal-docs","gc-external-docs","gc-dossier-files","gc-docs-unified","gc-standalone-docs","gc-writer-docs"] },
      { id:"audit",       label:"🔍 Audit & Conformité",keys:["gc-audit-prog","gc-audit-actions","gc-audit-checklist","gc-pca","gc-pca-risques","gc-risks","gc-nc","gc-coso-scores"] },
      { id:"logistique",  label:"🏭 Logistique",        keys:["gc-achats","gc-logmod-stocks","gc-logistique-actifs","gc-inventaires","gc-stocks"] },
      { id:"comm",        label:"📣 Communication",     keys:["gc-comm-fiches","gc-comm-campagnes","gc-comm-custom-tpl"] },
      { id:"messages",    label:"✉️ Messagerie",        keys:["gc-messages","gc-messages-global","gc-msg-drafts","gc-memos"] },
      { id:"sessionLogs", label:"🔐 Journaux session",  keys:[], stateKey:"sessionLogs" },
    ];
    const [backupModules, setBackupModules] = useState({ users:true, dossiers:true, taches:true, rdvs:true, partners:true, approvals:true, finance:true, sirh:true, docs:true, audit:true, logistique:true, comm:false, messages:false, sessionLogs:false });
    // autoBackupEnabled / autoBackupInterval : gérés par AppRoot (hydratés depuis serveur)
    const autoBackupEnabled = autoBackupEnabledProp !== undefined ? autoBackupEnabledProp : true;
    const setAutoBackupEnabled = (v) => { _lsSet("gc-auto-backup-enabled", JSON.stringify(v)); dsSave("gc-auto-backup-enabled", v).catch(()=>{}); setAutoBackupEnabledProp(v); };
    const autoBackupInterval = autoBackupIntervalProp !== undefined ? autoBackupIntervalProp : 5;
    const setAutoBackupInterval = (v) => { _lsSet("gc-auto-backup-interval", String(v)); dsSave("gc-auto-backup-interval", v).catch(()=>{}); setAutoBackupIntervalProp(v); };
    const [lastGranularBackup, setLastGranularBackup] = useState(() => { try { const r=_lsGet(GC_GRANULAR_BACKUP_KEY); if(!r)return null; const p=JSON.parse(r); return {exportedAt:p.exportedAt,exportedBy:p.exportedBy,modules:p.modules}; } catch(_){return null;} });
    const [backupImportMsg, setBackupImportMsg] = useState("");
    const [backupImporting, setBackupImporting] = useState(false);
    const backupFileRef = React.useRef(null);
    const [editingUser, setEditingUser] = useState(null);
    const [userForm, setUserForm] = useState({ id: "", name: "", role: "", email: "", level: 2, process: "O01", dept: "", alias: "", password: "", sexe: "", nationalite: "", situationMatrimoniale: "", telephone: "", adresse: "", bio: "", color: "" });
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
    const [showDocModal, setShowDocModal] = useState(false);
    const [editingDoc, setEditingDoc] = useState(null); // doc en cours d'édition
    const [docForm, setDocForm] = useState({
      name: "", category: "CHARTE", description: "", process: "ALL",
      fileType: "PDF", accessLevel: 1, isLoginCharte: false, mandatory: false,
      visible: true, dataUrl: null, fileName: null, fileSize: 0});
    const [docUploadStatus, setDocUploadStatus] = useState(null); // {type:"loading"|"ok"|"error", msg}
    const [docFilter, setDocFilter] = useState("ALL"); // filtre par catégorie
    const docAdminRef = useRef(null);
    const [showAddInfoModal, setShowAddInfoModal] = useState(false);
    const [settingsForm, setSettingsForm] = useState({ nom: "Génie Consultant", slogan: "Excellence · Intégrité · Performance", email: "contact@genie-consultant.com", web: "www.genie-consultant.com", rccm: "Libreville 2017 A 39632", nif: "281535L", adresse: "Avenue Pierre-Louis ANGONDJO OKAWE, Libreville, Gabon" });
    // v107 — Logo upload directement dans Paramètres SI
    const [logoPreviewAdmin, setLogoPreviewAdmin] = useState(siLogoUrl || null);
    const logoInputAdminRef = useRef(null);
    const handleLogoUploadAdmin = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) { gcAlert("Fichier invalide — image requise."); return; }
      if (file.size > 2 * 1024 * 1024) { gcAlert("Image trop lourde — 2 Mo maximum."); return; }
      gcFileSave(file, { module: "admin", type: "image", nom: file.name, taille: file.size }).then(ref => setLogoPreviewAdmin(ref.dataUrl || ref.path || "")).catch(err => console.error("[Admin] logo upload:", err));
    };
    const handleApplyLogoAdmin = () => {
      if (logoPreviewAdmin && setSiLogoUrl) {
        setSiLogoUrl(logoPreviewAdmin);
        setNotifications(prev=>[{id:"N"+Date.now(),icon:"🖼️",message:"Logo du cabinet mis à jour",at:new Date().toISOString(),read:false},...prev]);
      }
    };
    const handleRemoveLogoAdmin = () => {
      setLogoPreviewAdmin(null);
      if (setSiLogoUrl) setSiLogoUrl(null);
      setNotifications(prev=>[{id:"N"+Date.now(),icon:"🗑️",message:"Logo du cabinet supprimé",at:new Date().toISOString(),read:false},...prev]);
    };
    const [settingsSaved, setSettingsSaved] = useState(false);
    const [addInfoName, setAddInfoName] = useState("");
    const [addInfoValue, setAddInfoValue] = useState("");
    const [extraInfos, setExtraInfos] = useState([]);

    const isMG = localUser?.isMG || localUser?.id === "USR-MG-001";

    // ── Fonctions sauvegarde granulaire (v143) ──────────────────────────────
    const buildGranularBackup = (selectedModules) => {
      const stateMap = { users, dossiers, taches, rdvs, partners, pendingApprovals, sessionLogs };
      const payload = { version:"GC_GRANULAR_v1", exportedAt:new Date().toISOString(), exportedBy:localUser?.name||"Admin", modules:Object.keys(selectedModules).filter(k=>selectedModules[k]), data:{} };
      BACKUP_MODULES.filter(m=>selectedModules[m.id]).forEach(m => {
        if (m.stateKey) payload.data[m.id] = stateMap[m.stateKey] || [];
        if (m.keys?.length) {
          payload.data[m.id+"_ls"] = {};
          m.keys.forEach(k => { try { payload.data[m.id+"_ls"][k] = JSON.parse(_lsGet(k)||"[]"); } catch(_){} });
        }
      });
      return payload;
    };

    const saveGranularBackup = (payload) => {
      try { _lsSet(GC_GRANULAR_BACKUP_KEY, JSON.stringify(payload)); setLastGranularBackup({exportedAt:payload.exportedAt,exportedBy:payload.exportedBy,modules:payload.modules}); } catch(_){}
    };

    const handleGranularExport = () => {
      const selected = Object.entries(backupModules).filter(([,v])=>v).map(([k])=>k);
      if (!selected.length) { gcAlert("Sélectionnez au moins un module à sauvegarder."); return; }
      const payload = buildGranularBackup(backupModules);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url; a.download=`GC_Backup_${selected.join("-")}_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      saveGranularBackup(payload);
      gcAlert(`✅ Sauvegarde exportée.\nModules : ${selected.map(id=>BACKUP_MODULES.find(m=>m.id===id)?.label||id).join(", ")}`);
    };

    const handleGranularLocalSave = () => {
      const selected = Object.entries(backupModules).filter(([,v])=>v).map(([k])=>k);
      if (!selected.length) { gcAlert("Sélectionnez au moins un module à sauvegarder."); return; }
      const payload = buildGranularBackup(backupModules);
      saveGranularBackup(payload);
      gcAlert(`✅ Sauvegarde locale enregistrée.\nModules : ${selected.map(id=>BACKUP_MODULES.find(m=>m.id===id)?.label||id).join(", ")}`);
    };

    const applyGranularRestore = async (payload) => {
      const d = payload.data || {};
      const setMap = { users:setUsers, dossiers:setDossiers, taches:setTaches, rdvs:setRdvs, partners:setPartnersSync, pendingApprovals:setPendingApprovals, sessionLogs:setSessionLogs };
      const promises = [];
      BACKUP_MODULES.forEach(m => {
        if (d[m.id] !== undefined && m.stateKey && setMap[m.stateKey]) {
          setMap[m.stateKey](d[m.id]);
          promises.push(dsSave(m.stateKey, d[m.id]).catch(err => gcToast.syncError(m.stateKey, err)));
        }
        if (d[m.id+"_ls"] && m.keys?.length) {
          Object.entries(d[m.id+"_ls"]).forEach(([k,v]) => {
            try { _lsSet(k, JSON.stringify(v)); promises.push(dsSave(k,v).catch(err => gcToast.syncError(k, err))); } catch(_){}
          });
        }
      });
      await Promise.all(promises);
    };

    const handleGranularImport = async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      setBackupImporting(true); setBackupImportMsg("Lecture du fichier…");
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed?.version?.startsWith("GC_")) { setBackupImportMsg("❌ Format invalide."); setBackupImporting(false); return; }
        const mods = (parsed.modules||[]).map(id=>BACKUP_MODULES.find(m=>m.id===id)?.label||id);
        if (!await gcConfirm(`Restaurer les données suivantes ?\nModules : ${mods.join(", ")}\nExportée le ${parsed.exportedAt?.slice(0,10)||"—"} par ${parsed.exportedBy||"—"}\n\n⚠️ Les données existantes seront remplacées pour ces modules uniquement.`,"Restauration","📦")) { setBackupImporting(false); setBackupImportMsg(""); return; }
        setBackupImportMsg("Restauration en cours…");
        await applyGranularRestore(parsed);
        saveGranularBackup(parsed);
        setBackupImportMsg(`✅ Restauration réussie — Modules : ${mods.join(", ")}. Rechargez si nécessaire.`);
      } catch(err) { setBackupImportMsg("❌ Erreur : " + err.message); }
      setBackupImporting(false);
      if(e.target) e.target.value="";
    };

    const handleGranularLocalRestore = async () => {
      try {
        const raw = _lsGet(GC_GRANULAR_BACKUP_KEY); if (!raw) { gcAlert("Aucune sauvegarde locale disponible."); return; }
        const parsed = JSON.parse(raw);
        const mods = (parsed.modules||[]).map(id=>BACKUP_MODULES.find(m=>m.id===id)?.label||id);
        if (!await gcConfirm(`Restaurer la dernière sauvegarde locale ?\nModules : ${mods.join(", ")}\nSauvegardée le ${parsed.exportedAt?.slice(0,10)||"—"}`,"Restauration locale","📦")) return;
        await applyGranularRestore(parsed);
        gcAlert("✅ Restauration locale appliquée.");
      } catch(err) { gcAlert("❌ Erreur : " + err.message); }
    };

    // Auto-backup granulaire périodique
    React.useEffect(() => {
      if (!autoBackupEnabled) return;
      const run = () => { try { const p=buildGranularBackup(backupModules); saveGranularBackup(p); } catch(_){} };
      run();
      const iv = setInterval(run, autoBackupInterval * 60 * 1000);
      return () => clearInterval(iv);
     
    }, [autoBackupEnabled, autoBackupInterval, users, dossiers, taches, rdvs, partners]);

    const handleSaveUser = async () => {
      if (!userForm.name || !userForm.role || !userForm.email) { gcAlert("Veuillez remplir tous les champs obligatoires (Nom, Rôle, Email)."); return; }
      if (!editingUser && !userForm.password) { gcAlert("Un mot de passe est obligatoire pour créer un compte."); return; }
      const userProcesses = userForm.processes && userForm.processes.length > 0
        ? userForm.processes
        : [userForm.process || "O01"];
      const primaryProcess = userProcesses[0];

      // Détecter si l'utilisateur connecté est RH (S03 niv4) non-admin
      const actorIsRH = !isAdmin && !isMG &&
        (localUser.process === "S03" || (localUser.processes||[]).includes("S03")) &&
        localUser.level === 4;

      if (editingUser) {
        // Modifications sensibles = changement level, processus ou accountStatus
        const sensitiveChanged = actorIsRH && (
          userForm.level !== editingUser.level ||
          primaryProcess !== (editingUser.process||"O01") ||
          JSON.stringify(userProcesses) !== JSON.stringify(editingUser.processes||[editingUser.process||"O01"])
        );

        if (sensitiveChanged) {
          // RH ne peut pas appliquer directement : soumettre au DG pour approbation
          const dgUser = users.find(u => (u.isMG || u.id === "USR-MG-001" || u.level === 5) && !u.isAdmin);
          const approvalReq = {
            id: "APPRO-RH-" + Date.now(),
            type: "RH_MODIF_SENSITIVE",
            targetUserId: editingUser.id,
            targetUserName: editingUser.name,
            targetUserRole: editingUser.role,
            initiatedBy: localUser.id,
            initiatedByName: localUser.name,
            initiatedByRole: localUser.role,
            initiatedAt: new Date().toISOString(),
            status: "EN_ATTENTE_DG",
            changes: {
              name: userForm.name, role: userForm.role, email: userForm.email,
              level: userForm.level, process: primaryProcess, processes: userProcesses,
              dept: userForm.dept, alias: userForm.alias, sexe: userForm.sexe,
              nationalite: userForm.nationalite, situationMatrimoniale: userForm.situationMatrimoniale,
              telephone: userForm.telephone, adresse: userForm.adresse, bio: userForm.bio},
            motif: `Modification niveau/processus — ${editingUser.name} : Niv.${editingUser.level}→Niv.${userForm.level} / ${editingUser.process}→${primaryProcess}`};
          if (setPendingApprovals) setPendingApprovals(prev => [...prev, approvalReq]);
          // Notifier le DG
          if (dgUser && setNotifications) setNotifications(prev => [{
            id:"N"+Date.now(), icon:"🔄",
            message:`🔄 Approbation requise (RH→DG) : Modification sensible de ${editingUser.name} — Niv.${editingUser.level}→${userForm.level} demandé par ${localUser.name}`,
            at:new Date().toISOString(), read:false, module:"gestion_comptes", targetUsers:[dgUser.id]
          },...prev]);
          gcAlert(`⏳ Demande soumise au Directeur Général.

Les modifications de niveau et processus de ${editingUser.name} sont en attente d'approbation DG.
Seules les informations d'identité (nom, téléphone, bio...) peuvent être enregistrées directement.`);
          // Appliquer uniquement les champs d'identité (non sensibles)
          const identityOnly = {
            ...editingUser,
            name: userForm.name, role: userForm.role, email: userForm.email,
            dept: userForm.dept, alias: userForm.alias, sexe: userForm.sexe,
            nationalite: userForm.nationalite, situationMatrimoniale: userForm.situationMatrimoniale,
            telephone: userForm.telephone, adresse: userForm.adresse, bio: userForm.bio};
          if (userForm.password) identityOnly.password = userForm.password;
          setUsers(prev => {const updated=prev.map(u => u.id === editingUser.id ? identityOnly : u);dsSave('users',updated);return updated;});
          setShowUserModal(false); setEditingUser(null);
          setUserForm({ id:"",name:"",role:"",email:"",level:2,process:"O01",processes:[],dept:"",alias:"",password:"",sexe:"",nationalite:"",situationMatrimoniale:"",telephone:"",adresse:"",bio:"",color:"" });
          return;
        }

        const updatedUser = {
          ...editingUser, name: userForm.name, role: userForm.role, email: userForm.email,
          level: userForm.level, process: primaryProcess, processes: userProcesses,
          dept: userForm.dept, alias: userForm.alias, sexe: userForm.sexe,
          nationalite: userForm.nationalite, situationMatrimoniale: userForm.situationMatrimoniale,
          telephone: userForm.telephone, adresse: userForm.adresse, bio: userForm.bio,
          isAdmin: userForm.level >= 6};
        if (userForm.password) updatedUser.passwordHash = await gcHashPassword(userForm.password);
        setUsers(prev => {const updated=prev.map(u => u.id === editingUser.id ? updatedUser : u);dsSave('users',updated);return updated;});
        setNotifications(prev => [{id:"N"+Date.now(),icon:"✏️",message:`Profil modifié : ${userForm.name} — Niveau ${userForm.level}${userProcesses.length>1?" — "+userProcesses.length+" processus":""}`,at:new Date().toISOString(),read:false},...prev]);
        gcAlert(`✅ Compte mis à jour !\n${userForm.name} — Niveau ${userForm.level}\nProcessus : ${userProcesses.join(", ")}`);
      } else {
        const avatarChars = userForm.name.trim().split(/\s+/).map(w=>w[0]||"").join("").slice(0,2).toUpperCase() || "??";
        const colors = ["#3B82F6","#22C55E","#A855F7","#F59E0B","#06B6D4","#EC4899","#F97316"];
        const colorChoice = userForm.color || colors[Math.floor(Math.random()*colors.length)];
        const newUser = {
          id: `USR-${primaryProcess.replace(/[^A-Z0-9]/g,"")}-${String(Date.now()).slice(-4)}`,
          name: userForm.name, alias: userForm.alias || userForm.name.split(" ")[0].toLowerCase(),
          role: userForm.role, dept: userForm.dept || "Non défini",
          process: primaryProcess, processes: userProcesses, level: userForm.level,
          avatar: avatarChars, color: colorChoice,
          isAdmin: userForm.level >= 6,
          sexe: userForm.sexe||"N/A", nationalite: userForm.nationalite||"N/A",
          situationMatrimoniale: userForm.situationMatrimoniale||"N/A",
          telephone: userForm.telephone||"+241 000 000 000",
          email: userForm.email, adresse: userForm.adresse||"Libreville, Gabon",
          bio: userForm.bio||`${userForm.role} au cabinet Génie Consultant.`,
          photoUrl: null, passwordHash: userForm.password ? await gcHashPassword(userForm.password) : undefined,
          createdAt: new Date().toISOString(), accountStatus: "ACTIF",
          createdByAdmin: true, createdByAdminId: localUser.id, createdByAdminName: localUser.name};
        setUsers(prev => {const updated=[...prev, newUser];dsSave('users',updated);return updated;});
        setNotifications(prev => [{id:"N"+Date.now(),icon:"👤",message:`Nouveau compte créé : ${newUser.name} (${newUser.id}) — Niveau ${newUser.level} — Processus : ${userProcesses.join(", ")}`,at:new Date().toISOString(),read:false},...prev]);
        gcAlert(`✅ Compte créé avec succès !\n\nID : ${newUser.id}\nNom : ${newUser.name}\nNiveau : ${newUser.level}\nProcessus : ${userProcesses.join(", ")}\nMot de passe défini.`);
      }
      setShowUserModal(false); setEditingUser(null);
      setUserForm({ id:"",name:"",role:"",email:"",level:2,process:"O01",processes:[],dept:"",alias:"",password:"",sexe:"",nationalite:"",situationMatrimoniale:"",telephone:"",adresse:"",bio:"",color:"" });
    };

    const handleReassignUser = (userId, newProcess, newRole, newLevel, newDept) => {
      const canReassign = isAdmin || localUser.level >= 5 || 
        users.find(u=>u.id===localUser.id&&["S03","P02"].includes(u.process));
      if (!canReassign) { gcAlert("Accès refusé. Seul le DG, la RH ou l'Admin peut réaffecter un collaborateur."); return; }
      setUsers(prev => { const _u=prev.map(u => u.id===userId ? {
        ...u,
        process: Array.isArray(newProcess) ? newProcess[0] : newProcess,
        processes: Array.isArray(newProcess) ? newProcess : [newProcess],
        role: newRole || u.role,
        level: newLevel || u.level,
        dept: newDept || u.dept,
        reassignedBy: localUser.name,
        reassignedAt: new Date().toISOString()} : u); dsSave('users',_u); return _u; });
      const target = users.find(u=>u.id===userId);
      setNotifications(prev => [{
        id:"N"+Date.now(), icon:"🔄",
        message:`Réaffectation : ${target?.name} → Processus : ${Array.isArray(newProcess)?newProcess.join(", "):newProcess} par ${localUser.name}`,
        at:new Date().toISOString(), read:false
      },...prev]);
    };

    const handleDeleteUser = (uid) => {
      setUsers(prev => { const _u=prev.filter(u=>u.id!==uid); dsSave('users',_u); return _u; });
      setShowDeleteConfirm(null);
    };

    const handleSaveSettings = () => {
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    };

    const handleAddInfo = () => {
      if (!addInfoName) return;
      setExtraInfos(prev => [...prev, { id: Date.now(), name: addInfoName, value: addInfoValue }]);
      setSettingsForm(prev => ({ ...prev, [addInfoName]: addInfoValue }));
      setShowAddInfoModal(false); setAddInfoName(""); setAddInfoValue("");
    };

    const openNewDoc = () => {
      setEditingDoc(null);
      setDocForm({ name: "", category: "CHARTE", description: "", process: "ALL", fileType: "PDF", accessLevel: 1, isLoginCharte: false, mandatory: false, visible: true, dataUrl: null, fileName: null, fileSize: 0 });
      setDocUploadStatus(null);
      setShowDocModal(true);
    };

    const openEditDoc = (doc) => {
      setEditingDoc(doc);
      setDocForm({
        name: doc.name, category: doc.category || "AUTRE", description: doc.description || "",
        process: doc.process || "ALL", fileType: doc.fileType || "PDF",
        accessLevel: doc.accessLevel || 1, isLoginCharte: !!doc.isLoginCharte,
        mandatory: !!doc.mandatory, visible: doc.visible !== false,
        dataUrl: doc.dataUrl || null, fileName: doc.fileName || null, fileSize: doc.fileSize || 0});
      setDocUploadStatus(doc.dataUrl ? { type: "ok", msg: `✅ Fichier chargé : ${doc.fileName || doc.name}` } : null);
      setShowDocModal(true);
    };

    const handleDocFileSelect = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setDocUploadStatus({ type: "loading", msg: "⏳ Lecture du fichier en cours…" });
      try {
        const result = await gcReadFile(file, 15); // 15MB max for system docs
        setDocForm(f => ({
          ...f,
          dataUrl: result.dataUrl,
          fileName: result.name,
          fileSize: result.size,
          fileType: result.ext}));
        setDocUploadStatus({ type: "ok", msg: `✅ ${result.name} (${result.sizeStr}) — Prêt à enregistrer` });
      } catch (err) {
        setDocUploadStatus({ type: "error", msg: `❌ ${err.message}` });
      }
      if (e.target) e.target.value = "";
    };

    const handleSaveDoc = () => {
      if (!docForm.name.trim()) { gcAlert("Veuillez saisir le nom du document."); return; }
      const catInfo = getCatInfo(docForm.category);
      const now = new Date().toISOString();
      if (editingDoc) {
        setSiSystemDocs(prev => prev.map(d => d.id === editingDoc.id ? {
          ...d,
          name: docForm.name, category: docForm.category, description: docForm.description,
          process: docForm.process, fileType: docForm.fileType, accessLevel: docForm.accessLevel,
          isLoginCharte: docForm.isLoginCharte,
          charteLabel: docForm.isLoginCharte ? (docForm.name) : d.charteLabel,
          mandatory: docForm.mandatory, visible: docForm.visible,
          dataUrl: docForm.dataUrl !== undefined ? docForm.dataUrl : d.dataUrl,
          fileName: docForm.fileName || d.fileName,
          fileSize: docForm.fileSize || d.fileSize,
          uploadedBy: localUser.id, uploadedAt: now} : d));
        setNotifications(prev => [{ id: "N"+Date.now(), icon: catInfo.icon, message: `Document SI mis à jour : "${docForm.name}" par ${localUser.name}`, at: now, read: false }, ...prev]);
        gcAlert(`✅ Document "${docForm.name}" mis à jour.`);
      } else {
        const newDoc = {
          id: "SYS-" + Date.now(),
          ref: `${docForm.category.slice(0,3)}-A${String((siSystemDocs||[]).length+1).padStart(2,"0")}-SI.v5.0/${new Date().getFullYear()}`,
          name: docForm.name, category: docForm.category, description: docForm.description,
          process: docForm.process, fileType: docForm.fileType, accessLevel: docForm.accessLevel,
          isLoginCharte: docForm.isLoginCharte,
          charteLabel: docForm.isLoginCharte ? docForm.name : undefined,
          mandatory: docForm.mandatory, visible: docForm.visible,
          dataUrl: docForm.dataUrl || null, fileName: docForm.fileName || null,
          fileSize: docForm.fileSize || 0, uploadedBy: localUser.id, uploadedAt: now};
        setSiSystemDocs(prev => [...(prev||[]), newDoc]);
        setNotifications(prev => [{ id: "N"+Date.now(), icon: catInfo.icon, message: `Nouveau document SI : "${newDoc.name}" (${newDoc.category}) par ${localUser.name}`, at: now, read: false }, ...prev]);
        gcAlert(`✅ Document "${newDoc.name}" ajouté au SI.\nRéférence : ${newDoc.ref}`);
      }
      setShowDocModal(false);
      setEditingDoc(null);
    };

    const handleDeleteDoc = async (doc) => {
      if (doc.mandatory) {
        if (!await gcConfirm(`⚠️ "${doc.name}" est un document obligatoire.\nVoulez-vous uniquement supprimer le fichier téléversé (conserver le document) ?`)) return;
        setSiSystemDocs(prev => prev.map(d => d.id === doc.id ? { ...d, dataUrl: null, fileName: null, fileSize: 0, uploadedBy: null, uploadedAt: null } : d));
        gcAlert(`✅ Fichier supprimé. Le document "${doc.name}" a été conservé (document obligatoire).`);
      } else {
        if (!await gcConfirm(`Supprimer définitivement le document "${doc.name}" ?`)) return;
        setSiSystemDocs(prev => (prev||[]).filter(d => d.id !== doc.id));
      }
    };

    const handleQuickUpload = async (docId, e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const result = await gcReadFile(file, 15);
        setSiSystemDocs(prev => prev.map(d => d.id === docId ? {
          ...d, dataUrl: result.dataUrl, fileName: result.name,
          fileSize: result.size, fileType: result.ext,
          uploadedBy: localUser.id, uploadedAt: new Date().toISOString()} : d));
        setNotifications(prev => [{ id: "N"+Date.now(), icon: "📎", message: `Fichier téléversé : "${result.name}" sur le document SI par ${localUser.name}`, at: new Date().toISOString(), read: false }, ...prev]);
        gcAlert(`✅ Fichier "${result.name}" téléversé avec succès.`);
      } catch (err) {
        gcAlert(`❌ Erreur : ${err.message}`);
      }
      if (e.target) e.target.value = "";
    };

    return (
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg,#C41E3A,#E02244)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚙️</div>
          <div>
            <h3 style={{ color: "#C41E3A", margin: 0, fontSize: 15, fontWeight: 800 }}>
              {isMG && !isAdmin ? "Paramètre & Gestion SI" : "Paramètres Système SI"}
            </h3>
            <div style={{ color: T.textMuted, fontSize: 11 }}>
              {isMG && !isAdmin
                ? "Directeur Général — Documents SI, Apparence & Paramètres globaux"
                : "Supervision SI — Niveau 6 — Accès Système complet"}
            </div>
          </div>
        </div>
        <Tabs tabs={[
          ...(isAdmin ? [{ id: "users", icon: "👥", label: "Comptes" }] : []),
          { id: "docs", icon: "📎", label: `Documents SI (${(siSystemDocs||[]).length})` },
          ...(isAdmin ? [{ id: "dossiers_admin", icon: "📁", label: "Dossiers Users" }] : []),
          { id: "settings", icon: "🔧", label: "Paramètres SI" },
          ...(isAdmin ? [{ id: "code_editor", icon: "💻", label: "Éditeur" }] : []),
          ...(isAdmin ? [{ id: "connexions", icon: "🔓", label: "Gestion des Accès" }] : []),
          ...(isAdmin ? [{ id: "logs", icon: "📊", label: "Journaux Live" }] : []),
          ...(isAdmin ? [{ id: "fichiers", icon: "📂", label: "Fichiers & Données" }] : []),
          ...(isAdmin ? [{ id: "imprimante", icon: "🖨️", label: "Imprimante" }] : []),
          ...(!isAdmin && isMG ? [{ id: "imprimante", icon: "🖨️", label: "Imprimante" }] : []),
          ...(isAdmin ? [{ id: "matrix", icon: "🗂️", label: "Matrice Programmes" }] : []),
          // v116 — Organigramme, Circuits, Accréditations → Processus & Hiérarchie (pas de doublon)
          ...((isAdmin || isMG) ? [{ id: "ia_config", icon: "🤖", label: "Assistant IA" }] : []),
          ...(isAdmin ? [{ id: "securite", icon: "🛡️", label: `Alertes Séc. (${(securityAlertsProp||[]).length})` }] : []),
          ...(isAdmin ? [{ id: "export_backup", icon: "💾", label: "Export/Import" }] : []),
          ...(!isAdmin && isMG ? [{ id: "export_backup", icon: "💾", label: "Export/Import" }] : []),
          ...(isAdmin ? [{ id: "sync_control", icon: "🔄", label: "Sync & Intégrité" }] : []),
        ]} active={adminTab} onChange={setAdminTab} T={T} />

        {/* ── GESTION COMPTES ── */}
        {adminTab === "users" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ color: T.text, margin: 0, fontSize: 13 }}>Comptes utilisateurs ({users.length}) — {users.filter(u=>_activeUser(u)&&(u.accountStatus||"ACTIF")==="ACTIF").length} actifs · {users.filter(u=>_activeUser(u)&&(u.accountStatus||"ACTIF")!=="ACTIF").length} suspendus/bloqués</h4>
              <Btn variant="primary" size="sm" onClick={() => { setEditingUser(null); setUserForm({ id: "", name: "", role: "", email: "", level: 2, process: "O01", dept: "", alias: "", password: "", sexe: "", nationalite: "", situationMatrimoniale: "", telephone: "", adresse: "", bio: "", color: "" }); setShowUserModal(true); }}>+ Créer compte</Btn>
            </div>
            {users.map((u) => {
              const acStatus = u.accountStatus || "ACTIF";
              const acCfg = ACCOUNT_STATUS_CONFIG[acStatus] || ACCOUNT_STATUS_CONFIG.ACTIF;
              return (
              <div key={u.id} style={{ background: T.surface2, borderRadius: 8, border: `1px solid ${acStatus!=="ACTIF"?acCfg.color+"44":T.border}`, padding: "10px 14px", marginBottom: 6, display: "flex", gap: 10, alignItems: "center" }}>
                <UserAvatar user={u} size={32} style={{opacity: acStatus!=="ACTIF"?0.6:1}} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.text, fontWeight: 700, fontSize: 12, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                    {u.name}
                    <span style={{background:acCfg.color+"22",border:`1px solid ${acCfg.color}44`,borderRadius:10,padding:"1px 7px",color:acCfg.color,fontSize:9,fontWeight:700}}>{acCfg.icon} {acCfg.label}</span>
                  </div>
                  <div style={{ color: T.textMuted, fontSize: 10 }}>{u.id} · {u.role} · Niveau {u.level} · {u.process}</div>
                  <div style={{ color: T.textDim, fontSize: 9 }}>📧 {u.email} {u.alias ? `· @${u.alias}` : ""}</div>
                  {acStatus!=="ACTIF" && u.suspensionMotif && <div style={{color:acCfg.color,fontSize:9,marginTop:1}}>⚠️ {u.suspensionMotif.slice(0,60)}{u.suspensionMotif.length>60?"…":""}</div>}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Btn variant="ghost" size="sm" onClick={() => { setEditingUser(u); setUserForm({ name: u.name, role: u.role, email: u.email, level: u.level, process: u.process, dept: u.dept || "", alias: u.alias || "", password: "", sexe: u.sexe || "", nationalite: u.nationalite || "", situationMatrimoniale: u.situationMatrimoniale || "", telephone: u.telephone || "", adresse: u.adresse || "", bio: u.bio || "", color: u.color || "" }); setShowUserModal(true); }}>✏️ Modifier</Btn>
                  {u.id !== "USR-ADM-000" && acStatus === "ACTIF" && (
                    <button onClick={async () => { const m = await gcPrompt(`Motif de suspension de ${u.name} :`); if(m){ setUsers(prev=>{const updated=prev.map(x=>x.id===u.id?{...x,accountStatus:"SUSPENDU_PROVISOIRE",suspensionMotif:m,suspensionBy:localUser.id,suspensionByName:localUser.name,suspensionAt:new Date().toISOString()}:x);dsSave('users',updated);return updated;}); setNotifications(prev=>[{id:"N"+Date.now(),icon:"⏸️",message:`[ADMIN] Session ${u.name} suspendue — ${m}`,at:new Date().toISOString(),read:false},...prev]); }}}
                      style={{background:"#F9731622",border:"1px solid #F9731644",color:"#F97316",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>⏸️</button>
                  )}
                  {u.id !== "USR-ADM-000" && acStatus !== "ACTIF" && (
                    <button onClick={async () => { if(await gcConfirm(`Réactiver ${u.name} ?`)){setUsers(prev=>{const updated=prev.map(x=>x.id===u.id?{...x,accountStatus:"ACTIF",suspensionMotif:null,suspensionBy:null}:x);dsSave('users',updated);return updated;});} }}
                      style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>▶️</button>
                  )}
                  {u.id !== "USR-ADM-000" && <Btn variant="danger" size="sm" onClick={() => setShowDeleteConfirm(u.id)}>🗑️</Btn>}
                </div>
              </div>
              );
            })}

            {/* Modal Créer/Modifier User */}
            {showUserModal && (
              <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "28px 32px", width: 520, maxWidth: "95vw", boxShadow: "0 24px 80px #0009", maxHeight: "90vh", overflowY: "auto" }}>
                  <h3 style={{ color: "#C41E3A", margin: "0 0 16px", fontWeight: 800 }}>{editingUser ? "✏️ Modifier le compte" : "➕ Créer un nouveau compte"}</h3>
                  <div style={{ background: "#3B82F615", border: "1px solid #3B82F633", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: T.textMuted }}>
                    📋 Les champs marqués <span style={{ color: "#C41E3A" }}>*</span> sont obligatoires. L'ID sera généré automatiquement.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <InputField label="Nom complet *" value={userForm.name} onChange={e => setUserForm(f=>({...f, name: e.target.value}))} T={T} placeholder="Prénom NOM" />
                    <InputField label="Fonction/Rôle *" value={userForm.role} onChange={e => setUserForm(f=>({...f, role: e.target.value}))} T={T} placeholder="Ex: Juriste, Agent RH…" />
                    <InputField label="Email professionnel *" value={userForm.email} onChange={e => setUserForm(f=>({...f, email: e.target.value.toLowerCase()}))} T={T} placeholder="prenom.nom@genie-consultant.com" />
                    <InputField label="Alias (@identifiant)" value={userForm.alias} onChange={e => setUserForm(f=>({...f, alias: e.target.value}))} T={T} placeholder="p.nom" />
                    <InputField label="Département / Service" value={userForm.dept} onChange={e => setUserForm(f=>({...f, dept: e.target.value}))} T={T} placeholder="Ex: Département Juridique" />
                    <InputField label="Téléphone" value={userForm.telephone} onChange={e => setUserForm(f=>({...f, telephone: e.target.value}))} T={T} placeholder="+241 000 000 000" />
                    <InputField label="Adresse" value={userForm.adresse} onChange={e => setUserForm(f=>({...f, adresse: e.target.value}))} T={T} placeholder="Libreville, Gabon" />
                    <InputField label={editingUser ? "Nouveau mot de passe (vide = inchangé)" : "Mot de passe *"} type="password" value={userForm.password} onChange={e => setUserForm(f=>({...f, password: e.target.value}))} T={T} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Sexe</label>
                      <select value={userForm.sexe} onChange={e => setUserForm(f=>({...f, sexe: e.target.value}))} style={{ width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12 }}>
                        <option value="">— Sélectionner —</option>
                        {["M","F","N/A"].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Nationalité</label>
                      <NationaliteField value={userForm.nationalite} onChange={e => setUserForm(f=>({...f, nationalite: e.target.value}))} T={T} />
                    </div>
                    <div>
                      <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Situation Matrim.</label>
                      <select value={userForm.situationMatrimoniale} onChange={e => setUserForm(f=>({...f, situationMatrimoniale: e.target.value}))} style={{ width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12 }}>
                        <option value="">— Sélectionner —</option>
                        {["Célibataire","Marié(e)","Divorcé(e)","Veuf/Veuve","N/A"].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Niveau d'habilitation *</label>
                      <select value={userForm.level} onChange={e => setUserForm(f=>({...f, level: Number(e.target.value)}))} style={{ width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12 }}>
                        {[[1,"Exécutant"],[2,"Opérationnel"],[3,"Responsable"],[4,"Manager"],[5,"Direction Générale"],[6,"Superviseur SI"]].map(([v,l]) => <option key={v} value={v}>{v} — {l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Processus principal *</label>
                      <select value={userForm.process} onChange={e => setUserForm(f=>({...f, process: e.target.value, processes: f.processes?.includes(e.target.value) ? f.processes : [e.target.value,...(f.processes||[]).slice(1)]}))} style={{ width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12 }}>
                        {Object.entries(CODES.processes).map(([k,v]) => <option key={k} value={k}>{k} — {v}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* Multi-process for level 4+ */}
                  {userForm.level >= 4 && (
                    <div style={{ marginTop: 10, background: "#3B82F615", border: "1px solid #3B82F633", borderRadius: 8, padding: "10px 12px" }}>
                      <label style={{ color: "#3B82F6", fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>📋 Processus additionnels (Niveau {userForm.level} — Multi-processus autorisé)</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        {Object.entries(CODES.processes).map(([k,v]) => {
                          const selected = (userForm.processes||[]).includes(k);
                          return (
                            <button key={k} type="button" onClick={() => {
                              const current = userForm.processes || [userForm.process];
                              const updated = selected ? current.filter(p=>p!==k) : [...current, k];
                              setUserForm(f=>({...f, processes: updated.length>0?updated:[k]}));
                            }} style={{ background: selected?"#3B82F622":"transparent", border: `1px solid ${selected?"#3B82F6":"#3B82F633"}`, borderRadius: 6, padding: "4px 8px", color: selected?"#3B82F6":T.textMuted, cursor: "pointer", fontSize: 10, fontWeight: selected?700:400 }}>
                              {selected?"✓ ":""}{k}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ color: T.textMuted, fontSize: 10 }}>Processus sélectionnés : {(userForm.processes||[userForm.process]).join(", ")}</div>
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Bio / Présentation</label>
                    <textarea value={userForm.bio} onChange={e => setUserForm(f=>({...f, bio: e.target.value}))} rows={2} placeholder="Description courte du collaborateur…" style={{ width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12, resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    <Btn variant="primary" size="sm" onClick={handleSaveUser}>{editingUser ? "💾 Enregistrer les modifications" : "✅ Créer le compte"}</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setShowUserModal(false)}>Annuler</Btn>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm delete */}
            {showDeleteConfirm && (
              <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: T.surface, border: "2px solid #C41E3A", borderRadius: 16, padding: "28px 32px", width: 380, boxShadow: "0 24px 80px #0009" }}>
                  <h3 style={{ color: "#C41E3A", margin: "0 0 12px" }}>⚠️ Confirmation de suppression</h3>
                  <p style={{ color: T.text, fontSize: 13 }}>Êtes-vous sûr de vouloir supprimer le compte <strong>{users.find(u=>u.id===showDeleteConfirm)?.name}</strong> ? Cette action est irréversible.</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Btn variant="danger" size="sm" onClick={() => handleDeleteUser(showDeleteConfirm)}>🗑️ Supprimer définitivement</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(null)}>Annuler</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS SYSTÈME SI ── */}
        {adminTab === "docs" && (() => {
          const filteredSysDocs = docFilter === "ALL"
            ? (siSystemDocs || [])
            : (siSystemDocs || []).filter(d => d.category === docFilter);
          const loginChartes = (siSystemDocs || []).filter(d => d.isLoginCharte);
          return (
          <div>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h4 style={{ color: T.text, margin: 0, fontSize: 14, fontWeight: 800 }}>📂 Documents du Système d'Information</h4>
                <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>
                  {(siSystemDocs||[]).length} document(s) · {(siSystemDocs||[]).filter(d=>d.dataUrl).length} fichier(s) téléversé(s) · {loginChartes.length} charte(s) de connexion
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="primary" size="sm" onClick={openNewDoc}>+ Nouveau document</Btn>
              </div>
            </div>

            {/* Bandeau chartes de connexion */}
            <div style={{ background: loginChartes.every(c=>c.dataUrl) ? "#22C55E12" : "#F59E0B12", border: `1px solid ${loginChartes.every(c=>c.dataUrl) ? "#22C55E44" : "#F59E0B44"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ color: loginChartes.every(c=>c.dataUrl) ? "#22C55E" : "#F59E0B", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                {loginChartes.every(c=>c.dataUrl) ? "✅" : "⚠️"} Chartes de connexion ({loginChartes.length})
                {!loginChartes.every(c=>c.dataUrl) && " — Des fichiers sont manquants"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {loginChartes.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, background: T.surface2, borderRadius: 7, padding: "5px 10px" }}>
                    <span style={{ fontSize: 14 }}>🔐</span>
                    <span style={{ color: T.text, fontSize: 11, fontWeight: 600 }}>{c.charteLabel || c.name}</span>
                    {c.dataUrl
                      ? <span style={{ color: "#22C55E", fontSize: 10 }}>✅ OK</span>
                      : <><span style={{ color: "#F59E0B", fontSize: 10 }}>⚠ Non téléversée</span>
                          <label style={{ background: "#F59E0B22", border: "1px solid #F59E0B44", borderRadius: 5, padding: "2px 7px", color: "#F59E0B", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                            ⬆ Charger
                            <input type="file" accept=".pdf,.docx,.doc" style={{ display: "none" }} onChange={e => handleQuickUpload(c.id, e)} />
                          </label>
                        </>
                    }
                    <button onClick={() => openEditDoc(c)} style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 11 }}>✏️</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Filtres par catégorie */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              <button onClick={() => setDocFilter("ALL")} style={{ background: docFilter === "ALL" ? "#C41E3A22" : "transparent", border: `1px solid ${docFilter === "ALL" ? "#C41E3A55" : T.border}`, borderRadius: 6, padding: "4px 10px", color: docFilter === "ALL" ? "#C41E3A" : T.textMuted, cursor: "pointer", fontSize: 11, fontWeight: docFilter === "ALL" ? 700 : 400 }}>Tous ({(siSystemDocs||[]).length})</button>
              {DOC_CATEGORIES.map(cat => {
                const count = (siSystemDocs||[]).filter(d => d.category === cat.id).length;
                if (count === 0) return null;
                return (
                  <button key={cat.id} onClick={() => setDocFilter(cat.id)} style={{ background: docFilter === cat.id ? cat.color+"22" : "transparent", border: `1px solid ${docFilter === cat.id ? cat.color+"55" : T.border}`, borderRadius: 6, padding: "4px 10px", color: docFilter === cat.id ? cat.color : T.textMuted, cursor: "pointer", fontSize: 11, fontWeight: docFilter === cat.id ? 700 : 400 }}>
                    {cat.icon} {cat.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Liste des documents */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredSysDocs.map(doc => {
                const catInfo = getCatInfo(doc.category);
                const uploader = users.find(u => u.id === doc.uploadedBy);
                return (
                  <div key={doc.id} style={{ background: T.surface2, borderRadius: 12, border: `1px solid ${doc.dataUrl ? catInfo.color+"33" : T.border}`, padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: catInfo.color+"22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{catInfo.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                        <span style={{ color: T.text, fontSize: 13, fontWeight: 700 }}>{doc.name}</span>
                        {doc.isLoginCharte && <Badge label="🔐 Charte connexion" color="#C41E3A" small />}
                        {doc.mandatory && <Badge label="⚡ Obligatoire" color="#F59E0B" small />}
                        <Badge label={catInfo.label} color={catInfo.color} small />
                        <Badge label={doc.process === "ALL" ? "Tous processus" : doc.process} color={getProcColor(doc.process)} small />
                        <Badge label={`Niveau ${doc.accessLevel}+`} color="#06B6D4" small />
                      </div>
                      <div style={{ color: T.textMuted, fontSize: 10, fontFamily: "monospace", marginBottom: 3 }}>{doc.ref}</div>
                      {doc.description && <div style={{ color: T.textDim, fontSize: 10, fontStyle: "italic", marginBottom: 4 }}>{doc.description}</div>}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {doc.dataUrl
                          ? <span style={{ color: "#22C55E", fontSize: 10, fontWeight: 600 }}>✅ {doc.fileName || doc.fileType} · {gcFmtSize(doc.fileSize)}</span>
                          : <span style={{ color: "#F59E0B", fontSize: 10, fontWeight: 600 }}>⏳ Aucun fichier téléversé</span>}
                        {uploader && <span style={{ color: T.textDim, fontSize: 10 }}>· {uploader.name} · {doc.uploadedAt ? formatDate(doc.uploadedAt) : "—"}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                      {/* Upload rapide */}
                      <label style={{ background: "#3B82F622", border: "1px solid #3B82F644", borderRadius: 7, padding: "4px 10px", color: "#3B82F6", fontSize: 10, cursor: "pointer", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>
                        ⬆ {doc.dataUrl ? "Remplacer" : "Téléverser"}
                        <input type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png,.pptx" style={{ display: "none" }} onChange={e => handleQuickUpload(doc.id, e)} />
                      </label>
                      {doc.dataUrl && (
                        <button onClick={() => gcDownloadDoc(doc)} style={{ background: "#22C55E22", border: "1px solid #22C55E44", borderRadius: 7, padding: "4px 10px", color: "#22C55E", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>⬇ Télécharger</button>
                      )}
                      {doc.dataUrl && (
                        <button onClick={() => gcViewDoc(doc)} style={{ background: "#A855F722", border: "1px solid #A855F744", borderRadius: 7, padding: "4px 10px", color: "#A855F7", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>👁 Visualiser</button>
                      )}
                      <button onClick={() => openEditDoc(doc)} style={{ background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "4px 10px", color: T.textMuted, fontSize: 10, cursor: "pointer", fontWeight: 700 }}>✏️ Modifier</button>
                      <button onClick={() => handleDeleteDoc(doc)} style={{ background: "#EF444415", border: "1px solid #EF444440", borderRadius: 7, padding: "4px 10px", color: "#EF4444", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>{doc.mandatory ? "🗑 Vider" : "🗑 Supprimer"}</button>
                    </div>
                  </div>
                );
              })}
              {filteredSysDocs.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: T.textDim }}>
                  Aucun document dans cette catégorie.
                  <div style={{ marginTop: 8 }}><Btn variant="primary" size="sm" onClick={openNewDoc}>+ Ajouter le premier document</Btn></div>
                </div>
              )}
            </div>

            {/* ── MODAL AJOUT / ÉDITION DOCUMENT ── */}
            {showDocModal && (
              <div style={{ position: "fixed", inset: 0, background: "#000B", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: "28px 32px", width: "min(520px, 95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 30px 100px #0009" }}>
                  <h3 style={{ color: "#C41E3A", margin: "0 0 20px", fontWeight: 800, fontSize: 15 }}>
                    {editingDoc ? "✏️ Modifier le document SI" : "📎 Nouveau document SI"}
                  </h3>

                  {/* Nom */}
                  <InputField label="Nom du document *" value={docForm.name} onChange={e => setDocForm(f=>({...f, name: e.target.value}))} T={T} placeholder="Ex: Grand Livre des Processus v5" />

                  {/* Catégorie */}
                  <div style={{ marginTop: 12 }}>
                    <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Catégorie *</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {DOC_CATEGORIES.map(cat => (
                        <button key={cat.id} onClick={() => setDocForm(f=>({...f, category: cat.id}))} style={{ background: docForm.category === cat.id ? cat.color+"22" : "transparent", border: `1px solid ${docForm.category === cat.id ? cat.color+"88" : T.border}`, borderRadius: 7, padding: "5px 10px", color: docForm.category === cat.id ? cat.color : T.textMuted, cursor: "pointer", fontSize: 11, fontWeight: docForm.category === cat.id ? 700 : 400 }}>
                          {cat.icon} {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{ marginTop: 12 }}>
                    <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Description</label>
                    <textarea value={docForm.description} onChange={e => setDocForm(f=>({...f, description: e.target.value}))} rows={2} placeholder="Description du document…" style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 12, resize: "vertical", boxSizing: "border-box" }} />
                  </div>

                  {/* Processus + Niveau accès */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                    <div>
                      <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Processus</label>
                      <select value={docForm.process} onChange={e => setDocForm(f=>({...f, process: e.target.value}))} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12 }}>
                        <option value="ALL">Tous les processus</option>
                        {Object.entries(CODES.processes).map(([k,v]) => <option key={k} value={k}>{k} — {v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Accès minimum (niveau)</label>
                      <select value={docForm.accessLevel} onChange={e => setDocForm(f=>({...f, accessLevel: Number(e.target.value)}))} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12 }}>
                        <option value={1}>1 — Tous (Agents)</option>
                        <option value={2}>2 — Opérateurs +</option>
                        <option value={3}>3 — Superviseurs +</option>
                        <option value={4}>4 — Responsables +</option>
                        <option value={5}>5 — Direction +</option>
                        <option value={6}>6 — Direction SI seul</option>
                      </select>
                    </div>
                  </div>

                  {/* Options */}
                  <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
                    {[
                      { key: "isLoginCharte", icon: "🔐", label: "Charte de connexion (affichée sur la page de connexion)" },
                      { key: "mandatory", icon: "⚡", label: "Document obligatoire (non supprimable)" },
                      { key: "visible", icon: "👁", label: "Visible par les utilisateurs" },
                    ].map(opt => (
                      <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", color: T.text, fontSize: 12 }}>
                        <input type="checkbox" checked={!!docForm[opt.key]} onChange={e => setDocForm(f=>({...f, [opt.key]: e.target.checked}))} style={{ accentColor: "#C41E3A", width: 14, height: 14 }} />
                        {opt.icon} {opt.label}
                      </label>
                    ))}
                  </div>

                  {/* Zone upload fichier */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Fichier (PDF, DOCX, XLSX, PNG, PPTX — max 15 Mo)</label>
                    <div style={{ position: "relative" }}>
                      <input ref={docAdminRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png,.pptx,.txt" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 2, width: "100%", height: "100%" }} onChange={handleDocFileSelect} />
                      <div style={{ background: T.surface2, border: `2px dashed ${docForm.dataUrl ? "#22C55E" : T.border}`, borderRadius: 10, padding: "18px", textAlign: "center", color: docForm.dataUrl ? "#22C55E" : T.textMuted, fontSize: 12, pointerEvents: "none", transition: "all 0.2s" }}>
                        {docForm.dataUrl
                          ? `✅ ${docForm.fileName} (${gcFmtSize(docForm.fileSize)})`
                          : "📂 Cliquer ou glisser-déposer un fichier ici"}
                      </div>
                    </div>
                    {docUploadStatus && (
                      <div style={{ marginTop: 6, fontSize: 11, color: docUploadStatus.type === "ok" ? "#22C55E" : docUploadStatus.type === "error" ? "#EF4444" : "#F59E0B", fontWeight: 600 }}>
                        {docUploadStatus.msg}
                      </div>
                    )}
                    {docForm.dataUrl && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button onClick={() => gcViewDoc(docForm)} style={{ background: "#A855F722", border: "1px solid #A855F744", borderRadius: 7, padding: "4px 12px", color: "#A855F7", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>👁 Prévisualiser</button>
                        <button onClick={() => { setDocForm(f=>({...f, dataUrl: null, fileName: null, fileSize: 0})); setDocUploadStatus(null); }} style={{ background: "#EF444415", border: "1px solid #EF444440", borderRadius: 7, padding: "4px 12px", color: "#EF4444", fontSize: 11, cursor: "pointer" }}>🗑 Retirer le fichier</button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                    <Btn variant="primary" size="sm" onClick={handleSaveDoc}>{editingDoc ? "💾 Enregistrer" : "✅ Créer le document"}</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => { setShowDocModal(false); setEditingDoc(null); }}>Annuler</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* ── DOSSIERS & DOCS USERS (ADMIN VIEW) ── */}
        {adminTab === "dossiers_admin" && (
          <div>
            <div style={{ background: "#3B82F622", border: "1px solid #3B82F644", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: T.text }}>
              ℹ️ <strong>Accès administrateur total</strong> — Vous voyez ici tous les documents et dossiers de tous les utilisateurs, quelle que soit leur habilitation.
            </div>
            {users.filter(u => _activeUser(u)&&u.id !== "USR-ADM-000").map(u => {
              const userDossiers = dossiers.filter(d => d.assignedTo === u.id || d.createdBy === u.id);
              if (userDossiers.length === 0) return null;
              return (
                <div key={u.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <UserAvatar user={u} size={28} />
                    <div style={{ flex: 1 }}><div style={{ color: T.text, fontWeight: 700, fontSize: 12 }}>{u.name}</div><div style={{ color: T.textMuted, fontSize: 10 }}>{u.role} • {userDossiers.length} dossier(s)</div></div>
                  </div>
                  {userDossiers.slice(0, 3).map(d => {
                    const sc = STATUS_CONFIG[d.status];
                    return (
                      <div key={d.id} onClick={() => { /* FIX v123 — setSelectedDossier not in AdminPanel props; navigate to dossiers module instead */ try{window.dispatchEvent(new CustomEvent("gc:open-dossier",{detail:d.id}));}catch(_){} }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: T.surface3, borderRadius: 6, marginBottom: 4, cursor: "pointer" }}>
                        <span style={{ color: sc.color, fontSize: 12 }}>{sc.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: T.text, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.client} — {d.ref}</div>
                          <ProgressBar value={d.progress} color={sc.color} />
                        </div>
                        <Badge label={sc.label} color={sc.color} small />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* ── PARAMÈTRES SI ── */}
        {adminTab === "settings" && (
          <div>
            <h4 style={{ color: T.text, margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>🔧 Paramètres généraux du SI</h4>

            {/* ── LOGO DU CABINET ── v107 ────────────────────── */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
              <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>🖼️ Logo du Cabinet</div>
              <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{width:80,height:80,borderRadius:12,background:T.surface3,border:`2px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
                  {logoPreviewAdmin
                    ? <img src={logoPreviewAdmin} alt="Logo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : <span style={{fontSize:28,opacity:0.4}}>🏛️</span>}
                </div>
                <div style={{flex:1,minWidth:200}}>
                  <div style={{color:T.textMuted,fontSize:11,marginBottom:8,lineHeight:1.6}}>
                    Formats : PNG, JPG, SVG · Taille max : 2 Mo · Recommandé : 200×200 px minimum<br/>
                    Le logo s'affiche sur la page de connexion, la couverture et les entêtes du SI.
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <input ref={logoInputAdminRef} type="file" accept="image/*" onChange={handleLogoUploadAdmin} style={{display:"none"}}/>
                    <button onClick={()=>logoInputAdminRef.current?.click()}
                      style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                      📁 Choisir un fichier
                    </button>
                    {logoPreviewAdmin && (
                      <button onClick={handleApplyLogoAdmin}
                        style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                        ✅ Appliquer le logo
                      </button>
                    )}
                    {siLogoUrl && (
                      <button onClick={handleRemoveLogoAdmin}
                        style={{background:"#EF444415",border:"1px solid #EF444440",color:"#EF4444",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontSize:11}}>
                        🗑️ Supprimer
                      </button>
                    )}
                    {logoPreviewAdmin && logoPreviewAdmin !== siLogoUrl && (
                      <span style={{color:"#F59E0B",fontSize:10,alignSelf:"center"}}>⚠️ Cliquez "Appliquer" pour valider</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── TOGGLE APPROBATION CONNEXION ────────────────── */}
            <div style={{ background: requireConnApproval ? "#F59E0B12" : "#22C55E12", border: `1px solid ${requireConnApproval ? "#F59E0B44" : "#22C55E44"}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ color: T.text, fontWeight: 700, fontSize: 12 }}>🔐 Approbation de connexion collaborateurs</div>
                <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>
                  {requireConnApproval
                    ? "ACTIVÉE — Tout collaborateur (niv. 1-4) doit obtenir un code d'approbation avant de se connecter."
                    : "DÉSACTIVÉE — Les collaborateurs se connectent directement avec leur mot de passe (recommandé)."}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ color: requireConnApproval ? "#F59E0B" : "#22C55E", fontSize: 11, fontWeight: 700 }}>{requireConnApproval ? "ON" : "OFF"}</span>
                <div onClick={() => setRequireConnApproval && setRequireConnApproval(!requireConnApproval)}
                  style={{ width: 42, height: 24, borderRadius: 12, background: requireConnApproval ? "#F59E0B" : "#22C55E", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: requireConnApproval ? 21 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px #0005" }} />
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <InputField label="Nom du cabinet" value={settingsForm.nom} onChange={e => setSettingsForm(f=>({...f,nom:e.target.value}))} T={T} />
              <InputField label="Slogan" value={settingsForm.slogan} onChange={e => setSettingsForm(f=>({...f,slogan:e.target.value}))} T={T} />
              <InputField label="E-mail contact" value={settingsForm.email} onChange={e => setSettingsForm(f=>({...f,email:e.target.value}))} T={T} />
              <InputField label="Site web" value={settingsForm.web} onChange={e => setSettingsForm(f=>({...f,web:e.target.value}))} T={T} />
              <InputField label="RCCM" value={settingsForm.rccm} onChange={e => setSettingsForm(f=>({...f,rccm:e.target.value}))} T={T} />
              <InputField label="NIF" value={settingsForm.nif} onChange={e => setSettingsForm(f=>({...f,nif:e.target.value}))} T={T} />
              <div style={{ gridColumn: "span 2" }}><InputField label="Adresse" value={settingsForm.adresse} onChange={e => setSettingsForm(f=>({...f,adresse:e.target.value}))} T={T} /></div>
            </div>
            {/* Extra infos */}
            {extraInfos.map(info => (
              <div key={info.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                <div style={{ background: T.surface3, border: `1px solid #C9A84C44`, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ color: "#C9A84C", fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>{info.name}</div>
                  <div style={{ color: T.text, fontSize: 13 }}>{info.value}</div>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button onClick={handleSaveSettings} style={{ background: settingsSaved ? "#22C55E" : "#C41E3A", border: "none", color: "#fff", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "background 0.3s" }}>
                {settingsSaved ? "✅ Informations enregistrées !" : "💾 Confirmer & Enregistrer"}
              </button>
              <button onClick={() => setShowAddInfoModal(true)} style={{ background: "#3B82F622", border: "1px solid #3B82F644", color: "#3B82F6", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                ➕ Ajouter une information
              </button>
            </div>
            {/* System info & factory reset */}
            <div style={{ marginTop: 20, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              <h4 style={{ color: T.text, margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>📊 Informations Système</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
                {[
                  { label: "Utilisateurs", value: users.length, icon: "👥", color: "#3B82F6" },
                  { label: "Dossiers", value: dossiers.length, icon: "📁", color: "#A855F7" },
                  { label: "Tâches", value: taches.length, icon: "📋", color: "#22C55E" },
                  { label: "Approbations", value: pendingApprovals.length, icon: "⏳", color: "#F59E0B" },
                ].map(s => (
                  <div key={s.label} style={{ background: T.surface3, border: `1px solid ${s.color}33`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 20 }}>{s.icon}</div>
                    <div style={{ color: s.color, fontWeight: 800, fontSize: 18 }}>{s.value}</div>
                    <div style={{ color: T.textMuted, fontSize: 10 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#C41E3A15", border: "1px solid #C41E3A33", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                 <div>
                   <div style={{ color: "#C41E3A", fontWeight: 700, fontSize: 12 }}>⚠️ Zone dangereuse — Réinitialisation du SI</div>
                   <div style={{ color: T.textMuted, fontSize: 11 }}>Choisissez précisément ce que vous souhaitez effacer.</div>
                 </div>
                 {onFactoryReset && (
                   <button onClick={()=>setShowResetModal(true)} style={{ background: "#C41E3A", border: "none", color: "#fff", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                     ⚙️ Options de réinitialisation
                   </button>
                 )}
               </div>

             {/* ── MODAL RÉINITIALISATION GRANULAIRE ── */}
             {showResetModal && (
               <div style={{position:"fixed",inset:0,background:"#000C",zIndex:5000,display:"flex",alignItems:"center",justifyContent:"center"}}>
                 <div style={{background:T.surface,border:"2px solid #C41E3A44",borderRadius:18,padding:"28px 30px",width:520,boxShadow:"0 24px 60px #000A",maxHeight:"90vh",overflowY:"auto"}}>
                   <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                     <div style={{fontSize:28}}>⚙️</div>
                     <div>
                       <div style={{color:"#C41E3A",fontWeight:900,fontSize:15}}>Réinitialisation sélective du SI</div>
                       <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>Cochez ce que vous voulez effacer. Comptes protégés par défaut.</div>
                     </div>
                   </div>
                   <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
                     {[
                       {k:"dossiers",    l:"📁 Dossiers & Documents",  danger:false},
                       {k:"taches",      l:"📋 Tâches & Alertes",       danger:false},
                       {k:"rdvs",        l:"📅 Agenda & RDV",           danger:false},
                       {k:"partners",    l:"🤝 Partenaires & Clients",  danger:false},
                       {k:"approvals",   l:"✅ Approbations",           danger:false},
                       {k:"connections", l:"🔗 Demandes connexion",     danger:false},
                       {k:"sirh",        l:"👥 Données SIRH",           danger:false},
                       {k:"docs",        l:"📄 Documents internes",     danger:false},
                       {k:"sessionLogs", l:"🔐 Journaux sessions",      danger:false},
                       {k:"achats",      l:"🛒 Achats & Stocks",        danger:false},
                       {k:"finance",     l:"💰 Finance & Comptabilité", danger:false},
                       {k:"audit",       l:"🔍 Audit & Contrôle",       danger:false},
                       {k:"logistique",  l:"🚚 Logistique & Inventaires",danger:false},
                       {k:"comm",        l:"📢 Communication & Marketing",danger:false},
                       {k:"notifications",l:"🔔 Notifications",         danger:false},
                       {k:"users",       l:"👤 Comptes utilisateurs",   danger:true},
                     ].map(({k,l,danger})=>(
                       <label key={k} style={{display:"flex",alignItems:"center",gap:8,background:danger?"#C41E3A10":resetOptions[k]?"#3B82F610":T.surface2,border:`1px solid ${danger?"#C41E3A44":resetOptions[k]?"#3B82F644":T.border}`,borderRadius:8,padding:"8px 12px",cursor:"pointer"}}>
                         <input type="checkbox" checked={resetOptions[k]} onChange={e=>setResetOptions(p=>({...p,[k]:e.target.checked}))} style={{width:15,height:15,cursor:"pointer",accentColor:danger?"#C41E3A":"#3B82F6"}} />
                         <span style={{color:danger?"#C41E3A":T.text,fontSize:11,fontWeight:danger?700:500,flex:1}}>{l}</span>
                         {danger&&<span style={{fontSize:9,color:"#C41E3A",fontWeight:700}}>⚠️</span>}
                       </label>
                     ))}
                   </div>
                   <div style={{marginBottom:14}}>
                     <div style={{color:"#EF4444",fontWeight:700,fontSize:11,marginBottom:6}}>🔑 Code de confirmation</div>
                     <input value={resetConfirmCode} onChange={e=>setResetConfirmCode(e.target.value.toUpperCase())} placeholder="Saisir : RESET-GC-SI"
                       style={{width:"100%",background:T.surface3,border:"1px solid #EF444444",borderRadius:7,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"monospace",boxSizing:"border-box"}} />
                   </div>
                   <div style={{background:"#3B82F612",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:10,color:T.textMuted}}>
                     ℹ️ Les infos de base des comptes (ID, nom, rôle, niveau, mot de passe) sont <strong style={{color:T.text}}>toujours préservées</strong>.
                   </div>
                   <div style={{display:"flex",gap:10}}>
                     <button onClick={async ()=>{
                       if(resetConfirmCode.trim()!=="RESET-GC-SI"){gcAlert("❌ Code incorrect.");return;}
                       const selected=Object.entries(resetOptions).filter(([_k,v])=>v).map(([k])=>k);
                       if(!selected.length){gcAlert("Aucune option sélectionnée.");return;}
                       const labels={dossiers:"Dossiers",taches:"Tâches",rdvs:"RDV",partners:"Partenaires",approvals:"Approbations",connections:"Connexions",sirh:"SIRH",docs:"Documents",sessionLogs:"Journaux",achats:"Achats/Stocks",notifications:"Notifications",finance:"Finance & Comptabilité",audit:"Audit & Contrôle",logistique:"Logistique",comm:"Communication",users:"Comptes utilisateurs"};
                       if(!await gcConfirm(`⚠️ Confirmer la réinitialisation de :\n${selected.map(k=>"• "+(labels[k]||k)).join("\n")}\n\nCette action est IRRÉVERSIBLE et affectera TOUS les postes connectés.`,"Confirmation","🗑️",true))return;

                       // Helper : vide une clé définitivement — LS + wipe-registry + serveur forceOverwrite
                       // dsWipeKey enregistre le wipe localement ET sur le serveur pour bloquer
                       // la résurrection depuis les postes hors-ligne qui reviendraient plus tard.
                       const _wipe = (key, val=[]) => dsWipeKey(key, val).catch(()=>{});

                       const ops = [];

                       if(resetOptions.dossiers){
                         if(setDossiers)setDossiers([]);
                         ops.push(_wipe('dossiers'), _wipe('gc-dossiers'), _wipe('gc-pending-delete-approvals'), _wipe('pendingApprovals'));
                         if(setPendingApprovals)setPendingApprovals([]);
                       }
                       if(resetOptions.taches){
                         if(setTaches)setTaches([]);
                         ops.push(_wipe('taches'), _wipe('gc-taches'));
                       }
                       if(resetOptions.rdvs){
                         if(setRdvs)setRdvs([]);
                         ops.push(_wipe('rdvs'), _wipe('gc-rdvs'));
                       }
                       if(resetOptions.partners){
                         if(setPartnersSync)setPartnersSync([]);
                         ops.push(_wipe('partners'), _wipe('gc-crm-clients'), _wipe('gc-crm-interactions'), _wipe('gc-crm-opps'), _wipe('gc-crm-relances'));
                       }
                       if(resetOptions.approvals){
                         if(setPendingApprovals)setPendingApprovals([]);
                         ops.push(_wipe('pendingApprovals'), _wipe('gc-pending-approvals'), _wipe('gc-pending-delete-approvals'));
                       }
                       if(resetOptions.connections){
                         ops.push(_wipe('gc-pending-connections'), _wipe('gc-pending-account-actions'));
                       }
                       if(resetOptions.sirh){
                         ["gc-sirh-presences","gc-sirh-leaves","gc-leaves","gc-sirh-recrutements","gc-recrutements","gc-paie-transferts","gc-sirh-evaluations","gc-sirh-fichiers","gc-sirh-reinstatements","gc-sirh-onboarding","gc-paie-taux"].forEach(k=>ops.push(_wipe(k)));
                       }
                       if(resetOptions.docs){
                         ["gc-internal-docs","gc-external-docs","gc-dossier-files","gc-docs-unified","gc-standalone-docs","gc-docs-archives","gc-ohada-docs","gc-docs-templates","standaloneDocuments","gc-writer-docs","gc-writer-pro-v2","gc-tableur-pro","gc-pres-decks-v2","gc-courrier-docs"].forEach(k=>ops.push(_wipe(k)));
                       }
                       if(resetOptions.finance){
                         ["gc-journal","gc-journal-ohada","gc-budget","gc-budget-entries","gc-budget-rapide","gc-factures","gc-devis","gc-ohada-custom","gc-ohada-overrides","gc-piece-series","gc-paie-transferts"].forEach(k=>ops.push(_wipe(k)));
                       }
                       if(resetOptions.audit){
                         ["gc-tpa","gc-audit-prog","gc-feuille-tests","gc-audit-actions","gc-audit-checklist","gc-audit-checklist-custom","gc-audit-grille-taches","gc-pca","gc-pca-risques","gc-pca-procedures","gc-pca-tests","gc-coso-scores","gc-coso-notes","gc-coso-custom-q","gc-risks","gc-nc","gc-obligations","gc-conffull-approvals","gc-conffull-checks","gc-conffull-kpi","gc-conffull-veille","gc-rgpd-traitements","gc-amelio-actions","gc-amelio-kpis","gc-amelio-ncs"].forEach(k=>ops.push(_wipe(k)));
                       }
                       if(resetOptions.logistique){
                         ["gc-achats","gc-stocks","gc-logmod-stocks","gc-logistique-actifs","gc-inventaires","gc-inventaire-en-cours","gc-resources"].forEach(k=>ops.push(_wipe(k)));
                       }
                       if(resetOptions.comm){
                         ["gc-comm-campagnes","gc-comm-contacts","gc-comm-fiches","gc-comm-custom-tpl"].forEach(k=>ops.push(_wipe(k)));
                       }
                       if(resetOptions.sessionLogs){
                         if(setSessionLogs)setSessionLogs([]);
                         ops.push(_wipe('gc-session-logs'));
                       }
                       if(resetOptions.notifications){
                         try{Object.keys(localStorage).filter(k=>k&&(k.includes(":notif:")||k==="gc-notifications")).forEach(k=>{try{_lsRm(k);}catch(_){}});}catch(_){}
                         ops.push(_wipe('gc-notifications'));
                       }
                       if(resetOptions.users&&users&&setUsers){
                         const p=users.map(u=>({id:u.id,name:u.name,role:u.role,level:u.level,process:u.process,processes:u.processes,email:u.email,password:u.password,isAdmin:u.isAdmin,isMG:u.isMG,color:u.color,alias:u.alias}));
                         setUsers(p);
                         ops.push(_wipe('users', p), _wipe('gc-users', p));
                       }

                       // FIX BUG#3 — vider les tombstones AVANT await pour être inclus dans le même batch
                       // gc-tombstones doit être un objet {} et non un tableau []
                       try { _lsSet('gc-tombstones', '{}'); } catch(_) {}
                       ops.push(_wipe('gc-tombstones', {}));

                       // Attendre toutes les syncs serveur (incluant le wipe tombstones)
                       await Promise.allSettled(ops);

                       // Notifier les autres postes via un événement custom (forcer resync)
                       try { window.dispatchEvent(new CustomEvent('gc-resync-all')); } catch(_) {}

                       setShowResetModal(false);setResetConfirmCode("");
                       gcAlert(`✅ Réinitialisation effectuée — ${selected.length} catégorie(s) effacée(s) sur TOUS les postes. Actualisation dans 3s…`);
                       setTimeout(()=>window.location.reload(), 3000);
                     }} style={{flex:1,background:"#C41E3A",border:"none",color:"#fff",borderRadius:9,padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>🗑️ Effacer la sélection</button>
                     <button onClick={()=>{setShowResetModal(false);setResetConfirmCode("");}} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:9,padding:"11px 20px",cursor:"pointer",fontWeight:700,fontSize:12}}>Annuler</button>
                   </div>
                 </div>
               </div>
             )}
            </div>

            {/* Modal ajouter info */}
            {showAddInfoModal && (
              <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "28px 32px", width: 420, boxShadow: "0 24px 80px #0009" }}>
                  <h3 style={{ color: "#3B82F6", margin: "0 0 16px", fontWeight: 800 }}>➕ Ajouter une information</h3>
                  <InputField label="Nom du champ *" value={addInfoName} onChange={e => setAddInfoName(e.target.value)} T={T} placeholder="Ex: Téléphone, Fax, Responsable…" />
                  <div style={{ marginTop: 10 }}>
                    <InputField label="Valeur" value={addInfoValue} onChange={e => setAddInfoValue(e.target.value)} T={T} placeholder="Ex: +241 01 XX XX XX" />
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    <Btn variant="primary" size="sm" onClick={handleAddInfo}>✅ Ajouter</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setShowAddInfoModal(false)}>Annuler</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── JOURNAUX D'ACTIVITÉ LIVE ── */}
        {adminTab === "logs" && (
          <ActivityJournal
            T={T} sessionLogs={sessionLogs} setSessionLogs={setSessionLogs}
            users={users} dossiers={dossiers} taches={taches}
            currentUser={localUser} addSessionLog={addSessionLog}
          />
        )}

        {/* ── GESTION FICHIERS & DONNÉES ── */}
        {adminTab === "fichiers" && (
          <FileDataManager T={T} users={users} currentUser={localUser} addSessionLog={addSessionLog} setNotifications={setNotifications} />
        )}

        {/* ── CONFIGURATION IMPRIMANTE ── */}
        {adminTab === "imprimante" && (
          <PrinterConfig T={T} currentUser={localUser} addSessionLog={addSessionLog} />
        )}

        {/* ── ÉDITEUR DE CODE ── */}
        {adminTab === "code_editor" && <AdminCodeEditor T={T} setNotifications={setNotifications} siLogoUrl={siLogoUrl} setSiLogoUrl={setSiLogoUrl} siAppearance={siAppearance} setSiAppearance={setSiAppearance} siCSSOverrides={siCSSOverrides} setSiCSSOverrides={setSiCSSOverrides}
          /* Live state setters for direct SI commands */
          users={users} setUsers={setUsers} dossiers={dossiers} setDossiers={setDossiers} taches={taches} setTaches={setTaches} rdvs={rdvs} setRdvs={setRdvs} pendingApprovals={pendingApprovals} setPendingApprovals={setPendingApprovals} localUser={localUser} />}

        {/* ── GESTION CONNEXIONS ── */}
        {adminTab === "connexions" && <AdminConnexionsTab T={T} users={users} setUsers={setUsers} pendingConnections={pendingConnections} setPendingConnections={handleSetPendingConnections} setNotifications={setNotifications} sessionLogs={sessionLogs} setSessionLogs={setSessionLogs} pendingApprovals={pendingApprovals} setPendingApprovals={setPendingApprovals} generateAccessCode={generateAccessCode} />}

        {/* ── MATRICE PROGRAMMES ↔ PROCESSUS ── */}
        {adminTab === "matrix" && (
          <ProcessAppMatrixAdmin T={T} currentUser={localUser} />
        )}

        {/* ── v99 — ORGANIGRAMME ── */}
        
        
        
        {adminTab === "ia_config" && (
          <AIConfigAdminTab T={T} isAdmin={isAdmin} isMG={isMG} />
        )}

        {/* ── CONFIG DÉLAIS & ALERTES ── */}
        {/* ── ALERTES SÉCURITÉ ── */}
        {adminTab === "securite" && (() => {
          const alerts = securityAlertsProp || [];
          const sortedAlerts = [...alerts].sort((a,b) => new Date(b.at||b.date||0) - new Date(a.at||a.date||0));
          const clearAlerts = () => { setSecurityAlertsProp([]); dsSave('gc-security-alerts', []).catch(()=>{}); };
          const SEVER_CFG = { CRITIQUE: { bg: "#FF0000", color: "#fff" }, HAUTE: { bg: "#EF444433", color: "#EF4444" }, MOYENNE: { bg: "#F59E0B33", color: "#F59E0B" }, INFO: { bg: "#3B82F633", color: "#3B82F6" } };
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>🛡️ Alertes de Sécurité Système</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: T.textMuted, fontSize: 11 }}>{alerts.length} événement(s)</span>
                  {alerts.length > 0 && <button onClick={clearAlerts} style={{ background: "#EF444422", border: "1px solid #EF444466", color: "#EF4444", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 11 }}>🗑️ Tout effacer</button>}
                </div>
              </div>
              {sortedAlerts.length === 0 ? (
                <div style={{ color: T.textMuted, fontSize: 12, textAlign: "center", padding: 32, background: T.surface2, borderRadius: 10 }}>✅ Aucune alerte de sécurité enregistrée</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 520, overflowY: "auto" }}>
                  {sortedAlerts.map((a, i) => {
                    const sev = a.severity || a.level || "INFO";
                    const cfg = SEVER_CFG[sev] || SEVER_CFG.INFO;
                    return (
                      <div key={a.id || i} style={{ background: cfg.bg, border: `1px solid ${cfg.color}44`, borderRadius: 8, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: cfg.color, fontWeight: 700, fontSize: 11 }}>{sev}</span>
                          <span style={{ color: T.textMuted, fontSize: 10 }}>{a.at ? new Date(a.at).toLocaleString('fr-FR') : a.date || "—"}</span>
                        </div>
                        <div style={{ color: T.text, fontSize: 12 }}>{a.message || a.msg || JSON.stringify(a)}</div>
                        {a.userId && <div style={{ color: T.textMuted, fontSize: 10 }}>Utilisateur : {a.userId} {a.ip ? `— IP : ${a.ip}` : ""}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {adminTab === "delais_config" && (
          <DelaisAdminPanel T={T} localUser={localUser} setNotifications={setNotifications} />
        )}

        {/* ── SYNC & INTÉGRITÉ DES DONNÉES ── */}
        {adminTab === "sync_control" && (
          <SyncControlPanel T={T} currentUser={localUser} />
        )}

        {/* ── SAUVEGARDE / RESTAURATION GRANULAIRE (v143) ── */}
        {adminTab === "export_backup" && (() => {
          const selectedCount = Object.values(backupModules).filter(Boolean).length;
          return (
            <div style={{display:"flex",flexDirection:"column",gap:18}}>

              {/* ══ SAUVEGARDE COMPLÈTE (ancienne) ══ */}
              <ExportBackupPanel T={T} currentUser={localUser}
                users={users} dossiers={dossiers} taches={taches} rdvs={rdvs}
                partners={partners} setPartners={setPartnersSync} setPendingApprovals={setPendingApprovals} pendingApprovals={pendingApprovals}
                sessionLogs={sessionLogs} siAppearance={siAppearance}
                setUsers={setUsers} setDossiers={setDossiers} setTaches={setTaches} setRdvs={setRdvs}
              />

              {/* ══ SAUVEGARDE GRANULAIRE ══ */}
              <div style={{background:"linear-gradient(135deg,#0D1B2A,#0A1628)",border:"2px solid #C9A84C44",borderRadius:16,padding:20}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
                  <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#C9A84C,#E8B84B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🎛️</div>
                  <div>
                    <div style={{color:"#C9A84C",fontWeight:900,fontSize:15}}>Sauvegarde & Restauration sélective</div>
                    <div style={{color:"#7A90B0",fontSize:11}}>Choisissez précisément les modules à sauvegarder ou restaurer</div>
                  </div>
                  {lastGranularBackup && (
                    <div style={{marginLeft:"auto",textAlign:"right"}}>
                      <div style={{color:"#22C55E",fontSize:10,fontWeight:700}}>✅ Dernière sauvegarde locale</div>
                      <div style={{color:"#7A90B0",fontSize:9}}>{new Date(lastGranularBackup.exportedAt).toLocaleString("fr-FR")} · {lastGranularBackup.exportedBy}</div>
                      <div style={{color:"#C9A84C",fontSize:9}}>{(lastGranularBackup.modules||[]).length} module(s)</div>
                    </div>
                  )}
                </div>

                {/* ── Auto-backup ── */}
                <div style={{background:"#0A1628",border:"1px solid #1E3A5F",borderRadius:11,padding:14,marginBottom:16}}>
                  <div style={{color:"#C4D4E8",fontWeight:700,fontSize:12,marginBottom:10}}>⏱️ Sauvegarde automatique</div>
                  <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                    <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                      <div onClick={()=>{setAutoBackupEnabled(!autoBackupEnabled);}}
                        style={{width:40,height:22,borderRadius:11,background:autoBackupEnabled?"#22C55E":"#374151",transition:"background 0.2s",position:"relative",cursor:"pointer",flexShrink:0}}>
                        <div style={{position:"absolute",top:3,left:autoBackupEnabled?20:3,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                      </div>
                      <span style={{color:autoBackupEnabled?"#22C55E":"#6B7280",fontWeight:700,fontSize:11}}>{autoBackupEnabled?"Activée":"Désactivée"}</span>
                    </label>
                    {autoBackupEnabled && (
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{color:"#7A90B0",fontSize:11}}>Intervalle :</span>
                        {[1,5,15,30,60].map(v=>(
                          <button key={v} onClick={()=>{setAutoBackupInterval(v);}}
                            style={{background:autoBackupInterval===v?"#C9A84C22":"#0D1B2A",border:`1px solid ${autoBackupInterval===v?"#C9A84C":"#1E3A5F"}`,color:autoBackupInterval===v?"#C9A84C":"#7A90B0",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:autoBackupInterval===v?800:400,fontSize:10}}>
                            {v===60?"1h":`${v}min`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Sélection des modules ── */}
                <div style={{marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{color:"#C4D4E8",fontWeight:700,fontSize:12}}>📦 Modules à inclure ({selectedCount}/{BACKUP_MODULES.length})</div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setBackupModules(Object.fromEntries(BACKUP_MODULES.map(m=>[m.id,true])))}
                        style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>Tout</button>
                      <button onClick={()=>setBackupModules(Object.fromEntries(BACKUP_MODULES.map(m=>[m.id,false])))}
                        style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>Aucun</button>
                      <button onClick={()=>setBackupModules({users:true,dossiers:true,taches:true,rdvs:true,partners:true,approvals:true,finance:true,sirh:true,docs:false,audit:false,logistique:false,comm:false,messages:false,sessionLogs:false})}
                        style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>Par défaut</button>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
                    {BACKUP_MODULES.map(m=>{
                      const active = backupModules[m.id];
                      return (
                        <label key={m.id} style={{display:"flex",alignItems:"center",gap:10,background:active?"#C9A84C15":"#0D1B2A",border:`1px solid ${active?"#C9A84C44":"#1E3A5F"}`,borderRadius:9,padding:"10px 12px",cursor:"pointer",transition:"all 0.15s"}}>
                          <input type="checkbox" checked={!!active} onChange={e=>setBackupModules(p=>({...p,[m.id]:e.target.checked}))}
                            style={{width:15,height:15,accentColor:"#C9A84C",cursor:"pointer",flexShrink:0}}/>
                          <div>
                            <div style={{color:active?"#C9A84C":"#7A90B0",fontWeight:active?700:400,fontSize:11}}>{m.label}</div>
                            {m.keys?.length>0 && <div style={{color:"#4A6080",fontSize:8}}>{m.keys.length} clé(s) localStorage</div>}
                            {m.stateKey && <div style={{color:"#4A6080",fontSize:8}}>État React synchronisé</div>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* ── Actions ── */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  {/* SAUVEGARDER */}
                  <div style={{background:"#0A1628",border:"1px solid #1E3A5F",borderRadius:12,padding:14}}>
                    <div style={{color:"#C4D4E8",fontWeight:700,fontSize:12,marginBottom:10}}>💾 Sauvegarder</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <button onClick={handleGranularExport} disabled={selectedCount===0}
                        style={{background:selectedCount?`linear-gradient(135deg,#C9A84C,#E8B84B)`:"#1E3A5F",border:"none",color:selectedCount?"#000":"#4A6080",borderRadius:9,padding:"11px",cursor:selectedCount?"pointer":"not-allowed",fontWeight:800,fontSize:11}}>
                        ⬇️ Exporter fichier JSON ({selectedCount} module{selectedCount>1?"s":""})
                      </button>
                      <button onClick={handleGranularLocalSave} disabled={selectedCount===0}
                        style={{background:selectedCount?"#3B82F622":"#0D1B2A",border:`1px solid ${selectedCount?"#3B82F644":"#1E3A5F"}`,color:selectedCount?"#3B82F6":"#4A6080",borderRadius:9,padding:"10px",cursor:selectedCount?"pointer":"not-allowed",fontWeight:700,fontSize:11}}>
                        📌 Snapshot local (mémoire)
                      </button>
                    </div>
                  </div>

                  {/* RESTAURER */}
                  <div style={{background:"#0A1628",border:"1px solid #1E3A5F",borderRadius:12,padding:14}}>
                    <div style={{color:"#C4D4E8",fontWeight:700,fontSize:12,marginBottom:10}}>♻️ Restaurer</div>
                    <input ref={backupFileRef} type="file" accept=".json" onChange={handleGranularImport} style={{display:"none"}}/>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <button onClick={()=>backupFileRef.current?.click()}
                        style={{background:"linear-gradient(135deg,#3B82F6,#2563EB)",border:"none",color:"#fff",borderRadius:9,padding:"11px",cursor:"pointer",fontWeight:800,fontSize:11}}>
                        📂 Importer fichier JSON
                      </button>
                      <button onClick={handleGranularLocalRestore} disabled={!lastGranularBackup}
                        style={{background:lastGranularBackup?"#22C55E22":"#0D1B2A",border:`1px solid ${lastGranularBackup?"#22C55E44":"#1E3A5F"}`,color:lastGranularBackup?"#22C55E":"#4A6080",borderRadius:9,padding:"10px",cursor:lastGranularBackup?"pointer":"not-allowed",fontWeight:700,fontSize:11}}>
                        🔄 Restaurer snapshot local
                      </button>
                    </div>
                  </div>
                </div>

                {/* Message import */}
                {(backupImporting || backupImportMsg) && (
                  <div style={{background:backupImportMsg.startsWith("✅")?"#22C55E15":backupImportMsg.startsWith("❌")?"#EF444415":"#3B82F615",border:`1px solid ${backupImportMsg.startsWith("✅")?"#22C55E44":backupImportMsg.startsWith("❌")?"#EF444444":"#3B82F644"}`,borderRadius:10,padding:12,fontSize:11,color:backupImportMsg.startsWith("✅")?"#22C55E":backupImportMsg.startsWith("❌")?"#EF4444":"#3B82F6",whiteSpace:"pre-wrap"}}>
                    {backupImporting && <span style={{marginRight:6}}>⏳</span>}{backupImportMsg}
                    {!backupImporting && backupImportMsg && <button onClick={()=>setBackupImportMsg("")} style={{float:"right",background:"none",border:"none",cursor:"pointer",color:"inherit",fontSize:12}}>✕</button>}
                  </div>
                )}

              </div>
            </div>
          );
        })()}
      </div>
    );
  }


/* ================================================================
   COMPOSANTS EXTRAITS  -  Définis hors SIApp pour stabilité des refs
   -> Utilisent useSI() pour accéder aux états partagés
   -> Zéro remount intempestif lors des re-renders de SIApp
   ════════════════════════════════════════════════════════════════ */


/* --- SmartBanner : bannière unifiée Welcome + Système ---------------------
   - Combine WelcomeBanner (salutation personnalisée + résumé journée)
     et SysMsgBanner (message institutionnel DG/Admin)
   - Si les deux sont présents -> rotation douce isolée (setInterval confiné ici)
   - Si un seul -> affiché directement sans rotation
   - Si aucun -> invisible (rien n'est rendu)
   - Bouton X ferme la bannière pour la journée (persisté par utilisateur)
   ──────────────────────────────────────────────────────────────────────── */
  