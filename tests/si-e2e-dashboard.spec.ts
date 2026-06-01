import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-dashboard.spec.ts
 * Tests Tableaux de Bord et Indicateurs (IMPORTANT)
 * Vérifie: Dashboard principal, KPIs, Cartes processus, Métriques
 */

test.describe('TABLEAUX DE BORD ET INDICATEURS', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('DASHBOARD PRINCIPAL - Vue d\'ensemble système', async ({ page }) => {
    await page.click('button:has-text("Dashboard")');

    // Vérifier métriques principales
    await expect(page.locator('text=Utilisateurs actifs')).toBeVisible();
    await expect(page.locator('text=Documents créés')).toBeVisible();
    await expect(page.locator('text=Tâches en cours')).toBeVisible();
    await expect(page.locator('text=Revenus mensuels')).toBeVisible();
  });

  test('INDICATEURS KPI - Métriques personnalisables', async ({ page }) => {
    await page.click('button:has-text("Dashboard")');
    await page.click('button:has-text("KPIs")');

    // Créer KPI
    await page.click('button:has-text("Nouveau KPI")');
    await page.fill('input[placeholder*="Nom"]', 'Satisfaction Client');
    await page.selectOption('select[name="type"]', 'pourcentage');
    await page.fill('input[placeholder*="Valeur cible"]', '95');

    await page.click('button:has-text("Sauvegarder")');
    await expect(page.locator('text=Satisfaction Client')).toBeVisible({ timeout: 3000 });
  });

  test('CARTES PROCESSUS - Visualisation workflows', async ({ page }) => {
    await page.click('button:has-text("Dashboard")');
    await page.click('button:has-text("Processus")');

    // Afficher carte processus
    await page.selectOption('select[name="processus"]', 'gestion-documents');
    await page.click('button:has-text("Afficher Carte")');

    await expect(page.locator('.process-map')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Étapes')).toBeVisible();
  });

  test('MÉTRIQUES TEMPS RÉEL - Données live', async ({ page }) => {
    await page.click('button:has-text("Dashboard")');
    await page.click('button:has-text("Temps Réel")');

    // Vérifier mise à jour automatique
    await expect(page.locator('.live-metrics')).toBeVisible();
    await expect(page.locator('text=Dernière mise à jour')).toBeVisible();

    // Attendre mise à jour
    await page.waitForTimeout(5000);
    await expect(page.locator('text=Actualisé')).toBeVisible();
  });

  test('EXPORTS DONNÉES - Rapports personnalisés', async ({ page }) => {
    await page.click('button:has-text("Dashboard")');
    await page.click('button:has-text("Exports")');

    // Configurer export
    await page.selectOption('select[name="format"]', 'excel');
    await page.selectOption('select[name="periode"]', 'trimestre');
    await page.click('button:has-text("Sélectionner Métriques")');

    // Cocher métriques
    await page.check('input[name="metric_users"]');
    await page.check('input[name="metric_documents"]');
    await page.check('input[name="metric_tasks"]');

    await page.click('button:has-text("Exporter")');
    await expect(page.locator('text=Export en cours')).toBeVisible({ timeout: 5000 });
  });

  test('PERSONNALISATION VUES - Dashboards sur mesure', async ({ page }) => {
    await page.click('button:has-text("Dashboard")');
    await page.click('button:has-text("Personnalisation")');

    // Créer vue personnalisée
    await page.click('button:has-text("Nouvelle Vue")');
    await page.fill('input[placeholder*="Nom vue"]', 'Vue Direction');
    await page.click('button:has-text("Ajouter Widget")');
    await page.selectOption('select[name="widget"]', 'graphique-evolution');

    await page.click('button:has-text("Sauvegarder Vue")');
    await expect(page.locator('text=Vue Direction')).toBeVisible({ timeout: 3000 });
  });
});