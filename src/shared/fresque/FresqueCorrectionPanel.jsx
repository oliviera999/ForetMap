import { ARROW_COLORS, FRESQUE_LIMITS, LINK_CATEGORY_MARKS } from './fresqueCore.js';

const SUMMARY_ORDER = ['trouvee', 'inversee', 'raccourci', 'piege', 'a_discuter'];

/**
 * Étape Comprendre : correction (comparer, révéler une flèche manquante à la fois ou toutes,
 * carte « correction » officielle, disposition officielle en aperçu), écran de fin, créativité
 * (titre, couleur des flèches, carte marquante), export image avec crédit, carnet.
 *
 * Jamais de note ni de classement : la fresque est terminée dès que tout est posé et que la
 * correction a été ouverte, quel que soit le nombre de flèches trouvées.
 */
export function FresqueCorrectionPanel({
  model,
  state,
  evaluation = null,
  readOnly = false,
  completed = false,
  previewActive = false,
  exporting = false,
  canExportToJournal = false,
  onCompare,
  onRevealNext,
  onRevealAll,
  onOpenOfficial,
  onTogglePreview,
  onCreativeChange,
  onAddNote,
  onExport,
  onExportToJournal,
  onRestart = null,
}) {
  const viewed = Boolean(state.correction?.viewedAt);
  const completion = model.hints.completion || {};
  const revealedCount = (state.correction?.revealedMissing || []).length;
  const missingCount = evaluation?.missing?.length || 0;
  const placedIds = Object.keys(state.cards || {});
  return (
    <section
      className="fm-fresque-panel"
      aria-label="Comprendre"
      data-testid="fm-fresque-correction"
    >
      {!viewed ? (
        <div className="fm-fresque-panel__block">
          <h2>Comprendre</h2>
          <p>
            Tes {placedIds.length} cartes sont posées. Compare maintenant tes flèches avec la
            correction officielle : chaque flèche reçoit un repère, et rien n’est perdu.
          </p>
          {!readOnly ? (
            <button
              type="button"
              className="fm-fresque-btn fm-fresque-btn--primary"
              onClick={onCompare}
              data-testid="fm-fresque-compare"
            >
              Comparer avec la correction
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {completed ? (
            <div
              className="fm-fresque-panel__block fm-fresque-panel__block--done"
              data-testid="fm-fresque-completion"
            >
              <h2>{completion.title || 'Ta fresque est complète !'}</h2>
              <p>{completion.text}</p>
            </div>
          ) : null}
          {evaluation ? (
            <div className="fm-fresque-panel__block">
              <h3>Tes flèches</h3>
              <ul className="fm-fresque-legend" data-testid="fm-fresque-summary">
                {SUMMARY_ORDER.map((cat) => {
                  const n = evaluation.byCategory?.[cat]?.length || 0;
                  const mark = LINK_CATEGORY_MARKS[cat];
                  return (
                    <li
                      key={cat}
                      className={`fm-fresque-legend__item fm-fresque-legend__item--${mark?.tone}`}
                    >
                      <span className="fm-fresque-legend__mark" aria-hidden="true">
                        {mark?.icon}
                      </span>
                      <span>
                        {mark?.label} : <strong>{n}</strong>
                        {cat === 'trouvee' ? ` / ${evaluation.expected}` : ''}
                      </span>
                    </li>
                  );
                })}
                <li className="fm-fresque-legend__item fm-fresque-legend__item--missing">
                  <span className="fm-fresque-legend__mark" aria-hidden="true">
                    {LINK_CATEGORY_MARKS.manquante.icon}
                  </span>
                  <span>
                    Pas encore trouvées : <strong>{missingCount}</strong> ({revealedCount}{' '}
                    affichée(s))
                  </span>
                </li>
              </ul>
              <p className="fm-fresque-panel__hint">
                Touche une flèche de ta fresque pour lire son retour. Une flèche « à discuter »
                n’est pas forcément fausse : explique-la !
              </p>
              <div className="fm-fresque-hand__actions">
                {!readOnly ? (
                  <>
                    <button
                      type="button"
                      className="fm-fresque-btn"
                      onClick={onRevealNext}
                      disabled={revealedCount >= missingCount}
                      data-testid="fm-fresque-reveal-next"
                    >
                      Montre-moi une flèche manquante
                    </button>
                    <button
                      type="button"
                      className="fm-fresque-btn"
                      onClick={onRevealAll}
                      disabled={revealedCount >= missingCount}
                      data-testid="fm-fresque-reveal-all"
                    >
                      Tout afficher
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="fm-fresque-btn"
                  onClick={onOpenOfficial}
                  data-testid="fm-fresque-open-official"
                >
                  Voir la correction officielle
                </button>
                <button
                  type="button"
                  className="fm-fresque-btn"
                  aria-pressed={previewActive ? 'true' : 'false'}
                  onClick={onTogglePreview}
                  data-testid="fm-fresque-preview-toggle"
                >
                  {previewActive ? 'Revenir à ma fresque' : 'Disposition officielle'}
                </button>
              </div>
            </div>
          ) : null}
          {!readOnly ? (
            <div className="fm-fresque-panel__block">
              <h3>Ma fresque</h3>
              <label className="fm-fresque-field">
                <span>Titre de ma fresque</span>
                <input
                  type="text"
                  className="fm-fresque-input"
                  maxLength={FRESQUE_LIMITS.maxTitle}
                  value={state.creative?.title || ''}
                  onChange={(e) =>
                    onCreativeChange({ title: e.target.value.slice(0, FRESQUE_LIMITS.maxTitle) })
                  }
                  placeholder="Donne un titre à ta fresque"
                  data-testid="fm-fresque-title-input"
                />
              </label>
              <fieldset className="fm-fresque-field">
                <legend>Couleur de mes flèches</legend>
                <div
                  className="fm-fresque-palette"
                  role="radiogroup"
                  aria-label="Couleur des flèches"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!state.creative?.arrowColor ? 'true' : 'false'}
                    aria-label="Couleur par défaut"
                    className="fm-fresque-swatch"
                    style={{ background: '#334155' }}
                    onClick={() => onCreativeChange({ arrowColor: null })}
                  >
                    {!state.creative?.arrowColor ? '✓' : ''}
                  </button>
                  {ARROW_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={state.creative?.arrowColor === c.id ? 'true' : 'false'}
                      aria-label={c.label}
                      className="fm-fresque-swatch"
                      style={{ background: c.hex }}
                      onClick={() => onCreativeChange({ arrowColor: c.id })}
                      data-testid={`fm-fresque-arrow-color-${c.id}`}
                    >
                      {state.creative?.arrowColor === c.id ? '✓' : ''}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="fm-fresque-field">
                <span>La carte qui m’a le plus marqué</span>
                <select
                  className="fm-fresque-input"
                  value={state.creative?.favoriteCardId || ''}
                  onChange={(e) => onCreativeChange({ favoriteCardId: e.target.value || null })}
                  data-testid="fm-fresque-favorite"
                >
                  <option value="">— choisir —</option>
                  {model.cardIds
                    .filter((id) => state.cards[id])
                    .map((id) => (
                      <option key={id} value={id}>
                        {model.cardsById[id].number}. {model.cardsById[id].title}
                      </option>
                    ))}
                </select>
              </label>
              <div className="fm-fresque-hand__actions">
                <button
                  type="button"
                  className="fm-fresque-btn"
                  onClick={onAddNote}
                  data-testid="fm-fresque-add-note-panel"
                >
                  Coller un post-it « que peut-on faire ? »
                </button>
                <button
                  type="button"
                  className="fm-fresque-btn"
                  onClick={onExport}
                  disabled={exporting}
                  data-testid="fm-fresque-export"
                >
                  {exporting ? 'Export en cours…' : 'Exporter en image (PNG)'}
                </button>
                {canExportToJournal ? (
                  <button
                    type="button"
                    className="fm-fresque-btn"
                    onClick={onExportToJournal}
                    disabled={exporting}
                    data-testid="fm-fresque-export-journal"
                  >
                    Ajouter à mon carnet
                  </button>
                ) : null}
                {onRestart ? (
                  <button
                    type="button"
                    className="fm-fresque-btn fm-fresque-btn--ghost"
                    onClick={onRestart}
                    data-testid="fm-fresque-restart"
                  >
                    Recommencer une nouvelle fresque
                  </button>
                ) : null}
              </div>
              <p className="fm-fresque-panel__hint">
                L’image exportée porte toujours le crédit de La Fresque du Climat (licence CC
                BY-NC-ND).
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
