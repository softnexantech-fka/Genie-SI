import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// WriterPro.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, gcCodifDOC, gcFileSave } from '../../core/index.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';

export function WriterProApp({ T, currentUser, setNotifications=_noop}){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'bureautique',
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
      } catch(e) { console.error('[upload bureautique]', file.name, e.message); }
    }
    return results;
  };

  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const YEAR = new Date().getFullYear();

  // ── State ─────────────────────────────────────────────────────────────────
  const [docs, setDocs] = React.useState(()=>{try{return JSON.parse(_lsGet("gc-writer-pro-v2")||"[]");}catch(_){return [];}});
  const [current, setCurrent] = React.useState(null);
  const [title, setTitle] = React.useState("Document sans titre");
  const [savedMsg, setSavedMsg] = React.useState(false);
  const editorRef = React.useRef(null);
  const [wordCount, setWordCount] = React.useState(0);
  const [charCount, setCharCount] = React.useState(0);
  const [showInsertTable, setShowInsertTable] = React.useState(false);
  const [tableRows, setTableRows] = React.useState(3);
  const [tableCols, setTableCols] = React.useState(3);
  const [tableStyle, setTableStyle] = React.useState("classic");
  const [showInsert, setShowInsert] = React.useState(false);
  const [showPageSetup, setShowPageSetup] = React.useState(false);
  const [showFindReplace, setShowFindReplace] = React.useState(false);
  const [findText, setFindText] = React.useState("");
  const [replaceText, setReplaceText] = React.useState("");
  const [pageSize, setPageSize] = React.useState("a4");
  const [pageMargin, setPageMargin] = React.useState("normal");
  const [lineHeight, setLineHeight] = React.useState("1.8");
  const [fontFamily, setFontFamily] = React.useState("Arial");
  const [fontSize, setFontSize] = React.useState("12");
  const [zoom, setZoom] = React.useState(100);
  const [showList, setShowList] = React.useState(true);
  const [showStylesPanel, setShowStylesPanel] = React.useState(false);
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [headerText, setHeaderText] = React.useState("");
  const [footerText, setFooterText] = React.useState("");
  const [showHeaderFooter, setShowHeaderFooter] = React.useState(false);
  const [pageNumbers, setPageNumbers] = React.useState(false);
  const [columns, setColumns] = React.useState(1);
  const [showImageInsert, setShowImageInsert] = React.useState(false);
  const imageRef = React.useRef(null);

  const PAGE_SIZES = {
    a4:{w:"210mm",h:"297mm",label:"A4 (210×297mm)"},
    a3:{w:"297mm",h:"420mm",label:"A3 (297×420mm)"},
    letter:{w:"216mm",h:"279mm",label:"Lettre US"},
    legal:{w:"216mm",h:"356mm",label:"Légal US"},
  };
  const MARGINS = {normal:"2cm 2.5cm",narrow:"1.27cm",wide:"3cm",moderate:"2cm 1.9cm"};
  const FONTS = ["Arial","Calibri","Times New Roman","Georgia","Garamond","Palatino Linotype","Verdana","Trebuchet MS","Book Antiqua","Gill Sans MT","Century Gothic","Courier New","Comic Sans MS"];
  const FONT_SIZES = [8,9,10,11,12,13,14,16,18,20,22,24,26,28,32,36,40,48,56,64,72,96];

  // ── Document ops ──────────────────────────────────────────────────────────
  const saveDocs = d => {
    setDocs(d);
    try{_lsSet("gc-writer-pro-v2",JSON.stringify(d.slice(0,50).map(x=>({...x,content:x.content?.slice(0,100000)}))));}catch(_){}
  };

  const saveDoc = () => {
    const now = new Date().toISOString();
    const content = editorRef.current?.innerHTML||"";
    const ref = current?.ref || gcCodifDOC("O01.02","v1.0",docs.length%99,YEAR);
    const docData = {title,content,pageSize,lineHeight,fontFamily,fontSize,pageMargin,columns,headerText,footerText,pageNumbers};
    if(current) {
      const upd = docs.map(d=>d.id===current.id?{...d,...docData,updatedAt:now}:d);
      saveDocs(upd); setCurrent(c=>({...c,...docData,updatedAt:now,ref}));
    } else {
      const d = {id:"WR-"+Date.now(),ref,...docData,createdAt:now,updatedAt:now,createdBy:currentUser?.name};
      saveDocs([d,...docs]); setCurrent(d);
    }
    setSavedMsg(true); setTimeout(()=>setSavedMsg(false),2500);
    if(setNotifications) setNotifications(p=>[{id:"N"+Date.now(),icon:"📝",message:`Document sauvegardé : ${title}`,at:now,read:false},...p]);
  };

  const openDoc = (doc) => {
    setCurrent(doc); setTitle(doc.title);
    if(editorRef.current) {
    // Sanitize: remove script tags before loading stored content
    const safe = (doc.content||"").replace(/<script[\s\S]*?<\/script>/gi,"")
                                   .replace(/on\w+\s*=/gi,"data-disabled=");
    editorRef.current.innerHTML = safe;
  }
    updateCounts(doc.content||"");
    setPageSize(doc.pageSize||"a4");
    setLineHeight(doc.lineHeight||"1.8");
    setFontFamily(doc.fontFamily||"Arial");
    setFontSize(doc.fontSize||"12");
    setPageMargin(doc.pageMargin||"normal");
    setColumns(doc.columns||1);
    setHeaderText(doc.headerText||"");
    setFooterText(doc.footerText||"");
    setPageNumbers(doc.pageNumbers||false);
  };

  const newDoc = () => {
    setCurrent(null); setTitle("Document sans titre");
    if(editorRef.current) editorRef.current.innerHTML="";
    setWordCount(0); setCharCount(0);
    setPageSize("a4"); setLineHeight("1.8"); setFontFamily("Arial"); setFontSize("12");
    setColumns(1); setHeaderText(""); setFooterText(""); setPageNumbers(false);
  };

  const dupDoc = (doc) => {
    const now=new Date().toISOString();
    const d={...doc,id:"WR-"+Date.now(),title:doc.title+" (copie)",createdAt:now,updatedAt:now};
    saveDocs([d,...docs]); openDoc(d);
  };

  const updateCounts = (html) => {
    const txt=(html||"").replace(/<[^>]*>/g," ");
    setWordCount(txt.split(/\s+/).filter(Boolean).length);
    setCharCount(txt.replace(/\s/g,"").length);
  };

  const exec = (cmd, val) => { editorRef.current?.focus(); try{document.execCommand(cmd,false,val||undefined);}catch(_){} };

  // ── Font operations ───────────────────────────────────────────────────────
  const applyFont = (f) => { setFontFamily(f); exec("fontName",f); };
  const applySize = (s) => {
    setFontSize(s);
    const sel=window.getSelection();
    if(sel&&sel.rangeCount>0&&!sel.isCollapsed){
      editorRef.current?.focus();
      const range=sel.getRangeAt(0);
      const span=document.createElement("span");
      span.style.fontSize=s+"pt";
      try{range.surroundContents(span);}catch(_){exec("fontSize","3");}
    }
  };

  // ── Insert table ──────────────────────────────────────────────────────────
  const insertTable = () => {
    const accent = tableStyle==="modern"?"#1E3A5F":"#555";
    let html=`<table style="width:100%;margin:10px 0;border-collapse:collapse;">`;
    for(let r=0;r<tableRows;r++){
      const isH=r===0;
      const rowBg=tableStyle==="striped"&&!isH&&r%2===1?"background:#f8f9fa":"";
      html+=`<tr style="${rowBg}">`;
      for(let c=0;c<tableCols;c++){
        const isH=r===0;
        let tdStyle="";
        if(tableStyle==="classic") tdStyle=`border:1px solid #ccc;padding:7px 10px;${isH?"background:#f0f0f0;font-weight:bold;":""}`;
        else if(tableStyle==="modern") tdStyle=`padding:8px 12px;border-bottom:${isH?"2px":"1px"} solid ${isH?accent:"#eee"};${isH?"font-weight:bold;background:#f8f9fb;":""}`;
        else if(tableStyle==="striped") tdStyle=`padding:8px 12px;border-bottom:1px solid #dee2e6;${isH?"background:#1E3A5F;color:#fff;font-weight:bold;":""}`;
        else if(tableStyle==="minimal") tdStyle=`padding:6px 10px;${isH?"border-bottom:2px solid #333;font-weight:bold;":""}`;
        html+=`<td style="${tdStyle}min-width:80px;">${isH?`Colonne ${c+1}`:"&nbsp;"}</td>`;
      }
      html+="</tr>";
    }
    html+="</table><br/>";
    exec("insertHTML",html);
    setShowInsertTable(false);
  };

  // ── Image insert ──────────────────────────────────────────────────────────
  const insertImage = async (e) => {
    const file=e.target.files?.[0];
    if(!file) return;
    const [ref] = await _uploadFiles([file], { module: 'bureautique' });
    const dataUrl = ref?.dataUrl || ref?.path || '';
    if(dataUrl){
      const img=`<img src="${dataUrl}" style="max-width:100%;height:auto;border-radius:4px;margin:8px 0;" alt="${file.name}"/><br/>`;
      exec("insertHTML",img);
      setShowImageInsert(false);
    }
  };

  // ── Templates ─────────────────────────────────────────────────────────────
  const TEMPLATES = [
    {name:"📋 Note de service",icon:"📋",content:`<h1>NOTE DE SERVICE</h1><p style="text-align:right"><strong>Libreville, le ${new Date().toLocaleDateString("fr-FR")}</strong></p><hr/><p><strong>À :</strong> _______________</p><p><strong>De :</strong> ${currentUser?.name||"_______________"}</p><p><strong>Objet :</strong> _______________</p><hr/><h3>Objet de la note</h3><p>_______________</p><h3>Développement</h3><p>_______________</p><h3>Conclusion</h3><p>_______________</p><br/><p>Fait à Libreville, le ${new Date().toLocaleDateString("fr-FR")}</p><br/><div style="display:flex;gap:80px;"><div><p style="border-top:1px solid #333;padding-top:6px;min-width:150px;margin-top:40px;">Signature</p></div></div>`},
    {name:"📨 Lettre formelle",icon:"📨",content:`<p style="text-align:right">${currentUser?.name||"Expéditeur"}<br/>${currentUser?.role||"Fonction"}<br/>Libreville, le ${new Date().toLocaleDateString("fr-FR")}</p><br/><p><strong>Objet :</strong> _______________</p><br/><p>Monsieur / Madame,</p><p>J'ai l'honneur de porter à votre connaissance que _______________.</p><p>Je reste à votre disposition pour tout renseignement complémentaire.</p><p>Dans l'attente de votre réponse, veuillez agréer, Monsieur / Madame, l'expression de mes salutations distinguées.</p><br/><p>${currentUser?.name||"Signature"}</p>`},
    {name:"📊 Rapport de synthèse",icon:"📊",content:`<h1>RAPPORT DE SYNTHÈSE</h1><p style="text-align:center;color:#666">Génie Consultant · ${new Date().getFullYear()} · Confidentiel</p><hr/><h2>1. Contexte et objectifs</h2><p>_______________</p><h2>2. Méthodologie</h2><p>_______________</p><h2>3. Constatations</h2><p>_______________</p><h2>4. Analyse</h2><p>_______________</p><h2>5. Recommandations</h2><ul><li>_______________</li><li>_______________</li></ul><h2>6. Conclusion</h2><p>_______________</p><hr/><p style="font-size:10pt;color:#888">Rapport établi par ${currentUser?.name||"___"} · ${new Date().toLocaleDateString("fr-FR")}</p>`},
    {name:"⚖️ Avis juridique",icon:"⚖️",content:`<h1>AVIS JURIDIQUE</h1><p><strong>Référence :</strong> AJ-${YEAR}-___</p><p><strong>Date :</strong> ${new Date().toLocaleDateString("fr-FR")}</p><p><strong>Objet :</strong> _______________</p><hr/><h2>I. Faits</h2><p>_______________</p><h2>II. Question juridique posée</h2><p>_______________</p><h2>III. Analyse juridique</h2><p>_______________</p><h2>IV. Conclusion et avis</h2><p>_______________</p><hr/><div style="border-left:4px solid #DC2626;padding:10px 16px;background:#FFF5F5;"><strong style="color:#DC2626;">⚠️ Avertissement :</strong> Cet avis juridique est établi sur la base des informations communiquées et ne constitue pas une consultation juridique formelle.</div>`},
    {name:"📝 Procès-verbal",icon:"📝",content:`<h1>PROCÈS-VERBAL DE RÉUNION</h1><p><strong>Date :</strong> ${new Date().toLocaleDateString("fr-FR")}</p><p><strong>Heure :</strong> ___h___</p><p><strong>Lieu :</strong> _______________</p><p><strong>Présidents de séance :</strong> _______________</p><h2>Participants</h2><ul><li>_______________</li></ul><h2>Ordre du jour</h2><ol><li>_______________</li></ol><h2>Déroulement</h2><h3>Point 1 — _______________</h3><p>_______________</p><h2>Décisions prises</h2><ul><li>_______________</li></ul><h2>Prochaine réunion</h2><p>Date : _______________</p><hr/><p>Le Secrétaire de séance</p>`},
    {name:"🏢 Contrat simple",icon:"🏢",content:`<h1>CONTRAT DE PRESTATION DE SERVICES</h1><p>Entre les soussignés :</p><p><strong>Le Prestataire :</strong> Génie Consultant, cabinet de conseil sis à Libreville, Gabon, représenté par _______________,</p><p><strong>Le Client :</strong> _______________</p><h2>Article 1 — Objet</h2><p>Le présent contrat a pour objet de définir les conditions dans lesquelles le Prestataire s'engage à fournir les services suivants : _______________</p><h2>Article 2 — Durée</h2><p>Le présent contrat prend effet le _______________</p><h2>Article 3 — Prix et modalités de paiement</h2><p>En contrepartie des prestations, le Client s'engage à payer la somme de _______________ FCFA.</p><h2>Article 4 — Confidentialité</h2><p>Les parties s'engagent à garder confidentielles toutes les informations échangées dans le cadre du présent contrat.</p><br/><div style="display:flex;gap:60px;"><div style="text-align:center;"><div style="border-top:1px solid #333;padding-top:6px;min-width:150px;margin-top:40px;">Le Prestataire</div></div><div style="text-align:center;"><div style="border-top:1px solid #333;padding-top:6px;min-width:150px;margin-top:40px;">Le Client</div></div></div>`},
  ];

  // ── Styles ────────────────────────────────────────────────────────────────
  const HEADING_STYLES = [
    {l:"Titre 1",tag:"h1",preview:{fontSize:22,fontWeight:900,color:"#0A1E4A"}},
    {l:"Titre 2",tag:"h2",preview:{fontSize:17,fontWeight:800,color:"#1E3A5F"}},
    {l:"Titre 3",tag:"h3",preview:{fontSize:13,fontWeight:700,color:"#2D4A6A"}},
    {l:"Titre 4",tag:"h4",preview:{fontSize:12,fontWeight:700,color:"#3D5A7A"}},
    {l:"Sous-titre",tag:"p",style:"font-size:14pt;color:#6B7280;font-style:italic;",preview:{fontSize:12,color:"#6B7280",fontStyle:"italic"}},
    {l:"Corps texte",tag:"p",style:"font-size:11pt;line-height:1.8;",preview:{fontSize:11}},
    {l:"Citation",tag:"blockquote",style:"border-left:4px solid #9CA3AF;padding-left:16px;color:#6B7280;font-style:italic;",preview:{fontSize:11,color:"#6B7280",fontStyle:"italic",borderLeft:"4px solid #9CA3AF",paddingLeft:8}},
    {l:"Emphase forte",tag:"p",style:"font-weight:bold;font-size:12pt;",preview:{fontSize:12,fontWeight:700}},
    {l:"Code",tag:"p",style:"font-family:Courier New,monospace;background:#F1F5F9;padding:8px 12px;border-radius:6px;font-size:10pt;",preview:{fontSize:10,fontFamily:"monospace",background:"#F1F5F9",padding:"2px 6px"}},
  ];

  const applyHeadingStyle = (style) => {
    if(style.style) exec("insertHTML",`<${style.tag} style="${style.style}">Texte ici</${style.tag}><p></p>`);
    else exec("formatBlock",style.tag);
    setShowStylesPanel(false);
  };

  // ── Insert elements ────────────────────────────────────────────────────────
  const INSERTS = [
    {l:"── Séparateur fin",html:"<hr style='border:none;border-top:1px solid #ddd;margin:14px 0;'/><br/>"},
    {l:"══ Séparateur épais",html:"<hr style='border:none;border-top:3px solid #1E3A5F;margin:14px 0;'/><br/>"},
    {l:"┄ Tirets",html:"<hr style='border:none;border-top:2px dashed #aaa;margin:14px 0;'/><br/>"},
    {l:"▸ Point de liste décoratif",html:"<p style='padding-left:20px;'>▸ &nbsp;</p>"},
    {l:"📦 Encadré bleu info",html:"<div style='border-left:4px solid #3B82F6;background:#EFF6FF;padding:12px 16px;margin:10px 0;border-radius:0 8px 8px 0;'><strong style='color:#1E40AF;'>ℹ️ Information :</strong><span style='color:#1E3A8A;'> Texte ici</span></div><br/>"},
    {l:"⚠️ Attention",html:"<div style='border-left:4px solid #F59E0B;background:#FFFBEB;padding:12px 16px;margin:10px 0;border-radius:0 8px 8px 0;'><strong style='color:#92400E;'>⚠️ Attention :</strong><span style='color:#78350F;'> Texte ici</span></div><br/>"},
    {l:"✅ Note verte",html:"<div style='border-left:4px solid #22C55E;background:#F0FDF4;padding:12px 16px;margin:10px 0;border-radius:0 8px 8px 0;'><strong style='color:#166534;'>✅ Note :</strong><span style='color:#15803D;'> Texte ici</span></div><br/>"},
    {l:"🔴 Alerte critique",html:"<div style='border-left:4px solid #EF4444;background:#FFF5F5;padding:12px 16px;margin:10px 0;border-radius:0 8px 8px 0;border:1px solid #EF444433;'><strong style='color:#991B1B;'>🚨 Alerte :</strong><span style='color:#7F1D1D;'> Texte ici</span></div><br/>"},
    {l:"💬 Citation formelle",html:"<blockquote style='border:none;border-left:4px solid #9CA3AF;padding:12px 20px;margin:14px 20px;background:#F9FAFB;border-radius:0 8px 8px 0;'><p style='margin:0;color:#4B5563;font-style:italic;font-size:12pt;line-height:1.7;'>« Texte de la citation »</p><footer style='margin-top:10px;color:#9CA3AF;font-size:9pt;'>— Auteur, Référence</footer></blockquote><br/>"},
    {l:"📊 KPI / Chiffre clé",html:"<div style='text-align:center;background:linear-gradient(135deg,#0A1E4A,#1E3A5F);color:#fff;border-radius:12px;padding:24px 20px;margin:12px 0;'><div style='font-size:36pt;font-weight:900;color:#C9A84C;'>0,0 M FCFA</div><div style='font-size:11pt;opacity:0.8;margin-top:8px;'>Libellé du KPI</div></div><br/>"},
    {l:"📋 Tableau données stylé",html:"<table style='width:100%;border-collapse:collapse;margin:10px 0;font-size:11pt;'><thead><tr><th style='background:#0A1E4A;color:#fff;padding:9px 12px;text-align:left;border:1px solid #1E3A5F;'>Libellé</th><th style='background:#0A1E4A;color:#fff;padding:9px 12px;text-align:right;border:1px solid #1E3A5F;'>Montant</th><th style='background:#0A1E4A;color:#fff;padding:9px 12px;text-align:right;border:1px solid #1E3A5F;'>%</th></tr></thead><tbody><tr><td style='border:1px solid #ddd;padding:7px 12px;'>Ligne 1</td><td style='border:1px solid #ddd;padding:7px 12px;text-align:right;'>0</td><td style='border:1px solid #ddd;padding:7px 12px;text-align:right;'>0%</td></tr><tr style='background:#F9FAFB;'><td style='border:1px solid #ddd;padding:7px 12px;'>Ligne 2</td><td style='border:1px solid #ddd;padding:7px 12px;text-align:right;'>0</td><td style='border:1px solid #ddd;padding:7px 12px;text-align:right;'>0%</td></tr><tr><td style='border:1px solid #ddd;padding:7px 12px;'>Ligne 3</td><td style='border:1px solid #ddd;padding:7px 12px;text-align:right;'>0</td><td style='border:1px solid #ddd;padding:7px 12px;text-align:right;'>0%</td></tr><tr style='background:#F0FDF4;font-weight:bold;'><td style='border:1px solid #ddd;padding:7px 12px;'>Total</td><td style='border:1px solid #ddd;padding:7px 12px;text-align:right;'>0</td><td style='border:1px solid #ddd;padding:7px 12px;text-align:right;'>100%</td></tr></tbody></table><br/>"},
    {l:"📄 Saut de page",html:"<div style='page-break-before:always;border-top:1px dashed #CBD5E1;margin:18px 0;text-align:center;color:#94A3B8;font-size:9pt;padding-top:4px;'>── Saut de page ──</div><br/>"},
    {l:"🖋 Double signature",html:"<div style='margin:40px 0 10px;display:flex;gap:60px;'><div style='text-align:center;'><div style='border-top:1px solid #333;padding-top:8px;font-size:10pt;min-width:160px;margin-top:48px;'>Signature et date</div><div style='font-size:9pt;color:#666;margin-top:4px;'>Nom et qualité</div></div><div style='text-align:center;'><div style='border-top:1px solid #333;padding-top:8px;font-size:10pt;min-width:160px;margin-top:48px;'>Signature et date</div><div style='font-size:9pt;color:#666;margin-top:4px;'>Nom et qualité</div></div></div><br/>"},
    {l:"📅 Date du jour",html:`<span>${new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span>`},
    {l:"👤 Signature simple",html:`<br/><p>Fait à Libreville, le ${new Date().toLocaleDateString("fr-FR")}</p><br/><p>${currentUser?.name||"Prénom NOM"}<br/>${currentUser?.role||"Fonction"}</p><br/>`},
  ];

  // ── Export / Print ─────────────────────────────────────────────────────────
  const getMarginCSS = () => {
    const m = {normal:"2cm 2.5cm",narrow:"1.27cm",wide:"3cm",moderate:"2cm 1.9cm"}[pageMargin]||"2cm";
    return m;
  };

  const exportHTML = () => {
    const m=getMarginCSS(),ps=PAGE_SIZES[pageSize]||PAGE_SIZES.a4;
    const colCSS=columns>1?`column-count:${columns};column-gap:1.5cm;`:"";
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>@page{size:${ps.w} ${ps.h};margin:${m}}
body{font-family:${fontFamily},Arial,sans-serif;font-size:${fontSize}pt;line-height:${lineHeight};color:#1a1a1a;margin:${m};}
.content{${colCSS}}
table{border-collapse:collapse;width:100%;}td,th{padding:6px 10px;}
h1{font-size:22pt;color:#0A1E4A;margin-top:24pt;}h2{font-size:17pt;color:#1E3A5F;}h3{font-size:13pt;}h4{font-size:12pt;}
blockquote{border-left:4px solid #999;padding-left:16px;margin:8pt 16pt;color:#555;font-style:italic;}
.header{text-align:center;font-size:9pt;color:#999;border-bottom:1px solid #eee;padding-bottom:6pt;margin-bottom:12pt;}
.footer{text-align:center;font-size:9pt;color:#999;border-top:1px solid #eee;padding-top:6pt;margin-top:12pt;}
@media print{body{margin:${m};}.header,.footer{display:block !important;}}
</style></head><body>
${headerText?`<div class="header">${headerText}</div>`:""}
<h1>${title}</h1>
<div class="content">${editorRef.current?.innerHTML||""}</div>
${pageNumbers?"<p style='text-align:right;font-size:9pt;color:#999;'>Page 1</p>":""}
${footerText?`<div class="footer">${footerText}</div>`:""}
</body></html>`;
    const b=new Blob([html],{type:"text/html;charset=utf-8"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`${title}.html`;a.click();URL.revokeObjectURL(u);
  };

  const exportTXT = () => {
    const txt=title+"\n"+"=".repeat(title.length)+"\n\n"+(editorRef.current?.innerText||"");
    const b=new Blob([txt],{type:"text/plain;charset=utf-8"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`${title}.txt`;a.click();URL.revokeObjectURL(u);
  };

  const printDoc = () => {
    const m=getMarginCSS(),ps=PAGE_SIZES[pageSize]||PAGE_SIZES.a4;
    const colCSS=columns>1?`column-count:${columns};column-gap:1.5cm;`:"";
    const w=window.open("","_blank","width=900,height=1100");
    if(w){
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>@page{size:${ps.w} ${ps.h};margin:${m}}
body{font-family:${fontFamily};font-size:${fontSize}pt;margin:${m};line-height:${lineHeight};color:#000;}
.content{${colCSS}}
table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ccc;padding:6px 10px;}
h1{font-size:20pt;margin-top:0;}h2{font-size:16pt;}h3{font-size:13pt;}
blockquote{border-left:3px solid #999;padding-left:16px;font-style:italic;}
.header,.footer{font-size:9pt;color:#888;text-align:center;}
.header{border-bottom:1px solid #ddd;padding-bottom:6pt;margin-bottom:14pt;}
.footer{border-top:1px solid #ddd;padding-top:6pt;margin-top:14pt;}
</style></head><body>
${headerText?`<div class="header">${headerText}</div>`:""}
<h1>${title}</h1>
<div class="content">${editorRef.current?.innerHTML||""}</div>
${footerText?`<div class="footer">${footerText}</div>`:""}
</body></html>`);
      w.document.close();w.focus();setTimeout(()=>w.print(),600);
    }
  };

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const FMT_BTNS = [
    {l:"G",cmd:"bold",fw:900,title:"Gras (Ctrl+B)"},
    {l:"I",cmd:"italic",italic:true,title:"Italique (Ctrl+I)"},
    {l:"S",cmd:"underline",ul:true,title:"Souligné (Ctrl+U)"},
    {l:"S̶",cmd:"strikeThrough",title:"Barré"},
    {l:"X²",cmd:"superscript",title:"Exposant",sz:9},
    {l:"X₂",cmd:"subscript",title:"Indice",sz:9},
  ];
  const ALIGN_BTNS = [
    {l:"≡←",cmd:"justifyLeft",title:"Gauche"},
    {l:"≡=",cmd:"justifyCenter",title:"Centré"},
    {l:"≡→",cmd:"justifyRight",title:"Droite"},
    {l:"≡≡",cmd:"justifyFull",title:"Justifié"},
  ];
  const LIST_BTNS = [
    {l:"• —",cmd:"insertUnorderedList",title:"Puces"},
    {l:"1. —",cmd:"insertOrderedList",title:"Numérotée"},
    {l:"→",cmd:"indent",title:"Indenter"},
    {l:"←",cmd:"outdent",title:"Dé-indenter"},
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",gap:10,height:"calc(100vh - 220px)"}}>
      {/* Doc list panel */}
      {showList&&(
        <div style={{width:200,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:8,overflowY:"auto",display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
          <button onClick={newDoc} style={{background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",border:"none",color:"#fff",borderRadius:7,padding:"8px",cursor:"pointer",fontWeight:700,fontSize:11,width:"100%",marginBottom:2}}>+ Nouveau</button>
          <button onClick={()=>setShowTemplates(p=>!p)} style={{background:showTemplates?"#8B5CF622":"transparent",border:`1px solid ${showTemplates?"#8B5CF644":T.border}`,color:showTemplates?"#8B5CF6":T.textMuted,borderRadius:7,padding:"5px",cursor:"pointer",fontWeight:600,fontSize:10,width:"100%",marginBottom:4}}>📋 Modèles</button>
          {showTemplates&&(
            <div style={{marginBottom:6,display:"flex",flexDirection:"column",gap:2}}>
              {TEMPLATES.map(tpl=>(
                <button key={tpl.name} onClick={()=>{newDoc();setTimeout(()=>{if(editorRef.current){editorRef.current.innerHTML=tpl.content;updateCounts(tpl.content);const cleaned = tpl.name.split('').filter(c => !/^[\p{Emoji}]+$/u.test(c)).join('').trim();setTitle(cleaned || tpl.name);}},50);setShowTemplates(false);}}
                  style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"4px 6px",cursor:"pointer",fontSize:9,textAlign:"left"}}>
                  {tpl.name}
                </button>
              ))}
            </div>
          )}
          <div style={{color:T.textDim,fontSize:9,textAlign:"center",padding:"2px 0"}}>{docs.length} document(s)</div>
          {docs.map(doc=>(
            <div key={doc.id} style={{position:"relative"}}
              onMouseEnter={e=>{const btns=e.currentTarget.querySelectorAll(".doc-action");btns.forEach(b=>b.style.opacity="1");}}
              onMouseLeave={e=>{const btns=e.currentTarget.querySelectorAll(".doc-action");btns.forEach(b=>b.style.opacity="0");}}>
              <button onClick={()=>openDoc(doc)} style={{background:current?.id===doc.id?"#3B82F622":"transparent",border:`1px solid ${current?.id===doc.id?"#3B82F644":T.border}`,borderRadius:7,padding:"8px 10px",cursor:"pointer",textAlign:"left",color:T.text,width:"100%"}}>
                <div style={{fontSize:10,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:32}}>{doc.title}</div>
                <div style={{color:T.textDim,fontSize:8,marginTop:2}}>{new Date(doc.updatedAt).toLocaleDateString("fr-FR")}</div>
                <div style={{color:"#3B82F6",fontSize:7,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.ref}</div>
              </button>
              <div style={{position:"absolute",top:4,right:4,display:"flex",gap:2}}>
                <button className="doc-action" onClick={e=>{e.stopPropagation();dupDoc(doc);}} title="Dupliquer" style={{background:"transparent",border:"none",color:"#3B82F6",cursor:"pointer",fontSize:10,padding:"1px 3px",opacity:0,transition:"opacity .15s"}}>⧉</button>
                <button className="doc-action" onClick={e=>{e.stopPropagation();saveDocs(docs.filter(d=>d.id!==doc.id));if(current?.id===doc.id)newDoc();}} title="Supprimer" style={{background:"transparent",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10,padding:"1px 3px",opacity:0,transition:"opacity .15s"}}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main editor */}
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:5,minWidth:0}}>
        {/* Title + actions */}
        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>setShowList(p=>!p)} title="Panneau documents" style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",cursor:"pointer",color:T.textMuted,fontSize:12}}>☰</button>
          <input value={title} onChange={e=>setTitle(e.target.value)} style={{flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 12px",color:T.text,fontSize:14,fontWeight:700,minWidth:100}}/>
          <button onClick={saveDoc} style={{background:savedMsg?"#22C55E":"linear-gradient(135deg,#3B82F6,#1D4ED8)",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11,transition:"background .3s",whiteSpace:"nowrap"}}>{savedMsg?"✅ Sauvegardé":"💾 Sauvegarder"}</button>
          <button onClick={()=>setShowPageSetup(p=>!p)} title="Mise en page" style={{background:showPageSetup?"#8B5CF622":"transparent",border:`1px solid ${showPageSetup?"#8B5CF6":T.border}`,borderRadius:7,padding:"6px 9px",cursor:"pointer",color:showPageSetup?"#8B5CF6":T.textMuted,fontSize:12}}>📐</button>
          <button onClick={()=>setShowHeaderFooter(p=>!p)} title="En-tête & Pied" style={{background:showHeaderFooter?"#EC489922":"transparent",border:`1px solid ${showHeaderFooter?"#EC4899":T.border}`,borderRadius:7,padding:"6px 9px",cursor:"pointer",color:showHeaderFooter?"#EC4899":T.textMuted,fontSize:11}}>H/F</button>
          <div style={{display:"flex",gap:2,alignItems:"center",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"3px 8px"}}>
            <button onClick={()=>setZoom(z=>Math.max(50,z-10))} style={{background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:13}}>−</button>
            <span style={{color:T.textDim,fontSize:10,minWidth:32,textAlign:"center"}}>{zoom}%</span>
            <button onClick={()=>setZoom(z=>Math.min(200,z+10))} style={{background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:13}}>+</button>
          </div>
          <button onClick={exportHTML} title="Export HTML" style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"6px 9px",cursor:"pointer",fontSize:10,fontWeight:700}}>⬇ HTML</button>
          <button onClick={exportTXT} title="Export TXT" style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"6px 9px",cursor:"pointer",fontSize:10}}>⬇ TXT</button>
          <button onClick={printDoc} title="Imprimer" style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:7,padding:"6px 9px",cursor:"pointer",fontSize:12}}>🖨️</button>
        </div>

        {/* Page setup */}
        {showPageSetup&&(
          <div style={{background:T.surface2,border:`1px solid #8B5CF644`,borderRadius:9,padding:"10px 14px",display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-start"}}>
            <div>
              <div style={{color:T.textMuted,fontSize:9,fontWeight:700,marginBottom:5,textTransform:"uppercase"}}>Format</div>
              <div style={{display:"flex",gap:4}}>
                {Object.entries(PAGE_SIZES).map(([k,v])=>(
                  <button key={k} onClick={()=>setPageSize(k)} style={{background:pageSize===k?"#3B82F622":"transparent",border:`1px solid ${pageSize===k?"#3B82F6":T.border}`,borderRadius:5,padding:"4px 9px",cursor:"pointer",color:pageSize===k?"#3B82F6":T.textMuted,fontSize:9,fontWeight:pageSize===k?700:400}}>{v.label.split(" ")[0]}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{color:T.textMuted,fontSize:9,fontWeight:700,marginBottom:5,textTransform:"uppercase"}}>Marges</div>
              <select value={pageMargin} onChange={e=>setPageMargin(e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 7px",color:T.text,fontSize:10}}>
                {[["normal","Normales"],["narrow","Étroites"],["moderate","Modérées"],["wide","Larges"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <div style={{color:T.textMuted,fontSize:9,fontWeight:700,marginBottom:5,textTransform:"uppercase"}}>Interligne</div>
              <select value={lineHeight} onChange={e=>setLineHeight(e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 7px",color:T.text,fontSize:10}}>
                {[["1.0","Simple"],["1.15","1.15"],["1.5","1.5"],["1.8","1.8"],["2.0","Double"],["2.5","2.5 espaces"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <div style={{color:T.textMuted,fontSize:9,fontWeight:700,marginBottom:5,textTransform:"uppercase"}}>Colonnes</div>
              <div style={{display:"flex",gap:4}}>
                {[1,2,3].map(n=>(
                  <button key={n} onClick={()=>setColumns(n)} style={{background:columns===n?"#3B82F622":"transparent",border:`1px solid ${columns===n?"#3B82F6":T.border}`,borderRadius:5,padding:"4px 9px",cursor:"pointer",color:columns===n?"#3B82F6":T.textMuted,fontSize:10,fontWeight:columns===n?700:400}}>{n}</button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4,justifyContent:"flex-end"}}>
              <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",color:T.textMuted,fontSize:10}}>
                <input type="checkbox" checked={pageNumbers} onChange={e=>setPageNumbers(e.target.checked)} style={{cursor:"pointer"}}/>
                Numéros de page
              </label>
            </div>
          </div>
        )}

        {/* Header/Footer */}
        {showHeaderFooter&&(
          <div style={{background:T.surface2,border:`1px solid #EC489944`,borderRadius:9,padding:"10px 14px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{color:"#EC4899",fontWeight:700,fontSize:11}}>H/F</span>
            <div style={{display:"flex",gap:6,alignItems:"center",flex:1}}>
              <span style={{color:T.textMuted,fontSize:10}}>En-tête :</span>
              <input value={headerText} onChange={e=>setHeaderText(e.target.value)} placeholder="Ex: Génie Consultant — Confidentiel" style={{flex:1,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 8px",color:T.text,fontSize:10}}/>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",flex:1}}>
              <span style={{color:T.textMuted,fontSize:10}}>Pied :</span>
              <input value={footerText} onChange={e=>setFooterText(e.target.value)} placeholder="Ex: Page {n} — Document confidentiel" style={{flex:1,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 8px",color:T.text,fontSize:10}}/>
            </div>
            <button onClick={()=>setShowHeaderFooter(false)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:12}}>✕</button>
          </div>
        )}

        {/* Main toolbar */}
        <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 8px",display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          {/* Styles gallery */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowStylesPanel(p=>!p)} style={{background:showStylesPanel?"#22C55E22":"transparent",border:`1px solid ${showStylesPanel?"#22C55E44":T.border}`,borderRadius:5,padding:"3px 9px",cursor:"pointer",color:showStylesPanel?"#22C55E":T.textMuted,fontSize:10,fontWeight:600}}>Styles ▾</button>
            {showStylesPanel&&(
              <div style={{position:"absolute",top:"100%",left:0,zIndex:30,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:8,minWidth:220,boxShadow:"0 6px 24px #0008",display:"flex",flexDirection:"column",gap:3}}>
                {HEADING_STYLES.map(s=>(
                  <button key={s.l} onClick={()=>applyHeadingStyle(s)}
                    style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"5px 10px",cursor:"pointer",textAlign:"left",...s.preview,color:s.preview.color||T.text,margin:0}}>
                    {s.l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{width:1,height:16,background:T.border}}/>

          {/* Font family */}
          <select value={fontFamily} onChange={e=>applyFont(e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 5px",color:T.text,fontSize:10,maxWidth:110}}>
            {FONTS.map(f=><option key={f} value={f}>{f}</option>)}
          </select>
          {/* Font size */}
          <select value={fontSize} onChange={e=>applySize(e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 4px",color:T.text,fontSize:10,width:54}}>
            {FONT_SIZES.map(s=><option key={s} value={s}>{s}pt</option>)}
          </select>
          {/* Color */}
          <label title="Couleur du texte" style={{cursor:"pointer",display:"flex",alignItems:"center",gap:1}}>
            <span style={{fontSize:13,fontWeight:700,color:"#EF4444",textDecoration:"underline",textDecorationColor:"#EF4444"}}>A</span>
            <input type="color" defaultValue="#EF4444" onChange={e=>exec("foreColor",e.target.value)} style={{width:16,height:14,border:"none",cursor:"pointer",padding:0}}/>
          </label>
          <label title="Surbrillance" style={{cursor:"pointer",display:"flex",alignItems:"center",gap:1}}>
            <span style={{fontSize:10,background:"#FBBF24",padding:"0 2px"}}>ab</span>
            <input type="color" defaultValue="#FBBF24" onChange={e=>exec("backColor",e.target.value)} style={{width:16,height:14,border:"none",cursor:"pointer",padding:0}}/>
          </label>
          <div style={{width:1,height:16,background:T.border}}/>

          {/* Format */}
          {FMT_BTNS.map(b=>(
            <button key={b.l} onClick={()=>exec(b.cmd)} title={b.title}
              style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 6px",cursor:"pointer",color:T.text,fontWeight:b.fw||400,fontSize:b.sz||11,fontStyle:b.italic?"italic":"normal",textDecoration:b.ul?"underline":"none",minWidth:22}}>
              {b.l}
            </button>
          ))}
          <div style={{width:1,height:16,background:T.border}}/>
          {ALIGN_BTNS.map(b=>(
            <button key={b.l} onClick={()=>exec(b.cmd)} title={b.title} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 5px",cursor:"pointer",color:T.text,fontSize:11}}>{b.l}</button>
          ))}
          <div style={{width:1,height:16,background:T.border}}/>
          {LIST_BTNS.map(b=>(
            <button key={b.l} onClick={()=>exec(b.cmd)} title={b.title} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 6px",cursor:"pointer",color:T.text,fontSize:11}}>{b.l}</button>
          ))}
          <div style={{width:1,height:16,background:T.border}}/>

          {/* Undo/Redo */}
          <button onClick={()=>exec("undo")} title="Annuler (Ctrl+Z)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",cursor:"pointer",color:T.text,fontSize:13}}>↩</button>
          <button onClick={()=>exec("redo")} title="Rétablir (Ctrl+Y)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",cursor:"pointer",color:T.text,fontSize:13}}>↪</button>
          <div style={{width:1,height:16,background:T.border}}/>

          {/* Insert table */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowInsertTable(p=>!p)} title="Tableau" style={{background:showInsertTable?"#3B82F622":"transparent",border:`1px solid ${showInsertTable?"#3B82F6":T.border}`,borderRadius:5,padding:"3px 7px",cursor:"pointer",color:showInsertTable?"#3B82F6":T.textMuted,fontSize:10}}>⊞ Tableau</button>
            {showInsertTable&&(
              <div style={{position:"absolute",top:28,left:0,zIndex:30,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:"0 6px 24px #0008",padding:12,width:230}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div><label style={{color:T.textDim,fontSize:9}}>Lignes</label><input type="number" value={tableRows} onChange={e=>setTableRows(Math.max(1,Math.min(30,+e.target.value)))} min={1} max={30} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 6px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                  <div><label style={{color:T.textDim,fontSize:9}}>Colonnes</label><input type="number" value={tableCols} onChange={e=>setTableCols(Math.max(1,Math.min(12,+e.target.value)))} min={1} max={12} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 6px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
                </div>
                <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
                  {[["classic","Classique"],["modern","Moderne"],["striped","Rayé"],["minimal","Minimal"]].map(([s,l])=>(
                    <button key={s} onClick={()=>setTableStyle(s)} style={{background:tableStyle===s?"#3B82F622":"transparent",border:`1px solid ${tableStyle===s?"#3B82F6":T.border}`,borderRadius:5,padding:"3px 7px",cursor:"pointer",color:T.textMuted,fontSize:9,flex:1}}>{l}</button>
                  ))}
                </div>
                <button onClick={insertTable} style={{width:"100%",background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",border:"none",color:"#fff",borderRadius:7,padding:"8px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                  Insérer {tableRows}×{tableCols}
                </button>
              </div>
            )}
          </div>

          {/* Insert image */}
          <div style={{position:"relative"}}>
            <button onClick={()=>imageRef.current?.click()} title="Insérer image" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",cursor:"pointer",color:T.textMuted,fontSize:10}}>🖼️ Image</button>
            <input ref={imageRef} type="file" accept="image/*" onChange={insertImage} style={{display:"none"}}/>
          </div>

          {/* Insert elements */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowInsert(p=>!p)} title="Insérer éléments" style={{background:showInsert?"#8B5CF622":"transparent",border:`1px solid ${showInsert?"#8B5CF6":T.border}`,borderRadius:5,padding:"3px 7px",cursor:"pointer",color:showInsert?"#8B5CF6":T.textMuted,fontSize:10}}>⊕ Insérer</button>
            {showInsert&&(
              <div style={{position:"absolute",top:28,left:0,zIndex:30,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:"0 6px 24px #0008",padding:6,width:260,display:"flex",flexDirection:"column",gap:2,maxHeight:360,overflowY:"auto"}}>
                {INSERTS.map(ins=>(
                  <button key={ins.l} onClick={()=>{exec("insertHTML",ins.html);setShowInsert(false);}}
                    style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"5px 9px",cursor:"pointer",color:T.text,fontSize:10,textAlign:"left"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#8B5CF611"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {ins.l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Find/Replace */}
          <button onClick={()=>setShowFindReplace(p=>!p)} title="Rechercher (Ctrl+F)" style={{background:showFindReplace?"#F59E0B22":"transparent",border:`1px solid ${showFindReplace?"#F59E0B44":T.border}`,borderRadius:5,padding:"3px 7px",cursor:"pointer",color:showFindReplace?"#F59E0B":T.textMuted,fontSize:11}}>🔍</button>

          <span style={{marginLeft:"auto",color:T.textDim,fontSize:9,whiteSpace:"nowrap"}}>{wordCount} mots · {charCount} car.</span>
        </div>

        {/* Find/Replace bar */}
        {showFindReplace&&(
          <div style={{display:"flex",gap:6,padding:"6px 10px",background:T.surface2,border:`1px solid #F59E0B44`,borderRadius:7,alignItems:"center"}}>
            <input value={findText} onChange={e=>setFindText(e.target.value)} placeholder="Rechercher…" style={{width:160,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 7px",color:T.text,fontSize:11}}/>
            <input value={replaceText} onChange={e=>setReplaceText(e.target.value)} placeholder="Remplacer par…" style={{width:160,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 7px",color:T.text,fontSize:11}}/>
            <button onClick={()=>{if(findText&&editorRef.current){const hl=`<mark style="background:#FBBF24;padding:0 2px;border-radius:2px;">${findText}</mark>`;editorRef.current.innerHTML=editorRef.current.innerHTML.split(findText).join(replaceText||findText);}}} style={{background:"#F59E0B",border:"none",color:"#fff",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontSize:11}}>Remplacer tout</button>
            <button onClick={()=>setShowFindReplace(false)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:12,marginLeft:"auto"}}>✕</button>
          </div>
        )}

        {/* Page simulation with header/footer */}
        <div style={{flex:1,overflowY:"auto",background:"#64748B",padding:20,borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center"}}>
          {headerText&&<div style={{background:"#fff",width:PAGE_SIZES[pageSize]?.w||"210mm",maxWidth:"100%",padding:"8px 24px",fontSize:"9pt",color:"#999",borderBottom:"1px solid #eee",textAlign:"center",transform:`scale(${zoom/100})`,transformOrigin:"top center",boxSizing:"border-box"}}>{headerText}</div>}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            style={{
              background:"#fff",
              width:PAGE_SIZES[pageSize]?.w||"210mm",
              minHeight:"297mm",
              padding:{normal:"2cm 2.5cm",narrow:"1.27cm",wide:"3cm",moderate:"2cm 1.9cm"}[pageMargin]||"2cm",
              color:"#1a1a1a",
              fontSize:fontSize+"pt",
              lineHeight:lineHeight,
              fontFamily:`${fontFamily},Arial,sans-serif`,
              boxShadow:"0 4px 24px rgba(0,0,0,0.35)",
              outline:"none",
              transform:`scale(${zoom/100})`,
              transformOrigin:"top center",
              boxSizing:"border-box",
              columns:columns>1?columns:undefined,
              columnGap:columns>1?"1.5cm":undefined,
            }}
            onInput={e=>updateCounts(e.target.innerHTML)}
            onPaste={e=>{e.preventDefault();const html=e.clipboardData.getData("text/html")||e.clipboardData.getData("text/plain");exec("insertHTML",html);}}
          />
          {footerText&&<div style={{background:"#fff",width:PAGE_SIZES[pageSize]?.w||"210mm",maxWidth:"100%",padding:"8px 24px",fontSize:"9pt",color:"#999",borderTop:"1px solid #eee",textAlign:"center",transform:`scale(${zoom/100})`,transformOrigin:"bottom center",boxSizing:"border-box"}}>{footerText}</div>}
        </div>

        {/* Footer bar */}
        <div style={{display:"flex",gap:8,alignItems:"center",color:T.textDim,fontSize:9,flexWrap:"wrap"}}>
          {current?.ref&&<span style={{fontFamily:"monospace",color:"#3B82F6",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:4,padding:"1px 6px"}}>{current.ref}</span>}
          <span style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:4,padding:"1px 6px"}}>{PAGE_SIZES[pageSize]?.label?.split(" ")[0]||"A4"}</span>
          <span style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:4,padding:"1px 6px"}}>↕ {lineHeight}</span>
          {columns>1&&<span style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:4,padding:"1px 6px"}}>{columns} colonnes</span>}
          <span style={{marginLeft:"auto"}}>Par : {current?.createdBy||currentUser?.name} · {current&&new Date(current.createdAt).toLocaleDateString("fr-FR")}</span>
        </div>
      </div>
    </div>
  );
}
