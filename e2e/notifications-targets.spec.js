const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  loginAsTeacherAdminApi,
  enableTeacherMode,
  dismissProfilePromotionModalIfPresent,
} = require('./fixtures/auth.fixture');

/**
 * Notifications précises : le clic sur une notification ouvre l'élément exact auquel elle
 * se rapporte (lieu sur la carte avec ses messages, tâche mise en évidence dans la liste).
 * Les données sont préparées par l'API ; seul le geste « ouvrir la notification » passe par
 * l'interface.
 */

test.describe.configure({ mode: 'serial' });

async function studentSessionFromStorage(page) {
  return page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('foretmap_session') || 'null');
    const student =
      session?.student || JSON.parse(localStorage.getItem('foretmap_student') || '{}');
    return {
      token: session?.token || student?.authToken || null,
      id: student?.auth?.canonicalUserId || student?.id || session?.user?.id || null,
      firstName: student?.first_name || '',
      lastName: student?.last_name || '',
    };
  });
}

async function apiOk(response, label) {
  if (!response.ok()) {
    const snippet = await response.text().catch(() => '');
    throw new Error(`${label} (HTTP ${response.status()}) ${snippet.slice(0, 200)}`);
  }
  return response.json().catch(() => ({}));
}

async function openNotificationCenter(page) {
  const bell = page.getByRole('button', { name: /Notifications \(\d+ non lues\)/ });
  await expect(bell).toBeVisible({ timeout: 30_000 });
  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Centre de notifications' });
  await expect(panel).toBeVisible();
  return panel;
}

/** Recharge la page jusqu'à voir la notification (émise sans attendre la réponse HTTP). */
async function openNotificationContaining(page, text) {
  const deadline = Date.now() + 45_000;
  for (;;) {
    const panel = await openNotificationCenter(page);
    const item = panel.locator('button.notif-item-main', { hasText: text }).first();
    if (await item.isVisible().catch(() => false)) {
      await item.click();
      return;
    }
    if (Date.now() > deadline) throw new Error(`Notification « ${text} » absente du centre.`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.reload();
    await dismissProfilePromotionModalIfPresent(page);
  }
}

test('prof : un message déposé sur un lieu ouvre la carte sur ce lieu et ses messages', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const stamp = Date.now();
  const zoneName = `E2E Mare notif ${stamp}`;
  const messageBody = `La bâche de la mare est déchirée (${stamp}).`;

  await loginAsNewStudent(page);
  const student = await studentSessionFromStorage(page);
  const adminToken = await loginAsTeacherAdminApi(page);
  const zone = await apiOk(
    await page.request.post('/api/zones', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: zoneName,
        map_id: 'foret',
        points: [
          { xp: 18, yp: 18 },
          { xp: 26, yp: 18 },
          { xp: 22, yp: 26 },
        ],
        stage: 'empty',
      },
    }),
    'Création de la zone',
  );
  await apiOk(
    await page.request.post('/api/context-comments', {
      headers: { Authorization: `Bearer ${student.token}` },
      data: { contextType: 'zone', contextId: zone.id, body: messageBody },
    }),
    'Message élève sur la zone',
  );

  try {
    await enableTeacherMode(page);
    await openNotificationContaining(page, zoneName);
    // La fenêtre du lieu est ouverte, sur l'onglet qui porte ses messages.
    await expect(page.getByText(messageBody)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Commentaires de la zone')).toBeVisible();
  } finally {
    await page.request
      .delete(`/api/zones/${encodeURIComponent(zone.id)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      .catch(() => {});
  }
});

test('élève : la notification « tâche validée » met la tâche en évidence dans la liste', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const taskTitle = `E2E Notif validée ${Date.now()}`;

  await loginAsNewStudent(page);
  const student = await studentSessionFromStorage(page);
  const adminToken = await loginAsTeacherAdminApi(page);
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const studentHeaders = { Authorization: `Bearer ${student.token}` };
  const identity = {
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
  };

  const task = await apiOk(
    await page.request.post('/api/tasks', {
      headers: adminHeaders,
      data: { title: taskTitle, required_students: 1, map_id: 'foret' },
    }),
    'Création de la tâche',
  );
  await apiOk(
    await page.request.post(`/api/tasks/${task.id}/assign`, {
      headers: studentHeaders,
      data: identity,
    }),
    'Inscription élève',
  );
  await apiOk(
    await page.request.post(`/api/tasks/${task.id}/done`, {
      headers: studentHeaders,
      data: identity,
    }),
    'Tâche marquée faite',
  );
  await apiOk(
    await page.request.post(`/api/tasks/${task.id}/validate`, { headers: adminHeaders }),
    'Validation prof',
  );

  try {
    await page.reload();
    await dismissProfilePromotionModalIfPresent(page);
    await openNotificationContaining(page, taskTitle);
    const highlighted = page.locator('.task-card.task-card--highlight', { hasText: taskTitle });
    await expect(highlighted).toBeVisible({ timeout: 30_000 });
  } finally {
    await page.request
      .delete(`/api/tasks/${encodeURIComponent(task.id)}`, { headers: adminHeaders })
      .catch(() => {});
  }
});
