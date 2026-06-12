import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeacherObservationsPanel } from '../../../src/components/stats/TeacherObservationsPanel.jsx';

const ROLE_TERMS = { studentPlural: 'n3beurs', studentSingular: 'n3beur' };

describe('TeacherObservationsPanel', () => {
  test('état initial : invite à charger, bouton actif qui déclenche onLoad', () => {
    const onLoad = vi.fn();
    render(<TeacherObservationsPanel roleTerms={ROLE_TERMS} onLoad={onLoad} />);
    expect(screen.getByText('📓 Observations des n3beurs (max 100)')).toBeTruthy();
    expect(screen.getByText('Aucune observation chargée (clique sur le bouton pour rafraîchir).')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Charger les observations' }));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  test('chargement : bouton désactivé avec libellé dédié, pas de message vide', () => {
    render(<TeacherObservationsPanel roleTerms={ROLE_TERMS} obsLoading onLoad={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Chargement…' });
    expect(btn.disabled).toBe(true);
    expect(screen.queryByText(/Aucune observation chargée/)).toBeNull();
  });

  test('erreur affichée à la place du message vide', () => {
    render(<TeacherObservationsPanel roleTerms={ROLE_TERMS} obsError="Boum" onLoad={() => {}} />);
    expect(screen.getByText('⚠️ Boum')).toBeTruthy();
    expect(screen.queryByText(/Aucune observation chargée/)).toBeNull();
  });

  test('liste : nom, zone, contenu et tiret pour un contenu vide', () => {
    const observations = [
      { id: 1, first_name: 'Léa', last_name: 'Martin', zone_name: 'Mare', content: 'Têtards observés' },
      { id: 2, first_name: '', last_name: '', zone_name: '', content: '   ' },
    ];
    render(<TeacherObservationsPanel roleTerms={ROLE_TERMS} observations={observations} onLoad={() => {}} />);
    expect(screen.getByText('Léa Martin')).toBeTruthy();
    expect(screen.getByText(/· Mare/)).toBeTruthy();
    expect(screen.getByText('Têtards observés')).toBeTruthy();
    // Fallback nom + contenu vide → '—'
    expect(screen.getByText('n3beur')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
