// ============================================================
// OrganigrammePanel.jsx — NOTE v127: FICHIER NON-IMPORTÉ
// ============================================================
// Ce fichier contient des versions alternatives de:
//   - OrganigrammePanel    → version active: ProcessusMap.jsx L1289
//   - ReglesAccreditationsPanel → version active: ProcessusMap.jsx L1446
//
// Ces composants sont utilisés directement DEPUIS ProcessusMap.jsx
// qui les définit en local. Ce fichier n'est importé nulle part.
// Il peut être supprimé ou fusionné dans ProcessusMap.jsx.
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// OrganigrammePanel.jsx — SI Génie Consultant v127
import { _activeUser } from '../../core/index.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';

export function OrganigrammePanel({ T, localUser, users=[], isDG=false }) {
  const [orgView, setOrgView] = React.useState("hierarchique");
  const LEVEL_COLORS = {6:"#C41E3A",5:"#C9A84C",4:"#A855F7",3:"#3B82F6",2:"#22C55E",1:"#6B7280"};
  const LEVEL_LABELS = {6:"Direction SI",5:"Direction Générale",4:"Responsable",3:"Opérateur Confirmé",2:"Opérateur Standard",1:"Stagiaire/Assistant"};
  const PROC_COLORS = {"O01":"#F97316","O02":"#C41E3A","O03":"#22C55E","P01":"#3B82F6","P02":"#8B5CF6","P03":"#0F766E","P04":"#0369A1","S01":"#15803D","S02":"#D97706","S03":"#BE185D","S04":"#EC4899","S05":"#78716C","S06":"#57534E"};
  const PROC_NAMES = {"O01":"Exéc. Administratif","O02":"Juridique & Conseil","O03":"Gestion & Évaluation","P01":"Management","P02":"Conformité","P03":"Contrôle Gestion","P04":"Veille Stratégique","S01":"Finance","S02":"Audit","S03":"RH","S04":"Communication","S05":"Relations Ext.","S06":"Entretien"};

  const activeUsers = users.filter(u=>_activeUser(u)&&(u.accountStatus||"ACTIF")==="ACTIF"&&!u.blocked);

  const renderHierarchique = () => {
    const byLevel = [5,4,3,2,1].map(lvl=>({lvl,users:activeUsers.filter(u=>u.level===lvl),label:LEVEL_LABELS[lvl]||`Niveau ${lvl}`,color:LEVEL_COLORS[lvl]||"#6B7280"})).filter(g=>g.users.length>0);
    return(
      <div>
        <div style={{background:`linear-gradient(135deg,${T.surface2},${T.surface3})`,border:`1px solid ${T.border}`,borderRadius:12,padding:14,marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:20,marginBottom:4}}>⚖️</div>
          <div style={{color:T.text,fontWeight:900,fontSize:13}}>GÉNIE CONSULTANT</div>
          <div style={{color:T.textMuted,fontSize:10}}>Cabinet Juridique, d'Affaires & de Conseil — Libreville, Gabon</div>
        </div>
        {byLevel.map(g=>(
          <div key={g.lvl} style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{height:2,flex:1,background:g.color+"33"}}/>
              <span style={{background:g.color+"22",color:g.color,border:`1px solid ${g.color}44`,borderRadius:20,padding:"3px 12px",fontSize:10,fontWeight:700,flexShrink:0}}>
                Niv.{g.lvl} — {g.label} ({g.users.length})
              </span>
              <div style={{height:2,flex:1,background:g.color+"33"}}/>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
              {g.users.map(u=>(
                <div key={u.id} style={{background:T.surface,border:`2px solid ${g.color}33`,borderRadius:10,padding:"8px 12px",textAlign:"center",minWidth:100,maxWidth:140}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:u.color||g.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700,margin:"0 auto 5px",overflow:"hidden"}}>
                    {u.photoUrl?<img src={u.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:u.avatar||u.name?.[0]||"?"}
                  </div>
                  <div style={{color:T.text,fontSize:10,fontWeight:700,lineHeight:1.2}}>{u.name}</div>
                  <div style={{color:T.textMuted,fontSize:9,marginTop:2}}>{u.role||"—"}</div>
                  <div style={{marginTop:3}}>
                    <span style={{background:PROC_COLORS[u.process]+"22",color:PROC_COLORS[u.process]||"#6B7280",border:`1px solid ${PROC_COLORS[u.process]||"#6B7280"}44`,borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{u.process||"—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderFonctionnel = () => {
    const procs = [...new Set(activeUsers.map(u=>u.process||"—").filter(Boolean))].sort();
    return(
      <div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
          {procs.map(proc=>{
            const procUsers = activeUsers.filter(u=>u.process===proc||(u.processes||[]).includes(proc));
            const resp = procUsers.filter(u=>u.level>=4).sort((a,b)=>b.level-a.level)[0];
            const collabs = procUsers.filter(u=>u.level<4);
            const pc = PROC_COLORS[proc]||"#6B7280";
            return(
              <div key={proc} style={{background:T.surface,border:`2px solid ${pc}33`,borderRadius:10,overflow:"hidden"}}>
                <div style={{background:`linear-gradient(135deg,${pc}22,${pc}11)`,padding:"10px 12px",borderBottom:`1px solid ${pc}33`}}>
                  <div style={{color:pc,fontWeight:900,fontSize:12}}>{proc}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>{PROC_NAMES[proc]||proc} — {procUsers.length} pers.</div>
                </div>
                <div style={{padding:"8px 12px"}}>
                  {resp&&(
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,background:pc+"11",borderRadius:6,padding:"4px 7px"}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:resp.color||pc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,flexShrink:0}}>
                        {resp.avatar||resp.name?.[0]||"?"}
                      </div>
                      <div style={{minWidth:0}}>
                        <div style={{color:pc,fontSize:10,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{resp.name}</div>
                        <div style={{color:T.textDim,fontSize:8}}>Responsable Niv.{resp.level}</div>
                      </div>
                    </div>
                  )}
                  {collabs.slice(0,4).map(u=>(
                    <div key={u.id} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                      <div style={{width:14,height:14,borderRadius:"50%",background:u.color||"#6B7280",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff",flexShrink:0}}>{u.avatar||u.name?.[0]||"?"}</div>
                      <span style={{color:T.textMuted,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</span>
                      <span style={{color:T.textDim,fontSize:8,flexShrink:0}}>Niv.{u.level}</span>
                    </div>
                  ))}
                  {collabs.length>4&&<div style={{color:T.textDim,fontSize:9,marginTop:2}}>+{collabs.length-4} autres</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStructurel = () => {
    const sections_org = [
      {label:"DIRECTION GÉNÉRALE",color:"#C9A84C",icon:"🏛️",procs:["P01","P02","P03","P04"],desc:"Pilotage stratégique, conformité, contrôle de gestion, veille"},
      {label:"OPÉRATIONS",color:"#C41E3A",icon:"⚙️",procs:["O01","O02","O03"],desc:"Activités génératrices de CA — Accueil, Juridique, Gestion"},
      {label:"SUPPORT",color:"#3B82F6",icon:"🛠️",procs:["S01","S02","S03","S04","S05","S06"],desc:"Fonctions support — Finance, Audit, RH, Communication, Logistique"},
    ];
    return(
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {sections_org.map(sec=>{
          const secUsers = activeUsers.filter(u=>sec.procs.some(p=>u.process===p||(u.processes||[]).includes(p)));
          return(
            <div key={sec.label} style={{background:T.surface,border:`2px solid ${sec.color}33`,borderRadius:12,overflow:"hidden"}}>
              <div style={{background:`linear-gradient(135deg,${sec.color}22,${sec.color}11)`,padding:"10px 14px",borderBottom:`1px solid ${sec.color}33`,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>{sec.icon}</span>
                <div>
                  <div style={{color:sec.color,fontWeight:900,fontSize:12}}>{sec.label}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>{sec.desc}</div>
                </div>
                <span style={{marginLeft:"auto",background:sec.color+"22",color:sec.color,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{secUsers.length} pers.</span>
              </div>
              <div style={{padding:"10px 14px",display:"flex",flexWrap:"wrap",gap:6}}>
                {sec.procs.map(proc=>{
                  const pu=activeUsers.filter(u=>u.process===proc||(u.processes||[]).includes(proc));
                  if(pu.length===0)return null;
                  const pc=PROC_COLORS[proc]||"#6B7280";
                  return(
                    <div key={proc} style={{background:pc+"11",border:`1px solid ${pc}33`,borderRadius:8,padding:"6px 10px",minWidth:100}}>
                      <div style={{color:pc,fontWeight:700,fontSize:10}}>{proc} — {PROC_NAMES[proc]||proc}</div>
                      <div style={{color:T.textMuted,fontSize:9,marginTop:2}}>{pu.length} collaborateur(s)</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Trombinoscope supprimé (doublon de Collaborateurs — v123)

  return(
    <div>
      <div style={{marginBottom:14}}>
        <div style={{color:T.text,fontWeight:900,fontSize:14,marginBottom:2}}>🏢 Organigramme du Cabinet</div>
        <div style={{color:T.textMuted,fontSize:11}}>{activeUsers.length} collaborateur(s) actif(s) · 3 vues disponibles</div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[["hierarchique","📊 Hiérarchique"],["fonctionnel","🏷️ Fonctionnel"],["structurel","🏢 Structurel"]].map(([k,l])=>(
          <button key={k} onClick={()=>setOrgView(k)}
            style={{flex:1,minWidth:80,background:orgView===k?"#0A1E4A":"transparent",border:`1px solid ${orgView===k?"#0A1E4A":T.border}`,color:orgView===k?"#fff":T.textMuted,borderRadius:8,padding:"8px",cursor:"pointer",fontWeight:orgView===k?700:400,fontSize:11}}>
            {l}
          </button>
        ))}
      </div>
      {orgView==="hierarchique"&&renderHierarchique()}
      {orgView==="fonctionnel"&&renderFonctionnel()}
      {orgView==="structurel"&&renderStructurel()}
    </div>
  );
}



export function ReglesAccreditationsPanel({ T, localUser, users=[], canEdit=false, isAdmin=false, isDG=false }) {
  const [ruleTab, setRuleTab] = React.useState("niveaux");
  const NIVEAUX = [
    {n:6,label:"Superviseur SI",icon:"⚙️",color:"#C41E3A",
     droits:["Accès total système","Réinitialisation SI","Gestion comptes techniques","Config IA et API","Paramétrage global"],
     restrictions:["Aucune restriction technique"],
     processus:"Tous"},
    {n:5,label:"Directeur Général / Manager Général",icon:"🏛️",color:"#C9A84C",
     droits:["Accès total fonctionnel","Validation finale approbations","Clôture dossiers stratégiques","Activation comptes collaborateurs","Signature électronique niv5","Vue 360° toutes données"],
     restrictions:["Paramétrage technique réservé Admin"],
     processus:"Tous"},
    {n:4,label:"Responsable de Processus",icon:"👑",color:"#A855F7",
     droits:["CRUD complet son processus","Lecture tous dossiers","Validation/rejet dossiers","Suspension collaborateurs (circuit)","Assignation tâches et collaborateurs","Accès apps métier autorisées"],
     restrictions:["Pas d'accès admin système","Validation DG requise sur décisions critiques"],
     processus:"Son processus principal"},
    {n:3,label:"Opérateur Confirmé",icon:"🎓",color:"#3B82F6",
     droits:["Son processus + dossiers assignés","Transfert de dossiers","Soumission pour validation","Création dossiers externes (O01)","Accès rapport d'activité","Facturation (si habilité)"],
     restrictions:["Pas d'accès niv4+ (validation, suspension)","Anti-doublon actif"],
     processus:"Son processus"},
    {n:2,label:"Opérateur Standard",icon:"👤",color:"#22C55E",
     droits:["Ses dossiers uniquement","Créer dossiers INTERNES","Soumission au responsable","Accès apps bureau standard"],
     restrictions:["Pas de création dossiers EXTERNES","Anti-doublon strict","Pas d'accès données financières complètes"],
     processus:"Son processus uniquement"},
    {n:1,label:"Stagiaire / Assistant",icon:"🎯",color:"#6B7280",
     droits:["Lecture seule sur dossiers assignés","Accès bureau de base","Demandes internes"],
     restrictions:["Aucune création ni modification","Accès très limité"],
     processus:"Limité"},
  ];
  const HABILITATIONS = [
    {app:"Finance & Comptabilité S01",proc:["S01","P03","O01"],minLevel:2,icon:"💰",desc:"Journal OHADA, bilan, TVA, facturation — Accès contrôlé par processus"},
    {app:"Juridique & OHADA O02",proc:["O02","P02"],minLevel:2,icon:"⚖️",desc:"Actes, contrats, procédures, registres — Processus O02 et P02 uniquement"},
    {app:"Conseil & Stratégie",proc:["P01","P02","P03","P04","O03"],minLevel:3,icon:"🎯",desc:"Matrices stratégiques — Niveau 3+ et processus pilotage/O03"},
    {app:"SIRH — Ressources Humaines",proc:["S03"],minLevel:2,icon:"👥",desc:"Présences, paie, congés — S03 et DG uniquement"},
    {app:"Audit & Contrôle S02",proc:["S02","O03"],minLevel:2,icon:"🔍",desc:"Matrices risques, checklists — S02 et auditeurs O03"},
    {app:"Conformité P02",proc:["P02","S02"],minLevel:2,icon:"🛡️",desc:"Obligations légales, alertes OHADA/COBAC — P02 et S02"},
    {app:"Facturation & Honoraires",proc:["S01","O01","O02","O03"],minLevel:3,icon:"💰",desc:"Émission notes d'honoraires — Niveau 3+ et processus métier"},
    {app:"Conventions de Mission",proc:["O01","O02","O03"],minLevel:3,icon:"📜",desc:"Lettres de mission — Processus opérationnels et niv3+"},
    {app:"Rapport d'Activité",proc:[],minLevel:2,icon:"📊",desc:"Génération rapports — Niveau 2+ (périmètre limité par niveau)"},
    {app:"Logistique & Moyens Généraux",proc:["S05","S06"],minLevel:1,icon:"🚚",desc:"Achats, stocks, équipements — Tous utilisateurs (données filtrées)"},
  ];
  const REGLES_DOSSIERS = [
    {r:"Création dossier EXTERNE",cond:"O01 tous niveaux, ou Niv3+ tout processus",color:"#22C55E"},
    {r:"Création dossier INTERNE",cond:"Tout collaborateur (Niv1+)",color:"#3B82F6"},
    {r:"Anti-doublon dossiers",cond:"Niv2 : même objet + processus actif → bloqué",color:"#F59E0B"},
    {r:"Lecture dossier",cond:"Niv4+ : tous dossiers. Niv3 : son processus + assignés. Niv1-2 : ses dossiers",color:"#6B7280"},
    {r:"Modification dossier",cond:"Propriétaire (créateur ou assigné) + Niv4+ + Admin",color:"#A855F7"},
    {r:"Validation/Approbation",cond:"Niv4+ sur son processus, Niv5+ sur tous",color:"#C9A84C"},
    {r:"Rejet de dossier",cond:"Niv4+ obligatoire avec motif (note de rejet)",color:"#EF4444"},
    {r:"Clôture (TERMINE)",cond:"Niv5+ Signer&Clôturer. Niv4 : workflow validation. Admin : direct",color:"#C41E3A"},
    {r:"Archivage",cond:"Propriétaire + Niv4+ + O01 (dossiers TERMINE uniquement)",color:"#64748B"},
    {r:"Suppression",cond:"Circuit approbation requis Niv1-3. Direct si Niv4+ et auteur",color:"#EF4444"},
    {r:"Dossier confidentiel",cond:"Création : Niv4+ uniquement. Lecture : accès explicite par créateur",color:"#C41E3A"},
  ];

  return(
    <div>
      <div style={{marginBottom:14}}>
        <div style={{color:T.text,fontWeight:900,fontSize:14,marginBottom:2}}>📜 Règles & Accréditations</div>
        <div style={{color:T.textMuted,fontSize:11}}>Niveaux d'accès, droits d'usage et habilitations — Configuration officielle du SI</div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[["niveaux","🏅 Niveaux d'accès"],["habilitations","🔓 Habilitations Apps"],["dossiers","📁 Droits Dossiers"],["signatures","✍️ Droits Signatures"]].map(([k,l])=>(
          <button key={k} onClick={()=>setRuleTab(k)}
            style={{background:ruleTab===k?"#0A1E4A":"transparent",border:`1px solid ${ruleTab===k?"#0A1E4A":T.border}`,color:ruleTab===k?"#fff":T.textMuted,borderRadius:8,padding:"7px 12px",cursor:"pointer",fontWeight:ruleTab===k?700:400,fontSize:11}}>
            {l}
          </button>
        ))}
      </div>

      {ruleTab==="niveaux"&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {NIVEAUX.map(niv=>(
            <div key={niv.n} style={{background:T.surface,border:`2px solid ${niv.color}33`,borderRadius:10,overflow:"hidden"}}>
              <div style={{background:`linear-gradient(135deg,${niv.color}22,${niv.color}11)`,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:38,height:38,borderRadius:8,background:niv.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{niv.icon}</div>
                <div style={{flex:1}}>
                  <div style={{color:niv.color,fontWeight:900,fontSize:12}}>Niveau {niv.n} — {niv.label}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>Processus : {niv.processus}</div>
                </div>
                <span style={{color:T.textDim,fontSize:10,background:T.surface,borderRadius:5,padding:"2px 8px"}}>{users.filter(u=>_activeUser(u)&&u.level===niv.n&&(u.accountStatus||"ACTIF")==="ACTIF").length} utilisateur(s)</span>
              </div>
              <div style={{padding:"8px 14px 12px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{color:"#22C55E",fontWeight:700,fontSize:10,textTransform:"uppercase",marginBottom:5}}>✅ Droits accordés</div>
                  {niv.droits.map((d,i)=><div key={i} style={{color:T.text,fontSize:10,marginBottom:3,display:"flex",gap:5}}><span style={{color:"#22C55E",flexShrink:0}}>•</span>{d}</div>)}
                </div>
                <div>
                  <div style={{color:"#EF4444",fontWeight:700,fontSize:10,textTransform:"uppercase",marginBottom:5}}>🚫 Restrictions</div>
                  {niv.restrictions.map((r,i)=><div key={i} style={{color:T.textMuted,fontSize:10,marginBottom:3,display:"flex",gap:5}}><span style={{color:"#EF4444",flexShrink:0}}>•</span>{r}</div>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ruleTab==="habilitations"&&(
        <div>
          <div style={{background:"#3B82F611",border:"1px solid #3B82F633",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#3B82F6"}}>
            📋 Les habilitations permanentes sont gérées par le Manager Général dans <strong>Gestion des Accès</strong>. Des codes provisoires peuvent être émis par l'Direction SI.
          </div>
          {HABILITATIONS.map((h,i)=>(
            <div key={i} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",marginBottom:6,display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:20,flexShrink:0}}>{h.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:T.text,fontWeight:700,fontSize:11}}>{h.app}</div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{h.desc}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{color:"#F59E0B",fontWeight:700,fontSize:10}}>Niv.{h.minLevel}+</div>
                {h.proc.length>0&&<div style={{color:T.textDim,fontSize:9}}>{h.proc.join(", ")}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {ruleTab==="dossiers"&&(
        <div>
          <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#C9A84C"}}>
            ⚖️ Règles de gestion documentaire — SYSCOHADA & Politique interne Génie Consultant
          </div>
          {REGLES_DOSSIERS.map((r,i)=>(
            <div key={i} style={{background:T.surface,border:`1px solid ${r.color}22`,borderRadius:7,padding:"8px 12px",marginBottom:5,display:"flex",gap:10,alignItems:"center",borderLeft:`3px solid ${r.color}`}}>
              <div style={{flex:1}}>
                <div style={{color:T.text,fontWeight:700,fontSize:11}}>{r.r}</div>
                <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{r.cond}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ruleTab==="signatures"&&(
        <div>
          <div style={{background:"#8B5CF611",border:"1px solid #8B5CF633",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#8B5CF6"}}>
            ✍️ La signature numérique par PIN est horodatée et tracée. Elle vaut acceptation et engagement du signataire.
          </div>
          {[
            {rule:"Signature dossier (ATTENTE_SIGNATURE → TERMINE)",who:"Niv5+ (DG) uniquement",color:"#C9A84C"},
            {rule:"Signature note d'honoraires",who:"Niv4+ ou habilitation S01/O01",color:"#22C55E"},
            {rule:"Signature convention de mission",who:"Niv4+ ou habilitation O01/O02/O03",color:"#3B82F6"},
            {rule:"Validation KYC O01 (étape 1/3)",who:"O01 Niv3+ uniquement",color:"#F97316"},
            {rule:"Validation KYC Conformité (étape 2/3)",who:"P02 Niv4+ uniquement",color:"#8B5CF6"},
            {rule:"Approbation finale KYC (étape 3/3)",who:"DG/MG Niv5+",color:"#C41E3A"},
            {rule:"Approbation comptes collaborateurs",who:"Circuit RH→P02→DG obligatoire",color:"#A855F7"},
            {rule:"Clôture dossier (Admin direct)",who:"Niv6 — action irréversible",color:"#EF4444"},
          ].map((r,i)=>(
            <div key={i} style={{background:T.surface,border:`1px solid ${r.color}22`,borderRadius:7,padding:"8px 12px",marginBottom:5,borderLeft:`3px solid ${r.color}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:T.text,fontSize:11,fontWeight:600}}>{r.rule}</div>
              <div style={{color:r.color,fontWeight:700,fontSize:10,flexShrink:0,marginLeft:10,textAlign:"right"}}>{r.who}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ── Composants Documents & Signature ── */


