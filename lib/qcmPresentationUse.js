'use strict';

/**
 * Consommation à usage unique d'une présentation de QCM en partie.
 *
 * Le `presentationToken` reste valable 15 minutes : sans trace de son usage, la même
 * requête de réponse — légitime, signée, non modifiée — pouvait être rejouée en boucle
 * et créditer l'équipe à chaque fois (audit docs/AUDIT_APP_ET_JEU_2026-08.md §6.2 b).
 *
 * L'unicité est portée par la clé primaire de `gl_qcm_presentation_uses` : c'est la base
 * qui arbitre, donc deux réponses simultanées ne peuvent pas passer toutes les deux. À
 * appeler dans la transaction qui attribue le score, avant celle-ci.
 */

/**
 * @param {{ execute: Function }} tx transaction porteuse de l'attribution de score
 * @returns {Promise<'consumed'|'already_used'>}
 */
async function consumePresentationJti(tx, { jti, gameId, teamId, questionCode }) {
  const tokenJti = String(jti || '').trim();
  if (!tokenJti) {
    const err = new Error('Token de présentation invalide (jti manquant)');
    err.status = 400;
    throw err;
  }
  try {
    await tx.execute(
      `INSERT INTO gl_qcm_presentation_uses (jti, game_id, team_id, question_code, used_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [tokenJti, gameId, teamId == null ? null : Number(teamId), String(questionCode || '')],
    );
    return 'consumed';
  } catch (err) {
    if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) return 'already_used';
    throw err;
  }
}

/**
 * Invités G&L (`gl_guest`, audit sécurité 2026-09-30, GL8 / M5) : rien n'est écrit en base.
 *
 * Les jetons invités se créent à volonté et `gl_qcm_presentation_uses` n'est jamais purgée :
 * chaque réponse d'invité y laissait une ligne. L'usage unique reste pourtant utile (sans lui,
 * un même jeton permet d'essayer tous les `choiceId`) : il est tenu ici EN MÉMOIRE, borné en
 * taille et en durée (celle du jeton, 15 min). Un redémarrage l'oublie — sans enjeu : un
 * invité ne marque aucun point et n'enregistre aucune tentative.
 */
const GUEST_JTI_TTL_MS = 15 * 60 * 1000;
const GUEST_JTI_MAX_ENTRIES = 20000;
const guestJtiSeen = new Map();

function pruneGuestJtis(now) {
  for (const [key, expiresAt] of guestJtiSeen) {
    if (expiresAt > now && guestJtiSeen.size <= GUEST_JTI_MAX_ENTRIES) break;
    guestJtiSeen.delete(key);
  }
}

/** @returns {'consumed'|'already_used'} */
function consumeGuestPresentationJti(jti, now = Date.now()) {
  const tokenJti = String(jti || '').trim();
  if (!tokenJti) {
    const err = new Error('Token de présentation invalide (jti manquant)');
    err.status = 400;
    throw err;
  }
  pruneGuestJtis(now);
  const expiresAt = guestJtiSeen.get(tokenJti);
  if (expiresAt && expiresAt > now) return 'already_used';
  guestJtiSeen.set(tokenJti, now + GUEST_JTI_TTL_MS);
  return 'consumed';
}

function isGlGuestAuth(glAuth) {
  return String(glAuth?.userType || '').toLowerCase() === 'gl_guest';
}

/**
 * Consommation d'une présentation HORS partie : en base pour un compte, en mémoire pour un
 * invité (GL8).
 */
async function consumeFreePresentationJti(db, { glAuth, jti, questionCode }) {
  if (isGlGuestAuth(glAuth)) return consumeGuestPresentationJti(jti);
  return consumePresentationJti(db, { jti, gameId: null, teamId: null, questionCode });
}

module.exports = {
  consumePresentationJti,
  consumeGuestPresentationJti,
  consumeFreePresentationJti,
  isGlGuestAuth,
};
