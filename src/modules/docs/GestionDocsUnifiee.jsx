import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../../components/FileUploader.jsx';
// GestionDocsUnifiee.jsx — SI Génie Consultant v129
import { _lsGet, _lsSet, _noop, gcPushNotif, playSound, useSI, gcFileSave, _activeUser, gcAICall, dsSave, dsMarkDeleted, dsDeleteItemFromArray, dsGet } from '../../core/index.js';
import { useRemoteSync } from '../../hooks/useSyncedState.js';
import { GC_DOCS_REQUIS, CRM_SEGMENTS_C, CRM_SECTEURS_C, CRM_SOURCES_C, CRM_TYPES_INTERACTION_C, CRM_TYPES_RELANCE_C, CRM_ETAPES_C, CRM_RISKS_C, CRM_KYC_C, CRM_STATUTS_C, CRM_PROCS_METIER_C, gcViewDoc, gcDownloadDoc } from '../../core/constants.js';
import { Btn, Modal, InputField, SelectField, PrintButton, QRDisplay, Tabs, NationaliteField, SmartBanner } from '../../components/UI.jsx';
import { AIAssistant } from '../../components/AIAssistant.jsx';
import { DelaiConfigPanelO01 } from '../admin/SIConfigPanels.jsx';
import { FacturationModule } from '../finance/FinanceApp.jsx';
import { gcToast } from '../../components/ToastManager.jsx';

// FIX v129 — PARTNER_TYPES_LABELS et CRMClientFormModal déplacés HORS du composant parent
// pour éviter le re-mount à chaque frappe (perte de focus sur les champs)
const _PARTNER_TYPES_LABELS = {
  PERSONNE_MORALE: "🏢 Personne Morale",
  PERSONNE_PHYSIQUE: "👤 Personne Physique",
};

function CRMClientFormModal({
  T, clientForm, setClientForm, clientFormInit,
  editingClientId, setEditingClientId, setShowClientForm,
  handleSaveClient, users=[],
  CRM_SEGMENTS, CRM_SECTEURS, CRM_SOURCES,
  CRM_RISKS, CRM_KYC, CRM_STATUTS, CRM_PROCS_METIER,
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) { setShowClientForm(false); setEditingClientId(null); setClientForm(clientFormInit); } }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "22px 26px", width: 860, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px #0009" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#F97316,#EA580C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>
            {editingClientId ? "✏️" : "🤝"}
          </div>
          <div>
            <div style={{ color: T.text, fontWeight: 900, fontSize: 15 }}>{editingClientId ? "Modifier la fiche contact" : "Nouveau contact / partenaire"}</div>
            <div style={{ color: T.textMuted, fontSize: 10 }}>CRM O01 · Client, Fournisseur, Prestataire, Partenaire — KYC & suivi</div>
          </div>
          <button onClick={() => { setShowClientForm(false); setEditingClientId(null); setClientForm(clientFormInit); }} style={{ marginLeft: "auto", background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {["PERSONNE_MORALE", "PERSONNE_PHYSIQUE"].map(t => (
            <button key={t} onClick={() => setClientForm(f => ({ ...f, type: t }))}
              style={{ background: clientForm.type === t ? "#F97316" : "transparent", color: clientForm.type === t ? "#fff" : T.textMuted, border: `1px solid ${clientForm.type === t ? "#F97316" : T.border}`, borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>
              {_PARTNER_TYPES_LABELS[t]}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { k:"CLIENT", l:"🤝 Client", c:"#F97316" },
            { k:"FOURNISSEUR", l:"📦 Fournisseur", c:"#3B82F6" },
            { k:"PRESTATAIRE", l:"🔧 Prestataire", c:"#8B5CF6" },
            { k:"PARTENAIRE", l:"🌐 Partenaire", c:"#22C55E" },
            { k:"PROSPECT", l:"🔍 Prospect", c:"#F59E0B" },
            { k:"AUTRE", l:"📋 Autre", c:"#6B7280" },
          ].map(cat => (
            <button key={cat.k} onClick={() => setClientForm(f => ({ ...f, categorie: cat.k }))}
              style={{ background: clientForm.categorie === cat.k ? cat.c+"22" : "transparent", color: clientForm.categorie === cat.k ? cat.c : T.textMuted, border: `1px solid ${clientForm.categorie === cat.k ? cat.c+"66" : T.border}`, borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontWeight: clientForm.categorie === cat.k ? 700 : 400, fontSize: 10 }}>
              {cat.l}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Nom / Raison sociale *</label>
            <input value={clientForm.nom} onChange={e => setClientForm(f => ({ ...f, nom: e.target.value }))} placeholder={clientForm.type === "PERSONNE_MORALE" ? "SARL Omega Gabon, SA Petroline..." : "NGUEMA Jean-Baptiste..."}
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, boxSizing: "border-box", marginTop: 3 }} />
          </div>
          {clientForm.type === "PERSONNE_MORALE" && <>
            <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>RCCM</label>
              <input value={clientForm.rccm} onChange={e => setClientForm(f => ({ ...f, rccm: e.target.value }))} placeholder="LBV-2024-B-12345"
                style={{ width: "100%", background: T.surface2, border: `1px solid ${clientForm.rccm ? "#22C55E44" : T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
            <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>NIF</label>
              <input value={clientForm.nif} onChange={e => setClientForm(f => ({ ...f, nif: e.target.value }))} placeholder="281535L"
                style={{ width: "100%", background: T.surface2, border: `1px solid ${clientForm.nif ? "#22C55E44" : T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
            <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Activité principale</label>
              <input value={clientForm.activite} onChange={e => setClientForm(f => ({ ...f, activite: e.target.value }))} placeholder="Négoce général, BTP..."
                style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
          </>}
          {clientForm.type === "PERSONNE_PHYSIQUE" && <>
            <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Prénom</label>
              <input value={clientForm.prenom} onChange={e => setClientForm(f => ({ ...f, prenom: e.target.value }))}
                style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
            <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Pièce d'identité</label>
              <select value={clientForm.pieceIdentite} onChange={e => setClientForm(f => ({ ...f, pieceIdentite: e.target.value }))}
                style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, marginTop: 3 }}>
                {["CNI", "Passeport", "Carte de séjour", "Laissez-passer"].map(p => <option key={p} value={p}>{p}</option>)}
              </select></div>
            <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Numéro pièce</label>
              <input value={clientForm.numeroPiece} onChange={e => setClientForm(f => ({ ...f, numeroPiece: e.target.value }))}
                style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
            <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Nationalité</label>
              <input value={clientForm.nationalite} onChange={e => setClientForm(f => ({ ...f, nationalite: e.target.value }))}
                style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
            <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Profession</label>
              <input value={clientForm.profession} onChange={e => setClientForm(f => ({ ...f, profession: e.target.value }))}
                style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
          </>}
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Segment</label>
            <select value={clientForm.segment} onChange={e => setClientForm(f => ({ ...f, segment: e.target.value }))}
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, marginTop: 3 }}>
              {CRM_SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Secteur d'activité</label>
            <select value={clientForm.secteur} onChange={e => setClientForm(f => ({ ...f, secteur: e.target.value }))}
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, marginTop: 3 }}>
              <option value="">— Sélectionner —</option>
              {CRM_SECTEURS.map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Contact principal / Responsable</label>
            <input value={clientForm.responsable} onChange={e => setClientForm(f => ({ ...f, responsable: e.target.value }))} placeholder="Nom du contact"
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Téléphone</label>
            <input value={clientForm.tel} onChange={e => setClientForm(f => ({ ...f, tel: e.target.value }))} placeholder="+241 00 00 00 00"
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Email</label>
            <input value={clientForm.email} onChange={e => setClientForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@client.com"
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Adresse (Libreville)</label>
            <input value={clientForm.adresse} onChange={e => setClientForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Quartier, avenue..."
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Statut client</label>
            <select value={clientForm.statut} onChange={e => setClientForm(f => ({ ...f, statut: e.target.value }))}
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, marginTop: 3 }}>
              {CRM_STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Processus principal</label>
            <select value={clientForm.process || "O01"} onChange={e => setClientForm(f => ({ ...f, process: e.target.value }))}
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, marginTop: 3 }}>
              {CRM_PROCS_METIER.map(p => <option key={p.k} value={p.k}>{p.l}</option>)}
            </select></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Niveau de risque KYC</label>
            <select value={clientForm.riskLevel} onChange={e => setClientForm(f => ({ ...f, riskLevel: e.target.value }))}
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, marginTop: 3 }}>
              {CRM_RISKS.map(r => <option key={r.k} value={r.k}>{r.l}</option>)}
            </select></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Statut KYC</label>
            <select value={clientForm.kycStatut || "EN_ATTENTE"} onChange={e => setClientForm(f => ({ ...f, kycStatut: e.target.value }))}
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, marginTop: 3 }}>
              {CRM_KYC.map(k => <option key={k.k} value={k.k}>{k.l}</option>)}
            </select></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Source d'acquisition</label>
            <select value={clientForm.sourceAcquisition} onChange={e => setClientForm(f => ({ ...f, sourceAcquisition: e.target.value }))}
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, marginTop: 3 }}>
              {CRM_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Chargé de dossier</label>
            <select value={clientForm.assignedTo} onChange={e => setClientForm(f => ({ ...f, assignedTo: e.target.value }))}
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, marginTop: 3 }}>
              <option value="">— Auto —</option>
              {users.filter(u => _activeUser(u) && !u.isAdmin && u.level >= 2).map(u => <option key={u.id} value={u.id}>{u.name} ({u.process})</option>)}
            </select></div>
          <div style={{ gridColumn: "1/-1" }}><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Notes KYC / conformité</label>
            <input value={clientForm.kycNotes} onChange={e => setClientForm(f => ({ ...f, kycNotes: e.target.value }))} placeholder="Observations conformité, justificatifs reçus..."
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, boxSizing: "border-box", marginTop: 3 }} /></div>
          <div style={{ gridColumn: "1/-1" }}><label style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Notes internes O01</label>
            <textarea value={clientForm.notes} onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Historique, particularités, instructions de suivi..."
              style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", color: T.text, fontSize: 11, resize: "vertical", boxSizing: "border-box", marginTop: 3 }} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={handleSaveClient} style={{ flex: 1, background: "#F97316", border: "none", color: "#fff", borderRadius: 8, padding: "10px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
            {editingClientId ? "✅ Mettre à jour" : "✅ Créer le contact"}
          </button>
          <button onClick={() => { setShowClientForm(false); setEditingClientId(null); setClientForm(clientFormInit); }}
            style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}



export function GestionDocsUnifiee({ T, currentUser, dossiers=[], setDossiers=_noop, taches=[], setTaches=_noop, users=[], partners=[], setNotifications=_noop, docs=[], setDocs=_noop, dossierFiles=[], saveDossierFiles=_noop }){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'docs',
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
      } catch(e) { console.error('[upload docs]', file.name, e.message); }
    }
    return results;
  };

  // ── Dialogues React (remplace window.alert/confirm/prompt) ────────
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  // Accès au contexte SI pour partners CRUD + rdvs + setRdvs
  const si = useSI();
  const siPartners = si?.partners || partners;
  const setPartnersSync = si?.setPartnersSync || _noop;
  const rdvs = si?.rdvs || [];
  const setRdvs = si?.setRdvs || _noop;
  const lvl = currentUser?.level || 1;
  const isAdmin = currentUser?.isAdmin || lvl >= 6;
  const canManageCRM = isAdmin || lvl >= 3 || currentUser?.process === "O01" || (currentUser?.processes||[]).includes("O01");

  // ── Données Docs & Archives ──────────────────────────────────────────────
  const [tab, setTab] = useState("dossiers");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProcess, setFilterProcess] = useState("all");
  const [filterNature, setFilterNature] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [selectedDossierIds2, setSelectedDossierIds2] = useState([]);
  const [archives, setArchives] = useState(()=>{try{return JSON.parse(_lsGet("gc-docs-archives")||"[]");}catch (_) {return [];}});
  const [selected, setSelected] = useState(null);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDoc, setNewDoc] = useState({category:"CONTRAT",dossierId:"",clientId:"",tags:"",notes:"",process:"O01"});
  // FIX v154 — État des fichiers sélectionnés en attente de confirmation (évite fermeture prématurée)
  const [pendingDocFiles, setPendingDocFiles] = useState([]);
  const [codifRules, setCodifRules] = useState(()=>{try{return JSON.parse(_lsGet("gc-codif-rules")||"null")||[{process:"O01",prefix:"O01",desc:"Administration Générale"},{process:"O02",prefix:"O02",desc:"Droit des Affaires"},{process:"S01",prefix:"S01",desc:"Finance & Comptabilité"},{process:"S03",prefix:"S03",desc:"Ressources Humaines"},{process:"P02",prefix:"P02",desc:"Gouvernance"}];}catch (_) {return [];}});
  const fileRef = useRef(null);
  // FIX v123 — Listener pour navigation directe vers un onglet (ex: bouton ⚙️ Config délais du dashboard)
  useEffect(() => {
    const handler = (e) => { if (e.detail) { setTab(e.detail); setSelectedClient(null); } };
    window.addEventListener("gc:docs-set-tab", handler);
    return () => window.removeEventListener("gc:docs-set-tab", handler);
  }, []);
  // FIX v123 — Edit document state (was missing — documents non modifiables)
  const [editingDocId, setEditingDocId] = useState(null);
  const [editDocForm, setEditDocForm] = useState({});
  const canEditDoc = isAdmin || lvl >= 3 ||
    currentUser?.process === "O01" || (currentUser?.processes||[]).includes("O01");
  const openEditDoc = (doc) => {
    setEditDocForm({
      name: doc.name, category: doc.category||"CONTRAT",
      dossierId: doc.dossierId||"", clientId: doc.clientId||"",
      tags: (doc.tags||[]).join(", "), notes: doc.notes||"",
      process: doc.process||"O01", status: doc.status||"ACTIF",
    });
    setEditingDocId(doc.id);
  };
  const saveEditDoc = () => {
    if (!editDocForm.name?.trim()) { gcAlert("Le nom du document est obligatoire."); return; }
    saveDocs(docs.map(d => d.id !== editingDocId ? d : {
      ...d,
      name: editDocForm.name.trim(),
      category: editDocForm.category,
      dossierId: editDocForm.dossierId,
      clientId: editDocForm.clientId,
      tags: (editDocForm.tags||"").split(",").map(t=>t.trim()).filter(Boolean),
      notes: editDocForm.notes,
      process: editDocForm.process,
      status: editDocForm.status,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name||"—",
    }));
    setEditingDocId(null);
    playSound("success");
  };

  // ── CRM — Données complémentaires (enrichissement partners) ──────────────
  // Relances O01 (call center, suivi client)
  const [relances, setRelancesRaw] = useState(()=>{try{return JSON.parse(_lsGet("gc-crm-relances")||"[]");}catch(_){return [];}});
  const saveRelances = React.useCallback(v => { setRelancesRaw(v); try{_lsSet("gc-crm-relances",JSON.stringify(v));}catch(_){} dsSave("gc-crm-relances",v).catch(err => gcToast.syncError('', err)); }, []);

  // Historique interactions (appels, visites, emails...)
  const [interactions, setInteractionsRaw] = useState(()=>{try{return JSON.parse(_lsGet("gc-crm-interactions")||"[]");}catch(_){return [];}});
  const saveInteractions = React.useCallback(v => { setInteractionsRaw(v); try{_lsSet("gc-crm-interactions",JSON.stringify(v));}catch(_){} dsSave("gc-crm-interactions",v).catch(err => gcToast.syncError('', err)); }, []);

  // Opportunités commerciales
  const [opps, setOppsRaw] = useState(()=>{try{return JSON.parse(_lsGet("gc-crm-opps")||"[]");}catch(_){return [];}});
  const saveOpps = React.useCallback(v => { setOppsRaw(v); try{_lsSet("gc-crm-opps",JSON.stringify(v));}catch(_){} dsSave("gc-crm-opps",v).catch(err => gcToast.syncError('', err)); }, []);

  // KYC — synchro avec gc-jur-kyc (JuridiqueApp)
  const [kycData, setKycDataRaw] = useState(()=>{try{return JSON.parse(_lsGet("gc-jur-kyc")||"[]");}catch(_){return [];}});
  const saveKycData = React.useCallback(v => { setKycDataRaw(v); try{_lsSet("gc-jur-kyc",JSON.stringify(v)); dsSave("gc-jur-kyc",v).catch(err => gcToast.syncError('', err));}catch(_){} dsSave("gc-jur-kyc",v).catch(err => gcToast.syncError('', err)); }, []);

  // Sync temps-réel : rafraîchit les données CRM quand un autre utilisateur les modifie
  useRemoteSync({
    'gc-crm-interactions': setInteractionsRaw,
    'gc-crm-opps':         setOppsRaw,
    'gc-crm-relances':     setRelancesRaw,
    'gc-jur-kyc':          setKycDataRaw,
  });

  // ── CRM — États UI ───────────────────────────────────────────────────────
  const [crmTab, setCrmTab] = useState("portefeuille");
  const [crmSearch, setCrmSearch] = useState("");
  const [crmFilter, setCrmFilter] = useState({statut:"ALL",type:"ALL",risk:"ALL",process:"ALL"});
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetailTab, setClientDetailTab] = useState("profil");
  const [docSubTab, setDocSubTab] = useState("tous"); // v99 — sous-onglets KYC/Dossier
  // ── Facturation tab — droits écriture O01 niv.3+/DG/Admin ──────────────────
  // v110: le tab utilise directement FacturationModule (même composant que Finance S01)
  const canEditFactDoc = isAdmin || lvl >= 5 ||
    ((currentUser?.process === "O01" || (currentUser?.processes||[]).includes("O01")) && lvl >= 3);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);

  // FIX v127 — clientFormInit stabilisé avec useMemo : évite re-création à chaque render
  // et empêche le re-mount / rechargement de la modale "+ Client"
  const clientFormInit = useMemo(() => ({
    nom:"", type:"PERSONNE_MORALE", categorie:"CLIENT", statut:"PROSPECT", segment:"PME",
    rccm:"", nif:"", activite:"", secteur:"", adresse:"", ville:"Libreville", pays:"Gabon",
    responsable:"", tel:"", email:"", siteWeb:"",
    riskLevel:"FAIBLE", kycStatut:"EN_ATTENTE", kycNotes:"",
    sourceAcquisition:"RECOMMANDATION", assignedTo:currentUser?.id||"", notes:"",
    process:"O01",
    // Personne physique
    prenom:"", dateNaissance:"", lieuNaissance:"", nationalite:"Gabonaise",
    pieceIdentite:"CNI", numeroPiece:"", profession:"",
   
  }), [currentUser?.id]);
  const [clientForm, setClientForm] = useState(clientFormInit);

  // FIX v127 — form inits stabilisés avec useMemo
  const relanceInit = useMemo(()=>({clientId:"", objet:"", type:"APPEL", dateRelance:"", priorite:"NORMALE", notes:"", assignedTo:currentUser?.id||""}),[currentUser?.id]);
  const [showRelanceForm, setShowRelanceForm] = useState(false);
  const [relanceForm, setRelanceForm] = useState(relanceInit);

  const interInit = useMemo(()=>({clientId:"", type:"APPEL", objet:"", notes:"", duree:15, resultat:""}),[]);
  const [showInterForm, setShowInterForm] = useState(false);
  const [interForm, setInterForm] = useState(interInit);

  const oppInit = useMemo(()=>({clientId:"", titre:"", valeur:0, etape:"PROSPECT", probabilite:20, dateEcheance:"", notes:""}),[]);
  const [showOppForm, setShowOppForm] = useState(false);
  const [oppForm, setOppForm] = useState(oppInit);

  // Upload docs client
  const clientDocRef = useRef(null);
  const [clientDocUpload, setClientDocUpload] = useState({clientId:"", category:"CONTRAT"});
  const [aiAnalyse, setAiAnalyse] = useState({loading:false, result:"", clientId:""});

  // FIX v127 — Constantes CRM : références aux constantes statiques hors composant (évite re-création chaque render)
  const CRM_SEGMENTS = CRM_SEGMENTS_C;
  const CRM_SECTEURS = CRM_SECTEURS_C;
  const CRM_SOURCES  = CRM_SOURCES_C;
  const CRM_TYPES_INTERACTION = CRM_TYPES_INTERACTION_C;
  const CRM_TYPES_RELANCE     = CRM_TYPES_RELANCE_C;
  const CRM_ETAPES   = CRM_ETAPES_C;
  const CRM_RISKS    = CRM_RISKS_C;
  const CRM_KYC      = CRM_KYC_C;
  const CRM_STATUTS  = CRM_STATUTS_C;
  const CRM_PROCS_METIER = CRM_PROCS_METIER_C;

  const today = new Date().toISOString().split("T")[0];

  // ── CRM — Helpers données ─────────────────────────────────────────────────
  // FIX v129 — allClients inclut TOUS les types de collaborateurs externes (fournisseur, regulateur, etat, prestataire…)
  const allClients = React.useMemo(() => {
    const pClients = siPartners.filter(p => ["client","prospect","partenaire","fournisseur","regulateur","etat","prestataire"].includes(p.type));
    // Enrichissement depuis kycData pour les champs KYC
    return pClients.map(p => {
      const kyc = kycData.find(k => k.nom?.toLowerCase() === p.nom?.toLowerCase() || k.partnerId === p.id);
      return {
        ...p,
        rccm: p.rccm || kyc?.rccm || "",
        nif: p.nif || kyc?.nif || "",
        riskLevel: p.riskLevel || kyc?.riskLevel || "FAIBLE",
        kycStatut: p.kycStatut || kyc?.statut || "EN_ATTENTE",
        kycDate: p.kycDate || kyc?.createdAt || "",
        kycValidePar: p.kycValidePar || kyc?.validePar || "",
        statut: p.statut || "PROSPECT",
        segment: p.segment || "PME",
        assignedTo: p.assignedTo || "",
        sourceAcquisition: p.sourceAcquisition || "—",
        interactions: (interactions.filter(i=>i.clientId===p.id)).length,
        lastContact: interactions.filter(i=>i.clientId===p.id).sort((a,b)=>new Date(b.at)-new Date(a.at))[0]?.at || p.createdAt || "",
      };
    });
  }, [siPartners, kycData, interactions]);

  const filteredClients = React.useMemo(() => {
    const q = crmSearch.toLowerCase();
    return allClients.filter(c => {
      const matchSearch = !q || c.nom?.toLowerCase().includes(q) || c.responsable?.toLowerCase().includes(q)
        || c.email?.toLowerCase().includes(q) || c.nif?.toLowerCase().includes(q)
        || c.rccm?.toLowerCase().includes(q) || c.secteur?.toLowerCase().includes(q)
        || c.tel?.toLowerCase().includes(q);
      const matchStatut  = crmFilter.statut === "ALL" || c.statut === crmFilter.statut;
      const matchType    = crmFilter.type   === "ALL" || c.type   === crmFilter.type;
      const matchRisk    = crmFilter.risk   === "ALL" || c.riskLevel === crmFilter.risk;
      return matchSearch && matchStatut && matchType && matchRisk;
    });
  }, [allClients, crmSearch, crmFilter]);

  // Dossiers d'un client
  const clientDossiers = id => dossiers.filter(d => d.partnerId===id || allClients.find(c=>c.id===id)?.nom===d.client);
  // Documents d'un client
  const clientDocs = id => {
    const clientDoss = clientDossiers(id);
    const dossierDocIds = clientDoss.flatMap(d => d.fileIds || []);
    const docsFromDossiers = dossierFiles.filter(df => dossierDocIds.includes(df.id) || clientDoss.some(d => d.id === df.dossierId));
    return [...docs.filter(d => d.clientId===id || (d.dossierId && clientDoss.find(x=>x.id===d.dossierId))), ...docsFromDossiers];
  };
  // RDVs d'un client
  const clientRdvs = id => rdvs.filter(r => r.partnerId===id || allClients.find(c=>c.id===id)?.nom===r.client);
  // Interactions d'un client
  const clientInter = id => interactions.filter(i=>i.clientId===id).sort((a,b)=>new Date(b.at)-new Date(a.at));
  // Relances d'un client
  const clientRelances = id => relances.filter(r=>r.clientId===id);
  // Opportunités d'un client
  const clientOpps = id => opps.filter(o=>o.clientId===id);
  // Honoraires Finance (journal) liés au client
  const clientHonoraires = id => {
    const client = allClients.find(c=>c.id===id);
    if (!client) return [];
    try {
      const journal = JSON.parse(_lsGet("gc-journal")||"[]");
      // Dossiers liés à ce client
      const clientDossiersIds = new Set(
        dossiers.filter(d => d.partnerId===id || d.client?.toLowerCase()===client.nom?.toLowerCase())
          .map(d => d.id)
      );
      const journalEntries = journal.filter(e =>
        (e.tiers||"").toLowerCase().includes(client.nom.toLowerCase()) ||
        (e.dossierId && clientDossiersIds.has(e.dossierId))
      );
      // v99 — Enrichir avec les factures réelles (gc-factures)
      let factures = []; try { factures = JSON.parse(_lsGet("gc-factures")||"[]"); } catch(_) {} // FIX v127
      const clientFactures = factures.filter(f =>
        (f.client||"").toLowerCase().includes(client.nom.toLowerCase()) ||
        (f.partnerId === id)
      ).map(f => ({
        ...f,
        _isFact: true,
        date: f.dateEmission || f.createdAt?.slice(0,10) || "",
        libelle: `Facture ${f.ref||f.id} — ${f.objet||""}`,
        debit: f.ttc || f.montantHT || 0,
        tiers: f.client,
      }));
      return [...journalEntries, ...clientFactures];
    } catch(_) { return []; }
  };

  // Stats globales CRM
  const crmStats = React.useMemo(() => {
    // FIX v129 — facturesPending et montantFacture manquants du CRM dashboard
    let allFactures = [];
    try { allFactures = JSON.parse(_lsGet("gc-factures") || "[]"); } catch(_) {}
    const facturesPending = allFactures.filter(f =>
      f.statut === "EN_ATTENTE" || f.statut === "ENVOYE" || f.statut === "IMPAYE"
    ).length;
    const montantFacture = allFactures
      .filter(f => f.statut !== "ANNULE")
      .reduce((s, f) => s + (Number(f.ttc) || Number(f.montantHT) || 0), 0);
    const montantEncaisse = allFactures
      .filter(f => f.statut === "PAYE" || f.statut === "PARTIEL")
      .reduce((s, f) => s + (Number(f.montantPaye) || Number(f.ttc) || 0), 0);
    return {
      total:     allClients.length,
      actifs:    allClients.filter(c=>c.statut==="ACTIF").length,
      prospects: allClients.filter(c=>c.statut==="PROSPECT").length,
      vip:       allClients.filter(c=>c.statut==="VIP").length,
      kycPending:allClients.filter(c=>c.kycStatut==="EN_ATTENTE"||c.kycStatut==="EN_COURS").length,
      relancesRetard: relances.filter(r=>r.dateRelance<today&&r.statut!=="FAIT").length,
      relancesAujourd: relances.filter(r=>r.dateRelance===today&&r.statut!=="FAIT").length,
      oppsEnCours: opps.filter(o=>!["CONVERTI","PERDU"].includes(o.etape)).length,
      pipelineVal: opps.filter(o=>!["CONVERTI","PERDU"].includes(o.etape))
        .reduce((s,o)=>s+(Number(o.valeur)||0)*(Number(o.probabilite)||0)/100, 0),
      facturesPending,
      montantFacture,
      montantEncaisse,
    };
  }, [allClients, relances, opps, today]);

  // ── CRM — Actions ─────────────────────────────────────────────────────────
  const handleSaveClient = () => {
    if (!clientForm.nom.trim()) { gcAlert("Le nom est obligatoire."); return; }
    const now = new Date().toISOString();
    const pid = editingClientId || `CLI-${Date.now()}`;

    if (editingClientId) {
      // Mise à jour partner existant
      setPartnersSync(prev => prev.map(p => p.id === editingClientId
        ? {...p, ...clientForm, id:editingClientId, updatedAt:now, updatedBy:currentUser?.name}
        : p
      ));
      setNotifications && setNotifications(p=>[{id:"N"+Date.now(),icon:"✏️",message:`Fiche client mise à jour : ${clientForm.nom}`,at:now,read:false,module:"crm"},...p]);
    } else {
      // Nouveau client
      // FIX v150 — type doit être la catégorie métier en minuscule ("client","fournisseur"…)
      // clientForm.type = type juridique (PERSONNE_MORALE/PHYSIQUE) → stocké dans personneType
      // clientForm.categorie = catégorie CRM (CLIENT/FOURNISSEUR/PARTENAIRE…) → devient le type
      const newPartner = {
        ...clientForm, id:pid,
        type: (clientForm.categorie || "CLIENT").toLowerCase(),
        personneType: clientForm.type,           // ← type juridique préservé ici
        categorie: clientForm.categorie || "CLIENT",
        dossiersIds:[], docsIds:[], rdvsIds:[],
        createdAt:now, createdBy:currentUser?.id, createdByName:currentUser?.name,
      };
      setPartnersSync(prev => [newPartner, ...prev]);
      // Sync KYC vers JuridiqueApp si données KYC
      if (clientForm.rccm || clientForm.nif) {
        const newKyc = {
          id:"KYC-"+Date.now(), nom:clientForm.nom, type:clientForm.type,
          rccm:clientForm.rccm, nif:clientForm.nif, activite:clientForm.activite,
          adresse:clientForm.adresse, responsable:clientForm.responsable,
          tel:clientForm.tel, email:clientForm.email,
          riskLevel:clientForm.riskLevel, statut:clientForm.kycStatut||"EN_ATTENTE",
          notes:clientForm.kycNotes, partnerId:pid,
          createdBy:currentUser?.name, createdAt:now, docs:[],
        };
        saveKycData([newKyc, ...kycData]);
      }
      setNotifications && setNotifications(p=>[{id:"N"+Date.now(),icon:"🤝",message:`Nouveau contact : ${clientForm.nom} (${clientForm.categorie||clientForm.segment}) — O01`,at:now,read:false,module:"crm"},...p]);
      playSound("success");
    }
    setShowClientForm(false); setClientForm(clientFormInit); setEditingClientId(null);
  };

  const handleDeleteClient = async (id) => {
    if (!await gcConfirm("Supprimer ce client du portefeuille ? Les dossiers et documents restent.", "Confirmer la suppression", "🗑️", true)) return;
    // FIX v153 — dsDeleteItemFromArray : tombstone + endpoint serveur atomique + forceOverwrite
    await dsDeleteItemFromArray("partners", id);
    setPartnersSync(prev => prev.filter(p=>p.id!==id));
    if (selectedClient?.id === id) setSelectedClient(null);
    playSound("delete");
  };

  const handleValidateKYC = (clientId, statut) => {
    const now = new Date().toISOString();
    const client = allClients.find(c=>c.id===clientId);
    setPartnersSync(prev => prev.map(p => p.id===clientId
      ? {...p, kycStatut:statut, kycDate:now, kycValidePar:currentUser?.name}
      : p
    ));
    // Sync vers JuridiqueApp
    const kycIdx = kycData.findIndex(k=>k.partnerId===clientId||k.nom===client?.nom);
    if (kycIdx>=0) {
      const updated = [...kycData];
      updated[kycIdx] = {...updated[kycIdx], statut:statut==="VALIDE"?"ACTIF":"SUSPENDU", validePar:currentUser?.name, valideAt:now};
      saveKycData(updated);
    }
    setNotifications && setNotifications(p=>[{id:"N"+Date.now(),icon:statut==="VALIDE"?"✅":"❌",
      message:`KYC ${statut==="VALIDE"?"validé":"refusé"} : ${client?.nom} — par ${currentUser?.name}`,
      at:now,read:false,module:"crm"},...p]);
    // Mettre à jour selectedClient
    if (selectedClient?.id === clientId) setSelectedClient(prev=>({...prev,kycStatut:statut,kycDate:now,kycValidePar:currentUser?.name}));
    playSound(statut==="VALIDE"?"success":"alarm");
  };

  const handleSaveRelance = () => {
    if (!relanceForm.clientId||!relanceForm.objet.trim()) { gcAlert("Client et objet obligatoires."); return; }
    const now = new Date().toISOString();
    const newR = {...relanceForm, id:"REL-"+Date.now(), createdAt:now, createdBy:currentUser?.id, statut:"EN_ATTENTE"};
    saveRelances([newR,...relances]);
    if (relanceForm.assignedTo && relanceForm.assignedTo !== currentUser?.id) {
      gcPushNotif(relanceForm.assignedTo, {id:"N"+Date.now()+relanceForm.assignedTo, icon:"🔔",
        message:`🔔 Relance à effectuer : "${relanceForm.objet}" (${relanceForm.type}) — ${relanceForm.dateRelance}`,
        at:now, read:false, module:"crm"});
    }
    setShowRelanceForm(false); setRelanceForm(relanceInit); playSound("notif");
  };

  const handleSaveInteraction = () => {
    if (!interForm.clientId||!interForm.objet.trim()) { gcAlert("Client et objet obligatoires."); return; }
    const now = new Date().toISOString();
    const newI = {...interForm, id:"INT-"+Date.now(), at:now, by:currentUser?.id, byName:currentUser?.name};
    saveInteractions([newI,...interactions]);
    // Mettre à jour lastContact du partner
    setPartnersSync(prev=>prev.map(p=>p.id===interForm.clientId?{...p,lastContact:now}:p));
    setShowInterForm(false); setInterForm(interInit); playSound("success");
  };

  const handleSaveOpp = () => {
    if (!oppForm.clientId||!oppForm.titre.trim()) { gcAlert("Client et titre obligatoires."); return; }
    const now = new Date().toISOString();
    const newO = {...oppForm, id:"OPP-"+Date.now(), createdAt:now, createdBy:currentUser?.id};
    saveOpps([newO,...opps]);
    setShowOppForm(false); setOppForm(oppInit); playSound("success");
  };

  const handleUploadClientDoc = async (e, clientId) => {
    const fs = Array.from(e.target.files||[]);
    e.target.value = "";
    if (!fs.length) return;
    const proc = "O01";
    const rule  = codifRules.find(r=>r.process===proc) || {prefix:"O01"};
    const newDocs = [];
    for (const f of fs) {
      let ref = null;
      try {
        ref = await gcFileSave(f, {
          module: 'docs', dossierId: clientId,
          uploadedBy: currentUser?.id, uploadedByName: currentUser?.name,
          nom: f.name, taille: f.size, type: f.type,
        });
      } catch (err) { console.error('[Docs CRM] upload item:', err, f.name); }
      newDocs.push({
        ...(ref || {}),
        id:    ref?.id || "D"+Date.now()+Math.random().toString(36).slice(2,4),
        name:  f.name,
        type:  f.name.split(".").pop().toUpperCase(),
        size:  (f.size/1024).toFixed(0)+"Ko",
        codif: `${rule.prefix}-${new Date().getFullYear()}-${String(docs.length+newDocs.length+1).padStart(4,"0")}`,
        category:    clientDocUpload.category || "CONTRAT",
        clientId,
        dossierId:   "",
        tags:        [],
        notes:       "",
        createdBy:   currentUser?.name,
        createdAt:   new Date().toISOString(),
        status:      "ACTIF",
        process:     "O01",
        serverUrl:   ref?.serverUrl  || null,
        serverId:    ref?.serverId   || null,
        storageType: ref?.storageType || 'local',
        url:         ref?.serverUrl  || ref?.dataUrl || null,
        dataUrl:     null, // FIX v153 — jamais de base64 dans saveDocs
      });
    }
    const updated = [...newDocs, ...docs];
    // FIX v154 — Utiliser saveDocs() pour garantir la persistance dans toutes les clés (gc-si-docs, gc-docs-unified, etc.)
    saveDocs(updated);
    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📁",
      message:`${newDocs.length} doc(s) ajouté(s) au dossier client ${allClients.find(cl=>cl.id===clientId)?.nom||""}`,
      at:new Date().toISOString(),read:false,module:"crm"},...p]);
  };

  const handleAiAnalyse = async (client) => {
    if (!client) return;
    setAiAnalyse({loading:true,result:"",clientId:client.id});
    const dos = clientDossiers(client.id);
    const inters = clientInter(client.id);
    const hon = clientHonoraires(client.id);
    const totalHon = hon.reduce((s,e)=>(s+parseFloat(e.debit||0)),0);
    const prompt = `Tu es l'assistant IA du cabinet Génie Consultant à Libreville, Gabon.
Analyse le profil CRM client suivant et fournis :
1. Résumé synthétique du profil (3 phrases max)
2. Évaluation du niveau de risque KYC et recommandations
3. Opportunités commerciales identifiées (3 points concrets pour ce cabinet)
4. Actions O01 recommandées (accueil, suivi, relances, archivage)
5. Points de vigilance conformité OHADA/CEMAC/COBAC

PROFIL CLIENT :
Nom : ${client.nom} | Type : ${client.type} | Segment : ${client.segment}
Secteur : ${client.secteur||"—"} | Statut : ${client.statut}
RCCM : ${client.rccm||"Non renseigné"} | NIF : ${client.nif||"Non renseigné"}
Risque KYC : ${client.riskLevel} | Statut KYC : ${client.kycStatut}
Responsable : ${client.responsable||"—"} | Tel : ${client.tel||"—"}
Adresse : ${client.adresse||"—"} | Source : ${client.sourceAcquisition||"—"}
Dossiers actifs : ${dos.filter(d=>d.status!=="TERMINE").length} | Total dossiers : ${dos.length}
Interactions enregistrées : ${inters.length}
Honoraires facturés (SI Finance) : ${totalHon.toLocaleString("fr-FR")} FCFA
Notes : ${client.notes||"Aucune"}`;
    try {
      const res = await gcAICall(prompt,[{role:"user",text:"Analyse ce client"}]);
      setAiAnalyse({loading:false, result:res?.text||"", clientId:client.id});
    } catch(e) {
      setAiAnalyse({loading:false, result:"❌ IA indisponible : "+e.message, clientId:client.id});
    }
  };

  // ── Badges CRM ────────────────────────────────────────────────────────────
  const RiskBadge = ({level}) => {
    const r = CRM_RISKS.find(x=>x.k===level)||CRM_RISKS[0];
    return <span style={{background:r.bg,color:r.c,border:`1px solid ${r.c}44`,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>{r.l}</span>;
  };
  const KycBadge = ({statut}) => {
    const k = CRM_KYC.find(x=>x.k===statut)||CRM_KYC[0];
    return <span style={{background:k.c+"15",color:k.c,border:`1px solid ${k.c}44`,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>{k.l}</span>;
  };
  const StatutBadge = ({statut}) => {
    const colors={PROSPECT:"#6B7280",ACTIF:"#22C55E",INACTIF:"#F59E0B",VIP:"#C9A84C",SUSPENDU:"#EF4444",ARCHIVE:"#374151"};
    const c = colors[statut]||"#6B7280";
    return <span style={{background:c+"15",color:c,border:`1px solid ${c}44`,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>{statut}</span>;
  };

  const saveDocs = d => {
    setDocs(d);
    // FIX v153 CRITICAL — strip dataUrl avant dsSave (évite payload > 10 MB et échec silencieux)
    // Conserver serverUrl/serverId pour que les autres machines puissent accéder aux fichiers
    const forSync = d.slice(0,300).map(x=>({
      ...x,
      dataUrl: null,          // jamais de base64 dans gc-docs-unified / gc-standalone-docs
      blob:    undefined,
      url:     x.serverUrl || x.url || null, // url = serverUrl si disponible
    }));
    // FIX v154 — Sauvegarder dans TOUTES les clés attendues par AppRoot et les autres modules
    // pour garantir la cohérence inter-machines et après refresh.
    try { _lsSet("gc-si-docs",     JSON.stringify(forSync.slice(0,200))); } catch (_) {}
    try { _lsSet("gc-docs-unified", JSON.stringify(forSync.slice(0,200))); } catch (_) {}
    dsSave('gc-si-docs',        forSync).catch(() => {});
    dsSave('gc-docs-unified',   forSync).catch(() => {});
    dsSave('gc-standalone-docs', forSync).catch(() => {});
  };
  const saveArchives = a => {
    setArchives(a);
    try{_lsSet("gc-docs-archives",JSON.stringify(a.slice(0,300).map(x=>({...x,url:undefined}))));}catch (_) {}
  };

  const handleUpload = async e => {
    // FIX v154 — Accepte soit un Event natif, soit un objet synthétique {target:{files:[...]}}
    // créé par le bouton "Confirmer l'import".
    const fs = Array.from(e?.target?.files || []);
    if (!fs.length) return;
    e.target.value = "";
    const proc = newDoc.process || "O01";
    const rule  = codifRules.find(r=>r.process===proc) || {prefix:proc};
    const newDocs = [];
    for (const f of fs) {
      const codif = `${rule.prefix}-${new Date().getFullYear()}-${String(docs.length+newDocs.length+1).padStart(4,"0")}`;
      // FIX v153 — gcFileSave retourne une ref complète avec serverUrl si upload réussi
      let ref = null;
      try {
        ref = await gcFileSave(f, {
          module: 'docs',
          dossierId: newDoc.dossierId || null,
          uploadedBy: currentUser?.id,
          uploadedByName: currentUser?.name,
          nom: f.name, taille: f.size, type: f.type,
        });
      } catch (err) { console.error('[Docs] upload:', err, f.name); }
      newDocs.push({
        id: ref?.id || "D"+Date.now()+Math.random().toString(36).slice(2,4),
        name: f.name,
        type: f.name.split(".").pop().toUpperCase(),
        size: (f.size/1024).toFixed(0)+"Ko",
        codif,
        category:  newDoc.category,
        dossierId: newDoc.dossierId || null,
        clientId:  newDoc.clientId  || null,
        tags:      (newDoc.tags||"").split(",").map(t=>t.trim()).filter(Boolean),
        notes:     newDoc.notes || "",
        createdBy: currentUser?.name || "—",
        createdAt: new Date().toISOString(),
        status: "ACTIF",
        process: proc,
        // FIX v153 — conserver serverUrl ; url = serverUrl ou dataUrl (jamais null si dispo)
        serverUrl:   ref?.serverUrl  || null,
        serverId:    ref?.serverId   || null,
        storageType: ref?.storageType || 'local',
        url:         ref?.serverUrl  || ref?.dataUrl || null,
        dataUrl:     ref?.serverUrl  ? null : (ref?.dataUrl || null),
      });
    }
    saveDocs([...newDocs, ...docs]);
    setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"📁",message:`${newDocs.length} doc(s) importé(s) — ${proc}`,at:new Date().toISOString(),read:false},...p]);
    setShowNewDoc(false);
  };

  const downloadDoc = (doc) => gcDownloadDoc({ id:doc.id, serverUrl:doc.serverUrl, url:doc.url, dataUrl:doc.dataUrl, nom:doc.name, name:doc.name });
  const viewDoc    = (doc) => gcViewDoc({ id:doc.id, serverUrl:doc.serverUrl, url:doc.url, dataUrl:doc.dataUrl, nom:doc.name, name:doc.name });

  // FIX v153 — archiveDoc gère la suppression et archivage de document
  const archiveDoc = async doc => {
    const updated={...doc,status:"ARCHIVE",archivedAt:new Date().toISOString(),archivedBy:currentUser?.name};
    saveArchives([updated,...archives]);
    // FIX v153 — tombstone sur le doc archivé + forceOverwrite
    await dsDeleteItemFromArray("gc-standalone-docs", doc.id);
    saveDocs(docs.filter(d=>d.id!==doc.id));
  };

  const SC = {EN_COURS:"#3B82F6",A_TRAITER:"#F59E0B",EN_ATTENTE:"#8B5CF6",TERMINE:"#22C55E",URGENT:"#EF4444",SUSPENDU:"#6B7280"};
  const DI = {PDF:"📄",DOCX:"📝",DOC:"📝",XLSX:"📊",XLS:"📊",PNG:"🖼️",JPG:"🖼️",JPEG:"🖼️",DOSSIER:"📁",TXT:"📃",ZIP:"📦"};
  const CATS = ["CONTRAT","STATUTS","PV","CONVENTION","FACTURE","RAPPORT","COURRIER","JURIDIQUE","FISCAL","SOCIAL","CONFORMITE","AUTRE"];

  // FIX vDOCS-CLOSED — Tous les dossiers actifs ET terminés/archivés sont visibles
  // pour ne jamais perdre la trace des documents liés à des dossiers clôturés.
  const activeDossiers = dossiers.filter(d=>d.status!=="ANNULE");
  const closedDossiers = dossiers.filter(d=>["TERMINE","ARCHIVE"].includes(d.status));
  const filteredDossiers = activeDossiers.filter(d=>(filterStatus==="all"||d.status===filterStatus)&&(filterProcess==="all"||d.process===filterProcess)&&(!search||((d.ref||"")+(d.client||"")).toLowerCase().includes(search.toLowerCase())));
  const filteredDocs = docs.filter(d=>
    (filterProcess==="all"||d.process===filterProcess) &&
    (filterNature==="all"||(d.category||"AUTRE")===filterNature) &&
    (filterCategory==="all"||(d.type||d.category||"AUTRE")===filterCategory) &&
    (!search||(d.name+(d.tags||[]).join()).toLowerCase().includes(search.toLowerCase()))
  );
  // FIX vDOCS-CLOSED — Inclure dans allArchives les documents liés aux dossiers terminés/archivés
  const docsLinkedToClosedDossiers = docs.filter(d => d.dossierId && closedDossiers.some(cd => cd.id === d.dossierId));
  const allArchives = [
    ...archives,
    ...docsLinkedToClosedDossiers.filter(d => !archives.find(a => a.id === d.id)).map(d => ({
      ...d,
      category: d.category || "DOCUMENT_DOSSIER_CLOS",
      archivedAt: d.createdAt,
      archivedBy: d.createdBy,
      _fromClosedDossier: true,
      _linkedDossier: closedDossiers.find(cd => cd.id === d.dossierId),
    })),
    ...closedDossiers.map(d=>({id:"DS-"+d.id,name:`Dossier ${d.ref||""} — ${d.client||""}`,type:"DOSSIER",category:"DOSSIER_CLOS",archivedAt:d.updatedAt,isDossier:true, _docsCount: docs.filter(x=>x.dossierId===d.id).length}))
  ].filter(a=>!search||((a.name||"")+(a.category||"")).toLowerCase().includes(search.toLowerCase()));

  const docsPerDossier = docs.reduce((a,d)=>{if(d.dossierId){a[d.dossierId]=(a[d.dossierId]||0)+1;}return a;},{});

  // ── FORMULAIRE CLIENT ─────────────────────────────────────────────────────
  // FIX v129 — CRMClientFormModal et PARTNER_TYPES_LABELS déplacés hors du composant (voir début du fichier)



  // ── DETAIL CLIENT ─────────────────────────────────────────────────────────
  const ClientDetail = ({client}) => {
    const dos = clientDossiers(client.id);
    const cdocs = clientDocs(client.id);
    const crdvs = clientRdvs(client.id);
    const cinters = clientInter(client.id);
    const crels = clientRelances(client.id);
    const copps = clientOpps(client.id);
    const chon = clientHonoraires(client.id);
    const totalHon = chon.reduce((s,e)=>s+(parseFloat(e.debit||0)),0);

    return (
      <div style={{background:T.surface2,border:`2px solid #F9731644`,borderRadius:14,padding:16,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
          <div style={{width:52,height:52,borderRadius:12,background:"linear-gradient(135deg,#F97316,#EA580C)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
            {client.type==="PERSONNE_PHYSIQUE"?"👤":"🏢"}
          </div>
          <div style={{flex:1}}>
            <div style={{color:T.text,fontWeight:900,fontSize:16}}>{client.nom}</div>
            <div style={{color:T.textMuted,fontSize:11,marginTop:1}}>{client.segment||"—"} · {client.secteur||"—"} · {client.adresse||"Libreville"}</div>
            <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
              <StatutBadge statut={client.statut||"PROSPECT"}/>
              <RiskBadge level={client.riskLevel||"FAIBLE"}/>
              <KycBadge statut={client.kycStatut||"EN_ATTENTE"}/>
              {client.process&&<span style={{background:"#F9731615",color:"#F97316",border:"1px solid #F9731633",borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>{client.process}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap"}}>
            {canManageCRM&&<button onClick={async ()=>{setClientForm({...clientFormInit,...client});setEditingClientId(client.id);setShowClientForm(true);setSelectedClient(null);}}
              style={{background:"#F9731622",border:"1px solid #F9731644",color:"#F97316",borderRadius:7,padding:"5px 11px",cursor:"pointer",fontSize:11,fontWeight:700}}>✏️ Modifier</button>}
            <button onClick={()=>setSelectedClient(null)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"5px 9px",cursor:"pointer",fontSize:11}}>✕</button>
          </div>
        </div>

        {/* KPIs rapides */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7,marginBottom:12}}>
          {[
            {l:"Dossiers",v:dos.length,i:"📁",c:"#3B82F6"},
            {l:"Documents",v:cdocs.length,i:"📄",c:"#6366F1"},
            {l:"RDV",v:crdvs.length,i:"📅",c:"#22C55E"},
            {l:"Interactions",v:cinters.length,i:"💬",c:"#8B5CF6"},
            {l:"Honoraires",v:`${Math.round(totalHon/1000)}K FCFA`,i:"💰",c:"#C9A84C"},
          ].map(k=>(
            <div key={k.l} style={{background:T.surface,border:`1px solid ${k.c}22`,borderRadius:8,padding:"7px 8px",textAlign:"center"}}>
              <div style={{fontSize:14}}>{k.i}</div>
              <div style={{color:k.c,fontWeight:900,fontSize:15}}>{k.v}</div>
              <div style={{color:T.textMuted,fontSize:8}}>{k.l}</div>
            </div>
          ))}
        </div>

        {/* Onglets détail */}
        <div style={{display:"flex",gap:3,marginBottom:10,flexWrap:"wrap",borderBottom:`1px solid ${T.border}`,paddingBottom:7}}>
          {[
            {k:"profil",l:"📋 Profil"},
            {k:"kyc",l:"🏛️ KYC"},
            {k:"dossiers",l:`📁 Dossiers (${dos.length})`},
            {k:"documents",l:`📄 Docs (${cdocs.length})`},
            {k:"honoraires",l:`💰 Finance`},
            {k:"rdvs",l:`📅 RDV (${crdvs.length})`},
            {k:"interactions",l:`💬 Hist. (${cinters.length})`},
            {k:"relances",l:`🔔 Relances (${crels.length})`},
            {k:"opps",l:`💼 Opport. (${copps.length})`},
            {k:"ia",l:"✨ IA"},
          ].map(t=>(
            <button key={t.k} onClick={()=>setClientDetailTab(t.k)}
              style={{background:clientDetailTab===t.k?"#F97316":"transparent",color:clientDetailTab===t.k?"#fff":T.textMuted,
                border:`1px solid ${clientDetailTab===t.k?"#F97316":T.border}`,borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:9,fontWeight:clientDetailTab===t.k?700:400}}>
              {t.l}
            </button>
          ))}
        </div>

        {/* ── Profil ── */}
        {clientDetailTab==="profil"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            {[
              ["Type",client.type==="PERSONNE_PHYSIQUE"?"Personne physique":"Personne morale"],
              ["RCCM",client.rccm||"—"],["NIF",client.nif||"—"],
              ["Activité",client.activite||client.profession||"—"],
              ["Contact",client.responsable||"—"],["Téléphone",client.tel||"—"],
              ["Email",client.email||"—"],["Adresse",client.adresse||"—"],
              ["Source",client.sourceAcquisition||"—"],
              ["Chargé",users.find(u=>u.id===client.assignedTo)?.name||"—"],
              ["Créé le",client.createdAt?new Date(client.createdAt).toLocaleDateString("fr-FR"):"—"],
              ["Dernière interaction",client.lastContact?new Date(client.lastContact).toLocaleDateString("fr-FR"):"Jamais"],
            ].map(([k,v])=>(
              <div key={k} style={{background:T.surface,borderRadius:6,padding:"6px 9px"}}>
                <div style={{color:T.textMuted,fontSize:8,textTransform:"uppercase",fontWeight:700,marginBottom:2}}>{k}</div>
                <div style={{color:(!v||v==="—")?"#F59E0B":T.text,fontSize:11}}>{v||"⚠️ Non renseigné"}</div>
              </div>
            ))}
            {client.notes&&<div style={{gridColumn:"1/-1",background:T.surface,borderRadius:6,padding:"6px 9px"}}>
              <div style={{color:T.textMuted,fontSize:8,textTransform:"uppercase",fontWeight:700,marginBottom:2}}>Notes O01</div>
              <div style={{color:T.text,fontSize:11,whiteSpace:"pre-wrap"}}>{client.notes}</div>
            </div>}
          </div>
        )}

        {/* ── KYC ── */}
        {clientDetailTab==="kyc"&&(
          <div>
            <div style={{background:"#1E3A8A10",border:"1px solid #1E3A8A33",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:10,color:T.textMuted}}>
              🏛️ Vérification KYC obligatoire (COBAC, CEMAC, OHADA). Niveau ÉLEVÉ/CRITIQUE → validation Niv.4+ ou Admin uniquement.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:10}}>
              {[
                ["Statut KYC",<KycBadge statut={client.kycStatut||"EN_ATTENTE"}/>],
                ["Niveau risque",<RiskBadge level={client.riskLevel||"FAIBLE"}/>],
                ["RCCM",client.rccm||<span style={{color:"#F59E0B"}}>⚠️ Manquant</span>],
                ["NIF",client.nif||<span style={{color:"#F59E0B"}}>⚠️ Manquant</span>],
                ["Validé par",client.kycValidePar||"—"],
                ["Date vérification",client.kycDate?new Date(client.kycDate).toLocaleDateString("fr-FR"):"Non effectuée"],
              ].map(([k,v])=>(
                <div key={k} style={{background:T.surface,borderRadius:6,padding:"6px 9px"}}>
                  <div style={{color:T.textMuted,fontSize:8,textTransform:"uppercase",fontWeight:700,marginBottom:2}}>{k}</div>
                  <div style={{fontSize:11}}>{v}</div>
                </div>
              ))}
              {client.kycNotes&&<div style={{gridColumn:"1/-1",background:T.surface,borderRadius:6,padding:"6px 9px"}}>
                <div style={{color:T.textMuted,fontSize:8,textTransform:"uppercase",fontWeight:700,marginBottom:2}}>Notes KYC</div>
                <div style={{color:T.text,fontSize:11}}>{client.kycNotes}</div>
              </div>}
            </div>
            {canManageCRM&&(lvl>=4||isAdmin)&&(
              <div style={{display:"flex",gap:7}}>
                {["VALIDE","EN_COURS","REJETE","EXPIRE"].map(s=>{
                  const kk=CRM_KYC.find(x=>x.k===s);
                  return <button key={s} onClick={()=>handleValidateKYC(client.id,s)}
                    style={{flex:1,background:kk.c+"22",border:`1px solid ${kk.c}44`,color:kk.c,borderRadius:7,padding:"6px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                    {s==="VALIDE"?"✅ Valider":s==="EN_COURS"?"🔄 En cours":s==="REJETE"?"❌ Rejeter":"⚠️ Expiré"}
                  </button>;
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Dossiers ── */}
        {clientDetailTab==="dossiers"&&(
          <div>
            {dos.length===0?<div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:20}}>Aucun dossier lié à ce client</div>
            :dos.map(d=>(
              <div key={d.id} style={{background:T.surface,borderRadius:8,padding:"8px 11px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:"#6366F1",fontFamily:"monospace",fontWeight:700,fontSize:11}}>{d.ref}</div>
                  <div style={{color:T.textMuted,fontSize:10}}>{d.objet} · {d.process} · {users.find(u=>u.id===d.assignedTo)?.name||"—"}</div>
                </div>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  {d.amount>0&&<span style={{color:"#C9A84C",fontSize:10,fontWeight:700}}>{Number(d.amount).toLocaleString("fr-FR")} FCFA</span>}
                  <span style={{background:(SC[d.status]||"#6B7280")+"22",color:SC[d.status]||"#6B7280",border:`1px solid ${SC[d.status]||"#6B7280"}44`,borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>{d.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Documents ── */}
        {clientDetailTab==="documents"&&(
          <div>
            {/* v99 — Checklist KYC + sous-onglets KYC/Dossier */}
            {(()=>{
              const allDocs = cdocs;
              const kycDocs94 = allDocs.filter(d=>d.cat==="KYC"||["CNI","PASSEPORT","RCCM","NIF","DOMICILE","PHOTO_ID","KYC"].includes(d.category||""));
              const dossierDocs94 = allDocs.filter(d=>d.cat==="DOSSIER"||(!(["KYC","CNI","PASSEPORT","RCCM","NIF","DOMICILE","PHOTO_ID"].includes(d.category||""))&&d.cat!=="KYC"));
              let intakeDocs94=[];
              try{const cd=dossiers.filter(d=>d.client===client.nom||d.partnerId===client.id);cd.forEach(d=>{if(d.intakeDocs)intakeDocs94=[...intakeDocs94,...d.intakeDocs.map(x=>({...x,dossierRef:d.ref}))];});}catch(_){}
              const allKYC=[...kycDocs94,...intakeDocs94.filter(d=>d.cat==="KYC"&&!kycDocs94.find(k=>k.id===d.id))];
              const allDossier=[...dossierDocs94,...intakeDocs94.filter(d=>d.cat==="DOSSIER"&&!dossierDocs94.find(k=>k.id===d.id))];
              // docSubTab est déclaré au niveau du composant (pas ici — évite violation hooks)
              const kycReqs=[...GC_DOCS_REQUIS.KYC_COMMUN,...(client.personneType==="personne_morale"||client.type==="personne_morale"?GC_DOCS_REQUIS.KYC_PERSONNE_MORALE:[])];
              const kycFournis=kycReqs.filter(r=>r.required&&allKYC.some(d=>d.checklistId===r.id||d.category===r.id)).length;
              const kycTotal=kycReqs.filter(r=>r.required).length;
              const kycPct=kycTotal>0?Math.round((kycFournis/kycTotal)*100):0;
              const canValidateKYC=((currentUser?.process==="O01"||(currentUser?.processes||[]).includes("O01"))&&(currentUser?.level||0)>=3)||(currentUser?.level||0)>=4;
              const handleValidateIntakeDoc=(docId,approve)=>{
                if(si.setDossiers) {
                  const updated = si.dossiers.map(d=>{
                    if(!(d.intakeDocs||[]).find(x=>x.id===docId))return d;
                    return{...d,intakeDocs:d.intakeDocs.map(x=>x.id===docId?{...x,validated:approve,rejected:!approve,validatedBy:currentUser.name,validatedAt:new Date().toISOString()}:x)};
                  });
                  si.setDossiers(updated);
                  dsSave("dossiers", updated, currentUser.id);
                }
              };
              const displayDocs=docSubTab==="kyc"?allKYC:docSubTab==="dossier"?allDossier:[...new Map([...allKYC,...allDossier].map(d=>[d.id,d])).values()];
              return(
                <div>
                  {/* Barre de progression KYC */}
                  <div style={{background:T.surface2,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{color:T.textMuted,fontSize:10,fontWeight:700}}>🪪 Complétude KYC</span>
                      <span style={{color:kycPct===100?"#22C55E":"#F59E0B",fontWeight:700,fontSize:10}}>{kycFournis}/{kycTotal} · {kycPct}%</span>
                    </div>
                    <div style={{background:T.surface3,borderRadius:4,height:5}}>
                      <div style={{height:"100%",borderRadius:4,background:kycPct===100?"#22C55E":"#F59E0B",width:`${kycPct}%`,transition:"width 0.4s"}}/>
                    </div>
                  </div>
                  {/* Sous-onglets + upload */}
                  <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
                    {[["tous",`Tous (${allKYC.length+allDossier.length})`],["kyc",`🪪 KYC (${allKYC.length})`],["dossier",`📂 Dossier (${allDossier.length})`]].map(([k,l])=>(
                      <button key={k} onClick={()=>setDocSubTab(k)} style={{background:docSubTab===k?"#0A1E4A":"transparent",border:`1px solid ${docSubTab===k?"#0A1E4A":T.border}`,color:docSubTab===k?"#fff":T.textMuted,borderRadius:6,padding:"3px 9px",cursor:"pointer",fontSize:9,fontWeight:docSubTab===k?700:400}}>{l}</button>
                    ))}
                    <div style={{marginLeft:"auto",display:"flex",gap:4}}>
                      <select value={clientDocUpload.category} onChange={e=>setClientDocUpload(f=>({...f,category:e.target.value,clientId:client.id}))}
                        style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 6px",color:T.text,fontSize:9}}>{CATS.map(c=><option key={c}>{c}</option>)}</select>
                      <button onClick={async ()=>{setClientDocUpload(f=>({...f,clientId:client.id}));clientDocRef.current?.click();}}
                        style={{background:"#F97316",border:"none",color:"#fff",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontWeight:700,fontSize:9}}>📤 Ajouter</button>
                    </div>
                  </div>
                  <input ref={clientDocRef} type="file" multiple accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.zip,.txt" onChange={e=>handleUploadClientDoc(e,client.id)} style={{display:"none"}}/>
                  {/* Checklist KYC obligatoire */}
                  {docSubTab==="kyc"&&kycReqs.length>0&&(
                    <div style={{background:T.surface2,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                      <div style={{color:"#3B82F6",fontWeight:700,fontSize:10,marginBottom:6}}>📋 Checklist KYC obligatoire</div>
                      {kycReqs.map(req=>{
                        const found=allKYC.find(d=>d.checklistId===req.id||d.category===req.id);
                        const st=found?(found.validated?"VALIDE":found.rejected?"REJETE":"FOURNI"):"MANQUANT";
                        const sc={MANQUANT:{c:"#EF4444",i:"❌"},FOURNI:{c:"#F59E0B",i:"⏳"},VALIDE:{c:"#22C55E",i:"✅"},REJETE:{c:"#C41E3A",i:"⛔"}}[st];
                        return(<div key={req.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 7px",borderRadius:5,marginBottom:3,background:T.surface}}>
                          <span>{sc.i}</span><span style={{flex:1,color:T.text,fontSize:10}}>{req.label}</span>
                          {req.required&&<span style={{color:"#EF4444",fontSize:8}}>*req.</span>}
                          <span style={{color:sc.c,fontWeight:700,fontSize:8}}>{st}</span>
                          {canValidateKYC&&found&&st==="FOURNI"&&(
                            <div style={{display:"flex",gap:2}}>
                              <button onClick={()=>handleValidateIntakeDoc(found.id,true)} style={{background:"#22C55E22",border:"none",borderRadius:3,padding:"1px 5px",cursor:"pointer",fontSize:9,color:"#22C55E"}}>✅</button>
                              <button onClick={()=>handleValidateIntakeDoc(found.id,false)} style={{background:"#EF444422",border:"none",borderRadius:3,padding:"1px 5px",cursor:"pointer",fontSize:9,color:"#EF4444"}}>❌</button>
                            </div>
                          )}
                        </div>);
                      })}
                      {canValidateKYC&&<button onClick={()=>handleValidateKYC(client.id,kycPct===100?"VALIDE":"EN_COURS")} style={{width:"100%",marginTop:6,background:kycPct===100?"#22C55E22":"#F59E0B22",border:`1px solid ${kycPct===100?"#22C55E44":"#F59E0B44"}`,color:kycPct===100?"#22C55E":"#F59E0B",borderRadius:7,padding:"6px",cursor:"pointer",fontWeight:700,fontSize:10}}>{kycPct===100?"✅ Valider KYC complet":"🔄 Valider KYC partiel"}</button>}
                    </div>
                  )}
                  {/* Liste des documents */}
                  {displayDocs.length===0
                    ?<div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:16}}>Aucun document. Cliquez "📤 Ajouter".</div>
                    :displayDocs.map((d,i)=>{
                      const isKyc=d.cat==="KYC"||["CNI","PASSEPORT","RCCM","NIF","DOMICILE","PHOTO_ID","KYC"].includes(d.category||"");
                      return(<div key={d.id||i} style={{display:"flex",gap:7,alignItems:"center",padding:"7px 10px",background:T.surface,borderRadius:7,marginBottom:4,borderLeft:`3px solid ${isKyc?"#3B82F6":"#F97316"}`}}>
                        <span style={{fontSize:15}}>{DI[d.type||(d.name||"").split(".").pop()?.toUpperCase()]||"📎"}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                          <div style={{display:"flex",gap:3,marginTop:2,flexWrap:"wrap"}}>
                            <span style={{background:isKyc?"#3B82F622":"#F9731622",color:isKyc?"#3B82F6":"#F97316",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>{isKyc?"🪪 KYC":"📂 Dossier"}</span>
                            {d.validated&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>✅ Validé</span>}
                            {d.rejected&&<span style={{background:"#EF444422",color:"#EF4444",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700}}>❌ Rejeté</span>}
                            <span style={{color:T.textDim,fontSize:8}}>{d.size} · {(d.createdAt||d.uploadedAt||"").slice(0,10)}{d.dossierRef?` · 📁 ${d.dossierRef}`:""}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:3,flexShrink:0}}>
                          {(d.url||d.dataUrl)&&<button onClick={async ()=>{const a=document.createElement("a");a.href=d.url||d.dataUrl;a.download=d.name||"doc";a.click();}} style={{background:"#3B82F622",border:"none",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:9,color:"#3B82F6"}}>⬇</button>}
                          {canValidateKYC&&isKyc&&!d.validated&&!d.rejected&&<button onClick={()=>handleValidateIntakeDoc(d.id,true)} style={{background:"#22C55E22",border:"none",borderRadius:5,padding:"2px 5px",cursor:"pointer",fontSize:9,color:"#22C55E"}}>✅</button>}
                          <button onClick={async () => {if(await gcConfirm("Supprimer ce document ?"))saveDocs(docs.filter(x=>x.id!==d.id));}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:11}}>🗑️</button>
                        </div>
                      </div>);
                    })
                  }
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Honoraires Finance ── */}
        {clientDetailTab==="honoraires"&&(
          <div>
            {/* Lien vers Facturation Finance — accès direct */}
            {lvl >= 3 && (
              <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <button onClick={async ()=>{
                  // Prefill facture avec ce client
                  try{ _lsSet("gc-prefill-facture",JSON.stringify({client:client.nom,ref:"",objet:"",amount:0,process:client.process||currentUser?.process||"O02"})); }catch(_){}
                  // Ouvrir l'onglet facturation du CRM
                  setTab("crm"); setCrmTab("facturation");
                  setSelectedClient(null);
                }} style={{background:"linear-gradient(135deg,#C9A84C,#D97706)",border:"none",color:"#000",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:10}}>
                  🧾 Créer une facture — {client.nom}
                </button>
                <button onClick={async ()=>{
                  // Ouvrir Finance avec vérification des droits
                  if (si?.handleSetActiveModule) {
                    const hasFinanceAccess = currentUser?.isAdmin || currentUser?.level >= 5 ||
                      (currentUser?.process === "S01" || (currentUser?.processes||[]).includes("S01"));
                    if (hasFinanceAccess) {
                      si.handleSetActiveModule("bureau");
                      setTimeout(()=>{ const evt=new CustomEvent("gc:open-facture"); window.dispatchEvent(evt); },200);
                    } else {
                      setNotifications&&setNotifications(p=>[{id:"N"+Date.now(),icon:"🔒",message:`Accès Finance refusé — Processus S01 requis`,at:new Date().toISOString(),read:false},...p]);
                    }
                  }
                }} style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:10}}>
                  → Finance & Comptabilité
                </button>
              </div>
            )}
            {/* Factures réelles depuis gc-factures */}
            {(()=>{
              const factures = (()=>{try{return JSON.parse(_lsGet("gc-factures")||"[]");}catch(_){return [];}})();
              const clientFacts = factures.filter(f=>(f.client||"").toLowerCase().includes((client.nom||"").toLowerCase())||(f.partnerId===client.id));
              const totalFacts = clientFacts.reduce((s,f)=>s+(f.ttc||0),0);
              if(clientFacts.length>0) return (
                <div style={{marginBottom:10}}>
                  <div style={{background:"#C9A84C11",border:"1px solid #C9A84C33",borderRadius:8,padding:"8px 11px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:10,color:"#C9A84C"}}>🧾 {clientFacts.length} facture(s) émise(s)</span>
                    <span style={{color:"#C9A84C",fontWeight:800,fontSize:12}}>{Math.round(totalFacts).toLocaleString("fr-FR")} FCFA TTC</span>
                  </div>
                  {clientFacts.slice(0,5).map(f=>{
                    const st={BROUILLON:"#6B7280",EMISE:"#3B82F6",PAYEE:"#22C55E",EN_RETARD:"#EF4444",ANNULEE:"#9CA3AF"}[f.status]||"#6B7280";
                    return(
                      <div key={f.id} style={{background:T.surface,borderRadius:7,padding:"7px 11px",marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center",borderLeft:`3px solid ${st}`}}>
                        <div>
                          <div style={{color:T.text,fontSize:11,fontWeight:600}}>{f.ref} — {f.objet}</div>
                          <div style={{color:T.textMuted,fontSize:9}}>{f.dateEmission||f.createdAt?.slice(0,10)||"—"} · {f.processus}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{color:st,fontWeight:800,fontSize:11}}>{f.status}</div>
                          <div style={{color:T.text,fontWeight:700,fontSize:11}}>{Math.round(f.ttc||0).toLocaleString("fr-FR")} F</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
              return null;
            })()}
            {/* Écritures journal */}
            <div style={{background:"#C9A84C15",border:"1px solid #C9A84C33",borderRadius:8,padding:"8px 11px",marginBottom:10,fontSize:10,color:"#C9A84C"}}>
              💰 Écritures du journal comptable (S01 Finance) liées à ce client via le champ "Tiers".
              Total honoraires facturés : <strong>{totalHon.toLocaleString("fr-FR")} FCFA</strong>
            </div>
            {chon.length===0?<div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:16}}>Aucune écriture comptable liée à ce client dans le journal Finance.</div>
            :chon.slice(0,20).map(e=>(
              <div key={e.id} style={{background:T.surface,borderRadius:7,padding:"7px 11px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:T.text,fontSize:11,fontWeight:600}}>{e.libelle}</div>
                  <div style={{color:T.textMuted,fontSize:9}}>{e.date} · {e.piece} · Cpte {e.compteDebit||e.compte}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  {e.debit>0&&<div style={{color:"#22C55E",fontWeight:700,fontSize:12}}>+{Number(e.debit).toLocaleString("fr-FR")} F</div>}
                  {e.credit>0&&<div style={{color:"#EF4444",fontWeight:700,fontSize:12}}>−{Number(e.credit).toLocaleString("fr-FR")} F</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── RDV ── */}
        {clientDetailTab==="rdvs"&&(
          <div>
            <button onClick={async ()=>{setShowRelanceForm(false);/* RDV rapide via setRdvs */}}
              style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10,marginBottom:8}}>
              + Planifier un RDV (via Agenda)
            </button>
            {crdvs.length===0?<div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:16}}>Aucun RDV enregistré pour ce client.</div>
            :crdvs.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(r=>(
              <div key={r.id} style={{background:T.surface,borderRadius:7,padding:"7px 11px",marginBottom:5}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:T.text,fontWeight:600,fontSize:11}}>{r.client}</div>
                    <div style={{color:T.textMuted,fontSize:9}}>{r.type} · {r.date} à {r.heure} · {r.salle||"—"}</div>
                    <div style={{color:T.textMuted,fontSize:9}}>{users.find(u=>u.id===r.assignedTo)?.name||"—"}</div>
                  </div>
                  <span style={{background:(SC[r.status]||"#6B7280")+"22",color:SC[r.status]||"#6B7280",border:`1px solid ${SC[r.status]||"#6B7280"}44`,borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Historique interactions ── */}
        {clientDetailTab==="interactions"&&(
          <div>
            <button onClick={async ()=>{setInterForm({...interInit,clientId:client.id});setShowInterForm(true);}}
              style={{background:"#8B5CF622",border:"1px solid #8B5CF644",color:"#8B5CF6",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10,marginBottom:8}}>
              + Enregistrer une interaction
            </button>
            {cinters.length===0?<div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:16}}>Aucune interaction enregistrée. Chaque appel, email, réunion peut être tracé ici.</div>
            :cinters.map(i=>(
              <div key={i.id} style={{background:T.surface,borderRadius:7,padding:"8px 11px",marginBottom:5,borderLeft:`3px solid #8B5CF6`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <span style={{color:"#8B5CF6",fontWeight:700,fontSize:11}}>{i.type}</span>
                  <span style={{color:T.textMuted,fontSize:9}}>{new Date(i.at).toLocaleDateString("fr-FR")} {new Date(i.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})} · {i.byName}</span>
                </div>
                <div style={{color:T.text,fontSize:11,fontWeight:600}}>{i.objet}</div>
                {i.notes&&<div style={{color:T.textMuted,fontSize:10,marginTop:2}}>{i.notes}</div>}
                {i.resultat&&<div style={{color:"#22C55E",fontSize:10,marginTop:2}}>✅ Résultat : {i.resultat}</div>}
                {i.duree&&<div style={{color:T.textDim,fontSize:9,marginTop:2}}>⏱ {i.duree} min</div>}
              </div>
            ))}
          </div>
        )}

        {/* ── Relances O01 ── */}
        {clientDetailTab==="relances"&&(
          <div>
            <button onClick={async ()=>{setRelanceForm({...relanceInit,clientId:client.id});setShowRelanceForm(true);}}
              style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10,marginBottom:8}}>
              + Programmer une relance
            </button>
            {crels.length===0?<div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:16}}>Aucune relance. Programmez des appels, emails ou visites de suivi.</div>
            :crels.sort((a,b)=>new Date(a.dateRelance)-new Date(b.dateRelance)).map(r=>{
              const enRetard = r.dateRelance<today&&r.statut!=="FAIT";
              const aujodhui_ = r.dateRelance===today&&r.statut!=="FAIT";
              return (
                <div key={r.id} style={{background:T.surface,borderRadius:7,padding:"7px 11px",marginBottom:5,borderLeft:`3px solid ${enRetard?"#EF4444":aujodhui_?"#F59E0B":"#6B7280"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{color:enRetard?"#EF4444":aujodhui_?"#F59E0B":T.text,fontWeight:700,fontSize:11}}>{r.objet}</div>
                      <div style={{color:T.textMuted,fontSize:9}}>{r.type} · {r.priorite} · {users.find(u=>u.id===r.assignedTo)?.name||"—"}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:r.statut==="FAIT"?"#22C55E":enRetard?"#EF4444":aujodhui_?"#F59E0B":T.textMuted,fontWeight:700,fontSize:10}}>
                        {r.statut==="FAIT"?"✅ Fait":enRetard?"⚠️ En retard":aujodhui_?"📅 Aujourd'hui":r.dateRelance}
                      </div>
                    </div>
                  </div>
                  {r.statut!=="FAIT"&&<button onClick={()=>saveRelances(relances.map(rl=>rl.id===r.id?{...rl,statut:"FAIT",faitLe:today,faitPar:currentUser?.id}:rl))}
                    style={{marginTop:5,background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700}}>✅ Marquer fait</button>}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Opportunités ── */}
        {clientDetailTab==="opps"&&(
          <div>
            <button onClick={async ()=>{setOppForm({...oppInit,clientId:client.id});setShowOppForm(true);}}
              style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:10,marginBottom:8}}>
              + Nouvelle opportunité commerciale
            </button>
            {copps.length===0?<div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:16}}>Aucune opportunité commerciale suivie.</div>
            :copps.map(o=>{
              const et=CRM_ETAPES.find(e=>e.k===o.etape)||CRM_ETAPES[0];
              return (
                <div key={o.id} style={{background:T.surface,borderRadius:8,padding:"8px 11px",marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{color:T.text,fontWeight:700,fontSize:11}}>{o.titre}</div>
                    <span style={{background:et.c+"22",color:et.c,border:`1px solid ${et.c}44`,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700}}>{et.l}</span>
                  </div>
                  <div style={{color:T.textMuted,fontSize:10}}>{Number(o.valeur).toLocaleString("fr-FR")} FCFA · {o.probabilite}%{o.dateEcheance?` · Éch. ${new Date(o.dateEcheance).toLocaleDateString("fr-FR")}`:""}</div>
                  <div style={{marginTop:6,background:T.surface2,borderRadius:3,height:4}}>
                    <div style={{height:"100%",background:et.c,width:`${et.pct}%`,borderRadius:3,transition:"width 0.4s"}}/>
                  </div>
                  <div style={{display:"flex",gap:5,marginTop:7}}>
                    {CRM_ETAPES.filter(e=>e.k!==o.etape&&!["PERDU"].includes(e.k)).slice(0,3).map(e=>(
                      <button key={e.k} onClick={()=>saveOpps(opps.map(op=>op.id===o.id?{...op,etape:e.k}:op))}
                        style={{background:e.c+"22",border:`1px solid ${e.c}44`,color:e.c,borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9,fontWeight:600}}>→ {e.l}</button>
                    ))}
                    <button onClick={()=>saveOpps(opps.map(op=>op.id===o.id?{...op,etape:"PERDU"}:op))}
                      style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:9,fontWeight:700}}>❌ Perdu</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Analyse IA ── */}
        {clientDetailTab==="ia"&&(
          <div>
            <button onClick={()=>handleAiAnalyse(client)} disabled={aiAnalyse.loading&&aiAnalyse.clientId===client.id}
              style={{background:"linear-gradient(135deg,#F97316,#8B5CF6)",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12,marginBottom:12,opacity:aiAnalyse.loading?0.6:1}}>
              {aiAnalyse.loading&&aiAnalyse.clientId===client.id?"⏳ Analyse en cours...":"✨ Analyse IA complète"}
            </button>
            {aiAnalyse.clientId===client.id&&aiAnalyse.result&&(
              <div style={{background:T.surface,border:"1px solid #F9731633",borderRadius:8,padding:12,whiteSpace:"pre-wrap",color:T.text,fontSize:11,lineHeight:1.6}}>
                {aiAnalyse.result}
              </div>
            )}
            {(!aiAnalyse.result||aiAnalyse.clientId!==client.id)&&!aiAnalyse.loading&&(
              <div style={{color:T.textMuted,fontSize:11,textAlign:"center",padding:16}}>
                L'IA analysera : profil, risques KYC, opportunités commerciales, recommandations O01, conformité OHADA/CEMAC.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── RENDU PRINCIPAL ───────────────────────────────────────────────────────
  return (
    <div>
      {/* Bandeau O01 avec KPIs dynamiques */}
      <div style={{background:"linear-gradient(135deg,#F9731610,#EA580C08)",border:"1px solid #F9731633",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#F97316,#EA580C)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🗂️</div>
        <div style={{flex:1}}>
          <div style={{color:"#F97316",fontWeight:800,fontSize:11}}>Administration Exécutive — O01 · Espace Documentaire & CRM</div>
          <div style={{color:T.textMuted,fontSize:9}}>Dossiers · Documents · Archives · Codification · CRM Clients · Relances · KYC</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:5,padding:"3px 9px",fontSize:9,fontWeight:700}}>{activeDossiers.length} dossiers</span>
          <span style={{background:"#6366F122",color:"#6366F1",borderRadius:5,padding:"3px 9px",fontSize:9,fontWeight:700}}>{docs.length} docs</span>
          <span style={{background:"#F9731622",color:"#F97316",borderRadius:5,padding:"3px 9px",fontSize:9,fontWeight:700}}>{crmStats.total} clients</span>
          {crmStats.relancesRetard>0&&<span style={{background:"#EF444422",color:"#EF4444",borderRadius:5,padding:"3px 9px",fontSize:9,fontWeight:700}}>⚠️ {crmStats.relancesRetard} relance(s)</span>}
          {crmStats.kycPending>0&&<span style={{background:"#F59E0B22",color:"#F59E0B",borderRadius:5,padding:"3px 9px",fontSize:9,fontWeight:700}}>🏛️ {crmStats.kycPending} KYC</span>}
        </div>
      </div>

      {/* Navigation principale */}
      <div style={{display:"flex",gap:3,marginBottom:10,borderBottom:`1px solid ${T.border}`,paddingBottom:8,flexWrap:"wrap"}}>
        {[
          ["dossiers",`📋 Dossiers (${activeDossiers.length})`],
          ["documents",`📄 Documents (${docs.length})`],
          ["crm",`🤝 CRM Clients (${crmStats.total})`],
          ["facturation","💰 Facturation"],
          ["archives",`🗃️ Archives`],
          ["classification","🏷️ Classification"],
        ].map(([id,l])=>(
          <button key={id} onClick={async ()=>{setTab(id);setSelectedClient(null);}}
            style={{background:tab===id?"#F9731622":"transparent",border:`1px solid ${tab===id?"#F9731666":T.border}`,borderRadius:7,padding:"7px 13px",color:tab===id?"#F97316":T.textMuted,fontWeight:tab===id?700:400,fontSize:11,position:"relative"}}>
            {l}
            {id==="crm"&&(crmStats.relancesRetard+crmStats.relancesAujourd)>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#EF4444",color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:8,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{crmStats.relancesRetard+crmStats.relancesAujourd}</span>}
          </button>
        ))}
      </div>

      {/* Barre de recherche commune */}
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <input value={tab==="crm"?crmSearch:search}
          onChange={e=>tab==="crm"?setCrmSearch(e.target.value):setSearch(e.target.value)}
          placeholder={tab==="crm"?"🔍 Rechercher client, NIF, RCCM, tél...":"🔍 Rechercher..."}
          style={{flex:1,minWidth:160,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12}}/>
        {tab==="dossiers"&&<>
          <select value={filterProcess} onChange={e=>setFilterProcess(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
            <option value="all">Tous processus</option>{["O01","O02","O03","S01","S02","S03","P01","P02"].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:11}}>
            <option value="all">Tous statuts</option>{Object.keys(SC).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </>}
        {tab==="documents"&&<>
          <select value={filterNature} onChange={e=>setFilterNature(e.target.value)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
            <option value="all">Toutes catégories</option>{CATS.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          {/* FIX v154 — Bouton ouvre le formulaire (ne plus toggler, mais forcer ouverture) */}
          <button onClick={()=>setShowNewDoc(true)} style={{background:"#6366F1",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>📤 Importer</button>
          {/* FIX v154 — L'input est deplace DANS le formulaire showNewDoc ci-dessous */}
        </>}
        {tab==="crm"&&<>
          <select value={crmFilter.statut} onChange={e=>setCrmFilter(f=>({...f,statut:e.target.value}))} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
            <option value="ALL">Tous statuts</option>{CRM_STATUTS.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select value={crmFilter.risk} onChange={e=>setCrmFilter(f=>({...f,risk:e.target.value}))} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 8px",color:T.text,fontSize:11}}>
            <option value="ALL">Tous risques</option>{CRM_RISKS.map(r=><option key={r.k} value={r.k}>{r.l}</option>)}
          </select>
          {canManageCRM&&<button onClick={async ()=>{setClientForm(clientFormInit);setEditingClientId(null);setShowClientForm(true);}}
            style={{background:"#F97316",border:"none",color:"#fff",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>🤝 + Contact / Partenaire</button>}
          {/* v99 — Intake client O01 : accueil guidé en 3 étapes */}
          {canManageCRM&&(currentUser?.process==="O01"||(currentUser?.processes||[]).includes("O01")||lvl>=3)&&(
            <button onClick={async ()=>{const evt=new CustomEvent("gc:open-intake");window.dispatchEvent(evt);}}
              style={{background:"linear-gradient(135deg,#C9A84C,#D97706)",border:"none",color:"#000",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>📋 Intake</button>
          )}
        </>}
      </div>

      {/* ══ TAB DOSSIERS ══════════════════════════════════════════════════════ */}
      {showNewDoc&&tab==="documents"&&(
        <div style={{background:T.surface2,border:"1px solid #6366F144",borderRadius:10,padding:12,marginBottom:10}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
            <div><div style={{color:T.textDim,fontSize:10,marginBottom:3}}>Catégorie</div><select value={newDoc.category} onChange={e=>setNewDoc(f=>({...f,category:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><div style={{color:T.textDim,fontSize:10,marginBottom:3}}>Processus</div><select value={newDoc.process} onChange={e=>setNewDoc(f=>({...f,process:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}>{["O01","O02","O03","S01","S02","S03","P01","P02"].map(p=><option key={p} value={p}>{p}</option>)}</select></div>
            <div><div style={{color:T.textDim,fontSize:10,marginBottom:3}}>Dossier lié</div><select value={newDoc.dossierId} onChange={e=>setNewDoc(f=>({...f,dossierId:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}><option value="">—</option>{activeDossiers.map(d=><option key={d.id} value={d.id}>{d.ref} — {d.client}</option>)}</select></div>
            <div><div style={{color:T.textDim,fontSize:10,marginBottom:3}}>Client</div><select value={newDoc.clientId} onChange={e=>setNewDoc(f=>({...f,clientId:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11}}><option value="">—</option>{allClients.map(p=><option key={p.id} value={p.id}>{p.nom}</option>)}</select></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div><div style={{color:T.textDim,fontSize:10,marginBottom:3}}>Tags (virgule)</div><input value={newDoc.tags} onChange={e=>setNewDoc(f=>({...f,tags:e.target.value}))} placeholder="urgent, contrat, 2025" style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
            <div><div style={{color:T.textDim,fontSize:10,marginBottom:3}}>Notes</div><input value={newDoc.notes} onChange={e=>setNewDoc(f=>({...f,notes:e.target.value}))} style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:11,boxSizing:"border-box"}}/></div>
          </div>
          {/* FIX v154 — ÉTAPE 1 : sélection des fichiers (l'input est ICI dans le formulaire,
              plus hors du bloc conditionnel). stopPropagation évite tout bubble vers le toggle). */}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.zip,.txt"
            style={{display:"none"}}
            onChange={e => {
              // FIX v154 — Stocker les fichiers en attente SANS fermer le formulaire.
              // L'utilisateur peut maintenant voir les fichiers sélectionnés et confirmer.
              const selected = Array.from(e.target.files || []);
              if (selected.length > 0) setPendingDocFiles(selected);
              e.target.value = ""; // reset pour pouvoir resélectionner
            }}
          />
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <button
              onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
              style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"8px 14px",cursor:"pointer",fontWeight:600,fontSize:11}}
            >
              📂 Sélectionner fichiers
            </button>
            {pendingDocFiles.length > 0 && (
              <span style={{color:"#22C55E",fontSize:11,fontWeight:600}}>
                ✅ {pendingDocFiles.length} fichier(s) prêt(s) : {pendingDocFiles.map(f=>f.name).join(", ")}
              </span>
            )}
          </div>
          {/* FIX v154 — ÉTAPE 2 : bouton "Confirmer l'import" explicite.
              La fenêtre ne se ferme plus automatiquement à la sélection. */}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button
              disabled={pendingDocFiles.length === 0}
              onClick={async () => {
                if (!pendingDocFiles.length) return;
                // Simuler un event-like pour réutiliser handleUpload
                const syntheticE = { target: { files: pendingDocFiles, value: "" } };
                setPendingDocFiles([]);
                await handleUpload(syntheticE);
              }}
              style={{
                background: pendingDocFiles.length > 0 ? "#22C55E" : "#374151",
                border:"none",color:"#fff",borderRadius:7,padding:"9px 20px",
                cursor: pendingDocFiles.length > 0 ? "pointer" : "not-allowed",
                fontWeight:700,fontSize:12,opacity: pendingDocFiles.length > 0 ? 1 : 0.5
              }}
            >
              ✅ Confirmer l'import
            </button>
            <button onClick={()=>{ setShowNewDoc(false); setPendingDocFiles([]); }} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:7,padding:"9px 14px",cursor:"pointer",fontSize:11}}>Annuler</button>
          </div>
        </div>
      )}

      {tab==="dossiers"&&(
        filteredDossiers.length===0&&closedDossiers.filter(d=>docs.some(x=>x.dossierId===d.id)).length===0?
          <div style={{color:T.textMuted,textAlign:"center",padding:28}}>Aucun dossier actif</div>:(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {filteredDossiers.map(d=>{
              const linkedDocs=docs.filter(x=>x.dossierId===d.id);
              const client=allClients.find(c=>c.id===d.partnerId||c.nom===d.client);
              return (
                <div key={d.id} style={{background:T.surface2,border:`1.5px solid ${(SC[d.status]||"#6B7280")}33`,borderRadius:10,padding:"10px 14px",cursor:"pointer"}} onClick={()=>setSelected(selected?.id===d.id?null:d)}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <span style={{background:(SC[d.status]||"#6B7280")+"22",color:SC[d.status]||"#6B7280",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>{d.status}</span>
                    <span style={{color:"#6366F1",fontWeight:700,fontFamily:"monospace",fontSize:11}}>{d.ref||d.id}</span>
                    <span style={{color:T.text,fontWeight:700,fontSize:12,flex:1}}>{d.client}</span>
                    <span style={{background:"#6366F122",color:"#6366F1",borderRadius:4,padding:"1px 6px",fontSize:9}}>{d.process}</span>
                    {d.amount>0&&<span style={{color:"#C9A84C",fontSize:9,fontWeight:700}}>{Number(d.amount).toLocaleString("fr-FR")} F</span>}
                    {linkedDocs.length>0&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:4,padding:"1px 6px",fontSize:9}}>📄 {linkedDocs.length}</span>}
                    {client&&<KycBadge statut={client.kycStatut||"EN_ATTENTE"}/>}
                  </div>
                  <div style={{color:T.textMuted,fontSize:10}}>{d.objet||d.nature||"—"}{d.dueDate?` · Éch. ${new Date(d.dueDate).toLocaleDateString("fr-FR")}`:""}
                    {d.assignedTo?" · "+users.find(u=>u.id===d.assignedTo)?.name:""}
                  </div>
                  {selected?.id===d.id&&(
                    <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${T.border}`}}>
                      {linkedDocs.length>0&&<div><div style={{color:T.textDim,fontSize:9,fontWeight:700,marginBottom:4}}>Documents liés :</div>
                        {linkedDocs.map(doc=><div key={doc.id} style={{display:"flex",gap:6,alignItems:"center",padding:"3px 0"}}>
                          <span>{DI[doc.type]||"📎"}</span>
                          <span style={{color:T.text,fontSize:10,flex:1}}>{doc.name}</span>
                          <button onClick={async e=>{e.stopPropagation();downloadDoc(doc);}} style={{background:"transparent",border:"none",color:"#3B82F6",cursor:"pointer",fontSize:10}}>⬇</button>
                        </div>)}
                      </div>}
                      <div style={{display:"flex",gap:6,marginTop:6}}>
                        <button onClick={async e=>{e.stopPropagation();setTab("documents");setNewDoc(f=>({...f,dossierId:d.id}));setShowNewDoc(true);}}
                          style={{background:"#6366F122",border:"1px solid #6366F144",color:"#6366F1",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>+ Ajouter document</button>
                        {client&&<button onClick={async e=>{e.stopPropagation();setTab("crm");setSelectedClient(client);}}
                          style={{background:"#F9731622",border:"1px solid #F9731644",color:"#F97316",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>👤 Voir fiche client</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* FIX vDOCS-CLOSED — Section dossiers clôturés/archivés avec leurs documents */}
            {closedDossiers.filter(d=>docs.some(x=>x.dossierId===d.id)).length > 0 && (
              <div style={{marginTop:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#6B708015",border:"1px solid #6B708033",borderRadius:8,marginBottom:6}}>
                  <span style={{fontSize:16}}>🗃️</span>
                  <span style={{color:T.textMuted,fontWeight:800,fontSize:11}}>Dossiers clôturés / archivés — documents conservés</span>
                  <span style={{background:"#6B708022",color:T.textMuted,borderRadius:10,padding:"1px 8px",fontSize:9}}>{closedDossiers.filter(d=>docs.some(x=>x.dossierId===d.id)).length}</span>
                </div>
                {closedDossiers.filter(d=>docs.some(x=>x.dossierId===d.id)).map(d=>{
                  const linkedDocs=docs.filter(x=>x.dossierId===d.id);
                  const client=allClients.find(c=>c.id===d.partnerId||c.nom===d.client);
                  return (
                    <div key={"closed-"+d.id} style={{background:T.surface2,border:`1px solid #6B708033`,borderRadius:10,padding:"10px 14px",opacity:0.9,marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <span style={{background:"#6B708022",color:"#6B7080",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>{d.status}</span>
                        <span style={{color:"#6366F1",fontWeight:700,fontFamily:"monospace",fontSize:11}}>{d.ref||d.id}</span>
                        <span style={{color:T.text,fontWeight:700,fontSize:12,flex:1}}>{d.client}</span>
                        {linkedDocs.length>0&&<span style={{background:"#C9A84C22",color:"#C9A84C",borderRadius:4,padding:"1px 6px",fontSize:9}}>📄 {linkedDocs.length} doc(s)</span>}
                      </div>
                      {linkedDocs.length>0&&<div style={{marginTop:6,paddingTop:6,borderTop:`1px solid ${T.border}`}}>
                        <div style={{color:T.textDim,fontSize:9,fontWeight:700,marginBottom:4}}>Documents liés (conservés) :</div>
                        {linkedDocs.map(doc=><div key={doc.id} style={{display:"flex",gap:6,alignItems:"center",padding:"3px 0"}}>
                          <span>{DI[doc.type]||"📎"}</span>
                          <span style={{color:T.text,fontSize:10,flex:1}}>{doc.name}</span>
                          <span style={{color:T.textDim,fontSize:9}}>{doc.type} · {(doc.createdAt||"").slice(0,10)}</span>
                          {(doc.id||doc.serverUrl||doc.url||doc.dataUrl)&&<button onClick={e=>{e.stopPropagation();viewDoc(doc);}} style={{background:"transparent",border:"none",color:"#10B981",cursor:"pointer",fontSize:10}}>👁️</button>}
                          {(doc.id||doc.serverUrl||doc.url||doc.dataUrl)&&<button onClick={e=>{e.stopPropagation();downloadDoc(doc);}} style={{background:"transparent",border:"none",color:"#3B82F6",cursor:"pointer",fontSize:10}}>⬇</button>}
                        </div>)}
                      </div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      )}

      {/* ══ TAB DOCUMENTS ══════════════════════════════════════════════════════ */}
      {tab==="documents"&&(
        filteredDocs.length===0?<div style={{color:T.textMuted,textAlign:"center",padding:28}}>Aucun document importé</div>:(
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {filteredDocs.map(d=>{
              const dossier=dossiers.find(x=>x.id===d.dossierId);
              const client=allClients.find(x=>x.id===d.clientId);
              return (
                <div key={d.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 14px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9}}>
                  <span style={{fontSize:20,marginTop:2}}>{DI[d.type]||"📎"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
                      <span style={{color:T.text,fontSize:11,fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
                      <span style={{background:"#6366F122",color:"#6366F1",borderRadius:4,padding:"1px 5px",fontSize:8,fontWeight:700,flexShrink:0}}>{d.codif}</span>
                    </div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      <span style={{color:T.textDim,fontSize:9}}>{d.type} · {d.size} · {d.createdAt?.slice(0,10)} · {d.createdBy}</span>
                      {dossier&&<span style={{background:"#3B82F622",color:"#3B82F6",borderRadius:3,padding:"1px 5px",fontSize:8}}>📋 {dossier.ref}</span>}
                      {client&&<span style={{background:"#F9731622",color:"#F97316",borderRadius:3,padding:"1px 5px",fontSize:8}}>👤 {client.nom}</span>}
                      {(d.tags||[]).map(t=><span key={t} style={{background:"#6366F122",color:"#6366F1",borderRadius:3,padding:"1px 5px",fontSize:8}}>#{t}</span>)}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:4,flexShrink:0}}>
                    {(d.id||d.serverUrl||d.url||d.dataUrl)&&<button onClick={()=>viewDoc(d)} style={{background:"#10B98122",border:"1px solid #10B98144",color:"#10B981",borderRadius:5,padding:"4px 8px",cursor:"pointer",fontSize:10}}>👁️ Voir</button>}
                    {(d.id||d.serverUrl||d.url||d.dataUrl)&&<button onClick={()=>downloadDoc(d)} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"4px 8px",cursor:"pointer",fontSize:10}}>⬇ DL</button>}
                    {/* FIX v123 — bouton ✏️ manquant : documents non modifiables */}
                    {canEditDoc&&<button onClick={()=>openEditDoc(d)} title="Modifier" style={{background:"#6366F122",border:"1px solid #6366F144",color:"#6366F1",borderRadius:5,padding:"4px 8px",cursor:"pointer",fontSize:10}}>✏️</button>}
                    <button onClick={()=>archiveDoc(d)} style={{background:"#6B708022",border:"1px solid #6B708044",color:"#6B7080",borderRadius:5,padding:"4px 8px",cursor:"pointer",fontSize:10}}>🗃️</button>
                    {canEditDoc&&<button onClick={async () => {if(await gcConfirm("Supprimer ce document ?"))saveDocs(docs.filter(x=>x.id!==d.id));}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:11}}>🗑️</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ══ TAB CRM ════════════════════════════════════════════════════════════ */}
      {tab==="crm"&&(
        <div>
          {/* CRM sub-navigation */}
          <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
            {[
              {k:"portefeuille",l:`🤝 Portefeuille (${filteredClients.length})`},
              {k:"pipeline",l:`💼 Pipeline (${crmStats.oppsEnCours})`},
              {k:"relances",l:`🔔 Relances O01 (${crmStats.relancesRetard+crmStats.relancesAujourd})`},
              {k:"kyc",l:`🏛️ KYC (${crmStats.kycPending})`},
              {k:"facturation",l:`🧾 Facturation (${crmStats.facturesPending||0})`},
              {k:"stats",l:"📊 Statistiques"},
            ].map(t=>(
              <button key={t.k} onClick={async ()=>{setCrmTab(t.k);setSelectedClient(null);}}
                style={{background:crmTab===t.k?"#F9731622":"transparent",color:crmTab===t.k?"#F97316":T.textMuted,
                  border:`1px solid ${crmTab===t.k?"#F9731666":T.border}`,borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:crmTab===t.k?700:400,fontSize:11}}>
                {t.l}
              </button>
            ))}
          </div>

          {/* ── Portefeuille ── */}
          {crmTab==="portefeuille"&&(
            <div>
              {selectedClient&&<ClientDetail client={selectedClient}/>}
              {!selectedClient&&(
                filteredClients.length===0
                ?<div style={{color:T.textMuted,textAlign:"center",padding:32,fontSize:13}}>
                  {allClients.length===0
                    ?"Aucun client enregistré. Cliquez sur « + Client » pour créer la première fiche."
                    :"Aucun résultat pour cette recherche."}
                </div>
                :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
                  {filteredClients.map(c=>{
                    const cDos=clientDossiers(c.id);
                    const cRel=clientRelances(c.id).filter(r=>r.statut!=="FAIT"&&r.dateRelance<=today);
                    return (
                      <div key={c.id} onClick={async ()=>{setSelectedClient(c);setClientDetailTab("profil");}} className="gc-hover-card"
                        style={{background:T.surface2,border:`1.5px solid ${cRel.length>0?"#EF444444":T.border}`,borderRadius:12,padding:14,cursor:"pointer",transition:"all 0.2s",position:"relative"}}>
                        {cRel.length>0&&<span style={{position:"absolute",top:8,right:8,background:"#EF4444",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{cRel.length}</span>}
                        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                          <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#F97316,#EA580C)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                            {c.type==="PERSONNE_PHYSIQUE"?"👤":"🏢"}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{color:T.text,fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nom}</div>
                            <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>{c.segment||"—"} · {c.secteur||"—"}</div>
                            <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>
                              <StatutBadge statut={c.statut||"PROSPECT"}/>
                              <RiskBadge level={c.riskLevel||"FAIBLE"}/>
                            </div>
                          </div>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:7,borderTop:`1px solid ${T.border}`,alignItems:"center"}}>
                          <div style={{display:"flex",gap:5}}>
                            <span style={{color:T.textMuted,fontSize:9}}>📁 {cDos.length}</span>
                            <span style={{color:T.textMuted,fontSize:9}}>💬 {c.interactions||0}</span>
                          </div>
                          <KycBadge statut={c.kycStatut||"EN_ATTENTE"}/>
                          <span style={{color:T.textDim,fontSize:8}}>{c.lastContact?new Date(c.lastContact).toLocaleDateString("fr-FR"):"—"}</span>
                        </div>
                        {c.tel&&<div style={{color:T.textMuted,fontSize:9,marginTop:5}}>📞 {c.tel}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Pipeline commercial ── */}
          {crmTab==="pipeline"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{color:T.text,fontWeight:700,fontSize:13}}>
                  💼 Pipeline · Valeur pondérée : <span style={{color:"#C9A84C"}}>{Math.round(crmStats.pipelineVal).toLocaleString("fr-FR")} FCFA</span>
                </div>
                {canManageCRM&&<button onClick={async ()=>{setOppForm(oppInit);setShowOppForm(true);}}
                  style={{background:"#C9A84C22",border:"1px solid #C9A84C44",color:"#C9A84C",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Opportunité</button>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
                {CRM_ETAPES.map(et=>{
                  const etOpps=opps.filter(o=>o.etape===et.k);
                  const etVal=etOpps.reduce((s,o)=>s+(Number(o.valeur)||0),0);
                  return (
                    <div key={et.k} style={{background:T.surface2,border:`2px solid ${et.c}33`,borderRadius:10,padding:10}}>
                      <div style={{color:et.c,fontWeight:700,fontSize:11,marginBottom:4}}>{et.l}</div>
                      <div style={{color:T.textMuted,fontSize:9,marginBottom:8}}>{etOpps.length} · {etVal.toLocaleString("fr-FR")} F</div>
                      {etOpps.map(o=>{
                        const client=allClients.find(c=>c.id===o.clientId);
                        return (
                          <div key={o.id} style={{background:T.surface,borderRadius:6,padding:"5px 8px",marginBottom:5,border:`1px solid ${et.c}22`}}>
                            <div style={{color:T.text,fontWeight:600,fontSize:10}}>{o.titre}</div>
                            <div style={{color:T.textMuted,fontSize:9}}>{client?.nom||"—"}</div>
                            <div style={{color:et.c,fontWeight:700,fontSize:10,marginTop:2}}>{Number(o.valeur).toLocaleString("fr-FR")} F · {o.probabilite}%</div>
                            <div style={{marginTop:4,display:"flex",gap:3}}>
                              {et.k!=="CONVERTI"&&<button onClick={()=>saveOpps(opps.map(op=>op.id===o.id?{...op,etape:"CONVERTI"}:op))}
                                style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:8,fontWeight:700}}>✅</button>}
                              {et.k!=="PERDU"&&<button onClick={()=>saveOpps(opps.map(op=>op.id===o.id?{...op,etape:"PERDU"}:op))}
                                style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:8,fontWeight:700}}>❌</button>}
                              <button onClick={()=>saveOpps(opps.filter(op=>op.id!==o.id))}
                                style={{background:"none",border:"none",color:"#6B7080",cursor:"pointer",fontSize:10,padding:0,marginLeft:"auto"}}>🗑️</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Relances O01 ── */}
          {crmTab==="relances"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {crmStats.relancesRetard>0&&<span style={{background:"#EF444415",color:"#EF4444",border:"1px solid #EF444433",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700}}>⚠️ {crmStats.relancesRetard} en retard</span>}
                  {crmStats.relancesAujourd>0&&<span style={{background:"#F59E0B15",color:"#F59E0B",border:"1px solid #F59E0B33",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700}}>📅 {crmStats.relancesAujourd} aujourd'hui</span>}
                  {crmStats.relancesRetard===0&&crmStats.relancesAujourd===0&&<span style={{color:"#22C55E",fontSize:11}}>✅ Aucune relance urgente</span>}
                </div>
                {canManageCRM&&<button onClick={async ()=>{setRelanceForm(relanceInit);setShowRelanceForm(true);}}
                  style={{background:"#EF444422",border:"1px solid #EF444444",color:"#EF4444",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>+ Relance</button>}
              </div>
              {relances.length===0?<div style={{color:T.textMuted,textAlign:"center",padding:32,fontSize:13}}>
                Aucune relance programmée. Cliquez « + Relance » pour planifier un appel, email ou visite client.
              </div>:relances.sort((a,b)=>new Date(a.dateRelance)-new Date(b.dateRelance)).map(r=>{
                const client=allClients.find(c=>c.id===r.clientId);
                const enRetard=r.dateRelance<today&&r.statut!=="FAIT";
                const aujodhui_=r.dateRelance===today&&r.statut!=="FAIT";
                return (
                  <div key={r.id} style={{background:T.surface2,borderRadius:10,padding:"10px 13px",marginBottom:7,border:`1px solid ${enRetard?"#EF444444":aujodhui_?"#F59E0B44":T.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{color:enRetard?"#EF4444":aujodhui_?"#F59E0B":T.text,fontWeight:700,fontSize:12}}>{r.objet}</div>
                        <div style={{color:T.textMuted,fontSize:10,marginTop:2}}>
                          {client?.nom||"Client inconnu"} · {r.type} · {users.find(u=>u.id===r.assignedTo)?.name||"—"} · {r.priorite}
                        </div>
                        {r.notes&&<div style={{color:T.textMuted,fontSize:10,marginTop:2,fontStyle:"italic"}}>{r.notes}</div>}
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                        <div style={{color:r.statut==="FAIT"?"#22C55E":enRetard?"#EF4444":aujodhui_?"#F59E0B":T.textMuted,fontWeight:700,fontSize:11}}>
                          {r.statut==="FAIT"?"✅ Fait":enRetard?"⚠️ Retard":aujodhui_?"📅 Aujourd'hui":r.dateRelance}
                        </div>
                      </div>
                    </div>
                    {r.statut!=="FAIT"&&(
                      <div style={{display:"flex",gap:6,marginTop:7}}>
                        <button onClick={()=>saveRelances(relances.map(rl=>rl.id===r.id?{...rl,statut:"FAIT",faitLe:today,faitPar:currentUser?.id}:rl))}
                          style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:6,padding:"3px 11px",cursor:"pointer",fontSize:10,fontWeight:700}}>✅ Marquer fait</button>
                        {client&&<button onClick={async ()=>{setCrmTab("portefeuille");setSelectedClient(client);setClientDetailTab("relances");}}
                          style={{background:"#F9731622",border:"1px solid #F9731644",color:"#F97316",borderRadius:6,padding:"3px 11px",cursor:"pointer",fontSize:10,fontWeight:700}}>👤 Fiche client</button>}
                        <button onClick={async () => {if(await gcConfirm("Supprimer cette relance ?"))saveRelances(relances.filter(rl=>rl.id!==r.id));}}
                          style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:12,padding:0,marginLeft:"auto"}}>🗑️</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── KYC ── */}
          {crmTab==="kyc"&&(
            <div>
              <div style={{background:"#1E3A8A10",border:"1px solid #1E3A8A33",borderRadius:8,padding:"9px 13px",marginBottom:12,fontSize:10,color:T.textMuted}}>
                🏛️ <strong>KYC (Know Your Customer)</strong> — Obligatoire COBAC/CEMAC. Processus O01 pilote la collecte, O02 valide la conformité juridique.
                Niveaux ÉLEVÉ/CRITIQUE → validation par Niv.4+ obligatoire.
              </div>
              {allClients.length===0?<div style={{color:T.textMuted,textAlign:"center",padding:32}}>Aucun client enregistré.</div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
                {allClients.map(c=>{
                  const kyc=CRM_KYC.find(k=>k.k===(c.kycStatut||"EN_ATTENTE"))||CRM_KYC[0];
                  const risk=CRM_RISKS.find(r=>r.k===(c.riskLevel||"FAIBLE"))||CRM_RISKS[0];
                  const missingDocs=[];
                  if(!c.rccm&&c.type!=="PERSONNE_PHYSIQUE") missingDocs.push("RCCM");
                  if(!c.nif) missingDocs.push("NIF");
                  if(c.type==="PERSONNE_PHYSIQUE"&&!c.numeroPiece) missingDocs.push("Pièce ID");
                  return (
                    <div key={c.id} style={{background:T.surface2,border:`2px solid ${kyc.c}33`,borderRadius:10,padding:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <div style={{width:32,height:32,borderRadius:7,background:kyc.c+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                          {c.type==="PERSONNE_PHYSIQUE"?"👤":"🏢"}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{color:T.text,fontWeight:700,fontSize:11}}>{c.nom}</div>
                          <div style={{color:T.textMuted,fontSize:9}}>{c.segment}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:5,marginBottom:7,flexWrap:"wrap"}}>
                        <KycBadge statut={c.kycStatut||"EN_ATTENTE"}/>
                        <RiskBadge level={c.riskLevel||"FAIBLE"}/>
                      </div>
                      {missingDocs.length>0&&<div style={{background:"#F59E0B15",border:"1px solid #F59E0B33",borderRadius:5,padding:"4px 8px",fontSize:9,color:"#F59E0B",marginBottom:7}}>
                        ⚠️ Manquants : {missingDocs.join(", ")}
                      </div>}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:7}}>
                        {[["RCCM",c.rccm],["NIF",c.nif],["Validé par",c.kycValidePar||"—"],["Date",c.kycDate?new Date(c.kycDate).toLocaleDateString("fr-FR"):"—"]].map(([k,v])=>(
                          <div key={k} style={{background:T.surface,borderRadius:4,padding:"3px 7px"}}>
                            <div style={{color:T.textMuted,fontSize:7,textTransform:"uppercase",marginBottom:1}}>{k}</div>
                            <div style={{color:(!v||v==="—")?"#F59E0B":T.text,fontSize:9,fontWeight:600}}>{v||"⚠️ Manquant"}</div>
                          </div>
                        ))}
                      </div>
                      {canManageCRM&&(lvl>=4||isAdmin)&&(
                        <div style={{display:"flex",gap:3}}>
                          {["VALIDE","EN_COURS","REJETE"].map(s=>{const kk=CRM_KYC.find(x=>x.k===s);return(
                            <button key={s} onClick={()=>handleValidateKYC(c.id,s)}
                              style={{flex:1,background:kk.c+"22",border:`1px solid ${kk.c}44`,color:kk.c,borderRadius:5,padding:"3px",cursor:"pointer",fontSize:8,fontWeight:700}}>
                              {s==="VALIDE"?"✅ Valider":s==="EN_COURS"?"🔄 Cours":"❌ Rejeter"}
                            </button>
                          );})}
                        </div>
                      )}
                      <button onClick={async ()=>{setCrmTab("portefeuille");setSelectedClient(c);setClientDetailTab("kyc");}}
                        style={{marginTop:7,width:"100%",background:T.surface,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:6,padding:"4px",cursor:"pointer",fontSize:9}}>Voir fiche complète</button>
                    </div>
                  );
                })}
              </div>}
            </div>
          )}

          {/* ── Facturation ── */}
          {crmTab==="facturation"&&(
            <div>
              <div style={{background:"#C9A84C10",border:"1px solid #C9A84C33",borderRadius:8,padding:"9px 13px",marginBottom:12,fontSize:10,color:T.textMuted}}>
                🧾 <strong>Facturation CRM</strong> — Création et gestion des factures clients depuis le portefeuille. Intégré avec Finance S01 pour la comptabilité.
              </div>
              {canEditFactDoc ? (
                <FacturationModule T={T} currentUser={currentUser} setNotifications={setNotifications} />
              ) : (
                <div style={{color:T.textMuted,textAlign:"center",padding:32}}>
                  🔒 Accès restreint — Niveau {currentUser?.level} requis (minimum 3 pour O01)
                </div>
              )}
            </div>
          )}

          {/* ── Statistiques ── */}
          {crmTab==="stats"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[
                {title:"Clients par statut",items:CRM_STATUTS.map(s=>({l:s,v:allClients.filter(c=>c.statut===s).length,c:({PROSPECT:"#6B7280",ACTIF:"#22C55E",INACTIF:"#F59E0B",VIP:"#C9A84C",SUSPENDU:"#EF4444",ARCHIVE:"#374151"})[s]}))},
                {title:"KYC — Répartition",items:CRM_KYC.map(k=>({l:k.l,v:allClients.filter(c=>(c.kycStatut||"EN_ATTENTE")===k.k).length,c:k.c}))},
                {title:"Segments",items:CRM_SEGMENTS.slice(0,5).map(s=>({l:s,v:allClients.filter(c=>c.segment===s).length,c:"#3B82F6"}))},
                {title:"Niveaux de risque",items:CRM_RISKS.map(r=>({l:r.l,v:allClients.filter(c=>(c.riskLevel||"FAIBLE")===r.k).length,c:r.c}))},
              ].map(sec=>(
                <div key={sec.title} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
                  <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>{sec.title}</div>
                  {sec.items.filter(i=>i.v>0).map(item=>{
                    const max=Math.max(...sec.items.map(x=>x.v),1);
                    return (
                      <div key={item.l} style={{marginBottom:7}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{color:T.text,fontSize:10}}>{item.l}</span>
                          <span style={{color:T.textMuted,fontSize:10}}>{item.v} ({allClients.length>0?Math.round(item.v/allClients.length*100):0}%)</span>
                        </div>
                        <div style={{background:T.surface,borderRadius:3,height:5}}>
                          <div style={{height:"100%",background:item.c,width:`${Math.round(item.v/max*100)}%`,borderRadius:3,transition:"width 0.5s"}}/>
                        </div>
                      </div>
                    );
                  })}
                  {sec.items.filter(i=>i.v>0).length===0&&<div style={{color:T.textDim,fontSize:10,textAlign:"center",padding:10}}>Aucune donnée</div>}
                </div>
              ))}
              {/* Sources d'acquisition */}
              <div style={{gridColumn:"1/-1",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
                <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:10}}>Sources d'acquisition</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8}}>
                  {CRM_SOURCES.map(s=>{
                    const count=allClients.filter(c=>c.sourceAcquisition===s).length;
                    if(!count) return null;
                    return (
                      <div key={s} style={{background:T.surface,borderRadius:7,padding:"7px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:T.text,fontSize:10}}>{s}</span>
                        <span style={{background:"#8B5CF622",color:"#8B5CF6",borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB FACTURATION ═══════════════════════════════════════════════════ */}
      {/* v110 — Identique à Finance S01 · Données partagées gc-factures · CRUD O01 niv.3+/Admin/DG */}
      {tab==="facturation"&&(
        <div>
          <div style={{background:"#C9A84C0A",border:"1px solid #C9A84C22",borderRadius:8,padding:"7px 12px",marginBottom:10,display:"flex",alignItems:"center",gap:8,fontSize:10}}>
            <span>💰</span>
            <span style={{color:T.textMuted}}>Données synchronisées avec Finance & Comptabilité (S01) · Même source · Temps réel</span>
            {canEditFactDoc
              ? <span style={{color:"#22C55E",fontWeight:700,marginLeft:"auto"}}>✅ Accès complet — O01 niv.3+ / Admin</span>
              : <span style={{color:"#F59E0B",marginLeft:"auto"}}>👁 Lecture seule — modifications réservées à O01 niv.3+ et Admin</span>}
          </div>
          <FacturationModule
            T={T}
            currentUser={currentUser}
            dossiers={dossiers}
            partners={siPartners}
            journalEntries={[]}
            setJournalEntries={_noop}
            setJournalForm={_noop}
            setFinTool={_noop}
            setNotifications={canEditFactDoc ? setNotifications : _noop}
          />
        </div>
      )}

            {/* ══ TAB ARCHIVES ═══════════════════════════════════════════════════════ */}
      {tab==="archives"&&(
        <div>
          <div style={{background:"#6B708018",border:"1px solid #6B708033",borderRadius:8,padding:"7px 12px",marginBottom:8,fontSize:10,color:T.textMuted}}>🗃️ Conservation OHADA : 10 ans (pièces comptables) · 5 ans (correspondances) · Décret 2017 Gabon</div>
          {/* FIX vDOCS-CLOSED — Afficher les documents des dossiers clôturés / archivés */}
          {docsLinkedToClosedDossiers.length > 0 && (
            <div style={{marginBottom:12}}>
              <div style={{color:"#C9A84C",fontWeight:800,fontSize:11,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                📁 Documents liés à des dossiers clôturés / archivés
                <span style={{background:"#C9A84C22",color:"#C9A84C",borderRadius:10,padding:"1px 8px",fontSize:9}}>{docsLinkedToClosedDossiers.length}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {docsLinkedToClosedDossiers.map(d=>{
                  const linkedDossier = closedDossiers.find(cd=>cd.id===d.dossierId);
                  return (
                    <div key={d.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 13px",background:"#C9A84C08",border:"1px solid #C9A84C22",borderRadius:9}}>
                      <span style={{fontSize:16}}>{DI[d.type]||"📎"}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                        <div style={{color:T.textDim,fontSize:9,display:"flex",gap:8}}>
                          <span>{d.category||d.type} · {(d.createdAt||"").slice(0,10)} · {d.createdBy||"—"}</span>
                          {linkedDossier&&<span style={{background:"#C9A84C22",color:"#C9A84C",borderRadius:3,padding:"1px 5px"}}>📁 {linkedDossier.ref} — {linkedDossier.client} ({linkedDossier.status})</span>}
                        </div>
                      </div>
                      {d.url&&<button onClick={()=>downloadDoc(d)} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10}}>⬇</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {allArchives.filter(a=>!a._fromClosedDossier).length===0&&docsLinkedToClosedDossiers.length===0?
            <div style={{color:T.textMuted,textAlign:"center",padding:28}}>Aucune archive</div>:(
            <div>
              {allArchives.filter(a=>!a._fromClosedDossier).length>0&&(
                <>
                  <div style={{color:T.textMuted,fontWeight:700,fontSize:10,marginBottom:6}}>🗃️ Archives classées</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {allArchives.filter(a=>!a._fromClosedDossier).map((a,i)=>(
                      <div key={a.id||i} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 13px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,opacity:0.85}}>
                        <span style={{fontSize:18}}>{a.isDossier?"📁":"🗃️"}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:T.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                          <div style={{color:T.textDim,fontSize:9,display:"flex",gap:6,flexWrap:"wrap"}}>
                            <span>{a.category} · {(a.archivedAt||"").slice(0,10)} · {a.archivedBy||"—"}</span>
                            {a._docsCount>0&&<span style={{background:"#22C55E22",color:"#22C55E",borderRadius:3,padding:"1px 5px"}}>📄 {a._docsCount} doc(s)</span>}
                          </div>
                        </div>
                        {a.url&&<button onClick={()=>downloadDoc(a)} style={{background:"#3B82F622",border:"1px solid #3B82F644",color:"#3B82F6",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10}}>⬇</button>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB CLASSIFICATION ═════════════════════════════════════════════════ */}
      {tab==="classification"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            {[
              {title:"📋 Dossiers par processus",items:[...new Set(activeDossiers.map(d=>d.process))].map(p=>({l:p,v:activeDossiers.filter(d=>d.process===p).length,c:"#3B82F6"}))},
              {title:"📄 Documents par catégorie",items:CATS.map(c=>({l:c,v:docs.filter(d=>(d.category||"AUTRE")===c).length,c:"#6366F1"}))},
              {title:"📋 Dossiers par statut",items:Object.keys(SC).map(s=>({l:s,v:activeDossiers.filter(d=>d.status===s).length,c:SC[s]}))},
              {title:"🤝 Clients par type",items:[{l:"Personne Morale",v:allClients.filter(c=>c.type!=="PERSONNE_PHYSIQUE").length,c:"#F97316"},{l:"Personne Physique",v:allClients.filter(c=>c.type==="PERSONNE_PHYSIQUE").length,c:"#22C55E"}]},
            ].map(sec=>(
              <div key={sec.title} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}}>
                <div style={{color:T.text,fontWeight:700,fontSize:11,marginBottom:8}}>{sec.title}</div>
                {sec.items.filter(i=>i.v>0).map(item=>(
                  <div key={item.l} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                    <div style={{flex:1,height:4,background:T.surface3,borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:`${Math.min(100,(item.v/Math.max(...sec.items.map(x=>x.v),1))*100)}%`,height:"100%",background:item.c,borderRadius:2}}/>
                    </div>
                    <span style={{color:T.textMuted,fontSize:9,minWidth:20,textAlign:"right"}}>{item.v}</span>
                    <span style={{color:T.text,fontSize:9,minWidth:70}}>{item.l}</span>
                  </div>
                ))}
                {sec.items.filter(i=>i.v>0).length===0&&<div style={{color:T.textDim,fontSize:10}}>—</div>}
              </div>
            ))}
          </div>
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:12}}>
            <div style={{color:T.text,fontWeight:700,fontSize:11,marginBottom:8}}>⚙️ Règles de Codification par Processus</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
              {codifRules.map(rule=>(
                <div key={rule.process} style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px"}}>
                  <div style={{color:"#6366F1",fontFamily:"monospace",fontWeight:700,fontSize:11}}>{rule.prefix}</div>
                  <div style={{color:T.textMuted,fontSize:9}}>{rule.desc}</div>
                  <div style={{color:T.textDim,fontSize:8,marginTop:2}}>Format : {rule.prefix}-AAAA-NNNN</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── PANEL PARAMÉTRAGE DÉLAIS O01 (niv 3+) ───────────────────────── */}
          <DelaiConfigPanelO01
            T={T}
            currentUser={currentUser}
            lvl={lvl}
            isAdmin={isAdmin}
            setNotifications={setNotifications}
          />
        </div>
      )}

      {/* ══ MODALES ═══════════════════════════════════════════════════════════ */}

      {/* FIX v123 — Modale édition document (était absente) */}
      {editingDocId&&(
        <div style={{position:"fixed",inset:0,background:"#000A",zIndex:7000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={async e=>{if(e.target===e.currentTarget)setEditingDocId(null);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:"24px 28px",width:520,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 80px #0009"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <div style={{width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#6366F1,#4F46E5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>✏️</div>
              <div>
                <div style={{color:T.text,fontWeight:900,fontSize:15}}>Modifier le document</div>
                <div style={{color:T.textMuted,fontSize:10}}>Metadonnées — le fichier lui-même n'est pas remplacé</div>
              </div>
              <button onClick={()=>setEditingDocId(null)} style={{marginLeft:"auto",background:"transparent",border:"none",color:T.textMuted,cursor:"pointer",fontSize:18}}>×</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"1/-1"}}>
                <label style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Nom du fichier *</label>
                <input value={editDocForm.name||""} onChange={e=>setEditDocForm(f=>({...f,name:e.target.value}))}
                  style={{width:"100%",marginTop:3,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Catégorie</label>
                <select value={editDocForm.category||"CONTRAT"} onChange={e=>setEditDocForm(f=>({...f,category:e.target.value}))}
                  style={{width:"100%",marginTop:3,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}}>
                  {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Processus</label>
                <select value={editDocForm.process||"O01"} onChange={e=>setEditDocForm(f=>({...f,process:e.target.value}))}
                  style={{width:"100%",marginTop:3,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}}>
                  {["O01","O02","O03","S01","S02","S03","P01","P02","P03","P04"].map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Dossier lié</label>
                <select value={editDocForm.dossierId||""} onChange={e=>setEditDocForm(f=>({...f,dossierId:e.target.value}))}
                  style={{width:"100%",marginTop:3,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}}>
                  <option value="">— Aucun —</option>
                  {activeDossiers.map(d=><option key={d.id} value={d.id}>{d.ref} — {d.client}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Client lié</label>
                <select value={editDocForm.clientId||""} onChange={e=>setEditDocForm(f=>({...f,clientId:e.target.value}))}
                  style={{width:"100%",marginTop:3,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}}>
                  <option value="">— Aucun —</option>
                  {allClients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Statut</label>
                <select value={editDocForm.status||"ACTIF"} onChange={e=>setEditDocForm(f=>({...f,status:e.target.value}))}
                  style={{width:"100%",marginTop:3,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12}}>
                  {["ACTIF","EN_ATTENTE","RÉVISION","ARCHIVE"].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Tags (séparés par des virgules)</label>
                <input value={editDocForm.tags||""} onChange={e=>setEditDocForm(f=>({...f,tags:e.target.value}))}
                  placeholder="urgent, contrat, 2025"
                  style={{width:"100%",marginTop:3,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Notes</label>
                <textarea value={editDocForm.notes||""} onChange={e=>setEditDocForm(f=>({...f,notes:e.target.value}))} rows={2}
                  style={{width:"100%",marginTop:3,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 10px",color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditingDocId(null)} style={{background:T.surface2,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:12}}>Annuler</button>
              <button onClick={saveEditDoc} style={{background:"linear-gradient(135deg,#6366F1,#4F46E5)",border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontWeight:700,fontSize:13}}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {showClientForm&&<CRMClientFormModal
        T={T}
        clientForm={clientForm}
        setClientForm={setClientForm}
        clientFormInit={clientFormInit}
        editingClientId={editingClientId}
        setEditingClientId={setEditingClientId}
        setShowClientForm={setShowClientForm}
        handleSaveClient={handleSaveClient}
        users={users}
        CRM_SEGMENTS={CRM_SEGMENTS_C}
        CRM_SECTEURS={CRM_SECTEURS_C}
        CRM_SOURCES={CRM_SOURCES_C}
        CRM_RISKS={CRM_RISKS_C}
        CRM_KYC={CRM_KYC_C}
        CRM_STATUTS={CRM_STATUTS_C}
        CRM_PROCS_METIER={CRM_PROCS_METIER_C}
      />}

      {/* Modale Relance */}
      {showRelanceForm&&(
        <div style={{position:"fixed",inset:0,background:"#000A",zIndex:6000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={async e=>{if(e.target===e.currentTarget)setShowRelanceForm(false);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"22px 26px",width:480,maxWidth:"95vw",boxShadow:"0 24px 80px #0009"}}>
            <div style={{color:T.text,fontWeight:900,fontSize:15,marginBottom:14}}>🔔 Programmer une relance O01</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"1/-1"}}><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Objet *</label>
                <input value={relanceForm.objet} onChange={e=>setRelanceForm(f=>({...f,objet:e.target.value}))} placeholder="Rappel contrat, Suivi dossier, Relance honoraires..."
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:12,boxSizing:"border-box",marginTop:3}}/></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Client *</label>
                <select value={relanceForm.clientId} onChange={e=>setRelanceForm(f=>({...f,clientId:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}>
                  <option value="">— Sélectionner —</option>{allClients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Type</label>
                <select value={relanceForm.type} onChange={e=>setRelanceForm(f=>({...f,type:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}>
                  {CRM_TYPES_RELANCE.map(t=><option key={t} value={t}>{t}</option>)}
                </select></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Date relance *</label>
                <input type="date" value={relanceForm.dateRelance} onChange={e=>setRelanceForm(f=>({...f,dateRelance:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}/></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Priorité</label>
                <select value={relanceForm.priorite} onChange={e=>setRelanceForm(f=>({...f,priorite:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}>
                  {["FAIBLE","NORMALE","HAUTE","URGENTE"].map(p=><option key={p} value={p}>{p}</option>)}
                </select></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Assignée à</label>
                <select value={relanceForm.assignedTo} onChange={e=>setRelanceForm(f=>({...f,assignedTo:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}>
                  {users.filter(u=>_activeUser(u)&&!u.isAdmin&&u.level>=1).map(u=><option key={u.id} value={u.id}>{u.name} ({u.process})</option>)}
                </select></div>
              <div style={{gridColumn:"1/-1"}}><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Notes</label>
                <textarea value={relanceForm.notes} onChange={e=>setRelanceForm(f=>({...f,notes:e.target.value}))} rows={2}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 11px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box",marginTop:3}}/></div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button onClick={handleSaveRelance} style={{flex:1,background:"#EF4444",border:"none",color:"#fff",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700}}>🔔 Programmer</button>
              <button onClick={()=>setShowRelanceForm(false)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 14px",cursor:"pointer"}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Interaction */}
      {showInterForm&&(
        <div style={{position:"fixed",inset:0,background:"#000A",zIndex:6000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={async e=>{if(e.target===e.currentTarget)setShowInterForm(false);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"22px 26px",width:460,maxWidth:"95vw",boxShadow:"0 24px 80px #0009"}}>
            <div style={{color:T.text,fontWeight:900,fontSize:15,marginBottom:14}}>💬 Enregistrer une interaction</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Client *</label>
                <select value={interForm.clientId} onChange={e=>setInterForm(f=>({...f,clientId:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}>
                  <option value="">— Sélectionner —</option>{allClients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Type</label>
                <select value={interForm.type} onChange={e=>setInterForm(f=>({...f,type:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}>
                  {CRM_TYPES_INTERACTION.map(t=><option key={t} value={t}>{t}</option>)}
                </select></div>
              <div style={{gridColumn:"1/-1"}}><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Objet *</label>
                <input value={interForm.objet} onChange={e=>setInterForm(f=>({...f,objet:e.target.value}))} placeholder="Suivi dossier, Présentation services, Négociation..."
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:12,boxSizing:"border-box",marginTop:3}}/></div>
              <div style={{gridColumn:"1/-1"}}><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Notes / Compte-rendu</label>
                <textarea value={interForm.notes} onChange={e=>setInterForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Résumé de l'échange, décisions prises, prochaines étapes..."
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 11px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box",marginTop:3}}/></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Durée (min)</label>
                <input type="number" value={interForm.duree} onChange={e=>setInterForm(f=>({...f,duree:Number(e.target.value)}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,boxSizing:"border-box",marginTop:3}}/></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Résultat obtenu</label>
                <input value={interForm.resultat} onChange={e=>setInterForm(f=>({...f,resultat:e.target.value}))} placeholder="RDV planifié, Devis envoyé..."
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,boxSizing:"border-box",marginTop:3}}/></div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button onClick={handleSaveInteraction} style={{flex:1,background:"#8B5CF6",border:"none",color:"#fff",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700}}>💬 Enregistrer</button>
              <button onClick={()=>setShowInterForm(false)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 14px",cursor:"pointer"}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Opportunité */}
      {showOppForm&&(
        <div style={{position:"fixed",inset:0,background:"#000A",zIndex:6000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={async e=>{if(e.target===e.currentTarget)setShowOppForm(false);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"22px 26px",width:500,maxWidth:"95vw",boxShadow:"0 24px 80px #0009"}}>
            <div style={{color:T.text,fontWeight:900,fontSize:15,marginBottom:14}}>💼 Nouvelle opportunité commerciale</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"1/-1"}}><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Titre *</label>
                <input value={oppForm.titre} onChange={e=>setOppForm(f=>({...f,titre:e.target.value}))} placeholder="Mission juridique, Constitution société..."
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:12,boxSizing:"border-box",marginTop:3}}/></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Client *</label>
                <select value={oppForm.clientId} onChange={e=>setOppForm(f=>({...f,clientId:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}>
                  <option value="">— Sélectionner —</option>{allClients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Étape</label>
                <select value={oppForm.etape} onChange={e=>setOppForm(f=>({...f,etape:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}>
                  {CRM_ETAPES.map(e=><option key={e.k} value={e.k}>{e.l}</option>)}
                </select></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Montant (FCFA)</label>
                <input type="number" value={oppForm.valeur} onChange={e=>setOppForm(f=>({...f,valeur:e.target.value}))} placeholder="500000"
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,boxSizing:"border-box",marginTop:3}}/></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Probabilité : {oppForm.probabilite}%</label>
                <input type="range" min="0" max="100" value={oppForm.probabilite} onChange={e=>setOppForm(f=>({...f,probabilite:Number(e.target.value)}))}
                  style={{width:"100%",marginTop:8}}/></div>
              <div><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Échéance</label>
                <input type="date" value={oppForm.dateEcheance} onChange={e=>setOppForm(f=>({...f,dateEcheance:e.target.value}))}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 11px",color:T.text,fontSize:11,marginTop:3}}/></div>
              <div style={{gridColumn:"1/-1"}}><label style={{color:T.textMuted,fontSize:10,textTransform:"uppercase",fontWeight:700}}>Notes</label>
                <textarea value={oppForm.notes} onChange={e=>setOppForm(f=>({...f,notes:e.target.value}))} rows={2}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 11px",color:T.text,fontSize:11,resize:"vertical",boxSizing:"border-box",marginTop:3}}/></div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button onClick={handleSaveOpp} style={{flex:1,background:"#C9A84C",border:"none",color:"#000",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700}}>✅ Créer</button>
              <button onClick={()=>setShowOppForm(false)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"10px 14px",cursor:"pointer"}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
