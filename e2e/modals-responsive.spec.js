const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  openFirstZoneModalFromMap,
  openTeacherTasksTab,
  clickTeacherNewTask,
} = require('./fixtures/auth.fixture');

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];
const TASK_DIALOG_NAME_RE = /Nouvelle tâche|Dupliquer la tâche|Modifier la tâche|Proposer une tâche/;

async function expectDialogStableAndFitting(dialog, viewportHeight) {
  await expect(dialog).toBeVisible();
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    return box ? Math.round(box.height) : 0;
  }, { timeout: 10_000 }).toBeGreaterThan(0);
  const box = await dialog.boundingBox();
  expect(box).toBeTruthy();
  if (box) {
    expect(box.height).toBeLessThanOrEqual(viewportHeight - 8);
    expect(box.width).toBeGreaterThan(120);
  }
}

async function closeDialogSafely(page, dialog) {
  const closeBtn = dialog.locator('.modal-close').first();
  if (await closeBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
    await closeBtn.click({ timeout: 8000 });
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function setupTeacherSession(page) {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await openTeacherTasksTab(page);
}

for (const vp of VIEWPORTS) {
  test.describe(`modales responsive (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('ouvre les modales critiques sans aberration visuelle', async ({ page }) => {
      test.setTimeout(300_000);

      await loginAsNewStudent(page);

      await page.getByRole('button', { name: 'Activer les droits étendus' }).click({ timeout: 25_000 });
      const pinCard = page.locator('.pin-card');
      await expect(pinCard).toBeVisible({ timeout: 25_000 });
      await expectDialogStableAndFitting(pinCard, vp.height);
      const pin = process.env.E2E_ELEVATION_PIN || process.env.TEACHER_PIN || '1234';
      await enableTeacherMode(page, pin, { pinCardAlreadyOpen: true });

      await page.locator('.teacher-main .top-tabs').getByRole('button', { name: /^✅/ }).first().click();
      await page.locator('.teacher-main .tasks-view').waitFor({ state: 'visible', timeout: 90_000 });

      const newTaskBtn = page.locator('.teacher-main .tasks-view').getByRole('button', { name: /\+ Nouvelle tâche/ });
      await newTaskBtn.scrollIntoViewIfNeeded().catch(() => {});
      await newTaskBtn.evaluate((el) => el.click());
      const taskModal = page.getByRole('dialog', { name: TASK_DIALOG_NAME_RE });
      await expectDialogStableAndFitting(taskModal, vp.height);
      await closeDialogSafely(page, taskModal);

      await page.getByRole('button', { name: /Carte & Zones/ }).click();
      await expect(page.locator('img[alt^="Plan "]').first()).toBeVisible();
      const zoneCount = await page.locator('.map-zone-hit').count();
      if (zoneCount > 0) {
        await openFirstZoneModalFromMap(page);
        const zoneModal = page.getByRole('dialog', { name: /^Zone / });
        await expectDialogStableAndFitting(zoneModal, vp.height);
        await closeDialogSafely(page, zoneModal);
      }
    });

    test('smoke contenu long dans la modale de tâche', async ({ page }) => {
      test.setTimeout(300_000);

      await setupTeacherSession(page);
      await clickTeacherNewTask(page);

      const dialog = page.getByRole('dialog', { name: TASK_DIALOG_NAME_RE });
      await expect(dialog).toBeVisible();

      await dialog.getByLabel('Titre *').fill(`Tâche e2e modal ${Date.now()}`);
      const longText = 'Texte long e2e '.repeat(220);
      await dialog.getByLabel('Description').fill(longText);

      const scrollState = await dialog.evaluate((el) => {
        const hasOverflow = el.scrollHeight > el.clientHeight;
        el.scrollTop = el.scrollHeight;
        return { hasOverflow, scrollTop: el.scrollTop, maxScroll: el.scrollHeight - el.clientHeight };
      });
      if (scrollState.hasOverflow) {
        expect(scrollState.scrollTop).toBeGreaterThan(0);
      }

      const submitBtn = dialog.locator('button.btn-primary.btn-full').first();
      await expect(submitBtn).toBeVisible();
      await expect(dialog.locator('.modal-close')).toBeVisible();

      await closeDialogSafely(page, dialog);
    });
  });
}
