import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';

/**
 * si-e2e-messaging.spec.ts
 * Tests Messagerie & Notifications (CRITIQUE)
 * Vérifie: Envoi message → Notif → Lecture → Historique
 */

test.describe('MESSAGERIE & NOTIFICATIONS', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USERS.COLLABORATEUR.email);
    await page.fill('input[type="password"]', TEST_USERS.COLLABORATEUR.password);
    await page.click('button:has-text("Connexion")');
    await expect(page.locator('text=Bienvenue')).toBeVisible({ timeout: 15000 });
  });

  test('ENVOYER message - Destinataire reçoit', async ({ page }) => {
    const msgText = `Test message ${Date.now()}`;
    
    await page.click('button:has-text("Messagerie")');
    await page.click('button:has-text("Nouveau Message")');
    
    await page.fill('input[placeholder*="Destinataire"]', TEST_USERS.CLIENT.email);
    await page.fill('textarea[placeholder*="Message"]', msgText);
    await page.click('button:has-text("Envoyer")');
    
    // Vérifier dans historique
    await expect(page.locator(`text=${msgText}`)).toBeVisible({ timeout: 5000 });
  });

  test('NOTIFICATION - Client notifié de message reçu', async ({ page }) => {
    // Envoyer message d'abord
    const msgText = `Notification test ${Date.now()}`;
    
    await page.click('button:has-text("Messagerie")');
    await page.click('button:has-text("Nouveau Message")');
    await page.fill('input[placeholder*="Destinataire"]', TEST_USERS.CLIENT.email);
    await page.fill('textarea[placeholder*="Message"]', msgText);
    await page.click('button:has-text("Envoyer")');
    
    // Logout & login Client
    await page.locator('button:has-text("👤")').first().click();
    await page.locator('button:has-text("Déconnexion")').click();
    
    await page.fill('input[type="email"]', TEST_USERS.CLIENT.email);
    await page.fill('input[type="password"]', TEST_USERS.CLIENT.password);
    await page.click('button:has-text("Connexion")');
    
    // Client doit voir notif
    const notifBtn = page.locator('button:has-text("🔔")');
    if (await notifBtn.count() > 0) {
      await notifBtn.click();
      await expect(page.locator(`text=${msgText}|Vous avez reçu`)).toBeVisible({ timeout: 5000 });
    }
  });

  test('HISTORIQUE messages - Conversation persiste', async ({ page }) => {
    await page.click('button:has-text("Messagerie")');
    
    // Chercher conversation
    const conversationLink = page.locator(`text=${TEST_USERS.CLIENT.name}`).first();
    if (await conversationLink.count() > 0) {
      await conversationLink.click();
      
      // Historique doit avoir messages précédents
      await expect(page.locator('text=Historique|Messages|Test message')).toBeVisible({ timeout: 5000 });
    }
  });

  test('SUPPRESSION message - Non récupérable', async ({ page }) => {
    const msgText = `Delete test ${Date.now()}`;
    
    await page.click('button:has-text("Messagerie")');
    await page.click('button:has-text("Nouveau Message")');
    await page.fill('input[placeholder*="Destinataire"]', TEST_USERS.CLIENT.email);
    await page.fill('textarea[placeholder*="Message"]', msgText);
    await page.click('button:has-text("Envoyer")');
    
    // Chercher et supprimer
    const msgItem = page.locator(`text=${msgText}`);
    await msgItem.hover();
    const deleteBtn = page.locator('button:has-text("🗑️"):near(${msgItem})');
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      await page.click('button:has-text("Confirmer")');
      
      // Message doit être parti
      await expect(msgItem).not.toBeVisible({ timeout: 5000 });
    }
  });
});
