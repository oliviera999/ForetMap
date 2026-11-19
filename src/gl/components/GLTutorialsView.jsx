import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLRichTextEditor } from './ui/GLRichTextEditor.jsx';
import { GLLearningAcknowledgeButton } from './GLLearningAcknowledgeButton.jsx';
import { GLJournalImportButton } from './GLJournalImportButton.jsx';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';

const EMPTY_DRAFT = Object.freeze({
  id: null,
  slug: '',
  title: '',
  bodyMarkdown: '',
  isPublished: true,
});

export function GLTutorialsView({
  canManage,
  learningProgress,
  glossaryLinkItems = [],
  onOpenGlossaryTerm,
  focusTutorialId = null,
  onTutorialFocusHandled,
}) {
  const { confirm } = useAppDialogs();
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);
  // Une « séance d'édition » par ouverture de l'éditeur : c'est elle, et non l'id du
  // tutoriel, qui réinitialise l'enregistrement automatique. Sinon la création (id null →
  // id créé) passait pour un changement de document et la saisie en cours était tenue
  // pour déjà enregistrée.
  const [editSession, setEditSession] = useState(0);

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

  /**
   * Enregistrement automatique : l'éditeur reste ouvert et le brouillon en place. Rend la
   * valeur réellement envoyée (avec l'id créé), pour que ce qui a été tapé pendant la
   * requête reste « à enregistrer » et parte au tour suivant.
   */
  async function persistTutorial() {
    const sent = draft;
    let saved = sent;
    if (sent.id) {
      await apiGL(`/api/gl/tutorials/${sent.id}`, 'PUT', {
        title: sent.title,
        bodyMarkdown: sent.bodyMarkdown,
        isPublished: !!sent.isPublished,
      });
    } else {
      const created = await apiGL('/api/gl/tutorials', 'POST', {
        slug: sent.slug || `tuto-${Date.now()}`,
        title: sent.title,
        bodyMarkdown: sent.bodyMarkdown,
        isPublished: !!sent.isPublished,
      });
      const id = Number(created?.id) || null;
      const slug = String(created?.slug || sent.slug || '');
      saved = { ...sent, id, slug };
      // Garde l'id créé : la suite de la saisie met à jour ce tutoriel au lieu d'en créer un
      // second. Seuls l'id et le slug sont posés, le texte tapé entre-temps est conservé.
      setDraft((d) => ({ ...d, id, slug }));
    }
    await reload();
    return saved;
  }

  const {
    status: saveStatus,
    error: saveError,
    flush: flushSave,
  } = useDebouncedAutoSave({
    value: draft,
    resetKey: editing ? `edit-${editSession}` : 'idle',
    enabled: editing && canManage && String(draft.title || '').trim().length > 0,
    onSave: persistTutorial,
  });

  /** Fermeture explicite : la saisie en attente part d'abord. */
  async function closeEditor() {
    await flushSave();
    setEditing(false);
    setDraft(EMPTY_DRAFT);
  }

  async function createDraft(event) {
    event.preventDefault();
  }

  async function startEdit(id) {
    try {
      if (editing) await flushSave();
      const data = await apiGL(`/api/gl/tutorials/${id}`);
      setDraft({
        id: Number(data?.id || id),
        slug: String(data?.slug || ''),
        title: String(data?.title || ''),
        bodyMarkdown: String(data?.body_markdown || ''),
        // La base renvoie 0 ou 1 : `!== false` était toujours vrai, la case revenait cochée
        // et l'enregistrement automatique republiait un brouillon.
        isPublished: Number(data?.is_published) === 1,
      });
      setEditSession((n) => n + 1);
      setEditing(true);
      setError('');
    } catch (err) {
      setError(err.message || 'Ouverture de l’édition impossible');
    }
  }

  async function removeTutorial(id) {
    if (!(await confirm({ message: 'Supprimer ce tutoriel GL ?', danger: true }))) return;
    try {
      await apiGL(`/api/gl/tutorials/${id}`, 'DELETE');
      if (Number(active?.id) === Number(id)) setActive(null);
      if (Number(draft?.id) === Number(id)) setDraft(EMPTY_DRAFT);
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
                closeEditor();
                return;
              }
              setDraft(EMPTY_DRAFT);
              setEditSession((n) => n + 1);
              setEditing(true);
            }}
          >
            {editing ? 'Fermer l’éditeur' : 'Nouveau tutoriel'}
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

      <ul className="gl-tutorials-list" data-gl-tour="tutorials-list">
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
                labelAction="Marquer comme appris"
                labelDone="✓ Appris"
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
