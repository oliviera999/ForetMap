import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ZoneInfoModal } from '../../../src/components/map/ZoneInfoModal.jsx';

vi.mock('../../../src/services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: vi.fn(() => Promise.reject(new Error('no detail fetch in test'))),
  };
});

vi.mock('../../../src/components/context-comments', () => ({
  ContextComments: ({ title, defaultOpen }) => (
    <div data-testid="context-comments" data-open={defaultOpen ? 'true' : 'false'}>
      {title}
    </div>
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

vi.mock('../../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({ confirm: vi.fn(async () => true) }),
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

vi.mock('../../../src/components/map/useLocationModalData.js', () => ({
  useLocationModalData: () => ({
    linkedTasks: [],
    studentAssignableTasks: [],
    assignableTasks: [],
    linkedTutorialsDirect: [],
    linkedTutorialsAll: [],
    tutorialsOnlyViaTasks: [],
    linkedTutorialsVisible: [],
    assignableTutorials: [],
    livingNames: [],
    livingBeingsOnlyOnTasks: [],
    visitAsideTutorials: [],
    visitAsideSpecies: [],
    visitAsideShortDesc: '',
    showVisitAsideBlock: false,
    showTasksTab: false,
    showTutorialsTab: false,
  }),
}));

const ZONE = {
  id: 'z-emoji-1',
  name: 'Bassins Est',
  emoji: '💧',
  color: '#4a7c59',
  description: '',
  living_beings: [],
  living_beings_list: [],
  category_ids: [],
  categories: [],
  hidden_surfaces: [],
  search_aliases: '',
  visible_role_slugs: [],
  visible_group_ids: [],
  links: [],
  notes: [],
};

function renderModal(props = {}) {
  return render(
    <ZoneInfoModal
      zone={ZONE}
      plants={[]}
      tasks={[]}
      tutorials={[]}
      isTeacher
      student={null}
      markerEmojis={['🌱']}
      emojiParsingList={['🌱']}
      onClose={vi.fn()}
      onUpdate={vi.fn()}
      {...props}
    />,
  );
}

describe('ZoneInfoModal — ouverture depuis une notification (messages du lieu)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('focusComments déplie les commentaires de la zone', () => {
    renderModal({ focusComments: true });
    const block = screen.getByTestId('context-comments');
    expect(block).toHaveTextContent('Commentaires de la zone');
    expect(block).toHaveAttribute('data-open', 'true');
  });

  test('sans focusComments, les commentaires restent repliés', () => {
    renderModal();
    expect(screen.getByTestId('context-comments')).toHaveAttribute('data-open', 'false');
  });
});
