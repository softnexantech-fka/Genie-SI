import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../components/Dialog.jsx';
// AI Assistant — chat panel, config
// SI Génie Consultant v127
import { _lsGet, _lsSet, _tActive, playSound, gcAILoadConfig, gcAISaveConfig, gcAILoadDelays, gcAISaveDelays, gcAIBuildSystemPrompt, gcAIRateCheck, gcAICheckInjection, gcAICallClaude, gcAICallGemini, gcAICallGPT, gcAICall, gcAIAsk } from '../core/index.js';
import { GC_AI_CONFIG_DEFAULT, GC_AI_SUGGESTIONS } from '../core/constants.js';
import { Btn, Modal } from './UI.jsx';
export function GCAIMarkdown({ text, T2 }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const lines = (text || "").split("\n");
  const elements = [];
  let key = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { elements.push(<div key={key++} style={{ height: 6 }} />); continue; }
    if (l.startsWith("## ")) { elements.push(<div key={key++} style={{ color: "#C9A84C", fontWeight: 800, fontSize: 13, marginTop: 8, marginBottom: 3 }}>{l.slice(3)}</div>); continue; }
    if (l.startsWith("# "))  { elements.push(<div key={key++} style={{ color: "#C41E3A", fontWeight: 900, fontSize: 14, marginTop: 10, marginBottom: 4 }}>{l.slice(2)}</div>); continue; }
    if (l.startsWith("### ")){ elements.push(<div key={key++} style={{ color: T2.text, fontWeight: 700, fontSize: 12, marginTop: 6, marginBottom: 2 }}>{l.slice(4)}</div>); continue; }
    if (/^[-•*] /.test(l)) { elements.push(<div key={key++} style={{ display: "flex", gap: 6, marginBottom: 2, paddingLeft: 4 }}><span style={{ color: "#C41E3A", flexShrink: 0, marginTop: 1 }}>▸</span><span style={{ color: T2.text, fontSize: 12, lineHeight: 1.55 }}>{renderInline(l.replace(/^[-•*] /, ""), key)}</span></div>); continue; }
    const numMatch = l.match(/^(\d+)\. (.+)/);
    if (numMatch) { elements.push(<div key={key++} style={{ display: "flex", gap: 8, marginBottom: 2, paddingLeft: 4 }}><span style={{ color: "#C9A84C", fontWeight: 700, fontSize: 11, flexShrink: 0, minWidth: 18 }}>{numMatch[1]}.</span><span style={{ color: T2.text, fontSize: 12, lineHeight: 1.55 }}>{renderInline(numMatch[2], key)}</span></div>); continue; }
    if (l.startsWith("```")) { elements.push(<div key={key++} style={{ background: "#060F1E", border: "1px solid #1E3A5F", borderRadius: 6, padding: "6px 10px", fontFamily: "monospace", color: "#22C55E", fontSize: 11, margin: "4px 0", overflowX: "auto" }}>{lines[++i] === "```" ? "" : lines[i]}</div>); continue; }
    if (/^---+$/.test(l.trim())) { elements.push(<hr key={key++} style={{ border: "none", borderTop: `1px solid ${T2.border}`, margin: "6px 0" }} />); continue; }
    elements.push(<div key={key++} style={{ color: T2.text, fontSize: 12, lineHeight: 1.6, marginBottom: 1 }}>{renderInline(l, key)}</div>);
  }
  function renderInline(str, baseKey) {
    const parts = str.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, j) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={j} style={{ color: T2.text, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("`") && p.endsWith("`")) return <code key={j} style={{ background: "#060F1E", color: "#C9A84C", fontFamily: "monospace", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{p.slice(1, -1)}</code>;
      return p;
    });
  }
  return <div>{elements}</div>;
};


export const AIAssistant = React.memo(function AIAssistant({T, currentUser, dossiers=[], taches=[], rdvs=[], pendingApprovals=[] }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [open, setOpen]           = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [activeEngine, setActiveEngine] = useState("auto");
  const [lastEngine, setLastEngine]     = useState(null);
  const [msgs, setMsgs] = useState([{
    role: "assistant",
    text: (()=>{const wc=gcAILoadConfig();if(wc.params?.welcomeMsg)return wc.params.welcomeMsg;const ae=["claude","gemini","gpt"].filter(id=>{const e=wc.engines[id];return e&&e.enabled&&!e.hidden;}).map(id=>wc.engines[id]?.userLabel||(id==="claude"?"Moteur par défaut":id));return`## 👋 Bonjour ${currentUser?.name?.split(" ")[0]||""} !\n\nJe suis votre **Assistant IA Génie Consultant** — moteurs actifs : **${ae.join(" · ")||"Moteur par défaut"}**.\n\nConfiguré pour : **${currentUser?.role||"Collaborateur"}** · Niveau ${currentUser?.level||1}/6 · Processus ${currentUser?.process||"—"}\n\nJe connais votre contexte de travail en temps réel. Comment puis-je vous aider ?`;})(),
    engine: "system",
    at: new Date().toISOString(),
  }]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [module, setModule]   = useState("default");
  const [copied, setCopied]   = useState(null);
  const [rateError, setRateError] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showModuleBar, setShowModuleBar] = useState(false); // collapsed by default
  const [chatHistory, setChatHistory] = useState(()=>{
    try{
      const uid = currentUser?.id||"guest";
      const saved = _lsGet(`gc-ai-history:${uid}`);
      return saved ? JSON.parse(saved) : [];
    }catch(_){return [];}
  });

  // Save current conv to history
  const saveConvToHistory = (messages) => {
    if(!messages || messages.length <= 1) return;
    const uid = currentUser?.id||"guest";
    const userMsgs = messages.filter(m=>m.role==="user");
    if(!userMsgs.length) return;
    const title = userMsgs[0].text?.slice(0,60)||"Conversation";
    const entry = {
      id: `HIST-${Date.now()}`,
      title,
      at: new Date().toISOString(),
      msgs: messages,
      count: messages.length,
    };
    setChatHistory(prev => {
      const updated = [entry, ...prev].slice(0, 50); // keep last 50
      try{ _lsSet(`gc-ai-history:${uid}`, JSON.stringify(updated)); }catch(_){}
      return updated;
    });
  };
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const fileRef   = useRef(null);

  // T2 : panel IA suit le thème app. En mode light, textMuted/textDim renforcés
  const _lightMode = T && ((T.text||"").startsWith("#0")||(T.text||"").startsWith("#1")||(T.text||"").startsWith("#2")||(T.text||"").startsWith("#3"));
  const T2 = {
    ...(T || {surface:"#0D1F38",surface2:"#0A1E40",surface3:"#1A2A4A",border:"#1E3A5F",text:"#E8EDF5",textMuted:"#7A90B0",textDim:"#4A6080"}),
    textMuted: _lightMode ? "#1E3A5F" : (T?.textMuted || "#7A90B0"),
    textDim:   _lightMode ? "#334155"  : (T?.textDim  || "#4A6080"),
  };

  const liveContext = useMemo(() => {
    const uid = currentUser?.id;
    const lvl = currentUser?.level || 1;
    const today = new Date().toISOString().split("T")[0];
    const myDossiers = (dossiers||[]).filter(d => lvl>=4 ? true : d.assignedTo===uid || d.createdBy===uid);
    const myTaches = (taches||[]).filter(t => lvl>=4 ? true : (t.assignedTo===uid||t.assigneeId===uid) || t.createdBy===uid);
    const myRdvs = (rdvs||[]).filter(r => lvl>=4 ? true : r.assignedTo===uid);
    const actifs = myDossiers.filter(d => d.status !== "TERMINE");
    const tachesEnCours = myTaches.filter(_tActive);
    const now = new Date();
    return {
      dossiersActifs: actifs.length,
      tachesEnCours: tachesEnCours.length,
      tachesUrgentes: tachesEnCours.filter(t => t.priority === "HAUTE").length,
      rdvsAujourdhui: myRdvs.filter(r => r.date === today).length,
      approbasEnAttente: lvl>=3 ? (pendingApprovals||[]).filter(a=>!a.accountCreated&&a.status!=="REJETE").length : 0,
      dossiersEnRetard: actifs.filter(d => d.dueDate && new Date(d.dueDate) < now).length,
      dossiersRecents: actifs.slice(0,3).map(d=>`"${d.client}" (${d.ref})`).join(", ") || null,
      tachesRecentes: tachesEnCours.filter(t=>t.priority==="HAUTE").slice(0,3).map(t=>t.titre).join(", ") || null,
      clientsActifs: [...new Set(actifs.map(d=>d.client))].slice(0,4).join(", ") || null,
    };
  }, [currentUser, dossiers, taches, rdvs, pendingApprovals]);

  const systemPrompt = useMemo(() => gcAIBuildSystemPrompt(currentUser, liveContext), [currentUser?.id, currentUser?.level, liveContext]);
  const suggestions  = GC_AI_SUGGESTIONS[module] || GC_AI_SUGGESTIONS.default;

  const dynamicSuggestions = useMemo(() => {
    const base = suggestions;
    const ctx = liveContext;
    const dynamic = [];
    if (ctx.tachesUrgentes > 0) dynamic.push(`⚡ Aide-moi à prioriser mes ${ctx.tachesUrgentes} tâche(s) urgente(s)`);
    if (ctx.dossiersEnRetard > 0) dynamic.push(`⚠️ ${ctx.dossiersEnRetard} dossier(s) en retard — stratégie de rattrapage`);
    if (ctx.rdvsAujourdhui > 0) dynamic.push(`📅 Préparer mes ${ctx.rdvsAujourdhui} RDV du jour`);
    if (ctx.approbasEnAttente > 0) dynamic.push(`👤 Traiter les ${ctx.approbasEnAttente} approbation(s) en attente`);
    return [...dynamic.slice(0,2), ...base].slice(0,6);
  }, [liveContext, suggestions]);

  const send = async (overrideText) => {
    let txt = (overrideText || input).trim();
    if (!txt || loading) return;
    if (!gcAIRateCheck()) { setRateError(true); setTimeout(()=>setRateError(false), 10000); return; }
    if (gcAICheckInjection(txt)) {
      setMsgs(p => [...p,
        { role:"user", text:txt, at:new Date().toISOString() },
        { role:"assistant", text:"⚠️ **Requête bloquée** — Tentative de manipulation détectée et journalisée.\n\nFormulisez une demande légitime.", engine:"security", at:new Date().toISOString() },
      ]);
      setInput(""); return;
    }
    if (uploadedFile) {
      txt = `[Fichier joint : "${uploadedFile.name}" — Contenu :\n${uploadedFile.content?.substring(0,2000)}${uploadedFile.content?.length>2000?"…":""}\n]\n\n${txt}`;
      setUploadedFile(null); setShowFileUpload(false);
    }
    const _savedInput = txt; // save before clearing for retry
    setInput("");
    const newMsgs = [...msgs, { role:"user", text:overrideText||input||txt, at:new Date().toISOString(), displayText: overrideText||input||txt }];
    const apiMsgs = [...msgs, { role:"user", text:txt, at:new Date().toISOString() }];
    setMsgs(newMsgs);
    setLoading(true);
    try {
      const _aC=gcAILoadConfig().engines;const _eOK=(id)=>{const e=_aC[id];return e&&e.enabled&&!e.suspended&&!e.hidden&&(id==="claude"||(e.apiKey));};const preferEngine=(activeEngine!=="auto"&&_eOK(activeEngine))?activeEngine:"auto";
      const { text:reply, engine } = await gcAICall(systemPrompt, apiMsgs.filter(m=>m.role!=="system"), preferEngine);
      setLastEngine(engine);
      setMsgs(p => [...p, { role:"assistant", text:reply, engine, at:new Date().toISOString() }]);
      playSound("message");
    } catch (err) {
      setMsgs(p => [...p, {
        role:"assistant",
        text:`⚠️ **Service IA temporairement indisponible**\n\n_${err.message?.slice(0,120)||"Vérifiez votre connexion réseau."}_\n\n💡 Cliquez ↩ **Réessayer** ou changez de moteur.`,
        engine:"error", at:new Date().toISOString(), retryText:(overrideText||_savedInput||txt),
      }]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    window.gcAIAsk = (prompt, mod) => {
      setOpen(true); if (mod) setModule(mod);
      setTimeout(() => send(prompt), 200);
    };
    return () => { delete window.gcAIAsk; };
   
  }, [msgs, loading, systemPrompt]);

  useEffect(() => { if (open) setTimeout(()=>inputRef.current?.focus(), 220); }, [open]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, loading]);

  const copyMsg = (idx, text) => {
    navigator.clipboard?.writeText(text).then(()=>{ setCopied(idx); setTimeout(()=>setCopied(null),2000); }).catch(()=>{});
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxMB = 4;
    if (file.size > maxMB*1024*1024) { gcAlert(`Fichier trop grand (max ${maxMB}MB)`); return; }
    try {
      const text = await file.text();
      setUploadedFile({ name:file.name, content:text, size:file.size });
      setShowFileUpload(false);
    } catch (_) { gcAlert("Impossible de lire ce fichier."); }
  };

  const [aiCfg, setAiCfg] = useState(()=>gcAILoadConfig());
  useEffect(()=>{
    if(open) {
      setAiCfg(gcAILoadConfig());
      // Marquer tous les messages IA comme lus à l'ouverture du panel
      setMsgs(prev => prev.map(m => m.role==="assistant" ? {...m, read:true} : m));
    }
  },[open]);
  const _eC=aiCfg.engines||GC_AI_CONFIG_DEFAULT.engines;
  const ENGINE_BADGE={
    claude: {label:_eC.claude?.userLabel||"Moteur par défaut",color:_eC.claude?.color||"#C41E3A",icon:_eC.claude?.icon||"🤖"},
    gemini: {label:_eC.gemini?.userLabel||"Gemini 2.0",       color:_eC.gemini?.color||"#3B82F6",icon:_eC.gemini?.icon||"✨"},
    gpt:    {label:_eC.gpt?.userLabel   ||"ChatGPT",          color:_eC.gpt?.color   ||"#10B981",icon:_eC.gpt?.icon   ||"💬"},
    system: {label:"Système", color:"#4A6080",icon:"⚙️"},
    error:  {label:"Erreur",  color:"#EF4444",icon:"⚠️"},
    security:{label:"Sécurité",color:"#F59E0B",icon:"🛡️"},
  };
  const _visEng=["claude","gemini","gpt"].filter(id=>{const e=_eC[id];return e&&e.enabled&&!e.suspended&&!e.hidden;});

  const panelW = maximized ? "min(820px,calc(100vw - 40px))" : "min(440px,calc(100vw - 48px))";
  const panelH = maximized ? "min(800px,calc(100vh - 80px))" : "min(620px,calc(100vh - 120px))";

  return (
    <>
      {/* ── FAB + badges ── Le wrapper gère overflow:visible pour que les badges débordent vraiment */}
      <div style={{position:"fixed", bottom:24, right:24, zIndex:1001, width:58, height:58}}>
        {/* Bouton principal */}
        <div onClick={()=>{ setOpen(o=>!o); if(!open) playSound("notif"); }}
          title={`Assistant IA — ${currentUser?.role||"Collaborateur"} · Niv.${currentUser?.level||1} · Moteur ${activeEngine}`}
          style={{
            position:"absolute", inset:0, borderRadius:"50%",
            background: open
              ? "linear-gradient(135deg,#C41E3A,#E02244)"
              : `linear-gradient(135deg,${T2.surface2} 0%,${T2.surface3} 60%,#C41E3A22 100%)`,
            border:`2.5px solid ${open?"#E02244":"#C9A84C"}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer",
            boxShadow: open
              ? "0 8px 32px rgba(196,30,58,0.6),0 2px 8px rgba(0,0,0,0.5)"
              : "0 8px 28px rgba(10,30,74,0.7),0 0 0 1px rgba(201,168,76,0.2)",
            transition:"all 0.38s cubic-bezier(0.34,1.56,0.64,1)",
            transform: open ? "scale(1.05)" : "scale(1)",
            overflow:"hidden",
          }} className="gc-clickable">
          <span style={{fontSize:24,filter:"drop-shadow(0 1px 4px rgba(0,0,0,0.5))",transition:"all 0.3s",pointerEvents:"none"}}>
            {open ? "✕" : "🤖"}
          </span>
        </div>

        {/* Badge rouge : réponses IA non lues — positionné sur le wrapper, déborde librement */}
        {!open && (() => {
          const unreadIA = msgs.filter(m=>m.role==="assistant"&&m.engine!=="system"&&!m.read).length;
          if (unreadIA === 0) return null;
          return (
            <span style={{
              position:"absolute", top:-6, right:-6,
              minWidth:20, height:20, borderRadius:10,
              background:"linear-gradient(135deg,#C41E3A,#E02244)",
              color:"#fff", fontSize:10, fontWeight:900,
              display:"flex", alignItems:"center", justifyContent:"center",
              border:"2.5px solid #050D1A", padding:"0 5px",
              boxShadow:"0 2px 10px rgba(196,30,58,0.85)",
              zIndex:10, pointerEvents:"none", lineHeight:1,
            }} className="gc-badge-ping">{unreadIA > 9 ? "9+" : unreadIA}</span>
          );
        })()}

        {/* Badge doré : tâches urgentes — bas-gauche, déborde librement */}
        {!open && liveContext.tachesUrgentes > 0 && (
          <span style={{
            position:"absolute", bottom:-6, left:-6,
            minWidth:20, height:20, borderRadius:10,
            background:"linear-gradient(135deg,#F59E0B,#D97706)",
            color:"#fff", fontSize:9, fontWeight:900,
            display:"flex", alignItems:"center", justifyContent:"center",
            border:"2.5px solid #050D1A", padding:"0 4px",
            boxShadow:"0 2px 10px rgba(245,158,11,0.75)",
            zIndex:10, pointerEvents:"none", lineHeight:1,
          }}>⚡{liveContext.tachesUrgentes}</span>
        )}
      </div>

      {/* ── PANEL CHAT ──────────────────────────────────────── */}
      {open && (
        <div className="gc-modal-in" style={{
          position:"fixed", bottom:maximized?16:92, right:24, zIndex:1000,
          width:panelW, height:panelH,
          background:T2.surface,
          border:`1px solid ${T2.border}`,
          borderRadius:maximized?16:22,
          boxShadow:"0 28px 88px rgba(0,0,0,0.82),0 0 0 1px rgba(196,30,58,0.15),inset 0 1px 0 rgba(255,255,255,0.04)",
          display:"flex", flexDirection:"column", overflow:"hidden",
        }}>

          {/* ── HEADER ────────────────────────────────────────── */}
          <div style={{
            background:`linear-gradient(135deg,${T2.surface2} 55%,${T2.surface3} 80%,#C41E3A18 100%)`,
            borderBottom:`1px solid ${T2.border}`,
            padding:"10px 14px",
            display:"flex", alignItems:"center", gap:10, flexShrink:0,
          }}>
            <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#C41E3A,#A01030)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,boxShadow:"0 0 12px rgba(196,30,58,0.4)"}}>🤖</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:T2.text,fontWeight:800,fontSize:12,letterSpacing:0.3}}>{aiCfg.params?.panelTitle||"Assistant IA · Génie Consultant"}</div>
              <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:loading?"#F59E0B":"#22C55E",display:"inline-block",flexShrink:0}} className={loading?"gc-pulse":""} />
                <span style={{color:T2.textMuted,fontSize:9}}>
                  {loading ? `Génération (${ENGINE_BADGE[lastEngine||"claude"]?.label||"Moteur par défaut"})…` : `En ligne · ${currentUser?.role||""} · Niv.${currentUser?.level||1} · ${lastEngine?ENGINE_BADGE[lastEngine]?.label:"Auto"}`}
                </span>
                {rateError && <span style={{color:"#EF4444",fontSize:9,fontWeight:700}}>⚠️ Limite</span>}
              </div>
            </div>

            {/* Sélecteur moteur — dynamique depuis config Admin */}
            <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
              <button onClick={()=>setActiveEngine("auto")} title="File auto (ordre admin)"
                style={{background:activeEngine==="auto"?"#C9A84C":T2.surface3,border:`1px solid ${activeEngine==="auto"?"#C9A84C":T2.border}`,color:activeEngine==="auto"?"#000":T2.textDim,borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9,fontWeight:700}}>🔀</button>
              {_visEng.map(id=>{const b=ENGINE_BADGE[id]||{};const act=activeEngine===id;return(
                <button key={id} onClick={()=>setActiveEngine(act?"auto":id)} title={`Priorité : ${b.label||id}`}
                  style={{background:act?b.color:T2.surface3,border:`1px solid ${act?b.color:T2.border}`,color:act?"#fff":T2.textDim,borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9,fontWeight:700}}>{b.icon}</button>
              );})}
            </div>

            {/* Contrôles */}
            <div style={{display:"flex",gap:3}}>
              <button onClick={()=>setMaximized(m=>!m)} title={maximized?"Réduire":"Agrandir"}
                style={{background:T2.surface3,border:`1px solid ${T2.border}`,color:T2.textMuted,borderRadius:5,padding:"4px 7px",cursor:"pointer",fontSize:11}}>
                {maximized?"⊡":"⊞"}
              </button>
              <button onClick={()=>{
                saveConvToHistory(msgs);
                setMsgs([{role:"assistant",text:`## Nouveau chat 🤖\n\n**${currentUser?.name?.split(" ")[0]||""}**, je suis prêt. Votre contexte est rechargé.\n\n${liveContext.dossiersActifs>0?"📁 "+liveContext.dossiersActifs+" dossier(s) actif(s)":""}${liveContext.tachesUrgentes>0?" · ⚡ "+liveContext.tachesUrgentes+" tâche(s) urgente(s)":""}`,engine:"system",at:new Date().toISOString()}]);
                setLastEngine(null); setUploadedFile(null); setShowFileUpload(false);
              }} title="Nouveau chat (sauvegarde l'actuel)"
                style={{background:T2.surface3,border:`1px solid ${T2.border}`,color:T2.textMuted,borderRadius:5,padding:"4px 7px",cursor:"pointer",fontSize:11}}>🆕</button>
              <button onClick={()=>setShowHistory(h=>!h)} title="Historique des conversations"
                style={{background:showHistory?"#C9A84C33":T2.surface3,border:`1px solid ${showHistory?"#C9A84C":T2.border}`,color:showHistory?"#C9A84C":T2.textMuted,borderRadius:5,padding:"4px 7px",cursor:"pointer",fontSize:11}}>🕐</button>
            </div>
          </div>

          {/* ── CONTEXT BAR (live data) ──────────────────────── */}
          {(liveContext.dossiersActifs > 0 || liveContext.tachesEnCours > 0) && (
            <div style={{display:"flex",gap:6,padding:"5px 12px",background:`${T2.surface2}dd`,borderBottom:`1px solid ${T2.border}20`,flexWrap:"wrap",flexShrink:0}}>
              {liveContext.dossiersActifs>0 && <span style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:99,padding:"2px 8px",fontSize:9,color:"#3B82F6",fontWeight:700}}>📁 {liveContext.dossiersActifs} dossier(s)</span>}
              {liveContext.tachesEnCours>0 && <span style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:99,padding:"2px 8px",fontSize:9,color:"#A855F7",fontWeight:700}}>📋 {liveContext.tachesEnCours} tâche(s)</span>}
              {liveContext.tachesUrgentes>0 && <span style={{background:"#EF444422",border:"1px solid #EF444444",borderRadius:99,padding:"2px 8px",fontSize:9,color:"#EF4444",fontWeight:700}}>⚡ {liveContext.tachesUrgentes} urgente(s)</span>}
              {liveContext.rdvsAujourdhui>0 && <span style={{background:"#06B6D422",border:"1px solid #06B6D444",borderRadius:99,padding:"2px 8px",fontSize:9,color:"#06B6D4",fontWeight:700}}>📅 {liveContext.rdvsAujourdhui} RDV aujourd'hui</span>}
              {liveContext.dossiersEnRetard>0 && <span style={{background:"#C41E3A22",border:"1px solid #C41E3A44",borderRadius:99,padding:"2px 8px",fontSize:9,color:"#C41E3A",fontWeight:700}}>⚠️ {liveContext.dossiersEnRetard} en retard</span>}
              <span style={{color:T2.textDim,fontSize:8,marginLeft:"auto",alignSelf:"center"}}>🔄 Contexte temps réel</span>
            </div>
          )}

          {/* ── MODULE SELECTOR — collapsible +/- ─────────── */}
          <div style={{borderBottom:`1px solid ${T2.border}20`,flexShrink:0,background:T2.surface3}}>
            <div style={{display:"flex",alignItems:"center",padding:"4px 10px",gap:6}}>
              <span style={{color:T2.textDim,fontSize:9,flex:1}}>🧭 Contexte IA : {module==="default"?"Général":module.charAt(0).toUpperCase()+module.slice(1)}</span>
              <button onClick={()=>setShowModuleBar(v=>!v)}
                title={showModuleBar?"Réduire les modules":"Développer les modules"}
                style={{background:"transparent",border:`1px solid ${T2.border}44`,color:T2.textMuted,borderRadius:4,padding:"1px 7px",cursor:"pointer",fontSize:11,fontWeight:900,lineHeight:1}}>
                {showModuleBar?"−":"+"}
              </button>
            </div>
            {showModuleBar && (
              <div style={{display:"flex",gap:3,padding:"3px 10px 6px",overflowX:"auto"}}>
                {Object.entries({default:"🏠",juridique:"⚖️",finance:"💰",audit:"🔍",conformite:"🛡️",sirh:"👥",conseil:"🎯"}).map(([mod,ico])=>(
                  <button key={mod} onClick={()=>{setModule(mod);setShowModuleBar(false);}}
                    style={{background:module===mod?"#C41E3A":"transparent",border:`1px solid ${module===mod?"#C41E3A":T2.border+"44"}`,color:module===mod?"#fff":T2.textDim,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:9,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>
                    {ico} {mod==="default"?"Général":mod.charAt(0).toUpperCase()+mod.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── HISTORY PANEL ─────────────────────────────────── */}
          {showHistory && (
            <div style={{flex:1,overflowY:"auto",padding:"10px 12px",background:T2.surface}}>
              <div style={{color:T2.text,fontWeight:800,fontSize:12,marginBottom:10}}>🕐 Historique des conversations</div>
              {chatHistory.length===0 ? (
                <div style={{color:T2.textDim,fontSize:11,textAlign:"center",padding:"30px 0"}}>Aucune conversation sauvegardée.<br/><span style={{fontSize:9}}>Cliquez 🆕 pour démarrer et sauvegarder.</span></div>
              ) : (
                chatHistory.map((h,idx)=>(
                  <div key={h.id} style={{background:T2.surface2,border:`1px solid ${T2.border}`,borderRadius:8,padding:"9px 12px",marginBottom:6,cursor:"pointer"}}
                    onClick={()=>{saveConvToHistory(msgs);setMsgs(h.msgs);setShowHistory(false);}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                      <div style={{color:T2.text,fontWeight:600,fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.title}</div>
                      <button onClick={e=>{e.stopPropagation();const u=[...chatHistory];u.splice(idx,1);setChatHistory(u);const uid=currentUser?.id||"guest";try{_lsSet(`gc-ai-history:${uid}`,JSON.stringify(u));}catch(_){};}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:11,flexShrink:0}}>🗑️</button>
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:3}}>
                      <span style={{color:T2.textDim,fontSize:9}}>📅 {new Date(h.at).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                      <span style={{color:T2.textDim,fontSize:9}}>💬 {h.count} messages</span>
                    </div>
                  </div>
                ))
              )}
              {chatHistory.length>0 && (
                <button onClick={()=>{setChatHistory([]);const uid=currentUser?.id||"guest";try{_lsSet(`gc-ai-history:${uid}`,"[]");}catch(_){}}} style={{width:"100%",background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"7px 0",cursor:"pointer",fontSize:10,marginTop:8}}>
                  🗑️ Effacer tout l'historique
                </button>
              )}
            </div>
          )}

          {/* ── MESSAGES ─────────────────────────────────────── */}
          {!showHistory && <div style={{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
            {msgs.map((m,i)=>{
              const eng = ENGINE_BADGE[m.engine] || ENGINE_BADGE.claude;
              const isUser = m.role === "user";
              return (
                <div key={i} style={{display:"flex",gap:8,flexDirection:isUser?"row-reverse":"row",alignItems:"flex-start"}}>
                  <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,marginTop:2,background:isUser?(currentUser?.color||"#3B82F6"):`linear-gradient(135deg,${eng.color},${eng.color}99)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700,boxShadow:"0 2px 8px rgba(0,0,0,0.3)",border:`1.5px solid ${isUser?(currentUser?.color||"#3B82F6")+"55":eng.color+"44"}`}}>
                    {isUser?(currentUser?.avatar?.slice(0,2)||"👤"):eng.icon}
                  </div>
                  <div style={{maxWidth:maximized?"78%":"84%",display:"flex",flexDirection:"column",gap:3,alignItems:isUser?"flex-end":"flex-start"}}>
                    {!isUser && m.engine && m.engine!=="system" && (
                      <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:1}}>
                        <span style={{background:`${eng.color}22`,border:`1px solid ${eng.color}44`,borderRadius:4,padding:"1px 6px",fontSize:8,color:eng.color,fontWeight:700}}>{eng.icon} {eng.label}</span>
                        <span style={{color:T2.textDim,fontSize:8}}>{m.at?new Date(m.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}):""}</span>
                      </div>
                    )}
                    <div style={{padding:"10px 14px",borderRadius:isUser?"18px 4px 18px 18px":"4px 18px 18px 18px",background:isUser?`linear-gradient(135deg,${currentUser?.color||"#3B82F6"},${currentUser?.color||"#1D4ED8"})`:m.engine==="security"?"#F59E0B15":m.engine==="error"?"#EF444415":T2.surface2,border:`1px solid ${isUser?"transparent":m.engine==="security"?"#F59E0B44":m.engine==="error"?"#EF444444":T2.border}`,boxShadow:"0 2px 10px rgba(0,0,0,0.18)",minWidth:80}}>
                      {isUser?<span style={{fontSize:12.5,lineHeight:1.6,color:T2.text}}>{m.displayText||m.text}</span>:<GCAIMarkdown text={m.text} T2={T2} />}
                    </div>
                    {!isUser && m.text.length>10 && (
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        <button onClick={()=>copyMsg(i,m.text)} style={{background:"transparent",border:"none",color:copied===i?"#22C55E":T2.textDim,cursor:"pointer",fontSize:9,padding:"1px 4px",borderRadius:4}}>
                          {copied===i?"✅ Copié":"📋 Copier"}
                        </button>
                        {m.engine==="error" && (
                          <button onClick={()=>{
                            // Use saved retryText or fall back to last user message
                            const lastUser = [...msgs].reverse().find(x=>x.role==="user");
                            const retryQ = m.retryText || lastUser?.text || "";
                            if(retryQ) send(retryQ);
                          }}
                            style={{background:"#C41E3A22",border:"1px solid #C41E3A66",color:"#C41E3A",cursor:"pointer",fontSize:10,padding:"4px 12px",borderRadius:6,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                            ↩ Réessayer
                          </button>
                        )}
                        {m.text.length>200 && (
                          <button onClick={()=>{ const blob=new Blob([m.text],{type:"text/plain"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`IA_reponse_${new Date().toISOString().slice(0,10)}.txt`; a.click(); }} style={{background:"transparent",border:"none",color:T2.textDim,cursor:"pointer",fontSize:9,padding:"1px 4px",borderRadius:4}}>
                            💾 Télécharger
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#C41E3A,#A01030)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",flexShrink:0}}>🤖</div>
                <div style={{background:T2.surface2,border:`1px solid ${T2.border}`,borderRadius:"4px 18px 18px 18px",padding:"12px 18px",display:"flex",gap:6,alignItems:"center"}}>
                  {[0,1,2].map(j=><span key={j} style={{width:8,height:8,borderRadius:"50%",background:"#C41E3A",display:"inline-block",animation:`gc-bounce 1.2s ${j*0.18}s infinite ease-in-out`}} />)}
                  <span style={{color:T2.textDim,fontSize:9,marginLeft:4}}>{activeEngine==="gemini"?"Gemini Pro génère…":"Moteur par défaut génère…"}</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>}

          {/* ── FICHIER JOINT (si présent) ───────────────────── */}
          {uploadedFile && (
            <div style={{padding:"5px 12px",background:"#3B82F618",borderTop:`1px solid #3B82F633`,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <span style={{fontSize:12}}>📎</span>
              <span style={{color:"#3B82F6",fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{uploadedFile.name} ({(uploadedFile.size/1024).toFixed(1)}KB)</span>
              <button onClick={()=>setUploadedFile(null)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12}}>✕</button>
            </div>
          )}

          {/* ── SUGGESTIONS ──────────────────────────────────── */}
          <div style={{padding:"5px 10px",borderTop:`1px solid ${T2.border}20`,background:T2.surface2,display:"flex",gap:4,overflowX:"auto",flexShrink:0}}>
            {dynamicSuggestions.map((s,i)=>(
              <button key={i} onClick={()=>send(s)} disabled={loading}
                style={{background:"transparent",border:`1px solid ${i<2&&liveContext.tachesUrgentes>0?"#EF444455":T2.border+"55"}`,color:i<2&&liveContext.tachesUrgentes>0?"#EF4444":T2.textDim,borderRadius:16,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>
                {s}
              </button>
            ))}
          </div>

          {/* ── INPUT ────────────────────────────────────────── */}
          <div style={{padding:"8px 10px",borderTop:`1px solid ${T2.border}`,display:"flex",gap:6,flexShrink:0,background:T2.surface,alignItems:"flex-end"}}>
            {/* Bouton fichier */}
            <button onClick={()=>fileRef.current?.click()} title="Joindre un fichier texte/PDF"
              style={{background:uploadedFile?"#3B82F622":T2.surface2,border:`1px solid ${uploadedFile?"#3B82F6":T2.border}`,borderRadius:10,padding:"8px",cursor:"pointer",fontSize:14,flexShrink:0,color:uploadedFile?"#3B82F6":T2.textDim}}>
              📎
            </button>
            <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.js,.jsx,.ts,.py" style={{display:"none"}} onChange={handleFileUpload} />
            <textarea ref={inputRef} value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }}
              placeholder={rateError?"⚠️ Limite atteinte. Réessayez dans quelques secondes.":"Question juridique, analyse, modèle… (↵ Envoyer, ⇧↵ Nouvelle ligne)"}
              rows={2} disabled={rateError}
              style={{flex:1,background:T2.surface2,border:`1px solid ${rateError?"#EF4444":T2.border}`,borderRadius:12,padding:"8px 12px",color:T2.text,fontSize:12.5,resize:"none",outline:"none",fontFamily:"inherit",lineHeight:1.5}}
              onFocus={e=>{e.target.style.borderColor="#C41E3A";e.target.style.boxShadow="0 0 0 2px rgba(196,30,58,0.2)";}}
              onBlur={e=>{e.target.style.borderColor=T2.border;e.target.style.boxShadow="none";}}
            />
            <button onClick={()=>send()} disabled={!input.trim()||loading||rateError}
              style={{background:input.trim()&&!loading&&!rateError?(ENGINE_BADGE[activeEngine]?.color?`linear-gradient(135deg,${ENGINE_BADGE[activeEngine].color},${ENGINE_BADGE[activeEngine].color}CC)`:"linear-gradient(135deg,#C41E3A,#E02244)"):T2.surface2,border:`1px solid ${input.trim()&&!loading?"#C41E3A":T2.border}`,borderRadius:12,padding:"10px 14px",color:input.trim()&&!loading&&!rateError?"#fff":T2.textDim,fontSize:18,flexShrink:0,boxShadow:input.trim()&&!loading&&!rateError?"0 4px 16px rgba(196,30,58,0.4)":"none",minWidth:44,alignSelf:"stretch"}}>
              {loading?<span style={{animation:"gc-pulse 1s infinite"}}>⏳</span>:"➤"}
            </button>
          </div>

          {/* ── PIED ─────────────────────────────────────────── */}
          <div style={{padding:"3px 12px",background:T2.surface,borderTop:`1px solid ${T2.border}20`,display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:8,color:T2.textDim}}>🔐 Niv.{currentUser?.level||1}/6 · {currentUser?.id?.slice(-6)||"—"}</span>
            <button onClick={async () => {
              const cfg=gcAILoadConfig();
              const key = await gcPrompt("Clé API Claude (Anthropic) — optionnel, améliore la connexion :\n\nLaissez vide pour utiliser le moteur Gemini par défaut.\nObtenir une clé : https://console.anthropic.com",cfg.engines?.claude?.apiKey||"");
              if(key!==null){const updated={...cfg,engines:{...cfg.engines,claude:{...cfg.engines.claude,apiKey:key.trim()}}};gcAISaveConfig(updated);gcAlert(key.trim()?"✅ Clé Claude sauvegardée. Elle sera utilisée en priorité.":"✅ Clé Claude effacée. Gemini (par défaut) sera utilisé.");}
            }} style={{background:"transparent",border:"none",color:T2.textDim,cursor:"pointer",fontSize:8,fontWeight:700,textDecoration:"underline",padding:0}}>⚙️ Config clé API</button>
            <span style={{marginLeft:"auto",fontSize:8,color:T2.textDim}}>
              <strong style={{color:activeEngine==="auto"?"#C9A84C":(ENGINE_BADGE[activeEngine]?.color||"#C41E3A")}}>{activeEngine==="auto"?"File auto":"Priorité : "+(ENGINE_BADGE[activeEngine]?.label||"Moteur par défaut")}</strong>
            </span>
          </div>
        </div>
      )}
    </>
  );
});

export function AIConfigAdminTab({ T, isAdmin=false, isMG=false }) {
  const [aiConfig, setAiConfig] = React.useState(()=>gcAILoadConfig());
  const [aiTesting, setAiTesting] = React.useState(null);
  const [aiTestResult, setAiTestResult] = React.useState(null);
  const [saved, setSaved] = React.useState(false);

  const updateEngineField = (eid, field, val) =>
    setAiConfig(c=>({...c, engines:{...c.engines,[eid]:{...c.engines[eid],[field]:val}}}));

  const handleSave = () => {
    gcAISaveConfig(aiConfig);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2500);
  };

  const testEngine = async (eid) => {
    setAiTesting(eid); setAiTestResult(null);
    const ecfg = aiConfig.engines[eid];
    const label = ecfg?.userLabel||(eid==="claude"?"Moteur par défaut":ecfg?.label||eid);
    try {
      let result = "";
      if(eid==="gemini") result = await gcAICallGemini("Réponds juste: opérationnel",[{role:"user",text:"Test"}],ecfg?.apiKey);
      else if(eid==="gpt") result = await gcAICallGPT("Réponds juste: opérationnel",[{role:"user",text:"Test"}],ecfg?.apiKey);
      else result = await gcAICallClaude("Réponds juste: opérationnel",[{role:"user",text:"Test"}]);
      setAiTestResult({engine:eid,ok:true,msg:`✅ ${label} opérationnel — "${(result||"").slice(0,40)}"`});
    } catch(e) {
      setAiTestResult({engine:eid,ok:false,msg:`❌ ${label} : ${e.message?.slice(0,80)}`});
    }
    setAiTesting(null);
  };

  const moveQueue = (idx, dir) => {
    const q = [...(aiConfig.fallbackQueue||[])];
    const newIdx = idx+dir;
    if(newIdx<0||newIdx>=q.length) return;
    [q[idx],q[newIdx]]=[q[newIdx],q[idx]];
    setAiConfig(c=>({...c,fallbackQueue:q}));
  };

  const removeQueue = (idx) => {
    const q = [...(aiConfig.fallbackQueue||[])];
    q.splice(idx,1);
    setAiConfig(c=>({...c,fallbackQueue:q}));
  };

  const addToQueue = (eid) => {
    if(!(aiConfig.fallbackQueue||[]).includes(eid))
      setAiConfig(c=>({...c,fallbackQueue:[...(c.fallbackQueue||[]),eid]}));
  };

  // DG voit uniquement Gemini et GPT — Claude reste masqué (backend interne)
  const ALL_ENG = isAdmin ? ["claude","gemini","gpt"] : ["gemini","gpt"];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,padding:"4px 0"}}>
      {/* SAVE BAR */}
      <div style={{display:"flex",gap:10,alignItems:"center",background:T.surface2,borderRadius:10,padding:"10px 16px",border:`1px solid ${T.border}`}}>
        <button onClick={handleSave} style={{background:"linear-gradient(135deg,#22C55E,#16A34A)",border:"none",borderRadius:8,padding:"8px 20px",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>
          💾 Enregistrer la configuration IA
        </button>
        {saved && <span style={{color:"#22C55E",fontWeight:700,fontSize:11}}>✅ Configuration sauvegardée !</span>}
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {ALL_ENG.filter(id=>{const e=aiConfig.engines[id];return e&&e.enabled&&!e.suspended&&!e.hidden;}).map(id=>{
            const e=aiConfig.engines[id];
            return <span key={id} style={{background:(e.color||"#333")+"22",border:`1px solid ${e.color||"#333"}44`,borderRadius:6,padding:"3px 10px",fontSize:9,color:e.color||T.text,fontWeight:700}}>{e.icon} {e.userLabel||(id==="claude"?"Moteur par défaut":e.label)}: ✅</span>;
          })}
          <span style={{background:"#C9A84C22",border:"1px solid #C9A84C44",borderRadius:6,padding:"3px 10px",fontSize:9,color:"#C9A84C",fontWeight:700}}>
            Moteur: {aiConfig.defaultEngine==="auto"?"File auto":(aiConfig.engines?.[aiConfig.defaultEngine]?.userLabel||(aiConfig.defaultEngine==="claude"?"Moteur par défaut":aiConfig.defaultEngine))}
          </span>
        </div>
      </div>

      {/* MOTEUR PAR DÉFAUT */}
      <div style={{background:T.surface2,borderRadius:12,padding:"14px 16px",border:`1px solid ${T.border}`}}>
        <div style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:10}}>🎯 Moteur par défaut</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>setAiConfig(c=>({...c,defaultEngine:"auto"}))}
            style={{background:aiConfig.defaultEngine==="auto"?"#C9A84C33":T.surface3,border:`2px solid ${aiConfig.defaultEngine==="auto"?"#C9A84C":T.border}`,color:aiConfig.defaultEngine==="auto"?"#C9A84C":T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
            🔀 File auto
          </button>
          {ALL_ENG.map(id=>{
            const e=aiConfig.engines[id]||{};
            const uLabel=e.userLabel||(id==="claude"?"Moteur par défaut":e.label||id);
            const isAct=aiConfig.defaultEngine===id;
            return <button key={id} onClick={()=>setAiConfig(c=>({...c,defaultEngine:id}))}
              style={{background:isAct?(e.color||"#888")+"33":T.surface3,border:`2px solid ${isAct?(e.color||"#888"):T.border}`,color:isAct?(e.color||"#888"):T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11,opacity:e.enabled?1:0.45}}>
              {e.icon} {uLabel}{!e.enabled?" (inactif)":""}
            </button>;
          })}
        </div>
      </div>

      {/* FILE DE PRIORITÉ */}
      <div style={{background:T.surface2,borderRadius:12,padding:"14px 16px",border:`1px solid ${T.border}`}}>
        <div style={{color:"#6366F1",fontWeight:800,fontSize:12,marginBottom:10}}>🔀 File de priorité (ordre de fallback)</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
          {(aiConfig.fallbackQueue||[]).map((eid,idx)=>{
            const e=aiConfig.engines[eid]||{};
            const uLabel=e.userLabel||(eid==="claude"?"Moteur par défaut":e.label||eid);
            return (
              <div key={eid+idx} style={{display:"flex",gap:8,alignItems:"center",background:T.surface3,borderRadius:8,padding:"6px 12px",border:`1px solid ${T.border}`}}>
                <span style={{color:e.color||T.text,fontWeight:800,fontSize:13}}>{e.icon}</span>
                <span style={{flex:1,color:T.text,fontSize:11,fontWeight:600}}>{uLabel}</span>
                <span style={{color:T.textDim,fontSize:9,marginRight:4}}>#{idx+1}</span>
                <button onClick={()=>moveQueue(idx,-1)} disabled={idx===0} style={{background:"none",border:"none",cursor:idx>0?"pointer":"default",color:idx>0?T.text:T.textDim,fontSize:12,padding:"0 3px"}}>▲</button>
                <button onClick={()=>moveQueue(idx,1)} disabled={idx>=(aiConfig.fallbackQueue||[]).length-1} style={{background:"none",border:"none",cursor:idx<(aiConfig.fallbackQueue||[]).length-1?"pointer":"default",color:idx<(aiConfig.fallbackQueue||[]).length-1?T.text:T.textDim,fontSize:12,padding:"0 3px"}}>▼</button>
                <button onClick={()=>removeQueue(idx)} style={{background:"#EF444422",border:"1px solid #EF444433",borderRadius:4,color:"#EF4444",cursor:"pointer",fontSize:9,fontWeight:700,padding:"1px 6px"}}>✕</button>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {ALL_ENG.filter(id=>!(aiConfig.fallbackQueue||[]).includes(id)).map(id=>{
            const e=aiConfig.engines[id]||{};
            return <button key={id} onClick={()=>addToQueue(id)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,color:T.textMuted,cursor:"pointer",fontSize:10,fontWeight:600,padding:"4px 10px"}}>+ {e.userLabel||(id==="claude"?"Moteur par défaut":e.label||id)}</button>;
          })}
        </div>
        <div style={{color:T.textDim,fontSize:9,marginTop:6}}>Utilisez ▲▼ pour réordonner. Le moteur principal est utilisé en premier.</div>
      </div>

      {/* MOTEURS */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
        {ALL_ENG.map(eid=>{
          const ecfg=aiConfig.engines[eid]||{};
          const isClaudeEngine=eid==="claude";
          return (
            <div key={eid} style={{background:T.surface2,borderRadius:12,padding:"14px 16px",border:`2px solid ${ecfg.enabled?(ecfg.color||"#22C55E")+"44":T.border}`,opacity:ecfg.enabled?1:0.7}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:20}}>{ecfg.icon}</span>
                <div style={{flex:1}}>
                  <div style={{color:ecfg.color||T.text,fontWeight:800,fontSize:13}}>{ecfg.label}</div>
                  <div style={{color:T.textDim,fontSize:9}}>{ecfg.note||""}</div>
                </div>
                <button onClick={()=>updateEngineField(eid,"hidden",!ecfg.hidden)}
                  style={{background:ecfg.hidden?"#F59E0B22":"#6366F122",border:`1px solid ${ecfg.hidden?"#F59E0B44":"#6366F144"}`,borderRadius:6,color:ecfg.hidden?"#F59E0B":"#6366F1",cursor:"pointer",fontSize:9,fontWeight:700,padding:"3px 8px"}}
                  title={ecfg.hidden?"Afficher dans l'interface":"Masquer de l'interface"}>
                  {ecfg.hidden?"👁 Afficher":"🙈 Masquer"}
                </button>
              </div>

              {/* Nom affiché aux utilisateurs */}
              <div style={{marginBottom:10}}>
                <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>
                  🏷️ Nom affiché aux utilisateurs
                  {isClaudeEngine&&<span style={{color:"#C41E3A",fontWeight:600}}> — "Moteur par défaut" — jamais le nom technique</span>}
                </div>
                <input type="text" value={ecfg.userLabel||(isClaudeEngine?"Moteur par défaut":ecfg.label||eid)}
                  placeholder={isClaudeEngine?"Moteur par défaut":"Ex: Intelligence IA…"}
                  onChange={e=>updateEngineField(eid,"userLabel",e.target.value)}
                  style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:11,outline:"none",boxSizing:"border-box"}} />
                {isClaudeEngine&&<div style={{color:T.textDim,fontSize:9,marginTop:2}}>Nom affiché dans le chat, badges, statuts et panneau assistant. Par défaut : "Moteur par défaut".</div>}
              </div>

              {/* Activé / Suspendu */}
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{flex:1}}>
                  <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>Activé</div>
                  <div onClick={()=>updateEngineField(eid,"enabled",!ecfg.enabled)}
                    style={{width:44,height:24,borderRadius:99,background:ecfg.enabled?"#22C55E":"#EF4444",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                    <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:ecfg.enabled?23:3,transition:"left 0.2s",boxShadow:"0 1px 4px #0005"}}/>
                  </div>
                </div>
                <div style={{flex:1}}>
                  <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>Suspendu</div>
                  <div onClick={()=>updateEngineField(eid,"suspended",!ecfg.suspended)}
                    style={{width:44,height:24,borderRadius:99,background:ecfg.suspended?"#F59E0B":"#6B7280",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                    <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:ecfg.suspended?23:3,transition:"left 0.2s",boxShadow:"0 1px 4px #0005"}}/>
                  </div>
                </div>
              </div>

              {/* Clé API */}
              {!isClaudeEngine && (
                <div style={{marginBottom:10}}>
                  <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>🔑 Clé API</div>
                  <div style={{display:"flex",gap:8}}>
                    <input type="password" value={ecfg.apiKey||""} onChange={e=>updateEngineField(eid,"apiKey",e.target.value)}
                      placeholder={eid==="gpt"?"sk-proj-...":"AIzaSy..."}
                      style={{flex:1,background:T.surface3,border:`1px solid ${ecfg.apiKey?"#22C55E44":T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:11,fontFamily:"monospace",outline:"none"}}/>
                    <button onClick={()=>testEngine(eid)} disabled={!ecfg.apiKey||!ecfg.enabled||!!aiTesting}
                      style={{background:aiTesting===eid?"#F59E0B22":"#22C55E22",border:`1px solid ${aiTesting===eid?"#F59E0B44":"#22C55E44"}`,color:aiTesting===eid?"#F59E0B":"#22C55E",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:10,flexShrink:0}}>
                      {aiTesting===eid?"⏳ Test…":"🧪 Tester"}
                    </button>
                  </div>
                  {ecfg.apiKey?<div style={{color:"#22C55E",fontSize:9,marginTop:3}}>✅ Clé renseignée ({ecfg.apiKey.length} car.)</div>:<div style={{color:"#F59E0B",fontSize:9,marginTop:3}}>⚠️ Clé manquante — moteur désactivé automatiquement</div>}
                </div>
              )}
              {isClaudeEngine&&(
                <div style={{background:"#C41E3A12",border:"1px solid #C41E3A33",borderRadius:8,padding:"7px 12px",marginBottom:10}}>
                  <div style={{color:"#C41E3A",fontSize:10,fontWeight:600}}>🔐 Authentification gérée automatiquement via Anthropic</div>
                  <div style={{color:T.textDim,fontSize:9,marginTop:2}}>Aucune clé API requise.</div>
                </div>
              )}

              {/* Test result */}
              {aiTestResult?.engine===eid&&(
                <div style={{background:aiTestResult.ok?"#22C55E12":"#EF444412",border:`1px solid ${aiTestResult.ok?"#22C55E33":"#EF444433"}`,borderRadius:7,padding:"6px 10px",fontSize:10,color:aiTestResult.ok?"#22C55E":"#EF4444",fontWeight:600}}>
                  {aiTestResult.msg}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* PARAMÈTRES AVANCÉS */}
      <div style={{background:T.surface2,borderRadius:12,padding:"16px 18px",border:`1px solid ${T.border}`}}>
        <div style={{color:"#A855F7",fontWeight:800,fontSize:12,marginBottom:12}}>⚙️ Paramètres avancés</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
          <div>
            <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>Max tokens / réponse</div>
            <input type="number" value={aiConfig.params?.maxTokens||2000} min={200} max={8000} step={100}
              onChange={e=>setAiConfig(c=>({...c,params:{...c.params,maxTokens:parseInt(e.target.value)||2000}}))}
              style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:11,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>Température (0–1)</div>
            <input type="number" value={aiConfig.params?.temperature||0.7} min={0} max={1} step={0.1}
              onChange={e=>setAiConfig(c=>({...c,params:{...c.params,temperature:parseFloat(e.target.value)||0.7}}))}
              style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:11,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>Limite requêtes/min</div>
            <input type="number" value={aiConfig.params?.rateLimit||30} min={5} max={100}
              onChange={e=>setAiConfig(c=>({...c,params:{...c.params,rateLimit:parseInt(e.target.value)||30}}))}
              style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:11,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>Mode contexte</div>
            <div style={{display:"flex",gap:6}}>
              {["full","summary"].map(m=>(
                <button key={m} onClick={()=>setAiConfig(c=>({...c,params:{...c.params,contextMode:m}}))}
                  style={{flex:1,background:aiConfig.params?.contextMode===m?"#3B82F633":T.surface3,border:`1px solid ${aiConfig.params?.contextMode===m?"#3B82F6":T.border}`,borderRadius:8,padding:"7px",color:aiConfig.params?.contextMode===m?"#3B82F6":T.textMuted,cursor:"pointer",fontWeight:700,fontSize:10}}>
                  {m==="full"?"📄 Complet":"📝 Résumé"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Message d'accueil */}
        <div style={{marginTop:14}}>
          <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>💬 Message d'accueil personnalisé (vide = automatique)</div>
          <textarea value={aiConfig.params?.welcomeMsg||""} rows={3}
            placeholder="Ex: Bonjour ! Je suis votre assistant dédié…"
            onChange={e=>setAiConfig(c=>({...c,params:{...c.params,welcomeMsg:e.target.value}}))}
            style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:11,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
        </div>

        {/* Nom du panneau */}
        <div style={{marginTop:10}}>
          <div style={{color:T.textMuted,fontSize:10,marginBottom:4,fontWeight:600}}>🏷️ Nom affiché du panneau IA</div>
          <input type="text" value={aiConfig.params?.panelTitle||"Assistant IA · Génie Consultant"}
            onChange={e=>setAiConfig(c=>({...c,params:{...c.params,panelTitle:e.target.value}}))}
            style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:11,outline:"none",boxSizing:"border-box"}}/>
        </div>
      </div>
    </div>
  )};


/* ── DelaisAdminPanel — Extrait de AdminPanel (fix v101: hooks dans IIFE interdits) ── */
export function AIDelaysAdminTab({ T }) {
  const [delays, setDelays] = React.useState(gcAILoadDelays());
  const [saving, setSaving] = React.useState(false);

  const updateDelay = (engine, delay) => {
    setDelays(c=>({...c,[engine]:delay}));
  };

  const handleSave = () => {
    setSaving(true);
    gcAISaveDelays(delays);
    setTimeout(()=>setSaving(false), 2500);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,padding:"4px 0"}}>
      <div style={{display:"flex",gap:10,alignItems:"center",background:T.surface2,borderRadius:10,padding:"10px 16px",border:`1px solid ${T.border}`}}>
        <button onClick={handleSave} style={{background:"linear-gradient(135deg,#22C55E,#16A34A   )",border:"none",borderRadius:8,padding:"8px 20px",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>
          💾 Enregistrer les délais de réponse
        </button>
        {saving && <span style={{color:"#22C55E",fontWeight:700,fontSize:11}}>✅ Délais sauvegardés !</span>}
      </div>

      <div style={{background:T.surface2,borderRadius:12,padding:"14px 16px",border:`1px solid ${T.border}`}}>
        <div style={{color:"#C9A84C",fontWeight:800,fontSize:12,marginBottom:10}}>⏱️ Délais de réponse par moteur (en secondes)</div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {Object.entries(delays).map(([engine, delay])=>(
            <div key={engine} style={{display:"flex",gap:6,alignItems:"center",background:T.surface3,borderRadius:8,padding:"6px 12px",border:`1px solid ${T.border}`}}>
              <span style={{textTransform:"capitalize",color:T.text,fontWeight:600}}>{engine}</span>
              <input type="number" value={delay} min={1} max={120} onChange={e=>updateDelay(engine, parseInt(e.target.value)||1)}
                style={{width:80,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:11,outline:"none",boxSizing:"border-box"}}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  )};