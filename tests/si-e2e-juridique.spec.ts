import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-juridique.spec.ts
 * Tests Module Juridique (CRITIQUE)
 * Vérifie: Rédaction contrats, Analyse juridique, Gestion contentieux
 */

test.describe('MODULE JURIDIQUE', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('RÉDACTION CONTRATS - Modèles et génération automatique', async ({ page }) => {
    await page.click('button:has-text("Juridique")');
    await page.click('button:has-text("Nouveau Contrat")');

    // Sélectionner modèle
    await page.selectOption('select[name="modele"]', 'contrat-prestation');
    await page.fill('input[placeholder*="Client"]', 'Entreprise ABC');
    await page.fill('input[placeholder*="Objet"]', 'Prestation de conseil');

    // Générer contrat
    await page.click('button:has-text("Générer")');
    await expect(page.locator('text=Contrat généré')).toBeVisible({ timeout: 5000 });

    // Vérifier contenu
    await expect(page.locator('text=Entreprise ABC')).toBeVisible();
  });

  test('ANALYSE JURIDIQUE - IA et validation automatique', async ({ page }) => {
    await page.click('button:has-text("Juridique")');
    await page.click('button:has-text("Analyse Document")');

    // Uploader un document
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample-contract.pdf');

    // Lancer analyse
    await page.click('button:has-text("Analyser")');

    // Vérifier résultats
    await expect(page.locator('text=Risques identifiés')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Conformité')).toBeVisible();
  });

  test('GESTION CONTENTIEUX - Suivi et archivage', async ({ page }) => {
    await page.click('button:has-text("Juridique")');
    await page.click('button:has-text("Contentieux")');

    // Créer un dossier contentieux
    await page.click('button:has-text("Nouveau Dossier")');
    await page.fill('input[placeholder*="Référence"]', 'CONT-2026-001');
    await page.fill('input[placeholder*="Adverse"]', 'Société XYZ');
    await page.selectOption('select[name="type"]', 'recouvrement');

    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=CONT-2026-001')).toBeVisible({ timeout: 3000 });
  });

  test('ARCHIVAGE JURIDIQUE - Sécurisation et traçabilité', async ({ page }) => {
    await page.click('button:has-text("Juridique")');
    await page.click('button:has-text("Archives")');

    // Rechercher un document
    await page.fill('input[placeholder*="Rechercher"]', 'contrat');
    await page.click('button:has-text("Rechercher")');

    // Vérifier résultats
    await expect(page.locator('.archive-results')).toBeVisible();
    await expect(page.locator('text=Archivé le')).toBeVisible();
  });

  test('BASE DE DONNÉES JURIDIQUE - Consultation et mises à jour', async ({ page }) => {
    await page.click('button:has-text("Juridique")');
    await page.click('button:has-text("Base de Données")');

    // Rechercher jurisprudence
    await page.fill('input[placeholder*="Mot-clé"]', 'RGPD');
    await page.click('button:has-text("Rechercher")');

    // Vérifier résultats
    await expect(page.locator('.jurisprudence-results')).toBeVisible({ timeout: 5000 });
  });

  test('RAPPORTS JURIDIQUES - Génération automatique', async ({ page }) => {
    await page.click('button:has-text("Juridique")');
    await page.click('button:has-text("Rapports")');

    // Générer rapport mensuel
    await page.selectOption('select[name="periode"]', 'mensuel');
    await page.selectOption('select[name="type"]', 'activite');
    await page.click('button:has-text("Générer")');

    await expect(page.locator('text=Rapport généré')).toBeVisible({ timeout: 5000 });
  });
});