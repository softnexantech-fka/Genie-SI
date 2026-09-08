import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJournalImportRows, buildImportedJournalEntries, parseAmount, canonicalizeJournalDate } from '../src/modules/bureautique/journalImportUtils.js';

test('parseJournalImportRows maps debit/credit columns and accounts correctly', () => {
  const rows = [
    ['Date', 'Pièce', 'Libellé', 'Compte Débit', 'Compte Crédit', 'Montants Débits', 'Montants Crédits', 'Tiers', 'Dossier'],
    ['2026-07-01', 'PI-001', 'Achat carburant', '6011', '401', '100000', '100000', 'Fournisseur', 'D-001'],
  ];

  const parsed = parseJournalImportRows(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].compteDebit, '6011');
  assert.equal(parsed[0].compteCredit, '401');
  assert.equal(parsed[0].debit, '100000');
  assert.equal(parsed[0].credit, '100000');
});

test('buildImportedJournalEntries ignores duplicates already present or imported in the same batch', () => {
  const existing = [{
    date: '2026-07-01',
    piece: 'PI-001',
    libelle: 'Achat carburant',
    compteDebit: '6011',
    compteCredit: '401',
    debit: '100000',
    credit: '100000',
    tiers: 'Fournisseur',
    dossierId: 'D-001',
  }];

  const incoming = [{
    date: '2026-07-01',
    piece: 'PI-001',
    libelle: 'Achat carburant',
    compteDebit: '6011',
    compteCredit: '401',
    debit: '100000',
    credit: '100000',
    tiers: 'Fournisseur',
    dossierId: 'D-001',
  }, {
    date: '2026-07-02',
    piece: 'PI-002',
    libelle: 'Autre achat',
    compteDebit: '606',
    compteCredit: '401',
    debit: '25000',
    credit: '25000',
    tiers: 'Fournisseur',
    dossierId: 'D-002',
  }];

  const imported = buildImportedJournalEntries(existing, incoming, { addedBy: 'Test' });
  assert.equal(imported.length, 1);
  assert.equal(imported[0].piece, 'PI-002');
});

// FIX — régression : l'ancien parseAmount tronquait les montants dès qu'un CSV/XLS
// utilisait un séparateur de milliers (point OU virgule), ce qui affichait des montants
// faux dans le tableau du journal après import (ex: 100.000,00 devenait 100 au lieu de 100000).
test('parseAmount handles European and Anglo thousands separators correctly', () => {
  assert.equal(parseAmount('100.000,00'), 100000); // FR : point = milliers, virgule = décimale
  assert.equal(parseAmount('100,000.00'), 100000); // EN : virgule = milliers, point = décimale
  assert.equal(parseAmount('1 500 000'), 1500000); // espaces = milliers (Excel FR)
  assert.equal(parseAmount('1500000,50'), 1500000.5); // virgule décimale seule
  assert.equal(parseAmount('12.5'), 12.5); // point décimal seul
  assert.equal(parseAmount('100000'), 100000); // sans séparateur
});

test('parseJournalImportRows parses European-formatted amounts without truncation', () => {
  const rows = [
    ['Date', 'Pièce', 'Libellé', 'Compte Débit', 'Compte Crédit', 'Montants Débits', 'Montants Crédits'],
    ['2026-07-01', 'PI-010', 'Achat matériel', '2183', '401', '1.250.000,00', '1.250.000,00'],
  ];
  const parsed = parseJournalImportRows(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].debit, '1250000');
  assert.equal(parsed[0].credit, '1250000');
});

// FIX — régression : une même écriture ré-importée depuis un export externe avec un format
// de date différent (DD/MM/YYYY) de celui utilisé en interne (YYYY-MM-DD) n'était pas détectée
// comme doublon car normalizeJournalKey comparait les dates telles quelles (chaînes différentes).
test('buildImportedJournalEntries detects duplicates across different date formats', () => {
  const existing = [{
    date: '2026-07-01', piece: 'PI-020', libelle: 'Loyer bureau',
    compteDebit: '622', compteCredit: '401', debit: '500000', credit: '500000',
  }];
  const incoming = [{
    date: '01/07/2026', piece: 'PI-020', libelle: 'Loyer bureau',
    compteDebit: '622', compteCredit: '401', debit: '500 000,00', credit: '500000',
  }];
  const imported = buildImportedJournalEntries(existing, incoming, { addedBy: 'Test' });
  assert.equal(imported.length, 0); // doit être reconnu comme doublon malgré le format différent
});

test('canonicalizeJournalDate normalizes common date formats to YYYY-MM-DD', () => {
  assert.equal(canonicalizeJournalDate('2026-07-01'), '2026-07-01');
  assert.equal(canonicalizeJournalDate('01/07/2026'), '2026-07-01');
  assert.equal(canonicalizeJournalDate('1/7/2026'), '2026-07-01');
  assert.equal(canonicalizeJournalDate('01.07.2026'), '2026-07-01');
});

// FIX — exigence explicite : plusieurs opérations réellement distinctes peuvent survenir
// à la même date ; seule une combinaison libellé + comptes débit/crédit + montants
// débit/crédit + pièce/tiers/dossier strictement identique doit être considérée doublon.
test('multiple distinct real operations on the same date are never merged as duplicates', () => {
  const existing = [
    { date: '2026-07-05', piece: 'PI-100', libelle: 'Achat fournitures bureau', compteDebit: '6064', compteCredit: '401', debit: '150000', credit: '150000' },
  ];
  const incoming = [
    // Même date, mais libellé/comptes/montant différents → doit être importée
    { date: '2026-07-05', piece: 'PI-101', libelle: 'Paiement loyer', compteDebit: '622', compteCredit: '401', debit: '500000', credit: '500000' },
    // Même date, mêmes comptes, mais montant différent → doit être importée
    { date: '2026-07-05', piece: 'PI-102', libelle: 'Achat fournitures bureau', compteDebit: '6064', compteCredit: '401', debit: '75000', credit: '75000' },
    // Même date, exact doublon de l'écriture existante → doit être ignorée
    { date: '2026-07-05', piece: 'PI-100', libelle: 'Achat fournitures bureau', compteDebit: '6064', compteCredit: '401', debit: '150000', credit: '150000' },
  ];
  const imported = buildImportedJournalEntries(existing, incoming, { addedBy: 'Test' });
  assert.equal(imported.length, 2); // seules PI-101 et PI-102 sont réellement nouvelles
  assert.deepEqual(imported.map(e => e.piece).sort(), ['PI-101', 'PI-102']);
});

// FIX — le nom du document joint ne doit plus influer sur la détection de doublon (cf.
// normalizeJournalKey) : réimporter une écriture déjà présente mais avec un nom de
// fichier joint différent (ou vide) doit tout de même être reconnu comme un doublon.
test('a differing or missing document filename does not prevent duplicate detection', () => {
  const existing = [{
    date: '2026-07-05', piece: 'PI-200', libelle: 'Facture fournisseur XYZ',
    compteDebit: '601', compteCredit: '401', debit: '300000', credit: '300000',
    document: 'facture-xyz-original.pdf',
  }];
  const incoming = [{
    date: '2026-07-05', piece: 'PI-200', libelle: 'Facture fournisseur XYZ',
    compteDebit: '601', compteCredit: '401', debit: '300000', credit: '300000',
    document: '', // ex: réimport d'un fichier exporté (colonne Document vide)
  }];
  const imported = buildImportedJournalEntries(existing, incoming, { addedBy: 'Test' });
  assert.equal(imported.length, 0);
});
