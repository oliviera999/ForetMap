'use strict';

/**
 * Égalisation du temps de réponse des connexions (AC5, audit sécurité 2026-09-30).
 *
 * CDG-13 avait unifié les **messages** d'échec, pas les **temps** : un identifiant inconnu
 * répondait immédiatement, un compte existant après ~80 ms de bcrypt. L'écart suffisait à
 * énumérer les comptes. Quand il n'y a pas de hachage à vérifier (compte absent, compte sans
 * mot de passe), on compare donc contre ce hachage factice — même coût (facteur 10), résultat
 * toujours faux : aucun mot de passe connu ne lui correspond (sel et clair aléatoires).
 */

const bcrypt = require('bcryptjs');

const DUMMY_BCRYPT_HASH = '$2b$10$SHN1iXxRSv2AQdrrny6a6OxpUqcMc9fMKASNMYKZf7pIXiynjpWwq';

/**
 * Compare `password` au hachage du compte, ou au hachage factice s'il n'y en a pas.
 * @param {unknown} password mot de passe saisi
 * @param {string|null|undefined} passwordHash hachage du compte (absent = compte inconnu)
 * @returns {Promise<boolean>} `false` sans hachage réel, quelle que soit la saisie
 */
async function comparePasswordConstantTime(password, passwordHash) {
  const hash = typeof passwordHash === 'string' && passwordHash ? passwordHash : null;
  const ok = await bcrypt.compare(String(password ?? ''), hash || DUMMY_BCRYPT_HASH);
  return hash ? ok : false;
}

module.exports = { DUMMY_BCRYPT_HASH, comparePasswordConstantTime };
