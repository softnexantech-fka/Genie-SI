import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
// FIX v127 — DialogProvider retiré ici : AppRoot.jsx enveloppe chaque écran avec
// <DialogProvider T={T}> (avec le thème). Un provider racine sans T créait un
// doublon inutile + le contexte interne écrasait toujours l'externe de toute façon.

// ─── Proxy IA (activé) ────────────────────────────────────────────────────
// Le proxy sécurise les clés IA côté serveur (ne jamais les exposer au client).
// [FIX v153-B] window.__GC_PROXY_URL__ supprimé — il n'était pas utilisé par datastore.js
// (qui calcule sa propre URL via hostname + VITE_MASTER_PORT). La variable globale
// créait une confusion de debugging en pointant vers le port Vite (4173) au lieu de 3001.

// ─── Intercepteur fetch global — FIX v129 ─────────────────────────────────
// Plusieurs modules appellent https://api.anthropic.com/v1/messages directement
// depuis le navigateur (sans clé API → 401 garanti). Cet intercepteur les
// redirige automatiquement vers le proxy backend sécurisé, sans modifier
// chaque module individuellement.
(function _gcPatchFetch() {
  const _orig = window.fetch.bind(window);
  const PROXY_ORIGIN = window.location.origin;

  const AI_ROUTES = {
    'api.anthropic.com/v1/messages':          '/api/ai/claude',
    'generativelanguage.googleapis.com':       '/api/ai/gemini/gemini-1.5-flash',
    'api.openai.com/v1/chat/completions':      '/api/ai/gpt',
  };

  window.fetch = async function _gcFetch(url, opts = {}) {
    const urlStr = typeof url === 'string'
      ? url
      : (url?.url || url?.href || '');
    const matched = Object.entries(AI_ROUTES).find(([k]) => urlStr.includes(k));

    if (matched) {
      const [, proxyPath] = matched;
      try {
        const body = (() => {
          if (!opts?.body) return {};
          if (typeof opts.body !== 'string') return {};
          try {
            return JSON.parse(opts.body);
          } catch {
            // Keep original call behavior if body is not JSON serializable.
            return {};
          }
        })();
        const r = await _orig(`${PROXY_ORIGIN}${proxyPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) return r;
        // Proxy a répondu mais avec erreur (ex: clé absente) → laisser passer l'appel original
        console.warn(`[GC Proxy] ${proxyPath} → HTTP ${r.status}, fallback direct`);
      } catch (e) {
        console.warn('[GC Proxy] Proxy injoignable, fallback direct :', e.message);
      }
    }

    return _orig(url, opts);
  };
})();

// ─── Capture globale des promesses rejetées non gérées ────────────────────
const _isProd = import.meta.env?.MODE === 'production';
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason || '');
  // En prod : supprimer les rejets bénins (ECONNREFUSED réseau, abort signal)
  if (_isProd && (msg.includes('AbortError') || msg.includes('NetworkError') || msg.includes('Failed to fetch'))) {
    event.preventDefault();
    return;
  }
  console.warn('[SI] Promise rejetée non gérée :', msg, event.reason);
  if (_isProd) event.preventDefault(); // masquer les erreurs non critiques en prod
});

window.addEventListener('error', (event) => {
  const err = event?.error;
  const msg = err?.message || event?.message || 'Erreur script inconnue';
  console.error('[SI] Erreur runtime non gérée :', msg, err || event);
});

// ─── Lancement de l'application ───────────────────────────────────────────
// ─── Rendu sécurisé avec capture d'erreur ─────────────────────────────────
const rootEl = document.getElementById('root');
try {
  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );
} catch(err) {
  console.error('[SI] Erreur critique au démarrage:', err);
  rootEl.innerHTML = '<div style="background:#0A1E4A;color:#F1F5F9;padding:40px;font-family:monospace;min-height:100vh">' +
    '<h2 style="color:#EF4444">⚠️ Erreur critique au démarrage</h2>' +
    '<pre>' + (err?.message || String(err)) + '</pre>' +
    '<p style="color:#7A90B0">Ouvrez la console (F12) pour plus de détails.</p>' +
    '</div>';
}
