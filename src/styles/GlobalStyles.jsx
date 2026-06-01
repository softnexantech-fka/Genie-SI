import { useEffect } from 'react';
import { playSound } from '../core/index.js';
// GlobalStyles — SI Génie Consultant v127

export const GlobalStyles = () => {
  useEffect(() => {
    const globalClickHandler = (e) => {
      const btn = e.target.closest("button, [role='button'], .gc-clickable");
      if (btn && !btn.disabled) {
        playSound("notif");
        const ripple = document.createElement("span");
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        ripple.style.cssText = `
          position:absolute;width:${size}px;height:${size}px;
          left:${e.clientX - rect.left - size/2}px;
          top:${e.clientY - rect.top - size/2}px;
          background:rgba(255,255,255,0.25);border-radius:50%;
          transform:scale(0);animation:gc-ripple 0.5s ease-out forwards;
          pointer-events:none;z-index:999;
        `;
        if (getComputedStyle(btn).position === "static") btn.style.position = "relative";
        btn.style.overflow = "hidden";
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      }
    };
    document.addEventListener("click", globalClickHandler, true);

    const style = document.createElement("style");
    style.id = "gc-si-v40";
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; }
      /* FIX v84 — text-align:left global pour couper tout héritage de centrage navigateur */
      body { font-family:'Segoe UI',system-ui,-apple-system,sans-serif; background:#060F1E; text-align:left; }
      div, span, p, section, article, aside, header, footer, main, nav,
      label, td, th, li, ul, ol { text-align:inherit; }

      /* Zone de contenu principale — reset fort pour éviter tout héritage accidentel.
         On cible uniquement les descendants directs de niveau div/p/span qui n'ont PAS
         de style inline textAlign, évitant d'écraser les KPI/stat boxes intentionnels. */
      .gc-module-content {
        text-align: left;
      }
      /* Cas spéciaux gardant le centrage explicite (KPIs, badges, stats, empty-states) */
      .gc-module-content .gc-center {
        text-align: center !important;
      }
      #root { width:100vw; height:100vh; overflow:hidden; display:flex; flex-direction:column; }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #1E3A5F66; border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: #C41E3A99; }
      input, select, textarea, button { font-family: inherit; }
      select { -webkit-appearance: auto; appearance: auto; }

      /* -- UNIVERSAL BUTTON SYSTEM ------------------------------ */
      button {
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: transform 0.15s cubic-bezier(0.34,1.56,0.64,1),
                    box-shadow 0.15s ease,
                    background 0.15s ease,
                    opacity 0.15s ease;
        user-select: none;
        -webkit-user-select: none;
        outline: none;
        border-radius: 8px;
        font-family: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        z-index: 1;
      }
      button:hover:not(:disabled) { transform: translateY(-1px) scale(1.02); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
      button:active:not(:disabled) { transform: scale(0.95) !important; box-shadow: 0 1px 4px rgba(0,0,0,0.3) !important; }
      button:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; pointer-events: none; }
      button:focus-visible { outline: 2px solid #C41E3A; outline-offset: 2px; }

      /* -- RIPPLE ANIMATION -------------------------------------- */
      @keyframes gc-ripple { to { transform: scale(1); opacity: 0; } }
      @keyframes gc-bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
      @keyframes gc-slide-up { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }

      /* -- CARD 3D HOVER EFFECTS -------------------------------- */
      .gc-hover-card {
        transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease;
        cursor: pointer;
        transform-style: preserve-3d;
      }
      .gc-hover-card:hover {
        transform: translateY(-4px) rotateX(2deg) scale(1.01);
        box-shadow: 0 16px 48px rgba(0,0,0,0.45), 0 4px 12px rgba(196,30,58,0.15) !important;
      }
      .gc-hover-card:active { transform: translateY(-1px) scale(0.99); }

      /* -- CARD PANELS ------------------------------------------- */
      .gc-card-3d {
        border-radius: 14px;
        transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
        transform-origin: center bottom;
      }
      .gc-card-3d:hover {
        transform: translateY(-3px);
        box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(196,30,58,0.1), inset 0 1px 0 rgba(255,255,255,0.07);
      }

      /* -- CLICKABLE ROWS ---------------------------------------- */
      .gc-clickable {
        cursor: pointer;
        transition: background 0.15s, transform 0.15s;
        position: relative; overflow: hidden;
      }
      .gc-clickable:hover { background: rgba(196,30,58,0.06) !important; }
      .gc-clickable:active { transform: scale(0.99); }

      /* -- RESPONSIVE -------------------------------------------- */
      @media (max-width: 900px) {
        .gc-sidebar-full { width: 58px !important; }
        .gc-sidebar-label { display: none !important; }
        .gc-topbar-role { display: none !important; }
        .gc-grid-4 { grid-template-columns: repeat(2,1fr) !important; }
        .gc-grid-3 { grid-template-columns: repeat(2,1fr) !important; }
        .gc-grid-2 { grid-template-columns: 1fr !important; }
      }
      @media (max-width: 600px) {
        .gc-grid-4, .gc-grid-3, .gc-grid-2 { grid-template-columns: 1fr !important; }
        .gc-login-card { padding: 24px 18px !important; }
        .gc-content-pad { padding: 10px !important; }
        .gc-modal-wide { width: 98vw !important; }
        .gc-hide-sm { display: none !important; }
        .gc-tabs-scroll button { font-size: 10px !important; padding: 6px 9px !important; }
        .gc-topbar-title { font-size: 11px !important; }
      }

      /* -- ENTRY ANIMATIONS -------------------------------------- */
      @keyframes gc-fade-in   { from{opacity:0;transform:translateY(8px)}  to{opacity:1;transform:translateY(0)} }
      @keyframes gc-fade-up   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes gc-fade-left { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
      @keyframes gc-zoom-in   { from{opacity:0;transform:scale(0.92)}      to{opacity:1;transform:scale(1)} }
      @keyframes gc-slide-down{ from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)} }
      .gc-fade-in   { animation: gc-fade-in   0.3s cubic-bezier(0.22,1,0.36,1) both; }
      .gc-fade-up   { animation: gc-fade-up   0.5s cubic-bezier(0.22,1,0.36,1) both; }
      .gc-fade-left { animation: gc-fade-left 0.35s cubic-bezier(0.22,1,0.36,1) both; }
      .gc-zoom-in   { animation: gc-zoom-in   0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
      .gc-slide-down{ animation: gc-slide-down 0.3s cubic-bezier(0.22,1,0.36,1) both; }

      /* ── Cloche de notification — secousse périodique + anneau pulsant ── */
      @keyframes gc-bell-shake {
        /* Secousse sur les 20% premiers puis silence — durée totale 5s → secousse 1s, pause 4s */
        0%    { transform: rotate(0deg) scale(1); }
        2%    { transform: rotate(-18deg) scale(1.12); }
        4%    { transform: rotate(16deg)  scale(1.12); }
        6%    { transform: rotate(-12deg) scale(1.06); }
        8%    { transform: rotate(10deg)  scale(1.06); }
        10%   { transform: rotate(-6deg)  scale(1.02); }
        12%   { transform: rotate(5deg)   scale(1.02); }
        14%   { transform: rotate(-3deg)  scale(1); }
        16%   { transform: rotate(2deg)   scale(1); }
        18%,100% { transform: rotate(0deg) scale(1); }
      }
      @keyframes gc-notif-ring {
        0%   { opacity: 0.8; transform: scale(1); }
        80%  { opacity: 0;   transform: scale(1.7); }
        100% { opacity: 0;   transform: scale(1.7); }
      }
      .gc-bell-shake {
        animation: gc-bell-shake 5s ease-in-out infinite;
        transform-origin: center 20%;
        display: inline-block;
      }
      .gc-notif-ring {
        animation: gc-notif-ring 2s ease-out infinite;
      }

      /* Staggered children */
      .gc-stagger > *:nth-child(1){animation-delay:0ms}
      .gc-stagger > *:nth-child(2){animation-delay:60ms}
      .gc-stagger > *:nth-child(3){animation-delay:120ms}
      .gc-stagger > *:nth-child(4){animation-delay:180ms}
      .gc-stagger > *:nth-child(5){animation-delay:240ms}
      .gc-stagger > *:nth-child(6){animation-delay:300ms}
      .gc-stagger > *:nth-child(7){animation-delay:360ms}
      .gc-stagger > *:nth-child(8){animation-delay:420ms}

      /* -- STATUS PULSE ------------------------------------------ */
      @keyframes gc-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      @keyframes gc-pulse-scale { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
      .gc-pulse { animation: gc-pulse 1.6s ease-in-out infinite; }
      .gc-pulse-scale { animation: gc-pulse-scale 2s ease-in-out infinite; }

      /* ── BADGE UNIFIÉ : surbrillance circulaire (ripple sonar) ── */
      /* Une seule animation pour tous les badges — couleur portée par background.
         Le badge pulse légèrement sur lui-même pendant qu'un anneau circulaire
         s'étend et s'efface, créant l'effet "sonar / réponse circulaire". */

      @keyframes gc-badge-core {
        0%,100% { transform: scale(1);   filter: brightness(1); }
        50%      { transform: scale(1.12); filter: brightness(1.25); }
      }
      @keyframes gc-badge-ring {
        0%   { transform: scale(1);    opacity: 0.7; }
        80%  { transform: scale(2.2);  opacity: 0; }
        100% { transform: scale(2.2);  opacity: 0; }
      }

      /* Classe principale — s'applique au badge lui-même */
      .gc-badge-live {
        position: relative;
        animation: gc-badge-core 2.4s ease-in-out infinite;
        overflow: visible !important;
      }
      /* Anneau circulaire qui rayonne depuis le badge */
      .gc-badge-live::after {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: inherit;   /* suit la forme du badge (rond ou pill) */
        background: inherit;      /* même couleur que le badge */
        animation: gc-badge-ring 2.4s ease-out infinite;
        pointer-events: none;
        z-index: -1;
      }
      /* Alias rétrocompat (ancien gc-badge-ping) */
      .gc-badge-ping { /* keep for non-sidebar uses */ }
      .gc-badge-ping::before {
        content:''; position:absolute; inset:0; border-radius:50%;
        background:inherit; animation:gc-badge-ring 1.5s cubic-bezier(0,0,0.2,1) infinite;
      }

      /* -- NOTIFICATION BELL ------------------------------------- */
      @keyframes gc-ring { 0%,100%{transform:rotate(0)} 10%{transform:rotate(-15deg)} 20%{transform:rotate(15deg)} 30%{transform:rotate(-10deg)} 40%{transform:rotate(10deg)} 50%{transform:rotate(0)} }
      .gc-ring { animation: gc-ring 0.7s ease; }

      /* -- MODULE PAGE TRANSITIONS ------------------------------- */
      .gc-module-enter { animation: gc-fade-in 0.35s cubic-bezier(0.22,1,0.36,1) both; }

      /* -- KPI NUMBER COUNT -------------------------------------- */
      @keyframes gc-count-up { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
      .gc-count-up { animation: gc-count-up 0.5s cubic-bezier(0.22,1,0.36,1) both; }

      /* -- GRADIENT SHIMMER -------------------------------------- */
      @keyframes gc-shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
      .gc-shimmer {
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%);
        background-size: 200% 100%;
        animation: gc-shimmer 2.5s ease infinite;
      }

      /* -- TOPBAR GLOW ------------------------------------------- */
      @keyframes gc-glow-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(196,30,58,0)} 50%{box-shadow:0 0 16px 2px rgba(196,30,58,0.18)} }
      .gc-glow-pulse { animation: gc-glow-pulse 3s ease-in-out infinite; }

      /* -- SCROLL PAGE ------------------------------------------- */
      .gc-scroll-page { width:100vw; height:100vh; overflow-y:auto; overflow-x:hidden; position:fixed; inset:0; }

      /* -- COVER / LOCK SCREEN ----------------------------------- */
      @keyframes gc-cover-float  { 0%,100%{transform:translateY(0)}   50%{transform:translateY(-10px)} }
      @keyframes gc-cover-glow   { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
      @keyframes gc-cover-scan   { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
      @keyframes gc-cover-spin   { from{transform:rotate(0deg)}   to{transform:rotate(360deg)} }
      @keyframes gc-cover-orbit  { from{transform:rotate(0deg) translateX(80px) rotate(0deg)} to{transform:rotate(360deg) translateX(80px) rotate(-360deg)} }
      @keyframes gc-cover-blink  { 0%,90%,100%{opacity:1} 95%{opacity:0} }
      @keyframes gc-particle-float {
        0%   { transform:translateY(100vh) translateX(0) scale(0);  opacity:0; }
        10%  { opacity:0.7;  transform:translateY(80vh) translateX(10px) scale(1); }
        90%  { opacity:0.3;  transform:translateY(10vh) translateX(-15px) scale(0.8); }
        100% { transform:translateY(-5vh) translateX(0) scale(0); opacity:0; }
      }
      .gc-particle { position:absolute; border-radius:50%; pointer-events:none; animation:gc-particle-float linear infinite; }
      @keyframes gc-unlock-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(196,30,58,0.5)} 50%{box-shadow:0 0 0 20px rgba(196,30,58,0)} }
      .gc-unlock-btn { animation: gc-unlock-pulse 2.2s ease-in-out infinite; }

      /* -- MODAL ENTRY ------------------------------------------- */
      @keyframes gc-modal-in { from{opacity:0;transform:scale(0.92) translateY(24px)} to{opacity:1;transform:scale(1) translateY(0)} }
      .gc-modal-in { animation: gc-modal-in 0.28s cubic-bezier(0.34,1.56,0.64,1) both; }

      /* -- INPUT FOCUS ------------------------------------------- */
      input:focus, textarea:focus, select:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(196,30,58,0.3) !important;
        border-color: #C41E3A !important;
        transition: box-shadow 0.2s, border-color 0.2s;
      }

      /* -- SIDEBAR NAV ITEMS ------------------------------------- */
      .gc-nav-item { transition: all 0.18s ease; border-radius: 8px; }
      .gc-nav-item:hover { transform: translateX(3px); }
      .gc-nav-item.active { transform: translateX(2px); }

      /* -- STATUS DOTS ------------------------------------------- */
      @keyframes gc-dot-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.7} }
      .gc-dot-online { animation: gc-dot-pulse 2s ease-in-out infinite; }

      /* -- TERMINAL CURSOR --------------------------------------- */
      @keyframes gc-cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
      .gc-cursor { animation: gc-cursor-blink 1s step-end infinite; }

      /* -- PROGRESS BAR FILL ------------------------------------- */
      @keyframes gc-fill { from{width:0} }
      .gc-progress-fill { animation: gc-fill 1s cubic-bezier(0.22,1,0.36,1) both; }

      /* -- 3D PERSPECTIVE SECTION HEADERS ------------------------ */
      .gc-section-header {
        background: linear-gradient(90deg, #C41E3A08, transparent);
        border-left: 3px solid #C41E3A;
        padding: 8px 12px;
        border-radius: 0 8px 8px 0;
        margin-bottom: 14px;
      }

      /* -- GLASS MORPHISM CARDS ---------------------------------- */
      .gc-glass {
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        background: rgba(10,22,40,0.72) !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
      }

      /* -- LIVE BADGE -------------------------------------------- */
      @keyframes gc-live-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.6)} 50%{box-shadow:0 0 0 8px rgba(34,197,94,0)} }
      .gc-live-dot { animation: gc-live-pulse 1.5s ease-in-out infinite; }

      /* -- FILE CARD HOVER --------------------------------------- */
      .gc-file-card { transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1); }
      .gc-file-card:hover { transform: translateY(-4px) scale(1.03); }

      /* -- TABLE ROW HOVER --------------------------------------- */
      .gc-tr-hover:hover { background: rgba(196,30,58,0.04) !important; }

      /* -- PRINTER CARD ------------------------------------------ */
      @keyframes gc-printer-busy { 0%,100%{transform:translateY(0)} 25%{transform:translateY(-3px)} 75%{transform:translateY(3px)} }
      .gc-printing { animation: gc-printer-busy 0.4s ease-in-out infinite; }

      /* -- IMPROVED SCROLLBAR ------------------------------------ */
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 99px; }
      ::-webkit-scrollbar-thumb { background: linear-gradient(135deg,#1E3A5F,#C41E3A55); border-radius: 99px; }
      ::-webkit-scrollbar-thumb:hover { background: linear-gradient(135deg,#C41E3A,#E02244); }

      /* -- ADMIN TABS SCROLL ------------------------------------- */
      .gc-tabs-scroll { overflow-x: auto; scrollbar-width: thin; scroll-behavior: smooth; }
      .gc-tabs-scroll::-webkit-scrollbar { height: 3px; }
      .gc-tabs-scroll::-webkit-scrollbar-track { background: transparent; }
      .gc-tabs-scroll::-webkit-scrollbar-thumb { background: rgba(196,30,58,0.3); border-radius: 99px; }

      /* -- GLOW BORDERS ------------------------------------------ */
      .gc-glow-red { box-shadow: 0 0 20px rgba(196,30,58,0.25), inset 0 1px 0 rgba(255,255,255,0.05); }
      .gc-glow-blue { box-shadow: 0 0 20px rgba(59,130,246,0.2); }
      .gc-glow-gold { box-shadow: 0 0 20px rgba(201,168,76,0.2); }

      /* -- CONTEXT MENU ------------------------------------------ */
      .gc-ctx-menu {
        position: fixed; z-index: 9998;
        background: rgba(10,22,40,0.97);
        border: 1px solid rgba(30,58,95,0.8);
        border-radius: 10px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.5);
        backdrop-filter: blur(12px);
        min-width: 180px;
        animation: gc-zoom-in 0.15s ease;
      }
      .gc-ctx-item { padding: 9px 16px; color: #E8EDF5; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.12s; border-radius: 6px; }
      .gc-ctx-item:hover { background: rgba(196,30,58,0.15); }

      /* -- DRAG & DROP ZONE -------------------------------------- */
      .gc-dropzone-active {
        border-color: #3B82F6 !important;
        background: rgba(59,130,246,0.06) !important;
        box-shadow: 0 0 0 2px rgba(59,130,246,0.3);
      }

      /* -- STATS NUMBER ANIMATION -------------------------------- */
      @keyframes gc-num-up { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
      .gc-num-up { animation: gc-num-up 0.4s cubic-bezier(0.22,1,0.36,1) both; }

      /* -- STATUS INDICATORS ------------------------------------- */
      @keyframes gc-status-flash { 0%,100%{opacity:1} 50%{opacity:0.2} }
      .gc-status-error { animation: gc-status-flash 0.8s ease-in-out 3; }

      [title]:hover::after {
        content: attr(title);
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        background: #0A1628;
        color: #E8EDF5;
        border: 1px solid #1E3A5F;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 11px;
        white-space: nowrap;
        z-index: 9999;
        pointer-events: none;
        animation: gc-slide-down 0.2s ease;
      }
    `;
    const prev = document.getElementById("gc-si-v40");
    if (prev) prev.remove();
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById("gc-si-v40");
      if (el) el.remove();
      document.removeEventListener("click", globalClickHandler, true);
    };
  }, []);
  return null;
};

