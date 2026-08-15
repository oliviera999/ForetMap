import React from 'react';
import { describe, test, expect, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// Le parcours réel écarte les étapes dont la cible CSS est absente du DOM : hors
// application montée, il ne resterait rien à afficher. On fige donc l'état du
// parcours pour n'éprouver qu'une chose ici — le câblage du narrateur.
vi.mock('../../src/hooks/useDiscoveryTour.js', () => ({
  useDiscoveryTour: () => ({
    active: {
      tab: 'map',
      index: 0,
      steps: [{ target: null, title: 'Étape', body: 'Corps', placement: 'center' }],
    },
    startTour: () => true,
    stopTour: () => {},
    nextStep: () => {},
    prevStep: () => {},
    hasSeenTour: () => true,
    resetSeen: () => {},
    isActive: true,
  }),
}));

const { TourProvider } = await import('../../src/contexts/TourContext.jsx');
const { PublicSettingsProvider } = await import('../../src/contexts/PublicSettingsContext.jsx');

function renderWithNarrator(narrator) {
  return render(
    <PublicSettingsProvider
      value={narrator === undefined ? {} : { content: { help: { narrator } } }}
    >
      <TourProvider tab="map" enabled={false}>
        <div />
      </TourProvider>
    </PublicSettingsProvider>,
  );
}

function speakerLabel() {
  return document.querySelector('[data-speech-bubble-speaker]');
}

describe('TourProvider — câblage du narrateur', () => {
  afterEach(() => cleanup());

  test('affiche le nom du locuteur issu de content.help.narrator', () => {
    renderWithNarrator({ enabled: true, speakerName: 'OLU', portraits: {} });
    expect(speakerLabel()).toHaveTextContent('OLU');
  });

  test('l’interrupteur global retire l’étiquette', () => {
    renderWithNarrator({ enabled: false, speakerName: 'OLU', portraits: {} });
    expect(speakerLabel()).toBeNull();
  });

  test('un nom vide n’affiche pas d’étiquette', () => {
    renderWithNarrator({ enabled: true, speakerName: '', portraits: {} });
    expect(speakerLabel()).toBeNull();
  });

  test('sans réglage narrateur, la bulle reste anonyme', () => {
    renderWithNarrator(undefined);
    expect(speakerLabel()).toBeNull();
    // La bulle elle-même reste rendue : le narrateur est un enrichissement, pas une dépendance.
    expect(document.querySelector('.discovery-tour__bubble')).not.toBeNull();
  });
});
