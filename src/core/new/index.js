// ============================================================
// core/index.js — Barrel export pour tous les utilitaires SI
// SI Génie Consultant v127
// ============================================================

// Storage & encryption
export { _lsGet, _lsSet, _lsRm, lsLoad, lsSave, lsLoadSecure, _lsGetSecure, _lsSetSecure } from './storage.js';
export { _gcEncrypt, _gcDecrypt, _gcGetAESKey } from './storage.js';

// Context & hooks
export { SICtx, useSI, SIErrorBoundary, _noop, _tDone, _tActive, _activeUser, _activeUsers } from './context.jsx';
export { LiveClock, getUserProcess } from './context.jsx';

// Helpers & calculations
export { playSound, gcPushNotif, formatCFA, gcCalcPaie, gcCalcIRPP, gcLoadFiscalConfig, gcFindApprover, gcCodif, gcCodifDOC, gcCodifTCHE, gcCodifMSG, _gcSafeCalc, formatDate, gcGetDelaiConfig, gcAntiRedondance, gcAIBuildSystemPrompt, gcAILoadConfig, gcAISaveConfig, GC_AI_PROXY_URL, gcCopy, generateAccessCode, gcHashPassword, gcGenerateSessionToken, gcValidateSessionToken, gcVerifyPassword, gcGetClientIp, _gcCachedIp } from './helpers.js';

// Datastore & sync
export { dsInitSync, dsStartSync, dsOnSync, dsLoad, dsGet, dsSave, dsSet, dsDelete, dsProxyAvailable, dsOfflineQueueSize, SHARED_KEYS } from './datastore.js';

// Filestore
export { gcMigrateFilesFromLS, gcSyncFilesToServer, gcFileStats } from './filestore.js';

// Constants (re-export)
export * from './constants.js';
