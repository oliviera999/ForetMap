import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(async () => ({})),
  getAuthUserId: vi.fn(() => 'u1'),
  getAuthToken: vi.fn(() => 'jeton-u1'),
}));

const { api } = await import('../../src/services/api');
const outbox = await import('../../src/services/offlineOutbox.js');
const mirror = await import('../../src/services/offlineOutboxMirror.js');
const { enqueueTaskDone, listQueuedTaskDone, taskDoneAlreadyClosedMessage } =
  await import('../../src/utils/taskDoneQueue.js');
const { enqueueTutorialRead, listQueuedTutorialReads, queuedTutorialReadIds } =
  await import('../../src/utils/tutorialReadQueue.js');
const { enqueueSpeciesObservation, listQueuedSpeciesObservations } =
  await import('../../src/utils/speciesObservationQueue.js');
const { getOfflinePhoto, putOfflinePhoto } = await import('../../src/utils/offlinePhotoStore.js');

const JPEG = 'data:image/jpeg;base64,AAAA';

const queueDone = (overrides = {}) =>
  enqueueTaskDone({
    user_id: 'u1',
    task_id: 't1',
    task_title: 'Arroser',
    client_uuid: 'done-0001',
    comment: '',
    student_id: 'u1',
    first_name: 'Léa',
    last_name: 'M.',
    ...overrides,
  });

const queueObservation = (overrides = {}) =>
  enqueueSpeciesObservation({
    user_id: 'u1',
    client_uuid: 'sobs-0001',
    map_id: 'foret',
    plant_id: 4,
    observed_at: '2026-10-01',
    text: 'Vu près de la mare',
    plant_label: 'Menthe',
    ...overrides,
  });

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
});

describe('tutorialReadQueue', () => {
  test('une seule lecture par tutoriel et par compte, comptée comme lue', () => {
    expect(enqueueTutorialRead({ user_id: 'u1', tutorial_id: 7, tutorial_title: 'Semis' })).toBe(
      true,
    );
    expect(enqueueTutorialRead({ user_id: 'u1', tutorial_id: 7, tutorial_title: 'Semis' })).toBe(
      true,
    );
    expect(listQueuedTutorialReads('u1')).toHaveLength(1);
    expect(queuedTutorialReadIds('u1').has(7)).toBe(true);
    expect(queuedTutorialReadIds('u2').size).toBe(0);
    expect(enqueueTutorialRead({ user_id: 'u1', tutorial_id: 0 })).toBe(false);
  });
});

describe('flushOutbox', () => {
  test('rejoue dans l’ordre : lecture de tutoriel avant la tâche, puis l’observation', async () => {
    queueObservation();
    queueDone();
    enqueueTutorialRead({ user_id: 'u1', tutorial_id: 3, tutorial_title: 'Paillage' });
    api.mockImplementation(async (path) =>
      String(path) === '/api/species-observations' ? { observation: { id: 'o1' } } : {},
    );
    const summary = await outbox.flushOutbox({ userId: 'u1' });
    expect(api.mock.calls.map(([path]) => path)).toEqual([
      '/api/tutorials/3/acknowledge-read',
      '/api/tasks/t1/done',
      '/api/species-observations',
    ]);
    // Chaque rejeu porte ses en-têtes de télémétrie.
    for (const call of api.mock.calls) {
      expect(call[3].headers['X-Foretmap-Replay']).toBe('page');
      expect(Number(call[3].headers['X-Foretmap-Queued-At'])).toBeGreaterThan(0);
    }
    expect(summary).toMatchObject({ synced: 3, remaining: 0 });
    expect(outbox.countOutboxEntries('u1')).toBe(0);
  });

  test('ne rejoue jamais les écritures d’un autre compte', async () => {
    queueDone({ user_id: 'u2', student_id: 'u2' });
    const summary = await outbox.flushOutbox({ userId: 'u1' });
    expect(api).not.toHaveBeenCalled();
    expect(summary.synced).toBe(0);
    expect(listQueuedTaskDone('u2')).toHaveLength(1);
  });

  test('toujours pas de réseau : tout reste en file, sans événement', async () => {
    queueDone();
    api.mockRejectedValue(Object.assign(new Error('Pas de réseau'), { code: 'NETWORK_FAILURE' }));
    const events = [];
    const onChange = (e) => events.push(e.detail);
    window.addEventListener(outbox.OUTBOX_CHANGED_EVENT, onChange);
    const summary = await outbox.flushOutbox({ userId: 'u1' });
    window.removeEventListener(outbox.OUTBOX_CHANGED_EVENT, onChange);
    expect(summary.synced).toBe(0);
    expect(summary.remaining).toBe(1);
    expect(events).toEqual([]);
  });

  test('lecture de tutoriel pas encore partie : le « fait » lié n’est ni jeté ni figé', async () => {
    enqueueTutorialRead({ user_id: 'u1', tutorial_id: 3, tutorial_title: 'Paillage' });
    queueDone({ comment: 'Trois arrosoirs', has_photo: true });
    await putOfflinePhoto('done-0001', { userId: 'u1', dataUrl: JPEG });
    api.mockImplementation(async (path) => {
      if (String(path).includes('/acknowledge-read')) {
        throw Object.assign(new Error('Pas de réseau'), { code: 'NETWORK_FAILURE' });
      }
      throw Object.assign(new Error('Lis d’abord les tutoriels liés'), {
        status: 403,
        body: { code: 'tutorials_unread', missing_tutorials: [{ id: 3, title: 'Paillage' }] },
      });
    });
    const summary = await outbox.flushOutbox({ userId: 'u1' });
    expect(summary.refused).toHaveLength(0);
    expect(summary.dropped).toBe(0);
    expect(listQueuedTutorialReads('u1')).toHaveLength(1);
    expect(listQueuedTaskDone('u1')).toMatchObject([
      { client_uuid: 'done-0001', comment: 'Trois arrosoirs' },
    ]);
    expect(listQueuedTaskDone('u1')[0].refused).toBeUndefined();
    expect(await getOfflinePhoto('done-0001')).toBe(JPEG);

    api.mockImplementation(async (path) =>
      String(path).includes('/acknowledge-read') ? { success: true } : { status: 'done' },
    );
    const retry = await outbox.flushOutbox({ userId: 'u1' });
    expect(retry.synced).toBe(2);
    expect(api.mock.calls.map(([path]) => path)).toEqual([
      '/api/tutorials/3/acknowledge-read',
      '/api/tasks/t1/done',
      '/api/tutorials/3/acknowledge-read',
      '/api/tasks/t1/done',
    ]);
    expect(listQueuedTaskDone('u1')).toHaveLength(0);
    expect(await getOfflinePhoto('done-0001')).toBeNull();
  });

  test('tutoriel non lu et aucune lecture en attente : le « fait » sans texte est abandonné', async () => {
    queueDone();
    api.mockRejectedValue(
      Object.assign(new Error('Lis d’abord les tutoriels liés'), {
        status: 403,
        body: { code: 'tutorials_unread', missing_tutorials: [{ id: 9, title: 'Semis' }] },
      }),
    );
    const summary = await outbox.flushOutbox({ userId: 'u1' });
    expect(summary.dropped).toBe(1);
    expect(summary.refused[0]).toMatchObject({ kept: false, code: 'tutorials_unread' });
    expect(listQueuedTaskDone('u1')).toHaveLength(0);
  });

  test('refus avec code stable : expliqué, texte gardé', async () => {
    queueDone({ comment: 'Trois arrosoirs' });
    api.mockRejectedValue(
      Object.assign(new Error('Tu dois être inscrit à cette tâche avant de la terminer'), {
        status: 400,
        body: { code: 'not_assigned' },
      }),
    );
    const summary = await outbox.flushOutbox({ userId: 'u1' });
    expect(summary.refused).toHaveLength(1);
    expect(summary.refused[0]).toMatchObject({
      kind: 'task_done',
      kept: true,
      code: 'not_assigned',
    });
    const toast = outbox.outboxFlushToast(summary);
    expect(toast).toContain('« Arroser » n’a pas pu être marquée faite');
    expect(toast).toContain('tu n’es plus inscrit·e sur cette tâche');
    expect(toast).toContain('Ton texte est gardé');
    const [entry] = outbox.listOutboxEntries('u1');
    expect(entry).toMatchObject({
      refused: true,
      error_code: 'not_assigned',
      detail: 'Trois arrosoirs',
    });
  });

  test('photo de tâche gardée : envoyée avec le rapport puis effacée', async () => {
    queueDone({ has_photo: true });
    await putOfflinePhoto('done-0001', { userId: 'u1', dataUrl: JPEG });
    await outbox.flushOutbox({ userId: 'u1' });
    expect(api.mock.calls[0][2].imageData).toBe(JPEG);
    expect(await getOfflinePhoto('done-0001')).toBeNull();
  });

  test('photo d’observation : envoyée après l’observation ; coupure → l’observation reste', async () => {
    queueObservation({ has_photo: true });
    await putOfflinePhoto('sobs-0001', { userId: 'u1', dataUrl: JPEG });
    api.mockImplementation(async (path) => {
      if (String(path).endsWith('/photos')) {
        throw Object.assign(new Error('Pas de réseau'), { code: 'NETWORK_FAILURE' });
      }
      return { observation: { id: 'o9' } };
    });
    await outbox.flushOutbox({ userId: 'u1' });
    expect(listQueuedSpeciesObservations('u1')).toHaveLength(1);
    expect(await getOfflinePhoto('sobs-0001')).toBe(JPEG);

    api.mockImplementation(async () => ({ observation: { id: 'o9' } }));
    await outbox.flushOutbox({ userId: 'u1' });
    expect(api).toHaveBeenCalledWith('/api/species-observations/o9/photos', 'POST', {
      imageData: JPEG,
    });
    expect(listQueuedSpeciesObservations('u1')).toHaveLength(0);
    expect(await getOfflinePhoto('sobs-0001')).toBeNull();
  });

  test('demande reçue pendant un rejeu : un second passage suit (retour du réseau en route)', async () => {
    queueDone();
    api
      .mockRejectedValueOnce(Object.assign(new Error('Pas de réseau'), { code: 'NETWORK_FAILURE' }))
      .mockResolvedValue({});
    const first = outbox.flushOutbox({ userId: 'u1' });
    const second = outbox.flushOutbox({ userId: 'u1' });
    const third = outbox.flushOutbox({ userId: 'u1' });
    expect(third).toBe(second);
    expect((await first).synced).toBe(0);
    expect((await second).synced).toBe(1);
    expect(listQueuedTaskDone('u1')).toHaveLength(0);
  });

  test('les photos orphelines sont purgées après un rejeu', async () => {
    await putOfflinePhoto('orpheline', { userId: 'u1', dataUrl: JPEG });
    await outbox.flushOutbox({ userId: 'u1' });
    expect(await getOfflinePhoto('orpheline')).toBeNull();
  });
});

describe('messages', () => {
  test('succès : une tâche, plusieurs tâches, envois mixtes', () => {
    const sent = (kind, n) => Array.from({ length: n }, () => ({ kind, item: {}, response: {} }));
    expect(outbox.outboxFlushToast({ synced: 1, sent: sent('task_done', 1), refused: [] })).toBe(
      'Ta tâche notée sans réseau est bien partie ✓',
    );
    expect(outbox.outboxFlushToast({ synced: 2, sent: sent('task_done', 2), refused: [] })).toBe(
      '2 tâches notées sans réseau sont bien parties ✓',
    );
    expect(
      outbox.outboxFlushToast({
        synced: 2,
        sent: [...sent('task_done', 1), ...sent('tutorial_read', 1)],
        refused: [],
      }),
    ).toBe('2 envois gardés sans réseau sont bien partis ✓');
    expect(outbox.outboxFlushToast({ synced: 0, sent: [], refused: [] })).toBeNull();
  });

  test('tâche arrivée close entre-temps : l’élève le sait', () => {
    const summary = {
      synced: 1,
      sent: [
        {
          kind: 'task_done',
          item: { task_title: 'Arroser' },
          response: { already_closed: 'validated' },
        },
      ],
      refused: [],
    };
    const toast = outbox.outboxFlushToast(summary, (item, response) =>
      taskDoneAlreadyClosedMessage(item.task_title, response?.already_closed),
    );
    expect(toast).toMatch(/« Arroser » avait déjà été validée entre-temps/);
  });

  test('refus sans code : le message du serveur, ponctué une seule fois', () => {
    expect(
      outbox.outboxRefusalMessage({
        kind: 'task_done',
        item: { task_title: 'Arroser' },
        message: 'Tâche archivée : action indisponible',
        kept: false,
      }),
    ).toBe('« Arroser » n’a pas pu être marquée faite : Tâche archivée : action indisponible.');
    expect(
      outbox.outboxRefusalMessage({
        kind: 'tutorial_read',
        item: { tutorial_title: 'Semis' },
        message: 'Contrôle requis.',
      }),
    ).toBe('La lecture de « Semis » n’a pas pu être enregistrée : Contrôle requis.');
  });
});

describe('listOutboxEntries / dismissOutboxEntry', () => {
  test('liste dans l’ordre de rejeu et retire une écriture avec sa photo', async () => {
    queueDone({ has_photo: true });
    await putOfflinePhoto('done-0001', { userId: 'u1', dataUrl: JPEG });
    enqueueTutorialRead({ user_id: 'u1', tutorial_id: 2, tutorial_title: 'Compost' });
    const entries = outbox.listOutboxEntries('u1');
    expect(entries.map((e) => e.kind)).toEqual(['tutorial_read', 'task_done']);
    expect(entries[1]).toMatchObject({ title: 'Arroser', has_photo: true, dismissible: true });

    expect(await outbox.dismissOutboxEntry('task_done', 'done-0001')).toBe(true);
    expect(listQueuedTaskDone('u1')).toHaveLength(0);
    expect(await getOfflinePhoto('done-0001')).toBeNull();
    expect(await outbox.dismissOutboxEntry('inconnu', 'x')).toBe(false);
  });
});

describe('offlineOutboxMirror', () => {
  test('construit des entrées prêtes à envoyer, sans photo ni refus', () => {
    enqueueTutorialRead({ user_id: 'u1', tutorial_id: 5 });
    queueDone();
    queueDone({ client_uuid: 'done-photo', task_id: 't2', has_photo: true });
    queueObservation();
    const entries = mirror.buildOutboxMirrorEntries('u1', 'jeton', (p) => `/base${p}`);
    expect(entries.map((e) => [e.kind, e.order, e.url])).toEqual([
      ['tutorial_read', 1, '/base/api/tutorials/5/acknowledge-read'],
      ['task_done', 2, '/base/api/tasks/t1/done'],
      ['species_observation', 3, '/base/api/species-observations'],
    ]);
    expect(entries.every((e) => e.token === 'jeton' && e.method === 'POST')).toBe(true);
    expect(JSON.parse(entries[1].body)).toMatchObject({ client_uuid: 'done-0001' });
    expect(mirror.buildOutboxMirrorEntries('', 'jeton')).toEqual([]);
    expect(mirror.buildOutboxMirrorEntries('u1', '')).toEqual([]);
  });

  test('sans Background Sync (jsdom) : rien n’est recopié ; l’effacement vide le magasin', async () => {
    queueDone();
    expect(mirror.isBackgroundSyncSupported()).toBe(false);
    expect(await mirror.syncOutboxMirror({ userId: 'u1', token: 'jeton' })).toEqual({
      mirrored: 0,
      syncRegistered: false,
    });
    expect(await mirror.clearOutboxMirror()).toBe(true);
    expect(await mirror.countOutboxMirrorEntries()).toBe(0);
  });
});
