import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountDeletedError, getAuthUserId } from '../../services/api';
import { createOfflineJournalAdapter } from '../../services/userJournalOfflineAdapter.js';
import { useJournalFeed } from '../../shared/journal/useJournalFeed.js';
import { JournalFeedToolbar } from '../../shared/journal/JournalFeedToolbar.jsx';
import { JournalBookView } from '../../shared/journal/JournalBookView.jsx';
import { UserJournalArticleCard } from './UserJournalArticleCard.jsx';
import { UserJournalImportCard } from './UserJournalImportCard.jsx';
import { FM_JOURNAL_UI } from './journalUi.js';
import { HelpPanel } from '../HelpPanel.jsx';
import { useHelp } from '../../hooks/useHelp.js';
import { resolveHelpPanelSection } from '../../utils/helpResolve.js';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { importTypeMeta } from '../../utils/fmJournalMeta.js';
import { getBuildBrand } from '../../shared/brand/brandNames.js';

/**
 * Carnet ForetMap : fil lecture-first (articles + éléments appris), édition ciblée,
 * impression livre.
 */
export function UserJournalView({
  zones = [],
  onForceLogout = null,
  onNavigateTab = null,
  isTeacher = false,
  bookOwnerLabel = 'Mon carnet',
}) {
  const publicSettings = usePublicSettings();
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } =
    useHelp({ publicSettings, isTeacher });
  const helpJournal = resolveHelpPanelSection('journal', publicSettings);
  const [bookOpen, setBookOpen] = useState(false);
  const onError = useCallback(
    (err) => {
      if (err instanceof AccountDeletedError) onForceLogout?.();
    },
    [onForceLogout],
  );
  // Carnet sans réseau (piste D) : adaptateur stable pour la durée de la vue ; la file des
  // brouillons est propre au compte connecté (tablette partagée).
  const userIdRef = useRef('');
  userIdRef.current = getAuthUserId();
  const [offline, setOffline] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const adapter = useMemo(
    () =>
      createOfflineJournalAdapter({
        getUserId: () => userIdRef.current,
        onOfflineChange: setOffline,
      }),
    [],
  );
  const feed = useJournalFeed(adapter, { onError });
  const feedRef = useRef(feed);
  feedRef.current = feed;

  /**
   * Envoie les brouillons écrits sans réseau — sauf celui qu'on édite encore — puis recharge
   * le fil pour que l'article du serveur remplace le brouillon.
   * @param {{ skipArticleIds?: Array<string|number> }} [options]
   */
  const sendDrafts = useCallback(
    async ({ skipArticleIds } = {}) => {
      const current = feedRef.current;
      const skip = skipArticleIds ?? (current.editingId != null ? [String(current.editingId)] : []);
      const out = await adapter.flushDrafts({ skipArticleIds: skip }).catch(() => null);
      if (!out) return null;
      if (out.synced > 0 || out.refused.length > 0) {
        const editing = feedRef.current.editingId;
        if (editing != null && out.idMap.has(String(editing))) {
          feedRef.current.setEditingId(out.idMap.get(String(editing)));
        }
        await feedRef.current.reload();
      }
      if (out.refused.length > 0) {
        setDraftNotice(
          `Un article écrit sans réseau n’a pas pu être envoyé : ${out.refused[0].message}. Il reste dans ton carnet pour que tu le corriges.`,
        );
      } else if (out.synced > 0) {
        setDraftNotice(
          out.synced > 1
            ? `${out.synced} articles écrits sans réseau sont envoyés ✓`
            : 'Ton article écrit sans réseau est envoyé ✓',
        );
      }
      return out;
    },
    [adapter],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (typeof navigator === 'undefined' || navigator.onLine !== false) void sendDrafts();
    const onOnline = async () => {
      const out = await sendDrafts();
      // Le fil complet revient avec le réseau, même sans brouillon à envoyer.
      if (!out || (out.synced === 0 && out.refused.length === 0)) await feedRef.current.reload();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sendDrafts]);

  const stopEdit = useCallback(() => {
    const wasEditing = feedRef.current.editingId;
    feedRef.current.setEditingId(null);
    if (wasEditing != null && String(wasEditing).startsWith('local-')) {
      void sendDrafts({ skipArticleIds: [] });
    }
  }, [sendDrafts]);

  if (bookOpen) {
    return (
      <JournalBookView
        articles={feed.articles}
        imports={feed.imports}
        adapter={adapter}
        ui={FM_JOURNAL_UI}
        ownerLabel={bookOwnerLabel}
        productLabel={getBuildBrand().appName || 'ForetMap'}
        yearbook
        onClose={() => setBookOpen(false)}
        importTypeMeta={importTypeMeta}
      />
    );
  }

  return (
    <section className="fm-journal fade-in" data-testid="user-journal">
      <header className="fm-journal__header">
        <div className="fm-journal__header-row">
          <h2>Mon carnet</h2>
          {isHelpEnabled ? (
            <HelpPanel
              sectionId="journal"
              title={helpJournal.title}
              entries={helpJournal.items}
              isTeacher={isTeacher}
              isPulsing={!hasSeenSection('journal')}
              onMarkSeen={markSectionSeen}
              onOpen={trackPanelOpen}
              onDismiss={trackPanelDismiss}
            />
          ) : null}
        </div>
        <p className="hint fm-journal__intro">
          Feuillette ton carnet : articles et éléments appris. Écris un article, importe une espèce
          ou un terme marqué comme appris. Les professeurs peuvent le consulter pour t’accompagner.
        </p>
      </header>

      <div className="fm-journal__actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={feed.createArticle}
          disabled={feed.creating}
        >
          {feed.creating ? 'Création…' : '+ Nouvel article'}
        </button>
        {feed.totalCount > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={() => setBookOpen(true)}>
            Imprimer mon carnet
          </button>
        ) : null}
        {feed.error ? (
          <button type="button" className="btn btn-secondary" onClick={feed.reload}>
            Réessayer
          </button>
        ) : null}
      </div>

      {!feed.loading && feed.totalCount > 0 ? (
        <JournalFeedToolbar feed={feed} ui={FM_JOURNAL_UI} />
      ) : null}

      {feed.error ? <p className="auth-error">{feed.error}</p> : null}

      {offline ? (
        <p className="hint fm-journal__offline" role="status">
          Pas de réseau : ton carnet complet s’affichera au retour du réseau. Tu peux écrire un
          nouvel article : il est gardé sur l’appareil et partira tout seul.
        </p>
      ) : null}
      {draftNotice ? (
        <p className="hint fm-journal__draft-notice" role="status">
          {draftNotice}
        </p>
      ) : null}

      {feed.loading ? (
        <p className="hint">Chargement de ton carnet…</p>
      ) : feed.totalCount === 0 && offline ? null : feed.totalCount === 0 ? (
        <div className="fm-journal__empty">
          <p className="hint">Ton carnet est encore vide. Deux façons de le remplir :</p>
          <ul className="hint">
            <li>
              <strong>Écris un article</strong> — « + Nouvel article » (texte, images, ou les deux).
            </li>
            <li>
              <strong>Importe un élément appris</strong> — sur une fiche espèce, un terme du
              glossaire ou un tutoriel, marque-le comme appris puis « Ajouter au carnet ».
            </li>
          </ul>
        </div>
      ) : feed.timeline.length === 0 ? (
        <p className="hint fm-journal__empty">Aucune entrée ne correspond à ta recherche.</p>
      ) : (
        <div className="fm-journal__feed">
          {feed.timeline.map((entry) =>
            entry.kind === 'article' ? (
              <UserJournalArticleCard
                key={`a-${entry.data.id}`}
                article={entry.data}
                limits={feed.limits}
                zones={zones}
                editing={String(feed.editingId) === String(entry.data.id)}
                onStartEdit={(id) => feed.setEditingId(id)}
                onStopEdit={stopEdit}
                onDelete={feed.deleteArticle}
                onTogglePin={feed.pinArticle}
                onForceLogout={onForceLogout}
                adapter={adapter}
              />
            ) : (
              <UserJournalImportCard
                key={`i-${entry.data.id}`}
                item={entry.data}
                onNavigateTab={onNavigateTab}
                onDelete={feed.deleteImport}
                onTogglePin={feed.pinImport}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}
