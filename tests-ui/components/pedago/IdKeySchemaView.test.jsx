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
    // Repère de forme, pas seulement de teinte : un double anneau.
    expect(current.querySelector('.id-key-schema__node-ring')).toBeTruthy();
  });

  test('K1 : toucher l’étiquette de B choisit B (zones de toucher disjointes)', () => {
    const onChooseLead = vi.fn();
    const { container } = render(
      <IdKeySchemaView keyBundle={KEY} currentCoupletId={10} onChooseLead={onChooseLead} />,
    );
    const taps = [...container.querySelectorAll('.id-key-schema__edge-tap')];
    const [a, b] = taps.map((t) => ({
      left: Number(t.getAttribute('x')),
      right: Number(t.getAttribute('x')) + Number(t.getAttribute('width')),
    }));
    expect(a.right <= b.left || b.right <= a.left).toBe(true);
    fireEvent.click(taps[1]);
    expect(onChooseLead.mock.calls[0][0].id).toBe(102);
  });

  test('K4 : branches actives au clavier, sans role="img" masquant le contenu', () => {
    const onChooseLead = vi.fn();
    const { container, getByRole } = render(
      <IdKeySchemaView keyBundle={KEY} currentCoupletId={10} onChooseLead={onChooseLead} />,
    );
    expect(container.querySelector('[role="img"]')).toBeNull();
    const choice = getByRole('button', { name: 'Choisir : Feuilles alternes' });
    expect(choice.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(choice, { key: 'Enter' });
    expect(onChooseLead.mock.calls[0][0].id).toBe(102);
  });

  test('K3 : énoncé complet en infobulle et dans la liste du couplet courant', () => {
    const long = 'Feuilles composées pennées à folioles finement dentées sur tout le bord';
    const key = structuredClone(KEY);
    key.couplets[0].leads[1].statement = long;
    const { container, getByRole } = render(
      <IdKeySchemaView keyBundle={key} currentCoupletId={10} />,
    );
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles).toContain(long);
    expect(getByRole('button', { name: long })).toBeTruthy();
    const tspans = container.querySelectorAll('.id-key-schema__edge-label-text tspan');
    expect(tspans.length).toBeGreaterThan(2);
  });

  test('K5 : les images Wikimedia passent par le relais en mode local', () => {
    const key = structuredClone(KEY);
    key.couplets[0].leads[0].image_url = 'https://upload.wikimedia.org/a.jpg';
    const { container } = render(<IdKeySchemaView keyBundle={key} currentCoupletId={10} />);
    const href = container.querySelector('.id-key-schema__edge-img').getAttribute('href');
    expect(href).toContain('/api/media/remote?url=');
  });

  test('K6 : le couplet courant est ramené dans la zone défilante', () => {
    const { container, rerender } = render(
      <IdKeySchemaView keyBundle={KEY} currentCoupletId={10} />,
    );
    const scroll = container.querySelector('.id-key-schema__scroll');
    rerender(<IdKeySchemaView keyBundle={KEY} currentCoupletId={20} history={[20]} />);
    expect(scroll.scrollLeft).toBeGreaterThan(0);
  });

  test('K6 : « Ajuster à l’écran » met le schéma à la largeur du conteneur', () => {
    const { container, getByRole } = render(
      <IdKeySchemaView keyBundle={KEY} currentCoupletId={10} />,
    );
    fireEvent.click(getByRole('button', { name: 'Ajuster à l’écran' }));
    const svg = container.querySelector('.id-key-schema__svg');
    expect(svg.classList.contains('id-key-schema__svg--fit')).toBe(true);
    expect(svg.getAttribute('width')).toBeNull();
  });

  test('K7 : espèces masquées et non ouvrables tant qu’elles ne sont pas atteintes', () => {
    const onOpenPlant = vi.fn();
    const { container, queryByRole } = render(
      <IdKeySchemaView
        keyBundle={KEY}
        currentCoupletId={10}
        onOpenPlant={onOpenPlant}
        revealPlants={false}
      />,
    );
    expect(container.querySelectorAll('.id-key-schema__node--hidden').length).toBe(2);
    expect(container.textContent).not.toContain('Chêne');
    expect(queryByRole('button', { name: /Ouvrir la fiche/ })).toBeNull();
  });

  test('K7 : révélées, les espèces ouvrent leur fiche', () => {
    const onOpenPlant = vi.fn();
    const { getByRole } = render(
      <IdKeySchemaView keyBundle={KEY} currentCoupletId={10} onOpenPlant={onOpenPlant} />,
    );
    fireEvent.click(getByRole('button', { name: 'Ouvrir la fiche Chêne' }));
    expect(onOpenPlant).toHaveBeenCalledWith(5);
  });

  test('K12 : proposition incomplète inerte, défauts signalés en mode auteur', () => {
    const key = structuredClone(KEY);
    key.couplets[0].leads.push({ id: 103, statement: 'Sans suite', next_couplet_id: null });
    key.couplets.push({ id: 30, number: 3, leads: [] });
    const onChooseLead = vi.fn();
    const { container, getByRole } = render(
      <IdKeySchemaView
        keyBundle={key}
        currentCoupletId={10}
        onChooseLead={onChooseLead}
        authorMode
      />,
    );
    expect(container.querySelector('.id-key-schema__node--missing')).toBeTruthy();
    expect(getByRole('button', { name: /Sans suite/ }).disabled).toBe(true);
    expect(container.querySelector('.id-key-schema__author-note').textContent).toContain(
      'non reliés à la clé (les élèves ne les verront pas) : 3',
    );
  });
});
