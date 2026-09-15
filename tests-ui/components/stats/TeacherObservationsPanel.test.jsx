import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeacherObservationsPanel } from '../../../src/components/stats/TeacherObservationsPanel.jsx';

const ROLE_TERMS = { studentPlural: 'n3beurs', studentSingular: 'n3beur' };

describe('TeacherObservationsPanel', () => {
  test('auto-load au montage et bouton rafraîchir', () => {
    const onLoad = vi.fn();
    render(<TeacherObservationsPanel roleTerms={ROLE_TERMS} onLoad={onLoad} />);
    expect(screen.getByText('Carnets des n3beurs (max 100 articles)')).toBeTruthy();
    expect(onLoad).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Rafraîchir les carnets' }));
    expect(onLoad).toHaveBeenCalledTimes(2);
  });

  test('chargement : bouton désactivé avec libellé dédié', () => {
    render(
      <TeacherObservationsPanel
        roleTerms={ROLE_TERMS}
        obsLoading
        onLoad={() => {}}
        autoLoad={false}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Chargement…' });
    expect(btn.disabled).toBe(true);
  });

  test('erreur affichée', () => {
    render(
      <TeacherObservationsPanel
        roleTerms={ROLE_TERMS}
        obsError="Boum"
        onLoad={() => {}}
        autoLoad={false}
      />,
    );
    expect(screen.getByText('Boum')).toBeTruthy();
  });

  test('liste regroupée : nom, zone, contenu et tiret pour un contenu vide', () => {
    const observations = [
      {
        id: 1,
        user_id: 10,
        first_name: 'Léa',
        last_name: 'Martin',
        zone_name: 'Mare',
        content: 'Têtards observés',
      },
      { id: 2, user_id: 11, first_name: '', last_name: '', zone_name: '', content: '   ' },
    ];
    render(
      <TeacherObservationsPanel
        roleTerms={ROLE_TERMS}
        observations={observations}
        onLoad={() => {}}
        autoLoad={false}
      />,
    );
    expect(screen.getByText('Léa Martin')).toBeTruthy();
    expect(screen.getByText(/· Mare/)).toBeTruthy();
    expect(screen.getByText('Têtards observés')).toBeTruthy();
    expect(screen.getByText('n3beur')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
