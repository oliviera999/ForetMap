'use strict';

/**
 * Défis de la Trame (« Tenir à deux », lot 3, § 8.4) : données de partie, vues et récompenses.
 *
 * Six défis sur un même plateau de cartes — Retisser et Réparer (Gnomes), La trame altérée et
 * Les fils cachés (Licornes), et, pour les deux peuples (ensemble unifié, M21), Ranger (« Le bon
 * rôle », « Le bon pays ») et Les fils de l'adaptation — joués par un élève (veillée, fin
 * d'activité) ou par une équipe (prof, tablette d'équipe hors tour). Ils ne prennent pas de
 * temps de jeu.
 *
 * Règles tenues ici :
 * - **les solutions ne quittent jamais le serveur** : l'écran reçoit ses cartes, le classement de
 *   ses propres flèches et ses propres vérifications ; jamais les liens acceptés d'un Retisser ni
 *   la cascade attendue ;
 * - **sauvegarde stricte** : chaque enregistrement porte la révision attendue (409
 *   `edit_conflict` si elle est dépassée) ; l'état est ramené à ses bornes par le cœur ;
 * - **aucune ressource** : un défi réussi donne, à la première réussite de l'unité, une page de
 *   veillée (dans la limite hebdomadaire), un point de regard et compte pour un badge — jamais
 *   un cœur ni une gemme ; aucun classement, tri alphabétique seulement dans le suivi.
 *
 * Le cœur pur (`lib/shared/glTrameCore.js`, source `src/gl/defis/trameCore.js`) porte le
 * classement des flèches, la fin d'un niveau, la cascade et les indices.
 */

const core = require('./shared/glTrameCore');
const logger = require('./logger');

const TYPES_PAR_PEUPLE = Object.freeze({
  gnome: Object.freeze(['retisser', 'reparer']),
  unicorn: Object.freeze(['alteree', 'fils']),
});
/** Ouverts aux deux peuples, quel que soit `defis_par_peuple` (ensemble unifié, M21). */
const TYPES_COMMUNS = Object.freeze(['ranger', 'adaptation']);
const LIBELLES = Object.freeze({
  retisser: 'Retisser',
  reparer: 'Réparer la trame',
  alteree: 'La trame altérée',
  fils: 'Les fils cachés',
  ranger: 'Le bon rôle, le bon pays',
  adaptation: 'Les fils de l’adaptation',
});
/** Noms de repli des deux familles de `ranger` (le catalogue porte les siens). */
const LIBELLES_RANGER = Object.freeze({ role: 'Le bon rôle', pays: 'Le bon pays' });
const CONSIGNE_ADAPTATION =
  'Relie chaque contrainte du milieu au problème qu’elle pose, puis à l’espèce qui a la solution.';
const MODES = Object.freeze(['individuel', 'equipe']);
/** Statuts de partie où plus aucun défi ne se joue. */
const PARTIE_CLOSE = Object.freeze(['ended']);
const MESSAGE_PAGES_EPUISEES = 'Le carnet de ce chapitre n’a plus de page en attente.';

function fail(code, status = 400, extra = {}) {
  const err = new Error(code);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

function tableAbsente(err) {
  return err?.errno === 1146 || err?.code === 'ER_NO_SUCH_TABLE';
}

/** Lecture tolérante : `[]` si la table n'existe pas encore (base en retard d'une migration). */
async function lire(db, sql, params = []) {
  try {
    return await db.queryAll(sql, params);
  } catch (err) {
    if (tableAbsente(err)) return [];
    throw err;
  }
}

// ---------------------------------------------------------------------
// Catalogues
// ---------------------------------------------------------------------

async function loadReseau(db, biome) {
  const [reseau] = await lire(
    db,
    'SELECT biome, plateau, nom, note, scenarios_json FROM gl_trame_reseaux WHERE biome = ? AND actif = 1 LIMIT 1',
    [biome],
  );
  if (!reseau) return null;
  const cartes = await lire(
    db,
    `SELECT code, nom, role, precision_texte AS \`precision\`, generique, regime
       FROM gl_trame_cartes WHERE biome = ? ORDER BY ordre ASC`,
    [biome],
  );
  const liens = await lire(
    db,
    'SELECT de_code AS de, vers_code AS vers, nature, pourquoi FROM gl_trame_liens WHERE biome = ?',
    [biome],
  );
  return {
    biome: String(reseau.biome),
    plateau: Number(reseau.plateau),
    nom: String(reseau.nom),
    note: reseau.note || null,
    scenarios: parseJson(reseau.scenarios_json, []).map(String),
    cartes: cartes.map((c) => ({ ...c, generique: Number(c.generique) === 1 })),
    liens: liens.filter((l) => l.nature === 'accepte'),
    aDiscuter: liens.filter((l) => l.nature === 'a_discuter'),
  };
}

async function loadBiomesDuPlateau(db, plateau) {
  const rows = await lire(
    db,
    'SELECT biome FROM gl_trame_reseaux WHERE plateau = ? AND actif = 1 ORDER BY ordre ASC',
    [plateau],
  );
  return rows.map((r) => String(r.biome));
}

async function loadFils(db, plateau) {
  const cartes = await lire(
    db,
    'SELECT code, texte, chapitre_titre, chapitre_note FROM gl_trame_fils_cartes WHERE plateau = ? ORDER BY ordre ASC',
    [plateau],
  );
  if (!cartes.length) return null;
  const liens = await lire(
    db,
    'SELECT de_code AS de, vers_code AS vers FROM gl_trame_fils_liens WHERE plateau = ?',
    [plateau],
  );
  return {
    plateau: Number(plateau),
    titre: cartes[0].chapitre_titre || null,
    note: cartes[0].chapitre_note || null,
    cartes: cartes.map((c) => ({ code: String(c.code), texte: String(c.texte) })),
    liens,
  };
}

/** Noms et photos des espèces citées (fiches), avec repli sur les cartes de la Trame. */
async function loadEspeces(db, codes) {
  const list = [...new Set((codes || []).map(String).filter(Boolean))];
  const out = new Map();
  if (!list.length) return out;
  const marks = list.map(() => '?').join(', ');
  for (const r of await lire(
    db,
    `SELECT code, nom FROM gl_trame_cartes WHERE code IN (${marks})`,
    list,
  )) {
    out.set(String(r.code), { nom: String(r.nom), photoUrl: null, photoCredit: null });
  }
  for (const r of await lire(
    db,
    `SELECT species_code, nom_commun, photo_url, photo_credit FROM gl_species WHERE species_code IN (${marks})`,
    list,
  )) {
    const deja = out.get(String(r.species_code));
    out.set(String(r.species_code), {
      nom: deja?.nom || String(r.nom_commun),
      photoUrl: r.photo_url || null,
      photoCredit: r.photo_credit || null,
    });
  }
  return out;
}

async function loadReparer(db, plateau) {
  const aClasser = await lire(
    db,
    'SELECT species_code AS code, categorie, lecon FROM gl_trame_reparer_a_classer WHERE plateau = ? ORDER BY ordre ASC',
    [plateau],
  );
  const especes = await lire(
    db,
    'SELECT species_code AS code, menace, mesures_json FROM gl_trame_reparer_especes WHERE plateau = ? ORDER BY ordre ASC',
    [plateau],
  );
  if (!aClasser.length || !especes.length) return null;
  const mesures = await lire(
    db,
    'SELECT code, texte FROM gl_trame_mesures WHERE actif = 1 ORDER BY ordre ASC',
  );
  const noms = await loadEspeces(
    db,
    [...aClasser, ...especes].map((e) => e.code),
  );
  const nom = (code) => noms.get(String(code))?.nom || String(code);
  return {
    plateau: Number(plateau),
    lecon: aClasser[0].lecon || null,
    aClasser: aClasser.map((e) => ({
      code: String(e.code),
      nom: nom(e.code),
      categorie: String(e.categorie),
    })),
    especes: especes.map((e) => ({
      code: String(e.code),
      nom: nom(e.code),
      menace: String(e.menace),
      mesures: parseJson(e.mesures_json, []).map(String),
    })),
    mesures: mesures.map((m) => ({ code: String(m.code), texte: String(m.texte) })),
  };
}

/** Familles de « ranger » (nom, consigne, catégories fixes) : `Map(famille → …)`. */
async function loadRangerFamilles(db) {
  const rows = await lire(
    db,
    'SELECT famille, nom, consigne, categories_json FROM gl_trame_ranger_familles WHERE actif = 1 ORDER BY ordre ASC',
  );
  return new Map(
    rows.map((r) => [
      String(r.famille),
      {
        famille: String(r.famille),
        nom: String(r.nom),
        consigne: String(r.consigne),
        categories: parseJson(r.categories_json, null),
      },
    ]),
  );
}

/** Jeux de rangement d'un plateau, dans l'ordre du catalogue (rôles des biomes, puis le pays). */
async function loadRangerDuPlateau(db, plateau) {
  return lire(
    db,
    `SELECT code, famille, unite, plateau, biome, titre FROM gl_trame_ranger_jeux
      WHERE plateau = ? AND actif = 1 ORDER BY ordre ASC`,
    [plateau],
  );
}

/**
 * Un jeu de rangement avec ses cartes **et leurs solutions** (jamais servi tel quel). Les
 * catégories de « Le bon pays » sont des biomes : leur libellé vient du registre des biomes.
 */
async function loadRanger(db, famille, unite) {
  const [jeu] = await lire(
    db,
    `SELECT code, famille, unite, plateau, biome, titre, bilan, categories_json
       FROM gl_trame_ranger_jeux WHERE famille = ? AND unite = ? AND actif = 1 LIMIT 1`,
    [famille, unite],
  );
  if (!jeu) return null;
  const cartes = await lire(
    db,
    `SELECT code, nom, indice, categorie, pourquoi, generique FROM gl_trame_ranger_cartes
      WHERE jeu_code = ? ORDER BY ordre ASC`,
    [jeu.code],
  );
  if (!cartes.length) return null;
  const fam = (await loadRangerFamilles(db)).get(String(jeu.famille)) || null;
  const codes = parseJson(jeu.categories_json, []).map(String);
  const fixes = new Map((fam?.categories || []).map((c) => [String(c.code), c]));
  const { resolveBiome } = require('./shared/glBiomesRegistryCore');
  const categories = codes.map((code) => {
    const fixe = fixes.get(code);
    if (fixe) return { code, nom: String(fixe.nom), aide: fixe.aide || null };
    return { code, nom: resolveBiome(code)?.nom || code, aide: null };
  });
  return {
    code: String(jeu.code),
    famille: String(jeu.famille),
    unite: String(jeu.unite),
    plateau: Number(jeu.plateau),
    biome: jeu.biome || null,
    titre: String(jeu.titre),
    bilan: jeu.bilan || null,
    nom: fam?.nom || LIBELLES_RANGER[jeu.famille] || LIBELLES.ranger,
    consigne: fam?.consigne || null,
    categories,
    cartes: cartes.map((c) => ({ ...c, generique: Number(c.generique) === 1 })),
  };
}

async function loadAdaptationsDuPlateau(db, plateau) {
  return lire(
    db,
    'SELECT biome, titre FROM gl_trame_adaptation_jeux WHERE plateau = ? AND actif = 1 ORDER BY ordre ASC',
    [plateau],
  );
}

async function loadAdaptation(db, biome) {
  const [jeu] = await lire(
    db,
    'SELECT biome, plateau, titre FROM gl_trame_adaptation_jeux WHERE biome = ? AND actif = 1 LIMIT 1',
    [biome],
  );
  if (!jeu) return null;
  const cartes = await lire(
    db,
    'SELECT code, texte FROM gl_trame_adaptation_cartes WHERE biome = ? ORDER BY ordre ASC',
    [biome],
  );
  if (!cartes.length) return null;
  const liens = await lire(
    db,
    'SELECT de_code AS de, vers_code AS vers FROM gl_trame_adaptation_liens WHERE biome = ?',
    [biome],
  );
  return {
    biome: String(jeu.biome),
    plateau: Number(jeu.plateau),
    titre: String(jeu.titre),
    cartes: cartes.map((c) => ({ code: String(c.code), texte: String(c.texte) })),
    liens,
  };
}

// ---------------------------------------------------------------------
// Unités
// ---------------------------------------------------------------------

/**
 * `savane:7` (retisser), `savane:SP0095` (altérée), `p1` (fils, réparer), `role:savane` et
 * `pays:p1` (ranger), `adaptation:savane` (adaptation).
 */
function parseUnite(type, unite) {
  const u = String(unite || '').trim();
  if (type === 'ranger') {
    const role = /^role:([a-z0-9_]+)$/.exec(u);
    if (role) return { famille: 'role', cle: role[1], biome: role[1] };
    const pays = /^pays:p([1-4])$/.exec(u);
    return pays ? { famille: 'pays', cle: `p${pays[1]}`, plateau: Number(pays[1]) } : null;
  }
  if (type === 'adaptation') {
    const m = /^adaptation:([a-z0-9_]+)$/.exec(u);
    return m ? { biome: m[1] } : null;
  }
  if (type === 'retisser' || type === 'alteree') {
    const i = u.indexOf(':');
    if (i <= 0) return null;
    const biome = u.slice(0, i);
    const suite = u.slice(i + 1);
    if (type === 'retisser') {
      const niveau = Number(suite);
      return core.TRAME_NIVEAUX.includes(niveau) ? { biome, niveau } : null;
    }
    return suite ? { biome, retiree: suite } : null;
  }
  const m = /^p([1-4])$/.exec(u);
  return m ? { plateau: Number(m[1]) } : null;
}

/** Toutes les unités jouables sur un plateau, par type, dans l'ordre d'ouverture. */
async function unitesDuPlateau(db, plateau) {
  const out = { retisser: [], alteree: [], fils: [], reparer: [], ranger: [], adaptation: [] };
  for (const biome of await loadBiomesDuPlateau(db, plateau)) {
    const reseau = await loadReseau(db, biome);
    if (!reseau) continue;
    for (const niveau of core.TRAME_NIVEAUX) {
      out.retisser.push({ unite: `${biome}:${niveau}`, biome, biomeNom: reseau.nom, niveau });
    }
    const noms = new Map(reseau.cartes.map((c) => [c.code, c.nom]));
    for (const code of reseau.scenarios) {
      out.alteree.push({
        unite: `${biome}:${code}`,
        biome,
        biomeNom: reseau.nom,
        retiree: code,
        retireeNom: noms.get(code) || code,
      });
    }
  }
  if (await loadFils(db, plateau)) out.fils.push({ unite: `p${plateau}`, plateau });
  if (await loadReparer(db, plateau)) out.reparer.push({ unite: `p${plateau}`, plateau });
  // Ensemble unifié (M21) : un rôle par biome du plateau, un pays par plateau, une adaptation
  // par biome.
  const familles = await loadRangerFamilles(db);
  for (const jeu of await loadRangerDuPlateau(db, plateau)) {
    out.ranger.push({
      unite: `${jeu.famille}:${jeu.unite}`,
      famille: String(jeu.famille),
      familleNom: familles.get(String(jeu.famille))?.nom || LIBELLES_RANGER[jeu.famille] || null,
      plateau: Number(jeu.plateau),
      biome: jeu.biome || null,
      titre: String(jeu.titre),
    });
  }
  for (const jeu of await loadAdaptationsDuPlateau(db, plateau)) {
    out.adaptation.push({
      unite: `adaptation:${jeu.biome}`,
      biome: String(jeu.biome),
      plateau: Number(plateau),
      titre: String(jeu.titre),
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// Modèle d'un défi : la version serveur (avec solutions) et ce que l'écran reçoit
// ---------------------------------------------------------------------

async function buildModele(db, type, unite) {
  const u = parseUnite(type, unite);
  if (!u) throw fail('DEFI_UNITE_INCONNUE', 404);
  if (type === 'retisser' || type === 'alteree') {
    const reseau = await loadReseau(db, u.biome);
    if (!reseau) throw fail('DEFI_UNITE_INCONNUE', 404);
    const niveau = type === 'alteree' ? core.TRAME_NIVEAU_ALTEREE : u.niveau;
    const model = core.buildReseau(reseau, niveau);
    if (type === 'alteree' && !reseau.scenarios.includes(u.retiree)) {
      throw fail('DEFI_UNITE_INCONNUE', 404);
    }
    return {
      type,
      unite: u,
      plateau: reseau.plateau,
      titre: reseau.nom,
      note: reseau.note,
      model,
      codes: model.cartes.map((c) => c.code).filter((c) => c !== u.retiree),
      photos: await loadEspeces(
        db,
        model.cartes.filter((c) => !c.generique).map((c) => c.code),
      ),
    };
  }
  if (type === 'fils') {
    const chapitre = await loadFils(db, u.plateau);
    if (!chapitre) throw fail('DEFI_UNITE_INCONNUE', 404);
    const model = core.buildFils(chapitre);
    return {
      type,
      unite: u,
      plateau: u.plateau,
      titre: chapitre.titre,
      note: chapitre.note,
      model,
      codes: model.cartes.map((c) => c.code),
      photos: new Map(),
    };
  }
  if (type === 'ranger') {
    const jeu = await loadRanger(db, u.famille, u.cle);
    if (!jeu) throw fail('DEFI_UNITE_INCONNUE', 404);
    const model = core.buildRanger(jeu, jeu.categories);
    return {
      type,
      unite: u,
      plateau: jeu.plateau,
      titre: jeu.titre,
      libelle: jeu.nom,
      consigne: jeu.consigne,
      note: null,
      model,
      codes: model.cartes.map((c) => c.code),
      categories: model.categories.map((c) => c.code),
      photos: new Map(),
    };
  }
  if (type === 'adaptation') {
    const jeu = await loadAdaptation(db, u.biome);
    if (!jeu) throw fail('DEFI_UNITE_INCONNUE', 404);
    const model = core.buildAdaptation(jeu);
    return {
      type,
      unite: u,
      plateau: jeu.plateau,
      titre: jeu.titre,
      consigne: CONSIGNE_ADAPTATION,
      note: null,
      model,
      codes: model.cartes.map((c) => c.code),
      photos: new Map(),
    };
  }
  const reparer = await loadReparer(db, u.plateau);
  if (!reparer) throw fail('DEFI_UNITE_INCONNUE', 404);
  return {
    type,
    unite: u,
    plateau: u.plateau,
    titre: 'Réparer la trame',
    note: null,
    model: reparer,
    codes: [...new Set([...reparer.aClasser, ...reparer.especes].map((e) => e.code))],
    photos: new Map(),
  };
}

function cartesPubliques(modele) {
  return modele.model.cartes.map((c) => ({
    code: c.code,
    nom: c.nom,
    role: c.role,
    generique: c.generique === true,
    precision: c.precision || null,
    photoUrl: modele.photos.get(c.code)?.photoUrl || null,
    photoCredit: modele.photos.get(c.code)?.photoCredit || null,
  }));
}

/**
 * Ce que l'écran reçoit d'un défi : ses cartes, son état, le classement de **ses** flèches et
 * **ses** vérifications. Jamais les liens acceptés d'un Retisser ou des Fils, jamais la cascade.
 * @param {object} modele `buildModele`
 * @param {object} etat état normalisé
 * @param {{ signalees?: string[] }} [opts] espèces signalées par les Licornes (Réparer)
 */
function vuePublique(modele, etat, { signalees = [] } = {}) {
  const { type, model } = modele;
  if (type === 'retisser' || core.TRAME_TYPES_DE_FILS.includes(type)) {
    const fleches = core.classifyAll(model, etat.fleches);
    const complet =
      type === 'retisser'
        ? core.isRetisserComplet(model, etat.fleches)
        : core.isFilsComplet(model, etat.fleches);
    return {
      cartes: cartesPubliques(modele),
      fleches,
      trouvees: fleches.filter((f) => f.classement === 'trouvee').length,
      positions: etat.positions || {},
      complet,
      critere:
        type === 'retisser'
          ? core.TRAME_MESSAGES.retisserComplet
          : type === 'adaptation'
            ? core.TRAME_MESSAGES.adaptationComplet
            : core.TRAME_MESSAGES.filsComplet,
    };
  }
  if (type === 'ranger') {
    // Jamais la catégorie attendue : une carte bien rangée reçoit son « pourquoi », une autre
    // « Pas encore. », sans la réponse. Le bilan n'arrive qu'à la réussite.
    const verification = core.verifierRanger(model, etat.rangement);
    return {
      famille: model.famille,
      cartes: model.cartes.map((c) => ({
        code: c.code,
        nom: c.nom,
        indice: c.indice,
        generique: c.generique === true,
      })),
      categories: model.categories,
      rangement: etat.rangement || {},
      rangementVerifie: verification.cartes
        .filter((c) => c.rangee)
        .map((c) => ({ code: c.code, juste: c.juste, message: c.message })),
      complet: verification.complet,
      bilan: verification.complet ? model.bilan : null,
    };
  }
  if (type === 'alteree') {
    const retiree = modele.unite.retiree;
    const verification = etat.verifie
      ? core.verifierPredictions(model, retiree, etat.predictions)
      : null;
    const fin = verification?.complet ? core.cascade(model, retiree) : null;
    return {
      cartes: cartesPubliques(modele),
      // Le réseau du niveau 9 est donné déjà tissé : c'est l'énoncé de ce défi.
      liens: model.liens.map((l) => ({ de: l.de, vers: l.vers })),
      retiree,
      predictions: etat.predictions || {},
      verification: verification ? verification.cartes : null,
      complet: verification?.complet === true,
      message: fin?.message || null,
      pourAllerPlusLoin: fin?.pourAllerPlusLoin || null,
    };
  }
  const rangement = core.verifierRangement(model, etat.rangement);
  const mesures = core.verifierMesures(model, etat.mesures);
  // Une espèce signalée par une Licorne (trame altérée réussie) est proposée en premier.
  const especes = [...model.especes].sort(
    (a, b) => Number(signalees.includes(b.code)) - Number(signalees.includes(a.code)),
  );
  return {
    aClasser: model.aClasser.map((e) => ({ code: e.code, nom: e.nom })),
    categories: [...core.TRAME_CATEGORIES],
    rangement: etat.rangement || {},
    rangementVerifie: Object.keys(etat.rangement || {}).length ? rangement.cartes : null,
    rangementComplet: rangement.complet,
    // La leçon et les espèces menacées n'arrivent qu'une fois les six espèces rangées.
    lecon: rangement.complet ? model.lecon : null,
    leconLue: etat.leconLue === true,
    especes: rangement.complet
      ? especes.map((e) => ({
          code: e.code,
          nom: e.nom,
          menace: e.menace,
          signalee: signalees.includes(e.code),
        }))
      : [],
    mesures: rangement.complet ? model.mesures : [],
    choix: etat.mesures || {},
    mesuresVerifiees: rangement.complet ? mesures.especes : null,
    requises: core.especesRequises(model),
    pourquoi: etat.pourquoi || '',
    complet: core.isReparerComplet(model, etat),
  };
}

function estComplet(modele, etat) {
  if (modele.type === 'retisser') return core.isRetisserComplet(modele.model, etat.fleches);
  if (core.TRAME_TYPES_DE_FILS.includes(modele.type)) {
    return core.isFilsComplet(modele.model, etat.fleches);
  }
  if (modele.type === 'ranger') return core.isRangerComplet(modele.model, etat);
  if (modele.type === 'alteree') {
    return (
      etat.verifie === true &&
      core.verifierPredictions(modele.model, modele.unite.retiree, etat.predictions).complet
    );
  }
  return core.isReparerComplet(modele.model, etat);
}

// ---------------------------------------------------------------------
// Qui joue quoi
// ---------------------------------------------------------------------

/**
 * Types ouverts à une équipe : ceux de son peuple (ou tous, `defis_par_peuple` coupé), puis les
 * défis communs aux deux peuples, que `defis_par_peuple` ne filtre jamais (M21).
 */
function typesOuverts(resolved, teamType) {
  if (resolved?.defis === false) return [];
  if (resolved?.defis_par_peuple === false) return [...core.TRAME_TYPES];
  return [...(TYPES_PAR_PEUPLE[String(teamType)] || []), ...TYPES_COMMUNS];
}

const porteurDe = (mode, { playerId, teamId }) =>
  mode === 'equipe' ? `e${Number(teamId)}` : `p${Number(playerId)}`;

async function loadTeam(db, gameId, teamId) {
  return db.queryOne('SELECT id, name, type FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
    teamId,
    gameId,
  ]);
}

async function tourOuvert(db, gameId) {
  const row = await db.queryOne(
    `SELECT r.phase FROM gl_games g
       LEFT JOIN gl_game_rounds r ON r.game_id = g.id AND r.round_number = g.current_round_number
      WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  return !!row?.phase && row.phase !== 'clos';
}

function semaineCourante() {
  return require('./glTenir').isoWeekOf();
}

async function pagesDeLaSemaine(db, playerId) {
  const [row] = await lire(
    db,
    `SELECT COUNT(*) AS n FROM gl_trame_reussites
      WHERE player_id = ? AND semaine_iso = ? AND page_feuillet_code IS NOT NULL`,
    [playerId, semaineCourante()],
  );
  return Number(row?.n) || 0;
}

/** Espèces à réparer signalées par une trame altérée réussie (lien entre les peuples). */
async function especesSignalees(db, gameId) {
  const rows = await lire(
    db,
    `SELECT DISTINCT SUBSTRING_INDEX(r.unite, ':', -1) AS code
       FROM gl_trame_reussites r
       INNER JOIN gl_trame_reparer_especes e ON e.species_code = SUBSTRING_INDEX(r.unite, ':', -1)
      WHERE r.game_id = ? AND r.type = 'alteree'`,
    [gameId],
  );
  return rows.map((r) => String(r.code));
}

/**
 * Défis disponibles pour un porteur : selon le peuple (T1), le plateau de la partie (T6), la
 * progression (les niveaux de Retisser s'ouvrent l'un après l'autre) et le compteur de pages.
 * @param {{ game, resolved, team, playerId: number|null, mode: string }} p
 */
async function listDefis(db, { game, resolved, team, playerId = null, mode = 'individuel' }) {
  const plateau = Number(game.plateau_number) || 0;
  const types = typesOuverts(resolved, team?.type);
  const actifs =
    resolved?.defis !== false && plateau > 0 && !PARTIE_CLOSE.includes(String(game.status || ''));
  // Rattrapage : une page décidée par un défi et pas encore écrite au carnet l'est ici.
  if (team) await livrerPagesEnAttente(db, { game, teamId: Number(team.id) });
  const porteur = team ? porteurDe(mode, { playerId, teamId: team.id }) : null;
  const rows = porteur
    ? await lire(
        db,
        'SELECT id, type, unite, statut, indices_utilises FROM gl_trame_defis WHERE game_id = ? AND porteur = ?',
        [game.id, porteur],
      )
    : [];
  const parCle = new Map(rows.map((r) => [`${r.type}|${r.unite}`, r]));
  const unites = actifs ? await unitesDuPlateau(db, plateau) : {};
  const defis = [];
  for (const type of types) {
    const liste = unites[type] || [];
    liste.forEach((u, i) => {
      const row = parCle.get(`${type}|${u.unite}`) || null;
      // Retisser : 5 → 7 → 9 → 12, chaque niveau d'un biome s'ouvre quand le précédent est réussi.
      let disponible = true;
      if (type === 'retisser' && u.niveau !== core.TRAME_NIVEAUX[0]) {
        const precedent = liste[i - 1];
        disponible = parCle.get(`${type}|${precedent.unite}`)?.statut === 'reussi';
      }
      defis.push({
        type,
        libelle: u.familleNom || LIBELLES[type],
        ...u,
        disponible,
        statut: row ? String(row.statut) : null,
        defiId: row ? Number(row.id) : null,
      });
    });
  }
  const plafond = Number(resolved?.defis_pages_par_semaine ?? 2) || 0;
  return {
    actifs,
    parPeuple: resolved?.defis_par_peuple !== false,
    modeEquipe: resolved?.defis_mode_equipe !== false,
    peuple: team?.type || null,
    plateau,
    // Une rubrique par type ; « ranger » en compte deux (une par famille : rôle, pays).
    types: types.flatMap((t) => {
      if (t !== 'ranger') return [{ type: t, libelle: LIBELLES[t] }];
      const familles = [...new Set(defis.filter((d) => d.type === t).map((d) => d.famille))];
      return familles.map((famille) => ({
        type: t,
        famille,
        libelle:
          defis.find((d) => d.type === t && d.famille === famille)?.libelle ||
          LIBELLES_RANGER[famille] ||
          LIBELLES[t],
      }));
    }),
    defis,
    pages:
      mode === 'individuel' && playerId
        ? { utilisees: await pagesDeLaSemaine(db, playerId), plafond }
        : { utilisees: null, plafond },
    aReparer: await listeAReparer(db, game.id),
  };
}

/** « À réparer » du carnet de la classe : espèces signalées par une Licorne, sans aucun gain. */
async function listeAReparer(db, gameId) {
  const codes = await especesSignalees(db, gameId);
  const noms = await loadEspeces(db, codes);
  return codes
    .map((code) => ({ code, nom: noms.get(code)?.nom || code }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

// ---------------------------------------------------------------------
// Créer, lire, enregistrer, demander un indice
// ---------------------------------------------------------------------

function vueDefi(row, modele, etat, extra = {}) {
  return {
    id: Number(row.id),
    type: String(row.type),
    libelle: modele.libelle || LIBELLES[row.type],
    // Consigne du catalogue (ranger, adaptation) ; les quatre premiers défis gardent celle de l'écran.
    consigne: modele.consigne || null,
    unite: String(row.unite),
    mode: String(row.mode),
    teamId: Number(row.team_id),
    statut: String(row.statut),
    revision: Number(row.revision) || 0,
    indices: Number(row.indices_utilises) || 0,
    titre: modele.titre,
    // La `note` d'un réseau est une note d'auteur (elle peut citer un lien accepté) : jamais servie.
    niveau: modele.unite.niveau ?? null,
    ...vuePublique(modele, etat, extra),
  };
}

async function loadDefi(db, gameId, defiId, { forUpdate = false } = {}) {
  const row = await db.queryOne(
    `SELECT * FROM gl_trame_defis WHERE id = ? AND game_id = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [defiId, gameId],
  );
  if (!row) throw fail('DEFI_INTROUVABLE', 404);
  return row;
}

/**
 * Crée un défi, ou reprend celui du porteur (même type, même unité).
 * @param {{ game, resolved, team, playerId: number|null, mode: string, type: string,
 *   unite: string }} p `team` = équipe du porteur (déjà contrôlée par la route)
 */
/**
 * Ce défi peut-il être joué maintenant ? Rejoué à **chaque** écriture (création, enregistrement,
 * indice) : le prof qui ferme les défis en cours de séance arrête aussi ceux déjà ouverts, et
 * une partie terminée n'en donne plus.
 * @param {{ game, resolved, teamType: string, mode: string, type: string }} p
 */
function assertDefiJouable({ game, resolved, teamType, mode, type }) {
  if (resolved?.defis === false || PARTIE_CLOSE.includes(String(game?.status || ''))) {
    throw fail('DEFIS_FERMES', 409);
  }
  if (!core.TRAME_TYPES.includes(type)) throw fail('DEFI_TYPE_INCONNU', 400);
  if (!MODES.includes(mode)) throw fail('DEFI_MODE_INCONNU', 400);
  if (mode === 'equipe' && resolved?.defis_mode_equipe === false) {
    throw fail('DEFIS_EQUIPE_FERMES', 409);
  }
  if (!typesOuverts(resolved, teamType).includes(type)) throw fail('DEFI_AUTRE_PEUPLE', 403);
}

async function creerOuReprendre(db, { game, resolved, team, playerId, mode, type, unite }) {
  assertDefiJouable({ game, resolved, teamType: team.type, mode, type });
  const liste = await listDefis(db, { game, resolved, team, playerId, mode });
  const cible = liste.defis.find((d) => d.type === type && d.unite === String(unite));
  if (!cible) throw fail('DEFI_UNITE_INCONNUE', 404);
  if (!cible.disponible) throw fail('DEFI_NIVEAU_FERME', 409);
  const porteur = porteurDe(mode, { playerId, teamId: team.id });
  await db.execute(
    `INSERT IGNORE INTO gl_trame_defis
       (game_id, player_id, team_id, porteur, type, unite, mode, etat_json, statut, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 'en_cours', 0, NOW(), NOW())`,
    [game.id, mode === 'equipe' ? null : playerId, team.id, porteur, type, cible.unite, mode],
  );
  const row = await db.queryOne(
    'SELECT * FROM gl_trame_defis WHERE game_id = ? AND porteur = ? AND type = ? AND unite = ? LIMIT 1',
    [game.id, porteur, type, cible.unite],
  );
  return lireDefi(db, { gameId: game.id, row });
}

async function lireDefi(db, { gameId, defiId = null, row = null }) {
  const defi = row || (await loadDefi(db, gameId, defiId));
  const modele = await buildModele(db, defi.type, defi.unite);
  const etat = core.normaliserEtat(defi.type, parseJson(defi.etat_json, {}), modele.codes, {
    categories: modele.categories,
  });
  const signalees = defi.type === 'reparer' ? await especesSignalees(db, gameId) : [];
  return vueDefi(defi, modele, etat, { signalees });
}

/**
 * Enregistre un geste. Révision attendue obligatoire : 409 `edit_conflict` (avec l'état courant)
 * si une autre sauvegarde est passée entre-temps. Détecte la fin et attribue la récompense.
 * @param {{ game, resolved, defiId, revision, etat }} p
 * @returns {Promise<{ defi: object, reussite: object|null, events: Array, premiers: number[] }>}
 */
async function enregistrer(db, { game, resolved, defiId, revision, etat }) {
  const gameId = Number(game.id);
  let reussite = null;
  let row;
  let modele;
  let normalise;
  await db.withTransaction(async (tx) => {
    row = await loadDefi(tx, gameId, defiId, { forUpdate: true });
    if (Number(revision) !== Number(row.revision)) {
      throw fail('edit_conflict', 409, { revision: Number(row.revision) });
    }
    const team = await loadTeam(tx, gameId, row.team_id);
    assertDefiJouable({ game, resolved, teamType: team.type, mode: row.mode, type: row.type });
    modele = await buildModele(tx, row.type, row.unite);
    normalise = core.normaliserEtat(row.type, etat, modele.codes, {
      categories: modele.categories,
    });
    // Le compteur d'indices appartient au serveur : l'écran ne le remet pas à zéro.
    normalise.indices = Number(row.indices_utilises) || 0;
    const complet = estComplet(modele, normalise);
    const nouvelleReussite = complet && String(row.statut) !== 'reussi';
    await tx.execute(
      `UPDATE gl_trame_defis
          SET etat_json = ?, revision = revision + 1, updated_at = NOW(),
              statut = IF(? = 1, 'reussi', statut), reussi_at = IF(? = 1, NOW(), reussi_at)
        WHERE id = ?`,
      [JSON.stringify(normalise), nouvelleReussite ? 1 : 0, nouvelleReussite ? 1 : 0, row.id],
    );
    row = await loadDefi(tx, gameId, defiId);
    // Le défi passe à « réussi » et sa récompense est décidée **dans la même transaction** :
    // un défi réussi sans réussite inscrite n'existe pas.
    if (nouvelleReussite) {
      reussite = await inscrireReussite(tx, {
        game,
        defi: row,
        modele,
        plafond: Number(resolved?.defis_pages_par_semaine ?? 2) || 0,
        resolved,
      });
    }
  });
  // Les pages décidées sont écrites au carnet après coup (l'écriture d'une découverte ouvre sa
  // propre transaction) ; une page restée en attente est rattrapée à la prochaine lecture.
  if (reussite) await livrerPagesEnAttente(db, { game, teamId: Number(row.team_id) });
  const signalees = row.type === 'reparer' ? await especesSignalees(db, gameId) : [];
  return {
    defi: vueDefi(row, modele, normalise, { signalees }),
    reussite: reussite ? reussite.vue : null,
    events: reussite ? reussite.events : [],
    premiers: reussite ? reussite.premiers : [],
  };
}

const INDICES_SIMPLES = Object.freeze({
  alteree: Object.freeze([
    'Relis la consigne : la carte grisée a disparu. Que devient chaque autre carte ?',
    'Commence par les cartes qui mangent la carte retirée : que leur reste-t-il à manger ?',
    'Regarde ensuite ce que mangeait la carte retirée : qui est moins mangé maintenant ?',
    'Dans ce défi, une carte change dans trois cas : elle mangeait la carte retirée ; elle était mangée par elle ; ou ce qu’elle mangeait a disparu. Sinon, elle ne change pas.',
  ]),
  // Carte retirée = décomposeur : rien n'est « moins mangé », ce sont les plantes qui manquent.
  alteree_decomposeur: Object.freeze([
    'Relis la consigne : la carte grisée a disparu. Que devient chaque autre carte ?',
    'Les décomposeurs transforment la matière morte en éléments dont les plantes ont besoin.',
    'Sans eux, que deviennent les plantes du milieu ?',
    'Cherche aussi qui mangeait la carte retirée : que lui reste-t-il à manger ?',
  ]),
  reparer: Object.freeze([
    'Relis la consigne : range d’abord les six espèces, puis lis la leçon.',
    'Les fiches des espèces disent si elles sont menacées : cherche leur statut.',
    'Sur une fiche, « en danger » se range dans En danger ; « vulnérable » ou « quasi menacée » dans Fragile ; « préoccupation mineure » dans Pas menacée.',
    'Pour choisir une mesure, relis la menace : que faudrait-il changer pour qu’elle cesse ?',
  ]),
  // Ranger (ensemble unifié, M21) : jamais la colonne d'une carte, seulement comment chercher.
  ranger_role: Object.freeze([
    'Relis la consigne : chaque être vivant a un rôle dans la Trame.',
    'Commence par les plantes : elles fabriquent leur matière avec la lumière.',
    'Un animal mange d’autres êtres vivants, vivants ou morts : c’est un consommateur.',
    'Un décomposeur transforme la matière morte et la rend au sol : pense aux champignons et aux petites bêtes du sol.',
  ]),
  ranger_pays: Object.freeze([
    'Relis la consigne : l’indice de chaque carte parle du milieu où elle vit.',
    'Cherche dans l’indice ce qui manque ou ce qui abonde : l’eau, la chaleur, la lumière, la nourriture.',
    'Demande-toi dans quel pays cette façon de vivre aide le plus.',
    'Range d’abord les cartes dont tu es sûr : celles qui restent se rangent plus facilement.',
  ]),
});

/** Échelle d'indices d'un défi sans plateau de flèches (trame altérée, Réparer). */
function echelleSimple(row, modele) {
  if (row.type === 'ranger') {
    return modele.model.famille === 'pays'
      ? INDICES_SIMPLES.ranger_pays
      : INDICES_SIMPLES.ranger_role;
  }
  if (row.type !== 'alteree') return INDICES_SIMPLES[row.type];
  const retiree = modele.model.cartes.find((c) => c.code === modele.unite.retiree);
  return retiree?.role === 'decomposeur'
    ? INDICES_SIMPLES.alteree_decomposeur
    : INDICES_SIMPLES.alteree;
}

async function demanderIndice(db, { game, resolved = null, defiId }) {
  const gameId = Number(game.id);
  const row = await loadDefi(db, gameId, defiId);
  const team = await loadTeam(db, gameId, row.team_id);
  assertDefiJouable({ game, resolved, teamType: team.type, mode: row.mode, type: row.type });
  const modele = await buildModele(db, row.type, row.unite);
  const etat = core.normaliserEtat(row.type, parseJson(row.etat_json, {}), modele.codes, {
    categories: modele.categories,
  });
  const rang = Number(row.indices_utilises) || 0;
  let indice;
  if (row.type === 'retisser' || core.TRAME_TYPES_DE_FILS.includes(row.type)) {
    indice = core.nextHint(modele.model, { ...etat, indices: rang });
  } else {
    const echelle = echelleSimple(row, modele);
    indice = {
      rang,
      genre: rang === 0 ? 'consigne' : 'structure',
      message: echelle[Math.min(rang, echelle.length - 1)],
    };
  }
  await db.execute(
    'UPDATE gl_trame_defis SET indices_utilises = indices_utilises + 1, updated_at = NOW() WHERE id = ?',
    [row.id],
  );
  return { indice, indices: rang + 1 };
}

// ---------------------------------------------------------------------
// Récompense : jamais de ressource
// ---------------------------------------------------------------------

/** Modes d'apparition jamais tirés : la page apportée par l'oiseau, les pages de route. */
const MODES_HORS_DEFI = Object.freeze(['corbeau', 'carnet_route']);

/**
 * Une page peut-elle être gagnée par un défi ? Jamais une page de zone de chasse (elle se
 * cherche sur le plateau), jamais une page de route (le Passeur les lit, ou sa liste les a
 * écartées), jamais une page dont le titre ou l'incipit nomme l'oiseau, personnifie le Souffle
 * ou porte un terme `secret` du lore (garde-fous 1 à 3).
 */
function pageTirable(feuillet, { chasse, secretTerms }) {
  if (chasse.has(String(feuillet.feuillet_code))) return false;
  if (MODES_HORS_DEFI.includes(String(feuillet.mode_apparition || ''))) return false;
  const { findForbiddenString } = require('./shared/glGardeFousCore');
  const { findSecretTerm } = require('./glTenirImport');
  return ![feuillet.titre, feuillet.incipit].some(
    (texte) => findForbiddenString(texte) || findSecretTerm(texte, secretTerms),
  );
}

/** Pages de veillée qu'un défi peut donner dans ce chapitre, dans l'ordre du voyage. */
async function pagesTirables(db, game) {
  const { resolveChapterFeuilletPool } = require('./glFeuilletChapterPool');
  const { loadSecretTerms } = require('./glTenirImport');
  const pool = await resolveChapterFeuilletPool(db, { chapterId: game.chapter_id });
  if (!pool.length) return [];
  const chasse = new Set(
    (
      await lire(db, 'SELECT feuillet_code FROM gl_chasse_zones WHERE feuillet_code IS NOT NULL')
    ).map((r) => String(r.feuillet_code)),
  );
  const secretTerms = await loadSecretTerms(db);
  return pool.filter((f) => pageTirable(f, { chasse, secretTerms }));
}

/**
 * Prochaine page de veillée pour une équipe : tirable, pas encore au carnet de l'équipe, et pas
 * déjà promise par un autre défi (`exclus` : pages décidées dans la transaction en cours).
 */
async function prochainePage(db, { game, teamId, exclus = new Set() }) {
  const pages = await pagesTirables(db, game);
  if (!pages.length) return null;
  const deja = new Set(
    [
      ...(await lire(
        db,
        `SELECT feuillet_code FROM gl_game_feuillet_states
          WHERE game_id = ? AND team_id = ? AND (discovered_at IS NOT NULL OR status <> 'locked')`,
        [game.id, teamId],
      )),
      ...(await lire(
        db,
        `SELECT page_feuillet_code AS feuillet_code FROM gl_trame_reussites
          WHERE game_id = ? AND team_id = ? AND page_feuillet_code IS NOT NULL`,
        [game.id, teamId],
      )),
    ].map((r) => String(r.feuillet_code)),
  );
  return (
    pages.find((f) => !deja.has(String(f.feuillet_code)) && !exclus.has(String(f.feuillet_code))) ||
    null
  );
}

/**
 * Réussite d'un défi, **dans la transaction qui le passe à « réussi »**. Pour chaque
 * bénéficiaire (l'élève, ou chaque membre présent en mode équipe) dont c'est la **première
 * réussite de l'unité** : une ligne `gl_trame_reussites` (point de regard, badge) et, sous le
 * plafond hebdomadaire, une page de veillée décidée à son nom (`page_feuillet_code`). Aucune
 * ressource. L'évènement `defi_trame_reussi` est écrit avec.
 */
async function inscrireReussite(tx, { game, defi, modele, plafond = 0, resolved = null }) {
  const gameId = Number(game.id);
  const teamId = Number(defi.team_id);
  const { listPresentMembers } = require('./glTenir');
  const { insertGameEvent } = require('./glGameEvents');
  const beneficiaires =
    String(defi.mode) === 'equipe'
      ? await listPresentMembers(tx, gameId, teamId, Number(game.current_round_number) || 0)
      : [Number(defi.player_id)];
  const semaine = semaineCourante();
  const premiers = [];
  const pages = [];
  const promises = new Set();
  let pagesEpuisees = false;
  for (const playerId of beneficiaires) {
    const r = await tx.execute(
      `INSERT IGNORE INTO gl_trame_reussites
         (game_id, player_id, team_id, type, unite, defi_id, mode, semaine_iso, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [gameId, playerId, teamId, defi.type, defi.unite, defi.id, defi.mode, semaine],
    );
    if (!r.affectedRows) continue;
    premiers.push(Number(playerId));
    if (pagesEpuisees) continue;
    // Le plafond se compte sous verrou : deux défis finis en même temps n'en donnent pas trois.
    await tx.queryOne('SELECT id FROM gl_players WHERE id = ? FOR UPDATE', [playerId]);
    if ((await pagesDeLaSemaine(tx, playerId)) >= plafond) continue;
    const feuillet = await prochainePage(tx, { game, teamId, exclus: promises });
    if (!feuillet) {
      pagesEpuisees = true;
      continue;
    }
    promises.add(String(feuillet.feuillet_code));
    await tx.execute(
      `UPDATE gl_trame_reussites SET page_feuillet_code = ?
        WHERE game_id = ? AND player_id = ? AND type = ? AND unite = ?`,
      [feuillet.feuillet_code, gameId, playerId, defi.type, defi.unite],
    );
    pages.push({ playerId: Number(playerId), feuilletCode: String(feuillet.feuillet_code) });
  }
  const event = await insertGameEvent(tx, {
    gameId,
    teamId,
    actorType: 'team',
    actorId: String(defi.porteur),
    eventType: 'defi_trame_reussi',
    payload: {
      defiId: Number(defi.id),
      type: String(defi.type),
      libelle: modele.libelle || LIBELLES[defi.type],
      unite: String(defi.unite),
      biome: modele.unite.biome || null,
      biomeNom: modele.unite.biome ? modele.titre : null,
      plateau: modele.plateau,
      mode: String(defi.mode),
    },
  });
  // Ensemble unifié (M20) : une première réussite ouvre aussi une piste (une page endormie du
  // chapitre se révèle à la classe, dans la limite d'une piste par semaine) ; en mode équipe —
  // la séance de Trame de la classe —, elle ajoute 10 à la Lumière. Jamais de gemme.
  const suite = [];
  let piste = null;
  let lumiere = null;
  if (premiers.length) {
    piste = await require('./glChasse').pisteDefiTx(tx, {
      gameId,
      playerIds: premiers,
      resolved,
      actorType: 'team',
      actorId: String(defi.porteur),
    });
    if (piste?.event) suite.push(piste.event);
    if (String(defi.mode) === 'equipe') {
      lumiere = await require('./glTour').ajouterLumiereTx(tx, {
        gameId,
        n: 10,
        resolved,
        roundNumber: Number(game.current_round_number) || null,
        source: 'defi_trame',
      });
      if (lumiere) suite.push(...lumiere.events);
    }
  }
  return {
    premiers,
    pages,
    events: [event, ...suite],
    vue: {
      premiere: premiers.length > 0,
      page: pages.length > 0,
      pagesEpuisees,
      message: pagesEpuisees ? MESSAGE_PAGES_EPUISEES : null,
      piste: piste?.event ? piste.zoneKey : null,
      lumiere: lumiere ? 10 : 0,
    },
  };
}

/**
 * Écrit au carnet de l'équipe les pages décidées par un défi et pas encore découvertes — au
 * nom de l'élève, **sans aucune ressource**. Idempotent : appelé après chaque réussite, et à
 * chaque lecture de la liste des défis pour rattraper une écriture interrompue.
 * @returns {Promise<number>} nombre de pages écrites
 */
async function livrerPagesEnAttente(db, { game, teamId }) {
  const gameId = Number(game.id);
  const attente = await lire(
    db,
    `SELECT r.player_id, r.page_feuillet_code AS feuillet_code, p.pseudo
       FROM gl_trame_reussites r
       LEFT JOIN gl_players p ON p.id = r.player_id
       LEFT JOIN gl_game_feuillet_states s
              ON s.game_id = r.game_id AND s.team_id = r.team_id
             AND s.feuillet_code = r.page_feuillet_code
             AND (s.discovered_at IS NOT NULL OR s.status <> 'locked')
      WHERE r.game_id = ? AND r.team_id = ? AND r.page_feuillet_code IS NOT NULL
        AND s.feuillet_code IS NULL
      ORDER BY r.id ASC`,
    [gameId, teamId],
  );
  if (!attente.length) return 0;
  const { commitFeuilletDiscovery } = require('./glFeuilletAcquisition');
  const { resolveChapterFeuilletPool } = require('./glFeuilletChapterPool');
  const pool = await resolveChapterFeuilletPool(db, { chapterId: game.chapter_id });
  const parCode = new Map(pool.map((f) => [String(f.feuillet_code), f]));
  let ecrites = 0;
  for (const ligne of attente) {
    const feuillet = parCode.get(String(ligne.feuillet_code));
    if (!feuillet) continue;
    try {
      await commitFeuilletDiscovery(db, {
        game,
        feuillet,
        gameId,
        teamId,
        playerId: Number(ligne.player_id),
        playerName: ligne.pseudo || null,
        source: 'defi',
        sansRessource: true,
      });
      ecrites += 1;
    } catch (err) {
      // La page reste promise : la prochaine lecture de la liste des défis la rattrape.
      logger.warn(
        { err: err?.message, gameId, teamId, feuilletCode: String(ligne.feuillet_code) },
        '[gl-trame] page de veillée non écrite, sera rattrapée',
      );
    }
  }
  return ecrites;
}

// ---------------------------------------------------------------------
// Suivi du prof : tri alphabétique seulement, jamais de classement
// ---------------------------------------------------------------------

async function suivi(db, gameId) {
  const joueurs = await db.queryAll(
    `SELECT p.id, p.pseudo, p.first_name, p.last_name, t.id AS team_id, t.name AS team_name
       FROM gl_team_members tm
       INNER JOIN gl_players p ON p.id = tm.player_id
       INNER JOIN gl_teams t ON t.id = tm.team_id
      WHERE tm.game_id = ?`,
    [gameId],
  );
  const reussites = await lire(
    db,
    'SELECT player_id, type, unite, mode, page_feuillet_code FROM gl_trame_reussites WHERE game_id = ?',
    [gameId],
  );
  const defis = await lire(
    db,
    'SELECT id, player_id, team_id, type, unite, mode, statut, indices_utilises, etat_json FROM gl_trame_defis WHERE game_id = ?',
    [gameId],
  );
  const eleves = joueurs
    .map((j) => {
      const parType = {};
      for (const type of core.TRAME_TYPES) {
        const miens = defis.filter(
          (d) =>
            d.type === type &&
            (Number(d.player_id) === Number(j.id) ||
              (d.mode === 'equipe' && Number(d.team_id) === Number(j.team_id))),
        );
        parType[type] = {
          reussies: reussites
            .filter((r) => Number(r.player_id) === Number(j.id) && r.type === type)
            .map((r) => String(r.unite))
            .sort(),
          enCours: miens.filter((d) => d.statut === 'en_cours').length,
          indices: miens.reduce((n, d) => n + (Number(d.indices_utilises) || 0), 0),
        };
      }
      return {
        playerId: Number(j.id),
        nom: `${j.last_name || ''} ${j.first_name || ''}`.trim() || String(j.pseudo),
        pseudo: String(j.pseudo),
        equipe: String(j.team_name),
        defis: parType,
        pages: reussites.filter(
          (r) => Number(r.player_id) === Number(j.id) && r.page_feuillet_code != null,
        ).length,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  // Phrases facultatives de Réparer : à parcourir, sans compteur « à traiter ».
  const parId = new Map(joueurs.map((j) => [Number(j.id), j]));
  const equipes = new Map(joueurs.map((j) => [Number(j.team_id), String(j.team_name)]));
  const phrases = defis
    .filter((d) => d.type === 'reparer')
    .map((d) => {
      const texte = String(parseJson(d.etat_json, {}).pourquoi || '').trim();
      const j = parId.get(Number(d.player_id));
      return texte
        ? {
            auteur: j
              ? `${j.last_name || ''} ${j.first_name || ''}`.trim() || String(j.pseudo)
              : equipes.get(Number(d.team_id)) || 'Équipe',
            unite: String(d.unite),
            texte,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.auteur.localeCompare(b.auteur, 'fr'));
  return { eleves, phrases };
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export CSV du suivi (séparateur `;`, une ligne par élève, tri alphabétique). */
function suiviCsv({ eleves }) {
  const entete = ['Élève', 'Équipe'];
  for (const type of core.TRAME_TYPES) {
    entete.push(`${LIBELLES[type]} : unités réussies`, `${LIBELLES[type]} : indices`);
  }
  entete.push('Pages reçues');
  const lignes = eleves.map((e) => {
    const cells = [e.nom, e.equipe];
    for (const type of core.TRAME_TYPES) {
      cells.push(e.defis[type].reussies.join(' '), e.defis[type].indices);
    }
    cells.push(e.pages);
    return cells.map(csvCell).join(';');
  });
  return [entete.map(csvCell).join(';'), ...lignes].join('\n');
}

module.exports = {
  TYPES_PAR_PEUPLE,
  TYPES_COMMUNS,
  LIBELLES,
  loadRanger,
  loadAdaptation,
  MODES,
  MESSAGE_PAGES_EPUISEES,
  parseUnite,
  typesOuverts,
  porteurDe,
  loadTeam,
  tourOuvert,
  loadReseau,
  loadFils,
  loadReparer,
  unitesDuPlateau,
  buildModele,
  vuePublique,
  listDefis,
  listeAReparer,
  especesSignalees,
  creerOuReprendre,
  lireDefi,
  loadDefi,
  enregistrer,
  demanderIndice,
  prochainePage,
  pagesTirables,
  livrerPagesEnAttente,
  assertDefiJouable,
  pagesDeLaSemaine,
  suivi,
  suiviCsv,
};
