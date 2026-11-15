/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/gl/defis/trameCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Cœur pur des défis de la Trame (« Tenir à deux », lot 3, § 8.3).
 *
 * Sans dépendance ni accès réseau : partagé par l'écran (retour immédiat) et par le serveur, qui
 * rejoue tout (miroir CJS `lib/shared/glTrameCore.js`, régénéré par `npm run sync:shared-cores`).
 * Les **solutions** (liens acceptés, cascade attendue) ne vivent que côté serveur : l'écran ne
 * reçoit un modèle complet que pour ce qu'il a déjà trouvé.
 *
 * Sens des flèches : **de la ressource vers celui qui la mange** (« est mangé par »). Toute carte
 * peut pointer vers une carte de rôle `decomposeur`. Les charognards sont des consommateurs.
 *
 * Quatre défis sur un même plateau de cartes :
 * - **Retisser** (`classifyLink`, `isRetisserComplet`) : relier les cartes d'un réseau ;
 * - **La trame altérée** (`cascade`, `verifierPredictions`) : prévoir ce que devient chaque carte
 *   quand on en retire une ;
 * - **Les fils cachés** (`buildFils`, `classifyLink`, `isFilsComplet`) : causes → effets ;
 * - **Réparer** (`verifierRangement`, `verifierMesures`, `isReparerComplet`) : ranger six espèces,
 *   puis choisir une mesure.
 *
 * Garde-fous : aucun message ne dit « non » ni « faux » ; un lien non prévu est « à discuter »,
 * jamais refusé ; une erreur de sens s'explique.
 */

const TRAME_NIVEAUX = Object.freeze([5, 7, 9, 12]);
const TRAME_NIVEAU_ALTEREE = 9;
const TRAME_TYPES = Object.freeze(['retisser', 'reparer', 'alteree', 'fils']);
const TRAME_CLASSEMENTS_DE_FLECHE = Object.freeze([
  'boucle',
  'doublon',
  'trouvee',
  'inversee',
  'a_discuter',
]);
const TRAME_EFFETS = Object.freeze(['augmente', 'diminue', 'disparait', 'rien']);
const TRAME_CATEGORIES = Object.freeze(['en_danger', 'fragile', 'pas_menace']);
/** Bornes d'un état enregistré (rejouées par le serveur). */
const TRAME_MAX_FLECHES = 60;
const TRAME_MAX_TEXTE = 280;
/** Réparer : nombre d'espèces menacées pour lesquelles il faut choisir une mesure. */
const TRAME_REPARER_ESPECES_REQUISES = 2;

const TRAME_MESSAGES = Object.freeze({
  boucle: 'Une carte ne se relie pas à elle-même.',
  doublon: 'Cette flèche est déjà posée.',
  trouvee: 'Lien trouvé.',
  inversee: 'Regarde le sens : la flèche va de celui qui est mangé vers celui qui mange.',
  inverseeFils: 'Regarde le sens : la flèche va de la cause vers son effet.',
  a_discuter: 'À discuter avec ton équipe ou avec ton professeur.',
  retisserComplet:
    'Chaque animal a trouvé quelque chose à manger, chaque plante a une suite, et une flèche au moins va vers les décomposeurs.',
  filsComplet: 'Tous les fils sont retrouvés, chacun dans le bon sens.',
  matiereMorte:
    'Sans ces décomposeurs, la matière morte s’accumule : elle n’est plus transformée en éléments utiles aux plantes.',
  etapeManquante: 'C’est vrai, mais il manque une étape entre les deux.',
  sansChangement:
    'Pas de changement direct pour cette carte : elle ne mange pas la carte retirée et n’est pas mangée par elle.',
  resteAMatiereMorte: 'Il reste toujours de la matière morte à décomposer.',
  pasEncore: 'Pas encore.',
});

const texte = (v) => (v == null ? '' : String(v).trim());
const cleDe = (de, vers) => `${de}>${vers}`;

function lireLiens(liste) {
  return (Array.isArray(liste) ? liste : [])
    .map((l) =>
      Array.isArray(l)
        ? { de: texte(l[0]), vers: texte(l[1]), pourquoi: null }
        : { de: texte(l?.de), vers: texte(l?.vers), pourquoi: texte(l?.pourquoi) || null },
    )
    .filter((l) => l.de && l.vers);
}

/**
 * Modèle d'un réseau à un niveau (les `niveau` premières cartes).
 * Accepte la forme du fichier (`especes`, `liens_acceptes`, `a_discuter`) comme la forme
 * normalisée (`cartes`, `liens`, `aDiscuter`).
 * @returns {{ type: 'reseau', biome, niveau, cartes, liens, aDiscuter, decomposeurs }}
 */
function buildReseau(reseau, niveau = TRAME_NIVEAUX[0]) {
  const brutes = Array.isArray(reseau?.cartes) ? reseau.cartes : reseau?.especes;
  const n = Math.max(1, Math.floor(Number(niveau) || 0));
  const cartes = (Array.isArray(brutes) ? brutes : []).slice(0, n).map((c) => ({
    code: texte(c?.code),
    nom: texte(c?.nom),
    role: texte(c?.role),
    generique: c?.generique === true || c?.generique === 1,
    regime: texte(c?.regime) || null,
    precision: texte(c?.precision ?? c?.precision_texte) || null,
  }));
  const dedans = new Set(cartes.map((c) => c.code));
  const duNiveau = (l) => dedans.has(l.de) && dedans.has(l.vers);
  return {
    type: 'reseau',
    biome: texte(reseau?.biome) || null,
    niveau: n,
    cartes,
    liens: lireLiens(reseau?.liens ?? reseau?.liens_acceptes).filter(duNiveau),
    aDiscuter: lireLiens(reseau?.aDiscuter ?? reseau?.a_discuter).filter(duNiveau),
    decomposeurs: cartes.filter((c) => c.role === 'decomposeur').map((c) => c.code),
  };
}

/** Modèle des « fils cachés » d'un plateau : cartes de texte, liens cause → effet. */
function buildFils(chapitre) {
  const cartes = (Array.isArray(chapitre?.cartes) ? chapitre.cartes : []).map((c) =>
    Array.isArray(c)
      ? { code: texte(c[0]), nom: texte(c[1]), role: 'fil' }
      : { code: texte(c?.code), nom: texte(c?.texte ?? c?.nom), role: 'fil' },
  );
  const dedans = new Set(cartes.map((c) => c.code));
  return {
    type: 'fils',
    plateau: Number(chapitre?.plateau) || null,
    titre: texte(chapitre?.titre) || null,
    cartes,
    liens: lireLiens(chapitre?.liens).filter((l) => dedans.has(l.de) && dedans.has(l.vers)),
    aDiscuter: [],
    decomposeurs: [],
  };
}

function index(model) {
  return {
    cartes: new Map(model.cartes.map((c) => [c.code, c])),
    acceptes: new Set(model.liens.map((l) => cleDe(l.de, l.vers))),
    discutes: new Map(model.aDiscuter.map((l) => [cleDe(l.de, l.vers), l.pourquoi])),
    decomposeurs: new Set(model.decomposeurs),
  };
}

/**
 * Classe une flèche `de → vers`, dans cet ordre : `boucle`, `doublon`, `trouvee` (lien accepté,
 * ou toute carte vers un décomposeur), `inversee` (l'inverse d'un lien accepté), `a_discuter`
 * (prévu comme tel, avec son « pourquoi », ou non prévu).
 * @param {Array<{de,vers}>} [existantes] flèches déjà posées (hors celle qu'on classe)
 * @returns {{ classement: string, message: string, viaDecomposeur?: boolean }}
 */
function classifyLink(model, de, vers, existantes = []) {
  const a = texte(de);
  const b = texte(vers);
  const idx = index(model);
  if (a === b) return { classement: 'boucle', message: TRAME_MESSAGES.boucle };
  if ((existantes || []).some((f) => texte(f?.de) === a && texte(f?.vers) === b)) {
    return { classement: 'doublon', message: TRAME_MESSAGES.doublon };
  }
  if (!idx.cartes.has(a) || !idx.cartes.has(b)) {
    return { classement: 'a_discuter', message: TRAME_MESSAGES.a_discuter };
  }
  if (idx.acceptes.has(cleDe(a, b))) {
    return { classement: 'trouvee', message: TRAME_MESSAGES.trouvee };
  }
  if (idx.decomposeurs.has(b)) {
    return { classement: 'trouvee', message: TRAME_MESSAGES.trouvee, viaDecomposeur: true };
  }
  // Fils cachés : une cause qui mène à l'effet par une ou plusieurs étapes n'est pas à l'envers,
  // même si le fil direct existe dans l'autre sens (la boucle du plateau 4) — il manque une étape.
  const raccourci = model.type === 'fils' && meneA(model, a, b);
  if (idx.acceptes.has(cleDe(b, a)) && !raccourci) {
    return {
      classement: 'inversee',
      message: model.type === 'fils' ? TRAME_MESSAGES.inverseeFils : TRAME_MESSAGES.inversee,
    };
  }
  return {
    classement: 'a_discuter',
    message:
      idx.discutes.get(cleDe(a, b)) ||
      (raccourci ? TRAME_MESSAGES.etapeManquante : TRAME_MESSAGES.a_discuter),
  };
}

/** Une suite de liens acceptés mène-t-elle de `de` à `vers` ? */
function meneA(model, de, vers) {
  const vues = new Set([de]);
  const file = [de];
  while (file.length) {
    const courant = file.shift();
    for (const l of model.liens) {
      if (l.de !== courant || vues.has(l.vers)) continue;
      if (l.vers === vers) return true;
      vues.add(l.vers);
      file.push(l.vers);
    }
  }
  return false;
}

/** Flèches d'un état, dédoublonnées, chacune avec son classement et son message. */
function classifyAll(model, fleches) {
  const out = [];
  for (const f of Array.isArray(fleches) ? fleches : []) {
    const de = texte(f?.de);
    const vers = texte(f?.vers);
    if (!de || !vers) continue;
    out.push({ de, vers, ...classifyLink(model, de, vers, out) });
  }
  return out;
}

/** Nombre de liens trouvés (affiché **sans total**). */
function compterTrouvees(model, fleches) {
  return classifyAll(model, fleches).filter((f) => f.classement === 'trouvee').length;
}

/** Ressources d'une carte au niveau du modèle : les cartes qu'elle mange (liens acceptés). */
function ressourcesDe(model, code) {
  return model.liens.filter((l) => l.vers === code).map((l) => l.de);
}

/**
 * Fin d'un niveau de Retisser : chaque animal a trouvé quelque chose à manger, chaque plante a
 * une suite, et une flèche au moins va vers les décomposeurs ; aucune flèche inversée ne reste.
 * @returns {{ complet: boolean, manques: { sansRessource: string[], sansSuite: string[],
 *   versDecomposeur: boolean, inversees: number } }}
 */
function etatRetisser(model, fleches) {
  const classees = classifyAll(model, fleches);
  const trouvees = classees.filter((f) => f.classement === 'trouvee');
  const nourries = new Set(trouvees.filter((f) => !f.viaDecomposeur).map((f) => f.vers));
  const avecSuite = new Set(trouvees.map((f) => f.de));
  const sansRessource = model.cartes
    .filter(
      (c) =>
        c.role === 'consommateur' && ressourcesDe(model, c.code).length && !nourries.has(c.code),
    )
    .map((c) => c.code);
  const sansSuite = model.cartes
    .filter((c) => c.role === 'producteur' && !avecSuite.has(c.code))
    .map((c) => c.code);
  const decomposeurs = new Set(model.decomposeurs);
  const versDecomposeur = trouvees.some((f) => decomposeurs.has(f.vers));
  const inversees = classees.filter((f) => f.classement === 'inversee').length;
  return {
    complet: !sansRessource.length && !sansSuite.length && versDecomposeur && inversees === 0,
    manques: { sansRessource, sansSuite, versDecomposeur, inversees },
  };
}

function isRetisserComplet(model, fleches) {
  return etatRetisser(model, fleches).complet;
}

/** Fils cachés : chaque lien accepté est trouvé et aucune flèche inversée ne reste. */
function isFilsComplet(model, fleches) {
  const classees = classifyAll(model, fleches);
  const trouvees = new Set(
    classees.filter((f) => f.classement === 'trouvee').map((f) => cleDe(f.de, f.vers)),
  );
  return (
    model.liens.every((l) => trouvees.has(cleDe(l.de, l.vers))) &&
    !classees.some((f) => f.classement === 'inversee')
  );
}

// ---------------------------------------------------------------------
// La trame altérée : cascade
// ---------------------------------------------------------------------

/**
 * Un nom de carte dans une phrase : entre guillemets, sans article. Les phrases sont composées
 * à partir des noms du catalogue, dont on ne connaît ni le genre ni l'élision (« Élan »,
 * « Girafe », « Décomposeurs du sol ») : aucune ne s'accorde avec le nom.
 */
const cite = (nom) => `« ${nom} »`;

function listeDeNoms(noms) {
  const cites = noms.map(cite);
  if (cites.length <= 1) return cites.join('');
  return `${cites.slice(0, -1).join(', ')} et ${cites[cites.length - 1]}`;
}

/**
 * Ce que devient chaque carte quand on retire `retiree` du réseau (niveau 9).
 * - « Mobile » : toute carte qui n'est ni un producteur ni le décomposeur générique.
 * - **Disparaît** : carte mobile dont toutes les ressources du niveau ont disparu (propagation).
 * - **Diminue** : carte mobile qui perd au moins une ressource, mais pas toutes.
 * - **Augmente** : ressources directes de la carte retirée, sauf si elles disparaissent ; ne
 *   s'applique pas si la carte retirée est un décomposeur.
 * - Carte retirée = décomposeur : les producteurs diminuent, la matière morte s'accumule.
 * @returns {{ retiree: string, effets: Record<string, string>, explications: Record<string,
 *   string>, message: string|null, pourAllerPlusLoin: string|null }} `effets` ne porte que les
 *   cartes touchées (les autres : `rien`).
 */
function cascade(model, retiree) {
  const code = texte(retiree);
  const cartes = new Map(model.cartes.map((c) => [c.code, c]));
  const retire = cartes.get(code);
  if (!retire) {
    return { retiree: code, effets: {}, explications: {}, message: null, pourAllerPlusLoin: null };
  }
  const nom = (c) => cartes.get(c).nom;
  const mobile = (c) => c.role !== 'producteur' && !c.generique;
  const disparues = new Set([code]);
  let change = true;
  while (change) {
    change = false;
    for (const c of model.cartes) {
      if (disparues.has(c.code) || !mobile(c)) continue;
      const res = ressourcesDe(model, c.code);
      if (res.length && res.every((r) => disparues.has(r))) {
        disparues.add(c.code);
        change = true;
      }
    }
  }
  const decomposeurRetire = retire.role === 'decomposeur';
  const proies = new Set(ressourcesDe(model, code));
  const effets = {};
  const explications = {};
  for (const c of model.cartes) {
    if (c.code === code) continue;
    const res = ressourcesDe(model, c.code);
    const perdues = res.filter((r) => disparues.has(r));
    if (disparues.has(c.code)) {
      effets[c.code] = 'disparait';
      explications[c.code] =
        `Dans ce réseau, il ne reste plus rien à manger pour ${cite(c.nom)} : ${listeDeNoms(perdues.map(nom))} ${perdues.length > 1 ? 'ont' : 'a'} disparu.`;
    } else if (mobile(c) && perdues.length) {
      effets[c.code] = 'diminue';
      explications[c.code] =
        `${cite(c.nom)} perd une partie de sa nourriture : ${listeDeNoms(perdues.map(nom))}. Il lui reste ${listeDeNoms(res.filter((r) => !disparues.has(r)).map(nom))}.`;
    } else if (decomposeurRetire) {
      if (c.role === 'producteur') {
        effets[c.code] = 'diminue';
        explications[c.code] =
          `${cite(c.nom)} pousse moins bien : sans ${retire.generique ? 'les décomposeurs' : cite(retire.nom)}, la matière morte n’est plus transformée en éléments utiles aux plantes.`;
      }
    } else if (proies.has(c.code)) {
      effets[c.code] = 'augmente';
      explications[c.code] =
        `${cite(retire.nom)} ne mange plus ${cite(c.nom)} : il y en a davantage.`;
    }
  }
  return {
    retiree: code,
    effets,
    explications,
    message: decomposeurRetire ? TRAME_MESSAGES.matiereMorte : null,
    pourAllerPlusLoin: pourAllerPlusLoin(model, effets, retire),
  };
}

/** Phrase d'ouverture, non notée, vers l'étage suivant de la cascade. */
function pourAllerPlusLoin(model, effets, retire) {
  const cartes = new Map(model.cartes.map((c) => [c.code, c]));
  const nom = (c) => cartes.get(c).nom;
  const augmentees = Object.keys(effets).filter((c) => effets[c] === 'augmente');
  if (augmentees.length) {
    const suivantes = [
      ...new Set(augmentees.flatMap((c) => ressourcesDe(model, c)).filter((c) => !effets[c])),
    ];
    if (suivantes.length) {
      // « que deviendrait le lichen », « que deviendraient l'herbe et l'acacia ».
      const verbe = suivantes.length > 1 ? 'deviendraient' : 'deviendrait';
      return `Avec plus de ${listeDeNoms(augmentees.map(nom))}, que ${verbe} ${listeDeNoms(suivantes.map(nom))} ?`;
    }
    return `Avec plus de ${listeDeNoms(augmentees.map(nom))}, qu’est-ce qui changerait encore dans ce milieu ?`;
  }
  if (retire.role === 'decomposeur') {
    return 'Et les animaux qui mangent ces plantes, que deviendraient-ils ?';
  }
  const disparues = Object.keys(effets).filter((c) => effets[c] === 'disparait');
  if (disparues.length && retire.role === 'producteur') {
    return `${cite(retire.nom)} en moins, et tant de cartes touchées : pourquoi les êtres vivants du début des chaînes comptent-ils autant dans un milieu ?`;
  }
  if (disparues.length) {
    return `Sans ${listeDeNoms(disparues.map(nom))}, qui profiterait de la place laissée libre ?`;
  }
  return `Si ${cite(retire.nom)} revenait, combien de temps faudrait-il pour que tout se rétablisse ?`;
}

/**
 * Compare les prédictions d'un élève (`{ code: 'augmente' | 'diminue' | 'disparait' | 'rien' }`)
 * à la cascade. Une carte sans prédiction compte comme « pas encore ».
 * @returns {{ complet: boolean, cartes: Array<{ code, juste: boolean, message: string }> }}
 *   Une prédiction juste reçoit l'explication ; les autres « Pas encore », sans la réponse.
 */
function verifierPredictions(model, retiree, predictions) {
  const attendu = cascade(model, retiree);
  const cartes = model.cartes
    .filter((c) => c.code !== attendu.retiree)
    .map((c) => {
      const voulu = attendu.effets[c.code] || 'rien';
      const dit = texte(predictions?.[c.code]);
      const juste = dit === voulu;
      return {
        code: c.code,
        juste,
        message: juste
          ? attendu.explications[c.code] ||
            (c.generique ? TRAME_MESSAGES.resteAMatiereMorte : TRAME_MESSAGES.sansChangement)
          : TRAME_MESSAGES.pasEncore,
      };
    });
  return { complet: cartes.every((c) => c.juste), cartes };
}

// ---------------------------------------------------------------------
// Réparer
// ---------------------------------------------------------------------

/**
 * Rangement des six espèces (`{ code: categorie }`) : essais illimités, jamais la bonne réponse.
 * @param {{ aClasser: Array<{ code, categorie }> }} model
 */
function verifierRangement(model, rangement) {
  const cartes = (model?.aClasser || []).map((e) => {
    const juste = texte(rangement?.[e.code]) === e.categorie;
    return {
      code: e.code,
      juste,
      message: juste ? 'C’est la bonne colonne.' : TRAME_MESSAGES.pasEncore,
    };
  });
  return { complet: cartes.length > 0 && cartes.every((c) => c.juste), cartes };
}

/**
 * Mesures choisies (`{ code d'espèce: [codes de mesure] }`) : une espèce est « réparée » dès
 * qu'une de ses mesures acceptées est choisie.
 * @param {{ especes: Array<{ code, mesures: string[] }> }} model
 */
function verifierMesures(model, choix) {
  const especes = (model?.especes || []).map((e) => {
    const choisies = Array.isArray(choix?.[e.code]) ? choix[e.code].map(texte) : [];
    const juste = choisies.some((m) => (e.mesures || []).includes(m));
    return {
      code: e.code,
      juste,
      message: juste
        ? 'Cette mesure répond à la menace.'
        : choisies.length
          ? `${TRAME_MESSAGES.pasEncore} Relis la menace : que faudrait-il changer ?`
          : null,
    };
  });
  return { reparees: especes.filter((e) => e.juste).length, especes };
}

/** Nombre d'espèces à réparer pour finir (deux, ou moins si le plateau en compte moins). */
function especesRequises(model) {
  return Math.min(TRAME_REPARER_ESPECES_REQUISES, (model?.especes || []).length);
}

/** Réparer est fini : six espèces rangées, leçon lue, une mesure acceptée pour deux espèces. */
function isReparerComplet(model, etat) {
  return (
    verifierRangement(model, etat?.rangement).complet &&
    etat?.leconLue === true &&
    verifierMesures(model, etat?.mesures).reparees >= especesRequises(model) &&
    especesRequises(model) > 0
  );
}

// ---------------------------------------------------------------------
// Indices : gratuits, illimités, en échelle, déterministes
// ---------------------------------------------------------------------

/**
 * Indice suivant d'un plateau de cartes (Retisser, Fils cachés).
 * `etat.indices` = nombre d'indices déjà donnés. Échelle : relire la consigne ; structure ;
 * piste sur une carte encore isolée ; révélation d'un lien accepté non trouvé (à valider par
 * l'élève : l'écran le montre en pointillés, il ne le pose pas à sa place).
 * @returns {{ rang: number, genre: 'consigne'|'structure'|'piste'|'revelation', message: string,
 *   carte?: string, lien?: { de: string, vers: string } }}
 */
function nextHint(model, etat) {
  const rang = Math.max(0, Math.floor(Number(etat?.indices) || 0));
  const fils = model.type === 'fils';
  if (rang === 0) {
    return {
      rang,
      genre: 'consigne',
      message: fils
        ? 'Relis la consigne : chaque flèche va d’une cause vers son effet.'
        : 'Relis la consigne : chaque flèche va de celui qui est mangé vers celui qui mange.',
    };
  }
  if (rang === 1) {
    return {
      rang,
      genre: 'structure',
      message: fils
        ? 'Cherche une carte qui peut servir de départ, puis demande-toi : et alors, que se passe-t-il ? Il peut y avoir plusieurs départs.'
        : 'Commence par une plante : qui la mange ?',
    };
  }
  const classees = classifyAll(model, etat?.fleches);
  const trouvees = new Set(
    classees.filter((f) => f.classement === 'trouvee').map((f) => cleDe(f.de, f.vers)),
  );
  const manquants = model.liens.filter((l) => !trouvees.has(cleDe(l.de, l.vers)));
  const nom = (code) => model.cartes.find((c) => c.code === code).nom;
  if (rang === 2) {
    const reliees = new Set(classees.flatMap((f) => [f.de, f.vers]));
    const isolee = model.cartes.find(
      (c) => !reliees.has(c.code) && manquants.some((l) => l.de === c.code || l.vers === c.code),
    );
    if (isolee) {
      return {
        rang,
        genre: 'piste',
        carte: isolee.code,
        message: fils
          ? `La carte ${cite(isolee.nom)} n’est reliée à rien : qu’est-ce qui la provoque, ou que provoque-t-elle ?`
          : isolee.role === 'producteur'
            ? `La carte ${cite(isolee.nom)} n’est reliée à rien : qui s’en nourrit ?`
            : `La carte ${cite(isolee.nom)} n’est reliée à rien : de quoi se nourrit-elle, et qui s’en nourrit ?`,
      };
    }
  }
  const lien = manquants[(rang - 2) % Math.max(1, manquants.length)] || null;
  if (!lien) {
    return {
      rang,
      genre: 'structure',
      message: fils
        ? 'Tous les fils prévus sont là : vérifie le sens de chaque flèche.'
        : 'Tous les liens prévus sont là : vérifie le sens des flèches, et pense aux décomposeurs.',
    };
  }
  return {
    rang,
    genre: 'revelation',
    lien: { de: lien.de, vers: lien.vers },
    message: fils
      ? `Un fil à tracer : ${cite(nom(lien.de))} mène à ${cite(nom(lien.vers))}.`
      : `${cite(nom(lien.vers))} se nourrit de ${cite(nom(lien.de))} : trace la flèche de ${cite(nom(lien.de))} vers ${cite(nom(lien.vers))}.`,
  };
}

// ---------------------------------------------------------------------
// Bornes d'un état enregistré
// ---------------------------------------------------------------------

const borne = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 10) / 10)) : null;
};

/**
 * État d'un défi ramené à ses bornes : au plus 60 flèches entre cartes connues, textes de 280
 * caractères, coordonnées de 0 à 100. Tout ce qui n'est pas attendu est écarté.
 * @param {string} type `retisser` | `alteree` | `fils` | `reparer`
 * @param {string[]} codes codes de cartes (ou d'espèces) admis
 */
function normaliserEtat(type, etat, codes = []) {
  const admis = new Set((codes || []).map(texte));
  const src = etat && typeof etat === 'object' && !Array.isArray(etat) ? etat : {};
  const out = { indices: Math.min(999, Math.max(0, Math.floor(Number(src.indices) || 0))) };
  if (type === 'retisser' || type === 'fils') {
    const vues = new Set();
    out.fleches = [];
    for (const f of Array.isArray(src.fleches) ? src.fleches : []) {
      const de = texte(f?.de);
      const vers = texte(f?.vers);
      const cle = cleDe(de, vers);
      if (!admis.has(de) || !admis.has(vers) || de === vers || vues.has(cle)) continue;
      vues.add(cle);
      out.fleches.push({ de, vers });
      if (out.fleches.length >= TRAME_MAX_FLECHES) break;
    }
    out.positions = {};
    const positions = src.positions && typeof src.positions === 'object' ? src.positions : {};
    for (const code of admis) {
      const x = borne(positions[code]?.x);
      const y = borne(positions[code]?.y);
      if (x != null && y != null) out.positions[code] = { x, y };
    }
  }
  if (type === 'alteree') {
    out.predictions = {};
    for (const code of admis) {
      const p = texte(src.predictions?.[code]);
      if (TRAME_EFFETS.includes(p)) out.predictions[code] = p;
    }
    out.verifie = src.verifie === true;
  }
  if (type === 'reparer') {
    out.rangement = {};
    out.mesures = {};
    for (const code of admis) {
      const c = texte(src.rangement?.[code]);
      if (TRAME_CATEGORIES.includes(c)) out.rangement[code] = c;
      const m = Array.isArray(src.mesures?.[code]) ? src.mesures[code] : null;
      if (m) out.mesures[code] = [...new Set(m.map(texte).filter(Boolean))].slice(0, 12);
    }
    out.leconLue = src.leconLue === true;
    const pourquoi = texte(src.pourquoi).slice(0, TRAME_MAX_TEXTE);
    if (pourquoi) out.pourquoi = pourquoi;
  }
  return out;
}

module.exports = {
  TRAME_NIVEAUX,
  TRAME_NIVEAU_ALTEREE,
  TRAME_TYPES,
  TRAME_CLASSEMENTS_DE_FLECHE,
  TRAME_EFFETS,
  TRAME_CATEGORIES,
  TRAME_MAX_FLECHES,
  TRAME_MAX_TEXTE,
  TRAME_REPARER_ESPECES_REQUISES,
  TRAME_MESSAGES,
  buildReseau,
  buildFils,
  classifyLink,
  classifyAll,
  compterTrouvees,
  etatRetisser,
  isRetisserComplet,
  isFilsComplet,
  cascade,
  verifierPredictions,
  verifierRangement,
  verifierMesures,
  especesRequises,
  isReparerComplet,
  nextHint,
  normaliserEtat,
};
