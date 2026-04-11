/**
 * Amorçage / nettoyage des entités visite (zones, repères) via l’API prof,
 * pour des scénarios e2e déterministes (ex. mascotte).
 * Les données sont sur la carte **n3** : l’onglet visite s’ouvre souvent sur ce plan pour les élèves affiliés N3.
 */

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function getTeacherBearerToken(page) {
  const t = await page.evaluate(() => localStorage.getItem('foretmap_teacher_token') || '');
  if (!t) {
    throw new Error('foretmap_teacher_token absent : activer les droits étendus avant les appels API visite.');
  }
  return t;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, string>} headers
 */
async function postVisitZone(page, headers, body) {
  const res = await page.request.post('/api/visit/zones', { headers, data: body });
  if (!res.ok()) {
    throw new Error(`POST /api/visit/zones ${res.status()}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, string>} headers
 */
async function postVisitMarker(page, headers, body) {
  const res = await page.request.post('/api/visit/markers', { headers, data: body });
  if (!res.ok()) {
    throw new Error(`POST /api/visit/markers ${res.status()}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} token
 * @param {string} zoneId
 */
async function deleteVisitZone(page, token, zoneId) {
  const res = await page.request.delete(`/api/visit/zones/${encodeURIComponent(zoneId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} token
 * @param {string} markerId
 */
async function deleteVisitMarker(page, token, markerId) {
  const res = await page.request.delete(`/api/visit/markers/${encodeURIComponent(markerId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok();
}

/**
 * Crée zone + repères sur la carte **n3** (repère « entrée » pour le placement initial mascotte).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ token: string, suffix: string, n3: { zoneId: string, markerAId: string, markerBId: string, entranceId: string } }>}
 */
async function seedVisitMascotContent(page) {
  const token = await getTeacherBearerToken(page);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const zone = await postVisitZone(page, headers, {
    map_id: 'n3',
    name: `E2E mascotte zone ${suffix}`,
    points: [
      { xp: 40, yp: 40 },
      { xp: 60, yp: 40 },
      { xp: 50, yp: 55 },
    ],
    sort_order: 0,
  });

  const markerA = await postVisitMarker(page, headers, {
    map_id: 'n3',
    x_pct: 12,
    y_pct: 50,
    label: `E2E mascotte A ${suffix}`,
    emoji: '📍',
    sort_order: 1,
  });

  const markerB = await postVisitMarker(page, headers, {
    map_id: 'n3',
    x_pct: 88,
    y_pct: 50,
    label: `E2E mascotte B ${suffix}`,
    emoji: '🧭',
    sort_order: 2,
  });

  const entranceN3 = await postVisitMarker(page, headers, {
    map_id: 'n3',
    x_pct: 22,
    y_pct: 18,
    label: `E2E N3 entrée mascotte ${suffix}`,
    emoji: '🚪',
    sort_order: 0,
  });

  return {
    token,
    suffix,
    n3: { zoneId: zone.id, markerAId: markerA.id, markerBId: markerB.id, entranceId: entranceN3.id },
  };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} token
 * @param {{ n3: { zoneId: string, markerAId: string, markerBId: string, entranceId: string } }} ids
 */
async function cleanupVisitMascotContent(page, token, ids) {
  const mid = [ids.n3.markerAId, ids.n3.markerBId, ids.n3.entranceId];
  for (const id of mid) {
    await deleteVisitMarker(page, token, id).catch(() => false);
  }
  await deleteVisitZone(page, token, ids.n3.zoneId).catch(() => false);
}

module.exports = {
  getTeacherBearerToken,
  seedVisitMascotContent,
  cleanupVisitMascotContent,
  postVisitZone,
  postVisitMarker,
  deleteVisitZone,
  deleteVisitMarker,
};
