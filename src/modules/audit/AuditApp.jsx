import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// AuditApp.jsx — SI Génie Consultant v129
import { _lsGet, _lsSet, _noop, playSound, gcAIAsk, dsSave, dsDeleteItemFromArray } from '../../core/index.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, gcOpenPrintWindow } from '../../components/UI.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function AuditApp({ T, currentUser, setNotifications=_noop, setTaches=_noop, riskMatrix, setRiskMatrix=_noop, newRisk, setNewRisk=_noop, addRisk, auditTool, setAuditTool=_noop }){
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const MOIS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
  const STATUS_COLORS = {PLANIFIE:"#3B82F6",EN_COURS:"#F59E0B",REALISE:"#22C55E",REPORTE:"#F97316",ANNULE:"#EF4444"};
  const PC = {CRITIQUE:"#EF4444",HAUTE:"#F59E0B",NORMALE:"#3B82F6",FAIBLE:"#22C55E"};
  const IC = {FINANCE:"#C9A84C",OPERATIONNEL:"#3B82F6",CONFORMITE:"#A855F7",REPUTATIONNEL:"#F97316"};
  const SC = {OUVERT:"#EF4444",EN_COURS:"#F59E0B",CLOS:"#22C55E"};
  const PHASES = ["Prise de connaissance","Évaluation CI","Tests des procédures","Tests de substance","Rapport & conclusions"];

  const [tpaMissions, setTpaMissions] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-tpa")||"[]");}catch (_) {return [];}});
  const [showTpaForm, setShowTpaForm] = React.useState(false);
  const [tpaForm, setTpaForm] = React.useState({mission:"",processus:"",responsable:"",priorite:"HAUTE",periodicite:"ANNUEL",mois:[],statut:"PLANIFIE"});

  const [progs, setProgs] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-audit-prog")||"[]");}catch (_) {return [];}});
  const [selProg, setSelProg] = React.useState(null);
  const [showProgForm, setShowProgForm] = React.useState(false);
  const [progForm, setProgForm] = React.useState({mission:"",entite:"",periode:"",objectifs:"",auditeur:currentUser?.name||""});

  const [tests, setTests] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-feuille-tests")||"[]");}catch (_) {return [];}});
  const [testForm, setTestForm] = React.useState({mission:"",objectif:"",type:"SUBSTANCE",echantillon:"",anomalies:"0",observations:"",conclusion:""});
  const [testAiLoading, setTestAiLoading] = React.useState(false);

  const [actions, setActions] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-audit-actions")||"[]");}catch (_) {return [];}});
  const [actionForm, setActionForm] = React.useState({constat:"",cause:"",recommandation:"",responsable:"",echeance:"",priorite:"HAUTE",impact:"OPERATIONNEL",avancement:0});
  const [actionAiLoading, setActionAiLoading] = React.useState(false);

  const [checkState, setCheckState] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-audit-checklist")||"{}");}catch (_) {return {};}});
  const [customChecklists, setCustomChecklists] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-audit-checklist-custom")||"[]");}catch (_) {return [];}});
  const [rapportData, setRapportData] = React.useState({mission:"",entite:"",periode:"",scope:"",constats:"",recommandations:"",conclusion:""});
  const [generated, setGenerated] = React.useState("");
  const [rapportLoading, setRapportLoading] = React.useState(false);

  // EDIT / DELETE states
  const [editModal, setEditModal] = React.useState(null);
  const [confirmDel, setConfirmDel] = React.useState(null);
  // ── Filtres Audit ──────────────────────────────────────────────────
  const [tpaSearch, setTpaSearch] = React.useState("");
  const [tpaStatusFilter, setTpaStatusFilter] = React.useState("ALL");
  const [tpaPrioFilter, setTpaPrioFilter] = React.useState("ALL");
  const [riskSearch, setRiskSearch] = React.useState("");
  const [riskNivFilter, setRiskNivFilter] = React.useState("ALL");
  const [riskStatutFilter, setRiskStatutFilter] = React.useState("ALL");
  const [riskSort, setRiskSort] = React.useState("score_desc");
  const [actionsSearch, setActionsSearch] = React.useState("");
  const [actionsPrioFilter, setActionsPrioFilter] = React.useState("ALL");
  const [actionsStatutFilter, setActionsStatutFilter] = React.useState("ALL");
  const saveTpa = (d) => { try{_lsSet("gc-tpa",JSON.stringify(d)); dsSave("gc-tpa",d).catch(err => gcToast.syncError('', err));}catch (_) {} };
  const saveProgs = (d) => { try{_lsSet("gc-audit-prog",JSON.stringify(d)); dsSave("gc-audit-prog",d).catch(err => gcToast.syncError('', err));}catch (_) {} };
  const saveTests = (d) => { try{_lsSet("gc-feuille-tests",JSON.stringify(d)); dsSave("gc-feuille-tests",d).catch(err => gcToast.syncError('', err));}catch (_) {} };
  const saveActions = (d) => { try{_lsSet("gc-audit-actions",JSON.stringify(d)); dsSave("gc-audit-actions",d).catch(err => gcToast.syncError('', err));}catch (_) {} };
  const saveChecks = (d) => { try{_lsSet("gc-audit-checklist",JSON.stringify(d)); dsSave("gc-audit-checklist",d).catch(err => gcToast.syncError('', err));}catch (_) {} };

  // ── État hoissé : grille_taches (ex-IIFE — Rules of Hooks) ──────────────
  const [gTaches, setGTaches] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-audit-grille-taches")||"[]");}catch(_){return [];}});
  const [gForm, setGForm] = React.useState({tache:"",responsable:"",frequence:"MENSUEL",typeControle:"PREVENTIF",criticite:"NORMALE",automatise:"NON",documentation:"NON",effectivite:"NON_TESTE",observation:""});
  const [showGForm, setShowGForm] = React.useState(false);
  const saveG = v=>{setGTaches(v);try{_lsSet("gc-audit-grille-taches",JSON.stringify(v)); dsSave("gc-audit-grille-taches",v).catch(err => gcToast.syncError('', err));}catch(_){}};

  // ── État hoissé : pca_audit ──────────────────────────────────────────────
  const [pcaRisques, setPcaRisques] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-pca-risques")||"[]");}catch(_){return [];}});
  const [pcaProc, setPcaProc] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-pca-procedures")||"[]");}catch(_){return [];}});
  const [pcaTest, setPcaTest] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-pca-tests")||"[]");}catch(_){return [];}});
  const [pcaTab, setPcaTab] = React.useState("risques");
  const [pcaRForm, setPcaRForm] = React.useState({scenario:"",probabilite:"MOYENNE",impact:"GRAVE",rto:"4h",rpo:"24h",responsable:"",mesure:"",statut:"IDENTIFIÉ"});
  const [pcaPForm, setPcaPForm] = React.useState({titre:"",type:"REPRISE",declencheur:"",etapes:"",responsable:"",duree:"",ressources:"",contact_urgence:""});
  const [showPcaR, setShowPcaR] = React.useState(false);
  const [showPcaP, setShowPcaP] = React.useState(false);
  const savePcaR = v=>{setPcaRisques(v);try{_lsSet("gc-pca-risques",JSON.stringify(v)); dsSave("gc-pca-risques",v).catch(err => gcToast.syncError('', err));}catch(_){}};
  const savePcaP = v=>{setPcaProc(v);try{_lsSet("gc-pca-procedures",JSON.stringify(v)); dsSave("gc-pca-procedures",v).catch(err => gcToast.syncError('', err));}catch(_){}};
  const savePcaT = v=>{setPcaTest(v);try{_lsSet("gc-pca-tests",JSON.stringify(v)); dsSave("gc-pca-tests",v).catch(err => gcToast.syncError('', err));}catch(_){}};

  // ── État hoissé : coso FULL CRUD ────────────────────────────────────────
  const [cosoScores, setCosoScores] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-coso-scores")||"{}");}catch(_){return {};}});
  const saveCosoScores = v=>{setCosoScores(v);try{_lsSet("gc-coso-scores",JSON.stringify(v));dsSave('gc-coso-scores',v).catch(err => gcToast.syncError('', err));}catch(_){}};
  const [cosoTab, setCosoTab] = React.useState("eval");
  const [cosoCustomQ, setCosoCustomQ] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-coso-custom-q")||"[]");}catch(_){return [];}});
  const saveCosoCustomQ = v=>{setCosoCustomQ(v);try{_lsSet("gc-coso-custom-q",JSON.stringify(v));dsSave('gc-coso-custom-q',v).catch(err => gcToast.syncError('', err));}catch(_){}};
  const [cosoNewQ, setCosoNewQ] = React.useState({composante:"env_ctrl",question:""});
  const [cosoNotes, setCosoNotes] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-coso-notes")||"[]");}catch(_){return [];}});
  const saveCosoNotes = v=>{setCosoNotes(v);try{_lsSet("gc-coso-notes",JSON.stringify(v));dsSave('gc-coso-notes',v).catch(err => gcToast.syncError('', err));}catch(_){}};
  const [cosoEditComp, setCosoEditComp] = React.useState(null);
  const [cosoNoteForm, setCosoNoteForm] = React.useState({composante:"",texte:"",type:"OBSERVATION"});
  const [showCosoNoteForm, setShowCosoNoteForm] = React.useState(false);

  // ── État hoissé : organigramme CRUD ─────────────────────────────────────
  const [orgigramSelected, setOrgigramSelected] = React.useState(null);
  const [orgigramNodes, setOrgigramNodes] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-orgigram-nodes")||"null");}catch(_){return null;}});
  const [orgigramLinks, setOrgigramLinks] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-orgigram-links")||"null");}catch(_){return null;}});
  const [orgigramEditMode, setOrgigramEditMode] = React.useState(false);
  const [orgigramNodeForm, setOrgigramNodeForm] = React.useState({id:"",label:"",role:"",responsable:"",color:"#3B82F6",type:"SUPPORT"});
  const [showOrgigramNodeForm, setShowOrgigramNodeForm] = React.useState(false);
  const [orgigramLinkForm, setOrgigramLinkForm] = React.useState({from:"",to:"",type:"hierarchique"});
  const [showOrgigramLinkForm, setShowOrgigramLinkForm] = React.useState(false);
  const saveOrgigramNodes = v=>{setOrgigramNodes(v);try{_lsSet("gc-orgigram-nodes",JSON.stringify(v));}catch(_){}};
  const saveOrgigramLinks = v=>{setOrgigramLinks(v);try{_lsSet("gc-orgigram-links",JSON.stringify(v));}catch(_){}};

  // ── État hoissé : grille_taches enrichie ─────────────────────────────────
  const [gTacheEditId, setGTacheEditId] = React.useState(null);
  const [gFilter, setGFilter] = React.useState("TOUS");
  const [gFilterEff, setGFilterEff] = React.useState("TOUS");

  const addTpaMission = () => {
    if(!tpaForm.mission.trim()) return;
    const u=[...tpaMissions,{...tpaForm,id:Date.now()}]; setTpaMissions(u); saveTpa(u);
    setTpaForm({mission:"",processus:"",responsable:"",priorite:"HAUTE",periodicite:"ANNUEL",mois:[],statut:"PLANIFIE"}); setShowTpaForm(false);
  };
  const toggleTpaMois = (m) => setTpaForm(f=>({...f,mois:f.mois.includes(m)?f.mois.filter(x=>x!==m):[...f.mois,m]}));
  const toggleTpaStatut = (id,statut) => { const u=tpaMissions.map(m=>m.id===id?{...m,statut}:m); setTpaMissions(u); saveTpa(u); };

  const addProg = () => {
    if(!progForm.mission.trim()) return;
    const np={...progForm,id:Date.now(),phases:PHASES.map(p=>({nom:p,complete:false})),createdAt:new Date().toISOString()};
    const u=[...progs,np]; setProgs(u); saveProgs(u); setSelProg(np); setShowProgForm(false);
    setProgForm({mission:"",entite:"",periode:"",objectifs:"",auditeur:currentUser?.name||""});
  };
  const togglePhase = (pid,pi) => {
    const u=progs.map(p=>{if(p.id!==pid) return p; const ph=[...p.phases]; ph[pi]={...ph[pi],complete:!ph[pi].complete}; return {...p,phases:ph};});
    setProgs(u); saveProgs(u); setSelProg(u.find(x=>x.id===pid)||null);
  };

  const addTest = () => {
    if(!testForm.mission.trim()) return;
    const u=[...tests,{...testForm,id:Date.now(),date:new Date().toISOString().split("T")[0],auditeur:currentUser?.name||""}];
    setTests(u); saveTests(u); setTestForm({mission:"",objectif:"",type:"SUBSTANCE",echantillon:"",anomalies:"0",observations:"",conclusion:""});
  };
  const genConclusion = async (t) => {
    setTestAiLoading(true);
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:400,messages:[{role:"user",content:`Tu es un auditeur expérimenté OHADA/ISA. Rédige une conclusion d'audit (3-4 phrases) pour:\nMission: ${t.mission}\nType: ${t.type}\nObjectif: ${t.objectif}\nÉchantillon: ${t.echantillon}\nAnomalies: ${t.anomalies}\nObservations: ${t.observations}`}]})});
      const d=await r.json(); const txt=d.content?.map(x=>x.text||"").join("")||"";
      const u=tests.map(x=>x.id===t.id?{...x,conclusion:txt}:x); setTests(u); saveTests(u);
    }catch (_) {}finally{setTestAiLoading(false);}
  };

  const addAction = () => {
    if(!actionForm.constat.trim()) return;
    const u=[...actions,{...actionForm,id:Date.now(),statut:"OUVERT",createdAt:new Date().toISOString()}];
    setActions(u); saveActions(u); setActionForm({constat:"",cause:"",recommandation:"",responsable:"",echeance:"",priorite:"HAUTE",impact:"OPERATIONNEL",avancement:0});
  };
  const updateAvancement = async (id,val) => { const u=actions.map(a=>a.id===id?{...a,avancement:val,statut:val>=100?"CLOS":val>0?"EN_COURS":"OUVERT"}:a); setActions(u); saveActions(u); };
  const genReco = async () => {
    if(!actionForm.constat.trim()) return;
    setActionAiLoading(true);
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:300,messages:[{role:"user",content:`Tu es un auditeur senior. Pour ce constat: "${actionForm.constat}"\nCause: "${actionForm.cause}"\nRédige une recommandation d'audit concise (2-3 phrases) orientée action corrective:`}]})});
      const d=await r.json(); const txt=d.content?.map(x=>x.text||"").join("")||"";
      setActionForm(f=>({...f,recommandation:txt}));
    }catch (_) {}finally{setActionAiLoading(false);}
  };

  const toggleCheck = async (key) => { const n={...checkState,[key]:!checkState[key]}; setCheckState(n); saveChecks(n); };

  const genRapport = async () => {
    setRapportLoading(true); setGenerated("");
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,messages:[{role:"user",content:`Tu es Directeur d'Audit interne senior en Afrique centrale. Rédige un rapport d'audit professionnel (normes ISA/IIA) pour:\n\nMission: ${rapportData.mission}\nEntité: ${rapportData.entite}\nPériode: ${rapportData.periode}\nScope: ${rapportData.scope}\nConstats: ${rapportData.constats}\nRecommandations: ${rapportData.recommandations}\nConclusion: ${rapportData.conclusion}\n\nStructure: Résumé exécutif | Objectifs & Méthodologie | Constats & Analyses | Recommandations prioritaires | Conclusion & Opinion d'audit`}]})});
      const d=await r.json(); setGenerated(d.content?.map(x=>x.text||"").join("")||"Erreur");
    }catch(e){setGenerated("Erreur: "+e.message);}finally{setRapportLoading(false);}
  };

  const tpaStats = {total:tpaMissions.length, realise:tpaMissions.filter(m=>m.statut==="REALISE").length, enCours:tpaMissions.filter(m=>m.statut==="EN_COURS").length, planifie:tpaMissions.filter(m=>m.statut==="PLANIFIE").length};

  const CHECKLIST_CATS = [
    {cat:"Gouvernance & Organisation",items:["Organigramme à jour","Séparation des tâches respectée","Pouvoirs de délégation documentés","Procédures formalisées","Revue de direction effectuée"]},
    {cat:"Contrôle interne",items:["Dispositif de CI évalué","Tests de contrôle réalisés","Déficiences identifiées","Recommandations émises","Suivi recommandations antérieures"]},
    {cat:"Comptabilité & Finance",items:["Rapprochement bancaire mensuel","Validation imputations comptables","Contrôle arrêtés de compte","Revue postes sensibles","Validation TVA et fiscal"]},
    {cat:"Conformité réglementaire",items:["Conformité OHADA vérifiée","Obligations fiscales respectées","Obligations sociales à jour","Déclarations statutaires déposées","Contrats revus et validés"]}
  ];

  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"nowrap",overflowX:"auto"}} className="gc-tabs-scroll">
        {[["dashboard","📊","Tableau de bord"],["tpa","🗓️","Plan d'Audit (TPA)"],["risque","⚠️","Registre des Risques"],["programme","📋","Programme d'audit"],["tests","🧪","Feuilles de test"],["grille_taches","📐","Contrôles & Effectivité"],["pca_audit","🛡️","PCA / Continuité"],["coso","🏛️","COSO — Contrôle Interne"],["organigramme","🏢","Cartographie & Org."],["actions","🎯","Plans d'action"],["checklist","✅","Checklist ISO/IIA"],["rapport","📄","Rapport d'audit"]].map(([id,icon,label])=>(
          <button key={id} onClick={()=>setAuditTool(id)} style={{background:auditTool===id?"#C41E3A22":"transparent",border:`1px solid ${auditTool===id?"#C41E3A66":T.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",color:auditTool===id?"#C41E3A":T.textMuted,fontWeight:auditTool===id?700:400,fontSize:12,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>
            <span>{icon}</span><span className="gc-hide-sm">{label}</span>
          </button>
        ))}
      </div>

      {auditTool==="dashboard" && (() => {
        const risquesByCritique = riskMatrix.filter(r=>r.statut==="OUVERT"&&(r.impact||"NORMALE")==="CRITIQUE").length;
        const actionsClos = actions.filter(a=>a.statut==="CLOS").length;
        const actionsOuvert = actions.filter(a=>a.statut==="OUVERT").length;
        const totalChecks = Object.keys(checkState).length;
        const validatedChecks = Object.values(checkState).filter(Boolean).length;
        const risquesTotal = riskMatrix.length;
        const risquesOuverts = riskMatrix.filter(r=>r.statut==="OUVERT").length;
        const avancMoyen = actions.length>0 ? Math.round(actions.reduce((s,a)=>s+(a.avancement||0),0)/actions.length) : 0;
        return (
          <div>
            {/* Alertes critiques */}
            {risquesByCritique>0 && (
              <div onClick={()=>setAuditTool("risque")} style={{background:"#EF444415",border:"1px solid #EF444444",borderRadius:10,padding:"10px 14px",marginBottom:12,cursor:"pointer",display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:18}}>🔴</span>
                <div style={{flex:1}}><span style={{color:"#EF4444",fontWeight:800,fontSize:12}}>{risquesByCritique} risque(s) CRITIQUE(S) ouvert(s)</span><span style={{color:T.textMuted,fontSize:10,marginLeft:8}}>— Cliquez pour voir la matrice</span></div>
                <span style={{color:"#EF4444",fontWeight:700,fontSize:11}}>→</span>
              </div>
            )}
            {actionsOuvert>0 && (
              <div onClick={()=>setAuditTool("actions")} style={{background:"#F59E0B12",border:"1px solid #F59E0B33",borderRadius:10,padding:"9px 14px",marginBottom:12,cursor:"pointer",display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:16}}>⚠️</span>
                <div style={{flex:1}}><span style={{color:"#F59E0B",fontWeight:700,fontSize:11}}>{actionsOuvert} plan(s) d'action ouvert(s) à traiter</span></div>
                <span style={{color:"#F59E0B",fontSize:11}}>→</span>
              </div>
            )}
            {/* KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
              {[
                {label:"Missions TPA",v:tpaStats.total,sub:`${tpaStats.realise} réalisées · ${tpaStats.enCours} en cours`,c:"#C41E3A",icon:"🗓️",action:"tpa"},
                {label:"Risques ouverts",v:risquesOuverts,sub:`${risquesTotal} total · ${risquesByCritique} critiques`,c:"#EF4444",icon:"⚠️",action:"risque"},
                {label:"Plans d'action",v:actions.length,sub:`${actionsClos} clos · ${actionsOuvert} ouverts · moy ${avancMoyen}%`,c:"#3B82F6",icon:"🎯",action:"actions"},
                {label:"Checklist",v:`${validatedChecks}/${totalChecks||"?"}`,sub:totalChecks>0?`${Math.round(validatedChecks/totalChecks*100)}% validé`:"À compléter",c:"#22C55E",icon:"✅",action:"checklist"},
              ].map(kpi=>(
                <div key={kpi.label} className="gc-hover-card" style={{background:T.surface2,border:`2px solid ${kpi.c}33`,borderRadius:12,padding:"14px 12px",cursor:"pointer"}} onClick={()=>setAuditTool(kpi.action)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontSize:22}}>{kpi.icon}</span><span style={{background:kpi.c+"20",color:kpi.c,borderRadius:5,padding:"2px 7px",fontSize:8,fontWeight:700}}>Audit</span></div>
                  <div style={{color:kpi.c,fontWeight:900,fontSize:22,lineHeight:1}}>{kpi.v}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:4,fontWeight:700}}>{kpi.label}</div>
                  <div style={{color:T.textDim,fontSize:9,marginTop:2}}>{kpi.sub}</div>
                </div>
              ))}
            </div>
            {/* Graphiques */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              {/* Plan TPA */}
              <div style={{background:T.surface2,border:"1px solid #C41E3A33",borderRadius:12,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <h4 style={{color:"#C41E3A",margin:0,fontSize:12,fontWeight:800}}>🗓️ Exécution TPA</h4>
                  <button onClick={()=>setAuditTool("tpa")} style={{background:"#C41E3A22",border:"1px solid #C41E3A44",color:"#C41E3A",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontSize:10,fontWeight:700}}>Voir →</button>
                </div>
                {[
                  {l:"Réalisé",v:tpaStats.realise,c:"#22C55E"},
                  {l:"En cours",v:tpaStats.enCours,c:"#F59E0B"},
                  {l:"Planifié",v:tpaStats.planifie,c:"#3B82F6"},
                  {l:"Reporté",v:tpaMissions.filter(m=>m.statut==="REPORTE").length,c:"#F97316"},
                ].map(sg=>{const pct=tpaStats.total>0?Math.round(sg.v/tpaStats.total*100):0;return (
                  <div key={sg.l} style={{marginBottom:7}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{color:T.text,fontSize:10,fontWeight:600}}>{sg.l}</span>
                      <span style={{color:sg.c,fontSize:10,fontWeight:700}}>{sg.v} ({pct}%)</span>
                    </div>
                    <div style={{height:5,background:T.surface3,borderRadius:3}}><div style={{width:pct+"%",height:"100%",background:sg.c,borderRadius:3,transition:"width 0.6s"}}/></div>
                  </div>
                );})}
                {tpaStats.total===0&&<div style={{color:T.textMuted,fontSize:10,textAlign:"center",padding:10}}>Aucune mission — <button onClick={()=>setAuditTool("tpa")} style={{background:"none",border:"none",color:"#C41E3A",cursor:"pointer",fontWeight:700,fontSize:10}}>Créer →</button></div>}
              </div>
              {/* Risques par impact */}
              <div style={{background:T.surface2,border:"1px solid #EF444433",borderRadius:12,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <h4 style={{color:"#EF4444",margin:0,fontSize:12,fontWeight:800}}>⚠️ Risques par priorité</h4>
                  <button onClick={()=>setAuditTool("risque")} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontSize:10,fontWeight:700}}>Voir →</button>
                </div>
                {[{l:"Critique",c:"#EF4444",k:"CRITIQUE"},{l:"Haute",c:"#F59E0B",k:"HAUTE"},{l:"Normale",c:"#3B82F6",k:"NORMALE"},{l:"Faible",c:"#22C55E",k:"FAIBLE"}].map(sg=>{
                  const cnt=riskMatrix.filter(r=>r.statut==="OUVERT"&&(r.impact||"NORMALE")===sg.k).length;
                  const pct=risquesOuverts>0?Math.round(cnt/risquesOuverts*100):0;
                  return (
                    <div key={sg.l} style={{marginBottom:7}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                        <span style={{color:T.text,fontSize:10,fontWeight:600}}>{sg.l}</span>
                        <span style={{color:sg.c,fontSize:10,fontWeight:700}}>{cnt}</span>
                      </div>
                      <div style={{height:5,background:T.surface3,borderRadius:3}}><div style={{width:pct+"%",height:"100%",background:sg.c,borderRadius:3}}/></div>
                    </div>
                  );
                })}
                {risquesTotal===0&&<div style={{color:T.textMuted,fontSize:10,textAlign:"center",padding:10}}>Aucun risque enregistré</div>}
              </div>
            </div>
            {/* Actions rapides IA */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
              <div style={{color:"#C41E3A",fontWeight:800,fontSize:12,marginBottom:10}}>⚡ Accès rapide & IA Audit</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
                {[
                  {l:"Nouveau plan TPA",a:"tpa",i:"🗓️",c:"#C41E3A"},
                  {l:"Ajouter risque",a:"risque",i:"⚠️",c:"#EF4444"},
                  {l:"Heat Map",a:"heatmap",i:"🔥",c:"#F97316"},
                  {l:"Grille contrôles",a:"grille_taches",i:"📐",c:"#3B82F6"},
                  {l:"PCA Continuité",a:"pca_audit",i:"🛡️",c:"#7C3AED"},
                  {l:"COSO / CI",a:"coso",i:"🏛️",c:"#F59E0B"},
                  {l:"Organigramme",a:"organigramme",i:"🗂️",c:"#06B6D4"},
                  {l:"Programme audit",a:"programme",i:"📋",c:"#A855F7"},
                  {l:"Rapport IA",a:"rapport",i:"📄",c:"#22C55E"},
                ].map(a=>(
                  <button key={a.l} onClick={()=>setAuditTool(a.a)} style={{background:a.c+"15",border:`1px solid ${a.c}33`,borderRadius:8,padding:"9px 8px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,textAlign:"left"}}>
                    <span style={{fontSize:15}}>{a.i}</span><span style={{color:T.text,fontSize:10,fontWeight:600}}>{a.l}</span>
                  </button>
                ))}
              </div>
              <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Synthèse audit Génie Consultant : ${tpaStats.total} missions (${tpaStats.realise} réalisées), ${risquesOuverts} risques ouverts (${risquesByCritique} critiques), ${actionsOuvert} actions en cours. Génère un rapport de situation d'audit synthétique avec priorités et recommandations.`)} style={{background:"#C41E3A22",border:"1px solid #C41E3A44",color:"#C41E3A",borderRadius:8,padding:"9px 14px",cursor:"pointer",fontWeight:700,fontSize:11,marginTop:10,width:"100%"}}>
                🤖 Rapport de situation IA
              </button>
            </div>
          </div>
        );
      })()}

      {auditTool==="tpa" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
            {[{label:"Missions totales",val:tpaStats.total,color:"#C41E3A"},{label:"Réalisées",val:tpaStats.realise,color:"#22C55E"},{label:"En cours",val:tpaStats.enCours,color:"#F59E0B"},{label:"Planifiées",val:tpaStats.planifie,color:"#3B82F6"}].map(s=>(
              <div key={s.label} style={{background:T.surface2,border:`1px solid ${s.color}44`,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.val}</div>
                <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{color:"#C41E3A",fontWeight:800,fontSize:13}}>🗓️ Tableau Périodique d'Audit (TPA)</div>
            <button onClick={()=>setShowTpaForm(v=>!v)} style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nouvelle mission</button>
          </div>
          {/* ── Filtres TPA ── */}
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <input value={tpaSearch} onChange={e=>setTpaSearch(e.target.value)} placeholder="🔍 Mission, processus, responsable…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <select value={tpaStatusFilter} onChange={e=>setTpaStatusFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🔍 Tous statuts</option>
              {Object.keys(STATUS_COLORS||{}).map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
            </select>
            <select value={tpaPrioFilter} onChange={e=>setTpaPrioFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🎯 Toutes priorités</option>
              {Object.keys(PC||{}).map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <span style={{color:T.textDim,fontSize:10}}>{tpaMissions.filter(m=>{const q=tpaSearch.toLowerCase();return(!q||(m.mission||"").toLowerCase().includes(q)||(m.processus||"").toLowerCase().includes(q))&&(tpaStatusFilter==="ALL"||m.statut===tpaStatusFilter)&&(tpaPrioFilter==="ALL"||m.priorite===tpaPrioFilter);}).length}/{tpaMissions.length}</span>
          </div>
          {showTpaForm && (
            <div style={{background:T.surface2,border:`1px solid #C41E3A44`,borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
                {[["Mission / Thème","mission"],["Processus","processus"],["Responsable","responsable"]].map(([l,k])=>(
                  <div key={k}><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>{l}</label><input value={tpaForm[k]} onChange={e=>setTpaForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
                ))}
                <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Priorité</label>
                  <select value={tpaForm.priorite} onChange={e=>setTpaForm(f=>({...f,priorite:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                    {["CRITIQUE","HAUTE","NORMALE","FAIBLE"].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div style={{marginBottom:8}}><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4}}>Mois planifiés</label>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {MOIS.map((m,i)=>(
                    <button key={m} onClick={()=>toggleTpaMois(i+1)} style={{background:tpaForm.mois.includes(i+1)?"#C41E3A":"transparent",border:`1px solid ${tpaForm.mois.includes(i+1)?"#C41E3A":T.border}`,borderRadius:5,padding:"4px 8px",cursor:"pointer",color:tpaForm.mois.includes(i+1)?"#fff":T.textMuted,fontSize:10,fontWeight:700}}>{m}</button>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addTpaMission} style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Ajouter</button>
                <button onClick={()=>setShowTpaForm(false)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 18px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:T.surface3}}>
                {["Mission","Processus","Resp.","Priorité","J","F","M","A","M","J","J","A","S","O","N","D","Statut","✕"].map(h=><th key={h} style={{padding:"8px 6px",textAlign:"left",color:T.textMuted,fontWeight:700,fontSize:10,border:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {tpaMissions.length===0 && <tr><td colSpan={18} style={{padding:20,textAlign:"center",color:T.textDim,fontSize:11}}>Aucune mission planifiée. Cliquez sur "+ Nouvelle mission".</td></tr>}
                {tpaMissions.map(m=>{
                  const pc=PC[m.priorite]||"#888";
                  return <tr key={m.id} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"6px 8px",color:T.text,fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>{m.mission}</td>
                    <td style={{padding:"6px 8px",color:T.textMuted,fontSize:10}}>{m.processus}</td>
                    <td style={{padding:"6px 8px",color:T.textMuted,fontSize:10}}>{m.responsable}</td>
                    <td style={{padding:"6px 6px"}}><span style={{background:pc+"22",color:pc,border:`1px solid ${pc}44`,borderRadius:4,padding:"2px 5px",fontSize:9,fontWeight:700}}>{m.priorite}</span></td>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(i=>(
                      <td key={i} style={{padding:"4px 3px",textAlign:"center",background:m.mois.includes(i)?(STATUS_COLORS[m.statut]||"#C41E3A")+"33":"transparent",border:`1px solid ${T.border}`}}>
                        {m.mois.includes(i)&&<span style={{fontSize:9,color:STATUS_COLORS[m.statut]||"#C41E3A",fontWeight:700}}>✓</span>}
                      </td>
                    ))}
                    <td style={{padding:"4px 6px"}}>
                      <select value={m.statut} onChange={e=>toggleTpaStatut(m.id,e.target.value)} style={{background:"transparent",border:`1px solid ${(STATUS_COLORS[m.statut]||"#888")}44`,borderRadius:5,padding:"3px 4px",color:STATUS_COLORS[m.statut]||"#888",fontSize:9,fontWeight:700,cursor:"pointer"}}>
                        {["PLANIFIE","EN_COURS","REALISE","REPORTE","ANNULE"].map(s=><option key={s} style={{background:T.surface3,color:T.text}}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{padding:"4px 6px"}}>
                      <div style={{display:"flex",gap:3}}>
                        <button onClick={()=>setEditModal({type:"tpa",item:{...m}})} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:9}}>✏️</button>
                        <button onClick={()=>setConfirmDel({type:"tpa",id:m.id,label:m.mission})} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {auditTool==="risque" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{color:"#EF4444",fontWeight:800,fontSize:13}}>⚠️ Registre des Risques — Matrice & Heatmap</div>
              <div style={{color:T.textDim,fontSize:10}}>Cotation Probabilité×Impact · Heatmap · CRUD complet · Export CSV</div>
            </div>
            <button onClick={()=>setNewRisk({domaine:"",risque:"",cause:"",controle:"",responsable:"",probabilite:3,impact:3,statut:"OUVERT"})} style={{background:"#EF4444",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>➕ Nouveau risque</button>
          </div>
          {newRisk!==null&&(
            <div style={{background:T.surface2,border:"1px solid #EF444444",borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{color:"#EF4444",fontWeight:700,fontSize:12,marginBottom:10}}>{newRisk.id?"✏️ Modifier":"➕ Nouveau risque"}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[["Domaine / Processus","domaine"],["Cause principale","cause"],["Contrôle en place","controle"],["Responsable","responsable"]].map(([l,k])=>(
                  <div key={k}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{l}</label><input value={newRisk[k]||""} onChange={e=>setNewRisk(r=>({...r,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                ))}
                <div style={{gridColumn:"span 2"}}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Risque identifié *</label><input value={newRisk.risque||""} onChange={e=>setNewRisk(r=>({...r,risque:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                <div>
                  <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:4,fontWeight:700,textTransform:"uppercase"}}>Probabilité (1-5)</label>
                  {(()=>{const pv=newRisk.probabilite||3;const pc=pv>=4?"#DC2626":pv===3?"#F97316":pv===2?"#0EA5E9":"#16A34A";const pl=pv>=4?"TRÈS ÉLEVÉE":pv===3?"ÉLEVÉE":pv===2?"MODÉRÉE":pv===1?"FAIBLE":"PRESQUE CERTAINE";return(<><input type="range" min="1" max="5" value={pv} onChange={e=>setNewRisk(r=>({...r,probabilite:parseInt(e.target.value)}))} style={{width:"100%",accentColor:pc,cursor:"pointer",margin:"2px 0"}}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:2}}><div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(v=><div key={v} style={{width:"18%",height:6,borderRadius:2,background:v<=pv?pc:T.surface3,transition:"background 0.2s"}}/>)}</div><span style={{color:pc,fontWeight:700,fontSize:10,minWidth:60,textAlign:"right"}}>{pv} — {pl}</span></div></>);})()}
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:4,fontWeight:700,textTransform:"uppercase"}}>Impact (1-5)</label>
                  {(()=>{const iv=newRisk.impact||3;const ic=iv>=4?"#991B1B":iv===3?"#DC2626":iv===2?"#F97316":"#16A34A";const il=iv>=4?"TRÈS GRAVE":iv===3?"GRAVE":iv===2?"MODÉRÉ":iv===1?"NÉGLIGEABLE":"CATASTROPHIQUE";return(<><input type="range" min="1" max="5" value={iv} onChange={e=>setNewRisk(r=>({...r,impact:parseInt(e.target.value)}))} style={{width:"100%",accentColor:ic,cursor:"pointer",margin:"2px 0"}}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:2}}><div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(v=><div key={v} style={{width:"18%",height:6,borderRadius:2,background:v<=iv?ic:T.surface3,transition:"background 0.2s"}}/>)}</div><span style={{color:ic,fontWeight:700,fontSize:10,minWidth:60,textAlign:"right"}}>{iv} — {il}</span></div></>);})()}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                  <div style={{flex:1}}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Statut</label><select value={newRisk.statut||"OUVERT"} onChange={e=>setNewRisk(r=>({...r,statut:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>{["OUVERT","EN_COURS","CLOS","ACCEPTÉ"].map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}</select></div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{if(!newRisk.risque){gcAlert("Risque requis");return;}const sc=(newRisk.probabilite||3)*(newRisk.impact||3);const niv=sc>=15?"CRITIQUE":sc>=8?"ÉLEVÉ":sc>=4?"MODÉRÉ":"FAIBLE";if(newRisk.id){const u=riskMatrix.map(r=>r.id===newRisk.id?{...newRisk,score:sc,niveau:niv}:r);setRiskMatrix(u);try{_lsSet("gc-risks",JSON.stringify(u));}catch(_){}}else{const entry={...newRisk,id:"R"+Date.now(),score:sc,niveau:niv,createdAt:new Date().toISOString()};const u=[...riskMatrix,entry];setRiskMatrix(u);try{_lsSet("gc-risks",JSON.stringify(u));}catch(_){}}setNewRisk(null);}} style={{background:"#EF4444",border:"none",color:"#fff",borderRadius:7,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Enregistrer</button>
                    <button onClick={()=>setNewRisk(null)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {(()=>{const total=riskMatrix.length;const ouverts=riskMatrix.filter(r=>r.statut==="OUVERT").length;const critiques=riskMatrix.filter(r=>(r.probabilite||3)*(r.impact||3)>=15).length;const eleves=riskMatrix.filter(r=>{const sc=(r.probabilite||3)*(r.impact||3);return sc>=8&&sc<15;}).length;return [{v:total,l:"Total",c:"#7A90B0"},{v:ouverts,l:"Ouverts",c:"#EF4444"},{v:critiques,l:"Critiques",c:"#DC2626"},{v:eleves,l:"Élevés",c:"#F97316"}].map(k=>(<div key={k.l} style={{background:T.surface2,border:`1px solid ${k.c}33`,borderRadius:10,padding:"10px 12px",textAlign:"center"}}><div style={{color:k.c,fontWeight:900,fontSize:22}}>{k.v}</div><div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{k.l}</div></div>));})()}
          </div>
          <div style={{background:T.surface2,border:"1px solid #EF444433",borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{color:"#EF4444",fontWeight:800,fontSize:12}}>🔥 Heat Map des Risques — Probabilité × Impact</div>
              <div style={{display:"flex",gap:8}}>
                {[["#DC2626","CRITIQUE","≥15"],["#F97316","ÉLEVÉ","8-14"],["#0EA5E9","MODÉRÉ","4-7"],["#16A34A","FAIBLE","1-3"]].map(([c,l,r])=>(
                  <div key={l} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",background:c+"15",borderRadius:5,border:`1px solid ${c}33`}}>
                    <div style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}}/>
                    <span style={{color:c,fontSize:9,fontWeight:700}}>{l}</span>
                    <span style={{color:T.textDim,fontSize:8}}>({riskMatrix.filter(r=>{const sc=(r.probabilite||3)*(r.impact||3);return l==="CRITIQUE"?sc>=15:l==="ÉLEVÉ"?sc>=8&&sc<15:l==="MODÉRÉ"?sc>=4&&sc<8:sc<4;}).length})</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"auto repeat(5,1fr)",gap:4}}>
              <div/>
              {[1,2,3,4,5].map(i=><div key={i} style={{textAlign:"center",color:T.textMuted,fontSize:10,fontWeight:700,paddingBottom:4}}>Impact {i}</div>)}
              {[5,4,3,2,1].map(p=>(
                <React.Fragment key={p}>
                  <div style={{display:"flex",alignItems:"center",color:T.textMuted,fontSize:10,fontWeight:700,paddingRight:6,whiteSpace:"nowrap"}}>Prob. {p}</div>
                  {[1,2,3,4,5].map(i=>{
                    const sc=p*i;
                    const bg=sc>=15?"#DC2626":sc>=8?"#F97316":sc>=4?"#0EA5E9":"#16A34A";
                    const cnt=riskMatrix.filter(r=>(r.probabilite||3)===p&&(r.impact||3)===i&&r.statut==="OUVERT").length;
                    const label=sc>=15?"CRITIQUE":sc>=8?"ÉLEVÉ":sc>=4?"MODÉRÉ":"FAIBLE";
                    return(
                      <div key={i} title={`P:${p} × I:${i} — Score: ${sc} (${label})`}
                        style={{background:bg+"33",border:`2px solid ${bg}55`,borderRadius:8,minHeight:52,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:4,position:"relative",cursor:cnt>0?"pointer":"default",transition:"background 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.background=bg+"55";}}
                        onMouseLeave={e=>{e.currentTarget.style.background=bg+"33";}}>
                        <span style={{color:bg,fontWeight:900,fontSize:cnt>0?18:10}}>{cnt>0?cnt:""}</span>
                        <span style={{color:bg,fontSize:8,fontWeight:700,opacity:cnt>0?0.7:1}}>{sc}</span>
                        {cnt>0&&<div style={{position:"absolute",top:3,right:3,background:bg,color:"#fff",borderRadius:99,width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900,boxShadow:`0 1px 4px ${bg}88`}}>{cnt}</div>}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{color:T.text,fontWeight:700,fontSize:11}}>📋 Registre ({riskMatrix.length})</div>
              <button onClick={()=>{const csv=["Domaine,Risque,Cause,P,I,Score,Niveau,Contrôle,Responsable,Statut",...riskMatrix.map(r=>{const sc=(r.probabilite||3)*(r.impact||3);const niv=sc>=15?"CRITIQUE":sc>=8?"ÉLEVÉ":sc>=4?"MODÉRÉ":"FAIBLE";return `"${r.domaine||""}","${r.risque||""}","${r.cause||""}",${r.probabilite||3},${r.impact||3},${sc},"${niv}","${r.controle||""}","${r.responsable||""}","${r.statut||""}"`;})].join("\n");const b=new Blob(["\uFEFF"+csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="registre_risques.csv";a.click();URL.revokeObjectURL(u);}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>⬇ Export CSV</button>
            </div>
            {/* ── Barre filtres Risques ── */}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
              <input value={riskSearch} onChange={e=>setRiskSearch(e.target.value)} placeholder="🔍 Domaine, risque, responsable…" style={{flex:"1 1 160px",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 10px",color:T.text,fontSize:10}}/>
              <select value={riskNivFilter} onChange={e=>setRiskNivFilter(e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 8px",color:T.text,fontSize:10}}>
                <option value="ALL">⚠ Tous niveaux</option>
                <option value="CRITIQUE">🔴 Critique</option>
                <option value="ÉLEVÉ">🟠 Élevé</option>
                <option value="MODÉRÉ">🔵 Modéré</option>
                <option value="FAIBLE">🟢 Faible</option>
              </select>
              <select value={riskStatutFilter} onChange={e=>setRiskStatutFilter(e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 8px",color:T.text,fontSize:10}}>
                <option value="ALL">📌 Tous statuts</option>
                <option value="OUVERT">🔴 Ouvert</option>
                <option value="EN_COURS">🟡 En cours</option>
                <option value="CLOS">🟢 Clos</option>
                <option value="ACCEPTÉ">⚪ Accepté</option>
              </select>
              <select value={riskSort} onChange={e=>setRiskSort(e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 8px",color:T.text,fontSize:10}}>
                <option value="score_desc">↓ Score</option>
                <option value="score_asc">↑ Score</option>
                <option value="domaine">A-Z Domaine</option>
              </select>
              {(riskSearch||riskNivFilter!=="ALL"||riskStatutFilter!=="ALL")&&<button onClick={()=>{setRiskSearch("");setRiskNivFilter("ALL");setRiskStatutFilter("ALL");}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:9}}>✕ Effacer</button>}
            </div>
            {(()=>{
              const q=riskSearch.toLowerCase();
              let rf=riskMatrix.filter(r=>{
                const sc=(r.probabilite||3)*(r.impact||3);
                const niv=sc>=15?"CRITIQUE":sc>=8?"ÉLEVÉ":sc>=4?"MODÉRÉ":"FAIBLE";
                const matchQ=!q||(r.domaine||"").toLowerCase().includes(q)||(r.risque||"").toLowerCase().includes(q)||(r.responsable||"").toLowerCase().includes(q)||(r.controle||"").toLowerCase().includes(q);
                const matchN=riskNivFilter==="ALL"||niv===riskNivFilter;
                const matchS=riskStatutFilter==="ALL"||(r.statut||"OUVERT")===riskStatutFilter;
                return matchQ&&matchN&&matchS;
              });
              if(riskSort==="score_asc")rf=[...rf].sort((a,b)=>((a.probabilite||3)*(a.impact||3))-((b.probabilite||3)*(b.impact||3)));
              else if(riskSort==="domaine")rf=[...rf].sort((a,b)=>(a.domaine||"").localeCompare(b.domaine||""));
              else rf=[...rf].sort((a,b)=>((b.probabilite||3)*(b.impact||3))-((a.probabilite||3)*(a.impact||3)));
              if(rf.length===0)return <div style={{color:T.textDim,textAlign:"center",padding:20,fontSize:11}}>{riskMatrix.length===0?"Aucun risque — cliquez ➕ Nouveau risque":"Aucun risque pour ces critères"}</div>;
              return (<div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                  <thead><tr style={{background:T.surface3}}>{["Domaine","Risque","P","I","Score","Niveau","Contrôle","Resp.","Statut",""].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",color:T.textMuted,fontWeight:700,fontSize:9,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>{rf.map(r=>{const sc=(r.probabilite||3)*(r.impact||3);const niv=sc>=15?"CRITIQUE":sc>=8?"ÉLEVÉ":sc>=4?"MODÉRÉ":"FAIBLE";const nc={CRITIQUE:"#DC2626",ÉLEVÉ:"#F97316",MODÉRÉ:"#0EA5E9",FAIBLE:"#16A34A"}[niv];const sc2={OUVERT:"#EF4444",EN_COURS:"#F59E0B",CLOS:"#22C55E",ACCEPTÉ:"#7A90B0"}[r.statut||"OUVERT"]||"#7A90B0";return(<tr key={r.id} style={{borderBottom:`1px solid ${T.border}22`}}><td style={{padding:"5px 8px",color:T.textMuted,fontSize:9}}>{r.domaine||"—"}</td><td style={{padding:"5px 8px",color:T.text,fontWeight:600,maxWidth:160}}>{r.risque}</td><td style={{padding:"5px 8px",color:"#0EA5E9",textAlign:"center",fontWeight:800}}>{r.probabilite||3}</td><td style={{padding:"5px 8px",color:"#EF4444",textAlign:"center",fontWeight:800}}>{r.impact||3}</td><td style={{padding:"5px 8px",textAlign:"center"}}><span style={{background:nc+"22",color:nc,borderRadius:4,padding:"2px 6px",fontWeight:800,fontSize:10}}>{sc}</span></td><td style={{padding:"5px 8px"}}><span style={{background:nc+"22",color:nc,fontSize:9,fontWeight:700,borderRadius:4,padding:"2px 5px"}}>{niv}</span></td><td style={{padding:"5px 8px",color:T.textMuted,fontSize:9,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.controle||"—"}</td><td style={{padding:"5px 8px",color:T.textMuted,fontSize:9}}>{r.responsable||"—"}</td><td style={{padding:"5px 8px"}}><span style={{background:sc2+"22",color:sc2,fontSize:8,fontWeight:700,borderRadius:4,padding:"1px 5px"}}>{(r.statut||"OUVERT").replace(/_/g," ")}</span></td><td style={{padding:"4px 6px",whiteSpace:"nowrap"}}><button onClick={()=>setNewRisk({...r})} style={{background:"#3B82F622",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9,marginRight:2}}>✏️</button><button onClick={()=>setConfirmDel({id:r.id,label:r.risque,type:"risk"})} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9}}>🗑️</button></td></tr>);})}</tbody>
                </table>
                {rf.length<riskMatrix.length&&<div style={{color:T.textDim,fontSize:9,textAlign:"right",marginTop:4}}>{rf.length}/{riskMatrix.length} affiché(s)</div>}
              </div>);
            })()}
          </div>
          <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Analyse registre risques Génie Consultant: ${riskMatrix.length} risques, ${riskMatrix.filter(r=>(r.probabilite||3)*(r.impact||3)>=15).length} critiques, ${riskMatrix.filter(r=>r.statut==="OUVERT").length} ouverts.\n\nRisques critiques:\n${riskMatrix.filter(r=>(r.probabilite||3)*(r.impact||3)>=15).map(r=>`- ${r.risque} (P:${r.probabilite||3} I:${r.impact||3} Score:${(r.probabilite||3)*(r.impact||3)})`).join("\n")||"Aucun"}\n\nProduis une analyse ISA 315 avec plan de traitement priorisé, mesures correctives urgentes et indicateurs de suivi.`)} style={{marginTop:12,background:"#C41E3A22",border:"1px solid #C41E3A44",color:"#C41E3A",borderRadius:8,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:11,width:"100%"}}>🤖 Analyse des risques par IA — ISA 315</button>
        </div>
      )}

      {auditTool==="programme" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:"#C41E3A",fontWeight:800,fontSize:13}}>📋 Programmes d'audit</div>
            <button onClick={()=>setShowProgForm(v=>!v)} style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nouveau programme</button>
          </div>
          {showProgForm && (
            <div style={{background:T.surface2,border:`1px solid #C41E3A44`,borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
                {[["Mission d'audit","mission"],["Entité auditée","entite"],["Période","periode"]].map(([l,k])=>(
                  <div key={k}><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>{l}</label><input value={progForm[k]} onChange={e=>setProgForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
                ))}
              </div>
              <div style={{marginBottom:8}}><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Objectifs de la mission</label><textarea value={progForm.objectifs} onChange={e=>setProgForm(f=>({...f,objectifs:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} /></div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addProg} style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Créer</button>
                <button onClick={()=>setShowProgForm(false)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 16px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:14}}>
            <div>
              {progs.length===0 && <div style={{color:T.textDim,fontSize:11,padding:14,textAlign:"center"}}>Aucun programme créé.</div>}
              {progs.map(p=>{
                const done=p.phases.filter(x=>x.complete).length;
                const pct=Math.round(done/p.phases.length*100);
                return <div key={p.id} style={{background:selProg?.id===p.id?"#C41E3A22":T.surface2,border:`1px solid ${selProg?.id===p.id?"#C41E3A66":T.border}`,borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                  <div onClick={()=>setSelProg(p)} style={{cursor:"pointer"}}>
                  <div style={{color:selProg?.id===p.id?"#C41E3A":T.text,fontWeight:700,fontSize:11,marginBottom:2}}>{p.mission}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginBottom:6}}>{p.entite} — {p.periode}</div>
                  <div style={{background:T.surface3,borderRadius:4,height:4,overflow:"hidden"}}>
                    <div style={{background:"#C41E3A",width:`${pct}%`,height:"100%",borderRadius:4,transition:"width .3s"}} />
                  </div>
                  <div style={{color:T.textDim,fontSize:9,marginTop:2}}>{pct}% — {done}/{p.phases.length} phases</div>
                  </div>
                  <div style={{display:"flex",gap:4,marginTop:6}}>
                    <button onClick={e=>{e.stopPropagation();setEditModal({type:"prog",item:{...p}});}} style={{flex:1,background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 0",cursor:"pointer",fontSize:9}}>✏️ Modifier</button>
                    <button onClick={e=>{e.stopPropagation();setConfirmDel({type:"prog",id:p.id,label:p.mission});}} style={{flex:1,background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:5,padding:"3px 0",cursor:"pointer",fontSize:9}}>🗑️ Supprimer</button>
                  </div>
                </div>;
              })}
            </div>
            <div>
              {!selProg ? <div style={{color:T.textDim,fontSize:12,textAlign:"center",padding:"40px 0"}}>Sélectionnez un programme.</div> : (
                <div>
                  <div style={{background:T.surface2,border:`1px solid #C41E3A44`,borderRadius:10,padding:14,marginBottom:12}}>
                    <div style={{color:"#C41E3A",fontWeight:800,fontSize:13,marginBottom:4}}>{selProg.mission}</div>
                    <div style={{color:T.textMuted,fontSize:11}}>Entité: <strong style={{color:T.text}}>{selProg.entite}</strong> | Période: <strong style={{color:T.text}}>{selProg.periode}</strong></div>
                    {selProg.objectifs && <div style={{color:T.textDim,fontSize:11,marginTop:6,padding:"8px 10px",background:T.surface3,borderRadius:6}}>{selProg.objectifs}</div>}
                  </div>
                  {selProg.phases.map((ph,pi)=>(
                    <div key={pi} onClick={()=>togglePhase(selProg.id,pi)} style={{background:T.surface2,border:`1px solid ${ph.complete?"#22C55E44":T.border}`,borderRadius:8,padding:"10px 12px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${ph.complete?"#22C55E":"#C41E3A"}`,background:ph.complete?"#22C55E":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {ph.complete&&<span style={{color:"#fff",fontSize:12,fontWeight:700}}>✓</span>}
                      </div>
                      <span style={{color:ph.complete?"#22C55E":T.text,fontWeight:600,fontSize:11,flex:1,textDecoration:ph.complete?"line-through":"none"}}>{pi+1}. {ph.nom}</span>
                      <span style={{fontSize:9,color:ph.complete?"#22C55E":"#F59E0B",fontWeight:700}}>{ph.complete?"TERMINÉ":"EN ATTENTE"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {auditTool==="tests" && (
        <div>
          <div style={{color:"#C41E3A",fontWeight:800,fontSize:13,marginBottom:12}}>🧪 Feuilles de test d'audit</div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14,marginBottom:14}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 2fr 1fr",gap:8,marginBottom:8}}>
              {[["Mission / Cycle","mission"],["Objectif du test","objectif"]].map(([l,k])=>(
                <div key={k}><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>{l}</label><input value={testForm[k]} onChange={e=>setTestForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
              ))}
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Type de test</label>
                <select value={testForm.type} onChange={e=>setTestForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                  {["SUBSTANCE","PROCEDURE","ANALYTIQUE","OBSERVATION","CONFIRMATION"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:8,marginBottom:8}}>
              {[["Taille échantillon","echantillon"],["Anomalies détectées","anomalies"]].map(([l,k])=>(
                <div key={k}><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>{l}</label><input type="number" value={testForm[k]} onChange={e=>setTestForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
              ))}
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Observations</label><input value={testForm.observations} onChange={e=>setTestForm(f=>({...f,observations:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
            </div>
            <button onClick={addTest} style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Enregistrer la feuille</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {tests.length===0&&<div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:20}}>Aucune feuille de test enregistrée.</div>}
            {tests.map(t=>{
              const pct=Math.min(100,Math.round((parseInt(t.anomalies, 10)||0)/(parseInt(t.echantillon, 10)||1)*100));
              const typeC={SUBSTANCE:"#3B82F6",PROCEDURE:"#A855F7",ANALYTIQUE:"#F97316",OBSERVATION:"#22C55E",CONFIRMATION:"#06B6D4"}[t.type]||"#888";
              return <div key={t.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div><span style={{color:typeC,background:typeC+"22",border:`1px solid ${typeC}44`,borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700,marginRight:6}}>{t.type}</span><span style={{color:T.text,fontWeight:700,fontSize:12}}>{t.mission}</span></div>
                  <div style={{display:"flex",gap:6}}>
                    <span style={{color:T.textDim,fontSize:10}}>{t.date}</span>
                    <button onClick={()=>setEditModal({type:"test",item:{...t}})} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9}}>✏️</button>
                    <button onClick={()=>setConfirmDel({type:"test",id:t.id,label:t.mission})} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                  </div>
                </div>
                <div style={{color:T.textMuted,fontSize:10,marginBottom:6}}>{t.objectif}</div>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
                  <span style={{color:T.textDim,fontSize:10}}>Échantillon: <strong style={{color:T.text}}>{t.echantillon}</strong></span>
                  <span style={{color:T.textDim,fontSize:10}}>Anomalies: <strong style={{color:pct>10?"#EF4444":"#22C55E"}}>{t.anomalies} ({pct}%)</strong></span>
                  <div style={{flex:1,background:T.surface3,borderRadius:4,height:4,overflow:"hidden"}}><div style={{background:pct>20?"#EF4444":pct>10?"#F59E0B":"#22C55E",width:`${pct}%`,height:"100%",borderRadius:4}} /></div>
                </div>
                {t.conclusion ? <div style={{background:"#22C55E15",border:"1px solid #22C55E44",borderRadius:6,padding:"8px 10px",fontSize:10,color:"#22C55E"}}><strong>Conclusion:</strong> {t.conclusion}</div>
                : <button onClick={()=>genConclusion(t)} disabled={testAiLoading} style={{background:"#C41E3A22",border:"1px solid #C41E3A44",color:"#C41E3A",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>{testAiLoading?"⏳ Génération...":"✨ Générer conclusion IA"}</button>}
              </div>;
            })}
          </div>
        </div>
      )}

      {auditTool==="actions" && (
        <div>
          {actions.filter(a=>a.statut!=="CLOS"&&a.echeance&&new Date(a.echeance)<new Date(Date.now()+7*24*60*60*1000)).length>0 && (
            <div style={{background:"#EF444415",border:"1px solid #EF444444",borderRadius:8,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>🚨</span>
              <span style={{color:"#EF4444",fontWeight:700,fontSize:12}}>{actions.filter(a=>a.statut!=="CLOS"&&a.echeance&&new Date(a.echeance)<new Date(Date.now()+7*24*60*60*1000)).length} action(s) urgente(s) — échéance dans moins de 7 jours</span>
            </div>
          )}
          <div style={{color:"#C41E3A",fontWeight:800,fontSize:13,marginBottom:12}}>🎯 Plans d'action d'audit</div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14,marginBottom:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Constat d'audit *</label><textarea value={actionForm.constat} onChange={e=>setActionForm(f=>({...f,constat:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} /></div>
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Cause identifiée</label><textarea value={actionForm.cause} onChange={e=>setActionForm(f=>({...f,cause:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} /></div>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                <label style={{color:T.textMuted,fontSize:10}}>Recommandation</label>
                <button onClick={genReco} disabled={actionAiLoading||!actionForm.constat} style={{background:"#C41E3A22",border:"1px solid #C41E3A44",color:"#C41E3A",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>{actionAiLoading?"⏳...":"✨ IA"}</button>
              </div>
              <textarea value={actionForm.recommandation} onChange={e=>setActionForm(f=>({...f,recommandation:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr auto",gap:8}}>
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Responsable</label><input value={actionForm.responsable} onChange={e=>setActionForm(f=>({...f,responsable:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Échéance</label><input type="date" value={actionForm.echeance} onChange={e=>setActionForm(f=>({...f,echeance:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} /></div>
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Priorité</label>
                <select value={actionForm.priorite} onChange={e=>setActionForm(f=>({...f,priorite:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                  {["CRITIQUE","HAUTE","NORMALE","FAIBLE"].map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div><label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2}}>Impact</label>
                <select value={actionForm.impact} onChange={e=>setActionForm(f=>({...f,impact:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                  {["FINANCE","OPERATIONNEL","CONFORMITE","REPUTATIONNEL"].map(i=><option key={i}>{i}</option>)}
                </select>
              </div>
              <div style={{display:"flex",alignItems:"flex-end"}}><button onClick={addAction} style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>✅ Ajouter</button></div>
            </div>
          </div>
          {/* ── Filtres Plans d'action ── */}
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={actionsSearch} onChange={e=>setActionsSearch(e.target.value)} placeholder="🔍 Constat, recommandation, responsable…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <select value={actionsPrioFilter} onChange={e=>setActionsPrioFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🎯 Toutes priorités</option>
              {["CRITIQUE","HAUTE","NORMALE","FAIBLE"].map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select value={actionsStatutFilter} onChange={e=>setActionsStatutFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">📋 Tous statuts</option>
              {["OUVERT","EN_COURS","CLOS"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <span style={{color:T.textDim,fontSize:10}}>{actions.filter(a=>{const q=actionsSearch.toLowerCase();return(!q||(a.constat||"").toLowerCase().includes(q)||(a.recommandation||"").toLowerCase().includes(q)||(a.responsable||"").toLowerCase().includes(q))&&(actionsPrioFilter==="ALL"||a.priorite===actionsPrioFilter)&&(actionsStatutFilter==="ALL"||(a.statut||"OUVERT")===actionsStatutFilter);}).length}/{actions.length}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {actions.length===0&&<div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:20}}>Aucun plan d'action enregistré.</div>}
            {[...actions].filter(a=>{const q=actionsSearch.toLowerCase();return(!q||(a.constat||"").toLowerCase().includes(q)||(a.recommandation||"").toLowerCase().includes(q)||(a.responsable||"").toLowerCase().includes(q))&&(actionsPrioFilter==="ALL"||a.priorite===actionsPrioFilter)&&(actionsStatutFilter==="ALL"||(a.statut||"OUVERT")===actionsStatutFilter);}).sort((a,b)=>{const po=["CRITIQUE","HAUTE","NORMALE","FAIBLE"];return po.indexOf(a.priorite)-po.indexOf(b.priorite);}).map(a=>{
              const isOverdue=a.statut!=="CLOS"&&a.echeance&&new Date(a.echeance)<new Date();
              return <div key={a.id} style={{background:T.surface2,border:`1px solid ${isOverdue?"#EF444466":T.border}`,borderRadius:10,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    <span style={{background:(PC[a.priorite]||"#888")+"22",color:PC[a.priorite]||"#888",border:`1px solid ${(PC[a.priorite]||"#888")}44`,borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700}}>{a.priorite}</span>
                    <span style={{background:(IC[a.impact]||"#888")+"22",color:IC[a.impact]||"#888",border:`1px solid ${(IC[a.impact]||"#888")}44`,borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700}}>{a.impact}</span>
                    <span style={{background:(SC[a.statut]||"#888")+"22",color:SC[a.statut]||"#888",border:`1px solid ${(SC[a.statut]||"#888")}44`,borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700}}>{a.statut}</span>
                    {isOverdue&&<span style={{background:"#EF444422",color:"#EF4444",borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700}}>⚠ EN RETARD</span>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {a.echeance&&<span style={{color:isOverdue?"#EF4444":T.textDim,fontSize:10}}>📅 {a.echeance}</span>}
                    <button onClick={()=>setEditModal({type:"action",item:{...a}})} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9}}>✏️</button>
                    <button onClick={()=>setConfirmDel({type:"action",id:a.id,label:a.constat})} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                  </div>
                </div>
                <div style={{color:T.text,fontWeight:600,fontSize:11,marginBottom:2}}>📌 {a.constat}</div>
                {a.cause&&<div style={{color:T.textMuted,fontSize:10,marginBottom:2}}>Cause: {a.cause}</div>}
                {a.recommandation&&<div style={{color:"#3B82F6",fontSize:10,marginBottom:6,padding:"6px 8px",background:"#3B82F615",borderRadius:5}}>💡 {a.recommandation}</div>}
                {a.responsable&&<div style={{color:T.textDim,fontSize:10,marginBottom:6}}>Responsable: <strong style={{color:T.text}}>{a.responsable}</strong></div>}
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{color:T.textDim,fontSize:10}}>Avancement:</span>
                  <input type="range" min={0} max={100} step={10} value={a.avancement||0} onChange={e=>updateAvancement(a.id,+e.target.value)} style={{flex:1}} />
                  <span style={{color:a.avancement>=100?"#22C55E":a.avancement>=50?"#F59E0B":"#EF4444",fontWeight:700,fontSize:11,minWidth:35}}>{a.avancement||0}%</span>
                </div>
                <div style={{background:T.surface3,borderRadius:4,height:4,marginTop:4,overflow:"hidden"}}><div style={{background:a.avancement>=100?"#22C55E":a.avancement>=50?"#F59E0B":"#EF4444",width:`${a.avancement||0}%`,height:"100%",borderRadius:4,transition:"width .3s"}} /></div>
              </div>;
            })}
          </div>
        </div>
      )}

      {auditTool==="checklist" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:"#C41E3A",fontWeight:800,fontSize:13}}>✅ Checklists d'audit</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={async () => {
                const cat = await gcPrompt("Nom de la nouvelle catégorie :");
                if(!cat?.trim()) return;
                try {
                  const customs = JSON.parse(_lsGet("gc-audit-checklist-custom")||"[]");
                  if(customs.find(c=>c.cat===cat.trim())) return gcAlert("Cette catégorie existe déjà.");
                  customs.push({cat:cat.trim(),items:[],custom:true,id:`CC-${Date.now()}`});
                  _lsSet("gc-audit-checklist-custom",JSON.stringify(customs)); dsSave("gc-audit-checklist-custom",customs).catch(err => gcToast.syncError('', err));
                  setCustomChecklists(customs);
                } catch (_) { gcAlert("Erreur lors de la sauvegarde de la catégorie."); }
              }} style={{background:"#C41E3A22",border:"1px solid #C41E3A44",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#C41E3A"}}>+ Nouvelle catégorie</button>
              <button onClick={()=>{
                const total=[...CHECKLIST_CATS,...customChecklists];
                const lines=[`CHECKLIST D'AUDIT — ${new Date().toLocaleDateString("fr-FR")}`,`Généré par : ${currentUser?.name||"GÉNIE CONSULTANT"}`,`${"=".repeat(60)}`];
                total.forEach(({cat,items})=>{
                  lines.push(`\n## ${cat}`);
                  items.forEach(item=>lines.push(`  [${checkState[cat+"::"+item]?"✓":" "}] ${item}`));
                });
                const done=[...CHECKLIST_CATS,...customChecklists].reduce((a,{cat,items})=>a+items.filter(i=>checkState[cat+"::"+i]).length,0);
                const tot=[...CHECKLIST_CATS,...customChecklists].reduce((a,{items})=>a+items.length,0);
                lines.push(`\n${"-".repeat(60)}\nProgression : ${done}/${tot} points vérifiés (${tot>0?Math.round(done/tot*100):0}%)`);
                const b=new Blob([lines.join("\n")],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`checklist_audit_${new Date().toISOString().split("T")[0]}.txt`;a.click();URL.revokeObjectURL(u);
                setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"✅",message:`Checklist d'audit exportée par ${currentUser?.name}`,at:new Date().toISOString(),read:false},...p]);
              }} style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#22C55E"}}>⬇ Exporter</button>
              <button onClick={()=>{
                const total=[...CHECKLIST_CATS,...customChecklists];
                const done=total.reduce((a,{cat,items})=>a+items.filter(i=>checkState[cat+"::"+i]).length,0);
                const tot=total.reduce((a,{items})=>a+items.length,0);
                // FIX v129 — Remplace window.print() direct (écran bleu) par popup propre
                const rows=total.map(({cat,items})=>`<h3 style="color:#C41E3A;margin:10px 0 4px;">${cat}</h3><table style="width:100%;border-collapse:collapse;margin-bottom:8px;">${items.map(i=>`<tr><td style="border:1px solid #ccc;padding:5px 8px;width:24px;text-align:center;">${checkState[cat+"::"+i]?"✅":"☐"}</td><td style="border:1px solid #ccc;padding:5px 8px;font-size:11px;">${i}</td></tr>`).join("")}</table>`).join("");
                gcOpenPrintWindow({title:`Checklist d'Audit — ${done}/${tot} items validés`,content:`<p style="color:#555;margin-bottom:12px;"><strong>Avancement :</strong> ${done}/${tot} items validés (${tot>0?Math.round(done/tot*100):0}%)</p>${rows}`});
              }} style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#3B82F6"}}>🖨️ Imprimer</button>
            </div>
          </div>
          {/* Checklists standards */}
          {CHECKLIST_CATS.map(({cat,items})=>{
            const done=items.filter(item=>checkState[cat+"::"+item]).length;
            const pct=items.length>0?Math.round(done/items.length*100):0;
            return <div key={cat} style={{background:T.surface2,border:`1px solid ${pct===100?"#22C55E44":T.border}`,borderRadius:10,padding:12,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{color:pct===100?"#22C55E":"#C41E3A",fontWeight:700,fontSize:11}}>{cat}</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{background:T.surface3,borderRadius:4,height:5,width:80,overflow:"hidden"}}><div style={{background:pct===100?"#22C55E":"#C41E3A",width:`${pct}%`,height:"100%",borderRadius:4,transition:"width 0.3s"}} /></div>
                  <span style={{color:pct===100?"#22C55E":"#C41E3A",fontSize:10,fontWeight:700}}>{done}/{items.length}</span>
                  {pct===100&&<span style={{color:"#22C55E",fontSize:11}}>✅</span>}
                </div>
              </div>
              {items.map(item=>{
                const key=`${cat}::${item}`;
                return <div key={item} onClick={()=>toggleCheck(key)} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 6px",borderRadius:6,cursor:"pointer",marginBottom:2,background:checkState[key]?"#22C55E08":"transparent"}}>
                  <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${checkState[key]?"#22C55E":"#C41E3A44"}`,background:checkState[key]?"#22C55E":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                    {checkState[key]&&<span style={{color:"#fff",fontSize:10,fontWeight:700}}>✓</span>}
                  </div>
                  <span style={{color:checkState[key]?"#22C55E":T.text,fontSize:11,textDecoration:checkState[key]?"line-through":"none",flex:1}}>{item}</span>
                </div>;
              })}
            </div>;
          })}
          {/* Checklists personnalisées */}
          {customChecklists.map((cl,ci)=>{
            const items=cl.items||[];
            const done=items.filter(item=>checkState[cl.cat+"::"+item]).length;
            const pct=items.length>0?Math.round(done/items.length*100):0;
            return <div key={cl.id||cl.cat} style={{background:T.surface2,border:`2px dashed ${pct===100?"#22C55E66":"#C41E3A44"}`,borderRadius:10,padding:12,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{background:"#C41E3A22",color:"#C41E3A",border:"1px solid #C41E3A44",borderRadius:4,padding:"1px 5px",fontSize:9,fontWeight:800}}>CUSTOM</span>
                  <span style={{color:"#C41E3A",fontWeight:700,fontSize:11}}>{cl.cat}</span>
                </div>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <div style={{background:T.surface3,borderRadius:4,height:5,width:60,overflow:"hidden"}}><div style={{background:pct===100?"#22C55E":"#F59E0B",width:`${pct}%`,height:"100%",borderRadius:4}} /></div>
                  <span style={{color:T.textDim,fontSize:10,fontWeight:700}}>{done}/{items.length}</span>
                  <button onClick={async () => {
                    const newItem = await gcPrompt(`Ajouter un point à "${cl.cat}" :`);
                    if(!newItem?.trim()) return;
                    const updated=customChecklists.map((c,i)=>i===ci?{...c,items:[...(c.items||[]),newItem.trim()]}:c);
                    _lsSet("gc-audit-checklist-custom",JSON.stringify(updated)); dsSave("gc-audit-checklist-custom",updated).catch(err => gcToast.syncError('', err));
                    setCustomChecklists(updated);
                  }} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9,fontWeight:700}}>+ Point</button>
                  <button onClick={async () => {
                    if(!await gcConfirm(`Supprimer la catégorie "${cl.cat}" et tous ses points ?`)) return;
                    const updated=customChecklists.filter((_,i)=>i!==ci);
                    _lsSet("gc-audit-checklist-custom",JSON.stringify(updated)); dsSave("gc-audit-checklist-custom",updated).catch(err => gcToast.syncError('', err));
                    setCustomChecklists(updated);
                  }} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9,fontWeight:700}}>🗑</button>
                </div>
              </div>
              {items.length===0&&<div style={{color:T.textDim,fontSize:10,fontStyle:"italic",padding:"8px 0"}}>Aucun point — cliquez "+ Point" pour en ajouter</div>}
              {items.map((item,ii)=>{
                const key=`${cl.cat}::${item}`;
                return <div key={ii} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 6px",borderRadius:6,cursor:"pointer",marginBottom:2}}>
                  <div onClick={()=>toggleCheck(key)} style={{width:16,height:16,borderRadius:4,border:`2px solid ${checkState[key]?"#22C55E":"#F59E0B44"}`,background:checkState[key]?"#22C55E":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                    {checkState[key]&&<span style={{color:"#fff",fontSize:10,fontWeight:700}}>✓</span>}
                  </div>
                  <span onClick={()=>toggleCheck(key)} style={{color:checkState[key]?"#22C55E":T.text,fontSize:11,textDecoration:checkState[key]?"line-through":"none",flex:1}}>{item}</span>
                  <button onClick={()=>{
                    const updated=customChecklists.map((c,i)=>i===ci?{...c,items:c.items.filter((_,j)=>j!==ii)}:c);
                    _lsSet("gc-audit-checklist-custom",JSON.stringify(updated)); dsSave("gc-audit-checklist-custom",updated).catch(err => gcToast.syncError('', err));
                    setCustomChecklists(updated);
                  }} style={{background:"transparent",border:"none",color:"#EF4444",cursor:"pointer",fontSize:11,opacity:0.5,padding:"0 3px"}}>✕</button>
                </div>
              })}
            </div>
          })}
        </div>
      )}

      {auditTool==="rapport" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:"#C41E3A",fontWeight:800,fontSize:13}}>📄 Rapport d'audit — Générateur IA</div>
            {generated&&(
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{
                  const b=new Blob([`RAPPORT D'AUDIT — ${rapportData.mission}\nEntité : ${rapportData.entite}\nPériode : ${rapportData.periode}\nGénéré par : ${currentUser?.name||"GÉNIE CONSULTANT"}\nDate : ${new Date().toLocaleDateString("fr-FR")}\n${"=".repeat(60)}\n\n${generated}`],{type:"text/plain"});
                  const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`rapport_audit_${rapportData.entite||"gc"}_${new Date().toISOString().split("T")[0]}.txt`;a.click();URL.revokeObjectURL(u);
                  setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📄",message:`Rapport d'audit "${rapportData.mission}" téléchargé`,at:new Date().toISOString(),read:false},...p]);
                }} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:10,fontWeight:700}}>⬇ Télécharger</button>
                <button onClick={()=>gcOpenPrintWindow({title:`Rapport d'Audit — ${rapportData.mission||""}`,content:`<h2>Rapport d'Audit — ${rapportData.mission||""}</h2><p><strong>Entité :</strong> ${rapportData.entite||"—"}</p><p><strong>Période :</strong> ${rapportData.periode||"—"}</p><p><strong>Généré par :</strong> ${currentUser?.name||"GÉNIE CONSULTANT"}</p><hr/><pre style="white-space:pre-wrap;font-size:11px;font-family:Arial;">${(generated||"").replace(/</g,"&lt;")}</pre>`})} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:10,fontWeight:700}}>🖨️ Imprimer</button>
                <button onClick={()=>{
                  const taskTitle=`[AUDIT] Rapport "${rapportData.mission}" — Suivi recommandations`;
                  const newT={id:"T"+Date.now(),titre:taskTitle,description:`Rapport d'audit généré.\nEntité: ${rapportData.entite}\nPériode: ${rapportData.periode}\nConstats: ${rapportData.constats?.slice(0,200)}\n\n[Rapport complet disponible dans Audit → Rapport]`,status:"A_FAIRE",statut:"A_FAIRE",priority:"HAUTE",module:"audit",createdAt:new Date().toISOString(),creatorId:currentUser?.id,assigneeId:currentUser?.id,type:"AUDIT_SUIVI"};
                  try{const ex=JSON.parse(_lsGet("GC_SI_v12:taches:"+currentUser?.id)||"[]");ex.unshift(newT);_lsSet("GC_SI_v12:taches:"+currentUser?.id,JSON.stringify(ex));}catch (_) {}
                  if(typeof setTaches==="function") setTaches(prev=>[newT,...prev]);
                  setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📋",message:`📋 Tâche de suivi créée : "${taskTitle}"`,at:new Date().toISOString(),read:false,module:"taches"},...p]);
                  playSound("task"); gcAlert("✅ Tâche de suivi des recommandations créée.");
                }} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:10,fontWeight:700}}>📋 Créer tâche suivi</button>
              </div>
            )}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
              <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:10}}>Paramètres du rapport</div>
              {[["Mission d'audit","mission"],["Entité auditée","entite"],["Période auditée","periode"],["Périmètre / Scope","scope"],["Constats principaux","constats"],["Recommandations clés","recommandations"],["Conclusion attendue","conclusion"]].map(([l,k])=>(
                <div key={k} style={{marginBottom:8}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:2,fontWeight:600}}>{l}</label>
                  {["constats","recommandations","conclusion","scope"].includes(k)
                    ?<textarea value={rapportData[k]} onChange={e=>setRapportData(f=>({...f,[k]:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} />
                    :<input value={rapportData[k]} onChange={e=>setRapportData(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                  }
                </div>
              ))}
              {/* Injecter stats audit automatiquement */}
              <button onClick={()=>{
                const totalAct=actions.length;const closedAct=actions.filter(a=>a.statut==="CLOS").length;
                const critRisks=riskMatrix.filter(r=>(r.probabilite||3)*(r.impact||3)>=15).length;
                const auto=`Missions planifiées: ${tpaMissions.length} | Plans action: ${totalAct} dont ${closedAct} clos | Risques critiques identifiés: ${critRisks}`;
                setRapportData(f=>({...f,constats:(f.constats?f.constats+"\n":"")+auto}));
              }} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:600,marginBottom:8,width:"100%"}}>⚙️ Injecter stats automatiquement</button>
              <button onClick={genRapport} disabled={rapportLoading||!rapportData.mission} style={{background:rapportLoading?"#666":"linear-gradient(135deg,#C41E3A,#991B1B)",border:"none",color:"#fff",borderRadius:8,padding:"10px",cursor:rapportLoading?"not-allowed":"pointer",fontWeight:700,fontSize:12,width:"100%",opacity:rapportLoading?0.7:1}}>
                {rapportLoading?"⏳ Génération en cours…":"✨ Générer le rapport avec l'IA"}
              </button>
            </div>
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14,overflowY:"auto",maxHeight:520}}>
              {!generated&&!rapportLoading&&(
                <div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:"40px 20px"}}>
                  <div style={{fontSize:32,marginBottom:12}}>📄</div>
                  <div>Renseignez les paramètres et cliquez sur "Générer".</div>
                  <div style={{marginTop:8,color:T.textMuted,fontSize:10}}>L'IA rédigera un rapport professionnel normes ISA/IIA</div>
                </div>
              )}
              {rapportLoading&&(
                <div style={{color:"#C41E3A",fontSize:12,textAlign:"center",padding:"40px 20px"}}>
                  <div style={{fontSize:32,marginBottom:12}}>⏳</div>
                  <div>Génération du rapport en cours…</div>
                  <div style={{color:T.textDim,fontSize:10,marginTop:8}}>Analyse par IA · Normes ISA/IIA · Contexte OHADA</div>
                </div>
              )}
              {generated&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,alignItems:"center"}}>
                    <div style={{color:"#22C55E",fontWeight:700,fontSize:11}}>✅ Rapport généré</div>
                    <span style={{color:T.textDim,fontSize:9}}>ISA/IIA · {new Date().toLocaleDateString("fr-FR")}</span>
                  </div>
                  <div style={{color:T.text,fontSize:11,lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:"'Georgia',serif"}}>{generated}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM DELETE MODAL ══════════════════════════════════════ */}
      {/* ══ HEAT MAP RISQUES ══ */}

      {/* ══ CONTRÔLES & EFFECTIVITÉ ══ */}
      {auditTool==="grille_taches" && (()=>{
        const CRIT_C={CRITIQUE:"#EF4444",HAUTE:"#F97316",NORMALE:"#F59E0B",FAIBLE:"#22C55E"};
        const EFFET_C={EFFICACE:"#22C55E",PARTIELLEMENT:"#F59E0B",NON_EFFICACE:"#EF4444",NON_TESTE:"#7A90B0"};
        const FREQ_O=["QUOTIDIEN","HEBDOMADAIRE","MENSUEL","TRIMESTRIEL","SEMESTRIEL","ANNUEL","À_CHAQUE_OPÉRATION"];
        const TYPE_O=["PREVENTIF","DÉTECTIF","CORRECTIF","DIRECTIF"];
        const CRIT_O=["CRITIQUE","HAUTE","NORMALE","FAIBLE"];
        const EFF_O=["EFFICACE","PARTIELLEMENT","NON_EFFICACE","NON_TESTE"];
        const editingG = gTacheEditId ? gTaches.find(g=>g.id===gTacheEditId) : null;

        const stats = {total:gTaches.length,efficaces:gTaches.filter(g=>g.effectivite==="EFFICACE").length,non:gTaches.filter(g=>g.effectivite==="NON_EFFICACE").length,critiques:gTaches.filter(g=>g.criticite==="CRITIQUE").length,auto:gTaches.filter(g=>g.automatise==="OUI").length};
        const pctOK = stats.total>0?Math.round((stats.efficaces/stats.total)*100):0;

        const filteredG = gTaches.filter(g=>{
          const matchCrit = gFilter==="TOUS" || g.criticite===gFilter;
          const matchEff = gFilterEff==="TOUS" || g.effectivite===gFilterEff;
          return matchCrit && matchEff;
        });

        const FORM_FIELDS=[{l:"Tâche de contrôle *",k:"tache",span:2},{l:"Processus concerné",k:"processus",span:1},{l:"Responsable",k:"responsable",span:1},{l:"Fréquence",k:"frequence",span:1,opts:FREQ_O},{l:"Type",k:"typeControle",span:1,opts:TYPE_O},{l:"Criticité",k:"criticite",span:1,opts:CRIT_O},{l:"Automatisé",k:"automatise",span:1,opts:["OUI","NON","PARTIELLEMENT"]},{l:"Documenté",k:"documentation",span:1,opts:["OUI","NON","PARTIEL"]},{l:"Effectivité",k:"effectivite",span:1,opts:EFF_O},{l:"Dernière évaluation",k:"derEval",span:1,type:"date"},{l:"Prochaine évaluation",k:"prochEval",span:1,type:"date"},{l:"Observation / Recommandation",k:"observation",span:2}];

        return(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{color:"#3B82F6",fontWeight:800,fontSize:13}}>📐 Contrôles & Effectivité — Dispositif CI</div>
                <div style={{color:T.textDim,fontSize:10}}>CRUD complet · Suivi effectivité · Filtres · Export · Analyse IA</div>
              </div>
              <button onClick={()=>{setGForm({tache:"",processus:"",responsable:"",frequence:"MENSUEL",typeControle:"PREVENTIF",criticite:"NORMALE",automatise:"NON",documentation:"NON",effectivite:"NON_TESTE",derEval:"",prochEval:"",observation:""});setGTacheEditId(null);setShowGForm(true);}} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>➕ Nouveau contrôle</button>
            </div>

            {/* KPI SUMMARY */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:12}}>
              {[{v:stats.total,l:"Total",c:"#7A90B0"},{v:pctOK+"%",l:"Efficaces",c:"#22C55E"},{v:stats.non,l:"Non efficaces",c:"#EF4444"},{v:stats.critiques,l:"Critiques",c:"#F97316"},{v:stats.auto,l:"Automatisés",c:"#3B82F6"}].map(k=>(
                <div key={k.l} style={{background:T.surface2,border:`1px solid ${k.c}33`,borderRadius:9,padding:"8px",textAlign:"center"}}><div style={{color:k.c,fontWeight:900,fontSize:18}}>{k.v}</div><div style={{color:T.textMuted,fontSize:9,marginTop:2}}>{k.l}</div></div>
              ))}
            </div>

            {/* FORM ADD/EDIT */}
            {showGForm&&(
              <div style={{background:T.surface2,border:"1px solid #3B82F644",borderRadius:12,padding:14,marginBottom:12}}>
                <div style={{color:"#3B82F6",fontWeight:700,fontSize:12,marginBottom:10}}>{gTacheEditId?"✏️ Modifier le contrôle":"➕ Nouveau contrôle"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {FORM_FIELDS.map(f=>(
                    <div key={f.k} style={{gridColumn:`span ${f.span||1}`}}>
                      <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                      {f.opts?<select value={gForm[f.k]} onChange={e=>setGForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>{f.opts.map(o=><option key={o} value={o}>{o.replace(/_/g," ")}</option>)}</select>:<input type={f.type||"text"} value={gForm[f.k]||""} onChange={e=>setGForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>}
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={()=>{if(!gForm.tache){gcAlert("Tâche requise");return;}if(gTacheEditId){const u=gTaches.map(g=>g.id===gTacheEditId?{...gForm,id:gTacheEditId}:g);saveG(u);}else{saveG([...gTaches,{id:"GT-"+Date.now(),...gForm,createdAt:new Date().toISOString()}]);}setGForm({tache:"",processus:"",responsable:"",frequence:"MENSUEL",typeControle:"PREVENTIF",criticite:"NORMALE",automatise:"NON",documentation:"NON",effectivite:"NON_TESTE",derEval:"",prochEval:"",observation:""});setGTacheEditId(null);setShowGForm(false);}} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Enregistrer</button>
                  <button onClick={()=>{setShowGForm(false);setGTacheEditId(null);}} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                </div>
              </div>
            )}

            {/* FILTRES */}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{color:T.textDim,fontSize:9,fontWeight:700}}>Criticité:</span>
              {["TOUS",...CRIT_O].map(v=><button key={v} onClick={()=>setGFilter(v)} style={{background:gFilter===v?(CRIT_C[v]||"#3B82F6")+"22":"transparent",border:`1px solid ${gFilter===v?(CRIT_C[v]||"#3B82F6"):T.border}`,color:gFilter===v?(CRIT_C[v]||"#3B82F6"):T.textMuted,borderRadius:5,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>{v}</button>)}
              <span style={{color:T.textDim,fontSize:9,fontWeight:700,marginLeft:8}}>Effectivité:</span>
              {["TOUS",...EFF_O].map(v=><button key={v} onClick={()=>setGFilterEff(v)} style={{background:gFilterEff===v?(EFFET_C[v]||"#3B82F6")+"22":"transparent",border:`1px solid ${gFilterEff===v?(EFFET_C[v]||"#3B82F6"):T.border}`,color:gFilterEff===v?(EFFET_C[v]||"#3B82F6"):T.textMuted,borderRadius:5,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>{v.replace(/_/g," ")}</button>)}
              {gTaches.length>0&&<button onClick={()=>{const csv=["Tâche,Processus,Responsable,Fréquence,Type,Criticité,Automatisé,Documenté,Effectivité,Observation",...gTaches.map(g=>`"${g.tache}","${g.processus||""}","${g.responsable||""}","${g.frequence||""}","${g.typeControle||""}","${g.criticite||""}","${g.automatise||""}","${g.documentation||""}","${g.effectivite||""}","${g.observation||""}"`)].join("\n");const b=new Blob(["\uFEFF"+csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="controles_ci.csv";a.click();URL.revokeObjectURL(u);}} style={{marginLeft:"auto",background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>⬇ Export CSV</button>}
            </div>

            {/* TABLE */}
            {filteredG.length===0?<div style={{color:T.textDim,textAlign:"center",padding:24,background:T.surface2,borderRadius:10}}>Aucun contrôle{gTaches.length>0?" pour ces filtres":" défini"}</div>:(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                  <thead><tr style={{background:T.surface3}}>{["Tâche de contrôle","Processus","Resp.","Fréq.","Type","Criticité","Auto","Doc","Effectivité","Proch. Eval.","✎ ✕"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",color:T.textMuted,fontWeight:700,fontSize:9,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>{filteredG.map(g=>(
                    <tr key={g.id} style={{borderBottom:`1px solid ${T.border}22`}}>
                      <td style={{padding:"5px 8px",color:T.text,fontWeight:600,maxWidth:200}}>{g.tache}</td>
                      <td style={{padding:"5px 8px",color:T.textMuted,fontSize:9}}>{g.processus||"—"}</td>
                      <td style={{padding:"5px 8px",color:T.textMuted,fontSize:9}}>{g.responsable||"—"}</td>
                      <td style={{padding:"5px 8px",color:T.textDim,fontSize:9}}>{(g.frequence||"").replace(/_/g," ").slice(0,10)}</td>
                      <td style={{padding:"5px 8px"}}><span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{g.typeControle}</span></td>
                      <td style={{padding:"5px 8px"}}><span style={{background:CRIT_C[g.criticite]+"22",color:CRIT_C[g.criticite],borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{g.criticite}</span></td>
                      <td style={{padding:"5px 8px",textAlign:"center",fontSize:11}}>{g.automatise==="OUI"?"✅":g.automatise==="PARTIELLEMENT"?"🔶":"❌"}</td>
                      <td style={{padding:"5px 8px",textAlign:"center",fontSize:11}}>{g.documentation==="OUI"?"✅":g.documentation==="PARTIEL"?"🔶":"❌"}</td>
                      <td style={{padding:"5px 8px"}}><span style={{background:EFFET_C[g.effectivite]+"22",color:EFFET_C[g.effectivite],borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{(g.effectivite||"").replace(/_/g," ")}</span></td>
                      <td style={{padding:"5px 8px",color:T.textDim,fontSize:9}}>{g.prochEval||"—"}</td>
                      <td style={{padding:"4px 6px",whiteSpace:"nowrap"}}>
                        <button onClick={()=>{setGForm({...g});setGTacheEditId(g.id);setShowGForm(true);}} style={{background:"#3B82F622",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9,marginRight:2}}>✏️</button>
                        <button onClick={()=>setConfirmDel({id:g.id,label:g.tache,type:"grille"})} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9}}>🗑️</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Analyse dispositif CI Génie Consultant:\n${gTaches.length} contrôles, ${gTaches.filter(g=>g.effectivite==="NON_EFFICACE").length} non efficaces, ${gTaches.filter(g=>g.criticite==="CRITIQUE").length} critiques, ${gTaches.filter(g=>g.automatise==="OUI").length} automatisés.\n\nContrôles non efficaces: ${gTaches.filter(g=>g.effectivite==="NON_EFFICACE").slice(0,5).map(g=>g.tache).join(", ")||"Aucun"}.\n\nProduis un diagnostic du dispositif de contrôle interne selon COSO 2013 et ISA 315 avec recommandations priorisées, axes d'amélioration et plan d'action.`)} style={{marginTop:12,background:"#C41E3A22",border:"1px solid #C41E3A44",color:"#C41E3A",borderRadius:8,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:11,width:"100%"}}>🤖 Diagnostic CI complet avec IA (COSO 2013 / ISA 315)</button>
          </div>
        );
      })()}

      {/* ══ PCA — PLAN DE CONTINUITÉ D'ACTIVITÉ ══ */}
      {auditTool==="pca_audit" && (()=>{
        // All state hoisted to AuditApp (Rules of Hooks compliance)
        const IMP_C={CATASTROPHIQUE:"#7F1D1D",GRAVE:"#EF4444",MODÉRÉ:"#F97316",MINEUR:"#F59E0B",NÉGLIGEABLE:"#22C55E"};
        return(
          <div>
            <div style={{color:"#7C3AED",fontWeight:800,fontSize:13,marginBottom:4}}>🛡️ Plan de Continuité d'Activité (PCA)</div>
            <div style={{color:T.textDim,fontSize:10,marginBottom:12}}>Identification des risques · Procédures de reprise · Tests & exercices · RTO/RPO</div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {[["risques","⚠️ Scénarios"],["procedures","📋 Procédures de reprise"],["tests","🧪 Tests PCA"],["synthese","📊 Synthèse"]].map(([id,l])=>(
                <button key={id} onClick={()=>setPcaTab(id)} style={{background:pcaTab===id?"#7C3AED22":"transparent",border:`1px solid ${pcaTab===id?"#7C3AED66":T.border}`,borderRadius:7,padding:"5px 12px",cursor:"pointer",color:pcaTab===id?"#7C3AED":T.textMuted,fontSize:11,fontWeight:pcaTab===id?700:400}}>{l}</button>
              ))}
            </div>
            {pcaTab==="risques"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <span style={{color:T.text,fontWeight:700,fontSize:12}}>Scénarios de risques métier</span>
                  <button onClick={()=>setShowPcaR(!showPcaR)} style={{background:"#7C3AED22",border:"1px solid #7C3AED44",color:"#7C3AED",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>➕ Ajouter</button>
                </div>
                {showPcaR&&(
                  <div style={{background:T.surface2,border:"1px solid #7C3AED44",borderRadius:10,padding:12,marginBottom:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {[{l:"Scénario *",k:"scenario",span:3},{l:"Probabilité",k:"probabilite",span:1,opts:["TRÈS_ÉLEVÉE","ÉLEVÉE","MOYENNE","FAIBLE","TRÈS_FAIBLE"]},{l:"Impact",k:"impact",span:1,opts:["CATASTROPHIQUE","GRAVE","MODÉRÉ","MINEUR","NÉGLIGEABLE"]},{l:"Statut",k:"statut",span:1,opts:["IDENTIFIÉ","EN_TRAITEMENT","COUVERT","ACCEPTÉ"]},{l:"RTO (temps de reprise)",k:"rto",span:1},{l:"RPO (perte données max)",k:"rpo",span:1},{l:"Responsable",k:"responsable",span:1},{l:"Mesure de mitigation",k:"mesure",span:3}].map(f=>(
                        <div key={f.k} style={{gridColumn:`span ${f.span||1}`}}>
                          <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                          {f.opts?<select value={pcaRForm[f.k]} onChange={e=>setPcaRForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>{f.opts.map(o=><option key={o} value={o}>{o.replace(/_/g," ")}</option>)}</select>
                          :<input value={pcaRForm[f.k]} onChange={e=>setPcaRForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/>}
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:10}}>
                      <button onClick={()=>{if(!pcaRForm.scenario)return;savePcaR([{id:"PCR-"+Date.now(),...pcaRForm},...pcaRisques]);setPcaRForm({scenario:"",probabilite:"MOYENNE",impact:"GRAVE",rto:"4h",rpo:"24h",responsable:"",mesure:"",statut:"IDENTIFIÉ"});setShowPcaR(false);}} style={{background:"#7C3AED",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Ajouter</button>
                      <button onClick={()=>setShowPcaR(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                    </div>
                  </div>
                )}
                {pcaRisques.map(r=>(
                  <div key={r.id} style={{background:T.surface2,border:`1px solid ${IMP_C[r.impact]||"#888"}33`,borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:4}}>{r.scenario}</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <span style={{background:(IMP_C[r.impact]||"#888")+"22",color:IMP_C[r.impact]||"#888",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>Impact: {r.impact}</span>
                        <span style={{background:"#7C3AED22",color:"#7C3AED",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>RTO: {r.rto}</span>
                        <span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>RPO: {r.rpo}</span>
                        {r.responsable&&<span style={{color:T.textMuted,fontSize:9}}>👤 {r.responsable}</span>}
                        <span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>{r.statut}</span>
                      </div>
                      {r.mesure&&<div style={{color:T.textDim,fontSize:10,marginTop:4}}>Mesure: {r.mesure}</div>}
                    </div>
                    <button onClick={()=>{dsDeleteItemFromArray("gc-pca-risques",r.id);setPcaRisques(p=>p.filter(x=>x.id!==r.id));}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                  </div>
                ))}
                {pcaRisques.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:24,background:T.surface2,borderRadius:10}}>Aucun scénario défini</div>}
              </div>
            )}
            {pcaTab==="procedures"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <span style={{color:T.text,fontWeight:700,fontSize:12}}>Procédures de reprise / continuité</span>
                  <button onClick={()=>setShowPcaP(!showPcaP)} style={{background:"#7C3AED22",border:"1px solid #7C3AED44",color:"#7C3AED",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>➕ Ajouter</button>
                </div>
                {showPcaP&&(
                  <div style={{background:T.surface2,border:"1px solid #7C3AED44",borderRadius:10,padding:12,marginBottom:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {[{l:"Titre *",k:"titre",span:2},{l:"Type",k:"type",span:1,opts:["REPRISE","CONTINUITÉ","CRISE","COMMUNICATION","SECOURS"]},{l:"Déclencheur",k:"declencheur",span:1},{l:"Étapes clés",k:"etapes",span:2},{l:"Responsable",k:"responsable",span:1},{l:"Durée estimée",k:"duree",span:1},{l:"Ressources nécessaires",k:"ressources",span:1},{l:"Contact urgence",k:"contact_urgence",span:1}].map(f=>(
                        <div key={f.k} style={{gridColumn:`span ${f.span||1}`}}>
                          <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                          {f.opts?<select value={pcaPForm[f.k]} onChange={e=>setPcaPForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>{f.opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                          :<input value={pcaPForm[f.k]} onChange={e=>setPcaPForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/>}
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:10}}>
                      <button onClick={()=>{if(!pcaPForm.titre)return;savePcaP([{id:"PCP-"+Date.now(),...pcaPForm},...pcaProc]);setPcaPForm({titre:"",type:"REPRISE",declencheur:"",etapes:"",responsable:"",duree:"",ressources:"",contact_urgence:""});setShowPcaP(false);}} style={{background:"#7C3AED",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Enregistrer</button>
                      <button onClick={()=>setShowPcaP(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                    </div>
                  </div>
                )}
                {pcaProc.map(p=>(
                  <div key={p.id} style={{background:T.surface2,border:"1px solid #7C3AED33",borderRadius:10,padding:"10px 14px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div style={{color:T.text,fontWeight:700,fontSize:12}}>{p.titre}</div>
                      <div style={{display:"flex",gap:6}}>
                        <span style={{background:"#7C3AED22",color:"#7C3AED",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>{p.type}</span>
                        <button onClick={()=>{dsDeleteItemFromArray("gc-pca-procedures",p.id);setPcaProc(prev=>prev.filter(x=>x.id!==p.id));}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                      </div>
                    </div>
                    {p.declencheur&&<div style={{color:T.textMuted,fontSize:10,marginBottom:4}}>🔔 Déclencheur : {p.declencheur}</div>}
                    {p.etapes&&<div style={{color:T.text,fontSize:10,marginBottom:4,borderLeft:"3px solid #7C3AED",paddingLeft:8}}>{p.etapes}</div>}
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {p.responsable&&<span style={{color:T.textMuted,fontSize:9}}>👤 {p.responsable}</span>}
                      {p.duree&&<span style={{color:T.textMuted,fontSize:9}}>⏱ {p.duree}</span>}
                      {p.contact_urgence&&<span style={{color:"#EF4444",fontSize:9,fontWeight:700}}>🚨 {p.contact_urgence}</span>}
                    </div>
                  </div>
                ))}
                {pcaProc.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:24,background:T.surface2,borderRadius:10}}>Aucune procédure définie</div>}
              </div>
            )}
            {pcaTab==="tests"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <span style={{color:T.text,fontWeight:700,fontSize:12}}>Tests & exercices PCA</span>
                  <button onClick={async () => {const titre = await gcPrompt("Titre du test PCA :");if(!titre)return;const date = await gcPrompt("Date du test (AAAA-MM-JJ) :");const res = await gcPrompt("Résultats / Observations :");savePcaT([{id:"PCT-"+Date.now(),titre,date:date||new Date().toISOString().split("T")[0],res:res||"",statut:"RÉALISÉ",planificateur:currentUser?.name},...pcaTest]);}} style={{background:"#7C3AED22",border:"1px solid #7C3AED44",color:"#7C3AED",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>➕ Nouveau test</button>
                </div>
                {pcaTest.map(t=>(
                  <div key={t.id} style={{background:T.surface2,border:"1px solid #7C3AED33",borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{color:T.text,fontWeight:700,fontSize:12}}>{t.titre}</div>
                      <div style={{color:T.textMuted,fontSize:10}}>{t.date} · {t.planificateur}</div>
                      {t.res&&<div style={{color:T.text,fontSize:10,marginTop:4,fontStyle:"italic"}}>{t.res}</div>}
                    </div>
                    <span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>{t.statut}</span>
                    <button onClick={()=>{dsDeleteItemFromArray("gc-pca-tests",t.id);setPcaTest(prev=>prev.filter(x=>x.id!==t.id));}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                  </div>
                ))}
                {pcaTest.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:24,background:T.surface2,borderRadius:10}}>Aucun test réalisé — planifiez un exercice PCA</div>}
              </div>
            )}
            {pcaTab==="synthese"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                {[{l:"Scénarios identifiés",v:pcaRisques.length,c:"#7C3AED",i:"⚠️"},{l:"Scénarios couverts",v:pcaRisques.filter(r=>r.statut==="COUVERT").length,c:"#22C55E",i:"✅"},{l:"Procédures de reprise",v:pcaProc.length,c:"#3B82F6",i:"📋"},{l:"Tests réalisés",v:pcaTest.length,c:"#C9A84C",i:"🧪"}].map(s=>(
                  <div key={s.l} style={{background:T.surface2,border:`2px solid ${s.c}33`,borderRadius:12,padding:"16px",textAlign:"center"}}>
                    <div style={{fontSize:22,marginBottom:4}}>{s.i}</div>
                    <div style={{color:s.c,fontWeight:900,fontSize:28}}>{s.v}</div>
                    <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{s.l}</div>
                  </div>
                ))}
                <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`PCA Génie Consultant: ${pcaRisques.length} scénarios (${pcaRisques.filter(r=>r.statut==="COUVERT").length} couverts), ${pcaProc.length} procédures, ${pcaTest.length} tests. Génère une évaluation de la maturité PCA et des recommandations d'amélioration selon ISO 22301.`)} style={{gridColumn:"span 2",background:"#7C3AED22",border:"1px solid #7C3AED44",color:"#7C3AED",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:11}}>🤖 Évaluation maturité PCA avec IA (ISO 22301)</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ COSO / RÉFÉRENTIEL CONTRÔLE INTERNE ══ */}
      {auditTool==="coso" && (()=>{
        const COMPOSANTES=[
          {id:"env_ctrl",label:"Environnement de contrôle",icon:"🏛️",color:"#C41E3A",desc:"Culture, valeurs éthiques, structure de gouvernance",questions:["Les valeurs éthiques sont-elles formalisées et communiquées ?","La direction donne-t-elle l'exemple en matière d'intégrité ?","La structure organisationnelle est-elle clairement définie ?","Les responsabilités sont-elles bien attribuées ?","Le personnel possède-t-il les compétences requises ?","Le conseil d'administration exerce-t-il une supervision effective ?","Les politiques RH encouragent-elles la performance éthique ?"]},
          {id:"eval_risq",label:"Évaluation des risques",icon:"⚠️",color:"#EF4444",desc:"Identification, analyse et traitement des risques",questions:["Les objectifs organisationnels sont-ils clairement définis ?","Un processus d'identification des risques est-il en place ?","Les risques de fraude sont-ils pris en compte ?","La tolérance au risque est-elle définie ?","Les changements importants sont-ils évalués ?","Les risques liés aux systèmes d'information sont-ils identifiés ?","Des mécanismes de détection de fraude existent-ils ?"]},
          {id:"activite_ctrl",label:"Activités de contrôle",icon:"⚙️",color:"#F97316",desc:"Politiques, procédures, séparation des tâches",questions:["Des procédures de contrôle sont-elles documentées ?","La séparation des tâches est-elle effectivement appliquée ?","Les autorisations et approbations sont-elles formalisées ?","Les actifs sont-ils physiquement sécurisés ?","Des réconciliations régulières sont-elles effectuées ?","Les contrôles des systèmes d'information sont-ils en place ?","Les politiques et procédures sont-elles mises à jour régulièrement ?"]},
          {id:"info_comm",label:"Information & Communication",icon:"📡",color:"#3B82F6",desc:"Qualité de l'information, canaux internes et externes",questions:["L'information est-elle disponible en temps opportun ?","La communication interne est-elle efficace ?","Les alertes remontent-elles à la direction ?","Les parties prenantes externes sont-elles informées ?","Les systèmes d'information sont-ils sécurisés ?","Des canaux de signalement anonyme existent-ils ?","L'information est-elle fiable et complète ?"]},
          {id:"pilotage",label:"Pilotage (Monitoring)",icon:"📊",color:"#22C55E",desc:"Suivi continu, évaluations périodiques, actions correctives",questions:["Un suivi continu du dispositif de CI est-il effectué ?","Des évaluations périodiques sont-elles réalisées ?","Les déficiences identifiées sont-elles corrigées ?","La direction reçoit-elle des rapports sur le CI ?","Les recommandations d'audit sont-elles suivies ?","Des indicateurs de performance du CI sont-ils définis ?","Les correctifs sont-ils validés après mise en œuvre ?"]},
        ];
        const saveScores=saveCosoScores;
        const score=(id)=>{
          const base=COMPOSANTES.find(c=>c.id===id)?.questions||[];
          const custom=cosoCustomQ.filter(q=>q.composante===id);
          const allQ=[...base.map((_,qi)=>({key:`${id}_${qi}`})),...custom.map((q,ci)=>({key:`${id}_cq${ci}`}))];
          const done=allQ.filter(q=>cosoScores[q.key]).length;
          return allQ.length>0?Math.round(done/allQ.length*100):0;
        };
        const MATURITE=["Inexistant","Initial","Répétable","Défini","Géré","Optimisé"];
        const maturite=(s)=>s<20?0:s<40?1:s<60?2:s<80?3:s<95?4:5;
        const globalScore=Math.round(COMPOSANTES.reduce((a,c)=>a+score(c.id),0)/COMPOSANTES.length);
        const gc=globalScore>=80?"#22C55E":globalScore>=60?"#F59E0B":globalScore>=40?"#F97316":"#EF4444";

        return(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div>
                <div style={{color:"#F59E0B",fontWeight:800,fontSize:13}}>🏛️ COSO 2013 — Évaluation du Contrôle Interne</div>
                <div style={{color:T.textDim,fontSize:10}}>5 composantes · Questions personnalisables · Observations · Rapport IA</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:gc,fontWeight:900,fontSize:22,lineHeight:1}}>{globalScore}%</div>
                <div style={{color:gc,fontSize:9,fontWeight:700}}>{MATURITE[maturite(globalScore)]}</div>
              </div>
            </div>
            <div style={{height:6,background:T.surface3,borderRadius:3,marginBottom:12}}><div style={{width:globalScore+"%",height:"100%",background:gc,borderRadius:3,transition:"width 0.8s"}}/></div>

            {/* TABS */}
            <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
              {[["eval","📋 Évaluation"],["notes","📝 Observations"],["synthese","📊 Synthèse"],["config","⚙️ Personnaliser"]].map(([id,l])=>(
                <button key={id} onClick={()=>setCosoTab(id)} style={{background:cosoTab===id?"#F59E0B22":"transparent",border:`1px solid ${cosoTab===id?"#F59E0B66":T.border}`,borderRadius:7,padding:"5px 12px",cursor:"pointer",color:cosoTab===id?"#F59E0B":T.textMuted,fontSize:11,fontWeight:cosoTab===id?700:400}}>{l}</button>
              ))}
            </div>

            {/* ── TAB: ÉVALUATION ── */}
            {cosoTab==="eval"&&COMPOSANTES.map(comp=>{
              const s=score(comp.id);const mat=maturite(s);
              const mc=s>=80?"#22C55E":s>=60?"#F59E0B":s>=40?"#F97316":"#EF4444";
              const customForComp=cosoCustomQ.filter(q=>q.composante===comp.id);
              const isExpanded=cosoEditComp===comp.id;
              return(
                <div key={comp.id} style={{background:T.surface2,border:`1px solid ${isExpanded?comp.color+"66":mc+"33"}`,borderRadius:12,padding:14,marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",marginBottom:isExpanded?10:0}} onClick={()=>setCosoEditComp(isExpanded?null:comp.id)}>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontSize:22}}>{comp.icon}</span>
                      <div>
                        <div style={{color:T.text,fontWeight:700,fontSize:12}}>{comp.label}</div>
                        <div style={{color:T.textDim,fontSize:9}}>{comp.desc}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{color:mc,fontWeight:900,fontSize:18}}>{s}%</div>
                        <div style={{color:mc,fontSize:8,fontWeight:700}}>{MATURITE[mat]}</div>
                      </div>
                      <span style={{color:T.textDim,fontSize:12}}>{isExpanded?"▲":"▼"}</span>
                    </div>
                  </div>
                  {isExpanded&&(
                    <>
                      <div style={{height:3,background:T.surface3,borderRadius:2,marginBottom:10}}><div style={{width:s+"%",height:"100%",background:mc,borderRadius:2,transition:"width 0.6s"}}/></div>
                      <div style={{marginBottom:8}}>
                        <div style={{color:T.textMuted,fontSize:9,fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Questions standards</div>
                        {comp.questions.map((q,qi)=>(
                          <div key={qi} style={{display:"flex",gap:8,alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}15`}}>
                            <input type="checkbox" checked={!!cosoScores[`${comp.id}_${qi}`]} onChange={e=>saveScores({...cosoScores,[`${comp.id}_${qi}`]:e.target.checked})} style={{accentColor:mc,width:15,height:15,flexShrink:0}}/>
                            <span style={{color:cosoScores[`${comp.id}_${qi}`]?T.text:T.textMuted,fontSize:10,flex:1}}>{q}</span>
                            {cosoScores[`${comp.id}_${qi}`]&&<span style={{color:mc,fontSize:10,fontWeight:700}}>✓</span>}
                          </div>
                        ))}
                        {customForComp.length>0&&(
                          <>
                            <div style={{color:T.textMuted,fontSize:9,fontWeight:700,margin:"8px 0 5px",textTransform:"uppercase",letterSpacing:0.5}}>Questions personnalisées</div>
                            {customForComp.map((q,ci)=>(
                              <div key={ci} style={{display:"flex",gap:8,alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${T.border}15`,background:`${comp.color}05`,borderRadius:4}}>
                                <input type="checkbox" checked={!!cosoScores[`${comp.id}_cq${ci}`]} onChange={e=>saveScores({...cosoScores,[`${comp.id}_cq${ci}`]:e.target.checked})} style={{accentColor:comp.color,width:15,height:15,flexShrink:0}}/>
                                <span style={{color:cosoScores[`${comp.id}_cq${ci}`]?T.text:T.textMuted,fontSize:10,flex:1}}>{q.question}</span>
                                <button onClick={()=>{const u=cosoCustomQ.filter((_,i2)=>!(cosoCustomQ.indexOf(q)===cosoCustomQ.indexOf(q)&&i2===cosoCustomQ.indexOf(q)));saveCosoCustomQ(cosoCustomQ.filter(x=>x!==q));}} style={{background:"#EF444415",border:"none",color:"#EF4444",cursor:"pointer",fontSize:9,borderRadius:3,padding:"1px 5px"}}>✕</button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* ── TAB: OBSERVATIONS ── */}
            {cosoTab==="notes"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:12}}>📝 Observations & Points de contrôle</div>
                  <button onClick={()=>setShowCosoNoteForm(v=>!v)} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>➕ Observation</button>
                </div>
                {showCosoNoteForm&&(
                  <div style={{background:T.surface2,border:"1px solid #F59E0B44",borderRadius:10,padding:12,marginBottom:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                      <div>
                        <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Composante</label>
                        <select value={cosoNoteForm.composante} onChange={e=>setCosoNoteForm(f=>({...f,composante:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                          <option value="">— Globale —</option>
                          {COMPOSANTES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Type</label>
                        <select value={cosoNoteForm.type} onChange={e=>setCosoNoteForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                          {["OBSERVATION","DÉFICIENCE","RECOMMANDATION","POINT_FORT"].map(t=><option key={t} value={t}>{t.replace(/_/g," ")}</option>)}
                        </select>
                      </div>
                      <div style={{gridColumn:"span 2"}}>
                        <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Texte de l'observation *</label>
                        <textarea value={cosoNoteForm.texte} onChange={e=>setCosoNoteForm(f=>({...f,texte:e.target.value}))} rows={3} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{if(!cosoNoteForm.texte.trim())return;saveCosoNotes([...cosoNotes,{id:"CN-"+Date.now(),...cosoNoteForm,createdAt:new Date().toISOString(),createdBy:currentUser?.name||""}]);setCosoNoteForm({composante:"",texte:"",type:"OBSERVATION"});setShowCosoNoteForm(false);}} style={{background:"#F59E0B",border:"none",color:"#000",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Enregistrer</button>
                      <button onClick={()=>setShowCosoNoteForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                    </div>
                  </div>
                )}
                {cosoNotes.length===0?<div style={{color:T.textDim,textAlign:"center",padding:24,background:T.surface2,borderRadius:10}}>Aucune observation enregistrée</div>:(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {cosoNotes.map(n=>{
                      const TYPE_C={OBSERVATION:"#3B82F6",DÉFICIENCE:"#EF4444",RECOMMANDATION:"#F59E0B",POINT_FORT:"#22C55E"};
                      const tc=TYPE_C[n.type]||"#7A90B0";
                      const comp=COMPOSANTES.find(c=>c.id===n.composante);
                      return(
                        <div key={n.id} style={{background:T.surface2,border:`1px solid ${tc}33`,borderRadius:10,padding:"10px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                          <span style={{background:tc+"22",color:tc,borderRadius:5,padding:"2px 7px",fontSize:8,fontWeight:700,flexShrink:0}}>{n.type.replace(/_/g," ")}</span>
                          <div style={{flex:1}}>
                            {comp&&<div style={{color:comp.color,fontSize:9,fontWeight:700,marginBottom:2}}>{comp.icon} {comp.label}</div>}
                            <div style={{color:T.text,fontSize:11}}>{n.texte}</div>
                            <div style={{color:T.textDim,fontSize:9,marginTop:4}}>{n.createdBy} · {n.createdAt?new Date(n.createdAt).toLocaleDateString("fr-FR"):""}</div>
                          </div>
                          <button onClick={()=>saveCosoNotes(cosoNotes.filter(x=>x.id!==n.id))} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: SYNTHÈSE ── */}
            {cosoTab==="synthese"&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:14}}>
                  {COMPOSANTES.map(comp=>{const s=score(comp.id);const mc=s>=80?"#22C55E":s>=60?"#F59E0B":s>=40?"#F97316":"#EF4444";return(
                    <div key={comp.id} style={{background:T.surface2,border:`2px solid ${mc}44`,borderRadius:12,padding:"12px 8px",textAlign:"center",cursor:"pointer"}} onClick={()=>{setCosoEditComp(comp.id);setCosoTab("eval");}}>
                      <div style={{fontSize:20,marginBottom:4}}>{comp.icon}</div>
                      <div style={{color:mc,fontWeight:900,fontSize:24}}>{s}%</div>
                      <div style={{height:4,background:T.surface3,borderRadius:2,margin:"5px 0"}}><div style={{width:s+"%",height:"100%",background:mc,borderRadius:2}}/></div>
                      <div style={{color:T.textMuted,fontSize:8,lineHeight:1.3}}>{comp.label}</div>
                      <div style={{color:mc,fontSize:8,fontWeight:700,marginTop:3}}>{MATURITE[maturite(s)]}</div>
                    </div>
                  );})}
                </div>
                <div style={{background:T.surface2,border:`2px solid ${gc}44`,borderRadius:12,padding:14,marginBottom:12,textAlign:"center"}}>
                  <div style={{color:T.textMuted,fontSize:11,marginBottom:4}}>Score global COSO 2013</div>
                  <div style={{color:gc,fontWeight:900,fontSize:32}}>{globalScore}%</div>
                  <div style={{color:gc,fontWeight:700,fontSize:13,marginBottom:8}}>{MATURITE[maturite(globalScore)]}</div>
                  <div style={{height:8,background:T.surface3,borderRadius:4}}><div style={{width:globalScore+"%",height:"100%",background:gc,borderRadius:4,transition:"width 0.8s"}}/></div>
                </div>
                {cosoNotes.filter(n=>n.type==="DÉFICIENCE").length>0&&(
                  <div style={{background:"#EF444410",border:"1px solid #EF444433",borderRadius:10,padding:12,marginBottom:10}}>
                    <div style={{color:"#EF4444",fontWeight:700,fontSize:11,marginBottom:6}}>⚠️ Déficiences identifiées ({cosoNotes.filter(n=>n.type==="DÉFICIENCE").length})</div>
                    {cosoNotes.filter(n=>n.type==="DÉFICIENCE").map(n=><div key={n.id} style={{color:T.text,fontSize:10,marginBottom:3}}>• {n.texte}</div>)}
                  </div>
                )}
                <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Évaluation COSO 2013 Génie Consultant:\n${COMPOSANTES.map(c=>`${c.label}: ${score(c.id)}% (${MATURITE[maturite(score(c.id))]})`).join("\n")}\n\nScore global: ${globalScore}% — ${MATURITE[maturite(globalScore)]}\n\nDéficiences: ${cosoNotes.filter(n=>n.type==="DÉFICIENCE").map(n=>n.texte).join("; ")||"Aucune documentée"}\n\nGénère un rapport complet d'évaluation CI selon COSO 2013 avec: diagnostic par composante, déficiences prioritaires, plan d'action chiffré, KPIs de suivi et recommandations IIA.`)} style={{width:"100%",background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:8,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:11}}>🤖 Rapport COSO complet avec IA (standard IIA)</button>
              </div>
            )}

            {/* ── TAB: CONFIG — Questions personnalisées ── */}
            {cosoTab==="config"&&(
              <div>
                <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>⚙️ Personnaliser les questions par composante</div>
                <div style={{background:T.surface2,border:"1px solid #F59E0B33",borderRadius:10,padding:12,marginBottom:14}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    <div>
                      <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Composante cible *</label>
                      <select value={cosoNewQ.composante} onChange={e=>setCosoNewQ(f=>({...f,composante:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                        {COMPOSANTES.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                      </select>
                    </div>
                    <div style={{display:"flex",alignItems:"flex-end"}}>
                      <button onClick={()=>{if(!cosoNewQ.question.trim())return;saveCosoCustomQ([...cosoCustomQ,{...cosoNewQ}]);setCosoNewQ({composante:cosoNewQ.composante,question:""}); }} style={{background:"#F59E0B",border:"none",color:"#000",borderRadius:7,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:11,width:"100%"}}>➕ Ajouter</button>
                    </div>
                    <div style={{gridColumn:"span 2"}}>
                      <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Nouvelle question *</label>
                      <input value={cosoNewQ.question} onChange={e=>setCosoNewQ(f=>({...f,question:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter"&&cosoNewQ.question.trim()){saveCosoCustomQ([...cosoCustomQ,{...cosoNewQ}]);setCosoNewQ({composante:cosoNewQ.composante,question:""});}}} placeholder="Saisissez votre question de contrôle interne…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                </div>
                {COMPOSANTES.map(comp=>{
                  const custom=cosoCustomQ.filter(q=>q.composante===comp.id);
                  if(!custom.length)return null;
                  return(
                    <div key={comp.id} style={{background:T.surface2,border:`1px solid ${comp.color}33`,borderRadius:10,padding:12,marginBottom:8}}>
                      <div style={{color:comp.color,fontWeight:700,fontSize:11,marginBottom:6}}>{comp.icon} {comp.label} ({custom.length} questions personnalisées)</div>
                      {custom.map((q,ci)=>(
                        <div key={ci} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:`1px solid ${T.border}15`}}>
                          <span style={{color:T.text,fontSize:10,flex:1}}>• {q.question}</span>
                          <button onClick={()=>saveCosoCustomQ(cosoCustomQ.filter(x=>x!==q))} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:9}}>✕</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {cosoCustomQ.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:20,background:T.surface2,borderRadius:10}}>Aucune question personnalisée. Ajoutez-en pour affiner votre évaluation COSO.</div>}
                <button onClick={async () => {if(await gcConfirm("Réinitialiser toutes les réponses COSO ?")){saveScores({});}}} style={{marginTop:10,background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️ Réinitialiser les réponses</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ CARTOGRAPHIE & ORGANIGRAMME — CRUD COMPLET ══ */}
      {auditTool==="organigramme" && (()=>{
        // Noeuds par défaut (processus Génie Consultant)
        const DEFAULT_NODES=[
          {id:"P01",label:"Pilotage Stratégique",role:"Direction Générale",responsable:"",color:"#C41E3A",type:"PILOTAGE"},
          {id:"P02",label:"Gouvernance & Conformité",role:"Directeur Adjoint",responsable:"",color:"#7C3AED",type:"PILOTAGE"},
          {id:"P03",label:"Performance & Contrôle",role:"Contrôleur de Gestion",responsable:"",color:"#1E40AF",type:"MANAGEMENT"},
          {id:"O01",label:"Administration",role:"Secrétaire Général",responsable:"",color:"#C9A84C",type:"OPERATIONNEL"},
          {id:"O02",label:"Juridique",role:"Responsable Juridique",responsable:"",color:"#DC2626",type:"OPERATIONNEL"},
          {id:"O03",label:"Audit & Contrôle",role:"Responsable Audit",responsable:"",color:"#B45309",type:"OPERATIONNEL"},
          {id:"S01",label:"Finance & Comptabilité",role:"Responsable Financier",responsable:"",color:"#065F46",type:"SUPPORT"},
          {id:"S02",label:"Audit Interne",role:"Auditeur Interne",responsable:"",color:"#7C3AED",type:"SUPPORT"},
          {id:"S03",label:"Ressources Humaines",role:"DRH",responsable:"",color:"#9D174D",type:"SUPPORT"},
          {id:"S04",label:"Communication",role:"Responsable Comm.",responsable:"",color:"#0369A1",type:"SUPPORT"},
          {id:"S05",label:"Logistique",role:"Responsable Logistique",responsable:"",color:"#78716C",type:"SUPPORT"},
          {id:"S06",label:"Entretien & Sécurité",role:"Responsable Technique",responsable:"",color:"#064E3B",type:"SUPPORT"},
        ];
        const DEFAULT_LINKS=[["P01","P02"],["P01","P03"],["P02","O01"],["P02","O02"],["P03","O03"],["O01","S01"],["O02","S02"],["O03","S03"],["S01","S04"],["S02","S05"],["S03","S06"]];

        const nodes = orgigramNodes || DEFAULT_NODES;
        const links = orgigramLinks || DEFAULT_LINKS.map(([f,t])=>({from:f,to:t,type:"hierarchique"}));

        const TYPE_COLORS={PILOTAGE:"#C41E3A",MANAGEMENT:"#1E40AF",OPERATIONNEL:"#D97706",SUPPORT:"#06B6D4",AUTRE:"#7A90B0"};
        const [selected, setSelected]=[orgigramSelected,setOrgigramSelected];
        const selNode = nodes.find(n=>n.id===selected);

        // Layout automatique par type
        const ROWS={PILOTAGE:0,MANAGEMENT:1,OPERATIONNEL:2,SUPPORT:3,AUTRE:4};
        const getLayout=(nodeList)=>{
          const byRow={};
          nodeList.forEach(n=>{const r=ROWS[n.type]??4;if(!byRow[r])byRow[r]=[];byRow[r].push(n);});
          const positioned={};
          Object.entries(byRow).forEach(([row,nds])=>{
            const rowNum=parseInt(row);
            nds.forEach((n,i)=>{positioned[n.id]={x:50+i*(Math.min(160,Math.floor(560/Math.max(nds.length,1)))),y:30+rowNum*90,w:Math.min(150,Math.floor(540/Math.max(nds.length,1))),h:44};});
          });
          return positioned;
        };
        const layout=getLayout(nodes);
        const svgH=30+Object.keys(ROWS).length*90+60;

        return(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div>
                <div style={{color:"#06B6D4",fontWeight:800,fontSize:13}}>🏢 Cartographie & Organigramme — CRUD complet</div>
                <div style={{color:T.textDim,fontSize:10}}>Ajouter, modifier, supprimer nœuds · Liaisons hiérarchiques · Cliquable</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setOrgigramEditMode(v=>!v)} style={{background:orgigramEditMode?"#06B6D422":T.surface2,border:`1px solid ${orgigramEditMode?"#06B6D4":T.border}`,color:orgigramEditMode?"#06B6D4":T.textMuted,borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>{orgigramEditMode?"✅ Mode édition":"✏️ Éditer"}</button>
                {orgigramEditMode&&<button onClick={()=>setShowOrgigramNodeForm(v=>!v)} style={{background:"#06B6D4",border:"none",color:"#fff",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>➕ Nœud</button>}
                {orgigramEditMode&&<button onClick={()=>setShowOrgigramLinkForm(v=>!v)} style={{background:"#7C3AED",border:"none",color:"#fff",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>🔗 Lien</button>}
                {orgigramEditMode&&<button onClick={async () => {if(await gcConfirm("Réinitialiser l'organigramme aux valeurs par défaut ?")){{saveOrgigramNodes(DEFAULT_NODES);saveOrgigramLinks(DEFAULT_LINKS.map(([f,t])=>({from:f,to:t,type:"hierarchique"})));setOrgigramEditMode(false);setSelected(null);}}}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:9,fontWeight:700}}>🔄 Réinit.</button>}
              </div>
            </div>

            {/* FORM: Nouveau nœud */}
            {showOrgigramNodeForm&&orgigramEditMode&&(
              <div style={{background:T.surface2,border:"1px solid #06B6D444",borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{color:"#06B6D4",fontWeight:700,fontSize:11,marginBottom:8}}>{orgigramNodeForm.id&&nodes.find(n=>n.id===orgigramNodeForm.id)?"✏️ Modifier le nœud":"➕ Nouveau nœud"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                  {[["ID unique *","id"],["Libellé *","label"],["Rôle / Poste","role"],["Responsable","responsable"]].map(([l,k])=>(
                    <div key={k}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{l}</label><input value={orgigramNodeForm[k]||""} onChange={e=>setOrgigramNodeForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                  ))}
                  <div>
                    <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Type</label>
                    <select value={orgigramNodeForm.type||"SUPPORT"} onChange={e=>setOrgigramNodeForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                      {Object.keys(TYPE_COLORS).map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Couleur</label>
                    <input type="color" value={orgigramNodeForm.color||"#3B82F6"} onChange={e=>setOrgigramNodeForm(f=>({...f,color:e.target.value}))} style={{width:"100%",height:34,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer"}}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{if(!orgigramNodeForm.id||!orgigramNodeForm.label){gcAlert("ID et Libellé requis");return;}const existing=nodes.find(n=>n.id===orgigramNodeForm.id);let u;if(existing)u=nodes.map(n=>n.id===orgigramNodeForm.id?{...orgigramNodeForm}:n);else u=[...nodes,{...orgigramNodeForm}];saveOrgigramNodes(u);setOrgigramNodeForm({id:"",label:"",role:"",responsable:"",color:"#3B82F6",type:"SUPPORT"});setShowOrgigramNodeForm(false);}} style={{background:"#06B6D4",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Enregistrer</button>
                  <button onClick={()=>setShowOrgigramNodeForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                </div>
              </div>
            )}

            {/* FORM: Nouveau lien */}
            {showOrgigramLinkForm&&orgigramEditMode&&(
              <div style={{background:T.surface2,border:"1px solid #7C3AED44",borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{color:"#7C3AED",fontWeight:700,fontSize:11,marginBottom:8}}>🔗 Ajouter / Supprimer un lien</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                  <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Nœud source</label>
                    <select value={orgigramLinkForm.from} onChange={e=>setOrgigramLinkForm(f=>({...f,from:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                      <option value="">— Sélectionner —</option>{nodes.map(n=><option key={n.id} value={n.id}>{n.id} — {n.label}</option>)}
                    </select></div>
                  <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Nœud cible</label>
                    <select value={orgigramLinkForm.to} onChange={e=>setOrgigramLinkForm(f=>({...f,to:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                      <option value="">— Sélectionner —</option>{nodes.map(n=><option key={n.id} value={n.id}>{n.id} — {n.label}</option>)}
                    </select></div>
                  <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Type de lien</label>
                    <select value={orgigramLinkForm.type} onChange={e=>setOrgigramLinkForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                      <option value="hierarchique">Hiérarchique</option><option value="fonctionnel">Fonctionnel</option><option value="cooperation">Coopération</option>
                    </select></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{if(!orgigramLinkForm.from||!orgigramLinkForm.to||orgigramLinkForm.from===orgigramLinkForm.to){gcAlert("Source et cible requis, différents");return;}const exists=links.find(l=>l.from===orgigramLinkForm.from&&l.to===orgigramLinkForm.to);if(exists){gcAlert("Ce lien existe déjà");return;}const u=[...links,{...orgigramLinkForm}];saveOrgigramLinks(u);setOrgigramLinkForm({from:"",to:"",type:"hierarchique"});setShowOrgigramLinkForm(false);}} style={{background:"#7C3AED",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Ajouter le lien</button>
                  <button onClick={()=>setShowOrgigramLinkForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                </div>
              </div>
            )}

            {/* SVG ORGANIGRAMME */}
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:12,overflowX:"auto",marginBottom:10}}>
              <svg viewBox={`0 0 660 ${svgH}`} width="100%" style={{maxWidth:660,display:"block",margin:"0 auto"}}>
                <defs>
                  <marker id="arrhier" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#7A90B0"/></marker>
                  <marker id="arrfunc" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#C9A84C"/></marker>
                  <marker id="arrcoop" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#06B6D4"/></marker>
                </defs>
                {/* Fond par type */}
                {Object.entries(ROWS).map(([type,row])=>{
                  const rowNodes=nodes.filter(n=>(n.type||"SUPPORT")===type);
                  if(!rowNodes.length)return null;
                  const tc=TYPE_COLORS[type]||"#7A90B0";
                  return <React.Fragment key={type}>
                    <rect x="5" y={20+row*90} width="650" height="70" rx="6" fill={tc+"08"} stroke={tc+"22"} strokeWidth="1"/>
                    <text x="12" y={32+row*90} fontSize="8" fill={tc} fontWeight="bold">{type}</text>
                  </React.Fragment>;
                })}
                {/* Liens */}
                {links.map((lk,i)=>{
                  const f=layout[lk.from],t=layout[lk.to];if(!f||!t)return null;
                  const stroke=lk.type==="fonctionnel"?"#C9A84C":lk.type==="cooperation"?"#06B6D4":"#7A90B066";
                  const mId=lk.type==="fonctionnel"?"arrfunc":lk.type==="cooperation"?"arrcoop":"arrhier";
                  const dash=lk.type!=="hierarchique"?"4 3":undefined;
                  return <line key={i} x1={f.x+f.w/2} y1={f.y+f.h} x2={t.x+t.w/2} y2={t.y} stroke={stroke} strokeWidth="1.5" strokeDasharray={dash} markerEnd={`url(#${mId})`}/>;
                })}
                {/* Nœuds */}
                {nodes.map(n=>{
                  const p=layout[n.id];if(!p)return null;
                  const isSel=selected===n.id;
                  return(
                    <g key={n.id} onClick={()=>setSelected(isSel?null:n.id)} style={{cursor:"pointer"}}>
                      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="7" fill={isSel?n.color+"55":n.color+"22"} stroke={n.color} strokeWidth={isSel?2.5:1.5}/>
                      <text x={p.x+p.w/2} y={p.y+14} textAnchor="middle" fontSize="8" fontWeight="bold" fill={n.color}>{n.id}</text>
                      <text x={p.x+p.w/2} y={p.y+26} textAnchor="middle" fontSize="7.5" fill={"#E8EDF5"}>{n.label.slice(0,20)}</text>
                      {n.role&&<text x={p.x+p.w/2} y={p.y+38} textAnchor="middle" fontSize="6.5" fill={"#7A90B0"}>{n.role.slice(0,22)}</text>}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* DÉTAIL NŒUD SÉLECTIONNÉ */}
            {selNode&&(
              <div style={{background:`${selNode.color}15`,border:`1px solid ${selNode.color}44`,borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div>
                    <div style={{color:selNode.color,fontWeight:800,fontSize:13}}>{selNode.id} — {selNode.label}</div>
                    {selNode.role&&<div style={{color:T.textMuted,fontSize:10,marginTop:2}}>📌 {selNode.role}{selNode.responsable?` · ${selNode.responsable}`:""}</div>}
                  </div>
                  {orgigramEditMode&&(
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{setOrgigramNodeForm({...selNode});setShowOrgigramNodeForm(true);}} style={{background:`${selNode.color}22`,border:`1px solid ${selNode.color}44`,color:selNode.color,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✏️ Modifier</button>
                      <button onClick={async () => {if(await gcConfirm(`Supprimer "${selNode.label}" ?`)){saveOrgigramNodes(nodes.filter(n=>n.id!==selNode.id));saveOrgigramLinks(links.filter(l=>l.from!==selNode.id&&l.to!==selNode.id));setSelected(null);}}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️ Supprimer</button>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span style={{background:T.surface3,borderRadius:5,padding:"2px 8px",color:T.textMuted,fontSize:9}}>Type : <strong style={{color:selNode.color}}>{selNode.type}</strong></span>
                  <span style={{background:T.surface3,borderRadius:5,padding:"2px 8px",color:T.textMuted,fontSize:9}}>TPA associées : <strong style={{color:selNode.color}}>{tpaMissions.filter(m=>m.processus===selNode.id||m.processus?.includes(selNode.id)).length}</strong></span>
                  <span style={{background:T.surface3,borderRadius:5,padding:"2px 8px",color:T.textMuted,fontSize:9}}>Liens sortants : <strong style={{color:selNode.color}}>{links.filter(l=>l.from===selNode.id).length}</strong></span>
                  <span style={{background:T.surface3,borderRadius:5,padding:"2px 8px",color:T.textMuted,fontSize:9}}>Liens entrants : <strong style={{color:selNode.color}}>{links.filter(l=>l.to===selNode.id).length}</strong></span>
                </div>
                {orgigramEditMode&&links.filter(l=>l.from===selNode.id||l.to===selNode.id).length>0&&(
                  <div style={{marginTop:8}}>
                    <div style={{color:T.textDim,fontSize:9,fontWeight:700,marginBottom:4}}>LIAISONS</div>
                    {links.filter(l=>l.from===selNode.id||l.to===selNode.id).map((lk,i)=>{
                      const other=nodes.find(n=>n.id===(lk.from===selNode.id?lk.to:lk.from));
                      const dir=lk.from===selNode.id?"→":"←";
                      return(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:`1px solid ${T.border}22`}}>
                          <span style={{color:T.textMuted,fontSize:9}}>{dir} {other?.label||lk.to||lk.from}</span>
                          <span style={{background:T.surface3,borderRadius:3,padding:"1px 5px",color:T.textDim,fontSize:8}}>{lk.type}</span>
                          <button onClick={()=>saveOrgigramLinks(links.filter((_,idx)=>idx!==links.indexOf(lk)))} style={{background:"#EF444415",border:"none",color:"#EF4444",cursor:"pointer",fontSize:9,borderRadius:3,padding:"1px 5px",marginLeft:"auto"}}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* LÉGENDE */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",padding:"6px 0"}}>
              {Object.entries(TYPE_COLORS).map(([t,c])=><span key={t} style={{background:c+"15",border:`1px solid ${c}44`,borderRadius:5,padding:"2px 8px",color:c,fontSize:9,fontWeight:700}}>{t}</span>)}
              <span style={{color:T.textDim,fontSize:9,marginLeft:"auto"}}>{nodes.length} nœuds · {links.length} liens</span>
            </div>
          </div>
        );
      })()}

        {confirmDel && (
        <div style={{position:"fixed",inset:0,background:"#000C",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setConfirmDel(null)}>
          <div style={{background:"#0F1E35",border:"1px solid #EF444466",borderRadius:14,padding:24,width:360,boxShadow:"0 20px 60px #000A"}} onClick={e=>e.stopPropagation()}>
            <div style={{color:"#EF4444",fontWeight:800,fontSize:15,marginBottom:8}}>🗑️ Confirmer la suppression</div>
            <div style={{color:"#CBD5E1",fontSize:12,marginBottom:18}}>Supprimer <strong style={{color:"#fff"}}>"{confirmDel.label}"</strong> ? Cette action est irréversible.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{
                if(confirmDel.type==="tpa"){dsDeleteItemFromArray("gc-tpa",confirmDel.id);setTpaMissions(u=>u.filter(x=>x.id!==confirmDel.id));}
                else if(confirmDel.type==="prog"){dsDeleteItemFromArray("gc-audit-prog",confirmDel.id);setProgs(u=>u.filter(x=>x.id!==confirmDel.id));if(selProg?.id===confirmDel.id)setSelProg(null);}
                else if(confirmDel.type==="test"){const u=tests.filter(x=>x.id!==confirmDel.id);setTests(u);saveTests(u);}
                else if(confirmDel.type==="action"){const u=actions.filter(x=>x.id!==confirmDel.id);setActions(u);saveActions(u);}
                else if(confirmDel.type==="risk"){const u=riskMatrix.filter(x=>x.id!==confirmDel.id);setRiskMatrix(u);try{_lsSet("gc-risks",JSON.stringify(u));}catch(_){}}
                else if(confirmDel.type==="grille"){const u=gTaches.filter(x=>x.id!==confirmDel.id);saveG(u);}
                setConfirmDel(null);
              }} style={{flex:1,background:"#EF444422",border:"1px solid #EF444466",color:"#EF4444",borderRadius:7,padding:"8px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>Supprimer</button>
              <button onClick={()=>setConfirmDel(null)} style={{flex:1,background:"#1E3050",border:"1px solid #334155",color:"#94A3B8",borderRadius:7,padding:"8px 0",cursor:"pointer",fontSize:12}}>Annuler</button>
            </div>
          </div>
        </div>
        )}

      {/* ══ EDIT MODAL ═════════════════════════════════════════════════ */}
      {editModal && (()=>{
        const em = editModal;
        const close = () => setEditModal(null);
        const inp = (label,key,type="text",opts=null) => (
          <div style={{marginBottom:8}}>
            <label style={{color:"#94A3B8",fontSize:10,display:"block",marginBottom:2}}>{label}</label>
            {opts ? <select value={em.item[key]||""} onChange={e=>setEditModal({...em,item:{...em.item,[key]:e.target.value}})} style={{width:"100%",background:"#0A1628",border:"1px solid #1E3A5F",borderRadius:6,padding:"6px 8px",color:"#E2E8F0",fontSize:11}}>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
            : type==="textarea" ? <textarea value={em.item[key]||""} onChange={e=>setEditModal({...em,item:{...em.item,[key]:e.target.value}})} rows={3} style={{width:"100%",background:"#0A1628",border:"1px solid #1E3A5F",borderRadius:6,padding:"6px 8px",color:"#E2E8F0",fontSize:11,resize:"vertical"}}/>
            : <input type={type} value={em.item[key]||""} onChange={e=>setEditModal({...em,item:{...em.item,[key]:e.target.value}})} style={{width:"100%",background:"#0A1628",border:"1px solid #1E3A5F",borderRadius:6,padding:"6px 8px",color:"#E2E8F0",fontSize:11}}/>}
          </div>
        );
        const save = () => {
          if(em.type==="tpa"){const u=tpaMissions.map(x=>x.id===em.item.id?em.item:x);setTpaMissions(u);saveTpa(u);}
          else if(em.type==="prog"){const u=progs.map(x=>x.id===em.item.id?em.item:x);setProgs(u);saveProgs(u);if(selProg?.id===em.item.id)setSelProg(em.item);}
          else if(em.type==="test"){const u=tests.map(x=>x.id===em.item.id?em.item:x);setTests(u);saveTests(u);}
          else if(em.type==="action"){const u=actions.map(x=>x.id===em.item.id?em.item:x);setActions(u);saveActions(u);}
          close();
        };
        return (
          <div style={{position:"fixed",inset:0,background:"#000C",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={close}>
            <div style={{background:"#0F1E35",border:"1px solid #3B82F666",borderRadius:14,padding:24,width:"min(96vw,480px)",maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px #000A"}} onClick={e=>e.stopPropagation()}>
              <div style={{color:"#3B82F6",fontWeight:800,fontSize:14,marginBottom:14}}>
                ✏️ Modifier — {em.type==="tpa"?"Mission TPA":em.type==="prog"?"Programme":em.type==="test"?"Feuille de tests":"Plan d'action"}
              </div>
              {em.type==="tpa" && <>
                {inp("Mission *","mission")}
                {inp("Processus","processus")}
                {inp("Responsable","responsable")}
                {inp("Priorité","priorite","text",["CRITIQUE","HAUTE","NORMALE","FAIBLE"])}
                {inp("Périodicité","periodicite","text",["ANNUEL","SEMESTRIEL","TRIMESTRIEL","MENSUEL"])}
                {inp("Statut","statut","text",["PLANIFIE","EN_COURS","REALISE","REPORTE","ANNULE"])}
              </>}
              {em.type==="prog" && <>
                {inp("Mission *","mission")}
                {inp("Entité auditée","entite")}
                {inp("Période","periode")}
                {inp("Objectifs","objectifs","textarea")}
                {inp("Auditeur","auditeur")}
              </>}
              {em.type==="test" && <>
                {inp("Mission *","mission")}
                {inp("Objectif","objectif","textarea")}
                {inp("Type","type","text",["SUBSTANCE","PROCEDURE","ANALYTIQUE","OBSERVATION","CONFIRMATION"])}
                {inp("Taille échantillon","echantillon","number")}
                {inp("Anomalies détectées","anomalies","number")}
              </>}
              {em.type==="action" && <>
                {inp("Constat d'audit *","constat","textarea")}
                {inp("Cause identifiée","cause","textarea")}
                {inp("Recommandation","recommandation","textarea")}
                {inp("Responsable","responsable")}
                {inp("Échéance","echeance","date")}
                {inp("Priorité","priorite","text",["CRITIQUE","HAUTE","NORMALE","FAIBLE"])}
                {inp("Impact","impact","text",["FORT","MOYEN","FAIBLE"])}
                {inp("Statut","statut","text",["OUVERT","EN_COURS","CLOS"])}
              </>}
              <div style={{display:"flex",gap:8,marginTop:16}}>
                <button onClick={save} style={{flex:1,background:"#3B82F6",border:"none",color:"#fff",borderRadius:7,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>💾 Enregistrer</button>
                <button onClick={close} style={{flex:1,background:"#1E3050",border:"1px solid #334155",color:"#94A3B8",borderRadius:7,padding:"9px 0",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};


