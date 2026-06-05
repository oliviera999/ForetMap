import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import { GLDataList } from '../ui/GLDataList.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

export default function GLGameMasterConsoleParties({
  showCreateForm,
  setShowCreateForm,
  createName,
  setCreateName,
  createClassId,
  setCreateClassId,
  createChapterId,
  setCreateChapterId,
  activeClasses,
  chapters,
  gamesClassFilter,
  setGamesClassFilter,
  gamesStatusFilter,
  setGamesStatusFilter,
  loadGames,
  createGame,
  gameListRows,
  busy,
}) {
  return (
    <div className="gl-gameplay-block">
      <h3>Parties</h3>
      <div className="gl-mj-create-toggle">
        <GLButton
          type="button"
          variant="secondary"
          onClick={() => setShowCreateForm((value) => !value)}
        >
          {showCreateForm ? 'Masquer le formulaire' : 'Nouvelle partie'}
        </GLButton>
      </div>
      {showCreateForm ? (
        <form onSubmit={createGame} className="gl-form">
          <GLField label="Nom de partie">
            <GLInput value={createName} onChange={(event) => setCreateName(event.target.value)} />
          </GLField>
          <GLField label="Classe">
            <GLSelect value={createClassId} onChange={(event) => setCreateClassId(event.target.value)}>
              <option value="">Choisir</option>
              {activeClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.school ? ` (${item.school})` : ''}
                </option>
              ))}
            </GLSelect>
          </GLField>
          {activeClasses.length === 0 ? (
            <p className="gl-hint">
              Aucune classe active. Créez-en une dans l’onglet « Gestion utilisateurs ».
            </p>
          ) : null}
          <GLField label="Chapitre">
            <GLSelect value={createChapterId} onChange={(event) => setCreateChapterId(event.target.value)}>
              <option value="">Choisir</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
              ))}
            </GLSelect>
          </GLField>
          <GLButton type="submit" disabled={busy}>Créer une partie</GLButton>
        </form>
      ) : null}

      <div className="gl-toolbar">
        <GLField label="Classe">
          <GLSelect value={gamesClassFilter} onChange={(event) => setGamesClassFilter(event.target.value)}>
            <option value="">Toutes</option>
            {activeClasses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </GLSelect>
        </GLField>
        <GLField label="Statut">
          <GLSelect value={gamesStatusFilter} onChange={(event) => setGamesStatusFilter(event.target.value)}>
            <option value="">Tous</option>
            <option value="draft">Brouillon</option>
            <option value="live">En cours</option>
            <option value="paused">Pause</option>
            <option value="ended">Terminée</option>
          </GLSelect>
        </GLField>
        <GLButton type="button" variant="secondary" size="sm" onClick={loadGames} disabled={busy}>
          Rafraîchir
        </GLButton>
      </div>

      <GLDataList
        columns={[
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Partie' },
          { key: 'class', label: 'Classe' },
          { key: 'status', label: 'Statut' },
          { key: 'teams', label: 'Équipes' },
          { key: 'actions', label: 'Actions' },
        ]}
        emptyLabel="Aucune partie."
        rows={gameListRows}
      />
    </div>
  );
}
