/**
 * Texte de la notice « Vos données » (art. 12 à 14 du RGPD) — audit sécurité/RGPD du
 * 30/09/2026, constat RG1.
 *
 * Module **pur** (aucun React, aucun appel réseau) : il assemble la notice d'un produit à partir
 * de la marque du build et de deux réglages publics. Les tests vérifient le texte ici, la page
 * (`PrivacyNoticePage.jsx`) ne fait que le mettre en forme.
 *
 * Règles de rédaction :
 * - public **adolescent** : phrases courtes, pas de jargon, tutoiement dans ForetMap et G&L
 *   (comme leurs écrans), vouvoiement dans les plans (public adulte ou visiteur) ;
 * - **aucun nom en dur** : le logiciel, le jeu et l'établissement viennent de la marque
 *   (`src/shared/brand/brandNames.js`, alimenté par `lib/brand.js`) ;
 * - **aucune durée inventée** : chaque durée recopie une constante du code, citée en
 *   commentaire à côté. Si l'une change, cette notice doit changer dans le même lot.
 */

/**
 * Produits qui ont une notice. `staff` = plan des personnels ; `enov` = plan e-nov, dont la
 * notice est celle du plan public (mêmes données : aucune, hors cookie de code) sous son nom.
 */
export const PRIVACY_NOTICE_PRODUCTS = Object.freeze(['foret', 'gl', 'plan', 'staff', 'enov']);

/** Longueur maximale du contact affiché (réglage `privacy.data_contact`, `lib/settings/privacy.js`). */
export const PRIVACY_CONTACT_MAX_LENGTH = 400;

/**
 * Durées de conservation par défaut, recopiées du code. Une seule table pour que les tests
 * puissent comparer ces valeurs aux constantes serveur.
 */
export const PRIVACY_RETENTION = Object.freeze({
  /** `security.jwt_ttl_base_seconds` (5400 s), `lib/settings/identity.js`. */
  sessionMinutes: 90,
  /** `security.jwt_sliding_max_seconds` (43200 s), même fichier. */
  sessionMaxHours: 12,
  /** `DEFAULT_RETENTION_DAYS`, `lib/notifications.js` (purge quotidienne, `server.js`). */
  notificationsDays: 60,
  /** `DEFAULT_ACTIVITY_RETENTION_DAYS`, `scripts/purge-audit-logs.js`. */
  activityDays: 90,
  /** `DEFAULT_RETENTION_DAYS` (journaux de sécurité), `scripts/purge-audit-logs.js`. */
  securityDays: 365,
  /** `DEFAULT_HISTORY_RETENTION_DAYS` (historiques de jeu et de jardin), même script. */
  historyDays: 365,
  /** `DEFAULT_VISITS_RETENTION_DAYS` (compteurs d'usage anonymes), même script. */
  usageCountersDays: 365,
  /** `DEFAULT_IP_RETENTION_DAYS` (adresse IP complète, puis raccourcie), même script. */
  ipFullDays: 90,
  /** `PASSWORD_RESET_TTL_MINUTES`, `lib/passwordReset.js`. */
  passwordResetMinutes: 60,
  /** `ANON_TTL_SECONDS` (24 h), `routes/visit.js` — progression de la visite sans compte. */
  guestVisitHours: 24,
  /** `PLAN_ACCESS_TTL_SECONDS` (30 j), `lib/planAccess.js`. */
  planAccessDays: 30,
  /** `STAFF_PLAN_ACCESS_TTL_SECONDS` (7 j), `lib/staffPlanAccess.js`. */
  staffPlanAccessDays: 7,
});

function clean(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nom affiché du produit, tiré de la marque. Les plans n'ont pas de nom de marque propre : on
 * compose « Plan » avec le nom court de l'établissement, comme le registre des produits
 * (`lib/products.js`, `brandText('Plan {orgShort}', 'Plan')`).
 * @param {string} product
 * @param {{ appName?: string, orgShortName?: string, glName?: string }} brand
 */
export function privacyProductName(product, brand = {}) {
  const orgShort = clean(brand.orgShortName);
  if (product === 'gl') return clean(brand.glName) || 'le jeu';
  if (product === 'plan') return orgShort ? `Plan ${orgShort}` : 'le plan';
  if (product === 'staff') {
    return orgShort ? `Plan des personnels ${orgShort}` : 'le plan des personnels';
  }
  if (product === 'enov') return orgShort ? `Plan e-nov ${orgShort}` : 'le plan e-nov';
  return clean(brand.appName) || 'l’application';
}

/**
 * Notice complète d'un produit.
 *
 * @param {object} options
 * @param {'foret'|'gl'|'plan'|'staff'|'enov'} options.product
 * @param {{ appName?: string, orgName?: string, orgShortName?: string, glName?: string }} [options.brand]
 * @param {string} [options.contact] coordonnées « données personnelles » saisies par un admin.
 * @param {string} [options.externalAssetsMode] `privacy.external_assets_mode` (`local` par défaut).
 * @param {boolean} [options.clearLocalDataOnLogout] `privacy.clear_local_data_on_logout`.
 * @returns {{ product: string, productName: string, title: string, intro: string,
 *   highlight: string, sections: Array<{ id: string, title: string, paragraphs: string[], items: string[] }> }}
 */
export function buildPrivacyNotice({
  product = 'foret',
  brand = {},
  contact = '',
  externalAssetsMode = 'local',
  clearLocalDataOnLogout = true,
} = {}) {
  const requested = PRIVACY_NOTICE_PRODUCTS.includes(product) ? product : 'foret';
  // Plan e-nov : le plan public, mis en avant autrement — il ne garde rien de plus. Son code de
  // diffusion, s'il est activé, est un cookie de même nature et de même durée que celui du plan.
  const kind = requested === 'enov' ? 'plan' : requested;
  const isPlan = kind === 'plan' || kind === 'staff';
  /** Tutoiement pour les élèves et joueurs, vouvoiement pour les plans. */
  const t = (tu, vous) => (isPlan ? vous : tu);
  const productName = privacyProductName(requested, brand);
  const orgName = clean(brand.orgName);
  const contactText = clean(contact).slice(0, PRIVACY_CONTACT_MAX_LENGTH);
  const R = PRIVACY_RETENTION;

  const sections = [];
  const section = (id, title, paragraphs = [], items = []) =>
    sections.push({
      id,
      title,
      paragraphs: paragraphs.filter(Boolean),
      items: items.filter(Boolean),
    });

  // --- Qui est responsable ----------------------------------------------------------------
  section('responsable', 'Qui est responsable de ces données ?', [
    orgName
      ? t(
          `${orgName} est responsable de tes données. ${productName} est un outil que l’établissement met à disposition de ses élèves et de ses équipes.`,
          `${orgName} est responsable de vos données. ${productName} est un outil que l’établissement met à disposition de ses équipes et de ses visiteurs.`,
        )
      : t(
          `L’établissement qui t’a donné accès à ${productName} est responsable de tes données.`,
          `L’établissement qui vous donne accès à ${productName} est responsable de vos données.`,
        ),
    contactText
      ? t(
          `Pour une question sur tes données ou pour exercer tes droits : ${contactText}`,
          `Pour une question sur vos données ou pour exercer vos droits : ${contactText}`,
        )
      : t(
          'Pour une question sur tes données, adresse-toi à un enseignant ou à la direction : ils transmettront au délégué à la protection des données (DPO) de l’établissement.',
          'Pour une question sur vos données, adressez-vous à la direction de l’établissement, qui transmettra à son délégué à la protection des données (DPO).',
        ),
  ]);

  // --- Finalités ------------------------------------------------------------------------------
  const purposes = {
    foret: [
      'organiser les activités de la forêt comestible : carte, zones, plantes et tâches à faire ;',
      'savoir qui s’occupe de quoi, et permettre aux enseignants de valider les tâches ;',
      'apprendre : quiz, observations, carnet, forum, visite guidée ;',
      'protéger le site : connexions, prévention des abus et des erreurs.',
    ],
    gl: [
      'faire vivre le jeu pédagogique : parties, chapitres, QCM, marché, sorts, journal ;',
      'permettre au maître du jeu (MJ) et aux enseignants de suivre et d’animer la partie ;',
      'protéger le site : connexions, prévention des abus et des erreurs.',
    ],
    plan: [
      'afficher le plan de l’établissement et vous aider à trouver un lieu ;',
      'compter la fréquentation de façon anonyme (nombre d’ouvertures par jour, sans identifiant ni cookie).',
    ],
    staff: [
      'afficher le plan réservé aux personnels, avec les lieux et informations qui ne sont pas publics ;',
      'vérifier que la personne connectée fait bien partie des personnels ;',
      'protéger le site : connexions, prévention des abus.',
    ],
  };
  section(
    'finalites',
    t('À quoi servent tes données ?', 'À quoi servent les données ?'),
    [],
    purposes[kind],
  );

  // --- Base légale ---------------------------------------------------------------------------
  section('base-legale', 'Sur quelle base ?', [
    t(
      'Ces traitements font partie de la mission d’intérêt public d’enseignement de l’établissement (article 6-1-e du RGPD). Tu n’as donc pas à donner ton accord pour utiliser l’application en classe, mais tu gardes tous les droits décrits plus bas.',
      'Ces traitements font partie de la mission d’intérêt public de l’établissement (article 6-1-e du RGPD). Vous gardez tous les droits décrits plus bas.',
    ),
  ]);

  // --- Données collectées ---------------------------------------------------------------------
  const collected = {
    foret: [
      'ton identité : prénom, nom, classe ou groupe ;',
      'ton adresse e-mail, si tu la donnes (elle est facultative à l’inscription) ou si ton compte vient de Google ou de Moodle ;',
      'ton pseudo, ta description et ta photo de profil, si tu en choisis ;',
      'ce que tu produis : photos, observations, comptes rendus de tâches, carnet, messages du forum et commentaires ;',
      'ta progression : tâches prises et faites, quiz, découvertes, badges, statistiques ;',
      'des journaux de sécurité : date et heure de connexion, adresse IP et type de navigateur lors de certains événements (connexion, mot de passe erroné…).',
    ],
    gl: [
      'ton identité de joueur : pseudo, et prénom, nom ou adresse e-mail si ton compte en a ;',
      'ta progression : chapitres, réponses aux QCM, points, échanges au marché, sorts ;',
      'ce que tu produis : journal, messages et commentaires, avatar ;',
      'des journaux de sécurité : date et heure de connexion, adresse IP et type de navigateur lors de certains événements.',
    ],
    plan: [
      'aucune donnée qui vous identifie : le plan public ne demande pas de compte ;',
      'si l’établissement protège le plan par un code, un cookie retient que vous l’avez saisi ;',
      'si vous utilisez « Me situer », votre position est calculée sur votre téléphone et n’est pas envoyée au serveur.',
    ],
    staff: [
      'votre nom et votre adresse e-mail professionnelle, transmis par Google à la connexion ;',
      'votre profil (droits d’accès) dans l’établissement ;',
      'des journaux de sécurité : date et heure de connexion, adresse IP et type de navigateur lors de certains événements.',
    ],
  };
  section(
    'donnees',
    t('Quelles données sont gardées ?', 'Quelles données sont gardées ?'),
    [
      kind === 'foret' || kind === 'gl'
        ? 'Ton mot de passe n’est jamais gardé en clair : seule une empreinte chiffrée est conservée.'
        : '',
      kind === 'gl'
        ? 'En mode invité (« Découvrir sans compte »), aucune identité n’est demandée.'
        : '',
    ],
    collected[kind],
  );

  // --- Destinataires --------------------------------------------------------------------------
  const recipients = {
    foret: [
      'tes enseignants : ton profil, tes tâches, tes productions et tes statistiques ;',
      'les administrateurs du site, pour le faire fonctionner ;',
      'les autres élèves voient ton nom ou ton pseudo et ce que tu publies (forum, commentaires, observations partagées), jamais ton e-mail ni ton mot de passe.',
    ],
    gl: [
      'le maître du jeu (MJ) et les enseignants : ton profil, ta progression et tes productions ;',
      'les administrateurs du site, pour le faire fonctionner ;',
      'les autres joueurs voient ton pseudo et ce que tu publies dans la partie, jamais ton e-mail ni ton mot de passe.',
    ],
    plan: [
      'personne : le plan public ne garde aucune donnée qui vous concerne ;',
      'les administrateurs voient seulement le nombre d’ouvertures par jour.',
    ],
    staff: [
      'les administrateurs du site, qui attribuent les accès ;',
      'les autres personnels ne voient pas qui s’est connecté.',
    ],
  };
  const processors = [
    'l’hébergeur du site (serveurs et base de données) ;',
    kind === 'plan'
      ? ''
      : t(
          'Google, seulement si tu choisis « Continuer avec Google » ;',
          'Google, pour la connexion avec votre compte de l’établissement ;',
        ),
    kind === 'foret' || kind === 'gl'
      ? 'le service d’envoi d’e-mails, pour les liens de réinitialisation du mot de passe et certaines notifications ;'
      : '',
    kind === 'foret' || kind === 'gl'
      ? 'Moodle, la plateforme de l’établissement, si ton compte y est rattaché ;'
      : '',
    kind === 'foret'
      ? 'Pl@ntNet, qui reçoit une photo de plante — nettoyée de ses informations cachées, comme la position GPS — quand un enseignant demande une identification ;'
      : '',
    kind === 'foret'
      ? 'OpenAI, Trefle et GBIF, qui ne reçoivent que des noms d’espèces, jamais de donnée te concernant.'
      : '',
  ];
  section(
    'destinataires',
    t('Qui peut voir tes données ?', 'Qui peut voir ces données ?'),
    [],
    recipients[kind],
  );
  section(
    'sous-traitants',
    'Les prestataires techniques',
    [
      t(
        'Ils travaillent pour l’établissement et n’ont pas le droit d’utiliser tes données pour eux-mêmes :',
        'Ils travaillent pour l’établissement et n’ont pas le droit d’utiliser ces données pour eux-mêmes :',
      ),
      t(
        'Tes données ne sont jamais vendues, ni utilisées pour de la publicité.',
        'Ces données ne sont jamais vendues, ni utilisées pour de la publicité.',
      ),
    ],
    processors,
  );

  // --- Durées ---------------------------------------------------------------------------------
  const session = `la session de connexion : ${R.sessionMinutes / 60 === 1.5 ? '1 h 30' : `${R.sessionMinutes} minutes`}, prolongée tant que ${t('tu utilises', 'vous utilisez')} l’application, ${R.sessionMaxHours} heures au plus ;`;
  const securityYear = `les journaux de sécurité (connexions, adresses IP) : ${R.securityDays === 365 ? '1 an' : `${R.securityDays} jours`} ; l’adresse IP y est raccourcie au bout de ${R.ipFullDays === 90 ? '3 mois' : `${R.ipFullDays} jours`} ;`;
  const durations = {
    foret: [
      'ton compte et tes productions : tant que ton compte existe. Quand il est supprimé (à ta demande ou par l’établissement), ton profil, tes tâches, observations, messages et photos sont effacés ;',
      session,
      `les notifications : ${R.notificationsDays} jours ;`,
      `le journal d’activité : ${R.activityDays} jours ;`,
      securityYear,
      `les historiques du jardin : ${R.historyDays === 365 ? '1 an' : `${R.historyDays} jours`} ;`,
      `un lien de réinitialisation du mot de passe : ${R.passwordResetMinutes === 60 ? '1 heure' : `${R.passwordResetMinutes} minutes`} ;`,
      `la visite sans compte : la progression est retenue ${R.guestVisitHours} heures.`,
    ],
    gl: [
      'ton compte de joueur et ta progression : tant que ton compte existe ; ils sont effacés quand le compte est supprimé ;',
      session,
      `l’historique des parties : ${R.historyDays === 365 ? '1 an' : `${R.historyDays} jours`} ;`,
      securityYear,
      `un lien de réinitialisation du mot de passe : ${R.passwordResetMinutes === 60 ? '1 heure' : `${R.passwordResetMinutes} minutes`}.`,
    ],
    plan: [
      `le cookie du code d’accès, s’il y en a un : ${R.planAccessDays} jours ;`,
      `les compteurs anonymes (nombre d’ouvertures, recherches) : ${R.usageCountersDays === 365 ? '1 an' : `${R.usageCountersDays} jours`}.`,
    ],
    staff: [
      'votre accès : tant que votre compte existe ;',
      session,
      `le laissez-passer du plan des personnels : ${R.staffPlanAccessDays} jours ;`,
      securityYear,
    ],
  };
  section(
    'durees',
    'Combien de temps ?',
    [
      kind === 'plan'
        ? ''
        : 'Ce sont les durées prévues par défaut ; l’établissement peut les raccourcir.',
    ],
    durations[kind],
  );

  // --- Droits ---------------------------------------------------------------------------------
  const complaint = t(
    'Si tu penses que tes données ne sont pas respectées, tu peux adresser une réclamation à la CNIL (www.cnil.fr) ou à l’autorité de protection des données du pays où se trouve l’établissement.',
    'Si vous pensez que vos données ne sont pas respectées, vous pouvez adresser une réclamation à la CNIL (www.cnil.fr) ou à l’autorité de protection des données du pays où se trouve l’établissement.',
  );
  if (kind === 'plan') {
    section('droits', 'Vos droits', [
      'Le plan public ne garde rien qui vous identifie : il n’y a donc rien à consulter ni à effacer. Pour retirer le cookie du code d’accès, effacez les données du site dans votre navigateur.',
      complaint,
    ]);
  } else {
    section(
      'droits',
      t('Tes droits', 'Vos droits'),
      [
        t('Tu peux à tout moment :', 'Vous pouvez à tout moment :'),
        kind === 'staff'
          ? ''
          : 'Tes parents ou tes représentants légaux peuvent aussi t’aider à exercer ces droits.',
        complaint,
      ],
      [
        kind === 'staff'
          ? 'voir et récupérer vos données : demandez-les à un administrateur ;'
          : 'voir et récupérer tes données : dans « Mon profil », le bouton « Télécharger mes données » te donne une archive avec ce que l’application garde sur toi ;',
        t(
          'les corriger : tu peux modifier ton profil toi-même ; pour le reste, demande à un enseignant ;',
          'les corriger : demandez-le à un administrateur ;',
        ),
        t(
          'les faire effacer : demande à un enseignant ou à un administrateur de supprimer ton compte ;',
          'les faire effacer : demandez à un administrateur de supprimer votre accès ;',
        ),
        t(
          't’opposer à un traitement, ou demander qu’il soit limité, si tu as une raison particulière.',
          'vous opposer à un traitement, ou demander qu’il soit limité, pour une raison particulière.',
        ),
      ],
    );
  }

  // --- Stockage sur l'appareil ----------------------------------------------------------------
  const assets =
    externalAssetsMode === 'external'
      ? t(
          'Certaines polices et images sont chargées chez Google Fonts et Wikimedia : ces services voient alors l’adresse IP de ton appareil.',
          'Certaines polices et images sont chargées chez Google Fonts et Wikimedia : ces services voient alors l’adresse IP de votre appareil.',
        )
      : t(
          'Les polices et les images sont servies par le site lui-même : ton navigateur ne contacte ni Google ni Wikimedia.',
          'Les polices et les images sont servies par le site lui-même : votre navigateur ne contacte ni Google ni Wikimedia.',
        );
  const offline = clearLocalDataOnLogout
    ? 'elles sont effacées quand tu te déconnectes'
    : 'elles attendent ta prochaine connexion, même après une déconnexion';
  const storage = {
    foret: [
      '« foretmap_session » : ta session de connexion, effacée quand tu te déconnectes ;',
      'tes préférences : dernier onglet ouvert, carte choisie, aides déjà vues, taille du texte ;',
      `les actions faites sans connexion (tâche faite, observation, brouillon de carnet) en attente d’envoi, et les photos gardées pour un usage hors ligne : ${offline} ;`,
      `pendant une visite sans compte, un cookie retient ta progression ${R.guestVisitHours} heures.`,
    ],
    gl: [
      '« gl_session » : ta session de jeu, effacée quand tu te déconnectes ;',
      'tes préférences : dernier onglet ouvert, notifications déjà vues, nombre de dés virtuels, aides déjà vues.',
    ],
    plan: [
      'vos préférences : plan choisi, catégories affichées, aide déjà vue, orientation de la carte ;',
      'le cookie du code d’accès, seulement si le plan en demande un.',
    ],
    staff: [
      '« staffplan_auth_token » : votre session, effacée quand vous vous déconnectez ;',
      'le cookie du laissez-passer du plan des personnels ;',
      'vos préférences : plan choisi, catégories affichées, aide déjà vue.',
    ],
  };
  section(
    'appareil',
    t('Ce qui est gardé sur ton appareil', 'Ce qui est gardé sur votre appareil'),
    [
      t(
        'Le site range quelques informations dans ton navigateur pour fonctionner :',
        'Le site range quelques informations dans votre navigateur pour fonctionner :',
      ),
      'Aucun traceur publicitaire ni outil de mesure d’audience d’une autre entreprise n’est utilisé.',
      assets,
    ],
    storage[kind],
  );

  const intro = t(
    `Cette page explique simplement quelles informations ${productName} garde sur toi, pourquoi, qui peut les voir, combien de temps, et ce que tu peux demander. Tu peux la lire sans compte.`,
    `Cette page explique simplement quelles informations ${productName} garde, pourquoi, qui peut les voir, combien de temps, et ce que vous pouvez demander. Elle se lit sans compte.`,
  );
  const highlight = {
    foret:
      'À savoir d’abord : tes enseignants voient tes statistiques (tâches faites, progression, participation) et peuvent les exporter pour suivre la classe.',
    gl: 'À savoir d’abord : le maître du jeu et tes enseignants voient ta progression et tes résultats dans le jeu.',
    plan: '',
    staff: '',
  }[kind];

  return {
    product: kind,
    productName,
    title: 'Vos données',
    intro,
    highlight,
    sections,
  };
}
