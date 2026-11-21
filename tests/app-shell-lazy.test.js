'use strict';
// Le shell connecté reste chargé à la demande (audit UI/UX du 19/11/2026, U1 — lot à part
// « découpage d'App.jsx »). Un import statique d'une de ces briques dans `src/App.jsx`
// ramènerait tout le shell prof / élève (et ses dépendances) dans l'écran de connexion :
// le budget de bundle (`scripts/check-bundle-budget.js`) le verrait, mais seulement sur un
// build de production en CI. Ce test le dit tout de suite, avec le nom du fichier fautif.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'App.jsx');
const PARTS = path.join(ROOT, 'src', 'components', 'app', 'authenticatedShellParts.js');

/** Modules du shell connecté : jamais importés statiquement par `App.jsx`. */
const LAZY_MODULES = [
  'AppProviders',
  'AppPedagoOverlays',
  'AppNoticeBanners',
  'AppGlobalModals',
  'AppHeader',
  'RolePreviewBanners',
  'TeacherMainContent',
  'StudentMainContent',
];

/** Spécificateurs des `import … from '…'` statiques d'un fichier. */
function staticImportSources(source) {
  const sources = [];
  const re = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(source))) sources.push(m[1]);
  return sources;
}

test('App.jsx n’importe statiquement aucune brique du shell connecté', () => {
  const sources = staticImportSources(fs.readFileSync(APP, 'utf8'));
  const offenders = sources.filter(
    (s) =>
      /authenticatedShellParts/.test(s) ||
      /components\/lti\/LtiArrivee/.test(s) ||
      LAZY_MODULES.some((name) => s.endsWith(`/${name}.jsx`) || s.endsWith(`/${name}`)),
  );
  assert.deepStrictEqual(
    offenders,
    [],
    `Import statique à remplacer par lazyScreen(fromShell(…)) : ${offenders.join(', ')}`,
  );
});

test('authenticatedShellParts.js réexporte chaque brique chargée à la demande', () => {
  const parts = fs.readFileSync(PARTS, 'utf8');
  for (const name of LAZY_MODULES) {
    assert.match(parts, new RegExp(`export \\{ ${name} \\} from '\\./${name}\\.jsx';`), name);
  }
  const app = fs.readFileSync(APP, 'utf8');
  for (const name of LAZY_MODULES) {
    assert.match(
      app,
      new RegExp(`const ${name} = lazyScreen\\(fromShell\\('${name}'\\)\\);`),
      name,
    );
  }
});

test('staticImportSources lit les formes d’import usuelles', () => {
  const src = [
    "import { a } from './a.jsx';",
    "import B from '../b';",
    "import './c.css';",
    "const D = lazy(() => import('./d.jsx'));",
  ].join('\n');
  assert.deepStrictEqual(staticImportSources(src), ['./a.jsx', '../b', './c.css']);
});
