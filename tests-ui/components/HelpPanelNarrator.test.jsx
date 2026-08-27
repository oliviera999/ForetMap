// Lot 5 — portrait d'en-tête du narrateur dans le panneau d'aide.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { HelpPanel } from '../../src/components/HelpPanel';
import { PublicSettingsProvider } from '../../src/contexts/PublicSettingsContext.jsx';

const ENTRIES = [{ text: 'Un point d’aide.' }];

function renderPanel(narrator) {
  return render(
    <PublicSettingsProvider
      value={narrator === undefined ? {} : { content: { help: { narrator } } }}
    >
      <HelpPanel sectionId="map" title="Aide de la carte" entries={ENTRIES} />
    </PublicSettingsProvider>,
  );
}

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: /Ouvrir l aide/ }));
}

function headerPortrait() {
  return document.querySelector('.fm-help-panel__title [data-mascot-speaker]');
}

describe('HelpPanel — portrait du narrateur', () => {
  afterEach(() => cleanup());

  it('affiche un portrait « visage » décoratif dans l’en-tête', () => {
    renderPanel({
      enabled: true,
      speakerName: 'OLU',
      fallbackSilhouette: 'olu',
      portraits: { neutre: { bust: '/uploads/olu.webp' } },
    });
    openPanel();

    const speaker = headerPortrait();
    expect(speaker).not.toBeNull();
    expect(speaker).toHaveAttribute('data-framing', 'face');
    expect(speaker).toHaveAttribute('aria-hidden', 'true');
    expect(speaker.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('n’altère ni le titre affiché ni le nom accessible du dialogue', () => {
    renderPanel(undefined);
    openPanel();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Aide de la carte');
    expect(document.querySelector('.fm-help-panel__title')).toHaveTextContent(
      '💡 Aide de la carte',
    );
  });

  it('l’interrupteur global retire le portrait', () => {
    renderPanel({ enabled: false, speakerName: 'OLU', portraits: {} });
    openPanel();
    expect(headerPortrait()).toBeNull();
    expect(screen.getByText('Un point d’aide.')).toBeInTheDocument();
  });

  it('sans réglage chargé, le repli SVG tient la place', () => {
    renderPanel(undefined);
    openPanel();
    expect(headerPortrait()).toHaveAttribute('data-source', 'svg');
  });
});
