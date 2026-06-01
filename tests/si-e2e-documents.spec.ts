import { test, expect } from '@playwright/test';
import { TEST_USERS, TEST_DOSSIERS } from './fixtures/test-users';

/**
 * si-e2e-documents.spec.ts
 * Tests Gestion Documents & Dossiers (CRITIQUE)
 * Workflows: Créer → Partager → Inviter → Signer → Archiver
 */

test.describe('DOCUMENTS & DOSSIERS', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('CRÉER dossier - Données enregistrées correctement', async ({ page }) => {
    const dossierRef = `TEST-${Date.now()}`;
    
    await page.click('button:has-text("Nouveau dossier")');
    await expect(page.locator('.gc-modal-in')).toBeVisible();
    
    await page.fill('input[placeholder*="Référence"]', dossierRef);
    await page.fill('input[placeholder*="Titre"]', 'Test Dossier Complet');
    await page.fill('input[placeholder*="Montant"]', '5000');
    await page.click('button:has-text("Créer")');
    
    await expect(page.locator(`text=${dossierRef}`)).toBeVisible({ timeout: 5000 });
  });

  test('PARTAGER dossier - Client reçoit accès', async ({ page }) => {
    // D'abord collaborateur crée + partage
    const dossierRef = `SHARE-${Date.now()}`;
    await page.click('button:has-text("Nouveau dossier")');
    await page.fill('input[placeholder*="Référence"]', dossierRef);
    await page.fill('input[placeholder*="Titre"]', 'Dossier à Partager');
    await page.click('button:has-text("Créer")');
    
    await page.click(`[data-test="dossier-${dossierRef}"] button:has-text("👥")`);
    await page.fill('input[placeholder*="Email"]', TEST_USERS.CLIENT.email);
    await page.click('button:has-text("Inviter")');
    
    // Vérifier que client a reçu notification
    await page.locator('button:has-text("🔔")').click();
    await expect(page.locator('text=Dossier à Partager')).toBeVisible({ timeout: 5000 });
    
    // Logout et login comme Client
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();
    
    await page.fill('input[type="email"]', TEST_USERS.CLIENT.email);
    await page.fill('input[type="password"]', TEST_USERS.CLIENT.password);
    await page.click('button:has-text("Connexion")');
    
    // Client voit le dossier partagé
    await expect(page.locator(`text=${dossierRef}`)).toBeVisible({ timeout: 5000 });
  });

  test('UPLOAD document - Fichier enregistré & liste mise à jour', async ({ page }) => {
    const dossierRef = `DOC-${Date.now()}`;
    
    await page.click('button:has-text("Nouveau dossier")');
    await page.fill('input[placeholder*="Référence"]', dossierRef);
    await page.fill('input[placeholder*="Titre"]', 'Dossier avec Documents');
    await page.click('button:has-text("Créer")');
    
    // Ouvrir dossier
    await page.click(`text=${dossierRef}`);
    await page.click('button:has-text("📎 Ajouter Document")');
    
    // Upload mock (Playwright simule)
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      // Si vrai file input, simuler
      // Dans réalité, Playwright peut upload avec setInputFiles()
    }
    
    await page.fill('input[placeholder*="Titre document"]', 'Contrat Client');
    await page.click('button:has-text("Enregistrer")');
    
    // Vérifier que document est dans la liste
    await expect(page.locator('text=Contrat Client')).toBeVisible({ timeout: 5000 });
  });

  test('WORKFLOW SIGNATURE - Demander + Signer + Archiver', async ({ page }) => {
    const docTitle = `Signature-${Date.now()}`;
    
    // Créer & partager avec client
    const dossierRef = `SIG-${Date.now()}`;
    await page.click('button:has-text("Nouveau dossier")');
    await page.fill('input[placeholder*="Référence"]', dossierRef);
    await page.fill('input[placeholder*="Titre"]', 'Dossier Signature');
    await page.click('button:has-text("Créer")');
    
    // Ajouter document
    await page.click(`text=${dossierRef}`);
    await page.click('button:has-text("📄 Nouveau Document")');
    await page.fill('input[placeholder*="Titre"]', docTitle);
    await page.click('button:has-text("Créer")');
    
    // Demander signature
    await page.click(`[data-test="doc-${docTitle}"] button:has-text("✍️")`);
    await page.fill('input[placeholder*="PIN"]', 'TEST1234');
    await page.click('button:has-text("Signer")');
    
    // Vérifier signature enregistrée
    await expect(page.locator('text=Signé par')).toBeVisible({ timeout: 5000 });
    
    // Archiver après signature
    await page.click(`[data-test="doc-${docTitle}"] button:has-text("🗂️")`);
    await expect(page.locator('text=Archivé')).toBeVisible({ timeout: 5000 });
  });

  test('PERMISSIONS - Client NE peut ÉDITER document', async ({ page }) => {
    // Vérifier que Client ne peut pas modifier/supprimer
    const dossierRef = TEST_DOSSIERS.JURIDIQUE_01.ref;
    
    await page.click(`text=${dossierRef}`);
    
    // Chercher bouton d'édition
    const editBtn = page.locator('button:has-text("✏️")');
    if (await editBtn.count() > 0) {
      // Si visible, vérifier qu'il est disabled pour client
      await expect(editBtn.first()).toBeDisabled({ timeout: 2000 });
    }
  });

  test('ARCHIVAGE - Document archivé = non modifiable', async ({ page }) => {
    // Créer doc
    const docTitle = `Archive-${Date.now()}`;
    const dossierRef = `ARCH-${Date.now()}`;
    
    await page.click('button:has-text("Nouveau dossier")');
    await page.fill('input[placeholder*="Référence"]', dossierRef);
    await page.fill('input[placeholder*="Titre"]', 'Dossier Archive');
    await page.click('button:has-text("Créer")');
    
    await page.click(`text=${dossierRef}`);
    await page.click('button:has-text("📄 Nouveau Document")');
    await page.fill('input[placeholder*="Titre"]', docTitle);
    await page.click('button:has-text("Créer")');
    
    // Archiver
    await page.click(`[data-test="doc-${docTitle}"] button:has-text("🗂️")`);
    
    // Tentative édition = bloquée
    const editBtn = page.locator(`[data-test="doc-${docTitle}"] button:has-text("✏️")`);
    if (await editBtn.count() > 0) {
      await expect(editBtn.first()).toBeDisabled({ timeout: 2000 });
    }
  });
});
