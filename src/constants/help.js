function resolveRoleText(entry, isTeacher) {
  if (!entry) return '';
  if (isTeacher && entry.textTeacher) return entry.textTeacher;
  return entry.text || '';
}

const HELP_TOOLTIPS = {
  header: {
    userBadge: {
      text: 'Voir ta progression et tes stats — petit bilan perso.',
      textTeacher: 'Voir où en sont les n3beurs (stats collectives).',
    },
    profileEdit: { text: 'Ajuster ton profil (pseudo, avatar, etc.).' },
    roleReset: { textTeacher: 'Revenir à ton affichage habituel.' },
    roleStudent: { textTeacher: 'Voir l’app comme un n3beur (aperçu).' },
    roleTeacher: { textTeacher: 'Voir l’app comme un n3boss (aperçu).' },
    elevatedMode: {
      text: 'Mode n3boss : plus de boutons utiles pour la coordination.',
      textTeacher: 'Activer ou couper les droits étendus (PIN).',
    },
    logout: { text: 'Quitter ForetMap proprement.' },
    notifications: { text: 'Nouvelles infos, rappels et petites alertes utiles.' },
    impersonationStop: {
      text: 'Fin de la prise de contrôle : tu retrouves ton compte admin et tes droits (diagnostic ou support terminé).',
      textTeacher:
        'Fin de la prise de contrôle : tu retrouves ton compte admin. À utiliser quand le diagnostic ou le support est terminé.',
    },
  },
  map: {
    toggleGestures: {
      text: 'Autoriser ou figer les gestes sur la carte (pratique si ça bouge trop).',
    },
    toggleLabels: { text: 'Afficher ou masquer les noms sur la carte.' },
    zoomIn: { text: 'Zoomer pour voir le détail.' },
    zoomOut: { text: 'Dézoomer pour voir plus large.' },
    zoomReset: { text: 'Revenir à la vue complète d’un coup.' },
  },
  tasks: {
    edit: { textTeacher: 'Modifier cette tâche.' },
    duplicate: { textTeacher: 'Dupliquer cette tâche (copie rapide).' },
    delete: { textTeacher: 'Supprimer définitivement cette tâche.' },
  },
  plants: {
    edit: { textTeacher: 'Modifier cette fiche biodiversité.' },
    delete: { textTeacher: 'Supprimer cette fiche biodiversité.' },
  },
  visit: {
    mediaDelete: { textTeacher: 'Retirer cette photo de la visite.' },
  },
  profiles: {
    impersonateUser: {
      textTeacher:
        'Ouvre une session réelle comme cet utilisateur (identité effective côté serveur). Un bandeau orange permet de revenir au compte admin. Réservé à la permission admin.impersonate.',
    },
  },
};

const HELP_PANELS = {
  map: {
    title: 'Aide carte',
    items: [
      {
        text: 'Commence par cliquer une zone ou un repère : la fiche te montre quoi observer et quoi faire.',
      },
      {
        text: 'Si tu es perdu, fais + ou − pour zoomer puis ⊡ pour revenir à la vue complète.',
      },
      {
        text: 'Sur mobile, verrouille les gestes avec 🔒 pour éviter les déplacements involontaires.',
      },
      {
        textTeacher:
          'En mode n3boss, passe en mode Zone ou Repère pour créer le terrain, puis reviens en mode Nav.',
      },
    ],
  },
  tasks: {
    title: 'Aide tâches',
    items: [
      {
        text: 'Lis d abord la consigne et la carte liée, puis inscris-toi seulement quand tu peux vraiment la prendre.',
      },
      {
        text: 'Quand c est fait, envoie un retour clair (texte + photo si possible) pour faciliter la validation.',
      },
      {
        textTeacher:
          'Côté n3boss : traite d abord les tâches en attente de validation, puis ajuste les statuts.',
      },
      {
        textTeacher:
          'Tu peux aussi dupliquer une tâche pour gagner du temps sur les missions répétitives.',
      },
    ],
  },
  plants: {
    title: 'Aide biodiversité',
    items: [
      {
        text: 'Cherche un être vivant par nom ou par groupe.',
      },
      {
        text: 'Ouvre une fiche pour les infos utiles sur le terrain.',
      },
      {
        textTeacher: 'En mode n3boss, tu enrichis et mets à jour les fiches.',
      },
    ],
  },
  visit: {
    title: 'Aide visite',
    items: [
      {
        text: 'Explore la carte en cliquant les zones et repères pour ouvrir leurs fiches.',
      },
      {
        text: 'Marque ce que tu as déjà vu : la progression se met à jour automatiquement.',
      },
      {
        textTeacher:
          'En mode n3boss, utilise "Aperçu comme élève" pour vérifier ce que les élèves verront vraiment.',
      },
      {
        textTeacher:
          'Pense à sélectionner les tutoriels utiles à la visite pour guider le parcours sur le terrain.',
      },
    ],
  },
  profiles: {
    title: 'Aide profils et comptes',
    items: [
      {
        textTeacher:
          'Gère les profils RBAC (permissions, PIN, forum, commentaires contextuels) et rattache un profil principal à chaque compte.',
      },
      {
        textTeacher:
          'Prise de contrôle : depuis « Modifier » un compte, « Voir comme cet utilisateur » reproduit l’expérience réelle de ce n3beur ou n3boss ; le bandeau te ramène à ton compte admin.',
      },
    ],
  },
  groups: {
    title: 'Aide groupes et sous-groupes',
    items: [
      {
        textTeacher:
          'Un groupe représente une classe, équipe ou unité pédagogique. Un sous-groupe est simplement un groupe avec un parent.',
      },
      {
        textTeacher:
          'Le bouton « Membres » permet de choisir qui appartient au groupe, et qui est responsable (manager).',
      },
      {
        textTeacher:
          'Le périmètre cartes/projets définit la portée par défaut du groupe. Sans scope, le groupe reste utilisable globalement.',
      },
      {
        textTeacher:
          'Les filtres groupe sont repris dans Tâches, Stats et Forum pour cibler rapidement les actions et les lectures.',
      },
      {
        textTeacher:
          'Quand un groupe est désactivé, il n’est plus proposé dans les sélecteurs, mais l’historique reste conservé.',
      },
    ],
  },
  groupFilters: {
    title: 'Aide filtre groupe',
    items: [
      {
        textTeacher:
          'Utilise ce filtre pour limiter la vue au groupe choisi (et ses sous-groupes selon le contexte).',
      },
      {
        textTeacher:
          'Dans les Tâches, une nouvelle mission reprend automatiquement le groupe filtré si aucun groupe n’est précisé.',
      },
      {
        textTeacher:
          'Dans les Stats, ce filtre cible le suivi des n3beurs du groupe pour comparer plus facilement les progressions.',
      },
    ],
  },
};

export { HELP_TOOLTIPS, HELP_PANELS, resolveRoleText };
