import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// FinanceApp.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _lsRm, lsLoad, lsSave, _noop, gcPushNotif, playSound, gcCalcIRPP, gcLoadFiscalConfig, gcGetDelaiConfig, gcAntiRedondance, gcFileSave, _activeUser, lsLoadSecure, gcHashPassword, gcVerifyPassword, gcGenerateSessionToken, gcValidateSessionToken, SIErrorBoundary, gcGetClientIp, _gcCachedIp, gcAIAsk, dsSave, gcSyncAuthUsers, dsDeleteItemFromArray, dsGet } from '../../core/index.js';
import { useRemoteSync } from '../../hooks/useSyncedState.js';
import { THEMES, INITIAL_DOSSIERS, INITIAL_TACHES, INITIAL_RDVS, INITIAL_PENDING, INITIAL_PARTNERS, INITIAL_USERS, INITIAL_SI_SYSTEM_DOCS, USER_FUNCTIONS, PLAN_COMPTABLE_OHADA, DEMO_USERS, DEMO_DOSSIERS, DEMO_RDVS, DEMO_TACHES, INITIAL_ACCOUNT_ACTIONS, INITIAL_SESSION_LOGS, ACCOUNT_STATUS_CONFIG, DEMO_PENDING, GC_FISCAL_CONFIG_DEFAULT, gcViewDoc, gcDownloadDoc } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';
import { CoverPage, CreateAccountPage, LoginPage } from '../../components/Auth.jsx';
import { SignaturePINModal } from '../docs/DossiersList.jsx';
// FIX v127 — Lazy import pour briser le cycle circulaire SIApp ↔ FinanceApp.
// SIApp importe FinanceApp statiquement pour le SI principal.
// FinanceApp en avait besoin seulement pour son mode standalone (export default App).
// React.lazy() charge SIApp dans un chunk séparé → pas de cycle Rollup.
const SIApp = React.lazy(() => import('../../SIApp.jsx').then(m => ({ default: m.SIApp })));
import { GlobalStyles } from '../../styles/GlobalStyles.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function OHADARefApp({ T, currentUser, journalEntries=[], setJournalEntries=_noop, setJournalForm=_noop, setFinTool=_noop, setNotifications=_noop}){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'finance',
          nom: file.name, taille: file.size, type: file.type,
          uploadedBy: currentUser?.id, uploadedByName: currentUser?.name,
          ...extraMeta});
        results.push({
          ...ref, name: file.name, size: file.size, mimeType: file.type,
          sizeStr: file.size < 1048576 ? `${Math.round(file.size/1024)} Ko` : `${(file.size/1048576).toFixed(1)} Mo`,
          ext: '.' + file.name.split('.').pop().toLowerCase(),
          uploadedAt: new Date().toISOString(), downloads: 0});
      } catch(e) { console.error('[upload finance]', file.name, e.message); }
    }
    return results;
  };

  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [tab, setTabRaw] = useState(() => {
    try { return sessionStorage.getItem('gc-finance-tab') || "plan"; } catch (_) { return "plan"; }
  });
  const setTab = (t) => { setTabRaw(t); try { sessionStorage.setItem('gc-finance-tab', t); } catch (_) {} };
  const [search, setSearch] = useState("");
  const [filterCl, setFilterCl] = useState("all");
  const [customComptes, setCustomComptes] = useState(()=>{try{return JSON.parse(_lsGet("gc-ohada-custom")||"[]");}catch (_) {return [];}});
  const [showAdd, setShowAdd] = useState(false);
  const [newCompte, setNewCompte] = useState({num:"",lib:"",cl:"6",type:"CH"});
  const [uploadedDocs, setUploadedDocs] = useState(()=>{try{return JSON.parse(_lsGet("gc-ohada-docs")||"[]");}catch (_) {return [];}});
  const [docType, setDocType] = useState("AUDSC");
  const [numSeries, setNumSeries] = useState(()=>{try{return JSON.parse(_lsGet("gc-piece-series")||"null")||{AC:{prefix:"AC",seq:1},VT:{prefix:"VT",seq:1},BQ:{prefix:"BQ",seq:1},PE:{prefix:"PE",seq:1},OD:{prefix:"OD",seq:1}};}catch (_) {return {AC:{prefix:"AC",seq:1},VT:{prefix:"VT",seq:1},BQ:{prefix:"BQ",seq:1},PE:{prefix:"PE",seq:1},OD:{prefix:"OD",seq:1}};}});
  const fileRef = useRef(null);

  // Sync temps-réel : rafraîchit les données quand un autre utilisateur les modifie
  useRemoteSync({
    'gc-ohada-docs':   setUploadedDocs,
    'gc-ohada-custom': setCustomComptes,
    'gc-piece-series': setNumSeries,
  });

  const allComptes = [...PLAN_COMPTABLE_OHADA, ...customComptes];
  const filtered = allComptes.filter(c=>(filterCl==="all"||String(c.cl)===filterCl)&&(!search||(c.num+c.lib).toLowerCase().includes(search.toLowerCase())));
  const saveCustom = c => { setCustomComptes(c); try{_lsSet("gc-ohada-custom",JSON.stringify(c)); dsSave("gc-ohada-custom", c).catch(()=>{});}catch (_) {}; };
  const saveDocs = d => { setUploadedDocs(d); try{const sanitized = d.map(x=>({...x, data: undefined, url: x.url?.slice(0,100)})); _lsSet("gc-ohada-docs",JSON.stringify(sanitized)); dsSave("gc-ohada-docs", sanitized).catch(()=>{});}catch (_) {}; };
  const saveSeries = s => { setNumSeries(s); try{_lsSet("gc-piece-series",JSON.stringify(s)); dsSave("gc-piece-series", s).catch(()=>{});}catch (_) {}; };

  const addCustom = () => {
    if(!newCompte.num||!newCompte.lib){gcAlert("N° et libellé requis.");return;}
    if(allComptes.find(c=>c.num===newCompte.num)){gcAlert("Ce numéro existe déjà.");return;}
    const c={...newCompte,cl:parseInt(newCompte.cl,10),custom:true};
    saveCustom([...customComptes,c]); setShowAdd(false); setNewCompte({num:"",lib:"",cl:"6",type:"CH"});
  };

  const handleDocUpload = async e => {
    const fs=Array.from(e.target.files||[]);
    const r=f=>gcFileSave(f, { module: 'finance', nom: f.name, taille: f.size }).then(ref=>ref.dataUrl || ref.path).catch(err=>{console.error('[Finance] upload:', err); return null;});
    Promise.all(fs.map(async f=>({id:"OD-"+Date.now()+Math.random().toString(36).slice(2,4),name:f.name,type:docType,size:(f.size/1024).toFixed(0)+"Ko",uploadedAt:new Date().toISOString(),uploadedBy:currentUser?.name||"—",url:await r(f)}))).then(docs=>{
      const nd=[...docs,...uploadedDocs]; saveDocs(nd);
      setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📄",message:`${docs.length} doc(s) OHADA importé(s)`,at:new Date().toISOString(),read:false},...p]);
    });
    e.target.value="";
  };

  const genPiece = type => {
    const s=numSeries[type]; if(!s) return;
    const yr=new Date().getFullYear().toString().slice(2), num=String(s.seq).padStart(4,"0"), piece=`${s.prefix}${yr}-${num}`;
    saveSeries({...numSeries,[type]:{...s,seq:s.seq+1}});
    setJournalForm&&setJournalForm(f=>({...f,piece})); setFinTool&&setFinTool("journal");
  };

  const TYPE_C = {CP:"#22C55E",DLT:"#EF4444",AI:"#3B82F6",ST:"#F59E0B",TI:"#8B5CF6",TR:"#0891B2",CH:"#F97316",PR:"#22C55E",AUT:"#6B7280"};
  const CLASSES = [{v:"all",l:"Toutes"},{v:"1",l:"Cl.1 — Ressources"},{v:"2",l:"Cl.2 — Immobilisations"},{v:"3",l:"Cl.3 — Stocks"},{v:"4",l:"Cl.4 — Tiers"},{v:"5",l:"Cl.5 — Trésorerie"},{v:"6",l:"Cl.6 — Charges"},{v:"7",l:"Cl.7 — Produits"},{v:"8",l:"Cl.8 — Autres"}];

  return (
    <div>
      <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
        {[["plan","📊 Plan Comptable"],["pieces","🔢 Numéros Pièces"],["audsc","📜 AUDSC-GIE"],["audcif","📋 AUDCIF"],["docs","📁 Docs Téléversés"]].map(([id,l])=>(
          <button key={id} onClick={()=>setTab(id)} style={{background:tab===id?"#C9A84C22":"transparent",border:`1px solid ${tab===id?"#C9A84C66":T.border}`,borderRadius:7,padding:"6px 12px",color:tab===id?"#C9A84C":T.textMuted,fontWeight:tab===id?700:400,fontSize:11}}>{l}</button>
        ))}
      </div>

      {tab==="plan"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 N° ou libellé…" style={{flex:1,minWidth:160,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}}/>
            <select value={filterCl} onChange={e=>setFilterCl(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>{CLASSES.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select>
            {(currentUser?.isAdmin||currentUser?.level>=4)&&<button onClick={()=>setShowAdd(p=>!p)} style={{background:"#C9A84C",border:"none",color:"#fff",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Compte</button>}
            <button onClick={()=>{const csv=["Numéro,Libellé,Classe,Type",...filtered.map(c=>`${c.num},"${c.lib}",${c.cl},${c.type}`)].join("\n");const b=new Blob(["\uFEFF"+csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="plan_ohada.csv";a.click();URL.revokeObjectURL(u);}} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>⬇ CSV</button>
            <span style={{color:T.textDim,fontSize:10}}>{filtered.length} comptes</span>
          </div>
          {showAdd&&(
            <div style={{background:T.surface2,border:"1px solid #C9A84C44",borderRadius:10,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
                {[["N°",newCompte.num,"num","text"],["Libellé",newCompte.lib,"lib","text"]].map(([l,v,k,t])=>(
                  <div key={k}><div style={{color:T.textDim,fontSize:10,marginBottom:3}}>{l}</div><input value={v} onChange={e=>setNewCompte(f=>({...f,[k]:e.target.value}))} type={t} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                ))}
                <div><div style={{color:T.textDim,fontSize:10,marginBottom:3}}>Classe</div><select value={newCompte.cl} onChange={e=>setNewCompte(f=>({...f,cl:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>{[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n}</option>)}</select></div>
                <div><div style={{color:T.textDim,fontSize:10,marginBottom:3}}>Type</div><select value={newCompte.type} onChange={e=>setNewCompte(f=>({...f,type:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>{Object.keys(TYPE_C).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                <button onClick={addCustom} style={{background:"#C9A84C",border:"none",color:"#fff",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12,alignSelf:"end"}}>Ajouter</button>
              </div>
            </div>
          )}
          <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",maxHeight:450,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead style={{position:"sticky",top:0,background:T.surface3}}>
                <tr>{["N° Compte","Libellé","Cl.","Type",""].map(h=><th key={h} style={{padding:"7px 10px",textAlign:"left",color:T.textMuted,fontWeight:700,fontSize:10,border:`1px solid ${T.border}`}}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.slice(0,300).map((c,i)=>(
                  <tr key={c.num+i} style={{background:i%2?"transparent":T.surface2+"44",borderBottom:`1px solid ${T.border}22`}}>
                    <td style={{padding:"5px 10px",color:"#C9A84C",fontWeight:700,fontFamily:"monospace",whiteSpace:"nowrap"}}>{c.num}</td>
                    <td style={{padding:"5px 10px",color:T.text}}>{c.lib}{c.custom&&<span style={{marginLeft:5,background:"#C9A84C22",color:"#C9A84C",borderRadius:3,padding:"1px 4px",fontSize:8}}>CUSTOM</span>}</td>
                    <td style={{padding:"5px 10px",color:T.textMuted,textAlign:"center"}}>{c.cl}</td>
                    <td style={{padding:"5px 10px"}}><span style={{background:(TYPE_C[c.type]||"#6B7280")+"22",color:TYPE_C[c.type]||"#6B7080",borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700}}>{c.type}</span></td>
                    <td style={{padding:"4px 8px",whiteSpace:"nowrap"}}>
                      <button onClick={()=>{setJournalForm&&setJournalForm(f=>({...f,compte:c.num+" — "+c.lib}));setFinTool&&setFinTool("journal");}} style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9,fontWeight:700}}>→ Journal</button>
                      {c.custom&&<button onClick={()=>saveCustom(customComptes.filter(x=>x.num!==c.num))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:11,marginLeft:3}}>🗑️</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="pieces"&&(
        <div>
          <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:4}}>🔢 Numéros de Pièces Comptables</div>
          <div style={{color:T.textDim,fontSize:10,marginBottom:12}}>Séquentiel · Affilié à la codification GC · Format : PRÉFIXE+ANNÉE-SÉQUENCE</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:12,marginBottom:14}}>
            {Object.entries(numSeries).map(([type,s])=>(
              <div key={type} style={{background:T.surface2,border:"2px solid #C9A84C33",borderRadius:12,padding:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{color:"#C9A84C",fontWeight:900,fontSize:14}}>{type}</span>
                  <span style={{background:"#C9A84C22",color:"#C9A84C",borderRadius:5,padding:"1px 6px",fontSize:9}}>{({AC:"Achats",VT:"Ventes",BQ:"Banque",PE:"Paie",OD:"OD"})[type]}</span>
                </div>
                <div style={{fontFamily:"monospace",color:T.text,fontSize:13,marginBottom:3}}>{s.prefix}{new Date().getFullYear().toString().slice(2)}-{String(s.seq).padStart(4,"0")}</div>
                <div style={{color:T.textDim,fontSize:9,marginBottom:8}}>Prochain · Séq. {s.seq}</div>
                <div style={{display:"flex",gap:5}}>
                  <input value={s.prefix} onChange={e=>saveSeries({...numSeries,[type]:{...s,prefix:e.target.value.toUpperCase().slice(0,4)}})} style={{width:52,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 6px",color:"#C9A84C",fontSize:11,fontFamily:"monospace"}}/>
                  <button onClick={()=>genPiece(type)} style={{flex:1,background:"#C9A84C",border:"none",color:"#fff",borderRadius:6,padding:"5px",cursor:"pointer",fontWeight:700,fontSize:10}}>Générer → Journal</button>
                </div>
                <button onClick={async () => {if(await gcConfirm("Réinitialiser la séquence à 1 ?"))saveSeries({...numSeries,[type]:{...s,seq:1}});}} style={{width:"100%",marginTop:5,background:"none",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"2px",cursor:"pointer",fontSize:9}}>↺ Réinitialiser</button>
              </div>
            ))}
          </div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}}>
            <div style={{color:T.text,fontWeight:700,fontSize:11,marginBottom:8}}>Dernières pièces — Journal</div>
            {journalEntries.filter(e=>e.piece).slice(0,8).map(e=>(
              <div key={e.id} style={{display:"flex",gap:10,alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${T.border}22`}}>
                <span style={{color:"#C9A84C",fontFamily:"monospace",fontWeight:700,fontSize:11,minWidth:100}}>{e.piece}</span>
                <span style={{color:T.textMuted,fontSize:10}}>{e.date}</span>
                <span style={{color:T.text,fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.libelle}</span>
              </div>
            ))}
            {journalEntries.filter(e=>e.piece).length===0&&<div style={{color:T.textDim,fontSize:10,textAlign:"center",padding:"8px 0"}}>Aucune pièce — utilisez "Générer → Journal"</div>}
          </div>
        </div>
      )}

      {(tab==="audsc"||tab==="audcif")&&(
        <div>
          <div style={{background:"linear-gradient(135deg,#C9A84C22,#B4530920)",border:"1px solid #C9A84C44",borderRadius:12,padding:14,marginBottom:12}}>
            <div style={{color:"#C9A84C",fontWeight:900,fontSize:13,marginBottom:3}}>{tab==="audsc"?"📜 AUDSC — Acte Uniforme Droit Sociétés Commerciales & GIE":"📋 AUDCIF — Acte Uniforme Comptabilité & Information Financière"}</div>
            <div style={{color:T.textMuted,fontSize:11,lineHeight:1.5}}>{tab==="audsc"?"Applicable à toutes les sociétés commerciales (SARL, SA, SNC) et GIE dans les 17 États OHADA dont le Gabon. Révisé en 2014.":"Définit les règles de comptabilité et d'information financière pour les entités des États membres OHADA. En vigueur depuis 2017."}</div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
            <select value={docType} onChange={e=>setDocType(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>{["AUDSC","AUDCIF","AUS","AUC","AUTRE"].map(t=><option key={t} value={t}>{t}</option>)}</select>
            <button onClick={()=>fileRef.current?.click()} style={{background:"#C9A84C",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>📤 Téléverser</button>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" multiple onChange={handleDocUpload} style={{display:"none"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {(tab==="audsc"?[
              {r:"Art. 1-4",t:"Champ d'application",d:"Sociétés commerciales et GIE — Constitution, immatriculation RCCM"},
              {r:"Art. 309-383",t:"SARL",d:"Capital minimum 1 FCFA — Parts sociales — Gérance — Assemblées"},
              {r:"Art. 385-559",t:"SA",d:"Capital minimum 10.000.000 FCFA — Actions — Conseil d'Administration — DG"},
              {r:"Art. 865-880",t:"GIE",d:"Personnalité morale — Membres — Administration — Dissolution"},
              {r:"Art. 54-58",t:"Registre du Commerce (RCCM)",d:"Immatriculation obligatoire — Numéro unique — Publicité légale"},
              {r:"Art. 916-920",t:"Droit pénal des sociétés",d:"Abus de biens sociaux, faux bilans, dividendes fictifs — Sanctions"},
            ]:[
              {r:"Art. 1-9",t:"Champ d'application",d:"Entreprises OHADA — Système normal, allégé et minimal de trésorerie"},
              {r:"Art. 10-20",t:"Principes comptables fondamentaux",d:"Continuité, permanence, coût historique, prudence, régularité, transparence"},
              {r:"Art. 25-45",t:"Plan comptable OHADA",d:"Classes 1 à 9 — Codification — Comptes obligatoires"},
              {r:"Art. 52-67",t:"États financiers annuels",d:"Bilan — Compte de résultat — Tableau de flux — Notes annexes"},
              {r:"Art. 100-115",t:"Consolidation des comptes",d:"Périmètre — Méthodes d'intégration — États consolidés"},
              {r:"Art. 116-120",t:"Obligations de publication",d:"Dépôt au greffe RCCM — Délais légaux — Sanctions OHADA"},
            ]).map(a=>(
              <div key={a.r} style={{background:T.surface2,border:"1px solid #C9A84C33",borderRadius:10,padding:11}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                  <span style={{background:"#C9A84C22",color:"#C9A84C",borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700,fontFamily:"monospace",whiteSpace:"nowrap"}}>{a.r}</span>
                  <span style={{color:T.text,fontWeight:700,fontSize:11}}>{a.t}</span>
                </div>
                <div style={{color:T.textMuted,fontSize:10,lineHeight:1.4,marginBottom:6}}>{a.d}</div>
                <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Explique en détail ${a.r} de l'${tab.toUpperCase()} OHADA : "${a.t}". Contexte : cabinet de conseil au Gabon. Donne des exemples pratiques.`)} style={{background:"transparent",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:9}}>🤖 IA</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==="docs"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
            <div style={{color:T.text,fontWeight:700,fontSize:13,flex:1}}>📁 Documents OHADA téléversés</div>
            <select value={docType} onChange={e=>setDocType(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>{["AUDSC","AUDCIF","AUS","AUC","AUTRE"].map(t=><option key={t} value={t}>{t}</option>)}</select>
            <button onClick={()=>fileRef.current?.click()} style={{background:"#C9A84C",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>📤 Téléverser</button>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xlsx" multiple onChange={handleDocUpload} style={{display:"none"}}/>
          </div>
          {uploadedDocs.length===0?<div style={{color:T.textMuted,textAlign:"center",padding:30}}>Aucun document OHADA — téléversez vos textes et référentiels</div>:(
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {uploadedDocs.map(d=>(
                <div key={d.id} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 13px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9}}>
                  <span style={{fontSize:20}}>📄</span>
                  <div style={{flex:1,minWidth:0}}><div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div><div style={{color:T.textMuted,fontSize:9}}>{d.type} · {d.size} · {d.uploadedAt?.slice(0,10)} · {d.uploadedBy}</div></div>
                  <span style={{background:"#C9A84C22",color:"#C9A84C",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>{d.type}</span>
                  {(d.id||d.serverUrl||d.url||d.dataUrl)&&<button onClick={()=>gcViewDoc({id:d.id,serverUrl:d.serverUrl,url:d.url,dataUrl:d.dataUrl,nom:d.name,name:d.name})} style={{background:"#10B98122",border:"1px solid #10B98144",color:"#10B981",borderRadius:5,padding:"4px 8px",cursor:"pointer",fontWeight:700,fontSize:10}}>👁️ Voir</button>}
                  {(d.id||d.serverUrl||d.url||d.dataUrl)&&<button onClick={()=>gcDownloadDoc({id:d.id,serverUrl:d.serverUrl,url:d.url,dataUrl:d.dataUrl,nom:d.name,name:d.name})} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"4px 8px",cursor:"pointer",fontWeight:700,fontSize:10}}>⬇ DL</button>}
                  <button onClick={()=>saveDocs(uploadedDocs.filter(x=>x.id!==d.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12}}>🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================================
// FIX v73 — daysLeft : utilitaire global manquant (utilisé dans Conformité,
//           DossierDetail, TachesPanel, Dashboard etc.)
// ============================================================================
const daysLeft = (dateStr) => {
  if (!dateStr) return 999;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    now.setHours(0,0,0,0); d.setHours(0,0,0,0);
    return Math.round((d - now) / 86400000);
  } catch(_) { return 999; }
};

// ============================================================================
// FIX v73 — PLAN_COMPTABLE_OHADA : plan comptable SYSCOHADA Révisé complet
//           (référentiel Gabon/CEMAC 2026 — classes 1 à 8)
// ============================================================================

// FIX v143 — DelaiConfigPanelO01 déplacé vers SIConfigPanels.jsx
// (config système SI, pas spécifique à Finance)
// Re-export pour compatibilité avec les imports existants.
export { DelaiConfigPanelO01 } from '../admin/SIConfigPanels.jsx';

export function FacturationModule({ T, currentUser, dossiers=[], partners=[], journalEntries=[], setJournalEntries=_noop, setJournalForm=_noop, setFinTool=_noop, setNotifications=_noop, prefillDossier=null, onClose=null }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const isLvl3 = currentUser?.level >= 3;
  const isLvl4 = currentUser?.level >= 4;
  const isLvl5 = currentUser?.level >= 5;

  const [factures, setFactures] = React.useState(() => {
    try { return JSON.parse(_lsGet("gc-factures") || "[]"); } catch { return []; }
  });
  const saveFactures = (data) => {
    setFactures(data);
    try {
      const json = JSON.stringify(data.slice(0,500));
      _lsSet("gc-factures", json); dsSave("gc-factures", JSON.parse(json)).catch(err => gcToast.syncError('', err));
      // FIX v130 — Sync réseau via proxy (toutes les machines voient les factures)
      dsSave("gc-factures", data.slice(0,500)).catch(() => {});
      // v111 — Notifier les autres instances ouvertes (GestionDocs ↔ Finance)
      try { window.dispatchEvent(new StorageEvent("storage", {key:"gc-factures", newValue:json})); } catch(_) {}
    } catch(_) {}
  };

  // Cascade dossier supprimé → annuler les factures liées
  React.useEffect(() => {
    const handler = (e) => {
      const { id: dossierId, ref: dossierRef } = e.detail || {};
      if (!dossierId && !dossierRef) return;
      setFactures(prev => {
        const updated = prev.map(f =>
          (f.dossierId === dossierId || f.dossierRef === dossierRef) && f.status !== "ANNULEE"
            ? { ...f, status: "ANNULEE", annuleAt: new Date().toISOString(), annuleRaison: `Dossier ${dossierRef} supprimé` }
            : f
        );
        if (updated.some((f,i) => f !== prev[i])) {
          try { const j = JSON.stringify(updated.slice(0,500)); _lsSet("gc-factures", j); dsSave("gc-factures", JSON.parse(j)).catch(() => {}); } catch(_) {}
        }
        return updated;
      });
    };
    window.addEventListener('gc:dossier-deleted', handler);
    return () => window.removeEventListener('gc:dossier-deleted', handler);
  }, []);

  const factInit = {
    client:"", objet:"", dossierId:"", dossierRef:"", montantHT:"", taux:"18",
    echeance:"", notes:"", processus:"O02"
  };

  // Lire le prefill depuis DossierDetailModal (via gc-prefill-facture)
  const getNavPrefill = () => {
    try {
      const p = JSON.parse(_lsGet("gc-prefill-facture")||"null");
      if(p) { _lsSet("gc-prefill-facture",""); return p; } // consommer une seule fois
    } catch(_) {}
    return null;
  };

  const [form, setForm] = React.useState(() => {
    const navPrefill = getNavPrefill();
    const pf = prefillDossier || navPrefill;
    if (pf) return {
      ...factInit,
      client: pf.client || "",
      objet: pf.objet || "",
      dossierId: pf.id || "",
      dossierRef: pf.ref || "",
      montantHT: pf.amount != null ? String(pf.amount) : "",
      processus: pf.process || "O02"};
    return factInit;
  });
  const [showForm, setShowForm] = React.useState(()=>{
    try { return !!prefillDossier || !!JSON.parse(_lsGet("gc-prefill-facture")||"null"); } catch(_){ return !!prefillDossier; }
  });
  const [devis, setDevis] = React.useState(() => {
    try { return JSON.parse(_lsGet("gc-devis") || "[]"); } catch { return []; }
  });
  const saveDevis = (data) => {
    setDevis(data);
    try {
      const json = JSON.stringify(data.slice(0, 500));
      _lsSet("gc-devis", json);
      dsSave("gc-devis", JSON.parse(json)).catch(() => {});
      try { window.dispatchEvent(new StorageEvent("storage", { key: "gc-devis", newValue: json })); } catch (_) {}
    } catch (_) {}
  };
  const devisInit = {
    client:"", objet:"", dossierId:"", dossierRef:"", montantHT:"", taux:"18",
    validiteJours:"30", notes:"", processus:"O02", remise:"0"
  };
  const [devisForm, setDevisForm] = React.useState(devisInit);
  const [showDevisForm, setShowDevisForm] = React.useState(false);
  const [devisFilter, setDevisFilter] = React.useState("ALL");
  const [filterStatus, setFilterStatus] = React.useState("ALL");
  const [showDetail, setShowDetail] = React.useState(null);
  const [showSigModal, setShowSigModal] = React.useState(null);

  // Sync temps-réel : rafraîchit les données quand un autre utilisateur les modifie
  useRemoteSync({
    'gc-factures': setFactures,
    'gc-devis':    setDevis,
  });

  const STATUS_FACT = {
    BROUILLON:  {l:"Brouillon",   c:"#6B7280", icon:"📝"},
    EMISE:      {l:"Émise",       c:"#3B82F6", icon:"📤"},
    PAYEE:      {l:"Payée",       c:"#22C55E", icon:"✅"},
    EN_RETARD:  {l:"En retard",   c:"#EF4444", icon:"⚠️"},
    ANNULEE:    {l:"Annulée",     c:"#9CA3AF", icon:"❌"}};
  const STATUS_DEVIS = {
    BROUILLON: { l:"Brouillon", c:"#6B7280", icon:"📝" },
    VALIDE:    { l:"Validé",    c:"#3B82F6", icon:"📤" },
    ENVOYE:    { l:"Envoyé",    c:"#F59E0B", icon:"📨" },
    ACCEPTE:   { l:"Accepté",   c:"#22C55E", icon:"✅" },
    REFUSE:    { l:"Refusé",    c:"#EF4444", icon:"⛔" },
    CONVERTI:  { l:"Converti",  c:"#8B5CF6", icon:"🔁" },
  };

  // Sync déjà géré par useRemoteSync aux lignes 62-65 et 360-362

  // Calcul auto retards
  React.useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const updated = factures.map(f => {
      if (f.status === "EMISE" && f.echeance && f.echeance < today) return {...f, status:"EN_RETARD"};
      return f;
    });
    const hasChange = updated.some((f,i) => f.status !== factures[i]?.status);
    if (hasChange) saveFactures(updated);
   
  }, []);

  const genRef = () => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth()+1).padStart(2,"0");
    // Séquence persistante dans localStorage pour éviter les doublons
    const seqKey = `gc-fact-seq-${year}`;
    let seq = 1;
    try {
      seq = (parseInt(_lsGet(seqKey)||"0") || 0) + 1;
      _lsSet(seqKey, String(seq));
    } catch(_) {
      // Fallback : compter les factures existantes de l'année
      seq = factures.filter(f=>f.ref?.includes(String(year))).length + 1;
    }
    // Format : HON-YYYY-NNN (ex: HON-2026-001)
    return `HON-${year}-${String(seq).padStart(3,"0")}`;
  };
  const genDevisRef = () => {
    const year = new Date().getFullYear();
    const seqKey = `gc-devis-seq-${year}`;
    let seq = 1;
    try {
      seq = (parseInt(_lsGet(seqKey) || "0", 10) || 0) + 1;
      _lsSet(seqKey, String(seq));
    } catch (_) {
      seq = devis.filter(d => d.ref?.includes(String(year))).length + 1;
    }
    return `DEV-${year}-${String(seq).padStart(3, "0")}`;
  };

  const handleCreate = () => {
    if (!form.client || !form.objet || !form.montantHT) { gcAlert("Client, objet et montant HT sont requis."); return; }
    const ht = parseFloat(form.montantHT) || 0;
    const tva = ht * (parseFloat(form.taux||18) / 100);
    const ttc = ht + tva;
    const ref = genRef();
    const entry = {
      ...form, id:"FAC-"+Date.now(), ref,
      montantHT: ht, tva, ttc, taux: parseFloat(form.taux||18),
      status: "BROUILLON",
      createdBy: currentUser.id, createdByName: currentUser.name,
      createdAt: new Date().toISOString(),
      relances: []};
    saveFactures([entry, ...factures]);
    setNotifications(p=>[{id:"N"+Date.now(),icon:"💰",message:`Note d'honoraires créée : ${ref} — ${form.client} — ${ttc.toLocaleString("fr-FR")} FCFA TTC`,at:new Date().toISOString(),read:false},...p]);
    setForm(factInit); setShowForm(false);
    if (onClose) onClose();
  };
  const handleCreateDevis = () => {
    if (!devisForm.client || !devisForm.objet || !devisForm.montantHT) {
      gcAlert("Client, objet et montant HT sont requis.");
      return;
    }
    const ht = parseFloat(devisForm.montantHT) || 0;
    const remisePct = Math.max(0, Math.min(100, parseFloat(devisForm.remise || 0) || 0));
    const htAfterRemise = ht * (1 - remisePct / 100);
    const tva = htAfterRemise * (parseFloat(devisForm.taux || 18) / 100);
    const ttc = htAfterRemise + tva;
    const ref = genDevisRef();
    const validUntil = new Date(Date.now() + (parseInt(devisForm.validiteJours || "30", 10) || 30) * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];
    const entry = {
      ...devisForm,
      id: "DEV-" + Date.now(),
      ref,
      montantHT: ht,
      remise: remisePct,
      montantApresRemise: htAfterRemise,
      tva,
      ttc,
      validUntil,
      status: "BROUILLON",
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: new Date().toISOString(),
    };
    saveDevis([entry, ...devis]);
    setNotifications(p => [{
      id:"N" + Date.now(),
      icon:"📄",
      message:`Devis créé : ${ref} — ${entry.client} — ${ttc.toLocaleString("fr-FR")} FCFA TTC`,
      at:new Date().toISOString(),
      read:false
    }, ...p]);
    setDevisForm(devisInit);
    setShowDevisForm(false);
  };
  const handleConvertDevisToFacture = (d) => {
    const ref = genRef();
    const entry = {
      id:"FAC-" + Date.now(),
      ref,
      client:d.client,
      objet:d.objet,
      dossierId:d.dossierId || "",
      dossierRef:d.dossierRef || "",
      montantHT: d.montantApresRemise ?? d.montantHT,
      taux: parseFloat(d.taux || 18),
      tva: d.tva ?? ((d.montantApresRemise ?? d.montantHT) * (parseFloat(d.taux || 18) / 100)),
      ttc: d.ttc ?? ((d.montantApresRemise ?? d.montantHT) * (1 + parseFloat(d.taux || 18) / 100)),
      echeance: "",
      notes: `Converti depuis devis ${d.ref}${d.notes ? `\n${d.notes}` : ""}`,
      processus: d.processus || "O02",
      status: "BROUILLON",
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: new Date().toISOString(),
      relances: [],
      sourceDevisRef: d.ref,
    };
    saveFactures([entry, ...factures]);
    saveDevis(devis.map(x => x.id === d.id ? { ...x, status: "CONVERTI", convertedFactureRef: ref, convertedAt: new Date().toISOString() } : x));
    setNotifications(p => [{
      id:"N" + Date.now(),
      icon:"🔁",
      message:`Devis ${d.ref} converti en facture ${ref}`,
      at:new Date().toISOString(),
      read:false
    }, ...p]);
  };
  const handleSendDevis = async (d) => {
    const canal = await gcPrompt(`Canal d'envoi pour ${d.ref} (email, WhatsApp, courrier...)`, d.sentVia || "email");
    if (canal === null) return;
    const updated = devis.map(x => x.id === d.id ? {
      ...x,
      status: "ENVOYE",
      sentAt: new Date().toISOString(),
      sentVia: canal || "email",
      sentBy: currentUser.id,
      sentByName: currentUser.name,
    } : x);
    saveDevis(updated);
    setNotifications(p => [{
      id:"N" + Date.now(),
      icon:"📨",
      message:`Devis ${d.ref} envoyé (${canal || "email"}) à ${d.client}`,
      at:new Date().toISOString(),
      read:false
    }, ...p]);
  };
  const handleAcceptDevis = async (d) => {
    if (!(await gcConfirm(`Marquer le devis ${d.ref} comme accepté ?`))) return;
    saveDevis(devis.map(x => x.id === d.id ? { ...x, status: "ACCEPTE", acceptedAt: new Date().toISOString() } : x));
    setNotifications(p => [{
      id:"N" + Date.now(),
      icon:"✅",
      message:`Devis accepté : ${d.ref} — ${d.client}`,
      at:new Date().toISOString(),
      read:false
    }, ...p]);
  };
  const handleRejectDevis = async (d) => {
    const reason = await gcPrompt(`Motif de refus pour ${d.ref} (optionnel)`, d.rejectReason || "");
    if (reason === null) return;
    saveDevis(devis.map(x => x.id === d.id ? {
      ...x,
      status: "REFUSE",
      refusedAt: new Date().toISOString(),
      rejectReason: reason || "",
    } : x));
    setNotifications(p => [{
      id:"N" + Date.now(),
      icon:"⛔",
      message:`Devis refusé : ${d.ref}${reason ? ` — Motif: ${reason}` : ""}`,
      at:new Date().toISOString(),
      read:false
    }, ...p]);
  };

  // Créer écriture composite OHADA — FIX v143b
  // SYSCOHADA : une facture = UNE écriture composite en partie double
  //   D: 411 Clients     = Montant TTC (HT + TVA)
  //   C: 706 Prestations = Montant HT
  //   C: 4431 TVA coll.  = Montant TVA
  // Créer deux lignes de journal liées par la même pièce (le journal SYSCOHADA
  // fonctionne en lignes, pas en écritures multi-lignes natives).
  // La convention : première ligne porte le débit TTC, deuxième le crédit TVA.
  // Le solde 411 = TTC, 706 = HT, 4431 = TVA → bilan équilibré sans double-comptage.
  const createJournal706 = (f) => {
    const today = new Date().toISOString().split("T")[0];
    const ttc   = Number(f.montantHT) + Number(f.tva || 0);
    // Ligne principale : D:411 TTC | C:706 HT
    const entry706 = {
      id: "JE-FAC-"+Date.now(),
      date: today,
      piece: f.ref,
      libelle: `Honoraires — ${f.objet} — ${f.client}`,
      compteDebit: "411",   // Client — montant TTC
      compteCredit: "706",  // Prestations de services — montant HT
      debit:  String(ttc),          // TTC au débit 411
      credit: String(f.montantHT),  // HT au crédit 706
      tiers: f.client,
      factureRef: f.ref,
      addedBy: currentUser.name,
      addedAt: new Date().toISOString()};
    // Ligne TVA uniquement si TVA > 0 : C:4431 TVA collectée
    // Pas de débit 411 ici — le débit TTC est déjà dans entry706
    const entryTVA = Number(f.tva) > 0 ? {
      id: "JE-TVA-"+Date.now()+1,
      date: today, piece: f.ref,
      libelle: `TVA collectée 18% — ${f.ref}`,
      compteDebit: "",      // pas de débit supplémentaire (déjà dans entry706)
      compteCredit: "4431", // TVA collectée
      debit:  "0",
      credit: String(f.tva),
      tiers: f.client, factureRef: f.ref,
      addedBy: currentUser.name, addedAt: new Date().toISOString()} : null;
    const newEntries = entryTVA ? [entry706, entryTVA] : [entry706];
    // Écrire directement dans localStorage gc-journal (compatible avec S01 Finance)
    try {
      const existing = JSON.parse(_lsGet("gc-journal") || "[]");
      const merged = [...newEntries, ...existing].slice(0, 500);
      _lsSet("gc-journal", JSON.stringify(merged)); dsSave("gc-journal", merged).catch(err => gcToast.syncError('', err));
    } catch(_) {}
    // Mettre à jour le state React si disponible (module Finance ouvert)
    if (setJournalEntries) setJournalEntries(prev => [...newEntries, ...(prev||[])]);
    // Marquer la facture comme liée
    saveFactures(factures.map(x => x.id===f.id ? {...x, journal706Created:true, journal706Date:today} : x));
    setNotifications(p=>[{id:"N"+Date.now(),icon:"📒",message:`Écriture 706 créée dans le journal OHADA pour ${f.ref} — ${Number(f.montantHT).toLocaleString("fr-FR")} FCFA`,at:new Date().toISOString(),read:false},...p]);
    const ttcAlert = Number(f.montantHT) + Number(f.tva || 0);
    gcAlert(`✅ Écriture OHADA créée dans le Journal S01 :\n• Débit 411 (Client) : ${ttcAlert.toLocaleString("fr-FR")} FCFA TTC\n• Crédit 706 (Prestations) : ${Number(f.montantHT).toLocaleString("fr-FR")} FCFA HT${Number(f.tva)>0?`\n• Crédit 4431 (TVA collectée) : ${Number(f.tva).toLocaleString("fr-FR")} FCFA`:""}\n\nÉcriture composite conforme SYSCOHADA révisé.\nVisible dans Finance S01 > Journal.`);
  };

  const handlePrint = (f) => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${f.ref}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;color:#1a1a1a;font-size:13px}
    .header{text-align:center;border-bottom:3px solid #0A1E4A;padding-bottom:20px;margin-bottom:30px}
    .logo{font-size:22px;font-weight:900;color:#0A1E4A;letter-spacing:1px}
    .subtitle{color:#C41E3A;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-top:4px}
    h1{color:#0A1E4A;font-size:16px;text-align:center;margin:20px 0}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    th{background:#0A1E4A;color:#fff;padding:8px;text-align:left;font-size:11px}
    td{padding:8px;border-bottom:1px solid #eee;font-size:12px}
    .total-row td{font-weight:900;background:#f8f8f8}
    .ttc-row td{font-weight:900;font-size:14px;color:#0A1E4A;background:#e8f0ff}
    .status{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700}
    .footer{margin-top:40px;text-align:center;font-size:9px;color:#888;border-top:1px solid #ddd;padding-top:10px}
    .sig-zone{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
    .sig-box{border-top:2px solid #0A1E4A;padding-top:8px;min-height:50px}
    </style></head><body>
    <div class="header"><div class="logo">⚖ GÉNIE CONSULTANT</div>
    <div class="subtitle">Cabinet Juridique, d'Affaires & de Conseil — Libreville, Gabon</div></div>
    <h1>NOTE D'HONORAIRES</h1>
    <div class="meta">
      <div><strong>Référence :</strong> ${f.ref}<br><strong>Date :</strong> ${new Date(f.createdAt).toLocaleDateString("fr-FR")}<br><strong>Échéance :</strong> ${f.echeance?new Date(f.echeance).toLocaleDateString("fr-FR"):"—"}</div>
      <div><strong>Client :</strong> ${f.client}<br><strong>Dossier :</strong> ${f.dossierRef||"—"}<br><strong>Processus :</strong> ${f.processus}</div>
    </div>
    <table><thead><tr><th>Désignation</th><th>Montant HT</th><th>TVA (${f.taux}%)</th><th>Montant TTC</th></tr></thead>
    <tbody>
      <tr><td>${f.objet}</td><td>${Number(f.montantHT).toLocaleString("fr-FR")} FCFA</td><td>${Number(f.tva).toLocaleString("fr-FR")} FCFA</td><td>${Number(f.ttc).toLocaleString("fr-FR")} FCFA</td></tr>
      <tr class="total-row"><td colspan="3"><strong>TOTAL HT</strong></td><td>${Number(f.montantHT).toLocaleString("fr-FR")} FCFA</td></tr>
      <tr class="total-row"><td colspan="3"><strong>TVA ${f.taux}%</strong></td><td>${Number(f.tva).toLocaleString("fr-FR")} FCFA</td></tr>
      <tr class="ttc-row"><td colspan="3"><strong>TOTAL TTC</strong></td><td><strong>${Number(f.ttc).toLocaleString("fr-FR")} FCFA</strong></td></tr>
    </tbody></table>
    ${f.notes?`<p><strong>Notes :</strong> ${f.notes}</p>`:""}
    <div class="sig-zone">
      <div class="sig-box"><p style="font-size:11px;font-weight:700;color:#555">POUR LE CABINET — GÉNIE CONSULTANT</p>
      ${f.signature?`<p style="color:#22C55E;font-style:italic;font-size:11px">${f.signature.sigDisplay}</p>`:"<br><br>Signature & Cachet"}
      </div>
      <div class="sig-box"><p style="font-size:11px;font-weight:700;color:#555">POUR LE CLIENT — ${f.client}</p><br><br>Signature</div>
    </div>
    <div class="footer">GÉNIE CONSULTANT — Libreville, Gabon — Document généré par le SI Génie Consultant v93<br>Compte 706 — Prestations de services (SYSCOHADA révisé)</div>
    </body></html>`;
    const w = window.open("","_blank","width=800,height=900");
    if(w){w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),400);}
  };
  const handlePrintDevis = (d) => {
    const ht = Number(d.montantHT || 0);
    const remise = Number(d.remise || 0);
    const htAfter = Number(d.montantApresRemise ?? ht);
    const tva = Number(d.tva || 0);
    const ttc = Number(d.ttc || 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${d.ref}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;color:#1a1a1a;font-size:13px}
    .header{text-align:center;border-bottom:3px solid #0A1E4A;padding-bottom:20px;margin-bottom:30px}
    .logo{font-size:22px;font-weight:900;color:#0A1E4A;letter-spacing:1px}
    .subtitle{color:#C41E3A;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-top:4px}
    h1{color:#0A1E4A;font-size:16px;text-align:center;margin:20px 0}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    th{background:#0A1E4A;color:#fff;padding:8px;text-align:left;font-size:11px}
    td{padding:8px;border-bottom:1px solid #eee;font-size:12px}
    .total-row td{font-weight:900;background:#f8f8f8}
    .ttc-row td{font-weight:900;font-size:14px;color:#0A1E4A;background:#e8f0ff}
    .footer{margin-top:40px;text-align:center;font-size:9px;color:#888;border-top:1px solid #ddd;padding-top:10px}
    </style></head><body>
    <div class="header"><div class="logo">⚖ GÉNIE CONSULTANT</div>
    <div class="subtitle">Cabinet Juridique, d'Affaires & de Conseil — Libreville, Gabon</div></div>
    <h1>MAQUETTE DE PRIX / DEVIS</h1>
    <div class="meta">
      <div><strong>Référence :</strong> ${d.ref}<br><strong>Date :</strong> ${new Date(d.createdAt).toLocaleDateString("fr-FR")}<br><strong>Validité :</strong> ${d.validUntil?new Date(d.validUntil).toLocaleDateString("fr-FR"):"—"}</div>
      <div><strong>Client :</strong> ${d.client}<br><strong>Dossier :</strong> ${d.dossierRef||"—"}<br><strong>Processus :</strong> ${d.processus||"O02"}</div>
    </div>
    <table><thead><tr><th>Désignation</th><th>Montant HT</th><th>TVA (${d.taux||18}%)</th><th>Montant TTC</th></tr></thead>
    <tbody>
      <tr><td>${d.objet||"Prestation"}</td><td>${htAfter.toLocaleString("fr-FR")} FCFA</td><td>${tva.toLocaleString("fr-FR")} FCFA</td><td>${ttc.toLocaleString("fr-FR")} FCFA</td></tr>
      <tr class="total-row"><td colspan="3"><strong>Montant HT initial</strong></td><td>${ht.toLocaleString("fr-FR")} FCFA</td></tr>
      <tr class="total-row"><td colspan="3"><strong>Remise</strong></td><td>${remise}%</td></tr>
      <tr class="total-row"><td colspan="3"><strong>HT après remise</strong></td><td>${htAfter.toLocaleString("fr-FR")} FCFA</td></tr>
      <tr class="total-row"><td colspan="3"><strong>TVA ${d.taux||18}%</strong></td><td>${tva.toLocaleString("fr-FR")} FCFA</td></tr>
      <tr class="ttc-row"><td colspan="3"><strong>TOTAL TTC</strong></td><td><strong>${ttc.toLocaleString("fr-FR")} FCFA</strong></td></tr>
    </tbody></table>
    ${d.notes?`<p><strong>Notes / Conditions :</strong> ${d.notes}</p>`:""}
    <div class="footer">Document devis généré par le SI Génie Consultant</div>
    </body></html>`;
    const w = window.open("","_blank","width=800,height=900");
    if(w){w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),400);}
  };

  const handleRelance = (f) => {
    const now = new Date();
    const relanceNum = (f.relances||[]).length + 1;
    const relanceTypes = {1:"J+30",2:"J+60",3:"J+90"};
    const relEntry = { id:"REL-"+Date.now(), type:relanceTypes[relanceNum]||"ULTIME", at:now.toISOString(), byName:currentUser.name };
    saveFactures(factures.map(x=>x.id===f.id?{...x,relances:[...(x.relances||[]),relEntry]}:x));
    setNotifications(p=>[{id:"N"+Date.now(),icon:"🔔",message:`Relance ${relanceTypes[relanceNum]||"ultime"} enregistrée pour ${f.ref} — ${f.client}`,at:now.toISOString(),read:false},...p]);
    gcAlert(`✅ Relance ${relanceTypes[relanceNum]||"ultime"} enregistrée pour ${f.ref} — ${f.client}`);
  };

  // KPIs
  const totalFacture = factures.filter(f=>["EMISE","PAYEE","EN_RETARD"].includes(f.status)).reduce((a,f)=>a+f.ttc,0);
  const totalEncaisse = factures.filter(f=>f.status==="PAYEE").reduce((a,f)=>a+f.ttc,0);
  const totalRetard = factures.filter(f=>f.status==="EN_RETARD").reduce((a,f)=>a+f.ttc,0);

  const filtered = factures.filter(f => filterStatus==="ALL" || f.status===filterStatus);
  const filteredDevis = devis.filter(d => devisFilter === "ALL" || d.status === devisFilter);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>💰 Facturation & Honoraires</div>
          <div style={{color:T.textMuted,fontSize:11}}>Gestion des notes d'honoraires du cabinet</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {isLvl3 && <Btn variant="ghost" size="sm" onClick={()=>setShowDevisForm(true)}>+ Nouvelle maquette de prix</Btn>}
          {isLvl3 && <Btn variant="gold" size="sm" onClick={()=>setShowForm(true)}>+ Nouvelle note d'honoraires</Btn>}
        </div>
      </div>

      {/* Devis / maquettes */}
      <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{color:T.text,fontWeight:800,fontSize:12}}>📄 Maquettes de prix / Devis</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[["ALL","Tous"],["BROUILLON","Brouillon"],["VALIDE","Validés"],["ENVOYE","Envoyés"],["ACCEPTE","Acceptés"],["REFUSE","Refusés"],["CONVERTI","Convertis"]].map(([k,l]) => (
              <button key={k} onClick={()=>setDevisFilter(k)}
                style={{background:devisFilter===k?(STATUS_DEVIS[k]?.c||"#0A1E4A")+"22":"transparent",border:`1px solid ${devisFilter===k?(STATUS_DEVIS[k]?.c||"#0A1E4A")+"66":T.border}`,color:devisFilter===k?(STATUS_DEVIS[k]?.c||"#0A1E4A"):T.textMuted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:devisFilter===k?700:400}}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {filteredDevis.length===0 ? (
          <div style={{color:T.textDim,fontSize:11}}>Aucune maquette pour ce filtre.</div>
        ) : filteredDevis.slice(0, 10).map(d => {
          const st = STATUS_DEVIS[d.status] || STATUS_DEVIS.BROUILLON;
          const canConvert = ["BROUILLON","VALIDE","ENVOYE","ACCEPTE"].includes(d.status);
          return (
            <div key={d.id} style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",padding:"8px 0",borderTop:`1px solid ${T.border}`}}>
              <div style={{minWidth:0}}>
                <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{color:T.text,fontWeight:700,fontSize:11}}>{d.ref}</span>
                  <span style={{background:st.c+"22",color:st.c,border:`1px solid ${st.c}44`,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>{st.icon} {st.l}</span>
                  {d.dossierRef && <span style={{color:"#C9A84C",fontSize:9}}>📁 {d.dossierRef}</span>}
                  {d.sentAt && <span style={{color:T.textDim,fontSize:9}}>Envoyé le {new Date(d.sentAt).toLocaleDateString("fr-FR")}</span>}
                </div>
                <div style={{color:T.textMuted,fontSize:10}}>{d.client} · {d.objet}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:"#C9A84C",fontWeight:800,fontSize:11}}>{Number(d.ttc||0).toLocaleString("fr-FR")} FCFA TTC</div>
                <div style={{display:"flex",gap:5,justifyContent:"flex-end",marginTop:4}}>
                  <button onClick={()=>handlePrintDevis(d)} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>🖨️ Imprimer</button>
                  {isLvl3 && ["BROUILLON","VALIDE"].includes(d.status) && (
                    <button onClick={()=>handleSendDevis(d)} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>📨 Envoyer</button>
                  )}
                  {isLvl3 && ["ENVOYE","VALIDE"].includes(d.status) && (
                    <button onClick={()=>handleAcceptDevis(d)} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Accepter</button>
                  )}
                  {canConvert && isLvl3 && (
                    <button onClick={()=>handleConvertDevisToFacture(d)} style={{background:"#8B5CF622",border:"1px solid #8B5CF644",color:"#8B5CF6",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>🔁 Convertir</button>
                  )}
                  {isLvl3 && d.status !== "VALIDE" && (
                    <button onClick={()=>saveDevis(devis.map(x=>x.id===d.id?{...x,status:"VALIDE",validatedAt:new Date().toISOString()}:x))} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>Valider</button>
                  )}
                  {isLvl3 && !["CONVERTI","REFUSE"].includes(d.status) && (
                    <button onClick={()=>handleRejectDevis(d)} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>Refuser</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
        {[
          {l:"CA Facturé",v:totalFacture,c:"#3B82F6",icon:"📤"},
          {l:"CA Encaissé",v:totalEncaisse,c:"#22C55E",icon:"✅"},
          {l:"En retard",v:totalRetard,c:"#EF4444",icon:"⚠️"},
        ].map(kpi=>(
          <div key={kpi.l} style={{background:T.surface,border:`1px solid ${kpi.c}33`,borderRadius:10,padding:"10px 12px"}}>
            <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>{kpi.icon} {kpi.l}</div>
            <div style={{color:kpi.c,fontWeight:900,fontSize:14,marginTop:3}}>{kpi.v>=1e6?(kpi.v/1e6).toFixed(1)+"M":kpi.v>=1e3?(kpi.v/1e3).toFixed(0)+"k":kpi.v.toLocaleString("fr-FR")} FCFA</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {[["ALL","Toutes"],["BROUILLON","Brouillon"],["EMISE","Émises"],["PAYEE","Payées"],["EN_RETARD","En retard"],["ANNULEE","Annulées"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilterStatus(k)}
            style={{background:filterStatus===k?STATUS_FACT[k]?.c||"#0A1E4A":"transparent",border:`1px solid ${filterStatus===k?STATUS_FACT[k]?.c||"#0A1E4A":T.border}`,
            color:filterStatus===k?"#fff":T.textMuted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:filterStatus===k?700:400}}>
            {l} {k!=="ALL"&&factures.filter(f=>f.status===k).length>0?`(${factures.filter(f=>f.status===k).length})`:""}
          </button>
        ))}
      </div>

      {/* Liste */}
      {filtered.length===0 ? (
        <div style={{background:T.surface2,borderRadius:10,padding:40,textAlign:"center",color:T.textMuted,fontSize:12}}>
          Aucune note d'honoraires. {isLvl3?"Cliquez sur \"+ Nouvelle note d'honoraires\" pour commencer.":"Demandez à un responsable de créer une facture."}
        </div>
      ) : filtered.map(f => {
        const st = STATUS_FACT[f.status] || STATUS_FACT.BROUILLON;
        const relCount = (f.relances||[]).length;
        return (
          <div key={f.id} style={{background:T.surface,border:`2px solid ${f.status==="EN_RETARD"?"#EF444433":T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:T.text,fontWeight:900,fontSize:13}}>{f.ref}</span>
                  <span style={{background:st.c+"22",color:st.c,border:`1px solid ${st.c}44`,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>{st.icon} {st.l}</span>
                  {f.journal706Created && <span style={{background:"#22C55E22",color:"#22C55E",border:"1px solid #22C55E44",borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>📒 706 OK</span>}
                  {relCount>0 && <span style={{background:"#F59E0B22",color:"#F59E0B",border:"1px solid #F59E0B44",borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>🔔 {relCount} relance(s)</span>}
                </div>
                <div style={{color:T.textMuted,fontSize:11,marginTop:3}}>{f.client} · {f.objet}</div>
                <div style={{color:T.textDim,fontSize:10,marginTop:1}}>
                  Créée le {new Date(f.createdAt).toLocaleDateString("fr-FR")} · Échéance : {f.echeance?new Date(f.echeance).toLocaleDateString("fr-FR"):"Non définie"}
                  {f.dossierRef && <span> · Dossier : {f.dossierRef}</span>}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:"#C9A84C",fontWeight:900,fontSize:15}}>{Number(f.ttc).toLocaleString("fr-FR")} FCFA TTC</div>
                <div style={{color:T.textDim,fontSize:9}}>HT: {Number(f.montantHT).toLocaleString("fr-FR")} · TVA: {Number(f.tva).toLocaleString("fr-FR")}</div>
              </div>
            </div>
            {f.signature && (
              <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:6,padding:"4px 10px",fontSize:10,color:"#22C55E",marginBottom:6}}>
                ✍️ {f.signature.sigDisplay}
              </div>
            )}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>handlePrint(f)} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🖨️ Imprimer</button>
              {isLvl4 && f.status==="BROUILLON" && (
                <button onClick={()=>saveFactures(factures.map(x=>x.id===f.id?{...x,status:"EMISE",emiseAt:new Date().toISOString(),emiseBy:currentUser.id}:x))} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>📤 Émettre</button>
              )}
              {isLvl4 && ["EMISE","EN_RETARD"].includes(f.status) && !f.signature && (
                <button onClick={()=>setShowSigModal(f)} style={{background:"#8B5CF622",border:"1px solid #8B5CF644",color:"#8B5CF6",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✍️ Signer</button>
              )}
              {isLvl3 && ["EMISE","EN_RETARD"].includes(f.status) && (
                <button onClick={()=>saveFactures(factures.map(x=>x.id===f.id?{...x,status:"PAYEE",payeeAt:new Date().toISOString(),payeeBy:currentUser.id}:x))} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Marquer payée</button>
              )}
              {isLvl3 && ["EMISE","EN_RETARD"].includes(f.status) && (
                <button onClick={()=>handleRelance(f)} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🔔 Relancer {(f.relances||[]).length===0?"(J+30)":(f.relances||[]).length===1?"(J+60)":"(J+90)"}</button>
              )}
              {isLvl4 && ["EMISE","EN_RETARD","PAYEE"].includes(f.status) && !f.journal706Created && (
                <button onClick={()=>createJournal706(f)} style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>📒 Créer écriture 706</button>
              )}
              {isLvl4 && f.status!=="ANNULEE" && (
                <button onClick={async () => {if(await gcConfirm(`Annuler la facture ${f.ref} ?`))saveFactures(factures.map(x=>x.id===f.id?{...x,status:"ANNULEE",annuleAt:new Date().toISOString()}:x))}} style={{background:"#9CA3AF22",border:"1px solid #9CA3AF44",color:"#9CA3AF",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>❌ Annuler</button>
              )}
              {isLvl5 && (
                <button onClick={async () => {if(await gcConfirm(`Supprimer définitivement la facture ${f.ref} ? Action irréversible.`,"Suppression définitive","⚠️",true))saveFactures(factures.filter(x=>x.id!==f.id))}} style={{background:"#EF444415",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️ Purger</button>
              )}
            </div>
          </div>
        );
      })}

      {/* Formulaire création */}
      {showForm && (
        <Modal title="💰 Nouvelle Note d'Honoraires" onClose={()=>{setShowForm(false);if(onClose)onClose();}} wide T={T}>
          {/* FIX v130 — hint SYSCOHADA interne supprimé (ne doit pas être visible par les utilisateurs) */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Client *","client","text"],["Objet de la mission *","objet","text"],["Montant HT (FCFA) *","montantHT","number"],["Taux TVA (%)","taux","number"],["Dossier lié","dossierRef","text"],["Échéance paiement","echeance","date"]].map(([l,k,type])=>(
              <div key={k} style={["objet"].includes(k)?{gridColumn:"span 2"}:{}}>
                <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>{l}</label>
                {k==="dossierRef" ? (
                  <select value={form[k]} onChange={e=>{
                    const d=dossiers.find(x=>x.ref===e.target.value);
                    setForm(f=>({
                      ...f,
                      dossierId:d?.id||"",
                      dossierRef:e.target.value,
                      client:d?.client||f.client,
                      objet:d?.objet||f.objet,
                      montantHT:d?.amount != null ? String(d.amount) : f.montantHT,
                      processus:d?.process||f.processus
                    }));
                  }} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="">— Aucun —</option>
                    {dossiers
                      .filter(d => d.status !== "SUPPRIME")
                      .map(d => (
                        <option key={d.id} value={d.ref}>
                          {d.ref} — {d.client}
                          {d.amount ? ` — ${Number(d.amount).toLocaleString("fr-FR")} F` : ""}
                        </option>
                      ))}
                  </select>
                ) : k==="client" ? (
                  // FIX v130 — datalist partenaires CRM sur le champ client
                  <>
                    <input type="text" value={form[k]} list="gc-facture-clients-list"
                      onChange={e=>{
                        const val=e.target.value;
                        const matched=(partners||[]).find(p=>p.nom===val);
                        setForm(f=>({...f,client:val,...(matched?{partnerIdRef:matched.id}:{})}));
                      }}
                      style={{width:"100%",background:T.surface2,border:`1px solid ${(partners||[]).find(p=>p.nom===form[k])?"#22C55E44":T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                    <datalist id="gc-facture-clients-list">
                      {(partners||[]).filter(p=>["client","prospect","partenaire"].includes(p.type)).map(p=>(
                        <option key={p.id} value={p.nom}>{p.nom} — {p.type}</option>
                      ))}
                    </datalist>
                  </>
                ) : (
                  <input type={type} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                    style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                )}
              </div>
            ))}
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Processus</label>
              <select value={form.processus} onChange={e=>setForm(f=>({...f,processus:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                {["O01","O02","O03","S01","S03"].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {/* Aperçu calcul */}
            {form.montantHT && (
              <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:8,padding:"8px 12px"}}>
                <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Aperçu calcul</div>
                <div style={{color:T.text,fontSize:11}}>HT : <strong>{Number(form.montantHT).toLocaleString("fr-FR")} FCFA</strong></div>
                <div style={{color:T.textMuted,fontSize:11}}>TVA {form.taux||18}% : {(parseFloat(form.montantHT||0)*parseFloat(form.taux||18)/100).toLocaleString("fr-FR")} FCFA</div>
                <div style={{color:"#C9A84C",fontWeight:900,fontSize:13}}>TTC : {(parseFloat(form.montantHT||0)*(1+parseFloat(form.taux||18)/100)).toLocaleString("fr-FR")} FCFA</div>
              </div>
            )}
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Notes / Conditions</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box",resize:"vertical"}} />
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
            <Btn variant="ghost" size="sm" onClick={()=>{setShowForm(false);if(onClose)onClose();}}>Annuler</Btn>
            <Btn variant="gold" size="sm" onClick={handleCreate}>💰 Créer la note d'honoraires</Btn>
          </div>
        </Modal>
      )}
      {showDevisForm && (
        <Modal title="📄 Nouvelle Maquette de Prix / Devis" onClose={()=>setShowDevisForm(false)} wide T={T}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Client *","client","text"],["Objet de la mission *","objet","text"],["Montant HT (FCFA) *","montantHT","number"],["Remise (%)","remise","number"],["Taux TVA (%)","taux","number"],["Validité (jours)","validiteJours","number"],["Dossier lié","dossierRef","text"]].map(([l,k,type])=>(
              <div key={k} style={["objet"].includes(k)?{gridColumn:"span 2"}:{}}>
                <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>{l}</label>
                {k==="dossierRef" ? (
                  <select value={devisForm[k]} onChange={e=>{
                    const d = dossiers.find(x=>x.ref===e.target.value);
                    setDevisForm(f=>({
                      ...f,
                      dossierId:d?.id||"",
                      dossierRef:e.target.value,
                      client:d?.client||f.client,
                      objet:d?.objet||f.objet,
                      montantHT:d?.amount != null ? String(d.amount) : f.montantHT,
                      processus:d?.process||f.processus
                    }));
                  }} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="">— Aucun —</option>
                    {dossiers.filter(d => d.status !== "SUPPRIME").map(d => (
                      <option key={d.id} value={d.ref}>{d.ref} — {d.client}</option>
                    ))}
                  </select>
                ) : (
                  <input type={type} value={devisForm[k]} onChange={e=>setDevisForm(f=>({...f,[k]:e.target.value}))}
                    style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                )}
              </div>
            ))}
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Processus</label>
              <select value={devisForm.processus} onChange={e=>setDevisForm(f=>({...f,processus:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                {["O01","O02","O03","S01","S03"].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Notes / Conditions</label>
              <textarea value={devisForm.notes} onChange={e=>setDevisForm(f=>({...f,notes:e.target.value}))} rows={2}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box",resize:"vertical"}} />
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
            <Btn variant="ghost" size="sm" onClick={()=>setShowDevisForm(false)}>Annuler</Btn>
            <Btn variant="gold" size="sm" onClick={handleCreateDevis}>📄 Créer maquette</Btn>
          </div>
        </Modal>
      )}
      {showSigModal && (
        <SignaturePINModal T={T} currentUser={currentUser} docLabel={showSigModal.ref}
          onSign={sig=>{
            saveFactures(factures.map(x=>x.id===showSigModal.id?{...x,signature:sig}:x));
            setShowSigModal(null);
            setNotifications(p=>[{id:"N"+Date.now(),icon:"✍️",message:`Facture ${showSigModal.ref} signée`,at:new Date().toISOString(),read:false},...p]);
          }}
          onClose={()=>setShowSigModal(null)} />
      )}
    </div>
  );
}



export function ConventionModule({ T, currentUser, dossiers=[], partners=[], users=[], setNotifications=_noop, setTaches=_noop, setDossiers=_noop }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const isLvl3 = currentUser?.level >= 3;
  const isLvl4 = currentUser?.level >= 4;
  
  const [conventions, setConventions] = React.useState(() => {
    try { return JSON.parse(_lsGet("gc-conventions") || "[]"); } catch { return []; }
  });
  const saveConventions = (data) => {
    setConventions(data);
    try { _lsSet("gc-conventions", JSON.stringify(data.slice(0,200))); dsSave("gc-conventions", data.slice(0,200)).catch(err => gcToast.syncError('', err)); } catch(_) {}
  };
  useRemoteSync({ 'gc-conventions': setConventions });

  const convInit = {
    client:"", objet:"", processus:"O02", typeConvention:"LETTRE_MISSION",
    dateDebut:"", dateFin:"", honoraireHT:"", conditions:"paiement à 30 jours",
    dossierRef:"", partnerRef:"", notes:"", status:"BROUILLON"
  };
  const [form, setForm] = React.useState(convInit);
  const [showForm, setShowForm] = React.useState(false);
  const [filter, setFilter] = React.useState("ALL");
  const [showPrint, setShowPrint] = React.useState(null);
  const [showSigModal, setShowSigModal] = React.useState(null);

  // Accès réservé au niveau 3+
  if (!isLvl3) {
    return (
      <div style={{background:T?.surface2,borderRadius:10,padding:40,textAlign:"center"}}>
        <div style={{color:T?.textMuted,fontSize:14,fontWeight:700,marginBottom:10}}>🔒 Accès Refusé</div>
        <div style={{color:T?.textDim,fontSize:12}}>Vous devez avoir au minimum le niveau 3 pour accéder aux conventions de mission.</div>
      </div>
    );
  }

  const TYPES = [
    {k:"LETTRE_MISSION", l:"Lettre de mission"},
    {k:"CONVENTION_PRESTATION", l:"Convention de prestation"},
    {k:"AVENANT", l:"Avenant"},
    {k:"CONTRAT_CONSEIL", l:"Contrat de conseil"},
  ];
  const STATUS_CONV = {
    BROUILLON:   {l:"Brouillon",   c:"#6B7280"},
    EMISE:       {l:"Émise",       c:"#3B82F6"},
    SIGNEE:      {l:"Signée",      c:"#22C55E"},
    EXPIREE:     {l:"Expirée",     c:"#EF4444"},
    RESILIEE:    {l:"Résiliée",    c:"#C41E3A"}};

  const handleSave = () => {
    if (!form.client || !form.objet) { gcAlert("Client et objet requis."); return; }
    const ref = `CONV-${form.processus}-${String(Date.now()).slice(-5)}/${new Date().getFullYear()}`;
    const entry = { ...form, id:"CONV-"+Date.now(), ref, createdBy:currentUser.id, createdByName:currentUser.name, createdAt:new Date().toISOString() };
    saveConventions([entry, ...conventions]);
    const now = new Date().toISOString();
    setNotifications(p=>[{id:"N"+Date.now(),icon:"📜",message:`Convention créée : ${ref} — ${form.client}`,at:now,read:false},...p]);
    // v116 — Synergies: tâche de suivi + lien dossier + notification DG/responsables
    if (setTaches) {
      const dossierLie = dossiers.find(d => d.client === form.client || d.id === form.dossierId);
      setTaches(prev=>[{
        id:"T"+Date.now(), titre:`📜 Suivi convention — ${ref} — ${form.client}`,
        description:`Convention de mission créée.
Client : ${form.client}
Objet : ${form.objet}
Processus : ${form.processus}
Montant HT : ${form.honoraireHT||0} FCFA
Dossier lié : ${dossierLie?.ref||"—"}

Action requise : faire signer et archiver.`,
        status:"A_FAIRE", statut:"A_FAIRE", priority:"HAUTE",
        creatorId:currentUser.id, assigneeId:dossierLie?.assignedTo||currentUser.id,
        module:"conventions", type:"SUIVI_CONVENTION", dossierId:dossierLie?.id,
        deadline:form.dateEcheance||new Date(Date.now()+14*24*60*60*1000).toISOString().split("T")[0],
        createdAt:now, canCancel:false},...prev]);
    }
    // Notifier DG et responsables du processus
    const targets = (users||[]).filter(u => u.level >= 4 && (u.process===form.processus||(u.processes||[]).includes(form.processus)||u.level>=5));
    targets.forEach(u => { try { const k=`GC_SI_v12:notif:${u.id}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now()+u.id,icon:"📜",message:`📜 Nouvelle convention : ${ref} — ${form.client} — ${form.processus}`,at:now,read:false,module:"conventions"}); _lsSet(k,JSON.stringify(ex.slice(0,200))); } catch(_) {} });
    setForm(convInit); setShowForm(false);
  };

  const handleSign = (conv, sig) => {
    const now = new Date().toISOString();
    saveConventions(conventions.map(c => c.id===conv.id ? {...c, status:"SIGNEE", signature:sig, signedAt:sig.signedAt} : c));
    setShowSigModal(null);
    setNotifications(p=>[{id:"N"+Date.now(),icon:"✍️",message:`Convention ${conv.ref} signée par ${sig.signedByName}`,at:now,read:false},...p]);
    // v116 — Synergy: marquer tâche suivi comme traitée + notifier créateur + archiver
    if (setTaches) setTaches(prev => { const _u=prev.map(t=>t.type==="SUIVI_CONVENTION"&&t.titre?.includes(conv.ref)?{...t,status:"TERMINE",statut:"TERMINE",completedAt:now}:t); dsSave("taches",_u); return _u; });
    // Créer tâche d'archivage
    if (setTaches) setTaches(prev=>[{
      id:"T"+Date.now(), titre:`🗃️ Archiver convention signée — ${conv.ref}`,
      description:`La convention ${conv.ref} a été signée par ${sig.signedByName}.
Client : ${conv.client}
Action : Archiver dans Gestion Documentaire → Documents.`,
      status:"A_FAIRE", statut:"A_FAIRE", priority:"NORMALE",
      creatorId:currentUser.id, assigneeId:currentUser.id,
      module:"conventions", type:"ARCHIVAGE_CONVENTION",
      deadline:new Date(Date.now()+3*24*60*60*1000).toISOString().split("T")[0],
      createdAt:now, canCancel:false},...prev]);
    // Notifier le créateur si différent du signataire
    if (conv.createdBy && conv.createdBy !== currentUser.id) {
      try { const k=`GC_SI_v12:notif:${conv.createdBy}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now(),icon:"✍️",message:`✅ Convention ${conv.ref} signée par ${sig.signedByName}`,at:now,read:false,module:"conventions"}); _lsSet(k,JSON.stringify(ex.slice(0,200))); } catch(_) {}
    }
  };

  const printConvention = (c) => {
    const tva = parseFloat(c.honoraireHT||0)*0.18;
    const ttc = parseFloat(c.honoraireHT||0)+tva;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${c.ref}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;color:#1a1a1a;font-size:13px}
    .header{text-align:center;border-bottom:3px solid #0A1E4A;padding-bottom:20px;margin-bottom:30px}
    .logo{font-size:22px;font-weight:900;color:#0A1E4A;letter-spacing:1px}
    .subtitle{color:#C41E3A;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-top:4px}
    h1{color:#0A1E4A;font-size:17px;text-align:center;margin:20px 0;text-transform:uppercase;letter-spacing:1px}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0;padding:15px;border:1px solid #ddd;border-radius:6px}
    .section{margin:16px 0}.section-title{font-weight:900;color:#0A1E4A;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:8px;text-transform:uppercase;font-size:12px}
    .montant{background:#f8f8f8;border:1px solid #ddd;padding:12px;border-radius:6px;margin:10px 0}
    .signature-zone{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
    .sig-box{border-top:2px solid #0A1E4A;padding-top:10px;min-height:60px}
    .sig-label{font-size:11px;color:#555;font-weight:700;text-transform:uppercase}
    .sig-value{color:#22C55E;font-style:italic;font-size:11px;margin-top:4px}
    .footer{margin-top:40px;text-align:center;font-size:9px;color:#888;border-top:1px solid #ddd;padding-top:10px}
    </style></head><body>
    <div class="header"><div class="logo">⚖ GÉNIE CONSULTANT</div>
    <div class="subtitle">Cabinet Juridique, d'Affaires & de Conseil — Libreville, Gabon</div></div>
    <h1>${TYPES.find(t=>t.k===c.typeConvention)?.l||c.typeConvention}</h1>
    <p><strong>Référence :</strong> ${c.ref} &nbsp;|&nbsp; <strong>Date :</strong> ${new Date(c.createdAt).toLocaleDateString("fr-FR")}</p>
    <div class="parties">
      <div><div class="section-title">Le Cabinet</div><p>GÉNIE CONSULTANT<br>Cabinet Juridique & d'Affaires<br>Libreville, Gabon</p></div>
      <div><div class="section-title">Le Client</div><p>${c.client}</p></div>
    </div>
    <div class="section"><div class="section-title">Objet de la mission</div><p>${c.objet}</p></div>
    <div class="section"><div class="section-title">Processus / Domaine</div><p>${c.processus}</p></div>
    ${c.dateDebut||c.dateFin?`<div class="section"><div class="section-title">Durée</div><p>Du ${c.dateDebut?new Date(c.dateDebut).toLocaleDateString("fr-FR"):"-"} au ${c.dateFin?new Date(c.dateFin).toLocaleDateString("fr-FR"):"-"}</p></div>`:""}
    ${c.honoraireHT?`<div class="section montant"><div class="section-title">Honoraires</div>
    <p>Montant HT : <strong>${Number(c.honoraireHT).toLocaleString("fr-FR")} FCFA</strong><br>
    TVA (18%) : ${tva.toLocaleString("fr-FR")} FCFA<br>
    <strong>Montant TTC : ${ttc.toLocaleString("fr-FR")} FCFA</strong></p>
    <p>Conditions : ${c.conditions}</p></div>`:""}
    ${c.notes?`<div class="section"><div class="section-title">Clauses & Notes</div><p>${c.notes}</p></div>`:""}
    <div class="signature-zone">
      <div class="sig-box"><div class="sig-label">Pour le Cabinet — Génie Consultant</div>
      ${c.signature?`<div class="sig-value">${c.signature.sigDisplay}</div>`:`<br><br><p style="font-size:11px;color:#888">Signature & Cachet</p>`}</div>
      <div class="sig-box"><div class="sig-label">Pour le Client — ${c.client}</div><br><br><p style="font-size:11px;color:#888">Signature & Cachet</p></div>
    </div>
    <div class="footer">GÉNIE CONSULTANT — Libreville, Gabon — Document généré par le SI Génie Consultant v93</div>
    </body></html>`;
    const w = window.open("","_blank","width=800,height=900");
    if(w){w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),400);}
  };

  const filtered = conventions.filter(c => filter==="ALL" || c.status===filter);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>📜 Conventions & Lettres de Mission</div>
          <div style={{color:T.textMuted,fontSize:11}}>Générateur de conventions de prestation — {conventions.length} document(s)</div>
        </div>
        {isLvl3 && <Btn variant="primary" size="sm" onClick={()=>setShowForm(true)}>+ Nouvelle convention</Btn>}
      </div>

      {/* Filtres */}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {[["ALL","Toutes"],["BROUILLON","Brouillon"],["EMISE","Émises"],["SIGNEE","Signées"],["EXPIREE","Expirées"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilter(k)}
            style={{background:filter===k?"#0A1E4A":"transparent",border:`1px solid ${filter===k?"#0A1E4A":T.border}`,color:filter===k?"#fff":T.textMuted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:filter===k?700:400}}>
            {l} {k==="ALL"?`(${conventions.length})`:conventions.filter(c=>c.status===k).length>0?`(${conventions.filter(c=>c.status===k).length})`:""}
          </button>
        ))}
      </div>

      {/* Liste */}
      {filtered.length===0 ? (
        <div style={{background:T.surface2,borderRadius:10,padding:40,textAlign:"center",color:T.textMuted,fontSize:12}}>
          Aucune convention. Cliquez sur "+ Nouvelle convention" pour commencer.
        </div>
      ) : filtered.map(c => {
        const st = STATUS_CONV[c.status] || STATUS_CONV.BROUILLON;
        return (
          <div key={c.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{color:T.text,fontWeight:800,fontSize:12}}>{c.ref}</div>
                <div style={{color:T.textMuted,fontSize:10}}>{TYPES.find(t=>t.k===c.typeConvention)?.l} · {c.processus} · {c.client}</div>
                <div style={{color:T.textDim,fontSize:10,marginTop:2}}>{c.objet}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <span style={{background:st.c+"22",color:st.c,border:`1px solid ${st.c}44`,borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700}}>{st.l}</span>
                {c.honoraireHT&&<span style={{color:"#C9A84C",fontWeight:700,fontSize:10}}>{Number(c.honoraireHT).toLocaleString("fr-FR")} FCFA HT</span>}
              </div>
            </div>
            {c.signature && (
              <div style={{background:"#22C55E11",border:"1px solid #22C55E33",borderRadius:6,padding:"4px 10px",fontSize:10,color:"#22C55E",marginBottom:6}}>
                ✍️ {c.signature.sigDisplay}
              </div>
            )}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>printConvention(c)} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🖨️ Imprimer</button>
              {isLvl4 && c.status==="EMISE" && !c.signature && (
                <button onClick={()=>setShowSigModal(c)} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✍️ Signer</button>
              )}
              {isLvl4 && c.status==="BROUILLON" && (
                <button onClick={()=>saveConventions(conventions.map(x=>x.id===c.id?{...x,status:"EMISE"}:x))} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>📤 Émettre</button>
              )}
              {isLvl4 && (
                <button onClick={async () => {if(await gcConfirm("Supprimer ?")) { dsDeleteItemFromArray("gc-conventions",c.id); saveConventions(conventions.filter(x=>x.id!==c.id)); }}} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️</button>
              )}
            </div>
          </div>
        );
      })}

      {/* Formulaire création */}
      {showForm && (
        <Modal title="📜 Nouvelle Convention / Lettre de Mission" onClose={()=>setShowForm(false)} wide T={T}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Client *","client","text"],["Objet de la mission *","objet","text"],["Date début","dateDebut","date"],["Date fin","dateFin","date"],["Honoraires HT (FCFA)","honoraireHT","number"],["Conditions de paiement","conditions","text"]].map(([l,k,type])=>(
              <div key={k} style={k==="objet"?{gridColumn:"span 2"}:{}}>
                <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>{l}</label>
                <input type={type} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
              </div>
            ))}
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Type de convention</label>
              <select value={form.typeConvention} onChange={e=>setForm(f=>({...f,typeConvention:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                {TYPES.map(t=><option key={t.k} value={t.k}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Processus</label>
              <select value={form.processus} onChange={e=>setForm(f=>({...f,processus:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                {["O01","O02","O03","S01","S03","P01","P02","P03"].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Dossier lié</label>
              <select value={form.dossierRef} onChange={e=>setForm(f=>({...f,dossierRef:e.target.value}))}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                <option value="">— Aucun —</option>
                {dossiers.slice(0,50).map(d=><option key={d.id} value={d.ref}>{d.ref} — {d.client}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Clauses & Notes spéciales</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box",resize:"vertical"}} />
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
            <Btn variant="ghost" size="sm" onClick={()=>setShowForm(false)}>Annuler</Btn>
            <Btn variant="primary" size="sm" onClick={handleSave}>💾 Enregistrer</Btn>
          </div>
        </Modal>
      )}
      {showSigModal && (
        <SignaturePINModal T={T} currentUser={currentUser} docLabel={showSigModal.ref} onSign={sig=>handleSign(showSigModal,sig)} onClose={()=>setShowSigModal(null)} />
      )}
    </div>
  );
}



export function PaieSimulateur({ T, users=[], currentUser, setNotifications=_noop, allUsers=[] }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  // v118 — Charger le salaire de base défaut depuis la config SIRH
  const _sirhCfgPaie = (() => { try { return {...{salaireBaseDefaut:200000}, ...JSON.parse(_lsGet("gc-sirh-global-config")||"{}")}; } catch(_) { return {salaireBaseDefaut:200000}; } })();
  const [form, setForm] = useState({ userId:"", brut:String(_sirhCfgPaie.salaireBaseDefaut), avantages:"", retenues:"", periode:"" });
  const [result, setResult] = useState(null);
  const [transferDone, setTransferDone] = useState(false);
  const [showTaux, setShowTaux] = useState(false);
  const [showPresenceImpact, setShowPresenceImpact] = useState(false);

  const getPresenceImpact = (userId, periode) => {
    try {
      const presences = JSON.parse(_lsGet("gc-sirh-presences")||"[]");
      const leaves = JSON.parse(_lsGet("gc-sirh-leaves")||"[]");
      if (!userId || !periode) return null;
      const [yr, mo] = (periode||"").split("-").map(Number);
      if (!yr || !mo) return null;
      const monthStr = `${yr}-${String(mo).padStart(2,"0")}`;
      const myPres = presences.filter(p => p.userId === userId && p.date?.startsWith(monthStr));
      const myLeaves = leaves.filter(l => l.userId === userId && l.statut==="APPROUVE" && (l.debut?.startsWith(monthStr)||l.fin?.startsWith(monthStr)));
      const daysInMonth = new Date(yr, mo, 0).getDate();
      const workDays = Math.round(daysInMonth * 5/7);
      const presentDays = myPres.filter(p=>["PRESENT","EN_POSTE","MISSION","TELETRAVAIL"].includes(p.statut)).length;
      const absentDays = workDays - presentDays - myLeaves.reduce((a,l)=>{
        const nb=l.debut&&l.fin?Math.ceil((new Date(l.fin)-new Date(l.debut))/86400000)+1:0;
        return a+nb;
      },0);
      const totalRetardMin = myPres.reduce((a,p)=>{
        const retM = p.retardMin||(p.arrivee>"09:00"?(()=>{const[h,m]=(p.arrivee||"09:00").split(":").map(Number);return Math.max(0,(h*60+m)-540);})():0);
        return a+retM;
      },0);
      const totalHSupMin = myPres.reduce((a,p)=>{
        let dm=p.dureeMin||0;
        if(!dm&&p.arrivee&&p.depart){const[ah,am]=p.arrivee.split(":").map(Number);const[dh,ms]=p.depart.split(":").map(Number);dm=Math.max(0,(dh*60+ms)-(ah*60+am)-(p.pause||60));}
        return a+Math.max(0,dm-480);
      },0);
      return { workDays, presentDays, absentDays:Math.max(0,absentDays), totalRetardMin, totalHSupMin, myPres };
    } catch (_) { return null; }
  };

  const [taux, setTaux] = useState(() => {
    try { return JSON.parse(_lsGet("gc-paie-taux") || "null") || {
      cnss_sal:    2.5,   // % salarié
      cnss_pat:    17.5,  // % patronal
      cnamgs_sal:  1.5,   // % salarié CNAMGS
      cnamgs_pat:  4.1,   // % patronal
      irpp_seuil1: 150000, irpp_t1: 0,     // 0% jusqu'à 150 000
      irpp_seuil2: 600000, irpp_t2: 5,     // 5% de 150k à 600k
      irpp_seuil3: 1500000,irpp_t3: 15,    // 15% de 600k à 1,5M
      irpp_t4:     35,                      // 35% au-delà de 1,5M
    }; } catch (_) { return { cnss_sal:2.5, cnss_pat:17.5, cnamgs_sal:1.5, cnamgs_pat:4.1, irpp_seuil1:150000, irpp_t1:0, irpp_seuil2:600000, irpp_t2:5, irpp_seuil3:1500000, irpp_t3:15, irpp_t4:35 }; }
  });
  const saveTaux = (updated) => {
    setTaux(updated);
    try { _lsSet("gc-paie-taux", JSON.stringify(updated)); dsSave("gc-paie-taux",updated).catch(err => gcToast.syncError('', err)); } catch (_) {}
  };

  // BUG FIX #11  -  calcIRPP was applying a flat rate to the ENTIRE base (e.g. 35% on 2M FCFA),
  // instead of progressive brackets. Replaced with the correct progressive method per OHADA/Gabon.
  // Now delegates to gcCalcIRPP (defined at top of file) which iterates tranches properly.
  const calcIRPP = (base) => gcCalcIRPP(Math.max(0, base));

  const calcPaie = () => {
    const brut=parseFloat(form.brut)||0, avantages=parseFloat(form.avantages)||0, retenues_man=parseFloat(form.retenues)||0;
    const presImpact = getPresenceImpact(form.userId, form.periode);
    const heureValeur = brut > 0 ? Math.round(brut / (22*8)) : 0;
    const deductionRetard = presImpact ? Math.round((presImpact.totalRetardMin/60) * heureValeur * 0.5) : 0; // 50% du taux horaire
    const deductionAbsence = presImpact ? Math.round(presImpact.absentDays * 8 * heureValeur) : 0;
    const bonusHSup = presImpact ? Math.round((presImpact.totalHSupMin/60) * heureValeur * 1.25) : 0; // 25% maj H.Sup
    const retenues = retenues_man + deductionRetard + deductionAbsence;
    const avantages_total = avantages + bonusHSup;
    const brutTotal = brut + avantages_total;
    const cnss_sal   = Math.round(brutTotal * (taux.cnss_sal/100));
    const cnss_pat   = Math.round(brutTotal * (taux.cnss_pat/100));
    const cnamgs_sal = Math.round(brutTotal * (taux.cnamgs_sal/100));
    const cnamgs_pat = Math.round(brutTotal * (taux.cnamgs_pat/100));
    const baseIRPP   = Math.max(0, brutTotal - cnss_sal - cnamgs_sal - Math.round(brutTotal * 0.20)); // BUG FIX #12 — abattement forfaitaire 20% manquant (OHADA Gabon)
    const irpp       = Math.round(calcIRPP(baseIRPP));
    const net        = brutTotal - cnss_sal - cnamgs_sal - irpp - retenues;
    const coutTotal  = brutTotal + cnss_pat + cnamgs_pat;
    setResult({
      brut, avantages:avantages_total, brutTotal, cnss_sal, cnss_pat, cnamgs_sal, cnamgs_pat,
      irpp, retenues, net:Math.round(net), coutTotal, baseIRPP, empId:form.userId,
      presImpact, deductionRetard, deductionAbsence, bonusHSup, heureValeur, periode:form.periode
    });
    setTransferDone(false);
  };

  const handleTransferFinance = () => {
    if (!result) return;
    const emp = users.find(u=>u.id===result.empId);
    const financeUsers = (allUsers||users).filter(u => u.level>=4 && (u.process==="S01"||u.processes?.includes("S01")) && !u.isAdmin && !u.blocked);
    if (!financeUsers.length) { gcAlert("Aucun responsable Finance (S01, niv.4+) trouvé dans le système."); return; }
    const ts = new Date().toISOString();
    const detail = `👤 Collaborateur : ${emp?.name||result.empId}\n💼 Salaire brut : ${result.brut.toLocaleString("fr-FR")} FCFA\n➕ Avantages : ${result.avantages.toLocaleString("fr-FR")} FCFA\n📊 Brut total : ${result.brutTotal.toLocaleString("fr-FR")} FCFA\n\n🔻 PRÉLÈVEMENTS SALARIÉ :\n  • CNSS (${taux.cnss_sal}%) : -${result.cnss_sal.toLocaleString("fr-FR")} FCFA\n  • CNAMGS (${taux.cnamgs_sal}%) : -${result.cnamgs_sal.toLocaleString("fr-FR")} FCFA\n  • IRPP : -${result.irpp.toLocaleString("fr-FR")} FCFA\n  • Retenues diverses : -${result.retenues.toLocaleString("fr-FR")} FCFA\n\n💰 NET À PAYER : ${result.net.toLocaleString("fr-FR")} FCFA\n\n🏢 CHARGES PATRONALES :\n  • CNSS Patron (${taux.cnss_pat}%) : ${result.cnss_pat.toLocaleString("fr-FR")} FCFA\n  • CNAMGS Patron (${taux.cnamgs_pat}%) : ${result.cnamgs_pat.toLocaleString("fr-FR")} FCFA\n\n🧮 COÛT TOTAL EMPLOYEUR : ${result.coutTotal.toLocaleString("fr-FR")} FCFA`;
    if (setNotifications) {
      setNotifications(prev => [
        {id:"N"+Date.now(), icon:"💰", message:`📨 Fiche de paie transmise — ${emp?.name||result.empId} | Net : ${result.net.toLocaleString("fr-FR")} FCFA | De : RH S03`, at:ts, read:false, module:"paie", targetProcess:"S01", paieDetail:detail},
        ...prev
      ]);
    }
    try {
      const key = "gc-paie-transferts";
      const existing = JSON.parse(_lsGet(key)||"[]");
      existing.unshift({ id:`PAY-${Date.now()}`, empId:result.empId, empName:emp?.name||result.empId, ...result, taux, at:ts, by:currentUser?.id||"RH", detail });
      _lsSet(key, JSON.stringify(existing.slice(0,200)));
    } catch (_) {}
    setTransferDone(true);
    playSound("success");
    gcAlert(`✅ Fiche de paie transmise à ${financeUsers.map(u=>u.name).join(", ")} (Finance S01).\n\nLe responsable Finance trouvera le détail dans ses Alertes.`);
  };

  const empName = users.find(u=>u.id===form.userId)?.name || "—";

  return (
    <div>
      {/* ── Bouton configuration des taux ── */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <button onClick={()=>setShowTaux(!showTaux)} style={{background:showTaux?"#A855F722":T.surface2,border:"1px solid #A855F744",color:"#A855F7",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>
          ⚙️ {showTaux?"Masquer":"Configurer les taux"} CNSS / CNAMGS / IRPP
        </button>
      </div>

      {/* ── Configuration des taux (collapsible) ── */}
      {showTaux && (
        <div style={{background:"#A855F710",border:"1px solid #A855F733",borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:12}}>⚙️ Paramétrage des taux de prélèvement (Droit gabonais)</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
            {[
              ["cnss_sal",   "CNSS Salarié (%)",    "2.5"],
              ["cnss_pat",   "CNSS Patronal (%)",   "17.5"],
              ["cnamgs_sal", "CNAMGS Salarié (%)",  "1.5"],
              ["cnamgs_pat", "CNAMGS Patronal (%)","4.1"],
            ].map(([k,l,ph])=>(
              <div key={k}>
                <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{l}</label>
                <input type="number" step="0.1" value={taux[k]} onChange={e=>saveTaux({...taux,[k]:parseFloat(e.target.value)||0})}
                  style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11}} placeholder={ph} />
              </div>
            ))}
          </div>
          <div style={{color:T.textMuted,fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:0.8}}>Tranches IRPP</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[
              ["irpp_t1","Taux T1 (%)","0"],["irpp_seuil2","Seuil T2 (FCFA)","600000"],
              ["irpp_t2","Taux T2 (%)","5"], ["irpp_seuil3","Seuil T3 (FCFA)","1500000"],
              ["irpp_t3","Taux T3 (%)","15"],["irpp_t4","Taux T4 % (>seuil3)","35"],
            ].map(([k,l,ph])=>(
              <div key={k}>
                <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{l}</label>
                <input type="number" value={taux[k]} onChange={e=>saveTaux({...taux,[k]:parseFloat(e.target.value)||0})}
                  style={{width:"100%",background:T.surface3,border:"1px solid #A855F744",borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11}} placeholder={ph} />
              </div>
            ))}
          </div>
          <div style={{marginTop:8,fontSize:10,color:T.textDim}}>💡 Les modifications sont sauvegardées automatiquement et s'appliquent à tous les calculs.</div>
        </div>
      )}

      {/* ── Formulaire de calcul ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <div>
          <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Collaborateur</label>
          <select value={form.userId} onChange={e=>{
            const uid = e.target.value;
            const emp = users.find(u=>u.id===uid);
            // FIX v151 — Auto-remplir le salaire brut depuis la fiche SIRH du collaborateur
            const defaultBrut = emp?.salaireBase ? String(emp.salaireBase) : String(_sirhCfgPaie.salaireBaseDefaut);
            setForm(f=>({...f,userId:uid,brut:defaultBrut}));
          }} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
            <option value="">— Sélectionner —</option>
            {users.filter(_activeUser).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Période (mois)</label>
          <input type="month" value={form.periode} onChange={e=>setForm(f=>({...f,periode:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
        </div>
        {[["brut","Salaire brut (FCFA)"],["avantages","Avantages en nature"],["retenues","Retenues manuelles"]].map(([k,l])=>(
          <div key={k}>
            <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>{l}</label>
            <input type="number" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}} placeholder="0" />
          </div>
        ))}
      </div>
      {/* ── Aperçu impact présences ── */}
      {form.userId && form.periode && (()=>{
        const pi = getPresenceImpact(form.userId, form.periode);
        if (!pi) return null;
        const brut = parseFloat(form.brut)||0;
        const hv = brut > 0 ? Math.round(brut/(22*8)) : 0;
        const dedRetard = Math.round((pi.totalRetardMin/60)*hv*0.5);
        const dedAbs = Math.round(pi.absentDays*8*hv);
        const bonusHS = Math.round((pi.totalHSupMin/60)*hv*1.25);
        return (
          <div style={{background:"#A855F711",border:"1px solid #A855F733",borderRadius:8,padding:"8px 12px",marginBottom:10}}>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
              <span style={{color:"#A855F7",fontWeight:800,fontSize:11}}>⏱️ Impact Présences — {form.periode}</span>
              <button onClick={()=>setShowPresenceImpact(v=>!v)} style={{background:"none",border:"1px solid #A855F744",color:"#A855F7",borderRadius:5,padding:"1px 8px",cursor:"pointer",fontSize:9}}>{showPresenceImpact?"▲ Masquer":"▼ Détails"}</button>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <span style={{background:"#22C55E15",color:"#22C55E",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700}}>✅ {pi.presentDays}j présent</span>
              {pi.absentDays>0&&<span style={{background:"#EF444415",color:"#EF4444",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700}}>❌ {pi.absentDays}j absent → -{dedAbs.toLocaleString("fr-FR")} FCFA</span>}
              {pi.totalRetardMin>0&&<span style={{background:"#F9741615",color:"#F97416",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700}}>⏰ {pi.totalRetardMin}min retard → -{dedRetard.toLocaleString("fr-FR")} FCFA</span>}
              {pi.totalHSupMin>0&&<span style={{background:"#22C55E15",color:"#22C55E",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700}}>⚡ {Math.floor(pi.totalHSupMin/60)}h{String(pi.totalHSupMin%60).padStart(2,"0")} H.Sup → +{bonusHS.toLocaleString("fr-FR")} FCFA</span>}
            </div>
            {showPresenceImpact && pi.myPres.length>0 && (
              <div style={{marginTop:8,maxHeight:140,overflowY:"auto"}}>
                {pi.myPres.map(p=>{
                  const dm=p.dureeMin||0;
                  return <div key={p.id} style={{display:"flex",gap:8,padding:"3px 0",borderBottom:`1px solid #A855F722`,fontSize:9,color:T.textMuted}}>
                    <span style={{fontFamily:"monospace",width:80}}>{p.date}</span>
                    <span style={{width:60}}>{p.arrivee||"—"} → {p.depart||"—"}</span>
                    <span style={{width:40}}>{dm>0?Math.floor(dm/60)+"h"+String(dm%60).padStart(2,"0"):"—"}</span>
                    <span style={{flex:1,color:p.statut==="ABSENT"?"#EF4444":p.retardMin>0?"#F97416":"#22C55E"}}>{p.statut}{p.motif?` · ${p.motif}`:""}</span>
                  </div>;
                })}
              </div>
            )}
          </div>
        );
      })()}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={calcPaie} style={{background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontWeight:800,fontSize:12}}>🧮 Calculer le bulletin</button>
        {result && !transferDone && (
          <button onClick={handleTransferFinance} style={{background:"linear-gradient(135deg,#C9A84C,#B8860B)",border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📨 Transférer à Finance (S01)
          </button>
        )}
        {/* Bouton print fiche de paie */}
        {result && (
          <button onClick={()=>{
            const w = window.open("","_blank","width=600,height=800");
            const empNm = empName || "—";
            const periodeStr = result.periode || new Date().toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bulletin de paie — ${empNm}</title>
<style>body{font-family:'Segoe UI',sans-serif;padding:24px;max-width:580px;margin:auto;color:#111}
h2{color:#6B21A8;border-bottom:2px solid #6B21A8;padding-bottom:6px}
.header{display:flex;justify-content:space-between;background:#f5f3ff;padding:12px 16px;border-radius:8px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
th,td{padding:7px 10px;border:1px solid #e2e8f0;text-align:left}
th{background:#f8f7ff;font-weight:700;font-size:12px;color:#6B21A8}
.net{background:#f0fdf4;color:#15803d;font-weight:900;font-size:16px}
.total{background:#faf5ff;color:#6B21A8;font-weight:700}
.footer{margin-top:16px;padding:10px;background:#f1f5f9;border-radius:6px;font-size:11px;color:#64748b}
@media print{button{display:none}}</style></head><body>
<h2>📊 Bulletin de Paie — Génie Consultant</h2>
<div class="header">
  <div><strong>${empNm}</strong><br><span style="font-size:12px;color:#666">${users.find?.(u=>u.id===form.userId)?.dept||"—"} · Niv.${users.find?.(u=>u.id===form.userId)?.level||"—"}</span></div>
  <div style="text-align:right"><strong>${periodeStr}</strong><br><span style="font-size:11px;color:#666">Réf: PAY-${Date.now().toString().slice(-6)}</span></div>
</div>
<table>
<tr><th>Libellé</th><th>Montant (FCFA)</th></tr>
<tr><td>Salaire brut de base</td><td>${(parseFloat(form.brut)||0).toLocaleString("fr-FR")}</td></tr>
${parseFloat(form.avantages)>0?`<tr><td>Avantages en nature</td><td>+${parseFloat(form.avantages).toLocaleString("fr-FR")}</td></tr>`:""}
<tr><td>Brut total</td><td><strong>${(result.brutTotal||0).toLocaleString("fr-FR")}</strong></td></tr>
<tr><td>CNSS salarié (${taux.cnss_sal}%)</td><td>-${(result.cnss_sal||0).toLocaleString("fr-FR")}</td></tr>
<tr><td>CNAMGS salarié (${taux.cnamgs_sal}%)</td><td>-${(result.cnamgs_sal||0).toLocaleString("fr-FR")}</td></tr>
<tr><td>IRPP (progressif)</td><td>-${(result.irpp||0).toLocaleString("fr-FR")}</td></tr>
${parseFloat(form.retenues)>0?`<tr><td>Retenues diverses</td><td>-${parseFloat(form.retenues).toLocaleString("fr-FR")}</td></tr>`:""}
<tr class="net"><td>NET À PAYER</td><td>${(result.net||0).toLocaleString("fr-FR")} FCFA</td></tr>
<tr class="total"><td>Charges patronales (CNSS ${taux.cnss_pat}% + CNAMGS ${taux.cnamgs_pat}%)</td><td>${((result.cnss_pat||0)+(result.cnamgs_pat||0)).toLocaleString("fr-FR")}</td></tr>
<tr class="total"><td>Coût total employeur</td><td>${(result.coutTotal||0).toLocaleString("fr-FR")}</td></tr>
</table>
<div class="footer">Base IRPP : ${(result.baseIRPP||0).toLocaleString("fr-FR")} FCFA · Barème progressif IRPP (Gabon) · CNSS/CNAMGS droit gabonais du travail<br>
Génie Consultant — ${new Date().toLocaleDateString("fr-FR")} — Document confidentiel</div>
<br><button onclick="window.print()" style="background:#6B21A8;color:#fff;border:none;border-radius:6px;padding:9px 22px;cursor:pointer;font-weight:700;font-size:13px">🖨️ Imprimer</button>
</body></html>`);
            w.document.close();
          }} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>
            🖨️ Imprimer / PDF
          </button>
        )}
        {transferDone && <div style={{background:"#22C55E15",border:"1px solid #22C55E44",borderRadius:8,padding:"9px 14px",color:"#22C55E",fontSize:11,fontWeight:700}}>✅ Transféré au Responsable Finance</div>}
      </div>

      {result && (
        <div style={{background:"#A855F712",border:"1px solid #A855F733",borderRadius:12,padding:16}}>
          <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:12}}>📊 Bulletin de paie — {empName} {result.periode&&<span style={{fontSize:9,fontWeight:400,color:"#A855F755"}}>• {result.periode}</span>}</div>
          {result.presImpact && (result.bonusHSup>0||result.deductionAbsence>0||result.deductionRetard>0) && (
            <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:10}}>
              <div style={{color:"#3B82F6",fontWeight:700,marginBottom:4}}>⏱️ Ajustements présences inclus :</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {result.bonusHSup>0&&<span style={{color:"#22C55E"}}>⚡ H.Sup +{result.bonusHSup.toLocaleString("fr-FR")} FCFA</span>}
                {result.deductionAbsence>0&&<span style={{color:"#EF4444"}}>❌ Absences -{result.deductionAbsence.toLocaleString("fr-FR")} FCFA</span>}
                {result.deductionRetard>0&&<span style={{color:"#F97416"}}>⏰ Retards -{result.deductionRetard.toLocaleString("fr-FR")} FCFA</span>}
              </div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            {[
              {l:"Brut total",       v:result.brutTotal,   c:"#3B82F6", bold:false},
              {l:`CNSS Salarié (${taux.cnss_sal}%)`,  v:-result.cnss_sal,   c:"#F59E0B"},
              {l:`CNSS Patronal (${taux.cnss_pat}%)`, v:result.cnss_pat,    c:"#F97316"},
              {l:`CNAMGS Sal. (${taux.cnamgs_sal}%)`, v:-result.cnamgs_sal, c:"#EC4899"},
              {l:`CNAMGS Pat. (${taux.cnamgs_pat}%)`, v:result.cnamgs_pat,  c:"#EC4899"},
              {l:"IRPP",             v:-result.irpp,       c:"#EF4444"},
              {l:"Retenues diverses",v:-result.retenues,   c:"#F97316"},
              {l:"NET À PAYER",      v:result.net,         c:"#22C55E", bold:true},
              {l:"Coût total employer",v:result.coutTotal, c:"#8B5CF6"},
            ].map(item=>(
              <div key={item.l} style={{background:T.surface2,borderRadius:8,padding:"8px 10px",border:item.bold?`2px solid ${item.c}44`:`1px solid ${T.border}`}}>
                <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",fontWeight:700,marginBottom:2}}>{item.l}</div>
                <div style={{color:item.c,fontWeight:item.bold?900:700,fontSize:item.bold?15:12}}>{(item.v||0).toLocaleString("fr-FR")} FCFA</div>
              </div>
            ))}
          </div>
          <div style={{background:T.surface3,borderRadius:8,padding:"8px 12px",fontSize:10,color:T.textDim}}>
            Base IRPP après CNSS/CNAMGS/abattement 20% : {result.baseIRPP.toLocaleString("fr-FR")} FCFA · Calcul progressif OHADA {/* BUG FIX #12b — replaced misleading single-rate label */}
          </div>
        </div>
      )}
    </div>
  );
};

// FIX v143 — FiscalConfigPanel, ExportBackupPanel et helpers backup
// déplacés vers SIConfigPanels.jsx (configs système, pas Finance-spécifiques).
// Re-exports pour compatibilité totale avec les imports existants.
export { FiscalConfigPanel, ExportBackupPanel, gcBuildBackupPayload, gcSaveAutoBackup, gcLoadLatestAutoBackup, gcGetLatestAutoBackupMeta } from '../admin/SIConfigPanels.jsx';
export default function App() {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const [themeMode, setThemeMode] = useState(() => lsLoad("theme", "dark"));
  const [siLogoUrl, setSiLogoUrlState] = useState(() => lsLoad("siLogoUrl", null));
  const [siAppearance, setSiAppearanceState] = useState(() => lsLoad("siAppearance", {
    primaryColor: "#C41E3A",
    navyColor: "#0A1E4A",
    goldColor: "#C9A84C",
    accentColor: "#3B82F6",
    cabinetName: "GÉNIE CONSULTANT",
    cabinetSlogan: "Excellence · Intégrité · Performance",
    loginSubtitle: "Système d'Information Intégré",
    coverBg: "navy",
    fontScale: 1}));
  const [siCSSOverrides, setSiCSSOverridesState] = useState(() => lsLoad("siCSSOverrides", ""));

  const [siSystemDocs, setSiSystemDocsState] = useState(() => {
    try {
      const saved = _lsGet("gc-si-docs");
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = INITIAL_SI_SYSTEM_DOCS.map(init => {
          const found = parsed.find(d => d.id === init.id);
          return found ? { ...init, ...found } : init;
        });
        const customDocs = parsed.filter(d => !INITIAL_SI_SYSTEM_DOCS.find(i => i.id === d.id));
        return [...merged, ...customDocs];
      }
    } catch (_) {}
    return INITIAL_SI_SYSTEM_DOCS;
  });
  const setSiSystemDocs = useCallback((v) => {
    setSiSystemDocsState(prev => {
      const resolved = typeof v === "function" ? v(prev) : v;
      try { _lsSet("gc-si-docs", JSON.stringify(resolved.map(d=>({...d})))); dsSave("gc-si-docs",resolved.map(d=>({...d,dataUrl:d.dataUrl?"[STORED]":null}))).catch(err => gcToast.syncError('', err)); } catch (e) {
        try {
          _lsSet("gc-si-docs", JSON.stringify(resolved.map(d => ({ ...d, dataUrl: d.dataUrl ? "[STORED]" : null }))));
        } catch (_) {}
      }
      return resolved;
    });
  }, []);

  const [screen, setScreen] = useState(() => {
    try {
      const saved = _lsGet("gc-active-session");
      if (saved) {
        const s = JSON.parse(saved);
        // 🔐 Validation du token de session : si token invalide -> retour cover
        if (s?.userId && s?.screen && s?.sessionToken) {
          if (gcValidateSessionToken(s.sessionToken, s.userId)) return s.screen;
        }
      }
    } catch (_) {}
    return "cover";
  });
  // 🔐 isAdminMode n'est plus lu depuis localStorage, calculé depuis le user object
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [currentUser, setCurrentUserState] = useState(() => {
    try {
      const s = JSON.parse(_lsGet("gc-active-session")||"null");
      if (s?.userId) {
        const users = JSON.parse(_lsGet("GC_SI_v12:users")||_lsGet("GC_SI_v11:users")||"null") || INITIAL_USERS;
        const u = users.find(u => u.id === s.userId) || null;
        // FIX v123 — Toujours supprimer 'password' en clair du state restauré
        if (u) {
          const { password: _p, ...safeU } = u;
          return safeU;
        }
        return null;
      }
    } catch (_) {}
    return null;
  });
  const setCurrentUser = (user) => {
    // FIX v123 — Toujours supprimer le champ 'password' en clair du state,
    // que passwordHash existe ou non. Le login fonctionne via gcVerifyPassword.
    let safeUser = null;
    if (user) {
      const { password: _p, ...rest } = user;
      safeUser = rest;
    }
    setCurrentUserState(safeUser);
    if (safeUser) {
      // 🔐 SÉCURITÉ: On ne stocke PLUS isAdminMode dans la session
      // Le niveau d'accès est recalculé depuis l'objet user chargé depuis les données.
      // On stocke un token de session pour détecter toute falsification.
      const sessionToken = gcGenerateSessionToken(safeUser.id);
      try {
        _lsSet("gc-active-session", JSON.stringify({
          userId: safeUser.id,
          screen: "app",
          sessionToken, // Token d'intégrité
          loginAt: new Date().toISOString()}));
      } catch (_) {}
    } else {
      try { _lsRm("gc-active-session"); } catch (_) {}
    }
  };
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [prodUsers, setProdUsers] = useState(() => lsLoad("users", INITIAL_USERS));
  const [prodDossiers, setProdDossiers] = useState(() => lsLoad("dossiers", INITIAL_DOSSIERS));
  const [prodTaches, setProdTaches] = useState(() => lsLoad("taches", INITIAL_TACHES));
  const [prodRdvs, setProdRdvs] = useState(() => lsLoad("rdvs", INITIAL_RDVS));
  const [prodPending, setProdPending] = useState(() => lsLoad("pendingApprovals", INITIAL_PENDING));
  const [prodPartners, setProdPartners] = useState(() => lsLoad("partners", INITIAL_PARTNERS));

  const [users, setUsersState] = useState(() => lsLoad("users", INITIAL_USERS));
  const [dossiers, setDossiersState] = useState(() => lsLoad("dossiers", INITIAL_DOSSIERS));
  const [taches, setTachesState] = useState(() => lsLoad("taches", INITIAL_TACHES));
  const [rdvs, setRdvsState] = useState(() => lsLoad("rdvs", INITIAL_RDVS));
  const [pendingApprovals, setPendingApprovalsState] = useState(() => lsLoad("pendingApprovals", INITIAL_PENDING));
  const [requireConnApproval, setRequireConnApprovalState] = useState(() => {
    try { return JSON.parse(_lsGet("gc-require-conn-approval") || "false"); } catch (_) { return false; }
  });
  const setRequireConnApproval = useCallback((v) => {
    setRequireConnApprovalState(v);
    try { _lsSet("gc-require-conn-approval", JSON.stringify(v)); dsSave("gc-require-conn-approval", v).catch(err => gcToast.syncError('', err)); } catch (_) {}
  }, []);
  const [pendingConnections, setPendingConnectionsState] = useState(() => {
    try { return JSON.parse(_lsGet("gc-pending-connections") || "[]"); } catch (_) { return []; }
  });
  const setPendingConnections = useCallback((updater) => {
    setPendingConnectionsState(prev => {
      const resolved = typeof updater === "function" ? updater(prev) : updater;
      try { _lsSet("gc-pending-connections", JSON.stringify(resolved)); dsSave("gc-pending-connections", resolved).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return resolved;
    });
  }, []);
  const [sessionLogs, setSessionLogs] = useState(() => { try { return JSON.parse(_lsGet("gc-session-logs")||"null") || INITIAL_SESSION_LOGS; } catch (_) { return INITIAL_SESSION_LOGS; } });

  // FIX v62: addSessionLog défini ici (App scope)  -  utilisé pour login/logout + passé en prop à SIApp
  // useCallback([], []) -> référence stable, évite re-fire des useEffect qui l'ont en deps
  const addSessionLog = useCallback((type, user, extra = {}) => {
    if (!user) return null;
    // FIX v85 — Mode incognito admin : ne pas journaliser les actions de l'admin
    try { if (user.isAdmin && JSON.parse(_lsGet("gc-admin-incognito")||"false")) return null; } catch(_) {}
    const at = new Date().toISOString();
    const device = (() => {
      const ua = navigator.userAgent;
      const browser = ua.includes("Edg") ? "Edge" : ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "Navigateur";
      const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : ua.includes("Android") ? "Android" : navigator.platform || "OS inconnu";
      return `${browser} / ${os}`;
    })();
    const logBase = {
      id: `SES-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      type, userId: user.id, userName: user.name, userRole: user.role,
      userLevel: user.level, userProcess: user.process || "—",
      at, device,
      ip: _gcCachedIp || "Récupération...",
      status: extra.status || "SUCCESS",
      reason: extra.reason || null};
    setSessionLogs(prev => {
      const updated = [logBase, ...prev].slice(0, 500);
      try { _lsSet("gc-session-logs", JSON.stringify(updated)); dsSave("gc-session-logs", updated).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return updated;
    });
    gcGetClientIp().then(ip => {
      if (ip !== logBase.ip) {
        setSessionLogs(prev => {
          const updated = prev.map(l => l.id === logBase.id ? { ...l, ip } : l);
          try { _lsSet("gc-session-logs", JSON.stringify(updated.slice(0, 500))); dsSave("gc-session-logs", updated.slice(0,500)).catch(err => gcToast.syncError('', err)); } catch (_) {}
          return updated;
        });
      }
    });
    return logBase;
   
// INTENTIONNEL : addSessionLog est un useCallback stable, setSessionLogs ne doit pas re-créer la fonction
  }, []);
  const [pendingAccountActions, setPendingAccountActions] = useState(() => { try { return JSON.parse(_lsGet("gc-account-actions")||"null") || INITIAL_ACCOUNT_ACTIONS; } catch (_) { return INITIAL_ACCOUNT_ACTIONS; } });

  const setPAA = useCallback((v) => {
    setPendingAccountActions(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      try { _lsSet("gc-account-actions", JSON.stringify(resolved)); dsSave("gc-account-actions", resolved).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return resolved;
    });
  }, []);

  const isDemoModeRef = useRef(isDemoMode);
  useEffect(() => { isDemoModeRef.current = isDemoMode; }, [isDemoMode]);

  // FIX v63 C2  -  Chargement async sécurisé des clés chiffrées au boot
  useEffect(() => {
    (async () => {
      try {
        const [secUsers, secDossiers, secTaches, secLogs] = await Promise.all([
          lsLoadSecure("users", null),
          lsLoadSecure("dossiers", null),
          lsLoadSecure("taches", null),
          lsLoadSecure("gc-session-logs", null),
        ]);
        if (secUsers !== null) { setProdUsers(secUsers); setUsersState(secUsers); }
        if (secDossiers !== null) { setProdDossiers(secDossiers); setDossiersState(secDossiers); }
        if (secTaches !== null) { setProdTaches(secTaches); setTachesState(secTaches); }
        if (secLogs !== null) setSessionLogs(secLogs);
      } catch (_) {}
    })();
   
// INTENTIONNEL : chargement sécurisé unique au boot (lsLoadSecure est stable)
  }, []);

  const setUsers = useCallback((v) => {
    setUsersState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdUsers(resolved); lsSave("users", resolved); }
      return resolved;
    });
  }, []);

  // FIX v123 — Migration mots de passe : hache tous les comptes avec 'password' en clair.
  // Inclut USR-ADM-000 et USR-DG-001 dont INITIAL_USERS utilise désormais 'password'.
  // Si un compte a déjà un passwordHash valide (64 hex chars), il n'est pas re-haché.
  React.useEffect(() => {
    (async () => {
      try {
        const currentUsers = lsLoad("users", INITIAL_USERS);
        const needsMigration = currentUsers.some(u => u.password && !u.passwordHash);
        if (!needsMigration) return;
        const migrated = await Promise.all(currentUsers.map(async (u) => {
          if (u.password && !u.passwordHash) {
            const hash = await gcHashPassword(u.password);
            const { password: _p, ...rest } = u;
            return { ...rest, passwordHash: hash };
          }
          return u;
        }));
        setUsers(migrated);
        console.info("[SI Génie v123] Migration mots de passe → hash effectuée");
      } catch(_) {}
    })();
   
// INTENTIONNEL : migration unique au boot
  }, []);

  // FIX v123 — Re-migration : si le contexte crypto a changé (ex: SHA-256 stocké mais
  // crypto.subtle indisponible maintenant), re-hacher les comptes par défaut avec les
  // mots de passe connus pour garantir la cohérence stockage↔vérification.
  React.useEffect(() => {
    (async () => {
      try {
        const defaultPwds = { "USR-ADM-000": "Admin@SI#2026!", "USR-DG-001": "DG@GenieSI#2026!" };
        const currentUsers = lsLoad("users", INITIAL_USERS);
        const defaultUsers = currentUsers.filter(u => defaultPwds[u.id] && u.passwordHash);
        if (defaultUsers.length === 0) return;
        // Vérifier si le hash actuel est cohérent avec gcHashPassword() courant
        let needsRehash = false;
        for (const u of defaultUsers) {
          const expected = await gcHashPassword(defaultPwds[u.id]);
          if (u.passwordHash !== expected) { needsRehash = true; break; }
        }
        if (!needsRehash) return;
        // Re-hacher avec le contexte crypto actuel
        const reHashed = await Promise.all(currentUsers.map(async (u) => {
          if (defaultPwds[u.id]) {
            const hash = await gcHashPassword(defaultPwds[u.id]);
            return { ...u, passwordHash: hash, password: undefined };
          }
          return u;
        }));
        setUsers(reHashed);
        console.info("[SI Génie v123] Re-migration comptes par défaut (contexte crypto)");
      } catch (_) {}
    })();
   
// INTENTIONNEL : re-migration unique au boot
  }, []);

  // FIX v123 — Sync currentUser quand passwordHash change (ex: changement via profil)
  React.useEffect(() => {
    if (currentUser && !isDemoMode) {
      const updated = users.find(u => u.id === currentUser.id);
      if (updated && (
        updated.passwordHash !== currentUser.passwordHash ||
        updated.passwordHistory !== currentUser.passwordHistory
      )) {
        const { password: _p, ...safeUpdated } = updated;
        setCurrentUserState(prev => ({
          ...prev,
          passwordHash: safeUpdated.passwordHash,
          passwordHistory: safeUpdated.passwordHistory}));
      }
    }
   
  }, [users]);

  const setDossiers = useCallback((v) => {
    setDossiersState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdDossiers(resolved); lsSave("dossiers", resolved); }
      return resolved;
    });
  }, []);
  const setTaches = useCallback((v) => {
    setTachesState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdTaches(resolved); lsSave("taches", resolved); }
      return resolved;
    });
  }, []);

  // ── Progression automatique des dossiers selon les tâches liées ───────────
  // Déclaré ICI — après setDossiers et setTaches (évite la TDZ const)
  // Quand les tâches changent de statut, recalcule le % d'avancement du dossier lié
  useEffect(() => {
    if (!taches?.length || !dossiers?.length) return;
    let hasChanges = false;
    const updated = dossiers.map(d => {
      if (["TERMINE","ARCHIVE","ANNULE"].includes(d.status)) return d;
      const linked = taches.filter(t => t.dossier === d.id);
      if (linked.length === 0) return d; // pas de tâches liées → pas de calcul auto
      const terminées = linked.filter(t => t.status === "TERMINÉ" || t.status === "TERMINE");
      const autoProgress = Math.round((terminées.length / linked.length) * 100);
      // Seulement mettre à jour si la différence ≥ 5% (évite les micro-updates)
      if (Math.abs((d.progress || 0) - autoProgress) >= 5) {
        hasChanges = true;
        return { ...d, progress: autoProgress, progressAuto: true, progressUpdatedAt: new Date().toISOString() };
      }
      return d;
    });
    if (hasChanges) setDossiers(updated);
   
// INTENTIONNEL : surveiller les tâches uniquement
  }, [taches]);
  const setRdvs = useCallback((v) => {
    setRdvsState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdRdvs(resolved); lsSave("rdvs", resolved); }
      return resolved;
    });
  }, []);
  const setPendingApprovals = useCallback((v) => {
    setPendingApprovalsState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdPending(resolved); lsSave("pendingApprovals", resolved); }
      return resolved;
    });
  }, []);

  const [partnersState, setPartnersStateRaw] = useState(() => lsLoad("partners", INITIAL_PARTNERS));
  const setPartnersGlobal = useCallback((v) => {
    setPartnersStateRaw(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if (!isDemoModeRef.current) { setProdPartners(resolved); lsSave("partners", resolved); }
      return resolved;
    });
  }, []);

  const [appHabilitations, setAppHabilitations] = useState(() => {
    try { return JSON.parse(_lsGet("gc-app-habilitations")||"[]"); } catch (_) { return []; }
  });
  const saveAppHabilitations = useCallback((v) => {
    setAppHabilitations(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      const resolvedJson = JSON.stringify(resolved);
      try { _lsSet("gc-app-habilitations", resolvedJson); } catch (_) {}
      if (resolvedJson !== JSON.stringify(prev)) {
        dsSave("gc-app-habilitations", resolved).catch(err => gcToast.syncError('', err));
      }
      return resolved;
    });
  }, []);

  const [appAccessCodes, setAppAccessCodes] = useState(() => {
    try { return JSON.parse(_lsGet("gc-app-access-codes")||"[]"); } catch (_) { return []; }
  });
  const saveAppAccessCodes = useCallback((v) => {
    setAppAccessCodes(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      try { _lsSet("gc-app-access-codes", JSON.stringify(resolved)); dsSave("gc-app-access-codes", resolved).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return resolved;
    });
  }, []);

  useEffect(() => { lsSave("theme", themeMode); }, [themeMode]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.key) return;
      try {
        if (e.key === "GC_SI_v12:users") { const v = JSON.parse(e.newValue); if (v) { setUsersState(v); setProdUsers(v); } }
        if (e.key === "GC_SI_v12:dossiers") { const v = JSON.parse(e.newValue); if (v) { setDossiersState(v); setProdDossiers(v); } }
        if (e.key === "GC_SI_v12:taches") { const v = JSON.parse(e.newValue); if (v) { setTachesState(v); setProdTaches(v); } }
        if (e.key === "GC_SI_v12:rdvs") { const v = JSON.parse(e.newValue); if (v) { setRdvsState(v); setProdRdvs(v); } }
        if (e.key === "GC_SI_v12:pendingApprovals") { const v = JSON.parse(e.newValue); if (v) { setPendingApprovalsState(v); setProdPending(v); } }
        if (e.key === "gc-session-logs") { const v = JSON.parse(e.newValue); if (v) setSessionLogs(v); }
        if (e.key === "gc-pending-connections") { const v = JSON.parse(e.newValue); if (v) setPendingConnectionsState(v); }
        if (e.key === "gc-require-conn-approval") { const v = JSON.parse(e.newValue); if (v !== null) setRequireConnApprovalState(v); }
      } catch (_) {}
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setSiLogoUrl = useCallback((v) => { setSiLogoUrlState(v); lsSave("siLogoUrl", v); }, []);
  const setSiAppearance = useCallback((v) => {
    setSiAppearanceState(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      lsSave("siAppearance", resolved);
      const root = document.documentElement;
      root.style.setProperty('--gc-primary', resolved.primaryColor || '#C41E3A');
      root.style.setProperty('--gc-navy', resolved.navyColor || '#0A1E4A');
      root.style.setProperty('--gc-gold', resolved.goldColor || '#C9A84C');
      root.style.setProperty('--gc-accent', resolved.accentColor || '#3B82F6');
      root.style.setProperty('--gc-font-scale', resolved.fontScale || 1);
      return resolved;
    });
  }, []);
  const setSiCSSOverrides = useCallback((v) => {
    setSiCSSOverridesState(v);
    lsSave("siCSSOverrides", v);
    let el = document.getElementById('gc-css-overrides');
    if (!el) { el = document.createElement('style'); el.id = 'gc-css-overrides'; document.head.appendChild(el); }
    el.textContent = v;
  }, []);

  // BUG FIX #5  -  deps array was empty [] so CSS vars were never updated on appearance changes
  useEffect(() => {
    const app = siAppearance;
    const root = document.documentElement;
    root.style.setProperty('--gc-primary', app.primaryColor || '#C41E3A');
    root.style.setProperty('--gc-navy', app.navyColor || '#0A1E4A');
    root.style.setProperty('--gc-gold', app.goldColor || '#C9A84C');
    root.style.setProperty('--gc-accent', app.accentColor || '#3B82F6');
    root.style.setProperty('--gc-font-scale', app.fontScale || 1);
    if (siCSSOverrides) {
      let el = document.getElementById('gc-css-overrides');
      if (!el) { el = document.createElement('style'); el.id = 'gc-css-overrides'; document.head.appendChild(el); }
      el.textContent = siCSSOverrides;
    }
  }, [siAppearance, siCSSOverrides]);

  const T = THEMES[themeMode];
  const toggleTheme = () => setThemeMode((m) => m === "dark" ? "light" : "dark");

  const isFirstTime = prodUsers.length <= 1;

  // 🔐 addSessionLog  -  IP réelle via gcGetClientIp() (Phase 0 v57)
  const handleLogin = (user) => {
    const status = user.accountStatus || "ACTIF";
    if (status === "SUSPENDU_PROVISOIRE" || status === "SUSPENDU_DEFINITIF" || status === "BLOQUE") {
      const cfg = ACCOUNT_STATUS_CONFIG[status] || {};
      const endDateStr = user.suspensionEndDate ? ` jusqu'au ${new Date(user.suspensionEndDate).toLocaleDateString("fr-FR")}` : "";
      addSessionLog("TENTATIVE", user, { status:"FAILED", reason:`Compte ${cfg.label}${endDateStr} — Motif : ${user.suspensionMotif||"Non précisé"}` });
      const suspMsg = `🚫 TENTATIVE COMPTE ${cfg.label?.toUpperCase()||"SUSPENDU"} : ${user.name} (${user.role}) a tenté de se connecter à ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}. Motif suspension : ${user.suspensionMotif||"Non précisé"}`;
      const rhMgUsers = (users||INITIAL_USERS).filter(u=>u.isAdmin||(u.process==="S03"&&u.level>=4)||(u.isMG||u.id==="USR-MG-001")); // BUG FIX #4 — 'usersState' was undefined; correct variable is 'users'
      rhMgUsers.forEach(u=>gcPushNotif(u.id,{id:"N"+Date.now()+u.id,icon:"🚫",message:suspMsg,at:new Date().toISOString(),read:false,module:"sessions"}));
      gcAlert(`🚫 Accès refusé\n\nVotre compte est actuellement : ${cfg.label}${endDateStr}\n\n📋 Motif : ${user.suspensionMotif||"Contactez la direction ou les RH pour plus d'informations."}\n\n🔒 Pour toute contestation, contactez : rh@genie-consultant.com`);
      return;
    }
    const log = addSessionLog("CONNEXION", user, { status: "SUCCESS" });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, lastLogin: log.at } : u));
    const updatedUser = { ...user, lastLogin: log.at };
    setCurrentUser(updatedUser);
    // 🔐 Session token d'intégrité (v57)  -  plus d'isAdminMode exposé
    const _st = gcGenerateSessionToken(updatedUser.id);
    try { _lsSet("gc-active-session", JSON.stringify({ userId: updatedUser.id, screen: "app", sessionToken: _st, loginAt: log.at })); } catch (_) {}
    setScreen("app");
    // ── Auto-messages contextuels à la connexion ──────────────────────────────
    // FIX v123 — setSystemMsgs n'existe pas dans le scope de App().
    // Les messages sont envoyés via gcPushNotif (cross-user LS) et SIApp les récupère.
    setTimeout(() => {
      const lvl = updatedUser.level || 1;
      if (updatedUser.isFirstLogin) {
        gcPushNotif(updatedUser.id, {
          id: "AUTO-WELCOME-"+updatedUser.id,
          icon: lvl >= 5 ? "👑" : lvl >= 4 ? "🎯" : "🌟",
          message: `Bienvenue ${updatedUser.name?.split(" ").slice(-1)[0]||""} ! Votre compte ${updatedUser.role} (Niv.${lvl}) est activé. Complétez votre profil.`,
          at: new Date().toISOString(), read: false, module: "profil"});
        gcPushNotif(updatedUser.id, {
          id: "AUTO-SEC-"+updatedUser.id,
          icon: "🔐",
          message: "Sécurité — Changez votre mot de passe par défaut : Profil → Sécurité.",
          at: new Date().toISOString(), read: false, module: "profil"});
      }
    }, 800);
  };

  const handleAccessDemo = () => {
    const demoAdmin = DEMO_USERS.find(u => u.id === "USR-ADM-000") || DEMO_USERS[0];
    setIsDemoMode(true);
    setUsersState(DEMO_USERS);
    setDossiersState(DEMO_DOSSIERS);
    setTachesState(DEMO_TACHES);
    setRdvsState(DEMO_RDVS);
    setPendingApprovalsState(DEMO_PENDING);
    setCurrentUser(demoAdmin);
    setIsAdminMode(true);
    setScreen("app");
  };

  const handleExitDemo = () => {
    setIsDemoMode(false);
    setUsersState(prodUsers);
    setDossiersState(prodDossiers);
    setTachesState(prodTaches);
    setRdvsState(prodRdvs);
    setPendingApprovalsState(prodPending);
    setCurrentUser(null);
    setIsAdminMode(false);
    setScreen("cover");
  };

  const handleLogout = () => {
    if (isDemoMode) { handleExitDemo(); return; }
    if (currentUser) addSessionLog("DECONNEXION", currentUser, { status: "MANUAL", reason: "Déconnexion manuelle" });
    try { _lsRm("gc-active-session"); } catch (_) {}
    setCurrentUserState(null);
    setIsAdminMode(false);
    setScreen("cover");
  };

  const handleCreateAccountSubmit = (data) => {
    const fn = USER_FUNCTIONS.find(f => f.value === data.func);
    const applicantName = `${data.prenom} ${data.nom}`.trim();
    // v75 — Anti-redondance : empêcher double soumission pour le même nom + email
    const fingerprint = `${applicantName}::${data.email||data.func}`;
    const arCheck = gcAntiRedondance.checkAndRegister("CREATION_COMPTE", fingerprint, "LOGIN_FORM");
    if (!arCheck.allowed) {
      gcAlert(`⚠️ Une demande de création de compte pour "${applicantName}" est déjà en cours de traitement.\n\nSoumise le : ${new Date(arCheck.existing.at).toLocaleString("fr-FR")}\n\nVeuillez attendre le traitement avant de soumettre à nouveau.`);
      return;
    }
    const newPending = {
      id: `APPRO-${Date.now()}`,
      type: "CREATION_COMPTE",
      applicant: `${data.prenom} ${data.nom}`,
      // FIX v126 — champs requis par SIApp useEffect pour créer le compte
      prenom: data.prenom || "",
      nom: data.nom || "",
      function: data.func,
      functionLabel: fn?.label || data.func,
      processS03: fn?.process || "O01",
      process: fn?.process || "O01",       // alias attendu par SIApp
      processes: [fn?.process || "O01"],   // alias attendu par SIApp
      levelTarget: fn?.level || 2,
      level: fn?.level || 2,               // alias attendu par SIApp
      dept: fn?.dept || "",
      submittedAt: new Date().toISOString(),
      status: "ATTENTE_RH",
      approvals: { rh: null, conformite: null, dg: null },
      generatedId: data.genId,
      alertsSent: 0,
      tel: data.tel || "",
      email: data.email || "",
      adresse: data.adresse || "",
      profil: data.profil || "",
      sexe: data.sexe || "",
      sitMatrimoniale: data.sitMatrimoniale || "",
      situationMatrimoniale: data.sitMatrimoniale || "", // alias attendu par SIApp
      nationalite: data.nationalite || "Gabonaise",
      uploadedDocs: data.uploadedDocs || {},
      source: "LOGIN_DEMANDE",
      notifsSent: { rh: false, conformite: false, dg: false }};
    setPendingApprovals((prev) => [...prev, newPending]);
    const creationMsg = `👤 NOUVELLE DEMANDE COMPTE : ${newPending.applicant} — Fonction : ${newPending.functionLabel||newPending.function}. Processus d'approbation démarré.`;
    const rhMgArr = (users||INITIAL_USERS).filter(u=>u.isAdmin||(u.process==="S03"&&u.level>=4)||(u.isMG||u.id==="USR-MG-001")); // BUG FIX #4 — 'usersState' was undefined; correct variable is 'users'
    rhMgArr.forEach(u=>gcPushNotif(u.id,{id:"N"+Date.now()+u.id,icon:"👤",message:creationMsg,at:new Date().toISOString(),read:false,module:"approbations"}));
  };

  const handleFactoryReset = async () => {
    const confirmed = await gcConfirm("⚠️ RÉINITIALISATION TOTALE DU SI\n\nCela effacera L'INTÉGRALITÉ des données :\n• Tous les utilisateurs (y compris les données par défaut)\n• Tous les dossiers, documents, tâches, RDV\n• Tous les partenaires, recrutements, présences, congés\n• Toutes les codifications, journaux, configurations\n\nSeul le compte Compte superviseur sera conservé.\n\nCETTE ACTION EST IRRÉVERSIBLE.\n\nConfirmez-vous ?");
    if (!confirmed) return;
    const code = await gcPrompt("Saisir le code de confirmation : RESET-GC-SI");
    if ((code||"").trim() !== "RESET-GC-SI") { gcAlert("❌ Code incorrect. Réinitialisation annulée."); return; }
    // FIX v92 Bug#7d — Object.keys() snapshot complet, évite décalage d'index pendant suppression
    const keysToDelete = Object.keys(localStorage).filter(
      k => k && (k.startsWith("GC_SI") || k.startsWith("gc-") || k.startsWith("gc_"))
    );
    keysToDelete.forEach(k => { try { _lsRm(k); } catch (_) {} });
    const adminOnly = [{ ...INITIAL_USERS[0] }]; // uniquement USR-ADM-000
    setUsersState(adminOnly); setProdUsers(adminOnly); lsSave("users", adminOnly);
    setDossiersState([]); setProdDossiers([]); lsSave("dossiers", []);
    setTachesState([]); setProdTaches([]); lsSave("taches", []);
    setRdvsState([]); setProdRdvs([]); lsSave("rdvs", []);
    setPendingApprovalsState([]); setProdPending([]); lsSave("pendingApprovals", []);
    setPartnersStateRaw([]); setProdPartners([]); lsSave("partners", []);
    // -- SIRH --
    try { _lsSet("gc-sirh-presences","[]"); dsSave("gc-sirh-presences",[]).catch(err => gcToast.syncError('', err)); } catch(_) {}
    try { _lsSet("gc-sirh-leaves","[]"); dsSave("gc-sirh-leaves",[]).catch(err => gcToast.syncError('', err)); } catch(_) {}
    try { _lsSet("gc-sirh-recrutements","[]"); dsSave("gc-sirh-recrutements",[]).catch(err => gcToast.syncError('', err)); } catch(_) {}
    try { _lsSet("gc-sirh-evaluations","[]"); dsSave("gc-sirh-evaluations",[]).catch(err => gcToast.syncError('', err)); } catch(_) {}
    try { _lsSet("gc-paie-transferts", "[]"); } catch (_) {}
    // -- Documents --
    try { _lsSet("gc-internal-docs","[]"); dsSave("gc-internal-docs",[]).catch(err => gcToast.syncError('', err)); } catch(_) {}
    try { _lsSet("gc-external-docs","[]"); dsSave("gc-external-docs",[]).catch(err => gcToast.syncError('', err)); } catch(_) {}
    try { _lsSet("gc-dossier-files", "[]"); } catch (_) {}
    // -- Messagerie --
    try { _lsSet("gc-messages-global", "[]"); } catch (_) {}
    try { _lsSet("gc-courrier-docs", "[]"); } catch (_) {}
    // -- Journaux --
    try { _lsSet("gc-session-logs","[]"); dsSave("gc-session-logs",[]).catch(err => gcToast.syncError('', err)); } catch(_) {}
    try { _lsSet("gc-account-actions","[]"); dsSave("gc-account-actions",[]).catch(err => gcToast.syncError('', err)); } catch(_) {}
    try { _lsSet("gc-error-log", "[]"); } catch (_) {}
    // -- Accès --
    try { _lsRm("gc-pending-connections"); } catch (_) {}
    try { _lsRm("gc-app-habilitations"); } catch (_) {}
    try { _lsRm("gc-app-access-codes"); } catch (_) {}
    // -- Codification & Archivage --
    try { _lsSet("gc-codif-registry","[]"); dsSave("gc-codif-registry",[]).catch(err => gcToast.syncError('', err)); } catch(_) {}
    // -- Productivité --
    try { _lsRm("gc-kanban-cols-v2"); } catch (_) {}
    try { _lsRm("gc-kanban-cards-v2"); } catch (_) {}
    try { _lsRm("gc-notes-rapides"); } catch (_) {}
    try { _lsRm("gc-notepad-v2"); } catch (_) {}
    try { _lsRm("gc-memos"); } catch (_) {}
    try { _lsRm("gc-tableur-pro"); } catch (_) {}
    try { _lsRm("gc-alarms-v2"); } catch (_) {}
    try { _lsRm("gc-widget-alarms"); } catch (_) {}
    try { _lsRm("gc-demandes"); } catch (_) {}
    try { _lsRm("gc-archives"); } catch (_) {}
    try { _lsRm("gc-standalone-docs"); } catch (_) {}
    try { _lsRm("gc-security-alerts"); } catch (_) {}
    try { _lsRm("gc-system-msgs"); } catch (_) {}    // FIX v72 — Messages système (persistés depuis v72)
    // -- Badges "vu" sidebar (tous utilisateurs) --
    // FIX v92 Bug#7 — Snapshot complet des clés AVANT suppression (évite décalage d'index)
    try {
      const allKeys = Object.keys(localStorage);
      allKeys.filter(k => k && k.startsWith("gc-seen-badges:"))
             .forEach(k => { try { _lsRm(k); } catch(_) {} });
    } catch(_) {}
    // -- Notifications de tous les utilisateurs --
    try {
      const allKeys = Object.keys(localStorage);
      allKeys.filter(k => k && k.startsWith("GC_SI_v12:notif:"))
             .forEach(k => { try { _lsRm(k); } catch(_) {} });
    } catch(_) {}
    // -- Collaborateurs externes (réinitialiser à la liste par défaut) --
    setPartnersStateRaw(INITIAL_PARTNERS); setProdPartners(INITIAL_PARTNERS); lsSave("partners", INITIAL_PARTNERS);
    setSessionLogs([]);
    gcAlert("✅ Réinitialisation complète effectuée.\n\nToutes les données ont été effacées.\nSeul le compte Compte superviseur est conservé.\nLes partenaires de base ont été restaurés.\n\nVous allez être déconnecté.");
    setCurrentUser(null);
    setIsAdminMode(false);
    setScreen("cover");
  };

  if (screen === "cover") {
    return (
      <>
        <GlobalStyles />
        <CoverPage
          onAdminKey={() => { setIsAdminMode(true); setScreen("login"); }}
          onUserLogin={() => { setIsAdminMode(false); setScreen("login"); }}
          T={T}
          toggleTheme={toggleTheme}
          themeMode={themeMode}
          isFirstTime={isFirstTime}
          siLogoUrl={siLogoUrl}
          siAppearance={siAppearance}
        />
      </>
    );
  }

  if (screen === "login") {
    return (
      <>
        <GlobalStyles />
        <LoginPage
          users={users}
          isAdminMode={isAdminMode}
          onLogin={handleLogin}
          onCreateAccount={() => setScreen("create")}
          onBack={() => setScreen("cover")}
          onAccessDemo={isAdminMode ? handleAccessDemo : undefined}
          T={T}
          pendingConnections={pendingConnections}
          setPendingConnections={setPendingConnections}
          isFirstTime={isFirstTime}
          pendingApprovals={pendingApprovals}
          onSessionLog={addSessionLog}
          requireConnApproval={requireConnApproval}
          siSystemDocs={siSystemDocs}
          siAppearance={siAppearance}
          siLogoUrl={siLogoUrl}
        />
      </>
    );
  }

  if (screen === "create") {
    return (
      <>
        <GlobalStyles />
        <CreateAccountPage
          onBack={() => setScreen("login")}
          onSubmit={handleCreateAccountSubmit}
          T={T}
        />
      </>
    );
  }

  if (screen === "app" && currentUser) {
    return (
      <>
        <GlobalStyles />
        <SIErrorBoundary T={T}>
        <React.Suspense fallback={<div style={{background:"#060F1E",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#C9A84C",fontFamily:"monospace"}}>Chargement SI…</div>}>
        <SIApp
          currentUser={currentUser}
          users={users}
          setUsers={setUsers}
          dossiers={dossiers}
          setDossiers={setDossiers}
          taches={taches}
          setTaches={setTaches}
          rdvs={rdvs}
          setRdvs={setRdvs}
          onLogout={handleLogout}
          T={T}
          toggleTheme={toggleTheme}
          themeMode={themeMode}
          pendingApprovals={pendingApprovals}
          setPendingApprovals={setPendingApprovals}
          pendingConnectionsRoot={pendingConnections}
          setPendingConnectionsRoot={setPendingConnections}
          onFactoryReset={handleFactoryReset}
          isDemoMode={isDemoMode}
          onExitDemo={handleExitDemo}
          siLogoUrl={siLogoUrl}
          setSiLogoUrl={setSiLogoUrl}
          siAppearance={siAppearance}
          setSiAppearance={setSiAppearance}
          siCSSOverrides={siCSSOverrides}
          setSiCSSOverrides={setSiCSSOverrides}
          sessionLogs={sessionLogs}
          setSessionLogs={setSessionLogs}
          addSessionLog={addSessionLog}
          pendingAccountActions={pendingAccountActions}
          setPendingAccountActions={setPAA}
          partnersRoot={partnersState}
          setPartnersRoot={setPartnersGlobal}
          appHabilitations={appHabilitations}
          setAppHabilitations={saveAppHabilitations}
          appAccessCodes={appAccessCodes}
          setAppAccessCodes={saveAppAccessCodes}
          requireConnApproval={requireConnApproval}
          setRequireConnApproval={setRequireConnApproval}
          siSystemDocs={siSystemDocs}
          setSiSystemDocs={setSiSystemDocs}
        />
        </React.Suspense>
        </SIErrorBoundary>
      </>
    );
  }

  return <><GlobalStyles /><div style={{ background: "#060F1E", minHeight: "100vh" }} /></>;
}



