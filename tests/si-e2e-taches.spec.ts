import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-taches.spec.ts
 * Tests Gestion des Tâches (IMPORTANT)
 * Vérifie: Création tâches, Assignation, Suivi progression, Échéances
 */

test.describe('GESTION DES TÂCHES', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('CRÉATION TÂCHES - Définition et paramètres', async ({ page }) => {
    await page.click('button:has-text("Tâches")');
    await page.click('button:has-text("Nouvelle Tâche")');

    // Créer tâche
    await page.fill('input[placeholder*="Titre"]', 'Rédiger rapport client');
    await page.fill('textarea[placeholder*="Description"]', 'Préparer rapport détaillé...');
    await page.selectOption('select[name="priorite"]', 'haute');
    await page.fill('input[name="echeance"]', '2026-04-20');

    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=Rédiger rapport client')).toBeVisible({ timeout: 3000 });
  });

  test('ASSIGNATION ÉQUIPE - Distribution workload', async ({ page }) => {
    await page.click('button:has-text("Tâches")');
    await page.click('button:has-text("Assigner")');

    // Assigner tâche
    await page.selectOption('select[name="tache"]', 'Rédiger rapport client');
    await page.selectOption('select[name="assigne"]', 'collaborateur@test.com');
    await page.fill('input[placeholder*="Commentaire"]', 'Priorité haute pour client VIP');

    await page.click('button:has-text("Assigner")');
    await expect(page.locator('text=Tâche assignée')).toBeVisible({ timeout: 3000 });
  });

  test('SUIVI PROGRESSION - Mise à jour statut', async ({ page }) => {
    await page.click('button:has-text("Tâches")');
    await page.click('button:has-text("Mes Tâches")');

    // Mettre à jour progression
    await page.click('text=Rédiger rapport client');
    await page.selectOption('select[name="statut"]', 'en_cours');
    await page.fill('input[placeholder*="Progression"]', '60');
    await page.fill('textarea[placeholder*="Commentaire"]', 'Structure terminée, contenu en cours');

    await page.click('button:has-text("Mettre à jour")');
    await expect(page.locator('text=60%')).toBeVisible({ timeout: 3000 });
  });

  test('ÉCHÉANCES ET RAPPELS - Gestion temps', async ({ page }) => {
    await page.click('button:has-text("Tâches")');
    await page.click('button:has-text("Échéances")');

    // Vérifier échéances proches
    await expect(page.locator('text=Échéances cette semaine')).toBeVisible();
    await expect(page.locator('.deadline-alerts')).toBeVisible();

    // Configurer rappel
    await page.click('button:has-text("Configurer Rappels")');
    await page.selectOption('select[name="delai"]', '24h');
    await page.click('button:has-text("Activer")');

    await expect(page.locator('text=Rappels activés')).toBeVisible({ timeout: 3000 });
  });

  test('PRIORISATION - Organisation workflow', async ({ page }) => {
    await page.click('button:has-text("Tâches")');
    await page.click('button:has-text("Priorisation")');

    // Trier par priorité
    await page.selectOption('select[name="tri"]', 'priorite_desc');
    await expect(page.locator('text=Haute priorité')).toBeVisible();

    // Modifier priorité
    await page.click('button:has-text("Modifier Priorité")');
    await page.selectOption('select[name="nouvelle_priorite"]', 'critique');
    await page.click('button:has-text("Appliquer")');

    await expect(page.locator('text=Critique')).toBeVisible({ timeout: 3000 });
  });

  test('RAPPORTS TÂCHES - Statistiques et analyses', async ({ page }) => {
    await page.click('button:has-text("Tâches")');
    await page.click('button:has-text("Rapports")');

    // Générer rapport
    await page.selectOption('select[name="periode"]', 'mensuel');
    await page.selectOption('select[name="type"]', 'performance');
    await page.click('button:has-text("Générer")');

    await expect(page.locator('text=Rapport généré')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.task-report')).toBeVisible();
  });
});