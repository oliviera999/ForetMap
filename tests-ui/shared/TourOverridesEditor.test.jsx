import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TourOverridesEditor } from '../../src/shared/components/TourOverridesEditor.jsx';

const RELAUNCH = { key: 'relaunch', title: 'Relance', body: 'Je reviens quand tu veux.' };
const SECTIONS = [
  {
    key: 'commun',
    label: 'Étape commune',
    hint: 'Réécrite ici, elle change partout.',
    steps: [RELAUNCH],
  },
  {
    key: 'cartes',
    label: 'Les cartes',
    hint: '',
    steps: [
      { key: 'intro', title: 'Les cartes', body: 'Voilà la carte.', bodyTeacher: 'Version MJ.' },
      { key: 'reperes', title: 'Les repères', body: 'Clique un repère.' },
    ],
  },
];

const FIELD_LABELS = { title: 'Titre', body: 'Texte (joueur)', bodyTeacher: 'Texte (MJ)' };
const overrideKey = (tourKey, step, field) =>
  `${step.key === 'relaunch' ? 'commun' : tourKey}.${step.key}.${field}`;

function setup(overrides = {}) {
  const loadRegistry = vi.fn().mockResolvedValue(overrides.registry ?? {});
  const saveRegistry = vi.fn().mockResolvedValue(undefined);
  const resetRegistry = overrides.resetRegistry;
  render(
    <TourOverridesEditor
      sections={SECTIONS}
      overrideKey={overrideKey}
      fieldLabels={FIELD_LABELS}
      loadRegistry={loadRegistry}
      saveRegistry={saveRegistry}
      resetRegistry={resetRegistry}
      intro="Les textes des visites guidées."
    />,
  );
  return { loadRegistry, saveRegistry };
}

describe('TourOverridesEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('le texte livré s’affiche en filigrane, pas comme une valeur saisie', async () => {
    setup();
    await screen.findByText('Étape commune');
    const textarea = await screen.findByPlaceholderText('Je reviens quand tu veux.');
    expect(textarea.value).toBe('');
  });

  test('la structure n’est pas éditable : ni cible, ni placement', async () => {
    setup();
    await screen.findByText('Étape commune');
    expect(screen.queryByText(/cible/i)).toBeNull();
    expect(screen.queryByText(/placement/i)).toBeNull();
  });

  test('changer de section montre les étapes du parcours choisi', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /Les cartes/ }));
    expect(await screen.findByPlaceholderText('Voilà la carte.')).toBeTruthy();
    expect(screen.getByPlaceholderText('Clique un repère.')).toBeTruthy();
  });

  test('la variante de service n’est proposée que là où le parcours en prévoit une', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /Les cartes/ }));
    // « intro » a un bodyTeacher, « reperes » non : un seul champ MJ à l'écran.
    expect(screen.getAllByText('Texte (MJ)')).toHaveLength(1);
  });

  test('un texte réécrit est compté et signalé', async () => {
    setup({ registry: { 'cartes.intro.body': 'Version maison' } });
    expect(await screen.findByText('1 texte réécrit')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Les cartes \(1\)/ }));
    expect(await screen.findByText('Texte (joueur) · réécrit')).toBeTruthy();
  });

  test('sans réécriture, le compteur le dit', async () => {
    setup();
    expect(await screen.findByText('Aucun texte réécrit')).toBeTruthy();
  });

  test('le bouton de réinitialisation n’apparaît que si le produit en fournit une', async () => {
    setup({ registry: { 'cartes.intro.body': 'x' } });
    await screen.findByText('1 texte réécrit');
    expect(screen.queryByRole('button', { name: /réinitialiser/i })).toBeNull();
  });

  test('un échec de chargement est annoncé, pas avalé', async () => {
    const loadRegistry = vi.fn().mockRejectedValue(new Error('Serveur indisponible'));
    render(
      <TourOverridesEditor
        sections={SECTIONS}
        overrideKey={overrideKey}
        fieldLabels={FIELD_LABELS}
        loadRegistry={loadRegistry}
        saveRegistry={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Serveur indisponible/)).toBeTruthy());
  });
});
