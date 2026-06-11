import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// Dashboard.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _lsRm, lsSave, _tActive, playSound, formatCFA, formatDate, gcGetDelaiConfig, generateAccessCode, useSI, _activeUser, formatDateTime, getProcColor, LiveClock, gcDelaiStatut, daysLeft, dsSave, dsWipeKey, gcClearAllLocalFiles } from '../../core/index.js';
import { STATUS_CONFIG, PRIORITY_CONFIG, INITIAL_PARTNERS, CODES, INITIAL_SYSTEM_MSGS } from '../../core/constants.js';
import {Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, RotatingAlert, Badge, ProgressBar} from '../../components/UI.jsx';
import { AIAssistant } from '../../components/AIAssistant.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function Dashboard() {
  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const si = useSI();
  const { T, localUser, users, setUsers, dossiers, setDossiers,
    taches, setTaches, rdvs, setRdvs, partners, setPartnersSync,
    pendingApprovals, setPendingApprovals, notifications, setNotifications,
    isAdmin, isMG, isDG, isDemoMode, codifRegistry, setCodifRegistry,
    internalDocs, setInternalDocs, externalDocs, setExternalDocs,
    committees, systemMsgs, setSystemMsgs, sessionLogs, setSessionLogs,
    setActiveModule, handleSetActiveModule, selectedDossier, setSelectedDossier,
    processConfig, setProcessConfig, demandesData, setDemandesData, generateAccessCode,
    addSessionLog, onLogout, pendingAccountActions, setPendingAccountActions,
    pendingConnections = [], appHabilitations, setAppHabilitations, appAccessCodes, setAppAccessCodes,
    dossierFiles = [], saveDossierFiles} = si;
  const isRHManager = (localUser.process === "S03" || (localUser.processes||[]).includes("S03")) && localUser.level >= 4;
  const pendingActionsForDG = (pendingAccountActions||[]).filter(a => a.status === "EN_ATTENTE_DG");
  const lvl = localUser.level;
  const proc = localUser.process;
  const uid = localUser.id;

  const _dashProcs = localUser.processes || [localUser.process];
  const primaryProc = _dashProcs[0] || localUser.process;
  const canSeeFinance = lvl >= 4 || primaryProc === "S01" || primaryProc === "P03" || _dashProcs.includes("S01") || _dashProcs.includes("P03");
  const canSeeCom = lvl >= 4 || primaryProc === "S04" || _dashProcs.includes("S04");
  const canSeeAudit = lvl >= 3 || primaryProc === "S02" || primaryProc === "P02" || _dashProcs.includes("S02") || _dashProcs.includes("P02");
  const canSeeRH = lvl >= 3 || primaryProc === "S03" || _dashProcs.includes("S03");
  const canSeeLogistique = lvl >= 3 || primaryProc === "S05" || _dashProcs.includes("S05");
  const canSeeJuridique = lvl >= 3 || primaryProc === "O02" || _dashProcs.includes("O02");
  const isConformiteProc = ["P02","S02","O02"].some(p=>_dashProcs.includes(p));
  const financeVisible = isConformiteProc ? lvl >= 4 : canSeeFinance;
  const comVisible = isConformiteProc ? lvl >= 4 : canSeeCom;
  const procColors = {"P01":"#3B82F6","P02":"#A855F7","P03":"#C9A84C","P04":"#22C55E","O01":"#F97316","O02":"#EC4899","O03":"#14B8A6","S01":"#22C55E","S02":"#EF4444","S03":"#8B5CF6","S04":"#06B6D4","S05":"#F59E0B","S06":"#84CC16"};
  const procAccent = procColors[primaryProc] || "#C41E3A";
  // Salutation locale au Dashboard (indépendante de SIApp)
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6)  return { text:"Bonne nuit",      emoji:"🌙" };
    if (h < 12) return { text:"Bonjour",          emoji:"🌅" };
    if (h < 18) return { text:"Bon après-midi",   emoji:"☀️" };
    return       { text:"Bonsoir",         emoji:"🌆" };
  })();
  const [activeDashProc, setActiveDashProc] = React.useState(null); // null = tous les processus
  const [dgViewMode, setDgViewMode] = React.useState('global'); // 'global' | 'mine'
  const myDossiers = dossiers.filter(d =>
    lvl >= 4 ? true : // Niv 4+ : vue totale
    lvl >= 3 ? (d.assignedTo === uid || d.createdBy === uid || d.submittedTo === uid || (d.collaborators||[]).includes(uid) || _dashProcs.includes(d.process)) :
    (d.assignedTo === uid || d.createdBy === uid || (d.collaborators||[]).includes(uid))
  );
  const myTachesD = taches.filter(t =>
    lvl >= 4 ? true :
    lvl >= 3 ? ((t.assignedTo === uid || t.assigneeId === uid) || t.createdBy === uid || _dashProcs.some(p => dossiers.find(d => d.process === p && d.id === t.dossier))) :
    ((t.assignedTo === uid || t.assigneeId === uid) || t.createdBy === uid)
  );
  const myRdvs = rdvs.filter(r => lvl >= 4 ? true : r.assignedTo === uid);

  const enCours = myDossiers.filter(d => d.status === "EN_COURS").length;
  const enAttente = myDossiers.filter(d => d.status.startsWith("ATTENTE")).length;
  const termines = myDossiers.filter(d => d.status === "TERMINE").length;
  const urgents = myDossiers.filter(d => d.priority === "HAUTE" && d.status !== "TERMINE").length;
  const totalCA = myDossiers.reduce((a, d) => a + (d.amount || 0), 0);
  const caRealise = myDossiers.filter(d => d.status === "TERMINE").reduce((a, d) => a + (d.amount || 0), 0);
  const totalGlobal = dossiers.reduce((a, d) => a + (d.amount || 0), 0);
  const caGlobal = dossiers.filter(d => d.status === "TERMINE").reduce((a, d) => a + (d.amount || 0), 0);

  // -- Présence réelle (gc-presence heartbeat 45s) pour indicateur "en ligne" ──
  const [_gcPresence, _setGcPresence] = React.useState(() => {
    try { return JSON.parse(_lsGet('gc-presence') || '{}'); } catch (_) { return {}; }
  });
  React.useEffect(() => {
    const h = () => { try { _setGcPresence(JSON.parse(_lsGet('gc-presence') || '{}')); } catch (_) {} };
    window.addEventListener('storage', h);
    const t = setInterval(h, 30000);
    return () => { window.removeEventListener('storage', h); clearInterval(t); };
  }, []);

  // -- Données journal OHADA  -  synchronisées en live depuis localStorage --
  const [_journalRefresh, _setJournalRefresh] = React.useState(0);
  React.useEffect(() => {
    const onStorage = (e) => { if (e?.key === "gc-journal" || !e) _setJournalRefresh(n=>n+1); };
    window.addEventListener("storage", onStorage);
    // Polling léger : recharge le journal toutes les 15s si l'onglet finance est ouvert ailleurs
    const t = setInterval(()=>_setJournalRefresh(n=>n+1), 15000);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(t); };
  }, []);
  const _journalOHADA = React.useMemo(() => {
    try { return JSON.parse(_lsGet("gc-journal") || "[]"); } catch (_) { return []; }
  }, [_journalRefresh]); // rechargé à chaque refresh
  const caJournal    = _journalOHADA.filter(e => (e.compteCredit||"").startsWith("7")).reduce((a,e)=>a+(parseFloat(e.credit)||0),0)
                     + _journalOHADA.filter(e => (e.compteDebit||e.compte||"").startsWith("7")).reduce((a,e)=>a+(parseFloat(e.debit)||0),0);
  const tresoJournal = _journalOHADA.reduce((a,e)=>{
    const cd=e.compteDebit||e.compte||""; const cc=e.compteCredit||"";
    return a+(cd.startsWith("5")?parseFloat(e.debit)||0:0)-(cc.startsWith("5")?parseFloat(e.credit)||0:0);
  },0);
  const chargesJournal = _journalOHADA.filter(e=>(e.compteDebit||e.compte||"").startsWith("6")).reduce((a,e)=>a+(parseFloat(e.debit)||0),0);
  const resultatNet = caJournal - chargesJournal;
  // Source CA : journal OHADA si disponible, sinon dossiers
  const caDisplay      = caJournal > 0 ? caJournal : caGlobal;
  const caDisplayLabel = caJournal > 0 ? "Journal OHADA" : "Dossiers clôturés";

  // FIX v135 — currentUser should be localUser (destructured from siCtx)
  const tachesPending = myTachesD?.filter(_tActive) || [];
  const dossiersPending = myDossiers.filter(d => d.status !== "TERMINE");

  // Alertes dashboard  -  calcul pur (pas d'interval ici, géré dans RotatingAlert)
  // FIX v135 — Move useMemo outside conditional rendering block
  const alerts = useMemo(() => [
    enAttente > 0 && { type: "VALIDATION", message: `${enAttente} dossier(s) en attente de traitement`, color: "#F59E0B", icon: "⏳", action: "dossiers" },
    urgents > 0 && { type: "URGENT", message: `${urgents} dossier(s) à haute priorité`, color: "#C41E3A", icon: "🚨", action: "dossiers" },
    tachesPending.length > 0 && { type: "TÂCHES", message: `${tachesPending.length} tâche(s) en cours`, color: "#3B82F6", icon: "📋", action: "taches" },
    myRdvs.length > 0 && { type: "AGENDA", message: `${myRdvs.length} rendez-vous planifié(s)`, color: "#06B6D4", icon: "📅", action: "agenda" },
    lvl >= 3 && pendingApprovals.length > 0 && { type: "APPROBATION", message: `${pendingApprovals.length} approbation(s) en attente`, color: "#A855F7", icon: "👤", action: "approbations" },
    (lvl >= 5 || (localUser?.isAdmin || localUser?.level >= 6) || isRHManager) && pendingActionsForDG.length > 0 && { type: "COMPTES", message: `${pendingActionsForDG.length} action(s) de compte en attente DG`, color: "#F97316", icon: "🔑", action: "gestion_comptes" },
    lvl >= 4 && pendingConnections.length > 0 && { type: "CONNEXIONS", message: `${pendingConnections.length} demande(s) de connexion en attente d'approbation`, color: "#F59E0B", icon: "🔗", action: "gestion_comptes" },
    (() => { try { const myP = localUser.processes||[localUser.process]; const pending = (demandesData||[]).filter(d=>d.status==="EN_ATTENTE"&&(lvl>=5||(localUser?.isAdmin || localUser?.level >= 6)||myP.includes(d.targetProcess)||d.targetUserId===localUser.id)); return pending.length>0 && { type:"DEMANDES", message:`${pending.length} demande(s) en attente dans votre périmètre`, color:"#3B82F6", icon:"📨", action:"demandes" }; } catch (_) { return false; } })(),
  ].filter(Boolean), [enAttente, urgents, tachesPending.length, myRdvs.length, lvl, pendingApprovals, pendingConnections, demandesData, localUser]);
  // END FIX v135

  // -- ERP data for process KPIs — useMemo, reads LS once on mount (moved before conditionals for hooks stability)
  const _pErp = useMemo(() => {
    const r=(k,d=[])=>{try{return JSON.parse(_lsGet(k)||"null")||d;}catch(_){return d;}};
    const t=new Date().toISOString().split("T")[0];
    const bud=r("gc-budget",[]);
    const budTaux=bud.length>0?Math.round((bud.reduce((s,l)=>s+(l.realise||0),0)/Math.max(1,bud.reduce((s,l)=>s+(l.previsionnel||0),0)))*100):0;
    const stk=r("gc-stocks",[]);
    const ach=r("gc-achats",[]);
    const pres=r("gc-sirh-presences",[]);
    const lv=r("gc-sirh-leaves",[]);
    const rec=r("gc-sirh-recrutements",[]);
    const obl=r("gc-obligations",[]);
    const cmp=r("gc-comm-campagnes",[]);
    const cct=r("gc-comm-contacts",[]);
    const aud=r("gc-audit-actions",[]);
    const arc=r("gc-archives",[]);
    const jou=r("gc-journal",[]);
    return {
      budTaux, stkRup:stk.filter(s=>(s.quantite||0)<=(s.alerteSeuil||5)).length,
      achEnC:ach.filter(a=>a.statut==="EN_COURS"||a.statut==="COMMANDE").length,
      presAuj:pres.filter(p=>p.date===t&&p.statut==="PRESENT").length,
      congesNow:lv.filter(l=>l.statut==="APPROUVE"&&l.debut<=t&&l.fin>=t).length,
      recOuv:rec.filter(r=>r.statut!=="CLOTURE").length,
      oblOuv:obl.filter(o=>o.statut!=="REALISE").length,
      oblUrg:obl.filter(o=>o.statut!=="REALISE"&&o.echeance&&Math.ceil((new Date(o.echeance)-new Date())/86400000)<=7).length,
      cmpActiv:cmp.filter(c=>c.statut==="EN_COURS"||c.statut==="ACTIF").length,
      cctActif:cct.filter(c=>c.actif!==false).length,
      audOuv:aud.filter(a=>a.statut!=="TERMINE").length,
      archPend:arc.filter(a=>!a.receivedBySec&&a.status==="EN_ATTENTE_SECRETARIAT").length,
      caOHText:(()=>{const ca=jou.filter(e=>(e.compteCredit||"").startsWith("7")).reduce((s,e)=>s+(parseFloat(e.credit)||0),0);return ca>0?`${(ca/1e6).toFixed(1)}M FCFA`:"Non saisi";})(),
      jouMonth:jou.filter(e=>{try{const d=new Date(e.date||e.createdAt||0);return d.getMonth()===new Date().getMonth()&&d.getFullYear()===new Date().getFullYear();}catch(_){return false;}}).length
    };
  }, []);

  const [dgFloating, setDgFloating] = useState(null); // used by lvl 5 dashboard
  const [showDgReset, setShowDgReset] = useState(false);
  const [dgResetItems, setDgResetItems] = useState({});
  const [showTaskDelegate, setShowTaskDelegate] = useState(false);
  const [showMessaging, setShowMessaging] = useState(false);
  const [delegateForm, setDelegateForm] = useState({ titre:'', description:'', assignedTo:'', priority:'MOYENNE', process: localUser?.process||'', deadline:'' });

  // ── Mode Incognito Admin ── masque ses propres traces dans les journaux ──
  const [adminIncognito, setAdminIncognito] = useState(() => {
    try { return !!JSON.parse(_lsGet("gc-admin-incognito")||"false"); } catch(_) { return false; }
  });
  const toggleAdminIncognito = () => {
    const next = !adminIncognito;
    setAdminIncognito(next);
    try { _lsSet("gc-admin-incognito", JSON.stringify(next)); } catch(_) {}
    if (next && setSessionLogs) {
      setSessionLogs(prev => prev.filter(l => l.userId !== localUser.id));
      try { const logs=JSON.parse(_lsGet("gc-session-logs")||"[]"); const filtered=logs.filter(l=>l.userId!==localUser.id); _lsSet("gc-session-logs",JSON.stringify(filtered)); dsSave("gc-session-logs",filtered).catch(err => gcToast.syncError('', err)); } catch(_) {}
    }
    playSound("success");
  };

  if (isAdmin) {
    return (
      <div>
        <SmartBanner localUser={localUser} systemMsgs={systemMsgs} dossiers={dossiers} taches={taches} rdvs={rdvs} pendingApprovals={pendingApprovals} pendingConnections={pendingConnections} pendingAccountActions={pendingAccountActions} demandesData={demandesData} setActiveModule={setActiveModule} T={T} procColors={procColors} />
        {/* First-time setup wizard */}
        {users.length <= 1 && (
          <div style={{ background: "linear-gradient(135deg,#0A1E4A,#1A3A7A)", border: "2px solid #C9A84C", borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 32 }}>🚀</div>
              <div>
                <div style={{ color: "#C9A84C", fontWeight: 900, fontSize: 16 }}>Bienvenue dans le SI Génie Consultant — Configuration initiale</div>
                <div style={{ color: "#A0B8D8", fontSize: 12, marginTop: 3 }}>Le système est vierge et prêt à être configuré. Suivez les étapes ci-dessous pour démarrer.</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[
                { step: "1", title: "Créer les collaborateurs", desc: "Ajoutez tous les comptes utilisateurs depuis Paramètres Admin → Gestion Comptes", icon: "👥", action: "admin", color: "#3B82F6" },
                { step: "2", title: "Configurer les processus", desc: "Téléversez les documents internes et configurez la cartographie des processus", icon: "🗺️", action: "processus", color: "#A855F7" },
                { step: "3", title: "Paramétrer le SI", desc: "Renseignez les informations du cabinet dans Paramètres SI", icon: "⚙️", action: "admin", color: "#22C55E" },
              ].map(s => (
                <div key={s.step} onClick={() => setActiveModule(s.action)} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${s.color}44`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "background 0.2s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ background: s.color + "33", border: `1px solid ${s.color}55`, borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: s.color, fontWeight: 900 }}>{s.step}</div>
                    <span style={{ fontSize: 16 }}>{s.icon}</span>
                    <span style={{ color: "#E8EDF5", fontWeight: 700, fontSize: 12 }}>{s.title}</span>
                  </div>
                  <div style={{ color: "#7A90B0", fontSize: 11, lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Salutation Admin */}
        <div style={{ background: `linear-gradient(135deg,#C41E3A22,${T.surface2})`, border: "1px solid #C41E3A44", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#C41E3A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚙️</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>{greeting.text}, Superviseur {greeting.emoji}</div>
            <div style={{ color: T.textMuted, fontSize: 11 }}>Administration Système • {formatDate(new Date().toISOString())} • <LiveClock color="#C41E3A" /></div>
          </div>
          {/* ── Bouton Incognito Admin ── */}
          <button
            onClick={toggleAdminIncognito}
            title={adminIncognito ? "Mode Incognito ACTIF — Vos traces sont masquées. Cliquer pour désactiver" : "Activer le mode Incognito — Masque vos activités dans les journaux"}
            style={{
              background: adminIncognito ? "#1A1A2E" : "transparent",
              border: `1px solid ${adminIncognito ? "#A855F766" : "#C41E3A44"}`,
              borderRadius: 8, padding: "6px 12px", cursor: "pointer",
              color: adminIncognito ? "#A855F7" : T.textMuted,
              fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5,
              transition: "all 0.2s", flexShrink: 0,
              boxShadow: adminIncognito ? "0 0 12px #A855F744" : "none"}}>
            <span>{adminIncognito ? "🕵️" : "👤"}</span>
            <span>{adminIncognito ? "Incognito ON" : "Incognito"}</span>
          </button>
          <div style={{ background: "#C41E3A22", border: "1px solid #C41E3A44", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
            <div style={{ color: "#C41E3A", fontWeight: 800, fontSize: 11 }}>MODE ADMIN</div>
            <div style={{ color: T.textMuted, fontSize: 9 }}>Niveau 6 — Accès Total</div>
          </div>
        </div>
        {adminIncognito && (
          <div style={{ background:"#A855F712", border:"1px solid #A855F733", borderRadius:8, padding:"8px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{fontSize:16}}>🕵️</span>
            <div style={{flex:1}}>
              <div style={{color:"#A855F7", fontWeight:800, fontSize:11}}>Mode Incognito Superviseur ACTIF</div>
              <div style={{color:T.textMuted, fontSize:10}}>Vos connexions et actions sont exclues des journaux visibles par les autres utilisateurs. Vos traces ont été effacées rétroactivement.</div>
            </div>
            <button onClick={toggleAdminIncognito} style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>Désactiver</button>
          </div>
        )}
        <div style={{ background: "#C41E3A22", border: "1px solid #C41E3A44", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>⚙️</span>
            <div>
              <div style={{ color: "#C41E3A", fontWeight: 800, fontSize: 12 }}>MODE ADMINISTRATEUR SYSTÈME</div>
              <div style={{ color: T.textMuted, fontSize: 11 }}>Accès complet à la configuration du SI, gestion des utilisateurs et paramétrage global.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { icon: "⚙️", label: "Paramètres SI",      mod: "admin", tab: "settings" },
              { icon: "🔄", label: "Sync & Intégrité",   mod: "admin", tab: "sync_control" },
              { icon: "🔐", label: "Gestion accès",       mod: "admin", tab: "connexions" },
              { icon: "🗂️", label: "Matrice programmes", mod: "admin", tab: "matrix" },
              { icon: "💾", label: "Export / Import",     mod: "admin", tab: "export_backup" },
              { icon: "📋", label: "Journaux & Logs",     mod: "admin", tab: "logs" },
            ].map(a => (
              <button key={a.label}
                onClick={() => {
                  try { sessionStorage.setItem('gc-admin-tab', a.tab); } catch (_) {}
                  setActiveModule(a.mod);
                  playSound("notif");
                }}
                style={{ background: "#C41E3A18", border: "1px solid #C41E3A44", borderRadius: 7, padding: "5px 11px", color: "#C41E3A", cursor: "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                <span>{a.icon}</span><span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }} className="gc-stagger">
          {[
            { label:"Utilisateurs actifs", value:users.length, icon:"👥", color:"#3B82F6", action:"utilisateurs", sub:`${users.filter(u=>_activeUser(u)&&u.level>=3).length} responsables`, pct:Math.min(100,Math.round((users.length/Math.max(users.length,20))*100)) },
            { label:"Dossiers totaux", value:dossiers.length, icon:"📁", color:"#A855F7", action:"dossiers", sub:`${dossiers.filter(d=>d.status!=="TERMINE").length} actifs`, pct:Math.min(100,Math.round((dossiers.filter(d=>d.status!=="TERMINE").length/Math.max(dossiers.length,1))*100)) },
            { label:"CA Réalisé", value:`${(caDisplay/1000000).toFixed(1)}M`, icon:"💰", color:"#C9A84C", action:"indicateurs", sub:caDisplayLabel, pct:totalGlobal>0?Math.min(100,Math.round((caDisplay/Math.max(totalGlobal,caDisplay))*100)):0 },
            { label:"Approbations", value:pendingApprovals.length, icon:"✅", color:"#F59E0B", action:"approbations", sub:pendingApprovals.length===0?"Tout traité ✓":"en attente", pct:Math.max(10,100-Math.min(100,pendingApprovals.length*20)) },
          ].map(s => (
            <div key={s.label} onClick={() => { setActiveModule(s.action); playSound("notif"); }} className="gc-hover-card gc-fade-up" style={{ background: `linear-gradient(135deg, ${T.surface2}, ${T.surface3})`, border: `1px solid ${s.color}33`, borderRadius: 14, padding: "16px 14px", cursor: "pointer", boxShadow: `0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: s.color+"22", border: `1px solid ${s.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{s.icon}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: s.color, fontSize: 24, fontWeight: 900, lineHeight: 1 }} className="gc-count-up">{s.value}</div>
                  <div style={{ color: T.textMuted, fontSize: 9 }}>{s.sub}</div>
                </div>
              </div>
              <div style={{ color: T.textMuted, fontSize: 11, marginTop: 10, fontWeight: 600 }}>{s.label}</div>
              <div style={{ width:"100%", height:3, background:s.color+"22", borderRadius:2, marginTop:8, overflow:"hidden" }}>
                <div className="gc-progress-fill" style={{ width:`${s.pct||70}%`, height:"100%", background:s.color, borderRadius:2, transition:"width 1s ease" }} />
              </div>
              <div style={{ color:s.color, fontSize:8, marginTop:1, textAlign:"right", fontWeight:700 }}>{s.pct||70}%</div>
            </div>
          ))}
        </div>
        {/* ── KPIs financiers depuis journal OHADA (si données présentes) ── */}
        {_journalOHADA.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
            {[
              { label:"Produits (Cl.7)", value:`${(caJournal/1000000).toFixed(2)}M FCFA`, icon:"📈", color:"#22C55E", sub:`${_journalOHADA.filter(e=>(e.compteDebit||e.compte||"").startsWith("7")).length} écritures` },
              { label:"Charges (Cl.6)", value:`${(chargesJournal/1000000).toFixed(2)}M FCFA`, icon:"📉", color:"#EF4444", sub:`${_journalOHADA.filter(e=>(e.compteDebit||e.compte||"").startsWith("6")).length} écritures` },
              { label:"Trésorerie nette", value:`${(tresoJournal/1000000).toFixed(2)}M FCFA`, icon:"💎", color:tresoJournal>=0?"#C9A84C":"#EF4444", sub:resultatNet>=0?"Résultat positif ✓":"Résultat négatif ⚠" },
            ].map(k => (
              <div key={k.label} style={{ background: T.surface2, border: `1px solid ${k.color}33`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:18 }}>{k.icon}</span>
                  <span style={{ color:k.color, fontWeight:800, fontSize:13 }}>{k.value}</span>
                </div>
                <div style={{ color: T.textMuted, fontSize:10, fontWeight:700 }}>{k.label}</div>
                <div style={{ color: T.textDim, fontSize:9 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ background: T.surface2, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <h4 style={{ color: "#C41E3A", margin: "0 0 10px", fontSize: 13, fontWeight: 800 }}>👥 Répartition par processus</h4>
            {(() => {
              const procCounts = {};
              const allInts = users.filter(u => _activeUser(u)&&!u.isAdmin && u.id !== "USR-ADM-000");
              allInts.forEach(u => {
                const procs = (u.processes && u.processes.length > 0) ? u.processes : [u.process].filter(Boolean);
                procs.forEach(p => { procCounts[p] = (procCounts[p] || 0) + 1; });
              });
              const maxCount = Math.max(1, ...Object.values(procCounts));
              const procGroups = [
                { pfx:"P", label:"Pilotage", c:"#3B82F6" },
                { pfx:"O", label:"Opérationnel", c:"#22C55E" },
                { pfx:"S", label:"Support", c:"#FF7900" },
              ];
              return (
                <div>
                  {/* Totaux par catégorie */}
                  <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                    {procGroups.map(g => {
                      const total = Object.entries(procCounts).filter(([k])=>k.startsWith(g.pfx)).reduce((a,[_k,v])=>a+v,0);
                      const uniq = new Set(allInts.filter(u=>{const pr=(u.processes&&u.processes.length>0)?u.processes:[u.process];return pr.some(p=>p&&p.startsWith(g.pfx));}).map(u=>u.id)).size;
                      return <div key={g.pfx} style={{background:g.c+"15",border:`1px solid ${g.c}44`,borderRadius:8,padding:"5px 10px",fontSize:10,color:g.c,fontWeight:800,flex:1,textAlign:"center"}}>
                        <div style={{fontSize:15,fontWeight:900}}>{uniq}</div>
                        <div style={{fontSize:9}}>{g.label}</div>
                        {total !== uniq && <div style={{fontSize:8,opacity:0.7}}>{total} affectations</div>}
                      </div>;
                    })}
                    <div style={{background:"#A855F715",border:"1px solid #A855F744",borderRadius:8,padding:"5px 10px",fontSize:10,color:"#A855F7",fontWeight:800,flex:1,textAlign:"center"}}>
                      <div style={{fontSize:15,fontWeight:900}}>{allInts.filter(u=>(u.processes||[]).length>1).length}</div>
                      <div style={{fontSize:9}}>Multi-process</div>
                    </div>
                  </div>
                  {/* Barres par processus */}
                  {Object.entries(CODES.processes).map(([code, label]) => {
                    const count = procCounts[code] || 0;
                    if (count === 0) return null;
                    const pct = Math.round((count/maxCount)*100);
                    const grp = procGroups.find(g=>code.startsWith(g.pfx));
                    const barColor = grp?.c || "#C41E3A";
                    return (
                      <div key={code} style={{ marginBottom: 5 }}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            <span style={{ background:barColor+"22",border:`1px solid ${barColor}44`,borderRadius:4,padding:"1px 5px",color:barColor,fontSize:9,fontWeight:900,fontFamily:"monospace"}}>{code}</span>
                            <span style={{color:T.textDim,fontSize:9,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
                          </div>
                          <span style={{color:barColor,fontSize:9,fontWeight:700}}>{count}</span>
                        </div>
                        <div style={{ height: 5, background: T.surface3, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${barColor},${barColor}88)`, borderRadius: 3, transition:"width 0.8s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                  <div style={{marginTop:8,fontSize:9,color:T.textDim,textAlign:"right"}}>
                    ★ Les collaborateurs dans plusieurs processus sont comptés dans chaque processus concerné
                  </div>
                </div>
              );
            })()}
          </div>
          <div style={{ background: T.surface2, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <h4 style={{ color: "#C41E3A", margin: "0 0 10px", fontSize: 13, fontWeight: 800 }}>🔐 Dernières connexions</h4>
            {/* Dernières connexions réelles depuis sessionLogs */}
            {(sessionLogs || [])
              .filter(l => l.type === "CONNEXION" && l.status === "SUCCESS")
              .sort((a,b) => new Date(b.at) - new Date(a.at))
              .slice(0, 6)
              .map(log => {
                const u = users.find(x => x.id === log.userId) || { name: log.userName, avatar: "?", color: "#555", level: log.userLevel || 1, process: log.userProcess || "—" };
                const presenceTs = _gcPresence[log.userId];
                const isRecent = presenceTs && (Date.now() - presenceTs) < 45000;
                return (
                  <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${T.border}20` }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: u.color || "#555", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff", fontWeight: 700 }}>{u.avatar || (u.name||"?")[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontSize: 11, fontWeight: 600 }}>{log.userName || u.name}</div>
                      <div style={{ color: T.textMuted, fontSize: 9 }}>Niv.{u.level} • {u.process} • {formatDateTime(log.at)}</div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: isRecent ? "#22C55E" : "#7A90B0" }} title={isRecent ? "En ligne (actif <45s)" : "Hors ligne"} />
                  </div>
                );
              })
            }
            {(sessionLogs || []).filter(l => l.type === "CONNEXION" && l.status === "SUCCESS").length === 0 && (
              <div style={{ color: T.textDim, fontSize: 10, textAlign: "center", padding: 12 }}>Aucune connexion enregistrée</div>
            )}
          </div>
          <div style={{ background: T.surface2, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <h4 style={{ color: "#C41E3A", margin: "0 0 10px", fontSize: 13, fontWeight: 800 }}>📊 État des dossiers (global)</h4>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const cnt = dossiers.filter(d => d.status === key).length;
              return cnt > 0 ? (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ color: cfg.color, fontSize: 14 }}>{cfg.icon}</span>
                  <div style={{ flex: 1, color: T.textMuted, fontSize: 11 }}>{cfg.label}</div>
                  <span style={{ color: cfg.color, fontWeight: 800, fontSize: 13 }}>{cnt}</span>
                </div>
              ) : null;
            })}
          </div>
          <div style={{ background: T.surface2, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <h4 style={{ color: "#C41E3A", margin: "0 0 10px", fontSize: 13, fontWeight: 800 }}>⚡ Actions rapides SI</h4>
            {[
              { icon: "👤", label: "Ajouter un utilisateur", mod: "utilisateurs" },
              { icon: "📁", label: "Nouveau dossier", mod: "dossiers" },
              { icon: "✅", label: "Gérer les approbations", mod: "approbations" },
              { icon: "🏷️", label: "Manuel de codification", mod: "codification" },
              { icon: "⚙️", label: "Paramètres Admin", mod: "admin" },
            ].map(a => (
              <button key={a.label} onClick={() => setActiveModule(a.mod)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", color: T.text, fontSize: 12, marginBottom: 6 }}>
                <span>{a.icon}</span><span>{a.label}</span><span style={{ marginLeft: "auto", color: T.textDim }}>›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (lvl === 5) {
    const DG_RESET_ITEMS = [
      {k:"dossiers",       l:"📁 Dossiers & Documents",           danger:false},
      {k:"taches",         l:"📋 Tâches & Alertes",               danger:false},
      {k:"rdvs",           l:"📅 Agenda & RDV",                   danger:false},
      {k:"partners",       l:"🤝 Collaborateurs Externes",         danger:false},
      {k:"sirh",           l:"👥 Données SIRH complètes",          danger:false},
      {k:"approvals",      l:"✅ Approbations en cours",           danger:false},
      {k:"messages",       l:"✉️ Messages & Courrier interne",     danger:true},
      {k:"codification",   l:"🏷️ Codification & Références",      danger:false},
      {k:"infos_comp",     l:"📣 Messages Système",                danger:false},
      {k:"documents",      l:"📂 Documents internes & externes",   danger:false},
      {k:"demandes",       l:"📨 Demandes collaborateurs",         danger:false},
      {k:"kanban_notes",   l:"🗂️ Kanban & Notes rapides",          danger:false},
      {k:"archives",       l:"🗂️ Registre d'archivage",            danger:false},
      {k:"finance",        l:"💰 Finance & Comptabilité",          danger:false},
      {k:"audit",          l:"🔍 Audit & Contrôle",                danger:false},
      {k:"logistique",     l:"🚚 Logistique & Inventaires",        danger:false},
      {k:"comm",           l:"📢 Communication & Marketing",       danger:false},
    ];
    // -- KPIs DG : sources filtrées selon le mode de vue -------------------------
    const _dgDoss  = dgViewMode === 'mine' ? dossiers.filter(d => d.createdBy === uid || d.assignedTo === uid || (d.collaborators||[]).includes(uid)) : dossiers;
    const _dgTaches = dgViewMode === 'mine' ? taches.filter(t => t.assignedTo === uid || t.assigneeId === uid || t.createdBy === uid) : taches;
    const _dgRdvs  = dgViewMode === 'mine' ? rdvs.filter(r => r.assignedTo === uid || r.createdBy === uid) : rdvs;
    const _dgTotal = _dgDoss.reduce((a, d) => a + (d.amount || 0), 0);
    const _dgCA    = _dgDoss.filter(d => d.status === "TERMINE").reduce((a, d) => a + (d.amount || 0), 0);
    const tauxReal5 = _dgTotal > 0 ? Math.round((_dgCA / _dgTotal) * 100) : 0;
    const caPortef  = dgViewMode === 'mine' ? _dgTotal : (caJournal > 0 ? caJournal : totalGlobal);
    const caAffiche = dgViewMode === 'mine' ? _dgCA    : caDisplay;
    const tachesDGEnCours  = _dgTaches.filter(_tActive).length;
    const tachesDGUrgentes = _dgTaches.filter(t => _tActive(t) && t.priority === "HAUTE").length;
    const rdvsAujourdhui   = _dgRdvs.filter(r => r.date === new Date().toISOString().split("T")[0]).length;
    const collabsActifs    = users.filter(u => _activeUser(u)&&(u.isActive !== false) && !u.isAdmin && (u.accountStatus||"ACTIF")==="ACTIF").length;
    const _dgUrgents = _dgDoss.filter(d => d.priority === "HAUTE" && d.status !== "TERMINE").length;
    const kpis = [
      {
        label: "Dossiers actifs", key: "dossiers", icon: "📁", color: "#3B82F6",
        value: _dgDoss.filter(d => !["TERMINE","ARCHIVE"].includes(d.status)).length,
        sub: `${_dgDoss.filter(d=>d.status==="EN_COURS").length} en cours · ${_dgDoss.filter(d=>d.dueDate&&d.dueDate<new Date().toISOString().split("T")[0]&&!["TERMINE","ARCHIVE"].includes(d.status)).length} en retard`},
      {
        label: "CA Portefeuille", key: "ca", icon: "💰", color: "#C9A84C",
        value: `${(caPortef/1000000).toFixed(2)}M`,
        sub: dgViewMode === 'mine' ? "Mes dossiers" : (caJournal > 0 ? "OHADA" : "Dossiers")},
      {
        label: "CA Réalisé", key: "ca_realise", icon: "✅", color: "#22C55E",
        value: `${(caAffiche/1000000).toFixed(2)}M`,
        sub: `Taux ${tauxReal5}%`},
      {
        label: "Urgents", key: "urgents", icon: "🚨",
        color: _dgUrgents > 0 ? "#C41E3A" : "#22C55E",
        value: _dgUrgents,
        sub: _dgUrgents > 0 ? "⚠️ Priorité haute" : "✓ Aucun urgent"},
      {
        label: "Approbations", key: "approvals", icon: "👤",
        color: pendingApprovals.length > 0 ? "#F59E0B" : "#22C55E",
        value: pendingApprovals.length,
        sub: pendingApprovals.length === 0 ? "Tout traité ✓" : "en attente"},
      {
        label: dgViewMode === 'mine' ? "Mes collabs" : "Collaborateurs", key: "users", icon: "👥", color: "#8B5CF6",
        value: collabsActifs,
        sub: `${users.length} comptes total`},
      {
        label: "Tâches actives", key: "taches", icon: "📋",
        color: tachesDGUrgentes > 0 ? "#EF4444" : "#06B6D4",
        value: tachesDGEnCours,
        sub: tachesDGUrgentes > 0 ? `⚡ ${tachesDGUrgentes} urgentes` : `${rdvsAujourdhui} RDV auj.`},
    ];

    return (
      <div>
        <SmartBanner localUser={localUser} systemMsgs={systemMsgs} dossiers={dossiers} taches={taches} rdvs={rdvs} pendingApprovals={pendingApprovals} pendingConnections={pendingConnections} pendingAccountActions={pendingAccountActions} demandesData={demandesData} setActiveModule={setActiveModule} T={T} procColors={procColors} />
        {/* Salutation DG dynamique */}
        <div style={{ background: `linear-gradient(135deg,#C9A84C22,${T.surface2})`, border: "1px solid #C9A84C44", borderRadius: 14, padding: "14px 18px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: localUser.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", fontWeight: 800, border: "2px solid #C9A84C66", boxShadow: "0 0 16px #C9A84C44", overflow: "hidden", flexShrink: 0 }}>{localUser.photoUrl ? <img src={localUser.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : localUser.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: T.text, fontWeight: 900, fontSize: 15 }}>{greeting.text}, {localUser.name.split(" ")[0]} {greeting.emoji}</div>
            <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>Direction Générale · {formatDate(new Date().toISOString())} · <LiveClock color="#C9A84C" /></div>
            <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
              {pendingApprovals.length > 0 && <span style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:6,padding:"2px 8px",color:"#F59E0B",fontSize:9,fontWeight:700}}>⏳ {pendingApprovals.length} approbations</span>}
              {urgents > 0 && <span style={{background:"#C41E3A22",border:"1px solid #C41E3A44",borderRadius:6,padding:"2px 8px",color:"#C41E3A",fontSize:9,fontWeight:700}}>🚨 {urgents} urgents</span>}
              {pendingApprovals.length === 0 && urgents === 0 && <span style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:6,padding:"2px 8px",color:"#22C55E",fontSize:9,fontWeight:700}}>✅ Tout est à jour</span>}
            </div>
          </div>
          <button onClick={() => setShowTaskDelegate(true)} style={{ background: "#C41E3A", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>📋 Déléguer</button>
          <button onClick={() => setShowDgReset(true)} style={{ background: "#1E3A5F", border: "1px solid #F59E0B44", color: "#F59E0B", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12, flexShrink: 0 }} title="Réinitialisation partielle DG">⚙️ Réinit. SI</button>
        </div>

        <RotatingAlert alerts={alerts} setActiveModule={setActiveModule} T={T} />

        {/* Toggle vue DG : activité globale vs mes propres travaux */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[
            { key: 'global', label: '🌐 Activité globale', sub: 'Tous les collaborateurs' },
            { key: 'mine',   label: '👤 Mes travaux',       sub: 'Mes dossiers & tâches' },
          ].map(v => (
            <button key={v.key} onClick={() => setDgViewMode(v.key)}
              style={{ flex: 1, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 11, border: dgViewMode === v.key ? "2px solid #C9A84C" : `1px solid ${T.border}`, background: dgViewMode === v.key ? "#C9A84C22" : T.surface2, color: dgViewMode === v.key ? "#C9A84C" : T.textMuted, transition: "all 0.15s" }}>
              {v.label}<br /><span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{v.sub}</span>
            </button>
          ))}
        </div>

        {/* KPIs modernes DG — 7 cards cliquables */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8, marginBottom: 14 }} className="gc-stagger">
          {kpis.map(s => (
            <div key={s.label} onClick={() => setDgFloating(dgFloating === s.key ? null : s.key)}
              style={{ background: dgFloating===s.key?`${s.color}22`:`linear-gradient(135deg,${s.color}12,${T.surface2})`, border: dgFloating === s.key ? `2px solid ${s.color}` : `1px solid ${s.color}33`, borderRadius: 12, padding: "12px 10px", cursor: "pointer", transition: "all 0.2s" }}
              onMouseEnter={e=>{if(dgFloating!==s.key){e.currentTarget.style.borderColor=s.color+"66";e.currentTarget.style.transform="translateY(-2px)";}}}
              onMouseLeave={e=>{if(dgFloating!==s.key){e.currentTarget.style.borderColor=s.color+"33";e.currentTarget.style.transform="";}}}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems:"flex-start" }}><span style={{ fontSize: 16 }}>{s.icon}</span><span style={{ color: s.color, fontSize: 18, fontWeight: 900, lineHeight:1 }}>{s.value}</span></div>
              <div style={{ color: T.text, fontSize: 9, marginTop: 6, fontWeight: 700 }}>{s.label}</div>
              {s.sub && <div style={{ color: s.color, fontSize: 8, marginTop:1 }}>{s.sub}</div>}
              <div style={{ height:2, background:s.color+"22", borderRadius:1, marginTop:5 }}><div style={{width:`${dgFloating===s.key?100:60}%`,height:"100%",background:s.color,transition:"width 0.4s",borderRadius:1}}/></div>
            </div>
          ))}
        </div>

        {/* KPIs OHADA si données présentes */}
        {_journalOHADA.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
            {[
              { label:"Produits (Cl.7)", value:`${(caJournal/1000000).toFixed(2)}M FCFA`, icon:"📈", color:"#22C55E", sub:`${_journalOHADA.filter(e=>(e.compteDebit||"").startsWith("7")).length} écritures` },
              { label:"Charges (Cl.6)", value:`${(chargesJournal/1000000).toFixed(2)}M FCFA`, icon:"📉", color:"#EF4444", sub:`${_journalOHADA.filter(e=>(e.compteDebit||"").startsWith("6")).length} écritures` },
              { label:"Résultat net OHADA", value:`${(resultatNet/1000000).toFixed(2)}M FCFA`, icon:resultatNet>=0?"💎":"⚠️", color:resultatNet>=0?"#C9A84C":"#EF4444", sub:resultatNet>=0?"Situation positive ✓":"Résultat négatif ⚠" },
            ].map(k => (
              <div key={k.label} style={{ background: T.surface2, border: `1px solid ${k.color}33`, borderRadius: 10, padding: "12px 14px", display:"flex", alignItems:"center", gap:12 }}>
                <span style={{fontSize:20}}>{k.icon}</span>
                <div>
                  <div style={{ color: k.color, fontWeight: 900, fontSize: 13 }}>{k.value}</div>
                  <div style={{ color: T.text, fontSize: 10, fontWeight: 700 }}>{k.label}</div>
                  <div style={{ color: T.textDim, fontSize: 9 }}>{k.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Floating KPI detail window */}
        {dgFloating && (() => {
          const kpi = kpis.find(k => k.key === dgFloating);
          let details = [];
          if (dgFloating === "dossiers") details = _dgDoss.filter(d => d.status !== "TERMINE").map(d => ({ label: d.client, sub: `${d.ref} — J-${Math.max(0, daysLeft(d.dueDate))}`, color: STATUS_CONFIG[d.status]?.color || "#3B82F6", extra: `${d.progress}%` }));
          if (dgFloating === "ca" || dgFloating === "ca_realise") details = Object.keys(CODES.processes).map(p => { const pd = _dgDoss.filter(d => d.process === p); const ca = pd.reduce((a,d) => a+(d.amount||0), 0); return ca > 0 ? { label: `${p} — ${CODES.processes[p]}`, sub: `${pd.length} dossier(s)`, color: "#C9A84C", extra: formatCFA(ca) } : null; }).filter(Boolean);
          if (dgFloating === "urgents") details = _dgDoss.filter(d => d.priority === "HAUTE" && d.status !== "TERMINE").map(d => ({ label: d.client, sub: d.ref, color: "#C41E3A", extra: `J-${daysLeft(d.dueDate)}` }));
          if (dgFloating === "approvals") details = pendingApprovals.map(a => ({ label: a.applicant||a.userName||"—", sub: a.function||a.userRole||"—", color: "#A855F7", extra: a.status }));
          // FIX v63: nouvelles clés users et taches
          if (dgFloating === "users") details = users.filter(u=>_activeUser(u)&&!u.isAdmin&&u.isActive!==false).sort((a,b)=>(b.level||0)-(a.level||0)).map(u=>({ label:u.name, sub:`Niv.${u.level} · ${u.process||"—"}`, color:u.color||"#888", extra:u.role||"—" }));
          if (dgFloating === "taches") details = taches.filter(t=>t.status!=="TERMINE").sort((a,b)=>{const pp={HAUTE:0,MOYENNE:1,BASSE:2};return (pp[a.priority]??1)-(pp[b.priority]??1);}).slice(0,20).map(t=>({ label:t.titre, sub:formatDate(t.deadline)||"—", color:PRIORITY_CONFIG[t.priority]?.color||"#F59E0B", extra:PRIORITY_CONFIG[t.priority]?.label||t.priority }));
          return (
            <div style={{ background: T.surface, border: `2px solid ${kpi.color}`, borderRadius: 12, padding: 16, marginBottom: 14, position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h4 style={{ color: kpi.color, margin: 0, fontWeight: 800, fontSize: 13 }}>{kpi.icon} {kpi.label} — Détails en temps réel</h4>
                <button onClick={() => setDgFloating(null)} style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                {details.length === 0 ? <div style={{ color: T.textMuted, fontSize: 12, padding: 10 }}>Aucune donnée disponible</div> :
                details.map((d, i) => (
                  <div key={i} style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px", border: `1px solid ${d.color}33` }}>
                    <div style={{ color: T.text, fontSize: 12, fontWeight: 600 }}>{d.label}</div>
                    <div style={{ color: T.textMuted, fontSize: 10 }}>{d.sub}</div>
                    <div style={{ color: d.color, fontWeight: 700, fontSize: 13, marginTop: 4 }}>{d.extra}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ background: T.surface2, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <h4 style={{ color: "#C41E3A", margin: 0, fontSize: 13, fontWeight: 800 }}>📁 Dossiers actifs prioritaires</h4>
              <button onClick={()=>setActiveModule("dossiers")} style={{background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:10,fontWeight:700}}>Tout →</button>
            </div>
            {dossiersPending.sort((a,b)=>{if(a.priority==="HAUTE"&&b.priority!=="HAUTE")return -1;if(b.priority==="HAUTE")return 1;return daysLeft(a.dueDate)-daysLeft(b.dueDate);}).slice(0, 5).map(d => {
              const sc = STATUS_CONFIG[d.status];
              const ds = gcDelaiStatut(d.dueDate);
              return <div key={d.id} onClick={() => setSelectedDossier(d)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", background: T.surface3, borderRadius: 8, border: `1px solid ${ds.statut==="DEPASSE"?"#C41E3A44":ds.statut==="CRITIQUE"?"#EF444433":T.border}`, marginBottom: 4, cursor: "pointer" }}>
                <span style={{ color: sc.color, fontSize: 12 }}>{sc.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.text, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.client}</div>
                  <div style={{height:3,background:T.surface2,borderRadius:2,marginTop:2}}>
                    <div style={{width:`${d.progress||0}%`,height:"100%",background:sc.color,borderRadius:2,transition:"width 0.5s"}}/>
                  </div>
                  <div style={{ color: T.textMuted, fontSize: 9, marginTop:1 }}>{d.ref} · {d.progress||0}%</div>
                </div>
                <div style={{color:ds.color,fontSize:9,fontWeight:700,flexShrink:0,background:ds.color+"15",borderRadius:4,padding:"1px 5px",border:`1px solid ${ds.color}33`}}>{ds.label}</div>
              </div>;
            })}
          </div>
          <div style={{ background: T.surface2, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <h4 style={{ color: "#C41E3A", margin: "0 0 10px", fontSize: 13, fontWeight: 800 }}>💰 CA par processus — Heatmap</h4>
            {Object.entries(CODES.processes).map(([p, label]) => {
              const pd = dossiers.filter(d => d.process === p);
              const ca = pd.reduce((a,d) => a + (d.amount||0), 0);
              if (!ca) return null;
              const pct = totalGlobal > 0 ? Math.round((ca / totalGlobal) * 100) : 0;
              const grpColor = p.startsWith("P")?"#3B82F6":p.startsWith("O")?"#22C55E":"#F59E0B";
              return <div key={p} style={{ marginBottom: 7 }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{background:grpColor+"22",border:`1px solid ${grpColor}44`,borderRadius:4,padding:"1px 5px",color:grpColor,fontSize:9,fontWeight:900,fontFamily:"monospace"}}>{p}</span>
                    <span style={{color:T.textDim,fontSize:9,maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(label).slice(0,20)}</span>
                  </div>
                  <span style={{color:"#C9A84C",fontSize:9,fontWeight:700}}>{formatCFA(ca)}</span>
                </div>
                <div style={{height:6,background:T.surface3,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${grpColor},${grpColor}88)`,borderRadius:3,transition:"width 0.8s ease"}}/>
                </div>
                <div style={{textAlign:"right",color:grpColor,fontSize:8,marginTop:1,fontWeight:700}}>{pct}%</div>
              </div>;
            })}
          </div>
          <div style={{ background: T.surface2, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <h4 style={{ color: "#C41E3A", margin: "0 0 10px", fontSize: 13, fontWeight: 800 }}>📊 KPIs Stratégiques</h4>
            {(()=>{
              const totalDoss = dossiers.length || 1;
              const activeDoss = dossiers.filter(d => d.status !== "TERMINE");
              const terminesDoss = dossiers.filter(d => d.status === "TERMINE");

              // 1. Taux de clôture : dossiers terminés / total
              const tauxCloture = Math.round((terminesDoss.length / totalDoss) * 100);

              // 2. Respect des délais : dossiers actifs dont dueDate >= aujourd'hui (ou pas de dueDate) / actifs avec dueDate
              const avecEcheance = activeDoss.filter(d => d.dueDate);
              const enRetardCount = avecEcheance.filter(d => daysLeft(d.dueDate) < 0).length;
              const onTime = avecEcheance.length > 0
                ? Math.round(((avecEcheance.length - enRetardCount) / avecEcheance.length) * 100)
                : 100;

              // 3. Satisfaction client : basé sur le taux d'avancement moyen des dossiers terminés
              // Proxy : % de dossiers terminés SANS retard parmi tous les terminés qui avaient une deadline
              const termAvecDate = terminesDoss.filter(d => d.dueDate);
              const termOnTime = termAvecDate.filter(d => {
                // Un dossier terminé est "satisfaisant" s'il a un avancement >= 100 et pas marqué en retard
                return d.progress >= 100 && d.priority !== "CRITIQUE";
              }).length;
              const satifClient = termAvecDate.length > 0
                ? Math.round((termOnTime / termAvecDate.length) * 100)
                : Math.round((terminesDoss.filter(d => d.progress >= 100).length / Math.max(terminesDoss.length, 1)) * 100);

              // 4. Conformité processus : % de tâches sans status "EN_RETARD" ou "BLOQUE" parmi les tâches actives
              const tachesActives = taches.filter(_tActive);
              const tachesConformes = tachesActives.filter(t =>
                t.status !== "BLOQUE" && !(t.deadline && daysLeft(t.deadline) < -3)
              ).length;
              const conformite = tachesActives.length > 0
                ? Math.round((tachesConformes / tachesActives.length) * 100)
                : 100;

              const kpis = [
                { label: "Taux de clôture",     value: tauxCloture, color: tauxCloture >= 60 ? "#22C55E" : tauxCloture >= 40 ? "#F59E0B" : "#EF4444",
                  sub: `${terminesDoss.length}/${totalDoss} dossiers`, action: "dossiers" },
                { label: "Respect des délais",  value: onTime,      color: onTime >= 85 ? "#3B82F6" : onTime >= 70 ? "#F59E0B" : "#EF4444",
                  sub: enRetardCount > 0 ? `⚠ ${enRetardCount} en retard` : "✓ Tous dans les délais", action: "dossiers" },
                { label: "Progression moyenne", value: Math.round(activeDoss.reduce((a,d) => a + (d.progress||0), 0) / Math.max(activeDoss.length, 1)),
                  color: "#A855F7", sub: `${activeDoss.length} dossiers actifs`, action: "dossiers" },
                { label: "Conformité processus",value: conformite,  color: conformite >= 90 ? "#06B6D4" : conformite >= 75 ? "#F59E0B" : "#EF4444",
                  sub: tachesActives.length > 0 ? `${tachesActives.length} tâches suivies` : "Aucune tâche active", action: "taches" },
              ];

              return kpis.map(k => (
                <div key={k.label} style={{ marginBottom: 10, cursor: k.action ? "pointer" : "default" }}
                  onClick={() => k.action && setActiveModule && setActiveModule(k.action)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                    <span style={{ color: T.textMuted, fontSize: 11 }}>{k.label}</span>
                    <span style={{ color: k.color, fontSize: 13, fontWeight: 800 }}>{k.value}%</span>
                  </div>
                  <div style={{ height: 6, background: T.surface3, borderRadius: 3, overflow: "hidden", marginBottom: 2 }}>
                    <div style={{ width: `${Math.min(k.value, 100)}%`, height: "100%", background: `linear-gradient(90deg,${k.color},${k.color}88)`, borderRadius: 3, transition: "width 1s ease" }}/>
                  </div>
                  <div style={{ color: T.textDim, fontSize: 9, textAlign: "right" }}>{k.sub}</div>
                </div>
              ));
            })()}
          </div>
          <div style={{ background: T.surface2, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <h4 style={{ color: "#C41E3A", margin: "0 0 10px", fontSize: 13, fontWeight: 800 }}>📅 RDV du jour / semaine</h4>
            {myRdvs.map(r => <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 8px", background: T.surface3, borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 4 }}>
              <div style={{ background: "#C41E3A22", borderRadius: 6, padding: "3px 6px", textAlign: "center" }}>
                <div style={{ color: "#C41E3A", fontSize: 12, fontWeight: 800 }}>{r.heure}</div>
                <div style={{ color: T.textMuted, fontSize: 9 }}>{formatDate(r.date)}</div>
              </div>
              <div style={{ flex: 1 }}><div style={{ color: T.text, fontSize: 11, fontWeight: 600 }}>{r.client}</div><div style={{ color: T.textMuted, fontSize: 9 }}>{r.type}</div></div>
              <Badge label={r.status === "CONFIRME" ? "✓" : "?"} color={r.status === "CONFIRME" ? "#22C55E" : "#F59E0B"} small />
            </div>)}
          </div>
        </div>

        {/* ══ TABLEAU DE BORD DÉLAIS — niv4+ processus opérationnels (O) + DG + Admin ══ */}
        {(()=>{
          // v116 — Affichage: niv3+ O01/O02/O03, DG/MG, Admin
          const isOpProcess = _dashProcs.some(p=>p.startsWith("O"));
          const canSeeDélais = (lvl >= 3 && isOpProcess) || isDG || isMG || isAdmin;
          // Config bouton: O01 niv3+, MG/DG (niv5+), Admin — strictement
          // FIX v135 — currentUser was undefined, should use localUser
          const canConfigDélais = isAdmin || isMG || isDG || 
            (lvl >= 3 && (_dashProcs.includes("O01") || (localUser?.processes||[]).includes("O01")));
          if (!canSeeDélais) return null;

          const cfg = gcGetDelaiConfig();
          const today = new Date().toISOString().split("T")[0];
          const actifs = dossiers.filter(d=>!["TERMINE","ARCHIVE","ANNULE"].includes(d.status)&&d.dueDate);
          const depasses  = actifs.filter(d=>daysLeft(d.dueDate)<cfg.alertes.rouge);
          const critiques = actifs.filter(d=>daysLeft(d.dueDate)>=cfg.alertes.rouge&&daysLeft(d.dueDate)<=cfg.alertes.orange);
          const urgents   = actifs.filter(d=>daysLeft(d.dueDate)>cfg.alertes.orange&&daysLeft(d.dueDate)<=cfg.alertes.jaune);
          const enTemps   = actifs.filter(d=>daysLeft(d.dueDate)>cfg.alertes.jaune);
          const sansDate  = dossiers.filter(d=>!["TERMINE","ARCHIVE","ANNULE"].includes(d.status)&&!d.dueDate);
          const tauxRespect = actifs.length>0 ? Math.round((enTemps.length+urgents.length)/actifs.length*100) : 100;

          // Regrouper par responsable pour vue manager
          const parResp = {};
          [...depasses,...critiques,...urgents].forEach(d=>{
            const k = d.assignedTo||"non_assigne";
            if(!parResp[k]) parResp[k]={user:users.find(u=>u.id===d.assignedTo),dossiers:[],depasses:0,critiques:0,urgents:0};
            parResp[k].dossiers.push(d);
            if(daysLeft(d.dueDate)<cfg.alertes.rouge) parResp[k].depasses++;
            else if(daysLeft(d.dueDate)<=cfg.alertes.orange) parResp[k].critiques++;
            else parResp[k].urgents++;
          });

          // Par processus
          const parProc={};
          actifs.forEach(d=>{
            if(!parProc[d.process]) parProc[d.process]={total:0,depasses:0,critiques:0,urgents:0};
            parProc[d.process].total++;
            const dl=daysLeft(d.dueDate);
            if(dl<cfg.alertes.rouge) parProc[d.process].depasses++;
            else if(dl<=cfg.alertes.orange) parProc[d.process].critiques++;
            else if(dl<=cfg.alertes.jaune) parProc[d.process].urgents++;
          });

          if(depasses.length+critiques.length+urgents.length===0&&actifs.length>0) return (
            <div style={{background:"#22C55E15",border:"1px solid #22C55E33",borderRadius:12,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:22}}>✅</span>
              <div>
                <div style={{color:"#22C55E",fontWeight:700,fontSize:13}}>Tous les délais respectés</div>
                <div style={{color:"#22C55E88",fontSize:10}}>{actifs.length} dossiers actifs · Délais : Court {cfg.court}j · Long {cfg.long}j · Urgence {cfg.urgence}j</div>
              </div>
            </div>
          );

          return (
            <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginTop:14,marginBottom:14,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>
              {/* Header — cohérent avec les autres blocs */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
                <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#EF4444,#C41E3A)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>⏱️</div>
                <div style={{flex:1}}>
                  <div style={{color:T.text,fontWeight:800,fontSize:13}}>Tableau de Bord Délais</div>
                  <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>
                    Suivi temps réel · Court {cfg.court}j · Long {cfg.long}j · Urgence {cfg.urgence}j
                    <span style={{marginLeft:8,color:"#F59E0B"}}>🟡≤{cfg.alertes.jaune}j · 🟠≤{cfg.alertes.orange}j · 🔴dépassé</span>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:tauxRespect>=85?"#22C55E":tauxRespect>=70?"#F59E0B":"#EF4444",fontWeight:900,fontSize:22,lineHeight:1}}>{tauxRespect}%</div>
                  <div style={{color:T.textMuted,fontSize:9,marginTop:2}}>taux de respect</div>
                </div>
                {/* Bouton config délais — uniquement pour les rôles autorisés */}
                {(()=>{
                  // Autorisés : O01 niv3+ (responsable administratif), DG/MG (niv5+), Admin
                  const isO01Resp = (_dashProcs.includes("O01")||proc==="O01") && lvl >= 3;
                  const canConfig = isO01Resp || isDG || isMG || isAdmin;
                  if(!canConfig) return null;
                  return (
                    <button
                      onClick={()=>{
                        handleSetActiveModule("gestion_docs");
                        // FIX v123 — Ouvre directement l'onglet Classification (config délais)
                        setTimeout(()=>{
                          try {
                            window.dispatchEvent(new CustomEvent("gc:docs-set-tab", { detail: "classification" }));
                          } catch(_) {}
                        }, 120);
                      }}
                      title="Configurer les délais — Classification → Paramètres délais"
                      style={{background:"#F9731615",border:"1px solid #F9731633",color:"#F97316",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700,flexShrink:0}}>
                      ⚙️ Config délais
                    </button>
                  );
                })()}
              </div>

              {/* KPIs délais — cliquables vers la liste des dossiers */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
                {[
                  {l:"🔴 Dépassés",     v:depasses.length,  c:"#EF4444", bg:"#EF444415", items:depasses},
                  {l:"🟠 Critiques",    v:critiques.length, c:"#F97316", bg:"#F9731615", items:critiques},
                  {l:"🟡 Urgents",      v:urgents.length,   c:"#F59E0B", bg:"#F59E0B15", items:urgents},
                  {l:"✅ Dans les délais",v:enTemps.length, c:"#22C55E", bg:"#22C55E15", items:enTemps},
                ].map(k=>(
                  <div key={k.l}
                    onClick={()=>k.v>0&&setActiveModule&&setActiveModule("dossiers")}
                    style={{background:k.bg,border:`1px solid ${k.c}33`,borderRadius:8,padding:"10px",textAlign:"center",cursor:k.v>0?"pointer":"default",transition:"transform 0.15s"}}
                    onMouseEnter={e=>{if(k.v>0)e.currentTarget.style.transform="translateY(-2px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="";}}
                    title={k.v>0?"Cliquer pour voir les dossiers":undefined}>
                    <div style={{color:k.c,fontWeight:900,fontSize:22,lineHeight:1}}>{k.v}</div>
                    <div style={{color:T.textMuted,fontSize:9,marginTop:3}}>{k.l}</div>
                    {k.l.includes("Dépassés")&&sansDate.length>0&&<div style={{color:T.textDim,fontSize:8,marginTop:1}}>{sansDate.length} sans échéance</div>}
                    {k.v>0&&<div style={{color:k.c,fontSize:8,marginTop:4,opacity:0.7}}>→ dossiers</div>}
                  </div>
                ))}
              </div>

              {/* Dossiers dépassés — cliquables vers la fiche dossier */}
              {depasses.length>0&&(
                <div style={{marginBottom:12}}>
                  <div style={{color:"#EF4444",fontWeight:700,fontSize:10,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>🔴 Action immédiate requise</div>
                  {depasses.sort((a,b)=>daysLeft(a.dueDate)-daysLeft(b.dueDate)).map(d=>{
                    const ds=gcDelaiStatut(d.dueDate);
                    const resp=users.find(u=>u.id===d.assignedTo);
                    return (
                      <div key={d.id}
                        onClick={()=>setSelectedDossier&&setSelectedDossier(d)}
                        style={{background:"#EF444410",border:"1px solid #EF444430",borderRadius:8,padding:"8px 12px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"background 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.background="#EF444420";}}
                        onMouseLeave={e=>{e.currentTarget.style.background="#EF444410";}}
                        title="Cliquer pour ouvrir la fiche dossier">
                        <div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <span style={{color:"#6366F1",fontFamily:"monospace",fontWeight:700,fontSize:10}}>{d.ref}</span>
                            <span style={{color:T.text,fontWeight:600,fontSize:11}}>{d.client}</span>
                            <span style={{background:"#6366F122",color:"#6366F1",borderRadius:4,padding:"1px 5px",fontSize:8}}>{d.process}</span>
                          </div>
                          <div style={{color:T.textMuted,fontSize:9,marginTop:2}}>{d.objet} · {resp?.name||"Non assigné"}</div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                          <div style={{color:ds.color,fontWeight:900,fontSize:12}}>{ds.label}</div>
                          <div style={{color:T.textDim,fontSize:8}}>Éch. {new Date(d.dueDate).toLocaleDateString("fr-FR")}</div>
                          <div style={{color:"#EF4444",fontSize:8,marginTop:2}}>→ ouvrir</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Vue par collaborateur — cliquable vers profil */}
              {Object.keys(parResp).length>0&&(
                <div style={{marginBottom:12}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:10,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>👤 Par collaborateur</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:6}}>
                    {Object.entries(parResp).map(([uid,data])=>(
                      <div key={uid}
                        onClick={()=>setActiveModule&&setActiveModule("dossiers")}
                        style={{background:T.surface,border:`1px solid ${data.depasses>0?"#EF444433":"#F59E0B33"}`,borderRadius:8,padding:"9px 11px",cursor:"pointer",transition:"border-color 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=data.depasses>0?"#EF4444":"#F59E0B";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=data.depasses>0?"#EF444433":"#F59E0B33";}}>
                        <div style={{color:T.text,fontWeight:700,fontSize:11,marginBottom:3}}>{data.user?.name||"Non assigné"}</div>
                        <div style={{color:T.textMuted,fontSize:9,marginBottom:5}}>{data.user?.process||"—"} · Niv.{data.user?.level||"?"}</div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {data.depasses>0&&<span style={{background:"#EF444422",color:"#EF4444",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>🔴 {data.depasses}</span>}
                          {data.critiques>0&&<span style={{background:"#F9731622",color:"#F97316",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>🟠 {data.critiques}</span>}
                          {data.urgents>0&&<span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>🟡 {data.urgents}</span>}
                        </div>
                        <div style={{color:T.textDim,fontSize:8,marginTop:4}}>→ voir dossiers</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vue par processus — cliquable vers filtrage processus */}
              {Object.keys(parProc).length>0&&(
                <div>
                  <div style={{color:T.text,fontWeight:700,fontSize:10,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>🗂️ Par processus</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:5}}>
                    {Object.entries(parProc).filter(([,v])=>v.depasses+v.critiques+v.urgents>0).map(([proc,data])=>{
                      const pc=proc.startsWith("P")?"#3B82F6":proc.startsWith("O")?"#22C55E":"#F59E0B";
                      return (
                        <div key={proc}
                          onClick={()=>setActiveModule&&setActiveModule("dossiers")}
                          style={{background:T.surface,border:`1px solid ${data.depasses>0?"#EF444433":"#F59E0B33"}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",transition:"border-color 0.15s"}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor=pc;}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=data.depasses>0?"#EF444433":"#F59E0B33";}}>
                          <div style={{color:pc,fontFamily:"monospace",fontWeight:800,fontSize:11,marginBottom:4}}>{proc}</div>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:3}}>
                            {data.depasses>0&&<span style={{color:"#EF4444",fontSize:9,fontWeight:700}}>🔴{data.depasses}</span>}
                            {data.critiques>0&&<span style={{color:"#F97316",fontSize:9,fontWeight:700}}>🟠{data.critiques}</span>}
                            {data.urgents>0&&<span style={{color:"#F59E0B",fontSize:9,fontWeight:700}}>🟡{data.urgents}</span>}
                          </div>
                          <div style={{color:T.textDim,fontSize:8}}>{data.total} dossiers · → voir</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Task delegation modal */}
        {/* ── MODAL RÉINITIALISATION RESTREINTE DG ── */}
        {showDgReset && (
          <div style={{position:"fixed",inset:0,background:"#000C",zIndex:5000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowDgReset(false)}>
            <div style={{background:"#0D1F38",border:"2px solid #F59E0B44",borderRadius:18,padding:"28px 30px",width:560,boxShadow:"0 24px 60px #000A",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                <div style={{fontSize:28}}>⚙️</div>
                <div style={{flex:1}}>
                  <div style={{color:"#F59E0B",fontWeight:900,fontSize:15}}>Réinitialisation sélective — Accès DG</div>
                  <div style={{color:"#7A90B0",fontSize:11,marginTop:2}}>Les comptes, journaux de sécurité et config SI sont réservés à la Direction SI.</div>
                </div>
                <button onClick={()=>{
                  const allKeys = DG_RESET_ITEMS.reduce((a,i)=>({...a,[i.k]:true}),{});
                  const allSelected = DG_RESET_ITEMS.every(i=>dgResetItems[i.k]);
                  setDgResetItems(allSelected ? {} : allKeys);
                }} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700,flexShrink:0}}>
                  {DG_RESET_ITEMS.every(i=>dgResetItems[i.k]) ? "✕ Tout désélectionner" : "✓ Tout sélectionner"}
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:16}}>
                {DG_RESET_ITEMS.map(item=>(
                  <label key={item.k} style={{display:"flex",alignItems:"center",gap:8,background:dgResetItems[item.k]?(item.danger?"#EF444422":"#F59E0B15"):"#1E3A5F22",border:`1px solid ${dgResetItems[item.k]?(item.danger?"#EF444444":"#F59E0B44"):"#2A3A50"}`,borderRadius:8,padding:"9px 11px",cursor:"pointer",transition:"all 0.15s"}}>
                    <input type="checkbox" checked={!!dgResetItems[item.k]} onChange={e=>setDgResetItems(p=>({...p,[item.k]:e.target.checked}))} style={{accentColor:item.danger?"#EF4444":"#F59E0B",flexShrink:0}} />
                    <span style={{color:dgResetItems[item.k]?(item.danger?"#EF4444":"#F59E0B"):"#A0B8D8",fontSize:11,fontWeight:600,lineHeight:1.3}}>{item.l}</span>
                  </label>
                ))}
              </div>
              <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"9px 12px",marginBottom:14,fontSize:11,color:"#F59E0B"}}>
                ⚠️ <strong>Attention :</strong> Action irréversible. Seules les cases cochées seront effacées. Les partenaires seront restaurés à la liste initiale.
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={async ()=>{
                  const selected = Object.entries(dgResetItems).filter(([_k,v])=>v).map(([k])=>k);
                  if (selected.length===0) { gcAlert("Sélectionnez au moins un élément."); return; }
                  const confirmMsg = `Confirmer la réinitialisation de :\n${DG_RESET_ITEMS.filter(i=>selected.includes(i.k)).map(i=>"\n• "+i.l).join("")}\n\nCette action est IRRÉVERSIBLE et affectera TOUS les postes connectés.`;
                  if (!await gcConfirm(confirmMsg,"Confirmer la réinitialisation","⚠️",true)) return;

                  // Helper : vide définitivement avec wipe-registry (anti-résurrection cross-machine)
                  const _wipe = (key, val=[]) => dsWipeKey(key, val).catch(()=>{});
                  const ops = [];

                  if(selected.includes("dossiers")){
                    setDossiers([]);
                    if(saveDossierFiles) try{saveDossierFiles([]);}catch(_){}
                    ops.push(_wipe('dossiers'), _wipe('gc-dossiers'), _wipe('gc-dossier-files'), _wipe('gc-pending-delete-approvals'));
                  }
                  if(selected.includes("taches")){
                    setTaches([]);
                    ops.push(_wipe('taches'), _wipe('gc-taches'));
                  }
                  if(selected.includes("rdvs")){
                    setRdvs([]);
                    ops.push(_wipe('rdvs'), _wipe('gc-rdvs'));
                  }
                  if(selected.includes("partners")){
                    setPartnersSync(INITIAL_PARTNERS);
                    ops.push(_wipe('partners', INITIAL_PARTNERS), _wipe('gc-crm-clients', INITIAL_PARTNERS), _wipe('gc-crm-interactions'), _wipe('gc-crm-opps'), _wipe('gc-crm-relances'));
                  }
                  if(selected.includes("sirh")){
                    ["gc-sirh-presences","gc-sirh-leaves","gc-leaves","gc-sirh-recrutements","gc-recrutements","gc-sirh-evaluations","gc-paie-transferts","gc-sirh-fichiers","gc-sirh-reinstatements","gc-sirh-onboarding","gc-paie-taux"].forEach(k=>ops.push(_wipe(k)));
                  }
                  if(selected.includes("approvals")){
                    setPendingApprovals([]);
                    ops.push(_wipe('pendingApprovals'), _wipe('gc-pending-approvals'), _wipe('gc-pending-delete-approvals'));
                  }
                  if(selected.includes("messages")){
                    ops.push(_wipe('gc-messages-global'), _wipe('gc-courrier-docs'), _wipe('gc-msg-drafts'), _wipe('gc-msg-templates'));
                  }
                  if(selected.includes("codification")){
                    if(setCodifRegistry) setCodifRegistry([]);
                    ops.push(_wipe('gc-codif-registry'));
                  }
                  if(selected.includes("infos_comp")){
                    setSystemMsgs(INITIAL_SYSTEM_MSGS);
                    ops.push(_wipe('gc-system-msgs', INITIAL_SYSTEM_MSGS));
                  }
                  if(selected.includes("documents")){
                    if(setInternalDocs) try{setInternalDocs([]);}catch(_){}
                    if(setExternalDocs) try{setExternalDocs([]);}catch(_){}
                    ["gc-internal-docs","gc-external-docs","gc-standalone-docs","gc-docs-unified","gc-si-docs","gc-dossier-files","gc-docs-archives","standaloneDocuments","gc-writer-docs","gc-writer-pro-v2","gc-tableur-pro","gc-pres-decks-v2","gc-courrier-docs"].forEach(k=>ops.push(_wipe(k)));
                    ops.push(gcClearAllLocalFiles().catch(()=>{}));
                  }
                  if(selected.includes("demandes")){
                    if(setDemandesData) try{setDemandesData([]);}catch(_){}
                    ops.push(_wipe('gc-demandes'));
                  }
                  if(selected.includes("kanban_notes")){
                    ["gc-kanban-cols-v2","gc-kanban-cards-v2","gc-notes-rapides","gc-notepad-v2","gc-memos"].forEach(k=>ops.push(_wipe(k)));
                  }
                  if(selected.includes("archives")){
                    ops.push(_wipe('gc-archives'), _wipe('gc-docs-archives'));
                  }
                  if(selected.includes("finance")){
                    ["gc-journal","gc-journal-ohada","gc-budget","gc-budget-entries","gc-budget-rapide","gc-ohada-custom","gc-ohada-overrides","gc-piece-series","gc-factures","gc-devis"].forEach(k=>ops.push(_wipe(k)));
                  }
                  if(selected.includes("audit")){
                    ["gc-tpa","gc-audit-prog","gc-feuille-tests","gc-audit-actions","gc-audit-checklist","gc-audit-checklist-custom","gc-audit-grille-taches","gc-pca","gc-pca-risques","gc-pca-procedures","gc-pca-tests","gc-coso-scores","gc-risks","gc-nc","gc-obligations","gc-amelio-actions","gc-amelio-kpis","gc-amelio-ncs"].forEach(k=>ops.push(_wipe(k)));
                  }
                  if(selected.includes("logistique")){
                    ["gc-achats","gc-stocks","gc-logmod-stocks","gc-logistique-actifs","gc-inventaires","gc-inventaire-en-cours","gc-resources"].forEach(k=>ops.push(_wipe(k)));
                  }
                  if(selected.includes("comm")){
                    ["gc-comm-campagnes","gc-comm-contacts","gc-comm-fiches","gc-comm-custom-tpl"].forEach(k=>ops.push(_wipe(k)));
                  }

                  await Promise.allSettled(ops);
                  // Forcer resync sur tous les postes via événement global
                  try { window.dispatchEvent(new CustomEvent('gc-resync-all')); } catch(_) {}

                  setNotifications(p=>[{id:"N"+Date.now(),icon:"⚙️",message:`Réinitialisation DG effectuée (tous postes) : ${DG_RESET_ITEMS.filter(i=>selected.includes(i.k)).map(i=>i.l).join(", ")}`,at:new Date().toISOString(),read:false},...p]);
                  playSound("success");
                  setShowDgReset(false);
                  setDgResetItems({});
                  gcAlert("✅ Réinitialisation effectuée sur TOUS les postes connectés. Actualisation dans 3s…");
                  setTimeout(()=>window.location.reload(), 3000);
                }} style={{flex:1,background:Object.values(dgResetItems).some(Boolean)?"#F59E0B":"#888",border:"none",color:"#fff",borderRadius:8,padding:"11px 16px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                  ⚙️ Confirmer la réinitialisation
                </button>
                <button onClick={()=>{setShowDgReset(false);setDgResetItems({});}} style={{background:"#1E3A5F",border:"1px solid #334",color:"#7A90B0",borderRadius:8,padding:"11px 16px",cursor:"pointer",fontSize:12}}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {showTaskDelegate && (
          <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div role="dialog" aria-modal="true" aria-label="Déléguer une tâche" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "28px 32px", width: 520, maxWidth: "95vw", boxShadow: "0 24px 80px #0009" }}>
              <h3 style={{ color: "#C41E3A", margin: "0 0 16px", fontWeight: 800 }}>📋 Déléguer une tâche</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <InputField label="Titre de la tâche *" value={delegateForm.titre} onChange={e => setDelegateForm(f=>({...f,titre:e.target.value}))} T={T} />
                <InputField label="Échéance *" type="date" value={delegateForm.deadline} onChange={e => setDelegateForm(f=>({...f,deadline:e.target.value}))} T={T} />
                <div>
                  <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Assigner à *</label>
                  <select value={delegateForm.assignedTo} onChange={e => setDelegateForm(f=>({...f,assignedTo:e.target.value}))} style={{ width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12 }}>
                    <option value="">— Sélectionner un collaborateur —</option>
                    {users.filter(u => _activeUser(u)&&u.id !== localUser.id).map(u => <option key={u.id} value={u.id}>{u.name} — {u.role} (Niv.{u.level})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Priorité</label>
                  <select value={delegateForm.priority} onChange={e => setDelegateForm(f=>({...f,priority:e.target.value}))} style={{ width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12 }}>
                    {Object.entries(PRIORITY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Description / Instructions</label>
                  <textarea value={delegateForm.description} onChange={e => setDelegateForm(f=>({...f,description:e.target.value}))} rows={3} style={{ width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12, resize: "vertical", boxSizing: "border-box" }} placeholder="Décrivez la tâche en détail, les livrables attendus et les instructions spécifiques..." />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={() => {
                  if (!delegateForm.titre || !delegateForm.assignedTo) { gcAlert("Veuillez remplir les champs obligatoires."); return; }
                  const assignee = users.find(u => u.id === delegateForm.assignedTo);
                  gcAlert(`✅ Tâche "${delegateForm.titre}" déléguée à ${assignee?.name}.\n📨 Notification avec instruction envoyée.`);
                  setShowTaskDelegate(false);
                  setDelegateForm({ titre: "", description: "", assignedTo: "", priority: "MOYENNE", deadline: "", dossier: "" });
                }} style={{ background: "#C41E3A", border: "none", color: "#fff", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  📋 Déléguer & Notifier
                </button>
                <button onClick={() => setShowTaskDelegate(false)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontSize: 13 }}>Annuler</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  // FIX v63: anciens dashboards niv4 Finance/Audit/P03 supprimés  -  ils utilisent désormais le dashboard
  // moderne niv3-4 ci-dessous (avec sélecteur multi-processus, KPIs spécialisés et supervision)

  if (lvl >= 3 && lvl <= 4) {
    const isMultiProcess = _dashProcs.length > 1;
    const PROC_META_DASH = {
      O02:{icon:"⚖️", label:"Juridique & Conseil",  color:"#EC4899", appId:"juridique"},
      S02:{icon:"🔍", label:"Audit & Contrôle",      color:"#EF4444", appId:"audit",         appId2:"conformite"},
      P02:{icon:"📋", label:"Gouvernance & Conf.",   color:"#A855F7", appId:"conformite",     appId2:"audit"},
      O03:{icon:"🗂️", label:"Éval. & Gestion",       color:"#14B8A6", appId:"audit"},
      S03:{icon:"👥", label:"Ressources Humaines",   color:"#8B5CF6", appId:"sirh"},
      S01:{icon:"💰", label:"Finance & Compta.",     color:"#C9A84C", appId:"finance"},
      P03:{icon:"📊", label:"Contrôle de Gestion",   color:"#F59E0B", appId:"finance"},
      P01:{icon:"🎯", label:"Management & Stratégie",color:"#3B82F6", appId:"conseil"},
      P04:{icon:"🔭", label:"Veille Stratégique",    color:"#22C55E", appId:"bureau"},
      O01:{icon:"🏢", label:"Adm. Exécutif",         color:"#F97316", appId:"bureau"},
      S04:{icon:"📢", label:"Communication",         color:"#06B6D4", appId:"communication"},
      S05:{icon:"🚚", label:"Logistique & Rel. Ext.", color:"#F59E0B", appId:"logistique"},
      S06:{icon:"🔧", label:"Entretien & Sécurité",  color:"#84CC16", appId:"bureau"}};
    const filteredDoss = (activeDashProc && isMultiProcess)
      ? dossiersPending.filter(d => d.process === activeDashProc)
      : dossiersPending;
    const filteredTaches = (activeDashProc && isMultiProcess)
      ? tachesPending.filter(t => {
          const d = dossiers.find(dd => dd.id === t.dossier);
          return (t.assignedTo === uid || t.assigneeId === uid) || !d || d.process === activeDashProc;
        })
      : tachesPending;
    const visibleProcs = (activeDashProc && isMultiProcess) ? [activeDashProc] : _dashProcs;
    const avgProg = filteredDoss.length>0?Math.round(filteredDoss.reduce((a,d)=>a+d.progress,0)/filteredDoss.length):100;
    const onTimeRate = filteredDoss.length>0?Math.round(filteredDoss.filter(d=>daysLeft(d.dueDate)>=0).length/filteredDoss.length*100):100;
    const highPrioCount = filteredTaches.filter(t=>t.priority==="HAUTE").length;
    // FIX v63: KPIs spécialisés par processus pour niv3/4
    const activeProc = activeDashProc || primaryProc;
    const _caProc = myDossiers.filter(d=>!activeDashProc||d.process===activeDashProc).reduce((a,d)=>a+(d.amount||0),0);
    const _caRealProc = myDossiers.filter(d=>d.status==="TERMINE"&&(!activeDashProc||d.process===activeDashProc)).reduce((a,d)=>a+(d.amount||0),0);
    const _approvalsPending = pendingApprovals.filter(a=>!["APPROUVE","REJETE"].includes(a.status)&&(
      (localUser?.isAdmin || localUser?.level >= 6)||localUser.level>=4||
      _dashProcs.some(p=>a.process===p)||
      a.targetUserId===localUser.id
    ));
    const isFinanceProc = _dashProcs.some(p=>["S01","P03"].includes(p));
    const isAuditProc = _dashProcs.some(p=>["S02","P02"].includes(p));
    const isRHProc = _dashProcs.some(p=>["S03"].includes(p));
    const specialKPIs = isFinanceProc ? [
      {label:"CA Portefeuille",v:_caProc>=1e6?`${(_caProc/1e6).toFixed(2)}M`:formatCFA(_caProc),icon:"📈",c:"#C9A84C",act:"indicateurs"},
      {label:"CA Réalisé",v:_caRealProc>=1e6?`${(_caRealProc/1e6).toFixed(2)}M`:formatCFA(_caRealProc),icon:"💰",c:"#22C55E",act:"indicateurs"},
      {label:"Taux recouvrement",v:`${totalCA>0?Math.round((caRealise/totalCA)*100):0}%`,icon:"📊",c:"#3B82F6",act:"indicateurs"},
      {label:"Dossiers financiers",v:filteredDoss.length,icon:"📁",c:"#A855F7",act:"dossiers"},
    ] : isAuditProc ? [
      {label:"Missions audit",v:filteredDoss.length,icon:"🔍",c:"#A855F7",act:"dossiers"},
      {label:"Non-conformités",v:filteredDoss.filter(d=>d.status==="EN_RETARD"||daysLeft(d.dueDate)<0).length,icon:"⚠️",c:"#C41E3A",act:"dossiers"},
      {label:"Contrôles",v:filteredTaches.length,icon:"✓",c:"#22C55E",act:"taches"},
      {label:"Approbations",v:_approvalsPending.length,icon:"📋",c:"#F59E0B",act:"approbations"},
    ] : isRHProc ? [
      {label:"Collaborateurs",v:users.filter(u=>_activeUser(u)&&!u.isAdmin&&u.isActive!==false).length,icon:"👥",c:"#8B5CF6",act:"collaborateurs"},
      {label:"Approbations RH",v:_approvalsPending.length,icon:"👤",c:"#F59E0B",act:"approbations"},
      {label:"Tâches RH",v:filteredTaches.length,icon:"📋",c:"#3B82F6",act:"taches"},
      {label:"Dossiers actifs",v:filteredDoss.length,icon:"📁",c:"#EC4899",act:"dossiers"},
    ] : null; // null = KPIs génériques
    const kpiCards34 = specialKPIs || [
      {label:"Dossiers actifs",v:filteredDoss.length,icon:"📁",c:"#3B82F6",act:"dossiers"},
      {label:"En attente",v:filteredDoss.filter(d=>d.status.startsWith("ATTENTE")).length,icon:"⏳",c:"#F59E0B",act:"dossiers"},
      {label:"Terminés",v:myDossiers.filter(d=>d.status==="TERMINE"&&(!activeDashProc||d.process===activeDashProc)).length,icon:"✅",c:"#22C55E",act:"dossiers"},
      {label:"Mes tâches",v:filteredTaches.length,icon:"📋",c:"#A855F7",act:"taches"},
    ];
    return (
      <div className="gc-fade-in">
        <SmartBanner localUser={localUser} systemMsgs={systemMsgs} dossiers={dossiers} taches={taches} rdvs={rdvs} pendingApprovals={pendingApprovals} pendingConnections={pendingConnections} pendingAccountActions={pendingAccountActions} demandesData={demandesData} setActiveModule={setActiveModule} T={T} procColors={procColors} />

        {/* ── Carte identité + salutation (modèle unifié tous niveaux) ── */}
        <div style={{background:`linear-gradient(135deg,${procAccent}22,${T.surface2})`,border:`1px solid ${procAccent}44`,borderRadius:14,padding:"14px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:46,height:46,borderRadius:"50%",background:localUser.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff",fontWeight:800,flexShrink:0,border:`2px solid ${procAccent}66`,boxShadow:`0 0 16px ${procAccent}44`,overflow:"hidden"}}>
            {localUser.photoUrl?<img src={localUser.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:localUser.avatar}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:T.text,fontWeight:900,fontSize:14}}>{greeting.text}, {localUser.name.split(" ")[0]} {greeting.emoji}</div>
            <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>
              {localUser.role} · {_dashProcs.join(" / ")} · {formatDate(new Date().toISOString())} · <LiveClock color={procAccent} />
            </div>
            {/* Badges statut dynamiques */}
            <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap"}}>
              {filteredDoss.filter(d=>d.priority==="HAUTE").length > 0 && (
                <span style={{background:"#C41E3A22",border:"1px solid #C41E3A44",borderRadius:6,padding:"2px 8px",color:"#C41E3A",fontSize:9,fontWeight:700}}>
                  🚨 {filteredDoss.filter(d=>d.priority==="HAUTE").length} urgents
                </span>
              )}
              {_approvalsPending.length > 0 && (
                <span onClick={()=>setActiveModule("approbations")} style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:6,padding:"2px 8px",color:"#A855F7",fontSize:9,fontWeight:700,cursor:"pointer"}}>
                  ⏳ {_approvalsPending.length} approbation(s)
                </span>
              )}
              {myRdvs.filter(r=>r.date===new Date().toISOString().split("T")[0]).length > 0 && (
                <span style={{background:"#06B6D422",border:"1px solid #06B6D444",borderRadius:6,padding:"2px 8px",color:"#06B6D4",fontSize:9,fontWeight:700}}>
                  📅 {myRdvs.filter(r=>r.date===new Date().toISOString().split("T")[0]).length} RDV auj.
                </span>
              )}
              {filteredDoss.filter(d=>d.priority==="HAUTE").length===0&&_approvalsPending.length===0 && (
                <span style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:6,padding:"2px 8px",color:"#22C55E",fontSize:9,fontWeight:700}}>
                  ✅ Tout est à jour
                </span>
              )}
            </div>
          </div>
          {/* Bouton 1 : action principale selon processus */}
          <button onClick={()=>setActiveModule(
            isRHProc?"sirh":isAuditProc?"audit":isFinanceProc?"finance":isConformiteProc?"conformite":
            _dashProcs.includes("O03")?"audit":
            _dashProcs.includes("S04")?"communication":
            _dashProcs.includes("S05")?"logistique":"bureau"
          )} style={{
            background:`linear-gradient(135deg,${procAccent},${procAccent}CC)`,
            border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",
            cursor:"pointer",fontWeight:700,fontSize:12,flexShrink:0,
            boxShadow:`0 3px 10px ${procAccent}55`}}>
            {isRHProc?"👥 RH":isAuditProc?"🔍 Audit":isFinanceProc?"💰 Finance":isConformiteProc?"🛡️ Conformité":
             _dashProcs.includes("O03")?"🗂️ Éval. & Gestion":
             _dashProcs.includes("S04")?"📢 Communication":
             _dashProcs.includes("S05")?"🚚 Logistique":
             _dashProcs.includes("P01")?"🎯 Conseil":"💼 Bureau"}
          </button>
          {/* Bouton 2 : approbations si niv4, sinon demandes */}
          {lvl >= 4 ? (
            <div style={{position:"relative",flexShrink:0}}>
              <button onClick={()=>setActiveModule("approbations")} style={{
                background:"#A855F722",border:"1px solid #A855F744",
                color:"#A855F7",borderRadius:8,padding:"8px 14px",
                cursor:"pointer",fontWeight:700,fontSize:12}}>
                ✅ Approbations
              </button>
              {_approvalsPending.length > 0 && (
                <span style={{
                  position:"absolute",top:-6,right:-6,
                  minWidth:18,height:18,borderRadius:9,
                  background:"#A855F7",color:"#fff",
                  fontSize:9,fontWeight:900,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  border:"2px solid #050D1A",padding:"0 4px",
                  boxShadow:"0 2px 8px rgba(168,85,247,0.7)",
                  pointerEvents:"none",lineHeight:1}} className="gc-badge-ping">
                  {_approvalsPending.length > 9 ? "9+" : _approvalsPending.length}
                </span>
              )}
            </div>
          ) : (
            <button onClick={()=>setActiveModule("demandes")} style={{
              background:"#3B82F622",border:"1px solid #3B82F644",
              color:"#3B82F6",borderRadius:8,padding:"8px 14px",
              cursor:"pointer",fontWeight:700,fontSize:12,flexShrink:0}}>
              📨 Demandes
            </button>
          )}
        </div>

        {isMultiProcess && (
          <div style={{background:`${procAccent}11`,border:`1px solid ${procAccent}33`,borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:0.6,marginRight:4}}>🔀 Mes processus :</span>
            <button onClick={()=>setActiveDashProc(null)} style={{background:!activeDashProc?`${procAccent}33`:"transparent",border:`1px solid ${!activeDashProc?procAccent:T.border}`,borderRadius:20,padding:"4px 12px",cursor:"pointer",color:!activeDashProc?procAccent:T.textMuted,fontWeight:!activeDashProc?800:400,fontSize:10,transition:"all 0.15s"}}>
              🌐 Vue globale
            </button>
            {_dashProcs.map(p => {
              const pm = PROC_META_DASH[p]||{icon:"📌",label:p,color:procColors[p]||"#888",appId:"bureau"};
              const isAct = activeDashProc === p;
              const cnt = dossiersPending.filter(d=>d.process===p).length;
              return (
                <button key={p} onClick={()=>setActiveDashProc(isAct?null:p)}
                  style={{background:isAct?`${pm.color}33`:"transparent",border:`1px solid ${isAct?pm.color:T.border}`,borderRadius:20,padding:"4px 12px",cursor:"pointer",color:isAct?pm.color:T.textMuted,fontWeight:isAct?800:400,fontSize:10,display:"flex",alignItems:"center",gap:5,transition:"all 0.15s"}}>
                  <span>{pm.icon}</span>
                  <span>{pm.label}</span>
                  {cnt>0&&<span style={{background:`${pm.color}44`,color:pm.color,borderRadius:10,padding:"1px 6px",fontSize:9,fontWeight:700}}>{cnt}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Alerte dynamique ── */}
        <RotatingAlert alerts={alerts} setActiveModule={setActiveModule} T={T} />

        {/* ── KPI Cards spécialisées (processus + niveau) ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}} className="gc-stagger">
          {kpiCards34.map((s,i)=>(
            <div key={i} onClick={()=>setActiveModule(s.act)} className="gc-hover-card"
              style={{background:`linear-gradient(135deg,${s.c}15,${T.surface2})`,border:`1px solid ${s.c}33`,borderRadius:14,padding:"16px 14px",cursor:"pointer",transition:"all 0.2s",boxShadow:`0 4px 16px ${s.c}10`}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=s.c+"66";e.currentTarget.style.transform="translateY(-2px)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=s.c+"33";e.currentTarget.style.transform="";}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{width:36,height:36,borderRadius:10,background:s.c+"22",border:`1px solid ${s.c}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{s.icon}</div>
                <span style={{color:s.c,fontSize:typeof s.v==="number"?26:16,fontWeight:900,lineHeight:1}}>{s.v}</span>
              </div>
              <div style={{color:T.text,fontSize:10,fontWeight:700,marginTop:4}}>{s.label}</div>
              {isMultiProcess&&activeDashProc&&<div style={{color:PROC_META_DASH[activeDashProc]?.color||T.textDim,fontSize:9,marginTop:2}}>{PROC_META_DASH[activeDashProc]?.icon} {PROC_META_DASH[activeDashProc]?.label}</div>}
              {/* Barre de progression indicative */}
              {typeof s.v === "number" && s.v > 0 && (
                <div style={{height:3,background:s.c+"22",borderRadius:2,marginTop:8}}>
                  <div style={{width:`${Math.min(100,(s.v/(filteredDoss.length+filteredTaches.length+1))*100*4)}%`,height:"100%",background:s.c,borderRadius:2,transition:"width 0.8s ease"}}/>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Ligne supervision niv.3 / management niv.4 ── */}
        {(lvl >= 3) && (_approvalsPending.length > 0 || (lvl===4 && isFinanceProc && _journalOHADA.length > 0)) && (
          <div style={{display:"grid",gridTemplateColumns:isFinanceProc&&_journalOHADA.length>0?"1fr 1fr 1fr":"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:14}}>
            {_approvalsPending.length > 0 && (
              <div onClick={()=>setActiveModule("approbations")}
                style={{background:"linear-gradient(135deg,#A855F715,#3B82F610)",border:"1px solid #A855F744",borderRadius:12,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#A855F777"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#A855F744"}>
                <div style={{width:38,height:38,borderRadius:10,background:"#A855F722",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>👤</div>
                <div>
                  <div style={{color:"#A855F7",fontWeight:900,fontSize:18,lineHeight:1}}>{_approvalsPending.length}</div>
                  <div style={{color:T.text,fontSize:11,fontWeight:700}}>Approbations en attente</div>
                  <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>Requiert votre action → cliquer</div>
                </div>
              </div>
            )}
            {isFinanceProc && _journalOHADA.length > 0 && (<>
              <div style={{background:"linear-gradient(135deg,#22C55E15,#C9A84C10)",border:"1px solid #22C55E44",borderRadius:12,padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:16}}>📈</span><span style={{color:"#22C55E",fontWeight:900,fontSize:14}}>{(caJournal/1e6).toFixed(2)}M FCFA</span>
                </div>
                <div style={{color:T.text,fontSize:10,fontWeight:700}}>Produits journal (Cl.7)</div>
                <div style={{color:T.textMuted,fontSize:9}}>{_journalOHADA.filter(e=>(e.compteDebit||"").startsWith("7")).length} écritures</div>
              </div>
              <div style={{background:`linear-gradient(135deg,${resultatNet>=0?"#22C55E":"#EF4444"}15,#0A1E4A10)`,border:`1px solid ${resultatNet>=0?"#22C55E":"#EF4444"}44`,borderRadius:12,padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:16}}>{resultatNet>=0?"💎":"📉"}</span><span style={{color:resultatNet>=0?"#22C55E":"#EF4444",fontWeight:900,fontSize:14}}>{(resultatNet/1e6).toFixed(2)}M FCFA</span>
                </div>
                <div style={{color:T.text,fontSize:10,fontWeight:700}}>Résultat net OHADA</div>
                <div style={{color:T.textMuted,fontSize:9}}>{resultatNet>=0?"Situation positive ✓":"Résultat négatif ⚠"}</div>
              </div>
            </>)}
          </div>
        )}

        {/* ── Grille principale ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

          {/* DOSSIERS — titre dynamique selon processus */}
          <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <h4 style={{color:"#C41E3A",margin:0,fontSize:13,fontWeight:800}}>
                {isMultiProcess&&!activeDashProc
                  ? "📁 Dossiers — tous processus"
                  : `${PROC_META_DASH[visibleProcs[0]]?.icon||"📁"} ${visibleProcs.map(p=>PROC_META_DASH[p]?.label||p).join(" · ")}`}
              </h4>
              <button onClick={()=>setActiveModule("dossiers")} style={{background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:10,fontWeight:700}}>Tout →</button>
            </div>
            {filteredDoss.length===0
              ? <div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:20}}>Aucun dossier en cours</div>
              : filteredDoss.slice(0,4).map(d=>{
                  const sc=STATUS_CONFIG[d.status]; const dl=daysLeft(d.dueDate);
                  const ds=gcDelaiStatut(d.dueDate);
                  const pm=PROC_META_DASH[d.process];
                  return (
                    <div key={d.id} onClick={()=>setSelectedDossier(d)}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"8px 9px",background:T.surface3,borderRadius:9,border:`1px solid ${ds.statut==="DEPASSE"?"#C41E3A44":ds.statut==="CRITIQUE"?"#EF444433":ds.statut==="URGENT"?"#F59E0B33":T.border}`,marginBottom:5,cursor:"pointer",transition:"background 0.12s"}}>
                      {isMultiProcess&&!activeDashProc&&pm&&<span title={pm.label} style={{fontSize:14,flexShrink:0}}>{pm.icon}</span>}
                      <span style={{color:sc.color,fontSize:14}}>{sc.icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:T.text,fontSize:11,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</div>
                        <div style={{color:T.textMuted,fontSize:9}}>{d.ref} · {formatDate(d.dueDate)}</div>
                        <ProgressBar value={d.progress} color={sc.color} />
                      </div>
                      <div style={{color:ds.color,fontSize:9,flexShrink:0,fontWeight:700,background:ds.color+"15",borderRadius:5,padding:"2px 6px",border:`1px solid ${ds.color}33`}}>{ds.label}</div>
                    </div>
                  );
                })}
            {filteredDoss.length>4&&<div style={{color:T.textMuted,fontSize:10,textAlign:"center",marginTop:4,cursor:"pointer"}} onClick={()=>setActiveModule("dossiers")}>+{filteredDoss.length-4} dossiers →</div>}
          </div>

          {/* TACHES */}
          <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <h4 style={{color:"#C41E3A",margin:0,fontSize:13,fontWeight:800}}>📋 Tâches en cours</h4>
              <button onClick={()=>setActiveModule("taches")} style={{background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:10,fontWeight:700}}>Tout →</button>
            </div>
            {filteredTaches.length===0
              ? <div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:20}}>✓ Aucune tâche en attente</div>
              : filteredTaches.slice(0,5).map(t=>{
                  const pc=PRIORITY_CONFIG[t.priority];
                  return (
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 9px",background:T.surface3,borderRadius:9,border:`1px solid ${T.border}`,marginBottom:5}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:T.text,fontSize:11,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.titre}</div>
                        <div style={{color:T.textMuted,fontSize:9}}>{formatDate(t.deadline)} · {t.status}</div>
                      </div>
                      <Badge label={pc?.label} color={pc?.color} small />
                    </div>
                  );
                })}
          </div>

          {/* KPIs PROCESSUS */}
          <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
            <h4 style={{color:"#C41E3A",margin:"0 0 10px",fontSize:13,fontWeight:800}}>📊 KPIs & Indicateurs</h4>
            {[
              {label:"Taux d'avancement dossiers",v:avgProg,c:"#3B82F6"},
              {label:"Respect des délais",v:onTimeRate,c:onTimeRate<70?"#EF4444":onTimeRate<85?"#F59E0B":"#22C55E"},
              {label:"Tâches critiques résolues",v:highPrioCount===0?100:Math.round(100-highPrioCount/Math.max(1,filteredTaches.length)*100),c:highPrioCount>2?"#EF4444":"#22C55E"},
            ].map(k=>(
              <div key={k.label} style={{marginBottom:9}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{color:T.textMuted,fontSize:11}}>{k.label}</span>
                  <span style={{color:k.c,fontSize:12,fontWeight:700}}>{k.v}%</span>
                </div>
                <ProgressBar value={k.v} color={k.c} />
              </div>
            ))}
            {/* Raccourcis rapides processus */}
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:10,paddingTop:8,borderTop:`1px solid ${T.border}`}}>
              {_dashProcs.map(p=>{
                const pm=PROC_META_DASH[p]; if(!pm) return null;
                // S02 : deux boutons distincts  -  Audit + Non-conformités
                if(p==="S02") return (
                  <React.Fragment key={p}>
                    <button onClick={()=>setActiveModule("audit")}
                      style={{background:"#EF444418",border:"1px solid #EF444444",borderRadius:8,padding:"4px 10px",cursor:"pointer",color:"#EF4444",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                      🔍 Missions Audit
                    </button>
                    <button onClick={()=>setActiveModule("conformite")}
                      style={{background:"#F59E0B18",border:"1px solid #F59E0B44",borderRadius:8,padding:"4px 10px",cursor:"pointer",color:"#F59E0B",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                      ⚠️ Non-conformités
                    </button>
                  </React.Fragment>
                );
                return (
                  <button key={p} onClick={()=>setActiveModule(pm.appId)}
                    style={{background:`${pm.color}18`,border:`1px solid ${pm.color}44`,borderRadius:8,padding:"4px 10px",cursor:"pointer",color:pm.color,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                    <span>{pm.icon}</span><span>{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RDV */}
          <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <h4 style={{color:"#C41E3A",margin:0,fontSize:13,fontWeight:800}}>📅 Agenda & RDV</h4>
              <button onClick={()=>setActiveModule("agenda")} style={{background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:10,fontWeight:700}}>Agenda →</button>
            </div>
            {myRdvs.length===0
              ? <div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:20}}>Aucun RDV planifié</div>
              : myRdvs.slice(0,4).map(r=>(
                  <div key={r.id} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 9px",background:T.surface3,borderRadius:9,border:`1px solid ${T.border}`,marginBottom:5}}>
                    <div style={{background:"#C41E3A22",borderRadius:7,padding:"4px 7px",textAlign:"center",flexShrink:0}}>
                      <div style={{color:"#C41E3A",fontSize:11,fontWeight:900}}>{r.heure}</div>
                      <div style={{color:T.textMuted,fontSize:9}}>{formatDate(r.date)}</div>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:T.text,fontSize:11,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.client}</div>
                      <div style={{color:T.textMuted,fontSize:9}}>{r.type||"Rendez-vous"}</div>
                    </div>
                    <Badge label={r.status==="CONFIRME"?"✓":"?"} color={r.status==="CONFIRME"?"#22C55E":"#F59E0B"} small />
                  </div>
                ))}
          </div>

        </div>{/* fin grille */}
      </div>
    );
  }

  const procColor = getProcColor(proc) || localUser.color || "#3B82F6";
  const today = new Date().toISOString().split("T")[0];
  const myRdvsToday = myRdvs.filter(r => r.date === today);
  const myTachesHaute = tachesPending.filter(t => t.priority === "HAUTE");
  const dossiersEnRetard = dossiersPending.filter(d => d.dueDate && new Date(d.dueDate) < new Date());
  const dossiersATerminer = dossiersPending.filter(d => { const dl = daysLeft(d.dueDate); return dl >= 0 && dl <= 3; });

  const procKPIs = {
    O01: [
      { label:"Dossiers admin", value:dossiersPending.length, icon:"🏢", color:"#F97316", action:"dossiers" },
      { label:"Tâches en cours", value:tachesPending.length, icon:"📋", color:"#F59E0B", action:"taches" },
      { label:"RDV du jour", value:myRdvsToday.length, icon:"📅", color:"#06B6D4", action:"agenda" },
      { label:"Archives à traiter", value:_pErp.archPend, icon:"🗄️", color:"#22C55E", action:"archivage" },
    ],
    O02: [ // Juridique & Conseil
      { label:"Dossiers juridiques", value:dossiersPending.length, icon:"⚖️", color:"#3B82F6", action:"dossiers" },
      { label:"Tâches urgentes", value:myTachesHaute.length, icon:"⚡", color:"#EF4444", action:"taches" },
      { label:"RDV aujourd'hui", value:myRdvsToday.length, icon:"📅", color:"#06B6D4", action:"agenda" },
      { label:"Dossiers à risque", value:dossiersEnRetard.length, icon:"⚠️", color:"#C41E3A", action:"dossiers" },
    ],
    O03: [ // Évaluation & Gestion Entreprise
      { label:"Missions actives", value:dossiersPending.length, icon:"🗂️", color:"#14B8A6", action:"dossiers" },
      { label:"Tâches en cours", value:tachesPending.length, icon:"📋", color:"#F59E0B", action:"taches" },
      { label:"RDV clients", value:myRdvsToday.length, icon:"🤝", color:"#22C55E", action:"agenda" },
      { label:"Délais critiques", value:dossiersATerminer.length, icon:"⏰", color:"#EF4444", action:"dossiers" },
    ],
    P01: [ // Management & Stratégie
      { label:"Dossiers pilotage", value:dossiersPending.length, icon:"🎯", color:"#3B82F6", action:"dossiers" },
      { label:"Tâches stratégiques", value:tachesPending.length, icon:"📊", color:"#A855F7", action:"taches" },
      { label:"RDV direction", value:myRdvsToday.length, icon:"📅", color:"#06B6D4", action:"agenda" },
      { label:"CA portefeuille", value:formatCFA(myDossiers.reduce((a,d)=>a+(d.amount||0),0)), icon:"💰", color:"#C9A84C", action:"indicateurs" },
    ],
    P02: [ // Gouvernance & Conformité
      { label:"Dossiers conformité", value:dossiersPending.length, icon:"🛡️", color:"#A855F7", action:"dossiers" },
      { label:"Contrôles en cours", value:tachesPending.length, icon:"✓", color:"#22C55E", action:"taches" },
      { label:"Non-conformités", value:dossiersEnRetard.length, icon:"⚠️", color:"#C41E3A", action:"dossiers" },
      { label:"Approbations", value:pendingApprovals.filter(a=>!a.accountCreated).length, icon:"📋", color:"#3B82F6", action:"approbations" },
    ],
    P03: [ // Contrôle de Gestion Stratégique
      { label:"Dossiers contrôle", value:dossiersPending.length, icon:"📊", color:"#F59E0B", action:"dossiers" },
      { label:"Tâches en cours", value:tachesPending.length, icon:"📋", color:"#3B82F6", action:"taches" },
      { label:"CA suivi", value:formatCFA(myDossiers.reduce((a,d)=>a+(d.amount||0),0)), icon:"📈", color:"#22C55E", action:"indicateurs" },
      { label:"Écarts détectés", value:dossiersEnRetard.length, icon:"⚠️", color:"#EF4444", action:"dossiers" },
    ],
    P04: [ // Veille Stratégique & Commerciale
      { label:"Missions veille", value:dossiersPending.length, icon:"🔭", color:"#22C55E", action:"dossiers" },
      { label:"Tâches en cours", value:tachesPending.length, icon:"📋", color:"#3B82F6", action:"taches" },
      { label:"Opportunités", value:myDossiers.filter(d=>d.tags?.includes("OPPORTUNITÉ")).length, icon:"🎯", color:"#F59E0B", action:"dossiers" },
      { label:"RDV aujourd'hui", value:myRdvsToday.length, icon:"📅", color:"#06B6D4", action:"agenda" },
    ],
    S01: [ // Finance & Comptabilité
      { label:"Dossiers financiers", value:dossiersPending.length, icon:"💰", color:"#C9A84C", action:"dossiers" },
      { label:"Tâches comptables", value:tachesPending.length, icon:"📊", color:"#3B82F6", action:"taches" },
      { label:"CA actif", value:formatCFA(myDossiers.reduce((a,d)=>a+(d.amount||0),0)), icon:"📈", color:"#22C55E", action:"indicateurs" },
      { label:"Dossiers clôturés", value:termines, icon:"✅", color:"#A855F7", action:"dossiers" },
    ],
    S02: [ // Audit & Contrôle Interne
      { label:"Missions audit", value:dossiersPending.length, icon:"🔍", color:"#EF4444", action:"dossiers" },
      { label:"Points de contrôle", value:tachesPending.length, icon:"✓", color:"#3B82F6", action:"taches" },
      { label:"RDV entretiens", value:myRdvs.length, icon:"📋", color:"#22C55E", action:"agenda" },
      { label:"Non-conformités", value:dossiersEnRetard.length, icon:"⚠️", color:"#C41E3A", action:"dossiers" },
    ],
    S03: [ // Ressources Humaines
      { label:"Collaborateurs actifs", value:users.filter(u=>_activeUser(u)&&!u.isAdmin).length, icon:"👥", color:"#8B5CF6", action:"sirh" },
      { label:"Tâches RH", value:tachesPending.length, icon:"📋", color:"#3B82F6", action:"taches" },
      { label:"RDV du jour", value:myRdvsToday.length, icon:"📅", color:"#22C55E", action:"agenda" },
      { label:"Approbations RH", value:pendingApprovals.filter(a=>!a.accountCreated).length, icon:"👤", color:"#F59E0B", action:"approbations" },
    ],
    S04: [ // Communication
      { label:"Missions comm.", value:dossiersPending.length, icon:"📢", color:"#06B6D4", action:"dossiers" },
      { label:"Tâches en cours", value:tachesPending.length, icon:"📋", color:"#3B82F6", action:"taches" },
      { label:"RDV aujourd'hui", value:myRdvsToday.length, icon:"📅", color:"#22C55E", action:"agenda" },
      { label:"Délais à surveiller", value:dossiersATerminer.length, icon:"⏰", color:"#F59E0B", action:"dossiers" },
    ],
    S05: [ // Relations Ext. & Logistique
      { label:"Missions logistique", value:dossiersPending.length, icon:"🚚", color:"#F59E0B", action:"dossiers" },
      { label:"Tâches en cours", value:tachesPending.length, icon:"📋", color:"#3B82F6", action:"taches" },
      { label:"RDV partenaires", value:myRdvsToday.length, icon:"🤝", color:"#22C55E", action:"agenda" },
      { label:"Délais critiques", value:dossiersATerminer.length, icon:"⏰", color:"#EF4444", action:"dossiers" },
    ],
    S06: [ // Entretien & Sécurité
      { label:"Interventions", value:dossiersPending.length, icon:"🔧", color:"#84CC16", action:"dossiers" },
      { label:"Tâches maintenance", value:tachesPending.length, icon:"⚙️", color:"#3B82F6", action:"taches" },
      { label:"RDV du jour", value:myRdvsToday.length, icon:"📅", color:"#22C55E", action:"agenda" },
      { label:"Urgences", value:myTachesHaute.length, icon:"⚡", color:"#EF4444", action:"taches" },
    ]};
  const kpisToShow = procKPIs[proc] || [
    { label:"Mes dossiers", value:dossiersPending.length, icon:"📁", color:"#3B82F6", action:"dossiers" },
    { label:"Mes tâches", value:tachesPending.length, icon:"📋", color:"#F59E0B", action:"taches" },
    { label:"RDV du jour", value:myRdvsToday.length, icon:"📅", color:"#22C55E", action:"agenda" },
    { label:"Urgents", value:myTachesHaute.length, icon:"⚡", color:"#EF4444", action:"taches" },
  ];

  return (
    <div>
      <SmartBanner localUser={localUser} systemMsgs={systemMsgs} dossiers={dossiers} taches={taches} rdvs={rdvs} pendingApprovals={pendingApprovals} pendingConnections={pendingConnections} pendingAccountActions={pendingAccountActions} demandesData={demandesData} setActiveModule={setActiveModule} T={T} procColors={procColors} />
      {/* ── Header identité + status ── */}
      <div style={{background:`linear-gradient(135deg,${procColor}22,${T.surface2})`,border:`1px solid ${procColor}44`,borderRadius:14,padding:"14px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:46,height:46,borderRadius:"50%",background:localUser.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff",fontWeight:800,flexShrink:0,border:`2px solid ${procColor}66`,boxShadow:`0 0 16px ${procColor}44`,overflow:"hidden"}}>{localUser.photoUrl?<img src={localUser.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:localUser.avatar}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:T.text,fontWeight:800,fontSize:14}}>{greeting.text}, {localUser.name.split(" ")[0]} {greeting.emoji}</div>
          <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>{localUser.role} · {localUser.process} · {formatDate(new Date().toISOString())} · <LiveClock color={procColor} /></div>
        </div>
        {/* Status badges */}
        <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
          {myTachesHaute.length > 0 && (
            <div style={{background:"#EF444422",border:"1px solid #EF444444",borderRadius:8,padding:"4px 10px",display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>⚡</span>
              <span style={{color:"#EF4444",fontWeight:700,fontSize:10}}>{myTachesHaute.length} urgente(s)</span>
            </div>
          )}
          {myRdvsToday.length > 0 && (
            <div style={{background:"#06B6D422",border:"1px solid #06B6D444",borderRadius:8,padding:"4px 10px",display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>📅</span>
              <span style={{color:"#06B6D4",fontWeight:700,fontSize:10}}>{myRdvsToday.length} RDV aujourd'hui</span>
            </div>
          )}
          {dossiersEnRetard.length > 0 && (
            <div style={{background:"#C41E3A22",border:"1px solid #C41E3A44",borderRadius:8,padding:"4px 10px",display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>⚠️</span>
              <span style={{color:"#C41E3A",fontWeight:700,fontSize:10}}>{dossiersEnRetard.length} en retard</span>
            </div>
          )}
          {myTachesHaute.length===0&&dossiersEnRetard.length===0&&myRdvsToday.length===0 && (
            <div style={{background:"#22C55E22",border:"1px solid #22C55E44",borderRadius:8,padding:"4px 10px",display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>✅</span>
              <span style={{color:"#22C55E",fontWeight:700,fontSize:10}}>Tout est à jour</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Alerte rotative ── */}
      <RotatingAlert alerts={alerts} setActiveModule={setActiveModule} T={T} />

      {/* ── KPIs contextualisés par processus ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}} className="gc-grid-4">
        {kpisToShow.map((s,i)=>(
          <div key={i} onClick={()=>s.action&&setActiveModule(s.action)}
            style={{background:`linear-gradient(135deg,${s.color}15,${T.surface2})`,border:`1px solid ${s.color}33`,borderRadius:12,padding:"14px 12px",cursor:"pointer",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=s.color+"66";e.currentTarget.style.boxShadow=`0 8px 24px ${s.color}20`;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=s.color+"33";e.currentTarget.style.boxShadow="";}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div style={{width:34,height:34,borderRadius:9,background:s.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,border:`1px solid ${s.color}33`}}>{s.icon}</div>
              <span style={{color:s.color,fontSize:26,fontWeight:900,lineHeight:1}}>{s.value}</span>
            </div>
            <div style={{color:T.text,fontSize:10,fontWeight:700}}>{s.label}</div>
            {/* Indicateur de tendance */}
            {typeof s.value === "number" && s.value > 0 && (
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:s.color+"22"}}>
                <div style={{width:`${Math.min(100,s.value*10)}%`,height:"100%",background:s.color,borderRadius:3,transition:"width 0.8s ease"}} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Contenu principal 2 colonnes ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}} className="gc-grid-2">

        {/* ── Tâches prioritaires ── */}
        <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h4 style={{color:"#C41E3A",margin:0,fontSize:13,fontWeight:800}}>📋 Mes tâches</h4>
            {tachesPending.length > 0 && (
              <button onClick={()=>setActiveModule("taches")} style={{background:"#C41E3A22",border:"1px solid #C41E3A33",color:"#C41E3A",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>
                Voir tout ({tachesPending.length}) →
              </button>
            )}
          </div>
          {tachesPending.length === 0
            ? <div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:20}}>✅ Aucune tâche en attente</div>
            : tachesPending.sort((a,b)=>{const pp={HAUTE:0,MOYENNE:1,BASSE:2};return ((pp[a.priority]!==undefined?pp[a.priority]:1))-((pp[b.priority]!==undefined?pp[b.priority]:1));}).slice(0,5).map(t=>{
                const pc = PRIORITY_CONFIG[t.priority];
                const dl = t.deadline ? Math.ceil((new Date(t.deadline)-new Date())/(1000*60*60*24)) : null;
                return (
                  <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:T.surface3,borderRadius:8,border:`1px solid ${pc?.color||T.border}22`,marginBottom:5,cursor:"pointer"}}
                    onClick={()=>setActiveModule("taches")}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:pc?.color||T.border,flexShrink:0}} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.titre}</div>
                      <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>
                        {dl !== null ? (dl < 0 ? <span style={{color:"#C41E3A",fontWeight:700}}>⚠ Dépassé</span> : dl === 0 ? <span style={{color:"#F59E0B",fontWeight:700}}>🔥 Aujourd'hui</span> : `J-${dl}`) : "Sans délai"}
                      </div>
                    </div>
                    <Badge label={pc?.label} color={pc?.color} small />
                  </div>
                );
              })
          }
        </div>

        {/* ── Dossiers en cours ── */}
        <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h4 style={{color:"#C41E3A",margin:0,fontSize:13,fontWeight:800}}>📁 Mes dossiers</h4>
            {dossiersPending.length > 0 && (
              <button onClick={()=>setActiveModule("dossiers")} style={{background:"#C41E3A22",border:"1px solid #C41E3A33",color:"#C41E3A",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>
                Voir tout ({dossiersPending.length}) →
              </button>
            )}
          </div>
          {dossiersPending.length === 0
            ? <div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:20}}>✅ Aucun dossier en cours</div>
            : dossiersPending.sort((a,b)=>{if(a.priority==="HAUTE"&&b.priority!=="HAUTE")return -1;if(b.priority==="HAUTE"&&a.priority!=="HAUTE")return 1;return daysLeft(a.dueDate)-daysLeft(b.dueDate);}).slice(0,5).map(d=>{
                const sc = STATUS_CONFIG[d.status];
                const ds = gcDelaiStatut(d.dueDate);
                return (
                  <div key={d.id} onClick={()=>setSelectedDossier(d)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:T.surface3,borderRadius:8,border:`1px solid ${ds.statut==="DEPASSE"?"#C41E3A44":ds.statut==="CRITIQUE"?"#EF444433":ds.statut==="URGENT"?"#F59E0B33":T.border}`,marginBottom:5,cursor:"pointer"}}>
                    <span style={{color:sc.color,fontSize:14,flexShrink:0}}>{sc.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</div>
                      <div style={{marginTop:3}}>
                        <div style={{height:3,background:T.surface2,borderRadius:2}}>
                          <div style={{width:`${d.progress||0}%`,height:"100%",background:sc.color,borderRadius:2,transition:"width 0.5s"}} />
                        </div>
                      </div>
                      <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>{d.ref} · {d.progress||0}%</div>
                    </div>
                    <div style={{color:ds.color,fontSize:9,fontWeight:700,flexShrink:0,background:ds.color+"15",borderRadius:4,padding:"1px 5px",border:`1px solid ${ds.color}33`}}>
                      {ds.label}
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>

      {/* ── Carte suivi des dossiers + Carte actions rapides ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}} className="gc-grid-2">

        {/* ── SUIVI DES DOSSIERS (carte dédiée) ── */}
        <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${procColor}33`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h4 style={{color:procColor,margin:0,fontSize:13,fontWeight:800}}>📊 Suivi des dossiers</h4>
            <button onClick={()=>setActiveModule("dossiers")} style={{background:procColor+"22",border:`1px solid ${procColor}44`,color:procColor,borderRadius:6,padding:"2px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>
              Voir tout ({dossiersPending.length}) →
            </button>
          </div>
          {/* Barres état */}
          {[
            {label:"En cours",val:myDossiers.filter(d=>d.status==="EN_COURS").length,c:"#3B82F6",tot:Math.max(myDossiers.length,1)},
            {label:"En attente",val:myDossiers.filter(d=>d.status.startsWith("ATTENTE")).length,c:"#F59E0B",tot:Math.max(myDossiers.length,1)},
            {label:"Terminés",val:termines,c:"#22C55E",tot:Math.max(myDossiers.length,1)},
            {label:"Urgents",val:urgents,c:"#C41E3A",tot:Math.max(myDossiers.length,1)},
          ].map(b=>(
            <div key={b.label} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{color:T.textMuted,fontSize:10}}>{b.label}</span>
                <span style={{color:b.c,fontWeight:700,fontSize:11}}>{b.val}</span>
              </div>
              <div style={{height:5,background:b.c+"22",borderRadius:3,overflow:"hidden"}}>
                <div style={{width:`${Math.min(100,Math.round(b.val/b.tot*100))}%`,height:"100%",background:b.c,borderRadius:3,transition:"width 0.8s ease"}} />
              </div>
            </div>
          ))}
          {/* Liste top 3 urgents */}
          {dossiersPending.filter(d=>d.priority==="HAUTE").slice(0,3).map(d=>{
            const dl=daysLeft(d.dueDate);
            return (
              <div key={d.id} onClick={()=>{setActiveModule("dossiers");setSelectedDossier&&setSelectedDossier(d);}} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 9px",background:"#C41E3A11",borderRadius:7,border:"1px solid #C41E3A33",marginTop:4,cursor:"pointer"}}>
                <span style={{fontSize:12,flexShrink:0}}>🚨</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:T.text,fontSize:10,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</div>
                  <div style={{color:T.textDim,fontSize:9}}>{d.ref}</div>
                </div>
                <span style={{color:dl<0?"#C41E3A":"#F59E0B",fontSize:9,fontWeight:700,flexShrink:0}}>{dl<0?`⚠ J+${Math.abs(dl)}`:`J-${dl}`}</span>
              </div>
            );
          })}
          {dossiersPending.length===0&&<div style={{color:T.textMuted,textAlign:"center",padding:12,fontSize:11}}>✅ Aucun dossier actif</div>}
        </div>

        {/* ── ACTIONS RAPIDES enrichies ── */}
        <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
          <h4 style={{color:"#C41E3A",margin:"0 0 10px",fontSize:13,fontWeight:800}}>⚡ Actions rapides</h4>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[
              {icon:"📁",label:"Mes dossiers",action:"dossiers",color:"#3B82F6",badge:dossiersPending.length||null},
              {icon:"📋",label:"Mes tâches",action:"taches",color:"#F59E0B",badge:tachesPending.length||null},
              {icon:"📅",label:"Agenda",action:"agenda",color:"#06B6D4",badge:myRdvsToday.length||null},
              {icon:"📨",label:"Demandes",action:"demandes",color:"#A855F7"},
              {icon:"✉️",label:"Messages",action:()=>setShowMessaging&&setShowMessaging(true),color:"#EC4899"},
              {icon:"📄",label:"Dossiers & Docs",action:"dossiers",color:"#22C55E"},
              ...(proc==="S03"?[{icon:"👥",label:"SIRH",action:"sirh",color:"#8B5CF6"}]:[]),
              ...(proc==="S01"||proc==="P03"?[{icon:"💰",label:"Finance",action:"finance",color:"#C9A84C"}]:[]),
              ...((proc==="S02"||proc==="P02")?[
                {icon:"🔍",label:"Audit",action:"audit",color:"#EF4444",badge:dossiersPending.filter(d=>d.process===proc).length||null},
                {icon:"⚠️",label:"Conformité",action:"conformite",color:"#A855F7"},
              ]:[]),
              ...(proc==="O02"?[{icon:"⚖️",label:"Juridique",action:"juridique",color:"#3B82F6"}]:[]),
              ...(proc==="O01"?[{icon:"🗂️",label:"Archivage",action:"archivage",color:"#F97316"}]:[]),
              ...(proc==="O03"?[{icon:"🗂️",label:"Éval. & Gestion",action:"audit",color:"#14B8A6"}]:[]),
              ...(proc==="P01"?[{icon:"🎯",label:"Conseil & Stratégie",action:"conseil",color:"#3B82F6"}]:[]),
              ...(proc==="P04"?[{icon:"🔭",label:"Veille Stratégique",action:"bureau",color:"#22C55E"}]:[]),
              ...(proc==="S04"?[{icon:"📢",label:"Communication",action:"communication",color:"#06B6D4"}]:[]),
              ...(proc==="S05"?[{icon:"🚚",label:"Logistique",action:"logistique",color:"#F59E0B"}]:[]),
              ...(proc==="S06"?[{icon:"🔧",label:"Entretien & Sécu.",action:"bureau",color:"#84CC16"}]:[]),
            ].map((a,i)=>(
              <button key={i} type="button" onClick={()=>typeof a.action==="function"?a.action():setActiveModule(a.action)}
                style={{background:a.color+"15",border:`1px solid ${a.color}33`,borderRadius:8,padding:"8px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s",position:"relative"}}
                onMouseEnter={e=>{e.currentTarget.style.background=a.color+"28";e.currentTarget.style.borderColor=a.color+"66";e.currentTarget.style.transform="translateY(-1px)";}}
                onMouseLeave={e=>{e.currentTarget.style.background=a.color+"15";e.currentTarget.style.borderColor=a.color+"33";e.currentTarget.style.transform="";}}>
                <span style={{fontSize:14}}>{a.icon}</span>
                <span style={{color:a.color,fontSize:10,fontWeight:700,flex:1,textAlign:"left"}}>{a.label}</span>
                {a.badge>0&&<span style={{background:a.color,color:"#fff",borderRadius:99,padding:"0px 5px",fontSize:8,fontWeight:800,flexShrink:0}}>{a.badge}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Indicateurs SI pertinents selon processus ── */}
      <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${procColor}22`,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <h4 style={{color:procColor,margin:0,fontSize:13,fontWeight:800}}>📊 Indicateurs SI — {CODES.processes[proc]||proc}</h4>
          <button onClick={()=>setActiveModule("indicateurs")} style={{background:procColor+"22",border:`1px solid ${procColor}44`,color:procColor,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>Voir tout →</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
          {[
            {icon:"📁",label:"Mes dossiers actifs",value:dossiersPending.length,c:"#3B82F6",always:true},
            {icon:"📋",label:"Tâches en cours",value:tachesPending.length,c:"#F59E0B",always:true},
            {icon:"⚡",label:"Tâches urgentes",value:myTachesHaute.length,c:"#C41E3A",always:true},
            {icon:"✅",label:"Dossiers terminés",value:termines,c:"#22C55E",always:true},
            {icon:"💰",label:"CA actif",value:formatCFA(myDossiers.reduce((a,d)=>a+(d.amount||0),0)),c:"#C9A84C",show:financeVisible},
            {icon:"🛡️",label:"Approbations",value:pendingApprovals.filter(a=>!a.accountCreated).length,c:"#A855F7",show:canSeeAudit},
            {icon:"👥",label:"Collaborateurs",value:users.filter(u=>_activeUser(u)&&!u.isAdmin&&!u.blocked).length,c:"#8B5CF6",show:canSeeRH},
          ].filter(i=>i.always||i.show).map((ind,idx)=>(
            <div key={idx} style={{background:`linear-gradient(135deg,${ind.c}12,${T.surface3})`,border:`1px solid ${ind.c}33`,borderRadius:9,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <span style={{fontSize:16}}>{ind.icon}</span>
                <span style={{color:ind.c,fontSize:typeof ind.value==="number"?20:13,fontWeight:900}}>{ind.value}</span>
              </div>
              <div style={{color:T.textMuted,fontSize:9,marginTop:5,fontWeight:600}}>{ind.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Agenda du jour ── */}
      <div style={{background:T.surface2,borderRadius:12,padding:14,border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <h4 style={{color:"#C41E3A",margin:0,fontSize:13,fontWeight:800}}>📅 Agenda — Aujourd'hui</h4>
          <button onClick={()=>setActiveModule("agenda")} style={{background:"#06B6D422",border:"1px solid #06B6D433",color:"#06B6D4",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:9,fontWeight:700}}>Agenda →</button>
        </div>
        {myRdvsToday.length===0
          ? <div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:14}}>📭 Aucun RDV aujourd'hui</div>
          : myRdvsToday.map(r=>(
            <div key={r.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 10px",background:T.surface3,borderRadius:8,border:`1px solid ${T.border}`,marginBottom:5}}>
              <div style={{background:"#C41E3A22",borderRadius:7,padding:"4px 7px",textAlign:"center",flexShrink:0}}>
                <div style={{color:"#C41E3A",fontWeight:900,fontSize:13}}>{r.heure||"?"}</div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.client||r.objet}</div>
                <div style={{color:T.textMuted,fontSize:9}}>{r.type||"Rendez-vous"}{r.salle?` · ${r.salle}`:""}</div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
};

// ── QuickPartnerCreate — création rapide d'un collaborateur/client externe ──
// Injectée sous le <select> partenaires dans les formulaires Dossier et Document.
// Props : T, partners, setPartnersSync, selectedId, onSelect, canCreate


