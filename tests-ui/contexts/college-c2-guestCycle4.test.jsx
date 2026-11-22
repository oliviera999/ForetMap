import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BiodivPedagoProvider, useBiodivPedago } from '../../src/contexts/BiodivPedagoContext.jsx';
import { INTERACTION_TYPES } from '../../src/shared/foodWebTypes.js';
import { CYCLE4_ONLY_INTERACTION_TYPE_ENUM } from '../../src/shared/enums/biodivEnums.js';
import { GLOSSARY_NIVEAU_ENUM } from '../../src/shared/enums/pedagoEnums.js';

/**
 * Assouplissement du profil collège (22/11/2026, flux C2, lot 5) : la Visite sans compte est
 * rendue au palier **cycle 4** (décision 6), avec l'affichage collège simplifié d'avant.
 */

function Probe() {
  const { level, learner, palierRule, foodWebTypes, canShow } = useBiodivPedago();
  return (
    <dl>
      <dd data-testid="level">{level}</dd>
      <dd data-testid="niveau">{learner?.niveau || ''}</dd>
      <dd data-testid="palier">{learner?.maxPalier ?? 'aucun'}</dd>
      <dd data-testid="glossaire">{palierRule('glossary_depth_max') ?? 'aucun'}</dd>
      <dd data-testid="quiz">{palierRule('quiz_entry_palier_max') ?? 'aucun'}</dd>
      <dd data-testid="types">{foodWebTypes(INTERACTION_TYPES).join(',')}</dd>
      <dd data-testid="usage-label">{canShow('usage_label') ? 'oui' : 'non'}</dd>
      <dd data-testid="taxonomie">{canShow('taxonomy_line') ? 'oui' : 'non'}</dd>
    </dl>
  );
}

const text = (id) => screen.getByTestId(id).textContent;
const [GLOSSARY_BASE, GLOSSARY_APPROFONDISSEMENT] = GLOSSARY_NIVEAU_ENUM.values;

beforeEach(() => {
  sessionStorage.clear();
});

describe('Visite sans compte — palier cycle 4', () => {
  test('niveau cycle 4, palier 2, glossaire jusqu’à l’approfondissement', () => {
    render(
      <BiodivPedagoProvider isGuestVisit>
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('college');
    expect(text('niveau')).toBe('cycle4');
    expect(text('palier')).toBe('2');
    expect(text('glossaire')).toBe(GLOSSARY_APPROFONDISSEMENT);
    expect(text('quiz')).toBe('2');
    const types = text('types').split(',');
    for (const t of CYCLE4_ONLY_INTERACTION_TYPE_ENUM.values) expect(types).toContain(t);
    // Affichage collège simplifié inchangé.
    expect(text('usage-label')).toBe('oui');
    expect(text('taxonomie')).toBe('non');
  });

  test('élève sans classe : toujours cycle 3', () => {
    render(
      <BiodivPedagoProvider>
        <Probe />
      </BiodivPedagoProvider>,
    );
    expect(text('level')).toBe('college');
    expect(text('glossaire')).toBe(GLOSSARY_BASE);
    expect(text('quiz')).toBe('1');
    const types = text('types').split(',');
    for (const t of CYCLE4_ONLY_INTERACTION_TYPE_ENUM.values) expect(types).not.toContain(t);
  });
});
