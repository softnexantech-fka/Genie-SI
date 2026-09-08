export function normalizeStoredFileName(value, fallback = 'Document') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function withCanonicalDocName(doc, fallbackName = 'Document') {
  const name = normalizeStoredFileName(
    doc?.name || doc?.nom || doc?.fileName || doc?.originalName || doc?.filename,
    fallbackName
  );
  return {
    ...doc,
    name,
    nom: name,
    fileName: name,
    originalName: name,
    filename: name,
  };
}
