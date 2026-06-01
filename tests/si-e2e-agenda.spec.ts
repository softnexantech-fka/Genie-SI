import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-agenda.spec.ts
 * Tests Gestion Agenda et Planning (IMPORTANT)
 * Vérifie: Rendez-vous, Calendrier partagé, Rappels
 */

test.describe('GESTION AGENDA ET PLANNING', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('PLANIFICATION RENDEZ-VOUS - Création et gestion', async ({ page }) => {
    await page.click('button:has-text("Agenda")');
    await page.click('button:has-text("Nouveau RDV")');

    // Créer rendez-vous
    await page.fill('input[placeholder*="Titre"]', 'Réunion client ABC');
    await page.fill('input[name="date"]', '2026-04-10');
    await page.fill('input[name="heure"]', '14:00');
    await page.fill('input[placeholder*="Durée"]', '90');
    await page.fill('textarea[placeholder*="Description"]', 'Présentation offre...');

    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=Réunion client ABC')).toBeVisible({ timeout: 3000 });
  });

  test('CALENDRIER PARTAGÉ - Synchronisation équipe', async ({ page }) => {
    await page.click('button:has-text("Agenda")');
    await page.click('button:has-text("Calendrier")');

    // Vérifier vue équipe
    await expect(page.locator('.calendar-view')).toBeVisible();
    await expect(page.locator('text=Équipe')).toBeVisible();

    // Filtrer par personne
    await page.selectOption('select[name="filtre"]', 'tous');
    await expect(page.locator('.event-items')).toBeVisible();
  });

  test('RAPPELS AUTOMATIQUES - Notifications programmées', async ({ page }) => {
    await page.click('button:has-text("Agenda")');
    await page.click('button:has-text("Rappels")');

    // Configurer rappel
    await page.click('button:has-text("Nouveau Rappel")');
    await page.fill('input[placeholder*="Titre"]', 'Appel fournisseur');
    await page.fill('input[name="date_rappel"]', '2026-04-09T16:00');
    await page.selectOption('select[name="type"]', 'email');

    await page.click('button:has-text("Programmer")');
    await expect(page.locator('text=Rappel programmé')).toBeVisible({ timeout: 3000 });
  });

  test('SYNCHRONISATION ÉQUIPES - Partage planning', async ({ page }) => {
    await page.click('button:has-text("Agenda")');
    await page.click('button:has-text("Synchronisation")');

    // Inviter équipe
    await page.click('button:has-text("Inviter Équipe")');
    await page.fill('input[placeholder*="Emails"]', 'collaborateur@test.com,admin@test.com');
    await page.selectOption('select[name="droits"]', 'lecture_ecriture');

    await page.click('button:has-text("Envoyer Invitations")');
    await expect(page.locator('text=Invitations envoyées')).toBeVisible({ timeout: 3000 });
  });

  test('GESTION CONFLITS - Détection et résolution', async ({ page }) => {
    await page.click('button:has-text("Agenda")');
    await page.click('button:has-text("Conflits")');

    // Vérifier conflits
    await expect(page.locator('.conflicts-list')).toBeVisible();
    await page.click('button:has-text("Résoudre Conflits")');
    await expect(page.locator('text=Conflits résolus')).toBeVisible({ timeout: 3000 });
  });

  test('EXPORTS CALENDRIER - Formats multiples', async ({ page }) => {
    await page.click('button:has-text("Agenda")');
    await page.click('button:has-text("Exports")');

    // Exporter calendrier
    await page.selectOption('select[name="format"]', 'ical');
    await page.selectOption('select[name="periode"]', 'mois');
    await page.click('button:has-text("Exporter")');

    await expect(page.locator('text=Export réussi')).toBeVisible({ timeout: 3000 });
  });
});