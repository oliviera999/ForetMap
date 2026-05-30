import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLMultiCheckDropdown } from '../../src/gl/components/GLMultiCheckDropdown.jsx';

const OPTIONS = [
  { value: 'flore', label: 'Flore' },
  { value: 'faune', label: 'Faune' },
];

describe('GLMultiCheckDropdown', () => {
  test('affiche le résumé et permet de cocher plusieurs options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <GLMultiCheckDropdown
        label="Catégories QCM"
        options={OPTIONS}
        selectedValues={[]}
        onChange={onChange}
        emptyLabel="Toutes les catégories"
      />
    );

    expect(screen.getByText('Toutes les catégories')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Toutes les catégories/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Flore' }));

    expect(onChange).toHaveBeenCalledWith(['flore']);
  });

  test('ferme le menu avec Échap', async () => {
    const user = userEvent.setup();

    render(
      <GLMultiCheckDropdown
        label="Niveaux"
        options={OPTIONS}
        selectedValues={['flore']}
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
