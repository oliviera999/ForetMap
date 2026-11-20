/**
 * « Tenir à deux » — textes de repli d'Olu commentateur (quand `GET /tenir/olu` ne sert
 * aucune ligne pour un moment). Jamais de nom d'oiseau, jamais « faux / raté / perdu »,
 * jamais de personnification du Souffle (spec § 2).
 */
export const TENIR_OLU_FALLBACK = Object.freeze({
  ouverture: [{ texte: 'La caravane repart. On avance ensemble.', expression: 'neutre' }],
  jet: [{ texte: 'Les dés ont parlé : {equipe} avance.', expression: 'joie' }],
  question: [{ texte: 'Une question sur la route. On réfléchit à deux.', expression: 'pensif' }],
  fouille: [{ texte: 'On fouille. Le plateau garde ses pages.', expression: 'curieux' }],
  tenir: [{ texte: 'Une page tenue à deux : elle ne s’effacera plus.', expression: 'joie' }],
  voile: [{ texte: 'Le voile avance. On tient.', expression: 'neutre' }],
  sort: [{ texte: 'Un sort est lancé.', expression: 'surpris' }],
  seuil: [{ texte: 'Le camp approche : on compte ce qu’on a tenu.', expression: 'pensif' }],
  peripetie: [{ texte: 'Une péripétie ! On passe.', expression: 'surpris' }],
  bestiaire: [{ texte: 'Une chimère entre au bestiaire.', expression: 'curieux' }],
  oiseau: [{ texte: 'L’oiseau est passé par là.', expression: 'curieux' }],
  erreur: [],
});

/**
 * Ce que l'écran d'équipe dit après une fouille (verdict servi par `POST /chasse/fouiller`).
 * Source unique : la carte du moment (`src/gl/utils/glTenirMoment.js › retourDuMoment`).
 */
export const TENIR_VERDICT_TEXTES = Object.freeze({
  froid: 'Froid : la page dort plus loin.',
  tiede: 'Tiède : on s’approche.',
  chaud: 'Chaud : la page est tout près.',
  zone: 'Une page dort ici : répondez à sa question.',
  deja_trouvee: 'Cette page est déjà trouvée.',
  palie: 'Cette zone a pâli : les Gnomes savent la réparer.',
  page_trouvee: 'Page trouvée ! Elle entre au carnet de la classe.',
  pas_encore: 'Pas encore : la page dort encore ici.',
});

/**
 * Une seule limite de veillée (ensemble unifié, M8) : pages tenues en veillée et pages gagnées
 * par un défi de la Trame partagent le même compteur hebdomadaire. Une réussite compte toujours
 * (regard, badge), même la semaine pleine.
 * @param {{ utilisees?: number, plafond?: number, restantes?: number }} pages
 */
export function encorePagesDeVeillee(pages) {
  const n =
    pages?.restantes != null
      ? Math.max(0, Number(pages.restantes) || 0)
      : Math.max(0, (Number(pages?.plafond) || 0) - (Number(pages?.utilisees) || 0));
  if (n === 0)
    return 'Tu as gagné toutes tes pages de la semaine. Tes réussites comptent toujours.';
  return `Encore ${n} page${n > 1 ? 's' : ''} à gagner cette semaine.`;
}
