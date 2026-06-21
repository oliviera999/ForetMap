const { expect } = require('@playwright/test');

async function loginAsNewStudent(page) {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const firstName = `E2E${nonce}`;
  const lastName = 'Eleve';
  const password = '1234';
  const email = `e2e_${String(nonce).replace(/[^a-zA-Z0-9]/g, '_')}@example.com`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByLabel('Prénom', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Prénom', { exact: true }).fill(firstName);
  await page.getByLabel('Nom', { exact: true }).fill(lastName);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Email (optionnel)').fill(email);
  await page.getByLabel('Mon espace', { exact: true }).selectOption('both');
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(password);
  const registerDone = page.waitForResponse(
    (r) => r.url().includes('/api/auth/register') && r.request().method() === 'POST',
    { timeout: 90_000 },
  );
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  const registerResp = await registerDone;
  if (!registerResp.ok()) {
    const snippet = await registerResp.text().catch(() => '');
    throw new Error(
      `Inscription élève refusée (HTTP ${registerResp.status()}). ${snippet.slice(0, 240)}`,
    );
  }

  await page
    .getByRole('button', { name: /Déconnexion/ })
    .waitFor({ state: 'visible', timeout: 60_000 });
  // Inscription = profil visiteur ; la 1re connexion identifiant/mot de passe promeut en n3beur novice (droits tâches).
  await logoutToAuth(page);
  await page.goto('/');
  await loginByIdentifier(page, email, password);
  return { firstName, lastName, password, pseudo: '', email };
}

async function registerStudentWithProfile(page) {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const firstName = `E2E${nonce}`;
  const lastName = 'Eleve';
  const pseudo = `e2e_${nonce}`;
  const email = `e2e_${nonce}@example.com`;
  const password = '1234';

  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByLabel('Prénom', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Prénom', { exact: true }).fill(firstName);
  await page.getByLabel('Nom', { exact: true }).fill(lastName);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Mon espace', { exact: true }).selectOption('both');
  await page.getByLabel('Pseudo (optionnel)').fill(pseudo);
  await page.getByLabel('Email (optionnel)').fill(email);
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await page
    .getByRole('button', { name: /Déconnexion/ })
    .waitFor({ state: 'visible', timeout: 60_000 });
  await dismissProfilePromotionModalIfPresent(page);
  return { firstName, lastName, pseudo, email, password };
}

async function logoutToAuth(page) {
  await page.getByRole('button', { name: /Déconnexion/ }).click();
  await page.getByRole('button', { name: 'Connexion', exact: true }).waitFor({ state: 'visible' });
  await page
    .waitForFunction(
      () => !localStorage.getItem('foretmap_session') && !localStorage.getItem('foretmap_student'),
      null,
      { timeout: 15_000 },
    )
    .catch(() => {});
}

/**
 * La modale « nouveau palier » (progression auto) est au-dessus de la carte et bloque les clics e2e.
 */
async function dismissProfilePromotionModalIfPresent(page) {
  const cta = page.locator('.profile-promo-card__cta');
  if (await cta.isVisible({ timeout: 1200 }).catch(() => false)) {
    await cta.click();
    await cta.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  }
}

async function loginByIdentifier(page, identifier, password) {
  await page.getByLabel('Identifiant (pseudo ou email)').fill(identifier);
  await page.getByLabel('Mot de passe').fill(password);
  const loginResp = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
    { timeout: 90_000 },
  );
  await page.getByRole('button', { name: 'Se connecter 🌱' }).click();
  const resp = await loginResp;
  if (!resp.ok()) {
    const snippet = await resp.text().catch(() => '');
    throw new Error(`Connexion refusée (HTTP ${resp.status()}). ${snippet.slice(0, 240)}`);
  }
  const body = await resp.json().catch(() => ({}));
  const perms = Array.isArray(body?.auth?.permissions) ? body.auth.permissions : [];
  const roleSlug = String(body?.auth?.roleSlug || '').toLowerCase();
  const hasTaskPerms = perms.includes('tasks.assign_self') || perms.includes('tasks.unassign_self');
  const hasTeacherAccess = perms.includes('teacher.access');
  const okStudentRole = roleSlug && roleSlug !== 'visiteur';
  if (!hasTaskPerms && !hasTeacherAccess && !okStudentRole) {
    throw new Error(`Connexion sans droits tâches (role=${roleSlug || 'inconnu'}).`);
  }
  if (!body?.authToken) {
    throw new Error('Connexion : authToken absent dans la réponse serveur.');
  }
  await page
    .getByRole('button', { name: /Déconnexion/ })
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(
    (expectedToken) => {
      try {
        const raw = localStorage.getItem('foretmap_session');
        if (!raw) return false;
        const session = JSON.parse(raw);
        if (session?.token !== expectedToken) return false;
        const b64 = String(expectedToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = '='.repeat((4 - (b64.length % 4)) % 4);
        const claims = JSON.parse(atob(b64 + pad));
        return claims.elevated !== true;
      } catch (_) {
        return false;
      }
    },
    body.authToken,
    { timeout: 45_000 },
  );
  await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('foretmap_student');
      if (!raw) return;
      const student = JSON.parse(raw);
      if (!student || typeof student !== 'object') return;
      delete student.elevationStudentToken;
      localStorage.setItem('foretmap_student', JSON.stringify(student));
    } catch (_) {
      /* ignore */
    }
  });
  await syncStudentSessionToken(page);
  await dismissProfilePromotionModalIfPresent(page);
}

async function enableTeacherMode(
  page,
  pin = process.env.E2E_ELEVATION_PIN || process.env.TEACHER_PIN || '1234',
  options = {},
) {
  const { pinCardAlreadyOpen = false } = options;
  /* La promo « nouveau palier » recouvre l’en-tête ; la désactiver avant le cadenas évite des PIN bloqués ou une 2e élévation lente. */
  await dismissProfilePromotionModalIfPresent(page);
  await page.locator('header').waitFor({ state: 'visible', timeout: 25_000 });
  const lockBtn = page.locator('header button.lock-btn[aria-label*="droits étendus"]').first();
  await lockBtn.waitFor({ state: 'attached', timeout: 25_000 });
  const lockLabel = await lockBtn.getAttribute('aria-label');
  if (String(lockLabel || '').includes('Désactiver')) {
    await page.locator('.teacher-main .top-tabs').waitFor({ state: 'attached', timeout: 45_000 });
    await page
      .locator('.teacher-main .loader')
      .waitFor({ state: 'hidden', timeout: 90_000 })
      .catch(() => {});
    return;
  }
  if (!pinCardAlreadyOpen) {
    await lockBtn.scrollIntoViewIfNeeded().catch(() => {});
    await lockBtn.evaluate((el) => {
      el.click();
    });
    await page.locator('.pin-card .pin-input').waitFor({ state: 'visible', timeout: 25_000 });
  }
  await page.locator('.pin-card .pin-input').fill(pin);
  await dismissProfilePromotionModalIfPresent(page);
  const [elevateResp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/auth/elevate') && r.request().method() === 'POST',
      { timeout: 90_000 },
    ),
    page
      .locator('.pin-card')
      .getByRole('button', { name: 'Entrer', exact: true })
      .click({ force: true }),
  ]);
  if (!elevateResp.ok()) {
    const snippet = await elevateResp.text().catch(() => '');
    throw new Error(
      `Élévation PIN refusée (HTTP ${elevateResp.status()}). Vérifier E2E_ELEVATION_PIN / TEACHER_PIN et le PIN du rôle en BDD. ${snippet.slice(0, 240)}`,
    );
  }
  /* La modale PIN se ferme dans le même tick que `setAuthClaims` : attendre le retrait du DOM évite une course avec le bouton « Désactiver ». */
  await page
    .locator('.pin-card')
    .waitFor({ state: 'detached', timeout: 30_000 })
    .catch(() => {});
  await dismissProfilePromotionModalIfPresent(page);
  /* Attendre le JWT élevé dans le stockage (race validateStudentSession / merge auth). */
  await page.waitForFunction(
    () => {
      try {
        const pick = () => {
          try {
            const raw = localStorage.getItem('foretmap_session');
            if (raw) {
              const p = JSON.parse(raw);
              if (typeof p?.token === 'string' && p.token.split('.').length >= 2) return p.token;
            }
          } catch (_) {
            /* ignore */
          }
          try {
            const sr = localStorage.getItem('foretmap_student');
            if (sr) {
              const s = JSON.parse(sr);
              if (typeof s?.authToken === 'string' && s.authToken.split('.').length >= 2)
                return s.authToken;
            }
          } catch (_) {
            /* ignore */
          }
          return (
            localStorage.getItem('foretmap_auth_token') ||
            localStorage.getItem('foretmap_teacher_token')
          );
        };
        const t = pick();
        if (!t || String(t).split('.').length < 2) return false;
        const b64 = String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = '='.repeat((4 - (b64.length % 4)) % 4);
        const json = JSON.parse(atob(b64 + pad));
        return (
          json.elevated === true &&
          Array.isArray(json.permissions) &&
          json.permissions.includes('teacher.access')
        );
      } catch (_) {
        return false;
      }
    },
    null,
    { timeout: 90_000 },
  );
  /* Le JWT est en LS avant la réconciliation React du cadenas : attendre le DOM, sans Promise.race
     (le premier waitFor en échec faisait échouer toute la course). */
  await page.waitForFunction(
    () => {
      /* Plusieurs `lock-btn` dans l’en-tête (profil, vues rôle, déconnexion) : cibler uniquement l’élévation. */
      const btn = document.querySelector('header button.lock-btn[aria-label*="droits étendus"]');
      if (!btn) return false;
      if (btn.classList.contains('active')) return true;
      const aria = String(btn.getAttribute('aria-label') || '');
      return aria.includes('Désactiver');
    },
    null,
    { timeout: 45_000 },
  );
  await dismissProfilePromotionModalIfPresent(page);
  await page.locator('.teacher-main .top-tabs').waitFor({ state: 'attached', timeout: 45_000 });
  await page
    .locator('.teacher-main .loader')
    .waitFor({ state: 'hidden', timeout: 90_000 })
    .catch(() => {});
}

async function disableTeacherMode(page) {
  if (page.isClosed()) {
    throw new Error('Page fermée avant disableTeacherMode');
  }
  const lockBtn = page.locator('header button.lock-btn[aria-label*="droits étendus"]').first();
  const lockLabel = String((await lockBtn.getAttribute('aria-label').catch(() => '')) || '');
  if (lockLabel.includes('Désactiver')) {
    await dismissProfilePromotionModalIfPresent(page);
    await lockBtn.click({ force: true, timeout: 15_000 }).catch(() => {
      return lockBtn.evaluate((el) => {
        el.click();
      });
    });
    await page
      .waitForFunction(
        () => {
          const btn = document.querySelector(
            'header button.lock-btn[aria-label*="droits étendus"]',
          );
          if (!btn) return false;
          const aria = String(btn.getAttribute('aria-label') || '');
          return aria.includes('Activer');
        },
        null,
        { timeout: 25_000 },
      )
      .catch(() => {});
  }
  /* Après élévation, TasksView prof peut laisser `student` incohérent : recharger réaligne la session élève. */
  const meWait = page.waitForResponse(
    (r) => r.url().includes('/api/auth/me') && r.request().method() === 'GET' && r.ok(),
    { timeout: 60_000 },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: /Déconnexion/ })
    .waitFor({ state: 'visible', timeout: 60_000 });
  await meWait.catch(() => {});
  await page.waitForFunction(
    () => {
      try {
        const raw = localStorage.getItem('foretmap_session');
        if (!raw) return false;
        const session = JSON.parse(raw);
        if (session?.user?.userType !== 'student' || !session?.token) return false;
        const b64 = String(session.token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = '='.repeat((4 - (b64.length % 4)) % 4);
        const claims = JSON.parse(atob(b64 + pad));
        return claims.elevated !== true;
      } catch (_) {
        return false;
      }
    },
    null,
    { timeout: 45_000 },
  );
  await page
    .waitForResponse(
      (r) => r.url().includes('/api/students/register') && r.request().method() === 'POST',
      { timeout: 60_000 },
    )
    .catch(() => {});
  await page.waitForFunction(
    () => {
      try {
        const student = JSON.parse(localStorage.getItem('foretmap_student') || 'null');
        return !!(student?.id && student?.first_name && student?.last_name);
      } catch (_) {
        return false;
      }
    },
    null,
    { timeout: 45_000 },
  );
  await syncStudentSessionToken(page);
  await dismissProfilePromotionModalIfPresent(page);
}

/** Réaligne token + profil élève après désélévation (JWT / localStorage / droits tâches). */
async function syncStudentSessionToken(page) {
  const sync = await page.evaluate(async () => {
    const decodeJwt = (token) => {
      try {
        const b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = '='.repeat((4 - (b64.length % 4)) % 4);
        return JSON.parse(atob(b64 + pad));
      } catch (_) {
        return null;
      }
    };
    const readStudent = () => {
      try {
        return JSON.parse(localStorage.getItem('foretmap_student') || 'null');
      } catch (_) {
        return null;
      }
    };
    const readSession = () => {
      try {
        return JSON.parse(localStorage.getItem('foretmap_session') || 'null');
      } catch (_) {
        return null;
      }
    };
    const session = readSession();
    let token = session?.token || null;
    const student = readStudent() || session?.student || null;
    if (!token && student?.authToken) token = student.authToken;
    if (!token) return { ok: false, reason: 'token absent' };
    let claims = decodeJwt(token);
    if (claims?.elevated === true) {
      const fallback =
        (typeof student?.elevationStudentToken === 'string' &&
          student.elevationStudentToken.trim()) ||
        (typeof student?.authToken === 'string' && student.authToken.trim()) ||
        null;
      if (fallback && decodeJwt(fallback)?.elevated !== true) {
        token = fallback;
        claims = decodeJwt(token);
      }
    }
    const me = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!me.ok) return { ok: false, reason: 'auth/me refusé', status: me.status };
    const meBody = await me.json().catch(() => ({}));
    const finalToken = meBody?.refreshedToken || token;
    const mergedStudent = {
      ...(student && typeof student === 'object' ? student : {}),
      authToken: finalToken,
      auth: meBody?.auth || student?.auth || null,
    };
    delete mergedStudent.elevationStudentToken;
    localStorage.setItem('foretmap_student', JSON.stringify(mergedStudent));
    localStorage.setItem('foretmap_auth_token', finalToken);
    localStorage.removeItem('foretmap_teacher_token');
    const nextSession = {
      ...(session && typeof session === 'object' ? session : {}),
      token: finalToken,
      student: mergedStudent,
      user: {
        id: mergedStudent.auth?.canonicalUserId || mergedStudent.id || session?.user?.id || null,
        userType: 'student',
        displayName:
          mergedStudent.pseudo ||
          `${mergedStudent.first_name || ''} ${mergedStudent.last_name || ''}`.trim() ||
          session?.user?.displayName ||
          'Utilisateur',
        email: mergedStudent.email || session?.user?.email || null,
        avatar_path:
          mergedStudent.avatar_path ??
          mergedStudent.avatarPath ??
          session?.user?.avatar_path ??
          null,
      },
    };
    localStorage.setItem('foretmap_session', JSON.stringify(nextSession));
    const perms = Array.isArray(meBody?.auth?.permissions) ? meBody.auth.permissions : [];
    return {
      ok: perms.includes('tasks.assign_self') || perms.includes('tasks.unassign_self'),
      roleSlug: meBody?.auth?.roleSlug || null,
      permissions: perms.filter((p) => p.startsWith('tasks.')),
    };
  });
  if (!sync?.ok) {
    throw new Error(`Session élève non prête pour les tâches (${JSON.stringify(sync)}).`);
  }
}

async function assignStudentToTaskAsTeacher(page, taskId) {
  const result = await page.evaluate(async (id) => {
    const pickToken = () => {
      const elevated = localStorage.getItem('foretmap_teacher_token');
      if (elevated) return elevated;
      try {
        const session = JSON.parse(localStorage.getItem('foretmap_session') || 'null');
        return session?.token || null;
      } catch (_) {
        return null;
      }
    };
    let student = null;
    try {
      student = JSON.parse(localStorage.getItem('foretmap_student') || 'null');
    } catch (_) {
      student = null;
    }
    const token = pickToken();
    if (!token || !student?.id || !student?.first_name) {
      return { ok: false, status: 0, error: 'session prof/élève incomplète pour affectation' };
    }
    const r = await fetch(`/api/tasks/${id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        firstName: student.first_name,
        lastName: student.last_name,
        studentId: student.id,
      }),
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, error: text.slice(0, 240) };
  }, taskId);
  if (!result.ok) {
    throw new Error(
      `Affectation prof→élève refusée (HTTP ${result.status}). ${result.error || ''}`,
    );
  }
}

/** Vue tâches prof (split desktop ou onglet Tâches seul). */
function teacherTasksViewLocator(page) {
  return page.locator(
    '.teacher-main .tasks-view, .teacher-main .desktop-split-pane--tasks .tasks-view',
  );
}

function teacherNewTaskButton(page) {
  return teacherTasksViewLocator(page)
    .locator('button')
    .filter({ hasText: /Nouvelle tâche/ })
    .first();
}

async function waitForTeacherMapReady(page) {
  await dismissProfilePromotionModalIfPresent(page);
  await page.locator('img[alt^="Plan "]').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page
    .locator('.map-view-root .loader')
    .first()
    .waitFor({ state: 'hidden', timeout: 90_000 })
    .catch(() => {});
  await page
    .waitForResponse(
      (r) => r.url().includes('/api/zones') && r.request().method() === 'GET' && r.ok(),
      { timeout: 45_000 },
    )
    .catch(() => {});
  await page
    .locator('.map-zone-hit')
    .first()
    .waitFor({ state: 'attached', timeout: 45_000 })
    .catch(() => {});
}

/** Le premier `.map-zone-hit` peut être sous un repère : le clic ouvre la mauvaise modale. */
async function openFirstZoneModalFromMap(page) {
  await waitForTeacherMapReady(page);
  const errBanner = page.getByText('Une erreur s’est produite.');
  const zoneDlg = page.getByRole('dialog', { name: /^Zone / });
  const maxAttempts = 24;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await errBanner.isVisible().catch(() => false)) {
      throw new Error('Application en erreur (ErrorBoundary) sur la carte');
    }
    const count = await page.locator('.map-zone-hit').count();
    if (count === 0) break;
    const idx = attempt % count;
    const hit = page.locator('.map-zone-hit').nth(idx);
    const poly = hit.locator('polygon').first();
    if (await poly.count()) {
      await poly.click({ force: true, timeout: 10_000 });
    } else {
      await hit.click({ force: true, timeout: 10_000 });
    }
    if (!(await zoneDlg.isVisible().catch(() => false))) {
      await hit.evaluate((el) => {
        el.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
        );
      });
    }
    if (
      await zoneDlg
        .waitFor({ state: 'visible', timeout: 2_500 })
        .then(() => true)
        .catch(() => false)
    ) {
      return;
    }
    await page.keyboard.press('Escape');
    const close = page.locator('.modal-close').first();
    if (await close.isVisible({ timeout: 400 }).catch(() => false)) await close.click();
  }
  throw new Error('Aucune modale zone ouverte depuis la carte');
}

/** Réinitialise les filtres liste tâches (évite les listes vides e2e après vue élève + filtres carte/statut). */
async function resetTaskFiltersInTasksView(page) {
  try {
    const filters = page.locator('.task-filters select');
    const n = await filters.count();
    if (n === 0) return;
    await filters.nth(0).selectOption('all', { timeout: 5000 });
    if (n > 1) await filters.nth(1).selectOption('');
    if (n > 2) await filters.nth(2).selectOption('');
    if (n > 3) await filters.nth(3).selectOption('');
  } catch (_) {
    /* pas de barre de filtres */
  }
  const search = page.getByPlaceholder('🔍 Rechercher une tâche...');
  if (await search.isVisible({ timeout: 2500 }).catch(() => false)) {
    await search.fill('', { timeout: 8000, force: true }).catch(() => {});
  }
}

/**
 * Onglet Tâches : nav basse élève ou barre d’onglets prof (évite les boutons hors navigation).
 */
function tasksTabButton(page) {
  return page
    .locator('nav.bottom-nav')
    .getByRole('button', { name: /✅.*Tâches/ })
    .or(page.locator('.top-tabs').getByRole('button', { name: /✅.*Tâches/ }));
}

async function clickTasksTab(page) {
  await dismissProfilePromotionModalIfPresent(page);
  await page
    .locator('.teacher-main .top-tabs, nav.bottom-nav')
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 })
    .catch(() => {});

  const teacherTasksTab = page
    .locator('.teacher-main .top-tabs')
    .getByRole('button', { name: /Tâches/i })
    .first();
  if ((await teacherTasksTab.count()) > 0) {
    await teacherTasksTab.scrollIntoViewIfNeeded().catch(() => {});
    await teacherTasksTab.click({ force: true, timeout: 25_000 });
    return;
  }

  const topTab = page
    .locator('.top-tabs')
    .getByRole('button', { name: /✅.*Tâches/ })
    .first();
  if ((await topTab.count()) > 0) {
    await topTab.scrollIntoViewIfNeeded().catch(() => {});
    await topTab.click({ force: true, timeout: 25_000 });
    return;
  }

  const btn = tasksTabButton(page).first();
  await btn.waitFor({ state: 'visible', timeout: 25_000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ force: true, timeout: 25_000 });
}

async function fillTaskTitle(dialog, title) {
  const byPlaceholder = dialog.getByPlaceholder('Ex: Arroser les tomates');
  if (await byPlaceholder.isVisible({ timeout: 3000 }).catch(() => false)) {
    await byPlaceholder.fill(title);
    return;
  }
  await dialog.getByLabel('Titre *').fill(title);
}

async function openTeacherTasksTab(page) {
  await dismissProfilePromotionModalIfPresent(page);
  await page.locator('.teacher-main .top-tabs').waitFor({ state: 'visible', timeout: 60_000 });
  const tasksView = teacherTasksViewLocator(page);
  if (!(await tasksView.isVisible().catch(() => false))) {
    const splitTab = page
      .locator('.teacher-main .top-tabs')
      .getByRole('button', { name: /Cartes.*tâches/i })
      .first();
    if ((await splitTab.count()) > 0) {
      await splitTab.scrollIntoViewIfNeeded().catch(() => {});
      await splitTab.click({ force: true, timeout: 25_000 });
    } else {
      await clickTasksTab(page);
    }
  }
  await tasksView.waitFor({ state: 'visible', timeout: 90_000 });
  await page
    .locator('.teacher-main .loader, .teacher-main .tasks-view .loader')
    .first()
    .waitFor({ state: 'hidden', timeout: 120_000 })
    .catch(() => {});
  await page
    .getByRole('heading', { name: '✅ Tâches' })
    .waitFor({ state: 'visible', timeout: 45_000 })
    .catch(() => {});
  await resetTaskFiltersInTasksView(page);
}

async function clickTeacherNewTaskDomFallback(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector('.teacher-main .tasks-view') ||
      document.querySelector('.teacher-main .desktop-split-pane--tasks .tasks-view');
    if (!root) return { ok: false, reason: 'tasks-view absent' };
    const btn = [...root.querySelectorAll('button')].find((b) =>
      /Nouvelle tâche/.test(String(b.textContent || '')),
    );
    if (!btn) return { ok: false, reason: 'bouton absent dans tasks-view' };
    btn.scrollIntoView({ block: 'center', inline: 'nearest' });
    btn.click();
    return { ok: true };
  });
}

async function openStudentTasksTab(page) {
  await dismissProfilePromotionModalIfPresent(page);
  await page
    .locator('nav.bottom-nav')
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => {});
  await clickTasksTab(page);
  const tasksHeading = page.getByRole('heading', { name: '✅ Tâches' });
  await tasksHeading.waitFor({ state: 'attached', timeout: 25_000 });
  await tasksHeading.scrollIntoViewIfNeeded().catch(() => {});
  await tasksHeading.waitFor({ state: 'visible', timeout: 25_000 });
  await resetTaskFiltersInTasksView(page);
}

/**
 * Le temps réel recrée le DOM ; le JWT élevé peut expirer entre scénarios (serveur e2e réutilisé).
 * Clic natif via evaluate pour éviter les boucles « detached » de Playwright.
 */
/** Remplit le champ description (RichTextEditor / contenteditable) dans une modale tâche. */
async function fillTaskDescription(dialog, text) {
  const surface = dialog.locator('.rich-text-editor-surface').first();
  await surface.waitFor({ state: 'visible', timeout: 15_000 });
  await surface.evaluate((el, value) => {
    el.textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, text);
}

function isTaskCreateHttpResponse(response) {
  try {
    const method = response.request().method();
    if (method !== 'POST') return false;
    const path = new URL(response.url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/api/tasks/proposals')) return response.ok();
    if (path.endsWith('/api/tasks')) return response.ok() && !path.includes('/import');
    return false;
  } catch (_) {
    return false;
  }
}

function parseCreatedTaskId(response) {
  return response
    .json()
    .then((body) => body?.id ?? body?.task?.id ?? body?.taskId ?? null)
    .catch(() => null);
}

async function unassignTaskByApi(page, taskId) {
  const result = await page.evaluate(async (id) => {
    const decodeJwt = (token) => {
      try {
        const b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = '='.repeat((4 - (b64.length % 4)) % 4);
        return JSON.parse(atob(b64 + pad));
      } catch (_) {
        return null;
      }
    };
    const pickStudentAuth = () => {
      const mergeStudent = (base, extra) => ({
        ...(base && typeof base === 'object' ? base : {}),
        ...(extra && typeof extra === 'object' ? extra : {}),
      });
      try {
        const session = JSON.parse(localStorage.getItem('foretmap_session') || 'null');
        const legacy = JSON.parse(localStorage.getItem('foretmap_student') || 'null');
        if (session?.user?.userType === 'student' && session?.token) {
          const claims = decodeJwt(session.token);
          if (claims && claims.elevated !== true) {
            return { token: session.token, student: mergeStudent(legacy, session.student) };
          }
        }
      } catch (_) {
        /* ignore */
      }
      try {
        const student = JSON.parse(localStorage.getItem('foretmap_student') || 'null');
        const token = student?.authToken || student?.elevationStudentToken || '';
        if (token) {
          const claims = decodeJwt(token);
          if (claims && claims.elevated !== true) return { token, student };
        }
      } catch (_) {
        /* ignore */
      }
      return null;
    };
    const auth = pickStudentAuth();
    if (!auth?.token) return { ok: false, status: 0, error: 'JWT élève absent' };
    const student = auth.student || {};
    const r = await fetch(`/api/tasks/${id}/unassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({
        firstName: student.first_name || '',
        lastName: student.last_name || '',
        studentId: student.id || undefined,
      }),
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, error: text.slice(0, 240) };
  }, taskId);
  if (!result.ok) {
    throw new Error(`Retrait tâche (API) refusé (HTTP ${result.status}). ${result.error || ''}`);
  }
}

async function assignTaskByApi(page, taskId) {
  const result = await page.evaluate(async (id) => {
    const decodeJwt = (token) => {
      try {
        const b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = '='.repeat((4 - (b64.length % 4)) % 4);
        return JSON.parse(atob(b64 + pad));
      } catch (_) {
        return null;
      }
    };
    const pickStudentAuth = () => {
      const mergeStudent = (base, extra) => ({
        ...(base && typeof base === 'object' ? base : {}),
        ...(extra && typeof extra === 'object' ? extra : {}),
      });
      try {
        const session = JSON.parse(localStorage.getItem('foretmap_session') || 'null');
        const legacy = JSON.parse(localStorage.getItem('foretmap_student') || 'null');
        if (
          session?.user?.userType === 'student' &&
          typeof session.token === 'string' &&
          session.token
        ) {
          const claims = decodeJwt(session.token);
          if (claims && claims.elevated !== true) {
            return { token: session.token, student: mergeStudent(legacy, session.student) };
          }
        }
      } catch (_) {
        /* ignore */
      }
      try {
        const student = JSON.parse(localStorage.getItem('foretmap_student') || 'null');
        const token =
          typeof student?.authToken === 'string' && student.authToken.trim()
            ? student.authToken.trim()
            : typeof student?.elevationStudentToken === 'string'
              ? student.elevationStudentToken.trim()
              : '';
        if (token) {
          const claims = decodeJwt(token);
          if (claims && claims.elevated !== true) return { token, student };
        }
      } catch (_) {
        /* ignore */
      }
      return null;
    };
    const auth = pickStudentAuth();
    if (!auth?.token) {
      return { ok: false, status: 0, error: 'JWT élève non élevé absent' };
    }
    const student = auth.student || {};
    const meResp = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    const meBody = meResp.ok ? await meResp.json().catch(() => null) : null;
    const r = await fetch(`/api/tasks/${id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({
        firstName: student.first_name || '',
        lastName: student.last_name || '',
        studentId: student.id || undefined,
      }),
    });
    const text = await r.text();
    const claims = decodeJwt(auth.token);
    return {
      ok: r.ok,
      status: r.status,
      error: text.slice(0, 240),
      debug: {
        roleSlug: claims?.roleSlug || meBody?.auth?.roleSlug || null,
        elevated: claims?.elevated === true,
        userId: claims?.userId || null,
        studentId: student?.id || null,
        permissions: meBody?.auth?.permissions || claims?.permissions || [],
      },
    };
  }, taskId);
  if (!result.ok) {
    throw new Error(
      `Inscription tâche (API) refusée (HTTP ${result.status}). ${result.error || ''} ${JSON.stringify(result.debug || {})}`,
    );
  }
}

/** Clic « Je m'en occupe » + attente POST /assign et bouton post-inscription. */
async function enrollOnTaskCard(page, taskCard, options = {}) {
  const { taskTitle, taskId } = options;
  await dismissProfilePromotionModalIfPresent(page);
  if (taskTitle) {
    await resetTaskFiltersInTasksView(page);
    const search = page.getByPlaceholder('🔍 Rechercher une tâche...');
    if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
      await search.fill(taskTitle, { force: true, timeout: 10_000 }).catch(() => {});
    }
    taskCard = page.locator('.task-card', { hasText: taskTitle }).first();
    await expect(taskCard).toBeVisible({ timeout: 45_000 });
  }
  const cardLocator = taskTitle
    ? page.locator('.task-card', { hasText: taskTitle }).first()
    : taskCard;
  const enrollBtn = cardLocator.getByRole('button', { name: /Je m['\u2019]en occupe/i });
  await expect(enrollBtn).toBeVisible({ timeout: 45_000 });
  await expect(enrollBtn).toBeEnabled({ timeout: 15_000 });
  await enrollBtn.scrollIntoViewIfNeeded().catch(() => {});

  const clickAndWaitAssign = async () => {
    const assignResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/tasks\/\d+\/assign/.test(r.url()),
      { timeout: 60_000 },
    );
    const btnNow = cardLocator.getByRole('button', { name: /Je m['\u2019]en occupe/i });
    await btnNow.evaluate((el) => el.click());
    return assignResp;
  };

  let resp;
  try {
    resp = await clickAndWaitAssign();
  } catch (firstErr) {
    await dismissProfilePromotionModalIfPresent(page);
    if (taskId) {
      await assignTaskByApi(page, taskId);
      resp = null;
    } else {
      await expect(enrollBtn).toBeVisible({ timeout: 15_000 });
      resp = await clickAndWaitAssign();
    }
  }
  if (resp && !resp.ok()) {
    const snippet = await resp.text().catch(() => '');
    throw new Error(`Inscription tâche refusée (HTTP ${resp.status()}). ${snippet.slice(0, 240)}`);
  }
  if (!resp && taskId) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: /Déconnexion/ })
      .waitFor({ state: 'visible', timeout: 60_000 });
    await dismissProfilePromotionModalIfPresent(page);
    await openStudentTasksTab(page);
    if (taskTitle) {
      await resetTaskFiltersInTasksView(page);
      const search = page.getByPlaceholder('🔍 Rechercher une tâche...');
      if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
        await search.fill(taskTitle, { force: true, timeout: 10_000 }).catch(() => {});
      }
    }
  } else {
    await page
      .waitForResponse(
        (r) => r.url().includes('/api/tasks') && r.request().method() === 'GET' && r.ok(),
        { timeout: 60_000 },
      )
      .catch(() => {});
  }
  await dismissProfilePromotionModalIfPresent(page);
  const cardAfter = taskTitle
    ? page.locator('.task-card', { hasText: taskTitle }).first()
    : cardLocator;
  await expect
    .poll(
      async () =>
        await cardAfter.getByRole('button', { name: /Me retirer|Marquer terminée/i }).count(),
      { timeout: 90_000 },
    )
    .toBeGreaterThan(0);
}

/** Attend qu’une carte tâche portant ce titre soit visible (filtres + recherche). */
async function expectTaskCardWithTitle(page, taskTitle) {
  await resetTaskFiltersInTasksView(page);
  const search = page.getByPlaceholder('🔍 Rechercher une tâche...');
  if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
    await search.fill(taskTitle, { force: true, timeout: 10_000 }).catch(() => {});
  }
  await expect(page.locator('.task-card', { hasText: taskTitle }).first()).toBeVisible({
    timeout: 45_000,
  });
}

/** Soumet le formulaire « Nouvelle tâche » / proposition (évite scrollIntoView instable sur long formulaire). */
async function submitTaskFormDialog(page) {
  const dlg = page
    .locator(
      '[role="dialog"][aria-label="Nouvelle tâche"], [role="dialog"][aria-label="Dupliquer la tâche"], [role="dialog"][aria-label="Modifier la tâche"], [role="dialog"][aria-label="Proposer une tâche"]',
    )
    .first();
  await dlg.waitFor({ state: 'visible', timeout: 35_000 });
  const createResp = page.waitForResponse(isTaskCreateHttpResponse, { timeout: 60_000 });
  /* Un seul `btn-full` primaire en bas de modale ; `force` évite les blocages « scroll / stable » Playwright. */
  await dlg.locator('button.btn-primary.btn-full').last().click({ force: true, timeout: 60_000 });
  const resp = await createResp;
  if (!resp.ok()) {
    const snippet = await resp.text().catch(() => '');
    throw new Error(`Création tâche refusée (HTTP ${resp.status()}). ${snippet.slice(0, 240)}`);
  }
  await dlg.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  await resetTaskFiltersInTasksView(page);
  return parseCreatedTaskId(resp);
}

async function createTeacherTaskViaApi(page, taskTitle) {
  const taskId = await page.evaluate(async (title) => {
    const pickToken = () => {
      const elevated = localStorage.getItem('foretmap_teacher_token');
      if (elevated) return elevated;
      try {
        const raw = localStorage.getItem('foretmap_session');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.token) return parsed.token;
        }
      } catch (_) {
        /* ignore */
      }
      return localStorage.getItem('foretmap_auth_token');
    };
    const token = pickToken();
    if (!token) throw new Error('JWT prof absent pour création tâche');
    const r = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, required_students: 1 }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(JSON.stringify(body).slice(0, 240));
    return body?.id ?? null;
  }, taskTitle);
  if (!taskId) throw new Error('Création tâche API : id absent dans la réponse');
  return taskId;
}

/** Crée une tâche côté prof (UI prioritaire, repli API si modale bloquée). */
async function createTeacherTask(page, taskTitle, options = {}) {
  const { skipReload = false } = options;
  try {
    await clickTeacherNewTask(page);
    await page.getByPlaceholder('Ex: Arroser les tomates').fill(taskTitle);
    const taskId = await submitTaskFormDialog(page);
    if (taskId) return taskId;
  } catch (_) {
    /* UI lente ou modale instable : repli API avec JWT élevé. */
  }
  const taskId = await createTeacherTaskViaApi(page, taskTitle);
  if (!skipReload) {
    if (page.isClosed()) {
      throw new Error('Page fermée avant reload après création tâche');
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: /Déconnexion/ })
      .waitFor({ state: 'visible', timeout: 60_000 });
    await dismissProfilePromotionModalIfPresent(page);
    await openTeacherTasksTab(page).catch(() => {});
    await resetTaskFiltersInTasksView(page);
  }
  return taskId;
}

async function clickTeacherNewTask(page) {
  await dismissProfilePromotionModalIfPresent(page);
  const elevated =
    (await page
      .locator('header button.lock-btn.active')
      .isVisible()
      .catch(() => false)) ||
    (await page
      .getByRole('button', { name: 'Désactiver les droits étendus' })
      .isVisible()
      .catch(() => false));
  if (!elevated) {
    await enableTeacherMode(page);
  }
  await openTeacherTasksTab(page);
  const dlg = page
    .locator(
      '[role="dialog"][aria-label="Nouvelle tâche"], [role="dialog"][aria-label="Dupliquer la tâche"], [role="dialog"][aria-label="Modifier la tâche"], [role="dialog"][aria-label="Proposer une tâche"]',
    )
    .first();
  if (await dlg.isVisible().catch(() => false)) return;
  const btn = teacherNewTaskButton(page);
  await btn.waitFor({ state: 'attached', timeout: 120_000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  if (!(await btn.isVisible().catch(() => false))) {
    const dom = await clickTeacherNewTaskDomFallback(page);
    if (!dom.ok) {
      throw new Error(`Bouton « + Nouvelle tâche » introuvable : ${dom.reason}`);
    }
  } else {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await btn.click({ force: true, timeout: 15_000 }).catch(() => {});
      if (await dlg.isVisible().catch(() => false)) return;
      await page.waitForTimeout(120);
    }
  }
  await dlg.waitFor({ state: 'visible', timeout: 40_000 });
}

module.exports = {
  loginAsNewStudent,
  registerStudentWithProfile,
  logoutToAuth,
  loginByIdentifier,
  dismissProfilePromotionModalIfPresent,
  enableTeacherMode,
  disableTeacherMode,
  openFirstZoneModalFromMap,
  openTeacherTasksTab,
  openStudentTasksTab,
  teacherTasksViewLocator,
  clickTeacherNewTask,
  createTeacherTask,
  assignStudentToTaskAsTeacher,
  unassignTaskByApi,
  submitTaskFormDialog,
  fillTaskDescription,
  fillTaskTitle,
  expectTaskCardWithTitle,
  enrollOnTaskCard,
};
