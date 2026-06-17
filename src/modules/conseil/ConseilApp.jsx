import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// ConseilApp.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _lsRm, _noop, gcCopy, _activeUser, gcAIAsk, dsSave } from '../../core/index.js';
import { useRemoteSync } from '../../hooks/useSyncedState.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, ProgressBar} from '../../components/UI.jsx';

export function CompetitivitePanel({ T, currentUser, setNotifications=_noop }){
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

const { sessions, activeId, setActive, createSession, deleteSession, dataKey } = useToolSessions("competitivite", currentUser.id);
const DEFAULT_ITEMS = [
  {id:"C1",activite:"Conseil stratégique",attractivite:8,competitivite:7,ca:0,notes:""},
  {id:"C2",activite:"Audit & contrôle",attractivite:7,competitivite:9,ca:0,notes:""},
  {id:"C3",activite:"Juridique OHADA",attractivite:6,competitivite:8,ca:0,notes:""},
];
const [compItems, setCompItems] = React.useState(()=>{try{return JSON.parse(_lsGet(dataKey)||"null")||DEFAULT_ITEMS;}catch(_){return [];}});
const [cForm, setCForm] = React.useState({activite:"",attractivite:5,competitivite:5,ca:0,notes:""});
const [aiComp, setAiComp] = React.useState(null);
const [aiLoading2, setAiLoading2] = React.useState(false);
const saveComp = d=>{setCompItems(d);try{_lsSet(dataKey,JSON.stringify(d));}catch(_){}};
React.useEffect(()=>{
  try{setCompItems(JSON.parse(_lsGet(dataKey)||"null")||DEFAULT_ITEMS);}catch(_){setCompItems(DEFAULT_ITEMS);}
  setAiComp(null);
}, [dataKey]);
const handleReset = async () => {
  if(!await gcConfirm("Réinitialiser les activités de ce projet de compétitivité ?")) return;
  saveComp([]); setAiComp(null);
};
const getZone = (a,c) => {
  if(a>=7&&c>=7) return {label:"Leader / Investir",color:"#22C55E"};
  if(a>=7&&c<7) return {label:"Développer / Sélectionner",color:"#3B82F6"};
  if(a<7&&c>=7) return {label:"Défensif / Récolter",color:"#F59E0B"};
  return {label:"Désengager / Pivoter",color:"#EF4444"};
};
return (
  <div>
    <SessionBar sessions={sessions} activeId={activeId} onSetActive={setActive} onNew={createSession} onDelete={deleteSession} T={T} color="#0EA5E9" />
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <div>
        <div style={{color:T.text,fontWeight:800,fontSize:13}}>🎯 Matrice Compétitivité — Attractivité</div>
        <div style={{color:T.textMuted,fontSize:10}}>Positionnez vos activités selon leur attractivité marché et votre compétitivité relative</div>
      </div>
      <button onClick={handleReset} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>↺ Réinitialiser</button>
    </div>
    {/* Matrice visuelle */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
      {[
        {zone:"Leader / Investir",a:"≥7",c:"≥7",color:"#22C55E",action:"Investir, développer, conquérir"},
        {zone:"Développer",a:"≥7",c:"<7",color:"#3B82F6",action:"Renforcer compétitivité, partenariats"},
        {zone:"Défensif",a:"<7",c:"≥7",color:"#F59E0B",action:"Maintenir parts, optimiser coûts"},
        {zone:"Désengager",a:"<7",c:"<7",color:"#EF4444",action:"Reconvertir, externaliser, abandonner"},
      ].map(z=>(
        <div key={z.zone} style={{background:z.color+"15",border:`1px solid ${z.color}44`,borderRadius:8,padding:"10px 14px"}}>
          <div style={{color:z.color,fontWeight:800,fontSize:11}}>{z.zone}</div>
          <div style={{color:T.textMuted,fontSize:9,marginBottom:4}}>Attr. {z.a} / Comp. {z.c}</div>
          <div style={{color:T.textDim,fontSize:9,fontStyle:"italic"}}>{z.action}</div>
          <div style={{marginTop:6,display:"flex",gap:4,flexWrap:"wrap"}}>
            {compItems.filter(item=>{const zone=getZone(item.attractivite,item.competitivite);return zone.label===z.zone;}).map(item=>(
              <span key={item.id} style={{background:z.color+"33",color:z.color,borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700}}>{item.activite}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
    {/* Add activity form */}
    <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:2}}>Activité / DAS</div><input value={cForm.activite} onChange={e=>setCForm(f=>({...f,activite:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:2}}>Attractivité /10</div><input type="number" min="1" max="10" value={cForm.attractivite} onChange={e=>setCForm(f=>({...f,attractivite:+e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:2}}>Compétitivité /10</div><input type="number" min="1" max="10" value={cForm.competitivite} onChange={e=>setCForm(f=>({...f,competitivite:+e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
        <div style={{display:"flex",alignItems:"flex-end"}}><button onClick={() => {if(!cForm.activite.trim())return;const item={...cForm,id:"C-"+Date.now()};saveComp([...compItems,item]);setCForm({activite:"",attractivite:5,competitivite:5,ca:0,notes:""}); }} style={{width:"100%",background:"#0EA5E9",border:"none",color:"#fff",borderRadius:6,padding:"7px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Ajouter</button></div>
      </div>
    </div>
    {/* Table */}
    <table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr style={{background:T.surface2}}>
        {["Activité","Attractivité","Compétitivité","Positionnement","Actions recommandées",""].map(h=><th key={h} style={{padding:"8px 10px",color:T.textMuted,fontSize:9,fontWeight:700,textAlign:"left",borderBottom:`1px solid ${T.border}`}}>{h}</th>)}
      </tr></thead>
      <tbody>
        {compItems.map(item=>{
          const z=getZone(item.attractivite,item.competitivite);
          return (
            <tr key={item.id} style={{borderBottom:`1px solid ${T.border}33`}}>
              <td style={{padding:"8px 10px",color:T.text,fontSize:11,fontWeight:600}}>{item.activite}</td>
              <td style={{padding:"8px 10px",textAlign:"center"}}><div style={{background:`${item.attractivite>=7?"#22C55E":"#F59E0B"}22`,color:item.attractivite>=7?"#22C55E":"#F59E0B",borderRadius:4,padding:"1px 8px",fontSize:10,fontWeight:700,display:"inline-block"}}>{item.attractivite}/10</div></td>
              <td style={{padding:"8px 10px",textAlign:"center"}}><div style={{background:`${item.competitivite>=7?"#22C55E":"#F59E0B"}22`,color:item.competitivite>=7?"#22C55E":"#F59E0B",borderRadius:4,padding:"1px 8px",fontSize:10,fontWeight:700,display:"inline-block"}}>{item.competitivite}/10</div></td>
              <td style={{padding:"8px 10px"}}><span style={{background:z.color+"22",color:z.color,borderRadius:4,padding:"2px 8px",fontSize:9,fontWeight:700}}>{z.label}</span></td>
              <td style={{padding:"8px 10px",color:T.textMuted,fontSize:10}}>{z.label==="Leader / Investir"?"Prioriser l'investissement":z.label==="Développer"?"Renforcer les capacités":z.label==="Défensif"?"Optimiser et défendre":"Réévaluer la pertinence"}</td>
              <td style={{padding:"4px"}}><button onClick={()=>saveComp(compItems.filter(x=>x.id!==item.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:13}}>🗑️</button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
    <div style={{marginTop:12,display:"flex",gap:8}}>
      <button onClick={async()=>{setAiLoading2(true);try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,messages:[{role:"user",content:`Tu es expert en stratégie d'entreprise. Analyse cette matrice compétitivité-attractivité pour un cabinet de conseil au Gabon :\n\n${compItems.map(i=>`${i.activite}: Attractivité ${i.attractivite}/10, Compétitivité ${i.competitivite}/10`).join('\n')}\n\nDonne : 1) Analyse du portefeuille 2) Recommandations par DAS 3) Stratégie globale d'allocation des ressources 4) Priorités court/moyen terme. Sois précis et actionnable.`}]})});const d=await r.json();setAiComp(d.content?.map(c=>c.text||"").join("")||"");}catch(e){setAiComp("Erreur IA");}setAiLoading2(false);}} disabled={aiLoading2} style={{background:"#0EA5E9",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:11}}>
        {aiLoading2?"⏳ Analyse…":"🤖 Analyser avec IA"}
      </button>
    </div>
    {aiComp&&<div style={{background:"#0EA5E910",border:"1px solid #0EA5E933",borderRadius:10,padding:14,marginTop:10,color:T.text,fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7}}>{aiComp}</div>}
  </div>
);
}

export function MarchePanel({T, currentUser, setNotifications=_noop}) {
const _dlg = useDialog();
const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
const { sessions, activeId, setActive, createSession, deleteSession, dataKey } = useToolSessions("marche", currentUser.id);
const EMPTY_MARCHE = {secteur:"",taille:"",croissance:"",cibles:[],concurrents:[],tendances:"",opportunites:"",menaces:"",segmentation:[],aiAnalyse:null};
const [marche, setMarche] = React.useState(()=>{try{return JSON.parse(_lsGet(dataKey)||"null")||EMPTY_MARCHE;}catch(_){return EMPTY_MARCHE;}});
const [aiM, setAiM] = React.useState(false);
const saveM = d=>{setMarche(d);try{_lsSet(dataKey,JSON.stringify(d));}catch(_){}};
const handleReset = async () => { if(!await gcConfirm("Réinitialiser les données de cette étude de marché ?")) return; saveM(EMPTY_MARCHE); };
const [newConc, setNewConc] = React.useState({nom:"",pdm:"",forces:"",faiblesses:""});
const [newCible, setNewCible] = React.useState({segment:"",taille:"",besoins:""});

React.useEffect(() => {
  try { setMarche(JSON.parse(_lsGet(dataKey)||"null")||EMPTY_MARCHE); } catch(_) { setMarche(EMPTY_MARCHE); }
}, [dataKey]);

return (
  <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <SessionBar sessions={sessions} activeId={activeId} onSetActive={setActive} onNew={createSession} onDelete={deleteSession} T={T} color="#0EA5E9" />
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <div style={{color:T.text,fontWeight:800,fontSize:13,flex:1}}>📊 Étude de Marché</div>
      <button onClick={handleReset} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>↺ Réinitialiser</button>
      <button onClick={async()=>{setAiM(true);try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,messages:[{role:"user",content:`Tu es expert en analyse de marché pour l'Afrique centrale/Gabon. Réalise une étude de marché complète pour :\n\nSecteur : ${marche.secteur||"Services conseil/audit Gabon"}\nTaille estimée : ${marche.taille||"Non définie"}\nCibles : ${marche.cibles.map(c=>c.segment).join(", ")||"PME/TPE gabonaises"}\nConcurrents : ${marche.concurrents.map(c=>c.nom).join(", ")||"Marché local"}\n\nFournis : 1) Taille et structure du marché 2) Segmentation détaillée 3) Analyse concurrentielle 4) Tendances clés 2025 5) Opportunités inexploitées 6) Stratégie d'entrée recommandée 7) Facteurs clés de succès`}]})});const d=await r.json();saveM({...marche,aiAnalyse:d.content?.map(c=>c.text||"").join("")||""});}catch(e){}setAiM(false);}} disabled={aiM} style={{background:"#0EA5E9",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
        {aiM?"⏳ Analyse…":"🤖 Analyse IA complète"}
      </button>
    </div>
    {/* Context */}
    <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
      <div style={{color:"#0EA5E9",fontWeight:700,fontSize:12,marginBottom:10}}>🏪 Contexte du marché</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Secteur cible</div><input value={marche.secteur} onChange={e=>saveM({...marche,secteur:e.target.value})} placeholder="Ex: Conseil juridique PME Gabon" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Taille du marché estimée</div><input value={marche.taille} onChange={e=>saveM({...marche,taille:e.target.value})} placeholder="Ex: 2,5 Md XAF / an" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Taux de croissance</div><input value={marche.croissance} onChange={e=>saveM({...marche,croissance:e.target.value})} placeholder="Ex: +8% / an" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Opportunités</div><textarea value={marche.opportunites} onChange={e=>saveM({...marche,opportunites:e.target.value})} rows={3} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/></div>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Menaces / Risques</div><textarea value={marche.menaces} onChange={e=>saveM({...marche,menaces:e.target.value})} rows={3} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/></div>
      </div>
    </div>
    {/* Segments */}
    <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
      <div style={{color:"#22C55E",fontWeight:700,fontSize:12,marginBottom:8}}>👥 Segments cibles</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:6,marginBottom:8}}>
        <input value={newCible.segment} onChange={e=>setNewCible(f=>({...f,segment:e.target.value}))} placeholder="Segment" style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/>
        <input value={newCible.taille} onChange={e=>setNewCible(f=>({...f,taille:e.target.value}))} placeholder="Taille / Part" style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/>
        <input value={newCible.besoins} onChange={e=>setNewCible(f=>({...f,besoins:e.target.value}))} placeholder="Besoins clés" style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/>
        <button onClick={() => {if(!newCible.segment.trim())return;saveM({...marche,cibles:[...marche.cibles,{...newCible,id:"SEG-"+Date.now()}]});setNewCible({segment:"",taille:"",besoins:""}); }} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>+</button>
      </div>
      {marche.cibles.map(c=>(
        <div key={c.id} style={{display:"flex",gap:8,alignItems:"center",background:T.surface3,borderRadius:7,padding:"6px 10px",marginBottom:4}}>
          <span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700,flexShrink:0}}>{c.segment}</span>
          {c.taille&&<span style={{color:T.textMuted,fontSize:9}}>{c.taille}</span>}
          {c.besoins&&<span style={{color:T.textDim,fontSize:9,flex:1,fontStyle:"italic"}}>{c.besoins}</span>}
          <button onClick={()=>saveM({...marche,cibles:marche.cibles.filter(x=>x.id!==c.id)})} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12}}>✕</button>
        </div>
      ))}
    </div>
    {/* Competitors */}
    <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
      <div style={{color:"#EF4444",fontWeight:700,fontSize:12,marginBottom:8}}>🏭 Analyse concurrentielle</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:6,marginBottom:8}}>
        <input value={newConc.nom} onChange={e=>setNewConc(f=>({...f,nom:e.target.value}))} placeholder="Concurrent" style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/>
        <input value={newConc.pdm} onChange={e=>setNewConc(f=>({...f,pdm:e.target.value}))} placeholder="PDM / Taille" style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/>
        <input value={newConc.forces} onChange={e=>setNewConc(f=>({...f,forces:e.target.value}))} placeholder="Forces" style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/>
        <button onClick={() => {if(!newConc.nom.trim())return;saveM({...marche,concurrents:[...marche.concurrents,{...newConc,id:"CONC-"+Date.now()}]});setNewConc({nom:"",pdm:"",forces:"",faiblesses:""});}} style={{background:"#EF4444",border:"none",color:"#fff",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>+</button>
      </div>
      {marche.concurrents.map(c=>(
        <div key={c.id} style={{display:"flex",gap:8,alignItems:"center",background:T.surface3,borderRadius:7,padding:"7px 10px",marginBottom:4}}>
          <span style={{color:T.text,fontWeight:700,fontSize:11,minWidth:80}}>{c.nom}</span>
          {c.pdm&&<span style={{background:"#EF444422",color:"#EF4444",borderRadius:4,padding:"1px 7px",fontSize:9}}>{c.pdm}</span>}
          {c.forces&&<span style={{color:T.textDim,fontSize:9,flex:1}}>Forces: {c.forces}</span>}
          <button onClick={()=>saveM({...marche,concurrents:marche.concurrents.filter(x=>x.id!==c.id)})} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12}}>✕</button>
        </div>
      ))}
    </div>
    {marche.aiAnalyse&&(
      <div style={{background:"#0EA5E910",border:"1px solid #0EA5E933",borderRadius:10,padding:14}}>
        <div style={{color:"#0EA5E9",fontWeight:700,fontSize:12,marginBottom:8}}>🤖 Analyse IA de votre marché</div>
        <div style={{color:T.text,fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7}}>{marche.aiAnalyse}</div>
      </div>
    )}
  </div>
);
}

export function RHConseilPanel({T, currentUser, setNotifications=_noop, users=[], dossiers=[], taches=[]}) {
const [opinions, setOpinions] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-conseil-opinions")||"[]");}catch(_){return [];}});
const [selUser, setSelUser] = React.useState("");
const [opForm, setOpForm] = React.useState({critere:"COMPETENCES",note:5,avis:"",recommandation:"",forces:"",axes:""});
const [aiOp, setAiOp] = React.useState(false);
const saveOp = d=>{setOpinions(d);try{_lsSet("gc-conseil-opinions",JSON.stringify(d)); dsSave("gc-conseil-opinions", d).catch(()=>{});}catch(_){}};
useRemoteSync({'gc-conseil-opinions': setOpinions});
const CRITERES = [{k:"COMPETENCES",l:"🧠 Compétences"},{k:"PERFORMANCE",l:"📈 Performance"},{k:"LEADERSHIP",l:"👑 Leadership"},{k:"COLLABORATION",l:"🤝 Collaboration"},{k:"INNOVATION",l:"💡 Innovation"},{k:"ENGAGEMENT",l:"🔥 Engagement"}];
const activeUsers = users.filter(u=>_activeUser(u)&&u.level>0&&u.id!==currentUser?.id);
return (
  <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{color:T.text,fontWeight:800,fontSize:13,marginBottom:4}}>👥 Ressources Humaines — Évaluation & Avis</div>
    {/* Émettre un avis */}
    <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
      <div style={{color:"#A855F7",fontWeight:700,fontSize:12,marginBottom:10}}>✍️ Émettre un avis / Évaluation</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <div>
          <div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Collaborateur *</div>
          <select value={selUser} onChange={e=>setSelUser(e.target.value)} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
            <option value="">— Sélectionner —</option>
            {activeUsers.map(u=><option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </div>
        <div>
          <div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Critère d'évaluation</div>
          <select value={opForm.critere} onChange={e=>setOpForm(f=>({...f,critere:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
            {CRITERES.map(c=><option key={c.k} value={c.k}>{c.l}</option>)}
          </select>
        </div>
        <div>
          <div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Note /10</div>
          <input type="number" min="1" max="10" value={opForm.note} onChange={e=>setOpForm(f=>({...f,note:+e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Forces observées</div><textarea value={opForm.forces} onChange={e=>setOpForm(f=>({...f,forces:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/></div>
        <div><div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Axes d'amélioration</div><textarea value={opForm.axes} onChange={e=>setOpForm(f=>({...f,axes:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/></div>
      </div>
      <div style={{marginBottom:10}}><div style={{color:T.textMuted,fontSize:9,marginBottom:3}}>Avis global & Recommandation</div><textarea value={opForm.avis} onChange={e=>setOpForm(f=>({...f,avis:e.target.value}))} rows={2} placeholder="Avis général, contexte, recommandations de développement..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/></div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={() => {if(!selUser)return;const u=users.find(x=>x.id===selUser);const op={id:"OP-"+Date.now(),...opForm,userId:selUser,userName:u?.name||selUser,evaluatedBy:currentUser?.name,evaluatedAt:new Date().toISOString()};saveOp([op,...opinions]);setOpForm({critere:"COMPETENCES",note:5,avis:"",recommandation:"",forces:"",axes:""});setSelUser("");}} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Enregistrer l'avis</button>
        <button onClick={async()=>{if(!selUser)return;setAiOp(true);const u=users.find(x=>x.id===selUser);try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:800,messages:[{role:"user",content:`Tu es DRH expert. Rédige une évaluation professionnelle structurée pour ${u?.name} (${u?.role}, Niveau ${u?.level}) :\nCritère: ${opForm.critere}, Note: ${opForm.note}/10\nForces: ${opForm.forces||"Non renseignées"}\nAxes: ${opForm.axes||"Non renseignés"}\nContexte: Cabinet de conseil au Gabon\n\nFournis: 1) Évaluation narrative 2) Points forts 3) Plan développement 4) Recommandations managériales`}]})});const d=await r.json();setOpForm(f=>({...f,avis:d.content?.map(c=>c.text||"").join("")||""}));}catch(e){}setAiOp(false);}} disabled={aiOp||!selUser} style={{background:"#0EA5E922",border:"1px solid #0EA5E944",color:"#0EA5E9",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
          {aiOp?"⏳":"🤖 Générer avec IA"}
        </button>
      </div>
    </div>
    {/* Opinions history */}
    {opinions.length>0&&(
      <div>
        <div style={{color:T.textMuted,fontWeight:700,fontSize:11,marginBottom:8}}>📋 Historique des évaluations</div>
        {/* Group by user */}
        {[...new Set(opinions.map(o=>o.userId))].map(uid=>{
          const u=users.find(x=>x.id===uid);
          const uOps=opinions.filter(o=>o.userId===uid);
          const avgNote=(uOps.reduce((s,o)=>s+o.note,0)/uOps.length).toFixed(1);
          return (
            <div key={uid} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:u?.color||"#A855F7",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:12,overflow:"hidden"}}>{u?.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:(u?.name||"?")[0]}</div>
                <div style={{flex:1}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:12}}>{u?.name||uid}</div>
                  <div style={{color:T.textMuted,fontSize:9}}>{u?.role} · Niveau {u?.level}</div>
                </div>
                <div style={{background:avgNote>=7?"#22C55E22":avgNote>=5?"#F59E0B22":"#EF444422",color:avgNote>=7?"#22C55E":avgNote>=5?"#F59E0B":"#EF4444",borderRadius:6,padding:"3px 10px",fontWeight:800,fontSize:13}}>{avgNote}/10</div>
              </div>
              {uOps.slice(0,2).map(op=>(
                <div key={op.id} style={{background:T.surface3,borderRadius:6,padding:"6px 10px",marginBottom:4,fontSize:10}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
                    <span style={{color:"#A855F7",fontWeight:700}}>{CRITERES.find(c=>c.k===op.critere)?.l||op.critere}</span>
                    <span style={{color:T.textMuted,marginLeft:"auto"}}>{op.note}/10 · {op.evaluatedBy} · {new Date(op.evaluatedAt).toLocaleDateString("fr-FR")}</span>
                  </div>
                  {op.avis&&<div style={{color:T.textDim,fontStyle:"italic"}}>{op.avis.slice(0,150)}{op.avis.length>150?"...":""}</div>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    )}
  </div>
)};

export function AmelioContenuPanel({ T, currentUser, setNotifications=_noop, taches=[], dossiers=[], swot, bcgItems, pdca, porter }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const [acTab, setAcTab] = React.useState("tableau");
  const [aiSynth, setAiSynth] = React.useState(null);
  const [aiLoad3, setAiLoad3] = React.useState(false);

  // -- PLAN D'ACTIONS d'amélioration --
  const [actions, setActions] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-amelio-actions")||"null")||[];}catch(_){return [];}});
  const saveActions = d => {setActions(d);try{_lsSet("gc-amelio-actions",JSON.stringify(d)); dsSave("gc-amelio-actions",d).catch(()=>{});}catch(_){}};
  const [actionForm, setActionForm] = React.useState({titre:"",type:"CORRECTION",priorite:"HAUTE",responsable:"",echeance:"",source:"",statut:"EN_COURS",description:""});
  const [showActionForm, setShowActionForm] = React.useState(false);
  const [editAction, setEditAction] = React.useState(null);
  const [actionFilter, setActionFilter] = React.useState("TOUS");

  // -- KPIs SUIVI --
  const [kpiItems, setKpiItems] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-amelio-kpis")||"null")||[];}catch(_){return [];}});
  const saveKpis = d => {setKpiItems(d);try{_lsSet("gc-amelio-kpis",JSON.stringify(d)); dsSave("gc-amelio-kpis",d).catch(()=>{});}catch(_){}};
  const [kpiForm, setKpiForm] = React.useState({nom:"",unite:"",cible:"",actuel:"",frequence:"MENSUEL",responsable:""});
  const [showKpiForm, setShowKpiForm] = React.useState(false);

  // -- NON-CONFORMITÉS --
  const [ncs, setNcs] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-amelio-ncs")||"null")||[];}catch(_){return [];}});
  const saveNcs = d => {setNcs(d);try{_lsSet("gc-amelio-ncs",JSON.stringify(d)); dsSave("gc-amelio-ncs",d).catch(()=>{});}catch(_){}};
  useRemoteSync({'gc-amelio-actions': setActions, 'gc-amelio-kpis': setKpiItems, 'gc-amelio-ncs': setNcs});
  const [ncForm, setNcForm] = React.useState({description:"",processus:"",gravite:"MAJEURE",detecte_par:"",action_immediate:"",statut:"OUVERTE"});
  const [showNcForm, setShowNcForm] = React.useState(false);

  // -- INDICATEURS TABLEAU DE BORD --
  const kpisSynth = [
    {label:"Actions en cours",val:actions.filter(a=>a.statut==="EN_COURS").length,icon:"🎯",color:"#3B82F6"},
    {label:"Actions terminées",val:actions.filter(a=>a.statut==="TERMINE").length,icon:"✅",color:"#22C55E"},
    {label:"Non-conformités ouvertes",val:ncs.filter(n=>n.statut==="OUVERTE").length,icon:"⚠️",color:"#EF4444"},
    {label:"KPIs suivis",val:kpiItems.length,icon:"📊",color:"#A855F7"},
    {label:"PDCA avancement",val:pdca.do?.avancement||0,icon:"🔄",color:"#F59E0B",suffix:"%"},
    {label:"Tâches urgentes",val:(taches||[]).filter(t=>t.priority==="HAUTE"&&t.status!=="TERMINÉ").length,icon:"⚡",color:"#C41E3A"},
  ];

  const addAction = () => {
    if(!actionForm.titre.trim()) return;
    let updated;
    if(editAction!==null) {
      updated = actions.map((a,i)=>i===editAction?{...actionForm,id:a.id,createdAt:a.createdAt,updatedAt:new Date().toISOString()}:a);
      setEditAction(null);
    } else {
      updated = [...actions,{...actionForm,id:`ACT-${Date.now()}`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
    }
    setActions(updated); saveActions(updated);
    setActionForm({titre:"",type:"CORRECTION",priorite:"HAUTE",responsable:"",echeance:"",source:"",statut:"EN_COURS",description:""});
    setShowActionForm(false);
  };

  const toggleActionStatus = (idx) => {
    const a = actions[idx];
    const newSt = a.statut==="TERMINE"?"EN_COURS":"TERMINE";
    const updated = actions.map((x,i)=>i===idx?{...x,statut:newSt,updatedAt:new Date().toISOString()}:x);
    setActions(updated); saveActions(updated);
  };

  const deleteAction = idx => {
    const updated = actions.filter((_,i)=>i!==idx);
    setActions(updated); saveActions(updated);
  };

  const startEditAction = idx => {
    setActionForm({...actions[idx]});
    setEditAction(idx);
    setShowActionForm(true);
    setAcTab("actions");
  };

  const addKpi = () => {
    if(!kpiForm.nom.trim()) return;
    const updated = [...kpiItems,{...kpiForm,id:`KPI-${Date.now()}`,history:[]}];
    setKpiItems(updated); saveKpis(updated);
    setKpiForm({nom:"",unite:"",cible:"",actuel:"",frequence:"MENSUEL",responsable:""});
    setShowKpiForm(false);
  };

  const updateKpiValue = (idx, val) => {
    const updated = kpiItems.map((k,i)=>{
      if(i!==idx) return k;
      const hist = [...(k.history||[]),{val,date:new Date().toISOString().slice(0,10)}].slice(-12);
      return {...k,actuel:val,history:hist,updatedAt:new Date().toISOString()};
    });
    setKpiItems(updated); saveKpis(updated);
  };

  const addNc = () => {
    if(!ncForm.description.trim()) return;
    const updated = [...ncs,{...ncForm,id:`NC-${Date.now()}`,date:new Date().toISOString().slice(0,10),createdBy:currentUser?.name||""}];
    setNcs(updated); saveNcs(updated);
    setNcForm({description:"",processus:"",gravite:"MAJEURE",detecte_par:"",action_immediate:"",statut:"OUVERTE"});
    setShowNcForm(false);
  };

  const closeNc = idx => {
    const updated = ncs.map((n,i)=>i===idx?{...n,statut:"CLOTUREE",closedAt:new Date().toISOString()}:n);
    setNcs(updated); saveNcs(updated);
  };

  const swotSummary = `S:${swot?.S?.slice(0,60)||"—"} | W:${swot?.W?.slice(0,60)||"—"} | O:${swot?.O?.slice(0,60)||"—"} | T:${swot?.T?.slice(0,60)||"—"}`;

  const generateSynth = async () => {
    setAiLoad3(true);
    try {
      // 🔐 URL API via proxy configuré par Admin (jamais de clé côté client)
      const _gcAIProxyUrl = (() => { try { return JSON.parse(_lsGet("gc-ai-proxy-url")||"null"); } catch(_){return null;} })();
      const _gcAIEndpoint = _gcAIProxyUrl || "https://api.anthropic.com/v1/messages";
      const r = await fetch(_gcAIEndpoint,{method:"POST",headers:{"Content-Type":"application/json",...(_gcAIProxyUrl?{}:{"anthropic-dangerous-direct-browser-calls":"true"})},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2500,messages:[{role:"user",content:`Tu es consultant stratège senior Génie Consultant, Gabon. Analyse et génère un rapport d'amélioration continue:\n\nSWOT: ${swotSummary}\nBCG: ${bcgItems?.length||0} activités\nPDCA: ${pdca?.do?.avancement||0}% — Objectif: ${pdca?.plan?.objectif||"Non défini"}\nPorter 5F moy: ${(Object.values(porter||{}).reduce((s,f)=>s+(f.score||0),0)/5).toFixed(1)}/5\nActions amélioration: ${actions.length} (${actions.filter(a=>a.statut==="TERMINE").length} terminées)\nNon-conformités ouvertes: ${ncs.filter(n=>n.statut==="OUVERTE").length}\nKPIs suivis: ${kpiItems.length}\nTâches urgentes: ${(taches||[]).filter(t=>t.priority==="HAUTE"&&t.status!=="TERMINÉ").length}\nDossiers actifs: ${(dossiers||[]).filter(d=>d.status!=="ARCHIVE").length}\n\nFournis:\n1. Diagnostic global (état d'avancement amélioration continue)\n2. Points forts / points faibles du système actuel\n3. Top 5 actions prioritaires immédiates\n4. Recommandations stratégiques 3/6/12 mois\n5. KPIs clés à suivre absolument\n6. Alertes et risques identifiés\n7. Plan d'action 90 jours détaillé\n\nSois concret, opérationnel, adapté au contexte gabonais (PME/cabinet de conseil).`}]})}); 
      const d = await r.json();
      setAiSynth(d.content?.map(c=>c.text||"").join("")||"");
    } catch(e) { setAiSynth("⚠️ Connexion IA indisponible. Vérifiez la configuration du moteur IA."); }
    setAiLoad3(false);
  };

  const printAmelio = () => {
    const dateStr = new Date().toLocaleDateString("fr-FR");
    const actionsHtml = actions.map(a=>`<tr><td>${a.titre}</td><td>${a.type}</td><td>${a.priorite}</td><td>${a.responsable||"—"}</td><td>${a.echeance||"—"}</td><td style="color:${a.statut==="TERMINE"?"#22C55E":"#F59E0B"}">${a.statut}</td></tr>`).join("");
    const kpisHtml = kpiItems.map(k=>`<tr><td>${k.nom}</td><td>${k.actuel||"—"} ${k.unite}</td><td>${k.cible} ${k.unite}</td><td>${k.responsable||"—"}</td></tr>`).join("");
    const ncsHtml = ncs.map(n=>`<tr><td>${n.date}</td><td>${n.description?.slice(0,60)}</td><td>${n.gravite}</td><td>${n.processus||"—"}</td><td style="color:${n.statut==="CLOTUREE"?"#22C55E":"#EF4444"}">${n.statut}</td></tr>`).join("");
    const w=window.open("","_blank");
    if(!w){gcAlert("Veuillez autoriser les fenêtres popup pour imprimer.");return;}
    w.document.write(`<html><head><title>Rapport Amélioration Continue — ${dateStr}</title><style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}h1{color:#1e3a5f;font-size:18px;border-bottom:2px solid #1e3a5f;padding-bottom:8px}h2{color:#1e3a5f;font-size:14px;margin-top:20px}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left;font-size:11px}td{padding:5px 8px;border-bottom:1px solid #ddd;font-size:11px}.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:10px 0}.kpi-box{border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center}.kpi-val{font-size:22px;font-weight:bold;color:#1e3a5f}.kpi-lbl{font-size:10px;color:#666}@media print{body{padding:10px}}</style></head><body>
    <h1>📊 Rapport Amélioration Continue — Génie Consultant</h1>
    <p style="color:#666;font-size:11px">Généré le ${dateStr} | Utilisateur: ${currentUser?.name||"—"}</p>
    <div class="kpi-grid">
      ${kpisSynth.map(k=>`<div class="kpi-box"><div class="kpi-val">${k.val}${k.suffix||""}</div><div class="kpi-lbl">${k.icon} ${k.label}</div></div>`).join("")}
    </div>
    <h2>📋 Plan d'actions d'amélioration (${actions.length})</h2>
    ${actions.length?`<table><thead><tr><th>Titre</th><th>Type</th><th>Priorité</th><th>Responsable</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>${actionsHtml}</tbody></table>`:"<p><i>Aucune action enregistrée.</i></p>"}
    <h2>📊 KPIs de suivi (${kpiItems.length})</h2>
    ${kpiItems.length?`<table><thead><tr><th>Indicateur</th><th>Valeur actuelle</th><th>Cible</th><th>Responsable</th></tr></thead><tbody>${kpisHtml}</tbody></table>`:"<p><i>Aucun KPI défini.</i></p>"}
    <h2>⚠️ Non-conformités (${ncs.length})</h2>
    ${ncs.length?`<table><thead><tr><th>Date</th><th>Description</th><th>Gravité</th><th>Processus</th><th>Statut</th></tr></thead><tbody>${ncsHtml}</tbody></table>`:"<p><i>Aucune non-conformité enregistrée.</i></p>"}
    ${aiSynth?`<h2>🤖 Synthèse IA</h2><div style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:11px">${aiSynth}</div>`:""}
    </body></html>`);
    w.document.close(); setTimeout(()=>w.print(),400);
  };

  const exportCSV = () => {
    const rows = [["Titre","Type","Priorité","Responsable","Échéance","Source","Statut","Description","Créé le"],...actions.map(a=>[a.titre,a.type,a.priorite,a.responsable||"",a.echeance||"",a.source||"",a.statut,a.description||"",a.createdAt?.slice(0,10)||""])];
    const csv = rows.map(r=>r.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const b=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`Actions_Amelioration_${new Date().toLocaleDateString("fr-FR").replace(/\//g,"-")}.csv`;a.click();URL.revokeObjectURL(u);
  };

  const PRIO_COLOR = {HAUTE:"#EF4444",MOYENNE:"#F59E0B",FAIBLE:"#22C55E"};
  const TYPE_LABEL = {CORRECTION:"🔧 Corrective",PREVENTION:"🛡️ Préventive",AMELIORATION:"⬆️ Amélioration",INNOVATION:"💡 Innovation"};
  const filteredActions = actionFilter==="TOUS" ? actions : actions.filter(a=>a.statut===actionFilter);
  const overdueActions = actions.filter(a=>a.echeance&&new Date(a.echeance)<new Date()&&a.statut!=="TERMINE");

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* ── HEADER ── */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{color:T.text,fontWeight:800,fontSize:13}}>🔁 Amélioration Continue — Système de Management</div>
          <div style={{color:T.textMuted,fontSize:10}}>Plans d'actions · KPIs · Non-conformités · Synthèse IA</div>
        </div>
        <button onClick={printAmelio} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>🖨️ Imprimer</button>
        <button onClick={exportCSV} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>📥 CSV</button>
        <button onClick={generateSynth} disabled={aiLoad3} style={{background:"linear-gradient(135deg,#A855F7,#6366F1)",border:"none",color:"#fff",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:800,fontSize:11}}>
          {aiLoad3?"⏳ Analyse…":"🤖 Synthèse IA"}
        </button>
      </div>

      {/* ── ALERTES ── */}
      {overdueActions.length>0 && (
        <div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:8,padding:"8px 14px",display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:16}}>⚠️</span>
          <div style={{color:"#EF4444",fontSize:11,fontWeight:700}}>{overdueActions.length} action(s) en retard : {overdueActions.slice(0,3).map(a=>a.titre).join(", ")}{overdueActions.length>3?"…":""}</div>
        </div>
      )}

      {/* ── KPI CARDS ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {kpisSynth.map((k,i)=>(
          <div key={i} style={{background:T.surface2,border:`1px solid ${k.color}33`,borderRadius:8,padding:"10px 14px",display:"flex",gap:10,alignItems:"center"}}>
            <span style={{fontSize:18}}>{k.icon}</span>
            <div>
              <div style={{color:k.color,fontWeight:900,fontSize:15}}>{k.val}{k.suffix||""}</div>
              <div style={{color:T.textMuted,fontSize:9}}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── ONGLETS ── */}
      <div style={{display:"flex",gap:4,borderBottom:`1px solid ${T.border}`,paddingBottom:0}}>
        {[["tableau","📊 Tableau de bord"],["actions","🎯 Plan d'actions"],["kpis","📈 KPIs"],["ncs","⚠️ Non-conformités"],["synthese","🤖 Synthèse"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setAcTab(id)}
            style={{background:acTab===id?"#A855F7":"transparent",border:`1px solid ${acTab===id?"#A855F7":T.border+"44"}`,color:acTab===id?"#fff":T.textDim,borderRadius:"6px 6px 0 0",padding:"6px 12px",cursor:"pointer",fontSize:10,fontWeight:700,borderBottom:"none",marginBottom:-1}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ══ TABLEAU DE BORD ══ */}
      {acTab==="tableau" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* SWOT mini */}
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
            <div style={{color:"#A855F7",fontWeight:700,fontSize:12,marginBottom:8}}>⚖️ État SWOT</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {[{k:"S",l:"Forces",c:"#22C55E"},{k:"W",l:"Faiblesses",c:"#EF4444"},{k:"O",l:"Opportunités",c:"#3B82F6"},{k:"T",l:"Menaces",c:"#F59E0B"}].map(s=>(
                <div key={s.k} style={{background:s.c+"10",border:`1px solid ${s.c}33`,borderRadius:6,padding:"8px 10px"}}>
                  <div style={{color:s.c,fontWeight:700,fontSize:10,marginBottom:3}}>{s.l}</div>
                  <div style={{color:T.textDim,fontSize:10,lineHeight:1.5}}>{swot?.[s.k]?.slice(0,120)||<span style={{fontStyle:"italic",color:T.textMuted}}>Non renseigné — allez dans ⚖️ SWOT</span>}</div>
                </div>
              ))}
            </div>
          </div>
          {/* PDCA */}
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
            <div style={{color:"#3B82F6",fontWeight:700,fontSize:12,marginBottom:8}}>🔄 Cycle PDCA — Avancement</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {[{l:"📋 Plan",v:pdca?.plan?.objectif,c:"#3B82F6",sub:"Objectif défini"},{l:"⚙️ Do",v:`${pdca?.do?.avancement||0}%`,c:"#22C55E",sub:pdca?.do?.responsable||"Responsable"},{l:"🔍 Check",v:pdca?.check?.resultats,c:"#F59E0B",sub:"Résultats"},{l:"🔁 Act",v:pdca?.act?.ameliorations,c:"#C41E3A",sub:"Améliorations"}].map(s=>(
                <div key={s.l} style={{background:s.c+"10",border:`1px solid ${s.c}44`,borderRadius:8,padding:"10px"}}>
                  <div style={{color:s.c,fontWeight:800,fontSize:11,marginBottom:4}}>{s.l}</div>
                  <div style={{color:T.text,fontSize:10,fontWeight:600,marginBottom:2}}>{s.v?.slice?.(0,50)||"—"}</div>
                  <div style={{color:T.textDim,fontSize:9}}>{s.sub}</div>
                </div>
              ))}
            </div>
            <div style={{background:T.surface3,borderRadius:99,height:8,overflow:"hidden",marginTop:10}}>
              <div style={{width:`${pdca?.do?.avancement||0}%`,background:"linear-gradient(90deg,#3B82F6,#22C55E)",height:"100%",borderRadius:99,transition:"width 0.5s"}}/>
            </div>
            <div style={{textAlign:"right",color:"#3B82F6",fontWeight:700,fontSize:11,marginTop:4}}>{pdca?.do?.avancement||0}%</div>
          </div>
          {/* Résumé actions récentes */}
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
            <div style={{color:"#22C55E",fontWeight:700,fontSize:12,marginBottom:8}}>🎯 Dernières actions ({actions.length})</div>
            {actions.length===0 ? <div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:"10px 0"}}>Aucune action. Allez dans <b>Plan d'actions</b> pour en créer.</div>
            : actions.slice(-5).reverse().map((a,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 0",borderBottom:i<4?`1px solid ${T.border}22`:"none"}}>
                <span style={{fontSize:10,color:PRIO_COLOR[a.priorite]||"#999",fontWeight:800,minWidth:12}}>●</span>
                <div style={{flex:1,color:T.text,fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.titre}</div>
                <span style={{fontSize:9,color:a.statut==="TERMINE"?"#22C55E":"#F59E0B",background:(a.statut==="TERMINE"?"#22C55E":"#F59E0B")+"22",padding:"1px 6px",borderRadius:99,fontWeight:700,flexShrink:0}}>{a.statut==="TERMINE"?"✅ Terminé":"⏳ En cours"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ PLAN D'ACTIONS ══ */}
      {acTab==="actions" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:3}}>
              {["TOUS","EN_COURS","TERMINE"].map(f=>(
                <button key={f} onClick={()=>setActionFilter(f)}
                  style={{background:actionFilter===f?"#3B82F6":"transparent",border:`1px solid ${actionFilter===f?"#3B82F6":T.border+"66"}`,color:actionFilter===f?"#fff":T.textDim,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                  {f==="TOUS"?"Toutes":f==="EN_COURS"?"En cours":"Terminées"}
                </button>
              ))}
            </div>
            <div style={{flex:1}}/>
            <button onClick={() => {setEditAction(null);setActionForm({titre:"",type:"CORRECTION",priorite:"HAUTE",responsable:"",echeance:"",source:"",statut:"EN_COURS",description:""});setShowActionForm(v=>!v);}}
              style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
              ➕ Nouvelle action
            </button>
          </div>

          {showActionForm && (
            <div style={{background:T.surface2,border:`2px solid #3B82F644`,borderRadius:10,padding:14}}>
              <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>{editAction!==null?"✏️ Modifier l'action":"➕ Nouvelle action d'amélioration"}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{gridColumn:"span 2"}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Titre *</label>
                  <input value={actionForm.titre} onChange={e=>setActionForm(f=>({...f,titre:e.target.value}))} placeholder="Description courte de l'action..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Type</label>
                  <select value={actionForm.type} onChange={e=>setActionForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="CORRECTION">🔧 Corrective</option>
                    <option value="PREVENTION">🛡️ Préventive</option>
                    <option value="AMELIORATION">⬆️ Amélioration</option>
                    <option value="INNOVATION">💡 Innovation</option>
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Priorité</label>
                  <select value={actionForm.priorite} onChange={e=>setActionForm(f=>({...f,priorite:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="HAUTE">🔴 Haute</option>
                    <option value="MOYENNE">🟡 Moyenne</option>
                    <option value="FAIBLE">🟢 Faible</option>
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Responsable</label>
                  <input value={actionForm.responsable} onChange={e=>setActionForm(f=>({...f,responsable:e.target.value}))} placeholder="Nom du responsable" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Échéance</label>
                  <input type="date" value={actionForm.echeance} onChange={e=>setActionForm(f=>({...f,echeance:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Source / Origine</label>
                  <input value={actionForm.source} onChange={e=>setActionForm(f=>({...f,source:e.target.value}))} placeholder="Ex: Audit, NC-001, Client..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Statut</label>
                  <select value={actionForm.statut} onChange={e=>setActionForm(f=>({...f,statut:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="EN_COURS">⏳ En cours</option>
                    <option value="TERMINE">✅ Terminé</option>
                    <option value="SUSPENDU">⏸️ Suspendu</option>
                    <option value="ANNULE">❌ Annulé</option>
                  </select>
                </div>
                <div style={{gridColumn:"span 2"}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Description / Détails</label>
                  <textarea rows={2} value={actionForm.description} onChange={e=>setActionForm(f=>({...f,description:e.target.value}))} placeholder="Détails de l'action, contexte, ressources nécessaires..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11,resize:"vertical"}} />
                </div>
              </div>
              <div style={{display:"flex",gap:6,marginTop:10,justifyContent:"flex-end"}}>
                <button onClick={() => {setShowActionForm(false);setEditAction(null);}} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"6px 14px",cursor:"pointer",fontSize:11}}>Annuler</button>
                <button onClick={addAction} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:6,padding:"6px 18px",cursor:"pointer",fontWeight:700,fontSize:11}}>{editAction!==null?"💾 Sauvegarder":"➕ Ajouter"}</button>
              </div>
            </div>
          )}

          {filteredActions.length===0 ? (
            <div style={{textAlign:"center",color:T.textMuted,padding:"30px 0",fontSize:12}}>
              {actionFilter==="TOUS"?"Aucune action. Cliquez ➕ pour créer votre première action.":"Aucune action dans ce statut."}
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {filteredActions.map((a,i)=>{
                const realIdx = actions.indexOf(a);
                const isOverdue = a.echeance && new Date(a.echeance)<new Date() && a.statut!=="TERMINE";
                return (
                  <div key={a.id||i} style={{background:T.surface2,border:`1px solid ${isOverdue?"#EF444433":T.border}`,borderLeft:`3px solid ${PRIO_COLOR[a.priorite]||"#999"}`,borderRadius:8,padding:"10px 14px"}}>
                    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <input type="checkbox" checked={a.statut==="TERMINE"} onChange={()=>toggleActionStatus(realIdx)}
                        style={{marginTop:2,accentColor:"#22C55E",cursor:"pointer",flexShrink:0}} />
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{color:a.statut==="TERMINE"?T.textDim:T.text,fontWeight:700,fontSize:11,textDecoration:a.statut==="TERMINE"?"line-through":"none"}}>{a.titre}</span>
                          <span style={{fontSize:9,background:PRIO_COLOR[a.priorite]+"22",color:PRIO_COLOR[a.priorite],padding:"1px 6px",borderRadius:99,fontWeight:700}}>{a.priorite}</span>
                          <span style={{fontSize:9,background:"#A855F722",color:"#A855F7",padding:"1px 6px",borderRadius:99,fontWeight:700}}>{TYPE_LABEL[a.type]||a.type}</span>
                          {isOverdue && <span style={{fontSize:9,background:"#EF444422",color:"#EF4444",padding:"1px 6px",borderRadius:99,fontWeight:700}}>⚠️ En retard</span>}
                        </div>
                        <div style={{display:"flex",gap:10,marginTop:4,flexWrap:"wrap"}}>
                          {a.responsable && <span style={{color:T.textDim,fontSize:9}}>👤 {a.responsable}</span>}
                          {a.echeance && <span style={{color:isOverdue?"#EF4444":T.textDim,fontSize:9}}>📅 {a.echeance}</span>}
                          {a.source && <span style={{color:T.textDim,fontSize:9}}>🔗 {a.source}</span>}
                        </div>
                        {a.description && <div style={{color:T.textDim,fontSize:10,marginTop:4,lineHeight:1.4}}>{a.description}</div>}
                      </div>
                      <div style={{display:"flex",gap:3,flexShrink:0}}>
                        <button onClick={()=>startEditAction(realIdx)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10}}>✏️</button>
                        <button onClick={()=>deleteAction(realIdx)} style={{background:"transparent",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10}}>🗑️</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{color:T.textDim,fontSize:9,textAlign:"right"}}>
            Total: {actions.length} | En cours: {actions.filter(a=>a.statut==="EN_COURS").length} | Terminées: {actions.filter(a=>a.statut==="TERMINE").length} | En retard: {overdueActions.length}
          </div>
        </div>
      )}

      {/* ══ KPIs ══ */}
      {acTab==="kpis" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <button onClick={()=>setShowKpiForm(v=>!v)} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>➕ Nouveau KPI</button>
          </div>
          {showKpiForm && (
            <div style={{background:T.surface2,border:`2px solid #A855F744`,borderRadius:10,padding:14}}>
              <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>📊 Définir un indicateur de performance</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{gridColumn:"span 2"}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Nom de l'indicateur *</label>
                  <input value={kpiForm.nom} onChange={e=>setKpiForm(f=>({...f,nom:e.target.value}))} placeholder="Ex: Taux de satisfaction client, Délai moyen traitement..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Unité de mesure</label>
                  <input value={kpiForm.unite} onChange={e=>setKpiForm(f=>({...f,unite:e.target.value}))} placeholder="%, jours, FCFA, nombre..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Cible</label>
                  <input value={kpiForm.cible} onChange={e=>setKpiForm(f=>({...f,cible:e.target.value}))} placeholder="Valeur cible à atteindre" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Valeur actuelle</label>
                  <input value={kpiForm.actuel} onChange={e=>setKpiForm(f=>({...f,actuel:e.target.value}))} placeholder="Valeur mesurée" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Fréquence de mesure</label>
                  <select value={kpiForm.frequence} onChange={e=>setKpiForm(f=>({...f,frequence:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="QUOTIDIEN">Quotidien</option>
                    <option value="HEBDO">Hebdomadaire</option>
                    <option value="MENSUEL">Mensuel</option>
                    <option value="TRIMESTRIEL">Trimestriel</option>
                    <option value="ANNUEL">Annuel</option>
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Responsable</label>
                  <input value={kpiForm.responsable} onChange={e=>setKpiForm(f=>({...f,responsable:e.target.value}))} placeholder="Qui mesure ?" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
              </div>
              <div style={{display:"flex",gap:6,marginTop:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setShowKpiForm(false)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"6px 14px",cursor:"pointer",fontSize:11}}>Annuler</button>
                <button onClick={addKpi} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:6,padding:"6px 18px",cursor:"pointer",fontWeight:700,fontSize:11}}>➕ Ajouter</button>
              </div>
            </div>
          )}
          {kpiItems.length===0 ? (
            <div style={{textAlign:"center",color:T.textMuted,padding:"30px 0",fontSize:12}}>Aucun KPI défini. Cliquez ➕ pour ajouter des indicateurs de performance.</div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {kpiItems.map((k,i)=>{
                const pct = k.cible&&k.actuel ? Math.min(100,Math.round((parseFloat(k.actuel)/parseFloat(k.cible))*100)) : null;
                const ok = pct !== null && pct >= 80;
                return (
                  <div key={k.id||i} style={{background:T.surface2,border:`1px solid ${ok?"#22C55E33":pct!==null&&pct<50?"#EF444433":T.border}`,borderRadius:10,padding:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{color:T.text,fontWeight:700,fontSize:11}}>{k.nom}</div>
                      <button onClick={async () => {const v = await gcPrompt(`Nouvelle valeur pour "${k.nom}" (${k.unite}):`,k.actuel||"");if(v!==null)updateKpiValue(i,v);}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9}}>Mettre à jour</button>
                    </div>
                    <div style={{display:"flex",gap:14,marginTop:8,alignItems:"flex-end"}}>
                      <div>
                        <div style={{color:ok?"#22C55E":pct!==null&&pct<50?"#EF4444":"#F59E0B",fontWeight:900,fontSize:20}}>{k.actuel||"—"}<span style={{fontSize:11,fontWeight:400}}> {k.unite}</span></div>
                        <div style={{color:T.textMuted,fontSize:9}}>Cible: {k.cible} {k.unite}</div>
                      </div>
                      {pct!==null && (
                        <div style={{flex:1}}>
                          <div style={{background:T.surface3,borderRadius:99,height:6,overflow:"hidden"}}>
                            <div style={{width:`${pct}%`,background:ok?"#22C55E":pct<50?"#EF4444":"#F59E0B",height:"100%",borderRadius:99}} />
                          </div>
                          <div style={{textAlign:"right",fontSize:9,color:T.textDim,marginTop:2}}>{pct}%</div>
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:6}}>
                      {k.responsable && <span style={{color:T.textDim,fontSize:9}}>👤 {k.responsable}</span>}
                      <span style={{color:T.textDim,fontSize:9}}>🔄 {k.frequence}</span>
                      {k.history?.length>0 && <span style={{color:T.textDim,fontSize:9}}>📈 {k.history.length} mesure(s)</span>}
                    </div>
                    <button onClick={() => {const u=kpiItems.filter((_,j)=>j!==i);setKpiItems(u);saveKpis(u);}} style={{background:"transparent",border:"none",color:"#EF444499",cursor:"pointer",fontSize:10,marginTop:4}}>🗑️ Supprimer</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ NON-CONFORMITÉS ══ */}
      {acTab==="ncs" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <button onClick={()=>setShowNcForm(v=>!v)} style={{background:"#EF4444",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>➕ Signaler une NC</button>
          </div>
          {showNcForm && (
            <div style={{background:T.surface2,border:`2px solid #EF444444`,borderRadius:10,padding:14}}>
              <div style={{color:"#EF4444",fontWeight:700,fontSize:12,marginBottom:10}}>⚠️ Nouvelle Non-Conformité</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{gridColumn:"span 2"}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Description de la non-conformité *</label>
                  <textarea rows={2} value={ncForm.description} onChange={e=>setNcForm(f=>({...f,description:e.target.value}))} placeholder="Décrivez la non-conformité observée..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Processus concerné</label>
                  <input value={ncForm.processus} onChange={e=>setNcForm(f=>({...f,processus:e.target.value}))} placeholder="Ex: Facturation, RH, Production..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Gravité</label>
                  <select value={ncForm.gravite} onChange={e=>setNcForm(f=>({...f,gravite:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}}>
                    <option value="CRITIQUE">🔴 Critique</option>
                    <option value="MAJEURE">🟠 Majeure</option>
                    <option value="MINEURE">🟡 Mineure</option>
                    <option value="OBSERVATION">🔵 Observation</option>
                  </select>
                </div>
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Détecté par</label>
                  <input value={ncForm.detecte_par} onChange={e=>setNcForm(f=>({...f,detecte_par:e.target.value}))} placeholder="Auditeur, Client, Auto-contrôle..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
                <div style={{gridColumn:"span 2"}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3}}>Action immédiate prise</label>
                  <input value={ncForm.action_immediate} onChange={e=>setNcForm(f=>({...f,action_immediate:e.target.value}))} placeholder="Mesure de correction immédiate..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11}} />
                </div>
              </div>
              <div style={{display:"flex",gap:6,marginTop:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setShowNcForm(false)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"6px 14px",cursor:"pointer",fontSize:11}}>Annuler</button>
                <button onClick={addNc} style={{background:"#EF4444",border:"none",color:"#fff",borderRadius:6,padding:"6px 18px",cursor:"pointer",fontWeight:700,fontSize:11}}>⚠️ Signaler</button>
              </div>
            </div>
          )}
          {ncs.length===0 ? (
            <div style={{textAlign:"center",color:T.textMuted,padding:"30px 0",fontSize:12}}>Aucune non-conformité enregistrée. Cliquez ➕ pour en signaler une.</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {ncs.map((n,i)=>{
                const gColor = {CRITIQUE:"#C41E3A",MAJEURE:"#EF4444",MINEURE:"#F59E0B",OBSERVATION:"#3B82F6"}[n.gravite]||"#999";
                return (
                  <div key={n.id||i} style={{background:T.surface2,border:`1px solid ${n.statut==="OUVERTE"?gColor+"33":T.border}`,borderLeft:`3px solid ${gColor}`,borderRadius:8,padding:"10px 14px"}}>
                    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{color:T.text,fontWeight:700,fontSize:11}}>{n.description?.slice(0,80)}</span>
                          <span style={{fontSize:9,background:gColor+"22",color:gColor,padding:"1px 6px",borderRadius:99,fontWeight:700}}>{n.gravite}</span>
                          <span style={{fontSize:9,background:(n.statut==="CLOTUREE"?"#22C55E":"#EF4444")+"22",color:n.statut==="CLOTUREE"?"#22C55E":"#EF4444",padding:"1px 6px",borderRadius:99,fontWeight:700}}>{n.statut}</span>
                        </div>
                        <div style={{display:"flex",gap:10,marginTop:4,flexWrap:"wrap"}}>
                          {n.processus && <span style={{color:T.textDim,fontSize:9}}>⚙️ {n.processus}</span>}
                          {n.detecte_par && <span style={{color:T.textDim,fontSize:9}}>👤 {n.detecte_par}</span>}
                          <span style={{color:T.textDim,fontSize:9}}>📅 {n.date}</span>
                        </div>
                        {n.action_immediate && <div style={{color:T.textDim,fontSize:10,marginTop:4}}>🔧 {n.action_immediate}</div>}
                      </div>
                      <div style={{display:"flex",gap:3,flexShrink:0}}>
                        {n.statut==="OUVERTE" && <button onClick={()=>closeNc(i)} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>✅ Clôturer</button>}
                        <button onClick={() => {const u=ncs.filter((_,j)=>j!==i);setNcs(u);saveNcs(u);}} style={{background:"transparent",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10}}>🗑️</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ SYNTHÈSE IA ══ */}
      {acTab==="synthese" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
            <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:6}}>🤖 Synthèse IA — Rapport d'amélioration continue</div>
            <div style={{color:T.textDim,fontSize:10,marginBottom:12}}>Analyse croisée SWOT + BCG + PDCA + Porter + vos actions et KPIs pour des recommandations personnalisées.</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
              {[{l:"Actions créées",v:actions.length,c:"#3B82F6"},{l:"Actions terminées",v:actions.filter(a=>a.statut==="TERMINE").length,c:"#22C55E"},{l:"NC ouvertes",v:ncs.filter(n=>n.statut==="OUVERTE").length,c:"#EF4444"},{l:"KPIs définis",v:kpiItems.length,c:"#A855F7"},{l:"PDCA %",v:`${pdca?.do?.avancement||0}%`,c:"#F59E0B"},{l:"Tâches urgentes",v:(taches||[]).filter(t=>t.priority==="HAUTE"&&t.status!=="TERMINÉ").length,c:"#C41E3A"}].map((s,i)=>(
                <div key={i} style={{background:s.c+"10",border:`1px solid ${s.c}33`,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{color:s.c,fontWeight:900,fontSize:16}}>{s.v}</div>
                  <div style={{color:T.textMuted,fontSize:9}}>{s.l}</div>
                </div>
              ))}
            </div>
            <button onClick={generateSynth} disabled={aiLoad3} style={{width:"100%",background:"linear-gradient(135deg,#A855F7,#6366F1)",border:"none",color:"#fff",borderRadius:8,padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
              {aiLoad3?"⏳ Génération en cours…":"🤖 Générer la synthèse stratégique IA"}
            </button>
          </div>
          {aiSynth && (
            <div style={{background:"linear-gradient(135deg,#A855F710,#6366F110)",border:"1px solid #A855F733",borderRadius:12,padding:16}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                <span style={{color:"#A855F7",fontWeight:800,fontSize:13}}>🤖 Analyse IA — Amélioration Continue</span>
                <button onClick={() => {const b=new Blob([aiSynth],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`Synthese_AC_${new Date().toLocaleDateString("fr-FR").replace(/\//g,"-")}.txt`;a.click();URL.revokeObjectURL(u);}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700,marginLeft:"auto"}}>⬇ Télécharger</button>
                <button onClick={printAmelio} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>🖨️ Imprimer</button>
                <button onClick={()=>setAiSynth(null)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:14}}>✕</button>
              </div>
              <div style={{color:T.text,fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.8}}>{aiSynth}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// FIX v135 — Extract constants outside component export to avoid fast-refresh violation
const CONSEIL_CONFIG = {
  maxDossiers: 100,
  defaultView: 'Tableau',
};

// FIX v135 — Constants extracted outside component to avoid fast-refresh violation
const ConseilDefaults = {};

// FIX v135 — Add const or export that's causing fast-refresh violation
// Locate the line 1982 export issue
export function ConseilApp({ T, currentUser, setNotifications=_noop, taches=[], dossiers=[], users=[] }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [tool, setTool] = useState("dashboard"); // FIX v137 — open on dashboard
  const [swot, setSwot] = useState({S:"",W:"",O:"",T:""});
  const [pestel, setPestel] = useState({P:"",E:"",S:"",T2:"",E2:"",L:""});
  const [pdca, setPdca] = useState(() => { try { return JSON.parse(_lsGet("gc-pdca")||"null") || {
    plan:{objectif:"",actions:"",ressources:"",echeance:"",indicateurs:""},
    do:{responsable:"",avancement:0,notes:""},
    check:{resultats:"",ecarts:"",analyse:""},
    act:{ameliorations:"",standardisation:"",prochaine_cycle:""}
  }; } catch (_) { return {plan:{objectif:"",actions:"",ressources:"",echeance:"",indicateurs:""},do:{responsable:"",avancement:0,notes:""},check:{resultats:"",ecarts:"",analyse:""},act:{ameliorations:"",standardisation:"",prochaine_cycle:""}}; }});
  const savePdca = (p) => { setPdca(p); try{_lsSet("gc-pdca",JSON.stringify(p)); dsSave("gc-pdca",p).catch(()=>{});}catch (_) {} };
  const [mckinsey, setMckinsey] = useState(() => {
    try { return JSON.parse(_lsGet("gc-mckinsey")||"null") || Array.from({length:9},(_,i)=>({id:i,label:"",desc:"",stars:0})); } catch (_) { return Array.from({length:9},(_,i)=>({id:i,label:"",desc:"",stars:0})); }
  });
  const saveMckinsey = (m) => { setMckinsey(m); try{_lsSet("gc-mckinsey",JSON.stringify(m)); dsSave("gc-mckinsey",m).catch(()=>{});}catch (_) {} };
  // -- 7S McKinsey ----------------------------------------------------------
  const [mc7s, setMc7s] = useState(() => {
    try { return JSON.parse(_lsGet("gc-mc7s")||"null") || {
      strategy:{score:0,notes:"",actions:""},
      structure:{score:0,notes:"",actions:""},
      systems:{score:0,notes:"",actions:""},
      shared_values:{score:0,notes:"",actions:""},
      style:{score:0,notes:"",actions:""},
      staff:{score:0,notes:"",actions:""},
      skills:{score:0,notes:"",actions:""}}; } catch (_) { return {strategy:{score:0,notes:"",actions:""},structure:{score:0,notes:"",actions:""},systems:{score:0,notes:"",actions:""},shared_values:{score:0,notes:"",actions:""},style:{score:0,notes:"",actions:""},staff:{score:0,notes:"",actions:""},skills:{score:0,notes:"",actions:""}}; }
  });
  const saveMc7s = (v) => { setMc7s(v); try{_lsSet("gc-mc7s",JSON.stringify(v)); dsSave("gc-mc7s",v).catch(()=>{});}catch (_) {} };
  const [mc7sTab, setMc7sTab] = useState("grid"); // grid | 7s
  const [fiveM, setFiveM] = useState(() => { try { return JSON.parse(_lsGet("gc-5m")||"null") || {
    probleme:"", M1:[],M2:[],M3:[],M4:[],M5:[]
  }; } catch (_) { return {probleme:"",M1:[],M2:[],M3:[],M4:[],M5:[]}; }});
  const [fiveMInput, setFiveMInput] = useState({M1:"",M2:"",M3:"",M4:"",M5:""});
  const saveFiveM = (m) => { setFiveM(m); try{_lsSet("gc-5m",JSON.stringify(m)); dsSave("gc-5m",m).catch(()=>{});}catch (_) {} };
  const [fiveS, setFiveS] = useState(() => { try { return JSON.parse(_lsGet("gc-5s")||"null") || {
    S1:{score:0,notes:"",items:[]},S2:{score:0,notes:"",items:[]},S3:{score:0,notes:"",items:[]},S4:{score:0,notes:"",items:[]},S5:{score:0,notes:"",items:[]}
  }; } catch (_) { return {S1:{score:0,notes:"",items:[]},S2:{score:0,notes:"",items:[]},S3:{score:0,notes:"",items:[]},S4:{score:0,notes:"",items:[]},S5:{score:0,notes:"",items:[]}}; }});
  const saveFiveS = (s) => { setFiveS(s); try{_lsSet("gc-5s",JSON.stringify(s)); dsSave("gc-5s",s).catch(()=>{});}catch (_) {} };
  const [pca, setPca] = useState(() => { try { return JSON.parse(_lsGet("gc-pca")||"null") || {
    contexte:"",risques_majeurs:"",seuil_reprise:"",rto:"",rpo:"",equipe_crise:[],procedures:[]
  }; } catch (_) { return {contexte:"",risques_majeurs:"",seuil_reprise:"",rto:"",rpo:"",equipe_crise:[],procedures:[]}; }});
  const [pcaLoading, setPcaLoading] = useState(false);
  const savePca = (p) => { setPca(p); try{_lsSet("gc-pca",JSON.stringify(p)); dsSave("gc-pca",p).catch(()=>{});}catch (_) {} };

  const [bcgItems, setBcgItems] = useState(() => { try { return JSON.parse(_lsGet("gc-bcg")||"null") || []; } catch (_) { return []; } });
  const [bcgForm, setBcgForm] = useState({nom:"",pdm:50,croissance:5,ca:0});
  const saveBcg = (d) => { setBcgItems(d); try{_lsSet("gc-bcg",JSON.stringify(d)); dsSave("gc-bcg",d).catch(()=>{});}catch (_) {} };

  const [tenM, setTenM] = useState(() => { try { return JSON.parse(_lsGet("gc-10m")||"null") || {
    M1:{score:0,notes:""},M2:{score:0,notes:""},M3:{score:0,notes:""},M4:{score:0,notes:""},
    M5:{score:0,notes:""},M6:{score:0,notes:""},M7:{score:0,notes:""},M8:{score:0,notes:""},
    M9:{score:0,notes:""},M10:{score:0,notes:""}
  }; } catch (_) { return {M1:{score:0,notes:""},M2:{score:0,notes:""},M3:{score:0,notes:""},M4:{score:0,notes:""},M5:{score:0,notes:""},M6:{score:0,notes:""},M7:{score:0,notes:""},M8:{score:0,notes:""},M9:{score:0,notes:""},M10:{score:0,notes:""}}; }});
  const saveTenM = (d) => { setTenM(d); try{_lsSet("gc-10m",JSON.stringify(d)); dsSave("gc-10m",d).catch(()=>{});}catch (_) {} };

  const [resources, setResources] = useState(() => { try { return JSON.parse(_lsGet("gc-resources")||"null") || {
    humaines:[],materielles:[],immatterielles:[],financieres:[],technologiques:[]
  }; } catch (_) { return {humaines:[],materielles:[],immatterielles:[],financieres:[],technologiques:[]}; }});
  const [resTab, setResTab] = useState("humaines");
  const [resForm, setResForm] = useState({nom:"",valeur:"",note:0,criticalite:"MOYENNE",description:""});
  const saveResources = (d) => { setResources(d); try{_lsSet("gc-resources",JSON.stringify(d)); dsSave("gc-resources",d).catch(()=>{});}catch (_) {} };

  const [porter, setPorter] = useState(() => { try { return JSON.parse(_lsGet("gc-porter")||"null") || {
    F1:{score:3,notes:""},F2:{score:3,notes:""},F3:{score:3,notes:""},F4:{score:3,notes:""},F5:{score:3,notes:""}
  }; } catch (_) { return {F1:{score:3,notes:""},F2:{score:3,notes:""},F3:{score:3,notes:""},F4:{score:3,notes:""},F5:{score:3,notes:""}}; }});
  const savePorter = (d) => { setPorter(d); try{_lsSet("gc-porter",JSON.stringify(d)); dsSave("gc-porter",d).catch(()=>{});}catch (_) {} };

  const [qqoqcp, setQqoqcp] = useState(() => { try { return JSON.parse(_lsGet("gc-qqoqcp")||"null") || {Q1:"",Q2:"",O:"",Q3:"",C:"",P:""}; } catch (_) { return {Q1:"",Q2:"",O:"",Q3:"",C:"",P:""}; }});
  const saveQqoqcp = (d) => { setQqoqcp(d); try{_lsSet("gc-qqoqcp",JSON.stringify(d)); dsSave("gc-qqoqcp",d).catch(()=>{});}catch (_) {} };

  const [vrio, setVrio] = useState(() => { try { return JSON.parse(_lsGet("gc-vrio")||"null") || []; } catch (_) { return []; } });
  const [vrioForm, setVrioForm] = useState({ressource:"",V:false,R:false,I:false,O:false});
  const saveVrio = (d) => { setVrio(d); try{_lsSet("gc-vrio",JSON.stringify(d)); dsSave("gc-vrio",d).catch(()=>{});}catch (_) {} };

  const [paretoItems, setParetoItems] = useState(() => { try { return JSON.parse(_lsGet("gc-pareto")||"null") || []; } catch (_) { return []; } });
  const [paretoForm, setParetoForm] = useState({cause:"",freq:0});
  const savePareto = (d) => { setParetoItems(d); try{_lsSet("gc-pareto",JSON.stringify(d)); dsSave("gc-pareto",d).catch(()=>{});}catch (_) {} };

  const PCA_DEFAULTS = {contexte:"",risques_majeurs:"",seuil_reprise:"",rto:"",rpo:"",equipe_crise:[],procedures:[]};
  const QQOQCP_DEFAULTS = {Q1:"",Q2:"",O:"",Q3:"",C:"",P:""};
  useRemoteSync({
    'gc-pdca': setPdca, 'gc-mckinsey': setMckinsey, 'gc-mc7s': setMc7s, 'gc-5m': setFiveM,
    'gc-5s': setFiveS,
    'gc-pca': (v) => setPca(v && typeof v === 'object' && !Array.isArray(v) ? {...PCA_DEFAULTS, ...v} : PCA_DEFAULTS),
    'gc-bcg': setBcgItems, 'gc-10m': setTenM, 'gc-resources': setResources, 'gc-porter': setPorter,
    'gc-qqoqcp': (v) => setQqoqcp(v && typeof v === 'object' && !Array.isArray(v) ? {...QQOQCP_DEFAULTS, ...v} : QQOQCP_DEFAULTS),
    'gc-vrio': setVrio, 'gc-pareto': setParetoItems,
  });

  const exportSwot = () => {
    const txt=`ANALYSE SWOT — GÉNIE CONSULTANT\n${new Date().toLocaleDateString("fr-FR")}\n\nFORCES (S)\n${swot.S}\n\nFAIBLESSES (W)\n${swot.W}\n\nOPPORTUNITÉS (O)\n${swot.O}\n\nMENACES (T)\n${swot.T}`;
    const b=new Blob([txt],{type:"text/plain;charset=utf-8;"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="swot_gc.txt";a.click();URL.revokeObjectURL(u);
  };

  // ── Fonctions de réinitialisation par outil ──────────────────────────────
  const resetSwot = async () => { if(!await gcConfirm("Réinitialiser l'analyse SWOT ?")) return; setSwot({S:"",W:"",O:"",T:""}); };
  const resetPestel = async () => { if(!await gcConfirm("Réinitialiser l'analyse PESTEL ?")) return; setPestel({P:"",E:"",S:"",T2:"",E2:"",L:""}); };
  const resetBcg = async () => { if(!await gcConfirm("Réinitialiser toutes les activités BCG ?")) return; saveBcg([]); };
  const resetPorter = async () => { if(!await gcConfirm("Réinitialiser l'analyse Porter 5 Forces ?")) return; savePorter({F1:{score:3,notes:""},F2:{score:3,notes:""},F3:{score:3,notes:""},F4:{score:3,notes:""},F5:{score:3,notes:""}}); };
  const resetVrio = async () => { if(!await gcConfirm("Réinitialiser l'analyse VRIO ?")) return; saveVrio([]); };
  const resetPdca = async () => { if(!await gcConfirm("Réinitialiser le cycle PDCA ?")) return; savePdca({plan:{objectif:"",actions:"",ressources:"",echeance:"",indicateurs:""},do:{responsable:"",avancement:0,notes:""},check:{resultats:"",ecarts:"",analyse:""},act:{ameliorations:"",standardisation:"",prochaine_cycle:""}}); };
  const resetPca = async () => { if(!await gcConfirm("Réinitialiser le Plan de Continuité d'Activité ?")) return; savePca({contexte:"",risques_majeurs:"",seuil_reprise:"",rto:"",rpo:"",equipe_crise:[],procedures:[]}); };
  const resetMckinsey = async () => { if(!await gcConfirm("Réinitialiser la matrice McKinsey 9 cases ?")) return; saveMckinsey(Array.from({length:9},(_,i)=>({id:i,label:"",desc:"",stars:0}))); };
  const resetQqoqcp = async () => { if(!await gcConfirm("Réinitialiser la grille QQOQCP ?")) return; saveQqoqcp({Q1:"",Q2:"",O:"",Q3:"",C:"",P:""}); };
  const resetPareto = async () => { if(!await gcConfirm("Réinitialiser l'analyse Pareto ?")) return; savePareto([]); };
  const resetFiveM = async () => { if(!await gcConfirm("Réinitialiser le diagramme 5M Ishikawa ?")) return; saveFiveM({probleme:"",M1:[],M2:[],M3:[],M4:[],M5:[]}); };
  const resetFiveS = async () => { if(!await gcConfirm("Réinitialiser le diagnostic 5S ?")) return; saveFiveS({S1:{score:0,notes:"",items:[]},S2:{score:0,notes:"",items:[]},S3:{score:0,notes:"",items:[]},S4:{score:0,notes:"",items:[]},S5:{score:0,notes:"",items:[]}}); };
  const RESET_MAP = {swot:resetSwot,pestel:resetPestel,bcg:resetBcg,porter:resetPorter,vrio:resetVrio,pdca:resetPdca,pca:resetPca,mckinsey:resetMckinsey,qqoqcp:resetQqoqcp,pareto:resetPareto,"5m":resetFiveM,"5s":resetFiveS};

  const printTool = (title, contentHtml) => {
    const w=window.open("","_blank");
    if(!w){gcAlert("Veuillez autoriser les fenêtres popup pour imprimer.");return;}
    w.document.write(`<html><head><title>${title} — Génie Consultant</title><style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}h1{color:#1e3a5f;font-size:17px;border-bottom:2px solid #1e3a5f;padding-bottom:8px}h2{color:#1e3a5f;font-size:13px;margin-top:16px}table{width:100%;border-collapse:collapse;margin:8px 0}th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left;font-size:11px}td{padding:5px 8px;border-bottom:1px solid #ddd;font-size:11px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0}.box{border:1px solid #ddd;border-radius:6px;padding:10px}.box-title{font-weight:bold;font-size:12px;margin-bottom:6px}.meta{color:#666;font-size:10px;margin-bottom:12px}@media print{body{padding:8px}}</style></head><body>
    <h1>${title}</h1><p class="meta">Génie Consultant · ${new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})} · ${currentUser?.name||""}</p>${contentHtml}</body></html>`);
    w.document.close(); setTimeout(()=>w.print(),400);
  };

  const exportToolCSV = (title, rows) => {
    const csv = rows.map(r=>r.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const b=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;
    a.download=`${title.replace(/\s+/g,"_")}_${new Date().toLocaleDateString("fr-FR").replace(/\//g,"-")}.csv`;a.click();URL.revokeObjectURL(u);
  };

  const generatePcaWithAI = async () => {
    if (!pca.contexte?.trim()) { gcAlert("Saisissez d'abord le contexte de votre activité."); return; }
    setPcaLoading(true);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},
        body: JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:1500,
          messages:[{role:"user",content:`Tu es un expert en gestion des risques et continuité d'activité pour un cabinet de conseil au Gabon.\n\nContexte : ${pca.contexte}\nRisques identifiés : ${pca.risques_majeurs||"Non renseignés"}\nRTO souhaité : ${pca.rto||"Non défini"}\nRPO souhaité : ${pca.rpo||"Non défini"}\n\nGénère un Plan de Continuité d'Activité (PCA) complet incluant :\n1. Analyse des risques critiques (liste numérotée)\n2. Scénarios de crise (3 scénarios)\n3. Procédures de reprise par fonction\n4. Équipe de crise (rôles et responsabilités)\n5. Critères de déclenchement\n6. Plan de communication de crise\n7. Délais de reprise réalistes\n8. Check-list de validation\n\nSois précis, pratique et adapté au contexte gabonais.`}]
        })
      });
      const data = await resp.json();
      const text = data.content?.map(c=>c.text||"").join("") || "";
      savePca({...pca, ai_result: text});
    } catch(e) { gcAlert("Erreur IA. Vérifiez votre connexion."); }
    setPcaLoading(false);
  };

  const PDCA_SECTIONS = [
    {key:"plan",label:"Plan",icon:"📋",color:"#3B82F6",desc:"Planifier — Définir les objectifs et les actions",
     fields:[{k:"objectif",l:"Objectif SMART"},{k:"actions",l:"Actions planifiées"},{k:"ressources",l:"Ressources nécessaires"},{k:"echeance",l:"Échéance"},{k:"indicateurs",l:"Indicateurs de succès"}]},
    {key:"do",label:"Do",icon:"⚙️",color:"#22C55E",desc:"Faire — Mettre en œuvre le plan",
     fields:[{k:"responsable",l:"Responsable exécution"},{k:"avancement",l:"Avancement (0-100%)"},{k:"notes",l:"Notes d'exécution"}]},
    {key:"check",label:"Check",icon:"🔍",color:"#F59E0B",desc:"Vérifier — Mesurer et analyser les résultats",
     fields:[{k:"resultats",l:"Résultats obtenus"},{k:"ecarts",l:"Écarts constatés"},{k:"analyse",l:"Analyse causale"}]},
    {key:"act",label:"Act",icon:"🚀",color:"#C41E3A",desc:"Agir — Standardiser ou corriger",
     fields:[{k:"ameliorations",l:"Améliorations identifiées"},{k:"standardisation",l:"Points à standardiser"},{k:"prochaine_cycle",l:"Plan du prochain cycle"}]},
  ];

  const MCKINSEY_LABELS = [
    ["Investir / Développer","Investir / Développer","Sélectionner / Investir"],
    ["Investir / Développer","Sélectivité / Rentabilité","Récolter / Désengager"],
    ["Protéger / Recentrer","Récolter / Désengager","Récolter / Désengager"]
  ];
  const MCKINSEY_COLORS = [["#22C55E","#22C55E","#3B82F6"],["#22C55E","#F59E0B","#EF4444"],["#3B82F6","#EF4444","#EF4444"]];

  const FIVEM_DEFS = [
    {key:"M1",label:"Matière",icon:"📦",color:"#3B82F6",desc:"Matières premières, informations, données"},
    {key:"M2",label:"Méthode",icon:"📋",color:"#22C55E",desc:"Procédures, processus, mode opératoire"},
    {key:"M3",label:"Main-d'œuvre",icon:"👥",color:"#A855F7",desc:"Personnel, compétences, formation"},
    {key:"M4",label:"Machine",icon:"⚙️",color:"#F59E0B",desc:"Équipements, outils, logiciels"},
    {key:"M5",label:"Milieu",icon:"🌍",color:"#EC4899",desc:"Environnement, cadre, facteurs externes"},
  ];

  const FIVES_DEFS = [
    {key:"S1",label:"Seiri — Trier",icon:"🗑️",color:"#EF4444",desc:"Éliminer ce qui est inutile",items:["Élimination des documents obsolètes","Suppression des fichiers inutiles","Tri des équipements non utilisés"]},
    {key:"S2",label:"Seiton — Ranger",icon:"🗂️",color:"#F59E0B",desc:"Une place pour chaque chose",items:["Classement alphabétique des dossiers","Organisation des fichiers numériques","Étiquetage des emplacements"]},
    {key:"S3",label:"Seiso — Nettoyer",icon:"🧹",color:"#22C55E",desc:"Maintenir l'espace de travail propre",items:["Nettoyage quotidien du poste","Maintenance préventive équipements","Contrôle régulier de l'espace"]},
    {key:"S4",label:"Seiketsu — Standardiser",icon:"📐",color:"#3B82F6",desc:"Standardiser les bonnes pratiques",items:["Procédures documentées","Checklists de contrôle","Normes définies et affichées"]},
    {key:"S5",label:"Shitsuke — Pérenniser",icon:"🏆",color:"#8B5CF6",desc:"Maintenir et améliorer",items:["Audits réguliers 5S","Formation continue équipe","Plans d'amélioration"]},
  ];

  return (
    <div>
      <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
        {[
          {id:"dashboard",label:"📊 Dashboard",group:"core"},
          {id:"canvas",label:"🖼️ Business Canvas",group:"strategique"},
          {id:"benchmark",label:"📏 Benchmarking",group:"strategique"},
          {id:"ansoff",label:"🚀 Ansoff",group:"strategique"},
          {id:"swot",label:"⚖️ SWOT",group:"strategique"},
          {id:"pestel",label:"🌍 PESTEL",group:"strategique"},
          {id:"bcg",label:"📈 BCG",group:"strategique"},
          {id:"porter",label:"🏭 Porter 5F",group:"strategique"},
          {id:"vrio",label:"💎 VRIO",group:"strategique"},
          {id:"mckinsey",label:"🔲 McKinsey 9",group:"strategique"},
          {id:"competitivite",label:"🎯 Compétitivité",group:"strategique"},
          {id:"marche",label:"📊 Étude de Marché",group:"strategique"},
          {id:"pdca",label:"🔄 PDCA",group:"amelioration"},
          {id:"5m",label:"🦴 5M Ishikawa",group:"amelioration"},
          {id:"5s",label:"✅ 5S",group:"amelioration"},
          {id:"pareto",label:"📊 Pareto 80/20",group:"amelioration"},
          {id:"qqoqcp",label:"❓ QQOQCP",group:"amelioration"},
          {id:"amelio_continu",label:"🔁 Amélioration Continue",group:"amelioration"},
          {id:"10m",label:"🐢 10M Crosby",group:"qualite"},
          {id:"pca",label:"🔐 PCA/Risques",group:"qualite"},
          {id:"resources",label:"🗃️ Ressources",group:"evaluation"},
          {id:"bsc",label:"🎯 BSC",group:"evaluation"},
          {id:"rh_conseil",label:"👥 RH & Avis",group:"evaluation"},
        ].map(t=>{
          const grpColor={core:"#0EA5E9",strategique:"#A855F7",amelioration:"#22C55E",qualite:"#F59E0B",evaluation:"#EC4899"}[t.group]||"#0EA5E9";
          return <button key={t.id} onClick={()=>setTool(t.id)} style={{background:tool===t.id?grpColor:"transparent",border:`1px solid ${tool===t.id?grpColor:T.border}`,color:tool===t.id?"#fff":T.textMuted,borderRadius:7,padding:"6px 11px",cursor:"pointer",fontWeight:tool===t.id?700:400,fontSize:10,whiteSpace:"nowrap"}}>{t.label}</button>;
        })}
      </div>
      {/* Bouton Réinitialiser visible pour les outils internes (sans session propre) */}
      {RESET_MAP[tool] && (
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
          <button onClick={RESET_MAP[tool]}
            style={{background:"#EF444412",border:"1px solid #EF444430",color:"#EF4444",borderRadius:7,padding:"4px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>
            ↺ Réinitialiser {tool.toUpperCase()}
          </button>
        </div>
      )}

      {tool==="dashboard" && (() => {
        const hasSwot = Object.values(swot).some(v=>v?.trim());
        const hasPestel = Object.values(pestel).some(v=>v?.trim());
        const pdcaAvancement = pdca?.do?.avancement || 0;
        const hasPca = pca.contexte?.trim();
        const hasBcg = bcgItems.length>0;
        const hasPorter = Object.values(porter).some(f=>f.notes?.trim());
        const hasVrio = vrio.length>0;
        const hasResources = Object.values(resources).some(r=>r.length>0);
        const outils = [
          {id:"swot",label:"Analyse SWOT",desc:"Forces/Faiblesses/Opportunités/Menaces",color:"#22C55E",icon:"⚖️",done:hasSwot,group:"Stratégique"},
          {id:"pestel",label:"Analyse PESTEL",desc:"Macro-environnement stratégique",color:"#8B5CF6",icon:"🌍",done:hasPestel,group:"Stratégique"},
          {id:"bcg",label:"Matrice BCG",desc:"Portefeuille Produits/UAS",color:"#EC4899",icon:"📈",done:hasBcg,group:"Stratégique"},
          {id:"porter",label:"Porter 5 Forces",desc:"Attractivité du secteur",color:"#F97316",icon:"🏭",done:hasPorter,group:"Stratégique"},
          {id:"vrio",label:"Analyse VRIO",desc:"Avantage concurrentiel durable",color:"#14B8A6",icon:"💎",done:hasVrio,group:"Stratégique"},
          {id:"canvas",label:"Business Model Canvas",desc:"Modélisation de proposition de valeur",color:"#0EA5E9",icon:"🖼️",done:!!_lsGet(`gc-canvas-${currentUser.id}`)&&Object.values(JSON.parse(_lsGet(`gc-canvas-${currentUser.id}`)||"{}")).some(v=>v?.trim?.()),group:"Stratégique"},
          {id:"benchmark",label:"Benchmarking",desc:"Analyse concurrentielle comparative",color:"#3B82F6",icon:"📏",done:!!_lsGet(`gc-benchmark-${currentUser.id}`),group:"Stratégique"},
          {id:"ansoff",label:"Matrice Ansoff",desc:"Stratégies de croissance",color:"#C41E3A",icon:"🚀",done:!!_lsGet(`gc-ansoff-${currentUser.id}`)&&Object.values(JSON.parse(_lsGet(`gc-ansoff-${currentUser.id}`)||"{}")).some(v=>v?.trim?.()),group:"Stratégique"},
          {id:"mckinsey",label:"McKinsey 9 cases",desc:"Portefeuille d'activités",color:"#A855F7",icon:"🔲",done:false,group:"Stratégique"},
          {id:"pdca",label:"Cycle PDCA",desc:`Amélioration continue — ${pdcaAvancement}%`,color:"#3B82F6",icon:"🔄",done:pdcaAvancement>0,group:"Amélioration"},
          {id:"5m",label:"Diagramme 5M",desc:"Ishikawa — Causes & effets",color:"#F59E0B",icon:"🦴",done:fiveM.probleme?.trim()?.length>0,group:"Amélioration"},
          {id:"5s",label:"Méthode 5S",desc:"Organisation & performance",color:"#06B6D4",icon:"✅",done:false,group:"Amélioration"},
          {id:"pareto",label:"Pareto 80/20",desc:"Causes critiques vs triviales",color:"#EAB308",icon:"📊",done:paretoItems.length>0,group:"Amélioration"},
          {id:"qqoqcp",label:"QQOQCP",desc:"Analyse structurée de problème",color:"#84CC16",icon:"❓",done:Object.values(qqoqcp).some(v=>v?.trim()),group:"Amélioration"},
          {id:"10m",label:"10M Crosby",desc:"Tortue Crosby — Qualité totale",color:"#10B981",icon:"🐢",done:Object.values(tenM).some(m=>m.score>0),group:"Qualité"},
          {id:"resources",label:"Ressources",desc:"Évaluation complète des ressources",color:"#0EA5E9",icon:"🗃️",done:hasResources,group:"Évaluation"},
          {id:"bsc",label:"Balanced Scorecard",desc:"Indicateurs stratégiques 4 axes",color:"#EC4899",icon:"🎯",done:false,group:"Évaluation"},
          {id:"pca",label:"Plan de Continuité",desc:"PCA — Résilience & risques",color:"#EF4444",icon:"🔐",done:!!hasPca,group:"Qualité"},
        ];
        const completedTools = outils.filter(o=>o.done).length;
        return (
          <div>
            {/* Progression globale */}
            <div style={{background:`linear-gradient(135deg,#0EA5E922,${T.surface2})`,border:"1px solid #0EA5E933",borderRadius:14,padding:"16px 18px",marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{color:T.text,fontWeight:900,fontSize:14}}>🎯 Tableau de Bord Stratégique</div>
                  <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>Outils d'analyse — Cabinet Génie Consultant</div>
                </div>
                <div style={{textAlign:"center",background:"#0EA5E922",border:"1px solid #0EA5E944",borderRadius:10,padding:"8px 16px"}}>
                  <div style={{color:"#0EA5E9",fontWeight:900,fontSize:22,lineHeight:1}}>{completedTools}<span style={{fontSize:12,color:T.textMuted}}>/{outils.length}</span></div>
                  <div style={{color:T.textDim,fontSize:9,marginTop:2}}>Outils complétés</div>
                </div>
              </div>
              <div style={{background:T.surface3,borderRadius:99,height:8,overflow:"hidden"}}>
                <div style={{width:`${Math.round((completedTools/outils.length)*100)}%`,height:"100%",background:"linear-gradient(90deg,#0EA5E9,#38BDF8)",borderRadius:99,transition:"width 1s"}} />
              </div>
              <div style={{color:"#0EA5E9",fontSize:10,textAlign:"right",marginTop:4,fontWeight:700}}>{Math.round((completedTools/outils.length)*100)}% des outils utilisés</div>
            </div>
            {/* KPI Cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
              {[
                {label:"SWOT",v:hasSwot?"Complété":"En attente",color:hasSwot?"#22C55E":"#7A90B0",icon:"📊",action:"swot"},
                {label:"PESTEL",v:hasPestel?"Complété":"En attente",color:hasPestel?"#8B5CF6":"#7A90B0",icon:"🌍",action:"pestel"},
                {label:"PDCA",v:`${pdcaAvancement}%`,color:pdcaAvancement>70?"#22C55E":pdcaAvancement>30?"#F59E0B":"#7A90B0",icon:"🔄",action:"pdca"},
                {label:"PCA",v:hasPca?"Initialisé":"Non démarré",color:hasPca?"#EF4444":"#7A90B0",icon:"🔐",action:"pca"},
              ].map(kpi=>(
                <div key={kpi.label} className="gc-hover-card" style={{background:T.surface2,border:`2px solid ${kpi.color}33`,borderRadius:12,padding:"14px 12px",cursor:"pointer"}} onClick={()=>setTool(kpi.action)}>
                  <div style={{fontSize:22,marginBottom:6}}>{kpi.icon}</div>
                  <div style={{color:kpi.color,fontWeight:800,fontSize:14,lineHeight:1}}>{kpi.v}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:4,fontWeight:600}}>{kpi.label}</div>
                </div>
              ))}
            </div>
            {/* Grille outils */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:14}}>
              {outils.map(o=>(
                <div key={o.id} className="gc-hover-card" style={{background:T.surface2,border:`1.5px solid ${o.done?o.color+"55":T.border}`,borderRadius:12,padding:"14px",cursor:"pointer",opacity:o.done?1:0.85}} onClick={()=>setTool(o.id)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <span style={{fontSize:22}}>{o.icon}</span>
                    <span style={{background:o.done?"#22C55E22":"transparent",border:`1px solid ${o.done?"#22C55E33":"transparent"}`,color:o.done?"#22C55E":T.textDim,borderRadius:5,padding:"2px 6px",fontSize:8,fontWeight:700}}>{o.done?"✓ Fait":"À faire"}</span>
                  </div>
                  <div style={{color:T.text,fontWeight:800,fontSize:12,marginBottom:3}}>{o.label}</div>
                  <div style={{color:T.textDim,fontSize:9,lineHeight:1.4}}>{o.desc}</div>
                  <div style={{marginTop:8,color:o.color,fontSize:9,fontWeight:700}}>Ouvrir →</div>
                </div>
              ))}
            </div>
            {/* Actions IA */}
            <div style={{background:T.surface2,border:"1px solid #0EA5E933",borderRadius:12,padding:14}}>
              <div style={{color:"#0EA5E9",fontWeight:800,fontSize:12,marginBottom:10}}>✨ Analyses IA Recommandées</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {label:"Diagnostic stratégique global",prompt:"Effectue un diagnostic stratégique complet pour le cabinet Génie Consultant (conseil, juridique, audit à Libreville, Gabon). Inclure: positionnement, forces clés, risques, opportunités OHADA/Gabon, recommandations prioritaires."},
                  {label:"Plan stratégique 3 ans",prompt:"Génère un plan stratégique 3 ans (2026-2028) pour Génie Consultant, cabinet de conseil au Gabon. Inclure: axes stratégiques, objectifs SMART, KPIs, initiatives prioritaires, ressources nécessaires."},
                  {label:"Tableau de bord BSC",prompt:"Crée un Balanced Scorecard (BSC) complet pour Génie Consultant avec 4 perspectives (Finance, Clients, Processus, Apprentissage). Propose des indicateurs mesurables adaptés au contexte gabonais."},
                ].map(a=>(
                  <button key={a.label} onClick={()=>window.gcAIAsk&&window.gcAIAsk(a.prompt)}
                    style={{background:"#0EA5E915",border:"1px solid #0EA5E933",borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"left"}}>
                    <div style={{color:"#0EA5E9",fontWeight:700,fontSize:11,marginBottom:3}}>✨ {a.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {tool==="swot" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[{k:"S",label:"💪 Forces (Strengths)",color:"#22C55E"},{k:"W",label:"⚠️ Faiblesses (Weaknesses)",color:"#F59E0B"},{k:"O",label:"🚀 Opportunités (Opportunities)",color:"#3B82F6"},{k:"T",label:"🔥 Menaces (Threats)",color:"#EF4444"}].map(q=>(
              <div key={q.k} style={{background:T.surface2,border:`2px solid ${q.color}33`,borderRadius:12,padding:"14px"}}>
                <div style={{color:q.color,fontWeight:800,fontSize:12,marginBottom:8}}>{q.label}</div>
                <textarea value={swot[q.k]} onChange={e=>setSwot(s=>({...s,[q.k]:e.target.value}))} rows={5} placeholder={`Listez les ${q.label.split(" ")[0].toLowerCase()}…`} style={{width:"100%",background:"transparent",border:`1px solid ${q.color}33`,borderRadius:7,padding:"8px",color:T.text,fontSize:11,resize:"none",boxSizing:"border-box"}} />
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:10,justifyContent:"flex-end"}}>
            <button onClick={()=>printTool("Analyse SWOT",`<div class="grid2">${[{k:"S",l:"Forces",c:"#22C55E"},{k:"W",l:"Faiblesses",c:"#F59E0B"},{k:"O",l:"Opportunités",c:"#3B82F6"},{k:"T",l:"Menaces",c:"#EF4444"}].map(q=>`<div class="box"><div class="box-title" style="color:${q.c}">${q.l}</div><div>${swot[q.k]||"—"}</div></div>`).join("")}</div>`)}
              style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>🖨️ Imprimer</button>
            <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Analyse cette matrice SWOT et donne des recommandations stratégiques pour un cabinet de conseil au Gabon :\nForces: ${swot.S}\nFaiblesses: ${swot.W}\nOpportunités: ${swot.O}\nMenaces: ${swot.T}\n\nPropose des axes stratégiques, priorités et plan d'action.`)}
              style={{background:"#0EA5E922",border:"1px solid #0EA5E944",color:"#0EA5E9",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✨ Analyser avec IA</button>
            <button onClick={exportSwot} style={{background:"#0EA5E9",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>⬇ Exporter SWOT</button>
          </div>
        </div>
      )}

      {tool==="pestel" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[{k:"P",label:"🏛️ Politique",color:"#8B5CF6"},{k:"E",label:"💹 Économique",color:"#22C55E"},{k:"S",label:"👥 Social",color:"#3B82F6"},{k:"T2",label:"⚙️ Technologique",color:"#06B6D4"},{k:"E2",label:"🌿 Environnemental",color:"#10B981"},{k:"L",label:"⚖️ Légal",color:"#DC2626"}].map(q=>(
              <div key={q.k} style={{background:T.surface2,border:`2px solid ${q.color}33`,borderRadius:12,padding:"12px"}}>
                <div style={{color:q.color,fontWeight:800,fontSize:11,marginBottom:6}}>{q.label}</div>
                <textarea value={pestel[q.k]} onChange={e=>setPestel(s=>({...s,[q.k]:e.target.value}))} rows={4} placeholder="Facteurs…" style={{width:"100%",background:"transparent",border:`1px solid ${q.color}22`,borderRadius:6,padding:"6px",color:T.text,fontSize:10,resize:"none",boxSizing:"border-box"}} />
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginTop:10}}>
            <button onClick={()=>printTool("Analyse PESTEL",`<div class="grid2">${[{k:"P",l:"Politique",c:"#8B5CF6"},{k:"E",l:"Économique",c:"#22C55E"},{k:"S",l:"Social",c:"#3B82F6"},{k:"T2",l:"Technologique",c:"#06B6D4"},{k:"E2",l:"Environnemental",c:"#10B981"},{k:"L",l:"Légal",c:"#DC2626"}].map(q=>`<div class="box"><div class="box-title" style="color:${q.c}">${q.l}</div><div>${pestel[q.k]||"—"}</div></div>`).join("")}</div>`)}
              style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>🖨️ Imprimer</button>
            <button onClick={()=>exportToolCSV("PESTEL",[["Facteur","Contenu"],["Politique",pestel.P],["Économique",pestel.E],["Social",pestel.S],["Technologique",pestel.T2],["Environnemental",pestel.E2],["Légal",pestel.L]])}
              style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>📥 CSV</button>
            <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Analyse cette matrice PESTEL et fournis une synthèse stratégique pour un cabinet de conseil juridique et d'audit au Gabon :\nP: ${pestel.P}\nE: ${pestel.E}\nS: ${pestel.S}\nT: ${pestel.T2}\nE: ${pestel.E2}\nL: ${pestel.L}`)}
              style={{background:"#8B5CF622",border:"1px solid #8B5CF644",color:"#8B5CF6",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✨ Synthèse IA</button>
          </div>
        </div>
      )}

      {tool==="pdca" && (
        <div>
          <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:11,color:T.text}}>🔄 <strong>Roue de Deming / Cycle PDCA</strong> — Amélioration continue des processus</div>
            <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Sur base de ce cycle PDCA, génère un rapport d'amélioration continue :\nPLAN: Objectif: ${pdca.plan.objectif} | Actions: ${pdca.plan.actions}\nDO: Responsable: ${pdca.do.responsable} | Avancement: ${pdca.do.avancement}%\nCHECK: Résultats: ${pdca.check.resultats} | Écarts: ${pdca.check.ecarts}\nACT: Améliorations: ${pdca.act.ameliorations}\n\nAnalyse et recommande les prochaines étapes.`)}
              style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>✨ Rapport IA</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {PDCA_SECTIONS.map(sec=>(
              <div key={sec.key} style={{background:T.surface2,border:`2px solid ${sec.color}44`,borderRadius:12,padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{background:sec.color+"22",width:36,height:36,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{sec.icon}</div>
                  <div>
                    <div style={{color:sec.color,fontWeight:900,fontSize:16,lineHeight:1}}>{sec.label}</div>
                    <div style={{color:T.textDim,fontSize:9}}>{sec.desc}</div>
                  </div>
                </div>
                {sec.fields.map(field=>(
                  <div key={field.k} style={{marginBottom:8}}>
                    <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:600}}>{field.l}</label>
                    {field.k==="avancement" ? (
                      <div>
                        <input type="range" min={0} max={100} value={pdca[sec.key][field.k]||0}
                          onChange={e=>{const n={...pdca,[sec.key]:{...pdca[sec.key],[field.k]:Number(e.target.value)}};savePdca(n);}}
                          style={{width:"100%",accentColor:sec.color}} />
                        <div style={{textAlign:"right",color:sec.color,fontWeight:700,fontSize:12}}>{pdca[sec.key][field.k]||0}%</div>
                      </div>
                    ) : (
                      <textarea rows={2} value={pdca[sec.key][field.k]||""} onChange={e=>{const n={...pdca,[sec.key]:{...pdca[sec.key],[field.k]:e.target.value}};savePdca(n);}}
                        placeholder={`${field.l}…`} style={{width:"100%",background:T.surface3,border:`1px solid ${sec.color}33`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:10,resize:"none",boxSizing:"border-box"}} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{marginTop:14,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}}>
            <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:8}}>📊 Progression globale du cycle PDCA</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {PDCA_SECTIONS.map(sec=>{
                const fields=sec.fields.filter(f=>f.k!=="avancement");
                const filled=fields.filter(f=>(pdca[sec.key][f.k]||"").trim().length>0).length;
                const pct=Math.round((filled/fields.length)*100);
                return <div key={sec.key} style={{textAlign:"center"}}>
                  <div style={{color:sec.color,fontWeight:800,fontSize:14}}>{sec.label}</div>
                  <div style={{background:T.surface3,borderRadius:99,height:6,overflow:"hidden",margin:"4px 0"}}>
                    <div style={{width:`${pct}%`,background:sec.color,height:"100%",borderRadius:99,transition:"width 0.5s"}} />
                  </div>
                  <div style={{color:T.textMuted,fontSize:10}}>{pct}%</div>
                </div>;
              })}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginTop:12}}>
              <button onClick={()=>printTool("Cycle PDCA",`<table><thead><tr><th>Phase</th><th>Contenu</th></tr></thead><tbody><tr><td>📋 Plan — Objectif</td><td>${pdca.plan?.objectif||"—"}</td></tr><tr><td>Plan — Actions</td><td>${pdca.plan?.actions||"—"}</td></tr><tr><td>Plan — Ressources</td><td>${pdca.plan?.ressources||"—"}</td></tr><tr><td>⚙️ Do — Responsable</td><td>${pdca.do?.responsable||"—"}</td></tr><tr><td>Do — Avancement</td><td>${pdca.do?.avancement||0}%</td></tr><tr><td>🔍 Check — Résultats</td><td>${pdca.check?.resultats||"—"}</td></tr><tr><td>Check — Écarts</td><td>${pdca.check?.ecarts||"—"}</td></tr><tr><td>🔁 Act — Améliorations</td><td>${pdca.act?.ameliorations||"—"}</td></tr></tbody></table>`)}
                style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>🖨️ Imprimer PDCA</button>
            </div>
          </div>
        </div>
      )}

      {tool==="mckinsey" && (
        <div>
          <div style={{background:"#A855F715",border:"1px solid #A855F733",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:11,color:T.text}}>📊 <strong>Outils McKinsey</strong> — Matrice 9 cases (portefeuille) + 7S (organisation)</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setMc7sTab("grid")} style={{background:mc7sTab==="grid"?"#A855F7":"transparent",border:"1px solid #A855F744",color:mc7sTab==="grid"?"#fff":"#A855F7",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>🔲 Matrice 9</button>
              <button onClick={()=>setMc7sTab("7s")} style={{background:mc7sTab==="7s"?"#A855F7":"transparent",border:"1px solid #A855F744",color:mc7sTab==="7s"?"#fff":"#A855F7",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>🌐 7S McKinsey</button>
              <button onClick={()=>window.gcAIAsk&&window.gcAIAsk("Explique comment utiliser la matrice McKinsey 9 cases et le modèle 7S pour un cabinet de conseil au Gabon. Donne des exemples de placement et de recommandations stratégiques.")}
                style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>✨ Guide IA</button>
            </div>
          </div>

          {/* ── MATRICE 9 CASES ── */}
          {mc7sTab==="grid" && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:2,marginBottom:14}}>
                {[0,1,2].map(row=>[0,1,2].map(col=>{
                  const idx=row*3+col; const item=mckinsey[idx];
                  return (
                    <div key={idx} style={{background:MCKINSEY_COLORS[row][col]+"22",border:`2px solid ${MCKINSEY_COLORS[row][col]}44`,borderRadius:8,padding:"12px",minHeight:120}}>
                      <div style={{color:MCKINSEY_COLORS[row][col],fontSize:9,fontWeight:700,marginBottom:4,opacity:0.7}}>{MCKINSEY_LABELS[row][col]}</div>
                      <input value={item.label} onChange={e=>{const m=[...mckinsey];m[idx]={...m[idx],label:e.target.value};saveMckinsey(m);}}
                        placeholder="Activité / SBU…" style={{width:"100%",background:"transparent",border:"none",borderBottom:`1px solid ${MCKINSEY_COLORS[row][col]}44`,color:T.text,fontSize:11,fontWeight:700,padding:"3px 0",marginBottom:4,boxSizing:"border-box"}} />
                      <textarea value={item.desc} onChange={e=>{const m=[...mckinsey];m[idx]={...m[idx],desc:e.target.value};saveMckinsey(m);}}
                        placeholder="Description, part de marché…" rows={2} style={{width:"100%",background:"transparent",border:"none",color:T.textMuted,fontSize:9,resize:"none",boxSizing:"border-box"}} />
                    </div>
                  );
                }))}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:10}}>
                <div style={{color:T.textMuted}}>↑ Attractivité du secteur ↑</div>
                <div style={{color:T.textDim,marginLeft:"auto"}}>→ Atouts concurrentiels →</div>
              </div>
            </>
          )}

          {/* ── 7S MCKINSEY ── */}
          {mc7sTab==="7s" && (
            <div>
              <div style={{background:"#A855F711",border:"1px solid #A855F733",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:11,color:T.textMuted}}>
                🌐 Le modèle <strong style={{color:T.text}}>7S de McKinsey</strong> analyse 7 facteurs interdépendants de l'organisation : 3 facteurs durs (Strategy, Structure, Systems) et 4 facteurs mous (Shared Values, Style, Staff, Skills).
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {k:"strategy",      label:"Strategy — Stratégie",      icon:"🎯", color:"#3B82F6", desc:"Vision, objectifs à long terme, avantage concurrentiel",      hard:true},
                  {k:"structure",     label:"Structure — Organisation",   icon:"🏗️", color:"#6366F1", desc:"Hiérarchie, répartition des pouvoirs, organigramme",          hard:true},
                  {k:"systems",       label:"Systems — Systèmes",         icon:"⚙️", color:"#8B5CF6", desc:"Processus opérationnels, SI, flux d'information",             hard:true},
                  {k:"shared_values", label:"Shared Values — Valeurs",    icon:"💎", color:"#C41E3A", desc:"Culture d'entreprise, valeurs fondatrices, mission",          hard:false},
                  {k:"style",         label:"Style — Leadership",         icon:"👔", color:"#F59E0B", desc:"Mode de management, comportements des dirigeants",            hard:false},
                  {k:"staff",         label:"Staff — Personnel",          icon:"👥", color:"#22C55E", desc:"Profils, effectifs, politique RH, recrutement",              hard:false},
                  {k:"skills",        label:"Skills — Compétences",       icon:"🧠", color:"#06B6D4", desc:"Savoir-faire clés, expertises, capacités distinctives",      hard:false},
                ].map(item=>{
                  const val=mc7s[item.k]||{score:0,notes:"",actions:""};
                  const pct=(val.score||0)*20;
                  const c=pct>=80?"#22C55E":pct>=60?"#3B82F6":pct>=40?"#F59E0B":"#EF4444";
                  return (
                    <div key={item.k} style={{background:T.surface2,border:`1.5px solid ${item.color}33`,borderRadius:12,padding:14}}>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:20}}>{item.icon}</span>
                        <div style={{flex:1}}>
                          <div style={{color:item.color,fontWeight:800,fontSize:12}}>{item.label}</div>
                          <div style={{color:T.textDim,fontSize:9}}>{item.desc}</div>
                        </div>
                        <div style={{textAlign:"center",flexShrink:0}}>
                          <span style={{background:item.hard?"#3B82F622":"#EC489922",color:item.hard?"#3B82F6":"#EC4899",borderRadius:4,padding:"1px 6px",fontSize:8,fontWeight:700}}>{item.hard?"DUR":"MOU"}</span>
                          <div style={{color:c,fontWeight:900,fontSize:15,marginTop:2}}>{val.score||0}/5</div>
                        </div>
                      </div>
                      {/* Score 0-5 */}
                      <div style={{display:"flex",gap:3,marginBottom:8}}>
                        {[0,1,2,3,4,5].map(n=>(
                          <button key={n} onClick={()=>saveMc7s({...mc7s,[item.k]:{...val,score:n}})}
                            style={{flex:1,background:val.score>=n&&n>0?item.color:"transparent",border:`1px solid ${val.score>=n&&n>0?item.color:T.border}`,borderRadius:4,padding:"4px 0",cursor:"pointer",color:val.score>=n&&n>0?"#fff":T.textDim,fontSize:9,fontWeight:700}}>{n}</button>
                        ))}
                      </div>
                      {/* Barre de progression */}
                      <div style={{height:4,background:T.surface3,borderRadius:2,marginBottom:8,overflow:"hidden"}}>
                        <div style={{width:pct+"%",height:"100%",background:c,borderRadius:2,transition:"width 0.5s"}}/>
                      </div>
                      <textarea value={val.notes||""} onChange={e=>saveMc7s({...mc7s,[item.k]:{...val,notes:e.target.value}})}
                        placeholder="Diagnostic / observations…" rows={2}
                        style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:9,resize:"none",boxSizing:"border-box",marginBottom:6}} />
                      <textarea value={val.actions||""} onChange={e=>saveMc7s({...mc7s,[item.k]:{...val,actions:e.target.value}})}
                        placeholder="Actions d'amélioration proposées…" rows={2}
                        style={{width:"100%",background:T.surface3,border:`1px solid ${item.color}33`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:9,resize:"none",boxSizing:"border-box"}} />
                    </div>
                  );
                })}
              </div>
              {/* Score global 7S */}
              <div style={{marginTop:12,background:T.surface2,border:"1px solid #A855F733",borderRadius:10,padding:12}}>
                <div style={{color:"#A855F7",fontWeight:800,fontSize:11,marginBottom:8}}>🌐 Alignement organisationnel global (7S)</div>
                {(()=>{
                  const scores=Object.values(mc7s).map(v=>v.score||0);
                  const avg=Math.round(scores.reduce((a,b)=>a+b,0)/7*10)/10;
                  const c=avg>=4?"#22C55E":avg>=3?"#3B82F6":avg>=2?"#F59E0B":"#EF4444";
                  const niveau=avg>=4?"Organisation Alignée ✅":avg>=3?"Alignement Partiel 📈":avg>=2?"Tensions Organisationnelles ⚠️":"Désalignement Critique ❌";
                  return (
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <div style={{flex:1,height:10,background:T.surface3,borderRadius:5,overflow:"hidden"}}>
                        <div style={{width:(avg/5*100)+"%",height:"100%",background:c,borderRadius:5,transition:"width 0.8s"}}/>
                      </div>
                      <span style={{color:c,fontWeight:900,fontSize:14,flexShrink:0}}>{avg}/5</span>
                      <span style={{color:c,fontSize:11}}>{niveau}</span>
                    </div>
                  );
                })()}
                <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Analyse ce diagnostic McKinsey 7S pour un cabinet de conseil gabonais et fournis des recommandations d'alignement organisationnel :\n${Object.entries({Strategy:"strategy",Structure:"structure",Systems:"systems","Shared Values":"shared_values",Style:"style",Staff:"staff",Skills:"skills"}).map(([l,k])=>`${l}: ${mc7s[k]?.score||0}/5 — ${mc7s[k]?.notes||"Non renseigné"}`).join("\n")}\n\nPriorise les actions et donne un plan de transformation organisationnelle sur 6 mois.`)}
                  style={{marginTop:10,width:"100%",background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                  ✨ Analyse IA — Recommandations d'alignement 7S
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tool==="5m" && (
        <div>
          <div style={{background:"#F59E0B15",border:"1px solid #F59E0B33",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
            <div style={{color:T.text,fontSize:11}}>🦴 <strong>Diagramme d'Ishikawa — Méthode 5M</strong> — Analyse causale des problèmes</div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,fontWeight:700}}>🎯 Problème / Effet à analyser</label>
            <input value={fiveM.probleme} onChange={e=>saveFiveM({...fiveM,probleme:e.target.value})}
              placeholder="Décrivez le problème à analyser (ex: Retard dans la remise des rapports d'audit)…"
              style={{width:"100%",background:T.surface2,border:`2px solid #F59E0B44`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:13,fontWeight:700,boxSizing:"border-box"}} />
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {FIVEM_DEFS.map(m=>(
              <div key={m.key} style={{background:T.surface2,border:`2px solid ${m.color}33`,borderRadius:12,padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:18}}>{m.icon}</span>
                  <div>
                    <div style={{color:m.color,fontWeight:800,fontSize:12}}>{m.label}</div>
                    <div style={{color:T.textDim,fontSize:9}}>{m.desc}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,marginBottom:6}}>
                  <input value={fiveMInput[m.key]} onChange={e=>setFiveMInput(fi=>({...fi,[m.key]:e.target.value}))}
                    placeholder={`Cause liée à ${m.label.toLowerCase()}…`} onKeyDown={e=>{if(e.key==="Enter"&&fiveMInput[m.key].trim()){const n={...fiveM,[m.key]:[...fiveM[m.key],fiveMInput[m.key].trim()]};saveFiveM(n);setFiveMInput(fi=>({...fi,[m.key]:""}));}}}
                    style={{flex:1,background:T.surface3,border:`1px solid ${m.color}33`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:10,boxSizing:"border-box"}} />
                  <button onClick={() => {if(!fiveMInput[m.key].trim())return;const n={...fiveM,[m.key]:[...fiveM[m.key],fiveMInput[m.key].trim()]};saveFiveM(n);setFiveMInput(fi=>({...fi,[m.key]:""}));}}
                    style={{background:m.color,border:"none",color:"#fff",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontWeight:700,fontSize:11}}>+</button>
                </div>
                {fiveM[m.key].map((c,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,background:m.color+"11",borderRadius:5,padding:"4px 8px",marginBottom:3}}>
                    <span style={{color:m.color,fontSize:10}}>→</span>
                    <span style={{flex:1,color:T.text,fontSize:10}}>{c}</span>
                    <button onClick={() => {const n={...fiveM,[m.key]:fiveM[m.key].filter((_,j)=>j!==i)};saveFiveM(n);}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10}}>×</button>
                  </div>
                ))}
                {fiveM[m.key].length===0&&<div style={{color:T.textDim,fontSize:10,textAlign:"center",padding:4}}>Aucune cause identifiée</div>}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>window.gcAIAsk&&window.gcAIAsk(`Analyse ce diagramme d'Ishikawa (5M) et propose des solutions :\nProblème: ${fiveM.probleme}\n\nMatière: ${fiveM.M1.join(", ")}\nMéthode: ${fiveM.M2.join(", ")}\nMain-d'œuvre: ${fiveM.M3.join(", ")}\nMachine: ${fiveM.M4.join(", ")}\nMilieu: ${fiveM.M5.join(", ")}\n\nIdentifie les causes racines les plus critiques et propose un plan d'actions correctrices prioritaires.`)}
              style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✨ Analyse causale IA</button>
          </div>
        </div>
      )}

      {tool==="5s" && (
        <div>
          <div style={{background:"#10B98115",border:"1px solid #10B98133",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:11,color:T.text}}>✅ <strong>Méthode 5S</strong> — Organisation et amélioration du lieu de travail</div>
            <div style={{color:"#10B981",fontWeight:800,fontSize:13}}>
              Score global : {Math.round(FIVES_DEFS.reduce((a,d)=>a+(fiveS[d.key]?.score||0),0)/FIVES_DEFS.length*20)}%
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {FIVES_DEFS.map(s=>{
              const data=fiveS[s.key]||{score:0,notes:"",items:[]};
              return (
                <div key={s.key} style={{background:T.surface2,border:`2px solid ${s.color}33`,borderRadius:12,padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{fontSize:22}}>{s.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{color:s.color,fontWeight:800,fontSize:12}}>{s.label}</div>
                      <div style={{color:T.textDim,fontSize:10}}>{s.desc}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:s.color,fontWeight:900,fontSize:18}}>{data.score}/5</div>
                      <input type="range" min={0} max={5} value={data.score} onChange={e=>saveFiveS({...fiveS,[s.key]:{...data,score:Number(e.target.value)}})} style={{width:80,accentColor:s.color}} />
                    </div>
                  </div>
                  <div style={{background:s.color+"11",borderRadius:8,height:6,overflow:"hidden",marginBottom:10}}>
                    <div style={{width:`${data.score*20}%`,background:s.color,height:"100%",borderRadius:8,transition:"width 0.4s"}} />
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>
                      <div style={{color:T.textMuted,fontSize:10,fontWeight:700,marginBottom:4}}>Points de vérification</div>
                      {s.items.map((item,i)=>(
                        <label key={i} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"3px 0"}}>
                          <input type="checkbox" checked={(data.items||[]).includes(item)} onChange={()=>{const items=(data.items||[]).includes(item)?(data.items||[]).filter(x=>x!==item):[...(data.items||[]),item];saveFiveS({...fiveS,[s.key]:{...data,items}});}} style={{accentColor:s.color}} />
                          <span style={{color:T.text,fontSize:10}}>{item}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <div style={{color:T.textMuted,fontSize:10,fontWeight:700,marginBottom:4}}>Notes d'observation</div>
                      <textarea value={data.notes} onChange={e=>saveFiveS({...fiveS,[s.key]:{...data,notes:e.target.value}})} rows={3} placeholder="Observations, points d'amélioration…"
                        style={{width:"100%",background:T.surface3,border:`1px solid ${s.color}33`,borderRadius:7,padding:"6px 8px",color:T.text,fontSize:10,resize:"none",boxSizing:"border-box"}} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tool==="pca" && (
        <div>
          <div style={{background:"#C41E3A15",border:"1px solid #C41E3A33",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:11,color:T.text}}>🔐 <strong>Plan de Continuité d'Activité (PCA)</strong> — Résilience organisationnelle</div>
            <button onClick={generatePcaWithAI} disabled={pcaLoading}
              style={{background:pcaLoading?"#1E3A5F":"linear-gradient(135deg,#C41E3A,#E02244)",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>
              {pcaLoading?"⏳ Génération…":"✨ Générer PCA avec IA"}
            </button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4,fontWeight:700}}>🏢 Contexte d'activité *</label>
              <textarea value={pca.contexte} onChange={e=>savePca({...pca,contexte:e.target.value})} rows={3} placeholder="Décrivez vos activités principales, vos clients, votre secteur…"
                style={{width:"100%",background:T.surface2,border:`1px solid #C41E3A44`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,resize:"none",boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4,fontWeight:700}}>⚠️ Risques majeurs identifiés</label>
              <textarea value={pca.risques_majeurs} onChange={e=>savePca({...pca,risques_majeurs:e.target.value})} rows={3} placeholder="Panne informatique, perte de données, sinistre, départ clés, pandémie…"
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,resize:"none",boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4,fontWeight:700}}>⏱️ RTO — Délai de reprise cible</label>
              <input value={pca.rto} onChange={e=>savePca({...pca,rto:e.target.value})} placeholder="Ex: 4 heures, 24 heures…"
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
            </div>
            <div>
              <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4,fontWeight:700}}>💾 RPO — Perte de données acceptable</label>
              <input value={pca.rpo} onChange={e=>savePca({...pca,rpo:e.target.value})} placeholder="Ex: 1 heure, 4 heures, 24 heures…"
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
            </div>
          </div>
          {pca.ai_result && (
            <div style={{background:T.surface2,border:"2px solid #C41E3A33",borderRadius:12,padding:16}}>
              <div style={{color:"#C41E3A",fontWeight:800,fontSize:13,marginBottom:10}}>🤖 Plan de Continuité généré par IA</div>
              <pre style={{color:T.text,fontSize:11,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"'Segoe UI',sans-serif",margin:0,maxHeight:400,overflow:"auto"}}>{pca.ai_result}</pre>
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button onClick={() => {const b=new Blob([pca.ai_result],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="PCA_GC_"+new Date().getFullYear()+".txt";a.click();URL.revokeObjectURL(u);}}
                  style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"7px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>⬇ Télécharger le PCA</button>
                <button onClick={()=>gcCopy(pca.ai_result)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 14px",cursor:"pointer",fontSize:12}}>📋 Copier</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BCG MATRIX ── */}
      {tool==="bcg" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h4 style={{color:"#EC4899",margin:0,fontSize:13,fontWeight:800}}>📈 Matrice BCG — Boston Consulting Group</h4>
          </div>
          <div style={{background:"#EC489910",border:"1px solid #EC489933",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:11,color:T.text}}>
            💡 Positionnez vos Unités d'Activités Stratégiques (UAS) selon la <strong>Part de Marché Relative (%)</strong> et la <strong>Croissance du marché (%)</strong>.
          </div>
          {/* Add item form */}
          <div style={{background:T.surface2,border:"1px solid #EC489933",borderRadius:10,padding:14,marginBottom:14}}>
            <div style={{color:"#EC4899",fontWeight:800,fontSize:11,marginBottom:8}}>➕ Ajouter une UAS / Activité</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8}}>
              {[["Nom UAS / Produit","nom","text"],["Part Marché Rel. (%)","pdm","number"],["Croissance (%)","croissance","number"],["CA (FCFA)","ca","number"]].map(([l,k,t])=>(
                <div key={k}>
                  <label style={{color:T.textDim,fontSize:9,fontWeight:700,display:"block",marginBottom:2,textTransform:"uppercase"}}>{l}</label>
                  <input type={t} value={bcgForm[k]} onChange={e=>setBcgForm(f=>({...f,[k]:t==="number"?parseFloat(e.target.value)||0:e.target.value}))}
                    style={{width:"100%",background:T.surface3,border:"1px solid #EC489944",borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                </div>
              ))}
            </div>
            <button onClick={() => {if(!bcgForm.nom.trim())return;saveBcg([...bcgItems,{...bcgForm,id:"BCG-"+Date.now()}]);setBcgForm({nom:"",pdm:50,croissance:5,ca:0});}}
              style={{marginTop:8,background:"#EC4899",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:800,fontSize:11}}>➕ Ajouter</button>
          </div>
          {/* BCG Grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2,borderRadius:10,overflow:"hidden",border:"2px solid #33446655"}}>
            {[
              {label:"⭐ STARS",sub:"Fort PDM · Forte croissance",c:"#22C55E",cond:i=>i.pdm>=50&&i.croissance>=5},
              {label:"❓ DILEMMES",sub:"Faible PDM · Forte croissance",c:"#F59E0B",cond:i=>i.pdm<50&&i.croissance>=5},
              {label:"🐄 VACHES À LAIT",sub:"Fort PDM · Faible croissance",c:"#3B82F6",cond:i=>i.pdm>=50&&i.croissance<5},
              {label:"🐕 POIDS MORTS",sub:"Faible PDM · Faible croissance",c:"#EF4444",cond:i=>i.pdm<50&&i.croissance<5},
            ].map(q=>{
              const items = bcgItems.filter(q.cond);
              return (
                <div key={q.label} style={{background:q.c+"12",border:`1px solid ${q.c}33`,padding:12,minHeight:120}}>
                  <div style={{color:q.c,fontWeight:900,fontSize:12,marginBottom:2}}>{q.label}</div>
                  <div style={{color:T.textDim,fontSize:9,marginBottom:8}}>{q.sub}</div>
                  {items.length===0 && <div style={{color:T.textDim,fontSize:10,fontStyle:"italic"}}>Aucune UAS</div>}
                  {items.map(item=>(
                    <div key={item.id} style={{background:q.c+"22",border:`1px solid ${q.c}44`,borderRadius:6,padding:"5px 8px",marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:T.text,fontSize:10,fontWeight:600}}>{item.nom}</span>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{color:T.textDim,fontSize:9}}>PDM:{item.pdm}% | Cr:{item.croissance}%</span>
                        <button onClick={()=>saveBcg(bcgItems.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10}}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {bcgItems.length>0&&(
            <div style={{marginTop:10,background:T.surface2,borderRadius:8,padding:"8px 12px",fontSize:10,color:T.textMuted,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{flex:1}}>💡 Seuil : PDM ≥ 50% = fort | Croissance ≥ 5% = élevée. Modifiable selon votre secteur.</span>
              <button onClick={()=>printTool("Matrice BCG",`<table><thead><tr><th>Activité/UAS</th><th>Quadrant</th><th>PDM %</th><th>Croissance %</th><th>CA</th></tr></thead><tbody>${bcgItems.map(it=>{const q=it.pdm>=50&&it.croissance>=5?"⭐ Star":it.pdm>=50&&it.croissance<5?"🐄 Cash Cow":it.pdm<50&&it.croissance>=5?"❓ Dilemme":"🐕 Poids Mort";return`<tr><td>${it.nom}</td><td>${q}</td><td>${it.pdm}</td><td>${it.croissance}</td><td>${it.ca?.toLocaleString()||"—"}</td></tr>`}).join("")}</tbody></table>`)}
                style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>🖨️ Imprimer</button>
              <button onClick={()=>exportToolCSV("BCG",[["Activité","Quadrant","PDM%","Croissance%","CA"],...bcgItems.map(it=>{const q=it.pdm>=50&&it.croissance>=5?"Star":it.pdm>=50&&it.croissance<5?"Cash Cow":it.pdm<50&&it.croissance>=5?"Dilemme":"Poids Mort";return[it.nom,q,it.pdm,it.croissance,it.ca||""];})]) }
                style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>📥 CSV</button>
            </div>
          )}
        </div>
      )}

      {/* ── PORTER 5 FORCES ── */}
      {tool==="porter" && (
        <div>
          <h4 style={{color:"#F97316",margin:"0 0 12px",fontSize:13,fontWeight:800}}>🏭 Porter — Analyse des 5 Forces Concurrentielles</h4>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[
              {k:"F1",label:"⚔️ Rivalité entre concurrents",desc:"Intensité de la concurrence directe sur le marché"},
              {k:"F2",label:"🚪 Menace des nouveaux entrants",desc:"Facilité d'entrée de nouveaux acteurs dans le secteur"},
              {k:"F3",label:"🔄 Pouvoir des substituts",desc:"Risque de remplacement par des produits/services alternatifs"},
              {k:"F4",label:"🤝 Pouvoir des fournisseurs",desc:"Capacité des fournisseurs à imposer leurs conditions"},
              {k:"F5",label:"🛒 Pouvoir des clients/acheteurs",desc:"Capacité des clients à négocier prix et conditions"},
            ].map(f=>{
              const val=porter[f.k]||{score:3,notes:""};
              const intensity=["","Très faible","Faible","Modérée","Forte","Très forte"];
              const ic=val.score<=2?"#22C55E":val.score<=3?"#F59E0B":"#EF4444";
              return (
                <div key={f.k} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{color:T.text,fontWeight:700,fontSize:12}}>{f.label}</div>
                      <div style={{color:T.textMuted,fontSize:10}}>{f.desc}</div>
                    </div>
                    <div style={{textAlign:"center",flexShrink:0,marginLeft:10}}>
                      <div style={{color:ic,fontWeight:900,fontSize:18}}>{val.score}/5</div>
                      <div style={{color:ic,fontSize:9,fontWeight:700}}>{intensity[val.score]}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:4,marginBottom:6}}>
                    {[1,2,3,4,5].map(n=>(
                      <button key={n} onClick={()=>savePorter({...porter,[f.k]:{...val,score:n}})}
                        style={{flex:1,background:val.score>=n?ic:T.surface3,border:`1px solid ${val.score>=n?ic:T.border}`,borderRadius:4,padding:"4px",cursor:"pointer",color:val.score>=n?"#fff":T.textDim,fontSize:10,fontWeight:700}}>{n}</button>
                    ))}
                  </div>
                  <input value={val.notes} onChange={e=>savePorter({...porter,[f.k]:{...val,notes:e.target.value}})} placeholder="Observations et faits marquants…"
                    style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:10,boxSizing:"border-box"}} />
                </div>
              );
            })}
          </div>
          {/* Score global */}
          <div style={{marginTop:12,background:T.surface2,border:"1px solid #F9741633",borderRadius:10,padding:12}}>
            <div style={{color:"#F97316",fontWeight:800,fontSize:11,marginBottom:4}}>🏆 Score global de l'attractivité sectorielle</div>
            {(()=>{const avg=Math.round(Object.values(porter).reduce((a,f)=>a+(f.score||3),0)/5*10)/10;const c=avg<=2?"#22C55E":avg<=3?"#F59E0B":"#EF4444";const l=avg<=2?"Secteur attractif ✅":avg<=3?"Attractivité modérée ⚠️":"Secteur peu attractif ❌";return <div style={{display:"flex",gap:10,alignItems:"center"}}><div style={{flex:1,height:8,background:T.surface3,borderRadius:4}}><div style={{width:(avg/5*100)+"%",height:"100%",background:c,borderRadius:4}} /></div><span style={{color:c,fontWeight:800,fontSize:12}}>{avg}/5</span><span style={{color:c,fontSize:11}}>{l}</span></div>;})()}
            <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginTop:10}}>
              <button onClick={()=>printTool("Porter 5 Forces",`<table><thead><tr><th>Force</th><th>Score/5</th><th>Niveau</th><th>Notes</th></tr></thead><tbody>${[{k:"F1",l:"Rivalité concurrents"},{k:"F2",l:"Nouveaux entrants"},{k:"F3",l:"Substituts"},{k:"F4",l:"Fournisseurs"},{k:"F5",l:"Clients"}].map(f=>`<tr><td>${f.l}</td><td>${porter[f.k]?.score||3}</td><td>${porter[f.k]?.score<=2?"Faible":porter[f.k]?.score>=4?"Élevé":"Modéré"}</td><td>${porter[f.k]?.notes||"—"}</td></tr>`).join("")}</tbody></table>`)}
                style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>🖨️ Imprimer</button>
              <button onClick={()=>exportToolCSV("Porter_5_Forces",[["Force","Score","Notes"],...[{k:"F1",l:"Rivalité"},{k:"F2",l:"Nouveaux entrants"},{k:"F3",l:"Substituts"},{k:"F4",l:"Fournisseurs"},{k:"F5",l:"Clients"}].map(f=>[f.l,porter[f.k]?.score||3,porter[f.k]?.notes||""])])}
                style={{background:"#F9741622",border:"1px solid #F9741644",color:"#F97316",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>📥 CSV</button>
            </div>
          </div>
        </div>
      )}

      {/* ── VRIO ANALYSIS ── */}
      {tool==="vrio" && (
        <div>
          <h4 style={{color:"#14B8A6",margin:"0 0 12px",fontSize:13,fontWeight:800}}>💎 Analyse VRIO — Avantage Concurrentiel Durable</h4>
          <div style={{background:"#14B8A615",border:"1px solid #14B8A633",borderRadius:10,padding:"8px 12px",marginBottom:12,fontSize:10,color:T.text}}>
            <strong>V</strong>aleur · <strong>R</strong>areté · <strong>I</strong>mitabilité difficile · <strong>O</strong>rganisation — Évaluez vos ressources/compétences clés.
          </div>
          <div style={{background:T.surface2,border:"1px solid #14B8A633",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
              <input value={vrioForm.ressource} onChange={e=>setVrioForm(f=>({...f,ressource:e.target.value}))} placeholder="Ressource ou compétence…"
                style={{flex:1,background:T.surface3,border:"1px solid #14B8A644",borderRadius:6,padding:"6px 10px",color:T.text,fontSize:11,minWidth:150}} />
              {["V","R","I","O"].map(k=>(
                <label key={k} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",background:vrioForm[k]?"#14B8A622":"transparent",border:`1px solid ${vrioForm[k]?"#14B8A644":T.border}`,borderRadius:6,padding:"5px 10px"}}>
                  <input type="checkbox" checked={!!vrioForm[k]} onChange={e=>setVrioForm(f=>({...f,[k]:e.target.checked}))} style={{accentColor:"#14B8A6"}} />
                  <span style={{color:vrioForm[k]?"#14B8A6":T.textMuted,fontSize:11,fontWeight:700}}>{k}</span>
                </label>
              ))}
              <button onClick={() => {if(!vrioForm.ressource.trim())return;saveVrio([...vrio,{...vrioForm,id:"V"+Date.now()}]);setVrioForm({ressource:"",V:false,R:false,I:false,O:false});}}
                style={{background:"#14B8A6",border:"none",color:"#fff",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontWeight:800,fontSize:11}}>+ Ajouter</button>
            </div>
          </div>
          {/* Table */}
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:T.surface2}}>
                {["Ressource / Compétence","Valeur","Rareté","Inimitable","Organisé","Position concurrentielle"].map(h=>(
                  <th key={h} style={{padding:"7px 8px",textAlign:"left",color:T.textMuted,fontSize:9,fontWeight:700,textTransform:"uppercase",borderBottom:`1px solid ${T.border}`}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {vrio.map(item=>{
                  const pos = !item.V?"Sans valeur":!item.R?"Parité concurrentielle":!item.I?"Avantage temporaire":!item.O?"Avantage inexploité":"Avantage durable ★";
                  const posC = !item.V?"#888":!item.R?"#3B82F6":!item.I?"#F59E0B":!item.O?"#A855F7":"#22C55E";
                  return (
                    <tr key={item.id} className="gc-tr-hover" style={{borderBottom:`1px solid ${T.border}20`}}>
                      <td style={{padding:"7px 8px",color:T.text,fontSize:11,fontWeight:600}}>{item.ressource}</td>
                      {["V","R","I","O"].map(k=>(
                        <td key={k} style={{padding:"7px 8px",textAlign:"center"}}>
                          <span style={{fontSize:16}}>{item[k]?"✅":"❌"}</span>
                        </td>
                      ))}
                      <td style={{padding:"7px 8px"}}><span style={{color:posC,fontWeight:700,fontSize:10,background:posC+"15",borderRadius:5,padding:"2px 7px"}}>{pos}</span></td>
                      <td style={{padding:"7px 4px"}}><button onClick={()=>saveVrio(vrio.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12}}>✕</button></td>
                    </tr>
                  );
                })}
                {vrio.length===0&&<tr><td colSpan={7} style={{padding:20,textAlign:"center",color:T.textDim,fontSize:11}}>Aucune ressource ajoutée</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PARETO 80/20 ── */}
      {tool==="pareto" && (
        <div>
          <h4 style={{color:"#EAB308",margin:"0 0 12px",fontSize:13,fontWeight:800}}>📊 Loi de Pareto — Règle 80/20</h4>
          <div style={{background:T.surface2,border:"1px solid #EAB30833",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{display:"flex",gap:8,marginBottom:0}}>
              <input value={paretoForm.cause} onChange={e=>setParetoForm(f=>({...f,cause:e.target.value}))} placeholder="Cause / Problème…"
                style={{flex:2,background:T.surface3,border:"1px solid #EAB30844",borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}} />
              <input type="number" value={paretoForm.freq} onChange={e=>setParetoForm(f=>({...f,freq:parseInt(e.target.value)||0}))} placeholder="Freq."
                style={{width:80,background:T.surface3,border:"1px solid #EAB30844",borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}} />
              <button onClick={() => {if(!paretoForm.cause.trim())return;savePareto([...paretoItems,{...paretoForm,id:"P"+Date.now()}]);setParetoForm({cause:"",freq:0});}}
                style={{background:"#EAB308",border:"none",color:"#fff",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontWeight:800,fontSize:11}}>+ Ajouter</button>
            </div>
          </div>
          {(() => {
            const sorted = [...paretoItems].sort((a,b)=>b.freq-a.freq);
            const total = sorted.reduce((a,i)=>a+i.freq,0)||1;
            let cum = 0;
            return (
              <div>
                {sorted.map(item=>{
                  const pct = Math.round((item.freq/total)*100);
                  cum += pct;
                  const isVital = cum-pct < 80;
                  return (
                    <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <div style={{width:140,color:T.text,fontSize:10,fontWeight:isVital?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.cause}</div>
                      <div style={{flex:1,height:20,background:T.surface3,borderRadius:4,overflow:"hidden",position:"relative"}}>
                        <div style={{width:pct+"%",height:"100%",background:isVital?"#EF4444":"#EAB308",borderRadius:4,transition:"width 0.5s"}} />
                        <span style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",fontSize:9,color:T.textMuted,fontWeight:700}}>{pct}%</span>
                      </div>
                      <div style={{width:30,color:T.textDim,fontSize:9,textAlign:"right"}}>{item.freq}</div>
                      <span style={{fontSize:10,fontWeight:700,color:isVital?"#EF4444":"#888",width:30}}>{isVital?"🔑":""}</span>
                      <button onClick={()=>savePareto(paretoItems.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10}}>✕</button>
                    </div>
                  );
                })}
                {sorted.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:20,fontSize:11}}>Ajoutez des causes pour générer le diagramme Pareto</div>}
                {sorted.length>0&&<div style={{marginTop:8,fontSize:10,color:T.textMuted,borderTop:`1px solid ${T.border}`,paddingTop:8}}>🔑 Causes vitales (80% des effets) en rouge — à traiter en priorité absolue.</div>}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── QQOQCP ── */}
      {tool==="qqoqcp" && (
        <div>
          <h4 style={{color:"#84CC16",margin:"0 0 12px",fontSize:13,fontWeight:800}}>❓ QQOQCP — Analyse Structurée de Problème</h4>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[
              {k:"Q1",label:"Qui ?",icon:"👤",desc:"Qui est concerné, impliqué ou à l'origine ?",c:"#3B82F6"},
              {k:"Q2",label:"Quoi ?",icon:"📌",desc:"De quoi s'agit-il ? Quel est le problème ou l'objectif ?",c:"#22C55E"},
              {k:"O",label:"Où ?",icon:"📍",desc:"Où cela se produit-il ? Localisation, lieu, département.",c:"#F59E0B"},
              {k:"Q3",label:"Quand ?",icon:"📅",desc:"Quand cela arrive-t-il ? Fréquence, délai, période.",c:"#A855F7"},
              {k:"C",label:"Comment ?",icon:"⚙️",desc:"De quelle manière ? Méthode, déroulement.",c:"#EF4444"},
              {k:"P",label:"Pourquoi ?",icon:"🎯",desc:"Quelle est la cause profonde ? Pourquoi agir ?",c:"#EC4899"},
            ].map(q=>(
              <div key={q.k} style={{background:T.surface2,border:`1px solid ${q.c}33`,borderRadius:10,padding:12}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:18}}>{q.icon}</span>
                  <div>
                    <div style={{color:q.c,fontWeight:800,fontSize:12}}>{q.label}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>{q.desc}</div>
                  </div>
                  {qqoqcp[q.k]?.trim()&&<span style={{marginLeft:"auto",background:"#22C55E22",color:"#22C55E",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>✓ Renseigné</span>}
                </div>
                <textarea value={qqoqcp[q.k]} onChange={e=>saveQqoqcp({...qqoqcp,[q.k]:e.target.value})} rows={2} placeholder={`Répondez à "${q.label}"…`}
                  style={{width:"100%",background:T.surface3,border:`1px solid ${q.c}33`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}} />
              </div>
            ))}
          </div>
          {Object.values(qqoqcp).every(v=>v?.trim())&&(
            <div style={{marginTop:10,background:"#22C55E15",border:"1px solid #22C55E44",borderRadius:8,padding:"8px 12px",color:"#22C55E",fontSize:11,fontWeight:700}}>✅ Analyse QQOQCP complète — Tous les axes sont renseignés</div>
          )}
        </div>
      )}

      {/* ── 10M TORTUE DE CROSBY ── */}
      {tool==="10m" && (
        <div>
          <h4 style={{color:"#10B981",margin:"0 0 12px",fontSize:13,fontWeight:800}}>🐢 10M Crosby — Gestion de la Qualité Totale</h4>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              {k:"M1",label:"Main-d'œuvre",icon:"👥",desc:"Personnel qualifié, compétences, formation continue"},
              {k:"M2",label:"Matière",icon:"📦",desc:"Qualité des intrants, données, informations traitées"},
              {k:"M3",label:"Méthode",icon:"📋",desc:"Procédures, processus, modes opératoires"},
              {k:"M4",label:"Matériel / Machine",icon:"⚙️",desc:"Équipements, outils, infrastructure IT"},
              {k:"M5",label:"Milieu",icon:"🌍",desc:"Environnement physique et organisationnel"},
              {k:"M6",label:"Management",icon:"👔",desc:"Leadership, gouvernance, prise de décision"},
              {k:"M7",label:"Mesure",icon:"📊",desc:"Indicateurs, KPIs, systèmes de contrôle"},
              {k:"M8",label:"Moyens financiers",icon:"💰",desc:"Budget, financement, gestion des coûts"},
              {k:"M9",label:"Maintenance",icon:"🔧",desc:"Entretien, continuité des opérations"},
              {k:"M10",label:"Market (Client)",icon:"🎯",desc:"Orientation client, satisfaction, fidélisation"},
            ].map(m=>{
              const val=tenM[m.k]||{score:0,notes:"",criteria:""};
              const pct=val.score*20;
              const c=pct>=80?"#22C55E":pct>=60?"#3B82F6":pct>=40?"#F59E0B":"#EF4444";
              // Critères justificatifs prédéfinis par score
              const CRITERIA_BY_SCORE = {
                0: ["Non évalué","Inexistant","Non applicable"],
                1: ["Inexistant ou non formalisé","Aucune procédure en place","Connaissance absente","Problèmes chroniques non traités","Absence totale de suivi"],
                2: ["Existence partielle et informelle","Tentatives isolées non consolidées","Connaissance limitée à quelques personnes","Résultats irréguliers","Suivi sporadique"],
                3: ["Mis en place mais non systématique","Procédures partielles documentées","Compétences hétérogènes","Résultats moyens avec des écarts","Suivi irrégulier"],
                4: ["Bien structuré et documenté","Appliqué de manière cohérente","Compétences maîtrisées par la majorité","Résultats satisfaisants et stables","Suivi régulier avec indicateurs"],
                5: ["Excellence et maîtrise totale","Procédures optimisées et améliorées en continu","Compétences d'experts et formation continue","Résultats excellents et prévisibles","Pilotage par la donnée et anticipation"]};
              const criteriaList = CRITERIA_BY_SCORE[val.score] || CRITERIA_BY_SCORE[0];
              return (
                <div key={m.k} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:16}}>{m.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{color:T.text,fontWeight:700,fontSize:11}}>{m.label}</div>
                      <div style={{color:T.textMuted,fontSize:9}}>{m.desc}</div>
                    </div>
                    <div style={{textAlign:"center",flexShrink:0}}>
                      <div style={{color:c,fontWeight:900,fontSize:16}}>{val.score}/5</div>
                      <div style={{width:40,height:4,background:T.surface3,borderRadius:2,marginTop:2}}><div style={{width:pct+"%",height:"100%",background:c,borderRadius:2}} /></div>
                    </div>
                  </div>
                  {/* Score 0-5 */}
                  <div style={{display:"flex",gap:3,marginBottom:6}}>
                    {[0,1,2,3,4,5].map(n=>(
                      <button key={n} onClick={()=>saveTenM({...tenM,[m.k]:{...val,score:n,criteria:""}})}
                        style={{flex:1,background:val.score>=n&&n>0?c:"transparent",border:`1px solid ${val.score>=n&&n>0?c:T.border}`,borderRadius:3,padding:"3px",cursor:"pointer",color:val.score>=n&&n>0?"#fff":T.textDim,fontSize:9}}>{n}</button>
                    ))}
                  </div>
                  {/* Critères justificatifs — liste déroulante */}
                  {val.score > 0 && (
                    <div style={{marginBottom:6}}>
                      <label style={{color:T.textDim,fontSize:9,fontWeight:700,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:0.5}}>Critère justificatif</label>
                      <select value={val.criteria||""} onChange={e=>saveTenM({...tenM,[m.k]:{...val,criteria:e.target.value}})}
                        style={{width:"100%",background:T.surface3,border:`1px solid ${c}44`,borderRadius:5,padding:"5px 7px",color:T.text,fontSize:9,boxSizing:"border-box"}}>
                        <option value="">— Sélectionner un critère —</option>
                        {criteriaList.map((cr,i)=><option key={i} value={cr}>{cr}</option>)}
                        <option value="__custom__">✏️ Saisir un critère personnalisé…</option>
                      </select>
                      {val.criteria==="__custom__"&&(
                        <input value={val.customCriteria||""} onChange={e=>saveTenM({...tenM,[m.k]:{...val,customCriteria:e.target.value}})}
                          placeholder="Décrivez votre critère justificatif…"
                          style={{width:"100%",marginTop:4,background:T.surface3,border:`1px solid ${c}44`,borderRadius:5,padding:"5px 7px",color:T.text,fontSize:9,boxSizing:"border-box"}}/>
                      )}
                    </div>
                  )}
                  {/* Observations libres */}
                  <input value={val.notes||""} onChange={e=>saveTenM({...tenM,[m.k]:{...val,notes:e.target.value}})} placeholder="Observations complémentaires…"
                    style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 7px",color:T.text,fontSize:9,boxSizing:"border-box"}} />
                </div>
              );
            })}
          </div>
          {/* Score global */}
          <div style={{marginTop:12,background:T.surface2,border:"1px solid #10B98133",borderRadius:10,padding:12}}>
            <div style={{color:"#10B981",fontWeight:800,fontSize:11,marginBottom:8}}>🏆 Maturité Qualité Globale (Tortue de Crosby)</div>
            {(()=>{
              const scores=Object.values(tenM).map(m=>m.score||0);
              const avg=Math.round(scores.reduce((a,b)=>a+b,0)/10*10)/10;
              const c=avg>=4?"#22C55E":avg>=3?"#3B82F6":avg>=2?"#F59E0B":"#EF4444";
              const niveau=avg>=4?"Qualité Maîtrisée ✅":avg>=3?"En Progression 📈":avg>=2?"Qualité Émergente ⚠️":"Qualité Insuffisante ❌";
              return <div style={{display:"flex",gap:10,alignItems:"center"}}><div style={{flex:1,height:10,background:T.surface3,borderRadius:5}}><div style={{width:(avg/5*100)+"%",height:"100%",background:c,borderRadius:5,transition:"width 0.8s"}} /></div><span style={{color:c,fontWeight:900,fontSize:14,flexShrink:0}}>{avg}/5</span><span style={{color:c,fontSize:11}}>{niveau}</span></div>
            })()}
          </div>
        </div>
      )}

      {/* ── ÉVALUATION DES RESSOURCES ── */}
      {tool==="resources" && (
        <div>
          <h4 style={{color:"#0EA5E9",margin:"0 0 12px",fontSize:13,fontWeight:800}}>🗃️ Évaluation des Ressources — 5 Catégories</h4>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {[
              {k:"humaines",l:"👥 Humaines",c:"#3B82F6"},
              {k:"materielles",l:"⚙️ Matérielles",c:"#F59E0B"},
              {k:"immatterielles",l:"💎 Immatérielles",c:"#A855F7"},
              {k:"financieres",l:"💰 Financières",c:"#22C55E"},
              {k:"technologiques",l:"💻 Technologiques",c:"#EC4899"},
            ].map(tab=>(
              <button key={tab.k} onClick={()=>setResTab(tab.k)}
                style={{background:resTab===tab.k?tab.c:"transparent",border:`1px solid ${resTab===tab.k?tab.c:T.border}`,color:resTab===tab.k?"#fff":T.textMuted,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:resTab===tab.k?800:400,fontSize:11}}>
                {tab.l} <span style={{fontSize:9,opacity:0.8}}>({(resources[tab.k]||[]).length})</span>
              </button>
            ))}
          </div>
          {/* Add form */}
          <div style={{background:T.surface2,border:"1px solid #0EA5E933",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
              {[["Nom / Description","nom","text"],["Valeur estimée","valeur","text"],["Note /5","note","number"],["Criticité","criticalite","select"]].map(([l,k,t])=>(
                <div key={k}>
                  <label style={{color:T.textDim,fontSize:9,fontWeight:700,display:"block",marginBottom:2,textTransform:"uppercase"}}>{l}</label>
                  {t==="select" ? (
                    <select value={resForm[k]} onChange={e=>setResForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:"1px solid #0EA5E944",borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                      {["FAIBLE","MOYENNE","HAUTE","CRITIQUE"].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : (
                    <input type={t} value={resForm[k]} min={t==="number"?0:undefined} max={t==="number"?5:undefined}
                      onChange={e=>setResForm(f=>({...f,[k]:t==="number"?parseFloat(e.target.value)||0:e.target.value}))}
                      style={{width:"100%",background:T.surface3,border:"1px solid #0EA5E944",borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}} />
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => {if(!resForm.nom.trim())return;const nr={...resForm,id:"R"+Date.now()};saveResources({...resources,[resTab]:[...(resources[resTab]||[]),nr]});setResForm({nom:"",valeur:"",note:0,criticalite:"MOYENNE",description:""});}}
              style={{background:"#0EA5E9",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:800,fontSize:11}}>➕ Ajouter</button>
          </div>
          {/* Resource list */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {(resources[resTab]||[]).map(res=>{
              const cc={FAIBLE:"#22C55E",MOYENNE:"#F59E0B",HAUTE:"#EF4444",CRITIQUE:"#DC2626"}[res.criticalite]||"#888";
              return (
                <div key={res.id} style={{background:T.surface2,border:`1px solid ${cc}22`,borderRadius:8,padding:"8px 12px",display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:11}}>{res.nom}</div>
                    <div style={{display:"flex",gap:8,marginTop:3}}>
                      {res.valeur&&<span style={{color:T.textDim,fontSize:9}}>💰 {res.valeur}</span>}
                      <span style={{background:cc+"22",color:cc,borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{res.criticalite}</span>
                    </div>
                  </div>
                  <div style={{textAlign:"center",flexShrink:0}}>
                    <div style={{display:"flex",gap:2}}>
                      {[1,2,3,4,5].map(n=><div key={n} style={{width:8,height:8,borderRadius:"50%",background:res.note>=n?"#F59E0B":T.surface3}} />)}
                    </div>
                    <div style={{color:T.textDim,fontSize:8,marginTop:1}}>{res.note}/5</div>
                  </div>
                  <button onClick={()=>saveResources({...resources,[resTab]:(resources[resTab]||[]).filter(r=>r.id!==res.id)})}
                    style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12}}>✕</button>
                </div>
              );
            })}
            {(resources[resTab]||[]).length===0&&<div style={{color:T.textDim,textAlign:"center",padding:20,fontSize:11}}>Aucune ressource {resTab} ajoutée</div>}
          </div>
        </div>
      )}

      {tool==="bsc" && (
        <div>
          <div style={{background:"#0EA5E915",border:"1px solid #0EA5E933",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
            <div style={{color:T.text,fontSize:11}}>🎯 <strong>Balanced Scorecard</strong> — Tableau de bord prospectif à 4 perspectives</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[{label:"💰 Financière",color:"#22C55E",desc:"Rentabilité, croissance CA, maîtrise coûts",kpis:["CA trimestriel","Taux de marge","ROI","Trésorerie nette"]},{label:"👥 Clients",color:"#3B82F6",desc:"Satisfaction, fidélisation, acquisition",kpis:["NPS Score","Taux de rétention","Délai traitement dossier","Nombre de nouveaux clients"]},{label:"⚙️ Processus internes",color:"#F59E0B",desc:"Efficacité opérationnelle, qualité",kpis:["Délai moyen par dossier","Taux d'erreur","Conformité process","Incidents qualité"]},{label:"📚 Apprentissage",color:"#8B5CF6",desc:"Compétences, innovation, culture",kpis:["Heures de formation","Taux de satisfaction RH","Turnover","Projets d'amélioration"]}].map(p=>(
              <div key={p.label} style={{background:T.surface2,border:`2px solid ${p.color}33`,borderRadius:12,padding:"14px"}}>
                <div style={{color:p.color,fontWeight:800,fontSize:12,marginBottom:4}}>{p.label}</div>
                <div style={{color:T.textDim,fontSize:10,marginBottom:10}}>{p.desc}</div>
                {p.kpis.map((kpi,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:p.color,flexShrink:0}} />
                    <span style={{color:T.text,fontSize:10,flex:1}}>{kpi}</span>
                    <input type="text" placeholder="Cible" style={{width:70,background:T.surface3,border:`1px solid ${p.color}33`,borderRadius:5,padding:"3px 6px",color:T.text,fontSize:10,textAlign:"right"}} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
            <button onClick={()=>window.gcAIAsk&&window.gcAIAsk("Génère un Balanced Scorecard complet avec des KPIs spécifiques, des objectifs chiffrés et des initiatives stratégiques pour un cabinet de conseil juridique et d'audit à Libreville, Gabon. Inclus des cibles réalistes pour chaque perspective.")}
              style={{background:"#0EA5E922",border:"1px solid #0EA5E944",color:"#0EA5E9",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✨ Générer BSC avec IA</button>
          </div>
        </div>
      )}

      {/* ── MATRICE COMPÉTITIVITÉ-ATTRACTIVITÉ ── */}
      {tool==="competitivite" && <CompetitivitePanel T={T} currentUser={currentUser} setNotifications={setNotifications} />}

      {/* ── ÉTUDE DE MARCHÉ ── */}
      {tool==="marche" && <MarchePanel T={T} currentUser={currentUser} setNotifications={setNotifications} />}

      {/* ── RH & AVIS COLLABORATEURS ── */}
      {tool==="rh_conseil" && <RHConseilPanel T={T} currentUser={currentUser} setNotifications={setNotifications} users={users} dossiers={dossiers} taches={taches} />}

      {/* ── AMÉLIORATION CONTINUE SYNTHÉTIQUE ── */}
      {tool==="amelio_continu" && <AmelioContenuPanel T={T} currentUser={currentUser} setNotifications={setNotifications} taches={taches} dossiers={dossiers} swot={swot} bcgItems={bcgItems} pdca={pdca} porter={porter} />}

      {/* ── BUSINESS MODEL CANVAS ── */}
      {tool==="canvas" && <BusinessCanvasPanel T={T} currentUser={currentUser} setNotifications={setNotifications} />}

      {/* ── BENCHMARKING ── */}
      {tool==="benchmark" && <BenchmarkingPanel T={T} currentUser={currentUser} setNotifications={setNotifications} dossiers={dossiers} />}

      {/* ── ANSOFF ── */}
      {tool==="ansoff" && <AnsoffPanel T={T} currentUser={currentUser} setNotifications={setNotifications} />}
    </div>
  );
};


// ══════════════════════════════════════════════════════════════════════════
// BUSINESS MODEL CANVAS
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// SESSION / PROJECT MANAGER  — Hook + composant réutilisables
// ══════════════════════════════════════════════════════════════════════════
// FIX v135 — Custom hook export (non-component) - disabling react-refresh rule
 
export function useToolSessions(toolKey, userId) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const SESSIONS_KEY = `gc-sessions-${toolKey}-${userId}`;
  const ACTIVE_KEY   = `gc-active-sess-${toolKey}-${userId}`;

  const [sessions, setSessions] = React.useState(() => {
    try {
      let raw = null; try { raw = JSON.parse(_lsGet(SESSIONS_KEY) || "null"); } catch(_) {} // FIX v127
      if (raw && raw.length > 0) return raw;
    } catch(_) {}
    const def = [{ id: "default", name: "Projet principal", createdAt: new Date().toISOString() }];
    try { _lsSet(SESSIONS_KEY, JSON.stringify(def)); } catch(_) {}
    return def;
  });

  const [activeId, setActiveIdState] = React.useState(() => {
    try { return _lsGet(ACTIVE_KEY) || "default"; } catch(_) { return "default"; }
  });

  const saveSessions = ss => {
    setSessions(ss);
    try { _lsSet(SESSIONS_KEY, JSON.stringify(ss)); } catch(_) {}
  };

  const setActive = id => {
    setActiveIdState(id);
    try { _lsSet(ACTIVE_KEY, id); } catch(_) {}
  };

  const createSession = name => {
    const id = "sess-" + Date.now();
    const s = { id, name: name || `Projet ${sessions.length + 1}`, createdAt: new Date().toISOString() };
    const next = [...sessions, s];
    saveSessions(next);
    setActive(id);
    return id;
  };

  const deleteSession = id => {
    if (sessions.length <= 1) { gcAlert("Impossible de supprimer le dernier projet."); return; }
    const remaining = sessions.filter(s => s.id !== id);
    saveSessions(remaining);
    if (activeId === id) setActive(remaining[0].id);
    try { _lsRm(`gc-${toolKey}-data-${userId}-${id}`); } catch(_) {}
  };

  const renameSession = (id, newName) => {
    saveSessions(sessions.map(s => s.id === id ? { ...s, name: newName } : s));
  };

  const dataKey = `gc-${toolKey}-data-${userId}-${activeId}`;
  return { sessions, activeId, setActive, createSession, deleteSession, renameSession, dataKey };
}

export function SessionBar({ sessions, activeId, onSetActive, onNew, onDelete, T, color = "#A855F7" }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const activeSession = sessions.find(s => s.id === activeId);

  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ color: color, fontSize: 10, fontWeight: 800, flexShrink: 0 }}>📁 PROJETS :</span>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
        {sessions.map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button onClick={() => onSetActive(s.id)}
              title={`Créé le ${new Date(s.createdAt).toLocaleDateString("fr-FR")}`}
              style={{ background: s.id === activeId ? color : T.surface3, color: s.id === activeId ? "#fff" : T.textMuted, border: `1px solid ${s.id === activeId ? color : T.border}`, borderRadius: sessions.length > 1 ? "6px 0 0 6px" : 6, padding: "3px 10px", cursor: "pointer", fontWeight: s.id === activeId ? 700 : 400, fontSize: 10, borderRight: sessions.length > 1 ? "none" : undefined }}>
              {s.name}
            </button>
            {sessions.length > 1 && (
              <button onClick={async () => { if (await gcConfirm(`Supprimer le projet "${s.name}" et toutes ses données ?`)) onDelete(s.id); }}
                style={{ background: s.id === activeId ? color + "cc" : T.surface3, color: s.id === activeId ? "#fff" : "#EF4444", border: `1px solid ${s.id === activeId ? color : T.border}`, borderRadius: "0 6px 6px 0", padding: "3px 6px", cursor: "pointer", fontSize: 9, fontWeight: 900 }}
                title="Supprimer ce projet">✕</button>
            )}
          </div>
        ))}
      </div>
      {creating ? (
        <div style={{ display: "flex", gap: 4 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newName.trim()) { onNew(newName.trim()); setNewName(""); setCreating(false); } if (e.key === "Escape") setCreating(false); }}
            placeholder="Nom du projet…" autoFocus
            style={{ background: T.surface3, border: `1px solid ${color}66`, borderRadius: 6, padding: "3px 8px", color: T.text, fontSize: 10, width: 140 }} />
          <button onClick={() => { if (newName.trim()) { onNew(newName.trim()); setNewName(""); } setCreating(false); }}
            style={{ background: color, border: "none", color: "#fff", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>✓</button>
          <button onClick={() => { setCreating(false); setNewName(""); }}
            style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 5, padding: "3px 6px", cursor: "pointer", fontSize: 10 }}>✕</button>
        </div>
      ) : (
        <button onClick={() => setCreating(true)}
          style={{ background: color + "22", border: `1px solid ${color}44`, color: color, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
          ➕ Nouveau projet
        </button>
      )}
    </div>
  );
}


export function BusinessCanvasPanel({ T, currentUser, setNotifications=_noop }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const CANVAS_BLOCKS = [
    { id:"partenaires",   label:"🤝 Partenaires clés",       color:"#8B5CF6", desc:"Qui sont nos partenaires et fournisseurs clés ?" },
    { id:"activites",     label:"⚙️ Activités clés",         color:"#3B82F6", desc:"Quelles activités notre proposition de valeur requiert-elle ?" },
    { id:"ressources",    label:"🏭 Ressources clés",         color:"#06B6D4", desc:"Quelles ressources notre proposition de valeur requiert-elle ?" },
    { id:"proposition",   label:"💡 Proposition de valeur",  color:"#F59E0B", desc:"Quelle valeur apportons-nous au client ? Quel problème résolvons-nous ?" },
    { id:"relation_client",label:"❤️ Relations clients",     color:"#EC4899", desc:"Quel type de relation entretenons-nous avec chaque segment ?" },
    { id:"canaux",        label:"📡 Canaux",                  color:"#22C55E", desc:"Comment atteignons-nous nos segments clients ?" },
    { id:"segments",      label:"👥 Segments clients",        color:"#14B8A6", desc:"Pour qui créons-nous de la valeur ? Qui sont nos clients ?" },
    { id:"couts",         label:"💸 Structure des coûts",     color:"#EF4444", desc:"Quels sont les coûts les plus importants inhérents à notre modèle ?" },
    { id:"revenus",       label:"💰 Flux de revenus",         color:"#C9A84C", desc:"Pour quelle valeur nos clients sont-ils prêts à payer ?" },
  ];

  const { sessions, activeId, setActive, createSession, deleteSession, dataKey } = useToolSessions("canvas", currentUser.id);
  const [data, setData] = React.useState(() => { try{return JSON.parse(_lsGet(dataKey)||"{}");}catch(_){return{};} });
  const [activeBlock, setActiveBlock] = React.useState("proposition");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiText, setAiText] = React.useState("");

  // Reload data when session changes
  React.useEffect(() => {
    try { setData(JSON.parse(_lsGet(dataKey)||"{}")); } catch(_) { setData({}); }
  }, [dataKey]);

  const save = (id, val) => {
    const next = {...data, [id]:val};
    setData(next);
    try{_lsSet(dataKey, JSON.stringify(next));}catch(_){}
  };

  const handleReset = async () => {
    if (!await gcConfirm("Réinitialiser tout le Business Model Canvas de ce projet ? Cette action est irréversible.")) return;
    setData({});
    try { _lsRm(dataKey); } catch(_) {}
    setAiText("");
  };

  const callAI = async (blockId) => {
    const block = CANVAS_BLOCKS.find(b=>b.id===blockId);
    const ctx = Object.entries(data).filter(([k,v])=>v?.trim()).map(([k,v])=>{
      const b=CANVAS_BLOCKS.find(x=>x.id===k); return `${b?.label||k}: ${v}`;
    }).join("\n");
    setAiLoading(true); setAiText("");
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:`Tu es un consultant expert en Business Model Canvas pour le cabinet Génie Consultant (Libreville, Gabon).\n\nContexte actuel du canvas:\n${ctx||"Canvas vierge — entreprise de conseil juridique et d'affaires au Gabon"}\n\nGénère une suggestion concrète et opérationnelle pour le bloc: ${block?.label}\n${block?.desc}\n\nSois concis, pratique, adapté au contexte gabonais/CEMAC. 3-5 points clés maximum.`}]})});
      const d = await resp.json();
      setAiText(d.content?.[0]?.text||"Aucune réponse.");
    } catch(e){ setAiText("Erreur IA: "+e.message); }
    setAiLoading(false);
  };

  const exportCanvas = () => {
    const lines = ["# BUSINESS MODEL CANVAS — Génie Consultant\n"];
    CANVAS_BLOCKS.forEach(b=>{ lines.push(`## ${b.label}\n${data[b.id]||"—"}\n`); });
    const blob = new Blob([lines.join("\n")], {type:"text/plain"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="Business_Model_Canvas.txt"; a.click();
  };

  const filledCount = CANVAS_BLOCKS.filter(b=>data[b.id]?.trim()).length;
  const completion = Math.round((filledCount/CANVAS_BLOCKS.length)*100);

  return (
    <div>
      {/* Barre sessions/projets */}
      <SessionBar sessions={sessions} activeId={activeId} onSetActive={setActive} onNew={createSession} onDelete={deleteSession} T={T} color="#3B82F6" />
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>🖼️ Business Model Canvas</div>
          <div style={{color:T.textMuted,fontSize:11}}>Modélisation stratégique de votre proposition de valeur</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{background:T.surface2,borderRadius:8,padding:"5px 12px",color:"#3B82F6",fontWeight:700,fontSize:11}}>{completion}% complété</div>
          <button onClick={exportCanvas} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>📤 Exporter</button>
          <button onClick={handleReset} title="Vider tout le canvas de ce projet" style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>↺ Réinitialiser</button>
          <button onClick={async()=>{
            setAiLoading(true); setAiText(""); setActiveBlock("proposition");
            const ctx=Object.entries(data).filter(([k,v])=>v?.trim()).map(([k,v])=>{const b=CANVAS_BLOCKS.find(x=>x.id===k);return `${b?.label||k}: ${v}`;}).join("\n");
            try{const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,messages:[{role:"user",content:`Tu es un expert en Business Model Canvas. Analyse ce canvas pour Génie Consultant (cabinet de conseil juridique, Libreville, Gabon):\n\n${ctx||"Canvas vierge"}\n\nFournis:\n1. Cohérence globale du modèle (forces/lacunes)\n2. Risques identifiés\n3. 3 recommandations prioritaires\n4. Opportunités d'innovation\nSois concis et opérationnel.`}]})});const d=await resp.json();setAiText(d.content?.[0]?.text||"Erreur");}catch(e){setAiText("Erreur: "+e.message);}
            setAiLoading(false);
          }} style={{background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>✨ Analyse IA globale</button>
        </div>
      </div>

      {/* Barre de progression */}
      <ProgressBar value={completion} color="#3B82F6"/>
      <div style={{marginBottom:14}}/>

      {/* Grille Canvas — layout fidèle au BMC classique */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gridTemplateRows:"auto auto auto",gap:6,marginBottom:14}}>
        {/* Ligne 1: Partenaires | Activités + Ressources | Proposition | Relations + Canaux | Segments */}
        {[
          {id:"partenaires",   row:"1/3", col:"1/2"},
          {id:"activites",     row:"1/2", col:"2/3"},
          {id:"ressources",    row:"2/3", col:"2/3"},
          {id:"proposition",   row:"1/3", col:"3/4"},
          {id:"relation_client",row:"1/2",col:"4/5"},
          {id:"canaux",        row:"2/3", col:"4/5"},
          {id:"segments",      row:"1/3", col:"5/6"},
        ].map(({id,row,col})=>{
          const block=CANVAS_BLOCKS.find(b=>b.id===id);
          const active=activeBlock===id;
          return(
            <div key={id} onClick={()=>setActiveBlock(id)}
              style={{gridRow:row,gridColumn:col,background:active?block.color+"22":T.surface2,border:`2px solid ${active?block.color:T.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",transition:"all 0.2s",minHeight:90}}>
              <div style={{color:block.color,fontWeight:800,fontSize:10,marginBottom:4}}>{block.label}</div>
              <div style={{color:T.textMuted,fontSize:9,lineHeight:1.4,marginBottom:4}}>{block.desc}</div>
              <div style={{color:T.text,fontSize:10,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{data[id]||<span style={{color:T.textDim,fontStyle:"italic",fontSize:9}}>Cliquer pour remplir</span>}</div>
            </div>
          );
        })}
        {/* Ligne 3 : Coûts | Revenus */}
        {[
          {id:"couts",   col:"1/3"},
          {id:"revenus", col:"3/6"},
        ].map(({id,col})=>{
          const block=CANVAS_BLOCKS.find(b=>b.id===id);
          const active=activeBlock===id;
          return(
            <div key={id} onClick={()=>setActiveBlock(id)}
              style={{gridRow:"3/4",gridColumn:col,background:active?block.color+"22":T.surface2,border:`2px solid ${active?block.color:T.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",transition:"all 0.2s",minHeight:70}}>
              <div style={{color:block.color,fontWeight:800,fontSize:10,marginBottom:4}}>{block.label}</div>
              <div style={{color:T.text,fontSize:10,whiteSpace:"pre-wrap"}}>{data[id]||<span style={{color:T.textDim,fontStyle:"italic",fontSize:9}}>Cliquer pour remplir</span>}</div>
            </div>
          );
        })}
      </div>

      {/* Panneau d'édition du bloc actif */}
      {activeBlock && (() => {
        const block=CANVAS_BLOCKS.find(b=>b.id===activeBlock);
        return(
          <div style={{background:block.color+"15",border:`1px solid ${block.color}44`,borderRadius:12,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{color:block.color,fontWeight:800,fontSize:13}}>{block.label}</div>
              <button onClick={()=>callAI(activeBlock)} disabled={aiLoading}
                style={{background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:7,padding:"5px 12px",cursor:aiLoading?"wait":"pointer",fontWeight:700,fontSize:10}}>
                {aiLoading?"⏳ IA...":"✨ Suggestion IA"}
              </button>
            </div>
            <div style={{color:T.textMuted,fontSize:11,marginBottom:8}}>{block.desc}</div>
            <textarea value={data[activeBlock]||""} onChange={e=>save(activeBlock,e.target.value)}
              placeholder={`Décrivez les ${block.label.toLowerCase()} de votre modèle...`}
              style={{width:"100%",background:T.surface2,border:`1px solid ${block.color}44`,borderRadius:8,padding:"10px 12px",color:T.text,fontSize:12,resize:"vertical",minHeight:80,boxSizing:"border-box",fontFamily:"inherit"}}/>
            {aiText&&(
              <div style={{background:"#A855F715",border:"1px solid #A855F744",borderRadius:8,padding:"10px 12px",marginTop:8}}>
                <div style={{color:"#A855F7",fontWeight:700,fontSize:10,marginBottom:4}}>✨ Suggestion IA</div>
                <div style={{color:T.text,fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.6}}>{aiText}</div>
                <button onClick={()=>save(activeBlock, (data[activeBlock]?data[activeBlock]+"\n\n":"")+aiText)}
                  style={{marginTop:8,background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                  ➕ Intégrer dans le canvas
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// BENCHMARKING
// ══════════════════════════════════════════════════════════════════════════
export function BenchmarkingPanel({ T, currentUser, setNotifications=_noop, dossiers=[] }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const { sessions, activeId, setActive, createSession, deleteSession, dataKey } = useToolSessions("benchmark", currentUser.id);
  const EMPTY_DATA = {nom:"",secteur:"",concurrents:[],criteres:[],scores:{}};
  const [data, setData] = React.useState(() => { try{return JSON.parse(_lsGet(dataKey)||"null")||EMPTY_DATA;}catch(_){return EMPTY_DATA;} });
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiText, setAiText] = React.useState("");
  const [showAddConc, setShowAddConc] = React.useState(false);
  const [newConc, setNewConc] = React.useState("");
  const [newCrit, setNewCrit] = React.useState("");
  const [tab, setTab] = React.useState("grille");

  React.useEffect(() => {
    try { setData(JSON.parse(_lsGet(dataKey)||"null")||EMPTY_DATA); } catch(_) { setData(EMPTY_DATA); }
    setAiText("");
  }, [dataKey]);

  const save = d => { setData(d); try{_lsSet(dataKey,JSON.stringify(d));}catch(_){}; };
  const addConcurrent = () => { if(!newConc.trim())return; save({...data,concurrents:[...data.concurrents,newConc.trim()]}); setNewConc(""); setShowAddConc(false); };
  const addCritere = () => { if(!newCrit.trim())return; save({...data,criteres:[...data.criteres,newCrit.trim()]}); setNewCrit(""); };
  const setScore = (conc,crit,val) => { const s={...data.scores,[`${conc}__${crit}`]:Number(val)}; save({...data,scores:s}); };
  const getScore = (conc,crit) => data.scores[`${conc}__${crit}`]||0;

  const DEFAULT_CRITERES = ["Qualité service","Délai exécution","Tarifs","Expertise","Réputation","Innovation","Présence digitale","Réseau clients"];
  const DEFAULT_CONCURRENTS = ["Génie Consultant","Concurrent A","Concurrent B","Concurrent C"];

  const initDefaults = () => {
    save({...data, concurrents:data.concurrents.length>0?data.concurrents:DEFAULT_CONCURRENTS, criteres:data.criteres.length>0?data.criteres:DEFAULT_CRITERES});
  };

  const handleReset = async () => {
    if (!await gcConfirm("Réinitialiser toutes les données benchmarking de ce projet ?")) return;
    save(EMPTY_DATA); setAiText("");
  };

  const callAI = async () => {
    setAiLoading(true); setAiText("");
    const scoresSummary = data.concurrents.map(c=>`${c}: ${data.criteres.map(cr=>`${cr}=${getScore(c,cr)}/5`).join(", ")}`).join("\n");
    try {
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,messages:[{role:"user",content:`Tu es un expert en benchmarking stratégique pour le cabinet Génie Consultant (Libreville, Gabon).\n\nSecteur analysé: ${data.secteur||"Conseil juridique et d'affaires"}\n\nScores benchmarking (sur 5):\n${scoresSummary||"Aucun score saisi"}\n\nCritères analysés: ${data.criteres.join(", ")||"Non définis"}\n\nFournis une analyse benchmarking complète:\n1. Positionnement concurrentiel de Génie Consultant\n2. Forces distinctives à capitaliser\n3. Écarts critiques à combler\n4. Recommandations stratégiques prioritaires\n5. Plan d'action 90 jours\n6. KPIs à suivre\n\nSois concret, opérationnel, adapté au marché gabonais.`}]})});
      const d=await resp.json(); setAiText(d.content?.[0]?.text||"Erreur.");
    } catch(e){setAiText("Erreur IA: "+e.message);}
    setAiLoading(false);
  };

  const myScores = data.criteres.map(c=>getScore(data.concurrents[0]||"Génie Consultant",c));
  const avgMyScore = myScores.length>0?myScores.reduce((s,v)=>s+v,0)/myScores.length:0;

  return(
    <div>
      <SessionBar sessions={sessions} activeId={activeId} onSetActive={setActive} onNew={createSession} onDelete={deleteSession} T={T} color="#3B82F6" />
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>📏 Benchmarking Concurrentiel</div>
          <div style={{color:T.textMuted,fontSize:11}}>Analyse comparative de positionnement sur le marché</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {data.concurrents.length===0&&<button onClick={initDefaults} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>🔧 Initialiser template</button>}
          <button onClick={handleReset} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>↺ Réinitialiser</button>
          <button onClick={callAI} disabled={aiLoading} style={{background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:aiLoading?"wait":"pointer",fontWeight:700,fontSize:11}}>
            {aiLoading?"⏳ Analyse...":"✨ Analyse IA"}
          </button>
        </div>
      </div>

      {/* Config secteur */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div>
          <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4,fontWeight:600}}>SECTEUR ANALYSÉ</label>
          <input value={data.secteur} onChange={e=>save({...data,secteur:e.target.value})} placeholder="Ex: Conseil juridique et d'affaires — Gabon"
            style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
        </div>
        <div>
          <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:4,fontWeight:600}}>VOTRE ENTREPRISE (1ère ligne)</label>
          <input value={data.concurrents[0]||""} onChange={e=>{const c=[...data.concurrents];c[0]=e.target.value;save({...data,concurrents:c});}} placeholder="Génie Consultant"
            style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["grille","📊 Grille de scores"],["radar","📡 Analyse visuelle"],["analyse","🔍 Résultats IA"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{background:tab===k?"#3B82F6":"transparent",border:`1px solid ${tab===k?"#3B82F6":T.border}`,color:tab===k?"#fff":T.textMuted,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:tab===k?700:400,fontSize:11}}>{l}</button>
        ))}
      </div>

      {tab==="grille"&&(
        <div>
          {/* Grille de scoring */}
          {data.concurrents.length>0&&data.criteres.length>0?(
            <div style={{overflowX:"auto",marginBottom:14}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr>
                    <th style={{background:T.surface3,padding:"8px 12px",color:T.textMuted,textAlign:"left",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:10}}>Critère</th>
                    {data.concurrents.map((c,i)=>(
                      <th key={c} style={{background:i===0?"#3B82F615":T.surface3,padding:"8px 10px",color:i===0?"#3B82F6":T.textMuted,textAlign:"center",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>
                        {c}
                        {i>0&&<button onClick={()=>save({...data,concurrents:data.concurrents.filter((_,j)=>j!==i)})} style={{display:"block",margin:"2px auto 0",background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:9}}>✕</button>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.criteres.map((crit,ci)=>(
                    <tr key={crit} style={{background:ci%2===0?T.surface2:T.surface3}}>
                      <td style={{padding:"8px 12px",color:T.text,borderBottom:`1px solid ${T.border}22`,fontWeight:600,fontSize:11}}>
                        {crit}
                        <button onClick={()=>save({...data,criteres:data.criteres.filter(c=>c!==crit)})} style={{marginLeft:6,background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:9}}>✕</button>
                      </td>
                      {data.concurrents.map((conc,i)=>(
                        <td key={conc} style={{padding:"6px 8px",textAlign:"center",borderBottom:`1px solid ${T.border}22`}}>
                          <div style={{display:"flex",justifyContent:"center",gap:2}}>
                            {[1,2,3,4,5].map(v=>(
                              <button key={v} onClick={()=>setScore(conc,crit,v===getScore(conc,crit)?0:v)}
                                style={{width:20,height:20,borderRadius:"50%",border:"none",cursor:"pointer",fontSize:10,
                                  background:getScore(conc,crit)>=v?(i===0?"#3B82F6":"#A855F7"):"transparent",
                                  color:getScore(conc,crit)>=v?"#fff":T.textDim}}>
                                •
                              </button>
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Moyenne */}
                  <tr style={{background:"#3B82F610",borderTop:`2px solid ${T.border}`}}>
                    <td style={{padding:"8px 12px",color:"#3B82F6",fontWeight:800,fontSize:11}}>⊘ Moyenne</td>
                    {data.concurrents.map(conc=>{
                      const scores=data.criteres.map(c=>getScore(conc,c));
                      const avg=scores.length>0?(scores.reduce((s,v)=>s+v,0)/scores.length).toFixed(1):0;
                      return<td key={conc} style={{padding:"8px 8px",textAlign:"center",fontWeight:900,color:conc===data.concurrents[0]?"#3B82F6":"#A855F7",fontSize:13}}>{avg}/5</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          ):(
            <div style={{textAlign:"center",padding:30,color:T.textMuted,background:T.surface2,borderRadius:10,marginBottom:14}}>
              <div style={{fontSize:36,marginBottom:8}}>📏</div>
              <div style={{fontWeight:700,marginBottom:8}}>Aucune donnée</div>
              <button onClick={initDefaults} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:8,padding:"8px 20px",cursor:"pointer",fontWeight:700}}>Initialiser avec des données types</button>
            </div>
          )}
          {/* Ajout concurrent / critère */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {showAddConc?(
              <div style={{display:"flex",gap:6}}>
                <input value={newConc} onChange={e=>setNewConc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addConcurrent()} placeholder="Nom du concurrent" autoFocus
                  style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px",color:T.text,fontSize:11}}/>
                <button onClick={addConcurrent} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>✓</button>
                <button onClick={()=>setShowAddConc(false)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11}}>✕</button>
              </div>
            ):(
              <button onClick={()=>setShowAddConc(true)} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Concurrent</button>
            )}
            <div style={{display:"flex",gap:6}}>
              <input value={newCrit} onChange={e=>setNewCrit(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCritere()} placeholder="Nouveau critère..."
                style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px",color:T.text,fontSize:11}}/>
              <button onClick={addCritere} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Critère</button>
            </div>
          </div>
        </div>
      )}

      {tab==="radar"&&(
        <div style={{background:T.surface2,borderRadius:12,padding:20,border:`1px solid ${T.border}`}}>
          <div style={{color:T.text,fontWeight:800,fontSize:13,marginBottom:14}}>📡 Positionnement relatif — Vue synthétique</div>
          {data.concurrents.length>0&&data.criteres.length>0 ? (
            <div>
              {data.criteres.map(crit=>{
                const maxScore=5;
                return(
                  <div key={crit} style={{marginBottom:10}}>
                    <div style={{color:T.textMuted,fontSize:11,fontWeight:600,marginBottom:4}}>{crit}</div>
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      {data.concurrents.map((conc,i)=>{
                        const sc=getScore(conc,crit);
                        const pct=(sc/maxScore)*100;
                        return(
                          <div key={conc} style={{flex:1}}>
                            <div style={{fontSize:9,color:i===0?"#3B82F6":"#A855F7",marginBottom:2,fontWeight:i===0?700:400}}>{conc.slice(0,12)}: {sc}/5</div>
                            <div style={{height:8,background:T.surface3,borderRadius:99,overflow:"hidden"}}>
                              <div style={{height:"100%",width:`${pct}%`,background:i===0?"#3B82F6":"#A855F7",borderRadius:99,transition:"width 0.3s"}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Score global */}
              <div style={{marginTop:16,background:"#3B82F610",borderRadius:10,padding:12,border:"1px solid #3B82F633"}}>
                <div style={{color:"#3B82F6",fontWeight:800,fontSize:12,marginBottom:8}}>📊 Score global par acteur</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {data.concurrents.map((conc,i)=>{
                    const sc=data.criteres.map(c=>getScore(conc,c));
                    const avg=sc.length>0?(sc.reduce((s,v)=>s+v,0)/sc.length):0;
                    const pct=(avg/5)*100;
                    return(
                      <div key={conc} style={{flex:"1 1 120px",background:T.surface2,borderRadius:8,padding:"10px 12px",textAlign:"center",border:`2px solid ${i===0?"#3B82F6":T.border}`}}>
                        <div style={{color:i===0?"#3B82F6":"#A855F7",fontWeight:900,fontSize:20}}>{avg.toFixed(1)}</div>
                        <div style={{color:T.text,fontSize:10,fontWeight:700}}>{conc.slice(0,14)}</div>
                        <ProgressBar value={pct} color={i===0?"#3B82F6":"#A855F7"}/>
                        <div style={{color:T.textDim,fontSize:9}}>{pct.toFixed(0)}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ):(
            <div style={{textAlign:"center",padding:30,color:T.textMuted}}>Remplissez la grille de scores d'abord (onglet Grille)</div>
          )}
        </div>
      )}

      {tab==="analyse"&&(
        <div>
          <button onClick={callAI} disabled={aiLoading||data.concurrents.length===0}
            style={{background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12,marginBottom:14,width:"100%"}}>
            {aiLoading?"⏳ Analyse en cours...":"✨ Lancer l'analyse IA benchmarking"}
          </button>
          {aiText&&(
            <div style={{background:T.surface2,borderRadius:12,padding:16,border:`1px solid ${T.border}`,whiteSpace:"pre-wrap",lineHeight:1.7,fontSize:12,color:T.text}}>
              <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:10}}>✨ Analyse IA — Benchmarking Concurrentiel</div>
              {aiText}
            </div>
          )}
          {!aiText&&!aiLoading&&<div style={{textAlign:"center",padding:40,color:T.textMuted,fontSize:12}}>Cliquez "Lancer l'analyse" pour obtenir une analyse IA détaillée de votre positionnement concurrentiel.</div>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MATRICE ANSOFF
// ══════════════════════════════════════════════════════════════════════════

export function AnsoffPanel({ T, currentUser, setNotifications=_noop }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const { sessions, activeId, setActive, createSession, deleteSession, dataKey } = useToolSessions("ansoff", currentUser.id);
  const [data, setData] = React.useState(() => { try{return JSON.parse(_lsGet(dataKey)||"{}");}catch(_){return{};} });
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiCell, setAiCell] = React.useState(null);
  const [aiText, setAiText] = React.useState("");

  React.useEffect(() => {
    try { setData(JSON.parse(_lsGet(dataKey)||"{}")); } catch(_) { setData({}); }
    setAiText(""); setAiCell(null);
  }, [dataKey]);

  const save = (id, val) => { const n={...data,[id]:val}; setData(n); try{_lsSet(dataKey,JSON.stringify(n));}catch(_){}; };

  const handleReset = async () => {
    if (!await gcConfirm("Réinitialiser toute la matrice Ansoff de ce projet ?")) return;
    setData({}); try { _lsRm(dataKey); } catch(_) {} setAiText(""); setAiCell(null);
  };

  const CELLS = [
    { id:"penetration",   label:"🎯 Pénétration de marché", row:0, col:0, color:"#22C55E",
      desc:"Produits/services existants → Marchés existants",
      question:"Comment gagner plus de parts de marché sur vos segments actuels ?" },
    { id:"dev_marche",    label:"🗺️ Développement de marché", row:0, col:1, color:"#3B82F6",
      desc:"Produits/services existants → Nouveaux marchés",
      question:"Comment atteindre de nouveaux clients avec vos offres actuelles ?" },
    { id:"dev_produit",   label:"💡 Développement produit",  row:1, col:0, color:"#F59E0B",
      desc:"Nouveaux produits/services → Marchés existants",
      question:"Quelles nouvelles offres pouvez-vous proposer à vos clients actuels ?" },
    { id:"diversification",label:"🚀 Diversification",       row:1, col:1, color:"#C41E3A",
      desc:"Nouveaux produits/services → Nouveaux marchés",
      question:"Quelles nouvelles activités pouvez-vous développer sur de nouveaux marchés ?" },
  ];

  const callAI = async (cell) => {
    setAiLoading(true); setAiCell(cell.id); setAiText("");
    const ctx=CELLS.map(c=>`${c.label}: ${data[c.id]||"Non défini"}`).join("\n");
    try{
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:`Tu es un consultant stratégique expert pour Génie Consultant (cabinet de conseil juridique et d'affaires, Libreville, Gabon).\n\nContexte Ansoff global:\n${ctx}\n\nGénère des recommandations concrètes pour la stratégie: ${cell.label}\n${cell.desc}\n${cell.question}\n\nContexte spécifique saisi:\n${data[cell.id]||"Vide"}\n\n4-6 actions concrètes et réalistes pour le marché gabonais.`}]})});
      const d=await resp.json(); setAiText(d.content?.[0]?.text||"Erreur.");
    }catch(e){setAiText("Erreur: "+e.message);}
    setAiLoading(false);
  };

  const [activeCell, setActiveCell] = React.useState("penetration");

  return(
    <div>
      <SessionBar sessions={sessions} activeId={activeId} onSetActive={setActive} onNew={createSession} onDelete={deleteSession} T={T} color="#C41E3A" />
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>🚀 Matrice Ansoff — Stratégies de croissance</div>
          <div style={{color:T.textMuted,fontSize:11}}>Identifiez votre stratégie de développement selon produits/marchés existants ou nouveaux</div>
        </div>
        <button onClick={handleReset} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>↺ Réinitialiser</button>
      </div>

      {/* Grille 2×2 */}
      <div style={{display:"grid",gridTemplateColumns:"auto 1fr 1fr",gridTemplateRows:"auto 1fr 1fr",gap:4,marginBottom:14}}>
        {/* Headers */}
        <div style={{background:T.surface3,padding:"10px 12px",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}/>
        <div style={{background:T.surface3,padding:"10px 12px",borderRadius:8,textAlign:"center",color:T.text,fontWeight:700,fontSize:11}}>📦 Marchés existants</div>
        <div style={{background:T.surface3,padding:"10px 12px",borderRadius:8,textAlign:"center",color:T.text,fontWeight:700,fontSize:11}}>🗺️ Nouveaux marchés</div>
        <div style={{background:T.surface3,padding:"10px 12px",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",writingMode:"horizontal-tb",color:T.text,fontWeight:700,fontSize:11,textAlign:"center"}}>🛠 Offres<br/>existantes</div>
        {CELLS.filter(c=>c.row===0).map(cell=>(
          <div key={cell.id} onClick={()=>setActiveCell(cell.id)}
            style={{background:activeCell===cell.id?cell.color+"22":T.surface2,border:`2px solid ${activeCell===cell.id?cell.color:T.border}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"all 0.2s",minHeight:120}}>
            <div style={{color:cell.color,fontWeight:800,fontSize:11,marginBottom:4}}>{cell.label}</div>
            <div style={{color:T.textMuted,fontSize:9,marginBottom:8}}>{cell.desc}</div>
            <div style={{color:T.text,fontSize:10,whiteSpace:"pre-wrap",lineHeight:1.5}}>{data[cell.id]||<span style={{color:T.textDim,fontStyle:"italic"}}>Cliquer pour renseigner</span>}</div>
          </div>
        ))}
        <div style={{background:T.surface3,padding:"10px 12px",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:T.text,fontWeight:700,fontSize:11,textAlign:"center"}}>🆕 Nouvelles<br/>offres</div>
        {CELLS.filter(c=>c.row===1).map(cell=>(
          <div key={cell.id} onClick={()=>setActiveCell(cell.id)}
            style={{background:activeCell===cell.id?cell.color+"22":T.surface2,border:`2px solid ${activeCell===cell.id?cell.color:T.border}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"all 0.2s",minHeight:120}}>
            <div style={{color:cell.color,fontWeight:800,fontSize:11,marginBottom:4}}>{cell.label}</div>
            <div style={{color:T.textMuted,fontSize:9,marginBottom:4}}>{cell.desc}</div>
            <div style={{color:T.text,fontSize:10,whiteSpace:"pre-wrap",lineHeight:1.5}}>{data[cell.id]||<span style={{color:T.textDim,fontStyle:"italic"}}>Cliquer pour renseigner</span>}</div>
          </div>
        ))}
      </div>

      {/* Panneau édition */}
      {activeCell&&(()=>{
        const cell=CELLS.find(c=>c.id===activeCell);
        return(
          <div style={{background:cell.color+"12",border:`1px solid ${cell.color}44`,borderRadius:12,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{color:cell.color,fontWeight:800,fontSize:13}}>{cell.label}</div>
              <button onClick={()=>callAI(cell)} disabled={aiLoading&&aiCell===cell.id}
                style={{background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>
                {aiLoading&&aiCell===cell.id?"⏳ IA...":"✨ Suggestions IA"}
              </button>
            </div>
            <div style={{color:T.textMuted,fontSize:11,marginBottom:8}}>{cell.question}</div>
            <textarea value={data[activeCell]||""} onChange={e=>save(activeCell,e.target.value)}
              placeholder={`Décrivez vos initiatives de ${cell.label.toLowerCase()}...`}
              style={{width:"100%",background:T.surface2,border:`1px solid ${cell.color}44`,borderRadius:8,padding:"10px 12px",color:T.text,fontSize:12,resize:"vertical",minHeight:80,boxSizing:"border-box",fontFamily:"inherit"}}/>
            {aiText&&aiCell===activeCell&&(
              <div style={{background:"#A855F715",border:"1px solid #A855F744",borderRadius:8,padding:"10px 12px",marginTop:8}}>
                <div style={{color:"#A855F7",fontWeight:700,fontSize:10,marginBottom:6}}>✨ Recommandations IA</div>
                <div style={{color:T.text,fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.6}}>{aiText}</div>
                <button onClick={()=>save(activeCell,(data[activeCell]?data[activeCell]+"\n\n":"")+aiText)}
                  style={{marginTop:8,background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                  ➕ Intégrer
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}


