const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  disableTeacherMode,
  dismissProfilePromotionModalIfPresent,
  clickTeacherNewTask,
  submitTaskFormDialog,
  assignStudentToTaskAsTeacher,
  openTeacherTasksTab,
} = require('./fixtures/auth.fixture');

/**
 * Métier, format et badges (migration 329) : le prof crée une tâche dont le métier et le format
 * sont suggérés par le titre, l'étiquette « 🔨 Bricolage · 🛠 Séance » apparaît sur la tuile,
 * puis, une fois la tâche validée, l'élève reçoit le badge « Établi » (premier palier dès la
 * première tâche de bricolage).
 */

test.describe.configure({ mode: 'serial' });

async function readStudentSnapshot(page) {
  return page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('foretmap_session') || 'null')?.student;
      return s ? { id: s.id, first_name: s.first_name, last_name: s.last_name } : null;
    } catch (_) {
      return null;
    }
  });
}

test('tâche : métier suggéré, étiquettes ; validation → badge Établi', async ({ page }) => {
  test.setTimeout(600_000);
  const taskTitle = `Réparer le banc E2E ${Date.now()}`;
  const student = await loginAsNewStudent(page);
  const studentSnap = await readStudentSnapshot(page);

  await enableTeacherMode(page);
  await clickTeacherNewTask(page);
  await page.getByPlaceholder('Ex: Arroser les tomates').fill(taskTitle);
  const dialog = page.getByRole('dialog', { name: 'Nouvelle tâche' });
  const metier = dialog.getByRole('group', { name: 'Métier de la tâche' });
  await expect(metier.getByRole('button', { name: /Bricolage/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.getByText('suggéré').first()).toBeVisible();
  await expect(
    dialog
      .getByRole('group', { name: 'Format de la tâche' })
      .getByRole('button', { name: /Séance/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  const taskId = await submitTaskFormDialog(page);
  expect(taskId).toBeTruthy();

  await openTeacherTasksTab(page);
  await page.getByPlaceholder('Rechercher une tâche…').fill(taskTitle);
  const card = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(card.getByTestId('task-taxonomy-tags')).toContainText('Bricolage');
  await expect(card.getByTestId('task-taxonomy-tags')).toContainText('Séance');

  await assignStudentToTaskAsTeacher(page, taskId, studentSnap || student);
  await dismissProfilePromotionModalIfPresent(page);
  const validated = await page.evaluate(async (id) => {
    const token =
      localStorage.getItem('foretmap_teacher_token') ||
      JSON.parse(localStorage.getItem('foretmap_session') || 'null')?.token ||
      localStorage.getItem('foretmap_auth_token');
    const r = await fetch(`/api/tasks/${id}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.status;
  }, taskId);
  expect(validated).toBe(200);

  await disableTeacherMode(page, student);
  // L'évaluation des badges est lancée sans attendre après la validation : quelques secondes.
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const raw = JSON.parse(localStorage.getItem('foretmap_session') || 'null');
          const token = raw?.token || localStorage.getItem('foretmap_auth_token');
          const r = await fetch('/api/rewards/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!r.ok) return [];
          const body = await r.json();
          return (body.rewards || []).map((x) => x.key);
        }),
      { timeout: 30_000 },
    )
    .toContain('metier.bricolage.1');
});
