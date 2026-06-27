'use strict';

// Vérifie que la variante « fiche éditeur » des upsert de questions (FM quiz, GL QCM, GL QCM lore)
// rend les champs feedback effaçables (`feedback_x = VALUES(...)`), tandis que l'upsert d'import
// conserve la sémantique « préserver l'existant sur valeur vide » (`COALESCE(NULLIF(...))`).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toFormFeedbackUpsertSql } = require('../lib/shared/feedbackUpsertSql');

const IMPORTS = [
  ['FM quiz', require('../lib/fmQuizImport')],
  ['GL QCM', require('../lib/glQcmImport')],
  ['GL QCM lore', require('../lib/glQcmLoreImport')],
];

const FEEDBACK_KEYS = ['correct', 'a', 'b', 'c', 'd', 'e'];

test('toFormFeedbackUpsertSql remplace les 6 clauses COALESCE feedback par VALUES()', () => {
  const sample = FEEDBACK_KEYS.map(
    (k) => `    feedback_${k} = COALESCE(NULLIF(VALUES(feedback_${k}), ''), feedback_${k}),`,
  ).join('\n');
  const form = toFormFeedbackUpsertSql(sample);
  for (const k of FEEDBACK_KEYS) {
    assert.ok(
      form.includes(`feedback_${k} = VALUES(feedback_${k})`),
      `feedback_${k} doit utiliser VALUES()`,
    );
  }
  assert.ok(
    !/COALESCE\(NULLIF\(VALUES\(feedback_/.test(form),
    'plus aucune clause COALESCE feedback',
  );
});

for (const [label, mod] of IMPORTS) {
  test(`${label} — import préserve le feedback vide, variante éditeur l'efface`, () => {
    assert.ok(mod.QUESTION_UPSERT_SQL, `${label}: QUESTION_UPSERT_SQL exporté`);
    assert.ok(mod.QUESTION_UPSERT_SQL_FORM, `${label}: QUESTION_UPSERT_SQL_FORM exporté`);

    // Import : conserve l'existant quand la valeur entrante est vide.
    for (const k of FEEDBACK_KEYS) {
      assert.ok(
        mod.QUESTION_UPSERT_SQL.includes(
          `feedback_${k} = COALESCE(NULLIF(VALUES(feedback_${k}), ''), feedback_${k})`,
        ),
        `${label} import: feedback_${k} en COALESCE/NULLIF`,
      );
    }

    // Éditeur : un feedback vidé est persisté (VALUES → NULL).
    for (const k of FEEDBACK_KEYS) {
      assert.ok(
        mod.QUESTION_UPSERT_SQL_FORM.includes(`feedback_${k} = VALUES(feedback_${k})`),
        `${label} éditeur: feedback_${k} en VALUES()`,
      );
    }
    assert.ok(
      !/COALESCE\(NULLIF\(VALUES\(feedback_/.test(mod.QUESTION_UPSERT_SQL_FORM),
      `${label} éditeur: aucune clause COALESCE feedback résiduelle`,
    );

    // Les colonnes non-feedback restent identiques entre les deux variantes (seuls les feedback changent).
    assert.ok(
      mod.QUESTION_UPSERT_SQL_FORM.includes('reponse_correcte = VALUES(reponse_correcte)'),
      `${label}: colonnes non-feedback inchangées`,
    );
  });
}
