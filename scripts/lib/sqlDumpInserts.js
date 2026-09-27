'use strict';

/**
 * Lecture des `INSERT` d'un export SQL (`mariadb-dump` / `mysqldump`), partagée par
 * `scripts/extract-biodiv-pedago-seed.js` (qui produit `sql/biodiv_pedago_seed.sql`) et ses
 * deux consommateurs (`scripts/import-biodiv-pedago.js`, `scripts/import-plants-enriched.js`).
 *
 * Le découpage respecte les chaînes SQL et leurs échappements (`\'`, `''`) : un `;`, une
 * parenthèse ou une virgule dans un texte n'ouvre ni ne ferme rien.
 */

/**
 * Fin (index exclu) d'une instruction commençant à `start` : le premier `;` hors chaîne.
 * @returns {number} -1 si l'instruction n'est pas terminée
 */
function statementEnd(sql, start) {
  let inString = false;
  let escape = false;
  for (let i = start; i < sql.length; i++) {
    const c = sql[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString && c === '\\') {
      escape = true;
      continue;
    }
    if (c === "'") {
      inString = !inString;
      continue;
    }
    if (!inString && c === ';') return i + 1;
  }
  return -1;
}

/**
 * Toutes les instructions `INSERT INTO \`table\` …` du texte, dans l'ordre.
 * Un export volumineux en contient plusieurs par table (`mysqldump` coupe vers 1 Mo).
 * @returns {Array<{ text: string, columns: string[] | null, valuesText: string }>}
 */
function findInsertStatements(sql, table) {
  const marker = 'INSERT INTO `' + table + '` ';
  const out = [];
  let from = 0;
  for (;;) {
    const start = sql.indexOf(marker, from);
    if (start < 0) break;
    const end = statementEnd(sql, start);
    if (end < 0) break;
    const text = sql.slice(start, end);
    const head = text.slice(marker.length);
    let columns = null;
    let valuesAt;
    if (head.startsWith('(')) {
      const close = head.indexOf(')');
      columns = head
        .slice(1, close)
        .split(',')
        .map((c) => c.trim().replace(/^`|`$/g, ''));
      valuesAt = marker.length + close + 1;
    } else {
      valuesAt = marker.length;
    }
    const valuesMatch = /^\s*VALUES\s*/i.exec(text.slice(valuesAt));
    if (valuesMatch) {
      const valuesStart = valuesAt + valuesMatch[0].length;
      out.push({ text, columns, valuesText: text.slice(valuesStart, text.length - 1).trim() });
    }
    from = end;
  }
  return out;
}

/**
 * Colonnes de la table dans l'ordre de son `CREATE TABLE` (celui de l'export), ou `null`.
 * @returns {string[] | null}
 */
function parseCreateTableColumns(sql, table) {
  const start = sql.indexOf('CREATE TABLE `' + table + '` (');
  if (start < 0) return null;
  const end = statementEnd(sql, start);
  const body = sql
    .slice(start, end < 0 ? undefined : end)
    .split('\n')
    .slice(1);
  const columns = [];
  for (const line of body) {
    const match = /^\s*`([^`]+)`\s/.exec(line);
    if (match) columns.push(match[1]);
    else if (/^\s*\)/.test(line)) break;
  }
  return columns.length ? columns : null;
}

/**
 * Découpe la partie `VALUES` en lignes, chaque ligne en littéraux SQL bruts
 * (`'texte'`, `NULL`, `12`, `1.5`), sans les décoder.
 * @returns {string[][]}
 */
function splitValueTuples(valuesText) {
  const rows = [];
  let row = null;
  let token = '';
  let inString = false;
  let escape = false;
  let hasToken = false;
  const pushToken = () => {
    row.push(token.trim());
    token = '';
    hasToken = false;
  };
  for (let i = 0; i < valuesText.length; i++) {
    const c = valuesText[i];
    if (row === null) {
      if (c === '(') row = [];
      continue;
    }
    if (inString) {
      token += c;
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === "'") {
        if (valuesText[i + 1] === "'") {
          token += "'";
          i++;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (c === "'") {
      inString = true;
      hasToken = true;
      token += c;
    } else if (c === ',') {
      pushToken();
    } else if (c === ')') {
      if (hasToken || token.trim() !== '' || row.length) pushToken();
      rows.push(row);
      row = null;
    } else {
      token += c;
      if (!/\s/.test(c)) hasToken = true;
    }
  }
  return rows;
}

/** `INSERT INTO \`table\` (\`a\`,\`b\`) VALUES\n(…),\n(…);` — une ligne par enregistrement. */
function buildInsert(table, columns, rows) {
  const head = columns
    ? 'INSERT INTO `' + table + '` (' + columns.map((c) => '`' + c + '`').join(',') + ') VALUES'
    : 'INSERT INTO `' + table + '` VALUES';
  return head + '\n' + rows.map((r) => '(' + r.join(',') + ')').join(',\n') + ';';
}

module.exports = {
  statementEnd,
  findInsertStatements,
  parseCreateTableColumns,
  splitValueTuples,
  buildInsert,
};
