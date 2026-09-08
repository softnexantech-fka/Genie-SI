import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanComptesFromRows } from '../src/modules/finance/planImportUtils.js';

test('parsePlanComptesFromRows maps common Excel headers and ignores empty rows', () => {
  const rows = [
    ['Numéro', 'Libellé', 'Classe', 'Type'],
    ['101', 'Capital', '1', 'CP'],
    ['411', 'Clients', '4', 'CH'],
    ['', '', '', ''],
  ];

  const result = parsePlanComptesFromRows(rows);

  assert.deepEqual(result, [
    { num: '101', lib: 'Capital', cl: 1, type: 'CP', custom: false },
    { num: '411', lib: 'Clients', cl: 4, type: 'CH', custom: false },
  ]);
});

test('parsePlanComptesFromRows supports French headers and fallback labels', () => {
  const rows = [
    ['Code', 'Intitulé', 'Classe comptable', 'Nature'],
    ['601', 'Achats', '6', 'CH'],
  ];

  const result = parsePlanComptesFromRows(rows);

  assert.deepEqual(result, [
    { num: '601', lib: 'Achats', cl: 6, type: 'CH', custom: false },
  ]);
});

test('parsePlanComptesFromRows infers OHADA classes and types from labels', () => {
  const rows = [
    ['Compte', 'Libellé', 'Classe', 'Type'],
    ['401', 'Fournisseurs', '4', 'Tiers'],
    ['571', 'Caisse', '5', 'Trésorerie'],
    ['706', 'Prestations', '7', 'Produits'],
    ['881', 'Charges HAO', '8', 'HAO'],
  ];

  const result = parsePlanComptesFromRows(rows);

  assert.deepEqual(result, [
    { num: '401', lib: 'Fournisseurs', cl: 4, type: 'TRS', custom: false },
    { num: '571', lib: 'Caisse', cl: 5, type: 'AT', custom: false },
    { num: '706', lib: 'Prestations', cl: 7, type: 'PDT', custom: false },
    { num: '881', lib: 'Charges HAO', cl: 8, type: 'HAO', custom: false },
  ]);
});

test('parsePlanComptesFromRows deduplicates accounts by number and preserves first occurrence', () => {
  const rows = [
    ['Numéro', 'Libellé', 'Classe', 'Type'],
    ['401', 'Fournisseurs', '4', 'Tiers'],
    ['401', 'Fournisseurs doublon', '4', 'Tiers'],
    ['411', 'Clients', '4', 'TRS'],
  ];

  const result = parsePlanComptesFromRows(rows);

  assert.deepEqual(result, [
    { num: '401', lib: 'Fournisseurs', cl: 4, type: 'TRS', custom: false },
    { num: '411', lib: 'Clients', cl: 4, type: 'TRS', custom: false },
  ]);
});
