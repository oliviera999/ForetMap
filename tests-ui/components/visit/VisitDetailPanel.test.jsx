import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { VisitDetailPanel } from '../../../src/components/visit/VisitDetailPanel.jsx';

function setup(overrides = {}) {
  const props = {
    selected: {
      id: 3,
      name: 'Verger',
      visit_short_description: 'Un coin de pommiers.',
      visit_media: [],
    },
    selectedType: 'zone',
    onClose: vi.fn(),
    onRequestClose: null,
    comfortableReading: false,
    onToggleComfortableReading: vi.fn(),
    onOpenLightbox: vi.fn(),
    onOpenTutorialPreview: vi.fn(),
    seen: new Set(),
    savingSeen: false,
    onToggleSeen: vi.fn(),
    roleTerms: {},
    markerEmojis: ['📍'],
    ...overrides,
  };
  const utils = render(<VisitDetailPanel {...props} />);
  return { ...utils, props };
}

describe('VisitDetailPanel — modalité et accessibilité', () => {
  test('le panneau est un dialogue nommé par son titre', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Verger');
  });

  test('le focus entre dans le panneau à l’ouverture', () => {
    setup();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  test('le focus revient sur l’élément déclencheur à la fermeture', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = setup();
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  test('Échap ferme le panneau (via onRequestClose quand il est fourni)', () => {
    const onRequestClose = vi.fn();
    const { props } = setup({ onRequestClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test('Échap retombe sur onClose si aucune garde n’est fournie', () => {
    const { props } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test('un voile couvre la carte et la referme au clic', () => {
    const { props } = setup();
    const scrim = screen.getByTestId('visit-detail-panel-scrim');
    expect(scrim).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(scrim);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test('le bouton « Aa » porte un nom accessible explicite', () => {
    const { props } = setup();
    const btn = screen.getByRole('button', { name: /Lecture confortable/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(props.onToggleComfortableReading).toHaveBeenCalledTimes(1);
  });

  test('sans sélection, rien n’est rendu', () => {
    const { container } = setup({ selected: null });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('VisitDetailPanel — glossaire et biodiversité du lieu', () => {
  const GLOSSARY_ITEMS = [{ glossary_code: 'FM0001', terme: 'biocénose', variantes: 'biocénoses' }];

  test('les termes du glossaire sont hyperliés dans le texte du lieu', () => {
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        visit_short_description: 'Ici vit une biocénose entière.',
        visit_media: [],
      },
      glossaryItems: GLOSSARY_ITEMS,
      onOpenGlossaryTerm: vi.fn(),
    });
    const link = container.querySelector('a[data-glossary-code="FM0001"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toBe('biocénose');
  });

  test('un clic sur un terme remonte son code (fiche rapide)', () => {
    const onOpenGlossaryTerm = vi.fn();
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        visit_short_description: 'Ici vit une biocénose entière.',
        visit_media: [],
      },
      glossaryItems: GLOSSARY_ITEMS,
      onOpenGlossaryTerm,
    });
    fireEvent.click(container.querySelector('a[data-glossary-code="FM0001"]'));
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('FM0001');
  });

  test('sans index de glossaire, le texte reste un markdown normal', () => {
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        visit_short_description: 'Ici vit une biocénose entière.',
        visit_media: [],
      },
    });
    expect(container.querySelector('a[data-glossary-code]')).toBeNull();
    expect(container.textContent).toContain('Ici vit une biocénose entière.');
  });

  test('les détails et les blocs éditoriaux sont auto-liés aussi', () => {
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        visit_media: [],
        visit_editorial_blocks: [
          { id: 'b1', type: 'paragraph', markdown: 'Une biocénose en bloc éditorial.' },
        ],
      },
      glossaryItems: GLOSSARY_ITEMS,
      onOpenGlossaryTerm: vi.fn(),
    });
    expect(
      container.querySelector('.visit-editorial a[data-glossary-code="FM0001"]'),
    ).not.toBeNull();
  });

  test('la biodiversité du lieu est visible d’emblée, vignette ouvrant la fiche', () => {
    const onOpenPlantCatalogPreview = vi.fn();
    setup({
      selected: {
        id: 3,
        name: 'Verger',
        visit_media: [],
        living_beings_list: ['Consoude'],
        species: [{ id: 12, name: 'Consoude', emoji: '🌿' }],
      },
      plants: [{ id: 12, name: 'Consoude', emoji: '🌿' }],
      onOpenPlantCatalogPreview,
    });
    expect(
      screen.getByRole('heading', { name: /Biodiversité de cette zone/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la fiche de Consoude/i }));
    expect(onOpenPlantCatalogPreview).toHaveBeenCalledWith(12);
  });

  test('aucune espèce : aucun volet biodiversité', () => {
    setup();
    expect(screen.queryByRole('heading', { name: /Biodiversité/i })).toBeNull();
  });
});
