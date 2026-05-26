import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLUsersAdminView } from '../../src/gl/components/GLUsersAdminView.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  getGlToken: () => 'tok',
}));

vi.mock('../../src/services/api.js', () => ({
  withAppBase: (path) => path,
}));

describe('GLUsersAdminView', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['ok']),
      headers: { get: () => 'text/csv' },
    });
  });

  test('charge classes et joueurs au montage', async () => {
    apiGlMock
      .mockResolvedValueOnce([{ id: 1, name: '6e A', players_count: 1, is_active: 1 }])
      .mockResolvedValueOnce([{ id: 10, pseudo: 'team_a', class_id: 1, is_active: 1 }]);

    render(<GLUsersAdminView />);

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/admin/classes');
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/admin/players');
    });
    expect(screen.getByText('Gestion utilisateurs')).toBeInTheDocument();
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getAllByText('Joueurs').length).toBeGreaterThan(0);
  });

  test('filtre les joueurs par classe', async () => {
    apiGlMock
      .mockResolvedValueOnce([{ id: 1, name: '6e A', players_count: 1, is_active: 1 }])
      .mockResolvedValueOnce([{ id: 10, pseudo: 'team_a', class_id: 1, is_active: 1 }])
      .mockResolvedValueOnce([{ id: 1, name: '6e A', players_count: 1, is_active: 1 }])
      .mockResolvedValueOnce([{ id: 10, pseudo: 'team_a', class_id: 1, is_active: 1 }]);

    render(<GLUsersAdminView />);

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/admin/players');
    });
    fireEvent.change(screen.getByLabelText('Filtrer par classe'), { target: { value: '1' } });

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/admin/players?classId=1');
    });
  });

  test('permet la prise de contrôle joueur pour un admin GL strict', async () => {
    const onImpersonationApplied = vi.fn();
    apiGlMock.mockImplementation(async (path, method, body) => {
      if (path === '/api/gl/admin/classes') return [{ id: 1, name: '6e A', players_count: 1, is_active: 1 }];
      if (String(path).startsWith('/api/gl/admin/players')) return [{ id: 10, pseudo: 'team_a', class_id: 1, is_active: 1 }];
      if (path === '/api/gl/auth/admin/impersonate' && method === 'POST') {
        expect(body).toEqual({ userType: 'gl_player', userId: '10' });
        return { authToken: 'tok-imp', auth: { userType: 'gl_player', userId: '10', impersonating: true } };
      }
      return [];
    });

    render(<GLUsersAdminView auth={{ userType: 'gl_admin', roleSlug: 'gl_admin' }} onImpersonationApplied={onImpersonationApplied} />);

    const buttonLabels = await screen.findAllByText('Voir comme');
    fireEvent.click(buttonLabels[0].closest('button'));

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/auth/admin/impersonate', 'POST', { userType: 'gl_player', userId: '10' });
    });
    expect(onImpersonationApplied).toHaveBeenCalledTimes(1);
  });
});
