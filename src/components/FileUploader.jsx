import React, { useState, useRef, useCallback } from 'react';
import { gcFileSave, gcFileDownload, gcFileDelete, gcFileUrl, gcProxyStatus, gcFileStats} from '../core/index.js';

// ============================================================
// FileUploader.jsx — Composant upload universel
// Remplace tous les FileReader/readAsDataURL du SI
// S'intègre en 1 ligne dans n'importe quel module
// ============================================================

// Tailles lisibles
const fmtSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1048576) return Math.round(bytes / 1024) + ' Ko';
  return (bytes / 1048576).toFixed(1) + ' Mo';
};

// Icône par extension
const fileIcon = (nom = '') => {
  const ext = nom.split('.').pop()?.toLowerCase();
  const icons = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📊', pptx: '📊', txt: '📃', png: '🖼️', jpg: '🖼️',
    jpeg: '🖼️', gif: '🖼️', mp4: '🎬', mp3: '🎵', zip: '📦',
    rar: '📦', csv: '📊', json: '🔧',
  };
  return icons[ext] || '📎';
};

// ── Composant principal ───────────────────────────────────────
export function FileUploader({
  T,                       // Thème courant
  files = [],              // Tableau de fileRef { id, nom, taille, type, storageType, ... }
  onFilesChange,           // Callback(newFiles) quand la liste change
  multiple = true,         // Autoriser plusieurs fichiers
  accept,                  // Ex: ".pdf,.docx" — null = tout
  maxSizeMB = 50,          // Taille max par fichier
  meta = {},               // Métadonnées à associer { dossierId, module, uploadedBy, uploadedByName }
  compact = false,         // Mode compact (petite zone)
  label = 'Déposer des fichiers ici',
  disabled = false,
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: '' });
  const [error, setError] = useState(null);
  const [proxyAvail, setProxyAvail] = useState(null);
  const inputRef = useRef(null);

  // Vérifier proxy au montage
  React.useEffect(() => {
    gcProxyStatus().then(setProxyAvail);
  }, []);

  const processFiles = useCallback(async (fileList) => {
    if (disabled || !fileList?.length) return;
    const fileArray = Array.from(fileList);
    setUploading(true);
    setError(null);
    setUploadProgress({ current: 0, total: fileArray.length, fileName: '' });
    const newFileRefs = [];
    const issues = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadProgress({ current: i + 1, total: fileArray.length, fileName: file.name });
      if (file.size > maxSizeMB * 1024 * 1024) {
        issues.push(`❌ ${file.name} dépasse ${maxSizeMB} Mo`);
        continue;
      }
      try {
        const ref = await gcFileSave(file, {
          ...meta,
          nom: file.name,
          taille: file.size,
          type: file.type,
        });
        if (!ref) {
          issues.push(`❌ ${file.name} : échec inattendu de l'upload`);
          continue;
        }
        newFileRefs.push(ref);
        if (ref.error) {
          issues.push(`❌ ${file.name} : ${ref.error}`);
        } else if (ref.warning) {
          issues.push(`⚠️ ${file.name} : ${ref.warning}`);
        }
      } catch (err) {
        issues.push(`❌ ${file.name} : ${err.message}`);
      }
    }

    if (newFileRefs.length > 0) {
      onFilesChange && onFilesChange([...files, ...newFileRefs]);
    }
    if (issues.length > 0) {
      setError(issues.join(' · '));
    }
    setUploading(false);
  }, [disabled, files, maxSizeMB, meta, onFilesChange]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    processFiles(e.dataTransfer.files);
  };

  const handleRemove = async (fileRef) => {
    await gcFileDelete(fileRef);
    onFilesChange && onFilesChange(files.filter(f => f.id !== fileRef.id));
  };

  const handleView = async (fileRef) => {
    const { url, isObjectUrl, error } = await gcFileUrl(fileRef);
    if (url) {
      window.open(url, '_blank');
      if (isObjectUrl) setTimeout(() => URL.revokeObjectURL(url), 5000);
    } else {
      // FIX BUG-FILE-1 — Message d'erreur visible au lieu de silence total
      setError(`❌ Impossible d'ouvrir "${fileRef.nom}" : ${error || 'fichier introuvable sur le serveur'}`);
    }
  };

  const handleDownload = async (fileRef) => {
    const result = await gcFileDownload(fileRef);
    if (result && !result.ok) {
      setError(`❌ Téléchargement impossible pour "${fileRef.nom}" : ${result.error || 'fichier introuvable'}`);
    }
  };

  const bg = T?.surface2 || '#1E293B';
  const border = T?.border || '#2E4060';
  const text = T?.text || '#F1F5F9';
  const muted = T?.textMuted || '#7A90B0';

  return (
    <div style={{ fontFamily: 'inherit' }}>
      <style>{`@keyframes gc-progress-slide { 0%{left:-60%} 100%{left:110%} }`}</style>
      {/* Zone de dépôt */}
      {!disabled && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#3B82F6' : border}`,
            borderRadius: 10,
            background: dragging ? '#3B82F611' : bg,
            padding: compact ? '12px 16px' : '20px 24px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s',
            marginBottom: files.length > 0 ? 10 : 0,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple={multiple}
            accept={accept}
            style={{ display: 'none' }}
            onChange={(e) => { processFiles(e.target.files); e.target.value = ''; }}
          />
          {uploading ? (
            <div style={{ color: '#3B82F6', fontSize: 12 }}>
              <div style={{ marginBottom: 6 }}>
                ⏳ {uploadProgress.total > 1
                  ? `Fichier ${uploadProgress.current}/${uploadProgress.total} — ${uploadProgress.fileName}`
                  : `Enregistrement — ${uploadProgress.fileName}`}
              </div>
              <div style={{ background: '#1E293B', borderRadius: 4, height: 6, overflow: 'hidden', maxWidth: 240, margin: '0 auto' }}>
                <div style={{
                  height: '100%', borderRadius: 4, background: '#3B82F6',
                  width: uploadProgress.total > 0 ? `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` : '40%',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: compact ? 20 : 28, marginBottom: compact ? 4 : 8 }}>
                {proxyAvail ? '☁️' : '💾'}
              </div>
              <div style={{ color: muted, fontSize: compact ? 11 : 12 }}>
                {label}
              </div>
              <div style={{ color: muted, fontSize: 10, marginTop: 4 }}>
                {proxyAvail
                  ? '✅ Stockage serveur actif'
                  : '💾 Stockage local (IndexedDB)'
                } · Max {maxSizeMB} Mo
              </div>
            </>
          )}
        </div>
      )}

      {/* Message d'erreur */}
      {error && (
        <div style={{ background: '#EF444415', border: '1px solid #EF444433', borderRadius: 6, padding: '6px 10px', color: '#EF4444', fontSize: 11, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {/* Liste des fichiers */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {files.map((f) => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: bg, border: `1px solid ${border}`,
              borderRadius: 8, padding: '6px 10px',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{fileIcon(f.nom)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: text, fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.nom}
                </div>
                <div style={{ color: muted, fontSize: 9, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span>{fmtSize(f.taille)}</span>
                  <span>·</span>
                  <span>{f.storageType === 'server' ? '☁️ Serveur' : '💾 Local'}</span>
                </div>
                {(f.error || f.warning) && (
                  <div style={{ marginTop: 2, color: f.error ? '#DC2626' : '#F59E0B', fontSize: 10 }}>
                    {f.error || f.warning}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleView(f)}
                style={{ background: 'transparent', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
                title="Voir"
              >👁️</button>
              <button
                onClick={() => handleDownload(f)}
                style={{ background: 'transparent', border: 'none', color: '#22C55E', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
                title="Télécharger"
              >⬇️</button>
              {!disabled && (
                <button
                  onClick={() => handleRemove(f)}
                  style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
                  title="Supprimer"
                >🗑️</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Composant miniature pour un seul fichier (ex: avatar, logo) ──
export function SingleFileUploader({
  T,
  value,            // fileRef actuel ou null
  onChange,         // Callback(fileRef)
  accept = 'image/*',
  maxSizeMB = 5,
  meta = {},
  placeholder = '📷 Choisir un fichier',
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null); // FIX v127 — remplace alert()
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError(null);
    if (file.size > maxSizeMB * 1024 * 1024) {
      setUploadError(`Fichier trop lourd (max ${maxSizeMB} Mo)`);
      return;
    }
    setUploading(true);
    try {
      const ref = await gcFileSave(file, { ...meta, nom: file.name, taille: file.size, type: file.type });
      onChange && onChange(ref);
    } catch (e) {
      setUploadError('Erreur : ' + e.message); // FIX v127 — plus de window.alert
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <label style={{ cursor: 'pointer', display: 'inline-block' }}>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleFile} />
      {value ? (
        <FilePreview fileRef={value} T={T} />
      ) : (
        <div style={{
          padding: '8px 14px',
          background: T?.surface2 || '#1E293B',
          border: `1px dashed ${T?.border || '#2E4060'}`,
          borderRadius: 8,
          color: T?.textMuted || '#7A90B0',
          fontSize: 12,
        }}>
          {uploading ? (
            <>
              <div style={{ color: '#3B82F6', marginBottom: 4 }}>⏳ En cours...</div>
              <div style={{ background: '#2E4060', borderRadius: 3, height: 4, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', height: '100%', borderRadius: 3, background: '#3B82F6', width: '55%', animation: 'gc-progress-slide 1.1s linear infinite' }} />
              </div>
            </>
          ) : placeholder}
        </div>
      )}
    </label>
  );
}

// ── Prévisualisation d'un fichier ─────────────────────────────
export function FilePreview({ fileRef, T, maxHeight = 120 }) {
  const [url, setUrl] = useState(null);

  React.useEffect(() => {
    if (!fileRef) return;
    let objUrl = null;
    gcFileUrl(fileRef).then(({ url: u, isObjectUrl }) => {
      setUrl(u);
      if (isObjectUrl) objUrl = u;
    });
    return () => { if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [fileRef?.id]);

  if (!url) return null;

  const isImage = fileRef?.type?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(fileRef?.nom || '');
  if (isImage) return <img src={url} alt={fileRef?.nom} style={{ maxHeight, borderRadius: 6, objectFit: 'cover' }} />;

  return (
    <div style={{ padding: '8px 12px', background: T?.surface2 || '#1E293B', borderRadius: 6, fontSize: 11, color: T?.text || '#F1F5F9' }}>
      {fileIcon(fileRef?.nom)} {fileRef?.nom}
    </div>
  );
}

// ── Widget compact de stats stockage ─────────────────────────
export function StorageStats({ T }) {
  const [stats, setStats] = useState(null);

  React.useEffect(() => {
    import('../core/filestore.js').then(m => m.gcFileStats()).then(setStats);
  }, []);

  if (!stats) return null;

  const pct = stats.localStorage.percentUsed;
  const color = pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#22C55E';

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 10, color: T?.textMuted || '#7A90B0', flexWrap: 'wrap' }}>
      <span>💾 Local: {stats.localStorage.usedMB}/{stats.localStorage.limitMB} Mo</span>
      <div style={{ width: 60, height: 4, background: T?.border || '#2E4060', borderRadius: 2 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span>🗄️ IDB: {stats.idb.count} fichiers ({stats.idb.totalSizeMB} Mo)</span>
      {stats.proxy && <span style={{ color: '#22C55E' }}>☁️ Serveur actif</span>}
    </div>
  );
}

export default FileUploader;
