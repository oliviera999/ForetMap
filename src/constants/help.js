function resolveRoleText(entry, isTeacher) {
  if (!entry) return '';
  if (isTeacher && entry.textTeacher) return entry.textTeacher;
  return entry.text || '';
}

const HELP_TOOLTIPS = {
  header: {
    userBadge: {
      text: 'Voir ta progression et tes statistiques.',
      textTeacher: 'Ouvrir les statistiques des n3beurs.',
    },
    profileEdit: { text: 'Modifier ton profil.' },
    roleReset: { textTeacher: 'Revenir au role normal.' },
    roleStudent: { textTeacher: 'Afficher l app comme un n3beur.' },
    roleTeacher: { textTeacher: 'Afficher l app comme un n3boss.' },
    elevatedMode: {
      text: 'Mode n3boss avec plus de droits.',
      textTeacher: 'Activer ou couper les droits etendus.',
    },
    logout: { text: 'Se deconnecter de ForetMap.' },
    notifications: { text: 'Nouvelles infos et rappels importants.' },
    impersonationStop: {
      text:
        'Quitte la prise de contrôle : tu retrouves ton compte administrateur et tes droits (diagnostic ou support terminé).',
      textTeacher:
        'Quitte la prise de contrôle : tu retrouves ton compte administrateur et tes droits. À utiliser quand le diagnostic ou le support est terminé.',
    },
  },
  map: {
    toggleGestures: { text: 'Activer ou bloquer les gestes sur la carte.' },
    toggleLabels: { text: 'Afficher ou masquer les noms.' },
    zoomIn: { text: 'Zoomer la carte.' },
    zoomOut: { text: 'Dezoomer la carte.' },
    zoomReset: { text: 'Revenir a la vue complete.' },
  },
  tasks: {
    edit: { textTeacher: 'Modifier cette tache.' },
    duplicate: { textTeacher: 'Creer une copie de cette tache.' },
    delete: { textTeacher: 'Supprimer definitivement cette tache.' },
  },
  plants: {
    edit: { textTeacher: 'Modifier cette fiche biodiversite.' },
    delete: { textTeacher: 'Supprimer cette fiche biodiversite.' },
  },
  visit: {
    mediaDelete: { textTeacher: 'Supprimer cette photo.' },
  },
  profiles: {
    impersonateUser: {
      textTeacher:
        'Ouvre une session réelle comme cet utilisateur (identité effective côté serveur). Un bandeau orange permet ensuite de revenir au compte admin. Réservé aux comptes avec la permission admin.impersonate.',
    },
  },
};

const HELP_PANELS = {
  map: {
    title: 'Aide carte',
    items: [
      {
        text: 'Appuie sur une zone ou un repere pour voir ses details.',
      },
      {
        text: 'Utilise + et - pour zoomer, puis ⊡ pour recentrer.',
      },
      {
        text: 'Si la page bouge, active les gestes carte avec le bouton cadenas.',
      },
      {
        textTeacher: 'En mode n3boss, tu peux ajouter des zones et des reperes.',
      },
    ],
  },
  tasks: {
    title: 'Aide taches',
    items: [
      {
        text: 'Lis bien la consigne avant de prendre une tache.',
      },
      {
        text: 'Quand tu as fini, envoie un rapport avec un commentaire ou une photo.',
      },
      {
        textTeacher: 'En mode n3boss, valide les taches terminees et gere les statuts.',
      },
      {
        textTeacher: 'Tu peux modifier, dupliquer ou supprimer une tache.',
      },
    ],
  },
  plants: {
    title: 'Aide biodiversite',
    items: [
      {
        text: 'Cherche un etre vivant par nom ou par groupe.',
      },
      {
        text: 'Ouvre une fiche pour voir ses infos utiles.',
      },
      {
        textTeacher: 'En mode n3boss, ajoute et mets a jour les fiches biodiversite.',
      },
    ],
  },
  visit: {
    title: 'Aide visite',
    items: [
      {
        text: 'Clique une zone ou un repere pour afficher sa fiche.',
      },
      {
        text: 'Marque ce que tu as deja vu pour suivre ta progression.',
      },
      {
        textTeacher: 'En mode n3boss, tu peux modifier le contenu de visite.',
      },
      {
        textTeacher: 'Tu peux aussi choisir les tutoriels visibles pendant la visite.',
      },
    ],
  },
  profiles: {
    title: 'Aide profils et utilisateurs',
    items: [
      {
        textTeacher:
          'Gère les profils RBAC (permissions, PIN, forum, commentaires contextuels) et attribue un profil principal à chaque compte.',
      },
      {
        textTeacher:
          'Prise de contrôle : depuis « Modifier » un compte, « Voir comme cet utilisateur » reproduit l’expérience réelle de ce n3beur ou n3boss ; utilise le bandeau pour revenir à ton compte admin.',
      },
    ],
  },
};

export { HELP_TOOLTIPS, HELP_PANELS, resolveRoleText };
