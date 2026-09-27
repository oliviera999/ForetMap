import {
  TASK_DANGER_LEVEL_ENUM,
  TASK_DIFFICULTY_LEVEL_ENUM,
  TASK_IMPORTANCE_LEVEL_ENUM,
} from '../../shared/enums/taskEnums.js';

/** Options d'un niveau : « Non renseigné » (valeur vide), puis celles du référentiel. */
function LevelOptions({ def }) {
  return (
    <>
      <option value="">Non renseigné</option>
      {def.values.map((value) => (
        <option key={value} value={value}>
          {def.labels[value]}
        </option>
      ))}
    </>
  );
}

/**
 * Ligne « Niveaux » du formulaire de tâche (feuille prop-driven).
 *
 * Extrait de `TaskFormModal` (O6) : les trois sélecteurs « Niveau de danger »,
 * « Niveau de difficulté » et « Degré d'importance ». Les valeurs courantes
 * (`dangerLevel`/`difficultyLevel`/`importanceLevel`) et les handlers
 * (`onDangerChange`/`onDifficultyChange`/`onImportanceChange`) restent détenus
 * par le parent. Valeurs et libellés : référentiel partagé des ENUM
 * (`src/shared/enums/taskEnums.js`), les mêmes que les contraintes de la base.
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
      <div className="field">
        <label>Niveau de danger</label>
        <select value={dangerLevel} onChange={onDangerChange}>
          <LevelOptions def={TASK_DANGER_LEVEL_ENUM} />
        </select>
      </div>
      <div className="field">
        <label>Niveau de difficulté</label>
        <select value={difficultyLevel} onChange={onDifficultyChange}>
          <LevelOptions def={TASK_DIFFICULTY_LEVEL_ENUM} />
        </select>
      </div>
      <div className="field">
        <label>Degré d&apos;importance</label>
        <select value={importanceLevel} onChange={onImportanceChange}>
          <LevelOptions def={TASK_IMPORTANCE_LEVEL_ENUM} />
        </select>
      </div>
    </div>
  );
}
