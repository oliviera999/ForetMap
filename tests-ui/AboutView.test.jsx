import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Le composant lit le jeton et résout l'URL via le service API : on neutralise le
// stockage local et la base d'URL pour ne tester que le comportement du composant.
vi.mock('../src/services/api', () => ({
  getAuthToken: () => 'jeton-test',
  withAppBase: (path) => path,
}));
vi.mock('../src/hooks/useHelp', () => ({
  useHelp: () => ({ resetHelp() {}, metrics: {}, resetHelpMetrics() {} }),
}));

import { AboutView } from '../src/components/about-views.jsx';

describe('AboutView — rapports d’audit interne', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('sans le droit de lecture des réglages, aucun accès à SITE_ISSUES n’est proposé', () => {
    const { container } = render(<AboutView appVersion="1.0.0" />);
    expect(screen.queryByRole('button', { name: /SITE_ISSUES/ })).toBeNull();
    // Le défaut historique : un lien nu vers la route protégée, qui renvoyait
    // `401 {"error":"Token requis"}` dans un onglet — il ne doit plus exister.
    expect(container.querySelector('a[href="/api/site-issues"]')).toBeNull();
    expect(container.querySelector('a[href="/api/site-issues.json"]')).toBeNull();
  });

  test('les liens publics de documentation restent des liens ordinaires', () => {
    const { container } = render(<AboutView appVersion="1.0.0" />);
    expect(container.querySelector('a[href="/docs/API.md"]')).not.toBeNull();
    expect(container.querySelector('a[href="/CHANGELOG.md"]')).not.toBeNull();
  });

  test('avec le droit, le rapport est récupéré avec le jeton et affiché sur place', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '# Rapport interne\n- rien à signaler',
    });
    render(<AboutView appVersion="1.0.0" canReadSiteIssues />);

    fireEvent.click(screen.getByRole('button', { name: 'SITE_ISSUES' }));

    await waitFor(() => {
      expect(screen.getByText(/Rapport interne/)).toBeTruthy();
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/site-issues', {
      headers: { Authorization: 'Bearer jeton-test' },
    });
  });

  test('un refus affiche un message lisible, jamais le JSON brut de l’API', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 403, text: async () => '' });
    render(<AboutView appVersion="1.0.0" canReadSiteIssues />);

    fireEvent.click(screen.getByRole('button', { name: 'SITE_ISSUES JSON' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/droit de lecture des réglages/);
    expect(alert.textContent).not.toMatch(/Token requis/);
  });
});
