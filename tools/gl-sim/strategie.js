'use strict';

/**
 * Stratégies de fouille des élèves virtuels (pures). Les polygones ne sont **jamais** lus : seules
 * les réponses de l'API nourrissent la stratégie (`GET /chasse` : `pages[].contour` — centre
 * public d'une page révélée / pâlie / trouvée —, `empreintes[]` froid / tiède / chaud ;
 * `POST /chasse/fouiller` : verdict du dernier clic).
 *
 * - `aveugle` : clic uniforme sur le plateau ;
 * - `futee` : vise une page révélée (contour) non trouvée ; sinon converge autour de la dernière
 *   empreinte `chaud` (rayon 0,05) puis `tiede` (rayon 0,12), en ignorant les empreintes à côté
 *   d'une page déjà trouvée ; sinon un point loin des empreintes `froid` ; une équipe gnome vise
 *   d'abord une page pâlie (réparation) ;
 * - `mixte` : 50 / 50 à chaque clic.
 */

const MARGE = 0.03;
const RAYON_CHAUD = 0.05;
const RAYON_TIEDE = 0.12;
const RAYON_FROID = 0.12;
const RAYON_EMPREINTE_PERIMEE = 0.08;
const ETATS_TROUVEES = new Set(['trouvee', 'reparee', 'tenue']);

function borne(v) {
  return Math.min(1 - MARGE, Math.max(MARGE, v));
}

function distance(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  return Math.sqrt(dx * dx + dy * dy);
}

function pointUniforme(rng) {
  return { x: borne(rng.uniform(MARGE, 1 - MARGE)), y: borne(rng.uniform(MARGE, 1 - MARGE)) };
}

function pointAutour(rng, centre, rayon) {
  const angle = rng.uniform(0, 2 * Math.PI);
  const r = rayon * Math.sqrt(rng.next());
  return { x: borne(centre.x + r * Math.cos(angle)), y: borne(centre.y + r * Math.sin(angle)) };
}

/**
 * @param {object} input
 * @param {'aveugle'|'futee'|'mixte'} input.strategie
 * @param {object} input.rng
 * @param {Array<{ etat, contour: {x,y}|null }>} [input.pages] carnet de la classe
 * @param {Array<{ x, y, verdict }>} [input.empreintes] plus récentes en premier (ordre de l'API)
 * @param {boolean} [input.gnome] l'équipe est gnome (peut réparer une page pâlie)
 * @returns {{ x: number, y: number, raison: string }}
 */
function choisirPointFouille({ strategie, rng, pages = [], empreintes = [], gnome = false }) {
  let strat = strategie;
  if (strat === 'mixte') strat = rng.chance(0.5) ? 'futee' : 'aveugle';
  if (strat !== 'futee') return { ...pointUniforme(rng), raison: 'aveugle' };

  const liste = Array.isArray(pages) ? pages : [];
  // 1. Page pâlie à réparer (gnomes), puis page révélée : le contour est public.
  if (gnome) {
    const palie = liste.find((p) => p.etat === 'palie' && p.contour);
    if (palie) return { x: borne(palie.contour.x), y: borne(palie.contour.y), raison: 'palie' };
  }
  const revelee = liste.find((p) => p.etat === 'revelee' && p.contour);
  if (revelee) {
    return { x: borne(revelee.contour.x), y: borne(revelee.contour.y), raison: 'revelee' };
  }
  // 2. Empreintes chaudes puis tièdes, hors voisinage d'une page déjà trouvée.
  const trouvees = liste.filter((p) => ETATS_TROUVEES.has(p.etat) && p.contour);
  const perimee = (e) => trouvees.some((p) => distance(e, p.contour) <= RAYON_EMPREINTE_PERIMEE);
  const utiles = (Array.isArray(empreintes) ? empreintes : []).filter((e) => !perimee(e));
  const chaud = utiles.find((e) => e.verdict === 'chaud');
  if (chaud) return { ...pointAutour(rng, chaud, RAYON_CHAUD), raison: 'chaud' };
  const tiede = utiles.find((e) => e.verdict === 'tiede');
  if (tiede) return { ...pointAutour(rng, tiede, RAYON_TIEDE), raison: 'tiede' };
  // 3. Loin des froids (20 essais), sinon uniforme.
  const froids = utiles.filter((e) => e.verdict === 'froid');
  for (let i = 0; i < 20; i += 1) {
    const p = pointUniforme(rng);
    if (!froids.some((f) => distance(f, p) <= RAYON_FROID)) return { ...p, raison: 'exploration' };
  }
  return { ...pointUniforme(rng), raison: 'aveugle' };
}

module.exports = {
  MARGE,
  RAYON_CHAUD,
  RAYON_TIEDE,
  RAYON_FROID,
  distance,
  pointUniforme,
  pointAutour,
  choisirPointFouille,
};
