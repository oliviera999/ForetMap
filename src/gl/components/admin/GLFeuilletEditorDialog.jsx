import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { useAppDialogs } from '../../../shared/components/AppDialogsProvider.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLBadge } from '../ui/GLBadge.jsx';
import { DialogShell } from '../../../components/DialogShell.jsx';
import { GLFeuilletKingdomZonePicker } from './GLFeuilletKingdomZonePicker.jsx';
import { GLFeuilletChapterMemberships } from './GLFeuilletChapterMemberships.jsx';
import { GLFeuilletLiasseReorder } from './GLFeuilletLiasseReorder.jsx';
import { GLFeuilletReaderPreview } from './GLFeuilletReaderPreview.jsx';
import { GLFeuilletFormSections } from './GLFeuilletFormFields.jsx';
import { EMPTY_FORM, feuilletToForm, formToPayload } from '../../utils/glFeuilletEditorForm.js';

const EMPTY_NOTICES = { error: '', info: '', warning: '' };

/** Caractéristiques résumées affichées au-dessus de l'aperçu joueur. */
const PREVIEW_META = [
  { key: 'type', label: 'Type' },
  { key: 'mode_apparition', label: "Mode d'apparition" },
  { key: 'biome_slug', label: 'Biome' },
  { key: 'liasse', label: 'Liasse' },
  { key: 'zone_label', label: 'Zone' },
  { key: 'signature', label: 'Signature' },
];

/**
 * Popover d'un feuillet du carnet de Sélène, en deux temps :
 * - onglet **Aperçu** : le contenu tel que le joueur le verra (lecture seule) ;
 * - onglet **Édition** : le formulaire complet (toutes les colonnes utiles),
 *   avec associations (chapitres, zone du royaume, ordre de liasse).
 *
 * Utilisé aussi bien depuis la liste d'édition que depuis la vue d'ensemble, de
 * sorte qu'un feuillet s'ouvre et se corrige sans changer d'onglet.
 *
 * @param {{
 *   code: string,
 *   initialMode?: 'preview'|'edit',
 *   allItems?: Array<object>,
 *   onClose: () => void,
 *   onSaved?: () => (void|Promise<void>),
 * }} props
 */
export function GLFeuilletEditorDialog({
  code,
  initialMode = 'edit',
  allItems = [],
  onClose,
  onSaved,
}) {
  const { confirm } = useAppDialogs();
  const [mode, setMode] = useState(initialMode === 'preview' ? 'preview' : 'edit');
  const [form, setForm] = useState(EMPTY_FORM);
  const [biomes, setBiomes] = useState([]);
  // Zone royaume liée au feuillet (gérée via son endpoint dédié, hors PUT principal).
  const [currentZoneId, setCurrentZoneId] = useState(null);
  const [loading, setLoading] = useState(false);
  // `true` seulement après un GET réussi pour le `code` courant — empêche un PUT
  // avec EMPTY_FORM (wipe total des colonnes) si le chargement a échoué.
  const [loadReady, setLoadReady] = useState(false);
  const [saving, setSaving] = useState(false);
  // Aperçu « comme le joueur le verra » à côté du formulaire, en mode édition.
  const [showPreview, setShowPreview] = useState(false);
  // Notifications regroupées (erreur / info / avertissement serveur).
  const [notices, setNotices] = useState(EMPTY_NOTICES);

  // La liste complète ne sert qu'au repli sur la zone liée et à l'ordre de liasse :
  // on la lit via une ref pour ne pas relancer le chargement du détail à chaque
  // rechargement de la liste parente.
  const allItemsRef = useRef(allItems);
  allItemsRef.current = allItems;

  const notify = useCallback((patch) => setNotices((prev) => ({ ...prev, ...patch })), []);
  const setField = useCallback((key, value) => setForm((prev) => ({ ...prev, [key]: value })), []);
  const patchForm = useCallback((patch) => setForm((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => {
    let cancelled = false;
    if (!code) return undefined;
    setLoading(true);
    setLoadReady(false);
    setNotices(EMPTY_NOTICES);
    apiGL(`/api/gl/lore/admin/feuillets/${encodeURIComponent(code)}`)
      .then((data) => {
        if (cancelled) return;
        // Sans fiche, on refuse l'édition : le PUT admin écrase toutes les colonnes
        // (y compris avec des chaînes vides), ce qui viderait le feuillet en base.
        if (!data?.feuillet) {
          setForm(EMPTY_FORM);
          setLoadReady(false);
          setNotices({
            ...EMPTY_NOTICES,
            error: 'Feuillet introuvable',
          });
          return;
        }
        setForm(feuilletToForm(data.feuillet));
        const zoneRaw =
          data.feuillet.kingdomZoneId ??
          allItemsRef.current.find((r) => r.feuillet_code === code)?.kingdom_zone_id;
        setCurrentZoneId(zoneRaw != null && zoneRaw !== '' ? Number(zoneRaw) : null);
        setLoadReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setForm(EMPTY_FORM);
        setLoadReady(false);
        setNotices({ ...EMPTY_NOTICES, error: err.message || 'Feuillet introuvable' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    apiGL('/api/gl/biomes')
      .then((list) => {
        if (!cancelled) setBiomes(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setBiomes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Feuillets de la même liasse que le feuillet en cours (réordonnancement).
  const liasseItems = useMemo(() => {
    const liasse = String(form.liasse || '').trim();
    if (!liasse) return [];
    return allItems.filter((row) => String(row.liasse || '').trim() === liasse);
  }, [allItems, form.liasse]);

  async function save() {
    if (!code || !loadReady) return;
    setSaving(true);
    setNotices(EMPTY_NOTICES);
    try {
      const data = await apiGL(
        `/api/gl/lore/admin/feuillets/${encodeURIComponent(code)}`,
        'PUT',
        formToPayload(form),
      );
      if (data?.feuillet) setForm(feuilletToForm(data.feuillet));
      notify({
        info: 'Feuillet enregistré.',
        warning: data?.warning?.warning || '',
      });
      await onSaved?.();
    } catch (err) {
      notify({ error: err.message || 'Enregistrement impossible' });
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatut() {
    if (!code || !loadReady) return;
    const nextStatut = form.statut === 'actif' ? 'inactif' : 'actif';
    if (
      nextStatut === 'inactif' &&
      !(await confirm({
        message: 'Archiver ce feuillet ? Il ne sera plus servi en jeu.',
        confirmLabel: 'Archiver',
        danger: true,
      }))
    ) {
      return;
    }
    setSaving(true);
    notify({ error: '' });
    try {
      const data = await apiGL(
        `/api/gl/lore/admin/feuillets/${encodeURIComponent(code)}`,
        'PATCH',
        {
          statut: nextStatut,
        },
      );
      if (data?.feuillet) setForm(feuilletToForm(data.feuillet));
      notify({ info: nextStatut === 'actif' ? 'Feuillet réactivé.' : 'Feuillet archivé.' });
      await onSaved?.();
    } catch (err) {
      notify({ error: err.message || 'Changement de statut impossible' });
    } finally {
      setSaving(false);
    }
  }

  /** Persiste le nouvel ordre d'une liasse (endpoint groupé) puis prévient le parent. */
  async function persistLiasseOrder(orderedCodes) {
    const updates = orderedCodes.map((c, index) => ({ code: c, ordreLiasse: index + 1 }));
    await apiGL('/api/gl/lore/admin/feuillets/reorder', 'PUT', { updates });
    notify({ info: 'Ordre de la liasse enregistré.' });
    await onSaved?.();
  }

  function renderSectionExtra(section) {
    if (section.id !== 'associations') return null;
    return (
      <div className="gl-feuillet-associations-extra">
        <div className="gl-field gl-field--wide">
          <span className="gl-field__label">Chapitres rattachés</span>
          <GLFeuilletChapterMemberships feuilletCode={code} />
        </div>
        <div className="gl-field gl-field--wide">
          <span className="gl-field__label">Zone du royaume</span>
          <GLFeuilletKingdomZonePicker
            feuilletCode={code}
            kingdomZoneId={currentZoneId}
            onLinked={(zoneId) => setCurrentZoneId(zoneId)}
          />
        </div>
        {form.liasse && liasseItems.length > 1 ? (
          <div className="gl-field gl-field--wide">
            <span className="gl-field__label">Ordre de la liasse « {form.liasse} »</span>
            <GLFeuilletLiasseReorder items={liasseItems} onPersist={persistLiasseOrder} />
          </div>
        ) : null}
      </div>
    );
  }

  const isPreview = mode === 'preview';
  const mutationsDisabled = saving || loading || !loadReady;

  return (
    <DialogShell
      open
      onClose={onClose}
      dialogClassName="gl-feuillet-editor-modal fade-in"
      ariaLabel={`Feuillet ${code}`}
      closeOnOverlay={false}
    >
      <header className="gl-feuillet-editor-modal__head">
        <h4>
          <code>{code}</code>
          {form.titre ? (
            <span className="gl-feuillet-editor-modal__titre">{form.titre}</span>
          ) : null}
          <GLBadge tone={form.statut === 'inactif' ? 'danger' : 'success'}>
            {form.statut || 'actif'}
          </GLBadge>
        </h4>
        <div className="gl-feuillet-editor-modal__head-actions">
          <div className="gl-subtabs gl-subtabs--nested" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={isPreview}
              className={isPreview ? 'is-active' : ''}
              onClick={() => setMode('preview')}
              disabled={!loadReady && !loading}
            >
              Aperçu
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isPreview}
              className={!isPreview ? 'is-active' : ''}
              onClick={() => setMode('edit')}
              disabled={!loadReady && !loading}
            >
              Édition
            </button>
          </div>
          <div className="gl-inline-actions">
            {isPreview || !loadReady ? null : (
              <GLButton
                type="button"
                variant={showPreview ? 'primary' : 'ghost'}
                onClick={() => setShowPreview((v) => !v)}
                aria-pressed={showPreview}
              >
                {showPreview ? 'Masquer l’aperçu' : 'Aperçu joueur'}
              </GLButton>
            )}
            {isPreview || !loadReady ? null : (
              <GLButton type="button" onClick={save} disabled={mutationsDisabled}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </GLButton>
            )}
            {loadReady ? (
              <GLButton
                type="button"
                variant="secondary"
                onClick={toggleStatut}
                disabled={mutationsDisabled}
              >
                {form.statut === 'actif' ? 'Archiver' : 'Réactiver'}
              </GLButton>
            ) : null}
            <GLButton type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Fermer
            </GLButton>
          </div>
        </div>
      </header>

      {notices.error ? <p className="gl-error">{notices.error}</p> : null}
      {notices.info ? <p className="gl-success">{notices.info}</p> : null}
      {notices.warning ? <p className="gl-hint">⚠️ {notices.warning}</p> : null}
      {loading ? <p className="gl-hint">Chargement du feuillet…</p> : null}

      {!loadReady && !loading ? null : isPreview ? (
        <div className="gl-feuillet-editor-modal__body">
          <div className="gl-feuillet-quickview">
            <dl className="gl-feuillet-quickview__meta">
              {PREVIEW_META.map((meta) => (
                <div key={meta.key} className="gl-feuillet-quickview__meta-row">
                  <dt>{meta.label}</dt>
                  <dd>{form[meta.key] || '—'}</dd>
                </div>
              ))}
            </dl>
            <div className="gl-feuillet-quickview__chapters">
              <span className="gl-field__label">Chapitres rattachés</span>
              <GLFeuilletChapterMemberships feuilletCode={code} />
            </div>
            <GLFeuilletReaderPreview form={form} />
            <p className="gl-hint">
              Une correction à faire ? Passez à l’onglet « Édition » pour modifier ce feuillet.
            </p>
          </div>
        </div>
      ) : (
        <div
          className={`gl-feuillet-editor-modal__body${
            showPreview ? ' gl-feuillet-editor-modal__body--split' : ''
          }`}
        >
          <div className="gl-feuillet-editor-modal__form">
            <GLFeuilletFormSections
              form={form}
              biomes={biomes}
              onChange={setField}
              onPatch={patchForm}
              renderSectionExtra={renderSectionExtra}
            />
          </div>
          {showPreview ? (
            <aside className="gl-feuillet-editor-modal__preview">
              <GLFeuilletReaderPreview form={form} />
            </aside>
          ) : null}
        </div>
      )}
    </DialogShell>
  );
}
