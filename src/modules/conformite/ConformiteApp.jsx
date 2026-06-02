import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// ConformiteApp.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, playSound, _activeUser, getProcColor, gcAIAsk, daysLeft, dsSave, dsDeleteItemFromArray, dsLoad, dsOnSync, dsGet } from '../../core/index.js';
import { useRemoteSync } from '../../hooks/useSyncedState.js';
import { CODES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';
import { KYCWorkflowsPanel } from './KYCWorkflowModule.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function NonConformitesPanel({ T, currentUser, setNotifications=_noop, taches=[], setTaches=_noop }){
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const [ncs, setNcs] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-nc")||"[]");}catch (_) {return [];}});
  const [showForm, setShowForm] = React.useState(false);
  const [ncSearch, setNcSearch] = React.useState("");
  const [ncStatusFilter, setNcStatusFilter] = React.useState("ALL");
  const [ncTypeFilter, setNcTypeFilter] = React.useState("ALL");
  const [ncSort, setNcSort] = React.useState("date_desc");
  const [form, setForm] = React.useState({titre:"",processus:"O02",type:"MINEURE",cause:"",actionCorrective:"",responsable:"",echeance:"",statut:"OUVERT"});
  const saveNcs = (d)=>{setNcs(d);try{_lsSet("gc-nc",JSON.stringify(d));dsSave("gc-nc",d).catch(err => gcToast.syncError('', err));}catch (_) {};};
  useRemoteSync({ 'gc-nc': setNcs });
  const NC_TYPES = {MINEURE:{c:"#F59E0B",label:"Mineure"},MAJEURE:{c:"#EF4444",label:"Majeure"},CRITIQUE:{c:"#DC2626",label:"Critique"},OBSERVATION:{c:"#3B82F6",label:"Observation"}};
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <div style={{color:T.text,fontWeight:700,fontSize:12}}>🚨 Non-conformités & Actions correctives ({ncs.length})</div>
      <button onClick={()=>setShowForm(v=>!v)} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:10,fontWeight:700}}>+ Déclarer NC</button>
    </div>
    {showForm&&<div style={{background:T.surface2,border:"2px solid #EF444444",borderRadius:10,padding:14,marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[["Titre / Description","titre",false],["Cause racine","cause",false],["Action corrective","actionCorrective",false],["Responsable","responsable",false],["Échéance","echeance",false]].map(([l,k,ta])=>(
          <div key={k} style={{gridColumn:ta?"1/-1":"auto"}}>
            <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{l}</label>
            <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} type={k==="echeance"?"date":"text"} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
          </div>
        ))}
        <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Type</label>
          <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
            {Object.entries(NC_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select></div>
        <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Processus</label>
          <select value={form.processus} onChange={e=>setForm(f=>({...f,processus:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
            {Object.entries(CODES.processes).map(([k,v])=><option key={k} value={k}>{k} – {v}</option>)}
          </select></div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <button onClick={()=>{
          if(!form.titre.trim()) return gcAlert("Titre obligatoire");
          const nc={...form,id:"NC"+Date.now(),declaredBy:currentUser?.name,declaredAt:new Date().toISOString(),statut:"OUVERT"};
          const updated=[nc,...ncs]; saveNcs(updated);
          if(setTaches&&form.actionCorrective){
            setTaches(prev=>[{id:"T"+Date.now(),titre:`[NC-${nc.id}] Action corrective : ${form.actionCorrective.slice(0,60)}`,description:`Non-conformité : ${form.titre}\nCause : ${form.cause}\nAction : ${form.actionCorrective}\nProcessus : ${form.processus}`,status:"A_FAIRE",statut:"A_FAIRE",priority:form.type==="CRITIQUE"?"CRITIQUE":form.type==="MAJEURE"?"HAUTE":"NORMALE",module:"qualite",createdAt:new Date().toISOString(),creatorId:currentUser?.id,assigneeId:currentUser?.id,deadline:form.echeance,type:"NC_CORRECTIVE"},...prev]);
          }
          setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"🚨",message:`NC déclarée [${form.type}] : ${form.titre} — ${form.processus}`,at:new Date().toISOString(),read:false,module:"qualite"},...p]);
          setForm({titre:"",processus:"O02",type:"MINEURE",cause:"",actionCorrective:"",responsable:"",echeance:"",statut:"OUVERT"});
          setShowForm(false); playSound("alarm");
        }} style={{background:"#EF4444",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Enregistrer NC</button>
        <button onClick={()=>setShowForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
      </div>
    </div>}
    {/* ── Filter bar NonConformités ── */}
    <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
      <input value={ncSearch} onChange={e=>setNcSearch(e.target.value)} placeholder="🔍 Titre, processus, responsable…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
      <select value={ncStatusFilter} onChange={e=>setNcStatusFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
        <option value="ALL">🔍 Tous statuts</option>
        <option value="OUVERT">🔴 Ouverts</option>
        <option value="EN_COURS">🟡 En cours</option>
        <option value="CLOS">✅ Clos</option>
      </select>
      <select value={ncTypeFilter} onChange={e=>setNcTypeFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
        <option value="ALL">📂 Tous types</option>
        {Object.keys(NC_TYPES||{}).map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <select value={ncSort} onChange={e=>setNcSort(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
        <option value="date_desc">↓ Plus récents</option>
        <option value="date_asc">↑ Plus anciens</option>
        <option value="gravite">⚠ Par gravité</option>
      </select>
      <span style={{color:T.textDim,fontSize:10}}>{(()=>{const f=ncs.filter(nc=>{const q=ncSearch.toLowerCase();const ms=!q||(nc.titre||"").toLowerCase().includes(q)||(nc.processus||"").toLowerCase().includes(q)||(nc.responsable||"").toLowerCase().includes(q);const mst=ncStatusFilter==="ALL"||(nc.statut||"OUVERT")===ncStatusFilter;const mt=ncTypeFilter==="ALL"||nc.type===ncTypeFilter;return ms&&mst&&mt;});return f.length;})()}/{ncs.length}</span>
    </div>
    {(()=>{
      const GRAV_O={CRITIQUE:0,MAJEURE:1,MINEURE:2,OBSERVATION:3};
      const filtered=ncs.filter(nc=>{
        const q=ncSearch.toLowerCase();
        const ms=!q||(nc.titre||"").toLowerCase().includes(q)||(nc.processus||"").toLowerCase().includes(q)||(nc.responsable||"").toLowerCase().includes(q);
        const mst=ncStatusFilter==="ALL"||(nc.statut||"OUVERT")===ncStatusFilter;
        const mt=ncTypeFilter==="ALL"||nc.type===ncTypeFilter;
        return ms&&mst&&mt;
      }).sort((a,b)=>{
        if(ncSort==="date_asc")return (a.createdAt||"").localeCompare(b.createdAt||"");
        if(ncSort==="gravite")return (GRAV_O[a.type]??9)-(GRAV_O[b.type]??9);
        return (b.createdAt||"").localeCompare(a.createdAt||"");
      });
      if(filtered.length===0) return <div style={{color:T.textDim,textAlign:"center",padding:"16px 0",fontSize:11}}>✅ Aucune non-conformité{ncSearch||ncStatusFilter!=="ALL"||ncTypeFilter!=="ALL"?" pour ces filtres":""}</div>;
      return filtered.map(nc=>{
        const cfg=NC_TYPES[nc.type]||{c:"#888",label:nc.type};
        return <div key={nc.id} style={{background:T.surface2,border:`1px solid ${cfg.c}44`,borderRadius:9,padding:"10px 14px",marginBottom:6,display:"flex",gap:10,alignItems:"flex-start"}}>
        <div style={{background:cfg.c+"22",border:`1px solid ${cfg.c}55`,borderRadius:6,padding:"3px 7px",flexShrink:0}}>
          <span style={{color:cfg.c,fontWeight:800,fontSize:9}}>{cfg.label}</span>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:T.text,fontWeight:700,fontSize:11,marginBottom:2}}>{nc.titre}</div>
          <div style={{color:T.textMuted,fontSize:10}}>{nc.processus} · Par {nc.declaredBy} · {new Date(nc.declaredAt).toLocaleDateString("fr-FR")}</div>
          {nc.actionCorrective&&<div style={{color:T.textDim,fontSize:10,marginTop:2}}>🔧 {nc.actionCorrective?.slice(0,80)}</div>}
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          <button onClick={()=>{
            const updated=ncs.map(x=>x.id===nc.id?{...x,statut:x.statut==="CLOS"?"OUVERT":"CLOS",closedAt:new Date().toISOString(),closedBy:currentUser?.name}:x);
            saveNcs(updated);
            setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:nc.statut==="CLOS"?"🔄":"✅",message:`NC ${nc.statut==="CLOS"?"rouverte":"clôturée"} : ${nc.titre}`,at:new Date().toISOString(),read:false},...p]);
          }} style={{background:nc.statut==="CLOS"?"#F59E0B22":"#22C55E22",border:`1px solid ${nc.statut==="CLOS"?"#F59E0B44":"#22C55E44"}`,color:nc.statut==="CLOS"?"#F59E0B":"#22C55E",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>
            {nc.statut==="CLOS"?"🔄 Rouvrir":"✅ Clôturer"}
          </button>
          <button onClick={async () => {if(await gcConfirm("Supprimer cette NC ?")){dsDeleteItemFromArray("gc-nc",nc.id);setNcs(prev=>prev.filter(x=>x.id!==nc.id));}}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
        </div>
      </div>
    })})}
  </div>;
}

export function ConformiteFull({ T, currentUser, users=[], setNotifications=_noop, isDemoMode=false, taches=[], setTaches=_noop, dossiers=[], setDossiers=_noop }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const lvl = currentUser?.level || 1;
  const canApprove = lvl >= 4 || currentUser?.isAdmin;

  const [tab, setTab] = useState("tableau_bord");
  const [veille, setVeille] = useState(() => { try { return JSON.parse(_lsGet("gc-conffull-veille")||"[]"); } catch (_) { return []; }});
  const [approvals, setApprovals] = useState(() => { try { return JSON.parse(_lsGet("gc-conffull-approvals")||"null") || [
    {id:"CA001",titre:"Politique de confidentialité v2.0",type:"POLITIQUE",statut:"EN_ATTENTE",submittedBy:"Responsable SI",date:"2026-03-01",urgence:"NORMALE",approbateur:"DG"},
    {id:"CA002",titre:"Procédure AML — Lutte anti-blanchiment",type:"PROCEDURE",statut:"APPROUVE",submittedBy:"Conformité",date:"2026-02-15",urgence:"HAUTE",approbateur:"DG"},
  ]; } catch (_) { return []; }});
  const [indicators, setIndicators] = useState(() => { try { return JSON.parse(_lsGet("gc-conffull-kpi")||"null") || [
    {id:"K001",label:"Taux de conformité OHADA",valeur:87,cible:100,unit:"%",cat:"OHADA",tendance:"up"},
    {id:"K002",label:"Conformité fiscale",valeur:95,cible:100,unit:"%",cat:"Fiscal",tendance:"stable"},
    {id:"K003",label:"Formation conformité équipe",valeur:6,cible:8,unit:"collaborateurs",cat:"RH",tendance:"up"},
    {id:"K004",label:"Contrôles internes réalisés",valeur:3,cible:4,unit:"par trimestre",cat:"Audit",tendance:"down"},
  ]; } catch (_) { return []; }});
  const [newApproval, setNewApproval] = useState({titre:"",type:"POLITIQUE",urgence:"NORMALE",approbateur:"DG",notes:""});
  const [showNewApproval, setShowNewApproval] = useState(false);
  const [searchVeille, setSearchVeille] = useState("");
  const [veilleLoading, setVeilleLoading] = useState(false);
  const [confSearch, setConfSearch] = useState("");
  const [confTypeFilter, setConfTypeFilter] = useState("ALL");
  const [confStatutFilter, setConfStatutFilter] = useState("ALL");
  const [confSort, setConfSort] = useState("date_desc");
  const [veilleResult, setVeilleResult] = useState(null);

  const INITIAL_OBL = [
    { id:"OBL-001", titre:"Registre des traitements RGPD", domaine:"RGPD", echeance:"2026-04-01", responsableId:"USR-AUD-001", statut:"EN_COURS", notes:"Mise à jour annuelle", processus:"P02" },
    { id:"OBL-002", titre:"Déclaration IS trimestrielle T1 2026", domaine:"Fiscal", echeance:"2026-03-31", responsableId:"USR-FIN-001", statut:"A_REALISER", notes:"DGI", processus:"S01" },
    { id:"OBL-003", titre:"Rapport social annuel", domaine:"RH/Social", echeance:"2026-03-15", responsableId:"USR-RH-001", statut:"EN_COURS", notes:"Code travail Art. 287", processus:"S03" },
  ];
  const INIT_RGPD = [
    { id:"RGPD-001", nom:"Gestion des ressources humaines", finalite:"Paie, congés, recrutement", baseJuridique:"Obligation légale", categories:"Identité, bancaires", destinataires:"RH, Comptabilité", dureeConservation:"5 ans après fin contrat", mesuresSecurite:"Accès habilitation 4+", responsableId:"USR-RH-001", dateCreation:"2026-01-15", statut:"ACTIF" },
    { id:"RGPD-002", nom:"Gestion des dossiers clients", finalite:"Suivi affaires juridiques", baseJuridique:"Exécution du contrat", categories:"Identité, judiciaires", destinataires:"Juridique, Direction", dureeConservation:"10 ans après clôture", mesuresSecurite:"Chiffrement, accès nominatif", responsableId:"USR-JUR-001", dateCreation:"2026-01-15", statut:"ACTIF" },
  ];
  const [obligations, setObligations] = useState(() => { try { return JSON.parse(_lsGet("gc-obligations")||"null") || INITIAL_OBL; } catch (_) { return INITIAL_OBL; }});
  const [rgpdTraitements, setRgpdTraitements] = useState(() => { try { return JSON.parse(_lsGet("gc-rgpd-traitements")||"null") || INIT_RGPD; } catch (_) { return INIT_RGPD; }});
  const [showNewObl, setShowNewObl] = useState(false);
  const [oblForm, setOblForm] = useState({titre:"",domaine:"Fiscal",echeance:"",responsableId:"",notes:"",processus:"P02"});
  const [showNewRgpd, setShowNewRgpd] = useState(false);
  const [rgpdForm, setRgpdForm] = useState({nom:"",finalite:"",baseJuridique:"Consentement",categories:"",destinataires:"",dureeConservation:"",mesuresSecurite:"",responsableId:"",statut:"ACTIF"});

  const DOMAINES_CHECK = [
    {id:"ohada",label:"OHADA",icon:"⚖️",color:"#10B981",items:["RCCM à jour","Statuts déposés et conformes AUS","AG tenues et PV signés","Comptes annuels déposés dans les délais","Capital social conforme au minimum légal","Commissariat aux comptes (SA)"]},
    {id:"fiscal",label:"Fiscal",icon:"💰",color:"#F59E0B",items:["Déclarations TVA mensuelles transmises","IS / IRPP calculé et payé","DSF déposée dans les délais","Patente annuelle réglée","Retenues à la source effectuées","Taxe spéciale sur les sociétés"]},
    {id:"social",label:"Social & RH",icon:"👥",color:"#8B5CF6",items:["Registre du personnel tenu à jour","Contrats de travail signés et conformes","Déclarations CNSS mensuelles","Visites médicales effectuées","Règlement intérieur affiché","Délégués du personnel élus"]},
    {id:"data",label:"Protection données",icon:"🛡️",color:"#0EA5E9",items:["Politique de confidentialité établie","Accès aux données contrôlé","Durées de conservation définies","Registre des traitements mis à jour","Procédure violation données en place"]},
    {id:"aml",label:"LCB-FT",icon:"🔍",color:"#EF4444",items:["Procédure KYC en place","Identification bénéficiaires effectifs","Déclarations de soupçon — ANIF","Formation LCB-FT équipe","Veille sanctions internationales"]},
    {id:"qualite",label:"Qualité",icon:"🏆",color:"#EC4899",items:["Cartographie des processus documentée","Manuel qualité à jour","Indicateurs de performance définis","Revues de direction réalisées","Non-conformités traitées"]},
  ];
  const [checks, setChecks] = useState(() => { try { return JSON.parse(_lsGet("gc-conffull-checks")||"{}"); } catch (_) { return {}; }});
  const toggle = (domain, item) => { const k=`${domain}::${item}`; const nc={...checks,[k]:!checks[k]}; setChecks(nc); if(!isDemoMode) try{_lsSet("gc-conffull-checks",JSON.stringify(nc));}catch (_) {} };
  const score = (domain) => { const its=DOMAINES_CHECK.find(d=>d.id===domain)?.items||[]; const done=its.filter(i=>checks[domain+"::"+i]).length; return {done,total:its.length,pct:Math.round(done/its.length*100)}; };
  const totalScore = () => { const all=DOMAINES_CHECK.flatMap(d=>d.items.map(i=>checks[d.id+"::"+i])); return Math.round(all.filter(Boolean).length/all.length*100); };

  const saveApprovals = (a) => { setApprovals(a); if(!isDemoMode) try{_lsSet("gc-conffull-approvals",JSON.stringify(a));dsSave("gc-conffull-approvals",a).catch(err => gcToast.syncError('', err));}catch (_) {}};
  const saveVeille = (v) => { setVeille(v); if(!isDemoMode) try{_lsSet("gc-conffull-veille",JSON.stringify(v));dsSave("gc-conffull-veille",v).catch(err => gcToast.syncError('', err));}catch (_) {}};
  const saveIndicators = (i) => { setIndicators(i); if(!isDemoMode) try{_lsSet("gc-conffull-kpi",JSON.stringify(i));dsSave("gc-conffull-kpi",i).catch(err => gcToast.syncError('', err));}catch (_) {}};
  const saveObligations = (v) => {
    setObligations(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if(!isDemoMode) try{_lsSet("gc-obligations",JSON.stringify(resolved));dsSave("gc-obligations",resolved).catch(err => gcToast.syncError('', err));}catch (_) {}
      return resolved;
    });
  };
  const saveRgpd = (v) => {
    setRgpdTraitements(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if(!isDemoMode) try{_lsSet("gc-rgpd-traitements",JSON.stringify(resolved));dsSave("gc-rgpd-traitements",resolved).catch(err => gcToast.syncError('', err));}catch (_) {}
      return resolved;
    });
  };

  // ── KYC Workflows Sync ────────────────────────────────────────────────
  const [kycWorkflows, setKycWorkflowsRaw] = useState(() => { try { return JSON.parse(_lsGet("gc-kyc-workflows")||"[]"); } catch (_) { return []; }});
  const setKycWorkflows = (v) => {
    const resolved = typeof v === 'function' ? v(kycWorkflows) : v;
    setKycWorkflowsRaw(resolved);
    if(!isDemoMode) try{_lsSet("gc-kyc-workflows",JSON.stringify(resolved));dsSave("gc-kyc-workflows",resolved).catch(err => gcToast.syncError('', err));}catch (_) {}
  };

  // Sync temps-réel : rafraîchit les données quand un autre utilisateur les modifie
  useRemoteSync({
    'gc-kyc-workflows':     setKycWorkflowsRaw,
    'gc-conffull-approvals': setApprovals,
    'gc-conffull-kpi':       setIndicators,
    'gc-conffull-checks':    setChecks,
    'gc-conffull-veille':    setVeille,
    'gc-obligations':        setObligations,
    'gc-rgpd-traitements':   setRgpdTraitements,
  });

  const OBL_STATUT = { A_REALISER:{c:"#F59E0B",l:"À réaliser"},EN_COURS:{c:"#3B82F6",l:"En cours"},REALISE:{c:"#22C55E",l:"Réalisé"},EN_RETARD:{c:"#EF4444",l:"En retard"} };
  const DOMAINES_OBL = ["RGPD","Fiscal","RH/Social","Comptable","Sectoriel","Sécurité","Autre"];
  const today = new Date().toISOString().split("T")[0];
  const urgentes = obligations.filter(o => o.statut!=="REALISE" && o.echeance && daysLeft(o.echeance)<=7);

  const handleVeilleSearch = async () => {
    if (!searchVeille.trim()) return;
    setVeilleLoading(true); setVeilleResult(null);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1200,
          messages:[{role:"user",content:`Tu es un expert en conformité réglementaire, OHADA, droit gabonais, et normes internationales (ISO, LCB-FT, RGPD-Afrique).\n\nRecherche : "${searchVeille}"\n\nFournis :\n1. Textes réglementaires applicables\n2. Obligations légales précises\n3. Sanctions en cas de non-conformité\n4. Meilleures pratiques\n5. Calendrier des obligations périodiques\n6. Recommandations pour le contexte gabonais`}]
        })
      });
      const data = await resp.json();
      setVeilleResult(data.content?.map(c=>c.text||"").join("") || "Aucun résultat.");
    } catch (_) { setVeilleResult("⚠️ Erreur de connexion."); }
    setVeilleLoading(false);
  };

  const TABS = [
    {id:"tableau_bord",l:"📊 Tableau de bord"},
    {id:"obligations",l:`⚖️ Obligations${urgentes.length>0?" ("+urgentes.length+")":""}`},
    {id:"checklists",l:"✅ Checklists"},
    {id:"smq_full",l:"⚙️ SMQ & NC"},
    {id:"rgpd",l:"🔒 RGPD"},
    {id:"approbations",l:"📋 Approbations"},
    {id:"indicateurs",l:"📈 Indicateurs"},
    {id:"veille",l:"🔭 Veille IA"},
    {id:"referentiels",l:"📚 Référentiels"},
    ...(lvl>=4?[{id:"procedures",l:"📑 Procédures"}]:[]),
    {id:"kyc_workflows",l:`📋 KYC${kycWorkflows.filter(w=>w.statut==='SOUMIS').length>0?" ("+kycWorkflows.filter(w=>w.statut==='SOUMIS').length+")":""}`},
  ];

  return (
    <div className="gc-fade-in">
      {/* En-tête */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#10B981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🛡️</div>
        <div style={{flex:1}}>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>Conformité & Veille Réglementaire</div>
          <div style={{color:T.textMuted,fontSize:11}}>OHADA · Fiscal · RGPD · Obligations · Veille IA · Référentiels</div>
        </div>
        {urgentes.length>0 && <div style={{background:"#EF444422",border:"1px solid #EF444444",borderRadius:8,padding:"6px 12px",color:"#EF4444",fontSize:11,fontWeight:700}}>🚨 {urgentes.length} urgente(s)</div>}
        <div style={{background:"#10B98122",border:"1px solid #10B98144",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
          <div style={{color:"#10B981",fontWeight:900,fontSize:22,lineHeight:1}}>{totalScore()}%</div>
          <div style={{color:T.textMuted,fontSize:9}}>Score global</div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div style={{display:"flex",gap:5,marginBottom:14,borderBottom:`1px solid ${T.border}`,paddingBottom:8,overflowX:"auto",flexWrap:"nowrap",WebkitOverflowScrolling:"touch"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?"#10B981":T.surface2,color:tab===t.id?"#fff":T.textMuted,border:`1px solid ${tab===t.id?"#10B981":T.border}`,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:tab===t.id?800:400,fontSize:11,whiteSpace:"nowrap"}}>{t.l}</button>
        ))}
      </div>

      {/* ── TABLEAU DE BORD ── */}
      {tab==="tableau_bord" && (
        <div>
          <div style={{background:`linear-gradient(135deg,#10B98122,${T.surface2})`,border:"1px solid #10B98144",borderRadius:12,padding:"16px 20px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{color:T.text,fontWeight:800,fontSize:14}}>Score global de conformité</div>
              <div style={{color:totalScore()<70?"#EF4444":totalScore()<90?"#F59E0B":"#22C55E",fontWeight:700,fontSize:11}}>{totalScore()<70?"⚠️ Insuffisant — Actions requises":totalScore()<90?"✅ Satisfaisant — Points à améliorer":"🏆 Excellent"}</div>
            </div>
            <div style={{background:"#00000022",borderRadius:99,height:10,overflow:"hidden",marginBottom:12}}>
              <div style={{width:`${totalScore()}%`,background:"linear-gradient(90deg,#10B981,#22C55E)",height:"100%",borderRadius:99,transition:"width 0.5s"}} />
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
            {DOMAINES_CHECK.map(d=>{const s=score(d.id);return(
              <div key={d.id} onClick={()=>setTab("checklists")} style={{background:T.surface2,border:`2px solid ${d.color}33`,borderRadius:12,padding:"14px 16px",cursor:"pointer"}} className="gc-hover-card">
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:20}}>{d.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:13}}>{d.label}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>{s.done}/{s.total} éléments conformes</div>
                  </div>
                  <div style={{color:s.pct>=90?"#22C55E":s.pct>=70?"#F59E0B":"#EF4444",fontWeight:900,fontSize:18}}>{s.pct}%</div>
                </div>
                <div style={{background:"#00000022",borderRadius:99,height:5,overflow:"hidden"}}>
                  <div style={{width:`${s.pct}%`,background:d.color,height:"100%",borderRadius:99,transition:"width 0.5s"}} />
                </div>
              </div>
            );})}
          </div>
          <div style={{marginTop:14,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}} className="gc-grid-4">
            {[{l:"Obligations à réaliser",v:obligations.filter(o=>o.statut==="A_REALISER").length,c:"#F59E0B",icon:"📋"},{l:"Urgentes (≤7j)",v:urgentes.length,c:"#EF4444",icon:"🚨"},{l:"Approbations en attente",v:approvals.filter(a=>a.statut==="EN_ATTENTE").length,c:"#3B82F6",icon:"⏳"},{l:"KPIs conformes",v:indicators.filter(i=>i.valeur/i.cible>=0.9).length,c:"#22C55E",icon:"✅"}].map(s=>(
              <div key={s.l} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}} className="gc-hover-card">
                <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:18}}>{s.icon}</span><span style={{color:s.c,fontSize:20,fontWeight:900}}>{s.v}</span></div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:4}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── OBLIGATIONS ── */}
      {tab==="obligations" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h4 style={{color:"#10B981",margin:0,fontSize:13,fontWeight:800}}>⚖️ Registre des Obligations de Conformité</h4>
            {lvl>=3 && <button onClick={()=>setShowNewObl(!showNewObl)} style={{background:"#10B981",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nouvelle obligation</button>}
          </div>
          {urgentes.length>0 && <div style={{background:"#EF444412",border:"1px solid #EF444433",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#EF4444",fontWeight:700}}>🚨 {urgentes.length} obligation(s) urgente(s) — échéance ≤ 7 jours</div>}
          {showNewObl && (
            <div style={{background:T.surface2,border:"1px solid #10B98144",borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div style={{gridColumn:"span 2"}}><InputField label="Titre *" value={oblForm.titre} onChange={e=>setOblForm(f=>({...f,titre:e.target.value}))} T={T} /></div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Domaine</label>
                  <select value={oblForm.domaine} onChange={e=>setOblForm(f=>({...f,domaine:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                    {DOMAINES_OBL.map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <InputField label="Échéance *" type="date" value={oblForm.echeance} onChange={e=>setOblForm(f=>({...f,echeance:e.target.value}))} T={T} />
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Responsable</label>
                  <select value={oblForm.responsableId} onChange={e=>setOblForm(f=>({...f,responsableId:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                    <option value="">— Sélectionner —</option>
                    {users.filter(u=>_activeUser(u)&&u.level>=2).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Processus</label>
                  <select value={oblForm.processus} onChange={e=>setOblForm(f=>({...f,processus:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                    {["P01","P02","P03","P04","O01","O02","O03","S01","S02","S03","S04","S05","S06"].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{gridColumn:"span 2"}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Notes</label>
                  <textarea value={oblForm.notes} onChange={e=>setOblForm(f=>({...f,notes:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} />
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{if(!oblForm.titre||!oblForm.echeance){gcAlert("Titre et échéance requis.");return;}saveObligations(prev=>[...prev,{...oblForm,id:`OBL-${Date.now()}`,statut:"A_REALISER",preuve:null,createdBy:currentUser.id,createdAt:new Date().toISOString()}]);setOblForm({titre:"",domaine:"Fiscal",echeance:"",responsableId:"",notes:"",processus:"P02"});setShowNewObl(false);playSound("success");}} style={{background:"#10B981",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Enregistrer</button>
                <button onClick={()=>setShowNewObl(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          {obligations.map(o=>{
            const sc=OBL_STATUT[o.statut]||{c:"#888",l:o.statut};
            const dl=daysLeft(o.echeance); const urgent=o.statut!=="REALISE"&&dl<=7;
            return(
              <div key={o.id} style={{background:T.surface2,border:`1px solid ${urgent?"#EF444444":T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:7,display:"flex",gap:10,alignItems:"center"}}>
                <div style={{flex:1}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:12}}>{o.titre}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{o.domaine} · {o.processus} · Échéance: {o.echeance}{o.notes&&` · ${o.notes}`}</div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {urgent && <span style={{color:"#EF4444",fontSize:11,fontWeight:700}}>⚠️ {dl<=0?"Dépassée":dl+"j"}</span>}
                  <span style={{background:sc.c+"22",border:`1px solid ${sc.c}44`,color:sc.c,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{sc.l}</span>
                  {lvl>=3 && <select value={o.statut} onChange={e=>saveObligations(obligations.map(x=>x.id===o.id?{...x,statut:e.target.value}:x))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 6px",color:T.text,fontSize:10,cursor:"pointer"}}>
                    {Object.entries(OBL_STATUT).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
                  </select>}
                  {lvl>=4 && <button onClick={()=>{dsDeleteItemFromArray("gc-obligations",o.id);setObligations(prev=>prev.filter(x=>x.id!==o.id));}} style={{background:"transparent",border:"none",color:"#C41E3A",cursor:"pointer",fontSize:12}}>🗑️</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CHECKLISTS ── */}
      {tab==="checklists" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{color:T.text,fontWeight:800,fontSize:13}}>✅ Checklists de Conformité</div>
            <button style={{background:"#10B98122",border:"1px solid #10B98144",color:"#10B981",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}} onClick={()=>{if(window.gcAIAsk){const rows=DOMAINES_CHECK.map(function(d){var s=score(d.id);return d.label+": "+s.done+"/"+s.total+" ("+s.pct+"%)";}).join("\n");window.gcAIAsk("Analyse ce résumé de conformité et donne des recommandations prioritaires :\n"+rows);}}}>✨ Analyse IA</button>
          </div>
          {DOMAINES_CHECK.map(d=>{const s=score(d.id);return(
            <div key={d.id} style={{background:T.surface2,border:`2px solid ${d.color}22`,borderRadius:12,padding:14,marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:20}}>{d.icon}</span>
                <div style={{flex:1,color:T.text,fontWeight:800,fontSize:13}}>{d.label}</div>
                <div style={{color:d.color,fontWeight:900,fontSize:15}}>{s.pct}%</div>
              </div>
              <div style={{background:"#00000022",borderRadius:99,height:5,overflow:"hidden",marginBottom:10}}>
                <div style={{width:`${s.pct}%`,background:d.color,height:"100%",borderRadius:99,transition:"width 0.5s"}} />
              </div>
              {d.items.map(item=>(
                <div key={item} onClick={()=>toggle(d.id,item)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:6,cursor:"pointer",marginBottom:2,background:checks[d.id+"::"+item]?d.color+"11":"transparent",border:`1px solid ${checks[d.id+"::"+item]?d.color+"33":"transparent"}`}}>
                  <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${d.color}`,background:checks[d.id+"::"+item]?d.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:10,color:"#fff",fontWeight:900,transition:"all 0.15s"}}>{checks[d.id+"::"+item]?"✓":""}</div>
                  <span style={{color:T.text,fontSize:11}}>{item}</span>
                </div>
              ))}
            </div>
          );})}
        </div>
      )}

      {/* ── RGPD ── */}
      {tab==="rgpd" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h4 style={{color:"#0EA5E9",margin:0,fontSize:13,fontWeight:800}}>🔒 Registre des Traitements RGPD</h4>
            {lvl>=3 && <button onClick={()=>setShowNewRgpd(!showNewRgpd)} style={{background:"#0EA5E9",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nouveau traitement</button>}
          </div>
          {showNewRgpd && (
            <div style={{background:T.surface2,border:"1px solid #0EA5E944",borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <InputField label="Nom du traitement *" value={rgpdForm.nom} onChange={e=>setRgpdForm(f=>({...f,nom:e.target.value}))} T={T} />
                <InputField label="Finalité *" value={rgpdForm.finalite} onChange={e=>setRgpdForm(f=>({...f,finalite:e.target.value}))} T={T} />
                <InputField label="Catégories de données" value={rgpdForm.categories} onChange={e=>setRgpdForm(f=>({...f,categories:e.target.value}))} T={T} />
                <InputField label="Destinataires" value={rgpdForm.destinataires} onChange={e=>setRgpdForm(f=>({...f,destinataires:e.target.value}))} T={T} />
                <InputField label="Durée de conservation" value={rgpdForm.dureeConservation} onChange={e=>setRgpdForm(f=>({...f,dureeConservation:e.target.value}))} T={T} />
                <InputField label="Mesures de sécurité" value={rgpdForm.mesuresSecurite} onChange={e=>setRgpdForm(f=>({...f,mesuresSecurite:e.target.value}))} T={T} />
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Base juridique</label>
                  <select value={rgpdForm.baseJuridique} onChange={e=>setRgpdForm(f=>({...f,baseJuridique:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                    {["Consentement","Obligation légale","Exécution du contrat","Intérêt légitime","Mission d'intérêt public"].map(b=><option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Responsable</label>
                  <select value={rgpdForm.responsableId} onChange={e=>setRgpdForm(f=>({...f,responsableId:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                    <option value="">— Sélectionner —</option>
                    {users.filter(u=>_activeUser(u)&&u.level>=2).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{if(!rgpdForm.nom||!rgpdForm.finalite){gcAlert("Nom et finalité requis.");return;}saveRgpd(prev=>[...prev,{...rgpdForm,id:`RGPD-${Date.now()}`,dateCreation:today,statut:"ACTIF"}]);setRgpdForm({nom:"",finalite:"",baseJuridique:"Consentement",categories:"",destinataires:"",dureeConservation:"",mesuresSecurite:"",responsableId:"",statut:"ACTIF"});setShowNewRgpd(false);playSound("success");}} style={{background:"#0EA5E9",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Enregistrer</button>
                <button onClick={()=>setShowNewRgpd(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          {rgpdTraitements.map(r=>(
            <div key={r.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{color:T.text,fontWeight:700,fontSize:13}}>{r.nom}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{r.finalite}</div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <span style={{background:"#0EA5E922",border:"1px solid #0EA5E944",color:"#0EA5E9",borderRadius:6,padding:"2px 8px",fontSize:10}}>{r.statut}</span>
                  {lvl>=4 && <button onClick={()=>{dsDeleteItemFromArray("gc-rgpd-traitements",r.id);setRgpdTraitements(prev=>prev.filter(x=>x.id!==r.id));}} style={{background:"transparent",border:"none",color:"#C41E3A",cursor:"pointer",fontSize:12}}>🗑️</button>}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:6,fontSize:9,color:T.textDim}}>
                {[{l:"Base juridique",v:r.baseJuridique},{l:"Catégories",v:r.categories},{l:"Durée conservation",v:r.dureeConservation},{l:"Mesures sécurité",v:r.mesuresSecurite}].map(f=>(
                  <div key={f.l} style={{background:T.surface3,borderRadius:6,padding:"4px 8px"}}><span style={{fontWeight:700,color:T.textMuted,fontSize:8,textTransform:"uppercase"}}>{f.l}</span><br/><span style={{color:T.text,fontSize:10}}>{f.v||"—"}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── APPROBATIONS ── */}
      {tab==="approbations" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:T.text,fontWeight:800,fontSize:13}}>📋 Approbations de Documents</div>
            {canApprove && <button onClick={()=>setShowNewApproval(true)} style={{background:"#10B981",border:"none",color:"#fff",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Soumettre pour approbation</button>}
          </div>
          {showNewApproval && (
            <div style={{background:T.surface2,border:"1px solid #10B98144",borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <InputField label="Titre du document *" value={newApproval.titre} onChange={e=>setNewApproval(p=>({...p,titre:e.target.value}))} T={T} />
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Type</label>
                  <select value={newApproval.type} onChange={e=>setNewApproval(p=>({...p,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                    {["POLITIQUE","PROCEDURE","CHARTE","CONTRAT","RAPPORT","AUTRE"].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Urgence</label>
                  <select value={newApproval.urgence} onChange={e=>setNewApproval(p=>({...p,urgence:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                    {["CRITIQUE","HAUTE","NORMALE","FAIBLE"].map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Approbateur</label>
                  <select value={newApproval.approbateur} onChange={e=>setNewApproval(p=>({...p,approbateur:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                    {["DG","Manager Général","Responsable Conformité","Comité Direction"].map(a=><option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{if(!newApproval.titre)return;const n={id:"CA"+Date.now(),titre:newApproval.titre,type:newApproval.type,statut:"EN_ATTENTE",submittedBy:currentUser.name,date:today,urgence:newApproval.urgence,approbateur:newApproval.approbateur};saveApprovals([...approvals,n]);setNewApproval({titre:"",type:"POLITIQUE",urgence:"NORMALE",approbateur:"DG",notes:""});setShowNewApproval(false);}} style={{background:"#10B981",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Soumettre</button>
                <button onClick={()=>setShowNewApproval(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          {/* ── Filtres Conformité ── */}
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <input value={confSearch} onChange={e=>setConfSearch(e.target.value)} placeholder="🔍 Titre, type, responsable…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <select value={confTypeFilter} onChange={e=>setConfTypeFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">📂 Tous types</option>
              {[...new Set((approvals||[]).map(a=>a.type).filter(Boolean))].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select value={confStatutFilter} onChange={e=>setConfStatutFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🔍 Tous statuts</option>
              <option value="EN_ATTENTE">⏳ En attente</option>
              <option value="APPROUVE">✅ Approuvés</option>
              <option value="REFUSE">❌ Refusés</option>
            </select>
            <select value={confSort} onChange={e=>setConfSort(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="date_desc">↓ Plus récents</option>
              <option value="date_asc">↑ Plus anciens</option>
              <option value="titre">A→Z Titre</option>
            </select>
            <span style={{color:T.textDim,fontSize:10}}>{approvals.filter(a=>{const q=confSearch.toLowerCase();return(!q||(a.titre||"").toLowerCase().includes(q)||(a.type||"").toLowerCase().includes(q))&&(confTypeFilter==="ALL"||a.type===confTypeFilter)&&(confStatutFilter==="ALL"||a.status===confStatutFilter);}).length}/{approvals.length}</span>
          </div>
          {approvals.filter(a=>{
            const q=confSearch.toLowerCase();
            return(!q||(a.titre||"").toLowerCase().includes(q)||(a.type||"").toLowerCase().includes(q)||(a.responsable||"").toLowerCase().includes(q))
              &&(confTypeFilter==="ALL"||a.type===confTypeFilter)
              &&(confStatutFilter==="ALL"||a.status===confStatutFilter);
          }).sort((a,b)=>confSort==="date_asc"?(a.createdAt||"").localeCompare(b.createdAt||""):confSort==="titre"?(a.titre||"").localeCompare(b.titre||""): (b.createdAt||"").localeCompare(a.createdAt||"")).map(a=>{
            const colors={EN_ATTENTE:"#F59E0B",APPROUVE:"#22C55E",REFUSE:"#EF4444"};
            return(
              <div key={a.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
                <div style={{flex:1}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:12}}>{a.titre}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{a.type} · {a.date} · Soumis par {a.submittedBy} · Approbateur: {a.approbateur}</div>
                </div>
                <span style={{background:(colors[a.statut]||"#888")+"22",border:`1px solid ${(colors[a.statut]||"#888")}44`,color:colors[a.statut]||"#888",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{a.statut}</span>
                {canApprove && a.statut==="EN_ATTENTE" && (
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>saveApprovals(approvals.map(x=>x.id===a.id?{...x,statut:"APPROUVE"}:x))} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>✅ Approuver</button>
                    <button onClick={()=>saveApprovals(approvals.map(x=>x.id===a.id?{...x,statut:"REFUSE"}:x))} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>❌ Refuser</button>
                  </div>
                )}
                <button onClick={()=>{dsDeleteItemFromArray("gc-conffull-approvals",a.id);setApprovals(prev=>prev.filter(x=>x.id!==a.id));}} style={{background:"transparent",border:"none",color:"#C41E3A",cursor:"pointer",fontSize:12}}>🗑️</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── INDICATEURS ── */}
      {tab==="indicateurs" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:T.text,fontWeight:800,fontSize:13}}>📈 Indicateurs de Conformité</div>
            <button style={{background:"#10B98122",border:"1px solid #10B98144",color:"#10B981",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}} onClick={()=>{if(window.gcAIAsk){const rows=indicators.map(function(ind){return ind.label+": "+ind.valeur+"/"+ind.cible+ind.unit;}).join("\n");window.gcAIAsk("Analyse ces indicateurs de conformité et fournis un rapport avec recommandations :\n"+rows);}}}>✨ Analyse IA</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
            {indicators.map(ind=>{
              const pct=Math.min(Math.round(ind.valeur/ind.cible*100),100);
              const color=pct>=90?"#22C55E":pct>=70?"#F59E0B":"#EF4444";
              return(
                <div key={ind.id} style={{background:T.surface2,border:`1px solid ${color}33`,borderRadius:12,padding:"14px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div><div style={{color:T.text,fontWeight:700,fontSize:12}}>{ind.label}</div><div style={{color:T.textMuted,fontSize:10}}>{ind.cat}</div></div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color,fontWeight:900,fontSize:20}}>{ind.valeur}<span style={{fontSize:11,color:T.textMuted}}>{ind.unit}</span></div>
                      <div style={{color:T.textDim,fontSize:9}}>Cible : {ind.cible}{ind.unit}</div>
                    </div>
                  </div>
                  <div style={{background:T.surface3,borderRadius:99,height:6,overflow:"hidden",marginBottom:6}}>
                    <div style={{width:`${pct}%`,background:`linear-gradient(90deg,${color},${color}99)`,height:"100%",borderRadius:99,transition:"width 0.5s"}} />
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{color,fontSize:10,fontWeight:700}}>{pct}% de l'objectif</div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>saveIndicators(indicators.map(x=>x.id===ind.id?{...x,valeur:Math.max(0,x.valeur-1)}:x))} style={{background:T.surface3,border:"none",color:T.textMuted,borderRadius:4,width:22,height:22,cursor:"pointer",fontSize:11}}>-</button>
                      <button onClick={()=>saveIndicators(indicators.map(x=>x.id===ind.id?{...x,valeur:x.valeur+1}:x))} style={{background:T.surface3,border:"none",color:T.textMuted,borderRadius:4,width:22,height:22,cursor:"pointer",fontSize:11}}>+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── VEILLE IA ── */}
      {tab==="veille" && (
        <div>
          <div style={{display:"flex",gap:10,marginBottom:14}}>
            <input value={searchVeille} onChange={e=>setSearchVeille(e.target.value)}
              placeholder="🔭 Recherche réglementaire — normes, lois, obligations, OHADA, fiscal…"
              style={{flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",color:T.text,fontSize:12}}
              onKeyDown={e=>e.key==="Enter"&&handleVeilleSearch()} />
            <button onClick={handleVeilleSearch} disabled={veilleLoading||!searchVeille.trim()}
              style={{background:veilleLoading?"#1E3A5F":"linear-gradient(135deg,#10B981,#22C55E)",border:"none",color:"#fff",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>
              {veilleLoading?"⏳ Recherche…":"🤖 Veille IA"}
            </button>
          </div>
          {veilleResult && (
            <div style={{background:T.surface2,border:"2px solid #10B98133",borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{color:"#10B981",fontWeight:800,fontSize:12,marginBottom:10}}>🤖 Veille réglementaire — {searchVeille}</div>
              <pre style={{color:T.text,fontSize:11,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"'Segoe UI',sans-serif",margin:0,maxHeight:350,overflow:"auto"}}>{veilleResult}</pre>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button onClick={()=>{const v={id:"VC"+Date.now(),query:searchVeille,result:veilleResult,date:today};saveVeille([v,...veille]);setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📌",message:"Veille conformité sauvegardée",at:new Date().toISOString(),read:false,targetLevel:1},...p]);}}
                  style={{background:"#10B98122",border:"1px solid #10B98144",color:"#10B981",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>📌 Sauvegarder</button>
                <button onClick={()=>setVeilleResult(null)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11}}>✕ Fermer</button>
              </div>
            </div>
          )}
          {veille.slice(0,10).map(v=>(
            <div key={v.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0,marginTop:2}}>📌</span>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:700,fontSize:12}}>{v.query}</div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{v.date}</div>
                <div style={{color:T.textDim,fontSize:10,marginTop:3,fontStyle:"italic"}}>{(v.result||"").slice(0,120)}…</div>
              </div>
              <button onClick={()=>{dsDeleteItemFromArray("gc-conffull-veille",v.id);setVeille(prev=>prev.filter(x=>x.id!==v.id));}} style={{background:"transparent",border:"none",color:"#C41E3A",cursor:"pointer",fontSize:12}}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* ── SMQ & NON-CONFORMITÉS ── */}
      {tab==="smq_full" && (
        <div>
          <div style={{background:"linear-gradient(135deg,#10B98115,transparent)",border:"1px solid #10B98133",borderRadius:12,padding:"12px 16px",marginBottom:14}}>
            <div style={{color:"#10B981",fontWeight:800,fontSize:13,marginBottom:4}}>⚙️ SMQ — Cartographie & Non-conformités</div>
            <div style={{color:T.textMuted,fontSize:10}}>Approche par processus ISO 9001:2015 · PDCA · Registre des NC</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            {[
              {type:"P",label:"Pilotage",color:"#3B82F6",procs:["P01","P02","P03","P04"]},
              {type:"O",label:"Opérationnel",color:"#22C55E",procs:["O01","O02","O03"]},
              {type:"S",label:"Support",color:"#FF7900",procs:["S01","S02","S03","S04","S05","S06"]},
            ].map(g=>(
              <div key={g.type} style={{background:g.color+"10",border:`2px solid ${g.color}33`,borderRadius:10,padding:"10px 14px",gridColumn:g.type==="S"?"1/-1":"auto"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <span style={{background:g.color+"22",color:g.color,border:`1px solid ${g.color}55`,borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:900}}>{g.type}</span>
                  <span style={{color:g.color,fontWeight:700,fontSize:11}}>{g.label}</span>
                  <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Décris les exigences ISO 9001:2015 pour les processus de type "${g.label}" dans un cabinet de conseil au Gabon. Quels sont les indicateurs clés, interactions et points d'amélioration ?`)}
                    style={{background:"transparent",border:"none",color:g.color,cursor:"pointer",fontSize:10,fontWeight:700,marginLeft:"auto"}}>🤖 IA</button>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {g.procs.map(proc=>{
                    const procLabel=CODES.processes[proc]||proc;
                    const color=getProcColor(proc);
                    return <div key={proc} style={{background:T.surface3,border:`1px solid ${color}44`,borderRadius:6,padding:"4px 8px",fontSize:9}}>
                      <span style={{color,fontWeight:800,fontFamily:"monospace"}}>{proc}</span>
                      <span style={{color:T.textDim,marginLeft:5}}>{procLabel?.slice(0,18)}</span>
                    </div>;
                  })}
                </div>
              </div>
            ))}
          </div>
          <NonConformitesPanel T={T} currentUser={currentUser} setNotifications={setNotifications} taches={taches} setTaches={setTaches} />
        </div>
      )}

      {/* ── RÉFÉRENTIELS ── */}
      {tab==="referentiels" && (
        <div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{color:T.text,fontWeight:800,fontSize:13,marginBottom:12}}>📚 Référentiels & Standards</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
              {[
                {label:"ISO 9001:2015",icon:"🏆",color:"#3B82F6",desc:"Management de la qualité"},
                {label:"ISO 31000:2018",icon:"⚠️",color:"#F59E0B",desc:"Management des risques"},
                {label:"COSO 2013",icon:"🔍",color:"#8B5CF6",desc:"Contrôle interne — Cadre intégré"},
                {label:"OHADA — 17 actes",icon:"⚖️",color:"#DC2626",desc:"Droit des affaires africain"},
                {label:"GAFI / FATF 40 Rec.",icon:"🔐",color:"#EF4444",desc:"Lutte anti-blanchiment"},
                {label:"Normes ISA",icon:"📋",color:"#0EA5E9",desc:"Normes d'audit internationales"},
                {label:"IFRS / SYSCOHADA",icon:"💰",color:"#22C55E",desc:"Normes comptables"},
                {label:"RGPD-Afrique / APDP",icon:"🛡️",color:"#06B6D4",desc:"Protection données personnelles"},
              ].map(r=>(
                <div key={r.label} className="gc-hover-card" style={{background:T.surface3,border:`2px solid ${r.color}33`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:18}}>{r.icon}</span>
                    <div style={{flex:1}}><div style={{color:r.color,fontWeight:800,fontSize:11}}>{r.label}</div><div style={{color:T.textDim,fontSize:9}}>{r.desc}</div></div>
                  </div>
                  <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Explique le référentiel "${r.label}" (${r.desc}) : principes clés, exigences, mise en œuvre dans un cabinet au Gabon, bénéfices et défis.`)}
                    style={{width:"100%",background:`${r.color}22`,border:`1px solid ${r.color}44`,color:r.color,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontWeight:700,fontSize:10}}>🤖 En savoir plus</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PROCÉDURES (lvl >= 4) ── */}
      {tab==="procedures" && lvl>=4 && (
        <div>
          <div style={{color:T.text,fontWeight:800,fontSize:13,marginBottom:12}}>📑 Procédures de Conformité</div>
          {[
            {titre:"Procédure KYC — Identification Client",code:"CONF-KYC-001",domaine:"LCB-FT",desc:"Protocole d'identification et vérification des bénéficiaires effectifs"},
            {titre:"Procédure de gestion des déclarations de soupçon",code:"CONF-DS-001",domaine:"LCB-FT",desc:"Processus de déclaration à l'ANIF (Agence Nationale d'Investigation Financière)"},
            {titre:"Procédure de mise à jour du registre des traitements",code:"CONF-RGPD-002",domaine:"RGPD",desc:"Revue annuelle et mise à jour du registre conformément à l'APDP Gabon"},
            {titre:"Procédure de gestion des violations de données",code:"CONF-VD-001",domaine:"RGPD",desc:"Protocole de notification et réponse aux incidents de sécurité des données"},
            {titre:"Procédure fiscale trimestrielle",code:"CONF-FISC-002",domaine:"Fiscal",desc:"Calendrier et processus de déclarations fiscales IS, TVA, IRPP"},
          ].map(p=>(
            <div key={p.code} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:40,height:40,borderRadius:8,background:"#10B98122",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📑</div>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:700,fontSize:12}}>{p.titre}</div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{p.code} · {p.domaine}</div>
                <div style={{color:T.textDim,fontSize:10,marginTop:2}}>{p.desc}</div>
              </div>
              <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Rédige la procédure de conformité "${p.titre}" (${p.code}) pour un cabinet de conseil au Gabon. Inclure : objectif, champ d'application, étapes détaillées, responsabilités, documents associés, indicateurs de performance.`)}
                style={{background:"#10B98122",border:"1px solid #10B98144",color:"#10B981",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>🤖 Générer</button>
            </div>
          ))}
        </div>
      )}

      {/* ── KYC WORKFLOWS ── */}
      {tab==="kyc_workflows" && (
        <KYCWorkflowsPanel
          T={T}
          currentUser={currentUser}
          kycWorkflows={kycWorkflows}
          setKycWorkflows={setKycWorkflows}
          users={users}
          canManageKYC={lvl >= 4 || currentUser?.process === 'P02' || currentUser?.process === 'P03'}
        />
      )}
    </div>
  );
}


