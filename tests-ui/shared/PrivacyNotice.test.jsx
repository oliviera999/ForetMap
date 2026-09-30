import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivacyNoticePage } from '../../src/shared/privacy/PrivacyNoticePage.jsx';
import { PrivacyNoticeLink } from '../../src/shared/privacy/PrivacyNoticeLink.jsx';
import {
  PRIVACY_NOTICE_PATH,
  isPrivacyNoticePath,
  privacyNoticeHref,
} from '../../src/shared/privacy/privacyNoticePath.js';
import {
  PRIVACY_NOTICE_PRODUCTS,
  buildPrivacyNotice,
} from '../../src/shared/privacy/privacyNoticeContent.js';
import { AuthScreen } from '../../src/components/auth-views.jsx';
import { PlanAccountGate } from '../../src/plan/components/PlanAccountGate.jsx';

/*
 * Notice « Vos données » (audit sécurité/RGPD du 30/09/2026, RG1) : page publique lisible sans
 * compte dans les quatre produits, liens depuis la connexion et l'inscription, noms tirés de la
 * marque et jamais écrits en dur.
 */

/** Marque d'une installation fictive : aucun de ces noms n'existe dans le code. */
const TEST_BRAND = {
  appName: 'Arboretum Test',
  appShortName: 'Arbo',
  orgName: 'Collège des Tilleuls',
  orgShortName: 'Tilleuls',
  glName: 'Dragons & Fougères',
  glShortName: 'D&F',
};

/** Noms de l'installation de référence : ils ne doivent jamais apparaître avec une autre marque. */
const REFERENCE_NAMES = [/ForêtMap/i, /ForetMap/, /Lyautey/i, /Gnomes/i, /Licornes/i];

function textWithoutTechnicalKeys(text) {
  // Les clés de stockage (`foretmap_session`, `gl_session`…) sont des identifiants techniques,
  // pas des noms affichés : CLAUDE.md interdit justement de les renommer.
  return String(text || '').replace(/«\s*[a-z_]+\s*»/g, '');
}

describe('notice « Vos données » — contenu', () => {
  test('chaque produit a une notice complète avec les rubriques attendues', () => {
    for (const product of PRIVACY_NOTICE_PRODUCTS) {
      const notice = buildPrivacyNotice({ product, brand: TEST_BRAND });
      const ids = notice.sections.map((s) => s.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          'responsable',
          'finalites',
          'base-legale',
          'donnees',
          'destinataires',
          'sous-traitants',
          'durees',
          'droits',
          'appareil',
        ]),
      );
      expect(notice.title).toBe('Vos données');
    }
  });

  test('les noms viennent de la marque, jamais de l’installation de référence', () => {
    for (const product of PRIVACY_NOTICE_PRODUCTS) {
      const notice = buildPrivacyNotice({ product, brand: TEST_BRAND });
      const text = textWithoutTechnicalKeys(JSON.stringify(notice));
      for (const re of REFERENCE_NAMES) expect(text).not.toMatch(re);
      expect(text).toContain('Collège des Tilleuls');
    }
    expect(buildPrivacyNotice({ product: 'foret', brand: TEST_BRAND }).productName).toBe(
      'Arboretum Test',
    );
    expect(buildPrivacyNotice({ product: 'gl', brand: TEST_BRAND }).productName).toBe(
      'Dragons & Fougères',
    );
    expect(buildPrivacyNotice({ product: 'plan', brand: TEST_BRAND }).productName).toBe(
      'Plan Tilleuls',
    );
  });

  test('sans établissement déclaré, la phrase du responsable reste correcte', () => {
    const notice = buildPrivacyNotice({ product: 'foret', brand: { appName: 'Arboretum Test' } });
    const responsable = notice.sections.find((s) => s.id === 'responsable');
    expect(responsable.paragraphs[0]).toMatch(/^L’établissement qui t’a donné accès/);
  });

  test('en tête : les enseignants voient les statistiques de leurs élèves (R6)', () => {
    const notice = buildPrivacyNotice({ product: 'foret', brand: TEST_BRAND });
    expect(notice.highlight).toMatch(/enseignants voient tes statistiques/);
    expect(notice.highlight).toMatch(/exporter/);
  });

  test('le contact saisi par un administrateur remplace le renvoi par défaut', () => {
    const withContact = buildPrivacyNotice({
      product: 'gl',
      brand: TEST_BRAND,
      contact: 'dpo@exemple.invalid',
    });
    const text = JSON.stringify(withContact);
    expect(text).toContain('dpo@exemple.invalid');
    expect(JSON.stringify(buildPrivacyNotice({ product: 'gl', brand: TEST_BRAND }))).toMatch(
      /délégué à la protection des données/,
    );
  });

  test('les réglages de confidentialité changent le texte de la rubrique « appareil »', () => {
    const local = buildPrivacyNotice({ product: 'foret', brand: TEST_BRAND });
    const external = buildPrivacyNotice({
      product: 'foret',
      brand: TEST_BRAND,
      externalAssetsMode: 'external',
      clearLocalDataOnLogout: false,
    });
    const appareil = (n) => JSON.stringify(n.sections.find((s) => s.id === 'appareil'));
    expect(appareil(local)).toMatch(/ne contacte ni Google ni Wikimedia/);
    expect(appareil(local)).toMatch(/effacées quand tu te déconnectes/);
    expect(appareil(external)).toMatch(/chargées chez Google Fonts et Wikimedia/);
    expect(appareil(external)).toMatch(/attendent ta prochaine connexion/);
  });
});

describe('notice « Vos données » — adresse', () => {
  test('reconnaît /confidentialite, avec ou sans préfixe ni barre finale', () => {
    expect(PRIVACY_NOTICE_PATH).toBe('/confidentialite');
    expect(isPrivacyNoticePath('/confidentialite')).toBe(true);
    expect(isPrivacyNoticePath('/confidentialite/')).toBe(true);
    expect(isPrivacyNoticePath('/app/confidentialite')).toBe(true);
    expect(isPrivacyNoticePath('/')).toBe(false);
    expect(isPrivacyNoticePath('/confidentialite-bis')).toBe(false);
    expect(privacyNoticeHref()).toMatch(/\/confidentialite$/);
  });
});

describe('notice « Vos données » — page publique', () => {
  beforeEach(() => {
    globalThis.__FORETMAP_BRAND__ = TEST_BRAND;
  });
  afterEach(() => {
    delete globalThis.__FORETMAP_BRAND__;
    vi.unstubAllGlobals();
  });

  test('se rend sans compte ni session, avec le contact des réglages publics', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        settings: {
          privacy: { data_contact: 'Vie scolaire, bureau 12', external_assets_mode: 'local' },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PrivacyNoticePage product="foret" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Vos données' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Qui est responsable/ })).toBeInTheDocument();
    expect(screen.getByTestId('privacy-notice-highlight')).toHaveTextContent(/statistiques/);
    await waitFor(() => expect(screen.getByText(/Vie scolaire, bureau 12/)).toBeInTheDocument());
    // Un seul appel, sans jeton : la page est publique.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/settings\/public$/);
    expect(init?.headers?.Authorization).toBeUndefined();
    expect(screen.getByRole('link', { name: /Retour à Arboretum Test/ })).toBeInTheDocument();
  });

  test('reste lisible si le serveur ne répond pas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('hors ligne')));
    render(<PrivacyNoticePage product="gl" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Vos données' })).toBeInTheDocument();
    expect(document.querySelector('.privacy-notice__eyebrow')).toHaveTextContent(
      'Dragons & Fougères',
    );
  });

  test.each(['foret', 'gl', 'plan', 'staff'])(
    'produit %s : aucun nom de l’installation de référence dans la page',
    (product) => {
      const { container } = render(
        <PrivacyNoticePage product={product} privacySettings={{ data_contact: '' }} />,
      );
      const text = textWithoutTechnicalKeys(container.textContent);
      for (const re of REFERENCE_NAMES) expect(text).not.toMatch(re);
    },
  );
});

describe('liens vers la notice', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('le lien « Vos données » pointe vers la notice', () => {
    render(<PrivacyNoticeLink />);
    const link = screen.getByRole('link', { name: 'Vos données' });
    expect(link.getAttribute('href')).toMatch(/\/confidentialite$/);
    expect(link).toHaveClass('privacy-notice-link');
  });

  test('l’écran de connexion propose la notice sans compte', () => {
    render(<AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: true } }} />);
    expect(screen.getByRole('link', { name: 'Vos données' })).toBeInTheDocument();
  });

  test('l’inscription informe avant le bouton « Créer le compte »', async () => {
    const user = userEvent.setup();
    render(<AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: true } }} />);
    await user.click(screen.getByRole('button', { name: 'Créer un compte' }));

    const info = screen.getByTestId('auth-register-privacy');
    expect(info).toHaveTextContent(/tes enseignants voient ta progression/);
    expect(within(info).getByRole('link', { name: /vos données/i })).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Créer le compte' });
    // L'information précède le bouton dans l'ordre du document.
    expect(info.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('l’écran de connexion du plan des personnels propose la notice', () => {
    render(<PlanAccountGate title="Plan" onSubmitCode={async () => {}} />);
    expect(screen.getByRole('link', { name: 'Vos données' })).toBeInTheDocument();
  });
});
