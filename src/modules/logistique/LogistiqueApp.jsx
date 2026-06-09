import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// LogistiqueApp.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, playSound, formatCFA, dsSave, dsDeleteItemFromArray } from '../../core/index.js';
import { useRemoteSync } from '../../hooks/useSyncedState.js';
import { INITIAL_ACHATS, INITIAL_STOCKS } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function LogistiqueModule({ T, currentUser, users=[], setNotifications=_noop, isDemoMode=false, dossiers=[], taches=[], setTaches=_noop, partners=[] }){
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const lvl = currentUser.level;
  const canApprove = lvl >= 3;
  const [tab, setTab] = useState("achats");
  const [logSearch, setLogSearch] = useState("");
  const [logCatFilter, setLogCatFilter] = useState("ALL");
  const [logStatutFilter, setLogStatutFilter] = useState("ALL");
  const [logSort, setLogSort] = useState("date_desc");
  const [actifSearch, setActifSearch] = useState("");
  const [actifCatFilter, setActifCatFilter] = useState("ALL");
  const [stockSearch, setStockSearch] = useState("");
  const [stockCatFilter, setStockCatFilter] = useState("ALL");
  const [achats, setAchats] = useState(() => { try { return JSON.parse(_lsGet("gc-achats")||"null") || INITIAL_ACHATS; } catch (_) { return INITIAL_ACHATS; } });
  const [stocks, setStocks] = useState(() => { try { return JSON.parse(_lsGet("gc-logmod-stocks")||"null") || INITIAL_STOCKS; } catch (_) { return INITIAL_STOCKS; } });
  const [showNewAchat, setShowNewAchat] = useState(false);
  const [achatForm, setAchatForm] = useState({ objet:"", montant:"", fournisseur:"", processus:"S05", priority:"NORMALE", notes:"" });

  const saveAchats = v => {
    setAchats(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if(!isDemoMode) try { _lsSet("gc-achats", JSON.stringify(resolved)); dsSave('gc-achats', resolved).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return resolved;
    });
  };
  const saveStocks = v => {
    setStocks(prev => {
      const resolved = typeof v === 'function' ? v(prev) : v;
      if(!isDemoMode) try { _lsSet("gc-logmod-stocks", JSON.stringify(resolved)); dsSave('gc-logmod-stocks', resolved).catch(err => gcToast.syncError('', err)); } catch (_) {}
      return resolved;
    });
  };

  const handleAchatAction = (id, action) => {
    saveAchats(prev => prev.map(a => a.id===id ? {...a, statut:action==="approve"?"APPROUVE":"REFUSE", dateValidation:new Date().toISOString().split("T")[0], validePar:currentUser.id} : a));
    const a = achats.find(x=>x.id===id);
    setNotifications(prev => [{id:"N"+Date.now(),icon:action==="approve"?"✅":"❌",message:`Achat "${a?.objet}" ${action==="approve"?"approuvé":"refusé"}`,at:new Date().toISOString(),read:false},...prev]);
  };

  // ── Inventaires des actifs ──────────────────────────────────────────────
  const [inventaires, setInventaires] = useState(()=>{try{return JSON.parse(_lsGet("gc-inventaires")||"[]");}catch(_){return [];}});
  const saveInventaires = v=>{setInventaires(v);try{_lsSet("gc-inventaires",JSON.stringify(v)); dsSave("gc-inventaires",v).catch(err => gcToast.syncError('', err));}catch(_){}};
  const [inventaireEnCours, setInventaireEnCours] = useState(()=>{try{return JSON.parse(_lsGet("gc-inventaire-en-cours")||"null");}catch(_){return null;}});
  const saveInventaireEnCours = v=>{setInventaireEnCours(v);try{_lsSet("gc-inventaire-en-cours",v?JSON.stringify(v):"null"); dsSave("gc-inventaire-en-cours",v||null).catch(()=>{});}catch(_){}};
  // ── État hoissé pour tab actifs (ex-IIFE — Rules of Hooks) ──────────────
  const [actifs, setActifs] = useState(()=>{try{return JSON.parse(_lsGet("gc-logistique-actifs")||"[]");}catch(_){return [];}});
  const [showActifForm, setShowActifForm] = useState(false);
  const [actifForm, setActifForm] = useState({nom:"",categorie:"INFORMATIQUE",marque:"",modele:"",serie:"",valeur:"",dateAchat:"",affectation:"",etat:"BON",localisation:"Siège",notes:""});
  const [editActif, setEditActif] = useState(null);
  const saveActifs = v=>{setActifs(v);try{_lsSet("gc-logistique-actifs",JSON.stringify(v)); dsSave("gc-logistique-actifs",v).catch(err => gcToast.syncError('', err));}catch(_){}};

  useRemoteSync({'gc-achats': setAchats, 'gc-logmod-stocks': setStocks, 'gc-inventaires': setInventaires, 'gc-logistique-actifs': setActifs});

  // ── État hoissé pour tab inventaires (ex-IIFE — Rules of Hooks) ──────────
  const [invActifs, setInvActifsState] = useState(()=>{try{return JSON.parse(_lsGet("gc-logistique-actifs")||"[]");}catch(_){return [];}});
  const [invForm, setInvForm] = useState({titre:"",responsable:currentUser.name,date:new Date().toISOString().split("T")[0],type:"COMPLET",notes:""});
  const [showInvForm, setShowInvForm] = useState(false);
  const [selectedInv, setSelectedInv] = useState(null);
  const [invLignes, setInvLignes] = useState({});
  const saveInvLignes = (invId,l)=>{setInvLignes(prev=>({...prev,[invId]:l}));try{_lsSet(`gc-inventaire-lignes-${invId}`,JSON.stringify(l));}catch(_){}};
  const loadInvLignes = (invId)=>{try{return JSON.parse(_lsGet(`gc-inventaire-lignes-${invId}`)||"null")||invActifs.map(a=>({actifId:a.id,nom:a.nom,serie:a.serie||"",constate:false,etatConstate:"BON",observation:""}));}catch(_){return [];}};

  const handleAddAchat = () => {
    if (!achatForm.objet || !achatForm.montant) { gcAlert("Objet et montant requis."); return; }
    const n = { ...achatForm, id:`ACH-${Date.now()}`, demandeurId:currentUser.id, montant:parseFloat(achatForm.montant)||0, statut:"EN_ATTENTE_APPROBATION", dateCreation:new Date().toISOString().split("T")[0], dateValidation:null, livraison:null };
    saveAchats(prev => [...prev, n]);
    setNotifications(prev => [{id:"N"+Date.now(),icon:"🛒",message:`Demande d'achat soumise : ${n.objet} — ${n.montant.toLocaleString("fr-FR")} FCFA`,at:new Date().toISOString(),read:false,module:"logistique"},...prev]);
    setAchatForm({objet:"",montant:"",fournisseur:"",processus:"S05",priority:"NORMALE",notes:""});
    setShowNewAchat(false);
    playSound("success");
  };

  const stocksEnAlerte = stocks.filter(s => s.quantite <= s.alerteSeuil);
  const STATUT_ACHAT = { EN_ATTENTE_APPROBATION:{c:"#F59E0B",l:"En attente"}, APPROUVE:{c:"#22C55E",l:"Approuvé"}, REFUSE:{c:"#EF4444",l:"Refusé"}, LIVRE:{c:"#3B82F6",l:"Livré"} };

  const TABS = [
    {id:"achats",l:"🛒 Achats"},
    {id:"stocks",l:`📦 Stocks${stocksEnAlerte.length>0?" ⚠️":""}`},
    ...(lvl>=3?[{id:"actifs",l:"🏗️ Actifs"}]:[]),
    ...(lvl>=3?[{id:"inventaires",l:`📋 Inventaires${inventaireEnCours?" 🔄":""}`}]:[]),
  ];

  return (
    <div className="gc-fade-in">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#F97316,#EA580C)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🚚</div>
        <div>
          <div style={{color:T.text,fontWeight:900,fontSize:15}}>Logistique & Moyens Généraux</div>
          <div style={{color:T.textMuted,fontSize:11}}>Processus S05 · Achats · Stocks · Actifs · Fournisseurs</div>
        </div>
        {stocksEnAlerte.length>0 && <div style={{marginLeft:"auto",background:"#EF444422",border:"1px solid #EF444444",borderRadius:8,padding:"6px 12px",color:"#EF4444",fontSize:11,fontWeight:700}}>⚠️ {stocksEnAlerte.length} rupture(s) de stock</div>}
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16,borderBottom:`1px solid ${T.border}`,paddingBottom:8,overflowX:"auto",flexWrap:"nowrap",WebkitOverflowScrolling:"touch"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?"#F97316":T.surface2,color:tab===t.id?"#fff":T.textMuted,border:`1px solid ${tab===t.id?"#F97316":T.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:tab===t.id?800:400,fontSize:11}}>{t.l}</button>
        ))}
      </div>

      {/* ── ACHATS ── */}
      {tab==="achats" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h4 style={{color:"#F97316",margin:0,fontSize:13,fontWeight:800}}>🛒 Demandes d'Achat</h4>
            <button onClick={()=>setShowNewAchat(!showNewAchat)} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nouvelle demande</button>
          </div>
          {showNewAchat && (
            <div style={{background:T.surface2,border:"1px solid #F9731644",borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <InputField label="Objet *" value={achatForm.objet} onChange={e=>setAchatForm(f=>({...f,objet:e.target.value}))} T={T} />
                <InputField label="Montant (FCFA) *" type="number" value={achatForm.montant} onChange={e=>setAchatForm(f=>({...f,montant:e.target.value}))} T={T} />
                <InputField label="Fournisseur" value={achatForm.fournisseur} onChange={e=>setAchatForm(f=>({...f,fournisseur:e.target.value}))} T={T} />
                <div>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Priorité</label>
                  <select value={achatForm.priority} onChange={e=>setAchatForm(f=>({...f,priority:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                    {["URGENTE","HAUTE","NORMALE","FAIBLE"].map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{gridColumn:"span 2"}}>
                  <label style={{color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Notes</label>
                  <textarea value={achatForm.notes} onChange={e=>setAchatForm(f=>({...f,notes:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}} />
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={handleAddAchat} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>✅ Soumettre</button>
                <button onClick={()=>setShowNewAchat(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          )}
          {achats.sort((a,b)=>b.dateCreation?.localeCompare(a.dateCreation||"")||0).map(a=>{
            const sc=STATUT_ACHAT[a.statut]||{c:"#888",l:a.statut};
            const demandeur=users.find(u=>u.id===a.demandeurId);
            return (
              <div key={a.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:3}}>
                    <span style={{color:T.text,fontWeight:700,fontSize:12}}>{a.objet}</span>
                    <span style={{background:sc.c+"22",color:sc.c,border:`1px solid ${sc.c}44`,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>{sc.l}</span>
                    {a.priority==="URGENTE"&&<span style={{background:"#EF444422",color:"#EF4444",borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>🚨 URGENT</span>}
                  </div>
                  <div style={{color:T.textMuted,fontSize:10}}>{a.fournisseur||"—"} · {formatCFA(a.montant)} · {demandeur?.name||a.demandeurId} · {a.dateCreation}</div>
                  {a.notes&&<div style={{color:T.textDim,fontSize:10,marginTop:2}}>{a.notes}</div>}
                </div>
                {canApprove && a.statut==="EN_ATTENTE_APPROBATION" && (
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>handleAchatAction(a.id,"approve")} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>✅</button>
                    <button onClick={()=>handleAchatAction(a.id,"refuse")} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>❌</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── STOCKS ── */}
      {tab==="stocks" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h4 style={{color:"#F97316",margin:0,fontSize:13,fontWeight:800}}>📦 Inventaire & Stocks</h4>
            {canApprove && <button onClick={async () => {const d = await gcPrompt("Désignation du nouvel article :");if(d){saveStocks(prev=>[...prev,{id:`STK-${Date.now()}`,ref:`MAT-${Date.now()}`,designation:d,categorie:"Divers",quantite:0,unite:"Unités",alerteSeuil:5,valeurUnitaire:0,depot:"Magasin principal",derniereEntree:new Date().toISOString().split("T")[0],processus:"S05"}]);}}} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Ajouter article</button>}
          </div>
          {stocksEnAlerte.length>0&&<div style={{background:"#EF444415",border:"1px solid #EF444433",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#EF4444",fontWeight:700}}>⚠️ {stocksEnAlerte.length} article(s) en-dessous du seuil d'alerte</div>}
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:T.surface2}}>
                  {["Réf.","Désignation","Catégorie","Stock","Unité","Seuil","Valeur unit.","Dépôt"].map(h=>(
                    <th key={h} style={{padding:"7px 10px",textAlign:"left",color:T.textMuted,fontSize:9,fontWeight:700,textTransform:"uppercase",borderBottom:`1px solid ${T.border}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stocks.map(s=>{
                  const enAlerte=s.quantite<=s.alerteSeuil;
                  return (
                    <tr key={s.id} className="gc-tr-hover" style={{borderBottom:`1px solid ${T.border}20`,background:enAlerte?"#EF444408":"transparent"}}>
                      <td style={{padding:"7px 10px",color:T.textDim,fontSize:10,fontFamily:"monospace"}}>{s.ref}</td>
                      <td style={{padding:"7px 10px",color:T.text,fontSize:11,fontWeight:600}}>{s.designation}{enAlerte&&<span style={{color:"#EF4444",fontSize:9,marginLeft:4}}>⚠</span>}</td>
                      <td style={{padding:"7px 10px",color:T.textMuted,fontSize:10}}>{s.categorie}</td>
                      <td style={{padding:"7px 10px"}}>
                        <span style={{color:enAlerte?"#EF4444":"#22C55E",fontWeight:800,fontSize:12}}>{s.quantite}</span>
                        {canApprove&&<button onClick={async () => {const q = await gcPrompt(`Ajuster la quantité (actuel: ${s.quantite}) :`);const n=parseInt(q, 10);if(!isNaN(n))saveStocks(prev=>prev.map(x=>x.id===s.id?{...x,quantite:n,derniereEntree:new Date().toISOString().split("T")[0]}:x));}} style={{marginLeft:6,background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:9}}>±</button>}
                      </td>
                      <td style={{padding:"7px 10px",color:T.textMuted,fontSize:10}}>{s.unite}</td>
                      <td style={{padding:"7px 10px",color:T.textMuted,fontSize:10}}>{s.alerteSeuil}</td>
                      <td style={{padding:"7px 10px",color:T.textMuted,fontSize:10}}>{(s.valeurUnitaire||0).toLocaleString("fr-FR")} FCFA</td>
                      <td style={{padding:"7px 10px",color:T.textMuted,fontSize:10}}>{s.depot}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {stocks.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:30,fontSize:12}}>Aucun article en stock.</div>}
        </div>
      )}

      {/* ── ACTIFS ── */}
      {tab==="actifs" && lvl>=3 && (()=>{
        // All state hoisted to LogistiqueModule (Rules of Hooks)
        const CAT_C={INFORMATIQUE:"#3B82F6",MOBILIER:"#8B5CF6",VEHICULE:"#F97316",MATERIEL:"#C9A84C",BATIMENT:"#64748B",AUTRE:"#7A90B0"};
        const ETAT_C={BON:"#22C55E",USAGE:"#F59E0B",DEFECTUEUX:"#F97316",HORS_SERVICE:"#EF4444"};
        const totalValeur=actifs.reduce((a,x)=>a+(parseFloat(x.valeur)||0),0);
        return(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{color:"#F97316",fontWeight:800,fontSize:13}}>🏗️ Registre des Actifs & Équipements</div>
                <div style={{color:T.textDim,fontSize:10}}>{actifs.length} actifs · Valeur totale : {totalValeur.toLocaleString("fr-FR")} FCFA</div>
              </div>
              <button onClick={()=>{setShowActifForm(!showActifForm);setEditActif(null);setActifForm({nom:"",categorie:"INFORMATIQUE",marque:"",modele:"",serie:"",valeur:"",dateAchat:"",affectation:"",etat:"BON",localisation:"Siège",notes:""}); }}
                style={{background:"#F97316",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>➕ Nouvel actif</button>
            </div>
            {/* Stats par catégorie */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8,marginBottom:14}}>
              {Object.entries(CAT_C).map(([cat,c])=>{const cnt=actifs.filter(a=>a.categorie===cat).length;if(!cnt)return null;return(
                <div key={cat} style={{background:T.surface2,border:`2px solid ${c}33`,borderRadius:8,padding:"8px",textAlign:"center"}}>
                  <div style={{color:c,fontWeight:900,fontSize:18}}>{cnt}</div>
                  <div style={{color:T.textMuted,fontSize:8,fontWeight:600}}>{cat}</div>
                </div>
              );})}
            </div>
            {/* Formulaire */}
            {(showActifForm||editActif)&&(
              <div style={{background:T.surface2,border:`2px solid ${editActif?"#C9A84C44":"#F9731644"}`,borderRadius:12,padding:14,marginBottom:14}}>
                <div style={{color:editActif?"#C9A84C":"#F97316",fontWeight:700,fontSize:12,marginBottom:10}}>{editActif?"✏️ Modifier l'actif":"➕ Nouvel actif"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[{l:"Désignation *",k:"nom",span:3},{l:"Catégorie",k:"categorie",span:1,opts:["INFORMATIQUE","MOBILIER","VEHICULE","MATERIEL","BATIMENT","AUTRE"]},{l:"Marque",k:"marque",span:1},{l:"Modèle",k:"modele",span:1},{l:"N° Série / Code",k:"serie",span:1},{l:"Valeur d'acquisition (FCFA)",k:"valeur",span:1},{l:"Date d'achat",k:"dateAchat",span:1,type:"date"},{l:"Affecté à",k:"affectation",span:1},{l:"État",k:"etat",span:1,opts:["BON","USAGE","DEFECTUEUX","HORS_SERVICE"]},{l:"Localisation",k:"localisation",span:1},{l:"Notes",k:"notes",span:3}].map(f=>(
                    <div key={f.k} style={{gridColumn:`span ${f.span||1}`}}>
                      <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                      {f.opts?<select value={editActif?editActif[f.k]:actifForm[f.k]} onChange={e=>{if(editActif)setEditActif(p=>({...p,[f.k]:e.target.value}));else setActifForm(p=>({...p,[f.k]:e.target.value}));}} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                        {f.opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                      :<input type={f.type||"text"} value={editActif?editActif[f.k]:actifForm[f.k]} onChange={e=>{if(editActif)setEditActif(p=>({...p,[f.k]:e.target.value}));else setActifForm(p=>({...p,[f.k]:e.target.value}));}} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/> }
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={()=>{
                    if(editActif){if(!editActif.nom){gcAlert("Désignation requise");return;}saveActifs(actifs.map(a=>a.id===editActif.id?{...editActif,updatedAt:new Date().toISOString(),updatedBy:currentUser.name}:a));setEditActif(null);}
                    else{if(!actifForm.nom){gcAlert("Désignation requise");return;}saveActifs([...actifs,{id:"ACT-"+Date.now(),...actifForm,valeur:parseFloat(actifForm.valeur)||0,createdAt:new Date().toISOString(),createdBy:currentUser.name}]);setActifForm({nom:"",categorie:"INFORMATIQUE",marque:"",modele:"",serie:"",valeur:"",dateAchat:"",affectation:"",etat:"BON",localisation:"Siège",notes:""});setShowActifForm(false);}
                  }} style={{background:"#F97316",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ {editActif?"Mettre à jour":"Enregistrer"}</button>
                  <button onClick={()=>{setShowActifForm(false);setEditActif(null);}} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                </div>
              </div>
            )}
            {/* ── Filtres Actifs ── */}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
              <input value={actifSearch} onChange={e=>setActifSearch(e.target.value)} placeholder="🔍 Désignation, marque, série…" style={{flex:"1 1 160px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
              <select value={actifCatFilter} onChange={e=>setActifCatFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
                <option value="ALL">📦 Toutes catégories</option>
                {Object.keys(CAT_C||{}).map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select value={logStatutFilter} onChange={e=>setLogStatutFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11,cursor:"pointer"}}>
                <option value="ALL">🔍 Tous états</option>
                {Object.keys(ETAT_C||{}).map(e=><option key={e} value={e}>{e.replace(/_/g," ")}</option>)}
              </select>
              <span style={{color:T.textDim,fontSize:10}}>{actifs.filter(a=>{const q=actifSearch.toLowerCase();return(!q||(a.nom||"").toLowerCase().includes(q)||(a.marque||"").toLowerCase().includes(q)||(a.serie||"").toLowerCase().includes(q))&&(actifCatFilter==="ALL"||a.categorie===actifCatFilter)&&(logStatutFilter==="ALL"||a.etat===logStatutFilter);}).length}/{actifs.length}</span>
            </div>
            {/* Liste des actifs */}
            {actifs.length===0?<div style={{color:T.textDim,textAlign:"center",padding:24,background:T.surface2,borderRadius:10}}>Aucun actif enregistré</div>:(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                  <thead><tr style={{background:T.surface3}}>{["ID","Désignation","Catégorie","Marque/Modèle","État","Affectation","Localisation","Valeur","Actions"].map(h=><th key={h} style={{padding:"7px 10px",textAlign:"left",color:T.textMuted,fontWeight:700,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>{actifs.filter(a=>{const q=actifSearch.toLowerCase();return(!q||(a.nom||"").toLowerCase().includes(q)||(a.marque||"").toLowerCase().includes(q)||(a.serie||"").toLowerCase().includes(q))&&(actifCatFilter==="ALL"||a.categorie===actifCatFilter)&&(logStatutFilter==="ALL"||a.etat===logStatutFilter);}).map(a=>(
                    <tr key={a.id} style={{borderBottom:`1px solid ${T.border}22`}}>
                      <td style={{padding:"5px 10px",fontFamily:"monospace",color:"#C9A84C",fontSize:9}}>{a.id.split("-")[1]}</td>
                      <td style={{padding:"5px 10px",color:T.text,fontWeight:600}}>{a.nom}</td>
                      <td style={{padding:"5px 10px"}}><span style={{background:(CAT_C[a.categorie]||"#888")+"22",color:CAT_C[a.categorie]||"#888",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{a.categorie}</span></td>
                      <td style={{padding:"5px 10px",color:T.textMuted}}>{a.marque||""}{a.modele?" — "+a.modele:""}</td>
                      <td style={{padding:"5px 10px"}}><span style={{background:(ETAT_C[a.etat]||"#888")+"22",color:ETAT_C[a.etat]||"#888",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{(a.etat||"").replace(/_/g," ")}</span></td>
                      <td style={{padding:"5px 10px",color:T.textMuted}}>{a.affectation||"—"}</td>
                      <td style={{padding:"5px 10px",color:T.textMuted}}>{a.localisation||"—"}</td>
                      <td style={{padding:"5px 10px",color:"#C9A84C",fontFamily:"monospace",textAlign:"right"}}>{a.valeur>0?a.valeur.toLocaleString("fr-FR"):"—"}</td>
                      <td style={{padding:"5px 10px"}}>
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>{setEditActif({...a});setShowActifForm(false);}} style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:9}}>✏️</button>
                          <button onClick={async () => {if(await gcConfirm(`Supprimer "${a.nom}" ?`)){dsDeleteItemFromArray("gc-logistique-actifs",a.id);setActifs(prev=>prev.filter(x=>x.id!==a.id));}}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:9}}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                  <tfoot><tr style={{background:T.surface3,fontWeight:800}}>
                    <td colSpan={7} style={{padding:"6px 10px",color:"#F97316",fontWeight:700,fontSize:10}}>TOTAL VALEUR ACTIFS</td>
                    <td style={{padding:"6px 10px",color:"#C9A84C",fontFamily:"monospace",fontWeight:900,fontSize:11,textAlign:"right"}}>{totalValeur.toLocaleString("fr-FR")} FCFA</td>
                    <td/>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── INVENTAIRES ── */}
      {tab==="inventaires" && lvl>=3 && (()=>{
        const lignes=invLignes;
        const loadLignes=loadInvLignes;
        const ETAT_INV={BON:"#22C55E",USAGE:"#F59E0B",DEFECTUEUX:"#F97316",MANQUANT:"#EF4444",HORS_SERVICE:"#DC2626"};
        return(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{color:"#06B6D4",fontWeight:800,fontSize:13}}>📋 Inventaires des Actifs</div>
                <div style={{color:T.textDim,fontSize:10}}>{inventaires.length} inventaire(s) · {invActifs.length} actifs à inventorier</div>
              </div>
              <button onClick={()=>setShowInvForm(!showInvForm)} style={{background:"#06B6D4",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                ➕ Programmer un inventaire
              </button>
            </div>
            {/* Formulaire nouvel inventaire */}
            {showInvForm&&(
              <div style={{background:T.surface2,border:"1px solid #06B6D444",borderRadius:12,padding:14,marginBottom:14}}>
                <div style={{color:"#06B6D4",fontWeight:700,fontSize:12,marginBottom:10}}>🗓️ Programmer un inventaire</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[{l:"Titre *",k:"titre",span:3},{l:"Responsable",k:"responsable",span:1},{l:"Date prévue",k:"date",span:1,type:"date"},{l:"Type",k:"type",span:1,opts:["COMPLET","PARTIEL","TOURNANT","SPOT"]},{l:"Notes",k:"notes",span:3}].map(f=>(
                    <div key={f.k} style={{gridColumn:`span ${f.span||1}`}}>
                      <label style={{color:T.textMuted,fontSize:9,display:"block",marginBottom:2,fontWeight:700,textTransform:"uppercase"}}>{f.l}</label>
                      {f.opts?<select value={invForm[f.k]} onChange={e=>setInvForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>{f.opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                      :<input type={f.type||"text"} value={invForm[f.k]} onChange={e=>setInvForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}/>}
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={()=>{
                    if(!invForm.titre){gcAlert("Titre requis");return;}
                    const inv={id:"INV-"+Date.now(),...invForm,statut:"PLANIFIE",createdAt:new Date().toISOString(),createdBy:currentUser.name,actifCount:invActifs.length};
                    saveInventaires([inv,...inventaires]);
                    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📋",message:`Inventaire "${inv.titre}" programmé pour le ${inv.date}`,at:new Date().toISOString(),read:false,module:"logistique"},...p]);
                    setShowInvForm(false);setInvForm({titre:"",responsable:currentUser.name,date:new Date().toISOString().split("T")[0],type:"COMPLET",notes:""});
                  }} style={{background:"#06B6D4",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Enregistrer</button>
                  <button onClick={()=>setShowInvForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
                </div>
              </div>
            )}
            {/* Liste des inventaires */}
            {inventaires.length===0?<div style={{color:T.textDim,textAlign:"center",padding:24,background:T.surface2,borderRadius:10}}>Aucun inventaire programmé</div>:(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {inventaires.map(inv=>{
                  const inv_lignes=lignes[inv.id]||null;
                  const done=inv_lignes?inv_lignes.filter(l=>l.constate).length:0;
                  const total=inv_lignes?inv_lignes.length:inv.actifCount||0;
                  const pct=total>0?Math.round(done/total*100):0;
                  const ST_C={PLANIFIE:"#3B82F6",EN_COURS:"#F59E0B",TERMINÉ:"#22C55E",VALIDÉ:"#A855F7"};
                  return(
                    <div key={inv.id} style={{background:T.surface2,border:`1px solid ${ST_C[inv.statut]||"#888"}33`,borderRadius:12,padding:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                        <div>
                          <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:2}}>{inv.titre}</div>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                            <span style={{background:(ST_C[inv.statut]||"#888")+"22",color:ST_C[inv.statut]||"#888",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>{inv.statut}</span>
                            <span style={{color:T.textDim,fontSize:9}}>📅 {inv.date}</span>
                            <span style={{color:T.textDim,fontSize:9}}>👤 {inv.responsable}</span>
                            <span style={{background:"#06B6D422",color:"#06B6D4",borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700}}>{inv.type}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:5}}>
                          {inv.statut!=="VALIDÉ"&&(
                            <button onClick={()=>{
                              const l=loadLignes(inv.id);
                              // FIX v135 — setLignes should not be used here, using selectedInv state instead
                              setSelectedInv(inv.id===selectedInv?null:inv.id);
                              if(inv.statut==="PLANIFIÉ"){saveInventaires(inventaires.map(x=>x.id===inv.id?{...x,statut:"EN_COURS",startedAt:new Date().toISOString()}:x));}
                            }} style={{background:"#06B6D422",border:"1px solid #06B6D444",color:"#06B6D4",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                              {selectedInv===inv.id?"▲ Fermer":"▶ Saisir"}
                            </button>
                          )}
                          {inv.statut==="EN_COURS"&&(
                            <button onClick={()=>{
                              saveInventaires(inventaires.map(x=>x.id===inv.id?{...x,statut:"TERMINÉ",endedAt:new Date().toISOString()}:x));
                              setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📋",message:`Inventaire "${inv.titre}" terminé — ${pct}% des actifs constatés`,at:new Date().toISOString(),read:false},...p]);
                            }} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Terminer</button>
                          )}
                          {inv.statut==="TERMINÉ"&&lvl>=4&&(
                            <button onClick={()=>saveInventaires(inventaires.map(x=>x.id===inv.id?{...x,statut:"VALIDÉ",validatedAt:new Date().toISOString(),validatedBy:currentUser.name}:x))} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>🏛️ Valider</button>
                          )}
                          <button onClick={async () => {if(await gcConfirm(`Supprimer l'inventaire "${inv.titre}" ?`)){dsDeleteItemFromArray("gc-inventaires",inv.id);setInventaires(prev=>prev.filter(x=>x.id!==inv.id));if(selectedInv===inv.id)setSelectedInv(null);}}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:9}}>🗑️</button>
                        </div>
                      </div>
                      {total>0&&<div style={{marginTop:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:9,color:T.textMuted}}>
                          <span>Progression : {done}/{total} actifs constatés</span>
                          <span style={{color:pct>=100?"#22C55E":pct>50?"#F59E0B":"#EF4444",fontWeight:700}}>{pct}%</span>
                        </div>
                        <div style={{height:4,background:T.surface3,borderRadius:2}}><div style={{width:pct+"%",height:"100%",background:pct>=100?"#22C55E":pct>50?"#F59E0B":"#F97316",borderRadius:2,transition:"width 0.5s"}}/></div>
                      </div>}
                      {/* Feuille de saisie */}
                      {selectedInv===inv.id&&(inv_lignes||[]).length>0&&(
                        <div style={{marginTop:12,borderTop:`1px solid ${T.border}22`,paddingTop:10}}>
                          <div style={{color:"#06B6D4",fontWeight:700,fontSize:11,marginBottom:8}}>📝 Feuille de constat — {inv.titre}</div>
                          <div style={{overflowX:"auto",maxHeight:300,overflowY:"auto"}}>
                            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                              <thead><tr style={{background:T.surface3,position:"sticky",top:0}}>{["","Actif","N° Série","Constaté ?","État constaté","Observation"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",color:T.textMuted,fontWeight:700,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                              <tbody>{(lignes[inv.id]||[]).map((l,li)=>(
                                <tr key={li} style={{borderBottom:`1px solid ${T.border}22`,background:l.constate?(l.etatConstate==="MANQUANT"?"#EF444408":"#22C55E06"):"transparent"}}>
                                  <td style={{padding:"4px 8px",textAlign:"center"}}><input type="checkbox" checked={!!l.constate} onChange={e=>{const nl=lignes[inv.id].map((x,xi)=>xi===li?{...x,constate:e.target.checked}:x);saveInvLignes(inv.id,nl);}} style={{accentColor:"#06B6D4"}}/></td>
                                  <td style={{padding:"4px 8px",color:T.text,fontWeight:600}}>{l.nom}</td>
                                  <td style={{padding:"4px 8px",color:T.textDim,fontFamily:"monospace"}}>{l.serie||"—"}</td>
                                  <td style={{padding:"4px 8px",textAlign:"center"}}>{l.constate?<span style={{color:"#22C55E",fontWeight:700}}>✅</span>:<span style={{color:T.textDim}}>—</span>}</td>
                                  <td style={{padding:"4px 8px"}}>
                                    <select value={l.etatConstate} onChange={e=>{const nl=lignes[inv.id].map((x,xi)=>xi===li?{...x,etatConstate:e.target.value}:x);saveInvLignes(inv.id,nl);}} style={{background:T.surface3,border:`1px solid ${ETAT_INV[l.etatConstate]||T.border}44`,borderRadius:4,padding:"2px 5px",color:ETAT_INV[l.etatConstate]||T.text,fontSize:9}}>
                                      {["BON","USAGE","DEFECTUEUX","HORS_SERVICE","MANQUANT"].map(e=><option key={e} value={e}>{e}</option>)}
                                    </select>
                                  </td>
                                  <td style={{padding:"4px 8px"}}><input value={l.observation} onChange={e=>{const nl=lignes[inv.id].map((x,xi)=>xi===li?{...x,observation:e.target.value}:x);saveInvLignes(inv.id,nl);}} placeholder="Observation…" style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:4,padding:"2px 7px",color:T.text,fontSize:9,width:"100%"}}/></td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};


