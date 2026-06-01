import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDialog } from '../components/Dialog.jsx';
import { FileUploader, SingleFileUploader } from '../components/FileUploader.jsx';
// Auth — CoverPage, LoginPage, CreateAccount, Profile
// SI Génie Consultant v10.5
import { _lsGet, _lsSet, dsSave, _noop, _activeUser, gcPushNotif, playSound, generateAccessCode, gcFileSave, gcVerifyPassword, gcVerifyAdmin, gcHashPassword, gcViewDoc, formatDateTime, generateCaptcha, gcDownloadDoc, gcReadFile, getProxyUrl } from '../core/index.js';
import { gcToast } from './ToastManager.jsx';
import { USER_FUNCTIONS, INITIAL_MESSAGES } from '../core/constants.js';
import { Btn, InputField, SelectField, Modal, NationaliteField, Badge} from './UI.jsx';
export function NotificationCenter({ notifications=[], setNotifications=_noop, T, onNavigate=_noop, currentUser }){
  // ── Upload fichiers via gcFileStore (IndexedDB + serveur) ──────────
  const _uploadFiles = async (fileList, extraMeta = {}) => {
    const items = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    const results = [];
    for (const file of items) {
      try {
        const ref = await gcFileSave(file, {
          module: 'auth',
          nom: file.name, taille: file.size, type: file.type,
          uploadedBy: currentUser?.id || 'anonymous', uploadedByName: currentUser?.name || 'Inconnu',
          ...extraMeta});
        results.push({
          ...ref, name: file.name, size: file.size, mimeType: file.type,
          sizeStr: file.size < 1048576 ? `${Math.round(file.size/1024)} Ko` : `${(file.size/1048576).toFixed(1)} Mo`,
          ext: '.' + file.name.split('.').pop().toLowerCase(),
          uploadedAt: new Date().toISOString(), downloads: 0});
      } catch(e) { console.error('[upload auth]', file.name, e.message); }
    }
    return results;
  };

  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);


  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const unread = notifications.filter((n) => !n.read && !n.dismissed).length;
  const visible = notifications.filter(n => !n.dismissed);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (open && containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setExpandedId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markReadOnAction = (id) => {
    if (setNotifications) setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };
  const markAllRead = () => {
    if (setNotifications) setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };
  const dismiss = (id) => {
    if (setNotifications) setNotifications(prev => prev.filter(n => n.id !== id));
  };
  const dismissAll = async () => {
    if(await gcConfirm("🗑️ Vider toutes les notifications ?")) {
      if (setNotifications) setNotifications([]);
    }
  };
  const clearRead = () => {
    if (setNotifications) setNotifications(prev => prev.filter(n => !n.read));
  };

  const getActions = (n) => {
    const msg = n.message.toLowerCase();
    const actions = [];
    if (msg.includes("archiv")) {
      actions.push({ label: "🗂️ Ouvrir l'archivage", color: "#F59E0B", mod: "archivage" });
    }
    if (msg.includes("validation") || msg.includes("valider") || msg.includes("dossier")) {
      actions.push({ label: "📁 Voir les dossiers", color: "#3B82F6", mod: "dossiers" });
    }
    if (msg.includes("approbation") || msg.includes("approuver") || msg.includes("appro") || msg.includes("compte") || msg.includes("création compte") || msg.includes("demande compte")) {
      actions.push({ label: "✅ Gérer les approbations", color: "#A855F7", mod: "approbations" });
    }
    if (msg.includes("rdv") || msg.includes("rendez-vous")) {
      actions.push({ label: "📅 Ouvrir l'agenda", color: "#06B6D4", mod: "agenda" });
    }
    if (msg.includes("tâche") || msg.includes("tache")) {
      actions.push({ label: "📋 Voir mes tâches", color: "#F59E0B", mod: "taches" });
    }
    if (msg.includes("message") || msg.includes("messagerie")) {
      actions.push({ label: "✉️ Ouvrir la messagerie", color: "#EC4899", mod: "messaging" });
    }
    if (msg.includes("référence") || msg.includes("codif") || msg.includes("🏷️")) {
      actions.push({ label: "🏷️ Voir les codifications", color: "#C41E3A", mod: "codification" });
    }
    if (msg.includes("audit") || msg.includes("contrôle")) {
      actions.push({ label: "🔍 Module Indicateurs", color: "#EF4444", mod: "indicateurs" });
    }
    if (msg.includes("processus")) {
      actions.push({ label: "🗺️ Voir les processus", color: "#A855F7", mod: "processus" });
    }
    if (msg.includes("session") || msg.includes("connexion") || msg.includes("tentative") || msg.includes("suspendu") || msg.includes("bloqué") || msg.includes("hors horaire") || msg.includes("avant horaire")) {
      actions.push({ label: "🔐 Sessions & Alertes", color: "#3B82F6", mod: "taches" });
    }
    if (msg.includes("dossier") || msg.includes("document") || msg.includes("fichier")) {
      actions.push({ label: "📁 Ouvrir les dossiers", color: "#3B82F6", mod: "dossiers" });
    }
    if (msg.includes("gestion") && msg.includes("compte")) {
      actions.push({ label: "👤 Gestion des Comptes", color: "#F97316", mod: "gestion_comptes" });
    }
    if (msg.includes("circuit") || msg.includes("approbation") && (msg.includes("compte") || msg.includes("collaborateur"))) {
      actions.push({ label: "🔄 Circuits d'Approbation", color: "#C41E3A", mod: "gestion_comptes" });
    }
    actions.push({ label: "✓ Marquer comme lu", color: "#7A90B0", markRead: true });
    return actions;
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* Anneau de pulsation visible quand notifications non lues */}
        {unread > 0 && !open && (
          <span className="gc-notif-ring" style={{
            position: "absolute", inset: -4, borderRadius: 12,
            border: "2px solid #C41E3A", pointerEvents: "none", zIndex: 1,
          }} />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(!open); if (open) setExpandedId(null); }}
          className={unread > 0 && !open ? "gc-bell-shake" : ""}
          style={{ background: unread > 0 ? "#C41E3A18" : T.surface2, border: `1px solid ${unread > 0 ? "#C41E3A66" : T.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: unread > 0 ? "#C41E3A" : T.textMuted, transition: "background 0.2s, border-color 0.2s, color 0.2s", position: "relative", zIndex: 2 }}
        >
          🔔
        </button>
        {unread > 0 && (
          <span style={{ position: "absolute", top: -6, right: -6, background: "#C41E3A", color: "#fff", borderRadius: "50%", minWidth: 18, height: 18, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, padding: "0 3px", boxShadow: "0 2px 6px rgba(196,30,58,0.5)", zIndex: 10, pointerEvents: "none", border: "1.5px solid #0a1628" }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 42, width: 400, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 16px 48px #0009", zIndex: 600, maxHeight: 520, overflowY: "auto" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: T.surface, zIndex: 1 }}>
            <span style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>🔔 Notifications <Badge label={`${unread}`} color="#C41E3A" small /></span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {unread > 0 && <button onClick={markAllRead} style={{ background: "#3B82F622", border: "1px solid #3B82F644", borderRadius: 6, padding: "3px 8px", color: "#3B82F6", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>✓ Tout lire</button>}
              {visible.length > 0 && <button onClick={clearRead} style={{ background: "#F59E0B22", border: "1px solid #F59E0B44", borderRadius: 6, padding: "3px 8px", color: "#F59E0B", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>🧹 Lus</button>}
              {visible.length > 0 && <button onClick={dismissAll} title="Vider tout" style={{ background: "#C41E3A22", border: "1px solid #C41E3A44", borderRadius: 6, padding: "3px 8px", color: "#C41E3A", cursor: "pointer", fontSize: 11 }}>🗑️</button>}
            </div>
          </div>
          {visible.length === 0 && <div style={{ padding: 28, textAlign: "center", color: T.textMuted, fontSize: 12 }}>✓ Aucune notification — vous êtes à jour</div>}
          {visible.map((n) => (
            <div key={n.id} style={{ borderBottom: `1px solid ${T.border}20`, background: n.read ? "transparent" : "#C41E3A06" }}>
              {/* Clicking the row opens expanded but does NOT mark as read */}
              <div
                onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                style={{ padding: "11px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{n.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.text, fontSize: 12, fontWeight: n.read ? 400 : 700, lineHeight: 1.4 }}>{n.message}</div>
                  <div style={{ color: T.textMuted, fontSize: 10, marginTop: 3 }}>{formatDateTime(n.at)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  {!n.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#C41E3A" }} />}
                  <button onClick={(e) => { e.stopPropagation(); dismiss(n.id); }} title="Supprimer" style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 12, padding: "2px 4px", opacity: 0.6 }}>🗑️</button>
                  <span style={{ color: T.textDim, fontSize: 11 }}>{expandedId === n.id ? "▲" : "▼"}</span>
                </div>
              </div>
              {/* Expanded actions — clicking an action MARKS AS READ */}
              {expandedId === n.id && (
                <div style={{ padding: "0 14px 12px 42px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {getActions(n).map((a, i) => (
                    <button key={i} onClick={() => {
                      if (a.markRead) {
                        markReadOnAction(n.id); setExpandedId(null);
                      } else {
                        markReadOnAction(n.id);
                        if (onNavigate) onNavigate(a.mod);
                        setOpen(false); setExpandedId(null);
                      }
                    }} style={{ background: a.color + "22", border: `1px solid ${a.color}55`, borderRadius: 6, padding: "5px 10px", color: a.color, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export function CoverPage({ onAdminKey, onUserLogin, T, toggleTheme, themeMode, siLogoUrl, siAppearance }) {

  const keysPressed = useRef(new Set());
  const [clock, setClock] = useState(new Date());
  const [hoverBtn, setHoverBtn] = useState(false);
  const [unlockAnim, setUnlockAnim] = useState(false);

  useEffect(() => {
    const ti = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(ti);
  }, []);

  const handleUnlock = useCallback(() => {
    setUnlockAnim(true);
    playSound("success");
    setTimeout(() => { setUnlockAnim(false); onUserLogin(); }, 600);
  }, [onUserLogin]);

  const handleAdminKey = useCallback(() => {
    playSound("alarm");
    onAdminKey();
  }, [onAdminKey]);

  useEffect(() => {
    const down = (e) => {
      keysPressed.current.add(e.code);
      if (keysPressed.current.has("ControlRight") && keysPressed.current.has("ShiftRight") && e.code === "Enter") {
        e.preventDefault(); handleAdminKey();
      }
      if (e.code === "Enter" && !keysPressed.current.has("ControlRight") && !keysPressed.current.has("ShiftRight")) {
        handleUnlock();
      }
      if (e.code === "Space" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "BUTTON") {
        e.preventDefault(); handleUnlock();
      }
    };
    const up = (e) => keysPressed.current.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [handleUnlock, handleAdminKey]);

  const isDark = themeMode !== "light";
  const appName = siAppearance?.cabinetName || "GÉNIE CONSULTANT";
  const appSlogan = siAppearance?.cabinetSlogan || "Excellence · Intégrité · Performance";
  const primaryCol = siAppearance?.primaryColor || "#C41E3A";
  const goldCol = siAppearance?.goldColor || "#C9A84C";

  const clockH = clock.getHours().toString().padStart(2,"0");
  const clockM = clock.getMinutes().toString().padStart(2,"0");
  const clockS = clock.getSeconds().toString().padStart(2,"0");
  const dateStr = clock.toLocaleDateString("fr-FR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });

  const particles = Array.from({length: 20}, (_, i) => ({
    id: i,
    size: 2 + (i % 4),
    left: (i * 5.3 + 2) % 100,
    duration: 8 + (i % 12),
    delay: (i * 0.7) % 8,
    color: i % 3 === 0 ? primaryCol : i % 3 === 1 ? goldCol : "#3B82F6"}));

  return (
    <div style={{
      position: "fixed", inset: 0,
      width: "100vw", height: "100vh",
      background: isDark
        ? "radial-gradient(ellipse at 30% 70%, #0D1F42 0%, #050D1A 50%, #0A0818 100%)"
        : "radial-gradient(ellipse at 30% 70%, #D8E4F5 0%, #EEF2F9 50%, #E6EBF5 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      transition: "background 0.5s"}}>

      {/* ── PARTICLES ── */}
      {particles.map(p => (
        <div key={p.id} className="gc-particle" style={{
          width: p.size, height: p.size,
          left: `${p.left}%`,
          background: p.color,
          opacity: 0.5,
          animationDuration: `${p.duration}s`,
          animationDelay: `${p.delay}s`}} />
      ))}

      {/* ── SCAN LINE ── */}
      <div style={{
        position: "absolute", left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${primaryCol}66, ${primaryCol}, ${primaryCol}66, transparent)`,
        animation: "gc-cover-scan 5s linear infinite",
        zIndex: 2, pointerEvents: "none"}} />

      {/* ── TOP ACCENT BAR ── */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, #0A1E4A, ${primaryCol}, ${goldCol}, ${primaryCol}, #0A1E4A)`, zIndex: 10 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, #0A1E4A, ${primaryCol}, ${goldCol}, ${primaryCol}, #0A1E4A)`, zIndex: 10 }} />

      {/* ── GRID BACKGROUND ── */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: isDark
          ? `linear-gradient(${primaryCol}08 1px, transparent 1px), linear-gradient(90deg, ${primaryCol}08 1px, transparent 1px)`
          : `linear-gradient(${primaryCol}0A 1px, transparent 1px), linear-gradient(90deg, ${primaryCol}0A 1px, transparent 1px)`,
        backgroundSize: "60px 60px"}} />

      {/* ── ORBITAL DECORATIONS ── */}
      <div style={{ position: "absolute", top: "10%", right: "8%", width: 180, height: 180, opacity: isDark ? 0.15 : 0.08, zIndex: 1, pointerEvents: "none" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", border: `1px solid ${primaryCol}`, position: "absolute" }} />
        <div style={{ width: "70%", height: "70%", borderRadius: "50%", border: `1px dashed ${goldCol}`, position: "absolute", top: "15%", left: "15%", animation: "gc-cover-spin 20s linear infinite" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: primaryCol, position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "gc-cover-orbit 8s linear infinite" }} />
      </div>
      <div style={{ position: "absolute", bottom: "8%", left: "5%", width: 120, height: 120, opacity: isDark ? 0.12 : 0.07, zIndex: 1, pointerEvents: "none" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", border: `1px solid ${goldCol}`, position: "absolute" }} />
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: goldCol, position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "gc-cover-orbit 12s linear infinite reverse" }} />
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ position: "relative", zIndex: 5, textAlign: "center", width: "100%", maxWidth: 1100, padding: "0 48px" }}>

        {/* CLOCK + DATE — top section */}
        <div style={{ marginBottom: 32, marginTop: "clamp(24px, 5vh, 64px)" }}>
          <div style={{
            display: "inline-flex", alignItems: "baseline", gap: 4,
            fontFamily: "'Courier New', monospace",
            fontSize: "clamp(48px, 8vw, 96px)",
            fontWeight: 900, letterSpacing: -2,
            color: isDark ? "#E8EDF5" : "#0A1628",
            textShadow: isDark ? `0 0 40px ${primaryCol}44` : "none",
            animation: "gc-cover-float 4s ease-in-out infinite"}}>
            <span style={{ color: primaryCol }}>{clockH}</span>
            <span style={{ color: isDark ? "#3A5070" : "#8090B0", animation: "gc-cover-blink 2s step-end infinite" }}>:</span>
            <span>{clockM}</span>
            <span style={{ color: isDark ? "#3A5070" : "#8090B0", animation: "gc-cover-blink 2s step-end infinite 0.5s" }}>:</span>
            <span style={{ fontSize: "clamp(24px, 4vw, 48px)", color: isDark ? "#2A3A55" : "#6080A8" }}>{clockS}</span>
          </div>
          <div style={{ color: isDark ? "#3A5070" : "#6080A0", fontSize: "clamp(11px, 1.5vw, 14px)", letterSpacing: 3, textTransform: "uppercase", marginTop: 4, fontWeight: 600 }}>
            {dateStr}
          </div>
        </div>

        {/* MAIN CARD */}
        <div style={{
          background: isDark
            ? "linear-gradient(135deg, rgba(10,22,40,0.95), rgba(15,28,52,0.9))"
            : "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(240,245,255,0.92))",
          border: `1px solid ${isDark ? primaryCol+"33" : primaryCol+"44"}`,
          borderRadius: 24,
          padding: "clamp(28px, 4vw, 52px) clamp(32px, 5vw, 72px)",
          boxShadow: isDark
            ? `0 32px 100px #00000080, 0 0 0 1px ${primaryCol}22, inset 0 1px 0 rgba(255,255,255,0.05)`
            : `0 32px 100px rgba(10,30,74,0.15), 0 0 0 1px ${primaryCol}18`,
          backdropFilter: "blur(20px)",
          position: "relative", overflow: "hidden"}}>
          {/* Inner glow */}
          <div style={{ position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, ${primaryCol}15 0%, transparent 70%)`, pointerEvents: "none" }} />

          {/* Logo + Title */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{
              width: "clamp(64px,8vw,96px)", height: "clamp(64px,8vw,96px)",
              borderRadius: "50%",
              background: `linear-gradient(135deg, #0A1E4A, #1A3A7A)`,
              border: `3px solid ${primaryCol}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 24px ${primaryCol}55`,
              overflow: "hidden", flexShrink: 0,
              animation: "gc-cover-glow 3s ease-in-out infinite"}}>
              {siLogoUrl
                ? <img src={siLogoUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: "clamp(28px,4vw,42px)" }}>⚖</span>
              }
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: primaryCol, fontSize: "clamp(9px,1.2vw,11px)", fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", marginBottom: 6 }}>
                Cabinet Juridique & d'Affaires · Libreville, Gabon
              </div>
              <h1 style={{
                color: isDark ? "#E8EDF5" : "#0A1628",
                fontSize: "clamp(22px,4vw,44px)",
                fontWeight: 900, margin: 0, letterSpacing: -1, lineHeight: 1.1,
                textAlign: "center"}}>{appName}</h1>
              <div style={{ color: goldCol, fontSize: "clamp(11px,1.5vw,15px)", fontStyle: "italic", marginTop: 6, fontWeight: 500, textAlign: "center" }}>
                « {appSlogan} »
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: "100%", height: 1, background: `linear-gradient(90deg, transparent, ${primaryCol}66, transparent)`, margin: "16px 0" }} />

          {/* System info row */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
            {[
              { label: "Système d'Information Intégré", color: isDark ? "#3B82F6" : "#1A5AAA" },
              { label: "Version 10.5 / 2026", color: goldCol },
              { label: "DOC-A01-SI.v40.0/2026", color: isDark ? "#22C55E" : "#166A30" },
              { label: "🔒 CONFIDENTIEL", color: primaryCol },
            ].map(b => (
              <span key={b.label} style={{ background: b.color+"18", border: `1px solid ${b.color}44`, borderRadius: 20, padding: "3px 12px", color: b.color, fontSize: "clamp(9px,1vw,11px)", fontWeight: 700 }}>{b.label}</span>
            ))}
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { icon: "🏛️", title: "6 Niveaux", sub: "d'habilitation" },
              { icon: "⚙️", title: "13 Processus", sub: "internes intégrés" },
              { icon: "🔐", title: "Authentification", sub: "sécurisée CAPTCHA" },
            ].map(c => (
              <div key={c.title} style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(10,30,74,0.05)", border: `1px solid ${isDark?"rgba(255,255,255,0.06)":primaryCol+"18"}`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: "clamp(18px,2.5vw,26px)", marginBottom: 4 }}>{c.icon}</div>
                <div style={{ color: isDark ? "#C0CDE0" : "#0A1628", fontSize: "clamp(11px,1.2vw,13px)", fontWeight: 700 }}>{c.title}</div>
                <div style={{ color: isDark ? "#4A6080" : "#6080A0", fontSize: "clamp(9px,1vw,11px)", marginTop: 2 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* UNLOCK BUTTON */}
          <div style={{ textAlign: "center" }}>
            <button
              className="gc-unlock-btn"
              onMouseEnter={() => setHoverBtn(true)}
              onMouseLeave={() => setHoverBtn(false)}
              onClick={handleUnlock}
              style={{
                background: unlockAnim
                  ? `linear-gradient(135deg, ${primaryCol}, #8B0000)`
                  : hoverBtn
                    ? `linear-gradient(135deg, ${primaryCol}, #A01030)`
                    : `linear-gradient(135deg, #8B0000, ${primaryCol})`,
                border: "none", borderRadius: 50, padding: "clamp(14px,2vw,20px) clamp(40px,5vw,80px)",
                color: "#fff",
                fontSize: "clamp(13px,1.5vw,16px)",
                fontWeight: 800, letterSpacing: 2,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 12,
                transform: unlockAnim ? "scale(0.95)" : hoverBtn ? "scale(1.04)" : "scale(1)",
                transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
                boxShadow: hoverBtn ? `0 12px 40px ${primaryCol}66` : `0 6px 24px ${primaryCol}44`}}
            >
              <span style={{ fontSize: "clamp(16px,2vw,20px)" }}>{unlockAnim ? "✅" : "🔓"}</span>
              {unlockAnim ? "ACCÈS EN COURS…" : "ACCÉDER AU SYSTÈME"}
            </button>
            <div style={{ color: isDark ? "#2A3A50" : "#8090A8", fontSize: "clamp(9px,1vw,11px)", marginTop: 10, letterSpacing: 1 }}>
              Appuyez sur <kbd style={{ background: isDark ? "#162540" : "#E0E8F4", border: `1px solid ${isDark?"#1E3A5F":"#BBC9E0"}`, borderRadius: 4, padding: "1px 6px", fontSize: 10, color: isDark ? "#6080A0" : "#3A5070" }}>Entrée</kbd> ou <kbd style={{ background: isDark ? "#162540" : "#E0E8F4", border: `1px solid ${isDark?"#1E3A5F":"#BBC9E0"}`, borderRadius: 4, padding: "1px 6px", fontSize: 10, color: isDark ? "#6080A0" : "#3A5070" }}>Espace</kbd> pour accéder
            </div>
          </div>
        </div>

        {/* Habilitation levels */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 20, opacity: 0.7 }}>
          {[["6","Direction SI","#C41E3A"],["5","Direction","#C9A84C"],["4","Managers","#A855F7"],["3","Responsables","#3B82F6"],["2","Opérationnels","#22C55E"],["1","Exécutants","#7A90B0"]].map(([lv,lb,cl])=>(
            <div key={lv} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ width:18, height:18, borderRadius:4, background:cl+"25", border:`1px solid ${cl}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:cl, fontWeight:800 }}>{lv}</div>
              <span style={{ color: isDark?"#2A3A50":"#7A8A9A", fontSize:9 }}>{lb}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ color: isDark?"#1A2A3A":"#9AAABB", fontSize: "clamp(9px,1vw,11px)", marginTop: 14, letterSpacing: 0.8 }}>
          Avenue Pierre-Louis ANGONDJO OKAWE · RCCM : Libreville 2017 A 39632 · NIF : 281535L · contact@genie-consultant.com
        </div>
      </div>

      {/* Felo_Tech copyright watermark — bas droite, discret */}
      <div style={{
        position: "absolute", bottom: 8, right: 12, zIndex: 20,
        color: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
        fontSize: 9, letterSpacing: 0.5, fontWeight: 500,
        userSelect: "none", pointerEvents: "none",
        fontFamily: "monospace"}}>
        © Felo_Tech · SI v63/2026
      </div>

      {/* Corner controls */}
      <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 8, zIndex: 20 }}>
        <button onClick={toggleTheme} title={`Mode ${isDark ? "clair" : "sombre"}`}
          style={{ background: isDark ? "rgba(10,22,40,0.8)" : "rgba(255,255,255,0.85)", border: `1px solid ${isDark?"#1E3A5F":"#BCC8E0"}`, borderRadius: 8, padding: "6px 10px", color: isDark?"#6080A0":"#3A5070", cursor: "pointer", fontSize: 14, backdropFilter: "blur(8px)" }}>
          {isDark ? "☀️" : "🌙"}
        </button>
      </div>
    </div>
  );
};

export function LoginPage(props) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);
  const { users, isAdminMode, onLogin, onCreateAccount, onBack, onAccessDemo, T, pendingConnections, setPendingConnections, isFirstTime, pendingApprovals, onSessionLog, requireConnApproval, siSystemDocs, siAppearance, siLogoUrl } = props;
  const _loginUsers0 = isAdminMode ? users.filter(u => _activeUser(u)&&u.isAdmin) : users.filter(u => _activeUser(u)&&!u.isAdmin);
  // FIX v63  -  Pré-sélectionner le compte DG s'il existe, sinon premier non-admin
  const _defaultUserId = isAdminMode
    ? "USR-ADM-000"
    : (_loginUsers0.find(u => u.id === "USR-DG-001")?.id || _loginUsers0[0]?.id || "");
  const [userId, setUserId] = useState(_defaultUserId);
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState(generateCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const [charteAccepted, setCharteAccepted] = useState({});
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [approvalCode, setApprovalCode] = useState("");
  // FIX v132 — Écouter pendingConnections + poll 5s pour détecter approbation en temps réel
  // Quand req passe à status "APPROUVE" → pré-remplir le champ code automatiquement
  const [codeReady, setCodeReady] = useState(null);
  useEffect(() => {
    const checkForApproval = (freshList) => {
      // Demande approuvée → pré-remplir le code
      const approved = (freshList||[]).find(r => r.userId === userId && r.status === "APPROUVE" && r.approvedCode);
      if (approved && awaitingApproval) {
        setApprovalCode(approved.approvedCode);
        setCodeReady(approved.approvedCode);
        return;
      }
      // FIX v132 — Demande refusée (req supprimée du LS par rejectConnection)
      // Si awaitingApproval mais plus de req pour ce user → refus probable
      // La notification LS au collaborateur l'informe, mais on peut aussi afficher une erreur
      if (awaitingApproval) {
        const myReq = (freshList||[]).find(r => r.userId === userId);
        if (!myReq) {
          // La demande a disparu sans être approuvée → probablement refusée
          // Ne pas toucher awaitingApproval ici — laisser la notif LS informer l'user
          // L'user peut lire sa notif et recommencer
        }
      }
    };
    const onStorage = (e) => {
      if (e?.key !== "gc-pending-connections") return;
      try {
        const fresh = JSON.parse(e.newValue || "[]");
        if (setPendingConnections) setPendingConnections(fresh);
        checkForApproval(fresh);
      } catch(_) {}
    };
    const poll = setInterval(() => {
      try { checkForApproval(JSON.parse(_lsGet("gc-pending-connections")||"[]")); } catch(_) {}
    }, 5000);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(poll); };
   
  }, [awaitingApproval, userId]);
  const [showDocViewer, setShowDocViewer] = useState(null);
  // FIX v63 C1  -  Rate limiting: blocage après 5 tentatives échouées
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [_lockTick, setLockTick] = useState(0); // force re-render pour le countdown
  const isLoginLocked = lockedUntil && Date.now() < lockedUntil;
  const lockRemaining = isLoginLocked ? Math.ceil((lockedUntil - Date.now()) / 1000) : 0;
  // Countdown timer: refresh chaque seconde pendant le verrouillage
  useEffect(() => {
    if (!isLoginLocked) return;
    const t = setInterval(() => {
      setLockTick(n => n + 1);
      if (Date.now() >= lockedUntil) { setLockedUntil(null); setLoginAttempts(0); setError(""); clearInterval(t); }
    }, 1000);
    return () => clearInterval(t);
   
  }, [isLoginLocked, lockedUntil]);

  const loginChartes = (siSystemDocs || []).filter(d => d.isLoginCharte && d.visible !== false);
  const effectiveChartes = loginChartes.length > 0 ? loginChartes : [
    { id: "CHT-CONF-DEF", charteLabel: "Charte de Confidentialité", dataUrl: null, ref: "CHT-CONF-A01-SI.v5.0/2026" },
    { id: "CHT-VAL-DEF", charteLabel: "Charte des Valeurs", dataUrl: null, ref: "CHT-VAL-A01-SI.v5.0/2026" },
  ];
  const allChartesAccepted = effectiveChartes.every(c => charteAccepted[c.id]);

  // v113 — loginUsers:
  // - SUSPENDU_DEFINITIF → retirés de la liste (connexion impossible)
  // - SUSPENDU_PROVISOIRE → conservés (peuvent demander un code d'accès)
  // - Rétablis (accountStatus=ACTIF) → réintégrés automatiquement
  const loginUsers = isAdminMode
    ? users.filter(u => u.isAdmin)
    : users.filter(u => {
        const st = u.accountStatus || "ACTIF";
        if (st === "SUSPENDU_DEFINITIF") return false;
        return !u.isAdmin;
      });

  const handleLogin = async () => {
    // FIX v63 C1  -  Rate limiting guard
    if (isLoginLocked) { setError(`🔒 Trop de tentatives. Réessayez dans ${Math.ceil((lockedUntil-Date.now())/1000)}s.`); playSound("alarm"); return; }
    // v116 — Admin mode bypasse les chartes (accès système, pas collaborateur)
    if (!isAdminMode && !allChartesAccepted) { setError("Veuillez accepter toutes les chartes avant de vous connecter."); playSound("alarm"); return; }
    if (captchaInput.toUpperCase() !== captcha) {
      setError("Code de vérification incorrect. Veuillez réessayer."); setCaptcha(generateCaptcha()); setCaptchaInput(""); playSound("alarm");
      const u = users.find(u=>u.id===userId); if (u && onSessionLog) onSessionLog("TENTATIVE", u, { status:"FAILED", reason:"CAPTCHA invalide" });
      return;
    }
    const user = users.find((u) => u.id === userId);
    if (!user) { setError("Utilisateur introuvable."); playSound("alarm"); return; }

    const acctStatus = user.accountStatus || "ACTIF";

    // FIX v132 — Si compte suspendu mais awaitingApproval actif :
    // Chercher dans pendingConnections OU dans user.accessCode (chemin DG/RH qui retire la demande)
    if (acctStatus.startsWith("SUSPENDU") && awaitingApproval && approvalCode.trim()) {
      // FIX BUG-B6 — Rafraîchir pendingConnections depuis le serveur AVANT le check.
      // Sans cela, une approbation faite depuis une autre machine n'est pas visible
      // immédiatement sur cette machine → l'utilisateur voit "code invalide" alors
      // que son admin vient d'approuver.
      let pending = pendingConnections || [];
      try {
        const { dsGet: _dsGetFresh } = await import('../core/datastore.js');
        const fresh = await _dsGetFresh('gc-pending-connections', null);
        if (Array.isArray(fresh)) pending = fresh;
      } catch (_) {}
      const req = pending.find(r => r.userId === user.id);
      // Fallback : code stocké directement sur user par approbateur DG/RH
      const codeToCheck = req?.approvedCode ?? user.accessCode ?? null;
      const expired = req?.expiresAt ? new Date(req.expiresAt) < new Date() : false;
      if (codeToCheck && approvalCode.trim().toUpperCase() === codeToCheck.toUpperCase() && !expired) {
        playSound("success");
        if (onSessionLog) onSessionLog("CONNEXION", user, { status: "SUCCESS", reason: "Code d'accès validé (compte suspendu)" });
        if (setPendingConnections) setPendingConnections(prev => prev.filter(r => r.userId !== user.id));
        // FIX v132 — Poser _approvalBypass pour que AppRoot n'intercepte pas le login suspendu
        onLogin({ ...user, _approvalBypass: true });
        return;
      } else if (expired) {
        setError("Code expiré. Reconnectez-vous pour soumettre une nouvelle demande."); playSound("alarm"); return;
      } else {
        setError("Code d'accès invalide ou expiré. Contactez votre Responsable SI.");
        playSound("alarm");
        return;
      }
    }

    if (acctStatus.startsWith("SUSPENDU")) {
      const reason = `Tentative de connexion sur compte suspendu (${acctStatus}) — Utilisateur : ${user.name} (${user.id})`;
      if (onSessionLog) onSessionLog("TENTATIVE", user, { status:"FAILED", reason });
      const rhMgIds = (users||[]).filter(u => (u.process==="S03"||u.isMG||u.id==="USR-MG-001") && u.level>=4 && !u.isAdmin).map(u=>u.id);
      const alertMsg = `🔴 ALERTE SÉCURITÉ : Tentative de connexion sur compte SUSPENDU — ${user.name} (${user.role}) à ${new Date().toLocaleTimeString("fr-FR")}`;
      if (typeof window !== "undefined") {
        try {
          const stored = JSON.parse(_lsGet("gc-security-alerts")||"[]");
          stored.unshift({ id:"SA-"+Date.now(), type:"SUSPENDU_LOGIN", msg:alertMsg, at:new Date().toISOString(), userId:user.id, userName:user.name, targets:rhMgIds });
          _lsSet("gc-security-alerts", JSON.stringify(stored.slice(0,100))); dsSave("gc-security-alerts", stored.slice(0,100)).catch(err => gcToast.syncError('', err));
        } catch (_) {}
        const allTargets = (users||[]).filter(u => u.isAdmin || (u.process==="S03"&&u.level>=4) || u.isMG || u.id==="USR-MG-001");
        allTargets.forEach(u => { try { const k=`GC_SI_v12:notif:${u.id}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now()+u.id,icon:"🔴",message:alertMsg,at:new Date().toISOString(),read:false,module:"sessions"}); _lsSet(k,JSON.stringify(ex.slice(0,200))); } catch (_) {} });
        // FIX v81 — Also create a pending connection request for suspended users so admin can generate an access code
        if (setPendingConnections) {
          const suspCode = generateAccessCode ? generateAccessCode() : (()=>{
            const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            const r=Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join("");
            return r.slice(0,4)+"-"+r.slice(4);
          })();
          const suspReq = {
            id:"CONN-"+Date.now(), userId:user.id, userName:user.name,
            userRole:user.role, userLevel:user.level,
            requestedAt:new Date().toISOString(), type:"SUSPENDU", acctStatus,
            approvedCode: suspCode,
            expiresAt: new Date(Date.now() + 15*60*1000).toISOString()};
          setPendingConnections(prev => {
            const filtered = prev.filter(r => r.userId !== user.id);
            const updated = [...filtered, suspReq];
            try { _lsSet("gc-pending-connections", JSON.stringify(updated)); dsSave("gc-pending-connections", updated).catch(err => gcToast.syncError('', err)); } catch(_) {}
            return updated;
          });
          // Notify approvers
          const approverTargets2 = (users||[]).filter(u=>u.isAdmin||(u.isMG||u.id==="USR-MG-001")||((u.process==="S03"||(u.processes||[]).includes("S03"))&&u.level>=4));
          approverTargets2.forEach(u=>{ try { const k=`GC_SI_v12:notif:${u.id}`; const ex=JSON.parse(_lsGet(k)||"[]"); const n={id:"N"+Date.now()+u.id,icon:"🔴",message:`[COMPTE SUSPENDU] ${user.name} (${user.role}) — Code généré : ${suspCode} · Valide 15 min · Approuvez dans Gestion Comptes → Connexions`,at:new Date().toISOString(),read:false,module:"gestion_comptes",urgent:true}; _lsSet(k,JSON.stringify([n,...ex].slice(0,200))); } catch(_) {} });
        }
      }
      playSound("alarm");
      // FIX v82 — Show the code input field so suspended user can enter the code once admin approves
      setAwaitingApproval(true);
      setError(`⛔ Compte suspendu (${acctStatus}). Une demande a été transmise à l'Administration. Saisissez le code d'accès reçu ci-dessous si votre Responsable SI vous en fournit un.`);
      return;
    }

    const proceedLogin = async (user) => {
      setLoginAttempts(0); setLockedUntil(null); // FIX v63 C1 — réinitialiser compteur sur succès

      // ✅ CRITICAL FIX: Call backend login API to get JWT token
      try {
        const backendLoginResponse = await fetch(`${getProxyUrl()}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.alias || user.username || user.email || user.id,
            password: password // Send plaintext password, backend will verify with bcrypt
          })
        });

        if (!backendLoginResponse.ok) {
          const errorData = await backendLoginResponse.json().catch(() => ({ error: 'Login failed' }));
          console.error('[AUTH] Backend login failed:', errorData);
          setError('Erreur de connexion au serveur. Veuillez réessayer.');
          playSound("alarm");
          return;
        }

        const loginData = await backendLoginResponse.json();
        if (!loginData.ok || !loginData.token) {
          console.error('[AUTH] Invalid backend response:', loginData);
          setError('Réponse invalide du serveur. Veuillez réessayer.');
          playSound("alarm");
          return;
        }

        // ✅ Store JWT token for subsequent API calls
        _lsSet('gc-jwt-token', loginData.token);
        console.log('[AUTH] ✅ JWT token stored for API authentication');

      } catch (backendError) {
        console.error('[AUTH] Backend login error:', backendError);
        // Continue with local login for now, but log the issue
        console.warn('[AUTH] ⚠️ Backend login failed, proceeding with local auth only');
      }

      const isMGUser = user.isMG || user.id === "USR-MG-001";
      const nowH = new Date().getHours();
      const nowMin = new Date().getMinutes();
    const isOutOfHours = nowH < 8 || (nowH === 17 && nowMin >= 30) || nowH >= 18; // Hors horaires : avant 8h ou après 17h30
      if (isOutOfHours && user.level < 5 && !user.isAdmin) {
        if (onSessionLog) onSessionLog("TENTATIVE", user, { status:"OUT_OF_HOURS", reason:`Connexion hors horaires (${new Date().toLocaleTimeString("fr-FR")})` });
        const hhMsg = `⏰ CONNEXION HORS HORAIRES : ${user.name} (${user.role}) à ${new Date().toLocaleTimeString("fr-FR")} — Approbation RH ou DG requise`;
        try {
          const stored = JSON.parse(_lsGet("gc-security-alerts")||"[]");
          stored.unshift({ id:"SA-"+Date.now(), type:"HORS_HORAIRES", msg:hhMsg, at:new Date().toISOString(), userId:user.id, userName:user.name });
          _lsSet("gc-security-alerts", JSON.stringify(stored.slice(0,100))); dsSave("gc-security-alerts", stored.slice(0,100)).catch(err => gcToast.syncError('', err));
        } catch (_) {}
        const hhTargets = (users||[]).filter(u => u.isAdmin || (u.process==="S03"&&u.level>=4) || u.isMG || u.id==="USR-MG-001");
        hhTargets.forEach(u => { try { const k=`GC_SI_v12:notif:${u.id}`; const ex=JSON.parse(_lsGet(k)||"[]"); ex.unshift({id:"N"+Date.now()+u.id,icon:"⏰",message:hhMsg,at:new Date().toISOString(),read:false,module:"sessions"}); _lsSet(k,JSON.stringify(ex.slice(0,200))); } catch (_) {} });
      }
      if (user.level >= 5 || user.isAdmin || isMGUser) {
        playSound("success");
        if (onSessionLog) onSessionLog("CONNEXION", user, { status: "SUCCESS", reason: "Accès direct (niveau élevé)" });
        onLogin(user);
        return;
      }
      // Connexion directe si dans les horaires de travail (8h00-17h30) ou approbation désactivée
      const _nowH2 = new Date().getHours(); const _nowM2 = new Date().getMinutes();
      const _inWorkHours = _nowH2 >= 8 && !(_nowH2 === 17 && _nowM2 >= 30) && _nowH2 < 18;
      if (!requireConnApproval || _inWorkHours) {
        playSound("success");
        if (onSessionLog) onSessionLog("CONNEXION", user, { status: "SUCCESS", reason: _inWorkHours ? "Connexion horaires de travail (8h-17h30)" : "Connexion directe (approbation désactivée)" });
        onLogin(user);
        return;
      }
      // Approbation requise uniquement hors horaires (avant 8h ou après 17h30)
      // FIX v132 — Vérification unifiée : chercher dans pendingConnections OU user.accessCode
      // Le chemin AdminConnexionsTab laisse la demande dans pendingConnections (approvedCode dispo)
      // Le chemin GestionComptes DG/RH retire la demande mais stocke le code dans user.accessCode
      if (awaitingApproval) {
        const pending = pendingConnections || [];
        const req = pending.find(r => r.userId === user.id);
        const now = new Date();
        const expired = req?.expiresAt && new Date(req.expiresAt) < now;
        const codeToCheck = req?.approvedCode ?? user.accessCode ?? null;
        if (codeToCheck && approvalCode.trim().toUpperCase() === codeToCheck.toUpperCase() && !expired) {
          playSound("success");
          if (onSessionLog) onSessionLog("CONNEXION", user, { status: "SUCCESS", reason: "Code d'approbation validé" });
          if (setPendingConnections) setPendingConnections(prev => prev.filter(r => r.userId !== user.id));
          onLogin(user);
        } else if (expired) {
          setError("Code expiré (validité 15 min). Reconnectez-vous pour obtenir un nouveau code.");
          if (setPendingConnections) setPendingConnections(prev => prev.filter(r => r.userId !== user.id));
          setAwaitingApproval(false); setApprovalCode("");
          playSound("alarm");
        } else {
          setError("Code d'accès invalide. Vérifiez le code transmis par l'approbateur.");
          playSound("alarm");
        }
        return;
      }
      // v113 — Vérifier le compteur de rejets avant de permettre une nouvelle demande
      const userRejKeyCheck = `gc-conn-rejects:${user.id}`;
      let rejCheck = {count:0, lockedUntil:null};
      try { rejCheck = JSON.parse(_lsGet(userRejKeyCheck)||JSON.stringify(rejCheck)); } catch(_) {}
      const nowCheck = Date.now();
      if (rejCheck.lockedUntil && new Date(rejCheck.lockedUntil).getTime() > nowCheck) {
        const mins = Math.ceil((new Date(rejCheck.lockedUntil).getTime() - nowCheck)/60000);
        setError(`🔒 Trop de demandes rejetées. Nouvelle demande possible dans ${mins} min.`);
        playSound("alarm");
        return;
      }
      // Réinitialiser si lockout expiré
      if (rejCheck.lockedUntil && new Date(rejCheck.lockedUntil).getTime() <= nowCheck) {
        try { _lsSet(userRejKeyCheck, JSON.stringify({count:0, firstAt:new Date().toISOString(), lockedUntil:null})); } catch(_) {}
      }
      // Vérifier si déjà 5 demandes dans les 15 dernières minutes
      const existing15m = (pendingConnections||[]).filter(r => r.userId===user.id && new Date(r.requestedAt).getTime() > nowCheck - 15*60*1000);
      if (existing15m.length >= 5) {
        setError("🔒 5 demandes déjà soumises dans les 15 dernières minutes. Attendez ou contactez directement votre responsable.");
        playSound("alarm");
        return;
      }
      // v107 — Soumettre une demande de connexion avec code pré-généré (ABCD-XXXX format)
      // Le code est généré immédiatement et persisté en LS pour ne pas se perdre si l'user quitte
      const preCode = generateAccessCode ? generateAccessCode() : (()=>{
        const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const r=Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join("");
        return r.slice(0,4)+"-"+r.slice(4);
      })();
      const newReq = {
        id:"CONN-"+Date.now(), userId:user.id, userName:user.name,
        userRole:user.role, userLevel:user.level,
        requestedAt:new Date().toISOString(),
        approvedCode: preCode,  // code généré dès la demande
        expiresAt: new Date(Date.now() + 15*60*1000).toISOString(), // validité 15 min
      };
      if (setPendingConnections) setPendingConnections(prev => {
        const filtered=prev.filter(r=>r.userId!==user.id);
        const updated=[...filtered, newReq];
        try { _lsSet("gc-pending-connections", JSON.stringify(updated)); dsSave("gc-pending-connections", updated).catch(err => gcToast.syncError('', err)); } catch(_) {}
        return updated;
      });
      // v75 — Auto-notify all approvers (Admin + DG/MG + RH niv4) in their LS notif key
      const approverTargets = (users||[]).filter(u=>u.isAdmin||(u.isMG||u.id==="USR-MG-001")||((u.process==="S03"||(u.processes||[]).includes("S03"))&&u.level>=4));
      approverTargets.forEach(u=>{
        try {
          const k=`GC_SI_v12:notif:${u.id}`;
          const ex=JSON.parse(_lsGet(k)||"[]");
          const n={id:"N"+Date.now()+u.id,icon:"🔑",message:`[DEMANDE CONNEXION] ${user.name} (${user.role}) — Code généré : ${preCode} · À transmettre au collaborateur · Valide 15 min`,at:new Date().toISOString(),read:false,module:"gestion_comptes",urgent:true};
          _lsSet(k,JSON.stringify([n,...ex].slice(0,200)));
        } catch(_) {}
      });
      setAwaitingApproval(true);
      playSound("notif");
      if (onSessionLog) onSessionLog("TENTATIVE", user, { status:"PENDING", reason:"Demande de connexion soumise, en attente d'approbation" });
    };

    const expectedPwdOrHash = user.passwordHash || user.password;
    if (isAdminMode) {
      // FIX v123 — Passer le storedHash de l'user pour que gcVerifyAdmin fonctionne
      // indépendamment du contexte crypto (HTTPS ou HTTP/fallback)
      gcVerifyAdmin(userId, password, user.passwordHash).then(adminOk => {
        if (!adminOk) {
          setError("Mot de passe administrateur incorrect."); playSound("alarm");
          if (onSessionLog) onSessionLog("TENTATIVE", user, { status:"FAILED", reason:"Mot de passe admin incorrect" });
          return;
        }
        proceedLogin(user);
      });
      return;
    } else {
      if (!expectedPwdOrHash) {
        setError("Aucun mot de passe défini pour ce compte. Contactez l'Admin."); playSound("alarm");
        if (onSessionLog) onSessionLog("TENTATIVE", user, { status:"FAILED", reason:"Aucun mot de passe défini" });
        return;
      }
      gcVerifyPassword(password, expectedPwdOrHash).then(pwdOk => {
        if (!pwdOk) {
          // FIX v63 C1  -  Incrémenter tentatives et verrouiller si dépassement
          const newAttempts = loginAttempts + 1;
          setLoginAttempts(newAttempts);
          // FIX v123 — Durées de verrouillage renforcées (standard sécurité ANSSI)
          if (newAttempts >= 10) { setLockedUntil(Date.now() + 30*60*1000); setLoginAttempts(0); } // 30 min
          else if (newAttempts >= 5) { setLockedUntil(Date.now() + 15*60*1000); }                  // 15 min
          // Vérifier si c'est un ancien mot de passe révoqué
          const history = user.passwordHistory || [];
          if (history.length > 0) {
            Promise.all(history.map(h => gcVerifyPassword(password, h.hash || ""))).then(histResults => {
              if (histResults.some(r => r)) {
                setError("🔒 Ce mot de passe a été révoqué. Utilisez votre mot de passe actuel (modifié le " + new Date(history.find((_,i)=>histResults[i])?.changedAt||Date.now()).toLocaleDateString("fr-FR") + ").");
              } else {
                setError("Mot de passe incorrect. Contactez l'administration du SI.");
              }
              playSound("alarm");
              if (onSessionLog) onSessionLog("TENTATIVE", user, { status:"FAILED", reason:"Mot de passe incorrect (historique vérifié)" });
            });
          } else {
            setError("Mot de passe incorrect. Contactez l'administration du SI.");
            playSound("alarm");
            if (onSessionLog) onSessionLog("TENTATIVE", user, { status:"FAILED", reason:"Mot de passe incorrect" });
          }
          return;
        }
        proceedLogin(user);
      });
      return; // Le reste s'exécute dans le .then()
    }
  };

  return (
    <div className="gc-scroll-page" style={{ background: T.primary, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "40px 16px 20px", fontFamily: "'Segoe UI', system-ui, sans-serif", position: "relative" }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg,#0A1E4A,#C41E3A,#0A1E4A)", zIndex: 10 }} />

      <div className="gc-modal-in" style={{ background: `linear-gradient(135deg, ${T.surface}, ${T.surface2})`, border: `1px solid ${T.border}`, borderRadius: 20, padding: "36px 40px", width: 440, maxWidth: "min(440px, 100%)", boxShadow: "0 32px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(196,30,58,0.12), inset 0 1px 0 rgba(255,255,255,0.06)", position: "relative", marginTop: 16, marginBottom: 16 }}>
        {/* Back button */}
        <button onClick={onBack} style={{ position: "absolute", top: 14, left: 14, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.textMuted, cursor: "pointer", fontSize: 14, padding: "4px 10px", fontWeight: 700 }}>← Retour</button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {siLogoUrl
            ? <img src={siLogoUrl} alt="Logo" style={{ width:60, height:60, borderRadius:"50%", objectFit:"cover", margin:"0 auto 12px", display:"block", border:"3px solid #C41E3A", boxShadow:"0 0 24px rgba(196,30,58,0.4)" }} />
            : <div className="gc-pulse-scale" style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,#0A1E4A,#1A3A7A)", border: "3px solid #C41E3A", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 26, boxShadow: "0 0 24px rgba(196,30,58,0.4)" }}>⚖</div>
          }
          <div style={{ color: T.text, fontWeight: 900, fontSize: 16, letterSpacing: 1 }}>{siAppearance?.cabinetName || "GÉNIE CONSULTANT"}</div>
          <div style={{ color: T.textMuted, fontSize: 11, marginTop: 3, fontStyle: "italic" }}>{siAppearance?.cabinetSlogan || "Excellence · Intégrité · Performance"}</div>
          <div style={{ color: isAdminMode?"#C41E3A":T.textMuted, fontSize: 11, marginTop: 4, fontWeight: isAdminMode?700:400 }}>{isAdminMode ? "🔐 Accès Système" : `🔑 ${siAppearance?.loginSubtitle || "Connexion Utilisateur"}`}</div>
          {isAdminMode && <div style={{ width: 60, height: 2, background: "linear-gradient(90deg,transparent,#C41E3A,transparent)", margin: "8px auto 0" }} />}
        </div>

        {/* User select */}
        <SelectField label="👤 Identifiant utilisateur" value={userId} onChange={(e) => { setUserId(e.target.value); setAwaitingApproval(false); setApprovalCode(""); setError(""); setCaptchaInput(""); setCaptcha(generateCaptcha()); setCodeReady(null); }} options={loginUsers.map((u) => ({ value: u.id, label: `${u.name} — ${u.role}` }))} T={T} />

        {/* Password */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>🔒 Mot de passe</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === "Enter" && handleLogin()} style={{ flex: 1, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 13px", color: T.text, fontSize: 13, outline: "none", transition: "border-color 0.2s, box-shadow 0.2s" }} />
            <button onClick={() => setShowPass(!showPass)} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 12px", cursor: "pointer", color: T.textMuted, fontSize: 13 }}>{showPass ? "🙈" : "👁"}</button>
          </div>
        </div>

        {/* Chartes */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: T.textMuted, fontSize: 10, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>🔐 Acceptation des chartes obligatoires</label>
          {effectiveChartes.map((charte) => (
            <div key={charte.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "9px 11px", background: charteAccepted[charte.id] ? "#22C55E0A" : T.surface2, borderRadius: 9, border: `1px solid ${charteAccepted[charte.id] ? "#22C55E44" : T.border}`, transition: "all 0.2s" }}>
              <input
                type="checkbox"
                checked={!!charteAccepted[charte.id]}
                onChange={(e) => setCharteAccepted(prev => ({ ...prev, [charte.id]: e.target.checked }))}
                style={{ accentColor: "#C41E3A", width: 15, height: 15, cursor: "pointer", flexShrink: 0 }}
              />
              <span style={{ color: T.textMuted, fontSize: 11, flex: 1 }}>J'ai lu et j'accepte la</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  onClick={() => { if (charte.dataUrl) gcViewDoc(charte); else gcAlert(`📄 La ${charte.charteLabel} n'a pas encore été téléversée par l'administrateur.\nVeuillez contacter l'Direction SI.`); }}
                  style={{ color: "#C41E3A", fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                >{charte.charteLabel} 👁</span>
                {charte.dataUrl && (
                  <span
                    onClick={() => gcDownloadDoc(charte)}
                    title="Télécharger"
                    style={{ color: "#3B82F6", fontSize: 11, cursor: "pointer" }}
                  >⬇</span>
                )}
                {!charte.dataUrl && <span style={{ color: "#F59E0B", fontSize: 9, fontWeight: 600 }}>⚠ Non chargée</span>}
              </span>
            </div>
          ))}
        </div>

        {/* CAPTCHA */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Vérification de sécurité</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <div style={{ background: "linear-gradient(135deg,#0A1E4A,#162540)", border: "2px solid #C41E3A44", borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontSize: 20, fontWeight: 900, letterSpacing: 6, color: "#E8EDF5", userSelect: "none", flex: 1, textAlign: "center", filter: "blur(0px)" }}>
              {captcha.split("").map((c, i) => <span key={i} style={{ color: i % 2 === 0 ? "#C41E3A" : "#C9A84C", textDecoration: i === 2 ? "line-through" : "none" }}>{c}</span>)}
            </div>
            <button onClick={() => { setCaptcha(generateCaptcha()); setCaptchaInput(""); }} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", color: T.textMuted, fontSize: 16 }}>🔄</button>
          </div>
          <input value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value.toUpperCase())} placeholder="Saisir le code ci-dessus" style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, letterSpacing: 4, boxSizing: "border-box", textTransform: "uppercase" }} />
        </div>

        {error && <div style={{ background: "#C41E3A22", border: "1px solid #C41E3A44", borderRadius: 8, padding: "8px 12px", color: "#C41E3A", fontSize: 12, marginBottom: 12, fontWeight: 600 }}>⚠ {error}</div>}

        {/* FIX v63 C1 — Bannière de verrouillage rate-limit */}
        {isLoginLocked && (
          <div style={{ background:"#F59E0B15",border:"1px solid #F59E0B55",borderRadius:8,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10 }}>
            <span style={{fontSize:18}}>🔒</span>
            <div>
              <div style={{color:"#F59E0B",fontWeight:800,fontSize:12}}>Accès temporairement bloqué</div>
              <div style={{color:"#B0C4DE",fontSize:10}}>Trop de tentatives échouées. Réessayez dans <strong style={{color:"#F59E0B"}}>{lockRemaining}s</strong>.</div>
            </div>
          </div>
        )}

        {awaitingApproval && (
          <div style={{ background: "#F59E0B15", border: "2px solid #F59E0B55", borderRadius: 12, padding: "16px", marginBottom: 12, animation:"gc-slide-down 0.35s ease both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ color: "#F59E0B", fontWeight: 800, fontSize: 13 }}>⏳ Code d'approbation requis</div>
              <button onClick={() => { setAwaitingApproval(false); setApprovalCode(""); setError(""); setCodeReady(null); }}
                style={{ background: "transparent", border: "1px solid #F59E0B44", color: "#F59E0B", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 600 }}>↩ Annuler</button>
            </div>
            {/* FIX v132 — Bandeau vert si le code a été auto-détecté et pré-rempli */}
            {codeReady && (
              <div style={{background:"#22C55E22",border:"2px solid #22C55E55",borderRadius:9,padding:"10px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>✅</span>
                <div style={{flex:1}}>
                  <div style={{color:"#22C55E",fontWeight:800,fontSize:12}}>Code approuvé reçu — pré-rempli automatiquement</div>
                  <div style={{color:"#22C55E",fontFamily:"monospace",fontSize:18,fontWeight:900,letterSpacing:4,marginTop:2}}>{codeReady}</div>
                  <div style={{color:"#7A90B0",fontSize:10,marginTop:2}}>Cliquez sur "Valider le code d'accès" pour continuer</div>
                </div>
              </div>
            )}
            <div style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:9,padding:"10px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>📲</span>
              <div style={{flex:1}}>
                <div style={{color:"#F59E0B",fontWeight:800,fontSize:12}}>Demande envoyée aux approbateurs</div>
                <div style={{ color: "#B0C4DE", fontSize: 10, lineHeight: 1.5 }}>
                  Un code de connexion vous sera transmis par votre approbateur (Manager, RH ou Admin).<br/>
                  Vérifiez vos notifications ou contactez-le directement pour obtenir le code.<br/>
                  <em style={{color:"#7A90B0"}}>Format du code : XXXX-XXXX · Valide 15 minutes</em>
                </div>
              </div>
            </div>
            {/* v75 — Bouton "Redemander le code" : crée une nouvelle alerte chez tous les approbateurs */}
            <button onClick={()=>{
              const user=loginUsers.find(u=>u.id===userId);
              if(!user)return;
              const reqId="CONN-"+Date.now();
              const newCode = (()=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";const r=Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join("");return r.slice(0,4)+"-"+r.slice(4);})();
              const newReq={id:reqId,userId:user.id,userName:user.name,userRole:user.role,userLevel:user.level,requestedAt:new Date().toISOString(),approvedCode:newCode,expiresAt:new Date(Date.now()+15*60*1000).toISOString(),reRequest:true};
              if(setPendingConnections)setPendingConnections(prev=>[newReq,...prev.filter(r=>r.userId!==user.id)]);
              // Notifier tous les approbateurs (Admin + DG + RH niv4)
              const approvers=(users||[]).filter(u=>u.isAdmin||(u.isMG||u.id==="USR-MG-001")||((u.process==="S03"||(u.processes||[]).includes("S03"))&&u.level>=4));
              approvers.forEach(u=>gcPushNotif(u.id,{id:"N"+Date.now()+u.id,icon:"🔑",message:`[NOUVEAU CODE] ${user.name} (${user.role}) — Code : ${newCode} · Valide 15 min`,at:new Date().toISOString(),read:false,module:"gestion_comptes",urgent:true}));
              gcAlert(`✅ Nouvelle demande de code envoyée à ${approvers.length} approbateur(s).\nVous serez notifié dès validation.`);
            }} style={{width:"100%",background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:7,padding:"7px",cursor:"pointer",fontWeight:700,fontSize:11,marginBottom:10}}>
              🔔 Redemander le code d'accès (re-alerter les approbateurs)
            </button>
            <label style={{ color: "#F59E0B", fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Code d'accès reçu *</label>
            <input value={approvalCode} onChange={e => setApprovalCode(e.target.value.toUpperCase())} placeholder="Ex : ABCD-1234" onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ width: "100%", background: "#1E3050", border: "1px solid #F59E0B55", borderRadius: 8, padding: "9px 13px", color: "#E8EDF5", fontSize: 14, boxSizing: "border-box", letterSpacing: 4, fontFamily: "monospace" }} />
            <div style={{ color: "#7A90B0", fontSize: 10, marginTop: 4 }}>💡 Format : XXXX-XXXX · Transmis par l'Admin ou Manager après validation</div>
          </div>
        )}

        <Btn onClick={handleLogin} variant="primary" size="lg" disabled={isLoginLocked} style={{ width: "100%", justifyContent: "center", opacity: isLoginLocked ? 0.5 : 1, cursor: isLoginLocked ? "not-allowed" : "pointer" }}>
          {isLoginLocked ? `🔒 Bloqué — ${lockRemaining}s` : awaitingApproval ? "🔓 VALIDER LE CODE D'ACCÈS" : "🔐 CONNEXION AU SYSTÈME"}
        </Btn>
        {loginAttempts > 0 && !isLoginLocked && (
          <div style={{color:"#F59E0B",fontSize:9,textAlign:"center",marginTop:4}}>
            ⚠ {loginAttempts}/5 tentatives — Verrouillage à 5 échecs
          </div>
        )}


        {!isAdminMode && (
          <button onClick={onCreateAccount} style={{ width: "100%", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px", color: T.textMuted, cursor: "pointer", fontSize: 12, marginTop: 10, fontWeight: 600 }}>
            + Créer un compte utilisateur
          </button>
        )}

        {isAdminMode && onAccessDemo && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ textAlign: "center", color: T.textDim, fontSize: 10, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>── Espace Présentation ──</div>
            <button
              onClick={onAccessDemo}
              style={{ width: "100%", background: "linear-gradient(135deg,#0A1E4A,#1A3A7A)", border: "2px solid #C9A84C66", borderRadius: 10, padding: "11px 16px", color: "#C9A84C", cursor: "pointer", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              🎮 Accéder à la Démo du SI
            </button>
            <div style={{ textAlign: "center", marginTop: 5, color: T.textDim, fontSize: 10 }}>
              Données fictives · Non sauvegardées · Mode présentation uniquement
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 14, color: T.textMuted, fontSize: 10 }}>
          SI v29.0/2026 · DOC-A01-SI.v40.0/2026 · Génie Consultant
        </div>
      </div>
    </div>
  );
};

export function CreateAccountPage({ onBack, onSubmit, T }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [func, setFunc] = useState("");
  const [locked, setLocked] = useState(false);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [adresse, setAdresse] = useState("");
  const [profil, setProfil] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [genId, setGenId] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState({ contrat: null, identite: null, cv: null, photo: null });
  const [uploadedFilesData, setUploadedFilesData] = useState({ contrat: null, identite: null, cv: null, photo: null });
  const [uploadStatus, setUploadStatus] = useState({ contrat: null, identite: null, cv: null, photo: null }); // null|"loading"|"ok"|"error"
  const [sexe, setSexe] = useState("");
  const [sitMatrimoniale, setSitMatrimoniale] = useState("");
  const [nationalite, setNationalite] = useState("Gabonaise");
  const fileRefs = { contrat: useRef(null), identite: useRef(null), cv: useRef(null), photo: useRef(null) };

  const isUploading = Object.values(uploadStatus).some(s => s === "loading");

  const handleFileSelect = async (key, file) => {
    if (!file) return;
    setUploadStatus(prev => ({ ...prev, [key]: "loading" }));
    try {
      const result = await gcReadFile(file, 8);
      setUploadedFiles(prev => ({ ...prev, [key]: result.name }));
      setUploadedFilesData(prev => ({ ...prev, [key]: result }));
      setUploadStatus(prev => ({ ...prev, [key]: "ok" }));
    } catch (err) {
      setUploadStatus(prev => ({ ...prev, [key]: "error" }));
      gcAlert("⚠️ " + err.message);
    }
  };

  const handleFuncSelect = (v) => {
    if (!v) return;
    setFunc(v);
    setLocked(true);
    const fn = USER_FUNCTIONS.find((f) => f.value === v);
    const code = v.slice(0, 3).toUpperCase();
    const num = String(Math.floor(Math.random() * 900) + 100);
    setGenId(`USR-${code}-${num}`);
  };

  const handleSubmit = () => {
    const wordCount = profil.trim().split(/\s+/).filter(Boolean).length;
    if (!nom || !prenom || !email || !profil.trim()) {
      gcAlert("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    if (wordCount > 250) {
      gcAlert(`⚠️ Le profil dépasse la limite de 250 mots (${wordCount} mots actuels).\nVeuillez le résumer à 250 mots maximum.`);
      return;
    }
    if (isUploading) { gcAlert("⏳ Veuillez attendre la fin du chargement des fichiers."); return; }
    setSubmitted(true);
    onSubmit({ func, nom, prenom, email, tel, adresse, profil, genId, sexe, sitMatrimoniale, nationalite, uploadedDocs: uploadedFilesData });
  };

  if (submitted) {
    return (
      <div className="gc-scroll-page" style={{ background: T.primary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: T.surface, border: "1px solid #22C55E44", borderRadius: 16, padding: 40, width: 460, textAlign: "center", boxShadow: "0 24px 80px #0009" }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
          <h3 style={{ color: "#22C55E", marginBottom: 10 }}>Dossier envoyé avec succès !</h3>
          <div style={{ color: T.text, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
            Votre demande d'ouverture de compte est en cours de traitement.<br /><br />
            <strong>ID provisoire généré :</strong><br />
            <span style={{ fontFamily: "monospace", color: "#C9A84C", fontSize: 16, fontWeight: 800 }}>{genId}</span>
          </div>
          <div style={{ background: "#22C55E11", border: "1px solid #22C55E33", borderRadius: 8, padding: 12, color: T.textMuted, fontSize: 12, marginBottom: 20 }}>
            📧 Un e-mail de confirmation vous sera envoyé sous <strong>24h</strong> après validation par la chaîne d'approbation :<br />
            <strong style={{ color: "#22C55E" }}>RH → Conformité (P02) → Direction Générale</strong>
          </div>
          <Btn onClick={onBack} variant="navy">← Retour à la connexion</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="gc-scroll-page" style={{ background: T.primary, fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px" }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "32px 36px", width: 560, maxWidth: "95vw", boxShadow: "0 24px 80px #0009" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, borderBottom: `1px solid ${T.border}`, paddingBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 18 }}>←</button>
          <div>
            <div style={{ color: "#C41E3A", fontWeight: 800, fontSize: 15 }}>⚖ GÉNIE CONSULTANT</div>
            <div style={{ color: T.textMuted, fontSize: 11 }}>Création de compte utilisateur</div>
          </div>
        </div>

        {/* Step 1: Function */}
        <SelectField
          label="Type de fonction *"
          value={func}
          onChange={(e) => { if (!locked) handleFuncSelect(e.target.value); }}
          options={[{ value: "", label: "-- Sélectionner votre fonction --" }, ...USER_FUNCTIONS.map((f) => ({ value: f.value, label: f.label }))]}
          T={T}
        />

        {func && (
          <>
            <div style={{ background: locked ? "#22C55E11" : T.surface2, border: `1px solid ${locked ? "#22C55E44" : T.border}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14, display: "flex", gap: 8, alignItems: "center" }}>
              <span>{locked ? "🔒" : "🔓"}</span>
              <span style={{ color: T.textMuted, fontSize: 11 }}>Fonction : <strong style={{ color: T.text }}>{USER_FUNCTIONS.find((f) => f.value === func)?.label}</strong></span>
              <div style={{ marginLeft: "auto" }}><Badge label={genId} color="#C9A84C" small /></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <div style={{ paddingRight: 8 }}><InputField label="Nom *" value={nom} onChange={(e) => setNom(e.target.value)} required T={T} /></div>
              <div><InputField label="Prénom(s) *" value={prenom} onChange={(e) => setPrenom(e.target.value)} required T={T} /></div>
              <div style={{ paddingRight: 8 }}><InputField label="Téléphone *" type="tel" value={tel} onChange={(e) => setTel(e.target.value)} required T={T} /></div>
              <div><InputField label="E-mail *" type="email" value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} onInput={(e)=>{e.target.value=e.target.value.toLowerCase();}} required T={T} /></div>
              <div style={{ paddingRight: 8, marginBottom: 12 }}>
                <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Sexe *</label>
                <select value={sexe} onChange={e=>setSexe(e.target.value)} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 13px", color: T.text, fontSize: 13 }}>
                  <option value="">-- Sélectionner --</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Situation Matrimoniale *</label>
                <select value={sitMatrimoniale} onChange={e=>setSitMatrimoniale(e.target.value)} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 13px", color: T.text, fontSize: 13 }}>
                  <option value="">-- Sélectionner --</option>
                  <option value="CELIBATAIRE">Célibataire</option>
                  <option value="MARIE">Marié(e)</option>
                  <option value="DIVORCE">Divorcé(e)</option>
                  <option value="VEUF">Veuf / Veuve</option>
                  <option value="UNION_LIBRE">Union libre</option>
                </select>
              </div>
            </div>
            <InputField label="Nationalité *" placeholder="Ex: Gabonaise, Française…" value={nationalite} onChange={e=>setNationalite(e.target.value)} T={T} />
            <InputField label="Adresse *" value={adresse} onChange={(e) => setAdresse(e.target.value)} required T={T} />

            {/* File uploads */}
            {[
              { label: "📄 Contrat signé *", key: "contrat", accept: ".pdf,.docx,.doc" },
              { label: "🪪 Pièce d'identité *", key: "identite", accept: ".pdf,.jpg,.jpeg,.png" },
              { label: "📎 Curriculum Vitae (CV) *", key: "cv", accept: ".pdf,.docx,.doc" },
              { label: "🖼️ Photo de profil (format identité) *", key: "photo", accept: "image/*" },
            ].map(({ label, key, accept }) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>{label}</label>
                <div style={{ position: "relative" }}>
                  <input
                    ref={fileRefs[key]}
                    type="file"
                    accept={accept}
                    onChange={e => { if (e.target.files[0]) handleFileSelect(key, e.target.files[0]); }}
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 2, width: "100%", height: "100%" }}
                  />
                  <div
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); const file = e.dataTransfer.files[0]; if (file) handleFileSelect(key, file); }}
                    style={{ background: T.surface2, border: `2px dashed ${uploadStatus[key]==="ok" ? "#22C55E" : uploadStatus[key]==="error" ? "#EF4444" : T.border}`, borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}
                  >
                    <span style={{ fontSize: 18 }}>{uploadStatus[key]==="loading" ? "⏳" : uploadStatus[key]==="ok" ? "✅" : uploadStatus[key]==="error" ? "❌" : "📂"}</span>
                    <span style={{ color: uploadStatus[key]==="ok" ? "#22C55E" : uploadStatus[key]==="error" ? "#EF4444" : T.textMuted, fontSize: 12, flex: 1 }}>
                      {uploadStatus[key]==="loading" ? "Lecture en cours…" : uploadedFiles[key] ? `✅ ${uploadedFiles[key]}` : "Cliquez pour sélectionner ou glisser-déposer"}
                    </span>
                    {!uploadedFiles[key] && <span style={{ color: T.textDim, fontSize: 10 }}>PDF · JPG · PNG · DOCX</span>}
                    {uploadedFilesData[key] && <span style={{ color: "#22C55E", fontSize: 9, fontWeight: 700 }}>{uploadedFilesData[key].sizeStr}</span>}
                  </div>
                </div>
              </div>
            ))}

            {/* Profil */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: T.textMuted, fontSize: 11, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>
                Profil – Qualités & Compétences * <span style={{ color: profil.trim().split(/\s+/).filter(Boolean).length > 250 ? "#EF4444" : profil.trim() ? "#22C55E" : "#C41E3A", fontSize: 10 }}>({profil.trim().split(/\s+/).filter(Boolean).length}/250 mots max.)</span>
              </label>
              <textarea value={profil} onChange={(e) => setProfil(e.target.value)} placeholder="Résumez vos qualités et compétences professionnelles (maximum 250 mots)…" rows={5} style={{ width: "100%", background: T.surface2, border: `1px solid ${profil.trim().split(/\s+/).filter(Boolean).length > 250 ? "#EF4444" : T.border}`, borderRadius: 8, padding: "9px 13px", color: T.text, fontSize: 12, resize: "vertical", boxSizing: "border-box" }} />
            </div>

            <Btn onClick={handleSubmit} disabled={isUploading} variant="primary" size="lg" style={{ width: "100%", justifyContent: "center", opacity: isUploading ? 0.6 : 1 }}>
              {isUploading ? "⏳ Chargement en cours…" : "📤 SOUMETTRE LA DEMANDE"}
            </Btn>
          </>
        )}
      </div>
    </div>
  );
};

export function LogoutConfirmModal({ currentUser, onConfirm, onCancel, T }) {

  const canvasRef = useRef(null);
  const [captchaText, setCaptchaText] = useState(() => generateCaptcha());
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [ok, setOk] = useState(false);

  const draw = useCallback((text) => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0A1628"); g.addColorStop(1, "#1E3050");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,Math.random()*2,0,Math.PI*2); ctx.fillStyle=`rgba(200,200,255,${Math.random()*0.2})`; ctx.fill(); }
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(Math.random()*W,Math.random()*H); ctx.lineTo(Math.random()*W,Math.random()*H); ctx.strokeStyle=`rgba(196,30,58,${Math.random()*0.4})`; ctx.lineWidth=1.5; ctx.stroke(); }
    text.split("").forEach((ch, i) => {
      ctx.save(); ctx.translate(18 + i * 32, 36 + (Math.random()*10-5));
      ctx.rotate((Math.random()-0.5)*0.5);
      ctx.font = `bold ${24+Math.random()*8}px Georgia`; ctx.fillStyle = i%2===0?"#C41E3A":"#C9A84C";
      ctx.shadowColor="#000"; ctx.shadowBlur=3; ctx.fillText(ch, 0, 0); ctx.restore();
    });
    ctx.strokeStyle="#1E3A5F"; ctx.lineWidth=1; ctx.strokeRect(0,0,W,H);
  }, []);

  useEffect(() => { draw(captchaText); }, [captchaText, draw]);

  const refresh = () => { const t = generateCaptcha(); setCaptchaText(t); setInput(""); setErr(""); };
  const verify = () => {
    if (input.toUpperCase().trim() === captchaText) { setOk(true); setTimeout(onConfirm, 600); }
    else {
      const a = attempts + 1; setAttempts(a);
      setErr(a>=3 ? "Trop de tentatives. Déconnexion annulée." : `Code incorrect. ${3-a} tentative(s) restante(s).`);
      setInput(""); refresh();
      if (a >= 3) setTimeout(onCancel, 1500);
    }
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"#000C",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }} onMouseDown={e=>{if(e.target===e.currentTarget)onCancel();}}>
      <div onClick={e=>e.stopPropagation()} style={{ background:T.surface,border:`2px solid #C41E3A44`,borderRadius:16,padding:28,width:"min(420px,94vw)",boxShadow:"0 32px 80px #000E" }}>
        <div style={{ display:"flex",gap:12,alignItems:"center",marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${T.border}` }}>
          <div style={{ width:44,height:44,borderRadius:10,background:"#C41E3A22",border:"1px solid #C41E3A44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22 }}>🚪</div>
          <div><div style={{ color:T.text,fontWeight:800,fontSize:15 }}>Déconnexion du SI</div><div style={{ color:T.textMuted,fontSize:11 }}>Génie Consultant — DOC-A01-SI.v40.0/2026</div></div>
        </div>
        <div style={{ background:T.surface2,borderRadius:10,padding:12,marginBottom:16,display:"flex",alignItems:"center",gap:10,border:`1px solid ${T.border}` }}>
          <div style={{ width:34,height:34,borderRadius:"50%",background:currentUser.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff",fontWeight:700 }}>{currentUser.avatar}</div>
          <div><div style={{ color:T.text,fontWeight:600,fontSize:12 }}>{currentUser.name}</div><div style={{ color:T.textMuted,fontSize:10 }}>{currentUser.role} • Niveau {currentUser.level}</div></div>
          <div style={{ marginLeft:"auto",textAlign:"right" }}><div style={{ color:"#F59E0B",fontSize:10,fontWeight:600 }}>⚠ Session active</div><div style={{ color:T.textDim,fontSize:9 }}>{new Date().toLocaleTimeString("fr-FR")}</div></div>
        </div>
        <div style={{ color:T.textMuted,fontSize:12,textAlign:"center",marginBottom:16,lineHeight:1.6 }}>
          Complétez le contrôle de sécurité pour confirmer.<br/><span style={{ color:"#F59E0B",fontSize:11 }}>Toute session non sauvegardée sera perdue.</span>
        </div>
        {ok ? <div style={{ textAlign:"center",color:"#22C55E",fontWeight:700,fontSize:13 }}>✅ Vérifié — Déconnexion en cours…</div> : (
          <>
            <div style={{ display:"flex",alignItems:"center",gap:8,justifyContent:"center",marginBottom:10 }}>
              <canvas ref={canvasRef} width={210} height={56} style={{ borderRadius:8,border:`2px solid ${T.border}`,display:"block" }} />
              <button onClick={refresh} style={{ background:T.surface3,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.textMuted,cursor:"pointer",fontSize:16 }}>🔄</button>
            </div>
            <input autoFocus value={input} onChange={(e)=>{setInput(e.target.value.toUpperCase());setErr("");}} onKeyDown={(e)=>e.key==="Enter"&&verify()} maxLength={6} placeholder="Saisir le code" style={{ width:"100%",background:T.surface3,border:`1.5px solid ${err?'#C41E3A':T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:15,letterSpacing:6,textAlign:"center",fontFamily:"monospace",fontWeight:700,boxSizing:"border-box",outline:"none",marginBottom:8 }} />
            {err && <div style={{ color:"#C41E3A",fontSize:11,textAlign:"center",marginBottom:8 }}>⚠ {err}</div>}
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={onCancel} style={{ flex:1,background:T.surface3,color:T.textMuted,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px",cursor:"pointer",fontSize:12,fontWeight:600 }}>Annuler</button>
              <button onClick={verify} disabled={input.length<6} style={{ flex:1,background:input.length<6?T.surface3:"#7F1D1D",color:input.length<6?T.textDim:"#EF4444",border:`1px solid ${input.length<6?T.border:"#EF444444"}`,borderRadius:8,padding:"9px",cursor:input.length<6?"not-allowed":"pointer",fontSize:12,fontWeight:700,transition:"all 0.2s" }}>🚪 Confirmer déconnexion</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export function ProfileDropdown({ currentUser, dossiers=[], taches=[], onOpenProfile, onLogout, onClose, onOpenMessaging, onOpenNotifications, T }) {

  const myDossiers = dossiers.filter(d => d.assignedTo === currentUser.id);
  const myTaches = taches.filter(t => (t.assignedTo === currentUser.id || t.assigneeId === currentUser.id) && t.status !== "TERMINE");
  const myDossActifs = myDossiers.filter(d => d.status !== "TERMINE").length;

  return (
    <div style={{ position:"absolute",right:0,top:44,width:310,background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,boxShadow:"0 16px 50px #0009",zIndex:600 }} onClick={e=>e.stopPropagation()}>
      {/* Header profil */}
      <div style={{ padding:"16px 16px 12px",borderBottom:`1px solid ${T.border}`,background:`linear-gradient(135deg,${currentUser.color}18,transparent)` }}>
        <div style={{ display:"flex",gap:12,alignItems:"center" }}>
          <div style={{ width:44,height:44,borderRadius:"50%",background:currentUser.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#fff",fontWeight:800,flexShrink:0,border:"2px solid #fff2",overflow:"hidden" }}>
            {currentUser.photoUrl ? <img src={currentUser.photoUrl} alt="avatar" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : currentUser.avatar}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ color:T.text,fontWeight:800,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{currentUser.name}</div>
            <div style={{ color:T.textMuted,fontSize:10,marginTop:1 }}>{currentUser.role}</div>
            <div style={{ display:"flex",gap:4,marginTop:4 }}>
              <span style={{ background:"#C41E3A22",color:"#C41E3A",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700 }}>Niv.{currentUser.level}</span>
              <span style={{ background:`${currentUser.color}22`,color:currentUser.color,borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:600 }}>{currentUser.dept||"Cabinet"}</span>
            </div>
          </div>
        </div>
        {currentUser.bio && <div style={{ color:T.textDim,fontSize:10,marginTop:10,lineHeight:1.5,fontStyle:"italic" }}>"{currentUser.bio.slice(0,80)}…"</div>}
      </div>

      {/* Mini tableau de bord */}
      <div style={{ padding:"10px 14px",borderBottom:`1px solid ${T.border}` }}>
        <div style={{ color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>Activité en cours</div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6 }}>
          {[
            { label:"Dossiers actifs",value:myDossActifs,color:"#3B82F6",icon:"📁" },
            { label:"Tâches",value:myTaches.length,color:"#F59E0B",icon:"📋" },
            { label:"Terminés",value:myDossiers.filter(d=>d.status==="TERMINE").length,color:"#22C55E",icon:"✅" },
          ].map(s=>(
            <div key={s.label} style={{ background:T.surface2,borderRadius:8,padding:"7px 8px",textAlign:"center",border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:14 }}>{s.icon}</div>
              <div style={{ color:s.color,fontWeight:800,fontSize:16 }}>{s.value}</div>
              <div style={{ color:T.textDim,fontSize:9,marginTop:1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions rapides */}
      <div style={{ padding:"8px 10px",borderBottom:`1px solid ${T.border}` }}>
        {[
          { icon:"👤", label:"Mon profil complet", action: () => { onOpenProfile(); onClose(); } },
          { icon:"✉️", label:"Messagerie interne", action: () => { if(onOpenMessaging) onOpenMessaging(); onClose(); } },
          { icon:"🔔", label:"Notifications", action: () => { if(onOpenNotifications) onOpenNotifications(); onClose(); } },
        ].map(a=>(
          <button key={a.label} onClick={a.action} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",background:"transparent",border:"none",borderRadius:8,padding:"8px 10px",color:T.textMuted,cursor:"pointer",fontSize:12,textAlign:"left",transition:"background 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:14}}>{a.icon}</span><span>{a.label}</span>
            <span style={{marginLeft:"auto",color:T.textDim,fontSize:11}}>→</span>
          </button>
        ))}
      </div>

      {/* Déconnexion */}
      <div style={{ padding:"8px 10px" }}>
        <button onClick={() => { onLogout(); onClose(); }} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",background:"#C41E3A15",border:"1px solid #C41E3A44",borderRadius:8,padding:"8px 12px",color:"#C41E3A",cursor:"pointer",fontSize:12,fontWeight:700 }}>
          🚪 Déconnexion
        </button>
      </div>
    </div>
  );
};

export function ProfilePage({ currentUser, users=[], onClose, canEdit, onSave, onSavePassword, T, isFirstLogin=false, systemMsgs=[] }) {
  const _dlg = useDialog();
  const gcAlert   = (msg, title, icon) => _dlg.alert(msg, title, icon);
  const gcConfirm = (msg, title, icon, danger) => _dlg.confirm(msg, title, icon, danger);
  const gcPrompt  = (msg, def, title, icon) => _dlg.prompt(msg, def, title, icon);

  const [tab, setTab] = useState("info");
  // v107 — on first login, open in edit mode immediately so DG sees all editable fields
  const [editing, setEditing] = useState(isFirstLogin);
  const [form, setForm] = useState({
    telephone: currentUser.telephone || "",
    adresse: currentUser.adresse || "",
    bio: currentUser.bio || "",
    alias: currentUser.alias || "",
    // v107/v108 — champs éditables uniquement à la 1ère connexion DG
    name: currentUser.name || "",
    sexe: currentUser.sexe || "",
    nationalite: currentUser.nationalite || "Gabonaise",
    situationMatrimoniale: currentUser.situationMatrimoniale || "",
    email: currentUser.email || "",
    // v108 — processus multi-select (P01 obligatoire)
    processes: (() => {
      const existing = currentUser.processes || (currentUser.process ? [currentUser.process] : []);
      return existing.includes("P01") ? existing : ["P01", ...existing];
    })()});
  const ALL_PROCS = ["P01","P02","P03","P04","O01","O02","O03","S01","S02","S03","S04","S05","S06"];
  const PROC_LABELS_MAP = {P01:"Management",P02:"Gouvernance",P03:"Contrôle gestion",P04:"Veille",O01:"Administration",O02:"Juridique",O03:"Éval. & Gestion",S01:"Finance",S02:"Audit",S03:"RH",S04:"Communication",S05:"Logistique",S06:"Entretien"};
  const toggleProcess = (proc) => {
    if (proc === "P01") return; // P01 obligatoire, non retirable
    setForm(f => {
      const procs = f.processes || ["P01"];
      if (procs.includes(proc)) return {...f, processes: procs.filter(p => p !== proc)};
      return {...f, processes: [...procs, proc]};
    });
  };
  // FIX v63 C4  -  Protection contre la perte de modifications non sauvegardées
  const _formOriginal = { telephone: currentUser.telephone||"", adresse: currentUser.adresse||"", bio: currentUser.bio||"", alias: currentUser.alias||"" };
  const isDirty = editing && JSON.stringify(form) !== JSON.stringify(_formOriginal);
  const safeOnClose = () => {
    if (isDirty && !window.confirm("Vous avez des modifications non sauvegardées. Quitter sans sauvegarder ?")) return;
    onClose();
  };
  const [saved, setSaved] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(currentUser.photoUrl || null);
  const photoInputRef = useRef(null);
  // État changement mot de passe
  const [pwdForm, setPwdForm] = useState({ current: "", newPwd: "", confirm: "" });
  const [pwdMsg, setPwdMsg] = useState(null); // { type: "ok"|"err", text }
  const [pwdLoading, setPwdLoading] = useState(false);
  const handleChangePassword = async () => {
    setPwdMsg(null);
    if (!pwdForm.current || !pwdForm.newPwd || !pwdForm.confirm) { setPwdMsg({ type:"err", text:"Veuillez remplir tous les champs." }); return; }
    if (pwdForm.newPwd !== pwdForm.confirm) { setPwdMsg({ type:"err", text:"Les nouveaux mots de passe ne correspondent pas." }); return; }
    if (pwdForm.newPwd.length < 8) { setPwdMsg({ type:"err", text:"Le mot de passe doit contenir au moins 8 caractères." }); return; }
    setPwdLoading(true);
    try {
      const expectedHash = currentUser.passwordHash || currentUser.password;
      const isAdmin_ = currentUser.isAdmin || currentUser.id === "USR-ADM-000";
      // FIX v123 — Passer expectedHash pour cohérence contexte crypto
      const ok = isAdmin_
        ? await gcVerifyAdmin(currentUser.id, pwdForm.current, currentUser.passwordHash)
        : await gcVerifyPassword(pwdForm.current, expectedHash);
      if (!ok) { setPwdMsg({ type:"err", text:"Mot de passe actuel incorrect." }); setPwdLoading(false); return; }
      const newHash = await gcHashPassword(pwdForm.newPwd);
      if (onSavePassword) await onSavePassword(currentUser.id, newHash, expectedHash);
      setPwdMsg({ type:"ok", text:"✅ Mot de passe mis à jour avec succès." });
      setPwdForm({ current:"", newPwd:"", confirm:"" });
    } catch (e) { setPwdMsg({ type:"err", text:"Erreur lors du changement : " + e.message }); }
    setPwdLoading(false);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    gcFileSave(file, { module: "auth", type: "image", nom: file.name, taille: file.size, uploadedBy: currentUser?.id }).then(ref => { setPhotoUrl(ref.dataUrl || ref.path).catch(err => console.error("[Auth] upload:", err)); onSave({ ...currentUser, photoUrl: ref.dataUrl || ref.path }); });
  };

  const handleSave = () => {
    const update = { ...currentUser, ...form, photoUrl };
    if (isFirstLogin) {
      update.isFirstLogin = false;
      // Save selected processes + set primary process to first selected
      update.processes = form.processes || ["P01"];
      update.process = update.processes[0] || "P01";
    }
    onSave(update);
    setSaved(true); setEditing(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { id: "info", icon: "👤", label: "Informations" },
    { id: "docs_recu", icon: "📥", label: "Docs reçus" },
    { id: "docs_envoye", icon: "📤", label: "Docs envoyés" },
    { id: "newsletter", icon: "📰", label: "Newsletter interne" },
    { id: "securite", icon: "🔐", label: "Sécurité" },
    { id: "backup", icon: "💾", label: "Mes données" },
  ];

  const LEVEL_LABEL = {6:"Superviseur SI",5:"Direction Générale",4:"Manager",3:"Responsable",2:"Opérationnel",1:"Exécutant"};
  const PERM_LABEL = { 6:["Lecture","Écriture","Création","Modification","Validation","Admin","Paramétrage"], 5:["Lecture","Écriture","Création","Modification","Validation"], 4:["Lecture","Écriture","Création","Modification","Validation"], 3:["Lecture","Écriture","Création","Modification"], 2:["Lecture","Écriture","Création"], 1:["Lecture","Écriture"] };

  return (
    <div style={{ position:"fixed",inset:0,background:"#000C",zIndex:isFirstLogin?6100:2500,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }} onMouseDown={(e)=>{if(e.target===e.currentTarget&&!isFirstLogin)safeOnClose();}}>
      <div style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,width:"min(720px,96vw)",maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:isFirstLogin?"0 0 60px rgba(201,168,76,0.4), 0 32px 80px #000E":"0 32px 80px #000E" }} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Profil utilisateur">
        {/* Header */}
        <div style={{ padding:"18px 22px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:14 }}>
          <div style={{ position:"relative",flexShrink:0 }}>
            <div style={{ width:60,height:60,borderRadius:"50%",background:currentUser.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#fff",fontWeight:800,border:"3px solid #fff2",overflow:"hidden" }}>
              {photoUrl ? <img src={photoUrl} alt="avatar" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : currentUser.avatar}
            </div>
            <button onClick={()=>photoInputRef.current?.click()} title="Changer la photo de profil" style={{ position:"absolute",bottom:-4,right:-4,width:22,height:22,borderRadius:"50%",background:"#C41E3A",border:"2px solid "+T.surface,color:"#fff",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800 }}>📷</button>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display:"none" }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:T.text,fontWeight:900,fontSize:16 }}>{currentUser.name}</div>
            <div style={{ color:T.textMuted,fontSize:12,marginTop:2 }}>{currentUser.role} — {currentUser.dept}</div>
            <div style={{ display:"flex",gap:6,marginTop:5 }}>
              <span style={{ background:"#C41E3A22",color:"#C41E3A",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700 }}>Niv.{currentUser.level} — {LEVEL_LABEL[currentUser.level]}</span>
              <span style={{ background:T.surface3,color:T.textMuted,borderRadius:4,padding:"2px 8px",fontSize:10 }}>{currentUser.id}</span>
              {currentUser.alias && <span style={{ background:"#C9A84C22",color:"#C9A84C",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:600 }}>@{currentUser.alias}</span>}
            </div>
          </div>
          {/* FIX v63 C4: dirty state indicator */}
          {isDirty && <span style={{background:"#F59E0B22",border:"1px solid #F59E0B44",borderRadius:6,padding:"3px 8px",color:"#F59E0B",fontSize:9,fontWeight:700}}>● Modifications non sauvegardées</span>}
          <button onClick={safeOnClose} style={{ background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,cursor:"pointer",borderRadius:8,padding:"6px 12px",fontSize:14,fontWeight:700 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ padding:"10px 16px 0",borderBottom:`1px solid ${T.border}` }}>
          <div style={{ display:"flex",gap:2 }}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{ background:tab===t.id?"#C41E3A":"transparent",color:tab===t.id?"#fff":T.textMuted,border:"none",borderRadius:"6px 6px 0 0",padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                <span>{t.icon}</span><span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1,overflowY:"auto",padding:20 }}>
          {tab === "info" && (
            <div>
              {/* Bio / Mention courte */}
              <div style={{ background:T.surface2,borderRadius:10,padding:14,marginBottom:14,border:`1px solid ${T.border}` }}>
                <div style={{ color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6 }}>✏️ Ma mention courte (visible par tous)</div>
                {editing ? (
                  <input value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} placeholder="Définissez-vous en une phrase…" style={{ width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 12px",color:T.text,fontSize:13,boxSizing:"border-box" }} />
                ) : (
                  <div style={{ color:T.text,fontSize:13,fontStyle:"italic" }}>"{currentUser.bio || "Aucune mention renseignée."}"</div>
                )}
              </div>

              {/* Info fields */}
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14 }}>
                {[
                  { label:"Alias / Identifiant interne",key:"alias",value:form.alias,editKey:"alias",editable:true },
                  { label:"Sexe",value:form.sexe,editKey:"sexe",editable:isFirstLogin },
                  { label:"Nationalité",value:form.nationalite,editKey:"nationalite",editable:isFirstLogin },
                  { label:"Situation matrimoniale",value:form.situationMatrimoniale,editKey:"situationMatrimoniale",editable:isFirstLogin },
                  { label:"E-mail professionnel",value:form.email,editKey:"email",editable:isFirstLogin },
                  { label:"Téléphone",key:"telephone",value:form.telephone,editKey:"telephone",editable:true },
                  { label:"Adresse",key:"adresse",value:form.adresse,editKey:"adresse",editable:true,full:true },
                  { label:"Nom complet",value:form.name,editKey:"name",editable:isFirstLogin },
                  { label:"Département",value:currentUser.dept,editable:false },
                ].map(f=>(
                  <div key={f.label} style={{ background:T.surface2,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`,gridColumn:f.full?"span 2":"span 1" }}>
                    <div style={{ color:T.textMuted,fontSize:10,marginBottom:3,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600,display:"flex",alignItems:"center",gap:4 }}>
                      {f.label}
                      {f.editable && !isFirstLogin && <span style={{ color:"#22C55E",fontSize:9 }}>(modifiable)</span>}
                      {f.editable && isFirstLogin && <span style={{ color:"#C9A84C",fontSize:9 }}>✏️ config. initiale</span>}
                      {!f.editable && <span style={{ color:"#C41E3A",fontSize:9 }}>(RH/Admin)</span>}
                    </div>
                    {editing && f.editable ? (
                      f.editKey === "sexe" ? (
                        <select value={form.sexe} onChange={e=>setForm(fm=>({...fm,sexe:e.target.value}))}
                          style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:12}}>
                          <option value="">— Sélectionner —</option>
                          <option value="M">Masculin</option>
                          <option value="F">Féminin</option>
                          <option value="N/A">Non précisé</option>
                        </select>
                      ) : f.editKey === "nationalite" ? (
                        <NationaliteField value={form.nationalite} noLabel={true}
                          onChange={e=>setForm(fm=>({...fm,nationalite:e.target.value}))} T={T} />
                      ) : f.editKey === "situationMatrimoniale" ? (
                        <select value={form.situationMatrimoniale} onChange={e=>setForm(fm=>({...fm,situationMatrimoniale:e.target.value}))}
                          style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.text,fontSize:12}}>
                          <option value="">— Sélectionner —</option>
                          {["Célibataire","Marié(e)","Divorcé(e)","Veuf/Veuve","N/A"].map(v=><option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : (
                        <input value={form[f.editKey]||""} onChange={e=>setForm(fm=>({...fm,[f.editKey]:e.target.value}))}
                          style={{width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:12,boxSizing:"border-box"}} />
                      )
                    ) : (
                      <div style={{ color:T.text,fontSize:13,fontWeight:500 }}>
                        {f.editKey === "sexe" ? (form.sexe==="M"?"Masculin":form.sexe==="F"?"Féminin":form.sexe||"—") : f.editKey?form[f.editKey]:f.value || "—"}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* v108 — Processus multi-select — visible + éditable sur 1ère connexion DG */}
              <div style={{background:T.surface2,borderRadius:10,padding:14,marginBottom:14,border:`1px solid ${T.border}`}}>
                <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                  🔀 Processus associés
                  {isFirstLogin && editing && <span style={{color:"#C9A84C",fontSize:9}}>✏️ config. initiale — P01 obligatoire</span>}
                  {(!isFirstLogin || !editing) && <span style={{color:"#C41E3A",fontSize:9}}>(RH/Admin)</span>}
                </div>
                {isFirstLogin && editing ? (
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {ALL_PROCS.map(proc => {
                      const selected = (form.processes||["P01"]).includes(proc);
                      const mandatory = proc === "P01";
                      return (
                        <button key={proc} onClick={()=>toggleProcess(proc)}
                          style={{
                            background: selected ? (mandatory?"#C9A84C22":"#3B82F622") : T.surface3,
                            border: `1.5px solid ${selected ? (mandatory?"#C9A84C66":"#3B82F666") : T.border}`,
                            borderRadius:7, padding:"4px 10px", cursor: mandatory?"default":"pointer",
                            color: selected ? (mandatory?"#C9A84C":"#3B82F6") : T.textMuted,
                            fontSize:11, fontWeight: selected?700:400}}>
                          {proc}
                          {mandatory && <span style={{fontSize:9,marginLeft:4,color:"#C9A84C"}}>★</span>}
                          <span style={{fontSize:9,marginLeft:4,opacity:0.7}}>{PROC_LABELS_MAP[proc]}</span>
                        </button>
                      );
                    })}
                    <div style={{width:"100%",color:T.textDim,fontSize:9,marginTop:4}}>
                      ★ P01 est obligatoire pour le poste DG — cliquez sur les autres processus pour les ajouter/retirer
                    </div>
                  </div>
                ) : (
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {(currentUser.processes || [currentUser.process]).map(p => (
                      <span key={p} style={{background:"#3B82F622",color:"#3B82F6",border:"1px solid #3B82F644",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:600}}>
                        {p} <span style={{opacity:0.7,fontSize:9}}>{PROC_LABELS_MAP[p]}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Habilitations */}
              <div style={{ background:T.surface2,borderRadius:10,padding:14,border:`1px solid ${T.border}` }}>
                <div style={{ color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>🔐 Habilitations du compte</div>
                <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                  {(PERM_LABEL[currentUser.level]||[]).map(p=>(
                    <span key={p} style={{ background:"#22C55E22",color:"#22C55E",border:"1px solid #22C55E44",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:600 }}>{p}</span>
                  ))}
                </div>
              </div>

              {/* Edit buttons */}
              <div style={{ display:"flex",gap:8,marginTop:14 }}>
                {!editing ? (
                  <button onClick={()=>setEditing(true)} style={{ background:T.surface2,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:600 }}>✏️ Modifier mes informations</button>
                ) : (
                  <>
                    <button onClick={handleSave} style={{ background:"linear-gradient(135deg,#C41E3A,#E02244)",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontSize:12,fontWeight:700 }}>{saved?"✅ Enregistré !":"💾 Enregistrer"}</button>
                    <button onClick={()=>setEditing(false)} style={{ background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12 }}>Annuler</button>
                  </>
                )}
                {isFirstLogin ? (
                  <div style={{ background:"#C9A84C15",border:"1px solid #C9A84C44",borderRadius:8,padding:"8px 12px",color:"#C9A84C",fontSize:11 }}>
                    👑 Configuration initiale — Tous vos champs sont éditables cette unique fois. Après sauvegarde, les champs sensibles ne seront plus modifiables sans RH/Admin.
                  </div>
                ) : (
                  <div style={{ background:"#F59E0B15",border:"1px solid #F59E0B44",borderRadius:8,padding:"8px 12px",color:"#F59E0B",fontSize:11 }}>
                    ℹ️ Sexe, nationalité, situation matrimoniale ne sont modifiables que par RH/Admin (approbation DG requise)
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "docs_recu" && (
            <div>
              <h4 style={{ color:"#C41E3A",margin:"0 0 12px",fontSize:13 }}>📥 Documents reçus</h4>
              {["Note de service – Direction Générale (01/03/2026)", "Fiche de poste mise à jour (15/02/2026)", "Convocation réunion CODIR (28/02/2026)"].map(doc=>(
                <div key={doc} style={{ display:"flex",gap:10,alignItems:"center",padding:"8px 12px",background:T.surface2,borderRadius:8,border:`1px solid ${T.border}`,marginBottom:6 }}>
                  <span style={{ fontSize:16 }}>📄</span>
                  <span style={{ flex:1,color:T.text,fontSize:12 }}>{doc}</span>
                  <button onClick={()=>{ const bl=new Blob([doc],{type:"text/plain"});const ul=URL.createObjectURL(bl);const al=document.createElement("a");al.href=ul;al.download=doc.replace(/[^a-zA-Z0-9._-]/g,"_")+".txt";al.click();URL.revokeObjectURL(ul); }} style={{ background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 8px",color:T.textMuted,cursor:"pointer",fontSize:10 }} title="Télécharger">⬇</button>
                </div>
              ))}
            </div>
          )}

          {tab === "docs_envoye" && (
            <div>
              <h4 style={{ color:"#C41E3A",margin:"0 0 12px",fontSize:13 }}>📤 Documents envoyés</h4>
              {["Rapport mensuel d'activité – Février 2026", "QR Code dossier DOS-A01-O02.01/2026"].map(doc=>(
                <div key={doc} style={{ display:"flex",gap:10,alignItems:"center",padding:"8px 12px",background:T.surface2,borderRadius:8,border:`1px solid ${T.border}`,marginBottom:6 }}>
                  <span style={{ fontSize:16 }}>📤</span>
                  <span style={{ flex:1,color:T.text,fontSize:12 }}>{doc}</span>
                  <span style={{ color:T.textDim,fontSize:10 }}>01/03/2026</span>
                </div>
              ))}
            </div>
          )}

          {tab === "newsletter" && (
            <div>
              <h4 style={{ color:"#C41E3A",margin:"0 0 12px",fontSize:13 }}>📰 Newsletter Interne — Génie Consultant</h4>
              {/* FIX v142 — Newsletter dynamique depuis systemMsgs (annonces publiées dans le SI) */}
              {(() => {
                // Filtrer les messages visibles par cet utilisateur (tous ou par processus)
                const msgs = (systemMsgs||[])
                  .filter(m => m && (m.global || (m.targets||[]).includes(currentUser.id) || (m.targetProcesses||[]).some(p=>(currentUser.processes||[currentUser.process]).includes(p))))
                  .sort((a,b)=>new Date(b.at||b.date||0)-new Date(a.at||a.date||0))
                  .slice(0,20);
                if (msgs.length === 0) {
                  return (
                    <div style={{ textAlign:"center",color:T.textDim,fontSize:12,padding:"32px 0" }}>
                      <div style={{ fontSize:32,marginBottom:8 }}>📭</div>
                      Aucune annonce publiée pour le moment.<br/>
                      <span style={{ fontSize:11 }}>Les annonces et messages de la Direction apparaîtront ici.</span>
                    </div>
                  );
                }
                return msgs.map((n,i)=>(
                  <div key={n.id||i} style={{ background:T.surface2,borderRadius:10,border:`1px solid ${T.border}`,padding:"12px 14px",marginBottom:10 }}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6 }}>
                      <div style={{ color:T.text,fontWeight:700,fontSize:13 }}>{n.icon||"📢"} {n.title||n.subject||"Annonce"}</div>
                      <span style={{ color:T.textDim,fontSize:10,flexShrink:0,marginLeft:8 }}>
                        {n.at ? new Date(n.at).toLocaleDateString("fr-FR") : n.date||""}
                      </span>
                    </div>
                    {n.from && <div style={{ color:"#C41E3A",fontSize:10,marginBottom:6,fontWeight:600 }}>Par : {n.from}</div>}
                    <div style={{ color:T.textMuted,fontSize:12,lineHeight:1.6 }}>{n.message||n.body||n.content||""}</div>
                  </div>
                ));
              })()}
            </div>
          )}

          {tab === "securite" && (
            <div>
              <h4 style={{ color:"#C41E3A",margin:"0 0 12px",fontSize:13 }}>🔐 Sécurité du compte</h4>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <div style={{ background:T.surface2,borderRadius:10,padding:16,border:`1px solid ${T.border}` }}>
                  <div style={{ color:T.text,fontWeight:700,marginBottom:12,fontSize:13 }}>🔑 Changer mon mot de passe</div>
                  {[
                    { label:"Mot de passe actuel", key:"current" },
                    { label:"Nouveau mot de passe (min. 8 car.)", key:"newPwd" },
                    { label:"Confirmer le nouveau mot de passe", key:"confirm" },
                  ].map(f=>(
                    <div key={f.key} style={{ marginBottom:10 }}>
                      <label style={{ color:T.textMuted,fontSize:10,display:"block",marginBottom:3,fontWeight:700,textTransform:"uppercase" }}>{f.label}</label>
                      <input type="password" value={pwdForm[f.key]} onChange={e=>setPwdForm(p=>({...p,[f.key]:e.target.value}))}
                        placeholder="••••••••"
                        style={{ width:"100%",background:T.surface3,border:`1px solid ${T.border}`,borderRadius:7,padding:"8px 12px",color:T.text,fontSize:13,boxSizing:"border-box" }} />
                    </div>
                  ))}
                  {pwdMsg && (
                    <div style={{ background:pwdMsg.type==="ok"?"#22C55E15":"#EF444415", border:`1px solid ${pwdMsg.type==="ok"?"#22C55E":"#EF4444"}44`, borderRadius:8, padding:"8px 12px", color:pwdMsg.type==="ok"?"#22C55E":"#EF4444", fontSize:12, marginBottom:10, fontWeight:600 }}>
                      {pwdMsg.text}
                    </div>
                  )}
                  <button onClick={handleChangePassword} disabled={pwdLoading}
                    style={{ background:pwdLoading?"#555":"linear-gradient(135deg,#C41E3A,#E02244)",color:"#fff",border:"none",borderRadius:8,padding:"9px 20px",cursor:pwdLoading?"not-allowed":"pointer",fontSize:12,fontWeight:700 }}>
                    {pwdLoading?"⏳ Vérification...":"🔑 Mettre à jour le mot de passe"}
                  </button>
                  <div style={{ color:T.textDim,fontSize:10,marginTop:8 }}>
                    💡 Utilisez un mot de passe fort (minuscules, majuscules, chiffres, caractères spéciaux). Min. 8 caractères.
                  </div>
                </div>
                <div style={{ background:T.surface2,borderRadius:10,padding:14,border:`1px solid ${T.border}` }}>
                  <div style={{ color:T.text,fontWeight:600,fontSize:13,marginBottom:6 }}>Informations de session</div>
                  <div style={{ color:T.textMuted,fontSize:12 }}>Dernière connexion : {new Date().toLocaleString("fr-FR")}</div>
                  <div style={{ color:T.textMuted,fontSize:12,marginTop:4 }}>ID de session : SI-{Math.random().toString(36).slice(2,10).toUpperCase()}</div>
                </div>
              </div>
            </div>
          )}

          {/* ══ ONGLET MES DONNÉES / BACKUP ══ */}
          {tab === "backup" && (() => {
            const backupKey = `gc-user-backup-${currentUser.id}`;
            const savedBackup = (() => { try { return JSON.parse(_lsGet(backupKey)||"null"); } catch(_){ return null; } })();
            const handleSaveBackup = () => {
              const snap = { savedAt: new Date().toISOString(), version: "v57", data: { ...currentUser, password: undefined } };
              try { _lsSet(backupKey, JSON.stringify(snap)); gcAlert("✅ Données sauvegardées avec succès !"); }
              catch(e) { gcAlert("❌ Erreur sauvegarde : " + e.message); }
            };
            const handleRestoreBackup = async () => {
              if (!savedBackup) return;
              if (!await gcConfirm(`Restaurer les données du ${new Date(savedBackup.savedAt).toLocaleString("fr-FR")} ?\nLes informations actuelles seront remplacées (sauf le mot de passe).`)) return;
              const restored = { ...savedBackup.data, passwordHash: currentUser.passwordHash, password: undefined };
              onSave(restored);
              gcAlert("✅ Données restaurées depuis la sauvegarde.");
            };
            const handleRestoreInitial = async () => {
              if (!await gcConfirm("⚠️ Demander la restauration des données initiales pour ce compte ?\nUn administrateur devra valider.")) return;
              gcAlert("📩 Demande de restauration initiale envoyée à l'administrateur SI.");
            };
            const handleExport = () => {
              const exp = { exportedAt: new Date().toISOString(), user: { ...currentUser, passwordHash: undefined, password: undefined, passwordHistory: undefined } };
              const blob = new Blob([JSON.stringify(exp, null, 2)], {type:"application/json"});
              const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
              a.download = `gc-profil-${currentUser.id}-${new Date().toISOString().slice(0,10)}.json`;
              a.click(); URL.revokeObjectURL(a.href);
            };
            return (
              <div>
                <h4 style={{color:"#3B82F6",margin:"0 0 14px",fontSize:13}}>💾 Sauvegarde & Restauration de mes données</h4>

                {savedBackup ? (
                  <div style={{background:"#22C55E15",border:"1px solid #22C55E33",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:16}}>✅</span>
                      <span style={{color:"#22C55E",fontWeight:700,fontSize:12}}>Sauvegarde disponible</span>
                    </div>
                    <div style={{color:T.textMuted,fontSize:11}}>📅 {new Date(savedBackup.savedAt).toLocaleString("fr-FR")} · Version {savedBackup.version||"—"}</div>
                  </div>
                ) : (
                  <div style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:14,textAlign:"center"}}>
                    <div style={{color:T.textMuted,fontSize:12}}>Aucune sauvegarde enregistrée pour ce compte</div>
                  </div>
                )}

                <div style={{background:T.surface3,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                  <div style={{color:T.textMuted,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Données actuelles du compte</div>
                  {[["Nom complet",currentUser.name],["Rôle",currentUser.role],["Processus",(currentUser.processes||[currentUser.process]).join(", ")],["Niveau",`Niv.${currentUser.level}`],["Email",currentUser.email||"—"],["ID",currentUser.id]].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{color:T.textMuted,fontSize:11}}>{k}</span>
                      <span style={{color:T.text,fontSize:11,fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={handleSaveBackup} style={{background:"linear-gradient(135deg,#3B82F6,#2563EB)",border:"none",color:"#fff",borderRadius:9,padding:"11px",cursor:"pointer",fontWeight:800,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    💾 Sauvegarder mes données actuelles
                  </button>
                  {savedBackup && (
                    <button onClick={handleRestoreBackup} style={{background:"#22C55E22",border:"1px solid #22C55E44",color:"#22C55E",borderRadius:9,padding:"11px",cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                      ♻️ Restaurer depuis sauvegarde du {new Date(savedBackup.savedAt).toLocaleDateString("fr-FR")}
                    </button>
                  )}
                  <button onClick={handleRestoreInitial} style={{background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B",borderRadius:9,padding:"11px",cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    🔄 Demander restauration données initiales (Admin)
                  </button>
                  <button onClick={handleExport} style={{background:T.surface3,border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:9,padding:"11px",cursor:"pointer",fontWeight:600,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    📤 Exporter mes données (JSON)
                  </button>
                </div>

                <div style={{background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:8,padding:"8px 12px",marginTop:12}}>
                  <span style={{color:"#F59E0B",fontSize:10,fontWeight:600}}>ℹ️ Les mots de passe ne sont jamais inclus dans les sauvegardes ni les exports.</span>
                </div>
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
} // FIX v61: orphan INITIAL_MESSAGES tail supprimé + balises de fermeture ProfilePage restaurées
