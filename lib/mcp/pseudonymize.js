'use strict';

/**
 * Pseudonymisation des journaux et diagnostics transmis par le connecteur MCP
 * (`foretmap_tail_logs`, `foretmap_diagnostics`) — relecture de sécurité de la PR #616, I2.
 *
 * Les lignes Pino portent des identifiants de comptes (`userId`, `studentId`, `actorUserId`…,
 * souvent des UUID) et parfois des adresses IP. Elles sont remplacées par un **pseudonyme
 * stable au sein d'un même appel** (`user#3f2a91`, `ip#7c01d4`) : la même valeur donne le même
 * pseudonyme dans la réponse, ce qui garde la corrélation utile au diagnostic (« le même
 * compte échoue trois fois »), mais le pseudonyme est un HMAC tronqué avec un **sel aléatoire
 * tiré à chaque appel** et jamais conservé : impossible de le relier à un compte, ni d'un
 * appel à l'autre.
 *
 * Remplacés :
 * - tout UUID (8-4-4-4-12), quel que soit le champ ;
 * - la valeur des clés dont le nom désigne une personne ou un compte (`*user_id`, `*UserId`,
 *   `studentId`, `teacherId`, `playerId`, `actorId`, `adminId`, `accountId`, `ownerId`,
 *   `userId`, `clientId`…) même quand ce n'est pas un UUID (identifiants entiers G&L) ;
 * - les adresses IPv4 et IPv6 ;
 * - puis le masquage existant des e-mails, hachages et jetons (`scrubString`).
 */

const crypto = require('node:crypto');
const net = require('node:net');
const { scrubString } = require('./sqlGuard');

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const IPV4_RE = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
// Candidats IPv6 (hexadécimal et « : », au moins deux « : »), confirmés par `net.isIP` : une
// heure « 12:30:45 » n'est pas une adresse et reste intacte.
const IPV6_CANDIDATE_RE = /[0-9a-f:]*:[0-9a-f:]*:[0-9a-f:.]*/gi;
const PERSON_KEY_RE =
  /^(?:.*_?user_?id|.*userid|student_?id|teacher_?id|player_?id|actor_?id|admin_?id|account_?id|owner_?id|target_?id|client_?id|canonical_?user_?id|linked_?\w*_?id|validated_?by|created_?by|uid|sub)$/i;

function createPseudonymizer() {
  const salt = crypto.randomBytes(16);
  const cache = new Map();
  const tag = (kind, value) => {
    const key = `${kind}:${value}`;
    if (!cache.has(key)) {
      const h = crypto.createHmac('sha256', salt).update(key).digest('hex').slice(0, 6);
      cache.set(key, `${kind}#${h}`);
    }
    return cache.get(key);
  };

  function pseudoString(text) {
    const replaced = String(text)
      .replace(UUID_RE, (m) => tag('user', m.toLowerCase()))
      .replace(IPV4_RE, (m) => tag('ip', m))
      .replace(IPV6_CANDIDATE_RE, (m) => (net.isIP(m) === 6 ? tag('ip', m.toLowerCase()) : m));
    return scrubString(replaced);
  }

  /** Copie pseudonymisée d'une valeur (objet JSON, ligne de journal texte…). */
  function pseudoValue(value, depth = 0) {
    if (depth > 12 || value == null) return value;
    if (typeof value === 'string') return pseudoString(value);
    if (Array.isArray(value)) return value.map((v) => pseudoValue(v, depth + 1));
    if (typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (PERSON_KEY_RE.test(k) && (typeof v === 'string' || typeof v === 'number')) {
          out[k] = tag('user', String(v));
        } else if (/^(?:ip|ip_?address|remote_?addr|x_?forwarded_?for)$/i.test(k) && v != null) {
          out[k] = tag('ip', String(v));
        } else {
          out[k] = pseudoValue(v, depth + 1);
        }
      }
      return out;
    }
    return value;
  }

  /** Ligne de journal Pino : JSON pseudonymisé clé par clé, sinon texte. */
  function pseudoLogLine(line) {
    const text = String(line);
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return JSON.stringify(pseudoValue(parsed));
    } catch {
      /* ligne non JSON : traitée comme texte */
    }
    return pseudoString(text);
  }

  return { pseudoLogLine, pseudoString, pseudoValue };
}

module.exports = { createPseudonymizer };
