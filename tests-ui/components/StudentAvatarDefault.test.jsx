// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StudentAvatar } from '../../src/components/student-avatar.jsx';
import { StudentProfileEditor } from '../../src/components/stats-views.jsx';
import {
  NEUTRAL_AVATAR_URL,
  getDefaultAvatarUrl,
  getStudentAvatarUrl,
} from '../../src/utils/avatar.js';
import { invalidateVisitMascotCatalogExtras } from '../../src/hooks/useVisitMascotCatalogExtras.js';
import { api } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

/**
 * Avatar par défaut : dessiné par le serveur (`default_avatar_url`, URL signée de
 * l'application), jamais chargé chez un service tiers, et jamais construit à partir du nom
 * de l'élève côté navigateur.
 */

const SIGNED = '/api/users/stu-1/default-avatar?exp=1790000000&sig=abcdefghijklmnopqrstuv';
const STUDENT = {
  id: 'stu-1',
  first_name: 'Lina',
  last_name: 'Martin',
  pseudo: 'linadu92',
  email: 'lina@exemple.fr',
  default_avatar_url: SIGNED,
  auth: { userType: 'student', roleSlug: 'eleve_novice' },
};

function assertNoNameNorThirdParty(src) {
  expect(src).not.toMatch(/dicebear/i);
  expect(src).not.toMatch(/^https?:/i);
  expect(src).not.toContain('linadu92');
  expect(src).not.toContain('Lina');
  expect(src).not.toContain('Martin');
}

beforeEach(() => {
  window.localStorage.clear();
  invalidateVisitMascotCatalogExtras();
  api.mockResolvedValue({ mascots: [] });
});

afterEach(() => {
  vi.clearAllMocks();
  invalidateVisitMascotCatalogExtras();
});

describe('avatar par défaut — URL', () => {
  it('sans photo : URL signée fournie par le serveur, sur l’origine de l’application', () => {
    const url = getStudentAvatarUrl(STUDENT);
    expect(url).toBe(SIGNED);
    assertNoNameNorThirdParty(url);
  });

  it('sans URL serveur (session ancienne) : silhouette neutre embarquée, aucun nom', () => {
    const { default_avatar_url: _omit, ...legacy } = STUDENT;
    const url = getStudentAvatarUrl(legacy);
    expect(url).toBe(NEUTRAL_AVATAR_URL);
    expect(url.startsWith('data:image/svg+xml')).toBe(true);
    assertNoNameNorThirdParty(url);
  });

  it('une URL hors de la route de l’application est ignorée', () => {
    for (const forged of [
      'https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=linadu92',
      '//tiers.example/avatar.svg',
      '/uploads/students/stu-1/a.png',
      'javascript:alert(1)',
    ]) {
      expect(getDefaultAvatarUrl({ ...STUDENT, default_avatar_url: forged })).toBe(
        NEUTRAL_AVATAR_URL,
      );
    }
  });

  it('la photo déposée reste prioritaire', () => {
    const url = getStudentAvatarUrl({
      ...STUDENT,
      avatar_path: 'students/stu-1/a.png?exp=1&sig=x',
    });
    expect(url).toBe('/uploads/students/stu-1/a.png?exp=1&sig=x');
  });
});

describe('<StudentAvatar>', () => {
  it('affiche l’avatar du serveur, sans nom ni service tiers', () => {
    const { container } = render(<StudentAvatar student={STUDENT} />);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe(SIGNED);
    assertNoNameNorThirdParty(img.getAttribute('src'));
  });

  it('repli en cascade : photo → avatar par défaut → silhouette neutre', () => {
    const { container } = render(
      <StudentAvatar student={{ ...STUDENT, avatar_path: 'students/stu-1/a.png' }} />,
    );
    const img = () => container.querySelector('img');
    expect(img().getAttribute('src')).toBe('/uploads/students/stu-1/a.png');
    fireEvent.error(img());
    expect(img().getAttribute('src')).toBe(SIGNED);
    fireEvent.error(img());
    expect(img().getAttribute('src')).toBe(NEUTRAL_AVATAR_URL);
    // Pas de boucle : la silhouette embarquée reste.
    fireEvent.error(img());
    expect(img().getAttribute('src')).toBe(NEUTRAL_AVATAR_URL);
  });
});

describe('« Mon profil » — avatar par défaut', () => {
  it('« Utiliser l’avatar par défaut » montre l’avatar du serveur, sans mention d’un tiers', () => {
    render(
      <StudentProfileEditor
        student={{ ...STUDENT, avatar_path: 'students/stu-1/a.png' }}
        onUpdated={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText(/DiceBear/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Utiliser l.avatar par défaut/ }));
    const preview = screen.getByAltText('Aperçu avatar');
    expect(preview.getAttribute('src')).toBe(SIGNED);
    assertNoNameNorThirdParty(preview.getAttribute('src'));
  });
});
