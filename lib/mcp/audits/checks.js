'use strict';

/**
 * Contrôles de cohérence du corpus pédagogique — **fonctions pures**.
 *
 * Chaque contrôle reçoit un instantané (objets JS lus par `lib/mcp/audits/index.js`, ou
 * construits à la main dans les tests) et renvoie une liste de constats
 * `{ id, detail? }`. Aucune I/O ici : réutilisable par `tests/content/`, par le connecteur
 * MCP et par un futur script CLI.
 *
 * Comparaisons d'emoji : en JavaScript, `===` compare les unités de code, donc **en binaire** —
 * à l'inverse de la collation `utf8mb4_unicode_ci`, qui confond les caractères hors plan de
 * base (cf. migration 311). Les instantanés transportent donc les emoji tels quels et toute
 * comparaison se fait ici.
 */

/* ---------------------------------------------------------------- outils */

function str(v) {
  return v == null ? '' : String(v);
}

function blank(v) {
  return str(v).trim() === '';
}

/** Clé de comparaison : minuscules, sans accents, espaces réduits. */
function normKey(v) {
  return str(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nom scientifique normalisé pour la détection de doublons : genre + épithète(s) en
 * minuscules, sans auteur ni année, sans « subsp./var./cf. » ni ponctuation.
 * « Quercus suber L. » et « quercus  suber » → « quercus suber ».
 */
function normalizeScientificName(v) {
  const RANK_MARKERS = new Set([
    'subsp.',
    'subsp',
    'ssp.',
    'ssp',
    'var.',
    'var',
    'f.',
    'cf.',
    'cf',
    'aff.',
    'x',
    '×',
  ]);
  const words = normKey(v)
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z\s.×-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  for (const w of words) {
    if (RANK_MARKERS.has(w)) continue;
    // Genre, épithète, éventuel rang infraspécifique : mots alphabétiques sans point.
    // Le premier mot qui n'en est pas un (auteur « L. », année…) clôt le nom.
    if (!/^[a-z-]+$/.test(w) || out.length >= 3) break;
    out.push(w);
  }
  return out.join(' ');
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows || []) {
    const k = keyFn(r);
    if (k == null || k === '') continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/* ------------------------------------------------------- photos et crédits */

/**
 * Photos sans crédit ou sans licence : galerie `plant_photos`, photo principale des fiches,
 * espèces G&L et photos de QCM.
 */
function photosMissingCredit(s) {
  const out = [];
  for (const p of s.plantPhotos || []) {
    const missing = [blank(p.credit) && 'crédit', blank(p.licence) && 'licence'].filter(Boolean);
    if (missing.length)
      out.push({
        id: `plant_photo:${p.id}`,
        detail: `fiche ${p.plant_id} — ${missing.join(' + ')}`,
      });
  }
  for (const p of s.plants || []) {
    if (blank(p.photo)) continue;
    const missing = [blank(p.photo_credit) && 'crédit', blank(p.photo_licence) && 'licence'].filter(
      Boolean,
    );
    if (missing.length)
      out.push({ id: `plant:${p.id}`, detail: `photo principale — ${missing.join(' + ')}` });
  }
  for (const g of s.glSpecies || []) {
    if (blank(g.photo_url)) continue;
    const missing = [blank(g.photo_credit) && 'crédit', blank(g.photo_licence) && 'licence'].filter(
      Boolean,
    );
    if (missing.length)
      out.push({ id: `gl_species:${g.species_code}`, detail: missing.join(' + ') });
  }
  for (const [dataset, rows] of [
    ['qcm', s.quizQuestions],
    ['gl_qcm', s.glQcmQuestions],
  ]) {
    for (const q of rows || []) {
      if (blank(q.photo_url)) continue;
      const missing = [
        blank(q.photo_credit) && 'crédit',
        blank(q.photo_licence) && 'licence',
      ].filter(Boolean);
      if (missing.length)
        out.push({ id: `${dataset}:${q.question_code}`, detail: missing.join(' + ') });
    }
  }
  return out;
}

/* ---------------------------------------------------- clés de détermination */

function keyIndex(s) {
  const couplets = s.idKeyCouplets || [];
  const leads = s.idKeyLeads || [];
  const coupletById = new Map(couplets.map((c) => [Number(c.id), c]));
  const leadsByCouplet = groupBy(leads, (l) => Number(l.couplet_id));
  const keys = new Map((s.idKeys || []).map((k) => [Number(k.id), k]));
  return { coupletById, leadsByCouplet, keys, couplets, leads };
}

/**
 * Chemins de clé morts ou ambigus :
 * - proposition sans issue (ni couplet suivant ni espèce) ou avec les deux ;
 * - renvoi vers un couplet absent ou d'une autre clé ;
 * - couplet inatteignable depuis le premier couplet de sa clé ;
 * - couplet à moins de deux propositions ;
 * - espèce atteinte par plusieurs feuilles d'une même clé.
 */
function idKeyDeadPaths(s) {
  const { coupletById, leadsByCouplet, keys, couplets } = keyIndex(s);
  const out = [];
  for (const c of couplets) {
    const leads = leadsByCouplet.get(Number(c.id)) || [];
    if (leads.length < 2)
      out.push({
        id: `couplet:${c.id}`,
        detail: `clé ${c.key_id} — ${leads.length} proposition(s)`,
      });
    for (const l of leads) {
      const hasNext = l.next_couplet_id != null;
      const hasPlant = l.plant_id != null;
      if (hasNext === hasPlant) {
        out.push({ id: `lead:${l.id}`, detail: hasNext ? 'deux issues' : 'feuille sans espèce' });
        continue;
      }
      if (hasNext) {
        const target = coupletById.get(Number(l.next_couplet_id));
        if (!target)
          out.push({ id: `lead:${l.id}`, detail: `couplet ${l.next_couplet_id} absent` });
        else if (Number(target.key_id) !== Number(c.key_id)) {
          out.push({ id: `lead:${l.id}`, detail: 'renvoi vers une autre clé' });
        }
      }
    }
  }
  for (const [keyId] of keys) {
    const inKey = couplets.filter((c) => Number(c.key_id) === keyId);
    if (inKey.length === 0) {
      out.push({ id: `key:${keyId}`, detail: 'clé sans couplet' });
      continue;
    }
    const root = [...inKey].sort((a, b) => Number(a.number) - Number(b.number))[0];
    const seen = new Set();
    const stack = [Number(root.id)];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const l of leadsByCouplet.get(id) || []) {
        if (l.next_couplet_id != null) stack.push(Number(l.next_couplet_id));
      }
    }
    for (const c of inKey) {
      if (!seen.has(Number(c.id)))
        out.push({ id: `couplet:${c.id}`, detail: `inatteignable (clé ${keyId})` });
    }
    const reached = groupBy(
      inKey.flatMap((c) =>
        (leadsByCouplet.get(Number(c.id)) || []).filter((l) => l.plant_id != null),
      ),
      (l) => Number(l.plant_id),
    );
    for (const [plantId, ls] of reached) {
      if (ls.length > 1) {
        out.push({
          id: `key:${keyId}:plant:${plantId}`,
          detail: `espèce atteinte par ${ls.length} feuilles`,
        });
      }
    }
  }
  return out;
}

/**
 * Espèces présentes sur une carte (registre, zone ou repère) qu'aucune clé **publiée** de cette
 * carte (ou sans carte) n'atteint. Ne signale rien pour une carte sans clé publiée : le
 * contrôle mesure la couverture des clés existantes, pas leur absence.
 */
function speciesNotCoveredByIdKey(s) {
  const { leadsByCouplet, couplets } = keyIndex(s);
  const published = (s.idKeys || []).filter((k) => Number(k.is_published) === 1);
  if (published.length === 0) return [];
  const reachedByKey = new Map();
  for (const k of published) {
    const set = new Set();
    for (const c of couplets.filter((x) => Number(x.key_id) === Number(k.id))) {
      for (const l of leadsByCouplet.get(Number(c.id)) || []) {
        if (l.plant_id != null) set.add(Number(l.plant_id));
      }
    }
    reachedByKey.set(Number(k.id), set);
  }
  const presence = presenceByMap(s);
  const out = [];
  for (const [mapId, plants] of presence) {
    const keysForMap = published.filter((k) => k.map_id == null || String(k.map_id) === mapId);
    if (keysForMap.length === 0) continue;
    const covered = new Set();
    for (const k of keysForMap) for (const p of reachedByKey.get(Number(k.id))) covered.add(p);
    for (const p of plants) {
      if (!covered.has(p))
        out.push({ id: `map:${mapId}:plant:${p}`, detail: 'présente, hors clé' });
    }
  }
  return out;
}

function presenceByMap(s) {
  const zoneMap = new Map((s.zones || []).map((z) => [String(z.id), String(z.map_id)]));
  const markerMap = new Map((s.markers || []).map((m) => [String(m.id), String(m.map_id)]));
  const out = new Map();
  const add = (mapId, plantId) => {
    if (!mapId || mapId === 'undefined') return;
    if (!out.has(mapId)) out.set(mapId, new Set());
    out.get(mapId).add(Number(plantId));
  };
  for (const r of s.mapSpecies || []) add(String(r.map_id), r.plant_id);
  for (const r of s.zoneSpecies || []) add(zoneMap.get(String(r.zone_id)), r.plant_id);
  for (const r of s.markerSpecies || []) add(markerMap.get(String(r.marker_id)), r.plant_id);
  return out;
}

/* ------------------------------------------------------------------ glossaires */

function corpusIncludes(corpus, term) {
  const k = normKey(term);
  if (k.length < 3) return true; // trop court pour conclure
  return corpus.includes(k);
}

function buildCorpus(parts) {
  return normKey(
    parts
      .flat()
      .map((v) => str(v).replace(/<[^>]+>/g, ' '))
      .join(' \n '),
  );
}

/**
 * Termes de glossaire orphelins : aucun lien (espèce, tutoriel, QCM) **et** jamais employés
 * dans les textes (tutoriels, fiches, énoncés de QCM, feuillets pour le lore).
 */
function glossaryOrphans(s) {
  const out = [];
  const fmLinked = new Set([
    ...(s.glossaryTermSpecies || []).map((r) => r.glossary_code),
    ...(s.glossaryTermTutorials || []).map((r) => r.glossary_code),
    ...(s.resourceQuestionLinks || [])
      .filter((r) => r.resource_type === 'glossary')
      .map((r) => r.resource_ref),
  ]);
  const fmCorpus = buildCorpus([
    (s.tutorials || []).map((t) => [t.title, t.summary, t.html_content]),
    (s.plants || []).map((p) => [p.description, p.ecosystem_role, p.remarks]),
    (s.quizQuestions || []).map((q) => [q.question, q.feedback_correct]),
  ]);
  for (const t of s.glossaryTerms || []) {
    if (fmLinked.has(t.glossary_code)) continue;
    const variants = [t.terme, ...str(t.variantes).split(/[,;|]/)].filter((v) => !blank(v));
    if (variants.some((v) => corpusIncludes(fmCorpus, v))) continue;
    out.push({ id: `glossary:${t.glossary_code}`, detail: t.terme });
  }
  const glLinked = new Set(
    (s.glResourceQuestionLinks || [])
      .filter((r) => r.resource_type === 'glossary')
      .map((r) => r.resource_ref),
  );
  const glCorpus = buildCorpus([
    (s.glSpecies || []).map((g) => [
      g.description_courte,
      g.role_ecologique,
      g.adaptations_cles,
      g.anecdote,
    ]),
    (s.glQcmQuestions || []).map((q) => [q.question, q.feedback_correct]),
  ]);
  for (const t of s.glGlossaryTerms || []) {
    if (glLinked.has(t.glossary_code)) continue;
    const variants = [t.terme, ...str(t.variantes).split(/[,;|]/)].filter((v) => !blank(v));
    if (variants.some((v) => corpusIncludes(glCorpus, v))) continue;
    out.push({ id: `gl_glossary:${t.glossary_code}`, detail: t.terme });
  }
  const loreLinked = new Set(
    (s.glResourceQuestionLinks || [])
      .filter((r) => r.resource_type === 'lore_glossary')
      .map((r) => r.resource_ref),
  );
  const loreCorpus = buildCorpus([
    (s.glLoreFeuillets || []).map((f) => [f.titre, f.texte, f.texte_accessible, f.incipit]),
    (s.glQcmLoreQuestions || []).map((q) => [q.question]),
  ]);
  for (const t of s.glLoreGlossaryTerms || []) {
    if (loreLinked.has(t.lore_code)) continue;
    const variants = [t.terme, ...str(t.variantes).split(/[,;|]/)].filter((v) => !blank(v));
    if (variants.some((v) => corpusIncludes(loreCorpus, v))) continue;
    out.push({ id: `lore_glossary:${t.lore_code}`, detail: t.terme });
  }
  return out;
}

/** Même terme dans les glossaires ForetMap et G&L, définitions courtes différentes. */
function glossaryDivergenceFmGl(s) {
  const gl = groupBy(s.glGlossaryTerms || [], (t) => normKey(t.terme));
  const out = [];
  for (const t of s.glossaryTerms || []) {
    const twins = gl.get(normKey(t.terme)) || [];
    for (const g of twins) {
      if (normKey(t.definition_courte) !== normKey(g.definition_courte)) {
        out.push({
          id: `${t.glossary_code}~${g.glossary_code}`,
          detail: t.terme,
        });
      }
    }
  }
  return out;
}

/**
 * Divergence liens glossaire ↔ QCM G&L.
 *
 * Constat au 02/11/2026 : la table `gl_qcm_question_glossary` a été **supprimée** par la
 * migration 186 ; `lib/glQcmCrud.js` (syncSingleQuestionGlossaryLinks) et
 * `lib/glQcmImport.js` (syncGlossaryLinks) écrivent désormais dans
 * `gl_resource_question_links` (origin `import`). Le contrôle compare donc :
 * 1. si l'ancienne table existe encore (base restée en arrière), ses couples à la source de
 *    vérité ;
 * 2. dans tous les cas, les liens `import` en base aux liens que l'appariement par mots-clés
 *    produirait **aujourd'hui** (`expectedImportLinks`, injecté par l'appelant) : un écart
 *    signale un lien périmé (question ou glossaire modifié depuis le dernier passage).
 */
function glQcmGlossaryLinkDivergence(s) {
  const out = [];
  const truth = (s.glResourceQuestionLinks || []).filter(
    (r) => r.question_dataset === 'qcm' && r.resource_type === 'glossary',
  );
  const truthSet = new Set(truth.map((r) => `${r.question_code}|${r.resource_ref}`));
  if (Array.isArray(s.legacyGlQcmQuestionGlossary)) {
    for (const r of s.legacyGlQcmQuestionGlossary) {
      const k = `${r.question_code}|${r.glossary_code}`;
      if (!truthSet.has(k))
        out.push({ id: `legacy:${k}`, detail: 'absent de la source de vérité' });
    }
  }
  if (s.expectedImportLinks instanceof Map) {
    const actual = groupBy(
      truth.filter((r) => r.origin === 'import'),
      (r) => r.question_code,
    );
    for (const [code, expected] of s.expectedImportLinks) {
      const have = new Set((actual.get(code) || []).map((r) => r.resource_ref));
      for (const g of expected) {
        if (!have.has(g)) out.push({ id: `${code}+${g}`, detail: 'lien attendu manquant' });
      }
      for (const g of have) {
        if (!expected.has(g)) out.push({ id: `${code}-${g}`, detail: 'lien import périmé' });
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------------- QCM */

const LETTERS = ['a', 'b', 'c', 'd', 'e'];

/**
 * QCM incomplets. Convention respectée : le slot de feedback de la **bonne** réponse reste
 * vide (c'est `feedback_correct` qui sert) — ce n'est jamais signalé.
 */
function qcmIncomplete(s) {
  const out = [];
  const sets = [
    ['qcm', s.quizQuestions],
    ['gl_qcm', s.glQcmQuestions],
    ['gl_qcm_lore', s.glQcmLoreQuestions],
  ];
  for (const [dataset, rows] of sets) {
    for (const q of rows || []) {
      const problems = [];
      if (blank(q.question)) problems.push('énoncé vide');
      const filled = LETTERS.filter((l) => !blank(q[`choix_${l}`]));
      if (filled.length < 2) problems.push('moins de 2 choix');
      const correct = str(q.reponse_correcte).trim().toLowerCase();
      if (!LETTERS.includes(correct) || blank(q[`choix_${correct}`])) {
        problems.push('bonne réponse absente');
      }
      if (blank(q.feedback_correct)) problems.push('feedback_correct vide');
      const missingDistractorFeedback = filled.filter(
        (l) => l !== correct && blank(q[`feedback_${l}`]),
      );
      if (missingDistractorFeedback.length) {
        problems.push(`feedback manquant (${missingDistractorFeedback.join(',').toUpperCase()})`);
      }
      if (dataset !== 'qcm' && (blank(q.niveau) || q.difficulte == null)) {
        problems.push('niveau ou difficulté absent');
      }
      if (problems.length)
        out.push({ id: `${dataset}:${q.question_code}`, detail: problems.join(' ; ') });
    }
  }
  return out;
}

/* ------------------------------------------------------- niveaux G&L (6ᵉ) */

/**
 * Valeurs de `niveau` compatibles avec le public G&L (élèves de 6ᵉ, cycle 3), alignées sur
 * le catalogue ForetMap 6ᵉ : niveau de quiz `college` (palier d'entrée cycle 3, cf.
 * `lib/pedagoScales.js`) et profondeur de glossaire `base`. Normalisées par `normKey`.
 */
const SIXIEME_LEVELS = Object.freeze(
  new Set(['6e', '6eme', '6ème', 'sixieme', 'cycle 3', 'cycle3', 'college', 'base']),
);

function isSixiemeLevel(v) {
  return SIXIEME_LEVELS.has(normKey(v).replace(/ᵉ/g, 'e'));
}

/**
 * Cases et questions G&L dont le niveau n'est pas harmonisé avec la 6ᵉ :
 * - question G&L active au niveau absent ou hors 6ᵉ ;
 * - case à question fixe pointant une question hors 6ᵉ ;
 * - case à tirage dont le filtre `niveaux` admet un niveau hors 6ᵉ, ou n'a **aucun** filtre
 *   alors que la banque contient des questions hors 6ᵉ (tirage possible au-dessus du public).
 */
/**
 * G&L « Tenir à deux » : promesses des cases des plateaux 1 à 4 contre l'effet appliqué —
 * texte d'auteur `effet_mecanique` (studio, jeu classique), libellés de branche lus par l'élève
 * en mode tenir, et toute perte annoncée en cas d'échec (garde-fou § 1.4). Pur sur l'instantané
 * (`glChapterMarkers`, `glChapters`) ; moteur de comparaison : lib/glMarkerPromiseAudit.js.
 */
function glMarkerPromises(s) {
  const { auditMarkerPromises } = require('../../glMarkerPromiseAudit');
  const plateaux = new Map(
    (s.glChapters || [])
      .filter((c) => Number(c.plateau_number) >= 1 && Number(c.plateau_number) <= 4)
      .map((c) => [Number(c.id), Number(c.plateau_number)]),
  );
  const markers = (s.glChapterMarkers || []).filter((m) => plateaux.has(Number(m.chapter_id)));
  const report = auditMarkerPromises(markers, { tenir: true });
  const out = [];
  for (const row of report.rows) {
    if (row.severity !== 'error' && row.severity !== 'warn') continue;
    const first = row.issues.find((i) => i.severity === row.severity) || row.issues[0];
    out.push({
      id: `case:${row.markerId}`,
      detail: `p${plateaux.get(Number(row.chapterId))} « ${str(row.label)} » — ${first?.code || row.severity}`,
    });
  }
  return out;
}

function glCaseLevelsNot6e(s) {
  const out = [];
  const byCode = new Map((s.glQcmQuestions || []).map((q) => [q.question_code, q]));
  const anyNon6e = (s.glQcmQuestions || []).some(
    (q) => str(q.statut || 'actif') === 'actif' && !isSixiemeLevel(q.niveau),
  );
  for (const q of s.glQcmQuestions || []) {
    if (str(q.statut || 'actif') !== 'actif') continue;
    if (!isSixiemeLevel(q.niveau)) {
      out.push({
        id: `gl_qcm:${q.question_code}`,
        detail: `niveau « ${str(q.niveau) || 'vide'} »`,
      });
    }
  }
  for (const m of s.glChapterMarkers || []) {
    if (m.qcm_question_code) {
      const q = byCode.get(m.qcm_question_code);
      if (q && !isSixiemeLevel(q.niveau)) {
        out.push({ id: `case:${m.id}`, detail: `question fixe ${q.question_code} hors 6ᵉ` });
      }
    }
    let cfg = null;
    try {
      cfg = m.event_config_json ? JSON.parse(m.event_config_json) : null;
    } catch (_) {
      cfg = null;
    }
    const question = cfg?.question;
    if (!question || question.set === 'lore') continue;
    if (question.mode === 'fixed' && question.fixedQuestionCode) {
      const q = byCode.get(String(question.fixedQuestionCode).toUpperCase());
      if (q && !isSixiemeLevel(q.niveau)) {
        out.push({ id: `case:${m.id}`, detail: `question fixe ${q.question_code} hors 6ᵉ` });
      }
      continue;
    }
    const niveaux = Array.isArray(question.pool?.niveaux) ? question.pool.niveaux : [];
    const bad = niveaux.filter((n) => !isSixiemeLevel(n));
    if (bad.length) out.push({ id: `case:${m.id}`, detail: `tirage admet ${bad.join(', ')}` });
    else if (niveaux.length === 0 && anyNon6e) {
      out.push({ id: `case:${m.id}`, detail: 'tirage sans filtre de niveau' });
    }
  }
  return out;
}

/* ------------------------------------------------------- doublons d'espèces */

/** Doublons : même nom scientifique normalisé, alias qui désigne deux fiches. */
function speciesDuplicates(s) {
  const out = [];
  const fm = groupBy(s.plants || [], (p) => normalizeScientificName(p.scientific_name) || null);
  for (const [k, rows] of fm) {
    if (rows.length > 1 && k.includes(' ')) {
      out.push({ id: `plants:${rows.map((r) => r.id).join('+')}`, detail: k });
    }
  }
  const gl = groupBy(s.glSpecies || [], (g) => normalizeScientificName(g.nom_scientifique) || null);
  for (const [k, rows] of gl) {
    if (rows.length > 1 && k.includes(' ')) {
      out.push({ id: `gl_species:${rows.map((r) => r.species_code).join('+')}`, detail: k });
    }
  }
  const names = new Map();
  const note = (key, plantId, src) => {
    const k = normKey(key);
    if (!k) return;
    if (!names.has(k)) names.set(k, new Map());
    names.get(k).set(Number(plantId), src);
  };
  for (const p of s.plants || []) note(p.name, p.id, 'nom');
  for (const a of s.plantAliases || []) note(a.alias, a.plant_id, 'alias');
  for (const [k, owners] of names) {
    if (owners.size > 1)
      out.push({ id: `alias:${k}`, detail: `fiches ${[...owners.keys()].join(', ')}` });
  }
  return out;
}

/** Emoji partagés (comparaison binaire) et noms qui répètent leur emoji (migration 311). */
function emojiCollisions(s) {
  const out = [];
  const byEmoji = groupBy(
    (s.plants || []).filter((p) => !blank(p.emoji)),
    (p) => str(p.emoji),
  );
  for (const [emoji, rows] of byEmoji) {
    if (rows.length > 1) {
      out.push({ id: `emoji:${emoji}`, detail: `fiches ${rows.map((r) => r.id).join(', ')}` });
    }
  }
  for (const [kind, rows, nameKey] of [
    ['zone', s.zones, 'name'],
    ['marker', s.markers, 'label'],
  ]) {
    for (const r of rows || []) {
      const e = str(r.emoji);
      if (e && str(r[nameKey]).startsWith(`${e} `)) {
        out.push({ id: `${kind}:${r.id}`, detail: 'nom qui répète l’emoji' });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------- présence */

function speciesWithoutPresence(s) {
  const present = new Set(
    [...(s.zoneSpecies || []), ...(s.markerSpecies || []), ...(s.mapSpecies || [])].map((r) =>
      Number(r.plant_id),
    ),
  );
  return (s.plants || [])
    .filter((p) => !present.has(Number(p.id)))
    .map((p) => ({ id: `plant:${p.id}`, detail: p.name }));
}

function zonesWithoutSpecies(s) {
  const withSpecies = new Set((s.zoneSpecies || []).map((r) => String(r.zone_id)));
  return (s.zones || [])
    .filter((z) => !Number(z.special) && !withSpecies.has(String(z.id)))
    .map((z) => ({ id: `zone:${z.id}`, detail: `${z.name} (${z.map_id})` }));
}

/* ------------------------------------------------------- liaisons orphelines */

/** Clés étrangères **logiques** (non portées par une contrainte SQL) cassées. */
function orphanLinks(s) {
  const out = [];
  const set = (rows, key) => new Set((rows || []).map((r) => str(r[key])));
  const plants = set(s.plants, 'id');
  const tutorials = set(s.tutorials, 'id');
  const fmQ = set(s.quizQuestions, 'question_code');
  const fmG = set(s.glossaryTerms, 'glossary_code');
  const glQ = set(s.glQcmQuestions, 'question_code');
  const loreQ = set(s.glQcmLoreQuestions, 'question_code');
  const glSp = set(s.glSpecies, 'species_code');
  const glG = set(s.glGlossaryTerms, 'glossary_code');
  const loreG = set(s.glLoreGlossaryTerms, 'lore_code');
  const zones = set(s.zones, 'id');
  const markers = set(s.markers, 'id');

  for (const r of s.resourceQuestionLinks || []) {
    if (!fmQ.has(str(r.question_code)))
      out.push({ id: `rql:${r.id}`, detail: `question ${r.question_code} absente` });
    const ref = str(r.resource_ref);
    const ok =
      (r.resource_type === 'plant' && plants.has(ref)) ||
      (r.resource_type === 'tutorial' && tutorials.has(ref)) ||
      (r.resource_type === 'glossary' && fmG.has(ref)) ||
      (r.resource_type === 'zone' && zones.has(ref)) ||
      (r.resource_type === 'marker' && markers.has(ref)) ||
      !['plant', 'tutorial', 'glossary', 'zone', 'marker'].includes(r.resource_type);
    if (!ok) out.push({ id: `rql:${r.id}`, detail: `${r.resource_type} ${ref} absent` });
  }
  for (const r of s.glResourceQuestionLinks || []) {
    const qs = r.question_dataset === 'qcm_lore' ? loreQ : glQ;
    if (!qs.has(str(r.question_code)))
      out.push({ id: `grql:${r.id}`, detail: `question ${r.question_code} absente` });
    const ref = str(r.resource_ref);
    const ok =
      (r.resource_type === 'species' && glSp.has(ref)) ||
      (r.resource_type === 'glossary' && glG.has(ref)) ||
      (r.resource_type === 'lore_glossary' && loreG.has(ref)) ||
      !['species', 'glossary', 'lore_glossary'].includes(r.resource_type);
    if (!ok) out.push({ id: `grql:${r.id}`, detail: `${r.resource_type} ${ref} absent` });
  }
  for (const r of s.quizQuestionSpecies || []) {
    if (!fmQ.has(str(r.question_code)))
      out.push({ id: `qqs:${r.question_code}:${r.plant_id}`, detail: 'question absente' });
  }
  for (const m of s.glChapterMarkers || []) {
    if (m.qcm_question_code && !glQ.has(str(m.qcm_question_code))) {
      out.push({ id: `case:${m.id}`, detail: `question ${m.qcm_question_code} absente` });
    }
  }
  for (const i of s.glSpeciesInteractions || []) {
    const ids = new Set((s.glSpecies || []).map((g) => Number(g.id)));
    if (
      !ids.has(Number(i.from_species_id)) ||
      (i.to_species_id != null && !ids.has(Number(i.to_species_id)))
    ) {
      out.push({ id: `gl_interaction:${i.id}`, detail: 'espèce absente' });
    }
  }
  return out;
}

/* ------------------------------------------------------- qualité QCM (réutilisée) */

/**
 * Doublons de choix, feedback qui recopie l'énoncé, biais de longueur de la bonne réponse :
 * détecteurs existants de `lib/pedagoContentAudit.js` (`detectQuestionIssues`).
 */
function qcmQuality(s) {
  const { detectQuestionIssues } = require('../../pedagoContentAudit');
  const out = [];
  for (const [dataset, rows] of [
    ['qcm', s.quizQuestions],
    ['gl_qcm', s.glQcmQuestions],
  ]) {
    for (const f of detectQuestionIssues(rows || [])) {
      if (f.kind === 'missing_correct_answer' || f.kind === 'missing_category') continue;
      out.push({ id: `${dataset}:${f.code}`, detail: f.kind });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- registre */

/**
 * Registre des contrôles : `needs` = parties de l'instantané à charger.
 * L'ordre est celui du tableau de bord `foretmap_audit_all`.
 */
const CHECKS = Object.freeze({
  photos_missing_credit: {
    description: 'Photos sans crédit ou sans licence (galerie, photo principale, G&L, QCM)',
    hint: 'Renseigner auteur et licence (CC BY-SA…) ; foretmap_plan_content_change sait corriger plant_photos.credit/licence.',
    needs: ['plantPhotos', 'plants', 'glSpecies', 'quizQuestions', 'glQcmQuestions'],
    run: photosMissingCredit,
  },
  species_not_in_id_key: {
    description:
      'Espèces présentes sur une carte mais atteintes par aucune clé publiée de la carte',
    hint: 'Ajouter une feuille à la clé, ou admettre l’espèce hors clé (ex. faune de passage).',
    needs: [
      'idKeys',
      'idKeyCouplets',
      'idKeyLeads',
      'zones',
      'markers',
      'mapSpecies',
      'zoneSpecies',
      'markerSpecies',
    ],
    run: speciesNotCoveredByIdKey,
  },
  id_key_dead_paths: {
    description:
      'Clés de détermination : feuilles sans espèce, renvois cassés, couplets inatteignables, espèce atteinte par plusieurs feuilles',
    hint: 'Ouvrir la clé avec foretmap_get_id_key et corriger dans l’éditeur de clés.',
    needs: ['idKeys', 'idKeyCouplets', 'idKeyLeads'],
    run: idKeyDeadPaths,
  },
  glossary_orphans: {
    description:
      'Termes de glossaire (ForetMap, G&L, lore) sans lien et jamais employés dans les textes',
    hint: 'Lier le terme à une espèce / un tutoriel / un QCM, ou l’employer dans un texte ; sinon envisager de l’archiver.',
    needs: [
      'glossaryTerms',
      'glossaryTermSpecies',
      'glossaryTermTutorials',
      'resourceQuestionLinks',
      'tutorials',
      'plants',
      'quizQuestions',
      'glGlossaryTerms',
      'glResourceQuestionLinks',
      'glSpecies',
      'glQcmQuestions',
      'glLoreGlossaryTerms',
      'glLoreFeuillets',
      'glQcmLoreQuestions',
    ],
    run: glossaryOrphans,
  },
  glossary_divergence_fm_gl: {
    description:
      'Même terme dans les glossaires ForetMap et G&L avec des définitions courtes différentes',
    hint: 'Comparer avec foretmap_get_glossary_term ; harmoniser ou assumer la différence de public (6ᵉ).',
    needs: ['glossaryTerms', 'glGlossaryTerms'],
    run: glossaryDivergenceFmGl,
  },
  gl_qcm_glossary_link_divergence: {
    description:
      'Liens glossaire ↔ QCM G&L : ancienne table (si encore présente) et liens « import » périmés par rapport à l’appariement actuel',
    hint: 'gl_qcm_question_glossary a été supprimée par la migration 186 ; un lien import périmé se régénère en réenregistrant la question.',
    needs: ['glResourceQuestionLinks', 'legacyGlQcmQuestionGlossary', 'expectedImportLinks'],
    run: glQcmGlossaryLinkDivergence,
  },
  qcm_incomplete: {
    description:
      'QCM incomplets : énoncé, choix, bonne réponse, feedback des distracteurs, niveau/difficulté (G&L)',
    hint: 'Le slot de feedback de la bonne réponse reste volontairement vide : il n’est jamais signalé.',
    needs: ['quizQuestions', 'glQcmQuestions', 'glQcmLoreQuestions'],
    run: qcmIncomplete,
  },
  qcm_quality: {
    description:
      'QCM : choix en double, feedback qui recopie l’énoncé, bonne réponse nettement plus longue',
    hint: 'Détecteurs de lib/pedagoContentAudit.js (npm run audit:pedago).',
    needs: ['quizQuestions', 'glQcmQuestions'],
    run: qcmQuality,
  },
  gl_marker_promises: {
    description:
      'G&L « Tenir à deux » : cases des plateaux 1-4 dont le texte ou un libellé de branche promet un effet que le moteur n’applique pas, ou une perte en cas d’échec',
    hint: 'Le texte lu par l’élève est calculé depuis l’effet appliqué ; corriger effet_mecanique ou le libellé de la branche dans le studio de plateau (GET /api/gl/admin/plateaux/coherence pour le détail).',
    needs: ['glChapters', 'glChapterMarkers'],
    run: glMarkerPromises,
  },
  gl_case_levels_not_6e: {
    description: 'G&L : questions et cases dont le niveau n’est pas harmonisé avec la 6ᵉ',
    hint: 'Niveaux admis : 6e, cycle 3, college, base. Filtrer le tirage de la case par niveau ou reclasser la question.',
    needs: ['glQcmQuestions', 'glChapterMarkers'],
    run: glCaseLevelsNot6e,
  },
  species_duplicates: {
    description:
      'Doublons d’espèces (nom scientifique normalisé) et noms/alias désignant plusieurs fiches',
    hint: 'Fusionner les fiches ou distinguer les alias ; vérifier GBIF (accepted_scientific_name).',
    needs: ['plants', 'plantAliases', 'glSpecies'],
    run: speciesDuplicates,
  },
  emoji_collisions: {
    description:
      'Emoji partagés par plusieurs fiches (comparaison binaire) et noms de zone/repère qui répètent leur emoji',
    hint: 'La collation unicode_ci confond les emoji : toujours comparer en BINARY côté SQL.',
    needs: ['plants', 'zones', 'markers'],
    run: emojiCollisions,
  },
  species_without_presence: {
    description: 'Fiches espèces présentes sur aucune carte (ni registre, ni zone, ni repère)',
    hint: 'Rattacher à une zone (zone_species) ou au registre de la carte, ou assumer une fiche documentaire.',
    needs: ['plants', 'zoneSpecies', 'markerSpecies', 'mapSpecies'],
    run: speciesWithoutPresence,
  },
  zones_without_species: {
    description: 'Zones (hors zones spéciales) sans aucune espèce rattachée',
    hint: 'foretmap_plan_content_change sait rattacher une espèce à une zone.',
    needs: ['zones', 'zoneSpecies'],
    run: zonesWithoutSpecies,
  },
  orphan_links: {
    description:
      'Liaisons logiques cassées (liens ressource ↔ question, cases G&L, interactions G&L)',
    hint: 'Supprimer le lien orphelin ou recréer la cible ; ces liaisons n’ont pas de clé étrangère SQL.',
    needs: [
      'plants',
      'tutorials',
      'quizQuestions',
      'glossaryTerms',
      'glQcmQuestions',
      'glQcmLoreQuestions',
      'glSpecies',
      'glGlossaryTerms',
      'glLoreGlossaryTerms',
      'zones',
      'markers',
      'resourceQuestionLinks',
      'glResourceQuestionLinks',
      'quizQuestionSpecies',
      'glChapterMarkers',
      'glSpeciesInteractions',
    ],
    run: orphanLinks,
  },
});

const CHECK_NAMES = Object.freeze(Object.keys(CHECKS));
const SAMPLE_MAX = 50;

/** Exécute un contrôle sur un instantané : `{ check, description, count, sample_ids, hint }`. */
function runCheck(name, snapshot) {
  const def = Object.hasOwn(CHECKS, name) ? CHECKS[name] : null;
  if (!def) throw new Error(`Contrôle inconnu : ${name}`);
  const findings = def.run(snapshot) || [];
  return {
    check: name,
    description: def.description,
    count: findings.length,
    sample_ids: findings
      .slice(0, SAMPLE_MAX)
      .map((f) => (f.detail ? `${f.id} (${f.detail})` : f.id)),
    hint: def.hint,
  };
}

module.exports = {
  CHECKS,
  CHECK_NAMES,
  SAMPLE_MAX,
  SIXIEME_LEVELS,
  emojiCollisions,
  glCaseLevelsNot6e,
  glMarkerPromises,
  glQcmGlossaryLinkDivergence,
  glossaryDivergenceFmGl,
  glossaryOrphans,
  idKeyDeadPaths,
  isSixiemeLevel,
  normKey,
  normalizeScientificName,
  orphanLinks,
  photosMissingCredit,
  qcmIncomplete,
  qcmQuality,
  runCheck,
  speciesDuplicates,
  speciesNotCoveredByIdKey,
  speciesWithoutPresence,
  zonesWithoutSpecies,
};
