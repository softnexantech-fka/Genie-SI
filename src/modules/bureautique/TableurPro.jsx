import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// TableurPro.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, _gcSafeCalc, dsSave } from '../../core/index.js';
import { useRemoteSync } from '../../hooks/useSyncedState.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';

export function TableurPro({ T, currentUser, setNotifications=_noop, AppHeader=null }){
  if (!AppHeader) AppHeader = ({icon,title,color}) => (
    <div style={{background:color+'22',borderLeft:'4px solid '+color,padding:'8px 16px',marginBottom:12,fontWeight:700,fontSize:13,color:color}}>{icon} {title}</div>
  );
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const getColLetter = (n) => n < 26 ? ALPHA[n] : ALPHA[Math.floor(n/26)-1]+ALPHA[n%26];
  const getColLetters = (n) => Array.from({length:n},(_,i)=>getColLetter(i));
  const ROWS = 100, DEF_COLS = 26;
  const mkCell = () => ({v:"",bold:false,italic:false,underline:false,strike:false,align:"left",valign:"middle",bg:"",color:"",formula:"",fmt:"",border:"none",fontSize:11,wrap:false,merged:false,mergeRef:null});
  const mkRow = (n) => Array.from({length:n},mkCell);
  const mkEmpty = (nc=DEF_COLS) => Array.from({length:ROWS},()=>mkRow(nc));

  // ── State ──────────────────────────────────────────────────────────────────
  const _tableurKey = `gc-tableur-pro:${currentUser?.id||'default'}`;
  const [sheets, setSheets] = React.useState(()=>{
    try{const s=JSON.parse(_lsGet(_tableurKey)||_lsGet("gc-tableur-pro")||"null");
      return s||[{id:"s1",name:"Feuil1",data:mkEmpty(),colW:{},rowH:{},merges:[],conds:[],namedRanges:{}},
                 {id:"s2",name:"Feuil2",data:mkEmpty(),colW:{},rowH:{},merges:[],conds:[],namedRanges:{}}];}
    catch(_){return [{id:"s1",name:"Feuil1",data:mkEmpty(),colW:{},rowH:{},merges:[],conds:[],namedRanges:{}}];}
  });
  const [activeSheet, setActiveSheet] = React.useState("s1");
  const sheet = sheets.find(s=>s.id===activeSheet)||sheets[0];
  const data = sheet?.data||mkEmpty();
  const colW = sheet?.colW||{};
  const rowH = sheet?.rowH||{};
  const merges = sheet?.merges||[];
  const conds = sheet?.conds||[];
  const COLS = getColLetters(Math.max(DEF_COLS, data[0]?.length||DEF_COLS));

  const [sel, setSel] = React.useState({r:0,c:0});
  const [selRange, setSelRange] = React.useState(null);
  const [rangeStart, setRangeStart] = React.useState(null);
  const [editVal, setEditVal] = React.useState("");
  const [isEditing, setIsEditing] = React.useState(false);
  const [renaming, setRenaming] = React.useState(null);
  const [findText, setFindText] = React.useState(""); const [replText, setReplText] = React.useState(""); const [showFind, setShowFind] = React.useState(false);
  const [showFxMenu, setShowFxMenu] = React.useState(false);
  const [showBorderMenu, setShowBorderMenu] = React.useState(false);
  const [showChartModal, setShowChartModal] = React.useState(false);
  const [chartType, setChartType] = React.useState("bar");
  const [charts, setCharts] = React.useState([]);
  const [clipboard, setClipboard] = React.useState(null);
  const [showFmtMenu, setShowFmtMenu] = React.useState(false);
  const [frozenRows, setFrozenRows] = React.useState(0);
  const [frozenCols, setFrozenCols] = React.useState(0);
  const [sortAsc, setSortAsc] = React.useState(true);
  const [undoStack, setUndoStack] = React.useState([]);
  const [redoStack, setRedoStack] = React.useState([]);
  const [showCondFmt, setShowCondFmt] = React.useState(false);
  const [condForm, setCondForm] = React.useState({op:">",val:"",color:"#EF4444",bg:"#FEF2F2"});
  const [showValidation, setShowValidation] = React.useState(false);
  const [validForm, setValidForm] = React.useState({type:"list",list:"",min:"",max:""});
  const [cellValidations, setCellValidations] = React.useState({});
  const [fxSuggest, setFxSuggest] = React.useState([]);
  const [svgChart, setSvgChart] = React.useState(null);
  const [resizingCol, setResizingCol] = React.useState(null);
  const [resizingRow, setResizingRow] = React.useState(null);
  const [resizeStart, setResizeStart] = React.useState(null);
  const [showContextMenu, setShowContextMenu] = React.useState(null);
  const [showMergeHint, setShowMergeHint] = React.useState(false);
  const [zoom, setZoom] = React.useState(100);
  const gridRef = React.useRef(null);
  const inputRef = React.useRef(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  useRemoteSync({[_tableurKey]: setSheets});
  const saveSheets = (s) => {
    setSheets(s);
    try{
      const trimmed = s.map(sh=>({...sh,data:sh.data.map(row=>row.map(c=>c.v||c.formula||c.bold||c.italic||c.bg||c.color||c.fmt?c:{v:""}))}));
      _lsSet(_tableurKey,JSON.stringify(trimmed));
      dsSave(_tableurKey,trimmed).catch(()=>{});
    }catch(_){}
  };
  const pushUndo = (snapshot) => {
    setUndoStack(u=>[...u.slice(-29),snapshot]);
    setRedoStack([]);
  };
  const undo = () => {
    if(!undoStack.length) return;
    const prev=undoStack[undoStack.length-1];
    setUndoStack(u=>u.slice(0,-1));
    const cur=sheet.data.map(r=>r.map(c=>({...c})));
    setRedoStack(s=>[...s,cur]);
    setSheets(s=>{ const n=s.map(sh=>sh.id===activeSheet?{...sh,data:prev}:sh); saveSheets(n); return n; });
  };
  const redo = () => {
    if(!redoStack.length) return;
    const next=redoStack[redoStack.length-1];
    setRedoStack(s=>s.slice(0,-1));
    const cur=sheet.data.map(r=>r.map(c=>({...c})));
    setUndoStack(s=>[...s,cur]);
    setSheets(s=>{ const n=s.map(sh=>sh.id===activeSheet?{...sh,data:next}:sh); saveSheets(n); return n; });
  };

  // ── Formula engine ──────────────────────────────────────────────────────
  const evalFormula = React.useCallback((formula, d) => {
    if(!formula||!formula.startsWith("=")) return formula||"";
    try {
      let expr = formula.slice(1).toUpperCase();
      const getRange = (c1,r1,c2,r2) => {
        const vals=[];
        for(let rr=parseInt(r1,10)-1;rr<=parseInt(r2,10)-1;rr++)
          for(let cc=COLS.indexOf(c1);cc<=COLS.indexOf(c2);cc++){
            const cell=d[rr]?.[cc];
            const v=parseFloat(cell?.formula?evalFormula(cell.formula,d):cell?.v);
            if(!isNaN(v)) vals.push(v);
          }
        return vals;
      };
      const getStrings = (c1,r1,c2,r2) => {
        const vals=[];
        for(let rr=parseInt(r1,10)-1;rr<=parseInt(r2,10)-1;rr++)
          for(let cc=COLS.indexOf(c1);cc<=COLS.indexOf(c2);cc++){
            const cell=d[rr]?.[cc];
            vals.push(cell?.formula?evalFormula(cell.formula,d):(cell?.v||""));
          }
        return vals;
      };
      // Range functions
      expr=expr.replace(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g,(_,c1,r1,c2,r2)=>getRange(c1,r1,c2,r2).reduce((a,v)=>a+v,0));
      expr=expr.replace(/(?:AVERAGE|AVG)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g,(_,c1,r1,c2,r2)=>{const v=getRange(c1,r1,c2,r2);return v.length?v.reduce((a,x)=>a+x,0)/v.length:0;});
      expr=expr.replace(/MAX\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g,(_,c1,r1,c2,r2)=>{const v=getRange(c1,r1,c2,r2);return v.length?Math.max(...v):0;});
      expr=expr.replace(/MIN\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g,(_,c1,r1,c2,r2)=>{const v=getRange(c1,r1,c2,r2);return v.length?Math.min(...v):0;});
      expr=expr.replace(/COUNT\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g,(_,c1,r1,c2,r2)=>getRange(c1,r1,c2,r2).length);
      expr=expr.replace(/COUNTA\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g,(_,c1,r1,c2,r2)=>getStrings(c1,r1,c2,r2).filter(v=>v!=="").length);
      expr=expr.replace(/COUNTIF\(([A-Z]+)(\d+):([A-Z]+)(\d+),(.+)\)/g,(_,c1,r1,c2,r2,crit)=>{
        const val=crit.trim().replace(/['"]/g,"");
        return getStrings(c1,r1,c2,r2).filter(v=>String(v)===val).length;
      });
      expr=expr.replace(/SUMIF\(([A-Z]+)(\d+):([A-Z]+)(\d+),(.+),([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g,(_,c1,r1,c2,r2,crit,cs1,rs1,cs2,rs2)=>{
        const strs=getStrings(c1,r1,c2,r2);
        const nums=getRange(cs1,rs1,cs2,rs2);
        const val=crit.trim().replace(/['"]/g,"");
        return strs.reduce((s,v,i)=>String(v)===val?s+(nums[i]||0):s,0);
      });
      expr=expr.replace(/STDEV\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g,(_,c1,r1,c2,r2)=>{const v=getRange(c1,r1,c2,r2);if(!v.length)return 0;const m=v.reduce((a,x)=>a+x,0)/v.length;return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/v.length);});
      expr=expr.replace(/MEDIAN\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g,(_,c1,r1,c2,r2)=>{const v=[...getRange(c1,r1,c2,r2)].sort((a,b)=>a-b);const mid=Math.floor(v.length/2);return v.length?v.length%2?v[mid]:(v[mid-1]+v[mid])/2:0;});
      // Text functions
      expr=expr.replace(/CONCATENATE\(([^)]+)\)/g,(_,args)=>args.split(",").map(a=>{const m=a.trim().match(/^([A-Z]+)(\d+)$/);if(m){const ci=COLS.indexOf(m[1]),ri=parseInt(m[2],10)-1;const cell=d[ri]?.[ci];return cell?.formula?evalFormula(cell.formula,d):(cell?.v||"");}return a.replace(/['"]/g,"");}).join(""));
      expr=expr.replace(/LEN\(([A-Z]+)(\d+)\)/g,(_,col,row)=>{const ci=COLS.indexOf(col),ri=parseInt(row,10)-1;return String(d[ri]?.[ci]?.v||"").length;});
      expr=expr.replace(/UPPER\(([A-Z]+)(\d+)\)/g,(_,col,row)=>{const ci=COLS.indexOf(col),ri=parseInt(row,10)-1;return String(d[ri]?.[ci]?.v||"").toUpperCase();});
      expr=expr.replace(/LOWER\(([A-Z]+)(\d+)\)/g,(_,col,row)=>{const ci=COLS.indexOf(col),ri=parseInt(row,10)-1;return String(d[ri]?.[ci]?.v||"").toLowerCase();});
      // Math functions
      expr=expr.replace(/ROUND\((.+?),(\d+)\)/g,(_,val,dec)=>{const v=parseFloat(evalFormula("="+val,d));return isNaN(v)?0:+v.toFixed(parseInt(dec,10));});
      expr=expr.replace(/ABS\((.+?)\)/g,(_,val)=>Math.abs(parseFloat(evalFormula("="+val,d))||0));
      expr=expr.replace(/SQRT\((.+?)\)/g,(_,val)=>Math.sqrt(Math.abs(parseFloat(evalFormula("="+val,d))||0)));
      expr=expr.replace(/POWER\((.+?),(.+?)\)/g,(_,b,e)=>Math.pow(parseFloat(b)||0,parseFloat(e)||0));
      expr=expr.replace(/INT\((.+?)\)/g,(_,val)=>Math.floor(parseFloat(evalFormula("="+val,d))||0));
      expr=expr.replace(/MOD\((.+?),(.+?)\)/g,(_,a,b)=>((parseFloat(a)||0)%(parseFloat(b)||1)));
      // Logic
      expr=expr.replace(/IF\((.+),(.+),(.+)\)/g,(_,cond,vt,vf)=>{
        try{const c=cond.replace(/([A-Z]+)(\d+)/g,(_,col,row)=>parseFloat(d[parseInt(row,10)-1]?.[COLS.indexOf(col)]?.v)||0);
          const res=_gcSafeCalc(c); return(res!==null&&res!==0)?vt:vf;}catch(_){return "#ERR";}
      });
      expr=expr.replace(/IFERROR\((.+?),(.+?)\)/g,(_,expr2,fallback)=>{try{const r=evalFormula("="+expr2,d);return r==="#ERR"?fallback:r;}catch(_){return fallback;}});
      expr=expr.replace(/([A-Z]+)(\d+)/g,(_,col,row)=>{
        const ci=COLS.indexOf(col),ri=parseInt(row,10)-1;
        if(ci<0||ri<0) return "0";
        const cell=d[ri]?.[ci];
        return parseFloat(cell?.formula?evalFormula(cell.formula,d):cell?.v)||0;
      });
      const result=_gcSafeCalc(expr);
      if(result===null) return "#ERR";
      return isNaN(result)?String(result):String(+Number(result).toFixed(10));
    }catch(_){return "#ERR";}
  },[COLS]);

  // Formula autocomplete
  const FX_LIST = ["SUM(","AVERAGE(","MAX(","MIN(","COUNT(","COUNTA(","COUNTIF(","SUMIF(","STDEV(","MEDIAN(","ROUND(","ABS(","SQRT(","POWER(","INT(","MOD(","IF(","IFERROR(","CONCATENATE(","LEN(","UPPER(","LOWER("];
  const updateFxSuggest = (val) => {
    if(!val.startsWith("=")) { setFxSuggest([]); return; }
    const txt=val.slice(1).toUpperCase();
    const lastWord=txt.split(/[^A-Z]/).pop();
    if(lastWord.length>=2) setFxSuggest(FX_LIST.filter(f=>f.startsWith(lastWord)).slice(0,6));
    else setFxSuggest([]);
  };

  // ── Display ───────────────────────────────────────────────────────────────
  const getDisplay = (cell,r,c,d) => {
    const raw = cell?.formula?evalFormula(cell.formula,d):(cell?.v||"");
    if(!cell?.fmt||raw===""||isNaN(parseFloat(raw))) return raw;
    const n=parseFloat(raw);
    if(cell.fmt==="pct") return (n*100).toFixed(1)+"%";
    if(cell.fmt==="pct2") return n.toFixed(1)+"%";
    if(cell.fmt==="fcfa") return n.toLocaleString("fr-FR")+" FCFA";
    if(cell.fmt==="kfcfa") return (n/1000).toFixed(1)+"k FCFA";
    if(cell.fmt==="mfcfa") return (n/1000000).toFixed(2)+"M FCFA";
    if(cell.fmt==="num2") return n.toFixed(2);
    if(cell.fmt==="num0") return Math.round(n).toLocaleString("fr-FR");
    if(cell.fmt==="sep") return n.toLocaleString("fr-FR");
    if(cell.fmt==="date"){try{return new Date(raw).toLocaleDateString("fr-FR");}catch(_){return raw;}}
    if(cell.fmt==="datetime"){try{return new Date(raw).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch(_){return raw;}}
    return raw;
  };

  // Conditional formatting
  const getCellCondStyle = (cell,r,c,d) => {
    const dv=parseFloat(getDisplay(cell,r,c,d));
    for(const rule of conds) {
      if(rule.c1!==undefined&&(r<rule.r1||r>rule.r2||c<rule.c1||c>rule.c2)) continue;
      let match=false;
      if(rule.op===">" && dv>parseFloat(rule.val)) match=true;
      if(rule.op===">=" && dv>=parseFloat(rule.val)) match=true;
      if(rule.op==="<" && dv<parseFloat(rule.val)) match=true;
      if(rule.op==="<=" && dv<=parseFloat(rule.val)) match=true;
      if(rule.op==="=" && String(dv)===String(rule.val)) match=true;
      if(rule.op==="contains" && String(getDisplay(cell,r,c,d)).toLowerCase().includes(String(rule.val).toLowerCase())) match=true;
      if(match) return {background:rule.bg||"#FEF2F2",color:rule.color||"#EF4444"};
    }
    return null;
  };

  // Merge cell lookup
  const getMerge = (r,c) => merges.find(m=>r>=m.r1&&r<=m.r2&&c>=m.c1&&c<=m.c2);
  const isMergeOrigin = (r,c) => merges.some(m=>m.r1===r&&m.c1===c);
  const isMergeHidden = (r,c) => {const m=getMerge(r,c);return m&&!(m.r1===r&&m.c1===c);};

  // ── Cell updates ──────────────────────────────────────────────────────────
  const updateCells = (updates, sid=activeSheet) => {
    setSheets(prev=>{
      const cur=prev.find(s=>s.id===sid);
      if(cur) pushUndo(cur.data.map(r=>[...r.map(c=>({...c}))]));
      const n=prev.map(s=>{
        if(s.id!==sid) return s;
        const nd=s.data.map((row,ri)=>row.map((cell,ci)=>{
          const upd=updates.find(u=>u.r===ri&&u.c===ci);
          return upd?{...cell,...upd.v}:cell;
        }));
        return {...s,data:nd};
      });
      saveSheets(n); return n;
    });
  };

  const updateCell = (r,c,val,sid=activeSheet) => {
    const isF=String(val).startsWith("=");
    updateCells([{r,c,v:{v:isF?"":val,formula:isF?val:""}}],sid);
  };

  const applyFmt = (prop,val) => {
    const r1=selRange?Math.min(selRange.r1,selRange.r2):sel.r;
    const r2=selRange?Math.max(selRange.r1,selRange.r2):sel.r;
    const c1=selRange?Math.min(selRange.c1,selRange.c2):sel.c;
    const c2=selRange?Math.max(selRange.c1,selRange.c2):sel.c;
    const updates=[];
    for(let r=r1;r<=r2;r++) {
      for(let c=c1;c<=c2;c++) {
        const cellProp = data[r]&&data[r][c]?data[r][c][prop]:false;
        updates.push({r,c,v:{[prop]:val!==undefined?val:!cellProp}});
      }
    }
    updateCells(updates);
  };

  // ── Range operations ──────────────────────────────────────────────────────
  const copyRange = () => {
    const r1=selRange?Math.min(selRange.r1,selRange.r2):sel.r;
    const r2=selRange?Math.max(selRange.r1,selRange.r2):sel.r;
    const c1=selRange?Math.min(selRange.c1,selRange.c2):sel.c;
    const c2=selRange?Math.max(selRange.c1,selRange.c2):sel.c;
    const cells=[];
    for(let r=r1;r<=r2;r++){const row=[];for(let c=c1;c<=c2;c++) row.push({...data[r]?.[c]});cells.push(row);}
    setClipboard({cells,r1,c1,cut:false});
    // Also copy text to clipboard
    const txt=cells.map(row=>row.map(cell=>getDisplay(cell,0,0,data)).join("\t")).join("\n");
    try{navigator.clipboard?.writeText(txt);}catch(_){}
  };

  const pasteRange = () => {
    if(!clipboard) return;
    const updates=[];
    clipboard.cells.forEach((row,dr)=>row.forEach((cell,dc)=>{
      const r=sel.r+dr, c=sel.c+dc;
      if(r<data.length&&c<(data[0]?.length||0)) updates.push({r,c,v:{...cell}});
    }));
    updateCells(updates);
  };

  const cutRange = () => { copyRange(); const r1=selRange?Math.min(selRange.r1,selRange.r2):sel.r,r2=selRange?Math.max(selRange.r1,selRange.r2):sel.r,c1=selRange?Math.min(selRange.c1,selRange.c2):sel.c,c2=selRange?Math.max(selRange.c1,selRange.c2):sel.c; const updates=[]; for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++) updates.push({r,c,v:{v:"",formula:""}}); updateCells(updates); };

  const fillDown = () => {
    const r1=selRange?Math.min(selRange.r1,selRange.r2):sel.r;
    const r2=selRange?Math.max(selRange.r1,selRange.r2):sel.r;
    const c1=selRange?Math.min(selRange.c1,selRange.c2):sel.c;
    const c2=selRange?Math.max(selRange.c1,selRange.c2):sel.c;
    const updates=[];
    for(let c=c1;c<=c2;c++){const src=data[r1]?.[c];for(let r=r1+1;r<=r2;r++) updates.push({r,c,v:{...src}});}
    updateCells(updates);
  };

  const fillRight = () => {
    const r1=selRange?Math.min(selRange.r1,selRange.r2):sel.r;
    const r2=selRange?Math.max(selRange.r1,selRange.r2):sel.r;
    const c1=selRange?Math.min(selRange.c1,selRange.c2):sel.c;
    const c2=selRange?Math.max(selRange.c1,selRange.c2):sel.c;
    const updates=[];
    for(let r=r1;r<=r2;r++){const src=data[r]?.[c1];for(let c=c1+1;c<=c2;c++) updates.push({r,c,v:{...src}});}
    updateCells(updates);
  };

  const deleteRange = () => {
    const r1=selRange?Math.min(selRange.r1,selRange.r2):sel.r;
    const r2=selRange?Math.max(selRange.r1,selRange.r2):sel.r;
    const c1=selRange?Math.min(selRange.c1,selRange.c2):sel.c;
    const c2=selRange?Math.max(selRange.c1,selRange.c2):sel.c;
    const updates=[];
    for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++) updates.push({r,c,v:{v:"",formula:"",bold:false,italic:false,underline:false,strike:false,bg:"",color:"",fmt:"",border:"none"}});
    updateCells(updates);
  };

  // ── Merge cells ───────────────────────────────────────────────────────────
  const mergeCells = () => {
    if(!selRange) return;
    const r1=Math.min(selRange.r1,selRange.r2),r2=Math.max(selRange.r1,selRange.r2);
    const c1=Math.min(selRange.c1,selRange.c2),c2=Math.max(selRange.c1,selRange.c2);
    if(r1===r2&&c1===c2) return;
    const existing=merges.filter(m=>!(m.r1===r1&&m.r2===r2&&m.c1===c1&&m.c2===c2));
    const newMerge={r1,r2,c1,c2};
    setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,merges:[...existing,newMerge]});saveSheets(n);return n;});
    setShowMergeHint(true); setTimeout(()=>setShowMergeHint(false),2000);
  };
  const unmergeCells = () => {
    const r=sel.r,c=sel.c;
    setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,merges:s.merges.filter(m=>!(r>=m.r1&&r<=m.r2&&c>=m.c1&&c<=m.c2))});saveSheets(n);return n;});
  };

  // ── Row/Col operations ────────────────────────────────────────────────────
  const insertRow = (at) => {
    const newRow=mkRow(data[0]?.length||DEF_COLS);
    setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,data:[...s.data.slice(0,at),newRow,...s.data.slice(at)]});saveSheets(n);return n;});
  };
  const deleteRow = (at) => {
    if(data.length<=1) return;
    setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,data:s.data.filter((_,i)=>i!==at)});saveSheets(n);return n;});
  };
  const insertCol = (at) => {
    setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,data:s.data.map(row=>[...row.slice(0,at),mkCell(),...row.slice(at)])});saveSheets(n);return n;});
  };
  const deleteCol = (at) => {
    if((data[0]?.length||1)<=1) return;
    setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,data:s.data.map(row=>row.filter((_,i)=>i!==at))});saveSheets(n);return n;});
  };

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sortByCol = (ci,asc) => {
    const header=data[0];
    const sorted=[header,...data.slice(1).sort((a,b)=>{
      const va=parseFloat(a[ci]?.v)||a[ci]?.v||"";
      const vb=parseFloat(b[ci]?.v)||b[ci]?.v||"";
      if(typeof va==="number"&&typeof vb==="number") return asc?va-vb:vb-va;
      return asc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
    })];
    setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,data:sorted});saveSheets(n);return n;});
  };

  // ── Sheets ────────────────────────────────────────────────────────────────
  const addSheet = () => { const id="s"+Date.now(),name="Feuil"+(sheets.length+1); const ns=[...sheets,{id,name,data:mkEmpty(),colW:{},rowH:{},merges:[],conds:[],namedRanges:{}}]; saveSheets(ns); setActiveSheet(id); };
  const delSheet = (id) => { if(sheets.length<=1) return; const ns=sheets.filter(s=>s.id!==id); saveSheets(ns); if(activeSheet===id) setActiveSheet(ns[0].id); };
  const dupSheet = (id) => { const src=sheets.find(s=>s.id===id); if(!src) return; const ns=[...sheets,{...src,id:"s"+Date.now(),name:src.name+" (copie)",data:src.data.map(r=>r.map(c=>({...c})))}]; saveSheets(ns); };

  // ── Conditional formatting ────────────────────────────────────────────────
  const addCondFmt = () => {
    if(!selRange&&sel.r===undefined) return;
    const r1=selRange?Math.min(selRange.r1,selRange.r2):sel.r;
    const r2=selRange?Math.max(selRange.r1,selRange.r2):sel.r;
    const c1=selRange?Math.min(selRange.c1,selRange.c2):sel.c;
    const c2=selRange?Math.max(selRange.c1,selRange.c2):sel.c;
    const rule={...condForm,r1,r2,c1,c2,id:"CF"+Date.now()};
    setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,conds:[...(s.conds||[]),rule]});saveSheets(n);return n;});
    setShowCondFmt(false);
  };

  // ── Charts ────────────────────────────────────────────────────────────────
  const buildChart = React.useCallback(() => {
    const r1=selRange?Math.min(selRange.r1,selRange.r2):sel.r;
    const r2=selRange?Math.max(selRange.r1,selRange.r2):sel.r;
    const c1=selRange?Math.min(selRange.c1,selRange.c2):sel.c;
    const c2=selRange?Math.max(selRange.c1,selRange.c2):sel.c;
    const labels=[],series=[];
    for(let r=r1;r<=r2;r++){
      labels.push(getDisplay(data[r]?.[c1],r,c1,data)||String(r+1));
      const vals=[];
      for(let c=c1+1;c<=c2;c++) vals.push(parseFloat(getDisplay(data[r]?.[c],r,c,data))||0);
      series.push(vals);
    }
    const colors=["#22C55E","#3B82F6","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#F97316","#10B981","#A855F7"];
    const W=560,H=300,PAD=48,BOT=64,seriesCount=Math.max(...series.map(s=>s.length),1);
    const allVals=series.flatMap(s=>s).filter(v=>!isNaN(v));
    if(!allVals.length) return null;
    const maxV=Math.max(...allVals,0.01),minV=Math.min(0,...allVals);
    const yScale=(v)=>PAD+((H-PAD-BOT)*(1-(v-minV)/(maxV-minV||1)));
    const xStep=(W-PAD*2)/Math.max(labels.length,1);
    let svgContent="",axesSVG="";
    // Y axis
    const yTicks=5;
    for(let i=0;i<=yTicks;i++){
      const v=minV+(maxV-minV)*i/yTicks,y=yScale(v);
      axesSVG+=`<line x1="${PAD-6}" y1="${y}" x2="${W-PAD}" y2="${y}" stroke="#333" stroke-width="0.5" stroke-dasharray="${i>0?"4,4":""}"/>`;
      axesSVG+=`<text x="${PAD-8}" y="${y+4}" text-anchor="end" font-size="9" fill="#888">${v>=1000?(v/1000).toFixed(1)+"k":v>=100?Math.round(v):v.toFixed(1)}</text>`;
    }
    axesSVG+=`<line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H-BOT}" stroke="#555" stroke-width="1.5"/>`;
    axesSVG+=`<line x1="${PAD}" y1="${H-BOT}" x2="${W-PAD}" y2="${H-BOT}" stroke="#555" stroke-width="1.5"/>`;

    if(chartType==="bar"){
      const bw=Math.max(4,(xStep*0.7)/Math.max(seriesCount,1));
      series.forEach((s,si)=>s.forEach((v,i)=>{
        const x=PAD+i*xStep+(si*bw)+xStep*0.15;
        const y0=yScale(0),yv=yScale(v);
        const y=Math.min(y0,yv),h=Math.abs(y0-yv);
        svgContent+=`<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h,1)}" fill="${colors[si%colors.length]}" rx="2" opacity="0.85">`;
        svgContent+=`<title>${labels[i]}: ${v.toLocaleString("fr-FR")}</title></rect>`;
        if(h>14) svgContent+=`<text x="${x+bw/2}" y="${y+(v>=0?-3:h+9)}" text-anchor="middle" font-size="8" fill="${colors[si%colors.length]}" font-weight="700">${v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(v<10&&v!==0?1:0)}</text>`;
      }));
    } else if(chartType==="line"){
      for(let si=0;si<seriesCount;si++){
        const pts=series.map((s,i)=>s[si]!==undefined?`${PAD+i*xStep+xStep/2},${yScale(s[si])}`:null).filter(Boolean);
        if(pts.length>1){
          svgContent+=`<polyline points="${pts.join(" ")}" fill="none" stroke="${colors[si%colors.length]}" stroke-width="2.5" stroke-linejoin="round" opacity="0.9"/>`;
          // Fill area
          const areapts=pts.join(" ")+` ${PAD+(series.length-1)*xStep+xStep/2},${yScale(0)} ${PAD+xStep/2},${yScale(0)}`;
          svgContent+=`<polygon points="${pts[0].split(",")[0]},${yScale(0)} ${pts.join(" ")} ${pts[pts.length-1].split(",")[0]},${yScale(0)}" fill="${colors[si%colors.length]}" opacity="0.12"/>`;
        }
        pts.forEach((pt,i)=>{const[px,py]=pt.split(",");svgContent+=`<circle cx="${px}" cy="${py}" r="4" fill="${colors[si%colors.length]}" stroke="#fff" stroke-width="1.5"><title>${labels[i]}: ${series[i]?.[si]?.toLocaleString("fr-FR")}</title></circle>`;});
      }
    } else if(chartType==="pie"||chartType==="donut"){
      const vals=series.map(s=>s[0]||0);
      const total=vals.reduce((a,v)=>a+Math.abs(v),0)||1;
      let angle=-Math.PI/2,cx=W/2,cy=(H-BOT)/2+PAD/2,r=Math.min(cx-PAD,cy-PAD)*0.88,inner=chartType==="donut"?r*0.5:0;
      vals.forEach((v,i)=>{
        const slice=Math.abs(v)/total*Math.PI*2;
        const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);
        const x2=cx+r*Math.cos(angle+slice),y2=cy+r*Math.sin(angle+slice);
        const lg=slice>Math.PI?1:0;
        const mx=cx+(r*0.7)*Math.cos(angle+slice/2),my=cy+(r*0.7)*Math.sin(angle+slice/2);
        if(inner>0){
          const xi1=cx+inner*Math.cos(angle),yi1=cy+inner*Math.sin(angle);
          const xi2=cx+inner*Math.cos(angle+slice),yi2=cy+inner*Math.sin(angle+slice);
          svgContent+=`<path d="M${x1},${y1} A${r},${r} 0 ${lg},1 ${x2},${y2} L${xi2},${yi2} A${inner},${inner} 0 ${lg},0 ${xi1},${yi1} Z" fill="${colors[i%colors.length]}" opacity="0.88" stroke="#1a1a2e" stroke-width="2"><title>${labels[i]}: ${v.toLocaleString("fr-FR")} (${(Math.abs(v)/total*100).toFixed(1)}%)</title></path>`;
        } else {
          svgContent+=`<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${lg},1 ${x2},${y2} Z" fill="${colors[i%colors.length]}" opacity="0.88" stroke="#1a1a2e" stroke-width="2"><title>${labels[i]}: ${v.toLocaleString("fr-FR")} (${(Math.abs(v)/total*100).toFixed(1)}%)</title></path>`;
        }
        if(slice>0.2) svgContent+=`<text x="${mx}" y="${my+3}" text-anchor="middle" font-size="9" fill="#fff" font-weight="800">${(Math.abs(v)/total*100).toFixed(0)}%</text>`;
        angle+=slice;
      });
    } else if(chartType==="area"){
      for(let si=0;si<seriesCount;si++){
        const pts=series.map((s,i)=>s[si]!==undefined?`${PAD+i*xStep+xStep/2},${yScale(s[si])}`:null).filter(Boolean);
        if(pts.length>1){
          const x0=PAD+xStep/2,xn=PAD+(series.length-1)*xStep+xStep/2;
          svgContent+=`<polygon points="${x0},${yScale(0)} ${pts.join(" ")} ${xn},${yScale(0)}" fill="${colors[si%colors.length]}" opacity="0.3"/>`;
          svgContent+=`<polyline points="${pts.join(" ")}" fill="none" stroke="${colors[si%colors.length]}" stroke-width="2" opacity="0.9"/>`;
        }
      }
    }
    // X labels
    labels.forEach((l,i)=>{
      const x=PAD+i*xStep+xStep/2;
      axesSVG+=`<text x="${x}" y="${H-BOT+14}" text-anchor="middle" font-size="9" fill="#888">${String(l).slice(0,10)}</text>`;
    });
    // Legend
    const legendY=H-18;
    colors.slice(0,Math.min(seriesCount,5)).forEach((c,i)=>{
      axesSVG+=`<rect x="${PAD+i*90}" y="${legendY}" width="10" height="10" fill="${c}" rx="2"/>`;
      axesSVG+=`<text x="${PAD+i*90+13}" y="${legendY+8}" font-size="9" fill="#888">Série ${i+1}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:300px;background:#0D1F38;border-radius:10px;">${axesSVG}${svgContent}</svg>`;
  },[selRange,sel,data,chartType,COLS]);

  React.useEffect(()=>{if(showChartModal) setSvgChart(buildChart());},[showChartModal,chartType,selRange]);

  // ── Exports ───────────────────────────────────────────────────────────────
  const exportCSV = () => { const csv=data.map(row=>row.map(c=>`"${(getDisplay(c,0,0,data)||"").replace(/"/g,'""')}"`).join(",")).join("\n"); const b=new Blob(["\uFEFF"+csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=sheet.name+".csv";a.click();URL.revokeObjectURL(u); };
  const exportHTML = () => {
    const rows=data.filter(row=>row.some(c=>c.v||c.formula)).map((row,ri)=>`<tr style="height:${rowH[ri]||22}px">${row.map((c,ci)=>{const m=getMerge(ri,ci);if(isMergeHidden(ri,ci)) return "";const rs=m?m.r2-m.r1+1:1,cs=m?m.c2-m.c1+1:1;return `<td colspan="${cs}" rowspan="${rs}" style="padding:3px ${colW[ci]||88}px;border:1px solid #ddd;${c.bold?"font-weight:bold;":""}${c.italic?"font-style:italic;":""}${c.underline?"text-decoration:underline;":""}${c.strike?"text-decoration:line-through;":""}text-align:${c.align||"left"};background:${c.bg||"transparent"};color:${c.color||"inherit"};font-size:${c.fontSize||11}px;">${getDisplay(c,ri,ci,data)||""}</td>`;}).join("")}</tr>`).join("");
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${sheet.name}</title><style>body{font-family:Calibri,sans-serif;margin:20px;}table{border-collapse:collapse;font-size:11px;}th{background:#1E3A5F;color:#fff;padding:5px 8px;}td{padding:3px 8px;}</style></head><body><h2>${sheet.name}</h2><table>${rows}</table></body></html>`;
    const b=new Blob([html],{type:"text/html"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=sheet.name+".html";a.click();URL.revokeObjectURL(u);
  };

  // ── Stats bar ─────────────────────────────────────────────────────────────
  const rangeStats = React.useMemo(() => {
    if(!selRange) return null;
    let sum=0,count=0,nums=[];
    for(let r=Math.min(selRange.r1,selRange.r2);r<=Math.max(selRange.r1,selRange.r2);r++)
      for(let c=Math.min(selRange.c1,selRange.c2);c<=Math.max(selRange.c1,selRange.c2);c++){
        const v=parseFloat(getDisplay(data[r]?.[c],r,c,data));
        if(!isNaN(v)){sum+=v;count++;nums.push(v);}
      }
    return count>0?{sum,count,avg:sum/count,min:Math.min(...nums),max:Math.max(...nums)}:null;
  },[selRange,data]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  React.useEffect(()=>{
    const onKey=(e)=>{
      const inInput=document.activeElement?.tagName==="INPUT"&&document.activeElement?.dataset?.cell;
      if(e.ctrlKey||e.metaKey){
        if(e.key==="c"){e.preventDefault();copyRange();}
        else if(e.key==="x"){e.preventDefault();cutRange();}
        else if(e.key==="v"){e.preventDefault();pasteRange();}
        else if(e.key==="z"&&!e.shiftKey){e.preventDefault();undo();}
        else if((e.key==="z"&&e.shiftKey)||e.key==="y"){e.preventDefault();redo();}
        else if(e.key==="d"){e.preventDefault();fillDown();}
        else if(e.key==="r"&&!inInput){e.preventDefault();fillRight();}
        else if(e.key==="a"&&!inInput){e.preventDefault();setSelRange({r1:0,c1:0,r2:data.length-1,c2:(data[0]?.length||1)-1});}
        else if(e.key==="Home"){e.preventDefault();setSel({r:0,c:0});setSelRange(null);}
        else if(e.key==="End"){e.preventDefault();setSel({r:data.length-1,c:(data[0]?.length||1)-1});setSelRange(null);}
      }
      if(e.key==="Delete"&&!inInput&&(selRange||true)){e.preventDefault();deleteRange();}
      if(e.key==="F2"&&!inInput){e.preventDefault();setIsEditing(true);setEditVal(data[sel.r]?.[sel.c]?.formula||data[sel.r]?.[sel.c]?.v||"");}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[sel,selRange,clipboard,undoStack,redoStack,data]);

  // ── Column resize ─────────────────────────────────────────────────────────
  const startColResize = (e,ci) => {
    e.preventDefault();
    setResizingCol(ci);
    setResizeStart({x:e.clientX,w:colW[ci]||88});
    const onMove=(ev)=>{
      const diff=ev.clientX-e.clientX;
      const newW=Math.max(30,(colW[ci]||88)+diff);
      setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,colW:{...s.colW,[ci]:newW}});saveSheets(n);return n;});
    };
    const onUp=()=>{setResizingCol(null);window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };

  const startRowResize = (e,ri) => {
    e.preventDefault();
    setResizingRow(ri);
    const onMove=(ev)=>{
      const diff=ev.clientY-e.clientY;
      const newH=Math.max(18,(rowH[ri]||22)+diff);
      setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,rowH:{...s.rowH,[ri]:newH}});saveSheets(n);return n;});
    };
    const onUp=()=>{setResizingRow(null);window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };

  const curCell = data[sel.r]?.[sel.c];
  const cellRef = `${COLS[sel.c]||"A"}${sel.r+1}`;

  // ── Toolbar constants ─────────────────────────────────────────────────────
  const BORDER_STYLES=[{label:"Toutes",val:"1px solid #888",icon:"⊞"},{label:"Extérieur",val:"2px solid #555",icon:"□"},{label:"Épais",val:"2px solid #22C55E",icon:"■"},{label:"Tirets",val:"1px dashed #666",icon:"⊟"},{label:"Aucune",val:"none",icon:"✕"}];
  const FMT_OPTIONS=[["","Normal"],["num0","Entier"],["num2","0.00"],["sep","Séparateur"],["pct","% (×100)"],["pct2","% direct"],["fcfa","FCFA"],["kfcfa","k FCFA"],["mfcfa","M FCFA"],["date","Date"],["datetime","Date+Heure"]];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 180px)"}}>
      <AppHeader icon="📊" title="Tableur Pro" color="#22C55E" />

      {/* ── TOOLBAR ── */}
      <div style={{display:"flex",gap:3,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:"8px 8px 0 0",padding:"4px 8px",flexWrap:"wrap",alignItems:"center",borderBottom:"none",fontSize:10}}>
        {/* History */}
        <button onClick={undo} disabled={!undoStack.length} title="Annuler (Ctrl+Z)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,fontSize:13,opacity:undoStack.length?1:0.35,cursor:undoStack.length?"pointer":"default"}}>↩</button>
        <button onClick={redo} disabled={!redoStack.length} title="Rétablir (Ctrl+Y)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,fontSize:13,opacity:redoStack.length?1:0.35,cursor:redoStack.length?"pointer":"default"}}>↪</button>
        <div style={{width:1,height:18,background:T.border,margin:"0 2px"}}/>

        {/* Bold/Italic/Underline/Strike */}
        <button onClick={()=>applyFmt("bold")} title="Gras" style={{background:curCell?.bold?"#22C55E33":"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,fontWeight:900,fontSize:12,minWidth:26}}>B</button>
        <button onClick={()=>applyFmt("italic")} title="Italique" style={{background:curCell?.italic?"#22C55E33":"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,fontStyle:"italic",fontSize:12,minWidth:26}}>I</button>
        <button onClick={()=>applyFmt("underline")} title="Souligné" style={{background:curCell?.underline?"#22C55E33":"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,textDecoration:"underline",fontSize:12,minWidth:26}}>U</button>
        <button onClick={()=>applyFmt("strike")} title="Barré" style={{background:curCell?.strike?"#22C55E33":"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,textDecoration:"line-through",fontSize:12,minWidth:26}}>S̶</button>
        <div style={{width:1,height:18,background:T.border,margin:"0 2px"}}/>

        {/* Alignment */}
        {[["left","≡←"],["center","≡≡"],["right","≡→"]].map(([a,ico])=>(
          <button key={a} onClick={()=>applyFmt("align",a)} style={{background:curCell?.align===a?"#22C55E33":"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 5px",color:T.text,fontSize:11}}>{ico}</button>
        ))}
        <div style={{width:1,height:18,background:T.border,margin:"0 2px"}}/>

        {/* Colors */}
        <label title="Fond cellule" style={{cursor:"pointer",display:"flex",alignItems:"center",gap:1}}>
          <span style={{fontSize:11}}>🎨</span><input type="color" defaultValue="#FBBF24" style={{width:18,height:16,border:"none",cursor:"pointer",padding:0}} onChange={e=>applyFmt("bg",e.target.value)}/>
        </label>
        <label title="Couleur texte" style={{cursor:"pointer",display:"flex",alignItems:"center",gap:1}}>
          <span style={{fontSize:11}}>✏️</span><input type="color" defaultValue="#1E3A5F" style={{width:18,height:16,border:"none",cursor:"pointer",padding:0}} onChange={e=>applyFmt("color",e.target.value)}/>
        </label>
        <div style={{width:1,height:18,background:T.border,margin:"0 2px"}}/>

        {/* Font size */}
        <select value={curCell?.fontSize||11} onChange={e=>applyFmt("fontSize",+e.target.value)} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"2px 4px",color:T.text,fontSize:10,width:52}}>
          {[8,9,10,11,12,13,14,16,18,20,24].map(s=><option key={s} value={s}>{s}pt</option>)}
        </select>
        <div style={{width:1,height:18,background:T.border,margin:"0 2px"}}/>

        {/* Borders */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowBorderMenu(p=>!p)} title="Bordures" style={{background:showBorderMenu?"#22C55E22":"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,fontSize:11}}>⊞▾</button>
          {showBorderMenu&&(<div style={{position:"absolute",top:"100%",left:0,zIndex:50,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:5,display:"flex",flexDirection:"column",gap:3,minWidth:140,boxShadow:"0 4px 16px #0008"}}>
            {BORDER_STYLES.map(b=>(<button key={b.val} onClick={()=>{applyFmt("border",b.val);setShowBorderMenu(false);}} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,padding:"4px 8px",cursor:"pointer",color:T.text,fontSize:10,textAlign:"left"}}>{b.icon} {b.label}</button>))}
          </div>)}
        </div>

        {/* Number format */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowFmtMenu(p=>!p)} title="Format" style={{background:showFmtMenu?"#22C55E22":"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.textMuted,fontSize:10}}>123▾</button>
          {showFmtMenu&&(<div style={{position:"absolute",top:"100%",left:0,zIndex:50,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:5,display:"flex",flexDirection:"column",gap:2,minWidth:130,boxShadow:"0 4px 16px #0008"}}>
            {FMT_OPTIONS.map(([v,l])=>(<button key={v} onClick={()=>{applyFmt("fmt",v);setShowFmtMenu(false);}} style={{background:curCell?.fmt===v?"#22C55E22":"transparent",border:`1px solid ${curCell?.fmt===v?"#22C55E44":T.border}`,borderRadius:4,padding:"3px 8px",cursor:"pointer",color:T.text,fontSize:10,textAlign:"left"}}>{l}</button>))}
          </div>)}
        </div>
        <div style={{width:1,height:18,background:T.border,margin:"0 2px"}}/>

        {/* Merge */}
        <button onClick={mergeCells} title="Fusionner les cellules sélectionnées" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.textMuted,fontSize:10}}>⊡ Fusionner</button>
        <button onClick={unmergeCells} title="Défusionner" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.textMuted,fontSize:10}}>⊟</button>
        <div style={{width:1,height:18,background:T.border,margin:"0 2px"}}/>

        {/* Row/Col ops */}
        <button onClick={()=>insertRow(sel.r)} title="Insérer ligne avant" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.textMuted,fontSize:10}}>+L↑</button>
        <button onClick={()=>deleteRow(sel.r)} title="Supprimer ligne" style={{background:"transparent",border:"1px solid #EF444433",borderRadius:5,padding:"3px 7px",color:"#EF4444",fontSize:10}}>-L</button>
        <button onClick={()=>insertCol(sel.c)} title="Insérer colonne avant" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.textMuted,fontSize:10}}>+C←</button>
        <button onClick={()=>deleteCol(sel.c)} title="Supprimer colonne" style={{background:"transparent",border:"1px solid #EF444433",borderRadius:5,padding:"3px 7px",color:"#EF4444",fontSize:10}}>-C</button>
        <div style={{width:1,height:18,background:T.border,margin:"0 2px"}}/>

        {/* Fill/Sort */}
        <button onClick={fillDown} title="Remplir bas (Ctrl+D)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 6px",color:T.textMuted,fontSize:10}}>↓↓</button>
        <button onClick={fillRight} title="Remplir droite (Ctrl+R)" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 6px",color:T.textMuted,fontSize:10}}>→→</button>
        <button onClick={()=>{setSortAsc(p=>!p);sortByCol(sel.c,!sortAsc);}} title="Trier colonne" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 6px",color:T.textMuted,fontSize:11}}>{sortAsc?"↑A":"↓Z"}</button>
        <button onClick={deleteRange} title="Effacer (Suppr)" style={{background:"transparent",border:"1px solid #EF444433",borderRadius:5,padding:"3px 6px",color:"#EF4444",fontSize:11}}>🗑</button>
        <div style={{width:1,height:18,background:T.border,margin:"0 2px"}}/>

        {/* Conditional format */}
        <button onClick={()=>setShowCondFmt(p=>!p)} title="Mise en forme conditionnelle" style={{background:showCondFmt?"#F59E0B22":"transparent",border:`1px solid ${showCondFmt?"#F59E0B44":T.border}`,borderRadius:5,padding:"3px 7px",color:showCondFmt?"#F59E0B":T.textMuted,fontSize:10}}>🎨 Cond.</button>

        <div style={{flex:1}}/>

        {/* Zoom */}
        <button onClick={()=>setZoom(z=>Math.max(50,z-10))} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"2px 6px",color:T.textMuted,fontSize:11}}>−</button>
        <span style={{color:T.textDim,fontSize:9,minWidth:30,textAlign:"center"}}>{zoom}%</span>
        <button onClick={()=>setZoom(z=>Math.min(150,z+10))} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"2px 6px",color:T.textMuted,fontSize:11}}>+</button>

        {/* Chart */}
        <button onClick={()=>setShowChartModal(true)} title="Graphique" style={{background:"#8B5CF622",border:"1px solid #8B5CF644",borderRadius:5,padding:"3px 8px",color:"#8B5CF6",fontSize:10,fontWeight:700}}>📈</button>
        {/* Find */}
        <button onClick={()=>setShowFind(p=>!p)} style={{background:showFind?"#22C55E22":"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.textMuted,fontSize:10}}>🔍</button>
        {/* Export */}
        <button onClick={exportCSV} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:5,padding:"3px 8px",fontWeight:700,fontSize:10}}>CSV</button>
        <button onClick={exportHTML} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 8px",fontWeight:700,fontSize:10}}>HTML</button>
        <button onClick={()=>{
          const rows=data.filter(row=>row.some(c=>c.v||c.formula)).map((row,ri)=>`<tr style="height:${rowH[ri]||22}px">${row.map((c,ci)=>`<td style="padding:4px ${colW[ci]?colW[ci]+'px':'88px'};border:1px solid #ddd;${c.bold?'font-weight:bold;':''}${c.italic?'font-style:italic;':''}${c.underline?'text-decoration:underline;':''}text-align:${c.align||'left'};background:${c.bg||'transparent'};color:${c.color||'inherit'};font-size:${c.fontSize||11}px;">${getDisplay(c,ri,ci,data)||''}</td>`).join('')}</tr>`).join('');
          const w=window.open('','_blank','width=900,height=700');
          if(w){w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${sheet.name}</title><style>@page{margin:1.5cm}body{font-family:Calibri,Arial,sans-serif;font-size:11px;margin:0;}table{border-collapse:collapse;width:100%;font-size:11px;}td{padding:4px 8px;border:1px solid #ddd;}th{background:#0A1E4A;color:#fff;padding:5px 8px;text-align:left;} @media print{button{display:none}}</style></head><body><h2 style="color:#0A1E4A;margin:0 0 10px;font-size:14px;">${sheet.name}</h2><table>${rows}</table><div style="margin-top:16px;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:6px;">Généré par SI Génie Consultant — ${new Date().toLocaleString('fr-FR')}</div><script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`);w.document.close();}
        }} title="Imprimer le tableur" style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:5,padding:"3px 8px",fontWeight:700,fontSize:10}}>🖨️</button>
        <div style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:5,padding:"3px 8px",fontSize:9,color:"#22C55E",display:"flex",alignItems:"center",gap:3}} title="Sauvegarde automatique à chaque modification">💾 Auto-sauvé</div>
      </div>

      {/* ── CONDITIONAL FORMAT PANEL ── */}
      {showCondFmt&&(
        <div style={{background:T.surface2,border:`1px solid #F59E0B44`,borderRadius:0,padding:"8px 12px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",fontSize:10}}>
          <span style={{color:"#F59E0B",fontWeight:700}}>🎨 Si valeur</span>
          <select value={condForm.op} onChange={e=>setCondForm(f=>({...f,op:e.target.value}))} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 6px",color:T.text,fontSize:10}}>
            {[[">",">"],[">="," ≥"],["<","<"],["<=","≤"],["=","="],["contains","contient"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <input value={condForm.val} onChange={e=>setCondForm(f=>({...f,val:e.target.value}))} placeholder="Valeur…" style={{width:80,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,fontSize:10}}/>
          <span style={{color:T.textMuted}}>→ couleur texte</span>
          <input type="color" value={condForm.color} onChange={e=>setCondForm(f=>({...f,color:e.target.value}))} style={{width:24,height:20,border:"none",borderRadius:3,cursor:"pointer",padding:0}}/>
          <span style={{color:T.textMuted}}>fond</span>
          <input type="color" value={condForm.bg} onChange={e=>setCondForm(f=>({...f,bg:e.target.value}))} style={{width:24,height:20,border:"none",borderRadius:3,cursor:"pointer",padding:0}}/>
          <button onClick={addCondFmt} style={{background:"#F59E0B",border:"none",color:"#000",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>Appliquer</button>
          {conds.length>0&&<button onClick={()=>setSheets(prev=>{const n=prev.map(s=>s.id!==activeSheet?s:{...s,conds:[]});saveSheets(n);return n;})} style={{background:"transparent",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10}}>Effacer règles</button>}
          <button onClick={()=>setShowCondFmt(false)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:12}}>✕</button>
        </div>
      )}

      {/* ── FORMULA BAR ── */}
      <div style={{display:"flex",gap:5,padding:"3px 8px",background:T.surface2,border:`1px solid ${T.border}`,borderTop:"none",alignItems:"center",position:"relative"}}>
        <div style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 9px",minWidth:56,textAlign:"center",color:"#22C55E",fontWeight:700,fontSize:12,fontFamily:"monospace"}}>{cellRef}</div>
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowFxMenu(p=>!p)} style={{background:showFxMenu?"#22C55E22":"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 9px",color:"#22C55E",cursor:"pointer",fontSize:11,fontWeight:700}}>fx ▾</button>
          {showFxMenu&&(
            <div style={{position:"absolute",top:"100%",left:0,zIndex:60,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:8,minWidth:340,boxShadow:"0 8px 24px rgba(0,0,0,0.4)",display:"flex",gap:6,flexWrap:"wrap"}}>
              {[
                {label:"📊 Agrégation",items:["=SUM(","=AVERAGE(","=MAX(","=MIN(","=COUNT(","=COUNTA(","=COUNTIF(","=SUMIF(","=STDEV(","=MEDIAN("]},
                {label:"🔀 Logique",items:["=IF(","=IFERROR("]},
                {label:"📐 Maths",items:["=ROUND(","=ABS(","=SQRT(","=POWER(","=INT(","=MOD("]},
                {label:"📝 Texte",items:["=CONCATENATE(","=LEN(","=UPPER(","=LOWER("]},
              ].map(grp=>(
                <div key={grp.label} style={{flex:"1 1 80px"}}>
                  <div style={{color:T.textMuted,fontSize:9,fontWeight:700,marginBottom:3}}>{grp.label}</div>
                  {grp.items.map(fx=>(
                    <button key={fx} onClick={()=>{setEditVal(prev=>(isEditing?prev:"")+fx);setIsEditing(true);setShowFxMenu(false);inputRef.current?.focus();}}
                      style={{display:"block",width:"100%",textAlign:"left",background:"transparent",border:"none",color:T.text,padding:"3px 5px",cursor:"pointer",fontSize:9,fontFamily:"monospace",borderRadius:3}}
                      onMouseEnter={e=>e.currentTarget.style.background="#22C55E22"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {fx}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Formula input with autocomplete */}
        <div style={{flex:1,position:"relative"}}>
          <input ref={inputRef}
            value={isEditing?editVal:(curCell?.formula||curCell?.v||"")}
            onChange={e=>{setEditVal(e.target.value);setIsEditing(true);updateFxSuggest(e.target.value);}}
            onBlur={()=>{if(isEditing&&!showFxMenu){updateCell(sel.r,sel.c,editVal);setIsEditing(false);setFxSuggest([]);}}}
            onKeyDown={e=>{
              if(e.key==="Enter"){if(isEditing){updateCell(sel.r,sel.c,editVal);setIsEditing(false);setFxSuggest([]);}setSel({r:Math.min(sel.r+1,data.length-1),c:sel.c});}
              else if(e.key==="Escape"){setIsEditing(false);setEditVal("");setShowFxMenu(false);setFxSuggest([]);}
              else if(e.key==="Tab"){e.preventDefault();if(isEditing){updateCell(sel.r,sel.c,editVal);setIsEditing(false);setFxSuggest([]);}setSel({r:sel.r,c:Math.min(sel.c+1,COLS.length-1)});}
            }}
            placeholder="Valeur ou formule — =SUM(A1:A10) =IF(A1>0,A1,0) =COUNTIF(A:A,&quot;oui&quot;)"
            style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"5px 10px",color:T.text,fontSize:11,fontFamily:"monospace",boxSizing:"border-box"}}/>
          {fxSuggest.length>0&&(
            <div style={{position:"absolute",top:"100%",left:0,zIndex:70,background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:4,minWidth:180,boxShadow:"0 4px 16px #0006"}}>
              {fxSuggest.map(fx=>(
                <button key={fx} onClick={()=>{const base=editVal.replace(/[A-Z]+$/,"");setEditVal(base+fx);setFxSuggest([]);inputRef.current?.focus();}}
                  style={{display:"block",width:"100%",textAlign:"left",background:"transparent",border:"none",color:"#22C55E",padding:"4px 8px",cursor:"pointer",fontSize:10,fontFamily:"monospace",borderRadius:4}}
                  onMouseEnter={e=>e.currentTarget.style.background="#22C55E22"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {fx}
                </button>
              ))}
            </div>
          )}
        </div>
        {rangeStats&&(
          <div style={{background:"#22C55E18",border:"1px solid #22C55E33",borderRadius:6,padding:"3px 10px",fontSize:10,color:"#22C55E",whiteSpace:"nowrap",flexShrink:0}}>
            Σ {rangeStats.sum.toLocaleString("fr-FR")} · moy {rangeStats.avg.toFixed(2)} · n={rangeStats.count} · ↑ {rangeStats.max} · ↓ {rangeStats.min}
          </div>
        )}
      </div>

      {/* ── FIND/REPLACE ── */}
      {showFind&&(
        <div style={{display:"flex",gap:6,padding:"4px 10px",background:T.surface2,border:`1px solid ${T.border}`,borderTop:"none",alignItems:"center"}}>
          <input value={findText} onChange={e=>setFindText(e.target.value)} placeholder="Rechercher…" style={{width:140,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,fontSize:11}}/>
          <input value={replText} onChange={e=>setReplText(e.target.value)} placeholder="Remplacer par…" style={{width:140,background:T.surface3,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 7px",color:T.text,fontSize:11}}/>
          <button onClick={()=>{if(!findText) return;const updates=[];data.forEach((row,r)=>row.forEach((cell,c)=>{if((cell.v||"").includes(findText)) updates.push({r,c,v:{v:(cell.v||"").split(findText).join(replText)}});}));if(updates.length)updateCells(updates);}} style={{background:"#22C55E",border:"none",color:"#fff",borderRadius:5,padding:"4px 12px",cursor:"pointer",fontWeight:700,fontSize:10}}>Remplacer tout</button>
          <span style={{color:T.textDim,fontSize:10}}>{findText?data.flat().filter(c=>(c.v||"").includes(findText)).length+" cellule(s)":""}</span>
          <button onClick={()=>setShowFind(false)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:12,marginLeft:"auto"}}>✕</button>
        </div>
      )}

      {/* ── GRID ── */}
      <div ref={gridRef} style={{flex:1,overflow:"auto",border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 8px 8px",transform:`scale(${zoom/100})`,transformOrigin:"top left",width:`${10000/zoom}%`}}
        onMouseDown={e=>{
          if(e.button!==0) return;
          if(e.target.dataset&&e.target.dataset.r!==undefined&&e.target.dataset.c!==undefined){
            const r=parseInt(e.target.dataset.r),c=parseInt(e.target.dataset.c);
            if(!isNaN(r)&&!isNaN(c)){
              if(e.shiftKey&&(selRange||sel)){
                const base=rangeStart||sel;
                setSelRange({r1:base.r,c1:base.c,r2:r,c2:c});
              } else {
                setRangeStart({r,c});
                setSel({r,c});
                if(!e.shiftKey) setSelRange(null);
              }
            }
          }
        }}
        onMouseMove={e=>{
          if(e.buttons!==1) return;
          if(e.target.dataset&&e.target.dataset.r!==undefined&&e.target.dataset.c!==undefined){
            const r=parseInt(e.target.dataset.r),c=parseInt(e.target.dataset.c);
            if(!isNaN(r)&&!isNaN(c)&&rangeStart){
              setSelRange({r1:rangeStart.r,c1:rangeStart.c,r2:r,c2:c});
              setSel({r,c});
            }
          }
        }}
        onContextMenu={e=>{e.preventDefault();const r=parseInt(e.target.dataset?.r),c=parseInt(e.target.dataset?.c);if(!isNaN(r)&&!isNaN(c)) setShowContextMenu({x:e.clientX,y:e.clientY,r,c});}}>

        <table style={{borderCollapse:"collapse",fontSize:10,tableLayout:"fixed",minWidth:"100%",userSelect:"none"}}>
          <thead style={{position:"sticky",top:0,zIndex:10}}>
            <tr>
              <th style={{width:36,background:T.surface3,border:`1px solid ${T.border}`,padding:"3px",color:T.textDim,fontSize:9,cursor:"pointer"}} onClick={()=>{setSelRange({r1:0,c1:0,r2:data.length-1,c2:(data[0]?.length||1)-1});setRangeStart({r:0,c:0});}}>⊡</th>
              {COLS.map((c,ci)=>(
                <th key={c} style={{width:colW[ci]||88,background:frozenCols>ci?"#22C55E18":T.surface3,border:`1px solid ${T.border}`,padding:"0",color:"#22C55E",fontSize:10,fontWeight:700,cursor:"pointer",textAlign:"center",position:"relative"}}
                  onClick={e=>{if(!e.shiftKey){setSelRange({r1:0,c1:ci,r2:data.length-1,c2:ci});setSel({r:0,c:ci});setRangeStart({r:0,c:ci});}}}
                  onDoubleClick={()=>setFrozenCols(frozenCols===ci+1?0:ci+1)}>
                  <div style={{padding:"3px 4px",display:"flex",alignItems:"center",justifyContent:"center",gap:2}}>
                    {c}
                    {frozenCols>ci&&<span style={{fontSize:7,color:"#22C55E"}}>🔒</span>}
                    <button onClick={e=>{e.stopPropagation();setSortAsc(p=>!p);sortByCol(ci,!sortAsc);}} style={{background:"transparent",border:"none",color:"#22C55E55",cursor:"pointer",fontSize:9,padding:0,lineHeight:1}}>{sortAsc?"↑":"↓"}</button>
                  </div>
                  {/* Resize handle */}
                  <div onMouseDown={e=>startColResize(e,ci)} style={{position:"absolute",right:0,top:0,bottom:0,width:4,cursor:"col-resize",background:resizingCol===ci?"#22C55E55":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background="#22C55E33"} onMouseLeave={e=>e.currentTarget.style.background=resizingCol===ci?"#22C55E55":"transparent"}/>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row,r)=>(
              <tr key={r} style={{height:rowH[r]||22,background:frozenRows>r?"#22C55E08":"transparent"}}>
                <td style={{background:frozenRows>r?"#22C55E18":T.surface3,border:`1px solid ${T.border}`,padding:"0 4px",color:T.textDim,fontSize:9,textAlign:"center",fontWeight:700,cursor:"pointer",position:"relative",minWidth:36}}
                  onClick={e=>{if(!e.shiftKey){setSelRange({r1:r,c1:0,r2:r,c2:(data[0]?.length||1)-1});setSel({r,c:0});setRangeStart({r,c:0});}}}
                  onDoubleClick={()=>setFrozenRows(frozenRows===r+1?0:r+1)}>
                  {r+1}{frozenRows>r&&<span style={{fontSize:6,color:"#22C55E",position:"absolute",top:0,right:1}}>🔒</span>}
                  <div onMouseDown={e=>startRowResize(e,r)} style={{position:"absolute",bottom:0,left:0,right:0,height:3,cursor:"row-resize"}} onMouseEnter={e=>e.currentTarget.style.background="#22C55E33"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}/>
                </td>
                {row.map((cell,c)=>{
                  if(isMergeHidden(r,c)) return null;
                  const m=getMerge(r,c);
                  const isSel=sel.r===r&&sel.c===c;
                  const inRange=selRange&&r>=Math.min(selRange.r1,selRange.r2)&&r<=Math.max(selRange.r1,selRange.r2)&&c>=Math.min(selRange.c1,selRange.c2)&&c<=Math.max(selRange.c1,selRange.c2);
                  const dv=getDisplay(cell,r,c,data);
                  const hl=findText&&String(dv).toLowerCase().includes(findText.toLowerCase());
                  const condStyle=getCellCondStyle(cell,r,c,data);
                  const bdrStyle=cell.border&&cell.border!=="none"?{border:cell.border}:{};
                  const validation=cellValidations[`${r}_${c}`];
                  return (
                    <td key={c}
                      colSpan={m?m.c2-m.c1+1:1}
                      rowSpan={m?m.r2-m.r1+1:1}
                      style={{
                        padding:0,
                        background:hl?"#F59E0B22":isSel?"#22C55E18":inRange?"#22C55E0A":condStyle?.background||(cell.bg||"transparent"),
                        outline:isSel?"2px solid #22C55E":"none",outlineOffset:-1,
                        border:`1px solid ${isSel?"#22C55E":inRange?"#22C55E44":T.border+"44"}`,
                        ...bdrStyle,
                        verticalAlign:cell.valign||"middle",
                        minWidth:colW[c]||88,
                      }}>
                      {isSel&&isEditing?(
                        <input data-r={r} data-c={c}
                          autoFocus
                          value={editVal}
                          onChange={e=>{setEditVal(e.target.value);updateFxSuggest(e.target.value);}}
                          onBlur={()=>{updateCell(r,c,editVal);setIsEditing(false);setFxSuggest([]);}}
                          onKeyDown={e=>{
                            if(e.key==="Enter"){updateCell(r,c,editVal);setIsEditing(false);setFxSuggest([]);setSel({r:Math.min(r+1,data.length-1),c});e.preventDefault();}
                            else if(e.key==="Tab"){e.preventDefault();updateCell(r,c,editVal);setIsEditing(false);setFxSuggest([]);setSel({r,c:Math.min(c+1,COLS.length-1)});}
                            else if(e.key==="Escape"){setIsEditing(false);setEditVal("");setFxSuggest([]);}
                          }}
                          style={{width:"100%",background:"#22C55E11",border:"none",padding:"2px 5px",color:cell.color||(condStyle?.color||T.text),fontSize:(cell.fontSize||11)+"px",fontFamily:"monospace",fontWeight:cell.bold?"700":"400",fontStyle:cell.italic?"italic":"normal",outline:"none",boxSizing:"border-box",display:"block"}}/>
                      ):(
                        <div data-r={r} data-c={c}
                          onClick={()=>{setSel({r,c});setEditVal(cell.formula||cell.v||"");setIsEditing(false);}}
                          onDoubleClick={()=>{setSel({r,c});setEditVal(cell.formula||cell.v||"");setIsEditing(true);}}
                          style={{
                            padding:"2px 5px",
                            color:condStyle?.color||(cell.color||T.text),
                            fontSize:(cell.fontSize||11)+"px",
                            fontFamily:"Calibri,Arial,sans-serif",
                            fontWeight:cell.bold?"700":"400",
                            fontStyle:cell.italic?"italic":"normal",
                            textDecoration:`${cell.underline?"underline":""}${cell.strike?" line-through":""}`.trim()||"none",
                            textAlign:cell.align||"left",
                            cursor:"cell",
                            whiteSpace:cell.wrap?"normal":"nowrap",
                            overflow:"hidden",
                            minHeight:16,
                          }}>
                          {validation?.type==="list"&&!dv?<span style={{color:T.textDim,fontSize:9}}>▼</span>:dv}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── CONTEXT MENU ── */}
      {showContextMenu&&(
        <div style={{position:"fixed",left:showContextMenu.x,top:showContextMenu.y,zIndex:200,background:T.surface,border:`1px solid ${T.border}`,borderRadius:9,padding:6,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",minWidth:180}} onMouseLeave={()=>setShowContextMenu(null)}>
          {[
            ["📋 Copier (Ctrl+C)",()=>copyRange()],
            ["✂️ Couper (Ctrl+X)",()=>cutRange()],
            ["📌 Coller (Ctrl+V)",()=>pasteRange()],
            ["─────",null],
            ["↓ Insérer ligne",()=>insertRow(showContextMenu.r)],
            ["✕ Supprimer ligne",()=>deleteRow(showContextMenu.r)],
            ["→ Insérer colonne",()=>insertCol(showContextMenu.c)],
            ["✕ Supprimer colonne",()=>deleteCol(showContextMenu.c)],
            ["─────",null],
            ["⊡ Fusionner sélection",()=>mergeCells()],
            ["⊟ Défusionner",()=>unmergeCells()],
            ["─────",null],
            ["↑A Trier croissant",()=>{sortByCol(showContextMenu.c,true);}],
            ["↓Z Trier décroissant",()=>{sortByCol(showContextMenu.c,false);}],
            ["─────",null],
            ["🗑 Effacer cellule(s)",()=>deleteRange()],
          ].map(([l,fn],i)=>l==="─────"?<div key={i} style={{borderTop:`1px solid ${T.border}`,margin:"3px 0"}}/>:(
            <button key={l} onClick={()=>{fn();setShowContextMenu(null);}} style={{display:"block",width:"100%",textAlign:"left",background:"transparent",border:"none",color:T.text,padding:"5px 10px",cursor:"pointer",fontSize:11,borderRadius:5}}
              onMouseEnter={e=>e.currentTarget.style.background="#22C55E22"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{l}</button>
          ))}
        </div>
      )}

      {/* ── SHEET TABS ── */}
      <div style={{display:"flex",gap:2,marginTop:3,borderTop:`1px solid ${T.border}`,paddingTop:3,overflowX:"auto",alignItems:"center"}}>
        {sheets.map(s=>(
          <div key={s.id} style={{display:"flex",alignItems:"center",gap:1}}>
            {renaming===s.id
              ?<input autoFocus defaultValue={s.name} onBlur={e=>{const n=e.target.value.trim()||s.name;setSheets(prev=>{const nx=prev.map(x=>x.id===s.id?{...x,name:n}:x);saveSheets(nx);return nx;});setRenaming(null);}} onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}} style={{width:70,background:T.surface3,border:"1px solid #22C55E",borderRadius:4,padding:"2px 5px",color:T.text,fontSize:10}}/>
              :<button onDoubleClick={()=>setRenaming(s.id)} onClick={()=>setActiveSheet(s.id)} style={{background:activeSheet===s.id?"#22C55E22":"transparent",border:`1px solid ${activeSheet===s.id?"#22C55E55":T.border}`,borderRadius:"4px 4px 0 0",padding:"3px 10px",color:activeSheet===s.id?"#22C55E":T.textMuted,fontSize:10,cursor:"pointer"}}>{s.name}</button>
            }
            {sheets.length>1&&<button onClick={()=>delSheet(s.id)} title="Supprimer" style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10,padding:"0 2px"}}>×</button>}
            <button onClick={()=>dupSheet(s.id)} title="Dupliquer" style={{background:"none",border:"none",color:T.textDim,cursor:"pointer",fontSize:10,padding:"0 1px"}}>⧉</button>
          </div>
        ))}
        <button onClick={addSheet} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,padding:"3px 8px",color:T.textMuted,fontSize:10,cursor:"pointer",marginLeft:2}}>+ Feuille</button>
        {showMergeHint&&<span style={{color:"#22C55E",fontSize:9,marginLeft:8}}>✅ Cellules fusionnées</span>}
        <div style={{marginLeft:"auto",color:T.textDim,fontSize:9,whiteSpace:"nowrap"}}>
          Ctrl+C/X/V · Ctrl+Z/Y · Ctrl+D/R · Suppr · Dbl-clic édition · Clic droit menu
        </div>
      </div>

      {/* ── CHART MODAL ── */}
      {showChartModal&&(
        <div style={{position:"fixed",inset:0,background:"#000A",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowChartModal(false)}>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:24,width:640,maxHeight:"85vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{color:T.text,fontWeight:900,fontSize:15}}>📈 Créer un graphique</div>
              <button onClick={()=>setShowChartModal(false)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
              {[["bar","📊 Barres"],["line","📈 Courbes"],["area","🌊 Aires"],["pie","🥧 Camembert"],["donut","🍩 Donut"]].map(([t,l])=>(
                <button key={t} onClick={()=>setChartType(t)} style={{background:chartType===t?"linear-gradient(135deg,#8B5CF6,#7C3AED)":"transparent",border:`1px solid ${chartType===t?"#8B5CF6":T.border}`,color:chartType===t?"#fff":T.textMuted,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:11}}>{l}</button>
              ))}
            </div>
            <div style={{color:T.textMuted,fontSize:11,marginBottom:10}}>
              💡 Sélectionnez d'abord une plage dans le tableur. La 1ère colonne = libellés, les suivantes = valeurs.
            </div>
            <div style={{borderRadius:10,overflow:"hidden",border:`1px solid ${T.border}`,minHeight:120}} dangerouslySetInnerHTML={{__html:svgChart||`<div style="padding:40px;text-align:center;color:#555;background:#0D1F38;">Sélectionnez une plage de données pour prévisualiser le graphique</div>`}}/>
            <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
              <button onClick={()=>{if(svgChart){setCharts(c=>[...c,{id:"CHT"+Date.now(),type:chartType,svg:svgChart}]);setShowChartModal(false);}}} disabled={!svgChart} style={{background:"linear-gradient(135deg,#8B5CF6,#7C3AED)",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12,opacity:svgChart?1:0.4}}>✅ Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EMBEDDED CHARTS ── */}
      {charts.length>0&&(
        <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:10}}>
          {charts.map(ch=>(
            <div key={ch.id} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:10,position:"relative",flex:"1 1 300px",minWidth:300}}>
              <button onClick={()=>setCharts(c=>c.filter(x=>x.id!==ch.id))} style={{position:"absolute",top:6,right:6,background:"#EF444422",border:"none",color:"#EF4444",borderRadius:4,cursor:"pointer",fontSize:10,padding:"2px 5px",zIndex:2}}>✕</button>
              <div dangerouslySetInnerHTML={{__html:ch.svg||""}}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


