// ToastManager — Système de notification toast global pour le SI Génie Consultant
// Usage :
//   import { gcToast } from '@components/ToastManager.jsx';
//   gcToast.success('Sauvegarde réussie');
//   gcToast.error('Erreur réseau — réessayez');
//   gcToast.warn('Session expirée');
//   gcToast.info('Synchronisation en cours...');
//
// Le composant <ToastContainer /> doit être monté une seule fois dans App.jsx ou AppRoot.jsx.

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

// ─── Bus d'événements interne ─────────────────────────────────────────────────
const _listeners = new Set();
let _idCounter = 0;

function _emit(toast) {
  _listeners.forEach(fn => fn(toast));
}

// ─── API publique ─────────────────────────────────────────────────────────────
export const gcToast = {
  success: (msg, opts) => _emit({ type: 'success', msg: String(msg), duration: 4000, ...opts }),
  error:   (msg, opts) => _emit({ type: 'error',   msg: String(msg), duration: 7000, ...opts }),
  warn:    (msg, opts) => _emit({ type: 'warn',    msg: String(msg), duration: 5000, ...opts }),
  info:    (msg, opts) => _emit({ type: 'info',    msg: String(msg), duration: 4000, ...opts }),

  // Variante spécialisée pour les erreurs de sync réseau
  syncError: (key, err) => {
    const detail = err?.message || String(err || 'Erreur inconnue');
    const isNetwork = /network|fetch|ECONNREFUSED|timeout|abort/i.test(detail);
    if (isNetwork) {
      _emit({ type: 'warn', msg: 'Synchronisation différée — données sauvegardées localement', duration: 4000 });
    } else {
      _emit({ type: 'error', msg: `Erreur de sauvegarde (${key}) — ${detail}`, duration: 6000 });
    }
  },
};

// Exposé sur window pour usage depuis du code non-React
if (typeof window !== 'undefined') window.gcToast = gcToast;

// ─── Styles ───────────────────────────────────────────────────────────────────
const COLORS = {
  success: { bg: '#16a34a', border: '#15803d', icon: '✓' },
  error:   { bg: '#dc2626', border: '#b91c1c', icon: '✕' },
  warn:    { bg: '#d97706', border: '#b45309', icon: '⚠' },
  info:    { bg: '#2563eb', border: '#1d4ed8', icon: 'ℹ' },
};

function Toast({ id, type, msg, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Entrée
    const t1 = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t1);
  }, []);

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(id), 280);
  }, [id, onDismiss]);

  const c = COLORS[type] || COLORS.info;

  return (
    <div
      role="alert"
      aria-live="polite"
      onClick={dismiss}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        background: c.bg, border: `1px solid ${c.border}`,
        borderRadius: '8px', padding: '12px 16px', marginTop: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        color: '#fff', fontSize: '14px', lineHeight: '1.45',
        cursor: 'pointer', userSelect: 'none',
        maxWidth: '380px', wordBreak: 'break-word',
        transform: visible && !leaving ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible && !leaving ? 1 : 0,
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease',
        willChange: 'transform, opacity',
      }}
    >
      <span style={{ fontSize: '16px', fontWeight: 'bold', flexShrink: 0, marginTop: '1px' }}>
        {c.icon}
      </span>
      <span style={{ flex: 1 }}>{msg}</span>
      <span style={{ fontSize: '16px', opacity: 0.7, flexShrink: 0, marginTop: '1px' }}>×</span>
    </div>
  );
}

// ─── Conteneur principal (monter une seule fois dans l'arbre React) ───────────
export function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const addToast = useCallback((toast) => {
    const id = ++_idCounter;
    const entry = { ...toast, id };
    setToasts(prev => [...prev.slice(-6), entry]); // max 7 toasts simultanés

    if (toast.duration > 0) {
      timersRef.current[id] = setTimeout(() => dismiss(id), toast.duration);
    }
  }, []);

  const dismiss = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts(prev => {
      const t = prev.find(x => x.id === id);
      if (!t) return prev;
      return prev.map(x => x.id === id ? { ...x, _leaving: true } : x);
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id));
    }, 300);
  }, []);

  useEffect(() => {
    _listeners.add(addToast);
    return () => {
      _listeners.delete(addToast);
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, [addToast]);

  if (!toasts.length) return null;

  return createPortal(
    <div
      aria-label="Notifications"
      style={{
        position: 'fixed', bottom: '24px', right: '24px',
        zIndex: 99999, display: 'flex', flexDirection: 'column',
        alignItems: 'flex-end', pointerEvents: 'none',
      }}
    >
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <Toast id={t.id} type={t.type} msg={t.msg} onDismiss={dismiss} />
        </div>
      ))}
    </div>,
    document.body
  );
}
