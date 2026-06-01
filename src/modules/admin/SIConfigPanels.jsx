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
import { gcToast } from '../../components/ToastManager.jsx';
import { GC_FISCAL_CONFIG_DEFAULT } from '../../core/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers backup internes
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_BACKUP_KEY = 'gc-auto-backup-latest';

export const gcBuildBackupPayload = (data) => ({
  version: 'GC_SI_v57',
  exportedAt: new Date().toISOString(),
  exportedBy: data.userName || 'Admin',
  meta: {
    users:    data.users?.length    || 0,
    dossiers: data.dossiers?.length || 0,
    taches:   data.taches?.length   || 0,
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
    // siAppearance intentionnellement absent (logos base64 → fichier énorme)
  },
});

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
    setImportMsg('⏳ Synchronisation comptes serveur...');
    try { await gcSyncAuthUsers(); } catch (_) {}
  };

  const handleExport = () => {
    const meta = gcExportFullBackup({ userName: currentUser?.name||'Admin', users, dossiers, taches, rdvs, partners, pendingApprovals,
      journal: (() => { try { return JSON.parse(_lsGet('gc-journal')||'[]'); } catch(_){return[];} })(), sessionLogs, siAppearance });
    gcAlert(`✅ Export réussi !\n${meta.users} utilisateurs · ${meta.dossiers} dossiers · ${meta.taches} tâches`);
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
          setImportMsg(`✅ Import réussi ! ${d.users?.length||0} util. · ${d.dossiers?.length||0} dossiers · ${d.taches?.length||0} tâches. Rechargez.`);
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
    gcAlert(`✅ Snapshot local enregistré.\n${meta.users} util. · ${meta.dossiers} dossiers · ${meta.taches} tâches`);
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

      <div style={{ background:T.surface2, border:'1px solid #F59E0B33', borderRadius:12, padding:14 }}>
        <div style={{ color:'#F59E0B', fontWeight:700, fontSize:13, marginBottom:8 }}>📥 Importer une sauvegarde</div>
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
