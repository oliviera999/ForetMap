---
description: Lance d'un coup les vérifications de Gnomes & Licornes « Tenir à deux » (lint, format, tests UI, backend, contenu, build, e2e G&L, banc, import strict des catalogues) et résume ce qui passe et ce qui casse.
---

Lance les vérifications ci-dessous **dans l'ordre**, depuis la racine du dépôt. Ne t'arrête pas
à la première qui échoue : note l'échec et continue. Le banc ne tourne **jamais** sur une base
de production (`tools/gl-sim/garde.js` : la base doit finir par `_sim` ou `_test`).

```bash
npm run lint && npm run format:check
npm run test:ui
npm test
npm run test:content
npm run build && npm run check:runtime
npx playwright test e2e/gl-*.spec.js --trace off
npm run gl:sim:db
npm run gl:sim -- --scenario hybride-reference --runs 5 --seed 14
npm run gl:sim -- --scenario tablette-parallele-absences --runs 5 --seed 14
DB_NAME=foretmap_sim npm run gl:import:tenir -- --fichier tous --strict --dry-run
TEST_DB_NAME=foretmap_sim FORETMAP_ALLOW_NON_TEST_DB=1 node --test --test-concurrency=1 --test-force-exit tests/content/gl-*.test.js
```

Précisions :

- `npm test` est long : lance-le en arrière-plan et poursuis avec la suite pendant qu'il tourne.
- Les deux dernières lignes vérifient les catalogues et le contenu sur le **corpus réel** chargé
  par `npm run gl:sim:db` ; sur la base de test nue, l'import strict échoue faute de corpus.
- Le scénario `tablette-parallele-absences` n'existe qu'à partir de la PR « Tablette, console,
  défi de case » : s'il est absent de `npm run gl:sim -- --liste`, dis-le et passe.
- Si Playwright ne trouve pas son navigateur, dis-le (commande et message) sans réinstaller.
- `npm run build` peut régénérer des miroirs (`lib/shared/`, `lib/gl-pack/`) : signale tout
  fichier modifié par le build (`git status --short`).

Rends un tableau : vérification, résultat (passe / échoue / non lancée), durée, et pour chaque
échec le nom du test et les premières lignes de l'erreur. Termine par les fichiers que le build
a modifiés. N'écris « tout est vert » que si chaque ligne est passée.
