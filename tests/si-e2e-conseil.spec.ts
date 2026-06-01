import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-conseil.spec.ts
 * Tests Module Conseil Stratégique (IMPORTANT)
 * Vérifie: Études marché, Business plans, Analyses financières
 */

test.describe('MODULE CONSEIL STRATÉGIQUE', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('ÉTUDES DE MARCHÉ - Analyses sectorielles', async ({ page }) => {
    await page.click('button:has-text("Conseil")');
    await page.click('button:has-text("Études Marché")');

    // Créer étude
    await page.click('button:has-text("Nouvelle Étude")');
    await page.fill('input[placeholder*="Secteur"]', 'Technologies vertes');
    await page.selectOption('select[name="portee"]', 'regional');
    await page.fill('input[placeholder*="Budget"]', '15000');

    await page.click('button:has-text("Lancer Étude")');
    await expect(page.locator('text=Étude lancée')).toBeVisible({ timeout: 3000 });
  });

  test('BUSINESS PLANS - Modélisation financière', async ({ page }) => {
    await page.click('button:has-text("Conseil")');
    await page.click('button:has-text("Business Plans")');

    // Créer business plan
    await page.click('button:has-text("Nouveau Business Plan")');
    await page.fill('input[placeholder*="Projet"]', 'Start-up GreenTech');
    await page.fill('input[placeholder*="Investissement"]', '500000');
    await page.fill('input[placeholder*="ROI attendu"]', '25');

    // Modélisation
    await page.click('button:has-text("Calculer Modèle")');
    await expect(page.locator('text=Projection 5 ans')).toBeVisible({ timeout: 5000 });
  });

  test('ANALYSES FINANCIÈRES - Diagnostics et recommandations', async ({ page }) => {
    await page.click('button:has-text("Conseil")');
    await page.click('button:has-text("Analyses Financières")');

    // Uploader bilan
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample-balance.pdf');
    await page.click('button:has-text("Analyser")');

    // Résultats
    await expect(page.locator('text=Analyse terminée')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Recommandations')).toBeVisible();
  });

  test('RECOMMANDATIONS - Plans d\'action stratégiques', async ({ page }) => {
    await page.click('button:has-text("Conseil")');
    await page.click('button:has-text("Recommandations")');

    // Générer recommandations
    await page.selectOption('select[name="domaine"]', 'digitalisation');
    await page.click('button:has-text("Générer Plan")');

    await expect(page.locator('text=Plan d\'action généré')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.action-plan')).toBeVisible();
  });

  test('SUIVI PROJETS - Tableaux de bord et KPIs', async ({ page }) => {
    await page.click('button:has-text("Conseil")');
    await page.click('button:has-text("Suivi Projets")');

    // Créer suivi projet
    await page.click('button:has-text("Nouveau Suivi")');
    await page.fill('input[placeholder*="Projet"]', 'Transformation digitale');
    await page.selectOption('select[name="phase"]', 'implementation');
    await page.fill('input[placeholder*="Avancement"]', '65');

    await page.click('button:has-text("Sauvegarder")');
    await expect(page.locator('text=Suivi mis à jour')).toBeVisible({ timeout: 3000 });
  });
});