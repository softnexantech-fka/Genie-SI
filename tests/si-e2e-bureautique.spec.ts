import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-bureautique.spec.ts
 * Tests Suite Bureautique Intégrée (CRITIQUE)
 * Vérifie: BudgetRapide, BureauOffice, Formulaires, GestionRapide, PresentationPro, TableurPro, WriterPro
 */

test.describe('SUITE BUREAUTIQUE INTÉGRÉE', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('BUDGET RAPIDE - Calculs automatiques et exports', async ({ page }) => {
    await page.click('button:has-text("Bureautique")');
    await page.click('button:has-text("Budget Rapide")');

    // Créer un budget simple
    await page.fill('input[placeholder*="Titre budget"]', 'Budget Q1 2026');
    await page.fill('input[placeholder*="Revenus"]', '50000');
    await page.fill('input[placeholder*="Charges"]', '35000');

    // Vérifier calcul automatique
    await expect(page.locator('text=Résultat: 15000')).toBeVisible({ timeout: 3000 });

    // Exporter
    await page.click('button:has-text("Exporter PDF")');
    await expect(page.locator('text=Export réussi')).toBeVisible({ timeout: 5000 });
  });

  test('BUREAU OFFICE - Édition collaborative en temps réel', async ({ page }) => {
    await page.click('button:has-text("Bureautique")');
    await page.click('button:has-text("Bureau Office")');

    // Créer un document
    await page.fill('input[placeholder*="Titre"]', 'Rapport Collaboratif');
    await page.click('button:has-text("Créer")');

    // Éditer le contenu
    const editor = page.locator('.editor-content');
    await editor.fill('Contenu du rapport de test...');

    // Sauvegarder
    await page.click('button:has-text("Sauvegarder")');
    await expect(page.locator('text=Document sauvegardé')).toBeVisible({ timeout: 3000 });
  });

  test('FORMULAIRES - Création et validation automatique', async ({ page }) => {
    await page.click('button:has-text("Bureautique")');
    await page.click('button:has-text("Formulaires")');

    // Créer un formulaire
    await page.fill('input[placeholder*="Nom formulaire"]', 'Demande Congés');
    await page.click('button:has-text("Ajouter champ")');
    await page.selectOption('select[name="type"]', 'date');
    await page.fill('input[placeholder*="Label"]', 'Date début');

    // Publier
    await page.click('button:has-text("Publier")');
    await expect(page.locator('text=Formulaire publié')).toBeVisible({ timeout: 3000 });
  });

  test('GESTION RAPIDE - Tableaux de bord et métriques', async ({ page }) => {
    await page.click('button:has-text("Bureautique")');
    await page.click('button:has-text("Gestion Rapide")');

    // Vérifier métriques affichées
    await expect(page.locator('text=Documents actifs')).toBeVisible();
    await expect(page.locator('text=Tâches en cours')).toBeVisible();

    // Créer un tableau de bord
    await page.click('button:has-text("Nouveau Dashboard")');
    await page.fill('input[placeholder*="Titre"]', 'Dashboard Équipe');
    await page.click('button:has-text("Sauvegarder")');

    await expect(page.locator('text=Dashboard créé')).toBeVisible({ timeout: 3000 });
  });

  test('PRESENTATION PRO - Création de slides dynamiques', async ({ page }) => {
    await page.click('button:has-text("Bureautique")');
    await page.click('button:has-text("Presentation Pro")');

    // Créer une présentation
    await page.fill('input[placeholder*="Titre"]', 'Présentation Client');
    await page.click('button:has-text("Ajouter Slide")');

    // Éditer le contenu
    await page.fill('textarea[placeholder*="Contenu"]', 'Slide de démonstration');
    await page.click('button:has-text("Aperçu")');

    await expect(page.locator('.slide-preview')).toBeVisible({ timeout: 3000 });
  });

  test('TABLEUR PRO - Formules avancées et calculs', async ({ page }) => {
    await page.click('button:has-text("Bureautique")');
    await page.click('button:has-text("Tableur Pro")');

    // Créer une feuille
    await page.fill('input[placeholder*="Nom feuille"]', 'Budget Détaillé');
    await page.click('button:has-text("Créer")');

    // Entrer des données
    await page.locator('input[data-cell="A1"]').fill('Revenus');
    await page.locator('input[data-cell="B1"]').fill('10000');
    await page.locator('input[data-cell="A2"]').fill('Charges');
    await page.locator('input[data-cell="B2"]').fill('7000');

    // Formule SOMME
    await page.locator('input[data-cell="B3"]').fill('=SOMME(B1:B2)');

    // Vérifier résultat
    await expect(page.locator('input[data-cell="B3"]')).toHaveValue('3000');
  });

  test('WRITER PRO - Traitement de texte avancé', async ({ page }) => {
    await page.click('button:has-text("Bureautique")');
    await page.click('button:has-text("Writer Pro")');

    // Créer un document
    await page.fill('input[placeholder*="Titre"]', 'Document Officiel');
    await page.click('button:has-text("Créer")');

    // Éditer avec formatage
    const editor = page.locator('.writer-editor');
    await editor.fill('Titre du document');
    await page.click('button[title="Gras"]');
    await page.click('button[title="Italique"]');

    // Insérer une image
    await page.click('button:has-text("Insérer Image")');
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample-image.png');

    // Sauvegarder
    await page.click('button:has-text("Sauvegarder")');
    await expect(page.locator('text=Document sauvegardé')).toBeVisible({ timeout: 5000 });
  });

  test('RESTRICTION - Client n\'accède pas à la bureautique', async ({ page }) => {
    // Logout
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();

    // Login Client
    await page.fill('input[type="email"]', TEST_USERS.CLIENT.email);
    await page.fill('input[type="password"]', TEST_USERS.CLIENT.password);
    await page.click('button:has-text("Connexion")');

    // Vérifier Bureautique non visible
    const bureauBtn = page.locator('button:has-text("Bureautique")');
    if (await bureauBtn.count() > 0) {
      await expect(bureauBtn).toBeDisabled({ timeout: 2000 });
    }
  });
});