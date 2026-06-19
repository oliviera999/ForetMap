import React from 'react';
import { toMascotPackIssueLines } from '../../utils/mascotPackValidationUi.js';

/**
 * Colonne de gauche du gestionnaire de packs mascotte : présentation/aide,
 * création (brouillon, modèles catalogue, copie), liste des packs, panneau du
 * pack sélectionné (libellé, enregistrer/publier/supprimer, validation,
 * avertissements) et bloc d'erreur d'action. Présentation pure prop-driven :
 * tout l'état et les actions (api) restent dans le parent.
 * @param {{
 *   mapTitle: string,
 *   actionBusy: boolean,
 *   catalogModelOptions: Array<{ id: string, label: string }>,
 *   selectedCatalogModelId: string,
 *   onSelectCatalogModel: (id: string) => void,
 *   findPackForCatalogModel: (modelId: string) => Record<string, unknown> | null,
 *   onNewDraft: () => void,
 *   onOpenCatalogModelForEdit: (modelId: string) => void,
 *   onNewFromCatalog: () => void,
 *   onRefresh: () => void,
 *   onDuplicateSelected: () => void,
 *   listError: string,
 *   loading: boolean,
 *   packs: Array<Record<string, unknown>>,
 *   selectedId: string | null,
 *   onSelectPack: (id: string) => void,
 *   selectedRow: Record<string, unknown> | undefined,
 *   labelDraft: string,
 *   onLabelDraftChange: (value: string) => void,
 *   onSave: () => void,
 *   onTogglePublish: () => void,
 *   onDelete: () => void,
 *   selectedValidation: { ok: boolean },
 *   editorWarnings: string[],
 *   isDirty?: boolean,
 *   actionError: string,
 *   actionIssues: Array<Record<string, unknown>>,
 * }} props
 */
export default function MascotPackListAside({
  mapTitle,
  actionBusy,
  catalogModelOptions,
  selectedCatalogModelId,
  onSelectCatalogModel,
  findPackForCatalogModel,
  onNewDraft,
  onOpenCatalogModelForEdit,
  onNewFromCatalog,
  onRefresh,
  onDuplicateSelected,
  listError,
  loading,
  packs,
  selectedId,
  onSelectPack,
  selectedRow,
  labelDraft,
  onLabelDraftChange,
  onSave,
  onTogglePublish,
  onDelete,
  selectedValidation,
  editorWarnings,
  isDirty = false,
  actionError,
  actionIssues,
}) {
  return (
    <aside
      className="visit-mascot-pack-manager__aside"
      style={{
        flex: '0 0 280px',
        minWidth: 240,
        borderRight: '1px solid rgba(26,71,49,0.15)',
        paddingRight: 12,
      }}
    >
      <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Packs mascotte</h2>
      <p className="section-sub" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
        Carte : <strong>{mapTitle}</strong>
        <br />
        Les packs <strong>publiés</strong> apparaissent sur la visite (sélecteur mascotte).
        <br />
        Les <strong>modèles intégrés</strong> (SPR0UT, Renard 2, …) ne se modifient pas directement
        : utilisez <strong>Éditer sur cette carte</strong> pour ouvrir une copie modifiable
        (sprites, comportements).
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={actionBusy}
          onClick={onNewDraft}
        >
          Nouveau brouillon
        </button>
        <div style={{ width: '100%' }}>
          <p className="section-sub" style={{ fontSize: '0.78rem', margin: '4px 0 6px' }}>
            Modèles intégrés (catalogue)
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 8,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {catalogModelOptions.map((opt) => {
              const linkedPack = findPackForCatalogModel(opt.id);
              return (
                <li key={opt.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${selectedCatalogModelId === opt.id ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                    aria-pressed={selectedCatalogModelId === opt.id}
                    onClick={() => onSelectCatalogModel(opt.id)}
                    disabled={actionBusy}
                  >
                    {opt.label}
                    {linkedPack ? (
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.72rem',
                          opacity: 0.85,
                          fontWeight: 400,
                        }}
                      >
                        Copie sur carte : {linkedPack.label || linkedPack.catalog_id}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%' }}
                    disabled={actionBusy}
                    onClick={() => onOpenCatalogModelForEdit(opt.id)}
                    title={
                      linkedPack
                        ? 'Ouvrir la copie modifiable déjà créée pour cette carte'
                        : 'Créer puis ouvrir une copie modifiable de ce modèle'
                    }
                  >
                    {linkedPack ? 'Éditer la copie' : 'Éditer sur cette carte'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={actionBusy || !selectedCatalogModelId}
          onClick={onNewFromCatalog}
          title="Créer un second pack indépendant depuis le modèle sélectionné"
        >
          Nouvelle copie depuis ce modèle
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={actionBusy}
          onClick={onRefresh}
        >
          Actualiser
        </button>
      </div>
      {selectedId ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 10 }}
          disabled={actionBusy}
          onClick={onDuplicateSelected}
        >
          Dupliquer le pack sélectionné
        </button>
      ) : null}
      {listError ? (
        <p className="text-danger" role="alert" style={{ fontSize: '0.85rem' }}>
          {listError}
        </p>
      ) : null}
      {loading ? <p className="section-sub">Chargement…</p> : null}
      {!loading && packs.length === 0 ? (
        <p className="section-sub">
          Aucun pack pour la carte <strong>{mapTitle}</strong> — créez un brouillon ou changez de
          carte dans l’onglet studio.
        </p>
      ) : null}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {packs.map((p) => (
          <li key={p.id} style={{ marginBottom: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${selectedId === p.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
              aria-pressed={selectedId === p.id}
              aria-label={`Ouvrir le pack ${p.label || p.catalog_id}`}
              onClick={() => onSelectPack(p.id)}
            >
              <span style={{ display: 'block', fontWeight: 600 }}>{p.label || p.catalog_id}</span>
              <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.85 }}>
                {p.is_published ? 'Publié' : 'Brouillon'}
                {' · v'}
                {Number(p.pack?.mascotPackVersion) === 2 ? '2' : '1'}
                {' · '}
                {p.catalog_id}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selectedId ? (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isDirty ? (
            <p
              className="visit-mascot-pack-manager__dirty-banner"
              role="status"
              aria-live="polite"
            >
              <span className="visit-mascot-pack-manager__dirty-dot" aria-hidden="true" />
              Modifications non enregistrées
            </p>
          ) : null}
          <label>
            <span
              className="section-sub"
              style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}
            >
              Libellé (liste)
            </span>
            <input
              className="form-input"
              value={labelDraft}
              onChange={(ev) => onLabelDraftChange(ev.target.value)}
              placeholder="Nom du pack"
            />
          </label>
          <button
            type="button"
            className={`btn btn-primary btn-sm${isDirty ? ' visit-mascot-pack-manager__save--dirty' : ''}`}
            disabled={actionBusy || !selectedValidation.ok}
            title={
              selectedValidation.ok
                ? 'Enregistrer les modifications sur le serveur'
                : 'Corrigez les erreurs de validation avant enregistrement'
            }
            onClick={onSave}
          >
            Enregistrer sur le serveur
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={actionBusy || !selectedValidation.ok}
            title={
              selectedValidation.ok
                ? undefined
                : 'Corrigez les erreurs de validation avant publication'
            }
            onClick={onTogglePublish}
          >
            {selectedRow?.is_published ? 'Retirer de la visite publique' : 'Publier sur la visite'}
          </button>
          {selectedValidation.ok ? (
            <p className="section-sub" style={{ fontSize: '0.78rem', margin: '2px 0 0' }}>
              Validation prête pour sauvegarde/publication.
            </p>
          ) : (
            <p className="text-danger" style={{ fontSize: '0.78rem', margin: '2px 0 0' }}>
              Pack invalide: corrigez les erreurs avant publication.
            </p>
          )}
          {editorWarnings.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.78rem' }}>
              {editorWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={actionBusy}
            onClick={onDelete}
          >
            Supprimer…
          </button>
        </div>
      ) : null}
      {actionError ? (
        <div className="text-danger" role="alert" style={{ fontSize: '0.82rem', marginTop: 10 }}>
          <p style={{ margin: 0 }}>{actionError}</p>
          {actionIssues.length > 0 ? (
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {toMascotPackIssueLines(actionIssues).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
