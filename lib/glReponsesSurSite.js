'use strict';

/**
 * « Tenir à deux » — contrôle « la réponse est-elle sur le site ? » (ensemble unifié, M22).
 *
 * Pour chaque question de zone, puis chaque question de case tirée en partie (`usage_tenir = 1`),
 * on cherche les mots de la **bonne réponse** dans les ressources reliées :
 * - question de zone : les fiches (`especes`) et les termes de glossaire (`glossaire`) de la zone
 *   (catalogue `chasse-zones.json`) ;
 * - question de case : les fiches et termes reliés par `gl_resource_question_links` (liens
 *   approuvés).
 *
 * Verdict : `trouvée` (au moins 80 % des mots utiles lus dans une même ressource), `en partie`
 * (au moins un mot sur trois), `introuvable` sinon — ou quand aucune ressource n'est reliée.
 * C'est une aide à la relecture, pas une preuve : un mot trouvé ne dit pas que la phrase y est,
 * et une réponse reformulée peut être juste sans partager un seul mot. Lecture seule.
 */

/** Mots outils : jamais comptés comme « mot de la réponse ». */
const MOTS_OUTILS = new Set(
  `alors ainsi apres assez aucun aucune aussi autre autres avant avec avoir beaucoup bien cela
   celle celles celui cette ceux chaque chez comme comment contre dans depuis donc dont elle elles
   encore entre etre fait faire font grace leur leurs lorsque mais meme moins notre nous parce
   pendant peut peuvent plus plusieurs pour pourquoi presque quand quel quelle quelles quels
   quelque quelques sans sera seulement sont sous souvent surtout tous tout toute toutes tres
   trop tandis toujours jamais rien vers votre vous deux trois quatre cinq petit petite petits
   petites grand grande grands grandes`
    .split(/\s+/)
    .filter(Boolean),
);

/** Minuscules, sans accents ni ligatures : « Œuf » → « oeuf ». */
function normaliser(texte) {
  return String(texte ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Racine très simple : pluriels et féminins courants retirés (« glands » → « gland »). */
function racine(mot) {
  let m = mot;
  if (m.length > 5 && m.endsWith('aux')) m = `${m.slice(0, -3)}al`;
  else if (m.length > 4 && (m.endsWith('s') || m.endsWith('x'))) m = m.slice(0, -1);
  if (m.length > 5 && m.endsWith('e')) m = m.slice(0, -1);
  return m;
}

/** Mots utiles d'une réponse : au moins 4 lettres, hors mots outils, sans doublon. */
function motsUtiles(texte) {
  const mots = normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 4 && !MOTS_OUTILS.has(m))
    .map(racine);
  return [...new Set(mots)];
}

/** Ensemble des racines présentes dans un texte de ressource. */
function racinesDuTexte(texte) {
  return new Set(
    normaliser(texte)
      .split(/[^a-z0-9]+/)
      .filter((m) => m.length >= 3)
      .map(racine),
  );
}

/**
 * Compare une bonne réponse aux ressources reliées.
 * @param {string} reponse texte de la bonne réponse
 * @param {Array<{ type: string, code: string, nom?: string, texte: string }>} ressources
 * @returns {{ verdict: 'trouvée'|'en partie'|'introuvable', trouves: string[], manquants: string[],
 *   ressource: string|null, part: number }}
 */
function evaluerReponse(reponse, ressources = []) {
  const mots = motsUtiles(reponse);
  if (!mots.length) {
    return { verdict: 'introuvable', trouves: [], manquants: [], ressource: null, part: 0 };
  }
  let meilleur = { trouves: [], ressource: null };
  for (const r of ressources) {
    const racines = racinesDuTexte(r.texte);
    const trouves = mots.filter((m) => racines.has(m));
    if (trouves.length > meilleur.trouves.length) {
      meilleur = { trouves, ressource: `${r.type}:${r.code}` };
    }
  }
  const part = meilleur.trouves.length / mots.length;
  const verdict = part >= 0.8 ? 'trouvée' : part >= 1 / 3 ? 'en partie' : 'introuvable';
  return {
    verdict,
    trouves: meilleur.trouves,
    manquants: mots.filter((m) => !meilleur.trouves.includes(m)),
    ressource: meilleur.ressource,
    part: Math.round(part * 100) / 100,
  };
}

/** Texte de la bonne réponse d'une ligne `gl_qcm_questions`. */
function bonneReponse(question) {
  const lettre = String(question?.reponse_correcte || '').toLowerCase();
  return String(question?.[`choix_${lettre}`] || '').trim();
}

function parseCodes(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v)
      ? v
          .map((c) =>
            String(c || '')
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean)
      : [];
  } catch (_) {
    return [];
  }
}

const CHAMPS_FICHE = [
  'nom_commun',
  'nom_scientifique',
  'groupe',
  'famille',
  'role_ecologique',
  'adaptations_cles',
  'taille_adulte',
  'poids_adulte',
  'regime_alimentaire',
  'longevite',
  'reproduction',
  'observation_terrain',
  'description_courte',
  'anecdote',
];
const CHAMPS_TERME = ['terme', 'variantes', 'definition_courte', 'definition_complete', 'exemple'];

const texteDe = (row, champs) =>
  champs
    .map((c) => row?.[c])
    .filter(Boolean)
    .join(' — ');

/** Charge fiches et termes par code (une requête par famille). */
async function chargerRessources(db, { fiches = [], termes = [] }) {
  const out = new Map();
  if (fiches.length) {
    const rows = await db.queryAll(
      `SELECT species_code, ${CHAMPS_FICHE.join(', ')} FROM gl_species
        WHERE species_code IN (${fiches.map(() => '?').join(', ')})`,
      fiches,
    );
    for (const r of rows) {
      out.set(`fiche:${String(r.species_code).toUpperCase()}`, {
        type: 'fiche',
        code: String(r.species_code),
        nom: String(r.nom_commun || ''),
        texte: texteDe(r, CHAMPS_FICHE),
      });
    }
  }
  if (termes.length) {
    const rows = await db.queryAll(
      `SELECT glossary_code, ${CHAMPS_TERME.join(', ')} FROM gl_glossary_terms
        WHERE glossary_code IN (${termes.map(() => '?').join(', ')})`,
      termes,
    );
    for (const r of rows) {
      out.set(`glossaire:${String(r.glossary_code).toUpperCase()}`, {
        type: 'glossaire',
        code: String(r.glossary_code),
        nom: String(r.terme || ''),
        texte: texteDe(r, CHAMPS_TERME),
      });
    }
  }
  return out;
}

function ligne(portee, { zoneKey = '', question, fiches, termes, ressources }) {
  const reponse = bonneReponse(question);
  const liees = [
    ...fiches.map((c) => ressources.get(`fiche:${c}`)).filter(Boolean),
    ...termes.map((c) => ressources.get(`glossaire:${c}`)).filter(Boolean),
  ];
  const absentes = [
    ...fiches.filter((c) => !ressources.has(`fiche:${c}`)).map((c) => `fiche:${c}`),
    ...termes.filter((c) => !ressources.has(`glossaire:${c}`)).map((c) => `glossaire:${c}`),
  ];
  const res = evaluerReponse(reponse, liees);
  const notes = [];
  if (!fiches.length && !termes.length) notes.push('aucune ressource reliée');
  if (absentes.length) notes.push(`absentes de cette base : ${absentes.join(' ')}`);
  return {
    portee,
    zone_key: zoneKey,
    question_code: String(question.question_code),
    biome: String(question.biome_slug || ''),
    bonne_reponse: reponse,
    verdict: res.verdict,
    part: res.part,
    mots_trouves: res.trouves.join(' '),
    mots_manquants: res.manquants.join(' '),
    ressource: res.ressource || '',
    ressources_reliees: [
      ...fiches.map((c) => `fiche:${c}`),
      ...termes.map((c) => `glossaire:${c}`),
    ].join(' '),
    note: notes.join(' ; '),
  };
}

/**
 * Rapport complet : questions de zone (zones actives), puis questions de case
 * (`usage_tenir = 1`, actives, hors questions de zone et hors questions vives sans lien).
 * @returns {Promise<Array<object>>} lignes du rapport, dans l'ordre d'affichage
 */
async function construireRapport(db) {
  const colonnesQuestion =
    'question_code, biome_slug, reponse_correcte, choix_a, choix_b, choix_c, choix_d, choix_e';
  const zones = await db.queryAll(
    `SELECT zone_key, question_code, especes_json, glossaire_json FROM gl_chasse_zones
      WHERE actif = 1 ORDER BY plateau ASC, ordre ASC, zone_key ASC`,
  );
  const codesZone = zones.map((z) => String(z.question_code || '').toUpperCase()).filter(Boolean);
  const questionsZone = codesZone.length
    ? await db.queryAll(
        `SELECT ${colonnesQuestion} FROM gl_qcm_questions
          WHERE question_code IN (${codesZone.map(() => '?').join(', ')})`,
        codesZone,
      )
    : [];
  const questionParCode = new Map(
    questionsZone.map((q) => [String(q.question_code).toUpperCase(), q]),
  );

  const questionsCase = await db.queryAll(
    `SELECT ${colonnesQuestion} FROM gl_qcm_questions
      WHERE usage_tenir = 1 AND statut = 'actif'
      ORDER BY biome_slug ASC, question_code ASC`,
  );
  const liens = await db.queryAll(
    `SELECT question_code, resource_type, resource_ref FROM gl_resource_question_links
      WHERE status = 'approved' AND resource_type IN ('species', 'glossary')`,
  );
  const liensParQuestion = new Map();
  for (const l of liens) {
    const code = String(l.question_code).toUpperCase();
    if (!liensParQuestion.has(code)) liensParQuestion.set(code, { fiches: [], termes: [] });
    const ref = String(l.resource_ref || '').toUpperCase();
    if (String(l.resource_type) === 'species') liensParQuestion.get(code).fiches.push(ref);
    else liensParQuestion.get(code).termes.push(ref);
  }

  const fiches = new Set();
  const termes = new Set();
  for (const z of zones) {
    parseCodes(z.especes_json).forEach((c) => fiches.add(c));
    parseCodes(z.glossaire_json).forEach((c) => termes.add(c));
  }
  for (const l of liensParQuestion.values()) {
    l.fiches.forEach((c) => fiches.add(c));
    l.termes.forEach((c) => termes.add(c));
  }
  const ressources = await chargerRessources(db, { fiches: [...fiches], termes: [...termes] });

  const rapport = [];
  for (const z of zones) {
    const question = questionParCode.get(String(z.question_code || '').toUpperCase());
    if (!question) continue;
    rapport.push(
      ligne('zone', {
        zoneKey: String(z.zone_key),
        question,
        fiches: parseCodes(z.especes_json),
        termes: parseCodes(z.glossaire_json),
        ressources,
      }),
    );
  }
  const dejaVues = new Set(codesZone);
  for (const question of questionsCase) {
    const code = String(question.question_code).toUpperCase();
    if (dejaVues.has(code)) continue;
    const l = liensParQuestion.get(code) || { fiches: [], termes: [] };
    rapport.push(
      ligne('case', {
        question,
        fiches: [...new Set(l.fiches)],
        termes: [...new Set(l.termes)],
        ressources,
      }),
    );
  }
  return rapport;
}

const COLONNES = Object.freeze([
  'portee',
  'zone_key',
  'question_code',
  'biome',
  'verdict',
  'part',
  'bonne_reponse',
  'mots_trouves',
  'mots_manquants',
  'ressource',
  'ressources_reliees',
  'note',
]);

/** Cellule CSV (séparateur « ; ») : guillemets doublés, jamais de formule. */
function celluleCsv(valeur) {
  let s = String(valeur ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function versCsv(rapport) {
  return `${[COLONNES.join(';'), ...rapport.map((l) => COLONNES.map((c) => celluleCsv(l[c])).join(';'))].join('\n')}\n`;
}

/** Décompte par portée et par verdict. */
function resumer(rapport) {
  const out = {};
  for (const l of rapport) {
    if (!out[l.portee]) out[l.portee] = { total: 0, trouvée: 0, 'en partie': 0, introuvable: 0 };
    out[l.portee].total += 1;
    out[l.portee][l.verdict] += 1;
  }
  return out;
}

module.exports = {
  normaliser,
  racine,
  motsUtiles,
  evaluerReponse,
  bonneReponse,
  construireRapport,
  versCsv,
  resumer,
  celluleCsv,
  COLONNES,
};
