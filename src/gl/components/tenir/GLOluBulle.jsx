/**
 * Bulle d'Olu commentateur (« Tenir à deux ») : une ligne par événement, cachée tant qu'Olu
 * est figé (passage de l'oiseau). Aucun texte n'est inventé côté client hors repli.
 */
export function GLOluBulle({ line, speakerName = 'OLU', frozen = false }) {
  if (!line || frozen) return null;
  return (
    <p
      className={`gl-olu-bulle gl-olu-bulle--${line.expression || 'neutre'}`}
      role="status"
      data-testid="gl-olu-bulle"
      data-moment={line.moment || ''}
    >
      {speakerName ? <strong>{speakerName} : </strong> : null}
      {line.texte}
    </p>
  );
}
