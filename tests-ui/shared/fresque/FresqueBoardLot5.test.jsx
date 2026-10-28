import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

import { FresqueBoard } from '../../../src/shared/fresque/FresqueBoard.jsx';
import {
  addLink,
  buildDeckModel,
  createInitialState,
  expectedLinks,
  lotCards,
  canOpenNextLot,
  openNextLot,
  placeCard,
  setStep,
  setTutorialDone,
} from '../../../src/shared/fresque/fresqueCore.js';

/**
 * Lot 5 : indices en post-it (échelle, Expert → proposition de niveau), post-it élève
 * (créer, modifier, supprimer), étape Comprendre (comparer, repères, révélations, disposition
 * officielle en aperçu, créativité), dialogue de fin et badge annoncé, export avec crédit.
 */

const DIR = path.join(process.cwd(), 'public', 'fresques', 'climat-junior-fr-v7-5');
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
const hints = read('hints.json');
const model = buildDeckModel(read('deck.json'), read('correction.json'), hints);

function lot1State(level = 'explorateur') {
  let s = setStep(model, setTutorialDone(createInitialState(model, { level }), true), 'lot1');
  for (const id of lotCards(model, 1)) s = placeCard(model, s, id, { x: 10, y: 10 });
  return s;
}

function allPlacedState(level = 'explorateur') {
  let s = setTutorialDone(createInitialState(model, { level }), true);
  for (const lot of model.lots) {
    for (const id of lot.cards) s = placeCard(model, s, id, { x: 5, y: 5 });
    if (canOpenNextLot(model, s)) s = openNextLot(model, s);
  }
  s = addLink(model, s, 'c04', 'c07').state;
  s = addLink(model, s, 'c18', 'c22').state;
  s = setStep(model, s, 'comprendre');
  return s;
}

function makeApi(overrides = {}) {
  let revision = 0;
  const api = vi.fn(async (p, method = 'GET', body) => {
    if (method === 'PUT') {
      revision += 1;
      const completed =
        Boolean(body.state.correction?.viewedAt) && Object.keys(body.state.cards).length === 21;
      return {
        revision,
        completed,
        rewards:
          completed && overrides.rewardOnce && revision === overrides.rewardOnce
            ? overrides.rewards
            : [],
      };
    }
    return {};
  });
  return api;
}

function renderBoard(state, props = {}) {
  const api = props.api || makeApi();
  render(
    <FresqueBoard
      model={model}
      publicBase="/fresques/climat-junior-fr-v7-5/"
      board={{ id: 'b5', deckId: model.id, revision: 0, readOnly: false, state }}
      api={api}
      {...props}
    />,
  );
  return api;
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('indices', () => {
  test('« Un indice » colle un post-it Indice près de la carte cible et monte d’un cran', async () => {
    renderBoard(lot1State());
    fireEvent.click(screen.getByTestId('fm-fresque-hint'));
    const note = await screen.findByTestId('fm-fresque-note-n1');
    expect(note).toHaveTextContent('Indice');
    expect(note).toHaveTextContent(hints.readingHints.c04);
    expect(note.getAttribute('data-color')).toBe('hint');
    expect(screen.getByTestId('fm-fresque-toast')).toHaveTextContent(hints.readingHints.c04);
    fireEvent.click(screen.getByTestId('fm-fresque-hint'));
    const second = await screen.findByTestId('fm-fresque-note-n2');
    expect(second).toHaveTextContent(/3 flèches arrivent sur la carte 7/);
    // Le post-it se lit dans une bulle ; « Fermer le post-it » le retire de la table.
    fireEvent.keyDown(note, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'Indice' });
    expect(within(dialog).getByTestId('fm-fresque-hint-text')).toHaveTextContent(
      hints.readingHints.c04,
    );
    fireEvent.click(within(dialog).getByTestId('fm-fresque-hint-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('fm-fresque-note-n1')).toBeNull());
  });

  test('cran 4 : la flèche révélée se trace d’un toucher et est marquée révélée', async () => {
    renderBoard(lot1State());
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByTestId('fm-fresque-hint'));
    const note = await screen.findByTestId('fm-fresque-note-n4');
    expect(note).toHaveTextContent(/carte 4 vers la carte 7/);
    fireEvent.keyDown(note, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'Indice' });
    fireEvent.click(within(dialog).getByTestId('fm-fresque-hint-accept'));
    const arrow = await screen.findByTestId('fm-fresque-arrow-l1');
    expect(arrow.className.baseVal || arrow.getAttribute('class')).toContain(
      'fm-fresque-arrow--revealed',
    );
    expect(screen.queryByTestId('fm-fresque-note-n4')).toBeNull();
  });

  test('Expert : pas d’indice, proposition de passer en Explorateur sans rien perdre', async () => {
    renderBoard(lot1State('expert'));
    fireEvent.click(screen.getByTestId('fm-fresque-hint'));
    const dialog = await screen.findByRole('dialog', { name: /Expert/ });
    expect(screen.queryByTestId('fm-fresque-note-n1')).toBeNull();
    fireEvent.click(within(dialog).getByTestId('fm-fresque-expert-switch'));
    expect(screen.getByTestId('fm-fresque-board')).toHaveAttribute('data-level', 'explorateur');
    expect(screen.getByTestId('fm-fresque-card-c04')).toBeInTheDocument();
  });

  test('plus rien à trouver : message à zéro, aucun post-it', async () => {
    let s = lot1State();
    for (const l of expectedLinks(model, s)) s = addLink(model, s, l.from, l.to).state;
    renderBoard(s);
    fireEvent.click(screen.getByTestId('fm-fresque-hint'));
    expect(screen.getByTestId('fm-fresque-toast')).toHaveTextContent(/0 flèche/);
    expect(screen.queryByTestId('fm-fresque-note-n1')).toBeNull();
  });
});

describe('post-it de l’élève', () => {
  test('créer, modifier, supprimer ; texte borné à 280 caractères', async () => {
    renderBoard(lot1State());
    fireEvent.click(screen.getByTestId('fm-fresque-add-note'));
    const dialog = await screen.findByRole('dialog', { name: /Nouveau post-it/ });
    expect(within(dialog).getByTestId('fm-fresque-note-save')).toBeDisabled();
    fireEvent.change(within(dialog).getByTestId('fm-fresque-note-text'), {
      target: { value: 'x'.repeat(300) },
    });
    expect(within(dialog).getByTestId('fm-fresque-note-text').value).toHaveLength(280);
    fireEvent.click(within(dialog).getByTestId('fm-fresque-note-color-blue'));
    fireEvent.click(within(dialog).getByTestId('fm-fresque-note-save'));
    const note = await screen.findByTestId('fm-fresque-note-n1');
    expect(note.getAttribute('data-color')).toBe('blue');
    // Jamais de HTML : le texte est rendu tel quel.
    fireEvent.keyDown(note, { key: 'Enter' });
    const edit = await screen.findByRole('dialog', { name: /Modifier/ });
    fireEvent.change(within(edit).getByTestId('fm-fresque-note-text'), {
      target: { value: '<b>idée</b>' },
    });
    fireEvent.click(within(edit).getByTestId('fm-fresque-note-save'));
    await waitFor(() =>
      expect(screen.getByTestId('fm-fresque-note-n1')).toHaveTextContent('<b>idée</b>'),
    );
    expect(screen.getByTestId('fm-fresque-note-n1').querySelector('b')).toBeNull();
    fireEvent.keyDown(screen.getByTestId('fm-fresque-note-n1'), { key: 'Enter' });
    const edit2 = await screen.findByRole('dialog', { name: /Modifier/ });
    fireEvent.click(within(edit2).getByTestId('fm-fresque-note-delete'));
    await waitFor(() => expect(screen.queryByTestId('fm-fresque-note-n1')).toBeNull());
  });
});

describe('étape Comprendre', () => {
  test('comparer : repères sur les flèches, résumé, révélations, disposition officielle en aperçu', async () => {
    renderBoard(allPlacedState());
    expect(screen.getByTestId('fm-fresque-correction')).toBeInTheDocument();
    expect(screen.queryByTestId('fm-fresque-summary')).toBeNull();
    fireEvent.click(screen.getByTestId('fm-fresque-compare'));
    const summary = await screen.findByTestId('fm-fresque-summary');
    expect(summary).toHaveTextContent('Dans la correction : 1 / 30');
    expect(summary).toHaveTextContent('Piège classique : 1');
    expect(summary).toHaveTextContent('Pas encore trouvées : 29');
    expect(summary.textContent).not.toMatch(/\b(faux|erreur)\b/i);
    const trap = screen.getByTestId('fm-fresque-arrow-l2');
    expect(trap.getAttribute('class')).toContain('fm-fresque-arrow--trap');
    expect(trap.querySelector('.fm-fresque-arrow__mark text')).toHaveTextContent('!');
    // Le retour du piège se lit en touchant la flèche.
    fireEvent.click(trap);
    expect(screen.getByTestId('fm-fresque-link-popover')).toHaveTextContent(/banquise flotte/);

    expect(screen.queryAllByTestId('fm-fresque-missing')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('fm-fresque-reveal-next'));
    await waitFor(() => expect(screen.getAllByTestId('fm-fresque-missing')).toHaveLength(1));
    fireEvent.click(screen.getByTestId('fm-fresque-reveal-all'));
    await waitFor(() => expect(screen.getAllByTestId('fm-fresque-missing')).toHaveLength(29));
    expect(screen.getByTestId('fm-fresque-reveal-next')).toBeDisabled();

    // Disposition officielle : aperçu animé, la position de l'élève n'est pas modifiée.
    const before = screen.getByTestId('fm-fresque-card-c39').style.left;
    fireEvent.click(screen.getByTestId('fm-fresque-preview-toggle'));
    expect(screen.getByTestId('fm-fresque-table').className).toContain('fm-fresque-table--preview');
    expect(screen.getByTestId('fm-fresque-card-c39').style.left).toBe('91.8%');
    expect(screen.queryByTestId('fm-fresque-link-c39')).toBeNull();
    fireEvent.click(screen.getByTestId('fm-fresque-preview-toggle'));
    expect(screen.getByTestId('fm-fresque-card-c39').style.left).toBe(before);
    expect(screen.getByTestId('fm-fresque-link-c39')).toBeInTheDocument();
  });

  test('fin : dialogue, badge annoncé, créativité et crédit conservés', async () => {
    const rewards = [
      {
        key: 'fresque_climat_junior',
        emoji: '🌍',
        title: 'Fresque du Climat',
        description: 'Tu as terminé.',
      },
    ];
    const api = makeApi({ rewardOnce: 1, rewards });
    const onRewards = vi.fn();
    renderBoard(allPlacedState('eclaireur'), { api, onRewards });
    fireEvent.click(screen.getByTestId('fm-fresque-compare'));
    const done = await screen.findByTestId('fm-fresque-done-title');
    expect(done).toHaveTextContent(hints.completion.title);
    expect(screen.getByTestId('fm-fresque-done-rewards')).toHaveTextContent('Fresque du Climat');
    await waitFor(() => expect(onRewards).toHaveBeenCalledWith(rewards));
    expect(screen.getByTestId('fm-fresque-completion')).toHaveTextContent(hints.completion.text);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    });
    fireEvent.change(screen.getByTestId('fm-fresque-title-input'), {
      target: { value: 'Notre planète' },
    });
    fireEvent.click(screen.getByTestId('fm-fresque-arrow-color-sky'));
    fireEvent.change(screen.getByTestId('fm-fresque-favorite'), { target: { value: 'c21' } });
    await waitFor(() => {
      const last = api.mock.calls.filter((c) => c[1] === 'PUT').at(-1);
      expect(last[2].state.creative).toEqual({
        title: 'Notre planète',
        arrowColor: 'sky',
        favoriteCardId: 'c21',
      });
    });
    expect(screen.getByTestId('fm-fresque-credit')).toHaveTextContent('CC BY-NC-ND');
    expect(screen.getByTestId('fm-fresque-export')).toBeInTheDocument();
    expect(screen.queryByTestId('fm-fresque-export-journal')).toBeNull();
  });

  test('« Ajouter à mon carnet » n’apparaît que si le produit sait importer', () => {
    let s = allPlacedState();
    s = { ...s, correction: { ...s.correction, viewedAt: '2026-10-25T10:00:00.000Z' } };
    renderBoard(s, { onExportToJournal: vi.fn() });
    expect(screen.getByTestId('fm-fresque-export-journal')).toBeInTheDocument();
  });
});
