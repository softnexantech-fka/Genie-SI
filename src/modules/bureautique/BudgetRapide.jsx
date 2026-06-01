import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// BudgetRapide.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop } from '../../core/index.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';

export function BudgetRapideApp({ T, currentUser, setNotifications=_noop }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [entrees, setEntrees] = useState(()=>{try{return JSON.parse(_lsGet("gc-budget-rapide")||"[]");}catch (_) {return [];}});
  const [form, setForm] = useState({label:"",montant:"",type:"DEPENSE",categorie:"Autre",date:new Date().toISOString().slice(0,10),notes:""});
  const [filter, setFilter] = useState("all");
  const CATS_DEPENSES=["Fournitures","Transport","Repas","Loyer","Services","Salaires","Impôts","Autre"];
  const CATS_ENTREES=["Honoraires","Prestation","Subvention","Remboursement","Autre"];
  const save=d=>{setEntrees(d);try{_lsSet("gc-budget-rapide",JSON.stringify(d.slice(0,500)));}catch (_) {}};
  const addEntry=()=>{
    if(!form.label||!form.montant){gcAlert("Libellé et montant requis.");return;}
    const e={id:"BR"+Date.now(),...form,montant:parseFloat(form.montant)||0,createdBy:currentUser?.name,createdAt:new Date().toISOString()};
    save([e,...entrees]); setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📉",message:`${form.type==="DEPENSE"?"Dépense":"Recette"} "${form.label}" enregistrée`,at:new Date().toISOString(),read:false},...p]);
    setForm(f=>({...f,label:"",montant:"",notes:""}));
  };
  const filtered=entrees.filter(e=>filter==="all"||e.type===filter);
  const totalEntrees=entrees.filter(e=>e.type==="ENTREE").reduce((a,e)=>a+e.montant,0);
  const totalDepenses=entrees.filter(e=>e.type==="DEPENSE").reduce((a,e)=>a+e.montant,0);
  const solde=totalEntrees-totalDepenses;
  const catSummary=filtered.reduce((a,e)=>{a[e.categorie]=(a[e.categorie]||0)+e.montant;return a;},{});
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
        {[{l:"Recettes",v:totalEntrees,c:"#22C55E",icon:"📈"},{l:"Dépenses",v:totalDepenses,c:"#EF4444",icon:"📉"},{l:"Solde",v:solde,c:solde>=0?"#3B82F6":"#F97316",icon:"💰"}].map(k=>(
          <div key={k.l} style={{background:T.surface2,border:`2px solid ${k.c}33`,borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:20,marginBottom:4}}>{k.icon}</div>
            <div style={{color:k.c,fontWeight:900,fontSize:18}}>{k.v.toLocaleString("fr-FR")}</div>
            <div style={{color:T.textMuted,fontSize:10}}>{k.l} (FCFA)</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:14}}>
        <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}}>
          <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>+ Nouvelle entrée</div>
          {[["Libellé","label","text"],["Montant (FCFA)","montant","number"],["Date","date","date"]].map(([l,k,t])=>(
            <div key={k} style={{marginBottom:8}}><label style={{color:T.textDim,fontSize:10,display:"block",marginBottom:2}}>{l}</label><input value={form[k]} type={t} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
          ))}
          <div style={{marginBottom:8}}>
            <label style={{color:T.textDim,fontSize:10,display:"block",marginBottom:2}}>Type</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {["DEPENSE","ENTREE"].map(t=><button key={t} onClick={()=>setForm(f=>({...f,type:t,categorie:"Autre"}))} style={{background:form.type===t?(t==="DEPENSE"?"#EF4444":"#22C55E")+"22":"transparent",border:`1px solid ${form.type===t?(t==="DEPENSE"?"#EF4444":"#22C55E")+"66":T.border}`,borderRadius:6,padding:"6px",cursor:"pointer",color:t==="DEPENSE"?"#EF4444":"#22C55E",fontWeight:form.type===t?700:400,fontSize:11}}>{t==="DEPENSE"?"📉 Dépense":"📈 Recette"}</button>)}
            </div>
          </div>
          <div style={{marginBottom:8}}><label style={{color:T.textDim,fontSize:10,display:"block",marginBottom:2}}>Catégorie</label>
            <select value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 8px",color:T.text,fontSize:11}}>
              {(form.type==="DEPENSE"?CATS_DEPENSES:CATS_ENTREES).map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={addEntry} style={{width:"100%",background:"#10B981",border:"none",color:"#fff",borderRadius:7,padding:"9px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Enregistrer</button>
        </div>
        <div>
          <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"center"}}>
            {["all","DEPENSE","ENTREE"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?"#10B98122":"transparent",border:`1px solid ${filter===f?"#10B98166":T.border}`,borderRadius:7,padding:"5px 12px",color:filter===f?"#10B981":T.textMuted,fontSize:11,fontWeight:filter===f?700:400}}>{f==="all"?"Tout":f==="DEPENSE"?"Dépenses":"Recettes"}</button>)}
            <span style={{marginLeft:"auto",color:T.textDim,fontSize:10}}>{filtered.length} entrées</span>
            <button onClick={()=>{const csv=["Date,Libellé,Type,Catégorie,Montant",...filtered.map(e=>`"${e.date}","${e.label}","${e.type}","${e.categorie}","${e.montant}"`)].join("\n");const b=new Blob(["\uFEFF"+csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="budget_rapide.csv";a.click();URL.revokeObjectURL(u);}} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>⬇ CSV</button>
          </div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,marginBottom:10,padding:10}}>
            <div style={{color:T.textMuted,fontSize:10,fontWeight:700,marginBottom:7}}>Répartition par catégorie</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {Object.entries(catSummary).sort((a,b)=>b[1]-a[1]).map(([cat,v])=>(
                <div key={cat} style={{background:T.surface3,borderRadius:6,padding:"4px 10px",fontSize:10}}>
                  <span style={{color:T.text,fontWeight:600}}>{cat}</span>
                  <span style={{color:"#C9A84C",marginLeft:6,fontWeight:700}}>{v.toLocaleString("fr-FR")} F</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:400,overflowY:"auto"}}>
            {filtered.length===0?<div style={{color:T.textMuted,textAlign:"center",padding:24}}>Aucune entrée</div>:filtered.map(e=>(
              <div key={e.id} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8}}>
                <span style={{fontSize:16}}>{e.type==="DEPENSE"?"📉":"📈"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.label}</div>
                  <div style={{color:T.textDim,fontSize:9}}>{e.categorie} · {e.date}</div>
                </div>
                <span style={{color:e.type==="DEPENSE"?"#EF4444":"#22C55E",fontWeight:700,fontSize:12}}>{e.type==="DEPENSE"?"-":"+"}{e.montant.toLocaleString("fr-FR")}</span>
                <button onClick={()=>save(entrees.filter(x=>x.id!==e.id))} style={{background:"none",border:"none",color:"#EF444466",cursor:"pointer",fontSize:11}}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}



