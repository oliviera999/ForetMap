import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLChapterSpellsFieldset } from '../../src/gl/components/admin/GLChapterSpellsFieldset.jsx';

const SAMPLE = [
  {
    slug: 'eau',
    nom: 'Eau',
    spells: [
      { spell_code: 'AGUA', nom: 'Aguamenti', emoji: '💧' },
      { spell_code: 'GLACE', nom: 'Glaciation', emoji: '❄️' },
    ],
  },
  {
    slug: 'feu',
    nom: 'Feu',
    spells: [{ spell_code: 'IGNI', nom: 'Incendio' }],
  },
];

function renderFieldset(props = {}) {
  return render(
    <GLChapterSpellsFieldset
      spellsByCategory={SAMPLE}
      allSpellCodes={['AGUA', 'GLACE', 'IGNI']}
      selectedCodes={[]}
      onToggleSpell={vi.fn()}
      onSelectAll={vi.fn()}
      onDeselectAll={vi.fn()}
      onClearAll={vi.fn()}
      {...props}
    />,
  );
}

describe('GLChapterSpellsFieldset', () => {
  test('catalogue vide : message dédié', () => {
    renderFieldset({ spellsByCategory: [], allSpellCodes: [] });
    expect(screen.getByText(/Catalogue vide/)).toBeInTheDocument();
  });

  test('aucune sélection : indique « Aucun sort »', () => {
    renderFieldset();
    expect(screen.getByText('Aucun sort sélectionné.')).toBeInTheDocument();
  });

  test('affiche le nombre de sorts sélectionnés', () => {
    renderFieldset({ selectedCodes: ['AGUA', 'IGNI'] });
    expect(screen.getByText(/sort\(s\) sélectionné\(s\)/).textContent).toMatch(/2\s+sort/);
  });

  test('cocher une case appelle onToggleSpell(code, true)', () => {
    const onToggleSpell = vi.fn();
    renderFieldset({ onToggleSpell });
    fireEvent.click(screen.getByLabelText(/Aguamenti/));
    expect(onToggleSpell).toHaveBeenCalledWith('AGUA', true);
  });

  test('« Tout cocher » global appelle onSelectAll avec tous les codes', () => {
    const onSelectAll = vi.fn();
    renderFieldset({ onSelectAll });
    fireEvent.click(screen.getAllByText('Tout cocher')[0]);
    expect(onSelectAll).toHaveBeenCalledWith(['AGUA', 'GLACE', 'IGNI']);
  });

  test('« Tout décocher » global désactivé si rien de sélectionné', () => {
    renderFieldset();
    expect(screen.getByText('Tout décocher').closest('button')).toBeDisabled();
  });

  test('bouton de groupe bascule décocher si tout le groupe est coché', () => {
    const onDeselectAll = vi.fn();
    renderFieldset({ selectedCodes: ['AGUA', 'GLACE'], onDeselectAll });
    // Le groupe Eau (AGUA, GLACE) est entièrement coché → bouton « Tout décocher (2) »
    const groupBtn = screen.getByText(/\(\s*2\s*\)/).closest('button');
    fireEvent.click(groupBtn);
    expect(onDeselectAll).toHaveBeenCalledWith(['AGUA', 'GLACE']);
  });
});
