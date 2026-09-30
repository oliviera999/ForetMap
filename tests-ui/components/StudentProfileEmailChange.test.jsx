// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { StudentProfileEditor } from '../../src/components/stats-views.jsx';
import { invalidateVisitMascotCatalogExtras } from '../../src/hooks/useVisitMascotCatalogExtras.js';
import { api } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

/**
 * « Mon profil » — changer d'adresse e-mail exige le mot de passe actuel (audit sécurité
 * 2026-09-30, AC3). Le champ n'apparaît que quand l'adresse change réellement, son contenu
 * part dans le PATCH (`currentPassword`), et le jeton neuf renvoyé est remis à la session.
 */

const STUDENT = {
  id: 'stu-1',
  first_name: 'Lina',
  last_name: 'Test',
  email: 'lina@exemple.fr',
  pseudo: 'lina',
  auth: { userType: 'student', roleSlug: 'eleve_novice' },
};

function patchCalls() {
  return api.mock.calls.filter(([, method]) => method === 'PATCH');
}

beforeEach(() => {
  window.localStorage.clear();
  invalidateVisitMascotCatalogExtras();
  api.mockImplementation(async (path, method, body) => {
    if (method === 'PATCH') {
      return { ...STUDENT, ...body, authToken: 'jeton-neuf', auth: STUDENT.auth };
    }
    return { mascots: [] };
  });
});

afterEach(() => {
  vi.clearAllMocks();
  invalidateVisitMascotCatalogExtras();
});

describe('« Mon profil » : changement d’adresse e-mail', () => {
  it('pas de champ mot de passe tant que l’adresse ne change pas', () => {
    render(<StudentProfileEditor student={STUDENT} onUpdated={() => {}} onClose={() => {}} />);
    expect(screen.queryByTestId('profile-email-current-password')).toBeNull();
    // Même adresse à la casse près : pas un changement.
    fireEvent.change(screen.getByPlaceholderText('moi@exemple.com'), {
      target: { value: 'LINA@exemple.fr' },
    });
    expect(screen.queryByTestId('profile-email-current-password')).toBeNull();
  });

  it('adresse modifiée sans mot de passe : refus côté client, aucun PATCH', async () => {
    render(<StudentProfileEditor student={STUDENT} onUpdated={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('moi@exemple.com'), {
      target: { value: 'autre@exemple.fr' },
    });
    expect(screen.getByTestId('profile-email-current-password')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(
      await screen.findByText(/Mot de passe actuel requis pour changer d’adresse e-mail/),
    ).toBeTruthy();
    expect(patchCalls()).toHaveLength(0);
  });

  it('adresse modifiée avec mot de passe : currentPassword envoyé, jeton neuf transmis', async () => {
    const onUpdated = vi.fn();
    render(<StudentProfileEditor student={STUDENT} onUpdated={onUpdated} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('moi@exemple.com'), {
      target: { value: 'autre@exemple.fr' },
    });
    fireEvent.change(screen.getByLabelText(/Mot de passe actuel \(requis pour changer de mail\)/), {
      target: { value: 'secret-actuel' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const [path, , body] = patchCalls()[0];
    expect(path).toBe('/api/students/stu-1/profile');
    expect(body).toMatchObject({ email: 'autre@exemple.fr', currentPassword: 'secret-actuel' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(onUpdated.mock.calls[0][0]).toMatchObject({ authToken: 'jeton-neuf' });
  });

  it('autre champ modifié seul : pas de mot de passe envoyé', async () => {
    render(<StudentProfileEditor student={STUDENT} onUpdated={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('momo_lyautey'), {
      target: { value: 'lina2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const [, , body] = patchCalls()[0];
    expect(body).toEqual({ pseudo: 'lina2' });
  });
});
