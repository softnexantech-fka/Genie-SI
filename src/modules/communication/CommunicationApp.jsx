import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// CommunicationApp.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, dsSave, dsDeleteItemFromArray } from '../../core/index.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';

export function CommunicationApp({ T, currentUser, setNotifications=_noop }){
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const [tab, setTab] = useState("dashboard");
  const [commSearch, setCommSearch] = useState("");
  const [commCanalFilter, setCommCanalFilter] = useState("ALL");
  const [commStatusFilter, setCommStatusFilter] = useState("ALL");
  const [commSort, setCommSort] = useState("date_desc");
  const [ficheSearch, setFicheSearch] = useState("");
  const [ficheSecteurFilter, setFicheSecteurFilter] = useState("ALL");
  const [campagnes, setCampagnes] = useState(() => { try { return JSON.parse(_lsGet("gc-comm-campagnes")||"[]"); } catch (_) { return []; }});
  const [contacts, setContacts] = useState(() => { try { return JSON.parse(_lsGet("gc-comm-contacts")||"[]"); } catch (_) { return [{id:"CT-001",nom:"Journal L'Union",type:"MEDIA",email:"redaction@union.ga",telephone:"+241 74 00 00",actif:true},{id:"CT-002",nom:"Gabon TV",type:"MEDIA",email:"contact@gabontv.ga",telephone:"+241 76 00 00",actif:true},{id:"CT-003",nom:"Radio Gabon",type:"MEDIA",email:"info@radiogabon.ga",telephone:"+241 72 00 00",actif:true}]; }});
  const [kpiComm] = useState({ publications:12, reach:3400, leads:8, conversions:3 });
  const [campForm, setCampForm] = useState({ titre:"", type:"DIGITAL", canal:"LINKEDIN", budget:"", debut:"", fin:"", objectif:"", statut:"PLANIFIE" });
  const [contForm, setContForm] = useState({ nom:"", type:"MEDIA", email:"", telephone:"", organisation:"" });
  const [showNewCamp, setShowNewCamp] = useState(false);
  const [showNewCont, setShowNewCont] = useState(false);
  const [aiGen, setAiGen] = useState({ loading:false, result:"", type:"" });
  const [customMsg, setCustomMsg] = useState({ sujet:"", corps:"", dest:"" });

  // FIX v153 — saveData utilise dsSave pour la synchronisation cross-machine
  const saveData = (key, data) => {
    try { _lsSet(key, JSON.stringify(data)); } catch (_) {}
    dsSave(key, data).catch(() => {});
  };
  // FIX v153 — gcDeleteFromList : tombstone + serveur + état local
  const gcDeleteFromList = async (key, id, setState, getState) => {
    await dsDeleteItemFromArray(key, id);
    setState(prev => prev.filter(x => x.id !== id));
  };
  const CANAUX = ["LINKEDIN","FACEBOOK","INSTAGRAM","WHATSAPP","EMAIL","PRESSE","TV","RADIO","AFFICHAGE"];
  const TYPES_CAMP = ["DIGITAL","PRINT","ÉVÉNEMENTIEL","RELATIONS_PRESSE","INTERNE","BRANDING"];
  const TYPES_CONTACT = ["MEDIA","AGENCE","PRESSE","INFLUENCEUR","PARTENAIRE","CLIENT","PROSPECT"];
  const STATUTS = { PLANIFIE:"#3B82F6", EN_COURS:"#F59E0B", TERMINE:"#22C55E", SUSPENDU:"#EF4444", BROUILLON:"#7A90B0" };

  const addCampagne = () => {
    if (!campForm.titre) return;
    const c = { id:"CAMP-"+Date.now(), ...campForm, createdBy:currentUser?.name, createdAt:new Date().toISOString() };
    const updated = [c, ...campagnes]; setCampagnes(updated); saveData("gc-comm-campagnes", updated);
    setNotifications?.(p=>[{id:"N"+Date.now(),icon:"📢",message:`Campagne "${c.titre}" créée — ${c.canal}`,at:new Date().toISOString(),read:false},...p]);
    setShowNewCamp(false); setCampForm({ titre:"", type:"DIGITAL", canal:"LINKEDIN", budget:"", debut:"", fin:"", objectif:"", statut:"PLANIFIE" });
  };
  const addContact = () => {
    if (!contForm.nom) return;
    const c = { id:"CT-"+Date.now(), ...contForm, actif:true };
    const updated = [...contacts, c]; setContacts(updated); saveData("gc-comm-contacts", updated);
    setShowNewCont(false); setContForm({ nom:"", type:"MEDIA", email:"", telephone:"", organisation:"" });
  };

  const generateContent = async (type) => {
    setAiGen({ loading:true, result:"", type });
    const prompts = {
      linkedin:"Rédige un post LinkedIn professionnel (250 mots max) pour Génie Consultant, cabinet de conseil juridique à Libreville, Gabon. Expertise : OHADA, fiscalité gabonaise, audit. Ton professionnel, engageant, avec 3 hashtags pertinents.",
      communique:"Rédige un communiqué de presse officiel (300 mots) pour Génie Consultant cabinet expert en conseil juridique, fiscal et audit en Afrique centrale. Style professionnel journalistique.",
      offre:"Rédige une lettre d'offre de services professionnelle (200 mots) pour Génie Consultant. Services : droit des affaires OHADA, fiscalité, audit, conseil stratégique. Ton formel et persuasif.",
      newsletter:"Crée le contenu d'une newsletter mensuelle Génie Consultant (400 mots). Sections : Actualité juridique Gabon/OHADA, Conseil du mois, À retenir.",
    };
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{ "Content-Type":"application/json", "anthropic-dangerous-direct-browser-calls":"true" },
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:800, messages:[{role:"user",content:prompts[type]||prompts.linkedin}] })
      });
      const d = await res.json();
      const txt = d?.content?.map(b=>b.text||"").join("")||"Erreur de génération";
      setAiGen({ loading:false, result:txt, type });
      const labels = {linkedin:"Post LinkedIn",communique:"Communiqué presse",offre:"Offre de services",newsletter:"Newsletter"};
      setCustomMsg(p=>({...p, corps:txt, sujet:labels[type]||type}));
    } catch(e) {
      setAiGen({ loading:false, result:`⚠️ IA indisponible : ${e.message}`, type });
    }
  };

  const TEMPLATES_S04 = [
    { id:"offre",icon:"📄",label:"Offre de Services",color:"#EC4899",desc:"Proposition commerciale" },
    { id:"remerciement",icon:"🤝",label:"Lettre de Remerciement",color:"#22C55E",desc:"Fidélisation client" },
    { id:"relance",icon:"📞",label:"Relance Commerciale",color:"#F59E0B",desc:"Suivi prospect inactif" },
    { id:"linkedin",icon:"💼",label:"Post LinkedIn",color:"#0077B5",desc:"Publication réseau pro" },
    { id:"communique",icon:"📰",label:"Communiqué Presse",color:"#8B5CF6",desc:"Annonce officielle" },
    { id:"newsletter",icon:"📧",label:"Newsletter",color:"#06B6D4",desc:"Bulletin périodique" },
  ];
  const genTemplate = (id) => {
    const now = new Date().toLocaleDateString("fr-FR");
    const n = currentUser?.name || "—";
    const texts = {
      offre:`GÉNIE CONSULTANT — OFFRE DE SERVICES\n\nLibreville, le ${now}\n\nChère Madame, Cher Monsieur,\n\nNous avons l'honneur de vous présenter notre offre de services.\n\n• Droit des affaires & OHADA\n• Fiscalité gabonaise\n• Audit interne & externe\n• Conseil stratégique\n\nCordialement,\n${n}\nGénie Consultant`,
      remerciement:`LETTRE DE REMERCIEMENT\n\nLibreville, le ${now}\n\nChère/Cher [Nom],\n\nNous vous adressons nos sincères remerciements pour votre confiance.\n\nCordialement,\n${n}`,
      relance:`RELANCE COMMERCIALE\n\nLibreville, le ${now}\n\nObjet : Suivi de notre proposition\n\nChère/Cher [Nom],\n\nNous revenons vers vous concernant notre proposition récente.\n\nCordialement,\n${n}`,
      linkedin:`🏢 GÉNIE CONSULTANT | Cabinet de Conseil à Libreville\n\n[Actualité ou conseil du jour]\n\n✅ Droit des affaires OHADA\n✅ Fiscalité gabonaise\n✅ Audit & contrôle\n\nContact : contact@genie-consultant.com\n\n#GabonBusiness #OHADA #ConseilJuridique`,
      communique:`COMMUNIQUÉ DE PRESSE\n\nLibreville, le ${now}\n\nGÉNIE CONSULTANT [ANNONCE]\n\n[Corps du communiqué]\n\nContact : ${currentUser?.email||"contact@genie-consultant.com"}`,
      newsletter:`NEWSLETTER GÉNIE CONSULTANT | ${now}\n\n═══ ACTUALITÉ JURIDIQUE ═══\n[Actualité droit/OHADA ce mois]\n\n═══ CONSEIL DU MOIS ═══\n[Conseil pratique entreprises]\n\n═══ À RETENIR ═══\n[Points clés]\n\nGénie Consultant · contact@genie-consultant.com`,
    };
    setCustomMsg({ sujet:TEMPLATES_S04.find(t=>t.id===id)?.label||"", corps:texts[id]||"", dest:"" });
    setTab("rediger");
  };

  const TABS_S04 = [
    {id:"dashboard",l:"📊 Dashboard"},{id:"campagnes",l:`📢 Campagnes (${campagnes.length})`},
    {id:"templates",l:"✉️ Modèles"},{id:"prospection",l:"🎯 Fiches Prospection"},
    {id:"contacts",l:`📋 Contacts (${contacts.length})`},
    {id:"rediger",l:"✍️ Éditeur"},{id:"ia",l:"🤖 IA"},
  ];

  // ── État fiches prospection ─────────────────────────────────────────────
  const [fiches, setFiches] = useState(()=>{try{return JSON.parse(_lsGet("gc-comm-fiches")||"[]");}catch(_){return [];}});
  const saveFiches = f=>{setFiches(f);try{_lsSet("gc-comm-fiches",JSON.stringify(f));}catch(_){}};
  const [ficheForm, setFicheForm] = useState({prospect:"",secteur:"",contact:"",telephone:"",email:"",besoins:"",offre:"",priorite:"NORMALE",statut:"NOUVEAU",notes:"",dateRelance:""});
  const [editFiche, setEditFiche] = useState(null);
  const [showFicheForm, setShowFicheForm] = useState(false);
  // ── État modèles personnalisés ─────────────────────────────────────────
  const [customTemplates, setCustomTemplates] = useState(()=>{try{return JSON.parse(_lsGet("gc-comm-custom-tpl")||"[]");}catch(_){return [];}});
  const saveTemplates = t=>{setCustomTemplates(t);try{_lsSet("gc-comm-custom-tpl",JSON.stringify(t));}catch(_){}};
  const [tplForm, setTplForm] = useState({titre:"",type:"OFFRE",canal:"EMAIL",sujet:"",corps:"",tags:""});
  const [showTplForm, setShowTplForm] = useState(false);
  const [editTpl, setEditTpl] = useState(null);

  return (
    <div>
      <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"nowrap",overflowX:"auto",borderBottom:`1px solid ${T.border}`,paddingBottom:8,WebkitOverflowScrolling:"touch"}}>
        {TABS_S04.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?"#EC4899":T.surface2,color:tab===t.id?"#fff":T.textMuted,border:`1px solid ${tab===t.id?"#EC4899":T.border}`,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:tab===t.id?700:400,fontSize:11}}>
            {t.l}
          </button>
        ))}
      </div>

      {tab==="dashboard" && (
        <div>
          {/* KPI DYNAMIQUES */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
            {[
              {l:"Campagnes totales",v:campagnes.length,c:"#EC4899",i:"📢",sub:`${campagnes.filter(c=>c.statut==="EN_COURS").length} en cours`},
              {l:"Contacts actifs",v:contacts.filter(c=>c.actif).length,c:"#3B82F6",i:"📋",sub:`${contacts.length} dans la base`},
              {l:"Budget alloué",v:(campagnes.reduce((a,c)=>a+(parseFloat(c.budget)||0),0)/1000).toFixed(0)+"K",c:"#C9A84C",i:"💰",sub:"FCFA campagnes"},
              {l:"Terminées",v:campagnes.filter(c=>c.statut==="TERMINE").length,c:"#22C55E",i:"✅",sub:`${campagnes.filter(c=>c.statut==="PLANIFIE").length} planifiées`},
            ].map(s=>(
              <div key={s.l} className="gc-hover-card" style={{background:T.surface2,border:`2px solid ${s.c}33`,borderRadius:12,padding:"14px 12px",cursor:"pointer"}} onClick={()=>setTab(s.l.includes("Contacts")?"contacts":"campagnes")}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:22}}>{s.i}</span><span style={{background:s.c+"22",color:s.c,borderRadius:5,padding:"2px 6px",fontSize:8,fontWeight:700}}>S04</span></div>
                <div style={{color:s.c,fontWeight:900,fontSize:22,lineHeight:1}}>{s.v}</div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:4,fontWeight:600}}>{s.l}</div>
                <div style={{color:T.textDim,fontSize:9,marginTop:2}}>{s.sub}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div style={{background:T.surface2,borderRadius:12,padding:14,border:"1px solid #EC489933"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <h4 style={{color:"#EC4899",margin:0,fontSize:12,fontWeight:800}}>📢 Campagnes récentes</h4>
                <button onClick={()=>setTab("campagnes")} style={{background:"#EC489922",border:"1px solid #EC489944",color:"#EC4899",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>Voir →</button>
              </div>
              {campagnes.length===0 ? <div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:16}}>Aucune campagne — <button onClick={()=>setTab("campagnes")} style={{background:"none",border:"none",color:"#EC4899",cursor:"pointer",fontWeight:700,fontSize:11}}>Créer →</button></div>
                : campagnes.slice(0,5).map(c=>(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}20`}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:STATUTS[c.statut]||"#888",flexShrink:0}}/>
                    <div style={{flex:1}}><div style={{color:T.text,fontSize:11,fontWeight:600}}>{c.titre}</div><div style={{color:T.textMuted,fontSize:9}}>{c.canal} · {c.type}</div></div>
                    <span style={{background:(STATUTS[c.statut]||"#888")+"22",color:STATUTS[c.statut]||"#888",borderRadius:4,padding:"1px 6px",fontSize:8,fontWeight:700}}>{c.statut}</span>
                  </div>
                ))
              }
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{background:T.surface2,borderRadius:12,padding:14,border:"1px solid #3B82F633",flex:1}}>
                <h4 style={{color:"#3B82F6",margin:"0 0 8px",fontSize:12,fontWeight:800}}>📡 Canaux</h4>
                {CANAUX.map(canal=>{ const cnt=campagnes.filter(c=>c.canal===canal).length; if(!cnt) return null;
                  return (<div key={canal} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <span style={{color:T.text,fontSize:10,minWidth:70,fontWeight:600}}>{canal}</span>
                    <div style={{flex:1,height:5,background:T.surface3,borderRadius:2,overflow:"hidden"}}><div style={{width:`${(cnt/Math.max(campagnes.length,1))*100}%`,height:"100%",background:"#EC4899",borderRadius:2}}/></div>
                    <span style={{color:"#EC4899",fontSize:10,fontWeight:700}}>{cnt}</span>
                  </div>);
                })}
                {campagnes.length===0&&<div style={{color:T.textMuted,fontSize:10,textAlign:"center",padding:8}}>Créez des campagnes</div>}
              </div>
              <div style={{background:T.surface2,borderRadius:10,padding:12,border:`1px solid ${T.border}`}}>
                <h4 style={{color:"#A855F7",margin:"0 0 8px",fontSize:12,fontWeight:800}}>⚡ Actions rapides</h4>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                  {[{l:"Campagne",a:"campagnes",i:"📢",c:"#EC4899"},{l:"Modèles",a:"templates",i:"✉️",c:"#8B5CF6"},{l:"Contacts",a:"contacts",i:"📋",c:"#3B82F6"},{l:"IA",a:"ia",i:"🤖",c:"#A855F7"}].map(a=>(
                    <button key={a.l} onClick={()=>setTab(a.a)} style={{background:a.c+"15",border:`1px solid ${a.c}33`,borderRadius:7,padding:"7px 6px",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:13}}>{a.i}</span><span style={{color:T.text,fontSize:10,fontWeight:600}}>{a.l}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab==="campagnes" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{color:"#EC4899",fontWeight:800,fontSize:13}}>📢 Gestion des Campagnes</span>
            <button onClick={()=>setShowNewCamp(!showNewCamp)} style={{background:"#EC4899",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Nouvelle</button>
          </div>
          {showNewCamp&&(
            <div style={{background:T.surface2,border:"1px solid #EC489944",borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div style={{gridColumn:"span 2"}}>
                  <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Titre *</label>
                  <input value={campForm.titre} onChange={e=>setCampForm(f=>({...f,titre:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}} placeholder="Nom de la campagne…"/>
                </div>
                {[["Type","type",TYPES_CAMP],["Canal","canal",CANAUX],["Statut","statut",Object.keys(STATUTS)]].map(([l,k,opts])=>(
                  <div key={k}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{l}</label>
                    <select value={campForm[k]} onChange={e=>setCampForm(p=>({...p,[k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                      {opts.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Budget (FCFA)</label>
                  <input type="number" value={campForm.budget} onChange={e=>setCampForm(f=>({...f,budget:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
                </div>
                <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Date début</label>
                  <input type="date" value={campForm.debut} onChange={e=>setCampForm(f=>({...f,debut:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
                </div>
                <div style={{gridColumn:"span 2"}}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Objectif / Cible</label>
                  <input value={campForm.objectif} onChange={e=>setCampForm(f=>({...f,objectif:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}} placeholder="Objectif & public cible…"/>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addCampagne} style={{background:"#EC4899",border:"none",color:"#fff",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Enregistrer</button>
                <button onClick={()=>setShowNewCamp(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          {/* ── Filtres Campagnes ── */}
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <input value={commSearch} onChange={e=>setCommSearch(e.target.value)} placeholder="🔍 Titre, canal, cible…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <select value={commCanalFilter} onChange={e=>setCommCanalFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">📡 Tous canaux</option>
              {["EMAIL","SMS","WHATSAPP","LINKEDIN","POSTAL","REUNIONS"].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <select value={commStatusFilter} onChange={e=>setCommStatusFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="ALL">🔍 Tous statuts</option>
              {["BROUILLON","PLANIFIE","EN_COURS","ENVOYE","CLOS"].map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
            </select>
            <select value={commSort} onChange={e=>setCommSort(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
              <option value="date_desc">↓ Plus récents</option>
              <option value="date_asc">↑ Plus anciens</option>
              <option value="titre">A→Z Titre</option>
            </select>
            <span style={{color:T.textDim,fontSize:10}}>{campagnes.filter(c=>{const q=commSearch.toLowerCase();return(!q||(c.titre||"").toLowerCase().includes(q)||(c.canal||"").toLowerCase().includes(q))&&(commCanalFilter==="ALL"||c.canal===commCanalFilter)&&(commStatusFilter==="ALL"||c.statut===commStatusFilter);}).length}/{campagnes.length}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {campagnes.filter(c=>{
              const q=commSearch.toLowerCase();
              return(!q||(c.titre||"").toLowerCase().includes(q)||(c.canal||"").toLowerCase().includes(q)||(c.cible||"").toLowerCase().includes(q))
                &&(commCanalFilter==="ALL"||c.canal===commCanalFilter)
                &&(commStatusFilter==="ALL"||c.statut===commStatusFilter);
            }).sort((a,b)=>commSort==="date_asc"?(a.createdAt||"").localeCompare(b.createdAt||""):commSort==="titre"?(a.titre||"").localeCompare(b.titre||""): (b.createdAt||"").localeCompare(a.createdAt||"")).map(c=>(
              <div key={c.id} style={{background:T.surface2,border:`1px solid ${(STATUTS[c.statut]||"#888")}33`,borderRadius:10,padding:"11px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:9,height:9,borderRadius:"50%",background:STATUTS[c.statut]||"#888",flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{c.titre}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>{c.canal} · {c.type}{c.budget?` · ${Number(c.budget).toLocaleString("fr-FR")} FCFA`:""}</div>
                    {c.objectif&&<div style={{color:T.textDim,fontSize:9,fontStyle:"italic"}}>{c.objectif}</div>}
                  </div>
                  <span style={{background:(STATUTS[c.statut]||"#888")+"22",color:STATUTS[c.statut]||"#888",borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700}}>{c.statut}</span>
                  <button onClick={()=>gcDeleteFromList("gc-comm-campagnes",c.id,setCampagnes)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:11,padding:"0 4px"}}>✕</button>
                </div>
              </div>
            ))}
            {campagnes.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:28,fontSize:12}}>Aucune campagne — créez la première</div>}
          </div>
        </div>
      )}

      {tab==="templates" && (
        <div>
          {/* Bannière */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{color:"#EC4899",fontWeight:800,fontSize:13}}>✉️ Bibliothèque de Modèles</div>
              <div style={{color:T.textDim,fontSize:10}}>Modèles pré-définis + vos modèles personnalisés</div>
            </div>
            <button onClick={()=>{setShowTplForm(!showTplForm);setEditTpl(null);setTplForm({titre:"",type:"OFFRE",canal:"EMAIL",sujet:"",corps:"",tags:""});}}
              style={{background:"#EC4899",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
              ➕ Créer un modèle
            </button>
          </div>

          {/* Formulaire création/édition modèle */}
          {(showTplForm||editTpl)&&(
            <div style={{background:T.surface2,border:`2px solid ${editTpl?"#C9A84C44":"#EC489944"}`,borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{color:editTpl?"#C9A84C":"#EC4899",fontWeight:700,fontSize:12,marginBottom:12}}>{editTpl?"✏️ Modifier le modèle":"➕ Nouveau modèle personnalisé"}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                <div style={{gridColumn:"span 3"}}>
                  <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Titre du modèle *</label>
                  <input value={tplForm.titre} onChange={e=>setTplForm(f=>({...f,titre:e.target.value}))} placeholder="Ex: Offre de services juridiques" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
                </div>
                {[{l:"Type",k:"type",opts:["OFFRE","RELANCE","REMERCIEMENT","NEWSLETTER","COMMUNIQUÉ","BRANDING","CONTRAT","INVITATION","AUTRE"]},{l:"Canal",k:"canal",opts:CANAUX}].map(f=>(
                  <div key={f.k}>
                    <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                    <select value={tplForm[f.k]} onChange={e=>setTplForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                      {f.opts.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Sujet / Objet</label>
                  <input value={tplForm.sujet} onChange={e=>setTplForm(f=>({...f,sujet:e.target.value}))} placeholder="Objet email…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>
                </div>
                <div style={{gridColumn:"span 3"}}>
                  <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Corps du modèle * <span style={{textTransform:"none",fontWeight:400,color:"#A855F7"}}>(variables : {"{nom_client}"}, {"{date}"}, {"{signature}"})</span></label>
                  <textarea value={tplForm.corps} onChange={e=>setTplForm(f=>({...f,corps:e.target.value}))}
                    placeholder={"Madame, Monsieur,\n\nNous avons l'honneur de vous présenter…\n\nCordialement,\n{signature}"}
                    style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,minHeight:160,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
                </div>
                <div style={{gridColumn:"span 3"}}>
                  <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Tags (séparés par virgule)</label>
                  <input value={tplForm.tags} onChange={e=>setTplForm(f=>({...f,tags:e.target.value}))} placeholder="juridique, OHADA, audit…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{
                  if(!tplForm.titre||!tplForm.corps){gcAlert("Titre et corps requis.");return;}
                  if(editTpl){
                    const updated=customTemplates.map(t=>t.id===editTpl?{...t,...tplForm,updatedAt:new Date().toISOString()}:t);
                    saveTemplates(updated);setEditTpl(null);
                  } else {
                    saveTemplates([...customTemplates,{id:"TPL-"+Date.now(),...tplForm,createdBy:currentUser?.name,createdAt:new Date().toISOString()}]);
                  }
                  setShowTplForm(false);setTplForm({titre:"",type:"OFFRE",canal:"EMAIL",sujet:"",corps:"",tags:""});
                  gcAlert("✅ Modèle enregistré.");
                }} style={{background:"#EC4899",border:"none",color:"#fff",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ {editTpl?"Mettre à jour":"Enregistrer"}</button>
                <button onClick={()=>{setShowTplForm(false);setEditTpl(null);}} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}

          {/* Modèles standards */}
          <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:8,letterSpacing:1}}>📦 Modèles standards Génie Consultant</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(195px,1fr))",gap:10,marginBottom:16}}>
            {TEMPLATES_S04.map(t=>(
              <div key={t.id} style={{background:T.surface2,border:`2px solid ${t.color}33`,borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:24,marginBottom:6}}>{t.icon}</div>
                <div style={{color:T.text,fontWeight:800,fontSize:12,marginBottom:2}}>{t.label}</div>
                <div style={{color:T.textDim,fontSize:9,marginBottom:12,lineHeight:1.4}}>{t.desc}</div>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={()=>genTemplate(t.id)} style={{flex:1,background:t.color+"22",border:`1px solid ${t.color}44`,color:t.color,borderRadius:7,padding:"5px 8px",cursor:"pointer",fontWeight:700,fontSize:10}}>✏️ Utiliser</button>
                  {["linkedin","communique","offre","newsletter"].includes(t.id)&&(
                    <button onClick={()=>{generateContent(t.id);setTab("ia");}} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:7,padding:"5px 8px",cursor:"pointer",fontSize:10}} title="Générer avec IA">🤖</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Modèles personnalisés */}
          {customTemplates.length>0&&<>
            <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:8,letterSpacing:1}}>✨ Vos modèles personnalisés ({customTemplates.length})</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
              {customTemplates.map(t=>(
                <div key={t.id} style={{background:T.surface2,border:`2px solid #EC489933`,borderRadius:12,padding:"14px 16px",position:"relative"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div>
                      <div style={{color:T.text,fontWeight:800,fontSize:12}}>{t.titre}</div>
                      <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap"}}>
                        <span style={{background:"#EC489922",color:"#EC4899",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700}}>{t.type}</span>
                        <span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700}}>{t.canal}</span>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>{setEditTpl(t.id);setTplForm({titre:t.titre,type:t.type,canal:t.canal,sujet:t.sujet||"",corps:t.corps,tags:t.tags||""});setShowTplForm(false);}} style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:4,padding:"3px 7px",cursor:"pointer",fontSize:9,fontWeight:700}}>✏️</button>
                      <button onClick={async () => {if(await gcConfirm(`Supprimer "${t.titre}" ?`)){gcDeleteFromList("gc-comm-custom-tpl",t.id,setCustomTemplates);}}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"3px 7px",cursor:"pointer",fontSize:9,fontWeight:700}}>🗑️</button>
                    </div>
                  </div>
                  {t.sujet&&<div style={{color:T.textMuted,fontSize:10,marginBottom:4}}>Objet : {t.sujet}</div>}
                  <div style={{color:T.textDim,fontSize:10,lineHeight:1.5,maxHeight:60,overflow:"hidden",borderTop:`1px solid ${T.border}22`,paddingTop:6,marginTop:4,fontStyle:"italic"}}>{t.corps?.slice(0,180)}…</div>
                  {t.tags&&<div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>{t.tags.split(",").map(tag=>tag.trim()).filter(Boolean).map(tag=><span key={tag} style={{background:"#A855F722",color:"#A855F7",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:600}}>{tag}</span>)}</div>}
                  <button onClick={()=>{setCustomMsg({sujet:t.sujet||t.titre,corps:t.corps.replace("{signature}",currentUser?.name||"Génie Consultant").replace("{date}",new Date().toLocaleDateString("fr-FR")),dest:""});setTab("rediger");}}
                    style={{marginTop:10,width:"100%",background:"#EC489922",border:"1px solid #EC489944",color:"#EC4899",borderRadius:7,padding:"5px 8px",cursor:"pointer",fontWeight:700,fontSize:10}}>
                    ✏️ Utiliser ce modèle
                  </button>
                </div>
              ))}
            </div>
          </>}
          {customTemplates.length===0&&<div style={{textAlign:"center",color:T.textDim,padding:24,background:T.surface2,borderRadius:10,border:`1px dashed ${T.border}`}}>
            Aucun modèle personnalisé — cliquez <strong style={{color:"#EC4899"}}>➕ Créer un modèle</strong> pour commencer.
          </div>}
        </div>
      )}

      {/* ══ ONGLET FICHES PROSPECTION ══════════════════════════════════════ */}
      {tab==="prospection" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{color:"#F97316",fontWeight:800,fontSize:13}}>🎯 Fiches de Prospection</div>
              <div style={{color:T.textDim,fontSize:10}}>Suivi commercial — Prospects · Relances · Pipeline</div>
            </div>
            <button onClick={()=>{setShowFicheForm(!showFicheForm);setEditFiche(null);setFicheForm({prospect:"",secteur:"",contact:"",telephone:"",email:"",besoins:"",offre:"",priorite:"NORMALE",statut:"NOUVEAU",notes:"",dateRelance:""});}}
              style={{background:"#F97316",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
              ➕ Nouvelle fiche
            </button>
          </div>

          {/* Formulaire fiche */}
          {(showFicheForm||editFiche)&&(
            <div style={{background:T.surface2,border:`2px solid ${editFiche?"#C9A84C44":"#F9731644"}`,borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{color:editFiche?"#C9A84C":"#F97316",fontWeight:700,fontSize:12,marginBottom:12}}>{editFiche?"✏️ Modifier la fiche":"➕ Nouvelle fiche de prospection"}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[{l:"Nom du prospect / Entreprise *",k:"prospect",ph:"Ex: Cabinet AMARI SA",span:3},{l:"Secteur d'activité",k:"secteur",ph:"Ex: BTP, Finance, Santé…",span:1},{l:"Contact (nom complet)",k:"contact",ph:"Nom prénom",span:1},{l:"Téléphone",k:"telephone",ph:"+241…",span:1},{l:"Email",k:"email",ph:"contact@…",span:1},{l:"Besoins identifiés",k:"besoins",ph:"Problèmes ou besoins détectés chez ce prospect…",span:2},{l:"Offre proposée",k:"offre",ph:"Service ou produit à présenter : Audit, Juridique, Fiscalité…",span:3},{l:"Notes terrain",k:"notes",ph:"Observations terrain, historique des échanges…",span:2},{l:"Date de relance",k:"dateRelance",ph:"",span:1,type:"date"}].map(f=>(
                  <div key={f.k} style={{gridColumn:`span ${f.span}`}}>
                    <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                    {f.span>=2&&f.k!=="dateRelance"?
                      <textarea value={ficheForm[f.k]} onChange={e=>setFicheForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
                    :
                      <input type={f.type||"text"} value={ficheForm[f.k]} onChange={e=>setFicheForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>
                    }
                  </div>
                ))}
                {[{l:"Priorité",k:"priorite",opts:["HAUTE","NORMALE","BASSE"]},{l:"Statut",k:"statut",opts:["NOUVEAU","CONTACTÉ","RDV_PLANIFIÉ","OFFRE_ENVOYÉE","EN_NÉGOCIATION","GAGNÉ","PERDU","EN_ATTENTE"]}].map(f=>(
                  <div key={f.k}>
                    <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                    <select value={ficheForm[f.k]} onChange={e=>setFicheForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                      {f.opts.map(o=><option key={o} value={o}>{o.replace(/_/g," ")}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button onClick={()=>{
                  if(!ficheForm.prospect){gcAlert("Nom du prospect requis.");return;}
                  if(editFiche){
                    const u=fiches.map(f=>f.id===editFiche?{...f,...ficheForm,updatedAt:new Date().toISOString(),updatedBy:currentUser?.name}:f);
                    saveFiches(u);setEditFiche(null);
                  } else {
                    const dupl=fiches.find(f=>f.prospect.toLowerCase()===ficheForm.prospect.toLowerCase());
                    if(dupl){gcAlert(`⚠️ Une fiche existe déjà pour "${ficheForm.prospect}". Utilisez l'édition.`);return;}
                    saveFiches([{id:"FP-"+Date.now(),...ficheForm,createdBy:currentUser?.name,createdAt:new Date().toISOString()},...fiches]);
                  }
                  setShowFicheForm(false);setFicheForm({prospect:"",secteur:"",contact:"",telephone:"",email:"",besoins:"",offre:"",priorite:"NORMALE",statut:"NOUVEAU",notes:"",dateRelance:""});
                  setNotifications?.(p=>[{id:"N"+Date.now(),icon:"🎯",message:`Fiche prospect ${ficheForm.prospect} enregistrée`,at:new Date().toISOString(),read:false},...p]);
                }} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:7,padding:"8px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ {editFiche?"Mettre à jour":"Enregistrer"}</button>
                <button onClick={()=>{setShowFicheForm(false);setEditFiche(null);}} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}

          {/* Pipeline KPI */}
          {fiches.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8,marginBottom:14}}>
              {[
                {l:"Total",v:fiches.length,c:"#F97316"},
                {l:"RDV planifiés",v:fiches.filter(f=>f.statut==="RDV_PLANIFIÉ").length,c:"#3B82F6"},
                {l:"Offres envoyées",v:fiches.filter(f=>f.statut==="OFFRE_ENVOYÉE").length,c:"#A855F7"},
                {l:"Négociation",v:fiches.filter(f=>f.statut==="EN_NÉGOCIATION").length,c:"#F59E0B"},
                {l:"Gagnés ✅",v:fiches.filter(f=>f.statut==="GAGNÉ").length,c:"#22C55E"},
                {l:"Perdus",v:fiches.filter(f=>f.statut==="PERDU").length,c:"#EF4444"},
              ].map(s=>(
                <div key={s.l} style={{background:T.surface2,border:`2px solid ${s.c}33`,borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
                  <div style={{color:s.c,fontWeight:900,fontSize:22,lineHeight:1}}>{s.v}</div>
                  <div style={{color:T.textMuted,fontSize:9,marginTop:3,fontWeight:600}}>{s.l}</div>
                </div>
              ))}
            </div>
          )}

          {/* Liste des fiches */}
          {fiches.length===0?<div style={{textAlign:"center",color:T.textDim,padding:28,background:T.surface2,borderRadius:10,border:`1px dashed ${T.border}`}}>Aucune fiche de prospection — cliquez <strong style={{color:"#F97316"}}>➕ Nouvelle fiche</strong></div>:(
            <>
            {/* ── Filtres Fiches Prospects ── */}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
              <input value={ficheSearch} onChange={e=>setFicheSearch(e.target.value)} placeholder="🔍 Prospect, contact, secteur…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
              <select value={ficheSecteurFilter} onChange={e=>setFicheSecteurFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
                <option value="ALL">🏢 Tous secteurs</option>
                {[...new Set(fiches.map(f=>f.secteur).filter(Boolean))].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <span style={{color:T.textDim,fontSize:10}}>{fiches.filter(f=>{const q=ficheSearch.toLowerCase();return(!q||(f.prospect||"").toLowerCase().includes(q)||(f.contact||"").toLowerCase().includes(q)||(f.secteur||"").toLowerCase().includes(q))&&(ficheSecteurFilter==="ALL"||f.secteur===ficheSecteurFilter);}).length}/{fiches.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {fiches.filter(f=>{
                const q=ficheSearch.toLowerCase();
                return(!q||(f.prospect||"").toLowerCase().includes(q)||(f.contact||"").toLowerCase().includes(q)||(f.secteur||"").toLowerCase().includes(q))
                  &&(ficheSecteurFilter==="ALL"||f.secteur===ficheSecteurFilter);
              }).map(f=>{
                const STAT_COLORS={"NOUVEAU":"#3B82F6","CONTACTÉ":"#A855F7","RDV_PLANIFIÉ":"#06B6D4","OFFRE_ENVOYÉE":"#F59E0B","EN_NÉGOCIATION":"#EC4899","GAGNÉ":"#22C55E","PERDU":"#EF4444","EN_ATTENTE":"#7A90B0"};
                const PRIO_C={HAUTE:"#EF4444",NORMALE:"#3B82F6",BASSE:"#7A90B0"};
                const sc=STAT_COLORS[f.statut]||"#888";
                const isRelance=f.dateRelance&&f.dateRelance<new Date().toISOString().split("T")[0];
                return (
                  <div key={f.id} style={{background:T.surface2,border:`1px solid ${sc}33`,borderRadius:12,padding:"12px 16px",position:"relative"}}>
                    {isRelance&&<div style={{position:"absolute",top:8,right:60,background:"#F59E0B",color:"#000",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>⏰ Relance</div>}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                          <span style={{color:T.text,fontWeight:800,fontSize:13}}>{f.prospect}</span>
                          <span style={{background:PRIO_C[f.priorite]+"22",color:PRIO_C[f.priorite],borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700}}>{f.priorite}</span>
                          <span style={{background:sc+"22",color:sc,borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700}}>{f.statut.replace(/_/g," ")}</span>
                          {f.secteur&&<span style={{color:T.textDim,fontSize:9}}>📂 {f.secteur}</span>}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          {f.contact&&<div style={{color:T.textMuted,fontSize:10}}>👤 {f.contact}{f.telephone?` · ${f.telephone}`:""}</div>}
                          {f.email&&<div style={{color:T.textMuted,fontSize:10}}>✉ {f.email}</div>}
                          {f.besoins&&<div style={{color:T.text,fontSize:10,gridColumn:"span 2"}}><strong>Besoins :</strong> {f.besoins?.slice(0,100)}</div>}
                          {f.offre&&<div style={{color:"#F97316",fontSize:10,gridColumn:"span 2"}}><strong>Offre :</strong> {f.offre?.slice(0,100)}</div>}
                          {f.dateRelance&&<div style={{color:isRelance?"#F59E0B":T.textDim,fontSize:9}}>📅 Relance : {f.dateRelance}</div>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:5,flexShrink:0}}>
                        <button onClick={()=>{setEditFiche(f.id);setFicheForm({prospect:f.prospect,secteur:f.secteur||"",contact:f.contact||"",telephone:f.telephone||"",email:f.email||"",besoins:f.besoins||"",offre:f.offre||"",priorite:f.priorite||"NORMALE",statut:f.statut||"NOUVEAU",notes:f.notes||"",dateRelance:f.dateRelance||""});setShowFicheForm(false);}} style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>✏️</button>
                        <button onClick={async () => {if(await gcConfirm(`Supprimer la fiche "${f.prospect}" ?`)){gcDeleteFromList("gc-comm-fiches",f.id,setFiches);}}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>🗑️</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      )}

      {tab==="contacts" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{color:"#3B82F6",fontWeight:800,fontSize:13}}>📋 Carnet Médias & Partenaires</span>
            <button onClick={()=>setShowNewCont(!showNewCont)} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Ajouter</button>
          </div>
          {showNewCont&&(
            <div style={{background:T.surface2,border:"1px solid #3B82F644",borderRadius:10,padding:14,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                {[{l:"Nom *",k:"nom",ph:"Nom du contact"},{l:"Email",k:"email",ph:"email@ex.ga"},{l:"Téléphone",k:"telephone",ph:"+241 xx"},{l:"Organisation",k:"organisation",ph:"Organisation"}].map(f=>(
                  <div key={f.k}><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                    <input value={contForm[f.k]||""} onChange={e=>setContForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>
                  </div>
                ))}
                <div><label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>Type</label>
                  <select value={contForm.type} onChange={e=>setContForm(p=>({...p,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
                    {TYPES_CONTACT.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={addContact} style={{background:"#3B82F6",border:"none",color:"#fff",borderRadius:7,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Enregistrer</button>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:8}}>
            {contacts.map(c=>(
              <div key={c.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 13px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{c.nom}</div>
                    <div style={{display:"flex",gap:5,alignItems:"center",marginTop:2}}>
                      <span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{c.type}</span>
                      {c.organisation&&<span style={{color:T.textMuted,fontSize:9}}>{c.organisation}</span>}
                    </div>
                  </div>
                  <button onClick={()=>{const u=contacts.map(x=>x.id===c.id?{...x,actif:!x.actif}:x);setContacts(u);saveData("gc-comm-contacts",u);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:13}}>{c.actif?"✅":"⭕"}</button>
                </div>
                {c.email&&<div style={{color:T.textMuted,fontSize:10,marginTop:5}}>✉ {c.email}</div>}
                {c.telephone&&<div style={{color:T.textMuted,fontSize:10}}>📞 {c.telephone}</div>}
                <div style={{marginTop:8,display:"flex",gap:5}}>
                  {c.email&&<a href={`mailto:${c.email}`} style={{flex:1,background:"#EC489920",border:"1px solid #EC489940",color:"#EC4899",borderRadius:6,padding:"4px",cursor:"pointer",fontWeight:700,fontSize:9,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>✉️ Écrire</a>}
                  <button onClick={()=>gcDeleteFromList("gc-comm-contacts",c.id,setContacts)} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:9}}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==="rediger" && (
        <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:680}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{color:T.textMuted,fontSize:11,fontWeight:700,textTransform:"uppercase"}}>Éditeur de Communication S04</span>
            {aiGen.result&&<span style={{background:"#A855F722",color:"#A855F7",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>🤖 IA · {aiGen.type}</span>}
          </div>
          <input value={customMsg.sujet} onChange={e=>setCustomMsg(c=>({...c,sujet:e.target.value}))} placeholder="Objet / Titre" style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontWeight:700,fontSize:13}}/>
          <input value={customMsg.dest} onChange={e=>setCustomMsg(c=>({...c,dest:e.target.value}))} placeholder="Destinataire(s)" style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}/>
          <textarea value={customMsg.corps} onChange={e=>setCustomMsg(c=>({...c,corps:e.target.value}))} rows={16} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px",color:T.text,fontSize:12,fontFamily:"'Courier New',monospace",lineHeight:1.7,resize:"vertical"}}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>{const b=new Blob([customMsg.corps],{type:"text/plain;charset=utf-8;"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`${customMsg.sujet||"communication"}.txt`;a.click();URL.revokeObjectURL(u);}} style={{flex:1,background:"#EC4899",border:"none",color:"#fff",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:12,minWidth:90}}>⬇️ Exporter</button>
            <button onClick={()=>navigator.clipboard?.writeText(customMsg.corps)} style={{background:"#EC489922",border:"1px solid #EC489944",color:"#EC4899",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>📋 Copier</button>
            <button onClick={()=>setCustomMsg({sujet:"",corps:"",dest:""})} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 12px",cursor:"pointer",fontSize:12}}>🗑️</button>
          </div>
        </div>
      )}

      {tab==="ia" && (
        <div>
          <div style={{background:"#A855F712",border:"1px solid #A855F733",borderRadius:10,padding:"9px 13px",marginBottom:14,fontSize:11,color:T.textMuted}}>
            🤖 <strong>Génération IA</strong> — Contenus professionnels générés par Claude. Le résultat apparaît ci-dessous et s'ouvre dans l'éditeur.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(195px,1fr))",gap:10,marginBottom:16}}>
            {[{id:"linkedin",l:"Post LinkedIn",i:"💼",c:"#0077B5"},{id:"communique",l:"Communiqué presse",i:"📰",c:"#8B5CF6"},{id:"offre",l:"Lettre offre services",i:"📄",c:"#EC4899"},{id:"newsletter",l:"Newsletter",i:"📧",c:"#06B6D4"}].map(item=>(
              <button key={item.id} onClick={()=>generateContent(item.id)} disabled={aiGen.loading}
                style={{background:T.surface2,border:`2px solid ${item.c}33`,borderRadius:12,padding:"14px",cursor:aiGen.loading?"not-allowed":"pointer",textAlign:"left",opacity:aiGen.loading?0.7:1}}>
                <div style={{fontSize:26,marginBottom:6}}>{item.i}</div>
                <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:3}}>{item.l}</div>
                <div style={{background:item.c+"22",color:item.c,borderRadius:6,padding:"4px 8px",display:"inline-flex",alignItems:"center",gap:5,fontSize:10,fontWeight:700}}>
                  {aiGen.loading&&aiGen.type===item.id?"⏳ Génération…":"🤖 Générer"}
                </div>
              </button>
            ))}
          </div>
          {aiGen.result&&(
            <div style={{background:T.surface2,border:"1px solid #A855F744",borderRadius:10,padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{color:"#A855F7",fontWeight:700,fontSize:12}}>✅ Généré — {aiGen.type}</span>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setTab("rediger")} style={{background:"#EC4899",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✏️ Ouvrir éditeur</button>
                  <button onClick={()=>navigator.clipboard?.writeText(aiGen.result)} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:10}}>📋</button>
                </div>
              </div>
              <pre style={{color:T.text,fontSize:11,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"inherit",margin:0}}>{aiGen.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


