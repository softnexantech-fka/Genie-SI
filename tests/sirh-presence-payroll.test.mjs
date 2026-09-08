import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertPresenceEntry, buildPresenceSummary, buildPayrollSimulation } from '../src/modules/sirh/sirhDataUtils.js';

test('upsertPresenceEntry replaces duplicates for the same user and day', () => {
  const initial = [
    { id: 'A', userId: 'U1', date: '2026-06-15', arrivee: '09:00', depart: '17:00', pause: 60, statut: 'PRESENT' },
  ];

  const updated = upsertPresenceEntry(initial, {
    id: 'B',
    userId: 'U1',
    date: '2026-06-15',
    arrivee: '08:30',
    depart: '16:30',
    pause: 45,
    statut: 'EN_POSTE',
  });

  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, 'B');
  assert.equal(updated[0].arrivee, '08:30');
  assert.equal(updated[0].pause, 45);
  assert.equal(updated[0].statut, 'EN_POSTE');
});

test('buildPresenceSummary aggregates month presence correctly', () => {
  const presences = [
    { userId: 'U1', date: '2026-06-01', arrivee: '08:00', depart: '17:00', pause: 60, statut: 'PRESENT', retardMin: 0, dureeMin: 480 },
    { userId: 'U1', date: '2026-06-02', arrivee: '09:30', depart: '17:30', pause: 60, statut: 'PRESENT', retardMin: 30, dureeMin: 480 },
    { userId: 'U1', date: '2026-06-03', arrivee: '08:00', depart: '16:00', pause: 60, statut: 'PRESENT', retardMin: 0, dureeMin: 420 },
  ];
  const leaves = [
    { userId: 'U1', statut: 'APPROUVE', debut: '2026-06-04', fin: '2026-06-04' },
  ];

  const summary = buildPresenceSummary({ presences, leaves, userId: 'U1', period: '2026-06' });

  assert.equal(summary.presentDays, 3);
  assert.equal(summary.absentDays, 17);
  assert.equal(summary.totalRetardMin, 30);
  assert.equal(summary.totalHSupMin, 0);
  assert.equal(summary.leaveDays, 1);
});

test('buildPayrollSimulation uses presence-derived deductions and salary base', () => {
  const presence = buildPresenceSummary({
    presences: [
      { userId: 'U1', date: '2026-06-01', arrivee: '08:00', depart: '17:00', pause: 60, statut: 'PRESENT', retardMin: 0, dureeMin: 480 },
      { userId: 'U1', date: '2026-06-02', arrivee: '09:30', depart: '17:30', pause: 60, statut: 'PRESENT', retardMin: 30, dureeMin: 480 },
    ],
    leaves: [],
    userId: 'U1',
    period: '2026-06',
  });

  const result = buildPayrollSimulation({
    brut: 250000,
    avantages: 10000,
    retenuesManuelles: 5000,
    presence,
    taux: { cnss_sal: 2.5, cnamgs_sal: 1.5, cnss_pat: 17.5, cnamgs_pat: 4.1 },
    irppCalculator: (base) => Math.round(base * 0.05),
    salaireBaseDefaut: 200000,
  });

  assert.equal(result.deductionRetard, 355);
  assert.equal(result.deductionAbsence, 215840);
  assert.equal(result.retenues, 221195);
  assert.equal(result.net, 18525);
});
