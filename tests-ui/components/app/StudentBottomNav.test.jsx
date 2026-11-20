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

/** Libellés des onglets visibles (tous pôles confondus) pour un jeu de props. */
const labels = (overrides = {}) =>
  buildStudentNavItems({ ...baseProps, ...overrides }).map((item) => item.label);

describe('StudentBottomNav — quatre pôles (lot 6, U10)', () => {
  test('ordinateur : pôles + onglets du pôle actif, aria-current sur l’onglet et le pôle', () => {
    const onTabChange = vi.fn();
    render(<StudentBottomNav {...baseProps} onTabChange={onTabChange} />);
    const poles = screen.getByRole('group', { name: 'Pôles' });
    for (const name of ['Terrain', 'Vivant', 'Apprendre', 'Moi']) {
      expect(within(poles).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(poles).getByRole('button', { name: 'Terrain' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    const tabs = screen.getByRole('group', { name: 'Onglets Terrain' });
    expect(within(tabs).getByRole('button', { name: 'Carte' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('button', { name: 'Tâches · tuto' })).toBeInTheDocument();
    expect(within(tabs).getByRole('button', { name: 'Visite' })).toBeInTheDocument();
    // Onglets des autres pôles absents de la rangée.
    expect(screen.queryByRole('button', { name: 'Forum' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Biodiversité' })).toBeNull();
    // Cliquer un pôle ouvre son premier onglet.
    fireEvent.click(within(poles).getByRole('button', { name: 'Vivant' }));
    expect(onTabChange).toHaveBeenCalledWith('plants');
    fireEvent.click(within(poles).getByRole('button', { name: 'Moi' }));
    expect(onTabChange).toHaveBeenCalledWith('notebook');
  });

  test('le pôle actif suit l’onglet courant (rien n’est persisté)', () => {
    const onTabChange = vi.fn();
    const { rerender } = render(<StudentBottomNav {...baseProps} tab="glossary" />);
    expect(screen.getByRole('button', { name: 'Apprendre' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Glossaire' })).toHaveClass('active');
    rerender(<StudentBottomNav {...baseProps} tab="about" onTabChange={onTabChange} />);
    expect(screen.getByRole('button', { name: 'Moi' })).toHaveAttribute('aria-current', 'true');
    // Recliquer le pôle actif ne change pas d'onglet.
    fireEvent.click(screen.getByRole('button', { name: 'Moi' }));
    expect(onTabChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'À propos' }));
    expect(onTabChange).toHaveBeenCalledWith('about');
  });

  test('Vivant : une icône propre pour Groupes et Individus', () => {
    render(<StudentBottomNav {...baseProps} tab="plants" />);
    const tabs = screen.getByRole('group', { name: 'Onglets Vivant' });
    const iconOf = (name) =>
      within(tabs).getByRole('button', { name }).querySelector('svg').getAttribute('class');
    const biodiv = iconOf('Biodiversité');
    expect(iconOf('Groupes')).not.toBe(biodiv);
    expect(iconOf('Individus')).not.toBe(biodiv);
    expect(iconOf('Groupes')).not.toBe(iconOf('Individus'));
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
    const tabs = screen.getByRole('group', { name: 'Onglets Terrain' });
    expect(within(tabs).getAllByRole('button')[0]).toHaveTextContent('Visite');
    expect(labels({ canAccessStudentMapTasks: false, isVisitor: true })[0]).toBe('Visite');
    expect(screen.queryByText('Carte')).toBeNull();
    expect(screen.queryByText(/Tâches/)).toBeNull();
  });

  test('sans accès carte/tâches ni visite : le pôle Terrain disparaît', () => {
    render(
      <StudentBottomNav
        {...baseProps}
        canAccessStudentMapTasks={false}
        visitEnabled={false}
        shouldUseDesktopSplit
        tab="plants"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Terrain' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Biodiversité' })).toBeInTheDocument();
    const all = labels({
      canAccessStudentMapTasks: false,
      visitEnabled: false,
      shouldUseDesktopSplit: true,
    });
    expect(all).not.toContain('Carte');
    expect(all.some((l) => /Tâches|Cartes & tâches/.test(l))).toBe(false);
  });

  test('onglet inconnu : premier pôle disponible', () => {
    render(<StudentBottomNav {...baseProps} tab="settings" />);
    expect(screen.getByRole('button', { name: 'Terrain' })).toHaveAttribute('aria-current', 'true');
  });

  test('F3 : Tâches et Tuto restent des onglets séparés (plus de fusion contextuelle)', () => {
    render(<StudentBottomNav {...baseProps} canAccessTutorials tab="tuto" />);
    expect(screen.getByText('Tuto')).toBeInTheDocument();
    expect(screen.getByText('Tuto')).toHaveClass('active');
    expect(screen.queryByText('Tâches&tuto')).toBeNull();
  });

  test('parcours type visiteur : tuto + stats + classe sans carte', () => {
    const all = labels({
      canAccessStudentMapTasks: false,
      isVisitor: true,
      canAccessTutorials: true,
      canViewGeneralStats: true,
      canAccessProfiles: true,
      profilesLabel: 'Classe',
    });
    expect(all).not.toContain('Carte');
    expect(all).toEqual(expect.arrayContaining(['Tuto', 'Stats', 'Classe']));
  });

  test('modules coupés → Carnet/Visite/Forum/Tuto masqués, Stats visible avec le droit', () => {
    const all = labels({
      tutorialsModuleEnabled: false,
      observationsEnabled: false,
      visitEnabled: false,
      canAccessForum: false,
      canViewGeneralStats: true,
    });
    for (const absent of ['Tuto', 'Carnet', 'Visite', 'Forum']) expect(all).not.toContain(absent);
    expect(all).toEqual(expect.arrayContaining(['Stats', 'Tâches']));
  });

  test('modules pédagogiques coupés → Clés / Séances / Individus masqués', () => {
    expect(labels()).toEqual(expect.arrayContaining(['Clés', 'Séances', 'Individus']));
    const off = labels({
      idKeysEnabled: false,
      pedagoSessionsEnabled: false,
      individualsEnabled: false,
    });
    for (const absent of ['Clés', 'Séances', 'Individus']) expect(off).not.toContain(absent);
    // Les onglets voisins ne sont pas entraînés.
    expect(off).toEqual(expect.arrayContaining(['Biodiversité', 'Réseau']));
  });

  test('chaque interrupteur ne masque que son onglet', () => {
    const ids = (overrides) =>
      buildStudentNavItems({ ...baseProps, ...overrides }).map((item) => item.id);
    expect(ids({})).toEqual(
      expect.arrayContaining(['id-keys', 'sessions', 'individuals', 'fresque']),
    );
    expect(ids({ fresqueEnabled: false })).not.toContain('fresque');
    expect(ids({ fresqueEnabled: false })).toContain('sessions');
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
        <StudentBottomNav {...baseProps} individualsEnabled tab="plants" />
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

    // Pas de rangée de pôles en mobile : primaires + Plus.
    expect(screen.queryByRole('group', { name: 'Pôles' })).toBeNull();

    fireEvent.click(within(nav).getByRole('button', { name: /Plus d'onglets/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Navigation' });
    // Feuille groupée par pôles, dans l'ordre ; le groupe du pôle actif est marqué.
    const groups = within(sheet).getAllByRole('region');
    expect(groups.map((g) => g.getAttribute('aria-current'))).toEqual(['true', null, null, null]);
    expect(
      within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent.trim()),
    ).toEqual(['Terrain', 'Vivant', 'Apprendre', 'Moi']);
    const me = within(sheet).getByRole('group', { name: 'Moi' });
    expect(within(me).getByRole('button', { name: 'Forum' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Carte' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(within(me).getByRole('button', { name: 'Forum' }));
    expect(onTabChange).toHaveBeenCalledWith('forum');
  });

  test('point non lu sur Forum : reporté sur le pôle Moi, puis sur l’onglet', () => {
    const { rerender } = render(<StudentBottomNav {...baseProps} />);
    expect(screen.queryByRole('img', { name: 'Nouveaux messages' })).toBeNull();
    rerender(<StudentBottomNav {...baseProps} hasForumUnread />);
    const pole = screen.getByRole('button', { name: /Moi/ });
    expect(within(pole).getByRole('img', { name: 'Nouveaux messages' })).toBeInTheDocument();
    rerender(<StudentBottomNav {...baseProps} hasForumUnread tab="forum" />);
    const forumBtn = screen.getByRole('button', { name: /^Forum/ });
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
