/**
 * SI Génie Consultant — E2E Multi-Client Purification & Anti-Regression
 * Tests complets pour garantir que les suppressions sont vraiment définitives
 * et ne causent pas de résurrection lors de sync multi-postes.
 *
 * Scénarios:
 * 1. Item supprimé → reste supprimé après reconnect offline
 * 2. Factory reset + delete → pas de résurrection cross-clients
 * 3. Checksum intégrité validée chaque client
 * 4. Offline client avec stale data ne ressuscite pas items purgés
 * 5. Wipe registry bloque résurrections post-purge
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://192.168.1.133:4173';
const API_BASE = 'http://192.168.1.133:3001/api';

// Helper: créer contexte multi-client avec credentials
async function createClientContext(browser) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] }
  });
  return context;
}

// Helper: extract checksum from page
async function getPageChecksum(page, key) {
  return await page.evaluate((k) => {
    const data = JSON.parse(localStorage.getItem(k) || 'null');
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }, key);
}

// Helper: fetch server state
async function getServerState(key) {
  const res = await fetch(`${API_BASE}/data/${key}`, {
    headers: { 'X-GC-Proxy': 'true' }
  });
  return res.ok ? res.json() : null;
}

// ────────────────────────────────────────────────────────────────────────
test.describe('🔒 Anti-Regression & Multi-Client Sync Purification', () => {
  // ── Test 1: Deletion Persistence (Offline + Reconnect) ──────
  test('[T1] Item supprimé reste supprimé après offline-reconnect cycle', async ({ browser }) => {
    console.log('[T1] START: Deletion Persistence Test');
    const ctx = await createClientContext(browser);
    const page = await ctx.newPage();
    
    // 1. Login + attendre sync
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    
    // Mock login si nécessaire
    const isLoggedIn = await page.evaluate(() => !!localStorage.getItem('gc-jwt-token'));
    if (!isLoggedIn) {
      await page.fill('[type="email"]', 'test@genie-si.com');
      await page.fill('[type="password"]', 'TestPassword123');
      await page.click('button:has-text("Connexion")');
      await page.waitForNavigation();
    }

    // 2. Create test item
    const testId = `test-${Date.now()}`;
    await page.evaluate((tid) => {
      const items = JSON.parse(localStorage.getItem('gc-taches') || '[]');
      items.push({ id: tid, titre: 'Test Item', status: 'EN_COURS' });
      localStorage.setItem('gc-taches', JSON.stringify(items));
    }, testId);
    
    console.log(`  [T1] ✓ Item créé: ${testId}`);

    // 3. Delete item
    await page.evaluate((tid) => {
      const items = JSON.parse(localStorage.getItem('gc-taches') || '[]');
      const filtered = items.filter(t => t.id !== tid);
      localStorage.setItem('gc-taches', JSON.stringify(filtered));
      // Marker tombstone
      const tombstones = JSON.parse(localStorage.getItem('gc-tombstones') || '{}');
      tombstones['gc-taches'] = (tombstones['gc-taches'] || []).concat([tid]);
      localStorage.setItem('gc-tombstones', JSON.stringify(tombstones));
    }, testId);
    
    console.log(`  [T1] ✓ Item supprimé et tombstoné`);

    // 4. Simulate offline by blocking network
    await ctx.route('**/*', async (route) => {
      await route.abort('blockedbydevtools');
    });
    console.log(`  [T1] Mode offline activé`);

    // 5. Wait & try to restore item (simulating stale client)
    await new Promise(r => setTimeout(r, 2000));
    const itemRestored = await page.evaluate((tid) => {
      const items = JSON.parse(localStorage.getItem('gc-taches') || '[]');
      items.push({ id: tid, titre: 'Resurrected', status: 'EN_ATTENTE' });
      localStorage.setItem('gc-taches', JSON.stringify(items));
      return items.filter(t => t.id === tid).length > 0;
    }, testId);

    console.log(`  [T1] Tentative résurrection locale: ${itemRestored ? 'SUCCESS (BAD!)' : 'BLOCKED'}`);

    // 6. Re-enable network
    await ctx.unroute('**/*');
    console.log(`  [T1] Mode online réactivé`);

    // 7. Flush offline queue & check if resurrection blocked
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Let flush happen
    
    const finalItems = await page.evaluate((tid) => {
      const items = JSON.parse(localStorage.getItem('gc-taches') || '[]');
      return items.filter(t => t.id === tid);
    }, testId);

    console.log(`  [T1] Items après sync: ${finalItems.length}`);
    expect(finalItems).toHaveLength(0);
    console.log('[T1] ✅ PASS: Item supprimé reste supprimé');

    await ctx.close();
  });

  // ── Test 2: Factory Reset Multi-Client ──────
  test('[T2] Factory reset + suppression ne crée pas résurrection cross-clients', async ({ browser }) => {
    console.log('[T2] START: Factory Reset Test');
    
    // Créer 2 clients
    const ctx1 = await createClientContext(browser);
    const ctx2 = await createClientContext(browser);
    
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    // 1. Both login
    for (const p of [page1, page2]) {
      await p.goto(`${BASE_URL}/`);
      await p.waitForLoadState('networkidle');
    }
    console.log(`  [T2] ✓ Deux clients connectés`);

    // 2. Client1: create item
    await page1.evaluate(() => {
      const partners = JSON.parse(localStorage.getItem('gc-partners') || '[]');
      partners.push({ id: 'partner-test-t2', name: 'Partner T2', email: 'p@t2.com' });
      localStorage.setItem('gc-partners', JSON.stringify(partners));
      localStorage.setItem('gc-partners-synced', 'true');
    });
    console.log(`  [T2] ✓ Client1 crée partenaire`);

    // 3. Attendre sync → Client2 reçoit
    await page2.reload();
    await page2.waitForLoadState('networkidle');
    await page2.waitForTimeout(2000);
    
    const client2HasItem = await page2.evaluate(() => {
      const partners = JSON.parse(localStorage.getItem('gc-partners') || '[]');
      return partners.some(p => p.id === 'partner-test-t2');
    });
    console.log(`  [T2] Client2 reçoit: ${client2HasItem}`);
    expect(client2HasItem).toBe(true);

    // 4. Client1: delete + tombstone
    await page1.evaluate(() => {
      const partners = JSON.parse(localStorage.getItem('gc-partners') || '[]');
      const filtered = partners.filter(p => p.id !== 'partner-test-t2');
      localStorage.setItem('gc-partners', JSON.stringify(filtered));
      const tombstones = JSON.parse(localStorage.getItem('gc-tombstones') || '{}');
      tombstones['gc-partners'] = ['partner-test-t2'];
      localStorage.setItem('gc-tombstones', JSON.stringify(tombstones));
    });
    console.log(`  [T2] ✓ Client1 supprime & tombstone`);

    // 5. Factory reset on Client1 (clears tombstones)
    await page1.evaluate(() => {
      localStorage.removeItem('gc-tombstones');
      localStorage.removeItem('gc-wipe-registry');
      localStorage.removeItem('gc-partners');
    });
    console.log(`  [T2] ✓ Client1 factory reset (tombstones supprimés)`);

    // 6. Client1 & Client2 sync → check que deletion persiste
    await page1.reload();
    await page2.reload();
    for (const p of [page1, page2]) {
      await p.waitForLoadState('networkidle');
      await p.waitForTimeout(2000);
    }

    const client1After = await page1.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('gc-partners') || '[]');
      return p.some(x => x.id === 'partner-test-t2');
    });

    const client2After = await page2.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('gc-partners') || '[]');
      return p.some(x => x.id === 'partner-test-t2');
    });

    console.log(`  [T2] Après reset+sync: Client1=${client1After}, Client2=${client2After}`);
    expect(client1After).toBe(false);
    expect(client2After).toBe(false);
    console.log('[T2] ✅ PASS: Pas de résurrection post-reset');

    await ctx1.close();
    await ctx2.close();
  });

  // ── Test 3: Checksum Integrity ──────
  test('[T3] Checksum intégrité validée cross-machine après delete', async ({ browser }) => {
    console.log('[T3] START: Checksum Integrity Test');
    
    const ctx1 = await createClientContext(browser);
    const ctx2 = await createClientContext(browser);
    
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    // Both login
    for (const p of [page1, page2]) {
      await p.goto(`${BASE_URL}/`);
      await p.waitForLoadState('networkidle');
    }

    // Create initial state
    const testKey = 'gc-achievements';
    await page1.evaluate((key) => {
      const data = [
        { id: 'ach-1', name: 'First', points: 100 },
        { id: 'ach-2', name: 'Second', points: 200 },
      ];
      localStorage.setItem(key, JSON.stringify(data));
    }, testKey);
    console.log(`  [T3] ✓ Data créée`);

    // Sync to page2
    await page2.reload();
    await page2.waitForLoadState('networkidle');
    await page2.waitForTimeout(2000);

    // Get initial checksums
    const checksum1Before = await page1.evaluate((k) => {
      const data = JSON.parse(localStorage.getItem(k) || 'null');
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // int32
      }
      return Math.abs(hash).toString(36);
    }, testKey);

    const checksum2Before = await page2.evaluate((k) => {
      const data = JSON.parse(localStorage.getItem(k) || 'null');
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }, testKey);

    console.log(`  [T3] Checksums avant delete: C1=${checksum1Before}, C2=${checksum2Before}`);
    expect(checksum1Before).toBe(checksum2Before);

    // Delete one item on C1
    await page1.evaluate((k) => {
      const data = JSON.parse(localStorage.getItem(k) || '[]');
      const filtered = data.filter(x => x.id !== 'ach-1');
      localStorage.setItem(k, JSON.stringify(filtered));
      const tombs = JSON.parse(localStorage.getItem('gc-tombstones') || '{}');
      tombs[k] = ['ach-1'];
      localStorage.setItem('gc-tombstones', JSON.stringify(tombs));
    }, testKey);
    console.log(`  [T3] ✓ Item supprimé sur C1`);

    // Sync & get final checksums
    await page2.reload();
    await page2.waitForLoadState('networkidle');
    await page2.waitForTimeout(2000);

    const checksum1After = await page1.evaluate((k) => {
      const data = JSON.parse(localStorage.getItem(k) || 'null');
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }, testKey);

    const checksum2After = await page2.evaluate((k) => {
      const data = JSON.parse(localStorage.getItem(k) || 'null');
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }, testKey);

    console.log(`  [T3] Checksums après delete: C1=${checksum1After}, C2=${checksum2After}`);
    expect(checksum1After).toBe(checksum2After);
    console.log('[T3] ✅ PASS: Checksums uniformes cross-machine');

    await ctx1.close();
    await ctx2.close();
  });

  // ── Test 4: Offline Stale Data Resurrection Block ──────
  test('[T4] Client offline avec données stale ne ressuscite pas items purgés', async ({ browser }) => {
    console.log('[T4] START: Offline Stale Data Test');
    
    const ctx = await createClientContext(browser);
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // 1. Create and immediately delete item
    const itemId = `stale-${Date.now()}`;
    await page.evaluate((id) => {
      const docs = JSON.parse(localStorage.getItem('gc-writer-docs') || '[]');
      docs.push({ id, name: 'Doc to Delete', content: 'initial' });
      localStorage.setItem('gc-writer-docs', JSON.stringify(docs));
    }, itemId);

    // Record tombstone server-side by simulating delete
    await page.evaluate((id) => {
      const docs = JSON.parse(localStorage.getItem('gc-writer-docs') || '[]');
      const filtered = docs.filter(d => d.id !== id);
      localStorage.setItem('gc-writer-docs', JSON.stringify(filtered));
      const tombs = JSON.parse(localStorage.getItem('gc-tombstones') || '{}');
      tombs['gc-writer-docs'] = (tombs['gc-writer-docs'] || []).concat([id]);
      localStorage.setItem('gc-tombstones', JSON.stringify(tombs));
    }, itemId);
    console.log(`  [T4] ✓ Item créé et supprimé`);

    // 2. Go offline
    await ctx.route('**/*', async (route) => {
      await route.abort('blockedbydevtools');
    });
    console.log(`  [T4] Mode offline`);

    // 3. Try to push restoration from old cache
    // (simulating corrupt memory or old backup)
    await page.evaluate((id) => {
      const docs = JSON.parse(localStorage.getItem('gc-writer-docs') || '[]');
      docs.push({ id, name: 'Restored Ghost', content: 'corruption' });
      localStorage.setItem('gc-writer-docs', JSON.stringify(docs));
    }, itemId);
    console.log(`  [T4] Tentative corruption: item "restauré" localement`);

    // 4. Go back online
    await ctx.unroute('**/*');
    console.log(`  [T4] Mode online réactivé`);

    // 5. Reload & flush
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const itemStillThere = await page.evaluate((id) => {
      const docs = JSON.parse(localStorage.getItem('gc-writer-docs') || '[]');
      return docs.some(d => d.id === id);
    }, itemId);

    console.log(`  [T4] Après sync: item présent=${itemStillThere}`);
    expect(itemStillThere).toBe(false);
    console.log('[T4] ✅ PASS: Stale data correctement filtrée');

    await ctx.close();
  });

  // ── Test 5: Wipe Registry TTL ──────
  test('[T5] Wipe Registry empêche résurrection post-purge', async ({ browser }) => {
    console.log('[T5] START: Wipe Registry Test');
    
    const ctx = await createClientContext(browser);
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // 1. Create test items
    const testKey = 'gc-leaves';
    const itemIds = ['leave-1', 'leave-2', 'leave-3'];
    
    await page.evaluate((key, ids) => {
      const items = ids.map(id => ({ id, user: 'test', days: 5 }));
      localStorage.setItem(key, JSON.stringify(items));
    }, testKey, itemIds);
    console.log(`  [T5] ✓ 3 items créés`);

    // 2. Record wipe timestamp
    const wipeTs = Date.now();
    await page.evaluate((key, ts) => {
      const registry = JSON.parse(localStorage.getItem('gc-wipe-registry') || '{}');
      registry[key] = ts;
      localStorage.setItem('gc-wipe-registry', JSON.stringify(registry));
    }, testKey, wipeTs);
    console.log(`  [T5] ✓ Wipe registry enregistré: ${wipeTs}`);

    // 3. Offline & try to restore old data (pre-wipe)
    await ctx.route('**/*', async (route) => {
      await route.abort('blockedbydevtools');
    });

    await page.evaluate((key, ids) => {
      const oldData = ids.map(id => ({ 
        id, 
        user: 'test', 
        days: 10,
        ts: Date.now() - 10000 // Pre-wipe timestamp
      }));
      localStorage.setItem(key, JSON.stringify(oldData));
    }, testKey, itemIds);
    console.log(`  [T5] Données pré-wipe restaurées localement (corruption simulation)`);

    // 4. Back online
    await ctx.unroute('**/*');
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 5. Check if pre-wipe data was rejected
    const currentData = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key) || '[]');
    }, testKey);

    console.log(`  [T5] Données après wipe+sync: ${currentData.length} items`);
    // Should be empty or only post-wipe items
    expect(currentData.length).toBeLessThanOrEqual(0);
    console.log('[T5] ✅ PASS: Wipe registry protège contre résurrection');

    await ctx.close();
  });
});

test.describe('📊 Multi-Client Sync Convergence', () => {
  test('[CONV] Tous les clients convergent vers même état après 3 sync rounds', async ({ browser }) => {
    console.log('[CONV] START: Convergence Test');
    
    const contexts = [];
    const pages = [];
    
    for (let i = 0; i < 3; i++) {
      const ctx = await createClientContext(browser);
      contexts.push(ctx);
      const page = await ctx.newPage();
      pages.push(page);
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');
    }
    console.log(`  [CONV] ✓ 3 clients connectés`);

    // Make divergent changes
    await pages[0].evaluate(() => {
      const data = [{ id: '1', name: 'C1' }];
      localStorage.setItem('gc-codif-registry', JSON.stringify(data));
    });

    await pages[1].evaluate(() => {
      const data = [{ id: '1', name: 'C1' }, { id: '2', name: 'C2' }];
      localStorage.setItem('gc-codif-registry', JSON.stringify(data));
    });

    await pages[2].evaluate(() => {
      const data = [{ id: '1', name: 'C1' }, { id: '2', name: 'C2' }, { id: '3', name: 'C3' }];
      localStorage.setItem('gc-codif-registry', JSON.stringify(data));
    });

    console.log(`  [CONV] Modifications divergentes faites`);

    // Sync rounds
    for (let round = 0; round < 3; round++) {
      for (const page of pages) {
        await page.reload();
        await page.waitForLoadState('networkidle');
      }
      console.log(`  [CONV] Round ${round + 1} terminé`);
      await new Promise(r => setTimeout(r, 2000));
    }

    // Check convergence
    const states = [];
    for (let i = 0; i < 3; i++) {
      const state = await pages[i].evaluate(() => {
        return JSON.stringify(JSON.parse(localStorage.getItem('gc-codif-registry') || '[]'));
      });
      states.push(state);
    }

    console.log(`  [CONV] État final - C1 items: ${states[0].length}, C2: ${states[1].length}, C3: ${states[2].length}`);
    expect(states[0]).toBe(states[1]);
    expect(states[1]).toBe(states[2]);
    console.log('[CONV] ✅ PASS: Tous les clients convergents');

    for (const ctx of contexts) {
      await ctx.close();
    }
  });
});
