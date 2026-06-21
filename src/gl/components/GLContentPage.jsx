import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL, clearGlSession } from '../services/apiGL.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { GLBrandPageBanner } from './GLBrandHub.jsx';
import { GL_CONTENT_PAGE_SLOT_BY_SLUG } from '../hooks/useGLBrandTheme.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLRichTextEditor } from './ui/GLRichTextEditor.jsx';
import { GLImageFrameHelp } from './GLImageFrameHelp.jsx';
import { GLGlossaryMarkdown } from './GLGlossaryMarkdown.jsx';
import { ScrollProgressBar } from '../../shared/components/ScrollProgressBar.jsx';
import { useScrollReveal } from '../../shared/hooks/useScrollReveal.js';

function canManageContent(auth) {
  const permissions = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return permissions.includes('gl.content.manage');
}

function hasExistingContent(data) {
  return Boolean(String(data?.bodyMarkdown || '').trim());
}

export function GLContentPage({
  slug,
  fallbackTitle,
  auth,
  brandSlots,
  onSaved,
  onNavigateTab,
  glossaryLinkItems = [],
  onOpenGlossaryTerm,
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadHttpStatus, setLoadHttpStatus] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [content, setContent] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const bodyTextareaRef = useRef(null);

  const manageable = canManageContent(auth);
  const contentDraft = { title: draftTitle, bodyMarkdown: draftBody };

  const persistContent = useCallback(async () => {
    if (!manageable) return contentDraft;
    const titleTrim = String(draftTitle || '').trim();
    if (!titleTrim) throw new Error('Le titre est obligatoire.');
    const data = await apiGL(`/api/gl/content/${encodeURIComponent(slug)}`, 'PUT', {
      title: titleTrim,
      bodyMarkdown: draftBody,
    });
    setContent(data);
    setDraftTitle(String(data?.title || titleTrim));
    setDraftBody(String(data?.bodyMarkdown || draftBody));
    setSavedMessage('Contenu enregistré.');
    if (typeof onSaved === 'function') onSaved(data);
    return {
      title: String(data?.title || titleTrim),
      bodyMarkdown: String(data?.bodyMarkdown || draftBody),
    };
  }, [manageable, draftTitle, draftBody, slug, onSaved, contentDraft]);

  const { status: saveStatus, error: autoSaveError } = useDebouncedAutoSave({
    value: contentDraft,
    resetKey: `${slug}:${reloadKey}:${editing ? 'edit' : 'view'}`,
    enabled: manageable && editing,
    canSave: () => String(draftTitle || '').trim().length > 0,
    onSave: persistContent,
  });

  const [bodyRef, bodyVisible] = useScrollReveal({ once: true, threshold: 0.05 });

  const displayTitle = content?.title || fallbackTitle || slug;
  const previewMarkdown =
    manageable && editing ? draftBody : content?.bodyMarkdown || draftBody || '';
  const pageSlotKey = GL_CONTENT_PAGE_SLOT_BY_SLUG[slug];
  const pageBannerSlot = pageSlotKey && brandSlots ? brandSlots[pageSlotKey] : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setLoadHttpStatus(null);
    setSaveError('');
    setSavedMessage('');
    apiGL(`/api/gl/content/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (cancelled) return;
        setContent(data);
        setDraftTitle(String(data?.title || fallbackTitle || slug));
        setDraftBody(String(data?.bodyMarkdown || ''));
        setEditing(manageable && !hasExistingContent(data));
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err.message || 'Chargement impossible');
          setLoadHttpStatus(err.status ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, fallbackTitle, manageable, reloadKey]);

  function retryLoad() {
    setReloadKey((key) => key + 1);
  }

  function reconnect() {
    clearGlSession();
    window.location.reload();
  }

  if (loading) return <div className="gl-panel">Chargement…</div>;
  if (loadError) {
    return (
      <div className="gl-panel gl-error">
        <p>{loadError}</p>
        <div className="gl-inline-actions">
          <GLButton type="button" onClick={retryLoad}>
            Réessayer
          </GLButton>
          {loadHttpStatus === 401 ? (
            <GLButton type="button" variant="secondary" onClick={reconnect}>
              Se reconnecter
            </GLButton>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <article className="gl-panel gl-markdown gl-content-page">
      <ScrollProgressBar />
      <GLBrandPageBanner slot={pageBannerSlot} />
      <h2>{displayTitle}</h2>

      {savedMessage ? (
        <div className="gl-success-banner" role="status">
          {savedMessage}
          {typeof onNavigateTab === 'function' ? (
            <GLButton type="button" variant="secondary" onClick={() => onNavigateTab('mj')}>
              Ouvrir la console MJ
            </GLButton>
          ) : null}
        </div>
      ) : null}

      {saveError || autoSaveError ? (
        <p className="gl-error">{saveError || autoSaveError}</p>
      ) : null}

      {manageable && !editing ? (
        <div className="gl-inline-actions" style={{ marginBottom: 12 }}>
          <GLButton
            type="button"
            onClick={() => {
              setSaveError('');
              setSavedMessage('');
              setEditing(true);
            }}
          >
            Modifier le contenu
          </GLButton>
          {typeof onNavigateTab === 'function' ? (
            <GLButton type="button" variant="secondary" onClick={() => onNavigateTab('contents')}>
              Tous les contenus (admin)
            </GLButton>
          ) : null}
        </div>
      ) : null}

      {manageable && editing ? (
        <section className="gl-form">
          <p className="gl-hint">
            Cette page est affichée aux joueurs dans l’onglet correspondant. Vous pouvez la modifier
            plus tard depuis l’onglet <strong>Contenus</strong>.
          </p>
          <GLField label="Titre">
            <GLInput value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </GLField>
          <GLField label="Texte enrichi">
            <GLRichTextEditor
              ref={bodyTextareaRef}
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              hint="Mise en forme enrichie : titres, listes, citations, liens et images."
              imageLegend="Images dans cette page"
            />
          </GLField>
          <GLImageFrameHelp context="markdown" />
          <AutoSaveStatus status={saveStatus} className="gl-hint" />
          <div className="gl-inline-actions">
            {hasExistingContent(content) ? (
              <GLButton
                type="button"
                variant="secondary"
                disabled={saveStatus === 'saving'}
                onClick={() => {
                  setSaveError('');
                  setSavedMessage('');
                  setDraftTitle(String(content?.title || fallbackTitle || slug));
                  setDraftBody(String(content?.bodyMarkdown || ''));
                  setEditing(false);
                }}
              >
                Annuler
              </GLButton>
            ) : null}
          </div>
        </section>
      ) : null}

      {manageable && editing ? <h3>Aperçu</h3> : null}
      <div
        ref={bodyRef}
        className={`gl-editorial-body scroll-reveal${bodyVisible ? ' is-visible' : ''}`}
      >
        <GLGlossaryMarkdown
          markdown={previewMarkdown || '_Contenu vide._'}
          glossaryItems={glossaryLinkItems}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          allowImages
        />
      </div>
    </article>
  );
}
