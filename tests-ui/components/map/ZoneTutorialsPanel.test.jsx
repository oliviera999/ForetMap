import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ZoneTutorialsStudentPanel,
  ZoneTutorialsTeacherPanel,
} from '../../../src/components/map/ZoneTutorialsPanel.jsx';

describe('ZoneTutorialsTeacherPanel', () => {
  const baseProps = {
    linkedTutorialsDirect: [],
    tutorialsOnlyViaTasks: [],
    assignableTutorials: [{ id: 7, title: 'Tuto compost' }],
    linkTutorialId: '',
    onChangeLinkTutorialId: () => {},
    onUnlinkTutorial: () => {},
    onLinkTutorial: () => {},
  };

  test('état vide → message « Aucun tutoriel lié »', () => {
    render(<ZoneTutorialsTeacherPanel {...baseProps} />);
    expect(screen.getByText('Aucun tutoriel lié à cette zone.')).toBeTruthy();
  });

  test('liste les tutoriels directs et « Délier » appelle onUnlinkTutorial', () => {
    const onUnlink = vi.fn();
    render(
      <ZoneTutorialsTeacherPanel
        {...baseProps}
        linkedTutorialsDirect={[{ id: 1, title: 'Tuto A' }]}
        onUnlinkTutorial={onUnlink}
      />,
    );
    expect(screen.getByText('Tuto A')).toBeTruthy();
    fireEvent.click(screen.getByText('Délier'));
    expect(onUnlink).toHaveBeenCalledWith({ id: 1, title: 'Tuto A' });
  });

  test('bouton « Lier » désactivé tant que linkTutorialId vide, actif sinon', () => {
    const onLink = vi.fn();
    const { rerender } = render(<ZoneTutorialsTeacherPanel {...baseProps} onLinkTutorial={onLink} />);
    expect(screen.getByText('🔗 Lier le tutoriel').disabled).toBe(true);
    rerender(<ZoneTutorialsTeacherPanel {...baseProps} linkTutorialId="7" onLinkTutorial={onLink} />);
    const btn = screen.getByText('🔗 Lier le tutoriel');
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onLink).toHaveBeenCalledWith('7');
  });

  test('tutoriels rattachés via tâches affichés sans bouton délier', () => {
    render(
      <ZoneTutorialsTeacherPanel
        {...baseProps}
        tutorialsOnlyViaTasks={[{ id: 2, title: 'Tuto mission' }]}
      />,
    );
    expect(screen.getByText('Tuto mission')).toBeTruthy();
    expect(screen.queryByText('Délier')).toBeNull();
  });
});

describe('ZoneTutorialsStudentPanel', () => {
  test('état vide → message zone', () => {
    render(<ZoneTutorialsStudentPanel tutorials={[]} zoneId={1} onOpenTutorialPreview={() => {}} />);
    expect(screen.getByText('Aucun tutoriel lié à cette zone.')).toBeTruthy();
  });

  test('rend les fiches tutoriel visibles', () => {
    render(
      <ZoneTutorialsStudentPanel
        tutorials={[{ id: 3, title: 'Tuto visible', summary: 'Résumé' }]}
        zoneId={1}
        onOpenTutorialPreview={() => {}}
      />,
    );
    expect(screen.getByText('Tuto visible')).toBeTruthy();
    expect(screen.getByText('Résumé')).toBeTruthy();
  });
});
