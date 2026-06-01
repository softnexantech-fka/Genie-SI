import { test, expect } from '@playwright/test';

const USER_EMAIL = 'admin@example.com';
const USER_PASSWORD = 'Admin#2026';

test('flux utilisateur : login, modales, dossier, tache et logout', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('text=Connexion')).toBeVisible({ timeout: 12000 });

  // Remplace par les champs réels s'ils sont différents
  await page.fill('input[type="email"]', USER_EMAIL);
  await page.fill('input[type="password"]', USER_PASSWORD);
  await page.click('button:has-text("Connexion")');

  await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });

  // Ouvre une modal example (taches/agenda ou autre) - vérifie que onClose n'est plus en erreur
  const selectDossier = page.locator('button:has-text("Nouveau dossier")');
  if (await selectDossier.count() > 0) {
    await selectDossier.click();
    await expect(page.locator('.gc-modal-in')).toBeVisible();
    await page.locator('.gc-modal-in button:has-text("✕")').first().click();
    await expect(page.locator('.gc-modal-in')).toBeHidden();
  }

  // Accès rapide vers module Tâches si présent
  const tacheBtn = page.locator('button:has-text("Tâches")');
  if (await tacheBtn.count() > 0) {
    await tacheBtn.click();
    await expect(page.locator('text=Liste des Tâches')).toBeVisible({ timeout: 8000 });
    await page.locator('button:has-text("Nouvelle tâche")').first().click();
    await expect(page.locator('.gc-modal-in')).toBeVisible();
    await page.locator('.gc-modal-in button:has-text("✕")').first().click();
  }

  // Logout (s'il existe)
  const logoutBtn = page.locator('button:has-text("Déconnexion")');
  if (await logoutBtn.count() > 0) {
    await logoutBtn.click();
  }

  await expect(page.locator('text=Connexion')).toBeVisible({ timeout: 10000 });
});
