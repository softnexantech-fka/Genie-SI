import { test, expect } from '@playwright/test';

test('Test de connectivité basique', async ({ page }) => {
  try {
    console.log('Tentative de connexion à http://localhost:4173');
    await page.goto('http://localhost:4173', { timeout: 10000 });
    console.log('Connexion réussie');

    const title = await page.title();
    console.log('Titre de la page:', title);

    // Prendre une capture d'écran
    await page.screenshot({ path: 'connectivity-test.png' });
    console.log('Capture d\'écran sauvegardée');

    // Vérifier qu'on a du contenu
    const bodyText = await page.locator('body').innerText();
    console.log('Contenu de la page (aperçu):', bodyText.substring(0, 200) + '...');

  } catch (error) {
    console.error('Erreur de connectivité:', error.message);
    throw error;
  }
});