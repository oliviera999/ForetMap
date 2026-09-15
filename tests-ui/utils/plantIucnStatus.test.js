import { describe, expect, it } from 'vitest';
import { plantMatchesStructuredFilters } from '../../src/utils/plantFilters.js';
import {
  IUCN_STATUS_LABELS,
  normalizeIucnStatus,
  iucnStatusBadgeLabel,
} from '../../src/utils/plantIucnStatus.js';

describe('plantIucnStatus', () => {
  it('normalise codes et préfixes libellés', () => {
    expect(normalizeIucnStatus('vu')).toBe('VU');
    expect(normalizeIucnStatus('VU — Vulnérable')).toBe('VU');
    expect(normalizeIucnStatus('')).toBe('');
    expect(iucnStatusBadgeLabel('LC')).toBe('UICN LC');
    expect(IUCN_STATUS_LABELS.CR).toMatch(/critique/i);
  });
});

describe('plantMatchesStructuredFilters — iucn_status', () => {
  it('filtre par statut UICN', () => {
    const plant = { name: 'Gambusie', iucn_status: 'LC' };
    expect(plantMatchesStructuredFilters(plant, { iucnStatus: 'LC' })).toBe(true);
    expect(plantMatchesStructuredFilters(plant, { iucnStatus: 'VU' })).toBe(false);
  });
});
