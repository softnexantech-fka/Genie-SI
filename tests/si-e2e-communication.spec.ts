import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-communication.spec.ts
 * Tests Communication d'Entreprise (IMPORTANT)
 * Vérifie: Marketing, Communication interne, Réseaux sociaux
 */

test.describe('COMMUNICATION D\'ENTREPRISE', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('CAMPAGNES MARKETING - Création et gestion', async ({ page }) => {
    await page.click('button:has-text("Communication")');
    await page.click('button:has-text("Campagnes")');

    // Créer campagne
    await page.click('button:has-text("Nouvelle Campagne")');
    await page.fill('input[placeholder*="Titre"]', 'Campagne Printemps 2026');
    await page.selectOption('select[name="type"]', 'email');
    await page.fill('textarea[placeholder*="Contenu"]', 'Découvrez nos nouvelles offres...');

    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=Campagne créée')).toBeVisible({ timeout: 3000 });
  });

  test('COMMUNICATION INTERNE - Newsletters et annonces', async ({ page }) => {
    await page.click('button:has-text("Communication")');
    await page.click('button:has-text("Interne")');

    // Créer newsletter
    await page.click('button:has-text("Nouvelle Newsletter")');
    await page.fill('input[placeholder*="Sujet"]', 'Nouvelles de l\'équipe');
    await page.fill('textarea[placeholder*="Message"]', 'Chers collègues...');

    await page.click('button:has-text("Envoyer")');
    await expect(page.locator('text=Newsletter envoyée')).toBeVisible({ timeout: 3000 });
  });

  test('GESTION RÉSEAUX SOCIAUX - Publications et monitoring', async ({ page }) => {
    await page.click('button:has-text("Communication")');
    await page.click('button:has-text("Réseaux Sociaux")');

    // Programmer publication
    await page.click('button:has-text("Nouvelle Publication")');
    await page.selectOption('select[name="reseau"]', 'linkedin');
    await page.fill('textarea[placeholder*="Contenu"]', 'Publication LinkedIn...');
    await page.fill('input[name="date_publication"]', '2026-04-01T10:00');

    await page.click('button:has-text("Programmer")');
    await expect(page.locator('text=Publication programmée')).toBeVisible({ timeout: 3000 });
  });

  test('NEWSLETTERS - Gestion abonnés et envois', async ({ page }) => {
    await page.click('button:has-text("Communication")');
    await page.click('button:has-text("Newsletters")');

    // Gérer abonnés
    await expect(page.locator('text=Nombre d\'abonnés')).toBeVisible();
    await page.click('button:has-text("Exporter Liste")');
    await expect(page.locator('text=Export réussi')).toBeVisible({ timeout: 3000 });
  });

  test('ÉVÉNEMENTS ENTREPRISE - Organisation et promotion', async ({ page }) => {
    await page.click('button:has-text("Communication")');
    await page.click('button:has-text("Événements")');

    // Créer événement
    await page.click('button:has-text("Nouvel Événement")');
    await page.fill('input[placeholder*="Titre"]', 'Séminaire annuel');
    await page.fill('input[name="date"]', '2026-06-15');
    await page.fill('input[placeholder*="Lieu"]', 'Salle de conférence');

    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=Séminaire annuel')).toBeVisible({ timeout: 3000 });
  });

  test('RELATIONS PRESSE - Gestion communiqués', async ({ page }) => {
    await page.click('button:has-text("Communication")');
    await page.click('button:has-text("Presse")');

    // Rédiger communiqué
    await page.click('button:has-text("Nouveau Communiqué")');
    await page.fill('input[placeholder*="Titre"]', 'Nouveaux partenariats');
    await page.fill('textarea[placeholder*="Contenu"]', 'Nous sommes fiers d\'annoncer...');

    await page.click('button:has-text("Publier")');
    await expect(page.locator('text=Communiqué publié')).toBeVisible({ timeout: 3000 });
  });
});