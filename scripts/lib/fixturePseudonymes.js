'use strict';

/**
 * Pseudonymisation, dans le flux d'un export SQL, des noms de personnes **recopiés** dans des
 * tables du jeu Gnomes & Licornes.
 *
 * L'anonymiseur (`scripts/anonymize-local-db.js`) réécrit les identités à la source
 * (`users`, `gl_players`, `gl_admins`…), mais le jeu recopie un nom au moment d'un geste :
 * qui a découvert un feuillet (`discovered_by_name`), qui a lancé un sort
 * (`casters[].displayName` dans le JSON d'un évènement)… Ces copies survivaient à
 * l'anonymisation. Le flux de sortie de `scripts/export-anonymized-fixture.js` les remplace
 * donc ici, ligne par ligne, par le même pseudonyme que celui de l'anonymiseur pour un joueur :
 * `joueur<id>` (cf. `gl_players.pseudo`).
 *
 * La règle est **générale** : toute colonne listée dans `GL_NAME_RULES.columns`, et dans les
 * colonnes JSON listées, toute clé dont le nom désigne un nom ou un pseudo de personne
 * (`PERSON_NAME_KEY`), à n'importe quelle profondeur. L'identifiant du pseudonyme est celui
 * de l'objet JSON englobant le plus proche qui porte un `playerId` / `userId`, à défaut la
 * colonne d'acteur de la ligne.
 *
 * Seules les lignes réellement modifiées sont réécrites : le reste de l'export ressort à
 * l'octet près, ce qui garde un diff lisible entre deux exports.
 */

const { splitValueTuples } = require('./sqlDumpInserts');

/**
 * Tables visées. `columns` : colonne de nom → colonne qui porte l'identifiant du joueur.
 * `json` : colonne JSON → colonne de repli pour l'identifiant (acteur de la ligne).
 */
const GL_NAME_RULES = {
  gl_game_feuillet_states: { columns: { discovered_by_name: 'discovered_by_player_id' } },
  gl_player_feuillet_states: { columns: { discovered_by_name: 'discovered_by_player_id' } },
  gl_game_events: { json: { payload_json: 'actor_id' } },
  gl_action_requests: { json: { payload_json: 'player_id' } },
};

/**
 * Clés JSON qui portent un nom ou un pseudo de personne. Les noms de contenu (`spellName`,
 * `speciesName`, `titre`…) ne sont pas visés : ils ne désignent personne.
 */
const PERSON_NAME_KEY =
  /^(?:display_?name|pseudo|nickname|first_?name|last_?name|full_?name|discovered_?by|(?:player|actor|author|caster|student|user|teacher|owner|mj)_?(?:name|pseudo|display_?name))$/i;

/** Gabarit des pseudonymes produits (même forme que `gl_players.pseudo` anonymisé). */
const GABARIT_PSEUDONYME = /^joueur\d+$/;

/** Clés d'identifiant cherchées dans l'objet englobant. */
const ID_KEYS = ['playerId', 'player_id', 'userId', 'user_id'];

function pseudonymeJoueur(id) {
  const brut = id == null ? '' : String(id).trim();
  return /^\d+$/.test(brut) ? `joueur${brut}` : 'joueur0';
}

/** Décode un littéral SQL brut de `mariadb-dump` (`'texte'`, `NULL`, `12`). */
function decodeSqlLiteral(raw) {
  if (raw === 'NULL') return null;
  if (!raw.startsWith("'")) return raw;
  const body = raw.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) {
      const n = body[(i += 1)];
      out += { 0: '\0', n: '\n', r: '\r', t: '\t', b: '\b', Z: '\x1a' }[n] ?? n;
    } else if (c === "'" && body[i + 1] === "'") {
      out += "'";
      i += 1;
    } else {
      out += c;
    }
  }
  return out;
}

/** Encode une chaîne comme `mariadb-dump` (règles de `mysql_real_escape_string`). */
function encodeSqlString(value) {
  const map = { '\0': '\\0', '\n': '\\n', '\r': '\\r', '\\': '\\\\', "'": "\\'", '"': '\\"' };
  map['\x1a'] = '\\Z';
  return `'${String(value).replace(/[\0\n\r\\'"\x1a]/g, (c) => map[c])}'`;
}

function creerPseudonymiseurGl() {
  const colonnes = new Map();
  const stats = { champs: 0, modifies: 0, horsGabarit: 0, jsonIllisible: 0 };
  let ddlTable = null;
  let ddlColonnes = null;
  let insertTable = null;

  const remplacer = (valeur, id) => {
    stats.champs += 1;
    const pseudo = pseudonymeJoueur(id);
    if (!GABARIT_PSEUDONYME.test(String(valeur))) stats.horsGabarit += 1;
    if (valeur === pseudo) return valeur;
    stats.modifies += 1;
    return pseudo;
  };

  /** Parcourt le JSON ; renvoie true si une valeur a changé. */
  const parcourir = (noeud, idParent) => {
    let change = false;
    if (Array.isArray(noeud)) {
      for (const x of noeud) change = parcourir(x, idParent) || change;
      return change;
    }
    if (!noeud || typeof noeud !== 'object') return false;
    const cle = ID_KEYS.find((k) => noeud[k] != null && /^\d+$/.test(String(noeud[k])));
    const id = cle ? noeud[cle] : idParent;
    for (const [k, v] of Object.entries(noeud)) {
      if (typeof v === 'string' && v !== '' && PERSON_NAME_KEY.test(k)) {
        const nv = remplacer(v, id);
        if (nv !== v) {
          noeud[k] = nv;
          change = true;
        }
      } else if (v && typeof v === 'object') {
        change = parcourir(v, id) || change;
      }
    }
    return change;
  };

  const traiterLigneValeurs = (regle, cols, valeurs) => {
    const index = (nom) => cols.indexOf(nom);
    let change = false;
    for (const [col, colId] of Object.entries(regle.columns || {})) {
      const i = index(col);
      if (i < 0 || i >= valeurs.length) continue;
      const v = decodeSqlLiteral(valeurs[i]);
      if (v == null || v === '') continue;
      const nv = remplacer(v, decodeSqlLiteral(valeurs[index(colId)] ?? 'NULL'));
      if (nv !== v) {
        valeurs[i] = encodeSqlString(nv);
        change = true;
      }
    }
    for (const [col, colId] of Object.entries(regle.json || {})) {
      const i = index(col);
      if (i < 0 || i >= valeurs.length) continue;
      const v = decodeSqlLiteral(valeurs[i]);
      if (v == null || v === '') continue;
      let doc;
      try {
        doc = JSON.parse(v);
      } catch {
        stats.jsonIllisible += 1;
        continue;
      }
      if (parcourir(doc, decodeSqlLiteral(valeurs[index(colId)] ?? 'NULL'))) {
        valeurs[i] = encodeSqlString(JSON.stringify(doc));
        change = true;
      }
    }
    return change;
  };

  /** Traite une ligne de l'export (sans son saut de ligne) et la renvoie, modifiée ou non. */
  function ligne(texte) {
    const create = /^CREATE TABLE `([^`]+)` \(/.exec(texte);
    if (create) {
      ddlTable = create[1];
      ddlColonnes = [];
      return texte;
    }
    if (ddlTable) {
      const col = /^\s*`([^`]+)`\s/.exec(texte);
      if (col) ddlColonnes.push(col[1]);
      else if (/^\s*\)/.test(texte)) {
        colonnes.set(ddlTable, ddlColonnes);
        ddlTable = null;
      }
      return texte;
    }

    let prefixe = '';
    let reste = texte;
    const insert = /^INSERT INTO `([^`]+)`(?: \([^)]*\))? VALUES\s*/.exec(texte);
    if (insert) {
      insertTable = insert[1];
      prefixe = insert[0];
      reste = texte.slice(prefixe.length);
    }
    const table = insertTable;
    if (/;\s*$/.test(texte)) insertTable = null;
    if (!table || !reste.startsWith('(')) return texte;

    const regle = GL_NAME_RULES[table];
    const cols = colonnes.get(table);
    if (!regle || !cols) return texte;

    const fin = reste.lastIndexOf(')');
    const suffixe = reste.slice(fin + 1);
    const lignes = splitValueTuples(reste.slice(0, fin + 1));
    let change = false;
    for (const valeurs of lignes) change = traiterLigneValeurs(regle, cols, valeurs) || change;
    if (!change) return texte;
    return prefixe + lignes.map((v) => `(${v.join(',')})`).join(',') + suffixe;
  }

  return { ligne, stats };
}

module.exports = {
  GL_NAME_RULES,
  PERSON_NAME_KEY,
  GABARIT_PSEUDONYME,
  pseudonymeJoueur,
  decodeSqlLiteral,
  encodeSqlString,
  creerPseudonymiseurGl,
};
