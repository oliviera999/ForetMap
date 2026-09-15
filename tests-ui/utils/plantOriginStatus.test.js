import { describe, expect, it } from 'vitest';
import { plantMatchesStructuredFilters } from '../../src/utils/plantFilters.js';
import {
  ORIGIN_STATUS_LABELS,
  normalizeOriginStatus,
  originStatusLabel,
} from '../../src/utils/plantOriginStatus.js';
import {
  IUCN_STATUS_LABELS,
  iucnStatusBadgeLabel,
  normalizeIucnStatus,
} from '../../src/utils/plantIucnStatus.js';

describe('plantOriginStatus', () => {
  it('normalise et libelle les valeurs canoniques', () => {
    expect(normalizeOriginStatus('envahissant')).toBe('envahissant');
    expect(normalizeOriginStatus('Indigène')).toBe('indigene');
    expect(normalizeOriginStatus('')).toBe('');
    expect(originStatusLabel('introduit')).toBe('Introduit');
    expect(ORIGIN_STATUS_LABELS.envahissant).toBe('Envahissant');
  });
});

describe('plantIucnStatus', () => {
  it('normalise codes et libelle pastille', () => {
    expect(normalizeIucnStatus('vu')).toBe('VU');
    expect(normalizeIucnStatus('LC — Préoccupation mineure')).toBe('LC');
    expect(normalizeIucnStatus('')).toBe('');
    expect(iucnStatusBadgeLabel('EN')).toBe('UICN EN');
    expect(IUCN_STATUS_LABELS.VU).toMatch(/Vulnérable/);
  });
});

describe('plantMatchesStructuredFilters — origin_status / iucn_status', () => {
  it('filtre par statut biogéographique', () => {
    const gambusie = { name: 'Gambusie', origin_status: 'envahissant' };
    const tilapia = { name: 'Tilapia', origin_status: 'introduit' };
    expect(plantMatchesStructuredFilters(gambusie, { originStatus: 'envahissant' })).toBe(true);
    expect(plantMatchesStructuredFilters(tilapia, { originStatus: 'envahissant' })).toBe(false);
    expect(plantMatchesStructuredFilters(gambusie, { originStatus: '' })).toBe(true);
  });

  it('filtre par statut UICN', () => {
    const gambusie = { name: 'Gambusie', iucn_status: 'LC' };
    const other = { name: 'Autre', iucn_status: 'VU' };
    expect(plantMatchesStructuredFilters(gambusie, { iucnStatus: 'LC' })).toBe(true);
    expect(plantMatchesStructuredFilters(other, { iucnStatus: 'LC' })).toBe(false);
  });
});
