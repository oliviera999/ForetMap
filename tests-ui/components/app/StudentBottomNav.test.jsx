import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  StudentBottomNav,
  buildStudentNavItems,
} from '../../../src/components/app/StudentBottomNav.jsx';
import { resolveStudentMobilePrimaryIds } from '../../../src/constants/app-runtime.js';
import { BiodivPedagoContext } from '../../../src/contexts/BiodivPedagoContext.jsx';

const baseProps = {
  tab: 'map',
  onTabChange: () => {},
  canAccessStudentMapTasks: true,
  shouldUseDesktopSplit: false,
  tutorialsModuleEnabled: true,
  studentActiveAssignedTasksCount: 0,
  canViewGeneralStats: false,
  observationsEnabled: true,
  visitEnabled: true,
  canAccessForum: true,
  layoutMode: 'full',
};

describe('resolveStudentMobilePrimaryIds', () => {
  test('élève avec visite : map, tasks, plants, visit', () => {
    expect(
      resolveStudentMobilePrimaryIds({
        canAccessStudentMapTasks: true,
        visitEnabled: true,
        visibleIds: ['map', 'tasks', 'plants', 'quiz', 'visit', 'forum', 'about'],
      }),
    ).toEqual(['map', 'tasks', 'plants', 'visit']);
  });

  test('élève sans visite : quiz en repli', () => {
    expect(
      resolveStudentMobilePrimaryIds({
        canAccessStudentMapTasks: true,
        visitEnabled: false,
        visibleIds: ['map', 'tasks', 'plants', 'quiz', 'about'],
      }),
    ).toEqual(['map', 'tasks', 'plants', 'quiz']);
  });

  test('visiteur : visit, plants, quiz', () => {
    expect(
      resolveStudentMobilePrimaryIds({
        canAccessStudentMapTasks: false,
        visitEnabled: true,
        visibleIds: ['visit', 'plants', 'quiz', 'glossary', 'about'],
      }),
    ).toEqual(['visit', 'plants', 'quiz']);
  });
});

describe('StudentBottomNav', () => {
  test('rend les boutons de base, marque l’actif et notifie le clic', () => {
    const onTabChange = vi.fn();
    render(<StudentBottomNav {...baseProps} onTabChange={onTabChange} />);
    expect(screen.getByText('Carte')).toHaveClass('active');
    expect(screen.getByText('Tâches · tuto')).toBeInTheDocument();
    expect(screen.getByText('Carnet')).toBeInTheDocument();
    expect(screen.getByText('Visite')).toBeInTheDocument();
    expect(screen.getByText('Forum')).toBeInTheDocument();
    // Stats masquées sans droit, pas d’entrée split en mobile.
    expect(screen.queryByText('Stats')).toBeNull();
    expect(screen.queryByText(/Cartes & tâches/)).toBeNull();
    fireEvent.click(screen.getByText('À propos'));
    expect(onTabChange).toHaveBeenCalledWith('about');
  });

  test('split desktop : entrée combinée avec compteur de tâches assignées', () => {
    render(
      <StudentBottomNav {...baseProps} shouldUseDesktopSplit studentActiveAssignedTasksCount={2} />,
    );
    expect(screen.getByText('Cartes & tâches · tuto (2)')).toBeInTheDocument();
    expect(screen.getByText('Tâches · tuto (2)')).toBeInTheDocument();
  });

  test('visiteur : Visite en premier, pas de Carte/Tâches', () => {
    render(
      <StudentBottomNav {...baseProps} canAccessStudentMapTasks={false} isVisitor tab="visit" />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Visite');
    expect(screen.queryByText('Carte')).toBeNull();
    expect(screen.queryByText(/Tâches/)).toBeNull();
  });

  test('sans accès carte/tâches → Carte et Tâches absents', () => {
    render(
      <StudentBottomNav {...baseProps} canAccessStudentMapTasks={false} shouldUseDesktopSplit />,
    );
    expect(screen.queryByText('Carte')).toBeNull();
    expect(screen.queryByText(/Tâches/)).toBeNull();
    expect(screen.queryByText(/Cartes & tâches/)).toBeNull();
    expect(screen.getByText('Biodiversité')).toBeInTheDocument();
  });

  test('F3 : Tâches et Tuto restent des onglets séparés (plus de fusion contextuelle)', () => {
    render(<StudentBottomNav {...baseProps} canAccessTutorials tab="tuto" />);
    expect(screen.getByText('Tuto')).toBeInTheDocument();
    expect(screen.getByText('Tuto')).toHaveClass('active');
    expect(screen.queryByText('Tâches&tuto')).toBeNull();
  });

  test('parcours type visiteur : tuto + stats + classe sans carte', () => {
    render(
      <StudentBottomNav
        {...baseProps}
        canAccessStudentMapTasks={false}
        isVisitor
        canAccessTutorials
        canViewGeneralStats
        canAccessProfiles
        profilesLabel="Classe"
        tab="visit"
      />,
    );
    expect(screen.queryByText('Carte')).toBeNull();
    expect(screen.getByText('Tuto')).toBeInTheDocument();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Classe')).toBeInTheDocument();
  });

  test('modules coupés → Carnet/Visite/Forum/Tuto masqués, Stats visible avec le droit', () => {
    render(
      <StudentBottomNav
        {...baseProps}
        tutorialsModuleEnabled={false}
        observationsEnabled={false}
        visitEnabled={false}
        canAccessForum={false}
        canViewGeneralStats
      />,
    );
    expect(screen.queryByText('Tuto')).toBeNull();
    expect(screen.queryByText('Carnet')).toBeNull();
    expect(screen.queryByText('Visite')).toBeNull();
    expect(screen.queryByText('Forum')).toBeNull();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Tâches')).toBeInTheDocument();
  });

  test('modules pédagogiques coupés → Clés / Séances / Individus masqués', () => {
    const { rerender } = render(<StudentBottomNav {...baseProps} />);
    expect(screen.getByText('Clés')).toBeInTheDocument();
    expect(screen.getByText('Séances')).toBeInTheDocument();
    expect(screen.getByText('Individus')).toBeInTheDocument();
    rerender(
      <StudentBottomNav
        {...baseProps}
        idKeysEnabled={false}
        pedagoSessionsEnabled={false}
        individualsEnabled={false}
      />,
    );
    expect(screen.queryByText('Clés')).toBeNull();
    expect(screen.queryByText('Séances')).toBeNull();
    expect(screen.queryByText('Individus')).toBeNull();
    // Les onglets voisins ne sont pas entraînés.
    expect(screen.getByText('Biodiversité')).toBeInTheDocument();
    expect(screen.getByText('Réseau')).toBeInTheDocument();
  });

  test('chaque interrupteur ne masque que son onglet', () => {
    const ids = (overrides) =>
      buildStudentNavItems({ ...baseProps, ...overrides }).map((item) => item.id);
    expect(ids({})).toEqual(expect.arrayContaining(['id-keys', 'sessions', 'individuals']));
    expect(ids({ idKeysEnabled: false })).not.toContain('id-keys');
    expect(ids({ idKeysEnabled: false })).toEqual(
      expect.arrayContaining(['sessions', 'individuals']),
    );
    expect(ids({ pedagoSessionsEnabled: false })).not.toContain('sessions');
    expect(ids({ pedagoSessionsEnabled: false })).toContain('id-keys');
    expect(ids({ individualsEnabled: false })).not.toContain('individuals');
    expect(ids({ individualsEnabled: false })).toContain('sessions');
  });

  test('Individus : niveau pédagogique ET interrupteur, les deux doivent l’autoriser', () => {
    const ids = (overrides) =>
      buildStudentNavItems({ ...baseProps, ...overrides }).map((item) => item.id);
    expect(ids({ showIndividuals: true, individualsEnabled: true })).toContain('individuals');
    expect(ids({ showIndividuals: false, individualsEnabled: true })).not.toContain('individuals');
    expect(ids({ showIndividuals: true, individualsEnabled: false })).not.toContain('individuals');

    // Même règle vue du composant : niveau collège (`individuals_tab` refusé), module allumé.
    const collegeLevel = { canShow: (feature) => feature !== 'individuals_tab' };
    render(
      <BiodivPedagoContext.Provider value={collegeLevel}>
        <StudentBottomNav {...baseProps} individualsEnabled />
      </BiodivPedagoContext.Provider>,
    );
    expect(screen.queryByText('Individus')).toBeNull();
    expect(screen.getByText('Clés')).toBeInTheDocument();
  });

  test('mode compact : primaires + Plus, Forum via le tiroir', async () => {
    const onTabChange = vi.fn();
    render(
      <StudentBottomNav {...baseProps} layoutMode="compact" onTabChange={onTabChange} tab="map" />,
    );
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByText('Carte')).toBeInTheDocument();
    expect(within(nav).getByText('Tâches · tuto')).toBeInTheDocument();
    expect(within(nav).getByText('Biodiversité')).toBeInTheDocument();
    expect(within(nav).getByText('Visite')).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /Plus d'onglets/ })).toBeInTheDocument();
    expect(within(nav).queryByText('Forum')).toBeNull();

    fireEvent.click(within(nav).getByRole('button', { name: /Plus d'onglets/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Navigation' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Forum' }));
    expect(onTabChange).toHaveBeenCalledWith('forum');
  });

  test('point non lu sur Forum (barre complète)', () => {
    const { rerender } = render(<StudentBottomNav {...baseProps} />);
    expect(screen.queryByRole('img', { name: 'Nouveaux messages' })).toBeNull();
    rerender(<StudentBottomNav {...baseProps} hasForumUnread />);
    const forumBtn = screen.getByRole('button', { name: /Forum/ });
    expect(within(forumBtn).getByRole('img', { name: 'Nouveaux messages' })).toBeInTheDocument();
  });

  test('mode compact : point non lu reporté sur Plus puis sur Forum dans le tiroir', async () => {
    render(<StudentBottomNav {...baseProps} layoutMode="compact" tab="map" hasForumUnread />);
    const more = screen.getByRole('button', { name: /Plus d'onglets/ });
    expect(within(more).getByRole('img', { name: 'Nouveaux messages' })).toBeInTheDocument();
    fireEvent.click(more);
    const sheet = await screen.findByRole('dialog', { name: 'Navigation' });
    const forumBtn = within(sheet).getByRole('button', { name: /Forum/ });
    expect(within(forumBtn).getByRole('img', { name: 'Nouveaux messages' })).toBeInTheDocument();
  });

  test('mode compact : Plus actif quand l’onglet courant est hors primary', () => {
    render(<StudentBottomNav {...baseProps} layoutMode="compact" tab="about" />);
    const more = screen.getByRole('button', { name: /Plus d'onglets/ });
    expect(more).toHaveClass('active');
  });

  test('mode compact visiteur : visit, plants, quiz + Plus', () => {
    render(
      <StudentBottomNav
        {...baseProps}
        layoutMode="compact"
        canAccessStudentMapTasks={false}
        isVisitor
        tab="visit"
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByText('Visite')).toBeInTheDocument();
    expect(within(nav).getByText('Biodiversité')).toBeInTheDocument();
    expect(within(nav).getByText('Quiz')).toBeInTheDocument();
    expect(within(nav).queryByText('Carte')).toBeNull();
    expect(within(nav).getByRole('button', { name: /Plus d'onglets/ })).toBeInTheDocument();
  });
});
