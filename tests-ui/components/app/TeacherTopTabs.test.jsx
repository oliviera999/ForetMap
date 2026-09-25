import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TeacherTopTabs } from '../../../src/components/app/TeacherTopTabs.jsx';
import { BiodivPedagoContext } from '../../../src/contexts/BiodivPedagoContext.jsx';

/**
 * Permissions d'un professeur complet. Depuis `feat(rbac): profil Prof de classe`, la
 * visibilité de CHAQUE onglet passe par `hasPermission` — un `() => false` ne rend plus
 * aucun onglet secondaire, et les assertions de cette suite portaient alors sur une rangée
 * vide. Le socle décrit donc un prof qui a ses droits ; les tests qui veulent l'inverse
 * surchargent `hasPermission` explicitement.
 *
 * `hasPermissionInRole` reste à `false` : les onglets d'administration ne s'ouvrent que
 * pour un rôle qui les porte, ce que le test dédié vérifie.
 */
const TEACHER_PERMISSIONS = new Set([
  'zones.manage',
  'map.manage_markers',
  'plants.manage',
  'tasks.manage',
  'tasks.validate',
  'visit.manage',
  'tutorials.manage',
  'media.manage',
  'teacher.access',
  'stats.read.all',
]);

const baseProps = {
  tab: 'map',
  onTabChange: () => {},
  shouldUseDesktopSplit: false,
  teacherPendingValidationCount: 0,
  tutorialsModuleEnabled: true,
  statsEnabled: true,
  visitEnabled: true,
  canAccessForum: true,
  isN3Affiliated: false,
  hasPermission: (perm) => TEACHER_PERMISSIONS.has(perm),
  hasPermissionInRole: () => false,
  layoutMode: 'full',
};

describe('TeacherTopTabs — navigation en 3 pôles (audit D-4)', () => {
  test('rend les pôles, les onglets du pôle actif, marque l’actif et notifie le clic', () => {
    const onTabChange = vi.fn();
    render(<TeacherTopTabs {...baseProps} onTabChange={onTabChange} />);
    // Les trois pôles sont là ; « Contenus » est actif (tab = map).
    expect(screen.getByRole('button', { name: 'Contenus' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Suivi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Administration' })).toBeInTheDocument();
    // Rangée secondaire = onglets du pôle Contenus uniquement.
    expect(screen.getByRole('button', { name: 'Carte & Zones' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Tuto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Forum' })).toBeNull(); // pôle Suivi
    // Sans permissions : pas d’onglet split, et le pôle Administration ne montre rien tant
    // qu'on n'y va pas — mais Profils/Paramètres n'existeraient pas non plus.
    expect(screen.queryByText(/Cartes & tâches/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Biodiversité' }));
    expect(onTabChange).toHaveBeenCalledWith('plants');
  });

  test('cliquer un pôle ouvre son premier onglet visible', () => {
    const onTabChange = vi.fn();
    render(<TeacherTopTabs {...baseProps} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivi' }));
    // Premier onglet visible du pôle Suivi : « Individus » depuis l'ajout de cette vue.
    expect(onTabChange).toHaveBeenCalledWith('individuals');
    fireEvent.click(screen.getByRole('button', { name: 'Administration' }));
    // Sans permissions admin, le premier onglet visible du pôle est « À propos ».
    expect(onTabChange).toHaveBeenCalledWith('about');
  });

  test('expose l’onglet Glossaire, comme la barre élève', () => {
    const onTabChange = vi.fn();
    render(<TeacherTopTabs {...baseProps} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Glossaire' }));
    expect(onTabChange).toHaveBeenCalledWith('glossary');
  });

  test('le compteur « à valider » devient un badge (pôle Suivi + onglet Tâches)', () => {
    render(
      <TeacherTopTabs
        {...baseProps}
        tab="tasks"
        shouldUseDesktopSplit
        teacherPendingValidationCount={3}
      />,
    );
    // Badge sur le pôle Suivi et sur l'onglet Tâches (pôle actif) : deux occurrences.
    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(screen.getAllByLabelText('3 à valider')).toHaveLength(2);
    // Le libellé n'est plus allongé par le suffixe.
    expect(screen.queryByText(/à valider\)/)).toBeNull();
  });

  test('point non lu du forum : sur le pôle Suivi, et sur l’onglet Forum quand il est visible', () => {
    const { rerender } = render(<TeacherTopTabs {...baseProps} hasForumUnread />);
    const tracking = screen.getByRole('button', { name: /Suivi/ });
    expect(within(tracking).getByRole('img', { name: 'Nouveaux messages' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Nouveaux messages' })).toHaveLength(1);

    rerender(<TeacherTopTabs {...baseProps} tab="stats" hasForumUnread />);
    const forum = screen.getByRole('button', { name: /Forum/ });
    expect(within(forum).getByRole('img', { name: 'Nouveaux messages' })).toBeInTheDocument();

    rerender(<TeacherTopTabs {...baseProps} tab="stats" />);
    expect(screen.queryByRole('img', { name: 'Nouveaux messages' })).toBeNull();
  });

  test('l’onglet split apparaît dans Contenus quand le grand écran le permet', () => {
    render(<TeacherTopTabs {...baseProps} tab="maptasks" shouldUseDesktopSplit />);
    expect(screen.getByRole('button', { name: 'Cartes, tâches et tuto' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Contenus' })).toHaveClass('active');
  });

  test('les permissions ouvrent les onglets admin (terminologie N3 comprise)', () => {
    render(
      <TeacherTopTabs
        {...baseProps}
        tab="settings"
        isN3Affiliated
        hasPermission={(perm) => perm === 'audit.read'}
        hasPermissionInRole={(perm) =>
          perm === 'admin.roles.manage' || perm === 'admin.settings.read'
        }
      />,
    );
    // tab=settings → pôle Administration actif : ses onglets sont rendus.
    expect(screen.getByText(/n3boss & utilisateurs/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paramètres' })).toHaveClass('active');
    // Audit vit dans le pôle Suivi : absent ici, mais le pôle sait l'ouvrir.
    expect(screen.queryByRole('button', { name: 'Audit' })).toBeNull();
  });

  test('modules coupés → onglets stats/visite/forum/tuto/carnet masqués', () => {
    render(
      <TeacherTopTabs
        {...baseProps}
        tutorialsModuleEnabled={false}
        statsEnabled={false}
        visitEnabled={false}
        observationsEnabled={false}
        canAccessForum={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Tuto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Visite' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Packs mascotte' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Carnet' })).toBeNull();
  });

  test('modules pédagogiques coupés → Clés d’identification / Séances / Individus masqués', () => {
    const { rerender } = render(<TeacherTopTabs {...baseProps} />);
    // Pôle Contenus (tab = map) : Clés et Séances présentes par défaut.
    expect(screen.getByRole('button', { name: 'Clés d’identification' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Séances' })).toBeInTheDocument();
    rerender(
      <TeacherTopTabs
        {...baseProps}
        idKeysEnabled={false}
        pedagoSessionsEnabled={false}
        individualsEnabled={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Clés d’identification' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Séances' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Biodiversité' })).toBeInTheDocument();

    // Pôle Suivi : « Individus » disparaît aussi de la rangée.
    rerender(<TeacherTopTabs {...baseProps} tab="stats" />);
    expect(screen.getByRole('button', { name: 'Individus' })).toBeInTheDocument();
    rerender(<TeacherTopTabs {...baseProps} tab="stats" individualsEnabled={false} />);
    expect(screen.queryByRole('button', { name: 'Individus' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stats' })).toBeInTheDocument();
  });

  test('Individus éteint : le pôle Suivi s’ouvre sur son premier onglet restant', () => {
    const onTabChange = vi.fn();
    render(<TeacherTopTabs {...baseProps} individualsEnabled={false} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivi' }));
    expect(onTabChange).toHaveBeenCalledWith('tasks');
  });

  test('Individus : niveau pédagogique ET interrupteur (masqué au collège même allumé)', () => {
    const collegeLevel = { canShow: (feature) => feature !== 'individuals_tab' };
    render(
      <BiodivPedagoContext.Provider value={collegeLevel}>
        <TeacherTopTabs {...baseProps} tab="stats" individualsEnabled />
      </BiodivPedagoContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: 'Individus' })).toBeNull();
  });

  test('expose l’onglet Carnet dans le pôle Suivi quand le module est actif', () => {
    const onTabChange = vi.fn();
    render(<TeacherTopTabs {...baseProps} tab="notebook" onTabChange={onTabChange} />);
    expect(screen.getByRole('button', { name: 'Suivi' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Carnet' })).toHaveClass('active');
    fireEvent.click(screen.getByRole('button', { name: 'Carnet' }));
    expect(onTabChange).toHaveBeenCalledWith('notebook');
  });

  test('chaque onglet est filtré par sa permission (profil « Prof de classe »)', () => {
    // Un tuteur limité à ses groupes : il suit ses élèves, il ne gère pas le catalogue.
    const profClasse = new Set(['tasks.validate', 'stats.read.group', 'teacher.access']);
    render(
      <TeacherTopTabs
        {...baseProps}
        hasPermission={(perm) => profClasse.has(perm)}
        onTabChange={() => {}}
      />,
    );
    // Pôle Contenus actif : seule la médiathèque survit (`teacher.access`).
    expect(screen.queryByRole('button', { name: 'Carte & Zones' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Biodiversité' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tuto' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Médiathèque' })).toBeInTheDocument();
    // Les trois pôles restent offerts : c'est leur contenu qui se réduit.
    expect(screen.getByRole('button', { name: 'Suivi' })).toBeInTheDocument();
  });

  test('F3 : Tâches et Tuto restent des onglets séparés (plus de fusion contextuelle)', () => {
    render(<TeacherTopTabs {...baseProps} tab="tuto" />);
    expect(screen.getByRole('button', { name: 'Tuto' })).toHaveClass('active');
    // Sans module tutoriels, l'onglet Tâches (pôle Suivi) redevient « Tâches ».
    render(<TeacherTopTabs {...baseProps} tab="tasks" tutorialsModuleEnabled={false} />);
    expect(screen.getByRole('button', { name: 'Tâches' })).toHaveClass('active');
  });

  test('mode compact : pôles seuls, onglets du pôle dans la feuille', async () => {
    const onTabChange = vi.fn();
    render(<TeacherTopTabs {...baseProps} layoutMode="compact" onTabChange={onTabChange} />);
    expect(screen.getByRole('navigation', { name: 'Navigation professeur' })).toHaveClass(
      'teacher-nav--compact',
    );
    expect(screen.queryByRole('button', { name: 'Carte & Zones' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Contenus' }));
    const sheet = await screen.findByRole('dialog', { name: 'Contenus' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Biodiversité' }));
    expect(onTabChange).toHaveBeenCalledWith('plants');
  });
});
