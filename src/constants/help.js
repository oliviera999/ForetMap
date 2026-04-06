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
      text:
        'Fin de la prise de contrôle : tu retrouves ton compte admin et tes droits (diagnostic ou support terminé).',
      textTeacher:
        'Fin de la prise de contrôle : tu retrouves ton compte admin. À utiliser quand le diagnostic ou le support est terminé.',
    },
  },
  map: {
    toggleGestures: { text: 'Autoriser ou figer les gestes sur la carte (pratique si ça bouge trop).' },
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
        text: 'Appuie sur une zone ou un repère pour ouvrir sa fiche.',
      },
      {
        text: 'Utilise + et − pour zoomer, puis ⊡ pour recentrer.',
      },
      {
        text: 'Si la page bouge trop, verrouille les gestes avec le bouton cadenas.',
      },
      {
        textTeacher: 'En mode n3boss, tu peux ajouter des zones et des repères.',
      },
    ],
  },
  tasks: {
    title: 'Aide tâches',
    items: [
      {
        text: 'Lis la consigne, puis prends la mission si tu veux t’en charger.',
      },
      {
        text: 'Quand c’est fait, envoie un rapport : un mot, une photo, tout aide l’équipe.',
      },
      {
        textTeacher: 'En mode n3boss, tu coches les retours et tu fais avancer les statuts.',
      },
      {
        textTeacher: 'Tu peux modifier, dupliquer ou supprimer une tâche.',
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
        text: 'Clique une zone ou un repère pour afficher sa fiche.',
      },
      {
        text: 'Coche ce que tu as déjà vu : ta progression s’en souvient.',
      },
      {
        textTeacher: 'En mode n3boss, tu peux modifier le contenu de visite.',
      },
      {
        textTeacher: 'Tu choisis aussi quels tutoriels sont visibles pendant la visite.',
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
};

export { HELP_TOOLTIPS, HELP_PANELS, resolveRoleText };
