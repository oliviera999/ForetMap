const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  openFirstZoneModalFromMap,
  openTeacherTasksTab,
  clickTeacherNewTask,
  fillTaskDescription,
  fillTaskTitle,
  dismissDiscoveryTourIfPresent,
} = require('./fixtures/auth.fixture');

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];
const TASK_DIALOG_SELECTOR =
  '[role="dialog"][aria-label="Nouvelle tâche"], [role="dialog"][aria-label="Dupliquer la tâche"], [role="dialog"][aria-label="Modifier la tâche"], [role="dialog"][aria-label="Proposer une tâche"]';

function taskDialogLocator(page) {
  return page.locator(TASK_DIALOG_SELECTOR).first();
}

async function expectDialogStableAndFitting(dialog, viewportHeight, options = {}) {
  const { pinCard = false, allowTallModal = false } = options;
  await expect(dialog).toBeVisible();
  let lastHeight = 0;
  let stableCount = 0;
  await expect
    .poll(
      async () => {
        const box = await dialog.boundingBox();
        const h = box ? Math.round(box.height) : 0;
        if (h > 0 && h === lastHeight) stableCount += 1;
        else stableCount = 0;
        lastHeight = h;
        return stableCount >= 2 ? h : 0;
      },
      { timeout: 10_000, intervals: [80, 120, 160] },
    )
    .toBeGreaterThan(0);
  const box = await dialog.boundingBox();
  expect(box).toBeTruthy();
  if (box) {
    if (!allowTallModal) {
      const maxHeight = pinCard
        ? Math.min(viewportHeight * 0.92, viewportHeight - 8)
        : viewportHeight - 8;
      expect(box.height).toBeLessThanOrEqual(maxHeight + (pinCard ? 12 : 0));
    }
    expect(box.width).toBeGreaterThan(120);
  }
}

async function closeDialogSafely(page, dialog) {
  const closeBtn = dialog.locator('.modal-close').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click({ force: true, noWaitAfter: true, timeout: 8000 }).catch(() =>
      closeBtn.evaluate((el) => {
        el.click();
      }),
    );
  } else {
    await page.keyboard.press('Escape');
  }
  await dialog.waitFor({ state: 'hidden', timeout: 15_000 }).catch(async () => {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  });
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

      await dismissDiscoveryTourIfPresent(page);
      await page.getByRole('button', { name: 'Connexion professeur' }).click({ timeout: 25_000 });
      const pinCard = page.locator('.pin-card');
      await expect(pinCard).toBeVisible({ timeout: 25_000 });
      await expectDialogStableAndFitting(pinCard, vp.height, { pinCard: true });
      await pinCard.getByRole('button', { name: 'Annuler' }).click();
      await enableTeacherMode(page);

      await openTeacherTasksTab(page);
      await clickTeacherNewTask(page);
      const taskModal = taskDialogLocator(page);
      await expectDialogStableAndFitting(taskModal, vp.height, { allowTallModal: vp.width <= 720 });
      await closeDialogSafely(page, taskModal);

      await page
        .locator('.teacher-main .top-tabs')
        .getByRole('button', { name: /Carte & Zones/ })
        .click();
      await page
        .waitForResponse(
          (r) => r.url().includes('/api/zones') && r.request().method() === 'GET' && r.ok(),
          { timeout: 45_000 },
        )
        .catch(() => {});
      await expect(page.locator('img[alt^="Plan "]').first()).toBeVisible({ timeout: 45_000 });
      const zoneCount = await page.locator('.map-zone-hit').count();
      if (zoneCount > 0) {
        await openFirstZoneModalFromMap(page);
        const zoneModal = page.locator('[role="dialog"][aria-label^="Zone "]').first();
        await expectDialogStableAndFitting(zoneModal, vp.height, { allowTallModal: true });
        await closeDialogSafely(page, zoneModal);
      }
    });

    test('smoke contenu long dans la modale de tâche', async ({ page }) => {
      test.setTimeout(240_000);

      await setupTeacherSession(page);
      await clickTeacherNewTask(page);

      const dialog = taskDialogLocator(page);
      await expect(dialog).toBeVisible();

      await fillTaskTitle(dialog, `Tâche e2e modal ${Date.now()}`);
      const longText = 'Texte long e2e '.repeat(80);
      await fillTaskDescription(dialog, longText);

      const scrollState = await dialog.evaluate((el) => {
        const hasOverflow = el.scrollHeight > el.clientHeight;
        el.scrollTop = el.scrollHeight;
        return {
          hasOverflow,
          scrollTop: el.scrollTop,
          maxScroll: el.scrollHeight - el.clientHeight,
        };
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
