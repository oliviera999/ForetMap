// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * Montage des deux modales de lieu (`MarkerModal`, `ZoneInfoModal`) — filet posé AVANT d'en
 * partager les parties communes (étape B4 de l'audit du 25/09/2026, § 3.3 ligne 12 ; règle du
 * post-mortem `docs/AUDIT_REFACTORING_APP_2026-08.md` §5 : test de montage d'abord).
 *
 * Les vraies dérivations (`useLocationModalData`), la vraie barre d'onglets et les vrais
 * panneaux Tâches / Tutoriels sont montés ; seuls le réseau, les commentaires, la galerie
 * photo et les options de groupes sont remplacés par des sondes. Les mêmes parcours sont
 * rejoués sur les deux modales : onglets selon le rôle, inscription d'un élève, liaison d'une
 * tâche par un prof, onglet Info, raccourci vers l'onglet Tâches, enregistrement.
 */

const apiMock = vi.hoisted(() => vi.fn(() => Promise.reject(new Error('pas de réseau en test'))));
vi.mock('../../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: apiMock,
}));
vi.mock('../../../src/components/context-comments', () => ({
  ContextComments: ({ title, defaultOpen, contextType, contextId }) => (
    <div
      data-testid="context-comments"
      data-open={defaultOpen ? 'true' : 'false'}
      data-context={`${contextType}:${contextId}`}
    >
      {title}
    </div>
  ),
}));
vi.mock('../../../src/components/map/PhotoGallery.jsx', () => ({
  PhotoGallery: ({ zoneId, markerId }) => (
    <div data-testid="photo-gallery">{zoneId ? `zone:${zoneId}` : `marker:${markerId}`}</div>
  ),
}));
vi.mock('../../../src/shared/platform/useDialogA11y', () => ({
  useDialogA11y: () => ({ current: null }),
}));
vi.mock('../../../src/shared/platform/useOverlayHistoryBack', () => ({
  useOverlayHistoryBack: () => {},
}));
vi.mock('../../../src/hooks/useAudienceGroupOptions', () => ({
  useAudienceGroupOptions: () => [],
}));
const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({ confirm: confirmMock, notify: vi.fn() }),
}));
vi.mock('../../../src/components/map/useVisitMediaBlocks.js', () => ({
  useVisitMediaBlocks: () => ({
    visitEditorialBlocks: [],
    visitMediaOptions: [],
    photoOptions: [],
    imageBlocks: [],
    addImageBlock: vi.fn(),
    updateImageBlock: vi.fn(),
    removeImageBlock: vi.fn(),
    attachPhotoToVisit: vi.fn(),
  }),
}));

const { MarkerModal } = await import('../../../src/components/map/MarkerModal.jsx');
const { ZoneInfoModal } = await import('../../../src/components/map/ZoneInfoModal.jsx');

const PLANTS = [
  { id: 1, name: 'Menthe', emoji: '🌿' },
  { id: 2, name: 'Sauge', emoji: '🌱' },
];

const ZONE = {
  id: 'z1',
  map_id: 'foret',
  name: 'Potager Est',
  emoji: '🥕',
  color: '#86efac80',
  description: 'Texte de **travail** de la zone.',
  living_beings_list: ['Menthe'],
  species_ids: [1],
  category_ids: [],
  categories: [],
  hidden_surfaces: [],
  search_aliases: '',
  visible_role_slugs: [],
  visible_group_ids: [],
  links: [{ url: 'https://example.org/zone', label: 'Fiche zone' }],
  notes: [],
  history: [{ id: 1, zone_id: 'z1', plant: 'Radis', harvested_at: '2025-01-20' }],
};

const MARKER = {
  id: 'm1',
  map_id: 'foret',
  label: 'Ruche',
  emoji: '🐝',
  note: 'Note du **repère**.',
  x_pct: 10,
  y_pct: 20,
  living_beings_list: ['Sauge'],
  species_ids: [2],
  category_ids: [],
  categories: [],
  hidden_surfaces: [],
  search_aliases: '',
  visible_role_slugs: [],
  visible_group_ids: [],
  links: [{ url: 'https://example.org/repere', label: 'Fiche repère' }],
  notes: [],
};

/** Deux tâches par lieu : une liée, une libre sur la même carte. */
function tasksFor(kind) {
  const linkKey = kind === 'zone' ? 'zone_ids' : 'marker_ids';
  const id = kind === 'zone' ? 'z1' : 'm1';
  return [
    {
      id: `${kind}-t1`,
      title: `Arroser (${kind})`,
      status: 'available',
      required_students: 2,
      assignments: [],
      map_id: 'foret',
      [linkKey]: [id],
    },
    {
      id: `${kind}-t2`,
      title: `Pailler (${kind})`,
      status: 'available',
      required_students: 1,
      assignments: [],
      map_id: 'foret',
      [linkKey]: [],
    },
  ];
}

function tutorialsFor(kind) {
  const linkKey = kind === 'zone' ? 'zone_ids' : 'marker_ids';
  const id = kind === 'zone' ? 'z1' : 'm1';
  return [
    { id: 71, title: `Tuto lié (${kind})`, is_active: true, [linkKey]: [id] },
    { id: 72, title: `Tuto libre (${kind})`, is_active: true, [linkKey]: [] },
  ];
}

const STUDENT = { id: 'S1', first_name: 'Ada' };

const KINDS = {
  zone: {
    Component: ZoneInfoModal,
    entityProp: 'zone',
    entity: ZONE,
    title: 'Potager Est',
    dialogLabel: 'Zone Potager Est',
    textField: 'Texte de',
    commentsTitle: 'Commentaires de la zone',
    navigateLabel: /Tâches filtré sur cette zone/,
    linkedToast: 'Tâche liée à la zone ✓',
    saveLabel: /Enregistrer/,
    extraProps: { markerEmojis: ['🌱', '🥕'], emojiParsingList: ['🌱', '🥕'] },
  },
  marker: {
    Component: MarkerModal,
    entityProp: 'marker',
    entity: MARKER,
    title: 'Ruche',
    dialogLabel: 'Repère Ruche',
    textField: 'Note du',
    commentsTitle: 'Commentaires du repère',
    navigateLabel: /Tâches filtré sur ce repère/,
    linkedToast: 'Tâche liée au repère ✓',
    saveLabel: /Sauvegarder/,
    extraProps: { markerEmojis: ['🌱', '🐝'] },
  },
};

function renderModal(kind, props = {}) {
  const K = KINDS[kind];
  const handlers = {
    onClose: vi.fn(),
    onUpdate: vi.fn(async () => {}),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(async () => {}),
    onLinkTask: vi.fn(async () => {}),
    onUnlinkTask: vi.fn(async () => {}),
    onLinkTutorial: vi.fn(async () => {}),
    onUnlinkTutorial: vi.fn(async () => {}),
    onAssignTasks: vi.fn(async (ids) => ({ assignedCount: ids.length, failedCount: 0 })),
    onNavigateToTasksForLocation: vi.fn(),
  };
  const { Component } = K;
  const view = render(
    <Component
      {...{ [K.entityProp]: K.entity }}
      plants={PLANTS}
      tasks={tasksFor(kind)}
      tutorials={tutorialsFor(kind)}
      isTeacher={false}
      student={null}
      {...K.extraProps}
      {...handlers}
      {...props}
    />,
  );
  return { view, handlers };
}

function tabLabels() {
  const dialog = screen.getByRole('dialog');
  return within(dialog)
    .getAllByRole('button')
    .map((b) => b.textContent.trim())
    .filter((t) => ['Tâches', 'Tutoriels', 'Info', 'Photos', 'Modifier'].includes(t));
}

function clickTab(label) {
  const dialog = screen.getByRole('dialog');
  const btn = within(dialog)
    .getAllByRole('button')
    .find((b) => b.textContent.trim() === label);
  fireEvent.click(btn);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  apiMock.mockClear();
  confirmMock.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

for (const kind of Object.keys(KINDS)) {
  const K = KINDS[kind];

  describe(`${K.Component.name} — montage`, () => {
    test('prof : titre, onglets complets, panneau Tâches par défaut', () => {
      renderModal(kind, { isTeacher: true });
      const dialog = screen.getByRole('dialog', { name: K.dialogLabel });
      expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent(K.title);
      expect(tabLabels()).toEqual(['Tâches', 'Tutoriels', 'Info', 'Photos', 'Modifier']);
      expect(screen.getByText(`Arroser (${kind})`)).toBeInTheDocument();
      expect(screen.getByRole('option', { name: `Pailler (${kind})` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Lier la tâche/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
    });

    test('prof : liaison d’une tâche → rappel et message', async () => {
      const { handlers } = renderModal(kind, { isTeacher: true });
      fireEvent.change(screen.getByRole('combobox'), { target: { value: `${kind}-t2` } });
      fireEvent.click(screen.getByRole('button', { name: /Lier la tâche/ }));
      await waitFor(() => expect(handlers.onLinkTask).toHaveBeenCalledWith(`${kind}-t2`));
      expect(await screen.findByText(K.linkedToast)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Délier' }));
      await waitFor(() => expect(handlers.onUnlinkTask).toHaveBeenCalled());
      expect(await screen.findByText('Tâche dissociée')).toBeInTheDocument();
    });

    test('prof : onglet Tutoriels (liés, liaison)', async () => {
      const { handlers } = renderModal(kind, { isTeacher: true });
      clickTab('Tutoriels');
      expect(screen.getByText(`Tuto lié (${kind})`)).toBeInTheDocument();
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '72' } });
      fireEvent.click(screen.getByRole('button', { name: /Lier le tutoriel/ }));
      await waitFor(() => expect(handlers.onLinkTutorial).toHaveBeenCalledWith('72'));
    });

    test('élève : onglets de consultation, inscription groupée', async () => {
      const { handlers } = renderModal(kind, { student: STUDENT });
      expect(tabLabels()).toEqual(['Tâches', 'Tutoriels', 'Info', 'Photos']);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      const assign = screen.getByRole('button', { name: /M'inscrire à 1 tâche/ });
      fireEvent.click(assign);
      await waitFor(() => expect(handlers.onAssignTasks).toHaveBeenCalledWith([`${kind}-t1`]));
      expect(await screen.findByText('1 tâche(s) prise(s) en charge ✓')).toBeInTheDocument();
    });

    test('élève : échec partiel d’inscription → message détaillé', async () => {
      const { handlers } = renderModal(kind, {
        student: STUDENT,
        onAssignTasks: vi.fn(async () => ({
          assignedCount: 0,
          failedCount: 1,
          firstError: 'Complet',
        })),
      });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /M'inscrire à 1 tâche/ }));
      expect(await screen.findByText('1 échec(s) : Complet')).toBeInTheDocument();
      expect(handlers.onAssignTasks).not.toHaveBeenCalled();
    });

    test('visiteur sans tâche visible : onglet Info par défaut', () => {
      renderModal(kind, { tasks: [], tutorials: [] });
      expect(tabLabels()).toEqual(['Info', 'Photos']);
      expect(screen.getByText(K.textField, { exact: false })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Fiche/ })).toBeInTheDocument();
      const comments = screen.getByTestId('context-comments');
      expect(comments).toHaveTextContent(K.commentsTitle);
      expect(comments).toHaveAttribute('data-open', 'false');
    });

    test('Info : lieu vide → message d’absence d’information', () => {
      const empty = {
        ...K.entity,
        description: '',
        note: '',
        links: [],
        notes: [],
        history: [],
        living_beings_list: [],
        species_ids: [],
      };
      renderModal(kind, { [K.entityProp]: empty, tasks: [], tutorials: [] });
      expect(screen.getByText(/aucune information pour l/i)).toBeInTheDocument();
    });

    test('commentaires ciblés : ouverture sur l’onglet Info', () => {
      renderModal(kind, { isTeacher: true, focusComments: true });
      expect(screen.getByTestId('context-comments')).toHaveAttribute('data-open', 'true');
      expect(screen.getByText(K.textField, { exact: false })).toBeInTheDocument();
    });

    test('raccourci vers l’onglet Tâches filtré sur le lieu', () => {
      const { handlers } = renderModal(kind, { isTeacher: true });
      fireEvent.click(screen.getByRole('button', { name: K.navigateLabel }));
      expect(handlers.onNavigateToTasksForLocation).toHaveBeenCalledWith({
        kind,
        id: K.entity.id,
      });
      expect(handlers.onClose).toHaveBeenCalled();
    });

    test('onglet Photos : galerie du lieu', () => {
      renderModal(kind, { isTeacher: true });
      clickTab('Photos');
      expect(screen.getByTestId('photo-gallery')).toHaveTextContent(`${kind}:${K.entity.id}`);
    });

    test('prof : suppression confirmée', async () => {
      const { handlers } = renderModal(kind, { isTeacher: true });
      fireEvent.click(
        screen.getByRole('button', {
          name: kind === 'zone' ? 'Supprimer la zone' : /Supprimer le repère/,
        }),
      );
      await waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith(K.entity.id));
      expect(handlers.onClose).toHaveBeenCalled();
    });

    test('prof : onglet Modifier → enregistrement', async () => {
      const { handlers } = renderModal(kind, { isTeacher: true });
      clickTab('Modifier');
      // Le formulaire reprend les liens documentaires du lieu (et non les actions de
      // liaison de tâches, homonymes dans la modale).
      expect(screen.getByDisplayValue(K.entity.links[0].url)).toBeInTheDocument();
      expect(screen.getByDisplayValue(K.entity.links[0].label)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: K.saveLabel }));
      await waitFor(() => expect(handlers.onUpdate).toHaveBeenCalledTimes(1));
      const [id, payload] = handlers.onUpdate.mock.calls[0];
      expect(id).toBe(K.entity.id);
      expect(payload).toEqual(
        expect.objectContaining({
          living_beings: K.entity.living_beings_list,
          category_ids: [],
        }),
      );
      expect(await screen.findByText('Sauvegardé ✓')).toBeInTheDocument();
    });
  });
}

describe('ZoneInfoModal — spécificités', () => {
  test('l’historique des cultures n’est plus affiché (piste C, retrait de zone_history)', () => {
    // Avant : section « Historique cultures » dans l'onglet Info. La zone en cache peut encore
    // porter un `history` : il n'est plus lu.
    renderModal('zone', { tasks: [], tutorials: [] });
    expect(screen.queryByText('Historique cultures')).toBeNull();
    expect(screen.queryByText('Radis')).toBeNull();
  });
});

describe('MarkerModal — spécificités', () => {
  test('nouveau repère (prof) : formulaire de placement', () => {
    const onSave = vi.fn(async () => {});
    renderModal('marker', {
      isTeacher: true,
      marker: { x_pct: 5, y_pct: 6, label: '', note: '', emoji: '🌱', map_id: 'foret' },
      onSave,
    });
    expect(screen.getByRole('dialog', { name: 'Nouveau repère' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Placer/ })).toBeInTheDocument();
  });

  test('nouveau repère (élève) : création réservée', () => {
    renderModal('marker', {
      marker: { x_pct: 5, y_pct: 6, label: '', note: '', emoji: '🌱', map_id: 'foret' },
    });
    expect(screen.getByText('Création de repère réservée au professeur.')).toBeInTheDocument();
  });

  test('prof : ajuster la position depuis l’onglet Modifier', () => {
    const onRequestAdjustMarkerPosition = vi.fn();
    const { handlers } = renderModal('marker', { isTeacher: true, onRequestAdjustMarkerPosition });
    clickTab('Modifier');
    fireEvent.click(screen.getByRole('button', { name: /Ajuster la position/ }));
    expect(onRequestAdjustMarkerPosition).toHaveBeenCalled();
    expect(handlers.onClose).toHaveBeenCalled();
  });
});
