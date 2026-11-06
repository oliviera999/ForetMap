'use strict';

/**
 * Chargeurs idempotents des fichiers de données « Tenir à deux » (`data/gl/tenir/*.json`,
 * README du dossier = contrat des clés). Une fonction `importXxx(db, json, options)` par
 * fichier, testable sans CLI (`scripts/gl-import-tenir.js`).
 *
 * Règles communes :
 * - upsert sur la clé du fichier (`INSERT … ON DUPLICATE KEY UPDATE`) ; les lignes absentes
 *   du fichier passent `actif = 0`, jamais supprimées ; aucune table `gl_game_*` touchée ;
 * - `dryRun` : tout est validé, rien n'est écrit ;
 * - refus (liste d'erreurs, rien d'écrit) sur toute incohérence (codes inconnus, polygone
 *   invalide, ordre à trou, valeur hors vocabulaire…) et sur toute **chaîne interdite** ou
 *   **terme du tiers `secret`** dans un champ visible des élèves (garde-fous § 1 de la spec).
 */

const { isPresentableQuestionRow } = require('./glQcmQuestionQuery');
const { loadRawCatalog } = require('./glFeuilletZonesCatalog');
const { sortMarkersByPath } = require('./shared/glBoardPathCore');
const { TENIR_SPELL_EFFECTS, validateSpellEffect } = require('./glSpellEffects');

/** Chaînes jamais visibles d'un élève (spec § 1 ; `Grise`, `Krâ`, `Kraa` sensibles à la casse). */
const FORBIDDEN_WORDS_CI = [
  'monstre',
  'ennemi',
  'attaque',
  'poursui',
  'corbeau',
  'faux',
  'raté',
  'ratée',
  'perdu',
  'classement',
];
const FORBIDDEN_WORDS_CS = ['Krâ', 'Kraa', 'Grise'];

const FORBIDDEN_CI_RE = new RegExp(
  `(^|[^\\p{L}])(${FORBIDDEN_WORDS_CI.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'iu',
);
const FORBIDDEN_CS_RE = new RegExp(`(^|[^\\p{L}])(${FORBIDDEN_WORDS_CS.join('|')})`, 'u');

/** Première chaîne interdite trouvée dans `text`, ou `null`. */
function findForbiddenString(text) {
  const s = String(text ?? '');
  if (!s) return null;
  const ci = FORBIDDEN_CI_RE.exec(s);
  if (ci) return ci[2];
  const cs = FORBIDDEN_CS_RE.exec(s);
  if (cs) return cs[2];
  return null;
}

/** Termes du glossaire lore de niveau `secret` (terme + variantes), minuscules. */
async function loadSecretTerms(db) {
  let rows = [];
  try {
    rows = await db.queryAll(
      "SELECT terme, variantes FROM gl_lore_glossary_terms WHERE niveau = 'secret' AND statut = 'actif'",
    );
  } catch (_) {
    rows = [];
  }
  const out = [];
  for (const row of rows) {
    const terms = [row.terme, ...String(row.variantes || '').split(/[;,|]/)];
    for (const t of terms) {
      const s = String(t || '')
        .trim()
        .toLowerCase();
      if (s.length >= 4) out.push(s);
    }
  }
  return [...new Set(out)];
}

/** Premier terme secret contenu dans `text`, ou `null`. */
function findSecretTerm(text, secretTerms) {
  const s = String(text ?? '').toLowerCase();
  if (!s) return null;
  for (const term of secretTerms || []) if (s.includes(term)) return term;
  return null;
}

/** Vérifie un champ visible : chaîne interdite et terme secret → erreur poussée dans `errors`. */
function checkVisible(errors, where, field, value, secretTerms) {
  const forbidden = findForbiddenString(value);
  if (forbidden) errors.push(`${where} : chaîne interdite « ${forbidden} » dans ${field}`);
  const secret = findSecretTerm(value, secretTerms);
  if (secret) errors.push(`${where} : terme secret « ${secret} » dans ${field}`);
}

const PLATEAU_BIOMES = Object.freeze({
  1: ['jungle_afc', 'savane'],
  2: ['sahara', 'foret_mediterraneenne'],
  3: ['foret_caducifoliee', 'landes'],
  4: ['taiga', 'toundra', 'desert_froid'],
});

const EXCLUDED_FEUILLETS = new Set([
  'ep-I-02',
  'ep-I-13',
  'ep-III-06',
  'ep-I-16',
  'ep-I-17',
  'ep-III-01',
  'ep-I-03',
  'ep-I-04',
]);

const CATEGORIES = new Set(['biome', 'ecosystemes', 'faune', 'flore', 'geologie', 'perturbations']);

const OLU_MOMENTS = new Set([
  'ouverture',
  'jet',
  'question',
  'fouille',
  'tenir',
  'voile',
  'sort',
  'seuil',
  'peripetie',
  'bestiaire',
  'oiseau',
  'erreur',
]);
const OLU_EXPRESSIONS = new Set([
  'neutre',
  'joie',
  'curieux',
  'surpris',
  'agace',
  'pensif',
  'explique',
  'peur',
]);

const SPELL_VOCAB = Object.freeze({
  peuple: ['any', 'gnome', 'unicorn', 'pacte', 'classe'],
  ressource: ['gemmes', 'coeurs', 'peuple', 'choix', 'pacte', 'cartes'],
  fenetre: [
    'avant_jet',
    'apres_jet',
    'jeu',
    'jeu_avant_fouille',
    'avant_jets_pacte',
    'activite',
    'seuil',
    'seuil_veillee',
    'fin_seance',
    'trimestre_3',
  ],
  limitePar: ['tour', 'seance', 'chapitre', 'trimestre', 'annee'],
  limitePortee: ['equipe', 'partie', 'eleve'],
  execution: ['auto', 'prof'],
  famille: ['commun', 'licornes', 'gnomes', 'pacte', 'travail', 'seuil', 'classe'],
});

function report(fichier) {
  return { fichier, count: 0, upserted: 0, desactives: 0, errors: [], warnings: [], dryRun: false };
}

function asArray(json, key) {
  const v = json?.[key];
  return Array.isArray(v) ? v : null;
}

// ---------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------

/** Polygone normalisé valide : ≥ 3 points `[x, y]` dans [0, 1]. */
function isValidPolygon(polygone) {
  if (!Array.isArray(polygone) || polygone.length < 3) return false;
  return polygone.every(
    (pt) =>
      Array.isArray(pt) &&
      pt.length === 2 &&
      pt.every((v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1),
  );
}

/** Centroïde (moyenne des sommets) d'un polygone normalisé. */
function polygonCentroid(polygone) {
  const pts = polygone.map(([x, y]) => [Number(x), Number(y)]);
  const sx = pts.reduce((a, p) => a + p[0], 0);
  const sy = pts.reduce((a, p) => a + p[1], 0);
  return { x: sx / pts.length, y: sy / pts.length };
}

/**
 * Rang de la case du chemin la plus proche d'un point normalisé (0-1) : index dans
 * `sortMarkersByPath(markers)` (coordonnées `x_pct`/`y_pct` en %).
 */
function nearestMarkerRank(markers, centre) {
  const sorted = sortMarkersByPath(markers);
  if (!sorted.length || !centre) return null;
  let best = null;
  let bestD = Infinity;
  sorted.forEach((m, idx) => {
    const dx = Number(m.x_pct) / 100 - centre.x;
    const dy = Number(m.y_pct) / 100 - centre.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  });
  return best;
}

async function loadChapterByPlateau(db, plateau) {
  return db.queryOne(
    'SELECT id FROM gl_chapters WHERE plateau_number = ? ORDER BY id ASC LIMIT 1',
    [plateau],
  );
}

async function loadPathMarkers(db, chapterId) {
  if (!chapterId) return [];
  return db.queryAll(
    'SELECT id, x_pct, y_pct, order_index FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC',
    [chapterId],
  );
}

/** Résout polygone inline ou `polygone_ref` (zones_feuillets.json, même feuillet). */
function resolveZonePolygon(zone, catalogById, errors, where) {
  if (zone.polygone != null) {
    if (!isValidPolygon(zone.polygone)) {
      errors.push(`${where} : polygone invalide (≥ 3 points dans [0,1])`);
      return null;
    }
    return zone.polygone.map(([x, y]) => [Number(x), Number(y)]);
  }
  if (zone.polygone_ref) {
    const ref = catalogById.get(String(zone.polygone_ref));
    if (!ref) {
      errors.push(`${where} : polygone_ref ${zone.polygone_ref} inconnu de zones_feuillets.json`);
      return null;
    }
    if (String(ref.feuillet_code) !== String(zone.feuillet_code)) {
      errors.push(`${where} : polygone_ref ${zone.polygone_ref} porte un autre feuillet`);
      return null;
    }
    if (!isValidPolygon(ref.polygone)) {
      errors.push(`${where} : polygone_ref ${zone.polygone_ref} sans polygone valide`);
      return null;
    }
    return ref.polygone.map(([x, y]) => [Number(x), Number(y)]);
  }
  return null;
}

/**
 * Calcule centroïde, `rang_case` et `geometrie_prete` d'une zone (utilisé à l'import et par
 * l'éditeur de polygones). `markers` : repères du chapitre.
 */
function computeZoneGeometry(polygone, markers) {
  if (!isValidPolygon(polygone)) {
    return { polygone: null, centre: null, rangCase: null, geometriePrete: 0 };
  }
  const centre = polygonCentroid(polygone);
  return {
    polygone,
    centre,
    rangCase: nearestMarkerRank(markers, centre),
    geometriePrete: 1,
  };
}

// ---------------------------------------------------------------------
// chasse-zones.json
// ---------------------------------------------------------------------

async function importChasseZones(db, json, { dryRun = false, catalog = null } = {}) {
  const out = report('chasse-zones');
  out.dryRun = !!dryRun;
  const zones = asArray(json, 'zones');
  if (!zones) {
    out.errors.push('chasse-zones : clé `zones[]` absente');
    return out;
  }
  out.count = zones.length;
  const secretTerms = await loadSecretTerms(db);
  const catalogById = new Map((catalog || safeLoadRawCatalog()).map((z) => [String(z.zone_id), z]));
  const seenKeys = new Set();
  const seenQuestions = new Set();
  const ordresByPlateau = new Map();
  const chaptersByPlateau = new Map();
  const markersByPlateau = new Map();
  const rows = [];

  for (const zone of zones) {
    const where = `zone ${zone?.zone_key || '?'}`;
    const key = String(zone?.zone_key || '').trim();
    if (!/^cz-p[1-4]-\d{2}$/.test(key)) out.errors.push(`${where} : zone_key invalide`);
    if (seenKeys.has(key)) out.errors.push(`${where} : zone_key en double`);
    seenKeys.add(key);
    const plateau = Number(zone?.plateau);
    if (![1, 2, 3, 4].includes(plateau)) {
      out.errors.push(`${where} : plateau hors 1-4`);
      continue;
    }
    const indice = String(zone?.indice || '');
    if (!indice || indice.length > 120) out.errors.push(`${where} : indice vide ou > 120`);
    checkVisible(out.errors, where, 'indice', indice, secretTerms);
    if (!CATEGORIES.has(String(zone?.theme_secours))) {
      out.errors.push(`${where} : theme_secours inconnu`);
    }
    const ordre = Number(zone?.ordre);
    if (!Number.isInteger(ordre) || ordre < 1) out.errors.push(`${where} : ordre invalide`);
    if (!ordresByPlateau.has(plateau)) ordresByPlateau.set(plateau, []);
    ordresByPlateau.get(plateau).push(ordre);

    // Feuillet : actif, même plateau, type feuillet|scene, jamais offert, hors exclusions.
    const feuilletCode = String(zone?.feuillet_code || '').trim();
    const feuillet = feuilletCode
      ? await db.queryOne(
          `SELECT feuillet_code, type, plateau_number, statut, offert_ouverture, offert_cloture, mode_apparition
             FROM gl_lore_feuillets WHERE feuillet_code = ? LIMIT 1`,
          [feuilletCode],
        )
      : null;
    if (!feuillet) out.errors.push(`${where} : feuillet_code ${feuilletCode} introuvable`);
    else {
      if (String(feuillet.statut) !== 'actif') out.errors.push(`${where} : feuillet inactif`);
      if (Number(feuillet.plateau_number) !== plateau) {
        out.errors.push(`${where} : feuillet d'un autre plateau`);
      }
      if (!['feuillet', 'scene'].includes(String(feuillet.type))) {
        out.errors.push(`${where} : type de feuillet non dessinable (${feuillet.type})`);
      }
      if (Number(feuillet.offert_ouverture) === 1 || Number(feuillet.offert_cloture) === 1) {
        out.errors.push(`${where} : feuillet offert (ouverture/clôture)`);
      }
      if (String(feuillet.mode_apparition) === 'biome' || feuilletCode.startsWith('page-')) {
        out.errors.push(`${where} : page biome interdite`);
      }
      if (EXCLUDED_FEUILLETS.has(feuilletCode)) out.errors.push(`${where} : feuillet exclu`);
    }

    // Question fixe : présentable, catégorie = thème de secours, unique sur le jeu.
    const questionCode = String(zone?.question_code || '')
      .trim()
      .toUpperCase();
    const question = questionCode
      ? await db.queryOne(
          `SELECT question_code, biome_slug, categorie_slug, niveau, statut, choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte
             FROM gl_qcm_questions WHERE question_code = ? LIMIT 1`,
          [questionCode],
        )
      : null;
    if (!question) out.errors.push(`${where} : question_code ${questionCode} introuvable`);
    else {
      if (!isPresentableQuestionRow(question)) {
        out.errors.push(`${where} : question ${questionCode} non présentable`);
      }
      if (String(question.categorie_slug) !== String(zone?.theme_secours)) {
        out.errors.push(`${where} : theme_secours ≠ catégorie de ${questionCode}`);
      }
      if (seenQuestions.has(questionCode)) {
        out.errors.push(`${where} : question ${questionCode} déjà utilisée par une autre zone`);
      }
      seenQuestions.add(questionCode);
    }

    // Géométrie.
    const polygone = resolveZonePolygon(zone || {}, catalogById, out.errors, where);
    if (!chaptersByPlateau.has(plateau)) {
      const chapter = await loadChapterByPlateau(db, plateau);
      chaptersByPlateau.set(plateau, chapter ? Number(chapter.id) : null);
      markersByPlateau.set(plateau, await loadPathMarkers(db, chapter?.id));
    }
    const geo = computeZoneGeometry(polygone, markersByPlateau.get(plateau));
    if (!geo.geometriePrete) {
      out.warnings.push(
        `${where} : sans géométrie (non chassable tant que le polygone n'est pas dessiné)`,
      );
    }
    rows.push({
      zone_key: key,
      chapter_id: chaptersByPlateau.get(plateau),
      plateau,
      feuillet_code: feuilletCode,
      titre_prive: String(zone?.titre_prive || '').slice(0, 255),
      indice,
      polygone_json: geo.polygone ? JSON.stringify(geo.polygone) : null,
      polygone_ref: zone?.polygone_ref ? String(zone.polygone_ref) : null,
      centre_x: geo.centre ? geo.centre.x : null,
      centre_y: geo.centre ? geo.centre.y : null,
      rang_case: geo.rangCase,
      geometrie_prete: geo.geometriePrete,
      question_code: questionCode,
      theme_secours: String(zone?.theme_secours || ''),
      ordre,
      actif: zone?.actif === false ? 0 : 1,
    });
  }

  for (const [plateau, ordres] of ordresByPlateau) {
    const sorted = [...ordres].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i] !== i + 1) {
        out.errors.push(`plateau ${plateau} : ordre avec trou ou doublon (${sorted.join(',')})`);
        break;
      }
    }
  }

  if (out.errors.length || dryRun) return out;

  for (const r of rows) {
    await db.execute(
      `INSERT INTO gl_chasse_zones
         (chapter_id, zone_key, plateau, feuillet_code, titre_prive, indice, polygone_json, polygone_ref,
          centre_x, centre_y, rang_case, geometrie_prete, question_code, theme_secours, ordre, actif, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         chapter_id = VALUES(chapter_id), plateau = VALUES(plateau), feuillet_code = VALUES(feuillet_code),
         titre_prive = VALUES(titre_prive), indice = VALUES(indice),
         polygone_json = COALESCE(VALUES(polygone_json), polygone_json),
         polygone_ref = VALUES(polygone_ref),
         centre_x = COALESCE(VALUES(centre_x), centre_x), centre_y = COALESCE(VALUES(centre_y), centre_y),
         rang_case = COALESCE(VALUES(rang_case), rang_case),
         geometrie_prete = GREATEST(VALUES(geometrie_prete), geometrie_prete),
         question_code = VALUES(question_code), theme_secours = VALUES(theme_secours),
         ordre = VALUES(ordre), actif = VALUES(actif), updated_at = NOW()`,
      [
        r.chapter_id,
        r.zone_key,
        r.plateau,
        r.feuillet_code,
        r.titre_prive,
        r.indice,
        r.polygone_json,
        r.polygone_ref,
        r.centre_x,
        r.centre_y,
        r.rang_case,
        r.geometrie_prete,
        r.question_code,
        r.theme_secours,
        r.ordre,
        r.actif,
      ],
    );
    out.upserted += 1;
  }
  out.desactives = await deactivateMissing(
    db,
    'gl_chasse_zones',
    'zone_key',
    rows.map((r) => r.zone_key),
  );
  return out;
}

function safeLoadRawCatalog() {
  try {
    const raw = loadRawCatalog();
    return Array.isArray(raw?.zones) ? raw.zones : [];
  } catch (_) {
    return [];
  }
}

/** Passe `actif = 0` aux lignes absentes du fichier (jamais de DELETE). */
async function deactivateMissing(db, table, keyColumn, keys) {
  if (!keys.length) return 0;
  const marks = keys.map(() => '?').join(', ');
  const result = await db.execute(
    `UPDATE ${table} SET actif = 0 WHERE actif = 1 AND ${keyColumn} NOT IN (${marks})`,
    keys,
  );
  return Number(result?.affectedRows || 0);
}

// ---------------------------------------------------------------------
// questions-lecture.json
// ---------------------------------------------------------------------

async function importQuestionsLecture(db, json, { dryRun = false, zones = null } = {}) {
  const out = report('questions-lecture');
  out.dryRun = !!dryRun;
  const questions = asArray(json, 'questions');
  if (!questions) {
    out.errors.push('questions-lecture : clé `questions[]` absente');
    return out;
  }
  out.count = questions.length;
  const secretTerms = await loadSecretTerms(db);
  const seen = new Set();
  const rows = [];
  for (const q of questions) {
    const key = String(q?.zone_key || '').trim();
    const where = `question de lecture ${key || '?'}`;
    if (!key) out.errors.push(`${where} : zone_key manquante`);
    if (seen.has(key)) out.errors.push(`${where} : zone_key en double`);
    seen.add(key);
    // En `--dry-run` enchaîné, les zones ne sont pas encore en base : le fichier
    // `chasse-zones.json` passé en option fait foi.
    const zoneFromFile = Array.isArray(zones?.zones)
      ? zones.zones.find((z) => String(z?.zone_key) === key) || null
      : null;
    const zone =
      zoneFromFile ||
      (key
        ? await db.queryOne(
            'SELECT zone_key, feuillet_code FROM gl_chasse_zones WHERE zone_key = ? LIMIT 1',
            [key],
          )
        : null);
    if (!zone) out.errors.push(`${where} : zone inconnue (charger chasse-zones d'abord)`);
    else if (String(zone.feuillet_code) !== String(q?.feuillet_code)) {
      out.errors.push(`${where} : feuillet_code ≠ celui de la zone`);
    }
    const choix = q?.choix && typeof q.choix === 'object' ? q.choix : null;
    const letters = ['A', 'B', 'C', 'D'];
    if (!choix || !letters.every((l) => String(choix[l] || '').trim())) {
      out.errors.push(`${where} : 4 choix A-D non vides attendus`);
    } else {
      const values = letters.map((l) => String(choix[l]).trim().toLowerCase());
      if (new Set(values).size !== 4) out.errors.push(`${where} : choix en double`);
      for (const l of letters) checkVisible(out.errors, where, `choix ${l}`, choix[l], secretTerms);
    }
    const reponse = String(q?.reponse || '').toUpperCase();
    if (!letters.includes(reponse)) out.errors.push(`${where} : reponse hors A-D`);
    if (!String(q?.question || '').trim()) out.errors.push(`${where} : question vide`);
    checkVisible(out.errors, where, 'question', q?.question, secretTerms);
    checkVisible(out.errors, where, 'feedback_correct', q?.feedback_correct, secretTerms);
    checkVisible(out.errors, where, 'feedback_incorrect', q?.feedback_incorrect, secretTerms);
    if (!/^Pas encore/.test(String(q?.feedback_incorrect || ''))) {
      out.errors.push(`${where} : feedback_incorrect doit commencer par « Pas encore »`);
    }
    rows.push({
      zone_key: key,
      feuillet_code: String(q?.feuillet_code || ''),
      question: String(q?.question || ''),
      choix_json: JSON.stringify(choix || {}),
      reponse,
      feedback_correct: q?.feedback_correct || null,
      feedback_incorrect: q?.feedback_incorrect || null,
    });
  }
  if (out.errors.length || dryRun) return out;
  for (const r of rows) {
    await db.execute(
      `INSERT INTO gl_tenir_questions_lecture
         (zone_key, feuillet_code, question, choix_json, reponse, feedback_correct, feedback_incorrect, actif, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE feuillet_code = VALUES(feuillet_code), question = VALUES(question),
         choix_json = VALUES(choix_json), reponse = VALUES(reponse), feedback_correct = VALUES(feedback_correct),
         feedback_incorrect = VALUES(feedback_incorrect), actif = 1, updated_at = NOW()`,
      [
        r.zone_key,
        r.feuillet_code,
        r.question,
        r.choix_json,
        r.reponse,
        r.feedback_correct,
        r.feedback_incorrect,
      ],
    );
    out.upserted += 1;
  }
  out.desactives = await deactivateMissing(
    db,
    'gl_tenir_questions_lecture',
    'zone_key',
    rows.map((r) => r.zone_key),
  );
  return out;
}

// ---------------------------------------------------------------------
// peripeties.json
// ---------------------------------------------------------------------

async function importPeripeties(db, json, { dryRun = false } = {}) {
  const out = report('peripeties');
  out.dryRun = !!dryRun;
  const items = asArray(json, 'peripeties');
  if (!items) {
    out.errors.push('peripeties : clé `peripeties[]` absente');
    return out;
  }
  out.count = items.length;
  const secretTerms = await loadSecretTerms(db);
  const rows = [];
  const seen = new Set();
  for (const p of items) {
    const id = String(p?.id || '').trim();
    const where = `péripétie ${id || '?'}`;
    if (!id) out.errors.push(`${where} : id manquant`);
    if (seen.has(id)) out.errors.push(`${where} : id en double`);
    seen.add(id);
    const plateau = Number(p?.plateau);
    if (!PLATEAU_BIOMES[plateau]) out.errors.push(`${where} : plateau hors 1-4`);
    else if (!PLATEAU_BIOMES[plateau].includes(String(p?.biome_slug))) {
      out.errors.push(
        `${where} : biome_slug ${p?.biome_slug} incohérent avec le plateau ${plateau}`,
      );
    }
    if (!String(p?.texte || '').trim()) out.errors.push(`${where} : texte vide`);
    checkVisible(out.errors, where, 'texte', p?.texte, secretTerms);
    rows.push({
      id,
      plateau,
      biome_slug: String(p?.biome_slug || ''),
      texte: String(p?.texte || ''),
      passable: p?.passable === false ? 0 : 1,
    });
  }
  if (out.errors.length || dryRun) return out;
  for (const r of rows) {
    await db.execute(
      `INSERT INTO gl_tenir_peripeties (id, plateau, biome_slug, texte, passable, actif)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE plateau = VALUES(plateau), biome_slug = VALUES(biome_slug),
         texte = VALUES(texte), passable = VALUES(passable), actif = 1`,
      [r.id, r.plateau, r.biome_slug, r.texte, r.passable],
    );
    out.upserted += 1;
  }
  out.desactives = await deactivateMissing(
    db,
    'gl_tenir_peripeties',
    'id',
    rows.map((r) => r.id),
  );
  return out;
}

// ---------------------------------------------------------------------
// titres.json
// ---------------------------------------------------------------------

const HONNEURS = ['eclaireurs', 'gardiens', 'passeurs', 'esprit'];
const SCEAUX = ['eclaireuses', 'mains'];
const BIOMES = ['tropiques', 'aride', 'tempere', 'grands_froids'];

/** Aplatit titres.json en lignes `gl_tenir_titres` (pur). */
function flattenTitres(json) {
  const rows = [];
  const biomes = json?.biomes && typeof json.biomes === 'object' ? json.biomes : {};
  const plateauOf = (biome) => Number(biomes?.[biome]?.plateau) || null;
  for (const h of HONNEURS) {
    const entry = json?.honneurs?.[h];
    if (!entry) continue;
    for (const biome of BIOMES) {
      if (!entry[biome]) continue;
      rows.push({
        code: `honneurs.${h}.${biome}`,
        famille: 'honneur',
        honneur: h,
        peuple: null,
        biome,
        plateau: plateauOf(biome),
        libelle: String(entry[biome]),
      });
    }
  }
  for (const s of SCEAUX) {
    const entry = json?.sceaux_peuple?.[s];
    if (!entry) continue;
    for (const biome of BIOMES) {
      if (!entry[biome]) continue;
      rows.push({
        code: `sceaux_peuple.${s}.${biome}`,
        famille: 'sceau_peuple',
        honneur: s,
        peuple: entry.peuple ? String(entry.peuple) : null,
        biome,
        plateau: plateauOf(biome),
        libelle: String(entry[biome]),
      });
    }
  }
  (Array.isArray(json?.missions) ? json.missions : []).forEach((libelle, idx) => {
    rows.push({
      code: `missions.${idx + 1}`,
      famille: 'mission',
      honneur: null,
      peuple: null,
      biome: null,
      plateau: null,
      libelle: String(libelle),
    });
  });
  (Array.isArray(json?.voyageur) ? json.voyageur : []).forEach((libelle, idx) => {
    rows.push({
      code: `voyageur.${idx + 1}`,
      famille: 'voyageur',
      honneur: null,
      peuple: null,
      biome: null,
      plateau: null,
      libelle:
        typeof libelle === 'string' ? libelle : String(libelle?.libelle || libelle?.nom || ''),
    });
  });
  return rows;
}

async function importTitres(db, json, { dryRun = false } = {}) {
  const out = report('titres');
  out.dryRun = !!dryRun;
  const rows = flattenTitres(json);
  out.count = rows.length;
  const secretTerms = await loadSecretTerms(db);
  for (const h of HONNEURS)
    if (!json?.honneurs?.[h]) out.errors.push(`titres : honneur ${h} absent`);
  for (const s of SCEAUX)
    if (!json?.sceaux_peuple?.[s]) out.errors.push(`titres : sceau ${s} absent`);
  for (const r of rows) {
    if (!r.libelle) out.errors.push(`titres : libellé vide pour ${r.code}`);
    checkVisible(out.errors, `titre ${r.code}`, 'libelle', r.libelle, secretTerms);
  }
  checkVisible(out.errors, 'titres', 'prefixe_double', json?.prefixe_double, secretTerms);
  if (out.errors.length || dryRun) return out;
  for (const r of rows) {
    await db.execute(
      `INSERT INTO gl_tenir_titres (code, famille, honneur, peuple, biome, plateau, libelle, actif)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE famille = VALUES(famille), honneur = VALUES(honneur), peuple = VALUES(peuple),
         biome = VALUES(biome), plateau = VALUES(plateau), libelle = VALUES(libelle), actif = 1`,
      [r.code, r.famille, r.honneur, r.peuple, r.biome, r.plateau, r.libelle],
    );
    out.upserted += 1;
  }
  out.desactives = await deactivateMissing(
    db,
    'gl_tenir_titres',
    'code',
    rows.map((r) => r.code),
  );
  if (json?.prefixe_double) {
    await db.execute(
      `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
       VALUES ('gameplay.tenir_titre_prefixe_double', ?, NULL, NOW())
       ON DUPLICATE KEY UPDATE updated_at = updated_at`,
      [JSON.stringify(String(json.prefixe_double))],
    );
  }
  return out;
}

// ---------------------------------------------------------------------
// missions.json
// ---------------------------------------------------------------------

async function importMissions(db, json, { dryRun = false, titres = null } = {}) {
  const out = report('missions');
  out.dryRun = !!dryRun;
  const items = asArray(json, 'missions');
  if (!items) {
    out.errors.push('missions : clé `missions[]` absente');
    return out;
  }
  out.count = items.length;
  const secretTerms = await loadSecretTerms(db);
  let sceaux;
  if (titres && Array.isArray(titres.missions)) {
    sceaux = new Set(titres.missions.map(String));
  } else {
    const rows = await db.queryAll(
      "SELECT libelle FROM gl_tenir_titres WHERE famille = 'mission' AND actif = 1",
    );
    sceaux = new Set(rows.map((r) => String(r.libelle)));
  }
  const rows = [];
  const seen = new Set();
  for (const m of items) {
    const id = String(m?.id || '').trim();
    const where = `mission ${id || '?'}`;
    if (!id) out.errors.push(`${where} : id manquant`);
    if (seen.has(id)) out.errors.push(`${where} : id en double`);
    seen.add(id);
    if (!['cooperative', 'absurde', 'classe'].includes(String(m?.type))) {
      out.errors.push(`${where} : type inconnu`);
    }
    if (!sceaux.has(String(m?.titre_sceau))) {
      out.errors.push(`${where} : titre_sceau absent de titres.json › missions`);
    }
    checkVisible(out.errors, where, 'titre_sceau', m?.titre_sceau, secretTerms);
    // `texte` est papier (jamais servi aux élèves) : contrôlé pour le secret seulement.
    const secret = findSecretTerm(m?.texte, secretTerms);
    if (secret) out.errors.push(`${where} : terme secret « ${secret} » dans texte`);
    rows.push({
      id,
      texte: String(m?.texte || ''),
      type: String(m?.type || 'cooperative'),
      titre_sceau: String(m?.titre_sceau || ''),
    });
  }
  if (out.errors.length || dryRun) return out;
  for (const r of rows) {
    await db.execute(
      `INSERT INTO gl_tenir_missions (id, texte, type, titre_sceau, actif) VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE texte = VALUES(texte), type = VALUES(type), titre_sceau = VALUES(titre_sceau), actif = 1`,
      [r.id, r.texte, r.type, r.titre_sceau],
    );
    out.upserted += 1;
  }
  out.desactives = await deactivateMissing(
    db,
    'gl_tenir_missions',
    'id',
    rows.map((r) => r.id),
  );
  return out;
}

// ---------------------------------------------------------------------
// badges.json
// ---------------------------------------------------------------------

const BADGE_SOURCES = new Set([
  'carnet_personnel_pages',
  'feuillets_lus',
  'fouilles_chaudes',
  'pages_trouvees_operateur',
  'dons',
  'veillee_semaines',
  'especes_etudiees',
  'biomes_etudies',
  'chapitres_clos',
  'missions_reussies',
  'olu_corrections',
  'defis_trame',
]);

async function importBadges(db, json, { dryRun = false } = {}) {
  const out = report('badges');
  out.dryRun = !!dryRun;
  const items = asArray(json, 'badges');
  if (!items) {
    out.errors.push('badges : clé `badges[]` absente');
    return out;
  }
  out.count = items.length;
  const secretTerms = await loadSecretTerms(db);
  const rows = [];
  const seen = new Set();
  for (const b of items) {
    const code = String(b?.code || '').trim();
    const where = `badge ${code || '?'}`;
    if (!code) out.errors.push(`${where} : code manquant`);
    if (seen.has(code)) out.errors.push(`${where} : code en double`);
    seen.add(code);
    const regle = b?.regle || {};
    if (!['compteur', 'serie_hebdo', 'saisie_prof', 'reserve'].includes(String(regle.type))) {
      out.errors.push(`${where} : regle.type inconnu`);
    }
    if (!BADGE_SOURCES.has(String(regle.source)))
      out.errors.push(`${where} : regle.source inconnue`);
    if (
      regle.type !== 'reserve' &&
      regle.type !== 'saisie_prof' &&
      !Number.isInteger(Number(regle.seuil))
    ) {
      out.errors.push(`${where} : seuil entier attendu`);
    }
    checkVisible(out.errors, where, 'nom', b?.nom, secretTerms);
    checkVisible(out.errors, where, 'critere', b?.critere, secretTerms);
    rows.push({
      code,
      nom: String(b?.nom || ''),
      critere: b?.critere || null,
      regle_type: String(regle.type || 'compteur'),
      seuil: regle.seuil == null ? null : Number(regle.seuil),
      source: regle.source ? String(regle.source) : null,
      icone: b?.icone ? String(b.icone) : null,
    });
  }
  if (out.errors.length || dryRun) return out;
  for (const r of rows) {
    await db.execute(
      `INSERT INTO gl_tenir_badges (code, nom, critere, regle_type, seuil, source, icone, actif)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE nom = VALUES(nom), critere = VALUES(critere), regle_type = VALUES(regle_type),
         seuil = VALUES(seuil), source = VALUES(source), icone = VALUES(icone), actif = 1`,
      [r.code, r.nom, r.critere, r.regle_type, r.seuil, r.source, r.icone],
    );
    out.upserted += 1;
  }
  out.desactives = await deactivateMissing(
    db,
    'gl_tenir_badges',
    'code',
    rows.map((r) => r.code),
  );
  return out;
}

// ---------------------------------------------------------------------
// olu-lignes.json
// ---------------------------------------------------------------------

async function importOluLignes(db, json, { dryRun = false } = {}) {
  const out = report('olu-lignes');
  out.dryRun = !!dryRun;
  const items = asArray(json, 'lignes');
  if (!items) {
    out.errors.push('olu-lignes : clé `lignes[]` absente');
    return out;
  }
  out.count = items.length;
  const secretTerms = await loadSecretTerms(db);
  const rows = [];
  const seen = new Set();
  for (const l of items) {
    const id = String(l?.id || '').trim();
    const where = `ligne Olu ${id || '?'}`;
    if (!id) out.errors.push(`${where} : id manquant`);
    if (seen.has(id)) out.errors.push(`${where} : id en double`);
    seen.add(id);
    if (!OLU_MOMENTS.has(String(l?.moment))) out.errors.push(`${where} : moment inconnu`);
    if (!OLU_EXPRESSIONS.has(String(l?.expression)))
      out.errors.push(`${where} : expression inconnue`);
    const texte = String(l?.texte || '');
    if (!texte.trim() || texte.length > 255) out.errors.push(`${where} : texte vide ou > 255`);
    checkVisible(out.errors, where, 'texte', texte, secretTerms);
    checkVisible(out.errors, where, 'correction', l?.correction, secretTerms);
    const variables = [...texte.matchAll(/\{(equipe|n|biome)\}/g)].map((m) => m[1]);
    if (l?.moment === 'erreur' && !String(l?.correction || '').trim()) {
      out.errors.push(`${where} : une erreur volontaire porte une correction`);
    }
    rows.push({
      id,
      moment: String(l?.moment || ''),
      expression: String(l?.expression || 'neutre'),
      texte,
      variables_json: JSON.stringify([...new Set(variables)]),
      correction: l?.correction ? String(l.correction).slice(0, 255) : null,
    });
  }
  if (out.errors.length || dryRun) return out;
  for (const r of rows) {
    await db.execute(
      `INSERT INTO gl_tenir_olu_lignes (id, moment, expression, texte, variables_json, correction, actif)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE moment = VALUES(moment), expression = VALUES(expression), texte = VALUES(texte),
         variables_json = VALUES(variables_json), correction = VALUES(correction), actif = 1`,
      [r.id, r.moment, r.expression, r.texte, r.variables_json, r.correction],
    );
    out.upserted += 1;
  }
  out.desactives = await deactivateMissing(
    db,
    'gl_tenir_olu_lignes',
    'id',
    rows.map((r) => r.id),
  );
  return out;
}

// ---------------------------------------------------------------------
// parures.json
// ---------------------------------------------------------------------

async function importParures(db, json, { dryRun = false } = {}) {
  const out = report('parures');
  out.dryRun = !!dryRun;
  const items = asArray(json, 'parures');
  if (!items) {
    out.errors.push('parures : clé `parures[]` absente');
    return out;
  }
  out.count = items.length;
  const secretTerms = await loadSecretTerms(db);
  const rows = [];
  const seen = new Set();
  for (const p of items) {
    const code = String(p?.code || '').trim();
    const where = `parure ${code || '?'}`;
    if (!code) out.errors.push(`${where} : code manquant`);
    if (seen.has(code)) out.errors.push(`${where} : code en double`);
    seen.add(code);
    const prix = Number(p?.prix);
    if (!Number.isInteger(prix) || prix < 2 || prix > 4)
      out.errors.push(`${where} : prix hors 2-4`);
    if (String(p?.ressource || 'choix') !== 'choix')
      out.errors.push(`${where} : ressource ≠ choix`);
    if (!['calque', 'pastille'].includes(String(p?.type)))
      out.errors.push(`${where} : type inconnu`);
    if (p?.pelage != null && !['bestiaire', 'neon'].includes(String(p.pelage))) {
      out.errors.push(`${where} : pelage inconnu`);
    }
    checkVisible(out.errors, where, 'nom', p?.nom, secretTerms);
    checkVisible(out.errors, where, 'description', p?.description, secretTerms);
    rows.push({
      code,
      nom: String(p?.nom || ''),
      description: p?.description || null,
      prix,
      ressource: 'choix',
      chapitre_min: Number(p?.chapitre_min) || 1,
      type: String(p?.type || 'pastille'),
      asset: p?.asset ? String(p.asset) : null,
      pelage: p?.pelage ? String(p.pelage) : null,
    });
  }
  if (out.errors.length || dryRun) return out;
  for (const r of rows) {
    await db.execute(
      `INSERT INTO gl_tenir_parures (code, nom, description, prix, ressource, chapitre_min, type, asset, pelage, actif)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE nom = VALUES(nom), description = VALUES(description), prix = VALUES(prix),
         ressource = VALUES(ressource), chapitre_min = VALUES(chapitre_min), type = VALUES(type),
         asset = VALUES(asset), pelage = VALUES(pelage), actif = 1`,
      [
        r.code,
        r.nom,
        r.description,
        r.prix,
        r.ressource,
        r.chapitre_min,
        r.type,
        r.asset,
        r.pelage,
      ],
    );
    out.upserted += 1;
  }
  out.desactives = await deactivateMissing(
    db,
    'gl_tenir_parures',
    'code',
    rows.map((r) => r.code),
  );
  return out;
}

// ---------------------------------------------------------------------
// passeur-plateau4.json
// ---------------------------------------------------------------------

async function importPasseur(db, json, { dryRun = false } = {}) {
  const out = report('passeur-plateau4');
  out.dryRun = !!dryRun;
  const plateaux = json?.plateaux && typeof json.plateaux === 'object' ? json.plateaux : null;
  if (!plateaux) {
    out.errors.push('passeur : clé `plateaux` absente');
    return out;
  }
  const secretTerms = await loadSecretTerms(db);
  const rows = [];
  for (const [plateauKey, entry] of Object.entries(plateaux)) {
    const plateau = Number(plateauKey);
    if (![1, 2, 3, 4].includes(plateau)) {
      out.errors.push(`passeur : plateau ${plateauKey} hors 1-4`);
      continue;
    }
    const pages = Array.isArray(entry?.pages) ? entry.pages : [];
    out.count += pages.length;
    const ordres = new Set();
    for (const page of pages) {
      const ordre = Number(page?.ordre);
      const where = `passeur p${plateau} ordre ${ordre}`;
      if (!Number.isInteger(ordre) || ordre < 1 || ordres.has(ordre)) {
        out.errors.push(`${where} : ordre invalide ou en double`);
      }
      ordres.add(ordre);
      const code = String(page?.feuillet_code || '').trim();
      const feuillet = code
        ? await db.queryOne(
            'SELECT feuillet_code, plateau_number, statut FROM gl_lore_feuillets WHERE feuillet_code = ? LIMIT 1',
            [code],
          )
        : null;
      if (!feuillet) out.errors.push(`${where} : feuillet ${code} introuvable`);
      else if (Number(feuillet.plateau_number) !== plateau) {
        out.errors.push(`${where} : feuillet d'un autre plateau`);
      }
      // Un titre qui nomme l'oiseau est toléré s'il est marqué `avertissement` (affiché sans titre).
      if (!page?.avertissement) checkVisible(out.errors, where, 'titre', page?.titre, secretTerms);
      else {
        const secret = findSecretTerm(page?.titre, secretTerms);
        if (secret) out.errors.push(`${where} : terme secret « ${secret} » dans titre`);
      }
      rows.push({
        plateau,
        ordre,
        feuillet_code: code,
        ordre_voyage: page?.ordre_voyage != null ? Number(page.ordre_voyage) : null,
        titre: page?.titre ? String(page.titre) : null,
        biome_slug: page?.biome_slug ? String(page.biome_slug) : null,
        justification: page?.justification ? String(page.justification) : null,
        avertissement: page?.avertissement ? String(page.avertissement).slice(0, 255) : null,
      });
    }
    const sorted = [...ordres].sort((a, b) => a - b);
    if (sorted.some((o, i) => o !== i + 1))
      out.errors.push(`passeur p${plateau} : ordre avec trou`);
  }
  if (out.errors.length || dryRun) return out;
  for (const r of rows) {
    await db.execute(
      `INSERT INTO gl_tenir_passeur_pages (plateau, ordre, feuillet_code, ordre_voyage, titre, biome_slug, justification, avertissement, actif)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE feuillet_code = VALUES(feuillet_code), ordre_voyage = VALUES(ordre_voyage),
         titre = VALUES(titre), biome_slug = VALUES(biome_slug), justification = VALUES(justification),
         avertissement = VALUES(avertissement), actif = 1`,
      [
        r.plateau,
        r.ordre,
        r.feuillet_code,
        r.ordre_voyage,
        r.titre,
        r.biome_slug,
        r.justification,
        r.avertissement,
      ],
    );
    out.upserted += 1;
  }
  // Désactivation par plateau (clé composite).
  for (const plateau of [1, 2, 3, 4]) {
    const kept = rows.filter((r) => r.plateau === plateau).map((r) => r.ordre);
    if (!kept.length) continue;
    const result = await db.execute(
      `UPDATE gl_tenir_passeur_pages SET actif = 0 WHERE plateau = ? AND actif = 1 AND ordre NOT IN (${kept.map(() => '?').join(', ')})`,
      [plateau, ...kept],
    );
    out.desactives += Number(result?.affectedRows || 0);
  }
  return out;
}

// ---------------------------------------------------------------------
// sorts.json
// ---------------------------------------------------------------------

/** Chapitre de `plateau_number` ; « retour » = plateau 4 tant qu'aucun chapitre de retour n'existe. */
async function resolveChapterIdForOuverture(db, key) {
  const plateau = key === 'retour' ? 4 : Number(key);
  const row = await loadChapterByPlateau(db, plateau);
  return row ? Number(row.id) : null;
}

function validateSpellEntry(spell, errors, secretTerms) {
  const code = String(spell?.code || '').trim();
  const where = `sort ${code || '?'}`;
  if (!/^SL\d{3}$/.test(code)) errors.push(`${where} : code SL### attendu`);
  if (!String(spell?.nom || '').trim()) errors.push(`${where} : nom vide`);
  if (!SPELL_VOCAB.famille.includes(String(spell?.famille)))
    errors.push(`${where} : famille inconnue`);
  if (!SPELL_VOCAB.peuple.includes(String(spell?.peuple))) errors.push(`${where} : peuple inconnu`);
  if (!SPELL_VOCAB.ressource.includes(String(spell?.ressource)))
    errors.push(`${where} : ressource inconnue`);
  if (!SPELL_VOCAB.fenetre.includes(String(spell?.fenetre)))
    errors.push(`${where} : fenêtre inconnue`);
  if (!SPELL_VOCAB.execution.includes(String(spell?.execution)))
    errors.push(`${where} : execution inconnue`);
  if (!Number.isInteger(Number(spell?.cout)) || Number(spell.cout) < 0)
    errors.push(`${where} : coût invalide`);
  if (spell?.limite != null) {
    const l = spell.limite;
    if (!SPELL_VOCAB.limitePar.includes(String(l?.par)))
      errors.push(`${where} : limite.par inconnu`);
    if (!SPELL_VOCAB.limitePortee.includes(String(l?.portee)))
      errors.push(`${where} : limite.portee inconnue`);
    if (!Number.isInteger(Number(l?.n)) || Number(l.n) < 1)
      errors.push(`${where} : limite.n ≥ 1 attendu`);
  }
  const ouverture = spell?.chapitre_ouverture;
  if (!(ouverture === 'retour' || [1, 2, 3, 4].includes(Number(ouverture)))) {
    errors.push(`${where} : chapitre_ouverture hors 1-4 / retour`);
  }
  checkVisible(errors, where, 'nom', spell?.nom, secretTerms);
  checkVisible(errors, where, 'effet_court', spell?.effet_court, secretTerms);
  const effet = spell?.effet_auto_json ?? TENIR_SPELL_EFFECTS[code] ?? null;
  if (effet != null) {
    const problem = validateSpellEffect(effet);
    if (problem) errors.push(`${where} : effet_auto_json invalide (${problem})`);
  } else if (String(spell?.execution) === 'auto') {
    errors.push(`${where} : exécution auto sans effet_auto_json`);
  }
  return effet;
}

async function importSorts(db, json, { dryRun = false } = {}) {
  const out = report('sorts');
  out.dryRun = !!dryRun;
  const sorts = asArray(json, 'sorts');
  if (!sorts) {
    out.errors.push('sorts : clé `sorts[]` absente');
    return out;
  }
  out.count = sorts.length;
  const secretTerms = await loadSecretTerms(db);
  const rows = [];
  const seen = new Set();
  for (const spell of sorts) {
    const code = String(spell?.code || '').trim();
    if (seen.has(code)) out.errors.push(`sort ${code} : code en double`);
    seen.add(code);
    const effet = validateSpellEntry(spell, out.errors, secretTerms);
    rows.push({
      code,
      nom: String(spell?.nom || ''),
      famille: String(spell?.famille || ''),
      peuple: String(spell?.peuple || 'any'),
      cout: Number(spell?.cout) || 0,
      ressource: String(spell?.ressource || 'choix'),
      fenetre: String(spell?.fenetre || 'jeu'),
      limite_json: spell?.limite ? JSON.stringify(spell.limite) : null,
      cible: spell?.cible ? String(spell.cible).slice(0, 120) : null,
      execution: String(spell?.execution || 'prof'),
      effet_court: spell?.effet_court ? String(spell.effet_court) : null,
      effet_auto_json: effet ? JSON.stringify(effet) : null,
    });
  }
  const ouverture =
    json?.ouverture_par_chapitre && typeof json.ouverture_par_chapitre === 'object'
      ? json.ouverture_par_chapitre
      : {};
  const known = new Set(rows.map((r) => r.code));
  for (const [key, codes] of Object.entries(ouverture)) {
    if (!(key === 'retour' || [1, 2, 3, 4].includes(Number(key)))) {
      out.errors.push(`ouverture_par_chapitre : clé ${key} inconnue`);
    }
    for (const c of Array.isArray(codes) ? codes : []) {
      if (!known.has(String(c)))
        out.errors.push(`ouverture_par_chapitre.${key} : sort ${c} absent du fichier`);
    }
  }
  if (out.errors.length || dryRun) return out;

  for (const r of rows) {
    // caster_kind historique : `pacte` et `classe` gardent `any` (le peuple v2 fait foi).
    const casterKind = ['gnome', 'unicorn'].includes(r.peuple) ? r.peuple : 'any';
    const coutGemmes = r.ressource === 'gemmes' ? r.cout : 0;
    const coutCoeurs = r.ressource === 'coeurs' ? r.cout : 0;
    await db.execute(
      `INSERT INTO gl_spells
         (spell_code, category_slug, nom, cout_gemmes, cout_coeurs, cible, effet_court, statut,
          approval_mode, cast_scope, caster_kind, famille, peuple, cout, ressource, fenetre, limite_json,
          execution, effet_auto_json, tenir_v2, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'officiel', ?, 'any', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE nom = VALUES(nom), cout_gemmes = VALUES(cout_gemmes), cout_coeurs = VALUES(cout_coeurs),
         cible = VALUES(cible), effet_court = VALUES(effet_court), statut = 'officiel',
         approval_mode = VALUES(approval_mode), caster_kind = VALUES(caster_kind), famille = VALUES(famille),
         peuple = VALUES(peuple), cout = VALUES(cout), ressource = VALUES(ressource), fenetre = VALUES(fenetre),
         limite_json = VALUES(limite_json), execution = VALUES(execution), effet_auto_json = VALUES(effet_auto_json),
         tenir_v2 = 1, updated_at = NOW()`,
      [
        r.code,
        spellCategoryFor(r.famille),
        r.nom,
        coutGemmes,
        coutCoeurs,
        r.cible,
        r.effet_court,
        r.execution === 'prof' ? 'mj_required' : 'auto',
        casterKind,
        r.famille,
        r.peuple,
        r.cout,
        r.ressource,
        r.fenetre,
        r.limite_json,
        r.execution,
        r.effet_auto_json,
      ],
    );
    out.upserted += 1;
  }
  // Sorts v2 absents du fichier → `propose` (jamais supprimés).
  const marks = rows.map(() => '?').join(', ');
  const demoted = await db.execute(
    `UPDATE gl_spells SET statut = 'propose', updated_at = NOW()
      WHERE tenir_v2 = 1 AND statut = 'officiel' AND spell_code NOT IN (${marks})`,
    rows.map((r) => r.code),
  );
  out.desactives = Number(demoted?.affectedRows || 0);

  // Rattachements par chapitre : réécrits depuis `ouverture_par_chapitre` (cumulatifs : un sort
  // ouvert au chapitre 1 reste lançable aux chapitres 2, 3, 4).
  const byChapter = new Map();
  const keysOrdered = ['1', '2', '3', '4', 'retour'];
  let cumulative = [];
  for (const key of keysOrdered) {
    const codes = Array.isArray(ouverture[key]) ? ouverture[key].map(String) : [];
    cumulative = [...new Set([...cumulative, ...codes])];
    const chapterId = await resolveChapterIdForOuverture(db, key);
    if (!chapterId) {
      out.warnings.push(
        `ouverture_par_chapitre.${key} : aucun chapitre de plateau ${key === 'retour' ? 4 : key}`,
      );
      continue;
    }
    byChapter.set(chapterId, [...new Set([...(byChapter.get(chapterId) || []), ...cumulative])]);
  }
  for (const [chapterId, codes] of byChapter) {
    await db.execute('DELETE FROM gl_chapter_spells WHERE chapter_id = ?', [chapterId]);
    let idx = 0;
    for (const code of codes) {
      await db.execute(
        'INSERT INTO gl_chapter_spells (chapter_id, spell_code, order_index) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)',
        [chapterId, code, idx * 10],
      );
      idx += 1;
    }
  }
  return out;
}

function spellCategoryFor(famille) {
  switch (String(famille)) {
    case 'travail':
    case 'seuil':
      return 'pedagogique';
    case 'classe':
    case 'pacte':
      return 'meta_social';
    default:
      return 'mouvement';
  }
}

// ---------------------------------------------------------------------
// reglages-defaut.json
// ---------------------------------------------------------------------

const RAW_GAMEPLAY_KEYS = new Set([
  'max_power_points',
  'max_health_points',
  'lore_feuillet_retrigger',
  'lore_gemme_costs_enabled',
  'lore_heart_rewards_enabled',
  'feuillet_zone_traversal_enabled',
]);

/** Clé `gameplay.*` d'une clé plate du fichier de réglages. */
function settingKeyForFlat(flat) {
  return RAW_GAMEPLAY_KEYS.has(flat) ? `gameplay.${flat}` : `gameplay.tenir_${flat}`;
}

async function importReglagesDefaut(db, json, { dryRun = false, forcer = false } = {}) {
  const out = report('reglages-defaut');
  out.dryRun = !!dryRun;
  const defaut = json?.defaut && typeof json.defaut === 'object' ? json.defaut : null;
  if (!defaut) {
    out.errors.push('reglages-defaut : clé `defaut` absente');
    return out;
  }
  const { validateGlSettingValue } = require('./glSettings');
  const { ALLOWED_GAMEPLAY_SETTINGS } = require('./gl/adminRouteHelpers');
  const entries = [];
  for (const [flat, value] of Object.entries(defaut)) {
    const key = settingKeyForFlat(flat);
    if (!ALLOWED_GAMEPLAY_SETTINGS.has(key)) {
      out.errors.push(`reglages-defaut : clé ${flat} inconnue du registre`);
      continue;
    }
    const checked = validateGlSettingValue(key, value);
    if (checked.error) {
      out.errors.push(`reglages-defaut : ${flat} — ${checked.error}`);
      continue;
    }
    entries.push([key, checked.value]);
  }
  out.count = entries.length;
  const prologue = json?.profils?.prologue?.ecarts;
  if (!prologue || typeof prologue !== 'object')
    out.errors.push('reglages-defaut : profils.prologue.ecarts absent');
  if (out.errors.length || dryRun) return out;
  for (const [key, value] of entries) {
    const sql = forcer
      ? `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at) VALUES (?, ?, NULL, NOW())
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`
      : `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at) VALUES (?, ?, NULL, NOW())
         ON DUPLICATE KEY UPDATE updated_at = updated_at`;
    const result = await db.execute(sql, [key, JSON.stringify(value)]);
    if (Number(result?.affectedRows || 0) > 0) out.upserted += 1;
  }
  try {
    require('./glSettings').invalidateGameplayCache();
  } catch (_) {
    /* registre sans cache en test */
  }
  return out;
}

// ---------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------

const IMPORTERS = Object.freeze({
  'reglages-defaut': importReglagesDefaut,
  sorts: importSorts,
  'chasse-zones': importChasseZones,
  'questions-lecture': importQuestionsLecture,
  peripeties: importPeripeties,
  titres: importTitres,
  missions: importMissions,
  badges: importBadges,
  'olu-lignes': importOluLignes,
  parures: importParures,
  'passeur-plateau4': importPasseur,
});

/** Ordre de chargement de `--fichier tous`. */
const IMPORT_ORDER = Object.freeze(Object.keys(IMPORTERS));

module.exports = {
  FORBIDDEN_WORDS_CI,
  FORBIDDEN_WORDS_CS,
  PLATEAU_BIOMES,
  EXCLUDED_FEUILLETS,
  IMPORTERS,
  IMPORT_ORDER,
  findForbiddenString,
  findSecretTerm,
  loadSecretTerms,
  isValidPolygon,
  polygonCentroid,
  nearestMarkerRank,
  computeZoneGeometry,
  flattenTitres,
  settingKeyForFlat,
  importChasseZones,
  importQuestionsLecture,
  importPeripeties,
  importTitres,
  importMissions,
  importBadges,
  importOluLignes,
  importParures,
  importPasseur,
  importSorts,
  importReglagesDefaut,
};
