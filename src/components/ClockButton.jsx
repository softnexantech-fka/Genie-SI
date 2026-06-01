import React, { useState, useEffect, useRef } from 'react';
import { _lsGet, _lsSet, playSound, dsSave } from '../core/index.js';

// ClockButton — Bouton d'horloge indépendant dans la barre supérieure
// Affiche: Heure actuelle + badge d'état (minuteur, chrono, alarmes)
// Au clic: Ouvre modal complet avec horloge, minuteur, chrono, alarmes

export function ClockButton({ T, setNotifications = () => {} }) {
  const [clockNow, setClockNow] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [clockTab, setClockTab] = useState("horloge"); // horloge | chrono | minuteur | alarmes

  // Chrono
  const [wChronoRunning, setWChronoRunning] = useState(false);
  const [wChronoMs, setWChronoMs] = useState(0);
  const [wChronoLaps, setWChronoLaps] = useState([]);
  const wChronoRef = useRef(null);

  // Minuteur
  const [wTimerH, setWTimerH] = useState("0");
  const [wTimerM, setWTimerM] = useState("5");
  const [wTimerS, setWTimerS] = useState("0");
  const [wTimerMs, setWTimerMs] = useState(0);
  const [wTimerTotal, setWTimerTotal] = useState(0);
  const [wTimerRunning, setWTimerRunning] = useState(false);
  const [wTimerDone, setWTimerDone] = useState(false);
  const wTimerRef = useRef(null);
  const [wAlarmLabel, setWAlarmLabel] = useState("");

  // Alarmes
  const [wAlarms, setWAlarms] = useState(() => {
    try { return JSON.parse(_lsGet("gc-widget-alarms") || "[]"); } catch (_) { return []; }
  });
  const [wAlarmTime, setWAlarmTime] = useState(() => {
    const n = new Date(); n.setMinutes(n.getMinutes() + 5);
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  });
  const [wAlarmNewLabel, setWAlarmNewLabel] = useState("");
  const [wAlarmRepeat, setWAlarmRepeat] = useState("once");
  const [wAlarmRinging, setWAlarmRinging] = useState(null);
  const [wTimerToastVisible, setWTimerToastVisible] = useState(false);

  const ref = useRef(null);

  // Update horloge
  useEffect(() => {
    const t = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Chrono tick
  useEffect(() => {
    if (wChronoRunning) {
      wChronoRef.current = setInterval(() => setWChronoMs(p => p + 10), 10);
    } else clearInterval(wChronoRef.current);
    return () => clearInterval(wChronoRef.current);
  }, [wChronoRunning]);

  // Minuteur tick
  useEffect(() => {
    if (wTimerRunning && wTimerMs > 0) {
      wTimerRef.current = setInterval(() => setWTimerMs(p => {
        if (p <= 100) {
          clearInterval(wTimerRef.current);
          setWTimerRunning(false);
          setWTimerDone(true);
          setWTimerToastVisible(true);
          playSound("alarm");
          playSound("alarm");
          setNotifications(q => [{
            id: "N" + Date.now(),
            icon: "⏱️",
            message: `⏱️ Minuteur terminé${wAlarmLabel ? " : " + wAlarmLabel : ""}`,
            at: new Date().toISOString(),
            read: false
          }, ...q]);
          return 0;
        }
        return p - 100;
      }), 100);
    } else clearInterval(wTimerRef.current);
    return () => clearInterval(wTimerRef.current);
  }, [wTimerRunning, wAlarmLabel, setNotifications]);

  // Alarmes check
  useEffect(() => {
    if (!open) return;
    const nowStr = `${String(clockNow.getHours()).padStart(2, "0")}:${String(clockNow.getMinutes()).padStart(2, "0")}`;
    if (clockNow.getSeconds() !== 0) return;
    const firing = wAlarms.filter(a => a.active && a.time === nowStr && !a.fired);
    if (firing.length > 0) {
      const a = firing[0];
      setWAlarmRinging(a);
      playSound("alarm");
      playSound("alarm");
      setNotifications(p => [{
        id: "N" + Date.now(),
        icon: "⏰",
        message: `⏰ ALARME : ${a.label || "Rappel"} — ${a.time}`,
        at: clockNow.toISOString(),
        read: false
      }, ...p]);
      wSaveAlarms(wAlarms.map(x => x.id === a.id ? { ...x, fired: x.repeat !== "daily" } : x));
      setClockTab("alarmes");
    }
  }, [clockNow, open]);

  // Close on click outside
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const wSaveAlarms = (a) => {
    setWAlarms(a);
    try { _lsSet("gc-widget-alarms", JSON.stringify(a)); dsSave("gc-widget-alarms", a).catch(() => {}); } catch (_) { }
  };

  const wFmtChrono = (ms) => {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), cs = Math.floor((ms % 1000) / 10);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  const wFmtTimer = (ms) => {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const wStartTimer = () => {
    const total = (parseInt(wTimerH, 10) || 0) * 3600000 + (parseInt(wTimerM, 10) || 0) * 60000 + (parseInt(wTimerS, 10) || 0) * 1000;
    if (total <= 0) return;
    setWTimerMs(total);
    setWTimerTotal(total);
    setWTimerDone(false);
    setWTimerRunning(true);
    setWTimerToastVisible(false);
  };

  const handleAddAlarm = () => {
    if (!wAlarmTime) return;
    const newAlarm = {
      id: `ALARM-${Date.now()}`,
      time: wAlarmTime,
      label: wAlarmNewLabel,
      active: true,
      repeat: wAlarmRepeat,
      fired: false,
    };
    wSaveAlarms([...wAlarms, newAlarm]);
    setWAlarmNewLabel("");
    const n = new Date();
    n.setMinutes(n.getMinutes() + 5);
    setWAlarmTime(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`);
    setWAlarmRepeat("once");
  };

  const handleDeleteAlarm = (id) => {
    wSaveAlarms(wAlarms.filter(a => a.id !== id));
  };

  // Calcul badge count
  const badgeCount = (wTimerDone ? 1 : 0) + (wTimerRunning ? 1 : 0) + (wChronoRunning ? 1 : 0) + (wAlarmRinging ? 1 : 0) + wAlarms.filter(a => a.active).length;
  const hasBadge = badgeCount > 0;

  // Couleur badge
  const badgeBg = wTimerDone || wAlarmRinging ? "#EF4444" : wTimerRunning || wChronoRunning ? "#F59E0B" : "#22C55E";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Toast notification minuteur terminé */}
      {wTimerToastVisible && !open && (
        <div
          onClick={() => { setOpen(true); setClockTab("minuteur"); setWTimerToastVisible(false); }}
          style={{
            position: "absolute",
            top: -40,
            right: 0,
            background: "#C41E3A",
            color: "#fff",
            borderRadius: 999,
            padding: "6px 12px",
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(196,30,58,0.5)",
            whiteSpace: "nowrap",
            zIndex: 701,
            animation: "pulse 0.8s ease-in-out infinite",
          }}
        >
          ⏱️ Minuteur terminé
        </div>
      )}

      {/* Bouton horloge */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); setWTimerToastVisible(false); }}
        title="Horloge - Minuteur - Chrono - Alarmes"
        style={{
          background: T.surface2,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: "5px 10px",
          cursor: "pointer",
          color: T.textMuted,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 6,
          position: "relative",
          fontWeight: 700,
        }}
      >
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#C41E3A", fontWeight: 900 }}>
          {String(clockNow.getHours()).padStart(2, "0")}:{String(clockNow.getMinutes()).padStart(2, "0")}
        </span>
        <span>🕐</span>

        {/* Badge d'état */}
        {hasBadge && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              padding: "0 4px",
              borderRadius: 999,
              background: badgeBg,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 900,
              border: "2px solid " + T.surface,
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              animation: (wTimerDone || wAlarmRinging) ? "pulse 0.8s ease-in-out infinite" : "none",
            }}
          >
            {badgeCount}
          </span>
        )}
      </button>

      {/* Modal */}
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: "absolute",
            right: 0,
            top: 42,
            width: 520,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            boxShadow: "0 16px 48px #0009",
            zIndex: 700,
            maxHeight: "90vh",
            overflowY: "auto",
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, padding: "8px 8px 0", borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
            {[
              { id: "horloge", icon: "🕐", label: "Horloge" },
              { id: "chrono", icon: "⏱️", label: "Chrono" },
              { id: "minuteur", icon: "⏲️", label: "Minuteur" },
              { id: "alarmes", icon: "⏰", label: "Alarmes" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setClockTab(t.id)}
                style={{
                  flex: "0 0 auto",
                  background: clockTab === t.id ? "#C41E3A22" : "transparent",
                  border: "none",
                  borderBottom: clockTab === t.id ? "2px solid #C41E3A" : "2px solid transparent",
                  color: clockTab === t.id ? "#C41E3A" : T.textMuted,
                  cursor: "pointer",
                  padding: "6px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div style={{ padding: 12 }}>
            {/* HORLOGE */}
            {clockTab === "horloge" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 8, fontWeight: 700 }}>
                  {clockNow.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 56, fontWeight: 900, color: "#C41E3A", letterSpacing: 2, marginBottom: 12 }}>
                  {String(clockNow.getHours()).padStart(2, "0")}:{String(clockNow.getMinutes()).padStart(2, "0")}:{String(clockNow.getSeconds()).padStart(2, "0")}
                </div>
                <div style={{ color: T.textDim, fontSize: 11, fontStyle: "italic" }}>
                  Il est {clockNow.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            )}

            {/* CHRONO */}
            {clockTab === "chrono" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 40, fontWeight: 900, color: "#22C55E", marginBottom: 16, letterSpacing: 1 }}>
                  {wFmtChrono(wChronoMs)}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
                  <button
                    onClick={() => setWChronoRunning(r => !r)}
                    style={{ background: wChronoRunning ? "#F59E0B" : "#22C55E", border: "none", color: "#fff", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontWeight: 800, fontSize: 13 }}
                  >
                    {wChronoRunning ? "⏸ Pause" : "▶ Démarrer"}
                  </button>
                  <button
                    onClick={() => { const lap = { id: `LAP-${wChronoLaps.length + 1}`, ms: wChronoMs, time: wFmtChrono(wChronoMs) }; setWChronoLaps([lap, ...wChronoLaps]); }}
                    style={{ background: "#3B82F6", border: "none", color: "#fff", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontWeight: 800, fontSize: 13 }}
                  >
                    🔖 Tour
                  </button>
                  <button
                    onClick={() => { setWChronoMs(0); setWChronoLaps([]); setWChronoRunning(false); }}
                    style={{ background: "#EF444422", border: "1px solid #EF444444", color: "#EF4444", borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}
                  >
                    ↻ RAZ
                  </button>
                </div>
                {wChronoLaps.length > 0 && (
                  <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                    {wChronoLaps.map((lap, i) => (
                      <div key={lap.id} style={{ display: "flex", justifyContent: "space-between", background: T.surface2, borderRadius: 6, padding: "5px 10px" }}>
                        <span style={{ color: T.textMuted, fontSize: 11 }}>Tour {lap.id}</span>
                        <span style={{ color: "#22C55E", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{lap.time}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MINUTEUR */}
            {clockTab === "minuteur" && (
              <div style={{ textAlign: "center" }}>
                {!wTimerRunning && !wTimerDone && wTimerMs === 0 ? (
                  <div>
                    <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Régler le minuteur</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 }}>
                      {[["h", wTimerH, setWTimerH, "Heures"], ["m", wTimerM, setWTimerM, "Minutes"], ["s", wTimerS, setWTimerS, "Secondes"]].map(([k, v, set, label], i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span style={{ color: T.textMuted, fontSize: 24, fontWeight: 900 }}>:</span>}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            <button onClick={() => set(p => String(Math.min(k === "h" ? 23 : 59, parseInt(p || 0, 10) + 1)))} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer", color: T.textMuted, fontSize: 14 }}>▲</button>
                            <input type="number" value={v} onChange={e => set(String(Math.max(0, Math.min(k === "h" ? 23 : 59, parseInt(e.target.value, 10) || 0))))}
                              style={{ width: 52, background: "linear-gradient(135deg,#050D1A,#0A1E3A)", border: "2px solid #C41E3A33", borderRadius: 8, padding: "8px 4px", color: "#C41E3A", fontSize: 22, fontFamily: "monospace", fontWeight: 900, textAlign: "center" }} />
                            <button onClick={() => set(p => String(Math.max(0, parseInt(p || 0, 10) - 1)))} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer", color: T.textMuted, fontSize: 14 }}>▼</button>
                            <span style={{ color: T.textDim, fontSize: 9 }}>{label}</span>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                    {/* Presets */}
                    <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
                      {[[1, "1 min"], [5, "5 min"], [10, "10 min"], [15, "15 min"], [30, "30 min"], [60, "1 h"]].map(([mins, label]) => (
                        <button key={mins} onClick={() => { setWTimerH("0"); setWTimerM(String(mins >= 60 ? mins / 60 : mins)); setWTimerS("0"); if (mins >= 60) { setWTimerH(String(Math.floor(mins / 60))); setWTimerM("0"); } }}
                          style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 20, padding: "4px 10px", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>{label}</button>
                      ))}
                    </div>
                    <input value={wAlarmLabel} onChange={e => setWAlarmLabel(e.target.value)} placeholder="Étiquette du minuteur (optionnel)…"
                      style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", color: T.text, fontSize: 11, boxSizing: "border-box", marginBottom: 10 }} />
                    <button onClick={wStartTimer} style={{ background: "linear-gradient(135deg,#C41E3A,#E02244)", border: "none", color: "#fff", borderRadius: 10, padding: "11px 30px", cursor: "pointer", fontWeight: 800, fontSize: 14 }}>▶ Démarrer</button>
                  </div>
                ) : (
                  <div>
                    {/* Circular progress */}
                    <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto 12px" }}>
                      <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="70" cy="70" r="60" fill="none" stroke={T.surface2} strokeWidth="8" />
                        <circle cx="70" cy="70" r="60" fill="none" stroke={wTimerDone ? "#22C55E" : "#C41E3A"} strokeWidth="8"
                          strokeDasharray={`${2 * Math.PI * 60}`}
                          strokeDashoffset={`${2 * Math.PI * 60 * (1 - (wTimerTotal > 0 ? wTimerMs / wTimerTotal : 0))}`}
                          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.1s linear" }} />
                      </svg>
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                        {wTimerDone ? (
                          <div style={{ fontSize: 28, animation: "pulse 0.5s infinite alternate" }}>⏰</div>
                        ) : (
                          <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 900, color: wTimerMs < 30000 ? "#EF4444" : wTimerMs < 60000 ? "#F59E0B" : "#C41E3A" }}>{wFmtTimer(wTimerMs)}</div>
                        )}
                        {wAlarmLabel && <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>{wAlarmLabel}</div>}
                      </div>
                    </div>
                    {wTimerDone ? (
                      <div>
                        <div style={{ color: "#22C55E", fontWeight: 800, fontSize: 14, marginBottom: 8 }}>✅ Temps écoulé !</div>
                        <button onClick={() => { setWTimerMs(0); setWTimerTotal(0); setWTimerDone(false); setWAlarmLabel(""); }}
                          style={{ background: "#3B82F6", border: "none", color: "#fff", borderRadius: 10, padding: "10px 24px", cursor: "pointer", fontWeight: 800, fontSize: 13 }}>Nouveau minuteur</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button onClick={() => setWTimerRunning(r => !r)} style={{ background: wTimerRunning ? "#F59E0B" : "#22C55E", border: "none", color: "#fff", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontWeight: 800, fontSize: 13 }}>
                          {wTimerRunning ? "⏸ Pause" : "▶ Reprendre"}
                        </button>
                        <button onClick={() => { setWTimerMs(0); setWTimerTotal(0); setWTimerRunning(false); setWTimerDone(false); }}
                          style={{ background: "#EF444422", border: "1px solid #EF444444", color: "#EF4444", borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>⏹ Annuler</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ALARMES */}
            {clockTab === "alarmes" && (
              <div>
                {wAlarmRinging && (
                  <div style={{ background: "#C41E3A", borderRadius: 10, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, animation: "pulse 0.5s infinite alternate" }}>
                    <span style={{ fontSize: 24 }}>⏰</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>ALARME ! — {wAlarmRinging.time}</div>
                      <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 11 }}>{wAlarmRinging.label || "Rappel"}</div>
                    </div>
                    <button onClick={() => setWAlarmRinging(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Snooze +5 min</button>
                    <button onClick={() => setWAlarmRinging(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                )}
                {/* Add alarm */}
                <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={{ color: T.textDim, fontSize: 9, display: "block", marginBottom: 3, fontWeight: 700 }}>Heure</label>
                      <input type="time" value={wAlarmTime} onChange={e => setWAlarmTime(e.target.value)}
                        style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 8px", color: T.text, fontSize: 11, boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ color: T.textDim, fontSize: 9, display: "block", marginBottom: 3, fontWeight: 700 }}>Répétition</label>
                      <select value={wAlarmRepeat} onChange={e => setWAlarmRepeat(e.target.value)}
                        style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 8px", color: T.text, fontSize: 11, boxSizing: "border-box" }}>
                        <option value="once">Une fois</option>
                        <option value="daily">Quotidien</option>
                      </select>
                    </div>
                  </div>
                  <input value={wAlarmNewLabel} onChange={e => setWAlarmNewLabel(e.target.value)} placeholder="Libellé (optionnel)…"
                    style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 8px", color: T.text, fontSize: 11, boxSizing: "border-box", marginBottom: 8 }} />
                  <button onClick={handleAddAlarm} style={{ width: "100%", background: "#C41E3A", border: "none", color: "#fff", borderRadius: 8, padding: "8px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                    + Ajouter alarme
                  </button>
                </div>
                {/* Liste des alarmes */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                  {wAlarms.length === 0 ? (
                    <div style={{ color: T.textDim, fontSize: 11, textAlign: "center", padding: "16px 0" }}>Aucune alarme programmée</div>
                  ) : (
                    wAlarms.map(a => (
                      <div key={a.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: T.text, fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{a.time}</div>
                          {a.label && <div style={{ color: T.textDim, fontSize: 10 }}>{a.label}</div>}
                          <div style={{ color: T.textMuted, fontSize: 9 }}>{a.repeat === "daily" ? "Quotidien" : "Une fois"}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                            <input type="checkbox" checked={a.active} onChange={e => wSaveAlarms(wAlarms.map(x => x.id === a.id ? { ...x, active: e.target.checked } : x))} style={{ cursor: "pointer" }} />
                          </label>
                          <button onClick={() => handleDeleteAlarm(a.id)} style={{ background: "#EF444422", border: "none", color: "#EF4444", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
