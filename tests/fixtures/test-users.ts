/**
 * fixtures/test-users.ts
 * Utilisateurs de test avec rôles qui correspondent à la réalité SI
 */
export const TEST_USERS = {
  DG: {
    id: 'USR-DG-001',
    email: 'dg@genie-consultant.com',
    password: 'DG@GenieSI#2026!',
    name: 'Directeur Général',
    role: 'Directeur Général',
    level: 5,
    canAccess: ['ALL'],
    canApprove: true
  },
  ADMIN: {
    id: 'USR-ADM-000',
    email: 'admin@genie-consultant.com',
    password: 'Admin@SI#2026!',
    name: 'Superviseur SI',
    role: 'Direction SI',
    level: 6,
    canAccess: ['DOCS','FINANCE','MESSAGING','ADMIN','AUDIT'],
    canApprove: true
  },
  COLLABORATEUR: {
    id: 'USR-COL-001',
    email: 'collab@genie-consultant.com',
    password: 'Collab#2026',
    name: 'Collaborateur',
    role: 'Juriste',
    level: 2,
    canAccess: ['DOCS','TACHES','MESSAGING','DRAFTS'],
    canApprove: false
  },
  CLIENT: {
    id: 'USR-CLI-001',
    email: 'client@example.com',
    password: 'Client#2026',
    name: 'Client External',
    role: 'Client',
    level: 1,
    canAccess: ['DOCS_SHARED','TACHES_ASSIGNED','MESSAGING'],
    canApprove: false
  },
  AUDIT: {
    id: 'USR-AUD-001',
    email: 'audit@genie-consultant.com',
    password: 'Audit#2026',
    name: 'Auditeur',
    role: 'Auditeur',
    level: 3,
    canAccess: ['AUDIT','DOCS','REPORTS'],
    canApprove: false
  }
};

export const TEST_DOSSIERS = {
  JURIDIQUE_01: {
    ref: 'JUR-2026-001',
    titre: 'Contrat Client ABC SARL',
    type: 'CONTENTIEUX',
    status: 'EN_COURS',
    dateLimite: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    montant: 5000
  },
  FINANCE_01: {
    ref: 'FIN-2026-002',
    titre: 'Audit Financier Trimestriel',
    type: 'AUDIT',
    status: 'VALIDTION_EN_ATTENTE',
    dateLimite: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
    montant: 8500
  },
  RH_01: {
    ref: 'RH-2026-003',
    titre: 'Recrutement Juriste Senior',
    type: 'RECRUTEMENT',
    status: 'APPROBATION_DIRECTEUR',
    approvers: ['DG', 'ADMIN'],
    montant: 50000
  }
};

export const TEST_WORKFLOWS = {
  CREATION_DOSSIER: 'Créer dossier → Assigner → Inviter client',
  SIGNATURE_DOCUMENT: 'Upload doc → Demander signature → Signer → Archiver',
  APPROBATION_CASCADE: 'Demande → Collab → Admin → DG → Archiver',
  FACTURE_COMPLETE: 'Créer facture → Valider montant → Signer → Envoyer → Payer'
};
