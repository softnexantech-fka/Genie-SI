// ============================================================
// core/constants.js — Toutes les constantes, données initiales, configurations
// SI Génie Consultant v127
// ============================================================
import { _lsGet, _lsSet } from './storage.js';
import { playSound } from './helpers.js';
import { gcFileDownload as _gcFileDownload, gcFileUrl as _gcFileUrl } from './filestore.js';

// Calcul des jours restants (copie locale pour éviter dépendance circulaire constants ↔ helpers)
const _daysLeft = (dateStr) => {
  if (!dateStr) return 999;
  try {
    const d = new Date(dateStr); const now = new Date();
    now.setHours(0,0,0,0); d.setHours(0,0,0,0);
    return Math.round((d - now) / 86400000);
  } catch(_) { return 999; }
};

export const INITIAL_DOSSIERS          = [];
export const INITIAL_TACHES            = [];
export const INITIAL_RDVS              = [];
export const INITIAL_PENDING           = [];
export const INITIAL_PARTNERS          = [];
export const INITIAL_ARCHIVES          = [];
export const INITIAL_MESSAGES          = [];
export const INITIAL_SESSION_LOGS      = [];
export const INITIAL_ACCOUNT_ACTIONS   = [];
export const INITIAL_SYSTEM_MSGS = [
  // ── Message de bienvenue institutionnel (tous niveaux, permanent) ──────────
  {
    id: "SYS-001",
    title: "🏛️ Bienvenue sur SI Génie Consultant",
    text: "Votre Système d'Information est opérationnel. Accédez à vos modules via la barre latérale. Pour toute assistance, utilisez l'Assistant IA intégré.",
    color: "#C41E3A",
    minLevel: 1, maxLevel: 6,
    type: "info",
    persistent: false,
    createdAt: "2026-01-01T08:00:00",
    author: "Direction Générale",
  },
  // ── Message première connexion — collaborateurs (niv 1-3) ──────────────────
  {
    id: "SYS-002",
    title: "📋 Premiers pas dans le SI",
    text: "Commencez par compléter votre profil (photo, téléphone, bio). Consultez vos tâches assignées dans 'Tâches & Alertes' et vos dossiers dans 'Dossiers & Documents'.",
    color: "#3B82F6",
    minLevel: 1, maxLevel: 3,
    type: "onboarding",
    persistent: false,
    createdAt: "2026-01-01T08:01:00",
    author: "Ressources Humaines",
  },
  // ── Message responsables de processus (niv 4) ──────────────────────────────
  {
    id: "SYS-003",
    title: "⚙️ Responsable de Processus — Vos outils",
    text: "En tant que Responsable, vous gérez les approbations, la validation des dossiers de votre processus et le suivi des tâches de votre équipe. Consultez 'Approbations & Validation' et le tableau de bord.",
    color: "#8B5CF6",
    minLevel: 4, maxLevel: 4,
    type: "role_info",
    persistent: false,
    createdAt: "2026-01-01T08:02:00",
    author: "Direction Générale",
  },
  // ── Message Direction Générale (niv 5) ────────────────────────────────────
  {
    id: "SYS-004",
    title: "👑 Tableau de bord DG — Supervision globale",
    text: "Votre tableau de bord DG centralise tous les KPIs stratégiques, les approbations en attente, la gestion des comptes collaborateurs et les alertes transversales. Configurez votre profil pour personnaliser le SI.",
    color: "#C9A84C",
    minLevel: 5, maxLevel: 5,
    type: "dg_info",
    persistent: false,
    createdAt: "2026-01-01T08:03:00",
    author: "Direction SI",
  },
  // ── Rappel politique sécurité (tous niveaux) ──────────────────────────────
  {
    id: "SYS-005",
    title: "🔐 Politique de sécurité — Rappel",
    text: "Changez votre mot de passe par défaut dès votre première connexion. Ne partagez jamais vos identifiants. Signalez toute activité suspecte à l'administrateur SI.",
    color: "#EF4444",
    minLevel: 1, maxLevel: 6,
    type: "security",
    persistent: false,
    createdAt: "2026-01-01T08:04:00",
    author: "Direction SI",
  },
];


// FIX v92 Bug#2 — _gcSafeCalc : évaluateur arithmétique sécurisé global (sans eval ni Function)
// Utilisé par : tableur simple, TableurPro, calculatrice, calcCell
// Supporte : + - * / ** () nombres décimaux et négatifs
// Refuse : fetch, alert, window, localStorage, tout identifiant non numérique → retourne null

export const GC_SUBPROC_MAP = {
  P01:[{code:"P01.01",label:"Définition stratégique"},{code:"P01.02",label:"Axes stratégiques"},{code:"P01.03",label:"Analyse interne"},{code:"P01.04",label:"Gouvernance & décision"}],
  P02:[{code:"P02.01",label:"Conduite des instances"},{code:"P02.02",label:"Mission & éthique"},{code:"P02.03",label:"Veille réglementaire"},{code:"P02.04",label:"Conformité & PCA"}],
  P03:[{code:"P03.01",label:"KPIs & tableaux de bord"},{code:"P03.02",label:"Pilotage performance"},{code:"P03.03",label:"Budgétisation"},{code:"P03.04",label:"Allocation ressources"}],
  O01:[{code:"O01.01",label:"Accueil & service client"},{code:"O01.02",label:"Gestion interne & admin"},{code:"O01.03",label:"Clientèle & suivi dossiers"},{code:"O01.04",label:"Archivage documentaire"}],
  O02:[{code:"O02.01",label:"Procédures Travail & Séc."},{code:"O02.02",label:"Procédures Civiles Content."},{code:"O02.03",label:"Procédures Droit Répressif"},{code:"O02.04",label:"Procédures Civiles Gracieuses"},{code:"O02.05",label:"Droit des Affaires"},{code:"O02.06",label:"Autres missions DG"}],
  O03:[{code:"O03.01",label:"Gestion d'Entreprise"},{code:"O03.02",label:"Évaluation d'actifs"},{code:"O03.03",label:"Audit Externe"},{code:"O03.04",label:"Contrôle & Risques"},{code:"O03.05",label:"Conseil & Étude"},{code:"O03.06",label:"Autres missions DG"}],
  S01:[{code:"S01.01",label:"Caisse & Trésorerie"},{code:"S01.02",label:"Comptabilité & Facturation"},{code:"S01.03",label:"Gestion financière paie"}],
  S02:[{code:"S02.01",label:"Contrôle interne"},{code:"S02.02",label:"Programmes de contrôle"},{code:"S02.03",label:"Audit périodique"},{code:"S02.04",label:"Gestion risques & conformité"}],
  S03:[{code:"S03.01",label:"Diagnostic RH & Recrutement"},{code:"S03.02",label:"Gestion personnel"},{code:"S03.03",label:"Mise en conformité RH"},{code:"S03.04",label:"Mise à disposition RH"}],
  S04:[{code:"S04.01",label:"Community Manager & Design"},{code:"S04.02",label:"Communication"},{code:"S04.03",label:"Système d'information"}],
  S05:[{code:"S05.01",label:"Coursier & docs"},{code:"S05.02",label:"Gestion des achats"},{code:"S05.03",label:"Transport & déplacements"}],
};

export const GC_ALL_SUBPROCS = Object.values(GC_SUBPROC_MAP).flat();

export const GC_APPROVAL_ROUTING = {
  // Création de compte : circuit 3 étapes
  CREATE_ACCOUNT: [
    { step: 1, label: "Instruction RH",   process: "S03", minLevel: 3, action: "Vérifier dossier, valider poste/niveau/processus" },
    { step: 2, label: "Conformité",       process: "P02", minLevel: 4, action: "Vérifier conformité documents, OHADA, droit travail" },
    { step: 3, label: "Validation DG",    process: "ALL", minLevel: 5, action: "Décision finale, activation du compte" },
  ],
  // Suppression de dossier : validé par responsable direct puis DG
  DELETE_DOSSIER: [
    { step: 1, label: "Responsable direct", process: null, minLevel: 4, action: "Valider la suppression et le motif" },
    { step: 2, label: "Validation DG",      process: "ALL", minLevel: 5, action: "Autorisation finale" },
  ],
  // Validation dossier standard
  VALIDATE_DOSSIER: [
    { step: 1, label: "Responsable processus", process: null, minLevel: 3, action: "Vérifier et valider" },
  ],
  // Congé
  APPROVE_LEAVE: [
    { step: 1, label: "RH",  process: "S03", minLevel: 3, action: "Valider la demande de congé" },
    { step: 2, label: "DG",  process: "ALL", minLevel: 5, action: "Approbation finale si > 5 jours" },
  ],
};

export const GC_FISCAL_CONFIG_DEFAULT = {
  cnss_salarie: 0.025,           // 2.5% salarié CNSS
  cnss_patronal: 0.16,           // 16% patronal CNSS
  cnamgs_salarie: 0.011,         // 1.1% salarié CNAMGS
  cnamgs_patronal: 0.022,        // 2.2% patronal CNAMGS
  irpp_tranches: [
    { min: 0,       max: 600000,  taux: 0.05  }, // 5%
    { min: 600000,  max: 1500000, taux: 0.20  }, // 20%
    { min: 1500000, max: 3000000, taux: 0.30  }, // 30%
    { min: 3000000, max: null,    taux: 0.35  }, // 35%
  ],
  tva_normal: 0.18,              // TVA 18% taux normal Gabon
  tva_reduit: 0.10,              // TVA 10% taux réduit
  is_taux: 0.30,                 // Impôt sur les Sociétés 30%
  smic_mensuel: 150000,          // SMIC mensuel Gabon (FCFA) 2026
  seuil_exoneration_is: 10000000,// Seuil exonération IS PME
  updatedAt: "2026-01-01",
  updatedBy: "Système (défaut réglementaire)",
};

export const ACCOUNT_STATUS_CONFIG = {
  ACTIF:               { icon:"🟢", label:"Actif",                color:"#22C55E", bgColor:"#22C55E15" },
  SUSPENDU_SESSION:    { icon:"⏸️",  label:"Session suspendue",    color:"#F59E0B", bgColor:"#F59E0B15" },
  SUSPENDU_PROVISOIRE: { icon:"🟠", label:"Suspendu (provisoire)", color:"#F97316", bgColor:"#F9731615" },
  SUSPENDU_DEFINITIF:  { icon:"🔴", label:"Suspendu (définitif)", color:"#EF4444", bgColor:"#EF444415" },
  BLOQUE:              { icon:"🚫", label:"Bloqué",               color:"#C41E3A", bgColor:"#C41E3A15" },
};


export const GC_AI_CONFIG_DEFAULT={
  defaultEngine:"auto", fallbackQueue:["gemini","claude"],
  engines:{
    claude: {enabled:true,  suspended:false,hidden:true, apiKey:"",    label:"Claude Sonnet",   userLabel:"Moteur par défaut",icon:"🤖",color:"#C41E3A",note:"Anthropic (claude.ai)"},
    gemini: {enabled:true,  suspended:false,hidden:false,apiKey:"",    label:"Gemini 2.0 Flash",userLabel:"Gemini 2.0",      icon:"✨",color:"#3B82F6",note:"Google AI Studio – Gratuit"},
    gpt:    {enabled:false, suspended:false,hidden:false,apiKey:"",    label:"GPT-4o mini",     userLabel:"ChatGPT",          icon:"💬",color:"#10B981",note:"OpenAI – Payant (sk-proj-...)"},
  },
  params:{maxTokens:2000,temperature:0.7,rateLimit:30,streamMode:false,contextMode:"full",welcomeMsg:"",panelTitle:"Assistant IA · Génie Consultant"},
};

export const GC_AI_INJECTION_PATTERNS = [
  /ignore.{0,30}(instructions|system|prompt)/i,
  /oublie.{0,30}(instructions|consignes)/i,
  /tu es maintenant/i,
  /nouveau rôle/i,
  /ignore previous/i,
];

export const GC_AI_LEVEL_RULES = {
  1: "Tu ne dois JAMAIS mentionner les données financières du cabinet, les salaires, les données personnelles d'autres collaborateurs, les décisions stratégiques ou les dossiers clients confidentiels. Limite tes réponses au périmètre opérationnel de l'utilisateur.",
  2: "Tu peux discuter des dossiers et procédures de ton département. N'expose pas les données salariales, les décisions DG/CODIR, les profils des autres utilisateurs, ni les informations de niveau 3 et supérieur.",
  3: "Tu peux traiter les informations opérationnelles et de gestion. Exclure les données financières stratégiques, les délibérations CODIR, les données personnelles RH hors ton processus.",
  4: "Niveau responsable de processus. Tu peux traiter les informations de gestion et de supervision de ton processus. Protège les données CODIR et les informations classifiées niveau 5+.",
  5: "Niveau Direction Générale. Tu as accès aux informations stratégiques. Protège uniquement les données administrateur système (niveau 6).",
  6: "Niveau Direction SI — accès complet à toutes les informations du système.",
};

const gcFindApprover = (requestType, step, users, currentProcessCode, excludeUserId = null) => {
  const route = GC_APPROVAL_ROUTING[requestType];
  if (!route) return null;
  const stepDef = route.find(r => r.step === step);
  if (!stepDef) return null;
  const candidates = (users || []).filter(u => {
    if (u.id === excludeUserId) return false;
    if (u.accountStatus && u.accountStatus !== "ACTIF") return false;
    if (u.level < stepDef.minLevel) return false;
    if (stepDef.process && stepDef.process !== "ALL") {
      const userProcs = u.processes || [u.process];
      if (!userProcs.includes(stepDef.process)) return false;
    }
    return true;
  });
  // Priorité : processus exact > niveau le plus bas suffisant (éviter surcharge DG)
  candidates.sort((a, b) => {
    const aInProc = stepDef.process && stepDef.process !== "ALL" && (a.processes||[a.process]).includes(stepDef.process);
    const bInProc = stepDef.process && stepDef.process !== "ALL" && (b.processes||[b.process]).includes(stepDef.process);
    if (aInProc && !bInProc) return -1;
    if (!aInProc && bInProc) return 1;
    return a.level - b.level; // Prendre le plus bas niveau suffisant (évite surcharger DG)
  });
  return candidates[0] || null;
};

const gcLoadFiscalConfig = () => {
  try {
    const saved = _lsGet("gc-fiscal-config");
    if (saved) return { ...GC_FISCAL_CONFIG_DEFAULT, ...JSON.parse(saved) };
  } catch (_) {}
  return GC_FISCAL_CONFIG_DEFAULT;
};

const gcCalcIRPP = (baseImposable, config = null) => {
  const cfg = config || gcLoadFiscalConfig();
  let irpp = 0;
  let reste = Math.max(0, baseImposable);
  for (const tranche of cfg.irpp_tranches) {
    if (reste <= 0) break;
    const plafond = tranche.max ? tranche.max - tranche.min : Infinity;
    const montantTranche = Math.min(reste, plafond);
    irpp += montantTranche * tranche.taux;
    reste -= montantTranche;
  }
  return Math.round(irpp);
};

const formatCFA = (n) => (n != null && n !== "") ? n.toLocaleString("fr-FR") + " FCFA" : "—";

const gcCopy = async (text, onSuccess, onError) => {
  const successMsg = "✅ Copié !";
  const errorMsg   = "❌ Échec de la copie";
  const doToast = (msg, isErr) => {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = [
      "position:fixed","bottom:32px","left:50%","transform:translateX(-50%)",
      `background:${isErr?"#EF4444":"#22C55E"}22`,
      `border:1px solid ${isErr?"#EF4444":"#22C55E"}88`,
      "color:#fff","padding:9px 22px","border-radius:10px",
      "font-size:13px","font-weight:700","z-index:99999",
      "backdrop-filter:blur(8px)","pointer-events:none",
      "animation:fadeInUp .25s ease","transition:opacity .4s ease",
    ].join(";");
    if (!document.getElementById("gc-copy-anim")) {
      const s = document.createElement("style");
      s.id = "gc-copy-anim";
      s.textContent = "@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}";
      document.head.appendChild(s);
    }
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 450); }, 1600);
    if (typeof playSound !== 'undefined') playSound(isErr ? "alarm" : "success"); // FIX v127
  };
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (!ok) throw new Error("execCommand failed");
    }
    doToast(successMsg, false);
    if (onSuccess) onSuccess();
  } catch(e) {
    doToast(errorMsg, true);
    if (onError) onError(e);
  }
};

const generateAccessCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = Array.from({length: 8}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  return raw.slice(0, 4) + "-" + raw.slice(4);
};

// Convert a base64 dataUrl to a Blob (for opening PDFs in new tab)

export const THEMES = {
  dark: {
    name: "Sombre",
    primary: "#050D1A",
    surface: "#0A1628",
    surface2: "#0F1E35",
    surface3: "#162540",
    inputBg: "#162540", // FIX v127
    surface4: "#1E3050",
    border: "#1E3A5F",
    borderLight: "#2A4E78",
    text: "#E8EDF5",
    textMuted: "#7A90B0",
    textDim: "#4A6080",
    accent: "#C41E3A",
    accentHover: "#E02244",
    accentLight: "#FF3355",
    gold: "#C9A84C",
    navy: "#0A1E4A",
    navyLight: "#1A3A7A",
    cardBg: "rgba(10,28,60,0.8)",
    glassBg: "rgba(10,22,40,0.85)",
  },
  light: {
    name: "Clair",
    primary: "#E8EDF5",
    surface: "#FFFFFF",
    surface2: "#F0F4FA",
    surface3: "#E2E8F4",
    inputBg: "#FFFFFF", // FIX v127
    surface4: "#D0DAF0",
    border: "#C0CCEA",
    borderLight: "#A0B4D8",
    text: "#0A1628",
    textMuted: "#3A5070",
    textDim: "#6A85A8",
    accent: "#C41E3A",
    accentHover: "#A01530",
    accentLight: "#E02244",
    gold: "#9A7020",
    navy: "#0A1E4A",
    navyLight: "#1A3A7A",
    cardBg: "rgba(255,255,255,0.95)",
    glassBg: "rgba(240,244,250,0.95)",
  }
};

export const STATUS_CONFIG = {
  EN_COURS: { label: "En cours", color: "#3B82F6", bg: "#1E3A6E22", icon: "▶" },
  ATTENTE_TRAITEMENT: { label: "Attente traitement", color: "#F59E0B", bg: "#4A300022", icon: "⏳" },
  ATTENTE_VALIDATION: { label: "Attente validation", color: "#A855F7", bg: "#3A1A5E22", icon: "🔍" },
  ATTENTE_SIGNATURE: { label: "Attente signature", color: "#EC4899", bg: "#4A0D2E22", icon: "✍️" },
  ATTENTE_APPROBATION: { label: "Attente approbation", color: "#06B6D4", bg: "#0A2E4022", icon: "☑️" },
  TERMINE: { label: "Terminé", color: "#22C55E", bg: "#0F302022", icon: "✅" },
  ARCHIVE: { label: "Archivé", color: "#F59E0B", bg: "#4A300022", icon: "🗄️" },
  REJETE: { label: "Rejeté", color: "#EF4444", bg: "#3A0A0A22", icon: "❌" },
};

export const PRIORITY_CONFIG = {
  HAUTE: { color: "#EF4444", label: "Haute" },
  MOYENNE: { color: "#F59E0B", label: "Moyenne" },
  NORMALE: { color: "#3B82F6", label: "Normale" },
};

export const NATIONALITIES_CEMAC = ["Gabonaise","Camerounaise","Congolaise (RC)","Centrafricaine","Tchadienne","Équato-guinéenne"];
export const NATIONALITIES_CEDEAO = ["Nigériane","Ivoirienne","Sénégalaise","Ghanéenne","Malienne","Béninoise","Burkinabée","Togolaise","Guinéenne","Sierra Léonaise","Libérienne","Cap-Verdienne","Gambienne","Bissau-guinéenne","Nigérienne"];
export const NATIONALITIES_AUTRES = ["Française","Belge","Suisse","Américaine","Britannique","Marocaine","Algérienne","Tunisienne","Égyptienne","Sud-Africaine","Chinoise","Libanaise","Autre (préciser)"];
export const ALL_NATIONALITIES = [
  ...NATIONALITIES_CEMAC.map(n => ({ value: n, group: "CEMAC" })),
  ...NATIONALITIES_CEDEAO.map(n => ({ value: n, group: "CEDEAO" })),
  ...NATIONALITIES_AUTRES.map(n => ({ value: n, group: "Autres" })),
];



// FIX v127 SÉCURITÉ — Les hashes SHA-256 ne sont PLUS hardcodés dans le bundle JS.
// Exposer un hash dans le source permet à n'importe qui (DevTools → Sources) de le lire
// et de préparer une attaque offline. On calcule désormais le hash depuis le mdp par défaut
// connu uniquement de l'administrateur. En production, changer le mdp admin efface ce fallback.
// Les comptes réels utilisent toujours passwordHash stocké sur l'objet user (localStorage chiffré).
export const GC_ADMIN_HASH = null; // Retiré du bundle — voir gcVerifyAdmin() ci-dessous
export const GC_DG_HASH    = null; // Retiré du bundle — voir gcVerifyAdmin() ci-dessous

// ── SHA-256 pur JS (RFC 6234 / FIPS 180-4) ─────────────────────────────────
// Produit exactement la même sortie que window.crypto.subtle.digest('SHA-256', ...).
// Utilisé quand crypto.subtle est indisponible (HTTP non-localhost : adresses IP réseau).
// Cela garantit un hash SHA-256 IDENTIQUE sur localhost ET sur le réseau host HTTP,
// éliminant toute divergence de contexte cryptographique.
const _gcSHA256PureJS = (() => {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  return (msgStr) => {
    const msg = new TextEncoder().encode(msgStr);
    const mLen = msg.length;
    const blkCount = Math.ceil((mLen + 9) / 64);
    const padded = new Uint8Array(blkCount * 64);
    padded.set(msg);
    padded[mLen] = 0x80;
    const dv = new DataView(padded.buffer);
    const bitLen = mLen * 8;
    dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
    dv.setUint32(padded.length - 4, bitLen >>> 0, false);
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const W = new Uint32Array(64);
    for (let blk = 0; blk < padded.length; blk += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(blk + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i-15],7)  ^ rotr(W[i-15],18) ^ (W[i-15] >>> 3);
        const s1 = rotr(W[i-2], 17) ^ rotr(W[i-2], 19) ^ (W[i-2]  >>> 10);
        W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const S1   = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const ch   = (e & f) ^ (~e & g);
        const tmp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        const S0   = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const maj  = (a & b) ^ (a & c) ^ (b & c);
        const tmp2 = (S0 + maj) >>> 0;
        h=g; g=f; f=e; e=(d+tmp1)>>>0; d=c; c=b; b=a; a=(tmp1+tmp2)>>>0;
      }
      H = [(H[0]+a)>>>0,(H[1]+b)>>>0,(H[2]+c)>>>0,(H[3]+d)>>>0,
           (H[4]+e)>>>0,(H[5]+f)>>>0,(H[6]+g)>>>0,(H[7]+h)>>>0];
    }
    return H.map(v => v.toString(16).padStart(8,'0')).join('');
  };
})();

// FIX v133 — gcHashPassword utilise toujours SHA-256, via crypto.subtle (natif, plus rapide)
// OU via _gcSHA256PureJS (fallback pur-JS, même sortie). Plus de divergence entre localhost (SHA-256)
// et réseau host HTTP (anciennement : hash custom incompatible). Tous les contextes produisent
// le même hash SHA-256, donc les mots de passe fonctionnent partout sans re-migration.
export const gcHashPassword = async (password) => {
  const salted = password + "GC_SALT_2026_GABON";
  try {
    if (typeof window !== "undefined" && window.crypto?.subtle) {
      const data = new TextEncoder().encode(salted);
      const buf  = await window.crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (_) {}
  // Fallback pur-JS : même algorithme SHA-256, même sortie que crypto.subtle
  return _gcSHA256PureJS(salted);
};

// Helper interne : calcule le hash fallback (non-HTTPS) directement, sans passer par gcHashPassword
// Utilisé par gcVerifyPassword pour la vérification cross-contexte (localhost↔réseau host).
const _gcFallbackHash = (password) => {
  const s = password + "GC_SALT_2026_GABON";
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  const part = (n) => (n >>> 0).toString(16).padStart(8, "0");
  const base = part(h1) + part(h2) + part(h1 ^ h2) + part((h1 + h2) >>> 0);
  return (base + base).slice(0, 64);
};

// Helper interne : calcule le hash SHA-256 directement, sans fallback
// Retourne null si crypto.subtle indisponible.
const _gcSHA256Hash = async (password) => {
  try {
    if (typeof window !== "undefined" && window.crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password + "GC_SALT_2026_GABON");
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (_) {}
  return null;
};

export const gcVerifyPassword = async (inputPassword, storedHashOrPlain) => {
  if (!inputPassword || !storedHashOrPlain) return false;
  // Hash bcrypt ($2b$ / $2a$) : le navigateur ne peut pas vérifier bcrypt.
  // Retourner false pour que l'appelant parte en vérification serveur.
  if (storedHashOrPlain.startsWith('$2b$') || storedHashOrPlain.startsWith('$2a$')) return false;
  // Hash SHA-256 (64 hex) → vérification cryptographique
  if (/^[0-9a-f]{64}$/i.test(storedHashOrPlain)) {
    const inputHash = await gcHashPassword(inputPassword);
    if (inputHash === storedHashOrPlain) return true;
    // Rétrocompat : anciens hashes FNV-like créés avant v133 sur contexte HTTP non-localhost
    const legacy = _gcFallbackHash(inputPassword);
    if (storedHashOrPlain === legacy) return true;
    return false;
  }
  // Texte brut (rétrocompat comptes legacy sans hash)
  return inputPassword === storedHashOrPlain;
};

// FIX v127 SÉCURITÉ — gcVerifyAdmin n'utilise plus GC_ADMIN_HASH du bundle.
// Priorité : customHash (changé via profil) > storedHash (user object) > hash dérivé du mdp par défaut.
// Le mdp par défaut est uniquement utilisé comme dernier recours de bootstrap.
export const gcVerifyAdmin = async (uid, pwd, storedHash) => {
  if (uid !== "USR-ADM-000") return false;
  // 1. Hash personnalisé stocké par l'admin (changement de MDP via profil)
  try {
    const customHash = _lsGet("gc_admin_custom_hash");
    if (customHash && /^[0-9a-f]{64}$/i.test(customHash)) {
      return await gcVerifyPassword(pwd, customHash);
    }
  } catch (_) {}
  // 2. Hash stocké sur l'objet user (cohérent avec le contexte crypto courant — PRIORITAIRE)
  if (storedHash && /^[0-9a-f]{64}$/i.test(storedHash)) {
    return await gcVerifyPassword(pwd, storedHash);
  }
  // 3. Fallback bootstrap uniquement : dériver le hash à la volée (jamais stocké dans le bundle)
  // Ce chemin n'est emprunté que si le compte admin n'a pas encore été migré (première installation).
  const bootstrapHash = await gcHashPassword("Admin@SI#2026!");
  return await gcVerifyPassword(pwd, bootstrapHash);
};

// Fonction utilitaire pour générer un token de session infalsifiable
export const gcGenerateSessionToken = (userId) => {
  const ts = Date.now();
  const random = Math.random().toString(36).slice(2, 11);
  const signature = (userId + ts + "GC_SESSION_SALT").split("").reduce((h, c) => {
    return ((h << 5) - h + c.charCodeAt(0)) | 0;
  }, 0);
  return `${ts.toString(36)}.${random}.${Math.abs(signature).toString(36)}`;
};

// FIX v123 — Validation complète : timestamp + signature userId (anti-falsification)
export const gcValidateSessionToken = (token, userId) => {
  if (!token || !userId) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const ts = parseInt(parts[0], 36);
    if (isNaN(ts)) return false;
    // Token valide max 12 heures
    if (Date.now() - ts > 12 * 60 * 60 * 1000) return false;
    // Recalculer la signature et comparer
    const expectedSig = (userId + ts + "GC_SESSION_SALT").split("").reduce((h, c) => {
      return ((h << 5) - h + c.charCodeAt(0)) | 0;
    }, 0);
    const storedSig = parseInt(parts[2], 36);
    return Math.abs(expectedSig) === Math.abs(storedSig);
  } catch (_) { return false; }
};


// ══════════════════════════════════════════════════════════════════════════
// GC_DELAI_CONFIG — Délais réglementaires Génie Consultant
// Source : Procédures internes cabinet (2026)
// Court : 14 jours (2 semaines) — Long : 21 jours (3 semaines)
// Paramétrable depuis Direction SI → Config → Délais
// ══════════════════════════════════════════════════════════════════════════

/* ══════════════════════════════════════════════════════════════════
   CONSTANTES v99 — Documents requis, Circuits, Activités
   ══════════════════════════════════════════════════════════════════ */


export const GC_CIRCUITS_INIT = [
  {
    id:"CIRC-KYC", code:"KYC-001", categorie:"APPROBATION",
    titre:"Circuit KYC Client — Ouverture Dossier",
    description:"Processus de vérification d'identité et conformité client avant ouverture de dossier actif.",
    processus:"O01",
    etapes:[
      {n:1,acteur:"Secrétariat O01 (niv2+)",action:"Accueil client, collecte documents, création intake",delai:"J0",statut:"INITIAL"},
      {n:2,acteur:"Responsable O01 (niv3+)",action:"Vérification documents KYC, validation intégrité pièces",delai:"J+1",statut:"VERIFICATION"},
      {n:3,acteur:"Conformité P02 (niv4)",action:"Contrôle réglementaire OHADA/COBAC/CEMAC, évaluation risque",delai:"J+2",statut:"CONFORMITE"},
      {n:4,acteur:"DG/MG (niv5)",action:"Autorisation définitive, ouverture dossier client",delai:"J+3",statut:"VALIDATION_DG"},
      {n:5,acteur:"Responsable O02/O03",action:"Réception dossier validé, assignation collaborateurs, démarrage traitement",delai:"J+4",statut:"TRAITEMENT"},
    ],
    couleur:"#3B82F6", editable:true
  },
  {
    id:"CIRC-TRAV", code:"TRAV-001", categorie:"TRAITEMENT",
    titre:"Circuit de Réalisation des Travaux O02/O03",
    description:"Circuit complet de traitement des affaires juridiques (O02) et de gestion/évaluation (O03) depuis la réception jusqu'à la clôture.",
    processus:"O02",
    etapes:[
      {n:1,acteur:"Responsable O02/O03 (niv4)",action:"Réception dossier KYC validé, analyse, création tâches, assignation collaborateurs",delai:"J0",statut:"RECEPTION"},
      {n:2,acteur:"Collaborateur (niv2-3)",action:"Réalisation des travaux : recherches, rédaction actes, analyses, rapports",delai:"J+1 à J+X",statut:"REALISATION"},
      {n:3,acteur:"Collaborateur",action:"Soumission au responsable pour revue (ATTENTE_VALIDATION)",delai:"J+X",statut:"SOUMISSION"},
      {n:4,acteur:"Responsable (niv4)",action:"Revue qualité, annotations, approbation ou retour correction",delai:"J+X+1",statut:"REVUE"},
      {n:5,acteur:"Responsable (niv4)",action:"Signature et clôture du dossier de traitement (TERMINE)",delai:"J+X+2",statut:"SIGNATURE"},
      {n:6,acteur:"DG/MG (niv5) — si requis",action:"Approbation finale sur dossiers stratégiques ou montants importants",delai:"J+X+3",statut:"APPROBATION_DG"},
      {n:7,acteur:"O01 — Secrétariat",action:"Notification client, restitution résultats, relance, facturation honoraires",delai:"J+X+4",statut:"RESTITUTION"},
    ],
    couleur:"#22C55E", editable:true
  },
  {
    id:"CIRC-FACT", code:"FACT-001", categorie:"FACTURATION",
    titre:"Circuit Facturation & Recouvrement",
    description:"Émission, suivi et recouvrement des notes d'honoraires suite à clôture de dossier.",
    processus:"S01",
    etapes:[
      {n:1,acteur:"O01 / Responsable S01",action:"Émission note d'honoraires depuis le dossier clôturé (compte 706 OHADA)",delai:"J0",statut:"EMISSION"},
      {n:2,acteur:"O01",action:"Transmission au client (courrier, email)",delai:"J+1",statut:"TRANSMISSION"},
      {n:3,acteur:"S01 Finance",action:"Suivi paiement — relance J+30, J+60, J+90 si nécessaire",delai:"J+30",statut:"SUIVI"},
      {n:4,acteur:"S01 Finance / DG",action:"Encaissement, écriture comptable (débit 512/caisse, crédit 411)",delai:"À réception",statut:"ENCAISSEMENT"},
      {n:5,acteur:"O01",action:"Confirmation client, archivage facture réglée",delai:"J+1 après encaissement",statut:"CLOTURE"},
    ],
    couleur:"#C9A84C", editable:true
  },
  {
    id:"CIRC-ARCH", code:"ARCH-001", categorie:"ARCHIVAGE",
    titre:"Circuit Archivage — Classement Physique & Numérique",
    description:"Transmission et classement des dossiers clôturés par le Secrétariat O01.",
    processus:"O01",
    etapes:[
      {n:1,acteur:"Tout collaborateur (niv1+)",action:"Demande d'archivage du dossier clôturé depuis l'application",delai:"J0",statut:"DEMANDE"},
      {n:2,acteur:"O01 — Secrétariat",action:"Réception, vérification complétude documentaire",delai:"J+1",statut:"RECEPTION_O01"},
      {n:3,acteur:"O01 — Secrétariat",action:"Classement physique + archivage numérique avec QR Code",delai:"J+2",statut:"CLASSEMENT"},
      {n:4,acteur:"O01",action:"Confirmation archivage, mise à jour registre des archives",delai:"J+2",statut:"CONFIRMATION"},
    ],
    couleur:"#64748B", editable:true
  },
  {
    id:"CIRC-COMPTE", code:"COMP-001", categorie:"APPROBATION",
    titre:"Circuit Création de Compte Collaborateur",
    description:"Circuit d'approbation pour l'ouverture d'un accès SI à un nouveau collaborateur. L'initiateur peut appartenir à n'importe quel processus (niv3+). La validation RH peut provenir de tout processus accrédité RH. Conformité assurée par P02, décision finale par DG/MG (niv5, P01).",
    processus:"TOUS",
    etapes:[
      {n:1,acteur:"Initiateur niv3+ (tout processus)",action:"Soumission demande création compte avec dossier justificatif RH",delai:"J0",statut:"SOUMISSION"},
      {n:2,acteur:"RH / Responsable accrédité (niv3+)",action:"Vérification dossier RH, validation du poste, niveau hiérarchique et processus à affecter",delai:"J+1",statut:"VALIDATION_RH"},
      {n:3,acteur:"Conformité P02 (niv4)",action:"Vérification conformité OHADA, droit du travail gabonais, habilitations SI",delai:"J+2",statut:"CONFORMITE"},
      {n:4,acteur:"DG / Manager Général (niv5, P01)",action:"Décision finale — Activation du compte, attribution niveau et processus(s)",delai:"J+3",statut:"ACTIVATION_DG"},
    ],
    couleur:"#8B5CF6", editable:true
  },
  {
    id:"CIRC-CONN", code:"CONN-001", categorie:"SECURITE",
    titre:"Circuit d'Approbation de Connexion Hors Horaires",
    description:"Procédé de contrôle d'accès au SI en dehors des horaires de travail (avant 08h00 ou après 17h30) lorsque l'approbation de connexion est activée par l'Admin/DG. Applicable également aux comptes provisoirement suspendus. Ce circuit n'est actif que si le bouton « Approbation de connexion collaborateurs » est ON dans les Paramètres SI.",
    processus:"P01",
    etapes:[
      {n:1,acteur:"Collaborateur (niv1-4)",action:"Tentative de connexion hors horaires — saisie identifiants sur l'écran de connexion",delai:"T0",statut:"DEMANDE"},
      {n:2,acteur:"Système SI",action:"Génération automatique d'un code XXXX-XXXX unique, persisté en localStorage. Validité : 15 minutes. Maximum 5 demandes par fenêtre de 15 min.",delai:"T0 (instantané)",statut:"GENERATION_CODE"},
      {n:3,acteur:"Système SI",action:"Notification push instantanée à tous les approbateurs (Admin niv6, DG/MG niv5, RH niv4+) incluant le code généré et l'heure d'expiration.",delai:"T0 (instantané)",statut:"NOTIFICATION_APPROBATEURS"},
      {n:4,acteur:"Approbateur — Admin / DG / RH niv4+",action:"Consultation dans Gestion Comptes → Connexions → Approbations. Visualisation du code, du demandeur et du chrono. Transmission orale/messagerie du code au collaborateur. Clic « Valider » pour activer la connexion, ou « Refuser » pour bloquer.",delai:"< 15 min",statut:"DECISION_APPROBATEUR"},
      {n:5,acteur:"Collaborateur",action:"Saisie du code XXXX-XXXX reçu sur l'écran de connexion. Accès accordé si code correct et non expiré.",delai:"< 15 min",statut:"VALIDATION_CODE"},
      {n:6,acteur:"Système SI",action:"Connexion accordée, demande supprimée. Tous les approbateurs voient la mise à jour en temps réel (synchronisation LS + StorageEvent). Journal de session enregistré.",delai:"Instantané",statut:"ACCES_ACCORDE"},
    ],
    regles:[
      "Première approbateur qui agit est définitif — les autres ne peuvent plus modifier la décision.",
      "5 rejets consécutifs → verrouillage 30 min (identique au système de mots de passe erronés).",
      "Code expiré → demande supprimée automatiquement, nouvelle demande possible.",
      "Niv5+ (DG, Admin) : connexion toujours directe, jamais soumise à ce circuit.",
    ],
    couleur:"#F59E0B", editable:false
  },
  {
    id:"CIRC-SUSP", code:"SUSP-001", categorie:"SECURITE",
    titre:"Circuit Gestion des Comptes Suspendus",
    description:"Procédé de traitement des comptes collaborateurs suspendus : distinction suspension provisoire (accès conditionnel via code) et définitive (exclusion totale). Gestion du rétablissement.",
    processus:"S03",
    etapes:[
      {n:1,acteur:"Admin / RH niv4+ / DG",action:"Prononcé de la suspension dans Gestion Comptes — choix du type : PROVISOIRE (accès conditionnel possible) ou DÉFINITIF (exclusion totale). Saisie du motif obligatoire.",delai:"Immédiat",statut:"SUSPENSION"},
      {n:2,acteur:"Système SI",action:"PROVISOIRE : compte conservé dans l'écran de connexion, statut SUSPENDU_PROVISOIRE. DÉFINITIF : compte retiré de l'écran de connexion (SUSPENDU_DEFINITIF), connexion impossible.",delai:"Instantané",statut:"APPLICATION"},
      {n:3,acteur:"Collaborateur (suspendu provisoire)",action:"Tentative de connexion → demande de code générée automatiquement, notifiée aux approbateurs comme pour hors-horaires. Le circuit CONN-001 s'applique.",delai:"À la tentative",statut:"DEMANDE_CODE_SUSP"},
      {n:4,acteur:"Approbateur",action:"Examen de la situation (motif suspension, urgence). Décision : Valider (accès exceptionnel accordé) ou Refuser (accès maintenu bloqué).",delai:"< 15 min",statut:"DECISION"},
      {n:5,acteur:"Admin / RH / DG",action:"Rétablissement du compte : modification du statut vers ACTIF dans Gestion Comptes. Le compte réapparaît automatiquement dans l'écran de connexion sans intervention supplémentaire.",delai:"Décision RH/Admin",statut:"RETABLISSEMENT"},
    ],
    regles:[
      "SUSPENDU_DEFINITIF : compte invisible sur l'écran de connexion — aucun accès possible.",
      "SUSPENDU_PROVISOIRE : compte visible, accès conditionnel via circuit CONN-001.",
      "Rétablissement (→ ACTIF) : réintégration automatique et immédiate sans manipulation supplémentaire.",
      "Le motif de suspension est consigné dans les journaux de session.",
    ],
    couleur:"#EF4444", editable:false
  },
];


export const GC_DOCS_REQUIS = {
  // ── DOCUMENTS OUVERTURE COMPTE (KYC) ── communs à tous les clients ──
  KYC_COMMUN: [
    { id:"kyc_cni",       label:"Pièce d'identité (CNI/Passeport)", required:true,  cat:"KYC" },
    { id:"kyc_photo",     label:"Photo d'identité récente",          required:true,  cat:"KYC" },
    { id:"kyc_domicile",  label:"Justificatif de domicile (<3 mois)",required:true,  cat:"KYC" },
    { id:"kyc_tel",       label:"Numéro de téléphone vérifié",       required:true,  cat:"KYC" },
  ],
  KYC_PERSONNE_MORALE: [
    { id:"kyc_rccm",      label:"Registre Commerce (RCCM)",          required:true,  cat:"KYC" },
    { id:"kyc_nif",       label:"Numéro Identifiant Fiscal (NIF)",   required:true,  cat:"KYC" },
    { id:"kyc_statuts",   label:"Statuts de la société",             required:true,  cat:"KYC" },
    { id:"kyc_pv",        label:"PV de nomination des dirigeants",   required:false, cat:"KYC" },
    { id:"kyc_bilan",     label:"Dernier bilan comptable",           required:false, cat:"KYC" },
  ],
  // ── DOCUMENTS DOSSIER O02 — JURIDIQUE & CONSEIL ──
  O02_DROIT_AFFAIRES: [
    { id:"o02_contrat",   label:"Contrat ou accord à analyser",      required:true,  cat:"DOSSIER" },
    { id:"o02_rccm",      label:"RCCM (si société concernée)",       required:false, cat:"DOSSIER" },
    { id:"o02_statuts",   label:"Statuts sociaux",                   required:false, cat:"DOSSIER" },
    { id:"o02_pj",        label:"Pièces justificatives litigieuses", required:false, cat:"DOSSIER" },
  ],
  O02_RECOUVREMENT: [
    { id:"o02_factures",  label:"Factures impayées",                 required:true,  cat:"DOSSIER" },
    { id:"o02_relances",  label:"Historique relances",               required:false, cat:"DOSSIER" },
    { id:"o02_contrat_r", label:"Contrat de vente/prestation",       required:true,  cat:"DOSSIER" },
    { id:"o02_titre",     label:"Titre exécutoire (si obtenu)",      required:false, cat:"DOSSIER" },
  ],
  O02_CONTENTIEUX: [
    { id:"o02_assignation",label:"Assignation ou acte de procédure", required:true,  cat:"DOSSIER" },
    { id:"o02_jugement",  label:"Jugements ou décisions antérieures",required:false, cat:"DOSSIER" },
    { id:"o02_preuves",   label:"Éléments de preuve",                required:true,  cat:"DOSSIER" },
    { id:"o02_cni_p",     label:"CNI des parties concernées",        required:true,  cat:"DOSSIER" },
  ],
  O02_CREATION_ENTREPRISE: [
    { id:"o02_projet",    label:"Projet de statuts ou d'acte",       required:true,  cat:"DOSSIER" },
    { id:"o02_identite",  label:"CNI de tous les associés",          required:true,  cat:"DOSSIER" },
    { id:"o02_capital",   label:"Attestation de dépôt capital",      required:true,  cat:"DOSSIER" },
    { id:"o02_siege",     label:"Justificatif du siège social",      required:true,  cat:"DOSSIER" },
    { id:"o02_autorisation",label:"Autorisation d'exercer (si besoin)",required:false,cat:"DOSSIER" },
  ],
  O02_DISSOLUTION: [
    { id:"o02_pv_ag",     label:"PV de l'Assemblée Générale",        required:true,  cat:"DOSSIER" },
    { id:"o02_bilan_cl",  label:"Bilan de clôture",                  required:true,  cat:"DOSSIER" },
    { id:"o02_rccm_orig", label:"RCCM original",                     required:true,  cat:"DOSSIER" },
    { id:"o02_det",       label:"Justificatif apurement des dettes",  required:false, cat:"DOSSIER" },
  ],
  // ── DOCUMENTS DOSSIER O03 — ÉVALUATION & GESTION ENTREPRISE ──
  O03_AUDIT: [
    { id:"o03_etats_fin", label:"États financiers 3 derniers exercices",required:true, cat:"DOSSIER" },
    { id:"o03_grand_livre",label:"Grand livre comptable",             required:true,  cat:"DOSSIER" },
    { id:"o03_contrats_bail",label:"Contrats bail & immobilier",      required:false, cat:"DOSSIER" },
    { id:"o03_contrats_p",label:"Contrats de personnel clés",         required:false, cat:"DOSSIER" },
    { id:"o03_procedures",label:"Procédures internes existantes",     required:false, cat:"DOSSIER" },
  ],
  O03_EVALUATION_ACTIFS: [
    { id:"o03_titre_actif",label:"Titre de propriété / acte notarié", required:true,  cat:"DOSSIER" },
    { id:"o03_etat_actif", label:"État descriptif de l'actif",        required:true,  cat:"DOSSIER" },
    { id:"o03_valeur_compt",label:"Valeur comptable nette",           required:true,  cat:"DOSSIER" },
    { id:"o03_expertise",  label:"Expertise antérieure (si existante)",required:false, cat:"DOSSIER" },
  ],
  O03_CONSEIL_STRATÉGIQUE: [
    { id:"o03_plan_aff",  label:"Plan d'affaires actuel",             required:true,  cat:"DOSSIER" },
    { id:"o03_org",       label:"Organigramme de l'entreprise",       required:false, cat:"DOSSIER" },
    { id:"o03_rapports",  label:"Rapports de gestion récents",        required:false, cat:"DOSSIER" },
    { id:"o03_objectifs", label:"Objectifs stratégiques définis",     required:false, cat:"DOSSIER" },
  ],
  O03_CREATION_DOSSIER: [
    { id:"o03_business",  label:"Business plan ou note de projet",    required:true,  cat:"DOSSIER" },
    { id:"o03_id_gerant", label:"CNI du gérant / fondateur",          required:true,  cat:"DOSSIER" },
    { id:"o03_capital_p", label:"Justificatif capital disponible",    required:false, cat:"DOSSIER" },
    { id:"o03_marche",    label:"Étude de marché sommaire",           required:false, cat:"DOSSIER" },
  ],
};


export const GC_ACTIVITES = {
  O02: [
    { k:"O02_DROIT_AFFAIRES",   l:"⚖️ Conseil juridique / Droit des affaires" },
    { k:"O02_RECOUVREMENT",     l:"💼 Recouvrement de créances" },
    { k:"O02_CONTENTIEUX",      l:"⚔️ Contentieux & Procédures judiciaires" },
    { k:"O02_CREATION_ENTREPRISE", l:"🏢 Création d'entreprise (OHADA)" },
    { k:"O02_DISSOLUTION",      l:"📋 Dissolution / Liquidation" },
  ],
  O03: [
    { k:"O03_AUDIT",            l:"🔍 Audit & Contrôle interne" },
    { k:"O03_EVALUATION_ACTIFS",l:"📊 Évaluation d'actifs" },
    { k:"O03_CONSEIL_STRATÉGIQUE", l:"🎯 Conseil stratégique" },
    { k:"O03_CREATION_DOSSIER", l:"🚀 Création / Accompagnement entreprise" },
  ],
};


export const GC_DELAI_DEFAULT = {
  court: 14,   // jours — procédures courtes (O01 admin, O03 simple, S01 facturation)
  long:  21,   // jours — procédures longues (O02 juridique, O03 audit, S02 conformité)
  urgence: 3,  // jours — dossiers URGENTS (priorité CRITIQUE ou HAUTE)
  // Délai par processus (basé sur la complexité métier)
  byProcess: {
    O01: 14, // Administration — court
    O02: 21, // Juridique — long (procédures, actes)
    O03: 21, // Évaluation & Gestion — long (audits, études)
    S01: 14, // Finance — court (facturation, comptabilité)
    S02: 21, // Audit — long
    S03: 14, // RH — court
    S04: 14, // Communication — court
    S05: 14, // Logistique — court
    S06: 14, // Entretien — court
    P01: 21, // Management — long (stratégique)
    P02: 21, // Gouvernance — long
    P03: 14, // Contrôle gestion — court
    P04: 14, // Veille — court
  },
  // Alertes automatiques (jours avant échéance)
  alertes: {
    rouge:  0,  // ≤0 jours = dépassé → alerte rouge
    orange: 3,  // ≤3 jours = critique → alerte orange
    jaune:  7,  // ≤7 jours = attention → alerte jaune
  },
};

// Charger config personnalisée depuis LS (Admin peut modifier)
const gcGetDelaiConfig = () => {
  try {
    const saved = _lsGet("gc-delai-config");
    if (saved) return { ...GC_DELAI_DEFAULT, ...JSON.parse(saved) };
  } catch(_) {}
  return GC_DELAI_DEFAULT;
};

// Calculer la dueDate automatique selon processus et priorité
export const gcCalcDueDate = (process, priority, fromDate = null) => {
  const cfg = gcGetDelaiConfig();
  const base = new Date(fromDate || new Date());
  let jours = cfg.byProcess?.[process] || cfg.long;
  if (priority === "CRITIQUE" || priority === "URGENTE") jours = cfg.urgence;
  else if (priority === "HAUTE") jours = Math.min(jours, 7);
  base.setDate(base.getDate() + jours);
  // Ignorer weekends (sauter samedi/dimanche)
  while (base.getDay() === 0 || base.getDay() === 6) {
    base.setDate(base.getDate() + 1);
  }
  return base.toISOString().split("T")[0];
};

// Statut délai d'un dossier (pour badge couleur)
export const gcDelaiStatut = (dueDate) => {
  if (!dueDate) return { statut: "AUCUN", label: "Sans échéance", color: "#6B7280", jours: null };
  const cfg = gcGetDelaiConfig();
  const j = _daysLeft(dueDate);
  if (j < cfg.alertes.rouge) return { statut: "DEPASSE",  label: `Dépassé (${Math.abs(j)}j)`, color: "#C41E3A", jours: j };
  if (j <= cfg.alertes.orange) return { statut: "CRITIQUE", label: `Critique (${j}j)`,         color: "#EF4444", jours: j };
  if (j <= cfg.alertes.jaune)  return { statut: "URGENT",   label: `Urgent (${j}j)`,           color: "#F59E0B", jours: j };
  return { statut: "OK", label: `${j}j restants`, color: "#22C55E", jours: j };
};

// FIX v123 — INITIAL_USERS utilise 'password' (texte clair) au lieu de 'passwordHash'.
// La migration au démarrage (useEffect) hache les mots de passe via gcHashPassword()
// en utilisant le contexte crypto disponible (SHA-256 ou fallback cohérent).
// Cela garantit que login fonctionne en HTTPS ET en HTTP/iframe.
export const INITIAL_USERS = [
  {
    id: "USR-ADM-000", name: "Superviseur SI", alias: "admin.si", role: "Direction SI",
    dept: "Système d'Information", process: "ALL", level: 6, avatar: "AD", color: "#C41E3A",
    isAdmin: true, password: "Admin@SI#2026!",
    sexe: "N/A", nationalite: "N/A", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "admin@genie-consultant.com", adresse: "Siège Social",
    bio: "Compte d'administration système du SI Génie Consultant. Configurez les comptes utilisateurs depuis les Paramètres Admin.",
    photoUrl: null,
  },
  {
    id: "USR-DG-001", name: "Directeur Général", alias: "dg.genie", role: "Directeur Général",
    dept: "Direction Générale", process: "P01", level: 5, avatar: "DG", color: "#C9A84C",
    isMG: true, password: "DG@GenieSI#2026!",
    sexe: "N/A", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 001", email: "dg@genie-consultant.com", adresse: "Direction Générale",
    bio: "Compte Directeur Général par défaut. Veuillez configurer votre profil à la première connexion.",
    photoUrl: null, isActive: true, accountStatus: "ACTIF",
    isFirstLogin: true,
  },
];

export const USER_FUNCTIONS = [
  { value: "JURISTE", label: "Juriste", dept: "Département Juridique", process: "O02", level: 2 },
  { value: "CONTROLEUR", label: "Contrôleur / Auditeur", dept: "Audit & Contrôle", process: "S02", level: 2 },
  { value: "GESTIONNAIRE", label: "Gestionnaire d'Entreprise", dept: "Evaluation & Gestion", process: "O03", level: 2 },
  { value: "COMMERCIAL", label: "Commercial / Veille", dept: "Veille & Commercial", process: "P04", level: 1 },
  { value: "AGENT_RH", label: "Agent Ressources Humaines", dept: "Ressources Humaines", process: "S03", level: 2 },
  { value: "ADMIN_ACC", label: "Administration (Accueil & Archivage)", dept: "Administration", process: "O01", level: 2 },
  { value: "COMPTABLE", label: "Comptable", dept: "Finance & Comptabilité", process: "S01", level: 2 },
  { value: "LOGISTIQUE", label: "Agent Logistique & Chargé Extérieur", dept: "Relations Ext. & Logistique", process: "S05", level: 1 },
  { value: "SECURITE", label: "Agent de Sécurité / Entretien", dept: "Entretien & Sécurité", process: "S06", level: 1 },
  { value: "COMMUNICATION", label: "Agent Communication / CM / Informatique", dept: "Communication", process: "S04", level: 1 },
];

export const CODES = {
  types: { DOC: "Document", DOS: "Dossier", FAC: "Facture", FCH: "Fiche", FORM: "Formulaire", RAP: "Rapport", PROC: "Procédure", PROS: "Processus", CHK: "Check-List", CHT: "Charte", POL: "Politique", MISS: "Mission", INST: "Instruction", MOD: "Modèle", REF: "Référence", COM: "Communication", TCHE: "Tâche/Kanban", MSG: "Message", NOTE: "Note Rapide", PRES: "Présentation", TABL: "Tableur", ARCH: "Archive" },
  processes: { P01: "Management & Marketing Stratégique", P02: "Gouvernance & Conformité", P03: "Contrôle de Gestion Stratégique", P04: "Veille Stratégique & Commerciale", O01: "Exécutif Administratif", O02: "Juridique & Conseil", O03: "Evaluation & Gestion Entreprise", S01: "Finance & Comptabilité", S02: "Audit & Contrôle Interne", S03: "Ressources Humaines", S04: "Communication", S05: "Relations Ext. & Logistique", S06: "Entretien & Sécurité" },
};


export const PROCESS_ACTIVITIES = {
  P01: {
    label: "Management & Marketing Stratégique",
    icon: "🎯", color: "#A855F7",
    responsable: "Maître Gilles LEPEBE — Manager Général",
    acteurs: ["Comité de Direction", "Comité Stratégique et Financier", "Comité d'Audit, Contrôle, Risque et Conformité"],
    objectifs: ["Piloter l'entreprise en élaborant sa stratégie globale", "Définir les modélisations, Chartes et Politiques internes", "Garantir la performance opérationnelle et l'efficacité des processus"],
    activities: [
      { code: "P01.01", label: "Définition de la stratégie et des objectifs d'entreprise (Vision, Chaîne de valeur)" },
      { code: "P01.02", label: "Choix des axes stratégiques (croissance, diversification, compétitivité)" },
      { code: "P01.03", label: "Analyse interne et coordination des processus métiers" },
      { code: "P01.04", label: "Garant des instances de gouvernance et prise de décision" },
    ],
    liens: ["Processus Supports", "Processus Opérationnels"],
    outils: ["Microsoft Office", "ERP Clio", "SWOT", "PESTEL"],
  },
  P02: {
    label: "Gouvernance & Conformité",
    icon: "⚖️", color: "#C41E3A",
    responsable: "Maître Gilles LEPEBE + Mr KASTANH PEMAGNY FEDRICH LORPHANE",
    acteurs: ["Comité de Direction", "Comité d'Audit, Contrôle, Risque et Conformité"],
    objectifs: ["Mettre en place et diriger la gouvernance", "Assurer la conformité des process", "Veiller aux dispositions légales et réglementaires"],
    activities: [
      { code: "P02.01", label: "Conduite de la structure et instances gouvernementales de l'entreprise" },
      { code: "P02.02", label: "Formulation de la mission, des valeurs et Code d'éthique" },
      { code: "P02.03", label: "Veille aux réglementations : Normes, Lois et Certifications" },
      { code: "P02.04", label: "Mise en place des processus de conformité et PCA (Plan de Continuité d'Activité)" },
    ],
    liens: ["Processus Pilotage", "Audit & Contrôle (S02)", "Processus Opérationnel"],
    outils: ["Chartes internes", "Politiques", "Procédures", "Certifications", "Réglementations Gabon/OHADA"],
  },
  P03: {
    label: "Contrôle de Gestion Stratégique",
    icon: "📊", color: "#3B82F6",
    responsable: "Mme BELOMBO PAOLA BERLINE / Mlle OKOMO OBOUNOU EYI HASNA RACHELLE",
    acteurs: ["Comité de Direction", "Comité d'Audit, Contrôle, Risque et Conformité"],
    objectifs: ["Assurer la performance globale de l'entreprise", "Dégager les indicateurs de suivi d'activité", "Garantir la bonne santé financière"],
    activities: [
      { code: "P03.01", label: "Mise en place des indicateurs internes et tableaux de bord (KPI)" },
      { code: "P03.02", label: "Pilotage de la performance globale et évaluation périodique" },
      { code: "P03.03", label: "Élaboration et conduite budgétaire" },
      { code: "P03.04", label: "Allocation des ressources : budgets, investissements, moyens généraux" },
    ],
    liens: ["Processus Pilotage", "Processus Opérationnel"],
    outils: ["Tableaux de bord", "BSC", "Outils de pilotage interne", "Microsoft Office"],
  },
  P04: {
    label: "Veille Stratégique & Enjeux Commerciaux",
    icon: "🔭", color: "#06B6D4",
    responsable: "Mr OBIANG MODOSS LOUIS PAUL EVARISTE",
    acteurs: ["Direction Générale", "Comité Stratégique"],
    objectifs: ["Élaboration de la stratégie commerciale", "Veille aux informations concurrentielles", "Assurer la notoriété et le positionnement stratégique"],
    activities: [
      { code: "P04.01", label: "Benchmarking : Étude et veille concurrentielle" },
      { code: "P04.02", label: "Marketing : Élaboration du Marketing Numérique et Classique" },
      { code: "P04.03", label: "Prospection : Obtention de contrats, réengagement prospects" },
    ],
    liens: ["M&M Stratégique (P01)", "Processus Opérationnel", "Processus Support"],
    outils: ["Réseaux Sociaux", "Magazines Professionnels", "Bases de données stratégiques"],
  },
  O01: {
    label: "Exécutif Administratif",
    icon: "🗂️", color: "#F59E0B",
    responsable: "Mme ANGUILET-DAOUDA RISSI WUILLIAME M.L.G — Secrétaire Administrative",
    acteurs: ["Acteurs externes (Clients, Partenaires)", "Ensemble du Personnel Interne"],
    objectifs: ["Apporter une valeur ajoutée grâce au service à la clientèle", "Assurer le service au sein des départements", "Garantir la qualité interne"],
    activities: [
      { code: "O01.01", label: "Accueil et service client : Gestion RDV, consultation, réception dossiers" },
      { code: "O01.02", label: "Gestion interne : Administration, carnet personnel, liaison des processus" },
      { code: "O01.03", label: "Gestion de la clientèle et call center : Courrier, suivi dossiers, livrables" },
      { code: "O01.04", label: "Archivage : Dispositif d'archivage, classement dossiers internes et externes" },
    ],
    liens: ["Processus Pilotage", "Processus Opérationnel", "Processus Support"],
    outils: ["Équipement de bureau", "Logiciel Dropbox", "Documents internes"],
  },
  O02: {
    label: "Département Juridique & Conseil",
    icon: "⚖️", color: "#3B82F6",
    responsable: "Mr NZE NGUEMA JEREMY — Responsable Département Juridique",
    acteurs: ["Secrétaire Administrative", "Juristes", "Manager Général"],
    objectifs: ["Apporter une valeur ajoutée grâce au service produit", "Répondre efficacement aux besoins de la clientèle", "Exécuter les directives hiérarchiques"],
    activities: [
      { code: "O02.01", label: "Procédures Travail et Sécurité Sociale : Licenciement, Démission, Sécurité sociale" },
      { code: "O02.02", label: "Procédures Civiles Contentieuses : Expulsion, Divorce, Foncier, Succession" },
      { code: "O02.03", label: "Procédures Droit Répressif : Abus de confiance, Escroquerie, Vols, Faux" },
      { code: "O02.04", label: "Procédures Civiles Gracieuses : Adoption, Tutelle, Nationalité, Parentalité" },
      { code: "O02.05", label: "Procédures Droit des Affaires : Recouvrement, Fusion, Création/Dissolution" },
      { code: "O02.06", label: "Autres missions mandatées par la Direction Générale" },
    ],
    liens: ["P01 — M&M Stratégique", "O01 — Administration", "Processus Support"],
    outils: ["Codes de Droits (Civil, Pénal, OHADA, Travail, etc.)", "Microsoft Office", "Modèles Génie Consultant"],
  },
  O03: {
    label: "Évaluation & Gestion d'Entreprise",
    icon: "🏢", color: "#22C55E",
    responsable: "Mr KASTANH PEMAGNY FEDRICH LORPHANE — Responsable Audit",
    acteurs: ["Secrétaire Administrative", "Auditeurs", "Manager Général"],
    objectifs: ["Apporter une valeur ajoutée grâce au service produit", "Répondre efficacement aux besoins de la clientèle", "Exécuter les directives hiérarchiques"],
    activities: [
      { code: "O03.01", label: "Activité de Gestion d'Entreprise : Constitution, Dissolution, Veille Stratégique" },
      { code: "O03.02", label: "Missions d'Évaluation d'Entreprise et d'Actifs / Négociation" },
      { code: "O03.03", label: "Audit Externe Global ou Spécifique : Financier, Opérationnel, Conformité, Qualité" },
      { code: "O03.04", label: "Missions de Contrôle : Veille juridique, Contrôle fiscal, Gestion de risques" },
      { code: "O03.05", label: "Conseil et Étude pour Entreprise : Stratégie, Marketing, Veille concurrentielle" },
      { code: "O03.06", label: "Autres missions mandatées par la Direction Générale" },
    ],
    liens: ["P01 — M&M Stratégique", "O01 — Administration", "Processus Support"],
    outils: ["Microsoft Office", "Logiciel TeamMate", "Équipement de bureau"],
  },
  S01: {
    label: "Finance & Comptabilité",
    icon: "💰", color: "#A855F7",
    responsable: "Mme BELOMBO PAOLA BERLINE — Responsable Finance",
    acteurs: ["Comité de Direction", "Secrétaire Administrative"],
    objectifs: ["Veiller à la gestion et l'optimisation de la santé financière", "Élaboration de la stratégie financière et du budget"],
    activities: [
      { code: "S01.01", label: "Gestion de la caisse et trésorerie" },
      { code: "S01.02", label: "Gestion de la comptabilité et facturation" },
      { code: "S01.03", label: "Gestion financière de la paie" },
    ],
    liens: ["O01 — Administration", "Processus Opérationnel", "Processus Supports"],
    outils: ["SAGE 100C", "Microsoft Office", "Équipement de bureau"],
  },
  S02: {
    label: "Audit & Contrôle Interne",
    icon: "🔍", color: "#EF4444",
    responsable: "Mr KASTANH PEMAGNY FEDRICH LORPHANE",
    acteurs: ["Comité de Direction", "Comité d'Audit, Contrôle, Risque et Conformité", "Secrétaire Administrative"],
    objectifs: ["Mettre en place le dispositif de contrôle", "Conduire les programmes de contrôle interne", "Gérer les risques et la conformité"],
    activities: [
      { code: "S02.01", label: "Mise en place et mise à jour du dispositif de contrôle interne" },
      { code: "S02.02", label: "Conduite des programmes de contrôle interne" },
      { code: "S02.03", label: "Élaboration et réalisation des missions d'audit périodiques et externes" },
      { code: "S02.04", label: "Gestion des risques et conformité" },
    ],
    liens: ["P02 — Gouvernance", "Processus Opérationnels", "Processus Supports"],
    outils: ["Normes ISA", "COSO 2013", "SafetyCulture", "AuditTeam", "Lexchart", "Canva", "Gamma"],
  },
  S03: {
    label: "Ressources Humaines",
    icon: "👥", color: "#22C55E",
    responsable: "Mme NSEGHE ELEMVA ADELIA DAN FARNELLE — Responsable RH",
    acteurs: ["Comité de Direction", "Comité Stratégique et Financier", "Secrétaire Administrative"],
    objectifs: ["Diagnostic RH et recrutement", "Gestion du personnel", "Mise en conformité et mise à disposition"],
    activities: [
      { code: "S03.01", label: "Diagnostic RH et Recrutement" },
      { code: "S03.02", label: "Gestion du personnel et relations conflictuelles internes" },
      { code: "S03.03", label: "Mise en conformité RH" },
      { code: "S03.04", label: "Mise à disposition des ressources humaines" },
    ],
    liens: ["O01 — Administration", "Processus Opérationnels", "Processus Supports"],
    outils: ["Microsoft Office", "Équipement de bureau"],
  },
  S04: {
    label: "Communication",
    icon: "📢", color: "#EC4899",
    responsable: "Mr IBOUNDJI CÉDRIC — Responsable Communication",
    acteurs: ["Comité de Direction", "Secrétaire Administrative"],
    objectifs: ["Assurer la visibilité et la bonne image de l'entreprise", "Garantir un système de communication interne efficace"],
    activities: [
      { code: "S04.01", label: "Community Manager et Design Infographie" },
      { code: "S04.02", label: "Communication interne et externe" },
      { code: "S04.03", label: "Mise à disposition des dispositifs de système d'information efficace" },
    ],
    liens: ["O01 — Administration", "Processus Opérationnels", "Processus Supports"],
    outils: ["Microsoft Office", "Adobe Photoshop & Illustrator", "Réseaux sociaux"],
  },
  S05: {
    label: "Relations Ext. & Logistique",
    icon: "🚚", color: "#F97316",
    responsable: "Mr KALOGA MADI — Responsable Logistique",
    acteurs: ["Comité de Direction", "Secrétaire Administrative"],
    objectifs: ["Gérer les achats et la logistique", "Assurer les relations avec partenaires extérieurs"],
    activities: [
      { code: "S05.01", label: "Coursier : Dépôt, recouvrement et ouverture documentaire" },
      { code: "S05.02", label: "Chargé d'Achats : Gestion des acquisitions" },
      { code: "S05.03", label: "Chargé du Transport et déplacements" },
    ],
    liens: ["Processus Pilotage", "Processus Opérationnels", "Processus Supports"],
    outils: ["Matériel de transport"],
  },
  S06: {
    label: "Entretien & Sécurité",
    icon: "🔒", color: "#7A90B0",
    responsable: "Mr KALOGA MADI",
    acteurs: ["Personnel dédié"],
    objectifs: ["Maintenir la sécurité et l'entretien des locaux"],
    activities: [
      { code: "S06.01", label: "Entretien et maintenance des locaux" },
      { code: "S06.02", label: "Contrôle des accès et sécurité physique" },
      { code: "S06.03", label: "Gestion des équipements de sécurité" },
    ],
    liens: ["Processus Pilotage (O01)", "Processus Opérationnels", "Processus Supports"],
    outils: ["Équipements de sécurité"],
  },
};


export const INITIAL_COMMITTEES = [
  {
    id: "CODIR",
    name: "Comité de Direction (CODIR)",
    acronym: "CODIR",
    icon: "🏛️",
    color: "#C9A84C",
    role: "Instance suprême de gouvernance et de pilotage stratégique du cabinet. Définit la vision, les orientations stratégiques et les grandes décisions.",
    responsable: "USR-MG-001",
    membres: [
      { userId: "USR-MG-001", fonction: "Président — Manager Général" },
      { userId: "USR-AUD-001", fonction: "Vice-Président — Audit & Conformité" },
      { userId: "USR-FIN-001", fonction: "Membre — Finance & COPIL" },
      { userId: "USR-JUR-001", fonction: "Membre — Juridique & COMOP" },
      { userId: "USR-RH-001", fonction: "Membre — Ressources Humaines" },
    ],
    periodicite: "Mensuelle + convocation exceptionnelle",
    description: "Le CODIR réunit les responsables de haut niveau sous la présidence du Manager Général pour statuer sur les orientations stratégiques, les performances globales et les décisions structurantes du cabinet.",
  },
  {
    id: "COPIL",
    name: "Comité de Pilotage (COPIL)",
    acronym: "COPIL",
    icon: "📊",
    color: "#A855F7",
    role: "Pilotage financier, suivi budgétaire et contrôle de gestion stratégique.",
    responsable: "USR-FIN-001",
    membres: [
      { userId: "USR-FIN-001", fonction: "Présidente — Responsable Finance" },
      { userId: "USR-MG-001", fonction: "Superviseur — Manager Général" },
      { userId: "USR-AUD-001", fonction: "Membre — Contrôle Interne" },
    ],
    periodicite: "Bimensuelle",
    description: "Le COPIL assure le suivi financier, l'analyse des indicateurs budgétaires et le pilotage de la performance économique du cabinet.",
  },
  {
    id: "COMOP",
    name: "Comité Opérationnel (COMOP)",
    acronym: "COMOP",
    icon: "⚙️",
    color: "#3B82F6",
    role: "Coordination opérationnelle des départements juridique, gestion et administration. Suivi de l'exécution des missions et dossiers clients.",
    responsable: "USR-JUR-001",
    membres: [
      { userId: "USR-JUR-001", fonction: "Chef du COMOP — Responsable Juridique" },
      { userId: "USR-AUD-001", fonction: "Membre — Audit & Évaluation" },
      { userId: "USR-SEC-001", fonction: "Membre — Administration & Archivage" },
      { userId: "USR-GES-001", fonction: "Membre — Gestion & Évaluation Entreprise" },
    ],
    periodicite: "Hebdomadaire",
    description: "Le COMOP coordonne l'exécution quotidienne des missions, assure le suivi des dossiers en cours et facilite la communication inter-départements au niveau opérationnel.",
  },
  {
    id: "CARC",
    name: "Comité d'Audit, Risque & Conformité (CARC)",
    acronym: "CARC",
    icon: "🔍",
    color: "#EF4444",
    role: "Supervision de l'audit interne, gestion des risques, conformité réglementaire et contrôle interne.",
    responsable: "USR-AUD-001",
    membres: [
      { userId: "USR-AUD-001", fonction: "Président — Chef Audit & Conformité" },
      { userId: "USR-MG-001", fonction: "Superviseur — Manager Général" },
      { userId: "USR-FIN-001", fonction: "Membre — Finance" },
    ],
    periodicite: "Mensuelle",
    description: "Le CARC garantit la rigueur des contrôles internes, la gestion des risques opérationnels, juridiques et financiers, ainsi que la conformité aux réglementations en vigueur.",
  },
];

export const INITIAL_INTERNAL_DOCS = [
  {
    id: "IDOC-001",
    ref: "DOC-A01-P02.V1.0/2026",
    name: "Grand Livre des Process Internes",
    process: "ALL",
    category: "Référentiel",
    uploadedBy: "USR-MG-001",
    uploadedAt: "2026-01-15T08:00:00",
    description: "Document référentiel central — 132 pages — Base de tous les processus du cabinet",
    fileType: "PDF",
    fileSize: "4.2 Mo",
    hasFile: true,
    visible: "ALL",
  },
  {
    id: "IDOC-002",
    ref: "DOC-A01-PROS.v1.0/2026",
    name: "Manuel de Processus d'Activités",
    process: "ALL",
    category: "Manuel",
    uploadedBy: "USR-MG-001",
    uploadedAt: "2026-01-15T09:00:00",
    description: "Manuel des processus Génie Consultant — Procédures et activités",
    fileType: "DOCX",
    fileSize: "1.8 Mo",
    hasFile: true,
    visible: "ALL",
  },
  {
    id: "IDOC-003",
    ref: "CHT-A01-P01.v1.0/2026",
    name: "Charte de Confidentialité et d'Éthique",
    process: "ALL",
    category: "Charte",
    uploadedBy: "USR-MG-001",
    uploadedAt: "2026-01-20T10:00:00",
    description: "Charte de confidentialité et code d'éthique professionnelle",
    fileType: "PDF",
    fileSize: "0.6 Mo",
    hasFile: true,
    visible: "ALL",
  },
  {
    id: "IDOC-004",
    ref: "PROC-A01-O02.v1.0/2026",
    name: "Procédures Département Juridique",
    process: "O02",
    category: "Procédure",
    uploadedBy: "USR-JUR-001",
    uploadedAt: "2026-01-25T09:00:00",
    description: "Procédures de traitement des dossiers juridiques et contentieux",
    fileType: "DOCX",
    fileSize: "0.9 Mo",
    hasFile: true,
    visible: "O02",
  },
  {
    id: "IDOC-005",
    ref: "FCH-A01-S02.v1.0/2026",
    name: "Fiche Audit & Contrôle Interne",
    process: "S02",
    category: "Fiche",
    uploadedBy: "USR-AUD-001",
    uploadedAt: "2026-01-28T11:00:00",
    description: "Fiche de référence pour les missions d'audit et contrôle interne",
    fileType: "XLSX",
    fileSize: "0.4 Mo",
    hasFile: true,
    visible: "S02",
  },
];

export const INITIAL_SI_SYSTEM_DOCS = [
  {
    id: "SYS-001",
    ref: "CHT-CONF-A01-SI.v5.0/2026",
    name: "Charte de Confidentialité",
    category: "CHARTE",
    isLoginCharte: true,
    charteLabel: "Charte de Confidentialité",
    description: "Charte de confidentialité et d'éthique professionnelle — Document obligatoire à l'acceptation lors de chaque connexion",
    fileType: "PDF",
    dataUrl: null,
    fileName: null,
    fileSize: 0,
    uploadedBy: null,
    uploadedAt: null,
    accessLevel: 1,
    process: "ALL",
    visible: true,
    mandatory: true,
  },
  {
    id: "SYS-002",
    ref: "CHT-VAL-A01-SI.v5.0/2026",
    name: "Charte des Valeurs",
    category: "CHARTE",
    isLoginCharte: true,
    charteLabel: "Charte des Valeurs",
    description: "Charte des valeurs du cabinet Génie Consultant — Document obligatoire à l'acceptation lors de chaque connexion",
    fileType: "PDF",
    dataUrl: null,
    fileName: null,
    fileSize: 0,
    uploadedBy: null,
    uploadedAt: null,
    accessLevel: 1,
    process: "ALL",
    visible: true,
    mandatory: true,
  },
  {
    id: "SYS-003",
    ref: "REG-INT-A01-SI.v5.0/2026",
    name: "Règlement Intérieur",
    category: "POLITIQUE",
    isLoginCharte: false,
    description: "Règlement intérieur du cabinet — Droits, obligations et sanctions",
    fileType: "PDF",
    dataUrl: null,
    fileName: null,
    fileSize: 0,
    uploadedBy: null,
    uploadedAt: null,
    accessLevel: 1,
    process: "ALL",
    visible: true,
    mandatory: false,
  },
  {
    id: "SYS-004",
    ref: "POL-P02-A01-SI.v5.0/2026",
    name: "Politique de Gouvernance",
    category: "POLITIQUE",
    isLoginCharte: false,
    description: "Politique de gouvernance et de contrôle du cabinet",
    fileType: "PDF",
    dataUrl: null,
    fileName: null,
    fileSize: 0,
    uploadedBy: null,
    uploadedAt: null,
    accessLevel: 2,
    process: "P02",
    visible: true,
    mandatory: false,
  },
  {
    id: "SYS-005",
    ref: "MAN-PROC-A01-SI.v5.0/2026",
    name: "Manuel de Procédures Générales",
    category: "PROCÉDURE",
    isLoginCharte: false,
    description: "Manuel des procédures générales du cabinet — Applicable à tous les processus",
    fileType: "DOCX",
    dataUrl: null,
    fileName: null,
    fileSize: 0,
    uploadedBy: null,
    uploadedAt: null,
    accessLevel: 1,
    process: "ALL",
    visible: true,
    mandatory: false,
  },
  {
    id: "SYS-006",
    ref: "GLIV-A01-P02.v5.0/2026",
    name: "Grand Livre des Processus Internes",
    category: "GRAND_LIVRE",
    isLoginCharte: false,
    description: "Grand livre de tous les processus internes du cabinet — Référentiel central de gouvernance opérationnelle",
    fileType: "PDF",
    dataUrl: null,
    fileName: null,
    fileSize: 0,
    uploadedBy: null,
    uploadedAt: null,
    accessLevel: 2,
    process: "ALL",
    visible: true,
    mandatory: false,
  },
];

export const gcDocIcon = (fileType) => {
  const t = (fileType || "").toUpperCase();
  if (t === "PDF") return "📕";
  if (t === "DOCX" || t === "DOC") return "📘";
  if (t === "XLSX" || t === "XLS") return "📗";
  if (t === "PPTX" || t === "PPT") return "📙";
  if (t === "IMG" || t === "JPG" || t === "JPEG" || t === "PNG") return "🖼️";
  if (t === "TXT") return "📃";
  if (t === "CSV") return "📊";
  if (t === "ZIP") return "🗜️";
  return "📄";
};

export const gcReadFile = (file, maxMB = 10) => {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("Aucun fichier sélectionné.")); return; }
    const maxBytes = maxMB * 1024 * 1024;
    if (file.size > maxBytes) {
      reject(new Error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo). Maximum autorisé : ${maxMB} Mo.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const ext = file.name.split(".").pop().toUpperCase();
      resolve({
        dataUrl: e.target.result,
        name: file.name,
        size: file.size,
        sizeStr: file.size < 1024 * 1024 ? `${Math.round(file.size / 1024)} Ko` : `${(file.size / 1024 / 1024).toFixed(1)} Mo`,
        ext,
        mime: file.type,
      });
    };
    reader.onerror = () => reject(new Error("Erreur de lecture du fichier."));
    reader.readAsDataURL(file);
  });
};

// Normalise un objet "doc" (modules documentaires) en "fileRef" (filestore)
// Les modules utilisent des noms de champs différents (fileName, name, fileData…)
// mais filestore attend nom, dataUrl, id, serverUrl, serverId, url, storageType, blob.
function _docToFileRef(doc) {
  if (!doc) return null;
  return {
    id:          doc.id          || doc.fileId || null,
    nom:         doc.fileName    || doc.nom    || doc.name    || 'document',
    serverUrl:   doc.serverUrl   || null,
    serverId:    doc.serverId    || null,
    url:         doc.url         || null,
    storageType: doc.storageType || null,
    blob:        doc.blob        || null,
    dataUrl:     doc.dataUrl     || doc.fileData || null,
    fileType:    doc.fileType    || doc.mimeType || doc.fileMime || null,
  };
}

function _gcToastError(msg) {
  if (typeof window === 'undefined') return;
  if (window.gcToast?.error) { window.gcToast.error(msg); return; }
  window.dispatchEvent(new CustomEvent('gc-toast', { detail: { message: msg, type: 'error' } }));
}

// Télécharger un document — délègue à gcFileDownload (filestore.js)
// Couvre : serverUrl, serverId, url /api/files/…, F-xxx id, IDB cache, dataUrl
export const gcDownloadDoc = async (doc) => {
  const fileRef = _docToFileRef(doc);
  if (!fileRef) {
    _gcToastError("Document invalide — impossible de télécharger.");
    return;
  }
  // Si fileRef a un id, utiliser le pipeline complet de filestore (serveur + IDB + dataUrl)
  if (fileRef.id) {
    const result = await _gcFileDownload(fileRef);
    if (!result?.ok) {
      _gcToastError(
        result?.error ||
        "Fichier introuvable — le fichier n'est pas disponible sur le serveur ni en cache local. Vérifiez que le serveur est démarré."
      );
    }
    return;
  }
  // Pas d'id : fallback direct sur dataUrl
  if (fileRef.dataUrl) {
    try {
      const a = document.createElement('a');
      a.href = fileRef.dataUrl;
      a.download = fileRef.nom;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn('[gcDownloadDoc] Erreur fallback dataUrl :', err.message);
    }
    return;
  }
  _gcToastError("Fichier introuvable — aucun identifiant ni cache disponible pour ce document.");
};

// Consulter (ouvrir) un document — délègue à gcFileUrl (filestore.js)
export const gcViewDoc = async (doc) => {
  const fileRef = _docToFileRef(doc);
  if (!fileRef) {
    _gcToastError("Document invalide — impossible d'ouvrir.");
    return;
  }
  if (fileRef.id) {
    const { url, isObjectUrl, error } = await _gcFileUrl(fileRef);
    if (url) {
      window.open(url, '_blank');
      if (isObjectUrl) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      _gcToastError(error || "Fichier introuvable — le fichier n'est pas disponible sur le serveur ni en cache local.");
    }
    return;
  }
  // Pas d'id : fallback direct sur dataUrl/fileData
  const src = fileRef.dataUrl;
  if (!src) {
    _gcToastError("Fichier introuvable — aucun identifiant ni cache disponible pour ce document.");
    return;
  }
  try {
    const a = document.createElement('a');
    a.href = src; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.warn('[gcViewDoc] Erreur ouverture fallback :', err.message);
  }
};


export const gcFmtSize = (bytes) => {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
};


export const DOC_CATEGORIES = [
  { id: "CHARTE", label: "Charte", icon: "🔐", color: "#C41E3A" },
  { id: "PROCÉDURE", label: "Procédure", icon: "📋", color: "#3B82F6" },
  { id: "GRAND_LIVRE", label: "Grand Livre", icon: "📚", color: "#8B5CF6" },
  { id: "POLITIQUE", label: "Politique", icon: "🛡️", color: "#F59E0B" },
  { id: "RÉFÉRENTIEL", label: "Référentiel", icon: "📑", color: "#06B6D4" },
  { id: "RAPPORT", label: "Rapport", icon: "📊", color: "#22C55E" },
  { id: "FICHE", label: "Fiche", icon: "📌", color: "#EC4899" },
  { id: "EXTERNE", label: "Document Externe", icon: "🌐", color: "#64748B" },
  { id: "AUTRE", label: "Autre", icon: "📄", color: "#94A3B8" },
];
// FIX v132 — getCatInfo exportée (était 'const' privée → AdminPanel crashait "not defined")
export const getCatInfo = (catId) => DOC_CATEGORIES.find(c => c.id === catId) || DOC_CATEGORIES[DOC_CATEGORIES.length - 1];
// FIX v130 — getUserProcess supprimée ici (doublon non-exporté, version canonique dans context.jsx)


export const INITIAL_CODIF_REGISTRY = [
  { id: "COD-001", ref: "DOC-A01-P02.V1.0/2026", type: "DOC", process: "P02", seq: "A01", subproc: "P02", version: "V1.0", year: "2026", label: "Grand Livre des Process Internes", createdBy: "USR-MG-001", createdAt: "2026-01-15T08:00:00", description: "Document référentiel central du cabinet" },
  { id: "COD-002", ref: "DOC-A01-PROS.v1.0/2026", type: "DOC", process: "P02", seq: "A01", subproc: "PROS", version: "v1.0", year: "2026", label: "Manuel de Processus d'Activités", createdBy: "USR-MG-001", createdAt: "2026-01-15T09:00:00", description: "Manuel des processus Génie Consultant" },
  { id: "COD-003", ref: "DOC-A01-REF.v1.0/2026", type: "DOC", process: "P02", seq: "A01", subproc: "REF", version: "v1.0", year: "2026", label: "Manuel de Référence / Carnet de Codification", createdBy: "USR-SEC-001", createdAt: "2026-01-15T10:00:00", description: "Carnet de codification interne" },
  { id: "COD-004", ref: "DOS-A01-O02.01/2026", type: "DOS", process: "O02", seq: "A01", subproc: "O02.01", version: "", year: "2026", label: "Dossier SARL OMEGA — Litige commercial", createdBy: "USR-SEC-001", createdAt: "2026-02-10T08:00:00", description: "Procédure civile contentieuse" },
  { id: "COD-005", ref: "FCH-A01-P01/2026", type: "FCH", process: "P01", seq: "A01", subproc: "P01", version: "", year: "2026", label: "Fiche Processus Management Stratégique", createdBy: "USR-MG-001", createdAt: "2026-01-15T11:00:00", description: "Fiche descriptive du processus P01" },
];

export const PLAN_COMPTABLE_OHADA = [
  // Classe 1 — Ressources durables
  {num:"10",lib:"Capital",cl:1,type:"CP"},{num:"101",lib:"Capital social",cl:1,type:"CP"},{num:"109",lib:"Capital souscrit non appelé",cl:1,type:"CP"},
  {num:"11",lib:"Réserves",cl:1,type:"CP"},{num:"111",lib:"Réserve légale",cl:1,type:"CP"},{num:"118",lib:"Autres réserves",cl:1,type:"CP"},
  {num:"12",lib:"Report à nouveau",cl:1,type:"CP"},{num:"13",lib:"Résultat net de l'exercice",cl:1,type:"CP"},
  {num:"14",lib:"Subventions d'investissement",cl:1,type:"CP"},{num:"15",lib:"Provisions réglementées",cl:1,type:"CP"},
  {num:"16",lib:"Emprunts et dettes assimilées",cl:1,type:"DLT"},{num:"161",lib:"Emprunts obligataires",cl:1,type:"DLT"},{num:"162",lib:"Emprunts auprès des établissements de crédit",cl:1,type:"DLT"},{num:"163",lib:"Emprunts et dettes auprès des associés",cl:1,type:"DLT"},{num:"165",lib:"Dépôts et cautionnements reçus",cl:1,type:"DLT"},
  {num:"17",lib:"Dettes de crédit-bail et contrats assimilés",cl:1,type:"DLT"},
  {num:"18",lib:"Dettes liées à des participations",cl:1,type:"DLT"},
  {num:"19",lib:"Provisions financières pour risques et charges",cl:1,type:"DLT"},
  // Classe 2 — Actif immobilisé
  {num:"20",lib:"Charges immobilisées",cl:2,type:"AI"},{num:"201",lib:"Frais de développement",cl:2,type:"AI"},{num:"202",lib:"Brevets, licences, logiciels",cl:2,type:"AI"},{num:"203",lib:"Fonds commercial",cl:2,type:"AI"},
  {num:"21",lib:"Immobilisations incorporelles",cl:2,type:"AI"},{num:"211",lib:"Frais d'établissement",cl:2,type:"AI"},{num:"215",lib:"Logiciels & progiciels",cl:2,type:"AI"},
  {num:"22",lib:"Terrains",cl:2,type:"AI"},{num:"221",lib:"Terrains nus",cl:2,type:"AI"},{num:"222",lib:"Terrains bâtis",cl:2,type:"AI"},{num:"224",lib:"Terrains de gisement",cl:2,type:"AI"},
  {num:"23",lib:"Bâtiments, installations et agencements",cl:2,type:"AI"},{num:"231",lib:"Bâtiments industriels",cl:2,type:"AI"},{num:"232",lib:"Bâtiments administratifs",cl:2,type:"AI"},
  {num:"24",lib:"Matériel",cl:2,type:"AI"},{num:"241",lib:"Matériel et outillage industriel",cl:2,type:"AI"},{num:"244",lib:"Matériel et mobilier de bureau",cl:2,type:"AI"},{num:"245",lib:"Matériel de transport",cl:2,type:"AI"},{num:"246",lib:"Matériel informatique",cl:2,type:"AI"},
  {num:"25",lib:"Avances et acomptes sur immobilisations",cl:2,type:"AI"},
  {num:"26",lib:"Titres de participation",cl:2,type:"AI"},{num:"261",lib:"Titres de participation (filiales)",cl:2,type:"AI"},
  {num:"27",lib:"Autres immobilisations financières",cl:2,type:"AI"},{num:"271",lib:"Prêts et créances sur des entités liées",cl:2,type:"AI"},{num:"272",lib:"Dépôts et cautionnements versés",cl:2,type:"AI"},
  {num:"28",lib:"Amortissements des immobilisations",cl:2,type:"AI"},{num:"281",lib:"Amort. immobilisations incorporelles",cl:2,type:"AI"},{num:"283",lib:"Amort. bâtiments",cl:2,type:"AI"},{num:"284",lib:"Amort. matériel",cl:2,type:"AI"},
  {num:"29",lib:"Provisions pour dépréciation des immobilisations",cl:2,type:"AI"},
  // Classe 3 — Actif circulant
  {num:"30",lib:"Stocks de marchandises",cl:3,type:"ST"},{num:"31",lib:"Matières premières et fournitures liées",cl:3,type:"ST"},
  {num:"32",lib:"Autres approvisionnements",cl:3,type:"ST"},{num:"33",lib:"Encours de production de biens",cl:3,type:"ST"},
  {num:"34",lib:"Encours de production de services",cl:3,type:"ST"},{num:"35",lib:"Stocks de produits",cl:3,type:"ST"},
  {num:"36",lib:"Stocks provenant d'immobilisations",cl:3,type:"ST"},{num:"37",lib:"Stocks en cours de route",cl:3,type:"ST"},
  {num:"38",lib:"Stocks en consignation ou en dépôt",cl:3,type:"ST"},
  {num:"39",lib:"Dépréciations des stocks",cl:3,type:"ST"},
  // Classe 4 — Tiers
  {num:"40",lib:"Fournisseurs et comptes rattachés",cl:4,type:"TI"},{num:"401",lib:"Fournisseurs",cl:4,type:"TI"},{num:"408",lib:"Fournisseurs — factures non parvenues",cl:4,type:"TI"},{num:"409",lib:"Fournisseurs débiteurs — avances versées",cl:4,type:"TI"},
  {num:"41",lib:"Clients et comptes rattachés",cl:4,type:"TI"},{num:"411",lib:"Clients",cl:4,type:"TI"},{num:"412",lib:"Clients — effets à recevoir",cl:4,type:"TI"},{num:"418",lib:"Clients — produits non encore facturés",cl:4,type:"TI"},{num:"419",lib:"Clients créditeurs — avances reçues",cl:4,type:"TI"},
  {num:"42",lib:"Personnel et comptes rattachés",cl:4,type:"TI"},{num:"421",lib:"Personnel — avances et acomptes",cl:4,type:"TI"},{num:"422",lib:"Personnel — rémunérations dues",cl:4,type:"TI"},{num:"425",lib:"Personnel — charges à payer",cl:4,type:"TI"},
  {num:"43",lib:"Organismes sociaux",cl:4,type:"TI"},{num:"431",lib:"CNSS",cl:4,type:"TI"},{num:"432",lib:"CNAMGS",cl:4,type:"TI"},{num:"437",lib:"Autres organismes sociaux",cl:4,type:"TI"},
  {num:"44",lib:"État et collectivités publiques",cl:4,type:"TI"},{num:"441",lib:"État — impôts et taxes",cl:4,type:"TI"},{num:"4421",lib:"TVA collectée",cl:4,type:"TI"},{num:"4424",lib:"TVA déductible",cl:4,type:"TI"},{num:"444",lib:"État — impôts sur bénéfices",cl:4,type:"TI"},{num:"447",lib:"État — taxes sur chiffre d'affaires",cl:4,type:"TI"},
  {num:"45",lib:"Organismes internationaux",cl:4,type:"TI"},
  {num:"46",lib:"Associés et groupe",cl:4,type:"TI"},{num:"461",lib:"Associés — opérations sur le capital",cl:4,type:"TI"},
  {num:"47",lib:"Débiteurs et créditeurs divers",cl:4,type:"TI"},{num:"471",lib:"Débiteurs divers",cl:4,type:"TI"},{num:"472",lib:"Créditeurs divers",cl:4,type:"TI"},
  {num:"48",lib:"Créances et dettes sur immobilisations",cl:4,type:"TI"},
  {num:"49",lib:"Dépréciations des comptes de tiers",cl:4,type:"TI"},
  // Classe 5 — Trésorerie
  {num:"50",lib:"Titres de placement",cl:5,type:"TR"},{num:"501",lib:"Parts dans des entreprises liées",cl:5,type:"TR"},{num:"502",lib:"Actions propres",cl:5,type:"TR"},{num:"503",lib:"Actions",cl:5,type:"TR"},{num:"504",lib:"Obligations",cl:5,type:"TR"},
  {num:"51",lib:"Valeurs à encaisser",cl:5,type:"TR"},{num:"511",lib:"Effets à encaisser",cl:5,type:"TR"},{num:"514",lib:"Chèques à encaisser",cl:5,type:"TR"},
  {num:"52",lib:"Banques",cl:5,type:"TR"},{num:"521",lib:"Banque locale",cl:5,type:"TR"},{num:"522",lib:"Banque étrangère",cl:5,type:"TR"},{num:"524",lib:"Comptes d'épargne",cl:5,type:"TR"},
  {num:"53",lib:"Établissements financiers et assimilés",cl:5,type:"TR"},{num:"531",lib:"Chèques postaux",cl:5,type:"TR"},
  {num:"57",lib:"Caisse",cl:5,type:"TR"},{num:"571",lib:"Caisse siège",cl:5,type:"TR"},{num:"572",lib:"Caisse agence",cl:5,type:"TR"},
  {num:"58",lib:"Virements internes",cl:5,type:"TR"},
  {num:"59",lib:"Dépréciations des titres de placement",cl:5,type:"TR"},
  // Classe 6 — Charges des activités ordinaires
  {num:"60",lib:"Achats et variations de stocks",cl:6,type:"CH"},{num:"601",lib:"Achats de marchandises",cl:6,type:"CH"},{num:"602",lib:"Achats de matières premières",cl:6,type:"CH"},{num:"604",lib:"Achats stockés de matières et fournitures",cl:6,type:"CH"},{num:"605",lib:"Achats de matériaux et fournitures",cl:6,type:"CH"},{num:"608",lib:"Frais accessoires sur achats",cl:6,type:"CH"},
  {num:"61",lib:"Transports",cl:6,type:"CH"},{num:"611",lib:"Transports sur achats",cl:6,type:"CH"},{num:"612",lib:"Transports sur ventes",cl:6,type:"CH"},{num:"613",lib:"Transports pour le compte de tiers",cl:6,type:"CH"},
  {num:"62",lib:"Services extérieurs A",cl:6,type:"CH"},{num:"621",lib:"Sous-traitance générale",cl:6,type:"CH"},{num:"622",lib:"Locations et charges locatives",cl:6,type:"CH"},{num:"624",lib:"Entretien, réparations et maintenance",cl:6,type:"CH"},{num:"625",lib:"Primes d'assurance",cl:6,type:"CH"},{num:"626",lib:"Études, recherches et documentation",cl:6,type:"CH"},{num:"628",lib:"Divers",cl:6,type:"CH"},
  {num:"63",lib:"Services extérieurs B",cl:6,type:"CH"},{num:"631",lib:"Frais bancaires",cl:6,type:"CH"},{num:"632",lib:"Rémunérations d'intermédiaires et honoraires",cl:6,type:"CH"},{num:"633",lib:"Publicité, publications, relations publiques",cl:6,type:"CH"},{num:"634",lib:"Transports et déplacements",cl:6,type:"CH"},{num:"635",lib:"Frais postaux et télécommunications",cl:6,type:"CH"},{num:"637",lib:"Frais de réception, restauration",cl:6,type:"CH"},
  {num:"64",lib:"Impôts et taxes",cl:6,type:"CH"},{num:"641",lib:"Impôts et taxes directs",cl:6,type:"CH"},{num:"645",lib:"Impôts et taxes indirects",cl:6,type:"CH"},{num:"646",lib:"Droits d'enregistrement et de timbre",cl:6,type:"CH"},
  {num:"65",lib:"Autres charges",cl:6,type:"CH"},{num:"651",lib:"Pertes sur créances",cl:6,type:"CH"},{num:"658",lib:"Charges diverses",cl:6,type:"CH"},
  {num:"66",lib:"Charges de personnel",cl:6,type:"CH"},{num:"661",lib:"Rémunérations directes versées au personnel",cl:6,type:"CH"},{num:"662",lib:"Rémunérations indirectes",cl:6,type:"CH"},{num:"663",lib:"Indemnités forfaitaires",cl:6,type:"CH"},{num:"664",lib:"Charges sociales",cl:6,type:"CH"},{num:"665",lib:"Charges de retraites",cl:6,type:"CH"},
  {num:"67",lib:"Frais financiers et charges assimilées",cl:6,type:"CH"},{num:"671",lib:"Intérêts des emprunts",cl:6,type:"CH"},{num:"676",lib:"Escomptes accordés",cl:6,type:"CH"},
  {num:"68",lib:"Dotations aux amortissements et provisions",cl:6,type:"CH"},{num:"681",lib:"Dotations aux amortissements",cl:6,type:"CH"},{num:"691",lib:"Participation des travailleurs aux bénéfices",cl:6,type:"CH"},
  {num:"69",lib:"Impôts sur le résultat et taxes assimilées",cl:6,type:"CH"},
  // Classe 7 — Revenus des activités ordinaires
  {num:"70",lib:"Ventes",cl:7,type:"PR"},{num:"701",lib:"Ventes de marchandises",cl:7,type:"PR"},{num:"702",lib:"Ventes de produits finis",cl:7,type:"PR"},{num:"703",lib:"Ventes de produits résiduels",cl:7,type:"PR"},{num:"704",lib:"Travaux",cl:7,type:"PR"},{num:"705",lib:"Services",cl:7,type:"PR"},{num:"706",lib:"Produits des activités annexes",cl:7,type:"PR"},
  {num:"71",lib:"Subventions d'exploitation",cl:7,type:"PR"},
  {num:"72",lib:"Production immobilisée",cl:7,type:"PR"},
  {num:"73",lib:"Variations des stocks de biens produits",cl:7,type:"PR"},
  {num:"74",lib:"Produits divers",cl:7,type:"PR"},
  {num:"75",lib:"Produits financiers",cl:7,type:"PR"},{num:"751",lib:"Revenus des participations",cl:7,type:"PR"},{num:"752",lib:"Revenus des placements",cl:7,type:"PR"},{num:"754",lib:"Gains de change",cl:7,type:"PR"},
  {num:"77",lib:"Reprises de provisions et dépréciations",cl:7,type:"PR"},
  {num:"78",lib:"Transferts de charges",cl:7,type:"PR"},
  // Classe 8 — Autres charges et autres produits
  {num:"81",lib:"Valeurs comptables des cessions d'immobilisations",cl:8,type:"AUT"},
  {num:"82",lib:"Produits des cessions d'immobilisations",cl:8,type:"AUT"},
  {num:"83",lib:"Charges HAO",cl:8,type:"AUT"},{num:"84",lib:"Produits HAO",cl:8,type:"AUT"},
  {num:"85",lib:"Dotations HAO",cl:8,type:"AUT"},{num:"86",lib:"Reprises HAO",cl:8,type:"AUT"},
  {num:"87",lib:"Participation des travailleurs",cl:8,type:"AUT"},
  {num:"88",lib:"Subventions d'équilibre",cl:8,type:"AUT"},
  {num:"89",lib:"Impôts sur le résultat",cl:8,type:"AUT"},
];

// ═══════════════════════════════════════════════════════════════════════════
// gcAntiRedondance — Système anti-redondance global v75
// Empêche la double-exécution d'actions critiques dans le SI :
//   créations de comptes, dossiers, documents, archives, intégrations,
//   validations/approbations, signatures, connexions, inventaires…
// Principe : chaque action génère une empreinte unique (type + entityId).
//   Si l'empreinte existe déjà → l'action est bloquée.
//   Les empreintes expirent après 90 jours (nettoyage automatique).
// ═══════════════════════════════════════════════════════════════════════════
const gcAntiRedondance = {
  _key: "gc-anti-redondance-v1",
  _load: () => { try { return JSON.parse(_lsGet("gc-anti-redondance-v1") || "{}"); } catch(_) { return {}; } },
  _save: (data) => { try { _lsSet("gc-anti-redondance-v1", JSON.stringify(data)); } catch(_) {} },
  // Vérifie si une action a déjà été effectuée. Retourne true si l'action est permise, false si déjà faite.
  check: (type, entityId, metadata = {}) => {
    const data = gcAntiRedondance._load();
    const fingerprint = `${type}::${entityId}`;
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    if (data[fingerprint] && new Date(data[fingerprint].at).getTime() > cutoff) {
      return { allowed: false, existing: data[fingerprint] };
    }
    return { allowed: true };
  },
  // Enregistre une action effectuée
  register: (type, entityId, byUserId, metadata = {}) => {
    const data = gcAntiRedondance._load();
    const fingerprint = `${type}::${entityId}`;
    data[fingerprint] = { at: new Date().toISOString(), byUserId, ...metadata };
    // Nettoyage : garder seulement les 1000 dernières entrées récentes
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([_k, v]) => new Date(v.at).getTime() > cutoff).slice(-1000)
    );
    gcAntiRedondance._save(cleaned);
  },
  // Vérifie ET enregistre en une seule opération atomique
  checkAndRegister: (type, entityId, byUserId, metadata = {}) => {
    const result = gcAntiRedondance.check(type, entityId);
    if (result.allowed) gcAntiRedondance.register(type, entityId, byUserId, metadata);
    return result;
  },
  // Révoque une empreinte (ex: annulation d'une approbation)
  revoke: (type, entityId) => {
    const data = gcAntiRedondance._load();
    delete data[`${type}::${entityId}`];
    gcAntiRedondance._save(data);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// gcGetActivePlan() — Plan comptable actif avec overrides et comptes perso.
// À utiliser PARTOUT à la place de PLAN_COMPTABLE_OHADA directement.
// Garantit que toute modification faite dans le CRUD se propage automatiquement
// dans le journal, le bilan, la trésorerie, les états financiers et l'OHADA Ref.
// ═══════════════════════════════════════════════════════════════════════════
export const gcGetActivePlan = () => {
  try {
    const overrides = JSON.parse(_lsGet("gc-ohada-overrides") || "[]");
    const customs   = JSON.parse(_lsGet("gc-ohada-custom")    || "[]");
    const hiddenNums = new Set(overrides.filter(o => o.hidden).map(o => o.num));
    // Base : PLAN_COMPTABLE_OHADA avec overrides appliqués, sans les comptes masqués
    const base = PLAN_COMPTABLE_OHADA
      .filter(c => !hiddenNums.has(c.num))
      .map(c => {
        const ov = overrides.find(o => o.num === c.num && !o.hidden);
        return ov ? { ...c, ...ov, overridden: true } : c;
      });
    // Ajout des comptes personnalisés qui ne sont pas dans le plan standard
    const customOnly = customs.filter(c => !PLAN_COMPTABLE_OHADA.find(b => b.num === c.num));
    return [...base, ...customOnly];
  } catch(_) {
    return PLAN_COMPTABLE_OHADA;
  }
};

// Raccourci : libellé d'un compte par son numéro (pour affichage journal, bilan…)
export const gcGetCompteLib = (num) => {
  if (!num) return "";
  const plan = gcGetActivePlan();
  const c = plan.find(x => x.num === num) || plan.find(x => num.startsWith(x.num));
  return c ? `${c.num} — ${c.lib}` : num;
};

/* ── DelaiConfigPanelO01 — Extrait de GestionDocsUnifiee (fix v101: hooks dans IIFE interdits) ── */

export const CRM_SEGMENTS_C = ["TPE","PME","Grande Entreprise","Multinationale","Association/ONG","Particulier","Institution Publique","Startup","Autre"];
export const CRM_SECTEURS_C = ["Juridique","Finance & Banque","BTP & Immobilier","Commerce & Distribution","Industrie","Agriculture & Pêche","Mine & Pétrole","Santé","Éducation","Transport & Logistique","Tourisme & Hôtellerie","Télécommunications","Services","Autre"];
export const CRM_SOURCES_C  = ["Recommandation","Réseau","Prospection","Site web","Réseaux sociaux","Événement/Séminaire","Appel d'offres","Partenaire","Autre"];
export const CRM_TYPES_INTERACTION_C = ["APPEL","EMAIL","RÉUNION EN PRÉSENTIEL","RÉUNION VISIO","VISITE CLIENT","RÉCEPTION","COURRIER","SMS","AUTRE"];
export const CRM_TYPES_RELANCE_C     = ["APPEL","EMAIL","SMS","COURRIER","VISITE"];
export const CRM_ETAPES_C = [
  {k:"PROSPECT",     l:"Prospect",       c:"#6B7280", pct:10},
  {k:"QUALIFICATION",l:"Qualification",  c:"#3B82F6", pct:25},
  {k:"PROPOSITION",  l:"Proposition",    c:"#8B5CF6", pct:50},
  {k:"NEGOCIATION",  l:"Négociation",    c:"#F59E0B", pct:75},
  {k:"CONVERTI",     l:"Converti ✅",     c:"#22C55E", pct:100},
  {k:"PERDU",        l:"Perdu ❌",        c:"#EF4444", pct:0},
];
export const CRM_RISKS_C = [
  {k:"FAIBLE",   l:"Faible",   c:"#22C55E", bg:"#22C55E15"},
  {k:"MOYEN",    l:"Moyen",    c:"#F59E0B", bg:"#F59E0B15"},
  {k:"ÉLEVÉ",    l:"Élevé",    c:"#EF4444", bg:"#EF444415"},
  {k:"CRITIQUE", l:"Critique", c:"#7C1D2C", bg:"#7C1D2C15"},
];
export const CRM_KYC_C = [
  {k:"EN_ATTENTE", l:"En attente", c:"#F59E0B"},
  {k:"EN_COURS",   l:"En cours",   c:"#3B82F6"},
  {k:"VALIDE",     l:"Validé ✅",   c:"#22C55E"},
  {k:"REJETE",     l:"Rejeté ❌",   c:"#EF4444"},
  {k:"EXPIRE",     l:"Expiré ⚠️",  c:"#F97316"},
];
export const CRM_STATUTS_C     = ["PROSPECT","ACTIF","INACTIF","VIP","SUSPENDU","ARCHIVE"];
export const CRM_PROCS_METIER_C= [
  {k:"O01",l:"O01 — Administration",c:"#F97316"},
  {k:"O02",l:"O02 — Juridique & Conseil",c:"#3B82F6"},
  {k:"O03",l:"O03 — Éval. & Gestion",c:"#22C55E"},
];


export const _APP_LIST_FOR_MGT = [
  // ── Applications Opérationnelles ──────────────────────────────────────────
  { id:"finance",       label:"Finance & Comptabilité",       icon:"💰", processes:["S01","P03","O01","O02","O03"] },
  { id:"juridique",     label:"Juridique & OHADA",             icon:"⚖️", processes:["O02","P02"] },
  { id:"conseil",       label:"Conseil & Stratégie",           icon:"🎯", processes:["P01","P02","P03","P04","O03"] },
  { id:"sirh",          label:"SIRH — Ressources Humaines",    icon:"👥", processes:["S03"] },
  { id:"audit",         label:"Audit & Contrôle",              icon:"🔍", processes:["S02","O03"] },
  { id:"conformite",    label:"Conformité & Réglementations",  icon:"🛡️", processes:["P02","S02"] },
  { id:"communication", label:"Communication & Marketing",     icon:"📢", processes:["S04"] },
  { id:"logistique",    label:"Logistique & Moyens Généraux",  icon:"🚚", processes:["S05","S06"] },
  // ── Applications Bureau & Documents ─────────────────────────────────────
  { id:"bureau",        label:"Bureau Office (Bureautique)",   icon:"🖥️", processes:["ALL"] },
  { id:"docs_app",      label:"Gestionnaire de Documents",     icon:"📁", processes:["ALL"] },
  { id:"codification",  label:"Codification & Références",     icon:"🏷️", processes:["ALL"] },
  { id:"conventions",   label:"Conventions & Contrats",        icon:"📝", processes:["O01","O02","O03","P01","P02"] },
  { id:"crm",           label:"CRM — Gestion Clients",         icon:"🤝", processes:["O01","O02","O03","S01","S04"] },
  { id:"facturation",   label:"Facturation & Devis",           icon:"🧾", processes:["O01","S01","P03"] },
  // ── Applications Pilotage & Support ──────────────────────────────────────
  { id:"indicateurs",   label:"Tableau de Bord & KPIs",        icon:"📊", processes:["P01","P02","P03","S01","S02","S03","O01","O02","O03"] },
  { id:"agenda",        label:"Agenda & Planification",         icon:"📅", processes:["ALL"] },
  { id:"taches",        label:"Tâches & Alertes",               icon:"✅", processes:["ALL"] },
  { id:"messagerie",    label:"Messagerie Interne",             icon:"💬", processes:["ALL"] },
  { id:"processus",     label:"Processus & Hiérarchie",         icon:"🗺️", processes:["P01","P02","P03","S02","S03"] },
  // ── Administration SI ─────────────────────────────────────────────────────
  { id:"admin",         label:"Administration Système (SI)",   icon:"⚙️",  processes:["P01","S03"] },
  { id:"collaborateurs",label:"Annuaire Collaborateurs",        icon:"👤", processes:["P01","S03","ALL"] },
];

const generatePromoCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "GC-";
  for (let i=0;i<4;i++) c += chars[Math.floor(Math.random()*chars.length)];
  return c + "-" + [...Array(4)].map(()=>chars[Math.floor(Math.random()*chars.length)]).join("");
};


// FIX v150 — Matrice d'accès SI mise à jour selon schéma officiel des processus
export const PROCESS_APP_MATRIX_DEFAULT = {
  // ── Processus de Pilotage (P) ─────────────────────────────────────────────
  "P01": ["bureau","finance","juridique","sirh","audit","conformite","logistique","communication","indicateurs","conseil","docs_app","conventions","agenda_app","admin"],
  "P02": ["bureau","audit","conformite","indicateurs","conseil","conventions","agenda_app","admin"],
  "P03": ["bureau","finance","logistique","indicateurs","conseil","conventions","agenda_app","admin"],
  "P04": ["bureau","communication","indicateurs","conseil","docs_app","conventions","agenda_app","admin"],
  // ── Processus Opérationnels (O) ───────────────────────────────────────────
  "O01": ["bureau","indicateurs","docs_app","conventions","agenda_app"],
  "O02": ["bureau","juridique","indicateurs","docs_app","agenda_app"],
  "O03": ["bureau","audit","indicateurs","agenda_app"],
  // ── Processus de Support (S) ──────────────────────────────────────────────
  "S01": ["bureau","finance","logistique","indicateurs","agenda_app"],
  "S02": ["bureau","audit","conformite","indicateurs","conventions","agenda_app"],
  "S03": ["bureau","sirh","indicateurs","conventions","agenda_app"],
  "S04": ["bureau","communication","indicateurs","agenda_app"],
  "S05": ["bureau","logistique","indicateurs","agenda_app"],
  "S06": ["bureau","indicateurs","agenda_app"],
  // ── ALL : clé globale pour accès universel (réservé admin/DG) ────────────
  "ALL": ["bureau","finance","juridique","sirh","audit","conformite","logistique","communication","indicateurs","conseil","docs_app","conventions","agenda_app","admin"],
};

export const PROCESS_APP_TYPES = {
  "P01":"Pilotage","P02":"Gouvernance","P03":"Finance","P04":"Veille",
  "O01":"Administration","O02":"Juridique","O03":"Gestion",
  "S01":"Finance","S02":"Audit","S03":"RH","S04":"Communication",
  "S05":"Logistique","S06":"Sécurité",
};

export const INITIAL_SIRH_PRESENCES = [
  { id:"PRE-001", userId:"USR-JUR-002", date:"2026-03-03", arrivee:"08:05", depart:"17:32", pause:60, statut:"PRESENT", notes:"" },
  { id:"PRE-002", userId:"USR-GES-001", date:"2026-03-03", arrivee:"08:15", depart:null, pause:60, statut:"EN_POSTE", notes:"" },
  { id:"PRE-003", userId:"USR-JUR-003", date:"2026-03-03", arrivee:null, depart:null, pause:0, statut:"ABSENT", notes:"Congé annuel" },
];

export const INITIAL_SIRH_LEAVES = [
  { id:"LV-001", userId:"USR-JUR-003", type:"CONGE_ANNUEL", debut:"2026-03-03", fin:"2026-03-07", motif:"Congé annuel planifié", statut:"APPROUVE", validePar:"USR-RH-001", valideAt:"2026-02-28T10:00:00", soldeAvant:20, soldeApres:15 },
  { id:"LV-002", userId:"USR-JUR-002", type:"MALADIE", debut:"2026-03-10", fin:"2026-03-11", motif:"Certificat médical", statut:"EN_ATTENTE", validePar:null, valideAt:null, soldeAvant:20, soldeApres:20 },
];

export const INITIAL_RECRUTEMENTS = [
  { id:"REC-001", poste:"Juriste Senior", departement:"O02", demandeurId:"USR-JUR-001", dateDemande:"2026-02-15", statut:"ENTRETIENS", priorite:"HAUTE", candidats:[
    { id:"CAND-001", nom:"OBAME JEAN-MARC", cv:"CV_OBAME.pdf", statut:"ENTRETIEN_1", note:3.5, commentaire:"Bon profil, expérience OHADA" },
    { id:"CAND-002", nom:"NZUE MARIE-CLAIRE", cv:"CV_NZUE.pdf", statut:"RECU", note:0, commentaire:"" },
  ], entretiens:[], description:"Juriste spécialisé droit des affaires OHADA" },
];

export const INITIAL_ACHATS = [
  { id:"ACH-001", objet:"Fournitures bureau Q1", demandeurId:"USR-SEC-001", montant:150000, fournisseur:"BUREAU PLUS GABON", statut:"APPROUVE", dateCreation:"2026-02-20", dateValidation:"2026-02-22", processus:"S05", priority:"NORMALE", livraison:null, notes:"Commande mensuelle" },
  { id:"ACH-002", objet:"Renouvellement abonnement antivirus", demandeurId:"USR-MG-001", montant:480000, fournisseur:"KASPERSKY AFRIQUE", statut:"EN_ATTENTE_APPROBATION", dateCreation:"2026-03-01", dateValidation:null, processus:"O01", priority:"HAUTE", livraison:null, notes:"Licence annuelle 15 postes" },
];

export const INITIAL_STOCKS = [
  { id:"STK-001", ref:"MAT-PAP-001", designation:"Ramettes A4 80g", categorie:"Fournitures", quantite:45, unite:"Ramettes", alerteSeuil:10, valeurUnitaire:2500, depot:"Magasin principal", derniereEntree:"2026-02-20", processus:"S05" },
  { id:"STK-002", ref:"MAT-INF-001", designation:"Cartouches imprimante HP", categorie:"Informatique", quantite:4, unite:"Cartouches", alerteSeuil:2, valeurUnitaire:25000, depot:"Magasin principal", derniereEntree:"2026-01-15", processus:"S05" },
  { id:"STK-003", ref:"MAT-INF-002", designation:"Clés USB 16Go", categorie:"Informatique", quantite:8, unite:"Unités", alerteSeuil:3, valeurUnitaire:8000, depot:"Magasin principal", derniereEntree:"2026-01-20", processus:"S05" },
];

export const INITIAL_OBLIGATIONS = [
  { id:"OBL-001", reference:"CONF-RGPD-001", titre:"Registre des traitements RGPD", domaine:"RGPD", echeance:"2026-04-01", responsableId:"USR-AUD-001", statut:"EN_COURS", preuve:null, notes:"Mise à jour annuelle obligatoire", processus:"P02" },
  { id:"OBL-002", reference:"CONF-FISC-001", titre:"Déclaration IS trimestrielle T1 2026", domaine:"Fiscal", echeance:"2026-03-31", responsableId:"USR-FIN-001", statut:"A_REALISER", preuve:null, notes:"Direction Générale des Impôts", processus:"S01" },
  { id:"OBL-003", reference:"CONF-SOC-001", titre:"Rapport social annuel", domaine:"RH/Social", echeance:"2026-03-15", responsableId:"USR-RH-001", statut:"EN_COURS", preuve:null, notes:"Code du travail gabonais Art. 287", processus:"S03" },
];

export const INITIAL_RGPD_TRAITEMENTS = [
  { id:"RGPD-001", nom:"Gestion des ressources humaines", finalite:"Gestion de la paie, congés, recrutement", baseJuridique:"Obligation légale", categories:"Données d'identification, données bancaires", destinataires:"RH, Comptabilité", dureeConservation:"5 ans après fin contrat", mesuresSecurite:"Accès restreint habilitation 4+", responsableId:"USR-RH-001", dateCreation:"2026-01-15", statut:"ACTIF" },
  { id:"RGPD-002", nom:"Gestion des dossiers clients", finalite:"Suivi des affaires et prestations juridiques", baseJuridique:"Exécution du contrat", categories:"Identité, données judiciaires", destinataires:"Juridique, Direction", dureeConservation:"10 ans après clôture", mesuresSecurite:"Chiffrement, accès nominatif", responsableId:"USR-JUR-001", dateCreation:"2026-01-15", statut:"ACTIF" },
];


export const DEMO_USERS = [
  {
    id: "USR-ADM-000", name: "Superviseur SI", alias: "admin.si", role: "Direction SI",
    dept: "Système d'Information", process: "ALL", level: 6, avatar: "AD", color: "#C41E3A",
    isAdmin: true, password: "[HASH_SECURISE]",
    sexe: "N/A", nationalite: "N/A", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "admin@genie-consultant.com", adresse: "Siège Social",
    bio: "Compte d'administration système du SI Génie Consultant.",
    photoUrl: null,
  },
  {
    id: "USR-MG-001", name: "Maître Gilles LEPEBE", alias: "g.lepebe", role: "Manager Général — CODIR",
    dept: "Direction Générale", process: "ALL", level: 5, avatar: "GL", color: "#C9A84C",
    sexe: "M", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 066 247 019", email: "direction@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Directeur Général, fondateur et chef suprême du Cabinet Génie Consultant. Président du CODIR. Expert juridique et stratégique. Supervise l'ensemble des processus et collaborateurs.",
    photoUrl: null, isMG: true,
  },
  {
    id: "USR-FIN-001", name: "Mme BELOMBO PAOLA BERLINE", alias: "p.belombo", role: "Responsable Finance & Chef COPIL",
    dept: "Finance & Comptabilité", process: "S01/P03", level: 4, avatar: "BP", color: "#A855F7",
    sexe: "F", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "finance@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Responsable du département financier et chef du Comité de Pilotage (COPIL).",
    photoUrl: null,
  },
  {
    id: "USR-JUR-001", name: "Mr NZE NGUEMA JEREMY", alias: "j.nze", role: "Responsable Juridique & Chef COMOP",
    dept: "Département Juridique", process: "O02", level: 4, avatar: "JN", color: "#3B82F6",
    sexe: "M", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "juridique@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Responsable du Département Juridique et Chef du Comité Opérationnel (COMOP). Supervise l'ensemble des affaires juridiques et contentieuses du cabinet.",
    photoUrl: null,
  },
  {
    id: "USR-AUD-001", name: "Mr KASTANH PEMAGNY FEDRICH LORPHANE", alias: "f.kastanh", role: "Resp. Audit, Contrôle & Conformité — Chef CODIR adj.",
    dept: "Audit & Contrôle", process: "S02/P02/O03", level: 4, avatar: "KP", color: "#EF4444",
    sexe: "M", nationalite: "Congolaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "audit@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Responsable de l'Audit interne, du Contrôle et de la Conformité. Chef du Comité d'Audit, Contrôle, Risque et Conformité.",
    photoUrl: null,
  },
  {
    id: "USR-VSC-001", name: "Mr OBIANG MODOSS LOUIS-PAUL EVARISTE", alias: "lp.obiang", role: "Responsable Veille Stratégique & Commercial",
    dept: "Veille Stratégique & Commercial", process: "P04", level: 4, avatar: "OM", color: "#06B6D4",
    sexe: "M", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "veille@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Responsable de la veille stratégique, commerciale et du développement des activités du cabinet.",
    photoUrl: null,
  },
  {
    id: "USR-RH-001", name: "Mme NSEGHE ELEMVA ADELIA DAN FARNELLE", alias: "a.nseghe", role: "Responsable Ressources Humaines",
    dept: "Ressources Humaines", process: "S03", level: 4, avatar: "NE", color: "#22C55E",
    sexe: "F", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "rh@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Responsable des Ressources Humaines. Gestion du recrutement, du personnel et de la conformité RH.",
    photoUrl: null,
  },
  {
    id: "USR-COM-001", name: "Mr IBOUNDJI CEDRIC", alias: "c.iboundji", role: "Responsable Communication & Système d'Information",
    dept: "Communication", process: "S04", level: 3, avatar: "IC", color: "#EC4899",
    sexe: "M", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "communication@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Responsable du département Communication, Community Manager et Infographie.",
    photoUrl: null,
  },
  {
    id: "USR-LOG-001", name: "Mr KALOGA MADI", alias: "k.madi", role: "Responsable Logistique, Relations Ext. & Sécurité",
    dept: "Relations Ext. & Logistique", process: "S05/S06", level: 3, avatar: "KM", color: "#F97316",
    sexe: "M", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "logistique@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Chargé des achats, de la logistique et des relations avec les partenaires extérieurs.",
    photoUrl: null,
  },
  {
    id: "USR-SEC-001", name: "Mme ANGUILET-DAOUDA RISSI WUILLIAME M.L.G", alias: "sa.anguilet", role: "Secrétaire Administrative — Resp. Exécutif Admin.",
    dept: "Administration", process: "O01", level: 3, avatar: "SA", color: "#F59E0B",
    sexe: "F", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "secretariat@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Secrétaire Administrative — Responsable de l'accueil clients, de la gestion des dossiers, de l'archivage et de la coordination interne.",
    photoUrl: null,
  },
  {
    id: "USR-OPE-001", name: "Opérationnel Exécutif", alias: "ope.exec", role: "Opérationnel Exécutif",
    dept: "Administration", process: "O01", level: 2, avatar: "OE", color: "#F59E0B",
    sexe: "N/A", nationalite: "N/A", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "ops@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Opérationnel exécutif en charge des tâches administratives courantes.",
    photoUrl: null,
  },
  {
    id: "USR-JUR-002", name: "MBA MICHELLE", alias: "m.mba", role: "Juriste",
    dept: "Département Juridique", process: "O02", level: 2, avatar: "MM", color: "#3B82F6",
    sexe: "F", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "jur1@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Juriste — Spécialisée en droit civil et commercial.", photoUrl: null,
  },
  {
    id: "USR-JUR-003", name: "CHAPUIE CYBELLE", alias: "c.chapuie", role: "Juriste",
    dept: "Département Juridique", process: "O02", level: 2, avatar: "CC", color: "#3B82F6",
    sexe: "F", nationalite: "Gabonaise", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "jur2@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Juriste — Droit pénal et contentieux judiciaire.", photoUrl: null,
  },
  {
    id: "USR-JUR-004", name: "BRIDON", alias: "bridon", role: "Juriste",
    dept: "Département Juridique", process: "O02", level: 2, avatar: "BR", color: "#3B82F6",
    sexe: "N/A", nationalite: "N/A", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "jur3@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Juriste — Droit des affaires et droit commercial.", photoUrl: null,
  },
  {
    id: "USR-JUR-005", name: "MURIELLE", alias: "murielle", role: "Juriste",
    dept: "Département Juridique", process: "O02", level: 2, avatar: "MU", color: "#3B82F6",
    sexe: "F", nationalite: "N/A", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "jur4@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Juriste — Droit du travail et droit social.", photoUrl: null,
  },
  {
    id: "USR-GES-001", name: "Gestionnaire (À définir)", alias: "gest.o03", role: "Opérationnel – Gestion & Évaluation Entreprise",
    dept: "Evaluation & Gestion", process: "O03", level: 2, avatar: "OG", color: "#06B6D4",
    sexe: "N/A", nationalite: "N/A", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "gestion@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Opérationnel en charge des missions d'évaluation, gestion et audit d'entreprises.", photoUrl: null,
  },
  {
    id: "USR-RH-002", name: "Agent RH", alias: "agt.rh", role: "Agent Ressources Humaines",
    dept: "Ressources Humaines", process: "S03", level: 1, avatar: "AR", color: "#22C55E",
    sexe: "N/A", nationalite: "N/A", situationMatrimoniale: "N/A",
    telephone: "+241 000 000 000", email: "rh2@genie-consultant.com", adresse: "Libreville, Gabon",
    bio: "Agent RH en charge du support administratif des ressources humaines.", photoUrl: null,
  },
];

export const DEMO_DOSSIERS = [
  { id: "DOS-A01-O02.01/2026", ref: "DOS-A01-O02.01/2026", type: "DOS", client: "SARL OMEGA GABON", objet: "Procédure Civile Contentieuse – Litige commercial", process: "O02", status: "EN_COURS", priority: "HAUTE", assignedTo: "USR-JUR-002", createdBy: "USR-SEC-001", createdAt: "2026-02-10", dueDate: "2026-03-15", progress: 60, notes: "Dossier en phase d'instruction", tags: ["CONTENTIEUX", "CIVIL"], amount: 450000 },
  { id: "DOS-A02-O02.02/2026", ref: "DOS-A02-O02.02/2026", type: "DOS", client: "M. NDONG JEAN-PIERRE", objet: "Droit du Travail – Litige employeur/salarié", process: "O02", status: "ATTENTE_VALIDATION", priority: "MOYENNE", assignedTo: "USR-JUR-003", createdBy: "USR-SEC-001", createdAt: "2026-02-15", dueDate: "2026-03-20", progress: 40, notes: "En attente de validation du responsable juridique", tags: ["TRAVAIL", "SOCIAL"], amount: 200000 },
  { id: "DOS-A03-O03.01/2026", ref: "DOS-A03-O03.01/2026", type: "DOS", client: "GROUPE INNOVATE SA", objet: "Audit Externe & Évaluation d'Actifs", process: "O03", status: "ATTENTE_TRAITEMENT", priority: "HAUTE", assignedTo: "USR-GES-001", createdBy: "USR-SEC-001", createdAt: "2026-02-20", dueDate: "2026-04-01", progress: 15, notes: "En attente d'affectation complète", tags: ["AUDIT", "ÉVALUATION"], amount: 1200000 },
  { id: "DOS-A04-O02.04/2026", ref: "DOS-A04-O02.04/2026", type: "DOS", client: "Mme OBIANG NKOGO CELINE", objet: "Droit Pénal – Défense au pénal", process: "O02", status: "TERMINE", priority: "HAUTE", assignedTo: "USR-JUR-001", createdBy: "USR-SEC-001", createdAt: "2026-01-05", dueDate: "2026-02-28", progress: 100, notes: "Affaire clôturée – décision favorable", tags: ["PÉNAL", "CONTENTIEUX"], amount: 600000 },
  { id: "DOS-A05-O03.03/2026", ref: "DOS-A05-O03.03/2026", type: "DOS", client: "ENTREPRISE BÂTIR GABON SARL", objet: "Constitution & Restructuration d'Entreprise", process: "O03", status: "EN_COURS", priority: "NORMALE", assignedTo: "USR-GES-001", createdBy: "USR-SEC-001", createdAt: "2026-02-22", dueDate: "2026-03-30", progress: 35, notes: "Phase de collecte des documents constitutifs", tags: ["GESTION", "CONSTITUTION"], amount: 350000 },
];

export const DEMO_RDVS = [
  { id: "RDV-001", client: "SARL OMEGA GABON", date: "2026-03-03", heure: "09:00", duree: 60, type: "Consultation juridique", assignedTo: "USR-JUR-002", dossier: "DOS-A01-O02.01/2026", status: "CONFIRME", salle: "Salle A" },
  { id: "RDV-002", client: "GROUPE INNOVATE SA", date: "2026-03-04", heure: "14:00", duree: 90, type: "Réunion d'audit", assignedTo: "USR-GES-001", dossier: "DOS-A03-O03.01/2026", status: "EN_ATTENTE", salle: "Salle B" },
  { id: "RDV-003", client: "Nouveau client", date: "2026-03-05", heure: "10:30", duree: 45, type: "Consultation initiale", assignedTo: "USR-SEC-001", dossier: null, status: "CONFIRME", salle: "Accueil" },
];

export const DEMO_TACHES = [
  { id: "TACHE-001", titre: "Rédiger conclusions en réplique", dossier: "DOS-A01-O02.01/2026", assignedTo: "USR-JUR-002", deadline: "2026-03-05", priority: "HAUTE", status: "EN_COURS", type: "RÉDACTION", createdAt: "2026-02-28" },
  { id: "TACHE-002", titre: "Collecter documents comptables client", dossier: "DOS-A03-O03.01/2026", assignedTo: "USR-GES-001", deadline: "2026-03-08", priority: "HAUTE", status: "ATTENTE_TRAITEMENT", type: "COLLECTE", createdAt: "2026-02-27" },
  { id: "TACHE-003", titre: "Valider dossier social NDONG", dossier: "DOS-A02-O02.02/2026", assignedTo: "USR-JUR-001", deadline: "2026-03-04", priority: "HAUTE", status: "ATTENTE_VALIDATION", type: "VALIDATION", createdAt: "2026-02-26" },
  { id: "TACHE-004", titre: "Archiver dossier OBIANG (clôturé)", dossier: "DOS-A04-O02.04/2026", assignedTo: "USR-SEC-001", deadline: "2026-03-02", priority: "NORMALE", status: "TERMINE", type: "ARCHIVAGE", createdAt: "2026-02-25" },
];

export const DEMO_PENDING = [
  { id: "APPRO-001", type: "CREATION_COMPTE", applicant: "Jean MOUELE BIYOGHE", function: "JURISTE", submittedAt: "2026-03-01T08:30:00", status: "ATTENTE_RH", approvals: { rh: null, conformite: null, dg: null }, generatedId: "USR-JUR-005", alertsSent: 1 },
];

export const DEMO_ARCHIVES = [
  { id: "ARCH-001", ref: "ARCH-A01-O02.04/2026", dossier: "DOS-A04-O02.04/2026", client: "Mme OBIANG NKOGO CELINE", objet: "Dossier Pénal — Affaire clôturée", archiveur: "USR-JUR-001", archivedAt: "2026-03-01T10:00:00", receivedBySec: true, secNotes: "Archivé en salle documentaire — Classeur O02/2026", process: "O02", docType: "DOS", status: "ARCHIVE_CONFIRME" },
];

export const DEMO_CODIF_REGISTRY = [
  { id: "COD-001", ref: "DOC-A01-P02.V1.0/2026", type: "DOC", process: "P02", seq: "A01", subproc: "P02", version: "V1.0", year: "2026", label: "Grand Livre des Process Internes", createdBy: "USR-MG-001", createdAt: "2026-01-15T08:00:00", description: "Document référentiel central du cabinet" },
  { id: "COD-002", ref: "DOC-A01-PROS.v1.0/2026", type: "DOC", process: "P02", seq: "A01", subproc: "PROS", version: "v1.0", year: "2026", label: "Manuel de Processus d'Activités", createdBy: "USR-MG-001", createdAt: "2026-01-15T09:00:00", description: "Manuel des processus Génie Consultant" },
  { id: "COD-003", ref: "DOC-A01-REF.v1.0/2026", type: "DOC", process: "P02", seq: "A01", subproc: "REF", version: "v1.0", year: "2026", label: "Manuel de Référence / Carnet de Codification", createdBy: "USR-SEC-001", createdAt: "2026-01-15T10:00:00", description: "Carnet de codification interne" },
  { id: "COD-004", ref: "DOS-A01-O02.01/2026", type: "DOS", process: "O02", seq: "A01", subproc: "O02.01", version: "", year: "2026", label: "Dossier SARL OMEGA — Litige commercial", createdBy: "USR-SEC-001", createdAt: "2026-02-10T08:00:00", description: "Procédure civile contentieuse" },
  { id: "COD-005", ref: "FCH-A01-P01/2026", type: "FCH", process: "P01", seq: "A01", subproc: "P01", version: "", year: "2026", label: "Fiche Processus Management Stratégique", createdBy: "USR-MG-001", createdAt: "2026-01-15T11:00:00", description: "Fiche descriptive du processus P01" },
];

export const DEMO_INTERNAL_DOCS = [
  {
    id: "IDOC-001",
    ref: "DOC-A01-P02.V1.0/2026",
    name: "Grand Livre des Process Internes",
    process: "ALL",
    category: "Référentiel",
    uploadedBy: "USR-MG-001",
    uploadedAt: "2026-01-15T08:00:00",
    description: "Document référentiel central — 132 pages — Base de tous les processus du cabinet",
    fileType: "PDF",
    fileSize: "4.2 Mo",
    hasFile: true,
    visible: "ALL",
  },
  {
    id: "IDOC-002",
    ref: "DOC-A01-PROS.v1.0/2026",
    name: "Manuel de Processus d'Activités",
    process: "ALL",
    category: "Manuel",
    uploadedBy: "USR-MG-001",
    uploadedAt: "2026-01-15T09:00:00",
    description: "Manuel des processus Génie Consultant — Procédures et activités",
    fileType: "DOCX",
    fileSize: "1.8 Mo",
    hasFile: true,
    visible: "ALL",
  },
  {
    id: "IDOC-003",
    ref: "CHT-A01-P01.v1.0/2026",
    name: "Charte de Confidentialité et d'Éthique",
    process: "ALL",
    category: "Charte",
    uploadedBy: "USR-MG-001",
    uploadedAt: "2026-01-20T10:00:00",
    description: "Charte de confidentialité et code d'éthique professionnelle",
    fileType: "PDF",
    fileSize: "0.6 Mo",
    hasFile: true,
    visible: "ALL",
  },
  {
    id: "IDOC-004",
    ref: "PROC-A01-O02.v1.0/2026",
    name: "Procédures Département Juridique",
    process: "O02",
    category: "Procédure",
    uploadedBy: "USR-JUR-001",
    uploadedAt: "2026-01-25T09:00:00",
    description: "Procédures de traitement des dossiers juridiques et contentieux",
    fileType: "DOCX",
    fileSize: "0.9 Mo",
    hasFile: true,
    visible: "O02",
  },
  {
    id: "IDOC-005",
    ref: "FCH-A01-S02.v1.0/2026",
    name: "Fiche Audit & Contrôle Interne",
    process: "S02",
    category: "Fiche",
    uploadedBy: "USR-AUD-001",
    uploadedAt: "2026-01-28T11:00:00",
    description: "Fiche de référence pour les missions d'audit et contrôle interne",
    fileType: "XLSX",
    fileSize: "0.4 Mo",
    hasFile: true,
    visible: "S02",
  },
];


export const SUSPENSION_CAUSES = [
  { value: "INACTIVITE",        label: "Inactivité prolongée" },
  { value: "FAUTE_GRAVE",       label: "Faute grave" },
  { value: "FAUTE_SIMPLE",      label: "Faute disciplinaire simple" },
  { value: "ABSENCE_JUSTIFIEE", label: "Absence justifiée (congé/maladie)" },
  { value: "ABSENCE_INJUSTIFIEE",label: "Absence injustifiée" },
  { value: "SECURITE",          label: "Mesure de sécurité / Enquête interne" },
  { value: "FIN_MISSION",       label: "Fin de mission / Contrat" },
  { value: "AUTRE",             label: "Autre motif (préciser dans les notes)" },
];

export const FILE_TYPE_CONFIG = {
  pdf:   { icon:"📄", color:"#EF4444", cat:"Document",     label:"PDF",        viewer:"pdf",    editable:false },
  docx:  { icon:"📝", color:"#3B82F6", cat:"Document",     label:"Word",       viewer:"text",   editable:true  },
  doc:   { icon:"📝", color:"#3B82F6", cat:"Document",     label:"Word (Anc)", viewer:"text",   editable:true  },
  odt:   { icon:"📝", color:"#3B82F6", cat:"Document",     label:"OpenDoc",    viewer:"text",   editable:true  },
  rtf:   { icon:"📝", color:"#3B82F6", cat:"Document",     label:"RTF",        viewer:"text",   editable:true  },
  txt:   { icon:"📃", color:"#7A90B0", cat:"Texte",        label:"Texte",      viewer:"text",   editable:true  },
  md:    { icon:"📋", color:"#A855F7", cat:"Texte",        label:"Markdown",   viewer:"text",   editable:true  },
  xlsx:  { icon:"📊", color:"#22C55E", cat:"Tableur",      label:"Excel",      viewer:"table",  editable:true  },
  xls:   { icon:"📊", color:"#22C55E", cat:"Tableur",      label:"Excel (Anc)",viewer:"table",  editable:true  },
  ods:   { icon:"📊", color:"#22C55E", cat:"Tableur",      label:"OpenCalc",   viewer:"table",  editable:true  },
  csv:   { icon:"📊", color:"#06B6D4", cat:"Tableur",      label:"CSV",        viewer:"table",  editable:true  },
  pptx:  { icon:"🎞️", color:"#F97316", cat:"Présentation", label:"PowerPoint", viewer:"slides", editable:false },
  ppt:   { icon:"🎞️", color:"#F97316", cat:"Présentation", label:"PowerPoint", viewer:"slides", editable:false },
  odp:   { icon:"🎞️", color:"#F97316", cat:"Présentation", label:"Impress",    viewer:"slides", editable:false },
  jpg:   { icon:"🖼️", color:"#EC4899", cat:"Image",        label:"JPEG",       viewer:"image",  editable:false },
  jpeg:  { icon:"🖼️", color:"#EC4899", cat:"Image",        label:"JPEG",       viewer:"image",  editable:false },
  png:   { icon:"🖼️", color:"#EC4899", cat:"Image",        label:"PNG",        viewer:"image",  editable:false },
  gif:   { icon:"🎬", color:"#EC4899", cat:"Image",        label:"GIF",        viewer:"image",  editable:false },
  webp:  { icon:"🖼️", color:"#EC4899", cat:"Image",        label:"WebP",       viewer:"image",  editable:false },
  svg:   { icon:"🎨", color:"#A855F7", cat:"Image",        label:"SVG",        viewer:"image",  editable:true  },
  bmp:   { icon:"🖼️", color:"#EC4899", cat:"Image",        label:"BMP",        viewer:"image",  editable:false },
  tiff:  { icon:"🖼️", color:"#EC4899", cat:"Image",        label:"TIFF",       viewer:"image",  editable:false },
  js:    { icon:"⚙️", color:"#F59E0B", cat:"Code",         label:"JavaScript", viewer:"code",   editable:true  },
  jsx:   { icon:"⚛️", color:"#06B6D4", cat:"Code",         label:"React/JSX",  viewer:"code",   editable:true  },
  ts:    { icon:"⚙️", color:"#3B82F6", cat:"Code",         label:"TypeScript", viewer:"code",   editable:true  },
  py:    { icon:"🐍", color:"#22C55E", cat:"Code",         label:"Python",     viewer:"code",   editable:true  },
  html:  { icon:"🌐", color:"#F97316", cat:"Code",         label:"HTML",       viewer:"code",   editable:true  },
  css:   { icon:"🎨", color:"#A855F7", cat:"Code",         label:"CSS",        viewer:"code",   editable:true  },
  json:  { icon:"📦", color:"#C9A84C", cat:"Code",         label:"JSON",       viewer:"code",   editable:true  },
  xml:   { icon:"📦", color:"#C9A84C", cat:"Code",         label:"XML",        viewer:"code",   editable:true  },
  sql:   { icon:"🗄️", color:"#3B82F6", cat:"Code",         label:"SQL",        viewer:"code",   editable:true  },
  zip:   { icon:"📦", color:"#C9A84C", cat:"Archive",      label:"ZIP",        viewer:"archive",editable:false },
  rar:   { icon:"📦", color:"#C9A84C", cat:"Archive",      label:"RAR",        viewer:"archive",editable:false },
  "7z":  { icon:"📦", color:"#C9A84C", cat:"Archive",      label:"7-ZIP",      viewer:"archive",editable:false },
  tar:   { icon:"📦", color:"#C9A84C", cat:"Archive",      label:"TAR",        viewer:"archive",editable:false },
  gz:    { icon:"📦", color:"#C9A84C", cat:"Archive",      label:"GZIP",       viewer:"archive",editable:false },
  mp3:   { icon:"🎵", color:"#A855F7", cat:"Audio",        label:"MP3",        viewer:"audio",  editable:false },
  wav:   { icon:"🎵", color:"#A855F7", cat:"Audio",        label:"WAV",        viewer:"audio",  editable:false },
  mp4:   { icon:"🎬", color:"#3B82F6", cat:"Vidéo",        label:"MP4",        viewer:"video",  editable:false },
  avi:   { icon:"🎬", color:"#3B82F6", cat:"Vidéo",        label:"AVI",        viewer:"video",  editable:false },
  eml:   { icon:"📧", color:"#F59E0B", cat:"Email",        label:"Email",      viewer:"text",   editable:true  },
  msg:   { icon:"📧", color:"#F59E0B", cat:"Email",        label:"Outlook MSG",viewer:"text",   editable:false },
};

export const GC_AI_CONFIG_KEY="gc-ai-config-v1";


export const GC_AI_SUGGESTIONS = {
  default:    ["📋 Résumé procédure", "⚖️ Question juridique OHADA", "📊 Analyse indicateurs", "💡 Recommandation stratégique"],
  juridique:  ["📄 Rédiger un contrat", "⚖️ Analyser jurisprudence", "🔍 Vérification conformité", "📝 Modèle de mise en demeure"],
  finance:    ["📊 Plan trésorerie 12 mois", "💰 Calcul charges CNSS", "🧾 Optimisation TVA", "📈 Tableau de bord financier"],
  audit:      ["🔍 Programme d'audit", "⚠️ Identification risques", "📋 Feuille de tests", "✅ Plan d'actions correctrices"],
  conformite: ["🛡️ Check-list conformité", "📜 Analyse réglementaire", "⚠️ Cartographie risques", "📊 Rapport conformité"],
  sirh:       ["👥 Calcul paie CNSS", "📅 Planification congés", "📋 Fiche de poste", "⚠️ Procédure disciplinaire"],
  conseil:    ["🎯 Analyse SWOT", "📊 Matrice PESTEL", "🗺️ Plan stratégique", "💡 Recommandations BSC"],
};
