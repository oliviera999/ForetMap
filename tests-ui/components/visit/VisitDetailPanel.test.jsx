import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// MarkdownContent rend du HTML : réduit à un passe-plat texte pour isoler l'affichage.
vi.mock('../../../src/components/MarkdownContent.jsx', () => ({
  MarkdownContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

// map-views est un méga-module (carte complète) : on stub les trois panneaux utilisés.
vi.mock('../../../src/components/map-views', () => ({
  BiodiversitySpeciesOpenLinks: ({ names }) => (
    <div data-testid="biodiv-open-links">{(names || []).join(', ')}</div>
  ),
  LivingBeingsCatalogPanel: ({ names }) => (
    <div data-testid="biodiv-catalog-panel">{(names || []).join(', ')}</div>
  ),
  LocationTutorialPreviewList: ({ tutorials, onOpenTutorialPreview }) => (
    <ul data-testid="location-tutos">
      {(tutorials || []).map((t) => (
        <li key={t.id}>
          <button type="button" onClick={() => onOpenTutorialPreview(t)}>{t.title}</button>
        </li>
      ))}
    </ul>
  ),
}));

// L'éditeur prof fait des appels API : stub minimal qui expose le flag isTeacher reçu.
vi.mock('../../../src/components/visit/VisitEditorPanel.jsx', () => ({
  VisitEditorPanel: ({ isTeacher }) => (
    isTeacher ? <div data-testid="visit-editor-panel" /> : null
  ),
}));

import { VisitDetailPanel } from '../../../src/components/visit/VisitDetailPanel.jsx';

const ZONE = {
  id: 7,
  name: '🌳 Verger',
  visit_subtitle: 'Sous-titre du lieu',
  visit_short_description: 'Description courte',
  visit_details_title: 'En savoir plus',
  visit_details_text: 'Texte des détails',
  visit_media: [
    { id: 1, image_url: '/uploads/a.jpg', caption: 'Photo une' },
    { id: 2, image_url: '/uploads/b.jpg', caption: 'Photo deux' },
  ],
};

function setup(overrides = {}) {
  const props = {
    selected: ZONE,
    selectedType: 'zone',
    onClose: vi.fn(),
    comfortableReading: false,
    onToggleComfortableReading: vi.fn(),
    onOpenLightbox: vi.fn(),
    onOpenTutorialPreview: vi.fn(),
    seen: new Set(),
    savingSeen: false,
    onToggleSeen: vi.fn(),
    plants: [],
    onOpenPlantCatalogPreview: null,
    mapId: 'foret',
    mapZones: [],
    mapMarkers: [],
    tasks: [],
    catalogTutorials: [],
    isTeacher: false,
    canEditVisit: false,
    onSaved: vi.fn(),
    onForceLogout: vi.fn(),
    roleTerms: { teacherShort: 'prof' },
    markerEmojis: [],
    ...overrides,
  };
  const utils = render(<VisitDetailPanel {...props} />);
  return { props, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VisitDetailPanel', () => {
  test('affiche titre (zone), sous-titre, description et galerie ; Fermer → onClose', () => {
    const { props } = setup();
    expect(screen.getByTestId('visit-detail-panel')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '🌳 Verger' })).toBeInTheDocument();
    expect(screen.getByText('Sous-titre du lieu')).toBeInTheDocument();
    expect(screen.getByText('Description courte')).toBeInTheDocument();
    // Galerie repli (pas de blocs éditoriaux) : 1re photo en tête, reste dans « Détails ».
    expect(screen.getByText('Photo une')).toBeInTheDocument();
    expect(screen.getByText('En savoir plus')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test('repère : titre depuis label ; bascule lecture confortable', () => {
    const { props } = setup({
      selected: { id: 3, label: 'Vieille souche', visit_media: [] },
      selectedType: 'marker',
    });
    expect(screen.getByRole('dialog', { name: 'Vieille souche' })).toBeInTheDocument();
    const aa = screen.getByRole('button', { name: 'Aa' });
    expect(aa).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(aa);
    expect(props.onToggleComfortableReading).toHaveBeenCalledTimes(1);
  });

  test('mode lecture confortable : classe modifiée appliquée au panneau', () => {
    setup({ comfortableReading: true });
    expect(screen.getByTestId('visit-detail-panel').className)
      .toContain('visit-detail-panel--comfortable');
  });

  test('clic vignette → onOpenLightbox avec src pleine taille + légende', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir la photo : Photo une' }));
    expect(props.onOpenLightbox).toHaveBeenCalledWith({ src: '/uploads/a.jpg', caption: 'Photo une' });
  });

  test('blocs éditoriaux présents : rendu éditorial au lieu du repli description', () => {
    setup({
      selected: {
        ...ZONE,
        visit_editorial_blocks: [
          { id: 'b1', type: 'heading', level: 3, text: 'Chapitre' },
          { id: 'b2', type: 'paragraph', markdown: 'Paragraphe éditorial' },
          { id: 'b3', type: 'image', media_ids: [2] },
        ],
      },
    });
    expect(screen.getByText('Chapitre')).toBeInTheDocument();
    expect(screen.getByText('Paragraphe éditorial')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agrandir la photo : Photo deux' })).toBeInTheDocument();
    expect(screen.queryByText('Description courte')).not.toBeInTheDocument();
  });

  test('bouton vu : libellé selon `seen`, clic → onToggleSeen, désactivé si savingSeen', () => {
    const { props } = setup();
    const btn = screen.getByRole('button', { name: '🔴 Marquer comme vu' });
    fireEvent.click(btn);
    expect(props.onToggleSeen).toHaveBeenCalledTimes(1);

    setup({ seen: new Set(['zone:7']), savingSeen: true });
    const seenBtn = screen.getByRole('button', { name: '✅ Marqué comme vu' });
    expect(seenBtn).toBeDisabled();
  });

  test('aside biodiversité + tutos du lieu depuis le contexte carte/missions', () => {
    const { props } = setup({
      mapZones: [{ id: 7, map_id: 'foret', living_beings_list: ['Chêne', 'Fougère'] }],
      catalogTutorials: [{ id: 10, title: 'Tuto verger', zone_ids: [7], is_active: true }],
    });
    expect(screen.getByText('Biodiversité')).toBeInTheDocument();
    expect(screen.getByTestId('biodiv-catalog-panel')).toHaveTextContent('Chêne, Fougère');
    expect(screen.getByText('Tuto')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tuto verger' }));
    expect(props.onOpenTutorialPreview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10 }),
    );
  });

  test('onOpenPlantCatalogPreview fourni : liens d’ouverture du catalogue plutôt que panneau inline', () => {
    setup({
      mapZones: [{ id: 7, map_id: 'foret', living_beings_list: ['Chêne'] }],
      onOpenPlantCatalogPreview: vi.fn(),
    });
    expect(screen.getByTestId('biodiv-open-links')).toHaveTextContent('Chêne');
    expect(screen.queryByTestId('biodiv-catalog-panel')).not.toBeInTheDocument();
  });

  test('édition visite : panneau prof rendu seulement si canEditVisit', () => {
    setup({ isTeacher: true, canEditVisit: false });
    expect(screen.queryByTestId('visit-editor-panel')).not.toBeInTheDocument();

    setup({ isTeacher: true, canEditVisit: true });
    expect(screen.getByTestId('visit-editor-panel')).toBeInTheDocument();
  });
});
