import { useEffect, useState } from 'react';
import { DialogShell } from '../DialogShell';
import { useDialogA11y } from '../../shared/platform/useDialogA11y';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';
import {
  IconCamera,
  IconClose,
  IconDelete,
  IconOffline,
  IconOutbox,
  IconStorage,
} from '../../shared/icons.jsx';
import {
  OUTBOX_KINDS,
  TASK_DONE_CONFLICT_REASONS,
  dismissOutboxEntry,
} from '../../services/offlineOutbox.js';
import {
  formatBytes,
  getStorageStatus,
  isIosNotInstalled,
  isStorageLow,
  requestPersistentStorage,
} from '../../shared/platform/storagePersistence.js';
import { offlineBannerText } from '../../utils/lastDataSync.js';
import './offlineCenter.css';

export const OUTBOX_KIND_LABELS = Object.freeze({
  [OUTBOX_KINDS.tutorialRead]: 'Tutoriel lu',
  [OUTBOX_KINDS.taskDone]: 'Tâche faite',
  [OUTBOX_KINDS.speciesObservation]: 'Observation',
  [OUTBOX_KINDS.plantObservation]: 'Espèce observée',
  [OUTBOX_KINDS.journalDraft]: 'Carnet (brouillon)',
});

const NETWORK_LABELS = Object.freeze({
  online: 'Réseau disponible',
  offline: 'Hors ligne',
  unreachable: 'Réseau trop faible',
});

function formatQueuedAt(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const at = new Date(ts);
  return at.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Explication d'un refus : le code stable du serveur d'abord, son message sinon. */
export function outboxEntryRefusalText(entry) {
  if (!entry?.refused) return '';
  if (entry.kind === OUTBOX_KINDS.taskDone && TASK_DONE_CONFLICT_REASONS[entry.error_code]) {
    return `Refusé : ${TASK_DONE_CONFLICT_REASONS[entry.error_code]}.`;
  }
  return entry.error ? `Refusé : ${entry.error}` : 'Refusé par le serveur.';
}

function OutboxList({ entries, onToast }) {
  const { confirm } = useAppDialogs();
  const [copiedKey, setCopiedKey] = useState(null);
  if (entries.length === 0) {
    return <p className="offline-center__empty">Rien en attente : tout est envoyé ✓</p>;
  }
  const copy = async (entry) => {
    try {
      await navigator.clipboard.writeText(entry.detail || '');
      setCopiedKey(entry.key);
    } catch {
      onToast?.('Copie impossible : sélectionne le texte pour le copier à la main.');
    }
  };
  const remove = async (entry) => {
    const ok = await confirm({
      message: `Supprimer « ${entry.title} » de cet appareil ? Il ne sera jamais envoyé.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (ok) await dismissOutboxEntry(entry.kind, entry.key);
  };
  return (
    <ul className="offline-center__list" aria-label="Envois en attente">
      {entries.map((entry) => (
        <li
          key={`${entry.kind}:${entry.key}`}
          className={`offline-center__item${entry.refused ? ' is-refused' : ''}`}
        >
          <div className="offline-center__item-head">
            <span className="offline-center__kind">
              {OUTBOX_KIND_LABELS[entry.kind] || 'Envoi'}
            </span>
            <strong className="offline-center__item-title">{entry.title}</strong>
            {entry.has_photo ? (
              <span className="offline-center__photo" title="Photo jointe">
                <IconCamera size={14} /> photo
              </span>
            ) : null}
          </div>
          {entry.detail ? <p className="offline-center__detail">{entry.detail}</p> : null}
          <p className="offline-center__meta">
            {entry.refused
              ? outboxEntryRefusalText(entry)
              : entry.kind === OUTBOX_KINDS.journalDraft
                ? 'Partira depuis ton carnet.'
                : `En attente depuis ${formatQueuedAt(entry.queued_at)}`}
          </p>
          {entry.dismissible ? (
            <div className="offline-center__item-actions">
              {entry.refused && entry.detail ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => copy(entry)}
                >
                  {copiedKey === entry.key ? 'Copié ✓' : 'Copier le texte'}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void remove(entry)}
                aria-label={`Supprimer « ${entry.title} » de cet appareil`}
              >
                <IconDelete size={14} /> Supprimer
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function StorageSection() {
  const [status, setStatus] = useState(null);
  const [asking, setAsking] = useState(false);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getStorageStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!status) return null;
  const ios = isIosNotInstalled();
  const low = isStorageLow(status.usage, status.quota);
  const protect = async () => {
    setAsking(true);
    const granted = await requestPersistentStorage();
    setAsking(false);
    setRefused(granted === false);
    setStatus(await getStorageStatus());
  };
  return (
    <section className="offline-center__section" aria-labelledby="offline-center-storage">
      <h4 id="offline-center-storage">
        <IconStorage size={16} /> Stockage de l’appareil
      </h4>
      {status.usage != null && status.quota != null ? (
        <p className="offline-center__meta">
          Utilisé : {formatBytes(status.usage)} sur {formatBytes(status.quota)} disponibles.
        </p>
      ) : null}
      {status.persisted === true ? (
        <p className="offline-center__ok">
          Données hors ligne protégées : le navigateur ne les effacera pas pour faire de la place.
        </p>
      ) : status.supported && status.persisted === false ? (
        <>
          <p className="offline-center__meta">
            Le navigateur peut effacer les données hors ligne s’il manque de place.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={protect}
            disabled={asking}
          >
            {asking ? '…' : 'Protéger les données hors ligne'}
          </button>
          {refused ? (
            <p className="offline-center__warn">
              Le navigateur a refusé pour l’instant. Installer l’application aide souvent.
            </p>
          ) : null}
        </>
      ) : null}
      {low ? (
        <p className="offline-center__warn" role="alert">
          L’appareil est presque plein : les photos prises sans réseau risquent de ne plus pouvoir
          être gardées.
        </p>
      ) : null}
      {ios ? (
        <p className="offline-center__warn">
          Sur iPhone et iPad, ajoute l’application à l’écran d’accueil (bouton Partager, puis « Sur
          l’écran d’accueil ») : sinon Safari efface les données hors ligne après quelques jours
          sans visite.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Écran « Hors ligne » : état du réseau, envois en attente (avec explication des refus),
 * préparation de la sortie terrain et stockage de l'appareil.
 *
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {import('../../services/offlineOutbox.js').OutboxEntry[]} props.entries
 * @param {'online'|'offline'|'unreachable'} props.networkMode
 * @param {number|null} [props.lastSyncAt]
 * @param {() => Promise<unknown>} props.onFlushNow
 * @param {((onProgress: (p: { done: number, total: number }) => void) => Promise<{ ok: number,
 *   failed: number }>)|null} [props.onPrepareFieldTrip]
 * @param {(message: string) => void} [props.onToast]
 */
export function OfflineCenterDialog({
  onClose,
  entries = [],
  networkMode = 'online',
  lastSyncAt = null,
  onFlushNow,
  onPrepareFieldTrip = null,
  onToast = null,
}) {
  const dialogRef = useDialogA11y(onClose);
  const [flushing, setFlushing] = useState(false);
  const [prep, setPrep] = useState({ state: 'idle', done: 0, total: 0, result: null });
  const online = networkMode === 'online';
  const replayable = entries.some((e) => !e.refused && e.kind !== OUTBOX_KINDS.journalDraft);

  const flush = async () => {
    setFlushing(true);
    try {
      await onFlushNow?.();
    } finally {
      setFlushing(false);
    }
  };

  const prepare = async () => {
    if (!onPrepareFieldTrip) return;
    setPrep({ state: 'running', done: 0, total: 0, result: null });
    try {
      const result = await onPrepareFieldTrip(({ done, total }) =>
        setPrep((p) => ({ ...p, done, total })),
      );
      setPrep({ state: 'done', done: 0, total: 0, result });
    } catch {
      setPrep({ state: 'error', done: 0, total: 0, result: null });
    }
  };

  const percent = prep.total > 0 ? Math.min(100, Math.round((prep.done / prep.total) * 100)) : 0;

  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in offline-center"
      ariaLabel="Hors ligne"
      closeOnOverlay
      dialogRef={dialogRef}
    >
      <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>
        <IconClose size={16} />
      </button>
      <h3>
        <IconOffline size={18} /> Hors ligne
      </h3>
      <p
        className={`offline-center__network offline-center__network--${networkMode}`}
        role="status"
      >
        {online ? NETWORK_LABELS.online : offlineBannerText(lastSyncAt, Date.now(), networkMode)}
      </p>

      <section className="offline-center__section" aria-labelledby="offline-center-outbox">
        <h4 id="offline-center-outbox">
          <IconOutbox size={16} /> En attente d’envoi
        </h4>
        <OutboxList entries={entries} onToast={onToast} />
        {replayable ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={flush}
            disabled={!online || flushing}
          >
            {flushing ? 'Envoi…' : online ? 'Envoyer maintenant' : 'Envoi au retour du réseau'}
          </button>
        ) : null}
      </section>

      {onPrepareFieldTrip ? (
        <section className="offline-center__section" aria-labelledby="offline-center-terrain">
          <h4 id="offline-center-terrain">Préparer la sortie terrain</h4>
          <p className="offline-center__meta">
            Avant de partir sans réseau : garde sur l’appareil la carte, les photos des zones et
            repères, les fiches espèces et les tutoriels. À faire avec du Wi-Fi.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={prepare}
            disabled={!online || prep.state === 'running'}
          >
            {prep.state === 'running' ? 'Préparation…' : 'Préparer la sortie terrain'}
          </button>
          {prep.state === 'running' ? (
            <progress
              className="offline-center__progress"
              max={100}
              value={percent}
              aria-label="Avancement de la préparation"
            />
          ) : null}
          {prep.state === 'done' && prep.result ? (
            <p className="offline-center__ok" role="status">
              Prêt pour la sortie ✓ ({prep.result.ok} éléments gardés
              {prep.result.failed > 0 ? `, ${prep.result.failed} indisponibles` : ''}).
            </p>
          ) : null}
          {prep.state === 'error' ? (
            <p className="offline-center__warn" role="alert">
              La préparation s’est interrompue. Réessaie avec un meilleur réseau.
            </p>
          ) : null}
        </section>
      ) : null}

      <StorageSection />
    </DialogShell>
  );
}
