import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// AgendaModule.jsx — SI Génie Consultant v127
import { _lsGet, _lsSet, _noop, gcPushNotif, playSound, formatDate, _activeUser, getUser , dsSave } from '../../core/index.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, Badge} from '../../components/UI.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function AgendaModule({ rdvs: rdvsData, users=[], localUser, T, dossiers=[], setRdvs=_noop, setNotifications=_noop, committees=[], partners=[] }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [view, setView] = useState("calendar");
  const [showForm, setShowForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingRdv, setEditingRdv] = useState(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [localRdvs, setLocalRdvs] = useState(rdvsData);

  const [form, setForm] = useState({
    client: "", date: "", heure: "09:00", duree: 60, type: "Consultation juridique",
    salle: "Salle A", assignedTo: localUser.id, notes: "",
    collabType: "interne", // interne | externe
    partnerId: "", // if externe
    rappel: "15", // minutes before: 0=none, 15, 30, 60, 120, "custom"
  });

  const [eventForm, setEventForm] = useState({
    titre: "", date: "", heure: "09:00", type: "public", description: "",
    destinatairesInternes: [], // array of user ids
    destinatairesExternes: [], // array of partner ids
  });

  const [quickCreateDate, setQuickCreateDate] = useState(null);
  const [quickForm, setQuickForm] = useState({ mode: "rdv", client: "", heure: "09:00", duree: 60, type: "Consultation juridique", salle: "Salle A", assignedTo: localUser.id, partnerId: "", collabType: "interne" });
  const [viewDateEvents, setViewDateEvents] = useState(null);
  const [editingRdvModal, setEditingRdvModal] = useState(null);
  const [rdvSearch, setRdvSearch] = useState("");
  const [rdvTypeFilter, setRdvTypeFilter] = useState("ALL");
  const [rdvStatusFilter, setRdvStatusFilter] = useState("ALL");
  const [rdvAssigneeFilter, setRdvAssigneeFilter] = useState("ALL");

  useEffect(() => { setLocalRdvs(rdvsData); }, [rdvsData]);

  const myRdvs = localRdvs.filter(r =>
    localUser.level >= 4 ||
    r.assignedTo === localUser.id ||
    (r.isEvent && r.type?.includes("Public")) ||
    (r.destinatairesInternes || []).includes(localUser.id)
  );
  const today = new Date().toISOString().split("T")[0];
  const upcoming = myRdvs.filter(r => {
    if (r.date < today || r.status === "ANNULE") return false;
    if (rdvSearch) {
      const q = rdvSearch.toLowerCase();
      if (!(r.client||"").toLowerCase().includes(q) && !(r.type||"").toLowerCase().includes(q)) return false;
    }
    if (rdvTypeFilter !== "ALL" && r.type !== rdvTypeFilter) return false;
    if (rdvAssigneeFilter !== "ALL" && r.assignedTo !== rdvAssigneeFilter) return false;
    return true;
  }).sort((a,b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure));
  const past = myRdvs.filter(r => r.date < today || r.status === "ANNULE");

  const handleCancelRdv = (rdvId, motif) => {
    setLocalRdvs(prev => prev.map(r => r.id === rdvId ? {...r, status:"ANNULE", cancelMotif:motif, cancelledBy:localUser.id, cancelledAt:new Date().toISOString()} : r));
    setRdvs && setRdvs(prev => {const updated=prev.map(r => r.id === rdvId ? {...r, status:"ANNULE", cancelMotif:motif, cancelledBy:localUser.id, cancelledAt:new Date().toISOString()} : r);dsSave('rdvs',updated);return updated;});
    const rdv = localRdvs.find(r=>r.id===rdvId);
    setNotifications(prev => [{id:"N"+Date.now(),icon:"🚫",message:`RDV "${rdv?.client||rdvId}" annulé par ${localUser.name}${motif?" — Motif: "+motif:""}`,at:new Date().toISOString(),read:false},...prev]);
    if (rdv?.assignedTo && rdv.assignedTo !== localUser.id) {
      setNotifications(prev => [{id:"N"+Date.now(),icon:"🚫",message:`⚠️ Votre RDV "${rdv.client}" du ${rdv.date} a été annulé par ${localUser.name}`,at:new Date().toISOString(),read:false,forUser:rdv.assignedTo},...prev]);
      // FIX v92 — gcPushNotif cross-user pour l'annulation RDV
      gcPushNotif(rdv.assignedTo, {
        id:"N"+Date.now()+rdv.assignedTo, icon:"🚫",
        message:`🚫 RDV annulé par ${localUser.name} : "${rdv.client}" du ${rdv.date}${motif?" — Motif: "+motif:""}`,
        at:new Date().toISOString(), read:false, module:"agenda",
      });
    }
    playSound("alarm");
  };

  const getDaysInMonth = (y, m) => new Date(y, m+1, 0).getDate();
  const getFirstDay = (y, m) => new Date(y, m, 1).getDay();
  const monthNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const dayNames = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];

  // Relances CRM O01 — lues depuis localStorage pour les afficher sur le calendrier
  const crmRelances = React.useMemo(() => {
    try {
      const all = JSON.parse(_lsGet("gc-crm-relances") || "[]");
      // Seules les relances assignées à moi ou si niv4+ voir toutes, non terminées
      return all.filter(r => r.statut !== "FAIT" && (localUser.level >= 4 || r.assignedTo === localUser.id));
    } catch(_) { return []; }
  }, [localUser.id, localUser.level]);

  // Clients CRM — pour afficher le nom
  const crmClients = React.useMemo(() => {
    try { return JSON.parse(_lsGet("gc-crm-clients") || "[]"); } catch(_) { return []; }
  }, []);

  // getRdvsForDate enrichi — inclut RDVs + relances CRM du jour
  const getRdvsForDate = (dateStr) => {
    const rdvsDuJour = myRdvs.filter(r => r.date === dateStr);
    // Relances du jour formatées comme des événements légers
    const relancesDuJour = crmRelances
      .filter(r => r.dateRelance === dateStr)
      .map(r => {
        const client = crmClients.find(c => c.id === r.clientId);
        return {
          id: r.id, _isRelance: true,
          client: client?.nom || "Client",
          type: `🔔 Relance ${r.type||""}`, heure: "08:00",
          status: r.priorite === "URGENTE" ? "URGENT" : "EN_ATTENTE",
          assignedTo: r.assignedTo, relanceObjet: r.objet,
          relancePriorite: r.priorite,
        };
      });
    return [...rdvsDuJour, ...relancesDuJour];
  };

  const getCollabDisplay = (rdv) => {
    if (rdv.partnerId) {
      const p = partners.find(x=>x.id===rdv.partnerId);
      return p ? `🌐 ${p.nom}` : rdv.client;
    }
    const u = users.find(x=>x.id===rdv.assignedTo);
    return u ? `👤 ${u.name}` : rdv.client;
  };

  const handleSaveRdv = () => {
    if (!form.client || !form.date) return;
    const linkedPartner = form.collabType==="externe" && form.partnerId ? partners.find(p=>p.id===form.partnerId) : null;
    const newRdv = {
      id: `RDV-${Date.now()}`, ...form,
      client: linkedPartner ? linkedPartner.nom : form.client,
      status: "EN_ATTENTE",
      partnerId: linkedPartner?.id||null, partnerNom: linkedPartner?.nom||null,
      rappel: form.rappel||"15",
    };
    setLocalRdvs(prev => [...prev, newRdv]);
    setRdvs && setRdvs(prev => {const updated=[...prev, newRdv];dsSave('rdvs',updated);return updated;});
    const assignee = users.find(u=>u.id===form.assignedTo);
    setNotifications(prev => [{id:"N"+Date.now(),icon:"📅",message:`RDV programmé : ${newRdv.client} le ${form.date} à ${form.heure}${assignee?" — Assigné à "+assignee.name:""}${linkedPartner?" (Partenaire externe — rappel)":""}`  ,at:new Date().toISOString(),read:false},...prev]);
    // FIX v92 — Notifier l'utilisateur assigné s'il est différent du créateur
    if (assignee && assignee.id !== localUser.id) {
      gcPushNotif(assignee.id, {
        id: "N"+Date.now()+assignee.id, icon: "📅",
        message: `📅 RDV vous est assigné par ${localUser.name} : "${newRdv.client}" le ${form.date} à ${form.heure}`,
        at: new Date().toISOString(), read: false, module: "agenda",
      });
    }
    playSound("rdv");
    if (form.rappel && form.rappel !== "0" && form.date) {
      const rappelMin = parseInt(form.rappel, 10)||15;
      const rdvDateTime = new Date(`${form.date}T${form.heure||"09:00"}:00`);
      const alarmDateTime = new Date(rdvDateTime.getTime() - rappelMin*60000);
      const alarmTimeStr = `${String(alarmDateTime.getHours()).padStart(2,"0")}:${String(alarmDateTime.getMinutes()).padStart(2,"0")}`;
      const alarmDate = alarmDateTime.toISOString().split("T")[0];
      let alarms = []; try { alarms = JSON.parse(_lsGet("gc-widget-alarms")||"[]"); } catch(_) {} // FIX v127
      alarms.push({ id:`WALM-RDV-${newRdv.id}`, time:alarmTimeStr, date:alarmDate, label:`🗓️ RDV dans ${rappelMin}min : ${newRdv.client}`, active:true, fired:false, repeat:"once", rdvId:newRdv.id });
      try { _lsSet("gc-widget-alarms", JSON.stringify(alarms)); dsSave("gc-widget-alarms", alarms).catch(err => gcToast.syncError('', err)); } catch (_) {}
      setNotifications(prev=>[{id:"N"+Date.now(),icon:"⏰",message:`⏰ Rappel programmé : RDV ${newRdv.client} — ${rappelMin} min avant (${alarmTimeStr})`,at:new Date().toISOString(),read:false},...prev]);
    }
    if (linkedPartner) {
      setTimeout(()=>{setNotifications(p=>[{id:"N"+Date.now(),icon:"📌",message:`📌 RAPPEL : RDV externe avec ${linkedPartner.nom} le ${form.date} à ${form.heure} — Pensez à le contacter !`,at:new Date().toISOString(),read:false},...p]);},500);
    }
    setShowForm(false);
    setForm({ client:"", date:"", heure:"09:00", duree:60, type:"Consultation juridique", salle:"Salle A", assignedTo:localUser.id, notes:"", collabType:"interne", partnerId:"", rappel:"15" });
  };

  const handleSaveEvent = () => {
    if (!eventForm.titre || !eventForm.date) return;
    const newEvt = {
      id: `EVT-${Date.now()}`,
      client: `${eventForm.type==="public"?"📢":"🔒"} ${eventForm.titre}`,
      date: eventForm.date, heure: eventForm.heure, duree: 60,
      type: eventForm.type === "public" ? "Événement Public" : "Événement Privé",
      salle: "", assignedTo: localUser.id, status: "CONFIRME", isEvent: true,
      destinatairesInternes: eventForm.destinatairesInternes,
      destinatairesExternes: eventForm.destinatairesExternes,
      description: eventForm.description,
    };
    setLocalRdvs(prev => [...prev, newEvt]);
    setRdvs && setRdvs(prev => {const updated=[...prev, newEvt];dsSave('rdvs',updated);return updated;});
    const internalNotifs = eventForm.destinatairesInternes.map(uid=>{
      const u=users.find(x=>x.id===uid);
      return u ? {id:"N"+Date.now()+uid,icon:"📢",message:`Événement "${eventForm.titre}" le ${eventForm.date} à ${eventForm.heure} — Vous êtes invité(e)`,at:new Date().toISOString(),read:false,forUser:uid} : null;
    }).filter(Boolean);
    // FIX v92 — Pousser aussi via gcPushNotif pour que chaque invité voie la notif à sa prochaine connexion
    eventForm.destinatairesInternes.forEach(uid => {
      if (uid !== localUser.id) {
        gcPushNotif(uid, {
          id: "N"+Date.now()+uid, icon: "📢",
          message: `📢 Invitation : "${eventForm.titre}" le ${eventForm.date} à ${eventForm.heure} — de ${localUser.name}`,
          at: new Date().toISOString(), read: false, module: "agenda",
        });
      }
    });
    const extReminders = eventForm.destinatairesExternes.map(pid=>{
      const p=partners.find(x=>x.id===pid);
      return p ? {id:"N"+Date.now()+pid,icon:"📌",message:`📌 RAPPEL : Événement prévu avec ${p.nom} le ${eventForm.date} à ${eventForm.heure}. Pensez à les contacter.`,at:new Date().toISOString(),read:false} : null;
    }).filter(Boolean);
    setNotifications(prev=>[...internalNotifs,...extReminders,{id:"N"+Date.now(),icon:"📅",message:`Événement créé : "${eventForm.titre}" le ${eventForm.date}`,at:new Date().toISOString(),read:false},...prev]);
    playSound("rdv");
    setShowEventForm(false);
    setEventForm({titre:"",date:"",heure:"09:00",type:"public",description:"",destinatairesInternes:[],destinatairesExternes:[]});
  };

  const handleQuickCreate = () => {
    if (!quickForm.client || !quickCreateDate) return;
    const linkedPartner = quickForm.collabType==="externe"&&quickForm.partnerId ? partners.find(p=>p.id===quickForm.partnerId):null;
    const newRdv = { id:`RDV-${Date.now()}`, client:linkedPartner?linkedPartner.nom:quickForm.client, date:quickCreateDate, heure:quickForm.heure, duree:quickForm.duree, type:quickForm.type, salle:quickForm.salle, assignedTo:quickForm.assignedTo, status:"EN_ATTENTE", isEvent:quickForm.mode==="event", partnerId:linkedPartner?.id||null };
    setLocalRdvs(prev => [...prev, newRdv]);
    setRdvs && setRdvs(prev => {const updated=[...prev, newRdv];dsSave('rdvs',updated);return updated;});
    playSound("rdv");
    setNotifications(prev => [{id:"N"+Date.now(),icon:"📅",message:`${quickForm.mode==="event"?"Événement":"RDV"} créé le ${quickCreateDate} : ${newRdv.client}`,at:new Date().toISOString(),read:false},...prev]);
    // FIX v92 — Notifier l'assigné si différent du créateur
    const assignee = users.find(u=>u.id===quickForm.assignedTo);
    if (assignee && assignee.id !== localUser.id) {
      gcPushNotif(assignee.id, {
        id:"N"+Date.now()+assignee.id, icon:"📅",
        message:`📅 ${quickForm.mode==="event"?"Événement":"RDV"} vous est assigné par ${localUser.name} : "${newRdv.client}" le ${quickCreateDate} à ${quickForm.heure}`,
        at:new Date().toISOString(), read:false, module:"agenda",
      });
    }
    setQuickCreateDate(null);
    setQuickForm({mode:"rdv",client:"",heure:"09:00",duree:60,type:"Consultation juridique",salle:"Salle A",assignedTo:localUser.id,partnerId:"",collabType:"interne"});
  };

  const handleDeleteRdv = async (rdvId) => {
    if (!await gcConfirm("Supprimer ce rendez-vous / événement ?")) return;
    setLocalRdvs(prev => prev.filter(r => r.id !== rdvId));
    setRdvs && setRdvs(prev => {const updated=prev.filter(r => r.id !== rdvId);dsSave('rdvs',updated);return updated;});
    setNotifications(prev => [{id:"N"+Date.now(),icon:"🗑️",message:`RDV supprimé par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
  };

  const handleEditRdvSave = () => {
    if (!editingRdvModal) return;
    setLocalRdvs(prev => prev.map(r => r.id === editingRdvModal.id ? editingRdvModal : r));
    setRdvs && setRdvs(prev => {const updated=prev.map(r => r.id === editingRdvModal.id ? editingRdvModal : r);dsSave('rdvs',updated);return updated;});
    setNotifications(prev => [{id:"N"+Date.now(),icon:"✏️",message:`RDV "${editingRdvModal.client}" modifié par ${localUser.name}`,at:new Date().toISOString(),read:false},...prev]);
    // FIX v92 — Notifier l'assigné si différent du modificateur
    if (editingRdvModal.assignedTo && editingRdvModal.assignedTo !== localUser.id) {
      gcPushNotif(editingRdvModal.assignedTo, {
        id:"N"+Date.now()+editingRdvModal.assignedTo, icon:"✏️",
        message:`✏️ Votre RDV "${editingRdvModal.client}" a été modifié par ${localUser.name} — Nouvelle date : ${editingRdvModal.date} à ${editingRdvModal.heure}`,
        at:new Date().toISOString(), read:false, module:"agenda",
      });
    }
    setEditingRdvModal(null);
  };

  return (
    <div>
      {/* Edit RDV Modal */}
      {editingRdvModal && (
        <div style={{position:"fixed",inset:0,background:"#000A",zIndex:5001,display:"flex",alignItems:"center",justifyContent:"center"}} onMouseDown={e=>{if(e.target===e.currentTarget)setEditingRdvModal(null);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:"1px solid #C41E3A44",borderRadius:16,padding:"24px 28px",width:460,maxWidth:"95vw",boxShadow:"0 24px 80px #0009",maxHeight:"90vh",overflowY:"auto"}}>
            <h3 style={{color:"#C41E3A",margin:"0 0 16px",fontWeight:800,fontSize:14}}>✏️ Modifier le RDV / Événement</h3>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <InputField label="Client / Objet *" value={editingRdvModal.client} onChange={e=>setEditingRdvModal(f=>({...f,client:e.target.value}))} T={T} />
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <InputField label="Date" type="date" value={editingRdvModal.date} onChange={e=>setEditingRdvModal(f=>({...f,date:e.target.value}))} T={T} />
                <InputField label="Heure" type="time" value={editingRdvModal.heure} onChange={e=>setEditingRdvModal(f=>({...f,heure:e.target.value}))} T={T} />
                <InputField label="Durée (min)" type="number" value={editingRdvModal.duree} onChange={e=>setEditingRdvModal(f=>({...f,duree:Number(e.target.value)}))} T={T} />
                <InputField label="Salle" value={editingRdvModal.salle||""} onChange={e=>setEditingRdvModal(f=>({...f,salle:e.target.value}))} T={T} />
              </div>
              <InputField label="Notes" value={editingRdvModal.notes||""} onChange={e=>setEditingRdvModal(f=>({...f,notes:e.target.value}))} T={T} />
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={handleEditRdvSave} style={{flex:1,background:"#C41E3A",border:"none",color:"#fff",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}}>✅ Enregistrer</button>
                <button onClick={()=>setEditingRdvModal(null)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:13}}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View date events modal */}
      {viewDateEvents && (
        <div style={{position:"fixed",inset:0,background:"#000A",zIndex:5000,display:"flex",alignItems:"center",justifyContent:"center"}} onMouseDown={e=>{if(e.target===e.currentTarget)setViewDateEvents(null);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:"1px solid #C41E3A44",borderRadius:16,padding:"24px 28px",width:480,maxWidth:"95vw",boxShadow:"0 24px 80px #0009",maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{color:"#C41E3A",margin:0,fontWeight:800,fontSize:14}}>📅 Programmes du {viewDateEvents}</h3>
              <button onClick={()=>setViewDateEvents(null)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:18}}>✕</button>
            </div>
            {getRdvsForDate(viewDateEvents).length === 0
              ? <div style={{color:T.textMuted,textAlign:"center",padding:20,fontSize:12}}>Aucun RDV/événement programmé ce jour.</div>
              : getRdvsForDate(viewDateEvents).sort((a,b)=>a.heure.localeCompare(b.heure)).map(r=>(
                <div key={r.id} style={{background:r._isRelance?"#F9731610":T.surface2,borderRadius:10,border:`1px solid ${r._isRelance?"#F9731633":T.border}`,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{background:r._isRelance?"#F9731622":"#C41E3A22",borderRadius:6,padding:"4px 8px",textAlign:"center",flexShrink:0}}>
                    <div style={{color:r._isRelance?"#F97316":"#C41E3A",fontWeight:800,fontSize:12}}>{r._isRelance?"🔔":r.heure}</div>
                    {r._isRelance&&<div style={{color:"#F97316",fontSize:7,fontWeight:700}}>CRM</div>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:12}}>{r._isRelance?r.relanceObjet:r.client}</div>
                    <div style={{color:T.textMuted,fontSize:10}}>
                      {r._isRelance?`${r.client} · ${r.type} · ${r.relancePriorite||"NORMALE"}`:`${r.type} · ${r.salle||"—"} · ${r.duree} min`}
                    </div>
                  </div>
                  {/* Boutons : pas de modification RDV sur une relance CRM */}
                  {!r._isRelance && (localUser.level>=4||r.assignedTo===localUser.id)&&<div style={{display:"flex",gap:4,flexShrink:0}}>
                    <button onClick={async () => {setEditingRdvModal({...r});setViewDateEvents(null);}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>✏️</button>
                    <button onClick={()=>handleDeleteRdv(r.id)} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>🗑️</button>
                    {r.status !== "ANNULE" && <button onClick={async () => {const m = await gcPrompt("Motif d'annulation (obligatoire) :");if(m)handleCancelRdv(r.id,m);}} style={{background:"#F59E0B15",border:"1px solid #F59E0B33",color:"#F59E0B",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>🚫 Annuler</button>}
                  </div>}
                  {/* Relance CRM : afficher le statut et lien vers CRM */}
                  {r._isRelance&&<span style={{background:"#F9731622",color:"#F97316",border:"1px solid #F9731644",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700,flexShrink:0}}>Relance O01</span>}
                </div>
              ))
            }
            <div style={{marginTop:12,borderTop:`1px solid ${T.border}`,paddingTop:12}}>
              <button onClick={() => {setQuickCreateDate(viewDateEvents);setViewDateEvents(null);}} style={{width:"100%",background:"#C41E3A",border:"none",color:"#fff",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}}>+ Créer un RDV / Événement ce jour</button>
            </div>
          </div>
        </div>
      )}

      {quickCreateDate && (
        <div style={{ position:"fixed", inset:0, background:"#000A", zIndex:5000, display:"flex", alignItems:"center", justifyContent:"center" }} onMouseDown={e=>{if(e.target===e.currentTarget)setQuickCreateDate(null);}}>
          <div onClick={e=>e.stopPropagation()} style={{ background:T.surface, border:"1px solid #C41E3A44", borderRadius:16, padding:"24px 28px", width:420, maxWidth:"95vw", boxShadow:"0 24px 80px #0009" }}>
            <h3 style={{ color:"#C41E3A", margin:"0 0 14px", fontWeight:800, fontSize:15 }}>📅 Créer — {quickCreateDate}</h3>
            <div style={{ display:"flex", gap:6, marginBottom:14 }}>
              {[["rdv","📋 RDV Client"],["event","📢 Événement"]].map(([m,l])=>(
                <button key={m} onClick={()=>setQuickForm(f=>({...f,mode:m}))} style={{ flex:1, padding:"7px 10px", background:quickForm.mode===m?"#C41E3A":"transparent", color:quickForm.mode===m?"#fff":T.textMuted, border:`1px solid ${quickForm.mode===m?"#C41E3A":T.border}`, borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>{l}</button>
              ))}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {/* Champ client avec datalist connecté aux partenaires CRM */}
              <div>
                <label style={{color:T.textMuted,fontSize:11,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600}}>{quickForm.mode==="event"?"Titre de l'événement *":"Client / Objet *"}</label>
                <input list="gc-rdv-clients-list"
                  value={quickForm.client}
                  onChange={e=>{
                    const val=e.target.value;
                    const matched=(partners||[]).find(p=>p.nom===val);
                    setQuickForm(f=>({...f,client:val,partnerId:matched?matched.id:f.partnerId}));
                  }}
                  placeholder={quickForm.mode==="event"?"Titre de l'événement...":"Nom du client (ou tapez librement)"}
                  style={{width:"100%",background:T.surface3,border:`1px solid ${(partners||[]).find(p=>p.nom===quickForm.client)?"#22C55E44":T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
                <datalist id="gc-rdv-clients-list">
                  {/* FIX v130 — étendu à tous les types (fournisseur, regulateur, etat inclus) */}
                  {(partners||[]).map(p=>(
                    <option key={p.id} value={p.nom}>{p.nom} — {p.type}{p.tel?` · ${p.tel}`:""}</option>
                  ))}
                </datalist>
                {(partners||[]).find(p=>p.nom===quickForm.client)&&(
                  <div style={{color:"#22C55E",fontSize:9,marginTop:2}}>✅ Client identifié dans le CRM — RDV lié automatiquement</div>
                )}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <InputField label="Heure" type="time" value={quickForm.heure} onChange={e=>setQuickForm(f=>({...f,heure:e.target.value}))} T={T} />
                <InputField label="Durée (min)" type="number" value={quickForm.duree} onChange={e=>setQuickForm(f=>({...f,duree:Number(e.target.value)}))} T={T} />
              </div>
              {quickForm.mode==="rdv" && (
                <>
                  <InputField label="Type de RDV" value={quickForm.type} onChange={e=>setQuickForm(f=>({...f,type:e.target.value}))} T={T} />
                  <div>
                    <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Assigner à</label>
                    <select value={quickForm.assignedTo} onChange={e=>setQuickForm(f=>({...f,assignedTo:e.target.value}))} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                      {users.filter(u=>_activeUser(u)&&u.level>=1).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              <button onClick={handleQuickCreate} style={{ flex:1, background:"#C41E3A", border:"none", color:"#fff", borderRadius:8, padding:"10px", cursor:"pointer", fontWeight:700, fontSize:13 }}>✅ Enregistrer</button>
              <button onClick={()=>setQuickCreateDate(null)} style={{ background:"transparent", border:`1px solid ${T.border}`, color:T.textMuted, borderRadius:8, padding:"10px 16px", cursor:"pointer", fontSize:13 }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        {/* Today's RDV countdown banners */}
        {(() => {
          const now = new Date();
          const todayStr = now.toISOString().split("T")[0];
          const nowMin = now.getHours()*60+now.getMinutes();
          const todayRdvs = myRdvs.filter(r=>r.date===todayStr).sort((a,b)=>a.heure.localeCompare(b.heure));
          if (todayRdvs.length === 0) return null;
          return (
            <div style={{ width:"100%", marginBottom:10 }}>
              <div style={{ color:"#C41E3A", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:5 }}>⏰ Aujourd'hui — {todayRdvs.length} RDV</div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {todayRdvs.map(r=>{
                  const [rh,rm] = r.heure.split(":").map(Number);
                  const rdvMin = rh*60+rm;
                  const diffMin = rdvMin - nowMin;
                  const isOngoing = diffMin <= 0 && diffMin > -(r.duree||60);
                  const isPast = diffMin <= -(r.duree||60);
                  const isSoon = diffMin > 0 && diffMin <= 30;
                  const color = isPast?"#666":isOngoing?"#22C55E":isSoon?"#EF4444":"#3B82F6";
                  const statusLabel = isPast?"Terminé":isOngoing?"En cours":isSoon?`Dans ${diffMin} min`:("Dans " + (diffMin >= 60 ? (Math.floor(diffMin/60)+"h"+(diffMin%60>0?diffMin%60+"m":"")) : (diffMin+" min")));
                  return (
                    <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, background:isOngoing?"#22C55E11":isSoon?"#EF444411":T.surface2, border:`1px solid ${color}44`, borderRadius:8, padding:"7px 12px" }}>
                      <span style={{ fontSize:16 }}>📅</span>
                      <div style={{ flex:1 }}>
                        <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{r.client}</div>
                        <div style={{ color:T.textMuted, fontSize:10 }}>{r.heure} · {r.type} · {r.salle||"—"}</div>
                      </div>
                      <div style={{ background:`${color}22`, border:`1px solid ${color}44`, borderRadius:6, padding:"3px 10px" }}>
                        <span style={{ color, fontWeight:800, fontSize:11 }}>{statusLabel}</span>
                      </div>
                      {r.rappel && r.rappel!=="0" && !isPast && (
                        <span title={`Rappel ${r.rappel} min avant`} style={{ background:"#C41E3A22", borderRadius:4, padding:"2px 6px", fontSize:9, color:"#C41E3A" }}>⏰</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        <h3 style={{ color: "#C41E3A", margin: 0, fontSize: 14, fontWeight: 800 }}>📅 Agenda & Rendez-vous</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            {[["calendar","📅 Calendrier"],["list","📋 Liste"]].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "6px 12px", background: view===v ? "#C41E3A" : "transparent", color: view===v ? "#fff" : T.textMuted, border: "none", cursor: "pointer", fontSize: 11, fontWeight: view===v ? 700 : 400 }}>{l}</button>
            ))}
          </div>
          <Btn variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>+ Programmer un RDV</Btn>
          <Btn variant="secondary" size="sm" onClick={() => setShowEventForm(!showEventForm)}>📢 Programmer un événement</Btn>
        </div>
      </div>

      {/* RDV Form */}
      {showForm && (
        <div style={{ background: T.surface2, border: `1px solid #C41E3A44`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <h4 style={{ color: "#C41E3A", margin: "0 0 12px", fontSize: 13 }}>📅 Nouveau Rendez-vous</h4>
          {/* Collab type switch */}
          <div style={{ display:"flex", gap:6, marginBottom:10 }}>
            {[["interne","👤 Collaborateur interne"],["externe","🌐 Partenaire externe"]].map(([ct,label])=>(
              <button key={ct} onClick={()=>setForm(f=>({...f,collabType:ct,partnerId:"",client:""}))} style={{ flex:1, background:form.collabType===ct?"#C41E3A":"transparent", color:form.collabType===ct?"#fff":T.textMuted, border:`1px solid ${form.collabType===ct?"#C41E3A":T.border}`, borderRadius:7, padding:"7px", cursor:"pointer", fontWeight:700, fontSize:11 }}>{label}</button>
            ))}
          </div>
          {form.collabType==="interne" ? (
            <div style={{ marginBottom:10 }}>
              <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Assigner à *</label>
              <select value={form.assignedTo} onChange={e=>setForm(f=>({...f,assignedTo:e.target.value,client:users.find(u=>u.id===e.target.value)?.name||f.client}))} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                {users.filter(u=>_activeUser(u)&&u.level>=1).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role} (Niv.{u.level})</option>)}
              </select>
            </div>
          ) : (
            <div style={{ marginBottom:10 }}>
              <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>Partenaire / Collaborateur externe *</label>
              <select value={form.partnerId} onChange={e=>{const p=partners.find(x=>x.id===e.target.value);setForm(f=>({...f,partnerId:e.target.value,client:p?p.nom:f.client}));}} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontSize:12 }}>
                <option value="">— Saisir manuellement —</option>
                {partners.map(p=><option key={p.id} value={p.id}>{p.nom} ({p.type})</option>)}
              </select>
              {form.partnerId && <div style={{color:"#F59E0B",fontSize:10,marginTop:4}}>📌 Un rappel vous sera envoyé pour contacter ce partenaire externe.</div>}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <InputField label="Objet / Intitulé *" value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} T={T} />
            <InputField label="Date *" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} T={T} />
            <InputField label="Heure *" type="time" value={form.heure} onChange={e => setForm(f => ({ ...f, heure: e.target.value }))} T={T} />
            <InputField label="Durée (min)" type="number" value={form.duree} onChange={e => setForm(f => ({ ...f, duree: Number(e.target.value) }))} T={T} />
            <InputField label="Type de RDV" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} T={T} />
            <InputField label="Salle" value={form.salle} onChange={e => setForm(f => ({ ...f, salle: e.target.value }))} T={T} />
          </div>
          <InputField label="Notes" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} T={T} />
          {/* Rappel / Alarme */}
          <div style={{ marginTop:8, background:"#C41E3A08", border:"1px solid #C41E3A33", borderRadius:8, padding:"10px 12px" }}>
            <div style={{ color:"#C41E3A", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>⏰ Rappel automatique</div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {[["0","Aucun"],["5","5 min"],["10","10 min"],["15","15 min"],["30","30 min"],["60","1 h"],["120","2 h"]].map(([v,l])=>(
                <button key={v} onClick={()=>setForm(f=>({...f,rappel:v}))} style={{ background:form.rappel===v?"#C41E3A":"transparent", color:form.rappel===v?"#fff":T.textMuted, border:`1px solid ${form.rappel===v?"#C41E3A":T.border}`, borderRadius:20, padding:"4px 10px", cursor:"pointer", fontSize:10, fontWeight:form.rappel===v?800:400 }}>{l}</button>
              ))}
            </div>
            {form.rappel !== "0" && form.date && form.heure && (
              <div style={{ marginTop:6, fontSize:10, color:"#C41E3A" }}>
                ⏰ Alarme prévue à {(()=>{ const d=new Date(`${form.date}T${form.heure}:00`); d.setMinutes(d.getMinutes()-parseInt(form.rappel, 10)); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; })()} — {form.rappel} min avant le RDV
              </div>
            )}
          </div>
          {/* Link to dossier */}
          <div style={{ marginTop:8 }}>
            <label style={{ color:T.textMuted, fontSize:11, display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>📁 Dossier associé (optionnel)</label>
            <select value={form.dossierId||""} onChange={e=>setForm(f=>({...f,dossierId:e.target.value}))} style={{ width:"100%", background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:"7px 12px", color:T.text, fontSize:11 }}>
              <option value="">— Aucun —</option>
              {dossiers.map(d=><option key={d.id} value={d.id}>{d.ref} — {d.client}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop:12 }}>
            <Btn variant="primary" size="sm" onClick={handleSaveRdv}>📤 Enregistrer & Notifier</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowForm(false)}>Annuler</Btn>
          </div>
        </div>
      )}

      {/* Event Form */}
      {showEventForm && (
        <div style={{ background: T.surface2, border: `1px solid #A855F744`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <h4 style={{ color: "#A855F7", margin: "0 0 12px", fontSize: 13 }}>📢 Programmer un événement</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <InputField label="Titre de l'événement *" value={eventForm.titre} onChange={e => setEventForm(f=>({...f,titre:e.target.value}))} T={T} />
            <InputField label="Date *" type="date" value={eventForm.date} onChange={e => setEventForm(f=>({...f,date:e.target.value}))} T={T} />
            <InputField label="Heure" type="time" value={eventForm.heure} onChange={e => setEventForm(f=>({...f,heure:e.target.value}))} T={T} />
            <div>
              <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Visibilité</label>
              <select value={eventForm.type} onChange={e => setEventForm(f=>({...f,type:e.target.value}))} style={{ width: "100%", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 12 }}>
                <option value="public">🌐 Public — Tous les collaborateurs</option>
                <option value="prive">🔒 Privé — Sélectionner les destinataires</option>
              </select>
            </div>
          </div>
          <InputField label="Description (facultatif)" value={eventForm.description} onChange={e => setEventForm(f=>({...f,description:e.target.value}))} T={T} />

          {eventForm.type === "prive" && (
            <div style={{ marginTop:10, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <label style={{ color:"#A855F7", fontSize:11, display:"block", marginBottom:6, fontWeight:700 }}>👥 Collaborateurs internes (notifiés)</label>
                <div style={{ background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:8, maxHeight:150, overflowY:"auto" }}>
                  {users.filter(u=>_activeUser(u)&&u.id!==localUser.id&&u.level>=1).map(u=>(
                    <label key={u.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 6px", cursor:"pointer", borderRadius:5 }}>
                      <input type="checkbox" checked={eventForm.destinatairesInternes.includes(u.id)}
                        onChange={e=>setEventForm(f=>({...f,destinatairesInternes:e.target.checked?[...f.destinatairesInternes,u.id]:f.destinatairesInternes.filter(x=>x!==u.id)}))}
                        style={{width:14,height:14,cursor:"pointer"}} />
                      <div>
                        <div style={{color:T.text,fontSize:11,fontWeight:600}}>{u.name}</div>
                        <div style={{color:T.textDim,fontSize:9}}>{u.role}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div style={{color:T.textDim,fontSize:9,marginTop:3}}>Ils recevront une notification dans le SI</div>
              </div>
              <div>
                <label style={{ color:"#22C55E", fontSize:11, display:"block", marginBottom:6, fontWeight:700 }}>🌐 Partenaires externes (rappel à vous)</label>
                <div style={{ background:T.surface3, border:`1px solid ${T.border}`, borderRadius:8, padding:8, maxHeight:150, overflowY:"auto" }}>
                  {partners.map(p=>(
                    <label key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 6px", cursor:"pointer", borderRadius:5 }}>
                      <input type="checkbox" checked={eventForm.destinatairesExternes.includes(p.id)}
                        onChange={e=>setEventForm(f=>({...f,destinatairesExternes:e.target.checked?[...f.destinatairesExternes,p.id]:f.destinatairesExternes.filter(x=>x!==p.id)}))}
                        style={{width:14,height:14,cursor:"pointer"}} />
                      <div>
                        <div style={{color:T.text,fontSize:11,fontWeight:600}}>{p.nom}</div>
                        <div style={{color:T.textDim,fontSize:9}}>{p.type} · {p.tel||p.email||""}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div style={{color:"#F59E0B",fontSize:9,marginTop:3}}>📌 Un rappel vous sera envoyé de les contacter</div>
              </div>
            </div>
          )}

          {eventForm.type === "prive" && (eventForm.destinatairesInternes.length>0||eventForm.destinatairesExternes.length>0) && (
            <div style={{ marginTop:8, background:"#A855F715", border:"1px solid #A855F733", borderRadius:7, padding:"7px 10px", fontSize:11, color:T.text }}>
              📨 {eventForm.destinatairesInternes.length} notif(s) interne(s) · {eventForm.destinatairesExternes.length} rappel(s) externe(s)
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn variant="primary" size="sm" onClick={handleSaveEvent}>📢 Créer & Notifier</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowEventForm(false)}>Annuler</Btn>
          </div>
        </div>
      )}

      {/* ── CALENDAR VIEW ── */}
      {view === "calendar" && (
        <div style={{ background: T.surface2, borderRadius: 12, border: `1px solid ${T.border}`, padding: 16, marginBottom: 14 }}>
          {/* Header navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={() => { let m = calMonth - 1; let y = calYear; if (m < 0) { m = 11; y--; } setCalMonth(m); setCalYear(y); }} style={{ background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: T.text, fontSize: 14 }}>‹</button>
            <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>{monthNames[calMonth]} {calYear}</div>
            <button onClick={() => { let m = calMonth + 1; let y = calYear; if (m > 11) { m = 0; y++; } setCalMonth(m); setCalYear(y); }} style={{ background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: T.text, fontSize: 14 }}>›</button>
          </div>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {dayNames.map(d => <div key={d} style={{ textAlign: "center", color: T.textMuted, fontSize: 10, fontWeight: 700, padding: "4px 0" }}>{d}</div>)}
          </div>
          {/* Calendar grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {Array.from({ length: getFirstDay(calYear, calMonth) }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: getDaysInMonth(calYear, calMonth) }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const dayRdvs = getRdvsForDate(dateStr);
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              return (
                <div key={day} onClick={() => { setSelectedDate(isSelected ? null : dateStr); setViewDateEvents(dateStr); }} title={`Voir / créer un événement le ${dateStr}`} style={{ minHeight: 52, background: isToday ? "#C41E3A22" : isSelected ? "#3B82F622" : T.surface3, border: `1px solid ${isToday ? "#C41E3A" : isSelected ? "#3B82F6" : T.border}`, borderRadius: 6, padding: "4px 5px", cursor: "pointer", position: "relative" }}>
                  <div style={{ color: isToday ? "#C41E3A" : T.text, fontWeight: isToday ? 800 : 400, fontSize: 11, marginBottom: 2 }}>{day}</div>
                  {dayRdvs.slice(0,3).map(r => (
                    <div key={r.id} style={{
                      background: r._isRelance ? "#F9731633" : r.isEvent ? "#A855F733" : "#C41E3A33",
                      borderRadius: 3, padding: "1px 3px", fontSize: 8,
                      color: r._isRelance ? "#F97316" : r.isEvent ? "#A855F7" : "#C41E3A",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 1,
                      borderLeft: r._isRelance ? "2px solid #F97316" : "none",
                    }}>
                      {r._isRelance ? "🔔 " : ""}{r.heure} {(r._isRelance ? r.relanceObjet : r.client).slice(0,11)}{((r._isRelance ? r.relanceObjet : r.client).length > 11) ? "…" : ""}
                    </div>
                  ))}
                  {dayRdvs.length > 3 && <div style={{ fontSize: 8, color: T.textMuted }}>+{dayRdvs.length-3}</div>}
                </div>
              );
            })}
          </div>

          {/* Selected date details */}
          {selectedDate && (() => {
            const dayEvts = getRdvsForDate(selectedDate);
            return (
              <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                  📅 {selectedDate} — {dayEvts.length} événement(s)
                  {dayEvts.filter(e=>e._isRelance).length>0 && (
                    <span style={{marginLeft:8,background:"#F9731622",color:"#F97316",border:"1px solid #F9731644",borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:700}}>
                      🔔 {dayEvts.filter(e=>e._isRelance).length} relance(s) CRM
                    </span>
                  )}
                </div>
                {dayEvts.length === 0 ? <div style={{ color: T.textMuted, fontSize: 12 }}>Aucun événement ce jour</div> : dayEvts.map(r => {
                  const assignee = getUser(r.assignedTo, users);
                  if (r._isRelance) {
                    return (
                      <div key={r.id} style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 10px", background:"#F9731610", borderRadius:8, border:"1px solid #F9731633", marginBottom:4 }}>
                        <div style={{ background:"#F9731622", border:"1px solid #F9731644", borderRadius:6, padding:"4px 8px", textAlign:"center", flexShrink:0 }}>
                          <div style={{ color:"#F97316", fontWeight:900, fontSize:12 }}>🔔</div>
                          <div style={{ color:"#F97316", fontSize:8, fontWeight:700 }}>O01</div>
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ color:T.text, fontWeight:700, fontSize:12 }}>{r.relanceObjet}</div>
                          <div style={{ color:T.textMuted, fontSize:10 }}>{r.client} · {r.type} · {r.relancePriorite}</div>
                          <div style={{ color:T.textDim, fontSize:9 }}>Assigné à : {assignee.name || r.assignedTo}</div>
                        </div>
                        <span style={{background:"#F9731622",color:"#F97316",border:"1px solid #F9731644",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>Relance CRM</span>
                      </div>
                    );
                  }
                  return (
                    <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", background: T.surface3, borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 4 }}>
                      <div style={{ background: r.isEvent ? "#A855F722" : "#C41E3A22", border: `1px solid ${r.isEvent ? "#A855F7" : "#C41E3A"}44`, borderRadius: 6, padding: "4px 8px", textAlign: "center", flexShrink: 0 }}>
                        <div style={{ color: r.isEvent ? "#A855F7" : "#C41E3A", fontWeight: 900, fontSize: 12 }}>{r.heure}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: 12 }}>{r.client}</div>
                        <div style={{ color: T.textMuted, fontSize: 10 }}>{r.type} {r.salle ? `• ${r.salle}` : ""} {r.duree ? `• ${r.duree} min` : ""}</div>
                        <div style={{ color: T.textDim, fontSize: 9 }}>@{assignee.alias || assignee.name}</div>
                      </div>
                      <Badge label={r.status === "CONFIRME" ? "✅ Confirmé" : "⏳ En attente"} color={r.status === "CONFIRME" ? "#22C55E" : "#F59E0B"} small />
                      <Btn variant="ghost" size="sm" onClick={() => setEditingRdv(r)}>✏️</Btn>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === "list" && (
        <>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <input value={rdvSearch} onChange={e=>setRdvSearch(e.target.value)} placeholder="🔍 Client, type…" style={{flex:"1 1 140px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}/>
            <select value={rdvTypeFilter} onChange={e=>setRdvTypeFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}>
              <option value="ALL">📋 Tous types</option>
              {[...new Set(myRdvs.map(r=>r.type).filter(Boolean))].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select value={rdvAssigneeFilter} onChange={e=>setRdvAssigneeFilter(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",color:T.text,fontSize:11}}>
              <option value="ALL">👤 Tous assignés</option>
              {users.filter(u=>_activeUser(u)&&myRdvs.some(r=>r.assignedTo===u.id)).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <h4 style={{ color: T.text, margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>📌 RDV à venir ({upcoming.length})</h4>
            {upcoming.length === 0 ? <div style={{ color: T.textMuted, textAlign: "center", padding: 20, fontSize: 12 }}>Aucun RDV à venir</div> :
            upcoming.map(r => {
              const assignee = getUser(r.assignedTo, users);
              const canModify = localUser.level>=4 || r.assignedTo===localUser.id;
              return (
                <div key={r.id} style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ background: "#C41E3A22", border: "1px solid #C41E3A44", borderRadius: 8, padding: "8px 12px", textAlign: "center", flexShrink: 0, minWidth: 52 }}>
                    <div style={{ color: "#C41E3A", fontWeight: 900, fontSize: 15 }}>{r.heure}</div>
                    <div style={{ color: T.textMuted, fontSize: 9 }}>{formatDate(r.date)}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>{r.client}</div>
                    <div style={{ color: T.textMuted, fontSize: 11 }}>{r.type} • {r.salle} • {r.duree} min</div>
                    <div style={{ color: T.textDim, fontSize: 10 }}>Responsable : @{assignee.alias || assignee.name}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexDirection: "column" }}>
                    <Badge label={r.status === "CONFIRME" ? "✅ Confirmé" : "⏳ En attente"} color={r.status === "CONFIRME" ? "#22C55E" : "#F59E0B"} small />
                    <QRDisplay value={r.id} size={36} />
                    {canModify && <div style={{display:"flex",gap:4,marginTop:2}}>
                      <button onClick={()=>setEditingRdvModal({...r})} title="Modifier" style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10}}>✏️</button>
                      <button onClick={()=>handleDeleteRdv(r.id)} title="Supprimer" style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10}}>🗑️</button>
                      {r.status !== "ANNULE" && <button onClick={async () => {const m = await gcPrompt("Motif d'annulation :");if(m)handleCancelRdv(r.id,m);}} title="Annuler" style={{background:"#F59E0B15",border:"1px solid #F59E0B33",color:"#F59E0B",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10}}>🚫</button>}
                    </div>}
                  </div>
                </div>
              );
            })}
          </div>

          {past.length > 0 && (
            <div>
              <h4 style={{ color: T.textMuted, margin: "0 0 10px", fontSize: 12, fontWeight: 700 }}>📂 RDV passés ({past.length})</h4>
              {past.map(r => (
                <div key={r.id} style={{ background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`, padding: "8px 12px", marginBottom: 4, display: "flex", gap: 10, alignItems: "center", opacity: 0.7 }}>
                  <div style={{ background: T.surface3, borderRadius: 6, padding: "4px 8px", textAlign: "center", flexShrink: 0 }}>
                    <div style={{ color: T.textMuted, fontWeight: 700, fontSize: 12 }}>{r.heure}</div>
                    <div style={{ color: T.textDim, fontSize: 9 }}>{formatDate(r.date)}</div>
                  </div>
                  <div style={{ flex: 1 }}><div style={{ color: T.textMuted, fontSize: 12 }}>{r.client}</div><div style={{ color: T.textDim, fontSize: 10 }}>{r.type}</div></div>
                  <Badge label="Passé" color={T.textDim} small />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Edit RDV modal */}
      {editingRdv && (
        <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "28px 32px", width: 480, maxWidth: "95vw", boxShadow: "0 24px 80px #0009" }}>
            <h3 style={{ color: "#C41E3A", margin: "0 0 16px", fontWeight: 800 }}>📅 {editingRdv.client}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[["Date", editingRdv.date],["Heure", editingRdv.heure],["Type", editingRdv.type],["Salle", editingRdv.salle || "—"],["Durée", `${editingRdv.duree || 60} min`],["Statut", editingRdv.status]].map(([l,v]) => (
                <div key={l} style={{ background: T.surface2, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{l}</div>
                  <div style={{ color: T.text, fontSize: 12, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
            {localUser.level >= 4 && (
              <div style={{ background: "#F59E0B22", border: "1px solid #F59E0B44", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: T.text }}>
                ⚠️ Toute modification sera notifiée aux parties concernées avec un commentaire explicatif.
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {localUser.level >= 4 && <Btn variant="primary" size="sm">✏️ Modifier</Btn>}
              <Btn variant="success" size="sm">✅ Confirmer</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setEditingRdv(null)}>Fermer</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


