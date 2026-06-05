import { useState, useEffect, useCallback, useRef } from 'react';
import { dsSave, dsOnSync, dsGet, dsDeleteItemFromArray } from '../core/datastore.js';
import { lsLoad, lsSave, _lsGet } from '../core/storage.js';

/**
 * Hook React pour données synchronisées temps réel.
 * Usage: const [data, setData, deleteItem, setSyncedDataForce] = useSyncedState('gc-dossiers', []);
 *
 * CORRECTIF : l'ancienne version passait dsLoad (async) à useState → la valeur initiale
 * était une Promise, jamais les vraies données. Le hook est désormais correctement
 * architecturé :
 *   1. Initialisation SYNCHRONE depuis localStorage (lsLoad)
 *   2. Fetch ASYNCHRONE depuis le serveur au mount (dsGet)
 *   3. Re-fetch quand 'gc-sync-online' est dispatché par dsInitSync
 *   4. Écoute data_changed via dsOnSync pour les mises à jour temps réel
 */
export function useSyncedState(key, fallback = null) {
  // Initialisation synchrone depuis localStorage — jamais de Promise ici
  const [data, setData] = useState(() => lsLoad(key, fallback) ?? fallback);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Fetch initial depuis le serveur (asynchrone)
    const fetchFromServer = () => {
      dsGet(key, null).then(val => {
        if (!mountedRef.current) return;
        if (val !== null && val !== undefined) {
          lsSave(key, val);
          setData(val);
        }
      }).catch(() => {});
    };

    fetchFromServer();

    // Quand dsInitSync établit la connexion → re-fetch pour avoir les données serveur
    const handleOnline = () => fetchFromServer();
    window.addEventListener('gc-sync-online', handleOnline);

    // Écoute des changements temps réel poussés par le serveur
    const unsub = dsOnSync((event) => {
      if (!mountedRef.current) return;
      // FIX SYNC-R1 : force_resync ou heartbeat → re-fetch inconditionnellement
      // Les __ts__ ont déjà été vidés par datastore.js resync_all, donc dsGet ira chercher
      // sur le serveur sans être bloqué par le guard "local plus récent"
      if (event.action === 'force_resync' || event.action === 'heartbeat') {
        dsGet(key, fallback).then(val => {
          if (!mountedRef.current) return;
          if (val !== null && val !== undefined) { lsSave(key, val); setData(val); }
        }).catch(() => {});
        return;
      }
      if (event.key !== key) return;
      // FIX FILE-SYNC-2 — Guard timestamp avec tolérance clock skew.
      // Les clés de fichiers (gc-dossier-files, gc-files, gc-docs-unified) doivent TOUJOURS
      // faire confiance au serveur : leur source de vérité est si_files table, pas localStorage.
      // Pour les autres clés : tolérance 10s pour absorber le décalage entre timestamp client
      // (écrit avant la réponse HTTP) et timestamp broadcast serveur.
      const FILE_KEYS = new Set(['gc-dossier-files', 'gc-files', 'gc-docs-unified', 'gc-standalone-docs', 'gc-sirh-fichiers']);
      if (!FILE_KEYS.has(key)) {
        try {
          const localWriteTs = parseInt(_lsGet('__ts__:' + key) || '0');
          const broadcastTs  = event.updatedAt || event.ts || 0;
          // Tolérance 10s : ignorer seulement si local est CLAIREMENT plus récent
          if (localWriteTs > broadcastTs + 10_000) return;
        } catch {}
      }
      // Pour les clés fichiers et toutes les autres clés "proches" → toujours re-fetch
      dsGet(key, fallback).then(val => {
        if (!mountedRef.current) return;
        if (val !== null && val !== undefined) {
          lsSave(key, val);
          setData(val);
        }
      }).catch(() => {});
    });

    // Événements localStorage (onglets multiples, AppRoot HYDRATE_MAP)
    const handleStorage = (e) => {
      if (!mountedRef.current) return;
      if (e.key === `__GC__${key}` || e.key === key || e.key === `GC_SI_v12:${key}`) {
        const fresh = lsLoad(key, fallback);
        if (fresh !== null && fresh !== undefined) setData(fresh);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      mountedRef.current = false;
      unsub();
      window.removeEventListener('gc-sync-online', handleOnline);
      window.removeEventListener('storage', handleStorage);
    };
  }, [key]); // key est la seule dépendance stable voulue — fallback intentionnellement omis

  const setSyncedData = useCallback((value) => {
    const resolved = typeof value === 'function' ? value(data) : value;
    setData(resolved);
    dsSave(key, resolved);
  }, [data, key]);

  const deleteItem = useCallback(async (itemId) => {
    if (!itemId) return;
    const current = Array.isArray(data) ? data : [];
    const newList = current.filter(item => item?.id && String(item.id) !== String(itemId));
    setData(newList);
    await dsDeleteItemFromArray(key, itemId);
  }, [data, key]);

  const setSyncedDataForce = useCallback((value) => {
    const resolved = typeof value === 'function' ? value(data) : value;
    setData(resolved);
    dsSave(key, resolved, null, { forceOverwrite: true });
  }, [data, key]);

  return [data, setSyncedData, deleteItem, setSyncedDataForce];
}

/**
 * Écoute les changements distants (data_changed WebSocket → StorageEvent __GC__key)
 * et rafraîchit les états React du module appelant.
 *
 * Usage:
 *   useRemoteSync({
 *     'gc-factures':   setFactures,
 *     'gc-journal':    setJournal,
 *   });
 */
export function useRemoteSync(syncMap) {
  const mapRef = useRef(syncMap);
  mapRef.current = syncMap; // toujours à jour sans re-créer l'effet

  useEffect(() => {
    // Écoute data_changed via StorageEvent __GC__key
    const handler = async (e) => {
      if (!e.key?.startsWith('__GC__')) return;
      const key = e.key.slice(6);
      const setter = mapRef.current[key];
      if (!setter) return;
      try {
        const val = await dsGet(key, null);
        if (val !== null && val !== undefined) setter(val);
      } catch {}
    };
    window.addEventListener('storage', handler);

    // Écoute resync_all global (admin) → re-fetcher TOUTES les clés suivies
    const handleResyncAll = async () => {
      const entries = Object.entries(mapRef.current);
      await Promise.allSettled(entries.map(async ([key, setter]) => {
        try {
          const val = await dsGet(key, null);
          if (val !== null && val !== undefined) setter(val);
        } catch {}
      }));
    };
    window.addEventListener('gc-resync-all', handleResyncAll);
    window.addEventListener('gc-sync-online', handleResyncAll);

    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('gc-resync-all', handleResyncAll);
      window.removeEventListener('gc-sync-online', handleResyncAll);
    };
  }, []);
}

export default { useSyncedState };
