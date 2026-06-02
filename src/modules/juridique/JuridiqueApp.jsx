import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// JuridiqueApp.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, playSound, useSI, gcFileSave , dsSave, dsOnSync, dsGet } from '../../core/index.js';
import { useRemoteSync } from '../../hooks/useSyncedState.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';
import { gcToast } from '../../components/ToastManager.jsx';
import { gcViewDoc, gcDownloadDoc } from '../../core/constants.js';

export function JuridiqueApp({ T, currentUser, setNotifications=_noop, dossiers=[], setDossiers=_noop, taches=[], setTaches=_noop, users=[], partners=[], docs=[], setDocs=_noop, standaloneDocuments=[], saveStandaloneDocs=_noop }){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'juridique',
          nom: file.name, taille: file.size, type: file.type,
          uploadedBy: currentUser?.id, uploadedByName: currentUser?.name,
          ...extraMeta,
        });
        results.push({
          ...ref, name: file.name, size: file.size, mimeType: file.type,
          sizeStr: file.size < 1048576 ? `${Math.round(file.size/1024)} Ko` : `${(file.size/1048576).toFixed(1)} Mo`,
          ext: '.' + file.name.split('.').pop().toLowerCase(),
          uploadedAt: new Date().toISOString(), downloads: 0,
        });
      } catch(e) { console.error('[upload juridique]', file.name, e.message); }
    }
    return results;
  };

  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  // Accès contexte SI pour synchro KYC ↔ partners (source unique de vérité)
  const si = useSI();
  const setPartnersSync = si?.setPartnersSync || _noop;
  const siPartners = si?.partners || partners;
  const isJurResp = currentUser?.isAdmin || (currentUser?.level>=4 && (currentUser?.process||"").includes("O02")) || currentUser?.level>=5;
  const [tab, setTab] = useState("tableau_bord");
  const [uploadedDocs, setUploadedDocs] = useState(() => { try { return JSON.parse(_lsGet("gc-jur-docs")||"[]"); } catch (_) { return []; }});
  const [customLaws, setCustomLaws] = useState(() => { try { return JSON.parse(_lsGet("gc-jur-custom-laws")||"[]"); } catch (_) { return []; }});
  const [customModeles, setCustomModeles] = useState(() => { try { return JSON.parse(_lsGet("gc-jur-custom-modeles")||"[]"); } catch (_) { return []; }});
  const [kycClients, setKycClients] = useState(() => { try { return JSON.parse(_lsGet("gc-jur-kyc")||"[]"); } catch (_) { return []; }});
  const [veille, setVeille] = useState(() => { try { return JSON.parse(_lsGet("gc-jur-veille")||"null") || [
    {id:"V001",titre:"Réforme Code OHADA 2024 — Sociétés",date:"2024-12-15",source:"OHADA.com",cat:"OHADA",url:"",note:"Modifications sur le capital minimum des SARL",saved:true,docs:[]},
    {id:"V002",titre:"Loi de Finances Gabon 2025 — Fiscalité entreprises",date:"2025-01-08",source:"DGI Gabon",cat:"Fiscal",url:"",note:"Nouveaux taux IS 30% — PME 25%",saved:true,docs:[]},
    {id:"V003",titre:"Décret 2024-512 — Code du Travail Gabon",date:"2024-11-20",source:"JORG",cat:"Travail",url:"",note:"Modification congés payés — 30 jours",saved:false,docs:[]},
  ]; } catch (_) { return []; }});

  const [searchVeille, setSearchVeille] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [newVeille, setNewVeille] = useState({titre:"",source:"",cat:"OHADA",note:"",url:""});
  const [showAddVeille, setShowAddVeille] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiQuery, setAiQuery] = useState("");
  const [showAddLaw, setShowAddLaw] = useState(false);
  const [newLaw, setNewLaw] = useState({titre:"",code:"",ref:"",desc:"",contenu:"",cat:"LOI"});
  const [showAddModele, setShowAddModele] = useState(false);
  const [newModele, setNewModele] = useState({titre:"",type:"CONTRAT",desc:"",contenu:"",tags:""});
  const [showKycForm, setShowKycForm] = useState(false);
  const [kycForm, setKycForm] = useState({nom:"",type:"PERSONNE_MORALE",rccm:"",nif:"",activite:"",adresse:"",responsable:"",tel:"",email:"",riskLevel:"FAIBLE",statut:"ACTIF",notes:""});
  const [selectedKyc, setSelectedKyc] = useState(null);
  const [editLaw, setEditLaw] = useState(null);
  const [editModele, setEditModele] = useState(null);
  const [veilleDocRef, setVeilleDocRef] = useState(null);
  const fileInputRef = useRef(null);
  const veilleFileRef = useRef(null);

  // Sync temps-réel : rafraîchit les données quand un autre utilisateur les modifie
  useRemoteSync({
    'gc-jur-docs':           setUploadedDocs,
    'gc-jur-kyc':            setKycClients,
    'gc-jur-veille':         setVeille,
    'gc-jur-custom-laws':    setCustomLaws,
    'gc-jur-custom-modeles': setCustomModeles,
  });

  const OHADA_ACTS = [
    { id:"AUS",label:"Acte Uniforme Sociétés Commerciales",desc:"SARL, SA, SNC — Constitution, gestion, dissolution",ref:"OHADA AUS",color:"#DC2626" },
    { id:"AUC",label:"Acte Uniforme Droit Commercial Général",desc:"Registre du commerce, fonds de commerce, bail commercial",ref:"OHADA AUC",color:"#B91C1C" },
    { id:"AUP",label:"Acte Uniforme Procédures Collectives",desc:"Redressement judiciaire, liquidation des biens",ref:"OHADA AUP",color:"#991B1B" },
    { id:"AUE",label:"Acte Uniforme Entreprenant",desc:"Statut de l'entreprenant — Immatriculation simplifiée",ref:"OHADA AUE",color:"#EF4444" },
    { id:"AUT",label:"Acte Uniforme Contrats de Transport",desc:"Contrats de transport de marchandises par route",ref:"OHADA AUT",color:"#F87171" },
    { id:"AUS2",label:"Acte Uniforme Sûretés",desc:"Hypothèques, nantissements, cautionnements",ref:"OHADA AUS",color:"#7F1D1D" },
    { id:"AUVE",label:"Acte Uniforme Voies d'Exécution",desc:"Saisies, exécution forcée, recouvrement",ref:"OHADA AUVE",color:"#DC2626" },
    { id:"GAB_COM",label:"Code de Commerce du Gabon",desc:"Dispositions nationales complémentaires OHADA",ref:"Loi Gabon",color:"#059669" },
    { id:"GAB_TRAV",label:"Code du Travail Gabonais",desc:"Relations individuelles et collectives de travail",ref:"Code Travail",color:"#0D9488" },
    { id:"GAB_FISC",label:"Code Général des Impôts — Gabon",desc:"IS, IRPP, TVA, droits d'enregistrement",ref:"CGI Gabon",color:"#0284C7" },
    { id:"GAB_PEN",label:"Code Pénal Gabonais",desc:"Infractions, peines, procédure pénale",ref:"Code Pénal",color:"#7C3AED" },
    { id:"GAB_SOC",label:"Code de Prévoyance Sociale",desc:"CNSS, accidents du travail, retraite",ref:"CNSS Gabon",color:"#0EA5E9" },
  ];

  const MODELES_BASE = [
    { id:"cg_sarl",label:"Statuts SARL",desc:"Modèle statuts SARL — OHADA AUS",code:"SARL",icon:"🏢" },
    { id:"cg_sa",label:"Statuts SA",desc:"Société Anonyme — OHADA AUS",code:"SA",icon:"🏛️" },
    { id:"cg_bail",label:"Contrat de Bail Commercial",desc:"Bail commercial conforme OHADA",code:"BAIL",icon:"🏠" },
    { id:"cg_trav",label:"Contrat de Travail CDI",desc:"CDI conforme Code Travail Gabon",code:"CDI",icon:"👤" },
    { id:"cg_cdd",label:"Contrat de Travail CDD",desc:"CDD avec clauses conformes",code:"CDD",icon:"📋" },
    { id:"cg_presta",label:"Contrat de Prestation",desc:"Convention de prestation services",code:"PRESTA",icon:"🤝" },
    { id:"cg_conf",label:"Accord de Confidentialité NDA",desc:"Non-disclosure agreement",code:"NDA",icon:"🔒" },
    { id:"cg_mandat",label:"Mandat de Représentation",desc:"Procuration / mandat actes juridiques",code:"MANDAT",icon:"✍️" },
    { id:"cg_pv",label:"PV d'Assemblée Générale",desc:"Procès-verbal AG ordinaire ou extraordinaire",code:"PV_AG",icon:"📜" },
    { id:"cg_mise",label:"Mise en Demeure",desc:"Lettre de mise en demeure formelle",code:"MISE_DEM",icon:"⚠️" },
  ];

  const VEILLE_CATS = ["OHADA","Fiscal","Travail","Commercial","Pénal","Conformité","Jurisprudence","International","Autre"];

  const saveVeille = (v) => {
    setVeille(v);
    try {
      const sanitized = v.map(item => ({
        ...item,
        docs: Array.isArray(item.docs) ? item.docs.map(doc => ({ ...doc, data: undefined })) : item.docs,
      }));
      _lsSet("gc-jur-veille", JSON.stringify(sanitized));
      dsSave("gc-jur-veille", sanitized).catch(() => {});
    } catch (_) {}
  };
  const saveDocs = (d) => { setUploadedDocs(d); try { const sanitized = d.map(x => ({ ...x, data: undefined })); _lsSet("gc-jur-docs", JSON.stringify(sanitized)); dsSave("gc-jur-docs", sanitized).catch(() => {}); } catch (_) {} };
  const saveCustomLaws = (d) => { setCustomLaws(d); try { _lsSet("gc-jur-custom-laws", JSON.stringify(d)); dsSave("gc-jur-custom-laws", d).catch(() => {}); } catch (_) {} };
  const saveCustomModeles = (d) => { setCustomModeles(d); try { _lsSet("gc-jur-custom-modeles", JSON.stringify(d)); dsSave("gc-jur-custom-modeles", d).catch(() => {}); } catch (_) {} };
  const saveKyc = (d) => { setKycClients(d); try { _lsSet("gc-jur-kyc", JSON.stringify(d)); dsSave("gc-jur-kyc",d).catch(err => gcToast.syncError('', err)); } catch (_) {} };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files||[]);
    if (!files.length) return;
    setUploading(true);
    const readers = files.map(f => gcFileSave(f, { module: 'juridique', dossierId: null, nom: f.name, taille: f.size, type: f.type||"application/octet-stream", uploadedBy: currentUser?.id, uploadedByName: currentUser?.name }).then(ref => ({
        ...ref,
        id: ref.id,
        name:f.name, size:f.size, type:f.type||"application/octet-stream",
        cat:"JURIDIQUE", uploadedAt:new Date().toISOString(),
        uploadedBy:currentUser.name,
        sizeStr:f.size>1048576?`${(f.size/1048576).toFixed(1)} Mo`:`${Math.round(f.size/1024)} Ko`,
        data: ref.dataUrl || ref.path
      })).catch(err => { console.error('[Juridique] item upload:', err, f.name); return null; })
    );
    Promise.all(readers.map(p => p.catch(err => { console.error('[Juridique] upload:', err); return null; }))).then(newDocs => {
      saveDocs([...(newDocs.filter(Boolean)), ...uploadedDocs]);
      setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📎",message:`${files.length} document(s) juridique(s) téléversé(s)`,at:new Date().toISOString(),read:false},...p]);
      setTimeout(() => setUploading(false), 800);
    }).catch(err => { console.error('[Juridique] upload chain:', err); setUploading(false); });
    e.target.value = "";
  };

  React.useEffect(() => {
    const unsub = dsOnSync(async (event) => {
      try {
        if (event.key === 'gc-jur-docs') {
          const val = await dsGet('gc-jur-docs', []);
          if (Array.isArray(val)) { setUploadedDocs(val); try { _lsSet('gc-jur-docs', JSON.stringify(val)); } catch (_) {} }
        }
        if (event.key === 'gc-jur-custom-laws') {
          const val = await dsGet('gc-jur-custom-laws', []);
          if (Array.isArray(val)) { setCustomLaws(val); try { _lsSet('gc-jur-custom-laws', JSON.stringify(val)); } catch (_) {} }
        }
        if (event.key === 'gc-jur-custom-modeles') {
          const val = await dsGet('gc-jur-custom-modeles', []);
          if (Array.isArray(val)) { setCustomModeles(val); try { _lsSet('gc-jur-custom-modeles', JSON.stringify(val)); } catch (_) {} }
        }
        if (event.key === 'gc-jur-veille') {
          const val = await dsGet('gc-jur-veille', []);
          if (Array.isArray(val)) { setVeille(val); try { _lsSet('gc-jur-veille', JSON.stringify(val)); } catch (_) {} }
        }
      } catch (_) {}
    });
    return () => unsub();
  }, []);

  const handleVeilleFile = (e, veilleId) => {
    const files = Array.from(e.target.files||[]);
    if(!files.length) return;
    const readers = files.map(f => gcFileSave(f, { module: 'juridique', nom: f.name, taille: f.size, uploadedBy: currentUser?.id }).then(ref => ({...ref,id:"VD-"+Date.now(),name:f.name,sizeStr:f.size>1048576?`${(f.size/1048576).toFixed(1)} Mo`:`${Math.round(f.size/1024)} Ko`,data:ref?.dataUrl||ref?.path||null,addedAt:new Date().toISOString()})));

    Promise.all(readers.map(p => p.catch(err => { console.error('[Juridique veille] upload:', err); return null; }))).then(docs => {
      const updated = veille.map(v=>v.id===veilleId?{...v,docs:[...(v.docs||[]),...docs.filter(Boolean)]}:v);
      saveVeille(updated);
    }).catch(err => console.error('[Juridique veille] chain:', err));
    e.target.value="";
    setVeilleDocRef(null);
  };

  const handleAISearch = async (query) => {
    const q = query || searchVeille;
    if (!q.trim()) return;
    setAiLoading(true);
    setSearchResult(null);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},
        body: JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:1500,
          messages:[{role:"user",content:`Tu es un expert juridique spécialisé en droit OHADA et droit gabonais. Réponds en français de manière structurée.\n\nRecherche : "${q}"\n\nFournis :\n1. **Textes applicables** — Lois, actes uniformes OHADA, décrets gabonais pertinents\n2. **Dispositions clés** — Résumé des règles essentielles\n3. **Jurisprudence** — Si disponible\n4. **Points de vigilance** — Risques et pièges pratiques\n5. **Recommandations** — Démarche conseillée pour le Gabon\n\nSois précis, structuré et pratique pour un cabinet de conseil au Gabon.`}]
        })
      });
      const data = await resp.json();
      const text = data.content?.map(c=>c.text||"").join("") || "Aucun résultat.";
      setSearchResult(text);
    } catch(e) { setSearchResult("❌ Erreur de connexion à l'assistant IA."); }
    setAiLoading(false);
  };

  const handleAIModele = async (modele) => {
    setAiLoading(true);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-calls":"true"},
        body: JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:2000,
          messages:[{role:"user",content:`Génère un modèle complet de document juridique OHADA/Gabon pour : "${modele.label}"\nType : ${modele.type||modele.code}\nDescription : ${modele.desc}\n\nRends-le professionnel, complet avec toutes les clauses légales requises selon la législation gabonaise et l'OHADA. Date : ${new Date().toLocaleDateString("fr-FR")}`}]
        })
      });
      const data = await resp.json();
      return data.content?.map(c=>c.text||"").join("") || "";
    } catch(e) { return "Erreur IA"; }
    finally { setAiLoading(false); }
  };

  const downloadModele = async (m) => {
    const content = m.contenu || await handleAIModele(m);
    const blob = new Blob([content], {type:"text/plain;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`GC_JUR_${m.code||m.id}_${new Date().getFullYear()}.txt`; a.click();
    URL.revokeObjectURL(url);
    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"⚖️",message:`Modèle "${m.label||m.titre}" téléchargé`,at:new Date().toISOString(),read:false},...p]);
  };

  const addCustomLaw = () => {
    if(!newLaw.titre.trim()) return;
    const law = {...newLaw, id:"CL-"+Date.now(), addedBy:currentUser.name, addedAt:new Date().toISOString()};
    saveCustomLaws([law,...customLaws]);
    setNewLaw({titre:"",code:"",ref:"",desc:"",contenu:"",cat:"LOI"});
    setShowAddLaw(false);
  };

  const addCustomModele = () => {
    if(!newModele.titre.trim()) return;
    const m = {...newModele, id:"CM-"+Date.now(), addedBy:currentUser.name, addedAt:new Date().toISOString()};
    saveCustomModeles([m,...customModeles]);
    setNewModele({titre:"",type:"CONTRAT",desc:"",contenu:"",tags:""});
    setShowAddModele(false);
  };

  const addKyc = () => {
    if(!kycForm.nom.trim()) return;
    const now = new Date().toISOString();
    const k = {...kycForm, id:"KYC-"+Date.now(), createdBy:currentUser.name, createdAt:now, docs:[]};
    saveKyc([k,...kycClients]);
    // Sync bidirectionnelle vers partners (source unique de vérité)
    // Si ce client n'existe pas encore dans partners, on l'ajoute automatiquement
    const alreadyPartner = siPartners.find(p =>
      p.nom?.toLowerCase() === kycForm.nom.toLowerCase() ||
      (kycForm.rccm && p.rccm === kycForm.rccm) ||
      (kycForm.nif && p.nif === kycForm.nif)
    );
    if (!alreadyPartner) {
      setPartnersSync(prev => [...prev, {
        id: "PAR-KYC-" + Date.now(),
        nom: kycForm.nom, type: "client",
        contact: kycForm.responsable || "", tel: kycForm.tel || "",
        email: kycForm.email || "", adresse: kycForm.adresse || "",
        secteur: kycForm.activite || "", notes: kycForm.notes || "",
        rccm: kycForm.rccm || "", nif: kycForm.nif || "",
        riskLevel: kycForm.riskLevel || "FAIBLE",
        kycStatut: kycForm.statut === "ACTIF" ? "VALIDE" : "EN_ATTENTE",
        statut: "PROSPECT", segment: "PME",
        sourceAcquisition: "Réseau",
        dossiersIds: [], docsIds: [], rdvsIds: [],
        createdAt: now, createdBy: currentUser.id, createdByName: currentUser.name,
        process: "O02",
      }]);
    } else {
      // Mettre à jour les données KYC sur le partner existant
      setPartnersSync(prev => prev.map(p =>
        (p.nom?.toLowerCase() === kycForm.nom.toLowerCase() ||
         (kycForm.rccm && p.rccm === kycForm.rccm))
        ? { ...p,
            rccm: kycForm.rccm || p.rccm,
            nif: kycForm.nif || p.nif,
            riskLevel: kycForm.riskLevel || p.riskLevel,
            kycStatut: kycForm.statut === "ACTIF" ? "VALIDE" : p.kycStatut,
            kycDate: now, kycValidePar: currentUser.name,
          }
        : p
      ));
    }
    setKycForm({nom:"",type:"PERSONNE_MORALE",rccm:"",nif:"",activite:"",adresse:"",responsable:"",tel:"",email:"",riskLevel:"FAIBLE",statut:"ACTIF",notes:""});
    setShowKycForm(false);
    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"🏢",message:`Nouveau client KYC (O02) : ${k.nom} — synchronisé avec CRM O01`,at:now,read:false,module:"juridique"},...p]);
    playSound("success");
  };

  const jurDossiers = dossiers.filter(d=>d.process==="O02"||d.type?.toLowerCase().includes("jurid")||d.category==="JURIDIQUE");
  const jurDossierIds = new Set(jurDossiers.map(d=>d.id));
  const sharedDocsJur = [...(docs||[]), ...(standaloneDocuments||[])].filter(doc => {
    const procMatch = doc.process === "O02";
    const dossierMatch = doc.dossierId && jurDossierIds.has(doc.dossierId);
    const categoryMatch = (doc.category||"").toString().toUpperCase().includes("JURIDIQUE");
    const tagsMatch = (doc.tags||[]).some(t => t?.toString().toUpperCase().includes("O02") || t?.toString().toUpperCase().includes("JURID"));
    return procMatch || dossierMatch || categoryMatch || tagsMatch;
  });
  const jurSharedDocsCount = sharedDocsJur.length;

  const filteredVeille = veille.filter(v =>
    !searchVeille || v.titre.toLowerCase().includes(searchVeille.toLowerCase()) ||
    v.cat.toLowerCase().includes(searchVeille.toLowerCase())
  );

  const dossiersJur = dossiers.filter(d=>d.process==="O02"||d.type?.toLowerCase().includes("jurid")||d.category==="JURIDIQUE");
  const enCours = dossiersJur.filter(d=>d.status!=="TERMINE"&&d.status!=="ARCHIVE").length;
  const TABS = [
    {id:"tableau_bord",label:"📊 Bord"},
    {id:"actes",label:"⚖️ Textes & Lois"},
    {id:"modeles",label:"📄 Modèles"},
    {id:"kyc",label:"🏢 Portefeuille Clients"},
    {id:"veille",label:"🔭 Veille"},
    {id:"documents",label:"📎 Documents"},
    {id:"assistant",label:"🤖 IA Juridique"},
  ];

  const RISK_COLORS = {FAIBLE:"#22C55E",MOYEN:"#F59E0B",ÉLEVÉ:"#EF4444",CRITIQUE:"#DC2626"};

  return (
    <div>
      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"nowrap",overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?"#DC2626":"transparent",border:`1px solid ${tab===t.id?"#DC2626":T.border}`,color:tab===t.id?"#fff":T.textMuted,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontWeight:tab===t.id?700:400,fontSize:11,whiteSpace:"nowrap",flexShrink:0}}>{t.label}</button>
        ))}
      </div>

      {/* ── TABLEAU DE BORD ── */}
      {tab==="tableau_bord" && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[
              {label:"Dossiers actifs",val:enCours,icon:"📁",color:"#DC2626"},
              {label:"Textes & Lois",val:OHADA_ACTS.length+customLaws.length,icon:"⚖️",color:"#7C3AED"},
              {label:"Modèles",val:MODELES_BASE.length+customModeles.length,icon:"📄",color:"#0284C7"},
              {label:"Clients KYC",val:kycClients.length,icon:"🏢",color:"#059669"},
              {label:"Veille active",val:veille.filter(v=>v.saved).length,icon:"🔭",color:"#F59E0B"},
              {label:"Documents",val:uploadedDocs.length,icon:"📎",color:"#EC4899"},
              {label:"Clients à risque",val:kycClients.filter(k=>k.riskLevel==="ÉLEVÉ"||k.riskLevel==="CRITIQUE").length,icon:"⚠️",color:"#EF4444"},
              {label:"Tâches juridiques",val:(taches||[]).filter(t=>t.process==="O02"||t.module==="juridique").length,icon:"📋",color:"#22C55E"},
            ].map((s,i)=>(
              <div key={i} style={{background:T.surface2,border:`1px solid ${s.color}33`,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontSize:22,marginBottom:4}}>{s.icon}</div>
                <div style={{color:s.color,fontWeight:900,fontSize:18}}>{s.val}</div>
                <div style={{color:T.textMuted,fontSize:9,fontWeight:600}}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* Recent veille */}
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
            <div style={{color:T.text,fontWeight:800,fontSize:12,marginBottom:10}}>🔭 Veille récente</div>
            {veille.slice(0,3).map(v=>(
              <div key={v.id} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${T.border}33`}}>
                <span style={{background:"#DC262622",color:"#DC2626",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700,flexShrink:0}}>{v.cat}</span>
                <span style={{color:T.text,fontSize:11,flex:1}}>{v.titre}</span>
                <span style={{color:T.textMuted,fontSize:9}}>{v.date}</span>
              </div>
            ))}
          </div>
          {/* Risk clients */}
          {kycClients.filter(k=>k.riskLevel==="ÉLEVÉ"||k.riskLevel==="CRITIQUE").length>0&&(
            <div style={{background:"#EF444410",border:"1px solid #EF444433",borderRadius:10,padding:14}}>
              <div style={{color:"#EF4444",fontWeight:800,fontSize:12,marginBottom:8}}>⚠️ Clients à surveillance renforcée</div>
              {kycClients.filter(k=>k.riskLevel==="ÉLEVÉ"||k.riskLevel==="CRITIQUE").map(k=>(
                <div key={k.id} style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                  <span style={{color:RISK_COLORS[k.riskLevel]||"#EF4444",fontWeight:700,fontSize:10}}>●</span>
                  <span style={{color:T.text,fontSize:11}}>{k.nom}</span>
                  <span style={{background:RISK_COLORS[k.riskLevel]+"22",color:RISK_COLORS[k.riskLevel],borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700}}>{k.riskLevel}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TEXTES & LOIS ── */}
      {tab==="actes" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
            <div style={{color:T.text,fontWeight:800,fontSize:13,flex:1}}>⚖️ Textes, Lois & Actes OHADA</div>
            {isJurResp&&<button onClick={()=>setShowAddLaw(p=>!p)} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Ajouter texte/loi</button>}
          </div>
          {showAddLaw&&isJurResp&&(
            <div style={{background:T.surface2,border:"1px solid #DC262644",borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{color:"#DC2626",fontWeight:700,fontSize:12,marginBottom:10}}>➕ Nouveau texte / loi</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Titre *</div><input value={newLaw.titre} onChange={e=>setNewLaw(f=>({...f,titre:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Catégorie</div><select value={newLaw.cat} onChange={e=>setNewLaw(f=>({...f,cat:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                  {["LOI","DÉCRET","ACTE_OHADA","DIRECTIVE","RÈGLEMENT","CIRCULAIRE"].map(c=><option key={c} value={c}>{c}</option>)}
                </select></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Référence</div><input value={newLaw.ref} onChange={e=>setNewLaw(f=>({...f,ref:e.target.value}))} placeholder="Ex: Loi n°002/2024" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
              </div>
              <div style={{marginBottom:8}}><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Description</div><input value={newLaw.desc} onChange={e=>setNewLaw(f=>({...f,desc:e.target.value}))} placeholder="Résumé du texte" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
              <div style={{marginBottom:10}}><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Contenu / Texte intégral</div><textarea value={newLaw.contenu} onChange={e=>setNewLaw(f=>({...f,contenu:e.target.value}))} rows={5} placeholder="Collez ou rédigez le texte du document juridique ici..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"8px 10px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box",fontFamily:"monospace"}}/></div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addCustomLaw} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Enregistrer</button>
                <button onClick={()=>{setShowAddLaw(false);}} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 14px",cursor:"pointer",fontSize:11}}>Annuler</button>
              </div>
            </div>
          )}
          {/* Custom laws */}
          {customLaws.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{color:"#F59E0B",fontWeight:700,fontSize:11,marginBottom:6}}>📚 Documents ajoutés par le cabinet</div>
              {customLaws.map(l=>(
                <div key={l.id} style={{background:T.surface2,border:"1px solid #F59E0B33",borderRadius:8,padding:"10px 14px",marginBottom:6,display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700,flexShrink:0}}>{l.cat}</span>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{l.titre}</div>
                    {l.ref&&<div style={{color:T.textMuted,fontSize:10}}>{l.ref}</div>}
                    {l.desc&&<div style={{color:T.textDim,fontSize:10,marginTop:2}}>{l.desc}</div>}
                  </div>
                  {l.contenu&&<button onClick={()=>{const b=new Blob([l.contenu],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`${l.titre}.txt`;a.click();URL.revokeObjectURL(u);}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>⬇ TXT</button>}
                  {isJurResp&&<button onClick={async () => {if(await gcConfirm("Supprimer ?"))saveCustomLaws(customLaws.filter(x=>x.id!==l.id));}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14}}>🗑️</button>}
                </div>
              ))}
            </div>
          )}
          {/* OHADA acts */}
          <div style={{color:T.textMuted,fontWeight:700,fontSize:11,marginBottom:8}}>⚖️ Référentiel OHADA & Droit Gabonais</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {OHADA_ACTS.map(act=>(
              <div key={act.id} style={{display:"flex",gap:12,alignItems:"center",background:T.surface2,border:`1px solid ${act.color}33`,borderRadius:10,padding:"12px 16px"}}>
                <div style={{width:5,height:44,borderRadius:3,background:act.color,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:2}}>{act.label}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>{act.desc}</div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{background:act.color+"22",color:act.color,borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700,flexShrink:0}}>{act.ref}</span>
                  <button onClick={()=>handleAISearch(`Expliquer : ${act.label} (${act.ref}) dans le contexte du Gabon`)} style={{background:"#DC262622",border:"1px solid #DC262644",color:"#DC2626",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>🤖 IA</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODÈLES ── */}
      {tab==="modeles" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
            <div style={{color:T.text,fontWeight:800,fontSize:13,flex:1}}>📄 Modèles de Documents Juridiques</div>
            {isJurResp&&<button onClick={()=>setShowAddModele(p=>!p)} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Créer modèle</button>}
          </div>
          {showAddModele&&isJurResp&&(
            <div style={{background:T.surface2,border:"1px solid #DC262644",borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{color:"#DC2626",fontWeight:700,fontSize:12,marginBottom:10}}>✏️ Nouveau modèle personnalisé</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Titre *</div><input value={newModele.titre} onChange={e=>setNewModele(f=>({...f,titre:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Type</div><select value={newModele.type} onChange={e=>setNewModele(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                  {["CONTRAT","STATUTS","LETTRE","PV","RAPPORT","ACTE","MODELE_AUTRE"].map(t=><option key={t} value={t}>{t}</option>)}
                </select></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Description</div><input value={newModele.desc} onChange={e=>setNewModele(f=>({...f,desc:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                  <span style={{color:T.textMuted,fontSize:10}}>Contenu du modèle</span>
                  <button onClick={async()=>{if(newModele.titre){const c=await handleAIModele({label:newModele.titre,type:newModele.type,desc:newModele.desc,code:newModele.titre});setNewModele(f=>({...f,contenu:c}));} }} style={{background:"#DC262622",border:"1px solid #DC262644",color:"#DC2626",borderRadius:5,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>🤖 Générer avec IA</button>
                </div>
                <textarea value={newModele.contenu} onChange={e=>setNewModele(f=>({...f,contenu:e.target.value}))} rows={8} placeholder="Rédigez ou collez le contenu du modèle ici..." style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"8px 10px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box",fontFamily:"monospace"}}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addCustomModele} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:7,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Enregistrer le modèle</button>
                <button onClick={()=>setShowAddModele(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 14px",cursor:"pointer",fontSize:11}}>Annuler</button>
              </div>
            </div>
          )}
          {customModeles.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{color:"#F59E0B",fontWeight:700,fontSize:11,marginBottom:6}}>📂 Modèles du cabinet</div>
              {customModeles.map(m=>(
                <div key={m.id} style={{display:"flex",gap:10,alignItems:"center",background:T.surface2,border:"1px solid #F59E0B33",borderRadius:9,padding:"10px 14px",marginBottom:6}}>
                  <span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700}}>{m.type}</span>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{m.titre}</div>
                    {m.desc&&<div style={{color:T.textMuted,fontSize:10}}>{m.desc}</div>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>downloadModele(m)} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>⬇ DL</button>
                    {isJurResp&&<button onClick={()=>saveCustomModeles(customModeles.filter(x=>x.id!==m.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:13}}>🗑️</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{color:T.textMuted,fontWeight:700,fontSize:11,marginBottom:8}}>📚 Modèles standards</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
            {MODELES_BASE.map(m=>(
              <div key={m.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:22}}>{m.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{m.label}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>{m.desc}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>downloadModele(m)} style={{flex:1,background:"#DC262622",border:"1px solid #DC262644",color:"#DC2626",borderRadius:7,padding:"6px 0",cursor:"pointer",fontWeight:700,fontSize:10}}>⬇ Télécharger</button>
                  <button onClick={async()=>{setAiLoading(true);const c=await handleAIModele(m);setAiResult(`# ${m.label}\n\n${c}`);setTab("assistant");setAiLoading(false);}} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:7,padding:"6px 10px",cursor:"pointer",fontWeight:700,fontSize:10}}>🤖 IA</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PORTEFEUILLE CLIENTS & KYC ── */}
      {tab==="kyc" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
            <div style={{flex:1}}>
              <div style={{color:T.text,fontWeight:800,fontSize:13}}>🏢 Portefeuille Clients & KYC</div>
              <div style={{color:T.textMuted,fontSize:10}}>Know Your Customer — Due diligence, profil de risque, documents réglementaires</div>
            </div>
            {isJurResp&&<button onClick={()=>setShowKycForm(p=>!p)} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Nouveau client KYC</button>}
          </div>
          {showKycForm&&(
            <div style={{background:T.surface2,border:"1px solid #DC262644",borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{color:"#DC2626",fontWeight:800,fontSize:12,marginBottom:12}}>📋 Fiche KYC — Nouveau client</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Dénomination / Nom *</div><input value={kycForm.nom} onChange={e=>setKycForm(f=>({...f,nom:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Type de personne</div><select value={kycForm.type} onChange={e=>setKycForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                  {["PERSONNE_MORALE","PERSONNE_PHYSIQUE","ORGANISATION","ASSOCIATION"].map(t=><option key={t} value={t}>{t.replace("_"," ")}</option>)}
                </select></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Niveau de risque</div><select value={kycForm.riskLevel} onChange={e=>setKycForm(f=>({...f,riskLevel:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                  {["FAIBLE","MOYEN","ÉLEVÉ","CRITIQUE"].map(r=><option key={r} value={r}>{r}</option>)}
                </select></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>N° RCCM</div><input value={kycForm.rccm} onChange={e=>setKycForm(f=>({...f,rccm:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>N° NIF</div><input value={kycForm.nif} onChange={e=>setKycForm(f=>({...f,nif:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Secteur d'activité</div><input value={kycForm.activite} onChange={e=>setKycForm(f=>({...f,activite:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Adresse</div><input value={kycForm.adresse} onChange={e=>setKycForm(f=>({...f,adresse:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Responsable</div><input value={kycForm.responsable} onChange={e=>setKycForm(f=>({...f,responsable:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Téléphone</div><input value={kycForm.tel} onChange={e=>setKycForm(f=>({...f,tel:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
              </div>
              <div style={{marginBottom:10}}><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Notes / Observations</div><textarea value={kycForm.notes} onChange={e=>setKycForm(f=>({...f,notes:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/></div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addKyc} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:7,padding:"9px 20px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Créer la fiche KYC</button>
                <button onClick={()=>setShowKycForm(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"9px 14px",cursor:"pointer",fontSize:11}}>Annuler</button>
              </div>
            </div>
          )}
          {kycClients.length===0?(
            <div style={{color:T.textMuted,textAlign:"center",padding:40,fontSize:13}}>
              <div style={{fontSize:40,marginBottom:12}}>🏢</div>
              <div>Aucun client KYC enregistré</div>
              <div style={{fontSize:11,marginTop:6,color:T.textDim}}>Créez une fiche KYC pour chaque client du cabinet</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {kycClients.map(k=>(
                <div key={k.id} style={{background:T.surface2,border:`1px solid ${(RISK_COLORS[k.riskLevel]||"#ccc")}33`,borderRadius:10,padding:"12px 16px"}}>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:20}}>{k.type==="PERSONNE_PHYSIQUE"?"👤":"🏢"}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{color:T.text,fontWeight:800,fontSize:13}}>{k.nom}</span>
                        <span style={{background:(RISK_COLORS[k.riskLevel]||"#ccc")+"22",color:RISK_COLORS[k.riskLevel]||"#ccc",borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:800}}>{k.riskLevel}</span>
                        <span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700}}>{k.type.replace("_"," ")}</span>
                      </div>
                      <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>
                        {k.rccm&&<span style={{marginRight:10}}>RCCM: {k.rccm}</span>}
                        {k.nif&&<span style={{marginRight:10}}>NIF: {k.nif}</span>}
                        {k.activite&&<span>{k.activite}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {k.tel&&<a href={`tel:${k.tel}`} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:9,fontWeight:700,textDecoration:"none"}}>📞 {k.tel}</a>}
                      {isJurResp&&<button onClick={async () => {if(await gcConfirm("Supprimer ce client KYC ?"))saveKyc(kycClients.filter(x=>x.id!==k.id));}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14}}>🗑️</button>}
                    </div>
                  </div>
                  {k.notes&&<div style={{background:T.surface3,borderRadius:6,padding:"6px 10px",fontSize:10,color:T.textMuted,fontStyle:"italic"}}>{k.notes}</div>}
                  {/* Dossiers liés */}
                  {(() => {
                    const kDoss = dossiersJur.filter(d=>d.client===k.nom||d.clientId===k.id);
                    if(!kDoss.length) return null;
                    return <div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}}>
                      {kDoss.map(d=><span key={d.id} style={{background:"#3B82F622",color:"#3B82F6",borderRadius:4,padding:"1px 8px",fontSize:9,fontFamily:"monospace"}}>{d.ref}</span>)}
                    </div>
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── VEILLE JURIDIQUE ── */}
      {tab==="veille" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
            <input value={searchVeille} onChange={e=>setSearchVeille(e.target.value)} placeholder="🔍 Rechercher dans la veille…" style={{flex:1,minWidth:150,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}}/>
            <button onClick={()=>handleAISearch(searchVeille||"actualités juridiques OHADA Gabon 2025")} disabled={aiLoading} style={{background:"#A855F7",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
              {aiLoading?"⏳ IA…":"🤖 Recherche IA"}
            </button>
            <button onClick={()=>setShowAddVeille(p=>!p)} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Ajouter</button>
          </div>
          {searchResult&&(
            <div style={{background:"#A855F710",border:"1px solid #A855F733",borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <span style={{color:"#A855F7",fontWeight:700,fontSize:12}}>🤖 Résultat IA</span>
                <button onClick={()=>setSearchResult(null)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",marginLeft:"auto",fontSize:14}}>✕</button>
              </div>
              <div style={{color:T.text,fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7}}>{searchResult}</div>
            </div>
          )}
          {showAddVeille&&(
            <div style={{background:T.surface2,border:"1px solid #DC262644",borderRadius:10,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Titre *</div><input value={newVeille.titre} onChange={e=>setNewVeille(f=>({...f,titre:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Catégorie</div><select value={newVeille.cat} onChange={e=>setNewVeille(f=>({...f,cat:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>
                  {VEILLE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select></div>
                <div><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Source</div><input value={newVeille.source} onChange={e=>setNewVeille(f=>({...f,source:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
              </div>
              <div style={{marginBottom:8}}><div style={{color:T.textMuted,fontSize:10,marginBottom:3}}>Note / Résumé</div><textarea value={newVeille.note} onChange={e=>setNewVeille(f=>({...f,note:e.target.value}))} rows={2} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box"}}/></div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{if(!newVeille.titre.trim())return;const v={...newVeille,id:"V-"+Date.now(),date:new Date().toISOString().split("T")[0],saved:true,docs:[]};saveVeille([v,...veille]);setNewVeille({titre:"",source:"",cat:"OHADA",note:"",url:""});setShowAddVeille(false);}} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:7,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Ajouter</button>
                <button onClick={()=>setShowAddVeille(false)} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 12px",cursor:"pointer",fontSize:11}}>Annuler</button>
              </div>
            </div>
          )}
          <input ref={veilleFileRef} type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg" multiple onChange={e=>veilleDocRef&&handleVeilleFile(e,veilleDocRef)} style={{display:"none"}}/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filteredVeille.map(v=>(
              <div key={v.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px"}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                  <span style={{background:"#DC262622",color:"#DC2626",borderRadius:4,padding:"1px 7px",fontSize:9,fontWeight:700,flexShrink:0}}>{v.cat}</span>
                  <span style={{color:T.text,fontWeight:700,fontSize:12,flex:1}}>{v.titre}</span>
                  <span style={{color:T.textMuted,fontSize:9}}>{v.date}</span>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{setVeilleDocRef(v.id);setTimeout(()=>veilleFileRef.current?.click(),100);}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}} title="Joindre un document">📎 Joindre</button>
                    <button onClick={()=>handleAISearch(v.titre)} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:5,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>🤖</button>
                    <button onClick={()=>saveVeille(veille.map(x=>x.id===v.id?{...x,saved:!x.saved}:x))} style={{background:v.saved?"#22C55E22":"transparent",border:`1px solid ${v.saved?"#22C55E44":T.border}`,color:v.saved?"#22C55E":T.textDim,borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:10}}>{v.saved?"★":"☆"}</button>
                    <button onClick={()=>saveVeille(veille.filter(x=>x.id!==v.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:13}}>🗑️</button>
                  </div>
                </div>
                {v.source&&<div style={{color:T.textMuted,fontSize:9,marginBottom:4}}>📡 {v.source}</div>}
                {v.note&&<div style={{color:T.textDim,fontSize:10,fontStyle:"italic",marginBottom:6}}>{v.note}</div>}
                {(v.docs||[]).length>0&&(
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {(v.docs||[]).map(d=>(
                      <div key={d.id} style={{display:"flex",gap:4,alignItems:"center",background:"#DC262212",borderRadius:5,padding:"2px 9px"}}>
                        <span style={{fontSize:9}}>📎</span>
                        <span style={{color:T.text,fontSize:9}}>{d.name}</span>
                        <button onClick={()=>{const a=document.createElement("a");a.href=d.data;a.download=d.name;a.click();}} style={{background:"none",border:"none",color:"#3B82F6",cursor:"pointer",fontSize:9,padding:0}}>⬇</button>
                        <button onClick={()=>{const upd=veille.map(x=>x.id===v.id?{...x,docs:(x.docs||[]).filter(dd=>dd.id!==d.id)}:x);saveVeille(upd);}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10,padding:0}}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredVeille.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:32}}>Aucune entrée de veille</div>}
          </div>
        </div>
      )}

      {/* ── DOCUMENTS ── */}
      {tab==="documents" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
            <div style={{color:T.text,fontWeight:800,fontSize:13,flex:1}}>📎 Documents Juridiques</div>
            <button onClick={()=>fileInputRef.current?.click()} disabled={uploading} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
              {uploading?"⏳ Chargement…":"📤 Téléverser"}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.xlsx" multiple onChange={handleFileUpload} style={{display:"none"}}/>
          </div>
          {(uploadedDocs.length===0 && sharedDocsJur.length===0)?(
            <div style={{color:T.textMuted,textAlign:"center",padding:40}}>
              <div style={{fontSize:40,marginBottom:12}}>📎</div>
              <div>Aucun document juridique disponible</div>
              <div style={{fontSize:11,marginTop:6}}>Téléversez des documents ou consultez les documents O02 partagés dans le SI.</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {sharedDocsJur.length>0 && (
                <div>
                  <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:8}}>📂 Documents O02 partagés dans le SI ({sharedDocsJur.length})</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {sharedDocsJur.map(d=>(
                      <div key={d.id||d.ref||d.name} style={{display:"flex",gap:10,alignItems:"center",padding:"10px 14px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9}}>
                        <span style={{fontSize:18}}>{d.ext?.toLowerCase()===".pdf"?"📄":d.ext?.toLowerCase()===".docx"||d.ext?.toLowerCase()===".doc"?"📝":"📁"}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:T.text,fontSize:11,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name||d.ref||"Document"}</div>
                          <div style={{color:T.textMuted,fontSize:9}}>{d.sizeStr||"—"} · {d.createdBy||d.uploadedBy||"SI"} · {d.process||"O02"}</div>
                        </div>
                        <div style={{display:"flex",gap:5}}>
                          {(d.id||d.serverUrl||d.url||d.dataUrl)&&<button onClick={()=>gcViewDoc({id:d.id,serverUrl:d.serverUrl,url:d.url,dataUrl:d.dataUrl,nom:d.name||d.ref,name:d.name||d.ref})} style={{background:"#10B98122",border:"1px solid #10B98144",color:"#10B981",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>👁️ Voir</button>}
                          {(d.id||d.serverUrl||d.url||d.dataUrl)&&<button onClick={()=>gcDownloadDoc({id:d.id,serverUrl:d.serverUrl,url:d.url,dataUrl:d.dataUrl,nom:d.name||d.ref,name:d.name||d.ref})} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>⬇ DL</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {uploadedDocs.length>0 && (
                <div>
                  <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:8}}>📤 Documents juridiques uploadés ({uploadedDocs.length})</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {uploadedDocs.map(d=>(
                      <div key={d.id} style={{display:"flex",gap:10,alignItems:"center",padding:"10px 14px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9}}>
                        <span style={{fontSize:18}}>📎</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:T.text,fontSize:11,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                          <div style={{color:T.textMuted,fontSize:9}}>{d.sizeStr} · {d.uploadedBy} · {new Date(d.uploadedAt).toLocaleDateString("fr-FR")}</div>
                        </div>
                        <div style={{display:"flex",gap:5}}>
                          {d.data&&<button onClick={()=>{const a=document.createElement("a");a.href=d.data;a.download=d.name;a.click();}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>⬇ DL</button>}
                          {isJurResp&&<button onClick={()=>saveDocs(uploadedDocs.filter(x=>x.id!==d.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14}}>🗑️</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ASSISTANT IA ── */}
      {tab==="assistant" && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"linear-gradient(135deg,#DC262615,#A855F715)",border:"1px solid #DC262633",borderRadius:12,padding:16}}>
            <div style={{color:"#DC2626",fontWeight:800,fontSize:13,marginBottom:6}}>🤖 Assistant Juridique IA</div>
            <div style={{color:T.textMuted,fontSize:11,marginBottom:12}}>Recherche juridique assistée par IA — Droit OHADA, droit gabonais, jurisprudence, modèles</div>
            <div style={{display:"flex",gap:8}}>
              <input value={aiQuery} onChange={e=>setAiQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleAISearch(aiQuery);}} placeholder="Ex: Comment créer une SARL au Gabon ? Quelles sont les clauses essentielles d'un bail commercial OHADA ?" style={{flex:1,background:T.surface3,border:`1px solid #DC262644`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12}}/>
              <button onClick={()=>handleAISearch(aiQuery)} disabled={aiLoading} style={{background:"#DC2626",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                {aiLoading?"⏳":"🔍 Rechercher"}
              </button>
            </div>
          </div>
          {/* Quick queries */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[
              "Procédure création SARL OHADA",
              "Licenciement conforme Code Travail Gabon",
              "Obligations TVA Gabon",
              "Recouvrement de créances OHADA",
              "Bail commercial résiliation",
              "PV AG SARL obligatoire",
            ].map(q=>(
              <button key={q} onClick={()=>{setAiQuery(q);handleAISearch(q);}} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10}}>
                {q}
              </button>
            ))}
          </div>
          {aiResult&&(
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                <span style={{color:"#A855F7",fontWeight:700,fontSize:12}}>🤖 Résultat</span>
                <button onClick={()=>setAiResult(null)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",marginLeft:"auto",fontSize:14}}>✕</button>
                <button onClick={()=>{const b=new Blob([aiResult],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`Recherche_IA_${Date.now()}.txt`;a.click();URL.revokeObjectURL(u);}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"2px 9px",cursor:"pointer",fontSize:9,fontWeight:700}}>⬇ Export</button>
              </div>
              <div style={{color:T.text,fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.8}}>{aiResult}</div>
            </div>
          )}
          {aiLoading&&!aiResult&&(
            <div style={{textAlign:"center",padding:40,color:T.textMuted}}>
              <div style={{fontSize:32,marginBottom:12}}>⏳</div>
              <div>Analyse juridique en cours…</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Alias pour compatibilité avec les anciens appels
export function JuridiqueAppV2(props) { return <JuridiqueApp {...props} />; }
