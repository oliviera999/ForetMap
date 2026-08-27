import { toMascotPackIssueLines } from '../../utils/mascotPackValidationUi.js';

/**
 * Colonne de gauche du gestionnaire de packs mascotte : présentation/aide, création,
 * **la** liste des mascottes, panneau de la mascotte sélectionnée (libellé,
 * enregistrer/publier/réinitialiser/supprimer, validation, avertissements) et bloc d'erreur
 * d'action. Présentation pure prop-driven : tout l'état et les actions (api) restent dans le
 * parent.
 *
 * **Une seule liste** (étape 3 de la fusion catalogue / packs). Jusqu'ici cette colonne en
 * affichait deux : les « modèles intégrés », ni modifiables ni supprimables, et les packs. Un
 * prof y lisait une même mascotte à deux endroits avec deux jeux de droits.
 *
 * Un reste s'y accrochait : un menu « Partir d'un modèle livré » qui listait les seize mascottes
 * du catalogue au-dessus de la liste — donc, à l'écran, une seconde liste de noms qu'on ne
 * pouvait pas supprimer. Il faisait doublon avec « Dupliquer le pack sélectionné », qui part de
 * la ligne en base et copie **aussi les images téléversées**. Il est parti ; il ne restait rien
 * qu'il savait faire.
 *
 * @param {{
 *   actionBusy: boolean,
 *   onNewDraft: () => void,
 *   onRefresh: () => void,
 *   onDuplicateSelected: () => void,
 *   onExportZip?: () => void,
 *   onExportZipUnified?: () => void,
 *   onOpenImport?: () => void,
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
 *   onResetFromOrigin?: () => void,
 *   selectedValidation: { ok: boolean },
 *   editorWarnings: string[],
 *   isDirty?: boolean,
 *   actionError: string,
 *   actionIssues: Array<Record<string, unknown>>,
 * }} props
 */
export default function MascotPackListAside({
  actionBusy,
  onNewDraft,
  onRefresh,
  onDuplicateSelected,
  onExportZip,
  onExportZipUnified,
  onOpenImport,
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
  onResetFromOrigin = null,
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
      <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Mascottes</h2>
      <p className="section-sub" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
        Toutes les mascottes sont ici, livrées comprises, et se modifient — ou se suppriment — de la
        même façon. Celles qui sont <strong>publiées</strong> sont proposées aux visiteurs, sur
        toutes les cartes.
        <br />
        Une mascotte <strong>livrée</strong> se réinitialise à tout moment : on peut l’essayer sans
        rien perdre. La <strong>supprimer</strong>, en revanche, est définitif.
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={actionBusy}
            onClick={onDuplicateSelected}
          >
            Dupliquer le pack sélectionné
          </button>
          {onExportZip ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={actionBusy}
              onClick={onExportZip}
              title="Télécharger une archive ZIP portable (JSON + images)"
            >
              Exporter ZIP
            </button>
          ) : null}
          {onExportZipUnified ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={actionBusy}
              onClick={onExportZipUnified}
              title="Archive ZIP avec pack.json en forme unifiée states[] (aligné GL)"
            >
              Exporter ZIP (states[])
            </button>
          ) : null}
          {onOpenImport ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={actionBusy}
              onClick={onOpenImport}
              title="Importer une archive ZIP (nouveau brouillon ou remplacement)"
            >
              Importer ZIP…
            </button>
          ) : null}
        </div>
      ) : onOpenImport ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 10 }}
          disabled={actionBusy}
          onClick={onOpenImport}
        >
          Importer ZIP…
        </button>
      ) : null}
      {listError ? (
        <p className="text-danger" role="alert" style={{ fontSize: '0.85rem' }}>
          {listError}
        </p>
      ) : null}
      {loading ? <p className="section-sub">Chargement…</p> : null}
      {!loading && packs.length === 0 ? (
        <p className="section-sub">Aucune mascotte pour l’instant — créez un brouillon.</p>
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
                {/* L'origine d'abord : c'est elle qui dit ce qu'on peut faire de la ligne
                    (réinitialiser une livrée, supprimer une mascotte créée ici). */}
                {p.origin === 'builtin' ? 'Livrée' : 'Créée ici'}
                {' · '}
                {p.is_published ? 'Publiée' : 'Brouillon'}
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
            <p className="visit-mascot-pack-manager__dirty-banner" role="status" aria-live="polite">
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
          {selectedRow?.is_published ? (
            <p className="section-sub" style={{ fontSize: '0.75rem', margin: 0 }}>
              La retirer la masque du sélecteur des visiteurs. C’est réversible, et rien n’est
              perdu.
            </p>
          ) : null}
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
          {/* Une mascotte livrée garde en plus « Réinitialiser » : c'est ce qui rend son édition
              sans risque — on peut tout casser et revenir en arrière. Mais elle **se supprime
              aussi**, comme les autres : la suppression est retenue en base, donc elle dure. */}
          {selectedRow?.origin === 'builtin' ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={actionBusy || !onResetFromOrigin}
              onClick={() => onResetFromOrigin && onResetFromOrigin()}
              title="Rendre à cette mascotte livrée son apparence et ses comportements d’origine"
            >
              Réinitialiser depuis l’origine…
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={actionBusy}
            onClick={onDelete}
            title={
              selectedRow?.origin === 'builtin'
                ? 'Supprimer définitivement cette mascotte livrée, images comprises'
                : undefined
            }
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
