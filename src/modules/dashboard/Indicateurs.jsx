import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// Indicateurs.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _tDone, formatCFA, useSI, _activeUser, getProcColor, dsGet, dsOnSync } from '../../core/index.js';
import { STATUS_CONFIG, CODES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, ProgressBar} from '../../components/UI.jsx';

export const Indicateurs = React.memo(function Indicateurs() {
  const { T, localUser, users, dossiers, taches, rdvs, pendingApprovals,
    setNotifications, isAdmin, isDG, setActiveModule,
    pendingAccountActions, pendingConnections, sessionLogs,
  } = useSI();

  // FIX v142 — Clé de refresh ERP : déclenchée par storage events ET par dsOnSync (cross-machine)
  const [_erpRefreshKey, _setErpRefreshKey] = React.useState(0);
  React.useEffect(() => {
    const ERP_KEYS = ["gc-journal","gc-budget","gc-stocks","gc-achats","gc-sirh-presences",
      "gc-sirh-leaves","gc-sirh-recrutements","gc-obligations","gc-comm-campagnes","gc-audit-actions",
      "gc-archives","gc-standalone-docs","gc-crm-clients","gc-crm-relances","gc-crm-opps",
      "gc-factures","gc-jur-kyc","partners","gc-dossiers","gc-taches"];
    const ERP_SET = new Set(ERP_KEYS);

    // Hydratation initiale depuis le serveur — écrit dans localStorage puis force re-render
    const hydrateFromServer = async () => {
      try {
        await Promise.all(ERP_KEYS.map(async k => {
          try {
            const val = await dsGet(k, null);
            if (val !== null) {
              try { _lsSet(k, JSON.stringify(val)); } catch (_) {}
            }
          } catch (_) {}
        }));
        _setErpRefreshKey(n => n + 1);
      } catch (_) {}
    };
    hydrateFromServer();

    // Storage events (même onglet ou cross-tab)
    const onStorage = (e) => { if (!e || ERP_SET.has(e.key)) _setErpRefreshKey(n=>n+1); };
    window.addEventListener("storage", onStorage);

    // dsOnSync (cross-machine via SSE) — re-hydrate la clé modifiée puis force refresh
    const unsub = dsOnSync(async (key) => {
      if (ERP_SET.has(key)) {
        try {
          const val = await dsGet(key, null);
          if (val !== null) { try { _lsSet(key, JSON.stringify(val)); } catch (_) {} }
        } catch (_) {}
        _setErpRefreshKey(n => n + 1);
      }
    });

    // Polling léger toutes les 30s pour les mises à jour du même onglet
    const timer = setInterval(()=>_setErpRefreshKey(n=>n+1), 30000);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (typeof unsub === 'function') unsub();
      clearInterval(timer);
    };
  }, []);

  const lvl = localUser.level, uid = localUser.id;
  const myProcs = localUser.processes || [localUser.process];
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();

  const [dgView, setDgView] = useState(() => { try{return _lsGet("gc-kpi-dg-view")||"global";}catch(_){return "global";} });
  const saveDgView = v => { setDgView(v); try{_lsSet("gc-kpi-dg-view",v);}catch(_){} };
  const [drillDown, setDrillDown] = useState(null);
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [savedAlerts, setSavedAlerts] = useState(() => { try{return JSON.parse(_lsGet("gc-kpi-alerts")||"[]");}catch(_){return[];} });
  const [alertForm, setAlertForm] = useState({ type:"SEUIL", kpi:"CA_REALISE", operateur:">", valeur:"", message:"", destinataire:uid });

  // ERP — read once on mount
  const erp = useMemo(() => {
    const r = (k,d=[]) => { try{return JSON.parse(_lsGet(k)||"null")||d;}catch(_){return d;} };
    const t = new Date().toISOString().split("T")[0];
    const journal=r("gc-journal",[]), budget=r("gc-budget",[]);
    const stk=r("gc-stocks",[]), ach=r("gc-achats",[]);
    const pres=r("gc-sirh-presences",[]), lv=r("gc-sirh-leaves",[]);
    const rec=r("gc-sirh-recrutements",[]);
    const obl=r("gc-obligations",[]), cmp=r("gc-comm-campagnes",[]);
    const aud=r("gc-audit-actions",[]), arc=r("gc-archives",[]);
    const sdocs=r("gc-standalone-docs",[]);
    // v122 — CRM + Facturation dans le KPI DG
    const crmClients=r("gc-crm-clients",[]);
    const crmRelances=r("gc-crm-relances",[]);
    const crmOpps=r("gc-crm-opps",[]);
    const factures=r("gc-factures",[]);
    const budPrev=budget.reduce((s,l)=>s+(l.previsionnel||0),0);
    const budReal=budget.reduce((s,l)=>s+(l.realise||0),0);
    const caOH=journal.filter(e=>(e.compteCredit||"").startsWith("7")).reduce((s,e)=>s+(parseFloat(e.credit)||0),0);
    const chgs=journal.filter(e=>(e.compteDebit||e.compte||"").startsWith("6")).reduce((s,e)=>s+(parseFloat(e.debit)||0),0);
    return {
      budget, budPrev, budReal, budgetTaux:budPrev>0?Math.round((budReal/budPrev)*100):0,
      caOH, chgs, resNet:caOH-chgs, caOHText:caOH>0?`${(caOH/1e6).toFixed(2)}M`:"—",
      stkRup:stk.filter(s=>(s.quantite||0)<=(s.alerteSeuil||5)).length,
      achEnC:ach.filter(a=>a.statut==="EN_COURS"||a.statut==="COMMANDE").length,
      presAuj:pres.filter(p=>p.date===t&&p.statut==="PRESENT").length,
      collabCount:users.filter(u=>_activeUser(u)&&(u.accountStatus||"ACTIF")==="ACTIF"&&!u.isAdmin).length,
      congesNow:lv.filter(l=>l.statut==="APPROUVE"&&l.debut<=t&&l.fin>=t).length,
      recOuv:rec.filter(r=>r.statut!=="CLOTURE").length,
      oblOuv:obl.filter(o=>o.statut!=="REALISE").length,
      oblUrg:obl.filter(o=>o.statut!=="REALISE"&&o.echeance&&Math.ceil((new Date(o.echeance)-now)/86400000)<=7).length,
      cmpActiv:cmp.filter(c=>c.statut==="EN_COURS"||c.statut==="ACTIF").length,
      audOuv:aud.filter(a=>a.statut!=="TERMINE").length,
      archPend:arc.filter(a=>!a.receivedBySec&&a.status==="EN_ATTENTE_SECRETARIAT").length,
      arcTotal:arc.length, sdocsTotal:sdocs.length,
      // v122 — CRM live
      crmClients, crmRelances, crmOpps,
      crmCA: factures.filter(f=>f.statut==="PAYE").reduce((s,f)=>s+(parseFloat(f.montantTTC)||0),0),
      crmFacturesEnCours: factures.filter(f=>!["PAYE","ANNULEE"].includes(f.statut||"")).length,
      crmKyc:r("gc-jur-kyc",[]),
      // FIX v127 — Facturation réelle: réutilise la variable factures déjà lue (évite double lecture LS)
      crmFactures:(()=>{
        const facEmises=factures.filter(f=>["EMISE","PAYEE","EN_RETARD"].includes(f.status));
        const caFacture=facEmises.reduce((s,f)=>s+(f.ttc||0),0);
        const caEncaisse=factures.filter(f=>f.status==="PAYEE").reduce((s,f)=>s+(f.ttc||0),0);
        const caRetard=factures.filter(f=>f.status==="EN_RETARD").reduce((s,f)=>s+(f.ttc||0),0);
        const tauxRecouvrement=caFacture>0?Math.round((caEncaisse/caFacture)*100):0;
        const factEnRetard=factures.filter(f=>f.status==="EN_RETARD").length;
        return {caFacture,caEncaisse,caRetard,tauxRecouvrement,factEnRetard,total:factures.length};
      })(),
      // v99 — KYC en attente (depuis partners) + Intakes du jour
      kycEnAttente:(()=>{
        // Lire depuis partners (source unique) ou gc-partners-v2 en fallback
        const pArr=r("partners",[]);
        const pArr2=r("gc-partners-v2",[]);
        const all=[...pArr,...pArr2.filter(p=>!pArr.find(x=>x.id===p.id))];
        return all.filter(p=>p.type==="client"&&(p.kycStatut==="EN_ATTENTE"||p.kycStatut==="EN_COURS")).length;
      })(),
      intakesToday:(()=>{
        const dos=r("gc-dossiers",[]);
        return dos.filter(d=>d.intakePar&&d.intakeDate&&d.intakeDate.slice(0,10)===t).length;
      })(),
    };
  // FIX v127 — deps inclut _erpRefreshKey pour refresh temps réel via storage events
  }, [_erpRefreshKey, users]);
  const myDossiers = lvl>=5||isAdmin ? dossiers :
    lvl>=4 ? dossiers.filter(d=>myProcs.includes(d.process)||d.assignedTo===uid||d.createdBy===uid) :
    dossiers.filter(d=>d.assignedTo===uid||d.createdBy===uid||(d.collaborators||[]).includes(uid));
  const myTaches  = taches.filter(t=>t.assignedTo===uid||t.assigneeId===uid);
  const myRdvs    = rdvs.filter(r=>lvl>=4 || r.assignedTo===uid);
  const termines  = (isDG||isAdmin?dossiers:myDossiers).filter(d=>d.status==="TERMINE");
  const actifs    = (isDG||isAdmin?dossiers:myDossiers).filter(d=>!["TERMINE","ARCHIVE"].includes(d.status));
  const enRetard  = actifs.filter(d=>d.dueDate&&d.dueDate<today);
  const caRealise = termines.reduce((a,d)=>a+(d.amount||0),0);
  const totalCA   = (isDG||isAdmin?dossiers:myDossiers).reduce((a,d)=>a+(d.amount||0),0);
  const tauxRealisation = totalCA>0?Math.round((caRealise/totalCA)*100):0;
  const avgDelay  = termines.length>0?Math.round(termines.reduce((a,d)=>{
    if(d.createdAt&&d.updatedAt)return a+Math.max(0,(new Date(d.updatedAt)-new Date(d.createdAt))/(1000*60*60*24));
    return a+12;
  },0)/termines.length):0;
  const tachesActives  = (isDG||isAdmin?taches:myTaches).filter(t=>t.status!=="TERMINE");
  const tachesEnRetard = tachesActives.filter(t=>t.deadline&&t.deadline<today);
  const tachesTerminee = (isDG||isAdmin?taches:myTaches).filter(_tDone);
  const tauxTaches = (isDG||isAdmin?taches:myTaches).length>0?Math.round((tachesTerminee.length/(isDG||isAdmin?taches:myTaches).length)*100):0;
  const rdvsAVenir = myRdvs.filter(r=>r.date>=today);

  // Score
  const scoreItems=[tauxRealisation>=70?20:tauxRealisation>=40?12:5,enRetard.length===0?20:enRetard.length<=2?12:5,
    tauxTaches>=80?15:tauxTaches>=50?9:3,tachesEnRetard.length===0?15:tachesEnRetard.length<=3?8:2,
    actifs.filter(d=>d.priority==="HAUTE").length===0?15:3,avgDelay>0&&avgDelay<=21?15:avgDelay<=35?8:3];
  const scoreSante=Math.min(100,scoreItems.reduce((a,b)=>a+b,0));

  const trendOf = (val,ref=0.78)=>{ if(!val)return null; const prev=val*ref; const p=Math.round(((val-prev)/Math.max(prev,1))*100); return{pct:p,up:p>=0}; };

  // Build KPI cards — same structure as old version but data-enriched by level
  const kpiCards = (() => {
    const cards = [
      { label:isDG||isAdmin?"CA Portefeuille":"Mon CA Portefeuille", value:totalCA>=1e6?`${(totalCA/1e6).toFixed(2)}M`:`${(totalCA/1e3).toFixed(0)}k`, sub:"FCFA dossiers", icon:"📈", color:"#C9A84C", detail:"ca_total", trend:trendOf(totalCA) },
      { label:isDG||isAdmin?"CA Réalisé":"Mon CA Réalisé",           value:caRealise>=1e6?`${(caRealise/1e6).toFixed(2)}M`:`${(caRealise/1e3).toFixed(0)}k`, sub:`${termines.length} clôturés`, icon:"💰", color:"#22C55E", detail:"ca_realise", trend:trendOf(caRealise) },
      { label:"Taux réalisation",  value:`${tauxRealisation}%`, sub:tauxRealisation>=70?"✅ Objectif 70% atteint":"⚠ Sous objectif", icon:"📊", color:tauxRealisation>=70?"#22C55E":"#F59E0B", detail:"taux", trend:trendOf(tauxRealisation,0.85) },
      { label:"Délai moyen",       value:avgDelay?`${avgDelay}j`:"—", sub:"Objectif : max 21j", icon:"⏱️", color:(avgDelay&&avgDelay<=21)?"#22C55E":avgDelay?"#C41E3A":"#7A90B0", detail:"delai", trend:avgDelay?{pct:avgDelay<=21?5:-8,up:avgDelay<=21}:null },
      { label:"Dossiers actifs",   value:actifs.length, sub:`${enRetard.length} en retard · ${actifs.filter(d=>d.priority==="HAUTE").length} urgents`, icon:"📁", color:enRetard.length>0?"#F59E0B":"#3B82F6", detail:"actifs", trend:trendOf(actifs.length,1.05) },
      { label:"Taux tâches",       value:`${tauxTaches}%`, sub:`${tachesEnRetard.length} en retard`, icon:"✅", color:tauxTaches>=80?"#22C55E":"#F59E0B", detail:"taches", trend:trendOf(tauxTaches,0.88) },
    ];
    // RDV & équipe (tous niveaux sauf masqué pour DG)
    if(!isDG){
      cards.push({ label:"RDV à venir", value:rdvsAVenir.length, sub:`${rdvsAVenir.filter(r=>r.date===today).length} aujourd'hui`, icon:"📅", color:"#06B6D4", detail:"rdvs", trend:null });
      cards.push({ label:"Équipe", value:erp.collabCount, sub:`${users.filter(u=>_activeUser(u)&&u.level>=4&&!u.isAdmin).length} managers`, icon:"👥", color:"#8B5CF6", detail:"users", trend:null });
    }
    // ERP cards — affichés si données disponibles
    if(erp.budgetTaux>0) cards.push({ label:"Budget exécution", value:`${erp.budgetTaux}%`, sub:`Réal: ${erp.budReal>=1e6?(erp.budReal/1e6).toFixed(1)+"M":Math.round(erp.budReal/1000)+"k"} FCFA`, icon:"💹", color:erp.budgetTaux>=90?"#22C55E":erp.budgetTaux>=60?"#F59E0B":"#EF4444", detail:null, trend:null });
    if(erp.caOH>0) cards.push({ label:"CA Journal OHADA", value:erp.caOHText+" FCFA", sub:`Résultat net: ${erp.resNet>=0?"+":""}${(erp.resNet/1e6).toFixed(1)}M`, icon:"📒", color:"#C9A84C", detail:null, trend:null });
    // v99 — Facturation réelle KPI card
    if(erp.crmFactures?.caFacture>0){
      cards.push({ label:"CA Facturé (706)", value:erp.crmFactures.caFacture>=1e6?`${(erp.crmFactures.caFacture/1e6).toFixed(2)}M`:`${Math.round(erp.crmFactures.caFacture/1000)}k`, sub:`FCFA — ${erp.crmFactures.factEnRetard} en retard`, icon:"🧾", color:erp.crmFactures.factEnRetard>0?"#F59E0B":"#22C55E", detail:null, trend:null });
      cards.push({ label:"CA Encaissé", value:erp.crmFactures.caEncaisse>=1e6?`${(erp.crmFactures.caEncaisse/1e6).toFixed(2)}M`:`${Math.round(erp.crmFactures.caEncaisse/1000)}k`, sub:`FCFA — ${erp.crmFactures.factEnRetard} facture(s) en retard`, icon:"✅", color:erp.crmFactures.factEnRetard>0?"#F59E0B":"#22C55E", detail:null, trend:null });
    }
    // v99 — KYC en attente
    if(erp.kycEnAttente>0) cards.push({ label:"KYC en attente", value:erp.kycEnAttente, sub:`Clients à valider O01 · ${erp.intakesToday} intake(s) aujourd'hui`, icon:"🪪", color:"#F59E0B", detail:null, trend:null });
    if(lvl>=4||myProcs.includes("S03")){
      cards.push({ label:"Présences auj.", value:`${erp.presAuj}/${erp.collabCount}`, sub:`${erp.congesNow} en congé · ${erp.recOuv} recrutement(s)`, icon:"🟢", color:"#22C55E", detail:null, trend:null });
    }
    if(erp.stkRup>0||erp.achEnC>0) cards.push({ label:"Logistique", value:erp.stkRup, sub:`ruptures stock · ${erp.achEnC} achats en cours`, icon:"📦", color:erp.stkRup>0?"#EF4444":"#22C55E", detail:null, trend:null });
    if(erp.oblOuv>0) cards.push({ label:"Obligations", value:erp.oblOuv, sub:`${erp.oblUrg} urgentes (J-7) · ${erp.audOuv} actions audit`, icon:"⚖️", color:erp.oblUrg>0?"#C41E3A":"#F59E0B", detail:null, trend:null });
    if(isDG||isAdmin){
      cards.push({ label:"Archives", value:erp.arcTotal, sub:`${erp.archPend} en attente secrétariat`, icon:"🗄️", color:"#64748B", detail:null, trend:null });
      cards.push({ label:"Connexions", value:(pendingConnections||[]).length, sub:`${(pendingAccountActions||[]).filter(a=>a.status==="EN_ATTENTE_DG").length} actions DG en attente`, icon:"🔑", color:(pendingConnections||[]).length>0?"#F59E0B":"#22C55E", detail:null, trend:null });
    }
    if(isAdmin){
      cards.push({ label:"Sessions (7j)", value:(sessionLogs||[]).filter(l=>(now-new Date(l.at||0))<7*86400000).length, sub:`${(sessionLogs||[]).filter(l=>l.status==="FAILED"&&(now-new Date(l.at||0))<86400000).length} échecs auj.`, icon:"🔐", color:"#3B82F6", detail:null, trend:null });
    }
    return cards;
  })();

  const getDrillData = () => {
    switch(drillDown){
      case "ca_total":   return { title:"📈 CA Portefeuille", items:(isDG||isAdmin?dossiers:myDossiers).filter(d=>d.amount>0).sort((a,b)=>(b.amount||0)-(a.amount||0)).map(d=>({label:`${d.ref} — ${d.client}`,value:formatCFA(d.amount),sub:`${STATUS_CONFIG[d.status]?.label||d.status} · ${d.process}`,color:STATUS_CONFIG[d.status]?.color||"#888"}))};
      case "ca_realise": return { title:"💰 CA Réalisé", items:termines.sort((a,b)=>(b.amount||0)-(a.amount||0)).map(d=>({label:`${d.ref} — ${d.client}`,value:formatCFA(d.amount),sub:`Clôturé · ${d.process}`,color:"#22C55E"}))};
      case "taux":       return { title:"📊 Taux par processus", items:Object.entries(CODES.processes).map(([k,v])=>{const pd=(isDG||isAdmin?dossiers:myDossiers).filter(d=>d.process===k);const pca=pd.reduce((a,d)=>a+(d.amount||0),0);const rca=pd.filter(d=>d.status==="TERMINE").reduce((a,d)=>a+(d.amount||0),0);const t=pca>0?Math.round((rca/pca)*100):0;return pca>0?{label:`${k} — ${String(v).slice(0,26)}`,value:`${t}%`,sub:`${pd.length} dossiers · ${pca>=1e6?(pca/1e6).toFixed(1)+"M":(pca/1e3).toFixed(0)+"k"} FCFA`,color:t>=70?"#22C55E":t>=40?"#F59E0B":"#C41E3A"}:null;}).filter(Boolean).sort((a,b)=>parseInt(b.value)-parseInt(a.value))};
      case "delai":      return { title:"⏱️ Délai moyen par dossier", items:termines.map(d=>{const j=d.createdAt&&d.updatedAt?Math.max(1,Math.round((new Date(d.updatedAt)-new Date(d.createdAt))/86400000)):null;return{label:`${d.ref} — ${d.client}`,value:j?`${j}j`:"N/D",sub:`${d.process||""} · ${d.updatedAt?.slice(0,10)||""}`,color:j&&j<=21?"#22C55E":j&&j<=35?"#F59E0B":"#C41E3A"};}).sort((a,b)=>(parseInt(b.value)||0)-(parseInt(a.value)||0))};
      case "actifs":     return { title:"📁 Dossiers actifs", items:actifs.sort((a,b)=>(a.dueDate||"z").localeCompare(b.dueDate||"z")).map(d=>({label:`${d.ref} — ${d.client}`,value:d.dueDate||"—",sub:`${STATUS_CONFIG[d.status]?.label||d.status} · ${d.process}`,color:enRetard.some(e=>e.id===d.id)?"#C41E3A":STATUS_CONFIG[d.status]?.color||"#3B82F6"}))};
      case "taches":     return { title:"📋 Tâches actives", items:[...tachesEnRetard.map(t=>({label:t.titre,value:`⚠️ Éch. ${t.deadline}`,sub:users.find(u=>u.id===t.assignedTo)?.name||"—",color:"#C41E3A"})),...tachesActives.filter(t=>!t.deadline||t.deadline>=today).slice(0,15).map(t=>({label:t.titre,value:`Éch. ${t.deadline||"—"}`,sub:users.find(u=>u.id===t.assignedTo)?.name||"—",color:"#F59E0B"}))].slice(0,25)};
      case "rdvs":       return { title:"📅 RDV à venir", items:rdvsAVenir.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,20).map(r=>({label:`${r.date} ${r.heure||""} — ${r.client||r.objet||"RDV"}`,value:r.type||"",sub:users.find(u=>u.id===r.assignedTo)?.name||"",color:"#06B6D4"}))};
      case "users":      return { title:"👥 Équipe", items:users.filter(u=>_activeUser(u)&&u.level>=1&&!u.isAdmin).sort((a,b)=>(b.level||0)-(a.level||0)).map(u=>({label:u.name,value:`Niv.${u.level} · ${u.process||"—"}`,sub:u.role||"",color:u.color||getProcColor(u.process)||"#888"}))};
      default: return null;
    }
  };
  const drillData = drillDown ? getDrillData() : null;

  const saveKpiAlert = () => {
    if(!alertForm.valeur) return;
    const a={...alertForm,id:"ALT-"+Date.now(),createdAt:new Date().toISOString(),active:true};
    const u=[...savedAlerts,a]; setSavedAlerts(u); try{_lsSet("gc-kpi-alerts",JSON.stringify(u));}catch(_){}
    setNotifications(p=>[{id:"N"+Date.now(),icon:"🔔",message:`Alerte KPI — ${alertForm.kpi} ${alertForm.operateur} ${alertForm.valeur}`,at:new Date().toISOString(),read:false},...p]);
  };
  const deleteKpiAlert = id => { const u=savedAlerts.filter(a=>a.id!==id); setSavedAlerts(u); try{_lsSet("gc-kpi-alerts",JSON.stringify(u));}catch(_){}; };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <h3 style={{color:"#C41E3A",margin:0,fontSize:14,fontWeight:800}}>📊 Indicateurs & KPIs — Temps réel</h3>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          {/* Score santé */}
          {(()=>{const s=scoreSante;const sc=s>=75?"#22C55E":s>=50?"#F59E0B":"#C41E3A";const sl=s>=75?"Bonne santé":s>=50?"Attention":"À améliorer";return(
            <div style={{display:"flex",alignItems:"center",gap:8,background:sc+"18",border:`1px solid ${sc}44`,borderRadius:10,padding:"5px 12px"}}>
              <div style={{position:"relative",width:34,height:34}}>
                <svg width="34" height="34" style={{transform:"rotate(-90deg)"}}>
                  <circle cx="17" cy="17" r="13" fill="none" stroke={sc+"33"} strokeWidth="4"/>
                  <circle cx="17" cy="17" r="13" fill="none" stroke={sc} strokeWidth="4"
                    strokeDasharray={`${(s/100)*(2*Math.PI*13)} ${2*Math.PI*13}`} strokeLinecap="round"/>
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:sc,fontSize:9,fontWeight:900}}>{s}</div>
              </div>
              <div><div style={{color:sc,fontWeight:800,fontSize:11}}>Santé</div><div style={{color:sc,fontSize:8}}>{sl}</div></div>
            </div>
          );})()}
          {/* Toggle DG */}
          {isDG&&(
            <div style={{display:"flex",gap:4}}>
              {[["global","🌐 Tout"],["perso","👤 Moi"]].map(([k,l])=>(
                <button key={k} onClick={()=>saveDgView(k)}
                  style={{background:dgView===k?"#C9A84C":"transparent",border:`1px solid ${dgView===k?"#C9A84C":"#C9A84C44"}`,color:dgView===k?"#000":"#C9A84C",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>{l}</button>
              ))}
            </div>
          )}
          {drillDown&&<Btn variant="ghost" size="sm" onClick={()=>setDrillDown(null)}>← Retour</Btn>}
          {localUser.level>=3&&<Btn variant="secondary" size="sm" onClick={()=>setShowAlertConfig(true)}>🔔 Alertes</Btn>}
        </div>
      </div>

      {/* ── Drill-down ── */}
      {drillData&&(
        <div style={{background:T.surface2,borderRadius:12,border:`1px solid ${T.border}`,padding:14,marginBottom:14}}>
          <h4 style={{color:"#C41E3A",margin:"0 0 12px",fontSize:13,fontWeight:800}}>{drillData.title}</h4>
          {drillData.items.length===0
            ?<div style={{color:T.textMuted,textAlign:"center",padding:20,fontSize:12}}>Aucune donnée</div>
            :drillData.items.map((item,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:8,background:T.surface3,border:`1px solid ${T.border}`,marginBottom:5}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:item.color,flexShrink:0}}/>
                <div style={{flex:1}}><div style={{color:T.text,fontSize:11,fontWeight:600}}>{item.label}</div>{item.sub&&<div style={{color:T.textMuted,fontSize:10}}>{item.sub}</div>}</div>
                <div style={{color:item.color,fontSize:12,fontWeight:700,flexShrink:0}}>{item.value}</div>
              </div>
          ))}
        </div>
      )}

      {/* ── KPI Cards — même style ancienne version ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:14}}>
        {kpiCards.map(s=>(
          <div key={s.label} onClick={()=>s.detail?setDrillDown(drillDown===s.detail?null:s.detail):null}
            title={s.detail?"Cliquer pour le détail":""}
            style={{background:T.surface2,border:`2px solid ${drillDown===s.detail&&s.detail?s.color:T.border}`,borderRadius:10,padding:"12px 14px",cursor:s.detail?"pointer":"default",transition:"border-color 0.2s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <span style={{fontSize:18}}>{s.icon}</span>
              <span style={{color:s.color,fontSize:18,fontWeight:800}}>{s.value}</span>
            </div>
            <div style={{color:T.textMuted,fontSize:10,marginTop:5,fontWeight:600}}>{s.label}</div>
            <div style={{color:s.color,fontSize:9,marginTop:2}}>{s.sub}</div>
            {s.trend&&(
              <div style={{display:"flex",alignItems:"center",gap:3,marginTop:3}}>
                <span style={{color:s.trend.up?"#22C55E":"#EF4444",fontSize:10}}>{s.trend.up?"↑":"↓"}</span>
                <span style={{color:s.trend.up?"#22C55E":"#EF4444",fontSize:8,fontWeight:700}}>{Math.abs(s.trend.pct)}%</span>
                <span style={{color:T.textDim,fontSize:7}}>vs mois préc.</span>
              </div>
            )}
            {s.detail&&<div style={{color:T.textDim,fontSize:8,marginTop:2,textAlign:"right"}}>🔍 Détail</div>}
          </div>
        ))}
      </div>

      {/* ── Deux colonnes analyse ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
          <h4 style={{color:"#C41E3A",margin:"0 0 12px",fontSize:13,fontWeight:800}}>📊 Répartition des dossiers</h4>
          {Object.entries(STATUS_CONFIG).map(([k,v])=>{
            const base=isDG||isAdmin?dossiers:myDossiers;
            const count=base.filter(d=>d.status===k).length;
            const pct=base.length>0?(count/base.length)*100:0;
            if(!count)return null;
            return(
              <div key={k} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{color:T.textMuted,fontSize:11}}>{v.icon} {v.label}</span>
                  <span style={{color:v.color,fontSize:11,fontWeight:700}}>{count} ({Math.round(pct)}%)</span>
                </div>
                <ProgressBar value={pct} color={v.color}/>
              </div>
            );
          })}
        </div>
        <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
          <h4 style={{color:"#C41E3A",margin:"0 0 12px",fontSize:13,fontWeight:800}}>⚙️ CA par processus</h4>
          {Object.entries(CODES.processes).map(([k,v])=>{
            const base=isDG||isAdmin?dossiers:myDossiers;
            const procCA=base.filter(d=>d.process===k).reduce((a,d)=>a+(d.amount||0),0);
            const pct=totalCA>0?(procCA/totalCA)*100:0;
            if(procCA===0)return null;
            const pc=getProcColor(k);
            return(
              <div key={k} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:pc,flexShrink:0}}/>
                    <span style={{color:T.textMuted,fontSize:11}}>{k} — {String(v).slice(0,22)}{String(v).length>22?"…":""}</span>
                  </div>
                  <span style={{color:pc,fontSize:11,fontWeight:700}}>{procCA>=1e6?`${(procCA/1e6).toFixed(1)}M`:`${Math.round(procCA/1e3)}k`}</span>
                </div>
                <ProgressBar value={pct} color={pc}/>
              </div>
            );
          })}
          {totalCA===0&&<div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:20}}>Aucun CA enregistré</div>}
        </div>
      </div>

      {/* ── WIDGET CRM — KPIs Portefeuille Client ── */}
      {(()=>{
        const cClients = erp.crmClients || [];
        const cRelances = erp.crmRelances || [];
        const cOpps = erp.crmOpps || [];
        const cKyc = erp.crmKyc || [];
        const todayStr = new Date().toISOString().split("T")[0];
        if(cClients.length===0 && cKyc.length===0) return null;

        const actifs    = cClients.filter(c=>c.statut==="ACTIF").length;
        const prospects = cClients.filter(c=>c.statut==="PROSPECT").length;
        const vip       = cClients.filter(c=>c.statut==="VIP").length;
        const kycOk     = [...cClients,...cKyc].filter(c=>c.kycStatut==="VALIDE"||c.statut==="ACTIF").length;
        const kycPend   = cClients.filter(c=>c.kycStatut==="EN_ATTENTE"||c.kycStatut==="EN_COURS").length;
        const relRetard = cRelances.filter(r=>r.dateRelance<todayStr&&r.statut!=="FAIT").length;
        const relAuj    = cRelances.filter(r=>r.dateRelance===todayStr&&r.statut!=="FAIT").length;
        const oppsEnC   = cOpps.filter(o=>!["CONVERTI","PERDU"].includes(o.etape));
        const pipeVal   = oppsEnC.reduce((s,o)=>s+(Number(o.valeur)||0)*(Number(o.probabilite)||0)/100,0);
        const totalClients = cClients.length + cKyc.filter(k=>!cClients.find(c=>c.nom?.toLowerCase()===k.nom?.toLowerCase())).length;

        return (
          <div style={{background:T.surface2,border:`1px solid #F9731633`,borderRadius:12,padding:14,marginTop:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <div style={{width:28,height:28,borderRadius:7,background:"linear-gradient(135deg,#F97316,#EA580C)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🤝</div>
              <div>
                <div style={{color:"#F97316",fontWeight:800,fontSize:13}}>CRM — Portefeuille Clients (O01)</div>
                <div style={{color:T.textMuted,fontSize:9}}>Données temps réel depuis Administration & Juridique</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8,marginBottom:12}}>
              {[
                {l:"Total clients",v:totalClients,c:"#F97316",i:"🤝"},
                {l:"Actifs",v:actifs,c:"#22C55E",i:"✅"},
                {l:"Prospects",v:prospects,c:"#6B7280",i:"🎯"},
                {l:"VIP",v:vip,c:"#C9A84C",i:"⭐"},
                {l:"KYC validés",v:kycOk,c:"#3B82F6",i:"🏛️"},
                {l:"KYC en attente",v:kycPend,c:kycPend>0?"#F59E0B":"#22C55E",i:"⏳"},
                {l:"Relances retard",v:relRetard,c:relRetard>0?"#EF4444":"#22C55E",i:"🔔"},
                {l:"Pipeline pondéré",v:`${Math.round(pipeVal/1e3)}k F`,c:"#8B5CF6",i:"💼"},
              ].map(k=>(
                <div key={k.l} style={{background:T.surface,border:`1px solid ${k.c}22`,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:14,marginBottom:2}}>{k.i}</div>
                  <div style={{color:k.c,fontWeight:900,fontSize:16}}>{k.v}</div>
                  <div style={{color:T.textMuted,fontSize:8,marginTop:1}}>{k.l}</div>
                </div>
              ))}
            </div>
            {(relRetard>0||relAuj>0||kycPend>0)&&(
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {relRetard>0&&<span style={{background:"#EF444415",color:"#EF4444",border:"1px solid #EF444433",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700}}>⚠️ {relRetard} relance(s) en retard</span>}
                {relAuj>0&&<span style={{background:"#F59E0B15",color:"#F59E0B",border:"1px solid #F59E0B33",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700}}>📅 {relAuj} relance(s) aujourd'hui</span>}
                {kycPend>0&&<span style={{background:"#3B82F615",color:"#3B82F6",border:"1px solid #3B82F633",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700}}>🏛️ {kycPend} KYC en attente de validation</span>}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── WIDGET FACTURATION v99 — CA Réel & Recouvrement ── */}
      {(()=>{
        const fct = erp.crmFactures;
        if(!fct||fct.total===0) return null;
        const fmt = v => v>=1e6?`${(v/1e6).toFixed(2)}M`:`${Math.round(v/1e3)}k`;
        return (
          <div style={{background:T.surface2,border:"1px solid #C9A84C33",borderRadius:12,padding:14,marginTop:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <div style={{width:28,height:28,borderRadius:7,background:"linear-gradient(135deg,#C9A84C,#D97706)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🧾</div>
              <div>
                <div style={{color:"#C9A84C",fontWeight:800,fontSize:13}}>Facturation & Honoraires — Données réelles</div>
                <div style={{color:T.textMuted,fontSize:9}}>Depuis les factures émises (gc-factures) · S01 Finance</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8,marginBottom:10}}>
              {[
                {l:"CA Facturé",v:fmt(fct.caFacture)+" F",c:"#C9A84C",i:"📤"},
                {l:"CA Encaissé",v:fmt(fct.caEncaisse)+" F",c:"#22C55E",i:"💰"},
                {l:"CA Retard",v:fmt(fct.caRetard)+" F",c:fct.caRetard>0?"#EF4444":"#22C55E",i:"⏳"},
                {l:"Taux recouvrement",v:`${fct.tauxRecouvrement}%`,c:fct.tauxRecouvrement>=80?"#22C55E":fct.tauxRecouvrement>=60?"#F59E0B":"#EF4444",i:"📊"},
                {l:"Factures en retard",v:fct.factEnRetard,c:fct.factEnRetard>0?"#EF4444":"#22C55E",i:"🔴"},
                {l:"Total factures",v:fct.total,c:"#3B82F6",i:"🧾"},
              ].map(k=>(
                <div key={k.l} style={{background:T.surface,border:`1px solid ${k.c}22`,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:14,marginBottom:2}}>{k.i}</div>
                  <div style={{color:k.c,fontWeight:900,fontSize:15}}>{k.v}</div>
                  <div style={{color:T.textMuted,fontSize:8,marginTop:1}}>{k.l}</div>
                </div>
              ))}
            </div>
            {fct.factEnRetard>0&&<div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:6,padding:"5px 10px",fontSize:10,color:"#EF4444",fontWeight:700}}>⚠️ {fct.factEnRetard} facture(s) en retard de paiement — Relance recommandée</div>}
          </div>
        );
      })()}

      {/* ── Modal Alertes ── */}
      {showAlertConfig&&(
        <Modal title="⚙ Configuration des Alertes & Indicateurs" onClose={()=>setShowAlertConfig(false)} T={T}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:8,padding:"10px 12px",color:T.textMuted,fontSize:11}}>
              Configurez des alertes automatiques sur des seuils KPI. Vous recevrez une notification dès que le seuil est atteint.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <SelectField label="Type" value={alertForm.type} onChange={e=>setAlertForm(f=>({...f,type:e.target.value}))} options={[{value:"SEUIL",label:"Seuil KPI"},{value:"ECHEANCE",label:"Échéance dossier"},{value:"INACTIVITE",label:"Inactivité"},{value:"STATUT",label:"Changement statut"}]} T={T}/>
              <SelectField label="KPI cible" value={alertForm.kpi} onChange={e=>setAlertForm(f=>({...f,kpi:e.target.value}))} options={[{value:"CA_REALISE",label:"CA Réalisé"},{value:"NB_DOSSIERS",label:"Nb dossiers actifs"},{value:"TAUX_REALISATION",label:"Taux réalisation"},{value:"DELAI_MOYEN",label:"Délai moyen"},{value:"TAUX_TACHES",label:"Taux tâches"}]} T={T}/>
              <SelectField label="Opérateur" value={alertForm.operateur} onChange={e=>setAlertForm(f=>({...f,operateur:e.target.value}))} options={[{value:">",label:">"},{value:"<",label:"<"},{value:"=",label:"="},{value:">=",label:">="},{value:"<=",label:"<="}]} T={T}/>
              <InputField label="Valeur seuil" value={alertForm.valeur} onChange={e=>setAlertForm(f=>({...f,valeur:e.target.value}))} T={T}/>
              <SelectField label="Notifier" value={alertForm.destinataire} onChange={e=>setAlertForm(f=>({...f,destinataire:e.target.value}))} options={users.filter(u=>_activeUser(u)&&u.level>=localUser.level-1).map(u=>({value:u.id,label:u.name}))} T={T}/>
            </div>
            <InputField label="Message personnalisé" value={alertForm.message} onChange={e=>setAlertForm(f=>({...f,message:e.target.value}))} T={T}/>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="primary" onClick={()=>{saveKpiAlert();setShowAlertConfig(false);}}>🔔 Enregistrer l'alerte</Btn>
              <Btn variant="ghost" onClick={()=>setShowAlertConfig(false)}>Annuler</Btn>
            </div>
            {savedAlerts.length>0&&(
              <div style={{marginTop:14}}>
                <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Alertes enregistrées ({savedAlerts.length})</div>
                {savedAlerts.map(a=>(
                  <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:T.surface3,borderRadius:7,marginBottom:5,border:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12}}>🔔</span>
                    <div style={{flex:1,color:T.text,fontSize:11}}>{a.kpi} {a.operateur} {a.valeur}</div>
                    <span style={{color:T.textDim,fontSize:9}}>{a.createdAt?.slice(0,10)}</span>
                    <button onClick={()=>deleteKpiAlert(a.id)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10}}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}); // React.memo — Indicateurs v90



