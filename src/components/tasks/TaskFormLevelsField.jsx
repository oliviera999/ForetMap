import React from 'react';

/**
 * Ligne « Niveaux » du formulaire de tâche (feuille prop-driven).
 *
 * Extrait de `TaskFormModal` (O6) : les trois sélecteurs « Niveau de danger »,
 * « Niveau de difficulté » et « Degré d'importance ». Les valeurs courantes
 * (`dangerLevel`/`difficultyLevel`/`importanceLevel`) et les handlers
 * (`onDangerChange`/`onDifficultyChange`/`onImportanceChange`) restent détenus
 * par le parent.
 */
export function TaskFormLevelsField({
  dangerLevel = '',
  difficultyLevel = '',
  importanceLevel = '',
  onDangerChange,
  onDifficultyChange,
  onImportanceChange,
}) {
  return (
    <div className="row">
      <div className="field"><label>Niveau de danger</label>
        <select value={dangerLevel} onChange={onDangerChange}>
          <option value="">Non renseigné</option>
          <option value="safe">Sans danger</option>
          <option value="potential_danger">Danger potentiel</option>
          <option value="dangerous">Dangereux</option>
          <option value="very_dangerous">Très dangereux</option>
        </select>
      </div>
      <div className="field"><label>Niveau de difficulté</label>
        <select value={difficultyLevel} onChange={onDifficultyChange}>
          <option value="">Non renseigné</option>
          <option value="easy">Facile</option>
          <option value="medium">Moyen</option>
          <option value="hard">Compliqué</option>
          <option value="very_hard">Super compliqué</option>
        </select>
      </div>
      <div className="field"><label>Degré d&apos;importance</label>
        <select value={importanceLevel} onChange={onImportanceChange}>
          <option value="">Non renseigné</option>
          <option value="not_important">Pas important</option>
          <option value="low">Peu important</option>
          <option value="medium">Modéré</option>
          <option value="high">Important</option>
          <option value="absolute">Urgent !</option>
        </select>
      </div>
    </div>
  );
}
