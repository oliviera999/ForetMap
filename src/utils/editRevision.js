/**
 * Côté client du verrou optimiste des fiches éditées par les profs (`lib/editRevision.js`).
 *
 * Une « session d'édition » par fiche ouverte : elle retient la révision de départ, l'envoie
 * avec chaque enregistrement (`expected_revision`) et adopte celle que renvoie le serveur, pour
 * que les enregistrements successifs d'un même formulaire (automatique puis bouton) ne se
 * prennent pas pour des conflits. Les envois sont mis en file : deux enregistrements partis
 * ensemble de la même révision se contrediraient.
 *
 * En cas de conflit (409 `edit_conflict`), le prof choisit : écraser la version de l'autre, ou
 * renoncer — la session refuse alors tout nouvel enregistrement, pour ne pas reposer la
 * question à chaque frappe, jusqu'à ce que la fiche soit rouverte.
 */

export const EDIT_CONFLICT_CODE = 'edit_conflict';

export const EDIT_CONFLICT_PROMPT =
  'Quelqu’un d’autre a enregistré cette fiche depuis que vous l’avez ouverte. Enregistrer quand même remplacera sa version par la vôtre.';

export const EDIT_CONFLICT_DECLINED_MESSAGE =
  'Non enregistré : la fiche a été modifiée ailleurs. Fermez-la et rouvrez-la pour repartir de la version à jour.';

/** Options du dialogue de confirmation (`useAppDialogs().confirm`). */
export const EDIT_CONFLICT_CONFIRM_OPTIONS = Object.freeze({
  title: 'Fiche modifiée entre-temps',
  message: EDIT_CONFLICT_PROMPT,
  confirmLabel: 'Écraser sa version',
  cancelLabel: 'Ne pas enregistrer',
  danger: true,
});

/** Erreur `api()` d'un refus pour modification concurrente. */
export function isEditConflictError(err) {
  return Number(err?.status) === 409 && err?.body?.code === EDIT_CONFLICT_CODE;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Corps d'enregistrement accompagné de la révision attendue (inchangé si elle est inconnue). */
export function withExpectedRevision(body, revision) {
  const r = normalizeRevision(revision);
  return r === null ? body : { ...(body || {}), expected_revision: r };
}

/**
 * @param {number|string|null|undefined} initialRevision révision de la fiche à l'ouverture
 * @param {object} [options]
 * @param {() => Promise<boolean>} [options.confirmOverwrite] demande au prof s'il écrase ;
 *   absente, un conflit est refusé
 */
export function createEditRevisionSession(initialRevision, { confirmOverwrite } = {}) {
  let revision = normalizeRevision(initialRevision);
  let declined = false;
  let chain = Promise.resolve();

  const adopt = (response) => {
    const next = normalizeRevision(response?.edit_revision);
    if (next !== null) revision = next;
    return response;
  };

  /**
   * @template R
   * @param {(expectedRevision: number|null) => Promise<R>} send envoi ; `null` = sans contrôle
   * @returns {Promise<R>}
   */
  function save(send) {
    const run = chain.then(async () => {
      if (declined) throw new Error(EDIT_CONFLICT_DECLINED_MESSAGE);
      try {
        return adopt(await send(revision));
      } catch (err) {
        if (!isEditConflictError(err)) throw err;
        const overwrite = confirmOverwrite ? await confirmOverwrite() : false;
        if (!overwrite) {
          declined = true;
          throw new Error(EDIT_CONFLICT_DECLINED_MESSAGE);
        }
        return adopt(await send(null));
      }
    });
    chain = run.catch(() => undefined);
    return run;
  }

  return {
    save,
    get revision() {
      return revision;
    },
    get declined() {
      return declined;
    },
  };
}
