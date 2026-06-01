import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// [FIX v153-C] Lire la version depuis package.json (source de vérité unique)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// FIX v127 — vite-plugin-compression était déclaré en devDependency (package.json) mais
// jamais importé. Activé ici pour la compression gzip des assets en production.
import viteCompression from 'vite-plugin-compression';

const __dirname = new URL('.', import.meta.url).pathname;

// ─── SERVEUR MAÎTRE (source de vérité unique pour tout le réseau) ──────────
// ✅ FIX v133 — DÉCOUVERTE DYNAMIQUE D'IP
// Avant : IP codée en dur (.141) → tout casse si l'IP change
// Maintenant : Utilise des variables d'environnement + fallback intelligent
// Toutes les machines du réseau redirigent leurs appels /api/* et /socket.io/* vers CE serveur unique.
// → Une seule base SQLite partagée, zéro réinitialisation inter-machines.
// 
// IMPORTANT : Le fichier .env.discovery est généré automatiquement par server-discovery.js
// au démarrage du serveur. Les clients doivent pointer sur le nouvel hostname.
const MASTER_IP   = (typeof process !== 'undefined' && process.env?.VITE_MASTER_IP) || '192.168.1.133';  // ✅ Mise à jour automatique
const MASTER_PORT = (typeof process !== 'undefined' && process.env?.VITE_MASTER_PORT) || '3001';
const MASTER_BACKEND = `http://${MASTER_IP}:${MASTER_PORT}`;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Babel optimizations — FIX v127: plugin 'transform-react-remove-prop-types'
      // retiré car non déclaré dans package.json (causait crash du build production).
      babel: { plugins: [] },
    }),
    // FIX v127 — Compression gzip des assets (réduit ~70% la taille des chunks)
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 10240, // Compresser uniquement les fichiers > 10KB
      deleteOriginFile: false,
      // FIX v130 — éviter le double chemin dans le nom de fichier .gz
      filename: '[path][base].gz',
    }),
  ],

  resolve: {
    alias: {
      // Raccourcis d'import pratiques
      '@': resolve(__dirname, './src'),
      '@core': resolve(__dirname, './src/core'),
      '@modules': resolve(__dirname, './src/modules'),
      '@components': resolve(__dirname, './src/components'),
    },
  },

  server: {
    port: 4173,
    host: true,        // ← Rend l'app accessible sur le réseau local (Scénario B)
    proxy: {
      '/socket.io': {
        target: MASTER_BACKEND,
        changeOrigin: true,
        ws: true,  // ← Proxy WebSocket pour socket.io
        // FIX v131 — Supprimer les erreurs ECONNRESET parasites dans les logs.
        // ECONNRESET = un client a fermé sa connexion normalement (navigation, onglet fermé).
        // C'est un événement normal, pas une erreur.
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') return;
            console.warn(`[ws-proxy] ${err.code}: ${err.message}`);
          });
        },
      },
      '/api': {
        target: MASTER_BACKEND,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') return;
            console.warn(`[proxy] ${err.code}: ${err.message}`);
          });
        },
      },
      '/health': {
        target: MASTER_BACKEND,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') return;
            console.warn(`[health-proxy] ${err.code}: ${err.message}`);
          });
        },
      },
    },
  },

  build: {
    // ── Target moderne — supprime les polyfills inutiles ──────────────────
    target: 'es2020',

    // ── Seuil d'avertissement relevé (bundle SI volumineux normal) ────────
    chunkSizeWarningLimit: 2000,

    // ── Options Rollup pour le découpage des chunks ───────────────────────
    rollupOptions: {
      output: {
        // Nommage des chunks avec hash pour cache-busting
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',

        // ── Manual Chunks : séparation simplifiée pour éviter les cycles de dépendance.
        manualChunks(id) {
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }

          if (id.includes('node_modules')) {
            return 'vendor';
          }

          // Reste des modules dans le bundle principal pour éviter les dépendances croisées spirales.
          return undefined;
        },
      },
    },

    // ── Minification agressive ────────────────────────────────────────────
    minify: 'esbuild',
    cssMinify: true,

    // ── Supprimer console.log en production ──────────────────────────────
    // FIX v127 — 'esbuildOptions' n'existe PAS dans Vite 6 (causait silently no-op).
    // La bonne clé est 'esbuild' directement sous 'build' (pas dans rollupOptions).
    esbuild: {
      drop: ['debugger'],
      pure: ['console.log', 'console.debug', 'console.info'],
    },

    // ── Sourcemaps en production (utiles pour debugging Gabon) ────────────
    sourcemap: false,
  },

  // ── Configuration Preview (vite preview) pour prod optimisée ──────────────
  preview: {
    port: 4173,
    host: true,  // ← Accessible sur le réseau local
    proxy: {
      // FIX v131 — Pointer sur le serveur MAÎTRE (192.168.1.133:3001).
      // En mode preview, tous les postes du réseau redirigent /api et /socket.io
      // vers un seul backend → une seule SQLite → zéro perte de données inter-machines.
      '/socket.io': {
        target: MASTER_BACKEND,
        changeOrigin: true,
        ws: true,
        // FIX v131 — ECONNRESET = client déconnecté normalement → silencieux
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') return;
            console.warn(`[preview-ws-proxy] ${err.code}: ${err.message}`);
          });
        },
      },
      '/api': {
        target: MASTER_BACKEND,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') return;
            console.warn(`[preview-proxy] ${err.code}: ${err.message}`);
          });
        },
      },
      '/health': {
        target: MASTER_BACKEND,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') return;
            console.warn(`[preview-health-proxy] ${err.code}: ${err.message}`);
          });
        },
      },
    },
  },

  // ── Optimisations dev ─────────────────────────────────────────────────────
  optimizeDeps: {
    include: ['react', 'react-dom'],
    // Force pre-bundling pour démarrage plus rapide
    force: false,
  },

  // ── Variables d'environnement exposées au client ──────────────────────────
  define: {
    // [FIX v153-C] Version lue depuis package.json — plus de divergence entre UI et vraie version
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
  },
});
