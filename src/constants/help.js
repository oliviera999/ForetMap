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
    teacherLogin: {
      text: 'Se connecter avec un compte n3boss (professeur).',
      textTeacher: 'Se connecter avec un compte n3boss (professeur).',
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

/**
 * Défauts client des panneaux d'aide — **miroir strict de `data/help.default.json`**
 * (bloc `panels`). Un test de non-régression compare les deux au caractère près :
 * toute retouche ici doit être reportée à l'identique dans le JSON, et inversement.
 * Voir `tests/help-corpus-olu.test.js`.
 */
const HELP_PANELS = {
  map: {
    title: 'Aide carte',
    items: [
      {
        text: 'Commence par cliquer une zone ou un repère : la fiche te dit quoi observer et quoi y faire. C’est là que j’ai rangé l’essentiel.',
      },
      {
        text: 'Perdu ? + et − pour zoomer, ⊡ pour revenir à la vue complète. Tout le monde s’égare la première fois, moi le premier.',
      },
      {
        text: 'Sur mobile, le cadenas 🔒 fige les gestes. Utile quand la carte part en promenade dès qu’on la touche.',
      },
      {
        textTeacher:
          'Mode Zone ou Repère pour construire le terrain, puis retour en mode Nav. Rester en mode Repère pendant qu’on navigue est la meilleure façon de semer des points partout sans le vouloir.',
      },
    ],
  },
  tasks: {
    title: 'Aide tâches',
    items: [
      {
        text: 'Lis la consigne et regarde la carte liée avant de t’inscrire. Une tâche prise est une tâche que les autres ne prendront pas.',
      },
      {
        text: 'Une fois le travail terminé, envoie un retour : deux phrases et une photo suffisent. Sans retour, ce que tu as fait n’existe que pour toi.',
      },
      {
        textTeacher:
          'Traite d’abord les tâches en attente de validation : quelqu’un attend de l’autre côté. Les statuts s’ajustent ensuite, à tête reposée.',
      },
      {
        textTeacher:
          'Duplique les missions répétitives plutôt que de les retaper. Recopier est mon métier, pas le tien.',
      },
    ],
  },
  plants: {
    title: 'Aide biodiversité',
    items: [
      {
        text: 'Cherche un être vivant par son nom ou par son groupe — les deux mènent au même endroit.',
      },
      {
        text: 'Ouvre une fiche avant de partir : elle dit ce qu’il faut regarder, pas ce qu’il faut réciter.',
      },
      {
        textTeacher:
          'C’est toi qui enrichis et corriges les fiches. Je les range et je les ressors ; le contenu vient de toi.',
      },
    ],
  },
  visit: {
    title: 'Aide visite',
    items: [
      {
        text: 'Clique les zones et les repères pour ouvrir leurs fiches : la visite se parcourt dans l’ordre que tu veux.',
      },
      {
        text: 'Marque ce que tu as vu au fur et à mesure. Je tiens le compte pendant que tu marches.',
      },
      {
        textTeacher:
          '« Aperçu comme élève » montre le rendu réel côté n3beur. À regarder avant la sortie : sur le terrain, il est trop tard pour corriger un texte.',
      },
      {
        textTeacher:
          'Sélectionne les tutoriels utiles à la visite. Trois bien choisis valent mieux que douze qu’on survole.',
      },
    ],
  },
  profiles: {
    title: 'Aide profils et comptes',
    items: [
      {
        textTeacher:
          'Les profils RBAC règlent les permissions, le forum et les commentaires contextuels ; chaque compte porte un profil principal. C’est la page qui décide qui peut quoi — relis avant d’enregistrer.',
      },
      {
        textTeacher:
          '« Voir comme cet utilisateur », depuis « Modifier » un compte, ouvre l’application avec ses droits réels — pas une imitation. Le bandeau orange est ta porte de sortie ; tant qu’il est là, tu n’es pas chez toi.',
      },
    ],
  },
  groups: {
    title: 'Aide groupes et sous-groupes',
    items: [
      {
        textTeacher:
          'Un groupe, c’est une classe, une équipe ou une unité pédagogique. Un sous-groupe n’a rien de spécial : c’est un groupe à qui on a donné un parent.',
      },
      {
        textTeacher:
          '« Membres » désigne qui appartient au groupe, et qui en est responsable. Un groupe sans responsable fonctionne, mais personne n’y répond.',
      },
      {
        textTeacher:
          'Le périmètre cartes et projets fixe la portée par défaut du groupe. Sans périmètre, il reste utilisable partout — ce n’est pas un oubli, c’est un choix.',
      },
      {
        textTeacher:
          'Ce découpage se retrouve dans Tâches, Stats et Forum : un groupe bien nommé se retrouve partout, un groupe mal nommé aussi.',
      },
      {
        textTeacher:
          'Désactiver un groupe le retire des sélecteurs sans effacer son histoire. Je garde ce qui a été fait, même quand le groupe n’existe plus.',
      },
    ],
  },
  groupFilters: {
    title: 'Aide filtre groupe',
    items: [
      {
        textTeacher:
          'Ce filtre limite la vue au groupe choisi, et selon le contexte à ses sous-groupes. Rien n’est supprimé, seulement mis de côté.',
      },
      {
        textTeacher:
          'Dans les Tâches, une mission créée sans groupe reprend celui du filtre. Pratique — à condition de savoir quel filtre est actif.',
      },
      {
        textTeacher:
          'Dans les Stats, il cible les n3beurs du groupe. Comparer deux groupes est utile ; en conclure quelque chose sur les personnes, beaucoup moins.',
      },
    ],
  },
};

export { HELP_TOOLTIPS, HELP_PANELS, resolveRoleText };
