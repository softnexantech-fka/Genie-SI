import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../components/Dialog.jsx';
// UI Components — Btn, Modal, InputField, etc.
// SI Génie Consultant v127
import { _lsGet, _lsSet, _tActive, playSound, gcHashPassword, gcGetCabinetInfo } from '../core/index.js';
import { ALL_NATIONALITIES, NATIONALITIES_CEMAC, NATIONALITIES_CEDEAO, NATIONALITIES_AUTRES } from '../core/constants.js';
import { gcUserInitials, gcUserColor } from '../core/helpers.js';

 
export function NationaliteField({ value, onChange, T, noLabel=false }){
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const isOther = value && !ALL_NATIONALITIES.find(n => n.value === value);
  const [showText, setShowText] = useState(isOther);
  const [textVal, setTextVal] = useState(isOther ? value : "");
  return (
    <div style={{ marginBottom: noLabel ? 0 : 12 }}>
      {!noLabel && <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Nationalité</label>}
      <select value={showText ? "Autre (préciser)" : (value || "")} onChange={e => {
        if (e.target.value === "Autre (préciser)") { setShowText(true); onChange({ target: { value: textVal || "" } }); }
        else { setShowText(false); onChange(e); }
      }} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 13px", color: T.text, fontSize: 13 }}>
        <option value="">— Sélectionner —</option>
        <optgroup label="🌍 CEMAC">
          {NATIONALITIES_CEMAC.map(n => <option key={n} value={n}>{n}</option>)}
        </optgroup>
        <optgroup label="🌍 CEDEAO">
          {NATIONALITIES_CEDEAO.map(n => <option key={n} value={n}>{n}</option>)}
        </optgroup>
        <optgroup label="🌐 Autres">
          {NATIONALITIES_AUTRES.map(n => <option key={n} value={n}>{n}</option>)}
        </optgroup>
      </select>
      {showText && (
        <input value={textVal} onChange={e => { setTextVal(e.target.value); onChange({ target: { value: e.target.value } }); }} placeholder="Préciser la nationalité…" style={{ width: "100%", marginTop: 6, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 13px", color: T.text, fontSize: 13, boxSizing: "border-box" }} />
      )}
    </div>
  );
};

// -- SÉCURITÉ : Authentification par hash SHA-256 (Phase 0 v57) ------------
// Pas de credential en clair dans le code source.
// Le hash de référence est calculé une seule fois et stocké ici.
// Pour changer le mot de passe admin : utiliser gcHashPassword("nouveau_mdp")
// dans la console, copier le résultat dans GC_ADMIN_HASH.
// Hashes SHA-256 de référence (calculés via gcHashPassword + GC_SALT_2026_GABON).
// Ne jamais stocker de mots de passe en clair ici.
// Pour changer le mot de passe admin : gcHashPassword("nvx_mdp") dans la console → stocker le hash résultant dans gc_admin_custom_hash (localStorage).
export function QRDisplay({ value, size = 80, showDownload = false, label = "" }) {

  const hash = (str) => { let h = 0; for (let c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff; return Math.abs(h); };
  const seed = hash(value || "GC");
  const grid = 12;
  const cells = Array.from({ length: grid * grid }, (_, i) => {
    const r = Math.floor(i / grid), c = i % grid;
    if ((r < 3 && c < 3) || (r < 3 && c >= grid - 3) || (r >= grid - 3 && c < 3)) return true;
    return ((seed >> (i % 32)) & 1) === 1;
  });
  const cs = size / grid;
  const svgRef = React.useRef(null);

  const handleDownload = () => {
    try {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement("canvas");
      const padding = 12;
      canvas.width = size + padding * 2;
      canvas.height = size + padding * 2 + (label ? 20 : 0);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        ctx.drawImage(img, padding, padding, size, size);
        if (label) {
          ctx.fillStyle = "#000000";
          ctx.font = "bold 9px Arial";
          ctx.textAlign = "center";
          ctx.fillText(label.slice(0, 40), canvas.width / 2, canvas.height - 4);
        }
        URL.revokeObjectURL(url);
        const link = document.createElement("a");
        link.download = `QR-${(value||"GC").replace(/[^A-Za-z0-9-]/g,"_")}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      };
      img.src = url;
    } catch(e) {}
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ display: "inline-block", background: "#fff", padding: 4, borderRadius: 4 }}>
        <svg ref={svgRef} width={size} height={size}>
          {cells.map((f, i) => f ? <rect key={i} x={(i % grid) * cs} y={Math.floor(i / grid) * cs} width={cs} height={cs} fill="#000" /> : null)}
        </svg>
      </div>
      {showDownload && (
        <button onClick={handleDownload}
          style={{ background: "#C41E3A22", border: "1px solid #C41E3A44", color: "#C41E3A", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
          ⬇️ Télécharger QR
        </button>
      )}
    </div>
  );
};

export const Badge = ({ label, color, bg, icon, small }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: bg || color + "22", color, borderRadius: 6, padding: small ? "2px 7px" : "3px 10px", fontSize: small ? 10 : 12, fontWeight: 600, border: `1px solid ${color}40`, whiteSpace: "nowrap" }}>
    {icon && <span style={{ fontSize: 10 }}>{icon}</span>}{label}
  </span>
);

export const ProgressBar = ({ value, color }) => (
  <div style={{ background: "#00000020", borderRadius: 99, height: 5, overflow: "hidden", marginTop: 4 }}>
    <div style={{ width: `${Math.min(value, 100)}%`, background: color || "#C41E3A", height: "100%", borderRadius: 99, transition: "width 0.5s" }} />
  </div>
);

export function Btn({ onClick, children, variant = "primary", size = "md", style: s = {}, disabled = false, title: t }) {

  const styles = {
    primary: { background: "linear-gradient(135deg,#C41E3A,#E02244)", color: "#fff", border: "none", boxShadow: "0 4px 16px rgba(196,30,58,0.4), inset 0 1px 0 rgba(255,255,255,0.15)" },
    secondary: { background: "transparent", color: "#C41E3A", border: "1px solid #C41E3A55", boxShadow: "0 2px 8px rgba(196,30,58,0.15)" },
    outline: { background: "transparent", color: "#C41E3A", border: "1px solid #C41E3A88", boxShadow: "none" },
    ghost: { background: "transparent", color: "#7A90B0", border: "1px solid #1E3A5F", boxShadow: "none" },
    navy: { background: "linear-gradient(135deg,#0A1E4A,#1A3A7A)", color: "#fff", border: "none", boxShadow: "0 4px 16px rgba(10,30,74,0.5), inset 0 1px 0 rgba(255,255,255,0.1)" },
    success: { background: "linear-gradient(135deg,#166534,#22C55E)", color: "#fff", border: "none", boxShadow: "0 4px 16px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.1)" },
    danger: { background: "linear-gradient(135deg,#7F1D1D,#EF4444)", color: "#fff", border: "none", boxShadow: "0 4px 16px rgba(239,68,68,0.35), inset 0 1px 0 rgba(255,255,255,0.1)" },
    gold: { background: "linear-gradient(135deg,#92400E,#C9A84C)", color: "#fff", border: "none", boxShadow: "0 4px 16px rgba(201,168,76,0.35), inset 0 1px 0 rgba(255,255,255,0.1)" },
  };
  const pad = size === "sm" ? "6px 14px" : size === "lg" ? "13px 30px" : "9px 20px";
  const fsize = size === "sm" ? 11 : size === "lg" ? 14 : 12;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={t}
      style={{ ...(styles[variant] || styles.primary), borderRadius: 9, padding: pad, fontSize: fsize, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", letterSpacing: 0.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap", flexShrink: 0, ...s }}
    >
      {children}
    </button>
  );
};
export const InputField = ({ label, type = "text", value, onChange, placeholder, required, T, icon, style }) => (
  <div style={{ marginBottom: 13, ...(style||{}) }}>
    {label && <label style={{ color: T.textMuted, fontSize: 11, display: "flex", alignItems: "center", gap: 4, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>
      {icon && <span>{icon}</span>}{label}{required && <span style={{ color: "#C41E3A" }}>*</span>}
    </label>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 13px", color: T.text, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s" }} />
  </div>
);

export const SelectField = ({ label, value, onChange, options, required, T, icon }) => (
  <div style={{ marginBottom: 13 }}>
    {label && <label style={{ color: T.textMuted, fontSize: 11, display: "flex", alignItems: "center", gap: 4, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>
      {icon && <span>{icon}</span>}{label}{required && <span style={{ color: "#C41E3A" }}>*</span>}
    </label>}
    <select value={value} onChange={onChange}
      style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 13px", color: T.text, fontSize: 13, outline: "none", transition: "border-color 0.2s, box-shadow 0.2s", cursor: "pointer" }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// FIX v129 — helper partagé d'impression propre (évite les crashs écran bleu du window.print() direct)
export function gcOpenPrintWindow({ content, title, orientation = "portrait", pageSize = "A4", margin = "15mm" }) {
  const finalOrientation = (typeof orientation === "string" && orientation.trim()) ? orientation.trim() : "portrait";
  const finalPageSize    = (typeof pageSize    === "string" && pageSize.trim())    ? pageSize.trim()    : "A4";
  const finalMargin      = (typeof margin      === "string" && margin.trim())      ? margin.trim()      : "15mm";
  const safeContent = content
    || document.getElementById("gc-module-content")?.innerHTML
    || "<p style='color:#666;padding:20px'>Aucun contenu à imprimer.</p>";
  const cabinetInfo = gcGetCabinetInfo();
  const pw = window.open("", "_blank", "width=960,height=720");
  if (!pw) { alert("Veuillez autoriser les fenêtres popup pour imprimer."); return; }
  try {
    pw.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${title || "Impression — Génie Consultant"}</title>
<style>
  @page { size: ${finalPageSize} ${finalOrientation}; margin: ${finalMargin}; }
  *,*::before,*::after { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000 !important; background: #fff !important; padding: 16px; margin: 0; line-height: 1.4; }
  .gc-card, .card, [class*="card"] { margin-bottom: 15px !important; padding: 12px !important; border: 1px solid #ddd !important; border-radius: 5px !important; page-break-inside: avoid; }
  .gc-section, .section, [class*="section"] { margin-bottom: 20px !important; }
  h1,h2,h3,h4,h5,h6 { color: #C41E3A !important; margin: 12px 0 8px 0; page-break-after: avoid; }
  h1,h2,h3,h4,h5,h6 { color: #C41E3A !important; margin: 8px 0 4px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  th,td { border: 1px solid #ccc; padding: 5px 9px; text-align: left; font-size: 11px; color: #000 !important; }
  th { background: #f0f0f0 !important; font-weight: 700; }
  img { max-width: 100%; }
  button,[role="button"],input,select,textarea,svg { display: none !important; }
  .gc-print-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #C41E3A; padding-bottom:10px; margin-bottom:14px; }
  .gc-print-title  { font-size:15px; font-weight:800; color:#C41E3A !important; }
  .gc-print-meta   { font-size:10px; color:#555 !important; text-align:right; }
  .gc-print-footer { border-top:1px solid #ddd; margin-top:18px; padding-top:6px; font-size:9px; color:#999 !important; text-align:center; }
  .gc-signature-zone { border:1px solid #ccc; margin:20px 0; padding:30px; min-height:80px; background:#fafafa; }
  .gc-signature-line { border-bottom:1px solid #000; width:200px; margin:10px 0; display:inline-block; }
  .gc-cabinet-info { background:#f8f9fa; border:1px solid #dee2e6; padding:15px; margin:20px 0; border-radius:5px; }
  .gc-cabinet-info h4 { margin:0 0 10px 0; color:#C41E3A; font-size:14px; }
  .gc-cabinet-info p { margin:5px 0; font-size:11px; color:#666; }
  .gc-no-print     { display:block; margin-bottom:10px; }
  .gc-btn-print    { background:#C41E3A; color:#fff; border:none; padding:7px 18px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:700; margin:0 4px; }
  @media print { .gc-no-print { display:none !important; } body { padding:0; } }
</style></head><body>
<div class="gc-print-header">
  <div><div class="gc-print-title">⚖ GÉNIE CONSULTANT — SI</div><div style="font-size:10px;color:#555;">${title || "Document"}</div></div>
  <div class="gc-print-meta">Imprimé le ${new Date().toLocaleString("fr-FR")}<br/>Confidentiel — Usage interne</div>
</div>
<div class="gc-no-print">
  <button class="gc-btn-print" onclick="window.print()">🖨️ Imprimer</button>
  <button class="gc-btn-print" style="background:#555;" onclick="window.close()">✕ Fermer</button>
</div>
<div>${safeContent}</div>

<!-- Zone de signature -->
<div class="gc-signature-zone">
  <div style="display:flex; justify-content:space-between; gap:40px;">
    <div style="flex:1;">
      <p style="font-size:11px; font-weight:700; color:#555; margin:0 0 10px 0;">POUR LE CABINET — GÉNIE CONSULTANT</p>
      <div class="gc-signature-line"></div>
      <p style="font-size:10px; color:#666; margin:5px 0;">Date: ${new Date().toLocaleDateString("fr-FR")}</p>
      <p style="font-size:10px; color:#666; margin:5px 0;">Signature et cachet</p>
    </div>
    <div style="flex:1;">
      <p style="font-size:11px; font-weight:700; color:#555; margin:0 0 10px 0;">POUR LE CLIENT</p>
      <div class="gc-signature-line"></div>
      <p style="font-size:10px; color:#666; margin:5px 0;">Date: ________________</p>
      <p style="font-size:10px; color:#666; margin:5px 0;">Signature et cachet</p>
    </div>
  </div>
</div>

<!-- Informations du cabinet -->
<div class="gc-cabinet-info">
  <h4>⚖ ${cabinetInfo.nom}</h4>
  <p><strong>${cabinetInfo.description}</strong></p>
  <p>📍 ${cabinetInfo.adresse}</p>
  <p>📞 Téléphone: ${cabinetInfo.telephone}</p>
  <p>📧 Email: ${cabinetInfo.email}</p>
  <p>🌐 Site web: ${cabinetInfo.siteWeb}</p>
  <p>📋 RCCM: ${cabinetInfo.rccm} | NIF: ${cabinetInfo.nif}</p>
  <p style="font-size:10px; color:#888; margin-top:10px;">Document généré par le Système d'Information Intégré — Version 10.5 — ${new Date().toLocaleString("fr-FR")}</p>
  <p style="font-size:10px; color:#888;">Confidentiel — Usage professionnel uniquement</p>
</div>

<div class="gc-print-footer">Génie Consultant — Libreville, Gabon · ${new Date().toLocaleDateString("fr-FR")} · Confidentiel</div>
</body></html>`);
    pw.document.close();
    pw.focus();
  } catch(err) {
    console.error("gcOpenPrintWindow error:", err);
    try { pw.close(); } catch(_) {}
    window.alert("Erreur lors de la préparation de l'impression. Veuillez réessayer.");
  }
}

export function PrintButton({ content, title, T, size = "sm", style: s = {}, children, targetId = null, orientation = "portrait", pageSize = "A4", margin = "15mm" }) {
  const _dlg = useDialog();
  const gcAlert = (msg, t, icon) => _dlg.alert(msg, t, icon);

  const sanitize = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
  const finalOrientation = sanitize(orientation, 'portrait');
  const finalPageSize = sanitize(pageSize, 'A4');
  const finalMargin = sanitize(margin, '15mm');

  const handleQuickPrint = () => {
    try {
      let printContent = "";
      if (content) {
        // Content fourni directement (HTML string)
        printContent = content;
      } else if (targetId) {
        // Cibler un élément spécifique par ID
        const el = document.getElementById(targetId);
        if (!el) { gcAlert(`Élément d'impression introuvable (id="${targetId}"). Veuillez réessayer.`); return; }
        printContent = el.innerHTML;
      } else {
        // Fallback sécurisé : tenter de cibler gc-module-content, sinon message d'avertissement
        const moduleEl = document.getElementById("gc-module-content");
        if (moduleEl) {
          printContent = moduleEl.innerHTML;
        } else {
          gcAlert("Aucun contenu d'impression configuré pour ce module.\nVeuillez contacter l'administrateur.");
          return;
        }
      }

      const printWindow = window.open("", "_blank", "width=900,height=700");
      if (!printWindow) { gcAlert("Veuillez autoriser les fenêtres popup pour imprimer."); return; }

      // Écrire dans la fenêtre d'impression avec styles propres (pas de dark mode)
      printWindow.document.write(`<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8">
      <title>${title || "Impression — Génie Consultant SI"}</title>
      <style>
        @page { size: ${finalPageSize} ${finalOrientation}; margin: ${finalMargin}; }
        *, *::before, *::after { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #000 !important; background: #fff !important; padding: 20px; margin: 0; }
        /* Forcer couleurs claires — neutraliser dark-mode inline */
        * { color: inherit !important; background-color: transparent !important; border-color: #ddd !important; }
        a { color: #0A1E4A !important; text-decoration: none; }
        h1,h2,h3,h4,h5,h6 { color: #C41E3A !important; margin-top: 12px; margin-bottom: 6px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
        th, td { border: 1px solid #ccc !important; padding: 6px 10px; text-align: left; font-size: 11px; }
        th { background: #f0f0f0 !important; color: #000 !important; font-weight: 700; }
        img { max-width: 100%; }
        svg { display: none; }
        button, input, select, textarea { display: none !important; }
        .no-print { display: none !important; }
        .gc-print-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #C41E3A; padding-bottom: 10px; margin-bottom: 16px; }
        .gc-print-logo { font-size: 16px; font-weight: 800; color: #C41E3A !important; }
        .gc-print-meta { font-size: 10px; color: #555 !important; text-align: right; }
        .gc-print-footer { border-top: 1px solid #ddd; margin-top: 24px; padding-top: 8px; font-size: 9px; color: #888 !important; text-align: center; }
        .gc-print-btn { background: #C41E3A !important; color: #fff !important; border: none !important; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 700; margin: 10px 4px; display: inline-block; }
        @media print {
          .gc-no-print { display: none !important; }
          body { padding: 0; }
        }
      </style></head><body>
      <div class="gc-print-header">
        <div>
          <div class="gc-print-logo">⚖ GÉNIE CONSULTANT — SI</div>
          <div style="font-size:10px;color:#666;">${title || "Document"}</div>
        </div>
        <div class="gc-print-meta">Imprimé le ${new Date().toLocaleString("fr-FR")}<br/>Confidentiel</div>
      </div>
      <div class="gc-no-print" style="margin-bottom:12px;">
        <button class="gc-print-btn" onclick="window.print()">🖨️ Imprimer</button>
        <button class="gc-print-btn" style="background:#555 !important;" onclick="window.close()">✕ Fermer</button>
      </div>
      <div id="gc-print-body">${printContent}</div>
      <div class="gc-print-footer">GÉNIE CONSULTANT — Libreville, Gabon · ${new Date().toLocaleDateString("fr-FR")} · Confidentiel</div>
      </body></html>`);
      printWindow.document.close();
      printWindow.focus();
    } catch (err) {
      console.error("PrintButton error:", err);
      gcAlert("Erreur lors de l'impression. Veuillez réessayer.\n" + (err?.message || ""));
    }
  };

  const btnStyle = {
    background: "#C9A84C22", border: "1px solid #C9A84C44", color: "#C9A84C",
    borderRadius: 7, padding: size === "xs" ? "3px 8px" : "6px 12px",
    cursor: "pointer", fontSize: size === "xs" ? 10 : 11, fontWeight: 700,
    display: "inline-flex", alignItems: "center", gap: 4, ...s
  };

  return (
    <button type="button" onClick={handleQuickPrint} style={btnStyle} title={`Imprimer : ${title || "ce document"}`}>
      🖨️ {children || (size !== "xs" ? "Imprimer" : "")}
    </button>
  );
};

export function Modal({ title, onClose = () => {}, children, wide, fullscreen, T }) {
  // Drag/resize supprimé (cause re-renders)  -  Modal centré fixe
  const overlayRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    playSound("notif");

    // Protection contre les blocages : forcer la fermeture après 5 minutes
    const timeoutId = setTimeout(() => {
      console.warn("Modal forcée à se fermer après timeout (5min)");
      try { onClose(); } catch(e) { console.error("Erreur lors de la fermeture forcée:", e); }
    }, 300000); // 5 minutes

    return () => {
      document.body.style.overflow = prev;
      clearTimeout(timeoutId);
    };
  }, [onClose]);

  const handleOverlayClick = useCallback((e) => {
    try {
      if (e.target === overlayRef.current) {
        onClose();
      }
    } catch(error) {
      console.error("Erreur lors de la fermeture modal:", error);
      // Fallback : forcer la fermeture
      setTimeout(() => {
        try { onClose(); } catch(_) {}
      }, 100);
    }
  }, [onClose]);

  const handleCloseClick = useCallback((e) => {
    e.stopPropagation();
    try {
      onClose();
    } catch(error) {
      console.error("Erreur lors de la fermeture modal:", error);
    }
  }, [onClose]);

  const modalStyle = fullscreen
    ? { width: "100%", height: "100vh", borderRadius: 0 }
    : { width: wide ? "min(900px, 96vw)" : "min(560px, 96vw)", maxWidth: "96vw", maxHeight: "90vh" };

  return (
    <div
      ref={overlayRef}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: fullscreen ? 0 : 16 }}
      onMouseDown={handleOverlayClick}
    >
      <div
        className="gc-modal-in"
        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: fullscreen ? 0 : 16, display: "flex", flexDirection: "column", boxShadow: "0 32px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(196,30,58,0.15), inset 0 1px 0 rgba(255,255,255,0.06)", overflow: "hidden", ...modalStyle }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: `linear-gradient(90deg, ${T.surface2}, ${T.surface})`, userSelect: "none" }}>
          <h3 style={{ color: "#C41E3A", margin: 0, fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, textShadow: "0 0 12px rgba(196,30,58,0.3)" }}>{title}</h3>
          <button onClick={handleCloseClick} style={{ background: T.surface3, border: `1px solid ${T.border}`, color: T.textMuted, cursor: "pointer", borderRadius: 8, padding: "5px 13px", fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20, minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export const Tabs = ({ tabs, active, onChange, T }) => (
  <div className="gc-tabs-scroll" style={{ display: "flex", gap: 2, background: T.surface2, borderRadius: 10, padding: 4, flexWrap: "nowrap", overflowX: "auto", marginBottom: 14, boxShadow: "inset 0 1px 4px rgba(0,0,0,0.2)", WebkitOverflowScrolling: "touch", scrollbarWidth: "thin" }}>
    {tabs.map((t) => (
      <button key={t.id} onClick={() => { onChange(t.id); playSound("notif"); }} style={{ background: active === t.id ? "linear-gradient(135deg,#C41E3A,#A01028)" : "transparent", color: active === t.id ? "#fff" : T.textMuted, border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", boxShadow: active===t.id ? "0 2px 12px rgba(196,30,58,0.4)" : "none", transform: active===t.id ? "translateY(-1px)" : "none", transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <span style={{ filter: active===t.id ? "drop-shadow(0 0 4px rgba(255,255,255,0.5))" : "none" }}>{t.icon}</span>
        <span>{t.label}</span>
        {t.count > 0 && <span style={{ background: active === t.id ? "rgba(255,255,255,0.25)" : "#C41E3A22", color: active===t.id ? "#fff" : "#C41E3A", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>{t.count}</span>}
      </button>
    ))}
  </div>
);

export const SmartBanner = React.memo(function SmartBanner({
  localUser, systemMsgs, dossiers, taches, rdvs, pendingApprovals,
  pendingConnections, pendingAccountActions, demandesData,
  setActiveModule, T, procColors,
}) {
  const [closed, setClosed] = useState(() => {
    try { return !!_lsGet(`gc-smartbanner:${localUser?.id}:${new Date().toDateString()}`); }
    catch (_) { return false; }
  });
  const [idx, setIdx] = useState(0);

  // -- Calcul WelcomeItems --------------------------------------------------
  const now = new Date();
  const h = now.getHours();
  const greetWord = h<6?"Bonne nuit":h<12?"Bonjour":h<18?"Bon après-midi":"Bonsoir";
  const greetEmoji = h<6?"🌙":h<12?"🌅":h<17?"☀️":"🌆";
  const firstName = (localUser.name||"").split(" ").slice(-1)[0];
  const procAccentBanner = procColors?.[localUser.processes?.[0]||localUser.process] || "#C41E3A";

  const myProcs = localUser.processes||[localUser.process];
  const uid = localUser.id;
  const lvl = localUser.level;
  const todayStr = now.toISOString().split("T")[0];
  const urgentDoss = (dossiers||[]).filter(d=>d.priority==="HAUTE"&&d.status!=="TERMINE"&&(lvl>=4||(localUser?.isAdmin || localUser?.level >= 6)||d.assignedTo===uid||(lvl>=3&&myProcs.includes(d.process)))).length;
  const urgentTach = (taches||[]).filter(t=>t.priority==="HAUTE"&&_tActive(t)&&((t.assignedTo===uid||t.assigneeId===uid)||lvl>=4)).length;
  const todayRdvs = (rdvs||[]).filter(r=>r.date===todayStr&&(lvl>=4||r.assignedTo===uid)).length;
  const pendingApprCount = lvl>=3 ? (pendingApprovals||[]).filter(a=>!["APPROUVE","REJETE"].includes(a.status)).length : 0;
  const pendingConnCount = lvl>=4 ? (pendingConnections||[]).length : 0;
  const pendingActCount = (lvl>=5||(localUser?.isAdmin || localUser?.level >= 6)) ? (pendingAccountActions||[]).filter(a=>a.status==="EN_ATTENTE_DG").length : 0;
  const demandesCount = lvl>=3 ? (demandesData||[]).filter(d=>d.status==="EN_ATTENTE"&&(lvl>=5||(localUser?.isAdmin || localUser?.level >= 6)||myProcs.includes(d.targetProcess)||d.targetUserId===uid)).length : 0;

  const welcomeItems = [
    urgentDoss>0   && {text:`🚨 ${urgentDoss} dossier(s) URGENT(S) à traiter`, color:"#C41E3A", action:"dossiers"},
    urgentTach>0   && {text:`⚡ ${urgentTach} tâche(s) haute priorité`, color:"#EF4444", action:"taches"},
    todayRdvs>0    && {text:`📅 ${todayRdvs} rendez-vous aujourd'hui`, color:"#06B6D4", action:"agenda"},
    pendingConnCount>0 && {text:`🔗 ${pendingConnCount} demande(s) de connexion à approuver`, color:"#F59E0B", action:"gestion_comptes"},
    pendingActCount>0  && {text:`🔑 ${pendingActCount} action(s) compte en attente DG`, color:"#F97316", action:"gestion_comptes"},
    pendingApprCount>0 && {text:`👤 ${pendingApprCount} approbation(s) en attente`, color:"#A855F7", action:"approbations"},
    demandesCount>0    && {text:`📨 ${demandesCount} demande(s) collaborateur à traiter`, color:"#3B82F6", action:"demandes"},
    urgentDoss===0&&urgentTach===0&&todayRdvs===0&&pendingConnCount===0 && {text:"✅ Tout est à jour — aucune urgence. Belle journée !", color:"#22C55E"},
  ].filter(Boolean);

  // -- Calcul message système — sélection contextuelle ─────────────────────
  const sysMsgs = (systemMsgs||[]).filter(m=> {
    if (!(!m.minLevel||lvl>=m.minLevel)) return false;
    if (!(!m.maxLevel||lvl<=m.maxLevel)) return false;
    // Filtrer par type si défini
    if (m.type === "onboarding" && !localUser?.isFirstLogin) return false;
    if (m.type === "dg_info" && lvl < 5) return false;
    if (m.type === "role_info" && lvl !== 4) return false;
    // Masquer les messages sécurité si déjà vu (password changé)
    if (m.type === "security" && !localUser?.isFirstLogin) return false;
    return true;
  });
  const sysMsg = sysMsgs[0] || null;

  // -- Décision d'affichage -------------------------------------------------
  const hasWelcome = true; // toujours une salutation
  const hasSys = sysMsgs.length > 0;
  const slides = [
    { type:"welcome" },
    ...(sysMsgs.map(m => ({ type:"sys", msg: m }))),
  ];
  const count = slides.length;

  // Rotation isolée (setInterval confiné ici  -  ne fait re-render que SmartBanner)
  useEffect(() => {
    if (count <= 1 || closed) return;
    const t = setInterval(() => setIdx(i => (i+1)%count), 5000);
    return () => clearInterval(t);
  }, [count, closed]);

  const dismiss = () => {
    setClosed(true);
    try { _lsSet(`gc-smartbanner:${localUser.id}:${new Date().toDateString()}`,"1"); } catch(_) {}
  };

  if (closed) return null;

  const current = slides[idx % count];
  const currentSysMsg = current.type === "sys" ? (current.msg || sysMsg) : null;
  const accentColor = current.type === "sys" ? (currentSysMsg?.color||"#3B82F6") : procAccentBanner;

  return (
    <div style={{
      background:`linear-gradient(135deg,${accentColor}18,${accentColor}08)`,
      border:`1.5px solid ${accentColor}55`,
      borderRadius:14,
      padding: current.type === "sys" ? "12px 16px 12px 20px" : "12px 16px",
      marginBottom:14,
      position:"relative", overflow:"hidden",
      animation:"gc-slide-down 0.4s cubic-bezier(0.22,1,0.36,1) both",
      transition:"background 0.5s, border-color 0.5s, padding 0.3s",
    }}>
      {/* Barre couleur gauche — uniquement pour les messages système, pas pour la salutation */}
      {current.type === "sys" && (
        <div style={{position:"absolute",left:0,top:0,bottom:0,width:4,background:accentColor,borderRadius:"4px 0 0 4px",transition:"background 0.5s"}}/>
      )}

      {/* Bouton fermer — à droite sans chevaucher l'indicateur de période */}
      <button onClick={dismiss} title="Fermer"
        style={{position:"absolute",top:6,right:8,background:"none",border:"none",
                color:accentColor+"99",cursor:"pointer",fontSize:13,lineHeight:1,zIndex:2,
                transition:"color 0.2s,transform 0.2s",padding:"3px 5px",borderRadius:4}}
        onMouseEnter={e=>{e.currentTarget.style.color=accentColor;e.currentTarget.style.transform="rotate(90deg)";}}
        onMouseLeave={e=>{e.currentTarget.style.color=accentColor+"99";e.currentTarget.style.transform="rotate(0deg)";}}>✕</button>

      {/* Indicateur de slide (si 2 slides) — décalé vers le bas pour ne pas chevaucher le X */}
      {count > 1 && (
        <div style={{position:"absolute",top:24,right:10,display:"flex",gap:4}}>
          {slides.map((_,i)=>(
            <button key={i} onClick={()=>setIdx(i)}
              style={{width:i===idx%count?14:6,height:6,borderRadius:3,
                      background:i===idx%count?accentColor:accentColor+"44",
                      border:"none",cursor:"pointer",transition:"all 0.3s",padding:0}}/>
          ))}
        </div>
      )}

      {current.type === "welcome" ? (
        /* -- Slide WELCOME -- */
        <div>
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:welcomeItems.length>0?9:0}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:localUser.color,
                         display:"flex",alignItems:"center",justifyContent:"center",
                         fontSize:15,color:"#fff",fontWeight:800,overflow:"hidden",flexShrink:0,
                         boxShadow:`0 0 12px ${accentColor}55`,border:`2px solid ${accentColor}44`}}>
              {localUser.photoUrl
                ? <img src={localUser.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                : localUser.avatar}
            </div>
            <div style={{flex:1}}>
              <div style={{color:T.text,fontWeight:900,fontSize:13}}>
                {greetWord}, {firstName} ! {greetEmoji}
              </div>
              <div style={{color:T.textMuted,fontSize:10,marginTop:1}}>
                {now.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}
                &nbsp;·&nbsp;Niv.{lvl} — {localUser.process}
              </div>
            </div>
            <div style={{background:accentColor+"22",border:`1px solid ${accentColor}44`,
                         borderRadius:8,padding:"4px 10px",textAlign:"center",flexShrink:0,marginRight:26}}>
              <div style={{color:accentColor,fontWeight:800,fontSize:9}}>
                {h<12?"MATIN":h<14?"MIDI":h<17?"APRÈS-MIDI":"SOIRÉE"}
              </div>
              <div style={{color:T.textMuted,fontSize:8}}>{localUser.role?.slice(0,18)||"Collaborateur"}</div>
            </div>
          </div>
          {welcomeItems.length > 0 && (
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {welcomeItems.map((item,i)=>(
                <div key={i} onClick={()=>item.action&&setActiveModule(item.action)}
                  style={{background:item.color+"18",border:`1px solid ${item.color}33`,
                          borderRadius:8,padding:"5px 10px",color:item.color,
                          fontSize:11,fontWeight:600,cursor:item.action?"pointer":"default",
                          display:"flex",alignItems:"center",gap:8,transition:"background 0.15s"}}
                  onMouseEnter={e=>{if(item.action)e.currentTarget.style.background=item.color+"28";}}
                  onMouseLeave={e=>{if(item.action)e.currentTarget.style.background=item.color+"18";}}>
                  <span style={{flex:1}}>{item.text}</span>
                  {item.action&&<span style={{fontSize:9,opacity:0.6}}>→</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* -- Slide SYSTÈME -- */
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <span style={{fontSize:20,marginLeft:6,flexShrink:0,marginTop:1}}>{currentSysMsg?.icon||"📢"}</span>
          <div style={{flex:1,minWidth:0}}>
            {currentSysMsg?.title&&(
              <div style={{color:currentSysMsg.color||accentColor,fontSize:11,fontWeight:800,marginBottom:3}}>{currentSysMsg.title}</div>
            )}
            <div style={{color:T.text,fontSize:11,lineHeight:1.4}}>
              {currentSysMsg?.text||currentSysMsg?.msg||""}
            </div>
            {(currentSysMsg?.author||currentSysMsg?.source)&&(
              <div style={{color:T.textDim,fontSize:9,marginTop:4}}>
                📌 {currentSysMsg.author||currentSysMsg.source}
                {currentSysMsg.createdAt&&" · "+new Date(currentSysMsg.createdAt).toLocaleDateString("fr-FR")}
              </div>
            )}
          </div>
          {(currentSysMsg?.module||currentSysMsg?.action)&&(
            <button onClick={()=>setActiveModule(currentSysMsg.module||currentSysMsg.action)}
              style={{background:accentColor+"22",border:`1px solid ${accentColor}44`,color:accentColor,
                      borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:9,fontWeight:700,flexShrink:0,marginTop:2}}>
              Voir →
            </button>
          )}
        </div>
      )}
    </div>
  );
});

/* --- RotatingAlert : alerte dashboard isolée (anti-scintillement) --------- */
export const RotatingAlert = React.memo(function RotatingAlert({ alerts, setActiveModule, T }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (alerts.length <= 1) { setIdx(0); return; }
    const t = setInterval(() => setIdx(i => (i + 1) % alerts.length), 3500);
    return () => clearInterval(t);
  }, [alerts.length]);
  if (!alerts || alerts.length === 0) return null;
  const a = alerts[idx % alerts.length];
  return (
    <div onClick={() => a.action && setActiveModule(a.action)}
      style={{background:a.color+"22",border:`1px solid ${a.color}55`,borderRadius:9,
              padding:"8px 14px",display:"flex",alignItems:"center",gap:10,
              marginBottom:14,cursor:a.action?"pointer":"default",transition:"background 0.3s"}}>
      <span style={{fontSize:16}}>{a.icon}</span>
      <span style={{color:T.text,fontSize:12,flex:1}}>
        <strong style={{color:a.color}}>[{a.type}]</strong> {a.message}
      </span>
      <span style={{color:a.color,fontSize:10,fontWeight:700}}>→</span>
      {alerts.length > 1 && (
        <span style={{color:"#7A90B0",fontSize:9}}>{(idx%alerts.length)+1}/{alerts.length}</span>
      )}
    </div>
  );
});


// ══════════════════════════════════════════════════════════════════════════════

/**
 * UserAvatar — cercle avec photo ou initiales colorées selon le niveau.
 * Props : user (objet user), size (px, défaut 32), style (overrides)
 */
export function UserAvatar({ user, size = 32, style: s = {}, onClick }) {
  if (!user) return null;
  const initials = user.avatar || gcUserInitials(user.name);
  const bg       = user.color  || gcUserColor(user.level ?? 2);
  const fontSize = size <= 24 ? 9 : size <= 36 ? 11 : 13;
  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: "50%", background: bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize, color: "#fff", fontWeight: 700, flexShrink: 0,
        overflow: "hidden", cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        ...s,
      }}
    >
      {user.photoUrl
        ? <img src={user.photoUrl} alt={user.name || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initials}
    </div>
  );
}
