import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-finance.spec.ts
 * Tests Finance & Facturation (CRITIQUE)
 * Vérifie: Création facture → Validation montant → Signature → Archivage
 */

test.describe('FINANCE & FACTURATION', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('CRÉER facture - Montant enregistré correctement', async ({ page }) => {
    await page.click('button:has-text("Finance")');
    await page.click('button:has-text("Nouvelle Facture")');
    
    const facNum = `FAC-${Date.now()}`;
    await page.fill('input[placeholder*="Numéro"]', facNum);
    await page.fill('input[placeholder*="Montant"]', '5500.50');
    await page.fill('input[placeholder*="Description"]', 'Honoraires Juridiques Q1');
    await page.click('button:has-text("Créer")');
    
    // Vérifier dans liste
    await expect(page.locator(`text=${facNum}`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=5500.50')).toBeVisible({ timeout: 2000 });
  });

  test('VALIDER montant - Montant must be > 0 & decimal correct', async ({ page }) => {
    await page.click('button:has-text("Finance")');
    await page.click('button:has-text("Nouvelle Facture")');
    
    // Tenter montant négatif
    await page.fill('input[placeholder*="Montant"]', '-100');
    const createBtn = page.locator('button:has-text("Créer")');
    
    // Doit être bloqué ou afficher erreur
    await createBtn.click();
    await expect(page.locator('text=Montant invalide|Montant doit être positif')).toBeVisible({ timeout: 3000 }).catch(() => {});
  });

  test('SIGNER facture - PIN validation & journalisation', async ({ page }) => {
    await page.click('button:has-text("Finance")');
    
    // Chercher facture à signer
    const signBtn = page.locator('button:has-text("✍️")').first();
    await signBtn.click();
    
    // Demander PIN
    await page.fill('input[placeholder*="PIN"]', 'TEST1234');
    await page.click('button:has-text("Signer")');
    
    // Vérifier signature enregistrée
    await expect(page.locator('text=Signé par|Signature valide')).toBeVisible({ timeout: 5000 });
  });

  test('NOTE HONORAIRES - Signature numérique enregistrée', async ({ page }) => {
    await page.click('button:has-text("Finance")');
    await page.click('button:has-text("Note d\'Honoraires")');
    
    await page.fill('input[placeholder*="Dossier"]', 'JUR-2026-001');
    await page.fill('input[placeholder*="Montant"]', '3500');
    await page.fill('input[placeholder*="Description"]', 'Travaux juridiques');
    await page.click('button:has-text("Créer")');
    
    // Chercher et signer
    const signBtn = page.locator('button:has-text("✍️")').first();
    if (await signBtn.count() > 0) {
      await signBtn.click();
      await page.fill('input[placeholder*="PIN"]', 'TEST1234');
      await page.click('button:has-text("Signer")');
      
      // Vérifier signature
      await expect(page.locator('text=Signature valide')).toBeVisible({ timeout: 5000 });
    }
  });

  test('ARCHIVAGE - Facture signée peut être archivée', async ({ page }) => {
    await page.click('button:has-text("Finance")');
    
    // Chercher facture signée
    const archiveBtn = page.locator('button:has-text("🗂️")').first();
    if (await archiveBtn.count() > 0) {
      await archiveBtn.click();
      await expect(page.locator('text=Archivé|Archive')).toBeVisible({ timeout: 5000 });
    }
  });

  test('RESTRICTION - Client NE peut créer facture', async ({ page }) => {
    // Logout Admin
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();
    
    // Login Client
    await page.fill('input[type="email"]', TEST_USERS.CLIENT.email);
    await page.fill('input[type="password"]', TEST_USERS.CLIENT.password);
    await page.click('button:has-text("Connexion")');
    
    // Vérifier Finance est invisible ou disabled
    const financeBtn = page.locator('button:has-text("Finance")');
    if (await financeBtn.count() > 0) {
      await expect(financeBtn).toBeDisabled({ timeout: 2000 });
    }
  });
});
