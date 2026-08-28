import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { MascotSpeaker } from '../../shared/components/MascotSpeaker.jsx';
import { SpeechBubble } from '../../shared/components/SpeechBubble.jsx';
import VisitMascotFallbackSvg from '../VisitMascotFallbackSvg.jsx';
import { MASCOT_PACK_FALLBACK_SILHOUETTES } from '../../utils/mascotPackEditorModel.js';
import {
  MASCOT_EXPRESSION_LABELS,
  MASCOT_EXPRESSIONS,
  DEFAULT_MASCOT_EXPRESSION,
} from '../../utils/mascotExpressions.js';
import {
  clearNarratorExpression,
  clearNarratorPortrait,
  countIllustratedExpressions,
  NARRATOR_EXPRESSION_HINTS,
  NARRATOR_FRAMING_LABELS,
  NARRATOR_PORTRAIT_BUDGET_BYTES,
  normalizeNarratorDraft,
  setNarratorPortrait,
} from '../../utils/helpNarratorDraft.js';
import { prepareMediaImport } from '../../utils/mediaImport.js';
import { NarratorPortraitCard } from './NarratorPortraitCard.jsx';
import { NarratorMediaPickerDialog } from './NarratorMediaPickerDialog.jsx';

const NARRATOR_ENDPOINT = '/api/settings/admin/help-narrator';
const MEDIA_ENDPOINT = '/api/settings/admin/media-library';

/** Texte d'aperçu — écrit dans la voix d'OLU, sans emprunter au corpus réel. */
const PREVIEW_TEXT =
  'Voilà ce que j’ai recopié. Si j’ai oublié quelque chose, c’est à toi de le retrouver — je ne prétends pas être exhaustif.';

function formatKilobytes(size) {
  return `${Math.round(Number(size || 0) / 102.4) / 10} Ko`;
}

/**
 * Studio du **narrateur de l'aide** (OLU) — réglage `content.help.narrator`.
 *
 * Écran distinct du studio « Bulles d'aide » parce que les deux réglages ont des
 * cycles de vie séparés côté serveur (routes et réinitialisations distinctes, §5.2) :
 * les fondre en un seul écran laisserait croire qu'un « Réinitialiser » emporte les
 * deux, ce qui est précisément ce que le lot 2 a évité.
 *
 * Trois partis pris d'interface :
 *
 * 1. **La cascade est montrée, pas expliquée.** Chaque expression affiche le rendu
 *    effectif (image propre → « Neutre » → silhouette SVG) avec sa provenance. Une
 *    expression vide n'est donc jamais lue comme une case à remplir obligatoirement.
 * 2. **Un aperçu en situation**, dans les deux surfaces réelles (visite guidée et
 *    en-tête d'aide) : ce qui se règle ici ne se juge pas sur une vignette isolée.
 * 3. **Un seul geste pour illustrer.** « Importer » téléverse dans la médiathèque
 *    *et* affecte l'emplacement ; « Choisir… » ouvre la médiathèque existante.
 *    Enregistrement automatique, comme les autres studios prof.
 */
export function HelpNarratorAdminPanel() {
  const [draft, setDraft] = useState(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [previewExpression, setPreviewExpression] = useState(DEFAULT_MASCOT_EXPRESSION);
  const [previewSurface, setPreviewSurface] = useState('tour');
  const [picker, setPicker] = useState(null);

  const load = useCallback(async () => {
    const data = await api(NARRATOR_ENDPOINT);
    setDraft(normalizeNarratorDraft(data));
    setLoadRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Chargement impossible'));
  }, [load]);

  const persist = useCallback(async () => {
    if (!draft) return draft;
    const saved = await api(NARRATOR_ENDPOINT, 'PUT', draft);
    return normalizeNarratorDraft(saved);
  }, [draft]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: draft,
    resetKey: loadRevision,
    enabled: draft != null,
    onSave: persist,
  });

  const illustrated = useMemo(() => (draft ? countIllustratedExpressions(draft) : 0), [draft]);

  const fetchMediaItems = useCallback(async () => {
    const data = await api(`${MEDIA_ENDPOINT}?limit=400`);
    return Array.isArray(data?.items) ? data.items : [];
  }, []);

  const uploadMedia = useCallback(async (dataUrl, options = {}) => {
    await api(MEDIA_ENDPOINT, 'POST', {
      media_data: dataUrl,
      original_name: options.originalName || null,
    });
  }, []);

  async function uploadAndAssign(expression, framing, file) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const prepared = await prepareMediaImport(file);
      const saved = await api(MEDIA_ENDPOINT, 'POST', {
        media_data: prepared.dataUrl,
        original_name: prepared.originalName,
      });
      const url = String(saved?.url || '');
      if (!url) throw new Error('Le serveur n’a pas renvoyé d’URL pour ce média');
      setDraft((prev) => setNarratorPortrait(prev, expression, framing, url));
      const label = `${MASCOT_EXPRESSION_LABELS[expression]} · ${NARRATOR_FRAMING_LABELS[framing]}`;
      setInfo(
        Number(saved?.size) > NARRATOR_PORTRAIT_BUDGET_BYTES
          ? `${label} : image affectée (${formatKilobytes(saved.size)}). Au-delà de 30 Ko, pense à compresser — c’est un réseau de lycée.`
          : `${label} : image affectée.`,
      );
    } catch (err) {
      setError(err.message || 'Import impossible');
    } finally {
      setBusy(false);
    }
  }

  async function resetNarrator() {
    if (
      !window.confirm(
        'Réinitialiser le narrateur ? Le nom, la silhouette et tous les portraits affectés reviennent aux valeurs par défaut. Les images restent dans la médiathèque.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api(`${NARRATOR_ENDPOINT}/reset`, 'POST');
      setDraft(normalizeNarratorDraft(data));
      setLoadRevision((value) => value + 1);
      setInfo('Narrateur réinitialisé.');
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return <p className="section-sub">Chargement du narrateur…</p>;
  }

  const enabled = draft.enabled !== false;
  const pickerLabel = picker
    ? `${MASCOT_EXPRESSION_LABELS[picker.expression]} · ${NARRATOR_FRAMING_LABELS[picker.framing]}`
    : '';

  return (
    <div className="fm-narrator-admin">
      <p className="section-sub" style={{ marginTop: 0 }}>
        OLU est la voix unique de l’aide et des visites guidées. Ici se règlent son nom, son
        portrait par expression et son interrupteur — pas les textes, qui sont dans « Bulles d’aide
        ».
      </p>
      {error ? <div className="auth-error">⚠️ {error}</div> : null}
      {saveError ? <div className="auth-error">⚠️ {saveError}</div> : null}
      {info ? <div className="auth-success">{info}</div> : null}

      {/* ── Interrupteur global (§9.4) ─────────────────────────────────────── */}
      <section className={`fm-narrator-switch ${enabled ? 'is-on' : 'is-off'}`}>
        <label className="fm-narrator-switch__control">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
          />
          <span className="fm-narrator-switch__label">
            {enabled ? 'OLU accompagne l’aide et les visites' : 'OLU est éteint'}
          </span>
        </label>
        <p className="fm-narrator-switch__hint">
          {enabled
            ? 'Portrait et nom du locuteur s’affichent dans les panneaux « ? » et les visites guidées.'
            : 'Aucun portrait, aucun nom de locuteur. Les textes d’aide restent identiques, et les images affectées sont conservées.'}
        </p>
      </section>

      {/* ── Identité ───────────────────────────────────────────────────────── */}
      <section className="fm-narrator-block">
        <h3 className="fm-narrator-block__title">Identité</h3>
        <div className="fm-narrator-identity">
          <div className="field">
            <label htmlFor="fm-narrator-name">Nom affiché au-dessus des bulles</label>
            <input
              id="fm-narrator-name"
              type="text"
              maxLength={40}
              value={draft.speakerName}
              placeholder="OLU"
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, speakerName: event.target.value }))
              }
            />
            <p className="fm-narrator-hint">Laisser vide masque l’étiquette de locuteur.</p>
          </div>
          <div className="field">
            <label htmlFor="fm-narrator-silhouette">Silhouette de repli</label>
            <div className="fm-narrator-silhouette">
              <select
                id="fm-narrator-silhouette"
                value={draft.fallbackSilhouette}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, fallbackSilhouette: event.target.value }))
                }
              >
                {MASCOT_PACK_FALLBACK_SILHOUETTES.map((silhouette) => (
                  <option key={silhouette} value={silhouette}>
                    {silhouette}
                  </option>
                ))}
              </select>
              <span className="fm-narrator-silhouette__preview" aria-hidden="true">
                <VisitMascotFallbackSvg silhouette={draft.fallbackSilhouette} variant="forest" />
              </span>
            </div>
            <p className="fm-narrator-hint">
              Dessin vectoriel utilisé quand aucune image n’est disponible. Il ne coûte rien au
              réseau : l’aide fonctionne intégralement sans le moindre portrait.
            </p>
          </div>
        </div>
      </section>

      {/* ── Aperçu en situation (§4.5) ─────────────────────────────────────── */}
      <section className="fm-narrator-block">
        <div className="fm-narrator-block__head">
          <h3 className="fm-narrator-block__title">Aperçu en situation</h3>
          <div className="fm-narrator-preview__controls">
            <div className="gl-subtabs fm-narrator-surfaces" role="group" aria-label="Surface">
              <button
                type="button"
                className={previewSurface === 'tour' ? 'is-active' : ''}
                onClick={() => setPreviewSurface('tour')}
              >
                Visite guidée
              </button>
              <button
                type="button"
                className={previewSurface === 'help' ? 'is-active' : ''}
                onClick={() => setPreviewSurface('help')}
              >
                Panneau d’aide
              </button>
            </div>
            <label className="fm-narrator-preview__expression">
              <span>Expression</span>
              <select
                value={previewExpression}
                onChange={(event) => setPreviewExpression(event.target.value)}
              >
                {MASCOT_EXPRESSIONS.map((expression) => (
                  <option key={expression} value={expression}>
                    {MASCOT_EXPRESSION_LABELS[expression]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="fm-narrator-preview" data-surface={previewSurface}>
          {!enabled ? (
            <p className="fm-narrator-preview__off">
              Narrateur éteint : voici ce que voient élèves et profs — le texte, sans portrait ni
              nom.
            </p>
          ) : null}
          {previewSurface === 'tour' ? (
            <div className="fm-narrator-preview__tour">
              {enabled ? (
                <MascotSpeaker narrator={draft} expression={previewExpression} size="bust" />
              ) : null}
              <SpeechBubble
                text={PREVIEW_TEXT}
                speakerName={enabled ? draft.speakerName : ''}
                typewriter={false}
              />
            </div>
          ) : (
            <div className="fm-narrator-preview__help">
              <h4 className="fm-narrator-preview__help-title">
                {enabled ? (
                  <MascotSpeaker narrator={draft} expression="neutre" size="face" />
                ) : null}
                <span>💡 Aide de la page</span>
              </h4>
              <ul>
                <li>{PREVIEW_TEXT}</li>
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ── Portraits par expression ───────────────────────────────────────── */}
      <section className="fm-narrator-block">
        <div className="fm-narrator-block__head">
          <h3 className="fm-narrator-block__title">Portraits</h3>
          <p className="fm-narrator-count">
            <strong>
              {illustrated} / {MASCOT_EXPRESSIONS.length}
            </strong>{' '}
            expressions illustrées
            {illustrated < MASCOT_EXPRESSIONS.length ? ' · les autres reprennent « Neutre »' : ''}
          </p>
        </div>
        <p className="fm-narrator-hint">
          Commencer par <strong>Neutre</strong> suffit : toutes les autres expressions s’appuient
          dessus tant qu’elles n’ont pas leur propre image. Format conseillé : WebP transparent 256
          × 320 px, moins de 30 Ko.
        </p>

        <div className="fm-narrator-grid">
          {MASCOT_EXPRESSIONS.map((expression) => (
            <NarratorPortraitCard
              key={expression}
              expression={expression}
              label={MASCOT_EXPRESSION_LABELS[expression]}
              hint={NARRATOR_EXPRESSION_HINTS[expression]}
              draft={draft}
              busy={busy}
              onPick={(framing) => setPicker({ expression, framing })}
              onUpload={(framing, file) => uploadAndAssign(expression, framing, file)}
              onClear={(framing) =>
                setDraft((prev) => clearNarratorPortrait(prev, expression, framing))
              }
              onClearAll={() => setDraft((prev) => clearNarratorExpression(prev, expression))}
            />
          ))}
        </div>
      </section>

      <div className="fm-narrator-actions">
        <AutoSaveStatus status={saveStatus} />
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={resetNarrator}>
          Réinitialiser le narrateur
        </button>
      </div>

      <NarratorMediaPickerDialog
        open={picker != null}
        slotLabel={pickerLabel}
        fetchItems={fetchMediaItems}
        uploadDataUrl={uploadMedia}
        onPick={(url) => {
          if (!picker) return;
          setDraft((prev) => setNarratorPortrait(prev, picker.expression, picker.framing, url));
          setInfo(`${pickerLabel} : image affectée.`);
        }}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}
