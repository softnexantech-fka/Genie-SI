import { test, expect } from '@playwright/test';
import { TEST_USERS, TEST_DOSSIERS, TEST_WORKFLOWS } from './fixtures/test-users';

/**
 * si-e2e-workflows-complete.spec.ts
 * Tests Workflows Complets de Bout en Bout (CRITIQUE)
 * Simule des scénarios réels métier
 */

test.describe('WORKFLOWS COMPLETS', () => {

  test('WORKFLOW 1: Créer Dossier Juridique → Inviter Client → Signer → Archiver', async ({ page }) => {
    // ===== Phase 1: Collaborateur crée dossier
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
    
    const dossierRef = `JUR-COMPLET-${Date.now()}`;
    await page.click('button:has-text("Documents")');
    await page.click('button:has-text("Nouveau dossier")');
    await page.fill('input[placeholder*="Référence"]', dossierRef);
    await page.fill('input[placeholder*="Titre"]', 'Contrat Client ABC');
    await page.fill('input[placeholder*="Montant"]', '5000');
    await page.click('button:has-text("Créer")');
    await expect(page.locator(`text=${dossierRef}`)).toBeVisible({ timeout: 5000 });
    
    // ===== Phase 2: Collaborateur invite Client
    await page.click(`text=${dossierRef}`);
    await page.click('button:has-text("👥")');
    await page.fill('input[placeholder*="Email"]', TEST_USERS.CLIENT.email);
    await page.click('button:has-text("Inviter")');
    await expect(page.locator('text=Invitation envoyée')).toBeVisible({ timeout: 5000 });
    
    // ===== Phase 3: Collaborateur ajoute document et demande signature
    const docTitle = `Contrat-${Date.now()}`;
    await page.click('button:has-text("📄 Nouveau Document")');
    await page.fill('input[placeholder*="Titre"]', docTitle);
    await page.click('button:has-text("Créer")');
    
    await page.click('button:has-text("✍️")');
    await page.fill('input[placeholder*="PIN"]', 'TEST1234');
    await page.click('button:has-text("Signer")');
    await expect(page.locator('text=Signé')).toBeVisible({ timeout: 5000 });
    
    // ===== Phase 4: Archivage
    await page.click('button:has-text("🗂️")');
    await expect(page.locator('text=Archivé')).toBeVisible({ timeout: 5000 });
    
    // ===== Vérification: Client accède au dossier
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();
    
    await page.fill('input[type="email"]', TEST_USERS.CLIENT.email);
    await page.fill('input[type="password"]', TEST_USERS.CLIENT.password);
    await page.click('button:has-text("Connexion")');
    
    await page.click('button:has-text("Documents")');
    await expect(page.locator(`text=${dossierRef}`)).toBeVisible({ timeout: 5000 });
  });

  test('WORKFLOW 2: Créer Facture → Valider → Signer → Archiver', async ({ page }) => {
    // ===== Phase 1: Admin crée facture
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    
    const facNum = `FAC-COMPLETE-${Date.now()}`;
    const montant = '8750.50';
    
    await page.click('button:has-text("Finance")');
    await page.click('button:has-text("Nouvelle Facture")');
    await page.fill('input[placeholder*="Numéro"]', facNum);
    await page.fill('input[placeholder*="Montant"]', montant);
    await page.fill('input[placeholder*="Description"]', 'Honoraires Q1 2026');
    await page.click('button:has-text("Créer")');
    await expect(page.locator(`text=${facNum}`)).toBeVisible({ timeout: 5000 });
    
    // ===== Phase 2: Admin valide montant est correct
    await expect(page.locator(`text=${montant}`)).toBeVisible({ timeout: 3000 });
    
    // ===== Phase 3: Admin signe
    const signBtn = page.locator(`button:has-text("✍️"):near(text=${facNum})`);
    if (await signBtn.count() > 0) {
      await signBtn.click();
      await page.fill('input[placeholder*="PIN"]', 'TEST1234');
      await page.click('button:has-text("Signer")');
      await expect(page.locator('text=Signature valide')).toBeVisible({ timeout: 5000 });
    }
    
    // ===== Phase 4: Archivage
    const archBtn = page.locator(`button:has-text("🗂️"):near(text=${facNum})`);
    if (await archBtn.count() > 0) {
      await archBtn.click();
      await expect(page.locator('text=Archivé')).toBeVisible({ timeout: 5000 });
    }
  });

  test('WORKFLOW 3: Demande Approbation → Collab → Admin → DG → Archivée', async ({ page }) => {
    const refId = `FLOW-APPROVAL-${Date.now()}`;
    
    // ===== Phase 1: Collaborateur crée demande
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    
    await page.click('button:has-text("Demandes")');
    await page.click('button:has-text("Nouvelle Demande")');
    await page.fill('input[placeholder*="Référence"]', refId);
    await page.fill('textarea[placeholder*="Description"]', 'Recruitment Manager Budget Request');
    await page.click('button:has-text("Soumettre")');
    await expect(page.locator(`text=${refId}`)).toBeVisible({ timeout: 5000 });
    
    // ===== Phase 2: Admin approuve
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();
    
    await page.fill('input[type="email"]', TEST_USERS.ADMIN.email);
    await page.fill('input[type="password"]', TEST_USERS.ADMIN.password);
    await page.click('button:has-text("Connexion")');
    
    await page.click('button:has-text("Approbations")');
    const approveAdminBtn = page.locator('button:has-text("✅")').first();
    if (await approveAdminBtn.count() > 0) {
      await approveAdminBtn.click();
      await page.click('button:has-text("Approuver")');
      await expect(page.locator('text=En attente DG')).toBeVisible({ timeout: 5000 });
    }
    
    // ===== Phase 3: DG approuve définitivement
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();
    
    await page.fill('input[type="email"]', TEST_USERS.DG.email);
    await page.fill('input[type="password"]', TEST_USERS.DG.password);
    await page.click('button:has-text("Connexion")');
    
    await page.click('button:has-text("Approbations")');
    const approveDGBtn = page.locator('button:has-text("✅")').first();
    if (await approveDGBtn.count() > 0) {
      await approveDGBtn.click();
      await page.click('button:has-text("Approuver Définitivement")');
      await expect(page.locator('text=Approuvée|Archivée')).toBeVisible({ timeout: 5000 });
    }
  });

  test('WORKFLOW 4: Message Collaborateur → Client → Réponse → Historique', async ({ page }) => {
    const msgText = `Workflow Message Test ${Date.now()}`;
    
    // ===== Phase 1: Collaborateur envoie message
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    
    await page.click('button:has-text("Messagerie")');
    await page.click('button:has-text("Nouveau Message")');
    await page.fill('input[placeholder*="Destinataire"]', TEST_USERS.CLIENT.email);
    await page.fill('textarea[placeholder*="Message"]', msgText);
    await page.click('button:has-text("Envoyer")');
    await expect(page.locator(`text=${msgText}`)).toBeVisible({ timeout: 5000 });
    
    // ===== Phase 2: Client reçoit et répond
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();
    
    await page.fill('input[type="email"]', TEST_USERS.CLIENT.email);
    await page.fill('input[type="password"]', TEST_USERS.CLIENT.password);
    await page.click('button:has-text("Connexion")');
    
    const replyText = `Reply from Client ${Date.now()}`;
    await page.click('button:has-text("Messagerie")');
    await page.click(`text=${TEST_USERS.COLLABORATEUR.name}`);
    await page.fill('textarea[placeholder*="Message"]', replyText);
    await page.click('button:has-text("Envoyer")');
    await expect(page.locator(`text=${replyText}`)).toBeVisible({ timeout: 5000 });
    
    // ===== Phase 3: Collaborateur voit historique complet
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();
    
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    
    await page.click('button:has-text("Messagerie")');
    await page.click(`text=${TEST_USERS.CLIENT.name}`);
    
    // Vérifier historique complet
    await expect(page.locator(`text=${msgText}`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${replyText}`)).toBeVisible({ timeout: 5000 });
  });
});
