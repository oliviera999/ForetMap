// Identifiants restitués par la création / l'import de joueurs GL (logique pure, sans React).
//
// Le serveur ne renvoie un mot de passe en clair qu'UNE fois, dans la réponse de création ou le
// rapport d'import (`credentials`) : rien n'est stocké en clair. Ce module met en forme cette
// liste pour l'affichage et la distribution (CSV à imprimer / coller dans un tableur).

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * Libellé d'état d'un identifiant créé.
 * @param {{ reusedExisting?: boolean, generated?: boolean, emailConflict?: boolean }} entry
 */
export function credentialStatusLabel(entry) {
  if (entry?.reusedExisting) return 'Compte ForetMap existant (mot de passe conservé)';
  if (entry?.generated) return 'Mot de passe généré';
  return 'Mot de passe du fichier';
}

/**
 * CSV (séparateur `;`, BOM pour Excel) des identifiants à distribuer.
 * @param {Array<object>} credentials
 * @returns {string}
 */
export function buildCredentialsCsv(credentials) {
  const rows = Array.isArray(credentials) ? credentials : [];
  const header = ['Prénom', 'Nom', 'Classe', 'Pseudo', 'Mot de passe', 'Statut'].join(';');
  const lines = rows.map((entry) =>
    [
      entry.firstName || '',
      entry.lastName || '',
      entry.className || '',
      entry.pseudo || '',
      entry.password || '',
      credentialStatusLabel(entry),
    ]
      .map(csvEscape)
      .join(';'),
  );
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
}

/** Nombre d'identifiants dont le mot de passe doit réellement être distribué. */
export function countDistributablePasswords(credentials) {
  return (Array.isArray(credentials) ? credentials : []).filter((c) => !!c.password).length;
}
