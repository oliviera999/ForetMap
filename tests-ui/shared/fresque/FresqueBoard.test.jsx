import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

import { FresqueBoard } from '../../../src/shared/fresque/FresqueBoard.jsx';
import {
  buildDeckModel,
  createInitialState,
  placeCard,
  setStep,
  setTutorialDone,
} from '../../../src/shared/fresque/fresqueCore.js';
import { mirrorKey } from '../../../src/shared/fresque/useFresqueBoardState.js';

/**
 * Plateau d'une fresque (lot 4) : montage, pose depuis la main (clavier), retournement, relier
 * au clavier, retrait, blocage du lot suivant, niveaux (puces et bandes en Éclaireur seulement),
 * barre de crédit toujours présente, aucun élément superposé à l'image d'une carte, miroir local
 * et restauration, dialogue de conflit.
 */

const DIR = path.join(process.cwd(), 'public', 'fresques', 'climat-junior-fr-v7-5');
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
const deck = read('deck.json');
const correction = read('correction.json');
const hints = read('hints.json');
const model = buildDeckModel(deck, correction, hints);
const PUBLIC_BASE = '/fresques/climat-junior-fr-v7-5/';

function makeApi({ onPut = null } = {}) {
  let revision = 0;
  const calls = [];
  const api = vi.fn(async (p, method = 'GET', body) => {
    calls.push({ path: p, method, body });
    if (method === 'PUT') {
      if (onPut) return onPut(body, revision);
      revision += 1;
      return { revision, completed: false, rewards: [], clientSeq: body.clientSeq };
    }
    if (p.startsWith('/api/fresques/boards/')) {
      return { board: { id: 'b1', revision: 9, readOnly: false, state: lotState() } };
    }
    return {};
  });
  api.calls = calls;
  return api;
}

function boardFixture(state, extra = {}) {
  return { id: 'b1', deckId: model.id, revision: 0, readOnly: false, state, ...extra };
}

function lotState(level = 'explorateur') {
  let s = createInitialState(model, { level, now: '2026-10-25T10:00:00.000Z' });
  s = setTutorialDone(s, true);
  s = setStep(model, s, 'lot1');
  return s;
}

function renderBoard(state, { api = makeApi(), ...props } = {}) {
  const utils = render(
    <FresqueBoard
      model={model}
      publicBase={PUBLIC_BASE}
      board={boardFixture(state)}
      api={api}
      {...props}
    />,
  );
  return { ...utils, api };
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  vi.useRealTimers();
});

describe('FresqueBoard', () => {
  test('monte à l’étape Découvrir : carte titre, niveaux, tutoriel, crédit', () => {
    renderBoard(createInitialState(model));
    expect(screen.getByTestId('fm-fresque-discover')).toBeInTheDocument();
    expect(screen.getByTestId('fm-fresque-title-card')).toBeInTheDocument();
    expect(screen.getByTestId('fm-fresque-tutorial')).toHaveTextContent(hints.tutorial[0].text);
    expect(screen.getByTestId('fm-fresque-pick-explorateur')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('fm-fresque-credit')).toHaveTextContent('CC BY-NC-ND');
    expect(screen.getByTestId('fm-fresque-credit')).toHaveTextContent('Cédric Ringenbach');
    // Le lot 2 et Comprendre sont verrouillés tant que rien n'est posé.
    expect(screen.getByTestId('fm-fresque-step-lot2')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('fm-fresque-step-comprendre')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('Commencer : passe au lot 1, la main montre les 5 cartes, le crédit reste visible', async () => {
    renderBoard(createInitialState(model));
    fireEvent.click(screen.getByTestId('fm-fresque-start'));
    expect(screen.getByTestId('fm-fresque-board')).toHaveAttribute('data-step', 'lot1');
    const hand = screen.getByTestId('fm-fresque-hand');
    expect(within(hand).getAllByRole('button', { name: /glisser vers la table/ })).toHaveLength(5);
    expect(screen.getByTestId('fm-fresque-credit')).toHaveTextContent('fresqueduclimat.org');
    expect(screen.getByTestId('fm-fresque-table')).toBeInTheDocument();
  });

  test('pose au clavier, retournement, relier au clavier, retrait, aucune superposition sur la carte', async () => {
    const { api } = renderBoard(lotState('eclaireur'));
    // Pose de c04 puis c07 par Entrée sur la main.
    fireEvent.keyDown(screen.getByTestId('fm-fresque-hand-c04'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByTestId('fm-fresque-hand-c07'), { key: 'Enter' });
    const c04 = screen.getByTestId('fm-fresque-card-c04');
    const c07 = screen.getByTestId('fm-fresque-card-c07');
    expect(c04).toBeInTheDocument();
    expect(screen.queryByTestId('fm-fresque-hand-c04')).toBeNull();

    // Éclaireur : puces « n flèches partent d'ici » à côté des cartes, bandes de fond.
    expect(screen.getByTestId('fm-fresque-chip-c04')).toHaveTextContent('0/1');
    expect(screen.getByTestId('fm-fresque-bands')).toBeInTheDocument();

    // Rien ne se superpose à l'image : chaque face ne contient qu'une image, l'intérieur de la
    // carte ne contient que les deux faces ; commandes et puces sont des frères, hors de l'image.
    for (const card of [c04, c07]) {
      const inner = card.querySelector('.fm-fresque-card__inner');
      expect(inner.children).toHaveLength(2);
      for (const face of inner.children) {
        expect(face.children).toHaveLength(1);
        expect(face.children[0].tagName).toBe('IMG');
      }
      expect(card.querySelector('.fm-fresque-card__side').parentElement).toBe(card);
    }

    // Retourner : Entrée sur la carte.
    expect(c04).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(c04, { key: 'Enter' });
    expect(screen.getByTestId('fm-fresque-card-c04')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('fm-fresque-card-c04').className).toContain(
      'fm-fresque-card--flipped',
    );

    // Relier au clavier : bouton « Relier à… » → liste des cartes posées → c07.
    fireEvent.keyDown(screen.getByTestId('fm-fresque-link-c04'), { key: 'Enter' });
    fireEvent.click(await screen.findByTestId('fm-fresque-pick-target-c07'));
    const arrow = await screen.findByTestId('fm-fresque-arrow-l1');
    expect(arrow).toHaveAttribute('aria-label', expect.stringContaining('c04 vers la carte c07'));
    // Éclaireur : retour immédiat « trouvée », sans « faux » ni « erreur ».
    const toast = screen.getByTestId('fm-fresque-toast');
    expect(toast).toHaveTextContent(hints.feedback.trouvee);
    expect(toast.textContent).not.toMatch(/\b(faux|erreur)\b/i);
    expect(screen.getByTestId('fm-fresque-chip-c04')).toHaveTextContent('1/1');

    // Doublon refusé (message, pas de seconde flèche).
    fireEvent.keyDown(screen.getByTestId('fm-fresque-link-c04'), { key: 'Enter' });
    fireEvent.click(await screen.findByTestId('fm-fresque-pick-target-c07'));
    expect(screen.queryByTestId('fm-fresque-arrow-l2')).toBeNull();
    expect(screen.getByTestId('fm-fresque-toast')).toHaveTextContent(hints.feedback.doublon);

    // Retirer : Suppr sur la flèche focalisée.
    fireEvent.keyDown(screen.getByTestId('fm-fresque-arrow-l1'), { key: 'Delete' });
    expect(screen.queryByTestId('fm-fresque-arrow-l1')).toBeNull();

    // Enregistrement différé : un PUT part avec la révision attendue 0, puis la suivante.
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    const firstPut = api.calls.find((c) => c.method === 'PUT');
    expect(firstPut.path).toBe('/api/fresques/boards/b1');
    expect(firstPut.body.expected_revision).toBe(0);
    expect(firstPut.body.state.cards.c04).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('fm-fresque-save')).toHaveAttribute('data-status', 'saved'),
    );
  });

  test('le lot suivant ne s’ouvre que lorsque toutes les cartes du lot sont posées', async () => {
    renderBoard(lotState());
    expect(screen.queryByTestId('fm-fresque-next-lot')).toBeNull();
    fireEvent.click(screen.getByTestId('fm-fresque-place-all'));
    expect(screen.getByTestId('fm-fresque-hand-empty')).toBeInTheDocument();
    const next = await screen.findByTestId('fm-fresque-next-lot');
    expect(next).toHaveTextContent('Ouvrir le lot 2');
    fireEvent.click(next);
    expect(screen.getByTestId('fm-fresque-board')).toHaveAttribute('data-step', 'lot2');
    expect(screen.getByTestId('fm-fresque-step-lot2')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('fm-fresque-hand-c03')).toBeInTheDocument();
    expect(screen.getByTestId('fm-fresque-toast')).toHaveTextContent(hints.lotIntros['2']);
    // Revenir voir le lot 1 reste possible ; Comprendre reste verrouillé.
    fireEvent.click(screen.getByTestId('fm-fresque-step-lot1'));
    expect(screen.getByTestId('fm-fresque-board')).toHaveAttribute('data-step', 'lot1');
    expect(screen.getByTestId('fm-fresque-step-comprendre')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('niveaux : puces et bandes en Éclaireur seulement, changement libre sans rien perdre', async () => {
    let s = lotState('eclaireur');
    s = placeCard(model, s, 'c04', { x: 10, y: 10 });
    renderBoard(s);
    expect(screen.getByTestId('fm-fresque-chip-c04')).toBeInTheDocument();
    expect(screen.getByTestId('fm-fresque-bands')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fm-fresque-level-btn'));
    fireEvent.click(screen.getByTestId('fm-fresque-level-expert'));
    expect(screen.getByTestId('fm-fresque-board')).toHaveAttribute('data-level', 'expert');
    expect(screen.queryByTestId('fm-fresque-chip-c04')).toBeNull();
    expect(screen.queryByTestId('fm-fresque-bands')).toBeNull();
    expect(screen.getByTestId('fm-fresque-card-c04')).toBeInTheDocument();
    // Explorateur : option « Afficher les bandes ».
    fireEvent.click(screen.getByTestId('fm-fresque-level-btn'));
    fireEvent.click(screen.getByTestId('fm-fresque-level-explorateur'));
    fireEvent.click(screen.getByTestId('fm-fresque-toggle-bands'));
    expect(screen.getByTestId('fm-fresque-bands')).toBeInTheDocument();
    expect(screen.queryByTestId('fm-fresque-chip-c04')).toBeNull();
  });

  test('miroir local plus récent que le serveur : restauré et renvoyé', async () => {
    const server = lotState();
    const local = { ...placeCard(model, server, 'c21', { x: 60, y: 20 }), clientSeq: 4 };
    localStorage.setItem(
      mirrorKey('b1'),
      JSON.stringify({ clientSeq: 4, baseRevision: 0, state: local, at: 'x' }),
    );
    const { api } = renderBoard(server);
    expect(screen.getByTestId('fm-fresque-card-c21')).toBeInTheDocument();
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = api.calls.find((c) => c.method === 'PUT');
    expect(put.body.state.cards.c21).toBeTruthy();
    expect(put.body.clientSeq).toBe(4);
    // Le miroir est réécrit à chaque modification.
    fireEvent.keyDown(screen.getByTestId('fm-fresque-hand-c04'), { key: 'Enter' });
    const mirror = JSON.parse(localStorage.getItem(mirrorKey('b1')));
    expect(mirror.state.cards.c04).toBeTruthy();
    expect(mirror.clientSeq).toBe(5);
  });

  test('conflit 409 : dialogue, « Reprendre la version enregistrée » recharge le serveur', async () => {
    const serverState = placeCard(model, lotState(), 'c13', { x: 30, y: 30 });
    const api = vi.fn(async (p, method = 'GET') => {
      if (method === 'PUT') {
        const err = new Error('conflit');
        err.status = 409;
        err.body = { code: 'edit_conflict', current_revision: 3 };
        throw err;
      }
      return { board: boardFixture(serverState, { revision: 3 }) };
    });
    renderBoard(lotState(), { api });
    fireEvent.keyDown(screen.getByTestId('fm-fresque-hand-c04'), { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: /Conflit/ });
    expect(dialog).toHaveTextContent('modifiée sur un autre appareil');
    expect(screen.getByTestId('fm-fresque-save')).toHaveAttribute('data-status', 'conflict');
    await act(async () => {
      fireEvent.click(screen.getByTestId('fm-fresque-conflict-reload'));
    });
    await waitFor(() => expect(screen.getByTestId('fm-fresque-card-c13')).toBeInTheDocument());
    expect(screen.queryByTestId('fm-fresque-card-c04')).toBeNull();
    expect(screen.queryByRole('dialog', { name: /Conflit/ })).toBeNull();
    expect(
      api.mock.calls.some(
        ([p, m]) => p === '/api/fresques/boards/b1' && (m === undefined || m === 'GET'),
      ),
    ).toBe(true);
  });

  test('signal temps réel : écho de son propre enregistrement ignoré, autre écran → conflit si modifié', async () => {
    let handler = null;
    const subscribeBoard = vi.fn((_id, onChanged) => {
      handler = onChanged;
      return () => {};
    });
    const { api } = renderBoard(lotState(), { subscribeBoard });
    expect(subscribeBoard).toHaveBeenCalledWith('b1', expect.any(Function));
    fireEvent.keyDown(screen.getByTestId('fm-fresque-hand-c04'), { key: 'Enter' });
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = api.calls.find((c) => c.method === 'PUT');
    expect(put.body.clientId).toMatch(/^c\d+-/);
    await waitFor(() =>
      expect(screen.getByTestId('fm-fresque-save')).toHaveAttribute('data-status', 'saved'),
    );
    // Écho de notre propre enregistrement : rien ne se passe.
    await act(async () => {
      handler({ boardId: 'b1', revision: 9, clientId: put.body.clientId });
    });
    expect(screen.queryByRole('dialog', { name: /Conflit/ })).toBeNull();
    // Autre écran, rien en attente : rechargement (GET).
    const getsBefore = api.calls.filter((c) => c.method === 'GET').length;
    await act(async () => {
      handler({ boardId: 'b1', revision: 9, clientId: 'autre-ecran' });
    });
    await waitFor(() =>
      expect(api.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(getsBefore),
    );
  });

  test('carte de la main touchée : affichée en grand, verso consultable, pose sur une place libre', () => {
    renderBoard(lotState());
    const handCard = screen.getByTestId('fm-fresque-hand-c07');
    fireEvent.pointerDown(handCard, { pointerId: 7, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 10, clientY: 10 });
    const panel = screen.getByTestId('fm-fresque-inspector');
    expect(panel).toHaveAttribute('data-origin', 'hand');
    const img = panel.querySelector('img');
    expect(img.getAttribute('src')).toBe(`${PUBLIC_BASE}${model.cardsById.c07.recto}`);
    // Licence : l'image est seule dans son bouton, les commandes sont à côté.
    expect(img.parentElement.children).toHaveLength(1);
    fireEvent.click(screen.getByTestId('fm-fresque-inspector-flip'));
    expect(panel.querySelector('img').getAttribute('src')).toBe(
      `${PUBLIC_BASE}${model.cardsById.c07.verso}`,
    );
    expect(screen.getByTestId('fm-fresque-inspector-hint')).toHaveTextContent('Touche la table');
    fireEvent.click(screen.getByTestId('fm-fresque-inspector-place'));
    expect(screen.getByTestId('fm-fresque-card-c07')).toBeInTheDocument();
    expect(screen.queryByTestId('fm-fresque-hand-c07')).toBeNull();
    // La carte posée reste choisie : le panneau passe en mode « table ».
    expect(screen.getByTestId('fm-fresque-inspector')).toHaveAttribute('data-origin', 'table');
    fireEvent.click(screen.getByTestId('fm-fresque-inspector-close'));
    expect(screen.queryByTestId('fm-fresque-inspector')).toBeNull();
  });

  test('carte posée choisie : affichée en grand, retournée depuis le panneau', () => {
    const s = placeCard(model, lotState(), 'c04', { x: 10, y: 10 });
    renderBoard(s);
    fireEvent.focus(screen.getByTestId('fm-fresque-card-c04'));
    const panel = screen.getByTestId('fm-fresque-inspector');
    expect(panel).toHaveAttribute('data-origin', 'table');
    expect(screen.getByTestId('fm-fresque-inspector-link')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fm-fresque-inspector-flip'));
    expect(screen.getByTestId('fm-fresque-card-c04')).toHaveAttribute('aria-pressed', 'true');
    expect(panel.querySelector('img').getAttribute('src')).toBe(
      `${PUBLIC_BASE}${model.cardsById.c04.verso}`,
    );
  });

  test('OLU raconte le tutoriel : portrait et bulle, nom du narrateur, coupé sur demande', () => {
    const narrator = { enabled: true, speakerName: 'OLU', portraits: {} };
    const { unmount } = renderBoard(createInitialState(model), { narrator });
    const scene = screen.getByTestId('fm-fresque-tutorial-olu');
    expect(scene.querySelector('.fm-mascot-speaker')).not.toBeNull();
    expect(scene).toHaveTextContent('OLU');
    expect(scene).toHaveTextContent(hints.tutorial[0].text);
    unmount();
    // Narrateur coupé dans les réglages : la bulle reste, sans portrait ni nom.
    renderBoard(createInitialState(model), { narrator: { ...narrator, enabled: false } });
    const quiet = screen.getByTestId('fm-fresque-tutorial-olu');
    expect(quiet.querySelector('.fm-mascot-speaker')).toBeNull();
    expect(quiet).not.toHaveTextContent('OLU');
    expect(quiet).toHaveTextContent(hints.tutorial[0].text);
  });

  test('lecture seule : pas de main active, pas de bouton relier, indicateur dédié', () => {
    const s = placeCard(model, lotState(), 'c04', { x: 10, y: 10 });
    renderBoard(s, { readOnly: true });
    expect(screen.getByTestId('fm-fresque-save')).toHaveTextContent('Lecture seule');
    expect(screen.queryByTestId('fm-fresque-link-c04')).toBeNull();
    expect(screen.queryByTestId('fm-fresque-place-all')).toBeNull();
    expect(screen.getByTestId('fm-fresque-hand-c07')).toBeDisabled();
    expect(screen.getByTestId('fm-fresque-credit')).toBeInTheDocument();
  });
});
