/**
 * Phrases d'Olu quand un badge G&L arrive (`extraPools` de la célébration commune,
 * `src/shared/rewards/RewardCelebration.jsx` → `oluRewardsVoice.js`). Une entrée par famille
 * du catalogue G&L (`lib/glRewardsCatalog.js`) ; les badges décernés gardent l'introduction
 * commune (le mot du prof est la vedette).
 *
 * Garde-fous (règles § 1) : le Souffle n'est pas personnifié, l'oiseau n'est jamais nommé,
 * aucun contenu du tiers secret, l'erreur ne punit jamais ; la pointe ne vise jamais l'élève
 * (charte Olu § 2.2bis). Tutoiement, niveau 6e.
 */
export const GL_REWARDS_OLU_POOLS = Object.freeze({
  chasse: Object.freeze([
    'Une page de plus qui sort de son sommeil. Le plateau a beau être grand, vous le connaissez mieux que moi.',
    'Fouiller, c’est écouter le sol. Vous commencez à l’entendre.',
    'J’ai compté vos fouilles sur mes doigts. J’ai manqué de doigts.',
  ]),
  lecture: Object.freeze([
    'Une page lue jusqu’au bout, ça se sent dans la Trame : elle respire mieux.',
    'Tenir une page pour l’autre peuple : c’est comme ça que le fil tient à deux.',
    'Tu lis mieux que moi : je m’arrête toujours à l’incipit.',
  ]),
  perseverance: Object.freeze([
    'Un « pas encore » devenu « maintenant ». C’est la plus belle des réponses.',
    'Revenir sur une question, c’est le secret des grands lecteurs. Moi, j’oublie où j’ai laissé la mienne.',
    'Rien ne se retire, tout se retient. Te voilà la preuve.',
  ]),
  cooperation: Object.freeze([
    'Un don, un sort pour les autres, une page réparée : la Trame tient parce que vous la tenez ensemble.',
    'Tendre la main, c’est plus rare que trouver une page. Je note les deux.',
    'Les gnomes réparent, les licornes éclairent, et toi tu aides. Le royaume s’en souvient.',
  ]),
  nature: Object.freeze([
    'Une fiche étudiée jusqu’au bout : les espèces aiment qu’on les nomme bien.',
    'Tu connais des biomes que je n’ai jamais traversés. Et j’ai beaucoup traversé.',
  ]),
  veillee: Object.freeze([
    'Revenir à la veillée semaine après semaine : la Trame se tisse la nuit aussi.',
    'La veillée te connaît. Moi, à cette heure-là, je dors.',
  ]),
  voyage: Object.freeze([
    'Un chapitre traversé jusqu’au bout. Le seuil suivant t’attend déjà.',
    'Gnome un jour, licorne l’autre : tu connais les deux regards. Peu peuvent en dire autant.',
  ]),
});
