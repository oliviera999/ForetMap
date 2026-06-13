import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StudentBottomNav } from '../../../src/components/app/StudentBottomNav.jsx';

const baseProps = {
  tab: 'map',
  onTabChange: () => {},
  canAccessStudentMapTasks: true,
  shouldUseDesktopSplit: false,
  tutorialsModuleEnabled: true,
  mergeTasksTutoNav: false,
  studentActiveAssignedTasksCount: 0,
  canViewGeneralStats: false,
  observationsEnabled: true,
  visitEnabled: true,
  canAccessForum: true,
};

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
      <StudentBottomNav
        {...baseProps}
        shouldUseDesktopSplit
        studentActiveAssignedTasksCount={2}
      />,
    );
    expect(screen.getByText('Cartes & tâches · tuto (2)')).toBeInTheDocument();
    expect(screen.getByText('Tâches · tuto (2)')).toBeInTheDocument();
  });

  test('sans accès carte/tâches → Carte et Tâches absents', () => {
    render(<StudentBottomNav {...baseProps} canAccessStudentMapTasks={false} shouldUseDesktopSplit />);
    expect(screen.queryByText('Carte')).toBeNull();
    expect(screen.queryByText(/Tâches/)).toBeNull();
    expect(screen.queryByText(/Cartes & tâches/)).toBeNull();
    expect(screen.getByText('Biodiversité')).toBeInTheDocument();
  });

  test('fusion tâches&tuto : bouton unique, actif aussi sur l’onglet tuto', () => {
    render(<StudentBottomNav {...baseProps} tab="tuto" mergeTasksTutoNav />);
    expect(screen.queryByText('Tuto')).toBeNull();
    expect(screen.getByText('Tâches&tuto')).toHaveClass('active');
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
});
