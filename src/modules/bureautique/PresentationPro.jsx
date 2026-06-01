import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// PresentationPro.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop } from '../../core/index.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';

export function PresentationApp({ T, currentUser, setNotifications=_noop }){
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const BLANK_SLIDE = (bg,color,layout,accent) => ({
    id:"S"+Date.now(), title:"Nouvelle diapositive", subtitle:"", content:"",
    bullets:["Point clé 1","Point clé 2","Point clé 3"],
    bg, color, accent:accent||"#8B5CF6", layout:layout||"title-content",
    img:null, notes:"", transition:"fade",
    titleSize:36, contentSize:16, titleBold:true, titleFont:"Segoe UI",
    shapes:[], animations:[],
  });
  const GC_THEMES = [
    {id:"gc-navy",  label:"GC Marine",   bg:"#0A1E4A", color:"#FFFFFF", accent:"#C9A84C"},
    {id:"gc-gold",  label:"GC Gold",     bg:"#1a1000", color:"#C9A84C", accent:"#FFFFFF"},
    {id:"gc-slate", label:"Ardoise Pro", bg:"#1E293B", color:"#F1F5F9", accent:"#38BDF8"},
    {id:"gc-forest",label:"Forêt",       bg:"#052e16", color:"#D1FAE5", accent:"#34D399"},
    {id:"gc-rouge", label:"Rouge Vif",   bg:"#450a0a", color:"#FEE2E2", accent:"#F87171"},
    {id:"gc-white", label:"Blanc Pro",   bg:"#FFFFFF", color:"#1E293B", accent:"#8B5CF6"},
    {id:"gc-violet",label:"Violet",      bg:"#2e1065", color:"#EDE9FE", accent:"#A78BFA"},
    {id:"gc-dark",  label:"Noir Élégant",bg:"#0F0F0F", color:"#F9FAFB", accent:"#F59E0B"},
  ];
  const LAYOUTS = [
    {id:"title-center",  label:"Titre centré",    icon:"⬛"},
    {id:"title-content", label:"Titre + Contenu", icon:"📄"},
    {id:"title-bullets", label:"Titre + Puces",   icon:"📋"},
    {id:"two-columns",   label:"Deux colonnes",   icon:"⬜⬜"},
    {id:"big-number",    label:"Chiffre clé",     icon:"🔢"},
    {id:"image-right",   label:"Image à droite",  icon:"🖼️"},
    {id:"quote",         label:"Citation",        icon:"💬"},
    {id:"agenda",        label:"Agenda/Plan",     icon:"📅"},
    {id:"comparison",    label:"Comparaison",     icon:"⚖️"},
    {id:"blank",         label:"Vierge",          icon:"◻️"},
  ];
  const TRANSITIONS = [
    {id:"none",     label:"Aucune"},
    {id:"fade",     label:"Fondu"},
    {id:"slideLeft",label:"Glisser ←"},
    {id:"slideUp",  label:"Glisser ↑"},
    {id:"zoom",     label:"Zoom"},
    {id:"flip",     label:"Retournement"},
    {id:"wipe",     label:"Balayage"},
  ];
  const ANIMATIONS = ["none","fadeIn","slideInLeft","slideInUp","zoomIn","bounceIn"];

  const [decks, setDecks] = React.useState(()=>{ try{return JSON.parse(_lsGet("gc-pres-decks-v2")||"null")||[];}catch(_){return[];} });
  const [activeDeck, setActiveDeck] = React.useState(null);
  const [activeSlide, setActiveSlide] = React.useState(0);
  const [presenting, setPresenting] = React.useState(false);
  const [presIdx, setPresIdx] = React.useState(0);
  const [tab, setTab] = React.useState("slides");
  const [showNewDeck, setShowNewDeck] = React.useState(false);
  const [newDeckTitle, setNewDeckTitle] = React.useState("");
  const [newDeckTheme, setNewDeckTheme] = React.useState("gc-navy");
  const [dragIdx, setDragIdx] = React.useState(null);
  const [showLayouts, setShowLayouts] = React.useState(false);
  const [transAnim, setTransAnim] = React.useState("");
  const [presTimer, setPresTimer] = React.useState(0);
  const [presRunning, setPresRunning] = React.useState(false);
  const [showNotesPres, setShowNotesPres] = React.useState(false);
  const [slideScale, setSlideScale] = React.useState(100);
  const timerRef = React.useRef(null);
  const presRef = React.useRef(null);

  const saveDecks = (d) => { setDecks(d); try{_lsSet("gc-pres-decks-v2",JSON.stringify(d));}catch(_){} };
  const deck = decks.find(d=>d.id===activeDeck);
  const slides = deck?.slides||[];
  const slide = slides[activeSlide];
  const themeObj = GC_THEMES.find(t=>t.id===(deck?.theme||"gc-navy"))||GC_THEMES[0];

  // Presentation timer
  React.useEffect(()=>{
    if(presenting&&presRunning){timerRef.current=setInterval(()=>setPresTimer(t=>t+1),1000);}
    else{clearInterval(timerRef.current);}
    return()=>clearInterval(timerRef.current);
  },[presenting,presRunning]);

  const fmtTimer=(s)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  // Transition animation
  const triggerTransition = (id) => {
    const anims={fade:"gc-fade-in",slideLeft:"gc-fade-left",slideUp:"gc-fade-up",zoom:"gc-zoom-in",wipe:"gc-slide-down",flip:"gc-zoom-in",none:""};
    const anim=anims[slides[id]?.transition||"fade"]||"gc-fade-in";
    setTransAnim(anim); setTimeout(()=>setTransAnim(""),400);
  };

  const navPres=(dir)=>{
    const next=Math.max(0,Math.min(slides.length-1,presIdx+dir));
    triggerTransition(next); setPresIdx(next);
  };

  React.useEffect(()=>{
    if(!presenting) return;
    const handler=(e)=>{
      if(e.key==="ArrowRight"||e.key===" ") navPres(1);
      else if(e.key==="ArrowLeft") navPres(-1);
      else if(e.key==="Escape") setPresenting(false);
      else if(e.key==="n"||e.key==="N") setShowNotesPres(p=>!p);
      else if(e.key==="t"||e.key==="T") setPresRunning(p=>!p);
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[presenting,presIdx,slides.length]);

  const createDeck=()=>{
    if(!newDeckTitle.trim()) return;
    const theme=GC_THEMES.find(t=>t.id===newDeckTheme)||GC_THEMES[0];
    const d={id:"DECK"+Date.now(),title:newDeckTitle,theme:newDeckTheme,createdAt:new Date().toISOString(),createdBy:currentUser?.name||"Moi",
      slides:[{...BLANK_SLIDE(theme.bg,theme.color,"title-center",theme.accent),title:newDeckTitle,subtitle:"Sous-titre de la présentation",id:"S1"}]};
    const all=[...decks,d]; saveDecks(all); setActiveDeck(d.id); setActiveSlide(0); setShowNewDeck(false); setNewDeckTitle("");
  };
  const updateDeck=(upd)=>{ const all=decks.map(d=>d.id===activeDeck?{...d,...upd}:d); saveDecks(all); };
  const updateSlide=(field,val)=>{ const ns=slides.map((s,i)=>i===activeSlide?{...s,[field]:val}:s); updateDeck({slides:ns}); };
  const addSlide=(layout="title-content")=>{ const ns=[...slides,{...BLANK_SLIDE(themeObj.bg,themeObj.color,layout,themeObj.accent)}]; updateDeck({slides:ns}); setActiveSlide(ns.length-1); setShowLayouts(false); };
  const dupSlide=()=>{ const copy={...slide,id:"S"+Date.now()}; const ns=[...slides.slice(0,activeSlide+1),copy,...slides.slice(activeSlide+1)]; updateDeck({slides:ns}); setActiveSlide(activeSlide+1); };
  const delSlide=()=>{ if(slides.length<=1) return; const ns=slides.filter((_,i)=>i!==activeSlide); updateDeck({slides:ns}); setActiveSlide(Math.max(0,activeSlide-1)); };
  const moveSlide=(from,to)=>{ if(to<0||to>=slides.length) return; const ns=[...slides]; const[removed]=ns.splice(from,1); ns.splice(to,0,removed); updateDeck({slides:ns}); setActiveSlide(to); };
  const applyTheme=(themeId)=>{ const th=GC_THEMES.find(t=>t.id===themeId)||GC_THEMES[0]; const ns=slides.map(s=>({...s,bg:th.bg,color:th.color,accent:th.accent})); updateDeck({theme:themeId,slides:ns}); };

  const exportHTML=()=>{
    const th=themeObj;
    const css=`*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Segoe UI',sans-serif;background:#000;overflow:hidden;}
.slide{display:none;width:100vw;height:100vh;flex-direction:column;align-items:center;justify-content:center;padding:8vw;page-break-after:always;position:relative;}
.slide.active{display:flex;}
.progress{position:fixed;top:0;left:0;height:4px;background:rgba(255,255,255,0.2);width:100%;}
.progress-fill{height:100%;background:#8B5CF6;transition:width .4s;}
.nav{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:12px;align-items:center;}
.nav button{background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:18px;}
.slide-num{position:fixed;bottom:28px;right:28px;color:rgba(255,255,255,0.4);font-size:11px;}
.notes{position:fixed;bottom:60px;left:20px;color:rgba(255,255,255,0.35);font-size:11px;font-style:italic;max-width:50%;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideInLeft{from{opacity:0;transform:translateX(80px)}to{opacity:1;transform:none}}
@keyframes slideInUp{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:none}}
@keyframes zoomIn{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:none}}
@media print{.slide{display:flex!important;page-break-after:always;}.nav,.progress,.slide-num{display:none!important;}}`;
    const slideHTML=slides.map((s,i)=>{
      let body="";
      if(s.layout==="title-bullets") body=`<ul style="text-align:left;max-width:740px;margin:0 auto;line-height:2;font-size:${s.contentSize||16}px;">${(s.bullets||[]).map(b=>"<li>"+b+"</li>").join("")}</ul>`;
      else if(s.layout==="quote") body=`<blockquote style="font-size:${s.contentSize||18}px;font-style:italic;line-height:1.6;max-width:740px;text-align:center;opacity:0.9;">"${s.content||""}"${s.subtitle?`<br/><small style="font-size:0.6em;opacity:0.65;margin-top:10px;display:block;">— ${s.subtitle}</small>`:""}`;
      else if(s.layout==="big-number") body=`<div style="font-size:clamp(80px,18vw,200px);font-weight:900;color:${s.accent||s.color};line-height:1;">${s.content||"0"}</div>${s.subtitle?`<div style="font-size:${s.contentSize||18}px;opacity:0.7;margin-top:10px;">${s.subtitle}</div>`:""}`;
      else if(s.layout==="two-columns") body=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;max-width:860px;width:100%;font-size:${s.contentSize||15}px;"><div style="opacity:0.9;line-height:1.7;">${s.content||"Colonne gauche"}</div><div style="opacity:0.9;line-height:1.7;">${s.subtitle||"Colonne droite"}</div></div>`;
      else body=`<p style="font-size:${s.contentSize||16}px;line-height:1.8;max-width:760px;text-align:center;opacity:0.9;">${s.content||""}</p>`;
      const transStyle=s.transition&&s.transition!=="none"?`animation:${s.transition==="fade"?"fadeIn":s.transition==="slideLeft"?"slideInLeft":s.transition==="slideUp"?"slideInUp":"zoomIn"} 0.6s ease both`:"";
      return `<section class="slide" style="background:${s.bg};color:${s.color};${transStyle}">
  <h1 style="font-size:clamp(22px,5vw,${s.titleSize||44}px);font-weight:${s.titleBold?"900":"700"};color:${s.accent||s.color};margin-bottom:14px;text-align:center;font-family:'${s.titleFont||"Segoe UI"}';">${s.title}</h1>
  ${(s.layout!=="title-bullets"&&s.layout!=="quote"&&s.layout!=="two-columns"&&s.layout!=="big-number")&&s.subtitle?`<h2 style="font-size:clamp(14px,2vw,22px);opacity:0.7;margin-bottom:20px;text-align:center;">${s.subtitle}</h2>`:""}
  ${body}
  ${s.notes?`<div class="notes">📝 ${s.notes}</div>`:""}
</section>`;
    }).join("\n");
    const html=`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${deck?.title||"Présentation GC"}</title><style>${css}</style></head><body>
<div class="progress"><div class="progress-fill" id="pf" style="width:${100/slides.length}%"></div></div>
${slideHTML}
<div class="nav"><button onclick="nav(-1)">‹</button><span id="si" style="color:rgba(255,255,255,0.5);font-size:13px">1/${slides.length}</span><button onclick="nav(1)">›</button></div>
<div class="slide-num" id="sn">1 / ${slides.length}</div>
<script>let i=0;const sl=document.querySelectorAll('.slide');sl[0].classList.add('active');
function show(n){sl[i].classList.remove('active');i=Math.max(0,Math.min(sl.length-1,n));sl[i].classList.add('active');document.getElementById('pf').style.width=((i+1)/sl.length*100)+'%';document.getElementById('si').textContent=(i+1)+'/'+sl.length;document.getElementById('sn').textContent=(i+1)+' / '+sl.length;}
function nav(d){show(i+d);}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' ')nav(1);else if(e.key==='ArrowLeft')nav(-1);else if(e.key==='Escape')document.exitFullscreen?.();});
document.querySelectorAll('.slide').forEach(s=>s.addEventListener('click',()=>nav(1)));
document.body.requestFullscreen?.();
</script></body></html>`;
    const b=new Blob([html],{type:"text/html;charset=utf-8"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`${deck?.title||"presentation"}_GC.html`;a.click();URL.revokeObjectURL(u);
    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"🖥️",message:`Présentation "${deck?.title}" exportée — ${slides.length} diapositives`,at:new Date().toISOString(),read:false},...p]);
  };

  // SLIDE RENDERER
  const renderSlideContent = (s, editing=false, scale=1) => {
    const inp=(field,ph,style)=>editing?(
      <textarea value={s[field]||""} onChange={e=>updateSlide(field,e.target.value)} rows={field==="content"?4:2}
        style={{background:"transparent",border:editing?"1px dashed rgba(255,255,255,0.25)":"none",color:s.color,outline:"none",resize:"none",width:"100%",textAlign:"center",...style,padding:"4px 8px",borderRadius:4,fontFamily:s.titleFont||"inherit"}}
        placeholder={ph}/>
    ):(s[field]?<div style={{...style}}>{s[field]}</div>:null);

    const titleStyle={fontSize:(s.titleSize||36)*scale+"px",fontWeight:s.titleBold?"900":"700",color:s.accent||s.color,marginBottom:8*scale,textAlign:"center",lineHeight:1.15,fontFamily:s.titleFont||"inherit"};
    const subStyle={fontSize:(s.contentSize||16)*0.75*scale+"px",opacity:0.7,marginBottom:12*scale,textAlign:"center"};
    const contentStyle={fontSize:(s.contentSize||16)*scale+"px",opacity:0.9,lineHeight:1.7,textAlign:"center",maxWidth:"100%"};

    if(s.layout==="title-center"||s.layout==="title-content") return (
      <div style={{width:"100%",textAlign:"center"}}>
        {editing?inp("title","Titre de la diapositive",{...titleStyle,fontSize:(s.titleSize||36)+"px"}):
          <div style={titleStyle}>{s.title||"(sans titre)"}</div>}
        {editing?inp("subtitle","Sous-titre (optionnel)",{...subStyle,fontSize:(s.contentSize||16)*0.75+"px"}):
          (s.subtitle&&<div style={subStyle}>{s.subtitle}</div>)}
        {editing?inp("content","Contenu principal…",{...contentStyle,fontSize:(s.contentSize||16)+"px"}):
          (s.content&&<div style={contentStyle}>{s.content}</div>)}
      </div>
    );
    if(s.layout==="title-bullets") return (
      <div style={{width:"100%",maxWidth:700}}>
        {editing?inp("title","Titre",{...titleStyle,fontSize:(s.titleSize||36)+"px",textAlign:"left"}):
          <div style={{...titleStyle,textAlign:"left"}}>{s.title}</div>}
        <div style={{marginTop:8}}>
          {(s.bullets||[]).map((b,bi)=>(
            <div key={bi} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:6*scale}}>
              <span style={{color:s.accent||s.color,fontSize:(s.contentSize||16)*scale+"px",marginTop:2,flexShrink:0}}>▸</span>
              {editing?(
                <div style={{flex:1,display:"flex",gap:4}}>
                  <input value={b} onChange={e=>{const nb=[...(s.bullets||[])];nb[bi]=e.target.value;updateSlide("bullets",nb);}}
                    style={{flex:1,background:"transparent",border:"none",borderBottom:`1px solid ${s.color}44`,color:s.color,fontSize:(s.contentSize||16)+"px",outline:"none",padding:"3px 0"}} placeholder={`Point ${bi+1}`}/>
                  <button onClick={()=>updateSlide("bullets",(s.bullets||[]).filter((_,j)=>j!==bi))} style={{background:"transparent",border:"none",color:"rgba(255,100,100,0.7)",cursor:"pointer",fontSize:11}}>✕</button>
                </div>
              ):<div style={{color:s.color,fontSize:(s.contentSize||16)*scale+"px",lineHeight:1.6}}>{b}</div>}
            </div>
          ))}
          {editing&&<button onClick={()=>updateSlide("bullets",[...(s.bullets||[]),"Nouveau point"])} style={{background:"rgba(255,255,255,0.1)",border:"1px dashed rgba(255,255,255,0.3)",color:s.color,borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,marginTop:6}}>+ Ajouter</button>}
        </div>
      </div>
    );
    if(s.layout==="big-number") return (
      <div style={{textAlign:"center"}}>
        {editing?inp("content","Chiffre ou valeur…",{fontSize:"72px",fontWeight:900,color:s.accent||s.color,lineHeight:1}):
          <div style={{fontSize:scale*90+"px",fontWeight:900,color:s.accent||s.color,lineHeight:1}}>{s.content||"0"}</div>}
        {editing?inp("title","Titre…",{...titleStyle,fontSize:(s.titleSize||24)+"px"}):
          <div style={{...titleStyle,fontSize:(s.titleSize||24)*scale+"px"}}>{s.title}</div>}
        {editing?inp("subtitle","Sous-titre…",{...subStyle,fontSize:"14px"}):
          (s.subtitle&&<div style={{...subStyle,fontSize:14*scale+"px"}}>{s.subtitle}</div>)}
      </div>
    );
    if(s.layout==="two-columns") return (
      <div style={{width:"100%"}}>
        {editing?inp("title","Titre",{...titleStyle,fontSize:(s.titleSize||30)+"px",textAlign:"center",marginBottom:16}):
          <div style={{...titleStyle,fontSize:(s.titleSize||30)*scale+"px",textAlign:"center",marginBottom:16*scale}}>{s.title}</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20*scale}}>
          {editing?(
            <><textarea value={s.content||""} onChange={e=>updateSlide("content",e.target.value)} rows={5} style={{background:"rgba(255,255,255,0.05)",border:`1px dashed ${s.color}44`,color:s.color,borderRadius:8,padding:"10px",outline:"none",resize:"none",fontSize:(s.contentSize||15)+"px",lineHeight:1.7}} placeholder="Colonne gauche…"/>
            <textarea value={s.subtitle||""} onChange={e=>updateSlide("subtitle",e.target.value)} rows={5} style={{background:"rgba(255,255,255,0.05)",border:`1px dashed ${s.color}44`,color:s.color,borderRadius:8,padding:"10px",outline:"none",resize:"none",fontSize:(s.contentSize||15)+"px",lineHeight:1.7}} placeholder="Colonne droite…"/></>
          ):(
            <><div style={{color:s.color,fontSize:(s.contentSize||15)*scale+"px",lineHeight:1.7,opacity:0.9}}>{s.content||""}</div>
            <div style={{color:s.color,fontSize:(s.contentSize||15)*scale+"px",lineHeight:1.7,opacity:0.9}}>{s.subtitle||""}</div></>
          )}
        </div>
      </div>
    );
    if(s.layout==="quote") return (
      <div style={{textAlign:"center",maxWidth:740}}>
        {editing?(<textarea value={s.content||""} onChange={e=>updateSlide("content",e.target.value)} rows={4} style={{background:"transparent",border:"1px dashed rgba(255,255,255,0.2)",color:s.color,fontSize:(s.contentSize||20)+"px",fontStyle:"italic",textAlign:"center",width:"100%",outline:"none",resize:"none",lineHeight:1.6,borderRadius:4}} placeholder="Texte de la citation…"/>):
          <div style={{fontSize:(s.contentSize||20)*scale+"px",fontStyle:"italic",color:s.color,lineHeight:1.7,opacity:0.95}}>"{s.content||""}"</div>}
        {editing?inp("subtitle","— Auteur ou source",{fontSize:"14px",color:s.accent||s.color,fontWeight:700,textAlign:"center"}):
          (s.subtitle&&<div style={{fontSize:14*scale+"px",color:s.accent||s.color,fontWeight:700,marginTop:16*scale,textAlign:"center"}}>— {s.subtitle}</div>)}
      </div>
    );
    if(s.layout==="agenda") return (
      <div style={{width:"100%",maxWidth:800}}>
        {editing?inp("title","Titre de l'agenda",{...titleStyle,fontSize:(s.titleSize||32)+"px",textAlign:"left"}):
          <div style={{...titleStyle,fontSize:(s.titleSize||32)*scale+"px",textAlign:"left",marginBottom:20*scale}}>{s.title}</div>}
        {(s.bullets||["Point 1","Point 2","Point 3"]).map((b,bi)=>(
          <div key={bi} style={{display:"flex",gap:12*scale,alignItems:"center",padding:`${6*scale}px 0`,borderBottom:`1px solid ${s.color}22`}}>
            <div style={{background:s.accent||s.color,color:s.bg,borderRadius:"50%",width:24*scale,height:24*scale,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:11*scale,flexShrink:0}}>{bi+1}</div>
            {editing?<input value={b} onChange={e=>{const nb=[...(s.bullets||[])];nb[bi]=e.target.value;updateSlide("bullets",nb);}} style={{flex:1,background:"transparent",border:`none`,borderBottom:`1px solid ${s.color}33`,color:s.color,fontSize:(s.contentSize||16)+"px",outline:"none",padding:"2px 0"}} placeholder={`Point ${bi+1}`}/>:
              <div style={{color:s.color,fontSize:(s.contentSize||16)*scale+"px"}}>{b}</div>}
            {editing&&<button onClick={()=>updateSlide("bullets",(s.bullets||[]).filter((_,j)=>j!==bi))} style={{background:"transparent",border:"none",color:"rgba(255,100,100,0.7)",cursor:"pointer",fontSize:11}}>✕</button>}
          </div>
        ))}
        {editing&&<button onClick={()=>updateSlide("bullets",[...(s.bullets||[]),"Nouvel élément"])} style={{background:"rgba(255,255,255,0.1)",border:"1px dashed rgba(255,255,255,0.3)",color:s.color,borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,marginTop:8}}>+ Ajouter</button>}
      </div>
    );
    if(s.layout==="comparison") return (
      <div style={{width:"100%"}}>
        {editing?inp("title","Titre de la comparaison",{...titleStyle,fontSize:(s.titleSize||30)+"px",textAlign:"center",marginBottom:16}):
          <div style={{...titleStyle,fontSize:(s.titleSize||30)*scale+"px",textAlign:"center",marginBottom:16*scale}}>{s.title}</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:16*scale,alignItems:"center"}}>
          <div style={{background:`${s.accent||"#8B5CF6"}22`,border:`2px solid ${s.accent||"#8B5CF6"}55`,borderRadius:12*scale,padding:16*scale}}>
            {editing?(<input value={s.bullets?.[0]||""} onChange={e=>{const nb=[...(s.bullets||["",""])];nb[0]=e.target.value;updateSlide("bullets",nb);}} style={{background:"transparent",border:"none",borderBottom:`1px solid ${s.color}44`,color:s.color,fontSize:(s.contentSize||14)+"px",fontWeight:700,width:"100%",outline:"none",padding:"2px 0",marginBottom:8}} placeholder="Option A"/>):
              <div style={{color:s.color,fontWeight:700,fontSize:(s.contentSize||14)*scale+"px",marginBottom:8*scale}}>{s.bullets?.[0]||"Option A"}</div>}
            {editing?(<textarea value={s.content||""} onChange={e=>updateSlide("content",e.target.value)} rows={3} style={{background:"transparent",border:`1px dashed ${s.color}33`,color:s.color,fontSize:12+"px",borderRadius:4,padding:"4px",outline:"none",resize:"none",width:"100%"}} placeholder="Description A…"/>):
              <div style={{color:s.color,opacity:0.8,fontSize:12*scale+"px",lineHeight:1.6}}>{s.content||""}</div>}
          </div>
          <div style={{color:s.accent||s.color,fontWeight:900,fontSize:18*scale+"px",textAlign:"center"}}>VS</div>
          <div style={{background:`${s.color}18`,border:`2px solid ${s.color}33`,borderRadius:12*scale,padding:16*scale}}>
            {editing?(<input value={s.bullets?.[1]||""} onChange={e=>{const nb=[...(s.bullets||["",""])];nb[1]=e.target.value;updateSlide("bullets",nb);}} style={{background:"transparent",border:"none",borderBottom:`1px solid ${s.color}44`,color:s.color,fontSize:(s.contentSize||14)+"px",fontWeight:700,width:"100%",outline:"none",padding:"2px 0",marginBottom:8}} placeholder="Option B"/>):
              <div style={{color:s.color,fontWeight:700,fontSize:(s.contentSize||14)*scale+"px",marginBottom:8*scale}}>{s.bullets?.[1]||"Option B"}</div>}
            {editing?(<textarea value={s.subtitle||""} onChange={e=>updateSlide("subtitle",e.target.value)} rows={3} style={{background:"transparent",border:`1px dashed ${s.color}33`,color:s.color,fontSize:12+"px",borderRadius:4,padding:"4px",outline:"none",resize:"none",width:"100%"}} placeholder="Description B…"/>):
              <div style={{color:s.color,opacity:0.8,fontSize:12*scale+"px",lineHeight:1.6}}>{s.subtitle||""}</div>}
          </div>
        </div>
      </div>
    );
    return (
      <div style={{textAlign:"center",width:"100%"}}>
        {editing?inp("title","Titre",{...titleStyle,fontSize:(s.titleSize||36)+"px"}):
          <div style={titleStyle}>{s.title}</div>}
        {editing?inp("content","Contenu…",{...contentStyle,fontSize:(s.contentSize||16)+"px"}):
          (s.content&&<div style={contentStyle}>{s.content}</div>)}
      </div>
    );
  };

  // PRESENTER MODE
  if(presenting && slides.length>0) {
    const ps=slides[presIdx]||slides[0];
    return (
      <div ref={presRef} style={{position:"fixed",inset:0,zIndex:9999,background:ps.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"5vw",cursor:"none",userSelect:"none"}}
        onClick={()=>navPres(1)}>
        {/* Progress bar */}
        <div style={{position:"absolute",top:0,left:0,right:0,height:4,background:"rgba(255,255,255,0.1)"}}>
          <div style={{height:"100%",width:`${((presIdx+1)/slides.length)*100}%`,background:ps.accent||"#8B5CF6",transition:"width .4s"}}/>
        </div>
        {/* Slide content */}
        <div className={transAnim||""} style={{width:"100%",maxWidth:"1000px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          {renderSlideContent(ps,false,0.85)}
        </div>
        {/* Controls */}
        <div style={{position:"absolute",bottom:20,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"center",gap:20}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>navPres(-1)} disabled={presIdx===0} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontSize:20,opacity:presIdx===0?0.3:1}}>‹</button>
          <span style={{color:"rgba(255,255,255,0.5)",fontSize:13}}>{presIdx+1} / {slides.length}</span>
          <button onClick={()=>navPres(1)} disabled={presIdx===slides.length-1} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontSize:20,opacity:presIdx===slides.length-1?0.3:1}}>›</button>
        </div>
        {/* Timer */}
        <div style={{position:"absolute",bottom:24,right:90,display:"flex",gap:8,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setPresRunning(p=>!p)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>{presRunning?"⏸":"▶"}</button>
          <span style={{color:"rgba(255,255,255,0.5)",fontSize:12,fontFamily:"monospace"}}>{fmtTimer(presTimer)}</span>
          <button onClick={()=>{setPresTimer(0);setPresRunning(false);}} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"rgba(255,255,255,0.4)",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10}}>↺</button>
        </div>
        {/* Notes toggle */}
        {ps.notes&&<div style={{position:"absolute",top:16,left:16}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setShowNotesPres(p=>!p)} style={{background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.6)",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10}}>📝 Notes</button>
        </div>}
        {showNotesPres&&ps.notes&&(
          <div style={{position:"absolute",bottom:60,left:24,maxWidth:"55%",background:"rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"10px 14px",color:"rgba(255,255,255,0.75)",fontSize:12,fontStyle:"italic",lineHeight:1.5}}>📝 {ps.notes}</div>
        )}
        {/* Slide thumbnails */}
        <div style={{position:"absolute",top:16,right:16,display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
          {slides.slice(Math.max(0,presIdx-1),presIdx+4).map((s,i)=>{
            const idx=Math.max(0,presIdx-1)+i;
            return <div key={s.id} onClick={()=>{triggerTransition(idx);setPresIdx(idx);}} style={{width:50,height:32,background:s.bg,border:`2px solid ${idx===presIdx?"#fff":"rgba(255,255,255,0.2)"}`,borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:s.color,overflow:"hidden",padding:2,textAlign:"center",fontWeight:700,lineHeight:1.2}}>{s.title?.slice(0,20)||"•"}</div>;
          })}
        </div>
        {/* Keyboard shortcuts hint */}
        <div style={{position:"absolute",top:16,left:"50%",transform:"translateX(-50%)",color:"rgba(255,255,255,0.25)",fontSize:9}}>← → espace · N=notes · T=chrono · Échap=quitter</div>
        <button onClick={e=>{e.stopPropagation();setPresenting(false);setPresTimer(0);setPresRunning(false);}} style={{position:"absolute",top:16,right:16,background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12}}>✕ Quitter</button>
      </div>
    );
  }

  // DECK LIST
  if(!activeDeck) return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <div>
          <div style={{color:T.text,fontWeight:800,fontSize:16}}>🖥️ Présentation Pro</div>
          <div style={{color:T.textMuted,fontSize:11}}>{decks.length} présentation(s) enregistrée(s)</div>
        </div>
        <button onClick={()=>setShowNewDeck(true)} style={{background:"linear-gradient(135deg,#8B5CF6,#7C3AED)",border:"none",color:"#fff",borderRadius:9,padding:"10px 20px",cursor:"pointer",fontWeight:800,fontSize:13}}>+ Nouvelle présentation</button>
      </div>
      {showNewDeck&&(
        <div style={{background:T.surface2,border:"1px solid #8B5CF644",borderRadius:14,padding:20,marginBottom:18}}>
          <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:12}}>Nouvelle présentation</div>
          <input value={newDeckTitle} onChange={e=>setNewDeckTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createDeck()} placeholder="Titre de la présentation…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",color:T.text,fontSize:13,marginBottom:12,outline:"none",boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {GC_THEMES.map(th=>(
              <button key={th.id} onClick={()=>setNewDeckTheme(th.id)} style={{background:th.bg,border:`2px solid ${newDeckTheme===th.id?"#8B5CF6":"transparent"}`,borderRadius:8,padding:"6px 12px",cursor:"pointer",color:th.color,fontSize:11,fontWeight:700}}>{th.label}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={createDeck} style={{background:"linear-gradient(135deg,#8B5CF6,#7C3AED)",border:"none",color:"#fff",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Créer</button>
            <button onClick={()=>setShowNewDeck(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
          </div>
        </div>
      )}
      {decks.length===0&&!showNewDeck&&<div style={{textAlign:"center",padding:60,color:T.textMuted}}>Aucune présentation. Créez-en une !</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:14}}>
        {decks.map(dk=>{
          const th=GC_THEMES.find(t=>t.id===dk.theme)||GC_THEMES[0];
          return (
            <div key={dk.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              <div style={{background:th.bg,height:100,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16,position:"relative"}}>
                <div style={{color:th.accent||th.color,fontWeight:900,fontSize:14,textAlign:"center",textShadow:"0 1px 4px rgba(0,0,0,0.4)"}}>{dk.title}</div>
                <div style={{color:th.color,opacity:0.6,fontSize:10,marginTop:5}}>{dk.slides?.length||0} diapositive(s) · {th.label}</div>
                <div style={{position:"absolute",top:8,right:10,display:"flex",gap:4}}>
                  {[th.bg,th.color,th.accent].map((c,i)=><div key={i} style={{width:10,height:10,borderRadius:"50%",background:c,border:"1px solid rgba(255,255,255,0.3)"}}/>)}
                </div>
              </div>
              <div style={{padding:"10px 12px",display:"flex",gap:6}}>
                <button onClick={()=>{setActiveDeck(dk.id);setActiveSlide(0);}} style={{flex:1,background:"#8B5CF622",border:"1px solid #8B5CF644",color:"#8B5CF6",borderRadius:7,padding:"7px",cursor:"pointer",fontWeight:700,fontSize:11}}>✏️ Éditer</button>
                <button onClick={()=>{setActiveDeck(dk.id);setActiveSlide(0);setPresenting(true);setPresIdx(0);setPresTimer(0);}} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>▶</button>
                <button onClick={()=>{saveDecks(decks.filter(x=>x.id!==dk.id));}} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"7px 10px",cursor:"pointer",fontSize:11}}>🗑️</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if(!deck||!slide) return null;
  // EDITOR
  return (
    <div style={{display:"flex",flexDirection:"column",gap:0,height:"calc(100vh - 190px)"}}>
      {/* Top bar */}
      <div style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:`1px solid ${T.border}`,marginBottom:7,flexWrap:"wrap"}}>
        <button onClick={()=>setActiveDeck(null)} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11}}>← Retour</button>
        <div style={{color:T.text,fontWeight:800,fontSize:14,flex:1,minWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{deck.title}</div>
        <div style={{display:"flex",gap:3}}>
          {[["slides","🗂️ Slides"],["design","🎨 Design"],["notes","📝 Notes"],["outline","📋 Plan"]].map(([tb,lb])=>(
            <button key={tb} onClick={()=>setTab(tb)} style={{background:tab===tb?"#8B5CF622":"transparent",border:`1px solid ${tab===tb?"#8B5CF644":T.border}`,color:tab===tb?"#8B5CF6":T.textMuted,borderRadius:7,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:tab===tb?700:400}}>{lb}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <button onClick={()=>setSlideScale(s=>Math.max(40,s-10))} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 6px",cursor:"pointer",color:T.textMuted,fontSize:11}}>−</button>
          <span style={{color:T.textDim,fontSize:10,minWidth:34,textAlign:"center"}}>{slideScale}%</span>
          <button onClick={()=>setSlideScale(s=>Math.min(120,s+10))} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 6px",cursor:"pointer",color:T.textMuted,fontSize:11}}>+</button>
        </div>
        <button onClick={()=>{setPresIdx(activeSlide);setPresenting(true);setPresTimer(0);}} style={{background:"linear-gradient(135deg,#8B5CF6,#7C3AED)",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>▶ Présenter</button>
        <button onClick={exportHTML} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>⬇ Export</button>
        <button onClick={()=>{
          if(!deck) return;
          const th=themeObj;
          const w=window.open('','_blank','width=900,height=700');
          if(w){
            const slidesHTML=slides.map((s,i)=>{
              let body='';
              if(s.layout==='title-bullets') body=`<ul style="text-align:left;padding-left:24px;line-height:2;font-size:${s.contentSize||16}px;">${(s.bullets||[]).map(b=>'<li>'+b+'</li>').join('')}</ul>`;
              else if(s.layout==='quote') body=`<blockquote style="font-style:italic;font-size:${s.contentSize||18}px;line-height:1.7;">"${s.content||''}"<br/><small style="opacity:.6;">— ${s.subtitle||''}</small></blockquote>`;
              else if(s.layout==='big-number') body=`<div style="font-size:80px;font-weight:900;color:${s.accent||s.color};">${s.content||'0'}</div><div style="font-size:${s.contentSize||16}px;opacity:.7;">${s.subtitle||''}</div>`;
              else body=`${s.subtitle?`<h2 style="opacity:.7;font-size:${(s.contentSize||16)*0.9}px;margin-bottom:10px;">${s.subtitle}</h2>`:''}${s.content?`<p style="font-size:${s.contentSize||16}px;line-height:1.7;max-width:700px;text-align:center;">${s.content}</p>`:''}`;
              return `<section style="background:${s.bg};color:${s.color};page-break-after:always;min-height:148mm;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30mm 25mm;position:relative;"><h1 style="font-size:${Math.min(s.titleSize||36,44)}px;font-weight:${s.titleBold?'900':'700'};color:${s.accent||s.color};text-align:center;margin-bottom:14px;font-family:'${s.titleFont||'Segoe UI'}';">${s.title}</h1>${body}<div style="position:absolute;bottom:12px;right:16px;font-size:9px;opacity:.3;">${i+1}/${slides.length}</div>${s.notes?`<div style="position:absolute;bottom:12px;left:16px;font-size:9px;opacity:.4;font-style:italic;">📝 ${s.notes}</div>`:''}</section>`;
            }).join('');
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${deck.title}</title><style>@page{size:A4 landscape;margin:0}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Segoe UI',sans-serif;}section{page-break-after:always;}@media print{section{page-break-after:always;}button{display:none}}</style></head><body><div style="background:#1E293B;color:#F1F5F9;padding:12px 20px;display:flex;align-items:center;justify-content:between;gap:12px;"><span style="font-size:15px;font-weight:800;">${deck.title}</span><span style="opacity:.5;font-size:11px;margin-left:auto;">${slides.length} diapositives — ${new Date().toLocaleDateString('fr-FR')}</span><button onclick="window.print()" style="background:#8B5CF6;border:none;color:#fff;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:12px;margin-left:12px;">🖨️ Imprimer</button></div>${slidesHTML}</body></html>`);
            w.document.close();
          }
        }} title="Imprimer la présentation" style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>🖨️</button>
        <div style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:6,padding:"4px 9px",fontSize:9,color:"#22C55E",display:"flex",alignItems:"center",gap:4}} title="Sauvegarde automatique active">
          <span>💾</span><span>Auto-sauvegardé</span>
        </div>
      </div>

      <div style={{display:"flex",gap:10,flex:1,overflow:"hidden"}}>
        {/* Left: slide thumbnails */}
        <div style={{width:155,overflowY:"auto",display:"flex",flexDirection:"column",gap:5,paddingRight:5}}>
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowLayouts(p=>!p)} style={{background:"linear-gradient(135deg,#8B5CF6,#7C3AED)",border:"none",color:"#fff",borderRadius:7,padding:"7px",cursor:"pointer",fontWeight:700,fontSize:11,width:"100%"}}>+ Diapo ▾</button>
            {showLayouts&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:T.surface,border:`1px solid ${T.border}`,borderRadius:9,padding:5,zIndex:20,display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
                {LAYOUTS.map(l=>(
                  <button key={l.id} onClick={()=>addSlide(l.id)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.text,borderRadius:5,padding:"4px 6px",cursor:"pointer",fontSize:9,textAlign:"center"}}>
                    <div style={{fontSize:13}}>{l.icon}</div>
                    <div style={{marginTop:2}}>{l.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {slides.map((s,i)=>(
            <div key={s.id} draggable onDragStart={()=>setDragIdx(i)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragIdx!==null&&dragIdx!==i){moveSlide(dragIdx,i);setDragIdx(null);}}}
              onClick={()=>setActiveSlide(i)}
              style={{background:i===activeSlide?"#8B5CF622":"transparent",border:`2px solid ${i===activeSlide?"#8B5CF6":T.border}`,borderRadius:8,padding:5,cursor:"pointer",position:"relative"}}>
              <div style={{background:s.bg,borderRadius:5,height:50,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"3px 5px",overflow:"hidden",position:"relative"}}>
                <div style={{color:s.accent||s.color,fontWeight:700,fontSize:7,textAlign:"center",lineHeight:1.2,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title||"•"}</div>
                {s.subtitle&&<div style={{color:s.color,opacity:0.5,fontSize:6,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{s.subtitle}</div>}
                <div style={{position:"absolute",bottom:2,right:3,color:s.color,opacity:0.3,fontSize:6}}>{LAYOUTS.find(l=>l.id===s.layout)?.icon}</div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:3}}>
                <div style={{color:T.textDim,fontSize:8}}>#{i+1}</div>
                <div style={{color:T.textDim,fontSize:7}}>{s.transition&&s.transition!=="none"?"✨":""}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Center: editor / preview */}
        <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column",gap:8,minWidth:0}}>
          {tab==="slides"&&(
            <>
              {/* Slide canvas */}
              <div style={{background:"#1a1a2e",borderRadius:12,padding:16,display:"flex",justifyContent:"center",alignItems:"center",minHeight:300,position:"relative",border:`2px solid ${T.border}`}}>
                <div style={{background:slide.bg,borderRadius:10,width:`${slideScale*9/5}px`,minWidth:400,maxWidth:"100%",minHeight:`${slideScale*2.4}px`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:`${slideScale*0.2}px ${slideScale*0.3}px`,position:"relative",transition:"all .2s",boxShadow:"0 8px 40px rgba(0,0,0,0.5)"}}>
                  <div style={{position:"absolute",top:8,right:8,display:"flex",gap:4,zIndex:5}}>
                    <button onClick={dupSlide} title="Dupliquer" style={{background:"rgba(0,0,0,0.4)",border:"none",color:"#fff",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10}}>⧉</button>
                    {slides.length>1&&<button onClick={delSlide} title="Supprimer" style={{background:"rgba(220,38,38,0.5)",border:"none",color:"#fff",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10}}>🗑</button>}
                    <button onClick={()=>moveSlide(activeSlide,activeSlide-1)} disabled={activeSlide===0} style={{background:"rgba(0,0,0,0.4)",border:"none",color:"#fff",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10,opacity:activeSlide===0?0.3:1}}>↑</button>
                    <button onClick={()=>moveSlide(activeSlide,activeSlide+1)} disabled={activeSlide===slides.length-1} style={{background:"rgba(0,0,0,0.4)",border:"none",color:"#fff",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10,opacity:activeSlide===slides.length-1?0.3:1}}>↓</button>
                  </div>
                  {renderSlideContent(slide,true,slideScale/100)}
                  <div style={{position:"absolute",bottom:6,right:10,color:slide.color,opacity:0.25,fontSize:9}}>{activeSlide+1}/{slides.length}</div>
                </div>
              </div>

              {/* Slide properties */}
              <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px"}}>
                <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-start"}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:2}}>Fond</label><input type="color" value={slide.bg||"#0A1E4A"} onChange={e=>updateSlide("bg",e.target.value)} style={{width:32,height:26,border:"none",borderRadius:4,cursor:"pointer",padding:0}}/></div>
                    <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:2}}>Texte</label><input type="color" value={slide.color||"#fff"} onChange={e=>updateSlide("color",e.target.value)} style={{width:32,height:26,border:"none",borderRadius:4,cursor:"pointer",padding:0}}/></div>
                    <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:2}}>Accent</label><input type="color" value={slide.accent||"#8B5CF6"} onChange={e=>updateSlide("accent",e.target.value)} style={{width:32,height:26,border:"none",borderRadius:4,cursor:"pointer",padding:0}}/></div>
                  </div>
                  <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:2}}>Police titre</label>
                    <select value={slide.titleFont||"Segoe UI"} onChange={e=>updateSlide("titleFont",e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 7px",color:T.text,fontSize:10}}>
                      {["Segoe UI","Arial","Calibri","Georgia","Times New Roman","Verdana","Impact","Trebuchet MS"].map(f=><option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:2}}>Taille titre</label>
                    <select value={slide.titleSize||36} onChange={e=>updateSlide("titleSize",+e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 7px",color:T.text,fontSize:10,width:70}}>
                      {[18,22,24,28,32,36,40,44,48,56,64].map(s=><option key={s} value={s}>{s}px</option>)}
                    </select>
                  </div>
                  <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:2}}>Taille contenu</label>
                    <select value={slide.contentSize||16} onChange={e=>updateSlide("contentSize",+e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 7px",color:T.text,fontSize:10,width:70}}>
                      {[11,12,13,14,15,16,18,20,22,24].map(s=><option key={s} value={s}>{s}px</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    <label style={{color:T.textDim,fontSize:9,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                      <input type="checkbox" checked={!!slide.titleBold} onChange={e=>updateSlide("titleBold",e.target.checked)} style={{cursor:"pointer"}}/>
                      <span>Titre gras</span>
                    </label>
                  </div>
                  <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:2}}>Disposition</label>
                    <select value={slide.layout||"title-content"} onChange={e=>updateSlide("layout",e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 7px",color:T.text,fontSize:10}}>
                      {LAYOUTS.map(l=><option key={l.id} value={l.id}>{l.icon} {l.label}</option>)}
                    </select>
                  </div>
                  <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:2}}>Transition</label>
                    <select value={slide.transition||"fade"} onChange={e=>updateSlide("transition",e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 7px",color:T.text,fontSize:10}}>
                      {TRANSITIONS.map(tr=><option key={tr.id} value={tr.id}>{tr.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab==="design"&&(
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:18}}>
              <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:14}}>🎨 Thème global de la présentation</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                {GC_THEMES.map(th=>(
                  <button key={th.id} onClick={()=>applyTheme(th.id)} style={{background:th.bg,border:`3px solid ${deck.theme===th.id?"#8B5CF6":"transparent"}`,borderRadius:12,padding:14,cursor:"pointer",textAlign:"center"}}>
                    <div style={{color:th.accent||th.color,fontWeight:900,fontSize:12,marginBottom:6}}>{th.label}</div>
                    <div style={{display:"flex",gap:5,justifyContent:"center"}}>
                      {[th.bg,th.color,th.accent].map((c,i)=><div key={i} style={{width:16,height:16,borderRadius:"50%",background:c||"#fff",border:"1px solid rgba(255,255,255,0.2)"}}/>)}
                    </div>
                    {deck.theme===th.id&&<div style={{color:"#8B5CF6",fontSize:10,marginTop:6,fontWeight:700}}>✓ Actif</div>}
                  </button>
                ))}
              </div>
              <div style={{marginTop:16,color:T.textMuted,fontSize:11}}>⚠️ Appliquer un thème remplace les couleurs de toutes les diapositives.</div>
              {/* Global font */}
              <div style={{marginTop:16,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{color:T.textMuted,fontSize:11}}>Police globale :</div>
                {["Segoe UI","Arial","Calibri","Georgia","Impact"].map(f=>(
                  <button key={f} onClick={()=>{const ns=slides.map(s=>({...s,titleFont:f}));updateDeck({slides:ns});}} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 10px",cursor:"pointer",color:T.text,fontSize:11,fontFamily:f}}>{f}</button>
                ))}
              </div>
            </div>
          )}

          {tab==="notes"&&(
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
              <div style={{color:T.text,fontWeight:700,fontSize:13,marginBottom:10}}>📝 Notes du présentateur — Diapositive {activeSlide+1}</div>
              <textarea value={slide.notes||""} onChange={e=>updateSlide("notes",e.target.value)} rows={10}
                style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:13,resize:"vertical",outline:"none",lineHeight:1.7,boxSizing:"border-box"}} placeholder="Notes pour cette diapositive — visibles pendant la présentation (touche N)…"/>
            </div>
          )}

          {tab==="outline"&&(
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{color:T.text,fontWeight:700,fontSize:13}}>📋 Plan de la présentation</div>
                <div style={{color:T.textDim,fontSize:10}}>{slides.length} diapositive(s)</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {slides.map((s,i)=>(
                  <div key={s.id} onClick={()=>setActiveSlide(i)} style={{background:i===activeSlide?"#8B5CF622":"transparent",border:`1px solid ${i===activeSlide?"#8B5CF644":T.border}`,borderRadius:8,padding:"9px 14px",cursor:"pointer",display:"flex",gap:12,alignItems:"flex-start"}}>
                    <div style={{background:s.bg,border:`1px solid ${s.accent||"#8B5CF6"}44`,borderRadius:4,width:28,height:18,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,color:s.color||"#fff",fontWeight:700}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:T.text,fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title||"(sans titre)"}</div>
                      {(s.subtitle||s.content)&&<div style={{color:T.textMuted,fontSize:10,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.subtitle||s.content}</div>}
                      {s.layout==="title-bullets"&&s.bullets?.length>0&&(
                        <div style={{color:T.textDim,fontSize:9,marginTop:2}}>{s.bullets.slice(0,2).map(b=>`• ${b}`).join("  ")}{s.bullets.length>2?` (+${s.bullets.length-2})`:""}</div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                      <div style={{color:T.textMuted,fontSize:9}}>{LAYOUTS.find(l=>l.id===s.layout)?.icon}</div>
                      {s.transition&&s.transition!=="none"&&<div style={{color:"#8B5CF6",fontSize:9}}>✨</div>}
                      {s.notes&&<div style={{color:"#F59E0B",fontSize:9}}>📝</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


