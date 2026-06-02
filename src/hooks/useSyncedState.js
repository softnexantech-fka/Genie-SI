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
      if (event.key !== key) return;
      if (!mountedRef.current) return;
      // Ne pas écraser si notre écriture locale est plus récente que ce broadcast
      try {
        const localWriteTs = parseInt(_lsGet('__ts__:' + key) || '0');
        const broadcastTs  = event.updatedAt || event.ts || 0;
        if (localWriteTs > broadcastTs) return; // local plus récent — ignorer
      } catch {}
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
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

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

export default { useSyncedState };
