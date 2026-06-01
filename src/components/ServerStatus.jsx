import React, { useState, useEffect } from 'react';
import { dsProxyAvailable } from '../core/index.js';

// ============================================================
// ServerStatus.jsx — Indicateur de connexion serveur partagé
// Affiché dans la barre de navigation du SI
// ============================================================

export function ServerStatus({ T }) {
  const [status, setStatus] = useState(null); // null=checking, true=online, false=offline
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      const online = await dsProxyAvailable();
      setStatus(online);
    } catch {
      setStatus(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    check();
    const interval = setInterval(check, 300_000); // Vérifier toutes les 5min (proxy optionnel)
    return () => clearInterval(interval);
  }, []);

  const bg    = T?.surface2 || '#1A2E4A';
  const border = T?.border  || '#1E3A5F';

  if (status === null) return null;

  return (
    <div
      onClick={check}
      title={status
        ? '✅ Serveur partagé actif — toutes les données sont synchronisées entre utilisateurs'
        : '⚠️ Hors ligne — données locales uniquement (non partagées)'}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 8px',
        background: status ? '#22C55E15' : '#F9731615',
        border: `1px solid ${status ? '#22C55E44' : '#F9731644'}`,
        borderRadius: 20, cursor: 'pointer',
        fontSize: 10, fontWeight: 700,
        color: status ? '#22C55E' : '#F97316',
        transition: 'all 0.3s',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: checking ? '#F59E0B' : (status ? '#22C55E' : '#F97316'),
        animation: checking ? 'none' : (status ? 'gcPulse 2s infinite' : 'none'),
      }} />
      {checking ? '...' : (status ? 'En ligne' : 'Hors ligne')}
    </div>
  );
}

export default ServerStatus;
