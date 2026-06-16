import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GLGameMasterConsoleActiveGameBanner from '../../src/gl/components/mj/GLGameMasterConsoleActiveGameBanner.jsx';

const baseForm = {
  name: 'Partie active',
  chapterId: '1',
  classId: '1',
  zoneContentRetrigger: '',
  loreFeuilletRetrigger: '',
  loreEffacementEnabled: '',
  loreGemmeCostsEnabled: '',
  loreHeartRewardsEnabled: '',
};

function renderBanner(overrides = {}) {
  const props = {
    game: { id: 42, name: 'Partie active' },
    gameStatus: 'draft',
    activeClassLabel: '6e A',
    activeChapterTitle: 'Chapitre test',
    teams: [{ id: 1 }, { id: 2 }],
    chapters: [{ id: 1, title: 'Chapitre test' }],
    activeClasses: [{ id: 1, name: '6e A' }],
    editGameForm: baseForm,
    setEditGameForm: vi.fn(),
    setStatus: vi.fn(),
    saveGameEdits: vi.fn((event) => event?.preventDefault?.()),
    busy: false,
    ...overrides,
  };
  return { props, ...render(<GLGameMasterConsoleActiveGameBanner {...props} />) };
}

describe('GLGameMasterConsoleActiveGameBanner', () => {
  beforeEach(() => vi.clearAllMocks());

  test('ne rend rien sans partie chargée', () => {
    const { container } = render(
      <GLGameMasterConsoleActiveGameBanner game={null} teams={[]} editGameForm={baseForm} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('affiche le titre, la classe, le chapitre et le décompte d’équipes', () => {
    renderBanner();
    expect(screen.getByText('Partie active')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getAllByText('6e A').length).toBeGreaterThan(0);
    expect(screen.getByText('2 équipes')).toBeInTheDocument();
  });

  test('singulier pour une seule équipe', () => {
    renderBanner({ teams: [{ id: 1 }] });
    expect(screen.getByText('1 équipe')).toBeInTheDocument();
  });

  test('le cycle de vie appelle setStatus avec la bonne action', () => {
    const { props } = renderBanner();
    fireEvent.click(screen.getByText('Démarrer'));
    expect(props.setStatus).toHaveBeenCalledWith('start');
  });

  test('démarrer désactivé pour une partie en cours', () => {
    renderBanner({ gameStatus: 'live' });
    expect(screen.getByText('Démarrer').closest('button')).toBeDisabled();
    expect(screen.getByText('Terminer').closest('button')).not.toBeDisabled();
  });

  test('chapitre et classe verrouillés hors brouillon/pause', () => {
    renderBanner({ gameStatus: 'live' });
    expect(screen.getByText(/Chapitre modifiable uniquement/)).toBeInTheDocument();
    expect(screen.getByText(/Classe modifiable uniquement/)).toBeInTheDocument();
  });

  test('soumettre le formulaire appelle saveGameEdits', () => {
    const { props } = renderBanner();
    fireEvent.click(screen.getByText('Enregistrer la partie'));
    expect(props.saveGameEdits).toHaveBeenCalled();
  });

  test('éditer le nom remonte vers setEditGameForm', () => {
    const { props } = renderBanner();
    const input = screen.getByDisplayValue('Partie active');
    fireEvent.change(input, { target: { value: 'Nouveau nom' } });
    expect(props.setEditGameForm).toHaveBeenCalled();
  });
});
