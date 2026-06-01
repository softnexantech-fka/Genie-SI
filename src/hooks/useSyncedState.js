import { useState, useEffect, useCallback } from 'react';
import { dsLoad, dsSave, dsOnSync, dsDeleteItemFromArray } from '../core/datastore.js';

/**
 * Hook React pour données synchronisées temps réel
 * Usage: const [data, setData, deleteItem, setSyncedDataForce] = useSyncedState('gc-dossiers', []);
 *
 * Remplace useState + lsLoad pour bénéficier de la synchro temps réel
 */
export function useSyncedState(key, fallback = null) {
  const [data, setData] = useState(() => dsLoad(key, fallback));

  useEffect(() => {
    const unsub = dsOnSync((event) => {
      if (event.key === key) {
        setData(dsLoad(key, fallback));
      }
    });

    const handleStorage = (e) => {
      if (e.key === `__GC__${key}` || e.key === key) {
        setData(dsLoad(key, fallback));
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      unsub();
      window.removeEventListener('storage', handleStorage);
    };
  }, [key, fallback]);

  const setSyncedData = useCallback((value) => {
    const resolved = typeof value === 'function' ? value(data) : value;
    setData(resolved);
    dsSave(key, resolved);
  }, [data, key]);

  // FIX BUG-SYNC-2 / BUG-DELETE-1 — Suppression fiable d'un item avec tombstone.
  // Utiliser cette fonction au lieu de setSyncedData(data.filter(...)) pour supprimer
  // un élément : garantit que le tombstone est enregistré et que l'anti-régression
  // ne restaure jamais l'item supprimé, même après un re-sync d'un client hors-ligne.
  const deleteItem = useCallback(async (itemId) => {
    if (!itemId) return;
    // Mise à jour optimiste locale immédiate pour réactivité UI
    const current = Array.isArray(data) ? data : [];
    const newList = current.filter(item => item?.id && String(item.id) !== String(itemId));
    setData(newList);
    // Suppression serveur + tombstone (forceOverwrite bypasse l'anti-régression)
    await dsDeleteItemFromArray(key, itemId);
  }, [data, key]);

  // FIX BUG-SYNC-2 — Sauvegarde avec forceOverwrite pour suppressions explicites
  // (quand l'appelant filtre la liste lui-même et veut forcer l'écriture sans merge)
  const setSyncedDataForce = useCallback((value) => {
    const resolved = typeof value === 'function' ? value(data) : value;
    setData(resolved);
    dsSave(key, resolved, null, { forceOverwrite: true });
  }, [data, key]);

  return [data, setSyncedData, deleteItem, setSyncedDataForce];
}

export default { useSyncedState };
