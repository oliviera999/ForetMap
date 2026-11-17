/**
 * Ligne d'édition d'une proposition de clé : énoncé, image et issue (couplet suivant,
 * espèce, groupe d'espèces, grand groupe), avec renvoi facultatif vers une autre clé.
 */
import { IconDelete } from '../../shared/icons.jsx';
import { ID_KEY_LEAD_OUTCOME_ENUM } from '../../shared/enums/pedagoEnums.js';
import { resolveLeadOutcome } from '../../shared/idKeyLeadCore.js';

/** Brouillon éditable à partir d'une proposition du bundle (tous les champs d'issue gardés). */
export function leadToDraft(lead = {}) {
  return {
    id: lead.id ?? null,
    statement: lead.statement || '',
    hint: lead.hint || '',
    image_url: lead.image_url || '',
    outcome: resolveLeadOutcome(lead) || 'couplet',
    next_couplet_id: lead.next_couplet_id || '',
    plant_id: lead.plant_id || '',
    clade_id: lead.clade_id || '',
    result_label: lead.result_label || '',
    group_plant_ids: Array.isArray(lead.group_plant_ids) ? lead.group_plant_ids.map(String) : [],
    next_key_id: lead.next_key_id || lead.next_key?.id || '',
  };
}

export function emptyLeadDraft() {
  return leadToDraft({});
}

const idOrNull = (v) => (v === '' || v == null ? null : Number(v));

/** Corps envoyé à `PUT …/leads` : seuls les champs utiles à l'issue choisie. */
export function draftToPayload(draft, index) {
  const o = draft.outcome;
  return {
    id: draft.id ?? undefined,
    statement: draft.statement,
    hint: draft.hint || null,
    image_url: draft.image_url || null,
    outcome: o,
    next_couplet_id: o === 'couplet' ? idOrNull(draft.next_couplet_id) : null,
    plant_id: o === 'espece' ? idOrNull(draft.plant_id) : null,
    clade_id: o === 'clade' || o === 'groupe' ? draft.clade_id || null : null,
    result_label: o === 'groupe' ? draft.result_label || null : null,
    group_plant_ids: o === 'groupe' ? draft.group_plant_ids.map(Number) : [],
    next_key_id: o === 'couplet' ? null : idOrNull(draft.next_key_id),
    sort_order: index,
  };
}

export function IdKeyLeadEditor({
  draft,
  onChange,
  onRemove,
  couplets,
  selectedCoupletId,
  plants,
  clades,
  keys,
  currentKeyId,
}) {
  const set = (patch) => onChange({ ...draft, ...patch });
  const plantOptions = (plants || []).slice(0, 400);
  return (
    <div className="id-key-editor__lead">
      <label>
        Énoncé
        <textarea
          value={draft.statement}
          onChange={(e) => set({ statement: e.target.value })}
          rows={2}
        />
      </label>
      <label>
        Aide (vocabulaire, mise en garde)
        <textarea value={draft.hint} onChange={(e) => set({ hint: e.target.value })} rows={2} />
      </label>
      <label>
        Image (URL)
        <input value={draft.image_url} onChange={(e) => set({ image_url: e.target.value })} />
      </label>
      <label>
        Mène à
        <select value={draft.outcome} onChange={(e) => set({ outcome: e.target.value })}>
          {ID_KEY_LEAD_OUTCOME_ENUM.values.map((value) => (
            <option key={value} value={value}>
              {ID_KEY_LEAD_OUTCOME_ENUM.labels[value]}
            </option>
          ))}
        </select>
      </label>

      {draft.outcome === 'couplet' ? (
        <label>
          Couplet suivant
          <select
            value={draft.next_couplet_id}
            onChange={(e) => set({ next_couplet_id: e.target.value })}
          >
            <option value="">—</option>
            {(couplets || [])
              .filter((c) => Number(c.id) !== Number(selectedCoupletId))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  Couplet {c.number}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      {draft.outcome === 'espece' ? (
        <label>
          Espèce
          <select value={draft.plant_id} onChange={(e) => set({ plant_id: e.target.value })}>
            <option value="">—</option>
            {plantOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {draft.outcome === 'groupe' ? (
        <>
          <label>
            Nom du groupe
            <input
              value={draft.result_label}
              onChange={(e) => set({ result_label: e.target.value })}
              placeholder="Ex. Goélands et mouettes"
            />
          </label>
          <label className="id-key-editor__group">
            Espèces candidates
            <select
              multiple
              value={draft.group_plant_ids}
              onChange={(e) =>
                set({ group_plant_ids: [...e.target.selectedOptions].map((o) => o.value) })
              }
            >
              {plantOptions.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {draft.outcome === 'groupe' || draft.outcome === 'clade' ? (
        <label>
          Grand groupe{draft.outcome === 'groupe' ? ' (facultatif)' : ''}
          <select value={draft.clade_id} onChange={(e) => set({ clade_id: e.target.value })}>
            <option value="">—</option>
            {(clades || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {draft.outcome !== 'couplet' ? (
        <label>
          Pour aller plus loin (autre clé)
          <select value={draft.next_key_id} onChange={(e) => set({ next_key_id: e.target.value })}>
            <option value="">—</option>
            {(keys || [])
              .filter((k) => Number(k.id) !== Number(currentKeyId))
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {k.title}
                  {!k.is_published ? ' (brouillon)' : ''}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      <button
        type="button"
        className="btn btn-sm"
        aria-label="Supprimer la proposition"
        onClick={onRemove}
      >
        <IconDelete size={14} />
      </button>
    </div>
  );
}
