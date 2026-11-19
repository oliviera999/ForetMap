import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

/**
 * Montage de l'écran « Audit & Statistiques » (patron `AppShellWiring.test.jsx` : on monte
 * le composant pour attraper les erreurs de câblage invisibles au build) — journal enrichi,
 * bascule Principaux / Vue étendue, détail d'un événement, onglet Utilisateurs.
 */

const apiMock = vi.fn();
vi.mock('../src/services/api', () => ({
  getAuthToken: () => 'jeton-test',
  withAppBase: (path) => path,
  api: (...args) => apiMock(...args),
}));

import { AuditLog } from '../src/components/audit-views.jsx';
import { resetAuditCatalogCache } from '../src/components/audit/useAuditCatalog.js';
import {
  actorName,
  summarizeUserAgent,
  filtersToParams,
  dayGroupLabel,
} from '../src/components/audit/auditFormat.js';

const NOW = new Date().toISOString();

const EVENT = {
  id: 42,
  occurred_at: NOW,
  action: 'delete_task',
  action_label: 'Suppression tâche',
  category: 'tasks',
  category_label: 'Tâches & projets',
  major: true,
  failure: false,
  result: 'success',
  details: 'Arroser la mare',
  target_type: 'task',
  target_id: 't1',
  target_label: null,
  actor: { id: 'u1', name: 'Alice Martin', pseudo: 'alice', user_type: 'teacher', is_active: true },
  payload: { via: 'mcp', tool: 'foretmap_tasks' },
  via: 'mcp',
  on_behalf_of: null,
};

const LOGIN_FAIL = {
  id: 43,
  occurred_at: NOW,
  action: 'auth.login',
  action_label: 'Connexion',
  category: 'auth',
  category_label: 'Connexions & inscriptions',
  major: true,
  failure: true,
  result: 'failure',
  reason: 'password_invalid',
  reason_label: 'Mot de passe incorrect',
  actor: { id: 'u2', name: 'Bob Durand', pseudo: null, user_type: 'student', is_active: true },
  ip_address: '10.0.0.7',
  user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36',
  payload: null,
};

function routeApi(url) {
  if (url.startsWith('/api/audit/catalog')) {
    return Promise.resolve({
      categories: [
        { id: 'auth', label: 'Connexions & inscriptions' },
        { id: 'tasks', label: 'Tâches & projets' },
      ],
      actions: [],
    });
  }
  if (url.startsWith('/api/audit/history')) {
    return Promise.resolve({ from: '2026-01-01', to: '2026-12-31', total: 1, rows: [EVENT] });
  }
  if (url.startsWith('/api/audit/security')) {
    return Promise.resolve({ from: '2026-01-01', to: '2026-12-31', total: 1, rows: [LOGIN_FAIL] });
  }
  if (url.startsWith('/api/audit/users/u1')) {
    return Promise.resolve({
      source: 'security',
      user: { id: 'u1', name: 'Alice Martin', pseudo: 'alice', user_type: 'teacher' },
      totals: { total: 12, failures: 1, major: 5, targeted: 2 },
      by_category: [
        { category: 'tasks', category_label: 'Tâches & projets', count: 12, failures: 1 },
      ],
      top_actions: [
        { action: 'delete_task', action_label: 'Suppression tâche', count: 12, failures: 1 },
      ],
      ips: [{ ip_address: '10.0.0.1', count: 12, last_at: NOW, user_agent: 'Firefox/130.0' }],
    });
  }
  if (url.startsWith('/api/audit/users')) {
    return Promise.resolve({
      source: 'security',
      total: 1,
      rows: [
        {
          actor: EVENT.actor,
          total: 12,
          failures: 1,
          major_count: 5,
          last_at: NOW,
          last_login_at: NOW,
          top_actions: [{ action: 'delete_task', action_label: 'Suppression tâche', count: 12 }],
        },
      ],
    });
  }
  if (url.startsWith('/api/visit/stats')) return Promise.resolve({ kpis: {} });
  return Promise.reject(new Error(`URL inattendue ${url}`));
}

describe('Audit & Statistiques — journal enrichi', () => {
  beforeEach(() => {
    resetAuditCatalogCache();
    apiMock.mockReset();
    apiMock.mockImplementation(routeApi);
  });

  test('historique : nom de l’auteur, libellé, détail, vue principale par défaut', async () => {
    render(<AuditLog />);
    expect(await screen.findByText('Suppression tâche')).toBeTruthy();
    expect(screen.getByText('Alice Martin')).toBeTruthy();
    expect(screen.getByText(/Arroser la mare/)).toBeTruthy();
    const firstCall = apiMock.mock.calls
      .map((c) => c[0])
      .find((u) => u.startsWith('/api/audit/history'));
    expect(firstCall).toContain('mode=main');
    // Sans droit sécurité : pas d'onglet Sécurité, mais l'onglet Utilisateurs existe.
    expect(screen.queryByRole('tab', { name: /Sécurité/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Utilisateurs/ })).toBeTruthy();
  });

  test('bascule « Vue étendue » : relance la requête en mode all', async () => {
    render(<AuditLog />);
    await screen.findByText('Suppression tâche');
    fireEvent.click(screen.getByRole('radio', { name: 'Vue étendue' }));
    await waitFor(() => {
      expect(
        apiMock.mock.calls.some(
          (c) => c[0].includes('/api/audit/history') && c[0].includes('mode=all'),
        ),
      ).toBe(true);
    });
  });

  test('détail d’un événement : canal, données techniques, lien vers la fiche du compte', async () => {
    render(<AuditLog canReadSecurity />);
    fireEvent.click(await screen.findByRole('button', { name: /Suppression tâche/ }));
    expect(screen.getByText('via le connecteur Claude')).toBeTruthy();
    expect(screen.getByText('Données techniques')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Voir l’activité de Alice Martin/ }));
    expect(await screen.findByText('Actions les plus fréquentes')).toBeTruthy();
    expect(screen.getByText('10.0.0.1')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Utilisateurs/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  test('sécurité : échec signalé avec motif, IP et navigateur résumé', async () => {
    render(<AuditLog canReadSecurity />);
    fireEvent.click(screen.getByRole('tab', { name: /Sécurité/ }));
    const row = (await screen.findByText('Bob Durand')).closest('li');
    expect(within(row).getByText('Échec')).toBeTruthy();
    expect(within(row).getByText(/Mot de passe incorrect/)).toBeTruthy();
    expect(within(row).getByText(/IP 10\.0\.0\.7/)).toBeTruthy();
    expect(within(row).getByText(/Chrome · Windows/)).toBeTruthy();
  });

  test('utilisateurs : liste agrégée puis fiche au clic', async () => {
    render(<AuditLog canReadSecurity />);
    fireEvent.click(screen.getByRole('tab', { name: /Utilisateurs/ }));
    const row = await screen.findByRole('button', { name: /Alice Martin/ });
    expect(within(row).getByText(/Suppression tâche × 12/)).toBeTruthy();
    expect(
      apiMock.mock.calls.some(
        (c) => c[0].includes('/api/audit/users?') && c[0].includes('source=security'),
      ),
    ).toBe(true);
    fireEvent.click(row);
    expect(await screen.findByText('Par catégorie')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tous les utilisateurs/ })).toBeTruthy();
  });
});

describe('auditFormat — fonctions pures', () => {
  test('actorName : nom, pseudo, compte supprimé, sans compte', () => {
    expect(actorName({ id: 'x', name: 'Zoé' })).toBe('Zoé');
    expect(actorName({ id: 'x', pseudo: 'zz' })).toBe('zz');
    expect(actorName({ id: 'abcdef1234', deleted: true })).toMatch(/Compte supprimé/);
    expect(actorName(null)).toBe('Sans compte');
  });

  test('summarizeUserAgent', () => {
    expect(
      summarizeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17 Mobile Safari/604.1'),
    ).toBe('Safari · iOS');
    expect(summarizeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Firefox/130.0')).toBe(
      'Firefox · Linux',
    );
    expect(summarizeUserAgent('')).toBe('');
  });

  test('filtersToParams omet les valeurs vides', () => {
    expect(filtersToParams({ a: '', b: 'x', c: null }, { limit: 50 })).toBe('b=x&limit=50');
  });

  test('dayGroupLabel : aujourd’hui / hier', () => {
    const now = new Date(2026, 10, 19, 12);
    expect(dayGroupLabel(new Date(2026, 10, 19, 8), now)).toBe('Aujourd’hui');
    expect(dayGroupLabel(new Date(2026, 10, 18, 23), now)).toBe('Hier');
  });
});
