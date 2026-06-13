import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLGlossaryTermList } from '../../src/gl/components/admin/GLGlossaryTermList.jsx';

const ITEMS = [
  { glossary_code: 'GL0001', terme: 'Symbiose', statut: 'actif' },
  { glossary_code: 'GL0002', terme: 'Canopée', statut: 'inactif' },
];

function renderList(props = {}) {
  return render(
    <GLGlossaryTermList
      filterQ=""
      onFilterQChange={vi.fn()}
      filterCategorie=""
      onFilterCategorieChange={vi.fn()}
      categories={[{ id: 'ecologie', label: 'Écologie' }]}
      items={ITEMS}
      selectedCode={null}
      onSelect={vi.fn()}
      onNew={vi.fn()}
      loading={false}
      {...props}
    />,
  );
}

describe('GLGlossaryTermList', () => {
  test('affiche les termes avec marque (inactif)', () => {
    renderList();
    expect(screen.getByText('Symbiose')).toBeInTheDocument();
    expect(screen.getByText('Canopée')).toBeInTheDocument();
    expect(screen.getByText('(inactif)')).toBeInTheDocument();
  });

  test('remonte la recherche via onFilterQChange', () => {
    const onFilterQChange = vi.fn();
    renderList({ onFilterQChange });
    fireEvent.change(screen.getByPlaceholderText('Terme ou code…'), {
      target: { value: 'cano' },
    });
    expect(onFilterQChange).toHaveBeenCalledWith('cano');
  });

  test('appelle onSelect avec le code au clic sur un terme', () => {
    const onSelect = vi.fn();
    renderList({ onSelect });
    fireEvent.click(screen.getByText('Symbiose'));
    expect(onSelect).toHaveBeenCalledWith('GL0001');
  });

  test('marque le terme sélectionné comme actif', () => {
    renderList({ selectedCode: 'GL0002' });
    expect(screen.getByText('Canopée').closest('button')).toHaveClass('is-active');
    expect(screen.getByText('Symbiose').closest('button')).not.toHaveClass('is-active');
  });

  test('déclenche onNew et désactive le bouton quand loading', () => {
    const onNew = vi.fn();
    const { rerender } = renderList({ onNew });
    const btn = screen.getByRole('button', { name: '+ Nouveau terme' });
    fireEvent.click(btn);
    expect(onNew).toHaveBeenCalledTimes(1);
    rerender(
      <GLGlossaryTermList
        filterQ=""
        onFilterQChange={vi.fn()}
        filterCategorie=""
        onFilterCategorieChange={vi.fn()}
        categories={[]}
        items={ITEMS}
        selectedCode={null}
        onSelect={vi.fn()}
        onNew={onNew}
        loading
      />,
    );
    expect(screen.getByRole('button', { name: '+ Nouveau terme' })).toBeDisabled();
  });
});
