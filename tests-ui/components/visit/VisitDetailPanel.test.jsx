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

describe('VisitDetailPanel — photo lead sans doublon', () => {
  test('même URL carte + média visite → une seule vignette lead', () => {
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        visit_short_description: 'Intro du lieu.',
        map_lead_photo: { id: 10, image_url: '/uploads/zones/3/a.jpg', caption: 'Lead carte' },
        visit_media: [{ id: 20, image_url: '/uploads/zones/3/a.jpg', caption: 'Même fichier' }],
      },
    });
    const leadGalleries = container.querySelectorAll('.visit-media-gallery--lead');
    expect(leadGalleries).toHaveLength(1);
    expect(leadGalleries[0].querySelectorAll('img')).toHaveLength(1);
  });

  test('URLs distinctes → photo carte puis photo visite sous l’intro', () => {
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        visit_short_description: 'Intro du lieu.',
        map_lead_photo: { id: 10, image_url: '/uploads/zones/3/a.jpg' },
        visit_media: [{ id: 20, image_url: '/uploads/visit/b.jpg' }],
      },
    });
    const leadGalleries = container.querySelectorAll('.visit-media-gallery--lead');
    expect(leadGalleries).toHaveLength(2);
  });

  test('photo carte déjà en tête : écartée aussi des photos « Détails »', () => {
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        visit_short_description: 'Intro du lieu.',
        visit_details_text: 'Le détail.',
        map_lead_photo: { id: 10, image_url: '/uploads/zones/3/10.jpg' },
        map_extra_photos: [
          { id: 10, image_url: '/uploads/zones/3/10.jpg' },
          { id: 11, image_url: '/uploads/zones/3/11.jpg' },
        ],
        visit_media: [],
      },
    });
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['/uploads/zones/3/10.jpg', '/uploads/zones/3/11.jpg']);
  });
});

describe('VisitDetailPanel — blocs éditoriaux (forme renvoyée par /api/visit/content)', () => {
  /** Même cliché : chemin public côté carte, route API historique côté média visite. */
  test('photo carte et bloc image = même photo sous deux URL → une seule vignette', () => {
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        visit_short_description: 'Intro du lieu.',
        map_lead_photo: {
          id: 10,
          image_url: '/uploads/zones/3/10.jpg',
          thumb_url: '/uploads/zones/3/10.thumb.jpg',
        },
        visit_media: [{ id: 20, image_url: '/api/zones/3/photos/10/data' }],
        visit_editorial_blocks: [
          { id: 'legacy-short', type: 'paragraph', markdown: 'Intro du lieu.' },
          { id: 'legacy-img-1', type: 'image', media_ids: [20], layout: 'single', size: 'lg' },
        ],
      },
    });
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['/uploads/zones/3/10.thumb.jpg']);
  });

  test('repère : route API historique côté carte, chemin public côté visite', () => {
    const { container } = setup({
      selectedType: 'marker',
      selected: {
        id: 'm7',
        label: 'Pommier',
        map_lead_photo: { id: 4, image_url: '/api/map/markers/m7/photos/4/data' },
        visit_media: [{ id: 21, image_url: '/uploads/markers/m7/4.jpg' }],
        visit_editorial_blocks: [
          { id: 'img-1', type: 'image', media_ids: [21], layout: 'single', size: 'lg' },
        ],
      },
    });
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['/api/map/markers/m7/photos/4/data']);
  });

  test('copie sous /api/visit/media/… (prod) : lead seule, pas de second hero lg', () => {
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        map_lead_photo: { id: 10, image_url: '/uploads/zones/3/10.jpg' },
        visit_media: [{ id: 20, image_url: '/api/visit/media/20/data' }],
        visit_editorial_blocks: [
          { id: 'legacy-short', type: 'paragraph', markdown: 'Intro.' },
          { id: 'legacy-img-1', type: 'image', media_ids: [20], layout: 'single', size: 'lg' },
        ],
      },
    });
    expect(container.querySelectorAll('.visit-media-gallery--lead')).toHaveLength(1);
    expect(container.querySelector('.visit-editorial-image')).toBeNull();
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['/uploads/zones/3/10.jpg']);
  });

  test('photo différente en md : reste affichée sous la lead', () => {
    const { container } = setup({
      selected: {
        id: 3,
        name: 'Verger',
        map_lead_photo: { id: 10, image_url: '/uploads/zones/3/10.jpg' },
        visit_media: [{ id: 20, image_url: '/api/visit/media/20/data' }],
        visit_editorial_blocks: [
          { id: 'img-1', type: 'image', media_ids: [20], layout: 'single', size: 'md' },
        ],
      },
    });
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['/uploads/zones/3/10.jpg', '/api/visit/media/20/data']);
  });
});

describe('VisitDetailPanel — « Y aller »', () => {
  test('sans guidage câblé, aucun bouton n’est proposé', () => {
    setup();
    expect(screen.queryByTestId('visit-detail-go')).toBe(null);
  });

  test('géolocalisation non activée sur la carte : ni bouton, ni explication', () => {
    setup({ onGoTo: vi.fn(), canGuide: false });
    expect(screen.queryByTestId('visit-detail-go')).toBe(null);
    expect(screen.queryByText(/Carte non calée/)).toBe(null);
  });

  test('le bouton annonce une direction, pas un itinéraire, et vise le lieu ouvert', () => {
    const onGoTo = vi.fn();
    const { props } = setup({ onGoTo, canGuide: true });

    const go = screen.getByTestId('visit-detail-go');
    expect(go).toHaveTextContent('Y aller');
    expect(screen.getByText(/pas un itinéraire/)).toBeTruthy();

    fireEvent.click(go);
    expect(onGoTo).toHaveBeenCalledWith(props.selected);
  });

  test('lieu déjà visé : le bouton rouvre la direction et donne la distance', () => {
    setup({ onGoTo: vi.fn(), canGuide: true, isGuideTarget: true, guideDistanceLabel: '120 m' });
    expect(screen.getByTestId('visit-detail-go')).toHaveTextContent('Revoir la direction');
    expect(screen.getByText(/120 m à vol d’oiseau/)).toBeTruthy();
  });
});
