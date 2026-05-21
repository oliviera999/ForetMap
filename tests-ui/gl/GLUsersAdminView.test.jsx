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
});
