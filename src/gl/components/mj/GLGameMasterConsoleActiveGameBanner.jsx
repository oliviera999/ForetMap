import React from 'react';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { GLBadge } from '../ui/GLBadge.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import {
  canEditGameChapter,
  canEditGameClass,
  formatGameStatus,
  gameLifecycleAction,
  gameStatusTone,
} from '../../utils/glGameStatus.js';

export default function GLGameMasterConsoleActiveGameBanner({
  game,
  gameStatus,
  activeClassLabel,
  activeChapterTitle,
  teams,
  chapters,
  activeClasses,
  editGameForm,
  setEditGameForm,
  setStatus,
  saveGameEdits,
  gameSaveStatus = 'idle',
  gameSaveError = '',
  busy,
}) {
  if (!game?.id) return null;
  return (
    <div
      className={`gl-active-game-banner is-status-${String(gameStatus || 'draft').toLowerCase()}`}
    >
      <div className="gl-active-game-banner-head">
        <div>
          <h3 className="gl-active-game-banner-title">{game.name || `Partie #${game.id}`}</h3>
          <div className="gl-active-game-banner-meta">
            <span>#{game.id}</span>
            <span>{activeClassLabel}</span>
            <span>{activeChapterTitle}</span>
            <span>
              {teams.length} équipe{teams.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <GLBadge tone={gameStatusTone(gameStatus)}>{formatGameStatus(gameStatus)}</GLBadge>
      </div>
      <div className="gl-inline-actions">
        <GLButton
          type="button"
          size="sm"
          onClick={() => setStatus('start')}
          disabled={busy || !gameLifecycleAction(gameStatus, 'start')}
        >
          Démarrer
        </GLButton>
        <GLButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setStatus('pause')}
          disabled={busy || !gameLifecycleAction(gameStatus, 'pause')}
        >
          Pause
        </GLButton>
        <GLButton
          type="button"
          size="sm"
          variant="danger"
          onClick={() => setStatus('end')}
          disabled={busy || !gameLifecycleAction(gameStatus, 'end')}
        >
          Terminer
        </GLButton>
      </div>
      <form className="gl-form" onSubmit={saveGameEdits}>
        {gameSaveError ? <p className="gl-error">{gameSaveError}</p> : null}
        <AutoSaveStatus status={gameSaveStatus} className="gl-hint" />
        <div className="gl-admin-grid-2">
          <GLField label="Nom de partie">
            <GLInput
              value={editGameForm.name}
              onChange={(event) =>
                setEditGameForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </GLField>
          <GLField label="Chapitre">
            <GLSelect
              value={editGameForm.chapterId}
              onChange={(event) =>
                setEditGameForm((prev) => ({ ...prev, chapterId: event.target.value }))
              }
              disabled={!canEditGameChapter(gameStatus)}
            >
              <option value="">Choisir</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </GLSelect>
          </GLField>
          <GLField label="Classe">
            <GLSelect
              value={editGameForm.classId}
              onChange={(event) =>
                setEditGameForm((prev) => ({ ...prev, classId: event.target.value }))
              }
              disabled={!canEditGameClass(gameStatus)}
            >
              <option value="">Choisir</option>
              {activeClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.school ? ` (${item.school})` : ''}
                </option>
              ))}
            </GLSelect>
          </GLField>
          <GLField label="Popover zones (cette partie)">
            <GLSelect
              value={editGameForm.zoneContentRetrigger}
              onChange={(event) =>
                setEditGameForm((prev) => ({
                  ...prev,
                  zoneContentRetrigger: event.target.value,
                }))
              }
            >
              <option value="">Hériter des réglages globaux</option>
              <option value="every_arrival">À chaque entrée ou traversée</option>
              <option value="once_per_team">Une fois par équipe et zone</option>
              <option value="once_per_game">Une fois par zone (toute la partie)</option>
            </GLSelect>
          </GLField>
          <GLField label="Feuillets Sélène (cette partie)">
            <GLSelect
              value={editGameForm.loreFeuilletRetrigger}
              onChange={(event) =>
                setEditGameForm((prev) => ({
                  ...prev,
                  loreFeuilletRetrigger: event.target.value,
                }))
              }
            >
              <option value="">Hériter des réglages globaux</option>
              <option value="every_arrival">À chaque entrée ou traversée</option>
              <option value="once_per_team">Une fois par équipe</option>
              <option value="once_per_game">Une fois par partie</option>
            </GLSelect>
          </GLField>
          <GLField label="Effacement feuillets">
            <GLSelect
              value={editGameForm.loreEffacementEnabled}
              onChange={(event) =>
                setEditGameForm((prev) => ({
                  ...prev,
                  loreEffacementEnabled: event.target.value,
                }))
              }
            >
              <option value="">Hériter plateforme</option>
              <option value="1">Activé</option>
              <option value="0">Désactivé</option>
            </GLSelect>
          </GLField>
          <GLField label="Coûts gemmes (feuillets)">
            <GLSelect
              value={editGameForm.loreGemmeCostsEnabled}
              onChange={(event) =>
                setEditGameForm((prev) => ({
                  ...prev,
                  loreGemmeCostsEnabled: event.target.value,
                }))
              }
            >
              <option value="">Hériter plateforme</option>
              <option value="1">Activé</option>
              <option value="0">Désactivé</option>
            </GLSelect>
          </GLField>
          <GLField label="Gains cœurs (feuillets)">
            <GLSelect
              value={editGameForm.loreHeartRewardsEnabled}
              onChange={(event) =>
                setEditGameForm((prev) => ({
                  ...prev,
                  loreHeartRewardsEnabled: event.target.value,
                }))
              }
            >
              <option value="">Hériter plateforme</option>
              <option value="1">Activé</option>
              <option value="0">Désactivé</option>
            </GLSelect>
          </GLField>
          <GLField label="Déplacement sur le plateau">
            <GLSelect
              value={editGameForm.boardMovementMode}
              onChange={(event) =>
                setEditGameForm((prev) => ({
                  ...prev,
                  boardMovementMode: event.target.value,
                }))
              }
            >
              <option value="">Libre (MJ place les équipes)</option>
              <option value="numbered_path">Repères numérotés + dé</option>
            </GLSelect>
          </GLField>
          {editGameForm.boardMovementMode === 'numbered_path' ? (
            <GLField label="Repère de départ">
              <GLSelect
                value={editGameForm.boardPathStartIndex}
                onChange={(event) =>
                  setEditGameForm((prev) => ({
                    ...prev,
                    boardPathStartIndex: event.target.value,
                  }))
                }
              >
                <option value="">Repère 0 (premier du parcours)</option>
                <option value="0">0</option>
                <option value="1">1</option>
              </GLSelect>
            </GLField>
          ) : null}
        </div>
        {editGameForm.boardMovementMode === 'numbered_path' ? (
          <p className="gl-hint">
            Les repères sont numérotés selon leur ordre sur la carte. Au démarrage, chaque équipe
            est placée sur le repère de départ ; le MJ avance avec le dé virtuel (score = nombre de
            cases).
          </p>
        ) : null}
        {!canEditGameChapter(gameStatus) ? (
          <p className="gl-hint">Chapitre modifiable uniquement en brouillon ou pause.</p>
        ) : null}
        {!canEditGameClass(gameStatus) ? (
          <p className="gl-hint">
            Classe modifiable uniquement en brouillon (sans joueurs assignés).
          </p>
        ) : null}
      </form>
    </div>
  );
}
