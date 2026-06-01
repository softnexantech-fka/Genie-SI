import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-audit.spec.ts
 * Tests Module Audit (CRITIQUE)
 * Vérifie: Audit processus, Conformité, Rapports, Traçabilité
 */

test.describe('MODULE AUDIT', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.AUDIT.email);
    await page.fill('input[type="password"]', TEST_USERS.AUDIT.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('AUDIT PROCESSUS MÉTIER - Contrôle et validation', async ({ page }) => {
    await page.click('button:has-text("Audit")');
    await page.click('button:has-text("Audit Processus")');

    // Sélectionner processus
    await page.selectOption('select[name="processus"]', 'gestion-documents');
    await page.click('button:has-text("Lancer Audit")');

    // Vérifier résultats
    await expect(page.locator('text=Audit en cours')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.audit-results')).toBeVisible({ timeout: 10000 });
  });

  test('CONTRÔLE CONFORMITÉ - Vérifications automatiques', async ({ page }) => {
    await page.click('button:has-text("Audit")');
    await page.click('button:has-text("Conformité")');

    // Lancer vérification
    await page.click('button:has-text("Vérifier Conformité")');

    // Résultats attendus
    await expect(page.locator('text=RGPD')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=ISO 27001')).toBeVisible();
  });

  test('RAPPORTS D\'AUDIT - Génération et archivage', async ({ page }) => {
    await page.click('button:has-text("Audit")');
    await page.click('button:has-text("Rapports")');

    // Générer rapport
    await page.selectOption('select[name="type"]', 'mensuel');
    await page.click('button:has-text("Générer")');

    await expect(page.locator('text=Rapport généré')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Télécharger PDF")')).toBeVisible();
  });

  test('TRAÇABILITÉ ACTIONS - Logs et historique', async ({ page }) => {
    await page.click('button:has-text("Audit")');
    await page.click('button:has-text("Logs")');

    // Rechercher actions
    await page.fill('input[placeholder*="Utilisateur"]', 'admin');
    await page.fill('input[name="date_debut"]', '2026-01-01');
    await page.click('button:has-text("Rechercher")');

    // Vérifier logs
    await expect(page.locator('.audit-logs')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Connexion')).toBeVisible();
  });

  test('ALERTES CONFORMITÉ - Notifications automatiques', async ({ page }) => {
    await page.click('button:has-text("Audit")');
    await page.click('button:has-text("Alertes")');

    // Vérifier alertes actives
    await expect(page.locator('.alertes-list')).toBeVisible();
    await expect(page.locator('text=Niveau:')).toBeVisible();
  });

  test('ARCHIVAGE AUDIT - Sécurisation données', async ({ page }) => {
    await page.click('button:has-text("Audit")');
    await page.click('button:has-text("Archives")');

    // Archiver rapport
    await page.click('button:has-text("Archiver Rapport")');
    await page.selectOption('select[name="rapport"]', 'audit-mensuel-2026-03');
    await page.click('button:has-text("Archiver")');

    await expect(page.locator('text=Rapport archivé')).toBeVisible({ timeout: 3000 });
  });
});