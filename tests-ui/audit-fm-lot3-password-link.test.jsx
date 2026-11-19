// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { StudentProfileEditor } from '../src/components/stats-views.jsx';
import { invalidateVisitMascotCatalogExtras } from '../src/hooks/useVisitMascotCatalogExtras.js';
import { api } from '../src/services/api';

vi.mock('../src/services/api', () => ({ api: vi.fn() }));

/**
 * Audit ForetMap du 19/11/2026, lot 3 — A3 : pour un compte sans mot de passe (Google),
 * `POST /api/auth/me/password` ne change rien et répond `linkSent` ; « Mon profil » affiche
 * clairement « un lien vous a été envoyé » et ne touche pas à la session.
 */

const STUDENT = {
  id: 'stu-google',
  first_name: 'Lina',
  last_name: 'Google',
  email: 'lina@exemple.fr',
  pseudo: 'lina',
  auth: { userType: 'student', roleSlug: 'eleve_novice' },
};

const LINK_MESSAGE =
  'Un lien pour définir votre mot de passe vous a été envoyé par e-mail. Ouvrez-le pour terminer.';

function fillPasswordForm() {
  const [, newField, confirmField] = screen
    .getAllByDisplayValue('')
    .filter((el) => el.getAttribute('type') === 'password');
  fireEvent.change(newField, { target: { value: 'premier1234' } });
  fireEvent.change(confirmField, { target: { value: 'premier1234' } });
}

beforeEach(() => {
  window.localStorage.clear();
  invalidateVisitMascotCatalogExtras();
});

afterEach(() => {
  vi.clearAllMocks();
  invalidateVisitMascotCatalogExtras();
});

describe('« Mon profil » : première pose d’un mot de passe (A3)', () => {
  it('réponse linkSent : message « lien envoyé », session inchangée', async () => {
    api.mockImplementation(async (path, method) => {
      if (path === '/api/auth/me/password' && method === 'POST') {
        return { ok: true, linkSent: true, message: LINK_MESSAGE };
      }
      return { mascots: [] };
    });
    const onUpdated = vi.fn();
    render(<StudentProfileEditor student={STUDENT} onUpdated={onUpdated} onClose={() => {}} />);
    fillPasswordForm();
    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    expect(await screen.findByText(LINK_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Mot de passe changé')).toBeNull();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('changement ordinaire : « Mot de passe changé » et jeton neuf transmis', async () => {
    api.mockImplementation(async (path, method) => {
      if (path === '/api/auth/me/password' && method === 'POST') {
        return { ok: true, authToken: 'jeton-neuf', auth: STUDENT.auth };
      }
      return { mascots: [] };
    });
    const onUpdated = vi.fn();
    render(<StudentProfileEditor student={STUDENT} onUpdated={onUpdated} onClose={() => {}} />);
    fillPasswordForm();
    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    expect(await screen.findByText('Mot de passe changé')).toBeTruthy();
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(onUpdated.mock.calls[0][0]).toMatchObject({ authToken: 'jeton-neuf' });
  });
});
