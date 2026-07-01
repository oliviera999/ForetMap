import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLRichTextEditor } from './ui/GLRichTextEditor.jsx';
import { GLLearningAcknowledgeButton } from './GLLearningAcknowledgeButton.jsx';
import { GLJournalImportButton } from './GLJournalImportButton.jsx';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';

export function GLTutorialsView({
  canManage,
  learningProgress,
  glossaryLinkItems = [],
  onOpenGlossaryTerm,
  focusTutorialId = null,
  onTutorialFocusHandled,
}) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({
    id: null,
    slug: '',
    title: '',
    bodyMarkdown: '',
    isPublished: true,
  });
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await apiGL('/api/gl/tutorials');
      setItems(Array.isArray(list?.tutorials) ? list.tutorials : []);
      await learningProgress?.reload?.();
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }, [learningProgress]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Deep-link depuis le carnet : ouvre directement le tutoriel ciblé (fetch par id,
  // indépendant de la liste). onFocusHandled purge la cible pour éviter la réouverture.
  useEffect(() => {
    if (focusTutorialId == null || focusTutorialId === '') return;
    let cancelled = false;
    apiGL(`/api/gl/tutorials/${focusTutorialId}`)
      .then((data) => {
        if (!cancelled) setActive(data || null);
      })
      .catch(() => {});
    onTutorialFocusHandled?.();
    return () => {
      cancelled = true;
    };
  }, [focusTutorialId, onTutorialFocusHandled]);

  async function openTutorial(id) {
    try {
      const data = await apiGL(`/api/gl/tutorials/${id}`);
      setActive(data || null);
    } catch (err) {
      setError(err.message || 'Lecture impossible');
    }
  }

  const readIds = learningProgress?.tutorialIds ?? [];
  const isTutorialRead = (id) => learningProgress?.isTutorialRead?.(id) ?? false;

  async function persistTutorial() {
    if (draft.id) {
      await apiGL(`/api/gl/tutorials/${draft.id}`, 'PUT', {
        title: draft.title,
        bodyMarkdown: draft.bodyMarkdown,
        isPublished: !!draft.isPublished,
      });
    } else {
      await apiGL('/api/gl/tutorials', 'POST', {
        slug: draft.slug || `tuto-${Date.now()}`,
        title: draft.title,
        bodyMarkdown: draft.bodyMarkdown,
        isPublished: !!draft.isPublished,
      });
    }
    const nextDraft = { id: null, slug: '', title: '', bodyMarkdown: '', isPublished: true };
    setDraft(nextDraft);
    setEditing(false);
    await reload();
    return nextDraft;
  }

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: draft,
    resetKey: draft.id ?? (editing ? 'new' : 'idle'),
    enabled: editing && canManage && String(draft.title || '').trim().length > 0,
    onSave: persistTutorial,
  });

  async function createDraft(event) {
    event.preventDefault();
  }

  async function startEdit(id) {
    try {
      const data = await apiGL(`/api/gl/tutorials/${id}`);
      setDraft({
        id: Number(data?.id || id),
        slug: String(data?.slug || ''),
        title: String(data?.title || ''),
        bodyMarkdown: String(data?.body_markdown || ''),
        isPublished: data?.is_published !== false,
      });
      setEditing(true);
      setError('');
    } catch (err) {
      setError(err.message || 'Ouverture de l’édition impossible');
    }
  }

  async function removeTutorial(id) {
    if (!window.confirm('Supprimer ce tutoriel GL ?')) return;
    try {
      await apiGL(`/api/gl/tutorials/${id}`, 'DELETE');
      if (Number(active?.id) === Number(id)) setActive(null);
      if (Number(draft?.id) === Number(id))
        setDraft({ id: null, slug: '', title: '', bodyMarkdown: '', isPublished: true });
      await reload();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    }
  }

  let html = '';
  if (active?.body_markdown) {
    try {
      html = active.body_markdown;
    } catch (_) {
      html = '';
    }
  }

  return (
    <section className="gl-panel fade-in">
      <h2>Tutoriels GL</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      <div className="gl-inline-actions">
        {canManage ? (
          <GLButton
            type="button"
            onClick={() => {
              if (editing) {
                setEditing(false);
                setDraft({ id: null, slug: '', title: '', bodyMarkdown: '', isPublished: true });
                return;
              }
              setDraft({ id: null, slug: '', title: '', bodyMarkdown: '', isPublished: true });
              setEditing(true);
            }}
          >
            {editing ? 'Annuler' : 'Nouveau tutoriel'}
          </GLButton>
        ) : null}
        <GLButton type="button" variant="secondary" onClick={reload}>
          Rafraîchir
        </GLButton>
      </div>

      {editing && canManage ? (
        <form className="gl-form" onSubmit={createDraft}>
          <GLField label="Slug">
            <GLInput
              value={draft.slug}
              disabled={!!draft.id}
              onChange={(event) => setDraft((d) => ({ ...d, slug: event.target.value }))}
            />
          </GLField>
          <GLField label="Titre">
            <GLInput
              value={draft.title}
              onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))}
            />
          </GLField>
          <GLField label="Texte enrichi">
            <GLRichTextEditor
              value={draft.bodyMarkdown}
              onChange={(event) => setDraft((d) => ({ ...d, bodyMarkdown: event.target.value }))}
              imageLegend="Images du tutoriel"
            />
          </GLField>
          <label>
            <input
              type="checkbox"
              checked={!!draft.isPublished}
              onChange={(event) => setDraft((d) => ({ ...d, isPublished: event.target.checked }))}
            />{' '}
            Publié
          </label>
          {saveError ? <p className="gl-error">{saveError}</p> : null}
          <AutoSaveStatus status={saveStatus} className="gl-hint" />
        </form>
      ) : null}

      <ul className="gl-tutorials-list">
        {items.map((item) => (
          <li key={item.id} className={isTutorialRead(item.id) ? 'is-read' : ''}>
            <button type="button" onClick={() => openTutorial(item.id)}>
              <strong>{item.title}</strong>
              {isTutorialRead(item.id) ? <span className="gl-hint"> · lu</span> : null}
            </button>
            {canManage ? (
              <div className="gl-inline-actions">
                <GLButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => startEdit(item.id)}
                >
                  Éditer
                </GLButton>
                <GLButton
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => removeTutorial(item.id)}
                >
                  Suppr.
                </GLButton>
              </div>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? (
          <li className="gl-empty gl-hint">
            <span className="gl-empty-icon" aria-hidden>
              🎓
            </span>
            Aucun tutoriel.
          </li>
        ) : null}
      </ul>

      {active ? (
        <article className="gl-tutorial-active gl-markdown">
          <div className="gl-tutorial-active__head">
            <h3>{active.title}</h3>
            {learningProgress ? (
              <GLLearningAcknowledgeButton
                acknowledgePath={`/api/gl/learning/tutorials/${active.id}`}
                resourceType="tutorial"
                resourceRef={active.id}
                itemTitle={active.title}
                labelAction="✓ Marquer comme lu"
                labelDone="✓ Lu"
                titleDone="Tu as confirmé avoir lu et compris ce tutoriel"
                confirmIntro={
                  <>
                    En validant, tu t&apos;engages à avoir lu et compris le tutoriel{' '}
                    <strong>« {active.title || 'ce tutoriel'} »</strong>.
                  </>
                }
                confirmCheckboxLabel="Je confirme avoir lu et compris ce contenu."
                isDone={isTutorialRead(active.id)}
                onAcknowledged={() => learningProgress.markLocal('tutorial', String(active.id))}
              />
            ) : null}
            <GLJournalImportButton
              resourceType="tutorial"
              resourceRef={active.id}
              title={active.title}
              learned={isTutorialRead(active.id)}
            />
          </div>
          {canManage ? (
            <div className="gl-inline-actions" style={{ marginBottom: 8 }}>
              <GLButton type="button" variant="secondary" onClick={() => startEdit(active.id)}>
                Modifier ce tutoriel
              </GLButton>
              <GLButton type="button" variant="danger" onClick={() => removeTutorial(active.id)}>
                Supprimer ce tutoriel
              </GLButton>
            </div>
          ) : null}
          <GLGlossaryMarkdown
            markdown={html || 'Aperçu indisponible.'}
            glossaryItems={glossaryLinkItems}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
            allowImages
          />
        </article>
      ) : null}
    </section>
  );
}
