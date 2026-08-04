import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiGL } from '../../services/apiGL.js';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../../shared/hooks/useDebouncedAutoSave.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLMarkdownEditor } from '../ui/GLMarkdownEditor.jsx';
import { GLGlossaryMarkdown } from '../GLGlossaryMarkdown.jsx';

const API_BASE = '/api/gl/admin/reference-docs';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

/** Télécharge le Markdown affiché, pour le reverser dans `docs/reference/gl/` (dépôt Git). */
function downloadMarkdown(slug, bodyMarkdown) {
  const blob = new Blob([String(bodyMarkdown || '')], {
    type: 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Contenus → Doc de référence : consultation et édition de la documentation
 * fonctionnelle non technique de GL (`docs/reference/gl/*.md`).
 *
 * Le fichier versionné dans Git est la base ; toute modification faite ici est une
 * surcouche enregistrée en base, réversible (« Réinitialiser ») et exportable en `.md`.
 */
export function GLReferenceDocsPanel({ glossaryLinkItems = [], onOpenGlossaryTerm }) {
  const [docs, setDocs] = useState([]);
  const [activeSlug, setActiveSlug] = useState('');
  const [doc, setDoc] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const bodyRef = useRef(null);

  const loadList = useCallback(async () => {
    const rows = await apiGL(API_BASE);
    const list = Array.isArray(rows) ? rows : [];
    setDocs(list);
    setActiveSlug((current) =>
      current && list.some((item) => item.slug === current) ? current : list[0]?.slug || '',
    );
    return list;
  }, []);

  useEffect(() => {
    setLoading(true);
    loadList()
      .catch((err) => setError(err.message || 'Chargement des documents impossible'))
      .finally(() => setLoading(false));
  }, [loadList]);

  useEffect(() => {
    if (!activeSlug) {
      setDoc(null);
      return undefined;
    }
    let cancelled = false;
    setError('');
    setInfo('');
    setEditing(false);
    apiGL(`${API_BASE}/${encodeURIComponent(activeSlug)}`)
      .then((data) => {
        if (cancelled) return;
        setDoc(data);
        setDraftTitle(String(data?.title || ''));
        setDraftBody(String(data?.bodyMarkdown || ''));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Chargement du document impossible');
      });
    return () => {
      cancelled = true;
    };
  }, [activeSlug, reloadKey]);

  const draft = useMemo(
    () => ({ title: draftTitle, bodyMarkdown: draftBody }),
    [draftTitle, draftBody],
  );

  const persistDoc = useCallback(async () => {
    const titleTrim = String(draftTitle || '').trim();
    if (!titleTrim) throw new Error('Le titre est obligatoire.');
    const saved = await apiGL(`${API_BASE}/${encodeURIComponent(activeSlug)}`, 'PUT', {
      title: titleTrim,
      bodyMarkdown: draftBody,
    });
    setDoc(saved);
    // La liste porte le repère « modifié » et la date : elle doit suivre chaque sauvegarde.
    await loadList().catch(() => {});
    return { title: titleTrim, bodyMarkdown: draftBody };
  }, [activeSlug, draftTitle, draftBody, loadList]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: draft,
    resetKey: `${activeSlug}:${reloadKey}:${editing ? 'edit' : 'view'}`,
    enabled: Boolean(activeSlug) && editing,
    canSave: () => String(draftTitle || '').trim().length > 0,
    onSave: persistDoc,
  });

  async function resetDoc() {
    if (!doc?.edited) return;
    const confirmed = window.confirm(
      `Réinitialiser « ${doc.title} » ?\n\nLes modifications faites depuis l’application seront supprimées et le document reviendra au texte du dépôt.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const restored = await apiGL(`${API_BASE}/${encodeURIComponent(activeSlug)}/reset`, 'POST');
      setDoc(restored);
      setDraftTitle(String(restored?.title || ''));
      setDraftBody(String(restored?.bodyMarkdown || ''));
      setEditing(false);
      setInfo('Document réinitialisé depuis le dépôt.');
      await loadList().catch(() => {});
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  }

  const previewMarkdown = editing ? draftBody : doc?.bodyMarkdown || '';

  return (
    <section className="gl-reference-docs">
      <p className="gl-hint">
        Documentation de référence <strong>fonctionnelle</strong> de Gnomes &amp; Licornes : ce que
        le jeu fait aujourd’hui, en français simple, pour les professeurs, MJ et administrateurs. Ce
        que vous écrivez ici <strong>vaut demande d’évolution</strong> — utilisez le repère{' '}
        <code>🔧 À implémenter :</code> pour décrire un comportement souhaité mais non encore
        développé.
      </p>
      <p className="gl-hint">
        Le texte du dépôt (<code>docs/reference/gl/</code>) sert de base. Vos modifications sont
        enregistrées dans l’application et survivent aux mises à jour ; « Réinitialiser » les
        annule, « Télécharger le .md » permet de les reverser dans le dépôt.
      </p>

      {error ? <p className="gl-error">{error}</p> : null}
      {info ? (
        <p className="gl-success-banner" role="status">
          {info}
        </p>
      ) : null}

      {loading ? <p>Chargement…</p> : null}
      {!loading && docs.length === 0 ? (
        <p className="gl-hint">
          Aucun document de référence trouvé. Vérifiez que <code>docs/reference/gl/</code> est
          présent sur le serveur.
        </p>
      ) : null}

      {docs.length > 0 ? (
        <div className="gl-content-admin-list">
          {docs.map((item) => (
            <button
              key={item.slug}
              type="button"
              className={item.slug === activeSlug ? 'is-active' : ''}
              onClick={() => setActiveSlug(item.slug)}
              title={item.summary || item.title}
            >
              {item.title}
              {item.edited ? ' •' : ''}
            </button>
          ))}
        </div>
      ) : null}

      {doc ? (
        <article className="gl-panel gl-markdown">
          <h3>{doc.title}</h3>
          <p className="gl-hint">
            <code>docs/reference/gl/{doc.slug}.md</code>
            {doc.edited
              ? ` — modifié dans l’application${doc.updatedAt ? ` le ${formatDate(doc.updatedAt)}` : ''}`
              : ' — version du dépôt'}
            {!doc.fileAvailable ? ' (fichier absent du serveur)' : ''}
          </p>

          <div className="gl-inline-actions" style={{ marginBottom: 12 }}>
            {editing ? (
              <GLButton
                type="button"
                variant="secondary"
                disabled={saveStatus === 'saving'}
                onClick={() => {
                  setDraftTitle(String(doc?.title || ''));
                  setDraftBody(String(doc?.bodyMarkdown || ''));
                  setEditing(false);
                }}
              >
                Terminer la modification
              </GLButton>
            ) : (
              <GLButton
                type="button"
                onClick={() => {
                  setError('');
                  setInfo('');
                  setEditing(true);
                }}
              >
                Modifier le document
              </GLButton>
            )}
            <GLButton
              type="button"
              variant="secondary"
              onClick={() => downloadMarkdown(doc.slug, previewMarkdown)}
            >
              Télécharger le .md
            </GLButton>
            {doc.edited ? (
              <GLButton type="button" variant="secondary" disabled={busy} onClick={resetDoc}>
                Réinitialiser depuis le dépôt
              </GLButton>
            ) : null}
          </div>

          {saveError ? <p className="gl-error">{saveError}</p> : null}

          {editing ? (
            <section className="gl-form">
              <GLField label="Titre">
                <GLInput
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
              </GLField>
              <GLField label="Texte du document (Markdown)">
                {/* Markdown brut (`rich={false}`) : ces documents partent dans Git, l'éditeur
                    visuel réécrirait tableaux, ancres et repères « 🔧 À implémenter : ». */}
                <GLMarkdownEditor
                  ref={bodyRef}
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                  rows={24}
                  rich={false}
                  hint="Markdown brut, identique au fichier du dépôt (titres #, listes, tableaux, liens)."
                />
              </GLField>
              <AutoSaveStatus status={saveStatus} className="gl-hint" />
              <h4>Aperçu</h4>
            </section>
          ) : null}

          <div className="gl-editorial-body">
            <GLGlossaryMarkdown
              markdown={previewMarkdown || '_Document vide._'}
              glossaryItems={glossaryLinkItems}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
              allowImages
            />
          </div>
        </article>
      ) : null}

      {docs.length > 0 && !doc && !loading ? (
        <GLButton type="button" onClick={() => setReloadKey((key) => key + 1)}>
          Réessayer
        </GLButton>
      ) : null}
    </section>
  );
}
