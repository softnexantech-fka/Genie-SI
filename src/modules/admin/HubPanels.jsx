import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// HubPanels.jsx — SI Génie Consultant v141
import { _lsGet, _lsSet, _noop, playSound, getUserProcess, formatDateTime, LS_KEY, dsSave } from '../../core/index.js';
import { gcToast } from '../../components/ToastManager.jsx';
import { PROCESS_ACTIVITIES, PROCESS_APP_MATRIX_DEFAULT, PROCESS_APP_TYPES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';

// FIX v135 — Constants extracted outside component to avoid fast-refresh violation
const HubProgrammesDefaults = { matrix: {}, config: {} };

export function HubProgrammesPanel({ T, localUser, setActiveModule=_noop }){
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  // FIX v81 — hubMatrix was read once as IIFE → checkbox changes wrote to LS but never triggered re-render.
  // Solution: use useState + callback so HubCfgPanel can signal a refresh.
  const [hubMatrix, setHubMatrix] = React.useState(() => {
    try { return JSON.parse(_lsGet("gc-process-app-matrix")||"null") || PROCESS_APP_MATRIX_DEFAULT; }
    catch (_) { return PROCESS_APP_MATRIX_DEFAULT; }
  });
  const refreshMatrix = React.useCallback(() => {
    try { setHubMatrix(JSON.parse(_lsGet("gc-process-app-matrix")||"null") || PROCESS_APP_MATRIX_DEFAULT); }
    catch (_) { setHubMatrix(PROCESS_APP_MATRIX_DEFAULT); }
  }, []);
  const HUB_APP_REGISTRY = {
    bureau:{icon:"💼",label:"Bureau",module:"bureau"},
    sirh:{icon:"👥",label:"SIRH",module:"sirh"},
    finance:{icon:"💰",label:"Finance",module:"finance"},
    juridique:{icon:"⚖️",label:"Juridique",module:"juridique"},
    audit:{icon:"🔍",label:"Audit",module:"audit"},
    conformite:{icon:"🛡️",label:"Conformité",module:"conformite"},
    logistique:{icon:"🚚",label:"Logistique",module:"logistique"},
    communication:{icon:"📢",label:"Communication",module:"communication"},
    indicateurs:{icon:"📊",label:"Indicateurs",module:"indicateurs"},
    conseil:{icon:"🎯",label:"Conseil",module:"conseil"},
    agenda_app:{icon:"📅",label:"Agenda",module:"agenda"},
    docs_app:{icon:"📁",label:"Gest. Docs",module:"docs_app"},
    conventions:{icon:"📜",label:"Conventions de Mission",module:"bureau",subApp:"conventions"},
    admin:{icon:"⚙️",label:"Paramètres SI",module:"admin"},
  };
  const hubUserProcs = getUserProcess(localUser);
  return (
    <div className="gc-fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{color:T.textMuted,fontSize:11}}>Accès contextuel aux programmes du SI par processus. Cliquez pour naviguer.</div>
      </div>
      {(localUser?.isAdmin || localUser?.isMG)&&(
        <HubCfgPanel T={T} HUB_APP_REGISTRY={HUB_APP_REGISTRY} onMatrixChange={refreshMatrix} />
      )}
      {Object.entries(PROCESS_ACTIVITIES).map(([code, pd]) => {
        const rawApps = (hubMatrix[code]||[]);
        const allApps = [...new Set([...(hubMatrix.ALL||[]), ...rawApps.filter(v=>!v.startsWith("!"))])];
        const disabledApps = rawApps.filter(v=>v.startsWith("!")).map(v=>v.slice(1));
        const apps = allApps.filter(v => !disabledApps.includes(v) && !v.startsWith("!") && !rawApps.includes("!"+v));
        // FIX v150 — Hub filtrage strict :
        // • Niveau 6 (admin) → voit tous les processus
        // • Niveau 5 de P01 (DG/MG) → voit tous les processus
        // • Tous les autres (niv1-4, niv5 non-P01) → uniquement leurs processus propres
        const userP01 = hubUserProcs.includes("P01");
        const isAdminOrDG = localUser?.isAdmin || (localUser?.level >= 5 && userP01) || (localUser?.isMG && userP01);
        const isMyProc = isAdminOrDG ? true : hubUserProcs.includes(code);
        if (!isMyProc) return null;
        return (
          <div key={code} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:18}}>{pd.icon}</span>
              <div>
                <div style={{color:T.text,fontWeight:700,fontSize:12}}>{code} — {pd.label}</div>
                <div style={{color:T.textMuted,fontSize:10}}>{pd.description||"Processus actif"} · {apps.length} programme(s)</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {apps.map(appId => {
                const app = HUB_APP_REGISTRY[appId];
                if (!app) return null;
                // Convention de Mission : uniquement niv.3+
                if (appId === "conventions" && localUser.level < 3) return null;
                return (
                  <button key={appId}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveModule(app.module);
                      // Si subApp (ex: conventions), dispatcher un event pour ouvrir la sous-app
                      if (app.subApp) {
                        setTimeout(() => window.dispatchEvent(new CustomEvent("gc:open-subapp", { detail: { subApp: app.subApp } })), 150);
                      }
                      playSound("notif");
                    }}
                    style={{background:`linear-gradient(135deg,${T.surface3},${T.surface2})`,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 12px",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5,color:T.text,fontSize:11,fontWeight:700,boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
                    <span style={{fontSize:14}}>{app.icon}</span>
                    <span>{app.label}</span>
                    <span style={{color:T.textDim,fontSize:9,marginLeft:2}}>→</span>
                  </button>
                );
              })}
              {apps.length === 0 && <span style={{color:T.textDim,fontSize:10,fontStyle:"italic"}}>Aucun programme — configurer dans Paramètres Admin → Matrice</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── HubCfgPanel : config accès programmes par processus (DG/Admin) ──────────

export function HubCfgPanel({ T, HUB_APP_REGISTRY, onMatrixChange }) {
  const [showHubCfg, setShowHubCfg] = React.useState(false);
  const [cfgProc, setCfgProc] = React.useState(Object.keys(PROCESS_ACTIVITIES)[0]||"O01");
  const ALL_APP_IDS = Object.keys(HUB_APP_REGISTRY||{});
  const readMatrix = () => { try { return JSON.parse(_lsGet("gc-process-app-matrix")||"null")||PROCESS_APP_MATRIX_DEFAULT; } catch(_) { return PROCESS_APP_MATRIX_DEFAULT; } };
  // FIX v81 — writeMatrix now calls onMatrixChange so parent HubProgrammesPanel re-renders immediately
  // FIX v141 — dsSave pour synchronisation réseau (était _lsSet uniquement → localStorage seulement)
  const writeMatrix = m => {
    try {
      _lsSet("gc-process-app-matrix", JSON.stringify(m));
      dsSave("gc-process-app-matrix", m).catch(err => gcToast.syncError("gc-process-app-matrix", err));
      if(onMatrixChange) onMatrixChange();
    } catch(_) {}
  };
  const T2 = T || {};
  return (
    <div style={{marginBottom:12}}>
      <button onClick={()=>setShowHubCfg(v=>!v)} style={{background:showHubCfg?"#C9A84C22":T2.surface2,border:`1px solid ${showHubCfg?"#C9A84C44":T2.border}`,color:showHubCfg?"#C9A84C":T2.textMuted,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>
        {showHubCfg?"▲ Fermer":"⚙️ Configurer accès applications (DG / Admin)"}
      </button>
      {showHubCfg&&(
        <div style={{background:T2.surface2,border:"1px solid #C9A84C44",borderRadius:12,padding:14,marginTop:8}}>
          <div style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:10}}>⚙️ Accès par défaut par processus</div>
          <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
            {Object.keys(PROCESS_ACTIVITIES).map(code=>(
              <button key={code} onClick={()=>setCfgProc(code)} style={{background:cfgProc===code?"#C9A84C22":T2.surface3,border:`1px solid ${cfgProc===code?"#C9A84C":T2.border}`,borderRadius:6,padding:"3px 10px",cursor:"pointer",color:cfgProc===code?"#C9A84C":T2.textMuted,fontSize:10,fontWeight:cfgProc===code?700:400}}>{code}</button>
            ))}
          </div>
          <div style={{fontWeight:700,fontSize:11,color:T2.text,marginBottom:8}}>{cfgProc} — {PROCESS_ACTIVITIES[cfgProc]?.label}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
            {ALL_APP_IDS.map(appId=>{
              const app=(HUB_APP_REGISTRY||{})[appId]; if(!app) return null;
              const m=readMatrix();
              const raw=m[cfgProc]||[];
              const globalApps=m.ALL||[];
              const allApps=[...new Set([...globalApps,...raw.filter(v=>!v.startsWith("!"))])];
              const disabled=raw.filter(v=>v.startsWith("!")).map(v=>v.slice(1));
              const isEnabled=allApps.includes(appId)&&!disabled.includes(appId);
              return(
                <label key={appId} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",background:isEnabled?"#22C55E11":T2.surface3,border:`1px solid ${isEnabled?"#22C55E33":T2.border}`,borderRadius:7,padding:"6px 8px"}}>
                  <input type="checkbox" checked={isEnabled} onChange={e=>{
                    const mm=readMatrix(); const r=[...(mm[cfgProc]||[])];
                    const glob=mm.ALL||[]; const isGlob=glob.includes(appId); let nr;
                    if(e.target.checked){nr=r.filter(v=>v!=="!"+appId);if(!isGlob&&!r.includes(appId))nr.push(appId);}
                    else{nr=r.filter(v=>v!==appId);if(!nr.includes("!"+appId))nr.push("!"+appId);}
                    writeMatrix({...mm,[cfgProc]:nr});
                  }} style={{accentColor:"#22C55E",width:13,height:13}}/>
                  <span style={{fontSize:13}}>{app.icon}</span>
                  <span style={{color:T2.text,fontSize:10,fontWeight:600}}>{app.label}</span>
                </label>
              );
            })}
          </div>
          <div style={{color:T2.textDim,fontSize:9,marginTop:8}}>💾 Enregistré automatiquement · Prise d'effet immédiate</div>
        </div>
      )}
    </div>
  );
}


export function ProcessAppMatrixAdmin({ T, currentUser }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [matrix, setMatrix] = useState(() => { try { return JSON.parse(_lsGet("gc-process-app-matrix")||"null") || PROCESS_APP_MATRIX_DEFAULT; } catch (_) { return PROCESS_APP_MATRIX_DEFAULT; } });
  const [matrixLog, setMatrixLog] = useState(() => { try { return JSON.parse(_lsGet("gc-matrix-log")||"[]"); } catch (_) { return []; } });
  const [view, setView] = useState("matrix");

  const APP_COLS = [
    {id:"bureau",l:"Bureau",icon:"💼"},
    {id:"sirh",l:"SIRH",icon:"👥"},
    {id:"finance",l:"Finance",icon:"💰"},
    {id:"juridique",l:"Juridique",icon:"⚖️"},
    {id:"audit",l:"Audit",icon:"🔍"},
    {id:"conformite",l:"Conformité",icon:"🛡️"},
    {id:"logistique",l:"Logistique",icon:"🚚"},
    {id:"communication",l:"Comm.",icon:"📢"},
    {id:"indicateurs",l:"Indicateurs",icon:"📊"},
    {id:"conseil",l:"Conseil",icon:"🎯"},
  ];

  const PROC_ROWS = Object.entries(PROCESS_ACTIVITIES).map(([code,d])=>({code,label:d.label,icon:d.icon,type:PROCESS_APP_TYPES[code]||"Autre"}));

  const toggleCell = (procCode, appId) => {
    setMatrix(prevMatrix => {
      const prevList = prevMatrix[procCode]||[];
      const newList = prevList.includes(appId) ? prevList.filter(a=>a!==appId) : [...prevList, appId];
      const updated = {...prevMatrix, [procCode]: newList};
      try { _lsSet("gc-process-app-matrix", JSON.stringify(updated)); dsSave("gc-process-app-matrix", updated).catch(err => gcToast.syncError("gc-process-app-matrix", err)); } catch (_) {}
      const logEntry = { id:`ML-${Date.now()}`, by:currentUser.name, byId:currentUser.id, at:new Date().toISOString(), action:`${prevList.includes(appId)?"Désactivé":"Activé"} ${appId} pour ${procCode}`, before:JSON.stringify(prevList), after:JSON.stringify(newList) };
      setMatrixLog(prev2 => {
        const n=[logEntry,...prev2].slice(0,100);
        try { _lsSet("gc-matrix-log",JSON.stringify(n)); dsSave("gc-matrix-log",n).catch(err => gcToast.syncError("gc-matrix-log", err)); } catch (_) {}
        return n;
      });
      playSound("success");
      return updated;
    });
  };

  const resetToDefault = async () => {
    if(!await gcConfirm("Réinitialiser la matrice aux valeurs par défaut ?")) return;
    setMatrix(PROCESS_APP_MATRIX_DEFAULT);
    try { _lsSet("gc-process-app-matrix", JSON.stringify(PROCESS_APP_MATRIX_DEFAULT)); dsSave("gc-process-app-matrix", PROCESS_APP_MATRIX_DEFAULT).catch(err => gcToast.syncError("gc-process-app-matrix", err)); } catch (_) {}
  };

  return (
    <div className="gc-fade-in">
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{width:36,height:36,borderRadius:8,background:"linear-gradient(135deg,#C9A84C,#E8B84B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🗂️</div>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:14}}>Matrice Programmes ↔ Processus</div>
          <div style={{color:T.textMuted,fontSize:10}}>Configuration des associations — Habilitation 6 uniquement</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          {[["matrix","📊 Matrice"],["log","📋 Journal"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{background:view===v?"#C9A84C":T.surface2,color:view===v?"#000":T.textMuted,border:`1px solid ${view===v?"#C9A84C":T.border}`,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:view===v?700:400,fontSize:11}}>{l}</button>
          ))}
          <button onClick={resetToDefault} style={{background:"#EF444422",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"6px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>↺ Défaut</button>
        </div>
      </div>

      {view==="matrix" && (
        <div style={{overflowX:"auto"}}>
          <div style={{color:T.textMuted,fontSize:10,marginBottom:8,display:"flex",gap:16,flexWrap:"wrap"}}>
            <span style={{display:"flex",alignItems:"center",gap:4}}>✅ <span>Activé (processus spécifique)</span></span>
            <span style={{display:"flex",alignItems:"center",gap:4}}>🌐 <span>Activé globalement (ALL) — cliquer pour désactiver localement</span></span>
            <span style={{display:"flex",alignItems:"center",gap:4}}>🚫 <span style={{color:"#EF4444"}}>Désactivé localement (override)</span></span>
            <span style={{display:"flex",alignItems:"center",gap:4,color:"#60A5FA"}}>＋ <span>Non assigné — Cliquer pour activer</span></span>
          </div>
          <table style={{borderCollapse:"collapse",minWidth:700}}>
            <thead>
              <tr>
                <th style={{padding:"6px 10px",textAlign:"left",color:T.textMuted,fontSize:10,fontWeight:700,background:T.surface2,borderBottom:`1px solid ${T.border}`,position:"sticky",left:0,zIndex:1}}>Processus</th>
                {APP_COLS.map(a=>(
                  <th key={a.id} style={{padding:"6px 8px",textAlign:"center",color:T.textMuted,fontSize:9,fontWeight:700,background:T.surface2,borderBottom:`1px solid ${T.border}`,minWidth:52}}>
                    <div style={{fontSize:14}}>{a.icon}</div>
                    <div style={{fontSize:8,lineHeight:1.2}}>{a.l}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROC_ROWS.map(row=>(
                <tr key={row.code} className="gc-tr-hover" style={{borderBottom:`1px solid ${T.border}20`}}>
                  <td style={{padding:"6px 10px",background:T.surface,position:"sticky",left:0,borderRight:`1px solid ${T.border}20`}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:14}}>{row.icon}</span>
                      <div>
                        <div style={{color:T.text,fontSize:10,fontWeight:700}}>{row.code}</div>
                        <div style={{color:T.textDim,fontSize:8,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.label}</div>
                      </div>
                      <span style={{marginLeft:4,background:T.surface3,borderRadius:4,padding:"1px 5px",fontSize:8,color:T.textDim}}>{row.type}</span>
                    </div>
                  </td>
                  {APP_COLS.map(app=>{
                    const rowList = matrix[row.code] || [];
                    const isLocalDisabled = rowList.includes("!"+app.id);
                    const enabledSpecific = !isLocalDisabled && rowList.includes(app.id);
                    const enabledGlobal   = !isLocalDisabled && !enabledSpecific && (matrix.ALL||[]).includes(app.id);
                    // état courant : "disabled"→"specific"→"global"→"override_off"→"disabled"
                    // Cycle au clic :
                    //  ＋ (non assigné)          → ✅ (activer spécifiquement)
                    //  ✅ (actif spécifique)      → 🌐 (retirer local, laisser global si dispo, sinon ＋)
                    //  🌐 (actif global)          → 🚫 (désactiver localement)
                    //  🚫 (désactivé localement)  → ＋  (retirer le flag négatif)
                    const handleToggle = (e) => {
                      e.stopPropagation();
                      setMatrix(prev => {
                        const prevList = [...(prev[row.code] || [])];
                        let newList;
                        let actionLabel;
                        if (isLocalDisabled) {
                          // 🚫 → ＋ : retirer le flag négatif
                          newList = prevList.filter(x => x !== "!"+app.id);
                          actionLabel = "Réactivé (override retiré)";
                        } else if (enabledSpecific) {
                          // ✅ → retirer l'entrée locale (si global dispo → 🌐, sinon ＋)
                          newList = prevList.filter(x => x !== app.id);
                          actionLabel = "Retiré de la liste spécifique";
                        } else if (enabledGlobal) {
                          // 🌐 → 🚫 : ajouter override local négatif
                          newList = [...prevList, "!"+app.id];
                          actionLabel = "Désactivé localement (override)";
                        } else {
                          // ＋ → ✅ : activer spécifiquement pour ce processus
                          newList = [...prevList, app.id];
                          actionLabel = "Activé (processus spécifique)";
                        }
                        const updated = {...prev, [row.code]: newList};
                        try { _lsSet("gc-process-app-matrix", JSON.stringify(updated)); dsSave("gc-process-app-matrix", updated).catch(err => gcToast.syncError("gc-process-app-matrix", err)); } catch (_) {}
                        const logEntry = { id:`ML-${Date.now()}`, by:currentUser.name, byId:currentUser.id, at:new Date().toISOString(), action:`${actionLabel} : ${app.l} — Processus ${row.code}`, before:JSON.stringify(prevList), after:JSON.stringify(newList) };
                        setMatrixLog(prev2 => {
                          const n=[logEntry,...prev2].slice(0,100);
                          try { _lsSet("gc-matrix-log",JSON.stringify(n)); dsSave("gc-matrix-log",n).catch(err => gcToast.syncError("gc-matrix-log", err)); } catch (_) {}
                          return n;
                        });
                        playSound("success");
                        return updated;
                      });
                    };
                    const btnBg    = isLocalDisabled?"#EF444422":enabledSpecific?"#22C55E22":enabledGlobal?"#3B82F615":"#0a1e4a";
                    const btnBdr   = isLocalDisabled?"#EF444444":enabledSpecific?"#22C55E44":enabledGlobal?"#3B82F633":"#3B82F644";
                    const btnColor = isLocalDisabled?"#EF4444":enabledSpecific?"#22C55E":enabledGlobal?"#3B82F6":"#60A5FA";
                    const btnIcon  = isLocalDisabled?"🚫":enabledSpecific?"✅":enabledGlobal?"🌐":"＋";
                    const btnTitle = isLocalDisabled?`Clic → Réactiver ${app.l} pour ${row.code}`:enabledSpecific?`Clic → Retirer ${app.l} de ${row.code} (restera global si ALL actif)`:enabledGlobal?`Clic → Désactiver ${app.l} localement pour ${row.code} (override)`:(`Clic → Activer ${app.l} pour ${row.code}`);
                    return (
                      <td key={app.id} style={{padding:"4px",textAlign:"center"}}>
                        <button type="button" onClick={handleToggle}
                          style={{width:28,height:24,background:btnBg,border:`1px solid ${btnBdr}`,borderRadius:5,cursor:"pointer",fontSize:12,transition:"all 0.15s",color:btnColor}}
                          title={btnTitle}>
                          {btnIcon}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view==="log" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{color:T.text,fontWeight:700,fontSize:12}}>📋 Journal de configuration ({matrixLog.length} entrées)</div>
            <button onClick={() => {const csv=["Date,Auteur,Action,Avant,Après",...matrixLog.map(l=>`"${formatDateTime(l.at)}","${l.by}","${l.action}","${l.before}","${l.after}"`)].join("\n");const b=new Blob([csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="matrix-log.csv";a.click();URL.revokeObjectURL(u);}} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:10}}>⬇ CSV</button>
          </div>
          {matrixLog.slice(0,20).map(l=>(
            <div key={l.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",marginBottom:6,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontSize:11,fontWeight:600}}>{l.action}</div>
                <div style={{color:T.textMuted,fontSize:10}}>Par {l.by} · {formatDateTime(l.at)}</div>
              </div>
            </div>
          ))}
          {matrixLog.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:20,fontSize:11}}>Aucune modification enregistrée.</div>}
        </div>
      )}
    </div>
  );
};

// FIX v63 C7  -  IndexedDB pour les grandes données (pièces jointes, documents)
// Remplace le stockage localStorage pour gc-dossier-files et gc-standalone-docs
// Évite les QuotaExceededError sur Safari/Firefox (limite LS ~5 MB)
// FIX v135 — IDB utility export (non-component) - disabling react-refresh rule
 
export const gcIDB = (() => {
  const DB_NAME = "gc_si_idb";
  const DB_VERSION = 1;
  const STORE_FILES  = "dossierFiles";
  const STORE_DOCS   = "standaloneDocs";
  let _db = null;

  const open = () => new Promise((res, rej) => {
    if (_db) return res(_db);
    if (!window.indexedDB) return rej(new Error("IndexedDB non supporté"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_DOCS))  db.createObjectStore(STORE_DOCS, { keyPath: "id" });
    };
    req.onsuccess  = (e) => { _db = e.target.result; res(_db); };
    req.onerror    = (e) => rej(e.target.error);
  });

  const getAll = async (store) => {
    try {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror   = () => rej(req.error);
      });
    } catch (_) { return []; }
  };

  const putAll = async (store, items) => {
    try {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, "readwrite");
        const os = tx.objectStore(store);
        // Clear then re-insert all (simple full-replace semantics)
        const clearReq = os.clear();
        clearReq.onsuccess = () => {
          items.forEach(item => os.put(item));
          tx.oncomplete = () => res();
          tx.onerror    = () => rej(tx.error);
        };
        clearReq.onerror = () => rej(clearReq.error);
      });
    } catch (_) {}
  };

  const clear = async (store) => {
    try {
      const db = await open();
      return new Promise((res) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).clear();
        tx.oncomplete = () => res();
        tx.onerror    = () => res(); // silently ignore
      });
    } catch (_) {}
  };

  // Migration: importer depuis localStorage si IDB est vide
  const migrateFromLS = async (store, lsKey) => {
    try {
      const existing = await getAll(store);
      if (existing.length > 0) return; // déjà migré
      const raw = _lsGet(lsKey);
      if (!raw) return;
      let data; try { data = JSON.parse(raw); } catch(_) { return; } // FIX v127
      if (Array.isArray(data) && data.length > 0) {
        await putAll(store, data);
        console.info(`[SI Génie] IDB: migration ${data.length} élément(s) de ${lsKey} → ${store}`);
        // Ne pas supprimer le LS pour la rétrocompatibilité, juste loguer
      }
    } catch (_) {}
  };

  const init = async () => {
    try {
      await open();
      await Promise.all([
        migrateFromLS(STORE_FILES, `${LS_KEY}:gc-dossier-files`),
        migrateFromLS(STORE_DOCS,  `${LS_KEY}:gc-standalone-docs`),
      ]);
    } catch (_) {}
  };

  return { open, getAll, putAll, clear, init, STORE_FILES, STORE_DOCS };
})();

// Initialisation IDB au chargement (async, non bloquant)
gcIDB.init().catch(() => {});


