'use strict';

// Garde-fou de l'audit « homogénéité des formulaires et des onglets » (septembre 2026).
//
// Ce que ce fichier empêche de revenir :
//   1. les classes FANTÔMES — `form-select` et `form-input` étaient posées sur 84 champs
//      sans exister dans la moindre feuille du dépôt, qui sortaient donc avec le widget
//      natif du système (rendu différent selon l'écran ET selon l'appareil) ;
//   2. les variantes de bouton sans leur classe de base — `btn-primary` seule donne un
//      aplat de couleur sur un bouton natif : ni padding, ni rayon, ni hauteur de 44 px ;
//   3. la réapparition d'une deuxième barre de sous-onglets dans ForetMap — `.gl-subtabs`
//      vient de Gnomes & Licornes, ForetMap a `.fm-subtabs` ;
//   4. la réécriture de l'apparence d'un champ écran par écran — bordure, rayon et fond
//      viennent de la couche de base, la densité se règle par les tokens `--fm-control-*`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

/** Classes qui forment le contrat visuel : champs, onglets, surfaces. */
const CONTRACT_CLASSES = [
  'fm-field',
  'fm-input',
  'fm-select',
  'fm-textarea',
  'fm-label',
  'form-input',
  'form-select',
  'fm-subtabs',
  'fm-subtab',
  'fm-panel',
  'fm-table',
  'fm-table-wrap',
  'card',
  'hint',
  'muted',
  'form-error',
  'text-danger',
];

/**
 * Les feuilles du contrat, et les entrées qui doivent les charger. Le « pattern commun
 * partout » ne tient que si CHAQUE produit consomme les mêmes feuilles : sans ce contrôle,
 * un nouveau produit (le plan des personnels est arrivé ainsi) repart d'une page blanche et
 * réinvente ses champs et ses surfaces.
 */
const CONTRACT_SHEETS = ['form-controls.css', 'surfaces.css'];
const PRODUCT_ENTRIES = [
  'index.css', // ForetMap (+ l'outil de packs mascotte, qui l'importe)
  path.join('gl', 'main.jsx'),
  path.join('plan', 'main.jsx'),
  path.join('staff', 'main.jsx'),
];

/** Tokens que la couche de base et ses variantes consomment. */
const CONTROL_TOKENS = [
  '--fm-panel-bg',
  '--fm-panel-border',
  '--fm-panel-radius',
  '--fm-table-rule',
  '--fm-table-pad-y',
  '--fm-control-bg',
  '--fm-control-border',
  '--fm-control-border-focus',
  '--fm-control-radius',
  '--fm-control-min-h',
  '--fm-control-pad-y',
  '--fm-control-pad-x',
  '--fm-control-chevron',
  '--fm-control-chevron-gutter',
];

/**
 * `src/gl/**` et `src/plan/**` sont d'autres produits : ils ont leurs propres familles
 * (`.gl-input`, `.gl-subtabs`…) et ne chargent pas `src/index.css`.
 */
const isForetMap = (file) =>
  !file.includes(`${path.sep}gl${path.sep}`) && !file.includes(`${path.sep}plan${path.sep}`);

function walk(dir, ext, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, ext, acc);
    } else if (entry.name.endsWith(ext)) acc.push(full);
  }
  return acc;
}

function readAllCss() {
  return walk(SRC, '.css')
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

/** Les valeurs de `className` du fichier, découpées en classes individuelles. */
function classTokens(source) {
  const out = [];
  for (const match of source.matchAll(/className=\{?[`"']([^`"']+)/g)) {
    for (const token of match[1].split(/[\s{}$?:'"+]+/)) {
      if (token) out.push(token);
    }
  }
  return out;
}

test('aucune classe du contrat champs/onglets n’est fantôme', () => {
  const css = readAllCss();
  const missing = CONTRACT_CLASSES.filter((name) => !new RegExp(`\\.${name}(?![\\w-])`).test(css));
  assert.deepStrictEqual(
    missing,
    [],
    `Ces classes sont posées dans le balisage mais aucune feuille ne les définit :\n  ${missing.join('\n  ')}\n` +
      'Un champ qui porte une classe sans règle sort avec le widget natif du système.',
  );
});

test('les tokens de contrôle sont définis', () => {
  const css = readAllCss();
  const missing = CONTROL_TOKENS.filter((token) => !css.includes(`${token}:`));
  assert.deepStrictEqual(missing, [], `Tokens --fm-control-* manquants : ${missing.join(', ')}`);
});

test('aucune variante .btn-* sans la classe de base .btn', () => {
  const offenders = [];
  for (const file of walk(SRC, '.jsx').filter(isForetMap)) {
    const source = fs.readFileSync(file, 'utf8');
    source.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(/className=\{?[`"']([^`"']*)/g)) {
        const tokens = match[1].split(/[\s{}$?:'"+]+/).filter(Boolean);
        const hasVariant = tokens.some((t) => /^btn-(primary|secondary|ghost|danger)$/.test(t));
        if (hasVariant && !tokens.includes('btn')) {
          offenders.push(`${path.relative(SRC, file)}:${index + 1} → « ${match[1].trim()} »`);
        }
      }
    });
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Variante de bouton sans sa classe de base :\n  ${offenders.join('\n  ')}\n` +
      '`.btn` porte la boîte (padding, rayon, hauteur 44 px) ; la variante ne porte que la couleur.',
  );
});

test('ForetMap n’utilise pas la barre de sous-onglets de Gnomes & Licornes', () => {
  // `shared/components/TourOverridesEditor.jsx` est rendu par les DEUX produits : sa barre
  // reste en `.gl-subtabs` tant que G&L ne charge pas `shared/styles/subtabs.css`. C'est la
  // seule exception, et elle est volontaire.
  const SHARED_WITH_GL = new Set([path.join('shared', 'components', 'TourOverridesEditor.jsx')]);
  const offenders = [];
  for (const file of walk(SRC, '.jsx').filter(isForetMap)) {
    const relative = path.relative(SRC, file);
    if (SHARED_WITH_GL.has(relative)) continue;
    if (classTokens(fs.readFileSync(file, 'utf8')).includes('gl-subtabs')) {
      offenders.push(relative);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Écrans ForetMap encore sur .gl-subtabs : ${offenders.join(', ')} — utiliser .fm-subtabs.`,
  );
});

test('la barre de navigation principale reste réservée au chrome professeur', () => {
  // `.top-tabs` a été reprise par des sous-onglets (Profils, Audit) : deux niveaux de
  // navigation empilés avec la même forme. Un seul composant doit encore la porter.
  const ALLOWED = new Set([path.join('components', 'app', 'TeacherTopTabs.jsx')]);
  const offenders = [];
  for (const file of walk(SRC, '.jsx').filter(isForetMap)) {
    const relative = path.relative(SRC, file);
    if (ALLOWED.has(relative)) continue;
    if (classTokens(fs.readFileSync(file, 'utf8')).includes('top-tabs')) {
      offenders.push(relative);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Sous-onglets sur la barre principale : ${offenders.join(', ')} — utiliser .fm-subtabs.`,
  );
});

test('aucun écran ne réécrit la bordure d’un champ pour son seul compte', () => {
  // Bordure, rayon et fond viennent de la couche de base ; la densité passe par les tokens
  // `--fm-control-*` posés sur le CONTENEUR. Six contextes réécrivaient l'apparence, d'où
  // six apparences pour le même `<select>`.
  const ALLOWED_SELECTOR =
    /^(input, select, textarea|input:focus, select:focus, textarea:focus|input:hover)/;
  /**
   * `input[type='color']` fait partie des contrôles que la couche de base remet à plat
   * (une boîte de saisie n'a pas de sens pour un nuancier). Il lui faut donc sa bordure en
   * propre, et un sélecteur préfixé par `input` pour peser aussi lourd que la remise à plat.
   * Il consomme les tokens de la famille, donc il ne rouvre pas la dispersion.
   */
  const ALLOWED_EXACT = new Set(['input.color-palette-field__picker']);
  const offenders = [];
  for (const file of walk(SRC, '.css').filter(isForetMap)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!/(^|[\s>+~,])(input|select|textarea)\b/.test(selector)) continue;
      // Cases, radios, curseurs, couleurs et fichiers ont leur rendu propre.
      if (/\[type=['"]?(checkbox|radio|range|color|file)/.test(selector)) continue;
      if (ALLOWED_SELECTOR.test(selector.split('\n')[0].trim())) continue;
      if (ALLOWED_EXACT.has(selector.replace(/\s+/g, ' '))) continue;
      if (!/(^|;|\s)border(-color|-radius)?\s*:/.test(match[2])) continue;
      const line = content.slice(0, match.index).split('\n').length;
      offenders.push(`${path.relative(SRC, file)}:${line} → ${selector.replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Apparence de champ réécrite hors de la couche de base :\n  ${offenders.join('\n  ')}\n` +
      'Régler la densité par --fm-control-pad-y/-pad-x/-radius/-min-h sur le conteneur.',
  );
});

test('le chevron de la liste déroulante n’est effacé par aucune règle', () => {
  // `background` en raccourci remet `background-image` à `none`, et `padding` en raccourci
  // écrase la gouttière : dans les deux cas la flèche disparaît ou chevauche le libellé.
  const offenders = [];
  for (const file of walk(SRC, '.css').filter(isForetMap)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
      // Une classe dont le nom contient « select » sans porter sur un <select> (une case à
      // cocher de sélection, par exemple) n'est pas concernée.
      if (!/(^|[\s>+~,.])select\b/.test(selector)) continue;
      if (/^(input, select, textarea)$/.test(selector.split('\n')[0].trim())) continue;
      if (/^\.fm-input, \.fm-select/.test(selector.replace(/\s*\n\s*/g, ' '))) continue;
      const body = match[2];
      const bad = [];
      if (/(^|;|\s)padding\s*:/.test(body)) bad.push('padding');
      if (/(^|;|\s)background\s*:/.test(body)) bad.push('background');
      if (!bad.length) continue;
      // Un sélecteur qui ne vise pas un <select> natif (`.media-library-menu__gallery-select`
      // est une case à cocher) est écarté par l'absence de `select` comme mot isolé.
      if (!/(^|[\s>+~,])select\b/.test(selector)) continue;
      const line = content.slice(0, match.index).split('\n').length;
      offenders.push(
        `${path.relative(SRC, file)}:${line} [${bad.join(', ')}] → ${selector.replace(/\s+/g, ' ')}`,
      );
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Règles qui effacent le chevron :\n  ${offenders.join('\n  ')}\n` +
      'Utiliser background-color, et --fm-control-pad-y/-pad-x/-chevron-gutter au lieu de padding.',
  );
});

test('chaque produit charge les feuilles du contrat', () => {
  // C'est ce test qui fait tenir « le même pattern partout » : il échoue dès qu'une entrée
  // nouvelle ou modifiée cesse de consommer le contrat commun.
  const offenders = [];
  for (const entry of PRODUCT_ENTRIES) {
    const full = path.join(SRC, entry);
    if (!fs.existsSync(full)) {
      offenders.push(`${entry} → entrée introuvable (renommée ?)`);
      continue;
    }
    const source = fs.readFileSync(full, 'utf8');
    for (const sheet of CONTRACT_SHEETS) {
      if (!source.includes(sheet)) offenders.push(`${entry} ne charge pas ${sheet}`);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Produits hors contrat :\n  ${offenders.join('\n  ')}\n` +
      'Un produit qui ne charge pas ces feuilles rend ses champs et ses surfaces au naturel.',
  );
});

test('aucun écran ne réécrit l’apparence d’un tableau pour son seul compte', () => {
  // Cinq habillages coexistaient, dont deux inexistants (`.data-table`,
  // `.visit-mascot-pack-detail-table` ne renvoyaient à aucune règle). `.fm-table` porte
  // désormais filets, en-têtes et densité ; un écran ne garde que ce qui lui est propre.
  const ALLOWED = /(^|[\s,>])\.fm-table\b/;
  const offenders = [];
  for (const file of walk(SRC, '.css').filter(isForetMap)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!/(^|[\s>+~,])(table|th|td)\b/.test(selector)) continue;
      if (ALLOWED.test(selector)) continue;
      // `border-collapse` et les filets de cellule sont l'apparence ; la largeur d'une
      // colonne ou un `vertical-align` restent légitimement propres à l'écran.
      if (!/(^|;|\s)(border-collapse|border-bottom|border-top)\s*:/.test(match[2])) continue;
      const line = content.slice(0, match.index).split('\n').length;
      offenders.push(`${path.relative(SRC, file)}:${line} → ${selector.replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Apparence de tableau réécrite hors de .fm-table :\n  ${offenders.join('\n  ')}\n` +
      'Régler la densité par --fm-table-pad-y/-pad-x/-rule sur le conteneur.',
  );
});

test('le libellé de champ n’a qu’un dialecte', () => {
  // Il y en avait sept. Le signe le plus visible était les capitales interlettrées : on
  // interdit `text-transform: uppercase` sur un LIBELLÉ DE CHAMP (les autres rôles —
  // sur-titres, pastilles d'état, étiquettes de carte — le gardent légitimement).
  const FIELD_LABEL =
    /(\.field\s+label|\.fm-label|\.fm-field__label|__filter-label|filter-field|-filter\s*>\s*label)/;
  const offenders = [];
  for (const file of walk(SRC, '.css').filter(isForetMap)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!FIELD_LABEL.test(selector)) continue;
      if (!/text-transform\s*:\s*uppercase/.test(match[2])) continue;
      const line = content.slice(0, match.index).split('\n').length;
      offenders.push(`${path.relative(SRC, file)}:${line} → ${selector.replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Libellé de champ en capitales :\n  ${offenders.join('\n  ')}\n` +
      'Un seul dialecte : minuscules, demi-gras, vert feuille (.fm-label).',
  );
});
