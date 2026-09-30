import { describe, expect, test } from 'vitest';
import { neutralizeCsvFormula } from '../src/shared/utils/csvCell.js';
import { buildCredentialsCsv } from '../src/gl/utils/glPlayerCredentials.js';

// Audit sécurité du 30/09/2026, AP3 : injection de formules dans les CSV (miroir front).

describe('AP3 — neutralisation des formules CSV côté front', () => {
  test('préfixe une apostrophe aux déclencheurs de formule', () => {
    for (const raw of ['=1+1', '+33', '-x', '@SUM(A1)', '\tx', '\rx']) {
      expect(neutralizeCsvFormula(raw)).toBe(`'${raw}`);
    }
    expect(neutralizeCsvFormula('Aurore')).toBe('Aurore');
    expect(neutralizeCsvFormula(-4)).toBe('-4');
    expect(neutralizeCsvFormula(undefined)).toBe('');
  });

  test('le CSV des identifiants G&L neutralise un nom piégé', () => {
    const csv = buildCredentialsCsv([
      { firstName: '=HYPERLINK("https://x")', lastName: 'Dupont', pseudo: 'p', password: 'abc' },
    ]);
    const line = csv.split('\r\n')[1];
    expect(line.startsWith(`"'=HYPERLINK(""https://x"")"`)).toBe(true);
    expect(line).toContain('"Dupont"');
  });
});
