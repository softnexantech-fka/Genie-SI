import React, { useState } from 'react';
import { _lsGet, _lsSet, _noop, playSound, gcPushNotif } from '../../core/index.js';
import { Btn, InputField } from '../../components/UI.jsx';

export function BudgetRapideApp({ T = {}, currentUser = {}, setNotifications = _noop }) {
  const [montantHT, setMontantHT] = useState(0);
  const [tauxTVA, setTauxTVA] = useState(18);
  const [resultat, setResultat] = useState(null);

  const calculate = () => {
    const ht = parseFloat(montantHT) || 0;
    const taux = parseFloat(tauxTVA) || 0;
    const tva = Number((ht * taux / 100).toFixed(2));
    const ttc = Number((ht + tva).toFixed(2));
    const payload = { ht, taux, tva, ttc, updatedAt: new Date().toISOString() };
    try { _lsSet('gc-budget-rapide', JSON.stringify(payload)); } catch (_) {}
    setResultat(payload);
    setNotifications(p => [{ id: `N${Date.now()}`, icon: '💰', message: `Budget rapide : ${ttc} FCFA (${tva} TVA)`, at: new Date().toISOString(), read: false }, ...p]);
    if (currentUser?.id) { gcPushNotif(currentUser.id, { id: `N${Date.now()}`, icon: '💰', message: `Budget rapide calculé ${ttc} FCFA`, at: new Date().toISOString(), read: false, module: 'bureautique' }); }
    try { playSound('success'); } catch (_) {}
  };

  const loadLast = () => {
    try {
      const raw = _lsGet('gc-budget-rapide');
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p?.ht != null) setMontantHT(p.ht);
      if (p?.taux != null) setTauxTVA(p.taux);
      setResultat(p);
    } catch (_) {}
  };

  React.useEffect(() => { loadLast(); }, []);

  return (
    <div style={{ minWidth: 360, maxWidth: 500, color: T.text || '#111' }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Budget Rapide</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <InputField
          label="Montant HT"
          value={montantHT}
          onChange={e => setMontantHT(e.target.value)}
          type="number"
          T={T}
          style={{ width: '100%' }}
        />
        <InputField
          label="TVA %"
          value={tauxTVA}
          onChange={e => setTauxTVA(e.target.value)}
          type="number"
          T={T}
          style={{ width: '100%' }}
        />
      </div>
      <Btn variant="primary" size="sm" onClick={calculate} style={{ width: '100%' }}>
        Calculer
      </Btn>
      {resultat && (
        <div style={{ marginTop: 12, background: T.surface2 || '#f7f7f7', border: `1px solid ${T.border || '#ddd'}`, borderRadius: 8, padding: 8, fontSize: 12 }}>
          <div>HT: {Number(resultat.ht).toLocaleString('fr-FR')} FCFA</div>
          <div>TVA: {Number(resultat.tva).toLocaleString('fr-FR')} FCFA</div>
          <div>TTC: {Number(resultat.ttc).toLocaleString('fr-FR')} FCFA</div>
        </div>
      )}
    </div>
  );
}
