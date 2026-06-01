// CabinetInfoConfig.jsx — Configuration des informations du cabinet pour les impressions
// SI Génie Consultant v10.5

import React, { useState } from 'react';
import { useDialog } from '../../components/Dialog.jsx';
import { _lsGet, _lsSet, _noop , dsSave } from '../../core/index.js';
import { gcToast } from '../../components/ToastManager.jsx';
import { Btn, InputField } from '../../components/UI.jsx';

export function CabinetInfoConfig({ T, currentUser, addSessionLog }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  // Informations par défaut du cabinet
  const defaultCabinetInfo = {
    nom: "GÉNIE CONSULTANT",
    description: "Cabinet Juridique, d'Affaires & de Conseil",
    adresse: "Libreville, Gabon",
    telephone: "+241 XX XX XX XX",
    email: "contact@genie-consultant.ga",
    siteWeb: "www.genie-consultant.ga",
    rccm: "[Numéro RCCM]",
    nif: "[Numéro NIF]"
  };

  const [cabinetInfo, setCabinetInfo] = useState(() => {
    try {
      const saved = _lsGet("gc-cabinet-info");
      return saved ? JSON.parse(saved) : defaultCabinetInfo;
    } catch (_) {
      return defaultCabinetInfo;
    }
  });

  const [saved, setSaved] = useState(false);

  const saveCabinetInfo = () => {
    try {
      _lsSet("gc-cabinet-info", JSON.stringify(cabinetInfo)); dsSave("gc-cabinet-info", cabinetInfo).catch(err => gcToast.syncError("gc-cabinet-info", err));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      addSessionLog && addSessionLog("MODIFICATION", currentUser, {
        status: "SUCCESS",
        reason: "Configuration informations cabinet mise à jour"
      });
    } catch (error) {
      gcAlert("Erreur lors de la sauvegarde des informations du cabinet.");
    }
  };

  const resetToDefault = async () => {
    if (!await gcConfirm("Réinitialiser toutes les informations du cabinet aux valeurs par défaut ?")) return;
    setCabinetInfo(defaultCabinetInfo);
    addSessionLog && addSessionLog("MODIFICATION", currentUser, {
      status: "SUCCESS",
      reason: "Informations cabinet réinitialisées aux valeurs par défaut"
    });
  };

  const updateField = (field, value) => {
    setCabinetInfo(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="gc-fade-in">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#C41E3A,#8B1538)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏛️</div>
          <div>
            <h3 style={{ color: T.text, margin: 0, fontSize: 15, fontWeight: 800 }}>Configuration Cabinet</h3>
            <div style={{ color: T.textMuted, fontSize: 11 }}>Informations du cabinet affichées sur les documents imprimés</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={resetToDefault}>🔄 Réinitialiser</Btn>
          <Btn variant="primary" size="sm" onClick={saveCabinetInfo}>
            💾 Sauvegarder {saved && "✓"}
          </Btn>
        </div>
      </div>

      {/* Aperçu */}
      <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h4 style={{ color: T.text, margin: "0 0 15px 0", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          👁️ Aperçu (tel qu'affiché sur les impressions)
        </h4>
        <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", padding: 15, borderRadius: 5, fontSize: 11, color: "#666" }}>
          <h4 style={{ margin: "0 0 10px 0", color: "#C41E3A", fontSize: 14 }}>{cabinetInfo.nom}</h4>
          <p><strong>{cabinetInfo.description}</strong></p>
          <p>📍 {cabinetInfo.adresse}</p>
          <p>📞 Téléphone: {cabinetInfo.telephone}</p>
          <p>📧 Email: {cabinetInfo.email}</p>
          <p>🌐 Site web: {cabinetInfo.siteWeb}</p>
          <p>📋 RCCM: {cabinetInfo.rccm} | NIF: {cabinetInfo.nif}</p>
        </div>
      </div>

      {/* Formulaire de configuration */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ color: T.text, margin: "0 0 15px 0", fontSize: 14, fontWeight: 700 }}>Informations Générales</h4>

          <InputField
            label="Nom du Cabinet"
            value={cabinetInfo.nom}
            onChange={e => updateField("nom", e.target.value)}
            placeholder="Ex: GÉNIE CONSULTANT"
            T={T}
            required
          />

          <InputField
            label="Description"
            value={cabinetInfo.description}
            onChange={e => updateField("description", e.target.value)}
            placeholder="Ex: Cabinet Juridique, d'Affaires & de Conseil"
            T={T}
          />

          <InputField
            label="Adresse"
            value={cabinetInfo.adresse}
            onChange={e => updateField("adresse", e.target.value)}
            placeholder="Ex: Libreville, Gabon"
            T={T}
          />
        </div>

        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ color: T.text, margin: "0 0 15px 0", fontSize: 14, fontWeight: 700 }}>Coordonnées</h4>

          <InputField
            label="Téléphone"
            value={cabinetInfo.telephone}
            onChange={e => updateField("telephone", e.target.value)}
            placeholder="Ex: +241 XX XX XX XX"
            T={T}
          />

          <InputField
            label="Email"
            type="email"
            value={cabinetInfo.email}
            onChange={e => updateField("email", e.target.value)}
            placeholder="Ex: contact@genie-consultant.ga"
            T={T}
          />

          <InputField
            label="Site Web"
            value={cabinetInfo.siteWeb}
            onChange={e => updateField("siteWeb", e.target.value)}
            placeholder="Ex: www.genie-consultant.ga"
            T={T}
          />
        </div>

        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ color: T.text, margin: "0 0 15px 0", fontSize: 14, fontWeight: 700 }}>Informations Juridiques</h4>

          <InputField
            label="RCCM"
            value={cabinetInfo.rccm}
            onChange={e => updateField("rccm", e.target.value)}
            placeholder="Ex: RCCM LBV 2020 B 12345"
            T={T}
          />

          <InputField
            label="NIF"
            value={cabinetInfo.nif}
            onChange={e => updateField("nif", e.target.value)}
            placeholder="Ex: 123456789"
            T={T}
          />
        </div>
      </div>

      {/* Note d'information */}
      <div style={{ background: "#C41E3A08", border: "1px solid #C41E3A22", borderRadius: 8, padding: 15, marginTop: 20 }}>
        <div style={{ color: "#C41E3A", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>ℹ️ Information</div>
        <div style={{ color: T.textMuted, fontSize: 11 }}>
          Ces informations seront automatiquement affichées en bas de tous les documents imprimés depuis le SI.
          Elles permettent d'identifier formellement le cabinet sur les rapports, factures et autres documents officiels.
        </div>
      </div>
    </div>
  );
};