import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Le composant lit le jeton et résout l'URL via le service API : on neutralise le
// stockage local et la base d'URL pour ne tester que le comportement du composant.
const apiMock = vi.fn();
vi.mock('../src/services/api', () => ({
  getAuthToken: () => 'jeton-test',
  withAppBase: (path) => path,
  api: (...args) => apiMock(...args),
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

  test('seul le README reste un lien public ; la documentation technique n’est plus exposée', () => {
    const { container } = render(<AboutView appVersion="1.0.0" />);
    expect(container.querySelector('a[href="/README.md"]')).not.toBeNull();
    expect(container.querySelector('a[href="/docs/API.md"]')).toBeNull();
    expect(container.querySelector('a[href="/CHANGELOG.md"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'CHANGELOG' })).toBeNull();
  });

  test('avec le droit, le CHANGELOG est récupéré avec le jeton', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => '# Journal' });
    render(<AboutView appVersion="1.0.0" canReadSiteIssues />);

    fireEvent.click(screen.getByRole('button', { name: 'CHANGELOG' }));

    await waitFor(() => {
      expect(screen.getByText(/Journal/)).toBeTruthy();
    });
    expect(global.fetch).toHaveBeenCalledWith('/CHANGELOG.md', {
      headers: { Authorization: 'Bearer jeton-test' },
    });
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

  test('sans le droit, pas de carte « Guide du prof »', () => {
    render(<AboutView appVersion="1.0.0" />);
    expect(screen.queryByTestId('about-teacher-guide')).toBeNull();
  });

  test('un n3boss voit la carte « Guide du prof » et son sommaire', async () => {
    apiMock.mockResolvedValue({
      docs: [{ slug: 'guide-du-prof', title: 'Guide du prof (n3boss)', summary: 'Pratique.' }],
    });
    render(<AboutView appVersion="1.0.0" canReadTeacherGuide />);
    expect(screen.getByRole('heading', { name: 'Guide du prof' })).toBeTruthy();
    expect(await screen.findByText('Guide du prof (n3boss)')).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith('/api/admin/reference-docs');
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

describe('AboutView — crédits des avatars par défaut (licence CC BY 4.0)', () => {
  test('tout lecteur voit l’attribution : œuvre, autrice, licence et bibliothèque', () => {
    const { container } = render(<AboutView appVersion="1.0.0" />);
    const card = screen.getByTestId('about-credits');
    expect(card.textContent).toMatch(/Adventurer Neutral/);
    expect(card.textContent).toMatch(/Lisa Wischofsky/);
    expect(card.textContent).toMatch(/CC BY 4\.0/);
    expect(card.textContent).toMatch(/DiceBear/);
    const hrefs = [...card.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://www.figma.com/community/file/1184595184137881796');
    expect(hrefs).toContain('https://creativecommons.org/licenses/by/4.0/deed.fr');
    for (const a of card.querySelectorAll('a')) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toMatch(/noopener/);
    }
    // Une mention, pas un chargement : aucune image ni script tiers dans la page.
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('src') || '').not.toMatch(/^https?:/);
    }
  });
});
