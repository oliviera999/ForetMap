'use strict';

/**
 * Rapport d'un scénario : `reports/gl-sim/<AAAA-MM-JJ>-<scenario>/summary.json` + `index.html`
 * **autonome** (CSS inline, graphiques SVG faits main : barres et boîtes à moustaches, aucune
 * bibliothèque), lisible hors ligne. Agrège les exécutions (médiane, p10, p90) par plateau — et
 * par variante de grille pour `equilibrage`, avec l'écart aux références du modèle rapide.
 */

const fs = require('node:fs');
const path = require('node:path');
const { resume, mediane, pourcent, arrondi } = require('./stats');
const { evaluerAttendus, bilanAttendus } = require('./attendus');

const INDICATEURS = Object.freeze([
  { cle: 'seances', libelle: 'Séances jusqu’au Seuil', unite: '', source: (m) => m.seances },
  {
    cle: 'equipesSousVoile',
    libelle: 'Équipes passées sous le voile',
    unite: '%',
    source: (m) => m.equipesSousVoilePct,
  },
  {
    cle: 'pagesPalies',
    libelle: 'Pages pâlies au Seuil',
    unite: '%',
    source: (m) => m.pagesPaliesPct,
  },
  {
    cle: 'pagesTenues',
    libelle: 'Pages tenues au Seuil',
    unite: '%',
    source: (m) => m.pagesTenuesPct,
  },
  {
    cle: 'partGnomes',
    libelle: 'Part des Gnomes (trouvées + réparées)',
    unite: '%',
    source: (m) => m.partGnomesPct,
  },
  { cle: 'elevesZero', libelle: 'Élèves à 0 / 0', unite: '%', source: (m) => m.elevesZeroPct },
  { cle: 'matthieu', libelle: 'Indice Matthieu', unite: '', source: (m) => m.matthieu },
  { cle: 'gini', libelle: 'Gini des bourses', unite: '', source: (m) => m.gini },
  { cle: 'appels', libelle: 'Appels HTTP', unite: '', source: (m) => m.compteurs?.appels ?? null },
]);

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function fmt(v, d = 1) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return String(arrondi(v, d)).replace('.', ',');
}

/** Agrégats par plateau d'une liste d'exécutions (toutes variantes confondues). */
function agregerParPlateau(runs) {
  const parPlateau = new Map();
  for (const run of runs) {
    for (const ch of run.chapitres || []) {
      if (!parPlateau.has(ch.plateau)) parPlateau.set(ch.plateau, []);
      parPlateau.get(ch.plateau).push(ch.mesures);
    }
  }
  const out = {};
  for (const [plateau, mesures] of parPlateau) {
    const agg = { n: mesures.length, indicateurs: {} };
    for (const ind of INDICATEURS) agg.indicateurs[ind.cle] = resume(mesures.map(ind.source));
    agg.partEntre4et6 = pourcent(mesures.filter((m) => m.entre4et6).length, mesures.length);
    agg.finParCamp = pourcent(mesures.filter((m) => m.finParCamp).length, mesures.length);
    agg.carnetComplet = pourcent(mesures.filter((m) => m.carnetComplet).length, mesures.length);
    agg.chapardeur = pourcent(mesures.filter((m) => m.chapardeur).length, mesures.length);
    agg.badges = mesures.find((m) => m.badges)?.badges || null;
    agg.badgesPalier = mediane(
      mesures.map((m) => (m.badges?.disponibles ? m.badges.elevesAvecPalierPct : null)),
    );
    agg.spearmanBadges = mediane(
      mesures.map((m) => (m.badges?.disponibles ? m.badges.spearmanJustessePaliers : null)),
    );
    agg.depenses = {};
    for (const m of mesures) {
      for (const [cause, v] of Object.entries(m.ledgerParCause || {})) {
        if (!agg.depenses[cause]) agg.depenses[cause] = { gains: 0, depenses: 0 };
        agg.depenses[cause].gains += v.gains;
        agg.depenses[cause].depenses += v.depenses;
      }
    }
    for (const v of Object.values(agg.depenses)) {
      v.gains = arrondi(v.gains / mesures.length, 1);
      v.depenses = arrondi(v.depenses / mesures.length, 1);
    }
    out[plateau] = agg;
  }
  return out;
}

/** Indicateurs médians d'un plateau au format des attendus. */
function indicateursPourAttendus(agg, annee) {
  return {
    partEntre4et6: agg.partEntre4et6,
    equipesSousVoile: agg.indicateurs.equipesSousVoile.mediane,
    pagesPalies: agg.indicateurs.pagesPalies.mediane,
    pagesTenues: agg.indicateurs.pagesTenues.mediane,
    carnetComplet: agg.carnetComplet,
    partGnomes: agg.indicateurs.partGnomes.mediane,
    elevesZero: agg.indicateurs.elevesZero.mediane,
    doublePlafond: annee ? annee.doublePlafond : null,
    matthieu: agg.indicateurs.matthieu.mediane,
    gini: agg.indicateurs.gini.mediane,
    badgesPalier: agg.badgesPalier,
    spearmanBadges: agg.spearmanBadges,
  };
}

function agregerAnnee(runs) {
  const annees = runs.map((r) => r.annee).filter(Boolean);
  if (!annees.length) return null;
  return {
    doublePlafond: mediane(annees.map((a) => a.doublePlafondPct)),
    elevesZero: mediane(annees.map((a) => a.elevesZeroPct)),
    gini: mediane(annees.map((a) => a.gini)),
  };
}

/** Groupes d'exécutions : par (variante, sous-scénario) pour la grille, un seul sinon. */
function grouper(runs) {
  const groupes = new Map();
  for (const r of runs) {
    const cle = `${r.variante || ''}|${r.sousScenario || ''}`;
    if (!groupes.has(cle))
      groupes.set(cle, {
        variante: r.variante,
        sousScenario: r.sousScenario,
        classe: r.classe,
        runs: [],
      });
    groupes.get(cle).runs.push(r);
  }
  return [...groupes.values()];
}

function comparerAuModele(groupe, agregats, reference) {
  if (!reference || !groupe.variante || !reference.variantes?.[groupe.variante]) return null;
  if (groupe.classe !== reference.classe) return null;
  const ref = reference.variantes[groupe.variante];
  const ecartMax = Number(reference.ecartMaxPoints) || 10;
  const cles = {
    equipesSousVoile: 'equipesSousVoile',
    pagesPalies: 'pagesPalies',
    pagesTenues: 'pagesTenues',
    partGnomes: 'partGnomes',
    seances: 'seances',
  };
  const lignes = [];
  for (const [plateau, agg] of Object.entries(agregats)) {
    for (const [cle, refCle] of Object.entries(cles)) {
      const banc = agg.indicateurs[cle]?.mediane;
      const modele = ref[refCle]?.[String(plateau)];
      if (banc == null || modele == null) continue;
      const ecart = banc - modele;
      lignes.push({
        plateau: Number(plateau),
        indicateur: cle,
        banc: arrondi(banc, 1),
        modele,
        ecart: arrondi(ecart, 1),
        signale: Math.abs(ecart) > ecartMax,
      });
    }
    const carnet = agg.carnetComplet;
    const refCarnet = ref.carnetComplet?.[String(plateau)];
    if (carnet != null && refCarnet != null) {
      lignes.push({
        plateau: Number(plateau),
        indicateur: 'carnetComplet',
        banc: arrondi(carnet, 1),
        modele: refCarnet,
        ecart: arrondi(carnet - refCarnet, 1),
        signale: Math.abs(carnet - refCarnet) > ecartMax,
      });
    }
  }
  return { ecartMax, lignes };
}

// ---------------------------------------------------------------------
// SVG faits main
// ---------------------------------------------------------------------

function svgBarres(series, { largeur = 520, hauteur = 180, max = null, unite = '' } = {}) {
  // series : [{ libelle, valeur, couleur? }]
  const vals = series.map((s) => (s.valeur == null ? 0 : Number(s.valeur)));
  const top = max != null ? max : Math.max(1, ...vals) * 1.1;
  const m = { g: 36, d: 10, h: 10, b: 40 };
  const w = largeur - m.g - m.d;
  const h = hauteur - m.h - m.b;
  const bw = w / Math.max(1, series.length);
  let out = `<svg viewBox="0 0 ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" role="img" aria-label="barres">`;
  for (let i = 0; i <= 4; i += 1) {
    const y = m.h + h - (h * i) / 4;
    out += `<line x1="${m.g}" y1="${y}" x2="${largeur - m.d}" y2="${y}" stroke="#e5e7eb"/><text x="${m.g - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="#6b7280">${fmt((top * i) / 4, 0)}</text>`;
  }
  series.forEach((s, i) => {
    const v = s.valeur == null ? 0 : Number(s.valeur);
    const bh = Math.max(0, (h * v) / top);
    const x = m.g + i * bw + bw * 0.15;
    out += `<rect x="${x}" y="${m.h + h - bh}" width="${bw * 0.7}" height="${bh}" fill="${s.couleur || '#2f6b3a'}" rx="3"><title>${esc(s.libelle)} : ${fmt(v)}${unite}</title></rect>`;
    out += `<text x="${x + bw * 0.35}" y="${m.h + h - bh - 4}" text-anchor="middle" font-size="10" fill="#111827">${s.valeur == null ? '—' : fmt(v)}</text>`;
    out += `<text x="${x + bw * 0.35}" y="${hauteur - 22}" text-anchor="middle" font-size="10" fill="#374151">${esc(s.libelle)}</text>`;
  });
  return `${out}</svg>`;
}

function svgBoites(boites, { largeur = 520, hauteur = 170, max = null, unite = '' } = {}) {
  // boites : [{ libelle, resume: { min, p10, mediane, p90, max } }]
  const tous = boites.flatMap((b) => [b.resume?.min, b.resume?.max]).filter((v) => v != null);
  const top = max != null ? max : Math.max(1, ...tous) * 1.1;
  const m = { g: 36, d: 10, h: 10, b: 40 };
  const w = largeur - m.g - m.d;
  const h = hauteur - m.h - m.b;
  const bw = w / Math.max(1, boites.length);
  const y = (v) => m.h + h - (h * Math.max(0, Number(v))) / top;
  let out = `<svg viewBox="0 0 ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" role="img" aria-label="boîtes à moustaches">`;
  for (let i = 0; i <= 4; i += 1) {
    const yy = m.h + h - (h * i) / 4;
    out += `<line x1="${m.g}" y1="${yy}" x2="${largeur - m.d}" y2="${yy}" stroke="#e5e7eb"/><text x="${m.g - 4}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#6b7280">${fmt((top * i) / 4, 0)}</text>`;
  }
  boites.forEach((b, i) => {
    const r = b.resume || {};
    const cx = m.g + i * bw + bw / 2;
    const bx = bw * 0.3;
    if (r.mediane != null) {
      out += `<line x1="${cx}" y1="${y(r.min)}" x2="${cx}" y2="${y(r.max)}" stroke="#6b7280"/>`;
      out += `<rect x="${cx - bx / 2}" y="${y(r.p90)}" width="${bx}" height="${Math.max(1, y(r.p10) - y(r.p90))}" fill="#bfdbfe" stroke="#1d4ed8" rx="2"><title>${esc(b.libelle)} : p10 ${fmt(r.p10)} · médiane ${fmt(r.mediane)} · p90 ${fmt(r.p90)}${unite}</title></rect>`;
      out += `<line x1="${cx - bx / 2}" y1="${y(r.mediane)}" x2="${cx + bx / 2}" y2="${y(r.mediane)}" stroke="#1e3a8a" stroke-width="2"/>`;
      out += `<text x="${cx}" y="${y(r.p90) - 4}" text-anchor="middle" font-size="10" fill="#111827">${fmt(r.mediane)}</text>`;
    } else {
      out += `<text x="${cx}" y="${m.h + h / 2}" text-anchor="middle" font-size="10" fill="#9ca3af">—</text>`;
    }
    out += `<text x="${cx}" y="${hauteur - 22}" text-anchor="middle" font-size="10" fill="#374151">${esc(b.libelle)}</text>`;
  });
  return `${out}</svg>`;
}

// ---------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------

const CSS = `
:root{--vert:#2f6b3a;--ok:#15803d;--ko:#b91c1c;--na:#6b7280;--fond:#f8faf7;--carte:#fff;--bord:#e5e7eb}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif;color:#111827;background:var(--fond)}
header{background:var(--vert);color:#fff;padding:18px 24px}header h1{margin:0 0 4px;font-size:20px}header p{margin:0;opacity:.9}
main{max-width:1180px;margin:0 auto;padding:16px 24px 48px}section{background:var(--carte);border:1px solid var(--bord);border-radius:10px;padding:14px 18px;margin:14px 0}
h2{font-size:16px;margin:0 0 10px}h3{font-size:14px;margin:12px 0 6px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--bord);padding:5px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}.ok{color:var(--ok);font-weight:600}.ko{color:var(--ko);font-weight:600}.na{color:var(--na)}
.grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px}.carte{border:1px solid var(--bord);border-radius:8px;padding:8px 10px}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;background:#e5e7eb}.badge.ok{background:#dcfce7}.badge.ko{background:#fee2e2}
pre{background:#f3f4f6;padding:8px;border-radius:6px;overflow:auto;font-size:12px}small{color:#6b7280}
`;

function tableauAttendus(lignes) {
  return `<table><thead><tr><th>Indicateur</th><th class="num">Valeur (médiane)</th><th class="num">Attendu</th><th>Verdict</th></tr></thead><tbody>${lignes
    .map(
      (l) =>
        `<tr><td>${esc(l.libelle)}</td><td class="num">${fmt(l.valeur, 2)}</td><td class="num">${esc(l.attendu)}</td><td>${l.ok === null ? '<span class="na">non évalué</span>' : l.ok ? '<span class="ok">respecté</span>' : '<span class="ko">avertissement</span>'}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function sectionGroupe(groupe, agregats, annee, attendusParPlateau, modele) {
  const plateaux = Object.keys(agregats)
    .map(Number)
    .sort((a, b) => a - b);
  const titre =
    [
      groupe.variante ? `Variante ${groupe.variante}` : null,
      groupe.sousScenario ? `classe ${groupe.sousScenario}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Agrégats';
  let html = `<section><h2>${esc(titre)} <small>${groupe.runs.length} exécution(s), ${groupe.runs.filter((r) => r.ok).length} sans échec</small></h2>`;
  html += `<table><thead><tr><th>Indicateur</th>${plateaux.map((p) => `<th class="num">P${p} médiane</th><th class="num">p10</th><th class="num">p90</th>`).join('')}</tr></thead><tbody>`;
  for (const ind of INDICATEURS) {
    html += `<tr><td>${esc(ind.libelle)}${ind.unite ? ` (${ind.unite})` : ''}</td>${plateaux
      .map((p) => {
        const r = agregats[p].indicateurs[ind.cle];
        return `<td class="num">${fmt(r.mediane, 2)}</td><td class="num">${fmt(r.p10, 1)}</td><td class="num">${fmt(r.p90, 1)}</td>`;
      })
      .join('')}</tr>`;
  }
  for (const [cle, lib] of [
    ['partEntre4et6', 'Chapitre entre 4 et 6 séances (% exécutions)'],
    ['finParCamp', 'Quatre équipes au camp avant la 6e séance (%)'],
    ['carnetComplet', 'Carnet complet atteint (% exécutions)'],
    ['chapardeur', 'Chapardeur passé (% exécutions)'],
  ]) {
    html += `<tr><td>${esc(lib)}</td>${plateaux.map((p) => `<td class="num" colspan="3">${fmt(agregats[p][cle], 0)}</td>`).join('')}</tr>`;
  }
  if (annee) {
    html += `<tr><td>Double plafond 8/8 en fin d’année (%)</td><td class="num" colspan="${plateaux.length * 3}">${fmt(annee.doublePlafond, 1)}</td></tr>`;
  }
  html += '</tbody></table>';
  // Graphiques : barres des médianes par plateau, boîtes des distributions.
  html += '<div class="grille">';
  for (const cle of ['equipesSousVoile', 'pagesPalies', 'pagesTenues', 'partGnomes']) {
    const ind = INDICATEURS.find((i) => i.cle === cle);
    html += `<div class="carte"><h3>${esc(ind.libelle)} (%)</h3>${svgBoites(
      plateaux.map((p) => ({ libelle: `P${p}`, resume: agregats[p].indicateurs[cle] })),
      { max: 100, unite: ' %' },
    )}</div>`;
  }
  html += `<div class="carte"><h3>Séances jusqu’au Seuil</h3>${svgBoites(
    plateaux.map((p) => ({ libelle: `P${p}`, resume: agregats[p].indicateurs.seances })),
    { max: 7 },
  )}</div>`;
  html += `<div class="carte"><h3>Carnet complet (% des exécutions)</h3>${svgBarres(
    plateaux.map((p) => ({ libelle: `P${p}`, valeur: agregats[p].carnetComplet })),
    { max: 100, unite: ' %' },
  )}</div>`;
  html += '</div>';
  // Dépenses par cause.
  html += '<h3>Mouvements du grand livre par cause (moyenne par exécution, en unités)</h3>';
  for (const p of plateaux) {
    const dep = agregats[p].depenses;
    const causes = Object.keys(dep).sort();
    if (!causes.length) continue;
    html += `<p><strong>P${p}</strong></p><table><thead><tr><th>Cause</th><th class="num">Gains</th><th class="num">Dépenses</th></tr></thead><tbody>${causes.map((c) => `<tr><td>${esc(c)}</td><td class="num">${fmt(dep[c].gains)}</td><td class="num">${fmt(dep[c].depenses)}</td></tr>`).join('')}</tbody></table>`;
  }
  // Attendus par plateau.
  for (const p of plateaux) {
    const lignes = attendusParPlateau[p];
    const bilan = bilanAttendus(lignes);
    html += `<h3>Attendus d’équilibrage — P${p} <span class="badge ${bilan.ok ? 'ok' : 'ko'}">${bilan.respectees}/${bilan.evaluees} respectés</span></h3>${tableauAttendus(lignes)}`;
  }
  if (modele && modele.lignes.length) {
    html += `<h3>Écart modèle rapide / banc (médianes, seuil ${modele.ecartMax} points)</h3><table><thead><tr><th>Plateau</th><th>Indicateur</th><th class="num">Banc</th><th class="num">Modèle</th><th class="num">Écart</th><th></th></tr></thead><tbody>${modele.lignes
      .map(
        (l) =>
          `<tr><td>P${l.plateau}</td><td>${esc(l.indicateur)}</td><td class="num">${fmt(l.banc)}</td><td class="num">${fmt(l.modele)}</td><td class="num">${fmt(l.ecart)}</td><td>${l.signale ? '<span class="ko">écart &gt; seuil</span>' : '<span class="ok">dans le seuil</span>'}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  }
  html += '</section>';
  return html;
}

function sectionVariantes(groupes, agregatsParGroupe, attendusParGroupe) {
  // Une ligne par indicateur × plateau, une colonne par variante (classe moyenne puis difficulté).
  const classes = [...new Set(groupes.map((g) => g.sousScenario))];
  let html = '<section><h2>Variantes côte à côte</h2>';
  for (const classe of classes) {
    const gs = groupes.filter((g) => g.sousScenario === classe);
    const plateaux = [
      ...new Set(gs.flatMap((g) => Object.keys(agregatsParGroupe.get(g)).map(Number))),
    ].sort((a, b) => a - b);
    html += `<h3>Classe ${esc(classe || '—')}</h3><table><thead><tr><th>Indicateur</th><th>Plateau</th>${gs.map((g) => `<th class="num">${esc(g.variante)}</th>`).join('')}</tr></thead><tbody>`;
    const lignes = [
      [
        'equipesSousVoile',
        'Équipes sous le voile (%)',
        (a) => a.indicateurs.equipesSousVoile.mediane,
      ],
      ['pagesPalies', 'Pages pâlies au Seuil (%)', (a) => a.indicateurs.pagesPalies.mediane],
      ['pagesTenues', 'Pages tenues au Seuil (%)', (a) => a.indicateurs.pagesTenues.mediane],
      ['carnetComplet', 'Carnet complet (% exécutions)', (a) => a.carnetComplet],
      ['partGnomes', 'Part des Gnomes (%)', (a) => a.indicateurs.partGnomes.mediane],
      ['seances', 'Séances (médiane)', (a) => a.indicateurs.seances.mediane],
      ['gini', 'Gini', (a) => a.indicateurs.gini.mediane],
      ['matthieu', 'Indice Matthieu', (a) => a.indicateurs.matthieu.mediane],
    ];
    for (const [, lib, f] of lignes) {
      for (const p of plateaux) {
        html += `<tr><td>${esc(lib)}</td><td>P${p}</td>${gs.map((g) => `<td class="num">${fmt(agregatsParGroupe.get(g)[p] ? f(agregatsParGroupe.get(g)[p]) : null, 2)}</td>`).join('')}</tr>`;
      }
    }
    html += `<tr><th>Attendus respectés</th><th></th>${gs
      .map((g) => {
        const parP = attendusParGroupe.get(g);
        const bilans = Object.values(parP).map(bilanAttendus);
        const ok = bilans.every((b) => b.ok);
        const manques = [...new Set(bilans.flatMap((b) => b.manquees))];
        return `<td class="num"><span class="badge ${ok ? 'ok' : 'ko'}">${ok ? 'tous' : `manqués : ${esc(manques.join(', '))}`}</span></td>`;
      })
      .join('')}</tr></tbody></table>`;
  }
  html += '</section>';
  return html;
}

function sectionExecutions(runs) {
  let html = `<section><h2>Exécutions</h2><table><thead><tr><th>#</th><th>Variante</th><th>Classe</th><th class="num">Graine</th><th>État</th><th class="num">Appels</th><th class="num">5xx</th><th class="num">Durée</th><th>Chapitres</th></tr></thead><tbody>`;
  for (const r of runs) {
    html += `<tr><td>${r.run}</td><td>${esc(r.variante || '—')}</td><td>${esc(r.sousScenario || r.classe)}</td><td class="num">${r.seed}</td><td>${r.ok ? '<span class="ok">ok</span>' : `<span class="ko">${esc(r.echec.code)}</span>`}</td><td class="num">${r.appels}</td><td class="num">${r.erreurs5xx}</td><td class="num">${Math.round(r.dureeMs / 1000)} s</td><td>${(
      r.chapitres || []
    )
      .map(
        (c) =>
          `P${c.plateau} : ${c.mesures.seances} séances, ${c.mesures.pages.tenues}/${c.mesures.zonesActives} tenues, ${c.mesures.pages.palies} pâlies, voile ${fmt(c.mesures.equipesSousVoilePct, 0)} %${c.mesures.carnetComplet ? ', carnet complet' : ''}`,
      )
      .join('<br>')}</td></tr>`;
    if (!r.ok)
      html += `<tr><td colspan="9"><pre>${esc(r.echec.message)}\n${esc(JSON.stringify(r.echec.contexte, null, 1).slice(0, 1500))}</pre></td></tr>`;
  }
  html += '</tbody></table></section>';
  return html;
}

function sectionAssertions(runs) {
  const avec = runs.filter((r) => Array.isArray(r.assertions));
  if (!avec.length) return '';
  let html = '<section><h2>Assertions du scénario</h2>';
  for (const r of avec) {
    html += `<h3>Exécution ${r.run} (graine ${r.seed})</h3><table><thead><tr><th>Code</th><th>Verdict</th><th>Détail</th></tr></thead><tbody>${r.assertions
      .map(
        (a) =>
          `<tr><td>${esc(a.code)}</td><td>${a.ok === null ? '<span class="na">non vérifiable</span>' : a.ok ? '<span class="ok">ok</span>' : '<span class="ko">échec</span>'}</td><td>${esc(a.detail)}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  }
  return `${html}</section>`;
}

function sectionBadges(runs) {
  const b = runs.flatMap((r) => r.chapitres.map((c) => c.mesures.badges)).find(Boolean);
  if (!b) return '';
  if (!b.disponibles) {
    return `<section><h2>Badges</h2><p class="na">${esc(b.raison)}</p>${b.approximation ? `<p><small>Approximation par la table <code>gl_player_badges</code> : ${b.approximation.badgesApp} badge(s) d’app, ${b.approximation.joueursAvecBadge} élève(s) concerné(s).</small></p>` : ''}</section>`;
  }
  return `<section><h2>Badges (paliers Fil)</h2><p>Élèves avec au moins un palier : <strong>${fmt(b.elevesAvecPalierPct)} %</strong> · Spearman justesse ↔ paliers : <strong>${fmt(b.spearmanJustessePaliers, 2)}</strong></p>${svgBarres(Object.entries(b.familles).map(([k, v]) => ({ libelle: k, valeur: v })))}</section>`;
}

function sectionFuites(runs) {
  const total = runs.reduce((a, r) => a + (r.fuitesBourses || 0), 0);
  if (!total) return '';
  const exemples = runs
    .flatMap((r) =>
      (r.fuitesBoursesExemples || []).map((f) => ({ ...f, run: r.run, seed: r.seed })),
    )
    .slice(0, 10);
  return `<section><h2>Bourses d’une autre équipe servies à un élève <span class="badge ko">${total} occurrence(s) — bogue du moteur</span></h2><p>Garde-fou n° 6 : un élève ne voit jamais les bourses des autres équipes. Le banc a relevé des soldes (<code>health</code> / <code>power</code>) d’élèves d’autres équipes dans des réponses servies à un élève (mode <code>--fuites-bourses avertir</code> : l’exécution continue). Chemins typiques : <code>events[].payload.results[]</code> et <code>casters[]</code> d’un événement <code>spell_cast</code> (non marqué <code>private</code>).</p><table><thead><tr><th>Exécution</th><th>Séance</th><th>Route</th><th>Chemins</th><th class="num">Occurrences</th></tr></thead><tbody>${exemples
    .map(
      (e) =>
        `<tr><td>${e.run} (graine ${e.seed})</td><td>${esc(e.seance ?? '—')}</td><td>${esc(e.path)}</td><td>${esc(e.chemins.join(', '))}</td><td class="num">${e.occurrences}</td></tr>`,
    )
    .join('')}</tbody></table></section>`;
}

function sectionMotsCorpus(runs) {
  const total = runs.reduce((a, r) => a + (r.motsCorpus || 0), 0);
  if (!total) return '';
  const exemples = runs.flatMap((r) => r.motsCorpusExemples || []).slice(0, 8);
  return `<section><h2>Mots interdits dans le corpus servi aux élèves <span class="badge ko">${total} occurrence(s)</span></h2><p>Chaînes du <strong>corpus</strong> (feuillets, questions, retours de QCM, descriptions de cases) portant un mot de la liste interdite (<code>findForbiddenString</code>). Elles relèvent du contenu, pas du moteur : avertissement (le mode <code>--mots-interdits strict</code> les fait échouer). Aucune chaîne du moteur n’en portait.</p><table><thead><tr><th>Chemin</th><th>Mot</th><th>Extrait</th></tr></thead><tbody>${exemples
    .map(
      (e) => `<tr><td>${esc(e.chemin)}</td><td>${esc(e.mot)}</td><td>${esc(e.extrait)}</td></tr>`,
    )
    .join('')}</tbody></table></section>`;
}

function construireHtml({
  scenario,
  runs,
  groupes,
  agregatsParGroupe,
  anneeParGroupe,
  attendusParGroupe,
  modeleParGroupe,
  options,
  dureeMs,
  date,
}) {
  const echecs = runs.filter((r) => !r.ok).length;
  const appels = runs.reduce((a, r) => a + r.appels, 0);
  const cinq = runs.reduce((a, r) => a + r.erreurs5xx, 0);
  let html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banc G&amp;L · ${esc(scenario.id)}</title><style>${CSS}</style></head><body>`;
  html += `<header><h1>Banc de simulation « Tenir à deux » — ${esc(scenario.id)}</h1><p>${esc(scenario.description)}</p><p>${date} · ${runs.length} exécution(s) · graine ${options.seed} · ${appels} appels HTTP · ${cinq} réponse(s) 5xx · ${echecs} échec(s) · ${Math.round(dureeMs / 1000)} s</p></header><main>`;
  html += `<section><h2>Résumé</h2><p>${echecs ? `<span class="ko">${echecs} exécution(s) en échec</span> (invariant, 5xx, mot interdit du moteur ou bourses d’une autre équipe : détail plus bas).` : '<span class="ok">Aucun échec</span> : invariants respectés après chaque geste, aucune 5xx, aucun mot interdit du moteur, aucune bourse d’une autre équipe servie à un élève.'} Les attendus d’équilibrage sont des avertissements.</p><p><small>Personas : ${esc(JSON.stringify(runs[0]?.personas || {}))}</small></p><p><small>Réglages du scénario : ${esc(JSON.stringify(runs[0]?.reglages || {}))}</small></p></section>`;
  if (groupes.length > 1) html += sectionVariantes(groupes, agregatsParGroupe, attendusParGroupe);
  for (const g of groupes) {
    html += sectionGroupe(
      g,
      agregatsParGroupe.get(g),
      anneeParGroupe.get(g),
      attendusParGroupe.get(g),
      modeleParGroupe.get(g),
    );
  }
  html += sectionBadges(runs);
  html += sectionAssertions(runs);
  html += sectionFuites(runs);
  html += sectionMotsCorpus(runs);
  html += sectionExecutions(runs);
  html += `<section><h2>Lecture</h2><p>Médianes, p10 et p90 sur les exécutions ; une boîte va de p10 à p90, la moustache du minimum au maximum, le trait est la médiane. Les bourses, le grand livre et les pages sont lus en base par le prof virtuel ; les élèves virtuels n’ont vu que les réponses de l’API. Aucune donnée nominative : pseudos <code>sim-&lt;scenario&gt;-&lt;n&gt;</code>.</p></section>`;
  html += '</main></body></html>';
  return html;
}

/**
 * Écrit `summary.json` et `index.html` ; renvoie le dossier et quelques lignes de résumé.
 */
function ecrireRapport({ racine, scenario, runs, options, dureeMs = 0 }) {
  const date = new Date().toISOString().slice(0, 10);
  const dossier = path.join(racine, `${date}-${scenario.id}`);
  fs.mkdirSync(dossier, { recursive: true });
  let reference = null;
  try {
    reference = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', '..', 'data', 'gl', 'sim', 'modele-rapide-reference.json'),
        'utf8',
      ),
    );
  } catch (_) {
    reference = null;
  }
  const groupes = grouper(runs);
  const agregatsParGroupe = new Map();
  const anneeParGroupe = new Map();
  const attendusParGroupe = new Map();
  const modeleParGroupe = new Map();
  const resume = [];
  for (const g of groupes) {
    const agg = agregerParPlateau(g.runs);
    const annee = agregerAnnee(g.runs);
    agregatsParGroupe.set(g, agg);
    anneeParGroupe.set(g, annee);
    const parP = {};
    const dernierPlateau = Math.max(...Object.keys(agg).map(Number));
    for (const [p, a] of Object.entries(agg)) {
      // Le double plafond est une mesure de fin d'année : évaluée sur le dernier plateau joué.
      parP[p] = evaluerAttendus({
        classe: g.classe,
        plateau: Number(p),
        indicateurs: indicateursPourAttendus(a, Number(p) === dernierPlateau ? annee : null),
      });
    }
    attendusParGroupe.set(g, parP);
    modeleParGroupe.set(g, comparerAuModele(g, agg, reference));
    for (const [p, a] of Object.entries(agg)) {
      const b = bilanAttendus(parP[p]);
      resume.push(
        `${[g.variante, g.sousScenario].filter(Boolean).join('/') || scenario.id} P${p} : ${a.n} exéc., séances ${fmt(a.indicateurs.seances.mediane)}, voile ${fmt(a.indicateurs.equipesSousVoile.mediane, 0)} %, pâlies ${fmt(a.indicateurs.pagesPalies.mediane, 0)} %, tenues ${fmt(a.indicateurs.pagesTenues.mediane, 0)} %, carnet ${fmt(a.carnetComplet, 0)} %, gnomes ${fmt(a.indicateurs.partGnomes.mediane, 0)} %, Gini ${fmt(a.indicateurs.gini.mediane, 2)}, Matthieu ${fmt(a.indicateurs.matthieu.mediane, 2)} · attendus ${b.respectees}/${b.evaluees}${b.manquees.length ? ` (manqués : ${b.manquees.join(', ')})` : ''}`,
      );
    }
  }
  const summary = {
    format: 'gl-sim-rapport v1',
    scenario: { id: scenario.id, description: scenario.description },
    date: new Date().toISOString(),
    options: {
      runs: options.runs,
      seed: options.seed,
      seances: options.seances,
      grille: options.grille || null,
      motsInterdits: options.motsInterdits,
      joursVeillee: options.joursVeillee,
    },
    dureeMs,
    echecs: runs.filter((r) => !r.ok).length,
    groupes: groupes.map((g) => ({
      variante: g.variante,
      sousScenario: g.sousScenario,
      classe: g.classe,
      agregats: agregatsParGroupe.get(g),
      annee: anneeParGroupe.get(g),
      attendus: attendusParGroupe.get(g),
      modele: modeleParGroupe.get(g),
    })),
    runs,
  };
  fs.writeFileSync(path.join(dossier, 'summary.json'), JSON.stringify(summary, null, 1));
  fs.writeFileSync(
    path.join(dossier, 'index.html'),
    construireHtml({
      scenario,
      runs,
      groupes,
      agregatsParGroupe,
      anneeParGroupe,
      attendusParGroupe,
      modeleParGroupe,
      options,
      dureeMs,
      date,
    }),
  );
  return { dossier, resume, summary };
}

module.exports = {
  INDICATEURS,
  agregerParPlateau,
  agregerAnnee,
  indicateursPourAttendus,
  grouper,
  comparerAuModele,
  svgBarres,
  svgBoites,
  construireHtml,
  ecrireRapport,
};
