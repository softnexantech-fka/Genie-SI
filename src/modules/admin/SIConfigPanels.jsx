/**
 * SIConfigPanels.jsx — v143
 * Panneaux de configuration système du SI Génie Consultant.
 *
 * Ces composants étaient auparavant dans FinanceApp.jsx, créant une dépendance
 * illégitime : des modules non-Finance (BureauOffice, SIRH, GestionDocs, AdminPanel)
 * devaient importer depuis le module Finance pour accéder à des configs système.
 *
 * FIX v143 — Extraction ici pour que chaque module reste autonome et que
 * l'accès restreint à Finance (S01/P03) ne bloque pas les configs SI.
 *
 * Exports :
 *  - DelaiConfigPanelO01   (config délais SI — O01 Administration)
 *  - FiscalConfigPanel     (config fiscale OHADA/Gabon — Direction)
 *  - ExportBackupPanel     (sauvegarde/restauration legacy complète du SI)
 *  - gcBuildBackupPayload  (helper utilisé par AdminPanel granular backup)
 *  - gcSaveAutoBackup      (helper — snapshot auto localStorage)
 *  - gcLoadLatestAutoBackup
 *  - gcGetLatestAutoBackupMeta
 */

import React from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import {
  _lsGet, _lsSet, _lsRm, lsSave, _noop,
  playSound, gcGetDelaiConfig, gcLoadFiscalConfig,
  dsSave, gcSyncAuthUsers,
} from '../../core/index.js';
import { dsForceResyncAll, dsGetSyncStatus, SHARED_KEYS } from '../../core/datastore.js';
import { gcSyncFilesToServer, gcFileStats } from '../../core/filestore.js';
import { useRemoteSync } from '../../hooks/useSyncedState.js';
import { gcToast } from '../../components/ToastManager.jsx';
import { GC_FISCAL_CONFIG_DEFAULT } from '../../core/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers backup internes
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_BACKUP_KEY = 'gc-auto-backup-latest';

// Strip base64 file data from dossierFiles to keep backup size reasonable
const _stripFileData = (files) => {
  if (!Array.isArray(files)) return [];
  return files.map(f => {
    const { dataUrl, fileData, base64, content, ...rest } = f;
    return rest;
  });
};

const _lsParseArray = (key) => {
  try { const r = _lsGet(key); return r ? JSON.parse(r) : []; } catch (_) { return []; }
};

export const gcBuildBackupPayload = (data) => {
  // Lecture des clés module depuis localStorage
  const dossierFiles    = _stripFileData(_lsParseArray('gc-dossier-files'));
  const standaloneDocs  = _lsParseArray('gc-standalone-docs');
  const docsUnified     = _lsParseArray('gc-docs-unified');
  const siDocs          = _lsParseArray('gc-si-docs');
  const internalDocs    = _lsParseArray('gc-internal-docs');
  const externalDocs    = _lsParseArray('gc-external-docs');
  const factures        = _lsParseArray('gc-factures');
  const budget          = _lsParseArray('gc-budget');
  const risks           = _lsParseArray('gc-risks');
  const auditChecklist  = _lsParseArray('gc-audit-checklist');
  const auditProg       = _lsParseArray('gc-audit-prog');
  const crmRelances     = _lsParseArray('gc-crm-relances');
  const crmInteractions = _lsParseArray('gc-crm-interactions');
  const crmOpps         = _lsParseArray('gc-crm-opps');
  const jurKyc          = _lsParseArray('gc-jur-kyc');
  const jurDocs         = _lsParseArray('gc-jur-docs');
  const stocks          = _lsParseArray('gc-stocks');
  const achats          = _lsParseArray('gc-achats');
  const logStocks       = _lsParseArray('gc-logmod-stocks');

  return {
    version: 'GC_SI_v58',
    exportedAt: new Date().toISOString(),
    exportedBy: data.userName || 'Admin',
    meta: {
      users:         data.users?.length    || 0,
      dossiers:      data.dossiers?.length || 0,
      taches:        data.taches?.length   || 0,
      dossierFiles:  dossierFiles.length,
      factures:      factures.length,
      docs:          (standaloneDocs.length + docsUnified.length + internalDocs.length + externalDocs.length),
    },
    data: {
      users:            data.users            || [],
      dossiers:         data.dossiers         || [],
      taches:           data.taches           || [],
      rdvs:             data.rdvs             || [],
      partners:         data.partners         || [],
      pendingApprovals: data.pendingApprovals || [],
      journal:          data.journal          || [],
      sessionLogs:      (data.sessionLogs || []).slice(0, 500),
      // Documents & fichiers (base64 supprimé pour réduire la taille)
      dossierFiles,
      standaloneDocs,
      docsUnified,
      siDocs,
      internalDocs,
      externalDocs,
      // Finance
      factures,
      budget,
      // Risques & Audit
      risks,
      auditChecklist,
      auditProg,
      // CRM
      crmRelances,
      crmInteractions,
      crmOpps,
      // Juridique
      jurKyc,
      jurDocs,
      // Logistique
      stocks,
      achats,
      logStocks,
      // siAppearance intentionnellement absent (logos base64 → fichier énorme)
    },
  };
};

export const gcSaveAutoBackup = (backup) => {
  try {
    _lsSet(AUTO_BACKUP_KEY, JSON.stringify(backup));
    return backup.meta || {};
  } catch (_) {
    return backup.meta || {};
  }
};

export const gcLoadLatestAutoBackup = () => {
  try {
    const raw = _lsGet(AUTO_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.version || !parsed?.data) return null;
    return parsed;
  } catch (_) {
    return null;
  }
};

export const gcGetLatestAutoBackupMeta = () => {
  const b = gcLoadLatestAutoBackup();
  if (!b) return null;
  return { ...(b.meta || {}), exportedAt: b.exportedAt, exportedBy: b.exportedBy };
};

const gcExportFullBackup = (data) => {
  const backup = gcBuildBackupPayload(data);
  const json   = JSON.stringify(backup, null, 2);
  const blob   = new Blob([json], { type: 'application/json' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `GC_SI_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return backup.meta;
};

const gcImportBackup = (file, onSuccess, onError) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.version || !backup.version.startsWith('GC_SI'))
        throw new Error('Fichier de sauvegarde invalide — version incompatible');
      onSuccess(backup);
    } catch (err) {
      onError(err.message || 'Erreur lors de la lecture du fichier');
    }
  };
  reader.readAsText(file);
};

const gcCheckStorageQuota = async () => {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      const pct = Math.round((usage / quota) * 100);
      return { usage, quota, pct, warning: pct > 70 };
    }
    let total = 0;
    try { Object.keys(localStorage).forEach(k => { total += (localStorage.getItem(k) || '').length * 2; }); } catch (_) {}
    const pct = Math.round((total / (5 * 1024 * 1024)) * 100);
    return { usage: total, quota: 5 * 1024 * 1024, pct, warning: pct > 70 };
  } catch (_) {
    return { usage: 0, quota: 0, pct: 0, warning: false };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT : Configuration des délais SI (O01 / Niv.3+)
// ─────────────────────────────────────────────────────────────────────────────

export function DelaiConfigPanelO01({ T, currentUser, lvl, isAdmin, setNotifications = _noop }) {
  const canConfig = lvl >= 3 || isAdmin
    || currentUser?.process === 'O01'
    || (currentUser?.processes || []).includes('O01');

  const [delaiCfg, setDelaiCfg] = React.useState(() => gcGetDelaiConfig());
  const [saved,    setSaved]    = React.useState(false);
  useRemoteSync({ 'gc-delai-config': setDelaiCfg });

  const PROCS = { O01:'Administration',O02:'Juridique',O03:'Éval. & Gestion',S01:'Finance',S02:'Audit',S03:'RH',S04:'Communication',S05:'Logistique',S06:'Entretien',P01:'Management',P02:'Gouvernance',P03:'Contrôle gestion',P04:'Veille' };

  const saveCfg = (cfg) => {
    try {
      _lsSet('gc-delai-config', JSON.stringify(cfg));
      dsSave('gc-delai-config', cfg).catch(() => {});
      setDelaiCfg(cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setNotifications && setNotifications(p => [{
        id: 'N'+Date.now(), icon: '⏱️',
        message: `Délais MàJ par ${currentUser?.name} — Court:${cfg.court}j · Long:${cfg.long}j · Urgence:${cfg.urgence}j`,
        at: new Date().toISOString(), read: false, module: 'o01',
      }, ...p]);
      playSound('success');
    } catch (_) {}
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ color:T.text, fontWeight:700, fontSize:11 }}>⏱️ Paramétrage des Délais — O01 Administration</div>
          <div style={{ color:T.textMuted, fontSize:9, marginTop:1 }}>
            Accessible : O01 · Niv.3+ · Direction SI
            {!canConfig && <span style={{ color:'#EF4444', marginLeft:8 }}>🔒 Accès insuffisant (Niv.3+ requis)</span>}
          </div>
        </div>
        {canConfig && saved && <span style={{ background:'#22C55E22', color:'#22C55E', border:'1px solid #22C55E44', borderRadius:6, padding:'3px 10px', fontSize:10, fontWeight:700 }}>✅ Enregistré</span>}
      </div>

      {/* Délais globaux */}
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:12, marginBottom:10 }}>
        <div style={{ color:'#F97316', fontWeight:700, fontSize:10, marginBottom:10, textTransform:'uppercase' }}>Délais Globaux Cabinet</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[{k:'court',l:'⏱ Délai Court',c:'#22C55E'},{k:'long',l:'📋 Délai Long',c:'#3B82F6'},{k:'urgence',l:'🔴 Urgence',c:'#EF4444'}].map(item => (
            <div key={item.k} style={{ background:T.surface, border:`2px solid ${item.c}33`, borderRadius:8, padding:10 }}>
              <div style={{ color:item.c, fontWeight:700, fontSize:11, marginBottom:4 }}>{item.l}</div>
              {canConfig
                ? <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <input type="number" min="1" max="180" value={delaiCfg[item.k]}
                      onChange={e => setDelaiCfg(p => ({ ...p, [item.k]: Number(e.target.value) }))}
                      style={{ width:50, background:T.surface2, border:`2px solid ${item.c}66`, borderRadius:6, padding:'5px 7px', color:item.c, fontSize:14, fontWeight:900, textAlign:'center' }}/>
                    <span style={{ color:T.textMuted, fontSize:10 }}>jours</span>
                  </div>
                : <div style={{ color:item.c, fontSize:18, fontWeight:900 }}>{delaiCfg[item.k]}<span style={{ fontSize:10, marginLeft:3 }}>j</span></div>}
            </div>
          ))}
        </div>
      </div>

      {/* Seuils d'alerte */}
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:12, marginBottom:10 }}>
        <div style={{ color:'#F97316', fontWeight:700, fontSize:10, marginBottom:10, textTransform:'uppercase' }}>Seuils d'Alerte Automatique</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[{k:'jaune',l:'🟡 Alerte Jaune',c:'#F59E0B'},{k:'orange',l:'🟠 Alerte Orange',c:'#F97316'},{k:'rouge',l:'🔴 Alerte Rouge',c:'#EF4444'}].map(item => (
            <div key={item.k} style={{ background:T.surface, border:`2px solid ${item.c}33`, borderRadius:8, padding:10 }}>
              <div style={{ color:item.c, fontWeight:700, fontSize:11, marginBottom:4 }}>{item.l}</div>
              {canConfig
                ? <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <span style={{ color:T.textMuted, fontSize:9 }}>≤</span>
                    <input type="number" min="0" max="30" value={delaiCfg.alertes?.[item.k] ?? 0}
                      onChange={e => setDelaiCfg(p => ({ ...p, alertes:{ ...p.alertes, [item.k]: Number(e.target.value) } }))}
                      style={{ width:45, background:T.surface2, border:`2px solid ${item.c}66`, borderRadius:6, padding:'5px 7px', color:item.c, fontSize:14, fontWeight:900, textAlign:'center' }}/>
                    <span style={{ color:T.textMuted, fontSize:10 }}>jours</span>
                  </div>
                : <div style={{ color:item.c, fontSize:18, fontWeight:900 }}>≤{delaiCfg.alertes?.[item.k]}<span style={{ fontSize:10, marginLeft:3 }}>j</span></div>}
            </div>
          ))}
        </div>
      </div>

      {/* Délais par processus */}
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:12, marginBottom: canConfig ? 10 : 0 }}>
        <div style={{ color:'#F97316', fontWeight:700, fontSize:10, marginBottom:10, textTransform:'uppercase' }}>Délais par Processus Métier</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:7 }}>
          {Object.entries(delaiCfg.byProcess || {}).map(([proc, jours]) => (
            <div key={proc} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, padding:'7px 9px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ color: jours <= 14 ? '#22C55E' : '#3B82F6', fontFamily:'monospace', fontWeight:700, fontSize:10 }}>{proc}</div>
                <div style={{ color:T.textDim, fontSize:8 }}>{PROCS[proc] || proc}</div>
              </div>
              {canConfig
                ? <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                    <input type="number" min="1" max="180" value={jours}
                      onChange={e => setDelaiCfg(p => ({ ...p, byProcess:{ ...p.byProcess, [proc]: Number(e.target.value) } }))}
                      style={{ width:42, background:T.surface2, border:`1px solid ${jours<=14?'#22C55E44':'#3B82F644'}`, borderRadius:5, padding:'3px 5px', color: jours<=14?'#22C55E':'#3B82F6', fontSize:12, fontWeight:700, textAlign:'center' }}/>
                    <span style={{ color:T.textDim, fontSize:8 }}>j</span>
                  </div>
                : <span style={{ color: jours<=14?'#22C55E':'#3B82F6', fontWeight:900, fontSize:13 }}>{jours}j</span>}
            </div>
          ))}
        </div>
      </div>

      {canConfig && (
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={() => saveCfg(delaiCfg)}
            style={{ background:'#F97316', border:'none', color:'#fff', borderRadius:8, padding:'9px 20px', cursor:'pointer', fontWeight:700, fontSize:12 }}>
            💾 Enregistrer
          </button>
          <button onClick={() => setDelaiCfg(gcGetDelaiConfig())}
            style={{ background:'transparent', border:`1px solid ${T.border}`, color:T.textMuted, borderRadius:8, padding:'9px 14px', cursor:'pointer', fontSize:11 }}>
            ↺ Annuler
          </button>
          <button onClick={() => { const d={court:14,long:21,urgence:3,byProcess:{O01:14,O02:21,O03:21,S01:14,S02:21,S03:14,S04:14,S05:14,S06:14,P01:21,P02:21,P03:14,P04:14},alertes:{rouge:0,orange:3,jaune:7}}; saveCfg(d); }}
            style={{ background:'transparent', border:'1px solid #F59E0B44', color:'#F59E0B', borderRadius:8, padding:'9px 14px', cursor:'pointer', fontSize:11 }}>
            ↺ Réinitialiser (14j/21j)
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT : Configuration fiscale OHADA / Gabon (Direction / Admin)
// ─────────────────────────────────────────────────────────────────────────────

export function FiscalConfigPanel({ T, currentUser }) {
  const _dlg     = useDialog();
  const gcAlert   = (msg, t, i) => _dlg.alert(msg, t, i);
  const gcConfirm = (msg, t, i, d) => _dlg.confirm(msg, t, i, d);

  const [cfg,      setCfg]      = React.useState(() => gcLoadFiscalConfig());
  const [saved,    setSaved]    = React.useState(false);
  const [showIRPP, setShowIRPP] = React.useState(false);
  useRemoteSync({ 'gc-fiscal-config': setCfg });

  const save = () => {
    try {
      _lsSet('gc-fiscal-config', JSON.stringify({ ...cfg, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name || 'Admin' }));
      dsSave('gc-fiscal-config', cfg).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { gcAlert('Erreur : ' + e.message); }
  };

  const reset = async () => {
    if (!await gcConfirm('Réinitialiser aux taux officiels Gabon 2026 ?')) return;
    _lsRm('gc-fiscal-config');
    setCfg(GC_FISCAL_CONFIG_DEFAULT);
    setSaved(false);
  };

  const Field = ({ label, field, pct, note }) => (
    <div style={{ marginBottom:10 }}>
      <label style={{ color:T.textMuted, fontSize:10, display:'block', marginBottom:3, fontWeight:600, textTransform:'uppercase' }}>{label}</label>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input type="number" step="0.001" min="0" max="1"
          value={pct ? (cfg[field] * 100).toFixed(3) : cfg[field]}
          onChange={e => setCfg(f => ({ ...f, [field]: pct ? parseFloat(e.target.value)/100 : parseFloat(e.target.value)||0 }))}
          style={{ width:100, background:T.surface3, border:`1px solid ${T.border}`, borderRadius:6, padding:'6px 8px', color:'#C9A84C', fontSize:13, fontWeight:700, textAlign:'right' }}/>
        <span style={{ color:T.textMuted, fontSize:11 }}>{pct ? '%' : 'FCFA'}</span>
        {note && <span style={{ color:T.textDim, fontSize:10 }}>{note}</span>}
      </div>
    </div>
  );

  return (
    <div style={{ padding:4 }}>
      <div style={{ color:T.text, fontWeight:800, fontSize:14, marginBottom:4 }}>💰 Configuration Fiscale OHADA — Gabon</div>
      <div style={{ color:T.textMuted, fontSize:11, marginBottom:16 }}>
        Modifiez les taux fiscaux sans toucher au code. Dernière MàJ : {cfg.updatedAt?.slice(0,10)||'—'} par {cfg.updatedBy||'Système'}.
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:14 }}>
          <div style={{ color:'#3B82F6', fontWeight:700, fontSize:12, marginBottom:10 }}>🏛️ CNSS</div>
          <Field label="Part salarié" field="cnss_salarie" pct note="Prélevée sur le brut"/>
          <Field label="Part patronale" field="cnss_patronal" pct note="À charge employeur"/>
        </div>
        <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:14 }}>
          <div style={{ color:'#22C55E', fontWeight:700, fontSize:12, marginBottom:10 }}>🏥 CNAMGS</div>
          <Field label="Part salarié" field="cnamgs_salarie" pct note="Prélevée sur le brut"/>
          <Field label="Part patronale" field="cnamgs_patronal" pct note="À charge employeur"/>
        </div>
        <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:14 }}>
          <div style={{ color:'#C9A84C', fontWeight:700, fontSize:12, marginBottom:10 }}>📋 TVA</div>
          <Field label="Taux normal" field="tva_normal" pct note="Standard Gabon"/>
          <Field label="Taux réduit" field="tva_reduit" pct note="Biens/services spéc."/>
        </div>
        <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:14 }}>
          <div style={{ color:'#A855F7', fontWeight:700, fontSize:12, marginBottom:10 }}>🏢 IS & Seuils</div>
          <Field label="IS (taux normal)" field="is_taux" pct/>
          <Field label="SMIC mensuel" field="smic_mensuel" note="FCFA/mois"/>
          <Field label="Seuil exo. IS PME" field="seuil_exoneration_is" note="FCFA"/>
        </div>
      </div>

      {/* IRPP */}
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:14, marginTop:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ color:'#EF4444', fontWeight:700, fontSize:12 }}>📊 IRPP — Tranches progressives</div>
          <button onClick={() => setShowIRPP(p => !p)}
            style={{ background:'transparent', border:`1px solid ${T.border}`, color:T.textMuted, borderRadius:6, padding:'3px 10px', cursor:'pointer', fontSize:11 }}>
            {showIRPP ? '▲ Masquer' : '▼ Voir / Modifier'}
          </button>
        </div>
        {showIRPP && (cfg.irpp_tranches || []).map((tr, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:6, padding:8, background:T.surface3, borderRadius:8 }}>
            {[['min','MIN (FCFA)',' '],['max','MAX (vide=∞)',' '],['taux','TAUX (%)','pct']].map(([field, lbl, type]) => (
              <div key={field}>
                <label style={{ color:T.textDim, fontSize:9, fontWeight:600 }}>{lbl}</label>
                <input type="number" value={type==='pct' ? (tr.taux*100).toFixed(1) : (tr[field]||'')}
                  onChange={e => setCfg(f => ({ ...f, irpp_tranches: f.irpp_tranches.map((t,j) => j!==i ? t : {
                    ...t, [field]: type==='pct' ? parseFloat(e.target.value)/100 : (e.target.value ? parseFloat(e.target.value) : null)
                  })}))}
                  style={{ width:'100%', background:T.surface, border:`1px solid ${T.border}`, borderRadius:5, padding:'5px 7px', color: type==='pct'?'#EF4444':T.text, fontSize:11, fontWeight: type==='pct'?700:400 }}/>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Timeout session */}
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:14, marginTop:14 }}>
        <div style={{ color:'#06B6D4', fontWeight:700, fontSize:12, marginBottom:8 }}>🔐 Sécurité — Timeout de session</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <input type="number" min="5" max="240"
            defaultValue={(() => { try { return parseInt(JSON.parse(_lsGet('gc-session-timeout-min')||'30'),10)||30; } catch(_){return 30;} })()}
            onChange={e => { try { _lsSet('gc-session-timeout-min', JSON.stringify(parseInt(e.target.value)||30)); } catch(_){} }}
            style={{ width:80, background:T.surface3, border:`1px solid ${T.border}`, borderRadius:6, padding:'6px 8px', color:'#06B6D4', fontSize:13, fontWeight:700, textAlign:'right' }}/>
          <span style={{ color:T.textMuted, fontSize:12 }}>minutes d'inactivité avant déconnexion</span>
        </div>
        <div style={{ color:T.textDim, fontSize:10, marginTop:4 }}>Avertissement 2 min avant. Direction SI exemptée.</div>
      </div>

      <div style={{ display:'flex', gap:8, marginTop:16 }}>
        <button onClick={save}
          style={{ background: saved ? '#22C55E' : 'linear-gradient(135deg,#C9A84C,#A07030)', border:'none', color:'#fff', borderRadius:8, padding:'10px 22px', cursor:'pointer', fontWeight:800, fontSize:13 }}>
          {saved ? '✅ Enregistré !' : '💾 Enregistrer'}
        </button>
        <button onClick={reset}
          style={{ background:'transparent', border:`1px solid ${T.border}`, color:T.textMuted, borderRadius:8, padding:'10px 16px', cursor:'pointer', fontSize:12 }}>
          🔄 Réinitialiser (Gabon 2026)
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT : Export / Import sauvegarde complète SI (legacy v57)
// ─────────────────────────────────────────────────────────────────────────────

export function ExportBackupPanel({
  T, currentUser,
  users=[], dossiers=[], taches=[], rdvs=[], partners=[], pendingApprovals=[], sessionLogs=[], siAppearance,
  setUsers=_noop, setDossiers=_noop, setTaches=_noop, setRdvs=_noop, setPartners=_noop, setPendingApprovals=_noop,
}) {
  const _dlg      = useDialog();
  const gcAlert   = (msg, t, i) => _dlg.alert(msg, t, i);
  const gcConfirm = (msg, t, i, d) => _dlg.confirm(msg, t, i, d);

  const [importing,      setImporting]      = React.useState(false);
  const [importMsg,      setImportMsg]      = React.useState('');
  const [quota,          setQuota]          = React.useState(null);
  const [autoBackupMeta, setAutoBackupMeta] = React.useState(() => gcGetLatestAutoBackupMeta());
  const fileRef = React.useRef(null);

  React.useEffect(() => { gcCheckStorageQuota().then(q => setQuota(q)); }, []);

  React.useEffect(() => {
    const run = () => {
      try {
        const payload = gcBuildBackupPayload({
          userName: currentUser?.name || 'Admin',
          users, dossiers, taches, rdvs, partners, pendingApprovals,
          journal: (() => { try { return JSON.parse(_lsGet('gc-journal')||'[]'); } catch(_){return[];} })(),
          sessionLogs,
        });
        setAutoBackupMeta(gcSaveAutoBackup(payload));
      } catch (_) {}
    };
    run();
    const iv = setInterval(run, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [currentUser?.name, users, dossiers, taches, rdvs, partners, pendingApprovals, sessionLogs]);

  const applyBackup = async (backup) => {
    const d = backup.data || {};
    if (d.users && setUsers)               { lsSave('users', d.users);               setUsers(d.users);               await dsSave('users', d.users); }
    if (d.dossiers && setDossiers)         { lsSave('dossiers', d.dossiers);         setDossiers(d.dossiers);         await dsSave('dossiers', d.dossiers); }
    if (d.taches && setTaches)             { lsSave('taches', d.taches);             setTaches(d.taches);             await dsSave('taches', d.taches); }
    if (d.rdvs && setRdvs)                 { lsSave('rdvs', d.rdvs);                 setRdvs(d.rdvs);                 await dsSave('rdvs', d.rdvs); }
    if (d.partners && setPartners)         { lsSave('partners', d.partners);         setPartners(d.partners);         await dsSave('partners', d.partners); }
    if (d.pendingApprovals && setPendingApprovals) { lsSave('pendingApprovals', d.pendingApprovals); setPendingApprovals(d.pendingApprovals); await dsSave('pendingApprovals', d.pendingApprovals); }
    if (d.journal) { try { _lsSet('gc-journal', JSON.stringify(d.journal)); dsSave('gc-journal', d.journal).catch(err => gcToast.syncError('gc-journal', err)); } catch(_){} }
    // Restauration docs & fichiers (métadonnées seulement, pas de base64)
    const _restoreKey = (key, val) => { try { if (Array.isArray(val) && val.length) { _lsSet(key, JSON.stringify(val)); dsSave(key, val).catch(() => {}); } } catch(_){} };
    _restoreKey('gc-dossier-files',    d.dossierFiles);
    _restoreKey('gc-standalone-docs',  d.standaloneDocs);
    _restoreKey('gc-docs-unified',     d.docsUnified);
    _restoreKey('gc-si-docs',          d.siDocs);
    _restoreKey('gc-internal-docs',    d.internalDocs);
    _restoreKey('gc-external-docs',    d.externalDocs);
    _restoreKey('gc-factures',         d.factures);
    _restoreKey('gc-budget',           d.budget);
    _restoreKey('gc-risks',            d.risks);
    _restoreKey('gc-audit-checklist',  d.auditChecklist);
    _restoreKey('gc-audit-prog',       d.auditProg);
    _restoreKey('gc-crm-relances',     d.crmRelances);
    _restoreKey('gc-crm-interactions', d.crmInteractions);
    _restoreKey('gc-crm-opps',         d.crmOpps);
    _restoreKey('gc-jur-kyc',          d.jurKyc);
    _restoreKey('gc-jur-docs',         d.jurDocs);
    _restoreKey('gc-stocks',           d.stocks);
    _restoreKey('gc-achats',           d.achats);
    _restoreKey('gc-logmod-stocks',    d.logStocks);
    setImportMsg('⏳ Synchronisation comptes serveur...');
    try { await gcSyncAuthUsers(); } catch (_) {}
  };

  const handleExport = () => {
    const meta = gcExportFullBackup({ userName: currentUser?.name||'Admin', users, dossiers, taches, rdvs, partners, pendingApprovals,
      journal: (() => { try { return JSON.parse(_lsGet('gc-journal')||'[]'); } catch(_){return[];} })(), sessionLogs, siAppearance });
    gcAlert(`✅ Export réussi !\n${meta.users} utilisateurs · ${meta.dossiers} dossiers · ${meta.taches} tâches · ${meta.factures} factures · ${meta.docs} docs · ${meta.dossierFiles} fichiers`);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!await gcConfirm('⚠️ L\'import va REMPLACER toutes les données actuelles. Continuer ?')) return;
    setImporting(true); setImportMsg('Lecture du fichier...');
    gcImportBackup(file,
      async (backup) => {
        try {
          await applyBackup(backup);
          gcSaveAutoBackup(backup); setAutoBackupMeta(gcGetLatestAutoBackupMeta());
          const d = backup.data || {};
          setImportMsg(`✅ Import réussi ! ${d.users?.length||0} util. · ${d.dossiers?.length||0} dossiers · ${d.taches?.length||0} tâches · ${d.factures?.length||0} factures · ${(d.dossierFiles?.length||0)} fichiers. Rechargez.`);
        } catch (err) { setImportMsg('❌ Erreur : ' + err.message); }
        setImporting(false);
      },
      (err) => { setImportMsg('❌ ' + err); setImporting(false); }
    );
    e.target.value = '';
  };

  const handleSnapshotNow = () => {
    const payload = gcBuildBackupPayload({ userName: currentUser?.name||'Admin', users, dossiers, taches, rdvs, partners, pendingApprovals,
      journal: (() => { try { return JSON.parse(_lsGet('gc-journal')||'[]'); } catch(_){return[];} })(), sessionLogs });
    const meta = gcSaveAutoBackup(payload); setAutoBackupMeta(meta);
    gcAlert(`✅ Snapshot local enregistré.\n${meta.users} util. · ${meta.dossiers} dossiers · ${meta.taches} tâches · ${meta.factures||0} factures · ${meta.docs||0} docs`);
  };

  const handleRestoreLocal = async () => {
    const backup = gcLoadLatestAutoBackup();
    if (!backup) { gcAlert('Aucune sauvegarde locale disponible.'); return; }
    if (!await gcConfirm('⚠️ Restaurer le dernier snapshot local ?')) return;
    setImporting(true); setImportMsg('⏳ Restauration...');
    try {
      await applyBackup(backup);
      setImportMsg(`✅ Restauré (${backup.exportedAt?.slice(0,10)||'—'}). Rechargez.`);
    } catch (err) { setImportMsg('❌ ' + err.message); }
    finally { setImporting(false); }
  };

  return (
    <div style={{ padding:4 }}>
      <div style={{ color:T.text, fontWeight:800, fontSize:14, marginBottom:4 }}>💾 Export / Import des données SI</div>
      <div style={{ color:T.textMuted, fontSize:11, marginBottom:16 }}>Sauvegarde complète de toutes les données du SI (JSON).</div>

      {quota && (
        <div style={{ background: quota.warning?'#EF444415':T.surface2, border:`1px solid ${quota.warning?'#EF4444':'#3B82F6'}44`, borderRadius:10, padding:12, marginBottom:14 }}>
          <div style={{ color: quota.warning?'#EF4444':T.text, fontWeight:700, fontSize:12, marginBottom:4 }}>{quota.warning?'⚠️':'📊'} Stockage : {quota.pct}%</div>
          <div style={{ background:T.surface3, borderRadius:99, height:8, overflow:'hidden' }}>
            <div style={{ width:`${Math.min(quota.pct,100)}%`, height:'100%', background: quota.pct>90?'#EF4444':quota.pct>70?'#F59E0B':'#22C55E', borderRadius:99 }}/>
          </div>
          <div style={{ color:T.textMuted, fontSize:10, marginTop:4 }}>{(quota.usage/1024/1024).toFixed(2)} Mo / ~{(quota.quota/1024/1024).toFixed(0)} Mo</div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div style={{ background:T.surface2, border:'1px solid #22C55E33', borderRadius:12, padding:14 }}>
          <div style={{ color:'#22C55E', fontWeight:700, fontSize:13, marginBottom:8 }}>📤 Exporter</div>
          <div style={{ color:T.textMuted, fontSize:10, marginBottom:10 }}>👥 {users?.length||0} util. · 📁 {dossiers?.length||0} dossiers · ✅ {taches?.length||0} tâches · 📅 {rdvs?.length||0} RDV</div>
          <button onClick={handleExport} style={{ width:'100%', background:'linear-gradient(135deg,#22C55E,#16A34A)', border:'none', color:'#fff', borderRadius:8, padding:'10px', cursor:'pointer', fontWeight:800, fontSize:12 }}>
            ⬇️ Télécharger JSON
          </button>
        </div>
        <div style={{ background:T.surface2, border:'1px solid #3B82F633', borderRadius:12, padding:14 }}>
          <div style={{ color:'#3B82F6', fontWeight:700, fontSize:13, marginBottom:8 }}>🛡️ Snapshot local</div>
          <div style={{ color:T.textMuted, fontSize:10, marginBottom:10 }}>
            {autoBackupMeta?.exportedAt ? `Dernière : ${new Date(autoBackupMeta.exportedAt).toLocaleString('fr-FR')}` : 'Aucune sauvegarde locale'}
          </div>
          <div style={{ display:'flex', gap:6, flexDirection:'column' }}>
            <button onClick={handleSnapshotNow} disabled={importing}
              style={{ background:'#3B82F622', border:'1px solid #3B82F644', color:'#3B82F6', borderRadius:8, padding:'8px', cursor:'pointer', fontWeight:700, fontSize:11 }}>
              💾 Sauvegarder maintenant
            </button>
            <button onClick={handleRestoreLocal} disabled={importing || !autoBackupMeta}
              style={{ background:'#8B5CF622', border:'1px solid #8B5CF644', color:'#8B5CF6', borderRadius:8, padding:'8px', cursor: importing||!autoBackupMeta?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
              ♻️ Restaurer
            </button>
          </div>
        </div>
      </div>

      {/* Export ZIP complet */}
      <div style={{ background:T.surface2, border:'1px solid #06B6D433', borderRadius:12, padding:14, marginBottom:12 }}>
        <div style={{ color:'#06B6D4', fontWeight:700, fontSize:13, marginBottom:8 }}>Export ZIP (dossiers + fichiers)</div>
        <div style={{ color:T.textMuted, fontSize:10, marginBottom:10 }}>
          Télécharge un fichier ZIP complet : dossiers SI avec README.md, métadonnées JSON et fichiers attachés. Idéal pour archivage disque externe ou cloud.
        </div>
        <button onClick={() => {
          const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
          try {
            const proxyUrl = JSON.parse(_lsGet('gc-ai-proxy-url') || 'null') || 'http://localhost:3001';
            window.open(`${proxyUrl}/api/export/all/zip`, '_blank');
          } catch {
            window.open(`http://localhost:3001/api/export/all/zip`, '_blank');
          }
        }} style={{ width:'100%', background:'linear-gradient(135deg,#06B6D4,#0891B2)', border:'none', color:'#fff', borderRadius:8, padding:'10px', cursor:'pointer', fontWeight:800, fontSize:12 }}>
          Télécharger ZIP complet (dossiers + fichiers + JSON)
        </button>
      </div>

      <div style={{ background:T.surface2, border:'1px solid #F59E0B33', borderRadius:12, padding:14 }}>
        <div style={{ color:'#F59E0B', fontWeight:700, fontSize:13, marginBottom:8 }}>Importer une sauvegarde</div>
        <div style={{ background:'#EF444415', border:'1px solid #EF444433', borderRadius:8, padding:'8px 12px', fontSize:11, color:'#EF4444', fontWeight:600, marginBottom:10 }}>
          ⚠️ L'import remplacera TOUTES les données. Exportez d'abord !
        </div>
        <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display:'none' }}/>
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          style={{ background: importing?T.surface3:'#F59E0B22', border:'1px solid #F59E0B44', color:'#F59E0B', borderRadius:8, padding:'9px 18px', cursor: importing?'not-allowed':'pointer', fontWeight:700, fontSize:12 }}>
          {importing ? '⏳ Importation...' : '📂 Choisir un fichier'}
        </button>
        {importMsg && (
          <div style={{ marginTop:10, padding:'8px 12px', background: importMsg.startsWith('✅')?'#22C55E15':'#EF444415', border:`1px solid ${importMsg.startsWith('✅')?'#22C55E':'#EF4444'}33`, borderRadius:8, color: importMsg.startsWith('✅')?'#22C55E':'#EF4444', fontSize:12, fontWeight:600 }}>
            {importMsg}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT : Panneau Sync & Intégrité des données (Admin)
// Permet de vérifier la cohérence des données, forcer un resync global,
// pousser les données locales vers le serveur, et synchroniser les fichiers IDB.
// ─────────────────────────────────────────────────────────────────────────────

export function SyncControlPanel({ T, currentUser }) {
  const [status,      setStatus]      = React.useState(null);
  const [serverInfo,  setServerInfo]  = React.useState(null);
  const [keyCounts,   setKeyCounts]   = React.useState(null);
  const [fileStats,   setFileStats]   = React.useState(null);
  const [diskStatus,  setDiskStatus]  = React.useState(null);
  const [loading,     setLoading]     = React.useState('');
  const [log,         setLog]         = React.useState([]);
  const _dlg = useDialog();

  const addLog = (msg, type = 'info') =>
    setLog(p => [{ id: Date.now(), msg, type, at: new Date().toLocaleTimeString('fr-FR') }, ...p].slice(0, 40));

  // Rafraîchir le statut local toutes les 3s
  React.useEffect(() => {
    const refresh = () => setStatus(dsGetSyncStatus());
    refresh();
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, []);

  // Charger les stats fichiers IDB au montage
  React.useEffect(() => {
    gcFileStats().then(s => setFileStats(s)).catch(() => {});
  }, []);

  // Charger le statut disque serveur au montage
  React.useEffect(() => {
    const fetchDisk = async () => {
      try {
        const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
        const st = dsGetSyncStatus();
        const r = await fetch(`${st.proxyUrl || 'http://localhost:3001'}/api/disk/status`, {
          headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(8000)
        });
        if (r.ok) setDiskStatus(await r.json());
      } catch {}
    };
    fetchDisk();
    const iv = setInterval(fetchDisk, 60_000); // Actualiser toutes les minutes
    return () => clearInterval(iv);
  }, []);

  const fetchServerInfo = async () => {
    setLoading('server');
    try {
      const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
      const r = await fetch(
        `${status?.proxyUrl || 'http://localhost:3001'}/api/sync/status`,
        { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) { setServerInfo(await r.json()); addLog('Statut serveur récupéré', 'success'); }
      else addLog('Erreur récupération statut serveur', 'error');
    } catch (e) { addLog(`Erreur réseau : ${e.message}`, 'error'); }
    setLoading('');
  };

  const fetchKeyCounts = async () => {
    setLoading('keys');
    try {
      const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
      const r = await fetch(
        `${status?.proxyUrl || 'http://localhost:3001'}/api/sync/key-counts`,
        { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(15000) }
      );
      if (r.ok) {
        const data = await r.json();
        setKeyCounts(data.keys || {});
        addLog(`${Object.keys(data.keys||{}).length} clés inspectées`, 'success');
      } else addLog('Erreur récupération key-counts', 'error');
    } catch (e) { addLog(`Erreur : ${e.message}`, 'error'); }
    setLoading('');
  };

  // Tirer une clé spécifique depuis le serveur vers ce poste
  const handlePullKey = async (key) => {
    try {
      const { dsGet } = await import('../../core/datastore.js');
      const { lsSave } = await import('../../core/storage.js');
      const val = await dsGet(key, null);
      if (val !== null && val !== undefined) {
        lsSave(key, val);
        addLog(`↓ ${key} : serveur → local (${Array.isArray(val) ? val.length + ' entrées' : 'ok'})`, 'success');
        // Forcer re-fetch dans useSyncedState via StorageEvent
        try { window.dispatchEvent(new StorageEvent('storage', { key: `__GC__${key}`, newValue: JSON.stringify({ ts: Date.now(), action: 'pull' }) })); } catch {}
      } else {
        addLog(`↓ ${key} : clé absente du serveur`, 'warn');
      }
    } catch (e) { addLog(`Erreur pull ${key} : ${e.message}`, 'error'); }
    await fetchKeyCounts();
  };

  // Pousser une clé spécifique depuis ce poste vers le serveur
  const handlePushKey = async (key) => {
    try {
      const raw = _lsGet(key);
      if (!raw) { addLog(`↑ ${key} : rien en local`, 'warn'); return; }
      const val = JSON.parse(raw);
      const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
      const proxyUrl = status?.proxyUrl || 'http://localhost:3001';
      const r = await fetch(`${proxyUrl}/api/data/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ value: val }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) addLog(`↑ ${key} : local → serveur (${Array.isArray(val) ? val.length + ' entrées' : 'ok'})`, 'success');
      else addLog(`↑ ${key} : erreur ${r.status}`, 'error');
    } catch (e) { addLog(`Erreur push ${key} : ${e.message}`, 'error'); }
    await fetchKeyCounts();
  };

  // Tirer TOUTES les clés du serveur vers ce poste (serveur fait autorité)
  const handlePullAllFromServer = async () => {
    if (!await _dlg.confirm(
      'Écraser TOUTES les données de CE POSTE avec celles du serveur ?\n\nLes données locales non encore synchronisées seront perdues.',
      'Serveur → Ce poste', null, true
    )) return;
    setLoading('pull-all');
    addLog('Téléchargement depuis serveur...', 'info');
    const result = await dsForceResyncAll();
    if (result.ok) {
      addLog(`Téléchargement terminé : ${result.synced || 0} clés mises à jour`, 'success');
      playSound('success');
      gcToast.success('Ce poste est maintenant conforme au serveur');
    } else {
      addLog(`Impossible : ${result.reason}`, 'error');
    }
    setLoading('');
    await fetchKeyCounts();
  };

  const handleForceResync = async () => {
    setLoading('resync');
    addLog('Resync local en cours...', 'info');
    try {
      const result = await dsForceResyncAll();
      if (result.ok) {
        addLog(`Resync OK : ${result.synced}/${result.total} clés rafraîchies`, 'success');
        playSound('success');
        gcToast.success('Resync terminé — données à jour');
      } else {
        addLog(`Resync impossible : ${result.reason}`, 'error');
      }
    } catch (e) { addLog(`Erreur resync : ${e.message}`, 'error'); }
    setLoading('');
    setStatus(dsGetSyncStatus());
  };

  const handleResyncAll = async () => {
    if (!await _dlg.confirm('Envoyer un resync global à TOUS les postes connectés ?', 'Resync global', null, false)) return;
    setLoading('resync-all');
    try {
      const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
      const r = await fetch(
        `${status?.proxyUrl || 'http://localhost:3001'}/api/sync/resync-all`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ reason: 'admin_manual' }), signal: AbortSignal.timeout(10000) }
      );
      if (r.ok) {
        const data = await r.json();
        addLog(`Resync global envoyé à ${data.clients} client(s)`, 'success');
        playSound('success');
        gcToast.success(`Resync global → ${data.clients} poste(s) notifiés`);
      } else addLog('Erreur resync global', 'error');
    } catch (e) { addLog(`Erreur : ${e.message}`, 'error'); }
    setLoading('');
  };

  const handleCollectAll = async () => {
    if (!await _dlg.confirm(
      'Collecter les données de TOUS les postes connectés et les agréger sur le serveur ?\n\n' +
      'Chaque poste va pousser ses données locales. Le serveur fera un merge union (les éléments supprimés intentionnellement resteront supprimés grâce aux tombstones). ' +
      'Un resync global sera déclenché 25 secondes après.\n\n' +
      'Opération recommandée pour récupérer des données manquantes.',
      'Collecter & Agréger tous les postes', null, false
    )) return;
    setLoading('collect-all');
    addLog('Collecte en cours — demande à tous les postes de pousser leurs données...', 'info');
    try {
      const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
      const r = await fetch(
        `${status?.proxyUrl || 'http://localhost:3001'}/api/sync/collect-all`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          signal: AbortSignal.timeout(15000) }
      );
      if (r.ok) {
        const data = await r.json();
        addLog(`Collecte lancée : ${data.clients} poste(s) notifiés — resync dans ${data.resyncIn}s`, 'success');
        playSound('success');
        gcToast.success(`Collecte en cours sur ${data.clients} poste(s). Resync dans ${data.resyncIn}s…`);
      } else {
        const err = await r.json().catch(() => ({}));
        addLog(`Erreur collecte : ${err.error || r.status}`, 'error');
      }
    } catch (e) { addLog(`Erreur : ${e.message}`, 'error'); }
    setLoading('');
  };

  const handlePushLocal = async () => {
    if (!await _dlg.confirm('Pousser TOUTES les données locales vers le serveur ? (les données serveur plus récentes seront préservées)', 'Push local → serveur', null, false)) return;
    setLoading('push');
    addLog('Push données locales...', 'info');
    let pushed = 0, skipped = 0;
    const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
    const proxyUrl = status?.proxyUrl || 'http://localhost:3001';
    const AUTH_SENSITIVE_KEYS = new Set(['gc-users', 'users']);
    for (const key of SHARED_KEYS) {
      try {
        if (AUTH_SENSITIVE_KEYS.has(key)) { skipped++; continue; }
        const raw = _lsGet(key);
        if (!raw) { skipped++; continue; }
        const val = JSON.parse(raw);
        const r = await fetch(`${proxyUrl}/api/data/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ value: val, userId: currentUser?.id }),
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) pushed++; else skipped++;
      } catch { skipped++; }
    }
    addLog(`Push terminé : ${pushed} clés envoyées, ${skipped} ignorées`, pushed > 0 ? 'success' : 'warn');
    playSound('success');
    setLoading('');
  };

  const handleSyncIdbFiles = async () => {
    setLoading('idb');
    addLog('Synchronisation fichiers IDB → serveur...', 'info');
    try {
      const result = await gcSyncFilesToServer();
      if (result.offline) { addLog('Hors ligne — impossible de sync les fichiers', 'error'); }
      else { addLog(`Fichiers IDB syncés : ${result.synced}/${result.total||0}`, 'success'); }
    } catch (e) { addLog(`Erreur sync IDB : ${e.message}`, 'error'); }
    gcFileStats().then(s => setFileStats(s)).catch(() => {});
    setLoading('');
  };

  const handleClearTombstones = async () => {
    if (!await _dlg.confirm('Réinitialiser les tombstones ? Les éléments supprimés pourraient réapparaître si un autre poste les a encore en cache. Réservé aux corrections d\'urgence.', 'Réinitialiser tombstones', null, true)) return;
    _lsSet('gc-tombstones', JSON.stringify({}));
    await dsSave('gc-tombstones', {}).catch(() => {});
    addLog('Tombstones réinitialisés', 'warn');
    gcToast.warning('Tombstones effacés — vérifiez les données après resync');
  };

  const StatusDot = ({ ok }) => (
    <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%',
      background: ok ? '#22C55E' : '#EF4444',
      boxShadow: ok ? '0 0 6px #22C55E88' : '0 0 6px #EF444488',
      marginRight:6, flexShrink:0 }}/>
  );

  const logColors = { success:'#22C55E', error:'#EF4444', warn:'#F59E0B', info: T.textMuted };

  return (
    <div style={{ padding:4 }}>
      <div style={{ color:T.text, fontWeight:800, fontSize:14, marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
        <StatusDot ok={status?.online && status?.socketReady}/>
        Synchronisation & Intégrité des données
      </div>
      <div style={{ color:T.textMuted, fontSize:11, marginBottom:16 }}>
        Vérification, resync forcé, push local, sync fichiers hors ligne. Réservé à l'administration.
      </div>

      {/* Statut local */}
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12, padding:14, marginBottom:12 }}>
        <div style={{ color:T.text, fontWeight:700, fontSize:12, marginBottom:10 }}>Statut ce poste</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
          {[
            { label:'Réseau', val: status?.online ? 'En ligne' : 'Hors ligne', ok: status?.online },
            { label:'WebSocket', val: status?.socketReady ? 'Connecté' : 'Déconnecté', ok: status?.socketReady },
            { label:'File hors ligne', val: `${status?.offlineQueue || 0} éléments`, ok: (status?.offlineQueue || 0) === 0 },
            { label:'Cache mémoire', val: `${status?.cacheSize || 0} clés`, ok: true },
          ].map(({ label, val, ok }) => (
            <div key={label} style={{ background:T.surface3, borderRadius:8, padding:'8px 10px', display:'flex', alignItems:'center', gap:6 }}>
              <StatusDot ok={ok}/>
              <div>
                <div style={{ color:T.textMuted, fontSize:10 }}>{label}</div>
                <div style={{ color:T.text, fontWeight:700, fontSize:11 }}>{val}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Statut serveur */}
      {serverInfo && (
        <div style={{ background:T.surface2, border:'1px solid #3B82F633', borderRadius:12, padding:14, marginBottom:12 }}>
          <div style={{ color:'#3B82F6', fontWeight:700, fontSize:12, marginBottom:10 }}>Statut serveur</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {[
              { label:'Clients connectés', val: serverInfo.connectedClients },
              { label:'Clés SQLite', val: serverInfo.keyCount },
              { label:'Fichiers serveur', val: serverInfo.fileCount },
            ].map(({ label, val }) => (
              <div key={label} style={{ background:T.surface3, borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ color:'#3B82F6', fontWeight:800, fontSize:16 }}>{val}</div>
                <div style={{ color:T.textMuted, fontSize:10 }}>{label}</div>
              </div>
            ))}
          </div>
          {serverInfo.lastUpdate && (
            <div style={{ color:T.textMuted, fontSize:10, marginTop:8 }}>
              Dernière écriture serveur : {new Date(serverInfo.lastUpdate).toLocaleString('fr-FR')}
            </div>
          )}
        </div>
      )}

      {/* Fichiers IDB */}
      {fileStats && (
        <div style={{ background:T.surface2, border:'1px solid #8B5CF633', borderRadius:12, padding:14, marginBottom:12 }}>
          <div style={{ color:'#8B5CF6', fontWeight:700, fontSize:12, marginBottom:8 }}>Fichiers cache local (IDB)</div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            <span style={{ color:T.textMuted, fontSize:11 }}>
              <strong style={{ color:T.text }}>{fileStats.idb?.count || 0}</strong> fichiers IDB
              · {fileStats.idb?.totalSizeMB || 0} Mo · LS {fileStats.localStorage?.usedMB || 0} Mo
            </span>
            {(fileStats.localStorage?.percentUsed || 0) > 70 && (
              <span style={{ color:'#EF4444', fontWeight:600, fontSize:11 }}>
                Stockage local proche de la limite ({fileStats.localStorage.percentUsed}%)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Espace disque serveur */}
      {diskStatus && (
        <div style={{ background: diskStatus.level === 'critical' ? '#EF444410' : diskStatus.level === 'warning' ? '#F59E0B10' : T.surface2,
          border: `1px solid ${diskStatus.level === 'critical' ? '#EF4444' : diskStatus.level === 'warning' ? '#F59E0B' : '#22C55E'}33`,
          borderRadius:12, padding:14, marginBottom:12 }}>
          <div style={{ color: diskStatus.level === 'critical' ? '#EF4444' : diskStatus.level === 'warning' ? '#F59E0B' : '#22C55E',
            fontWeight:700, fontSize:12, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
            {diskStatus.level === 'critical' ? 'Espace disque CRITIQUE' : diskStatus.level === 'warning' ? 'Alerte espace disque' : 'Espace disque'}
            <span style={{ fontWeight:400, fontSize:11, color:T.textMuted }}>— Serveur ({diskStatus.maxDiskGB} Go total)</span>
          </div>
          <div style={{ background:T.surface3, borderRadius:99, height:10, overflow:'hidden', marginBottom:8 }}>
            <div style={{ width:`${Math.min(diskStatus.diskUsedPct,100)}%`, height:'100%', borderRadius:99, transition:'width .3s',
              background: diskStatus.diskUsedPct >= 95 ? '#EF4444' : diskStatus.diskUsedPct >= 90 ? '#F59E0B' : '#22C55E' }}/>
          </div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:11, color:T.textMuted }}>
            <span>Utilisé : <strong style={{color:T.text}}>{diskStatus.diskUsedPct}%</strong></span>
            <span>Fichiers uploads : <strong style={{color:T.text}}>{(diskStatus.uploadsDirBytes/1024/1024/1024).toFixed(2)} Go</strong></span>
            <span>Dossiers SI : <strong style={{color:T.text}}>{(diskStatus.dossiersDirBytes/1024/1024/1024).toFixed(2)} Go</strong></span>
            <span>Base SQLite : <strong style={{color:T.text}}>{(diskStatus.dbFileBytes/1024/1024).toFixed(1)} Mo</strong></span>
          </div>
          {diskStatus.level !== 'ok' && (
            <div style={{ marginTop:8, fontSize:11, color: diskStatus.level === 'critical' ? '#EF4444' : '#F59E0B', fontWeight:600 }}>
              Pensez à sauvegarder vers un disque externe ou exporter en ZIP via les boutons ci-dessous.
            </div>
          )}
        </div>
      )}

      {/* Export ZIP */}
      <div style={{ background:T.surface2, border:'1px solid #06B6D433', borderRadius:12, padding:14, marginBottom:12 }}>
        <div style={{ color:'#06B6D4', fontWeight:700, fontSize:12, marginBottom:8 }}>Export ZIP avec arborescence</div>
        <div style={{ color:T.textMuted, fontSize:10, marginBottom:10 }}>
          Chaque dossier SI exporté contient : README.md (métadonnées), metadata.json et tous ses fichiers attachés.
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={async () => {
            const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
            const st = dsGetSyncStatus();
            window.open(`${st.proxyUrl || 'http://localhost:3001'}/api/export/all/zip?token=${tok}`, '_blank');
            addLog('Export ZIP global lancé', 'success');
          }} style={{ background:'#06B6D422', border:'1px solid #06B6D444', color:'#06B6D4', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontWeight:700, fontSize:11 }}>
            Exporter tout en ZIP (dossiers + fichiers + backup JSON)
          </button>
        </div>
        <div style={{ color:T.textMuted, fontSize:10, marginTop:8 }}>
          L'export global inclut : tous les dossiers SI avec leurs fichiers, la base SQLite en JSON, l'arborescence physique des dossiers.
          Niveau 4+ requis.
        </div>
      </div>

      {/* ── Actions globales ─────────────────────────────────────────── */}
      <div style={{ marginBottom:14 }}>
        <div style={{ color:T.textMuted, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Actions globales</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
          <button disabled={!!loading} onClick={fetchServerInfo}
            style={{ background:'#3B82F622', border:'1px solid #3B82F644', color:'#3B82F6', borderRadius:8, padding:'8px 10px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
            {loading==='server' ? '⏳...' : '🔍 Vérifier statut serveur'}
          </button>
          <button disabled={!!loading} onClick={fetchKeyCounts}
            style={{ background:'#F59E0B22', border:'1px solid #F59E0B44', color:'#F59E0B', borderRadius:8, padding:'8px 10px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
            {loading==='keys' ? '⏳ Analyse...' : '📊 Comparer local ↔ serveur'}
          </button>
        </div>

        {/* 3 modes de conformité */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
          <div style={{ background:'#06B6D410', border:'1px solid #06B6D440', borderRadius:10, padding:10, textAlign:'center' }}>
            <div style={{ color:'#06B6D4', fontWeight:800, fontSize:12, marginBottom:4 }}>↓ Serveur → Ce poste</div>
            <div style={{ color:T.textMuted, fontSize:10, marginBottom:8 }}>Ce poste prend les données du serveur. Utiliser après un resync admin.</div>
            <button disabled={!!loading} onClick={handlePullAllFromServer}
              style={{ width:'100%', background:'#06B6D422', border:'1px solid #06B6D466', color:'#06B6D4', borderRadius:7, padding:'7px 6px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
              {loading==='pull-all' ? '⏳...' : '↓ Appliquer serveur ici'}
            </button>
          </div>
          <div style={{ background:'#EC489910', border:'2px solid #EC489940', borderRadius:10, padding:10, textAlign:'center' }}>
            <div style={{ color:'#EC4899', fontWeight:800, fontSize:12, marginBottom:4 }}>↑ Ce poste → Serveur</div>
            <div style={{ color:T.textMuted, fontSize:10, marginBottom:8 }}>Envoyer les données locales au serveur (fusion — ne supprime rien).</div>
            <button disabled={!!loading} onClick={handlePushLocal}
              style={{ width:'100%', background:'#EC489922', border:'1px solid #EC489966', color:'#EC4899', borderRadius:7, padding:'7px 6px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
              {loading==='push' ? '⏳...' : '↑ Envoyer local au serveur'}
            </button>
          </div>
          <div style={{ background:'#F59E0B10', border:'2px solid #F59E0B50', borderRadius:10, padding:10, textAlign:'center' }}>
            <div style={{ color:'#F59E0B', fontWeight:800, fontSize:12, marginBottom:4 }}>⇄ Tous les postes</div>
            <div style={{ color:T.textMuted, fontSize:10, marginBottom:8 }}>Collecte tous les postes, fusionne, redistribue. Recommandé pour récupérer des données.</div>
            <button disabled={!!loading} onClick={handleCollectAll}
              style={{ width:'100%', background:'#F59E0B22', border:'2px solid #F59E0B88', color:'#F59E0B', borderRadius:7, padding:'7px 6px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
              {loading==='collect-all' ? '⏳...' : '⇄ Collecter & Agréger'}
            </button>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button disabled={!!loading} onClick={handleForceResync}
            style={{ background:'#22C55E22', border:'1px solid #22C55E44', color:'#22C55E', borderRadius:8, padding:'8px 10px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
            {loading==='resync' ? '⏳ Resync...' : '🔄 Resync ce poste (serveur → ici)'}
          </button>
          <button disabled={!!loading} onClick={handleResyncAll}
            style={{ background:'#6366F122', border:'1px solid #6366F144', color:'#6366F1', borderRadius:8, padding:'8px 10px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
            {loading==='resync-all' ? '⏳ Envoi...' : '📡 Resync tous les postes (serveur → tous)'}
          </button>
          <button disabled={!!loading} onClick={handleSyncIdbFiles}
            style={{ background:'#8B5CF622', border:'1px solid #8B5CF644', color:'#8B5CF6', borderRadius:8, padding:'8px 10px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
            {loading==='idb' ? '⏳ Sync...' : '📁 Sync fichiers hors ligne (IDB)'}
          </button>
          <button disabled={!!loading} onClick={async () => {
            if (!await _dlg.confirm('Reconstruire l\'index fichiers depuis la base serveur ?\n\nUtile si des fichiers sont présents sur le serveur mais ne s\'affichent pas chez certains utilisateurs. L\'opération sera broadcastée à tous les postes.', 'Rebuild index fichiers', null, false)) return;
            setLoading('rebuild-kv');
            addLog('Reconstruction index gc-dossier-files...', 'info');
            try {
              const tok = _lsGet('gc-jwt-token') || _lsGet('authToken') || _lsGet('token') || '';
              const proxyUrl = status?.proxyUrl || 'http://localhost:3001';
              const r = await fetch(`${proxyUrl}/api/files/rebuild-kv`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                signal: AbortSignal.timeout(30000),
              });
              if (r.ok) {
                const data = await r.json();
                addLog(`✅ Index fichiers reconstruit : ${data.count} fichiers indexés — broadcast envoyé à tous les postes`, 'success');
                playSound('success');
                gcToast.success(`${data.count} fichiers réindexés — les fichiers seront à nouveau visibles partout`);
              } else {
                const err = await r.json().catch(() => ({}));
                addLog(`Erreur rebuild : ${err.error || r.status}`, 'error');
              }
            } catch (e) { addLog(`Erreur : ${e.message}`, 'error'); }
            setLoading('');
          }}
            style={{ background:'#C41E3A22', border:'1px solid #C41E3A44', color:'#C41E3A', borderRadius:8, padding:'8px 10px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
            {loading==='rebuild-kv' ? '⏳ Rebuild...' : '🗂️ Réparer index fichiers (tous postes)'}
          </button>
        </div>
      </div>

      {/* ── Comparaison clé par clé avec actions ──────────────────── */}
      {keyCounts && (
        <div style={{ background:T.surface2, border:'1px solid #F59E0B33', borderRadius:12, padding:14, marginBottom:12, maxHeight:320, overflowY:'auto' }}>
          <div style={{ color:'#F59E0B', fontWeight:700, fontSize:12, marginBottom:8 }}>
            Détail clé par clé — local ↔ serveur
            <span style={{ color:T.textMuted, fontWeight:400, fontSize:10, marginLeft:8 }}>
              (⚠ = écart, ↓ = prendre serveur, ↑ = envoyer local)
            </span>
          </div>
          {Object.entries(keyCounts).slice(0,60).map(([k, info]) => {
            const localRaw = _lsGet(k);
            let localCount = 0;
            try { const lv = JSON.parse(localRaw); localCount = Array.isArray(lv) ? lv.length : (lv ? 1 : 0); } catch {}
            const diff = info.count - localCount;
            const hasDiff = Math.abs(diff) > 0;
            return (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'4px 6px', borderRadius:5, marginBottom:3,
                background: hasDiff ? (diff > 0 ? '#06B6D410' : '#EC489910') : 'transparent',
                border: hasDiff ? `1px solid ${diff > 0 ? '#06B6D430' : '#EC489930'}` : '1px solid transparent' }}>
                <span style={{ color:T.text, fontSize:10, fontFamily:'monospace', flex:1 }}>{hasDiff ? '⚠ ' : '✓ '}{k}</span>
                <span style={{ fontSize:10, color: hasDiff ? (diff > 0 ? '#06B6D4' : '#EC4899') : T.textMuted, fontWeight: hasDiff ? 700 : 400, minWidth:90, textAlign:'center' }}>
                  local:{localCount} / srv:{info.count}
                  {hasDiff ? ` (${diff > 0 ? '+' : ''}${diff} srv)` : ''}
                </span>
                {hasDiff && (
                  <div style={{ display:'flex', gap:4, marginLeft:6 }}>
                    <button onClick={() => handlePullKey(k)} title="Prendre données du serveur → ce poste"
                      style={{ background:'#06B6D422', border:'1px solid #06B6D466', color:'#06B6D4', borderRadius:5, padding:'2px 7px', cursor:'pointer', fontSize:10, fontWeight:700 }}>↓ Srv</button>
                    <button onClick={() => handlePushKey(k)} title="Envoyer données locales → serveur"
                      style={{ background:'#EC489922', border:'1px solid #EC489966', color:'#EC4899', borderRadius:5, padding:'2px 7px', cursor:'pointer', fontSize:10, fontWeight:700 }}>↑ Loc</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Réinitialisation tombstones — zone danger */}
      <div style={{ background:'#EF444408', border:'1px solid #EF444430', borderRadius:10, padding:12, marginBottom:12 }}>
        <div style={{ color:'#EF4444', fontWeight:700, fontSize:11, marginBottom:6 }}>Zone correction d'urgence</div>
        <button disabled={!!loading} onClick={handleClearTombstones}
          style={{ background:'#EF444415', border:'1px solid #EF444440', color:'#EF4444', borderRadius:8, padding:'7px 14px', cursor:loading?'not-allowed':'pointer', fontWeight:700, fontSize:11 }}>
          Réinitialiser les tombstones (récupération éléments supprimés)
        </button>
        <div style={{ color:T.textMuted, fontSize:10, marginTop:6 }}>
          Attention : efface la liste des suppressions intentionnelles. À utiliser uniquement pour récupérer des données supprimées par erreur.
        </div>
      </div>

      {/* Journal des opérations */}
      {log.length > 0 && (
        <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:12 }}>
          <div style={{ color:T.text, fontWeight:700, fontSize:11, marginBottom:8 }}>Journal</div>
          {log.map(entry => (
            <div key={entry.id} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:4 }}>
              <span style={{ color:T.textMuted, fontSize:10, minWidth:50 }}>{entry.at}</span>
              <span style={{ color:logColors[entry.type]||T.text, fontSize:11 }}>{entry.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
