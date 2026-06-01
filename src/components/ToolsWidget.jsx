import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../components/Dialog.jsx';
// ToolsWidget — topbar tools, calculatrice, etc.
// SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, playSound, _gcSafeCalc , dsSave } from '../core/index.js';
import { gcToast } from './ToastManager.jsx';
import { Btn, Modal } from './UI.jsx';
import { BudgetRapideApp } from '../modules/bureautique/BudgetRapide.jsx';
export function ToolsWidget({ T, rdvs, setRdvs=_noop, setNotifications=_noop }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState("calc");
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcPrev, setCalcPrev] = useState(null);
  const [calcOp, setCalcOp] = useState(null);
  const [calcReset, setCalcReset] = useState(false);
  const [convFrom, setConvFrom] = useState("XAF");
  const [convTo, setConvTo] = useState("EUR");
  const [convAmount, setConvAmount] = useState("");
  const [convResult, setConvResult] = useState("");
  const [memos, setMemos] = useState(() => {
    try { return JSON.parse(_lsGet("gc-memos") || "[]"); } catch(e) { return []; }
  });
  const [currentMemo, setCurrentMemo] = useState({ id: null, title: "", content: "", plannedDate: "", plannedTime: "", color: "#C41E3A" });
  const [memoSaved, setMemoSaved] = useState(false);
  const [showMemoList, setShowMemoList] = useState(true);
  const [cTab, setCTab] = useState("calc");
  const [cDisplay, setCDisplay] = useState("0");
  const [cExpr, setCExpr] = useState("");
  const [cMem, setCMem] = useState(0);
  const [cHist, setCHist] = useState([]);
  const [tvaHT2, setTvaHT2] = useState(""); const [tvaTx2, setTvaTx2] = useState("18");
  const [cnssBase2, setCnssBase2] = useState(""); const [cnssRes2, setCnssRes2] = useState(null);
  const [conv2From, setConv2From] = useState("XAF");
  const [conv2To, setConv2To] = useState("EUR");
  const [conv2Amt, setConv2Amt] = useState("");
  const [conv2Res, setConv2Res] = useState("");
  const [noteTab, setNoteTab] = useState("list");
  const [noteCategory, setNoteCategory] = useState("all");
  const [noteSearch, setNoteSearch] = useState("");
  const [visFiles, setVisFiles] = useState([]);
  const [visCurrent, setVisCurrent] = useState(null);
  const [visZoom, setVisZoom] = useState(100);
  const ref = useRef(null);
  const visRef2 = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const saveMemos = (newMemos) => {
    setMemos(newMemos);
    try { _lsSet("gc-memos", JSON.stringify(newMemos)); dsSave("gc-memos", newMemos).catch(err => gcToast.syncError('', err)); } catch(e) {}
  };

  const handleSaveMemo = () => {
    if (!currentMemo.content.trim() && !currentMemo.title.trim()) return;
    const now = new Date().toISOString();
    let updated;
    if (currentMemo.id) {
      updated = memos.map(m => m.id === currentMemo.id ? { ...currentMemo, updatedAt: now } : m);
    } else {
      const newMemo = { ...currentMemo, id: `MEMO-${Date.now()}`, createdAt: now, updatedAt: now };
      updated = [newMemo, ...memos];
      setCurrentMemo(c => ({ ...c, id: newMemo.id }));
    }
    saveMemos(updated);
    setMemoSaved(true);
    setTimeout(() => setMemoSaved(false), 2000);
    if (currentMemo.plannedDate && setNotifications) {
      setNotifications(prev => [{ id:"N"+Date.now(), icon:"📝", message:`Mémo planifié : "${currentMemo.title||"Sans titre"}" — ${currentMemo.plannedDate} ${currentMemo.plannedTime||""}`, at: now, read: false }, ...prev]);
      playSound("task");
    }
  };

  const handleDeleteMemo = (id) => {
    saveMemos(memos.filter(m => m.id !== id));
    if (currentMemo.id === id) setCurrentMemo({ id: null, title: "", content: "", plannedDate: "", plannedTime: "", color: "#C41E3A" });
  };

  const handleNewMemo = () => {
    setCurrentMemo({ id: null, title: "", content: "", plannedDate: "", plannedTime: "", color: "#C41E3A" });
    setShowMemoList(false);
  };

  const handleSelectMemo = (m) => {
    setCurrentMemo(m);
    setShowMemoList(false);
  };

  const calcInput = (val) => {
    if (calcReset) { setCalcDisplay(String(val)); setCalcReset(false); return; }
    setCalcDisplay(prev => prev === "0" ? String(val) : prev + val);
  };
  const calcDot = () => {
    if (calcReset) { setCalcDisplay("0."); setCalcReset(false); return; }
    if (!calcDisplay.includes(".")) setCalcDisplay(prev => prev + ".");
  };
  const calcOper = (op) => { setCalcPrev(parseFloat(calcDisplay)); setCalcOp(op); setCalcReset(true); };
  const calcEqual = () => {
    if (calcOp === null || calcPrev === null) return;
    const a = calcPrev, b = parseFloat(calcDisplay);
    let res;
    if (calcOp === "+") res = a + b;
    else if (calcOp === "-") res = a - b;
    else if (calcOp === "×") res = a * b;
    else if (calcOp === "÷") res = b !== 0 ? a / b : "Erreur";
    else if (calcOp === "%") res = a * b / 100;
    setCalcDisplay(typeof res === "number" ? (Number.isInteger(res) ? String(res) : parseFloat(res.toFixed(10)).toString()) : res);
    setCalcPrev(null); setCalcOp(null); setCalcReset(true);
  };
  const calcClear = () => { setCalcDisplay("0"); setCalcPrev(null); setCalcOp(null); setCalcReset(false); };
  const calcToggleSign = () => setCalcDisplay(prev => prev.startsWith("-") ? prev.slice(1) : "-" + prev);

  const RATES = { XAF: 1, EUR: 0.00152, USD: 0.00165, GBP: 0.0013, CHF: 0.00149, MAD: 0.0165, NGN: 2.54, CNY: 0.012 };
  const CURRENCIES = ["XAF","EUR","USD","GBP","CHF","MAD","NGN","CNY"];
  const handleConvert = () => {
    const amt = parseFloat(convAmount);
    if (isNaN(amt)) { setConvResult("Valeur invalide"); return; }
    const inXAF = amt / (RATES[convFrom] || 1);
    const result = inXAF * (RATES[convTo] || 1);
    setConvResult(`${amt.toLocaleString("fr-FR")} ${convFrom} = ${result.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} ${convTo}`);
  };

  const MEMO_COLORS = ["#C41E3A","#3B82F6","#22C55E","#F59E0B","#A855F7","#06B6D4","#EC4899"];

  const tools = [
    { id: "calc", icon: "🧮", label: "Calc Pro" },
    { id: "budget_rapide", icon: "📉", label: "Budget Rapide" },
    { id: "notes", icon: "📝", label: "Mémos & Notes" },
    { id: "visionneuse", icon: "👁️", label: "Visionneuse" },
    { id: "imprimante", icon: "🖨️", label: "Imprimer" },
  ];

  const [writerContent, setWriterContent] = useState("");
  const [writerTitle, setWriterTitle] = useState("Document sans titre");
  const [writerFont, setWriterFont] = useState("Arial");
  const [writerFontSize, setWriterFontSize] = useState(12);
  const [writerBold, setWriterBold] = useState(false);
  const [writerItalic, setWriterItalic] = useState(false);
  const [writerUnderline, setWriterUnderline] = useState(false);
  const [writerAlign, setWriterAlign] = useState("left");
  const writerRef = useRef(null);

  const [tableurRows, setTableurRows] = useState(() => Array.from({length:10}, (_,r) => Array.from({length:6}, (_,c) => ({ v: r===0 ? ["A","B","C","D","E","F"][c] : "", bold: r===0 }))));
  const [tableurSel, setTableurSel] = useState({r:1,c:0});
  const [tableurFormula, setTableurFormula] = useState("");

  const [printers, setPrintersW] = useState(() => {
    try { return JSON.parse(_lsGet("gc-printers")||"null") || [{ id:"PRT-001", name:"HP LaserJet Pro MFP", ip:"192.168.1.100", status:"CONNECTEE" }]; } catch (_) { return []; }
  });
  const [printCopies, setPrintCopies] = useState(1);
  const [printFormat, setPrintFormat] = useState("A4");
  const [printSelectedPrt, setPrintSelectedPrt] = useState(null);

  const execWriter = (cmd, val) => { try { document.execCommand(cmd, false, val); } catch (_) {} };

  const handleTableurKey = (e, r, c) => {
    const cells = tableurRows[r];
    if (e.key === "Enter") { e.preventDefault(); setTableurSel({r:Math.min(r+1,tableurRows.length-1), c}); }
    else if (e.key === "Tab") { e.preventDefault(); setTableurSel({r, c:Math.min(c+1,cells.length-1)}); }
    else if (e.key === "ArrowDown") setTableurSel({r:Math.min(r+1,tableurRows.length-1), c});
    else if (e.key === "ArrowUp") setTableurSel({r:Math.max(r-1,0), c});
    else if (e.key === "ArrowRight") setTableurSel({r, c:Math.min(c+1,cells.length-1)});
    else if (e.key === "ArrowLeft") setTableurSel({r, c:Math.max(c-1,0)});
  };

  const updateCell = (r, c, val) => {
    let computed = val;
    if (val.startsWith("=")) {
      try {
        // FIX v92 Bug#2b — Pas d'eval : parser sécurisé via _gcSafeCalc
        const expr = val.slice(1).replace(/([A-F])(\d+)/gi, (_, col, row) => {
          const ci = "ABCDEF".indexOf(col.toUpperCase());
          const ri = parseInt(row, 10)-1;
          return parseFloat(tableurRows[ri]?.[ci]?.v) || 0;
        });
        const res = _gcSafeCalc(expr);
        computed = res !== null ? String(Math.round(res * 1e10) / 1e10) : "#ERR";
      } catch (_) { computed = "#ERR"; }
    }
    setTableurRows(prev => prev.map((row, ri) => ri===r ? row.map((cell, ci) => ci===c ? {...cell, v: val, computed} : cell) : row));
  };

  const tableurExportCSV = () => {
    const csv = tableurRows.map(row => row.map(c => `"${c.v||""}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="tableur_gc.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const writerExport = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${writerTitle}</title><style>body{font-family:${writerFont};font-size:${writerFontSize}pt;margin:2cm;}</style></head><body><h1>${writerTitle}</h1>${writerRef.current?.innerHTML||writerContent}</body></html>`;
    const blob = new Blob([html], {type:"text/html;charset=utf-8;"}); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`${writerTitle}.html`; a.click(); URL.revokeObjectURL(url);
  };

  const handleQuickPrint = () => {
    if (!printSelectedPrt) { gcAlert("Sélectionnez une imprimante."); return; }
    const prt = printers.find(p=>p.id===printSelectedPrt);
    if (prt?.status !== "CONNECTEE") { gcAlert(`⚠️ ${prt?.name||"Imprimante"} n'est pas disponible.\nVérifiez la connexion réseau.`); return; }
    try {
      const queue = JSON.parse(_lsGet("gc-print-queue")||"[]");
      queue.unshift({ id:`PQ-${Date.now()}`, name:"Document_SI", printer:printSelectedPrt, status:"EN_ATTENTE", copies:printCopies, format:printFormat, addedAt:new Date().toISOString() });
      _lsSet("gc-print-queue", JSON.stringify(queue.slice(0,50)));
    } catch (_) { /* ignore storage errors */ }
    gcAlert(`🖨️ Envoyé à ${prt.name} — ${printCopies} copie(s) — ${printFormat}`);
    setOpen(false);
  };

  const btnStyle = (bg = T.surface3) => ({
    background: bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "9px 0",
    color: T.text, cursor: "pointer", fontSize: 14, fontWeight: 600, textAlign: "center",
    transition: "background 0.15s",
  });

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        title="Outils & Applications"
        style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: T.textMuted, fontSize: 13, display: "flex", alignItems: "center", gap: 6, position: "relative", fontWeight: 700 }}
      >
        <span>🧰</span>
        <span>Outils</span>
      </button>
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{ position: "absolute", right: 0, top: 42, width: tool === "visionneuse" ? 640 : tool === "budget_rapide" ? 720 : (tool === "notes" || tool === "horloge") ? 520 : tool === "calc" ? 340 : 320, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 16px 48px #0009", zIndex: 700, maxHeight:"90vh", overflowY:"auto" }}
        >
          {/* Tabs */}
          <div className="gc-tabs-scroll" style={{ display: "flex", gap: 2, padding: "8px 8px 0", borderBottom: `1px solid ${T.border}`, overflowX:"auto" }}>
            {tools.map(t => (
              <button key={t.id} onClick={() => setTool(t.id)} style={{ flex: "0 0 auto", background: tool === t.id ? "#C41E3A22" : "transparent", border: "none", borderBottom: tool === t.id ? "2px solid #C41E3A" : "2px solid transparent", color: tool === t.id ? "#C41E3A" : T.textMuted, cursor: "pointer", padding: "6px 8px", fontSize: 10, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, whiteSpace:"nowrap" }}>
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div style={{ padding: 12 }}>
            {/* BUDGET RAPIDE */}
            {tool === "budget_rapide" && <BudgetRapideApp T={T} currentUser={{id:"tools",name:"Outils",level:1}} setNotifications={setNotifications} />}

            {/* CALCULATOR */}
            {tool === "calc" && (() => {
              const RATES2 = {XAF:1,EUR:0.001524,USD:0.00169,GBP:0.00133,CNY:0.01224,MAD:0.0165,NGN:2.54};
              const CURRENCIES2 = Object.keys(RATES2);

              const cPress = (v) => {
                if(v==="C"){setCDisplay("0");setCExpr("");return;}
                if(v==="CE"){setCDisplay("0");return;}
                if(v==="±"){setCDisplay(d=>d.startsWith("-")?d.slice(1):"-"+d);return;}
                if(v==="%"){try{setCDisplay(d=>String(parseFloat(d)/100));}catch (_) {}return;}
                if(v==="√"){try{setCDisplay(d=>String(Math.sqrt(parseFloat(d))));}catch (_) {}return;}
                if(v==="x²"){try{setCDisplay(d=>String(Math.pow(parseFloat(d),2)));}catch (_) {}return;}
                if(v==="1/x"){try{const n=parseFloat(cDisplay);setCDisplay(n!==0?String(1/n):"ERR");}catch (_) {}return;}
                if(v==="="){try{
                  // FIX v92 Bug#2d — Remplace eval() par _gcSafeCalc dans la calculatrice
                  const fullExpr = cExpr+(cDisplay==="0"&&cExpr?"":cDisplay);
                  // Normaliser × → * et ÷ → / pour le parser
                  const normalized = fullExpr.replace(/×/g,"*").replace(/÷/g,"/").replace(/\*\*/g,"^");
                  const r = _gcSafeCalc(normalized);
                  if(r===null){setCDisplay("ERR");setCExpr("");return;}
                  const res=String(Number(r.toFixed(10)));
                  setCHist(h=>[`${fullExpr} = ${res}`,...h].slice(0,8));setCDisplay(res);setCExpr("");
                }catch (_) {setCDisplay("ERR");setCExpr("");}return;}
                if(["+","-","×","÷","^"].includes(v)){setCExpr(cExpr+cDisplay+(v==="×"?"*":v==="÷"?"/":v==="^"?"**":v));setCDisplay("0");return;}
                if(v==="MC"){setCMem(0);return;}if(v==="MR"){setCDisplay(String(cMem));return;}if(v==="M+"){setCMem(m=>m+(parseFloat(cDisplay)||0));return;}if(v==="M-"){setCMem(m=>m-(parseFloat(cDisplay)||0));return;}
                if(v==="."){if(!cDisplay.includes("."))setCDisplay(d=>d+".");return;}
                if(v==="⌫"){setCDisplay(d=>d.length>1?d.slice(0,-1):"0");return;}
                setCDisplay(d=>d==="0"?v:d+v);
              };
              const BTNS = [
                [{l:"MR",bg:"#6B708022",c:T.textMuted},{l:"M+",bg:"#6B708022",c:T.textMuted},{l:"M-",bg:"#6B708022",c:T.textMuted},{l:"MC",bg:"#6B708022",c:T.textMuted}],
                [{l:"√",bg:T.surface3},{l:"x²",bg:T.surface3},{l:"1/x",bg:T.surface3},{l:"⌫",bg:"#F59E0B22",c:"#F59E0B"}],
                [{l:"C",bg:"#EF444422",c:"#EF4444"},{l:"CE",bg:"#EF444415",c:"#EF4444"},{l:"%",bg:T.surface3},{l:"÷",bg:"#C9A84C33",c:"#C9A84C"}],
                [{l:"7"},{l:"8"},{l:"9"},{l:"×",bg:"#C9A84C33",c:"#C9A84C"}],
                [{l:"4"},{l:"5"},{l:"6"},{l:"-",bg:"#C9A84C33",c:"#C9A84C"}],
                [{l:"1"},{l:"2"},{l:"3"},{l:"+",bg:"#C9A84C33",c:"#C9A84C"}],
                [{l:"±"},{l:"0"},{l:"."},{l:"=",bg:"#C41E3A",c:"#fff"}],
              ];
              const calcTVA2 = () => {
                const ht=parseFloat(tvaHT2)||0; const tx=parseFloat(tvaTx2)||18;
                return {ht,tva:ht*tx/100,ttc:ht*(1+tx/100)};
              };
              const calcCNSS2 = () => {
                const b=parseFloat(cnssBase2)||0;
                const cnss=b*0.025; const irpp=b>1500000?b*0.35:b>600000?b*0.20:b*0.05;
                setCnssRes2({brut:b,cnss:Math.round(cnss),irpp:Math.round(irpp),net:Math.round(b-cnss-irpp)});
              };
              return (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",gap:2,background:T.surface2,borderRadius:8,padding:3}}>
                    {[["calc","🧮 Calc"],["tva","📊 TVA"],["cnss","👥 CNSS"],["conv","💱 Change"]].map(([t,l])=>(
                      <button key={t} onClick={()=>setCTab(t)} style={{flex:1,background:cTab===t?"#0891B222":"transparent",border:cTab===t?"1px solid #0891B244":"1px solid transparent",borderRadius:6,padding:"4px 0",color:cTab===t?"#0891B2":T.textMuted,cursor:"pointer",fontSize:9,fontWeight:cTab===t?700:400}}>{l}</button>
                    ))}
                  </div>
                  {cTab==="calc"&&(<>
                    <div style={{background:"#050D1A",borderRadius:8,padding:"8px 12px",textAlign:"right"}}>
                      {cExpr&&<div style={{color:"#7A90B0",fontSize:10,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis"}}>{cExpr}</div>}
                      <div style={{color:"#E8EDF5",fontSize:24,fontFamily:"monospace",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis"}}>{cDisplay}</div>
                      {cMem!==0&&<div style={{color:"#C9A84C",fontSize:9}}>M: {cMem}</div>}
                    </div>
                    {BTNS.map((row,i)=>(
                      <div key={i} style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
                        {row.map(b=>(
                          <button key={b.l} onClick={()=>cPress(b.l)} style={{background:b.bg||T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"9px 0",color:b.c||T.text,cursor:"pointer",fontSize:13,fontWeight:600,transition:"all 0.1s"}}>
                            {b.l}
                          </button>
                        ))}
                      </div>
                    ))}
                    {cHist.length>0&&<div style={{background:T.surface2,borderRadius:6,padding:"4px 8px",maxHeight:60,overflowY:"auto"}}>{cHist.map((h,i)=><div key={i} style={{color:T.textDim,fontSize:9,fontFamily:"monospace"}}>{h}</div>)}</div>}
                  </>)}
                  {cTab==="tva"&&(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
                        <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:3}}>Montant HT (FCFA)</label><input value={tvaHT2} onChange={e=>setTvaHT2(e.target.value)} type="number" placeholder="0" style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 8px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
                        <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:3}}>TVA %</label><input value={tvaTx2} onChange={e=>setTvaTx2(e.target.value)} type="number" placeholder="18" style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 8px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
                      </div>
                      {tvaHT2&&(()=>{const r=calcTVA2();return(
                        <div style={{background:"#22C55E15",border:"1px solid #22C55E33",borderRadius:8,padding:"10px 12px"}}>
                          {[["Montant HT",r.ht],["TVA ("+tvaTx2+"%)",r.tva],["Montant TTC",r.ttc]].map(([l,v])=>(
                            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:l==="Montant TTC"?"none":"1px solid #22C55E22"}}>
                              <span style={{color:T.textMuted,fontSize:11}}>{l}</span>
                              <span style={{color:l==="Montant TTC"?"#22C55E":T.text,fontWeight:l==="Montant TTC"?700:400,fontSize:12}}>{Math.round(v).toLocaleString("fr-FR")} FCFA</span>
                            </div>
                          ))}
                        </div>
                      );})()}
                    </div>
                  )}
                  {cTab==="cnss"&&(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <div><label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:3}}>Salaire Brut (FCFA)</label><input value={cnssBase2} onChange={e=>setCnssBase2(e.target.value)} type="number" placeholder="0" style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 8px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
                      <button onClick={calcCNSS2} style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"8px",cursor:"pointer",fontWeight:700,fontSize:12}}>Calculer charges salariales</button>
                      {cnssRes2&&(
                        <div style={{background:"#3B82F615",border:"1px solid #3B82F633",borderRadius:8,padding:"10px 12px"}}>
                          {[["Salaire Brut",cnssRes2.brut],["CNSS (2.5%)",cnssRes2.cnss],["IRPP estimé",cnssRes2.irpp],["Salaire Net",cnssRes2.net]].map(([l,v])=>(
                            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}>
                              <span style={{color:T.textMuted,fontSize:11}}>{l}</span>
                              <span style={{color:l==="Salaire Net"?"#3B82F6":T.text,fontWeight:l==="Salaire Net"?700:400,fontSize:12}}>{Math.round(v).toLocaleString("fr-FR")} FCFA</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {cTab==="conv"&&(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <input value={conv2Amt} onChange={e=>setConv2Amt(e.target.value)} type="number" placeholder="Montant" style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:13}}/>
                      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:6,alignItems:"center"}}>
                        <select value={conv2From} onChange={e=>setConv2From(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 6px",color:T.text,fontSize:12}}>{CURRENCIES2.map(c=><option key={c} value={c}>{c}</option>)}</select>
                        <span style={{color:T.textMuted,fontSize:16}}>⇄</span>
                        <select value={conv2To} onChange={e=>setConv2To(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 6px",color:T.text,fontSize:12}}>{CURRENCIES2.map(c=><option key={c} value={c}>{c}</option>)}</select>
                      </div>
                      <button onClick={()=>{const a=parseFloat(conv2Amt);if(!isNaN(a)){const inXAF=a/(RATES2[conv2From]||1);const res=inXAF*(RATES2[conv2To]||1);setConv2Res(`${a.toLocaleString("fr-FR")} ${conv2From} = ${res.toLocaleString("fr-FR",{maximumFractionDigits:4})} ${conv2To}`);}}} style={{background:"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"9px",cursor:"pointer",fontWeight:700,fontSize:12}}>Convertir</button>
                      {conv2Res&&<div style={{background:"#22C55E22",border:"1px solid #22C55E55",borderRadius:7,padding:"8px 10px",color:"#22C55E",fontSize:12,fontWeight:600}}>{conv2Res}</div>}
                      <div style={{color:T.textDim,fontSize:9,textAlign:"center"}}>Taux indicatifs — XAF (FCFA) de référence</div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* CURRENCY CONVERTER */}
            {tool === "devises" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 10, color: T.textMuted, background: T.surface2, borderRadius: 6, padding: "6px 8px" }}>
                  💡 Taux indicatifs — XAF (FCFA) comme devise de référence
                </div>
                <input value={convAmount} onChange={e => setConvAmount(e.target.value)} placeholder="Montant" type="number" style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 10px", color: T.text, fontSize: 13 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center" }}>
                  <select value={convFrom} onChange={e => setConvFrom(e.target.value)} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 6px", color: T.text, fontSize: 12 }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span style={{ color: T.textMuted, fontSize: 16 }}>→</span>
                  <select value={convTo} onChange={e => setConvTo(e.target.value)} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 6px", color: T.text, fontSize: 12 }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={handleConvert} style={{ background: "#C41E3A", border: "none", color: "#fff", borderRadius: 7, padding: "9px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Convertir</button>
                {convResult && <div style={{ background: "#22C55E22", border: "1px solid #22C55E55", borderRadius: 7, padding: "8px 10px", color: "#22C55E", fontSize: 12, fontWeight: 600 }}>{convResult}</div>}
              </div>
            )}

            {/* ENHANCED MEMO SYSTEM */}
            {tool === "notes" && (() => {
              const NOTE_CATS = ["MÉMO","NOTE","TÂCHE","IDÉE","RAPPEL","IMPORTANT"];
              const NOTE_PRIOS = [{v:"HAUTE",c:"#EF4444"},{v:"MOYENNE",c:"#F59E0B"},{v:"NORMALE",c:"#3B82F6"}];
              const allNotes = memos;
              const filteredNotes = allNotes.filter(m=>
                (noteCategory==="all"||m.category===noteCategory)&&
                (!noteSearch||(m.title+m.content).toLowerCase().includes(noteSearch.toLowerCase()))
              ).sort((a,b)=>{
                const po=["HAUTE","MOYENNE","NORMALE"];
                return (po.indexOf(a.priority||"NORMALE"))-(po.indexOf(b.priority||"NORMALE"));
              });
              return (
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {/* Header */}
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{color:"#C41E3A",fontWeight:800,fontSize:12,flex:1}}>📝 Mémos & Notes</span>
                    <span style={{background:"#C41E3A22",color:"#C41E3A",borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>{allNotes.length}</span>
                  </div>
                  {/* Sub-tabs */}
                  <div style={{display:"flex",gap:3,background:T.surface2,borderRadius:8,padding:3}}>
                    {[["list","📋 Liste"],["edit","✏️ Rédiger"],["search","🔍"]].map(([t,l])=>(
                      <button key={t} onClick={()=>setNoteTab(t)} style={{flex:1,background:noteTab===t?"#C41E3A22":"transparent",border:noteTab===t?"1px solid #C41E3A44":"1px solid transparent",borderRadius:6,padding:"4px 0",color:noteTab===t?"#C41E3A":T.textMuted,cursor:"pointer",fontSize:10,fontWeight:noteTab===t?700:400}}>{l}</button>
                    ))}
                    <button onClick={()=>{setCurrentMemo({id:null,title:"",content:"",plannedDate:"",plannedTime:"",color:"#C41E3A",category:"MÉMO",priority:"NORMALE",tags:""});setNoteTab("edit");}} style={{background:"#C41E3A",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:800}}>+</button>
                  </div>
                  {noteTab==="search"&&<input value={noteSearch} onChange={e=>setNoteSearch(e.target.value)} autoFocus placeholder="🔍 Rechercher dans vos notes…" style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}}/>}
                  {/* Category filter */}
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {["all",...NOTE_CATS].map(c=>(
                      <button key={c} onClick={()=>setNoteCategory(c)} style={{background:noteCategory===c?"#C41E3A22":"transparent",border:`1px solid ${noteCategory===c?"#C41E3A44":T.border}`,borderRadius:5,padding:"2px 6px",color:noteCategory===c?"#C41E3A":T.textMuted,cursor:"pointer",fontSize:9,fontWeight:noteCategory===c?700:400}}>{c==="all"?"Tout":c}</button>
                    ))}
                  </div>
                  {/* List view */}
                  {noteTab!=="edit" && (
                    <div style={{maxHeight:280,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                      {filteredNotes.length===0&&<div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:"20px 0"}}>Aucune note</div>}
                      {filteredNotes.map(m=>{
                        const prio=NOTE_PRIOS.find(p=>p.v===(m.priority||"NORMALE"))||NOTE_PRIOS[2];
                        return (
                          <div key={m.id} style={{background:T.surface2,border:`2px solid ${m.color||"#C41E3A"}33`,borderRadius:8,padding:"8px 10px",cursor:"pointer",position:"relative"}}
                               onClick={()=>{setCurrentMemo(m);setShowMemoList(false);setNoteTab("edit");}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                              <span style={{color:m.color||"#C41E3A",fontWeight:700,fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title||"Sans titre"}</span>
                              <span style={{background:prio.c+"22",color:prio.c,borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700,marginLeft:4}}>{m.priority||"NORMALE"}</span>
                            </div>
                            <div style={{display:"flex",gap:5,marginBottom:3}}>
                              <span style={{background:"#C41E3A22",color:"#C41E3A",borderRadius:3,padding:"1px 5px",fontSize:8}}>{m.category||"MÉMO"}</span>
                              {m.tags&&m.tags.split(",").slice(0,2).map(t=><span key={t} style={{background:T.surface3,color:T.textMuted,borderRadius:3,padding:"1px 5px",fontSize:8}}>{t.trim()}</span>)}
                            </div>
                            <div style={{color:T.textMuted,fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.content.slice(0,55)}{m.content.length>55?"…":""}</div>
                            {m.plannedDate&&<div style={{color:"#F59E0B",fontSize:9,marginTop:2}}>📅 {m.plannedDate} {m.plannedTime||""}</div>}
                            <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center"}}>
                              <span style={{color:T.textDim,fontSize:8}}>{new Date(m.updatedAt||m.createdAt).toLocaleDateString("fr-FR")}</span>
                              <button onClick={e=>{e.stopPropagation();handleDeleteMemo(m.id);}} style={{marginLeft:"auto",background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:11,padding:2}}>🗑️</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Edit view */}
                  {noteTab==="edit"&&(
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <input value={currentMemo.title} onChange={e=>setCurrentMemo(c=>({...c,title:e.target.value}))} placeholder="Titre…" style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12,fontWeight:700}}/>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                        <select value={currentMemo.category||"MÉMO"} onChange={e=>setCurrentMemo(c=>({...c,category:e.target.value}))} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11}}>
                          {NOTE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={currentMemo.priority||"NORMALE"} onChange={e=>setCurrentMemo(c=>({...c,priority:e.target.value}))} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11}}>
                          {NOTE_PRIOS.map(p=><option key={p.v} value={p.v}>{p.v}</option>)}
                        </select>
                      </div>
                      <textarea value={currentMemo.content} onChange={e=>{setCurrentMemo(c=>({...c,content:e.target.value}));setMemoSaved(false);}} placeholder="Contenu…" rows={5} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,resize:"none",fontFamily:"inherit"}}/>
                      <input value={currentMemo.tags||""} onChange={e=>setCurrentMemo(c=>({...c,tags:e.target.value}))} placeholder="Tags (virgule) : urgent, client, 2026" style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11}}/>
                      <div style={{background:T.surface3,borderRadius:7,padding:"7px 10px"}}>
                        <div style={{color:T.textMuted,fontSize:9,fontWeight:700,marginBottom:5,textTransform:"uppercase"}}>📅 Planification</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                          <input type="date" value={currentMemo.plannedDate} onChange={e=>setCurrentMemo(c=>({...c,plannedDate:e.target.value}))} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11}}/>
                          <input type="time" value={currentMemo.plannedTime} onChange={e=>setCurrentMemo(c=>({...c,plannedTime:e.target.value}))} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11}}/>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{color:T.textDim,fontSize:9}}>Couleur :</span>
                        {MEMO_COLORS.map(c=><button key={c} onClick={()=>setCurrentMemo(cm=>({...cm,color:c}))} style={{width:16,height:16,borderRadius:"50%",background:c,border:currentMemo.color===c?"2px solid #fff":"1px solid transparent",cursor:"pointer",padding:0}}/>)}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={handleSaveMemo} style={{flex:1,background:memoSaved?"#22C55E":"#C41E3A",border:"none",color:"#fff",borderRadius:7,padding:"8px",cursor:"pointer",fontWeight:700,fontSize:12,transition:"background 0.3s"}}>
                          {memoSaved?"✅ Sauvegardé":"💾 Sauvegarder"}
                        </button>
                        <button onClick={()=>setNoteTab("list")} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"8px 10px",cursor:"pointer",fontSize:12}}>📋</button>
                        {currentMemo.id&&<button onClick={()=>handleDeleteMemo(currentMemo.id)} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"8px 10px",cursor:"pointer",fontSize:12}}>🗑️</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── VISIONNEUSE DOCUMENTS (TOOLBOX) ── */}
            {tool === "visionneuse" && (() => {
              const handleVisFile = (e) => {
                const newF = Array.from(e.target.files||[]).map(f=>({id:"V"+Date.now()+Math.random(),name:f.name,url:URL.createObjectURL(f),type:f.name.split(".").pop().toUpperCase(),size:(f.size/1024).toFixed(0)+"Ko"}));
                setVisFiles(p=>[...newF,...p]);
                if(newF.length>0) setVisCurrent(newF[0]);
                e.target.value="";
              };
              const IMG_TYPES = ["PNG","JPG","JPEG","GIF","WEBP","SVG","BMP"];
              return (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{color:"#EF4444",fontWeight:800,fontSize:12,flex:1}}>👁️ Visionneuse Universelle</span>
                    <button onClick={()=>visRef2.current?.click()} style={{background:"#EF4444",border:"none",color:"#fff",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontSize:11}}>📂 Ouvrir</button>
                    <input ref={visRef2} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.csv" multiple onChange={handleVisFile} style={{display:"none"}}/>
                  </div>
                  {visFiles.length>0&&(
                    <div style={{display:"flex",gap:3,overflowX:"auto",paddingBottom:4}}>
                      {visFiles.map(f=>(
                        <button key={f.id} onClick={()=>setVisCurrent(f)} title={f.name} style={{flexShrink:0,background:visCurrent?.id===f.id?"#EF444422":T.surface2,border:`1px solid ${visCurrent?.id===f.id?"#EF444466":T.border}`,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:9,color:visCurrent?.id===f.id?"#EF4444":T.textMuted,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {f.type==="PDF"?"📄":IMG_TYPES.includes(f.type)?"🖼️":"📝"} {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {visCurrent?(
                    <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",background:T.surface2}}>
                      <div style={{display:"flex",gap:4,padding:"5px 8px",borderBottom:`1px solid ${T.border}`,alignItems:"center",background:T.surface3}}>
                        <span style={{flex:1,fontSize:9,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{visCurrent.name}</span>
                        <button onClick={()=>setVisZoom(z=>Math.min(z+20,200))} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.text,borderRadius:4,padding:"1px 6px",cursor:"pointer",fontSize:11}}>+</button>
                        <span style={{color:T.textMuted,fontSize:9,minWidth:30,textAlign:"center"}}>{visZoom}%</span>
                        <button onClick={()=>setVisZoom(z=>Math.max(z-20,40))} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.text,borderRadius:4,padding:"1px 6px",cursor:"pointer",fontSize:11}}>−</button>
                        <button onClick={()=>{const a=document.createElement("a");a.href=visCurrent.url;a.download=visCurrent.name;a.click();}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontWeight:700,fontSize:10}}>⬇</button>
                        <button onClick={()=>{setVisFiles(p=>p.filter(f=>f.id!==visCurrent.id));setVisCurrent(null);}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12}}>✕</button>
                      </div>
                      <div style={{overflow:"auto",maxHeight:320,padding:8,display:"flex",justifyContent:"center",alignItems:"flex-start"}}>
                        {visCurrent.type==="PDF"?
                          <iframe src={visCurrent.url} style={{width:`${visZoom}%`,minHeight:280,border:"none",borderRadius:4}} title={visCurrent.name}/>:
                          IMG_TYPES.includes(visCurrent.type)?
                          <img src={visCurrent.url} alt={visCurrent.name} style={{maxWidth:`${visZoom}%`,borderRadius:6,boxShadow:"0 4px 16px #0006"}}/>:
                          visCurrent.type==="TXT"||visCurrent.type==="MD"||visCurrent.type==="CSV"?
                          <iframe src={visCurrent.url} style={{width:"100%",minHeight:280,border:"none",background:"#fff",borderRadius:4}} title={visCurrent.name}/>:
                          <div style={{color:T.textMuted,textAlign:"center",padding:30,fontSize:12}}>
                            <div style={{fontSize:32,marginBottom:8}}>📎</div>
                            <div>{visCurrent.name}</div>
                            <div style={{color:T.textDim,fontSize:10,marginTop:4}}>{visCurrent.size}</div>
                            <button onClick={()=>{const a=document.createElement("a");a.href=visCurrent.url;a.download=visCurrent.name;a.click();}} style={{marginTop:10,background:"#3B82F6",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>⬇ Télécharger</button>
                          </div>
                        }
                      </div>
                    </div>
                  ):(
                    <div style={{textAlign:"center",padding:"30px 20px",color:T.textDim,fontSize:11}}>
                      <div style={{fontSize:36,marginBottom:8}}>👁️</div>
                      <div>Ouvrez un fichier pour le visualiser</div>
                      <div style={{fontSize:9,marginTop:4}}>PDF · Images · Documents · Texte</div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── IMPRIMANTE RAPIDE ── */}
            {tool === "imprimante" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ color:T.text, fontSize:12, fontWeight:700 }}>🖨️ Impression rapide réseau</div>
                {printers.length === 0 ? (
                  <div style={{ color:T.textMuted, fontSize:11, background:T.surface2, borderRadius:8, padding:12, textAlign:"center" }}>
                    Aucune imprimante configurée.<br/>Demandez au Responsable SI d'en ajouter dans <strong>Paramètres SI → Imprimante</strong>.
                  </div>
                ) : (
                  <>
                    <div>
                      <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:4, fontWeight:700, textTransform:"uppercase" }}>Imprimante</label>
                      {printers.map(p => (
                        <button key={p.id} onClick={()=>setPrintSelectedPrt(p.id)} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", background:printSelectedPrt===p.id?"#22C55E15":"transparent", border:`1px solid ${printSelectedPrt===p.id?"#22C55E44":T.border}`, borderRadius:8, padding:"8px 12px", cursor:"pointer", marginBottom:4, transition:"all 0.15s" }}>
                          <span style={{ fontSize:20 }}>🖨️</span>
                          <div style={{ flex:1, textAlign:"left" }}>
                            <div style={{ color:T.text, fontSize:11, fontWeight:600 }}>{p.name}</div>
                            <div style={{ color:T.textDim, fontSize:9, fontFamily:"monospace" }}>{p.ip} — <span style={{ color:p.status==="CONNECTEE"?"#22C55E":"#EF4444" }}>{p.status==="CONNECTEE"?"●":"○"} {p.status}</span></div>
                          </div>
                          {printSelectedPrt===p.id && <span style={{ color:"#22C55E", fontSize:14 }}>✓</span>}
                        </button>
                      ))}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      <div>
                        <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:3, fontWeight:700 }}>Copies</label>
                        <input type="number" min={1} max={99} value={printCopies} onChange={e=>setPrintCopies(+e.target.value)} style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:"6px 8px", color:T.text, fontSize:12, boxSizing:"border-box" }} />
                      </div>
                      <div>
                        <label style={{ color:T.textMuted, fontSize:10, display:"block", marginBottom:3, fontWeight:700 }}>Format</label>
                        <select value={printFormat} onChange={e=>setPrintFormat(e.target.value)} style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:"6px 8px", color:T.text, fontSize:12 }}>
                          {["A4","A3","A5","Letter"].map(f=><option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    </div>
                    <button onClick={handleQuickPrint} disabled={!printSelectedPrt} style={{ background:printSelectedPrt?"linear-gradient(135deg,#C41E3A,#E02244)":"#33333333", border:"none", color:printSelectedPrt?"#fff":"#666", borderRadius:8, padding:"10px", cursor:printSelectedPrt?"pointer":"not-allowed", fontWeight:700, fontSize:12 }}>
                      🖨️ Envoyer à l'imprimante
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

