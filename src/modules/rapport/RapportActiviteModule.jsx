import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
// RapportActiviteModule.jsx — SI Génie Consultant v127
// Module Rapport d'Activité — Pilotage par processus et période
// FIX v127 — Fichier manquant (dossier rapport/ était vide), créé pour démarrer l'app
import { GC_SUBPROC_MAP, STATUS_CONFIG, PRIORITY_CONFIG } from '../../core/constants.js';
import { dsSave } from '../../core/datastore.js';
import { Btn, PrintButton } from '../../components/UI.jsx';

// ─── Utilitaire ────────────────────────────────────────────────────────────
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
const isoToFr = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR'); } catch (_) { return iso || '—'; } };

// ─── Composant KPI Card ────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color, icon, T }) => (
  <div style={{
    background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12,
    padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 160px', minWidth: 150,
  }}>
    <div style={{
      width: 44, height: 44, borderRadius: 10,
      background: `linear-gradient(135deg, ${color}33, ${color}22)`,
      border: `1px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
    }}>{icon}</div>
    <div>
      <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ color: T.text, fontWeight: 900, fontSize: 22, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: color, fontSize: 11, marginTop: 3 }}>{sub}</div>}
    </div>
  </div>
);

// ─── Barre de progression ───────────────────────────────────────────────────
const ProgressBar = ({ value, max, color, T }) => {
  const w = pct(value, max);
  return (
    <div style={{ background: T.border, borderRadius: 4, height: 6, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.min(w, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export function RapportActiviteModule({ T, currentUser, dossiers = [], taches = [], rdvs = [], users = [], setNotifications, setTaches }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);

  // ── Période ──────────────────────────────────────────────────────────
  const now = new Date();
  const [periode, setPeriode] = useState('mois');   // 'semaine' | 'mois' | 'trimestre' | 'annee' | 'custom'
  const [dateDebut, setDateDebut] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dateFin, setDateFin] = useState(now.toISOString().split('T')[0]);

  // Calcul automatique selon la période choisie
  const { debut, fin } = useMemo(() => {
    const today = new Date();
    const fmt = d => d.toISOString().split('T')[0];
    if (periode === 'custom') return { debut: dateDebut, fin: dateFin };
    if (periode === 'semaine') {
      const d = new Date(today); d.setDate(d.getDate() - 7);
      return { debut: fmt(d), fin: fmt(today) };
    }
    if (periode === 'mois') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1);
      return { debut: fmt(d), fin: fmt(today) };
    }
    if (periode === 'trimestre') {
      const d = new Date(today); d.setMonth(d.getMonth() - 3);
      return { debut: fmt(d), fin: fmt(today) };
    }
    if (periode === 'annee') {
      return { debut: `${today.getFullYear()}-01-01`, fin: fmt(today) };
    }
    return { debut: dateDebut, fin: dateFin };
  }, [periode, dateDebut, dateFin]);

  // ── Filtre données sur la période ────────────────────────────────────
  const inPeriod = useCallback((iso) => {
    if (!iso) return false;
    const d = iso.split('T')[0];
    return d >= debut && d <= fin;
  }, [debut, fin]);

  const lvl = currentUser?.level || 1;
  const uid = currentUser?.id;
  const isAdmin = currentUser?.isAdmin || lvl >= 5;
  const isDG    = currentUser?.isDG   || lvl >= 6;
  const userProcesses = [...new Set([...(currentUser?.processes||[]), currentUser?.process].filter(Boolean))];
  const isProcessManager = (lvl >= 3 && userProcesses.includes('O01')) || (lvl >= 4 && userProcesses.some(p => p !== 'O01')) || isAdmin || isDG;
  const [generatedReports, setGeneratedReports] = useState([]);
  const [reportScope, setReportScope] = useState('self');
  const [selectedUserId, setSelectedUserId] = useState(uid);
  const [reportRequests, setReportRequests] = useState([]);
  const [printOrientation, setPrintOrientation] = useState('portrait');
  const [printPageSize, setPrintPageSize] = useState('A4');

  const eligibleCollabUsers = users.filter(u => u && u.id && u.id !== uid && u.level >= 1 && u.level <= 5 &&
    userProcesses.some(proc => (u.process === proc || (u.processes||[]).includes(proc)))
  );
  const eligibleDGUsers = users.filter(u => u && u.id && u.level >= 1 && u.level <= 5);

  useEffect(() => {
    if (reportScope === 'selected') {
      const pool = isDG ? eligibleDGUsers : eligibleCollabUsers;
      if (pool.length > 0 && !pool.some(u => u.id === selectedUserId)) {
        setSelectedUserId(pool[0].id);
      }
    } else if (!users.some(u => u.id === selectedUserId)) {
      setSelectedUserId(uid);
    }
  }, [reportScope, selectedUserId, eligibleCollabUsers, eligibleDGUsers, users, uid, isDG]);

  const createUserReport = (targetUser) => {
    const userDossiers = dossiers.filter(d => d && (d.assignedTo === targetUser.id || d.responsable === targetUser.id || d.createdBy === targetUser.id));
    const userTaches = taches.filter(t => t && (t.assignee === targetUser.id || t.createdBy === targetUser.id));
    const userRdvs = rdvs.filter(r => r && (r.userId === targetUser.id || (r.participants||[]).includes(targetUser.id)));

    const report = {
      id: `RPT-${Date.now()}-${targetUser.id}`,
      targetId: targetUser.id,
      targetName: targetUser.name,
      generatedBy: currentUser?.id,
      generatedByName: currentUser?.name,
      generatedAt: new Date().toISOString(),
      dossierCount: userDossiers.length,
      tacheCount: userTaches.length,
      rdvCount: userRdvs.length,
      dossiers: userDossiers.map(d=>({ref:d.ref,status:d.status,process:d.process,progress:d.progress || 0})),
      taches: userTaches.map(t=>({titre:t.titre||t.title,status:t.status,priority:t.priority,deadline:t.dueDate||t.deadline})),
      rdvs: userRdvs.map(r=>({title:r.title || r.objet, date:r.date, status:r.statut || r.status}))
    };
    setGeneratedReports(prev => [report, ...prev]);
    setNotifications && setNotifications(prev => [{id: 'N' + Date.now(), icon:'📊', message:`Rapport d'activité généré pour ${targetUser.name} par ${currentUser?.name}`, at:new Date().toISOString(), read:false, module:'rapport'}, ...prev]);
    return report;
  };

  const handleGenerate = () => {
    if (reportScope === 'self') {
      const u = users.find(u => u.id === uid);
      if (!u) return gcAlert('Utilisateur introuvable pour génération de rapport.');
      createUserReport(u);
      return;
    }
    if (reportScope === 'process') {
      if (!isProcessManager) return gcAlert('Accès refusé: vous ne pouvez générer que pour vos collaborateurs.');
      if (eligibleCollabUsers.length === 0) return gcAlert('Aucun collaborateur trouvé dans votre processus pour générer un rapport.');
      eligibleCollabUsers.forEach(u=>createUserReport(u));
      return;
    }
    if (reportScope === 'selected') {
      const u = users.find(u=>u.id===selectedUserId);
      if (!u) return gcAlert('Utilisateur sélectionné introuvable. Veuillez sélectionner un collaborateur valide.');
      createUserReport(u);
      return;
    }
    if (reportScope === 'all') {
      if (!isDG) return gcAlert('Accès réservé DG.');
      if (eligibleDGUsers.length === 0) return gcAlert('Aucun utilisateur disponible pour génération globale.');
      eligibleDGUsers.forEach(u=>createUserReport(u));
      return;
    }
  };

  const handleTransferReport = (reportId) => {
    const report = generatedReports.find(r => r.id===reportId);
    if (!report) return gcAlert('Rapport introuvable.');
    const dest = window.prompt('Saisir l\'ID / nom / e-mail de l\'utilisateur destinataire :');
    if (!dest) return;
    const userDest = users.find(u => u.id===dest || u.name===dest || u.email===dest);
    if (!userDest) return gcAlert('Utilisateur destinataire introuvable.');

    const transferTask = {
      id: 'T'+Date.now(),
      titre: `📤 Transfert rapport ${report.id} vers ${userDest.name}`,
      description: `Rapport d'activité ${report.id} transféré par ${currentUser?.name}.`,
      status: 'EN_ATTENTE',
      statut: 'EN_ATTENTE',
      priority: 'NORMALE',
      creatorId: currentUser?.id,
      assignee: userDest.id,
      assigneeId: userDest.id,
      module: 'rapport',
      type: 'TRANSFER_RAPPORT',
      dueDate: new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      canCancel: true,
    };
    if (setTaches) setTaches(prev => { const _u=[transferTask,...prev]; dsSave('taches',_u); return _u; });

    setNotifications(prev => [{id:'N'+Date.now(), icon:'📤', message:`Rapport ${report.id} transféré à ${userDest.name} par ${currentUser?.name}`, at:new Date().toISOString(), read:false, module:'rapport'}, ...prev]);
    gcAlert(`Rapport transféré à ${userDest.name} et tâche créée.`);
  };

  const handleRequestWrittenReport = (reportId) => {
    const report = generatedReports.find(r => r.id===reportId);
    if (!report) return gcAlert('Rapport introuvable.');
    const userDest = users.find(u => u.id === report.targetId);
    if (!userDest) return gcAlert('Utilisateur lié au rapport introuvable.');

    setReportRequests(prev => [{id:'REQ-'+Date.now(), reportId, userId:userDest.id, userName:userDest.name, requestedBy:currentUser?.name, requestedAt:new Date().toISOString(), status:'EN_ATTENTE'}, ...prev]);

    const writeTask = {
      id: 'T'+Date.now(),
      titre: `📝 Rédaction rapport écrit pour ${userDest.name}`,
      description: `Rédiger un rapport écrit sur l'activité du rapport ${report.id} (généré le ${isoToFr(report.generatedAt)}).`,
      status: 'EN_ATTENTE',
      statut: 'EN_ATTENTE',
      priority: 'HAUTE',
      creatorId: currentUser?.id,
      assignee: userDest.id,
      assigneeId: userDest.id,
      module: 'rapport',
      type: 'RAPPORT_ECRIT',
      dueDate: new Date(Date.now() + 2*24*60*60*1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      canCancel: true,
    };
    if (setTaches) setTaches(prev => { const _u=[writeTask,...prev]; dsSave('taches',_u); return _u; });

    setNotifications(prev => [{id:'N'+Date.now(), icon:'📝', message:`Demande de rapport écrit envoyée à ${userDest.name} pour rapport ${report.id}`, at:new Date().toISOString(), read:false, module:'rapport'}, ...prev]);
    gcAlert(`Demande de rapport écrit créée pour ${userDest.name} et tâche ajoutée.`);
  };

  // ── Statistiques dossiers ────────────────────────────────────────────
  const dosStats = useMemo(() => {
    const mine   = isAdmin ? dossiers : dossiers.filter(d => d.responsable === uid || d.createdBy === uid);
    const period = mine.filter(d => inPeriod(d.createdAt || d.date));
    const total  = mine.length;
    const ouverts    = mine.filter(d => !['TERMINE','ARCHIVE','ANNULE'].includes(d.status)).length;
    const termines   = mine.filter(d => d.status === 'TERMINE').length;
    const enCours    = mine.filter(d => d.status === 'EN_COURS').length;
    const enAttente  = mine.filter(d => d.status === 'EN_ATTENTE').length;
    const nouveaux   = period.length;
    const avgProg    = mine.length ? Math.round(mine.reduce((s, d) => s + (d.progress || 0), 0) / mine.length) : 0;
    // Top processus
    const byProc = {};
    mine.forEach(d => { const p = d.process || 'N/A'; byProc[p] = (byProc[p] || 0) + 1; });
    const topProcs = Object.entries(byProc).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { total, ouverts, termines, enCours, enAttente, nouveaux, avgProg, topProcs, period };
  }, [dossiers, uid, isAdmin, inPeriod]);

  // ── Statistiques tâches ──────────────────────────────────────────────
  const tchStats = useMemo(() => {
    const mine   = isAdmin ? taches : taches.filter(t => t.assignee === uid || t.createdBy === uid);
    const period = mine.filter(t => inPeriod(t.createdAt || t.date));
    const total      = mine.length;
    const terminees  = mine.filter(t => ['TERMINÉ','TERMINE'].includes(t.status)).length;
    const enRetard   = mine.filter(t => {
      if (['TERMINÉ','TERMINE'].includes(t.status)) return false;
      return t.dueDate && t.dueDate < now.toISOString().split('T')[0];
    }).length;
    const urgentes   = mine.filter(t => t.priority === 'URGENT' && !['TERMINÉ','TERMINE'].includes(t.status)).length;
    const taux       = pct(terminees, total);
    return { total, terminees, enRetard, urgentes, taux, nouvelles: period.length };
  }, [taches, uid, isAdmin, inPeriod]);

  // ── Statistiques RDV ─────────────────────────────────────────────────
  const rdvStats = useMemo(() => {
    const mine   = isAdmin ? rdvs : rdvs.filter(r => r.userId === uid || r.participants?.includes(uid));
    const period = mine.filter(r => inPeriod(r.date));
    const total  = mine.length;
    const passes  = mine.filter(r => r.date < now.toISOString().split('T')[0]).length;
    const futures = mine.filter(r => r.date >= now.toISOString().split('T')[0]).length;
    return { total, passes, futures, periode: period.length };
  }, [rdvs, uid, isAdmin, inPeriod]);

  // ── Activité récente ─────────────────────────────────────────────────
  const recentDossiers = useMemo(() =>
    [...dossiers]
      .filter(d => isAdmin || d.responsable === uid || d.createdBy === uid)
      .filter(d => inPeriod(d.createdAt || d.date))
      .sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''))
      .slice(0, 8),
    [dossiers, uid, isAdmin, inPeriod]
  );

  const recentTaches = useMemo(() =>
    [...taches]
      .filter(t => isAdmin || t.assignee === uid || t.createdBy === uid)
      .filter(t => t.priority === 'URGENT' && !['TERMINÉ','TERMINE'].includes(t.status))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 6),
    [taches, uid, isAdmin]
  );

  // ── Couleur statut ───────────────────────────────────────────────────
  const statusColor = (s) => STATUS_CONFIG[s]?.color || '#6B7280';
  const statusLabel = (s) => STATUS_CONFIG[s]?.label || s;
  const priorityColor = (p) => PRIORITY_CONFIG[p]?.color || '#6B7280';

  // ── Libellés période ─────────────────────────────────────────────────
  const periodeLabel = { semaine: '7 derniers jours', mois: '30 derniers jours', trimestre: '3 derniers mois', annee: `Année ${now.getFullYear()}`, custom: `${debut} → ${fin}` }[periode] || '';

  // ════════════════════════════════════════════════════════════════════
  // RENDU
  // ════════════════════════════════════════════════════════════════════
  return (
    <div id="rapport-activite-print" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Barre contrôle période ── */}
      <div style={{
        background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ color: T.textMuted, fontSize: 12, fontWeight: 600 }}>PÉRIODE :</span>
        {['semaine','mois','trimestre','annee','custom'].map(p => (
          <button key={p} onClick={() => setPeriode(p)} style={{
            padding: '5px 12px', borderRadius: 7, border: `1px solid ${periode === p ? '#C9A84C' : T.border}`,
            background: periode === p ? '#C9A84C22' : 'transparent',
            color: periode === p ? '#C9A84C' : T.textMuted, cursor: 'pointer', fontSize: 12, fontWeight: periode === p ? 700 : 400,
          }}>
            {{ semaine: '7 j', mois: '1 mois', trimestre: '3 mois', annee: 'Année', custom: 'Personnalisé' }[p]}
          </button>
        ))}
        {periode === 'custom' && (
          <>
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.inputBg, color: T.text, fontSize: 12 }} />
            <span style={{ color: T.textMuted, fontSize: 12 }}>→</span>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.inputBg, color: T.text, fontSize: 12 }} />
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: T.textMuted, fontSize: 11 }}>{periodeLabel}</span>
          <select value={printOrientation} onChange={e => setPrintOrientation(e.target.value)} style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text }}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Paysage</option>
          </select>
          <select value={printPageSize} onChange={e => setPrintPageSize(e.target.value)} style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text }}>
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
          </select>
          <PrintButton targetId="rapport-activite-print" title="Rapport d'activité" T={T} orientation={printOrientation} pageSize={printPageSize} margin="15mm" />
        </div>
      </div>

      {/* ── En-tête rapport ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0A1E4A, #0F2D6B)',
        border: `1px solid #1E3A5F`, borderRadius: 12, padding: '20px 24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ color: '#C9A84C', fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>GÉNIE CONSULTANT — RAPPORT D'ACTIVITÉ</div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>
              {isAdmin ? 'Vue globale cabinet' : `Rapport de ${currentUser?.name || 'l\'utilisateur'}`}
            </div>
            <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>
              Généré le {isoToFr(now.toISOString())} · Période : {periodeLabel}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13 }}>{currentUser?.role || '—'}</div>
            <div style={{ color: '#94A3B8', fontSize: 11 }}>Niveau {currentUser?.level || '—'} · Processus {currentUser?.process || '—'}</div>
          </div>
        </div>
      </div>

      {/* ── KPIs synthèse ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard T={T} icon="📂" color="#3B82F6" label="Dossiers actifs" value={dosStats.ouverts} sub={`+${dosStats.nouveaux} sur la période`} />
        <KpiCard T={T} icon="✅" color="#10B981" label="Dossiers terminés" value={dosStats.termines} sub={`${pct(dosStats.termines, dosStats.total)}% du total`} />
        <KpiCard T={T} icon="📋" color="#8B5CF6" label="Tâches réalisées" value={tchStats.terminees} sub={`Taux ${tchStats.taux}%`} />
        <KpiCard T={T} icon="⚠️" color="#F59E0B" label="Tâches en retard" value={tchStats.enRetard} sub={tchStats.enRetard > 0 ? 'Action requise' : 'Aucun retard'} />
        <KpiCard T={T} icon="📅" color="#06B6D4" label="RDV sur la période" value={rdvStats.periode} sub={`${rdvStats.futures} à venir`} />
        {isAdmin && <KpiCard T={T} icon="👥" color="#EC4899" label="Collaborateurs" value={users.filter(u => !u.isAdmin).length} sub="comptes actifs" />}
      </div>

      {/* ── Génération rapport collaborateur (managers / DG) ── */}
      {isProcessManager && (
        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, marginTop: 12 }}>
          <div style={{ color: T.text, fontWeight: 700, marginBottom: 8 }}>📑 Générer rapport d'activité</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select value={reportScope} onChange={e => setReportScope(e.target.value)} style={{ padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text }}>
              <option value="self">Pour moi-même</option>
              <option value="process">Pour mes collaborateurs (même processus)</option>
              <option value="selected">Utilisateur spécifique</option>
              {isDG && <option value="all">Tous les utilisateurs (Niv.1-5)</option>}
            </select>
            {reportScope === 'selected' && (
              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} style={{ padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text }}>
                { (isDG ? eligibleDGUsers : eligibleCollabUsers).map(u => <option key={u.id} value={u.id}>{u.name} ({u.process || '—'})</option>) }
              </select>
            )}
            <button onClick={handleGenerate} style={{ background: '#3B82F6', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 700 }}>🛠️ Générer</button>
          </div>
          {generatedReports.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: T.textMuted, fontSize: 10, marginBottom: 8 }}>Rapports générés ({generatedReports.length})</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {generatedReports.map(report => (
                  <div key={report.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontWeight: 700 }}>{report.targetName} — {report.dossierCount} dossiers, {report.tacheCount} tâches, {report.rdvCount} rdv</div>
                      <div style={{ color: T.textMuted, fontSize: 11 }}>Généré le {isoToFr(report.generatedAt)} par {report.generatedByName}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleTransferReport(report.id)} style={{ background: '#0EA5E9', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 11 }}>📤 Transférer</button>
                      <button onClick={() => handleRequestWrittenReport(report.id)} style={{ background: '#F59E0B', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 11 }}>📝 Demander écrit</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {reportRequests.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: T.textMuted, fontSize: 10, marginBottom: 6 }}>Demandes de rapport écrit ({reportRequests.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {reportRequests.slice(0, 5).map(req => (
                  <div key={req.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: 6, fontSize: 10, color: T.textMuted }}>
                    {isoToFr(req.requestedAt)} - {req.requestedBy} → {req.userName} ({req.status})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Avancement dossiers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Répartition statuts */}
        <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>📂 Répartition dossiers</div>
          {[
            { label: 'En cours',    val: dosStats.enCours,   color: '#3B82F6' },
            { label: 'En attente',  val: dosStats.enAttente, color: '#F59E0B' },
            { label: 'Terminés',    val: dosStats.termines,  color: '#10B981' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: T.textMuted, fontSize: 12 }}>{label}</span>
                <span style={{ color: T.text, fontWeight: 700, fontSize: 12 }}>{val} <span style={{ color: T.textMuted, fontWeight: 400 }}>({pct(val, dosStats.total)}%)</span></span>
              </div>
              <ProgressBar value={val} max={dosStats.total} color={color} T={T} />
            </div>
          ))}
          <div style={{ marginTop: 12, padding: '8px 0', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: T.textMuted, fontSize: 12 }}>Avancement moyen</span>
            <span style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13 }}>{dosStats.avgProg}%</span>
          </div>
        </div>

        {/* Tâches urgentes */}
        <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>🔥 Tâches prioritaires</div>
          {recentTaches.length === 0 ? (
            <div style={{ color: T.textMuted, fontSize: 12, textAlign: 'center', paddingTop: 20 }}>✅ Aucune tâche urgente en cours</div>
          ) : recentTaches.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
              borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor(t.priority), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.text, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || t.label || '—'}</div>
                <div style={{ color: T.textMuted, fontSize: 11 }}>Échéance : {isoToFr(t.dueDate)}</div>
              </div>
              <div style={{
                padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: `${statusColor(t.status)}22`, color: statusColor(t.status),
              }}>{statusLabel(t.status)}</div>
            </div>
          ))}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: T.textMuted, fontSize: 11 }}>Total urgentes actives</span>
            <span style={{ color: '#F59E0B', fontWeight: 700 }}>{tchStats.urgentes}</span>
          </div>
        </div>
      </div>

      {/* ── Dossiers de la période ── */}
      <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
          📋 Dossiers créés sur la période ({recentDossiers.length})
        </div>
        {recentDossiers.length === 0 ? (
          <div style={{ color: T.textMuted, fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
            Aucun dossier créé sur cette période.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {['Référence', 'Client / Objet', 'Processus', 'Responsable', 'Créé le', 'Avancement', 'Statut'].map(h => (
                    <th key={h} style={{ color: T.textMuted, fontWeight: 600, padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentDossiers.map((d, i) => {
                  const resp = users.find(u => u.id === d.responsable);
                  return (
                    <tr key={d.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? 'transparent' : `${T.border}22` }}>
                      <td style={{ padding: '7px 10px', color: '#C9A84C', fontWeight: 700, whiteSpace: 'nowrap' }}>{d.ref || d.id?.slice(0, 12) || '—'}</td>
                      <td style={{ padding: '7px 10px', color: T.text, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.client || d.objet || d.title || '—'}</td>
                      <td style={{ padding: '7px 10px', color: T.textMuted, whiteSpace: 'nowrap' }}>{d.process || '—'}</td>
                      <td style={{ padding: '7px 10px', color: T.text, whiteSpace: 'nowrap' }}>{resp?.name || d.responsable || '—'}</td>
                      <td style={{ padding: '7px 10px', color: T.textMuted, whiteSpace: 'nowrap' }}>{isoToFr(d.createdAt || d.date)}</td>
                      <td style={{ padding: '7px 10px', minWidth: 90 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ProgressBar value={d.progress || 0} max={100} color="#3B82F6" T={T} />
                          <span style={{ color: T.text, fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>{d.progress || 0}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                          background: `${statusColor(d.status)}22`, color: statusColor(d.status),
                        }}>{statusLabel(d.status)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Top processus (admin seulement) ── */}
      {isAdmin && dosStats.topProcs.length > 0 && (
        <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>🗂️ Charge par processus</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dosStats.topProcs.map(([proc, nb]) => {
              const subprocs = GC_SUBPROC_MAP[proc] || [];
              const label = subprocs[0]?.code?.split('.')?.[0] || proc;
              return (
                <div key={proc} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 56, color: '#C9A84C', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{proc}</div>
                  <ProgressBar value={nb} max={dosStats.total} color="#3B82F6" T={T} />
                  <div style={{ width: 32, color: T.text, fontWeight: 700, fontSize: 12, textAlign: 'right', flexShrink: 0 }}>{nb}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 10,
        padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ color: T.textMuted, fontSize: 11 }}>
          Rapport généré automatiquement par SI Génie Consultant v127 · {isoToFr(now.toISOString())}
        </span>
        <span style={{ color: T.textMuted, fontSize: 11 }}>
          {dosStats.total} dossiers · {tchStats.total} tâches · {rdvStats.total} RDV
        </span>
      </div>

    </div>
  );
}

export default RapportActiviteModule;
