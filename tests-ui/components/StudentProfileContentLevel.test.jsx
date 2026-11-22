// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import { StudentProfileEditor } from '../../src/components/stats-views.jsx';
import { BiodivPedagoProvider } from '../../src/contexts/BiodivPedagoContext.jsx';
import { invalidateVisitMascotCatalogExtras } from '../../src/hooks/useVisitMascotCatalogExtras.js';
import { api } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

/**
 * « Mon profil » — niveau de contenu d'un compte non élève (demande du 22/11/2026) : choix
 * parmi les niveaux du programme et « Complet (vue gestion) », défaut annoncé (groupes, sinon
 * cycle 3), bouton « Revenir au niveau de mes groupes ». Un élève garde son ancien réglage
 * d'affichage et ne voit pas ce sélecteur.
 */

const TEACHER = {
  id: 'prof-1',
  user_type: 'teacher',
  first_name: 'Prof',
  last_name: 'Test',
  email: 'prof@exemple.fr',
  pseudo: 'prof',
  pedago_content_level: null,
  auth: { userType: 'teacher', roleSlug: 'prof' },
};

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

function renderEditor(user, provider = { staff: true, canTeacherPreview: true }) {
  return render(
    <BiodivPedagoProvider {...provider}>
      <StudentProfileEditor student={user} onUpdated={() => {}} onClose={() => {}} />
    </BiodivPedagoProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  invalidateVisitMascotCatalogExtras();
  api.mockImplementation(async (path, method, body) => {
    if (method === 'PATCH') return { ...TEACHER, ...body };
    return { mascots: [] };
  });
});

afterEach(() => {
  vi.clearAllMocks();
  invalidateVisitMascotCatalogExtras();
});

describe('« Mon profil » : niveau de contenu', () => {
  it('compte non élève : niveaux du programme + Complet, défaut cycle 3 sans groupe', () => {
    renderEditor(TEACHER);
    const field = screen.getByTestId('profile-pedago-content-level');
    const select = within(field).getByLabelText('Niveau de contenu');
    expect(select).toHaveValue('');
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels[0]).toBe('Niveau de mes groupes (Cycle 3 (CM1–6e) — par défaut)');
    expect(labels).toContain('Cycle 4 (5e–3e)');
    expect(labels).toContain('Seconde');
    expect(labels).toContain('Université (au-delà du lycée)');
    expect(labels.at(-1)).toBe('Complet (vue gestion)');
    // L'ancienne préférence d'affichage (élève) n'est pas proposée à un compte non élève.
    expect(screen.queryByTestId('profile-biodiv-pedago-level')).toBeNull();
    // Rien à effacer tant qu'aucun choix n'est enregistré.
    expect(screen.queryByTestId('profile-pedago-content-level-reset')).toBeNull();
  });

  it('le défaut annonce le niveau des groupes du compte', () => {
    renderEditor(TEACHER, {
      staff: true,
      canTeacherPreview: true,
      classCurriculumNiveaux: ['cycle4', 'cycle3'],
    });
    expect(screen.getByRole('option', { name: /^Niveau de mes groupes/ })).toHaveTextContent(
      'Niveau de mes groupes (Cycle 4 (5e–3e) — mes groupes)',
    );
  });

  it('choisir « Complet » envoie seulement ce champ', async () => {
    renderEditor(TEACHER);
    fireEvent.change(screen.getByLabelText('Niveau de contenu'), {
      target: { value: 'complet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const [path, , body] = patchCalls()[0];
    expect(path).toBe('/api/auth/me/profile');
    expect(body).toEqual({ pedago_content_level: 'complet' });
  });

  it('« Revenir au niveau de mes groupes » efface le choix enregistré', async () => {
    const onUpdated = vi.fn();
    render(
      <BiodivPedagoProvider staff canTeacherPreview>
        <StudentProfileEditor
          student={{ ...TEACHER, pedago_content_level: 'seconde' }}
          onUpdated={onUpdated}
          onClose={() => {}}
        />
      </BiodivPedagoProvider>,
    );
    expect(screen.getByLabelText('Niveau de contenu')).toHaveValue('seconde');
    fireEvent.click(screen.getByTestId('profile-pedago-content-level-reset'));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0][2]).toEqual({ pedago_content_level: null });
    await waitFor(() => expect(screen.getByLabelText('Niveau de contenu')).toHaveValue(''));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ pedago_content_level: null }));
    expect(screen.queryByTestId('profile-pedago-content-level-reset')).toBeNull();
  });

  it('élève : pas de sélecteur de contenu, l’ancien réglage d’affichage reste', () => {
    renderEditor(STUDENT, {});
    expect(screen.queryByTestId('profile-pedago-content-level')).toBeNull();
    expect(screen.getByTestId('profile-biodiv-pedago-level')).toBeInTheDocument();
  });
});
