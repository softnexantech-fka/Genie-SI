// ============================================================
// hooks/useFileStore.js — Hook React pour la gestion de fichiers
// Usage : const { files, upload, remove, download } = useFileStore(dossierId, module)
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import {
  gcFileSave, gcFileDelete, gcFileDownload,
  gcFileListByDossier, gcFileListByModule
} from '../core/index.js';

/**
 * Hook pour gérer les fichiers d'un dossier ou module
 *
 * @param {string|null} dossierId — ID du dossier (ou null pour lister par module)
 * @param {string} module — Nom du module ('docs', 'sirh', 'juridique', ...)
 * @param {Object} userMeta — { uploadedBy, uploadedByName }
 */
export function useFileStore(dossierId, module = 'general', userMeta = {}) {
  const [files, setFiles]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState(null);

  // Charger les fichiers au montage et quand dossierId change
  useEffect(() => {
    if (!dossierId && !module) return;
    setLoading(true);
    const loader = dossierId
      ? gcFileListByDossier(dossierId)
      : gcFileListByModule(module);
    loader
      .then(setFiles)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [dossierId, module]);

  /**
   * Uploader un ou plusieurs fichiers (File objects du navigateur)
   */
  const upload = useCallback(async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList);
    if (!items.length) return [];
    setUploading(true);
    setError(null);
    const uploaded = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          dossierId,
          module,
          ...userMeta,
          ...extraMeta,
          nom: file.name,
          taille: file.size,
          type: file.type,
        });
        uploaded.push(ref);
        setFiles(prev => [...prev, ref]);
      } catch (e) {
        setError(`Erreur upload "${file.name}": ${e.message}`);
      }
    }
    setUploading(false);
    return uploaded;
  }, [dossierId, module, userMeta]);

  /**
   * Supprimer un fichier
   */
  const remove = useCallback(async (fileRef) => {
    await gcFileDelete(fileRef);
    setFiles(prev => prev.filter(f => f.id !== fileRef.id));
  }, []);

  /**
   * Télécharger un fichier
   */
  const download = useCallback((fileRef) => gcFileDownload(fileRef), []);

  return { files, loading, uploading, error, upload, remove, download, setFiles };
};

export default useFileStore;
