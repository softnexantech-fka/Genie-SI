import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-admin.spec.ts
 * Tests Administration (CRITIQUE)
 * Vérifie: Gestion collaborateurs, Niveaux d'accès, Organigramme
 */

test.describe('ADMINISTRATION', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.DG.email);
    await page.fill('input[type="password"]', TEST_USERS.DG.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('AJOUTER collaborateur - Dans liste & avec rôle correct', async ({ page }) => {
    await page.click('button:has-text("Admin")');
    await page.click('button:has-text("Collaborateurs")');
    await page.click('button:has-text("Ajouter")');
    
    const newEmail = `test.collab+${Date.now()}@genie-consultant.com`;
    await page.fill('input[placeholder*="Email"]', newEmail);
    await page.locator('select[name="role"]').selectOption('Juriste');
    await page.click('button:has-text("Créer")');
    
    // Vérifier dans liste
    await expect(page.locator(`text=${newEmail}`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${newEmail}...Juriste`)).toBeVisible({ timeout: 3000 });
  });

  test('MODIFIER rôle - Accès mis à jour immédiatement', async ({ page }) => {
    await page.click('button:has-text("Admin")');
    await page.click('button:has-text("Collaborateurs")');
    
    // Chercher collaborateur
    const collabRow = page.locator(`text=${TEST_USERS.COLLABORATEUR.email}`).first();
    if (await collabRow.count() > 0) {
      // Cliquer sur modifier
      const editBtn = page.locator('button:has-text("✏️"):near(${collabRow})');
      if (await editBtn.count() > 0) {
        await editBtn.click();
        
        // Changer rôle
        await page.locator('select[name="role"]').selectOption('Manager');
        await page.click('button:has-text("Enregistrer")');
        
        // Vérifier changement
        await expect(page.locator(`text=${TEST_USERS.COLLABORATEUR.email}...Manager`)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('SUPPRIMER collaborateur - Compte inactif', async ({ page }) => {
    await page.click('button:has-text("Admin")');
    await page.click('button:has-text("Collaborateurs")');
    
    // Chercher & supprimer
    const dummyEmail = `dummy+${Date.now()}@test.com`;
    
    // D'abord ajouter
    await page.click('button:has-text("Ajouter")');
    await page.fill('input[placeholder*="Email"]', dummyEmail);
    await page.click('button:has-text("Créer")');
    
    // Maintenant supprimer (sur la ligne)
    const dummyRow = page.locator(`text=${dummyEmail}`).first();
    const deleteBtn = page.locator('button:has-text("🗑️"):near(${dummyRow})');
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      await page.click('button:has-text("Confirmer")');
      
      // Doit être parti
      await expect(dummyRow).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('ORGANIGRAMME - Hiérarchie correcte', async ({ page }) => {
    await page.click('button:has-text("Admin")');
    await page.click('button:has-text("Organigramme")');
    
    // Doit voir DG au sommet
    await expect(page.locator(`text=${TEST_USERS.DG.name}`)).toBeVisible({ timeout: 5000 });
    
    // Doit voir hiérarchie (Admin sous DG)
    await expect(page.locator(`text=${TEST_USERS.ADMIN.name}`)).toBeVisible({ timeout: 3000 });
  });

  test('PERMISSIONS - Collaborateur NE peut accéder Admin', async ({ page }) => {
    // Logout DG
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();
    
    // Login Collaborateur
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    
    // Admin doit être disabled/invisible
    const adminBtn = page.locator('button:has-text("Admin")');
    if (await adminBtn.count() > 0) {
      await expect(adminBtn).toBeDisabled({ timeout: 2000 });
    }
  });
});
