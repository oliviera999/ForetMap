import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeacherTopTabs } from '../../../src/components/app/TeacherTopTabs.jsx';

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
  hasPermission: () => false,
  hasPermissionInRole: () => false,
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
    expect(onTabChange).toHaveBeenCalledWith('tasks');
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

  test('modules coupés → onglets stats/visite/forum/tuto masqués', () => {
    render(
      <TeacherTopTabs
        {...baseProps}
        tutorialsModuleEnabled={false}
        statsEnabled={false}
        visitEnabled={false}
        canAccessForum={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Tuto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Visite' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Packs mascotte' })).toBeNull();
  });

  test('F3 : Tâches et Tuto restent des onglets séparés (plus de fusion contextuelle)', () => {
    render(<TeacherTopTabs {...baseProps} tab="tuto" />);
    expect(screen.getByRole('button', { name: 'Tuto' })).toHaveClass('active');
    // Sans module tutoriels, l'onglet Tâches (pôle Suivi) redevient « Tâches ».
    render(<TeacherTopTabs {...baseProps} tab="tasks" tutorialsModuleEnabled={false} />);
    expect(screen.getByRole('button', { name: 'Tâches' })).toHaveClass('active');
  });
});
