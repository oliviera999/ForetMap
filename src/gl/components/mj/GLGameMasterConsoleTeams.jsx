import React from 'react';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { GLGameRosterPanel } from '../admin/GLGameRosterPanel.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLDataList } from '../ui/GLDataList.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

export default function GLGameMasterConsoleTeams({
  game,
  teams,
  teamForm,
  setTeamForm,
  editingTeamId,
  selectableMascots,
  defaultMascotByType,
  addTeam,
  upsertTeam,
  resetTeamEditing,
  teamListRows,
  rosterRefreshKey,
  vitalityEnabled,
  canImpersonate,
  onImpersonationApplied,
  onReloadGame,
  setRosterRefreshKey,
  onGoToParties,
  busy,
  teamSaveStatus = 'idle',
  teamSaveError = '',
}) {
  if (!game?.id) {
    return (
      <div className="gl-empty-state">
        <span className="gl-empty-state-icon foretmap-emoji-text-mixed" aria-hidden="true">
          🎲
        </span>
        <p>Sélectionnez ou créez une partie dans l’onglet « Parties ».</p>
        <GLButton type="button" variant="secondary" onClick={onGoToParties}>
          Aller aux parties
        </GLButton>
      </div>
    );
  }

  return (
    <>
      <div className="gl-gameplay-block">
        <h3>
          Équipes de la partie « {game.name} » (#{game.id})
        </h3>
        <div className="gl-inline-actions">
          <GLButton type="button" size="sm" onClick={() => addTeam('gnome')} disabled={busy}>
            Ajouter équipe Gnome
          </GLButton>
          <GLButton
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => addTeam('unicorn')}
            disabled={busy}
          >
            Ajouter équipe Licorne
          </GLButton>
        </div>

        <form className="gl-form" onSubmit={upsertTeam}>
          <h4>{editingTeamId ? 'Modifier une équipe' : 'Nouvelle équipe'}</h4>
          <div className="gl-admin-grid-2">
            <GLField label="Nom">
              <GLInput
                value={teamForm.name}
                onChange={(event) => setTeamForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </GLField>
            <GLField label="Type">
              <GLSelect
                value={teamForm.type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  setTeamForm((prev) => ({
                    ...prev,
                    type: nextType,
                    mascotId: defaultMascotByType(nextType),
                  }));
                }}
              >
                <option value="gnome">Gnome</option>
                <option value="unicorn">Licorne</option>
              </GLSelect>
            </GLField>
            <GLField label="Mascotte">
              <GLSelect
                value={teamForm.mascotId}
                onChange={(event) =>
                  setTeamForm((prev) => ({ ...prev, mascotId: event.target.value }))
                }
                disabled={selectableMascots.length === 0}
              >
                {selectableMascots.length === 0 ? (
                  <option value="">Chargement du catalogue…</option>
                ) : null}
                {selectableMascots.map((mascot) => (
                  <option key={mascot.id} value={mascot.id}>
                    {mascot.label}
                    {mascot.source === 'foretmap' ? ' (ForetMap)' : ''}
                  </option>
                ))}
              </GLSelect>
            </GLField>
            <GLField label="Couleur">
              <GLInput
                value={teamForm.color}
                onChange={(event) =>
                  setTeamForm((prev) => ({ ...prev, color: event.target.value }))
                }
                placeholder="#22c55e"
              />
            </GLField>
          </div>
          {teamSaveError ? <p className="gl-error">{teamSaveError}</p> : null}
          <AutoSaveStatus status={teamSaveStatus} className="gl-hint" />
          <div className="gl-inline-actions">
            {editingTeamId ? (
              <GLButton
                type="button"
                variant="secondary"
                onClick={resetTeamEditing}
                disabled={busy}
              >
                Annuler édition
              </GLButton>
            ) : null}
          </div>
        </form>

        {teams.length > 0 ? (
          <GLDataList
            columns={[
              { key: 'name', label: 'Nom' },
              { key: 'type', label: 'Type' },
              { key: 'mascot', label: 'Mascotte' },
              { key: 'color', label: 'Couleur' },
              { key: 'actions', label: 'Actions' },
            ]}
            emptyLabel="Aucune équipe."
            rows={teamListRows}
          />
        ) : (
          <p className="gl-hint">Aucune équipe pour cette partie.</p>
        )}
      </div>

      <GLGameRosterPanel
        gameId={game.id}
        teams={teams}
        refreshKey={rosterRefreshKey}
        vitalityEnabled={vitalityEnabled}
        canImpersonate={canImpersonate}
        onImpersonationApplied={onImpersonationApplied}
        onRosterChanged={async () => {
          await onReloadGame?.();
          setRosterRefreshKey((value) => value + 1);
        }}
      />
    </>
  );
}
