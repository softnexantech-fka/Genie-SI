// ============================================================
// core/index.js — Barrel export de tous les modules core
// Importer depuis '@core' ou '../core' pour accéder à tout
// SI Génie Consultant v127
// ============================================================

// Storage & LS wrappers
export * from './storage.js';

// Helpers, utils, calculs
export * from './helpers.js';

// Context React (SICtx, useSI, error boundary, helpers)
export * from './context.jsx';

// Constantes, données initiales, configurations
export * from './constants.js';

// Gestionnaire fichiers unifié (IndexedDB + Serveur)
export * from './filestore.js';
export { default as gcFileStore } from './filestore.js';

// DataStore partagé (synchronisation serveur ↔ localStorage)
export * from './datastore.js';
export { default as gcDataStore } from './datastore.js';

// Hooks React pour synchro temps réel
export { useSyncedState } from '../hooks/useSyncedState.js';
