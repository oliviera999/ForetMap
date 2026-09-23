import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { IdKeySchemaView } from '../../../src/components/pedago/IdKeySchemaView.jsx';
import { coupletNodeId } from '../../../src/utils/idKeySchemaLayout.js';

const KEY = {
  title: 'Arbres',
  couplets: [
    {
      id: 10,
      number: 1,
      leads: [
        {
          id: 101,
          statement: 'Feuilles opposées',
          image_url: 'https://example.com/a.png',
          next_couplet_id: 20,
          plant_id: null,
        },
        {
          id: 102,
          statement: 'Feuilles alternes',
          image_url: null,
          next_couplet_id: null,
          plant_id: 5,
          plant_name: 'Chêne',
          plant_emoji: '🌳',
        },
      ],
    },
    {
      id: 20,
      number: 2,
      leads: [
        {
          id: 201,
          statement: 'Écorce lisse',
          image_url: null,
          next_couplet_id: null,
          plant_id: 7,
          plant_name: 'Hêtre',
          plant_emoji: '🌲',
        },
      ],
    },
  ],
};

describe('IdKeySchemaView', () => {
  test('rend les nœuds couplet et espèce', () => {
    const { container } = render(
      <IdKeySchemaView keyBundle={KEY} currentCoupletId={10} history={[]} />,
    );
    expect(container.querySelector('.id-key-schema__svg')).toBeTruthy();
    expect(container.querySelectorAll('.id-key-schema__node--couplet').length).toBe(2);
    expect(container.querySelectorAll('.id-key-schema__node--plant').length).toBe(2);
    expect(container.querySelectorAll('.id-key-schema__edge').length).toBe(3);
  });

  test('clic sur une branche active appelle onChooseLead', () => {
    const onChooseLead = vi.fn();
    const { container } = render(
      <IdKeySchemaView
        keyBundle={KEY}
        currentCoupletId={10}
        history={[]}
        onChooseLead={onChooseLead}
      />,
    );
    const taps = container.querySelectorAll('.id-key-schema__edge-tap');
    expect(taps.length).toBe(2);
    fireEvent.click(taps[0]);
    expect(onChooseLead).toHaveBeenCalledTimes(1);
    expect(onChooseLead.mock.calls[0][0].id).toBe(101);
  });

  test('branches hors couplet courant ne sont pas cliquables', () => {
    const onChooseLead = vi.fn();
    const { container } = render(
      <IdKeySchemaView
        keyBundle={KEY}
        currentCoupletId={10}
        history={[]}
        onChooseLead={onChooseLead}
      />,
    );
    // Depuis couplet 1, seule 2 arêtes actives — pas celle du couplet 2
    expect(container.querySelectorAll('.id-key-schema__edge-tap').length).toBe(2);
    expect(container.querySelectorAll('.id-key-schema__edge--clickable').length).toBe(2);
  });

  test('met en évidence le couplet courant', () => {
    const { container } = render(
      <IdKeySchemaView keyBundle={KEY} currentCoupletId={20} history={[20]} />,
    );
    const current = container.querySelector('.id-key-schema__node--current');
    expect(current).toBeTruthy();
    // Le nœud courant porte le numéro 2
    expect(current.textContent).toContain('2');
    expect(coupletNodeId(20)).toBe('couplet:20');
  });
});
