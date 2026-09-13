// @vitest-environment jsdom
//
// Lot M3 — onglet « Moodle » de la console administrateur : état, rapport de simulation,
// bouton « Appliquer » grisé tant que le périmètre n'a pas été simulé, conflits, table
// chapitre → cours avec le nom du cours.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

vi.mock('../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({ confirm: vi.fn(async () => true), notify: vi.fn(), prompt: vi.fn() }),
}));

const { api } = await import('../../src/services/api');
const { MoodleAdminPanel } = await import('../../src/components/settings/MoodleAdminPanel.jsx');

const BASE = '/api/admin/integrations/moodle';

const STATUS = {
  configured: true,
  killSwitchOff: false,
  baseUrl: 'https://moodle.test',
  enabled: true,
  yearPrefix: '26',
  lastCheck: null,
  lastRun: null,
  openConflicts: 1,
  openPendingMatches: 0,
};

const COHORTS = {
  yearPrefix: '26',
  cohorts: [
    {
      id: 603,
      idnumber: '26#603',
      name: '6e 3',
      memberCount: 24,
      policyKey: 'classe6',
      groupId: null,
      glClassId: null,
      lastSyncedAt: null,
    },
    {
      id: 999,
      idnumber: '26#zz',
      name: 'Sans politique',
      memberCount: 3,
      policyKey: null,
      groupId: null,
      glClassId: null,
      lastSyncedAt: null,
    },
  ],
};

const COURSES = {
  chapters: [
    { id: 1, title: 'Chapitre 1 — La graine' },
    { id: 2, title: 'Chapitre 2 — La pousse' },
  ],
  rows: [
    {
      chapterId: 1,
      chapterTitle: 'Chapitre 1 — La graine',
      courseId: 42,
      courseName: 'Cours G&L chapitre 1',
      courseShortname: 'GL1',
      courseFound: true,
    },
  ],
};

const CONFLICTS = {
  items: [
    {
      id: 7,
      externalGroupId: 3,
      externalIdnumber: '26#603',
      groupName: '6e 3',
      kind: 'member_removed_on_mirror',
      user: { userId: 'u1', displayName: 'Zoé Martin' },
      moodleState: 'member',
      foretmapState: 'absent',
      detectedAt: '2026-09-08T10:00:00Z',
    },
  ],
};

const DRY_RUN_RESULT = {
  runId: 41,
  status: 'succeeded',
  report: {
    mode: 'dry_run',
    scope: { cohortIds: [603], cohortIdnumbers: ['26#603'], teams: false, force: false },
    totals: {
      membersProcessed: 24,
      creations: 3,
      nameMatches: 1,
      deactivations: 0,
      conflicts: 0,
      pendingMatches: 0,
    },
    thresholds: { blocked: false, breaches: [] },
    upstreamErrors: [],
    lists: {
      creations: [
        {
          cohort: '26#603',
          member: { firstName: 'Neo', lastName: 'Vu', email: 'neo.vu@lyautey.test' },
        },
      ],
      nameMatches: [
        {
          cohort: '26#603',
          member: { firstName: 'Zoé', lastName: 'Martin' },
          user: { userId: 'u1', displayName: 'Zoé Martin' },
        },
      ],
    },
    conflicts: [],
  },
};

function mockApi(overrides = {}) {
  api.mockImplementation(async (path, method = 'GET', body) => {
    const key = `${method} ${path}`;
    if (key in overrides) return overrides[key](body);
    if (path === `${BASE}/status`) return STATUS;
    if (path.startsWith(`${BASE}/runs?`)) return { items: [], total: 0 };
    if (path === `${BASE}/pending-matches`) return { items: [] };
    if (path === `${BASE}/conflicts`) return CONFLICTS;
    if (path === `${BASE}/cohorts`) return COHORTS;
    if (path === `${BASE}/courses`) return COURSES;
    if (path === `${BASE}/exempt`) return { users: [], groups: [] };
    throw new Error(`appel inattendu : ${key}`);
  });
}

const settings = {
  'integration.moodle.enabled': true,
  'integration.moodle.year_prefix': '26',
  'integration.moodle.email_domains': '',
  'integration.moodle.policies': [
    {
      key: 'classe6',
      pattern: '^{year}#6\\d{2}$',
      group_kind: 'class',
      role: 'visiteur',
      n3beur: false,
      gl_class: true,
      create_accounts: true,
      push_membership: false,
    },
  ],
  'integration.moodle.chapter_courses': { 1: 42 },
  'integration.moodle.threshold_create_pct': 30,
  'integration.lti.enabled': false,
  'integration.lti.unknown_user': 'refuse',
  'integration.lti.public_origin': '',
  'integration.lti.instructor_targets': ['fm', 'gl'],
  'integration.lti.launch_bindings': [
    { moodle_course_id: 42, product: 'gl', gl_chapter_id: 1, landing: 'aiguillage', label: '' },
  ],
};

function renderPanel(props = {}) {
  const saveSetting = vi.fn(async () => {});
  const onMessage = vi.fn();
  const onError = vi.fn();
  render(
    <MoodleAdminPanel
      get={(key, fallback) => (key in settings ? settings[key] : fallback)}
      saveSetting={saveSetting}
      savingKey=""
      onMessage={onMessage}
      onError={onError}
      {...props}
    />,
  );
  return { saveSetting, onMessage, onError };
}

beforeEach(() => {
  api.mockReset();
  window.localStorage.clear();
});

describe('MoodleAdminPanel', () => {
  it('affiche l’état configuré, les cohortes de l’année et grise « Appliquer » avant toute simulation', async () => {
    mockApi();
    renderPanel();
    await screen.findByText('Configuré');
    expect(screen.getByText('https://moodle.test')).toBeInTheDocument();
    await screen.findByLabelText('Cohorte 26#603');
    const apply = screen.getByRole('button', { name: 'Appliquer' });
    expect(apply).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Simuler' })).toBeDisabled();
    // Cohorte sans politique : case grisée.
    expect(screen.getByLabelText('Cohorte 26#zz')).toBeDisabled();
  });

  it('Moodle injoignable : bandeau d’erreur au lieu d’un simple « Erreur serveur »', async () => {
    const boom = new Error('Erreur serveur');
    boom.status = 500;
    mockApi({
      [`GET ${BASE}/cohorts`]: () => {
        throw boom;
      },
    });
    renderPanel();
    await screen.findByTestId('moodle-remote-error');
    expect(screen.getByTestId('moodle-remote-error').textContent).toMatch(/Moodle injoignable/);
  });

  it('non configuré : message explicite, aucun appel vers Moodle', async () => {
    mockApi({
      [`GET ${BASE}/status`]: () => ({
        ...STATUS,
        configured: false,
        baseUrl: null,
        enabled: false,
      }),
    });
    renderPanel();
    await screen.findByText('Non configuré');
    expect(screen.getByTestId('moodle-remote-error').textContent).toMatch(/non configurée/);
    expect(api).not.toHaveBeenCalledWith(`${BASE}/cohorts`);
    expect(screen.getByRole('button', { name: 'Contrôler la connexion' })).toBeDisabled();
  });

  it('simule puis rend le rapport (totaux, listes) et libère « Appliquer » sur le même périmètre', async () => {
    const startRun = vi.fn(async () => DRY_RUN_RESULT);
    mockApi({ [`POST ${BASE}/runs`]: startRun });
    const { onMessage } = renderPanel();
    fireEvent.click(await screen.findByLabelText('Cohorte 26#603'));
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));

    await screen.findByTestId('moodle-run-report');
    expect(startRun).toHaveBeenCalledWith({
      mode: 'dry_run',
      cohortIds: [603],
      teams: false,
      force: false,
      forceReason: undefined,
    });
    expect(screen.getByText(/Exécution #41 — Simulation — Terminée/)).toBeInTheDocument();
    const totals = screen.getByTestId('moodle-totals');
    expect(within(totals).getByText('Comptes à créer').nextSibling.textContent).toBe('3');
    expect(screen.getByText(/Neo Vu <neo.vu@lyautey.test>/)).toBeInTheDocument();
    expect(onMessage).toHaveBeenCalledWith('Simulation #41 terminée');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Appliquer' })).toBeEnabled());
    // Périmètre modifié → grisé à nouveau, avec la raison.
    fireEvent.click(screen.getByLabelText('Cohorte 26#603'));
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
    expect(screen.getByText('Le périmètre a changé depuis la simulation')).toBeInTheDocument();
  });

  it('un seuil dépassé dans la simulation garde « Appliquer » grisé et explique pourquoi', async () => {
    const blocked = {
      ...DRY_RUN_RESULT,
      status: 'aborted',
      report: {
        ...DRY_RUN_RESULT.report,
        thresholds: {
          blocked: true,
          breaches: [{ key: 'create_pct', message: '12 comptes à créer, soit 40 % — seuil 30 %' }],
        },
      },
    };
    mockApi({ [`POST ${BASE}/runs`]: async () => blocked });
    renderPanel();
    fireEvent.click(await screen.findByLabelText('Cohorte 26#603'));
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));
    await screen.findByText(/12 comptes à créer/);
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
    expect(screen.getByText('La simulation n’a pas abouti')).toBeInTheDocument();
  });

  it('liste les conflits ouverts et envoie la résolution choisie', async () => {
    const resolve = vi.fn(async () => ({ id: 7, resolution: 'keep_master' }));
    mockApi({ [`POST ${BASE}/conflicts/7`]: resolve });
    const { onMessage } = renderPanel();
    await screen.findByTestId('moodle-conflicts');
    expect(screen.getByText('Retiré côté ForetMap, toujours dans Moodle')).toBeInTheDocument();
    expect(screen.getByText('Zoé Martin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Garder Moodle' }));
    await waitFor(() => expect(resolve).toHaveBeenCalledWith({ resolution: 'keep_master' }));
    expect(onMessage).toHaveBeenCalledWith('Conflit tranché');
  });

  it('table chapitre → cours : affiche le nom du cours Moodle et enregistre la table en objet', async () => {
    mockApi();
    const { saveSetting } = renderPanel();
    await screen.findByTestId('moodle-chapter-courses');
    expect(screen.getByText('Cours G&L chapitre 1 [GL1]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un chapitre' }));
    // La ligne ajoutée est cherchée en asynchrone : une requête synchrone juste après un clic
    // suppose que React a déjà repeint, ce qui ne tient plus sur un exécuteur CI chargé.
    fireEvent.change(await screen.findByLabelText('Cours de la ligne 2'), {
      target: { value: '43' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la table' }));
    await waitFor(() =>
      expect(saveSetting).toHaveBeenCalledWith(
        'integration.moodle.chapter_courses',
        { 1: 42, 2: 43 },
        'Table chapitre → cours enregistrée',
      ),
    );
  });

  it('éditeur de politiques : refuse une regex invalide, enregistre la liste normalisée', async () => {
    mockApi();
    const { saveSetting } = renderPanel();
    await screen.findByTestId('moodle-policies');
    const pattern = screen.getByLabelText('Motif ({year} = préfixe d’année) — classe6');
    fireEvent.change(pattern, { target: { value: '^{year}#(' } });
    expect(screen.getByText(/expression régulière invalide/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer les politiques' })).toBeDisabled();
    fireEvent.change(pattern, { target: { value: '^{year}#6\\d{2}(-6\\d{2})?$' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les politiques' }));
    await waitFor(() => expect(saveSetting).toHaveBeenCalled());
    const [key, value] = saveSetting.mock.calls[0];
    expect(key).toBe('integration.moodle.policies');
    expect(value[0].pattern).toBe('^{year}#6\\d{2}(-6\\d{2})?$');
    expect(value[0].role).toBe('visiteur');
  });

  it('contrôle : site_info absente du service → conseil affiché, aucune fonction dite « manquante »', async () => {
    const check = vi.fn(async () => ({
      ok: false,
      checkedAt: '2026-09-09T10:00:00Z',
      site: null,
      functions: [
        {
          name: 'core_cohort_get_cohorts',
          lot: 'M1',
          use: 'lecture des cohortes',
          allowed: null,
        },
      ],
      functionsUnknown: true,
      missingFunctions: [],
      tokenProbe: { wsfunction: 'core_cohort_search_cohorts', ok: true, scope: 'function' },
      cohorts: [],
      cohortsOfYearWithoutPolicy: [],
      chapterCourses: [],
      errors: [
        {
          step: 'site_info',
          kind: 'api',
          errorcode: 'accessexception',
          message: 'Exception du contrôle d’accès',
          hint: 'L’ajouter dans Moodle → Services externes → Fonctions.',
        },
      ],
    }));
    mockApi({ [`POST ${BASE}/check`]: check });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Contrôler la connexion' }));
    const report = await screen.findByTestId('moodle-check-report');
    expect(check).toHaveBeenCalled();
    expect(report.textContent).toMatch(/Liste des fonctions indéterminée/);
    expect(report.textContent).toMatch(/Services externes → Fonctions/);
    // `allowed: null` = indéterminé : ne jamais l'annoncer comme manquante.
    expect(report.textContent).not.toMatch(/Fonctions Web Services manquantes/);
  });

  it('Entrée depuis le cours : affiche le nom du cours et refuse create comme unknown_user', async () => {
    mockApi();
    window.localStorage.setItem('foretmap.adminSection.moodle-lti', '1');
    renderPanel();
    await screen.findByTestId('moodle-lti');
    expect(screen.getByText('Cours G&L chapitre 1')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Refuser/ })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /créer/i })).not.toBeInTheDocument();
  });
});
