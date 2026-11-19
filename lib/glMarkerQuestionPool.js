'use strict';

const {
  normalizeQuestionCode,
  normalizeQuestionPool,
  resolveBiomeSlugsForPool,
  resolveMarkerEventConfig,
} = require('./glMarkerEventConfig');
const {
  loadActiveQuestion,
  isPresentableQuestionRow,
  presentableQuestionError,
} = require('./glQcmQuestionQuery');
const {
  fisherYates,
  applyTextSearch,
  applySelectedCodes,
  applyExcludedCodes,
} = require('./shared/questionPoolFiltering');
const { NIVEAUX_ADMIS_SQL } = require('./glNiveauxAdmis');
const { GL_BIOME_REGISTRY } = require('./shared/glBiomesRegistryCore');

const QUESTION_POOL_SELECT = `
  SELECT question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
         niveau, difficulte, difficulte_label, tags, mots_cles, statut
    FROM gl_qcm_questions
`;

/**
 * @param {object} pool pool normalisé (`normalizeQuestionPool`)
 * @param {string[]} biomeSlugs biomes résolus
 * @param {{ niveauxAdmis?: string[]|null, usageTenir?: boolean }} [options] en mode « tenir »,
 *   la liste des niveaux admis **remplace** le filtre `niveaux` de la case (règle § 4 : tout le
 *   biome du chapitre, niveau 6ᵉ, les filtres cassés sont remplacés) ; `null` hors mode tenir.
 *   `usageTenir` : ne garde que les questions « posées en partie » (`usage_tenir = 1`,
 *   migration 345 : la taxonomie générée sort du tirage).
 */
function buildPoolQueryFilters(pool, biomeSlugs, { niveauxAdmis = null, usageTenir = false } = {}) {
  const params = [];
  let sql = `${QUESTION_POOL_SELECT} WHERE statut = 'actif'`;

  const slugs = Array.isArray(biomeSlugs) ? biomeSlugs.filter(Boolean) : [];
  if (slugs.length === 0) {
    return { sql: null, params, error: 'Aucun biome disponible pour le pool' };
  }
  sql += ` AND biome_slug IN (${slugs.map(() => '?').join(', ')})`;
  params.push(...slugs);

  const categorieSlugs = pool.categorieSlugs || [];
  if (categorieSlugs.length > 0) {
    sql += ` AND categorie_slug IN (${categorieSlugs.map(() => '?').join(', ')})`;
    params.push(...categorieSlugs);
  }

  const admis = Array.isArray(niveauxAdmis) ? niveauxAdmis.filter(Boolean) : [];
  const niveaux = admis.length > 0 ? admis : pool.niveaux || [];
  if (niveaux.length > 0) {
    sql += ` AND niveau IN (${niveaux.map(() => '?').join(', ')})`;
    params.push(...niveaux);
  }

  if (usageTenir) sql += ' AND usage_tenir = 1';

  if (pool.difficulteMin != null) {
    sql += ' AND difficulte >= ?';
    params.push(pool.difficulteMin);
  }
  if (pool.difficulteMax != null) {
    sql += ' AND difficulte <= ?';
    params.push(pool.difficulteMax);
  }

  sql += ` AND CHAR_LENGTH(TRIM(COALESCE(choix_a, ''))) > 0
           AND CHAR_LENGTH(TRIM(COALESCE(choix_b, ''))) > 0
           AND UPPER(TRIM(COALESCE(reponse_correcte, ''))) IN ('A','B','C','D','E')`;

  sql += ' ORDER BY biome_slug ASC, categorie_slug ASC, numero_dans_categorie ASC';
  return { sql, params, error: null };
}

/**
 * @param {object} options
 * @param {string|null} [options.sousBiomeSlug] sous-biome de la case, lu par le mode `sous_biome`
 * @param {boolean} [options.tenir] partie « Tenir à deux » : le tirage se limite aux niveaux
 *   admis (`lib/glNiveauxAdmis.js`), quels que soient les filtres de la case, et aux questions
 *   « posées en partie » (`usage_tenir = 1`)
 */
async function queryQuestionPool(
  deps,
  { pool, chapterBiomeSlugs, excludeCodes = [], sousBiomeSlug = null, tenir = false },
) {
  const normalizedPool = normalizeQuestionPool(pool);
  const biomeSlugs = resolveBiomeSlugsForPool(normalizedPool, chapterBiomeSlugs, sousBiomeSlug);
  const { sql, params, error } = buildPoolQueryFilters(normalizedPool, biomeSlugs, {
    niveauxAdmis: tenir ? NIVEAUX_ADMIS_SQL : null,
    usageTenir: tenir,
  });
  if (!sql) return { items: [], error };

  let rows = await deps.queryAll(sql, params);
  rows = applyTextSearch(rows, normalizedPool.searchQuery);
  rows = applySelectedCodes(rows, normalizedPool.selectedQuestionCodes);
  rows = applyExcludedCodes(rows, excludeCodes);

  return { items: rows, error: null };
}

function toPoolPreviewItem(row) {
  return {
    question_code: row.question_code,
    question: row.question,
    biome_slug: row.biome_slug,
    categorie_slug: row.categorie_slug,
    niveau: row.niveau,
    difficulte: row.difficulte,
    difficulte_label: row.difficulte_label,
  };
}

async function previewQuestionPool(deps, options) {
  const { items } = await queryQuestionPool(deps, options);
  return items.map(toPoolPreviewItem);
}

const { drawLoreQuestionFromMarker } = require('./glMarkerLoreQuestionPool');
const { normalizeQuestionSet } = require('./glMarkerEventConfig');

/**
 * @param {{ tenir?: boolean }} [options] `tenir: true` borne le tirage aléatoire aux niveaux
 *   admis (mode « Tenir à deux ») ; une question fixe ou de lore n'est pas rebornée.
 */
async function drawQuestionFromMarker(
  deps,
  marker,
  chapterBiomeSlugs,
  excludeCodes = [],
  chapterPlateauNumber = null,
  { tenir = false } = {},
) {
  const eventConfig = resolveMarkerEventConfig(marker);
  const questionCfg = eventConfig?.question;
  const qcmSet = normalizeQuestionSet(questionCfg?.set);
  if (qcmSet === 'lore') {
    return drawLoreQuestionFromMarker(deps, marker, chapterPlateauNumber, excludeCodes);
  }
  if (!questionCfg) {
    return { error: 'Repère sans configuration question', questionCode: null, qcmSet: 'biome' };
  }

  if (questionCfg.mode === 'fixed') {
    const code = normalizeQuestionCode(questionCfg.fixedQuestionCode);
    if (!code)
      return { error: 'Question fixe non configurée', questionCode: null, qcmSet: 'biome' };
    const row = await loadActiveQuestion(deps, code);
    if (!row)
      return {
        error: 'Question fixe introuvable ou inactive',
        questionCode: null,
        qcmSet: 'biome',
      };
    if (!isPresentableQuestionRow(row)) {
      return { error: presentableQuestionError(code), questionCode: null, qcmSet: 'biome' };
    }
    return { questionCode: code, error: null, qcmSet: 'biome' };
  }

  const { items, error } = await queryQuestionPool(deps, {
    pool: questionCfg.pool,
    chapterBiomeSlugs,
    excludeCodes,
    sousBiomeSlug: marker?.sous_biome_slug ?? marker?.sousBiomeSlug ?? null,
    tenir,
  });
  if (error) return { error, questionCode: null, qcmSet: 'biome' };
  if (items.length === 0) {
    return {
      error: 'Aucune question présentable dans le pool (vérifiez les choix QCM)',
      questionCode: null,
      qcmSet: 'biome',
    };
  }

  for (const candidate of fisherYates(items)) {
    const code = String(candidate.question_code || '')
      .trim()
      .toUpperCase();
    if (!code) continue;
    const row = await loadActiveQuestion(deps, code);
    if (isPresentableQuestionRow(row)) {
      return { questionCode: code, error: null, qcmSet: 'biome' };
    }
  }

  return {
    error: 'Aucune question présentable dans le pool (vérifiez les choix QCM)',
    questionCode: null,
    qcmSet: 'biome',
  };
}

// ---------------------------------------------------------------------
// « Tenir à deux » : tirage de la question d'une case (ensemble unifié, M9)
// ---------------------------------------------------------------------

/** Plafond de difficulté par plateau (M9) : `{1: 2, 2: 3, 3: 3, 4: 3}`. */
const PLAFOND_DIFFICULTE_DEFAUT = Object.freeze({ 1: 2, 2: 3, 3: 3, 4: 3 });
/**
 * Part des questions tirées dans un biome déjà traversé, à partir du plateau 2 (M9). Le réglage
 * `tenir_questions_spirale` est en pour cent (20) ; une fraction (0,2) est aussi lue.
 */
const SPIRALE_DEFAUT = 0.2;
const QUESTION_VIVE_RE = /^VQCM\d{4}$/;

function resolvePlafondDifficulte(resolved, plateau) {
  const map = resolved?.questions_difficulte_max_par_plateau || PLAFOND_DIFFICULTE_DEFAUT;
  const n = Number(map[String(plateau)] ?? PLAFOND_DIFFICULTE_DEFAUT[String(plateau)]);
  return Number.isInteger(n) && n >= 1 ? n : 3;
}

/**
 * Part des questions tirées dans un biome déjà traversé. Le réglage est un entier de 0 à 100
 * (pour cent) : 1 vaut donc 1 %, pas 100 %. Une fraction stricte (0,2) reste lue telle quelle.
 */
function resolveSpirale(resolved) {
  const n = Number(resolved?.questions_spirale);
  if (!Number.isFinite(n) || n < 0 || n > 100) return SPIRALE_DEFAUT;
  return n >= 1 ? n / 100 : n;
}

/** Biomes des plateaux déjà traversés (1 … plateau − 1), d'après le registre des biomes. */
function biomesDesPlateauxTraverses(plateau) {
  const p = Number(plateau) || 0;
  return GL_BIOME_REGISTRY.filter((b) => Number(b.plateau) >= 1 && Number(b.plateau) < p).map(
    (b) => b.slugCanonique,
  );
}

/** Codes déjà posés sur une case dans la partie (`marker_question_presented`), et par équipe. */
async function questionsDejaPosees(deps, gameId) {
  const rows = await deps.queryAll(
    `SELECT team_id, payload_json FROM gl_game_events
      WHERE game_id = ? AND event_type = 'marker_question_presented'`,
    [gameId],
  );
  const partie = new Set();
  const parEquipe = new Map();
  for (const r of rows) {
    let code = null;
    try {
      code = String(JSON.parse(r.payload_json || '{}').questionCode || '').toUpperCase();
    } catch (_) {
      code = null;
    }
    if (!code) continue;
    partie.add(code);
    const t = Number(r.team_id) || 0;
    if (!parEquipe.has(t)) parEquipe.set(t, new Set());
    parEquipe.get(t).add(code);
  }
  return { partie, parEquipe };
}

async function candidatsTenir(deps, biomeSlugs, categorieSlugs = []) {
  const { sql, params } = buildPoolQueryFilters({ categorieSlugs, niveaux: [] }, biomeSlugs, {
    niveauxAdmis: NIVEAUX_ADMIS_SQL,
    usageTenir: true,
  });
  if (!sql) return [];
  return deps.queryAll(sql, params);
}

/**
 * Question d'une case en mode « Tenir » (ensemble unifié, M9), dans l'ordre :
 * 1. une question vive (`VQCM…`) du biome de la case pas encore posée dans la partie ;
 * 2. sinon une question « posée en partie » (`usage_tenir = 1`) du biome, de difficulté au plus le
 *    plafond du plateau, pas encore posée à cette équipe ;
 * 3. à partir du plateau 2, avec la probabilité `questions_spirale`, le biome est tiré parmi
 *    ceux des plateaux déjà traversés.
 * Aucun tirage vide : on relâche d'abord « pas encore posée », puis le plafond, puis le biome
 * de la spirale (retour au biome de la case). Les bornes `difficulteMin` / `difficulteMax`
 * d'une case sont ignorées : le plafond du plateau les remplace ; ses catégories restent un
 * filtre. Niveaux admis (6ᵉ) toujours.
 *
 * @returns {Promise<{ questionCode: string|null, error: string|null, qcmSet: 'biome',
 *   etape?: string, spirale?: boolean, biome?: string|null }>}
 */
async function drawTenirCaseQuestion(
  deps,
  {
    gameId,
    teamId,
    marker,
    chapterBiomeSlugs,
    plateau,
    resolved = null,
    excludeCodes = [],
    random = null,
  },
) {
  // Aléa de la partie (`GL_RANDOM_SEED` en banc et en test) ; une fonction peut être injectée.
  const glRandom = require('./glRandom');
  const tirer = typeof random === 'function' ? random : () => glRandom.random({ gameId });
  const eventConfig = resolveMarkerEventConfig(marker);
  const pool = normalizeQuestionPool(eventConfig?.question?.pool);
  const biomesCase = resolveBiomeSlugsForPool(
    pool,
    chapterBiomeSlugs,
    marker?.sous_biome_slug ?? marker?.sousBiomeSlug ?? null,
  );
  const p = Number(plateau) || 1;
  let biomes = biomesCase;
  let spirale = false;
  if (p >= 2) {
    const anciens = biomesDesPlateauxTraverses(p);
    if (anciens.length && tirer() < resolveSpirale(resolved)) {
      biomes = [anciens[Math.min(anciens.length - 1, Math.floor(tirer() * anciens.length))]];
      spirale = true;
    }
  }
  const exclus = new Set((excludeCodes || []).map((c) => String(c || '').toUpperCase()));
  const { partie, parEquipe } = await questionsDejaPosees(deps, gameId);
  const dejaEquipe = parEquipe.get(Number(teamId) || 0) || new Set();
  const plafond = resolvePlafondDifficulte(resolved, p);
  const sousPlafond = (r) => r.difficulte == null || Number(r.difficulte) <= plafond;

  const choisir = async (rows) => {
    for (const candidate of glRandom.shuffle(rows, { gameId })) {
      const code = String(candidate.question_code || '')
        .trim()
        .toUpperCase();
      if (!code || exclus.has(code)) continue;
      const row = await loadActiveQuestion(deps, code);
      if (isPresentableQuestionRow(row)) return code;
    }
    return null;
  };

  const essais = spirale ? [biomes, biomesCase] : [biomesCase];
  for (const biomeSlugs of essais) {
    // Les catégories de la case restent un filtre d'auteur ; ses bornes de difficulté, non.
    const rows = await candidatsTenir(deps, biomeSlugs, pool.categorieSlugs || []);
    if (!rows.length) continue;
    const code = (r) => String(r.question_code || '').toUpperCase();
    const etapes = [
      ['vive', rows.filter((r) => QUESTION_VIVE_RE.test(code(r)) && !partie.has(code(r)))],
      // « Puis les autres » : une vive déjà posée dans la partie ne revient qu'au repli.
      [
        'plafond',
        rows.filter(
          (r) => !QUESTION_VIVE_RE.test(code(r)) && sousPlafond(r) && !dejaEquipe.has(code(r)),
        ),
      ],
      ['plafond_deja_posee', rows.filter(sousPlafond)],
      ['sans_plafond', rows],
    ];
    for (const [etape, liste] of etapes) {
      const choisi = await choisir(liste);
      if (choisi) {
        return {
          questionCode: choisi,
          error: null,
          qcmSet: 'biome',
          etape,
          spirale: spirale && biomeSlugs === biomes,
          biome: biomeSlugs.length === 1 ? biomeSlugs[0] : null,
        };
      }
    }
  }
  return {
    error: 'Aucune question présentable dans le pool (vérifiez les choix QCM)',
    questionCode: null,
    qcmSet: 'biome',
  };
}

module.exports = {
  PLAFOND_DIFFICULTE_DEFAUT,
  SPIRALE_DEFAUT,
  resolvePlafondDifficulte,
  resolveSpirale,
  biomesDesPlateauxTraverses,
  drawTenirCaseQuestion,
  buildPoolQueryFilters,
  queryQuestionPool,
  previewQuestionPool,
  drawQuestionFromMarker,
  toPoolPreviewItem,
};
