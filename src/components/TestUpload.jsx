import React, { useState } from 'react';
import { gcFileSave } from '../core/index.js';

export default function TestUpload({ currentUser }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const runTest = async () => {
    setRunning(true);
    setResult(null);
    try {
      const content = `Test upload from app at ${new Date().toISOString()}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const meta = { nom: `test-upload-${Date.now()}.txt`, dossierId: 'TEST', uploadedBy: currentUser?.id || 'anonymous' };
      const ref = await gcFileSave(new File([blob], meta.nom, { type: 'text/plain' }), meta);
      setResult(ref || { error: 'No response' });
    } catch (e) {
      setResult({ error: e.message || String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 9999 }}>
      <div style={{ background: '#0b1220', color: '#fff', padding: 10, borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', minWidth: 280 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Dev: Test Upload</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={runTest} disabled={running} style={{ flex: 1 }}>{running ? 'Uploading…' : 'Run upload test'}</button>
        </div>
        {result && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            {result.error ? (
              <div style={{ color: '#fca5a5' }}>Error: {result.error}</div>
            ) : (
              <div>
                <div style={{ color: '#86efac' }}>OK: {result.id || result.serverId || result.serverUrl}</div>
                {result.serverUrl && <a href={result.serverUrl} target="_blank" rel="noreferrer" style={{ color: '#93c5fd' }}>Open file</a>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
