// KYCWorkflowModule.jsx — Gestion des workflows KYC pour Conformité
import React, { useState, useEffect } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { _lsGet, _lsSet, _noop, gcPushNotif, playSound, dsSave, dsLoad, getProxyUrl } from '../../core/index.js';
import { Btn, Modal, InputField, SelectField, Tabs } from '../../components/UI.jsx';

/**
 * Hook pour soumettre un dossier à la conformité
 * @param {Object} options - Configuration
 * @returns {Function} - submitKYC(clientId, clientName, dossierType, kycDocuments)
 */
export function useKYCSubmit() {
  const _dlg = useDialog();

  return async (clientId, clientName, dossierType, kycDocuments, submittedBy, processus = 'O01') => {
    try {
      const token = _lsGet('auth-token');
      if (!token) {
        _dlg.alert('Vous devez être connecté pour soumettre un dossier KYC', 'Authentification requise', '🔐');
        return { ok: false, error: 'Pas d\'authentification' };
      }

      const response = await fetch(`${getProxyUrl()}/api/kyc/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientId,
          clientName,
          dossierType,
          kycDocuments: kycDocuments || [],
          submittedBy,
          processus,
          dossierInfo: {
            submittedAt: new Date().toISOString(),
            source: 'GestionDocsUnifiee',
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        _dlg.alert(error.error || 'Erreur lors de la soumission', 'Erreur', '❌');
        return { ok: false, error: error.error };
      }

      const data = await response.json();
      
      // Rafraîchir les données en cache
      await dsSave('gc-kyc-workflows', await dsLoad('gc-kyc-workflows') || []);
      
      gcPushNotif('✅ Dossier KYC transmis avec succès à la Conformité', 'notification');
      playSound('success');
      
      return data;
    } catch (e) {
      console.error('[KYC][SUBMIT]', e);
      _dlg.alert(e.message || 'Erreur réseau', 'Erreur', '❌');
      return { ok: false, error: e.message };
    }
  };
}

/**
 * Dialog de confirmation avant soumission KYC
 */
export function KYCSubmitDialog({
  T, clientName, kycDocuments = [],
  onConfirm = _noop, onCancel = _noop,
  isOpen = false, kycStatut = 'EN_ATTENTE',
}) {
  const _dlg = useDialog();

  if (!isOpen) return null;

  const missingDocs = kycDocuments.filter(d => d.required && !d.uploaded);
  const hasMissingRequired = missingDocs.length > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000A', zIndex: 7000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '22px 26px', width: 500, maxWidth: '95vw', boxShadow: '0 24px 80px #0009' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,#3B82F6,#2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
            📋
          </div>
          <div>
            <div style={{ color: T.text, fontWeight: 900, fontSize: 15 }}>Transmettre à la Conformité</div>
            <div style={{ color: T.textMuted, fontSize: 10 }}>Dossier KYC — {clientName}</div>
          </div>
          <button onClick={onCancel} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ color: T.text, fontWeight: 700, fontSize: 11, marginBottom: 8 }}>📄 Vérification des documents</div>
          
          {hasMissingRequired && (
            <div style={{ background: '#EF444415', border: '1px solid #EF444433', borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div style={{ color: '#EF4444', fontWeight: 700, fontSize: 11, marginBottom: 4 }}>⚠️ Documents requis manquants</div>
              {missingDocs.map(d => (
                <div key={d.id} style={{ color: '#EF4444', fontSize: 10, marginTop: 2 }}>
                  • {d.label || d.id}
                </div>
              ))}
              <div style={{ color: '#EF4444', fontSize: 9, fontStyle: 'italic', marginTop: 6 }}>
                Veuillez télécharger les documents requis avant de soumettre.
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <div style={{ color: T.textMuted, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>Documents à transmettre ({kycDocuments.length}):</div>
            {kycDocuments.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', color: d.uploaded ? '#22C55E' : T.textMuted, fontSize: 10 }}>
                <span style={{ fontSize: 11 }}>{d.uploaded ? '✅' : '❌'}</span>
                <span>{d.label || d.id}</span>
                {d.required && <span style={{ color: '#EF4444', fontWeight: 700 }}>*</span>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ color: T.text, fontWeight: 700, fontSize: 11, marginBottom: 4 }}>🔍 Délai de traitement</div>
          <div style={{ color: T.textMuted, fontSize: 10 }}>
            <div>• Réception dossier : J+0</div>
            <div>• Vérification documents : J+1</div>
            <div>• Évaluation conformité : J+2</div>
            <div>• Validation KYC : J+3</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onConfirm}
            disabled={hasMissingRequired}
            style={{
              flex: 1,
              background: hasMissingRequired ? T.surface3 : '#3B82F6',
              border: 'none',
              color: hasMissingRequired ? T.textMuted : '#fff',
              borderRadius: 8,
              padding: '10px',
              cursor: hasMissingRequired ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 13,
              opacity: hasMissingRequired ? 0.5 : 1,
            }}
          >
            📤 Transmettre à la Conformité
          </button>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: `1px solid ${T.border}`,
              color: T.textMuted,
              borderRadius: 8,
              padding: '10px 14px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Composant KYC Workflows Panel pour ConformiteApp
 */
export function KYCWorkflowsPanel({
  T, currentUser, kycWorkflows = [],
  setKycWorkflows = _noop,
  users = [],
  canManageKYC = false,
}) {
  const _dlg = useDialog();
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [workflowTab, setWorkflowTab] = useState('nouveau');
  const [filterStatut, setFilterStatut] = useState('SOUMIS');
  const [evaluationForm, setEvaluationForm] = useState({
    validationStatus: 'VALIDE',
    notes: '',
    supplementaryInfo: '',
  });

  const handleAssign = async (workflowId, assigneeId) => {
    try {
      const token = _lsGet('auth-token');
      const response = await fetch(`${getProxyUrl()}/api/kyc/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ workflowId, assigneeId, assigneeName: users.find(u => u.id === assigneeId)?.name }),
      });

      if (!response.ok) throw new Error('Erreur assignation');
      const data = await response.json();
      
      setKycWorkflows(prev =>
        prev.map(wf => wf.id === workflowId ? data.workflow : wf)
      );
      
      gcPushNotif('✅ Workflow assigné avec succès', 'notification');
    } catch (e) {
      _dlg.alert(e.message, 'Erreur', '❌');
    }
  };

  const handleEvaluate = async (workflowId) => {
    try {
      const token = _lsGet('auth-token');
      const response = await fetch(`${getProxyUrl()}/api/kyc/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          workflowId,
          validationStatus: evaluationForm.validationStatus,
          notes: evaluationForm.notes,
          supplementaryInfo: evaluationForm.supplementaryInfo,
        }),
      });

      if (!response.ok) throw new Error('Erreur évaluation');
      const data = await response.json();
      
      setKycWorkflows(prev =>
        prev.map(wf => wf.id === workflowId ? data.workflow : wf)
      );
      
      setSelectedWorkflow(null);
      setEvaluationForm({ validationStatus: 'VALIDE', notes: '', supplementaryInfo: '' });
      gcPushNotif(`✅ Dossier KYC ${evaluationForm.validationStatus}`, 'notification');
    } catch (e) {
      _dlg.alert(e.message, 'Erreur', '❌');
    }
  };

  const filteredWorkflows = kycWorkflows.filter(wf => wf.statut === filterStatut);
  const newWorkflows = kycWorkflows.filter(wf => wf.statut === 'SOUMIS');
  const inEvaluation = kycWorkflows.filter(wf => wf.statut === 'EN_EVALUATION');
  const completed = kycWorkflows.filter(wf => ['VALIDE', 'REJETE'].includes(wf.statut));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { k: 'SOUMIS', l: '📨 Nouveaux', count: newWorkflows.length },
          { k: 'EN_EVALUATION', l: '⚙️ En évaluation', count: inEvaluation.length },
          { k: 'VALIDE', l: '✅ Validés', count: completed.filter(w => w.statut === 'VALIDE').length },
          { k: 'REJETE', l: '❌ Rejetés', count: completed.filter(w => w.statut === 'REJETE').length },
        ].map(tab => (
          <button
            key={tab.k}
            onClick={() => setFilterStatut(tab.k)}
            style={{
              background: filterStatut === tab.k ? '#3B82F622' : 'transparent',
              border: `1px solid ${filterStatut === tab.k ? '#3B82F6' : T.border}`,
              color: filterStatut === tab.k ? '#3B82F6' : T.textMuted,
              borderRadius: 8,
              padding: '7px 14px',
              cursor: 'pointer',
              fontWeight: filterStatut === tab.k ? 700 : 400,
              fontSize: 11,
            }}
          >
            {tab.l} ({tab.count})
          </button>
        ))}
      </div>

      {selectedWorkflow ? (
        <div>
          <button
            onClick={() => setSelectedWorkflow(null)}
            style={{
              background: 'transparent',
              border: `1px solid ${T.border}`,
              color: T.textMuted,
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 11,
              marginBottom: 12,
            }}
          >
            ← Retour à la liste
          </button>

          <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ color: T.text, fontWeight: 900, fontSize: 16 }}>{selectedWorkflow.clientName}</div>
                <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>
                  {selectedWorkflow.dossierType} · {selectedWorkflow.processus}
                </div>
              </div>
              <div style={{
                display: 'inline-block',
                background: selectedWorkflow.statut === 'VALIDE' ? '#22C55E22' : selectedWorkflow.statut === 'REJETE' ? '#EF444422' : '#F59E0B22',
                color: selectedWorkflow.statut === 'VALIDE' ? '#22C55E' : selectedWorkflow.statut === 'REJETE' ? '#EF4444' : '#F59E0B',
                borderRadius: 6,
                padding: '4px 10px',
                fontWeight: 700,
                fontSize: 11,
              }}>
                {selectedWorkflow.statut}
              </div>
            </div>

            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ color: T.text, fontWeight: 700, fontSize: 11, marginBottom: 8 }}>📄 Documents soumis</div>
              {selectedWorkflow.kycDocuments?.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 10 }}>
                  <span>✓</span>
                  <span style={{ flex: 1 }}>{d.label || d.id}</span>
                  <span style={{ color: T.textMuted, fontSize: 9 }}>{d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString('fr-FR') : '—'}</span>
                </div>
              ))}
            </div>

            {canManageKYC && selectedWorkflow.statut !== 'VALIDE' && selectedWorkflow.statut !== 'REJETE' && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ color: T.text, fontWeight: 700, fontSize: 11, marginBottom: 10 }}>🔍 Évaluation KYC</div>

                {selectedWorkflow.statut === 'SOUMIS' && !selectedWorkflow.assignedTo && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ color: T.textMuted, fontSize: 9, fontWeight: 700, display: 'block', marginBottom: 4 }}>ASSIGNER À</label>
                    <select
                      onChange={e => handleAssign(selectedWorkflow.id, e.target.value)}
                      defaultValue=""
                      style={{
                        width: '100%',
                        background: T.surface2,
                        border: `1px solid ${T.border}`,
                        borderRadius: 6,
                        padding: '7px 10px',
                        color: T.text,
                        fontSize: 11,
                      }}
                    >
                      <option value="">— Sélectionner évaluateur —</option>
                      {users
                        .filter(u => u.level >= 4 && (u.process === 'P02' || u.process === 'P03'))
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.process})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div style={{ marginBottom: 10 }}>
                  <label style={{ color: T.textMuted, fontSize: 9, fontWeight: 700, display: 'block', marginBottom: 4 }}>STATUT VALIDATION</label>
                  <select
                    value={evaluationForm.validationStatus}
                    onChange={e => setEvaluationForm(f => ({ ...f, validationStatus: e.target.value }))}
                    style={{
                      width: '100%',
                      background: T.surface2,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: '7px 10px',
                      color: T.text,
                      fontSize: 11,
                    }}
                  >
                    <option value="VALIDE">✅ Validé</option>
                    <option value="REJETE">❌ Rejeté</option>
                    <option value="BESOIN_INFO">❓ Besoin d'informations</option>
                  </select>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ color: T.textMuted, fontSize: 9, fontWeight: 700, display: 'block', marginBottom: 4 }}>NOTES</label>
                  <textarea
                    value={evaluationForm.notes}
                    onChange={e => setEvaluationForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Observations, raisons du rejet, demandes d'info..."
                    rows={3}
                    style={{
                      width: '100%',
                      background: T.surface2,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: '7px 10px',
                      color: T.text,
                      fontSize: 11,
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button
                  onClick={() => handleEvaluate(selectedWorkflow.id)}
                  style={{
                    width: '100%',
                    background: evaluationForm.validationStatus === 'VALIDE' ? '#22C55E' : '#EF4444',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  {evaluationForm.validationStatus === 'VALIDE' ? '✅ Valider le dossier' : evaluationForm.validationStatus === 'REJETE' ? '❌ Rejeter le dossier' : '❓ Demander informations'}
                </button>
              </div>
            )}

            {selectedWorkflow.evaluationNotes && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginTop: 12 }}>
                <div style={{ color: T.text, fontWeight: 700, fontSize: 11, marginBottom: 6 }}>📝 Évaluation</div>
                <div style={{ color: T.textMuted, fontSize: 10, marginBottom: 6 }}>
                  Par: {users.find(u => u.id === selectedWorkflow.evaluatedBy)?.name || '—'} · {new Date(selectedWorkflow.evaluationDate).toLocaleDateString('fr-FR')}
                </div>
                <div style={{ color: T.text, fontSize: 10, whiteSpace: 'pre-wrap' }}>{selectedWorkflow.evaluationNotes}</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          {filteredWorkflows.length === 0 ? (
            <div style={{ color: T.textMuted, textAlign: 'center', padding: 32, fontSize: 12 }}>
              {filterStatut === 'SOUMIS' ? '📭 Aucun nouveau dossier en attente' : `aucun dossier ${filterStatut.toLowerCase()}`}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
              {filteredWorkflows.map(wf => (
                <div
                  key={wf.id}
                  onClick={() => setSelectedWorkflow(wf)}
                  style={{
                    background: T.surface2,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    padding: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontWeight: 700, fontSize: 12 }}>{wf.clientName}</div>
                      <div style={{ color: T.textMuted, fontSize: 9, marginTop: 2 }}>{wf.dossierType}</div>
                    </div>
                    <div
                      style={{
                        display: 'inline-block',
                        background: wf.statut === 'SOUMIS' ? '#3B82F622' : wf.statut === 'EN_EVALUATION' ? '#F59E0B22' : '#22C55E22',
                        color: wf.statut === 'SOUMIS' ? '#3B82F6' : wf.statut === 'EN_EVALUATION' ? '#F59E0B' : '#22C55E',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontWeight: 700,
                        fontSize: 9,
                      }}
                    >
                      {wf.statut}
                    </div>
                  </div>
                  <div style={{ color: T.textMuted, fontSize: 9, marginBottom: 8 }}>
                    {new Date(wf.createdAt).toLocaleDateString('fr-FR')} · {wf.assignedTo ? `Assigné à ${wf.assigneeName}` : 'Non assigné'}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setSelectedWorkflow(wf); }}
                    style={{
                      background: '#3B82F6',
                      border: 'none',
                      color: '#fff',
                      borderRadius: 6,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: 10,
                      marginTop: 'auto',
                    }}
                  >
                    Voir détails →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
