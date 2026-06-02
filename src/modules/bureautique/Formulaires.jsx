import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// Formulaires.jsx — SI Génie Consultant v127
import { _noop } from '../../core/index.js';
import { useSyncedState } from '../../hooks/useSyncedState.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function FormulaireApp({ T, currentUser, setNotifications=_noop }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const [forms, setForms] = useSyncedState("gc-forms", []);
  const [activeForm, setActiveForm] = useState(null);
  const [editMode, setEditMode] = useState(false);
  // FIX v135 — All hooks must be at component root before early returns
  const [resp, setResp] = useState({});
  
  const FIELD_TYPES = [{id:"text",label:"Texte court"},{id:"textarea",label:"Texte long"},{id:"number",label:"Nombre"},{id:"date",label:"Date"},{id:"select",label:"Liste déroulante"},{id:"checkbox",label:"Case à cocher"},{id:"yesno",label:"Oui / Non"}];
  const save = (f) => setForms(f);
  const newForm = () => {
    const f = { id:"FM-"+Date.now(), title:"Nouveau formulaire", desc:"", fields:[{id:"f1",type:"text",label:"Champ 1",required:false,options:""}], responses:[], createdAt:new Date().toISOString(), createdBy:currentUser.name };
    const all = [f,...forms]; save(all); setActiveForm(f.id); setEditMode(true);
  };
  const form = forms.find(f=>f.id===activeForm);
  const updateForm = (upd) => { const all=forms.map(f=>f.id===activeForm?{...f,...upd}:f); save(all); };
  const addField = () => updateForm({ fields:[...(form?.fields||[]),{id:"f"+Date.now(),type:"text",label:"Nouveau champ",required:false,options:""}] });
  const updateField = (fid, upd) => updateForm({ fields:form.fields.map(f=>f.id===fid?{...f,...upd}:f) });
  const delField = (fid) => updateForm({ fields:form.fields.filter(f=>f.id!==fid) });
  if (!activeForm) return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:T.textMuted,fontSize:12}}>{forms.length} formulaire(s) enregistré(s)</div>
        <button onClick={newForm} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nouveau formulaire</button>
      </div>
      {forms.length===0&&<div style={{textAlign:"center",padding:40,color:T.textMuted}}>Aucun formulaire. Créez-en un !</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
        {forms.map(f=>(
          <div key={f.id} style={{background:T.surface2,border:`1px solid ${"#F97316"}44`,borderRadius:12,padding:"14px 16px"}}>
            <div style={{color:T.text,fontWeight:800,fontSize:13}}>{f.title}</div>
            <div style={{color:T.textMuted,fontSize:10,marginBottom:10}}>{f.fields.length} champ(s) · {f.responses?.length||0} réponse(s)</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setActiveForm(f.id);setEditMode(false);}} style={{flex:1,background:"#F9731622",border:"1px solid #F9731644",color:"#F97316",borderRadius:7,padding:"6px",cursor:"pointer",fontSize:11,fontWeight:700}}>📋 Remplir</button>
              <button onClick={()=>{setActiveForm(f.id);setEditMode(true);}} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontSize:11}}>✏️</button>
              <button onClick={()=>{save(forms.filter(x=>x.id!==f.id));}} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"6px 10px",cursor:"pointer",fontSize:11}}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  if (!form) return null;
  if (editMode) return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
        <button onClick={()=>{setActiveForm(null);setEditMode(false);}} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px",cursor:"pointer",color:T.textMuted,fontSize:11}}>← Retour</button>
        <input value={form.title} onChange={e=>updateForm({title:e.target.value})} style={{flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 12px",color:T.text,fontWeight:800,fontSize:14}} />
        <button onClick={addField} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Champ</button>
        <button onClick={()=>setEditMode(false)} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Prévisualiser</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {form.fields.map((field,fi)=>(
          <div key={field.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:8,alignItems:"flex-start"}}>
            <div style={{color:T.textDim,fontSize:12,fontWeight:700,minWidth:24,paddingTop:8}}>{fi+1}</div>
            <div style={{flex:1,display:"flex",gap:8,flexWrap:"wrap"}}>
              <input value={field.label} onChange={e=>updateField(field.id,{label:e.target.value})} placeholder="Label du champ" style={{flex:2,minWidth:120,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}} />
              <select value={field.type} onChange={e=>updateField(field.id,{type:e.target.value})} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:12}}>
                {FIELD_TYPES.map(ft=><option key={ft.id} value={ft.id}>{ft.label}</option>)}
              </select>
              {field.type==="select"&&<input value={field.options||""} onChange={e=>updateField(field.id,{options:e.target.value})} placeholder="Options (séparées par ,)" style={{flex:2,minWidth:120,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}} />}
              <label style={{display:"flex",alignItems:"center",gap:5,color:T.textMuted,fontSize:11,cursor:"pointer"}}><input type="checkbox" checked={field.required||false} onChange={e=>updateField(field.id,{required:e.target.checked})} />Requis</label>
            </div>
            <button onClick={()=>delField(field.id)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14,padding:"6px"}}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  );
  const submitForm = () => {
    const missing = form.fields.filter(f=>f.required&&!resp[f.id]);
    if (missing.length) { gcAlert("Champs obligatoires manquants : "+missing.map(f=>f.label).join(", ")); return; }
    const all = forms.map(f=>f.id===activeForm?{...f,responses:[...(f.responses||[]),{id:"R"+Date.now(),by:currentUser.name,at:new Date().toISOString(),data:resp}]}:f);
    save(all);
    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📋",message:`Formulaire "${form.title}" soumis`,at:new Date().toISOString(),read:false},...p]);
    gcAlert("✅ Formulaire soumis avec succès !");
    setResp({});
  };
  return (
    <div style={{maxWidth:600}}>
      <div style={{display:"flex",gap:8,marginBottom:18,alignItems:"center"}}>
        <button onClick={()=>setActiveForm(null)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px",cursor:"pointer",color:T.textMuted,fontSize:11}}>← Retour</button>
        <div style={{flex:1,color:T.text,fontWeight:900,fontSize:15}}>{form.title}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {form.fields.map(f=>(
          <div key={f.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px"}}>
            <label style={{color:T.text,fontWeight:700,fontSize:12,display:"block",marginBottom:7}}>{f.label}{f.required&&<span style={{color:"#EF4444",marginLeft:4}}>*</span>}</label>
            {f.type==="text"&&<input value={resp[f.id]||""} onChange={e=>setResp(r=>({...r,[f.id]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}} />}
            {f.type==="textarea"&&<textarea value={resp[f.id]||""} onChange={e=>setResp(r=>({...r,[f.id]:e.target.value}))} rows={3} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,resize:"vertical"}} />}
            {f.type==="number"&&<input type="number" value={resp[f.id]||""} onChange={e=>setResp(r=>({...r,[f.id]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}} />}
            {f.type==="date"&&<input type="date" value={resp[f.id]||""} onChange={e=>setResp(r=>({...r,[f.id]:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}} />}
            {f.type==="select"&&<select value={resp[f.id]||""} onChange={e=>setResp(r=>({...r,[f.id]:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,width:"100%"}}><option value="">-- Choisir --</option>{(f.options||"").split(",").filter(Boolean).map(o=><option key={o.trim()} value={o.trim()}>{o.trim()}</option>)}</select>}
            {f.type==="checkbox"&&<input type="checkbox" checked={!!resp[f.id]} onChange={e=>setResp(r=>({...r,[f.id]:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}} />}
            {f.type==="yesno"&&<div style={{display:"flex",gap:10}}>{["Oui","Non"].map(v=><button key={v} onClick={()=>setResp(r=>({...r,[f.id]:v}))} style={{flex:1,background:resp[f.id]===v?"#22C55E":"#22C55E22",border:"1px solid #22C55E44",color:resp[f.id]===v?"#fff":"#22C55E",borderRadius:7,padding:"8px",cursor:"pointer",fontWeight:700,fontSize:12}}>{v}</button>)}</div>}
          </div>
        ))}
        <button onClick={submitForm} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:9,padding:"12px",cursor:"pointer",fontWeight:800,fontSize:13}}>📤 Soumettre le formulaire</button>
      </div>
    </div>
  );
};


