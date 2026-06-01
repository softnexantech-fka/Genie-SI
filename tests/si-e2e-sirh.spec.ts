import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-sirh.spec.ts
 * Tests Système RH Intégré (CRITIQUE)
 * Vérifie: Gestion employés, Paie, Formation, Évaluation, Recrutement
 */

test.describe('SYSTÈME RH INTÉGRÉ', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('GESTION EMPLOYÉS - CRUD complet et organigramme', async ({ page }) => {
    await page.click('button:has-text("SIRH")');
    await page.click('button:has-text("Employés")');

    // Ajouter employé
    await page.click('button:has-text("Ajouter")');
    await page.fill('input[placeholder*="Nom"]', 'Dupont');
    await page.fill('input[placeholder*="Prénom"]', 'Jean');
    await page.fill('input[placeholder*="Email"]', 'jean.dupont@test.com');
    await page.selectOption('select[name="poste"]', 'Consultant');

    await page.click('button:has-text("Sauvegarder")');
    await expect(page.locator('text=Jean Dupont')).toBeVisible({ timeout: 3000 });
  });

  test('PAIE ET RÉMUNÉRATION - Calculs automatiques', async ({ page }) => {
    await page.click('button:has-text("SIRH")');
    await page.click('button:has-text("Paie")');

    // Sélectionner employé
    await page.selectOption('select[name="employe"]', 'Jean Dupont');
    await page.fill('input[placeholder*="Salaire base"]', '3500');
    await page.fill('input[placeholder*="Heures sup"]', '10');

    // Calcul automatique
    await page.click('button:has-text("Calculer")');
    await expect(page.locator('text=Total brut:')).toBeVisible({ timeout: 3000 });
  });

  test('FORMATION ET COMPÉTENCES - Gestion parcours', async ({ page }) => {
    await page.click('button:has-text("SIRH")');
    await page.click('button:has-text("Formation")');

    // Créer formation
    await page.click('button:has-text("Nouvelle Formation")');
    await page.fill('input[placeholder*="Titre"]', 'Management Agile');
    await page.fill('input[placeholder*="Durée"]', '2 jours');
    await page.selectOption('select[name="type"]', 'interne');

    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=Management Agile')).toBeVisible({ timeout: 3000 });
  });

  test('ÉVALUATION PERFORMANCE - Entretiens annuels', async ({ page }) => {
    await page.click('button:has-text("SIRH")');
    await page.click('button:has-text("Évaluations")');

    // Créer évaluation
    await page.click('button:has-text("Nouvelle Évaluation")');
    await page.selectOption('select[name="employe"]', 'Jean Dupont');
    await page.selectOption('select[name="type"]', 'annuel');
    await page.fill('textarea[placeholder*="Commentaires"]', 'Excellente performance...');

    await page.click('button:has-text("Sauvegarder")');
    await expect(page.locator('text=Évaluation sauvegardée')).toBeVisible({ timeout: 3000 });
  });

  test('PLANNING RH - Gestion congés et absences', async ({ page }) => {
    await page.click('button:has-text("SIRH")');
    await page.click('button:has-text("Planning")');

    // Demander congés
    await page.click('button:has-text("Demander Congés")');
    await page.fill('input[name="date_debut"]', '2026-04-01');
    await page.fill('input[name="date_fin"]', '2026-04-05');
    await page.selectOption('select[name="type"]', 'payes');

    await page.click('button:has-text("Soumettre")');
    await expect(page.locator('text=Demande envoyée')).toBeVisible({ timeout: 3000 });
  });

  test('RECRUTEMENT - Processus complet', async ({ page }) => {
    await page.click('button:has-text("SIRH")');
    await page.click('button:has-text("Recrutement")');

    // Créer offre
    await page.click('button:has-text("Nouvelle Offre")');
    await page.fill('input[placeholder*="Poste"]', 'Consultant Senior');
    await page.fill('textarea[placeholder*="Description"]', 'Recherche consultant expérimenté...');
    await page.selectOption('select[name="departement"]', 'Conseil');

    await page.click('button:has-text("Publier")');
    await expect(page.locator('text=Offre publiée')).toBeVisible({ timeout: 3000 });
  });
});