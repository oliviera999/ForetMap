import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GLFeuilletLiasseReorder } from '../../src/gl/components/admin/GLFeuilletLiasseReorder.jsx';

describe('GLFeuilletLiasseReorder', () => {
  const items = [
    { feuillet_code: 'a', titre: 'Alpha', ordre_liasse: 1 },
    { feuillet_code: 'b', titre: 'Beta', ordre_liasse: 2 },
  ];

  test('rend les items triés par ordre_liasse', () => {
    // On fournit volontairement les items dans le désordre.
    const shuffled = [items[1], items[0]];
    render(<GLFeuilletLiasseReorder items={shuffled} onPersist={vi.fn()} />);
    const rendered = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rendered[0]).toContain('Alpha');
    expect(rendered[1]).toContain('Beta');
  });

  test('Descendre le 1er puis Enregistrer appelle onPersist avec l’ordre réorganisé', async () => {
    const onPersist = vi.fn().mockResolvedValue();
    render(<GLFeuilletLiasseReorder items={items} onPersist={onPersist} />);

    fireEvent.click(screen.getByLabelText('Descendre Alpha'));
    fireEvent.click(screen.getByText("Enregistrer l'ordre"));

    expect(onPersist).toHaveBeenCalledWith(['b', 'a']);
  });

  test('avec un seul item, affiche le message d’au moins deux feuillets', () => {
    render(<GLFeuilletLiasseReorder items={[items[0]]} onPersist={vi.fn()} />);
    expect(screen.getByText(/Au moins deux feuillets requis/)).toBeInTheDocument();
  });
});
