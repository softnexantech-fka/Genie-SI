// ============================================================
// datastore-anti-resurrection.js — SHA-256 Checksum Anti-Resurrection
// SI Génie Consultant — Phase 1 Implementation
// ============================================================
// 
// PURPOSE: Prevent deleted items from being resurrected via sync.
// MECHANISM: Store SHA-256 hashes of deleted items. When syncing,
// compare incoming items' hashes against tombstones. If hash matches,
// item is filtered (it's the exact deleted data).
//
// USAGE:
//   1. When deleting: recordTombstoneChecksum(key, itemId, itemData)
//   2. When loading:  filterResurrectedItems(key, items)
//   3. On sync:       checksum validation in dsSave()
//
// ============================================================

import { _lsGet, _lsSet } from './storage.js';

// ── SHA-256 Computation ───────────────────────────────────────
export async function computeSHA256(data) {
  try {
    const msgBuffer = new TextEncoder().encode(JSON.stringify(data));
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    console.error('[Checksum] SHA256 computation failed:', e);
    return null;
  }
}

// ── Tombstone Checksum Storage ────────────────────────────────
const TOMBSTONE_CHECKSUMS_KEY = 'gc-tombstones-checksums-v1';
const MAX_CHECKSUMS_PER_KEY = 500;
const MAX_CHECKSUMS_TOTAL = 5000;

export async function recordTombstoneChecksum(key, itemId, itemData) {
  if (!key || !itemId || !itemData) return;
  
  try {
    const hash = await computeSHA256(itemData);
    if (!hash) return;
    
    const checksums = JSON.parse(_lsGet(TOMBSTONE_CHECKSUMS_KEY) || '{}');
    
    if (!checksums[key]) checksums[key] = {};
    
    // Store checksum with metadata
    checksums[key][String(itemId)] = {
      hash,
      deletedAt: Date.now(),
      deletedBy: typeof window !== 'undefined' ? window.__gcCurrentUser?.id : 'backend',
      dataVersion: 1,
      size: JSON.stringify(itemData).length,
    };
    
    // Trim checksums: keep newest 500 per key, newest 5000 total
    const keyEntries = Object.entries(checksums[key])
      .sort((a, b) => b[1].deletedAt - a[1].deletedAt)
      .slice(0, MAX_CHECKSUMS_PER_KEY);
    checksums[key] = Object.fromEntries(keyEntries);
    
    const totalEntries = Object.values(checksums)
      .reduce((sum, keyMap) => sum + Object.keys(keyMap).length, 0);
    
    if (totalEntries > MAX_CHECKSUMS_TOTAL) {
      // Trim oldest entries across all keys
      const allEntries = [];
      for (const [k, map] of Object.entries(checksums)) {
        for (const [id, data] of Object.entries(map)) {
          allEntries.push([k, id, data]);
        }
      }
      allEntries.sort((a, b) => b[2].deletedAt - a[2].deletedAt);
      
      const trimmed = {};
      for (const [k, id, data] of allEntries.slice(0, MAX_CHECKSUMS_TOTAL)) {
        if (!trimmed[k]) trimmed[k] = {};
        trimmed[k][id] = data;
      }
      Object.assign(checksums, trimmed);
    }
    
    _lsSet(TOMBSTONE_CHECKSUMS_KEY, JSON.stringify(checksums));
  } catch (e) {
    console.warn('[Checksum] Storage failed:', e.message);
  }
}

// ── Retrieval ──────────────────────────────────────────────────
export function getTombstoneChecksums(key) {
  try {
    const all = JSON.parse(_lsGet(TOMBSTONE_CHECKSUMS_KEY) || '{}');
    return all[key] || {};
  } catch {
    return {};
  }
}

export function getAllTombstoneChecksums() {
  try {
    return JSON.parse(_lsGet(TOMBSTONE_CHECKSUMS_KEY) || '{}');
  } catch {
    return {};
  }
}

// ── Resurrection Detection ────────────────────────────────────
export async function isResurrectionAttempt(key, item) {
  if (!item || !item.id) return false;
  
  const checksums = getTombstoneChecksums(key);
  const tombstone = checksums[String(item.id)];
  
  if (!tombstone) return false;  // Not deleted, not resurrection
  
  try {
    // Compute current hash
    const currentHash = await computeSHA256(item);
    if (!currentHash) return false;
    
    // Compare with stored tombstone
    const isMatch = currentHash === tombstone.hash;
    
    if (isMatch) {
      console.log(
        `[Anti-Resurrection] Detected resurrection of ${key}/${item.id} ` +
        `(deleted ${Math.round((Date.now() - tombstone.deletedAt) / 1000)}s ago by ${tombstone.deletedBy})`
      );
    }
    
    return isMatch;
  } catch (e) {
    console.warn(`[Anti-Resurrection] Check failed for ${key}/${item.id}:`, e.message);
    return false;
  }
}

// ── Main Filter Function ───────────────────────────────────────
export async function filterResurrectedItems(key, items) {
  if (!Array.isArray(items)) {
    return { filtered: items, blockedCount: 0 };
  }
  
  if (items.length === 0) {
    return { filtered: [], blockedCount: 0 };
  }
  
  const filtered = [];
  const blocked = [];
  
  for (const item of items) {
    try {
      const isResurrected = await isResurrectionAttempt(key, item);
      if (isResurrected) {
        blocked.push(item?.id);
      } else {
        filtered.push(item);
      }
    } catch (e) {
      // On error, include item (fail-open for data safety)
      console.warn(`[Anti-Resurrection] Error checking ${key}/${item?.id}:`, e.message);
      filtered.push(item);
    }
  }
  
  if (blocked.length > 0) {
    console.warn(
      `[Anti-Resurrection] Blocked ${blocked.length} resurrected items in "${key}": ` +
      blocked?.slice(0, 10).join(', ') + (blocked.length > 10 ? '...' : '')
    );
  }
  
  return { filtered, blockedCount: blocked.length };
}

// ── Clearance Functions ────────────────────────────────────────
export function clearTombstoneChecksums(key = null) {
  try {
    if (key) {
      // Clear specific key
      const checksums = JSON.parse(_lsGet(TOMBSTONE_CHECKSUMS_KEY) || '{}');
      delete checksums[key];
      _lsSet(TOMBSTONE_CHECKSUMS_KEY, JSON.stringify(checksums));
    } else {
      // Clear all
      _lsSet(TOMBSTONE_CHECKSUMS_KEY, '{}');
    }
  } catch (e) {
    console.warn('[Checksum] Clear failed:', e.message);
  }
}

// ── Debug/Diagnostics ──────────────────────────────────────────
export function getChecksumsStats() {
  try {
    const all = JSON.parse(_lsGet(TOMBSTONE_CHECKSUMS_KEY) || '{}');
    let totalCount = 0;
    let totalSize = 0;
    const byKey = {};
    
    for (const [key, checksums] of Object.entries(all)) {
      const count = Object.keys(checksums).length;
      const size = Object.values(checksums).reduce((sum, c) => sum + (c.size || 0), 0);
      totalCount += count;
      totalSize += size;
      byKey[key] = { count, size };
    }
    
    return {
      totalCount,
      totalSize,
      byKey,
      storageUsageBytes: JSON.stringify(all).length,
    };
  } catch (e) {
    return { error: e.message };
  }
}
