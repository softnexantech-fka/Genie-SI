import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

// ============================================================
// Dialog.jsx — Remplacement de alert/confirm/prompt natifs
// Modales React non-bloquantes, compatibles mobile
//
// Usage dans tout module :
//   import { useDialog } from '../../components/Dialog.jsx';
//   const { alert, confirm, prompt } = useDialog();
//   await alert("Message");
//   const ok = await confirm("Supprimer ?");
//   const val = await prompt("Saisir le motif :", "défaut");
// ============================================================

 

// ── Contexte global ──────────────────────────────────────────
export const DialogContext = createContext(null);

// ── Hook d'utilisation ───────────────────────────────────────
export const useDialog = () => {
  const ctx = useContext(DialogContext);
  // Fallback sur les natifs si pas de provider (compatibilité)
  if (!ctx) {
    return {
      alert:   (msg) => { window.alert(msg); return Promise.resolve(); },
      confirm: (msg) => Promise.resolve(window.confirm(msg)),
      prompt:  (msg, def) => Promise.resolve(window.prompt(msg, def)),
    };
  }
  return ctx;
};

// ── Provider à placer dans AppRoot ───────────────────────────
export function DialogProvider({ children, T }) {
  const [dialogs, setDialogs] = useState([]);

  const openDialog = useCallback((config) => new Promise((resolve) => {
    const id = Date.now() + Math.random();
    setDialogs(prev => [...prev, { id, ...config, resolve }]);
  }), []);

  const closeDialog = useCallback((id, value) => {
    setDialogs(prev => {
      const d = prev.find(x => x.id === id);
      if (d) d.resolve(value);
      return prev.filter(x => x.id !== id);
    });
  }, []);

  const alert = useCallback((message, title = null, icon = 'ℹ️') =>
    openDialog({ type: 'alert', message, title, icon }), [openDialog]);

  const confirm = useCallback((message, title = null, icon = '❓', danger = false) =>
    openDialog({ type: 'confirm', message, title, icon, danger }), [openDialog]);

  const prompt = useCallback((message, defaultValue = '', title = null, icon = '✏️') =>
    openDialog({ type: 'prompt', message, defaultValue, title, icon }), [openDialog]);

  // Couleurs thème
  const bg = T?.surface || '#0F1C2E';
  const bg2 = T?.surface2 || '#1A2E4A';
  const border = T?.border || '#1E3A5F';
  const text = T?.text || '#F1F5F9';
  const muted = T?.textMuted || '#7A90B0';
  const gold = '#C9A84C';
  const red = '#EF4444';
  const blue = '#3B82F6';
  const green = '#22C55E';

  return (
    <DialogContext.Provider value={{ alert, confirm, prompt }}>
      {children}

      {/* Rendu des modales actives */}
      {dialogs.map(d => (
        <DialogModal key={d.id} dialog={d} onClose={closeDialog}
          colors={{ bg, bg2, border, text, muted, gold, red, blue, green }} />
      ))}
    </DialogContext.Provider>
  );
}

// ── Composant modal individuel ────────────────────────────────
function DialogModal({ dialog, onClose, colors }) {
  const [value, setValue] = useState(dialog.defaultValue || '');
  const { bg, bg2, border, text, muted, gold, red, blue, green } = colors;

  // Fermer avec Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (dialog.type === 'alert') onClose(dialog.id, undefined);
        else onClose(dialog.id, false);
      }
      if (e.key === 'Enter' && dialog.type !== 'prompt') {
        onClose(dialog.id, dialog.type === 'confirm' ? true : undefined);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dialog, onClose]);

  // Focus auto sur le bouton principal ou l'input
  const mainBtnRef = React.useRef(null);
  const inputRef = React.useRef(null);
  useEffect(() => {
    setTimeout(() => {
      if (dialog.type === 'prompt' && inputRef.current) inputRef.current.focus();
      else if (mainBtnRef.current) mainBtnRef.current.focus();
    }, 50);
  }, [dialog.type]);

  const overlayStyle = {
    position: 'fixed', inset: 0, background: '#000000CC',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 99999, padding: 16,
    animation: 'gcDialogIn 0.15s ease',
  };
  const boxStyle = {
    background: bg, border: `1px solid ${border}`,
    borderRadius: 14, padding: '24px 24px 20px',
    maxWidth: 420, width: '100%',
    boxShadow: '0 24px 48px #00000088',
    animation: 'gcDialogSlide 0.2s ease',
  };

  return (
    <>
      <style>{`
        @keyframes gcDialogIn { from { opacity:0 } to { opacity:1 } }
        @keyframes gcDialogSlide { from { transform:scale(0.92) translateY(-8px); opacity:0 } to { transform:scale(1) translateY(0); opacity:1 } }
      `}</style>
      <div style={overlayStyle} onClick={() => { if (dialog.type === 'alert') onClose(dialog.id, undefined); }}>
        <div style={boxStyle} onClick={e => e.stopPropagation()}>

          {/* Icône + Titre */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 24, flexShrink: 0, lineHeight: 1.2 }}>{dialog.icon}</span>
            <div style={{ flex: 1 }}>
              {dialog.title && (
                <div style={{ fontWeight: 800, fontSize: 14, color: text, marginBottom: 6 }}>
                  {dialog.title}
                </div>
              )}
              <div style={{ color: dialog.title ? muted : text, fontSize: 13, lineHeight: 1.5 }}>
                {dialog.message}
              </div>
            </div>
          </div>

          {/* Input pour prompt */}
          {dialog.type === 'prompt' && (
            <input
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onClose(dialog.id, value); }}
              style={{
                width: '100%', background: bg2, border: `1px solid ${border}`,
                borderRadius: 8, padding: '8px 12px', color: text, fontSize: 13,
                outline: 'none', marginBottom: 16, boxSizing: 'border-box',
              }}
              placeholder="Saisir ici..."
            />
          )}

          {/* Boutons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            {dialog.type !== 'alert' && (
              <button
                onClick={() => onClose(dialog.id, dialog.type === 'confirm' ? false : null)}
                style={{
                  padding: '7px 16px', background: bg2, border: `1px solid ${border}`,
                  borderRadius: 7, color: muted, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                }}
              >
                Annuler
              </button>
            )}
            <button
              ref={mainBtnRef}
              onClick={() => {
                if (dialog.type === 'alert') onClose(dialog.id, undefined);
                else if (dialog.type === 'confirm') onClose(dialog.id, true);
                else onClose(dialog.id, value);
              }}
              style={{
                padding: '7px 20px',
                background: dialog.danger ? red : dialog.type === 'confirm' ? blue : gold,
                border: 'none', borderRadius: 7, color: '#fff',
                fontSize: 12, cursor: 'pointer', fontWeight: 700,
              }}
            >
              {dialog.type === 'alert' ? 'OK' : dialog.type === 'confirm' ? (dialog.danger ? 'Supprimer' : 'Confirmer') : 'Valider'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default DialogProvider;
