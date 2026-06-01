import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-rapports.spec.ts
 * Tests Génération Rapports d'Activité (IMPORTANT)
 * Vérifie: Rapports activité, Statistiques, Exports, Programmation
 */

test.describe('RAPPORTS D\'ACTIVITÉ', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('RAPPORTS ACTIVITÉ - Synthèse mensuelle', async ({ page }) => {
    await page.click('button:has-text("Rapports")');
    await page.click('button:has-text("Activité")');

    // Générer rapport mensuel
    await page.selectOption('select[name="periode"]', 'mensuel');
    await page.selectOption('select[name="type"]', 'complet');
    await page.click('button:has-text("Générer")');

    await expect(page.locator('text=Rapport généré')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.activity-report')).toBeVisible();
  });

  test('STATISTIQUES USAGE - Métriques détaillées', async ({ page }) => {
    await page.click('button:has-text("Rapports")');
    await page.click('button:has-text("Statistiques")');

    // Consulter stats
    await expect(page.locator('text=Connexions')).toBeVisible();
    await expect(page.locator('text=Documents créés')).toBeVisible();
    await expect(page.locator('text=Tâches terminées')).toBeVisible();

    // Filtrer par période
    await page.fill('input[name="date_debut"]', '2026-03-01');
    await page.fill('input[name="date_fin"]', '2026-03-31');
    await page.click('button:has-text("Actualiser")');

    await expect(page.locator('text=Mars 2026')).toBeVisible({ timeout: 3000 });
  });

  test('EXPORTS PDF/EXCEL - Formats multiples', async ({ page }) => {
    await page.click('button:has-text("Rapports")');
    await page.click('button:has-text("Exports")');

    // Exporter en PDF
    await page.selectOption('select[name="format"]', 'pdf');
    await page.selectOption('select[name="contenu"]', 'activite-mensuelle');
    await page.click('button:has-text("Exporter")');

    await expect(page.locator('text=Export PDF réussi')).toBeVisible({ timeout: 5000 });

    // Exporter en Excel
    await page.selectOption('select[name="format"]', 'excel');
    await page.click('button:has-text("Exporter")');

    await expect(page.locator('text=Export Excel réussi')).toBeVisible({ timeout: 3000 });
  });

  test('FILTRES PERSONNALISÉS - Requêtes avancées', async ({ page }) => {
    await page.click('button:has-text("Rapports")');
    await page.click('button:has-text("Filtres")');

    // Configurer filtres
    await page.selectOption('select[name="departement"]', 'juridique');
    await page.selectOption('select[name="statut"]', 'actif');
    await page.fill('input[name="date_min"]', '2026-01-01');
    await page.click('button:has-text("Appliquer Filtres")');

    await expect(page.locator('.filtered-results')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Département: Juridique')).toBeVisible();
  });

  test('PROGRAMMATION RAPPORTS - Envois automatiques', async ({ page }) => {
    await page.click('button:has-text("Rapports")');
    await page.click('button:has-text("Programmation")');

    // Programmer rapport hebdomadaire
    await page.click('button:has-text("Nouveau Planning")');
    await page.fill('input[placeholder*="Nom"]', 'Rapport Hebdomadaire');
    await page.selectOption('select[name="frequence"]', 'hebdomadaire');
    await page.selectOption('select[name="jour"]', 'lundi');
    await page.fill('input[placeholder*="Destinataires"]', 'direction@test.com');

    await page.click('button:has-text("Programmer")');
    await expect(page.locator('text=Rapport programmé')).toBeVisible({ timeout: 3000 });
  });

  test('ARCHIVAGE RAPPORTS - Historique et conservation', async ({ page }) => {
    await page.click('button:has-text("Rapports")');
    await page.click('button:has-text("Archives")');

    // Consulter archives
    await expect(page.locator('.reports-archive')).toBeVisible();
    await expect(page.locator('text=Rapports archivés')).toBeVisible();

    // Archiver rapport actuel
    await page.click('button:has-text("Archiver Rapport")');
    await page.selectOption('select[name="rapport"]', 'activite-mars-2026');
    await page.click('button:has-text("Archiver")');

    await expect(page.locator('text=Rapport archivé')).toBeVisible({ timeout: 3000 });
  });
});