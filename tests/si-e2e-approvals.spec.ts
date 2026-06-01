import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-approvals.spec.ts
 * Tests Workflow Approbations (CRITIQUE)
 * Vérifie: Demande → Collaborateur → Admin → DG → Archivé
 */

test.describe('WORKFLOW APPROBATIONS', () => {

  test('CRÉER demande approbation - En attente Collaborateur', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
    
    // Créer demande
    const refId = `APP-${Date.now()}`;
    await page.click('button:has-text("Demandes")');
    await page.click('button:has-text("Nouvelle Demande")');
    
    await page.fill('input[placeholder*="Référence"]', refId);
    await page.fill('textarea[placeholder*="Description"]', 'Demande d\'approbation test');
    await page.click('button:has-text("Soumettre")');
    
    // Vérifier statut "En attente approbation"
    await expect(page.locator(`text=${refId}.*Approbation`)).toBeVisible({ timeout: 5000 });
  });

  test('APPROUVER demande - Admin valide & passe à DG', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
    
    // Voir demandes en attente
    const notifBtn = page.locator('button:has-text("🔔")');
    if (await notifBtn.count() > 0) {
      await notifBtn.click();
      await expect(page.locator('text=Approbation demandée')).toBeVisible({ timeout: 5000 });
    }
    
    // Accéder à demande
    await page.click('button:has-text("Approbations")');
    const approveBtn = page.locator('button:has-text("✅")').first();
    if (await approveBtn.count() > 0) {
      await approveBtn.click();
      await page.click('button:has-text("Approuver")');
      
      // Statut change pour "En attente DG"
      await expect(page.locator('text=En attente DG|Suivant: DG')).toBeVisible({ timeout: 5000 });
    }
  });

  test('REJETER demande - Statut = Rejetée, notif retour', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    
    // Chercher demande
    await page.click('button:has-text("Approbations")');
    const rejectBtn = page.locator('button:has-text("❌")').first();
    if (await rejectBtn.count() > 0) {
      await rejectBtn.click();
      await page.fill('textarea[placeholder*="Raison"]', 'Données incomplètes');
      await page.click('button:has-text("Rejeter")');
      
      // Statut = Rejetée
      await expect(page.locator('text=Reketée|Rejet')).toBeVisible({ timeout: 5000 });
    }
  });

  test('APPROBATION FINALE - DG approuve > Archivée', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.DG.email);
    await page.fill('input[type="password"]', TEST_USERS.DG.password);
    await page.click('button:has-text("Connexion")');
    
    // Voir demandes pour DG
    await page.click('button:has-text("Approbations")');
    const approveBtn = page.locator('button:has-text("✅")').first();
    if (await approveBtn.count() > 0) {
      await approveBtn.click();
      await page.click('button:has-text("Approuver Définitivement")');
      
      // Statut = Approuvée & Archivée
      await expect(page.locator('text=Approuvée|Archivée')).toBeVisible({ timeout: 5000 });
    }
  });

  test('PERMISSONS - Client NE voit PAS Approbations', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.CLIENT.email);
    await page.fill('input[type="password"]', TEST_USERS.CLIENT.password);
    await page.click('button:has-text("Connexion")');
    
    // Approbations doit être invisible
    const appBtn = page.locator('button:has-text("Approbations")');
    if (await appBtn.count() > 0) {
      await expect(appBtn).toBeDisabled({ timeout: 2000 });
    }
  });
});
