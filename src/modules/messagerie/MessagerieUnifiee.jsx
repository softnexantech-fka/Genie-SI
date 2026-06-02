import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// MessagerieUnifiee.jsx — SI Génie Consultant v129
import { _lsGet, _lsSet, _noop, gcPushNotif, playSound, gcCodif, gcCodifMSG, gcFileSave, _activeUser, dsSave, dsOnSync, dsGet } from '../../core/index.js';
import { useSyncedState } from '../../hooks/useSyncedState.js';
import { INITIAL_COMMITTEES } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner, gcOpenPrintWindow } from '../../components/UI.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

export function MessagerieUnifieeApp({ T, currentUser, users=[], setNotifications=_noop, partners=[], rdvs=[], setRdvs=_noop, taches=[], setTaches=_noop, onUnreadChange=null, dossiers=[], setDossiers=_noop}){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'messagerie',
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
      } catch(e) { console.error('[upload messagerie]', file.name, e.message); }
    }
    return results;
  };

  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const YEAR = new Date().getFullYear();
  const [view, setView] = useState("inbox"); // inbox | sent | compose | templates | group | courriers | taches | rdvs
  const [messages, _setMessages] = useState(()=>{try{const s=_lsGet("gc-messages-global");return s?JSON.parse(s):[];}catch (_) {return [];}});
  const setMessages = useCallback((v)=>{_setMessages(prev=>{const next=typeof v==="function"?v(prev):v;try{_lsSet("gc-messages-global",JSON.stringify(next.slice(0,500)));}catch (_) {}
    // FIX vMSG-SYNC — Persister sur le serveur à chaque modification
    dsSave('gc-messages-global', next.slice(0,500)).catch(err => gcToast.syncError('', err));
    return next;});},[]);

  // FIX vMSG-SYNC — Charger les messages depuis le serveur au montage
  useEffect(() => {
    dsGet('gc-messages-global', null).then(val => {
      if (val && Array.isArray(val) && val.length > 0) {
        _setMessages(val.slice(0, 500));
        try { _lsSet("gc-messages-global", JSON.stringify(val.slice(0, 500))); } catch (_) {}
      }
    }).catch(() => {});
    // Écouter les changements en temps réel depuis les autres postes
    const unsub = dsOnSync((event) => {
      if (event.key !== 'gc-messages-global') return;
      dsGet('gc-messages-global', null).then(val => {
        if (val && Array.isArray(val)) {
          _setMessages(val.slice(0, 500));
          try { _lsSet("gc-messages-global", JSON.stringify(val.slice(0, 500))); } catch (_) {}
        }
      }).catch(() => {});
    });
    return unsub;
   
  }, []);
  const [courriers, setCourriers] = useState(()=>{try{return JSON.parse(_lsGet("gc-courrier-docs")||"[]");}catch (_) {return [];}});
  const [selected, setSelected] = useState(null);
  const [compose, setCompose] = useState({to:[],cc:[],subject:"",body:"",attachments:[],type:"internal"});
  const [showEmojis, setShowEmojis] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [courForm, setCourForm] = useState({from:currentUser?.email||"",destinataire:"",cc:"",objet:"",ref:"",body:"",template:"",type:"external"});
  const [showCourTemplates, setShowCourTemplates] = useState(false);
  const [groupMsg, setGroupMsg] = useState("");
  const [groupTarget, setGroupTarget] = useState("ALL");
  const [showGroupAttach, setShowGroupAttach] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  // Brouillons
  const [drafts, setDrafts] = useSyncedState("gc-msg-drafts", []);
  const saveDrafts = (d) => setDrafts(d.slice(0, 50));
  const saveDraft = () => {
    if(!compose.subject.trim()&&!compose.body.trim()) return;
    const draft = {...compose, id:"DRF-"+Date.now(), savedAt:new Date().toISOString()};
    saveDrafts([draft, ...drafts.slice(0,49)]);
    setCompose({to:[],cc:[],subject:"",body:"",attachments:[],type:"internal"});
    setView("drafts");
    playSound("notif");
  };
  const deleteDraft = (id) => saveDrafts(drafts.filter(d=>d.id!==id));
  const openDraft = (draft) => { setCompose(draft); setView("compose"); deleteDraft(draft.id); };
  // Modèles personnalisés (CRUD)
  const [customTemplates, setCustomTemplates] = useSyncedState("gc-msg-templates", []);
  const saveCustomTemplates = (t) => setCustomTemplates(t);
  const [tplModal, setTplModal] = useState(null); // null | {mode:"new"|"edit", data:{}}
  const [tplForm, setTplForm] = useState({id:"",icon:"📝",label:"",body:""});
  // États pièces jointes
  const [composeAttachments, setComposeAttachments] = useState([]);
  const [courAttachments, setCourAttachments] = useState([]);
  const [showAttachDossier, setShowAttachDossier] = useState(false);
  const [showCourAttachDossier, setShowCourAttachDossier] = useState(false);
  // FIX vMSG-EDIT — Édition de message (15min max, sauf courriers)
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editBody, setEditBody] = useState("");
  // États modales RDV et Tâche
  const [rdvForm, setRdvForm] = useState({client:"",date:"",heure:"",duree:60,lieu:"",notes:"",type:"RDV_CLIENT",assignedTo:""});
  const [taskForm, setTaskForm] = useState({titre:"",description:"",assignedTo:"",deadline:"",priority:"NORMALE"});

  const lvl = currentUser?.level || 1;
  const isAdmin = currentUser?.isAdmin || lvl >= 6; // FIX v126 — inclure niveau 6 (Direction SI)
  const inbox = messages.filter(m=>m&&(m.to?.includes(currentUser?.id)||m.to?.includes("ALL"))&&m.from!==currentUser?.id&&m.type!=="group");
  const sent = messages.filter(m=>m.from===currentUser?.id&&m.type!=="group");
  const unreadCount = inbox.filter(m=>!m.read).length;
  const allGroupFeed = messages.filter(m=>m.type==="group");
  const groupFeed = allGroupFeed.filter(m=>m.target===groupTarget).sort((a,b)=>new Date(a.at)-new Date(b.at));
  const groupFeedAll = allGroupFeed.sort((a,b)=>new Date(a.at)-new Date(b.at));
  const [groupLastSeen, setGroupLastSeen] = React.useState(() => {
    try { return parseInt(_lsGet("gc-msg-group-seen-"+currentUser?.id)||"0"); } catch (_) { return 0; }
  });
  const markGroupSeen = () => {
    const now = Date.now();
    setGroupLastSeen(now);
    try { _lsSet("gc-msg-group-seen-"+currentUser?.id, String(now)); } catch (_) {}
  };
  const groupUnreadCount = allGroupFeed.filter(m => m.from !== currentUser?.id && new Date(m.at).getTime() > groupLastSeen).length;

  // FIX v129 — Badges par catégorie : universels vs comités
  const universalTargets = ["ALL","MANAGERS","DIRECTION","ADMIN"];
  const universalUnread = allGroupFeed.filter(m => m.from !== currentUser?.id && new Date(m.at).getTime() > groupLastSeen && universalTargets.includes(m.target)).length;
  const comiteUnread = allGroupFeed.filter(m => m.from !== currentUser?.id && new Date(m.at).getTime() > groupLastSeen && (m.target||"").startsWith("COMITE_")).length;
  const getTargetUnread = (tgt) => allGroupFeed.filter(m => m.from !== currentUser?.id && new Date(m.at).getTime() > groupLastSeen && m.target === tgt).length;
  const courrierUnreadCount = courriers.filter(c => !c?._read).length;
  const globalUnreadCount = unreadCount + groupUnreadCount + courrierUnreadCount;
  React.useEffect(() => {
    if (onUnreadChange) onUnreadChange(globalUnreadCount);
  }, [globalUnreadCount, onUnreadChange]);
  const groupTargetLabel = groupTarget==="ALL"?"🌐 Tous":groupTarget==="MANAGERS"?"👔 Managers":groupTarget==="DIRECTION"?"🏛️ Direction":groupTarget==="ADMIN"?"⚙️ Admins":groupTarget.startsWith("COMITE_")?`🏛️ ${(INITIAL_COMMITTEES||[]).find(c=>c.id===groupTarget.replace("COMITE_",""))?.acronym||groupTarget}`:"📢 Groupe";

  // Fermer le dropdown groupe au clic en dehors
  const groupDropRef = useRef(null);
  useEffect(()=>{
    if(!showGroupDropdown) return;
    const handler = (e)=>{ if(groupDropRef.current && !groupDropRef.current.contains(e.target)) setShowGroupDropdown(false); };
    document.addEventListener("mousedown", handler);
    return ()=>document.removeEventListener("mousedown", handler);
  },[showGroupDropdown]);

  const EMOJI_GROUPS = {
    "Smileys": ["😀","😁","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕"],
    "Gestes": ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄"],
    "Personnes": ["👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","👩‍🦱","👩‍🦰","👩‍🦳","👩‍🦲","👴","👵","🧓","👲","👳","🧕","🤵","👰","🤰","🤱","👼","🎅","🤶","🦸","🦹","🧙","🧝","🧛","🧟","🧞","🧜","🧚","👮","🕵️","💂","👷","🫅","🤴","👸","🤺","🏇","⛷️","🏂","🏋️","🤼","🤸","🤺","🏌️","🏄","🚣","🧘"],
    "Animaux": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦕","🦖","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🦣","🐘","🦛","🦏","🐪","🐫"],
    "Nourriture": ["🍎","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥝","🍅","🥥","🥝","🍆","🥑","🥦","🥬","🥒","🫑","🌶️","🫒","🧄","🧅","🥔","🌽","🍠","🥐","🥖","🍞","🥨","🥯","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫓","🥙","🧆","🌮","🌯","🥗","🥘","🫕","🍜","🍝","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥮","🍢","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","🧃","🥤","🧋","☕","🍵","🧉","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧊","🍾"],
    "Voyage": ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️","🛺","🚲","🛴","🛹","🛼","🚏","🛣️","🛤️","⛽","🚦","🚥","🛑","🚧","⚓","🛟","⛵","🛶","🚤","🛳️","⛴️","🛥️","🚢","✈️","🛩️","🛫","🛬","💺","🚁","🚟","🚠","🚡","🛰️","🚀","🛸","🪂","⛱️","🌋","⛺","🏕️","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛩️","🕌","🕍","⛪","🕋"],
    "Objets": ["💼","📁","📂","🗂️","📋","📊","📈","📉","📝","📄","📃","📑","🗒️","🗓️","📅","📆","🗑️","📌","📍","✂️","🖇️","📏","📐","✒️","🖊️","🖋️","📝","✏️","🔍","🔎","🔒","🔓","🔑","🗝️","🔨","🪓","⛏️","⚒️","🛠️","🗡️","⚔️","🔧","🔩","⚙️","🗜️","⚖️","🦯","🔗","⛓️","🪝","🧲","🪜","📱","💻","⌨️","🖥️","🖨️","🖱️","🖲️","💾","💿","📀","📡","☎️","📞","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⏰","⌚","⏳","🔋","🔌","💡","🔦","🕯️","🪔","💰","💴","💵","💶","💷","💸","💳","🧾"],
    "Symboles": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","✡️","🔯","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📵","🚫","🚳","🚭","🚯","🚱","🚷","📛","🔞","❌","⭕","🛑","⛔","🔰","♻️","✅","✔️","❎","➕","➖","➗","🔱","📛","🔰","⚜️","🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️"],
    "Bureau": ["📊","📈","📉","🗂️","📋","📁","📄","📝","✉️","📬","📭","📮","📯","📢","📣","💬","💭","🗯️","📲","📳","📴","📵","📶","📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🎙️","⌚","📡","🔭","🔬","🩺","🩻","💊","🩹","🩼","🦷","👓","🕶️","🥽","🦺","👔","👕","👖","🧣","🧤","🧥","👗","👘","🥻","🩱","🩲","🩳","👙","👚","👛","👜","👝","🎒","🧳","👒","🎓","🪖","⛑️","👑","💍","💎","🔮","🪬","🧿","🪡","🪢","🪆","🖼️","🛋️","🪑","🚪","🪞","🪟","🛏️","🛁","🪠","🧴","🧹","🧺","🧻","🪣","🧼","🫧","🪥","🧽","🪒","🧯"],
  };

  const allEmojis = Object.values(EMOJI_GROUPS).flat();
  const filteredEmojis = emojiSearch ? allEmojis.filter(e => e.includes(emojiSearch)) : null;

  const COURRIER_TEMPLATES = [
    { id:"lettre_off", label:"📜 Lettre Officielle", icon:"📜", body:`Libreville, le {date}\n\nObjet : {objet}\n\nMonsieur/Madame,\n\nNous avons l'honneur de vous adresser la présente lettre afin de porter à votre connaissance...\n\nNous demeurons à votre disposition pour tout renseignement complémentaire.\n\nVeuillez agréer, Monsieur/Madame, l'expression de nos salutations distinguées.\n\n{signature}` },
    { id:"email_pro", label:"📧 E-mail Professionnel", icon:"📧", body:`Objet : {objet}\n\nBonjour {destinataire},\n\nJe me permets de vous contacter concernant {objet}.\n\nCordialement,\n{signature}` },
    { id:"note_serv", label:"📋 Note de Service", icon:"📋", body:`NOTE DE SERVICE N° {ref}\nDate : {date}\nDe : Direction Générale / {expediteur}\nÀ : {destinataire}\nObjet : {objet}\n\nPar la présente note, il est porté à votre connaissance que...\n\nLa Direction` },
    { id:"mise_dem", label:"⚖️ Mise en Demeure", icon:"⚖️", body:`Libreville, le {date}\n\nOBJET : Mise en demeure\nRéférence : {ref}\n\nMonsieur/Madame,\n\nNous avons l'honneur de vous informer que malgré nos précédentes relances, vous n'avez pas encore honoré vos obligations contractuelles.\n\nPar la présente, nous vous mettons en demeure de régulariser votre situation dans un délai de 15 (quinze) jours à compter de la réception du présent courrier.\n\nÀ défaut, nous serons contraints d'engager toutes procédures légales et judiciaires appropriées.\n\nDans l'attente d'une réponse favorable,\n{signature}` },
    { id:"accomp_contrat", label:"📄 Accompagnement Contrat", icon:"📄", body:`Libreville, le {date}\n\nObjet : Transmission de contrat\nRéf. : {ref}\n\nMonsieur/Madame,\n\nVeuillez trouver ci-joint le contrat relatif à {objet}.\n\nNous vous remercions de bien vouloir en prendre connaissance et de nous retourner un exemplaire signé dans les meilleurs délais.\n\nRestant disponible pour toute question,\n{signature}` },
    { id:"relance", label:"🔁 Relance", icon:"🔁", body:`Libreville, le {date}\n\nOBJET : Relance — {objet}\n\nMonsieur/Madame,\n\nNous nous permettons de revenir vers vous suite à notre précédent courrier du... concernant {objet}, resté à ce jour sans réponse.\n\nNous vous prions de bien vouloir nous faire parvenir votre réponse dans les meilleurs délais.\n\n{signature}` },
    { id:"accusé", label:"✅ Accusé de Réception", icon:"✅", body:`Libreville, le {date}\n\nACCUSÉ DE RÉCEPTION\nRéf. : {ref}\n\nMonsieur/Madame,\n\nNous accusons réception de votre courrier/dossier relatif à {objet} reçu le {date}.\n\nNous vous informons que votre demande est en cours de traitement et vous répondrons dans les meilleurs délais.\n\n{signature}` },
    { id:"convoc", label:"📅 Convocation", icon:"📅", body:`Libreville, le {date}\n\nOBJET : Convocation\n\nMonsieur/Madame,\n\nNous avons l'honneur de vous convier à une réunion qui se tiendra :\n\n• Date : _______________\n• Heure : ______________\n• Lieu : _______________\n• Ordre du jour : {objet}\n\nVotre présence est requise. Merci de confirmer votre participation.\n\n{signature}` },
  ];

  const sendMessage = () => {
    if (!compose.subject.trim()&&!compose.body.trim()) return;
    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    const seqIdx = messages.length % 99;
    const subproc = "S04.02";
    const ref = gcCodifMSG(subproc, seqIdx, year);
    const msg = {id:"MSG-"+Date.now(),ref,from:currentUser?.id,to:compose.to.length>0?compose.to:["ALL"],cc:compose.cc,subject:compose.subject,body:compose.body,at:now,read:false,read_by:{[currentUser?.id]:now},type:"private",codif:ref};
    setMessages(p=>[msg,...p]);
    if(setNotifications) {
      compose.to.forEach(uid=>{ if(uid!==currentUser?.id) setNotifications(p=>[{id:"N"+Date.now()+uid,icon:"✉️",message:`✉️ Message de ${currentUser?.name}: ${compose.subject}`,at:now,read:false,module:"messagerie",targetUsers:[uid]},...p]); });
    }
    // FIX v92 — Pousser la notif dans le LS de chaque destinataire (cross-user)
    compose.to.forEach(uid => {
      if (uid !== currentUser?.id && uid !== "ALL") {
        gcPushNotif(uid, {
          id: "N"+Date.now()+uid, icon: "✉️",
          message: `✉️ Nouveau message de ${currentUser?.name} : ${compose.subject}`,
          at: now, read: false, module: "messagerie",
        });
      }
    });
    setCompose({to:[],cc:[],subject:"",body:"",attachments:[],type:"internal"});
    setView("inbox");
    playSound("success");
  };

  const sendCourrier = async () => {
    if (!courForm.body.trim()) return;
    // Validation email : destinataire doit être un email valide
    // eslint-disable-next-line no-useless-escape
    const isValidEmail = (v) => /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(v);
    if (courForm.destinataire && !isValidEmail(courForm.destinataire) && !courForm.destinataire.includes(",")) {
      if (!await gcConfirm("Le destinataire ne semble pas être un email valide. Envoyer quand même ?")) return;
    }
    const now = new Date().toISOString();
    const ref = courForm.ref || gcCodif("MSG","O01.03","v1.0",YEAR, courriers.length % 99);
    const doc = {id:"CRR-"+Date.now(),ref,destinataire:courForm.destinataire,objet:courForm.objet,body:courForm.body,template:courForm.template,createdAt:now,createdBy:currentUser?.name,status:"ENVOYE",type:"courrier_officiel"};
    const updated = [doc,...courriers];
    setCourriers(updated);
    try{_lsSet("gc-courrier-docs",JSON.stringify(updated.slice(0,100)));}catch (_) {}
    if(setNotifications) setNotifications(p=>[{id:"N"+Date.now(),icon:"📮",message:`Courrier envoyé: ${courForm.objet} — Réf: ${ref}`,at:now,read:false},...p]);
    setCourForm({destinataire:"",objet:"",ref:"",body:"",template:"",type:"external"});
    setView("courriers");
    playSound("success");
  };

  const markRead = (msg) => {
    const now_r = new Date().toISOString();
    setMessages(p=>p.map(m=>m.id===msg.id?{...m,read:true,read_by:{...(m.read_by||{}),[currentUser?.id]:now_r}}:m));
    setSelected({...msg, read:true, read_by:{...(msg.read_by||{}),[currentUser?.id]:now_r}});
  };

  const insertEmoji = (emoji) => {
    setCompose(c=>({...c,body:c.body+emoji}));
    setShowEmojis(false);
  };

  const sendGroupMsg = () => {
    if(!groupMsg.trim()) return;
    const now = new Date().toISOString();
    let targetLabel = groupTarget;
    if(groupTarget.startsWith("COMITE_")){
      const comId = groupTarget.replace("COMITE_","");
      const com = (INITIAL_COMMITTEES||[]).find(c=>c.id===comId);
      targetLabel = com ? `${com.icon} ${com.acronym}` : comId;
    } else if(groupTarget==="ALL") targetLabel="🌐 Tous les collaborateurs";
    else if(groupTarget==="MANAGERS") targetLabel="👔 Managers";
    else if(groupTarget==="DIRECTION") targetLabel="🏛️ Direction";
    else if(groupTarget==="ADMIN") targetLabel="⚙️ Superviseurs SI";
    const msg = {id:"GRP-"+Date.now(),from:currentUser?.id,fromName:currentUser?.name,
      to:[groupTarget],subject:"[MESSAGE GROUPE]",body:groupMsg,
      at:now,read:true,type:"group",target:groupTarget,targetLabel};
    setMessages(p=>[msg,...p]);
    if(setNotifications) setNotifications(p=>[{id:"N"+Date.now(),icon:"📢",
      message:`📢 [${targetLabel}] ${currentUser?.name}: ${groupMsg.slice(0,60)}`,
      at:now,read:false},...p]);
    // FIX v92 — Pousser via gcPushNotif pour chaque membre du groupe ciblé
    const targets = (users||[]).filter(u => {
      if (u.id === currentUser?.id) return false;
      if (groupTarget === "ALL") return true;
      if (groupTarget === "MANAGERS") return u.level >= 4;
      if (groupTarget === "DIRECTION") return u.level >= 5;
      if (groupTarget === "ADMIN") return u.isAdmin || u.level >= 6;
      if (groupTarget.startsWith("COMITE_")) {
        const comId = groupTarget.replace("COMITE_","");
        const com = (INITIAL_COMMITTEES||[]).find(c=>c.id===comId);
        return com ? (com.members||[]).includes(u.id) : false;
      }
      return false;
    });
    targets.forEach(u => gcPushNotif(u.id, {
      id: "N"+Date.now()+u.id, icon: "📢",
      message: `📢 [${targetLabel}] Message de ${currentUser?.name} : ${groupMsg.slice(0,80)}`,
      at: now, read: false, module: "messagerie",
    }));
    setGroupMsg("");
    playSound("message");
  };

  const applyTemplate = (tpl) => {
    const date = new Date().toLocaleDateString("fr-FR");
    const sig = `${currentUser?.name}\n${currentUser?.role||"Cabinet Génie Consultant"}\nLibreville, Gabon`;
    const body = tpl.body.replace("{date}",date).replace("{signature}",sig).replace("{expediteur}",currentUser?.name||"");
    setCourForm(f=>({...f,body,template:tpl.id}));
    setShowCourTemplates(false);
  };

  // FIX vMSG-EDIT — Un message peut être modifié pendant 15 min après envoi
  // Tous types sauf courriers (courriers = type "courrier_officiel", non dans messages[])
  const canEditMessage = (msg) => {
    if (!msg || msg.from !== currentUser?.id) return false;
    const elapsed = Date.now() - new Date(msg.at).getTime();
    return elapsed <= 15 * 60 * 1000; // 15 minutes
  };
  const saveMessageEdit = (msgId) => {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    setMessages(prev => prev.map(m => m.id === msgId
      ? { ...m, body: trimmed, editedAt: new Date().toISOString() }
      : m
    ));
    setEditingMsgId(null);
    setEditBody("");
    playSound("success");
  };

  const NAV = [
    {id:"compose",  icon:"✏️",  label:"Nouveau",         accent:true},
    {id:"inbox",    icon:"📥",  label:"Réception",       count:unreadCount},
    {id:"sent",     icon:"📤",  label:"Envoyés"},
    {id:"drafts",   icon:"📝",  label:"Brouillons",      count:drafts.length||0},
    {id:"group",    icon:"📢",  label:"Groupe",          count:groupUnreadCount, countIsNew: groupUnreadCount > 0},
    {id:"courriers",icon:"📮",  label:"Courriers",       count:courriers.filter(c=>!c._read).length||0},
    {id:"templates",icon:"📋",  label:"Modèles"},
    {id:"rdv",      icon:"📅",  label:"Programmer RDV"},
    {id:"task",     icon:"✅",   label:"Assigner Tâche"},
  ];

  return (
    <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:0,height:"100%",border:`1px solid ${T.border}`,borderRadius:0,overflow:"hidden"}}>
      {/* ── Sidebar ─────────────────────────────────── */}
      <div style={{background:T.surface2,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>

        {/* Titre — seul élément fixe */}
        <div style={{padding:"10px 10px 6px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{color:"#6366F1",fontWeight:900,fontSize:11,letterSpacing:0.3}}>✉️ Messagerie Unifiée</div>
        </div>

        {/* Tout le reste défile ensemble : NAV + contacts */}
        <div style={{flex:1,overflowY:"auto",padding:"6px",minHeight:0}}>

          {/* NAV */}
          <div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:8}}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>{setView(n.id);setSelected(null);if(n.id==="group")markGroupSeen();}}
                style={{display:"flex",alignItems:"center",gap:7,
                  background:view===n.id?n.accent?"#6366F1":"#6366F118":"transparent",
                  border:view===n.id?"1px solid #6366F144":"1px solid transparent",
                  borderRadius:7,padding:"6px 8px",cursor:"pointer",textAlign:"left",
                  color:view===n.id?(n.accent?"#fff":"#6366F1"):T.text,
                  transition:"all 0.15s",width:"100%",
                }}>
                <span style={{fontSize:12}}>{n.icon}</span>
                <span style={{flex:1,fontSize:10,fontWeight:view===n.id?700:400}}>{n.label}</span>
                {(n.count>0)&&<span style={{
                  background:n.id==="drafts"?"#F59E0B":"#C41E3A",
                  color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700,
                }}>{n.count>99?"99+":n.count}</span>}
              </button>
            ))}
          </div>

          {/* Séparateur */}
          <div style={{borderTop:`1px solid ${T.border}`,margin:"4px 0 8px"}}/>

          {/* ── Collaborateurs internes ── */}
          <div style={{display:"flex",alignItems:"center",gap:5,padding:"2px 4px 5px",color:T.textMuted,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>
            <span>👥</span> Équipe interne
            <span style={{background:T.surface3,borderRadius:8,padding:"0 5px",fontSize:8,color:T.textDim,marginLeft:"auto"}}>
              {(users||[]).filter(u=>u.id!==currentUser?.id&&(u.accountStatus||"ACTIF")==="ACTIF").length}
            </span>
          </div>
          {(users||[]).filter(u=>u.id!==currentUser?.id&&!u.blocked&&(u.accountStatus||"ACTIF")==="ACTIF").map(u=>(
            <div key={u.id}
              onClick={()=>{setCompose(c=>({...c,to:[...new Set([...c.to,u.id])]}));setView("compose");}}
              title={`Écrire à ${u.name}`}
              style={{display:"flex",alignItems:"center",gap:6,padding:"5px 6px",cursor:"pointer",borderRadius:6,color:T.text,fontSize:10,transition:"background 0.12s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.surface3}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{width:24,height:24,borderRadius:"50%",background:u.color||"#6366F1",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:9,fontWeight:700,flexShrink:0,border:"1.5px solid rgba(255,255,255,0.15)"}}>{u.avatar||u.name?.charAt(0)||"?"}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500,fontSize:10}}>{u.name}</div>
                <div style={{color:T.textDim,fontSize:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.role}</div>
              </div>
            </div>
          ))}

          {/* ── Contacts externes ── */}
          {(partners||[]).filter(p=>p.type==="client"||p.type==="partenaire").length > 0 && (<>
            <div style={{borderTop:`1px solid ${T.border}`,margin:"8px 0 6px"}}/>
            <div style={{display:"flex",alignItems:"center",gap:5,padding:"2px 4px 5px",color:T.textMuted,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>
              <span>🤝</span> Contacts externes
              <span style={{background:T.surface3,borderRadius:8,padding:"0 5px",fontSize:8,color:T.textDim,marginLeft:"auto"}}>
                {(partners||[]).filter(p=>p.type==="client"||p.type==="partenaire").length}
              </span>
            </div>
            {(partners||[]).filter(p=>p.type==="client"||p.type==="partenaire").map(p=>(
              <div key={p.id}
                onClick={()=>{setCourForm(f=>({...f,from:currentUser?.email||"",destinataire:p.email||p.nom}));setView("courriers");}}
                style={{display:"flex",alignItems:"center",gap:6,padding:"5px 6px",cursor:"pointer",borderRadius:6,color:T.text,fontSize:10,transition:"background 0.12s"}}
                onMouseEnter={e=>e.currentTarget.style.background=T.surface3}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{width:24,height:24,borderRadius:"50%",background:"#22C55E33",border:"1.5px solid #22C55E55",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>🤝</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500,fontSize:10}}>{p.nom}</div>
                  <div style={{color:T.textDim,fontSize:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.email||p.secteur||"— contact —"}</div>
                </div>
              </div>
            ))}
          </>)}

        </div>
      </div>

      {/* ── Main content — toutes les vues scrollent ici ── */}
      <div style={{background:T.primary,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
        {/* INBOX */}
        {view==="inbox"&&(
          <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
            <div style={{width:260,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0}}>
              <div style={{padding:"10px 12px",borderBottom:`1px solid ${T.border}`,fontWeight:700,color:T.text,fontSize:12,display:"flex",alignItems:"center",gap:8}}>
                📥 Boîte de réception
                {unreadCount>0&&<span style={{background:"#C41E3A",color:"#fff",borderRadius:10,padding:"2px 8px",fontSize:10,fontWeight:800,animation:"gc-badge-ping 1s ease infinite"}}>{unreadCount>99?"99+":unreadCount} nouveau{unreadCount>1?"x":""}</span>}
                {unreadCount===0&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:10,padding:"1px 7px",fontSize:9}}>✓ Tout lu</span>}
              </div>
              {inbox.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:30,fontSize:12}}>Aucun message</div>}
              {inbox.map(m=>(
                <div key={m.id} onClick={()=>markRead(m)} style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}22`,cursor:"pointer",background:selected?.id===m.id?"#6366F115":m.read?"transparent":"#6366F108"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{color:m.read?T.textMuted:"#6366F1",fontWeight:m.read?400:700,fontSize:11}}>{(users||[]).find(u=>u.id===m.from)?.name||m.from||"Système"}</span>
                    <span style={{color:T.textDim,fontSize:9}}>{new Date(m.at).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <div style={{color:T.text,fontSize:11,fontWeight:m.read?400:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.subject}</div>
                  <div style={{color:T.textDim,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.body?.slice(0,50)}</div>
                </div>
              ))}
            </div>
            <div style={{flex:1,padding:16,overflowY:"auto"}}>
              {selected?(
                <div>
                  <div style={{marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
                    <div style={{fontWeight:800,fontSize:15,color:T.text,marginBottom:6}}>{selected.subject}</div>
                    <div style={{display:"flex",gap:16,fontSize:10,color:T.textMuted}}>
                      <span>De : <strong style={{color:T.text}}>{(users||[]).find(u=>u.id===selected.from)?.name||selected.from}</strong></span>
                      <span>Le : {new Date(selected.at).toLocaleString("fr-FR")}</span>
                      {selected.ref&&<span style={{fontFamily:"monospace",color:"#6366F1"}}>Réf: {selected.ref}</span>}
                    </div>
                  </div>
                  <div style={{color:T.text,fontSize:12,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{selected.body}
                    {selected.editedAt && <span style={{color:T.textDim,fontSize:9,display:"block",marginTop:4}}>✏️ Modifié le {new Date(selected.editedAt).toLocaleString("fr-FR")}</span>}
                  </div>
                  <div style={{marginTop:16,display:"flex",gap:8}}>
                    <button onClick={()=>{setCompose({to:[selected.from],cc:[],subject:"Re: "+selected.subject,body:`\n\n--- Message original ---\nDe: ${(users||[]).find(u=>u.id===selected.from)?.name||selected.from}\n${selected.body?.slice(0,100)}...`,attachments:[],type:"internal"});setView("compose");}} style={{background:"#6366F1",border:"none",color:"#fff",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:11}}>↩ Répondre</button>
                    <button onClick={()=>{setMessages(p=>p.filter(m=>m.id!==selected.id));setSelected(null);}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11}}>🗑️ Supprimer</button>
                  </div>
                </div>
              ):(
                <div style={{color:T.textDim,textAlign:"center",paddingTop:60,fontSize:13}}>
                  <div style={{fontSize:40,marginBottom:12}}>📬</div>
                  Sélectionnez un message
                </div>
              )}
            </div>
          </div>
        )}
        {/* SENT */}
        {view==="sent"&&(
          <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
            <div style={{width:260,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0}}>
              <div style={{padding:"10px 12px",borderBottom:`1px solid ${T.border}`,fontWeight:700,color:T.text,fontSize:12}}>📤 Messages envoyés</div>
              {sent.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:30}}>Aucun message envoyé</div>}
              {sent.map(m=>(
                <div key={m.id} onClick={()=>setSelected(m)} style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}22`,cursor:"pointer",background:selected?.id===m.id?"#6366F115":"transparent"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{color:T.textMuted,fontSize:11}}>À : {m.to?.includes("ALL")?"Tous":(users||[]).find(u=>u.id===m.to?.[0])?.name||m.to?.join(", ")}</span>
                    <span style={{color:T.textDim,fontSize:9}}>{new Date(m.at).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <div style={{color:T.text,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.subject}</div>
                </div>
              ))}
            </div>
            <div style={{flex:1,padding:16,overflowY:"auto"}}>
              {selected?(
                <div>
                  <div style={{marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
                    <div style={{fontWeight:800,fontSize:15,color:T.text,marginBottom:6}}>{selected.subject}</div>
                    <div style={{display:"flex",gap:16,fontSize:10,color:T.textMuted,flexWrap:"wrap"}}>
                      <span>À : <strong style={{color:T.text}}>{selected.to?.includes("ALL")?"Tous":(users||[]).find(u=>u.id===selected.to?.[0])?.name||selected.to?.join(", ")}</strong></span>
                      <span>Le : {new Date(selected.at).toLocaleString("fr-FR")}</span>
                    </div>
                  </div>
                  <div style={{color:T.text,fontSize:12,lineHeight:1.8,whiteSpace:"pre-wrap"}}>
                    {editingMsgId === selected.id ? (
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        <textarea value={editBody} onChange={e=>setEditBody(e.target.value)} rows={6}
                          style={{width:"100%",background:T.surface3,border:`1.5px solid #6366F1`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>saveMessageEdit(selected.id)} style={{background:"#6366F1",border:"none",color:"#fff",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>✅ Enregistrer</button>
                          <button onClick={()=>{setEditingMsgId(null);setEditBody("");}} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontSize:11}}>Annuler</button>
                        </div>
                      </div>
                    ) : selected.body}
                    {selected.editedAt && <span style={{color:T.textDim,fontSize:9,display:"block",marginTop:4}}>✏️ Modifié le {new Date(selected.editedAt).toLocaleString("fr-FR")}</span>}
                  </div>
                  <div style={{marginTop:16,display:"flex",gap:8}}>
                    {canEditMessage(selected) && editingMsgId !== selected.id && (
                      <button onClick={()=>{setEditingMsgId(selected.id);setEditBody(selected.body||"");}} style={{background:"#6366F122",border:"1px solid #6366F144",color:"#6366F1",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Modifier</button>
                    )}
                    <button onClick={()=>{setMessages(p=>p.filter(m=>m.id!==selected.id));setSelected(null);}} style={{background:"#EF444415",border:"1px solid #EF444433",color:"#EF4444",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>🗑️ Supprimer</button>
                  </div>
                </div>
              ):(
                <div style={{color:T.textDim,textAlign:"center",paddingTop:60,fontSize:13}}>
                  <div style={{fontSize:40,marginBottom:12}}>📤</div>
                  Sélectionnez un message envoyé
                </div>
              )}
            </div>
          </div>
        )}
        {/* COMPOSE */}
        {view==="compose"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:10,flex:1,overflowY:"auto"}}>
            <div style={{fontWeight:800,color:"#6366F1",fontSize:13}}>✏️ Nouveau message interne</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Destinataires (internes & externes)</label>
                <select value="" onChange={e=>{if(e.target.value)setCompose(c=>({...c,to:[...new Set([...c.to,e.target.value])]}));}} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
                  <option value="">Sélectionner…</option>
                  <option value="ALL">📢 Tous les collaborateurs</option>
                  <optgroup label="👥 Collaborateurs internes">
                    {(users||[]).filter(u=>u.id!==currentUser?.id&&!u.blocked).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
                  </optgroup>
                  {(partners||[]).filter(p=>p.email).length>0&&(
                    <optgroup label="🤝 Partenaires & Clients externes">
                      {(partners||[]).filter(p=>p.email).map(p=><option key={`ext-${p.id}`} value={`ext:${p.id}:${p.email}`}>{p.nom} — {p.email}</option>)}
                    </optgroup>
                  )}
                </select>
                {compose.to.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                  {compose.to.map(id=><span key={id} style={{background:id.startsWith("ext:")?"#F9731622":"#6366F122",color:id.startsWith("ext:")?"#F97316":"#6366F1",borderRadius:5,padding:"2px 6px",fontSize:9,display:"flex",alignItems:"center",gap:3}}>
                    {id==="ALL"?"Tous":id.startsWith("ext:")?((partners||[]).find(p=>`ext:${p.id}:${p.email}`===id)?.nom||id.split(":")[2]):(users||[]).find(u=>u.id===id)?.name||id}
                    {id.startsWith("ext:")&&<span style={{fontSize:7,opacity:0.7}}>ext</span>}
                    <button onClick={()=>setCompose(c=>({...c,to:c.to.filter(t=>t!==id)}))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10,padding:0}}>✕</button>
                  </span>)}
                </div>}
              </div>
              <div>
                <label style={{color:T.textDim,fontSize:9,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase"}}>Objet</label>
                <input value={compose.subject} onChange={e=>setCompose(c=>({...c,subject:e.target.value}))} placeholder="Sujet du message…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{position:"relative"}}>
              <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                <label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>Message</label>
                <button onClick={()=>setShowEmojis(s=>!s)} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:5,padding:"2px 8px",color:"#F59E0B",cursor:"pointer",fontSize:11,fontWeight:700}}>😊 Émoji</button>
              </div>
              {showEmojis&&(
                <div style={{position:"absolute",top:28,left:0,zIndex:50,background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 8px 32px #0008",padding:12,width:440,maxHeight:320,overflowY:"auto"}}>
                  <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                    <input value={emojiSearch} onChange={e=>setEmojiSearch(e.target.value)} placeholder="🔍 Rechercher un émoji…" style={{flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11}}/>
                    <button onClick={()=>setShowEmojis(false)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:14}}>✕</button>
                  </div>
                  {emojiSearch?(
                    <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {(filteredEmojis||[]).slice(0,80).map((e,i)=><button key={i} onClick={()=>insertEmoji(e)} style={{background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"3px",cursor:"pointer",fontSize:18,lineHeight:1}}>{e}</button>)}
                    </div>
                  ):(
                    Object.entries(EMOJI_GROUPS).map(([group, emojis])=>(
                      <div key={group} style={{marginBottom:10}}>
                        <div style={{color:T.textDim,fontSize:9,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{group}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                          {emojis.map((e,i)=><button key={i} onClick={()=>insertEmoji(e)} style={{background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"3px",cursor:"pointer",fontSize:16,lineHeight:1}}>{e}</button>)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              <textarea value={compose.body} onChange={e=>setCompose(c=>({...c,body:e.target.value}))} placeholder="Rédigez votre message…" rows={8} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"10px 12px",color:T.text,fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            {/* ── Pièces jointes ── */}
            <div>
              <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:5}}>
                <label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>📎 Pièces jointes</label>
                <label style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:5,padding:"3px 8px",color:"#3B82F6",cursor:"pointer",fontSize:10,fontWeight:700}}>
                  ⬆ Téléverser fichier
                  <input type="file" multiple style={{display:"none"}} onChange={e=>{
                    _uploadFiles(e.target.files, { module: "messagerie" }).then(refs => setComposeAttachments(a => [...a, ...refs])).catch(err => console.error("[Messagerie] upload:", err));
                    e.target.value="";
                  }}/>
                </label>
                <button onClick={()=>setShowAttachDossier(s=>!s)} style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:5,padding:"3px 8px",color:"#A855F7",cursor:"pointer",fontSize:10,fontWeight:700}}>📁 Lier dossier/doc</button>
              </div>
              {showAttachDossier&&(
                <div style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:8,maxHeight:160,overflowY:"auto",marginBottom:6}}>
                  <div style={{color:T.textDim,fontSize:9,fontWeight:700,marginBottom:6}}>📁 Sélectionner un dossier à joindre</div>
                  {(dossiers||[]).length===0&&<div style={{color:T.textDim,fontSize:10,textAlign:"center",padding:8}}>Aucun dossier disponible</div>}
                  {(dossiers||[]).slice(0,20).map(d=>(
                    <div key={d.id} onClick={()=>{
                      setComposeAttachments(a=>[...a,{id:"ATT-DOS-"+d.id,name:`[Dossier] ${d.ref} — ${d.client}`,type:"dossier",dossierId:d.id,source:"dossier"}]);
                      setShowAttachDossier(false);
                    }} style={{padding:"5px 8px",cursor:"pointer",borderRadius:5,display:"flex",gap:8,alignItems:"center",marginBottom:1}}
                    onMouseEnter={e=>e.currentTarget.style.background=T.surface}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span>📁</span>
                      <span style={{color:"#C9A84C",fontSize:10,fontWeight:700}}>{d.ref}</span>
                      <span style={{color:T.textMuted,fontSize:9,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</span>
                    </div>
                  ))}
                </div>
              )}
              {composeAttachments.length>0&&(
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                  {composeAttachments.map(att=>(
                    <span key={att.id} style={{background:"#3B82F615",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:5,padding:"3px 8px",fontSize:9,display:"flex",alignItems:"center",gap:4}}>
                      {att.type==="dossier"?"📁":"📎"} {att.name.slice(0,35)}{att.name.length>35?"…":""}
                      <button onClick={()=>setComposeAttachments(a=>a.filter(x=>x.id!==att.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10,padding:0,lineHeight:1}}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{
                if(!compose.to.length&&!compose.body.trim()) return;
                const now=new Date().toISOString();
                const msg={id:"MSG-"+Date.now(),from:currentUser?.id,to:compose.to.length>0?compose.to:["ALL"],
                  cc:compose.cc,subject:compose.subject,body:compose.body,at:now,read:false,read_by:{[currentUser?.id]:new Date().toISOString()},type:"private",
                  attachments:composeAttachments.map(a=>({id:a.id,name:a.name,type:a.type,size:a.size||0,dossierId:a.dossierId||null}))};
                setMessages(p=>[msg,...p]);
                if(setNotifications){
                  compose.to.filter(uid=>uid!==currentUser?.id&&uid!=="ALL").forEach(uid=>{
                    setNotifications(p=>[{id:"N"+Date.now()+uid,icon:"✉️",message:`✉️ Message de ${currentUser?.name}: ${compose.subject}`,at:now,read:false,module:"messagerie"},...p]);
                  });
                }
                setCompose({to:[],cc:[],subject:"",body:"",attachments:[],type:"internal"});
                setComposeAttachments([]);
                setView("inbox");
                playSound("success");
              }} disabled={!compose.to.length&&!compose.body.trim()} style={{background:compose.to.length||compose.body.trim()?"#6366F1":"#33333344",border:"none",color:compose.to.length||compose.body.trim()?"#fff":"#666",borderRadius:8,padding:"9px 20px",cursor:compose.to.length||compose.body.trim()?"pointer":"not-allowed",fontWeight:700,fontSize:12}}>📤 Envoyer</button>
              <button onClick={()=>{setView("inbox");setComposeAttachments([]);}} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",cursor:"pointer",fontSize:12}}>Annuler</button>
              <button onClick={saveDraft} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:8,padding:"9px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>💾 Brouillon</button>
            </div>
          </div>
        )}
        {/* GROUP */}
        {view==="group"&&(
          <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",position:"relative"}}>
            {/* Header canal groupe */}
            <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontWeight:700,color:T.text,fontSize:12,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <span>📢</span>
              <span style={{flex:1}}>
                {groupTarget==="ALL"?"🌐 Canal — Tous les collaborateurs":groupTarget==="MANAGERS"?"👔 Canal — Managers":groupTarget==="DIRECTION"?"🏛️ Canal — Direction":groupTarget==="ADMIN"?"⚙️ Canal — Admins":groupTarget.startsWith("COMITE_")?`🏛️ Canal — Comité ${(INITIAL_COMMITTEES||[]).find(c=>c.id===groupTarget.replace("COMITE_",""))?.acronym||groupTarget}`:"📢 Canal Groupe"}
              </span>
              {groupUnreadCount>0&&<span style={{background:"#C41E3A",color:"#fff",borderRadius:10,padding:"2px 8px",fontSize:10,fontWeight:800}}>{groupUnreadCount} nouveau{groupUnreadCount>1?"x":""}</span>}
              <span style={{color:T.textDim,fontSize:9}}>{groupFeed.length} msg</span>
            </div>

            {/* Zone scrollable UNIFIÉE : messages + pièces jointes en attente */}
            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",minHeight:0}}>
              {/* Feed messages */}
              <div style={{flex:1,padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
                {groupFeed.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:30,fontSize:12}}>Aucun message dans ce canal<br/><span style={{fontSize:9}}>Sélectionnez un groupe et envoyez le premier message</span></div>}
                {groupFeed.map(m=>{
                  const isMine=m.from===currentUser?.id;
                  return (
                    <div key={m.id} style={{display:"flex",gap:8,alignItems:"flex-end",flexDirection:isMine?"row-reverse":"row"}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:isMine?"#6366F1":"#C41E3A",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700,flexShrink:0}}>{m.fromName?.charAt(0)||"?"}</div>
                      <div style={{maxWidth:"72%"}}>
                        {!isMine&&<div style={{color:T.textDim,fontSize:9,fontWeight:700,marginBottom:2,paddingLeft:2}}>{m.fromName}</div>}
                        <div style={{background:isMine?"linear-gradient(135deg,#6366F1,#4F46E5)":"#C41E3A18",border:`1px solid ${isMine?"#6366F133":"#C41E3A33"}`,borderRadius:isMine?"12px 12px 2px 12px":"12px 12px 12px 2px",padding:"8px 12px"}}>
                          {m.attachments?.length>0&&(
                            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
                              {m.attachments.map(att=>(
                                <span key={att.id} style={{background:"rgba(255,255,255,0.15)",borderRadius:4,padding:"2px 6px",fontSize:9,color:isMine?"#fff":"#A0B8D8"}}>
                                  {att.type==="dossier"?"📁":"📎"} {att.name?.slice(0,25)}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{color:isMine?"#fff":T.text,fontSize:12,lineHeight:1.5,whiteSpace:"pre-wrap"}}>
                            {editingMsgId === m.id ? (
                              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                <textarea value={editBody} onChange={e=>setEditBody(e.target.value)} rows={3}
                                  style={{width:"100%",background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.4)",borderRadius:7,padding:"6px 10px",color:"#fff",fontSize:12,resize:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                                <div style={{display:"flex",gap:5}}>
                                  <button onClick={()=>saveMessageEdit(m.id)} style={{background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontSize:10}}>✅ Enregistrer</button>
                                  <button onClick={()=>{setEditingMsgId(null);setEditBody("");}} style={{background:"rgba(0,0,0,0.2)",border:"none",color:"rgba(255,255,255,0.7)",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10}}>Annuler</button>
                                </div>
                              </div>
                            ) : m.body}
                            {m.editedAt && <span style={{color:"rgba(255,255,255,0.5)",fontSize:8,display:"block",marginTop:2}}>✏️ modifié</span>}
                          </div>
                          <div style={{color:isMine?"rgba(255,255,255,0.6)":T.textDim,fontSize:8,marginTop:4,textAlign:"right"}}>{new Date(m.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
                        </div>
                        {isMine&&<div style={{textAlign:"right",marginTop:2,display:"flex",gap:4,justifyContent:"flex-end"}}>
                          {canEditMessage(m) && editingMsgId !== m.id && (
                            <button onClick={()=>{setEditingMsgId(m.id);setEditBody(m.body||"");}} style={{background:"none",border:"none",color:"#6366F188",cursor:"pointer",fontSize:9,padding:"0 2px"}} title="Modifier">✏️</button>
                          )}
                          <button onClick={()=>setMessages(p=>p.filter(x=>x.id!==m.id))} style={{background:"none",border:"none",color:"#EF444488",cursor:"pointer",fontSize:9,padding:"0 2px"}} title="Supprimer">🗑️</button>
                        </div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pièces jointes en attente — dans la zone scrollable */}
              {composeAttachments.length>0&&(
                <div style={{padding:"6px 14px",borderTop:`1px solid ${T.border}`,display:"flex",gap:4,flexWrap:"wrap",background:T.surface3}}>
                  {composeAttachments.map(att=>(
                    <span key={att.id} style={{background:"#3B82F615",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:5,padding:"2px 8px",fontSize:9,display:"flex",alignItems:"center",gap:4}}>
                      {att.type==="dossier"?"📁":"📎"} {att.name?.slice(0,25)}
                      <button onClick={()=>setComposeAttachments(a=>a.filter(x=>x.id!==att.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:9,padding:0,lineHeight:1}}>✕</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Sélecteur dossiers — dans la zone scrollable */}
              {showGroupAttach==="dossiers"&&(
                <div style={{padding:"8px 14px",borderTop:`1px solid ${T.border}`,background:T.surface3,maxHeight:140,overflowY:"auto"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{color:T.textDim,fontSize:9,fontWeight:700}}>📁 Joindre un dossier/document</div>
                    <button onClick={()=>setShowGroupAttach(false)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:12}}>✕</button>
                  </div>
                  {(dossiers||[]).slice(0,20).map(d=>(
                    <div key={d.id} onClick={()=>{setComposeAttachments(a=>[...a,{id:"ATT-DOS-"+d.id,name:`[Dossier] ${d.ref} — ${d.client}`,type:"dossier",dossierId:d.id}]);setShowGroupAttach(false);}}
                      style={{padding:"5px 8px",cursor:"pointer",borderRadius:5,display:"flex",gap:8,alignItems:"center",marginBottom:1}}
                      onMouseEnter={e=>e.currentTarget.style.background=T.surface}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span>📁</span>
                      <span style={{color:"#C9A84C",fontSize:10,fontWeight:700}}>{d.ref}</span>
                      <span style={{color:T.textMuted,fontSize:9,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.client}</span>
                    </div>
                  ))}
                  {(dossiers||[]).length===0&&<div style={{color:T.textDim,fontSize:10,textAlign:"center",padding:8}}>Aucun dossier disponible</div>}
                </div>
              )}
            </div>

            {/* Emoji picker — overlay absolu DEVANT la saisie, plus haut */}
            {showEmojis&&view==="group"&&(
              <div style={{position:"absolute",bottom:62,left:14,right:14,background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 -8px 32px #000A",padding:12,maxHeight:240,overflowY:"auto",zIndex:80}}>
                <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                  <input value={emojiSearch} onChange={e=>setEmojiSearch(e.target.value)} placeholder="🔍 Rechercher…" style={{flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:11}}/>
                  <button onClick={()=>{setShowEmojis(false);setEmojiSearch("");}} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>✕</button>
                </div>
                {emojiSearch?(
                  <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                    {(filteredEmojis||[]).slice(0,80).map((em,i)=><button key={i} onClick={()=>{setGroupMsg(m=>m+em);setShowEmojis(false);setEmojiSearch("");}} style={{background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"3px",cursor:"pointer",fontSize:18,lineHeight:1}}>{em}</button>)}
                  </div>
                ):(
                  Object.entries(EMOJI_GROUPS).map(([group,emojis])=>(
                    <div key={group} style={{marginBottom:8}}>
                      <div style={{color:T.textDim,fontSize:9,fontWeight:700,marginBottom:3,textTransform:"uppercase"}}>{group}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                        {emojis.map((em,i)=><button key={i} onClick={()=>{setGroupMsg(m=>m+em);setShowEmojis(false);setEmojiSearch("");}} style={{background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"3px",cursor:"pointer",fontSize:16,lineHeight:1}}>{em}</button>)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Zone saisie moderne — style messagerie sociale ── */}
            <div style={{flexShrink:0,background:T.surface2,borderTop:`1px solid ${T.border}33`}}>

              {/* Barre d'outils sup — emoji, pièce jointe, sélecteur groupe */}
              <div style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px 2px",borderBottom:`1px solid ${T.border}22`}}>
                <button onClick={()=>{setShowEmojis(s=>!s);setEmojiSearch("");setShowGroupAttach(false);}}
                  title="Émoji"
                  style={{background:showEmojis?"#F59E0B22":"transparent",border:"none",borderRadius:8,padding:"5px 7px",cursor:"pointer",color:showEmojis?"#F59E0B":T.textMuted,fontSize:17,transition:"all 0.15s"}}
                  onMouseEnter={e=>!showEmojis&&(e.target.style.background=T.surface3)}
                  onMouseLeave={e=>!showEmojis&&(e.target.style.background="transparent")}>😊</button>

                <div style={{position:"relative"}}>
                  <button onClick={()=>{setShowGroupAttach(s=>s?"":"+");setShowEmojis(false);}} title="Joindre"
                    style={{background:showGroupAttach?"#3B82F622":"transparent",border:"none",borderRadius:8,padding:"5px 7px",cursor:"pointer",color:showGroupAttach?"#3B82F6":T.textMuted,fontSize:17,transition:"all 0.15s"}}
                    onMouseEnter={e=>!showGroupAttach&&(e.target.style.background=T.surface3)}
                    onMouseLeave={e=>!showGroupAttach&&(e.target.style.background="transparent")}>📎</button>
                  {showGroupAttach==="+"&&(
                    <div style={{position:"absolute",bottom:"calc(100% + 6px)",left:0,background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 -8px 28px #000A",padding:6,minWidth:210,zIndex:60}}>
                      <label style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",borderRadius:8,color:T.text,fontSize:12,userSelect:"none"}}
                        onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <span style={{fontSize:16}}>📎</span> Téléverser un fichier
                        <input type="file" multiple style={{display:"none"}} onChange={e=>{
                          _uploadFiles(e.target.files, { module: 'messagerie', uploadedBy: currentUser?.id }).then(refs => setCourAttachments(a=>[...a,...refs])).catch(err => console.error('[Messagerie] upload:', err))
                          e.target.value="";setShowGroupAttach(false);
                        }}/>
                      </label>
                      <button onClick={()=>setShowGroupAttach("dossiers")}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",borderRadius:8,color:T.text,fontSize:12,background:"transparent",border:"none",width:"100%",textAlign:"left"}}
                        onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <span style={{fontSize:16}}>📁</span> Depuis Dossiers &amp; Docs
                      </button>
                    </div>
                  )}
                </div>

                {/* Cible du message — dropdown custom avec badges */}
                <div ref={groupDropRef} style={{position:"relative",marginLeft:4}}>
                  <button onClick={()=>setShowGroupDropdown(v=>!v)}
                    style={{display:"flex",alignItems:"center",gap:5,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 8px",color:T.textMuted,fontSize:10,cursor:"pointer",maxWidth:180,whiteSpace:"nowrap"}}>
                    <span>{groupTargetLabel}</span>
                    {groupUnreadCount>0&&<span style={{background:"#C41E3A",color:"#fff",borderRadius:8,padding:"1px 5px",fontSize:9,fontWeight:800,minWidth:14,textAlign:"center"}}>{groupUnreadCount>99?"99+":groupUnreadCount}</span>}
                    <span style={{fontSize:8,opacity:0.6}}>▼</span>
                  </button>
                  {showGroupDropdown&&(
                    <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,zIndex:500,minWidth:190,boxShadow:"0 8px 32px rgba(0,0,0,0.4)",overflow:"hidden"}}>
                      {/* Catégorie Universels */}
                      <div style={{padding:"5px 10px 2px",display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>── Universels ──</span>
                        {universalUnread>0&&<span style={{background:"#C41E3A",color:"#fff",borderRadius:8,padding:"1px 5px",fontSize:8,fontWeight:800}}>{universalUnread}</span>}
                      </div>
                      {[{v:"ALL",l:"🌐 Tous"},{v:"MANAGERS",l:"👔 Managers"},{v:"DIRECTION",l:"🏛️ Direction"},{v:"ADMIN",l:"⚙️ Admins"}].map(opt=>{
                        const u=getTargetUnread(opt.v);
                        return <div key={opt.v} onClick={()=>{setGroupTarget(opt.v);setShowGroupDropdown(false);}}
                          style={{padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",background:groupTarget===opt.v?T.surface2:"transparent",color:groupTarget===opt.v?T.text:T.textMuted,fontSize:11,transition:"background 0.1s"}}
                          onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background=groupTarget===opt.v?T.surface2:"transparent"}>
                          <span>{opt.l}</span>
                          {u>0&&<span style={{background:"#C41E3A",color:"#fff",borderRadius:8,padding:"1px 5px",fontSize:9,fontWeight:800}}>{u}</span>}
                        </div>;
                      })}
                      {/* Catégorie Comités */}
                      <div style={{padding:"6px 10px 2px",display:"flex",alignItems:"center",gap:6,borderTop:`1px solid ${T.border}`,marginTop:2}}>
                        <span style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>── Comités ──</span>
                        {comiteUnread>0&&<span style={{background:"#6366F1",color:"#fff",borderRadius:8,padding:"1px 5px",fontSize:8,fontWeight:800}}>{comiteUnread}</span>}
                      </div>
                      {(INITIAL_COMMITTEES||[]).map(c=>{
                        const tgt=`COMITE_${c.id}`;
                        const u=getTargetUnread(tgt);
                        return <div key={c.id} onClick={()=>{setGroupTarget(tgt);setShowGroupDropdown(false);}}
                          style={{padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",background:groupTarget===tgt?T.surface2:"transparent",color:groupTarget===tgt?T.text:T.textMuted,fontSize:11,transition:"background 0.1s"}}
                          onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background=groupTarget===tgt?T.surface2:"transparent"}>
                          <span>{c.icon} {c.acronym}</span>
                          {u>0&&<span style={{background:"#6366F1",color:"#fff",borderRadius:8,padding:"1px 5px",fontSize:9,fontWeight:800}}>{u}</span>}
                        </div>;
                      })}
                    </div>
                  )}
                </div>

                <div style={{flex:1}}/>
                <span style={{color:groupMsg.length>400?"#EF4444":T.textDim,fontSize:9,fontWeight:groupMsg.length>400?700:400}}>
                  {groupMsg.length}/500
                </span>
              </div>

              {/* Zone textarea principale */}
              <div style={{padding:"8px 12px 10px",display:"flex",gap:8,alignItems:"flex-end"}}>
                <textarea
                  value={groupMsg}
                  onChange={e=>{ if(e.target.value.length<=500) setGroupMsg(e.target.value); }}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendGroupMsg();}}}
                  placeholder={`Envoyer un message à ${groupTarget==="ALL"?"tous les collaborateurs":groupTarget==="MANAGERS"?"les managers":groupTarget==="DIRECTION"?"la direction":groupTarget==="ADMIN"?"les admins":"ce groupe"}… (↵ Envoyer · ⇧↵ Nouvelle ligne)`}
                  rows={3}
                  style={{
                    flex:1, background:T.surface3,
                    border:`1.5px solid ${T.border}`,
                    borderRadius:12, padding:"10px 14px",
                    color:T.text, fontSize:13,
                    resize:"none", fontFamily:"inherit",
                    lineHeight:1.5,
                    minHeight:72, maxHeight:140,
                    overflowY:"auto",
                    transition:"border-color 0.2s, box-shadow 0.2s",
                    outline:"none",
                  }}
                  onFocus={e=>{e.target.style.borderColor="#6366F1";e.target.style.boxShadow="0 0 0 3px #6366F122";}}
                  onBlur={e=>{e.target.style.borderColor=T.border;e.target.style.boxShadow="none";}}
                />

                {/* Bouton envoyer */}
                <button onClick={sendGroupMsg} disabled={!groupMsg.trim()}
                  style={{
                    flexShrink:0,
                    background:groupMsg.trim()?"linear-gradient(135deg,#6366F1,#4F46E5)":"transparent",
                    border:groupMsg.trim()?"none":`1px solid ${T.border}`,
                    color:groupMsg.trim()?"#fff":T.textDim,
                    borderRadius:12, width:44, height:44,
                    cursor:groupMsg.trim()?"pointer":"default",
                    fontSize:18, display:"flex",alignItems:"center",justifyContent:"center",
                    transition:"all 0.2s",
                    transform:groupMsg.trim()?"scale(1)":"scale(0.9)",
                    boxShadow:groupMsg.trim()?"0 4px 16px #6366F155":"none",
                  }}
                  onMouseEnter={e=>groupMsg.trim()&&(e.currentTarget.style.transform="scale(1.08)")}
                  onMouseLeave={e=>e.currentTarget.style.transform=groupMsg.trim()?"scale(1)":"scale(0.9)"}>
                  ➤
                </button>
              </div>

              {/* Hint raccourcis */}
              <div style={{textAlign:"center",fontSize:9,color:T.textDim,paddingBottom:6,letterSpacing:0.3}}>
                ↵ Envoyer &nbsp;·&nbsp; ⇧↵ Saut de ligne &nbsp;·&nbsp; 😊 Émoji &nbsp;·&nbsp; 📎 Joindre
              </div>
            </div>
          </div>
        )}
        {/* COURRIERS OFFICIELS */}
        {view==="courriers"&&(
          <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
            <div style={{width:240,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0}}>
              <div style={{padding:"10px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:T.text,fontWeight:700,fontSize:11,flex:1}}>📮 Courriers</span>
                <button onClick={()=>{setCourForm({destinataire:"",objet:"",ref:"",body:"",template:"",type:"external"});setSelected(null);}} style={{background:"#6366F1",border:"none",color:"#fff",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>+ Nouveau</button>
              </div>
              {courriers.map(c=>(
                <div key={c.id} onClick={()=>setSelected(c)} style={{padding:"9px 12px",borderBottom:`1px solid ${T.border}22`,cursor:"pointer",background:selected?.id===c.id?"#6366F115":"transparent"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{color:T.text,fontSize:10,fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.objet||"Sans objet"}</span>
                    <span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700,flexShrink:0}}>✓</span>
                  </div>
                  <div style={{color:T.textDim,fontSize:9}}>→ {c.destinataire}</div>
                  <div style={{color:T.textDim,fontSize:8,fontFamily:"monospace",marginTop:2}}>{c.ref}</div>
                </div>
              ))}
              {courriers.length===0&&<div style={{color:T.textDim,textAlign:"center",padding:20,fontSize:11}}>Aucun courrier</div>}
            </div>
            <div style={{flex:1,padding:14,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
              {selected?.type==="courrier_officiel"?(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:14,color:T.text}}>{selected.objet}</div>
                      <div style={{color:T.textDim,fontSize:10}}>→ {selected.destinataire} · {new Date(selected.createdAt).toLocaleDateString("fr-FR")}</div>
                      <div style={{color:"#6366F1",fontSize:9,fontFamily:"monospace"}}>{selected.ref}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{const b=new Blob([selected.body],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`${selected.ref||"courrier"}.txt`;a.click();URL.revokeObjectURL(u);}} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>⬇ TXT</button>
                      <button onClick={()=>gcOpenPrintWindow({title:`Courrier — ${selected.objet||""}`,content:`<h2>${selected.objet||""}</h2><p><strong>Référence :</strong> ${selected.ref||"—"}</p><p><strong>Destinataire :</strong> ${selected.destinataire||"—"}</p><p><strong>Date :</strong> ${new Date(selected.createdAt).toLocaleDateString("fr-FR")}</p><hr/><div style="white-space:pre-wrap;font-size:12px;line-height:1.8;">${(selected.body||"").replace(/</g,"&lt;")}</div>`})} style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:10}}>🖨️</button>
                    </div>
                  </div>
                  <div style={{background:"#fff",color:"#1a1a1a",borderRadius:8,padding:"20px 24px",lineHeight:1.8,fontSize:12,whiteSpace:"pre-wrap",border:"1px solid #e5e5e5"}}>{selected.body}</div>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontWeight:700,color:"#6366F1",fontSize:13}}>📮 Rédiger un courrier officiel</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setShowCourTemplates(s=>!s)} style={{background:"#6366F122",border:"1px solid #6366F144",color:"#6366F1",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>📋 Modèles</button>
                    {showCourTemplates&&(
                      <div style={{position:"absolute",zIndex:20,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:"0 8px 24px #0006",padding:10,display:"flex",flexDirection:"column",gap:4,minWidth:220}}>
                        {COURRIER_TEMPLATES.map(t=>(
                          <button key={t.id} onClick={()=>applyTemplate(t)} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",cursor:"pointer",textAlign:"left",color:T.text,fontSize:11,display:"flex",alignItems:"center",gap:8}}>
                            {t.icon} {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Interface vraie boîte mail */}
                  <div style={{background:T.surface3,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden",marginBottom:4}}>
                    {/* DE : */}
                    <div style={{display:"flex",alignItems:"center",padding:"7px 12px",borderBottom:`1px solid ${T.border}`}}>
                      <label style={{color:T.textDim,fontSize:11,fontWeight:700,minWidth:32,marginRight:8}}>De :</label>
                      <input value={courForm.from} readOnly
                        style={{flex:1,background:"transparent",border:"none",color:T.textMuted,fontSize:11,outline:"none",cursor:"default"}}/>
                    </div>
                    {/* À : */}
                    <div style={{display:"flex",alignItems:"center",padding:"7px 12px",borderBottom:`1px solid ${T.border}`}}>
                      <label style={{color:T.textDim,fontSize:11,fontWeight:700,minWidth:32,marginRight:8}}>À :</label>
                      <input list="gc-courrier-dest-list" value={courForm.destinataire}
                        onChange={e=>{
                          const val=e.target.value;
                          // Si sélection d'un partenaire → prendre son email
                          const matched=(partners||[]).find(p=>p.nom===val||p.email===val);
                          setCourForm(f=>({...f,destinataire:matched?.email||val}));
                        }}
                        placeholder="destinataire@email.com ou nom du partenaire"
                        inputMode="email" autoComplete="email"
                        style={{flex:1,background:"transparent",border:"none",color:T.text,fontSize:11,outline:"none"}}/>
                      <datalist id="gc-courrier-dest-list">
                        {(partners||[]).filter(p=>p.email).map(p=>(
                          <option key={p.id} value={p.email}>{p.nom} — {p.email}</option>
                        ))}
                        {users.filter(u=>_activeUser(u)&&u.email&&!u.isAdmin).map(u=>(
                          <option key={u.id} value={u.email}>{u.name} — {u.email}</option>
                        ))}
                      </datalist>
                    </div>
                    {/* CC : */}
                    <div style={{display:"flex",alignItems:"center",padding:"7px 12px",borderBottom:`1px solid ${T.border}`}}>
                      <label style={{color:T.textDim,fontSize:11,fontWeight:700,minWidth:32,marginRight:8}}>Cc :</label>
                      <input value={courForm.cc||""}
                        onChange={e=>setCourForm(f=>({...f,cc:e.target.value.toLowerCase().replace(/[^a-z0-9@._\-,; ]/g,"")}))}
                        onInput={e=>{e.target.value=e.target.value.toLowerCase();}}
                        placeholder="copie@email.com (séparés par virgule)"
                        inputMode="email" autoComplete="email"
                        style={{flex:1,background:"transparent",border:"none",color:T.text,fontSize:11,outline:"none"}}/>
                    </div>
                    {/* Objet */}
                    <div style={{display:"flex",alignItems:"center",padding:"7px 12px"}}>
                      <label style={{color:T.textDim,fontSize:11,fontWeight:700,minWidth:32,marginRight:8}}>Objet :</label>
                      <input value={courForm.objet} onChange={e=>setCourForm(f=>({...f,objet:e.target.value}))}
                        placeholder="Objet du message…"
                        style={{flex:1,background:"transparent",border:"none",color:T.text,fontSize:11,outline:"none"}}/>
                    </div>
                  </div>
                  <div>
                    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                      <label style={{color:T.textDim,fontSize:9,fontWeight:700}}>Corps du courrier</label>
                      <button onClick={()=>setShowEmojis(s=>!s)} style={{background:"#F59E0B15",border:"1px solid #F59E0B33",borderRadius:4,padding:"2px 6px",color:"#F59E0B",cursor:"pointer",fontSize:10}}>😊</button>
                    </div>
                    <textarea value={courForm.body} onChange={e=>setCourForm(f=>({...f,body:e.target.value}))} rows={10} style={{width:"100%",background:"#fff",border:`2px solid ${T.border}`,borderRadius:8,padding:"12px 16px",color:"#1a1a1a",fontSize:12,resize:"vertical",fontFamily:"'Times New Roman',serif",lineHeight:1.8,boxSizing:"border-box"}}/>
                  </div>
                  {/* ── Pièces jointes Courrier ── */}
                  <div>
                    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:5}}>
                      <label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>📎 Pièces jointes</label>
                      <label style={{background:"#3B82F622",border:"1px solid #3B82F644",borderRadius:5,padding:"2px 8px",color:"#3B82F6",cursor:"pointer",fontSize:10,fontWeight:700}}>
                        ⬆ Fichier
                        <input type="file" multiple style={{display:"none"}} onChange={e=>{
                          _uploadFiles(e.target.files, { module: "messagerie" }).then(refs => setCourAttachments(a => [...a, ...refs])).catch(err => console.error("[Messagerie] upload:", err));
                          e.target.value="";
                        }}/>
                      </label>
                      <button onClick={()=>setShowCourAttachDossier(s=>!s)} style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:5,padding:"2px 8px",color:"#A855F7",cursor:"pointer",fontSize:10,fontWeight:700}}>📁 Dossier/Doc</button>
                    </div>
                    {showCourAttachDossier&&(
                      <div style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:8,maxHeight:140,overflowY:"auto",marginBottom:5}}>
                        {(dossiers||[]).slice(0,20).map(d=>(
                          <div key={d.id} onClick={()=>{setCourAttachments(a=>[...a,{id:"ATT-DOS-"+d.id,name:`[Dossier] ${d.ref} — ${d.client}`,type:"dossier",dossierId:d.id}]);setShowCourAttachDossier(false);}}
                            style={{padding:"4px 8px",cursor:"pointer",fontSize:10,color:T.text,display:"flex",gap:6,borderRadius:4}}
                            onMouseEnter={e=>e.currentTarget.style.background=T.surface}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            📁 <strong style={{color:"#C9A84C"}}>{d.ref}</strong> — {d.client}
                          </div>
                        ))}
                      </div>
                    )}
                    {courAttachments.length>0&&(
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:5}}>
                        {courAttachments.map(att=>(
                          <span key={att.id} style={{background:"#3B82F615",border:"1px solid #3B82F633",color:"#3B82F6",borderRadius:5,padding:"2px 8px",fontSize:9,display:"flex",alignItems:"center",gap:4}}>
                            {att.type==="dossier"?"📁":"📎"} {att.name.slice(0,30)}
                            <button onClick={()=>setCourAttachments(a=>a.filter(x=>x.id!==att.id))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:10,padding:0}}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{
                      if(!courForm.body.trim()) return;
                      const now=new Date().toISOString();
                      const doc={id:"CRR-"+Date.now(),ref:courForm.ref||`REF-CRR-${Date.now()}`,
                        destinataire:courForm.destinataire,objet:courForm.objet,body:courForm.body,
                        template:courForm.template,createdAt:now,createdBy:currentUser?.name,
                        status:"ENVOYE",type:"courrier_officiel",
                        attachments:courAttachments.map(a=>({id:a.id,name:a.name,type:a.type||"file",dossierId:a.dossierId||null}))};
                      const updated=[doc,...courriers];
                      setCourriers(updated);
                      try{_lsSet("gc-courrier-docs",JSON.stringify(updated.slice(0,100)));}catch(_){}
                      if(setNotifications) setNotifications(p=>[{id:"N"+Date.now(),icon:"📮",message:`Courrier: ${courForm.objet} → ${courForm.destinataire}`,at:now,read:false},...p]);
                      setCourForm({destinataire:"",objet:"",ref:"",body:"",template:"",type:"external"});
                      setCourAttachments([]);
                      setView("courriers");
                      playSound("success");
                    }} disabled={!courForm.body.trim()} style={{background:"#6366F1",border:"none",color:"#fff",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontWeight:700,fontSize:12}}>📮 Enregistrer & Envoyer</button>
                    <button onClick={()=>gcOpenPrintWindow({title:`Brouillon — ${courForm.objet||"Courrier"}`,content:`<h2>${courForm.objet||"Brouillon courrier"}</h2><p><strong>Destinataire :</strong> ${courForm.destinataire||"—"}</p><p><strong>Référence :</strong> ${courForm.ref||"—"}</p><hr/><div style="white-space:pre-wrap;font-size:12px;line-height:1.8;">${(courForm.body||"").replace(/</g,"&lt;")}</div>`})} style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:7,padding:"9px 12px",cursor:"pointer",fontSize:11}}>🖨️</button>
                    <button onClick={()=>{setCourForm({destinataire:"",objet:"",ref:"",body:"",template:"",type:"external"});setCourAttachments([]);}} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"9px 12px",cursor:"pointer",fontSize:11}}>✕ Effacer</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* ── VUE : BROUILLONS ── */}
        {view==="drafts"&&(
          <div style={{padding:16,overflowY:"auto",flex:1}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontWeight:800,color:T.text,fontSize:13}}>📝 Brouillons ({drafts.length})</div>
              <button onClick={()=>setView("compose")} style={{background:"#6366F122",border:"1px solid #6366F144",color:"#6366F1",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>✏️ Nouveau message</button>
            </div>
            {drafts.length===0&&(
              <div style={{textAlign:"center",padding:40,color:T.textDim}}>
                <div style={{fontSize:36,marginBottom:10}}>📝</div>
                <div style={{fontSize:12}}>Aucun brouillon enregistré</div>
                <div style={{fontSize:11,marginTop:4}}>Cliquez sur "💾 Brouillon" lors de la rédaction d'un message pour le sauvegarder ici.</div>
              </div>
            )}
            {drafts.map(d=>(
              <div key={d.id} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{fontSize:20,flexShrink:0}}>📝</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.subject||"(Sans objet)"}</div>
                  <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>À : {d.to?.map(uid=>(users||[]).find(u=>u.id===uid)?.name||uid).join(", ")||"—"}</div>
                  <div style={{color:T.textDim,fontSize:9,marginTop:2}}>{d.body?.slice(0,80)}{d.body?.length>80?"…":""}</div>
                  <div style={{color:T.textDim,fontSize:9,marginTop:3}}>💾 Sauvegardé le {new Date(d.savedAt).toLocaleString("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                  <button onClick={()=>openDraft(d)} style={{background:"#6366F122",border:"1px solid #6366F144",color:"#6366F1",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontWeight:700,fontSize:11}}>✏️ Reprendre</button>
                  <button onClick={()=>deleteDraft(d.id)} style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:11}}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── VUE : MODÈLES (CRUD) ── */}
        {view==="templates"&&(
          <div style={{padding:16,overflowY:"auto",flex:1}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontWeight:800,color:T.text,fontSize:13}}>📋 Modèles de courriers</div>
              {(currentUser?.level>=4||currentUser?.isAdmin) && (
                <button onClick={()=>{setTplForm({id:"",icon:"📝",label:"",body:""});setTplModal({mode:"new"});}}
                  style={{background:"#6366F1",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
                  ＋ Créer un modèle
                </button>
              )}
            </div>

            {/* Modèles intégrés */}
            <div style={{color:T.textMuted,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Modèles officiels (intégrés)</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10,marginBottom:18}}>
              {COURRIER_TEMPLATES.map(t=>(
                <div key={t.id} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontSize:18}}>{t.icon}</span>
                    <span style={{color:T.text,fontWeight:700,fontSize:11,flex:1}}>{t.label}</span>
                    <span style={{background:"#6366F122",color:"#6366F1",borderRadius:4,padding:"1px 6px",fontSize:8,fontWeight:700}}>OFFICIEL</span>
                  </div>
                  <div style={{color:T.textDim,fontSize:9,lineHeight:1.4,marginBottom:10,height:44,overflow:"hidden"}}>{t.body.slice(0,100)}…</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{applyTemplate(t);setView("courriers");}}
                      style={{flex:1,background:"#6366F1",border:"none",color:"#fff",borderRadius:6,padding:"6px 0",cursor:"pointer",fontWeight:700,fontSize:11}}>
                      Utiliser ce modèle
                    </button>
                    {(currentUser?.level>=4||currentUser?.isAdmin) && (
                      <button onClick={()=>{setTplForm({...t,id:"OFF-"+t.id});setTplModal({mode:"new",baseOfficial:true});}}
                        title="Créer une variante personnalisée de ce modèle"
                        style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:11}}>
                        📋 Variante
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Modèles personnalisés */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{color:T.textMuted,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.6}}>Mes modèles personnalisés ({customTemplates.length})</div>
            </div>
            {customTemplates.length===0&&(
              <div style={{textAlign:"center",padding:"20px 0",color:T.textDim,fontSize:11}}>
                {(currentUser?.level>=4||currentUser?.isAdmin)
                  ? <>Aucun modèle personnalisé — cliquez sur <strong>＋ Créer un modèle</strong> pour en ajouter.</>
                  : <span style={{color:T.textDim}}>🔒 La création de modèles est réservée aux responsables (Niv.4+).</span>
                }
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
              {customTemplates.map(t=>(
                <div key={t.id} style={{background:T.surface2,border:`1px solid #6366F133`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontSize:18}}>{t.icon||"📝"}</span>
                    <span style={{color:T.text,fontWeight:700,fontSize:11,flex:1}}>{t.label}</span>
                    <span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 6px",fontSize:8,fontWeight:700}}>PERSO</span>
                  </div>
                  <div style={{color:T.textDim,fontSize:9,lineHeight:1.4,marginBottom:10,height:44,overflow:"hidden"}}>{t.body?.slice(0,100)}…</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{applyTemplate(t);setView("courriers");}}
                      style={{flex:1,background:"#6366F1",border:"none",color:"#fff",borderRadius:6,padding:"6px 0",cursor:"pointer",fontWeight:700,fontSize:11}}>
                      Utiliser
                    </button>
                    {(currentUser?.level>=4||currentUser?.isAdmin) && (<>
                      <button onClick={()=>{setTplForm({...t});setTplModal({mode:"edit"});}}
                        style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:11}}>✏️</button>
                      <button onClick={async () => {if(await gcConfirm(`Supprimer le modèle "${t.label}" ?`))saveCustomTemplates(customTemplates.filter(x=>x.id!==t.id));}}
                        style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:11}}>🗑</button>
                    </>)}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal création/édition modèle */}
            {tplModal&&(
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center"}}
                onClick={()=>setTplModal(null)}>
                <div style={{background:T.surface,border:`1px solid #6366F144`,borderRadius:16,padding:"24px 26px",width:520,maxWidth:"95vw",boxShadow:"0 24px 64px #000A",maxHeight:"90vh",overflowY:"auto"}}
                  onClick={e=>e.stopPropagation()}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
                    <span style={{fontSize:22}}>{tplModal.mode==="new"?"➕":"✏️"}</span>
                    <div style={{color:T.text,fontWeight:900,fontSize:15}}>{tplModal.mode==="new"?"Créer un modèle":"Modifier le modèle"}</div>
                  </div>
                  {/* Icône + Libellé */}
                  <div style={{display:"grid",gridTemplateColumns:"80px 1fr",gap:10,marginBottom:12}}>
                    <div>
                      <label style={{color:T.textDim,fontSize:9,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"}}>Icône</label>
                      <input value={tplForm.icon} onChange={e=>setTplForm(f=>({...f,icon:e.target.value}))} maxLength={2}
                        style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px",color:T.text,fontSize:22,textAlign:"center",boxSizing:"border-box"}}/>
                    </div>
                    <div>
                      <label style={{color:T.textDim,fontSize:9,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"}}>Nom du modèle *</label>
                      <input value={tplForm.label} onChange={e=>setTplForm(f=>({...f,label:e.target.value}))} placeholder="Ex : Rapport mensuel, Demande de devis…"
                        style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                  {/* Corps */}
                  <div style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>Corps du modèle *</label>
                      <div style={{color:T.textDim,fontSize:9}}>Variables disponibles : <code style={{background:T.surface3,borderRadius:3,padding:"1px 4px"}}>{"{date}"}</code> <code style={{background:T.surface3,borderRadius:3,padding:"1px 4px"}}>{"{signature}"}</code> <code style={{background:T.surface3,borderRadius:3,padding:"1px 4px"}}>{"{objet}"}</code> <code style={{background:T.surface3,borderRadius:3,padding:"1px 4px"}}>{"{expediteur}"}</code> <code style={{background:T.surface3,borderRadius:3,padding:"1px 4px"}}>{"{destinataire}"}</code> <code style={{background:T.surface3,borderRadius:3,padding:"1px 4px"}}>{"{ref}"}</code></div>
                    </div>
                    <textarea value={tplForm.body} onChange={e=>setTplForm(f=>({...f,body:e.target.value}))}
                      placeholder="Rédigez votre modèle ici. Utilisez les variables {date}, {signature}, {objet}…"
                      rows={10} style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"10px",color:T.text,fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
                  </div>
                  {/* Actions */}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button onClick={()=>setTplModal(null)}
                      style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:12}}>Annuler</button>
                    <button onClick={()=>{
                      if(!tplForm.label.trim()||!tplForm.body.trim()){gcAlert("Le nom et le corps sont obligatoires.");return;}
                      if(tplModal.mode==="new"){
                        const newT={...tplForm,id:"TPL-"+Date.now()};
                        saveCustomTemplates([...customTemplates,newT]);
                      } else {
                        saveCustomTemplates(customTemplates.map(t=>t.id===tplForm.id?tplForm:t));
                      }
                      setTplModal(null);
                      playSound("success");
                    }} style={{background:"linear-gradient(135deg,#6366F1,#4F46E5)",border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                      {tplModal.mode==="new"?"✅ Créer le modèle":"✅ Enregistrer"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VUE : PROGRAMMER UN RDV ── */}
        {view==="rdv"&&(
          <div style={{padding:20,overflowY:"auto",flex:1}}>
            <div style={{fontWeight:800,color:"#06B6D4",fontSize:14,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
              <span>📅</span> Programmer un Rendez-vous
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Client / Objet *</label>
                <input value={rdvForm.client} onChange={e=>setRdvForm(f=>({...f,client:e.target.value}))} placeholder="Objet ou nom client…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Type</label>
                <select value={rdvForm.type} onChange={e=>setRdvForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}}>
                  <option value="RDV_CLIENT">🤝 RDV Client</option>
                  <option value="REUNION_INTERNE">👥 Réunion Interne</option>
                  <option value="AUDIENCE">⚖️ Audience</option>
                  <option value="CONSULTATION">📋 Consultation</option>
                  <option value="FORMATION">📚 Formation</option>
                  <option value="AUTRE">📌 Autre</option>
                </select></div>
              <div><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Date *</label>
                <input type="date" value={rdvForm.date} onChange={e=>setRdvForm(f=>({...f,date:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Heure *</label>
                <input type="time" value={rdvForm.heure} onChange={e=>setRdvForm(f=>({...f,heure:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Durée (min)</label>
                <input type="number" value={rdvForm.duree} onChange={e=>setRdvForm(f=>({...f,duree:Number(e.target.value)}))} min={15} max={480} step={15} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Responsable</label>
                <select value={rdvForm.assignedTo} onChange={e=>setRdvForm(f=>({...f,assignedTo:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}}>
                  <option value="">Moi-même</option>
                  {(users||[]).filter(u=>u.id!==currentUser?.id).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select></div>
            </div>
            <div style={{marginBottom:10}}><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Lieu</label>
              <input value={rdvForm.lieu} onChange={e=>setRdvForm(f=>({...f,lieu:e.target.value}))} placeholder="Siège, visioconférence, lieu externe…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:14}}><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Notes / Ordre du jour</label>
              <textarea value={rdvForm.notes} onChange={e=>setRdvForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Ordre du jour, instructions…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{
                if(!rdvForm.client||!rdvForm.date||!rdvForm.heure){gcAlert("Champs requis : Objet/Client, Date, Heure.");return;}
                const now=new Date().toISOString();
                const newRdv={id:"RDV-"+Date.now(),client:rdvForm.client,date:rdvForm.date,heure:rdvForm.heure,
                  duree:rdvForm.duree,lieu:rdvForm.lieu,notes:rdvForm.notes,type:rdvForm.type,
                  createdBy:currentUser?.id,assignedTo:rdvForm.assignedTo||currentUser?.id,
                  status:"A_VENIR",createdAt:now,source:"messagerie"};
                if(setRdvs) setRdvs(p=>[...p,newRdv]);
                if(setNotifications) setNotifications(p=>[{id:"N"+Date.now(),icon:"📅",
                  message:`📅 RDV programmé : ${rdvForm.client} — ${rdvForm.date} à ${rdvForm.heure}`,at:now,read:false,module:"agenda"},...p]);
                setRdvForm({client:"",date:"",heure:"",duree:60,lieu:"",notes:"",type:"RDV_CLIENT",assignedTo:""});
                setView("inbox");playSound("success");
                gcAlert(`✅ RDV programmé :
${rdvForm.client}
${rdvForm.date} à ${rdvForm.heure}`);
              }} style={{background:"#06B6D4",border:"none",color:"#fff",borderRadius:8,padding:"10px 22px",cursor:"pointer",fontWeight:700,fontSize:13}}>📅 Programmer</button>
              <button onClick={()=>setView("inbox")} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:13}}>Annuler</button>
            </div>
          </div>
        )}

        {/* ── VUE : ASSIGNER UNE TÂCHE ── */}
        {view==="task"&&(
          <div style={{padding:20,overflowY:"auto",flex:1}}>
            <div style={{fontWeight:800,color:"#F59E0B",fontSize:14,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
              <span>✅</span> Assigner une Tâche
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div style={{gridColumn:"1/-1"}}><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Titre de la tâche *</label>
                <input value={taskForm.titre} onChange={e=>setTaskForm(f=>({...f,titre:e.target.value}))} placeholder="Intitulé de la tâche…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Assigné à *</label>
                <select value={taskForm.assignedTo} onChange={e=>setTaskForm(f=>({...f,assignedTo:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}}>
                  <option value="">Sélectionner…</option>
                  {(users||[]).map(u=><option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
                </select></div>
              <div><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Priorité</label>
                <select value={taskForm.priority} onChange={e=>setTaskForm(f=>({...f,priority:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}}>
                  <option value="HAUTE">🔴 HAUTE</option>
                  <option value="NORMALE">🔵 NORMALE</option>
                  <option value="MOYENNE">🟡 MOYENNE</option>
                  <option value="BASSE">⚪ BASSE</option>
                </select></div>
              <div><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Échéance</label>
                <input type="date" value={taskForm.deadline} onChange={e=>setTaskForm(f=>({...f,deadline:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/></div>
            </div>
            <div style={{marginBottom:14}}><label style={{color:T.textDim,fontSize:9,fontWeight:700,textTransform:"uppercase",display:"block",marginBottom:4}}>Description</label>
              <textarea value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} rows={4} placeholder="Instructions, contexte…" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{
                if(!taskForm.titre||!taskForm.assignedTo){gcAlert("Renseignez le titre et l'assigné.");return;}
                const now=new Date().toISOString();
                const assignee=(users||[]).find(u=>u.id===taskForm.assignedTo);
                const newTask={id:"T"+Date.now(),titre:taskForm.titre,description:taskForm.description,
                  status:"A_FAIRE",statut:"A_FAIRE",creatorId:currentUser?.id,assigneeId:taskForm.assignedTo,
                  priority:taskForm.priority,deadline:taskForm.deadline,createdAt:now,source:"messagerie"};
                if(setTaches) setTaches(p=>[newTask,...p]);
                if(setNotifications) setNotifications(p=>[{id:"N"+Date.now(),icon:"✅",
                  message:`✅ Tâche assignée à ${assignee?.name}: "${taskForm.titre}"`,at:now,read:false,module:"taches"},...p]);
                try{
                  const nk=`GC_SI_v12:notif:${taskForm.assignedTo}`;
                  const prev=JSON.parse(_lsGet(nk)||"[]");
                  _lsSet(nk,JSON.stringify([{id:"N"+Date.now(),icon:"✅",
                    message:`📋 Nouvelle tâche de ${currentUser?.name}: "${taskForm.titre}"`,
                    at:now,read:false,module:"taches"},...prev].slice(0,200)));
                }catch(_){}
                setTaskForm({titre:"",description:"",assignedTo:"",deadline:"",priority:"NORMALE"});
                setView("inbox");playSound("success");
                gcAlert(`✅ Tâche assignée à ${assignee?.name||"l'utilisateur"} :
"${taskForm.titre}"`);
              }} style={{background:"#F59E0B",border:"none",color:"#000",borderRadius:8,padding:"10px 22px",cursor:"pointer",fontWeight:700,fontSize:13}}>✅ Assigner</button>
              <button onClick={()=>setView("inbox")} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:13}}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
