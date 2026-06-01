import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-logistique.spec.ts
 * Tests Gestion Logistique (IMPORTANT)
 * Vérifie: Stocks, Commandes, Livraisons, Chaîne d'approvisionnement
 */

test.describe('GESTION LOGISTIQUE', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('GESTION STOCKS - Inventaire et alertes', async ({ page }) => {
    await page.click('button:has-text("Logistique")');
    await page.click('button:has-text("Stocks")');

    // Vérifier niveaux stock
    await expect(page.locator('text=Stock disponible')).toBeVisible();
    await expect(page.locator('text=Seuil alerte')).toBeVisible();

    // Ajuster stock
    await page.click('button:has-text("Ajuster Stock")');
    await page.selectOption('select[name="produit"]', 'Ordinateur portable');
    await page.fill('input[placeholder*="Quantité"]', '5');

    await page.click('button:has-text("Valider")');
    await expect(page.locator('text=Stock ajusté')).toBeVisible({ timeout: 3000 });
  });

  test('COMMANDES FOURNISSEURS - Processus achat', async ({ page }) => {
    await page.click('button:has-text("Logistique")');
    await page.click('button:has-text("Commandes")');

    // Créer commande
    await page.click('button:has-text("Nouvelle Commande")');
    await page.selectOption('select[name="fournisseur"]', 'Dell Technologies');
    await page.fill('input[placeholder*="Référence"]', 'CMD-2026-001');
    await page.click('button:has-text("Ajouter Ligne")');

    await page.selectOption('select[name="produit"]', 'Ordinateur portable');
    await page.fill('input[placeholder*="Quantité"]', '10');
    await page.fill('input[placeholder*="Prix"]', '800');

    await page.click('button:has-text("Enregistrer")');
    await expect(page.locator('text=CMD-2026-001')).toBeVisible({ timeout: 3000 });
  });

  test('LIVRAISONS CLIENTS - Suivi et confirmation', async ({ page }) => {
    await page.click('button:has-text("Logistique")');
    await page.click('button:has-text("Livraisons")');

    // Créer livraison
    await page.click('button:has-text("Nouvelle Livraison")');
    await page.fill('input[placeholder*="Numéro commande"]', 'CMD-2026-001');
    await page.fill('input[name="date_livraison"]', '2026-04-15');
    await page.selectOption('select[name="transporteur"]', 'Chronopost');

    await page.click('button:has-text("Planifier")');
    await expect(page.locator('text=Livraison planifiée')).toBeVisible({ timeout: 3000 });
  });

  test('OPTIMISATION CHAÎNES - Analyse et recommandations', async ({ page }) => {
    await page.click('button:has-text("Logistique")');
    await page.click('button:has-text("Optimisation")');

    // Lancer analyse
    await page.click('button:has-text("Analyser Chaîne")');
    await expect(page.locator('text=Analyse en cours')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Recommandations')).toBeVisible({ timeout: 10000 });
  });

  test('SUIVI TRANSPORT - Traçabilité temps réel', async ({ page }) => {
    await page.click('button:has-text("Logistique")');
    await page.click('button:has-text("Transport")');

    // Suivre colis
    await page.fill('input[placeholder*="Numéro tracking"]', 'TR123456789');
    await page.click('button:has-text("Suivre")');

    await expect(page.locator('text=Statut:')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Position actuelle')).toBeVisible();
  });

  test('GESTION ENTREPÔTS - Organisation et picking', async ({ page }) => {
    await page.click('button:has-text("Logistique")');
    await page.click('button:has-text("Entrepôts")');

    // Organiser entrepôt
    await expect(page.locator('text=Emplacements libres')).toBeVisible();
    await expect(page.locator('text=Occupation')).toBeVisible();

    // Créer picking
    await page.click('button:has-text("Nouveau Picking")');
    await page.fill('input[placeholder*="Commande"]', 'CMD-2026-001');
    await page.click('button:has-text("Générer Liste")');

    await expect(page.locator('text=Liste de picking générée')).toBeVisible({ timeout: 3000 });
  });
});