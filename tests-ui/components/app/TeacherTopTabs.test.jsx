import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeacherTopTabs } from '../../../src/components/app/TeacherTopTabs.jsx';

const baseProps = {
  tab: 'map',
  onTabChange: () => {},
  shouldUseDesktopSplit: false,
  mapTasksSplitLabel: '🗺️ Cartes & tâches',
  tasksTabLabel: '✅ Tâches',
  teacherPendingValidationCount: 0,
  tutorialsModuleEnabled: true,
  statsEnabled: true,
  visitEnabled: true,
  canAccessForum: true,
  isN3Affiliated: false,
  hasPermission: () => false,
  hasPermissionInRole: () => false,
};

describe('TeacherTopTabs', () => {
  test('rend les onglets de base, marque l’actif et notifie le clic', () => {
    const onTabChange = vi.fn();
    render(<TeacherTopTabs {...baseProps} onTabChange={onTabChange} />);
    expect(screen.getByText('🗺️ Carte & Zones')).toHaveClass('active');
    expect(screen.getByText('📘 Tuto')).toBeInTheDocument();
    expect(screen.getByText('💬 Forum')).toBeInTheDocument();
    // Sans permissions : pas d’onglets admin, pas d’onglet split.
    expect(screen.queryByText(/Profils & utilisateurs/)).toBeNull();
    expect(screen.queryByText('⚙️ Paramètres')).toBeNull();
    expect(screen.queryByText('📜 Audit')).toBeNull();
    expect(screen.queryByText(/Cartes & tâches/)).toBeNull();
    fireEvent.click(screen.getByText('🌱 Biodiversité'));
    expect(onTabChange).toHaveBeenCalledWith('plants');
  });

  test('affiche le compteur « à valider » sur Tâches et l’onglet split', () => {
    render(
      <TeacherTopTabs {...baseProps} shouldUseDesktopSplit teacherPendingValidationCount={3} />,
    );
    expect(screen.getByText('✅ Tâches (3 à valider)')).toBeInTheDocument();
    expect(screen.getByText('🗺️ Cartes & tâches (3 à valider)')).toBeInTheDocument();
  });

  test('les permissions ouvrent les onglets admin (terminologie N3 comprise)', () => {
    render(
      <TeacherTopTabs
        {...baseProps}
        isN3Affiliated
        hasPermission={(perm) => perm === 'audit.read'}
        hasPermissionInRole={(perm) =>
          perm === 'admin.roles.manage' || perm === 'admin.settings.read'
        }
      />,
    );
    expect(screen.getByText(/n3boss & utilisateurs/)).toBeInTheDocument();
    expect(screen.getByText('⚙️ Paramètres')).toBeInTheDocument();
    expect(screen.getByText('📜 Audit')).toBeInTheDocument();
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
    expect(screen.queryByText('📘 Tuto')).toBeNull();
    expect(screen.queryByText('📊 Stats')).toBeNull();
    expect(screen.queryByText('🧭 Visite')).toBeNull();
    expect(screen.queryByText('🎨 Packs mascotte')).toBeNull();
    expect(screen.queryByText('💬 Forum')).toBeNull();
  });

  test('F3 : Tâches et Tuto restent des onglets séparés (plus de fusion contextuelle)', () => {
    render(<TeacherTopTabs {...baseProps} tab="tuto" />);
    expect(screen.getByText('📘 Tuto')).toBeInTheDocument();
    expect(screen.getByText('📘 Tuto')).toHaveClass('active');
  });
});
